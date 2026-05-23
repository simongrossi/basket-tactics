# Phy.O V3 V1 — Démarquage actif (approche A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modèle simple de "lecture défensive" — l'attaquant ralentit autour des points de son path où son défenseur matché est proche. Pattern identique à Phy.O V2 friction mais filtré au seul matched defender.

**Architecture:** Réutilise complètement le pipeline Phy.O V1+V2. Ajoute un facteur multiplicatif `defenseReading(s)` dans `v(s) = (feinte × friction × defenseReading) / (1 + α κ)`. Le facteur est calculé par sample comme `proximityFriction` mais avec un seul "obstacle" : le matched defender. Caller (`frameResolver`) résout la position matched-defender à mid-segment et passe à `buildVelocityProfile`.

**Tech Stack:** TypeScript, Vitest.

**Pré-requis :** Phy.O V1+V2+V4 livrés. RFC `docs/superpowers/specs/2026-05-23-active-getting-open-RFC.md`.

---

### Task 1: Constants + flag + tests

**Files:**
- Modify: `src/lib/data/physics.ts`
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/logic/velocityProfile.ts`
- Modify: `src/lib/logic/__tests__/velocityProfile.test.ts`

- [ ] **Step 1: Constants**

Dans `src/lib/data/physics.ts`, ajouter à la fin :

```ts
/** Phy.O V3 — Distance en deçà de laquelle le matched defender impose
 *  une lecture défensive (ralentissement intentionnel pour le laisser
 *  réagir). Plus généreux que la friction de contact (V2) car la lecture
 *  arrive avant le contact réel. */
export const OFFENSIVE_DEFENSE_READING_THRESHOLD_PX = 50;

/** Phy.O V3 — Facteur minimum au plus proche de la lecture. Moins
 *  agressif que la friction de contact : la lecture est délibérée, pas
 *  un freinage forcé. */
export const OFFENSIVE_DEFENSE_READING_FLOOR = 0.7;
```

- [ ] **Step 2: Flag dans AppState**

Dans `src/lib/types/index.ts`, près de `attackerVelocityProfileEnabled?` :

```ts
  /** Phy.O V3 — Active la lecture défensive : l'attaquant ralentit
   *  autour des points de son path où son défenseur matché est proche
   *  (≤ 50 px). Sous le même profil de vitesse que V1/V2/V4 — n'a
   *  d'effet que si `attackerVelocityProfileEnabled` est aussi on. */
  attackerActiveDemarquage?: boolean;
```

- [ ] **Step 3: Étendre `VelocityProfileOptions` + helper + tests TDD**

Dans `src/lib/logic/__tests__/velocityProfile.test.ts`, ajouter à la fin
du `describe` existant :

```ts
  it('Phy.O V3 V1 — matched defender proche au milieu → ralentissement local', () => {
    // Path droit, matched defender à 20 px du milieu → lecture défensive.
    // Probe asymétrique (remap(0.25) > 0.25 + 0.02) pour éviter le point
    // fixe de symétrie remap(0.5)=0.5.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { matchedDefenderPos: { x: 50, y: 20 } },
    );
    expect(p.remap(0.25)).toBeGreaterThan(0.25 + 0.02);
  });

  it('Phy.O V3 V1 — matched defender hors threshold (>50 px) → identité', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { matchedDefenderPos: { x: 50, y: 100 } },
    );
    expect(p.remap(0.25)).toBeCloseTo(0.25, 2);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 2);
  });

  it('Phy.O V3 V1 — matchedDefenderPos absent → V2 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { matchedDefenderPos: undefined });
    expect(p2.remap(0.5)).toBeCloseTo(p1.remap(0.5), 6);
  });
```

Run: `npx vitest run velocityProfile` — attendu : 17 existants PASS, 3 nouveaux FAIL.

- [ ] **Step 4: Implementation**

Dans `src/lib/logic/velocityProfile.ts`, ajouter aux imports :

```ts
import {
  // ... existants
  OFFENSIVE_DEFENSE_READING_FLOOR,
  OFFENSIVE_DEFENSE_READING_THRESHOLD_PX,
} from '../data/physics';
```

Étendre `VelocityProfileOptions` :

```ts
  /** Phy.O V3 V1 — Position du matched defender (snapshot mid-segment).
   *  Si fourni, l'attaquant ralentit autour des points proches de cette
   *  position (lecture défensive). */
  matchedDefenderPos?: Point;
  /** Phy.O V3 V1 — Distance threshold. Défaut : OFFENSIVE_DEFENSE_READING_THRESHOLD_PX. */
  defenseReadingThreshold?: number;
  /** Phy.O V3 V1 — Facteur minimum au contact. Défaut : OFFENSIVE_DEFENSE_READING_FLOOR. */
  defenseReadingFloor?: number;
```

Ajouter le helper (à côté de `computeFrictions`) :

```ts
/** Phy.O V3 V1 — Facteur de lecture défensive par sample. Mirror de
 *  `computeFrictions` mais avec un seul obstacle (le matched defender)
 *  et des défauts plus généreux (threshold plus large, floor plus haut). */
function computeDefenseReadings(
  samples: Point[],
  matchedDefenderPos: Point | undefined,
  threshold: number,
  floor: number,
): number[] {
  const out = new Array<number>(samples.length).fill(1);
  if (!matchedDefenderPos) return out;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.hypot(
      matchedDefenderPos.x - samples[i].x,
      matchedDefenderPos.y - samples[i].y,
    );
    if (d >= threshold) {
      out[i] = 1;
    } else {
      const tR = Math.max(0, d) / threshold;
      out[i] = floor + (1 - floor) * tR;
    }
  }
  return out;
}
```

Dans `buildVelocityProfile`, après le calcul de `feinteFactors`, avant
le calcul de `vs`, ajouter :

```ts
  // Phy.O V3 V1 — lecture défensive (matched defender uniquement).
  const drThreshold = options.defenseReadingThreshold ?? OFFENSIVE_DEFENSE_READING_THRESHOLD_PX;
  const drFloor = options.defenseReadingFloor ?? OFFENSIVE_DEFENSE_READING_FLOOR;
  const defenseReadings = computeDefenseReadings(
    pts,
    options.matchedDefenderPos,
    drThreshold,
    drFloor,
  );
```

Et modifier `vs` :

```ts
  // v(s) = (feinte × friction × defenseReading) / (1 + α κ).
  const vs = curvs.map(
    (k, i) => (feinteFactors[i] * frictions[i] * defenseReadings[i]) / (1 + alpha * k),
  );
```

Run: `npx vitest run velocityProfile` — attendu : 20 verts (17 + 3).
Run: `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/physics.ts src/lib/types/index.ts src/lib/logic/velocityProfile.ts src/lib/logic/__tests__/velocityProfile.test.ts
git commit -m "feat(velocityProfile): Phy.O V3 V1 — lecture défensive (matched defender)"
```

---

### Task 2: Câblage `playbackTrajectory` + `frameResolver`

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Étendre `PlaybackVelocityProfileOptions` + `getOrBuildProfile`**

Dans `src/lib/logic/playbackTrajectory.ts`, étendre l'interface :

```ts
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
  obstaclesFor?: (id: AttackerId) => Point[];
  /** Phy.O V3 V1 — Position mid-segment du matched defender. Sans
   *  callback ou retour undefined, la lecture défensive est inactive. */
  matchedDefenderFor?: (id: AttackerId) => Point | undefined;
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
  const feintes = ann.feintes ?? [];
  const feintesHash = feintes.length === 0
    ? '0'
    : feintes.map((t) => Math.round(t * 100)).join(',');
  // Phy.O V3 V1 — matchedDefenderPos arrondi à l'entier inclus dans la clé.
  const mdpHash = matchedDefenderPos
    ? `${matchedDefenderPos.x | 0},${matchedDefenderPos.y | 0}`
    : '0';
  const key = `${tierKey}|${obstaclesHash}|${feintesHash}|${mdpHash}`;
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, {
      tier,
      obstacles,
      feintes,
      matchedDefenderPos,
    });
    perAnn.set(key, profile);
  }
  return profile;
}
```

Modifier les deux call sites (branches cut et dribble) pour passer la
position matched defender :

```ts
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
        const matchedDefenderPos = velocityProfileOptions.matchedDefenderFor?.(playerId);
        s = getOrBuildProfile(ann, path, tier, obstacles, matchedDefenderPos).remap(actionT);
      }
```

(Les deux branches, cut et dribble, recevant le même bloc.)

- [ ] **Step 2: Câblage `frameResolver.ts`**

Dans `src/lib/logic/playback/frameResolver.ts`, repérer l'appel à
`attackerTrajectoryAt` et l'objet `velocityProfileOptions`. Ajouter
`matchedDefenderFor`, gated par `state.attackerActiveDemarquage` :

```ts
      {
        enabled: !!state.attackerVelocityProfileEnabled,
        tierFor: (attId) => state.attackerSpeedProfiles?.[attId],
        obstaclesFor: (attId) => {
          // ... bloc existant V2 inchangé
        },
        // Phy.O V3 V1 — matched defender mid-segment, seulement si le
        // flag dédié est activé (A/B séparé du flag profil de vitesse).
        matchedDefenderFor: state.attackerActiveDemarquage
          ? (attId) => {
              const matchups = getMatchupsAt(state.steps, idxA, state.playerCount);
              const dId = (Object.keys(matchups) as DefenderId[]).find(
                (d) => matchups[d] === attId,
              );
              if (!dId) return undefined;
              const dA = defA[dId];
              const dB = defB[dId];
              if (!dA || !dB) return undefined;
              return { x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 };
            }
          : undefined,
      },
```

Ajouter l'import en tête si manquant :

```ts
import { getMatchupsAt } from '../engine';
import type { DefenderId } from '../../types';
```

(Vérifier : `getMatchupsAt` peut déjà être importé. Idem `DefenderId`.)

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run velocityProfile playbackTrajectory b4AnnotationTiming` — verts.
Run: `npx vitest run screens overlap userJson screenLab` — 164 verts.
Run: `npx vitest run` — full suite ~1740 verts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/logic/playbackTrajectory.ts src/lib/logic/playback/frameResolver.ts
git commit -m "feat(playback): Phy.O V3 V1 — câblage lecture défensive (matched defender)"
```

---

### Task 3: Toggle UI + ROADMAP

**Files:**
- Modify: `src/components/ParametresPanel.tsx`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Toggle**

Dans `src/components/ParametresPanel.tsx`, à côté du toggle
`attackerVelocityProfileEnabled` (section Physique offensive), ajouter :

```tsx
              <CheckboxLine
                checked={!!state.attackerActiveDemarquage}
                label="démarquage actif (Phy.O V3 — lecture défense)"
                onChange={(v) => onPatch({ attackerActiveDemarquage: v })}
                title="L'attaquant ralentit autour des points de son path où son défenseur matché est proche (≤ 50 px), simulant la lecture intentionnelle. Nécessite que le profil de vitesse offensif soit activé."
              />
```

Run: `npx tsc --noEmit` — clean.

- [ ] **Step 2: Update ROADMAP**

Dans `ROADMAP.md`, section `Phase Phy.O`. Remplacer la ligne V3 :

```
| Phy.O V3 | **Démarquage actif** : l'attaquant *réagit* à la position du défenseur (mirror de l'anticipation défensive G.3). Demande un modèle de décision offensif. | 1-2j | 🔴 | Haut | ⚪ |
```

par :

```
| ~~Phy.O V3 V1~~ | ~~**Démarquage actif — lecture du matched defender**~~ (approche A du RFC) : facteur `defenseReading(s) ∈ [0.7, 1]` multiplicatif dans v(s), pour les samples du path proches (≤ 50 px) du matched defender mid-segment. Flag dédié `attackerActiveDemarquage` (opt-in, A/B-able vs profil de vitesse). | — | — | — | 🟢 V1 livré 2026-05-23 (3 tests) |
| Phy.O V3 V2+ | **Extensions** : choix-de-côté de cut (B des règles déclaratives), sortie tangentielle adaptée au screenRule, lecture proactive feintes. Plans séparés. | 1-2j chacun | 🟡 | Haut | ⚪ |
```

- [ ] **Step 3: Commit + push**

```bash
git add src/components/ParametresPanel.tsx ROADMAP.md
git commit -m "feat(ui): Phy.O V3 V1 — toggle démarquage actif + roadmap"
git push
```

---

## Notes

- **Default-off byte-identique.** `attackerActiveDemarquage` undefined →
  `matchedDefenderFor` undefined → `matchedDefenderPos` undefined →
  `computeDefenseReadings` retourne all-1 → `v(s)` identique à V2/V4.
- **Combinable avec V2 friction.** Les deux facteurs sont multiplicatifs.
  Pas de redondance dommageable : V2 vise tous les obstacles avec floor
  agressif (0.6) ; V3 vise le matched defender avec floor plus permissif
  (0.7). En pratique le matched defender contribue aux deux mais l'effet
  cumulé reste borné par les floors.
- **Pas d'UI per-attaquant.** V3 V1 est global (le flag s'applique à tous
  les attaquants éligibles). Différenciation per-joueur = V3 V2+ futur.
