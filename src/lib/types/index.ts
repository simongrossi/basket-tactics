export type PlayerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type AttackerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5';
export type DefenderId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type PlayerCount = 2 | 3 | 4 | 5;

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
  /** Step édité manuellement par l'utilisateur après génération scénario.
   *  La recompilation du scénario préserve ce step (ne l'écrase pas). */
  manualOverride?: boolean;
  /** Id de la `ScriptedAction` qui a produit ce step. Trace de provenance
   *  utile à l'UI (badge "généré par pick-and-roll"). */
  generatedBy?: string;
  /** Directives défensives pour ce step (Phase 3 défense scriptable).
   *  Posées par compileScenario, consommées par engine.applyDirective. */
  defensiveDirectives?: DefensiveDirective[];
  /** Overrides d'assignation défenseur → attaquant pour ce step.
   *  Posé par compileScenario quand un `pre-switch` swappe deux défenseurs ;
   *  propagé sur tous les steps suivants du parent. */
  assignmentOverrides?: Partial<Record<DefenderId, AttackerId>>;
}

// =============================================================
// Scénario scripté (couche au-dessus de Step[])
// =============================================================
// Le user empile des actions FIBA nommées (ScriptedAction[]) ; un compilateur
// les transforme en Step[] consommable par le moteur d'animation existant.
// Chaque action a son propre type de paramètres ; on les regroupe dans une
// union discriminée pour conserver le typage end-to-end.

export type ScriptedActionType =
  | 'pick-and-roll'
  | 'pick-and-pop'
  | 'hand-off'
  | 'give-and-go'
  | 'basket-cut'
  | 'backdoor-cut'
  | 'flare-cut'
  | 'curl-cut'
  | 'shuffle-cut'
  | 'pin-down'
  | 'flare-screen'
  | 'back-screen'
  | 'cross-screen'
  | 'screen-the-screener'
  | 'drive'
  | 'pass'
  | 'kick-out'
  | 'shoot'
  | 'isolation';

/** Côté de l'action par rapport au porteur (axe = top of the key). */
export type ActionSide = 'fort' | 'faible' | 'axe';
/** Direction d'un drive. */
export type DriveDirection = 'panier' | 'baseline' | 'middle';

export interface ScriptedActionParams {
  ballHandler?: AttackerId;
  screener?: AttackerId;
  cutter?: AttackerId;
  passer?: AttackerId;
  receiver?: AttackerId;
  giver?: AttackerId;
  driver?: AttackerId;
  shooter?: AttackerId;
  from?: AttackerId;
  to?: AttackerId;
  firstScreener?: AttackerId;
  secondScreener?: AttackerId;
  side?: ActionSide;
  direction?: DriveDirection;
}

export interface OffensiveScriptedAction {
  kind: 'offensive';
  id: string;
  type: ScriptedActionType;
  params: ScriptedActionParams;
  /** Override libre de la lecture FR auto-générée. */
  label?: string;
}

export type DefensiveActionType =
  | 'help-and-recover'
  | 'pre-switch'
  | 'trap'
  | 'tag';

export interface DefensiveActionParams {
  /** Défenseur(s) qui exécutent la directive. */
  defenders: DefenderId[];
  /** Attaquant ciblé (porteur trappé, cutter jammé, roller taggé...). */
  target?: AttackerId;
  /** Pour pre-switch uniquement : 2e défenseur qui échange. */
  swapWith?: DefenderId;
  /** Pour help-and-recover : steps de chaque phase. */
  helpStep?: number;
  recoverStep?: number;
}

export interface DefensiveScriptedAction {
  kind: 'defensive';
  id: string;
  type: DefensiveActionType;
  /** Si défini → couplée à une action offensive existante. Sinon → libre. */
  parentActionId?: string;
  /** Steps ciblés. Pour couplée, défaut = tous les steps du parent.
   *  Pour libre, requis (indices absolus dans la liste compilée). */
  affectedSteps?: number[];
  params: DefensiveActionParams;
  label?: string;
}

export type ScriptedAction = OffensiveScriptedAction | DefensiveScriptedAction;

export interface DefensiveDirective {
  type: DefensiveActionType;
  defenders: DefenderId[];
  target?: AttackerId;
  swapWith?: DefenderId;
  /** 'engage' = action active, 'release' = retour à la position standard. */
  phase: 'engage' | 'release';
  /** ID de l'action source (debug + UI traçabilité). */
  sourceActionId: string;
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
   *  position cible pour matérialiser le force.
   *  Conservé comme **delta legacy** (±45° clampé) ajouté au body auto. */
  orientation?: number;
  /** Override manuel du corps en absolu (0–360°). Si défini, écrase l'auto.
   *  Permet au coach de figer une posture spécifique pour un défenseur,
   *  indépendamment de la stance et de la position du ballon. */
  bodyOrientation?: number;
  /** Verrouillage du regard sur une cible dynamique. Le regard suit la
   *  position courante de la cible étape par étape (vs un angle figé) :
   *   - 'opponent'     : regard sur l'homme marqué (matchedTo)
   *   - 'ball-carrier' : regard sur le porteur de balle
   *   - 'both'         : regard sur le midpoint des deux (head-on-swivel)
   *  Si non défini : comportement auto selon la stance.
   *  Le clamp anatomique ±60° du corps reste prioritaire. */
  gazeLock?: 'opponent' | 'ball-carrier' | 'both';
  /** Affiche un cône de champ de vision autour de ce défenseur (heatmap
   *  semi-transparente, ouverture 120° centrée sur le `gazeOrientation`).
   *  Activable individuellement via le menu contextuel. Default false. */
  showFieldOfView?: boolean;
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
  /** Angle horaire du CORPS depuis le nord (0–360°). Calculé automatiquement
   *  par `computeDefenderOrientation` à partir de la stance, du ballon, de
   *  la position de l'homme. Override possible via `rule.bodyOrientation`. */
  orientation: number;
  /** Angle horaire du REGARD depuis le nord. Contraint à ±90° du `orientation`
   *  (corps) — règle anatomique inviolable : on ne peut pas regarder derrière
   *  sa tête. */
  gazeOrientation: number;
  /** Point que le défenseur regarde (sert au triangle pointeur). Cohérent
   *  avec `gazeOrientation` après clamp anatomique. */
  facing: Point;
  /** Cible de la main "côté ballon" (convention B asymétrique). */
  armBallSide: Point;
  /** Cible de la main "côté homme" (convention B asymétrique). */
  armManSide: Point;
  /** Cible "aim" brute de l'aide (avant blend par helpFactor). Pour debug :
   *  visualiser vers quoi le défenseur tend, indépendamment de l'intensité.
   *  Undefined si pas d'aide active ni denial. */
  helpAim?: Point;
  /** Priorité d'aide effective (paint / man / passlane). */
  helpPriority?: HelpPriority;
  /** Catégorie de la branche d'aide qui a produit le résultat (debug). */
  helpKind?: 'sag-weakside' | 'denial-strongside' | 'active-help' | 'none';
}

/** Visuels d'attaquants calculés par étape (convention B + invariants anatomiques). */
export interface ComputedAttacker {
  orientation: number;       // body, 0–360°
  gazeOrientation: number;   // regard, clampé ±90° du corps
  facing: Point;
  armBallSide: Point;
  armManSide: Point;
}
export type ComputedAttackerVisuals = Record<AttackerId, ComputedAttacker>;

export type ComputedDefense = Record<DefenderId, ComputedDefender>;

export type Tool = 'move' | 'pass' | 'dribble' | 'cut' | 'screen';

export interface AppState {
  steps: Step[];
  activeStep: number;
  /** Format de jeu actif : 2x2, 3x3, 4x4 ou 5x5.
   *  Les joueurs hors format restent en mémoire, mais le moteur, les rendus
   *  et les contrôles les ignorent pour éviter tout comportement fantôme. */
  playerCount: PlayerCount;
  defenseInitial: DefenderPositions;
  /** Phase 3 — active l'application des directives défensives scriptées
   *  (step.defensiveDirectives) par l'engine. Default true. */
  defenseScriptedDirectivesEnabled?: boolean;
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
  /** Toggles globaux du champ de vision (cônes heatmap). Tous combinés en
   *  OR logique avec les toggles individuels `rule.showFieldOfView` :
   *  - `showFieldOfViewAll` : active TOUS les joueurs (défenseurs + attaquants)
   *    en un clic. Implique les deux sous-toggles ci-dessous.
   *  - `showFieldOfViewAllDefenders` : active uniquement les 5 défenseurs.
   *  - `showFieldOfViewAllAttackers` : active uniquement les 5 attaquants.
   *  Quand plusieurs cônes se superposent, l'opacité s'accumule naturellement
   *  (heatmap croisée). */
  showFieldOfViewAll?: boolean;
  showFieldOfViewAllDefenders?: boolean;
  showFieldOfViewAllAttackers?: boolean;
  /** Overrides manuels d'orientation par attaquant (clic-droit → sliders).
   *  Si défini, écrase le calcul auto de `computeAttackerOrientation`
   *  (porteur → panier, idle → ballon, etc.). Le `gaze` reste clampé à
   *  ±60° du `body` effectif (règle anatomique cône de vision). */
  attackerOrientations?: Partial<Record<AttackerId, { body?: number; gaze?: number }>>;
  /** Vue debug d'aide défensive : pour chaque défenseur dont helpFactor>0.10,
   *  une flèche depuis sa position vers son `helpAim` avec un badge `xx%`
   *  et un tag de priorité (paint/man/passlane). Inclut aussi les rotations
   *  PnR (tag/x-out/stunt) avec couleur dédiée. Outil pour comprendre/debug
   *  la logique défensive — pas un visuel coach. */
  showHelpDebug?: boolean;
  /** Toggles fine-grained sur les indicateurs auto. Default true partout —
   *  ces visuels sont normalement utiles. Le coach peut désactiver pour
   *  alléger la vue (ex : présentation, capture playbook). */
  showSwitchMatchups?: boolean;
  showScreenIndicators?: boolean;
  showStateRings?: boolean;
  showLockBadges?: boolean;
  /** Toggles fine sur les sous-visuels — chacun est combiné en ET logique
   *  avec son master (par ex. `showLateRing && showStateRings`). Default
   *  true partout pour préserver l'UX existante. Permettent au coach de
   *  masquer un visuel précis sans tout couper. */
  showZoneTracking?: boolean;
  showContestedPass?: boolean;
  showBlockedPass?: boolean;
  showOffBallScreenIndicator?: boolean;
  showLateRing?: boolean;
  showCloseoutRing?: boolean;
  showDenyingRing?: boolean;
  showForcedScreenerBadge?: boolean;
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
  /** Scénario scripté optionnel. Quand non-vide, ses actions sont compilées
   *  en `steps[]` (les steps marqués `manualOverride` sont préservés). Le
   *  user peut basculer entre saisie manuelle et scénario via l'UI. */
  scriptedActions?: ScriptedAction[];
}
