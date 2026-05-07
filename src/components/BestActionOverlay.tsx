import type { AttackerId, AttackerPositions } from '@/lib/types';
import type { OffensiveAction } from '@/lib/logic/offense';

interface BestActionOverlayProps {
  off: AttackerPositions;
  carrier: AttackerId;
  best: OffensiveAction;
  show: boolean;
}

const GOLD = '#fbbf24';
const GOLD_DARK = '#b45309';

/**
 * Surligne la meilleure option offensive calculée par
 * `evaluateOffensiveOptions` (Phase B). Trois affichages selon le type :
 *   - shoot : couronne dorée pleine sur le porteur (le tir direct)
 *   - drive : flèche dorée du porteur vers la position de tir projetée
 *   - pass-shoot : flèche dorée du porteur vers le receveur, puis ring sur lui
 *
 * Inclut un label compact "EV X.XX pts" près de la position cible.
 */
export function BestActionOverlay({ off, carrier, best, show }: BestActionOverlayProps) {
  if (!show) return null;
  const carrierPos = off[carrier];
  const ev = best.expectedPoints.toFixed(2);

  if (best.type === 'shoot') {
    return (
      <g pointerEvents="none">
        <circle
          cx={carrierPos.x}
          cy={carrierPos.y}
          r={34}
          fill="none"
          stroke={GOLD}
          strokeWidth={3}
          strokeOpacity={0.9}
        />
        <ActionLabel
          x={carrierPos.x + 30}
          y={carrierPos.y - 28}
          text={`Tir · ${ev} pts`}
        />
      </g>
    );
  }

  if (best.type === 'drive') {
    return (
      <g pointerEvents="none">
        <ArrowSegment
          from={carrierPos}
          to={best.shotPos}
          color={GOLD}
        />
        <circle
          cx={best.shotPos.x}
          cy={best.shotPos.y}
          r={14}
          fill={GOLD}
          fillOpacity={0.25}
          stroke={GOLD}
          strokeWidth={2}
        />
        <ActionLabel
          x={best.shotPos.x + 18}
          y={best.shotPos.y - 12}
          text={`Drive · ${ev} pts`}
        />
      </g>
    );
  }

  // pass-shoot
  const receiverPos = best.shotPos;
  return (
    <g pointerEvents="none">
      <ArrowSegment
        from={carrierPos}
        to={receiverPos}
        color={GOLD}
      />
      <circle
        cx={receiverPos.x}
        cy={receiverPos.y}
        r={32}
        fill="none"
        stroke={GOLD}
        strokeWidth={2.5}
        strokeOpacity={0.85}
        strokeDasharray="6 3"
      />
      <ActionLabel
        x={receiverPos.x + 22}
        y={receiverPos.y + 22}
        text={`Passe ${best.targetId} · ${ev} pts`}
      />
    </g>
  );
}

function ArrowSegment({
  from,
  to,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Raccourcir pour ne pas chevaucher les anneaux des joueurs
  const startOff = 28;
  const endOff = 28;
  const sx = from.x + ux * startOff;
  const sy = from.y + uy * startOff;
  const ex = to.x - ux * endOff;
  const ey = to.y - uy * endOff;
  // Tête de flèche
  const headLen = 10;
  const headWidth = 6;
  const px = -uy * headWidth;
  const py = ux * headWidth;
  const tipX = ex;
  const tipY = ey;
  const baseX = ex - ux * headLen;
  const baseY = ey - uy * headLen;
  return (
    <>
      <line
        x1={sx}
        y1={sy}
        x2={baseX}
        y2={baseY}
        stroke={color}
        strokeWidth={3.5}
        strokeOpacity={0.85}
      />
      <polygon
        points={`${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`}
        fill={color}
        fillOpacity={0.9}
      />
    </>
  );
}

function ActionLabel({ x, y, text }: { x: number; y: number; text: string }) {
  // Largeur estimée 7px par caractère
  const w = text.length * 6.2 + 8;
  return (
    <g>
      <rect
        x={x}
        y={y - 8}
        width={w}
        height={14}
        rx={3}
        fill={GOLD}
        fillOpacity={0.95}
        stroke={GOLD_DARK}
        strokeWidth={0.8}
      />
      <text
        x={x + w / 2}
        y={y + 2}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={GOLD_DARK}
      >
        {text}
      </text>
    </g>
  );
}
