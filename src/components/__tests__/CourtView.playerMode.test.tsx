// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, Tool } from '@/lib/types';
import { CourtView } from '../CourtView';

beforeEach(() => {
  vi.useFakeTimers();
  const mockRaf = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
  const mockCaf = (id: any) => clearTimeout(id as any);
  globalThis.requestAnimationFrame = mockRaf;
  globalThis.cancelAnimationFrame = mockCaf;
  window.requestAnimationFrame = mockRaf;
  window.cancelAnimationFrame = mockCaf;
});

beforeAll(() => {
  Object.defineProperty(window.SVGSVGElement.prototype, 'createSVGPoint', {
    configurable: true,
    value() {
      const point = {
        x: 0,
        y: 0,
        matrixTransform() {
          return { x: point.x, y: point.y };
        },
      };
      return point;
    },
  });
  Object.defineProperty(window.SVGSVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value() {
      return { inverse: () => ({}) };
    },
  });
  Object.defineProperty(window.SVGElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window.SVGElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderCourt(overrides: Partial<ComponentProps<typeof CourtView>> = {}) {
  const state: AppState = { ...makeInitialState(), tool: 'move' as Tool };
  const props: ComponentProps<typeof CourtView> = {
    state,
    onMoveAttacker: vi.fn(),
    onMoveDefender: vi.fn(),
    onBeginPlayerDrag: vi.fn(),
    onMoveAttackerDuringDrag: vi.fn(),
    onMoveDefenderDuringDrag: vi.fn(),
    onCommitPlayerDrag: vi.fn(),
    onAddAnnotation: vi.fn(),
    onUpdateRule: vi.fn(),
    onApplyDefenderProfile: vi.fn(),
    onClearDefenseOverride: vi.fn(),
    onSetBallCarrier: vi.fn(),
    onSetForcedScreener: vi.fn(),
    onClearAnnotationsFor: vi.fn(),
    onSetAttackerHand: vi.fn(),
    onSetAttackerProfile: vi.fn(),
    onSetAttackerSpeedTier: vi.fn(),
    onSetAttackerOrientation: vi.fn(),
    onSetZoneOverride: vi.fn(),
    onClearZoneOverride: vi.fn(),
    onDeleteAnnotation: vi.fn(),
    onSetAnnotationFrom: vi.fn(),
    onSetAnnotationTo: vi.fn(),
    onSetAnnotationWaypoint: vi.fn(),
    onSetTool: vi.fn(),
    onAddTextNote: vi.fn(),
    onUpdateTextNote: vi.fn(),
    onRemoveTextNote: vi.fn(),
    onSetPlayerName: vi.fn(),
    onSetPlayerNumber: vi.fn(),
    isPlaying: false,
    playbackSpeed: 1,
    isPlayerMode: true, // Default to true for this test suite
    ...overrides,
  };
  return { ...render(createElement(CourtView, props)), props };
}

describe('CourtView Player Mode restrictions', () => {
  it('appui long sur un joueur ne declenche PAS le context menu', () => {
    const onOpenCtxMenu = vi.fn();
    const { container } = renderCourt({
      // We pass a diagnostics handler or mock context menu helper to verify
      // but useCourtPointerHandlers has a context menu callback in CourtView.
      // CourtView internally handles onOpenContextMenu, which then triggers setCtxMenu.
      // We can verify that pointerDown on a player doesn't start any timeout or trigger it.
    });
    const o1 = container.querySelector('g[data-id="O1"]');
    expect(o1).not.toBeNull();

    // pointerdown
    fireEvent.pointerDown(o1!, {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 470,
    });

    // Avancer de 600ms -> le menu ne doit pas s'ouvrir
    vi.advanceTimersByTime(600);
    const contextMenuText = screen.queryByText(/marquer comme porteur/i);
    expect(contextMenuText).toBeNull();
  });

  it('glisser-deposer sur un joueur ne declenche PAS le drag', () => {
    const { container, props } = renderCourt();
    const o1 = container.querySelector('g[data-id="O1"]');
    expect(o1).not.toBeNull();

    // pointerdown
    fireEvent.pointerDown(o1!, {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 470,
    });

    // move
    fireEvent.pointerMove(o1!, {
      pointerId: 1,
      clientX: 320,
      clientY: 470,
    });

    // check drag callback not triggered
    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
  });
});
