// C.7 — Read offensive action chains : détection des SÉQUENCES tactiques
// (pas des écrans isolés). 3 patterns courants en V1 :
//
//   1. re-screen           : même paire (poseur, cutter) à 2 steps non
//                            consécutifs (= retour sur le même poseur). ≠
//                            snake dribble (B4) qui est sur 3 steps
//                            consécutifs et porteur uniquement.
//   2. stagger-sequential  : 2 poseurs DIFFÉRENTS successivement sur le
//                            même cutter en ≤ 2 steps. Action hors-ballon
//                            typique (Floppy, flex stagger).
//   3. flare-then-fade     : écran flare détecté au step N-1 puis cutter
//                            fade vers le coin au step N.
//
// Le pattern curl-then-recut (cutter qui oscille vers/loin/vers le panier)
// demande 4 steps pour être propre — exclu de V1, à ajouter en V2 si
// pertinent.
//
// ⚠ Helper PUR : pas d'appel à `computeDefenseTargets`. Utilise
// `approxDefenderPositions` (positions overrides / homepos) pour les
// détections cross-step. Évite la récursion et reste léger.
//
// Note : `stagger-sequential` recouvre partiellement la détection
// `cuttersInScreenChain` de B9 (qui top-locke automatiquement). C.7 V1 ne
// fait que du DIAGNOSTIC (badge UI + règle coach). La réaction défensive
// (V2 éventuelle via `chainResponseLayer`) sera no-op sur ce pattern car
// déjà couverte par B9.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  DetectedOffBallScreen,
  DetectedScreen,
  Matchups,
  Point,
} from '../../types';
import { initialDef } from '../../data/initial';
import {
  activeBallCarrier,
  activeOffense,
  getActiveDefenderIds,
} from '../players';
import { getMatchupsAt, getDefenseHoop } from '../engine';
import { distance } from '../geometry';
import { detectScreen } from './detectCarrierScreen';
import { detectOffBallScreens } from './detectOffBallScreens';

export type ScreenChainType =
  | 're-screen'
  | 'stagger-sequential'
  | 'flare-then-fade';

export interface ScreenChain {
  type: ScreenChainType;
  /** Joueur qui bénéficie de la chaîne (porteur pour re-screen, cutter pour les autres). */
  cutter: AttackerId;
  /** Poseur(s) impliqué(s) — 1 pour re-screen, 2 pour stagger. */
  screeners: AttackerId[];
  /** Indices des steps clés. Utile pour debug + diagnostic coach. */
  steps: number[];
}

interface StepDetections {
  carrier: DetectedScreen | null;
  offBall: DetectedOffBallScreen[];
}

/**
 * Détecte une chaîne d'écrans active au step `stepIdx`. Regarde les 3
 * derniers steps (N-2, N-1, N) au maximum.
 *
 * Priorité : retourne la PREMIÈRE chaîne identifiée dans l'ordre :
 * re-screen > stagger-sequential > flare-then-fade > curl-then-recut.
 *
 * Retourne `null` si aucune chaîne.
 */
export function detectScreenChain(state: AppState, stepIdx: number): ScreenChain | null {
  // Lookback 3 steps : si stepIdx < 2, pas assez d'historique.
  if (stepIdx < 2) return null;

  // Précalcul des détections d'écrans sur les 3 derniers steps.
  const detections: StepDetections[] = [];
  for (let i = stepIdx - 2; i <= stepIdx; i++) {
    detections.push(detectionsAt(state, i));
  }

  // Ordre : du plus spécifique au plus général.
  return (
    detectReScreenPattern(detections, stepIdx) ??
    detectStaggerSequentialPattern(detections, stepIdx) ??
    detectFlareThenFadePattern(state, detections, stepIdx)
  );
}

// =====================================================================
// Pattern 1 : re-screen
// =====================================================================

/** Vrai si écran (`screener`, `cutter`) actif à `detections[idx]`. */
function carrierMatch(d: DetectedScreen | null, screener: AttackerId, carrier: AttackerId): boolean {
  return !!d && d.screener === screener && d.carrier === carrier;
}

function offBallMatch(d: DetectedOffBallScreen[], screener: AttackerId, cutter: AttackerId): boolean {
  return d.some((s) => s.screener === screener && s.cutter === cutter);
}

function detectReScreenPattern(
  detections: StepDetections[],
  stepIdx: number
): ScreenChain | null {
  // detections[0]=N-2, [1]=N-1, [2]=N
  const dN2 = detections[0];
  const dN1 = detections[1];
  const dN = detections[2];

  // Cas 1 : écran porteur à N-2 et N, ABSENT à N-1, même (screener, carrier).
  if (dN2.carrier && dN.carrier) {
    const s = dN2.carrier.screener;
    const c = dN2.carrier.carrier;
    if (carrierMatch(dN.carrier, s, c) && !carrierMatch(dN1.carrier, s, c)) {
      return {
        type: 're-screen',
        cutter: c,
        screeners: [s],
        steps: [stepIdx - 2, stepIdx],
      };
    }
  }
  // Cas 2 : écran hors-ballon à N-2 et N, ABSENT à N-1.
  for (const sN2 of dN2.offBall) {
    if (offBallMatch(dN.offBall, sN2.screener, sN2.cutter) &&
        !offBallMatch(dN1.offBall, sN2.screener, sN2.cutter)) {
      return {
        type: 're-screen',
        cutter: sN2.cutter,
        screeners: [sN2.screener],
        steps: [stepIdx - 2, stepIdx],
      };
    }
  }
  return null;
}

// =====================================================================
// Pattern 2 : stagger-sequential
// =====================================================================

function detectStaggerSequentialPattern(
  detections: StepDetections[],
  stepIdx: number
): ScreenChain | null {
  // detections[1]=N-1, [2]=N
  const dN1 = detections[1];
  const dN = detections[2];

  // Cherche un cutter qui a 2 poseurs DIFFÉRENTS entre N-1 et N (off-ball).
  for (const sN1 of dN1.offBall) {
    for (const sN of dN.offBall) {
      if (sN1.cutter === sN.cutter && sN1.screener !== sN.screener) {
        return {
          type: 'stagger-sequential',
          cutter: sN.cutter,
          screeners: [sN1.screener, sN.screener],
          steps: [stepIdx - 1, stepIdx],
        };
      }
    }
  }
  return null;
}

// =====================================================================
// Pattern 3 : flare-then-fade
// =====================================================================

/** Vrai si la position du cutter ressemble à un fade vers un coin :
 *  loin du centre (|x - centre| > 200) ET bas du terrain (y > 350). */
function isInCorner(p: Point, hoop: Point): boolean {
  return Math.abs(p.x - hoop.x) > 200 && p.y > 350;
}

function detectFlareThenFadePattern(
  state: AppState,
  detections: StepDetections[],
  stepIdx: number
): ScreenChain | null {
  const dN1 = detections[1];
  // Cherche un flare au step N-1.
  const flare = dN1.offBall.find((s) => s.type === 'flare');
  if (!flare) return null;

  const stepN = state.steps[stepIdx];
  if (!stepN) return null;
  const offN = activeOffense(stepN.off, state.playerCount);
  const cutterPosN = offN[flare.cutter];
  if (!cutterPosN) return null;

  const stepN1 = state.steps[stepIdx - 1];
  if (!stepN1) return null;
  const offN1 = activeOffense(stepN1.off, state.playerCount);
  const cutterPosN1 = offN1[flare.cutter];
  if (!cutterPosN1) return null;

  const hoop = getDefenseHoop(state);
  // Critère 1 : cutter au coin à N.
  if (!isInCorner(cutterPosN, hoop)) return null;
  // Critère 2 : cutter s'est éloigné du panier entre N-1 et N (delta dist > 0).
  const distN1 = distance(cutterPosN1, hoop);
  const distN = distance(cutterPosN, hoop);
  if (distN - distN1 < 20) return null;

  return {
    type: 'flare-then-fade',
    cutter: flare.cutter,
    screeners: [flare.screener],
    steps: [stepIdx - 1, stepIdx],
  };
}

// =====================================================================
// Helpers de détection cross-step (positions défensives approximées)
// =====================================================================

/** Détections d'écrans à un step donné, en utilisant `approxDefenderPositions`
 *  pour éviter la récursion via `computeDefenseTargets`. */
function detectionsAt(state: AppState, i: number): StepDetections {
  const step = state.steps[i];
  if (!step) return { carrier: null, offBall: [] };

  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const matchups: Matchups = getMatchupsAt(state.steps, i - 1, state.playerCount);
  const prevOff: AttackerPositions | undefined =
    i > 0 ? activeOffense(state.steps[i - 1].off, state.playerCount) : undefined;
  const defPos = approxDefenderPositions(state, step);

  const carrier = detectScreen(
    off,
    ballCarrier,
    matchups,
    defPos,
    state.screenRadius,
    step.forcedScreener,
    prevOff
  );
  const offBall = detectOffBallScreens(
    off,
    ballCarrier,
    matchups,
    defPos,
    state.screenRadius
  );
  return { carrier, offBall };
}

/** Positions défensives approximées : override step > defenseInitial >
 *  initialDef. Pattern strictement identique à hedgeStepCounter +
 *  helpStepCounter. */
function approxDefenderPositions(
  state: AppState,
  step: { defenseOverrides?: Record<string, Point> }
): DefenderPositions {
  const active = new Set<string>(getActiveDefenderIds(state.playerCount));
  const out: Record<string, Point> = {};
  active.forEach((dId) => {
    const override = step.defenseOverrides?.[dId];
    if (override) {
      out[dId] = override;
    } else {
      const init = (state.defenseInitial as Record<string, Point>)[dId];
      out[dId] = init ?? (initialDef as Record<string, Point>)[dId];
    }
  });
  return out as DefenderPositions;
}
