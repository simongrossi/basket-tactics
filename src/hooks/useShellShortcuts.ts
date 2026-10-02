import { useEffect, useRef } from 'react';
import { focusKindOf, isModalOpen, type FocusKind } from './useKeyboardShortcuts';

// Raccourcis de la coque (recherche, panneaux, enregistrement), actifs dans
// toutes les vues. Les raccourcis du terrain (outils, lecture, étapes) restent
// dans useKeyboardShortcuts : les deux tables ne partagent aucune touche.

export type ShellAction =
  | { type: 'palette' }
  | { type: 'help' }
  | { type: 'save' }
  /** Ouvre le n-ième groupe du rail (0 = premier). */
  | { type: 'panel'; index: number }
  | { type: 'toggleLeft' }
  | { type: 'toggleRight' };

export interface ShellKeyInput {
  key: string;
  /** Touche physique : les chiffres restent accessibles sans Maj en AZERTY. */
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Aide-mémoire affiché par la fenêtre « Raccourcis clavier » et la recherche. */
export const SHORTCUT_GROUPS: { title: string; items: { keys: string; label: string }[] }[] = [
  {
    title: 'Interface',
    items: [
      { keys: 'Ctrl/⌘+K ou /', label: 'Rechercher un menu, une action, un système' },
      { keys: '1 … 6', label: 'Ouvrir un panneau du rail (dans l’ordre des icônes)' },
      { keys: 'Ctrl/⌘+B', label: 'Replier / déplier le panneau de gauche' },
      { keys: 'Ctrl/⌘+Alt+B', label: 'Replier / déplier la colonne de droite' },
      { keys: 'Ctrl/⌘+S', label: 'Enregistrer le système' },
      { keys: '?', label: 'Afficher les raccourcis clavier' },
    ],
  },
  {
    title: 'Outils de dessin',
    items: [
      { keys: 'M', label: 'Déplacer' },
      { keys: 'P', label: 'Passe' },
      { keys: 'D', label: 'Dribble' },
      { keys: 'R', label: 'Course' },
      { keys: 'E', label: 'Écran' },
      { keys: 'T', label: 'Note' },
      { keys: 'Suppr', label: 'Effacer le dernier tracé' },
    ],
  },
  {
    title: 'Lecture et étapes',
    items: [
      { keys: 'Espace', label: 'Lecture / pause' },
      { keys: '← / →', label: 'Étape précédente / suivante' },
      { keys: 'Maj+← / Maj+→', label: 'Avancer dans la transition' },
      { keys: ', / .', label: 'Avancer image par image' },
      { keys: 'Ctrl/⌘+Z', label: 'Annuler' },
      { keys: 'Ctrl/⌘+Maj+Z ou Ctrl/⌘+Y', label: 'Rétablir' },
      { keys: 'Échap', label: 'Quitter le plein écran' },
    ],
  },
];

const DIGIT = /^(?:Digit|Numpad)([1-9])$/;

export function resolveShellShortcut(e: ShellKeyInput, focus: FocusKind, modalOpen: boolean): ShellAction | null {
  if (modalOpen) return null;
  const k = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    if (e.shiftKey) return null;
    if (k === 'b') return { type: e.altKey ? 'toggleRight' : 'toggleLeft' };
    if (e.altKey) return null;
    if (k === 'k') return { type: 'palette' };
    if (k === 's') return { type: 'save' };
    return null;
  }
  if (e.altKey || focus === 'text') return null;

  if (e.key === '/') return { type: 'palette' };
  if (e.key === '?') return { type: 'help' };
  if (focus === 'widget') return null;
  const digit = DIGIT.exec(e.code);
  return digit ? { type: 'panel', index: Number(digit[1]) - 1 } : null;
}

export function useShellShortcuts(enabled: boolean, onAction: (action: ShellAction) => void) {
  const ref = useRef({ enabled, onAction });
  ref.current = { enabled, onAction };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ref.current.enabled || e.repeat) return;
      const action = resolveShellShortcut(e, focusKindOf(e.target), isModalOpen());
      if (!action) return;
      e.preventDefault();
      ref.current.onAction(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
