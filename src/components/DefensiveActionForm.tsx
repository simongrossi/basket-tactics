'use client';

import type {
  DefensiveScriptedAction, DefensiveActionParams,
  DefenderId, AttackerId,
} from '@/lib/types';
import { DEFENSIVE_ACTIONS_CATALOG } from '@/lib/data/defensiveActionsCatalog';

interface DefensiveActionFormProps {
  action: DefensiveScriptedAction;
  defenderIds: DefenderId[];
  attackerIds: AttackerId[];
  onChange: (updated: DefensiveScriptedAction) => void;
}

export function DefensiveActionForm({ action, defenderIds, attackerIds, onChange }: DefensiveActionFormProps) {
  const def = DEFENSIVE_ACTIONS_CATALOG[action.type];
  const updateParams = (patch: Partial<DefensiveActionParams>) => {
    onChange({ ...action, params: { ...action.params, ...patch } });
  };

  const requires = (k: string) =>
    (def.requiredParams as string[]).includes(k);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
      {requires('defenders') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>
            Défenseur(s)
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {defenderIds.map((d) => {
              const checked = action.params.defenders.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => {
                    const next = checked
                      ? action.params.defenders.filter((x) => x !== d)
                      : [...action.params.defenders, d];
                    updateParams({ defenders: next });
                  }}
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    border: '1px solid ' + (checked ? '#1e3a8a' : '#cbd5e1'),
                    borderRadius: 4,
                    background: checked ? '#dbeafe' : '#fff',
                    color: checked ? '#1e3a8a' : '#64748b',
                    cursor: 'pointer',
                  }}
                >{d}</button>
              );
            })}
          </div>
        </div>
      )}

      {requires('target') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>Cible</label>
          <select
            value={action.params.target ?? ''}
            onChange={(e) => updateParams({ target: e.target.value as AttackerId })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value="">—</option>
            {attackerIds.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {requires('swapWith') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>
            Échange avec
          </label>
          <select
            value={action.params.swapWith ?? ''}
            onChange={(e) => updateParams({ swapWith: e.target.value as DefenderId })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value="">—</option>
            {defenderIds.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
