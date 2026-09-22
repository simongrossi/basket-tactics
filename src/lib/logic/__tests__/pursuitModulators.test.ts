import { describe, expect, it } from 'vitest';
import { headingDeg, pursuitAccelerationMultiplier } from '../defense/pursuitModulators';

describe('pursuitAccelerationMultiplier (poursuite V4 en lecture)', () => {
  it('neutre sans information', () => {
    expect(pursuitAccelerationMultiplier({ profile: undefined })).toBe(1);
  });
  it('profil athlétique : élite ×1,3, lent ×0,7', () => {
    expect(pursuitAccelerationMultiplier({ profile: 'elite' })).toBeCloseTo(1.3);
    expect(pursuitAccelerationMultiplier({ profile: 'lent' })).toBeCloseTo(0.7);
  });
  it('appuis : avancer ×1, pas chassés ×0,7, reculer ×0,6', () => {
    expect(pursuitAccelerationMultiplier({ profile: undefined, moveDeg: 10, bodyDeg: 0 })).toBe(1);
    expect(pursuitAccelerationMultiplier({ profile: undefined, moveDeg: 80, bodyDeg: 0 })).toBeCloseTo(0.7);
    expect(pursuitAccelerationMultiplier({ profile: undefined, moveDeg: 180, bodyDeg: 0 })).toBeCloseTo(0.6);
  });
  it('regard : homme vu ×1,2, homme dans le dos ×0,7', () => {
    expect(pursuitAccelerationMultiplier({ profile: undefined, gazeDeg: 0, toManDeg: 30 })).toBeCloseTo(1.2);
    expect(pursuitAccelerationMultiplier({ profile: undefined, gazeDeg: 0, toManDeg: 170 })).toBeCloseTo(0.7);
  });
  it('cap : 0° vers le haut du terrain, 90° vers la droite', () => {
    expect(headingDeg(0, -1)).toBeCloseTo(0);
    expect(headingDeg(1, 0)).toBeCloseTo(90);
  });
});
