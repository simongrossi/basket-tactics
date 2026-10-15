'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { useAccordionState } from '@/hooks/useAccordionState';
import { useSidebarTheme, DARK_PANEL } from './sidebar/SidebarThemeContext';

export const COLORS = {
  offense: {
    bg: '#fff7ed',
    bgSubtle: '#ffedd5',
    border: '#fed7aa',
    accent: '#D85A30',
    accentDark: '#9a3412',
    accentText: '#7c2d12',
    /** Fond plein sous texte blanc (contraste ≥ 4,5:1), U04. */
    accentStrong: '#c2410c',
  },
  defense: {
    bg: '#eff6ff',
    bgSubtle: '#dbeafe',
    border: '#bfdbfe',
    accent: '#378ADD',
    accentDark: '#1e40af',
    accentText: '#1e3a8a',
    /** Fond plein sous texte blanc (contraste ≥ 4,5:1), U04. */
    accentStrong: '#1d6ec2',
  },
  neutral: {
    bg: '#fafaf9',
    border: '#e2e8f0',
    text: '#475569',
  },
};

export type Theme = 'offense' | 'defense' | 'neutral';

interface PanelProps {
  theme: Theme;
  title: string;
  children: ReactNode;
  /** Permet d'imposer un flex/min-height au Panel quand il vit dans une
   *  colonne flex (ex : un Panel court veut sa hauteur naturelle, OffensePanel
   *  veut occuper l'espace restant). */
  fill?: boolean;
}

export function Panel({ theme, title, children, fill }: PanelProps) {
  const c = COLORS[theme];
  const accent = 'accent' in c ? c.accent : '#94a3b8';
  const { dark } = useSidebarTheme();

  // En mode dark/sidebar : on retire complètement le chrome du Panel (carte,
  // bordure, gros titre avec filet d'accent). Reste : un label discret SIDEBAR
  // section-style (uppercase, petite caps, accent color en tiret coloré
  // optionnel) et le contenu plat. Le but est d'éviter les "mini-navs"
  // empilées dans la nav.
  if (dark) {
    // En mode dark/sidebar, le SidebarToolGroup parent fournit déjà le
    // header (icône + label + chevron), donc le Panel ne dessine plus
    // son propre titre/cadre. Reste : juste les enfants dans un flow
    // vertical serré.
    return (
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {children}
      </section>
    );
  }

  return (
    <aside
      style={{
        background: 'var(--bt-surface, #fff)',
        border: `1px solid var(--bt-border, ${c.border})`,
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 0,
        overflow: 'hidden',
        flex: fill ? '1 1 0' : '0 0 auto',
        boxShadow: 'var(--bt-panel-shadow, 0 1px 3px rgba(15, 23, 42, 0.04))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 6,
          borderBottom: `1px solid var(--bt-border, ${c.border})`,
        }}
      >
        <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
        <div
          style={{
            fontSize: 13,
            fontWeight: 750,
            letterSpacing: '-0.01em',
            color: 'var(--bt-text, #0f172a)',
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </aside>
  );
}

interface SectionProps {
  theme: Theme;
  label: string;
  open?: boolean;
  children: ReactNode;
}

export function Section({ theme, label, open, children }: SectionProps) {
  const c = COLORS[theme];
  const { dark } = useSidebarTheme();
  return (
    <details
      open={open}
      style={{
        borderTop: `1px solid ${dark ? DARK_PANEL.borderSubtle : c.border}`,
        paddingTop: 6,
      }}
    >
      <summary
        style={{
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          color: dark ? DARK_PANEL.textMuted : 'accentText' in c ? c.accentText : c.text,
          letterSpacing: '0.02em',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {label}
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>{children}</div>
    </details>
  );
}

/**
 * Livraison 2 — section accordion avec persistence localStorage + variants
 * visuels pour hiérarchie de fréquence.
 *
 * Variants :
 *  - 'pinned'    : section toujours dépliée, jamais collapsible. Fond
 *                  bleu pâle. Pour les contrôles hot path (consignes
 *                  équipe, appliquer à tous).
 *  - 'neutral'   : section repliable standard. Fond blanc. Default.
 *  - 'secondary' : section repliable + en bas du panneau. Fond gris pâle.
 *                  Pour les contrôles rares (simu MC, mes presets).
 */
interface AccordionSectionProps {
  /** Identifiant stable pour localStorage (mémorisation déplié/replié). */
  id: string;
  theme: Theme;
  label: string;
  /** Icône/emoji à gauche du label. */
  icon?: string;
  /** Badge à droite du label (ex compteur "3 modifs"). */
  badge?: string | number;
  /** Variant visuel — détermine couleurs et behavior. */
  variant?: 'pinned' | 'neutral' | 'secondary';
  /** État initial si rien en localStorage. Ignoré pour 'pinned' (toujours true). */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionSection({
  id,
  theme,
  label,
  icon,
  badge,
  variant = 'neutral',
  defaultOpen,
  children,
}: AccordionSectionProps) {
  const c = COLORS[theme];
  const { dark } = useSidebarTheme();
  const isPinned = variant === 'pinned';
  const [open, setOpen] = useAccordionState(
    id,
    isPinned ? true : (defaultOpen ?? false)
  );
  const effectiveOpen = isPinned || open;

  // Couleurs par variant — en dark, on retire totalement le fond/bordure
  // par défaut (transparent), sauf pour 'pinned' qui garde une teinte
  // légèrement plus claire pour rester top-of-mind.
  const bg = dark
    ? variant === 'pinned'
      ? DARK_PANEL.bgSubtle
      : 'transparent'
    : variant === 'pinned'
      ? '#eff6ff'
      : variant === 'secondary'
        ? '#fafaf9'
        : '#fff';
  const borderColor = dark
    ? variant === 'pinned'
      ? DARK_PANEL.border
      : 'transparent'
    : variant === 'pinned'
      ? '#bfdbfe'
      : c.border;
  const accentText = dark
    ? DARK_PANEL.text
    : 'accentText' in c
      ? c.accentText
      : c.text;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background: bg,
        marginBottom: 2,
        // Pas d'`overflow: hidden` ici : le contenu repliable est géré par
        // le `display: none` ci-dessous quand fermé, et quand ouvert il
        // doit pouvoir contribuer à la hauteur du Panel parent (qui scroll).
      }}
    >
      <button
        type="button"
        onClick={isPinned ? undefined : () => setOpen(!open)}
        disabled={isPinned}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: accentText,
          background: 'transparent',
          border: 'none',
          cursor: isPinned ? 'default' : 'pointer',
          textAlign: 'left',
          letterSpacing: '0.02em',
        }}
      >
        {!isPinned && (
          <span
            style={{
              display: 'inline-block',
              fontSize: 9,
              transform: effectiveOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 180ms ease',
              color: accentText,
              opacity: 0.6,
            }}
            aria-hidden
          >
            ▶
          </span>
        )}
        {icon && <span aria-hidden>{icon}</span>}
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && badge !== '' && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              background: dark ? DARK_PANEL.bgSubtle : '#fff',
              color: accentText,
              border: `1px solid ${borderColor}`,
              padding: '1px 5px',
              borderRadius: 8,
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {/* On `display: none` complètement le contenu quand fermé pour
       *  éviter les résidus visuels (bordures internes, padding fantôme).
       *  Trade-off : pas d'animation slide-down. Acceptable pour la
       *  lisibilité, plus important que l'esthétique du toggle. */}
      {effectiveOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '0 8px 8px',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  /** Tooltip affiché au survol du label (texte d'aide en français pour
   *  expliquer le réglage à un utilisateur non-technicien). */
  title?: string;
}

/**
 * Slider horizontal avec :
 *  - `<input type="range">` pour le glissement souris / tactile
 *  - `<input type="number">` à droite pour la saisie directe au clavier
 *
 * Les deux entrées partagent la même `value` propulsée par le caller. La
 * saisie texte se valide au `blur` ou à `Enter` (clamp dans [min, max]) ;
 * tant que l'utilisateur tape, on garde la valeur brute en local pour ne
 * pas perturber la frappe avec des arrondis intermédiaires.
 */
export function Slider({ label, min, max, step, value, onChange, title }: SliderProps) {
  const { dark } = useSidebarTheme();
  // Buffer local pour la saisie texte. Synchronisé avec `value` quand on est
  // hors focus ; pendant le focus, l'utilisateur peut taper librement (y
  // compris des valeurs hors bornes) — clampées au blur.
  const [text, setText] = React.useState<string>(() => formatValue(value, step));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (!focused) setText(formatValue(value, step));
  }, [value, step, focused]);

  const commit = () => {
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      // Snap au step pour éviter les valeurs "exotiques" tapées (e.g. 42.7
      // sur un step 2 → 42).
      const snapped = step >= 1
        ? Math.round(clamped / step) * step
        : Math.round(clamped / step) * step;
      onChange(snapped);
      setText(formatValue(snapped, step));
    } else {
      // Saisie non parseable → on remet la dernière valeur valide.
      setText(formatValue(value, step));
    }
    setFocused(false);
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }} title={title}>
      <span
        style={{
          fontSize: 11,
          color: dark ? DARK_PANEL.textMuted : '#475569',
          flex: '0 0 auto',
          maxWidth: 80,
          textDecoration: title ? `underline dotted ${dark ? DARK_PANEL.border : '#cbd5e1'}` : undefined,
          textUnderlineOffset: 3,
          cursor: title ? 'help' : 'default',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: '1 1 0', minWidth: 0 }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={focused ? text : formatValue(value, step)}
        onFocus={() => {
          setFocused(true);
          setText(formatValue(value, step));
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(formatValue(value, step));
            setFocused(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        // Cache les flèches up/down natives — elles dupliquent le slider.
        style={{
          width: 44,
          fontSize: 11,
          color: dark ? DARK_PANEL.text : '#475569',
          textAlign: 'right',
          border: `1px solid ${dark ? DARK_PANEL.border : '#e2e8f0'}`,
          borderRadius: 3,
          padding: '1px 3px',
          background: dark ? DARK_PANEL.bgSubtle : '#fff',
        }}
      />
    </div>
  );
}

/** Mise en forme cohérente avec l'ancien `display` : entier si step ≥ 1,
 *  sinon 1 décimale (ou 2 si step < 0.1). */
function formatValue(v: number, step: number): string {
  if (step < 0.1) return v.toFixed(2);
  if (step < 1) return v.toFixed(1);
  return String(Math.round(v));
}

interface CheckboxLineProps {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
  /** Tooltip d'aide en français au survol. */
  title?: string;
}

export function CheckboxLine({ checked, label, onChange, title }: CheckboxLineProps) {
  const { dark } = useSidebarTheme();
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        color: dark ? DARK_PANEL.text : '#1f2937',
        cursor: 'pointer',
        lineHeight: 1.25,
        minWidth: 0,
      }}
      title={title}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{
        textDecoration: title ? `underline dotted ${dark ? DARK_PANEL.border : '#cbd5e1'}` : undefined,
        textUnderlineOffset: 3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </label>
  );
}

export function InfoTooltip({ title }: { title: string }) {
  return (
    <span
      tabIndex={0}
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1px solid #bfdbfe',
        background: '#eff6ff',
        color: '#1e40af',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        cursor: 'help',
        flex: '0 0 auto',
      }}
    >
      ?
    </span>
  );
}

interface ButtonProps {
  onClick: () => void;
  theme?: Theme;
  variant?: 'solid' | 'outline';
  fullWidth?: boolean;
  children: ReactNode;
  title?: string;
}

export function Button({ onClick, theme = 'neutral', variant = 'outline', fullWidth, children, title }: ButtonProps) {
  const c = COLORS[theme];
  const { dark } = useSidebarTheme();
  const accent = 'accent' in c ? c.accent : c.text;
  const accentText = 'accentText' in c ? c.accentText : c.text;
  const isSolid = variant === 'solid';
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        border: `1px solid ${dark ? DARK_PANEL.border : c.border}`,
        background: isSolid ? accent : dark ? DARK_PANEL.bgSubtle : '#fff',
        color: isSolid ? '#fff' : dark ? DARK_PANEL.text : accentText,
        cursor: 'pointer',
        fontWeight: 500,
        width: fullWidth ? '100%' : undefined,
        transition: 'background 120ms',
      }}
    >
      {children}
    </button>
  );
}
