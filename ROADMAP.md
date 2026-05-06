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
- 🟢 **Inversion HOOP v1** — `attackingDirection: 'up' | 'down'` + `getDefenseHoop(state)` threadé dans engine vers manTarget, carrierDefenderTarget, offBallStanceTarget, computeHelpTarget, applyScreenAdjustment, detectTriggers, computeMetrics, isInTrapZone. Bouton "↻ sens d'attaque" dans le panneau défense (gated sur fullCourt). Zone defense pas encore directionnelle.
- 🟢 **Numérotation des étapes** — petits ronds 1, 2, 3… au pied du joueur initiateur de chaque annotation sur les vignettes PDF.

---

## 1. Logique basket (simulation)

Le moteur est solide sur le placement statique. Les chantiers ci-dessous visent le réalisme **dynamique** (urgence, transitions, séquences).

### 🟢 Closeout dynamique (v1)
Implémenté : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `maxSpeed × 1.4` sur la transition + flag `closingOut: true`. Anneau orange visible dans `Player`. Détails : [docs/logique-defensive.md](docs/logique-defensive.md#closeout-dynamique).

⚪ **À venir v2** : modélisation de l'over-closeout (attaquant qui drive sur un défenseur arrivé trop vite). En attente d'un trigger de drive consolidé sur l'étape.

### 🟢 Strong-side denial (v1 — automatique)
Implémenté dans `help.ts` : quand pas de trigger actif + défenseur strong-side + attaquant à <250px du ballon + `priority !== 'paint'`, glissement vers la ligne de passe avec intensité proportionnelle à la proximité (`denyFactor` jusqu'à 0.45). Détails : [docs/logique-defensive.md § Strong-side denial automatique](docs/logique-defensive.md#strong-side-denial-automatique).

🟢 **v2 (ring dédié)** : `HelpResult.denying` propagé jusqu'à `ComputedDefender.denying`. Player affiche un ring **cyan pointillé** (`#0EA5A8`, dasharray `4 3`) quand `denying`, à la place du ring violet plein "help". Tunable `denyAggressiveness` reste à venir en v3.

### 🟢 Staggered screens (v1)
Implémenté : `pickBlockingObstacle` (geometry.ts) sélectionne l'obstacle de plus profonde pénétration dans le segment du défenseur. Plus fidèle qu'un break sur le premier match. ⚪ **v2** : enchaîner deux courbes pour traverser réellement deux écrans en série.

### 🟢 Stunt and recover (v1)
Implémenté : nouvelle `OffBallStance: 'stunt'` avec blend 0.4 dans `offBallStanceTarget`. Position intermédiaire entre behind et fronting, biaisée vers le ballon — le "recover" est naturel via le retour à `'sag'` à l'étape suivante.

### 🟢 Trap en corner / sideline (v1)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`. Active quand le porteur entre dans un coin fond. ⚪ **v2** : zones supplémentaires (sideline mi-terrain), gestion explicite quand un écran est aussi détecté simultanément.

### 🟢 Inversion HOOP (v1, man defense uniquement)
Implémenté : `state.attackingDirection: 'up' | 'down'` + `getDefenseHoop(state)`. Threading via param `hoop?: Point` (default = HOOP) dans manTarget, carrierDefenderTarget, offBallStanceTarget, computeHelpTarget, applyScreenAdjustment, detectTriggers, computeMetrics, isInTrapZone, inPaint, distHoop. Bouton "↻ sens d'attaque" dans le panneau défense (gated sur fullCourt). ⚪ **v2** : zone defense directionnelle (computeZoneTargets utilise encore HOOP top hardcodé), rendu visuel de la second hoop comme panier "actif".

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
