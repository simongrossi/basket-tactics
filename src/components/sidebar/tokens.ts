// Tokens dark sidebar (Phase 1 refonte UI — sidebar unique gauche).
// La zone centrale garde la palette claire de ui.tsx, donc ces tokens
// ne servent QUE pour les composants sidebar/* et leurs popovers.

export const SIDEBAR = {
  bg: '#0b0b0f',
  bgHover: '#16161d',
  bgActive: '#1f1f29',
  border: '#1f1f29',
  borderSubtle: '#15151b',
  text: '#e5e5e5',
  textMuted: '#8b8b94',
  textDim: '#6b6b73',
  accent: '#a78bfa',
  accentBg: 'rgba(167, 139, 250, 0.12)',
  // Largeurs
  widthExpanded: 240,
  widthCollapsed: 56,
  // Tailles
  itemHeight: 36,
  iconSize: 18,
  sectionGap: 12,
  paddingX: 10,
} as const;
