import type { AppState } from '@/lib/types';

export const HISTORY_LIMIT = 50;

export interface AppStateHistory {
  past: AppState[];
  future: AppState[];
}

export function pushHistorySnapshot(
  history: AppStateHistory,
  snapshot: AppState,
  limit: number = HISTORY_LIMIT
): void {
  history.past.push(snapshot);
  if (history.past.length > limit) {
    history.past.shift();
  }
  history.future = [];
}

export function commitCoalescedHistory(
  history: AppStateHistory,
  anchor: AppState | null,
  current: AppState,
  limit: number = HISTORY_LIMIT
): boolean {
  if (!anchor || current === anchor) return false;
  pushHistorySnapshot(history, anchor, limit);
  return true;
}

export function undoFromHistory(history: AppStateHistory, current: AppState): AppState {
  const prev = history.past.pop();
  if (!prev) return current;
  history.future.push(current);
  return prev;
}

export function redoFromHistory(history: AppStateHistory, current: AppState): AppState {
  const next = history.future.pop();
  if (!next) return current;
  history.past.push(current);
  return next;
}
