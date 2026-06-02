# Fast-break : outlet + sprint des couloirs (transition sous-projet 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur un rebond défensif, générer un fast-break full-court (outlet pass + sprint des couloirs vers `HOOP_OPPOSITE` + repli défensif) joué par l'équipe qui rebondit.

**Architecture:** Builder pur `buildFastBreakSteps` qui mappe les défenseurs (équipe qui rebondit) en attaquants du break (positions conservées, pas de miroir), calcule outlet receiver + couloirs + repli, et renvoie 2 steps. Transform `addFastBreakSteps` les appende + bascule full-court/attackingDirection='down'. Bouton StepsPanel. `addOutletPassStep` (E.1) inchangé.

**Tech Stack:** TypeScript strict, Vitest (TDD). Clearance via `pushOutOfMany` (Règle 1) + invariant. Aucun fichier `screens/`.

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-fast-break-outlet-lanes-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| 1 | `src/lib/logic/fastBreak.ts` | builder pur (créer) |
| 1 | `src/lib/logic/__tests__/fastBreak.test.ts` | tests (créer) |
| 1 | `src/lib/state/transforms/stepTransforms.ts` | transform `addFastBreakSteps` |
| 1 | `src/lib/state/transforms/__tests__/fastBreakTransform.test.ts` | tests (créer) |
| 1 | `src/lib/logic/__tests__/overlapInvariants.test.ts` | invariant clearance |
| 2 | `src/hooks/useAppState.ts` | callback |
| 2 | `src/components/StepsPanel.tsx` | bouton |
| 3 | `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md` | docs |

---

# CHANTIER 1 — Builder + transform

## Task 1.1 — Builder pur `buildFastBreakSteps` (TDD)

**Files:**
- Create: `src/lib/logic/fastBreak.ts`
- Create: `src/lib/logic/__tests__/fastBreak.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { buildFastBreakSteps, selectOutletReceiver } from '@/lib/logic/fastBreak';
import type { AppState, AttackerId, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { distance } from '@/lib/logic/geometry';

/** State avec un step de rebond défensif : la défense (D) a sécurisé le ballon,
 *  D3 rebondeur. defenseOverrides = positions de l'équipe qui rebondit. */
function reboundState(): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
    O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
  };
  const def: DefenderPositions = {
    D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
    D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
  };
  return {
    ...s0,
    playerCount: 5,
    steps: [{
      off, ballCarrier: 'O1', annotations: [],
      defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive',
    }],
    activeStep: 0,
  };
}

describe('selectOutletReceiver', () => {
  it('choisit l’attaquant le plus proche du rebondeur (hors lui)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 110 }, O2: { x: 320, y: 120 }, O3: { x: 500, y: 400 },
      O4: { x: 240, y: 130 }, O5: { x: 360, y: 130 },
    };
    expect(selectOutletReceiver(off, 'O1', ['O1', 'O2', 'O3', 'O4', 'O5'])).toBe('O2');
  });
});

describe('buildFastBreakSteps', () => {
  it('rebond non défensif → null', () => {
    const s = reboundState();
    s.steps[0] = { ...s.steps[0], reboundType: 'offensive' };
    expect(buildFastBreakSteps(s, 0)).toBeNull();
  });

  it('produit 2 steps (outlet + sprint)', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    expect(r).not.toBeNull();
    expect(r.outletStep.label).toBe('Outlet');
    expect(r.sprintStep.label).toBe('Sprint couloirs');
  });

  it('le ballon part au receveur de l’outlet et le conserve au sprint', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    expect(r.outletStep.ballCarrier).toBe(r.sprintStep.ballCarrier);
    expect(r.outletStep.ballCarrier).not.toBe('O3'); // pas le rebondeur (D3→O3)
  });

  it('le sprint envoie le ballon au milieu et les ailes aux extrêmes, vers HOOP_OPPOSITE', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    const off = r.sprintStep.off;
    const ball = r.sprintStep.ballCarrier as AttackerId;
    expect(off[ball].x).toBe(300);
    expect(off[ball].y).toBeGreaterThan(700); // vers le panier opposé
    const xs = (['O1', 'O2', 'O3', 'O4', 'O5'] as AttackerId[]).map((id) => off[id].x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(110); // une aile gauche
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(490); // une aile droite
  });

  it('repli défensif : tous les défenseurs reculent vers le panier opposé', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    const def = r.sprintStep.defenseOverrides!;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((d) => {
      expect(def[d].y).toBeGreaterThanOrEqual(880);
    });
  });

  it('clearance respectée entre attaquants du sprint', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(distance(r.sprintStep.off[ids[i]], r.sprintStep.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/fastBreak.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter** — créer `fastBreak.ts` :

```typescript
// Transition sous-projet 1 — fast-break : outlet + sprint des couloirs en
// full-court, joué par l'équipe qui sécurise le rebond défensif (mapping D→O
// sans miroir). Pur. Voir docs/superpowers/specs/
// 2026-06-02-fast-break-outlet-lanes-design.md.

import type {
  AppState, AttackerId, AttackerPositions, DefenderId, DefenderPositions, Point, Step,
} from '../types';
import { getActiveAttackerIds, getActiveDefenderIds } from './players';
import { effectiveDefensePositions } from './engine';
import { distance, pushOutOfMany } from './geometry';
import { PLAYER_MIN_CLEARANCE_PX } from '../data/court';

const LANE_LEFT_X = 110;
const LANE_MID_X = 300;
const LANE_RIGHT_X = 490;
const SPRINT_BALL_Y = 780;
const SPRINT_WING_Y = 840;
const TRAILER1_Y = 560;
const TRAILER2_Y = 650;
const DEF_RETREAT_Y = 900;
const OUTLET_Y = 420;

/** Attaquant le plus proche du rebondeur (hors lui) = vient chercher l'outlet. */
export function selectOutletReceiver(
  off: AttackerPositions,
  rebounderId: AttackerId,
  active: AttackerId[],
): AttackerId {
  let best: AttackerId | null = null;
  let bestD = Infinity;
  for (const id of active) {
    if (id === rebounderId) continue;
    const d = distance(off[id], off[rebounderId]);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best ?? rebounderId;
}

/** Sépare les positions pour respecter la clearance (Règle 1). */
function spread(off: AttackerPositions, ids: AttackerId[]): void {
  for (const id of ids) {
    const others = ids.filter((o) => o !== id).map((o) => off[o]);
    off[id] = pushOutOfMany(off[id], others, PLAYER_MIN_CLEARANCE_PX);
  }
}

/** Construit les 2 steps du fast-break à partir d'un step de rebond défensif.
 *  Renvoie null si le step n'est pas un rebond défensif. */
export function buildFastBreakSteps(
  state: AppState,
  reboundStepIdx: number,
): { outletStep: Step; sprintStep: Step } | null {
  const src = state.steps[reboundStepIdx];
  if (!src || src.reboundType !== 'defensive') return null;

  const attackerIds = getActiveAttackerIds(state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Équipe qui rebondit (les D) → attaquants du break, positions conservées.
  const srcDef: DefenderPositions = src.defenseOverrides ?? effectiveDefensePositions(state, reboundStepIdx);
  const breakOff: AttackerPositions = {} as AttackerPositions;
  attackerIds.forEach((oId, i) => {
    const dId = defenderIds[i];
    breakOff[oId] = { ...(srcDef[dId] ?? { x: 300, y: 120 }) };
  });
  // Tireurs (les O) → défenseurs du break (point de départ avant repli).
  const breakDefStart: DefenderPositions = {} as DefenderPositions;
  defenderIds.forEach((dId, i) => {
    const oId = attackerIds[i];
    breakDefStart[dId] = { ...(src.off[oId] ?? { x: 300, y: 300 }) };
  });

  // Rebondeur (DefenderId) → AttackerId par index.
  const rebDef = src.rebounder as DefenderId | undefined;
  const rIdx = rebDef ? Math.max(0, defenderIds.indexOf(rebDef)) : 0;
  const rebounderO = attackerIds[rIdx];
  const ball = selectOutletReceiver(breakOff, rebounderO, attackerIds);

  // --- Outlet step ---
  const outletOff: AttackerPositions = { ...breakOff };
  outletOff[ball] = { x: breakOff[ball].x < 300 ? 160 : 440, y: OUTLET_Y };
  spread(outletOff, attackerIds);
  const outletStep: Step = {
    label: 'Outlet', off: outletOff, ballCarrier: ball, annotations: [],
    manualOverride: true, defenseOverrides: breakDefStart, context: 'live-play',
  };

  // --- Sprint step ---
  const sprintOff: AttackerPositions = { ...outletOff };
  sprintOff[ball] = { x: LANE_MID_X, y: SPRINT_BALL_Y };
  sprintOff[rebounderO] = { x: LANE_MID_X, y: TRAILER1_Y };
  const others = attackerIds
    .filter((id) => id !== ball && id !== rebounderO)
    .sort((a, b) => outletOff[a].x - outletOff[b].x);
  if (others.length >= 1) sprintOff[others[0]] = { x: LANE_LEFT_X, y: SPRINT_WING_Y };
  if (others.length >= 2) sprintOff[others[others.length - 1]] = { x: LANE_RIGHT_X, y: SPRINT_WING_Y };
  if (others.length >= 3) sprintOff[others[1]] = { x: LANE_MID_X, y: TRAILER2_Y };
  spread(sprintOff, attackerIds);

  const sprintDef: DefenderPositions = {} as DefenderPositions;
  defenderIds.forEach((dId) => {
    sprintDef[dId] = { x: breakDefStart[dId].x, y: DEF_RETREAT_Y };
  });
  // Étale les défenseurs sur la ligne de repli (évite les x identiques).
  const dIds = [...defenderIds];
  for (const dId of dIds) {
    const obstacles: Point[] = dIds.filter((o) => o !== dId).map((o) => sprintDef[o]);
    sprintDef[dId] = pushOutOfMany(sprintDef[dId], obstacles, PLAYER_MIN_CLEARANCE_PX);
  }

  const sprintStep: Step = {
    label: 'Sprint couloirs', off: sprintOff, ballCarrier: ball, annotations: [],
    sprintBoost: true, manualOverride: true, defenseOverrides: sprintDef, context: 'live-play',
  };

  return { outletStep, sprintStep };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/fastBreak.test.ts` → tous PASS.

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logic/fastBreak.ts src/lib/logic/__tests__/fastBreak.test.ts
git commit -m "feat(transition): fast-break — builder pur outlet + sprint des couloirs"
```

---

## Task 1.2 — Transform `addFastBreakSteps` (TDD)

**Files:**
- Modify: `src/lib/state/transforms/stepTransforms.ts`
- Create: `src/lib/state/transforms/__tests__/fastBreakTransform.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function reboundState(): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
    O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
  };
  const def: DefenderPositions = {
    D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
    D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
  };
  return {
    ...s0, playerCount: 5, activeStep: 0,
    steps: [{ off, ballCarrier: 'O1', annotations: [], defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive' }],
  };
}

describe('addFastBreakSteps', () => {
  it('appende 2 steps après le rebond + bascule full-court / attackingDirection down', () => {
    const s = addFastBreakSteps(reboundState(), { sourceStepIdx: 0 });
    expect(s.steps).toHaveLength(3);
    expect(s.steps[1].label).toBe('Outlet');
    expect(s.steps[2].label).toBe('Sprint couloirs');
    expect(s.fullCourt).toBe(true);
    expect(s.attackingDirection).toBe('down');
    expect(s.activeStep).toBe(2);
  });

  it('rebond non défensif → no-op', () => {
    const base = reboundState();
    base.steps[0] = { ...base.steps[0], reboundType: 'offensive' };
    const s = addFastBreakSteps(base, { sourceStepIdx: 0 });
    expect(s.steps).toHaveLength(1);
    expect(s).toBe(base);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/fastBreakTransform.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** — dans `stepTransforms.ts`, ajouter l'import en tête (près des autres imports logic) :

```typescript
import { buildFastBreakSteps } from '@/lib/logic/fastBreak';
```

puis ajouter la fonction (après `addOutletPassStep`) :

```typescript
/**
 * Transition sous-projet 1 — génère le fast-break (outlet + sprint des couloirs)
 * après un rebond défensif. Appende 2 steps, bascule full-court +
 * attackingDirection='down'. No-op si le step source n'est pas un rebond
 * défensif. `addOutletPassStep` (miroir demi-terrain) reste distinct.
 */
export function addFastBreakSteps(
  s: AppState,
  options: { sourceStepIdx?: number } = {},
): AppState {
  const sourceStepIdx = options.sourceStepIdx ?? s.activeStep;
  const built = buildFastBreakSteps(s, sourceStepIdx);
  if (!built) return s;
  const steps = [...s.steps];
  steps.splice(sourceStepIdx + 1, 0, built.outletStep, built.sprintStep);
  return {
    ...s,
    steps,
    fullCourt: true,
    attackingDirection: 'down',
    activeStep: sourceStepIdx + 2,
  };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/fastBreakTransform.test.ts` → 2 PASS.

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 1.3 — Invariant overlap + garde-fous + commit/push

**Files:**
- Modify: `src/lib/logic/__tests__/overlapInvariants.test.ts`

- [ ] **Step 1: Ajouter l'invariant** — en fin de fichier (les imports `compileScenario`/`distance`/`PLAYER_MIN_CLEARANCE_PX`/types sont déjà présents depuis l'auto-replacement ; ajouter `addFastBreakSteps` à l'import depuis `@/lib/state/transforms/stepTransforms` ou via un import dédié) :

```typescript
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import { makeInitialState as makeInit2 } from '@/lib/data/initial';
import type { DefenderPositions } from '@/lib/types';

describe('fast-break — invariant clearance', () => {
  it('toutes les paires d’attaquants ≥ clearance sur les steps du break', () => {
    const s0 = makeInit2();
    const off = {
      O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
      O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
    } as AttackerPositions;
    const def: DefenderPositions = {
      D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
      D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
    };
    const state: AppState = {
      ...s0, playerCount: 5, activeStep: 0,
      steps: [{ off, ballCarrier: 'O1', annotations: [], defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive' }],
    };
    const next = addFastBreakSteps(state, { sourceStepIdx: 0 });
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (const st of next.steps) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          expect(distance(st.off[ids[i]], st.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
    }
  });
});
```

(Note : si `makeInitialState`/`AttackerPositions`/`AttackerId` sont déjà importés en tête, réutiliser ces imports plutôt que `makeInit2` — adapter aux imports existants du fichier.)

- [ ] **Step 2: Lancer** : `npx vitest run overlapInvariants` → tous PASS.

- [ ] **Step 3: Garde-fous** : `npx vitest run overlap screens userJson screenLab` → tous PASS.

- [ ] **Step 4: Suite complète** : `npx vitest run` → 2027+ PASS (cible ~2037, +10).

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/state/transforms/stepTransforms.ts \
        src/lib/state/transforms/__tests__/fastBreakTransform.test.ts \
        src/lib/logic/__tests__/overlapInvariants.test.ts
git commit -m "feat(transition): addFastBreakSteps transform + invariant clearance"
git push
```

---

# CHANTIER 2 — UI (StepsPanel)

## Task 2.1 — Callback + bouton

**Files:**
- Modify: `src/hooks/useAppState.ts`
- Modify: `src/components/StepsPanel.tsx`

- [ ] **Step 1: Callback** — dans `useAppState.ts`, près de `addShotReboundStep` (ligne ~179) :

```typescript
  const addFastBreakSteps = useCallback(
    (options?: { sourceStepIdx?: number }) => {
      setStateWithHistory((s) => stepTx.addFastBreakSteps(s, options ?? {}));
    },
    [setStateWithHistory],
  );
```

- [ ] **Step 2: Exporter** — dans l'objet retourné, près de `addShotReboundStep,` :

```typescript
    addFastBreakSteps,
```

- [ ] **Step 3: Brancher le bouton dans StepsPanel** — repérer comment le bouton « étape rebond auto » est rendu (recherche `addShotReboundStep` / `shotOutcome === 'missed'` dans `StepsPanel.tsx`) et ajouter, à côté, un bouton visible quand `step.reboundType === 'defensive'` :

```tsx
{step.reboundType === 'defensive' && (
  <button
    onClick={() => onAddFastBreakSteps({ sourceStepIdx: idx })}
    title="Générer un fast-break (outlet + sprint des couloirs) vers le panier opposé"
    style={{ fontSize: 11, padding: '2px 8px' }}
  >⚡ Fast-break</button>
)}
```

(Adapter : nom exact de la prop callback dans `StepsPanelProps` — l'ajouter, ex. `onAddFastBreakSteps: (options?: { sourceStepIdx?: number }) => void` — et la passer depuis `page.tsx` via `app.addFastBreakSteps`. Suivre le câblage de `onAddShotReboundStep`.)

- [ ] **Step 4: Câbler la prop dans page.tsx** — là où `<StepsPanel>` reçoit ses props (près de `onAddShotReboundStep={...}`), ajouter :

```typescript
                onAddFastBreakSteps={app.addFastBreakSteps}
```

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 7: Vérif visuelle** : `preview_start`, `preview_console_logs level=error` → zéro erreur.

---

## Task 2.2 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/hooks/useAppState.ts src/components/StepsPanel.tsx src/app/page.tsx
git commit -m "feat(transition): fast-break — bouton StepsPanel (rebond défensif)"
git push
```

---

# CHANTIER 3 — Docs

## Task 3.1 — Sync

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, en tête :

```markdown
### Transition — Fast-break : outlet + sprint des couloirs (2026-06-02)

Premier sous-projet de la transition (IDEAS §3, dernier 🔴). Sur un rebond
défensif, l'équipe qui sécurise le ballon (mapping D→O sans miroir) part en
fast-break full-court : passe **outlet** vers le meneur le plus proche, puis
**sprint des 3 couloirs** vers `HOOP_OPPOSITE` (ball au milieu, ailes aux
extrêmes, rebondeur trailer) avec **repli défensif** (`sprintBoost`). Builder pur
`buildFastBreakSteps` + transform `addFastBreakSteps` (bascule full-court +
attackingDirection='down'), bouton ⚡ StepsPanel. `addOutletPassStep` (E.1)
inchangé. ~11 tests.
```

- [ ] **Step 2: IDEAS §3** — annoter l'item transition : `✅ **Sous-projet 1 (outlet + sprint des couloirs) livré 2026-06-02.** Avantage numérique 2c1/3c2 (2) + secondary break (3) restants.`

- [ ] **Step 3: ROADMAP** — ajouter une section « Transition — fast-break (en cours) » : sous-projet 1 livré, 2/3 restants ; liens spec/plan.

- [ ] **Step 4: GAME-ENGINE** — note : `fastBreak.ts` génère 2 steps (outlet + sprint) sur rebond défensif, full-court vers `HOOP_OPPOSITE`, mapping D→O sans miroir.

- [ ] **Step 5: todo-priorities** — section « Livrés 2026-06-02 » : ajouter le fast-break sous-projet 1.

- [ ] **Step 6: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md IDEAS.md docs/GAME-ENGINE.md docs/todo-priorities.md
git commit -m "docs: fast-break outlet + sprint des couloirs (transition sous-projet 1) livré"
git push
```

---

## Notes d'exécution

- **Règle 1** : `buildFastBreakSteps` passe attaquants ET défenseurs par
  `pushOutOfMany`. Invariant testé dans `overlapInvariants.test.ts`. **Règle 1bis** :
  aucun fichier `screens/` ni `defense/context.ts` touché.
- **Animation** : les 2 steps sont des steps manuels (comme `addShotReboundStep`) ;
  l'interpolation de playback anime le grand bond y (rebond → far end) — pas
  besoin de `breakUpTeleports` (qui ne tourne que dans `compileScenario`).
- **Rétrocompat** : additif. `addOutletPassStep` / E.1 inchangés. Pas de migration.
- **Orientation (option C)** : l'équipe qui rebondit (les D) devient l'offense du
  break, positions conservées (pas de miroir), attaque `HOOP_OPPOSITE`.
- **Suite de référence** : 2027 verte au départ. Cible ~2037 (+10).
- **Hors scope** : avantage numérique + conclusion (sous-projet 2), secondary
  break (sous-projet 3), transition match-sim (audit #7).
```
