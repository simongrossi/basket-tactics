import type { ZoneType, ZoneLayout, DefenderPositions } from '../types';

// Repères du terrain FIBA (HOOP en haut, panier à y=75, échelle ≈37 px/m) :
//  - y=20    : ligne de fond (baseline)
//  - y=75    : panier (centre de l'anneau)
//  - y=235   : ligne des lancers francs (FT line)
//  - y=302   : bas du cercle des LF (FT line + rayon 67px)
//  - y=325   : sommet de l'arc à 3pts (HOOP.y + radius 250)
//  - y=540   : ligne médiane
//  - x=210..390 : raquette (paint, 4.90 m de large)
//  - x=53 et x=547 : sections droites des coins 3 pts (0.90 m de la touche)
//  - x=20 et x=580 : touches latérales

// =============================================================
// ZONE 2-3 (textbook compact)
// =============================================================
// Référence : 5 défenseurs en formation 2-3 au repos.
//   - Top 2 (gardes) : aux ELBOWS de la FT line (juste au-dessus, à
//     l'aplomb des coins de raquette)
//   - Pivot : au coeur de la raquette, juste sous la FT line
//   - 2 forwards : aux LOW BLOCKS (1.75 m de la baseline, sur les
//     bords intérieurs de la raquette)
const ZONE_2_3: ZoneLayout = [
  // Back 3 — bande basse compacte y=20..240
  {
    id: 'pivot',
    label: 'Pivot',
    polygon: [
      { x: 210, y: 20 },
      { x: 390, y: 20 },
      { x: 390, y: 240 },
      { x: 210, y: 240 },
    ],
    homePos: { x: 300, y: 145 }, // milieu de la raquette, sous FT
    assignedTo: 'D5',
  },
  {
    id: 'wing-left',
    label: 'Aile basse G',
    polygon: [
      { x: 20, y: 20 },
      { x: 210, y: 20 },
      { x: 210, y: 240 },
      { x: 20, y: 240 },
    ],
    homePos: { x: 130, y: 145 }, // low block gauche étendu
    assignedTo: 'D4',
  },
  {
    id: 'wing-right',
    label: 'Aile basse D',
    polygon: [
      { x: 390, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 240 },
      { x: 390, y: 240 },
    ],
    homePos: { x: 470, y: 145 }, // low block droit étendu
    assignedTo: 'D3',
  },
  // Top 2 — bande haute y=240..540, gardes aux elbows
  {
    id: 'guard-left',
    label: 'Garde G',
    polygon: [
      { x: 20, y: 240 },
      { x: 300, y: 240 },
      { x: 300, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 235, y: 270 }, // elbow gauche (au-dessus FT line, à l'aplomb du coin de raquette)
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
    homePos: { x: 365, y: 270 }, // elbow droit
    assignedTo: 'D2',
  },
];

// =============================================================
// ZONE 2-1-2 (losange / diamant)
// =============================================================
//   - 2 fronts (gardes) au-dessus de la FT line, autour des elbows
//   - 1 milieu au cœur de la raquette (juste au-dessus du basket)
//   - 2 lows sur les low blocks de la raquette
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
    homePos: { x: 230, y: 360 }, // au-dessus de l'elbow gauche
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
    homePos: { x: 370, y: 360 }, // au-dessus de l'elbow droit
    assignedTo: 'D2',
  },
  // Cœur (bande médiane) — milieu de la raquette
  {
    id: 'middle',
    label: 'Cœur',
    polygon: [
      { x: 20, y: 160 },
      { x: 580, y: 160 },
      { x: 580, y: 320 },
      { x: 20, y: 320 },
    ],
    homePos: { x: 300, y: 200 }, // juste au-dessus du basket, dans la raquette
    assignedTo: 'D5',
  },
  // Lows — low blocks de la raquette
  {
    id: 'low-left',
    label: 'Low G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 160 },
      { x: 20, y: 160 },
    ],
    homePos: { x: 220, y: 110 }, // low block gauche
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
    homePos: { x: 380, y: 110 }, // low block droit
    assignedTo: 'D3',
  },
];

// =============================================================
// ZONE 1-3-1 (active / piège)
// =============================================================
//   - 1 chasseur au top of key étendu (au-dessus du sommet de l'arc 3pts)
//   - 3 alignés sur la FT line (G/C/D) — formant la barre du milieu
//   - 1 ancre directement sous le panier
const ZONE_1_3_1: ZoneLayout = [
  // Ancre (devant le panier)
  {
    id: 'anchor',
    label: 'Ancre',
    polygon: [
      { x: 20, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 160 },
      { x: 20, y: 160 },
    ],
    homePos: { x: 300, y: 100 }, // sous l'anneau, dans le no-charge
    assignedTo: 'D5',
  },
  // Mid 3 — alignés sur la FT line
  {
    id: 'mid-left',
    label: 'Mid G',
    polygon: [
      { x: 20, y: 160 },
      { x: 220, y: 160 },
      { x: 220, y: 380 },
      { x: 20, y: 380 },
    ],
    homePos: { x: 120, y: 235 }, // sur FT line, côté G (entre touche et raquette)
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
    homePos: { x: 300, y: 235 }, // sur FT line, milieu (au-dessus du cercle des LF)
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
    homePos: { x: 480, y: 235 }, // sur FT line, côté D
    assignedTo: 'D4',
  },
  // Chasseur — au top of key étendu
  {
    id: 'chaser',
    label: 'Chasseur',
    polygon: [
      { x: 20, y: 380 },
      { x: 580, y: 380 },
      { x: 580, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 300, y: 410 }, // top of key étendu (au-dessus du sommet 3pts à y=325)
    assignedTo: 'D1',
  },
];

// =============================================================
// ZONE 3-2 (focus perimeter)
// =============================================================
//   - 3 au top : G/C/D au top of key étendu, presque sur la ligne 3pts
//   - 2 en bas : low blocks de la raquette
const ZONE_3_2: ZoneLayout = [
  // Bottom 2 — y=20..220, low blocks
  {
    id: 'low-left',
    label: 'Bas G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 220 },
      { x: 20, y: 220 },
    ],
    homePos: { x: 230, y: 130 }, // low block gauche
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
    homePos: { x: 370, y: 130 }, // low block droit
    assignedTo: 'D5',
  },
  // Top 3 — y=220..540, sur la ligne 3pts
  {
    id: 'top-left',
    label: 'Top G',
    polygon: [
      { x: 20, y: 220 },
      { x: 200, y: 220 },
      { x: 200, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 110, y: 310 }, // wing G, sur la ligne 3pts
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
    homePos: { x: 300, y: 340 }, // top of key, juste au-dessus du sommet 3pts
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
    homePos: { x: 490, y: 310 }, // wing D
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

/**
 * Miroite un layout autour de la ligne médiane (y=540) pour le mode
 * `attackingDirection='down'`. Tous les points (polygones + homePos) sont
 * symétrisés. Utilisé quand la défense protège le panier bas.
 */
export function mirrorZoneLayout(layout: ZoneLayout): ZoneLayout {
  const flipY = (y: number) => 1080 - y;
  return layout.map((r) => ({
    ...r,
    polygon: r.polygon.map((p) => ({ x: p.x, y: flipY(p.y) })),
    homePos: { x: r.homePos.x, y: flipY(r.homePos.y) },
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
