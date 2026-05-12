import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { moveAttackerInState } from '../playerMove';
import {
  commitCoalescedHistory,
  pushHistorySnapshot,
  redoFromHistory,
  undoFromHistory,
  type AppStateHistory,
} from '../appStateHistory';

describe('appStateHistory — drag coalescé', () => {
  it('un drag avec plusieurs updates ne crée qu’une seule entrée undo', () => {
    const history: AppStateHistory = { past: [], future: [] };
    const anchor = makeInitialState();
    let current = moveAttackerInState(anchor, 'O1', { x: 310, y: 460 });
    current = moveAttackerInState(current, 'O1', { x: 320, y: 450 });
    current = moveAttackerInState(current, 'O1', { x: 330, y: 440 });

    expect(commitCoalescedHistory(history, anchor, current)).toBe(true);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toBe(anchor);

    const undone = undoFromHistory(history, current);
    expect(undone).toBe(anchor);
    expect(history.future).toEqual([current]);
  });

  it('un drag sans mouvement ne pousse rien dans l’historique', () => {
    const history: AppStateHistory = { past: [], future: [] };
    const anchor = makeInitialState();

    expect(commitCoalescedHistory(history, anchor, anchor)).toBe(false);
    expect(history.past).toHaveLength(0);
  });

  it('un nouveau snapshot vide la pile redo', () => {
    const history: AppStateHistory = { past: [], future: [] };
    const first = makeInitialState();
    const second = moveAttackerInState(first, 'O1', { x: 310, y: 460 });
    pushHistorySnapshot(history, first);
    const undone = undoFromHistory(history, second);
    expect(undone).toBe(first);
    expect(history.future).toEqual([second]);

    pushHistorySnapshot(history, first);
    expect(history.future).toHaveLength(0);
  });

  it('redo restaure l’état futur après undo', () => {
    const history: AppStateHistory = { past: [], future: [] };
    const first = makeInitialState();
    const second = moveAttackerInState(first, 'O1', { x: 310, y: 460 });
    pushHistorySnapshot(history, first);

    const undone = undoFromHistory(history, second);
    const redone = redoFromHistory(history, undone);

    expect(redone).toBe(second);
    expect(history.past).toEqual([first]);
  });
});
