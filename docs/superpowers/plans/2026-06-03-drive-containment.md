# Défense vivante / drive 2a — `driveContainment` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un défenseur de porteur qui, sur un drive, glisse couper la ligne de pénétration s'il est athlétiquement capable d'y arriver, avec un diagnostic coach « drive contenu / ligne ouverte » — sans toucher le tracé dessiné.

**Architecture:** Cœur pur `driveContainment.ts` (course d'ETA porteur vs défenseur → verdict beaten/contained/walled) consommé par (a) une couche défensive opt-in `applyDriveContainmentLayer` insérée après `baseTargets`, qui nudge la cible du défenseur du porteur vers le point de contain, et (b) une règle de diagnostic coach qui ré-évalue le même cœur. Le cœur est agnostique du contexte → réutilisable par le match-sim (2b).

**Tech Stack:** TypeScript, Vitest. Spec : [docs/superpowers/specs/2026-06-03-drive-containment-design.md](../specs/2026-06-03-drive-containment-design.md).

> ⚠️ CLAUDE.md Règle 1bis : la Task 3 insère une couche dans le pipeline
> défensif. Lire `docs/SCREEN-ENGINE.md` avant. La couche est opt-in
> default-off → invariant : flag off ⇒ pipeline bit-identique.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/lib/logic/driveContainment.ts` | Cœur pur : `evaluateDriveContainment`, `containmentSpeed`, constantes | Create |
| `src/lib/logic/__tests__/driveContainment.test.ts` | Tests du cœur | Create |
| `src/lib/types/index.ts` | Champ `AppState.driveContainmentEnabled` | Modify |
| `src/lib/logic/defense/constants.ts` | `CONTAINMENT_MAX_SHIFT_PX` | Modify |
| `src/lib/logic/defense/driveContainmentLayer.ts` | Couche playback (nudge carrierDef) | Create |
| `src/lib/logic/defense/__tests__/driveContainmentLayer.test.ts` | Tests couche | Create |
| `src/lib/logic/engine.ts` | Câblage de la couche (après baseTargets) | Modify |
| `src/lib/logic/__tests__/overlapInvariants.test.ts` | Garde-fou clearance Rule 1 | Modify |
| `src/lib/logic/coachDiagnostics/rules/driveContainment.ts` | Règle diagnostic | Create |
| `src/lib/logic/coachDiagnostics/index.ts` | Enregistrement de la règle | Modify |
| `src/lib/logic/coachDiagnostics/__tests__/driveContainmentRule.test.ts` | Tests règle | Create |
| `src/components/ParametresPanel.tsx` | Toggle UI opt-in | Modify |

**Hors-scope 2a (déféré, noté en self-review)** : badge visuel au containPoint (l'overlay), la déviation du tracé, le câblage match-sim (2b).

---

## Task 1: Cœur pur `driveContainment.ts`

**Files:**
- Create: `src/lib/logic/driveContainment.ts`
- Test: `src/lib/logic/__tests__/driveContainment.test.ts`

- [ ] **Step 1: Écrire les tests (échec attendu)**

Créer `src/lib/logic/__tests__/driveContainment.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  evaluateDriveContainment,
  containmentSpeed,
  DRIVE_MIN_GAIN_PX,
} from '../driveContainment';

const hoop = { x: 250, y: 90 };

describe('containmentSpeed', () => {
  it('module la base par tier (elite ×1.3, lent ×0.7, défaut ×1.0)', () => {
    expect(containmentSpeed('elite', 10)).toBeCloseTo(13);
    expect(containmentSpeed('lent', 10)).toBeCloseTo(7);
    expect(containmentSpeed('standard', 10)).toBeCloseTo(10);
    expect(containmentSpeed(undefined, 10)).toBeCloseTo(10);
  });
});

describe('evaluateDriveContainment', () => {
  it('isDriving=false si le porteur ne gagne pas de terrain vers le panier', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 400 }, // immobile
      defender: { x: 250, y: 360 },
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(false);
  });

  it('walled : défenseur déjà sur la ligne, devant le porteur → arrive avant', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 }, // gagne 50px vers le panier
      defender: { x: 250, y: 250 },    // sur la ligne, proche du panier
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('walled');
    expect(r.margin).toBeLessThan(0);
  });

  it('beaten : défenseur loin derrière → blow-by', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 470 },    // derrière le porteur
      hoop,
      carrierSpeed: 12,
      defenderSpeed: 8,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('beaten');
    expect(r.margin).toBeGreaterThan(0);
  });

  it('contained : défenseur latéral à marge ~nulle', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 280, y: 370 },    // 30px de côté, photo-finish (etaCarrier=etaDef=3.0)
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    expect(r.isDriving).toBe(true);
    expect(r.level).toBe('contained');
  });

  it('containPoint reste entre le porteur et le panier (jamais derrière le porteur)', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 470 }, // derrière → projection clampée au porteur
      hoop,
      carrierSpeed: 10,
      defenderSpeed: 10,
    });
    // y du containPoint ∈ [hoop.y, carrier.y] = [90, 400]
    expect(r.containPoint.y).toBeGreaterThanOrEqual(90);
    expect(r.containPoint.y).toBeLessThanOrEqual(400);
  });

  it('garde-fou : vitesse ≤ 0 ne produit pas de NaN', () => {
    const r = evaluateDriveContainment({
      carrier: { x: 250, y: 400 },
      carrierPrev: { x: 250, y: 450 },
      defender: { x: 250, y: 250 },
      hoop,
      carrierSpeed: 0,
      defenderSpeed: 0,
    });
    expect(Number.isNaN(r.margin)).toBe(false);
  });

  it('DRIVE_MIN_GAIN_PX exporté pour calibration', () => {
    expect(typeof DRIVE_MIN_GAIN_PX).toBe('number');
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npm test -- driveContainment`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le cœur**

Créer `src/lib/logic/driveContainment.ts` :

```ts
// Cœur pur de containment du drive (approche A — course au point de contain).
//
// Agnostique du contexte : ni playback ni match-sim. Consommé par
// `defense/driveContainmentLayer.ts` (playback) et la règle coach
// `coachDiagnostics/rules/driveContainment.ts`, et plus tard par le
// match-sim (2b). Déterministe, sans mutation.

import type { Point } from '../types';
import { distance } from './geometry';

/** Gain minimal de distance vers le panier (entre N-1 et N) pour qu'on
 *  considère le porteur en drive. Calibrable. */
export const DRIVE_MIN_GAIN_PX = 15;

/** Demi-fenêtre de marge d'ETA (en « steps ») séparant contained des cas
 *  tranchés walled/beaten. Calibrable. */
export const CONTAIN_MARGIN_STEPS = 0.15;

export type ContainmentLevel = 'beaten' | 'contained' | 'walled';
export type SpeedTier = 'elite' | 'standard' | 'lent';

export interface DriveContainmentResult {
  isDriving: boolean;
  containPoint: Point;
  level: ContainmentLevel;
  /** ETA_def − ETA_porteur jusqu'au containPoint (steps). Négatif = def avant. */
  margin: number;
}

export interface DriveContainmentInput {
  carrier: Point;
  carrierPrev: Point | null;
  defender: Point;
  hoop: Point;
  carrierSpeed: number;
  defenderSpeed: number;
}

/** Tier athlétique → vitesse effective (mêmes multiplicateurs que
 *  `defenderSpeedProfiles` : elite ×1.3, lent ×0.7, sinon ×1.0). */
export function containmentSpeed(tier: SpeedTier | undefined, base: number): number {
  const mult = tier === 'elite' ? 1.3 : tier === 'lent' ? 0.7 : 1.0;
  return base * mult;
}

/** Point du segment [a,b] le plus proche de p (paramètre clampé [0,1]). */
function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom < 1e-9) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + abx * tc, y: a.y + aby * tc };
}

function eta(from: Point, to: Point, speed: number): number {
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return distance(from, to) / speed;
}

export function evaluateDriveContainment(
  input: DriveContainmentInput,
): DriveContainmentResult {
  const { carrier, carrierPrev, defender, hoop, carrierSpeed, defenderSpeed } = input;

  // Détection drive : gain de distance vers le panier sur le dernier pas.
  const gain = carrierPrev ? distance(carrierPrev, hoop) - distance(carrier, hoop) : 0;
  const isDriving = carrierPrev !== null && gain > DRIVE_MIN_GAIN_PX;

  // containPoint = projection du défenseur sur le segment porteur→panier,
  // clampée entre porteur (t=0) et panier (t=1) → toujours devant le porteur.
  const containPoint = closestPointOnSegment(defender, carrier, hoop);

  if (!isDriving) {
    return { isDriving: false, containPoint, level: 'beaten', margin: Number.POSITIVE_INFINITY };
  }

  const etaCarrier = eta(carrier, containPoint, carrierSpeed);
  const etaDef = eta(defender, containPoint, defenderSpeed);
  // `etaDef === etaCarrier` couvre le cas deux ETA infinies (vitesses ≤ 0)
  // qui produirait sinon `Infinity − Infinity = NaN`.
  const margin = etaDef === etaCarrier ? 0 : etaDef - etaCarrier;

  let level: ContainmentLevel;
  if (margin < -CONTAIN_MARGIN_STEPS) level = 'walled';
  else if (margin > CONTAIN_MARGIN_STEPS) level = 'beaten';
  else level = 'contained';

  return { isDriving, containPoint, level, margin };
}
```

- [ ] **Step 4: Lancer (succès attendu)**

Run: `npm test -- driveContainment`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/logic/driveContainment.ts src/lib/logic/__tests__/driveContainment.test.ts
git commit -m "feat(drive): cœur pur driveContainment (course au point de contain)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Flag `driveContainmentEnabled`

**Files:**
- Modify: `src/lib/types/index.ts` (dans `interface AppState`, près des autres flags physiques)

- [ ] **Step 1: Ajouter le champ**

Dans `interface AppState`, juste après `defenderDragInertiaEnabled?: boolean;` (≈ L970), ajouter :

```ts
  /** Défense vivante / drive (2a) — opt-in. Quand actif, le défenseur du
   *  porteur glisse vers le point de contain sur un drive (couche
   *  driveContainmentLayer) et le diagnostic coach signale drive contenu /
   *  ligne ouverte. Default off → pipeline bit-identique. */
  driveContainmentEnabled?: boolean;
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/types/index.ts
git commit -m "feat(drive): flag opt-in driveContainmentEnabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Couche playback `driveContainmentLayer` + câblage engine

**Files:**
- Modify: `src/lib/logic/defense/constants.ts` (ajouter `CONTAINMENT_MAX_SHIFT_PX`)
- Create: `src/lib/logic/defense/driveContainmentLayer.ts`
- Test: `src/lib/logic/defense/__tests__/driveContainmentLayer.test.ts`
- Modify: `src/lib/logic/engine.ts` (import + appel après baseTargets)

- [ ] **Step 1: Lire SCREEN-ENGINE.md**

Run: `sed -n '1,120p' docs/SCREEN-ENGINE.md`
Prendre connaissance des règles impératives avant de toucher le pipeline.

- [ ] **Step 2: Ajouter la constante de cap**

Dans `src/lib/logic/defense/constants.ts`, à la fin du fichier, ajouter :

```ts
// === driveContainmentLayer (2a — défense vivante / drive) ===
/** Décalage max par step du défenseur du porteur vers le point de contain. */
export const CONTAINMENT_MAX_SHIFT_PX = 8;
```

- [ ] **Step 3: Écrire les tests de la couche (échec attendu)**

Créer `src/lib/logic/defense/__tests__/driveContainmentLayer.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import type { Matchups } from '@/lib/types';
import {
  applyDriveContainmentLayer,
  CONTAINMENT_MAX_SHIFT_PX,
} from '@/lib/logic/defense/driveContainmentLayer';
import type { DefenderTarget } from '@/lib/logic/defense/types';
import type { DefenseFrameContext } from '@/lib/logic/defense/context';

const hoop = { x: 250, y: 90 };

// ctx minimal : seuls les champs lus par la couche sont fournis.
function makeCtx(over: Partial<DefenseFrameContext>): DefenseFrameContext {
  return {
    state: { driveContainmentEnabled: true, defenseMaxSpeed: 10 },
    off: { O1: { x: 250, y: 400 } },
    ballCarrier: 'O1',
    carrierPos: { x: 250, y: 400 },
    defenderIds: ['D1', 'D2'],
    prevOff: { O1: { x: 250, y: 450 } }, // porteur gagne 50px → drive
    hoop,
    ...over,
  } as any;
}

function carrierDef(x: number, y: number): DefenderTarget {
  return { x, y, isCarrierDefender: true, matchedTo: 'O1' } as any;
}

describe('applyDriveContainmentLayer', () => {
  it('CONTAINMENT_MAX_SHIFT_PX exporté', () => {
    expect(CONTAINMENT_MAX_SHIFT_PX).toBe(8);
  });

  it('flag off → no-op (positions inchangées)', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
      D2: { x: 100, y: 380, isCarrierDefender: false, matchedTo: 'O2' } as any,
    };
    const before = JSON.parse(JSON.stringify(positions));
    applyDriveContainmentLayer(
      positions as any,
      {} as Matchups,
      makeCtx({ state: { driveContainmentEnabled: false, defenseMaxSpeed: 10 } as any }),
    );
    expect(positions).toEqual(before);
  });

  it('flag on + contained → carrierDef nudgé vers containPoint, ≤ cap', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
    };
    const startX = positions.D1.x;
    const startY = positions.D1.y;
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    const shift = Math.hypot(positions.D1.x - startX, positions.D1.y - startY);
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThanOrEqual(CONTAINMENT_MAX_SHIFT_PX + 1e-6);
  });

  it('flag on + beaten (défenseur loin derrière) → carrierDef inchangé', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(250, 470), // derrière le porteur → beaten
    };
    const before = { ...positions.D1 };
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    expect(positions.D1.x).toBeCloseTo(before.x);
    expect(positions.D1.y).toBeCloseTo(before.y);
  });

  it("n'altère que le défenseur du porteur", () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
      D2: { x: 100, y: 380, isCarrierDefender: false, matchedTo: 'O2' } as any,
    };
    const d2Before = { ...positions.D2 };
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    expect(positions.D2).toEqual(d2Before);
  });
});
```

- [ ] **Step 4: Lancer (échec attendu)**

Run: `npm test -- driveContainmentLayer`
Expected: FAIL — module introuvable.

- [ ] **Step 5: Implémenter la couche**

Créer `src/lib/logic/defense/driveContainmentLayer.ts` :

```ts
// Couche 1.2 (2a — défense vivante / drive) — containment du drive.
//
// Après baseTargets : si le porteur drive et que son défenseur peut
// atteindre le point de contain à temps (verdict contained/walled), on
// glisse la cible du défenseur du porteur vers ce point (cap dur). Si le
// défenseur est battu (beaten) on ne fait rien (en retard = réaliste).
//
// N'altère QUE le défenseur du porteur. Opt-in via state.driveContainmentEnabled.
// La clearance Rule 1 est garantie en aval par resolvePlayerCollisions.

import type { DefenderId, Matchups } from '../../types';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { evaluateDriveContainment, containmentSpeed } from '../driveContainment';
import { CONTAINMENT_MAX_SHIFT_PX } from './constants';

export { CONTAINMENT_MAX_SHIFT_PX };

export function applyDriveContainmentLayer(
  positions: Record<DefenderId, DefenderTarget>,
  _matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.driveContainmentEnabled) return;

  const { defenderIds, carrierPos, ballCarrier, hoop, prevOff, state } = ctx;

  // Défenseur du porteur (posé par baseTargets).
  const carrierDef = defenderIds.find((dId) => positions[dId]?.isCarrierDefender);
  if (!carrierDef) return;
  const def = positions[carrierDef];

  const carrierPrev = prevOff?.[ballCarrier] ?? null;
  const base = state.defenseMaxSpeed;

  const result = evaluateDriveContainment({
    carrier: carrierPos,
    carrierPrev,
    defender: { x: def.x, y: def.y },
    hoop,
    carrierSpeed: containmentSpeed(state.attackerSpeedProfiles?.[ballCarrier], base),
    defenderSpeed: containmentSpeed(state.defenderSpeedProfiles?.[carrierDef], base),
  });

  if (!result.isDriving) return;
  if (result.level === 'beaten') return;

  // contained / walled → glisser vers le containPoint, cap dur.
  const dx = result.containPoint.x - def.x;
  const dy = result.containPoint.y - def.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const shift = Math.min(d, CONTAINMENT_MAX_SHIFT_PX);
  def.x += (dx / d) * shift;
  def.y += (dy / d) * shift;
}
```

- [ ] **Step 6: Lancer (succès attendu)**

Run: `npm test -- driveContainmentLayer`
Expected: PASS (5 tests).

- [ ] **Step 7: Câbler dans `engine.ts`**

Ajouter l'import près des autres couches (après la ligne `import { applyBaseTargetsLayer } from './defense/baseTargets';`, ≈ L19) :

```ts
import { applyDriveContainmentLayer } from './defense/driveContainmentLayer';
```

Insérer l'appel juste après `applyBaseTargetsLayer(positions, matchups, ctx);` (L111), avant le commentaire « Couche 1.3 » :

```ts
  // Couche 1.2 (2a) — Drive containment : le défenseur du porteur glisse
  // couper la ligne de pénétration s'il peut atteindre le point de contain
  // à temps. Opt-in via state.driveContainmentEnabled. N'altère que le
  // défenseur du porteur.
  applyDriveContainmentLayer(positions, matchups, ctx);
```

- [ ] **Step 8: Non-régression pipeline (flag off ⇒ bit-identique)**

Run: `npm test -- screens overlap userJson screenLab`
Expected: PASS (la couche court-circuite quand le flag est absent → aucune golden touchée).

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/logic/defense/constants.ts src/lib/logic/defense/driveContainmentLayer.ts src/lib/logic/defense/__tests__/driveContainmentLayer.test.ts src/lib/logic/engine.ts
git commit -m "feat(drive): couche driveContainmentLayer + câblage engine (opt-in)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Garde-fou clearance Rule 1

**Files:**
- Modify: `src/lib/logic/__tests__/overlapInvariants.test.ts`

- [ ] **Step 1: Ajouter un test de clearance avec la couche active**

À la fin du `describe` principal de `src/lib/logic/__tests__/overlapInvariants.test.ts`, ajouter un cas : un état réaliste avec `driveContainmentEnabled: true` et un porteur en drive proche d'un défenseur, vérifiant que la clearance 34 px tient après `effectiveDefensePositions`.

```ts
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { getActiveDefenderIds } from '@/lib/logic/players';
import { distance } from '@/lib/logic/geometry';

it('driveContainmentEnabled : clearance 34px préservée sur un drive', () => {
  const base = makeInitialState();
  const prev = makeStep(base.steps[0].off, 'O1', []);
  // Étape courante : porteur avancé vers le panier (drive).
  const cur = makeStep(
    { ...base.steps[0].off, O1: { x: 250, y: 360 } },
    'O1',
    [],
  );
  const state = {
    ...base,
    driveContainmentEnabled: true,
    steps: [prev, cur],
    activeStep: 1,
  };
  const def = effectiveDefensePositions(state, 1);
  const ids = getActiveDefenderIds(state.playerCount);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      expect(distance(def[ids[i]], def[ids[j]])).toBeGreaterThanOrEqual(34 - 1e-6);
    }
  }
});
```

- [ ] **Step 2: Lancer**

Run: `npm test -- overlapInvariants`
Expected: PASS (la couche passe par `resolvePlayerCollisions` en aval → clearance garantie).

- [ ] **Step 3: Commit**

```bash
git add src/lib/logic/__tests__/overlapInvariants.test.ts
git commit -m "test(drive): garde-fou clearance Rule 1 avec driveContainment actif

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Règle de diagnostic coach

**Files:**
- Create: `src/lib/logic/coachDiagnostics/rules/driveContainment.ts`
- Modify: `src/lib/logic/coachDiagnostics/index.ts` (import + entrée REGISTRY)
- Test: `src/lib/logic/coachDiagnostics/__tests__/driveContainmentRule.test.ts`

- [ ] **Step 1: Écrire les tests (échec attendu)**

Créer `src/lib/logic/coachDiagnostics/__tests__/driveContainmentRule.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { driveContainmentRule } from '../rules/driveContainment';
import type { RuleContext } from '../types';

const hoop = { x: 250, y: 90 };

function makeCtx(over: Partial<RuleContext>): RuleContext {
  return {
    state: { driveContainmentEnabled: true, defenseMaxSpeed: 10, playerCount: 5, steps: [
      { off: { O1: { x: 250, y: 450 } } },
      { off: { O1: { x: 250, y: 400 } } },
    ] },
    stepIdx: 1,
    off: { O1: { x: 250, y: 400 } },
    carrier: 'O1',
    carrierPos: { x: 250, y: 400 },
    defPos: { D1: { x: 250, y: 250, isCarrierDefender: true, matchedTo: 'O1' } },
    defenderIds: ['D1'],
    hoop,
    ...over,
  } as any;
}

describe('driveContainmentRule', () => {
  it('flag off → aucun diagnostic', () => {
    const out = driveContainmentRule(
      makeCtx({ state: { driveContainmentEnabled: false, defenseMaxSpeed: 10, playerCount: 5,
        steps: [{ off: { O1: { x: 250, y: 450 } } }, { off: { O1: { x: 250, y: 400 } } }] } as any }),
    );
    expect(out).toEqual([]);
  });

  it('drive contenu (défenseur sur la ligne devant) → message "contenu"', () => {
    const out = driveContainmentRule(makeCtx({}));
    expect(out).toHaveLength(1);
    expect(out[0].tag).toBe('drive-contained');
    expect(out[0].message).toContain('contenu');
  });

  it('drive ouvert (défenseur battu derrière) → message "ligne ouverte"', () => {
    const out = driveContainmentRule(
      makeCtx({ defPos: { D1: { x: 250, y: 470, isCarrierDefender: true, matchedTo: 'O1' } } as any }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].tag).toBe('drive-open');
    expect(out[0].message).toContain('ligne ouverte');
  });

  it('pas de drive → aucun diagnostic', () => {
    const out = driveContainmentRule(
      makeCtx({ state: { driveContainmentEnabled: true, defenseMaxSpeed: 10, playerCount: 5,
        steps: [{ off: { O1: { x: 250, y: 400 } } }, { off: { O1: { x: 250, y: 400 } } }] } as any }),
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npm test -- driveContainmentRule`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter la règle**

Créer `src/lib/logic/coachDiagnostics/rules/driveContainment.ts` :

```ts
// Règle — Défense vivante / drive (2a). Ré-évalue le cœur pur de
// containment et émet une phrase coach : drive contenu vs ligne ouverte.
// Ne fire que si state.driveContainmentEnabled.

import { activeOffense } from '../../players';
import {
  evaluateDriveContainment,
  containmentSpeed,
} from '../../driveContainment';
import type { CoachDiagnostic, Rule } from '../types';

export const driveContainmentRule: Rule = (ctx) => {
  const { state, stepIdx, carrier, carrierPos, defPos, defenderIds, hoop } = ctx;
  if (!state.driveContainmentEnabled) return [];
  if (stepIdx <= 0) return [];

  const carrierDef = defenderIds.find((dId) => defPos[dId]?.isCarrierDefender);
  if (!carrierDef) return [];

  const prevOff = activeOffense(state.steps[stepIdx - 1].off, state.playerCount);
  const carrierPrev = prevOff[carrier] ?? null;
  const def = defPos[carrierDef];
  const base = state.defenseMaxSpeed;

  const result = evaluateDriveContainment({
    carrier: carrierPos,
    carrierPrev,
    defender: { x: def.x, y: def.y },
    hoop,
    carrierSpeed: containmentSpeed(state.attackerSpeedProfiles?.[carrier], base),
    defenderSpeed: containmentSpeed(state.defenderSpeedProfiles?.[carrierDef], base),
  });

  if (!result.isDriving) return [];

  if (result.level === 'beaten') {
    const out: CoachDiagnostic[] = [{
      id: `drive-open-${carrier}`,
      severity: 'warning',
      message: `Drive de ${carrier} — ligne ouverte (${carrierDef} battu)`,
      tag: 'drive-open',
      defenders: [carrierDef],
      attackers: [carrier],
    }];
    return out;
  }

  const out: CoachDiagnostic[] = [{
    id: `drive-contained-${carrier}`,
    severity: 'good',
    message: `Drive de ${carrier} contenu par ${carrierDef} — ligne coupée`,
    tag: 'drive-contained',
    defenders: [carrierDef],
    attackers: [carrier],
  }];
  return out;
};
```

- [ ] **Step 4: Enregistrer la règle**

Dans `src/lib/logic/coachDiagnostics/index.ts` :

1. Ajouter l'import avec les autres imports de règles (après `import { baselineDriveRule } from './rules/baselineDriveCoverage';`) :
```ts
import { driveContainmentRule } from './rules/driveContainment';
```

2. Ajouter `driveContainmentRule` dans le tableau `REGISTRY`. Repérer la déclaration `const REGISTRY` (ou équivalent) et ajouter l'entrée en fin de liste (pas de dépendance de dédup) :
```ts
  driveContainmentRule,
```

> Vérifier le nom exact du tableau de registry à l'édition (`REGISTRY` selon
> le commentaire d'en-tête du fichier) et y ajouter l'entrée.

- [ ] **Step 5: Lancer**

Run: `npm test -- driveContainmentRule`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + non-régression diagnostics + commit**

```bash
npx tsc --noEmit
npm test -- coachDiagnostic CoachDiagnostic
git add src/lib/logic/coachDiagnostics/rules/driveContainment.ts src/lib/logic/coachDiagnostics/index.ts src/lib/logic/coachDiagnostics/__tests__/driveContainmentRule.test.ts
git commit -m "feat(drive): règle diagnostic coach drive contenu / ligne ouverte

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Toggle UI

**Files:**
- Modify: `src/components/ParametresPanel.tsx` (section « Physique & Biomécanique »)

- [ ] **Step 1: Ajouter la checkbox opt-in**

Dans la section `<SettingsSection title="Physique & Biomécanique">`, après la `CheckboxLine` du footwork (juste après le bloc `onChange={(v) => onPatch({ footworkRulesEnabled: v })} ... />`), ajouter :

```tsx
          <CheckboxLine
            checked={!!state.driveContainmentEnabled}
            label="Défense vivante sur drive (containment)"
            onChange={(v) => onPatch({ driveContainmentEnabled: v })}
            title="Sur un drive, le défenseur du porteur glisse couper la ligne de pénétration s'il peut atteindre le point de contain à temps (course d'ETA selon l'athlétisme). Diagnostic coach 'drive contenu / ligne ouverte'. N'altère pas le tracé dessiné."
          />
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/ParametresPanel.tsx
git commit -m "feat(drive): toggle UI défense vivante sur drive (opt-in)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Vérification visuelle + validation finale + push

- [ ] **Step 1: Suite complète + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: tout vert (≈ 2045 + ~18 nouveaux), aucune golden cassée.

- [ ] **Step 2: Vérification preview**

Via `preview_start` : charger l'app, activer « Défense vivante sur drive », construire un scénario à 2 étapes où O1 drive vers le panier avec D1 latéral. Vérifier au `preview_screenshot` que D1 glisse couper la ligne (contained) et que le diagnostic coach affiche « drive contenu ». `preview_console_logs` : aucune erreur. Tester aussi un cas où D1 est loin derrière → « ligne ouverte », D1 ne se téléporte pas.

- [ ] **Step 3: Docs**

Ajouter une entrée datée 2026-06-03 dans `CHANGELOG.md` (§ Unreleased, « Défense vivante / drive 2a — driveContainment ») et marquer le statut dans `ROADMAP.md` (sous-projet 2a livré, 2b à faire). Mentionner le câblage match-sim (2b) comme prochaine étape.

```bash
git add CHANGELOG.md ROADMAP.md
git commit -m "docs: défense vivante / drive 2a livré (driveContainment + playback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review (rempli par l'auteur du plan)

- **Couverture spec** : cœur pur + approche A (T1) · flag opt-in (T2) · couche playback nudge carrierDef cappé + slot après baseTargets + câblage (T3) · clearance Rule 1 (T4) · diagnostic coach contenu/ouvert (T5) · UI (T6) · preview + validation (T7). ✅
  - **Badge visuel au containPoint** (spec §3) : **déféré** hors 2a — le diagnostic texte couvre l'« aide coach » ; le badge est de la polish UI ajoutant une surface d'overlay, à demander si voulu. Noté ici explicitement plutôt que silencieusement omis.
- **Placeholders** : aucun « TBD/TODO » ; tout le code est explicite. Seule note d'inspection (nom exact du tableau `REGISTRY` en T5 step 4) = vérification, pas un trou.
- **Cohérence types** : `evaluateDriveContainment` / `DriveContainmentInput` / `DriveContainmentResult` / `containmentSpeed` / `ContainmentLevel` / `CONTAINMENT_MAX_SHIFT_PX` / `applyDriveContainmentLayer` / `driveContainmentRule` / `driveContainmentEnabled` utilisés identiquement partout. ✅
