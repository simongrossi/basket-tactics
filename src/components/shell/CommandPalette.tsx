'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, type LucideIcon } from 'lucide-react';

export interface PaletteItem {
  id: string;
  /** Rubrique affichée en tête de groupe (Vues, Panneaux, Actions…). */
  group: string;
  label: string;
  /** Précision à droite du libellé (dossier, description courte). */
  hint?: string;
  /** Termes cherchables non affichés (tags, synonymes). */
  keywords?: string;
  shortcut?: string;
  icon?: LucideIcon;
  run: () => void;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtre sans tenir compte des accents ni de la casse : chaque mot de la
 * requête doit apparaître dans le libellé, la rubrique, la précision ou les
 * mots-clés. Les libellés qui commencent par la requête passent devant.
 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = normalize(query.trim());
  if (!q) return items;
  const words = q.split(/\s+/);
  const scored: { item: PaletteItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = normalize(item.label);
    const haystack = `${label} ${normalize(item.group)} ${normalize(item.hint ?? '')} ${normalize(item.keywords ?? '')}`;
    if (!words.every((w) => haystack.includes(w))) return;
    scored.push({ item, index, score: label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2 });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}

// Recherche globale : menus, actions, systèmes enregistrés, modèles, séances.
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => filterPaletteItems(items, query), [items, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, results]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="bt-palette-backdrop" onMouseDown={onClose}>
      <div
        className="bt-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
        }}
      >
        <div className="bt-palette-input">
          <Search size={16} aria-hidden />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="bt-palette-list"
            aria-activedescendant={results[active] ? `bt-palette-${results[active].id}` : undefined}
            placeholder="Rechercher un menu, une action, un système…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>Échap</kbd>
        </div>
        <div className="bt-palette-list" id="bt-palette-list" role="listbox" aria-label="Résultats" ref={listRef}>
          {results.length === 0 && <div className="bt-palette-empty">Aucun résultat pour « {query} »</div>}
          {results.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {(i === 0 || results[i - 1].group !== item.group) && (
                  <div className="bt-palette-group">{item.group}</div>
                )}
                <div
                  id={`bt-palette-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  className="bt-palette-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  {Icon ? <Icon size={15} aria-hidden /> : <span style={{ width: 15 }} />}
                  <span className="bt-palette-label">{item.label}</span>
                  {item.hint && <span className="bt-palette-hint">{item.hint}</span>}
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="bt-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
          <span><kbd>Entrée</kbd> ouvrir</span>
        </div>
      </div>
    </div>
  );
}
