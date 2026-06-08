# Lecture probabiliste (Phase L extension) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La défense joue une distribution de couvertures (drop 70 % / blitz 30 %) tirée de façon seedée ; la couverture réalisée pilote À LA FOIS le rendu défensif et la branche offensive lue, via une source unique (`effectiveScreenRule`).

**Architecture:** La couverture tirée (`state.rolledCoverage`) remplace `state.screenRule` comme base de `effectiveScreenRule` dans `defense/context.ts` quand le mode est actif. Comme `resolveScreenCoverage` lit cette même valeur, `selectReactiveBranch` (déjà câblé dans `recompileScenarioSteps`) sélectionne automatiquement la bonne branche. Tirage seedé reproductible + panneau stats.

**Tech Stack:** TypeScript strict, Vitest (TDD), RNG mulberry32 seedé. Touche `defense/context.ts` → Règle 1bis (1 point, gated).

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-lecture-probabiliste-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| 1 | `src/lib/types/index.ts` | 4 champs AppState |
| 1 | `src/lib/logic/rng.ts` | `mulberry32` (extraire, créer) |
| 1 | `src/lib/logic/match/calibration.ts` | pointer sur rng.ts |
| 1 | `src/lib/logic/reads/coverageRoll.ts` | helpers purs (créer) |
| 1 | `src/lib/logic/defense/context.ts` | base effectiveScreenRule |
| 1 | `src/lib/logic/__tests__/rng.test.ts`, `reads/__tests__/coverageRoll.test.ts`, `reads/__tests__/probabilisticIntegration.test.ts` | tests (créer) |
| 2 | `src/lib/state/transforms/scenarioTransforms.ts` | 3 transforms |
| 2 | `src/lib/state/transforms/__tests__/probabilisticReads.test.ts` | tests (créer) |
| 2 | `src/hooks/useAppState.ts` | callbacks |
| 2 | `src/app/page.tsx` | câblage props |
| 2 | `src/components/ScenarioPanel.tsx` | section UI |
| 3 | `CHANGELOG.md`, `ROADMAP.md`, `docs/todo-priorities.md`, plan Phase L | docs |

---

# CHANTIER 1 — Noyau (logique pure + 1 point défense)

## Task 1.1 — Types AppState

**Files:**
- Modify: `src/lib/types/index.ts` (près de `screenRule: ScreenRule;` ligne ~964, ou des flags opt-in)

- [ ] **Step 1: Ajouter les 4 champs** — après `resolvedReadBranchId?: string | null;` (ligne ~1314) :

```typescript
  /** Phase L proba — Master opt-in de la lecture probabiliste. Default
   *  undefined = legacy déterministe. */
  probabilisticReadsEnabled?: boolean;
  /** Tendance défensive niveau scénario : couvertures pondérées (poids relatifs,
   *  normalisés au tirage). */
  coverageDistribution?: { coverage: ScreenRule; weight: number }[];
  /** Seed du tirage courant (reproductibilité). Bumpé par « rejouer ». */
  coverageRollSeed?: number;
  /** Couverture réalisée par le dernier tirage. Lue par defense/context.ts pour
   *  piloter la défense + la branche. */
  rolledCoverage?: ScreenRule;
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 1.2 — Extraire `mulberry32` dans `rng.ts`

**Files:**
- Create: `src/lib/logic/rng.ts`
- Create: `src/lib/logic/__tests__/rng.test.ts`
- Modify: `src/lib/logic/match/calibration.ts`

- [ ] **Step 1: Écrire le test de parité** :

```typescript
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/logic/rng';

describe('mulberry32', () => {
  it('déterministe : même seed → même séquence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });
  it('valeurs dans [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('seeds différents → séquences différentes', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/rng.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Créer `rng.ts`** (copie exacte de l'impl de calibration pour parité) :

```typescript
// RNG seedé déterministe (mulberry32). Extrait de match/calibration.ts pour
// réutilisation (calibration Monte-Carlo, lecture probabiliste).

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/rng.test.ts` → 3 PASS.

- [ ] **Step 5: Pointer calibration sur rng.ts** — dans `calibration.ts`, supprimer la fonction privée `mulberry32` (lignes ~257-266) et ajouter en tête de fichier :

```typescript
import { mulberry32 } from '../rng';
```

- [ ] **Step 6: Suite calibration** : `npx vitest run calibration` → tous PASS (parité confirmée).

---

## Task 1.3 — Helper `rollCoverage` (tests d'abord)

**Files:**
- Create: `src/lib/logic/reads/__tests__/coverageRoll.test.ts`
- Create: `src/lib/logic/reads/coverageRoll.ts`

- [ ] **Step 1: Écrire les tests de `rollCoverage`** :

```typescript
import { describe, it, expect } from 'vitest';
import { rollCoverage } from '@/lib/logic/reads/coverageRoll';
import type { ScreenRule } from '@/lib/types';

const dist = [
  { coverage: 'drop' as ScreenRule, weight: 0.7 },
  { coverage: 'blitz' as ScreenRule, weight: 0.3 },
];

describe('rollCoverage', () => {
  it('déterministe : même seed → même couverture', () => {
    expect(rollCoverage(dist, 123)).toBe(rollCoverage(dist, 123));
  });

  it('distribution mono → toujours cette couverture', () => {
    const mono = [{ coverage: 'switch' as ScreenRule, weight: 1 }];
    for (let seed = 0; seed < 20; seed++) {
      expect(rollCoverage(mono, seed)).toBe('switch');
    }
  });

  it('distribution vide → null', () => {
    expect(rollCoverage([], 1)).toBeNull();
  });

  it('poids total ≤ 0 → null', () => {
    expect(rollCoverage([{ coverage: 'drop', weight: 0 }], 1)).toBeNull();
  });

  it('sur 2000 tirages seedés, fréquences ≈ poids (±5 %)', () => {
    let drop = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      if (rollCoverage(dist, seed) === 'drop') drop++;
    }
    const freq = drop / N;
    expect(freq).toBeGreaterThan(0.65);
    expect(freq).toBeLessThan(0.75);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/coverageRoll.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `rollCoverage` dans `coverageRoll.ts`** :

```typescript
// Phase L proba — tirage pondéré seedé de la couverture défensive + stats par
// branche. Purs.

import type { AppState, ScreenRule } from '../../types';
import { mulberry32 } from '../rng';

export interface CoverageWeight {
  coverage: ScreenRule;
  weight: number;
}

/** Tire une couverture selon les poids relatifs, de façon déterministe pour un
 *  seed donné. Distribution vide ou poids total ≤ 0 → null. */
export function rollCoverage(
  distribution: CoverageWeight[],
  seed: number,
): ScreenRule | null {
  if (distribution.length === 0) return null;
  const total = distribution.reduce((acc, d) => acc + Math.max(0, d.weight), 0);
  if (total <= 0) return null;
  const r = mulberry32(seed)() * total;
  let acc = 0;
  for (const d of distribution) {
    acc += Math.max(0, d.weight);
    if (r < acc) return d.coverage;
  }
  // Garde-fou flottant : retourne la dernière couverture valide.
  return distribution[distribution.length - 1].coverage;
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/coverageRoll.test.ts` → 5 PASS.

---

## Task 1.4 — Helper `coverageBranchStats` (tests d'abord)

**Files:**
- Modify: `src/lib/logic/reads/__tests__/coverageRoll.test.ts`
- Modify: `src/lib/logic/reads/coverageRoll.ts`

- [ ] **Step 1: Ajouter les tests** :

```typescript
import { coverageBranchStats } from '@/lib/logic/reads/coverageRoll';
import type { AppState, ScenarioBranch } from '@/lib/types';

function stateWithBranches(): AppState {
  const branchDrop: ScenarioBranch = {
    id: 'b-drop', label: 'Pull-up', divergeAfterActionId: 'a1',
    actions: [], trigger: { kind: 'screen-coverage', actionId: 'a1', coverage: ['drop'] },
  };
  const branchBlitz: ScenarioBranch = {
    id: 'b-blitz', label: 'Short roll', divergeAfterActionId: 'a1',
    actions: [], trigger: { kind: 'screen-coverage', actionId: 'a1', coverage: ['blitz'] },
  };
  return {
    scenarioBranches: [branchDrop, branchBlitz],
    coverageDistribution: [
      { coverage: 'drop', weight: 0.7 },
      { coverage: 'blitz', weight: 0.3 },
    ],
  } as unknown as AppState;
}

describe('coverageBranchStats', () => {
  it('mappe chaque couverture à sa branche + normalise les poids', () => {
    const stats = coverageBranchStats(stateWithBranches());
    expect(stats).toHaveLength(2);
    const drop = stats.find((s) => s.coverage === 'drop')!;
    expect(drop.branchId).toBe('b-drop');
    expect(drop.branchLabel).toBe('Pull-up');
    expect(drop.weight).toBeCloseTo(0.7, 5);
  });

  it('couverture sans branche → chemin principal', () => {
    const s = stateWithBranches();
    s.coverageDistribution = [{ coverage: 'over', weight: 1 }];
    const stats = coverageBranchStats(s);
    expect(stats[0].branchId).toBeNull();
    expect(stats[0].branchLabel).toBe('chemin principal');
    expect(stats[0].weight).toBeCloseTo(1, 5);
  });

  it('distribution absente → []', () => {
    expect(coverageBranchStats({} as AppState)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/coverageRoll.test.ts` → les nouveaux FAIL.

- [ ] **Step 3: Implémenter `coverageBranchStats`** — ajouter dans `coverageRoll.ts` :

```typescript
export interface CoverageBranchStat {
  coverage: ScreenRule;
  weight: number;          // normalisé (somme = 1)
  branchId: string | null; // null = chemin principal
  branchLabel: string;
}

/** Pour chaque couverture de la distribution, identifie la branche dont le
 *  trigger screen-coverage l'inclut. Agrège (la 1ʳᵉ branche matchante gagne,
 *  comme selectReactiveBranch). Normalise les poids. Pur. */
export function coverageBranchStats(state: AppState): CoverageBranchStat[] {
  const dist = state.coverageDistribution ?? [];
  if (dist.length === 0) return [];
  const branches = state.scenarioBranches ?? [];
  const total = dist.reduce((acc, d) => acc + Math.max(0, d.weight), 0) || 1;
  return dist.map((d) => {
    const branch = branches.find(
      (b) => b.trigger?.kind === 'screen-coverage' && b.trigger.coverage.includes(d.coverage),
    );
    return {
      coverage: d.coverage,
      weight: Math.max(0, d.weight) / total,
      branchId: branch?.id ?? null,
      branchLabel: branch?.label ?? 'chemin principal',
    };
  });
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/coverageRoll.test.ts` → tous PASS (8).

---

## Task 1.5 — Intégration défense (`effectiveScreenRule`)

**Files:**
- Modify: `src/lib/logic/defense/context.ts` (lignes ~183-187)

- [ ] **Step 1: Remplacer la base de `effectiveScreenRule`** — le bloc :

```typescript
  let effectiveScreenRule: ScreenRule = (() => {
    if (!screen) return state.screenRule;
    const nav = state.rules[screen.carrierDef]?.screenNav;
    return nav && nav !== 'auto' ? nav : state.screenRule;
  })();
```

devient :

```typescript
  // Phase L proba — quand le mode probabiliste est actif, la couverture TIRÉE
  // remplace la règle globale comme base (l'override par défenseur garde sa
  // précédence). Source unique : pilote À LA FOIS le rendu défensif et la
  // lecture offensive (resolveScreenCoverage lit ce même effectiveScreenRule).
  const baseRule: ScreenRule =
    state.probabilisticReadsEnabled && state.rolledCoverage
      ? state.rolledCoverage
      : state.screenRule;
  let effectiveScreenRule: ScreenRule = (() => {
    if (!screen) return baseRule;
    const nav = state.rules[screen.carrierDef]?.screenNav;
    return nav && nav !== 'auto' ? nav : baseRule;
  })();
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 1.6 — Test d'intégration

**Files:**
- Create: `src/lib/logic/reads/__tests__/probabilisticIntegration.test.ts`

- [ ] **Step 1: Écrire le test** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { buildDefenseFrameContext } from '@/lib/logic/defense/context';

/** PnR : O5 plaqué sur D1 (porteur O1). screenRule global = 'drop'. */
function makePnRState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: { ...s0.steps[0].off, O5: { x: 305, y: 380 } },
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
    ],
    screenRule: 'drop',
    ...overrides,
  };
}

describe('lecture probabiliste — intégration', () => {
  it('mode off → effectiveScreenRule = screenRule global (legacy)', () => {
    const { ctx } = buildDefenseFrameContext(makePnRState(), 0);
    expect(ctx.effectiveScreenRule).toBe('drop');
  });

  it('mode on + rolledCoverage=blitz → effectiveScreenRule=blitz (pilote la défense)', () => {
    const { ctx } = buildDefenseFrameContext(
      makePnRState({ probabilisticReadsEnabled: true, rolledCoverage: 'blitz' }),
      0,
    );
    expect(ctx.effectiveScreenRule).toBe('blitz');
  });

  it('mode on mais rolledCoverage absent → fallback screenRule global', () => {
    const { ctx } = buildDefenseFrameContext(
      makePnRState({ probabilisticReadsEnabled: true }),
      0,
    );
    expect(ctx.effectiveScreenRule).toBe('drop');
  });

  it("override par défenseur (screenNav) garde sa précédence sur rolledCoverage", () => {
    const s = makePnRState({ probabilisticReadsEnabled: true, rolledCoverage: 'blitz' });
    // D1 = défenseur du porteur O1 (matchup naturel). screenNav='switch' override.
    s.rules = { ...s.rules, D1: { ...s.rules.D1, screenNav: 'switch' } };
    const { ctx } = buildDefenseFrameContext(s, 0);
    expect(ctx.effectiveScreenRule).toBe('switch');
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/probabilisticIntegration.test.ts` → 4 PASS.

(Note : si le carrierDef n'est pas D1 dans ce setup, ajuster le test 4 au défenseur réel du porteur — vérifier via `ctx.screen.carrierDef` au besoin.)

---

## Task 1.7 — Règle 1bis + commit + push

- [ ] **Step 1: Suite Règle 1bis** : `npx vitest run screens overlap userJson screenLab` → tous PASS.

- [ ] **Step 2: Suite complète** : `npx vitest run` → 1959+ PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/rng.ts \
        src/lib/logic/match/calibration.ts \
        src/lib/logic/reads/coverageRoll.ts \
        src/lib/logic/defense/context.ts \
        src/lib/logic/__tests__/rng.test.ts \
        src/lib/logic/reads/__tests__/coverageRoll.test.ts \
        src/lib/logic/reads/__tests__/probabilisticIntegration.test.ts
git commit -m "feat(reads): lecture probabiliste — noyau (rollCoverage + effectiveScreenRule)"
```

- [ ] **Step 4: Push** : `git push`

---

# CHANTIER 2 — Transforms + UI

## Task 2.1 — Transforms (tests d'abord)

**Files:**
- Create: `src/lib/state/transforms/__tests__/probabilisticReads.test.ts`
- Modify: `src/lib/state/transforms/scenarioTransforms.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import {
  toggleProbabilisticReads,
  setCoverageDistribution,
  rerollCoverage,
} from '@/lib/state/transforms/scenarioTransforms';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    scriptedActions: [],
    coverageDistribution: [
      { coverage: 'drop', weight: 0.7 },
      { coverage: 'blitz', weight: 0.3 },
    ],
    coverageRollSeed: 0,
  };
}

describe('transforms lecture probabiliste', () => {
  it('toggle on/off', () => {
    const on = toggleProbabilisticReads(base(), true);
    expect(on.probabilisticReadsEnabled).toBe(true);
    const off = toggleProbabilisticReads(on, false);
    expect(off.probabilisticReadsEnabled).toBe(false);
  });

  it('setCoverageDistribution pose la distribution + tire une rolledCoverage ∈ dist', () => {
    const s = setCoverageDistribution(
      { ...base(), probabilisticReadsEnabled: true },
      [{ coverage: 'switch', weight: 1 }],
    );
    expect(s.coverageDistribution).toEqual([{ coverage: 'switch', weight: 1 }]);
    expect(s.rolledCoverage).toBe('switch');
  });

  it('rerollCoverage bump le seed et recompute rolledCoverage de façon déterministe', () => {
    const s0 = { ...base(), probabilisticReadsEnabled: true };
    const s1 = rerollCoverage(s0);
    expect(s1.coverageRollSeed).toBe((s0.coverageRollSeed ?? 0) + 1);
    expect(['drop', 'blitz']).toContain(s1.rolledCoverage);
    // Reproductible : repartir du même état → même résultat.
    const s1bis = rerollCoverage(s0);
    expect(s1bis.rolledCoverage).toBe(s1.rolledCoverage);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/probabilisticReads.test.ts` → FAIL.

- [ ] **Step 3: Implémenter les transforms** — ajouter dans `scenarioTransforms.ts` (import en tête : `import { rollCoverage, type CoverageWeight } from '@/lib/logic/reads/coverageRoll';`) :

```typescript
export function toggleProbabilisticReads(s: AppState, enabled: boolean): AppState {
  return recompileScenarioSteps({ ...s, probabilisticReadsEnabled: enabled });
}

export function setCoverageDistribution(s: AppState, dist: CoverageWeight[]): AppState {
  const seed = s.coverageRollSeed ?? 0;
  const rolled = rollCoverage(dist, seed) ?? undefined;
  return recompileScenarioSteps({
    ...s,
    coverageDistribution: dist,
    rolledCoverage: rolled,
  });
}

export function rerollCoverage(s: AppState): AppState {
  const seed = (s.coverageRollSeed ?? 0) + 1;
  const rolled = rollCoverage(s.coverageDistribution ?? [], seed) ?? undefined;
  return recompileScenarioSteps({
    ...s,
    coverageRollSeed: seed,
    rolledCoverage: rolled,
  });
}
```

(`CoverageWeight` est `{ coverage: ScreenRule; weight: number }`, exporté par coverageRoll.ts au Task 1.3.)

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/probabilisticReads.test.ts` → 3 PASS.

- [ ] **Step 5: Suite complète** : `npx vitest run` → tous PASS.

---

## Task 2.2 — Callbacks useAppState

**Files:**
- Modify: `src/hooks/useAppState.ts`

- [ ] **Step 1: Ajouter les callbacks** — près des callbacks de branches (`addScenarioBranches`, ligne ~613) :

```typescript
  const toggleProbabilisticReads = useCallback((enabled: boolean) => {
    setStateWithHistory((s) => scenarioTx.toggleProbabilisticReads(s, enabled));
  }, [setStateWithHistory]);

  const setCoverageDistribution = useCallback(
    (dist: { coverage: import('@/lib/types').ScreenRule; weight: number }[]) => {
      setStateWithHistory((s) => scenarioTx.setCoverageDistribution(s, dist));
    },
    [setStateWithHistory],
  );

  const rerollCoverage = useCallback(() => {
    setStateWithHistory((s) => scenarioTx.rerollCoverage(s));
  }, [setStateWithHistory]);
```

- [ ] **Step 2: Exporter** — dans l'objet retourné (près de `addScenarioBranches,`) :

```typescript
    toggleProbabilisticReads,
    setCoverageDistribution,
    rerollCoverage,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 2.3 — Câblage page.tsx + props ScenarioPanel

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ScenarioPanel.tsx` (interface props)

- [ ] **Step 1: Props dans l'interface ScenarioPanel** — près de `onAddBranches` (ligne ~70) :

```typescript
  probabilisticReadsEnabled?: boolean;
  coverageDistribution?: { coverage: ScreenRule; weight: number }[];
  rolledCoverage?: ScreenRule;
  onToggleProbabilisticReads: (enabled: boolean) => void;
  onSetCoverageDistribution: (dist: { coverage: ScreenRule; weight: number }[]) => void;
  onRerollCoverage: () => void;
```

(Vérifier que `ScreenRule` est importé dans ScenarioPanel.tsx — sinon l'ajouter à l'import `@/lib/types`.)

- [ ] **Step 2: Câbler dans page.tsx** — où `<ScenarioPanel>` reçoit ses props (près de `onAddBranches={app.addScenarioBranches}`) :

```typescript
                    probabilisticReadsEnabled={app.state.probabilisticReadsEnabled}
                    coverageDistribution={app.state.coverageDistribution}
                    rolledCoverage={app.state.rolledCoverage}
                    onToggleProbabilisticReads={app.toggleProbabilisticReads}
                    onSetCoverageDistribution={app.setCoverageDistribution}
                    onRerollCoverage={app.rerollCoverage}
```

(Vérifier le nom exact de l'accès au state : `app.state` — cf. comment les autres props lisent le state dans page.tsx.)

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → erreurs attendues tant que l'UI (Task 2.4) n'utilise pas les props ; passer au Task 2.4 puis re-checker.

---

## Task 2.4 — Section UI ScenarioPanel

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

- [ ] **Step 1: Importer le helper stats** — en tête :

```typescript
import { coverageBranchStats } from '@/lib/logic/reads/coverageRoll';
```

- [ ] **Step 2: Calculer les stats + couvertures candidates** — dans le composant, après `const activeBranch = ...` (ligne ~118) :

```typescript
  // Phase L proba — couvertures lisibles = celles présentes dans les triggers
  // screen-coverage des branches.
  const readableCoverages = Array.from(
    new Set(
      props.scenarioBranches
        .filter((b) => b.trigger?.kind === 'screen-coverage')
        .flatMap((b) => (b.trigger?.kind === 'screen-coverage' ? b.trigger.coverage : [])),
    ),
  );
  const hasReactiveScreenBranches = readableCoverages.length > 0;
  const stats = coverageBranchStats({
    coverageDistribution: props.coverageDistribution,
    scenarioBranches: props.scenarioBranches,
  } as Parameters<typeof coverageBranchStats>[0]);
  const dist = props.coverageDistribution ?? [];
```

- [ ] **Step 3: Rendre la section** — après le badge « Lecture auto » (vers ligne 241, après le bloc `resolvedReadBranchId`), insérer :

```tsx
      {hasReactiveScreenBranches && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!props.probabilisticReadsEnabled}
              onChange={(e) => props.onToggleProbabilisticReads(e.target.checked)}
            />
            🎲 Lecture probabiliste (tendances défensives)
          </label>

          {props.probabilisticReadsEnabled && (
            <div style={{ marginTop: 8 }}>
              {/* Éditeur de distribution */}
              {dist.map((d, di) => (
                <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <select
                    value={d.coverage}
                    onChange={(e) => {
                      const next = dist.map((x, j) =>
                        j === di ? { ...x, coverage: e.target.value as ScreenRule } : x,
                      );
                      props.onSetCoverageDistribution(next);
                    }}
                    style={{ fontSize: 11 }}
                  >
                    {readableCoverages.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={0} max={100} step={5}
                    value={Math.round(d.weight * 100)}
                    onChange={(e) => {
                      const w = Math.max(0, parseInt(e.target.value) || 0) / 100;
                      const next = dist.map((x, j) => (j === di ? { ...x, weight: w } : x));
                      props.onSetCoverageDistribution(next);
                    }}
                    style={{ width: 56, fontSize: 11 }}
                  />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>%</span>
                  <button
                    onClick={() => props.onSetCoverageDistribution(dist.filter((_, j) => j !== di))}
                    style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                    title="Retirer cette couverture"
                  >×</button>
                </div>
              ))}
              <button
                onClick={() => {
                  const used = new Set(dist.map((d) => d.coverage));
                  const next = readableCoverages.find((c) => !used.has(c));
                  if (next) props.onSetCoverageDistribution([...dist, { coverage: next, weight: 0.5 }]);
                }}
                style={{ fontSize: 10, padding: '2px 6px', border: '1px solid #94a3b8', borderRadius: 3, background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
              >+ couverture</button>

              {/* Bouton rejouer + couverture réalisée */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => props.onRerollCoverage()}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}
                >🎲 rejouer la défense</button>
                {props.rolledCoverage && (
                  <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                    réalisé : <strong style={{ textTransform: 'uppercase' }}>{props.rolledCoverage}</strong>
                  </span>
                )}
              </div>

              {/* Panneau stats */}
              <div style={{ marginTop: 8 }}>
                {stats.map((s, si) => (
                  <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginBottom: 2 }}>
                    <span style={{ minWidth: 48, color: '#94a3b8', textTransform: 'uppercase' }}>{s.coverage}</span>
                    <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(s.weight * 100)}%`, height: '100%', background: '#6366f1' }} />
                    </div>
                    <span style={{ minWidth: 80, color: '#cbd5e1' }}>{Math.round(s.weight * 100)}% {s.branchLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 5: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 6: Vérif visuelle** : `preview_start`, `preview_console_logs level=error` → zéro erreur. (La section n'apparaît qu'avec des branches réactives screen-coverage ; vérif fonctionnelle couverte par les tests.)

---

## Task 2.5 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/lib/state/transforms/scenarioTransforms.ts \
        src/lib/state/transforms/__tests__/probabilisticReads.test.ts \
        src/hooks/useAppState.ts \
        src/app/page.tsx \
        src/components/ScenarioPanel.tsx
git commit -m "feat(reads): lecture probabiliste — transforms + UI ScenarioPanel"
```

- [ ] **Step 2: Push** : `git push`

---

# CHANTIER 3 — Docs

## Task 3.1 — Sync

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `docs/todo-priorities.md`, `docs/superpowers/plans/2026-05-29-offense-lecture-reactive.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, en tête :

```markdown
### Phase L — Lecture probabiliste (2026-06-02)

La défense joue une distribution de couvertures (drop 70 % / blitz 30 %) tirée de
façon seedée. La couverture réalisée (`rolledCoverage`) remplace la base de
`effectiveScreenRule` → pilote À LA FOIS le rendu défensif ET la branche lue
(source unique). Helpers `rollCoverage` / `coverageBranchStats`, `mulberry32`
extrait dans `rng.ts`. UI ScenarioPanel : éditeur de distribution, bouton 🎲
rejouer, panneau stats. Opt-in `probabilisticReadsEnabled`. ~16 tests.
```

- [ ] **Step 2: Plan Phase L** — dans `docs/superpowers/plans/2026-05-29-offense-lecture-reactive.md` § « Restant (hors L.3) », cocher **Lecture probabiliste** comme livrée 2026-06-02.

- [ ] **Step 3: ROADMAP** — dans le bloc « Offense en lecture réactive », retirer « Lecture probabiliste » des extensions restantes (livrée).

- [ ] **Step 4: todo-priorities** — ajouter la lecture probabiliste à la section « Livrés 2026-06-02 ».

- [ ] **Step 5: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md docs/todo-priorities.md docs/superpowers/plans/2026-05-29-offense-lecture-reactive.md
git commit -m "docs: lecture probabiliste livrée (extension Phase L)"
git push
```

---

## Notes d'exécution

- **Règle 1bis** : seul Task 1.5 touche `defense/context.ts`. Lancer
  `screens overlap userJson screenLab` avant le commit du chantier 1.
- **Rétrocompat** : `probabilisticReadsEnabled` off → `baseRule === state.screenRule`,
  comportement identique. `recompileScenarioSteps` inchangé (lit déjà via
  `selectReactiveBranch` → `resolveScreenCoverage` → `effectiveScreenRule`).
- **Naming** : helper pur `rollCoverage(dist, seed)` vs transform `rerollCoverage(state)`
  — distincts, pas de collision.
- **Suite de référence** : 1959 verte au départ. Cible ~1975 (+16).
- **Hors scope** : arbres multi-niveaux, distribution par-read, Monte-Carlo animé.
