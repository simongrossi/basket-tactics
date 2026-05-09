import type { ScriptedAction } from '@/lib/types';

/** Migre les ScriptedAction legacy (v0.7, sans kind) vers la forme v0.8.
 *  Toute action sans champ `kind` est traitée comme offensive (avant Phase 3,
 *  seules les actions offensives existaient). */
export function migrateScriptedActions(actions: unknown[]): ScriptedAction[] {
  return actions.map((raw) => {
    const a = raw as Partial<ScriptedAction> & Record<string, unknown>;
    if (a.kind === 'offensive' || a.kind === 'defensive') {
      return a as ScriptedAction;
    }
    return { ...a, kind: 'offensive' } as ScriptedAction;
  });
}
