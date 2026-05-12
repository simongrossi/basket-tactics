// Transformations sur les steps : CRUD + label + ballCarrier.
// Toutes les fonctions sont pures (AppState → AppState) pour être testables
// sans React et composables sans surprise.

import type { AppState, AttackerId, Step } from '@/lib/types';
import { makeStep } from '@/lib/data/initial';

export function setActiveStep(s: AppState, idx: number): AppState {
  return { ...s, activeStep: Math.max(0, Math.min(s.steps.length - 1, idx)) };
}

/** Ajoute une nouvelle étape juste après l'active. Propage les destinations
 *  des annotations de mouvement (cut/screen/dribble) de l'étape courante aux
 *  positions de la nouvelle, et propage le receveur d'une passe au porteur. */
export function addStep(s: AppState): AppState {
  const cur = s.steps[s.activeStep];
  const newOff = { ...cur.off };
  cur.annotations.forEach((anno) => {
    if (anno.type === 'cut' || anno.type === 'screen' || anno.type === 'dribble') {
      const id = anno.fromId as AttackerId;
      if (id in newOff && anno.to) {
        newOff[id] = { x: anno.to.x, y: anno.to.y };
      }
    }
  });
  const passAnno = cur.annotations.find((a) => a.type === 'pass' && a.toId);
  const newCarrier = passAnno?.toId ?? cur.ballCarrier;
  const newStep = makeStep(newOff, newCarrier, []);
  const steps = [...s.steps];
  steps.splice(s.activeStep + 1, 0, newStep);
  return { ...s, steps, activeStep: s.activeStep + 1 };
}

export function duplicateStep(s: AppState): AppState {
  const copy: Step = structuredClone(s.steps[s.activeStep]);
  delete copy.switches;
  const steps = [...s.steps];
  steps.splice(s.activeStep + 1, 0, copy);
  return { ...s, steps, activeStep: s.activeStep + 1 };
}

export function deleteStep(s: AppState): AppState {
  if (s.steps.length <= 1) return s;
  const steps = s.steps.filter((_, i) => i !== s.activeStep);
  return { ...s, steps, activeStep: Math.max(0, s.activeStep - 1) };
}

export function setStepLabel(s: AppState, idx: number, label: string): AppState {
  const steps = [...s.steps];
  steps[idx] = { ...steps[idx], label: label || undefined };
  return { ...s, steps };
}

export function setBallCarrier(s: AppState, carrier: AttackerId): AppState {
  const steps = [...s.steps];
  steps[s.activeStep] = { ...steps[s.activeStep], ballCarrier: carrier };
  return { ...s, steps };
}
