// Raccourcis de la coque : recherche, panneaux, enregistrement, thème.

import { describe, expect, it } from 'vitest';
import { resolveShellShortcut, type ShellKeyInput } from '../useShellShortcuts';
import { resolveShortcut } from '../useKeyboardShortcuts';
import { nextThemeMode, resolveTheme } from '../useTheme';

const key = (k: string, mods: Partial<ShellKeyInput> = {}): ShellKeyInput => ({
  key: k, code: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods,
});

describe('resolveShellShortcut', () => {
  it('ouvre la recherche avec Ctrl/⌘+K même depuis un champ de saisie, et avec / hors saisie', () => {
    expect(resolveShellShortcut(key('k', { ctrlKey: true }), 'text', false)).toEqual({ type: 'palette' });
    expect(resolveShellShortcut(key('k', { metaKey: true }), 'other', false)).toEqual({ type: 'palette' });
    expect(resolveShellShortcut(key('/', { shiftKey: true }), 'other', false)).toEqual({ type: 'palette' });
    expect(resolveShellShortcut(key('/'), 'text', false)).toBeNull();
  });

  it('chiffres : panneaux du rail par touche physique (AZERTY sans Maj compris)', () => {
    expect(resolveShellShortcut(key('&', { code: 'Digit1' }), 'other', false)).toEqual({ type: 'panel', index: 0 });
    expect(resolveShellShortcut(key('3', { code: 'Digit3', shiftKey: true }), 'button', false)).toEqual({ type: 'panel', index: 2 });
    expect(resolveShellShortcut(key('2', { code: 'Digit2' }), 'text', false)).toBeNull();
    expect(resolveShellShortcut(key('2', { code: 'Digit2' }), 'widget', false)).toBeNull();
  });

  it('colonnes, enregistrement et aide', () => {
    expect(resolveShellShortcut(key('b', { ctrlKey: true }), 'other', false)).toEqual({ type: 'toggleLeft' });
    expect(resolveShellShortcut(key('b', { ctrlKey: true, altKey: true }), 'other', false)).toEqual({ type: 'toggleRight' });
    expect(resolveShellShortcut(key('s', { ctrlKey: true }), 'text', false)).toEqual({ type: 'save' });
    expect(resolveShellShortcut(key('?', { shiftKey: true }), 'other', false)).toEqual({ type: 'help' });
  });

  it('une fenêtre modale garde le clavier', () => {
    expect(resolveShellShortcut(key('k', { ctrlKey: true }), 'other', true)).toBeNull();
    expect(resolveShellShortcut(key('?'), 'other', true)).toBeNull();
  });

  it('ne partage aucune touche avec les raccourcis du terrain', () => {
    const edit = { courtVisible: true, mode: 'edit' as const, isPlaying: false, modalOpen: false };
    const shellKeys = [
      key('k', { ctrlKey: true }), key('s', { ctrlKey: true }), key('b', { ctrlKey: true }),
      key('/'), key('?', { shiftKey: true }), key('&', { code: 'Digit1' }), key('1', { code: 'Digit1' }),
    ];
    for (const k of shellKeys) {
      expect(resolveShellShortcut(k, 'other', false)).not.toBeNull();
      expect(resolveShortcut(k, 'other', edit)).toBeNull();
    }
  });
});

describe('thème', () => {
  it('clair par défaut, sombre seulement si choisi ou si le système est sombre', () => {
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('le bouton fait le tour des trois modes', () => {
    expect(nextThemeMode('auto')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('auto');
  });
});
