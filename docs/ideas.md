## Idées en réserve (pour V2 / plus tard)

Notes prises au fil de l'eau d'idées valides mais non prioritaires.
Quand une idée mûrit, la déplacer dans [`etat-avancement.md`](./etat-avancement.md) > "À faire" et créer un plan.

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
