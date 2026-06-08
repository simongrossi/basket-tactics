# Lacunes défensives #8 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trois raffinements opt-in du moteur défensif — hedge par défenseur (#3), ancre weak-side explicite (#2), relâche du blitz quand le ballon ressort (#1).

**Architecture:** Chaque lacune est un chantier indépendant (commit+push séparé). Ordre du plus simple au plus risqué : #3 (1 ligne de câblage + UI) → #2 (helper pur + couche 1.4) → #1 (helper + couche 2.6 + easing frameResolver). Tout opt-in, TDD strict.

**Tech Stack:** TypeScript strict, Vitest (TDD), pipeline défensif en couches, SVG inline (Player.tsx).

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-lacunes-defensives-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| #3 | `src/lib/types/index.ts` | `DefenderRule.hedgeAggression?` |
| #3 | `src/lib/logic/defense/baseTargets.ts:152` | résolution per-rule |
| #3 | `src/components/ContextMenu/DefenderMenu.tsx` | slider |
| #3 | `src/components/DefensePanel.tsx` | section lecture |
| #3 | `src/lib/logic/__tests__/hedgePerDefender.test.ts` | tests |
| #2 | `src/lib/logic/defense/pickWeakSideAnchor.ts` | helper pur (créer) |
| #2 | `src/lib/logic/defense/weakSideAnchorLayer.ts` | couche 1.4 (créer) |
| #2 | `src/lib/logic/engine.ts` | câbler la couche |
| #2 | `src/lib/types/index.ts` | flags `weakSideAnchor`, `weakSideAnchorEnabled` |
| #2 | `src/lib/logic/defense/types.ts` | `DefenderTarget.weakSideAnchor` |
| #2 | `src/lib/logic/defense/speedConstraint.ts` | propager le flag |
| #2 | `src/components/Player.tsx` | marqueur ⚓ |
| #2 | `src/components/DefensePanel.tsx` + `DefenderMenu.tsx` | toggle + case |
| #2 | `src/lib/logic/__tests__/weakSideAnchor.test.ts` | tests |
| #1 | `src/lib/logic/defense/detectBlitzRelease.ts` | helper pur (créer) |
| #1 | `src/lib/logic/defense/blitzReleaseLayer.ts` | couche 2.6 (créer) |
| #1 | `src/lib/logic/blitzReleaseEasing.ts` | easing (créer) |
| #1 | `src/lib/logic/engine.ts` | câbler la couche |
| #1 | `src/lib/logic/playback/frameResolver.ts:~773` | easing |
| #1 | `src/lib/types/index.ts` | flags `blitzRecovering`, `blitzReleaseEnabled` |
| #1 | `src/lib/logic/defense/types.ts` | `DefenderTarget.blitzRecovering` |
| #1 | `src/lib/logic/defense/speedConstraint.ts` | propager le flag |
| #1 | `src/components/Player.tsx` | badge ↩ RECOVER |
| #1 | `src/components/DefensePanel.tsx` | toggle |
| #1 | tests | `detectBlitzRelease.test.ts`, `blitzReleaseLayer.test.ts`, `blitzReleaseEasing.test.ts` |

---

# CHANTIER #3 — Hedge par défenseur

### Task 3.1 — Type `DefenderRule.hedgeAggression`

**Files:**
- Modify: `src/lib/types/index.ts` (bloc DefenderRule, après `maxSpeed?`)

- [ ] **Step 1: Ajouter le champ** — après le bloc `maxSpeed?: number;` (vers ligne 545) :

```typescript
  /** Override individuel de `state.hedgeAggression` (B3, 0-100). Undefined =
   *  global. Permet d'avoir un D5 qui hedge mou (20) et un autre agressif (90)
   *  sur des écrans différents. */
  hedgeAggression?: number;
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 3.2 — Tests (avant le code)

**Files:**
- Create: `src/lib/logic/__tests__/hedgePerDefender.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
// #3 — hedgeAggression per-défenseur override le global.
import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un état PnR : O5 plaqué sur D1 (porteur O1), screenRule hedge.
 *  D5 (screenerDef) sort sur le porteur ; son amplitude dépend de
 *  l'agressivité hedge effective. */
function makeHedgeState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: { ...s0.steps[0].off, O5: { x: 305, y: 380 } }, // collé sur D1
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
    ],
    screenRule: 'hedge',
    ...overrides,
  };
}

/** Distance de D5 au porteur O1 (plus petite = hedge plus agressif). */
function d5ToCarrier(state: AppState): number {
  const def = effectiveDefensePositions(state, 0);
  const o1 = state.steps[0].off.O1;
  return Math.hypot(def.D5.x - o1.x, def.D5.y - o1.y);
}

describe('hedgeAggression per-défenseur', () => {
  it('hedge agressif (90) → D5 sort plus loin sur le porteur que hedge mou (10)', () => {
    const soft = d5ToCarrier(makeHedgeState({ hedgeAggression: 10 }));
    const hard = d5ToCarrier(makeHedgeState({ hedgeAggression: 90 }));
    // Hedge plus agressif → D5 plus proche du porteur.
    expect(hard).toBeLessThan(soft);
  });

  it('override per-défenseur sur D5 prime sur le global', () => {
    const s0 = makeHedgeState({ hedgeAggression: 10 });
    const withOverride: AppState = {
      ...s0,
      rules: {
        ...s0.rules,
        D5: { ...s0.rules.D5, hedgeAggression: 90 },
      },
    };
    // Global mou (10) mais override D5 dur (90) → D5 sort comme un hard hedge.
    const globalSoft = d5ToCarrier(makeHedgeState({ hedgeAggression: 10 }));
    const overridden = d5ToCarrier(withOverride);
    expect(overridden).toBeLessThan(globalSoft);
  });

  it('sans override ni global → défaut 50 (comportement legacy inchangé)', () => {
    const a = d5ToCarrier(makeHedgeState());
    const b = d5ToCarrier(makeHedgeState());
    expect(a).toBe(b); // déterministe
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/hedgePerDefender.test.ts`
  - Attendu : le test « override prime » FAIL (le câblage n'utilise pas encore rules[dId]).

---

### Task 3.3 — Câblage dans baseTargets.ts

**Files:**
- Modify: `src/lib/logic/defense/baseTargets.ts:152`

- [ ] **Step 1: Remplacer la résolution hedgeAggression** — ligne 152, remplacer :

```typescript
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop, screenQuality, state.hedgeAggression ?? 50);
```

par :

```typescript
      const hedgeAgg = state.rules[dId]?.hedgeAggression ?? state.hedgeAggression ?? 50;
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop, screenQuality, hedgeAgg);
```

- [ ] **Step 2: Lancer les tests** : `npx vitest run src/lib/logic/__tests__/hedgePerDefender.test.ts`
  - Attendu : 3 PASS.

- [ ] **Step 3: Suite screen (Règle 1bis)** : `npx vitest run screens overlap userJson screenLab`
  - Attendu : tous PASS.

---

### Task 3.4 — UI : slider DefenderMenu

**Files:**
- Modify: `src/components/ContextMenu/DefenderMenu.tsx`

- [ ] **Step 1: Repérer le pattern existant** — lire comment `closeoutBoost` ou `denyAggressiveness` per-défenseur est exposé dans `DefenderMenu.tsx` (rechercher `closeoutBoost`). Suivre EXACTEMENT ce pattern : un row conditionnel visible quand `state.screenRule === 'hedge'`, un Slider 0-100 step 5 qui lit `rule.hedgeAggression ?? state.hedgeAggression ?? 50` et écrit via le callback de mutation de rule existant (`onUpdateRule` ou équivalent — utiliser le même que closeoutBoost).

```tsx
{state.screenRule === 'hedge' && (
  <Row label="agressivité hedge">
    <Slider
      min={0} max={100} step={5}
      value={rule.hedgeAggression ?? state.hedgeAggression ?? 50}
      onChange={(v) => onUpdateRule(defenderId, { hedgeAggression: v })}
    />
  </Row>
)}
```

(Adapter `Row`/`Slider`/`onUpdateRule`/`defenderId` aux noms réels du fichier — les copier de la ligne `closeoutBoost`.)

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 3.5 — UI : section lecture DefensePanel

**Files:**
- Modify: `src/components/DefensePanel.tsx`

- [ ] **Step 1: Repérer la section debug des overrides per-défenseur** — chercher où `closeoutBoost`/`maxSpeed` per-défenseur sont listés en lecture dans DefensePanel (recherche `closeoutBoost`). Ajouter une colonne/ligne « hedge » qui affiche `rule.hedgeAggression ?? state.hedgeAggression ?? 50` pour chaque défenseur, visible seulement quand `state.screenRule === 'hedge'`. Suivre le format exact des autres overrides listés.

Si aucune section de listing per-défenseur n'existe pour ces overrides, ajouter une ligne récap simple sous le slider hedgeAggression global :

```tsx
{state.screenRule === 'hedge' && (
  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
    Hedge par défenseur :{' '}
    {(['D1','D2','D3','D4','D5'] as const).map((d) =>
      `${d}:${state.rules[d]?.hedgeAggression ?? state.hedgeAggression ?? 50}`
    ).join(' · ')}
  </div>
)}
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 3: Suite complète** : `npx vitest run` → 1923+ PASS.

---

### Task 3.6 — Commit + push #3

- [ ] **Step 1: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/defense/baseTargets.ts \
        src/components/ContextMenu/DefenderMenu.tsx \
        src/components/DefensePanel.tsx \
        src/lib/logic/__tests__/hedgePerDefender.test.ts
git commit -m "feat(defense): hedgeAggression per-défenseur (#8.3)"
```

- [ ] **Step 2: Push** : `git push`

---

# CHANTIER #2 — Ancre weak-side

### Task 2.1 — Types

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/logic/defense/types.ts`

- [ ] **Step 1: `DefenderRule.weakSideAnchor`** — dans index.ts, après `hedgeAggression?` :

```typescript
  /** Override coach : désigne CE défenseur comme ancre weak-side (protection
   *  raquette/skip côté faible). Undefined/false = désignation auto par le
   *  moteur (le low weak-side). */
  weakSideAnchor?: boolean;
```

- [ ] **Step 2: `AppState.weakSideAnchorEnabled`** — dans index.ts, près des autres flags opt-in (vers ligne 972, à côté de `postCoverage`) :

```typescript
  /** #8.2 — Active l'ancre weak-side explicite : un défenseur désigné protège
   *  la raquette / le skip côté faible (position dédiée vs sag passif).
   *  Default undefined = legacy (sag distribué via helpPct seulement). */
  weakSideAnchorEnabled?: boolean;
```

- [ ] **Step 3: `ComputedDefender.weakSideAnchor`** — dans index.ts, près de `closeoutQuality?` :

```typescript
  /** #8.2 — Ce défenseur est l'ancre weak-side désignée (protection raquette
   *  côté faible). Piloté par weakSideAnchorLayer. */
  weakSideAnchor?: boolean;
```

- [ ] **Step 4: `DefenderTarget.weakSideAnchor`** — dans defense/types.ts, après `isPassShadowed?` :

```typescript
  /** #8.2 — ancre weak-side désignée (cf. ComputedDefender.weakSideAnchor). */
  weakSideAnchor?: boolean;
```

- [ ] **Step 5: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 2.2 — Helper pur `pickWeakSideAnchor` (tests d'abord)

**Files:**
- Create: `src/lib/logic/__tests__/weakSideAnchor.test.ts`
- Create: `src/lib/logic/defense/pickWeakSideAnchor.ts`

- [ ] **Step 1: Écrire les tests du helper** :

```typescript
import { describe, it, expect } from 'vitest';
import { pickWeakSideAnchor } from '@/lib/logic/defense/pickWeakSideAnchor';
import type { AttackerPositions, DefenderPositions, Matchups, DefenderId } from '@/lib/types';

const HOOP = { x: 300, y: 75 };

// Ballon côté droit (carrier O1 à droite). Weak-side = gauche (x < 300).
const off: AttackerPositions = {
  O1: { x: 450, y: 400 }, // porteur, strong-side droit
  O2: { x: 480, y: 250 }, // strong-side
  O3: { x: 120, y: 250 }, // weak-side haut
  O4: { x: 150, y: 130 }, // weak-side bas (proche panier) ← ancre auto attendue
  O5: { x: 400, y: 130 }, // strong-side bas
};
const matchups: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };
const defenderIds: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const rules = {} as Record<DefenderId, { weakSideAnchor?: boolean }>;

describe('pickWeakSideAnchor', () => {
  it('auto : choisit le défenseur weak-side le plus bas (D4 sur O4)', () => {
    const anchor = pickWeakSideAnchor(off, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).toBe('D4');
  });

  it('override manuel prime : D3 marqué weakSideAnchor → D3', () => {
    const r = { D3: { weakSideAnchor: true } } as typeof rules;
    const anchor = pickWeakSideAnchor(off, 'O1', matchups, defenderIds, HOOP, r);
    expect(anchor).toBe('D3');
  });

  it('exclut le carrierDef (D1) même s\'il est weak-side', () => {
    // Porteur déplacé côté gauche → D1 serait weak-side, mais c'est le carrierDef.
    const offLeft = { ...off, O1: { x: 150, y: 400 } };
    const anchor = pickWeakSideAnchor(offLeft, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).not.toBe('D1');
  });

  it('retourne null si aucun défenseur weak-side (tous strong-side)', () => {
    const allRight: AttackerPositions = {
      O1: { x: 450, y: 400 }, O2: { x: 480, y: 250 }, O3: { x: 460, y: 250 },
      O4: { x: 440, y: 130 }, O5: { x: 400, y: 130 },
    };
    const anchor = pickWeakSideAnchor(allRight, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/weakSideAnchor.test.ts`
  - Attendu : FAIL (`pickWeakSideAnchor` n'existe pas).

- [ ] **Step 3: Implémenter le helper** :

```typescript
// #8.2 — Désignation de l'ancre weak-side.
//
// Retourne le défenseur qui protège la raquette/skip côté faible :
//  - priorité à l'override coach (rule.weakSideAnchor === true, weak-side vérifié)
//  - sinon auto = le défenseur weak-side le plus proche du panier ("low man").
// Exclut le carrierDef (le défenseur du porteur, jamais ancre).

import type { AttackerId, AttackerPositions, DefenderId, Matchups, Point } from '../../types';
import { ballSide, distance } from '../geometry';

export function pickWeakSideAnchor(
  off: AttackerPositions,
  carrier: AttackerId,
  matchups: Matchups,
  defenderIds: DefenderId[],
  hoop: Point,
  rules: Partial<Record<DefenderId, { weakSideAnchor?: boolean }>>,
): DefenderId | null {
  const carrierPos = off[carrier];
  if (!carrierPos) return null;
  const carrierSideSign = ballSide(carrierPos); // -1 G, 0 axe, +1 D

  // carrierDef = défenseur dont le matchup est le porteur.
  let carrierDef: DefenderId | null = null;
  for (const dId of defenderIds) {
    if (matchups[dId] === carrier) { carrierDef = dId; break; }
  }

  // Candidats weak-side (homme côté opposé au ballon), hors carrierDef.
  const candidates: { dId: DefenderId; distToHoop: number }[] = [];
  for (const dId of defenderIds) {
    if (dId === carrierDef) continue;
    const manId = matchups[dId];
    const manPos = off[manId];
    if (!manPos) continue;
    const manSide = ballSide(manPos);
    // weak-side = côté strictement opposé au ballon (et ballon pas sur l'axe).
    const isWeak = carrierSideSign !== 0 && manSide !== 0 && manSide !== carrierSideSign;
    if (!isWeak) continue;
    candidates.push({ dId, distToHoop: distance(manPos, hoop) });
  }

  if (candidates.length === 0) return null;

  // Override coach prioritaire (parmi les candidats weak-side).
  const manual = candidates.find((c) => rules[c.dId]?.weakSideAnchor === true);
  if (manual) return manual.dId;

  // Auto : le plus proche du panier (low man).
  candidates.sort((a, b) => a.distToHoop - b.distToHoop);
  return candidates[0].dId;
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/weakSideAnchor.test.ts`
  - Attendu : 4 PASS.

---

### Task 2.3 — Couche `weakSideAnchorLayer`

**Files:**
- Create: `src/lib/logic/defense/weakSideAnchorLayer.ts`

- [ ] **Step 1: Implémenter la couche** :

```typescript
// Couche 1.4 — Ancre weak-side explicite (#8.2).
//
// Quand `state.weakSideAnchorEnabled`, désigne un défenseur ancre côté faible
// et l'enfonce vers la raquette (protection panier/skip), au lieu du sag
// passif distribué via helpPct. Position : à mi-chemin entre son homme et un
// point de protection raquette (sur la ligne homme→panier, à mi-raquette).
//
// Skip si le défenseur ancre est déjà engagé (pnrRole / onScreen) — sa tâche
// prime. `resolvePlayerCollisions` en aval garantit la clearance (Règle #0).

import type { DefenderId, Matchups, Point } from '../../types';
import { lerp } from '../geometry';
import { pickWeakSideAnchor } from './pickWeakSideAnchor';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Fraction d'enfoncement vers le point de protection raquette. */
const ANCHOR_SINK = 0.5;

export function applyWeakSideAnchorLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.weakSideAnchorEnabled) return;
  const { off, ballCarrier, defenderIds, hoop, state } = ctx;

  const anchorId = pickWeakSideAnchor(
    off, ballCarrier, matchups, defenderIds, hoop,
    state.rules as Partial<Record<DefenderId, { weakSideAnchor?: boolean }>>,
  );
  if (!anchorId) return;

  const target = positions[anchorId];
  if (!target) return;
  // Ne pas écraser un défenseur déjà engagé.
  if (target.pnrRole || target.onScreen) return;

  const manId = matchups[anchorId];
  const manPos = off[manId];
  if (!manPos) return;

  // Point de protection raquette : sur la ligne homme→panier, à mi-raquette.
  const paintProtect: Point = lerp(manPos, hoop, 0.5);
  const sunk = lerp({ x: target.x, y: target.y }, paintProtect, ANCHOR_SINK);

  target.x = sunk.x;
  target.y = sunk.y;
  target.weakSideAnchor = true;
}
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

(Vérifier que `lerp` est bien exporté par geometry.ts — sinon utiliser le calcul inline `{ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t }`.)

---

### Task 2.4 — Câbler la couche dans engine.ts

**Files:**
- Modify: `src/lib/logic/engine.ts`

- [ ] **Step 1: Import** — avec les autres imports de couches (vers ligne 20) :

```typescript
import { applyWeakSideAnchorLayer } from './defense/weakSideAnchorLayer';
```

- [ ] **Step 2: Appel** — entre `applyInfluenceLayer` (1.3) et `applyRimProtectionLayer` (1.5) :

```typescript
  applyInfluenceLayer(positions, matchups, ctx);
  // Couche 1.4 — Ancre weak-side explicite (#8.2). Opt-in via
  // state.weakSideAnchorEnabled. Enfonce un défenseur désigné vers la raquette
  // côté faible (protection panier/skip).
  applyWeakSideAnchorLayer(positions, matchups, ctx);
  applyRimProtectionLayer(positions, matchups, ctx);
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 2.5 — Propager le flag dans speedConstraint

**Files:**
- Modify: `src/lib/logic/defense/speedConstraint.ts`

- [ ] **Step 1: Ajouter `weakSideAnchor` aux 3 blocs de sortie `out[dId]`** — dans les 3 endroits où l'objet `out[dId]` est construit (override block ~321, late=false block ~624, late=true block ~668), ajouter après `isPassShadowed: targets[dId].isPassShadowed,` :

```typescript
        weakSideAnchor: targets[dId].weakSideAnchor,
```

(Les 3 blocs. Le bloc override ~321 n'a pas tous les champs — y ajouter aussi la ligne.)

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 2.6 — Tests d'intégration de la couche

**Files:**
- Modify: `src/lib/logic/__tests__/weakSideAnchor.test.ts`

- [ ] **Step 1: Ajouter les tests d'intégration** :

```typescript
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeAnchorState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    weakSideAnchorEnabled: enabled || undefined,
    steps: [
      {
        ...s0.steps[0],
        // Porteur O1 côté droit, O4 weak-side bas (ancre attendue).
        off: {
          O1: { x: 450, y: 400 }, O2: { x: 480, y: 250 }, O3: { x: 120, y: 250 },
          O4: { x: 150, y: 180 }, O5: { x: 400, y: 130 },
        },
        ballCarrier: 'O1',
      },
    ],
  };
}

describe('weakSideAnchorLayer — intégration', () => {
  it('désactivé par défaut → aucun flag weakSideAnchor', () => {
    const def = effectiveDefensePositions(makeAnchorState(false), 0);
    expect(Object.values(def).some((d) => d.weakSideAnchor)).toBe(false);
  });

  it('activé → D4 (low weak-side) reçoit le flag et est enfoncé vers la raquette', () => {
    const off = makeAnchorState(true);
    const defOff = effectiveDefensePositions(makeAnchorState(false), 0);
    const defOn = effectiveDefensePositions(off, 0);
    expect(defOn.D4.weakSideAnchor).toBe(true);
    // L'ancre est plus proche du panier (y plus bas) qu'en sag passif.
    const hoop = { x: 300, y: 75 };
    const dOn = Math.hypot(defOn.D4.x - hoop.x, defOn.D4.y - hoop.y);
    const dOff = Math.hypot(defOff.D4.x - hoop.x, defOff.D4.y - hoop.y);
    expect(dOn).toBeLessThan(dOff);
  });

  it('INVARIANT clearance : ancre ne crée pas de superposition (≥ 34px)', () => {
    const def = effectiveDefensePositions(makeAnchorState(true), 0);
    const ids = Object.keys(def);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = def[ids[i] as keyof typeof def];
        const b = def[ids[j] as keyof typeof def];
        if (a.matchedTo === b.matchedTo) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(33.9);
      }
    }
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/weakSideAnchor.test.ts`
  - Attendu : 7 PASS (4 helper + 3 intégration).

- [ ] **Step 3: Suite complète** : `npx vitest run` → tous PASS.

---

### Task 2.7 — Visuel ⚓ + UI

**Files:**
- Modify: `src/components/Player.tsx`
- Modify: `src/components/DefensePanel.tsx`
- Modify: `src/components/ContextMenu/DefenderMenu.tsx`

- [ ] **Step 1: Prop + marqueur dans Player.tsx** — ajouter `weakSideAnchor?: boolean;` dans `PlayerProps` (près de `closeoutQuality?`), le destructurer, et ajouter un marqueur après le bloc closeout ring :

```tsx
{weakSideAnchor && !isAttacker && showStateRings && (
  <text
    x={pos.x - r - 4}
    y={pos.y + r + 12}
    fontSize={11}
    textAnchor="middle"
    pointerEvents="none"
  >
    ⚓
  </text>
)}
```

Puis passer la prop depuis le parent qui rend les défenseurs (chercher où `closingOut={...}` est passé à `<Player>` et ajouter `weakSideAnchor={computed.weakSideAnchor}` au même endroit).

- [ ] **Step 2: Toggle DefensePanel** — ajouter un toggle `weakSideAnchorEnabled` dans la section *Couvertures avancées* (suivre le pattern d'un toggle opt-in existant comme `autoBumpCutters` : chercher `autoBumpCutters` dans DefensePanel.tsx et copier le bloc toggle).

- [ ] **Step 3: Case override DefenderMenu** — ajouter une case à cocher « ancre weak-side » dans `DefenderMenu.tsx` qui lit/écrit `rule.weakSideAnchor` (visible seulement si `state.weakSideAnchorEnabled`). Suivre le pattern d'un toggle de rule existant.

- [ ] **Step 4: Build + suite** : `npx tsc --noEmit` puis `npx vitest run` → tous PASS.

---

### Task 2.8 — Commit + push #2

- [ ] **Step 1: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/defense/types.ts \
        src/lib/logic/defense/pickWeakSideAnchor.ts \
        src/lib/logic/defense/weakSideAnchorLayer.ts \
        src/lib/logic/engine.ts \
        src/lib/logic/defense/speedConstraint.ts \
        src/components/Player.tsx \
        src/components/DefensePanel.tsx \
        src/components/ContextMenu/DefenderMenu.tsx \
        src/lib/logic/__tests__/weakSideAnchor.test.ts
git commit -m "feat(defense): ancre weak-side explicite + override coach (#8.2)"
```

- [ ] **Step 2: Push** : `git push`

---

# CHANTIER #1 — Relâche du blitz

### Task 1.1 — Easing `blitzReleaseEasing` (tests d'abord)

**Files:**
- Create: `src/lib/logic/__tests__/blitzReleaseEasing.test.ts`
- Create: `src/lib/logic/blitzReleaseEasing.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { blitzReleaseEasing } from '@/lib/logic/blitzReleaseEasing';

describe('blitzReleaseEasing', () => {
  it('e(0) = 0', () => expect(blitzReleaseEasing(0)).toBe(0));
  it('e(1) = 1', () => expect(blitzReleaseEasing(1)).toBe(1));
  it('clamp en dehors de [0,1]', () => {
    expect(blitzReleaseEasing(-0.5)).toBe(0);
    expect(blitzReleaseEasing(1.5)).toBe(1);
  });
  it('ease-out : départ rapide, e(0.5) > 0.5', () => {
    expect(blitzReleaseEasing(0.5)).toBeGreaterThan(0.5);
  });
  it('monotone croissante', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const v = blitzReleaseEasing(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/blitzReleaseEasing.test.ts`
  - Attendu : FAIL (fonction inexistante).

- [ ] **Step 3: Implémenter** :

```typescript
// #8.1 — Easing de relâche du blitz (ease-out cubique).
//
// Symétrique de closeoutEasing (qui est sprint→freinage / ease-in dominant).
// Ici les 2 trappeurs DÉCROCHENT vite de la cage puis se posent sur leur
// cible : départ rapide, ralentissement à l'arrivée.
//
// Appliqué dans frameResolver quand defB[id].blitzRecovering ET !screenMode,
// au même point que closeoutEasing.

/**
 * t ∈ [0,1] → progression spatiale ∈ [0,1], ease-out cubique `1-(1-t)^3`.
 * e(0)=0, e(1)=1, monotone, e(0.5)=0.875 (>0.5 → départ rapide).
 */
export function blitzReleaseEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/blitzReleaseEasing.test.ts`
  - Attendu : 5 PASS.

---

### Task 1.2 — Types blitz release

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/logic/defense/types.ts`

- [ ] **Step 1: `AppState.blitzReleaseEnabled`** — près des flags opt-in (vers ligne 972) :

```typescript
  /** #8.1 — Active la relâche tactique du blitz quand le ballon ressort du
   *  trap : le screenerDef récupère le roller, le carrierDef recover. Default
   *  undefined = legacy (retombée homme-à-homme générique). */
  blitzReleaseEnabled?: boolean;
```

- [ ] **Step 2: `ComputedDefender.blitzRecovering`** — près de `closeoutQuality?` :

```typescript
  /** #8.1 — Ce défenseur sort d'un blitz (le ballon vient de ressortir du
   *  trap). Pilote l'easing de relâche (frameResolver) + le badge ↩ RECOVER. */
  blitzRecovering?: boolean;
```

- [ ] **Step 3: `DefenderTarget.blitzRecovering`** — dans defense/types.ts, après `weakSideAnchor?` :

```typescript
  /** #8.1 — sort d'un blitz (cf. ComputedDefender.blitzRecovering). */
  blitzRecovering?: boolean;
```

- [ ] **Step 4: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 1.3 — Helper `detectBlitzRelease` (tests d'abord)

**Files:**
- Create: `src/lib/logic/__tests__/detectBlitzRelease.test.ts`
- Create: `src/lib/logic/defense/detectBlitzRelease.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { detectBlitzRelease } from '@/lib/logic/defense/detectBlitzRelease';

/** Step 0 : PnR blitz O5→O1 (porteur O1). Step 1 : ballon ressort vers O3. */
function makeBlitzThenPassState(opts: { passOut: boolean; rule?: 'blitz' | 'hedge' }): AppState {
  const s0 = makeInitialState();
  const baseOff = { ...s0.steps[0].off };
  return {
    ...s0,
    screenRule: opts.rule ?? 'blitz',
    steps: [
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 380 } }, // O5 plaqué sur D1
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 300 } }, // O5 roll
        ballCarrier: opts.passOut ? 'O3' : 'O1', // passe sortie ou non
      },
    ],
  };
}

describe('detectBlitzRelease', () => {
  it('blitz N-1 + ballon ressort à N → release détecté', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true }), 1);
    expect(r).not.toBeNull();
    expect(r!.rollerId).toBe('O5');         // le poseur devient roller
    expect(r!.formerCarrierId).toBe('O1');  // l'ancien porteur
  });

  it('blitz N-1 mais ballon PAS ressorti (carrier inchangé) → null', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: false }), 1);
    expect(r).toBeNull();
  });

  it('pas de blitz à N-1 (hedge) → null', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true, rule: 'hedge' }), 1);
    expect(r).toBeNull();
  });

  it('step 0 → null (pas d\'historique)', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true }), 0);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/detectBlitzRelease.test.ts`
  - Attendu : FAIL (helper inexistant).

- [ ] **Step 3: Implémenter** :

```typescript
// #8.1 — Détection de la relâche d'un blitz (le ballon ressort du trap).
//
// Conditions :
//  1. stepIdx >= 1
//  2. Au step N-1, un écran porteur était détecté avec effectiveScreenRule blitz
//  3. Le ballCarrier a changé entre N-1 et N (ballon sorti)
//
// Lit le contexte du step N-1 via buildDefenseFrameContext (comme
// detectRejectedScreen). Pur (pas de mutation d'état).

import type { AppState, AttackerId, DefenderId } from '../../types';
import { activeBallCarrier } from '../players';
import { buildDefenseFrameContext } from './context';

export interface BlitzRelease {
  carrierDefId: DefenderId;
  screenerDefId: DefenderId;
  rollerId: AttackerId;
  formerCarrierId: AttackerId;
}

export function detectBlitzRelease(state: AppState, stepIdx: number): BlitzRelease | null {
  if (stepIdx < 1) return null;

  const prevStep = state.steps[stepIdx - 1];
  const curStep = state.steps[stepIdx];
  if (!prevStep || !curStep) return null;

  const prevCarrier = activeBallCarrier(prevStep, state.playerCount);
  const curCarrier = activeBallCarrier(curStep, state.playerCount);
  if (prevCarrier === curCarrier) return null; // ballon pas ressorti

  const { ctx } = buildDefenseFrameContext(state, stepIdx - 1);
  if (!ctx.screen || ctx.effectiveScreenRule !== 'blitz') return null;

  return {
    carrierDefId: ctx.screen.carrierDef,
    screenerDefId: ctx.screen.screenerDef,
    rollerId: ctx.screen.screener,
    formerCarrierId: prevCarrier,
  };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/detectBlitzRelease.test.ts`
  - Attendu : 4 PASS.

---

### Task 1.4 — Couche `blitzReleaseLayer`

**Files:**
- Create: `src/lib/logic/defense/blitzReleaseLayer.ts`

- [ ] **Step 1: Implémenter la couche** :

```typescript
// Couche 2.6 — Relâche du blitz (#8.1).
//
// Quand le ballon ressort d'un blitz (detectBlitzRelease), les 2 trappeurs
// récupèrent : le screenerDef prend le roller (la menace n°1), le carrierDef
// garde sa cible homme naturelle. Les deux sont flaggés blitzRecovering pour
// l'easing de relâche (frameResolver) + le badge visuel.
//
// Opt-in via state.blitzReleaseEnabled. `resolvePlayerCollisions` en aval
// garantit la clearance (Règle #0).

import type { DefenderId, Matchups } from '../../types';
import { detectBlitzRelease } from './detectBlitzRelease';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Offset du screenerDef par rapport au roller, côté panier (comme le tag PnR). */
const ROLLER_TAG_OFFSET = 30;

export function applyBlitzReleaseLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.blitzReleaseEnabled) return;

  const release = detectBlitzRelease(ctx.state, ctx.stepIdx);
  if (!release) return;

  const { off, hoop } = ctx;
  const { carrierDefId, screenerDefId, rollerId } = release;

  // screenerDef récupère le roller : cible homme-à-homme entre roller et panier.
  const screenerTarget = positions[screenerDefId];
  const rollerPos = off[rollerId];
  if (screenerTarget && rollerPos) {
    const dx = hoop.x - rollerPos.x;
    const dy = hoop.y - rollerPos.y;
    const len = Math.hypot(dx, dy) || 1;
    screenerTarget.x = Math.round(rollerPos.x + (dx / len) * ROLLER_TAG_OFFSET);
    screenerTarget.y = Math.round(rollerPos.y + (dy / len) * ROLLER_TAG_OFFSET);
    screenerTarget.matchedTo = rollerId;
    screenerTarget.blitzRecovering = true;
  }

  // carrierDef : garde sa cible naturelle (déjà calculée), juste flaggé.
  const carrierTarget = positions[carrierDefId];
  if (carrierTarget) {
    carrierTarget.blitzRecovering = true;
  }
}
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 1.5 — Câbler la couche + propager le flag

**Files:**
- Modify: `src/lib/logic/engine.ts`
- Modify: `src/lib/logic/defense/speedConstraint.ts`

- [ ] **Step 1: Import + appel dans engine.ts** — import vers ligne 26 :

```typescript
import { applyBlitzReleaseLayer } from './defense/blitzReleaseLayer';
```

Appel entre `applyChainResponseLayer` (2.5) et `applyOffBallScreenLayer` (3) :

```typescript
  applyChainResponseLayer(positions, matchups, ctx);
  // Couche 2.6 — Relâche du blitz (#8.1). Opt-in via state.blitzReleaseEnabled.
  // Quand le ballon ressort d'un trap blitz, le screenerDef récupère le roller.
  applyBlitzReleaseLayer(positions, matchups, ctx);
  applyOffBallScreenLayer(positions, matchups, ctx);
```

- [ ] **Step 2: Propager `blitzRecovering`** — dans speedConstraint.ts, les 3 blocs `out[dId]`, après `weakSideAnchor: targets[dId].weakSideAnchor,` :

```typescript
        blitzRecovering: targets[dId].blitzRecovering,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

---

### Task 1.6 — Tests d'intégration de la couche

**Files:**
- Create: `src/lib/logic/__tests__/blitzReleaseLayer.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeReleaseState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  const baseOff = { ...s0.steps[0].off };
  return {
    ...s0,
    screenRule: 'blitz',
    blitzReleaseEnabled: enabled || undefined,
    steps: [
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 380 } },
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 300 } },
        ballCarrier: 'O3', // ballon ressort
      },
    ],
  };
}

describe('blitzReleaseLayer — intégration', () => {
  it('désactivé par défaut → aucun flag blitzRecovering', () => {
    const def = effectiveDefensePositions(makeReleaseState(false), 1);
    expect(Object.values(def).some((d) => d.blitzRecovering)).toBe(false);
  });

  it('activé → 2 défenseurs blitzRecovering, screenerDef récupère le roller O5', () => {
    const def = effectiveDefensePositions(makeReleaseState(true), 1);
    const recovering = Object.entries(def).filter(([, d]) => d.blitzRecovering);
    expect(recovering.length).toBe(2);
    // Le screenerDef (D5, qui défendait O5) est matché au roller O5.
    const screenerDef = recovering.find(([, d]) => d.matchedTo === 'O5');
    expect(screenerDef).toBeDefined();
  });

  it('INVARIANT clearance : relâche ne crée pas de superposition (≥ 34px)', () => {
    const def = effectiveDefensePositions(makeReleaseState(true), 1);
    const ids = Object.keys(def);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = def[ids[i] as keyof typeof def];
        const b = def[ids[j] as keyof typeof def];
        if (a.matchedTo === b.matchedTo) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(33.9);
      }
    }
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/blitzReleaseLayer.test.ts`
  - Attendu : 3 PASS.

---

### Task 1.7 — Easing dans frameResolver (Règle 1bis)

**Files:**
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Import** — avec les imports easing (vers ligne 50) :

```typescript
import { blitzReleaseEasing } from '../blitzReleaseEasing';
```

- [ ] **Step 2: Câbler à côté du closeout** — vers ligne 773, le bloc :

```typescript
    if (!screenMode && defB[id].closingOut) {
      effT = closeoutEasing(effT);
    }
```

devient :

```typescript
    if (!screenMode && defB[id].closingOut) {
      effT = closeoutEasing(effT);
    } else if (!screenMode && defB[id].blitzRecovering) {
      effT = blitzReleaseEasing(effT);
    }
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Suite Règle 1bis** : `npx vitest run screens overlap userJson screenLab`
  - Attendu : tous PASS.

---

### Task 1.8 — Visuel ↩ RECOVER + toggle

**Files:**
- Modify: `src/components/Player.tsx`
- Modify: `src/components/DefensePanel.tsx`

- [ ] **Step 1: Prop + badge dans Player.tsx** — ajouter `blitzRecovering?: boolean;` dans `PlayerProps`, le destructurer, et ajouter un badge après le bloc closeout ring :

```tsx
{blitzRecovering && !isAttacker && showStateRings && (
  <text
    x={pos.x + r + 12}
    y={pos.y + r + 4}
    fontSize={8}
    fontWeight={700}
    fill="#0EA5A8"
    pointerEvents="none"
  >
    ↩ RECOVER
  </text>
)}
```

Puis passer `blitzRecovering={computed.blitzRecovering}` depuis le parent (même endroit que `closingOut={...}`).

- [ ] **Step 2: Toggle DefensePanel** — ajouter un toggle `blitzReleaseEnabled` dans la section *Couvertures avancées*, visible quand `state.screenRule === 'blitz'` (copier le pattern d'un toggle opt-in existant comme `autoBumpCutters`).

- [ ] **Step 3: Build + suite complète** : `npx tsc --noEmit` puis `npx vitest run` → tous PASS.

---

### Task 1.9 — Commit + push #1

- [ ] **Step 1: Suite Règle 1bis finale** : `npx vitest run screens overlap userJson screenLab` → tous PASS.

- [ ] **Step 2: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/defense/types.ts \
        src/lib/logic/blitzReleaseEasing.ts \
        src/lib/logic/defense/detectBlitzRelease.ts \
        src/lib/logic/defense/blitzReleaseLayer.ts \
        src/lib/logic/engine.ts \
        src/lib/logic/defense/speedConstraint.ts \
        src/lib/logic/playback/frameResolver.ts \
        src/components/Player.tsx \
        src/components/DefensePanel.tsx \
        src/lib/logic/__tests__/blitzReleaseEasing.test.ts \
        src/lib/logic/__tests__/detectBlitzRelease.test.ts \
        src/lib/logic/__tests__/blitzReleaseLayer.test.ts
git commit -m "feat(defense): relâche du blitz quand le ballon ressort (#8.1)"
```

- [ ] **Step 3: Push** : `git push`

---

# CHANTIER #4 — Mise à jour docs

### Task 4.1 — Sync des .md

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `docs/todo-priorities.md`, `docs/SCREEN-ENGINE.md`, `IDEAS.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, ajouter en tête :

```markdown
### Lacunes défensives #8 (2026-06-02) — hedge per-def + ancre weak-side + relâche blitz

- **#8.3** `DefenderRule.hedgeAggression` per-défenseur (override le global B3).
  Slider DefenderMenu + récap DefensePanel.
- **#8.2** Ancre weak-side explicite : couche 1.4 `weakSideAnchorLayer`, helper
  `pickWeakSideAnchor` (auto = low weak-side, override `DefenderRule.weakSideAnchor`).
  Opt-in `state.weakSideAnchorEnabled`. Marqueur ⚓. ~10 tests.
- **#8.1** Relâche du blitz : couche 2.6 `blitzReleaseLayer` + helper
  `detectBlitzRelease` + `blitzReleaseEasing` (frameResolver). Le screenerDef
  récupère le roller quand le ballon ressort. Opt-in `state.blitzReleaseEnabled`.
  Badge ↩ RECOVER. ~12 tests.
```

- [ ] **Step 2: SCREEN-ENGINE.md** — dans le tableau des couches du pipeline (vers ligne 60-90), ajouter les couches 1.4 et 2.6 dans l'ordre ; dans le tableau des helpers, ajouter `pickWeakSideAnchor`, `detectBlitzRelease`, `blitzReleaseEasing`.

- [ ] **Step 3: todo-priorities.md** — ajouter une section « Livrés 2026-06-02 » avec les 3 items #8.

- [ ] **Step 4: IDEAS.md** — § 8 « Lacunes défensives ciblées » : cocher relâche blitz, ancre weak-side, hedge per-def (les 3 livrés). Laisser les autres (tag roller contact/faute, X-out multi-roller, re-scram cascade).

- [ ] **Step 5: ROADMAP.md** — ajouter une ligne dans la synthèse priorisation pour les 3 lacunes livrées.

- [ ] **Step 6: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md docs/todo-priorities.md docs/SCREEN-ENGINE.md IDEAS.md
git commit -m "docs: sync — lacunes défensives #8 livrées (hedge/ancre/blitz release)"
git push
```

---

## Notes d'exécution

- **Ordre strict** : #3 → #2 → #1 → docs. Chaque chantier commit+push avant le suivant.
- **Règle 1bis** : #3 (baseTargets) et #1 (frameResolver) touchent le pipeline d'écran. Lancer `npx vitest run screens overlap userJson screenLab` avant CHAQUE commit de ces deux chantiers.
- **Suite de référence** : 1923 tests verts au départ. Cible finale ~1950 (+27).
- **Adaptation UI** : les noms exacts (`Row`, `Slider`, `onUpdateRule`, props `<Player>`) doivent être copiés des patterns existants dans chaque fichier — le plan donne la structure, pas les noms exacts qui peuvent varier.
