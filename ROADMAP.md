# Roadmap

Vision produit forward-looking. Pour le détail des changements déjà livrés et le backlog technique fin, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## Livré récemment (mai 2026)

- 🟢 **Raccourcis clavier** — [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md)
- 🟢 **Tests unitaires Vitest** — 48 tests sur engine / screens / metrics / help, [docs/testing.md](docs/testing.md)
- 🟢 **Closeout dynamique v1** — bump de vitesse ×1.4 + flag `closingOut` + anneau orange sur le défenseur du nouveau porteur. Cf. [docs/logique-defensive.md § Closeout dynamique](docs/logique-defensive.md#closeout-dynamique)
- 🟢 **Menu contextuel attaquant** — clic-droit sur un attaquant : marquer porteur, forcer comme poseur d'écran (override `detectScreen`), effacer ses annotations. Cadenas violet sur le joueur quand forcé.
- 🟢 **Strong-side denial automatique** — sans trigger, un défenseur strong-side proche du ballon glisse vers la ligne de passe (denial passif), intensité proportionnelle à la proximité. Cf. [docs/logique-defensive.md § Strong-side denial](docs/logique-defensive.md#strong-side-denial-automatique)

---

## 1. Logique basket (simulation)

Le moteur est solide sur le placement statique. Les chantiers ci-dessous visent le réalisme **dynamique** (urgence, transitions, séquences).

### 🟢 Closeout dynamique (v1)
Implémenté : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `maxSpeed × 1.4` sur la transition + flag `closingOut: true`. Anneau orange visible dans `Player`. Détails : [docs/logique-defensive.md](docs/logique-defensive.md#closeout-dynamique).

⚪ **À venir v2** : modélisation de l'over-closeout (attaquant qui drive sur un défenseur arrivé trop vite). En attente d'un trigger de drive consolidé sur l'étape.

### 🟢 Strong-side denial (v1 — automatique)
Implémenté dans `help.ts` : quand pas de trigger actif + défenseur strong-side + attaquant à <250px du ballon + `priority !== 'paint'`, glissement vers la ligne de passe avec intensité proportionnelle à la proximité (`denyFactor` jusqu'à 0.45). Détails : [docs/logique-defensive.md § Strong-side denial automatique](docs/logique-defensive.md#strong-side-denial-automatique).

⚪ **À venir v2** : indicateur visuel dédié (différencier le ring "denial" du ring "help" actuel) ; tunable `denyAggressiveness` global ou par règle.

### ⚪ Staggered screens (séquençage d'écrans multiples)
`curveAroundObstacle` ne contourne aujourd'hui qu'un seul obstacle prioritaire (le porteur). Étendre à des trajectoires d'évitement à travers plusieurs poseurs successifs, en triant par proximité au segment direct.

### ⚪ Stunt and recover
Hors-ballon : un pas vers le porteur pour le dissuader de driver, puis recovery rapide sur son homme. Variante du hedge sans contact d'écran.

### ⚪ Trap en corner / sideline
Prise à deux automatique dès que le porteur entre dans une zone de "trappe" (coins, ligne de touche), sans dépendre d'un écran. Définir des polygones de trigger.

### ⚪ Inversion du panier de référence (transition)
Le mode `fullCourt` existe (terrain entier rendu) mais `HOOP` reste figé à `(300, 75)`. Pour modéliser le repli défensif et la contre-attaque, permettre d'inverser le panier de référence côté défense + bouton "rotation 180°" pour basculer le sens d'attaque.

---

## 2. Interface (UX/UI)

Objectif : réduire la friction lors de la création de systèmes complexes.

### Interactivité & raccourcis

#### ⚪ Saisie numérique sur les sliders
Input numérique en regard des curseurs (distance, maxSpeed, dropDepth) pour saisir une valeur précise sans tâtonner.

#### 🟢 Raccourcis clavier
- `Espace` : play/pause
- `←/→` : étape précédente/suivante
- `M / P / D / R / E` : changement d'outil (move / pass / dribble / cut / écran)
- `Suppr` ou `Backspace` : supprimer la dernière annotation de l'étape active

Implémenté dans `hooks/useKeyboardShortcuts.ts`. Skip auto si le focus est dans un input/textarea/select/contenteditable, ou si une modif (Ctrl/Cmd/Alt) est enfoncée.

#### ⚪ Snap-to-grid
Magnétisme `Ctrl+drag` sur les lignes clés du terrain (ligne 3pt, raquette, blocs bas, homepos zone).

### Visualisation & feedback

#### ⚪ Numérotation des étapes
Petits ronds 1, 2, 3 sur les positions joueurs dans chaque vignette playbook, pour voir l'ordre des actions sans comparer mentalement étape N et N+1. À implémenter dans `StepThumbnail.tsx`.

#### ⚪ Mode fantôme (ghosting)
Afficher en transparence la position des joueurs à l'étape N-1 pendant l'édition de l'étape N, pour visualiser les vecteurs de déplacement.

#### ⚪ Graphique de métriques
Mini-graphique sous la timeline montrant l'évolution de la dangerosité (gap max) ou de la protection de raquette au fil du système. La fonction pure `metrics.ts` est déjà là, il "suffit" de l'évaluer pour chaque step.

### Édition avancée

#### ⚪ Undo / Redo
Stack des `AppState` (max ~50), `Ctrl+Z` / `Ctrl+Y`. À séparer du state principal (`useReducer` dédié).

#### ⚪ Sélection multiple
Pouvoir déplacer un groupe de joueurs en une fois, ou modifier le `helpPct` (ou autre champ) de plusieurs défenseurs simultanément. Marquage `Shift+clic` ou marquee.

#### ⚪ Mode présentation
Bouton plein écran qui masque les panneaux orange/bleu, ne laisse que le terrain et les contrôles de lecture. Idéal sur tablette en bord de terrain.

---

## 3. Produit (export & partage)

### ⚪ Export vidéo / GIF
Au-delà du PDF statique (déjà livré), capturer l'animation fluide pour partage sur réseaux sociaux ou messageries. Piste : `canvas` + `MediaRecorder`, ou `gif.js` côté client.

### ⚪ Templates utilisateurs (presets perso)
Permettre à l'utilisateur de sauvegarder ses propres combos de règles défensives comme presets réutilisables (en plus des 6 presets globaux déjà livrés). Stockage localStorage, format identique à `defensePresets.ts`.

### ⚪ Annotations textuelles libres
Placer des notes de coach n'importe où sur le terrain pour expliquer une intention spécifique ("ici on force baseline", "trap si le 5 monte"). Nouvelle annotation type `text` à ajouter dans le modèle.

---

## Hors roadmap court terme

Idées plus lointaines (modélisation agent, mode coach audio, multi-utilisateur, IA défensive) : voir [IDEAS.md § Idées plus loin](IDEAS.md).
