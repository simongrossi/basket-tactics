import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId } from '@/lib/types';
import { ensureAnnotationsForMovement, reconcileMovementAnnotations } from '../migrateAnnotations';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 }, O2: { x: 100, y: 0 }, O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 }, O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, ballCarrier: AttackerId = 'O1'): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier, annotations: [] };
}

describe('ensureAnnotationsForMovement', () => {
  it('génère une annotation cut pour un joueur non-porteur qui bouge', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0]).toMatchObject({
      type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 150, y: 100 },
    });
  });

  it('génère une annotation dribble pour le porteur qui bouge', () => {
    const steps = [step({}, 'O1'), step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>, 'O1')];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations[0].type).toBe('dribble');
  });

  it('ne touche pas à une annotation de mouvement existante', () => {
    const steps: Step[] = [
      { ...step({}, 'O2'), annotations: [{ type: 'screen', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 150, y: 100 } }] },
      step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>),
    ];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('screen');
  });

  it('idempotente (un second appel ne change rien)', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>)];
    const once = ensureAnnotationsForMovement(steps, 5);
    const twice = ensureAnnotationsForMovement(once, 5);
    expect(twice[0].annotations).toEqual(once[0].annotations);
  });

  it('ignore les déplacements < 0.5px (tolérance)', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 100.2, y: 0.1 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(0);
  });

  it('skip les attaquants inactifs (playerCount=4 → ignore O5)', () => {
    const steps = [step({}, 'O1'), step({ O5: { x: 999, y: 999 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 4);
    expect(out[0].annotations).toHaveLength(0);
  });
});

describe('reconcileMovementAnnotations', () => {
  it('met à jour Step[N+1] quand Step[N] a une annotation et Step[N+1] est inchangé', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'screen', fromId: 'O3', from: { x: 200, y: 0 }, to: { x: 311, y: 433 } }] },
      step({}), // O3 à (200, 0) — position d'origine inchangée
    ];
    const out = reconcileMovementAnnotations(steps);
    expect(out[1].off.O3).toEqual({ x: 311, y: 433 });
  });

  it('respecte une position manuellement éditée (différente de l\'origine ET de l\'annotation)', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'cut', fromId: 'O3', from: { x: 200, y: 0 }, to: { x: 311, y: 433 } }] },
      step({ O3: { x: 250, y: 250 } } as Partial<AttackerPositions>), // user a placé O3 ailleurs
    ];
    const out = reconcileMovementAnnotations(steps);
    expect(out[1].off.O3).toEqual({ x: 250, y: 250 });
  });

  it('ne touche pas aux pass annotations (mouvement de balle, pas de joueur)', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }] },
      step({}),
    ];
    const out = reconcileMovementAnnotations(steps);
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
  });

  it('idempotente', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'screen', fromId: 'O3', from: { x: 200, y: 0 }, to: { x: 311, y: 433 } }] },
      step({}),
    ];
    const once = reconcileMovementAnnotations(steps);
    const twice = reconcileMovementAnnotations(once);
    expect(twice[1].off.O3).toEqual(once[1].off.O3);
  });
});
