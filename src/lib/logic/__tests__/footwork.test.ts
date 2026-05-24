import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions, getMatchupsAt } from '@/lib/logic/engine';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';


function makeFootworkScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const off1: AttackerPositions = {
    O1: { x: 300, y: 200 },
    O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const def0: DefenderPositions = {
    D1: { x: 300, y: 500 }, D2: { x: 130, y: 410 }, D3: { x: 470, y: 410 },
    D4: { x: 240, y: 230 }, D5: { x: 360, y: 230 },
  };
  return {
    ...base,
    steps: [
      { off: off0, ballCarrier: 'O1', annotations: [] },
      { off: off1, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    defenseInitial: def0,
    footworkRulesEnabled: true,
    ...overrides,
  };
}

describe('Footwork & Biomechanics', () => {
  describe('1. Speed modulation by body orientation', () => {
    it('moving forward (0 deg relative to orientation) has full speed', () => {
      // D1 body is pointing North (0 deg). Target is North (0 deg).
      const state = makeFootworkScenario({
        steps: [
          { off: { O1: { x: 300, y: 500 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
          { off: { O1: { x: 300, y: 100 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
        ],
        defenseInitial: {
          D1: { x: 300, y: 400 }, D2: { x: 100, y: 200 }, D3: { x: 500, y: 200 },
          D4: { x: 200, y: 200 }, D5: { x: 400, y: 200 },
        },
        rules: {
          D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', bodyOrientation: 0, maxSpeed: 100 },
          D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D4: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D5: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
        }
      });
      const def0 = effectiveDefensePositions(state, 0);
      const def1 = effectiveDefensePositions(state, 1);
      const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
      // Max speed is 100, no reduction since moving forward.
      expect(dist).toBeCloseTo(100, 1);
    });

    it('moving laterally (90 deg relative to orientation) has max 25% reduction', () => {
      // D1 body is pointing North (0 deg). Target is East (90 deg).
      const state = makeFootworkScenario({
        steps: [
          { off: { O1: { x: 300, y: 400 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
          { off: { O1: { x: 500, y: 400 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
        ],
        defenseInitial: {
          D1: { x: 300, y: 400 }, D2: { x: 100, y: 200 }, D3: { x: 500, y: 200 },
          D4: { x: 200, y: 200 }, D5: { x: 400, y: 200 },
        },
        rules: {
          D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', bodyOrientation: 0, maxSpeed: 100 },
          D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D4: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D5: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
        }
      });
      const def0 = effectiveDefensePositions(state, 0);
      const def1 = effectiveDefensePositions(state, 1);
      const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
      // Lateral movement -> 25% speed reduction -> max distance 75
      expect(dist).toBeCloseTo(75, 0);
    });

    it('moving backward (180 deg relative to orientation) has max 40% reduction', () => {
      // D1 body is pointing North (0 deg). Target is South (180 deg).
      const state = makeFootworkScenario({
        steps: [
          { off: { O1: { x: 300, y: 400 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
          { off: { O1: { x: 300, y: 600 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } }, ballCarrier: 'O1', annotations: [] },
        ],
        defenseInitial: {
          D1: { x: 300, y: 400 }, D2: { x: 100, y: 200 }, D3: { x: 500, y: 200 },
          D4: { x: 200, y: 200 }, D5: { x: 400, y: 200 },
        },
        rules: {
          D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', bodyOrientation: 0, maxSpeed: 100 },
          D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D4: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D5: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
        }
      });
      const def0 = effectiveDefensePositions(state, 0);
      const def1 = effectiveDefensePositions(state, 1);
      const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
      // Backward movement -> 40% speed reduction -> max distance 60
      expect(dist).toBeCloseTo(60, 1);
    });
  });

  describe('2. Visual Reaction Latency', () => {
    it('should freeze defender for 200 ms if pass starts in blind spot', () => {
      // Step duration is 4 seconds. 200 ms latency = 0.05 fraction.
      // D1 is between O1 (300, 200) and the hoop (North), so D1 is at (300, 166).
      // D1's gaze is pointing South (180 deg) towards their matchup O1.
      // O2 has the ball at (300, 100), which is North of D1 (in D1's blind spot).
      // A pass starts from O2 at step 0.
      const state = makeFootworkScenario({
        steps: [
          {
            off: { O1: { x: 300, y: 200 }, O2: { x: 300, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } },
            ballCarrier: 'O2',
            annotations: [{ type: 'pass', fromId: 'O2', toId: 'O1', from: { x: 300, y: 100 }, to: { x: 300, y: 200 } }],
          },
          {
            off: { O1: { x: 100, y: 200 }, O2: { x: 300, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } },
            ballCarrier: 'O1',
            annotations: [],
          },
        ],
        defenseInitial: {
          D1: { x: 300, y: 400 }, D2: { x: 100, y: 200 }, D3: { x: 500, y: 200 },
          D4: { x: 200, y: 200 }, D5: { x: 400, y: 200 },
        },
        rules: {
          D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', bodyOrientation: 180, maxSpeed: 100 },
          D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D4: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D5: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
        }
      });

      const matches = getMatchupsAt(state.steps, 0, state.playerCount);
      const matched = matches.D1;
      const prevStep = state.steps[0];
      const hasPassTrigger = prevStep.annotations.some(ann => ann.type === 'pass');
      const hasCutTrigger = prevStep.annotations.some(ann => ann.type === 'cut' && ann.fromId === matched);
      const prevComputed = effectiveDefensePositions(state, 0);

      console.log('LATENCY TEST MATCHUPS:', matches);
      console.log('LATENCY TEST PASS TRIGGER:', hasPassTrigger);
      console.log('LATENCY TEST D1 PREV COMPUTED:', prevComputed.D1);

      const def1 = effectiveDefensePositions(state, 1);
      // delayFraction = 0.2 / 4.0 = 0.05
      expect(def1.D1.delayFraction).toBeCloseTo(0.05, 5);

      // Verify that resolveFrameAt freezes D1 for localT <= 0.05
      const frameStart = resolveFrameAt(state, 0.02);
      expect(frameStart).not.toBeNull();
      expect(frameStart!.defPos.D1.x).toBeCloseTo(prevComputed.D1.x, 2);
      expect(frameStart!.defPos.D1.y).toBeCloseTo(prevComputed.D1.y, 2);

      // Verify that for localT > 0.05, D1 moves
      const frameEnd = resolveFrameAt(state, 0.5);
      expect(frameEnd).not.toBeNull();
      // O2 is at (100, 100), D1 should be moving towards O2
      expect(frameEnd!.defPos.D1.x).not.toBeCloseTo(prevComputed.D1.x, 2);
    });
  });

  describe('3. Plant-and-cut Pivot Delay', () => {
    it('should freeze defender for pivot delay if direction change > 90 deg and significant movement', () => {
      // 3 steps scenario:
      // Step 0: D1 starts at (300, 500)
      // Step 1: D1 runs to (300, 400) -> significant movement (100px)
      // Step 2: D1 runs back to (300, 500) -> significant movement (100px) and 180 deg turn (> 90 deg)
      const off0: AttackerPositions = { O1: { x: 300, y: 500 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } };
      const off1: AttackerPositions = { O1: { x: 300, y: 400 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } };
      const off2: AttackerPositions = { O1: { x: 300, y: 500 }, O2: { x: 100, y: 100 }, O3: { x: 500, y: 100 }, O4: { x: 200, y: 100 }, O5: { x: 400, y: 100 } };

      const state = makeFootworkScenario({
        steps: [
          { off: off0, ballCarrier: 'O1', annotations: [] },
          { off: off1, ballCarrier: 'O1', annotations: [] },
          { off: off2, ballCarrier: 'O1', annotations: [] },
        ],
        defenseInitial: {
          D1: { x: 300, y: 500 }, D2: { x: 100, y: 200 }, D3: { x: 500, y: 200 },
          D4: { x: 200, y: 200 }, D5: { x: 400, y: 200 },
        },
        rules: {
          D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 150 },
          D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D4: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
          D5: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 100 },
        }
      });

      // Step 2 has the pivot: D1 turned back from going North to going South.
      const def0 = effectiveDefensePositions(state, 0);
      const def1 = effectiveDefensePositions(state, 1);
      const def2 = effectiveDefensePositions(state, 2);
      console.log('D1 Step 0:', def0.D1);
      console.log('D1 Step 1:', def1.D1);
      console.log('D1 Step 2:', def2.D1);

      // Turn is 180 degrees -> pivotDelaySec = 0.3 seconds.
      // Step duration is 4 seconds -> delayFraction = 0.3 / 4.0 = 0.075.
      expect(def2.D1.delayFraction).toBeCloseTo(0.075, 5);

      // Verify that resolveFrameAt freezes D1 at the start of step 2 (i.e. t=1.02, which is 0.02 into transition step 1->2)
      const frameStart = resolveFrameAt(state, 1.02);
      console.log('D1 frame at 1.02:', frameStart?.defPos.D1);
      expect(frameStart).not.toBeNull();
      // Position at the end of step 1 was (300, 400)
      expect(frameStart!.defPos.D1.x).toBeCloseTo(300, 1);
      expect(frameStart!.defPos.D1.y).toBeCloseTo(def1.D1.y, 1);
    });
  });
});
