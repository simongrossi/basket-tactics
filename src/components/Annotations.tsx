import type { Annotation, Point } from '@/lib/types';
import { dribbleWavePath } from '@/lib/logic/dribbleWave';
import { polylinePath, samplePolyline } from '@/lib/logic/polyline';
import { PLAYER_RADIUS } from '@/lib/data/court';

interface AnnotationProps {
  annotation: Annotation;
  preview?: boolean;
}

/** Marge en plus du rayon joueur pour que la pointe de flèche reste lisible
 *  juste avant le cercle, sans toucher le badge. */
const ARROW_END_PADDING = PLAYER_RADIUS + 4;

/** Raccourcit `to` de `amount` px le long de la direction `from → to`, pour
 *  que la pointe de flèche s'affiche AVANT le cercle joueur cible (sinon le
 *  cercle masque la pointe puisqu'il est rendu par-dessus les annotations). */
function shrinkEnd(from: Point, to: Point, amount: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= amount) return { ...to };
  const k = (d - amount) / d;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

/** Comme `shrinkEnd` mais sur le dernier segment d'une polyline (pour les
 *  trajectoires courbes via waypoints). Préserve les autres points. */
function shrinkPolylineEnd(points: Point[], amount: number): Point[] {
  if (points.length < 2) return points;
  const out = points.slice(0, -1);
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  out.push(shrinkEnd(before, last, amount));
  return out;
}

function annotationPoints(ann: Annotation): Point[] {
  return ann.waypoints && ann.waypoints.length > 0
    ? [ann.from, ...ann.waypoints, ann.to]
    : [ann.from, ann.to];
}

export function AnnotationView({ annotation, preview }: AnnotationProps) {
  const { type, from, to } = annotation;
  const hasWaypoints = !!annotation.waypoints && annotation.waypoints.length > 0;

  // Cible visuelle de la pointe de flèche : raccourcie pour ne pas être
  // masquée par le cercle du joueur d'arrivée. Pas appliqué au screen (la
  // barre en T se positionne sur `to` réel).
  const visualTo = type === 'screen' ? to : shrinkEnd(from, to, ARROW_END_PADDING);
  const visualPoints = hasWaypoints
    ? shrinkPolylineEnd(annotationPoints(annotation), ARROW_END_PADDING)
    : null;

  if (type === 'screen') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const BAR_HALF = 12; // barre en T bien marquée
    const trail = hasWaypoints ? (
      <path
        d={polylinePath(annotationPoints(annotation))}
        fill="none"
        stroke="#F59E0B"
        strokeWidth={3}
        strokeLinecap="round"
        filter="url(#tactical-shadow)"
        opacity={preview ? 0.5 : 1}
      />
    ) : (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#F59E0B"
        strokeWidth={3}
        strokeLinecap="round"
        filter="url(#tactical-shadow)"
        opacity={preview ? 0.5 : 1}
      />
    );
    return (
      <g className="tactical-screen">
        {trail}
        {/* Barre en T d'impact d'écran avec contraste sombre de fond */}
        <line
          x1={to.x + nx * BAR_HALF}
          y1={to.y + ny * BAR_HALF}
          x2={to.x - nx * BAR_HALF}
          y2={to.y - ny * BAR_HALF}
          stroke="#78350F"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={preview ? 0.3 : 0.6}
        />
        <line
          x1={to.x + nx * BAR_HALF}
          y1={to.y + ny * BAR_HALF}
          x2={to.x - nx * BAR_HALF}
          y2={to.y - ny * BAR_HALF}
          stroke="#FBBF24"
          strokeWidth={4.5}
          strokeLinecap="round"
          opacity={preview ? 0.6 : 1}
        />
      </g>
    );
  }

  if (type === 'dribble') {
    // Avec waypoints : path lisse via Catmull-Rom (la wave standard ne s'applique
    // pas à une polyline, l'utilisateur a dessiné explicitement la trajectoire).
    const d = hasWaypoints && visualPoints
      ? polylinePath(visualPoints)
      : dribbleWavePath(from, visualTo);
    return (
      <g className="tactical-dribble">
        {/* Trait de contraste sous la trajectoire de dribble */}
        <path
          d={d}
          fill="none"
          stroke="#7C2D12"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={preview ? 0.25 : 0.5}
        />
        <path
          d={d}
          fill="none"
          stroke="#EA580C"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#arrow-orange)"
          filter="url(#tactical-shadow)"
          opacity={preview ? 0.6 : 1}
        />
        {(annotation.feintes ?? []).map((tF, fi) => {
          const pts = annotationPoints(annotation);
          const pos = samplePolyline(pts, tF);
          return (
            <circle
              key={`feinte-${fi}`}
              cx={pos.x}
              cy={pos.y}
              r={4}
              fill="#fbbf24"
              stroke="#92400e"
              strokeWidth={1.2}
              opacity={preview ? 0.5 : 0.95}
              pointerEvents="none"
            />
          );
        })}
      </g>
    );
  }

  if (type === 'pass') {
    return (
      <g className="tactical-pass">
        {/* Trait de contraste sombre sous les tirets pour lisibilité tout-terrain */}
        {hasWaypoints && visualPoints ? (
          <path
            d={polylinePath(visualPoints)}
            fill="none"
            stroke="#3B0D00"
            strokeWidth={5}
            strokeDasharray="8 5"
            strokeLinecap="round"
            opacity={preview ? 0.3 : 0.65}
          />
        ) : (
          <line
            x1={from.x}
            y1={from.y}
            x2={visualTo.x}
            y2={visualTo.y}
            stroke="#3B0D00"
            strokeWidth={5}
            strokeDasharray="8 5"
            strokeLinecap="round"
            opacity={preview ? 0.3 : 0.65}
          />
        )}
        {/* Ligne principale orange vif avec tirets nets et pointe contrastée */}
        {hasWaypoints && visualPoints ? (
          <path
            d={polylinePath(visualPoints)}
            fill="none"
            stroke="#FF5500"
            strokeWidth={3.2}
            strokeDasharray="8 5"
            strokeLinecap="round"
            markerEnd="url(#arrow-pass)"
            filter="url(#tactical-shadow)"
            opacity={preview ? 0.6 : 1}
          />
        ) : (
          <line
            x1={from.x}
            y1={from.y}
            x2={visualTo.x}
            y2={visualTo.y}
            stroke="#FF5500"
            strokeWidth={3.2}
            strokeDasharray="8 5"
            strokeLinecap="round"
            markerEnd="url(#arrow-pass)"
            filter="url(#tactical-shadow)"
            opacity={preview ? 0.6 : 1}
          />
        )}
      </g>
    );
  }

  // cut (et fallback) : course sans ballon
  const feinteMarkers = (annotation.feintes ?? []).map((tF, fi) => {
    const pts = annotationPoints(annotation);
    const pos = samplePolyline(pts, tF);
    return (
      <circle
        key={`feinte-${fi}`}
        cx={pos.x}
        cy={pos.y}
        r={4}
        fill="#fbbf24"
        stroke="#92400e"
        strokeWidth={1.2}
        opacity={preview ? 0.5 : 0.95}
        pointerEvents="none"
      />
    );
  });
  if (hasWaypoints && visualPoints) {
    return (
      <g className="tactical-cut">
        <path
          d={polylinePath(visualPoints)}
          fill="none"
          stroke="#78350F"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={preview ? 0.25 : 0.45}
        />
        <path
          d={polylinePath(visualPoints)}
          fill="none"
          stroke="#FBBF24"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#arrow-gray)"
          filter="url(#tactical-shadow)"
          opacity={preview ? 0.6 : 1}
        />
        {feinteMarkers}
      </g>
    );
  }
  return (
    <g className="tactical-cut">
      <line
        x1={from.x}
        y1={from.y}
        x2={visualTo.x}
        y2={visualTo.y}
        stroke="#78350F"
        strokeWidth={4.5}
        strokeLinecap="round"
        opacity={preview ? 0.25 : 0.45}
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={visualTo.x}
        y2={visualTo.y}
        stroke="#FBBF24"
        strokeWidth={2.8}
        strokeLinecap="round"
        markerEnd="url(#arrow-gray)"
        filter="url(#tactical-shadow)"
        opacity={preview ? 0.6 : 1}
      />
      {feinteMarkers}
    </g>
  );
}
