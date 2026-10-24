// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import type { Step } from '@/lib/types';
import { PresentationBar } from '../PresentationBar';

afterEach(cleanup);

function makeSteps(pattern: ('r' | 'i')[], labels: Record<number, string> = {}): Step[] {
  return pattern.map((p, i) => ({
    off: {} as Step['off'],
    ballCarrier: 'O1',
    annotations: [],
    label: labels[i],
    ...(p === 'i' ? { isInterpolated: true } : {}),
  })) as Step[];
}

// Réelles aux indices 0, 2, 4 ; interpolées entre.
const steps = makeSteps(['r', 'i', 'r', 'i', 'r'], { 0: 'Départ', 2: 'Écran', 4: 'Tir' });

function renderBar(activeStep: number, overrides = {}) {
  const onSetActiveStep = vi.fn();
  const onTogglePlay = vi.fn();
  const r = render(createElement(PresentationBar, {
    steps, activeStep, onSetActiveStep, onTogglePlay, isPlaying: false, ...overrides,
  }));
  return { ...r, onSetActiveStep, onTogglePlay };
}

describe('PresentationBar', () => {
  it('affiche le compteur 1-based et le libellé de l\'étape', () => {
    const { container } = renderBar(0);
    expect(container.textContent).toContain('Étape 1 / 3');
    expect(container.textContent).toContain('Départ');
  });

  it('compteur correct sur une étape réelle au milieu', () => {
    const { container } = renderBar(2);
    expect(container.textContent).toContain('Étape 2 / 3');
    expect(container.textContent).toContain('Écran');
  });

  it('précédent désactivé sur la 1ère étape réelle', () => {
    const { getByLabelText } = renderBar(0);
    expect((getByLabelText('Étape précédente') as HTMLButtonElement).disabled).toBe(true);
  });

  it('suivant désactivé sur la dernière étape réelle', () => {
    const { getByLabelText } = renderBar(4);
    expect((getByLabelText('Étape suivante') as HTMLButtonElement).disabled).toBe(true);
  });

  it('suivant saute les interpolées vers la réelle suivante', () => {
    const { getByLabelText, onSetActiveStep } = renderBar(0);
    fireEvent.click(getByLabelText('Étape suivante'));
    expect(onSetActiveStep).toHaveBeenCalledWith(2);
  });

  it('précédent saute les interpolées vers la réelle précédente', () => {
    const { getByLabelText, onSetActiveStep } = renderBar(4);
    fireEvent.click(getByLabelText('Étape précédente'));
    expect(onSetActiveStep).toHaveBeenCalledWith(2);
  });

  it('le bouton lire déclenche onTogglePlay', () => {
    const { getByLabelText, onTogglePlay } = renderBar(0);
    fireEvent.click(getByLabelText('Lire'));
    expect(onTogglePlay).toHaveBeenCalledOnce();
  });

  it('en lecture : le bouton devient « Arrêter »', () => {
    const { getByLabelText } = renderBar(0, { isPlaying: true });
    expect(getByLabelText('Arrêter')).toBeTruthy();
  });

  it('expose scrub, boucle, vitesse et retour au début quand le parent les fournit', () => {
    const onScrub = vi.fn();
    const onToggleLoop = vi.fn();
    const onSetSpeed = vi.fn();
    const onRestart = vi.fn();
    const { getByLabelText } = renderBar(0, {
      onScrub,
      onToggleLoop,
      onSetSpeed,
      onRestart,
      speed: 1,
      loop: true,
      scrubT: 1.5,
    });

    expect(getByLabelText('Lecture en boucle').getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(getByLabelText('Position dans le système'), { target: { value: '2' } });
    expect(onScrub).toHaveBeenCalledWith(2);

    fireEvent.click(getByLabelText('Lecture en boucle'));
    expect(onToggleLoop).toHaveBeenCalledOnce();

    fireEvent.change(getByLabelText('Vitesse de lecture'), { target: { value: '1.5' } });
    expect(onSetSpeed).toHaveBeenCalledWith(1.5);

    fireEvent.click(getByLabelText('Revenir au début'));
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
