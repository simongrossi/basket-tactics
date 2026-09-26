// P4.4 — Mémoire d'intention défensive : une rotation commencée se termine.
//
// Sans mémoire, chaque étape recalcule la défense à froid : dès que l'écran
// n'est plus lu, le low man qui taggait le roller repart sur son homme, le
// X-out et le stunt aussi, et le roller se retrouve seul sous le cercle
// (mesuré sur « PNR central » : roller à 105 px du panier, tagueur à 55 px
// qui s'en va, pivot 70 px derrière).
//
// Ce module est PUR. L'état « persistant » n'est jamais stocké dans
// l'AppState : il est dérivé de `computeDefenseTargets(N-1)`, déjà calculé
// par `buildDefenseFrameContext` pour la détection d'écran. Pas d'appel
// supplémentaire, pas de récursion nouvelle (index décroissant, arrêt à 0),
// scrub et lecture déterministes.
//
// Trois mécanismes :
//  1. Rotate-and-stay : le tagueur garde le roller, le défenseur du poseur
//     (« big ») prend l'homme laissé par le tagueur. Échange de duels porté
//     d'étape en étape via `DefenseTargetsResult.rotationSwaps`.
//  2. Retour au calme : l'échange se défait quand le ballon est ressorti,
//     sans drive, et que les deux défenseurs sont assez proches pour
//     rééchanger sans laisser personne seul.
//  3. Fin de rotation progressive : un défenseur qui était en tag / X-out /
//     stunt et qui n'a plus de rôle revient à mi-chemin sur une étape au lieu
//     de repartir d'un coup (cf. `rotationMemoryLayer.ts`).

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Matchups,
  Point,
  RotationMemoryMode,
} from '../../types';
import { distance } from '../geometry';
import {
  ROTATION_CALM_BALL_DIST_PX,
  ROTATION_ROLL_ZONE_PX,
  ROTATION_SCRAMBLE_DIST_PX,
  ROTATION_STAY_MARGIN_PX,
} from './constants';

/** Tag observé sur une étape : qui taggait qui, et qui gardait le roller. */
export interface PnrTagRecord {
  /** Low man qui tag le roller. */
  tagger: DefenderId;
  /** Poseur qui roule vers le panier. */
  roller: AttackerId;
  /** Défenseur du poseur (le « big » qui a montré ou droppé). */
  bigDef: DefenderId;
  /** Homme du tagueur, laissé libre pendant le tag. */
  orphan: AttackerId;
}

/** Échange de duels issu d'une rotation, porté d'étape en étape. */
export interface RotationSwap extends PnrTagRecord {
  /** Étape où l'échange a été décidé. */
  since: number;
}

/** Sortie de la mémoire pour une étape, lue par l'étape suivante. */
export interface RotationMemoryOutput {
  swaps: RotationSwap[];
  pnrTag?: PnrTagRecord;
}

/** Vrai si les matchups sont encore ceux d'avant l'échange (personne
 *  d'autre n'a switché entre-temps). Sinon l'échange est abandonné. */
function swapStillApplicable(matchups: Matchups, swap: PnrTagRecord): boolean {
  return matchups[swap.tagger] === swap.orphan && matchups[swap.bigDef] === swap.roller;
}

/** Applique un échange sur les matchups (mutation locale à l'étape). */
export function applyRotationSwap(matchups: Matchups, swap: PnrTagRecord): void {
  matchups[swap.tagger] = swap.roller;
  matchups[swap.bigDef] = swap.orphan;
}

/**
 * Retour au calme : le ballon est ressorti (au-delà de ~6 m du panier),
 * aucun drive / post / pénétration en cours, et les deux défenseurs échangés
 * sont assez proches l'un de l'autre pour se rendre leurs hommes.
 */
export function isCalmForScramble(params: {
  carrierPos: Point | undefined;
  hoop: Point;
  triggerActive: boolean;
  taggerPos: Point | undefined;
  bigDefPos: Point | undefined;
}): boolean {
  const { carrierPos, hoop, triggerActive, taggerPos, bigDefPos } = params;
  if (triggerActive) return false;
  if (!carrierPos || !taggerPos || !bigDefPos) return false;
  if (distance(carrierPos, hoop) < ROTATION_CALM_BALL_DIST_PX) return false;
  return distance(taggerPos, bigDefPos) <= ROTATION_SCRAMBLE_DIST_PX;
}

/**
 * Reporte les échanges de l'étape précédente sur les matchups de l'étape
 * courante, sauf ceux qui se défont au retour au calme.
 */
export function carryRotationSwaps(
  prevSwaps: readonly RotationSwap[],
  matchups: Matchups,
  params: {
    carrierPos: Point | undefined;
    hoop: Point;
    triggerActive: boolean;
    prevPositions: DefenderPositions;
  }
): { kept: RotationSwap[]; scrambled: RotationSwap[] } {
  const kept: RotationSwap[] = [];
  const scrambled: RotationSwap[] = [];
  for (const swap of prevSwaps) {
    if (!swapStillApplicable(matchups, swap)) continue;
    const calm = isCalmForScramble({
      carrierPos: params.carrierPos,
      hoop: params.hoop,
      triggerActive: params.triggerActive,
      taggerPos: params.prevPositions[swap.tagger],
      bigDefPos: params.prevPositions[swap.bigDef],
    });
    if (calm) {
      scrambled.push(swap);
      continue;
    }
    applyRotationSwap(matchups, swap);
    kept.push(swap);
  }
  return { kept, scrambled };
}

/**
 * Décide si le tagueur garde le roller (rotate-and-stay) une fois l'écran
 * terminé.
 *  - `stay`    : toujours.
 *  - `recover` : jamais.
 *  - `auto`    : le roller est encore dans la zone du cercle ET le tagueur
 *                en est nettement plus proche que le défenseur du poseur.
 */
export function shouldTaggerStay(
  mode: RotationMemoryMode,
  tag: PnrTagRecord,
  params: {
    off: AttackerPositions;
    hoop: Point;
    prevPositions: DefenderPositions;
  }
): boolean {
  if (mode === 'recover') return false;
  const rollerPos = params.off[tag.roller];
  if (!rollerPos) return false;
  if (mode === 'stay') return true;
  if (distance(rollerPos, params.hoop) > ROTATION_ROLL_ZONE_PX) return false;
  const taggerPos = params.prevPositions[tag.tagger];
  const bigPos = params.prevPositions[tag.bigDef];
  if (!taggerPos || !bigPos) return false;
  return distance(taggerPos, rollerPos) + ROTATION_STAY_MARGIN_PX < distance(bigPos, rollerPos);
}

/**
 * Nouvel échange à l'étape `stepIdx` à partir du tag de l'étape précédente,
 * ou null. Ne décide rien si l'écran continue sur le même roller (le tag est
 * alors recalculé normalement) ou si un des deux défenseurs est déjà pris
 * dans un autre échange / switch.
 */
export function decideRotationSwap(
  mode: RotationMemoryMode,
  prevTag: PnrTagRecord | undefined,
  matchups: Matchups,
  params: {
    stepIdx: number;
    off: AttackerPositions;
    hoop: Point;
    prevPositions: DefenderPositions;
    /** Défenseurs déjà impliqués dans un écran / switch à cette étape. */
    busyDefenders: ReadonlySet<DefenderId>;
    /** Poseur de l'écran porteur lu à cette étape, s'il y en a un. */
    currentScreener?: AttackerId;
  }
): RotationSwap | null {
  if (!prevTag) return null;
  if (params.currentScreener === prevTag.roller) return null;
  if (params.busyDefenders.has(prevTag.tagger) || params.busyDefenders.has(prevTag.bigDef)) return null;
  if (!swapStillApplicable(matchups, prevTag)) return null;
  if (!shouldTaggerStay(mode, prevTag, params)) return null;
  return { ...prevTag, since: params.stepIdx };
}
