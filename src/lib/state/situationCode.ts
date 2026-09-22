import { makeInitialState } from '@/lib/data/initial';
import { ALL_ATTACKER_IDS, ALL_DEFENDER_IDS } from '@/lib/logic/players';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import type { AppState } from '@/lib/types';
import { MAX_MANUAL_DURATION_MS, MAX_MANUAL_EVENTS, MAX_MANUAL_FRAMES, type ManualRecording } from './manualGestures';

/** BT1:/BTA1:/BTG1:<base64url(deflate(UTF-8 JSON))>. */
export const SITUATION_CODE_PREFIX = 'BT1:';
export const ANIMATION_CODE_PREFIX = 'BTA1:';
export const GESTURE_CODE_PREFIX = 'BTG1:';
/** Same range as the playback speed control in Timeline. */
export const MIN_ANIMATION_SPEED = 0.3;
export const MAX_ANIMATION_SPEED = 2;
export const MAX_SITUATION_CODE_LENGTH = 750_000;
export const MAX_SITUATION_JSON_BYTES = 2_000_000;

export interface SituationView {
  /** Fractional timeline position; null means the editable active step. */
  time: number | null;
  source: 'editor' | 'timeline' | 'live';
  /** Evidence of the displayed result, never turned into manual overrides. */
  frame?: PlaybackFrame;
}

export interface SituationSnapshot {
  state: AppState;
  view?: SituationView;
  animation?: SituationAnimation;
  recording?: ManualRecording;
}

/** Replay settings for the saved timeline, independent of a diagnostic frame. */
export interface SituationAnimation {
  /** Fractional step index at which to begin playback. */
  startT: number;
  /** Playback multiplier; step durations and action timings stay in state. */
  speed: number;
}

const invalid = () => new Error('Code de situation invalide ou incomplet.');
const tooLarge = () => new Error('Cette situation est trop volumineuse. Utilisez l’export JSON.');
const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown) => isRecord(v) && isNumber(v.x) && isNumber(v.y) && (v.z === undefined || isNumber(v.z));

function assert(condition: unknown): asserts condition {
  if (!condition) throw invalid();
}

/** Bound recursion and reject unsafe keys/non-finite numbers before import. */
function validateJson(value: unknown, depth = 0): void {
  assert(depth <= 64);
  if (typeof value === 'number') assert(Number.isFinite(value));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assert(!['__proto__', 'prototype', 'constructor'].includes(key));
      validateJson(item, depth + 1);
    }
  }
}

/** Check the stable required shape without dropping optional engine settings. */
function validateShape(value: unknown, defaults: unknown): void {
  if (value === undefined) return; // Optional defaults can be deliberately cleared.
  if (isRecord(defaults)) {
    assert(isRecord(value));
    for (const [key, item] of Object.entries(defaults)) validateShape(value[key], item);
  } else if (Array.isArray(defaults)) {
    assert(Array.isArray(value));
  } else {
    assert(typeof value === typeof defaults);
  }
}

function validatePositions(value: unknown, ids: string[], partial = false): void {
  assert(isRecord(value));
  for (const id of ids) if (!partial || value[id] !== undefined) assert(isPoint(value[id]));
  assert(Object.keys(value).every(id => ids.includes(id)));
}

function validateState(value: unknown): asserts value is AppState {
  assert(isRecord(value));
  for (const key of ['steps', 'activeStep', 'playerCount', 'defenseInitial', 'defenseDistance', 'defenseMaxSpeed', 'triggers', 'rules', 'screenRule', 'screenRadius', 'dropDepth', 'showHelpLines', 'showMatchups', 'tool', 'defenseSystem', 'zoneConfig', 'offBallScreenRule', 'fullCourt', 'showPassLanes']) {
    assert(value[key] !== undefined);
  }
  validateShape(value, makeInitialState());
  assert(Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 2_000);
  assert(Number.isInteger(value.activeStep) && (value.activeStep as number) >= 0 && (value.activeStep as number) < value.steps.length);
  assert([2, 3, 4, 5].includes(value.playerCount as number));
  assert(['man', 'zone', 'junk', 'press'].includes(value.defenseSystem as string));
  assert(['move', 'pass', 'dribble', 'cut', 'screen', 'text'].includes(value.tool as string));
  const zone = value.zoneConfig as Record<string, unknown>;
  assert(['zone-2-3', 'zone-1-3-1', 'zone-3-2', 'zone-2-1-2', 'zone-matchup'].includes(zone.type as string));
  validatePositions(value.defenseInitial, ALL_DEFENDER_IDS);
  for (const id of ALL_DEFENDER_IDS) {
    const rule = (value.rules as Record<string, unknown>)[id];
    assert(isRecord(rule) && isNumber(rule.helpPct) && typeof rule.priority === 'string' && typeof rule.vsCarrier === 'string');
  }
  for (const step of value.steps) {
    assert(isRecord(step));
    validatePositions(step.off, ALL_ATTACKER_IDS);
    assert(ALL_ATTACKER_IDS.slice(0, value.playerCount as number).includes(step.ballCarrier as AppState['steps'][number]['ballCarrier']));
    assert(Array.isArray(step.annotations));
    for (const ann of step.annotations) {
      assert(isRecord(ann) && ['pass', 'dribble', 'cut', 'screen'].includes(ann.type as string));
      assert(ALL_ATTACKER_IDS.includes(ann.fromId as AppState['steps'][number]['ballCarrier']));
      assert(ann.toId == null || ALL_ATTACKER_IDS.includes(ann.toId as AppState['steps'][number]['ballCarrier']));
      assert(isPoint(ann.from) && isPoint(ann.to));
      if (ann.waypoints !== undefined) assert(Array.isArray(ann.waypoints) && ann.waypoints.every(isPoint));
    }
    if (step.defenseOverrides !== undefined) validatePositions(step.defenseOverrides, ALL_DEFENDER_IDS, true);
    if (step.textNotes !== undefined) {
      assert(Array.isArray(step.textNotes) && step.textNotes.every(n => isRecord(n) && isPoint(n.pos) && typeof n.text === 'string'));
    }
    if (step.switches !== undefined) {
      assert(Array.isArray(step.switches) && step.switches.every(pair =>
        Array.isArray(pair) && pair.length === 2 && pair.every(id => ALL_DEFENDER_IDS.includes(id))));
    }
    if (step.defensiveDirectives !== undefined) assert(Array.isArray(step.defensiveDirectives) && step.defensiveDirectives.every(isRecord));
  }
  for (const key of ['scriptedActions', 'defensiveActions', 'scenarioBranches']) {
    if (value[key] !== undefined) assert(Array.isArray(value[key]) && (value[key] as unknown[]).every(isRecord));
  }
}

function validateView(value: unknown, state: AppState): asserts value is SituationView {
  assert(isRecord(value) && ['editor', 'timeline', 'live'].includes(value.source as string));
  assert(value.time === null || (isNumber(value.time) && value.time >= 0 && value.time <= state.steps.length - 1));
  if (value.frame !== undefined) {
    const frame = value.frame;
    assert(isRecord(frame) && isNumber(frame.stepIdx) && isPoint(frame.ballPos));
    // Frames contain only active players in reduced formats.
    validatePositions(frame.off, ALL_ATTACKER_IDS, true);
    for (const id of ALL_ATTACKER_IDS.slice(0, state.playerCount)) assert(isPoint((frame.off as Record<string, unknown>)[id]));
    assert(isRecord(frame.defPos));
    for (const id of ALL_DEFENDER_IDS.slice(0, state.playerCount)) {
      assert(isPoint(frame.defPos[id]));
    }
  }
}

function validateAnimation(value: unknown, state: AppState): asserts value is SituationAnimation {
  assert(state.steps.length > 1);
  assert(isRecord(value));
  assert(isNumber(value.startT) && value.startT >= 0 && value.startT <= state.steps.length - 1);
  assert(isNumber(value.speed) && value.speed >= MIN_ANIMATION_SPEED && value.speed <= MAX_ANIMATION_SPEED);
}

function validateRecording(value: unknown, state: AppState): asserts value is ManualRecording {
  assert(state.tool === 'move');
  assert(isRecord(value));
  assert(isNumber(value.durationMs) && value.durationMs >= 0 && value.durationMs <= MAX_MANUAL_DURATION_MS);
  assert(Array.isArray(value.frames) && value.frames.length > 0 && value.frames.length <= MAX_MANUAL_FRAMES);
  assert(Array.isArray(value.events) && value.events.length <= MAX_MANUAL_EVENTS);
  const attackers = ALL_ATTACKER_IDS.slice(0, state.playerCount);
  const defenders = ALL_DEFENDER_IDS.slice(0, state.playerCount);
  const players: string[] = [...attackers, ...defenders];
  let previous = 0;
  for (const [index, frame] of value.frames.entries()) {
    assert(isRecord(frame) && isNumber(frame.t) && frame.t >= previous && frame.t <= value.durationMs);
    if (index === 0) assert(frame.t === 0);
    validatePositions(frame.off, attackers);
    validatePositions(frame.def, defenders);
    for (const defender of Object.values(frame.def as Record<string, unknown>)) {
      assert(isRecord(defender) && isNumber(defender.orientation) && isNumber(defender.gazeOrientation));
      assert(attackers.includes(defender.matchedTo as AppState['steps'][number]['ballCarrier']));
    }
    assert(isPoint(frame.ball) && attackers.includes(frame.carrier as AppState['steps'][number]['ballCarrier']));
    previous = frame.t;
  }
  previous = 0;
  for (const event of value.events) {
    assert(isRecord(event) && isNumber(event.t) && event.t >= previous && event.t <= value.durationMs);
    assert(event.type === 'begin' || event.type === 'end' || event.type === 'move');
    if (event.type === 'move') assert(players.includes(event.id as string) && isNumber(event.x) && isNumber(event.y));
    previous = event.t;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function encodeSituationCode(state: AppState, view?: SituationView): Promise<string> {
  return encodeCode(state, view);
}

export async function encodeAnimationCode(state: AppState, animation: SituationAnimation, view?: SituationView): Promise<string> {
  validateAnimation(animation, state);
  if (view !== undefined) {
    validateView(view, state);
    assert(view.source !== 'live');
  }
  return encodeCode(state, view, animation);
}

export async function encodeGestureCode(state: AppState, recording: ManualRecording): Promise<string> {
  validateRecording(recording, state);
  return encodeCode(state, undefined, undefined, recording);
}

async function encodeCode(state: AppState, view?: SituationView, animation?: SituationAnimation, recording?: ManualRecording): Promise<string> {
  const json = JSON.stringify({ version: 1, state: { ...state, librarySystemId: undefined }, view, animation, recording });
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_SITUATION_JSON_BYTES) throw tooLarge();
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const prefix = recording !== undefined ? GESTURE_CODE_PREFIX : animation !== undefined ? ANIMATION_CODE_PREFIX : SITUATION_CODE_PREFIX;
  const code = prefix + toBase64Url(compressed);
  if (code.length > MAX_SITUATION_CODE_LENGTH) throw tooLarge();
  return code;
}

/** Read incrementally: a tiny compressed payload must not expand without limit. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SITUATION_JSON_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function decodeSituationCode(input: string): Promise<SituationSnapshot> {
  if (input.length > MAX_SITUATION_CODE_LENGTH) throw tooLarge();
  const code = input.replace(/\s/g, '');
  const prefix = /^BT([AG]?)(\d+):/.exec(code);
  if (prefix && prefix[2] !== '1') throw new Error('Cette version du code de situation n’est pas prise en charge.');
  if (!prefix) throw invalid();
  const isAnimation = prefix[1] === 'A';
  const isGesture = prefix[1] === 'G';
  const payload = code.slice(prefix[0].length);
  assert(payload.length > 0 && /^[A-Za-z0-9_-]+$/.test(payload) && payload.length % 4 !== 1);
  let decoded: unknown;
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    // Reject non-canonical/truncated base64 rather than silently repairing it.
    assert(toBase64Url(bytes) === payload);
    decoded = JSON.parse(await inflate(bytes));
  } catch (error) {
    if (error instanceof Error && error.message === tooLarge().message) throw error;
    throw invalid();
  }
  validateJson(decoded);
  assert(isRecord(decoded));
  if (decoded.version !== 1) throw new Error('Cette version du code de situation n’est pas prise en charge.');
  validateState(decoded.state);
  if (decoded.view !== undefined) validateView(decoded.view, decoded.state);
  if (isAnimation) {
    validateAnimation(decoded.animation, decoded.state);
    assert(decoded.view?.source !== 'live');
  } else {
    // Changing the prefix must not silently discard or invent replay settings.
    assert(decoded.animation === undefined);
  }
  if (isGesture) {
    validateRecording(decoded.recording, decoded.state);
    // A gesture is captured in the editor, never from a scrub/live playback.
    assert(decoded.view === undefined || (decoded.view.source === 'editor' && decoded.view.time === null));
  } else {
    assert(decoded.recording === undefined);
  }
  return {
    state: { ...decoded.state, librarySystemId: undefined },
    ...(decoded.view === undefined ? {} : { view: decoded.view }),
    ...(isAnimation ? { animation: decoded.animation as SituationAnimation } : {}),
    ...(isGesture ? { recording: decoded.recording as ManualRecording } : {}),
  };
}
