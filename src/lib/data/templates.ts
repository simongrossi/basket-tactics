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
// 🧪 SCREEN LAB — DEV (banc de test exhaustif des écrans)
// ============================================================
// 12 étapes qui enchaînent les principaux comportements d'écran +
// les cas pathologiques (trajectoires qui se croisent, poseur sur
// porteur, etc.). À utiliser pour valider visuellement n'importe
// quel changement dans le pipeline d'écran.
//
// Mode d'emploi : charger le système, naviguer step par step
// (label de chaque étape = scénario testé), vérifier que :
//   - aucun joueur ne se superpose (règle absolue, cf. PLAYER-CLEARANCE.md)
//   - D1 réagit correctement à chaque type d'écran selon la rule globale
//   - les badges/indicateurs UI affichent les bons patterns détectés

const labOff_neutral: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 100, y: 380 },
  O3: { x: 500, y: 380 },
  O4: { x: 180, y: 200 },
  O5: { x: 420, y: 200 },
};

// PnR top : O5 descend poser un écran haut sur D1
const labOff_pnrApproach: AttackerPositions = { ...labOff_neutral, O5: { x: 360, y: 280 } };
const labOff_pnrContact: AttackerPositions = { ...labOff_neutral, O5: { x: 320, y: 380 } };
const labOff_pnrUse: AttackerPositions = { ...labOff_pnrContact, O1: { x: 380, y: 360 } };
const labOff_pnrRoll: AttackerPositions = { ...labOff_pnrUse, O5: { x: 320, y: 200 } };

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

const SCREEN_LAB: Template = {
  id: 'screen-lab',
  name: '🧪 Screen Lab (dev)',
  description:
    "Banc de test exhaustif des écrans : 12 étapes qui enchaînent PnR, snake, reject, pindown, flare, stagger, et 2 cas pathologiques (trajectoires qui se croisent, poseur sur porteur). À utiliser pour valider tout changement dans le pipeline d'écran.",
  defenseInitial: defaultDef(labOff_neutral),
  steps: [
    { label: '01 — Setup neutre', off: labOff_neutral, ballCarrier: 'O1', annotations: [] },
    {
      label: '02 — High PnR : approche',
      off: labOff_pnrApproach,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: labOff_neutral.O5, to: labOff_pnrApproach.O5 } as Annotation,
      ],
    },
    {
      label: '03 — High PnR : contact',
      off: labOff_pnrContact,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O5', toId: 'O1', from: labOff_pnrApproach.O5, to: labOff_pnrContact.O5, phase: 'end' } as Annotation,
      ],
    },
    {
      label: '04 — High PnR : O1 dribble',
      off: labOff_pnrUse,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: labOff_pnrContact.O1, to: labOff_pnrUse.O1 } as Annotation,
      ],
    },
    {
      label: '05 — High PnR : roll',
      off: labOff_pnrRoll,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: labOff_pnrUse.O5, to: labOff_pnrRoll.O5 } as Annotation,
      ],
    },
    {
      label: '06 — Snake : retreat',
      off: labOff_snakeRetreat,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: labOff_pnrRoll.O1, to: labOff_snakeRetreat.O1 } as Annotation,
      ],
    },
    {
      label: '07 — Snake : re-engage',
      off: labOff_snakeReEngage,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: labOff_snakeRetreat.O1, to: labOff_snakeReEngage.O1 } as Annotation,
      ],
    },
    {
      label: '08 — Reject : O1 vire opposé',
      off: labOff_reject,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: labOff_snakeReEngage.O1, to: labOff_reject.O1 } as Annotation,
      ],
    },
    {
      label: '09 — Pindown : O3 down screen pour O2',
      off: labOff_pindownContact,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O3', toId: 'O2', from: labOff_pindownSetup.O3, to: labOff_pindownContact.O3, phase: 'end' } as Annotation,
      ],
    },
    {
      label: '10 — Flare : O3 away screen pour O2',
      off: labOff_flareContact,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O3', toId: 'O2', from: labOff_flareSetup.O3, to: labOff_flareContact.O3, phase: 'end' } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: labOff_flareSetup.O2, to: labOff_flareContact.O2 } as Annotation,
      ],
    },
    {
      label: '11 — Stagger : O3 + O4 successifs',
      off: labOff_staggerThrough,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: labOff_staggerSetup.O2, to: labOff_staggerThrough.O2 } as Annotation,
      ],
    },
    {
      label: '12 — ⚠ Cross-trajectory torture',
      off: labOff_crossB,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: labOff_crossA.O1, to: labOff_crossB.O1 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O1', from: labOff_crossA.O5, to: labOff_crossB.O5, phase: 'end' } as Annotation,
      ],
    },
    {
      label: '13 — ⚠ Poseur PILE sur porteur (test push-out)',
      off: labOff_overlap,
      ballCarrier: 'O1',
      annotations: [],
    },
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
  SCREEN_LAB,
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
