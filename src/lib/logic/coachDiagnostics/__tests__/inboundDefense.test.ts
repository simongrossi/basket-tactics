// Tests règle coach — diagnostic défensif sur remise en jeu.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  convertStepToInbound,
  setInboundDefenseMode,
} from '@/lib/state/transforms/stepTransforms';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';
import type { AppState } from '@/lib/types';

function withInbound(): AppState {
  return convertStepToInbound(makeInitialState(), 'inbound-baseline');
}

describe('inboundDefenseRule — no-op hors inbound', () => {
  it("ne diagnostique rien sur un step live-play", () => {
    const state = makeInitialState();
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const filtered = diags.filter(
      (d) => d.tag.startsWith('inbound-no-') || d.tag === 'inbound-too-many-open' || d.tag === 'inbound-defense-ok'
    );
    expect(filtered).toEqual([]);
  });
});

describe('inboundDefenseRule — sur step inbound', () => {
  it("man-to-man standard → verdict 'inbound-defense-ok'", () => {
    // Le setter convertStepToInbound pose man par défaut → bonne couverture.
    const state = setInboundDefenseMode(withInbound(), 'man');
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const ok = diags.find((d) => d.tag === 'inbound-defense-ok');
    expect(ok).toBeDefined();
    expect(ok?.severity).toBe('good');
  });

  it("zone-press → pas de warning 'no-pressure' (2 défenseurs sur le passeur)", () => {
    const state = setInboundDefenseMode(withInbound(), 'zone-press');
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const noPressure = diags.find((d) => d.tag === 'inbound-no-pressure');
    // Zone-press place D1 + D2 au contact, donc pas de warning pressure.
    expect(noPressure).toBeUndefined();
  });

  it("détecte un passeur sans pression quand défenseurs éloignés", () => {
    // Construction manuelle d'un step inbound avec défenseurs trop loin.
    const s = withInbound();
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    const passerPos = step.off[inbounder];
    const modified = {
      ...s,
      steps: [
        {
          ...step,
          defenseOverrides: {
            // Tous les défenseurs à 200 px du passeur (= aucune pression)
            D1: { x: passerPos.x + 200, y: passerPos.y },
            D2: { x: passerPos.x - 200, y: passerPos.y + 50 },
            D3: { x: passerPos.x + 200, y: passerPos.y - 50 },
            D4: { x: passerPos.x - 200, y: passerPos.y - 100 },
            D5: { x: passerPos.x + 150, y: passerPos.y + 150 },
          },
        },
      ],
    };
    const diags = computeCoachDiagnostics(modified, 0);
    const noPressure = diags.find((d) => d.tag === 'inbound-no-pressure');
    expect(noPressure).toBeDefined();
    expect(noPressure?.severity).toBe('warning');
  });

  it("détecte trop d'attaquants ouverts → critical", () => {
    const s = withInbound();
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    const passerPos = step.off[inbounder];
    // Tous les défenseurs collés sur le passeur (D1) → 4 attaquants libres
    const modified = {
      ...s,
      steps: [
        {
          ...step,
          defenseOverrides: {
            D1: { x: passerPos.x + 30, y: passerPos.y },
            D2: { x: passerPos.x + 30, y: passerPos.y + 30 },
            D3: { x: passerPos.x - 30, y: passerPos.y + 30 },
            D4: { x: passerPos.x + 30, y: passerPos.y - 30 },
            D5: { x: passerPos.x - 30, y: passerPos.y - 30 },
          },
        },
      ],
    };
    const diags = computeCoachDiagnostics(modified, 0);
    const critical = diags.find((d) => d.tag === 'inbound-too-many-open');
    expect(critical).toBeDefined();
    expect(critical?.severity).toBe('critical');
    // Tous les autres attaquants (O2-O5) doivent être listés
    expect(critical?.attackers.length).toBeGreaterThanOrEqual(3);
  });
});
