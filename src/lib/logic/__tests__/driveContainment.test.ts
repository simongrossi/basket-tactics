import { describe, it, expect } from 'vitest';
import {
  evaluateDriveContainment,
  containmentSpeed,
  DRIVE_MIN_GAIN_PX,
} from '../driveContainment';

const hoop = { x: 250, y: 90 };

describe('containmentSpeed', () => {
  it('module la base par tier (elite ×1.3, lent ×0.7, défaut ×1.0)', () => {
    expect(containmentSpeed('elite', 10)).toBeCloseTo(13);
    expect(containmentSpeed('lent', 10)).toBeCloseTo(7);
    expect(containmentSpeed('standard', 10)).toBeCloseTo(10);
    expect(containmentSpeed(undefined, 10)).toBeCloseTo(10);
  });
});

describe('evaluateDriveContainment', () => {
  it('isDriving=false si le porteur ne gagne pas de terrain vers le panier', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 400 },
      defender: { x: 250, y: 360 },
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(false);
  });

  it('walled : défenseur déjà sur la ligne, devant le porteur → arrive avant', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 250 },
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('walled');
    expect(r.margin).toBeLessThan(0);
  });

  it('beaten : défenseur loin derrière → blow-by', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 470 },
      hoop,
      carrierSpeed: 12,
      defenderSpeed: 8,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('beaten');
    expect(r.margin).toBeGreaterThan(0);
  });

  it('contained : défenseur latéral à marge ~nulle (photo-finish)', () => {
    // Défenseur 30px de côté, à hauteur d'un point situé 30px en amont sur la
    // ligne → etaCarrier = etaDef = 3.0 steps → marge ~0 → contained.
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 280, y: 370 },
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('contained');
  });

  it('containPoint reste entre le porteur et le panier (jamais derrière le porteur)', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 470 },
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.containPoint.y).toBeGreaterThanOrEqual(90);
    expect(r.containPoint.y).toBeLessThanOrEqual(400);
  });

  it('garde-fou : vitesse ≤ 0 ne produit pas de NaN', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 250 },
      hoop,
      carrierSpeed: 0,
      defenderSpeed: 0,
    });
    expect(Number.isNaN(r.margin)).toBe(false);
  });

  it('DRIVE_MIN_GAIN_PX exporté pour calibration', () => {
    expect(typeof DRIVE_MIN_GAIN_PX).toBe('number');
  });
});
