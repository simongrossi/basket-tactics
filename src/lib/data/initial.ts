import type {
  AttackerPositions,
  DefenderPositions,
  DefenderRules,
  Matchups,
  AppState,
  Step,
  Annotation,
} from '../types';

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

export const defaultRules: DefenderRules = {
  D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller' },
  D2: { helpPct: 50, priority: 'paint', vsCarrier: 'coller' },
  D3: { helpPct: 50, priority: 'paint', vsCarrier: 'coller' },
  D4: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper' },
  D5: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper' },
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
    defenseInitial: structuredClone(initialDef),
    defenseDistance: 40,
    defenseMaxSpeed: 110,
    triggers: { drive: true, post: false, paint: true, trap: false },
    rules: structuredClone(defaultRules),
    screenRule: 'hedge',
    screenRadius: 35,
    dropDepth: 'medium',
    showHelpLines: true,
    showMatchups: true,
    tool: 'move',
    defenseSystem: 'man',
    zoneConfig: {
      type: 'zone-2-3',
      ballPressure: 50,
      rotationSpeed: 80,
      trapCorners: false,
      extendTo3pt: true,
    },
    offBallScreenRule: 'over',
    fullCourt: false,
    showPassLanes: false,
    attackingDirection: 'up',
  };
}
