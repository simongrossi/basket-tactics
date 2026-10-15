'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Refonte UI — quand Panel/Section/AccordionSection sont rendus à l'intérieur
// de la sidebar dark, ce contexte leur signale de basculer en thème sombre
// (fond dark, texte clair, bordures subtiles). Les couleurs d'accent par
// thème (orange offense, bleu defense) restent utilisées comme accents
// localisés (filets, badges) parce qu'elles fonctionnent sur dark.

type SidebarTheme = { dark: boolean };

const SidebarThemeContext = createContext<SidebarTheme>({ dark: false });

export function SidebarThemeProvider({
  dark = true,
  children,
}: {
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarThemeContext.Provider value={{ dark }}>
      {children}
    </SidebarThemeContext.Provider>
  );
}

export function useSidebarTheme() {
  return useContext(SidebarThemeContext);
}

// Palette dark unifiée pour les panneaux internes. On reste cohérent avec
// les tokens SIDEBAR (cf. tokens.ts) mais on les expose ici pour que les
// composants ui.tsx ne dépendent pas de tokens.ts directement.
export const DARK_PANEL = {
  bg: 'var(--bt-sidebar-bg, #1a1d23)',
  bgSubtle: 'var(--bt-sidebar-hover, #262a32)',
  bgRaised: 'var(--bt-sidebar-active, #2f343d)',
  border: 'var(--bt-sidebar-border, #2a2d35)',
  borderSubtle: 'var(--bt-sidebar-border, #22252c)',
  text: 'var(--bt-sidebar-text, #f3f4f6)',
  textMuted: 'var(--bt-sidebar-muted, #cbd5e1)',
  textDim: 'var(--bt-sidebar-dim, #94a3b8)',
} as const;
