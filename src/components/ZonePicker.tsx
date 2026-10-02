'use client';

// Sélecteurs UI pour les zones FIBA/NBA dans le formulaire d'action :
//   - ZoneSelect : dropdown groupé (zones relatives au porteur + catégories absolues)
//   - ZonePickerModal : mini-terrain SVG cliquable avec mode absolu / fort / faible
// Phase 2 du chantier zones — utilisé par ScenarioPanel.

import { useState } from 'react';
import {
  COURT_ZONES,
  ZONES_BY_CATEGORY,
  ALL_RELATIVE_ZONE_IDS,
  type AbsoluteZoneId,
  type ZoneCategory,
  type ZoneDefinition,
  type ZoneRef,
} from '@/lib/data/courtZones';
import {
  PAINT, HOOP, HOOP_RADIUS, FT_LINE_Y, FT_CIRCLE_RADIUS,
  THREE_POINT_RADIUS, CORNER_3PT_X_LEFT, CORNER_3PT_X_RIGHT, CORNER_3PT_Y,
} from '@/lib/data/court';

const CATEGORY_LABELS: Record<ZoneCategory, string> = {
  coin: 'Coin / short corner',
  aile: 'Aile / slot',
  poste: 'Poste / raquette',
  axe: 'Axe panier-panier',
  transition: 'Transition / touche',
};

const CATEGORY_ORDER: ZoneCategory[] = ['axe', 'aile', 'coin', 'poste', 'transition'];

// =============================================================
// ZoneSelect — dropdown groupé
// =============================================================

interface ZoneSelectProps {
  value: ZoneRef | undefined;
  onChange: (z: ZoneRef | undefined) => void;
  onOpenPicker?: () => void;
}

export function ZoneSelect({ value, onChange, onOpenPicker }: ZoneSelectProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as ZoneRef | undefined)}
        style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
      >
        <option value="">— aucune —</option>
        <optgroup label="Relatif au porteur (fort / faible)">
          {ALL_RELATIVE_ZONE_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </optgroup>
        {CATEGORY_ORDER.map((cat) => {
          const zones = ZONES_BY_CATEGORY[cat] ?? [];
          if (zones.length === 0) return null;
          return (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
      {onOpenPicker && (
        <button
          type="button"
          onClick={onOpenPicker}
          title="Choisir sur le terrain"
          style={{
            fontSize: 11, padding: '2px 6px', cursor: 'pointer',
            background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 3,
          }}
        >
          🏀
        </button>
      )}
    </div>
  );
}

// =============================================================
// ZonePickerModal — mini-terrain cliquable
// =============================================================

type PickerMode = 'absolute' | 'strong' | 'weak';

interface ZonePickerModalProps {
  initialValue?: ZoneRef;
  onConfirm: (z: ZoneRef) => void;
  onCancel: () => void;
}

const HIT_RADIUS = 14;
const MINI_W = 320;
const MINI_H = 300;
// On affiche la moitié supérieure du terrain (baseline jusqu'à y≈540) ramenée
// au cadrage utile (y∈[0, 540]). On scale x: 600→320, y: 540→300.
const SCALE_X = MINI_W / 600;
const SCALE_Y = MINI_H / 540;
const sx = (x: number) => x * SCALE_X;
const sy = (y: number) => y * SCALE_Y;

export function ZonePickerModal({ initialValue, onConfirm, onCancel }: ZonePickerModalProps) {
  const [mode, setMode] = useState<PickerMode>(
    initialValue && (initialValue.endsWith('-strong') || initialValue.endsWith('-weak'))
      ? (initialValue.endsWith('-strong') ? 'strong' : 'weak')
      : 'absolute'
  );
  const [hovered, setHovered] = useState<AbsoluteZoneId | null>(null);

  const handleClick = (zone: ZoneDefinition) => {
    if (mode === 'absolute') {
      onConfirm(zone.id);
      return;
    }
    // Modes relatifs : si la zone n'a pas de version latéralisée (axe), on garde l'absolu.
    if (!zone.mirror) {
      onConfirm(zone.id);
      return;
    }
    // Conversion left/right → strong/weak. La famille de la zone est déduite
    // en remplaçant le suffixe -left/-right par -<mode>.
    const base = zone.id.replace(/-(left|right)$/, '');
    const relativeId = `${base}-${mode}` as ZoneRef;
    onConfirm(relativeId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 8, padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)', maxWidth: 380,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Choisir une zone du terrain</h3>
          <button
            type="button" onClick={onCancel}
            style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bt-text-dim)' }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <span style={{ color: 'var(--bt-text-muted)' }}>Mode :</span>
          {(['absolute', 'strong', 'weak'] as PickerMode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input
                type="radio" checked={mode === m} onChange={() => setMode(m)}
                style={{ margin: 0 }}
              />
              {m === 'absolute' ? 'Position absolue' : m === 'strong' ? 'Côté fort' : 'Côté faible'}
            </label>
          ))}
        </div>

        <svg
          width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`}
          style={{ background: '#0e7c5a', borderRadius: 4, display: 'block' }}
        >
          {/* Raquette */}
          <rect
            x={sx(PAINT.x1)} y={sy(PAINT.y1)}
            width={sx(PAINT.x2 - PAINT.x1)} height={sy(PAINT.y2 - PAINT.y1)}
            fill="#C97A3A" stroke="#fff" strokeWidth={1.5}
          />
          {/* Ligne LF (cercle dashed pour faire moitié simple) */}
          <circle
            cx={sx(300)} cy={sy(FT_LINE_Y)} r={sx(FT_CIRCLE_RADIUS)}
            fill="none" stroke="#fff" strokeWidth={1.2} strokeDasharray="4 3"
          />
          {/* Lignes coin 3pts */}
          <line x1={sx(CORNER_3PT_X_LEFT)} y1={sy(20)} x2={sx(CORNER_3PT_X_LEFT)} y2={sy(CORNER_3PT_Y)} stroke="#fff" strokeWidth={1.5} />
          <line x1={sx(CORNER_3PT_X_RIGHT)} y1={sy(20)} x2={sx(CORNER_3PT_X_RIGHT)} y2={sy(CORNER_3PT_Y)} stroke="#fff" strokeWidth={1.5} />
          {/* Arc 3pts */}
          <path
            d={`M ${sx(CORNER_3PT_X_LEFT)} ${sy(CORNER_3PT_Y)} A ${sx(THREE_POINT_RADIUS)} ${sy(THREE_POINT_RADIUS)} 0 0 0 ${sx(CORNER_3PT_X_RIGHT)} ${sy(CORNER_3PT_Y)}`}
            fill="none" stroke="#fff" strokeWidth={1.5}
          />
          {/* Panier */}
          <circle cx={sx(HOOP.x)} cy={sy(HOOP.y)} r={Math.max(2, sx(HOOP_RADIUS))} fill="none" stroke="#ff7a1a" strokeWidth={2} />

          {/* Hit-areas pour chaque zone */}
          {(Object.values(COURT_ZONES) as ZoneDefinition[]).map((z) => {
            const isHovered = hovered === z.id;
            const cx = sx(z.point.x);
            const cy = sy(z.point.y);
            return (
              <g
                key={z.id}
                onMouseEnter={() => setHovered(z.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleClick(z)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={cx} cy={cy} r={HIT_RADIUS}
                  fill={isHovered ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.18)'}
                  stroke={isHovered ? '#fde047' : 'rgba(255,255,255,0.45)'}
                  strokeWidth={isHovered ? 2 : 1}
                />
                {isHovered && (
                  <text
                    x={cx} y={cy - HIT_RADIUS - 4}
                    fill="#fff" fontSize={10} textAnchor="middle"
                    style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
                  >
                    {z.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <p style={{ fontSize: 11, color: 'var(--bt-text-muted)', margin: 0 }}>
          {mode === 'absolute'
            ? 'Clique une zone pour la sélectionner (référence absolue gauche/droite).'
            : `Clique une zone latéralisée — elle sera enregistrée comme "${mode === 'strong' ? 'côté fort' : 'côté faible'}" relativement au porteur.`}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button" onClick={onCancel}
            style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: 3, background: 'white', cursor: 'pointer' }}
          >Annuler</button>
        </div>
      </div>
    </div>
  );
}
