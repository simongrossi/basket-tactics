# Spec — Offense en lecture réactive (read-based offense)

**Date** : 2026-05-29
**Statut** : design proposé, à valider
**Origine** : audit expert externe 2026-05-29 (cf [IDEAS.md](../../../IDEAS.md) § « Audit expert 2026-05-29 ») — chantier basket prioritaire #1.

## Contexte et problème

Aujourd'hui, une action offensive scriptée (`pick-and-roll`, `pin-down`, …)
génère **toujours la même séquence de steps**, quelle que soit la couverture
défensive jouée. Or **tout le basket moderne est un jeu de lectures** : la
même entrée (un PnR) se conclut différemment selon ce que fait la défense :

- la défense **drop** → tir mi-distance / floater du porteur, pocket pass ;
- la défense **hedge/show** → re-screen, ou split (le roller a un temps d'avance) ;
- la défense **blitz/trap** → passe au roller en 4-contre-3 (short roll) puis skip au corner faible ;
- la défense **switch** → on attaque le mismatch (le grand sur le petit, ou inversement) ;
- la défense **ice** (side PnR) → reject de l'écran, attaque du côté libre ;
- la défense passe **over** → snake dribble / re-use ;
- la défense passe **under** → tir immédiat (pull-up 3).

Le coach ne peut pas, à ce jour, montrer « si la défense fait X, on joue Y ».
Il peut seulement diagrammer une issue figée.

## Brique existante réutilisée

Deux mécanismes existent déjà et **n'ont jamais été reliés** :

1. **`ScenarioBranch`** ([types/index.ts](../../../src/lib/types/index.ts) L429) —
   une suite alternative d'actions qui diverge après une action donnée
   (`divergeAfterActionId`). Aujourd'hui **sélectionnée à la main** par le coach
   via `state.activeBranchId`, et splicée par
   [compileScenario.ts](../../../src/lib/logic/compileScenario.ts) L39-49.

2. **La couverture défensive est déjà connue et calculée** :
   `OnScreenNav = 'over'|'under'|'switch'|'hedge'|'drop'|'blitz'` (+ `'ice'` côté
   `DefensiveActionType`), réglée globalement (`state.screenRule`) ou par
   défenseur (`DefenderRule.screenNav`), détectée par
   [detectScreen](../../../src/lib/logic/screens/detectCarrierScreen.ts) et
   appliquée par `carrierScreenAdjust`.

**Le chaînon manquant** = sélectionner automatiquement la branche en lisant la
couverture que le moteur joue réellement, au lieu de la choisir à la main.

## Vision retenue

Une branche peut porter un **déclencheur de lecture** (`ReadTrigger`). Quand le
scénario est compilé :

1. on compile le **chemin principal seul** jusqu'à l'action de divergence ;
2. on calcule la défense (`computeDefenseTargets`) au **moment où l'écran est
   utilisé** (dernier step de l'action de divergence) ;
3. on **résout la couverture effective** sur ce PnR (override par défenseur sinon
   règle globale, via la même résolution que `carrierScreenAdjust` — source
   unique) ;
4. on **active la première branche** dont le `ReadTrigger.coverage` matche.

Le coach construit son entrée **une fois**, puis change la couverture défensive
et regarde l'offense **se relire automatiquement**. C'est le saut « tableau
animé » → « simulateur tactique ».

### Le manuel prime toujours

Si `state.activeBranchId` est posé explicitement (le coach a cliqué « montre la
variante drop »), il **gagne** sur la résolution automatique. La lecture
réactive ne s'applique que lorsqu'aucune branche n'est forcée à la main. Les
branches V1 sans `trigger` restent 100 % rétrocompatibles.

## Modèle de données

Extension minimale, additive (aucun champ retiré, aucune rupture) :

```ts
/** Déclencheur de lecture : quelle couverture défensive active cette branche. */
export interface ReadTrigger {
  /** V1 : seule la couverture d'un écran porteur (PnR / side PnR) est lue. */
  kind: 'screen-coverage';
  /** Action-écran dont on lit la couverture. = ScenarioBranch.divergeAfterActionId. */
  actionId: string;
  /** Couverture(s) qui activent la branche. */
  coverage: OnScreenNav[];
}

export interface ScenarioBranch {
  id: string;
  label: string;
  divergeAfterActionId: string;
  actions: ScriptedAction[];
  /** Si défini → branche réactive (auto-sélection). Sinon → branche manuelle (V1). */
  trigger?: ReadTrigger;   // ← NOUVEAU
}
```

`activeBranchId` conserve sa sémantique (override manuel). On ajoute un champ
dérivé **lecture seule** pour l'UI :

```ts
/** Posé par le compilateur : id de la branche réactive effectivement active
 *  (null = chemin principal joué). Sert au badge « Lecture : DROP → … ». */
resolvedReadBranchId?: string | null;   // ← NOUVEAU, transient
```

## Tables de lecture canoniques (contenu métier)

Bibliothèque de continuations « justes » proposées en 1 clic au coach (presets).
Chaque ligne = une `ScenarioBranch` réactive pré-remplie avec son `ReadTrigger` :

| Couverture | Lecture correcte | Branche (actions) |
|---|---|---|
| **drop** | Floater / pull-up du porteur ; pocket pass au roller court | `drive` (pull-up) **ou** `pass`→roller + `shoot` |
| **hedge** | Re-screen (re-pick) ou split — le roller a un temps d'avance | `pick-and-roll` (re-screen) **ou** `split-action` |
| **blitz** | Passe au roller en 4c3 (short roll), puis skip corner faible | `pass`→roller + `kick-out`→corner faible + `shoot` |
| **switch** | Attaque du mismatch (iso grand/petit) ou slip + post | `isolation` **ou** `slip` + `high-low-action` |
| **ice** | Reject l'écran, attaque le côté libre ; ou re-screen central | `reject` **ou** `drag-screen` |
| **over** | Snake dribble / re-use ; le roller roule fort | `drive` (snake) + `pass`→roller |
| **under** | Tir immédiat (pull-up 3) | `shoot` |

Ces presets sont des **données** (`src/lib/data/readLibrary.ts`), pas du code
moteur — extensibles sans toucher au compilateur.

## Résolution de la couverture (source unique)

Nouveau module pur `src/lib/logic/reads/resolveCoverage.ts` :

```ts
resolveScreenCoverage(state: AppState, atStepIdx: number): OnScreenNav | null
```

1. `detectScreen(...)` au step `atStepIdx` → `carrierDef`, `screenerDef`.
2. Couverture effective = `rules[screenerDef].screenNav` si ≠ `'auto'`, sinon
   `state.screenRule` global (le **même** ordre de priorité que
   `carrierScreenAdjust` — à factoriser en helper partagé pour éviter la
   divergence signalée dans l'audit code-health).
3. Retourne `null` si aucun écran détecté (l'offense joue alors le chemin
   principal).

## Sélection de branche

Nouveau module pur `src/lib/logic/reads/selectReactiveBranch.ts` :

```ts
selectReactiveBranch(state: AppState): { branch: ScenarioBranch | null }
```

- Si `state.activeBranchId` posé → renvoie cette branche (override manuel).
- Sinon, pour chaque branche avec `trigger` :
  1. compile le chemin principal seul (`compileScenario` sans `activeBranch`) ;
  2. récupère le `parentRanges[trigger.actionId].endIndex` = step de lecture ;
  3. `resolveScreenCoverage(state, readStepIdx)` ;
  4. première branche dont `trigger.coverage.includes(coverage)` → gagne.
- Renvoie `{ branch: null }` si aucune ne matche.

## Intégration

Au point d'appel de `compileScenario` (dans `useAppState` / le sélecteur de
steps compilés) : remplacer le lookup `activeBranchId` brut par
`selectReactiveBranch(state).branch`, et stocker `resolvedReadBranchId` pour
l'UI. **Recompiler quand les réglages défensifs changent** (la couverture peut
basculer) — déjà le cas si la compilation dépend de `state`.

## UI

- **Éditeur de branche** (`ScenarioPanel`) : à la création, choisir le
  déclencheur = puce de couverture (Drop / Hedge / Switch / Blitz / Ice / Over /
  Under) **ou** « Manuel » (legacy). Bouton « + Insérer les lectures standard »
  → injecte les presets de `readLibrary.ts` pour l'action-écran sélectionnée.
- **Badge de lecture active** sur le terrain / la timeline :
  `Lecture : DROP → pocket pass`. Mis à jour en live quand le coach change la
  couverture défensive.

## Tests

- `reads/__tests__/resolveCoverage.test.ts` — override par défenseur prime sur
  global ; `null` si pas d'écran ; parité avec `carrierScreenAdjust`.
- `reads/__tests__/selectReactiveBranch.test.ts` — manuel prime sur réactif ;
  drop→branche drop, blitz→branche blitz ; aucune branche si pas de match ;
  premier match gagne en cas d'ambiguïté.
- `compileScenario` : une branche réactive splice exactement comme une branche
  manuelle (réutilise le chemin existant — pas de régression attendue).
- Golden snapshot : un PnR + 3 branches (drop/switch/blitz), 3 couvertures →
  3 séquences distinctes attendues.

## Hors scope (YAGNI / phases ultérieures)

- **Lectures hors PnR** : drive-and-kick (aide venue du corner → skip ;
  aide du nail → drop-off), backdoor sur deny. Phase L.3, plus gros.
- **Sous-branches / arbres de lecture multi-niveaux** : V1 reste un seul niveau
  (comme `ScenarioBranch` actuel).
- **Lecture probabiliste** (la défense joue drop 70 % / blitz 30 %) : V1 est
  déterministe (la couverture réglée est jouée).
- **Reads côté défense** : la défense reste pilotée par l'engine ; on ne lit
  que sa couverture, on ne la rend pas réactive à la branche offensive (pas de
  boucle réflexive en V1 — on lit la couverture au moment de l'usage de l'écran,
  avant divergence : bien défini et déterministe).

## Risques

- **Règle 1bis (moteur d'écran)** : le resolver est **lecture seule** sur les
  positions défensives (il appelle `computeDefenseTargets` + `detectScreen` mais
  ne mute rien). Risque faible. Lancer néanmoins `screens*` + `userJson*` +
  `screenLab*` avant commit.
- **Parité de résolution de couverture** : risque de divergence si
  `resolveScreenCoverage` et `carrierScreenAdjust` lisent la règle
  différemment. Mitigation : helper partagé `effectiveScreenNav(state, screenerDef)`.
- **Coût compile** : un compile supplémentaire du chemin principal + une
  `computeDefenseTargets` sur un step. Négligeable (déjà fait au render).

## Critères de succès

1. Construire un PnR + 2 branches réactives (drop / blitz). Régler la défense
   sur drop : l'offense joue le pull-up ; passer en blitz : l'offense joue
   le short roll + skip. Sans cliquer sur les branches.
2. Override manuel : forcer `activeBranchId` → la lecture auto est ignorée.
3. Badge « Lecture : … » reflète la couverture courante en temps réel.
4. Branches V1 sans `trigger` inchangées (rétrocompat, snapshots verts).
5. Tous les tests Vitest verts + nouveaux tests.
