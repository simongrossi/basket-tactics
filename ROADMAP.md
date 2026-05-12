# Roadmap

Vision produit forward-looking.

- Pour l'**historique des évolutions de comportement** (livré, daté, structuré), voir [CHANGELOG.md](CHANGELOG.md).
- Pour la **cartographie du moteur de jeu** (individuel / collectif / physique), voir [docs/GAME-ENGINE.md](docs/GAME-ENGINE.md).
- Pour le **backlog technique fin et notes de développement**, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## Livré récemment (mai 2026)

- 🟢 **Audit défensif — TOUS les concepts B1-B10 livrés** (2026-05-12) :
  Toute la liste de l'audit moteur défensif (4 critiques 🔴 + 6 moyens 🟠)
  traitée en une session. **541 → 678 tests verts (+137 tests, dont 59 sur B1-B10)**.

  **🔴 Critiques (B1-B4)** :
  - **B1** Mismatch tracking + scram switch (correction auto post-switch) — 17 tests
  - **B2** Reject screen detection (porteur refuse l'écran anticipé) — 9 tests
  - **B3** Hard hedge vs soft hedge (slider `state.hedgeAggression`) — 5 tests
  - **B4** Snake dribble detection (V sur 3 steps, double usage écran) — 8 tests

  **🟠 Moyens (B5-B10)** :
  - **B5** Empty side PnR (helper + diag avec recommandation contextuelle) — 5 tests
  - **B6** Dig / double au post (couche 4.5, dig 30 % / double 50 %) — 4 tests
  - **B7** Defensive 3 sec (règle FIBA, diag coach) — 4 tests
  - **B8** Switch policy granulaire (`'all' / '1-3' / '1-4' / 'none'`) — 10 tests
  - **B9** Top-lock off-ball avec timing (bascule auto top-lock → chase) — 10 tests
  - **B10** Bumping cutters automatique (couche 5.5, offset sur cuts détectés) — 4 tests

  **Nouveaux modules** :
  - 6 helpers purs : `mismatchTracking`, `detectRejectedScreen`,
    `detectSnakeDribble`, `emptySidePnR`, `cutterScreenChain`,
    `switchAllowed`.
  - 2 nouvelles couches du pipeline : `cutterBumpLayer` (5.5),
    `postCoverageLayer` (4.5).
  - 5 nouvelles règles coach : scram-switch enrichi, rejected-screen,
    snake-dribble, defensive-3sec, empty-side-pnr.
  - 6 nouveaux settings opt-in : `scramSwitchEnabled`, `mismatchThreshold`,
    `hedgeAggression`, `switchPolicy`, `autoBumpCutters`, `postCoverage`.

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

### 🟢 Trap en corner / sideline (v2)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`. **v2** : 4 zones au lieu de 2 — coins baseline (gauche/droite, y < 200) + sidelines mi-terrain (gauche/droite, y ∈ [200, 460]). ⚪ **À venir v3** : gestion explicite quand un écran est aussi détecté simultanément (aujourd'hui le trap est désactivé si screen ≠ null).

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

**Limite V1** : la défense n'est pas modifiée par la détection (pas de
"unwind" de la couverture sur-anticipée). À voir en V2 (mémoire d'intent
+ retour à la couverture homme-à-homme classique).

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

**Limite V1** : la défense ne maintient pas la couverture engagée pendant
la retraite (re-arme à zéro à chaque step). V2 : mémoire de couverture
sur la fenêtre N-2 / N pour éviter le double recover.

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

### UX / Produit
| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~1~~ | ~~Saisie numérique sliders~~ — 🟢 livré 2026-05-12 | — | — | — |
| 2 | Snap-to-grid | 45min | 🟢 | Moyen |
| 3 | Graphique métriques | 1h | 🟢 | Haut |
| 4 | Sélection multiple | 2h | 🟡 | Haut |
| 5 | Mode présentation | 45min | 🟢 | Haut (tablette) |
| 6 | Export GIF/vidéo | 3-4h | 🟡 | **Très haut** (partage) |
| 7 | Templates utilisateurs | 1h30 | 🟢 | Haut |
| 8 | Annotations texte libres | 2h | 🟡 | Haut |

### Logique basket — concepts défensifs manquants (audit mai 2026) — ✅ tous livrés (2026-05-12)
Tous les items B1-B10 de la liste sont marqués 🟢. **+59 nouveaux tests
(541 → 678)**. Détail commit par commit ci-dessus dans "Livré récemment".

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~B1~~ | ~~Mismatch tracking + scram switch~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B2~~ | ~~Reject screen detection~~ — 🟢 V1 livré 2026-05-12 | — | — | — |
| ~~B3~~ | ~~Hard / soft hedge (slider aggression)~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B4~~ | ~~Snake dribble detection~~ — 🟢 V1 livré 2026-05-12 | — | — | — |
| ~~B5~~ | ~~Empty side PnR~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B6~~ | ~~Dig / double au post~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B7~~ | ~~Defensive 3 sec (diag coach)~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B8~~ | ~~Switch policy granulaire~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B9~~ | ~~Top-lock off-ball avec timing~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~B10~~ | ~~Bumping cutters automatique~~ — 🟢 livré 2026-05-12 | — | — | — |

**Total UX/Produit restant** : ~12-13h en restant sur des v1 simples.
**Total logique basket restant** : ~22-28h pour les 10 items.

**Ordre conseillé logique basket** : B3 → B1 → B8 → B2 → B7 → B5 → B4 → B6 →
B9 → B10. B3 est un quick win (slider sur une rule existante). B1 et B8
sont les plus impactants pour le réalisme défensif. B7 est triviale et
pédagogique. Les détections (B2/B4) viennent ensuite, plus complexes
géométriquement.

**Ordre conseillé pour enchaîner** : 1 → 5 → 7 → 3 → 2 → 8 → 4 → 6 (du moins risqué au plus risqué, valeur croissante). Le bloc (1 + 5 + 7) est ~3h pour 3 quick wins très visibles. (3 + 2) ajoute 2h pour deux UX impactants. (8 + 4) sont les plus complexes côté UX. (6) est le plus impactant pour la diffusion mais le plus délicat techniquement — à garder pour la fin.

**Limites v3 documentées sur les chantiers déjà v2** :
- **Trap** : gestion explicite quand un écran est aussi détecté simultanément (aujourd'hui le trap est skip si screen ≠ null)
- **Staggered** : ✅ double courbe Bezier réelle livrée en v3 (`pickStaggeredPair` + `curveAroundStaggeredPair`).
- **Inversion HOOP** : ✅ rendu visuel "🎯 visé" / "🛡 protégé" livré en v3.
- **Closeout / Denial** : ✅ tunables globaux livrés en v3. ✅ override par règle individuelle livré (DefenderRule.closeoutBoost / denyAggressiveness) — slider dans le menu contextuel défenseur avec affichage "global" / valeur + bouton ↻ pour reset.
- **Undo/Redo** : coalescing pendant un drag continu (1 entrée pile au lieu de N)

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

### ⚪ Mode "Play IA — voir un match jouer tout seul" (parties B1-B5 du plan)

L'infrastructure existe (géométrie, threats, offense EV, défense réactive, simulator Monte-Carlo) mais il **manque la boucle de match autonome** : pas de bouton "▶ Play IA" qui fasse jouer 5v5 en continu sur 24 secondes de shot clock visualisable. Le simulateur actuel fait des possessions stochastiques sur un état figé.

Ce qu'il faut pour que ça marche :
- **B1 — Game loop** : `match/gameLoop.ts` avec `tick(matchState, dt) → matchState'`. Cadence de décision ~5 Hz, interpolation entre.
- **B2 — Décideur joueur autonome** : `match/decisions/ballHandler.ts` (dribble continu / passer / tirer / reset), `match/decisions/offBallMover.ts` (spacing / cuts / écrans). Mémoire courte d'intent par joueur.
- **B3 — Modèle de tir + rebond + transition possession**.
- **B4 — UI** : bouton "▶ Play IA (live)" dans `SimulationSection`, HUD léger (possession, shot clock, score, dernière action), pause + vitesse.
- **B5 — Tuning** via Monte-Carlo en parallèle (PPP du mode live vs simulator → ±0.15 attendu).

**Statut** : repoussé tout en bas de la pile par décision projet (cf. `feedback project_priorities_2026_05`). Les refactos A* débloquent tout le reste, "Play IA" est une feature isolée qui peut attendre.

---

## Hors roadmap court terme

Idées plus lointaines (modélisation agent, mode coach audio, multi-utilisateur, IA défensive en édition) : voir [IDEAS.md § Idées plus loin](IDEAS.md).
