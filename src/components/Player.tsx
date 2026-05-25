import type { Point, ScreenContactPhase } from '@/lib/types';
import { PLAYER_RADIUS } from '@/lib/data/court';
import { angleDiff, normalizeAngle, angleFromNorth } from '@/lib/logic/angles';

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
  /** Vrai si le joueur est le porteur du ballon (dribbleur) */
  isCarrier?: boolean;
  /** Vrai si le joueur est en train de tirer (shooter) */
  isShooting?: boolean;
  /** Main dominante (latéralité). 'right' (défaut) = main shoot/dribble à
   *  droite du sprite. 'left' = miroir x sur les poses asymétriques
   *  (shooter + dribble actif). Les poses symétriques (idle, screener,
   *  driver garde) ne sont pas affectées. */
  dominantHand?: 'right' | 'left';
  /** Sprite V2 — porteur en dribble ACTIF (a bougé > DRIBBLE_THRESHOLD_PX
   *  avec annotation `dribble` présente). Quand true ET `isCarrier && !isShooting`,
   *  affiche une pose asymétrique (1 bras qui descend vers le ballon +
   *  1 stiff arm latéral). Sinon (porteur statique) : pose garde (2 bras en L). */
  isActivelyDribbling?: boolean;
  /** Sprite V2 — pose recovery post-shot (ex-tireur du step précédent).
   *  2 bras tendus haut symétriques (follow-through). Dure 1 step entier. */
  isPostShotRecovery?: boolean;
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
  isScreening,
  isCarrier,
  isShooting,
  dominantHand,
  isActivelyDribbling,
  isPostShotRecovery,
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

  // Clamping du regard à ±75° par rapport aux épaules (human head/eyes neck limit)
  let rawGaze = gazeOrientation;
  if (rawGaze === undefined && facing) {
    rawGaze = angleFromNorth(pos, facing);
  }
  if (rawGaze === undefined) {
    rawGaze = bodyOrientation;
  }
  const diff = angleDiff(rawGaze, bodyOrientation);
  let finalGaze = rawGaze;
  if (diff > 75) {
    finalGaze = normalizeAngle(bodyOrientation + 75);
  } else if (diff < -75) {
    finalGaze = normalizeAngle(bodyOrientation - 75);
  }

  // Couleurs de peau et détails pour la proposition C
  const skinFill = '#FFE0B2';
  const hairFill = '#475569';

  // Latéralité : sign appliqué aux x relatifs (offset depuis pos.x) sur les
  // poses asymétriques (shooter, dribble actif). +1 = droitier (défaut),
  // -1 = gaucher → main dominante miroir sur l'autre côté.
  const handSign = dominantHand === 'left' ? -1 : 1;

  return (
    <g data-id={id} style={{ cursor: 'grab' }}>
      {/* Target cliquable invisible pour le Drag and Drop. Rayon r*1.7 aligné
       *  sur l'envergure des bras stylisés (mains à r*1.6, marge 0.1r). La
       *  désambiguïsation des chevauchements attaquant/défenseur se fait côté
       *  useCourtPointerHandlers via `findPlayerAt(pt)` (priorité attaquant). */}
      <circle cx={pos.x} cy={pos.y} r={r * 1.4} fill="rgba(0,0,0,0)" />
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
        {/* PROPOSITION C — ANATOMIQUE VECTORIEL */}
        
        {/* Corps (torse + bras) : tourne selon bodyOrientation */}
        <g transform={`rotate(${bodyOrientation}, ${pos.x}, ${pos.y})`}>
          {/* Bras */}
          {(() => {
            if (isScreening) {
              // Bras croisés (Screener)
              return (
                <>
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x - r * 0.5625} ${pos.y - r * 0.4375} ${pos.x - r * 0.125} ${pos.y - r * 0.25}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x - r * 0.5625} ${pos.y - r * 0.4375} ${pos.x - r * 0.125} ${pos.y - r * 0.25}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + r * 0.5625} ${pos.y - r * 0.4375} ${pos.x + r * 0.125} ${pos.y - r * 0.25}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + r * 0.5625} ${pos.y - r * 0.4375} ${pos.x + r * 0.125} ${pos.y - r * 0.25}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                </>
              );
            } else if (isCarrier && !isShooting && isActivelyDribbling) {
              // Posture Dribble ACTIF — asymétrie : main dominante descend
              // vers le ballon (Bezier qui plonge devant le corps), main
              // non-dominante en stiff arm horizontal latéral. handSign
              // inverse les côtés pour gaucher.
              const sDribble = handSign;  // côté main qui dribble
              const sStiff = -handSign;   // côté stiff arm
              return (
                <>
                  {/* Bras non-dominant (stiff arm latéral) */}
                  <path
                    d={`M ${pos.x + sStiff * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sStiff * r * 1.55} ${pos.y - r * 0.1} ${pos.x + sStiff * r * 1.7} ${pos.y + r * 0.0}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sStiff * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sStiff * r * 1.55} ${pos.y - r * 0.1} ${pos.x + sStiff * r * 1.7} ${pos.y + r * 0.0}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sStiff * r * 1.7} cy={pos.y + r * 0.0} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras dominant (dribble bas) */}
                  <path
                    d={`M ${pos.x + sDribble * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sDribble * r * 1.1} ${pos.y + r * 0.7} ${pos.x + sDribble * r * 0.4} ${pos.y + r * 1.5}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sDribble * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sDribble * r * 1.1} ${pos.y + r * 0.7} ${pos.x + sDribble * r * 0.4} ${pos.y + r * 1.5}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sDribble * r * 0.4} cy={pos.y + r * 1.5} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else if (isCarrier && !isShooting) {
              // Posture Dribbleur statique (garde) — 2 bras symétriques en L.
              // Humérus horizontal vers l'extérieur + avant-bras vertical qui
              // POINTE VERS L'AVANT (vers le panier). Mêmes coords gauche/droite
              // (symétrique, pas affecté par handSign).
              return (
                <>
                  {/* Bras gauche en L (angle droit) */}
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} L ${pos.x - r * 1.4} ${pos.y - r * 0.0625} L ${pos.x - r * 1.4} ${pos.y - r * 1.0}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} L ${pos.x - r * 1.4} ${pos.y - r * 0.0625} L ${pos.x - r * 1.4} ${pos.y - r * 1.0}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x - r * 1.4} cy={pos.y - r * 1.0} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras droit en L (angle droit) — miroir parfait du gauche */}
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} L ${pos.x + r * 1.4} ${pos.y - r * 0.0625} L ${pos.x + r * 1.4} ${pos.y - r * 1.0}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} L ${pos.x + r * 1.4} ${pos.y - r * 0.0625} L ${pos.x + r * 1.4} ${pos.y - r * 1.0}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + r * 1.4} cy={pos.y - r * 1.0} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else if (isShooting) {
              // Posture Tireur (Shooter). Asymétrie : main dominante = bras
              // shoot vertical, main non-dominante = guide hand devant la
              // joue. handSign inverse les côtés gauche/droite pour gaucher.
              const sShoot = handSign; // côté de la main qui shoote
              const sGuide = -handSign; // côté de la main guide
              return (
                <>
                  {/* Bras non-dominant (guide) */}
                  <path
                    d={`M ${pos.x + sGuide * r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + sGuide * r * 0.875} ${pos.y - r * 0.9375} L ${pos.x + sGuide * r * 0.375} ${pos.y - r * 1.4375}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sGuide * r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + sGuide * r * 0.875} ${pos.y - r * 0.9375} L ${pos.x + sGuide * r * 0.375} ${pos.y - r * 1.4375}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sGuide * r * 0.375} cy={pos.y - r * 1.4375} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras dominant (shoot) */}
                  <path
                    d={`M ${pos.x + sShoot * r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + sShoot * r * 1.25} ${pos.y - r * 1.1875} L ${pos.x + sShoot * r * 0.75} ${pos.y - r * 1.8125}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sShoot * r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + sShoot * r * 1.25} ${pos.y - r * 1.1875} L ${pos.x + sShoot * r * 0.75} ${pos.y - r * 1.8125}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sShoot * r * 0.75} cy={pos.y - r * 1.8125} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else if (isPostShotRecovery) {
              // Posture Recovery post-shot — follow-through.
              // 2 bras symétriques tendus haut (mains qui convergent au-dessus
              // de la tête, posture de suspension après release). Pas affecté
              // par handSign (symétrique). Dure 1 step entier (l'ex-tireur du
              // step précédent affiche cette pose au step courant).
              return (
                <>
                  {/* Bras gauche tendu haut */}
                  <path
                    d={`M ${pos.x - r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x - r * 0.7} ${pos.y - r * 0.9} L ${pos.x - r * 0.4} ${pos.y - r * 1.7}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x - r * 0.7} ${pos.y - r * 0.9} L ${pos.x - r * 0.4} ${pos.y - r * 1.7}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x - r * 0.4} cy={pos.y - r * 1.7} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras droit tendu haut — miroir du gauche */}
                  <path
                    d={`M ${pos.x + r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + r * 0.7} ${pos.y - r * 0.9} L ${pos.x + r * 0.4} ${pos.y - r * 1.7}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.0625} ${pos.y - r * 0.1875} L ${pos.x + r * 0.7} ${pos.y - r * 0.9} L ${pos.x + r * 0.4} ${pos.y - r * 1.7}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + r * 0.4} cy={pos.y - r * 1.7} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else {
              // Posture Stance Standard / Droit d'aide.
              // Bras à r * 1.4 (mains à 25.6 px du centre, envergure 51 px =
              // 1.38 m). Cohérent avec le sprite pictographique stylisé (torse
              // déformé ×1.4) : ratio bras/torse = 1.6x. Choix entre l'ancien
              // r*1.4375 trop court ("cartoon trapu") et r*2.0 trop long
              // ("tentacules" — envergure dépassait largement la largeur du
              // panier visuellement).
              return (
                <>
                  {/* Bras gauche */}
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x - r * 1.4} ${pos.y - r * 0.55} ${pos.x - r * 1.4} ${pos.y - r * 1.25}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x - r * 1.4} ${pos.y - r * 0.55} ${pos.x - r * 1.4} ${pos.y - r * 1.25}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x - r * 1.4} cy={pos.y - r * 1.25} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras droit */}
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + r * 1.4} ${pos.y - r * 0.55} ${pos.x + r * 1.4} ${pos.y - r * 1.25}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + r * 1.4} ${pos.y - r * 0.55} ${pos.x + r * 1.4} ${pos.y - r * 1.25}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + r * 1.4} cy={pos.y - r * 1.25} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            }
          })()}
          
          {/* Torse */}
          <path
            d={`M ${pos.x - r * 1.0625} ${pos.y + r * 0.0625} C ${pos.x - r * 1.125} ${pos.y - r * 0.5}, ${pos.x + r * 1.125} ${pos.y - r * 0.5}, ${pos.x + r * 1.0625} ${pos.y + r * 0.0625} C ${pos.x + r * 0.8125} ${pos.y + r * 0.5}, ${pos.x - r * 0.8125} ${pos.y + r * 0.5}, ${pos.x - r * 1.0625} ${pos.y + r * 0.0625} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {/* Col de maillot */}
          <path
            d={`M ${pos.x - r * 0.625} ${pos.y - r * 0.344} Q ${pos.x} ${pos.y - r * 0.156} ${pos.x + r * 0.625} ${pos.y - r * 0.344}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
          />
        </g>

        {/* Tête (tête + oreilles + cheveux + nez) : tourne selon finalGaze */}
        <g transform={`rotate(${finalGaze}, ${pos.x}, ${pos.y})`}>
          {/* Oreilles */}
          <ellipse cx={pos.x - r * 0.46875} cy={pos.y - r * 0.1875} rx={r * 0.09375} ry={r * 0.1875} fill={skinFill} stroke={stroke} strokeWidth={1} />
          <ellipse cx={pos.x + r * 0.46875} cy={pos.y - r * 0.1875} rx={r * 0.09375} ry={r * 0.1875} fill={skinFill} stroke={stroke} strokeWidth={1} />
          
          {/* Tête principale */}
          <ellipse cx={pos.x} cy={pos.y - r * 0.1875} rx={r * 0.45} ry={r * 0.5} fill={skinFill} stroke={stroke} strokeWidth={strokeWidth} />
          
          {/* Cheveux */}
          <path
            d={`M ${pos.x - r * 0.425} ${pos.y - r * 0.281} C ${pos.x - r * 0.469} ${pos.y - r * 0.6875}, ${pos.x + r * 0.469} ${pos.y - r * 0.6875}, ${pos.x + r * 0.425} ${pos.y - r * 0.281} C ${pos.x + r * 0.3125} ${pos.y - r * 0.4375}, ${pos.x - r * 0.3125} ${pos.y - r * 0.4375}, ${pos.x - r * 0.425} ${pos.y - r * 0.281} Z`}
            fill={hairFill}
          />
          
          {/* Nez (indicateur de regard) — agrandi + couleur contrastée pour
           *  bien voir la direction du regard. Triangle rouge avec outline
           *  noir. Avant : fill skinFill (orangé clair → peu visible). */}
          <polygon
            points={`${pos.x},${pos.y - r * 1.0} ${pos.x - r * 0.18},${pos.y - r * 0.6} ${pos.x + r * 0.18},${pos.y - r * 0.6}`}
            fill="#E24B4A"
            stroke="#000000"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </g>
      </g>
      
      {/* ID/Numéro du joueur — placé sur la TÊTE, texte noir avec outline
       *  blanc épais pour rester lisible sur skin clair ET cheveux foncés.
       *  fontSize 8 pour ne pas dépasser le cercle de la tête (ry ≈ r*0.5). */}
      <text
        x={pos.x}
        y={pos.y - r * 0.05}
        textAnchor="middle"
        fill="#000000"
        fontSize={8}
        fontWeight={800}
        pointerEvents="none"
        stroke="#FFFFFF"
        strokeWidth={2}
        style={{ paintOrder: 'stroke fill' }}
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

  const hasZ = p.z !== undefined;
  const z = p.z ?? 0;

  // Calcul dynamique de l'ombre portée
  const showShadow = inFlight || (hasZ && z < 25);
  let shadowY = p.y + 14;
  let shadowRx = 6;
  let shadowRy = 1.5;
  let shadowOpacity = 0.25;

  if (hasZ) {
    shadowY = inFlight ? p.y + z + 14 : p.y + 1.64 * z - 11;
    shadowRx = Math.max(2, 6 * (1 - z / 140));
    shadowRy = Math.max(0.5, 1.5 * (1 - z / 140));
    shadowOpacity = Math.max(0.04, 0.3 * (1 - z / 120));
  }

  // Rayon du ballon avec effet 3D subtil
  const r = hasZ ? 7 + Math.min(3, z * 0.02) : (inFlight ? 8 : 7);

  return (
    <g pointerEvents="none">
      {showShadow && (
        <ellipse
          cx={p.x}
          cy={shadowY}
          rx={shadowRx}
          ry={shadowRy}
          fill={`rgba(0,0,0,${shadowOpacity})`}
        />
      )}
      <circle
        cx={p.x}
        cy={p.y}
        r={r}
        fill="#BA7517"
        stroke={inFlight ? '#fff' : '#412402'}
        strokeWidth={inFlight ? 2.5 : 2}
      />
    </g>
  );
}
