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

  function setup(mutate?: (s: AppState) => void, options?: { screenScale?: number }) {
    const state: AppState = {
      ...makeInitialState(),
      tool: 'move',
      activeStep: 0,
    };
    state.steps[0].off.O1 = { x: 300, y: 400 };
    mutate?.(state);

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
    const onCancelPlayerDrag = vi.fn();
    const onSelectPlayer = vi.fn();
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
        onCancelPlayerDrag,
        onSelectPlayer,
        onEndDefenderPursuit,
        onClearContextMenu,
        onTransformChange,
        transform: { scale: 1, x: 0, y: 0 },
        contentRef,
        screenScale: options?.screenScale,
        onAddAnnotation: vi.fn(),
      })
    );

    return {
      hook,
      state,
      onMoveAttacker,
      onMoveAttackerDuringDrag,
      onCommitPlayerDrag,
      onCancelPlayerDrag,
      onSelectPlayer,
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

    // Franchir le seuil de tap : sans ce mouvement, c'est une sélection.
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 340,
        clientY: 400,
        pointerId: 1,
      } as React.PointerEvent);
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

  it('un tap sous le seuil sélectionne le joueur sans le déplacer', () => {
    const { hook, onSelectPlayer, onMoveAttackerDuringDrag, onCommitPlayerDrag } = setup();

    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 300,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
      } as React.PointerEvent);
    });
    // 3 px : sous le seuil de 6 px.
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 303,
        clientY: 400,
        pointerId: 1,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerUp({
        button: 0,
        clientX: 303,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });

    expect(onSelectPlayer).toHaveBeenCalledWith('O1');
    expect(onMoveAttackerDuringDrag).not.toHaveBeenCalled();
    expect(onCommitPlayerDrag).not.toHaveBeenCalled();
  });

  it('sélectionne le joueur le plus proche, pas le premier de la liste', () => {
    const { hook, onSelectPlayer } = setup((s) => {
      // O2 est le plus proche du clic, O1 est plus loin mais dans le rayon.
      s.steps[0].off.O1 = { x: 300, y: 400 };
      s.steps[0].off.O2 = { x: 318, y: 400 };
    });

    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 315,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerUp({
        button: 0,
        clientX: 315,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });

    expect(onSelectPlayer).toHaveBeenCalledWith('O2');
  });

  it('agrandit la cible tactile quand le terrain est réduit (échelle 0,5)', () => {
    const { hook, onSelectPlayer } = setup(undefined, { screenScale: 0.5 });

    // 30 unités : hors de l'ancien rayon de 22, dans la cible 44 px écran.
    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 330,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerUp({
        button: 0,
        clientX: 330,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });

    expect(onSelectPlayer).toHaveBeenCalledWith('O1');
  });

  it('garde un rayon souris serré à l’échelle écran 1', () => {
    const { hook, onSelectPlayer } = setup();

    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 330,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerUp({
        button: 0,
        clientX: 330,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => null } as any,
      } as React.PointerEvent);
    });

    // Un clic dans le vide désélectionne ; il ne doit pas saisir O1.
    expect(onSelectPlayer).not.toHaveBeenCalledWith('O1');
  });

  it('sans plafond de vitesse, le joueur suit le doigt immédiatement', () => {
    const { hook, onMoveAttackerDuringDrag } = setup((s) => {
      s.dragSpeedCapEnabled = false;
    });

    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 300,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 500,
        clientY: 400,
        pointerId: 1,
      } as React.PointerEvent);
      vi.advanceTimersByTime(32);
    });

    expect(onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 500, 400);
  });

  it('Échap annule le déplacement en cours sans commit', () => {    const { hook, onCancelPlayerDrag, onCommitPlayerDrag, onMoveAttackerDuringDrag } = setup();

    act(() => {
      hook.result.current.onPointerDown({
        button: 0,
        clientX: 300,
        clientY: 400,
        pointerId: 1,
        target: { closest: () => ({ getAttribute: () => 'O1' }) } as any,
      } as React.PointerEvent);
    });
    act(() => {
      hook.result.current.onPointerMove({
        clientX: 360,
        clientY: 400,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onCancelPlayerDrag).toHaveBeenCalledTimes(1);
    expect(onCommitPlayerDrag).not.toHaveBeenCalled();

    // La file rAF éventuelle ne doit plus produire de déplacement.
    const callsAfterCancel = onMoveAttackerDuringDrag.mock.calls.length;
    act(() => {
      for (let i = 0; i < 10; i++) vi.advanceTimersByTime(16);
    });
    expect(onMoveAttackerDuringDrag.mock.calls.length).toBe(callsAfterCancel);
    expect(onCommitPlayerDrag).not.toHaveBeenCalled();
  });
});
