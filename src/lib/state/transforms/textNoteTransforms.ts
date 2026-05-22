// A.3 — Transforms pour les notes texte libres déposées sur le terrain.
// Toutes les fonctions sont pures (AppState → AppState).

import type { AppState, TextNote } from '@/lib/types';

function setStepTextNotes(
  state: AppState,
  stepIdx: number,
  mut: (notes: TextNote[]) => TextNote[],
): AppState {
  const step = state.steps[stepIdx];
  if (!step) return state;
  const current = step.textNotes ?? [];
  const next = mut(current);
  const steps = state.steps.map((s, i) =>
    i === stepIdx ? { ...s, textNotes: next } : s,
  );
  return { ...state, steps };
}

/** Ajoute une note à l'étape `stepIdx`. Initialise `textNotes` si absent. */
export function addTextNote(state: AppState, stepIdx: number, note: TextNote): AppState {
  return setStepTextNotes(state, stepIdx, (notes) => [...notes, note]);
}

/** Met à jour le texte de la note d'index `noteIdx`. Position inchangée. */
export function updateTextNote(
  state: AppState,
  stepIdx: number,
  noteIdx: number,
  text: string,
): AppState {
  return setStepTextNotes(state, stepIdx, (notes) =>
    notes.map((n, i) => (i === noteIdx ? { ...n, text } : n)),
  );
}

/** Retire la note d'index `noteIdx` à l'étape `stepIdx`. */
export function removeTextNote(
  state: AppState,
  stepIdx: number,
  noteIdx: number,
): AppState {
  return setStepTextNotes(state, stepIdx, (notes) =>
    notes.filter((_, i) => i !== noteIdx),
  );
}
