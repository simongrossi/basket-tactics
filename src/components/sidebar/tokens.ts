// Tokens dark sidebar (Phase 1 refonte UI — sidebar unique gauche).
// La zone centrale garde la palette claire de ui.tsx, donc ces tokens
// ne servent QUE pour les composants sidebar/* et leurs popovers.

// Palette bleu-gris foncé (style Claude dashboard) — pas noir pur, plus chaud
// et plus lisible. Aligné avec DARK_PANEL pour cohérence entre sidebar et
// vues routées inline.
export const SIDEBAR = {
  bg: '#1a1d23',
  bgHover: '#262a32',
  bgActive: '#2f343d',
  border: '#2a2d35',
  borderSubtle: '#22252c',
  text: '#f3f4f6',
  textMuted: '#cbd5e1',
  textDim: '#94a3b8',
  accent: '#a78bfa',
  accentBg: 'rgba(167, 139, 250, 0.14)',
  // Largeurs
  widthExpanded: 240,
  widthCollapsed: 56,
  // Tailles
  itemHeight: 34,
  iconSize: 17,
  sectionGap: 12,
  paddingX: 10,
} as const;
