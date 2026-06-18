import { describe, it, expect } from 'vitest';
import { DRILL_TEMPLATES } from '../drillTemplates';
import { blockFromTemplate } from '../practiceSessions';

describe('DRILL_TEMPLATES', () => {
  it('contient l\'exercice Philadelphia', () => {
    const philly = DRILL_TEMPLATES.find((d) => /philadelphia/i.test(d.title));
    expect(philly).toBeDefined();
    expect(philly!.category).toBe('Transition');
    expect(philly!.durationMin).toBeGreaterThan(0);
    expect(philly!.templateId).toBe('drill-philadelphia');
    // Consignes détaillées multi-lignes (fiche d'exercice).
    expect(philly!.notes!.length).toBeGreaterThan(100);
    expect(philly!.notes!.includes('\n')).toBe(true);
  });

  it('tous les drills sont des blocs libres valides', () => {
    DRILL_TEMPLATES.forEach((d) => {
      expect(d.kind).toBe('free');
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.durationMin).toBeGreaterThan(0);
      expect(d.category.length).toBeGreaterThan(0);
      expect(d.systemId).toBeUndefined();
    });
  });

  it('blockFromTemplate : id frais, contenu copié, indépendant', () => {
    const philly = DRILL_TEMPLATES.find((d) => /philadelphia/i.test(d.title))!;
    const a = blockFromTemplate(philly);
    const b = blockFromTemplate(philly);
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a.kind).toBe('free');
    expect(a.title).toBe(philly.title);
    expect(a.notes).toBe(philly.notes);
    expect(a.durationMin).toBe(philly.durationMin);
    expect(a.templateId).toBe('drill-philadelphia');
  });
});
