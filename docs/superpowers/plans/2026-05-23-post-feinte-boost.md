# Phy.O V3 V4 — Boost post-feinte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Quand le démarquage actif est on et qu'une feinte est posée, le profil de vitesse intègre un **boost** (v > 1) légèrement après la feinte — simule le défenseur ayant mordu, l'attaquant accélère pour le perdre.

**Architecture:** Étendre `computeFeinteFactors` pour produire `1 - dip + boost` où `boost = boostAmplitude * Σ exp(-((s - tF - offset)/width)²/2)`. Activé via `attackerActiveDemarquage` (réutilise le flag V3 V1). Pas de nouvelle UI ni de field per-feinte — globalement actif quand demarquage on.

**Tech Stack:** TypeScript, Vitest.

**Pré-requis :** Phy.O V4 V1+V2 + V3 V1 livrés. Réutilise `Annotation.feintes` + `state.attackerActiveDemarquage`.

---

### Task 1: Constants + helper boost + tests

**Files:**
- Modify: `src/lib/data/physics.ts`
- Modify: `src/lib/logic/velocityProfile.ts`
- Modify: `src/lib/logic/__tests__/velocityProfile.test.ts`

- [ ] **Step 1: Constants**

Dans `src/lib/data/physics.ts`, ajouter :

```ts
/** Phy.O V3 V4 — Amplitude du boost post-feinte. Au pic, v atteint
 *  `1 + AMPLITUDE` (1.4 par défaut = 40% au-dessus de v normal). */
export const OFFENSIVE_POST_FEINTE_BOOST_AMPLITUDE = 0.4;

/** Phy.O V3 V4 — Offset du pic de boost après le centre de la feinte,
 *  en fraction d'arc. 0.10 = boost peak ~10% d'arc après la feinte. */
export const OFFENSIVE_POST_FEINTE_BOOST_OFFSET = 0.10;
```

- [ ] **Step 2: Tests TDD**

Dans `src/lib/logic/__tests__/velocityProfile.test.ts`, ajouter :

```ts
  it('Phy.O V3 V4 — boost post-feinte (postFeinteBoost on) → accélération après la feinte', () => {
    // Feinte symétrique au milieu d'un path droit. Sans boost (V4 V1),
    // remap(0.5) = 0.5 (symétrie). Avec boost post-feinte ON, la
    // ré-accélération asymétrique après le creux fait que à mi-temps,
    // le joueur est AU-DELÀ du milieu (il a freiné PUIS sprinté).
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { feintes: [0.5], postFeinteBoost: true },
    );
    expect(p.remap(0.5)).toBeGreaterThan(0.5 + 0.02);
  });

  it('Phy.O V3 V4 — postFeinteBoost off → V4 V1 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const noBoost = buildVelocityProfile(path, { feintes: [0.5] });
    const explicit = buildVelocityProfile(path, { feintes: [0.5], postFeinteBoost: false });
    expect(explicit.remap(0.5)).toBeCloseTo(noBoost.remap(0.5), 6);
  });

  it('Phy.O V3 V4 — postFeinteBoost on mais aucune feinte → identité', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p = buildVelocityProfile(path, { feintes: [], postFeinteBoost: true });
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
  });
```

Run: `npx vitest run velocityProfile`
Expected: 20 existants verts, 3 nouveaux FAIL (boost pas câblé).

- [ ] **Step 3: Implementation**

Dans `src/lib/logic/velocityProfile.ts`, ajouter aux imports :

```ts
import {
  // ... existants
  OFFENSIVE_POST_FEINTE_BOOST_AMPLITUDE,
  OFFENSIVE_POST_FEINTE_BOOST_OFFSET,
} from '../data/physics';
```

Étendre `VelocityProfileOptions` :

```ts
  /** Phy.O V3 V4 — Active le boost post-feinte (accélération brève
   *  juste après chaque feinte, simulant le défenseur ayant mordu).
   *  Sans effet si `feintes` est vide. */
  postFeinteBoost?: boolean;
  /** Phy.O V3 V4 — Amplitude du boost. Défaut :
   *  OFFENSIVE_POST_FEINTE_BOOST_AMPLITUDE (0.4 → pic v=1.4). */
  postFeinteBoostAmplitude?: number;
  /** Phy.O V3 V4 — Offset du pic après le centre de la feinte (fraction
   *  d'arc). Défaut : OFFENSIVE_POST_FEINTE_BOOST_OFFSET (0.10). */
  postFeinteBoostOffset?: number;
```

Modifier la signature de `computeFeinteFactors` :

```ts
function computeFeinteFactors(
  sampleCount: number,
  feintes: number[],
  depth: number,
  width: number,
  boost: { amplitude: number; offset: number } | undefined,
): number[] {
  const out = new Array<number>(sampleCount).fill(1);
  if (feintes.length === 0 || width <= 0 || sampleCount < 2) return out;
  const depthFactor = 1 - depth;
  for (let i = 0; i < sampleCount; i++) {
    const sNorm = i / (sampleCount - 1);
    let maxDip = 0;
    let maxBoost = 0;
    for (const tF of feintes) {
      // Dip centré sur la feinte.
      const uDip = (sNorm - tF) / width;
      const dip = depthFactor * Math.exp(-(uDip * uDip) / 2);
      if (dip > maxDip) maxDip = dip;
      // Phy.O V3 V4 — boost centré APRÈS la feinte.
      if (boost) {
        const uBoost = (sNorm - tF - boost.offset) / width;
        const b = boost.amplitude * Math.exp(-(uBoost * uBoost) / 2);
        if (b > maxBoost) maxBoost = b;
      }
    }
    out[i] = 1 - maxDip + maxBoost;
  }
  return out;
}
```

Dans `buildVelocityProfile`, modifier l'appel :

```ts
  const feinteFactors = computeFeinteFactors(
    pts.length,
    options.feintes ?? [],
    feinteDepth,
    feinteWidth,
    options.postFeinteBoost
      ? {
          amplitude: options.postFeinteBoostAmplitude ?? OFFENSIVE_POST_FEINTE_BOOST_AMPLITUDE,
          offset: options.postFeinteBoostOffset ?? OFFENSIVE_POST_FEINTE_BOOST_OFFSET,
        }
      : undefined,
  );
```

Le reste (intégration time, normalisation, remap) inchangé.

- [ ] **Step 4: Run tests**

Run: `npx vitest run velocityProfile`
Expected: 23 verts (20 + 3).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/physics.ts src/lib/logic/velocityProfile.ts src/lib/logic/__tests__/velocityProfile.test.ts
git commit -m "feat(velocityProfile): Phy.O V3 V4 — boost post-feinte (lecture proactive)"
```

---

### Task 2: Câblage `playbackTrajectory` + `frameResolver`

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Étendre `PlaybackVelocityProfileOptions`**

Dans `src/lib/logic/playbackTrajectory.ts` :

```ts
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
  obstaclesFor?: (id: AttackerId) => Point[];
  matchedDefenderFor?: (id: AttackerId) => Point | undefined;
  /** Phy.O V3 V4 — Active le boost post-feinte (lecture proactive). */
  postFeinteBoost?: boolean;
}
```

Modifier `getOrBuildProfile` :

```ts
function getOrBuildProfile(
  ann: Annotation,
  path: Point[],
  tier: AttackerSpeedTier | undefined,
  obstacles: Point[],
  matchedDefenderPos: Point | undefined,
  postFeinteBoost: boolean,
): VelocityProfile {
  let perAnn = profileCache.get(ann);
  if (!perAnn) {
    perAnn = new Map();
    profileCache.set(ann, perAnn);
  }
  const tierKey = tier ?? 'standard';
  const obstaclesHash = obstacles.length === 0 ? '0'
    : obstacles.map((o) => `${o.x | 0},${o.y | 0}`).join(';');
  const feintes = ann.feintes ?? [];
  const feintesHash = feintes.length === 0 ? '0'
    : feintes.map((t) => Math.round(t * 100)).join(',');
  const mdpHash = matchedDefenderPos
    ? `${matchedDefenderPos.x | 0},${matchedDefenderPos.y | 0}`
    : '0';
  // Phy.O V3 V4 — flag boost inclus dans la clé.
  const boostKey = postFeinteBoost ? '1' : '0';
  const key = `${tierKey}|${obstaclesHash}|${feintesHash}|${mdpHash}|${boostKey}`;
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, {
      tier,
      obstacles,
      feintes,
      matchedDefenderPos,
      postFeinteBoost,
    });
    perAnn.set(key, profile);
  }
  return profile;
}
```

Modifier les deux call sites :

```ts
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
        const matchedDefenderPos = velocityProfileOptions.matchedDefenderFor?.(playerId);
        const postFeinteBoost = !!velocityProfileOptions.postFeinteBoost;
        s = getOrBuildProfile(
          ann, path, tier, obstacles, matchedDefenderPos, postFeinteBoost,
        ).remap(actionT);
      }
```

- [ ] **Step 2: Câblage `frameResolver.ts`**

Dans `velocityProfileOptions` au call site, ajouter :

```ts
        postFeinteBoost: !!state.attackerActiveDemarquage,
```

(Réutilise le flag V3 V1 — le démarquage actif active à la fois la
lecture du matched defender ET le boost post-feinte.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run` — full suite verte (~1743 = 1740 + 3).
Run: `npx vitest run screens overlap userJson screenLab` — 164 verts.

- [ ] **Step 4: Commit + ROADMAP + push**

```bash
git add src/lib/logic/playbackTrajectory.ts src/lib/logic/playback/frameResolver.ts
git commit -m "feat(playback): Phy.O V3 V4 — câblage boost post-feinte"
```

Dans `ROADMAP.md`, dans la section Phase Phy.O, après la ligne V3 V1
livrée, mettre à jour la ligne `Phy.O V3 V2+` :

```
| ~~Phy.O V3 V4~~ | ~~**Boost post-feinte (lecture proactive)**~~ : feinte gaussienne devient asymétrique avec un pic v=1.4 placé ~10% d'arc après le creux. Activé par le même flag `attackerActiveDemarquage`. Sans nouvelle UI. | — | — | — | 🟢 livré 2026-05-23 (3 tests) |
| Phy.O V3 V2 | **Choix de côté du cut** (approche B — règles déclaratives, RFC `cut-side-flip-RFC.md`). | 1j | 🟡 | Haut | ⚪ |
| Phy.O V3 V3 | **Sortie tangentielle d'écran adaptée** (approche B, RFC `tangential-screen-exit-RFC.md`). | 1j | 🟡 | Haut | ⚪ |
```

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phy.O V3 V4 livré, V3 V2+V3 en RFC séparés"
git push
```

---

## Notes

- **Pas de UI dédiée** — réutilise le flag V3 V1. Le boost s'active dès
  que démarquage actif est on ET que l'annotation a des feintes.
- **Effet visuel** — un V-cut avec feinte au milieu, démarquage actif on :
  ralentissement puis sprint perceptible. Avec démarquage actif off :
  juste le ralentissement V4 V1.
