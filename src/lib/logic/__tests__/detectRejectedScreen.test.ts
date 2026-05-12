// Tests B2 — détection de reject screen.

import { describe, expect, it } from 'vitest';
import type { AttackerPositions, DefenderPositions, Matchups } from '@/lib/types';
import { detectRejectedScreen } from '../screens';

const matchups: Matchups = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

// Defaults : D1 défend O1 au top of key.
const prevDef: DefenderPositions = {
  D1: { x: 300, y: 380 },
  D2: { x: 170, y: 310 },
  D3: { x: 430, y: 310 },
  D4: { x: 240, y: 160 },
  D5: { x: 360, y: 160 },
};

describe('detectRejectedScreen', () => {
  it('null si pas de prevOff', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 }, O5: { x: 380, y: 230 },
    };
    expect(detectRejectedScreen(off, null, 'O1', matchups, prevDef, 35)).toBeNull();
  });

  it("null si le porteur n'a quasiment pas bougé", () => {
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 }, O5: { x: 280, y: 380 }, // poseur proche D1
    };
    const off: AttackerPositions = { ...prevOff, O1: { x: 305, y: 472 } }; // bouge de 5px
    expect(detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35)).toBeNull();
  });

  it("détecte un reject net : poseur côté gauche, O1 drive côté droit opposé", () => {
    // N-1 : O5 vise un écran côté gauche d'O1 — O5 à (260, 410), proche de
    //   D1 (300, 380) ET du porteur O1 (300, 470). À ~50px de D1, ~70px d'O1.
    // N : O1 drive vers la DROITE (opposé du poseur), refusant l'écran.
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 260, y: 410 }, // ~50px de D1, ~70px d'O1, côté gauche
    };
    const off: AttackerPositions = {
      ...prevOff,
      O1: { x: 370, y: 480 }, // drive droite — opposé à O5 (gauche)
    };
    const reject = detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35);
    expect(reject).not.toBeNull();
    expect(reject!.screener).toBe('O5');
    expect(reject!.carrier).toBe('O1');
    expect(reject!.curDistance).toBeGreaterThan(reject!.prevDistance + 20);
  });

  it("null si mouvement seulement perpendiculaire au poseur (latéral, pas reject)", () => {
    // Même setup que ci-dessus mais O1 bouge perpendiculaire à l'axe O1→O5.
    // Ce N'est PAS un reject (pas de refus directionnel) — juste latéral.
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 300, y: 420 }, // poseur PILE au nord d'O1
    };
    const off: AttackerPositions = {
      ...prevOff,
      O1: { x: 360, y: 470 }, // bouge plein est — perpendiculaire à l'axe vertical
    };
    expect(detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35)).toBeNull();
  });

  it("détecte un reject SHARP (dot ≤ -0.7) : retraite directe loin du poseur", () => {
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 300, y: 400 }, // poseur à 70px AU NORD d'O1
    };
    const off: AttackerPositions = {
      ...prevOff,
      O1: { x: 300, y: 540 }, // O1 recule plein sud, opposé direct au poseur
    };
    const reject = detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35);
    expect(reject).not.toBeNull();
    expect(reject!.awayness).toBeLessThan(-0.7);
  });

  it('null si le porteur APPROCHE le poseur (use natural)', () => {
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 500 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 300, y: 400 }, // poseur au nord du porteur
    };
    // O1 monte vers O5 → use natural, pas reject.
    const off: AttackerPositions = { ...prevOff, O1: { x: 300, y: 450 } };
    expect(detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35)).toBeNull();
  });

  it('null si aucun candidat poseur proche du carrierDef à N-1', () => {
    // Pas d'attaquant proche de D1 à N-1.
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 50, y: 50 }, O3: { x: 550, y: 50 },
      O4: { x: 50, y: 100 }, O5: { x: 550, y: 100 },
    };
    const off: AttackerPositions = { ...prevOff, O1: { x: 380, y: 470 } };
    expect(detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35)).toBeNull();
  });

  it("null si la distance porteur ↔ poseur n'augmente pas assez", () => {
    // Poseur ET porteur bougent ensemble → divergence < seuil
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 }, O5: { x: 300, y: 400 },
    };
    const off: AttackerPositions = {
      ...prevOff,
      O1: { x: 330, y: 470 }, // bouge 30px à droite
      O5: { x: 325, y: 400 }, // poseur suit
    };
    const reject = detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35);
    expect(reject).toBeNull(); // divergence ~5px, sous le seuil 20
  });

  it("retourne le bon screenerDef + carrierDef depuis matchups", () => {
    const prevOff: AttackerPositions = {
      O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 }, O5: { x: 260, y: 410 }, // côté gauche
    };
    // Drive opposé (droite) — un vrai reject.
    const off: AttackerPositions = { ...prevOff, O1: { x: 370, y: 480 } };
    const reject = detectRejectedScreen(off, prevOff, 'O1', matchups, prevDef, 35);
    expect(reject).not.toBeNull();
    expect(reject!.screenerDef).toBe('D5'); // O5 est marqué par D5
    expect(reject!.carrierDef).toBe('D1');
  });
});
