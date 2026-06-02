# Auto-replacement (motion sous-projet B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-déclencher une cascade de fill (fill-from-behind) quand un cut/drive vide un spot périmètre, pour maintenir le spacing sans action manuelle.

**Architecture:** Module pur `autoReplacement.ts` (trigger detection + cascade + merge avec clearance). `compileScenario` appelle l'enrichissement dans la passe 1, juste après le générateur d'une action déclencheuse : les fillers sont fusionnés (concurrent) dans le dernier step généré. Opt-in `autoReplacementEnabled` ; la défense suit son homme (aucun remap).

**Tech Stack:** TypeScript strict, Vitest (TDD). Touche `compileScenario.ts` ; clearance explicite via `pushOutOfMany` (Règle 1) + test garde-fou.

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-auto-replacement-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| 1 | `src/lib/types/index.ts` | 2 champs AppState |
| 1 | `src/lib/logic/autoOffense/autoReplacement.ts` | module pur (créer) |
| 1 | `src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` | tests (créer) |
| 1 | `src/lib/logic/compileScenario.ts` | enrichissement passe 1 + champs CompileInput |
| 1 | `src/lib/state/transforms/shared.ts` | câbler les 2 champs |
| 1 | `src/lib/logic/reads/__tests__/autoReplacementIntegration.test.ts` | intégration (créer) |
| 1 | `src/lib/logic/__tests__/overlapInvariants.test.ts` | invariant clearance |
| 2 | `src/lib/state/transforms/scenarioTransforms.ts` | transform `setAutoReplacement` |
| 2 | `src/lib/state/transforms/__tests__/autoReplacementTransforms.test.ts` | tests (créer) |
| 2 | `src/hooks/useAppState.ts` | callback |
| 2 | `src/app/page.tsx` | câblage props |
| 2 | `src/components/ScenarioPanel.tsx` | section UI |
| 3 | `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md` | docs |

---

# CHANTIER 1 — Noyau (types + module pur + compilateur)

## Task 1.1 — Types AppState

**Files:**
- Modify: `src/lib/types/index.ts` (après `continuityLoop?` ligne ~1330)

- [ ] **Step 1: Ajouter les 2 champs** — après `continuityLoop?: ContinuityLoop;` :

```typescript
  /** Phase Motion — auto-replacement : quand un cut/drive vide un spot, la
   *  cascade de fill comble le périmètre. undefined = off (legacy). */
  autoReplacementEnabled?: boolean;
  /** Profondeur max de la cascade (nb de maillons). Défaut 2, clampé 1…4. */
  autoReplacementDepth?: number;
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 1.2 — Trigger detection (TDD)

**Files:**
- Create: `src/lib/logic/autoOffense/autoReplacement.ts`
- Create: `src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { isReplacementTrigger, replacementCutterId } from '@/lib/logic/autoOffense/autoReplacement';
import type { OffensiveScriptedAction } from '@/lib/types';

function off(type: string, params: Record<string, unknown>): OffensiveScriptedAction {
  return { kind: 'offensive', id: 'a', type: type as OffensiveScriptedAction['type'], params } as OffensiveScriptedAction;
}

describe('isReplacementTrigger', () => {
  it('vrai pour les cuts + give-and-go + drive', () => {
    for (const t of ['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']) {
      expect(isReplacementTrigger(t)).toBe(true);
    }
  });
  it('faux pour les autres', () => {
    for (const t of ['pass', 'pick-and-roll', 'shoot', 'drift']) {
      expect(isReplacementTrigger(t)).toBe(false);
    }
  });
});

describe('replacementCutterId', () => {
  it('cuts → params.cutter', () => {
    expect(replacementCutterId(off('basket-cut', { cutter: 'O3' }))).toBe('O3');
  });
  it('give-and-go → params.giver', () => {
    expect(replacementCutterId(off('give-and-go', { giver: 'O2' }))).toBe('O2');
  });
  it('drive → params.driver', () => {
    expect(replacementCutterId(off('drive', { driver: 'O1' }))).toBe('O1');
  });
  it('absent → null', () => {
    expect(replacementCutterId(off('basket-cut', {}))).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Créer `autoReplacement.ts`** :

```typescript
// Phase Motion — auto-replacement : cascade de fill (fill-from-behind)
// déclenchée quand un cut/drive vide un spot périmètre. Purs. Voir
// docs/superpowers/specs/2026-06-02-auto-replacement-design.md.

import type { AttackerId, AttackerPositions, OffensiveScriptedAction, Point, Step } from '../../types';
import { COURT_CENTERLINE_X, PLAYER_MIN_CLEARANCE_PX } from '../../data/court';
import { distance, distHoop, pushOutOfMany } from '../geometry';

/** Actions qui vident un spot périmètre vers le panier. */
const TRIGGER_TYPES = new Set(['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']);

export function isReplacementTrigger(type: string): boolean {
  return TRIGGER_TYPES.has(type);
}

/** Identifie le joueur qui coupe selon le type d'action. */
export function replacementCutterId(action: OffensiveScriptedAction): AttackerId | null {
  switch (action.type) {
    case 'give-and-go': return action.params.giver ?? null;
    case 'drive': return action.params.driver ?? null;
    default: return action.params.cutter ?? null;
  }
}
```

(Les symboles `COURT_CENTERLINE_X`/`PLAYER_MIN_CLEARANCE_PX`/`distance`/`distHoop`/`pushOutOfMany` sont consommés aux Tasks 1.3–1.4. `tsconfig` n'a pas `noUnusedLocals`, donc l'import anticipé ne casse pas le build.)

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → les tests trigger PASS.

---

## Task 1.3 — Cascade `pickFiller` + `computeReplacementChain` (TDD)

**Files:**
- Modify: `src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts`
- Modify: `src/lib/logic/autoOffense/autoReplacement.ts`

- [ ] **Step 1: Ajouter les tests** :

```typescript
import { pickFiller, computeReplacementChain } from '@/lib/logic/autoOffense/autoReplacement';
import type { AttackerId, AttackerPositions } from '@/lib/types';

// HOOP = {300,75}. « plus loin du panier » = distHoop plus grand.
const ACTIVE: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

describe('pickFiller', () => {
  const prevOff: AttackerPositions = {
    O1: { x: 300, y: 250 }, // top (carrier)
    O2: { x: 480, y: 200 }, // wing droit (cutter)
    O3: { x: 500, y: 320 }, // droite, plus loin du panier → filler
    O4: { x: 120, y: 200 }, // gauche
    O5: { x: 150, y: 320 }, // gauche
  };
  it('choisit le coéquipier même côté + plus loin du panier, le plus proche', () => {
    const f = pickFiller(prevOff, prevOff.O2, new Set<AttackerId>(['O2', 'O1']), ACTIVE);
    expect(f).toBe('O3');
  });
  it('exclut les joueurs de excluded', () => {
    const f = pickFiller(prevOff, prevOff.O2, new Set<AttackerId>(['O2', 'O1', 'O3']), ACTIVE);
    expect(f).toBeNull(); // plus personne à droite plus loin du panier
  });
  it('null si personne plus loin du panier (cut depuis le fond)', () => {
    const f = pickFiller(prevOff, { x: 520, y: 400 }, new Set<AttackerId>(['O2', 'O1']), ACTIVE);
    expect(f).toBeNull();
  });
});

describe('computeReplacementChain', () => {
  const prevOff: AttackerPositions = {
    O1: { x: 300, y: 250 },
    O2: { x: 480, y: 200 }, // cutter
    O3: { x: 500, y: 320 }, // fill 1
    O4: { x: 510, y: 430 }, // droite encore plus loin → fill 2 (cascade)
    O5: { x: 150, y: 320 },
  };
  it('cascade profondeur 2 : O3 comble O2, O4 comble O3', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 2);
    expect(chain.map((r) => r.player)).toEqual(['O3', 'O4']);
    expect(chain[0].target).toEqual(prevOff.O2);
    expect(chain[1].target).toEqual(prevOff.O3);
  });
  it('profondeur 1 → un seul maillon', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 1);
    expect(chain).toHaveLength(1);
    expect(chain[0].player).toBe('O3');
  });
  it('le porteur ne comble jamais', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O3', ACTIVE, 4);
    expect(chain.every((r) => r.player !== 'O3')).toBe(true);
  });
  it('clamp profondeur (99 → max 4, 0 → min 1)', () => {
    expect(computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 99).length).toBeLessThanOrEqual(4);
    expect(computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 0).length).toBeGreaterThanOrEqual(1);
  });
  it('cutter introuvable → []', () => {
    const chain = computeReplacementChain(prevOff, 'O9' as AttackerId, 'O1', ACTIVE, 2);
    expect(chain).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → les nouveaux FAIL.

- [ ] **Step 3: Implémenter** — ajouter dans `autoReplacement.ts` :

```typescript
export interface Relocation {
  player: AttackerId;
  target: Point;
}

function sameSide(a: Point, b: Point): boolean {
  return Math.sign(a.x - COURT_CENTERLINE_X) === Math.sign(b.x - COURT_CENTERLINE_X);
}

/** Le filler = coéquipier ∉ excluded, MÊME CÔTÉ que `vacated`, PLUS LOIN du
 *  panier, et le plus proche du spot. null si aucun (cascade s'arrête). */
export function pickFiller(
  prevOff: AttackerPositions,
  vacated: Point,
  excluded: Set<AttackerId>,
  active: AttackerId[],
): AttackerId | null {
  let best: AttackerId | null = null;
  let bestDist = Infinity;
  for (const p of active) {
    if (excluded.has(p)) continue;
    const pos = prevOff[p];
    if (!pos) continue;
    if (!sameSide(pos, vacated)) continue;
    if (distHoop(pos) <= distHoop(vacated)) continue;
    const d = distance(pos, vacated);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** Cascade fill-from-behind : le spot du cutter est comblé par le joueur derrière
 *  (même côté, plus haut), dont la place devient le spot suivant. Bornée à
 *  `depth` (clampé 1…4) + arrêt naturel. Le porteur ne comble jamais. */
export function computeReplacementChain(
  prevOff: AttackerPositions,
  cutterId: AttackerId,
  ballCarrierId: AttackerId,
  active: AttackerId[],
  depth: number,
): Relocation[] {
  const start = prevOff[cutterId];
  if (!start) return [];
  const maxDepth = Math.max(1, Math.min(4, Math.floor(depth)));
  const relocations: Relocation[] = [];
  const excluded = new Set<AttackerId>([cutterId, ballCarrierId]);
  let vacated = start;
  for (let d = 0; d < maxDepth; d++) {
    const filler = pickFiller(prevOff, vacated, excluded, active);
    if (!filler) break;
    relocations.push({ player: filler, target: vacated });
    excluded.add(filler);
    vacated = prevOff[filler];
  }
  return relocations;
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → tous PASS.

---

## Task 1.4 — `applyReplacementToStep` avec clearance (TDD)

**Files:**
- Modify: `src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts`
- Modify: `src/lib/logic/autoOffense/autoReplacement.ts`

- [ ] **Step 1: Ajouter les tests** :

```typescript
import { applyReplacementToStep } from '@/lib/logic/autoOffense/autoReplacement';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { Step } from '@/lib/types';

function step(off: AttackerPositions): Step {
  return { off, ballCarrier: 'O1', annotations: [] };
}

describe('applyReplacementToStep', () => {
  it('fusionne les positions des fillers', () => {
    const s = step({
      O1: { x: 300, y: 250 }, O2: { x: 480, y: 80 }, O3: { x: 500, y: 320 },
      O4: { x: 120, y: 200 }, O5: { x: 150, y: 320 },
    });
    const out = applyReplacementToStep(s, [{ player: 'O3', target: { x: 480, y: 200 } }]);
    expect(out.off.O3.x).toBeGreaterThan(450);
    expect(out.off.O3.y).toBeLessThan(320);
    expect(out.off.O1).toEqual(s.off.O1); // les autres intacts
  });

  it('respecte la clearance entre fillers placés au même endroit', () => {
    const s = step({
      O1: { x: 300, y: 250 }, O2: { x: 50, y: 50 }, O3: { x: 60, y: 60 },
      O4: { x: 120, y: 200 }, O5: { x: 150, y: 320 },
    });
    const target = { x: 480, y: 200 };
    const out = applyReplacementToStep(s, [
      { player: 'O2', target }, { player: 'O3', target },
    ]);
    expect(distance(out.off.O2, out.off.O3)).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
  });

  it('relocations vide → step inchangé (même référence)', () => {
    const s = step({
      O1: { x: 1, y: 1 }, O2: { x: 2, y: 2 }, O3: { x: 3, y: 3 },
      O4: { x: 4, y: 4 }, O5: { x: 5, y: 5 },
    });
    expect(applyReplacementToStep(s, [])).toBe(s);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → les nouveaux FAIL.

- [ ] **Step 3: Implémenter** — ajouter dans `autoReplacement.ts` :

```typescript
/** Fusionne les positions des fillers dans le step (concurrent). Chaque cible
 *  passe par pushOutOfMany contre les AUTRES joueurs déjà placés → Règle 1. */
export function applyReplacementToStep(step: Step, relocations: Relocation[]): Step {
  if (relocations.length === 0) return step;
  const off: AttackerPositions = { ...step.off };
  for (const { player, target } of relocations) {
    const others: Point[] = (Object.keys(off) as AttackerId[])
      .filter((id) => id !== player)
      .map((id) => off[id]);
    off[player] = pushOutOfMany(target, others, PLAYER_MIN_CLEARANCE_PX);
  }
  return { ...step, off };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts` → tous PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/index.ts src/lib/logic/autoOffense/autoReplacement.ts src/lib/logic/autoOffense/__tests__/autoReplacement.test.ts
git commit -m "feat(motion): autoReplacement — module pur (trigger + cascade + clearance)"
```

---

## Task 1.5 — Intégration `compileScenario` + câblage recompile

**Files:**
- Modify: `src/lib/logic/compileScenario.ts`
- Modify: `src/lib/state/transforms/shared.ts`

- [ ] **Step 1: Étendre `CompileInput`** — après `continuityExitActions?` :

```typescript
  /** Phase Motion — auto-replacement : déclenche la cascade de fill sur cut/drive. */
  autoReplacementEnabled?: boolean;
  autoReplacementDepth?: number;
```

- [ ] **Step 2: Importer le module** — en tête de `compileScenario.ts` (`getActiveAttackerIds` est déjà importé) :

```typescript
import { applyReplacementToStep, computeReplacementChain, isReplacementTrigger, replacementCutterId } from './autoOffense/autoReplacement';
```

- [ ] **Step 3: Enrichir dans la passe 1** — dans la boucle `for (const action of actions)`, juste après `if (generated.length === 0) continue;` (et avant `const startIndex = result.length;`), insérer :

```typescript
    // Phase Motion — auto-replacement : si l'action vide un spot, la cascade de
    // fill est fusionnée dans le dernier step généré (concurrent). `action` est
    // déjà narrowed offensive (guard en tête de boucle).
    if (input.autoReplacementEnabled && isReplacementTrigger(action.type)) {
      const cutterId = replacementCutterId(action);
      if (cutterId) {
        const chain = computeReplacementChain(
          prev.off, cutterId, prev.ballCarrier,
          getActiveAttackerIds(input.playerCount ?? 5),
          input.autoReplacementDepth ?? 2,
        );
        if (chain.length > 0) {
          generated[generated.length - 1] = applyReplacementToStep(generated[generated.length - 1], chain);
        }
      }
    }
```

- [ ] **Step 4: Câbler dans `recompileScenarioSteps`** (`shared.ts`) — ajouter à l'objet passé à `compileScenario` (après `continuityExitActions:`) :

```typescript
    autoReplacementEnabled: state.autoReplacementEnabled,
    autoReplacementDepth: state.autoReplacementDepth,
```

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Suites compile** : `npx vitest run scenario scripted golden compile` → tous PASS (rétrocompat : flag off → 0 diff).

---

## Task 1.6 — Test d'intégration + invariant overlap

**Files:**
- Create: `src/lib/logic/reads/__tests__/autoReplacementIntegration.test.ts`
- Modify: `src/lib/logic/__tests__/overlapInvariants.test.ts`

- [ ] **Step 1: Écrire l'intégration** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AttackerPositions, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 250 }, // top (carrier)
  O2: { x: 480, y: 200 }, // wing droit (cutter)
  O3: { x: 500, y: 320 }, // droite, plus loin → filler
  O4: { x: 120, y: 200 },
  O5: { x: 150, y: 320 },
};
const cut: OffensiveScriptedAction = {
  kind: 'offensive', id: 'c1', type: 'basket-cut', params: { cutter: 'O2' },
};

describe('auto-replacement — intégration compileScenario', () => {
  it('flag off → O3 ne bouge pas (rétrocompat)', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5 });
    const cutStep = steps.find((s) => s.generatedBy === 'c1')!;
    expect(cutStep.off.O3).toEqual(initialOff.O3);
  });

  it('flag on → O3 comble le spot vidé par O2', () => {
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5,
      autoReplacementEnabled: true,
    });
    const cutStep = steps.find((s) => s.generatedBy === 'c1')!;
    expect(cutStep.off.O3).not.toEqual(initialOff.O3);
    // O3 s'est rapproché de l'ancien spot d'O2 (vers le haut/intérieur).
    expect(cutStep.off.O3.y).toBeLessThan(initialOff.O3.y);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/autoReplacementIntegration.test.ts` → 2 PASS.

- [ ] **Step 3: Ajouter l'invariant clearance** — dans `overlapInvariants.test.ts`, ajouter un bloc (adapter les imports à ceux déjà présents en tête du fichier ; `compileScenario` + `distance` + `PLAYER_MIN_CLEARANCE_PX`) :

```typescript
import { compileScenario } from '@/lib/logic/compileScenario';
import { distance } from '@/lib/logic/geometry';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { AttackerId, AttackerPositions, OffensiveScriptedAction } from '@/lib/types';

describe('auto-replacement — invariant clearance', () => {
  it('toutes les paires ≥ PLAYER_MIN_CLEARANCE_PX après cascade', () => {
    const initialOff: AttackerPositions = {
      O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 500, y: 320 },
      O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
    };
    const cut: OffensiveScriptedAction = {
      kind: 'offensive', id: 'c1', type: 'basket-cut', params: { cutter: 'O2' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5,
      autoReplacementEnabled: true, autoReplacementDepth: 2,
    });
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (const s of steps) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          expect(distance(s.off[ids[i]], s.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
        }
      }
    }
  });
});
```

(Note : si certains imports existent déjà en tête de `overlapInvariants.test.ts`, ne pas les redoubler — ajouter seulement les manquants.)

- [ ] **Step 4: Lancer** : `npx vitest run overlapInvariants` → tous PASS.

---

## Task 1.7 — Règle 1 / 1bis + commit + push

- [ ] **Step 1: Suites garde-fou** : `npx vitest run overlap screens userJson screenLab` → tous PASS.

- [ ] **Step 2: Suite complète** : `npx vitest run` → 1996+ PASS (cible ~2014, +18).

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/logic/compileScenario.ts \
        src/lib/state/transforms/shared.ts \
        src/lib/logic/reads/__tests__/autoReplacementIntegration.test.ts \
        src/lib/logic/__tests__/overlapInvariants.test.ts
git commit -m "feat(motion): brancher l'auto-replacement dans le compilateur + invariant clearance"
git push
```

---

# CHANTIER 2 — Transforms + UI

## Task 2.1 — Transform `setAutoReplacement` (TDD)

**Files:**
- Create: `src/lib/state/transforms/__tests__/autoReplacementTransforms.test.ts`
- Modify: `src/lib/state/transforms/scenarioTransforms.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { setAutoReplacement } from '@/lib/state/transforms/scenarioTransforms';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  return { ...makeInitialState(), scriptedActions: [] };
}

describe('setAutoReplacement', () => {
  it('active + pose la profondeur', () => {
    const s = setAutoReplacement(base(), true, 3);
    expect(s.autoReplacementEnabled).toBe(true);
    expect(s.autoReplacementDepth).toBe(3);
  });
  it('désactive', () => {
    const s = setAutoReplacement({ ...base(), autoReplacementEnabled: true }, false, 2);
    expect(s.autoReplacementEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/autoReplacementTransforms.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** — ajouter dans `scenarioTransforms.ts` :

```typescript
// Phase Motion — auto-replacement : active/désactive + profondeur de cascade.
export function setAutoReplacement(s: AppState, enabled: boolean, depth: number): AppState {
  return recompileScenarioSteps({
    ...s,
    autoReplacementEnabled: enabled,
    autoReplacementDepth: Math.max(1, Math.min(4, Math.floor(depth))),
  });
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/autoReplacementTransforms.test.ts` → 2 PASS.

- [ ] **Step 5: Suite complète** : `npx vitest run` → tous PASS.

---

## Task 2.2 — Callback `useAppState`

**Files:**
- Modify: `src/hooks/useAppState.ts`

- [ ] **Step 1: Ajouter le callback** — après `setContinuityLoop` (callback de continuity) :

```typescript
  const setAutoReplacement = useCallback(
    (enabled: boolean, depth: number) => {
      setStateWithHistory((s) => scenarioTx.setAutoReplacement(s, enabled, depth));
    },
    [setStateWithHistory],
  );
```

- [ ] **Step 2: Exporter** — dans l'objet retourné, après `setContinuityLoop,` :

```typescript
    setAutoReplacement,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 2.3 — Props ScenarioPanel + câblage page.tsx

**Files:**
- Modify: `src/components/ScenarioPanel.tsx` (interface props)
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Props dans `ScenarioPanelProps`** — après `onSetContinuityLoop` :

```typescript
  autoReplacementEnabled?: boolean;
  autoReplacementDepth?: number;
  onSetAutoReplacement: (enabled: boolean, depth: number) => void;
```

- [ ] **Step 2: Câbler dans page.tsx** — après `onSetContinuityLoop={app.setContinuityLoop}` :

```typescript
                    autoReplacementEnabled={app.state.autoReplacementEnabled}
                    autoReplacementDepth={app.state.autoReplacementDepth}
                    onSetAutoReplacement={app.setAutoReplacement}
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → erreurs attendues tant que l'UI (Task 2.4) n'utilise pas les props ; passer au Task 2.4 puis re-checker.

---

## Task 2.4 — Section UI ScenarioPanel

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

- [ ] **Step 1: Calculer si un déclencheur existe** — après le bloc dérivé de continuité (`const defaultLoop = ...`), ajouter :

```typescript
  // Phase Motion — auto-replacement : visible s'il existe une action déclencheuse.
  const AUTO_REPL_TRIGGERS = new Set(['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']);
  const hasReplacementTrigger = props.scriptedActions.some(
    (a) => a.kind === 'offensive' && AUTO_REPL_TRIGGERS.has(a.type),
  );
  const replDepth = props.autoReplacementDepth ?? 2;
```

- [ ] **Step 2: Rendre la section** — après la section continuité (fermeture du bloc `offActionsForLoop.length >= 2 && (...)`), insérer :

```tsx
      {hasReplacementTrigger && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!props.autoReplacementEnabled}
              onChange={(e) => props.onSetAutoReplacement(e.target.checked, replDepth)}
            />
            ↪ Auto-replacement (maintien du spacing)
          </label>
          {props.autoReplacementEnabled && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>profondeur de cascade</span>
                <input
                  type="number" min={1} max={4} step={1}
                  value={replDepth}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
                    props.onSetAutoReplacement(true, v);
                  }}
                  style={{ width: 48, fontSize: 11 }}
                />
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Fill auto : cascade prof. {replDepth} sur cut/drive (le joueur derrière comble le spot vidé).
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 5: Vérif visuelle** : `preview_start`, `preview_console_logs level=error` → zéro erreur.

---

## Task 2.5 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/lib/state/transforms/scenarioTransforms.ts \
        src/lib/state/transforms/__tests__/autoReplacementTransforms.test.ts \
        src/hooks/useAppState.ts \
        src/app/page.tsx \
        src/components/ScenarioPanel.tsx
git commit -m "feat(motion): auto-replacement — transform setAutoReplacement + UI ScenarioPanel"
git push
```

---

# CHANTIER 3 — Docs

## Task 3.1 — Sync

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, en tête :

```markdown
### Phase Motion — Auto-replacement (cascade de fill) (2026-06-02)

Sous-projet B du motion offense. Quand un cut/drive (`basket-cut`, `backdoor-cut`,
`flash-cut`, `give-and-go`, `drive`) vide un spot périmètre, une cascade de fill
*fill-from-behind* (le joueur du même côté plus loin du panier comble le spot, sa
place devient le spot suivant) maintient le spacing — bornée en profondeur (1–4,
défaut 2). Fusion concurrente dans le step du cut, clearance via `pushOutOfMany`.
Module pur `autoReplacement.ts`, opt-in `autoReplacementEnabled`. UI ScenarioPanel
(toggle + profondeur). ~18 tests.
```

- [ ] **Step 2: IDEAS §2** — compléter l'item motion : `✅ **Auto-replacement (sous-projet B) livré 2026-06-02** (cascade de fill auto sur cut/drive). Ball reversal/DHO (C) restant.`

- [ ] **Step 3: ROADMAP** — section « Motion offense » : ajouter le sous-projet B livré 2026-06-02 ; retirer replacement/relocate du restant.

- [ ] **Step 4: fiba-actions-roadmap** — lignes Drift / Lift / Replacement : noter « désormais **auto-déclenchables** sur cut/drive (`autoReplacementEnabled`) ».

- [ ] **Step 5: GAME-ENGINE** — note : la passe 1 offensive enrichit le step d'un cut/drive avec la cascade de fill (`autoReplacement.ts`) quand `autoReplacementEnabled`.

- [ ] **Step 6: todo-priorities** — section « Livrés 2026-06-02 » : ajouter l'auto-replacement.

- [ ] **Step 7: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md IDEAS.md docs/fiba-actions-roadmap.md docs/GAME-ENGINE.md docs/todo-priorities.md
git commit -m "docs: auto-replacement (motion sous-projet B) livré"
git push
```

---

## Notes d'exécution

- **Règle 1** : `applyReplacementToStep` passe chaque cible par `pushOutOfMany`.
  Invariant testé dans `overlapInvariants.test.ts`. **Règle 1bis** : aucun fichier
  `screens/` ni `defense/context.ts` touché ; lancer `overlap screens userJson
  screenLab` avant le commit du chantier 1.
- **Rétrocompat** : `autoReplacementEnabled` undefined/false → `isReplacementTrigger`
  jamais consulté → 0 diff.
- **Naming** : `computeReplacementChain` (cascade) vs `applyReplacementToStep`
  (merge) vs `setAutoReplacement` (transform) — distincts.
- **Suite de référence** : 1996 verte au départ. Cible ~2014 (+18).
- **Hors scope** : ball reversal/DHO (sous-projet C), re-spacing global, slots
  nommés, fill spacing-optimal (corner bonus).
```
