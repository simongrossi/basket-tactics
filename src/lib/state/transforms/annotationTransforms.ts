// Transformations sur les annotations : CRUD + timing/quality/phase +
// forcedScreener. Toutes pures.
//
// Édition des endpoints (drag du from/to/waypoint d'une annotation existante)
// vit dans `annotationEndpointTransforms.ts` — re-exportés ci-dessous pour
// rester accessibles via `annotationTx.*`.

export {
  setAnnotationFrom,
  setAnnotationTo,
  setAnnotationWaypoint,
} from './annotationEndpointTransforms';

import type {
  AddAnnotationOptions,
  AppState,
  Annotation,
  AnnotationType,
  AttackerId,
  Step,
} from '@/lib/types';
import {
  upsertMovementAnnotation,
  upsertPassAnnotation,
  removeAnnotation as removeAnnotationFromSteps,
} from '@/lib/logic/stepMutations';

const MOVEMENT_TYPES: AnnotationType[] = ['cut', 'dribble', 'screen'];
const MOVEMENT_TYPE_SET = new Set<AnnotationType>(MOVEMENT_TYPES);
const TIMING_EPSILON = 0.001;

function clampFullT(fullT: number, steps: Step[]): number {
  const maxT = Math.max(0, steps.length - 1);
  return Math.max(0, Math.min(maxT, fullT));
}

function withDrawTiming(
  s: AppState,
  annotation: Annotation,
  options?: AddAnnotationOptions,
): { stepIdx: number; annotation: Annotation } {
  const fallbackStepIdx = s.activeStep;
  const timingAnchor = options?.timingAnchor ?? s.actionTimingAnchor ?? 'start';
  const rawFullT = options?.fullT;
  const hasFullT = typeof rawFullT === 'number' && isFinite(rawFullT);
  const fullT = hasFullT ? clampFullT(rawFullT, s.steps) : null;
  const segmentIdx = fullT == null
    ? fallbackStepIdx
    : Math.min(Math.floor(fullT), Math.max(0, s.steps.length - 1));
  const localT = fullT == null ? 0 : fullT - segmentIdx;

  if (annotation.type === 'pass') {
    if (fullT == null || segmentIdx + 1 >= s.steps.length) {
      return { stepIdx: fallbackStepIdx, annotation };
    }
    if (timingAnchor === 'end') {
      if (fullT > TIMING_EPSILON && localT <= TIMING_EPSILON) {
        return { stepIdx: segmentIdx, annotation };
      }
      return {
        stepIdx: segmentIdx + 1,
        annotation: {
          ...annotation,
          tStart: 0,
          tEnd: Math.max(TIMING_EPSILON, localT),
        },
      };
    }
    return {
      stepIdx: segmentIdx + 1,
      annotation: {
        ...annotation,
        tStart: localT > TIMING_EPSILON ? localT : undefined,
        tEnd: localT > TIMING_EPSILON ? 1 : undefined,
      },
    };
  }

  if (!MOVEMENT_TYPE_SET.has(annotation.type)) {
    return { stepIdx: fallbackStepIdx, annotation };
  }

  if (!hasFullT) {
    return {
      stepIdx: fallbackStepIdx,
      annotation: {
        ...annotation,
        phase: timingAnchor === 'end' ? 'start' : 'end',
      },
    };
  }

  if (timingAnchor === 'end') {
    if (fullT !== null && fullT <= TIMING_EPSILON) {
      return {
        stepIdx: segmentIdx,
        annotation: { ...annotation, phase: 'end' },
      };
    }
    if (fullT !== null && fullT > TIMING_EPSILON && localT <= TIMING_EPSILON) {
      return {
        stepIdx: segmentIdx,
        annotation: { ...annotation, phase: 'start' },
      };
    }
    return {
      stepIdx: segmentIdx,
      annotation: {
        ...annotation,
        phase: 'end',
        tStart: 0,
        tEnd: Math.max(TIMING_EPSILON, localT),
      },
    };
  }

  return {
    stepIdx: segmentIdx,
    annotation: {
      ...annotation,
      phase: 'end',
      tStart: localT > TIMING_EPSILON ? localT : undefined,
      tEnd: localT > TIMING_EPSILON ? 1 : undefined,
    },
  };
}

export function addAnnotation(
  s: AppState,
  annotation: Annotation,
  options?: AddAnnotationOptions,
): AppState {
  const placement = withDrawTiming(s, annotation, options);
  let steps: Step[];
  if (placement.annotation.type === 'pass') {
    steps = upsertPassAnnotation(s.steps, placement.stepIdx, placement.annotation);
    if (placement.annotation.toId) {
      steps = steps.map((st, i) =>
        i === placement.stepIdx ? { ...st, ballCarrier: placement.annotation.toId! } : st
      );
    }
  } else {
    steps = upsertMovementAnnotation(s.steps, placement.stepIdx, placement.annotation);
  }
  if (placement.stepIdx > 0 && steps[placement.stepIdx].generatedBy) {
    const next = [...steps];
    next[placement.stepIdx] = { ...next[placement.stepIdx], manualOverride: true };
    return { ...s, steps: next };
  }
  return { ...s, steps };
}

export function setForcedScreener(s: AppState, oId: AttackerId | null): AppState {
  const steps = [...s.steps];
  const cur = { ...steps[s.activeStep] };
  if (oId == null) delete cur.forcedScreener;
  else cur.forcedScreener = oId;
  steps[s.activeStep] = cur;
  return { ...s, steps };
}

export function clearAnnotationsFor(s: AppState, oId: AttackerId): AppState {
  let steps = s.steps;
  const cur = steps[s.activeStep];
  if (!cur) return s;
  const indices = cur.annotations
    .map((a, i) => (a.fromId === oId ? i : -1))
    .filter((i) => i >= 0)
    .reverse();
  for (const idx of indices) {
    steps = removeAnnotationFromSteps(steps, s.activeStep, idx);
  }
  return { ...s, steps };
}

export function deleteLastAnnotation(s: AppState): AppState {
  const cur = s.steps[s.activeStep];
  if (!cur || cur.annotations.length === 0) return s;
  const steps = removeAnnotationFromSteps(s.steps, s.activeStep, cur.annotations.length - 1);
  return { ...s, steps };
}

export function deleteAnnotation(s: AppState, idx: number): AppState {
  const cur = s.steps[s.activeStep];
  if (!cur || idx < 0 || idx >= cur.annotations.length) return s;
  const steps = removeAnnotationFromSteps(s.steps, s.activeStep, idx);
  return { ...s, steps };
}

/** Édite les bornes temporelles tStart/tEnd d'une annotation de mouvement.
 *  Permet l'édition continue façon vidéo : actions de durées différentes
 *  dans le même segment de transition. Le clamp autorise tStart < 0 et tEnd > 1
 *  pour les actions qui débordent sur les transitions adjacentes. */
export function setAnnotationTiming(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  tStart: number,
  tEnd: number
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (!MOVEMENT_TYPES.includes(anno.type)) return s;

  const minDur = 0.05;
  const canExtendBackward = stepIdx > 0;
  const canExtendForward = stepIdx + 1 < s.steps.length;
  const minStart = canExtendBackward ? -1 : 0;
  const maxEnd = canExtendForward ? 2 : 1;
  const nextStart = Math.max(minStart, Math.min(maxEnd - minDur, tStart));
  const nextEnd = Math.max(nextStart + minDur, Math.min(maxEnd, tEnd));

  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, tStart: nextStart, tEnd: nextEnd } : a
          ),
        }
      : st
  );
  return { ...s, steps };
}

/** B.4 — Définit `tStartAbs` / `tEndAbs` (secondes absolues) sur une annotation
 *  de mouvement. Si une borne vaut `undefined`, le champ correspondant est
 *  effacé (retour au comportement fraction tStart/tEnd legacy).
 *  Pas de validation de cohérence avec stepDuration ici — c'est l'UI qui
 *  doit présenter une saisie raisonnable. */
export function setAnnotationTimingAbs(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  tStartAbs: number | undefined,
  tEndAbs: number | undefined,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (!MOVEMENT_TYPES.includes(anno.type)) return s;

  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, tStartAbs, tEndAbs } : a
          ),
        }
      : st
  );
  return { ...s, steps };
}

/** Définit la qualité d'un écran (annotation type='screen'), entre 0 et 100. */
export function setAnnotationQuality(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  quality: number
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno || anno.type !== 'screen') return s;
  const q = Math.max(0, Math.min(100, Math.round(quality)));
  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, quality: q } : a
          ),
        }
      : st
  );
  return { ...s, steps };
}

/** Bascule la phase d'une annotation entre 'end' (mouvement pendant l'étape,
 *  arrivée à la fin) et 'start' (déjà à destination dès le début, mouvement
 *  pendant la transition précédente). Resync les positions des étapes
 *  concernées. */
export function setAnnotationPhase(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  phase: 'start' | 'end'
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (!MOVEMENT_TYPES.includes(anno.type)) return s;
  const currentPhase = anno.phase ?? 'end';
  if (currentPhase === phase) return s;

  const steps = s.steps.map((st) => ({
    ...st,
    off: { ...st.off },
    annotations: [...st.annotations],
  }));

  if (currentPhase === 'end' && phase === 'start') {
    if (stepIdx === 0) return s;
    steps[stepIdx].off[anno.fromId] = { ...anno.to };
    if (stepIdx + 1 < steps.length) {
      steps[stepIdx + 1].off[anno.fromId] = { ...anno.to };
    }
    steps[stepIdx].annotations[annoIdx] = { ...anno, phase: 'start' };
  } else if (currentPhase === 'start' && phase === 'end') {
    steps[stepIdx].off[anno.fromId] = { ...anno.from };
    if (stepIdx + 1 < steps.length) {
      steps[stepIdx + 1].off[anno.fromId] = { ...anno.to };
    }
    steps[stepIdx].annotations[annoIdx] = { ...anno, phase: 'end' };
  }

  return { ...s, steps };
}

/** Phy.O V4 — Helper interne : mute les feintes de l'annotation `annIdx`
 *  du step `stepIdx`. La mutation passe par `mut` qui reçoit le tableau
 *  courant (ou [] si absent) et renvoie le nouveau. Inputs non mutés. */
function setAnnotationFeintes(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  mut: (feintes: number[]) => number[],
): AppState {
  const step = state.steps[stepIdx];
  if (!step) return state;
  const ann = step.annotations[annIdx];
  if (!ann) return state;
  const current = ann.feintes ?? [];
  const next = mut(current);
  const newAnn = { ...ann, feintes: next };
  const newAnns = step.annotations.map((a, i) => (i === annIdx ? newAnn : a));
  const steps = state.steps.map((s, i) =>
    i === stepIdx ? { ...s, annotations: newAnns } : s,
  );
  return { ...state, steps };
}

/** Phy.O V4 — Ajoute une feinte à l'annotation. t clampé à [0, 1]. */
export function addFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  t: number,
): AppState {
  const tClamped = Math.max(0, Math.min(1, t));
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) => [...fs, tClamped]);
}

/** Phy.O V4 — Met à jour la position d'une feinte. t clampé à [0, 1]. */
export function updateFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  feinteIdx: number,
  t: number,
): AppState {
  const tClamped = Math.max(0, Math.min(1, t));
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) =>
    fs.map((v, i) => (i === feinteIdx ? tClamped : v)),
  );
}

/** Phy.O V4 — Retire la feinte d'index donné. */
export function removeFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  feinteIdx: number,
): AppState {
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) =>
    fs.filter((_, i) => i !== feinteIdx),
  );
}
