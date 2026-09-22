// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureFrames } from '../captureFrames';
import { makeInitialState } from '@/lib/data/initial';
import { secondsToFullStep, totalDurationSeconds } from '@/lib/logic/timecode';

afterEach(() => vi.unstubAllGlobals());

it('capture les étapes selon leur durée, à fréquence constante, puis libère le renderer', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => queueMicrotask(callback));
  vi.stubGlobal('Image', class {
    onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { clearRect() {}, drawImage() {} }; }
    transferToImageBitmap() { return {} as ImageBitmap; }
  });
  const state = makeInitialState();
  state.steps = [
    { ...state.steps[0], duration: 1 },
    { ...state.steps[0], duration: 3 },
    structuredClone(state.steps[0]),
  ];
  const captured: (number | null)[] = [];
  const frames = captureFrames({
    svgRef: { current: document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
    setExportT: (t) => captured.push(t),
    totalSeconds: totalDurationSeconds(state), lastStepIdx: 2,
    stepAtSeconds: (seconds) => secondsToFullStep(state, seconds),
    fps: 2, width: 100, height: 100,
  });
  for await (const _frame of frames) { /* consomme toutes les captures */ }
  expect(captured).toHaveLength(9);
  expect(captured.slice(0, 3)).toEqual([0, 0.5, 1]);
  expect(captured[5]).toBeCloseTo(1.5, 10);
  expect(captured[7]).toBeCloseTo(1 + 2.5 / 3, 10);
  expect(captured[8]).toBeNull();
});
