// Test de régression — PnR scripted action doit insérer un dwell "Tenue
// écran" entre "Pose écran" et "Use screen + roll" pour éviter le flicker
// step→step (cf. utilisateur signalant "O5 se téléporte à f179" sur
// systeme_basket-11.json).
//
// Phase K K.4 flicker détecte le demi-tour à 180° au passage par la pose
// d'écran. Le dwell est la fix systémique côté générateur.

import { describe, it, expect } from 'vitest';
import { SCRIPTED_GENERATORS } from '../scriptedGenerators';
import { compileScenario } from '../compileScenario';
import { detectFlicker, flattenDefPos, type FrameSnapshot } from '../anomaly/anomalyDetector';
import type { OffensiveScriptedAction, Step } from '../../types';

describe('PnR dwell anti-flicker (régression user JSON systeme_basket-11)', () => {
  it("Pose écran + Tenue écran : O5 ne bouge pas pendant le step de tenue", () => {
    const action: OffensiveScriptedAction = {
      kind: 'offensive',
      id: 'pnr',
      type: 'pick-and-roll',
      params: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
    };
    const initialStep: Step = {
      off: {
        O1: { x: 300, y: 470 },
        O2: { x: 130, y: 380 },
        O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 },
        O5: { x: 380, y: 230 },
      },
      ballCarrier: 'O1',
      annotations: [],
    };
    const steps = SCRIPTED_GENERATORS['pick-and-roll'](initialStep, action);
    const pose = steps[0];
    const tenue = steps[1];

    expect(pose.label).toBe('Pose écran');
    expect(tenue.label).toBe('Tenue écran');
    // Le screener ne bouge PAS entre Pose et Tenue — c'est le point clé.
    expect(tenue.off.O5).toEqual(pose.off.O5);
    // Le porteur a légèrement avancé vers le screener.
    expect(tenue.off.O1).not.toEqual(pose.off.O1);
  });

  it('après compilation, aucune transition O5 ne déclenche K.4 flicker critical', () => {
    const compiled = compileScenario({
      initialOff: {
        O1: { x: 300, y: 470 },
        O2: { x: 130, y: 380 },
        O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 },
        O5: { x: 380, y: 230 },
      },
      initialBallCarrier: 'O1',
      actions: [
        {
          kind: 'offensive',
          id: 'pnr',
          type: 'pick-and-roll',
          params: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
        },
      ],
    });

    // Construit les snapshots pour chaque triplet (prev, cur, next).
    const emptyDef: FrameSnapshot['defPos'] = {} as FrameSnapshot['defPos'];
    const snapshots: FrameSnapshot[] = compiled.map((s, i) => ({
      stepIdx: i,
      off: s.off,
      defPos: emptyDef,
    }));

    // Scanne toutes les fenêtres de 3 frames consécutives.
    const criticalFlickers: string[] = [];
    for (let i = 2; i < snapshots.length; i++) {
      const reports = detectFlicker(snapshots[i - 2], snapshots[i - 1], snapshots[i]);
      reports
        .filter((r) => r.playerId === 'O5' && r.severity === 'critical')
        .forEach((r) => criticalFlickers.push(`step ${i}: ${r.message}`));
    }

    // Avant le fix : O5 déclenchait un flicker critical à la transition
    // Pose→Use+roll (cos ≈ -0.95, demi-tour ~180°). Après le fix : Tenue
    // décompose la vélocité O5 en 0 entre les deux phases, plus de flicker.
    expect(criticalFlickers).toEqual([]);
  });

  it('compilation produit le label Tenue écran dans la séquence réelle', () => {
    const compiled = compileScenario({
      initialOff: {
        O1: { x: 300, y: 470 },
        O2: { x: 130, y: 380 },
        O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 },
        O5: { x: 380, y: 230 },
      },
      initialBallCarrier: 'O1',
      actions: [
        {
          kind: 'offensive',
          id: 'pnr',
          type: 'pick-and-roll',
          params: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
        },
      ],
    });
    const realLabels = compiled
      .filter((s) => !s.isInterpolated)
      .map((s) => s.label);
    expect(realLabels).toContain('Pose écran');
    expect(realLabels).toContain('Tenue écran');
    expect(realLabels).toContain('Use screen + roll');
    expect(realLabels).toContain('Finition');
  });
});
