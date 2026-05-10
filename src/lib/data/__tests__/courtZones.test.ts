import { describe, it, expect } from 'vitest';
import {
  COURT_ZONES,
  ALL_ABSOLUTE_ZONE_IDS,
  ALL_RELATIVE_ZONE_IDS,
  ZONES_BY_CATEGORY,
  resolveZone,
  resolveZoneId,
  ballSideFromCarrier,
  isAbsoluteZone,
  isRelativeZone,
  type AbsoluteZoneId,
} from '@/lib/data/courtZones';

describe('COURT_ZONES — catalogue absolu', () => {
  it('contient au moins 20 zones FIBA/NBA principales', () => {
    expect(ALL_ABSOLUTE_ZONE_IDS.length).toBeGreaterThanOrEqual(20);
  });

  it('toutes les zones latéralisées ont un mirror défini de l\'autre côté', () => {
    for (const id of ALL_ABSOLUTE_ZONE_IDS) {
      const def = COURT_ZONES[id];
      if (!def.mirror) continue;
      const mirror = COURT_ZONES[def.mirror];
      expect(mirror, `mirror ${def.mirror} de ${id} doit exister`).toBeDefined();
      expect(mirror.mirror).toBe(id); // symétrie
    }
  });

  it('les miroirs ont des x symétriques par rapport à l\'axe central (300)', () => {
    for (const id of ALL_ABSOLUTE_ZONE_IDS) {
      const def = COURT_ZONES[id];
      if (!def.mirror) continue;
      const mirror = COURT_ZONES[def.mirror];
      expect(def.point.x + mirror.point.x).toBe(600);
      expect(def.point.y).toBe(mirror.point.y);
    }
  });

  it('les zones d\'axe (top-of-key, nail, logo, point-guard-spot) sont sur x=300', () => {
    expect(COURT_ZONES['top-of-key'].point.x).toBe(300);
    expect(COURT_ZONES['nail'].point.x).toBe(300);
    expect(COURT_ZONES['logo'].point.x).toBe(300);
    expect(COURT_ZONES['point-guard-spot'].point.x).toBe(300);
    expect(COURT_ZONES['midline-center'].point.x).toBe(300);
  });

  it('les zones d\'axe n\'ont pas de mirror (elles sont sur l\'axe)', () => {
    expect(COURT_ZONES['top-of-key'].mirror).toBeUndefined();
    expect(COURT_ZONES['nail'].mirror).toBeUndefined();
    expect(COURT_ZONES['logo'].mirror).toBeUndefined();
  });
});

describe('ZONES_BY_CATEGORY', () => {
  it('groupe les zones en 5 catégories non vides', () => {
    expect(Object.keys(ZONES_BY_CATEGORY).sort()).toEqual(
      ['aile', 'axe', 'coin', 'poste', 'transition'].sort()
    );
    for (const [cat, zones] of Object.entries(ZONES_BY_CATEGORY)) {
      expect(zones.length, `catégorie ${cat} doit contenir au moins une zone`).toBeGreaterThan(0);
    }
  });

  it('chaque zone du catalogue est exactement dans une catégorie', () => {
    const total = Object.values(ZONES_BY_CATEGORY).reduce((acc, arr) => acc + arr.length, 0);
    expect(total).toBe(ALL_ABSOLUTE_ZONE_IDS.length);
  });
});

describe('isAbsoluteZone / isRelativeZone', () => {
  it('reconnaît une zone absolue', () => {
    expect(isAbsoluteZone('wing-left')).toBe(true);
    expect(isAbsoluteZone('nail')).toBe(true);
    expect(isAbsoluteZone('wing-strong')).toBe(false);
  });

  it('reconnaît une zone relative', () => {
    expect(isRelativeZone('wing-strong')).toBe(true);
    expect(isRelativeZone('corner-weak')).toBe(true);
    expect(isRelativeZone('wing-left')).toBe(false);
    expect(isRelativeZone('nail')).toBe(false);
  });
});

describe('resolveZone — zones absolues', () => {
  it('renvoie le point de la zone absolue (ballSide ignoré)', () => {
    const w = COURT_ZONES['wing-left'].point;
    expect(resolveZone('wing-left', 'left')).toEqual(w);
    expect(resolveZone('wing-left', 'right')).toEqual(w);
  });

  it('renvoie le nail sur l\'axe', () => {
    const p = resolveZone('nail', 'left');
    expect(p).toEqual({ x: 300, y: 235 });
  });
});

describe('resolveZone — zones relatives (fort/faible)', () => {
  it('porteur côté droit → strong = right', () => {
    expect(resolveZone('wing-strong', 'right')).toEqual(COURT_ZONES['wing-right'].point);
    expect(resolveZone('corner-strong', 'right')).toEqual(COURT_ZONES['corner-right'].point);
    expect(resolveZone('low-block-strong', 'right')).toEqual(COURT_ZONES['low-block-right'].point);
  });

  it('porteur côté droit → weak = left', () => {
    expect(resolveZone('wing-weak', 'right')).toEqual(COURT_ZONES['wing-left'].point);
    expect(resolveZone('short-corner-weak', 'right')).toEqual(COURT_ZONES['short-corner-left'].point);
  });

  it('porteur côté gauche → strong = left', () => {
    expect(resolveZone('wing-strong', 'left')).toEqual(COURT_ZONES['wing-left'].point);
    expect(resolveZone('high-post-strong', 'left')).toEqual(COURT_ZONES['high-post-left'].point);
  });

  it('porteur côté gauche → weak = right', () => {
    expect(resolveZone('wing-weak', 'left')).toEqual(COURT_ZONES['wing-right'].point);
  });

  it('toutes les zones relatives résolvent vers une zone absolue valide', () => {
    for (const rel of ALL_RELATIVE_ZONE_IDS) {
      const left = resolveZoneId(rel, 'left');
      const right = resolveZoneId(rel, 'right');
      expect(ALL_ABSOLUTE_ZONE_IDS).toContain<AbsoluteZoneId>(left);
      expect(ALL_ABSOLUTE_ZONE_IDS).toContain<AbsoluteZoneId>(right);
      // strong/weak doivent être des miroirs l'un de l'autre
      expect(COURT_ZONES[left].mirror).toBe(right);
    }
  });
});

describe('ballSideFromCarrier', () => {
  it('porteur en x < 300 → left', () => {
    expect(ballSideFromCarrier({ x: 100, y: 300 })).toBe('left');
    expect(ballSideFromCarrier({ x: 299, y: 300 })).toBe('left');
  });

  it('porteur en x >= 300 → right (l\'axe central est arbitrairement attribué au côté droit)', () => {
    expect(ballSideFromCarrier({ x: 300, y: 300 })).toBe('right');
    expect(ballSideFromCarrier({ x: 500, y: 300 })).toBe('right');
  });
});
