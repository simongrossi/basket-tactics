import type { Annotation } from '@/lib/types';
import { dribbleWavePath } from '@/lib/logic/dribbleWave';

interface AnnotationProps {
  annotation: Annotation;
  preview?: boolean;
}

export function AnnotationView({ annotation, preview }: AnnotationProps) {
  const { type, from, to } = annotation;

  if (type === 'screen') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return (
      <>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#5F5E5A" strokeWidth={2.5} opacity={preview ? 0.5 : 1} />
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
    return (
      <path
        d={dribbleWavePath(from, to)}
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
