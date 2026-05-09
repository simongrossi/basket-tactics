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
  /** Angle horaire du corps depuis le NORD (0–360°). Définit l'orientation
   *  des épaules : à 0° les épaules sont E-O (regard nord), à 90° elles
   *  sont N-S (regard est), etc. */
  orientation?: number;
  /** Convention B asymétrique : cibles géométriques des 2 mains. Si défini,
   *  remplace le tracé symétrique FIBA par 2 bras distincts pointant vers
   *  ces cibles (open stance, denial, etc.). Clampées à ±90° du body en
   *  amont (cf. orientation.ts), donc jamais "dans le dos". */
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
        {/* Convention B — bras asymétriques par rôle.
         *
         * - Le **corps** (orientation) définit la ligne d'épaule (perpendiculaire
         *   au regard). Les épaules sont à ±r*0.6 latéralement.
         * - Le bras **ball-side** part de l'épaule la plus proche de `armBallSide`
         *   et pointe vers cette cible.
         * - Le bras **man-side** part de l'autre épaule et pointe vers `armManSide`.
         * - La courbure de chaque bras bombe vers l'AVANT du joueur (forwardX,
         *   forwardY) — invariant anatomique : aucune courbure dans le dos.
         * - Les cibles sont déjà clampées au demi-cercle frontal en amont
         *   (cf. orientation.ts § INVARIANT #2), donc aucun bras ne pointe
         *   derrière le joueur ici.
         *
         * Si `armBallSide` ou `armManSide` ne sont pas fournis, fallback sur
         * deux arcs symétriques au-dessus (convention FIBA classique).
         */}
        {(() => {
          const bodyRad = (orientation * Math.PI) / 180;
          // Convention SVG y-down : à orientation=0° (nord), forward = +y négatif.
          const forwardX = Math.sin(bodyRad);
          const forwardY = -Math.cos(bodyRad);
          // Côté droit du joueur (perpendiculaire à forward, sens horaire).
          const rightX = -forwardY;
          const rightY = forwardX;
          // Épaules droite (D) et gauche (G) du joueur.
          const shoulderD = { x: pos.x + rightX * r * 0.6, y: pos.y + rightY * r * 0.6 };
          const shoulderG = { x: pos.x - rightX * r * 0.6, y: pos.y - rightY * r * 0.6 };

          // Si convention B fournie : 2 bras vers cibles distinctes.
          if (armBallSide && armManSide) {
            // Attribuer ball-side et man-side à l'épaule la plus proche.
            const dBallToD = Math.hypot(armBallSide.x - shoulderD.x, armBallSide.y - shoulderD.y);
            const dBallToG = Math.hypot(armBallSide.x - shoulderG.x, armBallSide.y - shoulderG.y);
            const ballOnRight = dBallToD <= dBallToG;
            const ballShoulder = ballOnRight ? shoulderD : shoulderG;
            const manShoulder = ballOnRight ? shoulderG : shoulderD;

            const drawArm = (shoulder: Point, target: Point) => {
              const dx = target.x - shoulder.x;
              const dy = target.y - shoulder.y;
              const dist = Math.hypot(dx, dy) || 1;
              const armLen = Math.min(r * 1.6, Math.max(r * 0.9, dist * 0.5));
              const ux = dx / dist;
              const uy = dy / dist;
              const hand = { x: shoulder.x + ux * armLen, y: shoulder.y + uy * armLen };
              // Control point : à mi-bras + offset vers l'avant pour la courbure.
              const midX = (shoulder.x + hand.x) / 2 + forwardX * r * 0.25;
              const midY = (shoulder.y + hand.y) / 2 + forwardY * r * 0.25;
              return `M ${shoulder.x} ${shoulder.y} Q ${midX} ${midY} ${hand.x} ${hand.y}`;
            };

            return (
              <>
                <path
                  d={drawArm(ballShoulder, armBallSide)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isAttacker ? 1.8 : 2.5}
                  strokeLinecap="round"
                  opacity={isAttacker ? 0.7 : 1}
                />
                <path
                  d={drawArm(manShoulder, armManSide)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isAttacker ? 1.8 : 2.5}
                  strokeLinecap="round"
                  opacity={isAttacker ? 0.7 : 1}
                />
              </>
            );
          }

          // Fallback : arcs FIBA symétriques au-dessus (orientation appliquée
          // comme rotation autour du centre).
          return (
            <g transform={`rotate(${orientation}, ${pos.x}, ${pos.y})`}>
              <path
                d={`M ${pos.x - r * 0.6} ${pos.y - r * 0.7} Q ${pos.x - r * 1.4} ${pos.y - r * 0.95} ${pos.x - r * 1.55} ${pos.y - r * 0.15}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isAttacker ? 1.8 : 2.5}
                strokeLinecap="round"
                opacity={isAttacker ? 0.7 : 1}
              />
              <path
                d={`M ${pos.x + r * 0.6} ${pos.y - r * 0.7} Q ${pos.x + r * 1.4} ${pos.y - r * 0.95} ${pos.x + r * 1.55} ${pos.y - r * 0.15}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isAttacker ? 1.8 : 2.5}
                strokeLinecap="round"
                opacity={isAttacker ? 0.7 : 1}
              />
            </g>
          );
        })()}
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
