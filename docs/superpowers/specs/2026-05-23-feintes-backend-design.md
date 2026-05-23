# Phy.O V4 — Feintes / hesitations (backend) — Design

Date : 2026-05-23
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Phy.O V1+V2 modèlent les ralentissements **émergents** de la géométrie
(courbure du path) et du contexte (proximité d'autres joueurs). Mais une
**feinte** basketball est explicitement temporelle/délibérée : le joueur
*choisit* de ralentir brièvement à un endroit précis du path pour
déstabiliser le défenseur (jab step, hesitation dribble, fake-and-go).
Aucun mécanisme actuel ne permet de l'exprimer.

## Décisions de design

| Sujet | Décision |
|---|---|
| Data model | `Annotation.feintes?: number[]` — chaque valeur ∈ [0, 1] est une position en **fraction d'arc** (pas en temps) où la feinte s'applique. Plusieurs feintes possibles par annotation. |
| Math | Creux gaussien sur le facteur de vitesse : `feinteFactor(s) = 1 - (1 - depth) × Σ_f exp(-((s/L - t_f) / width)² / 2)`. Combiné multiplicativement avec curvature et friction : `v(s) = (feinteFactor(s) × friction(s)) / (1 + α κ(s))`. |
| Constantes | `OFFENSIVE_FEINTE_DEPTH = 0.5` (50 % vitesse au creux). `OFFENSIVE_FEINTE_WIDTH = 0.08` (8 % d'arc de largeur σ). |
| Activation | Sous le même flag `state.attackerVelocityProfileEnabled` que V1/V2. Pas de nouveau flag. |
| UI | **Hors V1** — pas de UI dans cette livraison. Cohérent avec G.4 défensif (data avant UI). Le coach pose les feintes via JSON import ou attend V4 V2 pour UI. |
| Annotation types concernés | `cut` et `dribble` uniquement (pas `screen` ni idle). |

## Section 1 — Data model

Dans `src/lib/types/index.ts`, étendre l'interface `Annotation` (existante,
~ligne 50) avec un nouveau champ optionnel :

```ts
  /** Phy.O V4 — Feintes / hesitations explicites le long du path.
   *  Chaque valeur ∈ [0, 1] est une position en fraction d'arc (pas en
   *  temps) où le joueur marque une pause/slowdown intentionnel(le)
   *  (jab step, hesitation dribble, fake-and-go). Plusieurs feintes
   *  possibles. N'affecte que `cut` et `dribble`. Aucun effet sans
   *  `attackerVelocityProfileEnabled` actif. */
  feintes?: number[];
```

Aucun migration nécessaire (champ optionnel, rétrocompat stricte).

## Section 2 — Constantes physiques

Dans `src/lib/data/physics.ts`, ajouter :

```ts
/** Phy.O V4 — Profondeur du creux de vitesse au centre d'une feinte.
 *  0.5 = 50 % de vitesse au pic (le joueur ralentit de moitié à ce point). */
export const OFFENSIVE_FEINTE_DEPTH = 0.5;

/** Phy.O V4 — Largeur (σ gaussienne) du creux, en fraction d'arc.
 *  0.08 = la feinte couvre ~16 % du path autour de son centre. */
export const OFFENSIVE_FEINTE_WIDTH = 0.08;
```

## Section 3 — Math dans `velocityProfile.ts`

Étendre `VelocityProfileOptions` :

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

Nouveau helper :

```ts
/** Pour chaque sample i, multiplicateur de vitesse dû aux feintes.
 *  feinteFactor(s_norm) = 1 - (1 - depth) × max_f exp(-((s_norm - t_f) / width)² / 2)
 *  Note : on prend le `max` des creux (pas la somme) pour éviter qu'une
 *  superposition de feintes proches descende v sous depth. La feinte
 *  dominante au point est celle dont le creux est le plus profond. */
function computeFeinteFactors(
  sampleCount: number,
  feintes: number[],
  depth: number,
  width: number,
): number[] {
  const out = new Array<number>(sampleCount).fill(1);
  if (feintes.length === 0 || width <= 0) return out;
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

Dans `buildVelocityProfile`, après les `frictions` et avant le calcul de
`vs`, ajouter :

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

Modifier le calcul de `vs` :

```ts
  // v(s) = (feinte × friction) / (1 + α κ). Tous multiplicatifs.
  const vs = curvs.map((k, i) => (feinteFactors[i] * frictions[i]) / (1 + alpha * k));
```

Le reste (intégration, normalisation, remap) reste **strictement inchangé**.

## Section 4 — Câblage dans `playbackTrajectory.ts`

`getOrBuildProfile` doit inclure les feintes dans la clé de cache ET les
passer à `buildVelocityProfile`. La signature évolue :

```ts
function getOrBuildProfile(
  ann: Annotation,
  path: Point[],
  tier: AttackerSpeedTier | undefined,
  obstacles: Point[],
): VelocityProfile {
  // ... (existant)
  // Hash des feintes : positions arrondies à 0.01 près.
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

Les feintes viennent directement de l'annotation (`ann.feintes`) — pas
besoin de les router via `velocityProfileOptions`. Elles sont une propriété
de l'annotation, pas une donnée d'état au runtime.

## Section 5 — Tests

Tests unitaires dans `velocityProfile.test.ts` (4 nouveaux) :

1. **Une feinte au milieu du path → ralentissement local** :
   ```ts
   const p = buildVelocityProfile(
     [{ x: 0, y: 0 }, { x: 100, y: 0 }],
     { feintes: [0.5] },
   );
   // À mi-temps, le joueur n'a pas encore atteint le milieu du path (la
   // feinte au milieu prend du temps).
   expect(p.remap(0.5)).toBeLessThan(0.5 - 0.05);
   ```

2. **Aucune feinte → comportement V1 inchangé** :
   ```ts
   const p1 = buildVelocityProfile(path);
   const p2 = buildVelocityProfile(path, { feintes: [] });
   expect(p2.remap(0.5)).toBeCloseTo(p1.remap(0.5), 6);
   ```

3. **Feinte hors range (négative ou > 1) — pas de crash, effet localisé hors path** :
   ```ts
   // Feinte à t=1.5 : son creux est centré hors du path, n'a presque pas
   // d'effet (la queue gaussienne ne couvre pas le path utile).
   const p = buildVelocityProfile(
     [{ x: 0, y: 0 }, { x: 100, y: 0 }],
     { feintes: [1.5] },
   );
   expect(() => p.remap(0.5)).not.toThrow();
   expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
   ```

4. **Deux feintes proches (max, pas somme) → v ne descend pas sous depth** :
   ```ts
   const p = buildVelocityProfile(
     [{ x: 0, y: 0 }, { x: 100, y: 0 }],
     { feintes: [0.5, 0.5] }, // double feinte au même point
   );
   // Avec max(), le creux maximal reste depthFactor (0.5).
   // En remap, la déviation au milieu doit rester du même ordre que pour
   // une seule feinte (pas doubler).
   const pSingle = buildVelocityProfile(
     [{ x: 0, y: 0 }, { x: 100, y: 0 }],
     { feintes: [0.5] },
   );
   // À ±epsilon près identique (deux feintes au même endroit ≡ une).
   expect(p.remap(0.5)).toBeCloseTo(pSingle.remap(0.5), 3);
   ```

## Hors V4 V1

- **UI pour poser les feintes** (V4 V2) — slider/bouton dans StepsPanel
  annotation list, picker visuel sur le path. Le coach peut poser des
  feintes via JSON import en attendant.
- **Visualisation des feintes** sur le path (marker SVG) — V4 V2.
- **Tuning automatique de `depth`/`width` selon le profil offensif** — V5
  éventuel.

## Fichiers touchés

- **Modifier** :
  - `src/lib/types/index.ts` — ajout `Annotation.feintes?`.
  - `src/lib/data/physics.ts` — 2 constantes.
  - `src/lib/logic/velocityProfile.ts` — helper + intégration.
  - `src/lib/logic/__tests__/velocityProfile.test.ts` — 4 tests.
  - `src/lib/logic/playbackTrajectory.ts` — clé cache + paramètre.
