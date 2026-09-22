// Tests des transformations sur les annotations.

import { describe, expect, it } from 'vitest';
import type { Annotation, AppState } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import * as annoTx from '../transforms/annotationTransforms';

function cutAnno(fromId: 'O1' | 'O2' | 'O3', to: { x: number; y: number }): Annotation {
  return { type: 'cut', fromId, toId: null, from: { x: 0, y: 0 }, to };
}

function stateWithTwoSteps(): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      s0.steps[0],
      makeStep({ ...s0.steps[0].off }, s0.steps[0].ballCarrier, []),
    ],
  };
}

describe('annotationTransforms', () => {
  describe('addAnnotation', () => {
    it("ajoute une annotation au step actif", () => {
      const s0 = makeInitialState();
      const s1 = annoTx.addAnnotation(s0, cutAnno('O1', { x: 100, y: 100 }));
      expect(s1.steps[s1.activeStep].annotations.length).toBe(1);
      expect(s1.steps[s1.activeStep].annotations[0].fromId).toBe('O1');
    });

    it("une passe propage ballCarrier au step actif", () => {
      const s0 = makeInitialState();
      const pass: Annotation = {
        type: 'pass',
        fromId: 'O1',
        toId: 'O3',
        from: { x: 300, y: 470 },
        to: { x: 470, y: 380 },
      };
      const s1 = annoTx.addAnnotation(s0, pass);
      expect(s1.steps[s1.activeStep].ballCarrier).toBe('O3');
    });

    // Parcours coach : une passe dessinée en premier doit être animée. Le
    // moteur anime une passe pendant la transition qui MÈNE à l'étape qui
    // la porte ; à l'étape 0 aucune transition ne précède.
    it("passe sur le placement de départ : créée sur l'étape suivante, animée", () => {
      const s0 = makeInitialState();
      const pass: Annotation = {
        type: 'pass', fromId: 'O1', toId: 'O3',
        from: s0.steps[0].off.O1, to: s0.steps[0].off.O3,
      };
      const s1 = annoTx.addAnnotation(s0, pass);
      expect(s1.steps).toHaveLength(2);
      expect(s1.steps[0].annotations).toHaveLength(0);
      expect(s1.steps[0].ballCarrier).toBe('O1');
      expect(s1.steps[1].annotations[0]).toMatchObject({ type: 'pass', fromId: 'O1', toId: 'O3' });
      expect(s1.steps[1].ballCarrier).toBe('O3');
      expect(s1.steps[1].off).toEqual(s0.steps[0].off);
      expect(s1.activeStep).toBe(1);
    });

    it("passe sur l'étape 0 après une course : jouée pendant la course", () => {
      const s0 = makeInitialState();
      const withCut = annoTx.addAnnotation(s0, {
        type: 'cut', fromId: 'O3', toId: null, from: s0.steps[0].off.O3, to: { x: 400, y: 200 },
      });
      const s1 = annoTx.addAnnotation(withCut, {
        type: 'pass', fromId: 'O1', toId: 'O3', from: s0.steps[0].off.O1, to: { x: 400, y: 200 },
      });
      expect(s1.steps).toHaveLength(2);
      expect(s1.steps[0].ballCarrier).toBe('O1');
      expect(s1.steps[0].annotations.map((a) => a.type)).toEqual(['cut']);
      expect(s1.steps[1].annotations.map((a) => a.type)).toEqual(['pass']);
      expect(s1.steps[1].ballCarrier).toBe('O3');
    });

    it("mode début sur une passe scrubée : la passe part au moment courant et arrive au step suivant", () => {
      const s0 = stateWithTwoSteps();
      const pass: Annotation = {
        type: 'pass',
        fromId: 'O1',
        toId: 'O3',
        from: s0.steps[0].off.O1,
        to: s0.steps[0].off.O3,
      };
      const s1 = annoTx.addAnnotation(s0, pass, { fullT: 0.4, timingAnchor: 'start' });
      expect(s1.steps[0].annotations).toHaveLength(0);
      expect(s1.steps[1].annotations[0]).toMatchObject({ type: 'pass', tStart: 0.4, tEnd: 1 });
      expect(s1.steps[1].ballCarrier).toBe('O3');
    });

    it("mode fin sur une passe scrubée : la passe arrive au moment courant", () => {
      const s0 = stateWithTwoSteps();
      const pass: Annotation = {
        type: 'pass',
        fromId: 'O1',
        toId: 'O3',
        from: s0.steps[0].off.O1,
        to: s0.steps[0].off.O3,
      };
      const s1 = annoTx.addAnnotation(s0, pass, { fullT: 0.4, timingAnchor: 'end' });
      expect(s1.steps[1].annotations[0]).toMatchObject({ type: 'pass', tStart: 0, tEnd: 0.4 });
      expect(s1.steps[1].ballCarrier).toBe('O3');
    });

    it("mode début : cale le démarrage au moment scrub courant", () => {
      const s0 = stateWithTwoSteps();
      const s1 = annoTx.addAnnotation(
        s0,
        cutAnno('O2', { x: 180, y: 420 }),
        { fullT: 0.35, timingAnchor: 'start' },
      );
      const anno = s1.steps[0].annotations[0];
      expect(anno.phase).toBe('end');
      expect(anno.tStart).toBe(0.35);
      expect(anno.tEnd).toBe(1);
    });

    it("mode fin : cale l'arrivée au moment scrub courant", () => {
      const s0 = stateWithTwoSteps();
      const s1 = annoTx.addAnnotation(
        s0,
        cutAnno('O2', { x: 180, y: 420 }),
        { fullT: 0.35, timingAnchor: 'end' },
      );
      const anno = s1.steps[0].annotations[0];
      expect(anno.phase).toBe('end');
      expect(anno.tStart).toBe(0);
      expect(anno.tEnd).toBe(0.35);
    });

    it("mode fin sur une étape entière crée une action active dès cette étape", () => {
      const s0 = { ...stateWithTwoSteps(), activeStep: 1 };
      const s1 = annoTx.addAnnotation(
        s0,
        { type: 'screen', fromId: 'O5', from: s0.steps[1].off.O5, to: { x: 340, y: 270 } },
        { timingAnchor: 'end' },
      );
      const anno = s1.steps[1].annotations[0];
      expect(anno.phase).toBe('start');
      expect(s1.steps[1].off.O5).toEqual({ x: 340, y: 270 });
    });
  });

  describe('setForcedScreener / clearAnnotationsFor / deleteAnnotation', () => {
    it("setForcedScreener à null efface le champ", () => {
      const s0 = makeInitialState();
      const s1 = annoTx.setForcedScreener(s0, 'O4');
      expect(s1.steps[s1.activeStep].forcedScreener).toBe('O4');
      const s2 = annoTx.setForcedScreener(s1, null);
      expect(s2.steps[s2.activeStep].forcedScreener).toBeUndefined();
    });

    it("clearAnnotationsFor n'enlève que celles du joueur visé", () => {
      const s0 = makeInitialState();
      const withTwo = annoTx.addAnnotation(
        annoTx.addAnnotation(s0, cutAnno('O1', { x: 50, y: 50 })),
        cutAnno('O2', { x: 100, y: 50 })
      );
      const cleaned = annoTx.clearAnnotationsFor(withTwo, 'O1');
      const annos = cleaned.steps[cleaned.activeStep].annotations;
      expect(annos.length).toBe(1);
      expect(annos[0].fromId).toBe('O2');
    });

    it("deleteAnnotation par index", () => {
      const s0 = makeInitialState();
      const withTwo = annoTx.addAnnotation(
        annoTx.addAnnotation(s0, cutAnno('O1', { x: 50, y: 50 })),
        cutAnno('O2', { x: 100, y: 50 })
      );
      const s1 = annoTx.deleteAnnotation(withTwo, 0);
      expect(s1.steps[s1.activeStep].annotations.length).toBe(1);
      expect(s1.steps[s1.activeStep].annotations[0].fromId).toBe('O2');
    });

    it('deleteAnnotation avec idx invalide est no-op', () => {
      const s0 = makeInitialState();
      expect(annoTx.deleteAnnotation(s0, 99)).toBe(s0);
    });

    it("deleteLastAnnotation no-op si pas d'annotation", () => {
      const s0 = makeInitialState();
      expect(annoTx.deleteLastAnnotation(s0)).toBe(s0);
    });
  });

  describe('setAnnotationTiming', () => {
    it("respecte le clamp et la durée min", () => {
      const s0 = makeInitialState();
      const withAnno = annoTx.addAnnotation(s0, cutAnno('O1', { x: 50, y: 50 }));
      // tStart > tEnd → tEnd réajusté pour respecter min duration 0.05
      const s1 = annoTx.setAnnotationTiming(withAnno, withAnno.activeStep, 0, 0.7, 0.5);
      const anno = s1.steps[s1.activeStep].annotations[0];
      expect(anno.tEnd! - anno.tStart!).toBeGreaterThanOrEqual(0.05);
    });

    it("autorise l'extension cross-step quand il y a un step adjacent", () => {
      // addAnnotation('cut') crée une step+1 (destination du cut), donc
      // canExtendForward = true → tEnd peut aller jusqu'à 2.
      const s0 = makeInitialState();
      const withAnno = annoTx.addAnnotation(s0, cutAnno('O1', { x: 50, y: 50 }));
      const s1 = annoTx.setAnnotationTiming(withAnno, 0, 0, -0.5, 1.5);
      const anno = s1.steps[0].annotations[0];
      // tStart : pas d'étape précédente (stepIdx=0) → clamp à 0.
      expect(anno.tStart).toBe(0);
      // tEnd : étape suivante existe → autorisé jusqu'à 2.
      expect(anno.tEnd).toBe(1.5);
    });

    it("ne touche pas une annotation non-movement", () => {
      const s0 = makeInitialState();
      const pass: Annotation = {
        type: 'pass',
        fromId: 'O1',
        toId: 'O3',
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
      };
      const s1 = annoTx.addAnnotation(s0, pass);
      const s2 = annoTx.setAnnotationTiming(s1, s1.activeStep, 0, 0.2, 0.8);
      expect(s2).toBe(s1);
    });
  });

  describe('setAnnotationQuality', () => {
    it("clamp dans [0, 100] et arrondit", () => {
      const s0 = makeInitialState();
      const screen: Annotation = {
        type: 'screen',
        fromId: 'O5',
        toId: null,
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
      };
      const s1 = annoTx.addAnnotation(s0, screen);
      const s2 = annoTx.setAnnotationQuality(s1, s1.activeStep, 0, 150.4);
      expect(s2.steps[s2.activeStep].annotations[0].quality).toBe(100);
      const s3 = annoTx.setAnnotationQuality(s1, s1.activeStep, 0, -10);
      expect(s3.steps[s3.activeStep].annotations[0].quality).toBe(0);
      const s4 = annoTx.setAnnotationQuality(s1, s1.activeStep, 0, 42.7);
      expect(s4.steps[s4.activeStep].annotations[0].quality).toBe(43);
    });

    it("ne touche que les annotations 'screen'", () => {
      const s0 = makeInitialState();
      const s1 = annoTx.addAnnotation(s0, cutAnno('O1', { x: 50, y: 50 }));
      const s2 = annoTx.setAnnotationQuality(s1, s1.activeStep, 0, 80);
      expect(s2).toBe(s1);
    });
  });

  describe('setAnnotationPhase', () => {
    it("no-op si phase identique", () => {
      const s0 = makeInitialState();
      const s1 = annoTx.addAnnotation(s0, cutAnno('O1', { x: 100, y: 100 }));
      // L'annotation est créée sans phase explicite → currentPhase = 'end' par défaut.
      const s2 = annoTx.setAnnotationPhase(s1, s1.activeStep, 0, 'end');
      expect(s2).toBe(s1);
    });
  });
});
