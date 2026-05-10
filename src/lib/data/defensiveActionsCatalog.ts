// Catalogue des actions défensives Phase 3 MVP.
// Source : "FIBA Europe — Terminologie du Basketball" + design Phase 3.
// Le code de génération des directives vit dans /lib/logic/compileScenario.ts
// (passe 2). L'application moteur vit dans /lib/logic/applyDirective.ts.

import type { DefensiveActionType, DefensiveActionParams } from '@/lib/types';

export type DefensiveParamKind =
  | 'defenders' | 'target' | 'swapWith' | 'thirdSwap'
  | 'helpStep' | 'recoverStep' | 'dropDepth';

export interface DefensiveActionDefinition {
  type: DefensiveActionType;
  label: string;
  fibaTerm: string;
  description: string;
  category: 'aide' | 'switch' | 'trap' | 'rotation' | 'écran porteur' | 'closeout';
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

  // =====================================================
  // Phase 5 — Couvertures Tier 2
  // =====================================================
  over: {
    type: 'over', label: 'Over', fibaTerm: 'Over (chase the screen)',
    description: 'Le défenseur du porteur passe par-dessus l\'écran (côté ballon).',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} passe over (par-dessus) sur ${p.target ?? '?'}.`,
  },
  under: {
    type: 'under', label: 'Under', fibaTerm: 'Under (go under the screen)',
    description: 'Le défenseur du porteur passe sous l\'écran (côté panier).',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} passe under (sous l\'écran) sur ${p.target ?? '?'}.`,
  },
  switch: {
    type: 'switch', label: 'Switch', fibaTerm: 'Switch',
    description: 'Les défenseurs échangent leurs hommes au contact de l\'écran.',
    category: 'switch',
    requiredParams: ['defenders', 'swapWith'],
    reader: (p) => `${fmtList(p.defenders)} et ${p.swapWith ?? '?'} switchent à l\'écran.`,
  },
  hedge: {
    type: 'hedge', label: 'Hedge (show)', fibaTerm: 'Hedge / Show',
    description: 'Le défenseur du screener montre agressivement sur le porteur puis recover.',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} hedge sur ${p.target ?? '?'}.`,
  },
  drop: {
    type: 'drop', label: 'Drop coverage', fibaTerm: 'Drop',
    description: 'Le défenseur du screener retraite vers le panier (containing).',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    optionalParams: ['dropDepth'],
    reader: (p) => `${fmtList(p.defenders)} drop ${p.dropDepth ?? 'medium'} vs ${p.target ?? '?'}.`,
  },
  blitz: {
    type: 'blitz', label: 'Blitz', fibaTerm: 'Blitz / Hard show',
    description: 'Trap agressif sur le porteur dès l\'écran (plus haut que le trap classique).',
    category: 'trap',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} blitz ${p.target ?? '?'}.`,
  },
  ice: {
    type: 'ice', label: 'Ice (push down)', fibaTerm: 'Ice / Fan / Push down',
    description: 'Force le porteur vers la baseline en refusant l\'écran latéral.',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} ice ${p.target ?? '?'} vers la baseline.`,
  },
  'flat-hedge': {
    type: 'flat-hedge', label: 'Flat hedge', fibaTerm: 'Flat hedge',
    description: 'Hedge parallèle à la ligne de fond (plus passif qu\'un hedge classique).',
    category: 'écran porteur',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} flat hedge sur ${p.target ?? '?'}.`,
  },
  'peel-switch': {
    type: 'peel-switch', label: 'Peel switch', fibaTerm: 'Peel switch',
    description: 'Aide sur drive — le défenseur initial peel et switche sur l\'aide.',
    category: 'switch',
    requiredParams: ['defenders', 'swapWith', 'target'],
    reader: (p) => `${fmtList(p.defenders)} peel switch sur ${p.target ?? '?'} (échange avec ${p.swapWith ?? '?'}).`,
  },
  'triple-switch': {
    type: 'triple-switch', label: 'Triple switch', fibaTerm: 'Triple switch',
    description: '3 défenseurs rotation pour éviter un mismatch.',
    category: 'switch',
    requiredParams: ['defenders', 'swapWith', 'thirdSwap'],
    reader: (p) => `Triple switch ${fmtList(p.defenders)} → ${p.swapWith ?? '?'} → ${p.thirdSwap ?? '?'}.`,
  },
  'closing-out': {
    type: 'closing-out', label: 'Closing out', fibaTerm: 'Closing out',
    description: 'Sprint contrôlé sur tireur potentiel (mains hautes, pas freinés).',
    category: 'closeout',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} closeout sur ${p.target ?? '?'}.`,
  },
};

export const ALL_DEFENSIVE_ACTION_TYPES: DefensiveActionType[] =
  Object.keys(DEFENSIVE_ACTIONS_CATALOG) as DefensiveActionType[];
