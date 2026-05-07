'use client';

import { useState } from 'react';
import type { ZoneLayout, ZoneRegion, ZoneRegionMode, Point } from '@/lib/types';

const REGION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface ZoneEditOverlayProps {
  layout: ZoneLayout;
  /** Conversion d'un événement pointer (clientX/Y) en coordonnées SVG du terrain. */
  toCourtPoint: (clientX: number, clientY: number) => Point | null;
  onMoveHomePos: (regionId: string, pos: Point) => void;
  onSelectRegion: (regionId: string, e: React.MouseEvent) => void;
}

/**
 * Overlay interactif pour le mode édition zones :
 * - Polygones colorés (un par région) en fill semi-transparent vivant
 * - Cercle de rayon de responsabilité visible
 * - Handle draggable au homePos
 * - Label cliquable qui ouvre le menu par région
 *
 * Coexiste avec ZoneOverlay (lui reste sobre, montre les contours
 * pointillés en lecture). Quand zoneEditMode est ON, on affiche en plus
 * cet overlay par-dessus pour l'interaction.
 */
export function ZoneEditOverlay({
  layout,
  toCourtPoint,
  onMoveHomePos,
  onSelectRegion,
}: ZoneEditOverlayProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onPointerDown = (e: React.PointerEvent, regionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(regionId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingId) return;
    const pt = toCourtPoint(e.clientX, e.clientY);
    if (!pt) return;
    onMoveHomePos(draggingId, pt);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingId) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    setDraggingId(null);
  };

  return (
    <g>
      {layout.map((zone, i) => {
        const color = REGION_COLORS[i % REGION_COLORS.length];
        const points = zone.polygon.map((p) => `${p.x},${p.y}`).join(' ');
        const radius = zone.radius ?? 200;
        const isDragging = draggingId === zone.id;
        return (
          <g key={zone.id}>
            {/* Fill coloré semi-transparent — la "couleur" de responsabilité.
                pointerEvents=none pour ne pas bloquer le drag des joueurs en dessous. */}
            <polygon
              points={points}
              fill={color}
              fillOpacity={0.18}
              stroke={color}
              strokeOpacity={0.7}
              strokeWidth={2}
              pointerEvents="none"
            />
            {/* Cercle du rayon de responsabilité (où le défenseur sort) */}
            <circle
              cx={zone.homePos.x}
              cy={zone.homePos.y}
              r={radius}
              fill="none"
              stroke={color}
              strokeOpacity={0.35}
              strokeWidth={1.2}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
            {/* Label cliquable au-dessus du homePos */}
            <g
              onClick={(e) => {
                e.stopPropagation();
                onSelectRegion(zone.id, e);
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={zone.homePos.x - 38}
                y={zone.homePos.y - 32}
                width={76}
                height={18}
                rx={3}
                fill={color}
                fillOpacity={0.9}
              />
              <text
                x={zone.homePos.x}
                y={zone.homePos.y - 19}
                textAnchor="middle"
                fill="#fff"
                fontSize={11}
                fontWeight={600}
              >
                {zone.label} → {zone.assignedTo}
              </text>
            </g>
            {/* Handle draggable au homePos */}
            <circle
              cx={zone.homePos.x}
              cy={zone.homePos.y}
              r={isDragging ? 12 : 9}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => onPointerDown(e, zone.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {/* Petit indicateur du mode si non-auto */}
            {zone.mode && zone.mode !== 'auto' && (
              <text
                x={zone.homePos.x}
                y={zone.homePos.y + 4}
                textAnchor="middle"
                fill="#fff"
                fontSize={9}
                fontWeight={700}
                pointerEvents="none"
              >
                {modeBadge(zone.mode)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function modeBadge(mode: ZoneRegionMode): string {
  if (mode === 'agressif') return '⚡';
  if (mode === 'passif') return '⌣';
  if (mode === 'trap') return '✕';
  return '';
}

interface ZoneRegionMenuProps {
  region: ZoneRegion;
  x: number;
  y: number;
  onUpdate: (patch: { radius?: number; mode?: ZoneRegionMode }) => void;
  onReset: () => void;
  onClose: () => void;
}

export function ZoneRegionMenu({ region, x, y, onUpdate, onReset, onClose }: ZoneRegionMenuProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
        minWidth: 220,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          {region.label} → {region.assignedTo}
        </span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: '#999', fontSize: 14 }}>×</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#666', width: 80 }}>mode</span>
        <select
          value={region.mode ?? 'auto'}
          onChange={(e) => onUpdate({ mode: e.target.value as ZoneRegionMode })}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="auto">auto (standard)</option>
          <option value="agressif">⚡ agressif (sortir vite)</option>
          <option value="passif">⌣ passif (rester home)</option>
          <option value="trap">✕ trap (piéger porteur)</option>
        </select>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
        title="Rayon de responsabilité (px). En deçà, le défenseur sort sur l'attaquant. Au-delà, il reste à son ancrage. Default 200."
      >
        <span style={{ fontSize: 12, color: '#666', width: 80 }}>rayon</span>
        <input
          type="range"
          min={80}
          max={350}
          step={10}
          value={region.radius ?? 200}
          onChange={(e) => onUpdate({ radius: parseInt(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>{region.radius ?? 200}px</span>
      </div>
      <button
        onClick={() => {
          onReset();
          onClose();
        }}
        style={{
          width: '100%',
          marginTop: 6,
          fontSize: 11,
          padding: '5px 8px',
          borderRadius: 4,
          border: '1px solid #cbd5e1',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        ↻ réinitialiser cette région
      </button>
    </div>
  );
}
