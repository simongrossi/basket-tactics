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
  facing?: Point;
  isOverridden?: boolean;
  closingOut?: boolean;
  overClosed?: boolean;
  isForcedScreener?: boolean;
  denying?: boolean;
  /** Angle horaire du corps depuis le NORD (0–360°) — calculé en open stance
   *  par convention B. Stocké pour usage futur (overlay debug, slider manuel)
   *  mais non rendu directement sur les bras. */
  orientation?: number;
  /** Angle horaire du REGARD depuis le NORD. Pilote la rotation des bras :
   *  les bras s'ouvrent dans la direction où le joueur regarde, partant des
   *  épaules vers l'avant. Toujours clampé à ±90° du body (orientation.ts),
   *  donc jamais derrière la tête. */
  gazeOrientation?: number;
  /** Convention B asymétrique : cibles géométriques des 2 mains. Stockées
   *  dans le data model pour usage futur (overlay debug). Pas rendues. */
  armBallSide?: Point;
  armManSide?: Point;
  /** Master switch pour les anneaux d'état (carrier, late, closeout, denial, helpRing).
   *  Default true. Quand false, le défenseur garde son contour standard. */
  showStateRings?: boolean;
  /** Master switch pour les badges cadenas (override drag + forcedScreener). Default true. */
  showLockBadges?: boolean;
  /** Sous-toggles fine — combinés en ET avec leur master. Default true partout. */
  showLateRing?: boolean;
  showCloseoutRing?: boolean;
  showDenyingRing?: boolean;
  showForcedScreenerBadge?: boolean;
  /** Rôle PnR (P1) — affiche un anneau distinct selon la rotation. */
  pnrRole?: 'tag' | 'x-out' | 'stunt';
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
  orientation = 0,
  gazeOrientation,
  armBallSide,
  armManSide,
  showStateRings = true,
  showLockBadges = true,
  showLateRing = true,
  showCloseoutRing = true,
  showDenyingRing = true,
  showForcedScreenerBadge = true,
  pnrRole,
}: PlayerProps) {
  const fill = isAttacker ? '#D85A30' : '#378ADD';

  let stroke = isAttacker ? '#4A1B0C' : '#042C53';
  let strokeWidth = 2;
  if (!isAttacker && showStateRings) {
    if (isLate && showLateRing) {
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
      <g pointerEvents="none">
        {/* Pictogramme stylisé FIBA : 2 arcs symétriques courbés.
         *
         * Les arcs sont dessinés "au-dessus" en posture neutre (à
         * gazeOrientation=0°), puis le wrapper rotate les amène dans la
         * direction du REGARD du joueur. Conséquence visuelle :
         *  - regard nord → bras au-dessus, courbure vers le nord (= devant)
         *  - regard est → bras à droite, courbure vers l'est (= devant)
         *  - regard sud → bras en bas, courbure vers le sud (= devant)
         *
         * Les bras s'ouvrent toujours DANS LA DIRECTION du regard (= vers
         * l'avant), partant des épaules. Le `gazeOrientation` est clampé
         * ±90° du `bodyOrientation` en amont (orientation.ts), donc les
         * bras ne peuvent JAMAIS pointer dans le dos du joueur.
         *
         * Si `gazeOrientation` n'est pas fourni (legacy), fallback sur
         * `orientation` (rétrocompat ancien API). */}
        <g transform={`rotate(${gazeOrientation ?? orientation ?? 0}, ${pos.x}, ${pos.y})`}>
          {/* Tracé conçu en posture neutre (regard "devant" = haut, gaze=0°) :
           *  - Départ (épaule) : bas-côté du cercle (= dos du joueur).
           *  - Fin (main) : à ±60° du regard, soit aux LIMITES du cône de
           *    champ de vision (120° d'ouverture). Distance ~1.5r.
           *  - Courbure : bombe doucement vers l'extérieur, alignée avec la
           *    courbure du cône de vision.
           *
           * Conséquence : les bras enveloppent visuellement le cône — la
           * "courbure des bras" coïncide avec les bords du champ de vision,
           * matérialisant que le joueur "voit" tout ce qui est entre ses bras.
           */}
          <path
            d={`M ${pos.x - r * 0.5} ${pos.y + r * 0.3} Q ${pos.x - r * 0.9} ${pos.y - r * 0.3} ${pos.x - r * 1.3} ${pos.y - r * 0.75}`}
            fill="none"
            stroke={stroke}
            strokeWidth={isAttacker ? 1.8 : 2.5}
            strokeLinecap="round"
            opacity={isAttacker ? 0.7 : 1}
          />
          <path
            d={`M ${pos.x + r * 0.5} ${pos.y + r * 0.3} Q ${pos.x + r * 0.9} ${pos.y - r * 0.3} ${pos.x + r * 1.3} ${pos.y - r * 0.75}`}
            fill="none"
            stroke={stroke}
            strokeWidth={isAttacker ? 1.8 : 2.5}
            strokeLinecap="round"
            opacity={isAttacker ? 0.7 : 1}
          />
        </g>
        {facing && (() => {
          // Pointeur de "facing" : un petit triangle posé sur le bord du
          // cercle, dans la direction regardée. Indique l'orientation
          // sans toucher aux bras (ex. on-ball regarde le porteur, off-ball
          // sag = midpoint man-ballon, fronting = ballon).
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
              opacity={isAttacker ? 0.7 : 0.9}
            />
          );
        })()}
      </g>
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
      {showHelpRing && (denying ? showDenyingRing : true) && (
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
      {pnrRole && !isAttacker && showStateRings && (
        <g pointerEvents="none">
          {/* Anneau PnR : tag = doré pointillé, x-out = magenta, stunt = bleu pâle. */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 6}
            fill="none"
            stroke={pnrRole === 'tag' ? '#F59E0B' : pnrRole === 'x-out' ? '#A855F7' : '#60A5FA'}
            strokeWidth={2.2}
            strokeDasharray={pnrRole === 'tag' ? '4 3' : undefined}
            opacity={0.85}
          />
          <text
            x={pos.x - r - 4}
            y={pos.y - r - 4}
            fontSize={8}
            fontWeight={700}
            fill={pnrRole === 'tag' ? '#92400e' : pnrRole === 'x-out' ? '#6B21A8' : '#1E3A8A'}
            textAnchor="end"
          >
            {pnrRole === 'tag' ? 'TAG' : pnrRole === 'x-out' ? 'X' : 'STUNT'}
          </text>
        </g>
      )}
      {closingOut && !isAttacker && showStateRings && showCloseoutRing && (
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
      {isForcedScreener && isAttacker && showLockBadges && showForcedScreenerBadge && (
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
