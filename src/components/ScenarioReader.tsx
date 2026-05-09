'use client';

import type { OffensiveScriptedAction, ScriptedAction } from '@/lib/types';
import { SCRIPTED_ACTIONS_CATALOG } from '@/lib/data/scriptedActionsCatalog';
import { COLORS } from './ui';

interface ScenarioReaderProps {
  scriptedActions: ScriptedAction[];
  /** Index actif dans la timeline (Step). Permet de souligner l'action en cours. */
  activeStep: number;
  /** Mapping step→actionId (issu de Step.generatedBy) pour mettre en gras
   *  l'action correspondant au step actif. */
  stepToActionId: (string | undefined)[];
}

export function ScenarioReader({ scriptedActions, activeStep, stepToActionId }: ScenarioReaderProps) {
  const c = COLORS.offense;
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
        background: '#fff',
        border: `1px solid ${c.border}`,
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
      <span style={{ fontSize: 11, fontWeight: 700, color: c.accentText, marginRight: 4 }}>
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
              background: isActive ? c.bgSubtle : '#f8fafc',
              border: `1px solid ${isActive ? c.accent : c.border}`,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? c.accentText : '#334155',
            }}
          >
            <span style={{ fontWeight: 700, marginRight: 4, color: c.accent }}>{idx + 1}.</span>
            {text}
          </span>
        );
      })}
    </div>
  );
}
