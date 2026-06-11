// Templates d'attaque de zone (anti-zone offense).
//
// 3 systèmes de référence niveau lycée/NCAA/FIBA, conçus comme briques
// pédagogiques pour enseigner les principes anti-zone :
//
//  - Surcharge vs 2-3        : overload côté fort + entrée short corner,
//                              lectures en cascade (corner → renversement)
//  - Flash high post vs 2-3  : flash au nail (cœur mou de la 2-3) + high-low
//  - Renversement vs 1-3-1   : ball reversal express + entrée short corner
//                              (le trou structurel de la 1-3-1)
//
// Chaque template active automatiquement la défense de zone correspondante
// au chargement (`defenseSystem` + `zoneType`), et porte ses lectures sous
// forme de `scenarioBranches` — y compris une lecture MULTI-NIVEAUX
// (sous-branche) sur la surcharge, pour enseigner les décisions en cascade.

import type { AttackerPositions, Annotation } from '../types';
import type { Template } from './templates';
import { getZoneInitialPositions } from './zones';

// ============================================================
// 1. SURCHARGE vs ZONE 2-3 (overload)
// ============================================================
//
// Principe : placer 4 attaquants du même côté (aile + corner + short
// corner + slot) face aux 3 défenseurs du côté fort de la 2-3. Quelqu'un
// est forcément ouvert. L'entrée se fait au short corner — la zone
// morte derrière le low defender et devant le pivot.
//
// Lecture en cascade (multi-niveaux) :
//   entrée short corner → si le low sort → corner → si fermé → renversement
// ------------------------------------------------------------

const ovSetup: AttackerPositions = {
  O1: { x: 300, y: 390 },  // top of key
  O2: { x: 480, y: 270 },  // aile droite (côté surcharge)
  O3: { x: 540, y: 90 },   // corner droit
  O4: { x: 140, y: 280 },  // aile gauche (soupape de renversement)
  O5: { x: 225, y: 110 },  // poste bas gauche → flashera côté fort
};

const ovCross: AttackerPositions = {
  ...ovSetup,
  O5: { x: 330, y: 78 },   // traverse la raquette le long de la baseline
};

const ovFlash: AttackerPositions = {
  ...ovSetup,
  O5: { x: 430, y: 60 },   // short corner droit : le trou de la 2-3
};

const ovShot: AttackerPositions = {
  ...ovFlash,
  O5: { x: 410, y: 62 },   // monte vers le panier pour le tir baseline
};

const ANTI_ZONE_OVERLOAD_23: Template = {
  id: 'az-overload-23',
  name: 'Anti-zone 2-3 — Surcharge',
  tags: ['anti-zone', 'zone', 'overload', 'lecture'],
  description:
    "Surcharge du côté fort contre la zone 2-3 : 4 attaquants à droite face à 3 défenseurs. " +
    "O5 flash au short corner (la zone morte de la 2-3), reçoit et tire. " +
    "Lectures en cascade : si le low sort → corner O3 ; si le corner est fermé → renversement O4.",
  defenseSystem: 'zone',
  zoneType: 'zone-2-3',
  defenseInitial: getZoneInitialPositions('zone-2-3'),
  scriptedActions: [
    {
      kind: 'offensive',
      id: 'az-ov-1',
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
      label: 'Engager la zone côté fort',
    },
    {
      kind: 'offensive',
      id: 'az-ov-2',
      type: 'flash-cut',
      params: { cutter: 'O5', targetZone: 'short-corner-right' },
      label: 'O5 flash short corner',
    },
    {
      kind: 'offensive',
      id: 'az-ov-3',
      type: 'pass',
      params: { from: 'O2', to: 'O5' },
      label: 'Entrée short corner',
    },
    {
      kind: 'offensive',
      id: 'az-ov-4',
      type: 'shoot',
      params: { shooter: 'O5' },
      label: 'Tir baseline',
    },
  ],
  scenarioBranches: [
    {
      id: 'az-ov-b1',
      label: 'Si le low sort sur le short corner',
      divergeAfterActionId: 'az-ov-3',
      actions: [
        {
          kind: 'offensive',
          id: 'az-ov-b1-1',
          type: 'kick-out',
          params: { from: 'O5', to: 'O3' },
          label: 'Kick-out corner (laissé libre)',
        },
        {
          kind: 'offensive',
          id: 'az-ov-b1-2',
          type: 'shoot',
          params: { shooter: 'O3' },
          label: 'Tir 3pts corner',
        },
      ],
    },
    {
      id: 'az-ov-b2',
      label: 'Si la zone ferme le corner',
      divergeAfterActionId: 'az-ov-b1-1',
      parentBranchId: 'az-ov-b1',
      actions: [
        {
          kind: 'offensive',
          id: 'az-ov-b2-1',
          type: 'pass',
          params: { from: 'O3', to: 'O4' },
          label: 'Skip pass — renversement côté faible',
        },
        {
          kind: 'offensive',
          id: 'az-ov-b2-2',
          type: 'shoot',
          params: { shooter: 'O4' },
          label: 'Tir ouvert côté faible',
        },
      ],
    },
  ],
  steps: [
    {
      label: 'Setup — surcharge à droite',
      off: ovSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'O1 → O2 : engager la zone côté fort',
      off: ovSetup,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: ovSetup.O1, to: ovSetup.O2 } as Annotation,
      ],
    },
    {
      label: 'O5 traverse la raquette (baseline)',
      off: ovCross,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: ovSetup.O5, to: ovCross.O5 } as Annotation,
      ],
    },
    {
      label: 'O5 flash au short corner (trou de la 2-3)',
      off: ovFlash,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: ovCross.O5, to: ovFlash.O5 } as Annotation,
      ],
    },
    {
      label: 'Entrée O2 → O5 au short corner',
      off: ovFlash,
      ballCarrier: 'O5',
      annotations: [
        { type: 'pass', fromId: 'O2', toId: 'O5', from: ovFlash.O2, to: ovFlash.O5 } as Annotation,
      ],
    },
    {
      label: 'O5 tire de la baseline',
      off: ovShot,
      ballCarrier: 'O5',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: ovFlash.O5, to: ovShot.O5 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// 2. FLASH HIGH POST vs ZONE 2-3
// ============================================================
//
// Principe : la ligne des lancers francs est LE point faible structurel
// de la 2-3 — entre les deux gardes et devant le pivot. O5 flash au nail,
// reçoit, et joue le high-low avec O4 qui scelle derrière la zone.
// ------------------------------------------------------------

const hpSetup: AttackerPositions = {
  O1: { x: 300, y: 390 },  // top of key
  O2: { x: 130, y: 280 },  // aile gauche
  O3: { x: 470, y: 280 },  // aile droite
  O4: { x: 230, y: 105 },  // poste bas gauche (futur plongeur high-low)
  O5: { x: 370, y: 105 },  // poste bas droit → flashera au nail
};

const hpFlash: AttackerPositions = {
  ...hpSetup,
  O5: { x: 300, y: 240 },  // nail : cœur mou de la 2-3
};

const hpDive: AttackerPositions = {
  ...hpFlash,
  O4: { x: 255, y: 90 },   // O4 plonge et scelle sous le cercle
};

const ANTI_ZONE_HIGHPOST_23: Template = {
  id: 'az-highpost-23',
  name: 'Anti-zone 2-3 — Flash high post',
  tags: ['anti-zone', 'zone', 'high-post', 'lecture'],
  description:
    "Attaque du cœur de la zone 2-3 : O5 flash à la ligne des lancers francs (entre les deux " +
    "gardes, devant le pivot), reçoit, et joue le high-low avec O4 qui plonge derrière la zone. " +
    "Lectures : si le pivot reste bas → tir mi-distance ; si les gardes pincent → kick-out 3pts.",
  defenseSystem: 'zone',
  zoneType: 'zone-2-3',
  defenseInitial: getZoneInitialPositions('zone-2-3'),
  scriptedActions: [
    {
      kind: 'offensive',
      id: 'az-hp-1',
      type: 'flash-cut',
      params: { cutter: 'O5', targetZone: 'nail' },
      label: 'O5 flash au nail',
    },
    {
      kind: 'offensive',
      id: 'az-hp-2',
      type: 'pass',
      params: { from: 'O1', to: 'O5' },
      label: 'Entrée au high post',
    },
    {
      kind: 'offensive',
      id: 'az-hp-3',
      type: 'high-low-action',
      params: { from: 'O5', to: 'O4' },
      label: 'High-low vers le plongeur',
    },
    {
      kind: 'offensive',
      id: 'az-hp-4',
      type: 'shoot',
      params: { shooter: 'O4' },
      label: 'Finition au cercle',
    },
  ],
  scenarioBranches: [
    {
      id: 'az-hp-b1',
      label: 'Si le pivot reste bas',
      divergeAfterActionId: 'az-hp-2',
      actions: [
        {
          kind: 'offensive',
          id: 'az-hp-b1-1',
          type: 'shoot',
          params: { shooter: 'O5' },
          label: 'Tir mi-distance du nail',
        },
      ],
    },
    {
      id: 'az-hp-b2',
      label: 'Si les gardes pincent sur le flash',
      divergeAfterActionId: 'az-hp-2',
      actions: [
        {
          kind: 'offensive',
          id: 'az-hp-b2-1',
          type: 'kick-out',
          params: { from: 'O5', to: 'O3' },
          label: "Kick-out vers l'aile libérée",
        },
        {
          kind: 'offensive',
          id: 'az-hp-b2-2',
          type: 'shoot',
          params: { shooter: 'O3' },
          label: 'Tir 3pts aile',
        },
      ],
    },
  ],
  steps: [
    {
      label: 'Setup — 2 ailes, 2 postes bas',
      off: hpSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'O5 flash au nail (cœur de la 2-3)',
      off: hpFlash,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O5', toId: null, from: hpSetup.O5, to: hpFlash.O5 } as Annotation,
      ],
    },
    {
      label: 'Entrée O1 → O5 au high post',
      off: hpFlash,
      ballCarrier: 'O5',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O5', from: hpFlash.O1, to: hpFlash.O5 } as Annotation,
      ],
    },
    {
      label: 'O4 plonge — high-low O5 → O4',
      off: hpDive,
      ballCarrier: 'O4',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: hpFlash.O4, to: hpDive.O4 } as Annotation,
        { type: 'pass', fromId: 'O5', toId: 'O4', from: hpDive.O5, to: hpDive.O4 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// 3. RENVERSEMENT + SHORT CORNER vs ZONE 1-3-1
// ============================================================
//
// Principe : la 1-3-1 est forte sur l'axe et les ailes hautes, mais
// structurellement faible dans les corners et short corners (l'ancre
// seule couvre toute la baseline). Un renversement express force la
// ligne de 3 à traverser, et l'entrée au short corner met l'ancre
// dans un dilemme : sortir (panier ouvert derrière) ou rester (tir court).
// ------------------------------------------------------------

const scSetup: AttackerPositions = {
  O1: { x: 300, y: 455 },  // porteur, au-dessus du chasseur
  O2: { x: 470, y: 290 },  // aile droite
  O3: { x: 130, y: 290 },  // aile gauche (cible du renversement)
  O4: { x: 170, y: 60 },   // short corner gauche (occupe le trou)
  O5: { x: 300, y: 275 },  // high post, derrière le mid central
};

const scSwingMid: AttackerPositions = {
  ...scSetup,
};

const ANTI_ZONE_SHORTCORNER_131: Template = {
  id: 'az-shortcorner-131',
  name: 'Anti-zone 1-3-1 — Renversement short corner',
  tags: ['anti-zone', 'zone', 'short-corner', 'lecture'],
  description:
    "Attaque de la 1-3-1 par sa faiblesse structurelle : la baseline. Renversement express " +
    "O2 → O1 → O3 pour faire traverser la ligne de 3, puis entrée au short corner où l'ancre " +
    "est seule. Lectures : si l'ancre sort → O5 plonge au cercle ; si la ligne est coupée → high post.",
  defenseSystem: 'zone',
  zoneType: 'zone-1-3-1',
  defenseInitial: getZoneInitialPositions('zone-1-3-1'),
  scriptedActions: [
    {
      kind: 'offensive',
      id: 'az-sc-1',
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
      label: 'Engager à droite',
    },
    {
      kind: 'offensive',
      id: 'az-sc-2',
      type: 'ball-reversal',
      params: { chain: ['O2', 'O1', 'O3'] },
      label: 'Renversement express',
    },
    {
      kind: 'offensive',
      id: 'az-sc-3',
      type: 'pass',
      params: { from: 'O3', to: 'O4' },
      label: 'Entrée short corner',
    },
    {
      kind: 'offensive',
      id: 'az-sc-4',
      type: 'shoot',
      params: { shooter: 'O4' },
      label: 'Tir court baseline',
    },
  ],
  scenarioBranches: [
    {
      id: 'az-sc-b1',
      label: "Si l'ancre sort sur le short corner",
      divergeAfterActionId: 'az-sc-3',
      actions: [
        {
          kind: 'offensive',
          id: 'az-sc-b1-1',
          type: 'basket-cut',
          params: { cutter: 'O5' },
          label: "O5 plonge dans le dos de l'ancre",
        },
        {
          kind: 'offensive',
          id: 'az-sc-b1-2',
          type: 'pass',
          params: { from: 'O4', to: 'O5' },
          label: 'Passe au plongeur',
        },
        {
          kind: 'offensive',
          id: 'az-sc-b1-3',
          type: 'shoot',
          params: { shooter: 'O5' },
          label: 'Layup',
        },
      ],
    },
    {
      id: 'az-sc-b2',
      label: 'Si la ligne short corner est coupée',
      divergeAfterActionId: 'az-sc-2',
      actions: [
        {
          kind: 'offensive',
          id: 'az-sc-b2-1',
          type: 'pass',
          params: { from: 'O3', to: 'O5' },
          label: 'Entrée au high post',
        },
        {
          kind: 'offensive',
          id: 'az-sc-b2-2',
          type: 'shoot',
          params: { shooter: 'O5' },
          label: 'Tir mi-distance',
        },
      ],
    },
  ],
  steps: [
    {
      label: 'Setup — coins occupés face à la 1-3-1',
      off: scSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'O1 → O2 : engager à droite',
      off: scSetup,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: scSetup.O1, to: scSetup.O2 } as Annotation,
      ],
    },
    {
      label: 'Renversement : O2 → O1',
      off: scSwingMid,
      ballCarrier: 'O1',
      annotations: [
        { type: 'pass', fromId: 'O2', toId: 'O1', from: scSetup.O2, to: scSetup.O1 } as Annotation,
      ],
    },
    {
      label: 'Renversement : O1 → O3 (la zone traverse)',
      off: scSwingMid,
      ballCarrier: 'O3',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O3', from: scSetup.O1, to: scSetup.O3 } as Annotation,
      ],
    },
    {
      label: "Entrée O3 → O4 au short corner (dilemme de l'ancre)",
      off: scSwingMid,
      ballCarrier: 'O4',
      annotations: [
        { type: 'pass', fromId: 'O3', toId: 'O4', from: scSetup.O3, to: scSetup.O4 } as Annotation,
      ],
    },
  ],
};

// ============================================================
// EXPORT
// ============================================================

export const ANTI_ZONE_TEMPLATES: Template[] = [
  ANTI_ZONE_OVERLOAD_23,
  ANTI_ZONE_HIGHPOST_23,
  ANTI_ZONE_SHORTCORNER_131,
];
