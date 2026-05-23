# Phy.O V2 + UI tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la friction de proximité offensive (ralentissement à l'approche d'un autre joueur, mirror Lever B) au profil de vitesse Phy.O, et exposer le tier athlétique par-attaquant via un select dans `AttackerMenu`.

**Architecture:** V2 = nouveau facteur `friction(s)` par sample dans `v(s) = friction(s) / (1 + α κ(s))`. Obstacles = snapshot mid-segment des autres joueurs, fourni par `frameResolver`. Cache `WeakMap<Annotation, Map<string, VelocityProfile>>` indexé par `tier|obstaclesHash`. UI = select mirror du pattern `offensiveProfile` existant. Pas de nouveau flag (V2 = raffinement de V1, sous le même opt-in).

**Tech Stack:** TypeScript, React, Vitest.

**Pré-requis :** Phy.O V1 livré (module `velocityProfile.ts`, `AttackerSpeedTier`, `attackerSpeedProfiles?`, `attackerVelocityProfileEnabled?`, câblage `playbackTrajectory.ts` + `frameResolver.ts`).

---

### Task 1: Constantes + transform `setAttackerSpeedTier` (TDD)

**Files:**
- Modify: `src/lib/data/physics.ts`
- Modify: `src/lib/state/transforms/attackerTransforms.ts`
- Create: `src/lib/state/transforms/__tests__/attackerSpeedTier.test.ts`

- [ ] **Step 1: Constantes physiques**

Dans `src/lib/data/physics.ts`, ajouter à la fin du fichier :

```ts
/** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit
 *  l'attaquant. Mirror du `threshold` de `proximityFriction` (Lever B
 *  défensif) pour cohérence. */
export const OFFENSIVE_FRICTION_THRESHOLD_PX = 30;

/** Phy.O V2 — Facteur minimum de vitesse au contact. Mirror du `floor`
 *  de `proximityFriction` (Lever B défensif). */
export const OFFENSIVE_FRICTION_FLOOR = 0.6;
```

Run `npx tsc --noEmit` — clean.

- [ ] **Step 2: Write the failing test for the transform**

Créer `src/lib/state/transforms/__tests__/attackerSpeedTier.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { setAttackerSpeedTier } from '../attackerTransforms';

describe('setAttackerSpeedTier', () => {
  it('définit le tier d\'un attaquant — initialise le map si absent', () => {
    const s = makeInitialState();
    expect(s.attackerSpeedProfiles).toBeUndefined();
    const out = setAttackerSpeedTier(s, 'O1', 'elite');
    expect(out.attackerSpeedProfiles).toEqual({ O1: 'elite' });
    // état d'entrée non muté
    expect(s.attackerSpeedProfiles).toBeUndefined();
  });

  it('met à jour le tier d\'un attaquant existant sans toucher les autres', () => {
    let s = setAttackerSpeedTier(makeInitialState(), 'O1', 'elite');
    s = setAttackerSpeedTier(s, 'O2', 'lent');
    const out = setAttackerSpeedTier(s, 'O1', 'standard');
    expect(out.attackerSpeedProfiles).toEqual({ O1: 'standard', O2: 'lent' });
  });

  it("undefined → supprime la clé (= 'standard' par défaut)", () => {
    let s = setAttackerSpeedTier(makeInitialState(), 'O1', 'elite');
    s = setAttackerSpeedTier(s, 'O2', 'lent');
    const out = setAttackerSpeedTier(s, 'O1', undefined);
    expect(out.attackerSpeedProfiles).toEqual({ O2: 'lent' });
    expect(out.attackerSpeedProfiles?.O1).toBeUndefined();
  });

  it('undefined sur un attaquant absent — no-op (renvoie un map sans la clé)', () => {
    const s = makeInitialState();
    const out = setAttackerSpeedTier(s, 'O3', undefined);
    expect(out.attackerSpeedProfiles).toEqual({});
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run attackerSpeedTier`
Expected: FAIL — `setAttackerSpeedTier` n'est pas exporté de `attackerTransforms`.

- [ ] **Step 4: Write the implementation**

Dans `src/lib/state/transforms/attackerTransforms.ts`, ajouter en tête aux
imports le type `AttackerSpeedTier` :

```ts
import type {
  AppState,
  AttackerId,
  AttackerProfiles,
  AttackerSpeedTier,
  OffensiveProfile,
} from '@/lib/types';
```

Puis ajouter la fonction à la fin du fichier :

```ts
/** Phy.O — Définit ou efface le tier athlétique d'un attaquant.
 *  `undefined` supprime la clé du map (= 'standard' effectif). Inputs
 *  non mutés. */
export function setAttackerSpeedTier(
  state: AppState,
  id: AttackerId,
  tier: AttackerSpeedTier | undefined,
): AppState {
  const current = { ...(state.attackerSpeedProfiles ?? {}) };
  if (tier === undefined) {
    delete current[id];
  } else {
    current[id] = tier;
  }
  return { ...state, attackerSpeedProfiles: current };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run attackerSpeedTier`
Expected: PASS (4 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/physics.ts src/lib/state/transforms/attackerTransforms.ts src/lib/state/transforms/__tests__/attackerSpeedTier.test.ts
git commit -m "feat(types): Phy.O V2 — constantes friction + transform setAttackerSpeedTier"
```

---

### Task 2: Friction proximité dans `velocityProfile` (TDD)

**Files:**
- Modify: `src/lib/logic/velocityProfile.ts`
- Modify: `src/lib/logic/__tests__/velocityProfile.test.ts`

- [ ] **Step 1: Étendre l'interface `VelocityProfileOptions`**

Dans `src/lib/logic/velocityProfile.ts`, ajouter aux imports en tête :

```ts
import {
  OFFENSIVE_CURVATURE_SENSITIVITY,
  OFFENSIVE_FRICTION_FLOOR,
  OFFENSIVE_FRICTION_THRESHOLD_PX,
  OFFENSIVE_PROFILE_SAMPLES,
  OFFENSIVE_TIER_MULTIPLIER,
} from '../data/physics';
```

(Conserver les imports existants ; ajouter `OFFENSIVE_FRICTION_FLOOR` et
`OFFENSIVE_FRICTION_THRESHOLD_PX` à la liste.)

Étendre l'interface :

```ts
export interface VelocityProfileOptions {
  /** α de base : sensibilité à la courbure. Défaut : OFFENSIVE_CURVATURE_SENSITIVITY. */
  curvatureSensitivity?: number;
  /** Tier athlétique → multiplie α. Absent = standard (×1.0). */
  tier?: AttackerSpeedTier;
  /** Nombre de points d'échantillonnage. Défaut : OFFENSIVE_PROFILE_SAMPLES. */
  samples?: number;
  /** Phy.O V2 — Positions des autres joueurs (snapshot mid-segment).
   *  Si fourni et non vide, applique un facteur friction par sample. */
  obstacles?: Point[];
  /** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit.
   *  Défaut : `OFFENSIVE_FRICTION_THRESHOLD_PX` (30 px). */
  frictionThreshold?: number;
  /** Phy.O V2 — Facteur minimum (au contact). Défaut :
   *  `OFFENSIVE_FRICTION_FLOOR` (0.6). */
  frictionFloor?: number;
}
```

- [ ] **Step 2: Write the failing tests**

Dans `src/lib/logic/__tests__/velocityProfile.test.ts`, ajouter à la fin
du `describe` existant (avant la fermeture `});`) :

```ts
  it('Phy.O V2 — obstacle proche au milieu du path → remap(0.5) < 0.5 (ralentissement)', () => {
    // Path droit horizontal, obstacle à 5 px du milieu.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 50, y: 5 }] },
    );
    // Le joueur ralentit en passant près de l'obstacle → à mi-temps,
    // il n'a pas encore atteint le milieu du path.
    expect(p.remap(0.5)).toBeLessThan(0.5 - 0.02);
  });

  it('Phy.O V2 — obstacle hors threshold → remap identité (pas d\'effet)', () => {
    // Obstacle à 100 px du path → bien au-delà des 30 px threshold.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 50, y: 100 }] },
    );
    expect(p.remap(0.25)).toBeCloseTo(0.25, 2);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 2);
  });

  it('Phy.O V2 — deux obstacles à 1/4 et 3/4 → deux zones de ralentissement', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 25, y: 5 }, { x: 75, y: 5 }] },
    );
    // À chaque obstacle, le joueur ralentit → s/L < temps relatif.
    expect(p.remap(0.25)).toBeLessThan(0.25 - 0.01);
    expect(p.remap(0.75)).toBeLessThan(0.75 - 0.01);
  });

  it('Phy.O V2 — obstacles vides ou absents → comportement V1 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { obstacles: [] });
    // Les deux sont identité (path droit).
    expect(p1.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p2.remap(0.5)).toBeCloseTo(0.5, 3);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run velocityProfile`
Expected: 9 tests existants PASS, 4 nouveaux FAIL (la friction n'est pas
encore intégrée — `obstacles` est ignoré, donc remap est identité pour
les paths droits).

- [ ] **Step 4: Write the implementation**

Toujours dans `src/lib/logic/velocityProfile.ts`, ajouter un helper
au-dessus de `buildVelocityProfile` (à côté des autres helpers internes) :

```ts
/** Friction par sample : 1 si tous les obstacles sont à >= threshold ;
 *  sinon interpole entre `floor` (au contact) et 1 (au threshold).
 *  Mirror per-point de `proximityFriction` (Lever B défensif). */
function computeFrictions(
  samples: Point[],
  obstacles: Point[],
  threshold: number,
  floor: number,
): number[] {
  const out = new Array<number>(samples.length).fill(1);
  if (obstacles.length === 0) return out;
  for (let i = 0; i < samples.length; i++) {
    let minDist = Infinity;
    for (const o of obstacles) {
      const d = Math.hypot(o.x - samples[i].x, o.y - samples[i].y);
      if (d < minDist) minDist = d;
    }
    if (minDist >= threshold) {
      out[i] = 1;
    } else {
      const tFr = Math.max(0, minDist) / threshold;
      out[i] = floor + (1 - floor) * tFr;
    }
  }
  return out;
}
```

Puis modifier `buildVelocityProfile`. Repérer la ligne du calcul de `vs` :

```ts
  const vs = curvs.map((k) => 1 / (1 + alpha * k));
```

La remplacer par :

```ts
  // Phy.O V2 — friction de proximité : factor ∈ [floor, 1] par sample.
  const frictionThreshold = options.frictionThreshold ?? OFFENSIVE_FRICTION_THRESHOLD_PX;
  const frictionFloor = options.frictionFloor ?? OFFENSIVE_FRICTION_FLOOR;
  const frictions = computeFrictions(
    pts,
    options.obstacles ?? [],
    frictionThreshold,
    frictionFloor,
  );
  // v(s) = friction(s) / (1 + α κ(s)). Friction <= 1, donc v plus petit
  // aux points proches d'un obstacle → temps physique avance plus vite
  // → après inversion, le joueur a moins parcouru à un actionT donné.
  const vs = curvs.map((k, i) => frictions[i] / (1 + alpha * k));
```

Le reste de `buildVelocityProfile` (intégration en temps, normalisation,
remap par recherche binaire) reste **strictement inchangé**.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run velocityProfile`
Expected: PASS (13 tests : 9 existants + 4 nouveaux).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logic/velocityProfile.ts src/lib/logic/__tests__/velocityProfile.test.ts
git commit -m "feat(velocityProfile): Phy.O V2 — friction proximité par sample"
```

---

### Task 3: Câblage cache + obstacles dans `playbackTrajectory` + `frameResolver`

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Étendre `PlaybackVelocityProfileOptions` + `getOrBuildProfile`**

Dans `src/lib/logic/playbackTrajectory.ts`, étendre l'interface
`PlaybackVelocityProfileOptions` :

```ts
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
  /** Phy.O V2 — Renvoie le snapshot d'obstacles mid-segment pour
   *  l'attaquant `id` (exclu de la liste). */
  obstaclesFor?: (id: AttackerId) => Point[];
}
```

Modifier `getOrBuildProfile` pour prendre les obstacles et inclure leur
hash dans la clé de cache :

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
  // Hash des obstacles : positions arrondies à l'entier, jointes.
  // Invalide naturellement quand un joueur bouge.
  const obstaclesHash = obstacles.length === 0
    ? '0'
    : obstacles.map((o) => `${o.x | 0},${o.y | 0}`).join(';');
  const key = `${tierKey}|${obstaclesHash}`;
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, { tier, obstacles });
    perAnn.set(key, profile);
  }
  return profile;
}
```

- [ ] **Step 2: Passer les obstacles dans les branches cut/dribble**

Dans le même fichier, repérer les deux appels existants à
`getOrBuildProfile(ann, path, tier)` dans les branches `cut` et `dribble`.
Pour CHAQUE branche, remplacer :

```ts
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        s = getOrBuildProfile(ann, path, tier).remap(actionT);
      }
```

par :

```ts
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
        s = getOrBuildProfile(ann, path, tier, obstacles).remap(actionT);
      }
```

(Deux remplacements identiques, un par branche.)

- [ ] **Step 3: Construire le snapshot dans `frameResolver.ts`**

Dans `src/lib/logic/playback/frameResolver.ts`, repérer le call site
`attackerTrajectoryAt(...)` (~ligne 396) et l'objet
`velocityProfileOptions` qui y est passé (livré par Phy.O V1 :
`{ enabled: ..., tierFor: ... }`). L'étendre avec `obstaclesFor` :

```ts
      {
        enabled: !!state.attackerVelocityProfileEnabled,
        tierFor: (attId) => state.attackerSpeedProfiles?.[attId],
        obstaclesFor: (attId) => {
          const obs: Point[] = [];
          // Autres attaquants à t=0.5 (interp linéaire des positions
          // de step). Exclut soi-même.
          attackerIds.forEach((other) => {
            if (other === attId) return;
            const oA = a.off[other];
            const oB = b.off[other];
            if (!oA || !oB) return;
            obs.push({ x: (oA.x + oB.x) * 0.5, y: (oA.y + oB.y) * 0.5 });
          });
          // Tous les défenseurs à t=0.5.
          defenderIds.forEach((dId) => {
            const dA = defA[dId];
            const dB = defB[dId];
            if (!dA || !dB) return;
            obs.push({ x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 });
          });
          return obs;
        },
      },
```

(Les variables `attackerIds`, `defenderIds`, `a`, `b`, `defA`, `defB`
sont déjà en scope dans `resolveFrameAt` au moment de cet appel —
vérifier visuellement le contexte avant édition.)

- [ ] **Step 4: Verify typecheck + Règle 1bis + tests existants**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run velocityProfile playbackTrajectory b4AnnotationTiming`
Expected: PASS (tests existants + 4 nouveaux V2 = ~30+ verts).

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 garde-fous Règle 1bis verts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/playbackTrajectory.ts src/lib/logic/playback/frameResolver.ts
git commit -m "feat(playback): Phy.O V2 — câblage friction proximité (snapshot mid-segment)"
```

---

### Task 4: UI — select tier dans `AttackerMenu` + propagation

**Files:**
- Modify: `src/components/contextMenu/AttackerMenu.tsx`
- Modify: `src/components/court/CourtMenus.tsx`
- Modify: `src/components/CourtView.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/hooks/useAppState.ts`

- [ ] **Step 1: Câbler le transform dans `useAppState`**

Dans `src/hooks/useAppState.ts`, ajouter (s'il n'existe pas déjà) l'import
du type `AttackerSpeedTier` :

```ts
import type { AttackerSpeedTier /* ... autres types existants */ } from '@/lib/types';
```

Ajouter le `useCallback` à côté des autres setters d'attaquant
(typiquement après `setAttackerProfile` / `setAttackerHand` — chercher
ces fonctions dans le fichier) :

```ts
  const setAttackerSpeedTier = useCallback(
    (id: AttackerId, tier: AttackerSpeedTier | undefined) => {
      setStateWithHistory((s) => attackerTx.setAttackerSpeedTier(s, id, tier));
    },
    [setStateWithHistory],
  );
```

Exposer dans le retour du hook (l'objet retourné contient déjà
`setAttackerHand`, `setAttackerProfile`, etc. — ajouter à la liste) :

```ts
    setAttackerHand,
    setAttackerProfile,
    setAttackerSpeedTier,
```

- [ ] **Step 2: Étendre `AttackerMenuProps` + ajouter le select**

Dans `src/components/contextMenu/AttackerMenu.tsx`, ajouter aux imports
en tête le type :

```ts
import type {
  // ... existants
  AttackerSpeedTier,
} from '@/lib/types';
```

Étendre `AttackerMenuProps` (~ligne 33) avec deux champs juste après
`onSetOffensiveProfile` :

```ts
  attackerSpeedTier?: AttackerSpeedTier | undefined;
  onSetAttackerSpeedTier: (tier: AttackerSpeedTier | undefined) => void;
```

Ajouter à la destructuration de la fonction `AttackerMenu` (~ligne 65)
les deux nouveaux noms :

```ts
  attackerSpeedTier,
  onSetAttackerSpeedTier,
```

Insérer le nouveau select dans le JSX, juste **après** le bloc du
select `offensiveProfile` (le `</div>` qui ferme ce bloc se trouve
~ligne 194). Coller :

```tsx
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
          padding: '5px 6px',
          borderRadius: 4,
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Phy.O — Tier athlétique. Module la sensibilité aux virages (elite ralentit moins dans les courbes, lent ralentit plus). Effet visible quand le profil de vitesse offensif est activé dans Paramètres."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>
          tier athl.
        </span>
        <select
          value={attackerSpeedTier ?? 'auto'}
          onChange={(e) => {
            const v = e.target.value;
            onSetAttackerSpeedTier(
              v === 'auto' ? undefined : (v as AttackerSpeedTier),
            );
          }}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="auto">auto (standard)</option>
          <option value="elite">elite</option>
          <option value="standard">standard</option>
          <option value="lent">lent</option>
        </select>
      </div>
```

(Les variables `ORANGE_TINT_BG`, `ORANGE_TINT_BORDER`, `ORANGE_ACCENT`
sont déjà importées en haut du fichier — mêmes que celles utilisées par
le bloc `offensiveProfile`.)

- [ ] **Step 3: Câbler la prop dans `CourtMenus`**

Dans `src/components/court/CourtMenus.tsx`, étendre `CourtMenusProps`
(~ligne 34) avec :

```ts
  onSetAttackerSpeedTier: (oId: AttackerId, tier: import('@/lib/types').AttackerSpeedTier | undefined) => void;
```

(Ou ajouter `AttackerSpeedTier` aux imports types en tête du fichier
si plus propre, puis utiliser le type non-qualifié.)

Ajouter à la destructuration de la fonction `CourtMenus` :

```ts
  onSetAttackerSpeedTier,
```

Dans le JSX `<AttackerMenu ...>` (~ligne 122-138), ajouter à la suite
des autres props :

```tsx
            attackerSpeedTier={state.attackerSpeedProfiles?.[oId]}
            onSetAttackerSpeedTier={(t) => onSetAttackerSpeedTier(oId, t)}
```

- [ ] **Step 4: Propager dans `CourtView` puis `Page`**

Dans `src/components/CourtView.tsx`, ajouter `onSetAttackerSpeedTier` à
l'interface des props (à côté de `onSetAttackerProfile` etc.), puis le
passer à `<CourtMenus>` :

```tsx
            onSetAttackerSpeedTier={props.onSetAttackerSpeedTier}
```

Dans `src/app/page.tsx`, passer le callback exposé par `useAppState` à
`<CourtView>` (à côté de `onSetAttackerProfile`) :

```tsx
              onSetAttackerSpeedTier={app.setAttackerSpeedTier}
```

- [ ] **Step 5: Verify typecheck and full suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: PASS sur l'intégralité. Le UI tier ne modifie pas le
comportement par défaut (utilisateur doit poser un tier explicite).
Si jamais `CourtView.interactions.test.tsx` échoue à cause d'une
prop manquante dans `renderCourt`, ajouter le mock
`onSetAttackerSpeedTier: () => {}`.

- [ ] **Step 6: Commit**

```bash
git add src/components/contextMenu/AttackerMenu.tsx src/components/court/CourtMenus.tsx src/components/CourtView.tsx src/app/page.tsx src/hooks/useAppState.ts
# Plus le test si modifié :
# git add src/components/__tests__/CourtView.interactions.test.tsx
git commit -m "feat(ui): Phy.O — select tier athlétique dans AttackerMenu"
```

---

### Task 5: Validation finale + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Suite garde-fou Règle 1bis**

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 verts).

- [ ] **Step 2: Suite complète**

Run: `npx vitest run`
Expected: PASS. Compteur attendu ≈ baseline (1720 V1) + 4 V2 + 4 transform
= **~1728 verts**.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Update ROADMAP**

Dans `ROADMAP.md`, repérer la section `Phase Phy.O`. Pour la ligne V2 :

```
| Phy.O V2 | **Friction de proximité offensive** : mirror de Lever B côté attaque — encore ralentir v(s) aux points du path proches d'un autre joueur. Plan séparé. | 3-4h | 🟡 | Moyen | ⚪ |
```

La remplacer par :

```
| ~~Phy.O V2~~ | ~~**Friction de proximité offensive**~~ : per-sample factor `friction(s) ∈ [0.6, 1]` dans `v(s) = friction(s) / (1 + α κ(s))`. Obstacles = autres joueurs au mid-segment, snapshot construit par `frameResolver`. Cache `WeakMap` indexé par `tier|obstaclesHash`. | — | — | — | 🟢 V2 livré 2026-05-23 (4 tests, ~1728 verts) |
```

Et pour la ligne UI :

```
| Phy.O Vn | **UI per-attaquant pour le tier athlétique** : picker dans le menu contextuel attaquant ou panneau dédié. | 2h | 🟢 | Moyen | ⚪ |
```

La remplacer par :

```
| ~~Phy.O UI tier~~ | ~~**UI per-attaquant pour le tier athlétique**~~ : select dans `AttackerMenu` (auto/elite/standard/lent), transform `setAttackerSpeedTier`, propagation Page → CourtView → CourtMenus → AttackerMenu. | — | — | — | 🟢 livré 2026-05-23 (4 tests transform) |
```

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phy.O V2 + UI tier livrés"
```

---

## Notes de fin de plan

- **Opt-in conservé.** V2 est un raffinement de V1 sous le même flag
  `attackerVelocityProfileEnabled`. Flag off → `getOrBuildProfile` n'est
  jamais appelé → friction inerte. Comportement default byte-identique.
- **Cache invalidation.** Hash des obstacles à l'entier près. Un joueur qui
  bouge même d'1 px change le hash → cache miss → nouveau profil. Le
  trade-off : plus de profils construits, mais chaque profil reste
  correct.
- **Hors V2.** V3 (démarquage actif), V4 (feintes), restent en plans
  séparés. Le UI tier conclut la phase 'exposer V1+V2 au coach'.
