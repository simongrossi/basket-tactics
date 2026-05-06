# Roadmap

Vision produit forward-looking. Pour le détail des changements déjà livrés et le backlog technique fin, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## Livré récemment (mai 2026)

- 🟢 **Raccourcis clavier** — [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md)
- 🟢 **Tests unitaires Vitest** — 48 tests sur engine / screens / metrics / help, [docs/testing.md](docs/testing.md)
- 🟢 **Closeout dynamique v1** — bump de vitesse ×1.4 + flag `closingOut` + anneau orange sur le défenseur du nouveau porteur. Cf. [docs/logique-defensive.md § Closeout dynamique](docs/logique-defensive.md#closeout-dynamique)
- 🟢 **Menu contextuel attaquant** — clic-droit sur un attaquant : marquer porteur, forcer comme poseur d'écran (override `detectScreen`), effacer ses annotations. Cadenas violet sur le joueur quand forcé.
- 🟢 **Strong-side denial automatique** — sans trigger, un défenseur strong-side proche du ballon glisse vers la ligne de passe (denial passif), intensité proportionnelle à la proximité. Cf. [docs/logique-defensive.md § Strong-side denial](docs/logique-defensive.md#strong-side-denial-automatique)
- 🟢 **Trap en corner v1** — toggle `triggers.trap` ; quand le porteur entre dans un coin fond, le défenseur le plus proche vient verrouiller le côté opposé pour fermer la cage.
- 🟢 **Stunt and recover v1** — nouvelle `OffBallStance: 'stunt'` (fake d'aide vers le ballon, blend 0.4 entre behind et fronting). Le "recover" est naturel : la stance par défaut est récupérée à l'étape suivante.
- 🟢 **Staggered screens v1** — `pickBlockingObstacle` choisit l'obstacle de plus profonde pénétration plutôt que le premier de la liste. Évitement plus fidèle quand plusieurs poseurs s'enchaînent. Limite : pas de double courbe.
- 🟢 **Inversion HOOP v2** — v1 (man) + zone defense directionnelle : `mirrorZoneLayout` miroite polygones/homePos autour de y=540. Engine + CourtView + StepThumbnail adaptent le rendu et le calcul.
- 🟢 **Numérotation des étapes** — petits ronds 1, 2, 3… au pied du joueur initiateur de chaque annotation sur les vignettes PDF.

---

## 1. Logique basket (simulation)

Le moteur est solide sur le placement statique. Les chantiers ci-dessous visent le réalisme **dynamique** (urgence, transitions, séquences).

### 🟢 Closeout dynamique (v1)
Implémenté : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `maxSpeed × 1.4` sur la transition + flag `closingOut: true`. Anneau orange visible dans `Player`. Détails : [docs/logique-defensive.md](docs/logique-defensive.md#closeout-dynamique).

🟢 **v2 (over-closeout)** : `overClosed` sur `ComputedDefender` quand closeout ET le nouveau porteur a drive vers le panier (delta distance > 25, dans les 250px du panier). Anneau **rouge** `#DC2626` au lieu de l'orange + petit ⚠ à côté du joueur. Tests : 2 cas (avec/sans drive).

### 🟢 Strong-side denial (v1 — automatique)
Implémenté dans `help.ts` : quand pas de trigger actif + défenseur strong-side + attaquant à <250px du ballon + `priority !== 'paint'`, glissement vers la ligne de passe avec intensité proportionnelle à la proximité (`denyFactor` jusqu'à 0.45). Détails : [docs/logique-defensive.md § Strong-side denial automatique](docs/logique-defensive.md#strong-side-denial-automatique).

🟢 **v2 (ring dédié)** : `HelpResult.denying` propagé jusqu'à `ComputedDefender.denying`. Player affiche un ring **cyan pointillé** (`#0EA5A8`, dasharray `4 3`) quand `denying`, à la place du ring violet plein "help". Tunable `denyAggressiveness` reste à venir en v3.

### 🟢 Staggered screens (v2)
v1 : `pickBlockingObstacle` (geometry.ts) sélectionne l'obstacle de plus profonde pénétration dans le segment.
**v2** : `pickBlockingCluster` fusionne tous les obstacles bloquants en super-cluster (centroid des centres + rayon couvrant l'enveloppe). `curveAroundObstacle` contourne alors les écrans en chaîne d'un seul mouvement large plutôt que de slalomer entre eux. CourtView utilise `pickBlockingCluster` à la place de `pickBlockingObstacle`. ⚪ **v3** : double courbe Bezier réelle pour weave entre deux écrans très espacés (le super-cluster reste équivalent à un détour quand ils sont proches).

### 🟢 Stunt and recover (v1)
Implémenté : nouvelle `OffBallStance: 'stunt'` avec blend 0.4 dans `offBallStanceTarget`. Position intermédiaire entre behind et fronting, biaisée vers le ballon — le "recover" est naturel via le retour à `'sag'` à l'étape suivante.

### 🟢 Trap en corner / sideline (v2)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`. **v2** : 4 zones au lieu de 2 — coins baseline (gauche/droite, y < 200) + sidelines mi-terrain (gauche/droite, y ∈ [200, 460]). ⚪ **À venir v3** : gestion explicite quand un écran est aussi détecté simultanément (aujourd'hui le trap est désactivé si screen ≠ null).

### 🟢 Inversion HOOP (v2, man + zone)
v1 : `state.attackingDirection: 'up' | 'down'` + threading `hoop?: Point` dans manDefense / help / screens / triggers / metrics / trap / geometry. Bouton "↻ sens d'attaque" gated sur fullCourt.
**v2 — zone defense directionnelle** : `computeZoneTargets` accepte `hoop` et le passe à `manTarget` / `carrierDefenderTarget` / sortings internes. Nouveau helper `mirrorZoneLayout(layout)` qui miroite polygones et homePos autour de y=540. Engine miroite le layout en mode 'down' (pour les positions calculées ET les positions `prevPositions` au step 0). CourtView et StepThumbnail rendent le `ZoneOverlay` et `ZoneCoverage` avec le layout adapté au sens d'attaque.
⚪ **v3** : rendu visuel distinct de la "second hoop" comme panier actif quand inversion (badge ou couleur différente sur le panneau visé vs panneau protégé).

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

#### 🟢 Numérotation des étapes (v1)
Implémenté dans `StepThumbnail.tsx` (composant `ActionOrderBadges`). Pour chaque annotation de l'étape, un petit rond noir numéroté est posé en bas-gauche du joueur initiateur (`fromId`), dans l'ordre des annotations. Si un même joueur initie plusieurs actions, les badges s'empilent horizontalement. Visible uniquement sur les vignettes playbook PDF.

#### 🟢 Mode fantôme (ghosting) (v1)
Implémenté : toggle `state.showGhosts`. Quand actif (et `activeStep > 0` et hors lecture/scrub), `GhostLayer` dans `CourtView` affiche les positions de l'étape N-1 en cercles pointillés (orange pour attaquants, bleu pour défenseurs) à 35% d'opacité, sans label. Visualise le vecteur de déplacement entre les deux étapes.

#### ⚪ Graphique de métriques
Mini-graphique sous la timeline montrant l'évolution de la dangerosité (gap max) ou de la protection de raquette au fil du système. La fonction pure `metrics.ts` est déjà là, il "suffit" de l'évaluer pour chaque step.

### Édition avancée

#### 🟢 Undo / Redo (v1)
Implémenté dans `useAppState` : pile `historyRef` (past/future) cap à 50, wrapper `setStateWithHistory` qui pousse l'état précédent à chaque mutation utilisateur. `undo` / `redo` exposés. Raccourcis `Ctrl/Cmd+Z` (undo) et `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` (redo) câblés dans `useKeyboardShortcuts`.

⚪ **À venir v2** : coalescing pendant le drag (un drag continu = une entrée dans la pile, pas une par mouvement de pointeur).

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
