import type { Annotation } from '@/lib/types';

function dribblePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amplitude = 5;
  const wavelength = 14;
  const segs = Math.max(4, Math.round(len / wavelength));
  let d = `M ${from.x} ${from.y}`;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const sign = i % 2 === 0 ? 1 : -1;
    const px = from.x + dx * t + nx * amplitude * sign;
    const py = from.y + dy * t + ny * amplitude * sign;
    d += ` L ${px} ${py}`;
  }
  d += ` L ${to.x} ${to.y}`;
  return d;
}

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
        d={dribblePath(from, to)}
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
