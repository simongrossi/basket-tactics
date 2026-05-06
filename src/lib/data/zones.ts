import type { ZoneType, ZoneLayout, DefenderPositions } from '../types';

// Court: 600x560, hoop at (300, 75), paint 240-360 x 20-210
// Half-court playing area roughly y=20 to y=540

const ZONE_2_3: ZoneLayout = [
  {
    id: 'top-left',
    label: 'Guard G',
    polygon: [
      { x: 20, y: 260 },
      { x: 300, y: 260 },
      { x: 300, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 200, y: 370 },
    assignedTo: 'D1',
  },
  {
    id: 'top-right',
    label: 'Guard D',
    polygon: [
      { x: 300, y: 260 },
      { x: 580, y: 260 },
      { x: 580, y: 540 },
      { x: 300, y: 540 },
    ],
    homePos: { x: 400, y: 370 },
    assignedTo: 'D2',
  },
  {
    id: 'wing-left',
    label: 'Ailier G',
    polygon: [
      { x: 20, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 260 },
      { x: 20, y: 260 },
    ],
    homePos: { x: 130, y: 200 },
    assignedTo: 'D3',
  },
  {
    id: 'center',
    label: 'Pivot',
    polygon: [
      { x: 200, y: 20 },
      { x: 400, y: 20 },
      { x: 400, y: 260 },
      { x: 200, y: 260 },
    ],
    homePos: { x: 300, y: 160 },
    assignedTo: 'D4',
  },
  {
    id: 'wing-right',
    label: 'Ailier D',
    polygon: [
      { x: 400, y: 100 },
      { x: 580, y: 100 },
      { x: 580, y: 260 },
      { x: 400, y: 260 },
    ],
    homePos: { x: 470, y: 200 },
    assignedTo: 'D5',
  },
];

const ZONE_1_3_1: ZoneLayout = [
  {
    id: 'chaser',
    label: 'Chasseur',
    polygon: [
      { x: 120, y: 350 },
      { x: 480, y: 350 },
      { x: 480, y: 540 },
      { x: 120, y: 540 },
    ],
    homePos: { x: 300, y: 420 },
    assignedTo: 'D1',
  },
  {
    id: 'mid-left',
    label: 'Mid G',
    polygon: [
      { x: 20, y: 160 },
      { x: 200, y: 160 },
      { x: 200, y: 350 },
      { x: 20, y: 350 },
    ],
    homePos: { x: 140, y: 260 },
    assignedTo: 'D2',
  },
  {
    id: 'mid-center',
    label: 'Mid C',
    polygon: [
      { x: 200, y: 160 },
      { x: 400, y: 160 },
      { x: 400, y: 350 },
      { x: 200, y: 350 },
    ],
    homePos: { x: 300, y: 260 },
    assignedTo: 'D3',
  },
  {
    id: 'mid-right',
    label: 'Mid D',
    polygon: [
      { x: 400, y: 160 },
      { x: 580, y: 160 },
      { x: 580, y: 350 },
      { x: 400, y: 350 },
    ],
    homePos: { x: 460, y: 260 },
    assignedTo: 'D4',
  },
  {
    id: 'anchor',
    label: 'Ancre',
    polygon: [
      { x: 120, y: 20 },
      { x: 480, y: 20 },
      { x: 480, y: 160 },
      { x: 120, y: 160 },
    ],
    homePos: { x: 300, y: 100 },
    assignedTo: 'D5',
  },
];

const ZONE_3_2: ZoneLayout = [
  {
    id: 'top-center',
    label: 'Top C',
    polygon: [
      { x: 180, y: 300 },
      { x: 420, y: 300 },
      { x: 420, y: 540 },
      { x: 180, y: 540 },
    ],
    homePos: { x: 300, y: 400 },
    assignedTo: 'D1',
  },
  {
    id: 'top-left',
    label: 'Top G',
    polygon: [
      { x: 20, y: 200 },
      { x: 180, y: 200 },
      { x: 180, y: 540 },
      { x: 20, y: 540 },
    ],
    homePos: { x: 120, y: 330 },
    assignedTo: 'D2',
  },
  {
    id: 'top-right',
    label: 'Top D',
    polygon: [
      { x: 420, y: 200 },
      { x: 580, y: 200 },
      { x: 580, y: 540 },
      { x: 420, y: 540 },
    ],
    homePos: { x: 480, y: 330 },
    assignedTo: 'D3',
  },
  {
    id: 'low-left',
    label: 'Bas G',
    polygon: [
      { x: 20, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 200 },
      { x: 20, y: 200 },
    ],
    homePos: { x: 200, y: 130 },
    assignedTo: 'D4',
  },
  {
    id: 'low-right',
    label: 'Bas D',
    polygon: [
      { x: 300, y: 20 },
      { x: 580, y: 20 },
      { x: 580, y: 200 },
      { x: 300, y: 200 },
    ],
    homePos: { x: 400, y: 130 },
    assignedTo: 'D5',
  },
];

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
