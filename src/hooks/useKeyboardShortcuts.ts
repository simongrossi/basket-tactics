import { useEffect, useRef } from 'react';
import type { Tool } from '@/lib/types';

// U03 — un seul gestionnaire clavier pour le terrain. Chaque touche est
// résolue en UNE action selon la vue, le mode (édition / lecteur /
// présentation), la lecture en cours et le focus. Les anciens gestionnaires
// concurrents (flèches de la timeline, du lecteur et de l'éditeur ; Espace
// du lecteur et de l'éditeur) sont remplacés par cette table.

export type ShortcutMode = 'edit' | 'player' | 'present';

export interface ShortcutContext {
  /** Raccourcis actifs uniquement quand le terrain est affiché. */
  courtVisible: boolean;
  mode: ShortcutMode;
  isPlaying: boolean;
  /** Une fenêtre modale ouverte garde le clavier pour elle. */
  modalOpen: boolean;
}

/** Nature de l'élément focus, qui peut consommer lui-même certaines touches. */
export type FocusKind = 'text' | 'button' | 'widget' | 'other';

export type ShortcutAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'playPause' }
  | { type: 'step'; delta: -1 | 1 }
  /** Déplacement fin dans la transition (resolution = subdivisions par étape). */
  | { type: 'scrub'; delta: -1 | 1; resolution: 10 | 60 }
  | { type: 'tool'; tool: Tool }
  | { type: 'deleteLastAnnotation' }
  | { type: 'exitPresent' };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export const TOOL_KEYS: Record<string, Tool> = {
  m: 'move',
  p: 'pass',
  d: 'dribble',
  r: 'cut',
  e: 'screen',
  t: 'text',
};

/** Libellés affichés dans les infobulles, alignés sur la table ci-dessous. */
export const SHORTCUT_LABELS = {
  undo: 'Ctrl/⌘+Z',
  redo: 'Ctrl/⌘+Maj+Z ou Ctrl/⌘+Y',
  coarseBack: 'Maj+←',
  coarseForward: 'Maj+→',
  fineBack: ',',
  fineForward: '.',
} as const;

export function resolveShortcut(
  e: KeyInput,
  focus: FocusKind,
  ctx: ShortcutContext,
): ShortcutAction | null {
  if (!ctx.courtVisible || ctx.modalOpen || focus === 'text') return null;
  const editing = ctx.mode === 'edit';
  const k = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    if (e.altKey || !editing || ctx.isPlaying) return null;
    if (k === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (k === 'y' && !e.shiftKey) return { type: 'redo' };
    return null;
  }
  if (e.altKey) return null;

  if (e.key === ' ' || e.key === 'Spacebar') {
    // Un bouton focus s'active lui-même avec Espace : pas de double action.
    return focus === 'button' || focus === 'widget' ? null : { type: 'playPause' };
  }
  if (e.key === 'Escape') {
    return ctx.mode === 'present' ? { type: 'exitPresent' } : null;
  }

  const arrow = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
  if (arrow !== 0) {
    if (focus === 'widget' || ctx.isPlaying) return null;
    if (e.shiftKey) {
      return editing ? { type: 'scrub', delta: arrow, resolution: 10 } : null;
    }
    return { type: 'step', delta: arrow };
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    // Télécommandes de présentation.
    if (editing || ctx.isPlaying) return null;
    return { type: 'step', delta: e.key === 'PageDown' ? 1 : -1 };
  }

  if (!editing || e.shiftKey) return null;
  if (e.key === ',' || e.key === '.') {
    return ctx.isPlaying ? null : { type: 'scrub', delta: e.key === '.' ? 1 : -1, resolution: 60 };
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return ctx.isPlaying ? null : { type: 'deleteLastAnnotation' };
  }
  const tool = TOOL_KEYS[k];
  return tool ? { type: 'tool', tool } : null;
}

const WIDGET_ROLES = new Set([
  'slider', 'tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'radio',
  'option', 'listbox', 'spinbutton', 'combobox', 'tree', 'treeitem', 'grid',
]);

export function focusKindOf(target: EventTarget | null): FocusKind {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return 'other';
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return 'text';
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return type === 'button' || type === 'submit' || type === 'reset' || type === 'checkbox' || type === 'radio'
      ? 'button'
      : 'text';
  }
  const role = target.getAttribute('role');
  if (role && WIDGET_ROLES.has(role)) return 'widget';
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || role === 'button') return 'button';
  return 'other';
}

/** Une fenêtre modale (role="dialog" aria-modal) est-elle ouverte ? */
export function isModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;
}

/** Position de scrub après un déplacement fin, bornée à la possession. */
export function scrubTarget(displayT: number, delta: number, resolution: number, totalT: number): number {
  const idx = Math.round(displayT * resolution) + delta;
  return Math.max(0, Math.min(totalT, idx / resolution));
}

export type ShortcutHandlers = Omit<ShortcutContext, 'modalOpen'> & {
  onAction: (action: ShortcutAction) => void;
};

export function useKeyboardShortcuts(h: ShortcutHandlers) {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    // Espace maintenu + glisser = déplacer la vue du terrain (CourtView) :
    // lecture/pause n'est déclenchée qu'au relâchement d'un appui simple.
    let spaceDown = false;
    let spaceUsedForPan = false;

    const context = (): ShortcutContext => ({
      courtVisible: ref.current.courtVisible,
      mode: ref.current.mode,
      isPlaying: ref.current.isPlaying,
      modalOpen: isModalOpen(),
    });

    const onKeyDown = (e: KeyboardEvent) => {
      const action = resolveShortcut(e, focusKindOf(e.target), context());
      if (!action) return;
      e.preventDefault();
      if (action.type === 'playPause') {
        if (!e.repeat && !spaceDown) {
          spaceDown = true;
          spaceUsedForPan = false;
        }
        return;
      }
      ref.current.onAction(action);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      if (!spaceDown) return;
      spaceDown = false;
      if (spaceUsedForPan) return;
      const action = resolveShortcut(e, focusKindOf(e.target), context());
      if (action?.type === 'playPause') ref.current.onAction(action);
    };
    const onPointerDown = () => {
      if (spaceDown) spaceUsedForPan = true;
    };
    const onBlur = () => { spaceDown = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
