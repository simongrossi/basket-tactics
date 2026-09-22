> ⚠️ **Archive — non tenue à jour depuis le 2026-05-11.** L'état et les priorités
> actuels vivent dans [ROADMAP.md § Priorité actuelle](../ROADMAP.md) et
> [PLAN-COACH.md](../PLAN-COACH.md) ; l'historique dans
> [CHANGELOG.md](../CHANGELOG.md). Conservé pour les décisions passées.

## Idées en réserve (pour V2 / plus tard)

Notes prises au fil de l'eau d'idées valides mais non prioritaires.
Quand une idée mûrit, la déplacer dans [`etat-avancement.md`](./etat-avancement.md) > "À faire" et créer un plan.

---

### Timecode absolu sur la timeline (24s + montée de balle)

Aujourd'hui la timeline est en unités d'étapes (pas de notion de temps réel).
**Idée** : afficher un timecode en secondes au-dessus de la timeline (ex : 0:00, 0:05, 0:10...) basé sur une durée par étape configurable.
Une possession FIBA c'est 24 secondes + ~6-8s pour monter la balle → timeline totale plafonnée à ~30s.
- Permet d'évaluer si un système est temporellement réaliste
- Aide à caler les timings tStart/tEnd avec une intuition concrète
- Possibilité d'ajouter un compte à rebours visuel pendant la lecture

**Workload** : ~1 session (timecode UI au-dessus de Timeline + champ `secondsPerStep` dans AppState).

---

### Phase "début / fin" sur les annotations de mouvement

Aujourd'hui, dessiner un écran/cut/dribble de A à B sur l'étape N signifie
"le joueur se déplace de A à B PENDANT l'étape N — il arrive à B à la FIN".
L'écran est donc effectif à partir de l'étape N+1 (quand le défenseur passe).

**Idée** : permettre à l'utilisateur de choisir au moment du dessin :
- **Fin d'action** (actuel) : le joueur se déplace, arrive à destination en fin
- **Début d'action** : le joueur est déjà à destination DÈS le début de l'étape

Cas d'usage : poser un écran "déjà actif" à l'étape N. L'étape N-1 est mise
à jour rétroactivement pour que le poseur soit déjà à la destination, et
le défenseur subit l'écran pendant l'étape N quand il tente de suivre le porteur.

**Implémentation** :
- Nouveau champ optionnel `Annotation.phase: 'start' | 'end'` (default 'end')
- UI : modal/toggle quand l'utilisateur dessine, ou clic-droit sur l'annotation
- Logique : si phase='start', `upsertMovementAnnotation` met à jour Step[N-1].off
- Indicateur visuel : annotation en pointillés différents si phase='start'

**Workload estimé** : 1-2 sessions.

---

### Affichage simultané des variantes (split view)

Lié à l'Étape 7 (branches manuelles). Aujourd'hui une seule variante est active à la fois.

**Idée** : pouvoir afficher 2 (ou plus) variantes côte à côte pour comparer visuellement les lectures. Utile en présentation à des joueurs : "voici ce qui se passe si la défense drop, voici ce qui se passe si elle switch".

**Pistes d'implémentation** :
- Mode "split view" dans `CourtView` avec 2 terrains synchronisés temporellement
- Sélecteur multi-checkbox des variantes à comparer
- Une seule timeline globale qui scrubbe toutes les variantes en parallèle
- Métriques affichées par variante côte à côte

**Workload estimé** : 1 grosse session (refonte du layout central + sync de plusieurs animations).

---

### Branches automatiques (réactives)

Lié à l'Étape 7. Aujourd'hui les variantes sont des présets manuels — le coach choisit laquelle voir.

**Idée** : que le compilateur évalue la défense calculée après chaque action et choisisse automatiquement la branche qui matche un read (`read-drop-pullup`, `read-switch-postup`, etc.).

**Difficulté** : chicken-and-egg — la défense dépend des steps, les steps dépendent de la branche choisie qui dépend de la défense. Nécessite probablement une boucle d'évaluation incrémentale.

**Workload estimé** : 5-6 sessions (compilateur récursif + UI tree-edit + tests intensifs).

---

### Popup timeline multi-pistes par joueur

Inspiré de FastDraw. Une popup affichant une timeline horizontale avec une piste par joueur (5 attaquants + 5 défenseurs), chaque piste montrant les segments de mouvement / passes / écrans avec leur durée précise.

Permettrait au coach de voir d'un coup d'œil le découpage temporel de chaque joueur, qui bouge quand, et le synchronisme entre actions.

À placer **en plus** de la timeline globale actuelle, pas en remplacement.

---

### Mode "présentation projetée"

Police plus grosse, contrastes augmentés, plus de UI superflue. Pour vidéoprojeter le tableau tactique devant les joueurs.
