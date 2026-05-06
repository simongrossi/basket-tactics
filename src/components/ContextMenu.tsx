'use client';

import { useEffect, useRef } from 'react';
import type { DefenderId, DefenderRule } from '@/lib/types';

interface ContextMenuProps {
  dId: DefenderId;
  x: number;
  y: number;
  rule: DefenderRule;
  hasOverride: boolean;
  onUpdate: (patch: Partial<DefenderRule>) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

export function ContextMenu({ dId, x, y, rule, hasOverride, onUpdate, onClearOverride, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

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
        left: x,
        top: y,
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
          <option value="deny-3q">3/4 deny (pied dans la passe)</option>
          <option value="fronting">devant (full denial)</option>
        </select>
      </Row>
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
