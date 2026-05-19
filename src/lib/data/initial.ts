import type {
  AttackerPositions,
  DefenderPositions,
  DefenderRules,
  Matchups,
  AppState,
  Step,
  Annotation,
} from '../types';
import {
  DEFAULT_DEFENSE_DISTANCE_PX,
  DEFAULT_DEFENSE_MAX_SPEED_PX,
  DEFAULT_SCREEN_RADIUS_PX,
  DEFAULT_CLOSEOUT_BOOST,
  DEFAULT_DENY_AGGRESSIVENESS,
  MAX_SPEED_BY_POSITION_PX,
} from './physics';

export const initialOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

export const initialDef: DefenderPositions = {
  D1: { x: 300, y: 380 },
  D2: { x: 170, y: 310 },
  D3: { x: 430, y: 310 },
  D4: { x: 240, y: 160 },
  D5: { x: 360, y: 160 },
};

export const baseMatchups: Matchups = {
  D1: 'O1',
  D2: 'O2',
  D3: 'O3',
  D4: 'O4',
  D5: 'O5',
};

// Vitesses par poste — modélise la mobilité réelle du joueur (cf. data/physics.ts).
// Les valeurs en px/étape vivent dans MAX_SPEED_BY_POSITION_PX.
export const defaultRules: DefenderRules = {
  D1: { helpPct: 20, priority: 'man',   vsCarrier: 'coller', maxSpeed: MAX_SPEED_BY_POSITION_PX.guard },         // meneur
  D2: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', maxSpeed: MAX_SPEED_BY_POSITION_PX.shootingGuard }, // arrière
  D3: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', maxSpeed: MAX_SPEED_BY_POSITION_PX.wing },          // ailier
  D4: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper', maxSpeed: MAX_SPEED_BY_POSITION_PX.forward },       // ailier fort
  D5: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper', maxSpeed: MAX_SPEED_BY_POSITION_PX.center },        // pivot
};

export function makeStep(
  off: AttackerPositions,
  ballCarrier: AppState['steps'][number]['ballCarrier'],
  annotations: Annotation[] = []
): Step {
  return {
    off: structuredClone(off),
    ballCarrier,
    annotations,
  };
}

export function makeInitialState(): AppState {
  return {
    steps: [makeStep(initialOff, 'O1', [])],
    activeStep: 0,
    playerCount: 5,
    defenseInitial: structuredClone(initialDef),
    defenseDistance: DEFAULT_DEFENSE_DISTANCE_PX,
    defenseMaxSpeed: DEFAULT_DEFENSE_MAX_SPEED_PX,
    triggers: { drive: true, post: false, paint: true, trap: false },
    rules: structuredClone(defaultRules),
    screenRule: 'hedge',
    screenRadius: DEFAULT_SCREEN_RADIUS_PX,
    dropDepth: 'medium',
    showHelpLines: true,
    showMatchups: true,
    tool: 'move',
    actionTimingAnchor: 'start',
    defenseSystem: 'man',
    zoneConfig: {
      type: 'zone-2-3',
      ballPressure: 50,
      rotationSpeed: 80,
      trapCorners: false,
      extendTo3pt: true,
      paintCoverage: 50,
      rimProtection: 50,
      passDenial: 50,
    },
    offBallScreenRule: 'over',
    fullCourt: false,
    showPassLanes: false,
    attackingDirection: 'up',
    showGhosts: true,
    showActionOrder: false,
    showHeatmap: false,
    showSwitchMatchups: true,
    showScreenIndicators: true,
    showScreenDebug: false,
    showStateRings: true,
    showLockBadges: true,
    closeoutBoost: DEFAULT_CLOSEOUT_BOOST,
    denyAggressiveness: DEFAULT_DENY_AGGRESSIVENESS,
    attackerHands: { O1: 'right', O2: 'right', O3: 'right', O4: 'right', O5: 'right' },
    // Profils offensifs par défaut : 1-2-2 classique avec un meneur, deux ailiers
    // shooters, un 4 stretch et un 5 rouleur. Le coach ajuste via clic-droit.
    attackerProfiles: {
      O1: 'creator',
      O2: 'shooter',
      O3: 'shooter',
      O4: 'rim-roller',
      O5: 'stretch-big',
    },
  };
}
