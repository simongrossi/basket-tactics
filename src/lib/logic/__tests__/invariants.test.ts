import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../data/templates';
import { effectiveDefensePositions, computeAttackerVisuals } from '../engine';
import { HEAD_TURN_LIMIT_DEG } from '../vision';
import { makeInitialState } from '../../data/initial';
import { PLAYER_RADIUS, PX_PER_M } from '../../data/court';
import type { AppState, AttackerId, DefenderId } from '../../types';

/**
 * Construit un AppState depuis un template (réutilise initialState pour rules,
 * triggers, zone config, profils, etc.). Les `steps` et `defenseInitial` du
 * template écrasent l'état par défaut.
 */
function appStateFromTemplate(t: (typeof TEMPLATES)[number]): AppState {
  const base = makeInitialState();
  return {
    ...base,
    steps: structuredClone(t.steps),
    defenseInitial: structuredClone(t.defenseInitial),
    activeStep: 0,
  };
}

const ATT_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
const DEF_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const COLLISION_TOL = 1; // tolérance à 1px pour les arrondis Math.round

describe('Invariants sur les playbooks de la bibliothèque', () => {
  // Les templates dev "🧪 Lab Stress" contiennent volontairement un step
  // pathologique (poseur PILE sur porteur) qui ne peut respecter
  // l'invariant attaquant↔attaquant. Tous les Lab dev sont exclus ici ;
  // leurs invariants sont couverts par `screenLabSanity.test.ts`.
  const REGULAR_TEMPLATES = TEMPLATES.filter((t) => !t.id.startsWith('screen-lab'));

  REGULAR_TEMPLATES.forEach((tpl) => {
    describe(`playbook "${tpl.name}"`, () => {
      const state = appStateFromTemplate(tpl);

      it('aucun chevauchement de joueurs aux étapes (résolution de collisions effective)', () => {
        for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
          const off = state.steps[stepIdx].off;
          const def = effectiveDefensePositions(state, stepIdx);
          const minDist = PLAYER_RADIUS * 2 - COLLISION_TOL;

          // Att vs Att
          for (let i = 0; i < ATT_IDS.length; i++) {
            for (let j = i + 1; j < ATT_IDS.length; j++) {
              const a = off[ATT_IDS[i]];
              const b = off[ATT_IDS[j]];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              expect(d, `${ATT_IDS[i]} vs ${ATT_IDS[j]} étape ${stepIdx}`).toBeGreaterThanOrEqual(minDist);
            }
          }
          // Def vs Def
          for (let i = 0; i < DEF_IDS.length; i++) {
            for (let j = i + 1; j < DEF_IDS.length; j++) {
              const a = def[DEF_IDS[i]];
              const b = def[DEF_IDS[j]];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              expect(d, `${DEF_IDS[i]} vs ${DEF_IDS[j]} étape ${stepIdx}`).toBeGreaterThanOrEqual(minDist);
            }
          }
          // Def vs non-matched Att (le défenseur peut être collé à son homme)
          DEF_IDS.forEach((dId) => {
            const dPos = def[dId];
            const matched = def[dId].matchedTo;
            ATT_IDS.forEach((oId) => {
              if (oId === matched) return;
              const aPos = off[oId];
              const dd = Math.hypot(dPos.x - aPos.x, dPos.y - aPos.y);
              expect(dd, `${dId} vs ${oId} (non matched) étape ${stepIdx}`).toBeGreaterThanOrEqual(minDist);
            });
          });
        }
      });

      it('respect de la vitesse max des défenseurs entre étapes consécutives', () => {
        for (let stepIdx = 1; stepIdx < state.steps.length; stepIdx++) {
          const prev = effectiveDefensePositions(state, stepIdx - 1);
          const cur = effectiveDefensePositions(state, stepIdx);
          DEF_IDS.forEach((dId) => {
            const ruleSpeed = state.rules[dId]?.maxSpeed ?? state.defenseMaxSpeed;
            // closeoutBoost (×1.4) × profileBonus (×1.15 max sur shooter) ≈ 1.6.
            // + tolérance résolveur de collisions qui peut pousser un défenseur
            //   jusqu'à PLAYER_RADIUS*2+2 = 38px après contrainte de vitesse.
            const limit = ruleSpeed * 1.65 + PLAYER_RADIUS * 2 + 5;
            const d = Math.hypot(cur[dId].x - prev[dId].x, cur[dId].y - prev[dId].y);
            expect(d, `${dId} étapes ${stepIdx - 1}→${stepIdx}`).toBeLessThanOrEqual(limit);
          });
        }
      });

      it('orientation des défenseurs cohérente avec le facing calculé', () => {
        for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
          const def = effectiveDefensePositions(state, stepIdx);
          DEF_IDS.forEach((dId) => {
            const p = def[dId];
            // L'orientation doit être un nombre fini ; le facing doit être
            // un point valide et cohérent avec le regard depuis la position
            // réellement affichée.
            expect(Number.isFinite(p.orientation), `${dId} orientation finie`).toBe(true);
            expect(Number.isFinite(p.facing.x) && Number.isFinite(p.facing.y), `${dId} facing valide`).toBe(true);
            const facingAngle = (Math.atan2(p.facing.x - p.x, -(p.facing.y - p.y)) * 180) / Math.PI;
            const diff = Math.abs(((facingAngle - p.gazeOrientation) % 360 + 540) % 360 - 180);
            expect(diff, `${dId} étape ${stepIdx}: facing ${facingAngle}, gaze ${p.gazeOrientation}`)
              .toBeLessThan(0.5);
          });
        }
      });

      it("attaquants : pas de saut physiquement impossible (≤ 5.5m par étape, ~ 5.5m/s)", () => {
        // 5.5 m/étape ≈ 1 seconde de sprint à 19,8 km/h, plausible pour un
        // joueur en pleine course (record NBA mesuré ~7 m/s, mais sur 1
        // seconde un coupeur ne tient pas le sprint max). Le diagnostic à
        // 4m alerte le coach (warning), le test d'invariant prend la
        // borne physique haute.
        const physicalLimitPx = 5.5 * PX_PER_M;
        for (let stepIdx = 1; stepIdx < state.steps.length; stepIdx++) {
          const prev = state.steps[stepIdx - 1].off;
          const cur = state.steps[stepIdx].off;
          ATT_IDS.forEach((id) => {
            const d = Math.hypot(prev[id].x - cur[id].x, prev[id].y - cur[id].y);
            const meters = (d / PX_PER_M).toFixed(2);
            expect(d, `${id} étape ${stepIdx - 1}→${stepIdx}: ${meters}m`).toBeLessThanOrEqual(physicalLimitPx);
          });
        }
      });

      it("attackerVisuals : porteur regarde dans la direction du panier", () => {
        for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
          const v = computeAttackerVisuals(state, stepIdx);
          const carrier = state.steps[stepIdx].ballCarrier;
          const carrierPos = state.steps[stepIdx].off[carrier];
          // Dribble entre étape précédente et courante : si le porteur s'est
          // déplacé > 30 px, son orientation suit le mouvement (pas le panier).
          // Ici on teste seulement les cas SANS dribble.
          const prevPos = stepIdx > 0 ? state.steps[stepIdx - 1].off[carrier] : null;
          const dribbled = prevPos
            ? Math.hypot(prevPos.x - carrierPos.x, prevPos.y - carrierPos.y) > 30
            : false;
          if (!dribbled) {
            // Vérifie que la direction joueur→facing est ALIGNÉE avec joueur→panier.
            const HOOP = { x: 300, y: 75 };
            const dHoopX = HOOP.x - carrierPos.x;
            const dHoopY = HOOP.y - carrierPos.y;
            const dFaceX = v[carrier].facing.x - carrierPos.x;
            const dFaceY = v[carrier].facing.y - carrierPos.y;
            const dotNormalized = (dHoopX * dFaceX + dHoopY * dFaceY) /
              (Math.hypot(dHoopX, dHoopY) * Math.hypot(dFaceX, dFaceY) || 1);
            // dot ≥ 0.99 = vecteurs quasi colinéaires dans le même sens.
            expect(dotNormalized, `étape ${stepIdx} carrier=${carrier}`).toBeGreaterThanOrEqual(0.99);
          }
          // Tous les facings valides
          ATT_IDS.forEach((id) => {
            expect(Number.isFinite(v[id].orientation), `${id} orientation finie`).toBe(true);
            expect(Number.isFinite(v[id].facing.x), `${id} facing.x fini`).toBe(true);
          });
        }
      });

      it('INVARIANT anatomique : gaze reste dans la limite tête/corps', () => {
        const angleDiff = (a: number, b: number) =>
          Math.abs(((a - b) % 360 + 540) % 360 - 180);
        for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
          const def = effectiveDefensePositions(state, stepIdx);
          const v = computeAttackerVisuals(state, stepIdx);
          DEF_IDS.forEach((dId) => {
            const diff = angleDiff(def[dId].gazeOrientation, def[dId].orientation);
            expect(diff, `${dId} étape ${stepIdx}: gaze ${def[dId].gazeOrientation}, body ${def[dId].orientation}`)
              .toBeLessThanOrEqual(HEAD_TURN_LIMIT_DEG + 0.01);
          });
          ATT_IDS.forEach((id) => {
            const diff = angleDiff(v[id].gazeOrientation, v[id].orientation);
            expect(diff, `${id} étape ${stepIdx}: gaze ${v[id].gazeOrientation}, body ${v[id].orientation}`)
              .toBeLessThanOrEqual(HEAD_TURN_LIMIT_DEG + 0.01);
          });
        }
      });
    });
  });
});
