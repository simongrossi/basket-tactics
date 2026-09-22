'use client';

import type { OffensiveScriptedAction, ScriptedAction } from '@/lib/types';
import { SCRIPTED_ACTIONS_CATALOG } from '@/lib/data/scriptedActionsCatalog';

interface ScenarioReaderProps {
  scriptedActions: ScriptedAction[];
  /** Index actif dans la timeline (Step). Permet de souligner l'action en cours. */
  activeStep: number;
  /** Mapping step→actionId (issu de Step.generatedBy) pour mettre en gras
   *  l'action correspondant au step actif. */
  stepToActionId: (string | undefined)[];
}

export function ScenarioReader({ scriptedActions, activeStep, stepToActionId }: ScenarioReaderProps) {
  // Phase 3 défense scriptable : la lecture FR ne couvre pour l'instant que
  // les actions offensives (la défensive sera intégrée Task 6+).
  const offensiveActions = scriptedActions.filter(
    (a): a is OffensiveScriptedAction => a.kind === 'offensive'
  );
  if (offensiveActions.length === 0) return null;

  const activeActionId = stepToActionId[activeStep];

  return (
    <div
      style={{
        // U04 — thème sombre explicite (contraste ≥ 4,5:1), sans dépendre
        // des remappages CSS de la colonne centrale.
        background: '#262a32',
        border: '1px solid #343b47',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: '#fdba74', marginRight: 4 }}>
        Système :
      </span>
      {offensiveActions.map((action, idx) => {
        const def = SCRIPTED_ACTIONS_CATALOG[action.type];
        const text = action.label || def.reader(action.params);
        const isActive = action.id === activeActionId;
        return (
          <span
            key={action.id}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: isActive ? 'rgba(216, 90, 48, 0.22)' : '#1f242c',
              border: `1px solid ${isActive ? '#fb923c' : '#3b4452'}`,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fed7aa' : '#e5e7eb',
            }}
          >
            <span style={{ fontWeight: 700, marginRight: 4, color: '#fdba74' }}>{idx + 1}.</span>
            {text}
          </span>
        );
      })}
    </div>
  );
}
