import { describe, it, expect } from 'vitest';
import { annotationSummary, qualityLabel } from '../pdfRecap';
import type { Annotation } from '../../types';

const screen = (overrides: Partial<Annotation> = {}): Annotation => ({
  type: 'screen',
  fromId: 'O3',
  toId: 'O1',
  from: { x: 0, y: 0 },
  to: { x: 0, y: 0 },
  ...overrides,
} as Annotation);

describe('qualityLabel — Étape 14', () => {
  it('cartographie les 5 paliers', () => {
    expect(qualityLabel(0)).toBe('ghost');
    expect(qualityLabel(12)).toBe('ghost');
    expect(qualityLabel(25)).toBe('loose');
    expect(qualityLabel(50)).toBe('std');
    expect(qualityLabel(75)).toBe('solid');
    expect(qualityLabel(100)).toBe('lock');
  });
});

describe('annotationSummary — Étape 14', () => {
  it('écran avec qualité par défaut (50 = std)', () => {
    const r = annotationSummary(screen(), 0, 4);
    expect(r).toContain('O3 écran → O1');
    expect(r).toContain('qualité 50 (std)');
    expect(r).toContain('0.0s→4.0s (4.0s)');
  });

  it('écran qualité 100 (lock) affiche le bon label', () => {
    const r = annotationSummary(screen({ quality: 100 }), 4, 4);
    expect(r).toContain('qualité 100 (lock)');
    expect(r).toContain('4.0s→8.0s (4.0s)');
  });

  it('écran avec tStart/tEnd partiels (0.3..0.7)', () => {
    const r = annotationSummary(screen({ tStart: 0.3, tEnd: 0.7 }), 0, 4);
    // 0 + 0.3 × 4 = 1.2, 0 + 0.7 × 4 = 2.8, durée 1.6
    expect(r).toContain('1.2s→2.8s (1.6s)');
  });

  it('cross-step marqué d\'une étoile', () => {
    const r = annotationSummary(screen({ tStart: -0.4, tEnd: 0.5 }), 4, 4);
    expect(r).toContain('★');
  });

  it('phase=start ajoute le tag (début)', () => {
    const r = annotationSummary(screen({ phase: 'start' }), 4, 4);
    expect(r).toContain('(début)');
  });

  it('phase=end (défaut) n\'ajoute pas de tag', () => {
    const r = annotationSummary(screen({ phase: 'end' }), 0, 4);
    expect(r).not.toContain('(début)');
  });

  it('dribble : format minimal', () => {
    const a: Annotation = { type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } as Annotation;
    const r = annotationSummary(a, 0, 4);
    expect(r).toContain('O1 dribble');
    expect(r).toContain('0.0s→4.0s');
  });

  it('cut : libellé "coupe"', () => {
    const a: Annotation = { type: 'cut', fromId: 'O2', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } as Annotation;
    const r = annotationSummary(a, 8, 4);
    expect(r).toContain('O2 coupe');
  });

  it('pass : inclut fromId → toId', () => {
    const a: Annotation = { type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } as Annotation;
    const r = annotationSummary(a, 0, 4);
    expect(r).toContain('O1 → O3 passe');
  });

  it('respecte secondsPerStep différent (3 s)', () => {
    const r = annotationSummary(screen(), 0, 3);
    expect(r).toContain('0.0s→3.0s (3.0s)');
  });
});
