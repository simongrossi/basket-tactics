// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette, filterPaletteItems, type PaletteItem } from '../CommandPalette';

afterEach(cleanup);

const item = (id: string, group: string, label: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({
  id, group, label, run: vi.fn(), ...extra,
});

describe('filterPaletteItems', () => {
  const items = [
    item('v', 'Vues', 'Bibliothèque'),
    item('p', 'Panneaux', 'Défense'),
    item('s', 'Mes systèmes', 'Horns Flex', { hint: 'U15', keywords: 'pnr porteur' }),
    item('t', 'Modèles', 'Spain pick and roll', { keywords: 'écran dans le dos' }),
  ];

  it('ignore accents et casse, cherche aussi dans les mots-clés et le dossier', () => {
    expect(filterPaletteItems(items, 'DEFENSE').map((i) => i.id)).toEqual(['p']);
    expect(filterPaletteItems(items, 'pnr').map((i) => i.id)).toEqual(['s']);
    expect(filterPaletteItems(items, 'u15').map((i) => i.id)).toEqual(['s']);
    expect(filterPaletteItems(items, 'ecran dos').map((i) => i.id)).toEqual(['t']);
  });

  it('requête vide : tout ; libellés commençant par la requête en premier', () => {
    expect(filterPaletteItems(items, '  ')).toHaveLength(4);
    const ranked = filterPaletteItems([item('a', 'Actions', 'Exporter en JSON', { keywords: 'horns' }), items[2]], 'horns');
    expect(ranked.map((i) => i.id)).toEqual(['s', 'a']);
  });
});

describe('CommandPalette', () => {
  it('filtre à la frappe, se pilote au clavier et lance l’élément choisi', () => {
    const onClose = vi.fn();
    const items = [item('a', 'Vues', 'Terrain'), item('b', 'Vues', 'Séances'), item('c', 'Panneaux', 'Scénario')];
    render(<CommandPalette items={items} onClose={onClose} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 's' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Séances', 'Scénario', 'Terrain']);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(items[2].run).toHaveBeenCalledTimes(1);
    expect(items[1].run).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Échap ferme sans rien lancer', () => {
    const onClose = vi.fn();
    const items = [item('a', 'Vues', 'Terrain')];
    render(<CommandPalette items={items} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(items[0].run).not.toHaveBeenCalled();
  });
});
