'use client';

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
}

export function Panel({ theme, title, children }: PanelProps) {
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
}

export function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#475569', minWidth: 70 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 11, color: '#475569', minWidth: 28, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

interface CheckboxLineProps {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}

export function CheckboxLine({ checked, label, onChange }: CheckboxLineProps) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#1f2937', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
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
