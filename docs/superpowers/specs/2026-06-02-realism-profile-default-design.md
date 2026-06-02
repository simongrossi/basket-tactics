# Spec — Preset réaliste par défaut (`realismProfile`)

**Date** : 2026-06-02
**Sous-projet** : Cinématique fine #1 (activer le réalisme par défaut)
**Statut** : design validé, prêt pour plan d'implémentation

> Premier des trois sous-projets de l'axe « comportement plus réel et
> précis » (ordre choisi : cinématique fine → défense vivante pendant le
> drive → contact & fautes). Celui-ci ne crée **aucune** nouvelle
> mécanique : il calibre et active par défaut le réalisme cinématique
> déjà livré (pilier « Réalisme physique V1 », 15 items en flags opt-in).

---

## Problème

Le moteur possède déjà un réalisme cinématique riche (accélération/
décélération non-linéaires, momentum, velocity profile piloté par
courbure, footwork latéral, temps de réaction, plant-and-cut). Mais :

1. **Tout est opt-in et `false` par défaut.** `makeInitialState()`
   ([src/lib/data/initial.ts:65](../../../src/lib/data/initial.ts)) pose
   chaque flag à `false`. L'expérience par défaut reste « tableau
   tactique idéalisé », pas un comportement réaliste.
2. **Le réalisme est éparpillé** en flags indépendants, sans concept de
   « profil » cohérent ni point unique pour dire « ce que réaliste veut
   dire ».

**Objectif** : qu'une nouvelle session démarre en comportement réaliste,
avec un retour au mode tactique en un clic, **sans casser la suite de
tests** (124 fichiers appellent `makeInitialState()` et supposent le
comportement legacy) ni la reproductibilité du playback.

---

## Décisions de cadrage (validées)

- **Approche B** : champ `realismProfile` + resolver pur (source de
  vérité unique), plutôt que flipper les défauts ou un état de départ
  parallèle.
- **Scénarios sauvegardés** : migrés en `'realistic'` à l'ouverture
  (homogénéisation), pas laissés en legacy.
- **Scope du preset réaliste = cinématique déterministe uniquement.**
  Hors scope (lus bruts, comme aujourd'hui) : les comportements RNG/
  non-déterministes, le contact, la transition, le mode démo.

---

## Architecture

### 1. Type

Nouveau type et champ optionnel sur `AppState`
([src/lib/types/index.ts](../../../src/lib/types/index.ts)) :

```ts
export type RealismProfile = 'realistic' | 'legacy';
// AppState:
realismProfile?: RealismProfile;
```

Pas de valeur `'custom'` : le besoin « réaliste sauf tel sous-comportement »
est couvert par les overrides par-flag (voir resolver). YAGNI.

### 2. Resolver pur — `src/lib/logic/realismProfile.ts`

Module pur, déterministe, sans mutation. Fonction unique :

```ts
export interface ResolvedRealismFlags {
  attackerAccelerationEnabled: boolean;
  attackerAcceleration: number;
  attackerMomentumEnabled: boolean;
  attackerMomentum: number;
  attackerVelocityProfileEnabled: boolean;
  footworkRulesEnabled: boolean;
  // reaction-time / plant-and-cut : voir « Flags du groupe » ci-dessous
}

export function resolveRealismFlags(state: AppState): ResolvedRealismFlags;
```

Règles de résolution :

- **`realismProfile === 'realistic'`** → renvoie le groupe cinématique
  aux **valeurs calibrées** (cf. §Calibration), **sauf** tout flag
  explicitement posé sur l'état, qui **gagne** (override individuel du
  coach). Concrètement, pour chaque flag du groupe :
  `resolved = state.<flag> ?? PRESET_REALISTIC.<flag>`.
- **`realismProfile === 'legacy'` OU `undefined`** → renvoie les flags
  **bruts** tels qu'aujourd'hui (`resolved = state.<flag> ?? legacyDefault`).
  C'est le chemin **rétro-compatible** : `makeInitialState()` laissant
  `realismProfile` undefined, le resolver reproduit exactement le
  comportement legacy → les 124 tests restent verts par construction.

> La distinction override : pour `'realistic'`, on doit pouvoir
> distinguer « flag absent » (→ valeur preset) de « flag posé à `false` »
> (→ override, reste `false`). Les flags du groupe étant optionnels
> (`?: boolean`), `state.flag ?? presetValue` suffit : `false` explicite
> l'emporte, `undefined` prend le preset.

### 3. Flags du groupe cinématique (in-scope)

| Flag | Valeur(s) liée(s) |
|---|---|
| `attackerAccelerationEnabled` | `attackerAcceleration` (m/s²) |
| `attackerMomentumEnabled` | `attackerMomentum` |
| `attackerVelocityProfileEnabled` | (sensibilité courbure / tiers) |
| `footworkRulesEnabled` | — |
| reaction-time / plant-and-cut | (à confirmer en plan : flag dédié ou porté par `footworkRulesEnabled` — `b92d59d`) |

**Hors scope du resolver** (lus bruts dans le moteur, inchangés) :
`physicsReboundsEnabled`, `activeInterceptionsEnabled`,
`dribblePhysicsEnabled` (RNG → casseraient la reproductibilité golden),
`physicalContactBattlesEnabled` (sous-projet 3 contact),
`defensiveTransitionEnabled` (transition), `screenStiffnessEnabled`
(contact), `realSpeedMode` (mode démo de compression timeline, pas du
réalisme), `cvtOffensiveEnabled` (à trancher en plan : changement de
chemin potentiellement large → calibration séparée, **exclu du défaut
en V1**).

### 4. Sites de lecture moteur (la partie invasive de B)

Router les lectures du groupe cinématique à travers `resolveRealismFlags`
au lieu de `state.<flag>` direct. Sites repérés (à énumérer
exhaustivement dans le plan) :

- [src/lib/logic/playback/frameResolver.ts](../../../src/lib/logic/playback/frameResolver.ts)
  (≈ L423, L477, L699, L739 — accel/velocityProfile/footwork).
- [src/lib/logic/defense/speedConstraint.ts](../../../src/lib/logic/defense/speedConstraint.ts)
  (≈ L206, L537, L664, L711 — footwork/delayFraction).
- [src/hooks/useCourtFrame.ts](../../../src/hooks/useCourtFrame.ts)
  (≈ L300, L353 — footwork).
- Câblage `velocityProfile` (depuis `frameResolver`).

**Invariant de non-régression** : sur un état `realismProfile`
undefined/legacy, chaque site doit produire un résultat **bit-identique**
à aujourd'hui (golden snapshots, anti-flicker, overlap, screenLab).

### 5. Défaut « réaliste » + migration

L'app et les tests partagent `makeInitialState()` via
`useHistorizedState(makeInitialState)`
([useAppState.ts:104](../../../src/hooks/useAppState.ts)). Pour diverger
sans toucher les tests :

- **`makeInitialState()` reste inchangée** : `realismProfile` undefined
  (→ resolver legacy → tests verts).
- **Seed app** : `useAppState` seede via un wrapper mince
  `makeAppInitialState() = { ...makeInitialState(), realismProfile: 'realistic' }`.
  Seul le chemin app passe par ce wrapper ; les tests continuent
  d'appeler `makeInitialState()`.
- **Migration au chargement** : dans
  [src/lib/state/persistence.ts](../../../src/lib/state/persistence.ts)
  `loadFromStorage`, après merge `{...defaults, ...parsed}`, si
  `merged.realismProfile === undefined` → forcer `'realistic'` (suit le
  pattern `migrateScriptedActions`). Idem pour l'import JSON de scénario.

### 6. UI — `ParametresPanel`

- Sélecteur segmenté **« Réaliste / Tactique »** pilotant `realismProfile`
  via `onPatch({ realismProfile })`.
- Les checkboxes physiques individuelles existantes restent visibles
  comme **overrides avancés** (le coach peut désactiver un sous-comportement
  même en mode réaliste — cohérent avec la règle d'override du resolver).
- Aucune suppression de contrôle existant (préserve l'usage actuel).

### 7. Calibration

Choisir des valeurs cohérentes pour le preset réaliste, puis **vérifier
visuellement via le preview** (workflow preview_* : lancer le dev server,
rejouer un scénario type PnR + un drive, comparer réaliste vs tactique)
avant de figer. Valeurs de départ proposées (à affiner) :

- `attackerAcceleration` : 5.0 m/s² (déjà le défaut actuel du slider).
- `attackerMomentum` : 0.15 (déjà le défaut actuel).
- velocity profile : sensibilité courbure par défaut du module.

Les valeurs finales seront figées dans une constante `PRESET_REALISTIC`
co-localisée avec le resolver.

---

## Plan de tests

1. **Resolver** (`realismProfile.test.ts`) :
   - `'realistic'` → groupe activé aux valeurs preset.
   - `'realistic'` + override `footworkRulesEnabled: false` → reste `false`
     (l'override gagne).
   - `'legacy'` → flags bruts (un état legacy donne le comportement
     d'aujourd'hui).
   - `undefined` → identique à `'legacy'` (rétro-compat).
2. **Garde-fou tests** : `makeInitialState()` a `realismProfile`
   undefined ET `resolveRealismFlags(makeInitialState())` est
   bit-identique aux défauts legacy actuels (verrouille les 124).
3. **Migration** (`persistence` ou module dédié) : un état parsé sans
   `realismProfile` → migré en `'realistic'` ; un état avec
   `'legacy'` explicite → préservé.
4. **Non-régression moteur** : la suite golden complète reste verte sans
   édition (frameResolver, anti-flicker, overlap, screens*, userJson*,
   screenLab*).
5. **Intégration** : un état `realismProfile: 'realistic'` produit des
   trajectoires distinctes du legacy sur un scénario drive (preuve que
   le routage est effectif).

---

## Hors scope (sous-projets ultérieurs)

- Défense vivante pendant le drive (sortir du RNG) — sous-projet 2.
- Contact & fautes (box-out réel, faute, and-one) — sous-projet 3.
- Profil athlétique unifié par joueur, fatigue dynamique, cinématique
  défensive pilotée par courbure — pistes notées, non couvertes ici.
- Activation par défaut des comportements RNG (`physicsRebounds`,
  `activeInterceptions`, `dribblePhysics`) et de `cvtOffensiveEnabled` :
  restent opt-in.

---

## Risques

- **Régression silencieuse** sur un site de lecture mal routé →
  couvert par l'invariant bit-identique legacy + golden snapshots.
- **Calibration trop agressive** rendant le rendu « mou » ou exagéré →
  validation visuelle preview obligatoire avant figeage des valeurs.
- **Fragilité ordre des couches** (cf. CLAUDE.md Règle 1bis) : le
  resolver ne change ni l'ordre des couches ni le pipeline d'écran ; il
  ne fait que résoudre des valeurs de flags. Relire SCREEN-ENGINE.md
  avant tout contact avec `frameResolver.ts`.
