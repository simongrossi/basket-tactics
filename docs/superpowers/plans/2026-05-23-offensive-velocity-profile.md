# Phy.O V1 — Profil de vitesse offensif Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux attaquants une physique de mouvement réaliste — ralentir dans les virages serrés (V-cuts, hesitations), ré-accélérer en sortie, garder la vitesse max sur les drives droits, avec différenciation par tier athlétique (elite / standard / lent).

**Architecture:** Un module pur `velocityProfile.ts` calcule la courbure le long du path Catmull-Rom de chaque annotation, en déduit un profil de vitesse `v(s) = v_max / (1 + α κ(s))`, intègre en temps physique, normalise et inverse pour produire un **remap** `actionT_linéaire → s/L`. Le câblage dans `playbackTrajectory.ts` substitue ce remap au sampling linéaire actuel, derrière un flag opt-in. Endpoints `ann.from` / `ann.to` toujours respectés (invariant utilisateur).

**Tech Stack:** TypeScript, Vitest. Module pur, déterministe, cacheable via WeakMap.

---

### Task 1: Types + constantes

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/data/physics.ts`

- [ ] **Step 1: Étendre les types**

Dans `src/lib/types/index.ts`, près de la définition de `defenderSpeedProfiles` (~ligne 968), ajouter le type :

```ts
/** Phy.O — Tier athlétique d'un attaquant (mirror de
 *  `defenderSpeedProfiles` G.4). Module la sensibilité à la courbure :
 *  un elite garde plus de vitesse en virage, un lent ralentit plus. Tous
 *  les attaquants arrivent à `ann.to` au boundary (invariant). */
export type AttackerSpeedTier = 'elite' | 'standard' | 'lent';
```

Dans `interface AppState`, à proximité de `defenderSpeedProfiles?:`, ajouter :

```ts
  /** Phy.O — Tier athlétique par attaquant. Module `α` du profil de vitesse
   *  offensif (cf. velocityProfile.ts). Tier absent = `'standard'`. */
  attackerSpeedProfiles?: Partial<Record<AttackerId, AttackerSpeedTier>>;

  /** Phy.O — Active le profil de vitesse offensif (courbure + tier). Opt-in :
   *  default `undefined` → comportement legacy strict (sampling linéaire). */
  attackerVelocityProfileEnabled?: boolean;
```

- [ ] **Step 2: Ajouter les constantes physiques**

Dans `src/lib/data/physics.ts`, ajouter à la fin du fichier (après les autres
constantes) :

```ts
/** Phy.O — Sensibilité de base à la courbure pour le profil de vitesse
 *  offensif. Plus haut = ralentissement plus marqué dans les virages.
 *  Tunable. */
export const OFFENSIVE_CURVATURE_SENSITIVITY = 120;

/** Phy.O — Nombre de points d'échantillonnage du profil le long de la
 *  longueur d'arc. Compromis précision vs coût (one-shot par annotation,
 *  donc tolérable). */
export const OFFENSIVE_PROFILE_SAMPLES = 64;

/** Phy.O — Multiplicateurs `α` par tier athlétique attaquant.
 *  - elite : ×0.7 (garde plus de vitesse en virage)
 *  - standard : ×1.0
 *  - lent : ×1.4 (ralentit plus dans les virages) */
export const OFFENSIVE_TIER_MULTIPLIER = {
  elite: 0.7,
  standard: 1.0,
  lent: 1.4,
} as const;
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (additions optionnelles, aucun consommateur encore).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts src/lib/data/physics.ts
git commit -m "feat(types): Phy.O — AttackerSpeedTier + constantes courbure"
```

---

### Task 2: Module pur `velocityProfile.ts` + tests TDD

**Files:**
- Create: `src/lib/logic/velocityProfile.ts`
- Test: `src/lib/logic/__tests__/velocityProfile.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/lib/logic/__tests__/velocityProfile.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { buildVelocityProfile } from '../velocityProfile';

describe('buildVelocityProfile', () => {
  it('path à 2 points → remap identité', () => {
    const p = buildVelocityProfile([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path droit à 3 points (collinéaires) → remap identité', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeCloseTo(0.25, 3);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 3);
  });

  it("path en V symétrique → à actionT=0.25, s/L > 0.25 (avance en zone rapide)", () => {
    // Apex à (50, 80) entre (0,0) et (100,0) — V symétrique.
    // En zone rapide (avant l'apex), le joueur couvre plus d'arc par
    // unité de temps qu'en moyenne.
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeGreaterThan(0.25 + 0.02);
  });

  it('path en V symétrique → remap(0.5) ≈ 0.5 par symétrie', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('endpoints invariants : remap(0) === 0, remap(1) === 1', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0)).toBe(0);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('monotonie : 10 valeurs croissantes → s/L strictement croissant', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const s = p.remap(i / 10);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('tier elite vs lent : elite dévie moins de l\'identité que lent', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ];
    const elite = buildVelocityProfile(path, { tier: 'elite' });
    const lent = buildVelocityProfile(path, { tier: 'lent' });
    // À actionT=0.25, la déviation par rapport à 0.25 est plus grande
    // pour lent (qui ralentit plus en virage).
    const deltaElite = Math.abs(elite.remap(0.25) - 0.25);
    const deltaLent = Math.abs(lent.remap(0.25) - 0.25);
    expect(deltaLent).toBeGreaterThan(deltaElite);
  });

  it('path dégénéré (from === to) → remap identité, length 0', () => {
    const p = buildVelocityProfile([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(p.length).toBe(0);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 6);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path à 1 point ou vide → remap identité', () => {
    const p1 = buildVelocityProfile([{ x: 5, y: 5 }]);
    expect(p1.length).toBe(0);
    expect(p1.remap(0.7)).toBeCloseTo(0.7, 6);
    const p0 = buildVelocityProfile([]);
    expect(p0.length).toBe(0);
    expect(p0.remap(0.3)).toBeCloseTo(0.3, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run velocityProfile`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Write the implementation**

Créer `src/lib/logic/velocityProfile.ts` :

```ts
// Phy.O — Profil de vitesse offensif piloté par courbure.
//
// Pour chaque path (polyline lissée Catmull-Rom), calcule un mapping
// `actionT_linéaire ∈ [0,1] → s/L ∈ [0,1]` (fraction d'arc à laquelle
// sampler le path). Les endpoints sont strictement préservés : un
// attaquant arrive toujours à `ann.to` au boundary du segment.
//
// Modèle : v(s) = 1 / (1 + α × κ(s)). Lent dans les virages (κ élevé),
// rapide en ligne droite (κ=0 → v=1). α modulé par le tier athlétique
// (elite ×0.7, lent ×1.4 — l'elite garde plus de vitesse en virage).
//
// Pur, déterministe, sans mutation d'entrée.

import type { AttackerSpeedTier, Point } from '../types';
import {
  OFFENSIVE_CURVATURE_SENSITIVITY,
  OFFENSIVE_PROFILE_SAMPLES,
  OFFENSIVE_TIER_MULTIPLIER,
} from '../data/physics';

// Re-export pour usage local (caller dans playbackTrajectory.ts importe
// depuis ce module pour éviter de connaître la structure de `types`).
export type { AttackerSpeedTier };

export interface VelocityProfileOptions {
  /** α de base : sensibilité à la courbure. Défaut : OFFENSIVE_CURVATURE_SENSITIVITY. */
  curvatureSensitivity?: number;
  /** Tier athlétique → multiplie α. Absent = standard (×1.0). */
  tier?: AttackerSpeedTier;
  /** Nombre de points d'échantillonnage. Défaut : OFFENSIVE_PROFILE_SAMPLES. */
  samples?: number;
}

export interface VelocityProfile {
  /** Remap actionT_linéaire ∈ [0,1] → fraction d'arc s/L ∈ [0,1]. */
  remap: (actionT: number) => number;
  /** Longueur totale du path (somme des segments). */
  length: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Échantillonne N+1 points uniformément le long de la longueur d'arc. */
function arcLengthSamples(path: Point[], samples: number): Point[] {
  if (path.length === 0) return [];
  if (path.length === 1) return [{ ...path[0] }];

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distance(path[i], path[i + 1]);
    segLens.push(d);
    total += d;
  }
  if (total < 1e-6) {
    // Path dégénéré : tous les points confondus.
    return Array.from({ length: samples + 1 }, () => ({ ...path[0] }));
  }

  const out: Point[] = [];
  for (let k = 0; k <= samples; k++) {
    const target = (k / samples) * total;
    let acc = 0;
    let segIdx = segLens.length - 1;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target) {
        segIdx = i;
        break;
      }
      acc += segLens[i];
    }
    const segLen = segLens[segIdx];
    const segT = segLen > 1e-6 ? (target - acc) / segLen : 0;
    const a = path[segIdx];
    const b = path[segIdx + 1];
    out.push({ x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT });
  }
  return out;
}

/** Courbure discrète à chaque point (endpoints = 0).
 *  Formule κ ≈ 2 × |d1 × d2| / (|d1| × |d2| × |d1+d2|). */
function computeCurvatures(samples: Point[]): number[] {
  const n = samples.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const p0 = samples[i - 1];
    const p1 = samples[i];
    const p2 = samples[i + 1];
    const d1x = p1.x - p0.x;
    const d1y = p1.y - p0.y;
    const d2x = p2.x - p1.x;
    const d2y = p2.y - p1.y;
    const cross = Math.abs(d1x * d2y - d1y * d2x);
    const n1 = Math.hypot(d1x, d1y);
    const n2 = Math.hypot(d2x, d2y);
    const nSum = Math.hypot(d1x + d2x, d1y + d2y);
    const denom = n1 * n2 * nSum;
    out[i] = denom > 1e-9 ? (2 * cross) / denom : 0;
  }
  return out;
}

/** Remap identité, utilisée pour les cas dégénérés (path trivial,
 *  length 0). Renvoie t clampé à [0, 1]. */
function identityRemap(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function buildVelocityProfile(
  path: Point[],
  options: VelocityProfileOptions = {},
): VelocityProfile {
  const samples = Math.max(8, options.samples ?? OFFENSIVE_PROFILE_SAMPLES);
  const alphaBase = options.curvatureSensitivity ?? OFFENSIVE_CURVATURE_SENSITIVITY;
  const tierFactor = options.tier ? OFFENSIVE_TIER_MULTIPLIER[options.tier] : 1.0;
  const alpha = alphaBase * tierFactor;

  if (path.length < 2) {
    return { remap: identityRemap, length: 0 };
  }

  const pts = arcLengthSamples(path, samples);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += distance(pts[i], pts[i + 1]);
  if (total < 1e-6) {
    return { remap: identityRemap, length: 0 };
  }

  const curvs = computeCurvatures(pts);
  // Vitesse à chaque point : v = 1 / (1 + α κ). v ∈ (0, 1].
  const vs = curvs.map((k) => 1 / (1 + alpha * k));

  // Temps cumulé : t_phys(i) = Σ Δs / avg(v_{j-1}, v_j).
  const dsUniform = total / samples;
  const tPhys = new Array<number>(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) {
    const vAvg = (vs[i - 1] + vs[i]) * 0.5;
    tPhys[i] = tPhys[i - 1] + dsUniform / vAvg;
  }
  const tPhysMax = tPhys[tPhys.length - 1];
  if (tPhysMax < 1e-9) {
    return { remap: identityRemap, length: total };
  }

  // Normaliser → [0, 1] strictement croissant.
  const tNorm = tPhys.map((t) => t / tPhysMax);

  // Remap : recherche binaire dans tNorm, interpolation linéaire entre
  // les deux points encadrants. s/L = (lo + frac) / samples.
  const remap = (actionT: number): number => {
    const t = Math.max(0, Math.min(1, actionT));
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = tNorm.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tNorm[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = tNorm[hi] - tNorm[lo];
    const frac = span > 1e-9 ? (t - tNorm[lo]) / span : 0;
    return (lo + frac) / samples;
  };

  return { remap, length: total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run velocityProfile`
Expected: PASS (9 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/velocityProfile.ts src/lib/logic/__tests__/velocityProfile.test.ts
git commit -m "feat(velocityProfile): Phy.O — module pur courbure → remap"
```

---

### Task 3: Câblage `playbackTrajectory.ts` + caller `frameResolver.ts`

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Étendre la signature de `attackerTrajectoryAt`**

Dans `src/lib/logic/playbackTrajectory.ts`, ajouter les imports en tête :

```ts
import {
  buildVelocityProfile,
  type AttackerSpeedTier,
  type VelocityProfile,
} from './velocityProfile';
```

Juste avant `export function attackerTrajectoryAt`, ajouter le type des
options et le cache mémoïsé :

```ts
/** Phy.O — Options pour le remap par profil de vitesse. Construites par
 *  le caller à partir de `state` ; absent ou `enabled: false` → legacy. */
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  /** Renvoie le tier d'un attaquant (ou undefined = standard). */
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
}

/** Cache de profils par annotation × tier. Évite de re-construire le profil
 *  à chaque frame (le path et le tier ne changent pas). */
const profileCache = new WeakMap<Annotation, Map<string, VelocityProfile>>();

function getOrBuildProfile(
  ann: Annotation,
  path: Point[],
  tier: AttackerSpeedTier | undefined,
): VelocityProfile {
  let perAnn = profileCache.get(ann);
  if (!perAnn) {
    perAnn = new Map();
    profileCache.set(ann, perAnn);
  }
  const key = tier ?? 'standard';
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, { tier });
    perAnn.set(key, profile);
  }
  return profile;
}
```

Modifier la signature de `attackerTrajectoryAt` pour accepter le nouveau
paramètre optionnel (en position 6, après `getStepDurationSec`) :

```ts
export function attackerTrajectoryAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  localT: number,
  getStepDurationSec?: (idx: number) => number,
  velocityProfileOptions?: PlaybackVelocityProfileOptions,
): PlaybackTrajectory {
```

- [ ] **Step 2: Substituer le sampling pour cut + dribble avec waypoints**

Toujours dans `attackerTrajectoryAt`, repérer les branches `cut` et
`dribble` (~ligne 166 pour cut, ~ligne 172 pour dribble). Remplacer la
branche `cut` :

```ts
  if (ann.type === 'cut') {
    const position = hasWaypoints
      ? samplePolyline(annotationPolyline(ann), actionT)
      : lerp(ann.from, ann.to, actionT);
    return { position, movementType: 'cut', isScreening: false };
  }
```

par :

```ts
  if (ann.type === 'cut') {
    let position: Point;
    if (hasWaypoints) {
      const path = annotationPolyline(ann);
      let s = actionT;
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        s = getOrBuildProfile(ann, path, tier).remap(actionT);
      }
      position = samplePolyline(path, s);
    } else {
      position = lerp(ann.from, ann.to, actionT);
    }
    return { position, movementType: 'cut', isScreening: false };
  }
```

Et symétriquement pour `dribble` :

```ts
  if (ann.type === 'dribble') {
    let position: Point;
    if (hasWaypoints) {
      const path = annotationPolyline(ann);
      let s = actionT;
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        s = getOrBuildProfile(ann, path, tier).remap(actionT);
      }
      position = samplePolyline(path, s);
    } else {
      position = lerp(ann.from, ann.to, actionT);
    }
    return { position, movementType: 'dribble', isScreening: false };
  }
```

(Les branches `screen` et idle ne sont pas touchées.)

- [ ] **Step 3: Caller dans `frameResolver.ts`**

Dans `src/lib/logic/playback/frameResolver.ts`, repérer l'appel à
`attackerTrajectoryAt` (~ligne 396) et l'étendre :

```ts
    const traj = attackerTrajectoryAt(
      state.steps,
      idxA,
      id,
      localT,
      (idx) => getStepDurationSeconds(state, idx),
      // Phy.O — profil de vitesse offensif (opt-in).
      {
        enabled: !!state.attackerVelocityProfileEnabled,
        tierFor: (attId) => state.attackerSpeedProfiles?.[attId],
      },
    );
```

- [ ] **Step 4: Verify typecheck and existing tests**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run playbackTrajectory b4AnnotationTiming`
Expected: PASS. Les tests existants n'ont pas le flag activé, donc le
nouveau paramètre est `undefined` → fallback sur le sampling linéaire
legacy. Comportement strictement inchangé.

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 garde-fous Règle 1bis verts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/playbackTrajectory.ts src/lib/logic/playback/frameResolver.ts
git commit -m "feat(playback): Phy.O — câblage du profil de vitesse (opt-in)"
```

---

### Task 4: Toggle UI dans `ParametresPanel.tsx`

**Files:**
- Modify: `src/components/ParametresPanel.tsx`

- [ ] **Step 1: Ajouter le toggle**

Dans `src/components/ParametresPanel.tsx`, ajouter un `CheckboxLine` à côté
des autres toggles de visualisation/comportement (par exemple après ceux
qui touchent au playback ou aux profils — l'implémenteur choisit
l'emplacement le plus cohérent visuellement) :

```tsx
              <CheckboxLine
                checked={!!state.attackerVelocityProfileEnabled}
                label="profil de vitesse offensif (Phy.O — courbure)"
                onChange={(v) => onPatch({ attackerVelocityProfileEnabled: v })}
                title="Les attaquants ralentissent dans les virages serrés (V-cuts) et ré-accélèrent en sortie. Vitesse constante sur les drives droits. Modulé par tier athlétique si défini. Opt-in, A/B comparable."
              />
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ParametresPanel.tsx
git commit -m "feat(ui): Phy.O — toggle profil de vitesse offensif"
```

---

### Task 5: Validation finale + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Suite garde-fou Règle 1bis**

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 verts). Le câblage touche `frameResolver.ts` et
`playbackTrajectory.ts` qui font partie du pipeline ; vérification
systématique.

- [ ] **Step 2: Suite complète**

Run: `npx vitest run`
Expected: PASS sur l'intégralité, avec ~9 nouveaux tests (`velocityProfile`).
Le flag opt-in `attackerVelocityProfileEnabled === undefined` par défaut
→ comportement legacy strict, golden snapshots J.6 inchangés.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Update ROADMAP**

Dans `ROADMAP.md`, ajouter une nouvelle entrée dans la table de synthèse
appropriée (par ex. dans la Phase G ou une nouvelle ligne « Phy.O »).
Insérer après les chantiers G.* :

```
| ~~Phy.O V1~~ | ~~**Profil de vitesse offensif (courbure + tier)**~~ : module pur `velocityProfile.ts` qui calcule la courbure d'un path et en déduit un remap `actionT → s/L`. Les attaquants ralentissent dans les virages (V-cuts) et ré-accélèrent en sortie. Tier athlétique elite/standard/lent (mirror G.4). Opt-in via `state.attackerVelocityProfileEnabled`. V2 (friction de proximité offensive) = plan séparé. | — | — | 🟢 V1 livré 2026-05-23 |
```

Si une nouvelle section dédiée semble plus appropriée, l'implémenteur peut
créer un en-tête « Phase Phy.O — Physique offensive » avant.

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phy.O V1 (profil de vitesse offensif) livré"
```

---

## Notes de fin de plan

- **Opt-in par construction.** `attackerVelocityProfileEnabled === undefined` par défaut → le remap n'est jamais construit ni consulté. Le `velocityProfileOptions` arrive à `attackerTrajectoryAt` mais avec `enabled: false` → la branche legacy `s = actionT` court-circuite. Comportement byte-identique tant que l'utilisateur n'active pas.
- **Invariant utilisateur.** `remap(0) === 0` et `remap(1) === 1` garantissent que `ann.from` et `ann.to` sont rendus exactement aux extrémités. Le coach voit toujours l'attaquant arriver à l'endroit qu'il a dessiné.
- **Cache.** `WeakMap<Annotation, Map<tierKey, VelocityProfile>>` : si l'utilisateur modifie une annotation (drag d'un waypoint, changement de tier), un nouvel objet annotation est créé par les transforms (immuabilité), donc l'entrée cache est gc-collectée et un nouveau profil est construit au prochain accès. Pas de fuite.
- **Hors V1 (plans séparés ultérieurs).** Friction de proximité offensive (Lever B équivalent), démarquage actif, feintes/jab steps, UI per-attaquant pour le tier (picker dans le menu contextuel ou panneau dédié).
- **Pas de changement Règle 1bis.** Le module ne touche aucune logique défense/écran. La modification de `playbackTrajectory.ts` est strictement additive et opt-in. Vérification systématique malgré tout.
