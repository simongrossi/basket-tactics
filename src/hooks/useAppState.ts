import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  DefenderPositions,
  Annotation,
  AnnotationType,
  Step,
  ScreenRule,
  ScenarioBranch,
  ScriptedAction,
  Tool,
  DefenderRule,
  DefenseSystem,
  ZoneConfig,
  DefensiveActionType,
  DefensiveActionParams,
  DefensiveScriptedAction,
  PlayerCount,
} from '@/lib/types';
import { makeInitialState, makeStep, initialOff, initialDef } from '@/lib/data/initial';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import type { Template } from '@/lib/data/templates';
import type { DefensePreset } from '@/lib/data/defensePresets';
import type { DefenderProfile } from '@/lib/data/defenderProfiles';
import { compileScenario, newScriptedActionId } from '@/lib/logic/compileScenario';
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';
import { normalizePlayerCount, normalizeStateForPlayerCount } from '@/lib/logic/players';
import {
  setPlayerPositionAt,
  upsertMovementAnnotation,
  upsertPassAnnotation,
  removeAnnotation as removeAnnotationFromSteps,
} from '@/lib/logic/stepMutations';
import { ensureAnnotationsForMovement, reconcileMovementAnnotations } from '@/lib/logic/migrateAnnotations';

const STORAGE_KEY = 'basket-tactics-state-v1';

function loadFromStorage(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const defaults = makeInitialState();
    const scriptedActions = parsed.scriptedActions
      ? migrateScriptedActions(parsed.scriptedActions as unknown[])
      : parsed.scriptedActions;
    const merged = {
      ...defaults,
      ...parsed,
      zoneConfig: { ...defaults.zoneConfig, ...(parsed.zoneConfig || {}) },
      scriptedActions,
    } as AppState;
    const normalized = normalizeStateForPlayerCount(merged, normalizePlayerCount(merged.playerCount));
    return {
      ...normalized,
      steps: reconcileMovementAnnotations(
        ensureAnnotationsForMovement(normalized.steps, normalizePlayerCount(normalized.playerCount))
      ),
    };
  } catch {
    return null;
  }
}

const HISTORY_LIMIT = 50;

// ============================================================
// Helpers scénario scripté
// ============================================================

/** Marque un step comme édité manuellement (préservé à la prochaine recompile
 *  scénario). N'est utile que pour les steps issus du scénario (generatedBy
 *  défini). Le step 0 (départ) et les steps purement manuels n'ont pas besoin
 *  du flag. */
function markStepAsManual(state: AppState, stepIdx: number): AppState {
  if (stepIdx <= 0) return state; // step 0 = position de départ, jamais marqué
  const cur = state.steps[stepIdx];
  if (!cur || !cur.generatedBy || cur.manualOverride) return state;
  const steps = [...state.steps];
  steps[stepIdx] = { ...cur, manualOverride: true };
  return { ...state, steps };
}

/** Recompile les steps depuis le scénario (si non vide). Conserve le step 0
 *  comme position de départ et préserve les manualOverride. */
function recompileScenarioSteps(state: AppState): AppState {
  const actions = state.scriptedActions;
  if (!actions || actions.length === 0) return state;
  const initial = state.steps[0];
  if (!initial) return state;
  const activeBranch = state.activeBranchId
    ? state.scenarioBranches?.find((b) => b.id === state.activeBranchId) ?? null
    : null;
  const newSteps = compileScenario({
    initialOff: initial.off,
    initialBallCarrier: initial.ballCarrier,
    actions,
    existingSteps: state.steps,
    playerCount: state.playerCount,
    activeBranch,
  });
  // Conserve activeStep dans les bornes du nouveau tableau.
  const activeStep = Math.min(state.activeStep, newSteps.length - 1);
  return { ...state, steps: newSteps, activeStep };
}

export function useAppState() {
  // Premier render identique côté SSR et client : on part toujours de l'état
  // par défaut. localStorage est lu dans un effect post-montage uniquement
  // (sinon hydration mismatch).
  const [state, setState] = useState<AppState>(() => makeInitialState());
  const [hydrated, setHydrated] = useState(false);

  // Pile undo/redo. Pas dans le state principal pour ne pas re-rendre à chaque
  // push. setStateWithHistory pousse l'état précédent dans `past` et vide
  // `future`. undo/redo utilisent setState brut pour ne pas se ré-historiser.
  const historyRef = useRef<{ past: AppState[]; future: AppState[] }>({ past: [], future: [] });

  const setStateWithHistory: typeof setState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (s: AppState) => AppState)(prev)
        : updater;
      if (next === prev) return prev;
      historyRef.current.past.push(prev);
      if (historyRef.current.past.length > HISTORY_LIMIT) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = [];
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setState((cur) => {
      const past = historyRef.current.past;
      if (past.length === 0) return cur;
      const prev = past.pop()!;
      historyRef.current.future.push(cur);
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setState((cur) => {
      const future = historyRef.current.future;
      if (future.length === 0) return cur;
      const next = future.pop()!;
      historyRef.current.past.push(cur);
      return next;
    });
  }, []);

  useEffect(() => {
    const persisted = loadFromStorage();
    if (persisted) setState(persisted);
    setHydrated(true);
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydrated) return; // skip avant hydration : éviterait d'écraser le persisté
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* quota exceeded ou navigation privée — ignore */
      }
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const setActiveStep = useCallback((idx: number) => {
    setStateWithHistory((s) => ({ ...s, activeStep: Math.max(0, Math.min(s.steps.length - 1, idx)) }));
  }, []);

  const addStep = useCallback(() => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      // Applique les destinations des annotations de mouvement (cut, screen,
      // dribble) de l'étape courante aux positions de la nouvelle étape.
      // Sinon un utilisateur qui trace un écran ou un cut puis clique
      // "+ étape" verrait l'attaquant rester à sa position d'origine au lieu
      // d'avoir bougé selon son intention.
      const newOff = { ...cur.off };
      cur.annotations.forEach((anno) => {
        if (anno.type === 'cut' || anno.type === 'screen' || anno.type === 'dribble') {
          const id = anno.fromId as AttackerId;
          if (id in newOff && anno.to) {
            newOff[id] = { x: anno.to.x, y: anno.to.y };
          }
        }
      });
      // Si une annotation de passe change le porteur, on propage aussi.
      const passAnno = cur.annotations.find((a) => a.type === 'pass' && a.toId);
      const newCarrier = passAnno?.toId ?? cur.ballCarrier;
      const newStep = makeStep(newOff, newCarrier, []);
      const steps = [...s.steps];
      steps.splice(s.activeStep + 1, 0, newStep);
      return { ...s, steps, activeStep: s.activeStep + 1 };
    });
  }, []);

  const duplicateStep = useCallback(() => {
    setStateWithHistory((s) => {
      const copy: Step = structuredClone(s.steps[s.activeStep]);
      delete copy.switches;
      const steps = [...s.steps];
      steps.splice(s.activeStep + 1, 0, copy);
      return { ...s, steps, activeStep: s.activeStep + 1 };
    });
  }, []);

  const deleteStep = useCallback(() => {
    setStateWithHistory((s) => {
      if (s.steps.length <= 1) return s;
      const steps = s.steps.filter((_, i) => i !== s.activeStep);
      return { ...s, steps, activeStep: Math.max(0, s.activeStep - 1) };
    });
  }, []);

  const moveAttacker = useCallback((id: AttackerId, x: number, y: number) => {
    setStateWithHistory((s) => {
      const steps = setPlayerPositionAt(s.steps, s.activeStep, id, { x, y });
      // Préserver la sémantique manualOverride si le step venait du scénario.
      if (s.activeStep > 0 && steps[s.activeStep].generatedBy) {
        const next = [...steps];
        next[s.activeStep] = { ...next[s.activeStep], manualOverride: true };
        return { ...s, steps: next };
      }
      return { ...s, steps };
    });
  }, []);

  const moveDefender = useCallback((id: DefenderId, x: number, y: number) => {
    setStateWithHistory((s) => {
      // En mode édition zones : drag d'un défenseur = drag de son homePos.
      // Plus intuitif que de créer un override manuel — le défenseur reste
      // un défenseur de zone, son ancrage suit le drag, et l'engine continue
      // à le faire suivre les attaquants dans son rayon de responsabilité.
      if (s.defenseSystem === 'zone' && s.zoneEditMode) {
        const baseLayout = getZoneLayout(s.zoneConfig.type, s.zoneConfig.verticalOffset ?? 0);
        const oriented = s.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout;
        const region = oriented.find((r) => r.assignedTo === id);
        if (region) {
          const cur = s.zoneOverrides?.[region.id] ?? {};
          return {
            ...s,
            zoneOverrides: {
              ...(s.zoneOverrides ?? {}),
              [region.id]: { ...cur, homePos: { x: Math.round(x), y: Math.round(y) } },
            },
          };
        }
      }
      // Sinon (man defense, ou zone hors édition) : override manuel pour
      // l'étape active. Le moteur respectera cette position.
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.defenseOverrides = { ...cur.defenseOverrides, [id]: { x, y } };
      steps[s.activeStep] = cur;
      const defenseInitial =
        s.activeStep === 0 ? { ...s.defenseInitial, [id]: { x, y } } : s.defenseInitial;
      return { ...s, steps, defenseInitial };
    });
  }, []);

  const clearDefenseOverride = useCallback((id: DefenderId) => {
    setStateWithHistory((s) => {
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      if (cur.defenseOverrides) {
        const { [id]: _, ...rest } = cur.defenseOverrides;
        cur.defenseOverrides = Object.keys(rest).length > 0 ? rest : undefined;
      }
      steps[s.activeStep] = cur;
      return { ...s, steps };
    });
  }, []);

  const addAnnotation = useCallback((annotation: Annotation) => {
    setStateWithHistory((s) => {
      let steps: Step[];
      if (annotation.type === 'pass') {
        steps = upsertPassAnnotation(s.steps, s.activeStep, annotation);
        // Conserver l'effet de bord existant : passe → ballCarrier change
        if (annotation.toId) {
          steps = steps.map((st, i) =>
            i === s.activeStep ? { ...st, ballCarrier: annotation.toId! } : st,
          );
        }
      } else {
        steps = upsertMovementAnnotation(s.steps, s.activeStep, annotation);
      }
      if (s.activeStep > 0 && steps[s.activeStep].generatedBy) {
        const next = [...steps];
        next[s.activeStep] = { ...next[s.activeStep], manualOverride: true };
        return { ...s, steps: next };
      }
      return { ...s, steps };
    });
  }, []);

  const setForcedScreener = useCallback((oId: AttackerId | null) => {
    setStateWithHistory((s) => {
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      if (oId == null) delete cur.forcedScreener;
      else cur.forcedScreener = oId;
      steps[s.activeStep] = cur;
      return { ...s, steps };
    });
  }, []);

  const clearAnnotationsFor = useCallback((oId: AttackerId) => {
    setStateWithHistory((s) => {
      let steps = s.steps;
      const cur = steps[s.activeStep];
      if (!cur) return s;
      // Supprimer en partant de la fin pour préserver les indices
      const indices = cur.annotations
        .map((a, i) => (a.fromId === oId ? i : -1))
        .filter((i) => i >= 0)
        .reverse();
      for (const idx of indices) {
        steps = removeAnnotationFromSteps(steps, s.activeStep, idx);
      }
      return { ...s, steps };
    });
  }, []);

  const deleteLastAnnotation = useCallback(() => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      if (!cur || cur.annotations.length === 0) return s;
      const steps = removeAnnotationFromSteps(s.steps, s.activeStep, cur.annotations.length - 1);
      return { ...s, steps };
    });
  }, []);

  const deleteAnnotation = useCallback((idx: number) => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      if (!cur || idx < 0 || idx >= cur.annotations.length) return s;
      const steps = removeAnnotationFromSteps(s.steps, s.activeStep, idx);
      return { ...s, steps };
    });
  }, []);

  /**
   * Édite les bornes temporelles tStart/tEnd d'une annotation de mouvement.
   * Permet l'édition continue façon vidéo : actions de durées différentes
   * dans le même segment de transition.
   */
  const setAnnotationTiming = useCallback(
    (stepIdx: number, annoIdx: number, tStart: number, tEnd: number) => {
      setStateWithHistory((s) => {
        const step = s.steps[stepIdx];
        if (!step) return s;
        const anno = step.annotations[annoIdx];
        if (!anno) return s;
        const movementTypes: AnnotationType[] = ['cut', 'dribble', 'screen'];
        if (!movementTypes.includes(anno.type)) return s;

        // Clamp 0..1 et minimum de durée pour éviter zéro (instabilité visuelle).
        const minDur = 0.05;
        let nextStart = Math.max(0, Math.min(1 - minDur, tStart));
        let nextEnd = Math.max(nextStart + minDur, Math.min(1, tEnd));

        const steps = s.steps.map((st, i) =>
          i === stepIdx
            ? {
                ...st,
                annotations: st.annotations.map((a, j) =>
                  j === annoIdx ? { ...a, tStart: nextStart, tEnd: nextEnd } : a
                ),
              }
            : st
        );
        return { ...s, steps };
      });
    },
    []
  );

  /**
   * Bascule la phase d'une annotation de mouvement entre 'end' (le joueur
   * se déplace pendant cette étape, arrive à destination à la fin) et
   * 'start' (le joueur est déjà à destination dès le début de l'étape, le
   * mouvement a eu lieu dans la transition précédente). Resynchronise les
   * positions des étapes concernées en conséquence.
   */
  const setAnnotationPhase = useCallback(
    (stepIdx: number, annoIdx: number, phase: 'start' | 'end') => {
      setStateWithHistory((s) => {
        const step = s.steps[stepIdx];
        if (!step) return s;
        const anno = step.annotations[annoIdx];
        if (!anno) return s;
        const movementTypes: AnnotationType[] = ['cut', 'dribble', 'screen'];
        if (!movementTypes.includes(anno.type)) return s;
        const currentPhase = anno.phase ?? 'end';
        if (currentPhase === phase) return s;

        const steps = s.steps.map((st) => ({
          ...st,
          off: { ...st.off },
          annotations: [...st.annotations],
        }));

        if (currentPhase === 'end' && phase === 'start') {
          // L'action devient active DÈS le début de cette étape.
          // cur.off[X] = destination (à la place de l'origine)
          // step N+1.off[X] reste à destination (déjà le cas)
          // step N-1.off[X] reste à l'origine (déjà le cas)
          if (stepIdx === 0) return s; // pas de step précédent pour phase='start'
          steps[stepIdx].off[anno.fromId] = { ...anno.to };
          if (stepIdx + 1 < steps.length) {
            steps[stepIdx + 1].off[anno.fromId] = { ...anno.to };
          }
          steps[stepIdx].annotations[annoIdx] = { ...anno, phase: 'start' };
        } else if (currentPhase === 'start' && phase === 'end') {
          // L'action devient active à la FIN de cette étape.
          // cur.off[X] revient à l'origine
          // step N+1.off[X] = destination
          steps[stepIdx].off[anno.fromId] = { ...anno.from };
          if (stepIdx + 1 < steps.length) {
            steps[stepIdx + 1].off[anno.fromId] = { ...anno.to };
          }
          steps[stepIdx].annotations[annoIdx] = { ...anno, phase: 'end' };
        }

        return { ...s, steps };
      });
    },
    []
  );

  const setTool = useCallback((tool: Tool) => {
    setStateWithHistory((s) => ({ ...s, tool }));
  }, []);

  const updateRule = useCallback((dId: DefenderId, patch: Partial<DefenderRule>) => {
    setStateWithHistory((s) => ({
      ...s,
      rules: { ...s.rules, [dId]: { ...s.rules[dId], ...patch } },
    }));
  }, []);

  /** Applique un patch à TOUS les défenseurs en une seule entrée d'historique.
   *  Utile pour le pilotage en masse depuis le DefensePanel : changer une
   *  consigne (offBallStance, gazeLock, helpMode, etc.) pour tout le monde. */
  const updateAllRules = useCallback((patch: Partial<DefenderRule>) => {
    setStateWithHistory((s) => {
      const rules = { ...s.rules };
      (Object.keys(rules) as DefenderId[]).forEach((id) => {
        rules[id] = { ...rules[id], ...patch };
      });
      return { ...s, rules };
    });
  }, []);

  /** Efface tous les overrides numériques individuels (distance, maxSpeed,
   *  closeoutBoost, denyAggressiveness, screenNav). Tous les défenseurs
   *  retombent sur les valeurs globales (`state.defenseDistance`, etc.). */
  const resetIndividualOverrides = useCallback(() => {
    setStateWithHistory((s) => {
      const rules = { ...s.rules };
      (Object.keys(rules) as DefenderId[]).forEach((id) => {
        const r = { ...rules[id] };
        delete r.distance;
        delete r.maxSpeed;
        delete r.closeoutBoost;
        delete r.denyAggressiveness;
        delete r.screenNav;
        rules[id] = r;
      });
      return { ...s, rules };
    });
  }, []);

  const applyDefenderProfile = useCallback(
    (dId: DefenderId, profile: DefenderProfile) => {
      setStateWithHistory((s) => ({
        ...s,
        rules: { ...s.rules, [dId]: { ...s.rules[dId], ...profile.rule } },
      }));
    },
    []
  );

  const setAttackerHand = useCallback((oId: AttackerId, hand: 'right' | 'left') => {
    setStateWithHistory((s) => ({
      ...s,
      attackerHands: { ...(s.attackerHands ?? { O1: 'right', O2: 'right', O3: 'right', O4: 'right', O5: 'right' }), [oId]: hand },
    }));
  }, []);

  const setAttackerOrientation = useCallback(
    (oId: AttackerId, patch: { body?: number | undefined; gaze?: number | undefined }) => {
      setStateWithHistory((s) => {
        const cur = s.attackerOrientations?.[oId] ?? {};
        const next = { ...cur, ...patch };
        // Nettoie les clés undefined pour pas garder des champs morts.
        const cleaned: { body?: number; gaze?: number } = {};
        if (typeof next.body === 'number') cleaned.body = next.body;
        if (typeof next.gaze === 'number') cleaned.gaze = next.gaze;
        const allOrientations = { ...(s.attackerOrientations ?? {}) };
        if (Object.keys(cleaned).length === 0) {
          delete allOrientations[oId];
        } else {
          allOrientations[oId] = cleaned;
        }
        return { ...s, attackerOrientations: allOrientations };
      });
    },
    []
  );

  const setAttackerProfile = useCallback(
    (oId: AttackerId, profile: import('@/lib/types').OffensiveProfile) => {
      setStateWithHistory((s) => {
        const defaults: import('@/lib/types').AttackerProfiles = {
          O1: 'creator', O2: 'shooter', O3: 'shooter', O4: 'rim-roller', O5: 'stretch-big',
        };
        return {
          ...s,
          attackerProfiles: { ...(s.attackerProfiles ?? defaults), [oId]: profile },
        };
      });
    },
    []
  );

  const setScreenRule = useCallback((rule: ScreenRule) => {
    setStateWithHistory((s) => {
      const steps = s.steps.map((st) => {
        const copy = { ...st };
        delete copy.switches;
        return copy;
      });
      return { ...s, steps, screenRule: rule };
    });
  }, []);

  const resetSwitches = useCallback(() => {
    setStateWithHistory((s) => ({
      ...s,
      steps: s.steps.map((st) => {
        const copy = { ...st };
        delete copy.switches;
        return copy;
      }),
    }));
  }, []);

  const resetAll = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    setStateWithHistory(makeInitialState());
  }, []);

  const setStepLabel = useCallback((idx: number, label: string) => {
    setStateWithHistory((s) => {
      const steps = [...s.steps];
      steps[idx] = { ...steps[idx], label: label || undefined };
      return { ...s, steps };
    });
  }, []);

  const setBallCarrier = useCallback((carrier: AttackerId) => {
    setStateWithHistory((s) => {
      const steps = [...s.steps];
      steps[s.activeStep] = { ...steps[s.activeStep], ballCarrier: carrier };
      return { ...s, steps };
    });
  }, []);

  const loadTemplate = useCallback((template: Template) => {
    setStateWithHistory((s) => ({
      ...s,
      steps: reconcileMovementAnnotations(
        ensureAnnotationsForMovement(structuredClone(template.steps), s.playerCount)
      ),
      activeStep: 0,
      defenseInitial: structuredClone(template.defenseInitial),
    }));
  }, []);

  const applyDefensePreset = useCallback((preset: DefensePreset) => {
    setStateWithHistory((s) => {
      const { rules: ruleOverrides, ...rest } = preset.patch;
      const mergedRules = ruleOverrides
        ? (Object.keys(s.rules) as DefenderId[]).reduce(
            (acc, dId) => ({
              ...acc,
              [dId]: { ...s.rules[dId], ...(ruleOverrides[dId] ?? {}) },
            }),
            {} as typeof s.rules
          )
        : s.rules;
      return {
        ...s,
        ...rest,
        rules: mergedRules,
      };
    });
  }, []);

  const setDefenseSystem = useCallback((system: DefenseSystem) => {
    setStateWithHistory((s) => {
      // Au changement de système : on efface tous les overrides et on snap
      // defenseInitial à des positions cohérentes avec le nouveau système.
      const cleanedSteps = s.steps.map((st) => {
        const c = { ...st };
        delete c.defenseOverrides;
        return c;
      });
      let defenseInitial = s.defenseInitial;
      if (system === 'zone') {
        const layout = getZoneLayout(s.zoneConfig.type, s.zoneConfig.verticalOffset ?? 0);
        defenseInitial = {} as DefenderPositions;
        layout.forEach((z) => {
          defenseInitial![z.assignedTo] = { ...z.homePos };
        });
      }
      return { ...s, defenseSystem: system, steps: cleanedSteps, defenseInitial };
    });
  }, []);

  const setZoneOverride = useCallback(
    (regionId: string, override: Partial<import('@/lib/types').ZoneRegionOverride>) => {
      setStateWithHistory((s) => {
        const cur = s.zoneOverrides?.[regionId] ?? {};
        const merged = { ...cur, ...override };
        // Si tous les champs sont undefined, on retire l'entrée pour rester propre.
        const hasValue =
          merged.homePos !== undefined || merged.radius !== undefined || merged.mode !== undefined;
        const next = { ...(s.zoneOverrides ?? {}) };
        if (hasValue) next[regionId] = merged;
        else delete next[regionId];
        return { ...s, zoneOverrides: Object.keys(next).length ? next : undefined };
      });
    },
    []
  );

  const clearZoneOverride = useCallback((regionId: string) => {
    setStateWithHistory((s) => {
      if (!s.zoneOverrides?.[regionId]) return s;
      const next = { ...s.zoneOverrides };
      delete next[regionId];
      return { ...s, zoneOverrides: Object.keys(next).length ? next : undefined };
    });
  }, []);

  const setZoneEditMode = useCallback((on: boolean) => {
    setStateWithHistory((s) => ({ ...s, zoneEditMode: on }));
  }, []);

  const clearAllDefenseOverridesActiveStep = useCallback(() => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      if (!cur?.defenseOverrides || Object.keys(cur.defenseOverrides).length === 0) return s;
      const steps = [...s.steps];
      const next = { ...cur };
      delete next.defenseOverrides;
      steps[s.activeStep] = next;
      return { ...s, steps };
    });
  }, []);

  const updateZoneConfig = useCallback((zPatch: Partial<ZoneConfig>) => {
    setStateWithHistory((s) => {
      const newConfig = { ...s.zoneConfig, ...zPatch };
      let next: AppState = { ...s, zoneConfig: newConfig };
      // Si on change le TYPE de zone, on resnap defenseInitial aux nouveaux
      // homePos et on efface tous les overrides : on laisse le moteur de
      // zone (computeZoneTargets) calculer dynamiquement les positions.
      // Forcer des overrides au homePos figerait les défenseurs et
      // désactiverait le tracking — exactement l'inverse de ce qu'on veut.
      if (zPatch.type && zPatch.type !== s.zoneConfig.type) {
        const layout = getZoneLayout(newConfig.type, newConfig.verticalOffset ?? 0);
        const newDefenseInitial = {} as DefenderPositions;
        layout.forEach((z) => {
          newDefenseInitial[z.assignedTo] = { ...z.homePos };
        });
        const cleanedSteps = s.steps.map((st) => {
          const c = { ...st };
          delete c.defenseOverrides;
          return c;
        });
        next = {
          ...next,
          defenseInitial: newDefenseInitial,
          steps: cleanedSteps,
          // Reset des overrides de région — les ids de région diffèrent entre
          // formations, ils n'ont aucun sens après changement de type.
          zoneOverrides: undefined,
        };
      }
      return next;
    });
  }, []);

  const importState = useCallback((next: AppState) => {
    const defaults = makeInitialState();
    const merged: AppState = {
      ...defaults,
      ...next,
      zoneConfig: { ...defaults.zoneConfig, ...(next.zoneConfig || {}) },
    };
    const normalized = normalizeStateForPlayerCount(merged, normalizePlayerCount(merged.playerCount));
    setStateWithHistory({
      ...normalized,
      steps: reconcileMovementAnnotations(
        ensureAnnotationsForMovement(normalized.steps, normalizePlayerCount(normalized.playerCount))
      ),
    });
  }, []);

  const patch = useCallback((p: Partial<AppState>) => {
    setStateWithHistory((s) => ({ ...s, ...p }));
  }, []);

  const setPlayerCount = useCallback((count: PlayerCount) => {
    setStateWithHistory((s) => normalizeStateForPlayerCount(s, count));
  }, []);

  // ============================================================
  // Scénario scripté
  // ============================================================

  // Helpers branch-aware : si une branche est active, les opérations sur les
  // actions ciblent `branch.actions` au lieu de `mainActions`. Sinon comportement
  // d'avant Étape 7. Évite de dupliquer toute la logique de l'UI.
  const mutateActionsScope = (
    s: AppState,
    mutate: (list: ScriptedAction[]) => ScriptedAction[]
  ): AppState => {
    if (s.activeBranchId) {
      const branches = (s.scenarioBranches ?? []).map((b) =>
        b.id === s.activeBranchId ? { ...b, actions: mutate(b.actions) } : b
      );
      return { ...s, scenarioBranches: branches };
    }
    return { ...s, scriptedActions: mutate(s.scriptedActions ?? []) };
  };

  const addScriptedAction = useCallback((action: ScriptedAction) => {
    setStateWithHistory((s) => {
      const next = mutateActionsScope(s, (list) => [...list, action]);
      return recompileScenarioSteps(next);
    });
  }, []);

  const updateScriptedAction = useCallback((id: string, action: ScriptedAction) => {
    setStateWithHistory((s) => {
      const next = mutateActionsScope(s, (list) => list.map((a) => (a.id === id ? action : a)));
      return recompileScenarioSteps(next);
    });
  }, []);

  const deleteScriptedAction = useCallback((id: string) => {
    setStateWithHistory((s) => {
      const next = mutateActionsScope(s, (list) => list.filter((a) => a.id !== id));
      const cleanSteps = next.steps.map((st) =>
        st.generatedBy === id ? { ...st, manualOverride: false } : st
      );
      return recompileScenarioSteps({ ...next, steps: cleanSteps });
    });
  }, []);

  const moveScriptedAction = useCallback((id: string, dir: 'up' | 'down') => {
    setStateWithHistory((s) => {
      const next = mutateActionsScope(s, (list) => {
        const arr = [...list];
        const idx = arr.findIndex((a) => a.id === id);
        if (idx < 0) return arr;
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= arr.length) return arr;
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        return arr;
      });
      return recompileScenarioSteps(next);
    });
  }, []);

  const clearScriptedActions = useCallback(() => {
    setStateWithHistory((s) => ({ ...s, scriptedActions: [] }));
    // On ne recompile pas : le user passe en mode 100% manuel, ses steps
    // existants restent intacts.
  }, []);

  // ============================================================
  // Branches scénario (Étape 7)
  // ============================================================

  const addScenarioBranch = useCallback((branch: ScenarioBranch) => {
    setStateWithHistory((s) => ({
      ...s,
      scenarioBranches: [...(s.scenarioBranches ?? []), branch],
    }));
  }, []);

  const updateScenarioBranch = useCallback((id: string, branch: ScenarioBranch) => {
    setStateWithHistory((s) => {
      const list = (s.scenarioBranches ?? []).map((b) => (b.id === id ? branch : b));
      const next = { ...s, scenarioBranches: list };
      return s.activeBranchId === id ? recompileScenarioSteps(next) : next;
    });
  }, []);

  const deleteScenarioBranch = useCallback((id: string) => {
    setStateWithHistory((s) => {
      const list = (s.scenarioBranches ?? []).filter((b) => b.id !== id);
      const activeBranchId = s.activeBranchId === id ? null : s.activeBranchId;
      return recompileScenarioSteps({ ...s, scenarioBranches: list, activeBranchId });
    });
  }, []);

  const setActiveBranch = useCallback((id: string | null) => {
    setStateWithHistory((s) => recompileScenarioSteps({ ...s, activeBranchId: id }));
  }, []);

  // ============================================================
  // Actions défensives scriptées (Phase 3 — Task 6)
  // ============================================================

  const addDefensiveAction = useCallback((
    type: DefensiveActionType,
    params: DefensiveActionParams,
    parentActionId?: string,
    affectedSteps?: number[],
  ) => {
    const newAction: DefensiveScriptedAction = {
      kind: 'defensive',
      id: newScriptedActionId(),
      type,
      parentActionId,
      affectedSteps,
      params,
    };
    setStateWithHistory((s) => {
      const next: AppState = {
        ...s,
        scriptedActions: [...(s.scriptedActions ?? []), newAction],
      };
      return recompileScenarioSteps(next);
    });
  }, []);

  const updateDefensiveAction = useCallback((id: string, updated: DefensiveScriptedAction) => {
    setStateWithHistory((s) => {
      const list = (s.scriptedActions ?? []).map((a) => (a.id === id ? updated : a));
      return recompileScenarioSteps({ ...s, scriptedActions: list });
    });
  }, []);

  const deleteDefensiveAction = useCallback((id: string) => {
    setStateWithHistory((s) => {
      const list = (s.scriptedActions ?? []).filter((a) => a.id !== id);
      return recompileScenarioSteps({ ...s, scriptedActions: list });
    });
  }, []);

  const toggleScriptedDefense = useCallback(() => {
    setStateWithHistory((s) => ({
      ...s,
      defenseScriptedDirectivesEnabled:
        s.defenseScriptedDirectivesEnabled === false ? true : false,
    }));
  }, []);

  return {
    state,
    undo,
    redo,
    setActiveStep,
    addStep,
    duplicateStep,
    deleteStep,
    moveAttacker,
    moveDefender,
    addAnnotation,
    deleteLastAnnotation,
    deleteAnnotation,
    setAnnotationPhase,
    setAnnotationTiming,
    setForcedScreener,
    clearAnnotationsFor,
    setTool,
    updateRule,
    updateAllRules,
    resetIndividualOverrides,
    applyDefenderProfile,
    setAttackerHand,
    setAttackerOrientation,
    setAttackerProfile,
    setScreenRule,
    resetSwitches,
    resetAll,
    importState,
    patch,
    setPlayerCount,
    setDefenseSystem,
    updateZoneConfig,
    setZoneOverride,
    clearZoneOverride,
    setZoneEditMode,
    clearAllDefenseOverridesActiveStep,
    setStepLabel,
    setBallCarrier,
    loadTemplate,
    clearDefenseOverride,
    applyDefensePreset,
    addScriptedAction,
    updateScriptedAction,
    deleteScriptedAction,
    addScenarioBranch,
    updateScenarioBranch,
    deleteScenarioBranch,
    setActiveBranch,
    moveScriptedAction,
    clearScriptedActions,
    addDefensiveAction,
    updateDefensiveAction,
    deleteDefensiveAction,
    toggleScriptedDefense,
  };
}
