// Réorganisation manuelle des étapes.
//
// Le modèle stocke les actions sur l'étape où elles commencent (course,
// dribble, écran) et les passes sur l'étape d'arrivée. Déplacer une étape
// déplace donc aussi les actions qu'elle porte ; il faut ensuite recalculer
// les extrémités (`from`/`to`) pour que chaque flèche reste alignée sur la
// nouvelle séquence de positions, sinon la lecture fait revenir les joueurs
// vers d'anciennes coordonnées (cf. `playbackTrajectory`).
//
// Les waypoints (courbes libres) sont conservés : ils restent des points de
// passage sur le terrain. La réorganisation est refusée sur une séquence
// contenant des étapes interpolées (lissage automatique) : leur géométrie
// dépend de l'ordre d'origine.

import type { Annotation, AppState, Point, Step } from '@/lib/types';
import { isArrivalMovement } from '@/lib/logic/stepActions';

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Remonte les déplacements décrits sur leur étape d'arrivée vers l'étape de
 *  départ (modèle historique des modèles fournis). Sans cela, un déplacement
 *  « arrivée » serait recalculé comme le déplacement suivant du joueur. */
export function normalizeArrivalMovements(steps: Step[]): Step[] {
  const out = steps.map((st) => ({ ...st, annotations: [...st.annotations] }));
  for (let k = 1; k < out.length; k++) {
    const step = out[k];
    if (step.annotations.length === 0) continue;
    const kept: Annotation[] = [];
    for (const ann of step.annotations) {
      if (ann.type === 'pass' || !isArrivalMovement(step, ann)) {
        kept.push(ann);
        continue;
      }
      const dest = out[k - 1];
      const alreadyDescribed = dest.annotations.some(
        (a) => a.type !== 'pass' && a.fromId === ann.fromId,
      );
      if (alreadyDescribed) continue; // doublon : la version « départ » gagne
      dest.annotations = [...dest.annotations, { ...ann }];
    }
    step.annotations = kept;
  }
  return out;
}

/** Recalcule `from`/`to` de toutes les actions à partir des positions des
 *  étapes voisines. Les waypoints et le type sont conservés. */
export function rederiveAnnotationEndpoints(steps: Step[]): Step[] {
  return steps.map((step, k) => {
    if (step.annotations.length === 0) return step;
    let changed = false;
    const annotations = step.annotations.map((ann) => {
      if (ann.type === 'pass') {
        const prev = steps[k - 1];
        if (!prev) return ann;
        const from = prev.off[ann.fromId];
        const to = step.off[ann.toId ?? step.ballCarrier];
        if (!from || !to) return ann;
        if (samePoint(ann.from, from) && samePoint(ann.to, to)) return ann;
        changed = true;
        return { ...ann, from: { ...from }, to: { ...to } };
      }
      // Déplacement : de la position du joueur ici vers sa position ensuite.
      // Sur la dernière étape il n'y a pas de suite : on laisse tel quel
      // (écran tenu / action pendante).
      const next = steps[k + 1];
      if (!next) return ann;
      const from = step.off[ann.fromId];
      const to = next.off[ann.fromId];
      if (!from || !to) return ann;
      if (samePoint(ann.from, from) && samePoint(ann.to, to)) return ann;
      changed = true;
      return { ...ann, from: { ...from }, to: { ...to } };
    });
    return changed ? { ...step, annotations } : step;
  });
}

/**
 * Déplace l'étape `from` à l'index `to` puis recalcule les trajectoires.
 * No-op si la séquence contient des étapes interpolées (lissage) ou si les
 * index sont invalides.
 */
export function moveStep(s: AppState, from: number, to: number): AppState {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return s;
  if (from === to) return s;
  if (from < 0 || from >= s.steps.length) return s;
  if (to < 0 || to >= s.steps.length) return s;
  if (s.steps.some((st) => st.isInterpolated)) return s;

  const normalized = normalizeArrivalMovements(s.steps);
  const reordered = [...normalized];
  const [moved] = reordered.splice(from, 1);
  if (!moved) return s;
  reordered.splice(to, 0, moved);
  const steps = rederiveAnnotationEndpoints(reordered);
  return { ...s, steps, activeStep: to };
}
