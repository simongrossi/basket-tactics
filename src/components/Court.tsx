import { COURT, HOOP, PAINT, FULL_COURT_HEIGHT, MIDLINE_Y } from '@/lib/data/court';

interface CourtBackgroundProps {
  fullCourt?: boolean;
}

function HalfCourt() {
  return (
    <>
      <rect x={200} y={20} width={200} height={190} fill="none" stroke="#FFFFFF" strokeWidth={3} />
      <rect
        x={PAINT.x1}
        y={PAINT.y1}
        width={PAINT.x2 - PAINT.x1}
        height={PAINT.y2 - PAINT.y1}
        fill="#C97A3A"
        stroke="#FFFFFF"
        strokeWidth={3}
      />
      <circle cx={300} cy={210} r={60} fill="none" stroke="#FFFFFF" strokeWidth={3} strokeDasharray="6 6" />
      <path
        d="M 80 20 L 80 160 A 220 220 0 0 0 520 160 L 520 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3}
      />
      <line x1={20} y1={160} x2={80} y2={160} stroke="#FFFFFF" strokeWidth={3} />
      <line x1={520} y1={160} x2={580} y2={160} stroke="#FFFFFF" strokeWidth={3} />
      <rect x={280} y={55} width={40} height={3} fill="#FFFFFF" />
      <circle cx={HOOP.x} cy={HOOP.y} r={9} fill="none" stroke="#E24B4A" strokeWidth={2.5} />
    </>
  );
}

export function CourtBackground({ fullCourt = false }: CourtBackgroundProps) {
  const totalHeight = fullCourt ? FULL_COURT_HEIGHT : COURT.height;
  const totalInner = fullCourt ? FULL_COURT_HEIGHT - 40 : 520;
  return (
    <>
      <rect x={0} y={0} width={COURT.width} height={totalHeight} fill="#E8C99B" />
      <rect
        x={20}
        y={20}
        width={560}
        height={totalInner}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3}
      />
      <HalfCourt />
      {fullCourt ? (
        <>
          <g transform={`translate(0 ${2 * MIDLINE_Y}) scale(1 -1)`}>
            <HalfCourt />
          </g>
          <line x1={20} y1={MIDLINE_Y} x2={580} y2={MIDLINE_Y} stroke="#FFFFFF" strokeWidth={3} />
          <circle cx={300} cy={MIDLINE_Y} r={60} fill="none" stroke="#FFFFFF" strokeWidth={3} />
        </>
      ) : (
        <>
          <line x1={20} y1={540} x2={580} y2={540} stroke="#FFFFFF" strokeWidth={3} />
          <circle cx={300} cy={540} r={60} fill="none" stroke="#FFFFFF" strokeWidth={3} />
        </>
      )}
    </>
  );
}

export function ArrowMarkers() {
  return (
    <defs>
      <marker
        id="arrow-orange"
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={6}
        markerHeight={6}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#D85A30" />
      </marker>
      <marker
        id="arrow-gray"
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={6}
        markerHeight={6}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#5F5E5A" />
      </marker>
    </defs>
  );
}
