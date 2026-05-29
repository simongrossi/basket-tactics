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
  HelpSource,
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

// =============================================================
// Phase L.3 — lectures hors PnR
// =============================================================

export interface DriveKickContext {
  /** Receveur par origine d'aide. Manquant → 1er attaquant ≠ pénétrant. */
  receivers?: Partial<Record<HelpSource, AttackerId>>;
  /** Liste pour le fallback déterministe du receveur. */
  attackers?: AttackerId[];
}

interface DriveRead {
  source: HelpSource;
  label: string;
  type: 'kick-out' | 'pass';
}

/** Drive-and-kick : l'homme de l'aidant est libre → on le sert. */
const DRIVE_READS: DriveRead[] = [
  { source: 'weak', label: 'Si aide FAIBLE → skip côté faible', type: 'kick-out' },
  { source: 'strong', label: 'Si aide FORTE → kick côté fort', type: 'kick-out' },
  { source: 'low', label: 'Si aide INTÉRIEURE → dump roller', type: 'pass' },
];

/** Origines d'aide couvertes par la bibliothèque drive-and-kick (pour l'UI). */
export const DRIVE_KICK_SOURCES: HelpSource[] = DRIVE_READS.map((r) => r.source);

/**
 * Lectures drive-and-kick pour une action de drive/isolation. Une branche
 * réactive par origine d'aide ; chacune sert l'homme libéré puis tire. Le
 * receveur par défaut (fallback déterministe) est ajustable ensuite par le
 * coach dans l'éditeur.
 */
export function buildDriveKickReads(
  source: OffensiveScriptedAction,
  ctx: DriveKickContext = {},
  mkId: () => string = newScriptedActionId
): ScenarioBranch[] {
  const driver = source.params.driver ?? source.params.ballHandler;
  if (!driver) return [];
  const fallback = (ctx.attackers ?? []).find((a) => a !== driver);

  const branches: ScenarioBranch[] = [];
  for (const r of DRIVE_READS) {
    const to = ctx.receivers?.[r.source] ?? fallback;
    if (!to) continue;
    branches.push({
      id: mkId(),
      label: r.label,
      divergeAfterActionId: source.id,
      trigger: { kind: 'help-source', actionId: source.id, source: [r.source] },
      actions: [
        offensive(mkId, r.type, { from: driver, to }),
        offensive(mkId, 'shoot', { shooter: to }),
      ],
    });
  }
  return branches;
}

/**
 * Lecture backdoor : si le défenseur du receveur refuse la ligne de passe
 * (deny), le receveur coupe dans le dos. Pour une action de passe / kick-out
 * (param `to`) ou give-and-go (param `receiver`).
 */
export function buildBackdoorReads(
  source: OffensiveScriptedAction,
  mkId: () => string = newScriptedActionId
): ScenarioBranch[] {
  const receiver = source.params.to ?? source.params.receiver;
  if (!receiver) return [];
  return [
    {
      id: mkId(),
      label: `Si DENY ${receiver} → backdoor`,
      divergeAfterActionId: source.id,
      trigger: { kind: 'deny', actionId: source.id, receiver },
      actions: [offensive(mkId, 'backdoor-cut', { cutter: receiver })],
    },
  ];
}
