import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeAppInitialState } from '@/lib/data/initial';
import { ALL_ATTACKER_IDS, ALL_DEFENDER_IDS } from '@/lib/logic/players';
import type { AppState } from '@/lib/types';
import {
  MAX_MANUAL_DURATION_MS, MAX_MANUAL_EVENTS, MAX_MANUAL_FRAMES,
  MANUAL_SAMPLE_INTERVAL_MS, type ManualGestureFrame, type ManualRecording,
} from '../manualGestures';
import { decodeSituationCode, encodeGestureCode, GESTURE_CODE_PREFIX, MAX_SITUATION_JSON_BYTES } from '../situationCode';

function frame(state: AppState, t = 0): ManualGestureFrame {
  return {
    t,
    off: Object.fromEntries(ALL_ATTACKER_IDS.slice(0, state.playerCount).map(id => [id, { ...state.steps[state.activeStep].off[id] }])),
    def: Object.fromEntries(ALL_DEFENDER_IDS.slice(0, state.playerCount).map((id, i) => [id, {
      ...state.defenseInitial[id], orientation: 20, gazeOrientation: 35, matchedTo: ALL_ATTACKER_IDS[i],
    }])),
    ball: { x: 316, y: 454, z: 3 },
    carrier: 'O1',
  };
}

function recording(state = makeAppInitialState()): ManualRecording {
  const first = frame(state);
  const second = frame(state, 50);
  second.off.O1 = { x: 460, y: 460 };
  second.def.D1 = { ...second.def.D1!, x: 450, y: 420, orientation: 37, gazeOrientation: 42 };
  return {
    durationMs: 70,
    frames: [first, second],
    events: [
      { t: 0, type: 'begin' },
      // Requested position differs from constrained displayed coordinates.
      { t: 30, type: 'move', id: 'O1', x: 900, y: 460 },
      { t: 60, type: 'end' },
    ],
  };
}

function pack(value: unknown, prefix = GESTURE_CODE_PREFIX): string {
  return prefix + deflateSync(JSON.stringify(value)).toString('base64url');
}

describe('manual gesture codes', () => {
  it('preserves the initial state, raw input and displayed discontinuity without smoothing or replacing defense rules', async () => {
    const state = makeAppInitialState();
    state.librarySystemId = 'local-gesture';
    state.defenseSystem = 'zone';
    state.zoneConfig.type = 'zone-2-1-2';
    const captured = recording(state);
    // Reproduce the kind of sudden D5 change the coach is reporting.
    captured.frames[1].def.D5 = { ...captured.frames[1].def.D5!, x: 270, y: 190 };
    const code = await encodeGestureCode(state, captured);
    expect(code.startsWith(GESTURE_CODE_PREFIX)).toBe(true);
    const decoded = await decodeSituationCode(code);
    expect(decoded.recording).toEqual(captured);
    expect(decoded.state).toEqual({ ...state, librarySystemId: undefined });
    expect(decoded.animation).toBeUndefined();
    expect(decoded.view).toBeUndefined();
    expect(decoded.state.steps[0].defenseOverrides).toBeUndefined();
    expect(decoded.recording!.frames[0].def.D5!.x).toBe(360);
    expect(decoded.recording!.frames[1].def.D5!.x).toBe(270);
    expect(decoded.recording!.events[1]).toMatchObject({ id: 'O1', x: 900 });
    expect(decoded.recording!.frames[1].off.O1!.x).toBe(460);
  });

  it.each([2, 3, 4, 5] as const)('captures all active players for %s-player formats', async playerCount => {
    const state = { ...makeAppInitialState(), playerCount };
    const captured = recording(state);
    expect((await decodeSituationCode(await encodeGestureCode(state, captured))).recording).toEqual(captured);
  });

  it('accepts stationary recordings, immediate stop, equal event timestamps, and the final frame before duration', async () => {
    const state = makeAppInitialState();
    const stationary: ManualRecording = { durationMs: 0, frames: [frame(state)], events: [] };
    expect((await decodeSituationCode(await encodeGestureCode(state, stationary))).recording).toEqual(stationary);
    stationary.durationMs = 10;
    stationary.events = [{ t: 10, type: 'begin' }, { t: 10, type: 'end' }];
    expect((await decodeSituationCode(await encodeGestureCode(state, stationary))).recording).toEqual(stationary);
  });

  it('accepts a complete 60-second clip sampled every 50ms, including allowed boundary frames/events', async () => {
    const state = makeAppInitialState();
    const captured: ManualRecording = {
      durationMs: MAX_MANUAL_DURATION_MS,
      frames: Array.from({ length: MAX_MANUAL_FRAMES }, (_, i) => frame(state, Math.min(i * MANUAL_SAMPLE_INTERVAL_MS, MAX_MANUAL_DURATION_MS))),
      events: Array.from({ length: MAX_MANUAL_EVENTS }, (_, i) => ({ t: i, type: 'move', id: 'O1', x: 300, y: 470 })),
    };
    expect((await decodeSituationCode(await encodeGestureCode(state, captured))).recording).toEqual(captured);
  });

  it.each([
    { durationMs: -1 }, { durationMs: MAX_MANUAL_DURATION_MS + 1 }, { durationMs: '70' },
    { frames: [] }, { frames: null }, { events: null },
  ])('rejects invalid recording containers %j', async patch => {
    const state = makeAppInitialState();
    await expect(decodeSituationCode(pack({ version: 1, state, recording: { ...recording(state), ...patch } }))).rejects.toThrow('invalide');
  });

  const invalidFrameCases: [string, (f: ManualGestureFrame) => void][] = [
    ['negative time', f => { f.t = -1; }],
    ['nonzero initial time', f => { f.t = 1; }],
    ['invalid point', f => { f.off.O1!.x = NaN; }],
    ['invalid orientation', f => { f.def.D1!.orientation = Infinity; }],
    ['invalid gaze', f => { f.def.D1!.gazeOrientation = NaN; }],
    ['missing attacker', f => { delete f.off.O1; }],
    ['missing defender', f => { delete f.def.D1; }],
    ['invalid ball elevation', f => { f.ball.z = Infinity; }],
  ];
  it.each(invalidFrameCases)('rejects %s before encode and after decode', async (_name, mutate) => {
    const state = makeAppInitialState();
    const captured = recording(state);
    mutate(captured.frames[0]);
    await expect(encodeGestureCode(state, captured)).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ version: 1, state, recording: captured }))).rejects.toThrow('invalide');
  });

  it('rejects out-of-order or out-of-bounds frame and event timestamps', async () => {
    const state = makeAppInitialState();
    const cases: ManualRecording[] = [
      { ...recording(state), frames: [frame(state, 0), frame(state, 60), frame(state, 50)] },
      { ...recording(state), frames: [frame(state, 0), frame(state, 71)] },
      { ...recording(state), events: [{ type: 'begin', t: 20 }, { type: 'end', t: 10 }] },
      { ...recording(state), events: [{ type: 'begin', t: -1 }] },
      { ...recording(state), events: [{ type: 'end', t: 71 }] },
    ];
    for (const captured of cases) {
      await expect(decodeSituationCode(pack({ version: 1, state, recording: captured }))).rejects.toThrow('invalide');
    }
  });

  it('rejects inactive IDs in position, possession, matchup and input records', async () => {
    const state: AppState = { ...makeAppInitialState(), playerCount: 2 };
    const inactiveAttacker = recording(state);
    inactiveAttacker.frames[0].off.O5 = { x: 300, y: 200 };
    const inactiveDefender = recording(state);
    inactiveDefender.frames[0].def.D5 = { ...inactiveDefender.frames[0].def.D1! };
    const inactiveCarrier = recording(state);
    inactiveCarrier.frames[0].carrier = 'O5';
    const inactiveMatchup = recording(state);
    inactiveMatchup.frames[0].def.D1!.matchedTo = 'O5';
    const inactiveInput = recording(state);
    inactiveInput.events = [{ type: 'move', t: 30, id: 'D5', x: 200, y: 200 }];
    for (const captured of [inactiveAttacker, inactiveDefender, inactiveCarrier, inactiveMatchup, inactiveInput]) {
      await expect(decodeSituationCode(pack({ version: 1, state, recording: captured }))).rejects.toThrow('invalide');
    }
  });

  it.each([
    { t: 0, type: 'teleport' }, { t: 0, type: 'move', id: 'O99', x: 1, y: 2 },
    { t: 0, type: 'move', id: 'O1', x: null, y: 2 }, { t: 0, type: 'move', id: 'O1', x: 1 },
    { t: '0', type: 'begin' },
  ])('rejects malformed input event %j', async event => {
    const state = makeAppInitialState();
    await expect(decodeSituationCode(pack({ version: 1, state, recording: { ...recording(state), events: [event] } }))).rejects.toThrow('invalide');
  });

  it('rejects excessive frame/event counts and compressed expansion', async () => {
    const state = makeAppInitialState();
    const captured = recording(state);
    await expect(decodeSituationCode(pack({ version: 1, state, recording: { ...captured, frames: Array(MAX_MANUAL_FRAMES + 1).fill(frame(state)) } }))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ version: 1, state, recording: { ...captured, events: Array(MAX_MANUAL_EVENTS + 1).fill({ t: 0, type: 'begin' }) } }))).rejects.toThrow('invalide');
    const oversizedState = { ...state, playerNames: { O1: 'x'.repeat(MAX_SITUATION_JSON_BYTES) } };
    await expect(encodeGestureCode(oversizedState, captured)).rejects.toThrow('volumineuse');
    await expect(decodeSituationCode(pack({ version: 1, state: oversizedState, recording: captured }))).rejects.toThrow('volumineuse');
  });

  it('rejects missing recording, mismatched prefixes, mixed animation, timeline/live views and other editor tools', async () => {
    const state = makeAppInitialState();
    const captured = recording(state);
    const envelope = { version: 1, state, recording: captured };
    await expect(decodeSituationCode(pack({ version: 1, state }))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack(envelope, 'BT1:'))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack(envelope, 'BTA1:'))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ ...envelope, animation: { startT: 0, speed: 1 } }))).rejects.toThrow('invalide');
    for (const source of ['timeline', 'live']) {
      await expect(decodeSituationCode(pack({ ...envelope, view: { source, time: null } }))).rejects.toThrow('invalide');
    }
    await expect(decodeSituationCode(pack({ ...envelope, state: { ...state, tool: 'cut' } }))).rejects.toThrow('invalide');
    await expect(decodeSituationCode(pack({ ...envelope, version: 2 }))).rejects.toThrow('version');
    await expect(decodeSituationCode(pack(envelope, 'BTG2:'))).rejects.toThrow('version');
  });
});
