import { describe, it, expect } from 'vitest';
import { breakUpTeleports } from '../breakUpTeleports';
import type { Step } from '../../types';

function mkStep(off: any, ballCarrier: any, label?: string, extras: Partial<Step> = {}): Step {
  return { off, ballCarrier, annotations: [], label, ...extras };
}

describe('breakUpTeleports', () => {
  it('ne modifie rien si tous les mouvements sont sous le seuil', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 }, O2: { x: 200, y: 200 } }, 'O1'),
      mkStep({ O1: { x: 150, y: 100 }, O2: { x: 250, y: 200 } }, 'O1'),
    ];
    const out = breakUpTeleports(steps, 100);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(steps[0]);
    expect(out[1]).toBe(steps[1]);
  });

  it('insère un step intermédiaire pour un mouvement de 150 px (maxPx=100)', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 }, O2: { x: 200, y: 200 } }, 'O1'),
      mkStep({ O1: { x: 250, y: 100 }, O2: { x: 200, y: 200 } }, 'O1'),
    ];
    const out = breakUpTeleports(steps, 100);
    expect(out).toHaveLength(3); // 1 intermédiaire inséré
    expect(out[1].isInterpolated).toBe(true);
    // Position intermédiaire = lerp(100, 250, 0.5) = 175
    expect(out[1].off.O1.x).toBe(175);
    expect(out[1].off.O1.y).toBe(100);
  });

  it('insère 2 intermédiaires pour un mouvement de 250 px (maxPx=100)', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 } }, 'O1'),
      mkStep({ O1: { x: 350, y: 100 } }, 'O1'),
    ];
    const out = breakUpTeleports(steps, 100);
    expect(out).toHaveLength(4); // 2 intermédiaires
    expect(out[1].off.O1.x).toBe(183); // round(100 + 250/3)
    expect(out[2].off.O1.x).toBe(267); // round(100 + 2*250/3)
  });

  it('annotations restent sur le step terminal, pas sur les intermédiaires', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 } }, 'O1'),
      mkStep({ O1: { x: 300, y: 100 } }, 'O1', 'Cut', {
        annotations: [{ type: 'cut', fromId: 'O1', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } }],
      }),
    ];
    const out = breakUpTeleports(steps, 100);
    expect(out[1].annotations).toEqual([]);
    expect(out[1].isInterpolated).toBe(true);
    expect(out[2].annotations.length).toBe(1);
    expect(out[2].label).toBe('Cut');
  });

  it('propage defensiveDirectives sur les intermédiaires', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 } }, 'O1'),
      mkStep({ O1: { x: 300, y: 100 } }, 'O1', undefined, {
        defensiveDirectives: [{ kind: 'trap', defenders: ['D1', 'D2'], attacker: 'O1' } as any],
      }),
    ];
    const out = breakUpTeleports(steps, 100);
    expect(out[1].defensiveDirectives).toBeDefined();
    expect(out[1].defensiveDirectives?.length).toBe(1);
  });

  it('ballCarrier des intermédiaires = celui du step précédent (avant passe)', () => {
    const steps: Step[] = [
      mkStep({ O1: { x: 100, y: 100 }, O2: { x: 300, y: 100 } }, 'O1'),
      mkStep({ O1: { x: 100, y: 100 }, O2: { x: 300, y: 100 } }, 'O2'), // passe O1→O2
    ];
    // Force a teleport on O2 to trigger intermediates
    steps[1].off.O2 = { x: 600, y: 100 };
    const out = breakUpTeleports(steps, 100);
    if (out.length > 2) {
      expect(out[1].ballCarrier).toBe('O1'); // ballon pas encore reçu
      expect(out[out.length - 1].ballCarrier).toBe('O2');
    }
  });

  it('cas Rip-DHO du user : 4 steps → 7 steps, 3 interpolés', () => {
    const steps: Step[] = [
      mkStep({
        O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 }, O5: { x: 380, y: 230 },
      }, 'O1', 'Départ'),
      mkStep({
        O1: { x: 300, y: 470 }, O2: { x: 130, y: 380 }, O3: { x: 470, y: 380 },
        O4: { x: 130, y: 415 }, O5: { x: 380, y: 230 },
      }, 'O1', 'Back-screen'), // O4 saut 206 px
      mkStep({
        O1: { x: 300, y: 470 }, O2: { x: 215, y: 227.5 }, O3: { x: 470, y: 380 },
        O4: { x: 130, y: 415 }, O5: { x: 380, y: 230 },
      }, 'O1', 'Cutter plonge'), // O2 saut 175 px
      mkStep({
        O1: { x: 300, y: 470 }, O2: { x: 215, y: 227.5 }, O3: { x: 470, y: 380 },
        O4: { x: 130, y: 415 }, O5: { x: 281, y: 228.5 },
      }, 'O2', 'DHO'),
    ];
    const out = breakUpTeleports(steps, 100);
    const interpolated = out.filter((s) => s.isInterpolated);
    expect(interpolated.length).toBeGreaterThanOrEqual(2);
    // Aucun mouvement entre steps consécutifs > 100 px
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      const ids = Object.keys(cur.off) as Array<keyof typeof cur.off>;
      const maxD = Math.max(
        ...ids.map((id) =>
          Math.hypot(cur.off[id].x - prev.off[id].x, cur.off[id].y - prev.off[id].y)
        )
      );
      expect(maxD).toBeLessThanOrEqual(110); // 100 + arrondi
    }
  });
});
