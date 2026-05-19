// Path-Aware Interpolation (PAI) — V1 conservative.
//
// Statut : opt-in via `state.pathAwareInterpolation` (default false).
//
// Le problème :
// Entre 2 step targets (qui respectent la clearance par construction),
// le rendu `frameResolver` interpole les positions de chaque joueur en
// **ligne droite**. Si la trajectoire linéaire d'un joueur passe à
// moins de `MIN_PLAYER_CLEARANCE_PX` d'un autre joueur lui-même
// interpolé à la même frame, on observe visuellement une traversée
// (le moteur final `resolvePlayerCollisions` corrige PAR STEP mais
// pas par frame).
//
// Le système existant a `curveAroundObstacle` pour cut/idle/dribble
// d'attaquants et `pushOutOfScreenContact` pour les défenseurs en
// contact d'écran détecté. PAI couvre le **trou** : tous les autres
// joueurs (défenseurs hors-écran, attaquants en `screen` ou `pass`).
//
// Algorithme V1 conservative :
// 1. Reçoit toutes les positions interpolées (linéaires) à la frame courante.
// 2. Pour chaque paire (i, j) non skippée :
//    - Si `dist(i, j) < MIN_PLAYER_CLEARANCE_PX + PAI_NEAR_MISS_BUFFER_PX`,
//      applique une déviation tangentielle aux deux, cappée à
//      `PAI_MAX_DEVIATION_PER_FRAME_PX`.
// 3. La déviation pousse perpendiculaire à la ligne i↔j, du côté qui
//    sépare les deux joueurs.
//
// Skip rules (préservation invariants existants) :
// - `attackerIsScreening[id] === true` → poseur planté (Règle 1bis :
//   "Poseur set = obstacle solide", il reste à `ann.to`).
// - `lockedDefenders.has(id)` → défenseur en contact d'écran
//   (Règle 1bis : "D1 stuck au poseur à q=100", géré par
//   `pushOutOfScreenContact` ailleurs).
//
// Le moteur final `resolvePlayerCollisions` (au step suivant) reste
// le filet de sécurité dur : PAI agit en amont pour adoucir, mais ne
// remplace pas la garantie de clearance dure.

import type { AttackerId, AttackerPositions, DefenderId, Point } from '../../types';
import { MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';

/** Buffer au-delà de la clearance dans lequel on commence à dévier
 *  tangentiellement. clearance + buffer = 34 + 8 = 42 px. */
export const PAI_NEAR_MISS_BUFFER_PX = 8;

/** Cap dur de la déviation appliquée par frame, par joueur. Très serré
 *  pour ne pas perturber visuellement les trajectoires globales. */
export const PAI_MAX_DEVIATION_PER_FRAME_PX = 4;

export interface PaiPlayerInput {
  /** AttackerId | DefenderId — clé unique. */
  id: string;
  /** Position interpolée linéaire (entrée). */
  pos: Point;
  /** Vrai si ce joueur est exclu de la déviation (poseur planté ou
   *  défenseur stuck d'écran). */
  pinned: boolean;
}

export interface PaiOutput {
  attackers: AttackerPositions;
  defenders: Record<DefenderId, Point>;
  /** Nombre de paires near-miss détectées (pour debug/profiling). */
  pairsDeflected: number;
}

/**
 * Applique la déviation tangentielle aux paires de joueurs trop proches
 * à la frame courante. Préserve les joueurs pinned (poseurs + défenseurs
 * stuck).
 *
 * Retourne les positions corrigées + le nombre de paires déviées.
 */
export function applyPathAwareInterpolation(
  attackers: AttackerPositions,
  defenders: Record<DefenderId, Point>,
  attackerIsScreening: Partial<Record<AttackerId, boolean>>,
  lockedDefenders: ReadonlySet<DefenderId>,
): PaiOutput {
  const threshold = MIN_PLAYER_CLEARANCE_PX + PAI_NEAR_MISS_BUFFER_PX;
  const players: PaiPlayerInput[] = [];

  (Object.keys(attackers) as AttackerId[]).forEach((id) => {
    const p = attackers[id];
    if (!p) return;
    players.push({
      id,
      pos: { x: p.x, y: p.y },
      pinned: attackerIsScreening[id] === true,
    });
  });
  (Object.keys(defenders) as DefenderId[]).forEach((id) => {
    const p = defenders[id];
    if (!p) return;
    players.push({
      id,
      pos: { x: p.x, y: p.y },
      pinned: lockedDefenders.has(id),
    });
  });

  let pairsDeflected = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      // Si les deux sont pinned, rien à faire.
      if (a.pinned && b.pinned) continue;

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d >= threshold) continue;
      if (d < 1e-6) continue; // dégénéré, le solveur final s'en occupe

      // Magnitude de déviation décroissante : 0 à threshold, max au contact.
      // (1 - d/threshold) ∈ [0, 1].
      const intensity = 1 - d / threshold;
      const dev = Math.min(intensity * PAI_MAX_DEVIATION_PER_FRAME_PX, PAI_MAX_DEVIATION_PER_FRAME_PX);
      if (dev < 0.01) continue;

      // Direction radiale séparant a et b.
      const ux = dx / d;
      const uy = dy / d;

      // Si un seul est pinned, l'autre se déplace de `dev`. Sinon les deux
      // se déplacent de `dev/2` chacun (split symétrique de la séparation).
      if (a.pinned) {
        b.pos.x += ux * dev;
        b.pos.y += uy * dev;
      } else if (b.pinned) {
        a.pos.x -= ux * dev;
        a.pos.y -= uy * dev;
      } else {
        const half = dev / 2;
        a.pos.x -= ux * half;
        a.pos.y -= uy * half;
        b.pos.x += ux * half;
        b.pos.y += uy * half;
      }
      pairsDeflected++;
    }
  }

  // Reconstruction des maps de sortie.
  const outAttackers: AttackerPositions = { ...attackers };
  const outDefenders: Record<DefenderId, Point> = { ...defenders };
  players.forEach((p) => {
    if (p.id in outAttackers) {
      outAttackers[p.id as AttackerId] = { x: p.pos.x, y: p.pos.y };
    } else if (p.id in outDefenders) {
      outDefenders[p.id as DefenderId] = { x: p.pos.x, y: p.pos.y };
    }
  });

  return {
    attackers: outAttackers,
    defenders: outDefenders,
    pairsDeflected,
  };
}
