// Diagnostic ad-hoc — profile PNR central pour identifier les anomalies
// de placement/déplacement des défenseurs autour de l'écran.
//
// Usage : npx tsx scripts/diag-pnr-central.ts
//
// Reporte step par step :
// - Positions D1/D5 + O1/O5 (porteur + screener).
// - dist(D1, O5) vs MIN_PLAYER_CLEARANCE_PX (34 px → invariant Règle 1).
// - dist(D1, O1) (le défenseur du porteur).
// - Δposition D1 et D5 entre 2 steps (sanity vs DEFAULT_DEFENSE_MAX_SPEED_PX).
// - Détection du "traversal" : segment d'interpolation D1[t]→D1[t+1] qui
//   passe à travers le cercle de clearance du screener O5 (entre les
//   2 steps). C'est le symptôme #2 (interpolation linéaire qui traverse).

import { makeInitialState } from '../src/lib/data/initial';
import { effectiveDefensePositions } from '../src/lib/logic/engine';
import {
  DEFAULT_DEFENSE_MAX_SPEED_PX,
  MIN_PLAYER_CLEARANCE_PX,
} from '../src/lib/data/physics';
import type { AppState, AttackerPositions, DefenderPositions, Annotation } from '../src/lib/types';

const pnrSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 },
  O5: { x: 310, y: 230 },
};
const pnrScreen: AttackerPositions = { ...pnrSetup, O5: { x: 290, y: 340 } };
const pnrUse: AttackerPositions = { ...pnrScreen, O1: { x: 380, y: 310 } };
const pnrRoll: AttackerPositions = { ...pnrUse, O5: { x: 300, y: 180 } };

const defenseInitial: DefenderPositions = {
  D1: { x: pnrSetup.O1.x, y: pnrSetup.O1.y - 40 },
  D2: { x: pnrSetup.O2.x, y: pnrSetup.O2.y - 40 },
  D3: { x: pnrSetup.O3.x, y: pnrSetup.O3.y - 40 },
  D4: { x: pnrSetup.O4.x, y: pnrSetup.O4.y + 40 },
  D5: { x: pnrSetup.O5.x, y: pnrSetup.O5.y + 40 },
};

function buildState(): AppState {
  const base = makeInitialState();
  return {
    ...base,
    defenseInitial,
    steps: [
      { off: pnrSetup, ballCarrier: 'O1', annotations: [] },
      {
        off: pnrScreen,
        ballCarrier: 'O1',
        annotations: [
          { type: 'cut', fromId: 'O5', toId: null, from: pnrSetup.O5, to: pnrScreen.O5 } as Annotation,
          {
            type: 'screen', fromId: 'O5', toId: null,
            from: pnrScreen.O5, to: { x: pnrScreen.O5.x, y: pnrScreen.O5.y + 18 },
          } as Annotation,
        ],
      },
      {
        off: pnrUse,
        ballCarrier: 'O1',
        annotations: [
          { type: 'dribble', fromId: 'O1', toId: null, from: pnrSetup.O1, to: pnrUse.O1 } as Annotation,
        ],
      },
      {
        off: pnrRoll,
        ballCarrier: 'O1',
        annotations: [
          { type: 'cut', fromId: 'O5', toId: null, from: pnrScreen.O5, to: pnrRoll.O5 } as Annotation,
        ],
      },
    ],
    activeStep: 0,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Distance minimale du segment [p1, p2] au point c.
 * Si la projection orthogonale tombe hors du segment, prend l'extrémité
 * la plus proche.
 */
function segmentToPointDist(p1: { x: number; y: number }, p2: { x: number; y: number }, c: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return dist(p1, c);
  const t = Math.max(0, Math.min(1, ((c.x - p1.x) * dx + (c.y - p1.y) * dy) / lenSq));
  return dist({ x: p1.x + t * dx, y: p1.y + t * dy }, c);
}

function profile(label: string) {
  const state = buildState();
  const offs = [pnrSetup, pnrScreen, pnrUse, pnrRoll];
  console.log('\n' + '='.repeat(72));
  console.log(`PROFILE: ${label}`);
  console.log('='.repeat(72));

  const positionsByStep: DefenderPositions[] = [];
  for (let i = 0; i < state.steps.length; i++) {
    positionsByStep.push(effectiveDefensePositions(state, i));
  }

  for (let i = 0; i < state.steps.length; i++) {
    const def = positionsByStep[i];
    const off = offs[i];
    const D1 = def.D1!;
    const D5 = def.D5!;
    const O1 = off.O1;
    const O5 = off.O5;

    console.log(`\n--- Step ${i} (${state.steps[i].label ?? '?'}) ---`);
    console.log(`  O1 ${O1.x.toFixed(0)},${O1.y.toFixed(0)}  O5 ${O5.x.toFixed(0)},${O5.y.toFixed(0)}`);
    console.log(`  D1 ${D1.x.toFixed(0)},${D1.y.toFixed(0)}  D5 ${D5.x.toFixed(0)},${D5.y.toFixed(0)}`);
    console.log(`  dist(D1,O1) = ${dist(D1, O1).toFixed(1)} px  | dist(D1,O5) = ${dist(D1, O5).toFixed(1)} px (clearance=${MIN_PLAYER_CLEARANCE_PX})`);
    console.log(`  dist(D5,O5) = ${dist(D5, O5).toFixed(1)} px  | dist(D5,O1) = ${dist(D5, O1).toFixed(1)} px`);
    if (dist(D1, O5) < MIN_PLAYER_CLEARANCE_PX) {
      console.log(`  ❌ D1↔O5 < clearance ! Règle 1 violée`);
    }

    if (i > 0) {
      const prevDef = positionsByStep[i - 1];
      const prevO5 = offs[i - 1].O5;
      const dD1 = dist(prevDef.D1!, D1);
      const dD5 = dist(prevDef.D5!, D5);
      console.log(`  Δ D1 step→step = ${dD1.toFixed(1)} px  (maxSpeed=${DEFAULT_DEFENSE_MAX_SPEED_PX})`);
      console.log(`  Δ D5 step→step = ${dD5.toFixed(1)} px`);
      if (dD1 > DEFAULT_DEFENSE_MAX_SPEED_PX + 1) {
        console.log(`  ⚠️ D1 dépasse maxSpeed (téléportation step-to-step)`);
      }

      // Symptôme 2 — traversal : pendant l'interpolation linéaire entre
      // D1[i-1] et D1[i], le segment passe-t-il à travers le cercle de
      // clearance autour d'O5 ?
      const minPathToScreener = segmentToPointDist(prevDef.D1!, D1, O5);
      if (minPathToScreener < MIN_PLAYER_CLEARANCE_PX) {
        console.log(`  ❌ Symptôme 2 : trajectoire D1[${i-1}→${i}] passe à ${minPathToScreener.toFixed(1)} px d'O5 (< clearance ${MIN_PLAYER_CLEARANCE_PX})`);
      } else if (minPathToScreener < MIN_PLAYER_CLEARANCE_PX + 8) {
        console.log(`  ⚠️ Trajectoire D1[${i-1}→${i}] rase O5 à ${minPathToScreener.toFixed(1)} px`);
      }
      // Idem vs O5 précédent (O5 a aussi bougé entre les 2 steps).
      const minPathToPrevScreener = segmentToPointDist(prevDef.D1!, D1, prevO5);
      if (minPathToPrevScreener < MIN_PLAYER_CLEARANCE_PX) {
        console.log(`  ❌ Trajectoire D1[${i-1}→${i}] passe à ${minPathToPrevScreener.toFixed(1)} px de O5@step${i-1} (< clearance)`);
      }
    }
  }
}

profile('PNR central — CVT');
