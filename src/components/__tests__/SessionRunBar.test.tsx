// @vitest-environment jsdom
// U05 — barre de déroulé : bornes précédent/suivant, minuteur, variantes.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import type { PracticeSession } from '@/lib/data/practiceSessions';
import { startRun } from '@/lib/data/sessionRun';
import type { ScenarioBranch } from '@/lib/types';
import { SessionRunBar, variantChoices } from '../SessionRunBar';

afterEach(cleanup);

const session: PracticeSession = {
  id: 's1', name: 'Mardi', createdAt: 0, updatedAt: 0,
  blocks: [
    { id: 'a', kind: 'free', title: 'Échauffement', durationMin: 10, notes: 'Gammes' },
    { id: 'b', kind: 'free', title: 'PNR', durationMin: 1 },
    { id: 'c', kind: 'free', title: 'Match', durationMin: 20 },
  ],
};

const branch = (id: string, label: string, extra: Partial<ScenarioBranch> = {}): ScenarioBranch =>
  ({ id, label, divergeAfterActionId: 'x', actions: [], ...extra }) as ScenarioBranch;

function renderBar(overrides: Partial<ComponentProps<typeof SessionRunBar>> = {}) {
  const props: ComponentProps<typeof SessionRunBar> = {
    session,
    run: startRun('s1', 0),
    now: 0,
    branches: [],
    activeBranchId: null,
    onSetActiveBranch: vi.fn(),
    onGoToBlock: vi.fn(),
    onToggleTimer: vi.fn(),
    onResetTimer: vi.fn(),
    onBackToSession: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
  render(createElement(SessionRunBar, props));
  return props;
}

describe('SessionRunBar', () => {
  it('affiche le bloc, ses consignes et borne la navigation', () => {
    const props = renderBar();
    expect(screen.getByText('Échauffement')).toBeTruthy();
    expect(screen.getByText('Gammes')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Bloc précédent' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Bloc suivant' }));
    expect(props.onGoToBlock).toHaveBeenCalledWith(1);
  });

  it('dernier bloc : suivant désactivé', () => {
    renderBar({ run: startRun('s1', 2) });
    expect((screen.getByRole('button', { name: 'Bloc suivant' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('minuteur : compte à rebours puis dépassement signalé', () => {
    const running = { ...startRun('s1', 1), timer: { elapsedMs: 0, runningSince: 0 } };
    renderBar({ run: running, now: 30_000 });
    expect(screen.getByText('00:30')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mettre le minuteur en pause' })).toBeTruthy();
    cleanup();
    renderBar({ run: running, now: 90_000 });
    expect(screen.getByText('+00:30')).toBeTruthy();
    expect(screen.getByRole('timer').className).toContain('is-over');
  });

  it('retour au plan et fin du déroulé', () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Ma séance/ }));
    fireEvent.click(screen.getByRole('button', { name: /Terminer/ }));
    expect(props.onBackToSession).toHaveBeenCalledTimes(1);
    expect(props.onEnd).toHaveBeenCalledTimes(1);
  });

  it('variantes : choix manuel, retour à la principale', () => {
    const props = renderBar({ branches: [branch('d', 'Si drop'), branch('s', 'Si switch')], activeBranchId: 'd' });
    expect(screen.getByRole('button', { name: 'Si drop' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Si switch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Principale' }));
    expect(props.onSetActiveBranch).toHaveBeenNthCalledWith(1, 's');
    expect(props.onSetActiveBranch).toHaveBeenNthCalledWith(2, null);
  });

  it('sans variante, aucune rangée de choix', () => {
    renderBar();
    expect(screen.queryByRole('group', { name: 'Variantes du système' })).toBeNull();
  });
});

describe('variantChoices', () => {
  it('libelle les sous-variantes par leur chemin', () => {
    const choices = variantChoices([
      branch('a', 'Si le low sort'),
      branch('b', 'Si la zone ferme', { parentBranchId: 'a' }),
    ]);
    expect(choices).toEqual([
      { id: 'a', label: 'Si le low sort' },
      { id: 'b', label: 'Si le low sort › Si la zone ferme' },
    ]);
  });

  it('résiste à une boucle de parents', () => {
    const choices = variantChoices([
      branch('a', 'A', { parentBranchId: 'b' }),
      branch('b', 'B', { parentBranchId: 'a' }),
    ]);
    expect(choices[0].label).toBe('B › A');
  });
});
