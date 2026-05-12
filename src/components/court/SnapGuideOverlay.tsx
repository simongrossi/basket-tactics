// Feedback visuel pendant le snap-to-grid (#2). Affiche la ligne ou le
// point cible sur lequel le drag est en train de s'aimanter. Cyan
// pointillé sur ligne, point cyan plein sur les blocs bas. Rendu en
// SVG juste sous les sprites.

import type { Point } from '@/lib/types';
import {
  COURT_CENTERLINE_X,
  FT_LINE_Y,
  HOOP,
  HOOP_OPPOSITE,
  PAINT,
  THREE_POINT_RADIUS,
} from '@/lib/data/court';
import type { SnapTarget } from '@/lib/logic/snapToGrid';

interface SnapGuideOverlayProps {
  target: SnapTarget | null;
  /** Direction d'attaque depuis l'AppState. `undefined` = `'up'` (default). */
  attackingDirection?: 'up' | 'down';
  /** Hauteur effective du terrain (court ou full court). */
  courtHeight: number;
}

const COLOR = '#06b6d4'; // cyan-500

export function SnapGuideOverlay({ target, attackingDirection, courtHeight }: SnapGuideOverlayProps) {
  if (!target) return null;
  const hoop: Point = attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;

  switch (target) {
    case 'midline':
      return (
        <line
          x1={COURT_CENTERLINE_X}
          y1={0}
          x2={COURT_CENTERLINE_X}
          y2={courtHeight}
          stroke={COLOR}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.85}
          pointerEvents="none"
        />
      );
    case 'paint-left':
      return <VLine x={PAINT.x1} />;
    case 'paint-right':
      return <VLine x={PAINT.x2} />;
    case 'paint-top':
      return <HLine y={attackingDirection === 'down' ? courtHeight - PAINT.y1 : PAINT.y1} />;
    case 'paint-bottom':
      return <HLine y={attackingDirection === 'down' ? courtHeight - PAINT.y2 : PAINT.y2} />;
    case 'free-throw':
      return <HLine y={attackingDirection === 'down' ? courtHeight - FT_LINE_Y : FT_LINE_Y} />;
    case 'three-point-arc':
      return (
        <circle
          cx={hoop.x}
          cy={hoop.y}
          r={THREE_POINT_RADIUS}
          fill="none"
          stroke={COLOR}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.85}
          pointerEvents="none"
        />
      );
    case 'block-left':
      return <Dot pt={{ x: hoop.x - 70, y: hoop.y + (attackingDirection === 'down' ? -80 : 80) }} />;
    case 'block-right':
      return <Dot pt={{ x: hoop.x + 70, y: hoop.y + (attackingDirection === 'down' ? -80 : 80) }} />;
  }
}

function VLine({ x }: { x: number }) {
  return (
    <line
      x1={x}
      y1={0}
      x2={x}
      y2={9999}
      stroke={COLOR}
      strokeWidth={2}
      strokeDasharray="6 4"
      opacity={0.85}
      pointerEvents="none"
    />
  );
}

function HLine({ y }: { y: number }) {
  return (
    <line
      x1={0}
      y1={y}
      x2={9999}
      y2={y}
      stroke={COLOR}
      strokeWidth={2}
      strokeDasharray="6 4"
      opacity={0.85}
      pointerEvents="none"
    />
  );
}

function Dot({ pt }: { pt: Point }) {
  return (
    <g pointerEvents="none">
      <circle cx={pt.x} cy={pt.y} r={8} fill={COLOR} opacity={0.5} />
      <circle cx={pt.x} cy={pt.y} r={3} fill={COLOR} />
    </g>
  );
}
