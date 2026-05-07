'use client';

import type { ComputedDefense, AttackerPositions } from '@/lib/types';
import { COURT, FULL_COURT_HEIGHT } from '@/lib/data/court';

interface HeatmapOverlayProps {
  defPos: ComputedDefense;
  off: AttackerPositions;
  fullCourt: boolean;
  show: boolean;
}

/** Rayon d'influence d'un défenseur. Au-delà, sa contribution à la pression
 *  défensive d'un point est nulle. ~équivalent à un closeout réaliste. */
const INFLUENCE_RADIUS = 110;

/** Pas de la grille de discrétisation. Plus petit = précision finie mais
 *  plus de cellules à rendre. 30px est un bon compromis lisible/perf. */
const CELL_SIZE = 30;

/** Pression au-delà de laquelle on sature en rouge (bien défendu). Valeurs
 *  pratiques : ≈0.7 = défenseur proche → presque rouge. */
const PRESSURE_NORM = 1.2;

/**
 * Calque heatmap "feu tricolore" : couleurs traffic-light pastel pour
 * différencier instantanément les zones libres / contestables / défendues.
 *
 *   pression faible  → vert pastel  (zone libre, opportunité de tir/passe)
 *   pression moyenne → jaune pastel (zone contestable)
 *   pression haute   → rouge pastel (zone bien défendue)
 *
 * Algo :
 *   pression(P) = Σ_i max(0, R - distance(P, D_i)) / R   pour chaque défenseur
 *   t = clamp(pression / PRESSURE_NORM, 0, 1)
 *   teinte HSL = 120° (vert) à t=0 → 60° (jaune) à t=0.5 → 0° (rouge) à t=1
 *
 * Couleurs pastel (saturation 60%, lightness 65%) + opacité 0.22-0.32 pour
 * ne pas masquer le terrain.
 */
export function HeatmapOverlay({ defPos, off: _off, fullCourt, show }: HeatmapOverlayProps) {
  if (!show) return null;

  const yMax = fullCourt ? FULL_COURT_HEIGHT - 20 : COURT.innerMaxY;
  const yMin = COURT.marginY;
  const xMin = COURT.marginX;
  const xMax = COURT.innerMaxX;

  const defenders = Object.values(defPos);
  if (defenders.length === 0) return null;

  const cells: { x: number; y: number; t: number }[] = [];

  for (let y = yMin; y < yMax; y += CELL_SIZE) {
    for (let x = xMin; x < xMax; x += CELL_SIZE) {
      const cx = x + CELL_SIZE / 2;
      const cy = y + CELL_SIZE / 2;

      let pressure = 0;
      for (const d of defenders) {
        const dx = d.x - cx;
        const dy = d.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < INFLUENCE_RADIUS) {
          pressure += (INFLUENCE_RADIUS - dist) / INFLUENCE_RADIUS;
        }
      }
      // t ∈ [0, 1] : 0 = totalement libre, 1 = saturé en pression
      const t = Math.min(1, pressure / PRESSURE_NORM);
      cells.push({ x, y, t });
    }
  }

  return (
    <g pointerEvents="none">
      {cells.map((c, i) => {
        // Hue : 120° (vert) à 0° (rouge) en passant par 60° (jaune)
        const hue = Math.round((1 - c.t) * 120);
        // Saturation/lightness moyennes : assez vives pour être lisibles
        // par-dessus le terrain ocre, sans pour autant tuer les contrastes
        // des joueurs/lignes.
        const fill = `hsl(${hue}, 78%, 50%)`;
        // Opacité plus marquée aux extrémités (vert franc / rouge franc),
        // un peu moins sur le jaune intermédiaire.
        const opacity = 0.4 + Math.abs(c.t - 0.5) * 0.25;
        return (
          <rect
            key={i}
            x={c.x}
            y={c.y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={fill}
            opacity={opacity}
            style={{ filter: 'blur(8px)' }}
          />
        );
      })}
    </g>
  );
}
