import type { AttackerPositions } from '../types';

/** Formations d'attaque de départ prédéfinies pour les coachs */
export interface StartingFormation {
  id: string;
  name: string;
  description: string;
  positions: AttackerPositions;
}

export const STARTING_FORMATIONS: StartingFormation[] = [
  {
    id: '5-out',
    name: '5-Out Open',
    description: '5 joueurs au large derrière l’arc pour un spacing maximal.',
    positions: {
      O1: { x: 300, y: 400 }, // Top
      O2: { x: 100, y: 260 }, // Wing G
      O3: { x: 500, y: 260 }, // Wing D
      O4: { x: 55, y: 90 },   // Corner G
      O5: { x: 545, y: 90 },  // Corner D
    },
  },
  {
    id: '4-out-1-in',
    name: '4-Out 1-In',
    description: '4 joueurs périphériques + 1 pivot au poste bas / dunker spot.',
    positions: {
      O1: { x: 300, y: 400 }, // Top
      O2: { x: 100, y: 260 }, // Wing G
      O3: { x: 500, y: 260 }, // Wing D
      O4: { x: 55, y: 90 },   // Corner G
      O5: { x: 385, y: 120 }, // Low Post / Dunker D
    },
  },
  {
    id: 'horns',
    name: 'Horns (Cornes)',
    description: 'Meneur central, 2 intérieurs aux coudes (elbows), 2 shooteurs aux coins.',
    positions: {
      O1: { x: 300, y: 400 }, // Top
      O4: { x: 220, y: 235 }, // Elbow G
      O5: { x: 380, y: 235 }, // Elbow D
      O2: { x: 55, y: 90 },   // Corner G
      O3: { x: 545, y: 90 },  // Corner D
    },
  },
  {
    id: '1-4-high',
    name: '1-4 High',
    description: '1 meneur haut et 4 attaquants alignés sur la ligne des lancers-francs prolongée.',
    positions: {
      O1: { x: 300, y: 420 }, // Top
      O2: { x: 80, y: 235 },  // Wing G
      O4: { x: 225, y: 235 }, // Elbow G
      O5: { x: 375, y: 235 }, // Elbow D
      O3: { x: 520, y: 235 }, // Wing D
    },
  },
  {
    id: '1-4-low',
    name: '1-4 Low (Flat)',
    description: '1 meneur haut et 4 attaquants bas le long de la ligne de fond.',
    positions: {
      O1: { x: 300, y: 410 }, // Top
      O2: { x: 55, y: 90 },   // Corner G
      O4: { x: 220, y: 95 },  // Low post G
      O5: { x: 380, y: 95 },  // Low post D
      O3: { x: 545, y: 90 },  // Corner D
    },
  },
];
