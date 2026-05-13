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

const DEF_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
const ATT_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
const LAB_IDS = [
  'screen-lab-pnr',
  'screen-lab-snake',
  'screen-lab-reject',
  'screen-lab-pindown',
  'screen-lab-offball',
  'screen-lab-help-recover',
  'screen-lab-chain-rescreen',
  'screen-lab-chain-stagger',
  'screen-lab-stress',
] as const;

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

LAB_IDS.forEach((tplId) => {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  describe(`🧪 ${tpl.name} — sanity check par étape`, () => {
    tpl.steps.forEach((step, idx) => {
      it(`étape ${idx} "${step.label}" : engine OK + défenseurs respectent la clearance`, () => {
        const state = buildState(tplId);
        const def = effectiveDefensePositions(state, idx);

        DEF_IDS.forEach((dId) => {
          expect(Number.isFinite(def[dId].x), `${dId}.x finite`).toBe(true);
          expect(Number.isFinite(def[dId].y), `${dId}.y finite`).toBe(true);
        });

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

        // Def ↔ Attaquants : règle ABSOLUE sauf step pathologique
        // (Poseur PILE sur porteur dans le template Stress).
        const isOverlapStep = (step.label ?? '').includes('Poseur PILE');
        if (!isOverlapStep) {
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
  });
});

describe('🧪 Screen Lab — meta', () => {
  it('les 9 templates dev sont inscrits dans TEMPLATES', () => {
    LAB_IDS.forEach((id) => {
      const tpl = TEMPLATES.find((t) => t.id === id);
      expect(tpl, `template ${id} inscrit`).toBeDefined();
    });
  });

  // Règle réalisme : un système ne doit jamais dépasser 9 transitions
  // (= 18 secondes effectives = remontée + action). Cf. docs/SCREEN-ENGINE.md.
  it('aucun Lab dev ne dépasse 18 secondes (9 transitions max)', () => {
    LAB_IDS.forEach((id) => {
      const tpl = TEMPLATES.find((t) => t.id === id)!;
      const transitions = tpl.steps.length - 1;
      const durationSeconds = transitions * 2;
      expect(durationSeconds, `${tpl.name} : ${durationSeconds}s`).toBeLessThanOrEqual(18);
    });
  });
});
