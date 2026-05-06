import type { Point } from '@/lib/types';
import { PLAYER_RADIUS } from '@/lib/data/court';

interface PlayerProps {
  id: string;
  pos: Point;
  isAttacker: boolean;
  isCarrierDefender?: boolean;
  isLate?: boolean;
  onScreen?: boolean;
  helpFactor?: number;
}

export function Player({
  id,
  pos,
  isAttacker,
  isCarrierDefender,
  isLate,
  onScreen,
  helpFactor,
}: PlayerProps) {
  const fill = isAttacker ? '#D85A30' : '#378ADD';

  let stroke = isAttacker ? '#4A1B0C' : '#042C53';
  let strokeWidth = 2;
  if (!isAttacker) {
    if (isLate) {
      stroke = '#E24B4A';
      strokeWidth = 4;
    } else if (isCarrierDefender) {
      stroke = '#FAC775';
      strokeWidth = 3;
    } else if (onScreen) {
      stroke = '#534AB7';
      strokeWidth = 3;
    }
  }

  const showHelpRing = !isAttacker && !isCarrierDefender && helpFactor && helpFactor > 0.05;

  const r = PLAYER_RADIUS;

  return (
    <g data-id={id} style={{ cursor: 'grab' }}>
      {!isAttacker && (
        <g pointerEvents="none">
          <path
            d={`M ${pos.x - r * 0.6} ${pos.y - r * 0.7} Q ${pos.x - r * 1.4} ${pos.y - r * 0.95} ${pos.x - r * 1.55} ${pos.y - r * 0.15}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <path
            d={`M ${pos.x + r * 0.6} ${pos.y - r * 0.7} Q ${pos.x + r * 1.4} ${pos.y - r * 0.95} ${pos.x + r * 1.55} ${pos.y - r * 0.15}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
      )}
      <circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <text
        x={pos.x}
        y={pos.y + 5}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={13}
        fontWeight={500}
        pointerEvents="none"
      >
        {id}
      </text>
      {showHelpRing && (
        <circle
          cx={pos.x}
          cy={pos.y}
          r={22 + helpFactor! * 4}
          fill="none"
          stroke="#534AB7"
          strokeWidth={1.5}
          opacity={0.4 + helpFactor! * 0.5}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

interface BallProps {
  carrierPos: Point | undefined;
}

export function Ball({ carrierPos }: BallProps) {
  if (!carrierPos) return null;
  return (
    <circle
      cx={carrierPos.x + 16}
      cy={carrierPos.y - 16}
      r={7}
      fill="#BA7517"
      stroke="#412402"
      strokeWidth={2}
      pointerEvents="none"
    />
  );
}
