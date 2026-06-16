// @vitest-environment jsdom
//
// Coaching — masquage d'une équipe pour présenter un système nu.
// Les flags `showAttackers` / `showDefenders` (default true) coupent le rendu
// des sprites d'une équipe sans toucher au moteur.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
      const point = { x: 0, y: 0, matrixTransform() { return { x: point.x, y: point.y }; } };
      return point;
    },
  });
  Object.defineProperty(window.SVGSVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value() { return { inverse: () => ({}) }; },
  });
  Object.defineProperty(window.SVGElement.prototype, 'setPointerCapture', {
    configurable: true, value: vi.fn(),
  });
  Object.defineProperty(window.SVGElement.prototype, 'releasePointerCapture', {
    configurable: true, value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderCourt(stateOverrides: Partial<AppState> = {}) {
  const state: AppState = { ...makeInitialState(), tool: 'move' as Tool, ...stateOverrides };
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
    isPlayerMode: false,
  };
  return render(createElement(CourtView, props));
}

const attackers = (c: HTMLElement) => c.querySelectorAll('g[data-id^="O"]').length;
const defenders = (c: HTMLElement) => c.querySelectorAll('g[data-id^="D"]').length;

describe('CourtView — masquage d\'équipe (coaching)', () => {
  it('default : les deux équipes sont rendues', () => {
    const { container } = renderCourt();
    expect(attackers(container)).toBeGreaterThan(0);
    expect(defenders(container)).toBeGreaterThan(0);
  });

  it('showDefenders=false : défenseurs masqués, attaquants intacts', () => {
    const { container } = renderCourt({ showDefenders: false });
    expect(defenders(container)).toBe(0);
    expect(attackers(container)).toBeGreaterThan(0);
  });

  it('showAttackers=false : attaquants masqués, défenseurs intacts', () => {
    const { container } = renderCourt({ showAttackers: false });
    expect(attackers(container)).toBe(0);
    expect(defenders(container)).toBeGreaterThan(0);
  });

  it('les deux flags false : terrain sans aucun sprite joueur', () => {
    const { container } = renderCourt({ showAttackers: false, showDefenders: false });
    expect(attackers(container)).toBe(0);
    expect(defenders(container)).toBe(0);
  });

  it('showDefenders=true explicite : défenseurs rendus (rétrocompat)', () => {
    const { container } = renderCourt({ showDefenders: true });
    expect(defenders(container)).toBeGreaterThan(0);
  });
});
