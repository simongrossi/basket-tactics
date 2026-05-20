// Tests — hystérésis de détection d'écran hors-ballon.
//
// Une fois une paire (cutter, screener) détectée, son rayon de
// détection est élargi de `OFFBALL_SCREEN_HYSTERESIS_PX` au step
// suivant. Évite le clignotement quand le défenseur du cutter navigue
// autour de l'écran (couverture `over`) et sort du `screenRadius`.

import { describe, expect, it } from 'vitest';
import {
  detectOffBallScreens,
  offBallScreenPairKey,
  offBallScreenPairKeys,
} from '@/lib/logic/screens';
import { OFFBALL_SCREEN_HYSTERESIS_PX } from '@/lib/data/physics';
import type { AttackerPositions, DefenderId, Matchups, Point } from '@/lib/types';

const SCREEN_RADIUS = 35;

const MATCHUPS: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };

const OFF: AttackerPositions = {
  O1: { x: 300, y: 470 }, // porteur
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 }, // cutter
  O4: { x: 220, y: 230 },
  O5: { x: 440, y: 320 }, // poseur
};

// prevOff identique → hasScreenIntent satisfait (poseur immobile).
const PREV_OFF: AttackerPositions = { ...OFF };

describe('OFFBALL_SCREEN_HYSTERESIS_PX', () => {
  it('constante exportée = 14 px', () => {
    expect(OFFBALL_SCREEN_HYSTERESIS_PX).toBe(14);
  });
});

describe('offBallScreenPairKey / offBallScreenPairKeys', () => {
  it('clé canonique cutter:screener', () => {
    expect(offBallScreenPairKey('O3', 'O5')).toBe('O3:O5');
  });

  it('extrait les paires d\'une liste d\'écrans', () => {
    const def: Record<DefenderId, Point> = {
      D1: { x: 300, y: 430 }, D2: { x: 130, y: 340 },
      D3: { x: 445, y: 345 }, // proche d'O5 → écran détecté
      D4: { x: 220, y: 270 }, D5: { x: 440, y: 360 },
    };
    const screens = detectOffBallScreens(OFF, 'O1', MATCHUPS, def, SCREEN_RADIUS, PREV_OFF);
    const keys = offBallScreenPairKeys(screens);
    expect(keys.has('O3:O5')).toBe(true);
  });
});

describe('detectOffBallScreens — hystérésis', () => {
  // D3 placé à 47 px d'O5 : HORS du screenRadius=35, mais DANS le rayon
  // de maintien élargi 35 + 14 = 49 px.
  const defD3Far: Record<DefenderId, Point> = {
    D1: { x: 300, y: 430 }, D2: { x: 130, y: 340 },
    D3: { x: 440, y: 367 }, // exactement 47 px d'O5 (440,320)
    D4: { x: 220, y: 270 }, D5: { x: 440, y: 360 },
  };

  it('SANS hystérésis : D3 à 47 px → écran NON détecté (> screenRadius 35)', () => {
    const screens = detectOffBallScreens(OFF, 'O1', MATCHUPS, defD3Far, SCREEN_RADIUS, PREV_OFF);
    expect(screens.some((s) => s.cutter === 'O3' && s.screener === 'O5')).toBe(false);
  });

  it('AVEC hystérésis (paire active au step précédent) : D3 à 47 px → écran MAINTENU', () => {
    const prevPairs = new Set([offBallScreenPairKey('O3', 'O5')]);
    const screens = detectOffBallScreens(
      OFF, 'O1', MATCHUPS, defD3Far, SCREEN_RADIUS, PREV_OFF, prevPairs,
    );
    expect(screens.some((s) => s.cutter === 'O3' && s.screener === 'O5')).toBe(true);
  });

  it('hystérésis bornée : D3 au-delà du rayon élargi (49 px) → écran perdu même si actif avant', () => {
    const defD3VeryFar: Record<DefenderId, Point> = {
      ...defD3Far,
      D3: { x: 440, y: 375 }, // 55 px d'O5 → au-delà de 35+14=49
    };
    const prevPairs = new Set([offBallScreenPairKey('O3', 'O5')]);
    const screens = detectOffBallScreens(
      OFF, 'O1', MATCHUPS, defD3VeryFar, SCREEN_RADIUS, PREV_OFF, prevPairs,
    );
    expect(screens.some((s) => s.cutter === 'O3' && s.screener === 'O5')).toBe(false);
  });

  it('hystérésis ne s\'applique qu\'à la paire concernée (pas globale)', () => {
    // Paire O2:O5 marquée active, mais c'est O3 le cutter réel.
    // D3 à 47 px ne doit PAS bénéficier de l'hystérésis d'une autre paire.
    const prevPairs = new Set([offBallScreenPairKey('O2', 'O5')]);
    const screens = detectOffBallScreens(
      OFF, 'O1', MATCHUPS, defD3Far, SCREEN_RADIUS, PREV_OFF, prevPairs,
    );
    expect(screens.some((s) => s.cutter === 'O3' && s.screener === 'O5')).toBe(false);
  });
});
