// A.3 — Géométrie partagée entre TextNotesLayer (rendu SVG) et le pointer
// handler (hit-test pour le clic d'édition). Une seule source de vérité
// pour le bounding rect d'une note.

import type { TextNote } from '@/lib/types';

export const TEXT_NOTE_HEIGHT_PX = 22;
export const TEXT_NOTE_PADDING_PX = 6;
export const TEXT_NOTE_MIN_WIDTH_PX = 40;
const CHAR_WIDTH_PX = 7;

/** Largeur du bounding rect d'une note, approximée à partir de la longueur
 *  du texte (mesure SVG exacte = trop coûteuse pour V1). */
export function textNoteWidth(text: string): number {
  return Math.max(
    TEXT_NOTE_MIN_WIDTH_PX,
    text.length * CHAR_WIDTH_PX + TEXT_NOTE_PADDING_PX * 2,
  );
}

/** Renvoie l'index de la note la plus haute dans la pile (last-added) dont
 *  le bounding rect contient `point`, ou null. Itère en ordre inverse pour
 *  privilégier la note rendue par-dessus en cas de chevauchement. */
export function hitTestTextNote(
  point: { x: number; y: number },
  notes: TextNote[],
): number | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const w = textNoteWidth(n.text);
    const h = TEXT_NOTE_HEIGHT_PX;
    if (
      point.x >= n.pos.x - w / 2 &&
      point.x <= n.pos.x + w / 2 &&
      point.y >= n.pos.y - h / 2 &&
      point.y <= n.pos.y + h / 2
    ) {
      return i;
    }
  }
  return null;
}
