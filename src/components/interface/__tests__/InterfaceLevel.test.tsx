// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InterfaceGate, InterfaceLevelProvider, InterfaceLevelSelector, useInterfaceLevel } from '../InterfaceLevel';
import { useAppState } from '@/hooks/useAppState';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Levels() {
  return <InterfaceLevelProvider><InterfaceLevelSelector />
    <InterfaceGate min="analysis"><span>Mesures détaillées</span></InterfaceGate>
    <InterfaceGate min="development"><span>Diagnostic technique</span></InterfaceGate>
  </InterfaceLevelProvider>;
}

it('masque les outils avancés, restaure le niveau et retire le diagnostic en revenant à Analyse', () => {
  const first = render(<Levels />);
  expect(screen.queryByText('Mesures détaillées')).toBeNull();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'development' } });
  expect(screen.queryByText('Diagnostic technique')).not.toBeNull();
  first.unmount();
  render(<Levels />);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('development');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'analysis' } });
  expect(screen.queryByText('Diagnostic technique')).toBeNull();
  expect(screen.queryByText('Mesures détaillées')).not.toBeNull();
});

it('ne modifie ni le système ni son historique lors des changements de niveau', () => {
  const { result } = renderHook(() => ({ app: useAppState(), ui: useInterfaceLevel() }), { wrapper: InterfaceLevelProvider });
  act(() => result.current.app.patch({ showScreenDebug: true }));
  const state = result.current.app.state;
  act(() => result.current.ui.setLevel('development'));
  act(() => result.current.ui.setLevel('coach'));
  expect(result.current.app.state).toBe(state);
  act(() => result.current.app.undo());
  expect(result.current.app.state.showScreenDebug).not.toBe(true);
});

it('reste utilisable si le stockage est interdit', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('denied'); });
  render(<Levels />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'analysis' } });
  expect(screen.queryByText('Mesures détaillées')).not.toBeNull();
});
