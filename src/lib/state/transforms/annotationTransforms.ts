// Transformations sur les annotations : CRUD + timing/quality/phase +
// forcedScreener. Toutes pures.

import type { AppState, Annotation, AnnotationType, AttackerId, Step } from '@/lib/types';
import {
  upsertMovementAnnotation,
  upsertPassAnnotation,
  removeAnnotation as removeAnnotationFromSteps,
} from '@/lib/logic/stepMutations';

const MOVEMENT_TYPES: AnnotationType[] = ['cut', 'dribble', 'screen'];

export function addAnnotation(s: AppState, annotation: Annotation): AppState {
  let steps: Step[];
  if (annotation.type === 'pass') {
    steps = upsertPassAnnotation(s.steps, s.activeStep, annotation);
    if (annotation.toId) {
      steps = steps.map((st, i) =>
        i === s.activeStep ? { ...st, ballCarrier: annotation.toId! } : st
      );
    }
  } else {
    steps = upsertMovementAnnotation(s.steps, s.activeStep, annotation);
  }
  if (s.activeStep > 0 && steps[s.activeStep].generatedBy) {
    const next = [...steps];
    next[s.activeStep] = { ...next[s.activeStep], manualOverride: true };
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
