// Transformations sur les annotations : CRUD + timing/quality/phase +
// forcedScreener. Toutes pures.
//
// Édition des endpoints (drag du from/to/waypoint d'une annotation existante)
// vit dans `annotationEndpointTransforms.ts` — re-exportés ci-dessous pour
// rester accessibles via `annotationTx.*`.

export {
  addAnnotationWaypoint,
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
import { isBlankStep } from '@/lib/logic/stepMutations';
import { actionsOfStep } from '@/lib/logic/stepActions';

const MOVEMENT_TYPES: AnnotationType[] = ['cut', 'dribble', 'screen'];
const MOVEMENT_TYPE_SET = new Set<AnnotationType>(MOVEMENT_TYPES);
const TIMING_EPSILON = 0.001;

/** Change le type d'une action de mouvement (course / dribble / écran).
 *  La géométrie (from/to/waypoints) est conservée : le coach corrige
 *  l'intention sans redessiner. Les passes sont exclues (leur sémantique
 *  `toId` + porteur n'est pas la même). */
export function setAnnotationType(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  type: AnnotationType,
): AppState {
  const step = s.steps[stepIdx];
  const anno = step?.annotations[annoIdx];
  if (!step || !anno) return s;
  if (!MOVEMENT_TYPE_SET.has(anno.type) || !MOVEMENT_TYPE_SET.has(type)) return s;
  if (anno.type === type) return s;
  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, type } : a,
          ),
        }
      : st,
  );
  return { ...s, steps };
}

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
    // Une passe est stockée sur l'étape d'ARRIVÉE (contrat moteur) : dessinée
    // sur l'étape k, elle se joue k → k+1, comme une course dessinée sur k.
    // L'étape k+1 est créée par addAnnotation si elle n'existe pas.
    if (fullT == null) {
      if (timingAnchor === 'end' && fallbackStepIdx > 0) {
        return { stepIdx: fallbackStepIdx, annotation };
      }
      return { stepIdx: fallbackStepIdx + 1, annotation };
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
    let base = s.steps;
    if (placement.stepIdx >= base.length) {
      const last = base[base.length - 1];
      base = [...base, { off: { ...last.off }, ballCarrier: last.ballCarrier, annotations: [] }];
    }
    steps = upsertPassAnnotation(base, placement.stepIdx, placement.annotation);
    if (placement.annotation.toId) {
      steps = setCarrierFrom(steps, placement.stepIdx, placement.annotation.toId);
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

/**
 * Porteur de `steps[from]` = `carrier`, propagé aux étapes suivantes qui
 * avaient le même porteur, jusqu'à la prochaine passe. Sans ça, le ballon
 * revient au passeur à l'étape d'après sans passe dessinée.
 */
function setCarrierFrom(steps: Step[], from: number, carrier: AttackerId): Step[] {
  const previous = steps[from]?.ballCarrier;
  if (!previous || previous === carrier) {
    return steps.map((st, i) => (i === from ? { ...st, ballCarrier: carrier } : st));
  }
  const out = [...steps];
  out[from] = { ...out[from], ballCarrier: carrier };
  for (let m = from + 1; m < out.length; m++) {
    if (out[m].ballCarrier !== previous) break;
    if (out[m].annotations.some((a) => a.type === 'pass')) break;
    out[m] = { ...out[m], ballCarrier: carrier };
  }
  return out;
}

/** Retire la dernière étape tant qu'elle ne sert plus à rien : vide, mêmes
 *  positions et même porteur que l'étape précédente, qui n'a pas d'action. */
function trimDeadTrailingSteps(s: AppState, steps: Step[]): AppState {
  const out = [...steps];
  while (out.length > 1) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const samePositions = (Object.keys(last.off) as AttackerId[]).every((id) =>
      prev.off[id] && last.off[id].x === prev.off[id].x && last.off[id].y === prev.off[id].y);
    if (!isBlankStep(last) || !samePositions || last.ballCarrier !== prev.ballCarrier) break;
    if (actionsOfStep(out, out.length - 2).length > 0) break;
    out.pop();
  }
  return { ...s, steps: out, activeStep: Math.min(s.activeStep, out.length - 1) };
}

/** Supprime une annotation stockée sur `stepIdx`. Une passe supprimée rend
 *  le ballon au porteur de l'étape précédente. */
function removeAt(s: AppState, stepIdx: number, idx: number): AppState {
  const step = s.steps[stepIdx];
  if (!step || idx < 0 || idx >= step.annotations.length) return s;
  const removed = step.annotations[idx];
  let steps = removeAnnotationFromSteps(s.steps, stepIdx, idx);
  const stillPassed = steps[stepIdx].annotations.some((a) => a.type === 'pass');
  if (removed.type === 'pass' && removed.toId && !stillPassed
      && steps[stepIdx].ballCarrier === removed.toId) {
    const back = steps[stepIdx - 1]?.ballCarrier ?? removed.fromId;
    steps = setCarrierFrom(steps, stepIdx, back);
  }
  return trimDeadTrailingSteps(s, steps);
}

export function setForcedScreener(s: AppState, oId: AttackerId | null): AppState {
  const steps = [...s.steps];
  const cur = { ...steps[s.activeStep] };
  if (oId == null) delete cur.forcedScreener;
  else cur.forcedScreener = oId;
  steps[s.activeStep] = cur;
  return { ...s, steps };
}

/** Efface les actions du joueur visibles sur l'étape active (y compris
 *  ses passes, stockées sur l'étape suivante). */
export function clearAnnotationsFor(s: AppState, oId: AttackerId): AppState {
  const targets = actionsOfStep(s.steps, s.activeStep)
    .filter(({ annotation }) => annotation.fromId === oId)
    .sort((a, b) => b.stepIdx - a.stepIdx || b.index - a.index);
  return targets.reduce((acc, t) => removeAt(acc, t.stepIdx, t.index), s);
}

/** « Supprimer la dernière flèche » de l'étape active. */
export function deleteLastAnnotation(s: AppState): AppState {
  const actions = actionsOfStep(s.steps, s.activeStep);
  const last = actions[actions.length - 1];
  return last ? removeAt(s, last.stepIdx, last.index) : s;
}

/** Supprime l'annotation `idx` stockée sur `stepIdx` (étape active par défaut). */
export function deleteAnnotation(s: AppState, idx: number, stepIdx: number = s.activeStep): AppState {
  return removeAt(s, stepIdx, idx);
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

/** Phy.O V3 V2 — pose/efface le côté de flip d'un cut. */
export function setAnnotationFlipSide(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  side: 'left' | 'right' | undefined,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, flipSideIfDefenderOn: side } : a
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

/** Bascule le flag sprint (sprint boost) pour une annotation de mouvement. */
export function toggleAnnotationSprint(
  s: AppState,
  stepIdx: number,
  annoIdx: number
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
            j === annoIdx ? { ...a, sprint: !a.sprint } : a
          ),
        }
      : st
  );
  return { ...s, steps };
}
