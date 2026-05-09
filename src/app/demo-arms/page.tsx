'use client';

import { useState } from 'react';

const r = 16; // PLAYER_RADIUS

interface ArmDesign {
  id: string;
  name: string;
  description: string;
  leftPath: (cx: number, cy: number) => string;
  rightPath: (cx: number, cy: number) => string;
}

/**
 * 8 designs candidats pour le tracé des bras du pictogramme joueur,
 * tous en posture neutre (regard nord). Le wrapper rotate du Player.tsx
 * applique l'angle du regard ensuite.
 *
 * Chaque design varie sur :
 *  - Position de l'épaule (haut / niveau / dos / arrière du cercle)
 *  - Position de la main (côté / haut-côté / en avant haut)
 *  - Direction de la courbure (extérieure / intérieure / vers l'avant)
 *  - Forme (arc large / arc serré / droit / V / U)
 */
const DESIGNS: ArmDesign[] = [
  {
    id: 'A',
    name: 'A — FIBA classique',
    description: 'Épaule haute, main côté, courbure haute extérieure. Bras levés sur les côtés.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.6} ${cy - r * 0.7} Q ${cx - r * 1.4} ${cy - r * 0.95} ${cx - r * 1.55} ${cy - r * 0.15}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.6} ${cy - r * 0.7} Q ${cx + r * 1.4} ${cy - r * 0.95} ${cx + r * 1.55} ${cy - r * 0.15}`,
  },
  {
    id: 'B',
    name: 'B — Tendus en avant',
    description: 'Épaule au dos, main en avant à ±60°, courbure extérieure montante.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.4} ${cy + r * 0.7} Q ${cx - r * 1.0} ${cy - r * 0.3} ${cx - r * 1.7} ${cy - r * 1.0}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.4} ${cy + r * 0.7} Q ${cx + r * 1.0} ${cy - r * 0.3} ${cx + r * 1.7} ${cy - r * 1.0}`,
  },
  {
    id: 'C',
    name: 'C — Active stance (coude plié)',
    description: 'Épaule centrale, coude visible vers l\'intérieur, main devant. Plus humain.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.7} ${cy + r * 0.2} Q ${cx - r * 0.5} ${cy - r * 0.9} ${cx - r * 1.2} ${cy - r * 1.3}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.7} ${cy + r * 0.2} Q ${cx + r * 0.5} ${cy - r * 0.9} ${cx + r * 1.2} ${cy - r * 1.3}`,
  },
  {
    id: 'D',
    name: 'D — Bras droits',
    description: 'Pas de courbure (Q remplacé par L). Lignes droites épaule → main.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.5} ${cy + r * 0.2} L ${cx - r * 1.6} ${cy - r * 0.9}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.5} ${cy + r * 0.2} L ${cx + r * 1.6} ${cy - r * 0.9}`,
  },
  {
    id: 'E',
    name: 'E — Embrace (courbure intérieure)',
    description: 'Épaule dos, main devant, courbure vers l\'INTÉRIEUR (paumes face au regard).',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.4} ${cy + r * 0.7} Q ${cx - r * 0.3} ${cy - r * 0.5} ${cx - r * 1.3} ${cy - r * 1.0}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.4} ${cy + r * 0.7} Q ${cx + r * 0.3} ${cy - r * 0.5} ${cx + r * 1.3} ${cy - r * 1.0}`,
  },
  {
    id: 'F',
    name: 'F — Bras grands ouverts',
    description: 'Épaule centre, main loin sur le côté en haut, courbure très extérieure.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.7} ${cy} Q ${cx - r * 2.0} ${cy - r * 0.5} ${cx - r * 1.8} ${cy - r * 1.4}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.7} ${cy} Q ${cx + r * 2.0} ${cy - r * 0.5} ${cx + r * 1.8} ${cy - r * 1.4}`,
  },
  {
    id: 'G',
    name: 'G — Forme en V',
    description: 'Épaule centre, mains au-dessus écartées, courbure douce vers le haut.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.4} ${cy + r * 0.1} Q ${cx - r * 0.7} ${cy - r * 0.6} ${cx - r * 1.2} ${cy - r * 1.5}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.4} ${cy + r * 0.1} Q ${cx + r * 0.7} ${cy - r * 0.6} ${cx + r * 1.2} ${cy - r * 1.5}`,
  },
  {
    id: 'H',
    name: 'H — FIBA + dos (fusion A+B)',
    description: 'Épaule au dos, main côté niveau, courbure haute style FIBA. Version actuelle.',
    leftPath: (cx, cy) =>
      `M ${cx - r * 0.4} ${cy + r * 0.7} Q ${cx - r * 1.4} ${cy - r * 0.95} ${cx - r * 1.55} ${cy - r * 0.15}`,
    rightPath: (cx, cy) =>
      `M ${cx + r * 0.4} ${cy + r * 0.7} Q ${cx + r * 1.4} ${cy - r * 0.95} ${cx + r * 1.55} ${cy - r * 0.15}`,
  },
];

const ANGLES = [0, 90, 180, 270];

export default function DemoArmsPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1600, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>8 designs de bras — choisis-en un (ou décris ce qui manque)</h1>
      <p style={{ color: '#475569', maxWidth: 900 }}>
        Chaque design est rendu à 4 orientations (0°, 90°, 180°, 270°). Le{' '}
        <strong style={{ color: '#dc2626' }}>triangle rouge</strong> indique le regard. N = panier
        (référence), les bras suivent le regard via une rotation du pictogramme.
      </p>
      <p style={{ color: '#475569', maxWidth: 900, fontSize: 13 }}>
        Si aucun ne convient, dis-moi par exemple <em>&quot;comme E mais avec les mains de B&quot;</em>{' '}
        ou <em>&quot;épaule du dos avec une courbure inversée&quot;</em>, je créerai une nouvelle variante.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
        {DESIGNS.map((design) => (
          <div
            key={design.id}
            style={{
              border: selected === design.id ? '3px solid #16a34a' : '2px solid #e2e8f0',
              borderRadius: 8,
              padding: 12,
              background: selected === design.id ? '#f0fdf4' : '#fff',
            }}
          >
            <h2 style={{ margin: '0 0 4px 0', fontSize: 14 }}>{design.name}</h2>
            <p style={{ fontSize: 11, color: '#64748b', minHeight: 56, marginTop: 0, marginBottom: 8 }}>
              {design.description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {ANGLES.map((angle) => (
                <PictogramExample key={angle} angle={angle} design={design} />
              ))}
            </div>

            <button
              onClick={() => setSelected(design.id)}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: selected === design.id ? '#16a34a' : '#3b82f6',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {selected === design.id ? `✓ ${design.id} choisi` : `Choisir ${design.id}`}
            </button>
          </div>
        ))}
      </div>

      {selected !== null && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#f0fdf4',
            border: '2px solid #16a34a',
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#15803d' }}>
            <strong>Tu as choisi le Design {selected}.</strong> Dis-le-moi en chat
            (&quot;Design {selected}&quot;) et j&apos;applique le tracé sur tous les Player.
          </p>
        </div>
      )}
    </div>
  );
}

function PictogramExample({ angle, design }: { angle: number; design: ArmDesign }) {
  const cx = 50;
  const cy = 50;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{angle}°</span>
      <svg
        width={100}
        height={100}
        viewBox="0 0 100 100"
        style={{ border: '1px solid #e2e8f0', borderRadius: 4, background: '#fafaf9' }}
      >
        <text x={cx} y={9} fontSize={7} fill="#94a3b8" textAnchor="middle">N (panier)</text>

        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <path
            d={design.leftPath(cx, cy)}
            fill="none"
            stroke="#042C53"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path
            d={design.rightPath(cx, cy)}
            fill="none"
            stroke="#042C53"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </g>

        <circle cx={cx} cy={cy} r={r} fill="#378ADD" stroke="#042C53" strokeWidth={2} />

        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <polygon
            points={`${cx},${cy - r - 5} ${cx - 4},${cy - r} ${cx + 4},${cy - r}`}
            fill="#dc2626"
          />
        </g>
      </svg>
    </div>
  );
}
