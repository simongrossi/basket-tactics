// Compilateur scénario → Step[].
// Prend la position de départ (premier step existant) + le scénario, et produit
// la liste complète des steps. Préserve les steps que le user a édités à la
// main (`manualOverride: true`) en les réinjectant à leur position d'origine
// dans le groupe de l'action qui les a générés.

import type { AttackerPositions, AttackerId, DefensiveScriptedAction, PlayerCount, ScriptedAction, Step } from '@/lib/types';
import { SCRIPTED_GENERATORS } from './scriptedGenerators';
import { applyDefensivePass, type ParentRangeMap } from './defensiveCompilation';
import { ensureAnnotationsForMovement } from './migrateAnnotations';
import { breakUpTeleports } from './breakUpTeleports';

export interface CompileInput {
  initialOff: AttackerPositions;
  initialBallCarrier: AttackerId;
  actions: ScriptedAction[];
  /** Steps existants (utilisés pour préserver les manualOverride par actionId
   *  + ordre relatif intra-action). */
  existingSteps?: Step[];
  /** Nombre de joueurs actifs. Utilisé par la migration d'annotations pour
   *  éviter de traiter des joueurs absents (ex. O5 en mode 4 joueurs). */
  playerCount?: PlayerCount;
}

export function compileScenario(input: CompileInput): Step[] {
  const { initialOff, initialBallCarrier, actions, existingSteps = [] } = input;

  const initialStep: Step = {
    off: structuredClone(initialOff),
    ballCarrier: initialBallCarrier,
    annotations: [],
    label: 'Départ',
  };
  const result: Step[] = [initialStep];
  let prev = initialStep;

  // Index des manualOverride par (actionId, subIndex). On parcourt existingSteps
  // dans l'ordre et on compte les occurrences de chaque generatedBy pour
  // déterminer le subIndex relatif à chaque step au sein de son groupe d'action.
  // Cela permet de matcher correctement même quand seul le 2e ou 3e step d'une
  // action a été édité manuellement (les autres restent regénérés).
  const manualByAction = new Map<string, Map<number, Step>>();
  const subIndexCounter = new Map<string, number>();
  for (const s of existingSteps) {
    if (!s.generatedBy) continue;
    // Les steps interpolés (isInterpolated) sont des lissages générés par
    // breakUpTeleports — ils ne comptent pas comme des sous-étapes éditables
    // par l'utilisateur et leurs manualOverride éventuels sont ignorés.
    if (s.isInterpolated) continue;
    const cur = subIndexCounter.get(s.generatedBy) ?? 0;
    if (s.manualOverride) {
      let m = manualByAction.get(s.generatedBy);
      if (!m) { m = new Map(); manualByAction.set(s.generatedBy, m); }
      m.set(cur, s);
    }
    subIndexCounter.set(s.generatedBy, cur + 1);
  }

  // Passe 1 — actions offensives
  const parentRanges: ParentRangeMap = {};
  for (const action of actions) {
    if (action.kind !== 'offensive') continue;
    const gen = SCRIPTED_GENERATORS[action.type];
    if (!gen) continue;
    const generated = gen(prev, action);
    if (generated.length === 0) continue;

    const startIndex = result.length;
    const overrides = manualByAction.get(action.id);
    for (let i = 0; i < generated.length; i++) {
      const override = overrides?.get(i);
      if (override) {
        const preserved = structuredClone(override);
        result.push(preserved);
        prev = preserved;
      } else {
        result.push(generated[i]);
        prev = generated[i];
      }
    }
    parentRanges[action.id] = { startIndex, endIndex: result.length - 1 };
  }

  // Passe 2 — actions défensives
  const defensives = actions.filter(
    (a): a is DefensiveScriptedAction => a.kind === 'defensive',
  );
  if (defensives.length > 0) {
    applyDefensivePass(result, defensives, parentRanges);
  }

  // Décompose les téléports : si un joueur bouge trop entre deux steps (>100 px
  // ≈ 2.7 m), on insère des steps intermédiaires interpolés. Lisse les
  // mouvements générés par les actions FIBA qui placent les joueurs en un coup
  // (back-screen, cut profond, plonge).
  const smoothed = breakUpTeleports(result);
  return ensureAnnotationsForMovement(smoothed, input.playerCount ?? 5);
}

/** Convertit `crypto.randomUUID()` ou un fallback simple. */
export function newScriptedActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
