import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeAppInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { resolveTimelineFrame } from '@/lib/logic/playback/frameResolver';
import { fullStepToSeconds, secondsToFullStep, totalDurationSeconds } from '@/lib/logic/timecode';
import type { AppState } from '@/lib/types';
import { importState, loadTemplate, setPlayerCount } from '../transforms/coreTransforms';
import {
  decodeSituationCode, encodeSituationCode, encodeAnimationCode, MAX_SITUATION_CODE_LENGTH,
  MAX_SITUATION_JSON_BYTES, ANIMATION_CODE_PREFIX, MIN_ANIMATION_SPEED, MAX_ANIMATION_SPEED,
} from '../situationCode';

function pack(value: unknown, prefix = 'BT1:'): string {
  return prefix + deflateSync(JSON.stringify(value)).toString('base64url');
}

const jsonCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe('situationCode', () => {
  it('preserves steps, defensive rules, zone settings, overrides and fractional time without a local library identity', async () => {
    const state = loadTemplate(makeAppInitialState(), TEMPLATES[0]);
    state.librarySystemId = 'local-library-id';
    state.activeStep = 1;
    state.defenseSystem = 'zone';
    state.zoneConfig.type = 'zone-2-1-2';
    state.rules.D5 = { ...state.rules.D5, maxSpeed: undefined, helpPct: 83, helpMode: 'auto' };
    state.playerNames = { O1: 'Élodie 🏀', D5: 'Pivot' };
    state.coverageRollSeed = 847;
    state.footworkRulesEnabled = false;
    state.steps[1].defenseOverrides = { D3: { x: 420, y: 190 } };
    const frame = resolveTimelineFrame(state, 0.4)!;
    const view = { time: 0.4, source: 'timeline' as const, frame };
    const code = await encodeSituationCode(state, view);
    const decoded = await decodeSituationCode(code);
    expect(code).toMatch(/^BT1:[\w-]+$/);
    expect(decoded.state).toEqual({ ...jsonCopy(state), librarySystemId: undefined });
    expect(decoded.view).toEqual(jsonCopy(view));
    expect(decoded.state.steps[0].defenseOverrides).toBeUndefined();
    expect(decoded.state.rules.D5.maxSpeed).toBeUndefined();
    expect(decoded.state.footworkRulesEnabled).toBe(false);
    expect(JSON.parse(inflateSync(Buffer.from(code.slice(4), 'base64url')).toString()).state).not.toHaveProperty('librarySystemId');
    // The same protected UI import transform still accepts the restored state.
    expect(importState(decoded.state).zoneConfig.type).toBe('zone-2-1-2');
    expect(resolveTimelineFrame(decoded.state, decoded.view!.time!)?.defPos).toEqual(frame.defPos);
  });

  it.each(TEMPLATES.map(template => [template.id, template] as const))('round-trips built-in %s in every game format', async (_id, template) => {
    for (const count of [2, 3, 4, 5] as const) {
      const state = setPlayerCount(loadTemplate(makeAppInitialState(), template), count);
      const decoded = await decodeSituationCode(await encodeSituationCode(state));
      expect(decoded.state).toEqual({ ...jsonCopy(state), librarySystemId: undefined });
    }
  });

  it('preserves reduced-format displayed frames and accepts wrapped pasted codes', async () => {
    const state = setPlayerCount(loadTemplate(makeAppInitialState(), TEMPLATES[0]), 3);
    const view = { time: 0.3, source: 'timeline' as const, frame: resolveTimelineFrame(state, 0.3)! };
    const code = await encodeSituationCode(state, view);
    const wrapped = ' \n' + code.slice(0, 90) + '\n' + code.slice(90) + ' \n';
    expect((await decodeSituationCode(wrapped)).view).toEqual(jsonCopy(view));
  });

  it.each(['', 'not a code', 'BT1:', 'BT1:@@@', 'BT1:abcd', 'BT1:abcde'])('rejects malformed text %s', async code => {
    await expect(decodeSituationCode(code)).rejects.toThrow('invalide');
  });

  it('rejects unsupported versions in either header or envelope', async () => {
    await expect(decodeSituationCode('BT2:abcd')).rejects.toThrow('version');
    await expect(decodeSituationCode(pack({ version: 2, state: makeAppInitialState() }))).rejects.toThrow('version');
  });

  it.each([
    { steps: [] }, { steps: null }, { activeStep: -1 }, { activeStep: 0.5 }, { activeStep: 999 },
    { playerCount: 12 }, { rules: null }, { defenseInitial: { D1: { x: null, y: 3 } } },
    { defenseSystem: 'invented' }, { scriptedActions: 'invalid' },
    { steps: [{ off: {}, ballCarrier: 'O1', annotations: [] }] },
  ])('rejects malformed state %j', async patch => {
    await expect(decodeSituationCode(pack({ version: 1, state: { ...makeAppInitialState(), ...patch } }))).rejects.toThrow('invalide');
  });

  it('rejects malformed annotation coordinates and view time', async () => {
    const state = makeAppInitialState();
    const step = state.steps[0];
    const badState = { ...state, steps: [{ ...step, annotations: [{ type: 'cut', fromId: 'O1', from: { x: 1, y: 2 }, to: { x: 'NaN', y: 3 } }] }] };
    await expect(decodeSituationCode(pack({ version: 1, state: badState }))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ version: 1, state, view: { source: 'timeline', time: 99 } }))).rejects.toThrow('invalide');
  });

  it('rejects oversized input and compressed expansion before import', async () => {
    await expect(decodeSituationCode('BT1:' + 'a'.repeat(MAX_SITUATION_CODE_LENGTH))).rejects.toThrow('volumineuse');
    const state: AppState = { ...makeAppInitialState(), playerNames: { O1: 'x'.repeat(MAX_SITUATION_JSON_BYTES) } };
    await expect(encodeSituationCode(state)).rejects.toThrow('volumineuse');
    await expect(decodeSituationCode(pack({ version: 1, state }))).rejects.toThrow('volumineuse');
  });

  it('rejects prototype keys and excessive nesting', async () => {
    const state = makeAppInitialState();
    const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
    await expect(decodeSituationCode(pack({ version: 1, state: { ...state, extra: unsafe } }))).rejects.toThrow('invalide');
    let nested: unknown = {};
    for (let i = 0; i < 66; i++) nested = { child: nested };
    await expect(decodeSituationCode(pack({ version: 1, state, nested }))).rejects.toThrow('invalide');
  });
});

describe('animationCode', () => {
  const animationState = () => loadTemplate(makeAppInitialState(), TEMPLATES[0]);

  it('preserves playback start, speed and timing, reproducing the same frames throughout the timeline', async () => {
    const state = animationState();
    state.librarySystemId = 'local-animation';
    state.secondsPerStep = 2.4;
    state.steps[0].duration = 1.8;
    state.steps[1].duration = 3.2;
    const annotation = state.steps.flatMap(step => step.annotations)[0];
    annotation.tStartAbs = 0.2;
    annotation.tEndAbs = 1.6;
    const animation = { startT: 0.35, speed: 1.4 };
    const view = { time: 0.35, source: 'timeline' as const, frame: resolveTimelineFrame(state, 0.35)! };
    const code = await encodeAnimationCode(state, animation, view);
    expect(code.startsWith(ANIMATION_CODE_PREFIX)).toBe(true);
    const decoded = await decodeSituationCode(code);
    expect(decoded.animation).toEqual(animation);
    expect(decoded.state).toEqual({ ...jsonCopy(state), librarySystemId: undefined });
    expect(decoded.view).toEqual(jsonCopy(view));
    expect(decoded.state.steps.every(step => !step.defenseOverrides)).toBe(true);
    const restored = importState(decoded.state);
    const total = totalDurationSeconds(state);
    expect(totalDurationSeconds(restored)).toBe(total);
    const start = fullStepToSeconds(state, animation.startT);
    const restoredStart = fullStepToSeconds(restored, decoded.animation!.startT);
    expect(restoredStart).toBe(start);
    for (const wallSeconds of [0, 0.1, 0.4, 0.8, 1.5, 2.7, total / animation.speed]) {
      const beforeT = secondsToFullStep(state, start + wallSeconds * animation.speed);
      const afterT = secondsToFullStep(restored, restoredStart + wallSeconds * decoded.animation!.speed);
      expect(afterT).toBe(beforeT);
      expect(resolveTimelineFrame(restored, afterT)).toEqual(resolveTimelineFrame(state, beforeT));
    }
    const json = JSON.parse(inflateSync(Buffer.from(code.slice(ANIMATION_CODE_PREFIX.length), 'base64url')).toString());
    expect(json.state).not.toHaveProperty('librarySystemId');
  });

  it('preserves scenario branches and seeded decisions', async () => {
    const template = TEMPLATES.find(item => item.scenarioBranches?.length)!;
    const state = loadTemplate(makeAppInitialState(), template);
    state.activeBranchId = state.scenarioBranches![0].id;
    state.probabilisticReadsEnabled = true;
    state.coverageRollSeed = 482;
    state.coverageDistribution = [{ coverage: 'drop', weight: 1 }, { coverage: 'switch', weight: 2 }];
    const decoded = await decodeSituationCode(await encodeAnimationCode(state, { startT: 0, speed: 1 }));
    expect(decoded.state).toEqual({ ...jsonCopy(state), librarySystemId: undefined });
  });

  it('round-trips every built-in animation and reduced game formats', async () => {
    for (const template of TEMPLATES.filter(item => item.steps.length > 1)) {
      for (const count of [2, 3, 4, 5] as const) {
        const state = setPlayerCount(loadTemplate(makeAppInitialState(), template), count);
        const decoded = await decodeSituationCode(await encodeAnimationCode(state, { startT: 0, speed: 1 }));
        expect(decoded.state).toEqual({ ...jsonCopy(state), librarySystemId: undefined });
        expect(decoded.animation).toEqual({ startT: 0, speed: 1 });
      }
    }
  });

  it.each([MIN_ANIMATION_SPEED, MAX_ANIMATION_SPEED])('accepts speed boundary %s, including a start at the final step', async speed => {
    const state = animationState();
    const animation = { startT: state.steps.length - 1, speed };
    expect((await decodeSituationCode(await encodeAnimationCode(state, animation))).animation).toEqual(animation);
  });

  it.each([
    undefined, null, {}, { startT: 0 }, { speed: 1 },
    { startT: -0.1, speed: 1 }, { startT: 100_000, speed: 1 }, { startT: '0', speed: 1 },
    { startT: 0, speed: 0 }, { startT: 0, speed: MIN_ANIMATION_SPEED - 0.01 },
    { startT: 0, speed: MAX_ANIMATION_SPEED + 0.01 }, { startT: 0, speed: '1' },
    { startT: 0, speed: null },
  ])('rejects incomplete or invalid playback settings %j', async animation => {
    await expect(decodeSituationCode(pack({ version: 1, state: animationState(), animation }, ANIMATION_CODE_PREFIX))).rejects.toThrow('invalide');
  });

  it('rejects non-finite values before serialization and positions without an animation', async () => {
    const state = animationState();
    await expect(encodeAnimationCode(state, { startT: NaN, speed: 1 })).rejects.toThrow('invalide');
    await expect(encodeAnimationCode(state, { startT: 0, speed: Infinity })).rejects.toThrow('invalide');
    await expect(encodeAnimationCode(makeAppInitialState(), { startT: 0, speed: 1 })).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ version: 1, state: makeAppInitialState(), animation: { startT: 0, speed: 1 } }, ANIMATION_CODE_PREFIX))).rejects.toThrow('invalide');
  });

  it('rejects header/payload mismatches and future animation versions', async () => {
    const state = animationState();
    const still = await encodeSituationCode(state);
    const replay = await encodeAnimationCode(state, { startT: 0, speed: 1 });
    expect((await decodeSituationCode(still)).animation).toBeUndefined();
    await expect(decodeSituationCode(still.replace('BT1:', 'BTA1:'))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(replay.replace('BTA1:', 'BT1:'))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(replay.replace('BTA1:', 'BTA2:'))).rejects.toThrow('version');
    await expect(decodeSituationCode(pack({ version: 2, state, animation: { startT: 0, speed: 1 } }, ANIMATION_CODE_PREFIX))).rejects.toThrow('version');
  });

  it('refuses to label a live-match diagnostic snapshot as a replayable timeline', async () => {
    const state = animationState();
    const animation = { startT: 0, speed: 1 };
    const view = { time: null, source: 'live' as const };
    await expect(encodeAnimationCode(state, animation, view)).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ version: 1, state, animation, view }, ANIMATION_CODE_PREFIX))).rejects.toThrow('invalide');
    // BT1 still supports live frames as diagnostic evidence.
    expect((await decodeSituationCode(await encodeSituationCode(state, view))).view).toEqual(view);
  });

  it('applies decompression and text limits equally to animation codes', async () => {
    await expect(decodeSituationCode(ANIMATION_CODE_PREFIX + 'a'.repeat(MAX_SITUATION_CODE_LENGTH))).rejects.toThrow('volumineuse');
    const state = { ...animationState(), playerNames: { O1: 'x'.repeat(MAX_SITUATION_JSON_BYTES) } };
    const animation = { startT: 0, speed: 1 };
    await expect(encodeAnimationCode(state, animation)).rejects.toThrow('volumineuse');
    await expect(decodeSituationCode(pack({ version: 1, state, animation }, ANIMATION_CODE_PREFIX))).rejects.toThrow('volumineuse');
  });
});
