'use client';

import { BookOpen, Clapperboard, GitFork, Library, Settings, Target, CalendarDays } from 'lucide-react';
import type { SidebarView } from '@/hooks/useSidebarState';
import { useInterfaceLevel } from '../interface/InterfaceLevel';
import { SIDEBAR } from './tokens';
import { SidebarNavItem } from './SidebarNavItem';

type Props = {
  activeView: SidebarView;
  collapsed: boolean;
  onSelect: (view: SidebarView) => void;
};

const ITEMS: { view: SidebarView; icon: typeof Target; label: string; shortLabel: string; minLevel?: 'analysis' }[] = [
  { view: 'court', icon: Target, label: 'Terrain', shortLabel: 'Terrain' },
  { view: 'library', icon: Library, label: 'Bibliothèque', shortLabel: 'Biblio' },
  { view: 'playbook', icon: BookOpen, label: 'Fiches systèmes', shortLabel: 'Fiches' },
  { view: 'sessions', icon: CalendarDays, label: 'Séances', shortLabel: 'Séances' },
  { view: 'scenariograph', icon: GitFork, label: 'Enchaînements', shortLabel: 'Graphe', minLevel: 'analysis' },
  { view: 'settings', icon: Settings, label: 'Paramètres', shortLabel: 'Réglages' },
];

export function SidebarNav({ activeView, collapsed, onSelect }: Props) {
  const { analysis } = useInterfaceLevel();
  const visibleItems = ITEMS.filter((it) => !it.minLevel || analysis || activeView === it.view);

  if (collapsed) {
    return (
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: `0 6px` }}>
        {visibleItems.map((it) => (
          <SidebarNavItem
            key={it.view}
            icon={it.icon}
            label={it.label}
            active={activeView === it.view}
            collapsed
            onClick={() => onSelect(it.view)}
          />
        ))}
        {analysis && (
          <SidebarNavItem
            icon={Clapperboard}
            label="Match simulé"
            active={false}
            collapsed
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/simulation';
            }}
          />
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Vues" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: `0 8px` }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 3,
        }}
      >
        {visibleItems.map((it) => {
          const Icon = it.icon;
          const active = activeView === it.view;
          return (
            <button
              key={it.view}
              type="button"
              aria-label={it.label}
              title={it.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(it.view)}
              className="bt-touch"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 6,
                border: active ? `1px solid ${SIDEBAR.accent}` : `1px solid transparent`,
                background: active ? SIDEBAR.accentBg : 'transparent',
                color: active ? SIDEBAR.text : SIDEBAR.textMuted,
                fontSize: 11.5,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 0,
                transition: 'background 120ms ease, color 120ms ease',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = SIDEBAR.bgHover;
                e.currentTarget.style.color = SIDEBAR.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = active ? SIDEBAR.accentBg : 'transparent';
                e.currentTarget.style.color = active ? SIDEBAR.text : SIDEBAR.textMuted;
              }}
            >
              <Icon size={14} strokeWidth={2} style={{ flexShrink: 0, color: active ? SIDEBAR.accent : 'inherit' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.shortLabel}
              </span>
            </button>
          );
        })}
        {analysis && (
          <button
            type="button"
            aria-label="Match simulé"
            title="Ouvrir le simulateur de match complet"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/simulation';
            }}
            className="bt-touch"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: 'transparent',
              color: SIDEBAR.textMuted,
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              minWidth: 0,
            }}
          >
            <Clapperboard size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Match IA
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}

