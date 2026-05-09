# Spec — Actions jouées en lecture

**Date** : 2026-05-09
**Statut** : design validé, prêt pour plan d'implémentation
**Approche retenue** : B (annotations + positions synchronisées)

## Contexte et problème

Aujourd'hui, les annotations (`pass` / `dribble` / `cut` / `screen`) dessinées sur une étape sont **purement décoratives** : elles s'affichent au-dessus du terrain mais n'influencent ni la trajectoire ni la position des joueurs en lecture. Pour qu'un joueur "fasse" une action, l'utilisateur doit ajouter un dessin **et** déplacer manuellement le joueur dans l'étape suivante. Les deux gestes sont découplés.

Ce qu'on veut : quand l'utilisateur dessine une action sur l'étape N, en lecture le joueur **exécute** réellement cette action — il dribble le long de la courbe, court le cut, va poser l'écran et tient sa posture.

## Vision retenue

Le modèle mental qu'on adopte (Q3 = c) : **toute mutation de position passe par une annotation**. Drag d'un joueur = création/mise à jour d'une annotation implicite. Une étape contient les annotations qui décrivent **ce que font les joueurs pendant le segment vers l'étape suivante**. Plus de drag "neutre" qui ne raconte rien.

Contrainte (Q4 = a) : **une seule action de mouvement par joueur par étape**. Pour chaîner dribble → écran, on utilise deux étapes.

## Modèle de données

Pas de changement de schéma TypeScript. On garde `Step.off` et `Step.annotations`, mais on resserre le comportement par une **invariante** :

> Pour chaque attaquant O dont la position change entre `Step[N]` et `Step[N+1]`, il existe **exactement une annotation de mouvement** sur `Step[N]` avec `fromId === O`, `from === Step[N].off[O]`, et `to === Step[N+1].off[O]`.

- **Annotations de mouvement** : `cut | dribble | screen`.
- `pass` est **non-mouvement** (ne participe pas à l'invariante, peut coexister avec un mouvement du même joueur).
- Si un joueur n'a **aucune** annotation de mouvement sur `Step[N]`, alors `Step[N+1].off[O] === Step[N].off[O]` (joueur immobile).

`Step.off` reste sérialisé tel quel. L'invariante est maintenue par construction via une API de mutation unique (section suivante).

## API de mutation

Nouveau module : `src/lib/logic/stepMutations.ts`. Devient **le seul point** où on mute `Step.off` et `Step.annotations`. Tous les call-sites existants (drag handlers de `CourtView`, outils dribble/cut/screen/pass, ContextMenu, panneau Attaque, raccourcis clavier `Suppr`) sont migrés vers ces helpers.

Fonctions exposées (toutes pures, retournent un nouveau `state`) :

### `setPlayerPositionAt(state, stepIdx, playerId, point)`

Appelée par le drag d'un attaquant à l'étape N.

- `Step[N].off[playerId] = point`.
- Sur `Step[N-1]` (si `N >= 1`) : crée ou met à jour l'annotation de mouvement de ce joueur (son `to`). Type auto :
  - `dribble` si le joueur est porteur sur `Step[N-1]` (Q6 = a).
  - `cut` sinon.
  - L'éventuel `screen` existant est conservé (on ne reclassifie pas un écran en cut).
- Sur `Step[N]` (si `N < last`) : recale le `from` de l'éventuelle annotation de mouvement de ce joueur (cohérence aval).

À l'étape 0, comme il n'y a pas d'étape précédente, aucune annotation n'est créée — c'est juste du repositionnement initial.

### `upsertMovementAnnotation(state, stepIdx, anno)`

Appelée par les outils `dribble` / `cut` / `screen` quand l'utilisateur trace explicitement.

- `anno.from` est snappé à `Step[stepIdx].off[anno.fromId]`.
- Toute annotation de mouvement existante du même `fromId` sur `Step[stepIdx]` est **remplacée** (contrainte 1/joueur/étape).
- `Step[stepIdx + 1].off[anno.fromId] = anno.to` (si `stepIdx < last`).
- Si une annotation de mouvement existe sur `Step[stepIdx + 1]` pour ce joueur, son `from` est recalé à `anno.to`.

### `upsertPassAnnotation(state, stepIdx, anno)`

Pour `type === 'pass'`. Pas de contrainte d'unicité (un joueur peut potentiellement faire plusieurs passes ? en pratique une seule). Pas d'effet sur `Step.off`. Sépare les chemins pour clarté.

### `removeAnnotation(state, stepIdx, annoIdx)`

- Si annotation de mouvement : `Step[stepIdx + 1].off[player] = Step[stepIdx].off[player]` (le joueur "annule son mouvement").
- Cascade : si une annotation de mouvement existe sur `Step[stepIdx + 1]` pour ce joueur, son `from` est recalé.
- Si annotation `pass` : suppression simple, pas d'effet sur les positions.

### `setAnnotationType(state, stepIdx, annoIdx, newType)`

Change le type sans toucher aux endpoints. Si on passe de `pass` à un type de mouvement (ou inverse), les invariantes correspondantes sont maintenues (peut nécessiter de retirer une autre annotation de mouvement existante).

## Lecture (playback / scrub)

Dans `CourtView.tsx`, le tick d'animation et le scrub appellent aujourd'hui une interpolation linéaire commune. On introduit un dispatcher :

```
attackerTrajectoryAt(stepIdx, playerId, localT) → Point
```

Qui regarde l'annotation de mouvement de ce joueur sur `Step[stepIdx]` et dispatche :

| Annotation de mouvement | Trajectoire pendant `Step[N] → Step[N+1]` |
|---|---|
| **aucune** (le joueur peut quand même avoir une `pass`) | immobile à `Step[N].off[player]` (= `Step[N+1].off[player]` par invariante) |
| **`cut`** | ligne droite A→B + évitement d'obstacles existant (curveAroundObstacle, staggered) |
| **`dribble`** | suit le tracé ondulé. La fonction `dribblePath` actuelle de `Annotations.tsx` est généralisée pour échantillonner à un `localT ∈ [0,1]` (extraction en utilitaire `sampleDribbleWave(from, to, t)`) |
| **`screen`** | `localT < 0.5` : linéaire A→B à `t' = localT * 2` (arrive en B à mi-segment) ; `localT >= 0.5` : pinned en B + flag `isScreening = true` passé au `Player` |

L'évitement d'obstacles reste appliqué pour `cut` uniquement. Pour `dribble`, on suit le chemin tel que dessiné. Pour `screen`, la trajectoire est courte et délibérée — pas d'évitement.

### Posture d'écran

Quand `isScreening === true`, le rendu `Player` :
- gaze face au défenseur du porteur (calculable depuis `frame.screen` détecté par `detectScreen`).
- bras inchangés (Design F figé — règle inviolable de la mémoire utilisateur, on ne touche pas au tracé Bezier).
- pas de bobbing, statique.

L'orientation du regard suit déjà la logique `clamp ±90° du corps` côté `orientation.ts` ; on ajoute juste l'override "regarde le défenseur du porteur" quand `isScreening`.

## Drag UX et outils

**Outil "move"** (drag) :
- Le drag handler de `CourtView` route vers `setPlayerPositionAt` au lieu d'écrire directement dans `Step.off`.
- Étape 0 : pas d'annotation créée, juste reposition initiale.
- Étape ≥ 1 : crée/met à jour l'annotation sur l'étape précédente. Type auto selon ball-carrier.

**Outils explicites** (`dribble`, `cut`, `screen`) : tracer une annotation passe par `upsertMovementAnnotation`. Remplace l'éventuelle annotation de mouvement existante du même joueur.

**Outil `pass`** : passe par `upsertPassAnnotation`. Pas d'effet sur les positions.

**Suppression** (clic-droit "effacer", panneau Attaque, `Suppr`) : passe par `removeAnnotation`.

## Migration legacy

Les scénarios existants (templates, scripted actions compilées, localStorage) ont des `Step.off` qui bougent **sans annotations correspondantes**. On auto-génère.

```ts
ensureAnnotationsForMovement(steps, ballCarrierByStep, playerCount): Step[]
```

Pour chaque transition `Step[N] → Step[N+1]` et chaque attaquant actif O :
- si `dist(Step[N].off[O], Step[N+1].off[O]) > 0.5px`,
- et qu'aucune annotation de mouvement de O n'existe déjà sur `Step[N]`,
- alors générer `{ type: O === ballCarrierByStep[N] ? 'dribble' : 'cut', fromId: O, from: Step[N].off[O], to: Step[N+1].off[O] }`.

Idempotente. Ne touche jamais aux annotations existantes.

**Points d'appel** :
- Chargement de template depuis `templates.ts` (LibraryModal / LibraryPanel).
- Sortie de `compileScenario.ts` (juste avant retour `Step[]`).
- Réhydratation localStorage dans `useAppState`.

**Heuristique** : pas de détection auto de `screen` — trop ambigu (un joueur qui s'arrête près d'un autre n'est pas forcément un poseur). Les écrans des templates existants seront migrés en `cut` ; la lecture sera correcte spatialement mais sans le hold posture-écran. Pour les avoir, soit retoucher le template manuellement, soit faire évoluer `compileScenario.ts` pour émettre des `screen` explicites (suivi prochain, hors scope).

## Tests

Nouveaux fichiers Vitest :

- `src/lib/logic/__tests__/stepMutations.test.ts`
  - Chaque mutation préserve l'invariante.
  - Drag à l'étape 0 ne crée pas d'annotation.
  - Drag à l'étape N crée annotation `dribble` si porteur, `cut` sinon.
  - `upsertMovementAnnotation` remplace l'annotation existante du même joueur.
  - `removeAnnotation` snap-back la position et cascade le `from` aval.
  - `setAnnotationType` cohérent.

- `src/lib/logic/__tests__/migration.test.ts`
  - `ensureAnnotationsForMovement` génère le bon type selon ball-carrier.
  - Idempotente.
  - Ne touche pas aux annotations existantes.

- `src/lib/logic/__tests__/playback-trajectory.test.ts`
  - `cut` : interpolation linéaire à `t=0.5` est mid-point.
  - `dribble` : à `t=0.5`, position sur la wave (offset latéral non nul).
  - `screen` : à `t=0.5`, position = `to` ; à `t=0.75`, position = `to` (pinned).
  - Pas d'annotation : position constante.

**Tests existants** : ceux qui inspectent `Step[].off` après `compileScenario` verront maintenant des annotations supplémentaires. Pas de régression de comportement engine attendue (les annotations n'influencent pas le moteur défensif).

## Hors scope explicite (YAGNI)

- **Tracés en courbe** pour les annotations — futur explicitement mentionné par l'utilisateur, pas dans cette itération. La structure du dispatcher accepte facilement l'évolution (ajout d'un champ `path?: BezierControls` sur l'annotation).
- **Actions chaînées** par joueur dans une étape — Q4 = a, contrainte explicite "1 mouvement par joueur par étape".
- **Annotations sur les défenseurs** — la défense reste 100% pilotée par l'engine (man/zone/triggers). Pas d'interface annotation côté défense.
- **`compileScenario.ts` qui émet des `screen` explicites** — la heuristique de migration `cut` suffit pour Phase 1. Évolution prévue ensuite pour que les actions FIBA scriptées (pick-and-roll, pin-down, etc.) marquent leurs poseurs comme `screen` plutôt que `cut`.
- **Détection auto d'écran à la migration** — trop ambigu, écarté.

## Risques

- **Désynchro `Step.off` ↔ `annotations`** si une mutation contourne le helper. Mitigation : grep exhaustif pour tous les `setState` / `state.steps[i].off =` / `step.annotations.push` et routage via `stepMutations`. Tests d'invariante exécutés au runtime en mode dev (assertion).
- **Cascade de suppression** sur de longues chaînes : retirer un mouvement décale l'étape aval, qui décale l'étape suivante. Tests dédiés sur chaînes ≥ 3 étapes.
- **Étape 0 sans annotations** : légitime (état initial brut). Le dispatcher gère naturellement (`aucune annotation` → immobile). La migration ne génère pas d'annotation sur l'étape 0 (il n'y a pas de N-1).
- **Templates de bibliothèque qui contiennent déjà des annotations** : ils sont rares mais existent. La migration est idempotente et ne touche pas aux annotations existantes — donc pas de risque d'écrasement.

## Critères de succès

1. Dessiner un dribble O1 A→B sur étape 1, puis lecture : O1 part de A, suit la wave, arrive en B à la fin du segment vers étape 2.
2. Dessiner un écran O5 A→B sur étape 1, puis lecture : O5 atteint B à mi-segment, reste planté en posture d'écran le reste du temps.
3. Dragger un joueur d'étape en étape sans toucher aux outils : annotation créée automatiquement (cut ou dribble selon porteur), visible dans le panneau Attaque.
4. Charger un template legacy (Spain PNR, Floppy) : annotations auto-générées, la lecture reproduit fidèlement les déplacements existants (sans régression).
5. Supprimer une annotation au milieu d'un scénario : le joueur snap-back à sa position initiale, cascade gérée, invariante préservée.
6. Tous les tests Vitest existants passent + nouveaux tests verts.
