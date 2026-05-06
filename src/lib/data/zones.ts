import type { ZoneType, ZoneLayout, DefenderPositions } from '../types';

// Repères du terrain (HOOP en haut) :
//  - y=20   : ligne de fond (baseline)
//  - y=75   : panier
//  - y=210  : ligne des lancers francs (FT line)
//  - y=270  : haut de la raquette / "top of key"
//  - y=295  : sommet de l'arc à 3pts
//  - y=540  : ligne médiane
//  - x=240..360 : raquette (paint)
//  - x=20 et x=580 : touches latérales

// =============================================================
// ZONE 2-3 (style Wikipedia / 2-3 compact)
// =============================================================
// Disposition standard :
//   - 2 gardes au top (au-dessus du top of key, jusqu'à la médiane)
//   - 3 derrière compacts autour du panier :
//     * pivot dans le cœur de la raquette (homePos très bas, ~y=110)
//     * 2 ailes au niveau des low blocks/short corners (~y=170)
// Ligne de partition à y=240 (juste au-dessus de la FT line) — les
// back-3 sont vraiment "back", pas étalés sur toute la moitié.
const ZONE_2_3: ZoneLayout = [
  // Back 3 — bande basse compacte y=20..240
  {
    id: 'pivot',
    label: 'Pivot',
    polygon: [
      { x: 200, y: 20 },
      { x: 400, y: 20 },
      { x: 400, y: 240 },
      { x: 200, y: 240 },
    ],
    homePos: { x: 300, y: 110 },
    assignedTo: 'D5',
  },
  {
    id: 'wing-left',
    label: 'Aile basse G',
    polygon: [
      { x: 20, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 240 },
      { x: 20, y: 240 },
    ],
    homePos: { x: 130, y: 170 },
    assignedTo: 'D4',
  },
  {
    id: 'wing-right',
    label: 'Aile basse D',
    polygon: [
      { x: 400, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 240 },
      { x: 400, y: 240 },
    ],
    homePos: { x: 470, y: 170 },
    assignedTo: 'D3',
  },
  // Top 2 — large bande haute y=240..540 (FT line jusqu'à médiane)
  {
    id: 'guard-left',
    label: 'Garde G',
    polygon: [
      { x: 20, y: 240 },
      { x: 300, y: 240 },
      { x: 300, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 200, y: 320 },
    assignedTo: 'D1',
  },
  {
    id: 'guard-right',
    label: 'Garde D',
    polygon: [
      { x: 300, y: 240 },
      { x: 580, y: 240 },
      { x: 580, y: 540 },
      { x: 300, y: 540 },
    ],
    homePos: { x: 400, y: 320 },
    assignedTo: 'D2',
  },
];

// =============================================================
// ZONE 2-1-2
// =============================================================
// Disposition en losange / diamant :
//   - 2 défenseurs au TOP (perimeter, gauche + droite)
//   - 1 au cœur de la raquette (autour de la FT line)
//   - 2 LOW BLOCKS sur les côtés, presque au niveau du panier
// Trois bandes verticales : bottom (y=20..160) / middle (y=160..320) /
// top (y=320..540).
const ZONE_2_1_2: ZoneLayout = [
  // Top 2 (perimeter)
  {
    id: 'front-left',
    label: 'Avant G',
    polygon: [
      { x: 20, y: 320 },
      { x: 300, y: 320 },
      { x: 300, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 200, y: 400 },
    assignedTo: 'D1',
  },
  {
    id: 'front-right',
    label: 'Avant D',
    polygon: [
      { x: 300, y: 320 },
      { x: 580, y: 320 },
      { x: 580, y: 540 },
      { x: 300, y: 540 },
    ],
    homePos: { x: 400, y: 400 },
    assignedTo: 'D2',
  },
  // Center (cœur de raquette, bande médiane)
  {
    id: 'middle',
    label: 'Cœur',
    polygon: [
      { x: 20, y: 160 },
      { x: 580, y: 160 },
      { x: 580, y: 320 },
      { x: 20, y: 320 },
    ],
    homePos: { x: 300, y: 240 },
    assignedTo: 'D5',
  },
  // Lows (presque au niveau panier, sur les côtés)
  {
    id: 'low-left',
    label: 'Low G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 160 },
      { x: 20, y: 160 },
    ],
    homePos: { x: 180, y: 100 },
    assignedTo: 'D4',
  },
  {
    id: 'low-right',
    label: 'Low D',
    polygon: [
      { x: 300, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 160 },
      { x: 300, y: 160 },
    ],
    homePos: { x: 420, y: 100 },
    assignedTo: 'D3',
  },
];

// =============================================================
// ZONE 1-3-1
// =============================================================
// Disposition standard :
//   - 1 ancre baseline (juste devant le panier)
//   - 3 sur la ligne médiane des LF (Mid G / Mid C / Mid D)
//   - 1 chasseur en haut (au-dessus du top of key)
const ZONE_1_3_1: ZoneLayout = [
  // Ancre (baseline)
  {
    id: 'anchor',
    label: 'Ancre',
    polygon: [
      { x: 20, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 160 },
      { x: 20, y: 160 },
    ],
    homePos: { x: 300, y: 90 },
    assignedTo: 'D5',
  },
  // Mid 3 (entre baseline et top of key)
  {
    id: 'mid-left',
    label: 'Mid G',
    polygon: [
      { x: 20, y: 160 },
      { x: 220, y: 160 },
      { x: 220, y: 380 },
      { x: 20, y: 380 },
    ],
    homePos: { x: 130, y: 250 },
    assignedTo: 'D2',
  },
  {
    id: 'mid-center',
    label: 'Mid C',
    polygon: [
      { x: 220, y: 160 },
      { x: 380, y: 160 },
      { x: 380, y: 380 },
      { x: 220, y: 380 },
    ],
    homePos: { x: 300, y: 240 },
    assignedTo: 'D3',
  },
  {
    id: 'mid-right',
    label: 'Mid D',
    polygon: [
      { x: 380, y: 160 },
      { x: 580, y: 160 },
      { x: 580, y: 380 },
      { x: 380, y: 380 },
    ],
    homePos: { x: 470, y: 250 },
    assignedTo: 'D4',
  },
  // Chasseur (top)
  {
    id: 'chaser',
    label: 'Chasseur',
    polygon: [
      { x: 20, y: 380 },
      { x: 580, y: 380 },
      { x: 580, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 300, y: 430 },
    assignedTo: 'D1',
  },
];

// =============================================================
// ZONE 3-2
// =============================================================
// Disposition standard : philosophie défensive haute (focus perimeter).
//   - 3 en HAUT qui montent jusqu'au top of key étendu (G / C / D)
//   - 2 derrière qui ne couvrent QUE la raquette + low blocks (bande basse
//     restreinte)
// Ligne de partition basse (y=220, juste au-dessus de la FT line) : les 2
// défenseurs du bas restent près du panier, les 3 du haut prennent
// presque tout le perimeter.
const ZONE_3_2: ZoneLayout = [
  // Bottom 2 — bande basse restreinte y=20..220 (raquette étendue)
  {
    id: 'low-left',
    label: 'Bas G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 220 },
      { x: 20, y: 220 },
    ],
    homePos: { x: 200, y: 110 },
    assignedTo: 'D4',
  },
  {
    id: 'low-right',
    label: 'Bas D',
    polygon: [
      { x: 300, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 220 },
      { x: 300, y: 220 },
    ],
    homePos: { x: 400, y: 110 },
    assignedTo: 'D5',
  },
  // Top 3 — large bande haute y=220..540 (du FT line à la médiane)
  {
    id: 'top-left',
    label: 'Top G',
    polygon: [
      { x: 20, y: 220 },
      { x: 200, y: 220 },
      { x: 200, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 110, y: 320 },
    assignedTo: 'D2',
  },
  {
    id: 'top-center',
    label: 'Top C',
    polygon: [
      { x: 200, y: 220 },
      { x: 400, y: 220 },
      { x: 400, y: 540 },
      { x: 200, y: 540 },
    ],
    homePos: { x: 300, y: 350 },
    assignedTo: 'D1',
  },
  {
    id: 'top-right',
    label: 'Top D',
    polygon: [
      { x: 400, y: 220 },
      { x: 580, y: 220 },
      { x: 580, y: 540 },
      { x: 400, y: 540 },
    ],
    homePos: { x: 490, y: 320 },
    assignedTo: 'D3',
  },
];

// Match-up : mêmes zones que 2-3 mais comportement de marquage individuel
// dans la zone (résolu côté logique zoneDefense, pas côté layout).
const ZONE_MATCHUP: ZoneLayout = ZONE_2_3.map((r) => ({ ...r }));

const layouts: Record<ZoneType, ZoneLayout> = {
  'zone-2-3': ZONE_2_3,
  'zone-1-3-1': ZONE_1_3_1,
  'zone-3-2': ZONE_3_2,
  'zone-2-1-2': ZONE_2_1_2,
  'zone-matchup': ZONE_MATCHUP,
};

export function getZoneLayout(type: ZoneType, verticalOffset: number = 0): ZoneLayout {
  const base = layouts[type];
  if (!verticalOffset) return base;
  return base.map((r) => ({
    ...r,
    polygon: r.polygon.map((p) => ({ x: p.x, y: p.y + verticalOffset })),
    homePos: { x: r.homePos.x, y: r.homePos.y + verticalOffset },
  }));
}

export function getZoneInitialPositions(type: ZoneType): DefenderPositions {
  const layout = layouts[type];
  const out = {} as DefenderPositions;
  layout.forEach((r) => {
    out[r.assignedTo] = { ...r.homePos };
  });
  return out;
}
