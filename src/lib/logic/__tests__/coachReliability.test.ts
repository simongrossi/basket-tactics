import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { HOOP, HOOP_OPPOSITE, MIDLINE_Y } from '@/lib/data/court';
import type { ComputedDefense, Point } from '@/lib/types';
import { computeAttackerThreats, shotPointsAt } from '../threats';
import { evaluateOffensiveOptions } from '../offense';
import { computeCoachDiagnostics } from '../coachDiagnostics';
import { detectFoulToGiveOpportunity } from '../defense/detectFoulToGiveOpportunity';
import { detectEndOfClockContest } from '../defense/detectEndOfClockContest';
import { createInitialMatchState, tickMatch, MATCH_TICK_MS } from '../match/gameLoop';

describe('cohérence coach FIBA', () => {
  it.each([
    [{ x: 300, y: 295 }, 2], // 220 px : à l'intérieur de l'arc dessiné
    [{ x: 300, y: 325 }, 2], // sur la ligne
    [{ x: 300, y: 326 }, 3],
    [{ x: 53, y: 75 }, 2], // segment droit du coin
    [{ x: 52, y: 75 }, 3], // 248 px du panier, mais derrière la ligne du coin
    [{ x: 548, y: 75 }, 3],
  ] as [Point, number][])('valorise le tir %j à %s points dans les deux sens', (pos, points) => {
    expect(shotPointsAt(pos, HOOP)).toBe(points);
    expect(shotPointsAt({ x: pos.x, y: 2 * MIDLINE_Y - pos.y }, HOOP_OPPOSITE)).toBe(points);
    const state = makeInitialState();
    state.steps[0].off.O1 = pos;
    const shoot = evaluateOffensiveOptions(state.steps[0].off, {} as ComputedDefense, 'O1').find(a => a.type === 'shoot')!;
    expect(shoot.shotPoints).toBe(points);
  });

  it('applique le même profil au tir du porteur et du receveur', () => {
    const state = makeInitialState();
    const off = state.steps[0].off;
    off.O2 = { x: 300, y: 340 };
    const def = {} as ComputedDefense;
    const score = (profile: 'shooter' | 'non-shooter') => {
      const profiles = { ...state.attackerProfiles!, O2: profile };
      const direct = evaluateOffensiveOptions(off, def, 'O2', HOOP, profiles).find(a => a.type === 'shoot')!;
      const pass = evaluateOffensiveOptions(off, def, 'O1', HOOP, profiles).find(a => a.targetId === 'O2')!;
      expect(direct.scoreProbability).toBe(pass.scoreProbability);
      expect(direct.scoreProbability).toBe(computeAttackerThreats(off, def, 'O2', HOOP, profiles).O2.shotQuality);
      return direct.scoreProbability;
    };
    expect(score('shooter')).toBeGreaterThan(score('non-shooter'));
  });

  it('bascule de faute à donner vers sans faute dès quatre fautes collectives', () => {
    const state = makeInitialState();
    state.steps.push({ ...structuredClone(state.steps[0]), clockSeconds: 4.5 });
    state.steps[1].off.O1 = { x: 290, y: 280 };
    state.defenseTeamFouls = 3;
    expect(detectFoulToGiveOpportunity(state, 1)).not.toBeNull();
    expect(detectEndOfClockContest(state, 1)).toBeNull();
    state.defenseTeamFouls = 4;
    expect(detectFoulToGiveOpportunity(state, 1)).toBeNull();
    expect(detectEndOfClockContest(state, 1)).not.toBeNull();
  });

  it('ne présente pas de trois secondes défensives comme une violation FIBA', () => {
    const state = makeInitialState();
    state.steps = Array.from({ length: 4 }, () => ({
      ...structuredClone(state.steps[0]), duration: 4,
      off: { O1: { x: 80, y: 450 }, O2: { x: 190, y: 450 }, O3: { x: 300, y: 450 }, O4: { x: 410, y: 450 }, O5: { x: 520, y: 450 } },
      defenseOverrides: { D5: { x: 300, y: 130 } },
    }));
    expect(computeCoachDiagnostics(state, 3).some(d => d.tag === 'defensive-3sec')).toBe(false);
  });

  it.each(['offensive', 'defensive'] as const)('conserve le rebond %s annoncé pendant toute la transition', (type) => {
    const base = makeInitialState();
    base.fullCourt = true;
    let state = createInitialMatchState(base, { seed: 1, maxPossessions: 5 });
    state = { ...state, outcome: 'shot-missed', pendingRebound: {
      type, rebounder: type === 'offensive' ? 'O5' : 'D5',
      position: { x: 330, y: 120 }, weights: {},
    } };
    for (let n = 0; n < 100; n++) {
      state = tickMatch(state, MATCH_TICK_MS, base);
      if (state.outcome === null) break;
    }
    expect(state.outcome).toBeNull();
    expect(state.attackingTeam).toBe(type === 'offensive' ? 'home' : 'away');
    expect(state.teamStats[type === 'offensive' ? 'home' : 'away'][type === 'offensive' ? 'oReb' : 'dReb']).toBe(1);
    if (type === 'offensive') expect(state.carrier).toBe('O5');
  });
});
