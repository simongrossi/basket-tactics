# Continuity / motion offense — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modéliser une continuity offense (flex/Princeton/5-out) : une plage d'actions rejouée K cycles avec rotation des rôles (permutation σ), avec sortie hybride (max K cycles, sortie anticipée sur lecture Phase L).

**Architecture:** La boucle est un **transform pur de la liste d'actions** appliqué AVANT le pipeline existant. `expandContinuityLoop` déroule le corps de boucle K fois en relabelisant les IDs joueurs par σ^k et en donnant à chaque cycle un id d'action unique (`${id}#c${k}`). Comme les générateurs stampent `generatedBy: action.id`, la préservation des `manualOverride` et la passe défensive fonctionnent sans modification. La défense suit son homme (`assignmentOverrides` stable), donc aucun remap défensif.

**Tech Stack:** TypeScript strict, Vitest (TDD). Touche `compileScenario.ts` (orchestration offensive) mais PAS `screens/` ni `defense/context.ts` — Règle 1bis couverte via les suites de garde-fou.

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-continuity-motion-offense-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| 1 | `src/lib/types/index.ts` | `ContinuityLoop` + `AppState.continuityLoop` + champs `CompileInput` |
| 1 | `src/lib/logic/reads/continuityLoop.ts` | helpers purs (créer) |
| 1 | `src/lib/logic/reads/__tests__/continuityLoop.test.ts` | tests (créer) |
| 1 | `src/lib/logic/compileScenario.ts` | brancher l'expansion |
| 1 | `src/lib/state/transforms/shared.ts` | câbler continuityLoop + exit dans `compileScenario` |
| 1 | `src/lib/logic/reads/__tests__/continuityIntegration.test.ts` | test d'intégration (créer) |
| 2 | `src/lib/state/transforms/scenarioTransforms.ts` | transform `setContinuityLoop` |
| 2 | `src/lib/state/transforms/__tests__/continuityTransforms.test.ts` | tests (créer) |
| 2 | `src/hooks/useAppState.ts` | callback |
| 2 | `src/app/page.tsx` | câblage props |
| 2 | `src/components/ScenarioPanel.tsx` | section UI |
| 3 | `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md` | docs |

---

# CHANTIER 1 — Noyau (types + helpers purs + compilateur)

## Task 1.1 — Types

**Files:**
- Modify: `src/lib/types/index.ts` (interface `ContinuityLoop` + champ après `rolledCoverage?` ligne ~1325 ; champs `CompileInput` sont dans `compileScenario.ts`)

- [ ] **Step 1: Ajouter l'interface + le champ AppState** — après le champ `rolledCoverage?: ScreenRule;` (ligne ~1325) :

```typescript
  /** Continuity / motion offense (boucle rotative). undefined = legacy
   *  déterministe (aucune boucle). Voir docs/superpowers/specs/
   *  2026-06-02-continuity-motion-offense-design.md. */
  continuityLoop?: ContinuityLoop;
```

- [ ] **Step 2: Définir l'interface `ContinuityLoop`** — près des autres interfaces de scénario (après `ScenarioBranch`, ligne ~496) :

```typescript
/** Phase Motion — boucle de continuité. Une plage contiguë d'actions
 *  OFFENSIVES `[startActionId, endActionId]` (inclusive) rejouée jusqu'à
 *  `maxCycles` fois, en relabelisant les IDs joueurs par la permutation
 *  `rotation` (σ^k au cycle k). */
export interface ContinuityLoop {
  /** Bornes (inclusives) de la plage d'actions formant le corps de boucle. */
  startActionId: string;
  endActionId: string;
  /** Roue de rotation : ordre cyclique des attaquants actifs. σ(p) = élément
   *  suivant dans la roue (le dernier boucle sur le premier). */
  rotation: AttackerId[];
  /** Borne haute de cycles. Clampé 1…6 au déroulé. */
  maxCycles: number;
  /** Sortie anticipée sur lecture (Phase L). Si défini ET que la branche
   *  réactive résolue == cette branche, la boucle sort tôt vers ses actions. */
  exitBranchId?: string | null;
}
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 1.2 — Helper `rotateActionParams` (TDD)

**Files:**
- Create: `src/lib/logic/reads/continuityLoop.ts`
- Create: `src/lib/logic/reads/__tests__/continuityLoop.test.ts`

- [ ] **Step 1: Écrire le test** :

```typescript
import { describe, it, expect } from 'vitest';
import { rotateActionParams } from '@/lib/logic/reads/continuityLoop';
import type { AttackerId, ScriptedActionParams } from '@/lib/types';

const wheel: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

describe('rotateActionParams', () => {
  it('k=0 → identité', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', screener: 'O5' };
    expect(rotateActionParams(p, wheel, 0)).toEqual(p);
  });

  it('k=1 → chaque joueur avance d’un cran sur la roue', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', screener: 'O5', cutter: 'O3' };
    expect(rotateActionParams(p, wheel, 1)).toEqual({
      ballHandler: 'O2', screener: 'O1', cutter: 'O4',
    });
  });

  it('k=2 cumulatif (σ²)', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1' };
    expect(rotateActionParams(p, wheel, 2).ballHandler).toBe('O3');
  });

  it('wrap autour de la roue', () => {
    const p: ScriptedActionParams = { ballHandler: 'O5' };
    expect(rotateActionParams(p, wheel, 1).ballHandler).toBe('O1');
  });

  it('ne touche PAS les champs non-joueur', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', side: 'fort', direction: 'panier' };
    const out = rotateActionParams(p, wheel, 1);
    expect(out.side).toBe('fort');
    expect(out.direction).toBe('panier');
  });

  it('joueur absent de la roue → inchangé', () => {
    const partial: AttackerId[] = ['O1', 'O2'];
    expect(rotateActionParams({ screener: 'O5' }, partial, 1).screener).toBe('O5');
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/continuityLoop.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter** — créer `continuityLoop.ts` :

```typescript
// Phase Motion — continuity offense : déroulé (unroll) au compile-time d'une
// plage d'actions, avec rotation des rôles. Purs. Voir
// docs/superpowers/specs/2026-06-02-continuity-motion-offense-design.md.

import type { AttackerId, ContinuityLoop, ScriptedAction, ScriptedActionParams } from '../../types';

/** Champs de params qui référencent un joueur (à remapper par σ^k). Les autres
 *  (side, direction, zones) sont laissés intacts. */
const PLAYER_FIELDS = [
  'ballHandler', 'screener', 'cutter', 'passer', 'receiver', 'giver',
  'driver', 'shooter', 'from', 'to', 'firstScreener', 'secondScreener',
] as const;

/** σ^k(p) : avance le joueur `p` de k crans sur la roue `rotation`. Joueur
 *  hors roue → identité. */
function sigmaPow(p: AttackerId, rotation: AttackerId[], k: number): AttackerId {
  const idx = rotation.indexOf(p);
  if (idx < 0) return p;
  return rotation[(idx + k) % rotation.length];
}

/** Remappe les champs joueur de `params` par σ^k. Champs non-joueur intacts. */
export function rotateActionParams(
  params: ScriptedActionParams,
  rotation: AttackerId[],
  k: number,
): ScriptedActionParams {
  if (k === 0) return params;
  const out: ScriptedActionParams = { ...params };
  for (const f of PLAYER_FIELDS) {
    const v = params[f];
    if (v) out[f] = sigmaPow(v, rotation, k);
  }
  return out;
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/continuityLoop.test.ts` → 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/reads/continuityLoop.ts src/lib/logic/reads/__tests__/continuityLoop.test.ts src/lib/types/index.ts
git commit -m "feat(motion): rotateActionParams + types ContinuityLoop"
```

---

## Task 1.3 — Helper `expandContinuityLoop` (TDD)

**Files:**
- Modify: `src/lib/logic/reads/__tests__/continuityLoop.test.ts`
- Modify: `src/lib/logic/reads/continuityLoop.ts`

- [ ] **Step 1: Ajouter les tests** — en tête du fichier de test, étendre l'import puis ajouter le bloc :

```typescript
import { expandContinuityLoop } from '@/lib/logic/reads/continuityLoop';
import type { ContinuityLoop, OffensiveScriptedAction } from '@/lib/types';

function offAction(id: string, ballHandler: AttackerId): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'pass', params: { passer: ballHandler, receiver: 'O2' } };
}

const loop3: ContinuityLoop = {
  startActionId: 'b1', endActionId: 'b2', rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 3,
};

describe('expandContinuityLoop', () => {
  const body = [offAction('b1', 'O1'), offAction('b2', 'O3')];
  const actions = [offAction('a0', 'O1'), ...body, offAction('a9', 'O4')];

  it('déroule maxCycles fois (avant + K×corps + après)', () => {
    const out = expandContinuityLoop(actions, loop3, ['O1', 'O2', 'O3', 'O4', 'O5']);
    // 1 (avant) + 3 cycles × 2 (corps) + 1 (après) = 8
    expect(out).toHaveLength(8);
  });

  it('cycle 0 = identité (id + params conservés)', () => {
    const out = expandContinuityLoop(actions, loop3, ['O1', 'O2', 'O3', 'O4', 'O5']);
    expect(out[1].id).toBe('b1');
    expect((out[1] as OffensiveScriptedAction).params.passer).toBe('O1');
  });

  it('cycle 1 = id namespacé + params σ¹', () => {
    const out = expandContinuityLoop(actions, loop3, ['O1', 'O2', 'O3', 'O4', 'O5']);
    const c1 = out[3]; // avant(1) + corps c0(2) → index 3 = b1#c1
    expect(c1.id).toBe('b1#c1');
    expect((c1 as OffensiveScriptedAction).params.passer).toBe('O2');
  });

  it('maxCycles clampé à 6', () => {
    const out = expandContinuityLoop(actions, { ...loop3, maxCycles: 99 }, ['O1', 'O2', 'O3', 'O4', 'O5']);
    expect(out).toHaveLength(1 + 6 * 2 + 1);
  });

  it('rotation invalide (pas une permutation) → fallback liste inchangée', () => {
    const out = expandContinuityLoop(actions, { ...loop3, rotation: ['O1', 'O2'] }, ['O1', 'O2', 'O3', 'O4', 'O5']);
    expect(out).toBe(actions);
  });

  it('plage invalide (id absent) → fallback', () => {
    const out = expandContinuityLoop(actions, { ...loop3, endActionId: 'nope' }, ['O1', 'O2', 'O3', 'O4', 'O5']);
    expect(out).toBe(actions);
  });

  it('corps contenant une action non-offensive → fallback', () => {
    const def: ScriptedAction = { kind: 'defensive', id: 'b2', type: 'switch', params: {} } as ScriptedAction;
    const mixed = [offAction('a0', 'O1'), offAction('b1', 'O1'), def, offAction('a9', 'O4')];
    const out = expandContinuityLoop(mixed, { ...loop3, endActionId: 'b2' }, ['O1', 'O2', 'O3', 'O4', 'O5']);
    expect(out).toBe(mixed);
  });

  it('sortie anticipée : exitAtCycle(k)=true stoppe + joue exitActions remappées, puis après', () => {
    const exit = [offAction('x', 'O1')];
    const out = expandContinuityLoop(actions, loop3, ['O1', 'O2', 'O3', 'O4', 'O5'], {
      exitAtCycle: (k) => k === 2,
      exitActions: exit,
    });
    // avant(1) + 2 cycles × 2 (c0,c1) + exit(1) + après(1) = 7
    expect(out).toHaveLength(7);
    const exitAction = out[5];
    expect(exitAction.id).toBe('x#c2');
    expect((exitAction as OffensiveScriptedAction).params.passer).toBe('O3'); // σ²
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/continuityLoop.test.ts` → les nouveaux FAIL.

- [ ] **Step 3: Implémenter** — ajouter dans `continuityLoop.ts` :

```typescript
const MAX_CYCLES_CAP = 6;

/** Applique σ^k à une action OFFENSIVE et lui donne un id de cycle unique
 *  (`${id}#c${k}`) pour le namespacing des manualOverride. k=0 = identité. */
function rotateAction(action: ScriptedAction, rotation: AttackerId[], k: number): ScriptedAction {
  if (action.kind !== 'offensive' || k === 0) return action;
  return { ...action, id: `${action.id}#c${k}`, params: rotateActionParams(action.params, rotation, k) };
}

function isPermutationOf(rotation: AttackerId[], active: AttackerId[]): boolean {
  if (rotation.length !== active.length) return false;
  const set = new Set(rotation);
  if (set.size !== rotation.length) return false; // doublons
  return active.every((a) => set.has(a));
}

export interface ContinuityExpandOptions {
  /** Vrai au cycle k → la boucle sort tôt (cycle k NON joué). */
  exitAtCycle?: (cycle: number) => boolean;
  /** Actions de finition jouées (remappées σ^k) à la sortie anticipée. */
  exitActions?: ScriptedAction[];
}

/** Déroule la boucle de continuité en une liste d'actions plate.
 *  Boucle invalide (rotation non-permutation, plage invalide, corps non
 *  exclusivement offensif) → renvoie `actions` inchangé (fallback legacy). */
export function expandContinuityLoop(
  actions: ScriptedAction[],
  loop: ContinuityLoop | undefined | null,
  activeAttackers: AttackerId[],
  options?: ContinuityExpandOptions,
): ScriptedAction[] {
  if (!loop) return actions;
  if (!isPermutationOf(loop.rotation, activeAttackers)) return actions;

  const startIdx = actions.findIndex((a) => a.id === loop.startActionId);
  const endIdx = actions.findIndex((a) => a.id === loop.endActionId);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) return actions;

  const body = actions.slice(startIdx, endIdx + 1);
  if (body.some((a) => a.kind !== 'offensive')) return actions;

  const before = actions.slice(0, startIdx);
  const after = actions.slice(endIdx + 1);
  const cycles = Math.max(1, Math.min(MAX_CYCLES_CAP, Math.floor(loop.maxCycles)));

  const out: ScriptedAction[] = [...before];
  for (let k = 0; k < cycles; k++) {
    if (options?.exitAtCycle?.(k)) {
      for (const a of options.exitActions ?? []) out.push(rotateAction(a, loop.rotation, k));
      return [...out, ...after];
    }
    for (const a of body) out.push(rotateAction(a, loop.rotation, k));
  }
  return [...out, ...after];
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/continuityLoop.test.ts` → tous PASS (14).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/reads/continuityLoop.ts src/lib/logic/reads/__tests__/continuityLoop.test.ts
git commit -m "feat(motion): expandContinuityLoop — unroll + rotation + sortie anticipée"
```

---

## Task 1.4 — Intégration dans `compileScenario`

**Files:**
- Modify: `src/lib/logic/compileScenario.ts`

- [ ] **Step 1: Étendre `CompileInput`** — ajouter après `activeBranch?` (ligne ~27) :

```typescript
  /** Phase Motion — boucle de continuité à dérouler avant les passes. */
  continuityLoop?: import('@/lib/types').ContinuityLoop | null;
  /** Sortie anticipée (option C) : prédicat évalué aux frontières de cycle. */
  continuityExitAtCycle?: (cycle: number) => boolean;
  /** Actions de finition jouées à la sortie anticipée. */
  continuityExitActions?: ScriptedAction[];
```

- [ ] **Step 2: Importer les helpers** — en tête de `compileScenario.ts` :

```typescript
import { getActiveAttackerIds } from './players';
import { expandContinuityLoop } from './reads/continuityLoop';
```

- [ ] **Step 3: Dérouler la boucle après la résolution de branche** — juste après le bloc qui calcule `actions` (la liste effective, ligne ~49, après le `else { actions = mainActions; }`), insérer :

```typescript
  // Phase Motion — expansion de la boucle de continuité (no-op si absente ou
  // invalide). Opère sur la liste effective ; passes 1 & 2 itèrent le résultat.
  actions = expandContinuityLoop(
    actions,
    input.continuityLoop,
    getActiveAttackerIds(input.playerCount ?? 5),
    { exitAtCycle: input.continuityExitAtCycle, exitActions: input.continuityExitActions },
  );
```

(Note : `actions` est déjà `let`, l'affectation est licite.)

- [ ] **Step 4: Faire itérer la passe 2 sur la liste déroulée** — la passe 1 utilise déjà `actions` (devenu déroulé). Vérifier que la passe 2 lit aussi `actions` (ligne ~108 : `const defensives = actions.filter(...)`) — c'est le cas, aucune modif. Les défensives en `before`/`after` sont préservées une fois ; le corps est offensif-only (garanti par la validation).

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Suite compile** : `npx vitest run compileScenario` → tous PASS (rétrocompat : sans `continuityLoop`, `expandContinuityLoop` renvoie la liste inchangée).

---

## Task 1.5 — Câblage `recompileScenarioSteps` (state → compiler + sortie Phase L)

**Files:**
- Modify: `src/lib/state/transforms/shared.ts` (fonction `recompileScenarioSteps`, lignes ~25-50)

- [ ] **Step 1: Passer `continuityLoop` + calculer la sortie** — dans `recompileScenarioSteps`, après `const { branch: activeBranch } = selectReactiveBranch(state);` (ligne ~35), ajouter :

```typescript
  // Phase Motion — sortie anticipée : armée si la boucle référence une branche
  // de sortie ET que la lecture réactive résout justement cette branche. V1 :
  // évaluation statique (la couverture ne variant pas par cycle, la sortie tombe
  // au cycle 0 si elle matche — cf. limite documentée dans le spec).
  const loop = state.continuityLoop;
  const exitArmed = !!(loop?.exitBranchId && activeBranch && activeBranch.id === loop.exitBranchId);
  const exitBranch = exitArmed
    ? (state.scenarioBranches ?? []).find((b) => b.id === loop!.exitBranchId)
    : undefined;
```

- [ ] **Step 2: Étendre l'appel `compileScenario`** — ajouter les 3 champs à l'objet passé (après `activeBranch,` ligne ~42) :

```typescript
    continuityLoop: loop,
    continuityExitAtCycle: exitArmed ? () => true : undefined,
    continuityExitActions: exitBranch?.actions,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Suite complète** : `npx vitest run` → tous PASS (1977, rétrocompat).

---

## Task 1.6 — Test d'intégration (rotation réelle + fermeture)

**Files:**
- Create: `src/lib/logic/reads/__tests__/continuityIntegration.test.ts`

- [ ] **Step 1: Écrire le test** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AppState, ContinuityLoop, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';
import { makeInitialState } from '@/lib/data/initial';

/** Deux passes en boucle : O1→O2 puis O2→O3, rotation O1→O2→O3→O4→O5. */
function passAction(id: string, passer: 'O1' | 'O2', receiver: 'O2' | 'O3'): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'pass', params: { passer, receiver } };
}

describe('continuity — intégration compileScenario', () => {
  const s0: AppState = makeInitialState();
  const actions = [passAction('b1', 'O1', 'O2'), passAction('b2', 'O2', 'O3')];
  const loop: ContinuityLoop = {
    startActionId: 'b1', endActionId: 'b2',
    rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 2,
  };

  it('sans boucle → steps identiques (rétrocompat)', () => {
    const base = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
    });
    const withUndef = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: undefined,
    });
    expect(withUndef.length).toBe(base.length);
  });

  it('avec boucle 2 cycles → plus de steps que le chemin simple', () => {
    const base = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
    });
    const looped = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: loop,
    });
    expect(looped.length).toBeGreaterThan(base.length);
  });

  it('le cycle 1 porte des generatedBy namespacés (#c1)', () => {
    const looped = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: loop,
    });
    const c1Steps = looped.filter((st) => st.generatedBy?.includes('#c1'));
    expect(c1Steps.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/continuityIntegration.test.ts` → 3 PASS. (Si le type d'action `'pass'` n'existe pas dans le catalogue, remplacer par un `type` offensif présent dans `SCRIPTED_GENERATORS` — vérifier via `grep "type:" src/lib/data/scriptedActionsCatalog.ts`.)

---

## Task 1.7 — Règle 1 / 1bis + commit + push

- [ ] **Step 1: Suites garde-fou** : `npx vitest run overlap screens userJson screenLab` → tous PASS.

- [ ] **Step 2: Suite complète** : `npx vitest run` → 1977+ PASS (cible ~1996, +19).

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/logic/compileScenario.ts \
        src/lib/state/transforms/shared.ts \
        src/lib/logic/reads/__tests__/continuityIntegration.test.ts
git commit -m "feat(motion): brancher l'expansion de continuité dans le compilateur + sortie Phase L"
git push
```

---

# CHANTIER 2 — Transforms + UI

## Task 2.1 — Transform `setContinuityLoop` (TDD)

**Files:**
- Create: `src/lib/state/transforms/__tests__/continuityTransforms.test.ts`
- Modify: `src/lib/state/transforms/scenarioTransforms.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { setContinuityLoop } from '@/lib/state/transforms/scenarioTransforms';
import type { AppState, ContinuityLoop } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  return { ...makeInitialState(), scriptedActions: [] };
}

const loop: ContinuityLoop = {
  startActionId: 'b1', endActionId: 'b2',
  rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 3,
};

describe('setContinuityLoop', () => {
  it('pose la boucle', () => {
    const s = setContinuityLoop(base(), loop);
    expect(s.continuityLoop).toEqual(loop);
  });

  it('null efface la boucle', () => {
    const s = setContinuityLoop({ ...base(), continuityLoop: loop }, null);
    expect(s.continuityLoop).toBeUndefined();
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/continuityTransforms.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** — ajouter dans `scenarioTransforms.ts` (l'import `ContinuityLoop` : étendre l'import `@/lib/types` existant en tête) :

```typescript
export function setContinuityLoop(s: AppState, loop: ContinuityLoop | null): AppState {
  const next = { ...s };
  if (loop) next.continuityLoop = loop;
  else delete next.continuityLoop;
  return recompileScenarioSteps(next);
}
```

(Ajouter `ContinuityLoop` à l'import de types en tête : `import type { AppState, ContinuityLoop, ScenarioBranch, ScriptedAction } from '@/lib/types';`.)

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/continuityTransforms.test.ts` → 2 PASS.

- [ ] **Step 5: Suite complète** : `npx vitest run` → tous PASS.

---

## Task 2.2 — Callback `useAppState`

**Files:**
- Modify: `src/hooks/useAppState.ts`

- [ ] **Step 1: Ajouter le callback** — après les callbacks de lecture probabiliste (`rerollCoverage`, ligne ~643) :

```typescript
  const setContinuityLoop = useCallback(
    (loop: import('@/lib/types').ContinuityLoop | null) => {
      setStateWithHistory((s) => scenarioTx.setContinuityLoop(s, loop));
    },
    [setStateWithHistory],
  );
```

- [ ] **Step 2: Exporter** — dans l'objet retourné, après `rerollCoverage,` :

```typescript
    setContinuityLoop,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 2.3 — Props ScenarioPanel + câblage page.tsx

**Files:**
- Modify: `src/components/ScenarioPanel.tsx` (interface props)
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Props dans l'interface `ScenarioPanelProps`** — après les props de lecture probabiliste (`onRerollCoverage`, ligne ~81) :

```typescript
  continuityLoop?: import('@/lib/types').ContinuityLoop;
  onSetContinuityLoop: (loop: import('@/lib/types').ContinuityLoop | null) => void;
```

- [ ] **Step 2: Câbler dans page.tsx** — après `onRerollCoverage={app.rerollCoverage}` :

```typescript
                    continuityLoop={app.state.continuityLoop}
                    onSetContinuityLoop={app.setContinuityLoop}
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → erreurs attendues tant que l'UI (Task 2.4) n'utilise pas les props ; passer au Task 2.4 puis re-checker.

---

## Task 2.4 — Section UI ScenarioPanel

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

- [ ] **Step 1: Calculer les données dérivées** — dans le composant, après le bloc `dist = props.coverageDistribution ?? []` (section Phase L proba) ou après `const activeBranch = ...`, ajouter :

```typescript
  // Phase Motion — continuity : actions offensives candidates pour borner la
  // boucle, et attaquants actifs pour la roue de rotation.
  const offActionsForLoop = props.scriptedActions
    .map((a, i) => ({ a, i }))
    .filter((x) => x.a.kind === 'offensive');
  const loopActive = !!props.continuityLoop;
  const loop = props.continuityLoop;
  const rotation = loop?.rotation ?? attackerIds;

  const defaultLoop = (): import('@/lib/types').ContinuityLoop | null => {
    if (offActionsForLoop.length < 2) return null;
    return {
      startActionId: offActionsForLoop[0].a.id,
      endActionId: offActionsForLoop[offActionsForLoop.length - 1].a.id,
      rotation: attackerIds,
      maxCycles: 3,
    };
  };
```

- [ ] **Step 2: Rendre la section** — après la section « Lecture probabiliste » (fermeture de son bloc `hasReactiveScreenBranches && (...)`), insérer :

```tsx
      {offActionsForLoop.length >= 2 && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={loopActive}
              onChange={(e) => props.onSetContinuityLoop(e.target.checked ? defaultLoop() : null)}
            />
            🔁 Continuité (motion) — boucle rotative
          </label>

          {loopActive && loop && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Plage de boucle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>de</span>
                <select
                  value={loop.startActionId}
                  onChange={(e) => props.onSetContinuityLoop({ ...loop, startActionId: e.target.value })}
                  style={{ fontSize: 11 }}
                >
                  {offActionsForLoop.map((x) => (
                    <option key={x.a.id} value={x.a.id}>#{x.i + 1} {x.a.type}</option>
                  ))}
                </select>
                <span style={{ color: '#94a3b8' }}>à</span>
                <select
                  value={loop.endActionId}
                  onChange={(e) => props.onSetContinuityLoop({ ...loop, endActionId: e.target.value })}
                  style={{ fontSize: 11 }}
                >
                  {offActionsForLoop.map((x) => (
                    <option key={x.a.id} value={x.a.id}>#{x.i + 1} {x.a.type}</option>
                  ))}
                </select>
              </div>

              {/* Roue de rotation */}
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                <div style={{ color: '#94a3b8', marginBottom: 2 }}>Rotation des rôles :</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {rotation.map((p, ri) => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <strong>{p}</strong>
                      {ri < rotation.length - 1 && <span style={{ color: '#64748b' }}>→</span>}
                      <button
                        onClick={() => {
                          const next = [...rotation];
                          const j = (ri + 1) % next.length;
                          [next[ri], next[j]] = [next[j], next[ri]];
                          props.onSetContinuityLoop({ ...loop, rotation: next });
                        }}
                        title="Permuter avec le suivant"
                        style={{ border: 'none', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 10 }}
                      >⇄</button>
                    </span>
                  ))}
                  <span style={{ color: '#64748b' }}>↺</span>
                </div>
              </div>

              {/* Cycles max */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>cycles max</span>
                <input
                  type="number" min={1} max={6} step={1}
                  value={loop.maxCycles}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                    props.onSetContinuityLoop({ ...loop, maxCycles: v });
                  }}
                  style={{ width: 48, fontSize: 11 }}
                />
              </div>

              {/* Sortie sur lecture (option C) */}
              {props.scenarioBranches.some((b) => b.trigger?.kind === 'screen-coverage') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ color: '#94a3b8' }}>sortir si lecture</span>
                  <select
                    value={loop.exitBranchId ?? ''}
                    onChange={(e) => props.onSetContinuityLoop({ ...loop, exitBranchId: e.target.value || null })}
                    style={{ fontSize: 11 }}
                  >
                    <option value="">— aucune —</option>
                    {props.scenarioBranches
                      .filter((b) => b.trigger?.kind === 'screen-coverage')
                      .map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Récap */}
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Boucle : {rotation.join('→')} ↺ · {loop.maxCycles} cycles max
                {loop.exitBranchId ? ' · sortie sur lecture' : ''}
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 2b: Vérifier l'import de type** — `ScreenRule` est déjà importé (Phase L) ; `ContinuityLoop` est référencé via `import('@/lib/types').ContinuityLoop` inline, pas besoin d'ajout d'import nommé.

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 5: Vérif visuelle** : `preview_start`, `preview_console_logs level=error` → zéro erreur. La section n'apparaît qu'avec ≥ 2 actions offensives ; vérif fonctionnelle couverte par les tests.

---

## Task 2.5 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/lib/state/transforms/scenarioTransforms.ts \
        src/lib/state/transforms/__tests__/continuityTransforms.test.ts \
        src/hooks/useAppState.ts \
        src/app/page.tsx \
        src/components/ScenarioPanel.tsx
git commit -m "feat(motion): continuity — transform setContinuityLoop + UI ScenarioPanel"
git push
```

---

# CHANTIER 3 — Docs

## Task 3.1 — Sync

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, en tête :

```markdown
### Phase Motion — Continuity offense (boucle rotative) (2026-06-02)

Première brique du motion offense (IDEAS §2). Une plage d'actions offensives
`[startActionId, endActionId]` est rejouée jusqu'à K cycles (1–6) avec rotation
des rôles : la permutation σ relabelise les IDs joueurs à chaque cycle (σ^k),
chaque cycle recevant un id d'action namespacé (`#cK`) pour préserver les
manualOverride. La défense suit son homme (aucun remap). Sortie hybride : max K
cycles ou sortie anticipée sur lecture Phase L (`exitBranchId`). Helpers purs
`rotateActionParams` / `expandContinuityLoop`, opt-in `continuityLoop`. UI
ScenarioPanel (plage, roue de rotation, cycles, sortie). ~19 tests.
```

- [ ] **Step 2: IDEAS §2** — annoter l'item « Pas de continuité / motion offense » :
  ajouter en fin d'item `✅ **Boucle de continuité rotative livrée 2026-06-02** (replacement/relocate + ball reversal restants — specs séparés).`

- [ ] **Step 3: ROADMAP** — dans le bloc motion/offense, mentionner la boucle de continuité livrée 2026-06-02 (replacement + reversal restants).

- [ ] **Step 4: fiba-actions-roadmap** — ligne « Continuity offense » : passer 🔜 → ✅ avec note `boucle rotative au compile-time (continuityLoop)`.

- [ ] **Step 5: GAME-ENGINE** — section Orchestration : ajouter une ligne sur l'expansion de boucle (`expandContinuityLoop` appelée dans `compileScenario` avant les passes).

- [ ] **Step 6: todo-priorities** — section « Livrés 2026-06-02 » : ajouter la continuity offense.

- [ ] **Step 7: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md IDEAS.md docs/fiba-actions-roadmap.md docs/GAME-ENGINE.md docs/todo-priorities.md
git commit -m "docs: continuity offense (boucle rotative) livrée"
git push
```

---

## Notes d'exécution

- **Règle 1bis** : aucun fichier `screens/` ni `defense/context.ts` touché. La
  passe défensive + `breakUpTeleports` + `smoothMovementFlickers` tournent sur la
  liste déroulée. Lancer `overlap screens userJson screenLab` avant le commit du
  chantier 1.
- **Rétrocompat** : `continuityLoop === undefined` → `expandContinuityLoop`
  renvoie la liste inchangée → 0 diff de comportement.
- **Naming** : helper pur `expandContinuityLoop(actions, loop, …)` vs transform
  `setContinuityLoop(state, loop)` — distincts.
- **Suite de référence** : 1977 verte au départ. Cible ~1996 (+19).
- **Limite V1 (sortie-sur-lecture)** : avec couverture statique, la sortie tombe
  au cycle 0 si elle matche (cf. spec § « Limite honnête de l'hybride V1 »). Le
  mécanisme d'unroll + truncation est néanmoins testé avec un prédicat variable.
- **Hors scope** : replacement/relocate (sous-projet B), ball reversal (C),
  rotation auto-dérivée/miroir, sortie intra-cycle, snap formation.
```
