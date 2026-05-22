import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addTextNote,
  updateTextNote,
  removeTextNote,
} from '../textNoteTransforms';

describe('textNoteTransforms', () => {
  it('addTextNote — initialise textNotes si absent et ajoute la note', () => {
    const s = makeInitialState();
    expect(s.steps[0].textNotes).toBeUndefined();
    const out = addTextNote(s, 0, { pos: { x: 100, y: 200 }, text: 'trap si le 5 monte' });
    expect(out.steps[0].textNotes).toEqual([
      { pos: { x: 100, y: 200 }, text: 'trap si le 5 monte' },
    ]);
    // entrée non mutée
    expect(s.steps[0].textNotes).toBeUndefined();
  });

  it('addTextNote — ajoute à la suite des notes existantes', () => {
    const s1 = addTextNote(makeInitialState(), 0, { pos: { x: 10, y: 10 }, text: 'A' });
    const s2 = addTextNote(s1, 0, { pos: { x: 20, y: 20 }, text: 'B' });
    expect(s2.steps[0].textNotes).toEqual([
      { pos: { x: 10, y: 10 }, text: 'A' },
      { pos: { x: 20, y: 20 }, text: 'B' },
    ]);
  });

  it("updateTextNote — change le texte sans toucher la position", () => {
    const s = addTextNote(makeInitialState(), 0, { pos: { x: 50, y: 60 }, text: 'old' });
    const out = updateTextNote(s, 0, 0, 'new');
    expect(out.steps[0].textNotes![0]).toEqual({ pos: { x: 50, y: 60 }, text: 'new' });
  });

  it("removeTextNote — retire l'index donné", () => {
    let s = addTextNote(makeInitialState(), 0, { pos: { x: 1, y: 1 }, text: 'A' });
    s = addTextNote(s, 0, { pos: { x: 2, y: 2 }, text: 'B' });
    s = addTextNote(s, 0, { pos: { x: 3, y: 3 }, text: 'C' });
    const out = removeTextNote(s, 0, 1);
    expect(out.steps[0].textNotes).toEqual([
      { pos: { x: 1, y: 1 }, text: 'A' },
      { pos: { x: 3, y: 3 }, text: 'C' },
    ]);
  });

  it('stepIdx invalide → no-op (renvoie l\'état tel quel)', () => {
    const s = makeInitialState();
    expect(addTextNote(s, 99, { pos: { x: 0, y: 0 }, text: 'X' })).toBe(s);
    expect(updateTextNote(s, 99, 0, 'X')).toBe(s);
    expect(removeTextNote(s, 99, 0)).toBe(s);
  });
});
