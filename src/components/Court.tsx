import {
  COURT,
  HOOP,
  HOOP_OPPOSITE,
  HOOP_RADIUS,
  PAINT,
  FT_LINE_Y,
  FT_CIRCLE_RADIUS,
  THREE_POINT_RADIUS,
  CORNER_3PT_X_LEFT,
  CORNER_3PT_X_RIGHT,
  CORNER_3PT_Y,
  RESTRICTED_AREA_RADIUS,
  CENTER_CIRCLE_RADIUS,
  BACKBOARD_Y,
  BACKBOARD_HALF_WIDTH,
  FULL_COURT_HEIGHT,
  MIDLINE_Y,
} from '@/lib/data/court';

interface CourtBackgroundProps {
  fullCourt?: boolean;
  /** Sens d'attaque. Quand 'down' et fullCourt, un indicateur visuel
   *  (anneau orange + label "🎯 visé") est posé autour du panier visé,
   *  et un indicateur bleu sobre autour du panier protégé. Sans effet
   *  en demi-terrain (le panier est toujours en haut). */
  attackingDirection?: 'up' | 'down';
}

const LINE_COLOR = '#FFFFFF';
const LINE_WIDTH = 3;

/**
 * Demi-terrain FIBA. Tout est dessiné depuis la baseline (y=20) du côté
 * du panier en haut. Les fonctions de symétrie pour le terrain complet
 * miroitent ce demi-terrain autour de y = MIDLINE_Y.
 */
function HalfCourt() {
  const cx = 300;
  const baseY = 20; // ligne de fond

  return (
    <>
      {/* Raquette (paint) */}
      <rect
        x={PAINT.x1}
        y={PAINT.y1}
        width={PAINT.x2 - PAINT.x1}
        height={PAINT.y2 - PAINT.y1}
        fill="#7a5538"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* Cercle des lancers francs (demi-cercle plein côté FT, pointillé côté
          panier — convention FIBA). On dessine un cercle complet dashed pour
          simplicité. */}
      <circle
        cx={cx}
        cy={FT_LINE_Y}
        r={FT_CIRCLE_RADIUS}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        strokeDasharray="6 6"
      />

      {/* Zone restreinte (no-charge semicircle) sous le panier */}
      <path
        d={`M ${cx - RESTRICTED_AREA_RADIUS} ${HOOP.y} A ${RESTRICTED_AREA_RADIUS} ${RESTRICTED_AREA_RADIUS} 0 0 0 ${cx + RESTRICTED_AREA_RADIUS} ${HOOP.y}`}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH - 1}
      />

      {/* Ligne à 3 points : sections droites des coins + arc */}
      <line
        x1={CORNER_3PT_X_LEFT}
        y1={baseY}
        x2={CORNER_3PT_X_LEFT}
        y2={CORNER_3PT_Y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />
      <line
        x1={CORNER_3PT_X_RIGHT}
        y1={baseY}
        x2={CORNER_3PT_X_RIGHT}
        y2={CORNER_3PT_Y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />
      <path
        d={`M ${CORNER_3PT_X_LEFT} ${CORNER_3PT_Y} A ${THREE_POINT_RADIUS} ${THREE_POINT_RADIUS} 0 0 0 ${CORNER_3PT_X_RIGHT} ${CORNER_3PT_Y}`}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* Backboard (planche) — rectangle plein 1.78 m × 16 cm (vue de dessus).
       *  Avant : line strokeWidth=4 (trop fin, ne se voit pas). Rectangle de
       *  6 px de hauteur = présence visuelle nette tout en respectant
       *  l'échelle (la planche réelle a 16 cm de profondeur en vue de dessus). */}
      <rect
        x={cx - BACKBOARD_HALF_WIDTH}
        y={BACKBOARD_Y - 3}
        width={BACKBOARD_HALF_WIDTH * 2}
        height={6}
        fill={LINE_COLOR}
        stroke={LINE_COLOR}
        strokeWidth={1}
        rx={1}
      />
      {/* Petit segment qui rattache la planche au panier (rim mount) */}
      <line
        x1={cx}
        y1={BACKBOARD_Y}
        x2={cx}
        y2={HOOP.y - HOOP_RADIUS}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />

      {/* Anneau du panier */}
      <circle
        cx={HOOP.x}
        cy={HOOP.y}
        r={HOOP_RADIUS}
        fill="none"
        stroke="#E24B4A"
        strokeWidth={2.5}
      />

      {/* Marques sur les côtés de la raquette (rebound positions FIBA :
          4 hash marks par côté, à 1.75/2.75/3.75/4.75 m de la baseline) */}
      {[1.75, 2.75, 3.75, 4.75].map((m) => {
        const y = baseY + m * 37;
        return (
          <g key={m}>
            <rect x={PAINT.x1 - 5} y={y - 1} width={5} height={3} fill={LINE_COLOR} />
            <rect x={PAINT.x2} y={y - 1} width={5} height={3} fill={LINE_COLOR} />
          </g>
        );
      })}
    </>
  );
}

export function CourtBackground({ fullCourt = false, attackingDirection = 'up' }: CourtBackgroundProps) {
  const totalHeight = fullCourt ? FULL_COURT_HEIGHT : COURT.height;
  const totalInner = fullCourt ? FULL_COURT_HEIGHT - 40 : 520;
  const attackedHoop = attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
  const protectedHoop = attackingDirection === 'down' ? HOOP : HOOP_OPPOSITE;
  return (
    <>
      {/* Fond du SVG */}
      <rect x={0} y={0} width={COURT.width} height={totalHeight} fill="#9a7a5a" />

      {/* Bordure extérieure du terrain (touches + ligne de fond) */}
      <rect
        x={20}
        y={20}
        width={560}
        height={totalInner}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      <HalfCourt />

      {fullCourt ? (
        <>
          {/* Demi-terrain symétrique en bas */}
          <g transform={`translate(0 ${2 * MIDLINE_Y}) scale(1 -1)`}>
            <HalfCourt />
          </g>
          {/* Ligne médiane + cercle central plein */}
          <line
            x1={20}
            y1={MIDLINE_Y}
            x2={580}
            y2={MIDLINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
          />
          <circle
            cx={300}
            cy={MIDLINE_Y}
            r={CENTER_CIRCLE_RADIUS}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
          />
          {/* Indicateurs panier actif (visé par l'attaque) vs protégé (côté défense).
              Anneau orange autour du panier visé + label "🎯 visé".
              Petit cercle bleu sobre autour du panier protégé + label "🛡 protégé". */}
          <g pointerEvents="none">
            <circle
              cx={attackedHoop.x}
              cy={attackedHoop.y}
              r={HOOP_RADIUS + 8}
              fill="none"
              stroke="#F97316"
              strokeWidth={2.5}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            <text
              x={attackedHoop.x}
              y={attackedHoop.y + (attackedHoop.y < 540 ? -22 : 28)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#9a3412"
            >
              🎯 visé
            </text>
            <circle
              cx={protectedHoop.x}
              cy={protectedHoop.y}
              r={HOOP_RADIUS + 5}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1.5}
              opacity={0.55}
            />
            <text
              x={protectedHoop.x}
              y={protectedHoop.y + (protectedHoop.y < 540 ? -18 : 24)}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill="#1e40af"
              opacity={0.75}
            >
              🛡 protégé
            </text>
          </g>
        </>
      ) : (
        <>
          {/* Ligne médiane + demi-cercle central */}
          <line
            x1={20}
            y1={MIDLINE_Y}
            x2={580}
            y2={MIDLINE_Y}
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
          />
          <circle
            cx={300}
            cy={MIDLINE_Y}
            r={CENTER_CIRCLE_RADIUS}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
          />
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
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#D85A30" />
      </marker>
      <marker
        id="arrow-pass"
        viewBox="0 0 10 10"
        refX={8}
        refY={5}
        markerWidth={9}
        markerHeight={9}
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9 5 L 0 9 z" fill="#FF5500" stroke="#7A1D00" strokeWidth={0.8} />
      </marker>
      <marker
        id="arrow-gray"
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#FBBF24" />
      </marker>
    </defs>
  );
}
