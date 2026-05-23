# Phy.O V4 — Feintes (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de poser des feintes/hesitations explicites le long d'un path (jab step, hesitation dribble) qui créent un creux de vitesse local — modélisé par un creux gaussien sur v(s).

**Architecture:** Champ `Annotation.feintes?: number[]` (positions arc-length ∈ [0,1]). Helper `computeFeinteFactors` dans `velocityProfile.ts` qui produit un facteur multiplicatif par sample, combiné avec friction et courbure : `v(s) = (feinte × friction) / (1 + α κ)`. Cache invalidé via inclusion d'un hash feintes dans la clé. Pas d'UI dans V1 (cohérent avec G.4 défensif).

**Tech Stack:** TypeScript, Vitest.

**Pré-requis :** Phy.O V1+V2 livrés (module `velocityProfile.ts` avec friction, cache `WeakMap<Annotation, Map<string, VelocityProfile>>`).

---

### Task 1: Constantes + champ `Annotation.feintes`

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/data/physics.ts`

- [ ] **Step 1: Étendre l'interface `Annotation`**

Dans `src/lib/types/index.ts`, repérer l'interface `Annotation` (~ligne 50) et
ajouter à la suite des champs optionnels existants (par exemple après `quality?`) :

```ts
  /** Phy.O V4 — Feintes / hesitations explicites le long du path.
   *  Chaque valeur ∈ [0, 1] est une position en fraction d'arc (pas en
   *  temps) où le joueur marque une pause/slowdown intentionnel(le)
   *  (jab step, hesitation dribble, fake-and-go). Plusieurs feintes
   *  possibles. N'affecte que `cut` et `dribble`. Aucun effet sans
   *  `attackerVelocityProfileEnabled` actif. */
  feintes?: number[];
```

- [ ] **Step 2: Ajouter les constantes**

Dans `src/lib/data/physics.ts`, à la fin du fichier (après les constantes
Phy.O V2) :

```ts
/** Phy.O V4 — Profondeur du creux de vitesse au centre d'une feinte.
 *  0.5 = 50 % de vitesse au pic (le joueur ralentit de moitié à ce point). */
export const OFFENSIVE_FEINTE_DEPTH = 0.5;

/** Phy.O V4 — Largeur (σ gaussienne) du creux, en fraction d'arc.
 *  0.08 = la feinte couvre ~16 % du path autour de son centre. */
export const OFFENSIVE_FEINTE_WIDTH = 0.08;
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (additions optionnelles, aucun consommateur encore).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts src/lib/data/physics.ts
git commit -m "feat(types): Phy.O V4 — Annotation.feintes + constantes gaussienne"
```

---

### Task 2: Math feintes dans `velocityProfile.ts` (TDD)

**Files:**
- Modify: `src/lib/logic/velocityProfile.ts`
- Modify: `src/lib/logic/__tests__/velocityProfile.test.ts`

- [ ] **Step 1: Write the failing tests**

Dans `src/lib/logic/__tests__/velocityProfile.test.ts`, ajouter à la fin
du `describe` existant (avant la fermeture `});`) :

```ts
  it('Phy.O V4 — feinte au milieu du path → ralentissement local', () => {
    // Une feinte au milieu d'un path droit ralentit le joueur à cet endroit.
    // À mi-temps, il n'a pas encore atteint le milieu du path.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { feintes: [0.5] },
    );
    expect(p.remap(0.5)).toBeLessThan(0.5 - 0.05);
  });

  it('Phy.O V4 — aucune feinte (option absente ou tableau vide) → V1 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { feintes: [] });
    expect(p2.remap(0.5)).toBeCloseTo(p1.remap(0.5), 6);
  });

  it('Phy.O V4 — feinte hors range (t=1.5) → pas de crash, effet négligeable', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { feintes: [1.5] },
    );
    expect(() => p.remap(0.5)).not.toThrow();
    // Le centre de la gaussienne est à t=1.5, sa queue à t=0.5 est très
    // faible (5 sigmas avec width=0.08 → exp(-12.5) ≈ 0).
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('Phy.O V4 — deux feintes au même point → max, pas somme', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const pSingle = buildVelocityProfile(path, { feintes: [0.5] });
    const pDouble = buildVelocityProfile(path, { feintes: [0.5, 0.5] });
    // Avec max(), deux feintes au même endroit ≡ une seule feinte.
    expect(pDouble.remap(0.5)).toBeCloseTo(pSingle.remap(0.5), 3);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run velocityProfile`
Expected: les 13 tests existants (V1+V2) PASS, les 4 nouveaux FAIL —
les feintes sont ignorées tant que le helper n'est pas câblé.

- [ ] **Step 3: Write the implementation**

Dans `src/lib/logic/velocityProfile.ts`, ajouter aux imports en tête les
deux nouvelles constantes :

```ts
import {
  OFFENSIVE_CURVATURE_SENSITIVITY,
  OFFENSIVE_FEINTE_DEPTH,
  OFFENSIVE_FEINTE_WIDTH,
  OFFENSIVE_FRICTION_FLOOR,
  OFFENSIVE_FRICTION_THRESHOLD_PX,
  OFFENSIVE_PROFILE_SAMPLES,
  OFFENSIVE_TIER_MULTIPLIER,
} from '../data/physics';
```

(Garde les imports déjà présents ; ajoute juste `OFFENSIVE_FEINTE_DEPTH`
et `OFFENSIVE_FEINTE_WIDTH`.)

Étendre `VelocityProfileOptions` (juste après les champs `frictionFloor` /
`frictionThreshold` ajoutés en V2) :

```ts
  /** Phy.O V4 — Positions des feintes en fraction d'arc (∈ [0, 1]).
   *  Chaque feinte applique un creux gaussien sur v(s). */
  feintes?: number[];
  /** Phy.O V4 — Profondeur du creux. Défaut : OFFENSIVE_FEINTE_DEPTH. */
  feinteDepth?: number;
  /** Phy.O V4 — Largeur σ du creux (fraction d'arc). Défaut :
   *  OFFENSIVE_FEINTE_WIDTH. */
  feinteWidth?: number;
```

Ajouter le helper (à côté de `computeFrictions`) :

```ts
/** Pour chaque sample i, multiplicateur de vitesse dû aux feintes.
 *  feinteFactor(s_norm) = 1 - (1 - depth) × max_f exp(-((s_norm - t_f) / width)² / 2)
 *  On prend le `max` des creux (pas la somme) pour éviter qu'une
 *  superposition de feintes proches descende v sous depth. */
function computeFeinteFactors(
  sampleCount: number,
  feintes: number[],
  depth: number,
  width: number,
): number[] {
  const out = new Array<number>(sampleCount).fill(1);
  if (feintes.length === 0 || width <= 0 || sampleCount < 2) return out;
  const depthFactor = 1 - depth; // ex : depth=0.5 → depthFactor=0.5
  for (let i = 0; i < sampleCount; i++) {
    const sNorm = i / (sampleCount - 1); // ∈ [0, 1]
    let maxDip = 0;
    for (const tF of feintes) {
      const u = (sNorm - tF) / width;
      const dip = depthFactor * Math.exp(-(u * u) / 2);
      if (dip > maxDip) maxDip = dip;
    }
    out[i] = 1 - maxDip;
  }
  return out;
}
```

Dans `buildVelocityProfile`, après le calcul de `frictions` et **avant** le
calcul de `vs`, insérer :

```ts
  // Phy.O V4 — feintes : creux de vitesse localisés.
  const feinteDepth = options.feinteDepth ?? OFFENSIVE_FEINTE_DEPTH;
  const feinteWidth = options.feinteWidth ?? OFFENSIVE_FEINTE_WIDTH;
  const feinteFactors = computeFeinteFactors(
    pts.length,
    options.feintes ?? [],
    feinteDepth,
    feinteWidth,
  );
```

Modifier la ligne du calcul de `vs` pour combiner feinte × friction × courbure :

```ts
  // v(s) = (feinte × friction) / (1 + α κ). Tous multiplicatifs.
  const vs = curvs.map((k, i) => (feinteFactors[i] * frictions[i]) / (1 + alpha * k));
```

(Avant V4, la ligne était `const vs = curvs.map((k, i) => frictions[i] / (1 + alpha * k));`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run velocityProfile`
Expected: PASS (17 tests : 13 existants + 4 nouveaux V4).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/velocityProfile.ts src/lib/logic/__tests__/velocityProfile.test.ts
git commit -m "feat(velocityProfile): Phy.O V4 — creux gaussien pour feintes"
```

---

### Task 3: Câblage cache `playbackTrajectory.ts` + validation + ROADMAP

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Étendre `getOrBuildProfile` avec les feintes**

Dans `src/lib/logic/playbackTrajectory.ts`, repérer `getOrBuildProfile`
(introduit en V1 et étendu en V2 pour `obstacles`). Modifier sa signature
et son corps pour inclure les feintes :

```ts
function getOrBuildProfile(
  ann: Annotation,
  path: Point[],
  tier: AttackerSpeedTier | undefined,
  obstacles: Point[],
): VelocityProfile {
  let perAnn = profileCache.get(ann);
  if (!perAnn) {
    perAnn = new Map();
    profileCache.set(ann, perAnn);
  }
  const tierKey = tier ?? 'standard';
  const obstaclesHash = obstacles.length === 0
    ? '0'
    : obstacles.map((o) => `${o.x | 0},${o.y | 0}`).join(';');
  // Phy.O V4 — feintes incluses dans la clé : positions arrondies à 0.01.
  const feintes = ann.feintes ?? [];
  const feintesHash = feintes.length === 0
    ? '0'
    : feintes.map((t) => Math.round(t * 100)).join(',');
  const key = `${tierKey}|${obstaclesHash}|${feintesHash}`;
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, { tier, obstacles, feintes });
    perAnn.set(key, profile);
  }
  return profile;
}
```

Note : les feintes viennent **directement de l'annotation**, pas via
`velocityProfileOptions` (elles sont une propriété d'annotation, pas un
runtime state). Le caller (`frameResolver`) n'a pas besoin de changement.

- [ ] **Step 2: Verify typecheck + Règle 1bis + tests existants**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run velocityProfile playbackTrajectory b4AnnotationTiming`
Expected: PASS.

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 garde-fous Règle 1bis verts).

Run: `npx vitest run`
Expected: PASS sur l'intégralité (~1732 verts : 1728 baseline V2 + 4 V4).

- [ ] **Step 3: Update ROADMAP**

Dans `ROADMAP.md`, repérer la section `Phase Phy.O`. Pour la ligne V4 :

```
| Phy.O V4 | **Feintes / jab steps / hesitation dribbles** : transitions de vitesse non-linéaires modélisées explicitement (pas seulement émergentes de la courbure). | 4-6h | 🟡 | Haut | ⚪ |
```

La remplacer par :

```
| ~~Phy.O V4 V1~~ | ~~**Feintes / jab steps / hesitation dribbles (backend)**~~ : champ `Annotation.feintes?: number[]` (positions arc-length), creux gaussien par feinte sur v(s) (`depth=0.5`, `width=0.08`), `max` (pas somme) entre feintes. Combiné multiplicativement avec friction et courbure. Pas d'UI V1 (set via JSON ou attendre V2). | — | — | — | 🟢 V1 backend livré 2026-05-23 (4 tests) |
| Phy.O V4 V2 | **UI feintes** : slider/bouton dans StepsPanel annotation list pour ajouter/retirer/positionner les feintes, marker visuel sur le path. | 3-4h | 🟢 | Moyen | ⚪ |
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/logic/playbackTrajectory.ts ROADMAP.md
git commit -m "feat(playback): Phy.O V4 — câblage feintes + roadmap (backend V1 livré)"
```

---

## Notes de fin de plan

- **Pas d'UI V1.** Cohérent avec G.4 défensif (data avant UI). Le coach pose
  les feintes via JSON import en attendant V4 V2.
- **Tous multiplicatifs.** feinte × friction × courbure : un point peut être
  ralenti par les trois mécanismes. Ordre d'agressivité : feinte (creux 50%)
  > friction (floor 60%) > courbure (continu). Mathématiquement composables.
- **Cache.** Hash feintes inclus dans la clé. Modification d'une feinte
  invalide automatiquement le cache de cette annotation.
- **Default-off.** Sans le flag `attackerVelocityProfileEnabled`, le profil
  n'est jamais construit donc les feintes sont inertes. Comportement
  rétrocompat strict garanti.
