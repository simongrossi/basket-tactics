# Phase 3 — Défense scriptable MVP — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le mode scénario avec 4 actions défensives scriptables (`help-and-recover`, `pre-switch`, `trap`, `tag`) couplables aux actions offensives existantes.

**Architecture:** Union discriminée `ScriptedAction = OffensiveScriptedAction | DefensiveScriptedAction` (couplage par `parentActionId`). `compileScenario` passe 2 phases : compile offense → expand defensive directives sur `Step.defensiveDirectives` + `Step.assignmentOverrides`. Engine applique les directives en surcharge additive après le calcul standard.

**Tech Stack:** TypeScript, Next.js, React, Vitest. Code existant dans `src/lib/types/`, `src/lib/logic/`, `src/lib/data/`, `src/components/`.

**Spec source:** [`docs/superpowers/specs/2026-05-09-defense-scriptable-mvp-design.md`](../specs/2026-05-09-defense-scriptable-mvp-design.md)

---

## Notes pour l'implémenteur

**Conventions du codebase :**
- Tests : `vitest run` (script `npm test`).
- Géométrie : `HOOP = {x:300, y:75}`, baseline y ≈ 20, top of key y ≈ 300, panneau x ∈ [0,600] y ∈ [0,400]. Côté fort/faible déterminé par `carrier.x - 300`.
- Le champ `Step.generatedBy: string` (et non `scenarioActionId`) trace l'action source — c'est ce qu'on utilise pour le couplage.
- Les générateurs offensifs vivent dans `src/lib/logic/scriptedGenerators.ts` (un fichier monolithique malgré le commentaire "vit dans /scriptedGenerators/<type>.ts").
- L'app exécute des hooks (Player.tsx Bezier des bras, anatomie) FIGÉS — ne pas modifier les rendus joueurs.

**Commit + push systématique** : après chaque tâche complétée, commit puis `git push`. Indispensable car le user a un `npm run dev` actif.

---

## Task 1 : Types & migration

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/hooks/useAppState.ts` (migration au load)
- Test: `src/lib/logic/__tests__/scriptedActionMigration.test.ts` (créer)

**Objectif :** introduire l'union discriminée `kind` sur `ScriptedAction`, ajouter `DefensiveScriptedAction` / `DefensiveDirective` / `Step.defensiveDirectives` / `Step.assignmentOverrides`. Migration transparente des scénarios existants.

- [ ] **Step 1.1 : Écrire le test de migration**

Créer `src/lib/logic/__tests__/scriptedActionMigration.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';

describe('migrateScriptedActions', () => {
  it('ajoute kind:offensive aux actions sans kind (legacy v0.7)', () => {
    const legacy: any[] = [
      { id: 'a1', type: 'pick-and-roll', params: { ballHandler: 'O1', screener: 'O5' } },
    ];
    const migrated = migrateScriptedActions(legacy);
    expect(migrated[0].kind).toBe('offensive');
    expect(migrated[0].id).toBe('a1');
    expect(migrated[0].type).toBe('pick-and-roll');
  });

  it("préserve kind:offensive existant", () => {
    const fresh: any[] = [
      { kind: 'offensive', id: 'a1', type: 'drive', params: { driver: 'O1' } },
    ];
    const migrated = migrateScriptedActions(fresh);
    expect(migrated[0].kind).toBe('offensive');
  });

  it("préserve kind:defensive existant", () => {
    const fresh: any[] = [
      { kind: 'defensive', id: 'd1', type: 'trap', parentActionId: 'a1', params: { defenders: ['D1','D5'], target: 'O1' } },
    ];
    const migrated = migrateScriptedActions(fresh);
    expect(migrated[0].kind).toBe('defensive');
  });
});
```

- [ ] **Step 1.2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/logic/__tests__/scriptedActionMigration.test.ts`
Expected: FAIL — module `scriptedActionMigration` introuvable.

- [ ] **Step 1.3 : Étendre les types dans `src/lib/types/index.ts`**

Localiser le bloc actuel (lignes ~80-129) et le **remplacer** par :

```ts
export type ScriptedActionType =
  | 'pick-and-roll'
  | 'pick-and-pop'
  | 'hand-off'
  | 'give-and-go'
  | 'basket-cut'
  | 'backdoor-cut'
  | 'flare-cut'
  | 'curl-cut'
  | 'shuffle-cut'
  | 'pin-down'
  | 'flare-screen'
  | 'back-screen'
  | 'cross-screen'
  | 'screen-the-screener'
  | 'drive'
  | 'pass'
  | 'kick-out'
  | 'shoot'
  | 'isolation';

export type ActionSide = 'fort' | 'faible' | 'axe';
export type DriveDirection = 'panier' | 'baseline' | 'middle';

export interface ScriptedActionParams {
  ballHandler?: AttackerId;
  screener?: AttackerId;
  cutter?: AttackerId;
  passer?: AttackerId;
  receiver?: AttackerId;
  giver?: AttackerId;
  driver?: AttackerId;
  shooter?: AttackerId;
  from?: AttackerId;
  to?: AttackerId;
  firstScreener?: AttackerId;
  secondScreener?: AttackerId;
  side?: ActionSide;
  direction?: DriveDirection;
}

export interface OffensiveScriptedAction {
  kind: 'offensive';
  id: string;
  type: ScriptedActionType;
  params: ScriptedActionParams;
  label?: string;
}

export type DefensiveActionType =
  | 'help-and-recover'
  | 'pre-switch'
  | 'trap'
  | 'tag';

export interface DefensiveActionParams {
  /** Défenseur(s) qui exécutent la directive. */
  defenders: DefenderId[];
  /** Attaquant ciblé (porteur trappé, cutter jammé, roller taggé...). */
  target?: AttackerId;
  /** Pour pre-switch uniquement : 2e défenseur qui échange. */
  swapWith?: DefenderId;
  /** Pour help-and-recover : steps de chaque phase. */
  helpStep?: number;
  recoverStep?: number;
}

export interface DefensiveScriptedAction {
  kind: 'defensive';
  id: string;
  type: DefensiveActionType;
  /** Si défini → couplée à une action offensive existante. Sinon → libre. */
  parentActionId?: string;
  /** Steps ciblés. Pour couplée, défaut = tous les steps du parent.
   *  Pour libre, requis (indices absolus dans la liste compilée). */
  affectedSteps?: number[];
  params: DefensiveActionParams;
  label?: string;
}

export type ScriptedAction = OffensiveScriptedAction | DefensiveScriptedAction;

export interface DefensiveDirective {
  type: DefensiveActionType;
  defenders: DefenderId[];
  target?: AttackerId;
  swapWith?: DefenderId;
  /** 'engage' = action active, 'release' = retour à la position standard. */
  phase: 'engage' | 'release';
  /** ID de l'action source (debug + UI traçabilité). */
  sourceActionId: string;
}
```

Puis dans l'interface `Step` (ligne ~52), ajouter avant la fermeture `}` :

```ts
  /** Directives défensives pour ce step (Phase 3 défense scriptable).
   *  Posées par compileScenario, consommées par engine.applyDirective. */
  defensiveDirectives?: DefensiveDirective[];
  /** Overrides d'assignation défenseur → attaquant pour ce step.
   *  Posé par compileScenario quand un `pre-switch` swappe deux défenseurs ;
   *  propagé sur tous les steps suivants du parent. */
  assignmentOverrides?: Partial<Record<DefenderId, AttackerId>>;
```

- [ ] **Step 1.4 : Créer `src/lib/logic/scriptedActionMigration.ts`**

```ts
import type { ScriptedAction } from '@/lib/types';

/** Migre les ScriptedAction legacy (v0.7, sans kind) vers la forme v0.8.
 *  Toute action sans champ `kind` est traitée comme offensive (avant Phase 3,
 *  seules les actions offensives existaient). */
export function migrateScriptedActions(actions: unknown[]): ScriptedAction[] {
  return actions.map((raw) => {
    const a = raw as Partial<ScriptedAction> & Record<string, unknown>;
    if (a.kind === 'offensive' || a.kind === 'defensive') {
      return a as ScriptedAction;
    }
    return { ...a, kind: 'offensive' } as ScriptedAction;
  });
}
```

- [ ] **Step 1.5 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/logic/__tests__/scriptedActionMigration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 1.6 : Câbler la migration dans `useAppState.ts`**

Localiser le chargement des `scriptedActions` (chercher `scriptedActions:` dans `src/hooks/useAppState.ts`). À l'endroit où l'état est restauré depuis le storage / template / initial, wrapper la liste avec `migrateScriptedActions(...)`.

Run: `grep -n "scriptedActions" src/hooks/useAppState.ts | head -20` pour repérer les sites.

Ajouter en haut du fichier :
```ts
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';
```

À chaque site où une liste de scripted actions arrive depuis l'extérieur (load template, load storage), appliquer `migrateScriptedActions(list)` avant assignation au state.

- [ ] **Step 1.7 : Compiler et corriger les erreurs TypeScript**

Run: `npx tsc --noEmit`
Expected: erreurs sur tous les sites qui font `action.type` sans vérifier `action.kind`. Les corriger en filtrant : `actions.filter((a): a is OffensiveScriptedAction => a.kind === 'offensive')` quand on veut seulement les offensives.

Sites probables (à vérifier via grep) :
- `src/components/ScenarioPanel.tsx` — affichage liste, modifier pour filtrer kind='offensive' dans cette task (zone défensive sera ajoutée Task 6)
- `src/components/ScenarioReader.tsx` — lecture FR
- `src/lib/logic/compileScenario.ts` — sera réécrit Task 3 mais corriger temporairement
- `src/lib/data/initial.ts` — `scriptedActions: []` ou ajouter `kind: 'offensive'` aux entrées

Pour cette task on filtre simplement : la défense ne sera pas encore visible mais le type vérifie.

Dans `compileScenario.ts` ligne 49-50, remplacer :
```ts
for (const action of actions) {
  const gen = SCRIPTED_GENERATORS[action.type];
```
par :
```ts
for (const action of actions) {
  if (action.kind !== 'offensive') continue;
  const gen = SCRIPTED_GENERATORS[action.type];
```

Run: `npx tsc --noEmit` — doit passer sans erreur.

- [ ] **Step 1.8 : Tests existants doivent toujours passer**

Run: `npx vitest run`
Expected: PASS sur l'ensemble. Si scriptedGenerators.test.ts échoue à cause des fixtures sans `kind`, ajouter `kind: 'offensive'` aux fixtures ou les wrapper dans `migrateScriptedActions(...)`.

- [ ] **Step 1.9 : Commit + push**

```bash
git add src/lib/types/index.ts src/lib/logic/scriptedActionMigration.ts src/lib/logic/__tests__/scriptedActionMigration.test.ts src/hooks/useAppState.ts src/lib/logic/compileScenario.ts src/lib/data/initial.ts src/components/ScenarioPanel.tsx src/components/ScenarioReader.tsx
git commit -m "feat(types): ScriptedAction devient union discriminée kind=offensive|defensive

Ajoute DefensiveScriptedAction, DefensiveDirective, Step.defensiveDirectives,
Step.assignmentOverrides. Migration legacy v0.7 → v0.8 transparente.

Phase 3 défense scriptable — étape 1/8."
git push
```

---

## Task 2 : Catalogue défensif

**Files:**
- Create: `src/lib/data/defensiveActionsCatalog.ts`
- Test: `src/lib/data/__tests__/defensiveActionsCatalog.test.ts` (créer)

**Objectif :** déclarer le catalogue des 4 actions défensives MVP avec leurs metadata UI (label, description, params requis, reader FR).

- [ ] **Step 2.1 : Écrire le test du catalogue**

Créer `src/lib/data/__tests__/defensiveActionsCatalog.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';

describe('DEFENSIVE_ACTIONS_CATALOG', () => {
  it('contient les 4 actions MVP', () => {
    expect(ALL_DEFENSIVE_ACTION_TYPES).toEqual(
      expect.arrayContaining(['help-and-recover', 'pre-switch', 'trap', 'tag'])
    );
    expect(ALL_DEFENSIVE_ACTION_TYPES).toHaveLength(4);
  });

  it('chaque action a un reader FR fonctionnel', () => {
    const trap = DEFENSIVE_ACTIONS_CATALOG.trap;
    expect(trap.reader({ defenders: ['D1', 'D5'], target: 'O1' }))
      .toContain('D1');
  });

  it('trap requiert defenders + target', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG.trap.requiredParams).toContain('defenders');
    expect(DEFENSIVE_ACTIONS_CATALOG.trap.requiredParams).toContain('target');
  });

  it('pre-switch requiert swapWith', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG['pre-switch'].requiredParams).toContain('swapWith');
  });
});
```

- [ ] **Step 2.2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/data/__tests__/defensiveActionsCatalog.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 2.3 : Créer le catalogue**

Créer `src/lib/data/defensiveActionsCatalog.ts` :

```ts
// Catalogue des actions défensives Phase 3 MVP.
// Source : "FIBA Europe — Terminologie du Basketball" + design Phase 3.
// Le code de génération des directives vit dans /lib/logic/compileScenario.ts
// (passe 2). L'application moteur vit dans /lib/logic/applyDirective.ts.

import type { DefensiveActionType, DefensiveActionParams } from '@/lib/types';

export type DefensiveParamKind =
  | 'defenders' | 'target' | 'swapWith' | 'helpStep' | 'recoverStep';

export interface DefensiveActionDefinition {
  type: DefensiveActionType;
  label: string;
  fibaTerm: string;
  description: string;
  category: 'aide' | 'switch' | 'trap' | 'rotation';
  requiredParams: DefensiveParamKind[];
  optionalParams?: DefensiveParamKind[];
  /** Lecture FR de la directive. */
  reader: (p: DefensiveActionParams) => string;
}

const fmtList = (ids: string[] | undefined) => (ids && ids.length ? ids.join('+') : '?');

export const DEFENSIVE_ACTIONS_CATALOG: Record<DefensiveActionType, DefensiveActionDefinition> = {
  'help-and-recover': {
    type: 'help-and-recover',
    label: 'Help & recover',
    fibaTerm: 'Help and recover',
    description: 'Un défenseur quitte son homme pour aider sur drive, puis rentre en closeout.',
    category: 'aide',
    requiredParams: ['defenders', 'target'],
    optionalParams: ['helpStep', 'recoverStep'],
    reader: (p) => `${fmtList(p.defenders)} aide sur ${p.target ?? '?'} puis recover.`,
  },
  'pre-switch': {
    type: 'pre-switch',
    label: 'Pre-switch',
    fibaTerm: 'Pre-switch',
    description: '2 défenseurs anticipent l\'écran et échangent leurs hommes avant l\'engagement.',
    category: 'switch',
    requiredParams: ['defenders', 'swapWith'],
    reader: (p) => `${fmtList(p.defenders)} et ${p.swapWith ?? '?'} échangent en anticipation.`,
  },
  trap: {
    type: 'trap',
    label: 'Trap',
    fibaTerm: 'Trap / Double-team',
    description: '2 défenseurs forment un V agressif sur le porteur.',
    category: 'trap',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} trappent ${p.target ?? '?'}.`,
  },
  tag: {
    type: 'tag',
    label: 'Tag',
    fibaTerm: 'Tag (low-man bump)',
    description: 'Un low-man bumpe temporairement le roller, puis rentre en closeout.',
    category: 'rotation',
    requiredParams: ['defenders', 'target'],
    reader: (p) => `${fmtList(p.defenders)} tag ${p.target ?? '?'} (roller).`,
  },
};

export const ALL_DEFENSIVE_ACTION_TYPES: DefensiveActionType[] =
  Object.keys(DEFENSIVE_ACTIONS_CATALOG) as DefensiveActionType[];
```

- [ ] **Step 2.4 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/data/__tests__/defensiveActionsCatalog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 2.5 : Commit + push**

```bash
git add src/lib/data/defensiveActionsCatalog.ts src/lib/data/__tests__/defensiveActionsCatalog.test.ts
git commit -m "feat(catalog): catalogue défensif (help-and-recover, pre-switch, trap, tag)

Phase 3 défense scriptable — étape 2/8."
git push
```

---

## Task 3 : Compilation passe 2 (resolveTargetSteps + expandToDirectives)

**Files:**
- Create: `src/lib/logic/defensiveCompilation.ts`
- Modify: `src/lib/logic/compileScenario.ts`
- Test: `src/lib/logic/__tests__/defensiveCompilation.test.ts` (créer)

**Objectif :** ajouter la passe 2 du compilateur qui résout `DefensiveScriptedAction[]` en `Step.defensiveDirectives` + `Step.assignmentOverrides`.

- [ ] **Step 3.1 : Écrire le test de `resolveTargetSteps`**

Créer `src/lib/logic/__tests__/defensiveCompilation.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { resolveTargetSteps, expandToDirectives, applyDefensivePass } from '@/lib/logic/defensiveCompilation';
import type { DefensiveScriptedAction, Step } from '@/lib/types';

const stepWithGen = (idx: number, gen: string): Step => ({
  off: { O1: { x: 0, y: 0 }, O2: { x: 0, y: 0 }, O3: { x: 0, y: 0 }, O4: { x: 0, y: 0 }, O5: { x: 0, y: 0 } },
  ballCarrier: 'O1',
  annotations: [],
  generatedBy: gen,
  label: `step-${idx}`,
});

describe('resolveTargetSteps', () => {
  const steps: Step[] = [
    { ...stepWithGen(0, ''), label: 'Départ' },
    stepWithGen(1, 'A'),
    stepWithGen(2, 'A'),
    stepWithGen(3, 'A'),
    stepWithGen(4, 'B'),
  ];

  it("couplée sans affectedSteps → tous les steps du parent", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([1, 2, 3]);
  });

  it("couplée avec affectedSteps → filtre relatif au parent (indices 0-based dans le parent)", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      affectedSteps: [1, 2],
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([2, 3]);
  });

  it("libre → indices absolus", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      affectedSteps: [2, 4],
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([2, 4]);
  });

  it("parent inexistant → liste vide + warning console", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'INEXISTANT',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([]);
  });
});

describe('expandToDirectives', () => {
  it("trap : 1 directive engage par step ciblé", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    const result = expandToDirectives(def, [2, 3]);
    expect(result).toHaveLength(2);
    expect(result[0].directive).toMatchObject({ type: 'trap', phase: 'engage', sourceActionId: 'd1' });
    expect(result[0].stepIndex).toBe(2);
  });

  it("help-and-recover : 1 engage + 1 release", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'help-and-recover',
      parentActionId: 'A',
      params: { defenders: ['D2'], target: 'O1', helpStep: 1, recoverStep: 2 },
    };
    const result = expandToDirectives(def, [1, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stepIndex: 1, directive: { phase: 'engage' } });
    expect(result[1]).toMatchObject({ stepIndex: 2, directive: { phase: 'release' } });
  });

  it("tag : 1 directive engage", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'tag',
      parentActionId: 'A',
      params: { defenders: ['D4'], target: 'O5' },
    };
    const result = expandToDirectives(def, [3]);
    expect(result).toHaveLength(1);
    expect(result[0].directive.phase).toBe('engage');
  });

  it("pre-switch : 1 engage uniquement (assignmentOverrides géré par applyDefensivePass)", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'pre-switch',
      parentActionId: 'A',
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    const result = expandToDirectives(def, [1]);
    expect(result).toHaveLength(1);
    expect(result[0].directive.phase).toBe('engage');
  });
});

describe('applyDefensivePass', () => {
  it("ajoute defensiveDirectives aux steps ciblés", () => {
    const steps: Step[] = [
      { ...stepWithGen(0, ''), label: 'Départ' },
      stepWithGen(1, 'A'),
      stepWithGen(2, 'A'),
    ];
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    applyDefensivePass(steps, [def], { 'A': { startIndex: 1, endIndex: 2 } });
    expect(steps[1].defensiveDirectives).toHaveLength(1);
    expect(steps[2].defensiveDirectives).toHaveLength(1);
    expect(steps[0].defensiveDirectives).toBeUndefined();
  });

  it("pre-switch : pose assignmentOverrides sur engage step + tous les suivants du parent", () => {
    const steps: Step[] = [
      { ...stepWithGen(0, ''), label: 'Départ' },
      stepWithGen(1, 'A'),
      stepWithGen(2, 'A'),
      stepWithGen(3, 'A'),
    ];
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'pre-switch',
      parentActionId: 'A',
      affectedSteps: [0],
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    // assignations actuelles : D1→O1, D5→O5 (par convention numérique)
    applyDefensivePass(steps, [def], { 'A': { startIndex: 1, endIndex: 3 } });
    expect(steps[1].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    expect(steps[2].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    expect(steps[3].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
  });
});
```

- [ ] **Step 3.2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/logic/__tests__/defensiveCompilation.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3.3 : Implémenter `defensiveCompilation.ts`**

Créer `src/lib/logic/defensiveCompilation.ts` :

```ts
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
    case 'pre-switch': {
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
            phase: 'engage',
            sourceActionId: def.id,
          },
        });
      }
      break;
    }
    case 'help-and-recover': {
      // helpStep + recoverStep peuvent être des indices absolus (libre)
      // ou des indices relatifs au parent (couplée). Si non fournis, on
      // utilise targetStepIndices[0] et targetStepIndices[1] respectivement.
      const helpIdx = def.params.helpStep ?? targetStepIndices[0];
      const recoverIdx = def.params.recoverStep ?? targetStepIndices[1] ?? targetStepIndices[0] + 1;
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
```

- [ ] **Step 3.4 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/logic/__tests__/defensiveCompilation.test.ts`
Expected: PASS (toutes les assertions).

- [ ] **Step 3.5 : Intégrer la passe 2 dans `compileScenario.ts`**

Modifier `src/lib/logic/compileScenario.ts` — remplacer le corps de `compileScenario` par :

```ts
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

  // Index manualOverride
  const manualByAction = new Map<string, Map<number, Step>>();
  const subIndexCounter = new Map<string, number>();
  for (const s of existingSteps) {
    if (!s.generatedBy) continue;
    const cur = subIndexCounter.get(s.generatedBy) ?? 0;
    if (s.manualOverride) {
      let m = manualByAction.get(s.generatedBy);
      if (!m) { m = new Map(); manualByAction.set(s.generatedBy, m); }
      m.set(cur, s);
    }
    subIndexCounter.set(s.generatedBy, cur + 1);
  }

  // Passe 1 — actions offensives
  const parentRanges: Record<string, { startIndex: number; endIndex: number }> = {};
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
    (a): a is import('@/lib/types').DefensiveScriptedAction => a.kind === 'defensive',
  );
  if (defensives.length > 0) {
    applyDefensivePass(result, defensives, parentRanges);
  }

  return result;
}
```

Ajouter en haut du fichier l'import :
```ts
import { applyDefensivePass } from './defensiveCompilation';
```

Et adapter la signature côté générateur — `gen(prev, action)` reçoit `OffensiveScriptedAction` désormais. Vérifier le type de `SCRIPTED_GENERATORS` dans `scriptedGenerators.ts` ligne ~105 et changer `ScriptedAction` → `OffensiveScriptedAction` dans la signature des générateurs.

```bash
# Vérifier la signature dans scriptedGenerators.ts
grep -n "action: ScriptedAction" src/lib/logic/scriptedGenerators.ts
```

À la ligne trouvée, remplacer `ScriptedAction` par `OffensiveScriptedAction` et ajouter l'import correspondant.

- [ ] **Step 3.6 : Compiler + lancer tous les tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tous PASS.

- [ ] **Step 3.7 : Commit + push**

```bash
git add src/lib/logic/defensiveCompilation.ts src/lib/logic/__tests__/defensiveCompilation.test.ts src/lib/logic/compileScenario.ts src/lib/logic/scriptedGenerators.ts
git commit -m "feat(compile): passe 2 défensive — resolveTargetSteps + expandToDirectives

Phase 3 défense scriptable — étape 3/8."
git push
```

---

## Task 4 : Engine `applyDirective` — les 4 actions

**Files:**
- Create: `src/lib/logic/applyDirective.ts`
- Modify: `src/lib/logic/engine.ts` (point d'intégration)
- Test: `src/lib/logic/__tests__/applyDirective.test.ts` (créer)

**Objectif :** consommer `step.defensiveDirectives` côté engine pour surcharger les positions cibles défensives.

**Note importante :** avant d'écrire les tests, faire un repérage rapide du point exact dans `engine.ts` où les positions défensives finales sont calculées par défenseur. Cibles probables : la fonction qui retourne `DefenderPositions` pour un step donné. Chercher avec :

```bash
grep -n "DefenderPositions\|computeDefense\|defenseTargets" src/lib/logic/engine.ts | head -20
```

L'intégration consiste à appliquer les directives après le calcul standard, en mutant les positions cibles ou en retournant un nouveau record.

- [ ] **Step 4.1 : Écrire les tests pour `applyDirective`**

Créer `src/lib/logic/__tests__/applyDirective.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { applyDirective } from '@/lib/logic/applyDirective';
import type { DefenderPositions, DefensiveDirective, Step } from '@/lib/types';

const HOOP = { x: 300, y: 75 };

const baseStep = (overrides: Partial<Step> = {}): Step => ({
  off: {
    O1: { x: 300, y: 200 },
    O2: { x: 100, y: 250 },
    O3: { x: 500, y: 250 },
    O4: { x: 200, y: 100 },
    O5: { x: 350, y: 150 },
  },
  ballCarrier: 'O1',
  annotations: [],
  ...overrides,
});

const baseDef = (): DefenderPositions => ({
  D1: { x: 300, y: 220 },
  D2: { x: 110, y: 260 },
  D3: { x: 510, y: 260 },
  D4: { x: 210, y: 110 },
  D5: { x: 360, y: 160 },
});

describe('applyDirective — trap', () => {
  it("place les 2 trappeurs en V autour du target", () => {
    const step = baseStep();
    const targets = baseDef();
    const dir: DefensiveDirective = {
      type: 'trap', defenders: ['D1', 'D5'], target: 'O1',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    const o1 = step.off.O1;
    // D1 doit être à ~80 px de O1
    const d1Dist = Math.hypot(targets.D1.x - o1.x, targets.D1.y - o1.y);
    expect(d1Dist).toBeGreaterThan(60);
    expect(d1Dist).toBeLessThan(110);
    // D5 idem
    const d5Dist = Math.hypot(targets.D5.x - o1.x, targets.D5.y - o1.y);
    expect(d5Dist).toBeGreaterThan(60);
    expect(d5Dist).toBeLessThan(110);
    // les deux doivent être de part et d'autre de la ligne O1→panier (V)
    // donc leurs x doivent être différents
    expect(targets.D1.x).not.toBe(targets.D5.x);
  });
});

describe('applyDirective — tag', () => {
  it("place le low-man entre son homme et le roller, plus proche du roller", () => {
    const step = baseStep();
    const targets = baseDef();
    // assignationOverrides : D4 défend O4, on tag O5 (le roller)
    step.assignmentOverrides = { D4: 'O4' };
    const dir: DefensiveDirective = {
      type: 'tag', defenders: ['D4'], target: 'O5',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D4 doit être entre O4 (sa position) et O5 (target), pondéré vers O5
    const o4 = step.off.O4;
    const o5 = step.off.O5;
    const d4 = targets.D4;
    // d4 doit être à ~60 % du segment O4→O5 (40% offset vers le roller)
    const dxToO5 = Math.hypot(d4.x - o5.x, d4.y - o5.y);
    const dxToO4 = Math.hypot(d4.x - o4.x, d4.y - o4.y);
    expect(dxToO5).toBeLessThan(dxToO4);
  });
});

describe('applyDirective — help-and-recover', () => {
  it("engage : helper se déplace vers le target", () => {
    const step = baseStep();
    const targets = baseDef();
    const before = { ...targets.D2 };
    const dir: DefensiveDirective = {
      type: 'help-and-recover', defenders: ['D2'], target: 'O1',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D2 doit s'être déplacé vers O1 (entre sa position de base et le target)
    const distBefore = Math.hypot(before.x - step.off.O1.x, before.y - step.off.O1.y);
    const distAfter = Math.hypot(targets.D2.x - step.off.O1.x, targets.D2.y - step.off.O1.y);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("release : helper retourne sur son homme", () => {
    const step = baseStep();
    const targets = baseDef();
    step.assignmentOverrides = { D2: 'O2' };
    const dir: DefensiveDirective = {
      type: 'help-and-recover', defenders: ['D2'], target: 'O1',
      phase: 'release', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D2 doit être proche de O2 (son homme assigné)
    const distToMan = Math.hypot(targets.D2.x - step.off.O2.x, targets.D2.y - step.off.O2.y);
    expect(distToMan).toBeLessThan(50);
  });
});

describe('applyDirective — pre-switch', () => {
  it("repositionne les défenseurs sur leur nouveau homme via assignmentOverrides", () => {
    const step = baseStep();
    const targets = baseDef();
    step.assignmentOverrides = { D1: 'O5', D5: 'O1' };
    const dir: DefensiveDirective = {
      type: 'pre-switch', defenders: ['D1'], swapWith: 'D5',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D1 doit être proche de O5 (son nouveau homme), D5 proche de O1
    const d1ToO5 = Math.hypot(targets.D1.x - step.off.O5.x, targets.D1.y - step.off.O5.y);
    const d5ToO1 = Math.hypot(targets.D5.x - step.off.O1.x, targets.D5.y - step.off.O1.y);
    expect(d1ToO5).toBeLessThan(50);
    expect(d5ToO1).toBeLessThan(50);
  });
});
```

- [ ] **Step 4.2 : Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run src/lib/logic/__tests__/applyDirective.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 4.3 : Implémenter `applyDirective.ts`**

Créer `src/lib/logic/applyDirective.ts` :

```ts
import type {
  DefenderPositions,
  DefensiveDirective,
  Step,
  AttackerId,
  DefenderId,
} from '@/lib/types';

const HOOP = { x: 300, y: 75 };

/** Convention par défaut Di→Oi, utilisée si assignmentOverrides absent. */
const DEFAULT_ASSIGNMENT: Record<DefenderId, AttackerId> = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

/** Applique une directive en mutant `targets` (positions cibles défensives).
 *  Override additif : seuls les défenseurs nommés dans la directive sont touchés. */
export function applyDirective(
  targets: DefenderPositions,
  directive: DefensiveDirective,
  step: Step,
): void {
  switch (directive.type) {
    case 'trap':
      applyTrap(targets, directive, step);
      break;
    case 'tag':
      applyTag(targets, directive, step);
      break;
    case 'help-and-recover':
      applyHelpAndRecover(targets, directive, step);
      break;
    case 'pre-switch':
      applyPreSwitch(targets, directive, step);
      break;
  }
}

function getMan(d: DefenderId, step: Step): AttackerId {
  return step.assignmentOverrides?.[d] ?? DEFAULT_ASSIGNMENT[d];
}

function applyTrap(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (!dir.target) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  // Vecteur carrier → panier
  const vx = HOOP.x - carrier.x;
  const vy = HOOP.y - carrier.y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len, uy = vy / len;
  // Place les trappeurs à 80 px du carrier, à ±60° de la direction panier.
  const radius = 80;
  const angles = [Math.PI / 3, -Math.PI / 3]; // ±60°
  dir.defenders.forEach((d, i) => {
    const a = angles[i % 2];
    const cos = Math.cos(a), sin = Math.sin(a);
    // rotation du vecteur unitaire ux,uy de l'angle a, puis multiplication par radius
    const rx = ux * cos - uy * sin;
    const ry = ux * sin + uy * cos;
    targets[d] = {
      x: carrier.x + rx * radius,
      y: carrier.y + ry * radius,
    };
  });
}

function applyTag(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (!dir.target || dir.defenders.length === 0) return;
  const lowMan = dir.defenders[0];
  const myMan = getMan(lowMan, step);
  const myManPos = step.off[myMan];
  const rollerPos = step.off[dir.target];
  if (!myManPos || !rollerPos) return;
  // Position cible = myMan + 0.6 × (roller - myMan) (40% offset vers roller)
  const t = 0.6;
  targets[lowMan] = {
    x: myManPos.x + (rollerPos.x - myManPos.x) * t,
    y: myManPos.y + (rollerPos.y - myManPos.y) * t,
  };
}

function applyHelpAndRecover(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (dir.defenders.length === 0) return;
  const helper = dir.defenders[0];
  if (dir.phase === 'engage') {
    if (!dir.target) return;
    const targetPos = step.off[dir.target];
    if (!targetPos) return;
    const before = targets[helper];
    // Position cible = mid-point (helper.actuel, target) avec offset vers le
    // panier (y diminue). Convention cour : HOOP.y=75, baseline y≈20, top y≈300.
    const midX = (before.x + targetPos.x) / 2;
    const midY = (before.y + targetPos.y) / 2;
    targets[helper] = { x: midX, y: midY - 30 };
  } else {
    // release : retour sur son homme assigné
    const myMan = getMan(helper, step);
    const myManPos = step.off[myMan];
    if (!myManPos) return;
    targets[helper] = { x: myManPos.x, y: myManPos.y + 20 }; // léger offset défensif
  }
}

function applyPreSwitch(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (dir.defenders.length === 0 || !dir.swapWith) return;
  const d0 = dir.defenders[0];
  const d1 = dir.swapWith;
  const m0 = getMan(d0, step);
  const m1 = getMan(d1, step);
  const m0Pos = step.off[m0];
  const m1Pos = step.off[m1];
  if (m0Pos) targets[d0] = { x: m0Pos.x, y: m0Pos.y + 20 };
  if (m1Pos) targets[d1] = { x: m1Pos.x, y: m1Pos.y + 20 };
}
```

- [ ] **Step 4.4 : Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run src/lib/logic/__tests__/applyDirective.test.ts`
Expected: PASS (tous les tests). Si échec sur help-and-recover engage (offset y), ajuster en regardant la convention de la cour : `HOOP.y = 75`, baseline `y ≈ 20`, top of key `y ≈ 300`. "Se rapprocher du panier" = y ↘.

- [ ] **Step 4.5 : Câbler dans `engine.ts`**

```bash
grep -n "DefenderPositions\|computeDefense\|defenseTargets\|DefenderRule" src/lib/logic/engine.ts | head -20
```

Identifier le point exact où `DefenderPositions` est calculée pour un step donné. Idéalement en fin de pipeline (juste avant retour). Y ajouter :

```ts
// Phase 3 — application des directives défensives scriptées
if (step.defensiveDirectives && state.defenseScriptedDirectivesEnabled !== false) {
  for (const directive of step.defensiveDirectives) {
    applyDirective(targets, directive, step);
  }
}
```

Avec l'import en haut :
```ts
import { applyDirective } from './applyDirective';
```

L'ajout du flag `defenseScriptedDirectivesEnabled` est traité Task 8 — pour l'instant, le `state.defenseScriptedDirectivesEnabled !== false` est tolérant (treat undefined as enabled).

- [ ] **Step 4.6 : Lancer toute la suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tous PASS, aucune régression.

- [ ] **Step 4.7 : Commit + push**

```bash
git add src/lib/logic/applyDirective.ts src/lib/logic/__tests__/applyDirective.test.ts src/lib/logic/engine.ts
git commit -m "feat(engine): applyDirective pour les 4 actions défensives MVP

Trap (V à ±60°/80px), tag (60% segment), help-and-recover (mid-point + raquette),
pre-switch (repositionnement sur nouveau homme via assignmentOverrides).

Phase 3 défense scriptable — étape 4/8."
git push
```

---

## Task 5 : Refonte de la carte d'action (UX 1)

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

**Objectif :** rendre la carte d'action cliquable pour expand/collapse, déplacer les boutons monter/descendre dans le panneau déplié, préparer la zone "Couvertures" (vide pour l'instant).

**Note :** pas de test unitaire pour le rendu UI dans ce projet (tests vitest sur la logique uniquement). Validation manuelle via `npm run dev`.

- [ ] **Step 5.1 : Lire le code actuel**

```bash
sed -n '60,135p' src/components/ScenarioPanel.tsx
```

Identifier la zone qui rend chaque action (la map `props.scriptedActions.map(...)` autour des lignes 70-133) et la fonction `iconBtn`.

- [ ] **Step 5.2 : Refactorer la carte**

Dans `src/components/ScenarioPanel.tsx`, remplacer le bloc qui rend chaque action par une nouvelle structure :

1. Ajouter au-dessus du composant `ScenarioPanel` un état local pour les cartes dépliées :
```tsx
// Dans le composant ScenarioPanel, près de useState(setEditingId)
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
const toggleExpand = (id: string) => {
  setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};
```

2. Filtrer la liste pour ne montrer que les offensives (les défensives seront affichées Task 6/7) :
```tsx
const offensiveActions = props.scriptedActions.filter(
  (a): a is import('@/lib/types').OffensiveScriptedAction => a.kind === 'offensive',
);
```

3. Remplacer le rendu de chaque carte par :

```tsx
{offensiveActions.map((action, idx) => {
  const def = SCRIPTED_ACTIONS_CATALOG[action.type];
  if (!def) return null;
  const isExpanded = expandedIds.has(action.id);
  return (
    <div
      key={action.id}
      style={{
        border: '1px solid #fed7aa',
        borderLeft: '3px solid #ea580c',
        borderRadius: 6,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Header cliquable */}
      <div
        onClick={() => toggleExpand(action.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9a3412' }}>
          #{(idx + 1).toString().padStart(2, '0')}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1 }}>
          {def.label}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
        <button
          onClick={(e) => { e.stopPropagation(); props.onDeleteAction(action.id); }}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: '#dc2626', padding: '2px 6px',
          }}
          title="Supprimer"
        >✕</button>
      </div>
      <div style={{ fontSize: 11, color: '#475569', padding: '0 10px 8px 28px' }}>
        {action.label || def.reader(action.params)}
      </div>

      {/* Panneau déplié */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: 10, background: '#fffbf5' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>
            PARAMÈTRES
          </div>
          <ActionForm
            action={action}
            def={def}
            onChange={(updated) => props.onUpdateAction(action.id, updated)}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              onClick={() => props.onMoveAction(action.id, 'up')}
              disabled={idx === 0}
              style={{
                flex: 1, padding: '6px 10px', fontSize: 11,
                border: '1px solid #cbd5e1', borderRadius: 4,
                background: idx === 0 ? '#f1f5f9' : '#fff',
                cursor: idx === 0 ? 'not-allowed' : 'pointer',
              }}
            >▲ monter</button>
            <button
              onClick={() => props.onMoveAction(action.id, 'down')}
              disabled={idx === offensiveActions.length - 1}
              style={{
                flex: 1, padding: '6px 10px', fontSize: 11,
                border: '1px solid #cbd5e1', borderRadius: 4,
                background: idx === offensiveActions.length - 1 ? '#f1f5f9' : '#fff',
                cursor: idx === offensiveActions.length - 1 ? 'not-allowed' : 'pointer',
              }}
            >▼ descendre</button>
          </div>

          {/* Placeholder zone couvertures — implémenté Task 6 */}
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: '1px dashed #e2e8f0',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a8a', marginBottom: 6 }}>
              🛡️ COUVERTURES DÉFENSIVES
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              (à implémenter Task 6)
            </div>
          </div>
        </div>
      )}
    </div>
  );
})}
```

4. Retirer l'usage de `setEditingId` (l'état d'édition est remplacé par `expandedIds`). Supprimer la déclaration `const [editingId, setEditingId] = useState...` et le `iconBtn` si inutilisé.

- [ ] **Step 5.3 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5.4 : Validation manuelle dans le navigateur**

Run (en arrière-plan, déjà actif côté user) : `npm run dev`

Vérifier dans le navigateur :
- Ajouter une action via "+ Ajouter une action" → la carte apparaît compacte.
- Cliquer dessus → expand avec params + boutons monter/descendre + zone "couvertures" placeholder.
- Cliquer ▼ → collapse.
- Bouton ✕ supprime l'action sans déclencher l'expand.
- Bouton ▲/▼ monter/descendre fonctionnent.

- [ ] **Step 5.5 : Commit + push**

```bash
git add src/components/ScenarioPanel.tsx
git commit -m "feat(scenario-ui): refonte carte d'action — compact/expand cliquable

- Ligne compacte cliquable (label + ▼/▲ + ✕)
- Panneau déplié : params + monter/descendre + placeholder couvertures
- Cibles de clic agrandies, plus lisible

Phase 3 défense scriptable — étape 5/8 (UX 1)."
git push
```

---

## Task 6 : Couvertures défensives couplées (UX 2)

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`
- Create: `src/components/AddCoverageModal.tsx`
- Create: `src/components/DefensiveActionForm.tsx`
- Modify: `src/hooks/useAppState.ts` (handlers add/update/delete defensive)

**Objectif :** ajouter le bouton "+ ajouter une couverture" dans la zone défensive de chaque carte action, avec sélection parmi les 4 défensives, defaults intelligents, affichage des couvertures attachées.

- [ ] **Step 6.1 : Ajouter les handlers dans `useAppState.ts`**

Localiser les handlers existants (`handleAddScriptedAction`, etc.). Ajouter :

```ts
// dans useAppState.ts
import { newScriptedActionId } from '@/lib/logic/compileScenario';
import type { DefensiveActionType, DefensiveActionParams, DefensiveScriptedAction } from '@/lib/types';

// ... à côté des autres handlers
const handleAddDefensiveAction = useCallback((
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
  setState((s) => ({ ...s, scriptedActions: [...s.scriptedActions, newAction] }));
}, []);

const handleUpdateDefensiveAction = useCallback((id: string, updated: DefensiveScriptedAction) => {
  setState((s) => ({
    ...s,
    scriptedActions: s.scriptedActions.map((a) => (a.id === id ? updated : a)),
  }));
}, []);

const handleDeleteDefensiveAction = useCallback((id: string) => {
  setState((s) => ({
    ...s,
    scriptedActions: s.scriptedActions.filter((a) => a.id !== id),
  }));
}, []);
```

Exposer ces handlers dans le retour du hook.

- [ ] **Step 6.2 : Helper "defaults intelligents"**

Créer `src/lib/logic/defensiveDefaults.ts` :

```ts
import type {
  OffensiveScriptedAction,
  DefensiveActionType,
  DefensiveActionParams,
  AttackerId,
  DefenderId,
} from '@/lib/types';

const DEFAULT_ASSIGNMENT: Record<AttackerId, DefenderId> = {
  O1: 'D1', O2: 'D2', O3: 'D3', O4: 'D4', O5: 'D5',
};

/** Devine les defaults d'une directive défensive en fonction de l'action parent.
 *  Ces defaults sont des points de départ — l'utilisateur peut les éditer. */
export function inferDefensiveDefaults(
  defType: DefensiveActionType,
  parent: OffensiveScriptedAction,
): DefensiveActionParams {
  const p = parent.params;
  const carrier = p.ballHandler ?? p.driver ?? p.passer ?? p.giver ?? p.shooter ?? p.from;
  const screener = p.screener ?? p.firstScreener ?? p.cutter;

  switch (defType) {
    case 'trap': {
      // 2 défenseurs trappent le porteur : le défenseur du porteur + celui du screener
      const trappers: DefenderId[] = [];
      if (carrier) trappers.push(DEFAULT_ASSIGNMENT[carrier]);
      if (screener) trappers.push(DEFAULT_ASSIGNMENT[screener]);
      return { defenders: trappers, target: carrier };
    }
    case 'tag': {
      // low-man = défenseur du joueur le plus loin du ballon (heuristique : O3 ou O4 si pas screener)
      // Simplification : on prend le défenseur d'un joueur autre que carrier/screener.
      const others: AttackerId[] = (['O1','O2','O3','O4','O5'] as AttackerId[])
        .filter((o) => o !== carrier && o !== screener);
      const lowMan = others[0] ? DEFAULT_ASSIGNMENT[others[0]] : 'D4';
      return { defenders: [lowMan], target: screener };
    }
    case 'help-and-recover': {
      const helper: DefenderId = (carrier && carrier !== 'O1') ? 'D2' : 'D2';
      return { defenders: [helper], target: carrier };
    }
    case 'pre-switch': {
      const d0 = carrier ? DEFAULT_ASSIGNMENT[carrier] : 'D1';
      const d1 = screener ? DEFAULT_ASSIGNMENT[screener] : 'D5';
      return { defenders: [d0], swapWith: d1 };
    }
  }
}
```

- [ ] **Step 6.3 : Test unitaire des defaults intelligents**

Créer `src/lib/logic/__tests__/defensiveDefaults.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { inferDefensiveDefaults } from '@/lib/logic/defensiveDefaults';
import type { OffensiveScriptedAction } from '@/lib/types';

const pnr: OffensiveScriptedAction = {
  kind: 'offensive', id: 'a1', type: 'pick-and-roll',
  params: { ballHandler: 'O1', screener: 'O5' },
};

describe('inferDefensiveDefaults', () => {
  it('trap sur PnR : trappeurs = défenseurs du porteur + screener, target = porteur', () => {
    const p = inferDefensiveDefaults('trap', pnr);
    expect(p.defenders).toEqual(['D1', 'D5']);
    expect(p.target).toBe('O1');
  });

  it('tag sur PnR : 1 low-man, target = screener', () => {
    const p = inferDefensiveDefaults('tag', pnr);
    expect(p.defenders).toHaveLength(1);
    expect(p.target).toBe('O5');
  });

  it('pre-switch sur PnR : D1 swap D5', () => {
    const p = inferDefensiveDefaults('pre-switch', pnr);
    expect(p.defenders).toEqual(['D1']);
    expect(p.swapWith).toBe('D5');
  });
});
```

- [ ] **Step 6.4 : Lancer le test, doit passer**

Run: `npx vitest run src/lib/logic/__tests__/defensiveDefaults.test.ts`
Expected: PASS.

- [ ] **Step 6.5 : Créer `AddCoverageModal.tsx`**

```tsx
// src/components/AddCoverageModal.tsx
import { useState } from 'react';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';
import type { DefensiveActionType } from '@/lib/types';

interface AddCoverageModalProps {
  onClose: () => void;
  onPick: (type: DefensiveActionType) => void;
}

export function AddCoverageModal({ onClose, onPick }: AddCoverageModalProps) {
  const [filter, setFilter] = useState('');
  const filterLower = filter.trim().toLowerCase();
  const matches = (type: DefensiveActionType) => {
    if (!filterLower) return true;
    const def = DEFENSIVE_ACTIONS_CATALOG[type];
    return (
      def.label.toLowerCase().includes(filterLower) ||
      def.fibaTerm.toLowerCase().includes(filterLower) ||
      def.description.toLowerCase().includes(filterLower)
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          width: 'min(480px, 100%)', maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #dbeafe',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', flex: 1 }}>
            🛡️ Ajouter une couverture défensive
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, padding: '4px 10px', borderRadius: 6,
              border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
              color: '#475569',
            }}
            title="Fermer (Échap)"
          >✕</button>
        </div>
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #dbeafe' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer (trap, help, switch…)"
            autoFocus
            style={{
              width: '100%', fontSize: 13, padding: '7px 10px',
              borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none',
            }}
          />
        </div>
        <div style={{ overflow: 'auto', padding: '10px 18px 14px', flex: 1 }}>
          {ALL_DEFENSIVE_ACTION_TYPES.filter(matches).map((type) => {
            const def = DEFENSIVE_ACTIONS_CATALOG[type];
            return (
              <button
                key={type}
                onClick={() => onPick(type)}
                title={def.fibaTerm}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  fontSize: 12, padding: '8px 10px', marginBottom: 4,
                  border: '1px solid #dbeafe', borderRadius: 6,
                  background: '#fff', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1e3a8a' }}>{def.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {def.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.6 : Créer `DefensiveActionForm.tsx`**

```tsx
// src/components/DefensiveActionForm.tsx
import type {
  DefensiveScriptedAction, DefensiveActionParams,
  DefenderId, AttackerId, DefensiveActionType,
} from '@/lib/types';
import { DEFENSIVE_ACTIONS_CATALOG } from '@/lib/data/defensiveActionsCatalog';

const ALL_DEFENDERS: DefenderId[] = ['D1','D2','D3','D4','D5'];
const ALL_ATTACKERS: AttackerId[] = ['O1','O2','O3','O4','O5'];

interface DefensiveActionFormProps {
  action: DefensiveScriptedAction;
  onChange: (updated: DefensiveScriptedAction) => void;
}

export function DefensiveActionForm({ action, onChange }: DefensiveActionFormProps) {
  const def = DEFENSIVE_ACTIONS_CATALOG[action.type];
  const updateParams = (patch: Partial<DefensiveActionParams>) => {
    onChange({ ...action, params: { ...action.params, ...patch } });
  };

  const requires = (k: string) => def.requiredParams.includes(k as any);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
      {requires('defenders') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>
            Défenseur(s)
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {ALL_DEFENDERS.map((d) => {
              const checked = action.params.defenders.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => {
                    const next = checked
                      ? action.params.defenders.filter((x) => x !== d)
                      : [...action.params.defenders, d];
                    updateParams({ defenders: next });
                  }}
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    border: '1px solid ' + (checked ? '#1e3a8a' : '#cbd5e1'),
                    borderRadius: 4,
                    background: checked ? '#dbeafe' : '#fff',
                    color: checked ? '#1e3a8a' : '#64748b',
                    cursor: 'pointer',
                  }}
                >{d}</button>
              );
            })}
          </div>
        </div>
      )}

      {requires('target') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>Cible</label>
          <select
            value={action.params.target ?? ''}
            onChange={(e) => updateParams({ target: e.target.value as AttackerId })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value="">—</option>
            {ALL_ATTACKERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {requires('swapWith') && (
        <div>
          <label style={{ color: '#475569', display: 'block', marginBottom: 2 }}>
            Échange avec
          </label>
          <select
            value={action.params.swapWith ?? ''}
            onChange={(e) => updateParams({ swapWith: e.target.value as DefenderId })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value="">—</option>
            {ALL_DEFENDERS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.7 : Intégrer dans `ScenarioPanel.tsx`**

Dans `ScenarioPanel`, dans la zone "couvertures défensives" du panneau déplié (Task 5 placeholder), remplacer le placeholder par :

```tsx
{/* Couvertures défensives attachées à cette offensive */}
{(() => {
  const attached = props.scriptedActions.filter(
    (a): a is import('@/lib/types').DefensiveScriptedAction =>
      a.kind === 'defensive' && a.parentActionId === action.id,
  );
  return (
    <div style={{
      marginTop: 12, paddingTop: 10,
      borderTop: '1px dashed #e2e8f0',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a8a', marginBottom: 6 }}>
        🛡️ COUVERTURES DÉFENSIVES
      </div>
      {attached.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 6 }}>
          (aucune)
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {attached.map((cov) => {
            const cdef = DEFENSIVE_ACTIONS_CATALOG[cov.type];
            return (
              <div key={cov.id} style={{
                background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4,
                padding: '6px 8px', fontSize: 11, display: 'flex',
                alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontWeight: 600, color: '#1e3a8a' }}>{cdef.label}</span>
                <span style={{ color: '#475569', flex: 1 }}>{cdef.reader(cov.params)}</span>
                <button
                  onClick={() => props.onDeleteDefensiveAction(cov.id)}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 12, color: '#dc2626',
                  }}
                  title="Supprimer la couverture"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setAddCoverageFor(action.id)}
        style={{
          fontSize: 11, padding: '5px 10px',
          border: '1px solid #1e3a8a', borderRadius: 4,
          background: '#fff', color: '#1e3a8a', cursor: 'pointer',
          fontWeight: 600,
        }}
      >+ ajouter une couverture</button>
    </div>
  );
})()}
```

Ajouter en haut du composant :
```tsx
const [addCoverageFor, setAddCoverageFor] = useState<string | null>(null);
```

Importer en haut du fichier :
```tsx
import { DEFENSIVE_ACTIONS_CATALOG } from '@/lib/data/defensiveActionsCatalog';
import { AddCoverageModal } from './AddCoverageModal';
import { inferDefensiveDefaults } from '@/lib/logic/defensiveDefaults';
import type { DefensiveActionType } from '@/lib/types';
```

À la fin du JSX retourné (à côté de `<AddActionModal>`), ajouter :

```tsx
{addCoverageFor && (() => {
  const parent = props.scriptedActions.find((a) => a.id === addCoverageFor);
  if (!parent || parent.kind !== 'offensive') return null;
  return (
    <AddCoverageModal
      onClose={() => setAddCoverageFor(null)}
      onPick={(type: DefensiveActionType) => {
        const params = inferDefensiveDefaults(type, parent);
        props.onAddDefensiveAction(type, params, parent.id);
        setAddCoverageFor(null);
      }}
    />
  );
})()}
```

- [ ] **Step 6.8 : Étendre la signature props de `ScenarioPanel`**

Ajouter dans `ScenarioPanelProps` :

```ts
onAddDefensiveAction: (
  type: DefensiveActionType,
  params: DefensiveActionParams,
  parentActionId?: string,
  affectedSteps?: number[],
) => void;
onUpdateDefensiveAction: (id: string, updated: DefensiveScriptedAction) => void;
onDeleteDefensiveAction: (id: string) => void;
```

Et dans `src/app/page.tsx` (ou là où `<ScenarioPanel>` est rendu), passer les nouveaux handlers depuis `useAppState`.

- [ ] **Step 6.9 : Vérifier la compilation + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6.10 : Validation manuelle**

Dans le navigateur :
- Ajouter un PnR (O1+O5).
- Le déplier, cliquer "+ ajouter une couverture".
- Choisir "Trap". Vérifier que la couverture apparaît avec D1+D5 → O1 (defaults).
- Vérifier visuellement sur le terrain : sur les steps du PnR, D1 et D5 forment un V autour de O1.
- Choisir "Pre-switch" → vérifier que D1 et D5 sont sur l'autre attaquant à partir du 1er step du parent.
- Choisir "Help and recover" → vérifier visuellement.
- Choisir "Tag" → vérifier visuellement.
- Cliquer ✕ sur une couverture → elle disparaît.

- [ ] **Step 6.11 : Commit + push**

```bash
git add src/components/ScenarioPanel.tsx src/components/AddCoverageModal.tsx src/components/DefensiveActionForm.tsx src/lib/logic/defensiveDefaults.ts src/lib/logic/__tests__/defensiveDefaults.test.ts src/hooks/useAppState.ts src/app/page.tsx
git commit -m "feat(scenario-ui): couvertures défensives couplées (UX 2)

Bouton + ajouter une couverture dans chaque carte offensive,
modal AddCoverageModal, sous-cartes bleues, defaults intelligents
(D1+D5 sur PnR pour trap, etc.).

Phase 3 défense scriptable — étape 6/8."
git push
```

---

## Task 7 : Action défensive libre (UX 3)

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

**Objectif :** permettre d'ajouter une action défensive **non couplée** depuis le sélecteur principal (cas avancé : trap "libre" sur 2 steps absolus, etc.).

- [ ] **Step 7.1 : Étendre `AddActionModal`**

Dans `ScenarioPanel.tsx`, dans le composant `AddActionModal`, après les catégories offensives, ajouter une catégorie "🛡️ Défense" :

```tsx
{/* Catégorie défense — actions libres */}
{(() => {
  const visibleDef = ALL_DEFENSIVE_ACTION_TYPES.filter((type) => {
    const def = DEFENSIVE_ACTIONS_CATALOG[type];
    if (!filterLower) return true;
    return (
      def.label.toLowerCase().includes(filterLower) ||
      def.fibaTerm.toLowerCase().includes(filterLower) ||
      def.description.toLowerCase().includes(filterLower)
    );
  });
  if (visibleDef.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, color: '#1e3a8a', textTransform: 'uppercase',
        marginBottom: 6, letterSpacing: 0.5, fontWeight: 600,
      }}>
        🛡️ Défense (libre)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleDef.map((type) => {
          const def = DEFENSIVE_ACTIONS_CATALOG[type];
          return (
            <button
              key={type}
              onClick={() => onPickDefensive(type)}
              title={def.fibaTerm}
              style={{
                textAlign: 'left', fontSize: 12,
                padding: '8px 10px',
                border: '1px solid #dbeafe', borderRadius: 6,
                background: '#fff', cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, color: '#1e3a8a' }}>{def.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{def.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
})()}
```

Ajouter en haut du modal les imports nécessaires et étendre la prop pour gérer le pick défensif :

```ts
interface AddActionModalProps {
  onClose: () => void;
  onPick: (def: ScriptedActionDefinition) => void;
  onPickDefensive: (type: DefensiveActionType) => void;
}
```

Côté parent (`ScenarioPanel`), passer `onPickDefensive` :

```tsx
<AddActionModal
  onClose={() => setShowAddModal(false)}
  onPick={handlePickAction}
  onPickDefensive={(type) => {
    // Action libre : defaults minimaux, l'user complète après
    props.onAddDefensiveAction(type, { defenders: [] }, undefined, [0]);
    setShowAddModal(false);
  }}
/>
```

- [ ] **Step 7.2 : Afficher les actions défensives libres dans la liste**

Dans `ScenarioPanel`, après la liste des offensives, ajouter un bloc pour les défensives libres :

```tsx
{/* Actions défensives libres */}
{(() => {
  const free = props.scriptedActions.filter(
    (a): a is import('@/lib/types').DefensiveScriptedAction =>
      a.kind === 'defensive' && a.parentActionId === undefined,
  );
  if (free.length === 0) return null;
  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#1e3a8a',
        marginTop: 8, marginBottom: 4, letterSpacing: 0.5,
      }}>🛡️ DÉFENSE (LIBRE)</div>
      {free.map((act) => {
        const cdef = DEFENSIVE_ACTIONS_CATALOG[act.type];
        const isExpanded = expandedIds.has(act.id);
        return (
          <div key={act.id} style={{
            border: '1px solid #dbeafe',
            borderLeft: '3px solid #1e3a8a',
            borderRadius: 6, background: '#fff', overflow: 'hidden',
          }}>
            <div onClick={() => toggleExpand(act.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', cursor: 'pointer', userSelect: 'none',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>🛡️</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1 }}>
                {cdef.label}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
              <button
                onClick={(e) => { e.stopPropagation(); props.onDeleteDefensiveAction(act.id); }}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, color: '#dc2626', padding: '2px 6px',
                }}
              >✕</button>
            </div>
            <div style={{ fontSize: 11, color: '#475569', padding: '0 10px 8px 28px' }}>
              {cdef.reader(act.params)} · steps : {(act.affectedSteps ?? []).join(',') || '—'}
            </div>
            {isExpanded && (
              <div style={{ padding: 10, background: '#eff6ff' }}>
                <DefensiveActionForm
                  action={act}
                  onChange={(updated) => props.onUpdateDefensiveAction(act.id, updated)}
                />
                <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: '#1e3a8a' }}>
                  STEPS CIBLES
                </div>
                <input
                  type="text"
                  defaultValue={(act.affectedSteps ?? []).join(',')}
                  onBlur={(e) => {
                    const parsed = e.target.value
                      .split(',').map((s) => parseInt(s.trim(), 10))
                      .filter((n) => Number.isFinite(n) && n >= 0);
                    props.onUpdateDefensiveAction(act.id, { ...act, affectedSteps: parsed });
                  }}
                  placeholder="ex: 1,2,3"
                  style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 4,
                    border: '1px solid #cbd5e1', width: '100%',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
})()}
```

- [ ] **Step 7.3 : Vérifier compilation + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7.4 : Validation manuelle**

Dans le navigateur :
- Cliquer "+ Ajouter une action".
- Scroller jusqu'à "🛡️ Défense (libre)" en bas du modal.
- Choisir "Trap" → une carte bleue apparaît hors de toute carte offensive.
- L'expand → renseigner defenders [D1, D5], target O1, affectedSteps "1,2".
- Vérifier visuellement que sur les steps 1 et 2, D1+D5 trappent O1.

- [ ] **Step 7.5 : Commit + push**

```bash
git add src/components/ScenarioPanel.tsx
git commit -m "feat(scenario-ui): action défensive libre (UX 3)

Catégorie 🛡️ Défense en bas du sélecteur principal,
carte distincte (liseré bleu, badge libre), affectedSteps
éditable en input texte (CSV).

Phase 3 défense scriptable — étape 7/8."
git push
```

---

## Task 8 : Toggle global + test d'intégration

**Files:**
- Modify: `src/lib/types/index.ts` (champ state)
- Modify: `src/hooks/useAppState.ts` (initial state + handler)
- Modify: `src/components/DefensePanel.tsx` (toggle UI)
- Test: `src/lib/logic/__tests__/defenseScriptedIntegration.test.ts` (créer)

**Objectif :** ajouter le flag `state.defenseScriptedDirectivesEnabled` (default true) avec un toggle UI, et écrire un test d'intégration scénario complet.

- [ ] **Step 8.1 : Ajouter le champ state**

Dans `src/lib/types/index.ts`, dans l'interface `AppState` (ou équivalent — chercher `scriptedActions?:` ligne ~482), ajouter :

```ts
/** Phase 3 — active l'application des directives défensives scriptées
 *  (step.defensiveDirectives) par l'engine. Default true. Désactiver
 *  permet de comparer "défense scriptée vs défense moteur standard". */
defenseScriptedDirectivesEnabled?: boolean;
```

Dans `src/lib/data/initial.ts`, ajouter `defenseScriptedDirectivesEnabled: true` aux scénarios initiaux (ou laisser undefined puisque l'engine traite undefined comme true).

- [ ] **Step 8.2 : Ajouter le handler dans `useAppState.ts`**

```ts
const handleToggleScriptedDefense = useCallback(() => {
  setState((s) => ({
    ...s,
    defenseScriptedDirectivesEnabled: s.defenseScriptedDirectivesEnabled === false ? true : false,
  }));
}, []);
```

Exposer dans le retour du hook.

- [ ] **Step 8.3 : Ajouter le toggle UI dans `DefensePanel.tsx`**

Lire `src/components/DefensePanel.tsx`. Trouver une zone propre (au-dessus ou à côté des réglages globaux) et ajouter :

```tsx
<div style={{
  marginTop: 8, padding: 8,
  border: '1px solid #dbeafe', borderRadius: 6, background: '#eff6ff',
  display: 'flex', alignItems: 'center', gap: 8,
}}>
  <input
    type="checkbox"
    id="scripted-defense-toggle"
    checked={props.scriptedDefenseEnabled !== false}
    onChange={props.onToggleScriptedDefense}
  />
  <label htmlFor="scripted-defense-toggle" style={{ fontSize: 11, color: '#1e3a8a' }}>
    Appliquer les directives défensives scriptées
  </label>
</div>
```

Étendre les props de `DefensePanel` pour recevoir `scriptedDefenseEnabled` et `onToggleScriptedDefense`. Brancher dans `src/app/page.tsx`.

- [ ] **Step 8.4 : Écrire le test d'intégration**

Créer `src/lib/logic/__tests__/defenseScriptedIntegration.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { compileScenario } from '@/lib/logic/compileScenario';
import type {
  AttackerPositions, OffensiveScriptedAction, DefensiveScriptedAction,
} from '@/lib/types';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 280 },
  O2: { x: 100, y: 250 },
  O3: { x: 500, y: 250 },
  O4: { x: 200, y: 100 },
  O5: { x: 350, y: 200 },
};

describe('Intégration — PnR + couverture trap', () => {
  it('compile et pose une directive trap sur chaque step du PnR', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5', side: 'fort' },
    };
    const trap: DefensiveScriptedAction = {
      kind: 'defensive', id: 'trap-1', type: 'trap',
      parentActionId: 'pnr-1',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, trap],
    });
    // Step 0 = Départ (sans directive). Steps 1..3 = PnR avec trap.
    expect(steps[0].defensiveDirectives).toBeUndefined();
    for (let i = 1; i < steps.length; i++) {
      const dirs = steps[i].defensiveDirectives;
      expect(dirs).toBeDefined();
      expect(dirs!.some((d) => d.type === 'trap' && d.target === 'O1')).toBe(true);
    }
  });

  it('pre-switch propage assignmentOverrides sur tous les steps du parent', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5' },
    };
    const preSwitch: DefensiveScriptedAction = {
      kind: 'defensive', id: 'ps-1', type: 'pre-switch',
      parentActionId: 'pnr-1',
      affectedSteps: [0],
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, preSwitch],
    });
    // Tous les steps du PnR (1,2,3) doivent avoir assignmentOverrides
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    }
  });

  it('action défensive libre s\'applique sur les indices absolus', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5' },
    };
    const freeTrap: DefensiveScriptedAction = {
      kind: 'defensive', id: 'free-1', type: 'trap',
      affectedSteps: [2],
      params: { defenders: ['D2', 'D3'], target: 'O1' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, freeTrap],
    });
    expect(steps[2].defensiveDirectives?.length).toBeGreaterThan(0);
    expect(steps[2].defensiveDirectives?.some(
      (d) => d.type === 'trap' && d.defenders.includes('D2'),
    )).toBe(true);
    // Step 1 et 3 ne doivent pas avoir cette directive
    expect(steps[1].defensiveDirectives?.some(
      (d) => d.sourceActionId === 'free-1',
    ) ?? false).toBe(false);
  });
});
```

- [ ] **Step 8.5 : Lancer le test, doit passer**

Run: `npx vitest run src/lib/logic/__tests__/defenseScriptedIntegration.test.ts`
Expected: PASS.

- [ ] **Step 8.6 : Lancer toute la suite**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS partout (build inclus pour valider Next.js).

- [ ] **Step 8.7 : Validation manuelle finale**

Dans le navigateur :
- Créer un scénario PnR avec couverture trap.
- Vérifier visuellement que D1+D5 trappent O1.
- Toggler "Appliquer les directives défensives scriptées" → les défenseurs reviennent à leur défense moteur standard.
- Toggler à nouveau → trap réapparaît.

- [ ] **Step 8.8 : Mettre à jour la roadmap**

Dans `docs/fiba-actions-roadmap.md`, dans le tableau §2.1 et §2.2, passer le statut de `trap`, `tag`, `pre-switch`, `help-and-recover` de 🛡️ à ✅ avec une note "Phase 3 MVP".

- [ ] **Step 8.9 : Commit + push final**

```bash
git add src/lib/types/index.ts src/hooks/useAppState.ts src/components/DefensePanel.tsx src/lib/data/initial.ts src/app/page.tsx src/lib/logic/__tests__/defenseScriptedIntegration.test.ts docs/fiba-actions-roadmap.md
git commit -m "feat(defense): toggle global directives scriptées + test intégration

state.defenseScriptedDirectivesEnabled (default true) avec checkbox
dans DefensePanel. Permet de comparer défense scriptée vs moteur.
Test d'intégration end-to-end (compile PnR+trap, pre-switch, libre).

Phase 3 défense scriptable — étape 8/8 ✅ MVP terminé."
git push
```

---

## Validation finale du MVP

Après les 8 tâches :
- [ ] `npx vitest run` → 100 % PASS
- [ ] `npx tsc --noEmit` → 0 erreur
- [ ] `npm run build` → succès
- [ ] Test manuel : scénario PnR + trap + pre-switch fonctionne visuellement
- [ ] Toggle on/off du flag global change le rendu
- [ ] Sauvegarde/rechargement d'un scénario avec défense préserve les couvertures
- [ ] Migration legacy v0.7 transparente (aucun scénario cassé)
