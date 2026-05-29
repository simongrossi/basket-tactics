# Plan — Offense en lecture réactive (read-based offense)

**Date** : 2026-05-29
**Spec** : [2026-05-29-offense-lecture-reactive-design.md](../specs/2026-05-29-offense-lecture-reactive-design.md)
**Chantier** : Phase L (basket P1). Saut « tableau animé » → « simulateur tactique ».

Principe directeur : **réutiliser** le système de branches (`ScenarioBranch`) et
la couverture défensive déjà calculée (`OnScreenNav` / `detectScreen`). On
n'ajoute pas de moteur ; on relie deux briques existantes. Chaque phase est
livrable, testée, commit + push (Règle 2).

---

## Phase L.0 — Noyau pur (types + résolution), aucun UI

**But** : tout le calcul de lecture en pur, testable sans React, sans toucher
au rendu ni à la compilation.

### L.0.1 — Helper partagé de couverture effective
- Fichier : `src/lib/logic/screens/effectiveScreenNav.ts` (nouveau).
- `effectiveScreenNav(state, screenerDef: DefenderId): OnScreenNav` :
  retourne `rules[screenerDef].screenNav` si ≠ `'auto'`, sinon le `screenRule`
  global de `state`.
- **Refactor** : faire consommer ce helper par `carrierScreenAdjust` (qui
  recalcule aujourd'hui cette priorité en interne) → source unique. Vérifier la
  parité par les tests `screens*` existants (aucune régression attendue).
- Tests : `effectiveScreenNav.test.ts` (override prime, fallback global, 'auto').

### L.0.2 — Types
- `src/lib/types/index.ts` :
  - ajouter `interface ReadTrigger { kind: 'screen-coverage'; actionId: string; coverage: OnScreenNav[] }`.
  - ajouter `trigger?: ReadTrigger` à `ScenarioBranch`.
  - ajouter `resolvedReadBranchId?: string | null` à l'`AppState` (transient).
- Aucune valeur par défaut, additif pur.

### L.0.3 — Résolution de couverture
- Fichier : `src/lib/logic/reads/resolveCoverage.ts` (nouveau dossier `reads/`).
- `resolveScreenCoverage(state, atStepIdx): OnScreenNav | null` :
  `detectScreen` au step → `screenerDef` → `effectiveScreenNav`. `null` si pas
  d'écran. Réutilise les mêmes args que le pipeline défensif (matchups,
  positions défenseurs au step).
- Tests : `reads/__tests__/resolveCoverage.test.ts`.

### L.0.4 — Sélection de branche
- Fichier : `src/lib/logic/reads/selectReactiveBranch.ts` (nouveau).
- `selectReactiveBranch(state): { branch: ScenarioBranch | null }` :
  manuel (`activeBranchId`) prime ; sinon compile chemin principal seul,
  récupère `parentRanges[trigger.actionId].endIndex`, résout la couverture,
  premier `coverage.includes(...)` gagne.
- ⚠️ `compileScenario` ne renvoie pas `parentRanges` aujourd'hui. Deux options :
  (a) exporter une fonction interne `compileMainPathWithRanges` ; ou
  (b) recalculer le range via les `generatedBy` des steps. **Choisir (a)** :
  extraire la passe 1 de `compileScenario` en helper renvoyant
  `{ steps, parentRanges }`. Refactor sans changement de comportement.
- Tests : `reads/__tests__/selectReactiveBranch.test.ts`.

**Livrable L.0** : noyau pur + tests verts. Rien de visible côté app encore.

---

## Phase L.1 — Câblage compilation + bibliothèque de lectures

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

## Phase L.2 — UI

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
