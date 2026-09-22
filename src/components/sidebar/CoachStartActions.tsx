'use client';

import { Plus, BookOpen, CalendarDays } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';
import { SIDEBAR } from './tokens';

export function CoachStartActions({ collapsed, onCreate, onTemplates, onSessions }: {
  collapsed: boolean;
  onCreate: () => void;
  onTemplates: () => void;
  onSessions: () => void;
}) {
  return (
    <nav aria-label="Préparer mon entraînement" style={{ padding: '10px 6px', borderBottom: `1px solid ${SIDEBAR.borderSubtle}` }}>
      {!collapsed && <div style={{ padding: '0 10px 6px', color: SIDEBAR.textDim, fontSize: 11, fontWeight: 700 }}>Préparer mon entraînement</div>}
      <SidebarNavItem icon={Plus} label="Créer un système" collapsed={collapsed} onClick={onCreate} />
      <SidebarNavItem icon={BookOpen} label="Partir d’un modèle" collapsed={collapsed} onClick={onTemplates} />
      <SidebarNavItem icon={CalendarDays} label="Préparer une séance" collapsed={collapsed} onClick={onSessions} />
    </nav>
  );
}
