// Hook unique d'état de l'app. Joue 3 rôles :
//
//  1. Persistance localStorage (load + debounced save) + hydration SSR-safe
//  2. Pile undo/redo + coalescing pendant les drags (1 snapshot par drag)
//  3. Câblage : chaque callback wrappe une transform pure de
//     `src/lib/state/transforms/`. La logique métier vit dans ces transforms,
//     pas ici — voir `transforms/index.ts` pour la table des domaines.
//
// API publique inchangée par rapport à l'historique : les callers (page.tsx,
// CourtView, ContextMenu, …) consomment les mêmes noms de méthodes.

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppState,
  Annotation,
  AttackerId,
  DefenderId,
  DefenderRule,
  DefenseSystem,
  DefensiveActionParams,
  DefensiveActionType,
  DefensiveScriptedAction,
  OffensiveProfile,
  PlayerCount,
  Point,
  ScenarioBranch,
  ScreenRule,
  ScriptedAction,
  Tool,
  ZoneConfig,
  ZoneRegionOverride,
} from '@/lib/types';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { makeInitialState } from '@/lib/data/initial';
import type { Template } from '@/lib/data/templates';
import type { DefensePreset } from '@/lib/data/defensePresets';
import type { DefenderProfile } from '@/lib/data/defenderProfiles';
import {
  commitCoalescedHistory,
  pushHistorySnapshot,
  redoFromHistory,
  undoFromHistory,
  type AppStateHistory,
} from '@/lib/logic/appStateHistory';
import { persistDetectedSwitchesThroughStep } from '@/lib/logic/engine';
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';
import { normalizePlayerCount, normalizeStateForPlayerCount } from '@/lib/logic/players';
import {
  ensureAnnotationsForMovement,
  reconcileMovementAnnotations,
} from '@/lib/logic/migrateAnnotations';
import { moveAttackerInState, moveDefenderInState } from '@/lib/logic/playerMove';
import { computeOffBallPositions } from '@/lib/logic/autoOffense';
import { HOOP, HOOP_OPPOSITE } from '@/lib/data/court';
import {
  stepTx,
  annotationTx,
  defenseTx,
  attackerTx,
  zoneTx,
  scenarioTx,
  defensiveTx,
  coreTx,
} from '@/lib/state/transforms';

const STORAGE_KEY = 'basket-tactics-state-v1';

/** État transitoire (= NON persisté, hors AppState) qui pilote l'animation
 *  "Tout en auto réel" : on capture les positions manuelles courantes au
 *  moment du clic puis on lerp depuis ces positions vers les positions auto
 *  recomputées par l'engine pendant `durationMs`. Pendant la transition, le
 *  rendu (useCourtFrame) blend les positions au lieu de téléporter.
 *
 *  Le champ vit dans useAppState (transient state) plutôt que dans AppState
 *  pour ne PAS être persisté/undoable : c'est une animation UI éphémère, pas
 *  un fait métier du scénario. */
export interface DefenseReleaseTransition {
  fromPositions: Partial<Record<DefenderId, Point>>;
  startedAtMs: number;
  durationMs: number;
}

const DEFENSE_RELEASE_DURATION_MS = 700;

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

export function useAppState() {
  // Premier render identique côté SSR et client : on part toujours de l'état
  // par défaut. localStorage est lu dans un effect post-montage uniquement
  // (sinon hydration mismatch).
  const [state, setState] = useState<AppState>(() => makeInitialState());
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pile undo/redo. Hors state principal pour ne pas re-rendre à chaque push.
  // setStateWithHistory pousse l'état précédent dans `past` et vide `future`.
  // undo/redo utilisent setState brut pour ne pas se ré-historiser.
  const historyRef = useRef<AppStateHistory>({ past: [], future: [] });
  const dragHistoryAnchorRef = useRef<AppState | null>(null);

  // Animation transitoire "Tout en auto réel" : positions de départ capturées
  // au clic + timestamp. Non persistée. Cf. clearAllDefenseOverridesActiveStepAnimated.
  const [defenseReleaseTransition, setDefenseReleaseTransition] =
    useState<DefenseReleaseTransition | null>(null);
  // Auto-cleanup : on nullifie le transition quand sa durée est écoulée.
  useEffect(() => {
    if (!defenseReleaseTransition) return;
    const elapsed = performance.now() - defenseReleaseTransition.startedAtMs;
    const remaining = Math.max(0, defenseReleaseTransition.durationMs - elapsed);
    const timer = setTimeout(() => {
      setDefenseReleaseTransition((cur) => (cur === defenseReleaseTransition ? null : cur));
    }, remaining + 50);
    return () => clearTimeout(timer);
  }, [defenseReleaseTransition]);

  const setStateWithHistory: typeof setState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (s: AppState) => AppState)(prev)
        : updater;
      if (next === prev) return prev;
      pushHistorySnapshot(historyRef.current, prev);
      return next;
    });
  }, []);

  const beginPlayerDrag = useCallback(() => {
    if (!dragHistoryAnchorRef.current) {
      dragHistoryAnchorRef.current = stateRef.current;
    }
  }, []);

  const commitPlayerDrag = useCallback(() => {
    const anchor = dragHistoryAnchorRef.current;
    dragHistoryAnchorRef.current = null;
    if (!anchor) return;
    setState((cur) => {
      commitCoalescedHistory(historyRef.current, anchor, cur);
      return cur;
    });
  }, []);

  const undo = useCallback(() => {
    setState((cur) => undoFromHistory(historyRef.current, cur));
  }, []);

  const redo = useCallback(() => {
    setState((cur) => redoFromHistory(historyRef.current, cur));
  }, []);

  // Hydration : lit le localStorage post-montage.
  useEffect(() => {
    const persisted = loadFromStorage();
    if (persisted) setState(persisted);
    setHydrated(true);
  }, []);

  // Détection de switches après chaque changement d'état.
  useEffect(() => {
    if (!hydrated) return;
    setState((cur) => persistDetectedSwitchesThroughStep(cur));
  }, [hydrated, state]);

  // Save debounced (400ms) — skip avant hydration pour ne pas écraser le persisté.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydrated) return;
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

  // ============================================================
  // Câblage des transforms → callbacks publics
  // ============================================================

  // -- Steps --
  const setActiveStep = useCallback((idx: number) => {
    setStateWithHistory((s) => stepTx.setActiveStep(s, idx));
  }, [setStateWithHistory]);

  const addStep = useCallback(() => {
    setStateWithHistory(stepTx.addStep);
  }, [setStateWithHistory]);

  const duplicateStep = useCallback(() => {
    setStateWithHistory(stepTx.duplicateStep);
  }, [setStateWithHistory]);

  const deleteStep = useCallback(() => {
    setStateWithHistory(stepTx.deleteStep);
  }, [setStateWithHistory]);

  const setStepLabel = useCallback((idx: number, label: string) => {
    setStateWithHistory((s) => stepTx.setStepLabel(s, idx, label));
  }, [setStateWithHistory]);

  const setBallCarrier = useCallback((carrier: AttackerId) => {
    setStateWithHistory((s) => stepTx.setBallCarrier(s, carrier));
  }, [setStateWithHistory]);

  const convertStepToFreeThrow = useCallback(() => {
    setStateWithHistory(stepTx.convertStepToFreeThrow);
  }, [setStateWithHistory]);

  const convertStepToInbound = useCallback(
    (side: import('@/lib/types').InboundSide) => {
      setStateWithHistory((s) => stepTx.convertStepToInbound(s, side));
    },
    [setStateWithHistory]
  );

  const setInboundDefenseMode = useCallback(
    (mode: import('@/lib/types').InboundDefenseMode) => {
      setStateWithHistory((s) => stepTx.setInboundDefenseMode(s, mode));
    },
    [setStateWithHistory]
  );

  // -- Joueurs (positions) --
  // Note : moves utilisent `playerMove` directement (déjà extrait), pas un
  // transform dédié, pour éviter une double indirection sur le chemin chaud.
  const moveAttacker = useCallback((id: AttackerId, x: number, y: number) => {
    setStateWithHistory((s) => moveAttackerInState(s, id, { x, y }));
  }, [setStateWithHistory]);

  const moveDefender = useCallback((id: DefenderId, x: number, y: number) => {
    setStateWithHistory((s) => moveDefenderInState(s, id, { x, y }));
  }, [setStateWithHistory]);

  const moveAttackerDuringDrag = useCallback((id: AttackerId, x: number, y: number) => {
    setState((s) => moveAttackerInState(s, id, { x, y }));
  }, []);

  const moveDefenderDuringDrag = useCallback((id: DefenderId, x: number, y: number) => {
    setState((s) => moveDefenderInState(s, id, { x, y }));
  }, []);

  const clearDefenseOverride = useCallback((id: DefenderId) => {
    setStateWithHistory((s) => defenseTx.clearDefenseOverride(s, id));
  }, [setStateWithHistory]);

  /** Repositionne les 4 attaquants hors-porteur en maximisant le total
   *  spacing (graphe complet) avec pénalité de couloir EJO. Passe obligée
   *  par `moveAttackerInState` pour le push-out anti-overlap (Règle 1). */
  const autoPositionOffBall = useCallback(() => {
    setStateWithHistory((s) => {
      const step = s.steps[s.activeStep];
      if (!step) return s;
      const hoop = s.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
      const targets = computeOffBallPositions(
        step.off,
        step.ballCarrier,
        hoop,
        s.attackerProfiles,
      );
      let next = s;
      for (const t of targets) {
        next = moveAttackerInState(next, t.id, t.pos);
      }
      return next;
    });
  }, [setStateWithHistory]);

  // -- Annotations --
  const addAnnotation = useCallback((annotation: Annotation) => {
    setStateWithHistory((s) => annotationTx.addAnnotation(s, annotation));
  }, [setStateWithHistory]);

  const setForcedScreener = useCallback((oId: AttackerId | null) => {
    setStateWithHistory((s) => annotationTx.setForcedScreener(s, oId));
  }, [setStateWithHistory]);

  const clearAnnotationsFor = useCallback((oId: AttackerId) => {
    setStateWithHistory((s) => annotationTx.clearAnnotationsFor(s, oId));
  }, [setStateWithHistory]);

  const deleteLastAnnotation = useCallback(() => {
    setStateWithHistory(annotationTx.deleteLastAnnotation);
  }, [setStateWithHistory]);

  const deleteAnnotation = useCallback((idx: number) => {
    setStateWithHistory((s) => annotationTx.deleteAnnotation(s, idx));
  }, [setStateWithHistory]);

  const setAnnotationTiming = useCallback(
    (stepIdx: number, annoIdx: number, tStart: number, tEnd: number) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationTiming(s, stepIdx, annoIdx, tStart, tEnd)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationQuality = useCallback(
    (stepIdx: number, annoIdx: number, quality: number) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationQuality(s, stepIdx, annoIdx, quality)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationPhase = useCallback(
    (stepIdx: number, annoIdx: number, phase: 'start' | 'end') => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationPhase(s, stepIdx, annoIdx, phase)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationFrom = useCallback(
    (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationFrom(s, stepIdx, annoIdx, point)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationTo = useCallback(
    (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationTo(s, stepIdx, annoIdx, point)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationWaypoint = useCallback(
    (stepIdx: number, annoIdx: number, wpIdx: number, point: { x: number; y: number }) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationWaypoint(s, stepIdx, annoIdx, wpIdx, point)
      );
    },
    [setStateWithHistory]
  );

  // -- Tool --
  const setTool = useCallback((tool: Tool) => {
    setStateWithHistory((s) => coreTx.setTool(s, tool));
  }, [setStateWithHistory]);

  // -- Defense rules / profils / presets --
  const updateRule = useCallback((dId: DefenderId, patch: Partial<DefenderRule>) => {
    setStateWithHistory((s) => defenseTx.updateRule(s, dId, patch));
  }, [setStateWithHistory]);

  const updateAllRules = useCallback((patch: Partial<DefenderRule>) => {
    setStateWithHistory((s) => defenseTx.updateAllRules(s, patch));
  }, [setStateWithHistory]);

  const resetIndividualOverrides = useCallback(() => {
    setStateWithHistory(defenseTx.resetIndividualOverrides);
  }, [setStateWithHistory]);

  const applyDefenderProfile = useCallback(
    (dId: DefenderId, profile: DefenderProfile) => {
      setStateWithHistory((s) => defenseTx.applyDefenderProfile(s, dId, profile));
    },
    [setStateWithHistory]
  );

  const setScreenRule = useCallback((rule: ScreenRule) => {
    setStateWithHistory((s) => defenseTx.setScreenRule(s, rule));
  }, [setStateWithHistory]);

  const resetSwitches = useCallback(() => {
    setStateWithHistory(defenseTx.resetSwitches);
  }, [setStateWithHistory]);

  const applyDefensePreset = useCallback((preset: DefensePreset) => {
    setStateWithHistory((s) => defenseTx.applyDefensePreset(s, preset));
  }, [setStateWithHistory]);

  const setDefenseSystem = useCallback((system: DefenseSystem) => {
    setStateWithHistory((s) => defenseTx.setDefenseSystem(s, system));
  }, [setStateWithHistory]);

  const clearAllDefenseOverridesActiveStep = useCallback(() => {
    setStateWithHistory(defenseTx.clearAllDefenseOverridesActiveStep);
  }, [setStateWithHistory]);

  /** Variante animée : capture les positions courantes (manuelles) AVANT le
   *  clear, puis enclenche `defenseReleaseTransition` pour que useCourtFrame
   *  blend pendant `DEFENSE_RELEASE_DURATION_MS`. Utilisée par le bouton
   *  "Tout en auto réel" — pédagogique pour montrer aux joueurs le retour à
   *  la position attendue. */
  const clearAllDefenseOverridesActiveStepAnimated = useCallback(() => {
    const cur = stateRef.current;
    const step = cur.steps[cur.activeStep];
    if (!step?.defenseOverrides || Object.keys(step.defenseOverrides).length === 0) return;
    // Snapshot des positions actuelles (avec overrides appliqués). On lit via
    // l'engine pour avoir EXACTEMENT ce qui est rendu actuellement.
    const defPos = effectiveDefensePositions(cur, cur.activeStep);
    const from: Partial<Record<DefenderId, Point>> = {};
    (Object.keys(defPos) as DefenderId[]).forEach((id) => {
      from[id] = { x: defPos[id].x, y: defPos[id].y };
    });
    setDefenseReleaseTransition({
      fromPositions: from,
      startedAtMs: performance.now(),
      durationMs: DEFENSE_RELEASE_DURATION_MS,
    });
    setStateWithHistory(defenseTx.clearAllDefenseOverridesActiveStep);
  }, [setStateWithHistory]);

  // -- Attackers --
  const setAttackerHand = useCallback((oId: AttackerId, hand: 'right' | 'left') => {
    setStateWithHistory((s) => attackerTx.setAttackerHand(s, oId, hand));
  }, [setStateWithHistory]);

  const setAttackerOrientation = useCallback(
    (oId: AttackerId, patch: { body?: number | undefined; gaze?: number | undefined }) => {
      setStateWithHistory((s) => attackerTx.setAttackerOrientation(s, oId, patch));
    },
    [setStateWithHistory]
  );

  const setAttackerProfile = useCallback(
    (oId: AttackerId, profile: OffensiveProfile) => {
      setStateWithHistory((s) => attackerTx.setAttackerProfile(s, oId, profile));
    },
    [setStateWithHistory]
  );

  // -- Reset / template / import / patch / playerCount --
  const resetAll = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    setStateWithHistory(coreTx.resetAll());
  }, [setStateWithHistory]);

  const loadTemplate = useCallback((template: Template) => {
    setStateWithHistory((s) => coreTx.loadTemplate(s, template));
  }, [setStateWithHistory]);

  const importState = useCallback((next: AppState) => {
    setStateWithHistory(coreTx.importState(next));
  }, [setStateWithHistory]);

  const patch = useCallback((p: Partial<AppState>) => {
    setStateWithHistory((s) => coreTx.patch(s, p));
  }, [setStateWithHistory]);

  const setPlayerCount = useCallback((count: PlayerCount) => {
    setStateWithHistory((s) => coreTx.setPlayerCount(s, count));
  }, [setStateWithHistory]);

  // -- Zones --
  const setZoneOverride = useCallback(
    (regionId: string, override: Partial<ZoneRegionOverride>) => {
      setStateWithHistory((s) => zoneTx.setZoneOverride(s, regionId, override));
    },
    [setStateWithHistory]
  );

  const clearZoneOverride = useCallback((regionId: string) => {
    setStateWithHistory((s) => zoneTx.clearZoneOverride(s, regionId));
  }, [setStateWithHistory]);

  const setZoneEditMode = useCallback((on: boolean) => {
    setStateWithHistory((s) => zoneTx.setZoneEditMode(s, on));
  }, [setStateWithHistory]);

  const updateZoneConfig = useCallback((zPatch: Partial<ZoneConfig>) => {
    setStateWithHistory((s) => zoneTx.updateZoneConfig(s, zPatch));
  }, [setStateWithHistory]);

  // -- Scénario scripté --
  const addScriptedAction = useCallback((action: ScriptedAction) => {
    setStateWithHistory((s) => scenarioTx.addScriptedAction(s, action));
  }, [setStateWithHistory]);

  const updateScriptedAction = useCallback((id: string, action: ScriptedAction) => {
    setStateWithHistory((s) => scenarioTx.updateScriptedAction(s, id, action));
  }, [setStateWithHistory]);

  const deleteScriptedAction = useCallback((id: string) => {
    setStateWithHistory((s) => scenarioTx.deleteScriptedAction(s, id));
  }, [setStateWithHistory]);

  const moveScriptedAction = useCallback((id: string, dir: 'up' | 'down') => {
    setStateWithHistory((s) => scenarioTx.moveScriptedAction(s, id, dir));
  }, [setStateWithHistory]);

  const clearScriptedActions = useCallback(() => {
    setStateWithHistory(scenarioTx.clearScriptedActions);
  }, [setStateWithHistory]);

  // -- Branches scénario --
  const addScenarioBranch = useCallback((branch: ScenarioBranch) => {
    setStateWithHistory((s) => scenarioTx.addScenarioBranch(s, branch));
  }, [setStateWithHistory]);

  const updateScenarioBranch = useCallback((id: string, branch: ScenarioBranch) => {
    setStateWithHistory((s) => scenarioTx.updateScenarioBranch(s, id, branch));
  }, [setStateWithHistory]);

  const deleteScenarioBranch = useCallback((id: string) => {
    setStateWithHistory((s) => scenarioTx.deleteScenarioBranch(s, id));
  }, [setStateWithHistory]);

  const setActiveBranch = useCallback((id: string | null) => {
    setStateWithHistory((s) => scenarioTx.setActiveBranch(s, id));
  }, [setStateWithHistory]);

  // -- Actions défensives scriptées --
  const addDefensiveAction = useCallback(
    (
      type: DefensiveActionType,
      params: DefensiveActionParams,
      parentActionId?: string,
      affectedSteps?: number[]
    ) => {
      setStateWithHistory((s) =>
        defensiveTx.addDefensiveAction(s, type, params, parentActionId, affectedSteps)
      );
    },
    [setStateWithHistory]
  );

  const updateDefensiveAction = useCallback(
    (id: string, updated: DefensiveScriptedAction) => {
      setStateWithHistory((s) => defensiveTx.updateDefensiveAction(s, id, updated));
    },
    [setStateWithHistory]
  );

  const deleteDefensiveAction = useCallback((id: string) => {
    setStateWithHistory((s) => defensiveTx.deleteDefensiveAction(s, id));
  }, [setStateWithHistory]);

  const toggleScriptedDefense = useCallback(() => {
    setStateWithHistory(defensiveTx.toggleScriptedDefense);
  }, [setStateWithHistory]);

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
    beginPlayerDrag,
    commitPlayerDrag,
    moveAttackerDuringDrag,
    moveDefenderDuringDrag,
    addAnnotation,
    deleteLastAnnotation,
    deleteAnnotation,
    setAnnotationPhase,
    setAnnotationTiming,
    setAnnotationQuality,
    setAnnotationFrom,
    setAnnotationTo,
    setAnnotationWaypoint,
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
    clearAllDefenseOverridesActiveStepAnimated,
    defenseReleaseTransition,
    setStepLabel,
    setBallCarrier,
    convertStepToFreeThrow,
    convertStepToInbound,
    setInboundDefenseMode,
    loadTemplate,
    clearDefenseOverride,
    autoPositionOffBall,
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
