import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId, Point } from '@/lib/types';
import { setPlayerPositionAt, upsertMovementAnnotation, upsertPassAnnotation } from '../stepMutations';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 },
  O2: { x: 100, y: 0 },
  O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 },
  O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, ballCarrier: AttackerId = 'O1'): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier, annotations: [] };
}

describe('setPlayerPositionAt', () => {
  it('étape 0 : déplace mais ne crée pas d\'annotation', () => {
    const steps = [step({}), step({})];
    const out = setPlayerPositionAt(steps, 0, 'O1', { x: 50, y: 50 });
    expect(out[0].off.O1).toEqual({ x: 50, y: 50 });
    expect(out[0].annotations).toHaveLength(0);
    expect(out[1].annotations).toHaveLength(0);
  });

  it('étape 1 (joueur non-porteur) : crée une annotation cut sur étape 0', () => {
    const steps = [step({}), step({})];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 150, y: 100 });
    expect(out[1].off.O2).toEqual({ x: 150, y: 100 });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0]).toMatchObject({
      type: 'cut',
      fromId: 'O2',
      from: { x: 100, y: 0 },
      to: { x: 150, y: 100 },
    });
  });

  it('étape 1 (porteur sur étape 0) : crée une annotation dribble', () => {
    const steps = [step({}, 'O1'), step({})];
    const out = setPlayerPositionAt(steps, 1, 'O1', { x: 50, y: 80 });
    expect(out[0].annotations[0].type).toBe('dribble');
  });

  it('met à jour le `to` d\'une annotation de mouvement existante (pas de doublon)', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 120, y: 50 } }] },
      step({ O2: { x: 120, y: 50 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 200, y: 200 });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].to).toEqual({ x: 200, y: 200 });
    expect(out[1].off.O2).toEqual({ x: 200, y: 200 });
  });

  it('préserve un screen existant (ne reclassifie pas en cut)', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'screen', fromId: 'O5', from: { x: 400, y: 0 }, to: { x: 250, y: 100 } }] },
      step({ O5: { x: 250, y: 100 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O5', { x: 260, y: 110 });
    expect(out[0].annotations[0].type).toBe('screen');
    expect(out[0].annotations[0].to).toEqual({ x: 260, y: 110 });
  });

  it('recale le `from` d\'une annotation aval (Step[N]) du même joueur', () => {
    const steps: Step[] = [
      step({}),
      {
        ...step({ O2: { x: 100, y: 0 } } as Partial<AttackerPositions>),
        annotations: [{ type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 200, y: 0 } }],
      },
      step({ O2: { x: 200, y: 0 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 130, y: 30 });
    expect(out[1].annotations[0].from).toEqual({ x: 130, y: 30 });
    expect(out[1].annotations[0].to).toEqual({ x: 200, y: 0 });
  });

  it('stepIdx négatif : retourne les steps inchangés (référence identique)', () => {
    const steps = [step({}), step({})];
    expect(setPlayerPositionAt(steps, -1, 'O1', { x: 50, y: 50 })).toBe(steps);
  });

  it('stepIdx >= length : retourne les steps inchangés (référence identique)', () => {
    const steps = [step({}), step({})];
    expect(setPlayerPositionAt(steps, 5, 'O1', { x: 50, y: 50 })).toBe(steps);
  });
});

describe('upsertMovementAnnotation', () => {
  it('ajoute l\'annotation et synchronise Step[N+1].off', () => {
    const steps = [step({}), step({})];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[1].off.O1).toEqual({ x: 50, y: 50 });
  });

  it('remplace une annotation de mouvement existante du même joueur', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'cut', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 30, y: 30 } }] },
      step({ O1: { x: 30, y: 30 } } as Partial<AttackerPositions>),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('dribble');
    expect(out[1].off.O1).toEqual({ x: 80, y: 80 });
  });

  it('coexiste avec une pass du même joueur', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }] },
      step({}),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations).toHaveLength(2);
    expect(out[0].annotations.map((a) => a.type).sort()).toEqual(['dribble', 'pass']);
  });

  it('snap le `from` à la position courante du joueur', () => {
    const steps = [step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>), step({})];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'cut', fromId: 'O1', from: { x: 999, y: 999 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations[0].from).toEqual({ x: 10, y: 20 });
  });

  it('recale le `from` d\'une annotation de mouvement existante sur Step[N+1]', () => {
    const steps: Step[] = [
      step({}),
      {
        ...step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>),
        annotations: [{ type: 'cut', fromId: 'O1', from: { x: 50, y: 50 }, to: { x: 200, y: 0 } }],
      },
      step({ O1: { x: 200, y: 0 } } as Partial<AttackerPositions>),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 },
    });
    expect(out[1].annotations[0].from).toEqual({ x: 80, y: 80 });
  });
});

describe('upsertPassAnnotation', () => {
  it('ajoute la pass sans toucher aux positions', () => {
    const steps = [step({}, 'O1'), step({}, 'O1')];
    const out = upsertPassAnnotation(steps, 0, {
      type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('pass');
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
  });
});
