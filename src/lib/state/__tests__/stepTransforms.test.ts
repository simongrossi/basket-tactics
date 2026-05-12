// Tests des transformations sur les steps.
//
// Les transforms sont des fonctions pures (AppState → AppState) extraites
// de `useAppState`. Testables sans React, sans localStorage, sans hooks.

import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep, initialOff } from '@/lib/data/initial';
import * as stepTx from '../transforms/stepTransforms';

describe('stepTransforms', () => {
  describe('setActiveStep', () => {
    it('clamp dans [0, steps.length-1]', () => {
      const s0 = makeInitialState();
      const s2 = { ...s0, steps: [s0.steps[0], makeStep(initialOff, 'O1', [])] };
      expect(stepTx.setActiveStep(s2, 0).activeStep).toBe(0);
      expect(stepTx.setActiveStep(s2, 1).activeStep).toBe(1);
      expect(stepTx.setActiveStep(s2, 99).activeStep).toBe(1);
      expect(stepTx.setActiveStep(s2, -5).activeStep).toBe(0);
    });

    it("ne mute pas l'input", () => {
      const s0 = makeInitialState();
      const before = s0.activeStep;
      stepTx.setActiveStep(s0, 0);
      expect(s0.activeStep).toBe(before);
    });
  });

  describe('addStep', () => {
    it("ajoute un step à activeStep+1 et l'active", () => {
      const s0 = makeInitialState();
      const s1 = stepTx.addStep(s0);
      expect(s1.steps.length).toBe(s0.steps.length + 1);
      expect(s1.activeStep).toBe(s0.activeStep + 1);
    });

    it('propage les destinations des annotations de mouvement', () => {
      const s0 = makeInitialState();
      // Annotation cut O2 vers (200, 100) à l'étape active.
      const annotated = {
        ...s0,
        steps: s0.steps.map((st, i) =>
          i === s0.activeStep
            ? {
                ...st,
                annotations: [
                  {
                    type: 'cut' as const,
                    fromId: 'O2' as const,
                    toId: null,
                    from: { ...st.off.O2 },
                    to: { x: 200, y: 100 },
                  },
                ],
              }
            : st
        ),
      };
      const s1 = stepTx.addStep(annotated);
      const newStep = s1.steps[s1.activeStep];
      expect(newStep.off.O2).toEqual({ x: 200, y: 100 });
      // Les autres attaquants restent à leur position d'origine.
      expect(newStep.off.O1).toEqual(s0.steps[0].off.O1);
    });

    it("propage la passe au ballCarrier de l'étape suivante", () => {
      const s0 = makeInitialState();
      const annotated = {
        ...s0,
        steps: s0.steps.map((st, i) =>
          i === s0.activeStep
            ? {
                ...st,
                annotations: [
                  {
                    type: 'pass' as const,
                    fromId: 'O1' as const,
                    toId: 'O3' as const,
                    from: { ...st.off.O1 },
                    to: { ...st.off.O3 },
                  },
                ],
              }
            : st
        ),
      };
      const s1 = stepTx.addStep(annotated);
      expect(s1.steps[s1.activeStep].ballCarrier).toBe('O3');
    });
  });

  describe('duplicateStep', () => {
    it("crée une copie profonde à activeStep+1", () => {
      const s0 = makeInitialState();
      const s1 = stepTx.duplicateStep(s0);
      expect(s1.steps.length).toBe(s0.steps.length + 1);
      expect(s1.steps[1]).not.toBe(s0.steps[0]);
      // Modifier la copie ne touche pas l'original.
      s1.steps[1].off.O1 = { x: 0, y: 0 };
      expect(s0.steps[0].off.O1).not.toEqual({ x: 0, y: 0 });
    });

    it('efface les switches dans la copie', () => {
      const s0 = makeInitialState();
      const withSwitches = {
        ...s0,
        steps: [{ ...s0.steps[0], switches: [['D1', 'D5']] as [string, string][] }],
      };
      const s1 = stepTx.duplicateStep(withSwitches as never);
      expect(s1.steps[1].switches).toBeUndefined();
    });
  });

  describe('deleteStep', () => {
    it('refuse de supprimer le dernier step', () => {
      const s0 = makeInitialState();
      expect(stepTx.deleteStep(s0).steps.length).toBe(1);
    });

    it('supprime le step actif et décrémente activeStep', () => {
      const s0 = makeInitialState();
      const s2 = { ...s0, steps: [s0.steps[0], makeStep(initialOff, 'O1', [])], activeStep: 1 };
      const s1 = stepTx.deleteStep(s2);
      expect(s1.steps.length).toBe(1);
      expect(s1.activeStep).toBe(0);
    });
  });

  describe('setStepLabel', () => {
    it('définit le label', () => {
      const s = stepTx.setStepLabel(makeInitialState(), 0, 'départ');
      expect(s.steps[0].label).toBe('départ');
    });

    it('vide le label sur chaîne vide', () => {
      const s0 = stepTx.setStepLabel(makeInitialState(), 0, 'foo');
      const s1 = stepTx.setStepLabel(s0, 0, '');
      expect(s1.steps[0].label).toBeUndefined();
    });
  });

  describe('setBallCarrier', () => {
    it("modifie ballCarrier du step actif uniquement", () => {
      const s0 = makeInitialState();
      const s1 = stepTx.setBallCarrier(s0, 'O3');
      expect(s1.steps[s1.activeStep].ballCarrier).toBe('O3');
    });
  });
});
