// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { CourtView } from '../CourtView';

type Props = ComponentProps<typeof CourtView>;

beforeAll(() => {
  Object.defineProperty(window.SVGSVGElement.prototype, 'createSVGPoint', {
    configurable: true,
    value() {
      const point = { x: 0, y: 0, matrixTransform() { return { x: point.x, y: point.y }; } };
      return point;
    },
  });
  Object.defineProperty(window.SVGSVGElement.prototype, 'getScreenCTM', {
    configurable: true, value: () => ({ inverse: () => ({}) }),
  });
  Object.defineProperty(window.SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(window.SVGElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
});
beforeEach(() => {
  vi.useFakeTimers();
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function renderCourt(overrides: Partial<Props> = {}) {
  const props: Props = {
    state: makeInitialState(),
    onMoveAttacker: vi.fn(), onMoveDefender: vi.fn(), onBeginPlayerDrag: vi.fn(),
    onMoveAttackerDuringDrag: vi.fn(), onMoveDefenderDuringDrag: vi.fn(), onCommitPlayerDrag: vi.fn(),
    onBeginDefenderPursuit: vi.fn(), onEndDefenderPursuit: vi.fn(),
    onAddAnnotation: vi.fn(), onUpdateRule: vi.fn(), onApplyDefenderProfile: vi.fn(),
    onClearDefenseOverride: vi.fn(), onSetBallCarrier: vi.fn(), onSetForcedScreener: vi.fn(),
    onClearAnnotationsFor: vi.fn(), onSetAttackerHand: vi.fn(), onSetAttackerProfile: vi.fn(),
    onSetAttackerSpeedTier: vi.fn(), onSetAttackerOrientation: vi.fn(),
    onSetZoneOverride: vi.fn(), onClearZoneOverride: vi.fn(), onDeleteAnnotation: vi.fn(),
    onSetAnnotationFrom: vi.fn(), onSetAnnotationTo: vi.fn(), onSetAnnotationWaypoint: vi.fn(),
    onSetTool: vi.fn(), onAddTextNote: vi.fn(), onUpdateTextNote: vi.fn(), onRemoveTextNote: vi.fn(),
    onSetPlayerName: vi.fn(), onSetPlayerNumber: vi.fn(), isPlaying: false, playbackSpeed: 1,
    ...overrides,
  };
  return { ...render(createElement(CourtView, props)), props };
}

describe('CourtView recording and replay interaction guards', () => {
  it.each(['readOnly', 'gesturesOnly'] as const)('%s freezes annotations, menus and text editing', (mode) => {
    const state = makeInitialState();
    state.tool = 'text';
    state.steps[0].annotations = [{ type: 'cut', from: { x: 100, y: 200 }, to: { x: 200, y: 300 }, fromId: 'O2' }];
    const { container, props, queryByText } = renderCourt({ state, [mode]: true });
    const annotation = container.querySelector('g[data-annotation-idx]')!;
    expect(annotation).not.toBeNull();
    fireEvent.contextMenu(annotation);
    expect(props.onDeleteAnnotation).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="annotation-handles"]')).toBeNull();
    expect(queryByText('Supprimer la dernière flèche')).toBeNull();

    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.contextMenu(o1);
    fireEvent.doubleClick(o1);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 500 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 500 });
    expect(container.querySelector('input[placeholder="note…"]')).toBeNull();
    expect(props.onAddTextNote).not.toHaveBeenCalled();
    expect(props.onAddAnnotation).not.toHaveBeenCalled();
    expect(props.onSetBallCarrier).not.toHaveBeenCalled();
  });

  it('keeps a recorded player drag active past long-press timeout even if another tool was selected', () => {
    const state = { ...makeInitialState(), tool: 'cut' as const };
    const { container, props } = renderCourt({ state, gesturesOnly: true });
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    act(() => vi.advanceTimersByTime(900));
    // Pas de drag tant que le doigt n'a pas franchi le seuil de tap.
    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
    expect(props.onCommitPlayerDrag).not.toHaveBeenCalled();
    expect(props.onEndDefenderPursuit).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 340, clientY: 430 });
    expect(props.onBeginPlayerDrag).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 340, clientY: 430 });
    // Relâchement normal : le joueur termine sa course à vitesse athlétique.
    act(() => vi.advanceTimersByTime(1000));
    expect(props.onMoveAttackerDuringDrag).toHaveBeenCalledWith('O1', 340, 430);
    expect(props.onCommitPlayerDrag).toHaveBeenCalledTimes(1);
    expect(props.onEndDefenderPursuit).toHaveBeenCalledTimes(1);
    expect(props.onAddAnnotation).not.toHaveBeenCalled();
    expect(state.tool).toBe('cut');
  });

  it('moves a recorded defender group from its displayed positions rather than its initial anchors', () => {
    const state = makeInitialState();
    const positions = effectiveDefensePositions(state, 0);
    expect(positions.D2.x).not.toBe(state.defenseInitial.D2.x);
    const { container, props } = renderCourt({ state, gesturesOnly: true });
    const svg = container.querySelector('svg')!;
    for (const id of ['D1', 'D2'] as const) {
      const player = container.querySelector(`g[data-id="${id}"]`)!;
      fireEvent.pointerDown(player, { button: 0, pointerId: 1, shiftKey: true, clientX: positions[id].x, clientY: positions[id].y });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: positions[id].x, clientY: positions[id].y });
    }
    fireEvent.pointerDown(container.querySelector('g[data-id="D1"]')!, {
      button: 0, pointerId: 1, clientX: positions.D1.x, clientY: positions.D1.y,
    });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: positions.D1.x + 20, clientY: positions.D1.y + 10 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: positions.D1.x + 20, clientY: positions.D1.y + 10 });
    expect(props.onMoveDefenderDuringDrag).toHaveBeenCalledWith('D1', positions.D1.x + 20, positions.D1.y + 10);
    expect(props.onMoveDefenderDuringDrag).toHaveBeenCalledWith('D2', Math.round(positions.D2.x + 20), Math.round(positions.D2.y + 10));
  });

  it('read-only permits pan and zoom without moving a player, and preserves button keyboard activation', () => {
    const { container, props, getByRole } = renderCourt({ readOnly: true });
    const svg = container.querySelector('svg')!;
    const content = svg.querySelector('g[transform]')!;
    fireEvent.pointerDown(container.querySelector('g[data-id="O1"]')!, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 340, clientY: 430 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 340, clientY: 430 });
    expect(content.getAttribute('transform')).toContain('translate(40, -40)');
    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
    expect(props.onMoveAttackerDuringDrag).not.toHaveBeenCalled();
    expect(props.onMoveDefenderDuringDrag).not.toHaveBeenCalled();
    const zoom = getByRole('button', { name: 'Zoomer' });
    zoom.focus();
    expect(fireEvent.keyDown(zoom, { key: ' ' })).toBe(true);
    fireEvent.click(zoom);
    expect(content.getAttribute('transform')).toContain('scale(1.25)');
  });
});
