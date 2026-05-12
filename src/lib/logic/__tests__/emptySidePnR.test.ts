// Tests B5 — empty side PnR detection.

import { describe, expect, it } from 'vitest';
import type { AttackerPositions, DetectedScreen } from '@/lib/types';
import { isEmptySidePnR } from '../screens';

// PnR central : O1 porteur en bas, O5 poseur juste devant.
// Panier en haut (300, 75).
const screen: DetectedScreen = {
  screener: 'O5',
  screenerDef: 'D5',
  carrier: 'O1',
  carrierDef: 'D1',
  screenerPos: { x: 300, y: 350 },
};

describe('isEmptySidePnR', () => {
  it('vrai si tous les autres attaquants sont du côté OPPOSÉ au porteur', () => {
    // O1 à gauche (x < 300), tous les autres à droite.
    const off: AttackerPositions = {
      O1: { x: 250, y: 470 }, // côté gauche
      O2: { x: 450, y: 380 }, // côté droit
      O3: { x: 500, y: 200 }, // côté droit
      O4: { x: 480, y: 300 }, // côté droit
      O5: { x: 300, y: 350 },
    };
    expect(isEmptySidePnR(screen, off)).toBe(true);
  });

  it('faux si un autre attaquant est du même côté que le porteur', () => {
    const off: AttackerPositions = {
      O1: { x: 250, y: 470 }, // côté gauche
      O2: { x: 200, y: 380 }, // côté gauche → casse le empty
      O3: { x: 500, y: 200 },
      O4: { x: 480, y: 300 },
      O5: { x: 300, y: 350 },
    };
    expect(isEmptySidePnR(screen, off)).toBe(false);
  });

  it('vrai même si attaquants côté opposé en grand nombre', () => {
    const off: AttackerPositions = {
      O1: { x: 350, y: 470 }, // côté droit
      O2: { x: 100, y: 380 }, // gauche
      O3: { x: 50, y: 200 }, // gauche
      O4: { x: 150, y: 300 }, // gauche
      O5: { x: 300, y: 350 },
    };
    expect(isEmptySidePnR(screen, off)).toBe(true);
  });

  it("faux si porteur quasi sur l'axe (pas de notion de côté)", () => {
    const off: AttackerPositions = {
      O1: { x: 302, y: 470 }, // sur l'axe (≤ 5px du centre)
      O2: { x: 100, y: 380 },
      O3: { x: 500, y: 200 },
      O4: { x: 480, y: 300 },
      O5: { x: 300, y: 350 },
    };
    expect(isEmptySidePnR(screen, off)).toBe(false);
  });

  it("ignore les attaquants quasi sur l'axe (ne cassent pas le empty)", () => {
    const off: AttackerPositions = {
      O1: { x: 250, y: 470 }, // gauche
      O2: { x: 302, y: 380 }, // sur l'axe, ignoré
      O3: { x: 500, y: 200 }, // droit
      O4: { x: 480, y: 300 }, // droit
      O5: { x: 300, y: 350 },
    };
    expect(isEmptySidePnR(screen, off)).toBe(true);
  });
});
