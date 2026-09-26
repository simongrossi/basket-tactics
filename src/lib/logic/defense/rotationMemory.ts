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
// Quatre mécanismes :
//  1. Rotate-and-stay : le tagueur garde le roller, le défenseur du poseur
//     (« big ») prend l'homme laissé par le tagueur. Échange de duels porté
//     d'étape en étape via `DefenseTargetsResult.rotationSwaps`.
//  2. Retour au calme : l'échange se défait quand le ballon est ressorti,
//     sans drive, et que les deux défenseurs sont assez proches pour
//     rééchanger sans laisser personne seul.
//  3. Rotation en cascade : sur la passe vers l'homme laissé libre, le
//     défenseur du X-out, plus proche, fait le closeout ; celui qui devait
//     prendre l'homme libre prend à la place l'homme du X-out.
//  4. Fin de rotation progressive : un défenseur qui était en tag / X-out /
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

/** X-out observé sur une étape : le défenseur qui a glissé vers l'homme
 *  laissé libre par le tagueur. */
export interface XOutRecord {
  /** Défenseur qui fait le X-out. */
  xOutDef: DefenderId;
  /** Son homme, qu'il a lâché à moitié. */
  xOutMan: AttackerId;
  /** L'homme laissé libre par le tagueur, vers qui il a glissé. */
  orphan: AttackerId;
}

/** Échange de duels issu d'une rotation, porté d'étape en étape : `a`
 *  prend `aTakes` (l'homme de `b`), `b` prend `bTakes` (l'homme de `a`). */
export interface RotationSwap {
  a: DefenderId;
  aTakes: AttackerId;
  b: DefenderId;
  bTakes: AttackerId;
  /** `tag` : tagueur ↔ défenseur du poseur. `cascade` : X-out ↔ défenseur
   *  qui devait prendre l'homme libre. */
  kind: 'tag' | 'cascade';
  /** Étape où l'échange a été décidé. */
  since: number;
}

/** Sortie de la mémoire pour une étape, lue par l'étape suivante. */
export interface RotationMemoryOutput {
  swaps: RotationSwap[];
  pnrTag?: PnrTagRecord;
  xOut?: XOutRecord;
}

/** Échange « rotate-and-stay » : le tagueur prend le roller, le défenseur du
 *  poseur prend l'homme du tagueur. */
export function tagRotationSwap(tag: PnrTagRecord, since: number): RotationSwap {
  return { a: tag.tagger, aTakes: tag.roller, b: tag.bigDef, bTakes: tag.orphan, kind: 'tag', since };
}

/** Vrai si les matchups sont encore ceux d'avant l'échange (personne
 *  d'autre n'a switché entre-temps). Sinon l'échange est abandonné. */
function swapStillApplicable(matchups: Matchups, swap: RotationSwap): boolean {
  return matchups[swap.a] === swap.bTakes && matchups[swap.b] === swap.aTakes;
}

/** Applique un échange sur les matchups (mutation locale à l'étape). */
export function applyRotationSwap(matchups: Matchups, swap: RotationSwap): void {
  matchups[swap.a] = swap.aTakes;
  matchups[swap.b] = swap.bTakes;
}

/**
 * Retour au calme : le ballon est ressorti (au-delà de ~6 m du panier),
 * aucun drive / post / pénétration en cours, et chaque défenseur de la chaîne
 * de rotation est assez près de son homme d'origine pour le reprendre sans
 * laisser personne seul.
 */
export function isCalmForScramble(params: {
  carrierPos: Point | undefined;
  hoop: Point;
  triggerActive: boolean;
  /** Pour chaque défenseur de la chaîne : sa position et celle de son homme
   *  d'origine. */
  returns: ReadonlyArray<{ defenderPos: Point | undefined; originalManPos: Point | undefined }>;
}): boolean {
  const { carrierPos, hoop, triggerActive, returns } = params;
  if (triggerActive) return false;
  if (!carrierPos) return false;
  if (distance(carrierPos, hoop) < ROTATION_CALM_BALL_DIST_PX) return false;
  return returns.every(({ defenderPos, originalManPos }) =>
    !!defenderPos && !!originalManPos && distance(defenderPos, originalManPos) <= ROTATION_SCRAMBLE_DIST_PX);
}

/** Regroupe les échanges qui partagent un défenseur (tag + cascade forment
 *  une seule chaîne, défaite d'un bloc). Ordre d'origine conservé. */
function rotationChains(swaps: readonly RotationSwap[]): RotationSwap[][] {
  const chains: RotationSwap[][] = [];
  for (const swap of swaps) {
    const linked = chains.filter((c) => c.some((s) => [s.a, s.b].some((d) => d === swap.a || d === swap.b)));
    const merged = linked.flat();
    const rest = chains.filter((c) => !linked.includes(c));
    chains.length = 0;
    chains.push(...rest, [...merged, swap].sort((x, y) => swaps.indexOf(x) - swaps.indexOf(y)));
  }
  return chains.sort((x, y) => swaps.indexOf(x[0]) - swaps.indexOf(y[0]));
}

/**
 * Reporte les échanges de l'étape précédente sur les matchups de l'étape
 * courante, sauf les chaînes qui se défont au retour au calme. `matchups`
 * entre avec les duels d'origine (persistés) et ressort avec les échanges
 * maintenus appliqués.
 */
export function carryRotationSwaps(
  prevSwaps: readonly RotationSwap[],
  matchups: Matchups,
  params: {
    off: AttackerPositions;
    carrierPos: Point | undefined;
    hoop: Point;
    triggerActive: boolean;
    prevPositions: DefenderPositions;
  }
): { kept: RotationSwap[]; scrambled: RotationSwap[] } {
  const kept: RotationSwap[] = [];
  const scrambled: RotationSwap[] = [];
  const original: Matchups = { ...matchups };
  for (const chain of rotationChains(prevSwaps)) {
    const defenders = [...new Set(chain.flatMap((s) => [s.a, s.b]))];
    const calm = isCalmForScramble({
      carrierPos: params.carrierPos,
      hoop: params.hoop,
      triggerActive: params.triggerActive,
      returns: defenders.map((d) => ({
        defenderPos: params.prevPositions[d],
        originalManPos: params.off[original[d]],
      })),
    });
    // Rejoue la chaîne sur une copie : si un maillon n'est plus applicable
    // (switch intervenu entre-temps), toute la chaîne est abandonnée.
    const trial: Matchups = { ...matchups };
    const applicable = chain.every((swap) => {
      if (!swapStillApplicable(trial, swap)) return false;
      applyRotationSwap(trial, swap);
      return true;
    });
    if (!applicable) continue;
    if (calm) {
      scrambled.push(...chain);
      continue;
    }
    Object.assign(matchups, trial);
    kept.push(...chain);
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
  const swap = tagRotationSwap(prevTag, params.stepIdx);
  if (!swapStillApplicable(matchups, swap)) return null;
  if (!shouldTaggerStay(mode, prevTag, params)) return null;
  return swap;
}

/**
 * Rotation en cascade : le ballon arrive (à cette étape) sur l'homme laissé
 * libre par le tagueur. Si le défenseur du X-out en est nettement plus proche
 * que celui qui le marque maintenant (le tagueur qui revient, ou le défenseur
 * du poseur qui « aide l'aideur »), il fait le closeout et l'autre prend
 * l'homme du X-out. Jamais en mode `recover` (pas d'échange durable).
 */
export function decideCascadeSwap(
  mode: RotationMemoryMode,
  prevXOut: XOutRecord | undefined,
  matchups: Matchups,
  params: {
    stepIdx: number;
    off: AttackerPositions;
    ballCarrier: AttackerId;
    prevBallCarrier: AttackerId | undefined;
    prevPositions: DefenderPositions;
    busyDefenders: ReadonlySet<DefenderId>;
  }
): RotationSwap | null {
  if (mode === 'recover' || !prevXOut) return null;
  const { orphan, xOutDef, xOutMan } = prevXOut;
  // La passe arrive sur l'homme libre à cette étape.
  if (params.ballCarrier !== orphan || params.prevBallCarrier === orphan) return null;
  if (matchups[xOutDef] !== xOutMan) return null;
  const guard = (Object.keys(matchups) as DefenderId[]).find((d) => matchups[d] === orphan);
  if (!guard || guard === xOutDef) return null;
  if (params.busyDefenders.has(xOutDef) || params.busyDefenders.has(guard)) return null;
  const orphanPos = params.off[orphan];
  const xOutPos = params.prevPositions[xOutDef];
  const guardPos = params.prevPositions[guard];
  if (!orphanPos || !xOutPos || !guardPos) return null;
  if (distance(xOutPos, orphanPos) + ROTATION_STAY_MARGIN_PX >= distance(guardPos, orphanPos)) return null;
  return { a: xOutDef, aTakes: orphan, b: guard, bTakes: xOutMan, kind: 'cascade', since: params.stepIdx };
}
