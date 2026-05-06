import { describe, it, expect } from 'vitest';
import { offBallStanceTarget } from '../manDefense';

describe('offBallStanceTarget — stunt', () => {
  it("place le défenseur entre son homme et la ligne homme↔ballon (fake d'aide)", () => {
    const att = { x: 470, y: 380 };
    const ball = { x: 300, y: 470 };
    const t = offBallStanceTarget(att, ball, 40, 'stunt');
    expect(t).not.toBeNull();
    // Distance att→target = ~defenseDistance (40), comme les autres stances
    const dAttTarget = Math.hypot(t!.x - att.x, t!.y - att.y);
    expect(dAttTarget).toBeGreaterThan(20);
    expect(dAttTarget).toBeLessThan(50);
  });

  it("le stunt est moins agressif que fronting (plus proche de behind que de fronting)", () => {
    const att = { x: 470, y: 380 };
    const ball = { x: 300, y: 470 };
    const stunt = offBallStanceTarget(att, ball, 40, 'stunt')!;
    const front = offBallStanceTarget(att, ball, 40, 'fronting')!;
    const back = offBallStanceTarget(att, ball, 40, 'sag')!; // = manTarget = behind

    const distToFront = Math.hypot(stunt.x - front.x, stunt.y - front.y);
    const distToBack = Math.hypot(stunt.x - back.x, stunt.y - back.y);
    // Stunt est plus proche de la position behind (sag) que de fronting
    expect(distToBack).toBeLessThan(distToFront);
  });

  it("se rabat sur manTarget si pas de ballon disponible", () => {
    const att = { x: 470, y: 380 };
    const t = offBallStanceTarget(att, undefined, 40, 'stunt');
    expect(t).not.toBeNull();
    // Position sur l'axe homme-panier
    // panier en (300, 75), att en (470, 380), donc target.x entre 300 et 470
    expect(t!.x).toBeGreaterThan(300);
    expect(t!.x).toBeLessThan(470);
  });
});
