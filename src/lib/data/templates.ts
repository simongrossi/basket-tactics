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
// SPAIN PNR (PNR central avec back-screen sur le défenseur du screener)
// ============================================================
const spainSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 380, y: 200 },
  O5: { x: 310, y: 240 },
};
const spainScreen: AttackerPositions = {
  ...spainSetup,
  O5: { x: 295, y: 340 },
};
const spainBack: AttackerPositions = {
  ...spainScreen,
  O4: { x: 305, y: 290 }, // O4 monte poser back-screen sur D5
};
const spainAttack: AttackerPositions = {
  ...spainBack,
  O1: { x: 380, y: 290 },
  O5: { x: 300, y: 150 },
};
const SPAIN_PNR: Template = {
  id: 'spain-pnr',
  name: 'Spain PNR',
  description: "PNR central + back-screen de O4 sur D5 pour libérer O5 dans la raquette.",
  defenseInitial: defaultDef(spainSetup),
  steps: [
    { label: 'Setup', off: spainSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: "O5 monte l'écran",
      off: spainScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: spainSetup.O5, to: spainScreen.O5 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: null, from: spainScreen.O5, to: { x: spainScreen.O5.x, y: spainScreen.O5.y + 18 } } as Annotation,
      ],
    },
    {
      label: 'O4 back-screen sur D5',
      off: spainBack,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: spainScreen.O4, to: spainBack.O4 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: null, from: spainBack.O4, to: { x: spainBack.O4.x, y: spainBack.O4.y + 18 } } as Annotation,
      ],
    },
    {
      label: 'O1 attaque, O5 plonge',
      off: spainAttack,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: spainBack.O1, to: spainAttack.O1 } as Annotation,
        { type: 'cut', fromId: 'O5', toId: null, from: spainBack.O5, to: spainAttack.O5 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// UCLA CUT
// ============================================================
const uclaSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 200, y: 200 },
  O5: { x: 300, y: 240 }, // high post
};
const uclaPass: AttackerPositions = {
  ...uclaSetup,
  O1: { x: 280, y: 360 },
};
const uclaCut: AttackerPositions = {
  ...uclaPass,
  O1: { x: 300, y: 180 }, // cut basket via back-screen O5
};
const UCLA_CUT: Template = {
  id: 'ucla-cut',
  name: 'UCLA cut',
  description: "Passe latérale + back-screen high post pour cut basket de O1.",
  defenseInitial: defaultDef(uclaSetup),
  steps: [
    { label: 'Setup', off: uclaSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: 'O1 → O3',
      off: uclaPass,
      ballCarrier: 'O3',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O3', from: uclaSetup.O1, to: uclaSetup.O3 } as Annotation,
        { type: 'cut', fromId: 'O1', toId: null, from: uclaSetup.O1, to: uclaPass.O1 } as Annotation,
      ],
    },
    {
      label: 'UCLA cut basket',
      off: uclaCut,
      ballCarrier: 'O3',
      annotations: [
        { type: 'screen', fromId: 'O5', toId: null, from: uclaSetup.O5, to: { x: uclaSetup.O5.x + 18, y: uclaSetup.O5.y } } as Annotation,
        { type: 'cut', fromId: 'O1', toId: null, from: uclaPass.O1, to: uclaCut.O1 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// FLOPPY (option two-side, écran double)
// ============================================================
const floppySetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 300, y: 105 }, // sous le panier
  O3: { x: 480, y: 320 },
  O4: { x: 220, y: 165 }, // bloc bas gauche
  O5: { x: 380, y: 165 }, // bloc bas droit
};
const floppyChoose: AttackerPositions = {
  ...floppySetup,
  O2: { x: 215, y: 240 }, // O2 choisit gauche
};
const floppyCatch: AttackerPositions = {
  ...floppyChoose,
  O2: { x: 130, y: 320 },
};
const FLOPPY: Template = {
  id: 'floppy',
  name: 'Floppy',
  description: "O2 sous le panier choisit son écran (gauche O4 ou droite O5) pour ressortir.",
  defenseInitial: defaultDef(floppySetup),
  steps: [
    { label: 'Setup floppy', off: floppySetup, ballCarrier: 'O1', annotations: [] },
    {
      label: 'O2 choisit gauche, écran de O4',
      off: floppyChoose,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: floppySetup.O2, to: floppyChoose.O2 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: null, from: floppySetup.O4, to: { x: floppySetup.O4.x, y: floppySetup.O4.y - 18 } } as Annotation,
      ],
    },
    {
      label: "Sortie + passe pour le tir",
      off: floppyCatch,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: floppyChoose.O2, to: floppyCatch.O2 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O2', from: floppyChoose.O1, to: floppyCatch.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// HAMMER (backscreen baseline pour 3pts corner faible sur drive)
// ============================================================
const hammerSetup: AttackerPositions = {
  O1: { x: 480, y: 380 },  // porteur côté droit
  O2: { x: 130, y: 380 },  // ailier côté faible
  O3: { x: 130, y: 100 },  // shooter dans le coin gauche faible
  O4: { x: 380, y: 200 },  // intérieur côté ballon
  O5: { x: 220, y: 165 },  // intérieur côté faible (futur screener)
};
const hammerDrive: AttackerPositions = {
  ...hammerSetup,
  O1: { x: 420, y: 240 },  // O1 drive baseline-middle
};
const hammerScreen: AttackerPositions = {
  ...hammerDrive,
  O5: { x: 165, y: 110 },  // O5 descend backscreen sur D3
};
const hammerCatch: AttackerPositions = {
  ...hammerScreen,
  O3: { x: 120, y: 130 },  // O3 lift slightly pour catch
};
const HAMMER: Template = {
  id: 'hammer',
  name: 'Hammer',
  description: "Drive baseline d'O1, O5 vient poser un backscreen baseline sur le défenseur de O3 → skip pass corner faible pour tir 3.",
  defenseInitial: defaultDef(hammerSetup),
  steps: [
    { label: 'Setup', off: hammerSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: 'O1 drive baseline',
      off: hammerDrive,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: hammerSetup.O1, to: hammerDrive.O1 } as Annotation,
      ],
    },
    {
      label: 'O5 backscreen sur D3',
      off: hammerScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: hammerSetup.O5, to: hammerScreen.O5 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: null, from: hammerScreen.O5, to: { x: hammerScreen.O5.x - 18, y: hammerScreen.O5.y } } as Annotation,
      ],
    },
    {
      label: 'Skip → O3 corner pour tir 3',
      off: hammerCatch,
      ballCarrier: 'O3',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O3', from: hammerDrive.O1, to: hammerCatch.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// 🧪 SCREEN LAB — DEV (bancs de test des écrans, 4 templates dédiés)
// ============================================================
// Chaque template est un SCÉNARIO CONTINU (steps partagent le même
// setup de base, les joueurs non-impliqués restent statiques).
// → Aucune téléportation inter-scène quand on lit en playback.
//
// Templates :
//   • 🧪 Lab PnR     — écran porteur + snake + reject (8 steps)
//   • 🧪 Lab Pindown — écran hors-ballon down (3 steps)
//   • 🧪 Lab Flare   — écran hors-ballon away + fade (3 steps)
//   • 🧪 Lab Stress  — cross-trajectory + overlap pathologique (3 steps)
//
// À utiliser pour valider tout changement dans le pipeline d'écran.

const labOff_neutral: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 100, y: 380 },
  O3: { x: 500, y: 380 },
  O4: { x: 180, y: 200 },
  O5: { x: 420, y: 200 },
};

// PnR top : O5 descend poser un écran haut sur D1.
// O1 démarre à (300, 470). D1 (matched) finit ≈ (300, 430) en man defense.
// Pour qu'un écran soit DÉTECTÉ géométriquement, O5 doit être ≤ 35 px de D1.
const labOff_pnrApproach: AttackerPositions = { ...labOff_neutral, O5: { x: 340, y: 380 } };
const labOff_pnrContact: AttackerPositions = { ...labOff_neutral, O5: { x: 310, y: 432 } };
const labOff_pnrUse: AttackerPositions = { ...labOff_pnrContact, O1: { x: 380, y: 420 } };
const labOff_pnrRoll: AttackerPositions = { ...labOff_pnrUse, O5: { x: 320, y: 240 } };

// Snake : O1 attaque, recule, ré-attaque le MÊME poseur
const labOff_snakeRetreat: AttackerPositions = { ...labOff_pnrUse, O1: { x: 280, y: 440 } };
const labOff_snakeReEngage: AttackerPositions = { ...labOff_snakeRetreat, O1: { x: 380, y: 360 } };

// Reject : O1 vire opposé au poseur
const labOff_reject: AttackerPositions = { ...labOff_pnrContact, O1: { x: 240, y: 400 } };

// Pindown : O3 descend pour libérer O2
const labOff_pindownSetup: AttackerPositions = {
  O1: { x: 300, y: 470 }, O2: { x: 80, y: 380 }, O3: { x: 100, y: 250 },
  O4: { x: 220, y: 200 }, O5: { x: 380, y: 200 },
};
const labOff_pindownContact: AttackerPositions = { ...labOff_pindownSetup, O3: { x: 100, y: 330 } };

// Flare : O3 monte écran AWAY pour O2 (O2 va dans l'angle opposé au porteur)
const labOff_flareSetup: AttackerPositions = {
  O1: { x: 460, y: 380 }, O2: { x: 220, y: 380 }, O3: { x: 280, y: 320 },
  O4: { x: 180, y: 200 }, O5: { x: 380, y: 200 },
};
const labOff_flareContact: AttackerPositions = {
  ...labOff_flareSetup,
  O3: { x: 250, y: 360 },
  O2: { x: 130, y: 420 }, // O2 fade vers le coin
};

// Stagger : O3 + O4 successifs pour O2
const labOff_staggerSetup: AttackerPositions = {
  O1: { x: 460, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 200, y: 300 },
  O4: { x: 280, y: 240 }, O5: { x: 420, y: 200 },
};
const labOff_staggerThrough: AttackerPositions = {
  ...labOff_staggerSetup,
  O2: { x: 330, y: 220 }, // O2 a traversé les 2 écrans
};

// Cross-trajectory torture (cas systeme_basket-10) : O1 dribble vers la droite,
// O5 vient au milieu — leurs trajectoires linéaires se croisent
const labOff_crossA: AttackerPositions = {
  O1: { x: 200, y: 450 }, O2: { x: 100, y: 380 }, O3: { x: 100, y: 220 },
  O4: { x: 180, y: 200 }, O5: { x: 460, y: 280 },
};
const labOff_crossB: AttackerPositions = {
  ...labOff_crossA,
  O1: { x: 520, y: 360 }, // dribble vers la droite
  O5: { x: 280, y: 380 }, // pose un écran au centre
};

// Poseur EXACTEMENT sur porteur (cas pathologique anti-overlap)
const labOff_overlap: AttackerPositions = {
  O1: { x: 300, y: 400 }, O2: { x: 100, y: 380 }, O3: { x: 300, y: 400 }, // O3 PILE sur O1
  O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
};

// IMPORTANT — durée réaliste : `PLAYBACK_STEP_DURATION_MS = 2000` (2s par
// transition). Une possession FIBA = 24s, soit ~18s effectives après remontée
// de balle. Un système ne doit JAMAIS dépasser ~9 transitions (= 18s).
// Idéalement un scénario tactique court (PnR, snake) = 3-5 transitions = 6-10s.

// ----------------- Template 1 : PnR Roll (court, 5 steps = 8s) -----------------
const SCREEN_LAB_PNR: Template = {
  id: 'screen-lab-pnr',
  name: '🧪 Lab PnR Roll (dev)',
  description:
    "Banc de test écran porteur classique : approche → contact → dribble → roll. 5 steps continus (= 8s, réaliste). O1 porteur + O5 poseur.",
  defenseInitial: defaultDef(labOff_neutral),
  steps: [
    { label: '01 — Setup neutre', off: labOff_neutral, ballCarrier: 'O1', annotations: [] },
    { label: '02 — High PnR : approche', off: labOff_pnrApproach, ballCarrier: 'O1', annotations: [] },
    {
      label: '03 — High PnR : contact',
      off: labOff_pnrContact,
      ballCarrier: 'O1',
      annotations: [],
      forcedScreener: 'O5',
    },
    { label: '04 — High PnR : O1 dribble', off: labOff_pnrUse, ballCarrier: 'O1', annotations: [], forcedScreener: 'O5' },
    { label: '05 — High PnR : roll', off: labOff_pnrRoll, ballCarrier: 'O1', annotations: [] },
  ],
};

// ----------------- Template 1b : Snake dribble (4 steps = 6s) -----------------
// Démarre à la position post-contact (= juste après la pose), pas de setup
// neutre pour rester compact. Le snake teste le V (engage → retreat → re-engage).
const SCREEN_LAB_SNAKE: Template = {
  id: 'screen-lab-snake',
  name: '🧪 Lab Snake dribble (dev)',
  description:
    "Banc de test snake dribble : O1 engage l'écran, recule, ré-attaque le MÊME poseur. 4 steps continus (= 6s). Active `snakeKeepCoverage` pour valider la V2.",
  defenseInitial: defaultDef(labOff_pnrContact),
  steps: [
    { label: '01 — Contact initial', off: labOff_pnrContact, ballCarrier: 'O1', annotations: [], forcedScreener: 'O5' },
    { label: '02 — O1 engage', off: labOff_pnrUse, ballCarrier: 'O1', annotations: [] },
    { label: '03 — O1 retreat', off: labOff_snakeRetreat, ballCarrier: 'O1', annotations: [] },
    { label: '04 — O1 re-engage', off: labOff_snakeReEngage, ballCarrier: 'O1', annotations: [], forcedScreener: 'O5' },
  ],
};

// ----------------- Template 1c : Reject (3 steps = 4s) -----------------
const SCREEN_LAB_REJECT: Template = {
  id: 'screen-lab-reject',
  name: '🧪 Lab Reject screen (dev)',
  description:
    "Banc de test reject screen : O1 fait un fake d'usage puis vire SEC côté opposé au poseur. 3 steps continus (= 4s). Active `unwindRejectedScreens` pour valider la V2.",
  defenseInitial: defaultDef(labOff_pnrApproach),
  steps: [
    { label: '01 — Setup avec O5 en approche', off: labOff_pnrApproach, ballCarrier: 'O1', annotations: [] },
    { label: '02 — Contact (fake)', off: labOff_pnrContact, ballCarrier: 'O1', annotations: [], forcedScreener: 'O5' },
    { label: '03 — Reject : O1 vire opposé', off: labOff_reject, ballCarrier: 'O1', annotations: [] },
  ],
};

// ----------------- Template 2 : Pindown (continuous) -----------------
const SCREEN_LAB_PINDOWN: Template = {
  id: 'screen-lab-pindown',
  name: '🧪 Lab Pindown (dev)',
  description:
    "Banc de test écran hors-ballon down : O3 descend, écran sur D2, O2 monte recevoir. 3 steps continus.",
  defenseInitial: defaultDef(labOff_pindownSetup),
  steps: [
    { label: '01 — Setup', off: labOff_pindownSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: '02 — O3 descend',
      off: labOff_pindownContact,
      ballCarrier: 'O1',
      annotations: [],
      forcedScreener: 'O3',
    },
    {
      label: '03 — O2 ressort vers le top',
      off: { ...labOff_pindownContact, O2: { x: 180, y: 280 } },
      ballCarrier: 'O1',
      annotations: [],
    },
  ],
};

// ----------------- Template 3 : Flare -----------------
const SCREEN_LAB_OFFBALL: Template = {
  id: 'screen-lab-offball',
  name: '🧪 Lab Flare (dev)',
  description:
    "Banc de test écran hors-ballon flare : O3 monte poser un away screen, O2 fade vers le coin. 2 steps continus.",
  defenseInitial: defaultDef(labOff_flareSetup),
  steps: [
    { label: '01 — Setup flare', off: labOff_flareSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: '02 — Flare : O3 monte, O2 fade',
      off: labOff_flareContact,
      ballCarrier: 'O1',
      annotations: [],
      forcedScreener: 'O3',
    },
  ],
};

// ----------------- Template 4 : Cas pathologiques / stress -----------------
// On garde 2 steps consécutifs uniquement (cross) pour permettre le test
// du croisement. Le step "Poseur PILE" reste exempté car c'est un cas où
// la téléportation EST le but du test (vérifier que le moteur résiste).
const SCREEN_LAB_STRESS: Template = {
  id: 'screen-lab-stress',
  name: '🧪 Lab Cross trajectory (dev)',
  description:
    "Banc de test cas pathologique : trajectoires d'attaquants qui se croisent géométriquement. Reproduit le scénario systeme_basket-10.json — O1 dribble vers la droite + O5 vient au milieu poser un écran. Vérifier l'invariant anti-superposition pendant l'interpolation. 2 steps continus.",
  defenseInitial: defaultDef(labOff_crossA),
  steps: [
    { label: '01 — Setup cross', off: labOff_crossA, ballCarrier: 'O1', annotations: [] },
    {
      label: '02 — ⚠ Cross : O1 dribble + O5 traverse',
      off: labOff_crossB,
      ballCarrier: 'O1',
      annotations: [],
      forcedScreener: 'O5',
    },
  ],
};

// ----------------- Template Help-recover (C.2) — 4 steps = 6s -----------------
// Scénario : O1 attaque la raquette (drive trigger ON) → D3 quitte O3 pour
// aider → O1 ressort kick out (drive OFF). Avec helpStickiness=2/3, D3 doit
// glisser progressivement vers O3 au lieu de snap-back instantanément.
const labOff_helpStart: AttackerPositions = {
  O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
  O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
};
const labOff_helpDrive: AttackerPositions = {
  ...labOff_helpStart,
  O1: { x: 280, y: 200 }, // dans la raquette (drive + paint triggers)
};
const labOff_helpKickout: AttackerPositions = {
  ...labOff_helpStart,
  O1: { x: 200, y: 380 }, // recule sur l'extension du 3pt côté gauche
};
const labOff_helpReset: AttackerPositions = {
  ...labOff_helpStart,
  O1: { x: 300, y: 400 }, // revient au top, drive depuis longtemps OFF
};

const SCREEN_LAB_HELP_RECOVER: Template = {
  id: 'screen-lab-help-recover',
  name: '🧪 Lab Help-recover (dev)',
  description:
    "Banc de test C.2 help-and-recover timing : O1 drive raquette → kick out → reset. Activer `helpStickiness` (Couvertures avancées → durée d'aide) pour voir D3 glisser progressivement au lieu de snap-back instantanément. 4 steps = 6s.",
  defenseInitial: defaultDef(labOff_helpStart),
  steps: [
    { label: '01 — Setup (porteur au top)', off: labOff_helpStart, ballCarrier: 'O1', annotations: [] },
    { label: '02 — O1 drive raquette (aide active)', off: labOff_helpDrive, ballCarrier: 'O1', annotations: [] },
    { label: '03 — Kick out (drive OFF)', off: labOff_helpKickout, ballCarrier: 'O1', annotations: [] },
    { label: '04 — Reset top', off: labOff_helpReset, ballCarrier: 'O1', annotations: [] },
  ],
};

// ============================================================
// EXPORT
// ============================================================
export const TEMPLATES: Template[] = [
  PNR_CENTRAL,
  HORNS_FLARE,
  PINDOWN_CORNER,
  SPAIN_PNR,
  UCLA_CUT,
  FLOPPY,
  HAMMER,
  SCREEN_LAB_PNR,
  SCREEN_LAB_SNAKE,
  SCREEN_LAB_REJECT,
  SCREEN_LAB_PINDOWN,
  SCREEN_LAB_OFFBALL,
  SCREEN_LAB_HELP_RECOVER,
  SCREEN_LAB_STRESS,
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
