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
  /** Points intermédiaires (hors `from`/`to`) pour trajectoires non
   *  rectilignes : V-cut, L-cut, démarquage aller-retour, courbe libre.
   *  Concaténés avec `from` et `to` en polyline ordonnée et interpolés en
   *  spline Catmull-Rom à la lecture. Absent ou vide = ligne droite. */
  waypoints?: Point[];
  /** Phase temporelle de l'action pour les annotations de mouvement
   *  (cut/screen/dribble) — Étape 9.
   *  - 'end' (défaut) : le joueur se déplace PENDANT cette étape, arrive
   *    à `to` à la FIN. L'effet (ex: écran posé) est actif à partir de
   *    l'étape suivante.
   *  - 'start' : le joueur est DÉJÀ à `to` au début de cette étape. Le
   *    mouvement a eu lieu pendant la transition précédente. L'effet est
   *    actif IMMÉDIATEMENT durant cette étape.
   *  Indéfini = 'end' (rétrocompatibilité). */
  phase?: 'start' | 'end';
  /** Bornes temporelles de l'action dans le segment de transition entre
   *  deux étapes — Étape 10 (édition continue, façon vidéo).
   *  - `tStart` (défaut 0) : moment où le mouvement commence (0 = début
   *    de la transition, 1 = fin)
   *  - `tEnd`   (défaut 1) : moment où le mouvement se termine
   *  Permet à des actions parallèles d'avoir des durées différentes :
   *  ex. O3 fait son écran [0, 0.4], O1 dribble [0.3, 1.0]. Modifiable
   *  par drag des bords des segments dans MultiTrackTimeline. */
  tStart?: number;
  tEnd?: number;
  /** Qualité d'écran (0-100) — Étape 12. Utilisé uniquement pour les
   *  annotations type='screen'. Module la pénalité de vitesse appliquée
   *  au défenseur du porteur :
   *  - 0 (ghost) : pas de ralentissement, faux écran
   *  - 25 (loose) : léger frottement (~0.2s perdues)
   *  - 50 (standard, défaut) : ralentissement modéré (~0.5s)
   *  - 75 (solid) : écran tight (~0.8s)
   *  - 100 (lockdown) : D1 quasi-stoppé (~1.2s)
   *  Indéfini = 50. */
  quality?: number;
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
  /** Step inséré par breakUpTeleports() pour lisser un mouvement trop grand
   *  entre deux steps "réels". L'UI peut les masquer ou les afficher en grisé,
   *  ne pas les considérer pour le matching manualOverride, etc. Les positions
   *  sont interpolées linéairement. */
  isInterpolated?: boolean;
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
  | 'isolation'
  // ---------- Tier 2 — Cuts ----------
  | 'flash-cut'
  | 'flex-cut'
  | 'i-cut'
  | 'popout-cut'
  | 'shallow-cut'
  | 'ucla-cut'
  | 'v-cut'
  | 'l-cut'
  | 'banana-cut'
  | 'iverson-cut'
  // ---------- Tier 2 — Off-ball screens ----------
  | 'staggered-screen'
  | 'elevator-screen'
  | 'hammer-screen'
  | 'ram-screen'
  | 'wide-screen'
  | 'wiper-screen'
  | 'screen-away'
  // ---------- Tier 2 — PnR variants ----------
  | 'slip'
  | 'reject'
  | 'drag-screen'
  | 'step-up-screen'
  | 'ghost-screen'
  // ---------- Tier 2 — Combinations ----------
  | 'zoom-action'
  | 'rip-dho'
  | 'slide-action'
  | 'split-action'
  | 'high-low-action'
  // ---------- Tier 2 — Replacements ----------
  | 'drift'
  | 'lift'
  | 'replacement'
  // ---------- Tier 3 — Sets (entrées de jeu) ----------
  | 'horns-set'
  | 'floppy-set'
  | 'pistol-set'
  | 'ucla-set'
  | 'iverson-set'
  | 'diamond-set'
  | 'chicago-set'
  | 'loop-set'
  | 'america-set';

/** Côté de l'action par rapport au porteur (axe = top of the key). */
export type ActionSide = 'fort' | 'faible' | 'axe';
/** Direction d'un drive. */
export type DriveDirection = 'panier' | 'baseline' | 'middle';

// ZoneRef est défini dans `lib/data/courtZones`. On utilise un import de type
// (`import type`) pour éviter une dépendance d'exécution circulaire — types est
// la racine du graphe et courtZones consomme déjà `Point` d'ici.
import type { ZoneRef } from '@/lib/data/courtZones';

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
  /** Zone de destination du cutter / driver (FIBA / NBA, absolue ou fort/faible). */
  targetZone?: ZoneRef;
  /** Zone où le screener vient poser son écran. */
  screenZone?: ZoneRef;
  /** Zone d'origine (pour replacement / fill / drift / lift). */
  fromZone?: ZoneRef;
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
  | 'tag'
  // Phase 5 — couvertures FIBA Tier 2
  | 'over'
  | 'under'
  | 'switch'
  | 'hedge'
  | 'drop'
  | 'blitz'
  | 'ice'
  | 'flat-hedge'
  | 'peel-switch'
  | 'triple-switch'
  | 'closing-out';

export interface DefensiveActionParams {
  /** Défenseur(s) qui exécutent la directive. */
  defenders: DefenderId[];
  /** Attaquant ciblé (porteur trappé, cutter jammé, roller taggé...). */
  target?: AttackerId;
  /** Pour pre-switch / switch / peel-switch : 2e défenseur qui échange. */
  swapWith?: DefenderId;
  /** Pour triple-switch : 3e défenseur de la chaîne (D1→D2→D3→D1). */
  thirdSwap?: DefenderId;
  /** Pour help-and-recover : steps de chaque phase. */
  helpStep?: number;
  recoverStep?: number;
  /** Pour drop : profondeur du retrait du big (cf. FIBA ScreenRule). */
  dropDepth?: 'shallow' | 'medium' | 'deep';
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

/**
 * Branche manuelle de scénario (Étape 7) — variante terminale qui diverge du
 * chemin principal après une action donnée. Le coach définit plusieurs branches
 * pour montrer différentes lectures possibles (drop, switch, trap, etc.).
 *
 * V1 : un seul niveau (pas de sous-branches). Le chemin principal joue
 * normalement ; une branche active remplace les actions suivantes après le
 * point de divergence.
 */
export interface ScenarioBranch {
  id: string;
  label: string;
  /** Id de la `ScriptedAction` (du chemin principal) après laquelle la
   *  branche prend le relais. Les steps de cette action incluse sont
   *  joués, puis la branche démarre. */
  divergeAfterActionId: string;
  /** Suite alternative d'actions (offensives ou défensives). */
  actions: ScriptedAction[];
}

export interface DefensiveDirective {
  type: DefensiveActionType;
  defenders: DefenderId[];
  target?: AttackerId;
  swapWith?: DefenderId;
  thirdSwap?: DefenderId;
  dropDepth?: 'shallow' | 'medium' | 'deep';
  /** 'engage' = action active, 'release' = retour à la position standard. */
  phase: 'engage' | 'release';
  /** ID de l'action source (debug + UI traçabilité). */
  sourceActionId: string;
}

export type HelpPriority = 'paint' | 'man' | 'passlane';
export type CarrierBehavior = 'coller' | 'bumper' | 'contester' | 'reculer' | 'topside' | 'baseline';
export type OffBallStance = 'sag' | 'deny-3q' | 'fronting' | 'behind' | 'stunt';
export type BodyOrientationMode =
  | 'auto'
  | 'open'
  | 'face-man'
  | 'face-ball'
  | 'pass-lane-flat'
  | 'pass-lane-perp';
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
  /** QI défensif d'anticipation (0-100, défaut 50). Module la capacité du
   *  défenseur à lire le jeu et anticiper la trajectoire de l'attaquant
   *  pendant la phase de recovery (après un écran notamment). Trois logiques
   *  combinées (cf. anticipationTarget dans screenPhysics.ts) :
   *  - Lookahead : vise la position FUTURE du porteur
   *  - Basket-line bias : retourne sur l'axe ball-you-man
   *  - Interception : résout le point de croisement optimal
   *  À 0 : pure réaction (cible la position courante). À 100 : pleinement
   *  anticipatif. Défaut 50 = équilibre. */
  anticipation?: number;
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
  /** Consigne tactique d'orientation du corps. Undefined/'auto' suit la stance
   *  (sag, deny, fronting...). Les modes ligne de passe orientent le corps par
   *  rapport à l'axe porteur→homme marqué. Écrasé par `bodyOrientation`. */
  bodyOrientationMode?: BodyOrientationMode;
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
  /** Force avec laquelle la zone ferme un attaquant seul à la tête de raquette
   *  ou en short-corner (zones-tueuses).
   *  0 = aucun boost (l'attaquant est traité comme un attaquant normal).
   *  50 = comportement par défaut (boost ×4 sur le couvreur désigné).
   *  100 = boost agressif (×6) + bias home maximal — le couvreur sort très
   *  fort de sa zone naturelle.
   *  Indéfini = 50 (comportement actuel par défaut). */
  paintCoverage?: number;
  /** Force avec laquelle la zone ferme un attaquant qui a un couloir libre
   *  vers le panier ("pas d'easy basket"). À chaque step, si un attaquant
   *  proche du panier (<220px) n'a aucun défenseur sur sa trajectoire, le
   *  défenseur le plus proche du panier est désigné rim-protector et boosté.
   *  0 = désactivé. 50 = défaut. 100 = ferme très agressivement.
   *  Indéfini = 50. */
  rimProtection?: number;
  /** Force avec laquelle la zone ferme une ligne de passe ouverte depuis le
   *  porteur. Pour chaque attaquant dont la ligne de passe carrier→att n'est
   *  pas contestée (aucun défenseur à <60px du segment), un défenseur est
   *  désigné couvreur et tiré vers le point d'interception.
   *  0 = aucune réaction. 50 = défaut. 100 = pression skipée maximale.
   *  Indéfini = 50. */
  passDenial?: number;
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

export type ScreenContactPhase = 'approach' | 'impact' | 'stuck' | 'navigate' | 'recover';

export type Matchups = Record<DefenderId, AttackerId>;

export interface ComputedDefender {
  x: number;
  y: number;
  late: boolean;
  helpFactor: number;
  isCarrierDefender: boolean;
  matchedTo: AttackerId;
  onScreen: boolean;
  screenPhase?: ScreenContactPhase;
  switchedThisStep: boolean;
  /** Severity du mismatch entre ce défenseur et son matchup actuel.
   *  |defenderRank - attackerRank| dans [0..4]. 0 = matchup naturel
   *  (D2 sur O2). ≥2 = mismatch tactique à traiter. Recalculé à chaque
   *  step après application des switchs / scrams. Visualisation : badge
   *  ⚠ orange/rouge sur le sprite quand severity ≥ 2.
   *  Cf. `defense/mismatchTracking.ts`. */
  mismatchSeverity?: number;
  /** Vrai si CE step a appliqué un scram switch (3ᵉ échange correctif)
   *  qui implique ce défenseur. Le défenseur a soit pris le mismatch
   *  (`to` du scram) soit s'en est délesté (`from`). */
  scrammedThisStep?: boolean;
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
  /** Angle horaire du REGARD depuis le nord. Contraint à ±60° du `orientation`
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
  gazeOrientation: number;   // regard, clampé ±60° du corps
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
  /** Active le SCRAM SWITCH automatique : après un switch porteur qui crée
   *  un mismatch ≥ `mismatchThreshold`, un défenseur tiers proche prend
   *  l'attaquant exposé. Default `false` (opt-in) pour préserver l'historique
   *  des scénarios sauvegardés. Cf. `defense/mismatchTracking.ts`. */
  scramSwitchEnabled?: boolean;
  /** B8 — politique de switch au niveau team. Filtre additionnel par-dessus
   *  `screenRule` : même si la rule globale est 'switch', le filtre peut
   *  bloquer l'application si les défenseurs concernés ne sont pas autorisés.
   *  - 'all'  : switch tous matchups (default)
   *  - '1-3'  : switch seulement si les deux défenseurs sont rank ≤ 3 (guards/wings)
   *  - '1-4'  : switch sauf si l'un des deux est le pivot (D5)
   *  - 'none' : jamais switcher (override la rule 'switch' → no-op)
   *  Le filtre ne s'applique QUE quand la rule effective est 'switch' ou
   *  'peel-switch'. Default 'all' (équivalent ancien comportement). */
  switchPolicy?: 'all' | '1-3' | '1-4' | 'none';
  /** B10 — bump auto sur cutters. Quand un cut hors-ballon est détecté, un
   *  défenseur sur la trajectoire (≤ 40px de la ligne prev→cur) reçoit un
   *  offset de 12px vers le cutter. Filet de sécurité pour les cuts non
   *  marqués. Default false (opt-in). Cf. `defense/cutterBumpLayer.ts`. */
  autoBumpCutters?: boolean;
  /** B6 — couverture défensive auto sur post-up.
   *  - 'none'   : laisser le défenseur naturel en 1c1 (default, rétrocompat)
   *  - 'dig'    : un défenseur 'low man' fait 30% du chemin vers le pivot
   *               (faux help, recover naturel à l'étape suivante)
   *  - 'double' : un défenseur reste à mi-chemin pour doubler activement
   *  Le trigger `state.triggers.post` doit aussi être activé pour que la
   *  couverture s'applique (deux switches indépendants : détection + réaction). */
  postCoverage?: 'none' | 'dig' | 'double';
  /** B2 V2 — Quand un reject screen SHARP est détecté (porteur vire opposé
   *  net, awayness ≤ -0.7), la défense relâche la couverture sur-anticipée :
   *  l'écran est traité comme inexistant pour ce step, retour à l'individuel
   *  pur. Default false (opt-in). */
  unwindRejectedScreens?: boolean;
  /** B4 V2 — Quand un snake dribble est détecté (V sur 3 steps), la défense
   *  maintient son engagement sur le poseur pendant la retraite intermédiaire
   *  (pas de re-arm à zéro). Pratiquement : on force la couverture du
   *  step N à utiliser screen=screen-detected-at-N-2. Default false (opt-in). */
  snakeKeepCoverage?: boolean;
  /** Seuil de severity à partir duquel un switch est considéré comme un
   *  mismatch tactique (déclenche scram + diagnostic coach + badge visuel).
   *  Range 1..4. Default 2 (= D5 sur O3 minimum). */
  mismatchThreshold?: number;
  /** Master switch pour les badges visuels mismatch + SCRAM (B1). Default
   *  true. Désactiver pour alléger le rendu pendant une présentation. */
  showMismatchBadges?: boolean;
  /** B3 — agressivité du hedge sur écran porteur (0..100). Module la
   *  distance à laquelle D5 sort sur le porteur quand `screenRule === 'hedge'` :
   *  0 = soft show (D5 retourne vite sur son homme), 50 = standard,
   *  100 = hard hedge (D5 plaqué devant O1, barricade physique). Default 50.
   *  Axe INDÉPENDANT de la `quality` de l'écran : un excellent écran avec
   *  soft show reste timide, un écran moyen avec hard hedge sort agressif. */
  hedgeAggression?: number;
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
  /** Affiche le bandeau "Lecture coach" sous la timeline (warnings keyframes,
   *  diagnostics tactiques, lectures offensives). Default `true`. Masqué via
   *  Paramètres > VISU & LÉGENDE > "lecture coach" — utile pour stabiliser
   *  le layout vertical (le bandeau grandit avec le nombre de warnings et
   *  réduit la place du terrain). */
  showCoachDiagnostics?: boolean;
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
  /** Durée d'une étape en secondes (Étape 13). Sert à afficher le temps
   *  écoulé et le temps restant sur la possession (24s en FIBA, 14s en
   *  reset après rebond offensif). Défaut 4. Modifie uniquement
   *  l'affichage — le moteur reste step-based. */
  secondsPerStep?: number;
  /** Durée totale de la possession en secondes pour l'affichage shot clock
   *  (Étape 13). Défaut 24. Permet aussi d'afficher 14 pour les resets. */
  possessionSeconds?: number;
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
  /** Branches manuelles du scénario (Étape 7). Variantes terminales qui
   *  divergent après une action donnée. V1 : un seul niveau. */
  scenarioBranches?: ScenarioBranch[];
  /** Id de la branche actuellement affichée ; null/undefined = chemin
   *  principal. Le compilateur utilise cette valeur pour décider de la
   *  suite après le point de divergence. */
  activeBranchId?: string | null;
  /** Inclure les variantes dans le PDF playbook (une section par variante
   *  après le chemin principal). Indéfini = false par défaut. */
  pdfIncludeBranches?: boolean;
}
