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
import { useLocalSave } from './useLocalSave';
import { useHistorizedState } from './useHistorizedState';
import type {
  AppState,
  AddAnnotationOptions,
  Annotation,
  AttackerId,
  AttackerSpeedTier,
  DefenderId,
  DefenderRule,
  DefenseSystem,
  DefensiveActionParams,
  DefensiveActionType,
  DefensiveScriptedAction,
  OffensiveProfile,
  PlayerCount,
  PlayerId,
  Point,
  ScenarioBranch,
  ScreenRule,
  ScriptedAction,
  TextNote,
  Tool,
  ZoneConfig,
  ZoneRegionOverride,
} from '@/lib/types';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { makeAppInitialState } from '@/lib/data/initial';
import type { Template } from '@/lib/data/templates';
import type { DefensePreset } from '@/lib/data/defensePresets';
import type { DefenderProfile } from '@/lib/data/defenderProfiles';
import { persistDetectedSwitchesThroughStep } from '@/lib/logic/engine';
import { moveAttackerInState, moveDefenderInState } from '@/lib/logic/playerMove';
import { STARTING_FORMATIONS } from '@/lib/data/startingFormations';
import { loadFromStorage, saveToStorage, RECOVERY_KEY } from '@/lib/state/persistence';
import { decompressStateFromUrl, parseSharedHash } from '@/lib/state/urlCompression';
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
import * as textNoteTx from '@/lib/state/transforms/textNoteTransforms';

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

/** État transient pour le mécanisme de poursuite défenseur pendant un drag
 *  attaquant. Utilisé par useCourtFrame pour run un rAF loop qui met à jour
 *  les positions défenseurs avec un cap de vitesse modulé (V1) + footwork
 *  dynamique (V2) + fatigue/anticipation/décrochage (V3). */
export interface DefenderPursuit {
  /** Snapshot des positions au moment du début du drag (init des
   *  livePositions). */
  snapshot: Partial<Record<DefenderId, Point>>;
  /** True pendant le drag ; false pendant le rattrapage à vitesse bornée. */
  active: boolean;
  stepIndex: number;
  /** Timestamp du début du drag (pour timing / latence). */
  startedAtMs: number;
}

const DEFENSE_RELEASE_DURATION_MS = 700;

export function useAppState() {
  // Premier render identique côté SSR et client : on part toujours de l'état
  // par défaut. localStorage est lu dans un effect post-montage uniquement
  // (sinon hydration mismatch).
  const {
    state,
    stateRef,
    setStateRaw,
    setStateWithHistory,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    beginPlayerDrag: beginHistoryDrag,
    commitPlayerDrag,
    registerPendingFlush: registerPendingGestureFlush,
  } = useHistorizedState(makeAppInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);

  // Animation transitoire "Tout en auto réel" : positions de départ capturées
  // au clic + timestamp. Non persistée. Cf. clearAllDefenseOverridesActiveStepAnimated.
  const [defenseReleaseTransition, setDefenseReleaseTransition] =
    useState<DefenseReleaseTransition | null>(null);
  const [defenderPursuit, setDefenderPursuit] = useState<DefenderPursuit | null>(null);
  const undo = useCallback(() => {
    setDefenderPursuit(null);
    undoHistory();
  }, [undoHistory]);
  const redo = useCallback(() => {
    setDefenderPursuit(null);
    redoHistory();
  }, [redoHistory]);
  const beginPlayerDrag = useCallback(() => {
    setDefenderPursuit(null);
    beginHistoryDrag();
  }, [beginHistoryDrag]);
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

  // Hydration : lit l'URL partagée ou le localStorage post-montage.
  useEffect(() => {
    async function init() {
      setHasRecovery(loadFromStorage(RECOVERY_KEY) !== null);
      const share = parseSharedHash(window.location.hash);
      if (share.payload) {
        const payload = share.payload;
        const shared = await decompressStateFromUrl(payload);
        if (shared) {
          const previous = loadFromStorage();
          if (previous && !saveToStorage(previous, RECOVERY_KEY)) {
            alert('Le brouillon précédent ne peut pas être protégé. Libérez du stockage avant d’ouvrir ce lien.');
            setStateRaw(previous);
            setHydrated(true);
            return;
          }
          if (previous) setHasRecovery(true);
          setStateRaw({ ...shared, librarySystemId: undefined });
          // Nettoie le hash pour ne pas recharger à chaque refresh
          window.history.replaceState(null, '', window.location.pathname + window.location.search + (share.playerMode ? '#mode=player' : ''));
          setHydrated(true);
          return;
        } else {
          alert('Impossible de charger la tactique partagée : lien corrompu ou obsolète.');
        }
      }
      const persisted = loadFromStorage();
      if (persisted) setStateRaw(persisted);
      setHydrated(true);
    }
    init();
  }, [setStateRaw]);

  // Détection de switches après chaque changement d'état.
  useEffect(() => {
    if (!hydrated) return;
    setStateRaw((cur) => persistDetectedSwitchesThroughStep(cur));
  }, [hydrated, state, setStateRaw]);

  const saveStatus = useLocalSave(state, hydrated, saveToStorage);
  const protectDraft = useCallback(() => {
    if (!saveToStorage(stateRef.current, RECOVERY_KEY)) {
      alert('Le brouillon ne peut pas être protégé. Exportez-le avant de le remplacer.');
      return false;
    }
    setHasRecovery(true);
    return true;
  }, [stateRef]);
  const restoreDraft = useCallback(() => {
    const previous = loadFromStorage(RECOVERY_KEY);
    if (previous && protectDraft()) {
      setDefenderPursuit(null);
      setStateWithHistory(previous);
    }
  }, [protectDraft, setStateWithHistory]);

  // ============================================================
  // Câblage des transforms → callbacks publics
  // ============================================================

  // -- Steps --
  // Naviguer n'est pas modifier : hors historique, sinon « Annuler » se
  // contenterait de revenir à l'étape consultée avant la vraie correction.
  const setActiveStep = useCallback((idx: number) => {
    setDefenderPursuit(null);
    setStateRaw((s) => {
      const next = stepTx.setActiveStep(s, idx);
      return next.activeStep === s.activeStep ? s : next;
    });
  }, [setStateRaw]);

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

  const patchStep = useCallback(
    (idx: number, patch: Partial<AppState['steps'][number]>) => {
      setStateWithHistory((s) => stepTx.patchStep(s, idx, patch));
    },
    [setStateWithHistory],
  );

  const addShotReboundStep = useCallback(
    (options?: { seed?: number; sourceStepIdx?: number }) => {
      setStateWithHistory((s) => stepTx.addShotReboundStep(s, options));
    },
    [setStateWithHistory],
  );

  const addFastBreakSteps = useCallback(
    (options?: { sourceStepIdx?: number }) => {
      setStateWithHistory((s) => stepTx.addFastBreakSteps(s, options ?? {}));
    },
    [setStateWithHistory],
  );

  const convertStepToAwayPossession = useCallback(
    (options?: { mode?: 'insert' | 'replace'; sourceStepIdx?: number }) => {
      setStateWithHistory((s) => stepTx.convertStepToAwayPossession(s, options));
    },
    [setStateWithHistory],
  );

  const addOutletPassStep = useCallback(
    (options?: { sourceStepIdx?: number }) => {
      setStateWithHistory((s) => stepTx.addOutletPassStep(s, options));
    },
    [setStateWithHistory],
  );

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

  const addFreeThrowReboundStep = useCallback(
    (made: boolean) => {
      setStateWithHistory((s) => stepTx.addFreeThrowReboundStep(s, made));
    },
    [setStateWithHistory]
  );

  const convertStepToJumpBall = useCallback(() => {
    setStateWithHistory(stepTx.convertStepToJumpBall);
  }, [setStateWithHistory]);

  const togglePlayerDisqualified = useCallback(
    (playerId: import('@/lib/types').PlayerId) => {
      setStateWithHistory((s) => coreTx.togglePlayerDisqualified(s, playerId));
    },
    [setStateWithHistory]
  );

  const clearDisqualified = useCallback(() => {
    setStateWithHistory(coreTx.clearDisqualified);
  }, [setStateWithHistory]);

  const setPlayerName = useCallback(
    (id: PlayerId, name: string) => {
      setStateWithHistory((s) => coreTx.setPlayerName(s, id, name));
    },
    [setStateWithHistory]
  );

  const setPlayerNumber = useCallback(
    (id: PlayerId, num: string) => {
      setStateWithHistory((s) => coreTx.setPlayerNumber(s, id, num));
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
    setStateRaw((s) => moveAttackerInState(s, id, { x, y }));
  }, [setStateRaw]);

  const moveDefenderDuringDrag = useCallback((id: DefenderId, x: number, y: number) => {
    setStateRaw((s) => moveDefenderInState(s, id, { x, y }));
  }, [setStateRaw]);

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

  /** Applique une formation de départ prédéfinie (5-Out, Horns, 4-Out 1-In, etc.) sur l'étape active. */
  const applyStartingFormation = useCallback((formationId: string) => {
    setStateWithHistory((s) => {
      const step = s.steps[s.activeStep];
      if (!step) return s;
      const form = STARTING_FORMATIONS.find((f) => f.id === formationId);
      if (!form) return s;
      let next = s;
      (Object.keys(form.positions) as AttackerId[]).forEach((id) => {
        if (form.positions[id]) {
          next = moveAttackerInState(next, id, form.positions[id]!);
        }
      });
      return next;
    });
  }, [setStateWithHistory]);


  // -- Annotations --
  const addAnnotation = useCallback((annotation: Annotation, options?: AddAnnotationOptions) => {
    setStateWithHistory((s) => annotationTx.addAnnotation(s, annotation, options));
  }, [setStateWithHistory]);

  const addTextNote = useCallback((stepIdx: number, note: TextNote) => {
    setStateWithHistory((s) => textNoteTx.addTextNote(s, stepIdx, note));
  }, [setStateWithHistory]);

  const updateTextNote = useCallback(
    (stepIdx: number, noteIdx: number, text: string) => {
      setStateWithHistory((s) => textNoteTx.updateTextNote(s, stepIdx, noteIdx, text));
    },
    [setStateWithHistory],
  );

  const removeTextNote = useCallback((stepIdx: number, noteIdx: number) => {
    setStateWithHistory((s) => textNoteTx.removeTextNote(s, stepIdx, noteIdx));
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

  const deleteAnnotation = useCallback((idx: number, stepIdx?: number) => {
    setStateWithHistory((s) => annotationTx.deleteAnnotation(s, idx, stepIdx));
  }, [setStateWithHistory]);

  const setAnnotationTiming = useCallback(
    (stepIdx: number, annoIdx: number, tStart: number, tEnd: number) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationTiming(s, stepIdx, annoIdx, tStart, tEnd)
      );
    },
    [setStateWithHistory]
  );

  const setAnnotationTimingAbs = useCallback(
    (stepIdx: number, annoIdx: number, tStartAbs: number | undefined, tEndAbs: number | undefined) => {
      setStateWithHistory((s) =>
        annotationTx.setAnnotationTimingAbs(s, stepIdx, annoIdx, tStartAbs, tEndAbs)
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

  const toggleAnnotationSprint = useCallback(
    (stepIdx: number, annoIdx: number) => {
      setStateWithHistory((s) =>
        annotationTx.toggleAnnotationSprint(s, stepIdx, annoIdx)
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

  const addFeinte = useCallback(
    (stepIdx: number, annIdx: number, t: number) => {
      setStateWithHistory((s) => annotationTx.addFeinte(s, stepIdx, annIdx, t));
    },
    [setStateWithHistory],
  );

  const setAnnotationFlipSide = useCallback(
    (stepIdx: number, annIdx: number, side: 'left' | 'right' | undefined) => {
      setStateWithHistory((s) => annotationTx.setAnnotationFlipSide(s, stepIdx, annIdx, side));
    },
    [setStateWithHistory],
  );
  const updateFeinte = useCallback(
    (stepIdx: number, annIdx: number, feinteIdx: number, t: number) => {
      setStateWithHistory((s) => annotationTx.updateFeinte(s, stepIdx, annIdx, feinteIdx, t));
    },
    [setStateWithHistory],
  );
  const removeFeinte = useCallback(
    (stepIdx: number, annIdx: number, feinteIdx: number) => {
      setStateWithHistory((s) => annotationTx.removeFeinte(s, stepIdx, annIdx, feinteIdx));
    },
    [setStateWithHistory],
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
  const setDefenderSpeedProfile = useCallback(
    (dId: DefenderId, profile: 'elite' | 'standard' | 'lent' | undefined) => {
      setStateWithHistory((s) => defenseTx.setDefenderSpeedProfile(s, dId, profile));
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

  /** Poursuite défenseur sur drag attaquant — démarrage. Capture les
   *  positions défenseurs courantes et active le mécanisme de poursuite
   *  (rAF loop dans useCourtFrame qui maintient des livePositions avec cap
   *  vitesse bornée). Le snapshot affiché évite un saut lorsqu'un nouveau
   *  drag commence avant la fin du rattrapage précédent. */
  const beginDefenderPursuit = useCallback((displayed?: Partial<Record<DefenderId, Point>>) => {
    const cur = stateRef.current;
    const defPos = displayed ?? effectiveDefensePositions(cur, cur.activeStep);
    const snapshot: Partial<Record<DefenderId, Point>> = {};
    (Object.keys(defPos) as DefenderId[]).forEach((id) => {
      const p = defPos[id];
      if (p) snapshot[id] = { x: p.x, y: p.y };
    });
    setDefenderPursuit({
      snapshot,
      active: true,
      stepIndex: cur.activeStep,
      startedAtMs: performance.now(),
    });
  }, []);

  /** Le rattrapage continue à vitesse bornée jusqu'à la cible. Aucun délai
   *  arbitraire ne doit provoquer un saut ni interrompre le drag suivant. */
  const endDefenderPursuit = useCallback(() => {
    setDefenderPursuit((cur) => (cur ? { ...cur, active: false } : null));
  }, []);

  const finishDefenderPursuit = useCallback((finished: DefenderPursuit) => {
    setDefenderPursuit((cur) => cur === finished && !cur.active ? null : cur);
  }, []);

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

  const setAttackerSpeedTier = useCallback(
    (id: AttackerId, tier: AttackerSpeedTier | undefined) => {
      setStateWithHistory((s) => attackerTx.setAttackerSpeedTier(s, id, tier));
    },
    [setStateWithHistory],
  );

  // -- Reset / template / import / patch / playerCount --
  const resetAll = useCallback(() => {
    if (!protectDraft()) return false;
    setDefenderPursuit(null);
    setStateWithHistory(coreTx.resetAll());
    return true;
  }, [setStateWithHistory, protectDraft]);

  // `keepRecovery` : le brouillon est déjà protégé (déroulé de séance, U05).
  // Enchaîner les blocs ne doit pas écraser l'unique copie de récupération
  // avec le système du bloc précédent.
  const loadTemplate = useCallback((template: Template, options?: { keepRecovery?: boolean }) => {
    if (!options?.keepRecovery && !protectDraft()) return false;
    setDefenderPursuit(null);
    setStateWithHistory((s) => coreTx.loadTemplate(s, template));
    return true;
  }, [setStateWithHistory, protectDraft]);

  const importState = useCallback((next: AppState, options?: { keepRecovery?: boolean }) => {
    if (!options?.keepRecovery && !protectDraft()) return false;
    setDefenderPursuit(null);
    setStateWithHistory(coreTx.importState(next));
    return true;
  }, [setStateWithHistory, protectDraft]);

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

  const addScenarioBranches = useCallback((branches: ScenarioBranch[]) => {
    setStateWithHistory((s) => scenarioTx.addScenarioBranches(s, branches));
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

  // -- Lecture probabiliste (Phase L proba) --
  const toggleProbabilisticReads = useCallback((enabled: boolean) => {
    setStateWithHistory((s) => scenarioTx.toggleProbabilisticReads(s, enabled));
  }, [setStateWithHistory]);

  const setCoverageDistribution = useCallback(
    (dist: { coverage: ScreenRule; weight: number }[]) => {
      setStateWithHistory((s) => scenarioTx.setCoverageDistribution(s, dist));
    },
    [setStateWithHistory],
  );

  const rerollCoverage = useCallback(() => {
    setStateWithHistory((s) => scenarioTx.rerollCoverage(s));
  }, [setStateWithHistory]);

  const setContinuityLoop = useCallback(
    (loop: import('@/lib/types').ContinuityLoop | null) => {
      setStateWithHistory((s) => scenarioTx.setContinuityLoop(s, loop));
    },
    [setStateWithHistory],
  );

  const setAutoReplacement = useCallback(
    (enabled: boolean, depth: number) => {
      setStateWithHistory((s) => scenarioTx.setAutoReplacement(s, enabled, depth));
    },
    [setStateWithHistory],
  );

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
    saveStatus,
    hasRecovery,
    restoreDraft,
    undo,
    redo,
    canUndo,
    canRedo,
    setActiveStep,
    addStep,
    duplicateStep,
    deleteStep,
    moveAttacker,
    moveDefender,
    beginPlayerDrag,
    commitPlayerDrag,
    registerPendingGestureFlush,
    moveAttackerDuringDrag,
    moveDefenderDuringDrag,
    addAnnotation,
    addTextNote,
    updateTextNote,
    removeTextNote,
    deleteLastAnnotation,
    deleteAnnotation,
    setAnnotationPhase,
    toggleAnnotationSprint,
    setAnnotationTiming,
    setAnnotationTimingAbs,
    setAnnotationQuality,
    setAnnotationFrom,
    setAnnotationTo,
    setAnnotationWaypoint,
    setAnnotationFlipSide,
    addFeinte,
    updateFeinte,
    removeFeinte,
    setForcedScreener,
    clearAnnotationsFor,
    setTool,
    updateRule,
    updateAllRules,
    resetIndividualOverrides,
    applyDefenderProfile,
    setDefenderSpeedProfile,
    setAttackerHand,
    setAttackerOrientation,
    setAttackerProfile,
    setAttackerSpeedTier,
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
    beginDefenderPursuit,
    endDefenderPursuit,
    finishDefenderPursuit,
    defenseReleaseTransition,
    defenderPursuit,
    setStepLabel,
    patchStep,
    addShotReboundStep,
    addFastBreakSteps,
    convertStepToAwayPossession,
    addOutletPassStep,
    setBallCarrier,
    convertStepToFreeThrow,
    convertStepToInbound,
    setInboundDefenseMode,
    addFreeThrowReboundStep,
    convertStepToJumpBall,
    togglePlayerDisqualified,
    clearDisqualified,
    setPlayerName,
    setPlayerNumber,
    loadTemplate,
    clearDefenseOverride,
    autoPositionOffBall,
    applyStartingFormation,
    applyDefensePreset,
    addScriptedAction,
    updateScriptedAction,
    deleteScriptedAction,
    addScenarioBranch,
    addScenarioBranches,
    updateScenarioBranch,
    deleteScenarioBranch,
    setActiveBranch,
    toggleProbabilisticReads,
    setCoverageDistribution,
    rerollCoverage,
    setContinuityLoop,
    setAutoReplacement,
    moveScriptedAction,
    clearScriptedActions,
    addDefensiveAction,
    updateDefensiveAction,
    deleteDefensiveAction,
    toggleScriptedDefense,
  };
}
