// Mini-composants de layout partagés par les menus contextuels.
//
//  - `Row` : une ligne "label : contenu" avec titre optionnel (tooltip)
//  - `OverrideSliderRow` : slider qui bascule entre mode "global" et
//    "override individuel", avec bouton ↻ pour revenir au global
//  - `GazeLockButton` : petit bouton on/off pour le verrouillage du regard

export function Row({
  label,
  children,
  title,
}: {
  label: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }} title={title}>
      <span
        style={{
          fontSize: 12,
          color: '#666',
          width: 88,
          textDecoration: title ? 'underline dotted #cbd5e1' : undefined,
          textUnderlineOffset: 3,
          cursor: title ? 'help' : 'default',
        }}
      >
        {label}
      </span>
      {children}
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }} title={title}>
      <span style={{ fontSize: 12, color: overridden ? '#9a3412' : '#666', width: 88, fontWeight: overridden ? 600 : 400 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? (min + max) / 2}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, opacity: overridden ? 1 : 0.55 }}
      />
      <span style={{ fontSize: 11, color: overridden ? '#9a3412' : '#94a3b8', minWidth: 36, textAlign: 'right', fontWeight: overridden ? 600 : 400 }}>
        {display}
      </span>
      {overridden && (
        <button
          onClick={onReset}
          title="Revenir au réglage global"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: 13,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ↻
        </button>
      )}
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
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: '3px 6px',
        borderRadius: 3,
        border: `1px solid ${active ? '#9a3412' : '#cbd5e1'}`,
        background: active ? '#ea580c' : '#fff',
        color: active ? '#fff' : '#475569',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
