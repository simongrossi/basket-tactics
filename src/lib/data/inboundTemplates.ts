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
// Liste exportée — agrégée dans CLASSIC_TEMPLATES de templates.ts
// ============================================================

export const INBOUND_TEMPLATES: Template[] = [
  BLOB_BOX_CURL,
  BLOB_STACK_CROSS,
  SLOB_STAGGER,
  SLOB_HAMMER,
];
