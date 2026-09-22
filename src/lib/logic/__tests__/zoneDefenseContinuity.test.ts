import { describe, expect, it } from 'vitest';
import { baseMatchups, makeInitialState } from '../../data/initial';
import { HOOP } from '../../data/court';
import { getZoneLayout } from '../../data/zones';
import type { AttackerPositions, DefenderId } from '../../types';
import { detectOpenPassThreats } from '../threatResolution';
import { computeZoneTargets } from '../zoneDefense';

// Reconstitution des deux captures du bug : seul O1 bouge, de quelques
// pixels ; D5 sautait d'environ 73 px (2 m), D2 d'environ 60 px.
const screenshotOff: AttackerPositions = {
  O1: { x: 195, y: 468 },
  O2: { x: 102, y: 241 },
  O3: { x: 470, y: 379 },
  O4: { x: 66, y: 114 },
  O5: { x: 544, y: 79 },
};
const layout = getZoneLayout('zone-2-1-2');
const config = { ...makeInitialState().zoneConfig, type: 'zone-2-1-2' as const };

describe('zone 2-1-2 — continuité des couvertures de passe', () => {
  it('une passe vers un corner déjà couvert ne vole pas le couvreur de O2', () => {
    const homes = Object.fromEntries(layout.map((zone) => [zone.assignedTo, zone.homePos]));
    const unavailable = new Set<DefenderId>(['D1', 'D3', 'D4']);

    // À x=190, la ligne O1→O5 dépasse tout juste le seuil de passe ouverte.
    // O4 et O5 sont déjà couverts par les low defenders. Les ignorer APRÈS
    // les désignations réservait D5 puis D2 inutilement, laissant O2 libre.
    for (const x of [191, 190]) {
      const threats = detectOpenPassThreats(
        { ...screenshotOff, O1: { x, y: 468 } },
        'O1', HOOP, homes, unavailable, baseMatchups, new Set(['O4', 'O5'])
      );
      expect(threats.map((threat) => threat.receiver)).not.toContain('O4');
      expect(threats.map((threat) => threat.receiver)).not.toContain('O5');
      expect(threats.find((threat) => threat.receiver === 'O2')?.designated).toBe('D2');
    }
  });

  it('garde les cibles des cinq défenseurs continues entre les deux positions du porteur', () => {
    let previous = computeZoneTargets(screenshotOff, 'O1', layout, config, 40);
    for (let step = 1; step <= 7; step++) {
      const off = {
        ...screenshotOff,
        O1: { x: 195 - step, y: 468 - step * 5 / 7 },
      };
      const targets = computeZoneTargets(off, 'O1', layout, config, 40);
      for (const id of Object.keys(targets) as DefenderId[]) {
        const displacement = Math.hypot(
          targets[id].x - previous[id].x, targets[id].y - previous[id].y
        );
        expect(displacement, `${id} à l'incrément ${step}`).toBeLessThanOrEqual(3);
      }
      previous = targets;
    }
  });
});
