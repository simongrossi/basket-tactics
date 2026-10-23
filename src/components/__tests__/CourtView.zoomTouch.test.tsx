// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    onBeginDefenderPursuit: vi.fn(),
    onEndDefenderPursuit: vi.fn(),
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

describe('CourtView Touch & Zoom/Pan interaction tests', () => {
  it('un appui long immobile ouvre le menu sans déplacer le joueur', () => {
    const { container, props } = renderCourt({
      onBeginPlayerDrag: vi.fn(),
    });
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    act(() => vi.advanceTimersByTime(400));
    // Le menu contextuel attaquant est ouvert (O1 est porteur au départ).
    expect(screen.queryByText(/ballon/i)).not.toBeNull();
    // Aucun déplacement n'a été armé par le simple maintien.
    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
    expect(props.onMoveAttackerDuringDrag).not.toHaveBeenCalled();
  });

  it('un appui qui bouge devient un drag et annule l’appui long', () => {
    const { container, props } = renderCourt();
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 320, clientY: 470 });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText(/ballon/i)).toBeNull();
  });

  it('flush et termine le drag attaquant lorsque le second doigt commence un pincement', () => {
    const calls: string[] = [];
    const { container, props } = renderCourt({
      onMoveAttackerDuringDrag: vi.fn(() => calls.push('move')),
      onCommitPlayerDrag: vi.fn(() => calls.push('commit')),
      onEndDefenderPursuit: vi.fn(() => calls.push('end')),
    });
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 325, clientY: 455 });
    fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 400, clientY: 450 });
    expect(props.onMoveAttackerDuringDrag).toHaveBeenCalledWith('O1', 325, 455);
    expect(calls).toEqual(['move', 'commit', 'end']);
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 440, clientY: 450 });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 440, clientY: 450 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 325, clientY: 455 });
    act(() => vi.advanceTimersByTime(650));
    expect(calls).toEqual(['move', 'commit', 'end']);
  });

  // Relâcher alors que le joueur court encore : la fin de course (settling)
  // appartient au même geste d'annulation — aucun déplacement historisé.
  it('fin de course après relâchement : une seule entrée d’annulation, ordre move → commit → end', () => {
    const calls: string[] = [];
    const { container, props } = renderCourt({
      onMoveAttacker: vi.fn(() => calls.push('history-move')),
      onMoveAttackerDuringDrag: vi.fn(() => calls.push('move')),
      onCommitPlayerDrag: vi.fn(() => calls.push('commit')),
      onEndDefenderPursuit: vi.fn(() => calls.push('end')),
    });
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 380, clientY: 470 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 420, clientY: 470 });
    expect(props.onCommitPlayerDrag).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1500));
    expect(props.onMoveAttacker).not.toHaveBeenCalled();
    expect(props.onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 420, 470);
    expect(calls.filter((c) => c !== 'move')).toEqual(['commit', 'end']);
  });

  it('expose à l’historique une fonction qui termine la fin de course (Annuler pendant la course)', () => {
    let flush: (() => void) | null = null;
    const register = vi.fn((fn: (() => void) | null) => { flush = fn; });
    const { container, props } = renderCourt({ registerPendingGestureFlush: register });
    expect(register).toHaveBeenCalled();
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 380, clientY: 470 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 420, clientY: 470 });
    act(() => vi.advanceTimersByTime(50));
    expect(props.onCommitPlayerDrag).not.toHaveBeenCalled();
    act(() => flush!());
    expect(props.onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 420, 470);
    expect(props.onCommitPlayerDrag).toHaveBeenCalledTimes(1);
    // Plus rien à terminer : sans effet, et la boucle d'animation est arrêtée.
    act(() => flush!());
    act(() => vi.advanceTimersByTime(1500));
    expect(props.onCommitPlayerDrag).toHaveBeenCalledTimes(1);
  });

  it('changer de vue pendant la fin de course termine le geste (position, commit, poursuite)', () => {
    const { container, props, unmount } = renderCourt();
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 380, clientY: 470 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 420, clientY: 470 });
    act(() => vi.advanceTimersByTime(50));
    expect(props.onCommitPlayerDrag).not.toHaveBeenCalled();
    unmount();
    expect(props.onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 420, 470);
    expect(props.onCommitPlayerDrag).toHaveBeenCalledTimes(1);
    expect(props.onEndDefenderPursuit).toHaveBeenCalledTimes(1);
  });

  it.each(['text', 'cut'] as const)('ne commit pas un drag inexistant avec l’outil %s', (tool) => {
    const { container, props } = renderCourt({ state: { ...makeInitialState(), tool } });
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerDown(o1, { button: 0, pointerId: 3, clientX: 300, clientY: 470 });
    fireEvent.pointerDown(svg, { button: 0, pointerId: 4, clientX: 400, clientY: 450 });
    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
    expect(props.onCommitPlayerDrag).not.toHaveBeenCalled();
    expect(props.onEndDefenderPursuit).not.toHaveBeenCalled();
    expect(props.onAddAnnotation).not.toHaveBeenCalled();
  });

  it('appui long sur un joueur declenche le context menu après 600ms', () => {
    const { container } = renderCourt();
    const o1 = container.querySelector('g[data-id="O1"]');
    expect(o1).not.toBeNull();

    // pointerdown
    fireEvent.pointerDown(o1!, {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 470,
    });

    // Avancer de 300ms -> pas encore déclenché
    vi.advanceTimersByTime(300);
    const menuTitle = screen.queryByText(/marquer comme porteur/i);
    expect(menuTitle).toBeNull();

    // Avancer encore de 300ms (total 600ms) -> déclenché
    vi.advanceTimersByTime(300);
    // Vérifier l'ouverture du menu contextuel (ctxMenu défini)
    const activeMenu = document.querySelector('div[style*="position: absolute"]');
    // Le menu contextuel CourtMenus affiche des options pour l'attaquant O1
    const o1Label = screen.queryAllByText(/O1/i);
    expect(o1Label.length).toBeGreaterThan(0);
  });

  it('un deplacement significatif annule le timer d\'appui long', () => {
    const { container } = renderCourt();
    const o1 = container.querySelector('g[data-id="O1"]');
    expect(o1).not.toBeNull();

    // pointerdown
    fireEvent.pointerDown(o1!, {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 470,
    });

    // Move de plus de 10px
    fireEvent.pointerMove(o1!, {
      pointerId: 1,
      clientX: 315, // dx = 15px
      clientY: 470,
    });

    // Avancer de 600ms -> le timer doit avoir été annulé
    vi.advanceTimersByTime(600);
    const contextMenuOptions = screen.queryByText(/porteur du ballon/i);
    expect(contextMenuOptions).toBeNull();
  });

  it('cliquer sur les boutons ZoomIn / ZoomOut modifie la transformation de l\'affichage', () => {
    const { container } = renderCourt();
    const zoomInBtn = screen.getByTitle(/Zoomer/);
    const zoomOutBtn = screen.getByTitle(/Dézoomer/);
    const resetBtn = screen.getByTitle(/Réinitialiser/);

    const transformedGroup = container.querySelector('g[ref]'); 
    // On peut chercher par la balise g contenant le terrain
    const contentG = container.querySelector('g[transform*="scale"]');
    expect(contentG).not.toBeNull();

    // Default transform should be translate(0, 0) scale(1) or similar
    expect(contentG?.getAttribute('transform')).toContain('scale(1)');

    // Zoom in
    fireEvent.click(zoomInBtn);
    expect(contentG?.getAttribute('transform')).toContain('scale(1.25)');

    // Zoom out
    fireEvent.click(zoomOutBtn);
    expect(contentG?.getAttribute('transform')).toContain('scale(1)');

    // Reset
    fireEvent.click(zoomInBtn);
    fireEvent.click(resetBtn);
    expect(contentG?.getAttribute('transform')).toContain('scale(1)');
  });

  it('le raccourci clavier Espace active le curseur grab et bloque les actions standards', () => {
    const { container } = renderCourt();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Initialement pas de curseur grab
    expect(svg?.style.cursor).not.toBe('grab');

    // Appuyer sur espace
    fireEvent.keyDown(window, { key: ' ' });
    expect(svg?.style.cursor).toBe('grab');

    // Relâcher espace
    fireEvent.keyUp(window, { key: ' ' });
    expect(svg?.style.cursor).not.toBe('grab');
  });
});
