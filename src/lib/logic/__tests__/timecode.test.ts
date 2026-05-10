import { describe, it, expect } from 'vitest';
import {
  formatClock,
  formatShotClock,
  getSecondsPerStep,
  getPossessionSeconds,
  realStepToSeconds,
  shotClockAt,
  totalDurationSeconds,
  DEFAULT_SECONDS_PER_STEP,
  DEFAULT_POSSESSION_SECONDS,
} from '../timecode';
import type { AppState } from '../../types';

function mkState(partial: Partial<AppState> = {}): AppState {
  return {
    steps: [
      { off: {} as never, ballCarrier: 'O1', annotations: [] },
      { off: {} as never, ballCarrier: 'O1', annotations: [] },
      { off: {} as never, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    playerCount: 5,
    defenseInitial: {} as never,
    defenseDistance: 40,
    defenseMaxSpeed: 110,
    triggers: { drive: true, post: false, paint: true, trap: false },
    rules: {} as never,
    screenRule: 'hedge',
    screenRadius: 35,
    dropDepth: 'medium',
    showHelpLines: true,
    showMatchups: true,
    tool: 'screen',
    defenseSystem: 'man',
    zoneConfig: {} as never,
    offBallScreenRule: 'over',
    fullCourt: false,
    showPassLanes: false,
    ...partial,
  } as AppState;
}

describe('timecode — Étape 13', () => {
  describe('getSecondsPerStep', () => {
    it('renvoie la valeur définie', () => {
      expect(getSecondsPerStep(mkState({ secondsPerStep: 3 }))).toBe(3);
    });
    it('renvoie le défaut quand indéfini', () => {
      expect(getSecondsPerStep(mkState())).toBe(DEFAULT_SECONDS_PER_STEP);
    });
    it('renvoie le défaut quand invalide (négatif, NaN)', () => {
      expect(getSecondsPerStep(mkState({ secondsPerStep: -1 }))).toBe(DEFAULT_SECONDS_PER_STEP);
      expect(getSecondsPerStep(mkState({ secondsPerStep: NaN }))).toBe(DEFAULT_SECONDS_PER_STEP);
    });
  });

  describe('getPossessionSeconds', () => {
    it('renvoie la valeur définie', () => {
      expect(getPossessionSeconds(mkState({ possessionSeconds: 14 }))).toBe(14);
    });
    it('renvoie le défaut quand indéfini', () => {
      expect(getPossessionSeconds(mkState())).toBe(DEFAULT_POSSESSION_SECONDS);
    });
  });

  describe('realStepToSeconds', () => {
    it('multiplie l\'index par secondsPerStep', () => {
      const s = mkState({ secondsPerStep: 4 });
      expect(realStepToSeconds(s, 0)).toBe(0);
      expect(realStepToSeconds(s, 1)).toBe(4);
      expect(realStepToSeconds(s, 2.5)).toBe(10);
    });
    it('clamp à 0 si index négatif', () => {
      expect(realStepToSeconds(mkState(), -1)).toBe(0);
    });
  });

  describe('shotClockAt', () => {
    it('décroît au fil des étapes', () => {
      const s = mkState({ secondsPerStep: 4, possessionSeconds: 24 });
      expect(shotClockAt(s, 0)).toBe(24);
      expect(shotClockAt(s, 1)).toBe(20);
      expect(shotClockAt(s, 6)).toBe(0);
    });
    it('clamp à 0 quand la possession est dépassée', () => {
      const s = mkState({ secondsPerStep: 4, possessionSeconds: 24 });
      expect(shotClockAt(s, 10)).toBe(0);
    });
  });

  describe('totalDurationSeconds', () => {
    it('renvoie (N-1) × secondsPerStep pour N étapes réelles', () => {
      const s = mkState({ secondsPerStep: 4 }); // 3 steps réels
      expect(totalDurationSeconds(s)).toBe(8);
    });
    it('renvoie 0 si <= 1 étape', () => {
      const s = mkState({
        secondsPerStep: 4,
        steps: [{ off: {} as never, ballCarrier: 'O1', annotations: [] }],
      });
      expect(totalDurationSeconds(s)).toBe(0);
    });
    it('ignore les steps interpolés', () => {
      const s = mkState({
        secondsPerStep: 4,
        steps: [
          { off: {} as never, ballCarrier: 'O1', annotations: [] },
          { off: {} as never, ballCarrier: 'O1', annotations: [], isInterpolated: true },
          { off: {} as never, ballCarrier: 'O1', annotations: [] },
        ],
      });
      expect(totalDurationSeconds(s)).toBe(4); // 2 real steps → 1 transition × 4s
    });
  });

  describe('formatClock', () => {
    it('formate M:SS', () => {
      expect(formatClock(0)).toBe('0:00');
      expect(formatClock(5)).toBe('0:05');
      expect(formatClock(60)).toBe('1:00');
      expect(formatClock(75)).toBe('1:15');
      expect(formatClock(125)).toBe('2:05');
    });
    it('clamp à 0 si négatif', () => {
      expect(formatClock(-5)).toBe('0:00');
    });
  });

  describe('formatShotClock', () => {
    it('affiche en entiers au-dessus de 5s', () => {
      expect(formatShotClock(24)).toBe('24');
      expect(formatShotClock(10)).toBe('10');
      expect(formatShotClock(5.5)).toBe('6');
    });
    it('affiche un dixième sous 5s', () => {
      expect(formatShotClock(4.7)).toBe('4.7');
      expect(formatShotClock(2.3)).toBe('2.3');
      expect(formatShotClock(0)).toBe('0.0');
    });
  });
});
