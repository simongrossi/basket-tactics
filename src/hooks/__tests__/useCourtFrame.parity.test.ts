// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCourtFrame } from '../useCourtFrame';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('affiche les mêmes joueurs et ballon en lecture, pause, reprise et export', () => {
  vi.useFakeTimers();
  const tpl = TEMPLATES.find((t) => t.id === 'screen-lab-pnr')!;
  const state = { ...makeInitialState(), steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial), secondsPerStep: 1 };
  const onPlaybackTick = vi.fn();
  const initial = { state, isPlaying: true, playbackSpeed: 1, playbackStartT: 1.25,
    scrubT: null as number | null, exportT: null as number | null, onPlaybackTick };
  const { result, rerender } = renderHook((options) => useCourtFrame(options), { initialProps: initial });
  act(() => vi.advanceTimersByTime(330));
  const t = onPlaybackTick.mock.lastCall![0];
  const played = result.current.frame;
  rerender({ ...initial, isPlaying: false, scrubT: t });
  expect(result.current.frame.off).toEqual(played.off);
  expect(result.current.frame.defPos).toEqual(played.defPos);
  expect(result.current.frame.ballPos).toEqual(played.ballPos);
  rerender({ ...initial, playbackStartT: t });
  expect(result.current.frame.off).toEqual(played.off);
  expect(result.current.frame.defPos).toEqual(played.defPos);
  rerender({ ...initial, isPlaying: false, exportT: t });
  expect(result.current.frame.off).toEqual(played.off);
  expect(result.current.frame.defPos).toEqual(played.defPos);
  expect(result.current.frame.ballPos).toEqual(played.ballPos);
});
