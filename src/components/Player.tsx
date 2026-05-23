import type { Point, ScreenContactPhase } from '@/lib/types';
import { PLAYER_RADIUS } from '@/lib/data/court';

interface PlayerProps {
  id: string;
  pos: Point;
  isAttacker: boolean;
  isCarrierDefender?: boolean;
  isLate?: boolean;
  onScreen?: boolean;
  screenPhase?: ScreenContactPhase;
  helpFactor?: number;
  facing?: Point;
  isOverridden?: boolean;
  closingOut?: boolean;
  overClosed?: boolean;
  isForcedScreener?: boolean;
  denying?: boolean;
  /** Angle horaire du corps depuis le NORD (0–360°). Pilote les bras :
   *  ils matérialisent la posture/stance du corps, indépendamment du regard. */
  orientation?: number;
  /** Angle horaire du REGARD depuis le NORD. Pilote uniquement la flèche de
   *  regard. Toujours clampé à ±75° du body (orientation.ts), donc jamais
   *  derrière la tête. */
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
  /** Severity du mismatch après switch (B1). Range 0–4. Affiche un badge ⚠
   *  orange (severity 2) ou rouge (severity ≥3) à côté du défenseur quand
   *  ≥ `mismatchThreshold`. Si scram switch appliqué, badge bleu "SCRAM". */
  mismatchSeverity?: number;
  /** Vrai si CE défenseur a été impliqué dans un scram switch à cette étape
   *  (cf. `defense/mismatchTracking.ts`). Badge bleu "SCRAM" prioritaire sur
   *  le badge mismatch standard. */
  scrammedThisStep?: boolean;
  /** Seuil à partir duquel on affiche le badge mismatch. Default 2. */
  mismatchThreshold?: number;
  /** Master switch pour les badges mismatch / scram. Default true. */
  showMismatchBadges?: boolean;
  /** #4 — Défenseur sélectionné (sélection multiple). Affiche un halo cyan
   *  autour du sprite. Visuel UI seulement, pas dans l'AppState. */
  isSelected?: boolean;
  /**
   * Attaquant en position d'écran posé. Aucun rendu spécifique dans Player :
   * le cue visuel est piloté en amont par CourtView via `gazeOrientation`
   * (override vers le défenseur du porteur). Cette prop est conservée pour
   * que d'éventuels overlays de debug puissent l'exploiter.
   */
  isScreening?: boolean;
}

export function Player({
  id,
  pos,
  isAttacker,
  isCarrierDefender,
  isLate,
  onScreen,
  screenPhase,
  helpFactor,
  facing,
  isOverridden,
  closingOut,
  overClosed,
  isForcedScreener,
  denying,
  orientation,
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
  mismatchSeverity,
  scrammedThisStep,
  mismatchThreshold = 2,
  showMismatchBadges = true,
  isSelected,
  isScreening: _isScreening,
}: PlayerProps) {
  const fill = isAttacker ? '#D85A30' : '#378ADD';

  let stroke = isAttacker ? '#4A1B0C' : '#042C53';
  let strokeWidth = 2;
  if (!isAttacker && showStateRings) {
    if (screenPhase) {
      stroke = screenPhaseColor(screenPhase);
      strokeWidth = screenPhase === 'recover' ? 3 : 4;
    } else if (isLate && showLateRing) {
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
  const bodyOrientation = orientation ?? gazeOrientation ?? 0;

  return (
    <g data-id={id} style={{ cursor: 'grab' }}>
      {/* #4 — Halo de sélection multiple (cyan pointillé). Rendu en
       *  premier pour passer sous tous les autres anneaux. */}
      {isSelected && !isAttacker && (
        <circle
          cx={pos.x}
          cy={pos.y}
          r={r + 9}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={2.5}
          strokeDasharray="3 3"
          opacity={0.9}
          pointerEvents="none"
        />
      )}
      <g pointerEvents="none">
        {/* Pictogramme stylisé FIBA : 2 arcs symétriques courbés.
         *
         * Les arcs sont dessinés "au-dessus" en posture neutre (à
         * orientation=0°), puis le wrapper rotate les amène dans la
         * direction du CORPS du joueur. Conséquence visuelle :
         *  - corps nord → bras au-dessus, courbure vers le nord (= devant)
         *  - corps est → bras à droite, courbure vers l'est (= devant)
         *  - corps sud → bras en bas, courbure vers le sud (= devant)
         *
         * La flèche de regard est rendue séparément depuis `gazeOrientation`,
         * ce qui permet une stance à plat avec tête tournée vers ballon/action. */}
        <g transform={`rotate(${bodyOrientation}, ${pos.x}, ${pos.y})`}>
          {/* === DESIGN F — FIGÉ ===
           * Tracé Bezier des bras choisi par l'utilisateur via la page de
           * démo /demo-arms. NE PAS MODIFIER sans une demande explicite —
           * le design a été testé et validé contre 7 alternatives.
           *
           * Caractéristiques (en posture neutre, gaze=0°) :
           *  - Épaule (départ M) : niveau central du cercle (y=0), côté à ±0.7r.
           *  - Main (fin Q) : ±1.8r en x, -1.4r en y → loin extérieure et haute.
           *  - Control point : ±2.0r en x, -0.5r en y → courbure largement
           *    ouverte vers l'extérieur, "bras grands ouverts".
           *
           * Le wrapper rotate(bodyOrientation) pivote l'ensemble en bloc selon
           * le corps du joueur. Le regard peut diverger et reste indiqué par
           * le triangle pointeur.
           */}
          <path
            d={`M ${pos.x - r * 0.7} ${pos.y} Q ${pos.x - r * 2.0} ${pos.y - r * 0.5} ${pos.x - r * 1.8} ${pos.y - r * 1.4}`}
            fill="none"
            stroke={stroke}
            strokeWidth={isAttacker ? 1.8 : 2.5}
            strokeLinecap="round"
            opacity={isAttacker ? 0.7 : 1}
          />
          <path
            d={`M ${pos.x + r * 0.7} ${pos.y} Q ${pos.x + r * 2.0} ${pos.y - r * 0.5} ${pos.x + r * 1.8} ${pos.y - r * 1.4}`}
            fill="none"
            stroke={stroke}
            strokeWidth={isAttacker ? 1.8 : 2.5}
            strokeLinecap="round"
            opacity={isAttacker ? 0.7 : 1}
          />
        </g>
        {(gazeOrientation !== undefined || facing) && (() => {
          // Pointeur de "facing" : un petit triangle posé sur le bord du
          // cercle, dans la direction regardée. Indique le regard
          // sans toucher aux bras (ex. corps à plat, tête vers ballon/action).
          //
          // On dérive la direction du triangle depuis `gazeOrientation`
          // (l'angle) plutôt que depuis `facing` (le point) quand les
          // deux sont disponibles : pendant l'animation entre étapes,
          // `gazeOrientation` est lerpé angulairement (chemin court
          // autour du cercle) tandis que `facing` est lerpé linéairement
          // en (x, y) — ce qui peut faire passer le point facing PAR le
          // joueur et sortir du côté opposé. La flèche reste donc cohérente
          // avec le regard, même quand les bras gardent l'orientation du corps.
          let ux: number;
          let uy: number;
          if (gazeOrientation !== undefined) {
            const rad = (gazeOrientation * Math.PI) / 180;
            ux = Math.sin(rad);
            uy = -Math.cos(rad);
          } else if (facing) {
            const dx = facing.x - pos.x;
            const dy = facing.y - pos.y;
            const len = Math.hypot(dx, dy) || 1;
            ux = dx / len;
            uy = dy / len;
          } else {
            return null;
          }
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
      {/* Badge mismatch (B1) — défenseur sur attaquant de rang trop éloigné.
       *  Affiché uniquement côté défenseur, quand severity ≥ threshold (2 par
       *  défaut). Couleur escalade : orange (sev 2) → rouge (sev ≥ 3). Si
       *  scram switch impliqué : badge bleu "SCRAM" prioritaire. */}
      {!isAttacker && showMismatchBadges && (scrammedThisStep || (mismatchSeverity !== undefined && mismatchSeverity >= mismatchThreshold)) && (
        <g pointerEvents="none">
          {(() => {
            const isScram = !!scrammedThisStep;
            const severe = !isScram && mismatchSeverity !== undefined && mismatchSeverity >= 3;
            const bg = isScram ? '#1D4ED8' : severe ? '#DC2626' : '#EA580C';
            const label = isScram ? 'SCRAM' : `⚠ ${mismatchSeverity}`;
            const w = isScram ? 38 : 24;
            return (
              <>
                <rect
                  x={pos.x - r - w}
                  y={pos.y + r + 2}
                  width={w}
                  height={12}
                  rx={3}
                  fill={bg}
                  opacity={0.94}
                />
                <text
                  x={pos.x - r - w / 2}
                  y={pos.y + r + 11}
                  fontSize={9}
                  fontWeight={700}
                  fill="#fff"
                  textAnchor="middle"
                >
                  {label}
                </text>
              </>
            );
          })()}
        </g>
      )}
      {screenPhase && !isAttacker && showStateRings && (
        <g pointerEvents="none">
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 8}
            fill="none"
            stroke={screenPhaseColor(screenPhase)}
            strokeWidth={2}
            strokeDasharray={screenPhase === 'recover' ? '5 3' : undefined}
            opacity={0.8}
          />
          <rect
            x={pos.x + r - 1}
            y={pos.y - r - 13}
            width={screenPhaseLabel(screenPhase).length > 3 ? 30 : 24}
            height={13}
            rx={3}
            fill="rgba(255,255,255,0.92)"
            stroke={screenPhaseColor(screenPhase)}
            strokeWidth={1}
          />
          <text
            x={pos.x + r + (screenPhaseLabel(screenPhase).length > 3 ? 14 : 11)}
            y={pos.y - r - 3}
            fontSize={8}
            fontWeight={700}
            fill={screenPhaseColor(screenPhase)}
            textAnchor="middle"
          >
            {screenPhaseLabel(screenPhase)}
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
      {!isOverridden && !isAttacker && showLockBadges && (
        <g pointerEvents="none">
          <circle
            cx={pos.x + r * 0.85}
            cy={pos.y - r * 0.85}
            r={5}
            fill="#e0e7ff"
            stroke="#4338ca"
            strokeWidth={1.2}
          />
          <text
            x={pos.x + r * 0.85}
            y={pos.y - r * 0.85 + 2.5}
            textAnchor="middle"
            fontSize={7}
            fontWeight={700}
          >
            🧠
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

function screenPhaseColor(phase: ScreenContactPhase): string {
  switch (phase) {
    case 'approach': return '#6366F1';
    case 'impact': return '#7C3AED';
    case 'stuck': return '#BE123C';
    case 'navigate': return '#D97706';
    case 'recover': return '#059669';
    case 'released': return '#64748B';
  }
}

function screenPhaseLabel(phase: ScreenContactPhase): string {
  switch (phase) {
    case 'approach': return 'SET';
    case 'impact': return 'HIT';
    case 'stuck': return 'STOP';
    case 'navigate': return 'NAV';
    case 'recover': return 'REC';
    case 'released': return 'REL';
  }
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
