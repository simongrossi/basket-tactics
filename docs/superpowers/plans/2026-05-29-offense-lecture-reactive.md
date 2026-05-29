# Plan — Offense en lecture réactive (read-based offense)

**Date** : 2026-05-29
**Spec** : [2026-05-29-offense-lecture-reactive-design.md](../specs/2026-05-29-offense-lecture-reactive-design.md)
**Chantier** : Phase L (basket P1). Saut « tableau animé » → « simulateur tactique ».

Principe directeur : **réutiliser** le système de branches (`ScenarioBranch`) et
la couverture défensive déjà calculée (`OnScreenNav` / `detectScreen`). On
n'ajoute pas de moteur ; on relie deux briques existantes. Chaque phase est
livrable, testée, commit + push (Règle 2).

---

## Phase L.0 — Noyau pur (types + résolution), aucun UI ✅ LIVRÉ 2026-05-29

**But** : tout le calcul de lecture en pur, testable sans React, sans toucher
au rendu ni à la compilation.

### L.0.1 — ~~Helper partagé de couverture effective~~ → ABANDONNÉ (mieux)
- **Déviation assumée** : le plan prévoyait d'extraire un helper
  `effectiveScreenNav` pour mutualiser la résolution override/global. Or
  `resolveScreenCoverage` (L.0.3) réutilise directement
  `buildDefenseFrameContext`, qui calcule DÉJÀ `ctx.effectiveScreenRule` (la
  seule occurrence de cette résolution, dans `context.ts`). Il n'y avait donc
  aucune duplication réelle à factoriser, et la réutilisation du contexte donne
  la **parité par construction** (y compris hedge-recovery + unwind-reject).
  `carrierScreenAdjust` reçoit `rule` en paramètre — il ne résout rien. Helper
  inutile (YAGNI).

### L.0.2 — Types ✅
- `src/lib/types/index.ts` :
  - ajouter `interface ReadTrigger { kind: 'screen-coverage'; actionId: string; coverage: OnScreenNav[] }`.
  - ajouter `trigger?: ReadTrigger` à `ScenarioBranch`.
  - ajouter `resolvedReadBranchId?: string | null` à l'`AppState` (transient).
- Aucune valeur par défaut, additif pur.

### L.0.3 — Résolution de couverture ✅
- Fichier : `src/lib/logic/reads/resolveCoverage.ts` (nouveau dossier `reads/`).
- `resolveScreenCoverage(state, atStepIdx): ScreenRule | null` : réutilise
  `buildDefenseFrameContext(state, atStepIdx)` et renvoie
  `ctx.screen ? ctx.effectiveScreenRule : null`. `null` aussi si défense
  non-man ou index hors bornes. Type de retour = `ScreenRule` (la règle
  réellement jouée), pas `OnScreenNav`.
- Tests : `reads/__tests__/resolveCoverage.test.ts` (7 tests).

### L.0.4 — Sélection de branche ✅
- Fichier : `src/lib/logic/reads/selectReactiveBranch.ts` (nouveau).
- `selectReactiveBranch(state): { branch: ScenarioBranch | null }` :
  manuel (`activeBranchId`) prime ; sinon, pour chaque branche avec `trigger`,
  on trouve le **dernier step `generatedBy === trigger.actionId`** dans
  `state.steps` (= moment d'usage de l'écran, AVANT toute divergence donc
  stable), on résout la couverture à ce step, premier `coverage.includes(...)`
  gagne.
- **Simplification vs plan** : pas de recompilation ni de `parentRanges`. La
  lecture se fait sur `state.steps` déjà compilé car le step d'usage de l'écran
  précède le point de divergence (identique quelle que soit la branche active).
- Tests : `reads/__tests__/selectReactiveBranch.test.ts` (7 tests).

**Livrable L.0** ✅ : noyau pur + 13 tests verts, type-check OK, garde-fous
Règle 1bis verts (168 tests `screens*`/`overlap*`/`userJson*`/`screenLab*`).
Rien de visible côté app encore (câblage = L.1).

---

## Phase L.1 — Câblage compilation + bibliothèque de lectures ✅ LIVRÉ 2026-05-29

> Câblage dans `recompileScenarioSteps` (point unique de recompile) :
> `selectReactiveBranch` remplace le lookup `activeBranchId` brut + pose
> `resolvedReadBranchId`. `readLibrary.ts` fournit 7 lectures canoniques.
> 11 nouveaux tests (7 readLibrary + 4 intégration). Golden snapshots verts
> (chemin principal sans branche = inchangé).

### L.1.1 — Brancher la sélection auto
- Au point d'appel de `compileScenario({ ..., activeBranch })`
  (dans `useAppState` / le sélecteur des steps compilés) :
  remplacer le lookup brut de `activeBranchId` par
  `selectReactiveBranch(state).branch`. Stocker l'id résolu dans
  `resolvedReadBranchId` (pour le badge L.2).
- Garde-fou : si une branche réactive matche ET `activeBranchId` est posé →
  manuel gagne (déjà géré dans `selectReactiveBranch`).

### L.1.2 — Bibliothèque de lectures canoniques (données)
- Fichier : `src/lib/data/readLibrary.ts` (nouveau).
- Pour chaque couverture (drop/hedge/blitz/switch/ice/over/under), un builder
  qui retourne les `ScriptedAction[]` de la branche (cf. table du spec).
  Paramétré par l'écran source (porteur, screener, côté).
- Tests : `readLibrary.test.ts` — chaque builder produit des actions valides
  consommables par `SCRIPTED_GENERATORS`.

**Livrable L.1** : un PnR + branches réactives définies à la main dans l'état
se relit automatiquement quand on change la couverture défensive. Vérifiable
par test d'intégration + golden snapshot (3 couvertures → 3 séquences).

---

## Phase L.2 — UI ✅ LIVRÉ 2026-05-29

> Bouton « 🤖 lectures auto » sur les actions-écran (porteur+poseur renseignés)
> → insère les branches canoniques via `buildCanonicalReadBranches` +
> `addScenarioBranches` (recompile groupé). Onglets de branche réactive marqués
> 🤖 + puce de couverture ; badge « 🤖 Lecture auto : … » quand une branche
> s'auto-active. `addScenarioBranch(es)` recompile si la branche a un `trigger`.
> +3 tests transforms. Suite complète verte (1848).

### L.2.1 — Éditeur de déclencheur dans `ScenarioPanel`
- À la création/édition d'une branche : sélecteur de déclencheur =
  puces de couverture (Drop/Hedge/Switch/Blitz/Ice/Over/Under) ou « Manuel ».
- Bouton « + Insérer les lectures standard » → injecte les presets de
  `readLibrary.ts` pour l'action-écran sélectionnée (crée N branches réactives
  d'un coup).

### L.2.2 — Badge de lecture active
- Overlay terrain / timeline : `Lecture : DROP → pocket pass`, depuis
  `resolvedReadBranchId` + le `label` de la branche.
- Se met à jour en live quand le coach change la couverture défensive.

**Livrable L.2** : workflow complet coach. Construire l'entrée une fois,
toggler la défense, voir l'offense se relire + badge explicite.

---

## Phase L.3 — Extensions (futur, hors V1)

- **Lectures hors PnR** : drive-and-kick (aide corner → skip ; aide nail →
  drop-off), backdoor sur deny. Nécessite un `ReadTrigger.kind: 'help-source'`
  / `'deny'` et une détection d'origine d'aide.
- **Arbres multi-niveaux** (sous-branches).
- **Lecture probabiliste** (défense joue drop 70 % / blitz 30 %).

---

## Garde-fous transverses

- **Règle 1bis** : resolver lecture seule sur positions défensives. Lancer
  `screens*` + `overlap*` + `userJson*` + `screenLab*` avant chaque commit qui
  touche `screens/` ou la compilation.
- **Rétrocompat** : branches sans `trigger` = comportement V1 strict. Snapshots
  golden existants doivent rester verts.
- **TS strict** + commit/push après chaque sous-phase testable (Règle 2).

## Estimation grossière

| Phase | Contenu | Effort |
|---|---|---|
| L.0 | Noyau pur + refactor helper couverture | ~0.5-1 j |
| L.1 | Câblage + readLibrary + golden | ~0.5 j |
| L.2 | UI éditeur + badge | ~0.5-1 j |
| L.3 | Extensions hors PnR | reporté |

Total V1 (L.0→L.2) : ~1.5-2.5 j. Fort levier produit.
