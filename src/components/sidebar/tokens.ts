// Tokens dark sidebar (Phase 1 refonte UI — sidebar unique gauche).
// La zone centrale garde la palette claire de ui.tsx, donc ces tokens
// ne servent QUE pour les composants sidebar/* et leurs popovers.

// Palette bleu-gris foncé (style Claude dashboard) — pas noir pur, plus chaud
// et plus lisible. Aligné avec DARK_PANEL pour cohérence entre sidebar et
// vues routées inline.
export const SIDEBAR = {
  bg: 'var(--bt-sidebar-bg, #1a1d23)',
  bgHover: 'var(--bt-sidebar-hover, #262a32)',
  bgActive: 'var(--bt-sidebar-active, #2f343d)',
  border: 'var(--bt-sidebar-border, #2a2d35)',
  borderSubtle: 'var(--bt-sidebar-border, #22252c)',
  text: 'var(--bt-sidebar-text, #f3f4f6)',
  textMuted: 'var(--bt-sidebar-muted, #cbd5e1)',
  textDim: 'var(--bt-sidebar-dim, #94a3b8)',
  accent: 'var(--bt-accent, #a78bfa)',
  accentBg: 'var(--bt-sidebar-accent-bg, rgba(167, 139, 250, 0.14))',
  // Largeurs
  widthExpanded: 240,
  widthCollapsed: 56,
  // Tailles
  itemHeight: 36,
  iconSize: 17,
  sectionGap: 12,
  paddingX: 10,
} as const;
