// Catalogue des actions défensives Phase 3 MVP.
// Source : "FIBA Europe — Terminologie du Basketball" + design Phase 3.
// Le code de génération des directives vit dans /lib/logic/compileScenario.ts
// (passe 2). L'application moteur vit dans /lib/logic/applyDirective.ts.

import type { DefensiveActionType, DefensiveActionParams } from '@/lib/types';

export type DefensiveParamKind =
  | 'defenders' | 'target' | 'swapWith' | 'helpStep' | 'recoverStep';

export interface DefensiveActionDefinition {
  type: DefensiveActionType;
  label: string;
  fibaTerm: string;
  description: string;
  category: 'aide' | 'switch' | 'trap' | 'rotation';
  requiredParams: DefensiveParamKind[];
  optionalParams?: DefensiveParamKind[];
  /** Lecture FR de la directive. */
  reader: (p: DefensiveActionParams) => string;
}

const fmtList = (ids: string[] | undefined) => (ids && ids.length ? ids.join('+') : '?');

export const DEFENSIVE_ACTIONS_CATALOG: Record<DefensiveActionType, DefensiveActionDefinition> = {
  'help-and-recover': {
    type: 'help-and-recover',
    label: 'Help & recover',
    fibaTerm: 'Help and recover',
    description: 'Un défenseur quitte son homme pour aider sur drive, puis rentre en closeout.',
    category: 'aide',
    requiredParams: ['defenders', 'target'],
    optionalParams: ['helpStep', 'recoverStep'],
    reader: (p) => `${fmtList(p.defenders)} aide sur ${p.target ?? '?'} puis recover.`,
  },
  'pre-switch': {
    type: 'pre-switch',
    label: 'Pre-switch',
    fibaTerm: 'Pre-switch',
    description: '2 défenseurs anticipent l\'écran et échangent leurs hommes avant l\'engagement.',
    category: 'switch',
    requiredParams: ['defenders', 'swapWith'],
    reader: (p) => `${fmtList(p.defenders)} et ${p.swapWith ?? '?'} échangent en anticipation.`,
  },
  trap: {
    type: 'trap',
    label: 'Trap',
    fibaTerm: 'Trap / Double-team',
    description: '2 défenseurs forment un V agressif sur le porteur.',
    category: 'trap',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} trappent ${p.target ?? '?'}.`,
  },
  tag: {
    type: 'tag',
    label: 'Tag',
    fibaTerm: 'Tag (low-man bump)',
    description: 'Un low-man bumpe temporairement le roller, puis rentre en closeout.',
    category: 'rotation',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} tag ${p.target ?? '?'} (roller).`,
  },
};

export const ALL_DEFENSIVE_ACTION_TYPES: DefensiveActionType[] =
  Object.keys(DEFENSIVE_ACTIONS_CATALOG) as DefensiveActionType[];
