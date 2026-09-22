import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { CLASSIC_TEMPLATES, TEMPLATES } from '@/lib/data/templates';
import { INBOUND_TEMPLATES } from '@/lib/data/inboundTemplates';
import { ANTI_ZONE_TEMPLATES } from '@/lib/data/antiZoneTemplates';
import { DRILL_SCENARIOS } from '@/lib/data/drillScenarios';
import { actionsOfStep } from '../stepActions';
import { loadTemplate } from '@/lib/state/transforms/coreTransforms';
import { recompileScenarioSteps } from '@/lib/state/transforms/shared';
import { getVisibleStepRows, stepCounterAt, formatStepCounter } from '../stepNumbering';

describe('libellés au départ de l’action', () => {
  it('Horns flare : chaque libellé est sur l’étape où son action part', () => {
    const t = TEMPLATES.find((x) => x.id === 'horns-flare')!;
    const s = loadTemplate(makeInitialState(), t);
    expect(s.steps.map((st) => st.label)).toEqual([
      'O1 → O2', 'O5 pose flare pour O1', 'Skip pass O2 → O1', undefined,
    ]);
    expect(getVisibleStepRows(s.steps)).toHaveLength(3);
    expect(formatStepCounter(stepCounterAt(s.steps, s.steps.length - 1))).toBe('Position finale');
  });

  it('recompiler un scénario deux fois ne décale pas les libellés deux fois', () => {
    const t = TEMPLATES.find((x) => x.id === 'horns-flare')!;
    const s = loadTemplate(makeInitialState(), t);
    const once = recompileScenarioSteps(s);
    const twice = recompileScenarioSteps(once);
    expect(twice.steps.map((st) => st.label)).toEqual(once.steps.map((st) => st.label));
    // L'action générée qui part de l'étape 0 donne son libellé à l'étape 0.
    expect(once.steps[once.steps.length - 1].label).toBeUndefined();
  });
});

describe('modèles de coaching — étapes lisibles par le coach', () => {
  const all = [...CLASSIC_TEMPLATES, ...INBOUND_TEMPLATES, ...ANTI_ZONE_TEMPLATES, ...DRILL_SCENARIOS];
  it.each(all.map((t) => [t.id, t] as const))('%s : chaque étape numérotée a un libellé et une action', (_id, t) => {
    const s = loadTemplate(makeInitialState(), t);
    const rows = getVisibleStepRows(s.steps);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.step.label, `étape ${r.number}`).toBeTruthy();
      expect(actionsOfStep(s.steps, r.index).length, `étape ${r.number}`).toBeGreaterThan(0);
    }
    expect(formatStepCounter(stepCounterAt(s.steps, s.steps.length - 1))).toBe('Position finale');
  });
});
