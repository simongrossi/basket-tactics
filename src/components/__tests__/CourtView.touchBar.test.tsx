// @vitest-environment jsdom
// U04 — chaque geste qui demandait une touche a un équivalent tactile.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { makeInitialState } from '@/lib/data/initial';
import type { Annotation, AppState, Tool } from '@/lib/types';
import { CourtView } from '../CourtView';

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
  Object.defineProperty(window.SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(window.SVGElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16);
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCourt(tool: Tool, overrides: Partial<ComponentProps<typeof CourtView>> = {}) {
  const state: AppState = { ...makeInitialState(), tool };
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

const toggle = (name: string) => screen.getByRole('button', { name });

describe('CourtView — barre tactile (U04)', () => {
  it('Aimanter remplace Ctrl/⌘ pendant le déplacement', () => {
    vi.useFakeTimers();
    const { container, props } = renderCourt('move');
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;

    fireEvent.click(toggle('Aimanter'));
    expect(toggle('Aimanter').getAttribute('aria-pressed')).toBe('true');

    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 305, clientY: 440 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 305, clientY: 440 });
    // Relâchement normal : fin de course à vitesse athlétique.
    act(() => vi.advanceTimersByTime(1000));
    vi.useRealTimers();
    // Ligne médiane (x = 300) à moins de 8 px : aimantée sans touche.
    expect(props.onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 300, 440);
  });

  it('sans Aimanter, la position reste celle du doigt', () => {
    vi.useFakeTimers();
    const { container, props } = renderCourt('move');
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 1, clientX: 300, clientY: 470 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 305, clientY: 440 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 305, clientY: 440 });
    act(() => vi.advanceTimersByTime(1000));
    vi.useRealTimers();
    expect(props.onMoveAttackerDuringDrag).toHaveBeenLastCalledWith('O1', 305, 440);
  });

  it('Sélection multiple remplace Maj : toucher un défenseur le sélectionne sans le déplacer', () => {
    const { container, props } = renderCourt('move');
    const d1 = container.querySelector('g[data-id="D1"]')!;

    fireEvent.click(toggle('Sélection multiple'));
    fireEvent.pointerDown(d1, { button: 0, pointerId: 2, clientX: 300, clientY: 380 });

    expect(props.onBeginPlayerDrag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Désélectionner (1)' }));
    expect(screen.queryByRole('button', { name: /Désélectionner/ })).toBeNull();
  });

  it('Tracé libre remplace Maj : la course garde les points intermédiaires', () => {
    const { container, props } = renderCourt('cut');
    const svg = container.querySelector('svg')!;
    const o2 = container.querySelector('g[data-id="O2"]')!;

    fireEvent.click(toggle('Tracé libre'));
    fireEvent.pointerDown(o2, { button: 0, pointerId: 3, clientX: 150, clientY: 350 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 150, clientY: 250 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 250, clientY: 250 });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 250, clientY: 250 });

    expect(props.onAddAnnotation).toHaveBeenCalledTimes(1);
    const annotation = (props.onAddAnnotation as ReturnType<typeof vi.fn>).mock.calls[0][0] as Annotation;
    expect(annotation.waypoints?.length ?? 0).toBeGreaterThan(0);
  });

  it('les commandes affichées suivent l’outil actif', () => {
    renderCourt('pass');
    expect(screen.queryByRole('button', { name: 'Aimanter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tracé libre' })).toBeNull();
  });

  it('Supprimer la dernière flèche remplace Suppr / clic droit', () => {
    const base = makeInitialState();
    const annotations: Annotation[] = [
      { type: 'cut', fromId: 'O2', from: { x: 150, y: 350 }, to: { x: 200, y: 250 } } as Annotation,
      { type: 'cut', fromId: 'O3', from: { x: 450, y: 350 }, to: { x: 400, y: 250 } } as Annotation,
    ];
    const state: AppState = {
      ...base,
      tool: 'move',
      steps: base.steps.map((s, i) => (i === base.activeStep ? { ...s, annotations } : s)),
    };
    const { props } = renderCourt('move', { state });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la dernière flèche' }));
    expect(props.onDeleteAnnotation).toHaveBeenCalledWith(1, 0);
  });

  it('Supprimer la dernière flèche vise une passe stockée sur l’étape d’arrivée', () => {
    const base = makeInitialState();
    const off = base.steps[0].off;
    const state: AppState = {
      ...base,
      tool: 'move',
      activeStep: 0,
      steps: [
        { ...base.steps[0], annotations: [] },
        { off: { ...off }, ballCarrier: 'O3', annotations: [
          { type: 'pass', fromId: 'O1', toId: 'O3', from: off.O1, to: off.O3 } as Annotation,
        ] },
      ],
    };
    const { props } = renderCourt('move', { state });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la dernière flèche' }));
    expect(props.onDeleteAnnotation).toHaveBeenCalledWith(0, 1);
  });

  it('une passe en attente s’annule d’un bouton (équivalent Échap)', () => {
    const { container } = renderCourt('pass');
    const svg = container.querySelector('svg')!;
    const o1 = container.querySelector('g[data-id="O1"]')!;
    fireEvent.pointerDown(o1, { button: 0, pointerId: 4, clientX: 300, clientY: 470 });
    fireEvent.pointerUp(svg, { pointerId: 4, clientX: 300, clientY: 470 });

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la passe de O1' }));
    expect(screen.queryByRole('button', { name: /Annuler la passe/ })).toBeNull();
  });

  it('masquée en lecture et sur un terrain en lecture seule', () => {
    renderCourt('move', { isPlaying: true });
    expect(screen.queryByRole('toolbar', { name: 'Commandes tactiles du terrain' })).toBeNull();
    cleanup();
    renderCourt('move', { readOnly: true });
    expect(screen.queryByRole('toolbar', { name: 'Commandes tactiles du terrain' })).toBeNull();
  });

  it('permet de changer d’outil de tracé directement depuis la barre du terrain', () => {
    const { props } = renderCourt('move');
    const passBtn = screen.getByRole('button', { name: 'Passe' });
    expect(passBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(passBtn);
    expect(props.onSetTool).toHaveBeenCalledWith('pass');
  });

  it('permet d’ajouter une étape (+ Étape) directement depuis la barre du terrain', () => {
    const onAddStep = vi.fn();
    const onSetActiveStep = vi.fn();
    renderCourt('move', { onAddStep, onSetActiveStep });
    expect(screen.getByText('Placement de départ')).toBeTruthy();
    const addStepBtn = screen.getByRole('button', { name: /Étape$/ });
    fireEvent.click(addStepBtn);
    expect(onAddStep).toHaveBeenCalledTimes(1);
  });
});



