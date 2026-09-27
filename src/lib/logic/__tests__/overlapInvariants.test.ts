// Invariants stricts d'anti-superposition (règle absolue mai 2026) :
// AUCUN joueur ne peut chevaucher un autre, peu importe :
//   - équipe (attaquant ↔ défenseur, attaquant ↔ attaquant, défenseur ↔ défenseur)
//   - matching (D matché à O ne PEUT PAS se poser sur lui — pas d'exception)
//
// Tous les couples doivent respecter `PLAYER_MIN_CLEARANCE_PX = 34 px`
// (≈ 2 × rayon sprite + 2 px de marge). Cf. docs/PLAYER-CLEARANCE.md.

import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { compileScenario } from '@/lib/logic/compileScenario';
import { distance } from '@/lib/logic/geometry';
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import type { AppState, AttackerId, AttackerPositions, DefenderPositions, OffensiveScriptedAction } from '@/lib/types';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

describe('DIAG superposition complète', () => {
  it('scénario user : O3 poseur sur O1 porteur + D4 tag + D5 x-out — vérifier toutes les paires', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 580, y: 460 }, // porteur, coin droit (comme screenshot)
      O2: { x: 280, y: 430 },
      O3: { x: 580, y: 460 }, // poseur EXACTEMENT sur O1 (cas pathologique)
      O4: { x: 380, y: 220 },
      O5: { x: 480, y: 200 }, // dans la zone PnR, peut être roller
    };
    const state: AppState = {
      ...s0,
      steps: [{ ...makeStep(off, 'O1', []), forcedScreener: 'O3' as const }],
      activeStep: 0,
      screenRule: 'hedge',
      tagThenSwitchEnabled: true, // configuration agressive
    };
    const def = effectiveDefensePositions(state, 0);

    // Reconstruit les paires matchups → on autorise SEULEMENT le matched
    // à overlapper son homme.
    const allDefIds = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const allOffIds = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;

    // INVARIANT 1 : tout défenseur ↔ TOUT attaquant ≥ clearance.
    // AUCUNE exception, y compris D matché à son O.
    allDefIds.forEach((dId) => {
      const dPos = def[dId];
      allOffIds.forEach((oId) => {
        const oPos = off[oId];
        const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
        if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
          console.log(`OVERLAP : ${dId}(match=${dPos.matchedTo}) ↔ ${oId} = ${dist.toFixed(1)}px`);
        }
        expect(dist, `${dId}(match=${dPos.matchedTo}) ↔ ${oId}`).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5
        );
      });
    });

    // INVARIANT 2 : tout défenseur ↔ tout autre défenseur ≥ clearance.
    for (let i = 0; i < allDefIds.length; i++) {
      for (let j = i + 1; j < allDefIds.length; j++) {
        const a = def[allDefIds[i]];
        const b = def[allDefIds[j]];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
          console.log(`OVERLAP : ${allDefIds[i]} ↔ ${allDefIds[j]} = ${dist.toFixed(1)}px`);
        }
        expect(dist, `${allDefIds[i]} ↔ ${allDefIds[j]}`).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5
        );
      }
    }
  });

  it('attaquant↔attaquant : drag O3 sur O1 via moveAttackerInState → O3 repoussé à clearance', async () => {
    const { moveAttackerInState } = await import('@/lib/logic/playerMove');
    const s0 = makeInitialState();
    const o1 = s0.steps[0].off.O1;
    const next = moveAttackerInState(s0, 'O3', { x: o1.x, y: o1.y });
    const o3 = next.steps[0].off.O3;
    const dist = Math.hypot(o3.x - o1.x, o3.y - o1.y);
    expect(dist).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });

  it('édition libre : D5 placé directement sur O3 (non matché) → engine doit le pousser', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 400, y: 400 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const state: AppState = {
      ...s0,
      steps: [{
        ...makeStep(off, 'O1', []),
        defenseOverrides: { D5: { x: 400, y: 400 } }, // D5 PILE sur O3
      }],
      activeStep: 0,
    };
    const def = effectiveDefensePositions(state, 0);
    const distD5_O3 = Math.hypot(def.D5.x - off.O3.x, def.D5.y - off.O3.y);
    console.log(`D5 placé sur O3 (matched=${def.D5.matchedTo}) : dist après engine = ${distD5_O3.toFixed(1)}px`);
    // Règle absolue : même si matched, pas de superposition.
    expect(distD5_O3).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });

  it('override matched : D1 placé pile sur O1 (son homme) → engine pousse à clearance (pas d\'exception coller)', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const state: AppState = {
      ...s0,
      steps: [{
        ...makeStep(off, 'O1', []),
        defenseOverrides: { D1: { x: 300, y: 470 } }, // D1 PILE sur O1 (son matched)
      }],
      activeStep: 0,
    };
    const def = effectiveDefensePositions(state, 0);
    const distD1_O1 = Math.hypot(def.D1.x - off.O1.x, def.D1.y - off.O1.y);
    expect(distD1_O1).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });
});

describe('auto-replacement — invariant clearance', () => {
  it('toutes les paires ≥ PLAYER_MIN_CLEARANCE_PX après cascade', () => {
    const initialOff: AttackerPositions = {
      O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 500, y: 320 },
      O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
    };
    const cut: OffensiveScriptedAction = {
      kind: 'offensive', id: 'c1', type: 'basket-cut', params: { cutter: 'O2' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5,
      autoReplacementEnabled: true, autoReplacementDepth: 2,
    });
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (const s of steps) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          expect(distance(s.off[ids[i]], s.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
        }
      }
    }
  });
});

describe('fast-break — invariant clearance', () => {
  it('toutes les paires d’attaquants ≥ clearance sur les steps du break', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
      O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
      D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
    };
    const state: AppState = {
      ...s0, playerCount: 5, activeStep: 0,
      steps: [{ off, ballCarrier: 'O1', annotations: [], defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive' }],
    };
    const next = addFastBreakSteps(state, { sourceStepIdx: 0 });
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (const st of next.steps) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          expect(distance(st.off[ids[i]], st.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
    }
  });

  for (const realismProfile of ['legacy', 'realistic'] as const) {
    it(`repli en transition : toutes les paires ≥ clearance et sauts ≤ 18 px en lecture, ${realismProfile}`, async () => {
      const { resolveTimelineFrame } = await import('../playback/frameResolver');
      const s0 = makeInitialState();
      const off: AttackerPositions = {
        O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
        O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
      };
      const def: DefenderPositions = {
        D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
        D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
      };
      const state: AppState = addFastBreakSteps({
        ...s0, playerCount: 5, activeStep: 0, realismProfile,
        steps: [{ off, ballCarrier: 'O1', annotations: [], defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive' }],
      }, { sourceStepIdx: 0 });
      let previous: ReturnType<typeof resolveTimelineFrame> = null;
      for (let tick = 0; tick <= (state.steps.length - 1) * 60; tick++) {
        const frame = resolveTimelineFrame(state, tick / 60)!;
        const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            expect(distance(players[i][1], players[j][1]), `t=${tick / 60} ${players[i][0]} / ${players[j][0]}`)
              .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
          }
          if (previous) {
            const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
              .find(([id]) => id === players[i][0])![1];
            expect(distance(before, players[i][1]), `t=${tick / 60} ${players[i][0]} jump`).toBeLessThanOrEqual(18.01);
          }
        }
        previous = frame;
      }
    }, 60_000);
  }

  it('driveContainmentEnabled : clearance préservée sur un drive', () => {
    // 2a — la couche driveContainment glisse le défenseur du porteur vers le
    // point de contain ; elle doit rester compatible Rule 1 (push-out aval).
    const base = makeInitialState();
    const off0 = base.steps[0].off;
    const prev = makeStep(off0, 'O1', []);
    // O1 avance nettement vers le panier (drive).
    const cur = makeStep({ ...off0, O1: { x: 250, y: 300 } }, 'O1', []);
    const state: AppState = {
      ...base,
      driveContainmentEnabled: true,
      steps: [prev, cur],
      activeStep: 1,
    };
    const def = effectiveDefensePositions(state, 1);
    const dids = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    for (let i = 0; i < dids.length; i++)
      for (let j = i + 1; j < dids.length; j++)
        expect(distance(def[dids[i]], def[dids[j]])).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5,
        );
  });
});


it('évitement temporisé : le cutter reste séparé du poseur pendant sa fenêtre', async () => {
  const { resolveFrameAt } = await import('../playback/frameResolver');
  const base = makeInitialState();
  const off = { O1: { x: 80, y: 430 }, O2: { x: 80, y: 80 }, O3: { x: 520, y: 80 },
    O4: { x: 300, y: 150 }, O5: { x: 300, y: 430 } };
  const defense = { D1: { x: 80, y: 200 }, D2: { x: 180, y: 200 },
    D3: { x: 420, y: 200 }, D4: { x: 520, y: 200 }, D5: { x: 300, y: 260 } };
  const to = { x: 520, y: 430 };
  const state: AppState = { ...base, defenseInitial: defense, steps: [
    { off, ballCarrier: 'O1', defenseOverrides: defense,
      annotations: [{ type: 'cut', fromId: 'O1', toId: null, from: off.O1, to, tStart: 0.3, tEnd: 0.8 }] },
    { off: { ...off, O1: to }, ballCarrier: 'O1', annotations: [], defenseOverrides: defense },
  ] };
  for (let f = 0; f <= 60; f++) {
    const frame = resolveFrameAt(state, f / 60)!;
    const positions = [...Object.values(frame.off), ...Object.values(frame.defPos)];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(distance(positions[i], positions[j])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
  }
});

describe('séparation finale de la timeline avec contacts écran', () => {
  for (const realismProfile of ['legacy', 'realistic'] as const) {
    it(`toutes les paires restent séparées et sans saut, profil ${realismProfile}`, async () => {
      const { TEMPLATES } = await import('@/lib/data/templates');
      const { resolveTimelineFrame } = await import('../playback/frameResolver');
      const templates = TEMPLATES.filter(t => t.id.startsWith('screen-lab-') ||
        ['pnr-central', 'ucla-cut', 'horns-flare', 'spain-pnr', 'floppy', 'hammer'].includes(t.id));
      for (const template of templates) {
        const state: AppState = { ...makeInitialState(), realismProfile,
          steps: structuredClone(template.steps), defenseInitial: structuredClone(template.defenseInitial) };
        let previous: ReturnType<typeof resolveTimelineFrame> = null;
        for (let tick = 0; tick <= (state.steps.length - 1) * 120; tick++) {
          const frame = resolveTimelineFrame(state, tick / 120)!;
          const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              expect(distance(players[i][1], players[j][1]),
                `${template.id} t=${tick / 120} ${players[i][0]} / ${players[j][0]}`)
                .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
            }
            if (previous) {
              const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
                .find(([id]) => id === players[i][0])![1];
              expect(distance(before, players[i][1]), `${template.id} t=${tick / 120} ${players[i][0]} jump`)
                .toBeLessThanOrEqual(18.01);
            }
          }
          previous = frame;
        }
      }
    }, 60_000);
  }
});

describe('P4.4 mémoire de rotation — séparation et continuité en lecture', () => {
  for (const rotationMemory of ['auto', 'stay', 'recover'] as const) {
    it(`toutes les paires ≥ clearance et sauts ≤ 18 px, mode ${rotationMemory}`, async () => {
      const { TEMPLATES } = await import('@/lib/data/templates');
      const { resolveTimelineFrame } = await import('../playback/frameResolver');
      const templates = TEMPLATES.filter(t => ['pnr-central', 'spain-pnr', 'pnr-wing',
        'screen-lab-pnr', 'screen-lab-snake', 'screen-lab-reject'].includes(t.id));
      // Rotation en cascade : PNR central où O1 passe à O4 (homme laissé
      // libre par le tagueur) juste après le tag.
      const pnrCentral = templates.find(t => t.id === 'pnr-central')!;
      const cascade = { ...pnrCentral, id: 'pnr-central-cascade', steps: structuredClone(pnrCentral.steps) };
      cascade.steps[3] = { ...cascade.steps[3], ballCarrier: 'O4', annotations: [] };
      // Cascade à deux crans : O1 dérive à gauche, puis O4 renvoie à O2.
      const cascade2 = { ...pnrCentral, id: 'pnr-central-cascade-2', steps: structuredClone(pnrCentral.steps) };
      const off2 = { ...cascade2.steps[3].off, O1: { x: 220, y: 390 } };
      cascade2.steps[3] = { ...cascade2.steps[3], off: off2, ballCarrier: 'O4', annotations: [] };
      cascade2.steps.push({ off: off2, ballCarrier: 'O2', annotations: [] });
      for (const template of [...templates, cascade, cascade2]) {
        const steps = structuredClone(template.steps);
        // Étape de retour au calme : le porteur ressort, les duels échangés
        // se rendent leurs hommes pendant la lecture.
        const last = steps[steps.length - 1];
        steps.push({ ...structuredClone(last), label: undefined, annotations: [],
          off: { ...last.off, [last.ballCarrier]: { x: 300, y: 400 } } });
        const state: AppState = { ...makeInitialState(), realismProfile: 'realistic', rotationMemory,
          screenRule: 'hedge', steps, defenseInitial: structuredClone(template.defenseInitial) };
        let previous: ReturnType<typeof resolveTimelineFrame> = null;
        for (let tick = 0; tick <= (state.steps.length - 1) * 60; tick++) {
          const frame = resolveTimelineFrame(state, tick / 60)!;
          const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              expect(distance(players[i][1], players[j][1]),
                `${template.id} t=${tick / 60} ${players[i][0]} / ${players[j][0]}`)
                .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
            }
            if (previous) {
              const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
                .find(([id]) => id === players[i][0])![1];
              expect(distance(before, players[i][1]), `${template.id} t=${tick / 60} ${players[i][0]} jump`)
                .toBeLessThanOrEqual(18.01);
            }
          }
          previous = frame;
        }
      }
    }, 60_000);
  }
});

describe('zones matchup et 3-2 — séparation et continuité en lecture', () => {
  for (const type of ['zone-matchup', 'zone-3-2'] as const) {
    it(`toutes les paires ≥ clearance et sauts ≤ 18 px, ${type}`, async () => {
      const { TEMPLATES } = await import('@/lib/data/templates');
      const { resolveTimelineFrame } = await import('../playback/frameResolver');
      const templates = TEMPLATES.filter(t => ['pnr-central', 'pindown-corner', 'ucla-cut', 'floppy',
        'screen-lab-pnr'].includes(t.id));
      for (const template of templates) {
        const steps = structuredClone(template.steps);
        // Ballon au coin (règle de coin 3-2, relais matchup).
        const last = steps[steps.length - 1];
        steps.push({ ...structuredClone(last), label: undefined, annotations: [],
          off: { ...last.off, [last.ballCarrier]: { x: 545, y: 110 } } });
        const base = makeInitialState();
        const state: AppState = { ...base, realismProfile: 'realistic', defenseSystem: 'zone',
          zoneConfig: { ...base.zoneConfig, type }, steps, defenseInitial: structuredClone(template.defenseInitial) };
        let previous: ReturnType<typeof resolveTimelineFrame> = null;
        for (let tick = 0; tick <= (state.steps.length - 1) * 60; tick++) {
          const frame = resolveTimelineFrame(state, tick / 60)!;
          const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              expect(distance(players[i][1], players[j][1]),
                `${template.id} t=${tick / 60} ${players[i][0]} / ${players[j][0]}`)
                .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
            }
            if (previous) {
              const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
                .find(([id]) => id === players[i][0])![1];
              expect(distance(before, players[i][1]), `${template.id} t=${tick / 60} ${players[i][0]} jump`)
                .toBeLessThanOrEqual(18.01);
            }
          }
          previous = frame;
        }
      }
    }, 60_000);
  }
});

it('la calibration temporelle conserve la séparation aux durées courtes et longues', () => {
  for (const duration of [0.25, 1, 4, 8]) {
    const state = makeInitialState();
    state.steps = [structuredClone(state.steps[0]), structuredClone(state.steps[0])];
    state.steps[0].duration = duration;
    state.steps[1].off.O1 = { x: 300, y: 240 };
    const positions = [...Object.values(state.steps[1].off), ...Object.values(effectiveDefensePositions(state, 1))];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(distance(positions[i], positions[j])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
  }
});
