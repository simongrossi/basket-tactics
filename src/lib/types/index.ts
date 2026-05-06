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
/** Override individuel de la règle d'écran porteur. 'auto' suit la règle globale. */
export type OnScreenNav = 'auto' | 'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz';

export interface DefenderRule {
  helpPct: number;
  priority: HelpPriority;
  vsCarrier: CarrierBehavior;
  offBallStance?: OffBallStance;
  screenNav?: OnScreenNav;
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

export type ScreenRule = 'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz';
export type DropDepth = 'shallow' | 'medium' | 'deep';

// --- Défense de zone (Palier 3-C) ---

export type DefenseSystem = 'man' | 'zone';
export type ZoneType = 'zone-2-3' | 'zone-1-3-1' | 'zone-3-2' | 'zone-2-1-2' | 'zone-matchup';

export interface ZoneRegion {
  id: string;
  label: string;
  polygon: Point[];
  homePos: Point;
  assignedTo: DefenderId;
}

export type ZoneLayout = ZoneRegion[];

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

export type OffBallScreenType = 'pindown' | 'flare' | 'backscreen';

export interface DetectedOffBallScreen {
  type: OffBallScreenType;
  screener: AttackerId;
  screenerDef: DefenderId;
  cutter: AttackerId;
  cutterDef: DefenderId;
  screenerPos: Point;
  cutterPos: Point;
}

export type OffBallScreenRule = 'over' | 'under' | 'switch' | 'bump';

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
  /** Le défenseur applique un strong-side denial automatique (glisse vers la
   *  ligne de passe). Utilisé pour différencier visuellement du ring "help"
   *  classique côté faible. */
  denying?: boolean;
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
  /** Sens d'attaque : 'up' (panier visé = HOOP top, défaut) ou 'down' (panier
   *  visé = HOOP_OPPOSITE bottom). Utile en mode fullCourt pour modéliser le
   *  repli/contre-attaque. La défense de zone n'est pas encore directionnelle. */
  attackingDirection?: 'up' | 'down';
}
