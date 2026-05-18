import { describe, it, expect } from 'vitest';
import { compileScenario } from '../compileScenario';
import type { AttackerPositions, ScenarioBranch, ScriptedAction } from '../../types';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

const mainActions: ScriptedAction[] = [
  { kind: 'offensive', id: 'a1', type: 'pick-and-roll', params: { screener: 'O5', ballHandler: 'O1', side: 'fort' } },
  { kind: 'offensive', id: 'a2', type: 'shoot', params: { shooter: 'O1' } },
];

describe('compileScenario — branches manuelles', () => {
  it('sans branche active : compile uniquement le chemin principal', () => {
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: mainActions,
    });
    const real = out.filter((s) => !s.isInterpolated);
    // 1 (départ) + 4 (PnR : Pose + Tenue + Use+roll + Finition) + 1 (shoot) = 6
    expect(real).toHaveLength(6);
    expect(real[5].generatedBy).toBe('a2');
  });

  it('avec branche active : remplace les actions après le point de divergence', () => {
    const branch: ScenarioBranch = {
      id: 'br1',
      label: 'Si drop → pull-up',
      divergeAfterActionId: 'a1', // après PnR
      actions: [
        { kind: 'offensive', id: 'b1', type: 'shoot', params: { shooter: 'O1' } },
      ],
    };
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: mainActions,
      activeBranch: branch,
    });
    const real = out.filter((s) => !s.isInterpolated);
    // 1 (départ) + 4 (PnR : Pose + Tenue + Use+roll + Finition) + 1 (shoot de la branche) = 6
    // Critically le dernier step réel est de la branche, pas du main
    expect(real).toHaveLength(6);
    expect(real[5].generatedBy).toBe('b1'); // shoot de la branche
  });

  it('branche avec plusieurs actions : toutes substituent la suite du main', () => {
    const branch: ScenarioBranch = {
      id: 'br1',
      label: 'Continuation',
      divergeAfterActionId: 'a1',
      actions: [
        { kind: 'offensive', id: 'b1', type: 'pass', params: { passer: 'O1', receiver: 'O3' } },
        { kind: 'offensive', id: 'b2', type: 'shoot', params: { shooter: 'O3' } },
      ],
    };
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: mainActions,
      activeBranch: branch,
    });
    const real = out.filter((s) => !s.isInterpolated);
    // 1 + 3 (PnR) + branche actions
    const branchSteps = real.filter((s) => s.generatedBy === 'b1' || s.generatedBy === 'b2');
    expect(branchSteps.length).toBeGreaterThan(0);
    // Aucun step de 'a2' (shoot du main remplacé)
    expect(real.find((s) => s.generatedBy === 'a2')).toBeUndefined();
  });

  it('divergeAfterActionId invalide : fallback au chemin principal', () => {
    const branch: ScenarioBranch = {
      id: 'br1',
      label: 'Invalide',
      divergeAfterActionId: 'inexistant',
      actions: [
        { kind: 'offensive', id: 'b1', type: 'shoot', params: { shooter: 'O1' } },
      ],
    };
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: mainActions,
      activeBranch: branch,
    });
    const real = out.filter((s) => !s.isInterpolated);
    // Doit avoir compilé le main path complet (6 steps : 1 départ + 4 PnR + 1 shoot)
    expect(real).toHaveLength(6);
    expect(real[5].generatedBy).toBe('a2'); // shoot du main
  });

  it('branche vide : conserve uniquement les actions jusqu\'à la divergence', () => {
    const branch: ScenarioBranch = {
      id: 'br1',
      label: 'Empty',
      divergeAfterActionId: 'a1',
      actions: [],
    };
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: mainActions,
      activeBranch: branch,
    });
    const real = out.filter((s) => !s.isInterpolated);
    // 1 (départ) + 4 (PnR : Pose + Tenue + Use+roll + Finition) = 5
    expect(real).toHaveLength(5);
    expect(real[4].generatedBy).toBe('a1');
  });
});
