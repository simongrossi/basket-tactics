'use client';

import { BookOpen, Clapperboard, Library, Settings, Target } from 'lucide-react';
import type { SidebarView } from '@/hooks/useSidebarState';
import { SIDEBAR } from './tokens';
import { SidebarNavItem } from './SidebarNavItem';

type Props = {
  activeView: SidebarView;
  collapsed: boolean;
  onSelect: (view: SidebarView) => void;
};

const ITEMS: { view: SidebarView; icon: typeof Target; label: string }[] = [
  { view: 'court', icon: Target, label: 'Terrain' },
  { view: 'playbook', icon: BookOpen, label: 'Playbook' },
  { view: 'library', icon: Library, label: 'Bibliothèque' },
  { view: 'settings', icon: Settings, label: 'Paramètres' },
];

export function SidebarNav({ activeView, collapsed, onSelect }: Props) {
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: `0 6px` }}>
      {!collapsed && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: SIDEBAR.textDim,
            textTransform: 'uppercase',
            padding: '4px 10px 6px',
          }}
        >
          Vues
        </div>
      )}
      {ITEMS.map((it) => (
        <SidebarNavItem
          key={it.view}
          icon={it.icon}
          label={it.label}
          active={activeView === it.view}
          collapsed={collapsed}
          onClick={() => onSelect(it.view)}
        />
      ))}
      {/* Phase 1.6 — Navigation vers la page /simulation dédiée.
          Pas une VUE interne (= ne change pas activeView), mais un lien
          de routage. Visuellement séparé des vues éditeur pour signifier
          le changement de contexte. */}
      <SidebarNavItem
        icon={Clapperboard}
        label="Simulation"
        active={false}
        collapsed={collapsed}
        onClick={() => {
          if (typeof window !== 'undefined') window.location.href = '/simulation';
        }}
      />
    </nav>
  );
}
