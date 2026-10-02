'use client';

import { Plus, BookOpen, CalendarDays } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

export function CoachStartActions({ onCreate, onTemplates, onSessions }: {
  onCreate: () => void;
  onTemplates: () => void;
  onSessions: () => void;
}) {
  return (
    <nav aria-label="Préparer mon entraînement" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SidebarNavItem icon={Plus} label="Créer un système" onClick={onCreate} />
      <SidebarNavItem icon={BookOpen} label="Partir d’un modèle" onClick={onTemplates} />
      <SidebarNavItem icon={CalendarDays} label="Préparer une séance" onClick={onSessions} />
    </nav>
  );
}
