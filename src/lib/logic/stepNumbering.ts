// Numérotation « coach » des étapes — source unique pour le panneau Étapes,
// la timeline, le mode lecteur et la barre de présentation.
//
// Les `steps` bruts contiennent des entrées que le coach n'a pas dessinées :
//  - le placement de départ vierge, quand la 1re étape n'a aucune action ;
//  - la position finale créée automatiquement après la dernière action ;
//  - les étapes interpolées (lissage d'animation).
// Seules les autres sont numérotées « Étape i / N ».

import type { Step } from '@/lib/types';
import { isBlankStep } from './stepMutations';

export interface StepRow {
  step: Step;
  /** Index dans `steps`. */
  index: number;
  /** Numéro 1-based affiché au coach. */
  number: number;
}

export type StepSlotKind = 'setup' | 'step' | 'end';

export interface StepCounter {
  kind: StepSlotKind;
  /** Numéro de l'étape en cours (0 sur le placement de départ). */
  current: number;
  total: number;
  /** Index (dans `steps`) de l'étape numérotée en cours, sinon null. */
  rowIndex: number | null;
}

export function getVisibleStepRows(steps: Step[]): StepRow[] {
  const realSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !step.isInterpolated);

  const rows: StepRow[] = [];
  realSteps.forEach(({ step, index }, realIdx) => {
    const blank = isBlankStep(step);
    if (realSteps.length === 1 && blank) return;

    const previous = realSteps[realIdx - 1]?.step;
    const isInitialSetup = realIdx === 0 && blank;
    const isTrailingActionResult =
      realIdx === realSteps.length - 1 && blank && !!previous && previous.annotations.length > 0;

    if (isInitialSetup || isTrailingActionResult) return;
    rows.push({ step, index, number: rows.length + 1 });
  });

  return rows;
}

/**
 * Compteur à la position `t` de la timeline (en index d'étape, fractionnaire
 * pendant la lecture). Pendant une transition, c'est l'étape de départ qui
 * est « en cours » : son action est en train d'être jouée.
 */
export function stepCounterAt(steps: Step[], t: number): StepCounter {
  const rows = getVisibleStepRows(steps);
  const total = rows.length;
  const last = Math.max(0, steps.length - 1);
  const idx = Math.max(0, Math.min(last, Math.floor(t + 1e-6)));

  if (total === 0) return { kind: 'setup', current: 0, total, rowIndex: null };
  if (idx < rows[0].index) {
    // En transition vers la 1re étape numérotée depuis le placement : ce
    // sont ses actions qui jouent (ex. passe, stockée sur l'étape d'arrivée).
    if (t > idx + 1e-6 && idx + 1 === rows[0].index) {
      return { kind: 'step', current: 1, total, rowIndex: rows[0].index };
    }
    return { kind: 'setup', current: 0, total, rowIndex: null };
  }
  let row = rows[0];
  for (const r of rows) {
    if (r.index <= idx) row = r;
    else break;
  }
  // Au-delà de la dernière étape numérotée, sur une étape réelle masquée :
  // c'est la position finale auto-créée.
  if (idx > row.index && !steps[idx].isInterpolated && row === rows[rows.length - 1]) {
    return { kind: 'end', current: total, total, rowIndex: null };
  }
  return { kind: 'step', current: row.number, total, rowIndex: row.index };
}

export function formatStepCounter(c: StepCounter): string {
  if (c.kind === 'setup') return 'Placement de départ';
  if (c.kind === 'end') return 'Position finale';
  return `Étape ${c.current} / ${c.total}`;
}
