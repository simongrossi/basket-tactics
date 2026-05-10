import { describe, it, expect } from 'vitest';
import { SCRIPTED_GENERATORS } from '../scriptedGenerators';
import { compileScenario } from '../compileScenario';
import { initialOff } from '../../data/initial';
import type { ScriptedAction, Step } from '../../types';
import { HOOP } from '../../data/court';

const initialStep: Step = {
  off: structuredClone(initialOff),
  ballCarrier: 'O1',
  annotations: [],
};

describe('Pick-and-roll generator', () => {
  it('produit 3 steps avec roller proche du panier au step final', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a1',
      type: 'pick-and-roll',
      params: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
    };
    const steps = SCRIPTED_GENERATORS['pick-and-roll'](initialStep, action);
    expect(steps).toHaveLength(3);

    // Step 1 : screener à proximité du porteur
    const step1 = steps[0];
    const carrierP = initialStep.off.O1;
    const screenerP = step1.off.O5;
    expect(Math.hypot(screenerP.x - carrierP.x, screenerP.y - carrierP.y)).toBeLessThan(50);

    // Annotation "screen" présente sur step 1
    expect(step1.annotations.some((a) => a.type === 'screen' && a.fromId === 'O5')).toBe(true);

    // Step 3 : screener s'est rapproché du panier
    const step3 = steps[2];
    const screener3 = step3.off.O5;
    const dToHoopFinal = Math.hypot(screener3.x - HOOP.x, screener3.y - HOOP.y);
    const dToHoopInitial = Math.hypot(initialStep.off.O5.x - HOOP.x, initialStep.off.O5.y - HOOP.y);
    expect(dToHoopFinal).toBeLessThan(dToHoopInitial);

    // Le porteur du ballon est devenu O1 (use the screen) après step 1
    expect(step3.ballCarrier).toBe('O1');
  });

  it('respecte le côté demandé (faible vs fort)', () => {
    const ballHandler = 'O1';
    // O1 part à x=300 (axe), donc 'fort' devrait pousser le screener à droite (sign=1 par défaut),
    // et 'faible' du côté opposé. Mais l'axe a sign=0 → on prend 1 par convention.
    const fortAction: ScriptedAction = {
      kind: 'offensive',
      id: 'a-fort', type: 'pick-and-roll',
      params: { screener: 'O5', ballHandler, side: 'fort' },
    };
    const faibleAction: ScriptedAction = {
      kind: 'offensive',
      id: 'a-faible', type: 'pick-and-roll',
      params: { screener: 'O5', ballHandler, side: 'faible' },
    };
    const stepFort = SCRIPTED_GENERATORS['pick-and-roll'](initialStep, fortAction)[0];
    const stepFaible = SCRIPTED_GENERATORS['pick-and-roll'](initialStep, faibleAction)[0];
    // Les deux screenerSetPos doivent être de signe x opposé par rapport au porteur.
    const carrierX = initialStep.off.O1.x;
    expect(Math.sign(stepFort.off.O5.x - carrierX)).not.toBe(
      Math.sign(stepFaible.off.O5.x - carrierX)
    );
  });
});

describe('Pin-down generator', () => {
  it('le cutter remonte (s\'éloigne du panier) après l\'écran', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'pd1', type: 'pin-down',
      params: { screener: 'O4', cutter: 'O2' },
    };
    const steps = SCRIPTED_GENERATORS['pin-down'](initialStep, action);
    expect(steps).toHaveLength(2);
    const cutterStart = initialStep.off.O2;
    const cutterEnd = steps[1].off.O2;
    // y croît = on s'éloigne du panier (HOOP est à y=75, plus y est grand, plus on est loin).
    expect(cutterEnd.y).toBeGreaterThan(cutterStart.y);
  });
});

describe('Give-and-go generator', () => {
  it('passe puis cutter rend la balle au passer après sa coupe', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'gng1', type: 'give-and-go',
      params: { passer: 'O1', cutter: 'O2' },
    };
    const steps = SCRIPTED_GENERATORS['give-and-go'](initialStep, action);
    expect(steps).toHaveLength(2);
    // Step 1 : balle passe à O2
    expect(steps[0].ballCarrier).toBe('O2');
    // Step 2 : O1 a la balle après son retour
    expect(steps[1].ballCarrier).toBe('O1');
    // O1 s'est rapproché du panier
    const passerStart = initialStep.off.O1;
    const passerEnd = steps[1].off.O1;
    const dStart = Math.hypot(passerStart.x - HOOP.x, passerStart.y - HOOP.y);
    const dEnd = Math.hypot(passerEnd.x - HOOP.x, passerEnd.y - HOOP.y);
    expect(dEnd).toBeLessThan(dStart);
  });
});

describe('compileScenario', () => {
  it('produit un step initial "Départ" + les steps de chaque action en séquence', () => {
    const actions: ScriptedAction[] = [
      { kind: 'offensive', id: 'a1', type: 'pick-and-roll', params: { screener: 'O5', ballHandler: 'O1', side: 'fort' } },
      { kind: 'offensive', id: 'a2', type: 'shoot', params: { shooter: 'O1' } },
    ];
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions,
    });
    // 1 (départ) + 3 (PnR) + 1 (shoot) = 5
    expect(out).toHaveLength(5);
    expect(out[0].label).toBe('Départ');
    expect(out[1].generatedBy).toBe('a1');
    expect(out[4].generatedBy).toBe('a2');
  });

  it('préserve un step manualOverride entre deux recompiles', () => {
    const actions: ScriptedAction[] = [
      { kind: 'offensive', id: 'pnr', type: 'pick-and-roll', params: { screener: 'O5', ballHandler: 'O1', side: 'fort' } },
    ];
    const firstCompile = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions,
    });
    // Simule une édition manuelle du step 2 (index 2 dans firstCompile = 2e step PnR).
    const editedStep: Step = {
      ...firstCompile[2],
      off: { ...firstCompile[2].off, O5: { x: 123, y: 234 } },
      manualOverride: true,
    };
    const existingSteps = [...firstCompile];
    existingSteps[2] = editedStep;

    // Recompile avec les mêmes actions, en passant existingSteps.
    const secondCompile = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions,
      existingSteps,
    });
    // Le step 2 doit avoir conservé les positions éditées.
    expect(secondCompile[2].off.O5.x).toBe(123);
    expect(secondCompile[2].off.O5.y).toBe(234);
    expect(secondCompile[2].manualOverride).toBe(true);
  });

  it('retourne juste le step initial quand aucune action', () => {
    const out = compileScenario({
      initialOff,
      initialBallCarrier: 'O1',
      actions: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Départ');
  });
});

// ============================================================
// Zones nommées (Phase 1) — paramètres targetZone / screenZone
// ============================================================

describe('Generators avec zones nommées', () => {
  it('basket-cut + targetZone="short-corner-strong" → cutter au short corner du côté du porteur', () => {
    // Porteur O1 à (300, 470) → x>=300 → ballSide="right" → strong=right
    // short-corner-right est à (430, 55) (cf. courtZones.ts).
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a-bc-zone',
      type: 'basket-cut',
      params: { cutter: 'O3', targetZone: 'short-corner-strong' },
    };
    const steps = SCRIPTED_GENERATORS['basket-cut'](initialStep, action);
    expect(steps).toHaveLength(1);
    expect(steps[0].off.O3).toEqual({ x: 430, y: 55 });
  });

  it('basket-cut sans targetZone → comportement par défaut (lerp vers HOOP)', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a-bc-default',
      type: 'basket-cut',
      params: { cutter: 'O3' },
    };
    const [step] = SCRIPTED_GENERATORS['basket-cut'](initialStep, action);
    // O3 part à (470, 380), HOOP=(300,75), lerp 0.65 → (~360, ~180).
    // Ne doit PAS être à short-corner-right (430, 55).
    expect(step.off.O3).not.toEqual({ x: 430, y: 55 });
    // Mais doit être plus proche du panier que la position de départ.
    const dStart = Math.hypot(initialStep.off.O3.x - HOOP.x, initialStep.off.O3.y - HOOP.y);
    const dEnd = Math.hypot(step.off.O3.x - HOOP.x, step.off.O3.y - HOOP.y);
    expect(dEnd).toBeLessThan(dStart);
  });

  it('drive + targetZone="nail" → driver finit au nail (300, 235)', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a-drive-nail',
      type: 'drive',
      params: { driver: 'O1', targetZone: 'nail' },
    };
    const [step] = SCRIPTED_GENERATORS['drive'](initialStep, action);
    expect(step.off.O1).toEqual({ x: 300, y: 235 });
  });

  it('cross-screen + screenZone absolue → screener à la zone exacte', () => {
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a-cross',
      type: 'cross-screen',
      params: {
        screener: 'O4',
        cutter: 'O5',
        screenZone: 'high-post-left',  // (225, 235)
      },
    };
    const steps = SCRIPTED_GENERATORS['cross-screen'](initialStep, action);
    expect(steps[0].off.O4).toEqual({ x: 225, y: 235 });
  });

  it('pin-down + targetZone relative au porteur côté gauche → résolution miroir', () => {
    // Forcer porteur côté gauche : ballCarrier=O2 (x=130).
    const leftStep: Step = {
      ...initialStep,
      ballCarrier: 'O2',
    };
    const action: ScriptedAction = {
      kind: 'offensive',
      id: 'a-pd',
      type: 'pin-down',
      params: {
        screener: 'O4',
        cutter: 'O3',
        targetZone: 'wing-strong',  // porteur côté gauche → wing-left=(120, 260)
      },
    };
    const steps = SCRIPTED_GENERATORS['pin-down'](leftStep, action);
    expect(steps[1].off.O3).toEqual({ x: 120, y: 260 });
  });
});
