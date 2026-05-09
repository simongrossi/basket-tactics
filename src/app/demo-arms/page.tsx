'use client';

import { useState } from 'react';

const r = 16; // PLAYER_RADIUS

interface ArmDesign {
  name: string;
  description: string;
  leftPath: (cx: number, cy: number) => string;
  rightPath: (cx: number, cy: number) => string;
}

/**
 * 3 designs candidats pour le tracé des bras du pictogramme joueur.
 * Tous en posture neutre (regard au-dessus = nord). Le wrapper rotate
 * du Player.tsx applique ensuite l'angle du regard.
 */
const DESIGNS: ArmDesign[] = [
  {
    name: 'A — FIBA classique',
    description:
      "Bras au-dessus, courbure latérale ouverte vers l'extérieur. Style pictogramme stylisé de la doc FIBA. Compact, lisible, peu encombrant.",
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.6} ${cy - r * 0.7} Q ${cx - r * 1.4} ${cy - r * 0.95} ${cx - r * 1.55} ${cy - r * 0.15}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.6} ${cy - r * 0.7} Q ${cx + r * 1.4} ${cy - r * 0.95} ${cx + r * 1.55} ${cy - r * 0.15}`,
  },
  {
    name: 'B — Tendus en avant (actuel)',
    description:
      "Épaules en arrière du cercle (dos), mains tendues en avant à ±60° du regard, courbure extérieure alignée sur les bords du cône de vision. Posture défensive bras devant.",
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.4} ${cy + r * 0.7} Q ${cx - r * 1.0} ${cy - r * 0.3} ${cx - r * 1.7} ${cy - r * 1.0}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.4} ${cy + r * 0.7} Q ${cx + r * 1.0} ${cy - r * 0.3} ${cx + r * 1.7} ${cy - r * 1.0}`,
  },
  {
    name: 'C — Active stance (coudes pliés)',
    description:
      "Épaules au niveau du centre (côtés), coudes visibles (control point intérieur dépassant l'avant), mains à ±45° du regard. Posture humaine plus naturelle, plus compacte que B.",
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.7} ${cy + r * 0.2} Q ${cx - r * 0.5} ${cy - r * 0.9} ${cx - r * 1.2} ${cy - r * 1.3}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.7} ${cy + r * 0.2} Q ${cx + r * 0.5} ${cy - r * 0.9} ${cx + r * 1.2} ${cy - r * 1.3}`,
  },
];

const ANGLES = [0, 45, 90, 180, 270];

export default function DemoArmsPage() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>3 designs de bras — choisis celui qui te plait</h1>
      <p style={{ color: '#475569', maxWidth: 760 }}>
        Chaque design est rendu à 5 orientations (0°, 45°, 90°, 180°, 270°).
        Le <strong style={{ color: '#dc2626' }}>triangle rouge</strong> indique le regard, les
        légendes N/E/S/O sont les directions de référence (le panier est en haut = N).
        Les bras suivent le regard via une rotation du pictogramme.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
        {DESIGNS.map((design, i) => (
          <div
            key={i}
            style={{
              border: selected === i ? '3px solid #16a34a' : '2px solid #e2e8f0',
              borderRadius: 8,
              padding: 16,
              background: selected === i ? '#f0fdf4' : '#fff',
            }}
          >
            <h2 style={{ margin: '0 0 4px 0', fontSize: 16 }}>{design.name}</h2>
            <p style={{ fontSize: 11, color: '#64748b', minHeight: 64, marginTop: 0 }}>
              {design.description}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ANGLES.map((angle) => (
                <PictogramExample key={angle} angle={angle} design={design} />
              ))}
            </div>

            <button
              onClick={() => setSelected(i)}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: selected === i ? '#16a34a' : '#3b82f6',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {selected === i ? `✓ Design ${String.fromCharCode(65 + i)} choisi` : `Choisir Design ${String.fromCharCode(65 + i)}`}
            </button>
          </div>
        ))}
      </div>

      {selected !== null && (
        <div style={{ marginTop: 24, padding: 16, background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#15803d' }}>
            <strong>Tu as choisi le Design {String.fromCharCode(65 + selected)}.</strong>{' '}
            Dis-le-moi en chat (&quot;Design A&quot; / &quot;Design B&quot; / &quot;Design C&quot;)
            et j&apos;applique le tracé dans Player.tsx.
          </p>
        </div>
      )}
    </div>
  );
}

function PictogramExample({ angle, design }: { angle: number; design: ArmDesign }) {
  const cx = 60;
  const cy = 60;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ minWidth: 36, fontSize: 11, color: '#64748b' }}>{angle}°</span>
      <svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
        style={{ border: '1px solid #e2e8f0', borderRadius: 4, background: '#fafaf9' }}
      >
        {/* Légendes cardinales */}
        <text x={cx} y={10} fontSize={8} fill="#94a3b8" textAnchor="middle">N (panier)</text>
        <text x={114} y={62} fontSize={8} fill="#94a3b8" textAnchor="end">E</text>
        <text x={cx} y={116} fontSize={8} fill="#94a3b8" textAnchor="middle">S</text>
        <text x={6} y={62} fontSize={8} fill="#94a3b8" textAnchor="start">O</text>

        {/* Pictogramme rotaté */}
        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <path
            d={design.leftPath(cx, cy)}
            fill="none"
            stroke="#042C53"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <path
            d={design.rightPath(cx, cy)}
            fill="none"
            stroke="#042C53"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>

        {/* Cercle joueur (par-dessus les bras pour cacher le départ) */}
        <circle cx={cx} cy={cy} r={r} fill="#378ADD" stroke="#042C53" strokeWidth={2} />

        {/* Triangle de regard (rotaté pour suivre l'angle) */}
        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <polygon
            points={`${cx},${cy - r - 6} ${cx - 4},${cy - r} ${cx + 4},${cy - r}`}
            fill="#dc2626"
          />
        </g>
      </svg>
    </div>
  );
}
