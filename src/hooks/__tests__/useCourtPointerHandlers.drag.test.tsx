// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourtPointerHandlers } from '../useCourtPointerHandlers';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';

describe('useCourtPointerHandlers drag physics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setup() {
    const state: AppState = {
      ...makeInitialState(),
      tool: 'move',
      activeStep: 0,
    };
    state.steps[0].off.O1 = { x: 300, y: 400 };

    let currentPt = { x: 0, y: 0 };
    const svgRef = {
      current: {
        createSVGPoint: () => ({
          get x() { return currentPt.x; },
          set x(v) { currentPt.x = v; },
          get y() { return currentPt.y; },
          set y(v) { currentPt.y = v; },
          matrixTransform: () => ({ x: currentPt.x, y: currentPt.y }),
        }),
        getScreenCTM: () => ({ inverse: () => ({}) }),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      } as unknown as SVGSVGElement,
    };

    const contentRef = { current: null };

    const onMoveAttacker = vi.fn();
    const onMoveAttackerDuringDrag = vi.fn();
    const onMoveDefender = vi.fn();
    const onMoveDefenderDuringDrag = vi.fn();
    const onCommitPlayerDrag = vi.fn();
    const onEndDefenderPursuit = vi.fn();
    const onClearContextMenu = vi.fn();
    const onTransformChange = vi.fn();

    const hook = renderHook(() =>
      useCourtPointerHandlers({
        state,
        svgRef,
        isPlaying: false,
        onMoveAttacker,
        onMoveAttackerDuringDrag,
        onMoveDefender,
        onMoveDefenderDuringDrag,
        onCommitPlayerDrag,
        onEndDefenderPursuit,
        onClearContextMenu,
        onTransformChange,
        transform: { scale: 1, x: 0, y: 0 },
        contentRef,
        onAddAnnotation: vi.fn(),
      })
    );

    return {
      hook,
      state,
      onMoveAttacker,
      onMoveAttackerDuringDrag,
      onCommitPlayerDrag,
      onEndDefenderPursuit,
    };
  }

  it('settles smoothly on pointerUp instead of teleporting instantaneously', () => {
    const { hook, onMoveAttacker, onMoveAttackerDuringDrag, onCommitPlayerDrag, onEndDefenderPursuit } = setup();

    const downEvent = {
      button: 0,
      clientX: 300,
      clientY: 400,
      pointerId: 1,
      target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
    } as React.PointerEvent;

    act(() => {
      hook.result.current.onPointerDown(downEvent);
    });

    const upEvent = {
      button: 0,
      clientX: 500,
      clientY: 400,
      pointerId: 1,
      target: { closest: () => null } as any,
    } as React.PointerEvent;

    act(() => {
      hook.result.current.onPointerUp(upEvent);
    });

    // Immediately after pointerUp with target 200px away, it enters settling mode
    // and does NOT commit nor call onEndDefenderPursuit synchronously
    expect(onCommitPlayerDrag).not.toHaveBeenCalled();
    expect(onEndDefenderPursuit).not.toHaveBeenCalled();

    // After animation frames run, it gradually advances and finishes
    act(() => {
      // Advance timers by enough time for 200px at 240px/s (~850ms)
      for (let i = 0; i < 70; i++) {
        vi.advanceTimersByTime(16);
      }
    });

    // La fin de course reste dans le même geste d'annulation : variante
    // « pendant le drag », jamais le déplacement historisé (sinon un glisser
    // créait deux entrées d'annulation).
    expect(onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 500, 400);
    expect(onMoveAttacker).not.toHaveBeenCalled();
    expect(onCommitPlayerDrag).toHaveBeenCalledTimes(1);
    expect(onEndDefenderPursuit).toHaveBeenCalledTimes(1);
  });

  it('applies plant-and-cut braking on sharp angle direction changes (> 75 deg)', () => {
    const { hook, onMoveAttackerDuringDrag } = setup();

    // Start drag at (300, 400)
    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 300,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
      } as React.PointerEvent);
    });

    // Move East to (350, 400)
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 350,
        clientY: 400,
        pointerId: 1,
      } as React.PointerEvent);
      vi.advanceTimersByTime(32);
    });

    // Now sharply cut North to (350, 300) - 90 degree turn!
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 350,
        clientY: 300,
        pointerId: 1,
      } as React.PointerEvent);
      vi.advanceTimersByTime(32);
    });

    // The player should move towards North (Y < 400), but at reduced speed due to plant penalty
    const calls = onMoveAttackerDuringDrag.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('O1');
    expect(lastCall[2]).toBeLessThan(400); // has moved North
  });
});
