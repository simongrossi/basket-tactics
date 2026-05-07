'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AttackerId, DefenderId, DefenderRule, Tool } from '@/lib/types';

/**
 * Repositionne un menu contextuel pour qu'il ne déborde pas du conteneur
 * parent (le wrap du SVG). Si le menu déborderait à droite, on l'ouvre vers
 * la gauche du clic ; idem en bas. Marge 8px du bord. Mesuré après mount
 * via useLayoutEffect (synchrone, sans flash visible).
 */
function useClampedPosition(initialX: number, initialY: number, ref: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    let nx = initialX;
    let ny = initialY;
    const overflowRight = initialX + rect.width - (parentRect.width - 8);
    if (overflowRight > 0) nx = Math.max(8, initialX - rect.width);
    const overflowBottom = initialY + rect.height - (parentRect.height - 8);
    if (overflowBottom > 0) ny = Math.max(8, initialY - rect.height);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialX, initialY]);
  return pos;
}

interface ToolBarProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  /** Si true (défenseur), on grise les outils qui ne s'appliquent pas (passe/dribble/course/écran).
   *  L'outil reste cliquable car il définit le mode global pour les prochaines actions sur les attaquants. */
  defenderContext?: boolean;
}

const TOOL_DEFS: { value: Tool; label: string; symbol: string }[] = [
  { value: 'move', label: 'déplacer', symbol: '✥' },
  { value: 'pass', label: 'passe', symbol: '⇢' },
  { value: 'dribble', label: 'dribble', symbol: '∿' },
  { value: 'cut', label: 'course', symbol: '→' },
  { value: 'screen', label: 'écran', symbol: '⊥' },
];

function ToolBar({ tool, onSetTool, defenderContext }: ToolBarProps) {
  return (
    <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
      {TOOL_DEFS.map((t) => {
        const active = tool === t.value;
        const greyed = defenderContext && t.value !== 'move';
        return (
          <button
            key={t.value}
            onClick={() => onSetTool(t.value)}
            title={t.label + (greyed ? ' — applicable aux attaquants seulement' : '')}
            style={{
              flex: '1 1 auto',
              fontSize: 10,
              padding: '4px 2px',
              borderRadius: 4,
              border: `1px solid ${active ? '#9a3412' : '#e2e8f0'}`,
              background: active ? '#D85A30' : '#fff',
              color: active ? '#fff' : (greyed ? '#cbd5e1' : '#7c2d12'),
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: 12 }}>{t.symbol}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface DefenderMenuProps {
  kind: 'defender';
  dId: DefenderId;
  x: number;
  y: number;
  rule: DefenderRule;
  hasOverride: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onUpdate: (patch: Partial<DefenderRule>) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

interface AttackerMenuProps {
  kind: 'attacker';
  oId: AttackerId;
  x: number;
  y: number;
  isCarrier: boolean;
  isForcedScreener: boolean;
  hasAnnotations: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onMakeCarrier: () => void;
  onForceScreener: () => void;
  onClearForcedScreener: () => void;
  onClearAnnotations: () => void;
  onClose: () => void;
}

type ContextMenuProps = DefenderMenuProps | AttackerMenuProps;

export function ContextMenu(props: ContextMenuProps) {
  if (props.kind === 'attacker') return <AttackerMenu {...props} />;
  return <DefenderMenu {...props} />;
}

function DefenderMenu({ dId, x, y, rule, hasOverride, tool, onSetTool, onUpdate, onClearOverride, onClose }: DefenderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(x, y, ref);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
        minWidth: 240,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        {dId}
        <span
          onClick={onClose}
          style={{ float: 'right', cursor: 'pointer', color: '#999', fontSize: 14 }}
        >
          ×
        </span>
      </div>
      <ToolBar tool={tool} onSetTool={onSetTool} defenderContext />
      <Row label="aide %">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={rule.helpPct}
          onChange={(e) => onUpdate({ helpPct: parseInt(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, minWidth: 32 }}>{rule.helpPct}%</span>
      </Row>
      <Row label="priorité">
        <select
          value={rule.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as DefenderRule['priority'] })}
          style={{ flex: 1 }}
        >
          <option value="paint">protéger raquette</option>
          <option value="man">rester sur homme</option>
          <option value="passlane">ligne de passe</option>
        </select>
      </Row>
      <Row label="vs porteur">
        <select
          value={rule.vsCarrier}
          onChange={(e) => onUpdate({ vsCarrier: e.target.value as DefenderRule['vsCarrier'] })}
          style={{ flex: 1 }}
        >
          <option value="coller">coller (pression)</option>
          <option value="bumper">bumper (entre lui & panier)</option>
          <option value="contester">contester (recul actif)</option>
          <option value="reculer">reculer (drop)</option>
          <option value="topside">topside (force milieu)</option>
          <option value="baseline">baseline (force ligne de fond)</option>
        </select>
      </Row>
      <Row label="hors-ballon">
        <select
          value={rule.offBallStance ?? 'sag'}
          onChange={(e) => onUpdate({ offBallStance: e.target.value as DefenderRule['offBallStance'] })}
          style={{ flex: 1 }}
        >
          <option value="sag">sag (aide raquette)</option>
          <option value="behind">derrière (entre lui & panier)</option>
          <option value="stunt">stunt (fake d'aide)</option>
          <option value="deny-3q">3/4 deny (pied dans la passe)</option>
          <option value="fronting">devant (full denial)</option>
        </select>
      </Row>
      <Row label="vs écran">
        <select
          value={rule.screenNav ?? 'auto'}
          onChange={(e) => onUpdate({ screenNav: e.target.value as DefenderRule['screenNav'] })}
          style={{ flex: 1 }}
        >
          <option value="auto">auto (règle globale)</option>
          <option value="over">over (par-dessus)</option>
          <option value="under">under (en dessous)</option>
          <option value="switch">switch (échange)</option>
          <option value="hedge">hedge (show & recover)</option>
          <option value="drop">drop (recul)</option>
          <option value="blitz">blitz (piège)</option>
        </select>
      </Row>
      <OverrideSliderRow
        label="distance"
        min={20}
        max={80}
        step={2}
        value={rule.distance}
        onChange={(v) => onUpdate({ distance: v })}
        onReset={() => onUpdate({ distance: undefined })}
        title="Override individuel de la distance défenseur ↔ son homme (px)"
      />
      <OverrideSliderRow
        label="closeout ×"
        min={1}
        max={2}
        step={0.1}
        value={rule.closeoutBoost}
        onChange={(v) => onUpdate({ closeoutBoost: v })}
        onReset={() => onUpdate({ closeoutBoost: undefined })}
        title="Override individuel du multiplicateur de vitesse en closeout"
      />
      <OverrideSliderRow
        label="denial agr."
        min={0}
        max={1}
        step={0.05}
        value={rule.denyAggressiveness}
        onChange={(v) => onUpdate({ denyAggressiveness: v })}
        onReset={() => onUpdate({ denyAggressiveness: undefined })}
        title="Override individuel de l'intensité du strong-side denial"
      />
      {hasOverride && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '4px 6px', borderRadius: 4 }}>
            Position manuelle active sur cette étape.
          </div>
          <button
            onClick={() => {
              onClearOverride();
              onClose();
            }}
            style={{
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ↻ ré-auto-positionner
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#666', width: 88 }}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Ligne slider qui peut être en mode "global" (value undefined → reprend le
 * réglage global) ou en mode "override" (value définie). Indicateur visuel
 * quand override actif + bouton ↻ pour revenir au global.
 */
function OverrideSliderRow({
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

function AttackerMenu({
  oId, x, y, isCarrier, isForcedScreener, hasAnnotations,
  tool, onSetTool,
  onMakeCarrier, onForceScreener, onClearForcedScreener, onClearAnnotations, onClose,
}: AttackerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(x, y, ref);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const Item = ({
    label, onClick, disabled,
  }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={() => { if (!disabled) { onClick(); onClose(); } }}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: 4,
        border: '1px solid #e7e5e4',
        background: disabled ? '#f8f8f7' : '#fff',
        color: disabled ? '#a8a29e' : '#1c1917',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
        minWidth: 220,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#9A3412' }}>
        ⚪ {oId}
        <span
          onClick={onClose}
          style={{ float: 'right', cursor: 'pointer', color: '#999', fontSize: 14 }}
        >
          ×
        </span>
      </div>
      <ToolBar tool={tool} onSetTool={onSetTool} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Item
          label={isCarrier ? '✓ porteur (étape active)' : 'marquer comme porteur'}
          onClick={onMakeCarrier}
          disabled={isCarrier}
        />
        {isForcedScreener ? (
          <Item label="↻ libérer (ne plus forcer)" onClick={onClearForcedScreener} />
        ) : (
          <Item label="forcer comme poseur d'écran" onClick={onForceScreener} />
        )}
        <Item
          label="effacer ses annotations"
          onClick={onClearAnnotations}
          disabled={!hasAnnotations}
        />
      </div>
      {isForcedScreener && (
        <div
          style={{
            marginTop: 8,
            padding: '4px 6px',
            fontSize: 11,
            color: '#5b21b6',
            background: '#ede9fe',
            borderRadius: 4,
          }}
        >
          Forcé comme poseur sur cette étape — l'auto-detection de proximité est désactivée.
        </div>
      )}
    </div>
  );
}
