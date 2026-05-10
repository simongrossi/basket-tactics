import type {
  AttackerId,
  DefenderId,
  DefensiveDirective,
  DefensiveScriptedAction,
  Step,
} from '@/lib/types';

/** Plage d'indices [start..end] occupée par une action offensive dans steps[]. */
export interface ParentRange {
  startIndex: number;
  endIndex: number; // inclusif
}

/** Carte parentActionId → plage de steps dans la liste compilée. */
export type ParentRangeMap = Record<string, ParentRange>;

/** Convention par défaut : Di défend Oi (numérique). Permet de calculer le swap
 *  d'assignation pour pre-switch sans dépendre du state global. */
const DEFAULT_ASSIGNMENT: Record<DefenderId, AttackerId> = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

export function resolveTargetSteps(
  def: DefensiveScriptedAction,
  steps: Step[],
): number[] {
  if (def.parentActionId !== undefined) {
    const parentIndices: number[] = [];
    steps.forEach((s, i) => {
      if (s.generatedBy === def.parentActionId) parentIndices.push(i);
    });
    if (parentIndices.length === 0) {
      console.warn(`[defensiveCompilation] action ${def.id} parent ${def.parentActionId} introuvable`);
      return [];
    }
    if (def.affectedSteps && def.affectedSteps.length > 0) {
      // affectedSteps relatifs au parent (0 = 1er step du parent)
      return def.affectedSteps
        .filter((rel) => rel >= 0 && rel < parentIndices.length)
        .map((rel) => parentIndices[rel]);
    }
    return parentIndices;
  }
  // Action libre
  if (!def.affectedSteps || def.affectedSteps.length === 0) {
    console.warn(`[defensiveCompilation] action libre ${def.id} sans affectedSteps`);
    return [];
  }
  return def.affectedSteps.filter((i) => i >= 0 && i < steps.length);
}

export interface ExpansionEntry {
  stepIndex: number;
  directive: DefensiveDirective;
}

export function expandToDirectives(
  def: DefensiveScriptedAction,
  targetStepIndices: number[],
): ExpansionEntry[] {
  const result: ExpansionEntry[] = [];

  switch (def.type) {
    case 'trap':
    case 'tag':
    case 'pre-switch':
    case 'over':
    case 'under':
    case 'switch':
    case 'hedge':
    case 'drop':
    case 'blitz':
    case 'ice':
    case 'flat-hedge':
    case 'peel-switch':
    case 'triple-switch':
    case 'closing-out': {
      // 1 directive engage par step ciblé.
      // Pour pre-switch, on ne génère qu'un engage sur le 1er step ciblé
      // (l'effet swap est géré par applyDefensivePass via assignmentOverrides).
      const stepsToEmit = def.type === 'pre-switch'
        ? targetStepIndices.slice(0, 1)
        : targetStepIndices;
      for (const idx of stepsToEmit) {
        result.push({
          stepIndex: idx,
          directive: {
            type: def.type,
            defenders: def.params.defenders,
            target: def.params.target,
            swapWith: def.params.swapWith,
            thirdSwap: def.params.thirdSwap,
            dropDepth: def.params.dropDepth,
            phase: 'engage',
            sourceActionId: def.id,
          },
        });
      }
      break;
    }
    case 'help-and-recover': {
      // helpStep + recoverStep sont :
      //  - relatifs au parent (couplée) : 0 = 1er step du parent
      //  - absolus (libre) : indices directs dans steps[]
      // Si non fournis, on utilise les 2 premiers targetStepIndices.
      const isCoupled = def.parentActionId !== undefined;
      const resolveIdx = (raw: number | undefined): number | undefined => {
        if (raw === undefined) return undefined;
        if (isCoupled) {
          // Indice relatif → on lit dans targetStepIndices (qui est déjà ordonné).
          if (raw < 0 || raw >= targetStepIndices.length) return undefined;
          return targetStepIndices[raw];
        }
        // Libre : indice absolu, doit être dans la liste targetStepIndices
        // (sinon resolveTargetSteps l'aurait filtré).
        return raw;
      };
      const helpIdx = resolveIdx(def.params.helpStep) ?? targetStepIndices[0];
      const recoverIdx = resolveIdx(def.params.recoverStep)
        ?? targetStepIndices[1]
        ?? (helpIdx !== undefined ? helpIdx + 1 : undefined);
      if (helpIdx !== undefined) {
        result.push({
          stepIndex: helpIdx,
          directive: {
            type: 'help-and-recover',
            defenders: def.params.defenders,
            target: def.params.target,
            phase: 'engage',
            sourceActionId: def.id,
          },
        });
      }
      if (recoverIdx !== undefined && recoverIdx !== helpIdx) {
        result.push({
          stepIndex: recoverIdx,
          directive: {
            type: 'help-and-recover',
            defenders: def.params.defenders,
            target: def.params.target,
            phase: 'release',
            sourceActionId: def.id,
          },
        });
      }
      break;
    }
  }

  return result;
}

/** Applique toutes les directives défensives sur les steps[] (mutation in-place).
 *  Pose aussi assignmentOverrides pour les pre-switch. */
export function applyDefensivePass(
  steps: Step[],
  defensives: DefensiveScriptedAction[],
  parentRanges: ParentRangeMap,
): void {
  for (const def of defensives) {
    // Validation
    if (!def.params.defenders || def.params.defenders.length === 0) {
      console.warn(`[defensiveCompilation] ${def.id} sans defenders, ignorée`);
      continue;
    }
    if (def.type === 'pre-switch' && !def.params.swapWith) {
      console.warn(`[defensiveCompilation] pre-switch ${def.id} sans swapWith, ignorée`);
      continue;
    }

    const targetIndices = resolveTargetSteps(def, steps);
    if (targetIndices.length === 0) continue;

    // Directives normales
    const directives = expandToDirectives(def, targetIndices);
    for (const { stepIndex, directive } of directives) {
      const step = steps[stepIndex];
      if (!step) continue;
      step.defensiveDirectives ??= [];
      step.defensiveDirectives.push(directive);
    }

    // pre-switch : pose assignmentOverrides sur engage step + tous les
    // steps suivants du parent.
    if (def.type === 'pre-switch') {
      const d0 = def.params.defenders[0];
      const d1 = def.params.swapWith!;
      const newAssign = computeSwapAssignment(d0, d1, steps[targetIndices[0]]);
      const range = def.parentActionId ? parentRanges[def.parentActionId] : undefined;
      const startApply = targetIndices[0];
      const endApply = range ? range.endIndex : startApply;
      for (let i = startApply; i <= endApply; i++) {
        const s = steps[i];
        if (!s) continue;
        s.assignmentOverrides = { ...(s.assignmentOverrides ?? {}), ...newAssign };
      }
    }
  }
}

function computeSwapAssignment(
  d0: DefenderId,
  d1: DefenderId,
  contextStep: Step | undefined,
): Partial<Record<DefenderId, AttackerId>> {
  const cur = contextStep?.assignmentOverrides ?? {};
  // Source d'assignation : assignmentOverrides s'il existe, sinon convention par défaut Di→Oi.
  const a0 = cur[d0] ?? DEFAULT_ASSIGNMENT[d0];
  const a1 = cur[d1] ?? DEFAULT_ASSIGNMENT[d1];
  return { [d0]: a1, [d1]: a0 };
}
