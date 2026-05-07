import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  DefenderPositions,
  Annotation,
  Step,
  ScreenRule,
  Tool,
  DefenderRule,
  DefenseSystem,
  ZoneConfig,
  Point,
} from '@/lib/types';
import { makeInitialState, makeStep, initialOff, initialDef } from '@/lib/data/initial';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import type { Template } from '@/lib/data/templates';
import type { DefensePreset } from '@/lib/data/defensePresets';

const STORAGE_KEY = 'basket-tactics-state-v1';

function loadFromStorage(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const defaults = makeInitialState();
    return {
      ...defaults,
      ...parsed,
      zoneConfig: { ...defaults.zoneConfig, ...(parsed.zoneConfig || {}) },
    } as AppState;
  } catch {
    return null;
  }
}

const HISTORY_LIMIT = 50;

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
      const newStep = makeStep(cur.off, cur.ballCarrier, []);
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
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.off = { ...cur.off, [id]: { x, y } };
      steps[s.activeStep] = cur;
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
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.annotations = [...cur.annotations, annotation];
      if (annotation.type === 'pass' && annotation.toId) {
        cur.ballCarrier = annotation.toId;
      }
      steps[s.activeStep] = cur;
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
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.annotations = cur.annotations.filter((a) => a.fromId !== oId);
      steps[s.activeStep] = cur;
      return { ...s, steps };
    });
  }, []);

  const deleteLastAnnotation = useCallback(() => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      if (!cur || cur.annotations.length === 0) return s;
      const steps = [...s.steps];
      steps[s.activeStep] = { ...cur, annotations: cur.annotations.slice(0, -1) };
      return { ...s, steps };
    });
  }, []);

  const deleteAnnotation = useCallback((idx: number) => {
    setStateWithHistory((s) => {
      const cur = s.steps[s.activeStep];
      if (!cur || idx < 0 || idx >= cur.annotations.length) return s;
      const steps = [...s.steps];
      steps[s.activeStep] = {
        ...cur,
        annotations: cur.annotations.filter((_, i) => i !== idx),
      };
      return { ...s, steps };
    });
  }, []);

  const setTool = useCallback((tool: Tool) => {
    setStateWithHistory((s) => ({ ...s, tool }));
  }, []);

  const updateRule = useCallback((dId: DefenderId, patch: Partial<DefenderRule>) => {
    setStateWithHistory((s) => ({
      ...s,
      rules: { ...s.rules, [dId]: { ...s.rules[dId], ...patch } },
    }));
  }, []);

  const setAttackerHand = useCallback((oId: AttackerId, hand: 'right' | 'left') => {
    setStateWithHistory((s) => ({
      ...s,
      attackerHands: { ...(s.attackerHands ?? { O1: 'right', O2: 'right', O3: 'right', O4: 'right', O5: 'right' }), [oId]: hand },
    }));
  }, []);

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
      steps: structuredClone(template.steps),
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

  const updateZoneConfig = useCallback((zPatch: Partial<ZoneConfig>) => {
    setStateWithHistory((s) => {
      const newConfig = { ...s.zoneConfig, ...zPatch };
      let next: AppState = { ...s, zoneConfig: newConfig };
      // Si on change le TYPE de zone, on snap tous les défenseurs aux nouvelles
      // home positions et on efface les overrides — l'utilisateur s'attend à
      // voir la formation par défaut quand il sélectionne un layout.
      if (zPatch.type && zPatch.type !== s.zoneConfig.type) {
        const layout = getZoneLayout(newConfig.type, newConfig.verticalOffset ?? 0);
        const newDefenseInitial = {} as DefenderPositions;
        const overrides: Partial<Record<DefenderId, Point>> = {};
        layout.forEach((z) => {
          newDefenseInitial[z.assignedTo] = { ...z.homePos };
          overrides[z.assignedTo] = { ...z.homePos };
        });
        const cleanedSteps = s.steps.map((st, i) => {
          const c = { ...st };
          delete c.defenseOverrides;
          // On force les overrides sur l'étape active uniquement, pour que
          // l'utilisateur voie la formation par défaut sans qu'elles ne
          // polluent les autres étapes.
          if (i === s.activeStep) c.defenseOverrides = overrides;
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
    setStateWithHistory(merged);
  }, []);

  const patch = useCallback((p: Partial<AppState>) => {
    setStateWithHistory((s) => ({ ...s, ...p }));
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
    setForcedScreener,
    clearAnnotationsFor,
    setTool,
    updateRule,
    setAttackerHand,
    setScreenRule,
    resetSwitches,
    resetAll,
    importState,
    patch,
    setDefenseSystem,
    updateZoneConfig,
    setZoneOverride,
    clearZoneOverride,
    setZoneEditMode,
    setStepLabel,
    setBallCarrier,
    loadTemplate,
    clearDefenseOverride,
    applyDefensePreset,
  };
}
