// Vérifie si le badge 3-sec apparaît sur D4 pendant PNR central.
import { makeInitialState } from '../src/lib/data/initial';
import { TEMPLATES } from '../src/lib/data/templates';
import { computeCoachDiagnostics } from '../src/lib/logic/coachDiagnostics';
import type { AppState } from '../src/lib/types';

const template = TEMPLATES.find((t) => t.id === 'pnr-central')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(template.steps),
  defenseInitial: structuredClone(template.defenseInitial),
  screenRule: 'hedge',
  activeStep: 0,
};

console.log('Diagnostic 3-sec sur PNR central, step par step :');
for (let i = 0; i < state.steps.length; i++) {
  state.activeStep = i;
  const diags = computeCoachDiagnostics(state, i);
  const violations = diags.filter((d) => d.tag === 'defensive-3sec');
  if (violations.length === 0) {
    console.log(`  step ${i} : ✓ aucune violation 3-sec`);
  } else {
    violations.forEach((v) => console.log(`  step ${i} : ❌ ${v.defenders.join(',')} — ${v.message}`));
  }
}
