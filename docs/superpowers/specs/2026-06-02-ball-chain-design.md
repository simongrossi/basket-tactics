# Ball-chain — reversal & DHO chain (motion sous-projet C) — Design

> **Chantier** : Motion offense — sous-projet **C (ball reversal / DHO chain)**.
> Dernier des trois sous-projets motion (A continuité + B auto-replacement livrés
> 2026-06-02). Avec C, l'axe motion est complet.

## But

Modéliser le **renversement de balle** (swing guard-to-guard, 2-3 passes côté
faible) et les **chaînes de hand-offs** (DHO enchaînés) — aujourd'hui impossibles
car les générateurs `pass`/`hand-off` sont mono-lien. C est de la **composition** :
router le ballon à travers une suite ordonnée de joueurs.

## Décisions de cadrage (brainstorming 2026-06-02)

| # | Question | Décision |
|---|---|---|
| 1 | Modèle | **Chaîne unifiée** : une primitive « ballon traverse une liste, mode par lien (pass/dho) » ; 2 types presets par-dessus |
| 2 | Spécification | **Liste explicite** (vs auto-route) + mode par lien |

## Architecture

**Principe : expander pur.** La chaîne se déroule en steps en déléguant **chaque
lien** à la géométrie un-lien existante (`genPass` ou `genHandOff`), en threadant
l'état (`prev` → step du lien → `prev` suivant). Aucune nouvelle géométrie de
passe / hand-off.

### Nouveaux types d'action

Dans `ScriptedActionType` (section « Combinations ») :
- `ball-reversal` — preset tout-passe.
- `dho-chain` — preset tout-DHO.

### Params (ajouts à `ScriptedActionParams`)

```typescript
/** Phase Motion C — suite ordonnée de joueurs que le ballon traverse (≥ 2). */
chain?: AttackerId[];
/** Mode de chaque lien (longueur = chain.length − 1). Absent / plus court →
 *  les liens manquants prennent le mode global du preset. */
chainLinkModes?: ('pass' | 'dho')[];
```

### Module `src/lib/logic/scriptedGenerators/ballChain.ts` (créer)

- `expandBallChain(prev, action, defaultMode)` → `Step[]`.
- `genBallReversal = (prev, action) => expandBallChain(prev, action, 'pass')`.
- `genDhoChain = (prev, action) => expandBallChain(prev, action, 'dho')`.

Enregistrés dans `SCRIPTED_GENERATORS`. `genPass`/`genHandOff` sont **déjà
exportés** depuis `tier1.ts` (bloc `export { … }`) → l'expander les importe
directement (pas de passage par la table → aucun cycle d'import).

### Intégration moteur

Actions offensives normales : composent avec la continuity (déroulées par cycle),
passent les passes 1/2 + `breakUpTeleports` + push-out + lissage comme toute
action. L'auto-replacement **ne se déclenche pas** (types `ball-reversal` /
`dho-chain` absents du trigger set — un renversement ne vide pas un spot).

## L'expander (géométrie par lien & threading)

```
expandBallChain(prev, action, defaultMode):
  chain = action.params.chain
  if !chain || chain.length < 2: return []          // no-op (comme les autres gen)
  modes = action.params.chainLinkModes
  steps = []
  cur = prev
  for i in 0 … chain.length-2:
    a = chain[i]; b = chain[i+1]
    mode = modes?.[i] ?? defaultMode
    sub = mode === 'dho'
      ? { kind:'offensive', id:`${action.id}#l${i}`, type:'hand-off', params:{ giver:a, receiver:b } }
      : { kind:'offensive', id:`${action.id}#l${i}`, type:'pass',     params:{ from:a,  to:b } }
    linkSteps = mode === 'dho' ? genHandOff(cur, sub) : genPass(cur, sub)
    steps.push(...linkSteps)
    if (linkSteps.length) cur = linkSteps[linkSteps.length-1]   // thread
  return steps
```

**Trois points clés :**

1. **Threading du ballon** — `genPass` pose `ballCarrier = to`, `genHandOff` pose
   `ballCarrier = receiver`. Le ballon avance de lien en lien (`cur` = dernier
   step du lien précédent). Le porteur de départ est `chain[0]`.

2. **Namespacing `generatedBy`** — chaque lien reçoit `id = ${action.id}#l${i}` ;
   ses steps portent `generatedBy = ${action.id}#l${i}` (les générateurs stampent
   depuis `action.id`). Préservation des `manualOverride` **par lien**, comme les
   cycles `#cK` de la continuité.

3. **Annotations & lissage** — héritées de `genPass`/`genHandOff` (flèches passe,
   dribble, cut). `breakUpTeleports` + push-out tournent après → clearance et
   fluidité garanties, **Règle 1** couverte sans code dédié.

**Cas limites** : `chain` absent / < 2 → `[]`. `chainLinkModes` plus court que
les liens → fallback `defaultMode` (`?.[i] ?? defaultMode`). Un lien dont le
générateur renvoie `[]` (params dégénérés) est sauté sans casser le thread.

## UI (ActionForm)

**Catalogue** : deux entrées dans `SCRIPTED_ACTIONS_CATALOG` (section
Combinations), `requiredParams: ['chain']`, nouveau `ParamKind: 'chain'` :
- `ball-reversal` — label « Renversement (ball reversal) ».
- `dho-chain` — label « Chaîne de DHO ».

**Éditeur de chaîne** (rendu dans `ActionForm` quand un param `chain` est requis) :
- liste ordonnée de selects de joueurs (la séquence), **+ ajouter** / **× retirer**
  / **↑↓ réordonner** ;
- entre deux maillons, un toggle **passe / DHO** (édite `chainLinkModes[i]`) ;
- défaut : 2 joueurs (les 2 premiers attaquants actifs), mode = celui du preset.

`reader` : décrit la chaîne (« O1 → O2 → O3, passes »).

**Pas de panneau opt-in / flag `AppState`** : ce sont des actions normales, elles
n'agissent que si ajoutées au scénario. Pas de migration.

## Tests (TDD)

- **`scriptedGenerators/__tests__/ballChain.test.ts`** (pur) :
  - reversal tout-passe : `[O1,O2,O3]` → N−1 steps, ballon finit sur `chain[last]`.
  - dho-chain : 2 steps par lien.
  - modes mixtes : `['pass','dho']` produit le bon mix.
  - `chainLinkModes` plus court → liens restants en `defaultMode`.
  - `generatedBy` namespacé `#l0`, `#l1`.
  - `chain` absent / 1 joueur → `[]`.
  - threading : le `ballCarrier` progresse le long de la chaîne.
- **Intégration `compileScenario`** : action `ball-reversal` `[O1,O2,O3]` →
  ballon finit O3 ; steps présents avec `generatedBy` `#lI`.
- **Catalogue** : `SCRIPTED_GENERATORS['ball-reversal']` et `['dho-chain']`
  existent (registration).
- **Garde-fou** `overlap screens userJson screenLab` + suite complète vertes.

## Rollout & rétrocompat

- Purement additif : nouveaux types d'action + nouveau `ParamKind`. Les scénarios
  existants sont inchangés. Pas de migration.

## Docs à mettre à jour à la livraison

- `CHANGELOG.md` — section Unreleased.
- `ROADMAP.md` / `IDEAS.md §2` — sous-projet C livré → **axe motion complet (A+B+C)**.
- `docs/fiba-actions-roadmap.md` — Ball reversal / Flip / Extra pass / Dishing +
  chaîne DHO → ✅ (couverts par la chaîne).
- `docs/GAME-ENGINE.md` — note sur l'expander de chaîne.
- `docs/todo-priorities.md` — section Livrés.

## Hors scope (extensions ultérieures)

- **Auto-route** côté faible (sucre produisant une chaîne branchée sur le même
  expander).
- Déclenchement auto d'**auto-replacement** sur un lien DHO.
- Chaînes > 5 joueurs (le périmètre n'en compte que 5).
- Mode de lien **drive** ou **screen** dans la chaîne (hors reversal/DHO).
