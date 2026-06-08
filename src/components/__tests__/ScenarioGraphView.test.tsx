// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, ScriptedAction } from '@/lib/types';
import { ScenarioGraphView } from '../scenariograph/ScenarioGraphView';

vi.mock('../scenariograph/GraphCanvas', () => ({
  GraphCanvas: ({ onSelectedAction, onSetActiveStep }: any) => (
    <div data-testid="graph-canvas">
      <button
        data-testid="click-action"
        onClick={() =>
          onSelectedAction(
            { id: 'a1', kind: 'offensive', type: 'pass', params: { from: 'O1', to: 'O2' } },
            null
          )
        }
      >
        Select Action a1
      </button>
    </div>
  ),
}));

vi.mock('../scenariograph/MiniCourtPreview', () => ({
  MiniCourtPreview: () => <div data-testid="mini-court-preview">Mini Court Preview</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderView(state: AppState, extraProps = {}) {
  const props: ComponentProps<typeof ScenarioGraphView> = {
    state,
    activeStep: 0,
    onSetActiveStep: vi.fn(),
    onAddScriptedAction: vi.fn(),
    onUpdateScriptedAction: vi.fn(),
    onDeleteScriptedAction: vi.fn(),
    onMoveScriptedAction: vi.fn(),
    onAddScenarioBranch: vi.fn(),
    onUpdateScenarioBranch: vi.fn(),
    onDeleteScenarioBranch: vi.fn(),
    onSetActiveBranch: vi.fn(),
    onSetContinuityLoop: vi.fn(),
    onClose: vi.fn(),
    ...extraProps,
  };
  return {
    props,
    ...render(createElement(ScenarioGraphView, props)),
  };
}

describe('ScenarioGraphView', () => {
  it('renders correctly and shows selection fallback', () => {
    const state = makeInitialState();
    const { getByText, getByTestId } = renderView(state);

    expect(getByTestId('graph-canvas')).toBeTruthy();
    expect(getByTestId('mini-court-preview')).toBeTruthy();
    expect(
      getByText(/Sélectionnez un nœud d'action sur le graphe/i)
    ).toBeTruthy();
  });

  it('selects action and displays properties editor', () => {
    const initial = makeInitialState();
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a1',
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
    };
    const state = {
      ...initial,
      scriptedActions: [action],
    };

    const { getByTestId, getByText, queryByText } = renderView(state);

    // Click on select action button (simulating click on graph canvas node)
    fireEvent.click(getByTestId('click-action'));

    // The properties editor should now be visible
    expect(getByText('Action #1 (Attaque)')).toBeTruthy();
    expect(queryByText(/Sélectionnez un nœud d'action sur le graphe/i)).toBeNull();
  });

  it('handles action deletion', () => {
    const initial = makeInitialState();
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a1',
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
    };
    const state = {
      ...initial,
      scriptedActions: [action],
    };

    const { getByTestId, getByText, props } = renderView(state);

    // Select action
    fireEvent.click(getByTestId('click-action'));

    // Click Delete button
    const deleteBtn = getByText("Supprimer l'Action");
    fireEvent.click(deleteBtn);

    expect(props.onDeleteScriptedAction).toHaveBeenCalledWith('a1');
  });

  it('handles action insertion', () => {
    const initial = makeInitialState();
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a1',
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
    };
    const state = {
      ...initial,
      scriptedActions: [action],
    };

    const { getByTestId, getByText, props } = renderView(state);

    // Select action
    fireEvent.click(getByTestId('click-action'));

    // Click Insert After
    const insertBtn = getByText("Insérer après");
    fireEvent.click(insertBtn);

    expect(props.onAddScriptedAction).toHaveBeenCalled();
  });

  it('renders player perspective selector dropdown', () => {
    const state = makeInitialState();
    const { getByText, getByRole } = renderView(state);

    expect(getByText(/Perspective de vue/i)).toBeTruthy();
    const select = getByRole('combobox');
    expect(select).toBeTruthy();
    expect(getByText(/Équipe \(Vue globale\)/i)).toBeTruthy();
  });

  describe('getPlayerRoleInAction helper', () => {
    it('returns correct roles for a player in a scripted action', async () => {
      const { getPlayerRoleInAction } = await vi.importActual<any>('../scenariograph/GraphCanvas');
      
      const action: ScriptedAction = {
        kind: 'offensive',
        id: 'act1',
        type: 'pick-and-roll',
        params: { ballHandler: 'O1', screener: 'O5' },
      };

      expect(getPlayerRoleInAction(action, 'O1')).toBe('Porteur');
      expect(getPlayerRoleInAction(action, 'O5')).toBe('Screener');
      expect(getPlayerRoleInAction(action, 'O2')).toBeNull();

      const action2: ScriptedAction = {
        kind: 'offensive',
        id: 'act2',
        type: 'pass',
        params: { passer: 'O1', receiver: 'O2' },
      };

      expect(getPlayerRoleInAction(action2, 'O1')).toBe('Passeur');
      expect(getPlayerRoleInAction(action2, 'O2')).toBe('Receveur');
    });
  });
});
