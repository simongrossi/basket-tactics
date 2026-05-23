# Phy.O V2 + UI tier — Friction proximité offensive + picker tier per-attaquant — Design

Date : 2026-05-23
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Phy.O V1 livre un profil de vitesse offensif piloté par courbure (V-cut
ralentit à l'apex, drive garde la vitesse max). Mais :
- **Aucune réaction à la proximité d'autres joueurs.** Un attaquant qui
  passe juste à côté d'un défenseur garde sa vitesse — irréaliste (Lever B
  défensif modélise déjà ce ralentissement contact-épaule côté défense).
- **Le tier athlétique `attackerSpeedProfiles` existe en état mais
  n'a aucune UI pour le poser per-attaquant.** Le coach ne peut le
  configurer que via JSON import/export.

## Décisions de design

| Sujet | Décision |
|---|---|
| Friction modèle | Per-sample factor multiplié dans `v(s)` : `v(s) = friction(s) / (1 + α κ(s))`. Même `threshold = 30 px` et `floor = 0.6` que Lever B défensif. |
| Obstacles | Snapshot à `t = 0.5` du segment (mid-segment) : autres attaquants + tous défenseurs (interpolation linéaire des positions de step). Construit par le caller (`frameResolver`). |
| Cache | `WeakMap<Annotation, Map<string, VelocityProfile>>` avec clé composite `${tier|'std'}|${obstaclesHash}`. Hash = positions arrondies à l'entier jointes. Un changement d'obstacle invalide naturellement. |
| Activation | Pas de nouveau flag — V2 est un raffinement du profil. Activé sous `state.attackerVelocityProfileEnabled` (existant V1). |
| UI tier | Select dans `AttackerMenu`, mirror du select `offensiveProfile`. Option "auto" = clé absente du map (= `'standard'` effectif). |
| Transform | Nouveau `setAttackerSpeedTier(state, id, tier | undefined)` dans `attackerTransforms.ts`. Undefined = suppression de la clé. |

## Section 1 — Friction proximité dans le profil de vitesse

Dans `src/lib/logic/velocityProfile.ts`, étendre `VelocityProfileOptions` :

```ts
export interface VelocityProfileOptions {
  // ... existants (curvatureSensitivity, tier, samples)
  /** Phy.O V2 — Positions des autres joueurs (snapshot mid-segment).
   *  Si fourni et non vide, applique un facteur friction par sample. */
  obstacles?: Point[];
  /** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit.
   *  Défaut : `OFFENSIVE_FRICTION_THRESHOLD_PX` (30 px, mirror Lever B). */
  frictionThreshold?: number;
  /** Phy.O V2 — Facteur minimum (au contact). Défaut :
   *  `OFFENSIVE_FRICTION_FLOOR` (0.6, mirror Lever B). */
  frictionFloor?: number;
}
```

Dans `buildVelocityProfile`, après le calcul des courbures, calculer un
tableau `frictions: number[]` parallèle :

```ts
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
    if (minDist >= threshold) out[i] = 1;
    else {
      const tFr = Math.max(0, minDist) / threshold;
      out[i] = floor + (1 - floor) * tFr;
    }
  }
  return out;
}
```

Puis modifier la ligne calcul de `vs` :

```ts
// Avant : const vs = curvs.map((k) => 1 / (1 + alpha * k));
// Après :
const frictions = computeFrictions(pts, options.obstacles ?? [], threshold, floor);
const vs = curvs.map((k, i) => frictions[i] / (1 + alpha * k));
```

Le reste de l'algorithme (intégration en temps, normalisation, remap)
reste **strictement inchangé**. La friction modifie l'intégrand de v ;
ds/v devient plus grand aux points proches d'obstacles → le temps physique
y avance plus vite (l'attaquant passe plus de temps là) → après inversion,
à un `actionT` donné dans la zone proximité, le joueur a moins parcouru.

Garanties préservées :
- `remap(0) === 0`, `remap(1) === 1`.
- Monotonie (vs > 0 partout, donc t_phys strictement croissant).
- Path dégénéré, obstacles vides → comportement V1 identique.

## Section 2 — Constantes physiques

Dans `src/lib/data/physics.ts`, ajouter :

```ts
/** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit
 *  l'attaquant. Mirror du `threshold` de `proximityFriction` (Lever B
 *  défensif) pour cohérence. */
export const OFFENSIVE_FRICTION_THRESHOLD_PX = 30;

/** Phy.O V2 — Facteur minimum de vitesse au contact. Mirror du `floor`
 *  de `proximityFriction` (Lever B défensif). */
export const OFFENSIVE_FRICTION_FLOOR = 0.6;
```

## Section 3 — Câblage caller dans `playbackTrajectory.ts` + `frameResolver.ts`

Dans `src/lib/logic/playbackTrajectory.ts`, étendre `PlaybackVelocityProfileOptions` :

```ts
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
  /** Phy.O V2 — Renvoie le snapshot d'obstacles mid-segment pour
   *  l'attaquant `id` (exclu de la liste). */
  obstaclesFor?: (id: AttackerId) => Point[];
}
```

Mettre à jour `getOrBuildProfile` pour inclure les obstacles dans la clé
de cache :

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

Et dans les branches cut/dribble, passer les obstacles :

```ts
if (velocityProfileOptions?.enabled) {
  const tier = velocityProfileOptions.tierFor?.(playerId);
  const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
  s = getOrBuildProfile(ann, path, tier, obstacles).remap(actionT);
}
```

Dans `src/lib/logic/playback/frameResolver.ts`, mettre à jour la
construction des `velocityProfileOptions` au call site :

```ts
{
  enabled: !!state.attackerVelocityProfileEnabled,
  tierFor: (attId) => state.attackerSpeedProfiles?.[attId],
  obstaclesFor: (attId) => {
    const obs: Point[] = [];
    // Autres attaquants à t=0.5.
    attackerIds.forEach((other) => {
      if (other === attId) return;
      const oA = a.off[other]; const oB = b.off[other];
      if (!oA || !oB) return;
      obs.push({ x: (oA.x + oB.x) * 0.5, y: (oA.y + oB.y) * 0.5 });
    });
    // Tous les défenseurs à t=0.5.
    defenderIds.forEach((dId) => {
      const dA = defA[dId]; const dB = defB[dId];
      if (!dA || !dB) return;
      obs.push({ x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 });
    });
    return obs;
  },
}
```

## Section 4 — UI per-attaquant : select tier dans `AttackerMenu`

Dans `src/components/contextMenu/AttackerMenu.tsx`, mirror du pattern
`offensiveProfile` (~ligne 180) :

```tsx
<div
  style={{ /* style mirror */ }}
  title="Tier athlétique. Module la sensibilité aux virages (elite ralentit moins dans les courbes, lent ralentit plus). Visible quand le profil de vitesse offensif est activé dans Paramètres."
>
  <span style={{ /* span mirror */ }}>tier athl.</span>
  <select
    value={attackerSpeedTier ?? 'auto'}
    onChange={(e) => {
      const v = e.target.value;
      onSetAttackerSpeedTier(v === 'auto' ? undefined : (v as AttackerSpeedTier));
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

Ajout dans `AttackerMenuProps` :

```ts
attackerSpeedTier?: AttackerSpeedTier | undefined;
onSetAttackerSpeedTier: (tier: AttackerSpeedTier | undefined) => void;
```

## Section 5 — Transform `setAttackerSpeedTier`

Dans `src/lib/state/transforms/attackerTransforms.ts` (ou créer si
nécessaire), ajouter :

```ts
/** Phy.O — Définit ou efface le tier athlétique d'un attaquant.
 *  `undefined` supprime la clé du map (= 'standard' effectif). */
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

Câblage `useAppState` (`src/hooks/useAppState.ts`) :

```ts
const setAttackerSpeedTier = useCallback(
  (id: AttackerId, tier: AttackerSpeedTier | undefined) => {
    setStateWithHistory((s) => attackerTx.setAttackerSpeedTier(s, id, tier));
  },
  [setStateWithHistory],
);
```

Et exposer dans le retour du hook, puis propager via `Page` → `CourtView`
→ `CourtMenus`/`AttackerMenu`.

## Section 6 — Tests

**Tests unitaires `velocityProfile.test.ts`** (3 nouveaux) :

1. `path droit + obstacle au milieu (à 5 px du path) → remap(0.5) ≠ 0.5` :
   le joueur ralentit en passant près de l'obstacle, donc à mi-temps il
   est avant le mid-path.
2. `path droit + obstacle hors threshold (à 100 px) → remap identité` :
   trop loin, aucun effet.
3. `deux obstacles à 1/4 et 3/4 du path → deux zones de ralentissement` :
   `remap(0.25) < 0.25` ET `remap(0.75) < 0.75` (ralentissement vers
   chaque obstacle).

**Tests transform** (2 nouveaux) :

1. `setAttackerSpeedTier('O1', 'elite')` → map contient O1: elite.
2. `setAttackerSpeedTier('O1', undefined)` après set → clé O1 supprimée.

Les composants React (`AttackerMenu`) ne sont pas testés unitairement
(convention projet).

## Hors V2 (toujours en plans séparés)

- **V3** — démarquage actif (offense réagit à la défense).
- **V4** — feintes / jab steps / hesitation dribbles explicites.

## Fichiers touchés

- **Modifier** :
  - `src/lib/logic/velocityProfile.ts` (options + friction).
  - `src/lib/logic/__tests__/velocityProfile.test.ts` (3 tests).
  - `src/lib/logic/playbackTrajectory.ts` (cache key + obstacles).
  - `src/lib/logic/playback/frameResolver.ts` (snapshot obstacles).
  - `src/lib/data/physics.ts` (2 constantes).
  - `src/lib/state/transforms/attackerTransforms.ts` (transform + tests).
  - `src/hooks/useAppState.ts` (câblage).
  - `src/app/page.tsx` (propagation prop).
  - `src/components/CourtView.tsx` (propagation prop vers menu).
  - `src/components/contextMenu/AttackerMenu.tsx` (select tier).
