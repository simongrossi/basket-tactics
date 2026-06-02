# Auto-replacement (motion offense, sous-projet B) — Design

> **Chantier** : Motion offense — sous-projet **B (replacement / relocate)**.
> Suite de la continuity offense (sous-projet A, livré 2026-06-02). Le
> sous-projet C (ball reversal / DHO chain) fera l'objet d'un spec séparé.

## But

Empêcher le **spacing de se vider** : quand un cut ou un drive quitte un spot du
périmètre, une **cascade de fill** comble la zone (drift/lift réels du basket).
Aujourd'hui les générateurs `drift`/`lift`/`replacement` existent mais sont
**manuels** (le coach pose une action et désigne qui bouge) ; l'audit (IDEAS §2,
FIBA roadmap « à déclencher auto pendant drive/cut ») demande le déclenchement
**automatique**. C'est le complément direct de la continuity : une boucle de
motion dont le spacing ne se dégrade pas.

## Décisions de cadrage (brainstorming 2026-06-02)

| # | Question | Décision |
|---|---|---|
| 1 | Sous-projet | **B (replacement/relocate)**, traité complet (cut + drive, cascade) |
| 2 | Modèle de fill | **Chaîne de fill (cascade)** bornée (vs fill simple / re-spacing global) |
| 3 | Règle de cascade | **Rang périmètre — fill from behind** (même côté, plus loin du panier) |
| 4 | Timing | **Concurrent** : fillers fusionnés dans le step du cut (vs step séparé) |

## Architecture

**Principe : enrichissement au compile-time, dans la passe 1 de
`compileScenario`.** Juste après le générateur d'une action *déclencheuse*, on
calcule la cascade de fill et on **fusionne les positions des fillers dans le
step généré** (concurrent). Aucun step ajouté.

**Pourquoi dans la passe 1** (et non un post-pass sur `steps`) : à cet endroit on
connaît directement `action.type` (déclencheur ?) et `prev.off` (positions AVANT
le cut = spot vidé). Pas de reconstruction depuis les annotations.

### Modèle de données (opt-in)

```typescript
// AppState
/** Phase Motion — auto-replacement : quand un cut/drive vide un spot, la cascade
 *  de fill comble le périmètre. undefined = off (legacy déterministe). */
autoReplacementEnabled?: boolean;
/** Profondeur max de la cascade (nb de maillons). Défaut 2, clampé 1…4. */
autoReplacementDepth?: number;
```

### Module pur `src/lib/logic/autoOffense/autoReplacement.ts`

- `isReplacementTrigger(type: string): boolean` — vrai pour le trigger set.
- `replacementCutterId(action: OffensiveScriptedAction): AttackerId | null` —
  `params.cutter` (cuts), `params.giver` (give-and-go), `params.driver` (drive).
- `computeReplacementChain(prevOff, cutterId, ballCarrierId, active, depth)` →
  `Array<{ player: AttackerId; target: Point }>` (la cascade).
- `applyReplacementToStep(step, relocations)` → nouveau step avec positions
  fusionnées, **chaque cible passée par `pushOutOfMany(target, autres,
  PLAYER_MIN_CLEARANCE_PX)`** (Règle 1).

### Câblage `compileScenario` (passe 1)

```
gen(prev, action) → generated[]
if (autoReplacementEnabled && isReplacementTrigger(action.type)):
   cutterId = replacementCutterId(action)
   if (cutterId):
     chain = computeReplacementChain(prev.off, cutterId, prev.ballCarrier,
                                     getActiveAttackerIds(playerCount), depth)
     // fillers atteignent leur spot en fin d'action (dernier step généré) ;
     // breakUpTeleports interpole le mouvement → concurrent et fluide
     generated[last] = applyReplacementToStep(generated[last], chain)
```

`breakUpTeleports` + `smoothMovementFlickers` + push-out défensif tournent
ensuite normalement → lissage et clearance garantis. **Défense inchangée** (suit
son homme via `assignmentOverrides`). **Continuity** : la passe 1 itère la liste
déroulée, donc le fill se reproduit à chaque cycle.

## L'algorithme de cascade

**Règle : fill from behind.** Le spot vidé est comblé par le coéquipier **du même
côté, positionné plus loin du panier** (plus haut), le plus proche du spot. Sa
propre place devient le spot vidé suivant → cascade.

```
computeReplacementChain(prevOff, cutterId, ballCarrierId, active, depth):
  relocations = []
  vacated  = prevOff[cutterId]
  excluded = { cutterId, ballCarrierId }   // le porteur ne comble jamais
  for d in 0 … clamp(depth,1,4)-1:
    filler = pickFiller(prevOff, vacated, excluded)
    if !filler: break
    relocations.push({ player: filler, target: vacated })
    excluded.add(filler)
    vacated = prevOff[filler]
  return relocations
```

**`pickFiller(prevOff, vacated, excluded)`** :
- candidats = attaquants actifs ∉ `excluded`,
- **même côté** : `sign(cand.x − COURT_CENTERLINE_X) === sign(vacated.x − COURT_CENTERLINE_X)`
  (`COURT_CENTERLINE_X = 300`),
- **plus loin du panier** : `dist(cand, HOOP) > dist(vacated, HOOP)` (`HOOP = {300,75}`),
- parmi eux, le **plus proche** de `vacated` (distance euclidienne minimale),
- aucun candidat → `null` (cascade s'arrête, profondeur réelle < max).

**Propriétés** : déterministe (tri stable, aucune RNG) ; borné (depth + arrêt
naturel) ; pas de doublon (`excluded` grossit) ; clearance explicite dans
`applyReplacementToStep`.

**Cas limites** : cutter introuvable / spot dégénéré → `[]` (no-op). Cut depuis
le top (personne plus haut du même côté) → chaîne vide, cut inchangé.

## UI (ScenarioPanel)

Sous la section continuité, visible dès qu'une **action déclencheuse** existe
dans le chemin :

- **Toggle opt-in** `↪ Auto-replacement (maintien du spacing)`.
- **Profondeur** : input numérique 1–4 (défaut 2).
- Récap court : `Fill auto : cascade prof. {depth} sur cut/drive`.

### State / câblage (pattern Phase L / continuity)

- **Transform** (`scenarioTransforms.ts`) :
  `setAutoReplacement(s, enabled, depth)` → pose les 2 champs + `recompileScenarioSteps`.
- **Callback** `useAppState.ts` : `setAutoReplacement`.
- **Câblage** `page.tsx` → props `ScenarioPanel`.

## Tests (TDD)

- **`autoOffense/__tests__/autoReplacement.test.ts`** :
  - `isReplacementTrigger` (trigger set vrai, autres faux) ; `replacementCutterId`
    (cutter / giver / driver selon type, null sinon).
  - `pickFiller` : même côté, plus loin du panier, exclusions, null si personne.
  - `computeReplacementChain` : fill simple (prof. 1), cascade prof. 2, arrêt
    naturel, porteur exclu, clamp profondeur (99 → 4, 0 → 1).
  - `applyReplacementToStep` : positions fusionnées ; deux cibles proches →
    séparées d'au moins `PLAYER_MIN_CLEARANCE_PX` (clearance).
- **`overlapInvariants.test.ts`** : après auto-replacement sur un scénario, toutes
  les paires de joueurs respectent `PLAYER_MIN_CLEARANCE_PX`.
- **Intégration `compileScenario`** : basket-cut + `autoReplacementEnabled` →
  un filler a bougé dans le step du cut ; sans le flag → 0 diff (rétrocompat).
- **Suites garde-fou** `overlap screens userJson screenLab` vertes.
- **Suite complète** verte (départ 1996).

## Rollout & rétrocompat

- Opt-in : `autoReplacementEnabled === undefined` → `isReplacementTrigger` jamais
  consulté, 0 changement de comportement.
- Pas de migration de données.

## Docs à mettre à jour à la livraison

- `CHANGELOG.md` — section Unreleased.
- `ROADMAP.md` / `IDEAS.md §2` — sous-projet B livré (reversal/DHO restant).
- `docs/fiba-actions-roadmap.md` — Drift / Lift / Replacement : désormais
  auto-déclenchables sur cut/drive.
- `docs/GAME-ENGINE.md` — note auto-replacement dans la passe 1 offensive.
- `docs/todo-priorities.md` — section Livrés.

## Hors scope (extensions / sous-projets ultérieurs)

- **Ball reversal / DHO chain** — sous-projet C (spec séparé).
- Re-spacing global optimal (option 2 rejetée au profit de la cascade).
- Fill par **slots nommés** (pas de système de slots dans le moteur).
- Cascade au-delà de profondeur 4.
- Fill ciblant un spot **spacing-optimal** (corner bonus) plutôt que le spot vidé
  exact — évolution possible via `computeOffBallPositions`.
