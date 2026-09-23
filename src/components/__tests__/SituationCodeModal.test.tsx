// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAppInitialState } from '@/lib/data/initial';
import { decodeSituationCode, encodeAnimationCode, encodeSituationCode, encodeGestureCode, type SituationSnapshot } from '@/lib/state/situationCode';
import { SituationCodeModal } from '../SituationCodeModal';

vi.mock('@/lib/state/situationCode', () => ({
  encodeSituationCode: vi.fn(), encodeAnimationCode: vi.fn(), encodeGestureCode: vi.fn(), decodeSituationCode: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(encodeSituationCode).mockResolvedValue('BT1:example');
  vi.mocked(encodeAnimationCode).mockResolvedValue('BTA1:example');
  vi.mocked(encodeGestureCode).mockResolvedValue('BTG1:example');
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setup(
  mode: 'copy' | 'animation' | 'gestures' | 'import',
  snapshot: SituationSnapshot = { state: makeAppInitialState() },
  libraryFolders?: Array<{ id: string; name: string }>,
) {
  const onImport = vi.fn((_snapshot: SituationSnapshot, _saveOption?: { folderId: string; name: string }) => true);
  const onClose = vi.fn();
  return { ...render(<SituationCodeModal mode={mode} snapshot={snapshot} libraryFolders={libraryFolders} onImport={onImport} onClose={onClose} />), onImport, onClose, snapshot };
}

describe('SituationCodeModal', () => {
  it('exports the saved recording and imports it for read-only replay', async () => {
    const snapshot: SituationSnapshot = { state: makeAppInitialState(), recording: { durationMs: 100, frames: [], events: [] } };
    const ui = setup('gestures', snapshot);
    await waitFor(() => expect((ui.getByLabelText('Code des gestes') as HTMLTextAreaElement).value).toBe('BTG1:example'));
    expect(encodeGestureCode).toHaveBeenCalledExactlyOnceWith(snapshot.state, snapshot.recording);
    ui.unmount();
    vi.mocked(decodeSituationCode).mockResolvedValue(snapshot);
    const imported = setup('import');
    fireEvent.change(imported.getByLabelText('Code de situation'), { target: { value: 'BTG1:example' } });
    expect(imported.getByText(/Votre brouillon reste inchangé/)).toBeTruthy();
    fireEvent.click(imported.getByRole('button', { name: 'Rejouer les gestes' }));
    await waitFor(() => expect(imported.onImport).toHaveBeenCalledExactlyOnceWith(snapshot));
    expect(imported.onClose).toHaveBeenCalledOnce();
  });
  it.each(['one-step', 'live'] as const)('explains why %s cannot be copied as a timeline animation', (kind) => {
    const state = makeAppInitialState();
    if (kind === 'live') state.steps.push(structuredClone(state.steps[0]));
    const ui = setup('animation', {
      state,
      ...(kind === 'live' ? { view: { source: 'live' as const, time: null } } : {}),
    });
    expect(ui.getByRole('alert').textContent).toContain(kind === 'live' ? 'Arrêtez le match IA' : 'Dessinez une action');
    expect(encodeAnimationCode).not.toHaveBeenCalled();
    expect((ui.getByRole('button', { name: 'Copier le code' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('copies animation from the beginning by default or from the captured position, preserving playback speed', async () => {
    const state = makeAppInitialState();
    state.steps = [
      { ...state.steps[0], duration: 2 },
      { ...structuredClone(state.steps[0]), duration: 4 },
      structuredClone(state.steps[0]),
    ];
    const snapshot: SituationSnapshot = {
      state, view: { source: 'timeline', time: 1.25 }, animation: { startT: 1.25, speed: 0.5 },
    };
    vi.mocked(encodeAnimationCode).mockResolvedValueOnce('BTA1:from-start').mockResolvedValueOnce('BTA1:from-current');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const ui = setup('animation', snapshot);
    const field = ui.getByLabelText('Code d’animation') as HTMLTextAreaElement;
    await waitFor(() => expect(field.value).toBe('BTA1:from-start'));
    expect((ui.getByRole('radio', { name: 'Depuis le début' }) as HTMLInputElement).checked).toBe(true);
    expect(encodeAnimationCode).toHaveBeenLastCalledWith(state, { startT: 0, speed: 0.5 }, snapshot.view);

    fireEvent.click(ui.getByRole('radio', { name: 'Depuis la position actuelle' }));
    await waitFor(() => expect(field.value).toBe('BTA1:from-current'));
    expect(encodeAnimationCode).toHaveBeenLastCalledWith(state, { startT: 1.25, speed: 0.5 }, snapshot.view);
    expect(snapshot.animation).toEqual({ startT: 1.25, speed: 0.5 });
    expect(encodeSituationCode).not.toHaveBeenCalled();
    fireEvent.click(ui.getByRole('button', { name: 'Copier le code' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('BTA1:from-current'));
    expect(ui.onImport).not.toHaveBeenCalled();
  });

  it('forwards the decoded animation and its playback settings to the importer', async () => {
    const state = makeAppInitialState();
    state.steps.push(structuredClone(state.steps[0]));
    const decoded: SituationSnapshot = { state, animation: { startT: 0.4, speed: 1.5 } };
    vi.mocked(decodeSituationCode).mockResolvedValue(decoded);
    const ui = setup('import');
    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: ' BTA1:example ' } });
    fireEvent.click(ui.getByRole('button', { name: 'Charger et lire l’animation' }));
    await waitFor(() => expect(ui.onClose).toHaveBeenCalledOnce());
    expect(decodeSituationCode).toHaveBeenCalledWith(' BTA1:example ');
    expect(ui.onImport).toHaveBeenCalledExactlyOnceWith(decoded);
  });

  it('selects the code for manual copying when clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const ui = setup('copy');
    await waitFor(() => expect((ui.getByLabelText('Code de situation') as HTMLTextAreaElement).value).toBe('BT1:example'));
    fireEvent.click(ui.getByRole('button', { name: 'Copier le code' }));
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('Ctrl+C'));
    const field = ui.getByLabelText('Code de situation') as HTMLTextAreaElement;
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(ui.onImport).not.toHaveBeenCalled();
  });

  it('shows parsing errors without importing or closing', async () => {
    vi.mocked(decodeSituationCode).mockRejectedValue(new Error('Code de situation invalide ou incomplet.'));
    const ui = setup('import');
    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: 'invalid' } });
    fireEvent.click(ui.getByRole('button', { name: 'Charger la situation' }));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain('invalide'));
    expect(ui.onImport).not.toHaveBeenCalled();
    expect(ui.onClose).not.toHaveBeenCalled();
  });

  it('preserves entered text and explains manual paste when clipboard reading is empty', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: vi.fn().mockResolvedValue('') } });
    const ui = setup('import');
    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: 'BT1:keep-me' } });
    fireEvent.click(ui.getByRole('button', { name: 'Coller le code' }));
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('presse-papiers est vide'));
    expect((ui.getByLabelText('Code de situation') as HTMLTextAreaElement).value).toBe('BT1:keep-me');
  });

  it('passes decoded state through the protected importer and stays open if it refuses', async () => {
    const ui = setup('import');
    vi.mocked(decodeSituationCode).mockResolvedValue(ui.snapshot);
    ui.onImport.mockReturnValue(false);
    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: 'BT1:example' } });
    fireEvent.click(ui.getByRole('button', { name: 'Charger la situation' }));
    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain('Import annulé'));
    expect(ui.onImport).toHaveBeenCalledWith(ui.snapshot);
    expect(ui.onClose).not.toHaveBeenCalled();
    ui.onImport.mockReturnValue(true);
    fireEvent.click(ui.getByRole('button', { name: 'Charger la situation' }));
    await waitFor(() => expect(ui.onClose).toHaveBeenCalledOnce());
  });

  it('focuses the code, traps Tab and closes with Escape', () => {
    const ui = setup('import');
    expect(document.activeElement).toBe(ui.getByLabelText('Code de situation'));
    const close = ui.getByRole('button', { name: 'Fermer' });
    close.focus();
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ui.getByRole('button', { name: 'Coller le code' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(ui.onClose).toHaveBeenCalledOnce();
  });

  it('allows saving directly to presets/library when importing with custom name and selected folder', async () => {
    const folders = [
      { id: 'f-1', name: 'Mes systèmes' },
      { id: 'f-2', name: 'Fin de match' },
    ];
    const ui = setup('import', { state: makeAppInitialState() }, folders);
    vi.mocked(decodeSituationCode).mockResolvedValue(ui.snapshot);

    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: 'BT1:example' } });

    const checkbox = ui.getByRole('checkbox', { name: /Enregistrer aussi dans la bibliothèque/i });
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    const nameInput = ui.getByLabelText(/Nom du système/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Système importé');

    fireEvent.change(nameInput, { target: { value: 'Cornes PnR' } });

    const folderSelect = ui.getByLabelText(/Dossier/i) as HTMLSelectElement;
    expect(folderSelect.value).toBe('f-1');
    fireEvent.change(folderSelect, { target: { value: 'f-2' } });

    const submitBtn = ui.getByRole('button', { name: 'Charger et enregistrer' });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(ui.onImport).toHaveBeenCalledExactlyOnceWith(ui.snapshot, {
      folderId: 'f-2',
      name: 'Cornes PnR',
    }));
    expect(ui.onClose).toHaveBeenCalledOnce();
  });

  it('validates system name when save to library is checked and prevented on empty name', async () => {
    const ui = setup('import', { state: makeAppInitialState() });
    fireEvent.change(ui.getByLabelText('Code de situation'), { target: { value: 'BT1:example' } });

    const checkbox = ui.getByRole('checkbox', { name: /Enregistrer aussi dans la bibliothèque/i });
    fireEvent.click(checkbox);

    const nameInput = ui.getByLabelText(/Nom du système/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const submitBtn = ui.getByRole('button', { name: 'Charger et enregistrer' });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain('Veuillez indiquer un nom'));
    expect(decodeSituationCode).not.toHaveBeenCalled();
    expect(ui.onImport).not.toHaveBeenCalled();
    expect(ui.onClose).not.toHaveBeenCalled();
  });
});
