# Roadmap

Vision produit forward-looking.

- Pour l'**historique des évolutions de comportement** (livré, daté, structuré), voir [CHANGELOG.md](CHANGELOG.md).
- Pour la **cartographie du moteur de jeu** (individuel / collectif / physique), voir [docs/GAME-ENGINE.md](docs/GAME-ENGINE.md).
- Pour le **backlog technique fin et notes de développement**, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## Livré récemment (mai 2026)

- 🟢 **0.8.0 — cycle "lecture animée fidèle"** (2026-05-10) :
  - **Trajectoires courbes** : annotation `cut`/`dribble`/`screen` gagne `waypoints?: Point[]`. Shift+drag enregistre un freehand simplifié en 3-7 waypoints (Douglas-Peucker, tolérance 6 px). Rendu et lecture via spline Catmull-Rom (τ=0.5, équivalent Bezier cubique exact en SVG), reparamétrée en longueur d'arc → vitesse perçue constante quel que soit la courbure. V-cut, L-cut, démarquage en arc, dribble curviligne couverts. Module [`polyline.ts`](src/lib/logic/polyline.ts).
  - **Suivi temps-réel des défenseurs en lecture** : `followDefendersAtFrame` ([`engine.ts`](src/lib/logic/engine.ts)) recalcule chaque défenseur (carrier + off-ball) à chaque frame depuis la position courante de son attaquant marqué via `carrierDefenderTarget` / `offBallStanceTarget` / `manTarget`. Avant, l'interpolation linéaire entre defA et defB faisait que le défenseur prenait la corde des arcs offensifs. Skip si placement manuel via `defenseOverrides`.
  - **`hedge` complet** : avant, seul `screenerDef` (D5) sortait en show. Maintenant `carrierDef` (D1) passe **over the top** avec décalage latéral 8-16 px tight sur le porteur. Le couple D1/D5 ferme à la fois pénétration et rejection.
  - **Regard auto distance-based** ([`vision.ts`](src/lib/logic/vision.ts)) : en stance sag/behind/défaut, la cible primaire bascule selon la distance (`PROXIMITY_GAZE_RATIO = 0.65`). Si l'homme est nettement plus proche que le ballon il devient primary, sinon le ballon reste primary. Clamp ±60° préservé.
  - **Dribble en wave lisse** : tracé du dribble passe d'une polyligne en dents de scie à une chaîne de Bezier quadratiques avec jonctions C1 ([`dribbleWave.ts`](src/lib/logic/dribbleWave.ts)).
  - **Pause fige + reprise depuis l'instant t** : ⏸ propage `playbackT` dans `scrubT` qui pilote `scrubFrame` (capture possible). ▶ après pause décale `playStart` en arrière de `T × stepDuration` via la nouvelle prop `playbackStartT`. ⏹ reset complet.
  - **Lecture ralentie** : `PLAYBACK_STEP_DURATION_MS = 2000` (au lieu de 1500), centralisé dans [`physics.ts`](src/lib/data/physics.ts). À 1× = 2 s par étape, slider 0.3×–2× module sur cette base.
  - 14 nouveaux tests dans `polyline.test.ts`, +1 dans `screens.test.ts`, mise à jour de `dribbleWave.test.ts`. Suite : **302 tests verts**.
  - Détail complet : [CHANGELOG.md § Unreleased](CHANGELOG.md).

- 🟢 **0.7.0 — cycle "pictogramme + champ de vision + overrides manuels"** (2026-05-09) :
  - Convention B asymétrique pour le calcul d'orientation (corps en open stance, regard, 2 cibles de bras par rôle).
  - Invariants anatomiques inviolables : regard ∈ ±60° du corps (cône de vision), aucun bras dans le dos.
  - Champ de vision par joueur : cônes heatmap cyan (défenseurs) / orange (attaquants), 120° d'ouverture, jusqu'aux limites du terrain. 3 toggles globaux dans Paramètres + clic-droit individuel par défenseur. Heatmap croisée par superposition.
  - Sliders manuels orientation corps + regard via clic-droit, pour défenseurs ET attaquants. Override absolu 0–360° (regard clampé à ±60° du corps en aval).
  - Design des bras figé (Design F) après comparaison de 8 variantes via la page `/demo-arms`.
  - UI : panneau Paramètres déplacé à gauche en pop-up modal (style LibraryPanel).
  - Détail complet : [CHANGELOG.md § 0.7.0](CHANGELOG.md).

- 🟢 **0.6.0 — cycle "fidélité basket"** (2026-05-09) :
  - Orientation des joueurs calculée auto (stance/ballon/homme/écran) + override manuel clampé. Module [`orientation.ts`](src/lib/logic/orientation.ts).
  - Anti-téléportation des attaquants : interpolation avec contournement d'obstacles + warning diagnostic si saut > 4 m.
  - Rim protection sur drive (tag and recover du big) : le pivot step-up sur la trajectoire au lieu de rester sur le post adverse.
  - Vue debug aide : flèches défenseur → cible d'aide avec %.
  - Refactor [`physics.ts`](src/lib/data/physics.ts) : toutes les constantes physiques centralisées (échelle, vitesses par poste, seuils de contact, boosts), avec sémantique en mètres réels documentée dans [docs/physics.md](docs/physics.md).
  - 8 toggles fine dans INDICATEURS AUTO (zone tracké, passe contestée, passe bloquée, écran non-porteur, déf. en retard, closeout actif, strong-side denial, poseur forcé).
  - Bugs basket : top-lock côté ballon (avant : ballon ignoré), paint helper pondéré par proximité, filtre d'intention sur les écrans, `isShortCorner` (logique mathématiquement impossible).
  - 73 nouveaux tests (111 → 188), 3 nouvelles docs ([GAME-ENGINE](docs/GAME-ENGINE.md), [physics](docs/physics.md), [orientation-anti-teleport](docs/orientation-anti-teleport.md)).
  - Détail complet : [CHANGELOG.md § 0.6.0](CHANGELOG.md).
- 🟢 **Raccourcis clavier** — [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md)
- 🟢 **Tests unitaires Vitest** — 84 tests sur engine / screens / metrics / help / trap / manDefense / geometry, [docs/testing.md](docs/testing.md)
- 🟢 **Closeout dynamique v1** — bump de vitesse ×1.4 + flag `closingOut` + anneau orange sur le défenseur du nouveau porteur. Cf. [docs/logique-defensive.md § Closeout dynamique](docs/logique-defensive.md#closeout-dynamique)
- 🟢 **Menu contextuel attaquant** — clic-droit sur un attaquant : marquer porteur, forcer comme poseur d'écran (override `detectScreen`), effacer ses annotations. Cadenas violet sur le joueur quand forcé.
- 🟢 **Strong-side denial automatique** — sans trigger, un défenseur strong-side proche du ballon glisse vers la ligne de passe (denial passif), intensité proportionnelle à la proximité. Cf. [docs/logique-defensive.md § Strong-side denial](docs/logique-defensive.md#strong-side-denial-automatique)
- 🟢 **Trap en corner v1** — toggle `triggers.trap` ; quand le porteur entre dans un coin fond, le défenseur le plus proche vient verrouiller le côté opposé pour fermer la cage.
- 🟢 **Stunt and recover v1** — nouvelle `OffBallStance: 'stunt'` (fake d'aide vers le ballon, blend 0.4 entre behind et fronting). Le "recover" est naturel : la stance par défaut est récupérée à l'étape suivante.
- 🟢 **Staggered screens v1** — `pickBlockingObstacle` choisit l'obstacle de plus profonde pénétration plutôt que le premier de la liste. Évitement plus fidèle quand plusieurs poseurs s'enchaînent. Limite : pas de double courbe.
- 🟢 **Inversion HOOP v2** — v1 (man) + zone defense directionnelle : `mirrorZoneLayout` miroite polygones/homePos autour de y=540. Engine + CourtView + StepThumbnail adaptent le rendu et le calcul.
- 🟢 **Numérotation des étapes v2** — badges 1, 2, 3… au pied du joueur initiateur sur les vignettes PDF (v1) ET dans CourtView à l'édition via toggle `state.showActionOrder` (v2). Composant partagé [`ActionOrderBadges`](src/components/ActionOrderBadges.tsx).
- 🟢 **Trajectoire du ballon entre étapes** — pendant playback/scrub, le ballon suit une parabole quand le porteur change (passe entrante). Hauteur de l'arc proportionnelle à la distance. Visuel renforcé en l'air (ombre projetée + contour blanc). Logique pure `geometry.computeBallFrame`.
- 🟢 **Mode fantôme (ghosting)** — toggle `state.showGhosts` qui affiche les positions de l'étape N-1 en cercles pointillés transparents pendant l'édition de l'étape N.
- 🟢 **Undo / Redo** — `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y`. Pile capée à 50 entrées via `setStateWithHistory` qui wrap toutes les mutations utilisateur.
- 🟢 **Bibliothèque en modal** — bouton compact `📚 Bibliothèque (N systèmes)` ouvre une modal centrée avec descriptions complètes, fermeture par `Échap` / clic extérieur / `×`. Cf. [`TemplateLibraryModal.tsx`](src/components/TemplateLibraryModal.tsx).
- 🟢 **Outils dans menus contextuels** — barre compacte `[déplacer / passe / dribble / course / écran]` en haut de chaque menu contextuel (attaquant ou défenseur). Évite l'aller-retour vers le panneau gauche pour changer d'outil.
- 🟢 **Suppression chirurgicale d'annotation** — sur l'étape active dans le panneau Attaque, liste des annotations avec un `×` rouge à droite de chacune. Combiné avec `Suppr` (dernière), `Ctrl+Z` (undo global), et clic-droit attaquant → "effacer ses annotations" (toutes pour ce joueur).
- 🟢 **UI tightening** — réductions padding/font dans Panel, Section, MetricsBar, header pour gagner ~30px verticaux sur les laptops courts. Visualisation ouverte par défaut côté défense.
- 🟢 **Logique défensive v2 — 5 chantiers** : ring denial cyan dédié · over-closeout (anneau rouge + ⚠) · trap sideline (4 zones au lieu de 2) · staggered super-cluster · zone defense directionnelle.

---

## 1. Logique basket (simulation)

Le moteur est solide sur le placement statique. Les chantiers ci-dessous visent le réalisme **dynamique** (urgence, transitions, séquences).

### 🟢 Closeout dynamique (v1)
Implémenté : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `maxSpeed × 1.4` sur la transition + flag `closingOut: true`. Anneau orange visible dans `Player`. Détails : [docs/logique-defensive.md](docs/logique-defensive.md#closeout-dynamique).

🟢 **v2 (over-closeout)** : `overClosed` sur `ComputedDefender` quand closeout ET le nouveau porteur a drive vers le panier (delta distance > 25, dans les 250px du panier). Anneau **rouge** `#DC2626` au lieu de l'orange + petit ⚠ à côté du joueur. Tests : 2 cas (avec/sans drive).

🟢 **v3 (tunable)** : `state.closeoutBoost` (default 1.4, range 1–2 step 0.1). Slider "closeout ×" dans le panneau défense → Paramètres globaux. Permet de désactiver le boost (×1.0) ou de le pousser à fond (×2.0).

### 🟢 Strong-side denial (v1 — automatique)
Implémenté dans `help.ts` : quand pas de trigger actif + défenseur strong-side + attaquant à <250px du ballon + `priority !== 'paint'`, glissement vers la ligne de passe avec intensité proportionnelle à la proximité (`denyFactor` jusqu'à 0.45). Détails : [docs/logique-defensive.md § Strong-side denial automatique](docs/logique-defensive.md#strong-side-denial-automatique).

🟢 **v2 (ring dédié)** : `HelpResult.denying` propagé jusqu'à `ComputedDefender.denying`. Player affiche un ring **cyan pointillé** (`#0EA5A8`, dasharray `4 3`) quand `denying`, à la place du ring violet plein "help".

🟢 **v3 (tunable)** : `state.denyAggressiveness` (default 0.45, range 0–1 step 0.05). Slider "denial agr." dans le panneau défense → Paramètres globaux. 0 désactive complètement le strong-side denial automatique ; 0.7+ donne un comportement très agressif (proche du full denial assumé).

### 🟢 Staggered screens (v3)
v1 : `pickBlockingObstacle` (geometry.ts) sélectionne l'obstacle de plus profonde pénétration dans le segment.
v2 : `pickBlockingCluster` fusionne tous les obstacles bloquants en super-cluster (centroid + rayon couvrant) → courbe simple autour de l'enveloppe.
**v3** : `pickStaggeredPair` détecte deux écrans sur des **côtés opposés** du segment direct (cas en quinconce). Si paire détectée → `curveAroundStaggeredPair` calcule une **cubic Bezier** avec deux points de contrôle (un par obstacle, poussé du côté opposé) → vraie courbe en S qui weave entre les deux écrans. Sinon (un seul ou tous du même côté) → fallback super-cluster v2. CourtView priorise le weave si applicable.

### 🟢 Stunt and recover (v1)
Implémenté : nouvelle `OffBallStance: 'stunt'` avec blend 0.4 dans `offBallStanceTarget`. Position intermédiaire entre behind et fronting, biaisée vers le ballon — le "recover" est naturel via le retour à `'sag'` à l'étape suivante.

### 🟢 Trap en corner / sideline (v2)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`. **v2** : 4 zones au lieu de 2 — coins baseline (gauche/droite, y < 200) + sidelines mi-terrain (gauche/droite, y ∈ [200, 460]). ⚪ **À venir v3** : gestion explicite quand un écran est aussi détecté simultanément (aujourd'hui le trap est désactivé si screen ≠ null).

### 🟢 Inversion HOOP (v3, man + zone + visuel)
v1 : `state.attackingDirection: 'up' | 'down'` + threading `hoop?: Point` dans manDefense / help / screens / triggers / metrics / trap / geometry.
v2 : zone defense directionnelle (`computeZoneTargets` accepte `hoop`, `mirrorZoneLayout(layout)` miroite polygones et homePos autour de y=540).
**v3 — distinction visuelle des paniers** : en mode fullCourt, anneau orange pointillé (`#F97316`) + label "🎯 visé" autour du panier ciblé par l'attaque, et petit cercle bleu sobre (`#3b82f6`) + "🛡 protégé" autour du panier défendu. Suit `state.attackingDirection`. Pas d'effet en demi-terrain (le panier est toujours en haut). Implémenté dans `CourtBackground`, propagé depuis `CourtView` et `StepThumbnail`.

---

## 2. Interface (UX/UI)

Objectif : réduire la friction lors de la création de systèmes complexes.

### Interactivité & raccourcis

#### ⚪ Saisie numérique sur les sliders
**Quoi.** Un `<input type="number">` à côté de chaque `<Slider>` (distance défense, maxSpeed, screenRadius, helpPct par défenseur, ballPressure / rotationSpeed / verticalOffset zone). Permet de taper `42` au lieu de viser au curseur.

**Implémentation.** Modifier le composant `Slider` dans [`src/components/ui.tsx`](src/components/ui.tsx) pour ajouter un input contrôlé qui partage la même valeur. Quand on tape, on appelle le `onChange` du slider. Garde-fou : clamp dans `[min, max]` au blur. Le slider et l'input restent synchrones.

**Effort** ~30min · **Risque** 🟢 · **Valeur** moyen.

**Tradeoff.** Risque visuel : ajout d'un champ peut serrer le layout des panneaux. À tester avec le panneau défense qui est déjà chargé.

#### 🟢 Raccourcis clavier
- `Espace` : play/pause
- `←/→` : étape précédente/suivante
- `M / P / D / R / E` : changement d'outil (move / pass / dribble / cut / écran)
- `Suppr` ou `Backspace` : supprimer la dernière annotation de l'étape active

Implémenté dans `hooks/useKeyboardShortcuts.ts`. Skip auto si le focus est dans un input/textarea/select/contenteditable, ou si une modif (Ctrl/Cmd/Alt) est enfoncée.

#### ⚪ Snap-to-grid
**Quoi.** Pendant le drag d'un joueur, si `Ctrl` est enfoncé, sa position se "magnétise" sur les lignes clés du terrain : ligne 3pts (rayon 250 depuis HOOP), raquette (rectangle PAINT), blocs bas (`HOOP.x ± 70, HOOP.y + 80`), homepos des zones, ligne médiane.

**Implémentation.** Dans [`CourtView.onPointerMove`](src/components/CourtView.tsx), quand `e.ctrlKey && dragging`, après calcul de la position, passer par un helper `snapToGrid(pt, lines, threshold)` qui retourne la ligne la plus proche si distance < seuil (e.g. 8px). Le helper vit dans `geometry.ts`. Visuel optionnel : afficher la ligne magnétisée en surbrillance pendant le drag.

**Effort** ~45min · **Risque** 🟢 · **Valeur** moyen.

**Tradeoff.** Le seuil de snap doit être conservateur sinon le drag devient frustrant. Sur tablette pas de Ctrl → le snap n'est accessible qu'au desktop, ce qui est OK pour v1.

### Visualisation & feedback

#### 🟢 Numérotation des étapes (v2 — playbook PDF + édition)
v1 : composant `ActionOrderBadges` rendu dans les vignettes `StepThumbnail` du playbook PDF.
**v2** : extrait dans [`ActionOrderBadges.tsx`](src/components/ActionOrderBadges.tsx) (réutilisable). Toggle `state.showActionOrder` dans le panneau défense (Visualisation). Quand actif et hors lecture/scrub, les badges s'affichent aussi dans `CourtView` à l'édition. Le coach voit l'ordre des actions sur l'étape active sans switcher entre les étapes.

#### 🟢 Mode fantôme (ghosting) (v1)
Implémenté : toggle `state.showGhosts`. Quand actif (et `activeStep > 0` et hors lecture/scrub), `GhostLayer` dans `CourtView` affiche les positions de l'étape N-1 en cercles pointillés (orange pour attaquants, bleu pour défenseurs) à 35% d'opacité, sans label. Visualise le vecteur de déplacement entre les deux étapes.

#### ⚪ Graphique de métriques
**Quoi.** Un mini-graphe ligne sous la `Timeline` montrant l'évolution d'une métrique au fil des étapes : "gap max" (attaquant le plus libre), "paint coverage" (défenseurs proches du panier), ou "late count". Permet de voir d'un coup d'œil quelles étapes sont les plus dangereuses.

**Implémentation.** Nouveau composant `MetricsChart` qui prend `state` et calcule `computeMetrics(off, defPos, carrier, hoop)` pour chaque step (les fonctions sont déjà pures). Dessine un SVG path depuis l'array de valeurs, un point par étape, ligne reliant les points. Petite lib SVG faite main (pas de Chart.js — overkill pour un mini-graphe). Toggle dans le DefensePanel pour choisir quelle métrique afficher (gap max / paint / late count).

**Effort** ~1h · **Risque** 🟢 · **Valeur** haut.

**Tradeoff.** Le calcul à chaque render de toutes les étapes peut être coûteux (~10 étapes × `effectiveDefensePositions` + `computeMetrics`). À memoiser sur `state` via `useMemo`. Si lent, batch le calcul dans un effect dédié.

### Édition avancée

#### 🟢 Undo / Redo (v1)
Implémenté dans `useAppState` : pile `historyRef` (past/future) cap à 50, wrapper `setStateWithHistory` qui pousse l'état précédent à chaque mutation utilisateur. `undo` / `redo` exposés. Raccourcis `Ctrl/Cmd+Z` (undo) et `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` (redo) câblés dans `useKeyboardShortcuts`.

⚪ **À venir v2** : coalescing pendant le drag (un drag continu = une entrée dans la pile, pas une par mouvement de pointeur).

#### ⚪ Sélection multiple
**Quoi.** Pouvoir sélectionner plusieurs défenseurs avec `Shift+clic` ou un marquee (rectangle de sélection au drag dans le vide). Ensuite : drag groupé qui les déplace ensemble, ou modification de `helpPct` / `priority` qui s'applique à tous.

**Implémentation.** Nouveau state `selectedDefenders: DefenderId[]` dans `useAppState` (ou local CourtView). Modifier `Player` pour afficher un highlight (contour épais cyan) quand sélectionné. Marquee : `onPointerDown` sur le terrain hors d'un joueur démarre un rectangle de sélection rendu en SVG, `onPointerUp` finalise et collecte les défenseurs dans la zone. Action groupée : nouveau menu "actions sur sélection" ou un panneau qui apparaît quand `selected.length > 1`. `Shift+drag` sur un joueur sélectionné déplace tous ensemble (delta appliqué à chacun).

**Effort** ~2h · **Risque** 🟡 · **Valeur** haut.

**Tradeoffs.** Nouvelles touches qui peuvent entrer en conflit (Shift+clic est aujourd'hui inutilisé, OK ; Shift+drag aussi). Pour l'undo/redo, les actions groupées doivent être un seul commit dans la pile (`setStateWithHistory` une fois, pas N fois) — penser à coalescer via une nouvelle méthode `moveDefenderGroup` ou un wrapper qui désactive temporairement le push.

**Découpage suggéré** : (a) sélection visible + marquee, (b) drag groupé, (c) édition groupée des règles. 3 commits.

#### 🟢 Mode présentation (v1)
Implémenté : bouton **"🎬 plein écran"** dans le header. Toggle local `presentMode`. Quand activé : panneaux Attack et Defense masqués (rendu conditionnel `{!presentMode && <Panel>}`), `layout-grid` passe en 1-colonne (`grid-template-columns: 1fr`), le terrain occupe toute la largeur. Sortie via le même bouton (devient "✕ quitter") ou touche `Échap`.

⚪ **À venir v2** : plein écran navigateur natif via `document.documentElement.requestFullscreen()` pour cacher la barre d'onglets aussi (utile sur tablette pour vraiment tout libérer).

---

## 3. Produit (export & partage)

### ⚪ Export vidéo / GIF
**Quoi.** Capturer l'animation fluide du système (lecture complète) en GIF ou vidéo MP4 téléchargeable. Permet de partager sur Slack/WhatsApp/X sans demander à quelqu'un d'ouvrir l'app.

**Implémentation.** Deux pistes complémentaires :

- **GIF** via [`gif.js`](https://github.com/jnordberg/gif.js) (~20kB gzipped). On lit le SVG frame par frame, on le convertit en canvas (via serialize → `Image` → `drawImage`), on push chaque frame dans `gif.js`. Avantage : portable, fonctionne partout. Inconvénient : taille de fichier lourde (3-10 MB pour 5s d'anim), qualité moyenne, encodage long.
- **MP4 / WebM** via `MediaRecorder` sur un canvas. On render le SVG dans un canvas via `OffscreenCanvas` à 30fps, on capture le stream avec `canvas.captureStream()`. Avantage : taille petite (~500kB pour 5s), encodage rapide. Inconvénient : support Safari capricieux historiquement (OK depuis 2023 mais à tester).

Bouton "🎥 exporter GIF / MP4" à côté du bouton playbook PDF actuel. Choix du format dans une modal.

**Effort** ~3h pour une v1 GIF, ~4h pour MP4. Le SVG → canvas conversion est le point délicat (foreignObject ou serialization XML).

**Risque** 🟡 · **Valeur** très haut (partage).

**Tradeoff.** `gif.js` ajoute du poids au bundle. Alternative : faire tourner l'encodage sur un Web Worker. Pour MP4 c'est natif, zéro dépendance, mais le support est plus capricieux. **Pragmatique** : commencer par GIF, ajouter MP4 plus tard en option utilisateur ("format : GIF / MP4").

### ⚪ Templates utilisateurs (presets perso)
**Quoi.** 6 presets défensifs sont aujourd'hui fournis dans [`defensePresets.ts`](src/lib/data/defensePresets.ts). Permettre à l'utilisateur de sauvegarder ses propres combos (snapshot de `screenRule + offBallScreenRule + dropDepth + triggers + 5 DefenderRule + offBallStance par défenseur`) sous un nom, et les recharger. Idem côté offensif (templates de système : steps + ballCarrier + initial pos + label).

**Implémentation.** Nouveau état `state.userPresets: { defense: UserDefensePreset[]; offense: UserOffenseTemplate[] }` (sérialisé localStorage, donc dans la sauvegarde existante). Format identique à `DefensePreset` mais avec un `id` UUID + `name` + `createdAt`. Boutons "💾 sauvegarder ce preset" sous le panneau défense (et dans la section bibliothèque côté offense), "🗑 supprimer" dans le menu de chaque preset perso. Distinction visuelle : presets globaux en bleu, presets perso en vert avec icône utilisateur.

**Effort** ~1h30 · **Risque** 🟢 · **Valeur** haut.

**Tradeoff.** Le localStorage a une limite ~5MB. Avec des templates offensifs riches (5 étapes × 5 attaquants × annotations), ~50 templates max raisonnable. Pas un blocker à court terme. **À ajouter plus loin** : export/import individuel (JSON file) pour partager entre utilisateurs ou sauvegarder hors localStorage.

### ⚪ Annotations textuelles libres
**Quoi.** Pouvoir déposer une note texte n'importe où sur le terrain ("trap si le 5 monte", "force baseline", "skip pass option"). Distincte des flèches d'action — c'est du commentaire libre, pour expliquer l'intention.

**Implémentation.** Étendre `AnnotationType` avec `'text'` dans `lib/types/index.ts`. Nouveau champ optionnel `text?: string` dans `Annotation`. Le `from` représente l'ancrage (point sur le terrain), `to` est ignoré. Nouvel outil `T` (Text) à côté de `M / P / D / R / E` dans `OffensePanel`. Au clic sur le terrain en mode texte, prompt inline : un `<foreignObject>` SVG affiche un `<input>` qui devient un `<text>` au blur. Rendu dans `Annotations.tsx` : un `<text>` avec fond blanc semi-opaque (rectangle de fond + label centré). Edit/delete au clic sur le texte (réouvre l'input).

**Effort** ~2h · **Risque** 🟡 · **Valeur** haut.

**Tradeoffs.** `<foreignObject>` a des bugs historiques sur Safari (rendu, scroll, focus). **Plan B** : édition via une modal/popup en HTML standard au lieu d'inline. Moins fluide mais plus robuste. Si on prend le plan B, on peut remplacer l'input inline par un `prompt()` ou une vraie modal. Décider au moment de l'implémentation après un essai foreignObject sur Safari.

**Découpage suggéré** : (a) ajout du type + outil + rendu, (b) édition inline ou modal, (c) édition/suppression d'une annotation existante.

---

## Synthèse priorisation (chantiers ⚪ restants)

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| 1 | Saisie numérique sliders | 30min | 🟢 | Moyen |
| 2 | Snap-to-grid | 45min | 🟢 | Moyen |
| 3 | Graphique métriques | 1h | 🟢 | Haut |
| 4 | Sélection multiple | 2h | 🟡 | Haut |
| 5 | Mode présentation | 45min | 🟢 | Haut (tablette) |
| 6 | Export GIF/vidéo | 3-4h | 🟡 | **Très haut** (partage) |
| 7 | Templates utilisateurs | 1h30 | 🟢 | Haut |
| 8 | Annotations texte libres | 2h | 🟡 | Haut |

**Total restant** : ~12-13h en restant sur des v1 simples.

**Ordre conseillé pour enchaîner** : 1 → 5 → 7 → 3 → 2 → 8 → 4 → 6 (du moins risqué au plus risqué, valeur croissante). Le bloc (1 + 5 + 7) est ~3h pour 3 quick wins très visibles. (3 + 2) ajoute 2h pour deux UX impactants. (8 + 4) sont les plus complexes côté UX. (6) est le plus impactant pour la diffusion mais le plus délicat techniquement — à garder pour la fin.

**Limites v3 documentées sur les chantiers déjà v2** :
- **Trap** : gestion explicite quand un écran est aussi détecté simultanément (aujourd'hui le trap est skip si screen ≠ null)
- **Staggered** : ✅ double courbe Bezier réelle livrée en v3 (`pickStaggeredPair` + `curveAroundStaggeredPair`).
- **Inversion HOOP** : ✅ rendu visuel "🎯 visé" / "🛡 protégé" livré en v3.
- **Closeout / Denial** : ✅ tunables globaux livrés en v3. ✅ override par règle individuelle livré (DefenderRule.closeoutBoost / denyAggressiveness) — slider dans le menu contextuel défenseur avec affichage "global" / valeur + bouton ↻ pour reset.
- **Undo/Redo** : coalescing pendant un drag continu (1 entrée pile au lieu de N)

---

## Hors roadmap court terme

Idées plus lointaines (modélisation agent, mode coach audio, multi-utilisateur, IA défensive) : voir [IDEAS.md § Idées plus loin](IDEAS.md).
