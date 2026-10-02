// Mini-composants de layout partagés par les menus contextuels.
//
//  - `Row` : une ligne "label : contenu" avec aide contextuelle optionnelle
//  - `OverrideSliderRow` : slider qui bascule entre mode "global" et
//    "override individuel", avec bouton ↻ pour revenir au global
//  - `GazeLockButton` : petit bouton on/off pour le verrouillage du regard

import type { ReactNode } from 'react';
import { Info, Lock, RotateCcw } from 'lucide-react';
import { DARK_PANEL } from '../sidebar/SidebarThemeContext';

const ACCENT = 'var(--bt-orange-text)';
const BLUE_ACCENT = 'var(--bt-accent)';

function HelpTip({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span
      className="bt-context-help"
      data-tip={text}
      aria-label={text}
      role="note"
      tabIndex={0}
    >
      <Info size={12} strokeWidth={2.4} />
    </span>
  );
}

export function Row({
  label,
  children,
  title,
}: {
  label: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '112px minmax(0, 1fr)',
        gap: 10,
        alignItems: 'center',
        minHeight: 34,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minWidth: 0,
          fontSize: 12,
          lineHeight: 1.15,
          color: DARK_PANEL.textMuted,
          fontWeight: 600,
        }}
      >
        <span style={{ minWidth: 0 }}>{label}</span>
        <HelpTip text={title} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Ligne slider qui peut être en mode "global" (value undefined → reprend le
 * réglage global) ou en mode "override" (value définie). Indicateur visuel
 * quand override actif + bouton ↻ pour revenir au global.
 */
export function OverrideSliderRow({
  label, min, max, step, value, onChange, onReset, title,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number | undefined;
  onChange: (v: number) => void;
  onReset: () => void;
  title?: string;
}) {
  const overridden = value !== undefined;
  const display = overridden ? value!.toFixed(step < 1 ? 2 : 0) : 'global';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '112px minmax(0, 1fr)',
        gap: 10,
        alignItems: 'center',
        minHeight: 34,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minWidth: 0,
          fontSize: 12,
          lineHeight: 1.15,
          color: overridden ? ACCENT : DARK_PANEL.textMuted,
          fontWeight: overridden ? 700 : 600,
        }}
      >
        <span style={{ minWidth: 0 }}>{label}</span>
        <HelpTip text={title} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? (min + max) / 2}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, minWidth: 0, opacity: overridden ? 1 : 0.55 }}
        />
        <span style={{ fontSize: 12, color: overridden ? ACCENT : DARK_PANEL.textDim, minWidth: 44, textAlign: 'right', fontWeight: overridden ? 700 : 600 }}>
          {display}
        </span>
        {overridden && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Revenir au réglage global"
            style={{
              width: 24,
              height: 24,
              border: `1px solid ${DARK_PANEL.border}`,
              borderRadius: 6,
              background: DARK_PANEL.bgSubtle,
              cursor: 'pointer',
              color: DARK_PANEL.textDim,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <RotateCcw size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

export function GazeLockButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 30,
        fontSize: 12,
        padding: '5px 8px',
        borderRadius: 6,
        border: `1px solid ${active ? BLUE_ACCENT : DARK_PANEL.border}`,
        background: active ? BLUE_ACCENT : DARK_PANEL.bgSubtle,
        color: active ? 'var(--bt-on-accent)' : DARK_PANEL.textMuted,
        cursor: 'pointer',
        fontWeight: active ? 800 : 600,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {active && label !== 'auto' && <Lock size={12} strokeWidth={2.4} />}
      {label}
    </button>
  );
}
