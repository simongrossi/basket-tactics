# État d'avancement du projet

> Vue consolidée de **ce qui est fait**, **ce qui est en cours**, et **ce qui reste à faire**, pour ne rien oublier entre deux sessions de travail.
>
> Mise à jour : **2026-05-18 (Phase K)** — post-session B.3 / B.4 / D.1 / D.3 / D.5 / F.1 V1+V2 / F.2 V1+V2 / G.1-4 / J.1 / J.5 / J.6 / J.7 / A11 V1+V2+V3 / E.1 stage 2b V1 / **K.0→K.7 anomaly detection**.
>
> Pour le détail commit-par-commit, voir [`CHANGELOG.md`](../CHANGELOG.md).
> Pour la roadmap basket exhaustive, voir [`../ROADMAP.md`](../ROADMAP.md).
> Pour les chantiers restants priorisés, voir [`todo-priorities.md`](./todo-priorities.md).

---

## 🆕 Travail récent (2026-05-18 soir) — Phases B, F, G complétées + D 4/5

Session du soir. **16 commits** sur `main`, 1279 → **1353 tests verts** (+74).
Phases **B (4/4)**, **C (7/7)**, **F (5/5)**, **G (4/4)** désormais
complètes. Phase D 4/5 (D.4 reportée par choix après audit risque).

### B.3 V1 — End-of-quarter contest awareness (`c51160e`)

Cas miroir de F.4 quand l'équipe est en bonus. Détection cumulée
`clockSeconds < 5` + `defenseTeamFouls ≥ 5` → diag coach 'warning' +
badge SVG `🚫 NO FOUL` sur le défenseur du porteur. **Mutuellement
exclusif avec F.4** sur l'axe `defenseTeamFouls` (invariant testé).
7 tests.

### B.4 V1 + UI — Synchro cross-actor (`5ad5508` + `634071e`)

Nouveaux champs `Annotation.tStartAbs?` / `tEndAbs?` (secondes ABSOLUES)
priment sur `tStart/tEnd` legacy. Helper `resolveAnnotationTiming`
centralise la priorité. Migration des 3 consommateurs (playbackTrajectory,
pdfRecap, playerTracks). UI : tooltip enrichi en secondes + shift+click
ouvre 2 prompts pour saisir les bornes en secondes. Le drag des poignées
reste en fraction. 14 tests cumulés.

### Phase D — D.1 + D.3 + D.5 + désync D.2 + audit D.4

- **D.1** easing cross-step (`9f15c9e`) : `state.movementEasing` linear /
  ease-in-out / ease-out. Invariants `e(0)=0` / `e(1)=1` → snapshots
  step exacts inchangés.
- **D.2** déjà livré depuis 2026-05-15 (motionMemory + applyDefenderMotionInertia
  dans frameResolver) — ROADMAP désynchronisé, alignement effectué.
- **D.3** trajectoires de passes (`6ea917d`) : `Annotation.passKind`
  `direct / lob / bounce / skip` étend `computeBallFrame`.
- **D.4** plan d'audit risque écrit ([docs/d4-pathfinding-plan.md](d4-pathfinding-plan.md))
  mais V1 **non lancée** (ratio risque/valeur défavorable).
- **D.5** test d'invariant clearance cross-frame (`ef2cfba`) : 40 frames
  × N transitions × 4 scénarios, clearance ≥ `PLAYER_MIN_CLEARANCE_PX`
  préservée.

### F.1 V1 + V2 — Junk defenses complètes (`49be60b` + `fa6e1e2`)

`DefenseSystem` étendu à `'junk'` avec 3 formations :
- **Box-and-1** : 4 corners + 1 chaser.
- **Triangle-and-2** : 1 pointe haute + 2 blocks + 2 chasers.
- **Diamond-and-1** : losange 1-2-1 NCAA + 1 chaser.

Couche `defense/junkLayer.ts` court-circuit comme la zone. `helpFactor=0`
partout, chasers en `deny-3q` + `gazeLock: 'opponent'`. UI complète :
SystemSelector + sub-config dynamique (1 ou 2 pickers selon type avec
verrouillage croisé). 21 tests cumulés.

### Phase G — Calibration vitesse complète (4/4)

- **G.1** doc calibration vitesse ([docs/physics-calibration.md](physics-calibration.md))
  — scope tactique vs sprint réel (~22 % NBA).
- **G.2** sprint boost contextuel (`c4ae2da`) — `Step.sprintBoost ×1.8`.
- **G.3** modèle d'accélération (`84467e1`) — clamp linéaire depuis le
  repos via `state.accelerationModelEnabled` + `state.defenderAcceleration`.
- **G.4** profil athlétique (`86b13d7`) — `state.defenderSpeedProfiles`
  ×1.3 / ×1.0 / ×0.7 par défenseur.

### J.7 V1 — Panneau debug joueur (`b5aced8`)

`state.showPlayerDebug?: boolean` active `collectDecisions` dans
`useCourtFrame` + nouveau composant `<PlayerDebugTable>` (overlay
haut-droite, tableau 5 défenseurs × 5 colonnes). Toggle dans
ParametresPanel.

### Phase K — Behavior Anomaly Detection (7 sous-chantiers, 7 commits, 56 tests)

Nouveau pilier "observabilité du comportement joueur" demandé par
l'utilisateur pour suivre et améliorer les comportements anormaux et
anomalies de déplacement. Architecture pure / opt-in / zéro risque
Règle 1bis.

- **K.0** Infra : `src/lib/logic/anomaly/{types,anomalyDetector}.ts`.
- **K.1 V1** `detectTeleport` (saut > 24 px, 60 critical) — 8 tests.
- **K.2 V1** `detectAberrantSpeed` (déf > maxSpeed × 1.95) — 6 tests.
- **K.3 V1** `detectDetachedDefenders` (>250 px du matchedTo, hors
  aide/screen) — 7 tests.
- **K.4 V1** `detectFlicker` (cos < -0.707 sur fenêtre 3 frames, m > 5 px)
  — 8 tests.
- **K.5 V1** `detectAnomalousGaze` (|gaze - body| > 90°, Règle 3 CLAUDE.md)
  + `circularDeltaDeg` — 10 tests.
- **K.6** Règle coach `playerAnomalyRule` (K.1/K.2/K.3 wirées) + toggle
  ParametresPanel `anomalyDetectionEnabled` (opt-in strict) — 6 tests.
- **K.7 V2** `clampTeleports` + `clampAberrantSpeed` (correction pure,
  non wirée au resolver pour préserver Règle 1bis) — 11 tests.

1450 → **1506 verts**. Le moteur tactique reste intact ; seule une
règle coach opt-in et un toggle UI sont visibles côté utilisateur.

### F.2 V1 + V2 — Press defenses complètes (`ed76448` + V2 ce commit, 15 tests)

Approche pragmatique : au lieu de refonte risquée de `getDefenseHoop`,
court-circuit du pipeline (pattern F.1 junk éprouvé).

- `DefenseSystem 'press'` + `pressConfig: { type, trapOnHalfCourtCross? }`.
- **V1 half-court 2-2-1** : 2 défenseurs ligne médiane, 2 zone de relais,
  1 sweeper centre. 9 tests.
- **V2 full-court 1-2-1-1 + trap dynamique** (`PRESS_1_2_1_1_OFFSETS`) :
  chaser haut au-dessus de la ligne de fond adverse, 2 ailes à mi-back-court,
  1 défenseur médian, 1 sweeper protégeant le panier. Quand le porteur
  franchit la médiane (`HALF_COURT_Y=540`, direction-aware), les **2
  défenseurs les plus proches** sont tirés de `TRAP_PULL_PX=35` vers le
  porteur en préservant `PLAYER_MIN_CLEARANCE_PX`. Activable via
  `trapOnHalfCourtCross` (défaut true). 6 tests.
- UI : boutons "Half-court" et "Full-court" activés dans SystemSelector
  + sub-config rouge dans DefensePanel différenciant V1/V2.
- Checklist Règle 1bis : 155 tests screen verts. 1450/1450 verts.

V2.5 reportée : retreat progressive (interpolation press → man-to-man
arrière quand la presse est cassée).

### A11 V3 — Outlet setter combiné (1 commit, `82add8e`, 4 tests)

`addOutletPassStep` chaîne automatiquement `outletPassPending` (A11 V2
ext3) → `convertStepToAwayPossession` (E.1 stage 2b) en 1 clic. UX 1
clic au lieu de 2 pour le flux "rebond défensif → transition adverse".

### E.1 stage 2b V1 — Phase adverse en mode édition (3 commits, ~1h)

Option A retenue (V1 ultra-mini, plan complet dans
[docs/e1-stage2b-plan.md](e1-stage2b-plan.md)).

- Phase 1 (`efc6166`) : `Step.viewSide?: 'home' | 'away'` + module pur
  `awayPossessionSetup.ts` (mirror vertical autour `HALF_COURT_Y=540`,
  mapping D1↔O1 préservé) + transform `convertStepToAwayPossession`.
  12 tests.
- Phase 2 (`d184c66`) : 2 boutons StepsPanel (guidé post-A11 V2
  outletPassPending + libre toggle) + banner CourtView "🔄 PHASE
  ADVERSE (édition)".
- Phase 3 (ce commit) : règle coach `awayPossessionRule` qui flag
  les steps adverses pour éviter confusion sur les autres diags.

Le moteur défensif tourne **tel quel** : sémantique O/D inchangée,
seule la sémantique d'affichage change. Zéro risque Règle 1bis.

Options B (team-aware soft) et C (refacto complet) reportées.

### A11 V2 — Extensions (2 commits, ~1h)

- ext1 (`dac7fb0`) : `shotOutcome: 'blocked'` 3e outcome de tir +
  helper `blockedReboundResult` déterministe + UI 3e bouton violet.
- ext2 : reset shot clock 14s sur rebond offensif.
- ext3 : `outletPassPending` marker + nouvelle règle coach `outletPassRule`.

12 nouveaux tests cumulés. V3 reportée (couche dynamique, unification
mode édition ↔ game loop).

### A11 V1 — Box-out / rebond demi-jeu (4 commits, mode édition)

Le seul vrai chantier basket restant. Estimation initiale 5-8j → coût
réel ~3h parce que `computeRebound` + `boxOutCheckRule` + pattern F.2
existaient déjà.

- **Phase 1** (`b797c1d`) : types `Step.shotOutcome`, `Step.shotPos` +
  helper `shotTracking.ts` + UI 2 boutons toggle dans StepsPanel.
- **Phase 2** (`76bb002`) : builder pur `shotReboundSetup.ts` (box-out
  + computeRebound réutilisé) + transform `addShotReboundStep` +
  bouton UI "🏀 étape rebond auto". Types `Step.rebounder` /
  `Step.reboundType` informatifs.
- **Phase 3** (`3c05e02`) : `boxOutCheckRule` détection robuste via
  4 sources hiérarchisées + note cohérence sur `ScriptedAction shoot`
  (mondes parallèles édition coach vs mode IA documentés).
- **Phase 4** : docs (ce commit).

Plan complet dans [docs/a11-plan.md](a11-plan.md). V2 reportée
('blocked', reset shot clock 14s, outlet pass auto, couche dynamique,
unification édition↔match).

### J.1 V1 — Parité scrub ↔ playback (`67815d0`)

Audit a confirmé que la parité POSITIONNELLE était déjà garantie par
`resolveFrameAtDeterministicScrub`. Le seul vrai gap = options
`collectDecisions` et `profile` désynchronisées entre scrub et playback.
Fix de 2 lignes dans `useCourtFrame.ts`. 8 tests d'invariant nouveaux.
Checklist Règle 1bis : 155 tests screen tous verts.

### J.5 + J.6 — Tooling moteur (`ccf73b9` + `d1d6792`)

- **J.5 V1** — Profile overlay live. Module `playback/profileAggregator.ts`
  (aggregateProfiles + ProfileRingBuffer). Overlay haut-gauche du
  terrain avec mean/p95/max par phase défensive, phase la plus coûteuse
  highlightée (🔥). `state.showProfileOverlay` + toggle ParametresPanel.
  9 tests.
- **J.6 V1** — Visual regression légère. Helper
  `playback/sceneSnapshot.ts::snapshotScene` capture positions + flags
  défenseurs clés. Test golden sur 4 templates (`ucla-cut`,
  `pnr-central`, `pindown-corner`, `floppy`). Snapshots Vitest natifs
  versionnés. Régénération : `npx vitest run j6GoldenSnapshots -u`.
  9 tests + 4 snapshots (1477 lignes).

Phase J désormais **4/7** livrée (J.4 + J.5 + J.6 + J.7). Restent J.1,
J.2, J.3 — non-bloquants.

---

## 🆕 Travail récent (2026-05-17/18 matin) — Temps réel + défense fin de possession

Triple session axée sur la **modélisation fine du temps** et son
exploitation par la défense. **1279/1279 tests verts**, 7 commits sur `main`.

### B.1 — Durée individuelle par step (commits `1670f10`, `7e67e79`)

Champ optionnel `Step.duration?: number` (secondes). Default = fallback
sur `state.secondsPerStep` (rétrocompat totale). Le helper
`getStepDurationSeconds(state, stepIdx)` + la refonte de
`realStepToSeconds` / `totalDurationSeconds` accumulent les durations
individuelles au lieu d'une multiplication globale. Consommateurs migrés :
Timeline, MultiTrackTimeline, PlaybookView (recap + synoptique imprimable).
Input `durée (s)` ajouté dans StepsPanel pour le step actif. **17 tests**.

### B.2 — Shot clock display 3 bandes (commit `4c3af36`)

Helper `shotClockBand(secondsLeft)` centralise les paliers (> 8 s safe,
5-8 s warning, ≤ 4 s danger). Le badge shot clock de la Timeline passe
en vert/jaune/rouge selon le palier (cas violation conservé). Seuils
mutualisés avec LiveMatchOverlay et SimulationSection. **3 tests**.

### C.2 V2 — `helpStickinessMs` (commit `751acf6`)

Setting `state.helpStickinessMs?: number` (range 100-2500 ms) qui prime
sur `helpStickiness` V1 (steps). Helper `cumulatedHelpMs` somme
`Step.duration × 1000` sur les steps comptés par `consecutiveHelpSteps`
— bénéficie de B.1 pour la granularité fine. `helpStickyLayer` branche
V2 vs V1 selon settings. UI : slider 0-2500 ms par pas de 100 dans
DefensePanel (V2 → désactive V1 automatiquement). **8 tests**.
Cible basket : 1200 ms ≈ standard NBA, indépendant du découpage en
steps. **Phase C désormais complète (7/7)**.

### F.4 — End-of-quarter foul to give V1 (commit `fac20b2`)

Détection coach des opportunités de **faute volontaire en fin de quart**
(sous 5 s, équipe < 5 fautes, drive actif). Helper
`defense/detectFoulToGiveOpportunity.ts`. Règle coach `foulToGiveRule`
émet un diagnostic `critical`. Badge SVG `🟥 FOUL TO GIVE` posé sur le
défenseur du porteur dans DetectionBadgesOverlay. UI : input fautes
équipe dans DefensePanel + input `quart (s)` per-step dans StepsPanel.
**9 tests**.

### F.5 — Late shot clock defense V1 (commit `fac20b2`)

Nouvelle couche `defense/lateShotClockLayer.ts` (couche 1.7 de l'engine).
Si `state.lateShotClockDefenseEnabled` + `step.shotClockRemaining < 5` :
carrierDef voit sa cible décalée de +10 px vers le porteur (contest
accru) ; tous les autres défenseurs perdent leur aide (helpFactor=0,
helpTriggered=false). Invariant de clearance min ≥ 34 px préservé. UI :
checkbox + input `shot clk` per-step dans StepsPanel. **5 tests**.

### Polish dark mode résiduel (commits `684c6d6`, `a22d69c`)

- Toolbar Playbook : bouton "🖨 imprimer / PDF", bouton "fermer",
  wrapper toolbar en tokens `DARK_PANEL.*` (étaient blancs car rendu
  navigateur natif).
- Menus contextuels joueurs : AttackerMenu, DefenderMenu, ToolBar,
  sharedRows, AutoActionSubmenu — refonte complète des fonds blancs/cream
  en dark. Accents orange (offense) et bleu (defense) conservés pour
  les états actifs.

---

## 🗓️ Travail récent antérieur — voir CHANGELOG

- **[0.10.0] 2026-05-16** : Phase I polish Play IA (B5+/B6/B7), Phase E cycle complet (E.1 V2 + E.2 + E.3), Phase F lancers francs (F.2/F.4), système remises en jeu complet. 30+ commits.
- **[0.9.0] 2026-05-15** : Phase I Play IA principale, refacto A4-A10.
- **[0.8.0] 2026-05-13** : C.1 → C.6 phase C livrée + C.7 V1+V2 + nettoyage défensif tier 2.

Pour l'historique antérieur (Étapes 2-15 de la refonte zone-defense),
voir les sections plus bas — elles restent une référence valable pour
comprendre la genèse du moteur défensif actuel.

---

## 🆕 Travail antérieur — Étapes 2/3/4 réflexes défensifs (sur `main`)

Refonte significative de la défense de zone pour encoder les **principes basket fondamentaux** qui doivent l'emporter sur la simple ownership géométrique. Documentation détaillée : [logique-defensive.md > Réflexes défensifs avancés](./logique-defensive.md#réflexes-défensifs-avancés-étapes-2-4).

### Étape 2 — Désignation de couvreurs (zone)

- **2.a `designatedCoverer`** : un attaquant en zone-tueuse (high-post / short-corner) **isolé** (aucun coéquipier <80 px) déclenche une désignation explicite du défenseur le plus proche par homePos. Boost ×4 sur sa claim, bias home (40% vers l'attaquant pour high-post). Évite la dilution d'ownership entre 5 défenseurs concurrents.
- **2.b `paintCoverage`** : nouveau slider `ZoneConfig.paintCoverage` (0-100, défaut 50) qui module l'agressivité des boosts ci-dessus.
- **2.c `isHighPost` élargi** : couvre maintenant la "tête de raquette" (verticalFromHoop ∈ [80, 200], au lieu de [130, 200]) — inclut le top-of-paint en plus de la FT line.
- **2.d `baselineDriveCoverer`** : détection couloir baseline non fermé (cf. [`baselineDrive.ts`](../src/lib/logic/baselineDrive.ts)). Désigne le wing low côté ballon. Diagnostics : `baseline-drive-open/soft/late/closed`.
- **2.e `ballPressureCoverer`** : LE défenseur structurellement responsable de presser le porteur. Front-row si ballon haut, back-row si bas. Préfère le défenseur du même côté que le ballon. Boost ×2.5 (à factor=1) + bias home + seuil engagement abaissé.

### Étape 3 — Réflexes basket universels

- **3.a `rimProtectorByThreat` ("pas d'easy basket")** : nouveau module [`threatResolution.ts`](../src/lib/logic/threatResolution.ts) avec `detectFreePathThreats`. Pour chaque attaquant à <220 px du panier sans défenseur sur la trajectoire, désigne le défenseur disponible le plus proche du panier. Slider `rimProtection` (0-100). Couvre les cas où le pivot est dragué ailleurs et personne ne ferme la peinture.
- **3.b Détection cuts hors-ballon** : `detectCuts(off, prevOff, ...)` détecte les coupes vers le panier (Δ dHoop > 25, exclut les screeners). Diagnostic `cut-backdoor`.
- **3.c Step-up préventif** : `detectFreePathThreats` étendu pour détecter les drives en cours (220-280 px avec mouvement vers panier). Permet le step-up AVANT que l'attaquant arrive sur le panier.
- **3.d Diagnostic matchup orphan** : `detectMatchupOrphans` signale les défenseurs en aide loin de leur home dont le matchup naturel n'est plus couvert.

### Étape 4 — Recover et axe central

- **4.a Weakside paint sag** : `ballSideShifted` étendu — les défenseurs côté faible glissent **vers l'axe central** (x=300, ×0.8) ET vers le panier en Y (×0.4). Engagement réduit ×0.5 si le défenseur ET son matchup sont tous deux weakside (reste en aide raquette plutôt que coller son homme à 5 m du ballon). Effet mesuré : D4 passe de 121 px de l'axe central à 98 px.
- **4.b Recover boost** : un défenseur sans rôle d'aide actif reçoit ×1.15 sur sa claim au matchup naturel. Pull-back actif après aide.
- **4.c Couche `applyRimProtectionLayer` en man defense** : nouvelle couche 1.5 du pipeline man-to-man (engine.ts) qui applique le rim protection aux positions calculées par baseTargets. Filet de sécurité pour les edge cases (défenseur perdu via écran, switch).

### Étape 5 — Pass denial

- **`detectOpenPassThreats`** ([threatResolution.ts](../src/lib/logic/threatResolution.ts)) : pour chaque attaquant non-porteur, vérifie si segment carrier→att libre (perpDist >60px). Désigne le défenseur **naturel** (baseMatchups) si disponible, sinon le plus proche de l'intercept (sous 220px).
- Slider `passDenial` (0-100, défaut 50) dans DefensePanel.
- Boost claim ×(1+2×urgency×factor) sur le receveur + bias home (×0.5 × urgency × factor) vers point d'interception.
- Skipé pour les receveurs déjà couverts par d'autres désignations (high-post, rim) — évite les conflits du type "le pivot fait un skip pass perimetric".

### Étape 6 — Décomposition des téléports (A + D)

Bug rapporté : sur certaines actions FIBA (Rip-DHO, back-screens), les générateurs émettent un step avec un saut > 5 m pour un joueur (téléportation), déclenchant le warning `attacker-jump`.

**Solution** : nouveau module [`breakUpTeleports.ts`](../src/lib/logic/breakUpTeleports.ts) appliqué à la sortie de `compileScenario`. Si un joueur bouge de plus de 100 px (~2.7 m) entre deux steps, on insère des steps intermédiaires interpolés linéairement.

- Nouveau champ `Step.isInterpolated: boolean` marque les steps phantômes
- Annotations + label restent sur le step terminal
- `ballCarrier`, `defensiveDirectives`, `assignmentOverrides` propagés sur les intermédiaires (pour préserver les couvertures scriptées pendant le mouvement)
- UI : `OffensePanel` masque les interpolés de la liste utilisateur ; `Timeline` les affiche en gris/petit avec tooltip "(transition)"
- `compileScenario` skip les interpolés lors du matching `manualOverride` (subIndex compté uniquement sur les steps réels)

Effet sur Rip-DHO : 4 steps → 7 steps (3 interpolés), aucun mouvement > 110 px.

### Étape 7 — Branches manuelles de scénario

Pour présenter des **playbooks à choix multiples** ("si drop → pull-up", "si switch → mismatch") :

- Nouveau type `ScenarioBranch` avec `divergeAfterActionId` + `actions` alternatives ([types/index.ts](../src/lib/types/index.ts))
- `compileScenario` reçoit `activeBranch?` : compile main jusqu'à divergence puis branche
- Handlers `useAppState` branch-aware : quand une branche est active, les actions ajoutées/éditées vont dans `branch.actions`
- UI [`ScenarioPanel`](../src/components/ScenarioPanel.tsx) : tabs en haut, bouton "+ variante" sur chaque action, double-clic pour renommer
- UI [`PlaybookView`](../src/components/PlaybookView.tsx) : toggle "variantes" qui ajoute une section par branche dans le PDF

V1 = un seul niveau (pas de sous-branches imbriquées). Pour V2 (split view, branches auto réactives), voir [docs/ideas.md](./ideas.md).

### Étape 8 — Multi-track timeline façon vidéo

Pour visualiser **qui fait quoi à quel moment** dans un scénario multi-action :

- Nouveau module [`playerTracks.ts`](../src/lib/logic/playerTracks.ts) : `computePlayerTracks(state)` extrait pour chaque joueur ses segments d'activité à travers les étapes (idle, dribble, cut, screen, pass / pos, tracking, closeout, help).
- [`PlayerTimelineModal`](../src/components/PlayerTimelineModal.tsx) : popup zoomable avec les 10 pistes (5 attaquants + 5 défenseurs), accessible via `⋯ > timeline par joueur`.
- [`MultiTrackTimeline`](../src/components/MultiTrackTimeline.tsx) : panneau docké en bas de l'écran, sous la timeline principale, façon Adobe Premiere. Toggle `▲ pistes` pour déplier/replier.
- Curseur vertical rouge synchronisé temps réel avec scrubT/playbackT/activeStep.
- Steps interpolés (auto-créés par `breakUpTeleports`) fusionnés visuellement pour ne pas polluer.

### Étape 9 — Phase début/fin sur annotations

Le coach peut dire au moment du dessin SI l'action est active au **début** de l'étape (mouvement effectué dans la transition précédente) ou à la **fin** (mouvement effectué pendant cette étape) :

- `Annotation.phase: 'start' | 'end'` (default 'end' = rétro-compatible).
- `upsertMovementAnnotation` resynchronise les positions des étapes adjacentes selon la phase.
- `setAnnotationPhase` dans `useAppState` pour basculer en place.
- UI : bouton **◀** / **▶** dans le coin du segment (multi-track) pour bascule visuelle.

### Étape 10 — Édition continue tStart/tEnd (façon vidéo)

Chaque action de mouvement peut avoir sa propre **durée** dans le segment :

- `Annotation.tStart` et `tEnd` (0..1) définissent les bornes temporelles.
- `attackerTrajectoryAt` mappe le temps global vers le temps d'action selon ces bornes.
- UI : poignées drag invisibles (`cursor=ew-resize`) sur les bords des segments dans `MultiTrackTimeline`. Glisser modifie tStart/tEnd en temps réel.
- Handler `setAnnotationTiming` avec clamp et durée minimum 0.05.

Cas d'usage : O3 fait un écran rapide sur [0, 0.4] pendant que O1 dribble sur [0.3, 1.0] → les deux actions se chevauchent naturellement avec des timings différents.

### Étape 11 — Pénalité de contact d'écran

Le défenseur du porteur qui prend un écran (carrierDef avec `onScreen=true`) reçoit maintenant une pénalité de vitesse `×0.55` dans `speedConstraint`. Combiné avec la friction proximité (déjà existante) et l'allongement du path arc, D1 est nettement retardé après un écran — intuition basket respectée.

Cas observé : D1 contournait l'écran trop rapidement, rattrapant O1 sans réelle perte de temps. Avec la pénalité, D1 perd ~0.3-0.6 sec sur le contact — réaliste.

### Étape 10b — Segments à cheval sur plusieurs étapes

Extension de l'Étape 10 : un segment peut sortir des limites de sa cellule pour s'étaler sur la transition précédente ou suivante.

- `tStart` peut être < 0 (jusqu'à -1) — l'action démarre dans la transition précédente.
- `tEnd` peut être > 1 (jusqu'à 2) — l'action continue dans la transition suivante.
- `attackerTrajectoryAt` regarde les annotations sur les steps `idxA` ET `idxA+1` pour trouver les actions actives à tout instant global.
- UI : `overflow: visible` sur les cellules + `z-index` + `box-shadow` pour visualiser le débordement. Drag autorisé hors [0, 1].

Cas d'usage : un écran qui se met en place pendant que le porteur finit son dribble — le défenseur du porteur traverse la zone d'écran alors qu'elle est déjà active.

### Étape 12 — Qualité d'écran (0-100)

Suite de l'Étape 11 : la pénalité de contact écran (`×0.55`) devient modulable par un nouveau champ `Annotation.quality` (0-100, défaut 50).

- Courbe linéaire par morceaux `screenPenaltyFromQuality(q)` exportée par [`speedConstraint.ts`](../src/lib/logic/defense/speedConstraint.ts) :
  - **0 ghost** → ×1.00 (faux écran)
  - **25 loose** → ×0.78
  - **50 std** → ×0.55 (= Étape 11)
  - **75 solid** → ×0.32
  - **100 lockdown** → ×0.18 (~1.2s perdues)
- UI : badge cliquable `ghost/loose/std/solid/lock` sur chaque segment screen du MultiTrackTimeline. Clic cycle entre les 5 paliers.
- Handler `setAnnotationQuality(stepIdx, annoIdx, quality)` dans `useAppState`.

### Étape 13 — Timecode (24s possession)

Le moteur reste step-based, mais l'affichage parle désormais le langage du basket réel.

- Champs `AppState.secondsPerStep` (défaut 4) et `possessionSeconds` (défaut 24) — modifiables dans le panneau Paramètres > TIMECODE.
- Module [`timecode.ts`](../src/lib/logic/timecode.ts) : `formatClock`, `formatShotClock`, `realStepToSeconds`, `shotClockAt`, `totalDurationSeconds`.
- Timeline principale : affiche `0:08 / 0:16` + badge **⏱ shot clock** (jaune sous 5s, rouge **VIOL.** si la possession est dépassée).
- MultiTrackTimeline : entête de chaque transition annotée avec son timing absolu (`0.0s`, `4.0s`…).

### Étape 15 — Refonte du réalisme des écrans

Sprint dédié au réalisme défensif sur écran. Le coach a signalé plusieurs problèmes successifs :
- D1 "glissait" sur le poseur sans vrai contact
- Téléportation autour du poseur lors d'un micro-décalage du porteur
- D1 et O1 visuellement superposés en édition libre
- Au défige, D1 sautait brutalement vers son homme (vélocité discontinue)

**Diagnostic central** (cf. bilan dans le commit d929d73) : `followDefendersAtFrame` réécrivait à chaque frame la position de D1 pour le re-coller sur son homme, court-circuitant TOUT le travail amont (freeze, courbe Bezier, apex slowness, time-remap).

**Briques refondues** :

1. **Détection à step 0** ([step0Detection.ts](../src/lib/logic/step0Detection.ts)) — substitue les positions de référence par les cibles homme-à-homme idéales pour que `detectScreen` trouve les poseurs même quand `defenseInitial` est loin du jeu.

2. **Cibles modulées par qualité** ([screens.ts](../src/lib/logic/screens.ts)) — `applyScreenAdjustment(quality)` place D1 sur le poseur (over/hedge) ou derrière le porteur (under), selon la rule et la qualité. Helper `pushOutOfCarrier` garantit ≥ 34px de clearance.

3. **`sideOfCarrier` continu** — projection du vecteur normalisé poseur→porteur sur l'axe perpendiculaire (au lieu de `Math.sign`). Plus de téléport à la traversée d'axe.

4. **Animation freeze sigmoïdal** ([frameResolver.ts](../src/lib/logic/playback/frameResolver.ts)) — `screenContactT` (k=1→13 selon q) sans discontinuité de vélocité. Modes `arriving`/`leaving`/`stuck`.

5. **Protection contre `followDefendersAtFrame`** — `screenLockedDefenders: Set<DefenderId>` listant les défenseurs en contact, passé en `skipIds` pour que leur position calculée ne soit pas écrasée.

6. **Recover** ([speedConstraint.ts](../src/lib/logic/defense/speedConstraint.ts)) — `isRecoveringFromCarrierScreen` applique la pénalité de vitesse au step SUIVANT (recover lent) en plus du step de contact. `previousCarrierScreenQualityByDef` mémorise la quality.

7. **Trajectoire route-aware** — `curveAroundObstacle(forcedPushSign)` impose le côté de contournement selon la rule. `contactQualityForRule` module la durée de contact (under ×1.18, hedge ×1.05, over ×0.85, etc.).

8. **Écrans non-porteur** — mode arriving/leaving/stuck étendu au défenseur du cutter. Cibles `applyOffBallScreenAdjustment` over/chase à clearance respectée.

### Tests
- **493 tests verts** après l'Étape 15 (vs 460 avant, +33).
- Nouveau fichier `screenContactFrame.test.ts` : tests de bout-en-bout via `resolveFrameAt` (pas seulement les briques en isolation).
- Invariant non-chevauchement testé sur toutes rules × toutes qualities.
- Invariant continuité testé par balayage du porteur autour de l'axe poseur→panier.

### Limites encore ouvertes
- État de contact multi-phase explicite (approche → impact → arrest → contournement → recover) avec durées propres
- Indicateur visuel dédié sur D1 ("contact", "bloqué", "recover")
- Mémoire de retard étendue aux défenseurs de cutters (off-ball recover)

### Étape 14 — PDF lisible quand les actions se chevauchent

Quand plusieurs annotations (screen + dribble + cut) tombent sur la même étape, le visuel imprimé seul ne dit pas qui agit à quel moment. Étape 14 ajoute la couche textuelle/synoptique manquante.

- **Sous chaque vignette** : timecode (`0:04 → 0:08 (4.0s)`) + liste à puces des annotations parallèles avec leurs timings absolus, qualité d'écran et tags (★ cross-step, *(début)* pour phase='start').
- **Section Synoptique multi-pistes** (cochable, sur page séparée) : grille joueur × transition avec barres positionnées selon tStart/tEnd. Pour les écrans, code qualité (`gh/lo/st/so/lk`).
- Helper [`annotationSummary`](../src/lib/logic/pdfRecap.ts) extrait pour testabilité.

### Tests
- **460 tests verts** au total après les Étapes 2-14 (vs 348 avant, +112 tests).
- Nouveaux fichiers : `threatResolution.test.ts`, `rimProtectionLayer.test.ts`, `baselineDrive.test.ts`.
- Sections enrichies dans `zoneDefense.test.ts` (P3.b high-post isolé, P3.c baseline, P3.d ball-pressure, P3.e rim protection, P3.f weakside paint sag + recover).

### Limites résiduelles connues
- **Recover after help engine-level** : les défenseurs en transit après aide sont limités par `speedConstraint`. Le boost recover (4.b) et le diagnostic (3.d) atténuent mais ne corrigent pas un défenseur qui doit physiquement traverser le terrain.
- **Pas de "rotation cascade" 5-stages** : quand un défenseur sort, ses voisins comblent partiellement (via `ballSideShifted`) mais pas via une vraie chaîne dynamique D2 sort → D5 glisse → D4 fill.

---

## 🆕 Travail récent — branche `simon/flamboyant-hodgkin-3a101f`

Lot de corrections et d'améliorations livrées dans cette branche (cf. [CHANGELOG.md > Unreleased](../CHANGELOG.md)) :

### Vision et orientation
- **Regard auto distance-based** ([vision.ts](../src/lib/logic/vision.ts)) : en stance `sag`/`behind`/défaut sans `gazeLock`, la cible primaire bascule selon la distance (`PROXIMITY_GAZE_RATIO = 0.65`). Si l'homme est nettement plus proche que le ballon il devient primary, sinon le ballon reste primary. Le secondary reste visible si le cône 120° le permet, le clamp ±60° est préservé. Voir [orientation-anti-teleport.md](./orientation-anti-teleport.md#regard-auto-distance-based-proximity_gaze_ratio).

### Trajectoires et lecture
- **Tracé du dribble en wave Q-Bezier lisse** ([dribbleWave.ts](../src/lib/logic/dribbleWave.ts)) : remplace l'ancienne polyligne en dents de scie par une chaîne de courbes quadratiques Bezier avec jonctions C1 sur l'axe. `sampleDribbleWave` partage la géométrie pour que le joueur reste pixel-aligné avec le tracé.
- **Annotations en courbe via Shift+drag freehand** ([polyline.ts](../src/lib/logic/polyline.ts)) : `Annotation.waypoints?: Point[]` permet des trajectoires V-cut, L-cut, démarquage en arc, dribble curviligne. Spline Catmull-Rom (τ=0.5, équivalent Bezier cubique exact en rendu), reparamétrage en longueur d'arc pour vitesse perçue constante, simplification Douglas-Peucker du buffer freehand. Voir [data-model.md > Trajectoire courbe](./data-model.md#trajectoire-courbe-polyline--catmull-rom).
- **Tous les défenseurs suivent leurs attaquants en temps réel** ([engine.ts:followDefendersAtFrame](../src/lib/logic/engine.ts)) : carrier defender + off-ball recalculés à chaque frame depuis la position courante de leur attaquant marqué (`carrierDefenderTarget` / `offBallStanceTarget` / `manTarget`). Skip si placement manuel via `defenseOverrides`. Voir [logique-defensive.md > Suivi temps-réel](./logique-defensive.md#suivi-temps-réel-des-défenseurs-en-lecture-followdefendersatframe).

### Défense
- **`hedge` complet** ([screens.ts](../src/lib/logic/screens.ts)) : avant, seul `screenerDef` (D5) sortait en show. Désormais `carrierDef` (D1) passe **over the top** de l'écran avec un décalage latéral 8–16 px tight sur le porteur — le couple D1/D5 ferme à la fois la pénétration et la rejection.

### UX playback
- **⏸ fige l'instant courant** au lieu de retomber sur la frame statique : `playbackT` propagé dans `scrubT` ([page.tsx](../src/app/page.tsx)).
- **▶ après pause reprend depuis l'instant pause** via la prop `playbackStartT` sur CourtView qui décale `playStart` en arrière. ⏹ reste distinct (reset à 0).

### Tests
- 14 nouveaux tests dans [polyline.test.ts](../src/lib/logic/__tests__/polyline.test.ts) : sample, path, simplify, V-cut.
- 1 test ajouté dans [screens.test.ts](../src/lib/logic/__tests__/screens.test.ts) pour le mouvement de D1 en hedge.
- Tests `dribbleWave.test.ts` mis à jour pour la wave Q-Bezier.
- Suite totale : **302 tests verts**.

---

## ✅ Fait (livré sur `main`)

### Engine & moteur
- **Défense individuelle** complète (man-to-man, help, denial, ICE, lateral steps).
- **Défense de zone** : 2-3, 3-2, 1-3-1, 2-1-2, match-up — paramétrables (pression, rotation, vertical offset, trap coin, extension 3pts).
- **Mode édition zones** : override par défenseur, presets, reset.
- **Pipeline de simulation** Monte Carlo (best action, threats, pass lanes).
- **Coach diagnostics** : couverture propre / fuites / aide en place / corners tenus.
- **Anti-téléport** : interpolation continue des positions inter-steps.

### Mode scénario (Phase 1+2)
- **Tier 1 offensives** : pick-and-roll, pick-and-pop, hand-off (DHO), back-screen, away-screen, flare, pin-down, cross-screen, hammer, drive, cut, pass, screen, shot. Empilables → génération auto de `Step[]`.
- **Sélecteur d'action** en modale popup avec filtre texte (`AddActionModal`).
- **Carte d'action compact/expand** dans `ScenarioPanel`.
- **Réordonnement** monter/descendre, suppression, libellé libre par action.

### Phase 3 — défense scriptable (MVP)
- `ScriptedAction` est une **union discriminée** (`kind: 'offensive' | 'defensive'`).
- **4 actions défensives MVP** : `help-and-recover`, `pre-switch`, `trap`, `tag`.
- Modules : `applyDirective.ts`, `defensiveCompilation.ts`, `defensiveDefaults.ts`, `defensiveActionsCatalog.ts`.
- **Couvertures couplées** (attachées à une action offensive via `parentActionId`) avec defaults inférés du contexte.
- **Actions défensives libres** (`affectedSteps` explicite) avec section dédiée dans `ScenarioPanel`.
- **Toggle global** `defenseScriptedDirectivesEnabled` (default true) dans `DefensePanel`.
- Tests d'intégration : `applyDirective.test.ts`, `defenseScriptedIntegration.test.ts`, `defensiveCompilation.test.ts`, `defensiveDefaults.test.ts`, `defensiveActionsCatalog.test.ts`.

### UI
- Layout 3 colonnes responsive avec `presentMode` (plein écran) — Échap pour quitter.
- **`FloatingActionsMenu`** : bouton `⋯` flottant en haut à droite du terrain → menu avec 5 actions globales (plein écran, playbook PDF, exporter/importer JSON, reset). Reste visible en plein écran.
- **Scroll vertical indépendant** sur les colonnes latérales (overflow-y auto).
- Bibliothèque de systèmes : 7 templates classiques + sauvegarde locale + import/export par dossier.
- Playbook PDF (export multi-pages avec annotations).
- Timeline (lecture, scrub, pause/play, vitesse).
- Métriques en bas : raquette, gap max, écart moy, en retard, aide, passes, meilleure action.

---

## 🚧 En cours (spec ou WIP non mergé)

### Scénario en popup plein écran
- **Spec** : [`docs/superpowers/specs/2026-05-09-scenario-editor-modal-design.md`](./superpowers/specs/2026-05-09-scenario-editor-modal-design.md) ✅
- **Plan d'implémentation** : ❌ pas écrit
- **Implémentation** : ❌ pas commencée
- **Idée** : alléger drastiquement la colonne gauche en réduisant `ScenarioPanel` à un résumé minimal (liste des libellés + bouton ouvrir) et déplacer toute l'édition (formulaires, couvertures, défense libre) dans une modale `ScenarioEditorModal`.

### Multi-format de jeu (2x2 / 3x3 / 4x4 / 5x5)
- **Mergé sur `main`** (commit `cea5111`, depuis l'ancienne branche `wip/player-count`)
- **État** : type `PlayerCount`, module `src/lib/logic/players.ts`, champ `AppState.playerCount`, toggle dans Paramètres, propagation à travers engine + 17 composants. **Type-check ✅, 234 tests ✅**.
- **Travail non terminé** : implémentation fonctionnelle de base mais manque sans doute du polissage UX/edge cases. À éprouver en usage réel et compléter au fil des bugs/manques constatés.

---

## 📋 À faire (planifié, pas démarré)

### Mode scénario — Phase 2 (Tier 2 offensives)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 1. Toutes les variantes d'écrans non couvertes par le Tier 1 :
- **Écrans porteur** : angle/slot, butt, drag, double drag, flat, ghost, hostage/Gortat, inverted, logo/side, Spain/stack, step-up, twist, wedge.
- **Écrans non-porteur** : ATO horns, chicken (Iverson + flare), elevator, floppy, hammer wing, Iverson, rip, screen-the-screener (STS), shuffle, single-double, staggered, UCLA, wide pin-down, zipper.
- **Cuts/pénétration variantes** : back-cut, basket-cut, baseline drive variantes, curl, fade, flex cut, give-and-go, L-cut, V-cut, shallow cut, slip cut, spot up.

### Phase 3 — défense scriptable (au-delà du MVP)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 2. Actions défensives à ajouter :
- **Couvertures PnR** non couvertes : drop coverage, soft hedge, switch (vrai switch défensif, pas pre-switch), ICE/blue, weak, X-out.
- **Actions de pression** : closeout, double-team (différent de trap), stunt, dig, gap.
- **Aide off-ball** : jam-cutter, lock-and-trail, rotation X (rotation triggérée par drive), shell rotation.

### Phase 4 — entrées et sets pré-formattés
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 3. Génère 1 step de positionnement initial :
- Box, horns, 4-out 1-in, 5-out, 1-4 high/low, double stack, etc.

### Backlog UI / UX
- Refonte `ScenarioPanel` en popup plein écran (cf "En cours")
- **Popup timeline multi-pistes par joueur** : inspiré FastDraw — une popup affichant une timeline horizontale avec une piste par joueur (5 attaquants + 5 défenseurs), chaque piste montrant les segments de mouvement / passes / écrans avec leur durée précise. Permettrait au coach de voir d'un coup d'œil le découpage temporel de chaque joueur, qui bouge quand, et le synchronisme entre actions. À placer en plus de la timeline globale actuelle.
- Import multi-fichiers JSON (drag & drop)
- Édition inline du libellé d'étape sans cliquer (focus auto à la création)
- Annotations textuelles libres sur le terrain (cf `Annotations.tsx`)
- Mode "présentation projetée" (police plus grosse, contrastes augmentés)
- Raccourcis clavier pour ouvrir le menu flottant (cf [`keyboard-shortcuts.md`](./keyboard-shortcuts.md))

### Backlog tests / qualité
- Vérifier la couverture de `applyDirective` pour `pre-switch` avec swapWith manquant
- Tests E2E (Playwright ?) sur le flow complet : créer scénario → simuler → exporter PDF
- Configurer `eslint` correctement (actuellement `npm run lint` échoue — config manquante)
- Ajouter `.claude/` au `.gitignore` (worktrees Claude pollue le `git status`)

### Documentation
- Mettre à jour `docs/architecture.md` avec le multi-format quand `wip/player-count` sera mergée
- Documenter `applyDirective` en détail (pseudo-code par type d'action)
- Tutoriel "premier scénario" pour onboarder un nouveau coach utilisateur

---

## Conventions de mise à jour

Quand une feature passe de "en cours" à "fait", la **déplacer** dans la section ✅ avec un résumé court.
Quand une nouvelle idée émerge, l'**ajouter** à 📋 avec assez de contexte pour qu'on s'y retrouve dans 6 mois.
Mettre à jour la **date** en tête du doc à chaque modif.
