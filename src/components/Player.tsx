import type { Point, DefenderStance } from '@/lib/types';
import { PLAYER_RADIUS } from '@/lib/data/court';

interface PlayerProps {
  id: string;
  pos: Point;
  isAttacker: boolean;
  isCarrierDefender?: boolean;
  isLate?: boolean;
  onScreen?: boolean;
  helpFactor?: number;
  facing?: Point;
  isOverridden?: boolean;
  closingOut?: boolean;
  overClosed?: boolean;
  isForcedScreener?: boolean;
  denying?: boolean;
  /** Orientation des bras du défenseur. Default 'square' (symétrique). */
  stance?: DefenderStance;
  /** Master switch pour les anneaux d'état (carrier, late, closeout, denial, helpRing).
   *  Default true. Quand false, le défenseur garde son contour standard. */
  showStateRings?: boolean;
  /** Master switch pour les badges cadenas (override drag + forcedScreener). Default true. */
  showLockBadges?: boolean;
}

export function Player({
  id,
  pos,
  isAttacker,
  isCarrierDefender,
  isLate,
  onScreen,
  helpFactor,
  facing,
  isOverridden,
  closingOut,
  overClosed,
  isForcedScreener,
  denying,
  stance = 'square',
  showStateRings = true,
  showLockBadges = true,
}: PlayerProps) {
  const fill = isAttacker ? '#D85A30' : '#378ADD';

  let stroke = isAttacker ? '#4A1B0C' : '#042C53';
  let strokeWidth = 2;
  if (!isAttacker && showStateRings) {
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

  const showHelpRing = showStateRings && !isAttacker && !isCarrierDefender && helpFactor && helpFactor > 0.05;

  const r = PLAYER_RADIUS;

  return (
    <g data-id={id} style={{ cursor: 'grab' }}>
      {!isAttacker && (() => {
        // Bras asymétriques selon le stance. 'square' (default) = symétrique
        // (convention FIBA). 'force-left' = bras DROIT extended/raised pour
        // fermer le côté droit (pousse le porteur à gauche). 'force-right'
        // = mirror. 'force-weak' = comme force-left (droitier supposé).
        // Pour chaque bras : (innerRatio, outerWidth, outerHeight) où
        // - innerRatio = position du coude (Q de la bezier)
        // - outerWidth = jusqu'où va la main (en r)
        // - outerHeight = hauteur de la main (-r*0.5 = haute, +r*0.05 = basse)
        type ArmShape = { coudeX: number; coudeY: number; tipX: number; tipY: number };
        const wide: ArmShape = { coudeX: 1.55, coudeY: -0.95, tipX: 1.95, tipY: -0.5 };
        const normal: ArmShape = { coudeX: 1.4, coudeY: -0.95, tipX: 1.55, tipY: -0.15 };
        const tucked: ArmShape = { coudeX: 0.95, coudeY: -0.5, tipX: 0.95, tipY: 0.05 };
        const forceLeft = stance === 'force-left' || stance === 'force-weak';
        const forceRight = stance === 'force-right';
        const leftArm: ArmShape = forceLeft ? tucked : forceRight ? wide : normal;
        const rightArm: ArmShape = forceLeft ? wide : forceRight ? tucked : normal;
        return (
          <g pointerEvents="none">
            <path
              d={`M ${pos.x - r * 0.6} ${pos.y - r * 0.7} Q ${pos.x - r * leftArm.coudeX} ${pos.y + r * leftArm.coudeY} ${pos.x - r * leftArm.tipX} ${pos.y + r * leftArm.tipY}`}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <path
              d={`M ${pos.x + r * 0.6} ${pos.y - r * 0.7} Q ${pos.x + r * rightArm.coudeX} ${pos.y + r * rightArm.coudeY} ${pos.x + r * rightArm.tipX} ${pos.y + r * rightArm.tipY}`}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          {facing && (() => {
            // Petit pointeur de "facing" : un triangle posé sur le bord du
            // cercle, du côté de l'homme défendu. Indique l'orientation
            // sans toucher aux bras.
            const dx = facing.x - pos.x;
            const dy = facing.y - pos.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const tip = { x: pos.x + ux * (r + 6), y: pos.y + uy * (r + 6) };
            const base = { x: pos.x + ux * r, y: pos.y + uy * r };
            const px = -uy * 4;
            const py = ux * 4;
            return (
              <polygon
                points={`${tip.x},${tip.y} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`}
                fill={stroke}
                opacity={0.9}
              />
            );
          })()}
          </g>
        );
      })()}
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
          stroke={denying ? '#0EA5A8' : '#534AB7'}
          strokeWidth={1.5}
          strokeDasharray={denying ? '4 3' : undefined}
          opacity={0.4 + helpFactor! * 0.5}
          pointerEvents="none"
        />
      )}
      {closingOut && !isAttacker && showStateRings && (
        <g pointerEvents="none">
          {/* Anneau orange (closeout normal) ou rouge (over-closeout, déborde). */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 5}
            fill="none"
            stroke={overClosed ? '#DC2626' : '#F97316'}
            strokeWidth={2.5}
            opacity={0.85}
          />
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 9}
            fill="none"
            stroke={overClosed ? '#DC2626' : '#F97316'}
            strokeWidth={1}
            opacity={0.4}
          />
          {overClosed && (
            <text
              x={pos.x + r + 14}
              y={pos.y - r - 4}
              fontSize={9}
              fontWeight={700}
              fill="#DC2626"
            >
              ⚠
            </text>
          )}
        </g>
      )}
      {isOverridden && !isAttacker && showLockBadges && (
        <g pointerEvents="none">
          <circle
            cx={pos.x + r * 0.85}
            cy={pos.y - r * 0.85}
            r={5}
            fill="#fbbf24"
            stroke="#92400e"
            strokeWidth={1.2}
          />
          <text
            x={pos.x + r * 0.85}
            y={pos.y - r * 0.85 + 2.5}
            textAnchor="middle"
            fill="#92400e"
            fontSize={7}
            fontWeight={700}
          >
            ✋
          </text>
        </g>
      )}
      {isForcedScreener && isAttacker && showLockBadges && (
        <g pointerEvents="none">
          <circle
            cx={pos.x + r * 0.85}
            cy={pos.y - r * 0.85}
            r={5}
            fill="#a78bfa"
            stroke="#5b21b6"
            strokeWidth={1.2}
          />
          <text
            x={pos.x + r * 0.85}
            y={pos.y - r * 0.85 + 2.5}
            textAnchor="middle"
            fill="#5b21b6"
            fontSize={7}
            fontWeight={700}
          >
            🔒
          </text>
        </g>
      )}
    </g>
  );
}

interface BallProps {
  /** Position du ballon (déjà calculée — incluant offset main ou trajectoire en l'air) */
  pos?: Point;
  /** Pour rétrocompat : position du porteur, on applique l'offset main ici. Ignoré si `pos` est fourni. */
  carrierPos?: Point;
  /** True quand le ballon est en l'air (passe en cours). Visuel renforcé. */
  inFlight?: boolean;
}

export function Ball({ pos, carrierPos, inFlight }: BallProps) {
  const p = pos ?? (carrierPos ? { x: carrierPos.x + 16, y: carrierPos.y - 16 } : undefined);
  if (!p) return null;
  return (
    <g pointerEvents="none">
      {inFlight && (
        // Ombre projetée sous la parabole pour donner une impression de hauteur
        <ellipse
          cx={p.x}
          cy={p.y + 14}
          rx={6}
          ry={1.5}
          fill="rgba(0,0,0,0.25)"
        />
      )}
      <circle
        cx={p.x}
        cy={p.y}
        r={inFlight ? 8 : 7}
        fill="#BA7517"
        stroke={inFlight ? '#fff' : '#412402'}
        strokeWidth={inFlight ? 2.5 : 2}
      />
    </g>
  );
}
