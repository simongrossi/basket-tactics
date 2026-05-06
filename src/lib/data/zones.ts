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
// ZONE 2-3
// =============================================================
// Disposition standard :
//   - 2 gardes en HAUT (au-dessus du top of key, vers la médiane)
//   - 3 derrière (proches du panier) : pivot dans la raquette,
//     2 ailes qui couvrent corners + ailes basses
const ZONE_2_3: ZoneLayout = [
  // Back 3 (y=20..280)
  {
    id: 'pivot',
    label: 'Pivot',
    polygon: [
      { x: 200, y: 20 },
      { x: 400, y: 20 },
      { x: 400, y: 280 },
      { x: 200, y: 280 },
    ],
    homePos: { x: 300, y: 130 },
    assignedTo: 'D5',
  },
  {
    id: 'wing-left',
    label: 'Aile basse G',
    polygon: [
      { x: 20, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 280 },
      { x: 20, y: 280 },
    ],
    homePos: { x: 110, y: 180 },
    assignedTo: 'D4',
  },
  {
    id: 'wing-right',
    label: 'Aile basse D',
    polygon: [
      { x: 400, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 280 },
      { x: 400, y: 280 },
    ],
    homePos: { x: 490, y: 180 },
    assignedTo: 'D3',
  },
  // Top 2 (y=280..540)
  {
    id: 'guard-left',
    label: 'Garde G',
    polygon: [
      { x: 20, y: 280 },
      { x: 300, y: 280 },
      { x: 300, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 200, y: 350 },
    assignedTo: 'D1',
  },
  {
    id: 'guard-right',
    label: 'Garde D',
    polygon: [
      { x: 300, y: 280 },
      { x: 580, y: 280 },
      { x: 580, y: 540 },
      { x: 300, y: 540 },
    ],
    homePos: { x: 400, y: 350 },
    assignedTo: 'D2',
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
// Disposition standard :
//   - 3 en HAUT (Top G / Top C / Top D)
//   - 2 derrière (proches du panier)
const ZONE_3_2: ZoneLayout = [
  // Bottom 2 (y=20..280)
  {
    id: 'low-left',
    label: 'Bas G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 280 },
      { x: 20, y: 280 },
    ],
    homePos: { x: 180, y: 140 },
    assignedTo: 'D4',
  },
  {
    id: 'low-right',
    label: 'Bas D',
    polygon: [
      { x: 300, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 280 },
      { x: 300, y: 280 },
    ],
    homePos: { x: 420, y: 140 },
    assignedTo: 'D5',
  },
  // Top 3 (y=280..540) — 1/3 chacune
  {
    id: 'top-left',
    label: 'Top G',
    polygon: [
      { x: 20, y: 280 },
      { x: 200, y: 280 },
      { x: 200, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 130, y: 360 },
    assignedTo: 'D2',
  },
  {
    id: 'top-center',
    label: 'Top C',
    polygon: [
      { x: 200, y: 280 },
      { x: 400, y: 280 },
      { x: 400, y: 540 },
      { x: 200, y: 540 },
    ],
    homePos: { x: 300, y: 360 },
    assignedTo: 'D1',
  },
  {
    id: 'top-right',
    label: 'Top D',
    polygon: [
      { x: 400, y: 280 },
      { x: 580, y: 280 },
      { x: 580, y: 540 },
      { x: 400, y: 540 },
    ],
    homePos: { x: 470, y: 360 },
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
  'zone-matchup': ZONE_MATCHUP,
};

export function getZoneLayout(type: ZoneType): ZoneLayout {
  return layouts[type];
}

export function getZoneInitialPositions(type: ZoneType): DefenderPositions {
  const layout = layouts[type];
  const out = {} as DefenderPositions;
  layout.forEach((r) => {
    out[r.assignedTo] = { ...r.homePos };
  });
  return out;
}
