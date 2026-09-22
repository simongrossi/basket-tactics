import { describe, expect, it } from 'vitest';
import type { PracticeSession, SessionBlock } from '../practiceSessions';
import {
  blockRemainingMs,
  blockVisual,
  formatCountdown,
  isTimerRunning,
  parseSessionRun,
  pauseTimer,
  reconcileRun,
  resetTimer,
  startRun,
  startTimer,
  timerElapsedMs,
} from '../sessionRun';

const block = (patch: Partial<SessionBlock> = {}): SessionBlock => ({
  id: 'b', kind: 'free', title: 'Bloc', durationMin: 10, ...patch,
});
const session = (n: number): PracticeSession => ({
  id: 's1', name: 'Séance', createdAt: 0, updatedAt: 0,
  blocks: Array.from({ length: n }, (_, i) => block({ id: `b${i}`, title: `Bloc ${i + 1}` })),
});

describe('minuteur de bloc', () => {
  it('cumule les phases de marche et ignore les pauses', () => {
    let t = resetTimer();
    expect(isTimerRunning(t)).toBe(false);
    t = startTimer(t, 1_000);
    expect(timerElapsedMs(t, 61_000)).toBe(60_000);
    t = pauseTimer(t, 61_000);
    expect(timerElapsedMs(t, 500_000)).toBe(60_000);
    t = startTimer(t, 500_000);
    expect(timerElapsedMs(t, 530_000)).toBe(90_000);
  });

  it('démarrer deux fois ne remet pas le départ à zéro', () => {
    const t = startTimer(resetTimer(), 1_000);
    expect(startTimer(t, 9_000)).toBe(t);
  });

  it('temps restant, puis dépassement affiché avec +', () => {
    const t = startTimer(resetTimer(), 0);
    const b = block({ durationMin: 2 });
    expect(formatCountdown(blockRemainingMs(b, t, 0))).toBe('02:00');
    expect(formatCountdown(blockRemainingMs(b, t, 30_500))).toBe('01:30');
    expect(formatCountdown(blockRemainingMs(b, t, 120_000))).toBe('00:00');
    expect(formatCountdown(blockRemainingMs(b, t, 150_000))).toBe('+00:30');
  });
});

describe('déroulé', () => {
  it('démarre à un bloc donné, minuteur arrêté, brouillon pas encore mis de côté', () => {
    expect(startRun('s1', 2)).toEqual({
      sessionId: 's1', blockIndex: 2, timer: { elapsedMs: 0, runningSince: null }, draftProtected: false,
    });
  });

  it('reste rattaché à la séance quand des blocs sont supprimés', () => {
    const run = { ...startRun('s1', 4), timer: { elapsedMs: 5, runningSince: null } };
    expect(reconcileRun(run, [session(5)])).toBe(run);
    const trimmed = reconcileRun(run, [session(3)]);
    expect(trimmed?.blockIndex).toBe(2);
    expect(trimmed?.timer.elapsedMs).toBe(0);
  });

  it('s’arrête si la séance disparaît ou n’a plus de bloc', () => {
    expect(reconcileRun(startRun('s1'), [])).toBeNull();
    expect(reconcileRun(startRun('s1'), [session(0)])).toBeNull();
    expect(reconcileRun(null, [session(2)])).toBeNull();
  });

  it('survit à un rechargement (sérialisation) et rejette un contenu invalide', () => {
    const run = { ...startRun('s1', 1), timer: { elapsedMs: 42, runningSince: 1_000 }, draftProtected: true };
    expect(parseSessionRun(JSON.stringify(run))).toEqual(run);
    expect(parseSessionRun('{"sessionId":3}')).toBeNull();
    expect(parseSessionRun('pas du json')).toBeNull();
    expect(parseSessionRun(null)).toBeNull();
  });
});

describe('visuel d’un bloc', () => {
  const exists = (id: string) => id === 'sys-ok';
  it('système existant, exercice intégré, ou carte de bloc libre', () => {
    expect(blockVisual(block({ kind: 'system', systemId: 'sys-ok' }), exists)).toEqual({ kind: 'system', systemId: 'sys-ok' });
    expect(blockVisual(block({ templateId: 'drill-philadelphia' }), exists)).toEqual({ kind: 'template', templateId: 'drill-philadelphia' });
    expect(blockVisual(block(), exists)).toEqual({ kind: 'none' });
  });

  it('un système supprimé (bloc orphelin) n’affiche pas un autre système', () => {
    expect(blockVisual(block({ kind: 'system', systemId: 'sys-gone' }), exists)).toEqual({ kind: 'none' });
  });
});
