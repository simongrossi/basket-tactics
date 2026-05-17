# Roadmap

Vision produit forward-looking.

- Pour l'**historique des évolutions de comportement** (livré, daté, structuré), voir [CHANGELOG.md](CHANGELOG.md).
- Pour la **cartographie du moteur de jeu** (individuel / collectif / physique), voir [docs/GAME-ENGINE.md](docs/GAME-ENGINE.md).
- Pour le **backlog technique fin et notes de développement**, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## Livré récemment (mai 2026)

- 🟢 **Session 2026-05-12 — Grande session 4 phases** : **27 commits**,
  **541 → 714 tests verts (+173)**. Récap complet dans
  [docs/session-2026-05-12.md](docs/session-2026-05-12.md).

  **Phase 1 — Refactoring modularité (6 commits, +61 tests)** :
  6 plus gros fichiers du repo éclatés. 4 patterns documentés
  (barrel + dossier, transforms purs + hook mince, hooks + sous-composants,
  **registry de règles**). API publique strictement inchangée.

  **Phase 2 — Audit défensif B1-B10 (10 commits, +59 tests)** :
  10 concepts basket manquants identifiés et tous livrés :
  - **🔴 Critiques** : B1 mismatch+scram · B2 reject detect · B3 hard/soft
    hedge · B4 snake detect
  - **🟠 Moyens** : B5 empty side · B6 dig/double · B7 def 3sec ·
    B8 switch policy · B9 top-lock timing · B10 bump cutters

  **Phase 3 — UX panneau gauche (5 commits, +21 tests)** :
  #1 saisie num sliders · #2 snap-to-grid (Ctrl/Cmd) · #3 graphique
  métriques · #4 sélection multiple · #5 templates user.

  **Phase 4 — V2/v3 défensif (2 commits, +15 tests)** :
  Trap v3 (coexistence avec écran) · B2 V2 (unwind reject) · B4 V2
  (snake keep coverage) · Undo/Redo v2 marqué (déjà fait).

  **Nouveaux modules / patterns** :
  - **6 helpers purs** : `mismatchTracking`, `detectRejectedScreen`,
    `detectSnakeDribble`, `emptySidePnR`, `cutterScreenChain`,
    `switchAllowed`.
  - **2 nouvelles couches du pipeline défensif** :
    `postCoverageLayer` (4.5), `cutterBumpLayer` (5.5).
  - **6 nouveaux settings opt-in** : `scramSwitchEnabled`,
    `mismatchThreshold`, `hedgeAggression`, `switchPolicy`,
    `autoBumpCutters`, `postCoverage` (+ `unwindRejectedScreens` et
    `snakeKeepCoverage` pour les V2).
  - **5 nouvelles règles coach** : scram-switch enrichi, rejected-screen,
    snake-dribble, defensive-3sec, empty-side-pnr.
  - **8 modules de transforms purs** extraits de useAppState
    (testables sans React).

  Toutes les nouvelles features défensives sont **opt-in** pour
  préserver la rétrocompat. Tests à 100% verts à chaque commit, TS
  strict, API publique inchangée sur les refactos.

- 🟢 **B1 — Mismatch tracking + scram switch** (2026-05-12) :
  - **Détection** : `mismatchSeverity(D, A) = |defenderRank - attackerRank|`, range 0..4. Propagé sur chaque `ComputedDefender`, visible à chaque step y compris en l'absence de switch (le coach voit aussi les bad matchups manuels).
  - **Scram switch** correctif (opt-in via `state.scramSwitchEnabled`) : après un switch porteur qui crée un mismatch ≥ seuil, un défenseur tiers ≤ 200px de l'attaquant exposé prend le mismatch ; le défenseur en mismatch part sur l'attaquant naturel du scrameur. Algo basket-correct : tie-break côté porteur (menace immédiate), métrique d'amélioration sur le **pire** mismatch (pas la somme).
  - **Visuel** : badge sous le sprite défenseur — orange (severity 2), rouge (≥3), bleu "SCRAM" si scram appliqué.
  - **UI** : toggle + sélecteur de seuil dans `DefensePanel` (visible seulement avec rule `switch` ou `peel-switch`).
  - **Diagnostic coach** enrichi en 4 niveaux selon severity (good/critical/warning/info).
  - 17 tests (12 unitaires + 5 intégration). **602 → 619 tests verts**.
  - Premier item de la liste **B** (audit défensif) livré.

- 🟢 **Cycle modularité — découpage des 6 plus gros fichiers** (2026-05-12) :
  - **`scriptedGenerators.ts` : 1502 → 92 lignes** (barrel) — 57 générateurs FIBA répartis par tier (helpers + tier1/2/3). Ajouter une action = 1 sous-fichier + 1 ligne.
  - **`useAppState.ts` : 967 → 510 lignes** — toute la logique métier extraite en 8 namespaces de transformations pures `(state, ...args) => state` dans `src/lib/state/transforms/`. **61 nouveaux tests** unitaires sur ces transforms (sans setup React).
  - **`CourtView.tsx` : 902 → 446 lignes** — extraction des hooks `useCourtFrame` (frame statique/scrub/playback) et `useCourtPointerHandlers` (drag + tracé annotations en rAF-coalesced). Sous-composants `<CourtPlayersLayer>` (sprites + screener gaze override) et `<CourtMenus>` (context menus + zone region).
  - **`ContextMenu.tsx` : 897 → 22 lignes** — dispatch pur. Logique éclatée dans 5 modules : `popupHooks` (clamp + drag), `ToolBar`, `sharedRows`, `DefenderMenu`, `AttackerMenu`.
  - **`screens.ts` : 822 → barrel + 5 modules** — épicentre des bugs récurrents, isolé en `helpers.ts`, `detectCarrierScreen.ts`, `carrierScreenAdjust.ts`, `detectOffBallScreens.ts`, `offBallScreenAdjust.ts`. Ajouter une rule défensive = 1 fichier ciblé.
  - **`coachDiagnostics.ts` : 834 → barrel + 13 rules** — pattern **registry de règles** : chaque diagnostic vit dans `rules/<name>.ts` sous forme `(ctx) => CoachDiagnostic[]`. Ajouter un diagnostic basket = 1 fichier + 1 entrée dans le registry. Plus aucune lecture des 833 autres lignes.
  - **API publique strictement inchangée** sur les 6 fichiers : zéro caller modifié.
  - **541 → 602 tests verts** (+61 sur les transforms purs `useAppState`, possibles seulement après extraction).
  - 4 nouveaux patterns documentés dans [docs/architecture.md § Modularité & refactoring](docs/architecture.md#modularité--refactoring) : barrel + dossier, transforms purs + hook mince, hooks + sous-composants, registry de règles.
  - Historique complet : [docs/refactoring-history.md](docs/refactoring-history.md). Méthode reproductible pour les prochains gros fichiers.
  - **Audit moteur défensif** : ~70 % des concepts basket élémentaires couverts. **10 trous métier** identifiés et ajoutés à § 1 (mismatch tracking, reject screen, hard/soft hedge, snake dribble, empty side PnR, dig/double post, defensive 3 sec, switch policy granulaire, top-lock timing, bumping cutters). + **box-out/rebond** noté en § 4 comme demi-jeu manquant.

- 🟢 **Refacto moteur défensif en couches** (2026-05-10) :
  - **`engine.ts` : 982 → 117 lignes** (-88%). Le calcul des cibles défensives (`computeDefenseTargets`, ~290 lignes monolithique) découpé en pipeline de 6 couches isolées dans `src/lib/logic/defense/` : context → baseTargets → pnrRotations → offBallScreen → trap → directives → postPassOrientation. Chaque couche est testable en isolation derrière une signature `(positions, [matchups,] ctx) → void`.
  - `effectiveDefensePositions` (contrainte vitesse + closeout + friction + collisions, ~235 l) sortie dans `defense/speedConstraint.ts`. `followDefendersAtFrame` + `recomputeDefenseFrameOrientations` dans `defense/frameAdjust.ts`. `computeAttackerVisuals` dans `attackerVisuals.ts`. `detectStepScreenAction` dans `events/triggerDetector.ts`.
  - **`CourtView.tsx` : 1222 → 811 lignes** (-34%). Boucle d'animation extraite dans le hook `usePlaybackAnimation`, calcul de frame interpolée (play + scrub) unifié dans `playback/frameResolver.ts`. Plus de divergence silencieuse possible entre play et scrub. Les 10 overlays regroupés sous `src/components/overlays/`. `GhostLayer` extrait.
  - Centralisation des constantes physiques : `COURT_CENTERLINE_X`, `CARRIER_SIDE_TOLERANCE_PX`, 5 offsets `PLAYER_*` dans `data/court.ts` ; `DRIBBLE_THRESHOLD_PX`, `POST_HOLD_THRESHOLD_PX` dans `constants/gameplay.ts` ; `normalizeAngle`/`angleDiff`/`lerpAngleDeg` dédupliqués dans `logic/angles.ts`. **`vision.ts` et `orientation.ts` restent strictement séparés** — seul le math angulaire pur est mutualisé.
  - Comportement bit-identique (zéro changement fonctionnel), 336 tests verts à chaque sous-étape, ré-exports gardés sur `engine.ts` pour préserver l'API publique.
  - Détail complet : [CHANGELOG.md § Refactor](CHANGELOG.md). Architecture mise à jour : [docs/architecture.md](docs/architecture.md).

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

### 🟢 Trap en corner / sideline (v3)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`.
- **v2** : 4 zones au lieu de 2 — coins baseline (gauche/droite, y < 200) + sidelines mi-terrain (gauche/droite, y ∈ [200, 460]).
- **v3 (2026-05-12)** : coexistence trap + écran porteur. Le trap s'applique même avec un écran, sauf `'blitz'` (déjà un trap PnR) et `'switch'` (matchups swappés). `pickTrapHelper` exclut le `screenerDef`. 7 tests.

### 🟢 Inversion HOOP (v3, man + zone + visuel)
v1 : `state.attackingDirection: 'up' | 'down'` + threading `hoop?: Point` dans manDefense / help / screens / triggers / metrics / trap / geometry.
v2 : zone defense directionnelle (`computeZoneTargets` accepte `hoop`, `mirrorZoneLayout(layout)` miroite polygones et homePos autour de y=540).
**v3 — distinction visuelle des paniers** : en mode fullCourt, anneau orange pointillé (`#F97316`) + label "🎯 visé" autour du panier ciblé par l'attaque, et petit cercle bleu sobre (`#3b82f6`) + "🛡 protégé" autour du panier défendu. Suit `state.attackingDirection`. Pas d'effet en demi-terrain (le panier est toujours en haut). Implémenté dans `CourtBackground`, propagé depuis `CourtView` et `StepThumbnail`.

### Concepts défensifs basket à compléter

Audit moteur défensif (mai 2026) → ~70 % des concepts élémentaires couverts.
Restent **10 trous métier** à instruire, par ordre de valeur basket.

> ⚠️ Item séparé hors de cette liste : **box-out / rebond après tir** —
> demi-jeu absent du moteur. Tracé dans § 4 "Dette technique" comme chantier
> autonome (changement de scope : ajoute le rebond comme événement, pas
> seulement le placement défensif).

#### 🔴 Critiques

##### 🟢 Mismatch tracking après switch (livré 2026-05-12)
**Quoi.** Détection automatique des mismatches créés par un switch porteur
(D5 sur O1 = severity 4, etc.) + **scram switch** correctif (3ᵉ échange
défensif qui rétablit les matchups au moins partiellement).

**Pourquoi basket.** Un mismatch laissé = post-up garanti ou drive easy. En
match c'est la première chose qu'on attaque ; en défense c'est le premier
réflexe à corriger.

**Livré** :
- Module `defense/mismatchTracking.ts` : `defenderRank` / `attackerRank` /
  `mismatchSeverity` / `applyScramSwitch` (algo basket-correct : tie-break
  côté porteur, métrique d'amélioration sur le pire mismatch pas la somme).
- Câblage dans `defense/context.ts` après `applySwitch` natif.
- Propagation `mismatchSeverity` + `scrammedThisStep` sur `ComputedDefender`.
- Badge visuel sous le sprite défenseur (orange/rouge/bleu SCRAM).
- Toggle + slider de seuil dans `DefensePanel` (visible seulement avec
  rule `switch` ou `peel-switch`).
- Diagnostic coach enrichi (4 niveaux : good/critical/warning/info selon
  severity).
- 17 tests (12 unitaires + 5 intégration). **619 tests verts**.

##### 🟢 Reject screen detection (V1 livré 2026-05-12)
**Quoi.** Détecte le porteur qui refuse l'écran (jab + drive opposé)
quand la défense l'a anticipé.

**Livré V1 (diagnostic-only)** :
- Helper pur `screens/detectRejectedScreen.ts` : retourne `RejectedScreen`
  avec IDs et métriques (`prevDistance`, `curDistance`, `awayness`).
- Règle coach `coachDiagnostics/rules/rejectedScreen.ts` : 'warning' si
  sharp (dot ≤ -0.7), 'info' si marge.
- 9 tests unitaires. **633 tests verts**.

🟢 **V2 livré (2026-05-12)** : `state.unwindRejectedScreens` (opt-in).
Quand un reject SHARP (awayness ≤ -0.7) est détecté, l'écran est forcé
à `null` dans le `DefenseFrameContext` → la défense retombe sur la
couverture homme-à-homme pure. 4 tests intégration. **710 tests**.

##### 🟢 Hard hedge vs soft hedge (livré 2026-05-12)
**Quoi.** Sépare l'axe quality (côté offense) de l'axe aggression (côté
défense). Slider `state.hedgeAggression` (0..100, default 50) qui module
la sortie de D5 sur le porteur en hedge.

**Livré** :
- Argument `hedgeAggression` ajouté à `applyScreenAdjustment` (passé
  depuis `baseTargets.ts` via `state.hedgeAggression ?? 50`).
- Bloc `hedge && isScreenerDef` refondu : `aggressiveAdvance = 25 + 35 *
  hedgeAgg` (au lieu de `35 * q`), blendFactor = `q × hedgeAgg`.
- Indépendance des axes : q=0 (ghost) reste ghost même en hard hedge.
- Slider UI dans `DefensePanel`, visible seulement quand rule=hedge.
- 5 tests dédiés (soft, hard, monotone, independence, default). **624 tests**.

##### 🟢 Snake dribble (V1 livré 2026-05-12)
**Quoi.** Détecte le V sur 3 steps : porteur engagé → retraite → ré-engagé
sur le même poseur.

**Livré V1 (diagnostic-only)** :
- Helper pur `screens/detectSnakeDribble.ts` : retourne `SnakeDribble` avec
  les 3 distances (entry/peak/return).
- Règle coach `coachDiagnostics/rules/snakeDribble.ts` : 'warning' si V
  marqué (peak > 1.5 × entry), 'info' sinon.
- Critère segment-par-segment (pas total) : un snake parfait revient pile
  au point d'engagement, donc total ≈ 0.
- 8 tests unitaires. **641 tests verts**.

🟢 **V2 livré (2026-05-12)** : `state.snakeKeepCoverage` (opt-in). Quand
un snake est détecté au step N (retour), `screenQuality` effective est
forcée à **90 minimum** dans `baseTargets`. La 2ᵉ utilisation est traitée
comme un lockdown (D1 plaqué, D5 hedge fort) au lieu d'un re-arm.
4 tests intégration. **714 tests**.

#### 🟠 Moyens — patterns courants non couverts

##### 🟢 Empty side PnR (V1 livré 2026-05-12)
Helper pur `isEmptySidePnR` + règle coach. 'critical' si ice sur empty
(drive 1c0), 'good' si under/weak. 5 tests. **650 tests verts**.

##### 🟢 Dig / double au post (V1 livré 2026-05-12)
Nouvelle couche 4.5 du pipeline défensif (`postCoverageLayer`). Setting
`state.postCoverage: 'none' | 'dig' | 'double'` (opt-in). Quand trigger
post actif + couverture ≠ none, un défenseur low man (≠ carrierDef, le
plus proche du pivot, non occupé) fait 30 % du chemin ('dig') ou 50 %
('double') vers le pivot. 4 tests. **678 tests verts**.

##### 🟢 Defensive 3 seconds (V1 livré 2026-05-12)
Diagnostic coach quand un défenseur stationne 3 steps consécutifs dans
la raquette sans marquer (≤ 50 px d'un attaquant). Pas de pénalité simulée.
Règle `defensiveThreeSecondsRule` dans le registry. 4 tests. **645 tests**.

##### 🟢 Politique de switch granulaire (V1 livré 2026-05-12)
4 policies au niveau team : `'all'` (default), `'1-3'`, `'1-4'`, `'none'`.
Filtre additionnel par-dessus `screenRule = 'switch'`/'peel-switch'.
Helper `switchAllowed` + câblage dans `defense/context.ts` + UI dans
`DefensePanel`. 10 tests. **660 tests verts**.

##### 🟢 Top-lock off-ball avec timing (V1 livré 2026-05-12)
Helper `cuttersInScreenChain` + câblage dans `offBallScreenLayer`. Bascule
auto `top-lock → chase` pour les cutters avec ≥ 2 écrans dans 3 steps.
10 tests (7 unit + 3 intégration). **670 tests verts**.

##### 🟢 Bumping the cutter — réaction automatique (V1 livré 2026-05-12)
Nouvelle couche 5.5 du pipeline défensif (`cutterBumpLayer`). Détecte les
cuts via `detectCuts`, trouve le défenseur le plus proche de la
trajectoire (≤ 40px, pas le cutterDef, pas en aide active), applique un
offset de 12px vers le cutter. Setting `state.autoBumpCutters` (opt-in).
4 tests. **674 tests verts**.

---

## 2. Interface (UX/UI)

Objectif : réduire la friction lors de la création de systèmes complexes.

### Interactivité & raccourcis

#### 🟢 Saisie numérique sur les sliders (livré 2026-05-12)
`<input type="number">` ajouté à droite de chaque `<Slider>` dans
[`src/components/ui.tsx`](src/components/ui.tsx). Buffer local pendant la
frappe, clamp + snap au blur/Enter, Escape annule. Tous les sliders du
moteur en bénéficient sans modification côté caller. 678 tests verts.

#### 🟢 Raccourcis clavier
- `Espace` : play/pause
- `←/→` : étape précédente/suivante
- `M / P / D / R / E` : changement d'outil (move / pass / dribble / cut / écran)
- `Suppr` ou `Backspace` : supprimer la dernière annotation de l'étape active

Implémenté dans `hooks/useKeyboardShortcuts.ts`. Skip auto si le focus est dans un input/textarea/select/contenteditable, ou si une modif (Ctrl/Cmd/Alt) est enfoncée.

#### 🟢 Snap-to-grid (livré 2026-05-12)
Module pur `lib/logic/snapToGrid.ts` + overlay visuel
`court/SnapGuideOverlay.tsx`. Activé pendant le drag d'un joueur avec
**Ctrl** (PC) ou **Cmd** (Mac). 9 cibles : médiane, 4 bords raquette,
LF, arc 3pts, 2 blocs bas. Seuil 8 px. Mode fullCourt adapté via
`HOOP_OPPOSITE`. 11 tests. **699 tests verts**.

### Visualisation & feedback

#### 🟢 Numérotation des étapes (v2 — playbook PDF + édition)
v1 : composant `ActionOrderBadges` rendu dans les vignettes `StepThumbnail` du playbook PDF.
**v2** : extrait dans [`ActionOrderBadges.tsx`](src/components/ActionOrderBadges.tsx) (réutilisable). Toggle `state.showActionOrder` dans le panneau défense (Visualisation). Quand actif et hors lecture/scrub, les badges s'affichent aussi dans `CourtView` à l'édition. Le coach voit l'ordre des actions sur l'étape active sans switcher entre les étapes.

#### 🟢 Mode fantôme (ghosting) (v1)
Implémenté : toggle `state.showGhosts`. Quand actif (et `activeStep > 0` et hors lecture/scrub), `GhostLayer` dans `CourtView` affiche les positions de l'étape N-1 en cercles pointillés (orange pour attaquants, bleu pour défenseurs) à 35% d'opacité, sans label. Visualise le vecteur de déplacement entre les deux étapes.

#### 🟢 Graphique de métriques (livré 2026-05-12)
Composant `MetricsChart` sous la Timeline. 4 métriques sélectionnables
(maxGap / paintCoverage / lateCount / helpFactorTotal). SVG fait main,
marqueur rouge sur step actif, clic = navigation. État replié par défaut
(bouton "📈 graphique métrique"). Mémoizé sur `[state, metric]`.
`computeMetrics` × `effectiveDefensePositions` cachée via WeakMap.

### Édition avancée

#### 🟢 Undo / Redo (v1)
Implémenté dans `useAppState` : pile `historyRef` (past/future) cap à 50, wrapper `setStateWithHistory` qui pousse l'état précédent à chaque mutation utilisateur. `undo` / `redo` exposés. Raccourcis `Ctrl/Cmd+Z` (undo) et `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` (redo) câblés dans `useKeyboardShortcuts`.

🟢 **v2 livré** : coalescing pendant le drag via `commitCoalescedHistory` + `dragHistoryAnchorRef` dans [`appStateHistory.ts`](src/lib/logic/appStateHistory.ts). Un drag continu = **1 seule entrée** dans la pile undo (snapshot pris au `beginPlayerDrag`, push différé au `commitPlayerDrag`). Réutilisé par la sélection multiple (#4) pour qu'un drag groupé soit aussi une seule entrée.

#### 🟢 Sélection multiple (V1 livré 2026-05-12)
State éphémère `selectedDefenders: Set<DefenderId>` dans CourtView.
Shift+clic = toggle, Shift+drag dans le vide = marquee, Esc = clear,
clic sur défenseur sélectionné = drag groupé (delta appliqué à tous,
1 entrée undo via le pattern beginPlayerDrag/DuringDrag/commitPlayerDrag
existant). Halo cyan + mini panneau info. 699 tests verts. **V2** : édition
groupée des `DefenderRule` (helpPct, priority…), pas couverte en V1.

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

### 🟢 Templates utilisateurs — presets défensifs (livré 2026-05-12)
Defense presets perso sauvegardables/rechargeables. Étend `UserLibrary`
existante avec `defensePresets?: UserDefensePreset[]`. Snapshot inclut
les 16 champs défensifs (rules + screen + offBall + triggers + B1-B10).
UI dédiée dans `DefensePanel` (vert distinct des presets globaux bleus).
10 tests unitaires. **688 tests verts**.

**Côté offensif** : déjà couvert par `SavedSystem` + `useLibrary` (la
bibliothèque utilisateur). Format différent (snapshot complet d'un
système avec steps + défense), mais le besoin "sauvegarder son
travail" est rempli.

### ⚪ Annotations textuelles libres
**Quoi.** Pouvoir déposer une note texte n'importe où sur le terrain ("trap si le 5 monte", "force baseline", "skip pass option"). Distincte des flèches d'action — c'est du commentaire libre, pour expliquer l'intention.

**Implémentation.** Étendre `AnnotationType` avec `'text'` dans `lib/types/index.ts`. Nouveau champ optionnel `text?: string` dans `Annotation`. Le `from` représente l'ancrage (point sur le terrain), `to` est ignoré. Nouvel outil `T` (Text) à côté de `M / P / D / R / E` dans `OffensePanel`. Au clic sur le terrain en mode texte, prompt inline : un `<foreignObject>` SVG affiche un `<input>` qui devient un `<text>` au blur. Rendu dans `Annotations.tsx` : un `<text>` avec fond blanc semi-opaque (rectangle de fond + label centré). Edit/delete au clic sur le texte (réouvre l'input).

**Effort** ~2h · **Risque** 🟡 · **Valeur** haut.

**Tradeoffs.** `<foreignObject>` a des bugs historiques sur Safari (rendu, scroll, focus). **Plan B** : édition via une modal/popup en HTML standard au lieu d'inline. Moins fluide mais plus robuste. Si on prend le plan B, on peut remplacer l'input inline par un `prompt()` ou une vraie modal. Décider au moment de l'implémentation après un essai foreignObject sur Safari.

**Découpage suggéré** : (a) ajout du type + outil + rendu, (b) édition inline ou modal, (c) édition/suppression d'une annotation existante.

---

## Synthèse priorisation (chantiers ⚪ restants)

### UX / Produit — 3 chantiers restants

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| 5 | Mode présentation v2 (fullscreen navigateur natif) | <30min | 🟢 | Moyen |
| 6 | Export GIF/vidéo | 3-4h | 🟡 | **Très haut** (partage) |
| 8 | Annotations texte libres | 2h | 🟡 | Haut |

✅ **Livré 2026-05-12** : 1 (saisie num sliders), 2 (snap-to-grid),
3 (graphique métriques), 4 (sélection multiple V1), 7 (templates user).

### Logique basket — concepts défensifs (audit mai 2026) — ✅ TOUS LIVRÉS (2026-05-12)

Audit du moteur défensif → 10 concepts manquants identifiés et tous
livrés en une session. **+74 nouveaux tests** (B1-B10 + V2/v3).

| # | Chantier | Version | Tests |
|---|---|---|---:|
| ~~B1~~ | Mismatch tracking + scram switch | V1 | 17 |
| ~~B2~~ | Reject screen detection | V1 diag + V2 unwind | 9+4 |
| ~~B3~~ | Hard / soft hedge | V1 | 5 |
| ~~B4~~ | Snake dribble detection | V1 diag + V2 keep coverage | 8+4 |
| ~~B5~~ | Empty side PnR | V1 | 5 |
| ~~B6~~ | Dig / double au post | V1 | 4 |
| ~~B7~~ | Defensive 3 sec (FIBA) | V1 | 4 |
| ~~B8~~ | Switch policy granulaire | V1 | 10 |
| ~~B9~~ | Top-lock off-ball avec timing | V1 | 10 |
| ~~B10~~ | Bumping cutters automatique | V1 | 4 |
| ~~Trap v3~~ | Coexistence trap + écran | v3 | 7 |
| ~~Undo/Redo v2~~ | Coalescing drag | (déjà fait) | — |

**Total UX/Produit restant** : ~5-7h pour les 3 chantiers ⚪.
**Total logique basket restant** : 0 (tous livrés).

Détail complet dans [docs/session-2026-05-12.md](docs/session-2026-05-12.md).

**Ordre conseillé UX restant** : 5 (mode présentation v2, <30min, quick
win tablette) → 8 (annotations texte, valeur haute) → 6 (export vidéo,
le plus impactant pour le partage).

**Limites v3 documentées sur les chantiers déjà v2** :
- ✅ **Trap v3** livré : coexistence trap + écran (cf. section "Trap v3" plus haut).
- ✅ **Staggered v3** livré : double courbe Bezier (`pickStaggeredPair` + `curveAroundStaggeredPair`).
- ✅ **Inversion HOOP v3** livré : rendu visuel "🎯 visé" / "🛡 protégé".
- ✅ **Closeout / Denial** : tunables globaux + override par règle individuelle.
- ✅ **Undo/Redo v2** : coalescing drag via `commitCoalescedHistory`.
- ✅ **B2 V2** : unwind reject (cf. section B2 plus haut).
- ✅ **B4 V2** : snake keep coverage (cf. section B4 plus haut).

---

## 4. Dette technique & refactos restants

La passe de refacto de mai 2026 a découpé `engine.ts` (982 → 117 lignes) et `CourtView.tsx` (1222 → 811 lignes), centralisé les constantes physiques, et regroupé les overlays.

**Cycle modularité (mai 2026, post-refacto)** — 6 gros fichiers découpés
sans changement de comportement. Cf. [docs/refactoring-history.md](docs/refactoring-history.md)
pour les patterns réutilisables (barrel + dossier, transforms purs + hook
mince, hooks + sous-composants, registry de règles).

### 🟢 A4 — `scriptedGenerators.ts` (1502 → 92 LOC) — barrel + tier1/2/3

57 générateurs d'actions FIBA répartis par tier dans `src/lib/logic/scriptedGenerators/` :
- `helpers.ts` — géométrie commune + type `Generator`
- `tier1.ts` — 19 actions de base (PnR, cuts, screens, drive, shoot, iso)
- `tier2.ts` — 30 variantes (cuts spécialisés, off-ball, PnR variants, combos)
- `tier3.ts` — 9 sets d'entrée (horns, floppy, pistol, ucla, diamond…)
- `scriptedGenerators.ts` (index) — mapping action FIBA → générateur

Pour ajouter une action FIBA : écrire `genFooBar` dans le bon tier + une
ligne `'foo-bar': t<N>.genFooBar` dans le mapping.

### 🟢 A5 — `useAppState.ts` (967 → 510 LOC) — transforms purs

Hook réduit à **persistance + history + câblage**. La logique des
mutations vit dans 8 namespaces de fonctions pures `(state, ...args) =>
state` dans `src/lib/state/transforms/` :
- `stepTransforms` · `annotationTransforms` · `defenseTransforms` · `attackerTransforms`
- `zoneTransforms` · `scenarioTransforms` · `defensiveScriptedTransforms` · `coreTransforms`

61 tests unitaires ajoutés sur ces transforms (sans React, sans
localStorage). Total : **602 tests verts**.

### 🟢 A6 — Tests composants

Couvert par les 61 nouveaux tests sur les transforms `useAppState` (cf.
A5) + tests existants sur `polyline`, `dribbleWave`, `frameResolver`,
`appStateHistory`, etc. Les sous-composants extraits de CourtView /
ContextMenu sont testables, à compléter si besoin.

### 🟢 A7 — `CourtView.tsx` (902 → 446 LOC) — hooks + sous-composants

- `hooks/useCourtFrame.ts` — calcule staticFrame / scrubFrame / playFrame + threats
- `hooks/useCourtPointerHandlers.ts` — drag joueurs (rAF) + tracé d'annotations
- `components/court/CourtPlayersLayer.tsx` — sprites + screener gaze override
- `components/court/CourtMenus.tsx` — context menus (def/att) + zone region

### 🟢 A8 — `ContextMenu.tsx` (897 → 22 LOC) — dispatch + 5 modules

- `popupHooks.ts` · `ToolBar.tsx` · `sharedRows.tsx` · `DefenderMenu.tsx` · `AttackerMenu.tsx`

Ajouter une row à un menu = éditer le fichier dédié, plus de scroll de 900 l.

### 🟢 A9 — `screens.ts` (822 → barrel + 5 modules)

Épicentre des bugs récurrents, isolé en domaines clairs :
- `helpers.ts` · `detectCarrierScreen.ts` · `carrierScreenAdjust.ts`
- `detectOffBallScreens.ts` · `offBallScreenAdjust.ts`

Ajouter une rule défensive (over/under/hedge/…) = éditer 1 fichier ciblé.

### 🟢 A10 — `coachDiagnostics.ts` (834 → barrel + 13 rules) — registry pattern

Pattern de registry : chaque diagnostic vit dans `rules/<name>.ts` sous
forme `(ctx) => CoachDiagnostic[]`. Pour ajouter un diagnostic basket :
créer 1 fichier dans `rules/` + 1 entrée dans `REGISTRY`. Plus aucune
lecture des 833 autres lignes.

### ⚪ A11 — Box-out / rebond après tir (demi-jeu manquant)

**Quoi.** Le moteur ne réagit pas au tir. Aucun box-out, aucun
positionnement de rebond, aucune transition possession. C'est un
**demi-jeu** du basket complètement absent.

**Pourquoi c'est dans dette technique (pas dans § 1 Logique basket).**
Parce que c'est un changement de **scope** du moteur, pas un raffinement
d'une couche existante : il faut ajouter un type d'événement (le tir
comme moment qui termine la séquence), une nouvelle phase de simulation
(box-out → rebond → outlet), et probablement un nouveau type de step
(`step.kind: 'play' | 'shot' | 'rebound'`).

**Plan haut niveau** :
- Annotation `shoot` existe → l'enrichir avec `shotOutcome: 'made' | 'missed' | 'blocked'`.
- Nouvelle couche défense `boxOutLayer` qui s'active sur step shooting :
  chaque défenseur fait un box-out sur son homme (offset vers le panier).
- Modèle de rebond simple : probabilité par zone + profil (bigs +30 %,
  guards -10 %), tirage déterministe.
- Outlet pass : si rebond défensif, possession bascule, nouveau step de
  transition.
- Estimation : **5-8 jours**, P2. C'est une feature majeure.

**Décision projet** : pas avant que les 10 items § 1 Concepts défensifs
soient instruits. Le moteur actuel sert très bien à enseigner la défense
de placement ; le rebond est une couche au-dessus.

### 🟢 Mode "Play IA — voir un match jouer tout seul" (B1-B5) — LIVRÉ 2026-05-15

L'infrastructure complète existe : game loop autonome 5 Hz, intent
persistant par joueur (porteur + 4 off-ball), transition multi-possessions
(rebond offensif 28 %), UI live synchronisée, calibration Monte-Carlo.

**Effort réel** : ~3j (vs 10-15j estimé init, sous-estimation initiale
des synergies avec le moteur existant).

**Récap des chantiers livrés** :

| # | Status | Commit | Description |
|---|---|---|---|
| ~~B1~~ | 🟢 | `edb43e6` | Game loop continu 5 Hz, intent porteur (drive/pass/shoot) |
| ~~B3a~~ | 🟢 | `bd2dccf` | Shot model enrichi (zone, contestation, position) |
| ~~B2~~ | 🟢 | `0da33a4` | Décideur off-ball (cut, drift, relocate) avec budget cuts |
| ~~B4~~ | 🟢 | `ac1bece` | UI live complète (CourtView + HUD synchronisés) |
| ~~B3b~~ | 🟢 | `40e5f0f` | Transition multi-possessions stub (off reb / new poss) |
| ~~B5~~ | 🟢 | `2e9ffee` | Calibration live vs Monte-Carlo (±0.15 PPP cible) |

**Stack du moteur de match autonome** :
- `src/lib/logic/match/gameLoop.ts` — tick pipeline + transitions
- `src/lib/logic/match/decisions/offBallMover.ts` — movers off-ball
- `src/lib/logic/match/calibration.ts` — headless runner + comparison
- `src/hooks/useMatchLoop.ts` — hook React 5 Hz avec start/pause/resume/stop
- `LiveMatchPanel` + `CalibrationPanel` dans `SimulationSection`

**Limites V1 conservées** :
- Pas d'écrans off-ball auto (V2 si besoin — design dans `offBallMover.ts`)
- Modélisation possession adverse absente (chaque nouvelle possession
  reste offensive pour notre équipe — stub assumé)
- Calibration manuelle pour l'instant (boucle de tuning auto = V2)

**Suite naturelle (hors Phase I)** : si Phase E.1 (box-out / rebond)
est un jour livrée, brancher B3b dessus pour avoir un vrai cycle de
possession adverse complet. Sinon V1 stub reste fonctionnel.

---

## 5. Audit transverse (2026-05-12) — chantiers restants par phase

Audit complet de l'état du moteur sur 5 dimensions (technique, logique
basket, trajectoires, vitesse réelle, notion du temps). Ce qui suit
ordonne les **chantiers identifiés mais non livrés**, par phases qui
respectent leurs dépendances logiques.

> 📌 La priorisation suit 3 principes :
> 1. **Quick wins avant features lourdes** — UI accessible avant
>    nouvelles features qui n'auraient pas de surface utilisateur.
> 2. **Foundations avant superstructures** — la notion du temps
>    (durée per step) débloque shot clock, end-of-clock defense, etc.
> 3. **Réalisme modéré avant changement de scope** — affiner le moteur
>    existant avant d'ajouter le rebond (= demi-jeu = +5-8 jours).

---

### Phase A — Quick wins UI accessible (~3-4h total)

Features livrées en code mais sans surface UI dédiée, ou UX simples
hautement valorisantes.

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~A.1~~ | ~~Visu nouvelles features défensives dans `DefensePanel`~~ — 🟢 livré 2026-05-12 | — | — | — |
| A.2 | Mode présentation v2 — fullscreen navigateur natif (`document.documentElement.requestFullscreen()`) | <30min | 🟢 | Moyen |
| A.3 | Annotations texte libres (outil `T`, dépôt + édition d'une note sur le terrain) | 2h | 🟡 | Haut |
| ~~A.4~~ | ~~V3 visu sur détections : badges/overlays~~ — 🟢 livré 2026-05-12 | — | — | — |

---

### Phase B — Notion du temps (foundation, ~1 jour)

Aujourd'hui : steps abstraits, durée uniforme 2 s, pas de shot clock.
Cette phase pose les fondations pour la suite (closeout réaliste, end-of-clock defense, etc.).

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~B.1~~ | ~~**Durée individuelle par step** : nouveau champ `step.duration?: number` (s, default `state.secondsPerStep`). Timeline + MultiTrack + Playbook recap utilisent `realStepToSeconds` cumulé.~~ | — | — | — | 🟢 livré 2026-05-17 (17 tests, 1262 verts) |
| B.2 | **Shot clock display** (24 s NBA / 14 s reset) : décrémente au fil des steps (basé sur leur durée cumulée). Couleurs vert/jaune/rouge selon temps restant. | 1-2h | 🟢 | Moyen-haut | ⚪ |
| ~~B.3~~ | ~~**End-of-clock defense awareness** : helper + règle coach 'warning' + badge SVG `🚫 NO FOUL` quand clockSeconds<5 ET fautes≥5 (équipe en bonus). Exclusif de F.4 sur l'axe defenseTeamFouls.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (7 tests, 1286 verts) |
| B.4 | **Synchronisation cross-actor** : `annotation.tStart/tEnd` en secondes ABSOLUES plutôt que fraction du step. Permet à O1 (dribble 1.5s) et O5 (cut 0.8s) de finir à des moments différents. | 4-6h | 🟡 | Moyen | ⚪ |

---

### Phase C — Réalisme physique modéré (~1-2 semaines)

Affinement du moteur défensif existant. Pas de changement de scope —
juste plus de fidélité tactique.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~C.1~~ | ~~**Closeout footwork** : sprint+freinage via `closeoutEasing`~~ | — | — | — | 🟢 livré 2026-05-12 (7 tests, 721 verts) |
| ~~C.2~~ | ~~**Help-and-recover timing** : `helpStickiness` (1..3 steps) avec decay~~ | — | — | — | 🟢 livré 2026-05-13 (10 tests, 857 verts) |
| ~~C.3~~ | ~~**Hedge length** : `hedgeRecoveryDelay` (1..3 steps)~~ | — | — | — | 🟢 livré 2026-05-12 (8 tests, 732 verts) |
| ~~C.4~~ | ~~**Pre-rotation shift** : anticipation pré-écran (~10 px)~~ | — | — | — | 🟢 livré 2026-05-12 (10 tests, 746 verts) |
| ~~C.5~~ | ~~**Tag-then-switch dynamic** : `tagThenSwitchEnabled`~~ | — | — | — | 🟢 livré 2026-05-12 (4 tests, 736 verts) |
| ~~C.6~~ | ~~**Help angle** : mode `open-weighted` (distances)~~ | — | — | — | 🟢 livré 2026-05-12 (3 tests, 724 verts) |
| ~~C.7~~ | ~~**Read offensive action chains** : V1 diag/badge + V2 réaction défensive (re-screen tangentiel + flare-fade gazeLock)~~ | — | — | — | 🟢 V1 + V2 livrés 2026-05-13 (21 tests, 888 verts) |

#### 🟢 C.2 — Help-and-recover timing — livré

**Problème résolu.** Un défenseur aidait au step N (helpTriggered=true),
puis revenait instantanément sur son homme au step N+1. Maintenant le
recover est progressif, avec decay configurable en steps ou en ms.

**V1 livré 2026-05-13** (compteur step-based, 10 tests).
- Helper pur `defense/helpStepCounter.ts::consecutiveHelpSteps(state, stepIdx, defenderId)` (compte les steps consécutifs avec trigger d'aide plausible — drive/post/paint + helpPct>0 + stance sag).
- Setting opt-in `state.helpStickiness?: number` (range 1-3, default undefined = legacy).
- Couche d'intégration `defense/helpStickyLayer.ts` (couche 1.6, après baseTargets/rimProtection, avant pnrRotations). Skip si onScreen, pnrRole, switchedThisStep, scrammedThisStep. Decay : `blendFactor = 1 - consec / stickiness`.

**V2 livré 2026-05-17** (conversion temps réel, 8 tests, 1262 verts).
- Setting opt-in `state.helpStickinessMs?: number` (range 100-2500 ms). Prime sur V1 quand défini.
- Helper `cumulatedHelpMs(state, stepIdx, defenderId)` : somme `Step.duration × 1000` sur les steps comptés par `consecutiveHelpSteps`. Dépend de B.1 (step.duration) pour la granularité réelle, fallback `state.secondsPerStep` sinon.
- `helpStickyLayer` : si V2 actif, `blendFactor = 1 - cumMs / stickinessMs`. Plus fidèle basket (1200 ms ≈ standard NBA, indépendant du découpage en steps).
- UI : slider 0-2500 ms par pas de 100 ms dans `DefensePanel` (section *Couvertures avancées*) ; activation V2 → désactive V1 legacy automatiquement.

#### ⚪ C.7 — Read offensive action chains — détail du plan

**Problème actuel.** Une action complexe = enchaînement de plusieurs
écrans (flare → curl → fade, stagger sequential, re-screen, curl-into-cut)
est détectée step par step **sans continuité**. La défense ne "lit" pas
la séquence — elle réagit au 2ᵉ acte comme si le 1er n'avait jamais eu
lieu, donc se fait avoir par les mêmes patterns en boucle.

**V1 — Chain detection only (pas de modif comportement).**
- Helper pur `screens/detectScreenChain.ts` qui scanne N-2 / N-1 / N (lookback 3 frames) pour identifier 4 patterns :
  - **`re-screen`** : même poseur sur même cutter à 2 steps non consécutifs (déjà partiellement couvert par C.4 snake mais pour le porteur uniquement)
  - **`stagger-sequential`** : 2 poseurs différents successivement sur le même cutter (≤ 2 steps d'écart)
  - **`flare-then-fade`** : cutter écran-flare au step N-2/N-1, puis fade hors-ballon vers le coin au step N (delta y du cutter inversé)
  - **`curl-then-recut`** : cutter coupe (vers panier), ressort (loin du panier au step suivant), recoupe (vers panier au 3ᵉ)
- Retour `ScreenChain | null` avec `type`, `cutter: AttackerId`, `steps: [stepIdx, ...]`.
- Règles coach dédiées dans `coachDiagnostics/rules/screenChain.ts` (4 sous-règles, 1 par pattern).
- Badge SVG visuel par chaîne détectée (chaînon `🔗` sur le cutter, info-bulle au hover).

**V2 — La défense réagit.**
- Setting opt-in `state.readScreenChainsEnabled?: boolean`.
- Effet par pattern :
  - `re-screen` détecté → +20 quality effective sur le 2ᵉ acte
  - `stagger-sequential` → bascule `top-lock → chase` au 2ᵉ poseur (déjà fait par C.B9 cutterScreenChain — réutiliser ce câblage)
  - `flare-then-fade` → le défenseur du cutter passe en `gazeLock: 'opponent'` pour rester avec le shooter (no help)
  - `curl-then-recut` → le défenseur du cutter shifte 8 px vers la ligne 3 points (anticipation du recut)
- Pas de modification matchups, juste qualité/règles locales.

**Tests** : 4 patterns × (1-2 cas négatifs + 1 cas positif) + 2 cas intégration V2 = ~12 tests.

**Estimation** : 4-5h V1, +2h V2.

**Risque 🟡** : intersection avec C.4 (snake) et B9 (cutterScreenChain) — doit être conçu pour ne pas double-déclencher.

---

### Phase D — Trajectoires raffinées (~1-2 semaines)

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~D.1~~ | ~~**Easing cross-step** : `state.movementEasing?: 'linear' \| 'ease-in-out' \| 'ease-out'` appliqué sur localT du frameResolver. Default 'linear' = legacy. Invariants snapshots step préservés (e(0)=0, e(1)=1).~~ | — | — | — | 🟢 V1 livré 2026-05-18 (8 tests, 1303 verts) |
| D.2 | **Inertie / momentum** : un changement de direction brutal coûte du temps. Modélisé via courbe `acceleration(dt)`. Joueurs moins "robotiques". | 2-3j | 🟡 | Haut (réalisme visuel) |
| ~~D.3~~ | ~~**Trajectoires de passes V1** : `Annotation.passKind?: 'direct' \| 'lob' \| 'bounce' \| 'skip'`. computeBallFrame étendu : lob ×0.65 lift (plafond 130 px), skip ×0.12 (plafond 40 px), bounce 2 paraboles (touche sol à mi-trajet), direct ×0.28 (legacy).~~ | — | — | — | 🟢 V1 livré 2026-05-18 (7 tests, 1310 verts) |
| D.4 | **Pathfinding A* défensif** : un défenseur va en ligne droite vers sa cible, `resolvePlayerCollisions` corrige a posteriori. A* simplifié sur obstacles dynamiques éviterait le bruit. | 3-4j | 🔴 | Moyen |
| D.5 | **Anti-collision pendant l'interpolation** : `resolvePlayerCollisions` agit sur les cibles, pas sur les positions interpolées entre steps. Collisions transitoires visibles. | 1-2j | 🟡 | Moyen |

**D.2 V1 livré 2026-05-15.** `resolveFrameAt` a maintenant une
mémoire courte de vélocité défensive (`motionMemory`) et amortit les
changements de direction violents pendant le playback. L'effet est
désactivé sur écran verrouillé et override manuel, puis repasse par les
collisions + rate limiter. Reste une V2 plus profonde si besoin :
accélération/top speed par profil joueur et pathfinding défensif
pré-collision.

**D.2 V2 livré 2026-05-15.** L'inertie playback est maintenant modulée
par `rule.maxSpeed` : guards plus réactifs, intérieurs plus lourds sur
les changements de direction. Pas de nouveau champ utilisateur ; on
réutilise le profil vitesse existant.

**D.5 V1 livré 2026-05-15.** Passe finale de collision sur la frame
interpolée après inertie/rate limiter : poseurs et défenseurs lockés
restent fixes, les autres joueurs sont séparés par une clearance
visuelle bornée, puis reclamp anti-saut. Les golden metrics montent le
seuil minimal de clearance playback de 10 px à 20 px.

**D.4 exploration 2026-05-15.** Ne pas brancher un A* global directement
dans `effectiveDefensePositions` : le moteur écran possède déjà ses
routes tactiques (`over/under/hedge`, stagger/elevator, side constraints)
et un A* naïf risquerait de les contredire. Chemin sûr recommandé :
1. créer un helper pur `defensiveRoute` qui génère 2-3 routes candidates
   autour des obstacles dynamiques non-screen ;
2. l'activer uniquement hors `screenLockedDefenders`, hors override
   manuel, et seulement si le segment direct coupe plusieurs obstacles ;
3. garder les endpoints de step inchangés, ne modifier que la trajectoire
   playback ;
4. comparer via golden metrics (`maxJump`, `minClearance`, temps resolve)
   avant d'envisager un vrai A* grille.

---

### Phase E — Changement de scope (le gros)

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| E.1 | **A11 — Box-out / rebond après tir** | 5-8j | 🟡 | **Très haut** — demi-jeu manquant |
| E.2 | Export GIF / vidéo | 3-4h | 🟡 | **Très haut** — diffusion |

Détail A11 (cf. section 4 plus haut) : enrichir `annotation.shoot` avec
`shotOutcome`, nouvelle couche `boxOutLayer`, modèle de rebond, transition
de possession. Reset shot clock à 14 s (rebond offensif) ou switch possession.

---

### Phase F — Concepts spécialisés haute compétition

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| F.1 | **Junk defenses** (box-and-1, triangle-and-2, diamond-and-1) | 6h V1 / 2j V2 | 🟡 | Moyen-haut |
| F.2 | **Press full/half-court** : pression tout terrain | 10-12h V1 | 🔴 | Moyen |
| ~~F.3~~ | ~~**Free throw rebound positioning** : 10 positions canoniques + transform + badge UI~~ | — | — | — | 🟢 livré 2026-05-13 (11 tests, 899 verts) |
| ~~F.4~~ | ~~**End-of-quarter foul to give** : helper + diag critical + badge SVG `🟥 FOUL TO GIVE` + UI globale (defenseTeamFouls) + per-step (clockSeconds)~~ | — | — | — | 🟢 V1 livré 2026-05-18 (9 tests, 1279 verts) |
| ~~F.5~~ | ~~**Late shot clock defense** : `lateShotClockLayer` (couche 1.7, opt-in via lateShotClockDefenseEnabled + step.shotClockRemaining<5). carrierDef contest accru, autres défenseurs no-help.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (5 tests, 1279 verts) |

#### ⚪ F.1 — Junk defenses — détail du plan

**Concept.** Défense hybride : 3-4 joueurs en zone autour de la raquette,
1-2 chasseurs en homme strict sur les shooters adverses. Utilisé en
niveau lycée/college NCAA contre une équipe à 1-2 stars marqués.

**V1 — Box-and-1 seul.**
- Nouveau `DefenseSystem`: `'junk'` à côté de `'man'` / `'zone'`.
- Nouveau champ `state.junkConfig?: { type: 'box-and-1'; chaser: AttackerId }`.
- Couche dédiée `defense/junkLayer.ts` exécutée **avant baseTargets** (ou en remplacement) quand `defenseSystem === 'junk'` :
  - 4 défenseurs (≠ chaser's defender) sur 4 slots prédéfinis (corners de la raquette : 2 hauts, 2 bas).
  - 1 défenseur sur `chaser` en marquage strict via override `vsCarrier: 'topside'` + `offBallStance: 'deny-3q'`.
- Slot zone géométrique = `(hoop.x ± 80, hoop.y ± 60)`, calibré FIBA.
- Le défenseur du chaser **ne quitte jamais** le chaser (helpMode='disabled' forcé).
- UI : select `Système → junk` → sous-options "type" + "chaser (par nom)".
- Réutilise les briques offBallStance/vsCarrier existantes. Aucune refonte matchups.
- Tests : 4-5 (positions box, chaser suit, chaser tag-along, switch désactivé).

**V2 — Triangle-and-2 + Diamond-and-1.**
- Étend `junkConfig.type` à `'triangle-and-2' | 'diamond-and-1'`.
- `triangle-and-2` : 3 défenseurs en triangle (1 haut, 2 bas) + **2 chasseurs**.
- `diamond-and-1` : 4 défenseurs en diamant (1 haut, 2 ailes, 1 bas) + 1 chasseur. Géométrie 1-2-1 typique NCAA.

**Estimation** : V1 6h, V2 +6h. **Valeur** : permet de simuler des
défenses non-conventionnelles très demandées par les coachs lycée/U18.

#### ⚪ F.2 — Press full/half-court — détail du plan

**Concept.** Pression tout terrain : la défense reste côté offensif après
une réussite et harcèle la remise en jeu / la montée de balle. Très
chronophage à implémenter car contredit l'hypothèse "tout le jeu côté
défense" du moteur actuel.

**V1 — Half-court trap presse "2-2-1".**
- Nouveau flag `state.pressMode?: 'half-court' | undefined` (V1 ne fait pas full-court).
- Géométrie quand `pressMode === 'half-court'` :
  - 2 défenseurs sur la ligne médiane (D2, D3) en `vsCarrier: 'topside'`
  - 2 défenseurs dans la zone de relais (D1, D4) en `offBallStance: 'fronting'`
  - 1 protecteur arrière au centre du terrain (D5) en `behind`
- Trigger trap : **réutilise** `applyTrap` existant. Quand le porteur franchit la ligne médiane (côté offensif), 2 défenseurs proches sautent dessus.
- Inversion partielle de `getDefenseHoop` : les défenseurs regardent vers leur propre panier (le panier OFFENSE pendant la presse).
- Pas de "vrai" full-court : pas de simulation d'inbounds, pas de turnover, pas de retraite si la presse est cassée.
- UI : sélecteur "Pression : aucune / half-court" dans DefensePanel.
- Tests : 4-5 (positions presse, trap au franchissement, orientation joueurs).

**V2 — Full-court + retreat.**
- `pressMode: 'full-court'` : positions encore plus hautes (côté inbound).
- Retraite progressive si porteur dépasse la ligne médiane (60 % du chemin → retour homme-à-homme).

**Estimation** : V1 10-12h (le plus coûteux des F.*), V2 +2j.
**Risque 🔴** : touche `getDefenseHoop` (orientation par défaut des défenseurs) et plusieurs hypothèses du moteur. **À éviter sauf demande coach explicite.**

#### 🟢 F.3 — FT rebound positioning — livré

V1 entièrement intégrée bien avant cette session (l'item ⚪ était une
désynchronisation du ROADMAP) :
- `src/lib/logic/freeThrowSetup.ts::buildFreeThrowSetup()` — 10
  positions canoniques (O1 tireur, D4/D5 blocks, O4/O5 slots, D1 trail,
  O2/O3 + D2/D3 outlets 3pt). Toutes les paires respectent
  `PLAYER_MIN_CLEARANCE_PX`.
- `convertStepToFreeThrow(s)` dans `stepTransforms.ts` (transform pur +
  `Step.context: 'free-throw'` + `defenseOverrides` posés).
- UI : bouton "convertir en LF" dans StepsPanel + badge `🏀 LF` sur
  les steps contexte free-throw.
- Extension F.2 livrée 2026-05-16 : `buildFreeThrowReboundSetup(made)`
  + `addFreeThrowReboundStep` pour la phase course-rebond.
- Tests : `f3FreeThrowSetup.test.ts` — 11 tests (canoniques + transform
  + invariant clearance + intégration engine).

Le détail du plan ci-dessous reste comme référence historique.

⚪ Plan d'origine (livré) :

**Concept.** Sur un lancer franc, les 10 joueurs occupent 6 slots
normalisés autour de la raquette (NBA/FIBA rules). Defense prend cases
1-3 (intérieures, plus proches du panier), offense prend cases 2-4.

**V1 — Positions statiques.**
- Nouveau champ `Step.context?: 'live-play' | 'free-throw'` (default `'live-play'`).
- Quand `context === 'free-throw'` :
  - Positions des 10 joueurs **forcées** sur les 6 slots normalisés relatifs au panier :
    - Defense slots 1+3 (bas de la raquette) + 1 trail (libre throw line) + 1 weak-side outlet (3pt opposé)
    - Offense slots 2+4 (proches panier) + 1 shooter sur ligne de tir + 1 outlet
  - 1 attaquant supplémentaire en backcourt (transition defense).
- Setup automatique via `applyFreeThrowSetup(state)` au moment où on convertit un step.
- UI : bouton "convertir en LF" dans le panneau étape.
- Pas de simulation du tir lui-même — juste positions statiques visualisables (utile pour rappels visuels coach).
- Tests : 3-4 (setup applique 10 positions, contexte préservé sur step suivant, conversion réversible).

**Estimation** : V1 4h. Pas de V2 prévue (sauf à ajouter rebond offensif/défensif post-shot, qui touche E.1).

#### 🟢 F.4 — End-of-quarter foul to give — livré

**Concept.** Si l'équipe en défense a < 5 fautes au quart-temps, elle
peut "foul to give" sur les dernières secondes pour empêcher un
tir-au-buzzer. Stratégie ultra-courante NBA/EuroLeague.

**V1 — Diagnostic + badge.**
- Nouveau champ `step.clockSeconds?: number` (sec restantes au quart). Si absent, helper inactif.
- Nouveau champ `state.defenseTeamFouls?: number` (fautes équipe défense au quart, default 0). Range 0-5.
- Helper pur `defense/detectFoulToGiveOpportunity.ts` qui détecte :
  - `step.clockSeconds < 5`
  - `state.defenseTeamFouls < 5`
  - Porteur en mouvement vers le panier (`triggers.drive === true` ou delta vers hoop > 30 px)
- Affiche un **badge SVG** sur le défenseur du porteur : cercle rouge `🟥 FOUL TO GIVE` + info-bulle.
- Pas de modif des positions (V1 = coach voit l'opportunité, agit en plaçant manuellement).
- Tests : 4-5 (positifs + 3 négatifs : fautes ≥ 5, clock > 5s, pas de drive).

**V2 — La défense modifie sa trajectoire.**
- Sous condition `state.foulToGiveAutoEnabled`, le carrierDef change de cible pour intercepter physiquement (collision target sur le porteur).
- Ajoute un flag `step.simulatedFoul: DefenderId` qui freeze le step suivant.

**Estimation** : V1 2-3h (juste détection + badge), V2 +3h.

#### 🟢 F.5 — Late shot clock defense — livré

**Concept.** Sous les 5 dernières secondes du shot clock, la défense
sait que l'attaquant DOIT shooter. Donc : contest tout, no fouls, no
help (pas besoin de couvrir un dump-off ou un kick-out).

**V1 — Modulation globale.**
- Nouveau champ `step.shotClockRemaining?: number` (sec restantes au shot clock, default 24).
- Setting `state.lateShotClockDefenseEnabled?: boolean` (opt-in).
- Effet quand `shotClockRemaining < 5` ET flag activé :
  - Tous les `closeoutBoost` boostés ×1.3 (closeout encore plus rapide)
  - Tous les `helpMode` forcés à `'passive'` (no help, contest direct)
  - Tous les `vsCarrier` poussés vers `'contester'` (haute pression sur le porteur)
- Couche d'intégration `defense/lateShotClockLayer.ts` (après baseTargets, avant pnrLayer) : applique les modulations en mutant `positions` et flags.
- UI : checkbox + champ "shot clock restant" dans le step panel.
- Tests : 4-5 (modulation active, pas active si flag off, pas active si clock > 5).

**V2 — Intégration timeline.**
- Calcul automatique de `shotClockRemaining` à partir des durées cumulées (dépend B.1 et B.2).
- Reset auto à 24/14 sur tir / rebond offensif (dépend E.1).

**Estimation** : V1 3h. V2 dépend de B.1+B.2+E.1 livrés.

---

### Phase G — Calibration vitesse réelle (~2-3 jours)

Aujourd'hui : D1 max 1.96 m/s ≈ 7 km/h = **22 % d'un sprint NBA réel**.
Calibré pour les **mouvements tactiques**, pas les sprints. À expliciter
ou affiner.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~G.1~~ | ~~**Doc calibration explicite** : nouveau `docs/physics-calibration.md` qui pose le scope tactique vs sprint réel, ratios chiffrés vs NBA, coût d'un passage en sprint, cas où le mode tactique gêne.~~ | — | — | — | 🟢 livré 2026-05-18 |
| ~~G.2~~ | ~~**Sprint contextuel** : `step.sprintBoost?: boolean` ×1.8 sur la vitesse max effective défense. Cumulable avec G.4 et closeoutBoost. UI : toggle dans StepsPanel sur step actif.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (4 tests, 1295 verts) |
| G.3 | **Différenciation accélération vs top speed** : un guard atteint 9 m/s mais met 2 s à y arriver. Aujourd'hui binaire. | 2-3j | 🟡 | Haut (réalisme) | ⚪ |
| ~~G.4~~ | ~~**Profil athlétique** : `state.defenderSpeedProfiles?: Partial<Record<DefenderId, 'elite' \| 'standard' \| 'lent'>>` multiplie maxSpeed effective ×1.3 / ×1.0 / ×0.7. Module per-défenseur en plus de MAX_SPEED_BY_POSITION.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (5 tests, 1291 verts) |

---

### Phase H — Tests composants React (~3-4 jours)

Aujourd'hui : zéro test sur `src/components/`. Convention du projet, OK
historique mais limite à terme. Si on veut renforcer :

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| H.1 | Setup `@testing-library/react` + `jsdom` | 2h | 🟢 | (foundation) |
| H.2 | Tests CourtView pointer handlers (drag single, drag groupé, marquee, snap) | 1-2j | 🟡 | Haut |
| H.3 | Tests MetricsChart, MetricsBar, DefensePanel toggle | 1j | 🟢 | Moyen |
| H.4 | Tests ContextMenu (DefenderMenu, AttackerMenu) | 1j | 🟢 | Moyen |

---

### Phase I — Mode Play IA (🟢 100% livrée, B1 → B7 + V2 stage 1+2a)

**Status final 2026-05-16** : 100% livrée (B1-B5 noyau + B5+ B6 B7
polish + V2 stage 1+2a opposition adverse rendue). Seul reste V2
stage 2b (refacto AppState 2-way natif) qui demande sa propre session.

Récap chantiers livrés :

| # | Status | Commit | Description |
|---|---|---|---|
| B1 | 🟢 | `edb43e6` | Game loop continu, intent persistant porteur (drive/pass/shoot) |
| B3a | 🟢 | `bd2dccf` | Shot model enrichi (zone, contestation, position) + fix intent 'shoot' |
| B2 | 🟢 | `0da33a4` | Décideur off-ball (cut, space-drift, relocate) avec budget cuts |
| B4 | 🟢 | `ac1bece` | UI live complète : CourtView lit `matchState`, HUD événements |
| B3b | 🟢 | `40e5f0f` | Transition multi-possessions (rebond off 28 %, new poss reset) |
| B5 | 🟢 | `2e9ffee` | Calibration live vs Monte-Carlo (tolérance ±0.15 PPP) |
| Tick fix | 🟢 | `7ed6cc0` | Tick rate 5 Hz → 30 Hz, scaling proportionnel des constantes |
| **B5+** | 🟢 | `0192916` | Auto-tuning calibration par dichotomie (max 8 itérations) |
| **B6** | 🟢 | `6dd7e83` | Vitesse accélérée live ×1/×2/×4/×8 |
| **B7** | 🟢 | `486b039` | Replay détaillé post-match avec timeline + filtres |
| **V2 stage 1** | 🟢 | `6d99024` | Ballon adverse animé pendant phase away |
| **V2 stage 2a** | 🟢 | `1cefa67` | 5 adversaires simulés rendus visuellement (sprites rouges) |

**Reste pour V3** :
- **V2 stage 2b** (~2-4j) : refacto AppState avec
  `currentlyAttackingTeam` natif, matchups inversés en mémoire,
  engine défensif appliqué côté home pendant phase away.

**Modules livrés** (au-delà de la session initiale) :
- `src/lib/logic/match/autoTuning.ts` — dichotomie sur creativity
- `src/components/MatchReplay.tsx` — modal post-match timeline
- `MatchState` étendu : `awayBallPos`, `awayPlayerPositions`,
  `pendingRebound`, `shotBallStartPos`, `boxOutTargets`,
  `inboundTimerMs`

Doc : [docs/ai-possession.md](docs/ai-possession.md).

### Phase E.1 V1 + V2 stage 1+2a — Rebond + cycle home/away (🟢 livré)

| Item | Commit | Description |
|---|---|---|
| Modèle rebond géométrique | `5e48549` | Module `match/rebound.ts` : poids par profil, distance, zone tir |
| Box-Out V1 (snap) | `5e48549` | Shift défenseurs vers homme + offset panier au moment du tir |
| Box-Out V2 (animé) | `17aaac9` | Lerp ease-out 500 ms vers targets, `boxOutStartedAtMs` |
| Cycle home → away stub | `5e48549` | Phase adverse 12 s, score AWAY 50%, return to home |
| Score 2-côtés HOME/AWAY | `5e48549` | `homeScore`/`awayScore` séparés dans MatchState |
| V2 stage 1 ballon animé | `6d99024` | `awayBallPos` 4 waypoints |
| V2 stage 2a 5 adversaires | `1cefa67` | `awayPlayerPositions` miroir + course |

### Phase E.2 + E.3 + F.2 + F.4 — Situations basket complémentaires (🟢 livré)

> ⚠️ **Note de numérotation** : ces items sont indexés selon
> `docs/todo-priorities.md` créé pour la session, **différent** de la
> numérotation Phase E/F historique de cette roadmap (où E.2 = Export
> GIF, F.2 = Press full-court, etc., toujours pending).

| Item | Commit | Description |
|---|---|---|
| **E.2 Jump ball** | `a61323c` | Setup canonique entre-deux : 2 sauteurs + 4+4 en arc. Module `jumpBallSetup.ts` + setter `convertStepToJumpBall` |
| **E.3 Rebond animé** | `874d96c` | Pré-calcul rebond + animation parabole 2 phases du ballon (shooter→cercle→rebondeur) |
| **F.2 Free throw post-lancer** | `6bb780a` | `buildFreeThrowReboundSetup(made)` + `addFreeThrowReboundStep`. Course-rebond animée sur miss, transition adverse sur made |
| **F.4 Pénalité technique / DQ** | `5ae6e10` | `AppState.disqualifiedPlayers` + toggle UI + overlay rouge "DQ". V1 visuel uniquement |

### Système remises en jeu — 17 templates + diag + timer + modes défensifs (🟢 livré)

Phase complète documentée séparément :
[docs/inbound-system.md](docs/inbound-system.md).

---

### Phase J — Moteur d'écran / playback : qualité & outillage (mai 2026)

Suite de la session debug UCLA cut (saut D1 de 52 px entre f113-f114).
Le fix anti-flip + le garde-fou diagnostic central ont été livrés ; les
items J.1-J.7 prolongent l'effort pour consolider le moteur d'écran et
son outillage **sans changer le scope basket**.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~J.0a~~ | ~~**pushOutOfManyConstrained** — fix anti-flip D1 (UCLA cut)~~ | — | — | — | 🟢 livré 2026-05-14 (3 tests, commit `303fb25`) |
| ~~J.0b~~ | ~~**Garde-fou diagnostic anti-téléport central** — `collectDecisions` + 16 templates instrumentés~~ | — | — | — | 🟢 livré 2026-05-14 (commit `1c3feab`) |
| ~~J.1~~ | ~~**Parité scrub ↔ playback** — mémoire scrub déterministe recalculée depuis le début du segment~~ | — | — | — | 🟢 livré 2026-05-15 (commit `38209d6`) |
| ~~J.2~~ | ~~**Cache segmentaire du resolver** — memoize par segment `idxA→idxB`~~ | — | — | — | 🟢 livré 2026-05-15 (commit `87b212c`) |
| ~~J.3~~ | ~~**Solver de contraintes unifié** — un seul résolveur att/déf/poseurs/clusters/screen lock~~ | — | — | — | 🟢 livré 2026-05-15 (`f7fcb8a`, `6ba3927` + finalisation multi-entités) |
| ~~J.4~~ | ~~**Off-ball avancé** — stagger séquentiel, elevator 2 points, flare/backscreen, mémoire sortie tangentielle~~ | — | — | — | 🟢 livré 2026-05-15 (routes par type, gap elevator, sortie tangentielle active, mémoire multi-contact) |
| ~~J.5~~ | ~~**Profiling + budget frame** — mesurer `resolveFrameAt`, `effectiveDefensePositions`, détections, collisions ; fixer un budget~~ | — | — | — | 🟢 livré 2026-05-15 (commit `a40a8bc`) |
| ~~J.6~~ | ~~**Visual regression légère — golden scenarios** — exports métriques par scénario~~ | — | — | — | 🟢 livré 2026-05-15 (commit `e8ad45b`) |
| ~~J.7~~ | ~~**Panneau debug joueur** — lecture instantanée par défenseur (contactKey, mode, route, qualité, memory, jump last frame)~~ | — | — | — | 🟢 livré 2026-05-15 (commit `37a370f`) |

**État réel au 2026-05-15.**
- J.1, J.2, J.5, J.6, J.7 sont livrés et testés.
- J.3 est livré : `constraintSolver.ts`, `pushOutOfScreenContact`,
  `pushOutOfMany` et `resolvePlayerCollisions` passent par le socle commun
  (`solvePointConstraints` / `solveEntityCollisions`). Les wrappers historiques
  restent pour compatibilité, mais la logique itérative est centralisée.
- J.4 est livré : routes off-ball par type (`flare`, `backscreen`, `hammer`,
  `elevator`), contact stagger séquentiel, corridor physique elevator,
  sortie tangentielle par poseur actif et mémoire multi-contact
  (`contactScreeners`, `activeScreener`, `contactProgress`).

#### ⚪ J.1 — Parité scrub ↔ playback — détail du plan

**Problème actuel.** Le playback a une mémoire courte (`prevFrame` →
rate limiter 18 px/frame). Le scrub est **volontairement sans mémoire**
(chaque position de timeline recompute from scratch), donc un saut
masqué en lecture peut redevenir visible en glissant la souris.

**Plan.** Ajouter au scrub une mémoire **déterministe** : à chaque appel
de `resolveFrameAt` en mode scrub, recompute les N frames du début du
segment courant (`floor(t)` → `t`) en chaînant `prevFrame`, puis retourne
la frame finale. Pas d'historique caché (chaque appel reproductible),
juste un préfixe synthétique.

**Impact.** Les tests à la souris sur la timeline deviennent aussi
fiables que la lecture normale ; plus de différence visuelle scrub vs
play.

**Risque 🟡.** Coût CPU au scrub (60 frames par déplacement de
quelques px). Mitigation : memoize le préfixe (cf. J.2).

#### ⚪ J.2 — Cache segmentaire du resolver — détail du plan

**Problème actuel.** `resolveFrameAt` recalcule à chaque appel :
`matchupsA/B`, `ctxA/B/exit`, `screenerObstacles`, qualités, routes.
Pour un segment `idxA → idxB` donné, ces valeurs sont **stables** sur
toute la transition — seul `localT` varie.

**Plan.** Cache LRU clé `(idxA, idxB, statePatchHash)` valeur :
- `ctxA`, `ctxB`, `screenerObstacles`, par-défenseur `contact`,
  `routePreference`, `screenLockedDefenders`, `singleClusterForSideConstraint`.
- Invalidé sur changement de `state.steps[idxA|idxB]`, `matchups`,
  `screenRule`, `offBallScreenRule`.

**Impact.** Fluidité playback (~50-70 % du calcul est segment-invariant
selon profiling brouillon), particulièrement perceptible quand
`collectDecisions: true` ou overlays debug actifs.

**Risque 🟢.** Cache pur sur valeurs stables, aucune sémantique
changée. Tests : ajouter assertion "résultat == résultat sans cache"
sur les 16 templates instrumentés.

#### ⚪ J.3 — Solver de contraintes unifié — détail du plan

**Problème actuel.** On a empilé : `pushOutOfMany` (attaquants),
`pushOutOfMany` (défenseurs screen-locked), `pushOutOfManyConstrained`
(UCLA fix), `resolvePlayerCollisions` (final pass). Chaque solveur a
ses cas spéciaux, son ordre d'itération, sa convergence à 2 fixed
points (bug UCLA). Surface d'attaque large pour les régressions
latérales.

**Plan.** Un **solveur unique** qui prend toutes les contraintes :
- Obstacles (joueurs autres)
- Half-plane (côté navigué imposé par screen lock)
- Distance min par couple (MIN_CLEARANCE) avec exceptions paramétrables
- Targets (positions cibles à approcher si compatible)

Algorithme candidat : projection itérative type SoR (Successive
Over-Relaxation) ou QP léger (quadratic programming) sur sous-ensemble
actif.

**Impact.** Suppression de toutes les heuristiques "push à 2 fixed
points" → plus de surprises latérales. Code défensif réduit de ~30 %.

**Risque 🔴.** Refactor profond du pipeline final. À ne tenter qu'avec
J.6 (golden scenarios) en place comme garde-fou.

#### 🟢 J.4 — Off-ball avancé — livré

**Problème traité.** Le PnR (carrier screen) a 9 rules (over/under/
hedge/drop/blitz/ice/weak/switch/peel-switch), des transitions soignées
(C.1-C.7), un mémoire de sortie tangentielle. L'off-ball était plus
basique : routes moins différenciées, peu de mémoire spécifique de
contact, et les doubles écrans pouvaient retomber sur un simple contact.

**Livré.**
- **Stagger séquentiel** : modélise la chaîne O4 puis O5 avec phase
  `transition` entre les deux (D2 sort du contact 1 vers contact 2 sans
  retour à l'homme).
- **Elevator** : deux poseurs côte à côte, le défenseur passe par
  l'unique gap entre eux via un corridor physique centré sur le gap.
- **Flare / backscreen** : route propre (ne PAS poursuivre sur le côté
  du poseur opposé au panier).
- **Mémoire sortie tangentielle off-ball** : équivalent du
  `tangentReleasePoint` carrier pour les off-ball screens. Stagger sort
  tangentiellement autour du poseur actif ; elevator sort à travers le
  gap au lieu de tourner autour d'un centroïde.
- **Mémoire multi-contact** : `screenMemory` et `FrameDecision` exposent
  les poseurs impliqués, le poseur actif et la progression du contact.

**Impact.** Gros gain sur UCLA, floppy, pindown, hammer — les 4
templates où l'off-ball domine la séquence.

**Garde-fous.** Tests frame de bout en bout : progression O4→O5 sur
stagger, passage elevator dans le gap, mémoire qui n'empêche pas la
sortie de l'autre côté, fluidité pindown.

#### ⚪ J.5 — Profiling + budget frame — détail du plan

**Plan.**
- Wraper `performance.now()` autour de chaque phase clé de
  `resolveFrameAt` (lerp attaquants, détection écran, calcul cluster,
  loop défenseurs, pushOut, collisions, rate limiter).
- Test dédié `playbackPerf.test.ts` qui mesure le temps moyen sur
  les 16 templates × N=600 frames et vérifie un budget.
- Cible initiale : `resolveFrameAt < 2 ms en 5v5` (laisse 14 ms pour
  rendu R3F + overlays = 60 fps stable).
- Output dans CI (warning si > 80 % du budget, fail si > 100 %).

**Impact.** Optimisation ciblée plutôt qu'à l'aveugle. Repère pour
juger les J.2 (cache) et J.3 (solveur unifié).

#### ⚪ J.6 — Visual regression légère — détail du plan

**Plan.** Un test par template `goldenScenarios.test.ts` qui produit
un snapshot JSON de métriques sur tout le playback :
- `maxJumpPxPerDefender`
- `meanDistToMatchedAtt`
- `meanDistToScreenerWhenStuck`
- `routeSideHistogram` (côté de route choisi par chaque défenseur)
- `minClearanceObservedPerStep`
- `screenLockDurationMs`

Snapshots versionnés. Toute évolution → diff lisible : "D2 reste 1.4 s
sur le poseur au lieu de 1.1 s, side route flippe 3× vs 1× avant fix".

**Impact.** Tout futur fix moteur sera **automatiquement comparé** à
l'état de référence — plus de "ça marche encore comme avant ?" à l'œil.

**Risque 🟢.** Snapshots peuvent générer du bruit ; commencer par
3-4 templates clés (UCLA cut, PnR central, pindown, floppy) avant
généralisation.

#### ⚪ J.7 — Panneau debug joueur — détail du plan

**Problème actuel.** `collectDecisions` (livré J.0b) expose les
décisions par défenseur dans `frame.debug.defenders[id]`, mais
**uniquement en tests**. En dev mode UI, le coach n'a pas de fenêtre
sur ce qui se passe.

**Plan.** Overlay `<PlayerDebugPanel>` activable via
`state.showPlayerDebug` (toggle Paramètres) : pour chaque défenseur
sélectionné, affiche `screenMode`, `quality`, `clusterId`, `pushMode`,
`forcedPushSign`, `matchedTo`, `late`, + `jumpLastFrame` (delta px par
rapport à la frame précédente).

Layout : petit pavé flottant à droite du défenseur sélectionné, dépliable.

**Impact.** Quand un déplacement semble bizarre en dev, **un clic
suffit** pour voir la décision. Plus de retour aux tests pour
comprendre.

**Risque 🟢.** Pur ajout opt-in côté UI. Réutilise l'option
`collectDecisions` déjà branchée.

---

### Synthèse — ordre conseillé

**Phase C — état au 2026-05-17** : 7/7 livrés (C.1 → C.7, V1+V2 inclus).
Phase C complète. Phase B partiellement livrée (B.1 livré 2026-05-17,
reste B.2/B.3/B.4).

**Cette semaine** (~6h) : A.2 + A.3 + B.1 → débloque shot clock,
défense end-of-clock, plus de finesse coach.

**Cette semaine étendue** (~3-4j) : A.* complet + B.* complet → fondations
temps + UI accessibles. Le moteur passe à 100% utilisable côté coach.

**Mois suivant** (~2 semaines) : C.2 + C.7 (réalisme défensif final) +
quelques D.* (lissage, trajectoires de passes). Le moteur passe d'un
simulateur "tactique" à un simulateur "tactique + visuel réaliste".

**Quick wins F.* à intercaler** : F.4 + F.5 (~5-6h cumulés) — ajoutent
2 sliders de réalisme à faible coût, surtout après B.1 livré (champ
clock natif).

**Trimestre suivant** : E.1 (box-out/rebond, demi-jeu) — le changement
de scope qui ouvre le jeu complet. Suivi de F.1 (junk) + F.3 (FT
rebound) selon les besoins.

**Phase J (qualité moteur écran)** : J.1 à J.7 sont livrés. Le moteur
écran/playback a maintenant la parité scrub/playback, le cache
segmentaire, le solver unifié, les diagnostics anti-saut, les golden
metrics et les écrans off-ball avancés.

**À traiter en parallèle dès que possible** : G.1 (doc calibration) qui
clarifie le scope du moteur (tactique vs sprint réel).

**À reporter sauf demande explicite** : F.2 (press full-court, 10-12h
V1, refonte `getDefenseHoop`).

**Long terme** : H.* (tests composants) + I.* (Play IA).

### Récap statut phase C+F (mai 2026)

| Item | Statut | Tests | Commit |
|------|--------|-------|--------|
| C.1 Closeout footwork | 🟢 livré | 7 | `8b65aa6` |
| C.2 Help-and-recover | 🟢 V1 + V2 livrés (step + ms, slider DefensePanel) | 18 | (commits C.2 V1, V2 2026-05-17) |
| C.3 Hedge length | 🟢 livré | 8 | `5758086` |
| C.4 Pre-rotation | 🟢 livré | 10 | `9f2e21a` |
| C.5 Tag-then-switch | 🟢 livré | 4 | `18bf440` |
| C.6 Help angle continu | 🟢 livré | 3 | `0c3d9ae` |
| C.7 Action chains | 🟢 V1 + V2 livrés (diag+badge + réaction défensive) | 21 | (commits C.7 V1, V2) |
| F.1 Junk defenses | ⚪ détaillé (V1 box-and-1) | — | — |
| F.2 Press | ⚪ détaillé (V1 half-court) | — | — |
| F.3 FT rebound | 🟢 V1 livré (positions canoniques + F.2 extension rebond) | 11 | — |
| F.4 Foul to give | ⚪ détaillé (V1 diag+badge) | — | — |
| F.5 Late shot clock | ⚪ détaillé (V1 modulation globale) | — | — |

---

## Hors roadmap court terme
