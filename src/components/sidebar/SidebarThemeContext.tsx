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
  bg: '#16161d',
  bgSubtle: '#1f1f29',
  bgRaised: '#1f1f29',
  border: '#2a2a35',
  borderSubtle: '#222229',
  text: '#e5e5e5',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
} as const;
