// Validation que CHAQUE étape du template "🧪 Screen Lab" est cohérente
// par elle-même (snapshot independant) :
//   - Aucun défenseur non-matched ne chevauche un attaquant
//   - Aucun défenseur ne chevauche un autre défenseur
//   - Pas d'NaN dans les positions calculées
//
// Le template contient volontairement un cas pathologique d'attaquants
// superposés (poseur PILE sur porteur). On vérifie que le MOTEUR ne
// crashe pas dessus et que les défenseurs respectent quand même la
// clearance entre eux.

import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import type { AppState } from '@/lib/types';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

const screenLab = TEMPLATES.find((t) => t.id === 'screen-lab')!;
const DEF_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
const ATT_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;

function buildState(): AppState {
  const base = makeInitialState();
  return {
    ...base,
    steps: screenLab.steps,
    defenseInitial: screenLab.defenseInitial,
    activeStep: 0,
  };
}

describe('🧪 Screen Lab — sanity check par étape', () => {
  screenLab.steps.forEach((step, idx) => {
    it(`étape ${idx} "${step.label}" : engine ne crashe pas, défenseurs respectent la clearance entre eux`, () => {
      const state = buildState();
      const def = effectiveDefensePositions(state, idx);

      // Pas de NaN
      DEF_IDS.forEach((dId) => {
        expect(Number.isFinite(def[dId].x), `${dId}.x finite`).toBe(true);
        expect(Number.isFinite(def[dId].y), `${dId}.y finite`).toBe(true);
      });

      // Def ↔ Def clearance
      for (let i = 0; i < DEF_IDS.length; i++) {
        for (let j = i + 1; j < DEF_IDS.length; j++) {
          const a = def[DEF_IDS[i]];
          const b = def[DEF_IDS[j]];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          expect(dist, `${DEF_IDS[i]} ↔ ${DEF_IDS[j]} étape ${idx}`).toBeGreaterThanOrEqual(
            PLAYER_MIN_CLEARANCE_PX - 0.5
          );
        }
      }

      // Def ↔ Attaquants : règle ABSOLUE (matched compris).
      // SAUF étape 12 (Poseur PILE sur porteur) où O1=O3 → un défenseur
      // ne peut pas être à 34 px des DEUX simultanément. Exempté.
      const ATTACKER_OVERLAP_STEP = screenLab.steps.findIndex((s) =>
        s.label.includes('Poseur PILE')
      );
      if (idx !== ATTACKER_OVERLAP_STEP) {
        DEF_IDS.forEach((dId) => {
          ATT_IDS.forEach((oId) => {
            const dPos = def[dId];
            const oPos = step.off[oId];
            const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
            expect(dist, `${dId}(match=${dPos.matchedTo}) ↔ ${oId} étape ${idx}`).toBeGreaterThanOrEqual(
              PLAYER_MIN_CLEARANCE_PX - 0.5
            );
          });
        });
      }
    });
  });

  it('le template est inscrit dans TEMPLATES et accessible via id', () => {
    expect(screenLab).toBeDefined();
    expect(screenLab.steps.length).toBeGreaterThanOrEqual(10);
  });
});
