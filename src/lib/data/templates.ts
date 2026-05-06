import type { AttackerPositions, DefenderPositions, Step, Annotation } from '../types';

export interface Template {
  id: string;
  name: string;
  description: string;
  defenseInitial: DefenderPositions;
  steps: Step[];
}

/**
 * Position canonique de défenseurs alignés sur l'attaque pour les templates.
 * Le moteur recalculera les positions effectives selon les règles utilisateur.
 */
function defaultDef(off: AttackerPositions): DefenderPositions {
  const HOOP = { x: 300, y: 75 };
  const dist = 40;
  const ids: (keyof AttackerPositions)[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
  const def = {} as DefenderPositions;
  ids.forEach((oId, i) => {
    const dId = `D${i + 1}` as keyof DefenderPositions;
    const att = off[oId];
    const dx = HOOP.x - att.x;
    const dy = HOOP.y - att.y;
    const len = Math.hypot(dx, dy) || 1;
    def[dId] = {
      x: Math.round(att.x + (dx / len) * dist),
      y: Math.round(att.y + (dy / len) * dist),
    };
  });
  return def;
}

// ============================================================
// PNR CENTRAL
// ============================================================
const pnrSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 },
  O5: { x: 310, y: 230 },
};

const pnrScreen: AttackerPositions = {
  ...pnrSetup,
  O5: { x: 290, y: 340 },
};

const pnrUse: AttackerPositions = {
  ...pnrScreen,
  O1: { x: 380, y: 310 },
};

const pnrRoll: AttackerPositions = {
  ...pnrUse,
  O5: { x: 300, y: 180 },
};

const PNR_CENTRAL: Template = {
  id: 'pnr-central',
  name: 'PNR central',
  description: "Pick & roll au centre. O5 monte poser l'écran, O1 attaque, O5 plonge.",
  defenseInitial: defaultDef(pnrSetup),
  steps: [
    {
      label: 'Setup',
      off: pnrSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: "O5 monte l'écran",
      off: pnrScreen,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O5',
          toId: null,
          from: pnrSetup.O5,
          to: pnrScreen.O5,
        } as Annotation,
        {
          type: 'screen',
          fromId: 'O5',
          toId: null,
          from: pnrScreen.O5,
          to: { x: pnrScreen.O5.x, y: pnrScreen.O5.y + 18 },
        } as Annotation,
      ],
    },
    {
      label: "O1 utilise l'écran",
      off: pnrUse,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'dribble',
          fromId: 'O1',
          toId: null,
          from: pnrSetup.O1,
          to: pnrUse.O1,
        } as Annotation,
      ],
    },
    {
      label: 'Roll',
      off: pnrRoll,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O5',
          toId: null,
          from: pnrScreen.O5,
          to: pnrRoll.O5,
        } as Annotation,
      ],
    },
  ],
};

// ============================================================
// HORNS FLARE
// ============================================================
const hornsSetup: AttackerPositions = {
  O1: { x: 300, y: 400 },
  O2: { x: 130, y: 350 },
  O3: { x: 470, y: 350 },
  O4: { x: 240, y: 220 },
  O5: { x: 360, y: 220 },
};

const hornsPass: AttackerPositions = {
  ...hornsSetup,
  O1: { x: 220, y: 380 },
};

const hornsScreen: AttackerPositions = {
  ...hornsPass,
  O1: { x: 220, y: 380 },
  O5: { x: 280, y: 340 },
};

const hornsCatch: AttackerPositions = {
  ...hornsScreen,
  O1: { x: 380, y: 360 },
};

const HORNS_FLARE: Template = {
  id: 'horns-flare',
  name: 'Horns flare',
  description: "Alignement Horns. O1 passe à O2 puis utilise un flare screen de O5 côté faible pour un tir extérieur.",
  defenseInitial: defaultDef(hornsSetup),
  steps: [
    {
      label: 'Setup Horns',
      off: hornsSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'O1 → O2',
      off: hornsPass,
      ballCarrier: 'O2',
      annotations: [
        {
          type: 'pass',
          fromId: 'O1',
          toId: 'O2',
          from: hornsSetup.O1,
          to: hornsSetup.O2,
        } as Annotation,
        {
          type: 'cut',
          fromId: 'O1',
          toId: null,
          from: hornsSetup.O1,
          to: hornsPass.O1,
        } as Annotation,
      ],
    },
    {
      label: 'O5 pose flare pour O1',
      off: hornsScreen,
      ballCarrier: 'O2',
      annotations: [
        {
          type: 'cut',
          fromId: 'O5',
          toId: null,
          from: hornsSetup.O5,
          to: hornsScreen.O5,
        } as Annotation,
        {
          type: 'screen',
          fromId: 'O5',
          toId: null,
          from: hornsScreen.O5,
          to: { x: hornsScreen.O5.x + 18, y: hornsScreen.O5.y },
        } as Annotation,
      ],
    },
    {
      label: 'Skip pass O2 → O1',
      off: hornsCatch,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O1',
          toId: null,
          from: hornsScreen.O1,
          to: hornsCatch.O1,
        } as Annotation,
        {
          type: 'pass',
          fromId: 'O2',
          toId: 'O1',
          from: hornsPass.O2,
          to: hornsCatch.O1,
        } as Annotation,
      ],
    },
  ],
};

// ============================================================
// PINDOWN CORNER
// ============================================================
const pinSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 470, y: 470 },
  O3: { x: 130, y: 320 },
  O4: { x: 380, y: 200 },
  O5: { x: 220, y: 230 },
};

const pinScreen: AttackerPositions = {
  ...pinSetup,
  O4: { x: 460, y: 380 },
};

const pinCut: AttackerPositions = {
  ...pinScreen,
  O2: { x: 470, y: 320 },
};

const pinCatch: AttackerPositions = {
  ...pinCut,
};

const PINDOWN_CORNER: Template = {
  id: 'pindown-corner',
  name: 'Pindown coin',
  description: "O4 descend poser un pindown pour O2 au coin. O2 sort vers l'aile et reçoit la passe pour un tir.",
  defenseInitial: defaultDef(pinSetup),
  steps: [
    {
      label: 'Setup',
      off: pinSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: "O4 descend l'écran",
      off: pinScreen,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O4',
          toId: null,
          from: pinSetup.O4,
          to: pinScreen.O4,
        } as Annotation,
        {
          type: 'screen',
          fromId: 'O4',
          toId: null,
          from: pinScreen.O4,
          to: { x: pinScreen.O4.x, y: pinScreen.O4.y + 18 },
        } as Annotation,
      ],
    },
    {
      label: 'O2 sort en course',
      off: pinCut,
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O2',
          toId: null,
          from: pinScreen.O2,
          to: pinCut.O2,
        } as Annotation,
      ],
    },
    {
      label: 'Passe pour le tir',
      off: pinCatch,
      ballCarrier: 'O2',
      annotations: [
        {
          type: 'pass',
          fromId: 'O1',
          toId: 'O2',
          from: pinCut.O1,
          to: pinCut.O2,
        } as Annotation,
      ],
    },
  ],
};

// ============================================================
// EXPORT
// ============================================================
export const TEMPLATES: Template[] = [PNR_CENTRAL, HORNS_FLARE, PINDOWN_CORNER];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
