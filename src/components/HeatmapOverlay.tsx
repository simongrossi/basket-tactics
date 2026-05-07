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

/** Seuil minimal d'"ouverture" pour rendre une cellule visible. Évite un
 *  voile uniforme sur tout le terrain quand la défense est partout. */
const OPENNESS_THRESHOLD = 0.35;

/**
 * Calque heatmap qui met en évidence les zones non-défendues. Plus une
 * zone est rouge, plus elle est ouverte (faible pression défensive). Les
 * zones bien défendues sont laissées transparentes (pas d'overlay = vue
 * propre du terrain).
 *
 * Algo :
 *   pression(P) = Σ_i max(0, R - distance(P, D_i)) / R   pour chaque défenseur
 *   ouverture(P) = max(0, 1 - pression(P) / NORM)
 *   on rend les cellules dont ouverture > seuil
 *
 * NORM = 1.5 → un défenseur très près donne ~1, deux défenseurs proches
 * saturent à 1 (rien d'ouvert). Une seule influence à mi-portée donne ~0.3
 * → ouverture ≈ 0.8 (bien visible).
 */
export function HeatmapOverlay({ defPos, off, fullCourt, show }: HeatmapOverlayProps) {
  if (!show) return null;

  const yMax = fullCourt ? FULL_COURT_HEIGHT - 20 : COURT.innerMaxY;
  const yMin = COURT.marginY;
  const xMin = COURT.marginX;
  const xMax = COURT.innerMaxX;

  const defenders = Object.values(defPos);
  const attackers = Object.values(off);
  if (defenders.length === 0) return null;

  const cells: { x: number; y: number; openness: number; isAttacker: boolean }[] = [];

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
      const openness = Math.max(0, 1 - pressure / 1.5);

      // Filtre : on n'affiche pas les cellules trop défendues
      if (openness < OPENNESS_THRESHOLD) continue;

      // Bonus visuel : si un attaquant est dans la cellule, on rehausse
      // l'opacité (zone "exploitable" puisqu'occupée par un offensif).
      let isAttacker = false;
      for (const a of attackers) {
        if (a.x >= x && a.x < x + CELL_SIZE && a.y >= y && a.y < y + CELL_SIZE) {
          isAttacker = true;
          break;
        }
      }

      cells.push({ x, y, openness, isAttacker });
    }
  }

  return (
    <g pointerEvents="none">
      {cells.map((c, i) => {
        // Mapping ouverture → couleur : jaune pâle (0.35) → orange (0.6) → rouge intense (1)
        const intensity = (c.openness - OPENNESS_THRESHOLD) / (1 - OPENNESS_THRESHOLD);
        // Couleur : interpolation jaune → orange → rouge
        const r = 220 + Math.round(intensity * 30); // 220 → 250
        const g = Math.round(180 - intensity * 130); // 180 → 50
        const b = Math.round(30 + intensity * 10); // ~30
        const opacity = (0.15 + intensity * 0.35) * (c.isAttacker ? 1.4 : 1);
        return (
          <rect
            key={i}
            x={c.x}
            y={c.y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={`rgb(${r}, ${g}, ${b})`}
            opacity={Math.min(0.65, opacity)}
            // Léger flou pour fondre les cellules entre elles
            style={{ filter: 'blur(6px)' }}
          />
        );
      })}
    </g>
  );
}
