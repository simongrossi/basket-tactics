// Phase I — B2 : décideur des 4 joueurs off-ball pendant la game loop.
//
// Chaque off-ball (= non-porteur) peut être dans 1 des 4 états :
//  - idle : pas de raison de bouger, position figée
//  - space-drift : drift lent vers le slot de spacing optimal calculé par
//    `computeOffBallPositions`. Skip si déjà proche (seuil DRIFT_SKIP_PX).
//  - cut : sprint vers le panier puis sortie vers un corner faible.
//    Déclenché quand le défenseur a le regard détourné ET un sag > 80 px,
//    avec probabilité CUT_PROBABILITY (5 % par décision, ~1 cut/possession
//    en moyenne avec 4 joueurs × 5 décisions par 24s).
//  - relocate : après une passe, remplir le slot vacant. Géré par la game
//    loop quand elle détecte un changement de porteur.
//
// V1 : pas d'écrans off-ball, pas de coordination team-level (juste un
// budget "max 1 cut actif").

import type {
  AttackerId,
  AttackerPositions,
  AttackerProfiles,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import { distance } from '@/lib/logic/geometry';
import { computeOffBallPositions } from '@/lib/logic/autoOffense';

// ============================================================
// Constantes
// ============================================================

/** Tous les `DECISION_INTERVAL_TICKS` ticks, on (re)décide l'intent
 *  de chaque off-ball. À 30 Hz et 30 ticks, c'est 1 décision / seconde
 *  par joueur. Plus humain que "décision chaque tick". */
export const DECISION_INTERVAL_TICKS = 30;

/** Probabilité par décision qu'un off-ball "éligible" se lance dans
 *  un cut. Éligible = défenseur regard détourné ET sag suffisant.
 *  5 % × ~5 décisions/possession × 4 joueurs ≈ 1 cut / possession en
 *  moyenne, ce qui est entre "basket-réel rare" et "démonstratif". */
const CUT_PROBABILITY = 0.05;

/** Au-delà de cet écart angulaire (degrés) entre le regard défensif
 *  et la direction défenseur → attaquant, on considère que le défenseur
 *  n'a PAS la vision sur l'off-ball. C'est le trigger principal pour
 *  un cut "back-door" en basket réel. */
const VISION_DEVIATION_DEG_THRESHOLD = 60;

/** Sag minimal du défenseur (px) pour qu'un cut soit "éligible".
 *  Sous ce seuil, le défenseur est trop près pour qu'un cut ait du sens. */
const SAG_MIN_PX_FOR_CUT = 80;

/** Si l'off-ball est déjà à < DRIFT_SKIP_PX de son slot idéal, on ne
 *  drift PAS. Respecte le placement coach (option C choisi par défaut). */
const DRIFT_SKIP_PX = 50;

/** Vitesse de drift en spacing (px / tick) à 30 Hz. 0.5 px/tick =
 *  15 px/s ≈ 0.4 m/s, vitesse de "drift" tactique lent. */
const DRIFT_SPEED_PX = 0.5;

/** Vitesse de cut (px / tick) à 30 Hz. 4 px/tick = 120 px/s ≈ 3.2 m/s,
 *  sprint réaliste pour un cut basket. */
const CUT_SPEED_PX = 4;

/** Distance (px) en-dessous de laquelle on considère un cutter "arrivé"
 *  à son target courant et on passe à la phase suivante du cut. */
const PHASE_THRESHOLD_PX = 30;

/** Vitesse de relocate après passe (px / tick) à 30 Hz. 1.3 px/tick
 *  ≈ 39 px/s, ~1 m/s — plus rapide que drift mais pas un sprint. */
const RELOCATE_SPEED_PX = 1.3;

/** Distance min entre 2 attaquants pendant les phases offBall.
 *  Aligné avec `MIN_PLAYER_CLEARANCE_PX`. */
const MIN_TEAMMATE_CLEARANCE_PX = 34;

// ============================================================
// Types
// ============================================================

export type OffBallIntent =
  | { kind: 'idle' }
  | { kind: 'space-drift'; target: Point }
  | { kind: 'cut'; phase: 'to-basket' | 'to-corner'; target: Point }
  | { kind: 'relocate'; target: Point };

export type OffBallIntents = Partial<Record<AttackerId, OffBallIntent>>;

export interface DecideOffBallParams {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  hoop: Point;
  rng: () => number;
  currentIntents: OffBallIntents;
  attackerProfiles?: AttackerProfiles;
}

export interface AdvanceOffBallParams {
  off: AttackerPositions;
  intents: OffBallIntents;
  hoop: Point;
}

// ============================================================
// Décideur — choisit un intent par off-ball
// ============================================================

/**
 * Réévalue l'intent de chaque off-ball. Appelé tous les
 * `DECISION_INTERVAL_TICKS` par la game loop.
 *
 * Règle de budget : max 1 cut actif dans l'équipe à la fois.
 * Si un cut est déjà en cours sur un autre joueur, on n'en lance pas
 * un deuxième cette décision (le drift prime).
 */
export function decideOffBallIntents(params: DecideOffBallParams): OffBallIntents {
  const { off, defPos, carrier, hoop, rng, currentIntents, attackerProfiles } = params;
  const next: OffBallIntents = {};
  // 1. Conserver les cuts en cours (ne pas les annuler à mi-chemin).
  let cutInFlight = false;
  (Object.keys(currentIntents) as AttackerId[]).forEach((id) => {
    const cur = currentIntents[id];
    if (cur?.kind === 'cut' || cur?.kind === 'relocate') {
      next[id] = cur;
      if (cur.kind === 'cut') cutInFlight = true;
    }
  });

  // 2. Calculer les slots de spacing idéaux pour décider du drift.
  const offBallSlots = computeOffBallPositions(off, carrier, hoop, attackerProfiles);
  const slotMap = new Map<AttackerId, Point>();
  offBallSlots.forEach((s) => slotMap.set(s.id, s.pos));

  // 3. Pour chaque non-carrier sans intent persistant, choisir.
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    if (id === carrier) return;
    if (next[id]) return; // déjà géré par cut/relocate en flight

    // Trigger de cut : défenseur regard détourné + sag suffisant.
    if (!cutInFlight && isCutTriggered(id, off, defPos, rng)) {
      cutInFlight = true;
      next[id] = {
        kind: 'cut',
        phase: 'to-basket',
        target: { ...hoop },
      };
      return;
    }

    // Sinon : drift vers le slot si éloigné, sinon idle.
    const slot = slotMap.get(id);
    const pos = off[id];
    if (!slot || !pos) {
      next[id] = { kind: 'idle' };
      return;
    }
    const distToSlot = distance(pos, slot);
    if (distToSlot < DRIFT_SKIP_PX) {
      next[id] = { kind: 'idle' };
    } else {
      next[id] = { kind: 'space-drift', target: slot };
    }
  });

  return next;
}

/**
 * Quand le porteur change (une passe vient d'arriver), déclenche
 * un relocate sur l'ancien porteur vers le slot vacant le plus
 * proche. Appelé directement par la game loop sur passe.
 */
export function triggerRelocateAfterPass(params: {
  previousCarrier: AttackerId;
  newCarrier: AttackerId;
  off: AttackerPositions;
  hoop: Point;
  attackerProfiles?: AttackerProfiles;
}): OffBallIntent | null {
  const { previousCarrier, newCarrier, off, hoop, attackerProfiles } = params;
  const slots = computeOffBallPositions(off, newCarrier, hoop, attackerProfiles);
  const slot = slots.find((s) => s.id === previousCarrier);
  if (!slot) return null;
  const pos = off[previousCarrier];
  if (!pos) return null;
  // Si l'ancien porteur est déjà à son slot, pas de relocate.
  if (distance(pos, slot.pos) < DRIFT_SKIP_PX) return null;
  return { kind: 'relocate', target: { ...slot.pos } };
}

// ============================================================
// Advance — fait avancer les positions selon l'intent
// ============================================================

/**
 * Avance la position de chaque off-ball selon son intent.
 * Mute `off` en place. Retourne aussi les intents potentiellement
 * mis à jour (ex : cut qui transitionne phase 'to-basket' → 'to-corner',
 * cut/relocate qui se termine).
 */
export function advanceOffBallIntents(params: AdvanceOffBallParams): {
  off: AttackerPositions;
  intents: OffBallIntents;
} {
  const off = { ...params.off };
  const intents: OffBallIntents = {};
  const { hoop } = params;

  (Object.keys(params.intents) as AttackerId[]).forEach((id) => {
    const intent = params.intents[id];
    const pos = off[id];
    if (!intent || !pos) return;

    if (intent.kind === 'idle') {
      intents[id] = intent;
      return;
    }

    if (intent.kind === 'space-drift') {
      const { target } = intent;
      const stepPos = stepTowards(pos, target, DRIFT_SPEED_PX);
      const finalPos = pushOutOfTeammates(stepPos, id, off);
      off[id] = finalPos;
      // Si arrivé au target, idle.
      intents[id] = distance(finalPos, target) < 4 ? { kind: 'idle' } : intent;
      return;
    }

    if (intent.kind === 'relocate') {
      const { target } = intent;
      const stepPos = stepTowards(pos, target, RELOCATE_SPEED_PX);
      const finalPos = pushOutOfTeammates(stepPos, id, off);
      off[id] = finalPos;
      intents[id] = distance(finalPos, target) < 4 ? { kind: 'idle' } : intent;
      return;
    }

    if (intent.kind === 'cut') {
      const { target } = intent;
      const stepPos = stepTowards(pos, target, CUT_SPEED_PX);
      const finalPos = pushOutOfTeammates(stepPos, id, off);
      off[id] = finalPos;
      // Transition phase 'to-basket' → 'to-corner' quand on arrive au panier.
      if (distance(finalPos, target) < PHASE_THRESHOLD_PX) {
        if (intent.phase === 'to-basket') {
          intents[id] = {
            kind: 'cut',
            phase: 'to-corner',
            target: weakSideCorner(hoop, pos),
          };
        } else {
          // Cut terminé, retour idle.
          intents[id] = { kind: 'idle' };
        }
      } else {
        intents[id] = intent;
      }
      return;
    }

    intents[id] = intent;
  });

  return { off, intents };
}

// ============================================================
// Helpers internes
// ============================================================

function isCutTriggered(
  attackerId: AttackerId,
  off: AttackerPositions,
  defPos: ComputedDefense,
  rng: () => number,
): boolean {
  // Convention V1 : Dk défend Ok par défaut (pas de gestion explicite
  // des switches dans cette V1 — B2 ne lit que les positions).
  const defenderId = ('D' + attackerId.slice(1)) as DefenderId;
  const def = defPos[defenderId];
  const att = off[attackerId];
  if (!def || !att) return false;

  // Sag : distance entre défenseur et son attaquant.
  const sag = distance({ x: def.x, y: def.y }, att);
  if (sag < SAG_MIN_PX_FOR_CUT) return false;

  // Vision : angle entre le regard du défenseur et la direction vers l'attaquant.
  const dxToAtt = att.x - def.x;
  const dyToAtt = att.y - def.y;
  const angleToAtt = Math.atan2(dyToAtt, dxToAtt) * 180 / Math.PI;
  const gaze = def.gazeOrientation;
  const dev = Math.abs(normalizeDeg(angleToAtt - gaze));
  if (dev < VISION_DEVIATION_DEG_THRESHOLD) return false;

  return rng() < CUT_PROBABILITY;
}

function normalizeDeg(deg: number): number {
  // Borne à [-180, 180]
  let d = deg % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

function stepTowards(from: Point, to: Point, maxStep: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep) return { x: to.x, y: to.y };
  return {
    x: from.x + (dx / d) * maxStep,
    y: from.y + (dy / d) * maxStep,
  };
}

function pushOutOfTeammates(
  pos: Point,
  selfId: AttackerId,
  off: AttackerPositions,
): Point {
  // Push-out anti-overlap simple : si on est trop proche d'un coéquipier,
  // on s'écarte radialement. Itère 3 passes max (chainage).
  let result = pos;
  for (let iter = 0; iter < 3; iter += 1) {
    let moved = false;
    (Object.keys(off) as AttackerId[]).forEach((otherId) => {
      if (otherId === selfId) return;
      const other = off[otherId];
      if (!other) return;
      const d = distance(result, other);
      if (d >= MIN_TEAMMATE_CLEARANCE_PX) return;
      if (d < 0.01) {
        // Confusion : pousse arbitrairement vers la droite.
        result = { x: other.x + MIN_TEAMMATE_CLEARANCE_PX, y: other.y };
        moved = true;
        return;
      }
      const k = MIN_TEAMMATE_CLEARANCE_PX / d;
      result = {
        x: other.x + (result.x - other.x) * k,
        y: other.y + (result.y - other.y) * k,
      };
      moved = true;
    });
    if (!moved) break;
  }
  return result;
}

function weakSideCorner(hoop: Point, cutterStartPos: Point): Point {
  // Corner faible = corner opposé au côté d'où venait le cutter.
  // Heuristique simple : si on est parti de x > 300 (côté droit),
  // on sort dans le corner gauche, et vice versa.
  const cornerY = hoop.y < 540 ? 100 : 980;
  const targetX = cutterStartPos.x > 300 ? 60 : 540;
  return { x: targetX, y: cornerY };
}
