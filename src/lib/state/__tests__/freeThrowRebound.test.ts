// Tests F.2 — free throw post-lancer (course rebond).

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addFreeThrowReboundStep,
  convertStepToFreeThrow,
} from '../transforms/stepTransforms';
import { distance } from '@/lib/logic/geometry';
import { HOOP } from '@/lib/data/court';
import type { AppState } from '@/lib/types';

function withFT(): AppState {
  return convertStepToFreeThrow(makeInitialState());
}

describe('addFreeThrowReboundStep — no-op hors LF', () => {
  it("ne fait rien si step actif n'est pas free-throw", () => {
    const s = makeInitialState(); // context = 'live-play' par défaut
    const result = addFreeThrowReboundStep(s, false);
    expect(result).toBe(s);
  });
});

describe('addFreeThrowReboundStep — LF manqué (course rebond)', () => {
  it('ajoute une nouvelle étape après le step LF actif', () => {
    const s = withFT();
    const initialLen = s.steps.length;
    const result = addFreeThrowReboundStep(s, false);
    expect(result.steps.length).toBe(initialLen + 1);
  });

  it('la nouvelle étape a context=live-play (la phase reprend)', () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, false);
    const newStep = result.steps[result.activeStep];
    expect(newStep.context).toBe('live-play');
  });

  it("les blocks défensifs (D4, D5) convergent vers le cercle pour le rebond", () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, false);
    const newStep = result.steps[result.activeStep];
    const d4 = newStep.defenseOverrides?.D4;
    const d5 = newStep.defenseOverrides?.D5;
    expect(d4).toBeDefined();
    expect(d5).toBeDefined();
    if (d4 && d5) {
      // Très proches du cercle (< 60 px)
      expect(distance(d4, HOOP)).toBeLessThan(60);
      expect(distance(d5, HOOP)).toBeLessThan(60);
    }
  });

  it("les slots offensifs (O4, O5) montent au cercle (over-the-top)", () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, false);
    const newStep = result.steps[result.activeStep];
    // O4 et O5 doivent être au-dessus du cercle (y > HOOP.y = 75)
    // = du côté offensif du cercle pour over-the-top.
    expect(newStep.off.O4.y).toBeGreaterThan(HOOP.y);
    expect(newStep.off.O5.y).toBeGreaterThan(HOOP.y);
  });

  it('active activeStep sur le nouveau step (= step + 1)', () => {
    const s = withFT();
    const initialActive = s.activeStep;
    const result = addFreeThrowReboundStep(s, false);
    expect(result.activeStep).toBe(initialActive + 1);
  });

  it('ajoute des annotations cut sur les joueurs LF qui bougent', () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, false);
    const newStep = result.steps[result.activeStep];
    // Au moins une annotation cut (O4 ou O5 qui bouge significativement).
    const cutCount = newStep.annotations.filter((a) => a.type === 'cut').length;
    expect(cutCount).toBeGreaterThanOrEqual(1);
  });
});

describe('addFreeThrowReboundStep — LF réussi (transition adverse)', () => {
  it('made = true → tout le monde recule en transition (y > 300)', () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, true);
    const newStep = result.steps[result.activeStep];
    // Les 5 attaquants reculent (y > 300, vers leur back court).
    (['O1', 'O2', 'O3', 'O4', 'O5'] as const).forEach((id) => {
      expect(newStep.off[id].y).toBeGreaterThan(300);
    });
  });

  it('made = true ne génère pas d\'annotations cut intermédiaires', () => {
    const s = withFT();
    const result = addFreeThrowReboundStep(s, true);
    const newStep = result.steps[result.activeStep];
    // Annotations cut limitées : seuls O4, O5 ont une annotation s'ils
    // ont bougé significativement.
    expect(newStep.annotations.length).toBeLessThanOrEqual(2);
  });
});
