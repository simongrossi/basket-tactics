# Lecture probabiliste (Phase L extension) — Design

Date : 2026-06-02
Statut : **spec validée — prête pour le plan.**

## Problème

La lecture réactive (Phase L.0-L.3, livrée) est **déterministe** : la couverture
défensive est figée par `state.screenRule` (override par défenseur > global), et
`selectReactiveBranch` choisit toujours la même branche. Le coach ne peut pas
modéliser une défense qui a des **tendances** (« ils droppent 70 % du temps,
blitzent 30 % ») et voir l'offense lire des couvertures différentes d'une
répétition à l'autre. C'est le passage « sélecteur déterministe » → « simulateur
de tendances défensives ».

## Principe central

La couverture **tirée** alimente `effectiveScreenRule` comme **base globale** (à
la place de `state.screenRule`) quand le mode probabiliste est actif. Conséquence
clé — une seule source de vérité :

1. Le **pipeline défensif** rend la couverture tirée (les défenseurs jouent
   réellement blitz : D5 show + trap).
2. `resolveScreenCoverage` lit `ctx.effectiveScreenRule` → la même valeur →
   `selectReactiveBranch` sélectionne la branche correspondante.
3. **Aucune divergence possible** entre ce que la défense rend et ce que
   l'offense lit.

`recompileScenarioSteps` n'a rien à changer : il lit déjà via
`selectReactiveBranch` → `resolveScreenCoverage` → `effectiveScreenRule`.

## Données (toutes opt-in)

Champs ajoutés à `AppState` :

```ts
/** Master opt-in. Default undefined = legacy déterministe. */
probabilisticReadsEnabled?: boolean;
/** Tendance défensive niveau scénario : couvertures pondérées. Poids relatifs
 *  (pas besoin de sommer à 1, normalisés au tirage). */
coverageDistribution?: { coverage: ScreenRule; weight: number }[];
/** Seed du tirage courant (reproductibilité). Bumpé par « rejouer ». */
coverageRollSeed?: number;
/** Couverture réalisée (set au tirage). Lue par context.ts pour piloter la
 *  défense + la branche. */
rolledCoverage?: ScreenRule;
```

**Granularité** : niveau scénario (tendance globale unique). Suffit en pratique
(un seul PnR lisible à la fois dans un scénario type).

## Helpers purs — `src/lib/logic/reads/coverageRoll.ts`

```ts
/** Tirage pondéré seedé. Réutilise mulberry32. Distribution vide ou poids
 *  total ≤ 0 → null. Sinon retourne une ScreenRule selon les poids. */
export function rollCoverage(
  distribution: { coverage: ScreenRule; weight: number }[],
  seed: number,
): ScreenRule | null;

/** Pour chaque couverture de la distribution, identifie la branche dont le
 *  trigger screen-coverage l'inclut (ou null = chemin principal). Agrège les
 *  poids par branche. Pur, pas de recompile. Pour le panneau stats. */
export function coverageBranchStats(state: AppState): {
  coverage: ScreenRule;
  weight: number;          // poids normalisé (somme = 1)
  branchId: string | null; // null = chemin principal
  branchLabel: string;     // label de branche ou « chemin principal »
}[];
```

`mulberry32` est dupliqué dans `match/calibration.ts` (privé). On l'extrait dans
un util partagé `src/lib/logic/rng.ts` (`export function mulberry32(seed)`) et on
fait pointer calibration dessus — petit nettoyage justifié par le besoin actuel.

## Intégration défense (Règle 1bis — 1 point)

`src/lib/logic/defense/context.ts`, résolution de `effectiveScreenRule`
(lignes ~183-187). La base passe de `state.screenRule` à :

```ts
const baseRule = state.probabilisticReadsEnabled && state.rolledCoverage
  ? state.rolledCoverage
  : state.screenRule;
```

et `baseRule` remplace `state.screenRule` dans l'IIFE (l'override par défenseur
`screenNav` garde sa précédence existante). Aucun autre changement au pipeline.

**Règle 1bis** : touche `defense/context.ts` → lancer `screens* + overlap* +
userJson* + screenLab*` avant commit. Le changement est gated (`probabilisticReadsEnabled`)
→ rétrocompat stricte (off = `baseRule === state.screenRule`, comportement identique).

## Transforms — `src/lib/state/transforms/`

Nouveau module `probabilisticTransforms.ts` (ou ajout à `scenarioTransforms.ts`) :

```ts
/** Active/désactive le mode + initialise une distribution par défaut si vide. */
toggleProbabilisticReads(state, enabled): AppState;
/** Pose la distribution. Re-tire avec le seed courant (cohérence rolledCoverage
 *  ∈ distribution) puis recompile. */
setCoverageDistribution(state, dist): AppState;
/** Bump le seed → recompute rolledCoverage via le helper rollCoverage →
 *  recompile. (Transform distinct du helper pur `rollCoverage`.) */
rerollCoverage(state): AppState;
```

Les trois passent par `recompileScenarioSteps` en fin (la branche s'auto-resélectionne
sur la nouvelle `rolledCoverage`).

## UI — `src/components/ScenarioPanel.tsx`

Section « Lecture probabiliste » (visible quand des branches réactives
`screen-coverage` existent) :
- Toggle d'activation.
- Éditeur de distribution : lignes `[couverture select] [poids slider/number] [×]`,
  + bouton « + couverture ». Couvertures = les `ScreenRule` apparaissant dans les
  triggers des branches (+ le chemin principal implicite = le reste).
- Bouton **🎲 rejouer la défense** + libellé de la couverture réalisée courante
  (« réalisé : BLITZ »).
- Panneau stats (depuis `coverageBranchStats`) : `Branche X — 70 %`,
  `chemin principal — 30 %`, barres proportionnelles.

## Plan de tests (~12)

- `rollCoverage` : déterministe pour un seed donné ; distribution mono → toujours
  cette couverture ; sur N=1000 tirages seedés, fréquences ≈ poids (±5 %) ;
  distribution vide → null.
- `coverageBranchStats` : mappe chaque couverture à la bonne branche ; couverture
  sans branche → chemin principal ; agrégation des poids ; normalisation somme=1.
- `mulberry32` extrait : parité avec l'ancien (même seed → même séquence).
- Intégration : `probabilisticReadsEnabled + rolledCoverage='blitz'` →
  `effectiveScreenRule === 'blitz'` (via buildDefenseFrameContext) ET
  `selectReactiveBranch` sélectionne la branche blitz.
- Opt-in off → `effectiveScreenRule` inchangé (legacy), `rolledCoverage` ignoré.
- INVARIANT Règle 1bis : suite screen verte.

## Découpage suggéré (2 commits + docs)

1. **Noyau** : types + `rng.ts` (extract mulberry32) + `coverageRoll.ts` +
   intégration context.ts + tests. (logique pure + 1 point défense)
2. **Transforms + UI** : transforms + ScenarioPanel + câblage useAppState/page.
3. **Docs** : CHANGELOG / ROADMAP / todo-priorities / IDEAS + marquer l'extension
   Phase L livrée dans le plan L.

## Hors scope (reportés)

- Arbres multi-niveaux (sous-branches récursives).
- Distribution par-read (granularité fine) — ici scénario-level.
- Monte-Carlo automatique sur N tirages avec rapport (le panneau stats donne déjà
  les fréquences théoriques ; un vrai MC animé est une extension séparée).
