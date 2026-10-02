// Tokens de la coque de l'éditeur (barre d'app, rail d'icônes, panneaux
// latéraux) et de leurs popovers. La zone centrale garde la palette de ui.tsx.

// Les couleurs sont des variables CSS (cf. globals.css) : thème clair par
// défaut, sombre selon le système ou le choix de l'utilisateur.
export const SIDEBAR = {
  bg: 'var(--bt-bg)',
  bgHover: 'var(--bt-surface)',
  bgActive: 'var(--bt-surface-raised)',
  /** Fond du plan de travail (derrière le terrain), plus sombre que les colonnes. */
  canvas: 'var(--bt-canvas)',
  border: 'var(--bt-border)',
  borderSubtle: 'var(--bt-border)',
  text: 'var(--bt-text)',
  textMuted: 'var(--bt-text-muted)',
  textDim: 'var(--bt-text-dim)',
  accent: 'var(--bt-accent)',
  accentBg: 'var(--bt-accent-bg)',
  // Largeurs des colonnes
  railWidth: 64,
  panelWidth: 272,
  rightWidth: 288,
  rightCollapsedWidth: 44,
  // Hauteurs des barres
  topBarHeight: 48,
  toolbarHeight: 44,
  // Tailles
  itemHeight: 36,
  iconSize: 17,
  sectionGap: 12,
  paddingX: 10,
} as const;
