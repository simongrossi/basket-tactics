'use client';

import { BookOpen, CalendarDays, Clapperboard, GitFork, Library, Moon, Settings, Sun, SunMoon, Target } from 'lucide-react';
import type { SidebarView } from '@/hooks/useSidebarState';
import { InterfaceLevelSelector } from '../interface/InterfaceLevel';
import { Logo } from './Sidebar';
import { nextThemeMode, useTheme, type ThemeMode } from '@/hooks/useTheme';

const THEME_UI: Record<ThemeMode, { icon: typeof Sun; label: string }> = {
  auto: { icon: SunMoon, label: 'Thème automatique (suit le système)' },
  light: { icon: Sun, label: 'Thème clair' },
  dark: { icon: Moon, label: 'Thème sombre' },
};

const VIEWS: { view: SidebarView; icon: typeof Target; label: string }[] = [
  { view: 'court', icon: Target, label: 'Terrain' },
  { view: 'scenariograph', icon: GitFork, label: 'Enchaînements' },
  { view: 'playbook', icon: BookOpen, label: 'Fiches systèmes' },
  { view: 'library', icon: Library, label: 'Bibliothèque' },
  { view: 'sessions', icon: CalendarDays, label: 'Séances' },
  { view: 'settings', icon: Settings, label: 'Paramètres' },
];

// Barre d'application : marque, navigation entre vues, niveau d'interface.
export function AppTopBar({ activeView, onSelectView }: {
  activeView: SidebarView;
  onSelectView: (view: SidebarView) => void;
}) {
  const theme = useTheme();
  const ThemeIcon = THEME_UI[theme.mode].icon;
  return (
    <header className="bt-topbar">
      <div className="bt-brand">
        <Logo />
        <span>basket-tactics</span>
      </div>
      <nav className="bt-nav" aria-label="Vues">
        {VIEWS.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            type="button"
            className="bt-nav-pill"
            aria-current={activeView === view ? 'page' : undefined}
            title={label}
            onClick={() => onSelectView(view)}
          >
            <Icon size={15} strokeWidth={2} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
        {/* Page /simulation dédiée : un lien de routage, pas une vue interne. */}
        <button
          type="button"
          className="bt-nav-pill"
          title="Match simulé"
          onClick={() => { window.location.href = '/simulation'; }}
        >
          <Clapperboard size={15} strokeWidth={2} aria-hidden />
          <span>Match simulé</span>
        </button>
      </nav>
      <InterfaceLevelSelector />
      <button
        type="button"
        className="bt-icon-btn"
        title={`${THEME_UI[theme.mode].label} — cliquer pour changer`}
        aria-label={THEME_UI[theme.mode].label}
        onClick={() => theme.setMode(nextThemeMode(theme.mode))}
      >
        <ThemeIcon size={16} aria-hidden />
      </button>
    </header>
  );
}
