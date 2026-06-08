// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, AttackerId, DefenderId, Tool } from '@/lib/types';
import { CourtView } from '../CourtView';

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
  window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16);
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    ...overrides,
  };
  return { ...render(createElement(CourtView, props)), props };
}

describe('CourtView interactions', () => {
  it('pointercancel flush le dernier drag et commit comme pointerup', () => {
    const onBeginPlayerDrag = vi.fn();
    const onMoveAttackerDuringDrag = vi.fn();
    const onCommitPlayerDrag = vi.fn();
    const { container } = renderCourt({
      onBeginPlayerDrag,
      onMoveAttackerDuringDrag,
      onCommitPlayerDrag,
    });
    const svg = container.querySelector('svg');
    const o1 = container.querySelector('g[data-id="O1"]');
    expect(svg).not.toBeNull();
    expect(o1).not.toBeNull();

    fireEvent.pointerDown(o1!, {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 470,
    });
    fireEvent.pointerMove(svg!, {
      pointerId: 1,
      clientX: 325,
      clientY: 455,
    });
    fireEvent.pointerCancel(svg!, {
      pointerId: 1,
      clientX: 340,
      clientY: 440,
    });

    expect(onBeginPlayerDrag).toHaveBeenCalledTimes(1);
    expect(onMoveAttackerDuringDrag).toHaveBeenCalledTimes(1);
    expect(onMoveAttackerDuringDrag).toHaveBeenCalledWith('O1' as AttackerId, 340, 440);
    expect(onCommitPlayerDrag).toHaveBeenCalledTimes(1);
  });

  // A.3 — Smoke: outil 'text' ouvre un popup et Enter appelle onAddTextNote.
  // Sanity check minimal du câblage CourtView → useAppState (substitut au
  // smoke test manuel qui n'est pas exécutable en environnement non-interactif).
  it("outil 'text' ouvre un popup et soumet via onAddTextNote", () => {
    const onAddTextNote = vi.fn();
    const state: AppState = { ...makeInitialState(), tool: 'text' as Tool };
    const { container } = renderCourt({ state, onAddTextNote });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Clic sur une zone vide du terrain.
    fireEvent.pointerDown(svg!, {
      button: 0,
      pointerId: 7,
      clientX: 200,
      clientY: 300,
    });

    // Popup HTML attendu (input visible).
    const input = document.querySelector('input[placeholder="note…"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { value: 'trap si le 5 monte' } });
    fireEvent.keyDown(input!, { key: 'Enter' });

    expect(onAddTextNote).toHaveBeenCalledTimes(1);
    expect(onAddTextNote).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ text: 'trap si le 5 monte' }),
    );
  });

  it('pointercancel route aussi les défenseurs vers le handler draft défense', () => {
    const onMoveDefenderDuringDrag = vi.fn();
    const onCommitPlayerDrag = vi.fn();
    const { container } = renderCourt({
      onMoveDefenderDuringDrag,
      onCommitPlayerDrag,
    });
    const svg = container.querySelector('svg');
    const d1 = container.querySelector('g[data-id="D1"]');
    expect(svg).not.toBeNull();
    expect(d1).not.toBeNull();

    fireEvent.pointerDown(d1!, {
      button: 0,
      pointerId: 2,
      clientX: 300,
      clientY: 380,
    });
    fireEvent.pointerCancel(svg!, {
      pointerId: 2,
      clientX: 310,
      clientY: 390,
    });

    expect(onMoveDefenderDuringDrag).toHaveBeenCalledWith('D1' as DefenderId, 310, 390);
    expect(onCommitPlayerDrag).toHaveBeenCalledTimes(1);
  });
});
