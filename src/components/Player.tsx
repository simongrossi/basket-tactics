import type { DefenderRotationState, Point, ScreenContactPhase } from '@/lib/types';
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
  closeoutQuality?: 'clean' | 'desperate' | 'late';
  weakSideAnchor?: boolean;
  blitzRecovering?: boolean;
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
  name?: string;
  number?: string;
  showName?: boolean;
  /** Rôle PnR (P1) — affiche un anneau distinct selon la rotation. */
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  /** P4.4 — état de rotation (mémoire de rotation). */
  rotation?: DefenderRotationState;
  /** Repli en transition : rôle du défenseur. */
  transitionRole?: 'stop-ball' | 'protect-rim' | 'match' | 'feint-retreat' | 'tandem-drop';
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
  /** Sprite V3 — pose passeur (follow-through de passe à 2 mains vers le receveur). */
  isPassing?: boolean;
  /** Sprite V3 — pose coupeur en course (foulée dynamique, bras pompés avant/côté). */
  isCutting?: boolean;
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
  closeoutQuality,
  weakSideAnchor,
  blitzRecovering,
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
  rotation,
  transitionRole,
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
  isPassing,
  isCutting,
  name,
  number,
  showName = true,
}: PlayerProps) {
  const fill = isAttacker ? '#D85A30' : '#378ADD';
  const jerseyTrim = isAttacker ? '#FED7AA' : '#BAE6FD';

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
  const hairFill = '#334155';

  // Latéralité : sign appliqué aux x relatifs (offset depuis pos.x) sur les
  // poses asymétriques (shooter, dribble actif). +1 = droitier (défaut),
  // -1 = gaucher → main dominante miroir sur l'autre côté.
  const handSign = dominantHand === 'left' ? -1 : 1;

  return (
    <g data-id={id} style={{ cursor: 'grab' }}>
      {/* Target cliquable invisible pour le Drag and Drop. Rayon à 22px
       *  (diamètre 44px) pour respecter les standards de taille de cibles tactiles.
       *  La désambiguïsation des chevauchements attaquant/défenseur se fait côté
       *  useCourtPointerHandlers via `findPlayerAt(pt)` (priorité attaquant). */}
      <circle cx={pos.x} cy={pos.y} r={22} fill="rgba(0,0,0,0)" />
      {/* Halo de sélection (joueur seul ou multi-sélection défenseur).
       *  Rendu en premier pour passer sous tous les autres anneaux. */}
      {isSelected && (
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
      {/* Anneau / Aura au sol du porteur de balle (HUD pro) */}
      {isCarrier && isAttacker && showStateRings && (
        <g pointerEvents="none">
          {/* Halo d'aura douce ambrée au sol */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 8}
            fill="#F59E0B"
            fillOpacity={0.22}
          />
          {/* Anneau extérieur pointillé doré / ambre éclatant */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 7}
            fill="none"
            stroke="#F59E0B"
            strokeWidth={2.2}
            strokeDasharray="5 3"
            opacity={0.95}
          />
          {/* Anneau intérieur fin contrasté */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 4}
            fill="none"
            stroke="#D97706"
            strokeWidth={1}
            opacity={0.7}
          />
        </g>
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
              // Posture Dribble ACTIF — asymétrie : main dominante pousse le
              // ballon devant l'épaule dominante (en avant du buste, jamais
              // dans le dos), main non-dominante en protection latérale-avant
              // (barrière/stiff arm). handSign inverse les côtés pour gaucher.
              const sDribble = handSign;  // côté main qui dribble
              const sStiff = -handSign;   // côté bras de protection
              return (
                <>
                  {/* Bras non-dominant (protection latérale-avant / stiff arm) */}
                  <path
                    d={`M ${pos.x + sStiff * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sStiff * r * 1.45} ${pos.y - r * 0.25} ${pos.x + sStiff * r * 1.55} ${pos.y - r * 0.35}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sStiff * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sStiff * r * 1.45} ${pos.y - r * 0.25} ${pos.x + sStiff * r * 1.55} ${pos.y - r * 0.35}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sStiff * r * 1.55} cy={pos.y - r * 0.35} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras dominant (dribble actif devant l'épaule dominante) */}
                  <path
                    d={`M ${pos.x + sDribble * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sDribble * r * 1.35} ${pos.y - r * 0.75} ${pos.x + sDribble * r * 0.95} ${pos.y - r * 1.45}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sDribble * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sDribble * r * 1.35} ${pos.y - r * 0.75} ${pos.x + sDribble * r * 0.95} ${pos.y - r * 1.45}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sDribble * r * 0.95} cy={pos.y - r * 1.45} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
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
            } else if (isPassing) {
              // Posture Passeur (chest/push pass follow-through) : 2 bras tendus
              // vers l'avant qui convergent vers la ligne de passe.
              return (
                <>
                  {/* Bras gauche de passe */}
                  <path
                    d={`M ${pos.x - r * 1.0625} ${pos.y - r * 0.125} Q ${pos.x - r * 0.95} ${pos.y - r * 0.85} ${pos.x - r * 0.55} ${pos.y - r * 1.5}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.0625} ${pos.y - r * 0.125} Q ${pos.x - r * 0.95} ${pos.y - r * 0.85} ${pos.x - r * 0.55} ${pos.y - r * 1.5}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x - r * 0.55} cy={pos.y - r * 1.5} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras droit de passe */}
                  <path
                    d={`M ${pos.x + r * 1.0625} ${pos.y - r * 0.125} Q ${pos.x + r * 0.95} ${pos.y - r * 0.85} ${pos.x + r * 0.55} ${pos.y - r * 1.5}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.0625} ${pos.y - r * 0.125} Q ${pos.x + r * 0.95} ${pos.y - r * 0.85} ${pos.x + r * 0.55} ${pos.y - r * 1.5}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + r * 0.55} cy={pos.y - r * 1.5} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else if (isCutting) {
              // Posture Coupeur en course (running stride) : foulée athlétique
              // avec bras fléchis près du buste (un bras d'attaque devant,
              // l'autre en appel d'équilibre côté/avant, jamais dans le dos).
              const sLead = handSign;
              const sTrail = -handSign;
              return (
                <>
                  {/* Bras d'appel (côté/avant fléchi) */}
                  <path
                    d={`M ${pos.x + sTrail * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sTrail * r * 1.38} ${pos.y - r * 0.32} ${pos.x + sTrail * r * 1.18} ${pos.y - r * 0.72}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sTrail * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sTrail * r * 1.38} ${pos.y - r * 0.32} ${pos.x + sTrail * r * 1.18} ${pos.y - r * 0.72}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sTrail * r * 1.18} cy={pos.y - r * 0.72} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras d'attaque (foulée avant) */}
                  <path
                    d={`M ${pos.x + sLead * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sLead * r * 1.25} ${pos.y - r * 0.72} ${pos.x + sLead * r * 0.85} ${pos.y - r * 1.35}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + sLead * r * 1.125} ${pos.y - r * 0.0625} Q ${pos.x + sLead * r * 1.25} ${pos.y - r * 0.72} ${pos.x + sLead * r * 0.85} ${pos.y - r * 1.35}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={pos.x + sLead * r * 0.85} cy={pos.y - r * 1.35} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            } else {
              // Posture Stance Standard / Droit d'aide / Contestation (deny).
              // Si `armBallSide` et `armManSide` sont fournis par le moteur,
              // chaque bras s'oriente dynamiquement vers sa cible respective
              // (ligne de passe vs joueur marqué) tout en restant dans le
              // demi-cercle avant (jamais dans le dos). Sinon : stance symétrique.
              let leftHandX = pos.x - r * 1.4;
              let leftHandY = pos.y - r * 1.25;
              let leftCtrlX = pos.x - r * 1.4;
              let leftCtrlY = pos.y - r * 0.55;

              let rightHandX = pos.x + r * 1.4;
              let rightHandY = pos.y - r * 1.25;
              let rightCtrlX = pos.x + r * 1.4;
              let rightCtrlY = pos.y - r * 0.55;

              if (armBallSide && armManSide) {
                const relA = Math.max(-78, Math.min(78, angleDiff(angleFromNorth(pos, armBallSide), bodyOrientation)));
                const relB = Math.max(-78, Math.min(78, angleDiff(angleFromNorth(pos, armManSide), bodyOrientation)));
                // Si les deux cibles sont distinctes (ex: open stance, deny-3q, tag),
                // le bras gauche prend la cible la plus à gauche et le bras droit la plus à droite.
                if (Math.abs(relA - relB) > 8) {
                  const leftRel = Math.min(relA, relB);
                  const rightRel = Math.max(relA, relB);
                  const leftAngleRad = ((Math.min(-16, leftRel * 0.65 - 14)) * Math.PI) / 180;
                  const rightAngleRad = ((Math.max(16, rightRel * 0.65 + 14)) * Math.PI) / 180;
                  const reach = r * 1.65;
                  leftHandX = pos.x + Math.sin(leftAngleRad) * reach;
                  leftHandY = pos.y - Math.cos(leftAngleRad) * reach;
                  leftCtrlX = pos.x - r * 1.25 + Math.sin(leftAngleRad) * (r * 0.35);
                  leftCtrlY = pos.y - Math.cos(leftAngleRad) * (r * 0.55);

                  rightHandX = pos.x + Math.sin(rightAngleRad) * reach;
                  rightHandY = pos.y - Math.cos(rightAngleRad) * reach;
                  rightCtrlX = pos.x + r * 1.25 + Math.sin(rightAngleRad) * (r * 0.35);
                  rightCtrlY = pos.y - Math.cos(rightAngleRad) * (r * 0.55);
                }
              }

              return (
                <>
                  {/* Bras gauche */}
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${leftCtrlX} ${leftCtrlY} ${leftHandX} ${leftHandY}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x - r * 1.125} ${pos.y - r * 0.0625} Q ${leftCtrlX} ${leftCtrlY} ${leftHandX} ${leftHandY}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={leftHandX} cy={leftHandY} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />

                  {/* Bras droit */}
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${rightCtrlX} ${rightCtrlY} ${rightHandX} ${rightHandY}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth + 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${pos.x + r * 1.125} ${pos.y - r * 0.0625} Q ${rightCtrlX} ${rightCtrlY} ${rightHandX} ${rightHandY}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={rightHandX} cy={rightHandY} r={3} fill={skinFill} stroke={stroke} strokeWidth={1} />
                </>
              );
            }
          })()}
          
          {/* Torse (maillot basket avec épaules galbées) */}
          <path
            d={`M ${pos.x - r * 1.0625} ${pos.y + r * 0.0625} C ${pos.x - r * 1.125} ${pos.y - r * 0.5}, ${pos.x + r * 1.125} ${pos.y - r * 0.5}, ${pos.x + r * 1.0625} ${pos.y + r * 0.0625} C ${pos.x + r * 0.8125} ${pos.y + r * 0.5}, ${pos.x - r * 0.8125} ${pos.y + r * 0.5}, ${pos.x - r * 1.0625} ${pos.y + r * 0.0625} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {/* Emmanchures / bordures d'épaules du maillot basket (distingue immédiatement l'avant/arrière du buste) */}
          <path
            d={`M ${pos.x - r * 0.82} ${pos.y - r * 0.34} Q ${pos.x - r * 0.72} ${pos.y + r * 0.04} ${pos.x - r * 0.84} ${pos.y + r * 0.32}`}
            fill="none"
            stroke={jerseyTrim}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.75}
          />
          <path
            d={`M ${pos.x + r * 0.82} ${pos.y - r * 0.34} Q ${pos.x + r * 0.72} ${pos.y + r * 0.04} ${pos.x + r * 0.84} ${pos.y + r * 0.32}`}
            fill="none"
            stroke={jerseyTrim}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.75}
          />
          {/* Col de maillot en V/U sur l'avant de la poitrine */}
          <path
            d={`M ${pos.x - r * 0.58} ${pos.y - r * 0.36} Q ${pos.x} ${pos.y - r * 0.14} ${pos.x + r * 0.58} ${pos.y - r * 0.36}`}
            fill="none"
            stroke={jerseyTrim}
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.9}
          />
        </g>

        {/* Tête (tête + oreilles + cheveux + nez/visière directionnelle) : tourne selon finalGaze */}
        <g transform={`rotate(${finalGaze}, ${pos.x}, ${pos.y})`}>
          {/* Oreilles */}
          <ellipse cx={pos.x - r * 0.46875} cy={pos.y - r * 0.1875} rx={r * 0.09375} ry={r * 0.1875} fill={skinFill} stroke={stroke} strokeWidth={1} />
          <ellipse cx={pos.x + r * 0.46875} cy={pos.y - r * 0.1875} rx={r * 0.09375} ry={r * 0.1875} fill={skinFill} stroke={stroke} strokeWidth={1} />

          {/* Nez / Pointe directionnelle du regard (placée devant le visage pour indiquer clairement où regarde le joueur) */}
          <polygon
            points={`${pos.x},${pos.y - r * 0.98} ${pos.x - r * 0.19},${pos.y - r * 0.58} ${pos.x + r * 0.19},${pos.y - r * 0.58}`}
            fill={skinFill}
            stroke={stroke}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />

          {/* Tête principale */}
          <ellipse cx={pos.x} cy={pos.y - r * 0.1875} rx={r * 0.45} ry={r * 0.5} fill={skinFill} stroke={stroke} strokeWidth={strokeWidth} />

          {/* Bandeau / Visière frontale contrastée (marque le front et la direction du regard) */}
          <path
            d={`M ${pos.x - r * 0.39} ${pos.y - r * 0.36} Q ${pos.x} ${pos.y - r * 0.56} ${pos.x + r * 0.39} ${pos.y - r * 0.36}`}
            fill="none"
            stroke={fill}
            strokeWidth={2.2}
            strokeLinecap="round"
          />

          {/* Cheveux (calotte sur le dessus/arrière du crâne) */}
          <path
            d={`M ${pos.x - r * 0.42} ${pos.y - r * 0.22} C ${pos.x - r * 0.46} ${pos.y + r * 0.25}, ${pos.x + r * 0.46} ${pos.y + r * 0.25}, ${pos.x + r * 0.42} ${pos.y - r * 0.22} C ${pos.x + r * 0.28} ${pos.y - r * 0.36}, ${pos.x - r * 0.28} ${pos.y - r * 0.36}, ${pos.x - r * 0.42} ${pos.y - r * 0.22} Z`}
            fill={hairFill}
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
        className="bt-jersey"
        style={{ paintOrder: 'stroke fill' }}
      >
        {number || id}
      </text>
      {showName && name && (
        <text
          x={pos.x}
          y={pos.y + r + 12}
          textAnchor="middle"
          fill={isAttacker ? '#fdba74' : '#bfdbfe'}
          fontSize={9}
          fontWeight={700}
          pointerEvents="none"
          stroke="#111827"
          strokeWidth={2.5}
          className="bt-player-name"
          style={{ paintOrder: 'stroke fill' }}
        >
          {name}
        </text>
      )}
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
          {/* Anneau closeout : vert (clean <80px) / orange (desperate 80-159px) /
              rouge (late ≥160px ou over-closeout). */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 5}
            fill="none"
            stroke={
              overClosed ? '#DC2626'
              : closeoutQuality === 'late' ? '#DC2626'
              : closeoutQuality === 'desperate' ? '#F97316'
              : '#22C55E'
            }
            strokeWidth={2.5}
            opacity={0.85}
          />
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 9}
            fill="none"
            stroke={
              overClosed ? '#DC2626'
              : closeoutQuality === 'late' ? '#DC2626'
              : closeoutQuality === 'desperate' ? '#F97316'
              : '#22C55E'
            }
            strokeWidth={1}
            opacity={0.4}
          />
          {(overClosed || closeoutQuality === 'late') && (
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
      {weakSideAnchor && !isAttacker && showStateRings && (
        <text
          x={pos.x - r - 4}
          y={pos.y + r + 12}
          fontSize={11}
          textAnchor="middle"
          pointerEvents="none"
        >
          ⚓
        </text>
      )}
      {rotation && !isAttacker && showStateRings && (
        <text
          x={pos.x + r + 6}
          y={pos.y + 3}
          fontSize={8}
          fontWeight={700}
          fill={ROTATION_BADGE[rotation].color}
          pointerEvents="none"
        >
          {ROTATION_BADGE[rotation].label}
        </text>
      )}
      {transitionRole && transitionRole !== 'match' && !isAttacker && showStateRings && (
        <text
          x={pos.x + r + 6}
          y={pos.y - r + 2}
          fontSize={8}
          fontWeight={700}
          fill={TRANSITION_BADGE[transitionRole].color}
          pointerEvents="none"
        >
          {TRANSITION_BADGE[transitionRole].label}
        </text>
      )}
      {blitzRecovering && !isAttacker && showStateRings && (
        <text
          x={pos.x + r + 12}
          y={pos.y + r + 4}
          fontSize={8}
          fontWeight={700}
          fill="#0EA5A8"
          pointerEvents="none"
        >
          ↩ RECOVER
        </text>
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

/** Repli en transition — badge du rôle (le premier attaquant disponible n'en a pas). */
const TRANSITION_BADGE: Record<Exclude<NonNullable<PlayerProps['transitionRole']>, 'match'>, { label: string; color: string }> = {
  'stop-ball': { label: 'STOP BALLE', color: '#DC2626' },
  'protect-rim': { label: 'PANIER', color: '#2563EB' },
  'feint-retreat': { label: 'FEINTE · RECULE', color: '#B45309' },
  'tandem-drop': { label: 'TOURNE', color: '#7C3AED' },
};

/** P4.4 — badge de l'état de rotation (mémoire de rotation). */
const ROTATION_BADGE: Record<NonNullable<PlayerProps['rotation']>, { label: string; color: string }> = {
  stay: { label: 'GARDE ROLL', color: '#B45309' },
  'help-the-helper': { label: "AIDE L'AIDEUR", color: '#7C3AED' },
  closeout: { label: 'CLOSEOUT', color: '#DC2626' },
  rotate: { label: 'ROTATION', color: '#9333EA' },
  recover: { label: '↩ FIN ROTATION', color: '#0EA5A8' },
  'scramble-back': { label: '⇄ RETOUR', color: '#2563EB' },
};

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
  /** Position du porteur pour ancrer le ballon dans sa main dominante selon son orientation corporelle. */
  carrierPos?: Point;
  /** Orientation du buste du porteur (en degrés depuis le nord, sens horaire). */
  carrierOrientation?: number;
  /** Main dominante du porteur ('right' | 'left'). */
  dominantHand?: 'right' | 'left';
  /** True quand le ballon est en l'air (passe en cours). Visuel renforcé. */
  inFlight?: boolean;
}

export function Ball({ pos, carrierPos, carrierOrientation, dominantHand, inFlight }: BallProps) {
  let p = pos;
  if (!inFlight && carrierPos && carrierOrientation !== undefined) {
    const handSign = dominantHand === 'left' ? -1 : 1;
    const localX = handSign * 16;
    const localY = -16;
    const rad = (carrierOrientation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    p = {
      x: carrierPos.x + localX * cos - localY * sin,
      y: carrierPos.y + localX * sin + localY * cos,
      ...(pos?.z !== undefined ? { z: pos.z } : {}),
    };
  } else if (!p && carrierPos) {
    const handSign = dominantHand === 'left' ? -1 : 1;
    p = { x: carrierPos.x + handSign * 16, y: carrierPos.y - 16 };
  }
  if (!p) return null;

  const hasZ = p.z !== undefined;
  const z = p.z ?? 0;

  // Calcul dynamique de l'ombre portée au sol
  const showShadow = inFlight || (hasZ && z < 25);
  let shadowY = p.y + 14;
  let shadowX = p.x;
  let shadowRx = 6;
  let shadowRy = 2;
  let shadowOpacity = 0.28;

  if (hasZ && inFlight) {
    // En vol : l'ombre reste au sol (y + z), s'élargit et devient plus douce quand le ballon monte
    shadowY = p.y + z + 12;
    shadowX = p.x - z * 0.15; // légère projection lumineuse angulaire
    shadowRx = Math.max(3, 7 * (1 + z / 80));
    shadowRy = Math.max(1, 2.5 * (1 + z / 80));
    shadowOpacity = Math.max(0.08, 0.35 * Math.exp(-z / 60));
  } else if (hasZ) {
    shadowY = p.y + 1.64 * z - 11;
    shadowRx = Math.max(2, 6 * (1 - z / 140));
    shadowRy = Math.max(0.5, 1.5 * (1 - z / 140));
    shadowOpacity = Math.max(0.04, 0.3 * (1 - z / 120));
  }

  // Rayon du ballon avec effet 3D subtil (grossit quand il monte vers la caméra)
  const r = hasZ ? 7.5 + Math.min(3.5, z * 0.035) : (inFlight ? 8.5 : 7.5);
  const seamColor = '#1F140A';

  return (
    <g pointerEvents="none">
      {/* Ombre portée au sol */}
      {showShadow && (
        <ellipse
          cx={shadowX}
          cy={shadowY}
          rx={shadowRx}
          ry={shadowRy}
          fill={`rgba(0,0,0,${shadowOpacity})`}
        />
      )}

      {/* Aura blanche/lumineuse quand le ballon est en vol pour un suivi visuel optimal */}
      {inFlight && (
        <circle
          cx={p.x}
          cy={p.y}
          r={r + 3}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.8}
          opacity={0.85}
        />
      )}

      {/* Ballon stylisé avec nervures de basket et reflet 3D */}
      <g transform={`translate(${p.x}, ${p.y})`}>
        {/* Disque principal du ballon : orange basket éclatant */}
        <circle
          cx={0}
          cy={0}
          r={r}
          fill="#FF6A00"
          stroke={inFlight ? '#FFFFFF' : '#2D1602'}
          strokeWidth={inFlight ? 1.8 : 1.2}
        />

        {/* Nervure centrale verticale */}
        <line
          x1={0}
          y1={-r}
          x2={0}
          y2={r}
          stroke={seamColor}
          strokeWidth={0.9}
        />

        {/* Nervure centrale horizontale */}
        <line
          x1={-r}
          y1={0}
          x2={r}
          y2={0}
          stroke={seamColor}
          strokeWidth={0.9}
        />

        {/* Nervure courbe gauche (arc caractéristique du ballon de basket) */}
        <path
          d={`M ${-r * 0.707} ${-r * 0.707} Q ${-r * 0.22} 0 ${-r * 0.707} ${r * 0.707}`}
          fill="none"
          stroke={seamColor}
          strokeWidth={0.8}
        />

        {/* Nervure courbe droite (arc caractéristique du ballon de basket) */}
        <path
          d={`M ${r * 0.707} ${-r * 0.707} Q ${r * 0.22} 0 ${r * 0.707} ${r * 0.707}`}
          fill="none"
          stroke={seamColor}
          strokeWidth={0.8}
        />

        {/* Reflet de brillance 3D en haut à gauche */}
        <ellipse
          cx={-r * 0.32}
          cy={-r * 0.32}
          rx={r * 0.26}
          ry={r * 0.14}
          transform={`rotate(-40, ${-r * 0.32}, ${-r * 0.32})`}
          fill="#FFFFFF"
          opacity={0.42}
        />
      </g>
    </g>
  );
}
