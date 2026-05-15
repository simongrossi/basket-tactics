// Templates de systèmes de remise en jeu (BLOB / SLOB).
//
// 4 systèmes classiques de niveau lycée / NCAA / FIBA, conçus comme
// briques pédagogiques pour étudier les remises spécifiques :
//
//  - BLOB Box Curl  : curl du shooter sur double pin-down depuis le Box
//  - BLOB Stack Cross : split de pile + cross pour layup
//  - SLOB Stagger : stagger ball-side pour shooter sur la touche basse
//  - SLOB Hammer : back screen weak-side + skip pass corner
//
// Chaque template a 3-4 steps : setup → mouvement → pass terminale.
// Le step 0 pose `context: 'inbound-*'` pour activer le badge UI.

import type {
  AttackerPositions,
  Annotation,
  DefenderPositions,
} from '../types';
import type { Template } from './templates';

// Helper local : défense face-à-face man-to-man entre attaquant et panier.
function defaultDef(off: AttackerPositions): DefenderPositions {
  const HOOP = { x: 300, y: 75 };
  const dist = 38;
  const def = {} as DefenderPositions;
  (Object.keys(off) as (keyof AttackerPositions)[]).forEach((oId, i) => {
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
// BLOB BOX CURL — curl du shooter sur double pin-down
// ============================================================
//
// Niveau lycée/NCAA. Le shooter O3 (wing droit du Box) curl autour
// d'un double pin-down posé par O4 + O5. O1 le sert pour 3-pt ouvert.
// ------------------------------------------------------------

const blobBoxSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne (derrière baseline)
  O2: { x: 250, y: 95 },   // short corner gauche
  O3: { x: 350, y: 95 },   // short corner droite (shooter)
  O4: { x: 240, y: 170 },  // wing gauche (poseur 1)
  O5: { x: 360, y: 170 },  // wing droite (poseur 2)
};
const blobBoxScreen: AttackerPositions = {
  ...blobBoxSetup,
  O4: { x: 285, y: 145 },  // monte au pin-down inner
  O5: { x: 330, y: 145 },  // monte au pin-down outer (stagger, ≥ 34 px de O4)
};
const blobBoxCurl: AttackerPositions = {
  ...blobBoxScreen,
  O3: { x: 410, y: 200 },  // O3 curl vers wing droite
};

const BLOB_BOX_CURL: Template = {
  id: 'blob-box-curl',
  name: 'BLOB · Box curl',
  description: 'Remise ligne de fond. Box set, O3 curl autour du double pin-down (O4+O5) pour 3-pt ouvert wing droite.',
  defenseInitial: defaultDef(blobBoxSetup),
  steps: [
    {
      label: 'Setup Box',
      off: blobBoxSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'Double pin-down',
      off: blobBoxScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: 'O3', from: blobBoxSetup.O4, to: blobBoxScreen.O4 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O3', from: blobBoxSetup.O5, to: blobBoxScreen.O5 } as Annotation,
      ],
    },
    {
      label: 'O3 curl + tir',
      off: blobBoxCurl,
      ballCarrier: 'O3',
      annotations: [
        { type: 'cut', fromId: 'O3', toId: null, from: blobBoxSetup.O3, to: blobBoxCurl.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: blobBoxSetup.O1, to: blobBoxCurl.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// BLOB STACK CROSS — split de pile vers layup
// ============================================================
//
// 4 attaquants empilés au FT line. Au signal, les 2 du bas splittent
// vers les corners, le top cut backdoor vers le panier.
// ------------------------------------------------------------

// "Stack" élargi en thin Box 2-2 : un stack pur (tous au même x) fait
// overlap les défenseurs matched aux non-matched. Le 2-2 préserve
// l'esprit de pile resserrée sans violer MIN_CLEARANCE.
const blobStackSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne
  O5: { x: 250, y: 250 },  // bottom-left (poseur weak-side)
  O4: { x: 350, y: 250 },  // bottom-right (poseur ball-side)
  O3: { x: 280, y: 140 },  // top-left (cutter)
  O2: { x: 320, y: 140 },  // top-right (cutter principal)
};
const blobStackSplit: AttackerPositions = {
  O1: { x: 300, y: 8 },
  O5: { x: 170, y: 230 },  // split corner gauche
  O4: { x: 430, y: 230 },  // split corner droite
  O3: { x: 380, y: 150 },  // step out wing droite
  O2: { x: 300, y: 95 },   // back-cut vers panier (= cutter principal)
};

const BLOB_STACK_CROSS: Template = {
  id: 'blob-stack-cross',
  name: 'BLOB · Stack cross',
  description: 'Remise ligne de fond. Pile de 4 au FT line, split + back-cut de O2 vers panier pour layup ou kick-out.',
  defenseInitial: defaultDef(blobStackSetup),
  steps: [
    {
      label: 'Setup Stack',
      off: blobStackSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'Split + back-cut O2',
      off: blobStackSplit,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: blobStackSetup.O5, to: blobStackSplit.O5 } as Annotation,
        { type: 'cut', fromId: 'O4', toId: null, from: blobStackSetup.O4, to: blobStackSplit.O4 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: blobStackSetup.O3, to: blobStackSplit.O3 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: blobStackSetup.O2, to: blobStackSplit.O2 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O2', from: blobStackSetup.O1, to: blobStackSplit.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB STAGGER — stagger ball-side pour shooter
// ============================================================
//
// Remise touche bas (côté offensif). O4 + O5 posent un stagger
// ball-side pour libérer O3 (shooter) qui curl vers le ballon.
// ------------------------------------------------------------

const slobStaggerSetup: AttackerPositions = {
  O1: { x: 592, y: 180 },  // passeur hors-touche droite
  O2: { x: 380, y: 90 },   // wing court
  O3: { x: 200, y: 130 },  // weak side (= shooter)
  O4: { x: 320, y: 230 },  // top of key (poseur 1)
  O5: { x: 470, y: 350 },  // safety transition
};
const slobStaggerScreen: AttackerPositions = {
  ...slobStaggerSetup,
  O5: { x: 400, y: 230 },  // descend pour poser 2e écran stagger
  O4: { x: 350, y: 200 },  // se positionne en 1er écran (inner)
};
const slobStaggerCut: AttackerPositions = {
  ...slobStaggerScreen,
  // Limite physique : ≤ 5.5m = ~204 px par étape.
  // O3 curl ball-side, O4 drift loin du cutter pour clearance ≥ 34 px.
  O4: { x: 310, y: 240 },  // poseur dégage après le screen
  O3: { x: 390, y: 195 },  // curl ball-side, distance step 1→2 = 201 < 204
};

const SLOB_STAGGER: Template = {
  id: 'slob-stagger',
  name: 'SLOB · Stagger ball-side',
  description: 'Remise touche bas. O4 + O5 stagger pour libérer O3 (shooter) qui curl ball-side. Passe pour mid-range ou drive.',
  defenseInitial: defaultDef(slobStaggerSetup),
  steps: [
    {
      label: 'Setup SLOB bas',
      off: slobStaggerSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-low',
      manualOverride: true,
    },
    {
      label: 'Stagger ball-side',
      off: slobStaggerScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: slobStaggerSetup.O4, to: slobStaggerScreen.O4 } as Annotation,
        { type: 'cut', fromId: 'O5', toId: null, from: slobStaggerSetup.O5, to: slobStaggerScreen.O5 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: 'O3', from: slobStaggerScreen.O4, to: slobStaggerScreen.O4 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O3', from: slobStaggerScreen.O5, to: slobStaggerScreen.O5 } as Annotation,
      ],
    },
    {
      label: 'O3 curl + passe',
      off: slobStaggerCut,
      ballCarrier: 'O3',
      annotations: [
        { type: 'cut', fromId: 'O3', toId: null, from: slobStaggerSetup.O3, to: slobStaggerCut.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: slobStaggerSetup.O1, to: slobStaggerCut.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB HAMMER — back screen weak-side + skip pass corner
// ============================================================
//
// Remise touche bas. Action "Hammer" : back screen weak-side pour
// laisser un shooter ouvert dans le corner opposé. Passe en skip
// long de O1 directement vers le corner.
// ------------------------------------------------------------

const slobHammerSetup: AttackerPositions = {
  O1: { x: 592, y: 180 },  // passeur hors-touche droite
  O2: { x: 320, y: 250 },  // relai initial (reçoit première passe)
  O3: { x: 130, y: 130 },  // weak side wing (shooter cible)
  O4: { x: 200, y: 380 },  // poseur back screen
  O5: { x: 400, y: 380 },  // safety
};
const slobHammerRelay: AttackerPositions = {
  ...slobHammerSetup,
  O4: { x: 150, y: 200 },  // monte poser back screen sur D3
};
const slobHammerCorner: AttackerPositions = {
  ...slobHammerRelay,
  O3: { x: 60, y: 80 },    // O3 cut baseline corner faible
};

const SLOB_HAMMER: Template = {
  id: 'slob-hammer',
  name: 'SLOB · Hammer',
  description: 'Remise touche. Back screen weak-side de O4 sur D3, O3 cut baseline vers corner faible, skip pass de O2.',
  defenseInitial: defaultDef(slobHammerSetup),
  steps: [
    {
      label: 'Setup SLOB bas',
      off: slobHammerSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-low',
      manualOverride: true,
    },
    {
      label: 'Passe relai + back screen',
      off: slobHammerRelay,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: slobHammerSetup.O1, to: slobHammerSetup.O2 } as Annotation,
        { type: 'cut', fromId: 'O4', toId: null, from: slobHammerSetup.O4, to: slobHammerRelay.O4 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: 'O3', from: slobHammerRelay.O4, to: slobHammerRelay.O4 } as Annotation,
      ],
    },
    {
      label: 'O3 cut + skip pass',
      off: slobHammerCorner,
      ballCarrier: 'O3',
      annotations: [
        { type: 'cut', fromId: 'O3', toId: null, from: slobHammerRelay.O3, to: slobHammerCorner.O3 } as Annotation,
        { type: 'pass', fromId: 'O2', toId: 'O3', from: slobHammerRelay.O2, to: slobHammerCorner.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// BLOB TRIANGLE — pin-down du wing depuis triangle 2-1-2
// ============================================================
//
// Triangle 2-1-2 : 2 short corners + 1 high post + 1 weak side wing.
// O4 (high post) descend poser un pin-down pour libérer O2 (short
// corner gauche) qui curl vers le wing. Pass facile depuis le passeur.
// ------------------------------------------------------------

const blobTriangleSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne
  O2: { x: 200, y: 95 },   // short corner gauche (cutter)
  O3: { x: 400, y: 95 },   // short corner droite (cutter alternatif)
  O4: { x: 300, y: 180 },  // high post (poseur)
  O5: { x: 130, y: 250 },  // safety / wing weak side
};
const blobTriangleScreen: AttackerPositions = {
  ...blobTriangleSetup,
  O4: { x: 240, y: 140 },  // descend en pin-down ball-side gauche
};
const blobTriangleCurl: AttackerPositions = {
  ...blobTriangleScreen,
  O2: { x: 160, y: 200 },  // O2 curl vers wing gauche
  O3: { x: 380, y: 240 },  // O3 fill wing droite (spacing)
};

const BLOB_TRIANGLE: Template = {
  id: 'blob-triangle',
  name: 'BLOB · Triangle',
  description: 'Remise ligne de fond. Triangle 2-1-2, O4 pin-down pour O2 qui curl wing gauche, O3 fill wing droite (spacing).',
  defenseInitial: defaultDef(blobTriangleSetup),
  steps: [
    {
      label: 'Setup Triangle',
      off: blobTriangleSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'Pin-down O4',
      off: blobTriangleScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: blobTriangleSetup.O4, to: blobTriangleScreen.O4 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: 'O2', from: blobTriangleScreen.O4, to: blobTriangleScreen.O4 } as Annotation,
      ],
    },
    {
      label: 'O2 curl + passe',
      off: blobTriangleCurl,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: blobTriangleSetup.O2, to: blobTriangleCurl.O2 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: blobTriangleSetup.O3, to: blobTriangleCurl.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O2', from: blobTriangleSetup.O1, to: blobTriangleCurl.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// BLOB ZIPPER — cut vertical via screen au coude
// ============================================================
//
// Zipper cut : un joueur low-post / corner remonte la ligne via un
// écran au coude. Classique NCAA pour libérer le PG en haut du cercle.
// ------------------------------------------------------------

const blobZipperSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne
  O2: { x: 130, y: 95 },   // corner gauche
  O3: { x: 300, y: 250 },  // low post (= cutter)
  O4: { x: 300, y: 160 },  // elbow (= screener)
  O5: { x: 470, y: 95 },   // corner droite
};
const blobZipperCut: AttackerPositions = {
  ...blobZipperSetup,
  O3: { x: 300, y: 95 },   // zipper cut jusqu'au top
};

const BLOB_ZIPPER: Template = {
  id: 'blob-zipper',
  name: 'BLOB · Zipper',
  description: 'Remise ligne de fond. Zipper cut : O3 remonte la ligne médiane via écran de O4 au coude, reçoit en haut du cercle.',
  defenseInitial: defaultDef(blobZipperSetup),
  steps: [
    {
      label: 'Setup Zipper',
      off: blobZipperSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'O3 zipper + passe',
      off: blobZipperCut,
      ballCarrier: 'O3',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: 'O3', from: blobZipperSetup.O4, to: blobZipperSetup.O4 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: blobZipperSetup.O3, to: blobZipperCut.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: blobZipperSetup.O1, to: blobZipperCut.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB IVERSON — cut elbow-to-elbow entre 2 portes (gates)
// ============================================================
//
// Classique NCAA / NBA. Le shooter weak-side fait un cut horizontal
// au niveau des coudes à travers 2 écrans (O4 + O5 = gates). Ressort
// ball-side pour réception mid-range.
// ------------------------------------------------------------

const slobIversonSetup: AttackerPositions = {
  O1: { x: 592, y: 180 },  // passeur hors-touche droite
  O2: { x: 400, y: 90 },   // wing court (relai éventuel)
  O3: { x: 200, y: 120 },  // weak-side wing (= cutter Iverson)
  O4: { x: 220, y: 240 },  // elbow gauche (gate 1)
  O5: { x: 380, y: 240 },  // elbow droite (gate 2)
};
const slobIversonCut: AttackerPositions = {
  ...slobIversonSetup,
  O3: { x: 310, y: 240 },  // entre les 2 gates (mid-cut)
};
const slobIversonEmerge: AttackerPositions = {
  ...slobIversonCut,
  O3: { x: 410, y: 200 },  // émerge ball-side, prêt à recevoir
};

const SLOB_IVERSON: Template = {
  id: 'slob-iverson',
  name: 'SLOB · Iverson cut',
  description: 'Remise touche. Iverson cut classique : O3 traverse à hauteur des coudes via les 2 écrans (O4, O5) pour ressortir ball-side au mid-range.',
  defenseInitial: defaultDef(slobIversonSetup),
  steps: [
    {
      label: 'Setup gates',
      off: slobIversonSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-low',
      manualOverride: true,
    },
    {
      label: 'O3 entre les gates',
      off: slobIversonCut,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: 'O3', from: slobIversonSetup.O4, to: slobIversonSetup.O4 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: slobIversonSetup.O3, to: slobIversonCut.O3 } as Annotation,
      ],
    },
    {
      label: 'O3 émerge + passe',
      off: slobIversonEmerge,
      ballCarrier: 'O3',
      annotations: [
        { type: 'screen', fromId: 'O5', toId: 'O3', from: slobIversonCut.O5, to: slobIversonCut.O5 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: slobIversonCut.O3, to: slobIversonEmerge.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: slobIversonSetup.O1, to: slobIversonEmerge.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB HIGH OUTLET — transition advance the ball
// ============================================================
//
// Remise touche côté défensif (transition). Passe d'avance vers le
// milieu de terrain, puis 2e advance pass à l'intérieur courant vers
// le panier. Pédagogie : passer la balle vite, ne pas la dribbler.
// ------------------------------------------------------------

const slobHighSetup: AttackerPositions = {
  O1: { x: 592, y: 440 },  // passeur hors-touche droite (transition)
  O2: { x: 420, y: 460 },  // outlet rapproché (relai)
  O3: { x: 200, y: 460 },  // outlet weak side
  O4: { x: 300, y: 380 },  // milieu de terrain
  O5: { x: 300, y: 250 },  // intérieur, déjà en course
};
const slobHighAdvance: AttackerPositions = {
  ...slobHighSetup,
  O2: { x: 380, y: 380 },  // avance ball au milieu
};
const slobHighFinish: AttackerPositions = {
  ...slobHighAdvance,
  O5: { x: 320, y: 150 },  // course intérieure vers panier
};

const SLOB_HIGH_OUTLET: Template = {
  id: 'slob-high-outlet',
  name: 'SLOB haut · Outlet transition',
  description: 'Remise touche haute (transition). Passe outlet à O2 qui advance, puis seconde passe à O5 en course intérieure pour layup.',
  defenseInitial: defaultDef(slobHighSetup),
  steps: [
    {
      label: 'Setup transition',
      off: slobHighSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-high',
      manualOverride: true,
    },
    {
      label: 'Outlet → advance',
      off: slobHighAdvance,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: slobHighSetup.O1, to: slobHighSetup.O2 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: slobHighSetup.O2, to: slobHighAdvance.O2 } as Annotation,
      ],
    },
    {
      label: 'O5 course + finish',
      off: slobHighFinish,
      ballCarrier: 'O5',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: slobHighAdvance.O5, to: slobHighFinish.O5 } as Annotation,
        { type: 'pass', fromId: 'O2', toId: 'O5', from: slobHighAdvance.O2, to: slobHighFinish.O5 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// BLOB ELEVATOR — cut entre 2 portes qui se ferment
// ============================================================
//
// Action classique San Antonio Spurs. 2 bigs forment une "porte
// d'ascenseur" au coude. Le shooter cut entre eux et se positionne
// derrière. Les portes se ferment pour bloquer le défenseur poursuivant.
// ------------------------------------------------------------

const blobElevatorSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne
  O4: { x: 275, y: 180 },  // porte gauche (gate)
  O5: { x: 325, y: 180 },  // porte droite (gate)
  O3: { x: 300, y: 270 },  // shooter, derrière l'ascenseur
  O2: { x: 130, y: 250 },  // weak side spacing
};
const blobElevatorClose: AttackerPositions = {
  ...blobElevatorSetup,
  O3: { x: 300, y: 105 },  // shooter cut entre les portes vers le top
  O4: { x: 282, y: 180 },  // ferme la porte (rapprochement, on reste ≥ 34)
  O5: { x: 318, y: 180 },  // ferme la porte
};

const BLOB_ELEVATOR: Template = {
  id: 'blob-elevator',
  name: 'BLOB · Elevator',
  description: 'Remise ligne de fond. Action Spurs : 2 portes (O4, O5) au coude, O3 cut entre, les portes se ferment. Réception top du cercle.',
  defenseInitial: defaultDef(blobElevatorSetup),
  steps: [
    {
      label: 'Setup Elevator',
      off: blobElevatorSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'O3 cut + portes ferment + passe',
      off: blobElevatorClose,
      ballCarrier: 'O3',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: 'O3', from: blobElevatorSetup.O4, to: blobElevatorClose.O4 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O3', from: blobElevatorSetup.O5, to: blobElevatorClose.O5 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: blobElevatorSetup.O3, to: blobElevatorClose.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: blobElevatorSetup.O1, to: blobElevatorClose.O3 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB FLOPPY — shooter choisit son côté de curl
// ============================================================
//
// Floppy classique adapté en SLOB. 2 bigs en low post (gauche +
// droite), shooter sous le panier choisit quel côté curler. V1 : choix
// gauche (cut autour de O4).
// ------------------------------------------------------------

const slobFloppySetup: AttackerPositions = {
  O1: { x: 592, y: 180 },  // passeur hors-touche droite
  O3: { x: 380, y: 90 },   // wing court
  O2: { x: 300, y: 90 },   // shooter, sous le panier (= cutter)
  O4: { x: 220, y: 200 },  // low post gauche (poseur)
  O5: { x: 380, y: 200 },  // low post droite (poseur alternatif)
};
const slobFloppyCurl: AttackerPositions = {
  ...slobFloppySetup,
  O2: { x: 175, y: 240 },  // curl gauche autour de O4
};
const slobFloppyEmerge: AttackerPositions = {
  ...slobFloppyCurl,
  O2: { x: 200, y: 280 },  // wing gauche derrière 3pt
};

const SLOB_FLOPPY: Template = {
  id: 'slob-floppy',
  name: 'SLOB · Floppy gauche',
  description: 'Remise touche. Floppy classique. O2 sous le panier choisit le côté gauche (curl autour de O4) pour 3-pt wing gauche.',
  defenseInitial: defaultDef(slobFloppySetup),
  steps: [
    {
      label: 'Setup Floppy',
      off: slobFloppySetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-low',
      manualOverride: true,
    },
    {
      label: 'O2 curl gauche',
      off: slobFloppyCurl,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: 'O2', from: slobFloppySetup.O4, to: slobFloppySetup.O4 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: slobFloppySetup.O2, to: slobFloppyCurl.O2 } as Annotation,
      ],
    },
    {
      label: 'O2 émerge wing + skip pass',
      off: slobFloppyEmerge,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: slobFloppyCurl.O2, to: slobFloppyEmerge.O2 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O2', from: slobFloppySetup.O1, to: slobFloppyEmerge.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// BLOB HAWK — down screen + slip vers panier
// ============================================================
//
// Action Atlanta Hawks classique. O5 (big) descend poser un down
// screen pour O2 (cutter ball-side). Puis O5 slip vers le panier
// pour layup sur passe arrière de O2.
// ------------------------------------------------------------

const blobHawkSetup: AttackerPositions = {
  O1: { x: 300, y: 8 },    // passeur hors-ligne
  O2: { x: 140, y: 95 },   // low corner gauche (= cutter)
  O3: { x: 460, y: 95 },   // low corner droite (spacing)
  O4: { x: 170, y: 250 },  // weak side wing
  O5: { x: 300, y: 180 },  // high post (= screener Hawk)
};
const blobHawkScreen: AttackerPositions = {
  ...blobHawkSetup,
  O5: { x: 180, y: 130 },  // descend en down screen ball-side
};
const blobHawkSlip: AttackerPositions = {
  ...blobHawkScreen,
  O2: { x: 160, y: 235 },  // curl ball-side wing après down screen
  O5: { x: 270, y: 100 },  // slip vers panier après screen
  O4: { x: 270, y: 380 },  // drift safety
};

const BLOB_HAWK: Template = {
  id: 'blob-hawk',
  name: 'BLOB · Hawk',
  description: 'Remise ligne de fond. Action Atlanta : O5 down-screen pour O2 wing gauche, puis slip vers panier pour passe arrière.',
  defenseInitial: defaultDef(blobHawkSetup),
  steps: [
    {
      label: 'Setup Hawk',
      off: blobHawkSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-baseline',
      manualOverride: true,
    },
    {
      label: 'O5 down-screen',
      off: blobHawkScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: blobHawkSetup.O5, to: blobHawkScreen.O5 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O2', from: blobHawkScreen.O5, to: blobHawkScreen.O5 } as Annotation,
      ],
    },
    {
      label: 'O2 curl + O5 slip + passe',
      off: blobHawkSlip,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: blobHawkSetup.O2, to: blobHawkSlip.O2 } as Annotation,
        { type: 'cut', fromId: 'O5', toId: null, from: blobHawkScreen.O5, to: blobHawkSlip.O5 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O2', from: blobHawkSetup.O1, to: blobHawkSlip.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB HIGH DRAG — advance + drag screen mi-terrain
// ============================================================
//
// Transition rapide : outlet à O2, qui dribble en advance, et O5
// (intérieur arrière) remonte poser un drag screen au milieu pour
// libérer un mid-range ou un roll dunk.
// ------------------------------------------------------------

const slobHighDragSetup: AttackerPositions = {
  O1: { x: 592, y: 440 },  // passeur transition
  O2: { x: 420, y: 460 },  // primary outlet (= advance ball)
  O3: { x: 200, y: 460 },  // weak outlet
  O4: { x: 300, y: 380 },  // milieu de terrain
  O5: { x: 300, y: 260 },  // intérieur, courant vers l'avant
};
const slobHighDragAdvance: AttackerPositions = {
  ...slobHighDragSetup,
  O2: { x: 380, y: 380 },  // reçoit + advance dribble
  O5: { x: 350, y: 320 },  // revient poser drag screen
};
const slobHighDragRoll: AttackerPositions = {
  ...slobHighDragAdvance,
  O2: { x: 320, y: 250 },  // dribble post-drag, mid-range
  O5: { x: 400, y: 200 },  // roll vers panier après screen
};

const SLOB_HIGH_DRAG: Template = {
  id: 'slob-high-drag',
  name: 'SLOB haut · Drag screen',
  description: 'Transition rapide. Outlet à O2, advance dribble, drag screen de O5 mi-terrain pour mid-range / roll dunk.',
  defenseInitial: defaultDef(slobHighDragSetup),
  steps: [
    {
      label: 'Setup transition',
      off: slobHighDragSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-high',
      manualOverride: true,
    },
    {
      label: 'Outlet + drag screen',
      off: slobHighDragAdvance,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: slobHighDragSetup.O1, to: slobHighDragSetup.O2 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: slobHighDragSetup.O2, to: slobHighDragAdvance.O2 } as Annotation,
        { type: 'cut', fromId: 'O5', toId: null, from: slobHighDragSetup.O5, to: slobHighDragAdvance.O5 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: 'O2', from: slobHighDragAdvance.O5, to: slobHighDragAdvance.O5 } as Annotation,
      ],
    },
    {
      label: 'O2 mid-range + O5 roll',
      off: slobHighDragRoll,
      ballCarrier: 'O2',
      annotations: [
        { type: 'dribble', fromId: 'O2', toId: null, from: slobHighDragAdvance.O2, to: slobHighDragRoll.O2 } as Annotation,
        { type: 'cut', fromId: 'O5', toId: null, from: slobHighDragAdvance.O5, to: slobHighDragRoll.O5 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB HIGH QUICK — long pass d'avance direct
// ============================================================
//
// Pédagogie : "ne dribble pas, passe en avant". 2 steps : remise
// directe à O5 qui court vers le panier. Pour conditions où une
// défense pressante est en place et un coureur est libre devant.
// ------------------------------------------------------------

const slobHighQuickSetup: AttackerPositions = {
  O1: { x: 592, y: 440 },
  O2: { x: 480, y: 380 },  // ball-side outlet
  O3: { x: 200, y: 380 },  // weak outlet
  O4: { x: 350, y: 260 },  // milieu (=relai/spacing)
  O5: { x: 350, y: 130 },  // déjà avancé (= coureur)
};
const slobHighQuickFinish: AttackerPositions = {
  ...slobHighQuickSetup,
  O5: { x: 320, y: 90 },   // arrivée panier
};

const SLOB_HIGH_QUICK: Template = {
  id: 'slob-high-quick',
  name: 'SLOB haut · Quick advance',
  description: 'Transition express. O1 passe directement à O5 déjà parti vers le panier. Pas de dribble intermédiaire.',
  defenseInitial: defaultDef(slobHighQuickSetup),
  steps: [
    {
      label: 'Setup quick',
      off: slobHighQuickSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-high',
      manualOverride: true,
    },
    {
      label: 'O5 finit + long pass',
      off: slobHighQuickFinish,
      ballCarrier: 'O5',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: slobHighQuickSetup.O5, to: slobHighQuickFinish.O5 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O5', from: slobHighQuickSetup.O1, to: slobHighQuickFinish.O5 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// SLOB HIGH TRAP BREAK — bypass de trappe sideline
// ============================================================
//
// Scénario anti-presse : la défense piège ball-side après la remise.
// Solution : passe haute ball-side à O4 qui plonge derrière, O2
// (cutter) reçoit ensuite en haut du cercle pour avancer la balle.
// ------------------------------------------------------------

const slobHighTrapSetup: AttackerPositions = {
  O1: { x: 592, y: 440 },  // passeur (sous pression piège)
  O2: { x: 520, y: 360 },  // cutter ball-side (= advance final)
  O4: { x: 480, y: 460 },  // backup outlet ball-side
  O3: { x: 300, y: 380 },  // outlet milieu
  O5: { x: 200, y: 460 },  // outlet weak
};
const slobHighTrapHigh: AttackerPositions = {
  ...slobHighTrapSetup,
  O4: { x: 450, y: 380 },  // monte recevoir première passe
  O2: { x: 550, y: 280 },  // cut ball-side haut
};
const slobHighTrapAdvance: AttackerPositions = {
  ...slobHighTrapHigh,
  O2: { x: 520, y: 230 },  // wing ball-side, avance
};

const SLOB_HIGH_TRAP_BREAK: Template = {
  id: 'slob-high-trap-break',
  name: 'SLOB haut · Bypass trappe',
  description: 'Anti-presse. O4 monte ball-side recevoir, O2 cut derrière, passe vers le haut du cercle pour briser le trap sideline.',
  defenseInitial: defaultDef(slobHighTrapSetup),
  steps: [
    {
      label: 'Setup anti-trap',
      off: slobHighTrapSetup,
      ballCarrier: 'O1',
      annotations: [],
      context: 'inbound-sideline-high',
      manualOverride: true,
    },
    {
      label: 'O4 high + O2 cut',
      off: slobHighTrapHigh,
      ballCarrier: 'O4',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: slobHighTrapSetup.O4, to: slobHighTrapHigh.O4 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: slobHighTrapSetup.O2, to: slobHighTrapHigh.O2 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O4', from: slobHighTrapSetup.O1, to: slobHighTrapHigh.O4 } as Annotation,
      ],
    },
    {
      label: 'O4 → O2 advance',
      off: slobHighTrapAdvance,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: slobHighTrapHigh.O2, to: slobHighTrapAdvance.O2 } as Annotation,
        { type: 'pass', fromId: 'O4', toId: 'O2', from: slobHighTrapHigh.O4, to: slobHighTrapAdvance.O2 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// Liste exportée — agrégée dans CLASSIC_TEMPLATES de templates.ts
// ============================================================

export const INBOUND_TEMPLATES: Template[] = [
  BLOB_BOX_CURL,
  BLOB_STACK_CROSS,
  BLOB_TRIANGLE,
  BLOB_ZIPPER,
  BLOB_ELEVATOR,
  BLOB_HAWK,
  SLOB_STAGGER,
  SLOB_HAMMER,
  SLOB_IVERSON,
  SLOB_FLOPPY,
  SLOB_HIGH_OUTLET,
  SLOB_HIGH_DRAG,
  SLOB_HIGH_QUICK,
  SLOB_HIGH_TRAP_BREAK,
];
