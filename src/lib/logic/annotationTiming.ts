// B.4 — Centralise la résolution des bornes temporelles d'une annotation.
//
// Trois sources possibles pour les bornes :
//   1. tStartAbs / tEndAbs   (secondes absolues, B.4) — priment quand définis
//   2. tStart    / tEnd      (fraction du step, Étape 10) — fallback legacy
//   3. defaults              (0 et 1, mouvement plein step)
//
// Le résultat est exprimé en FRACTION du step ([0..1] usuellement, mais peut
// déborder si l'absolu dépasse stepDurationSec — utilisé pour les actions
// qui chevauchent la transition suivante).
//
// Helper pur, testable unitairement. À utiliser partout où l'on lit
// tStart/tEnd d'une annotation, pour respecter B.4 automatiquement.

import type { Annotation } from '../types';

export interface AnnotationTiming {
  /** Fraction effective de début dans la transition du step (≥ 0 usuellement). */
  tStart: number;
  /** Fraction effective de fin (≤ 1 usuellement). */
  tEnd: number;
  /** True si la source était `tStartAbs/tEndAbs` (B.4). Indication
   *  utile pour les UIs qui veulent montrer "en s" plutôt qu'en "%". */
  sourceAbs: boolean;
}

/**
 * Résout les bornes effectives d'une annotation pour la transition step→step+1.
 *
 * @param ann               Annotation à interroger.
 * @param stepDurationSec   Durée de la transition step→step+1 en secondes
 *                          (cf. `getStepDurationSeconds` B.1). Si <= 0,
 *                          retombe sur les fractions legacy (évite division
 *                          par zéro).
 */
export function resolveAnnotationTiming(
  ann: Annotation,
  stepDurationSec: number
): AnnotationTiming {
  const abs = hasValidAbsoluteBounds(ann);
  if (abs && stepDurationSec > 0) {
    return {
      tStart: (ann.tStartAbs ?? 0) / stepDurationSec,
      tEnd: (ann.tEndAbs ?? stepDurationSec) / stepDurationSec,
      sourceAbs: true,
    };
  }
  return {
    tStart: typeof ann.tStart === 'number' ? ann.tStart : 0,
    tEnd: typeof ann.tEnd === 'number' ? ann.tEnd : 1,
    sourceAbs: false,
  };
}

/** Au moins une des bornes absolues est définie et finie. */
function hasValidAbsoluteBounds(ann: Annotation): boolean {
  const a = ann.tStartAbs;
  const b = ann.tEndAbs;
  const aOk = typeof a === 'number' && isFinite(a);
  const bOk = typeof b === 'number' && isFinite(b);
  return aOk || bOk;
}
