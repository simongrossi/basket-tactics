export type PlayerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type AttackerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5';
export type DefenderId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface Point {
  x: number;
  y: number;
}

export interface Positions<K extends string> {
  [id: string]: Point;
}

export type AttackerPositions = Record<AttackerId, Point>;
export type DefenderPositions = Record<DefenderId, Point>;

export type DominantHand = 'right' | 'left';
export type AttackerHands = Record<AttackerId, DominantHand>;

/**
 * Profil offensif de l'attaquant. Sert au moteur pour moduler les décisions
 * défensives basées sur la dangerosité réelle (un shooter qu'on quitte coûte
 * cher ; un non-shooter qu'on laisse libère un défenseur pour la raquette).
 *
 * - `creator`     : meneur/créateur (handle, vision). Tirs corrects, surtout pénétration.
 * - `shooter`     : tireur extérieur (3pts fiable). À NE PAS quitter sur skip pass.
 * - `slasher`     : pénétrant (drive, finition). Tirs intérieurs > extérieurs.
 * - `rim-roller`  : pivot rouleur (5/4 classique). Menace = course au cercle après écran.
 * - `stretch-big` : intérieur shooter (4 stretch). Doit être suivi à 3pts.
 * - `non-shooter` : tireur médiocre/limité. On peut sagger, le laisser ouvert à 3pts.
 */
export type OffensiveProfile =
  | 'creator'
  | 'shooter'
  | 'slasher'
  | 'rim-roller'
  | 'stretch-big'
  | 'non-shooter';

export type AttackerProfiles = Record<AttackerId, OffensiveProfile>;

export type AnnotationType = 'pass' | 'dribble' | 'cut' | 'screen';

export interface Annotation {
  type: AnnotationType;
  fromId: AttackerId;
  toId?: AttackerId | null;
  from: Point;
  to: Point;
}

export interface Step {
  off: AttackerPositions;
  ballCarrier: AttackerId;
  annotations: Annotation[];
  switches?: [DefenderId, DefenderId][];
  label?: string;
  /** Positions imposées par l'utilisateur (drag manuel). Surchargent les
   *  positions calculées par le moteur pour cette étape. */
  defenseOverrides?: Partial<Record<DefenderId, Point>>;
  /** Override de l'auto-detection d'écran porteur : l'utilisateur impose
   *  cet attaquant comme poseur, peu importe sa position. */
  forcedScreener?: AttackerId;
}

export type HelpPriority = 'paint' | 'man' | 'passlane';
export type CarrierBehavior = 'coller' | 'bumper' | 'contester' | 'reculer' | 'topside' | 'baseline';
export type OffBallStance = 'sag' | 'deny-3q' | 'fronting' | 'behind' | 'stunt';
/** Comportement d'aide individuel.
 *  - 'auto' (default) : sideFactor standard (1 weak-side, 0.7 neutre, 0.35 strong-side)
 *  - 'aggressive' : ignore le côté (sideFactor toujours 1, aide même strong-side)
 *  - 'passive' : sideFactor × 0.5 (aide molle, garde son homme plus longtemps)
 *  - 'disabled' : n'aide jamais (helpFactor=0, ignore aussi le sag baseline) */
export type HelpMode = 'auto' | 'aggressive' | 'passive' | 'disabled';
/** Override individuel de la règle d'écran porteur. 'auto' suit la règle globale. */
export type OnScreenNav = 'auto' | 'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz';

export interface DefenderRule {
  helpPct: number;
  priority: HelpPriority;
  vsCarrier: CarrierBehavior;
  offBallStance?: OffBallStance;
  screenNav?: OnScreenNav;
  /** Override individuel de `state.closeoutBoost`. Undefined = utilise le
   *  réglage global. Permet d'avoir un D5 qui closeout mou (×1.1) et un D1
   *  qui closeout agressif (×1.8). Range 1–2. */
  closeoutBoost?: number;
  /** Override individuel de `state.denyAggressiveness`. Undefined = global.
   *  Range 0–1. */
  denyAggressiveness?: number;
  /** Override individuel de `state.defenseDistance` (distance défenseur
   *  ↔ son homme). Undefined = global. Permet d'avoir un défenseur
   *  collant (10) et un autre plus distant (60). */
  distance?: number;
  /** Override individuel de `state.defenseMaxSpeed` (distance max parcourue
   *  par étape). Undefined = global. Modélise la vitesse réelle du joueur :
   *  un pivot lent (60-80) sera souvent en retard sur les rotations, un
   *  meneur rapide (130-160) atteint sa cible plus souvent à temps. */
  maxSpeed?: number;
  /** Comportement d'aide du défenseur. Default 'auto'. Voir `HelpMode`. */
  helpMode?: HelpMode;
  /** Rotation du corps du défenseur en degrés (range -90 à +90, default 0).
   *  0 = neutre (bras symétriques au-dessus, convention FIBA). Positif =
   *  rotation horaire (épaule droite avancée, ferme le côté droit).
   *  Négatif = anti-horaire. Applique aussi un petit offset latéral à la
   *  position cible pour matérialiser le force. */
  orientation?: number;
}

export type DefenderRules = Record<DefenderId, DefenderRule>;

export interface DefenseTriggers {
  drive: boolean;
  post: boolean;
  paint: boolean;
  /** Active la prise à deux automatique quand le porteur entre dans une zone
   *  de trappe (coins fond + ligne de touche). Indépendant du système d'écran. */
  trap?: boolean;
}

export interface DetectedTriggers extends DefenseTriggers {
  any: boolean;
}

export type ScreenRule =
  | 'over'           // défenseur passe par-dessus l'écran (chase shooter)
  | 'under'          // défenseur passe sous l'écran (laisser tirer mid)
  | 'switch'         // les deux défenseurs échangent d'homme
  | 'hedge'          // défenseur du screener montre puis recover
  | 'drop'           // défenseur du screener tient en retrait, protège raquette
  | 'blitz'          // les deux défenseurs forment un piège sur le porteur
  | 'ice'            // force le porteur baseline (no-middle, side PnR)
  | 'weak'           // under léger, recover vite sur shooter (vs non-shooter handler)
  | 'peel-switch';   // drop initial puis switch quand porteur dépasse screenerDef
export type DropDepth = 'shallow' | 'medium' | 'deep';

// --- Défense de zone (Palier 3-C) ---

export type DefenseSystem = 'man' | 'zone';
export type ZoneType = 'zone-2-3' | 'zone-1-3-1' | 'zone-3-2' | 'zone-2-1-2' | 'zone-matchup';

export type ZoneRegionMode = 'auto' | 'agressif' | 'passif' | 'trap';

export interface ZoneRegion {
  id: string;
  label: string;
  polygon: Point[];
  homePos: Point;
  assignedTo: DefenderId;
  /** Rayon de responsabilité étendu (px). Override le défaut 200. */
  radius?: number;
  /** Comportement de la région. 'auto' (default) = tracking continu standard.
   *  'agressif' = sortir vite et fort (engagement boosté).
   *  'passif' = rester près du home, sortir mou (engagement réduit).
   *  'trap' = piéger le porteur s'il entre dans la région (full track + offset
   *  agressif vers le ballon). */
  mode?: ZoneRegionMode;
}

export type ZoneLayout = ZoneRegion[];

/** Override par région (keyed by region.id). Persiste dans AppState. */
export interface ZoneRegionOverride {
  homePos?: Point;
  radius?: number;
  mode?: ZoneRegionMode;
  /** Polygone redessiné (drag des sommets, ajout/suppression). Liste de
   *  points ordonnés. Si défini, remplace complètement le polygone par
   *  défaut. Min 3 sommets. */
  polygon?: Point[];
}

export type ZoneOverrides = Record<string, ZoneRegionOverride>;

export interface ZoneConfig {
  type: ZoneType;
  ballPressure: number;
  rotationSpeed: number;
  trapCorners: boolean;
  extendTo3pt: boolean;
  /** Décalage vertical (en px) appliqué à toutes les zones — positif = vers le
   *  milieu de terrain, négatif = vers le panier. Permet de "remonter" ou
   *  "redescendre" la zone selon la philosophie défensive. */
  verticalOffset?: number;
}

// --- Écrans non-porteur (Palier 4) ---

export type OffBallScreenType =
  | 'pindown'      // écran descendant (screener au-dessus du cutter)
  | 'flare'        // écran latéral, cutter sort vers l'extérieur
  | 'backscreen'   // screener sous le cutter, cutter coupe vers le panier
  | 'stagger'      // 2 écrans descendants alignés (enchaînement)
  | 'elevator'     // 2 screeners qui se referment derrière le cutter
  | 'flex'         // backscreen baseline, cutter va corner→corner
  | 'hammer';      // cutter baseline arrière (de l'autre côté du ballon)

export interface DetectedOffBallScreen {
  type: OffBallScreenType;
  screener: AttackerId;
  screenerDef: DefenderId;
  cutter: AttackerId;
  cutterDef: DefenderId;
  screenerPos: Point;
  cutterPos: Point;
  /** Pour stagger/elevator : second poseur d'écran fusionné. Présent
   *  uniquement si l'enchaînement est détecté. */
  secondScreener?: AttackerId;
  secondScreenerDef?: DefenderId;
  secondScreenerPos?: Point;
}

export type OffBallScreenRule =
  | 'over'      // défenseur passe par-dessus l'écran
  | 'under'     // défenseur passe en dessous (laisse le tir)
  | 'switch'    // les deux défenseurs échangent d'homme
  | 'bump'      // défenseur du screener bumpe le cutter
  | 'top-lock'  // défenseur saute par-dessus + contact préventif côté ballon
  | 'chase';    // défenseur reste collé au cutter en suiveur (jamais sous)

export interface DetectedScreen {
  screener: AttackerId;
  screenerDef: DefenderId;
  carrier: AttackerId;
  carrierDef: DefenderId;
  screenerPos: Point;
}

export type Matchups = Record<DefenderId, AttackerId>;

export interface ComputedDefender {
  x: number;
  y: number;
  late: boolean;
  helpFactor: number;
  isCarrierDefender: boolean;
  matchedTo: AttackerId;
  onScreen: boolean;
  switchedThisStep: boolean;
  zoneId?: string;
  isRotating?: boolean;
  /** Le défenseur est en closeout sur cette transition (le ballon vient
   *  d'arriver sur son homme, il accélère pour fermer la distance). */
  closingOut?: boolean;
  /** Le défenseur est en over-closeout : closeout sur cette transition ET
   *  l'attaquant en a profité pour driver vers le panier. Modélise le
   *  risque "il s'est fait déborder". */
  overClosed?: boolean;
  /** Le défenseur applique un strong-side denial automatique (glisse vers la
   *  ligne de passe). Utilisé pour différencier visuellement du ring "help"
   *  classique côté faible. */
  denying?: boolean;
  /** L'aide vient d'un trigger actif (drive/post/paint), par opposition au
   *  sag baseline weak-side passif. Permet à HelpLines de différencier visuellement. */
  helpTriggered?: boolean;
  /** Rôle de rotation PnR à cette étape (P1) :
   *  - `tag` : low-man qui tag le roller
   *  - `x-out` : défenseur qui couvre l'homme du low-man parti tagger
   *  - `stunt` : faux mouvement vers le porteur depuis le nail
   *  Permet de tracer un anneau spécifique pour le coach. */
  pnrRole?: 'tag' | 'x-out' | 'stunt';
}

export type ComputedDefense = Record<DefenderId, ComputedDefender>;

export type Tool = 'move' | 'pass' | 'dribble' | 'cut' | 'screen';

export interface AppState {
  steps: Step[];
  activeStep: number;
  defenseInitial: DefenderPositions;
  defenseDistance: number;
  defenseMaxSpeed: number;
  triggers: DefenseTriggers;
  rules: DefenderRules;
  screenRule: ScreenRule;
  screenRadius: number;
  dropDepth: DropDepth;
  showHelpLines: boolean;
  showMatchups: boolean;
  tool: Tool;
  defenseSystem: DefenseSystem;
  zoneConfig: ZoneConfig;
  offBallScreenRule: OffBallScreenRule;
  fullCourt: boolean;
  showPassLanes: boolean;
  /** Mode fantôme : affiche en transparence les positions de l'étape N-1
   *  pendant l'édition de l'étape N. Visualise les vecteurs de déplacement. */
  showGhosts?: boolean;
  /** Affiche les badges numérotés 1/2/3… sur les actions de l'étape active
   *  (vue d'édition). Utile pour lire la séquence sans switcher d'étape. */
  showActionOrder?: boolean;
  /** Calque heatmap qui surligne en jaune/orange/rouge les zones non-défendues
   *  (faible pression défensive cumulée). Aide à voir d'un coup d'œil les
   *  espaces ouverts pour passe ou tir. */
  showHeatmap?: boolean;
  /** Affiche un anneau et un badge % autour de chaque attaquant indiquant
   *  son score de menace (probabilité de marquer s'il devient l'option
   *  offensive). Phase A de la simulation Monte Carlo. */
  showThreats?: boolean;
  /** Affiche la meilleure action offensive (tir / drive / passe) calculée
   *  par évaluation des EV. Phase B. Indépendant de showThreats. */
  showBestAction?: boolean;
  /** Toggles fine-grained sur les indicateurs auto. Default true partout —
   *  ces visuels sont normalement utiles. Le coach peut désactiver pour
   *  alléger la vue (ex : présentation, capture playbook). */
  showSwitchMatchups?: boolean;
  showScreenIndicators?: boolean;
  showStateRings?: boolean;
  showLockBadges?: boolean;
  /** Multiplicateur de vitesse appliqué au défenseur du nouveau porteur en
   *  closeout. 1 = closeout désactivé, 1.4 = défaut, 2 = très agressif. */
  closeoutBoost?: number;
  /** Intensité max du strong-side denial automatique. 0 = désactivé,
   *  0.45 = défaut, 0.7 = très agressif (full denial assumé). */
  denyAggressiveness?: number;
  /** Sens d'attaque : 'up' (panier visé = HOOP top, défaut) ou 'down' (panier
   *  visé = HOOP_OPPOSITE bottom). Utile en mode fullCourt pour modéliser le
   *  repli/contre-attaque. La défense de zone n'est pas encore directionnelle. */
  attackingDirection?: 'up' | 'down';
  /** Main dominante de chaque attaquant (default 'right'). Information de
   *  scouting pour le coach — le moteur ne la consomme pas pour l'instant.
   *  Utile pour décider manuellement de l'orientation des défenseurs. */
  attackerHands?: AttackerHands;
  /** Profil offensif de chaque attaquant. Module la qualité de tir, la
   *  receivability et le comportement défensif (closeout, aide, diagnostics).
   *  Default : O1=creator, O2/O3=shooter, O4=rim-roller, O5=stretch-big. */
  attackerProfiles?: AttackerProfiles;
  /** Overrides par région de zone (homePos déplacé, radius, mode). Keyed
   *  par region.id. Persistant à travers les types de zone. */
  zoneOverrides?: ZoneOverrides;
  /** Mode édition zones : active l'overlay interactif (drag des homePos +
   *  clic sur les labels pour ouvrir le popup de réglage par région). */
  zoneEditMode?: boolean;
}
