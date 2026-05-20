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

/** Cap dur de la déviation TOTALE par joueur et par frame (toutes
 *  passes confondues). Serré pour ne pas perturber les trajectoires
 *  globales. Tunable via `state.paiMaxDeviation`. */
export const PAI_MAX_DEVIATION_PER_FRAME_PX = 6;

/** Nombre de passes de résolution par défaut. Le multi-passes (V1.5)
 *  résout les configurations EN CHAÎNE : après séparation de A↔B, B a
 *  pu se rapprocher de C — une 2ᵉ passe le détecte. Le cap total reste
 *  borné par `PAI_MAX_DEVIATION_PER_FRAME_PX` (clamp final). */
export const PAI_DEFAULT_PASSES = 3;

export interface PaiPlayerInput {
  /** AttackerId | DefenderId — clé unique. */
  id: string;
  /** Position interpolée linéaire (entrée). */
  pos: Point;
  /** Vrai si ce joueur est exclu de la déviation (poseur planté ou
   *  défenseur stuck d'écran). */
  pinned: boolean;
}

export interface PaiOptions {
  /** Cap dur de la déviation totale par joueur. Défaut
   *  `PAI_MAX_DEVIATION_PER_FRAME_PX`. */
  maxDeviation?: number;
  /** Nombre de passes de résolution. Défaut `PAI_DEFAULT_PASSES`. */
  passes?: number;
}

export interface PaiOutput {
  attackers: AttackerPositions;
  defenders: Record<DefenderId, Point>;
  /** Nombre de paires near-miss déviées (cumulé sur toutes les passes). */
  pairsDeflected: number;
}

/** Une passe de résolution : dévie toutes les paires near-miss in-place.
 *  Retourne le nombre de paires déviées (0 = convergé). */
function paiResolvePass(players: PaiPlayerInput[], threshold: number, passMaxDev: number): number {
  let deflected = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.pinned && b.pinned) continue;

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d >= threshold) continue;
      if (d < 1e-6) continue; // dégénéré, le solveur final s'en occupe

      // Magnitude décroissante : 0 à threshold, max au contact.
      const intensity = 1 - d / threshold;
      const dev = Math.min(intensity * passMaxDev, passMaxDev);
      if (dev < 0.01) continue;

      const ux = dx / d;
      const uy = dy / d;
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
      deflected++;
    }
  }
  return deflected;
}

/**
 * Applique la déviation tangentielle aux paires de joueurs trop proches
 * à la frame courante. Préserve les joueurs pinned (poseurs + défenseurs
 * stuck).
 *
 * V1.5 — multi-passes : itère la résolution jusqu'à `passes` fois (ou
 * jusqu'à convergence), puis clampe le déplacement TOTAL de chaque
 * joueur à `maxDeviation` vs sa position d'entrée. Le multi-passes
 * résout les chaînes de near-miss ; le clamp final garde le cap dur.
 */
export function applyPathAwareInterpolation(
  attackers: AttackerPositions,
  defenders: Record<DefenderId, Point>,
  attackerIsScreening: Partial<Record<AttackerId, boolean>>,
  lockedDefenders: ReadonlySet<DefenderId>,
  options: PaiOptions = {},
): PaiOutput {
  const maxDev = options.maxDeviation ?? PAI_MAX_DEVIATION_PER_FRAME_PX;
  const passes = Math.max(1, Math.round(options.passes ?? PAI_DEFAULT_PASSES));
  const threshold = MIN_PLAYER_CLEARANCE_PX + PAI_NEAR_MISS_BUFFER_PX;

  const players: PaiPlayerInput[] = [];
  const inputPos = new Map<string, Point>();

  (Object.keys(attackers) as AttackerId[]).forEach((id) => {
    const p = attackers[id];
    if (!p) return;
    players.push({ id, pos: { x: p.x, y: p.y }, pinned: attackerIsScreening[id] === true });
    inputPos.set(id, { x: p.x, y: p.y });
  });
  (Object.keys(defenders) as DefenderId[]).forEach((id) => {
    const p = defenders[id];
    if (!p) return;
    players.push({ id, pos: { x: p.x, y: p.y }, pinned: lockedDefenders.has(id) });
    inputPos.set(id, { x: p.x, y: p.y });
  });

  // Multi-passes : chaque passe est cappée à maxDev ; on arrête dès
  // qu'une passe ne dévie plus rien (convergence).
  let pairsDeflected = 0;
  for (let pass = 0; pass < passes; pass++) {
    const deflected = paiResolvePass(players, threshold, maxDev);
    pairsDeflected += deflected;
    if (deflected === 0) break;
  }

  // Clamp final du déplacement TOTAL par joueur (vs position d'entrée).
  for (const p of players) {
    const inp = inputPos.get(p.id);
    if (!inp) continue;
    const dx = p.pos.x - inp.x;
    const dy = p.pos.y - inp.y;
    const moved = Math.hypot(dx, dy);
    if (moved > maxDev && moved > 1e-6) {
      const k = maxDev / moved;
      p.pos.x = inp.x + dx * k;
      p.pos.y = inp.y + dy * k;
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

  return { attackers: outAttackers, defenders: outDefenders, pairsDeflected };
}
