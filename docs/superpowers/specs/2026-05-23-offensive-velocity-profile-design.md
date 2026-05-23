# Phy.O V1 — Profil de vitesse offensif (courbure + tier athlétique) — Design

Date : 2026-05-23
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Le moteur physique est asymétrique. Côté défense : inertie (D.2), modèle
d'accélération (G.3), max-speed par profil (G.4), friction de proximité
(Lever B), closeout footwork (C.1), pathfinding (D.4 V1+V2), CVT vectoriel.
Côté attaque : **aucune physique**. Les attaquants suivent leurs waypoints
en Catmull-Rom à **vitesse perçue constante** (reparam longueur d'arc dans
`samplePolyline`). Un V-cut sharp = angle dur dans la polyline, *pas* de
freinage à l'apex ni de relance après. Un drive central traverse à la même
vitesse qu'un cut tranquille. Tous les attaquants au même speed.

Conséquence : c'est la cause #1 de l'irréalisme perçu sur les mouvements
offensifs.

## Décisions de design

| Sujet | Décision |
|---|---|
| Modèle | Profil de vitesse **piloté par courbure** : v(s) = v_max / (1 + α κ(s)). Pré-calculé une fois par annotation. |
| Invariant utilisateur | `ann.from` et `ann.to` sont **toujours respectés** aux extrémités. Seule la *vitesse le long du path* varie. |
| Différenciation par joueur | `attackerSpeedProfiles?: Partial<Record<AttackerId, 'elite'\|'standard'\|'lent'>>` qui module α (elite garde plus de vitesse en virage). |
| Activation | Opt-in via `attackerVelocityProfileEnabled` (default false → comportement legacy strict). |
| Périmètre V1 | Courbure + tier athlétique. Friction de proximité, démarquage actif, feintes = plans séparés (V2+). |

## Section 1 — Modèle mathématique

Pour chaque annotation `cut`/`dribble` avec path P (polyline lissée
Catmull-Rom via `samplePolyline`), au lieu d'échantillonner à
`actionT_linéaire`, on construit une **fonction de remap**
`actionT_linéaire ∈ [0,1] → s/L ∈ [0,1]` (fraction de longueur d'arc à
laquelle sampler le path).

**Construction du profil** :

1. **Échantillonner la courbure** κ(s) le long du path en N=64 points
   uniformément répartis en longueur d'arc. La courbure discrète à un
   point P_i est calculée depuis P_{i-1}, P_i, P_{i+1} via la formule
   `κ ≈ 2 × |cross(d1, d2)| / (|d1| × |d2| × |d1 + d2|)` où d1 = P_i - P_{i-1}
   et d2 = P_{i+1} - P_i. Endpoints : κ(0) = κ(1) = 0.

2. **Vitesse cible** : `v(s_i) = v_max / (1 + α × κ(s_i))`. v_max est une
   constante normalisée (1.0) puisque seule la *forme* compte (l'invariant
   « arrive à `ann.to` au boundary » est garanti par la normalisation finale).

3. **Modulation par tier athlétique** : `α_effectif = α_base × tier_factor`.
   - `elite` → ×0.7 (garde plus de vitesse en virage)
   - `standard` → ×1.0
   - `lent` → ×1.4

4. **Intégrer** : `t_phys(s_i) = Σ_{j=0..i} Δs / v(s_j)`. Donne le temps
   physique cumulé pour parcourir chaque point.

5. **Normaliser** : `t_phys_norm(s_i) = t_phys(s_i) / t_phys(L)` →
   `t_phys_norm ∈ [0, 1]` strictement croissant, t_phys_norm(0)=0,
   t_phys_norm(L)=1.

6. **Inverser** (table de lookup) : pour un `actionT ∈ [0,1]` demandé,
   trouver `s/L` tel que `t_phys_norm(s) = actionT` via recherche binaire
   dans la table des N points + interpolation linéaire entre les deux
   plus proches.

**Effet visuel.** Un V-cut a une courbure forte à l'apex : v(apex) est
faible, donc le temps physique passe lentement autour de l'apex. Après
inversion, à un `actionT` proche de 0.5, le joueur est plus *proche* de
l'apex (peu d'arc parcouru autour du virage) ; il « ralentit » visuellement
à l'apex puis ré-accélère en sortie. Un drive droit a κ = 0 partout → v
constant → remap identité (comportement legacy preservé sur paths droits).

## Section 2 — Module pur `velocityProfile.ts`

Nouveau fichier `src/lib/logic/velocityProfile.ts`. Aucune dépendance React,
déterministe, sans mutation d'entrée.

```ts
export type AttackerSpeedTier = 'elite' | 'standard' | 'lent';

export interface VelocityProfileOptions {
  /** α de base : sensibilité à la courbure. Défaut depuis physics.ts. */
  curvatureSensitivity?: number;
  /** Tier athlétique → multiplicateur sur α (elite ×0.7, lent ×1.4). */
  tier?: AttackerSpeedTier;
  /** Nombre de points d'échantillonnage. Défaut 64. */
  samples?: number;
}

export interface VelocityProfile {
  /** Remap actionT_linéaire [0,1] → fraction d'arc s/L [0,1]. */
  remap: (actionT: number) => number;
  /** Longueur totale du path (somme des segments). Utile pour diag. */
  length: number;
}

export function buildVelocityProfile(
  path: Point[],
  options?: VelocityProfileOptions,
): VelocityProfile
```

**Caching.** Une `WeakMap<Annotation, VelocityProfile>` (par tier) mémoïse
le profil par annotation et par tier — construit une fois, réutilisé sur
toutes les frames. Tier non passé = legacy alpha de base, mémo séparé.

**Garanties.**
- `remap(0) === 0`, `remap(1) === 1` (invariant utilisateur).
- Monotone croissant (pas de retour arrière).
- Path dégénéré (length 0, 2 points identiques) → remap identité.
- Path droit (κ = 0 partout) → remap identité (à epsilon près sur le
  flottant).
- Path à 2 points → remap identité (pas de courbure interne).

## Section 3 — Câblage dans `playbackTrajectory.ts`

Dans `attackerTrajectoryAt`, pour les branches `cut` et `dribble`
**seulement avec des waypoints** (chemins courbes), remplacer :

```ts
const position = samplePolyline(annotationPolyline(ann), actionT);
```

par :

```ts
const path = annotationPolyline(ann);
let s = actionT;
if (state.attackerVelocityProfileEnabled) {
  const tier = state.attackerSpeedProfiles?.[playerId];
  const profile = getOrBuildVelocityProfile(ann, path, { tier });
  s = profile.remap(actionT);
}
const position = samplePolyline(path, s);
```

`getOrBuildVelocityProfile` est un wrapper qui interroge le WeakMap cache
(clé = annotation, sous-clé = tier) et appelle `buildVelocityProfile` au
besoin.

**Exclus** :
- `screen` (déjà 35% time + plant, sémantique non-uniforme).
- `idle` (lerp linéaire entre 2 positions de step, pas de path courbe).
- Paths droits (pas de waypoints) — la branche `lerp(ann.from, ann.to, actionT)` reste inchangée. Sur un path droit κ = 0 et le remap serait identité de toutes façons.

**Signature de `attackerTrajectoryAt`** : ajouter un dernier paramètre
optionnel `velocityProfileOptions?: { enabled: boolean; tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined }`.
On ne couple PAS la fonction au `AppState` complet — on lui passe juste ce
qu'il faut. Les callers (probablement `frameResolver.ts` et/ou
`useCourtFrame.ts`) construisent l'objet une fois à partir de `state` et
le passent à chaque appel. Absent ou `enabled: false` → comportement
legacy strict (rétrocompat garantie).

## Section 4 — Types + UI

**Dans `src/lib/types/index.ts`** :

```ts
/** Phy.O — Profil athlétique d'un attaquant. Symétrique de
 *  `defenderSpeedProfiles` (G.4). Module l'agressivité du freinage dans
 *  les virages : elite garde plus de vitesse, lent ralentit plus. */
export type AttackerSpeedTier = 'elite' | 'standard' | 'lent';

// Dans AppState, près de defenderSpeedProfiles :
attackerSpeedProfiles?: Partial<Record<AttackerId, AttackerSpeedTier>>;
/** Phy.O — Active le profil de vitesse offensif (courbure + tier). Opt-in. */
attackerVelocityProfileEnabled?: boolean;
```

**Dans `src/lib/data/physics.ts`** :

```ts
/** Phy.O — Sensibilité de base à la courbure pour le profil de vitesse
 *  offensif. Plus haut = ralentissement plus marqué dans les virages. */
export const OFFENSIVE_CURVATURE_SENSITIVITY = 120;
/** Nombre de points d'échantillonnage du profil. Compromis entre
 *  précision et coût de pré-calcul (one-shot par annotation). */
export const OFFENSIVE_PROFILE_SAMPLES = 64;
/** Multiplicateurs α par tier athlétique attaquant. */
export const OFFENSIVE_TIER_MULTIPLIER = {
  elite: 0.7,
  standard: 1.0,
  lent: 1.4,
} as const;
```

**Dans `src/components/ParametresPanel.tsx`** : un nouveau toggle
`CheckboxLine` :

```tsx
<CheckboxLine
  checked={!!state.attackerVelocityProfileEnabled}
  label="profil de vitesse offensif (Phy.O — courbure)"
  onChange={(v) => onPatch({ attackerVelocityProfileEnabled: v })}
  title="Les attaquants ralentissent dans les virages serrés (V-cuts, hesitations) et ré-accélèrent en sortie. Vitesse constante sur les drives droits. Opt-in."
/>
```

**Per-attaquant** : V1 ne livre **pas** de UI dédiée pour le tier. Les tiers
peuvent être posés via JSON import/export (édition manuelle) ou via une
future UI. Tous les attaquants par défaut = `'standard'` (tier non défini
dans le map → comportement standard). Cohérent avec G.4 qui a la même
limitation pour les défenseurs (slider dans DefensePanel mais pas
toujours utilisé).

## Section 5 — Tests

Tests unitaires purs (mirror du style `defensiveRoute.test.ts`) :

- `buildVelocityProfile([from, to])` (2 points) → remap identité.
- `buildVelocityProfile([from, mid, to])` avec mid sur la droite from-to
  (κ = 0) → remap identité (epsilon).
- `buildVelocityProfile([from, apex, to])` en V (apex écarté) → remap NON
  identité, `remap(0.5)` est *plus avancé* en s/L que 0.5 (le joueur a
  passé l'apex plus rapidement en arc-length parce qu'il y ralentit en
  temps).
- Invariants endpoints : `remap(0) === 0`, `remap(1) === 1`.
- Monotonie : pour 10 valeurs croissantes d'`actionT`, `remap` est strictement
  croissant.
- Tier `elite` vs `lent` sur le même path en V : la déviation par rapport à
  l'identité est *plus faible* pour elite que pour lent.
- Path dégénéré (`from === to`) → remap identité (ne lève pas, ne divise pas par 0).

Pas de test composant React (convention projet). Pas de test d'intégration
spécifique : la branche `state.attackerVelocityProfileEnabled = false`
garantit que le comportement legacy est strictement inchangé (la suite
existante en témoigne).

## Hors V1 (V2/V3, plans séparés)

- **Friction de proximité offensive** — Lever B équivalent : encore
  ralentir v(s) aux points du path proches d'un autre joueur (besoin des
  positions adversaires au temps t, donc moins pur).
- **Démarquage actif** — l'attaquant *réagit* à la défense (mirror de
  l'anticipation défensive G.3). Demande un modèle de décision offensif.
- **Feintes / jab steps / hesitations** — transitions de vitesse non-linéaires
  modélisées explicitement (pas seulement émergées de la courbure du path).
- **Cap d'accélération absolu** — vraisemblablement redondant grâce au lissage
  Catmull-Rom (pas de coin), à confirmer si un cas pathologique apparaît.
- **UI per-attaquant pour le tier** — picker dans le menu contextuel
  attaquant ou un panneau dédié.

## Fichiers touchés

- **Créer** : `src/lib/logic/velocityProfile.ts` + tests.
- **Modifier** : `src/lib/logic/playbackTrajectory.ts` (signature +
  câblage), `src/lib/types/index.ts` (3 ajouts), `src/lib/data/physics.ts`
  (constantes), `src/components/ParametresPanel.tsx` (toggle).
- Callers de `attackerTrajectoryAt` (probablement `frameResolver.ts` et/ou
  `useCourtFrame.ts`) à mettre à jour pour construire et passer
  `velocityProfileOptions` à partir de `state`.
