// Tokens de la coque de l'éditeur (barre d'app, rail d'icônes, panneaux
// latéraux) et de leurs popovers. La zone centrale garde la palette de ui.tsx.

// Palette bleu-gris foncé — pas noir pur, plus chaud et plus lisible.
// Alignée avec DARK_PANEL pour la cohérence entre panneaux et vues routées.
export const SIDEBAR = {
  bg: '#1a1d23',
  bgHover: '#262a32',
  bgActive: '#2f343d',
  /** Fond du plan de travail (derrière le terrain), plus sombre que les colonnes. */
  canvas: '#14171c',
  border: '#2a2d35',
  borderSubtle: '#22252c',
  text: '#f3f4f6',
  textMuted: '#cbd5e1',
  textDim: '#94a3b8',
  accent: '#a78bfa',
  accentBg: 'rgba(167, 139, 250, 0.14)',
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
