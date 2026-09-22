// « Actions de l'étape k » telles que le coach les voit : tout ce qui se
// joue pendant la transition k → k+1.
//
// Le stockage suit le contrat du moteur, qui n'est pas modifié ici :
//  - course / dribble / écran : sur l'étape de DÉPART (jouée k → k+1) ;
//  - passe : sur l'étape d'ARRIVÉE, celle où le receveur a le ballon
//    (cf. frameResolver, recherche de la passe sur le step `b`) ;
//  - déplacement « périmé » : décrit sur l'étape d'arrivée (convention des
//    modèles fournis et de la phase « start »). Le moteur l'ignore pour
//    la transition suivante (playbackTrajectory, même critère ci-dessous).
// Cette couche remet chaque action sous l'étape où elle commence à jouer,
// pour le terrain, le panneau Étapes, les fiches et la numérotation.

import type { Annotation, Step } from '@/lib/types';
import { ANNOTATION_STALE_TO_TOLERANCE_PX } from './playbackTrajectory';

export interface StepAction {
  annotation: Annotation;
  /** Étape qui STOCKE l'annotation (pour éditer / supprimer). */
  stepIdx: number;
  /** Index dans `steps[stepIdx].annotations`. */
  index: number;
}

function near(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= ANNOTATION_STALE_TO_TOLERANCE_PX;
}

/** Déplacement décrit sur son étape d'arrivée : le joueur y est déjà à
 *  `to` et `from` est ailleurs. Même critère que la lecture. */
export function isArrivalMovement(step: Step, ann: Annotation): boolean {
  if (ann.type === 'pass') return false;
  const pos = step.off[ann.fromId];
  if (!pos || !ann.to || !ann.from) return false;
  return near(ann.to, pos) && !near(ann.from, pos);
}

/** Étape (dans la numérotation du coach) où l'annotation commence à jouer. */
export function actionStepOf(steps: Step[], stepIdx: number, ann: Annotation): number {
  // Un déplacement sur la dernière étape ne peut plus être joué (rien ne
  // suit) : c'est un écran « tenu » ou une arrivée, rattaché à l'étape
  // précédente.
  const dangling = stepIdx === steps.length - 1 && ann.type !== 'pass';
  const arrives = dangling || ann.type === 'pass' || isArrivalMovement(steps[stepIdx], ann);
  // Sur l'étape 0, rien ne précède : on l'y laisse (données héritées).
  return arrives ? Math.max(0, stepIdx - 1) : stepIdx;
}

/**
 * Actions jouées pendant la transition k → k+1, dans l'ordre : celles
 * stockées sur k, puis celles stockées sur k+1 (passes, arrivées).
 */
export function actionsOfStep(steps: Step[], k: number): StepAction[] {
  const out: StepAction[] = [];
  // Joueurs ayant déjà un déplacement stocké au départ (celui que joue le
  // moteur) : leur description « arrivée » sur k+1 ferait doublon.
  const movingFromK = new Set(
    (steps[k]?.annotations ?? [])
      .filter((a) => a.type !== 'pass' && !isArrivalMovement(steps[k], a))
      .map((a) => a.fromId),
  );
  for (const stepIdx of [k, k + 1]) {
    const step = steps[stepIdx];
    if (!step) continue;
    step.annotations.forEach((annotation, index) => {
      if (actionStepOf(steps, stepIdx, annotation) !== k) return;
      if (stepIdx === k + 1 && annotation.type !== 'pass' && movingFromK.has(annotation.fromId)) return;
      out.push({ annotation, stepIdx, index });
    });
  }
  return out;
}

/** Au moins une action décrite sur son étape d'arrivée (passe ou
 *  déplacement « arrivée ») : convention des modèles fournis. */
export function hasArrivalActions(steps: Step[]): boolean {
  return steps.some((st) => st.annotations.some((a) => a.type === 'pass' || isArrivalMovement(st, a)));
}

/**
 * Modèles écrits « étape = ce qui mène ici » : le libellé de l'étape k+1
 * décrit l'action jouée k → k+1. On le remonte sur k, où le coach voit
 * désormais cette action. Le libellé de mise en place de l'étape 0 ne reste
 * que si l'étape 1 n'en a pas ; la dernière étape (position finale) n'en a plus.
 */
export function toDepartureLabels(steps: Step[]): Step[] {
  return steps.map((st, k) => {
    const label = k === 0 ? steps[1]?.label ?? st.label : steps[k + 1]?.label;
    const out = { ...st };
    if (label) out.label = label;
    else delete out.label;
    return out;
  });
}

/**
 * Même remontée pour les étapes compilées depuis les actions scriptées :
 * seules les étapes générées (non retouchées) sont concernées.
 */
export function toDepartureLabelsForGenerated(steps: Step[]): Step[] {
  const generated = (st?: Step) => !!st?.generatedBy && !st.manualOverride;
  return steps.map((st, k) => {
    if (st.manualOverride) return st;
    const next = steps[k + 1];
    const label = generated(next) ? next!.label : generated(st) ? undefined : st.label;
    const out = { ...st };
    if (label) out.label = label;
    else delete out.label;
    return out;
  });
}
