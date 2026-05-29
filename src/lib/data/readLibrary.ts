// Bibliothèque de lectures canoniques (read-based offense, Phase L.1).
//
// Données métier : pour une action-écran (PnR / pick-and-pop) donnée, produit
// les `ScenarioBranch` RÉACTIVES correspondant aux « bonnes » lectures selon la
// couverture défensive. Le coach les insère en un clic ; le moteur
// (`selectReactiveBranch`) les active automatiquement selon la couverture lue.
//
// Ce sont des CONTINUATIONS de départ volontairement simples (1 à 3 actions) —
// le coach peut ensuite enrichir chaque branche dans l'éditeur de scénario.
//
//   drop   → floater / pull-up du porteur
//   under  → tir immédiat (pull-up 3)
//   over   → snake dribble / attaque
//   hedge  → re-screen (re-pick)
//   switch → attaque du mismatch (iso)
//   ice    → reject l'écran, attaque le côté libre
//   blitz  → passe au roller (short roll) [+ skip corner faible si fourni]

import type {
  AttackerId,
  OffensiveScriptedAction,
  ScenarioBranch,
  ScriptedAction,
  ScreenRule,
  ActionSide,
} from '../types';
import { newScriptedActionId } from '../logic/compileScenario';

export interface ReadBranchContext {
  /** Attaquant côté faible, cible du skip après short-roll (lecture `blitz`).
   *  Si absent, la lecture blitz se limite à la passe au roller. */
  weakSideId?: AttackerId;
}

interface ReadDef {
  coverage: ScreenRule;
  label: string;
  build: (
    carrier: AttackerId,
    screener: AttackerId,
    side: ActionSide,
    ctx: ReadBranchContext,
    mkId: () => string
  ) => ScriptedAction[];
}

function offensive(
  mkId: () => string,
  type: OffensiveScriptedAction['type'],
  params: OffensiveScriptedAction['params']
): OffensiveScriptedAction {
  return { kind: 'offensive', id: mkId(), type, params };
}

/** Table de lecture canonique PnR (ordre = priorité d'évaluation). */
const READS: ReadDef[] = [
  {
    coverage: 'drop',
    label: 'Si DROP → floater / pull-up',
    build: (carrier, _s, _side, _ctx, mkId) => [
      offensive(mkId, 'drive', { driver: carrier, direction: 'panier' }),
    ],
  },
  {
    coverage: 'under',
    label: 'Si UNDER → tir immédiat',
    build: (carrier, _s, _side, _ctx, mkId) => [
      offensive(mkId, 'shoot', { shooter: carrier }),
    ],
  },
  {
    coverage: 'over',
    label: 'Si OVER → snake / attaque',
    build: (carrier, _s, _side, _ctx, mkId) => [
      offensive(mkId, 'drive', { driver: carrier, direction: 'middle' }),
    ],
  },
  {
    coverage: 'hedge',
    label: 'Si HEDGE → re-screen',
    build: (carrier, screener, side, _ctx, mkId) => [
      offensive(mkId, 'pick-and-roll', { ballHandler: carrier, screener, side }),
    ],
  },
  {
    coverage: 'switch',
    label: 'Si SWITCH → attaque mismatch',
    build: (carrier, _s, _side, _ctx, mkId) => [
      offensive(mkId, 'isolation', { driver: carrier }),
    ],
  },
  {
    coverage: 'ice',
    label: 'Si ICE → reject',
    build: (carrier, screener, side, _ctx, mkId) => [
      offensive(mkId, 'reject', { ballHandler: carrier, screener, side }),
    ],
  },
  {
    coverage: 'blitz',
    label: 'Si BLITZ → short roll (+ skip)',
    build: (carrier, screener, _side, ctx, mkId) => {
      const actions: ScriptedAction[] = [
        // Passe au roller : 4-contre-3 (short roll).
        offensive(mkId, 'pass', { from: carrier, to: screener }),
      ];
      if (ctx.weakSideId && ctx.weakSideId !== carrier && ctx.weakSideId !== screener) {
        // Skip vers le corner faible, puis tir.
        actions.push(offensive(mkId, 'kick-out', { from: screener, to: ctx.weakSideId }));
        actions.push(offensive(mkId, 'shoot', { shooter: ctx.weakSideId }));
      }
      return actions;
    },
  },
];

/** Couvertures couvertes par la bibliothèque (pour l'UI). */
export const CANONICAL_READ_COVERAGES: ScreenRule[] = READS.map((r) => r.coverage);

/**
 * Construit les branches réactives canoniques pour une action-écran.
 * @param source action PnR / pick-and-pop dont on lit la couverture.
 * @param ctx contexte optionnel (côté faible pour le skip blitz).
 * @param mkId fabrique d'id (injectable pour tests déterministes).
 * @returns une `ScenarioBranch` réactive par couverture (vide si la source
 *   n'a pas de porteur + poseur identifiables).
 */
export function buildCanonicalReadBranches(
  source: OffensiveScriptedAction,
  ctx: ReadBranchContext = {},
  mkId: () => string = newScriptedActionId
): ScenarioBranch[] {
  const carrier = source.params.ballHandler;
  const screener = source.params.screener;
  if (!carrier || !screener) return [];
  const side = (source.params.side ?? 'fort') as ActionSide;

  return READS.map((r) => ({
    id: mkId(),
    label: r.label,
    divergeAfterActionId: source.id,
    trigger: { kind: 'screen-coverage' as const, actionId: source.id, coverage: [r.coverage] },
    actions: r.build(carrier, screener, side, ctx, mkId),
  }));
}
