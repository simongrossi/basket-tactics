import type { Annotation, Point } from '@/lib/types';
import { dribbleWavePath } from '@/lib/logic/dribbleWave';
import { polylinePath } from '@/lib/logic/polyline';

interface AnnotationProps {
  annotation: Annotation;
  preview?: boolean;
}

function annotationPoints(ann: Annotation): Point[] {
  return ann.waypoints && ann.waypoints.length > 0
    ? [ann.from, ...ann.waypoints, ann.to]
    : [ann.from, ann.to];
}

export function AnnotationView({ annotation, preview }: AnnotationProps) {
  const { type, from, to } = annotation;
  const hasWaypoints = !!annotation.waypoints && annotation.waypoints.length > 0;

  if (type === 'screen') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const trail = hasWaypoints ? (
      <path
        d={polylinePath(annotationPoints(annotation))}
        fill="none"
        stroke="#5F5E5A"
        strokeWidth={2.5}
        opacity={preview ? 0.5 : 1}
      />
    ) : (
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#5F5E5A" strokeWidth={2.5} opacity={preview ? 0.5 : 1} />
    );
    return (
      <>
        {trail}
        <line
          x1={to.x + nx * 10}
          y1={to.y + ny * 10}
          x2={to.x - nx * 10}
          y2={to.y - ny * 10}
          stroke="#5F5E5A"
          strokeWidth={4}
          opacity={preview ? 0.5 : 1}
        />
      </>
    );
  }

  if (type === 'dribble') {
    // Avec waypoints : path lisse via Catmull-Rom (la wave standard ne s'applique
    // pas à une polyline, l'utilisateur a dessiné explicitement la trajectoire).
    const d = hasWaypoints
      ? polylinePath(annotationPoints(annotation))
      : dribbleWavePath(from, to);
    return (
      <path
        d={d}
        fill="none"
        stroke="#D85A30"
        strokeWidth={2.5}
        markerEnd="url(#arrow-orange)"
        opacity={preview ? 0.5 : 1}
      />
    );
  }

  if (type === 'pass') {
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#D85A30"
        strokeWidth={2.5}
        strokeDasharray="3 5"
        markerEnd="url(#arrow-orange)"
        opacity={preview ? 0.5 : 1}
      />
    );
  }

  // cut (et fallback)
  if (hasWaypoints) {
    return (
      <path
        d={polylinePath(annotationPoints(annotation))}
        fill="none"
        stroke="#5F5E5A"
        strokeWidth={2.5}
        markerEnd="url(#arrow-gray)"
        opacity={preview ? 0.5 : 1}
      />
    );
  }
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke="#5F5E5A"
      strokeWidth={2.5}
      markerEnd="url(#arrow-gray)"
      opacity={preview ? 0.5 : 1}
    />
  );
}
