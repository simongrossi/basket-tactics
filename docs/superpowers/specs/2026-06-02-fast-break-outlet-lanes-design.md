# Fast-break : outlet + sprint des couloirs (transition sous-projet 1) — Design

> **Chantier** : Transition / fast-break (IDEAS §3, dernier 🔴 de l'audit) —
> **sous-projet 1 : outlet + sprint des couloirs**. Les sous-projets 2 (avantage
> numérique + conclusion) et 3 (secondary break → demi-terrain) suivront, specs
> séparés.

## But

Générer un vrai **fast-break full-court** après un rebond défensif : l'équipe qui
sécurise le rebond fait une **passe outlet** puis **sprinte les couloirs** vers le
panier opposé (`HOOP_OPPOSITE`), pendant que l'autre équipe **se replie**.
Aujourd'hui ~25-30 % des possessions (transition) ne sont pas couvertes : le
moteur ne sait jouer que le demi-terrain placé. Le seam rebond existe (A11 :
`buildShotReboundSetup` → `outletPassPending`) mais **rien ne génère le break**.

## Décisions de cadrage (brainstorming 2026-06-02)

| # | Question | Décision |
|---|---|---|
| 1 | Où vit le fast-break | **Extension du pipeline rebond, côté éditeur**, full-court (vs template autonome / match-sim) |
| 2 | Forme du break | **Deux phases** : outlet step + sprint-des-couloirs step, fin en position de transition au loin (vs condensé / avec conclusion) |
| Fork | Relation à l'existant `addOutletPassStep` | **Option C** : l'équipe qui rebondit court ; nouveau builder qui réutilise le mapping D→O testé, **sans miroir**, full-court ; `addOutletPassStep` (miroir demi-terrain « transition adverse ») reste intact |

## Architecture

**Principe** : un builder pur consomme le **step de rebond défensif**
(`reboundType:'defensive'`, déjà produit par `buildShotReboundSetup`) et génère
**2 steps** appendés après lui, en **full-court** vers `HOOP_OPPOSITE`.

### Orientation (option C)

Sur un rebond défensif, c'est **l'équipe défensive (les `D`) qui sécurise le
ballon** et part en transition. Pour rester compatible avec le moteur
« O = attaque » :
- on **mappe D→O** (les défenseurs deviennent les attaquants du break) **en
  conservant leurs positions** (PAS de miroir — ils restent à leur bout et
  sprintent vers `HOOP_OPPOSITE`), via le même pattern de mapping que
  `buildAwayPossessionSetup` (rôles postes préservés) ;
- les anciens `O` deviennent les `D` du break (ils se replient) ;
- `attackingDirection: 'down'` + `fullCourt: true` : le break attaque le panier
  bas (`HOOP_OPPOSITE`, y=1005).

> `addOutletPassStep` / `convertStepToAwayPossession` (E.1 stage 2b, miroir
> demi-terrain) restent **inchangés** — le fast-break est une sortie distincte,
> plus riche. Aucune régression sur les tests E.1.

### Module `src/lib/logic/fastBreak.ts` (pur)

- `buildFastBreakSteps(state, reboundStepIdx)` → `{ outletStep, sprintStep }`.
  Calcule le mapping D→O, l'outlet receiver, l'assignation des couloirs et le
  repli défensif. Purs, aucun side-effect.
- `selectOutletReceiver(off, rebounderId, active)` → l'attaquant (post-mapping)
  le plus proche du rebondeur, hors rebondeur.

### Transform `addFastBreakSteps(state, reboundStepIdx)`

- pose `fullCourt:true` + `attackingDirection:'down'` ;
- insère `outletStep` puis `sprintStep` après le step de rebond (helpers de
  mutation de steps existants, pattern `addShotReboundStep`).

## Les deux steps

**Outlet step** :
- **R** (rebondeur) reste près du spot de rebond (~y=90), passe (annotation pass).
- **G** (outlet receiver) s'écarte côté ballon vers la médiane :
  `{ x: G.x < 300 ? 160 : 440, y ≈ 420 }`. `ballCarrier = G`.
- Les 3 autres amorcent (positions finalisées au sprint step).

**Sprint step** (vers `HOOP_OPPOSITE`, `sprintBoost:true` → défenseurs ×1.8) :
assignation déterministe par rang x (cf. table), annotations `sprint`.

| Rôle | Joueur | Cible |
|---|---|---|
| Ball handler | outlet receiver G | milieu `{300, 780}` |
| Aile gauche | x min des 3 restants | `{110, 840}` |
| Aile droite | x max des 3 restants | `{490, 840}` |
| Trailer 1 | rebondeur R | `{300, 560}` |
| Trailer 2 | le 3ᵉ restant | `{300, 650}` |

**Repli défensif** (au sprint step) : chaque `D` sprinte en repli vers
`HOOP_OPPOSITE`, garde son x relatif, cible une ligne près de l'arc lointain
(y≈900, protège le cercle). Pas de lecture d'appariement (sous-projet 2).

**Garde-fous** : full-court activé par le builder ; `breakUpTeleports` interpole
le grand bond y (rebond ~y=75 → ~y=840) ; couloirs espacés (110/300/490 ⇒ ≥ 180 px)
+ `pushOutOfMany` en filet → Règle 1. Aucun fichier `screens/` touché (Règle 1bis
non concernée).

**Cas limite** `playerCount < 5` : on assigne dans l'ordre disponible (ball +
ailes/trailers autant que possible), rôles manquants sautés. Step de rebond non
défensif (`reboundType !== 'defensive'`) → `addFastBreakSteps` no-op.

## UI (StepsPanel)

Bouton **⚡ Générer le fast-break**, visible quand le step courant est un **rebond
défensif** (`reboundType === 'defensive'`). Câblage calqué sur `addShotReboundStep` :
transform `addFastBreakSteps` → callback `useAppState` → bouton. Le clic bascule
full-court + `attackingDirection='down'` et appende les 2 steps.

## Tests (TDD)

- **`fastBreak.test.ts`** (pur) :
  - `selectOutletReceiver` = attaquant le plus proche du rebondeur (hors lui).
  - assignation couloirs par rang x (ball milieu, ailes extrêmes, rebondeur
    trailer) ; 2 steps ; `ballCarrier` = G à l'outlet, conservé au sprint ;
    cibles y (ailes ≈840, ball ≈780) ; repli D vers y≈900 ; `playerCount < 5`
    gracieux.
- **`addFastBreakSteps`** (transform) : appende 2 steps après le rebond ; pose
  `fullCourt:true` + `attackingDirection:'down'` ; no-op si rebond non défensif.
- **`overlapInvariants.test.ts`** : clearance respectée sur les steps du break.
- **Garde-fou** `overlap screens userJson screenLab` + suite complète vertes
  (départ 2027).

## Rollout & rétrocompat

- Feature éditeur, **additive** : nouveau builder/transform + bouton. `addOutletPassStep`
  et le pipeline E.1 inchangés. Pas de migration.

## Docs à mettre à jour à la livraison

- `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md §3` (transition — sous-projet 1 livré,
  2/3 restants), `docs/GAME-ENGINE.md`, `docs/todo-priorities.md`.

## Hors scope (sous-projets / extensions ultérieurs)

- **Avantage numérique 2c1/3c2 + conclusion** (layup / lecture du défenseur) —
  sous-projet 2.
- **Secondary break** → bascule vers le demi-terrain placé — sous-projet 3.
- **Transition auto dans le match-sim** (`gameLoop`) — audit #7.
- Appariements défensifs fins en repli ; outlet vers un receveur choisi par le
  coach (V1 = le plus proche).
