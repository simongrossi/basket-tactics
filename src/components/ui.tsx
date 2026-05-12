'use client';

import * as React from 'react';
import type { ReactNode } from 'react';

export const COLORS = {
  offense: {
    bg: '#fff7ed',
    bgSubtle: '#ffedd5',
    border: '#fed7aa',
    accent: '#D85A30',
    accentDark: '#9a3412',
    accentText: '#7c2d12',
  },
  defense: {
    bg: '#eff6ff',
    bgSubtle: '#dbeafe',
    border: '#bfdbfe',
    accent: '#378ADD',
    accentDark: '#1e40af',
    accentText: '#1e3a8a',
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
  return (
    <aside
      style={{
        background: '#fff',
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 0,
        overflow: 'hidden',
        flex: fill ? '1 1 0' : '0 0 auto',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'accentText' in c ? c.accentText : c.text,
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
  return (
    <details open={open} style={{ borderTop: `1px solid ${c.border}`, paddingTop: 6 }}>
      <summary
        style={{
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          color: 'accentText' in c ? c.accentText : c.text,
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} title={title}>
      <span
        style={{
          fontSize: 11,
          color: '#475569',
          minWidth: 70,
          textDecoration: title ? 'underline dotted #cbd5e1' : undefined,
          textUnderlineOffset: 3,
          cursor: title ? 'help' : 'default',
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
        style={{ flex: 1 }}
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
          color: '#475569',
          textAlign: 'right',
          border: '1px solid #e2e8f0',
          borderRadius: 3,
          padding: '1px 3px',
          background: '#fff',
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
  return (
    <label
      style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#1f2937', cursor: 'pointer' }}
      title={title}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ textDecoration: title ? 'underline dotted #cbd5e1' : undefined, textUnderlineOffset: 3 }}>
        {label}
      </span>
    </label>
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
        border: `1px solid ${c.border}`,
        background: isSolid ? accent : '#fff',
        color: isSolid ? '#fff' : accentText,
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
