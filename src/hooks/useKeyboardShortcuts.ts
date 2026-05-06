import { useEffect } from 'react';
import type { Tool } from '@/lib/types';

type Handlers = {
  onPlayPause: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onSetTool: (t: Tool) => void;
  onDeleteLastAnnotation: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

const TOOL_KEYS: Record<string, Tool> = {
  m: 'move',
  p: 'pass',
  d: 'dribble',
  r: 'cut',
  e: 'screen',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function useKeyboardShortcuts(h: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // Undo / Redo : interceptés AVANT le filtre des modificateurs.
      // Ctrl/Cmd+Z = undo. Ctrl/Cmd+Shift+Z ou Ctrl/Cmd+Y = redo.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          h.onUndo();
          return;
        }
        if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          h.onRedo();
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        h.onPlayPause();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        h.onPrevStep();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        h.onNextStep();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        h.onDeleteLastAnnotation();
        return;
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        h.onSetTool(tool);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [h]);
}
