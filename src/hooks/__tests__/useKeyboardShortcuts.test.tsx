// @vitest-environment jsdom
// U03 — une touche produit une seule action adaptée à la vue, au mode et au focus.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import {
  focusKindOf,
  resolveShortcut,
  scrubTarget,
  useKeyboardShortcuts,
  type KeyInput,
  type ShortcutContext,
} from '../useKeyboardShortcuts';

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods,
});
const edit: ShortcutContext = { courtVisible: true, mode: 'edit', isPlaying: false, modalOpen: false };
const player: ShortcutContext = { ...edit, mode: 'player' };
const present: ShortcutContext = { ...edit, mode: 'present' };

describe('resolveShortcut — table unique', () => {
  it('flèches : une étape, quel que soit le mode', () => {
    expect(resolveShortcut(key('ArrowRight'), 'other', edit)).toEqual({ type: 'step', delta: 1 });
    expect(resolveShortcut(key('ArrowLeft'), 'other', player)).toEqual({ type: 'step', delta: -1 });
    expect(resolveShortcut(key('ArrowLeft'), 'other', present)).toEqual({ type: 'step', delta: -1 });
  });

  it('déplacement fin réservé à l’édition, sans conflit avec les étapes', () => {
    expect(resolveShortcut(key('ArrowRight', { shiftKey: true }), 'other', edit))
      .toEqual({ type: 'scrub', delta: 1, resolution: 10 });
    expect(resolveShortcut(key('.'), 'other', edit)).toEqual({ type: 'scrub', delta: 1, resolution: 60 });
    expect(resolveShortcut(key(','), 'other', edit)).toEqual({ type: 'scrub', delta: -1, resolution: 60 });
    expect(resolveShortcut(key('ArrowRight', { shiftKey: true }), 'other', player)).toBeNull();
    expect(resolveShortcut(key('.'), 'other', player)).toBeNull();
  });

  it('pendant la lecture, seules lecture/pause et sortie restent actives', () => {
    const playing = { ...edit, isPlaying: true };
    expect(resolveShortcut(key('ArrowRight'), 'other', playing)).toBeNull();
    expect(resolveShortcut(key('z', { ctrlKey: true }), 'other', playing)).toBeNull();
    expect(resolveShortcut(key('Delete'), 'other', playing)).toBeNull();
    expect(resolveShortcut(key(' '), 'other', playing)).toEqual({ type: 'playPause' });
    expect(resolveShortcut(key('Escape'), 'other', { ...present, isPlaying: true })).toEqual({ type: 'exitPresent' });
  });

  it('annuler / rétablir : Ctrl ou ⌘, en édition seulement', () => {
    expect(resolveShortcut(key('z', { ctrlKey: true }), 'other', edit)).toEqual({ type: 'undo' });
    expect(resolveShortcut(key('z', { metaKey: true }), 'other', edit)).toEqual({ type: 'undo' });
    expect(resolveShortcut(key('Z', { metaKey: true, shiftKey: true }), 'other', edit)).toEqual({ type: 'redo' });
    expect(resolveShortcut(key('y', { ctrlKey: true }), 'other', edit)).toEqual({ type: 'redo' });
    expect(resolveShortcut(key('z', { ctrlKey: true }), 'other', player)).toBeNull();
    expect(resolveShortcut(key('z', { ctrlKey: true }), 'other', present)).toBeNull();
  });

  it('outils et suppression : édition seulement', () => {
    expect(resolveShortcut(key('p'), 'other', edit)).toEqual({ type: 'tool', tool: 'pass' });
    expect(resolveShortcut(key('E'), 'other', edit)).toEqual({ type: 'tool', tool: 'screen' });
    expect(resolveShortcut(key('Backspace'), 'other', edit)).toEqual({ type: 'deleteLastAnnotation' });
    expect(resolveShortcut(key('p'), 'other', player)).toBeNull();
    expect(resolveShortcut(key('Delete'), 'other', present)).toBeNull();
  });

  it('PageUp/PageDown pour les télécommandes de présentation', () => {
    expect(resolveShortcut(key('PageDown'), 'other', player)).toEqual({ type: 'step', delta: 1 });
    expect(resolveShortcut(key('PageUp'), 'other', present)).toEqual({ type: 'step', delta: -1 });
    expect(resolveShortcut(key('PageDown'), 'other', edit)).toBeNull();
  });

  it('hors terrain ou fenêtre modale ouverte : aucun raccourci global', () => {
    for (const ctx of [{ ...edit, courtVisible: false }, { ...edit, modalOpen: true }]) {
      for (const k of [key(' '), key('ArrowRight'), key('p'), key('z', { ctrlKey: true }), key('Delete')]) {
        expect(resolveShortcut(k, 'other', ctx)).toBeNull();
      }
    }
  });

  it('le focus garde ses propres touches', () => {
    for (const k of [key(' '), key('ArrowLeft'), key('p'), key('Backspace'), key('z', { ctrlKey: true })]) {
      expect(resolveShortcut(k, 'text', edit)).toBeNull();
    }
    // Un bouton focus s'active avec Espace : pas de lecture en plus.
    expect(resolveShortcut(key(' '), 'button', edit)).toBeNull();
    expect(resolveShortcut(key('ArrowRight'), 'button', edit)).toEqual({ type: 'step', delta: 1 });
    // Un curseur, un onglet… gèrent leurs flèches.
    expect(resolveShortcut(key('ArrowRight'), 'widget', edit)).toBeNull();
  });

  it('Échap ne quitte que la présentation plein écran', () => {
    expect(resolveShortcut(key('Escape'), 'other', present)).toEqual({ type: 'exitPresent' });
    expect(resolveShortcut(key('Escape'), 'other', edit)).toBeNull();
    expect(resolveShortcut(key('Escape'), 'other', player)).toBeNull();
  });
});

describe('focusKindOf', () => {
  it('classe les éléments focus', () => {
    const input = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const range = Object.assign(document.createElement('input'), { type: 'range' });
    const tab = document.createElement('div');
    tab.setAttribute('role', 'tab');
    expect(focusKindOf(input)).toBe('text');
    expect(focusKindOf(range)).toBe('text');
    expect(focusKindOf(document.createElement('textarea'))).toBe('text');
    expect(focusKindOf(checkbox)).toBe('button');
    expect(focusKindOf(document.createElement('button'))).toBe('button');
    expect(focusKindOf(tab)).toBe('widget');
    expect(focusKindOf(document.body)).toBe('other');
    expect(focusKindOf(null)).toBe('other');
  });
});

describe('scrubTarget', () => {
  it('avance d’une subdivision et reste dans la possession', () => {
    expect(scrubTarget(1, 1, 10, 4)).toBeCloseTo(1.1);
    expect(scrubTarget(0, -1, 60, 4)).toBe(0);
    expect(scrubTarget(4, 1, 60, 4)).toBe(4);
  });
});

describe('useKeyboardShortcuts', () => {
  const mount = (ctx: Partial<ShortcutContext> = {}) => {
    const onAction = vi.fn();
    renderHook(() => useKeyboardShortcuts({ courtVisible: true, mode: 'edit', isPlaying: false, ...ctx, onAction }));
    return onAction;
  };

  it('une flèche = une seule action', () => {
    const onAction = mount();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: 'step', delta: 1 });
  });

  it('Espace : lecture au relâchement d’un appui simple', () => {
    const onAction = mount();
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyUp(window, { key: ' ' });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: 'playPause' });
  });

  it('Espace maintenu + glisser déplace la vue sans lancer la lecture', () => {
    const onAction = mount();
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.pointerDown(window);
    fireEvent.keyUp(window, { key: ' ' });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('une fenêtre modale ouverte coupe les raccourcis du terrain', () => {
    const onAction = mount();
    const { unmount } = render(createElement('div', { role: 'dialog', 'aria-modal': 'true' }));
    fireEvent.keyDown(window, { key: 'p' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(window, { key: 'p' });
    expect(onAction).toHaveBeenCalledWith({ type: 'tool', tool: 'pass' });
  });

  it('ignore les touches tapées dans un champ', () => {
    const onAction = mount();
    const { container } = render(createElement('input'));
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'p' });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });
});
