# Continuity / motion offense — Design

> **Chantier** : Motion offense (continuité) — IDEAS §2 (🔴 « Pas de continuité /
> motion offense »). Premier sous-projet de l'axe motion : **boucle de
> continuité rotative**. Les sous-projets B (replacement/relocate) et C (ball
> reversal / DHO chain) feront l'objet de specs séparés.

## But

Permettre de modéliser une **vraie continuité offensive** (flex, shuffle,
Princeton, 5-out continu) : une séquence d'actions qui se **répète en boucle**,
avec **rotation des rôles** entre les joueurs à chaque cycle, jusqu'à ce qu'un
bon tir se présente. Aujourd'hui chaque action a un début/fin net et la chaîne
est figée ; impossible de montrer « la défense tient 2 tours, craque au 3ᵉ ».

## Décisions de cadrage (brainstorming 2026-06-02)

| # | Question | Décision |
|---|---|---|
| 1 | Cœur de « continuité » | **Boucle / continuity** (vs replacement, reversal — specs séparés) |
| 2 | Modèle de répétition | **Rotation des rôles** (vs replay littéral) — le vrai motion |
| 3 | Spécification de la rotation | **Permutation explicite** (roue σ définie par le coach) |
| 4 | Condition de fin | **Hybride** : max K cycles, mais une lecture peut sortir plus tôt |

## Architecture

**Principe : déroulé (unroll) au compile-time.** Aucun nouveau moteur de
playback. On reste sur le pipeline existant `actions → Step[]`
([compileScenario.ts](../../../src/lib/logic/compileScenario.ts)). La boucle est
une **plage contiguë d'actions** du chemin, rejouée K fois avec relabel des IDs
joueurs par une permutation σ.

### Modèle de données

Nouveau descripteur opt-in sur `AppState` (même esprit que `coverageDistribution`
de Phase L — `undefined` = comportement legacy déterministe) :

```typescript
export interface ContinuityLoop {
  /** Bornes de la plage d'actions formant le corps de boucle (inclusives). */
  startActionId: string;
  endActionId: string;
  /** Roue de rotation : ordre cyclique des attaquants actifs. σ(p) = élément
   *  suivant dans la roue (le dernier boucle sur le premier). Le cycle k
   *  applique σ^k aux IDs joueurs des params d'action. */
  rotation: AttackerId[];
  /** Borne haute de cycles (partie « max K » de l'hybride). Clampé 1…6. */
  maxCycles: number;
  /** Sortie anticipée sur lecture (Phase L). Si défini ET que la lecture
   *  réactive résolue à une frontière de cycle sélectionne cette branche,
   *  on sort de la boucle vers ses actions. null/undefined = pas de sortie
   *  anticipée (la boucle va jusqu'à maxCycles). */
  exitBranchId?: string | null;
}

// AppState.continuityLoop?: ContinuityLoop;
```

### Trois propriétés-clés du déroulé

1. **Relabel des rôles (σ^k).** Avant de lancer le générateur d'une action au
   cycle *k*, on remappe chaque ID joueur de ses params par σ^k. Le générateur
   (qui lit les positions de `prev`) produit donc le bon joueur faisant le bon
   geste. **La défense ne change pas** : `assignmentOverrides` Di→Oi reste
   stable, chaque défenseur suit son homme à travers la rotation (vérifié dans
   [applyDirective.ts](../../../src/lib/logic/applyDirective.ts) :
   `DEFAULT_ASSIGNMENT` + override).

2. **Fermeture géométrique = responsabilité du coach.** Pour que ça « tourne »
   proprement, la formation doit se refermer sous σ (le joueur qui finit dans le
   slot de départ d'O1 est bien σ(O1)). On **ne vérifie pas**, on rejoue. Un
   play mal fermé driftera — acceptable en V1. Évolution possible : « snap
   formation » en fin de cycle.

3. **Namespacing des `generatedBy`.** Chaque cycle produit des steps avec un
   `generatedBy` distinct (`${actionId}#c${k}`) pour que la préservation des
   `manualOverride` (qui clé par `generatedBy` + subIndex dans
   `compileScenario`) ne collisionne pas entre cycles.

La passe défensive (passe 2), `breakUpTeleports` et `smoothMovementFlickers`
tournent ensuite sur la liste de steps **déroulée**, donc **Règle 1 (clearance)
et Règle 1bis (écrans)** restent couvertes sans code spécifique.

## Le compilateur

`compileScenario` gagne une étape d'**expansion de boucle** dans la passe 1,
avant la passe défensive :

```
actions effectives (après résolution de branche Phase L)
  │
  ├─ actions AVANT startActionId      → jouées normalement
  │
  ├─ corps de boucle [start..end]     → expansion (expandContinuityLoop) :
  │     pour k = 0 … maxCycles-1 :
  │        1. (option C) évaluer la sortie-sur-lecture à la frontière de cycle
  │           → si la lecture résolue == exitBranch : break + jouer ses actions
  │        2. pour chaque action du corps :
  │             action' = rotateActionParams(action, rotation, k)
  │             gen = SCRIPTED_GENERATORS[type](prev, action')
  │             push steps, generatedBy = `${action.id}#c${k}`
  │             (préservation manualOverride par (generatedBy, subIndex))
  │
  └─ actions APRÈS endActionId        → jouées normalement (sortie « naturelle »)
```

### Modules

- **`src/lib/logic/reads/continuityLoop.ts`** *(créer)* — purs :
  - `rotateActionParams(action, rotation, k)` : remappe **uniquement** les champs
    d'IDs joueurs des params (ballHandler, screener, cutter, passer, receiver,
    giver, driver, shooter, from, to, firstScreener, secondScreener…) par σ^k.
    N'altère pas les champs non-joueur (side, direction, zones).
  - `expandContinuityLoop(...)` : produit la liste d'actions effectivement
    déroulées (ou délègue le push de steps — voir note d'implémentation).
- **`compileScenario.ts`** — branche l'expansion ; la logique d'unroll vit dans
  `continuityLoop.ts` pour garder `compileScenario` lisible.
- **`src/lib/types/index.ts`** — interface `ContinuityLoop` + champ
  `continuityLoop?`.

### Sortie-sur-lecture (option C, V1 prudent)

Réutilise **la même** résolution réactive que Phase L (pas de réinvention) : à
chaque **frontière de cycle** (et non à chaque sous-step, pour borner la
complexité), on évalue la couverture défensive réalisée. Si
`continuityLoop.exitBranchId` est défini **et** que la lecture courante
sélectionne cette branche (son trigger `screen-coverage` matche
`effectiveScreenRule`), on sort de la boucle et on joue les actions de la branche
de sortie. Sinon on continue jusqu'à `maxCycles`.

> **Note V1 — évaluation aux frontières de cycle uniquement.** Suffisant pour
> « tourne jusqu'à ce que la défense montre BLITZ, puis sors ». Évaluation
> intra-cycle = hors scope.
>
> **Limite honnête de l'hybride V1.** La sortie-sur-lecture n'est « vivante »
> (tient N cycles puis craque) que si la **couverture défensive varie d'un cycle
> à l'autre**. Avec une couverture *statique* (cas par défaut), la lecture donne
> le même résultat à chaque frontière → la sortie se déclenche dès le **premier**
> cycle matchant (souvent cycle 0) ou jamais. Le « tient 2 tours, craque au 3ᵉ »
> n'émerge qu'en couplant à une variation par cycle (ex. re-roll probabiliste de
> Phase L **par cycle**, ou futur modèle de dégradation défensive) — explicitement
> **hors scope V1**. On livre donc le mécanisme de sortie ; sa dynamique
> temporelle riche viendra avec ce couplage.

### Garde-fous d'intégrité (fallback legacy, rien ne casse)

- `rotation` doit être une **permutation des attaquants actifs** (cohérente avec
  `playerCount`). Invalide / vide / doublons → boucle ignorée, chemin principal
  joué normalement.
- `maxCycles` clampé **1…6** (garde-fou anti-explosion de steps).
- `startActionId`/`endActionId` ne délimitant pas une plage valide (start après
  end, IDs absents) → fallback chemin principal.
- Si `continuityLoop` absent → comportement strictement identique à aujourd'hui.

## UI (ScenarioPanel)

Section « 🔁 Continuité (motion) », visible dès qu'il y a **≥ 2 actions
offensives** :

- **Toggle opt-in** active/désactive la boucle.
- **Plage de boucle** : deux selects (action de début / action de fin) listant
  les actions offensives du chemin (label = type + index).
- **Roue de rotation** : la liste ordonnée des attaquants actifs, réordonnable
  (boutons ↑/↓), définissant σ. Aperçu textuel `O1 → O3 → O5 → O2 → O4 ↺`.
- **Cycles max** : input numérique 1–6.
- **Sortie sur lecture** (option C) : select optionnel d'une branche réactive
  `screen-coverage` existante — « sortir si la défense montre **{couverture}** ».
  Vide = pas de sortie anticipée.
- **Récap** : `Boucle : actions #2→#4 · rotation O1→O3→O5→O2→O4 · 3 cycles max ·
  sortie si BLITZ`.

### State / câblage (pattern Phase L)

- **Transforms** (`scenarioTransforms.ts`) :
  `setContinuityLoop(s, loop | null)` (pose/efface + `recompileScenarioSteps`).
  Le toggle off appelle `setContinuityLoop(s, null)`.
- **Callbacks** `useAppState.ts` : `setContinuityLoop` (+ helpers UI dérivés si
  besoin, ex. `setLoopRotation`, mais un seul transform `setContinuityLoop`
  suffit, l'UI reconstruit l'objet).
- **Câblage** `page.tsx` → props `ScenarioPanel`.

## Tests (TDD)

- **`reads/__tests__/continuityLoop.test.ts`** :
  - `rotateActionParams` : remap correct des champs joueurs, σ^k cumulatif,
    champs non-joueur intacts, k=0 = identité.
  - `expandContinuityLoop` : nombre de cycles = maxCycles ; rotation appliquée
    cumulativement ; fallback sur rotation invalide / plage invalide ; clamp
    maxCycles ; sortie anticipée à la frontière de cycle quand exitBranch matche.
- **Intégration** (`compileScenario`) : setup flex-like, compile, vérifier que
  les steps déroulés tournent les rôles (joueur attendu fait le geste attendu au
  cycle k) et que la formation se referme à ε près.
- **manualOverride** : un override sur un step de cycle 1 est préservé sans
  affecter les cycles 0/2 (namespacing `generatedBy`).
- **Règle 1 / 1bis** : suites `overlap screens userJson screenLab` vertes après
  expansion (la passe défensive + push-out tournent sur la liste déroulée).
- **Suite complète** verte (départ 1977).

## Rollout & rétrocompat

- Opt-in total : `continuityLoop === undefined` → aucun changement de
  comportement, tous les scénarios existants identiques.
- Pas de migration de données.

## Docs à mettre à jour à la livraison

- `CHANGELOG.md` — section Unreleased.
- `ROADMAP.md` / `IDEAS.md §2` — motion offense : boucle de continuité livrée
  (replacement + reversal restant).
- `docs/fiba-actions-roadmap.md` — « Continuity offense » → ✅.
- `docs/GAME-ENGINE.md` — mention de l'expansion de boucle dans l'orchestration.
- `docs/todo-priorities.md` — section Livrés.

## Hors scope (specs / extensions ultérieurs)

- **Replacement / relocate** (drift, lift, fill du corner) — sous-projet B.
- **Ball reversal / DHO chain** — sous-projet C.
- Rotation **auto-dérivée** (fermeture géométrique) ou **miroir** — sucres qui
  calculeront une σ appliquée de la même façon.
- Sortie-sur-lecture **intra-cycle** (V1 = frontières de cycle).
- « Snap formation » de fin de cycle pour corriger le drift.
