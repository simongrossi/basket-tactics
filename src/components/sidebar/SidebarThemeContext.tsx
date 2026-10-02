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
  bg: 'var(--bt-bg)',
  bgSubtle: 'var(--bt-surface)',
  bgRaised: 'var(--bt-surface-raised)',
  border: 'var(--bt-border)',
  borderSubtle: 'var(--bt-border)',
  text: 'var(--bt-text)',
  textMuted: 'var(--bt-text-muted)',
  textDim: 'var(--bt-text-dim)',
} as const;
