import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  Annotation,
  Step,
  ScreenRule,
  Tool,
  DefenderRule,
  DefenseSystem,
  ZoneConfig,
} from '@/lib/types';
import { makeInitialState, makeStep, initialOff, initialDef } from '@/lib/data/initial';
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

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadFromStorage() ?? makeInitialState());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
  }, [state]);

  const setActiveStep = useCallback((idx: number) => {
    setState((s) => ({ ...s, activeStep: Math.max(0, Math.min(s.steps.length - 1, idx)) }));
  }, []);

  const addStep = useCallback(() => {
    setState((s) => {
      const cur = s.steps[s.activeStep];
      const newStep = makeStep(cur.off, cur.ballCarrier, []);
      const steps = [...s.steps];
      steps.splice(s.activeStep + 1, 0, newStep);
      return { ...s, steps, activeStep: s.activeStep + 1 };
    });
  }, []);

  const duplicateStep = useCallback(() => {
    setState((s) => {
      const copy: Step = structuredClone(s.steps[s.activeStep]);
      delete copy.switches;
      const steps = [...s.steps];
      steps.splice(s.activeStep + 1, 0, copy);
      return { ...s, steps, activeStep: s.activeStep + 1 };
    });
  }, []);

  const deleteStep = useCallback(() => {
    setState((s) => {
      if (s.steps.length <= 1) return s;
      const steps = s.steps.filter((_, i) => i !== s.activeStep);
      return { ...s, steps, activeStep: Math.max(0, s.activeStep - 1) };
    });
  }, []);

  const moveAttacker = useCallback((id: AttackerId, x: number, y: number) => {
    setState((s) => {
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.off = { ...cur.off, [id]: { x, y } };
      steps[s.activeStep] = cur;
      return { ...s, steps };
    });
  }, []);

  const moveDefender = useCallback((id: DefenderId, x: number, y: number) => {
    // Drag d'un défenseur = override manuel pour l'étape active.
    // Le moteur respectera cette position (skip auto-targeting pour ce
    // défenseur sur cette étape). Pour réauto-positionner, voir
    // clearDefenseOverride.
    setState((s) => {
      const steps = [...s.steps];
      const cur = { ...steps[s.activeStep] };
      cur.defenseOverrides = { ...cur.defenseOverrides, [id]: { x, y } };
      steps[s.activeStep] = cur;
      // On met aussi à jour defenseInitial à l'étape 0 pour la cohérence
      // de la détection d'écran et l'export JSON pre-overrides.
      const defenseInitial =
        s.activeStep === 0 ? { ...s.defenseInitial, [id]: { x, y } } : s.defenseInitial;
      return { ...s, steps, defenseInitial };
    });
  }, []);

  const clearDefenseOverride = useCallback((id: DefenderId) => {
    setState((s) => {
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
    setState((s) => {
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

  const setTool = useCallback((tool: Tool) => {
    setState((s) => ({ ...s, tool }));
  }, []);

  const updateRule = useCallback((dId: DefenderId, patch: Partial<DefenderRule>) => {
    setState((s) => ({
      ...s,
      rules: { ...s.rules, [dId]: { ...s.rules[dId], ...patch } },
    }));
  }, []);

  const setScreenRule = useCallback((rule: ScreenRule) => {
    setState((s) => {
      const steps = s.steps.map((st) => {
        const copy = { ...st };
        delete copy.switches;
        return copy;
      });
      return { ...s, steps, screenRule: rule };
    });
  }, []);

  const resetSwitches = useCallback(() => {
    setState((s) => ({
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
    setState(makeInitialState());
  }, []);

  const setStepLabel = useCallback((idx: number, label: string) => {
    setState((s) => {
      const steps = [...s.steps];
      steps[idx] = { ...steps[idx], label: label || undefined };
      return { ...s, steps };
    });
  }, []);

  const setBallCarrier = useCallback((carrier: AttackerId) => {
    setState((s) => {
      const steps = [...s.steps];
      steps[s.activeStep] = { ...steps[s.activeStep], ballCarrier: carrier };
      return { ...s, steps };
    });
  }, []);

  const loadTemplate = useCallback((template: Template) => {
    setState((s) => ({
      ...s,
      steps: structuredClone(template.steps),
      activeStep: 0,
      defenseInitial: structuredClone(template.defenseInitial),
    }));
  }, []);

  const applyDefensePreset = useCallback((preset: DefensePreset) => {
    setState((s) => {
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
    setState((s) => ({ ...s, defenseSystem: system }));
  }, []);

  const updateZoneConfig = useCallback((zPatch: Partial<ZoneConfig>) => {
    setState((s) => ({ ...s, zoneConfig: { ...s.zoneConfig, ...zPatch } }));
  }, []);

  const importState = useCallback((next: AppState) => {
    const defaults = makeInitialState();
    const merged: AppState = {
      ...defaults,
      ...next,
      zoneConfig: { ...defaults.zoneConfig, ...(next.zoneConfig || {}) },
    };
    setState(merged);
  }, []);

  const patch = useCallback((p: Partial<AppState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  return {
    state,
    setActiveStep,
    addStep,
    duplicateStep,
    deleteStep,
    moveAttacker,
    moveDefender,
    addAnnotation,
    setTool,
    updateRule,
    setScreenRule,
    resetSwitches,
    resetAll,
    importState,
    patch,
    setDefenseSystem,
    updateZoneConfig,
    setStepLabel,
    setBallCarrier,
    loadTemplate,
    clearDefenseOverride,
    applyDefensePreset,
  };
}
