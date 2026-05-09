import { describe, it, expect } from 'vitest';
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';

describe('migrateScriptedActions', () => {
  it('ajoute kind:offensive aux actions sans kind (legacy v0.7)', () => {
    const legacy: any[] = [
      { id: 'a1', type: 'pick-and-roll', params: { ballHandler: 'O1', screener: 'O5' } },
    ];
    const migrated = migrateScriptedActions(legacy);
    expect(migrated[0].kind).toBe('offensive');
    expect(migrated[0].id).toBe('a1');
    expect(migrated[0].type).toBe('pick-and-roll');
  });

  it("préserve kind:offensive existant", () => {
    const fresh: any[] = [
      { kind: 'offensive', id: 'a1', type: 'drive', params: { driver: 'O1' } },
    ];
    const migrated = migrateScriptedActions(fresh);
    expect(migrated[0].kind).toBe('offensive');
  });

  it("préserve kind:defensive existant", () => {
    const fresh: any[] = [
      { kind: 'defensive', id: 'd1', type: 'trap', parentActionId: 'a1', params: { defenders: ['D1','D5'], target: 'O1' } },
    ];
    const migrated = migrateScriptedActions(fresh);
    expect(migrated[0].kind).toBe('defensive');
  });
});
