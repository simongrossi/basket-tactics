# Idées & TODO

Notes de développement au fil de l'eau. Les items en haut sont les plus récents.

---

## Session 2026-05-19 (matinée + soir) — Chantiers en cours, état au commit f761626

### Livré (5 fixes session post-CVT)
- **Recovery snap** : `screenContactAdhesion` window 10% → 25-39% (anti-rubber-band).
- **Template PNR central v1** : O5 (290,340) → (340,290) + `forcedScreener`.
- **Defensive 3-sec exception** : help actif (pnrRole + paint occupée) plus flaggé.
- **Toggle UI CVT** dans DefensePanel.
- **6 scripts de diagnostic** standalone réutilisables pour profiler templates.

### Chantiers ouverts

#### A. CVT — sous-étape 1.4b restante
Activation par défaut du flag `useSteeringEngine`. Tentative faite → 13 tests
cassent (golden snapshots J.6 inclus). À faire :
1. Validation visuelle scénarios réels avec flag on.
2. Régénération supervisée des snapshots J.6 (`vitest -u` après inspection).
3. Mise à jour ciblée des tests de positions exactes (déviation acceptable
   confirmée scénario par scénario).
Ne pas lancer avant que le user ait validé visuellement quelques templates clés.

#### B. Chantier écrans / templates (en cours)
Le user veut continuer sur les écrans après PnR central. Templates à profiler :
- **UCLA cut** : écran back-screen O5 sur O3 hors-ballon.
- **Spain PnR** : double écran enchaîné (back + roll).
- **Pindown coin** : écran descendant côté coin pour cutter.
- **Floppy** : double écran staggered en bas de la raquette.
- **Hammer** : back-screen + skip pass coin.
- **Horns flare** : flare screen post-pass.

Pour chacun, suivre la méthode validée sur PNR central :
1. `scripts/diag-pnr-frames.ts` adapté → identifier les anomalies (snap,
   collision, screenPhase incorrect).
2. `scripts/check-phase.ts` adapté → vérifier le timing de la phase écran.
3. Reposer le poseur si placement incorrect + `forcedScreener` si détection
   géométrique loupée.
4. Régénérer le snapshot J.6 si nécessaire.

#### C. Path-Aware Interpolation (chantier indépendant)
Hors CVT. Modifier le **lerp linéaire** dans `playback/frameResolver.ts`
entre 2 step targets pour courber la trajectoire quand le segment traverse
un obstacle. Premier gain visuel majeur sur tous les templates.

État : pas démarré. Demande un design dédié (Bezier avec waypoint
dynamique selon la position interpolée des obstacles à chaque frame).
Risque : interactions complexes avec `curveAroundObstacle` existant.

#### D. Bug user non reproduit
"O1 revient en arrière à partir de f119" sur PNR central. Non reproduit
dans `scripts/diag-pnr-frames.ts` (O1 a une trajectoire monotone). Si le
symptôme persiste, demander capture d'écran + version exacte de l'état
au moment du bug (steps + annotations).



---

## Session 2026-05-19 — CVT : Chantier 1 (1.0/1.1/1.1b/1.2) + Chantier 1.3 infra + Chantier 2 infra + Chantier 3 infra

Grosse session refonte cinématique vectorielle tactique. **8 commits**
sur `main`, **1545 → 1642 tests verts (+97)**. Tout en opt-in via
`state.useSteeringEngine`, zéro régression pipeline legacy.

**Livré câblé (flag on → comportement modifié)** :
- 1.0 — `steeringEngine.ts` : `SteeringForce`, primitives `seek` /
  `repel` / `arrive`, accumulateur additif Reynolds, `composeTarget`
  + `integrateForce`. 24 tests.
- 1.1 — `manDefense.ts` : variantes forces (`manTargetForces` etc.),
  flag `useSteeringEngine`, branche `defense/baseTargets.ts`.
  Bit-équivalent legacy. 15 tests.
- 1.1b — `arrive` (rampe `slowingRadius=12 px`) au lieu de `seek`.
  Anti-oscillation près de la cible (déviation max théorique 3 px).
  `defenderRef` passe à `prevDefenderPositions[dId]`. 4 tests
  dampening.
- 1.2 — `help.ts` : `computeHelpForces` wrappe `computeHelpTarget` en
  `arrive` amorti, préserve toute la métadonnée. 4 tests.

**Livré non câblé (infra prête, comportement inchangé)** :
- 1.3 — `screens/repelForces.ts` : `screenerRepelForce` /
  `screenersRepelForces` (falloff linéaire dans
  `SCREEN_REPEL_RADIUS_PX = 46 px`). 9 tests.
- Chantier 2 — `influenceMap.ts` : `InfluenceLane`, segments
  passe + drive, `signedPerpDistance`, `projectOnSegment`,
  `interposeForce`. 20 tests.
- Chantier 3 — `defenseTriangle.ts` : `triangleAngleDeg`,
  `profileWeightMultipliers` (calibration shooter/slasher),
  `isPassShadowed`, `passShadowsByDefender`. 21 tests.

**Câblages livrés en 2ᵉ vague (2026-05-19 nuit/matin)** :
- 2b — `defense/influenceLayer.ts` (couche 1.3 du pipeline). Shift
  soft 5 px max vers la projection sur la ligne porteur↔homme pour
  défenseurs "libres". 4 tests.
- 3b — `isPassShadowed` propagé dans `DefenderTarget` +
  `ComputedDefender` via `passShadowsByDefender`. 2 tests.
- 3c — pondération distance par profil offensif dans `baseTargets`
  (`dist = baseDist / profileWeightMultipliers(profile).manWeight`).
  Shooter close out tighter, slasher sag franc. 2 tests.
- 1.3b — `defense/screenRepelLayer.ts` (couche 2.1) — version
  **conservatrice** : raffine la trajectoire des défenseurs
  périphériques (non carrier/screener/pnrRole), cap 3 px. 3 tests.
  **Limitation** : ne remplace pas le push-out binaire de
  `screens/helpers.ts`.

**Reste à faire (sous-étapes restantes)** :
- 1.3c — Refactorer `applyScreenAdjustment` pour remplacer
  `pushOutOfScreener` / `pushOutOfCarrier` par un système `repel`
  pur. Requiert revalidation exhaustive `screens*` / `overlap*` /
  `userJson*` / `screenLab*`. **Le chantier le plus risqué** du
  CVT — à attaquer après validation visuelle complète des câblages
  actuels.
- 1.4 — Activation par défaut + nettoyage de la double-sortie legacy.
  À ne lancer qu'après stabilisation 1.3c et validation visuelle.

**Tolérance tests d'équivalence intégrés** : 12 px (était 5 px en
1.1b). Borne cumulative documentée :
- ≤ 3 px de l'`arrive` dampening en zone proche (1.1b).
- ≤ 5 px de l'interpose layer (2b).
- ≤ 3 px du screen repel layer (1.3b).
- + arrondis du pipeline complet (speedConstraint, closeout, etc.).

**Constantes de tuning ajoutées** dans `data/physics.ts` :
- `STEERING_MAN_SLOWING_RADIUS_PX = 12`
- `STEERING_SCREEN_REPEL_BUFFER_PX = 12`, `STEERING_SCREEN_REPEL_WEIGHT = 20`
- `PASS_SHADOW_TOLERANCE_PX = 16`

**Pièges identifiés (ne pas refaire)** :
- Ne JAMAIS retirer le passage final par `constraintSolver.ts` —
  Règle 1 inviolable. Les forces sont "soft", le solveur est "hard".
- Garder `defenseOverrides` strictement prioritaire — court-circuiter
  toute la pipeline de forces quand un override est actif.
- Le wrapping "forces qui produisent un target absolu via
  `composeTarget`" est un **pont transitoire**. Quand 1.4 sera
  livré, on passera à une vraie intégration temps-réel dans
  `speedConstraint.ts`.
- Toujours `prevDefenderPositions[dId]` (pas `defenseInitial[dId]`)
  comme `defenderRef` quand `arrive` est appliqué : sinon
  l'amortissement fire vs un point statique sans effet.
- 1.2 — Choisir le bon `slowingRadius` pour `arrive` : trop petit =
  pas d'effet anti-oscillation, trop grand = défenseur traînard.
  Probablement à corréler avec `PROXIMITY_FRICTION_RADIUS` existant.
- 1.3 — Pour `repel` autour des poseurs d'écran : `radius` candidat =
  `PLAYER_MIN_CLEARANCE_PX + buffer`. À mesurer en regardant les
  trajectoires actuelles côté `screenAvoidance` pour ne pas faire
  pire.
- 1.4 — Tuner les `weight` relatifs : par défaut `W_seek_man = 1`,
  `W_repel_screen = ?`, `W_arrive_stance = ?`. Probablement à
  exposer dans `data/physics.ts` à la fin du Chantier 1 pour permettre
  tuning fin.
- Diagnostic / debug : envisager un overlay debug "force vectors"
  (sous toggle) qui dessine les forces accumulées de chaque défenseur.
  Très utile pour comprendre les comportements émergents.

**Pièges à éviter (notés à l'avance)** :
- Ne JAMAIS retirer le passage final par `constraintSolver.ts` —
  Règle 1 inviolable. Les forces sont "soft", le solveur est "hard".
- Garder `defenseOverrides` strictement prioritaire : court-circuiter
  toute la pipeline de forces quand un override est actif.
- Tester systématiquement `screens*` + `overlap*` + `userJson*` +
  `screenLab*` avant chaque commit qui touche `defense/*`.

---

## Session 2026-05-18 soir — Phases B/C/F/G complètes + D 4/5 (FAIT)

16 commits sur `main`, 1279 → **1353 tests verts** (+74). Détail dans
CHANGELOG [0.12.0]. Faits marquants :

- **B.3** end-of-quarter contest (badge `🚫 NO FOUL`, miroir de F.4).
- **B.4** synchro cross-actor : `Annotation.tStartAbs/tEndAbs` en
  secondes + UI shift+click dans MultiTrackTimeline.
- **D.1** easing cross-step, **D.3** trajectoires passes lob/bounce/skip,
  **D.5** invariant collision validé. D.2 marqué livré (désync ROADMAP).
- **D.4** plan d'audit risque écrit ([docs/d4-pathfinding-plan.md](docs/d4-pathfinding-plan.md))
  mais V1 **non lancée** par choix.
- **F.1 V1 + V2** junk defenses (Box-and-1, Triangle-and-2, Diamond-and-1)
  avec 3 formations + 1 ou 2 chasseurs + UI complète.
- **G.1** doc calibration vitesse ([docs/physics-calibration.md](docs/physics-calibration.md)),
  **G.2** sprint boost contextuel, **G.3** modèle d'accélération, **G.4**
  profil athlétique défenseurs. Phase G complète 4/4.
- **J.7** panneau debug joueur (overlay tableau 5 défenseurs).
- **J.5** profile overlay live — mean/p95/max par phase défensive,
  buffer glissant 120 frames, phase la plus coûteuse highlight 🔥.
- **J.6** visual regression légère — snapshots Vitest sur 4 templates
  (ucla-cut, pnr-central, pindown-corner, floppy). Toute régression
  future du moteur sera détectée automatiquement au prochain test run.
- **J.1** parité scrub ↔ playback — 2 lignes + 8 tests d'invariant.
  Les overlays J.5/J.7 marchent maintenant aussi en scrub.
- **A11 V1** Box-out / rebond demi-jeu — le seul gros chantier basket
  restant. Livré en 3 phases (types + setter + cohérence) + 1 docs.
  Coût réel ~3h vs 5-8j estimé : énormément d'infra existait déjà
  (`computeRebound`, `boxOutCheckRule`, pattern F.2 free-throw). 25
  tests. Plan complet dans [docs/a11-plan.md](docs/a11-plan.md).
- **A11 V2** Extensions — `shotOutcome: 'blocked'` (contre déterministe,
  défenseur le plus proche du shooter récupère) + reset shot clock à
  14s sur rebond offensif (règle FIBA/NBA) + `outletPassPending` marker
  sur rebond défensif + nouvelle règle coach `outletPassRule` qui
  suggère la passe outlet pour la transition. 12 tests. ~1h.
- **E.1 stage 2b V1** Phase adverse en mode édition. `Step.viewSide?:
  'home' | 'away'` + setter `convertStepToAwayPossession` (mirror
  vertical autour de y=540) + 2 boutons UI (guidé post-rebond
  défensif + libre toggle) + banner CourtView + diag coach
  `awayPossessionRule`. Option A ultra-mini choisie (Options B/C
  reportées, plan dans [docs/e1-stage2b-plan.md](docs/e1-stage2b-plan.md)).
  15 tests. ~1h. Le moteur défensif tourne tel quel, zéro risque Règle 1bis.
- **A11 V3 outlet setter** `addOutletPassStep` chaîne en 1 clic le
  flux "rebond défensif → transition adverse" (clear outletPassPending
  + insère step adverse). UX 1 clic au lieu de 2. 4 tests.
- **Phase K behavior anomaly detection** (7/7) — nouveau pilier
  observabilité demandé par user "suivre comportements anormaux et
  anomalies de déplacement". 7 commits, 56 tests, 1450 → 1506 verts.
  Zéro impact moteur (Règle 1bis safe).
  - **K.1** téléport (>24 px) / **K.2** vitesse aberrante (×1.95 maxSpeed)
  - **K.3** décroché (>250 px du matchedTo, hors aide/screen)
  - **K.4** flicker (cos < -0.707 sur 3 frames)
  - **K.5** regard anormal (>90° du corps, Règle 3 CLAUDE.md)
  - **K.6** règle coach `playerAnomalyRule` + toggle `anomalyDetectionEnabled`
  - **K.7 V2** correcteurs purs `clampTeleports` / `clampAberrantSpeed`
    (non wirés au resolver, opt-in via call site).
- **F.2 V1 + V2 press defenses** Dernier chantier basket de la roadmap.
  `DefenseSystem 'press'` + couche `pressLayer.ts` court-circuit
  (pattern F.1 junk). PAS de refonte de `getDefenseHoop` préconisée par
  le ROADMAP — approche pragmatique zéro risque Règle 1bis.
  - **V1 half-court 2-2-1** : 2 médiane + 2 relais + 1 sweeper. 9 tests.
  - **V2 full-court 1-2-1-1 + trap dynamique** : chaser haut, 2 ailes
    back-court, médian, sweeper. Au franchissement de la médiane
    (`HALF_COURT_Y=540`, direction-aware), les 2 défenseurs les plus
    proches tirés de 35 px vers le porteur en préservant la clearance.
    `pressConfig.trapOnHalfCourtCross` (défaut true). 6 tests.
  - V2.5 retreat progressive reportée.

**Le moteur tactique est désormais complet.** Tous les gros chantiers
basket sont livrés. Reportés sans impact bloquant :
- E.1 V2 stage 2b (refacto 2-way home/away, Options B/C)
- F.2 V2.5 retreat progressive
- J.2/J.3 qualité moteur (perf cache, solver unifié)

Le projet est livrable pour démos coachs réels.

---

## Session 2026-05-17/18 (matin) — Temps réel + défense fin de possession (FAIT)

- **B.1** : champ `Step.duration?` + accumulation cumulative dans
  timecode. Timeline / MultiTrack / Playbook recap migrés. 17 tests.
  Voir CHANGELOG [0.11.0].
- **B.2** : helper `shotClockBand()` 3 bandes (vert/jaune/rouge),
  mutualisé Timeline + LiveMatchOverlay + SimulationSection. 3 tests.
- **C.2 V2** : `helpStickinessMs` (100-2500 ms) prime sur V1 steps.
  S'appuie sur B.1 pour la granularité fine. Slider DefensePanel.
  8 tests. Phase C complète (7/7).
- **F.4 V1** : foul to give opportunity detection — diag coach
  `critical` + badge SVG `🟥 FOUL TO GIVE`. 9 tests.
- **F.5 V1** : late shot clock defense — couche 1.7 désactive l'aide
  sous 5 s du shot clock + contest accru sur porteur. 5 tests.
- **Polish dark mode** : toolbar Playbook + 5 fichiers context menu
  joueurs migrés sur tokens `DARK_PANEL.*`.

Reste accessible (cf. `docs/todo-priorities.md`) : B.3, B.4, F.1, F.3,
A11, G.1.

---

## Changements récents (rétro-historique condensé)

### Lecture & timeline (FAIT)
- `playbackT` lifté au niveau de la page : `CourtView` notifie via `onPlaybackTick`, `Timeline` affiche le playhead qui avance pendant la lecture
- Refactor du RAF de lecture : `state` n'est plus dans les deps de `useEffect` — on passe par un `stateRef.current` mis à jour à chaque render. Avant, chaque petite mutation de `state` (mémo, mutation interne pour persister un switch, etc.) redémarrait le RAF avec `playStart` reset à `now()` → la lecture restait coincée à `globalT ≈ 0`. Cause directe du bug "rien ne se passe quand je clique play".
- Onglet "stop" remet aussi `playbackT` à `null` et active step à 0
- Fin de lecture remet `playbackT` à `null` et l'active step au dernier

### Viewport (FAIT)
- SVG du terrain : `width: 100%; height: 100%` + `preserveAspectRatio="xMidYMid meet"` ; wrapper `flex: 1; min-height: 0; overflow: hidden`. Plus de débordement, le terrain s'adapte exactement à l'espace disponible.

### Overrides défense (FAIT)
- `Step.defenseOverrides: Partial<Record<DefenderId, Point>>` — positions manuelles par étape
- `moveDefender` écrit dans les overrides de l'étape active (et met à jour `defenseInitial` à l'étape 0 pour la cohérence détection d'écran)
- L'engine respecte les overrides : skip auto-targeting + lateness pour les défenseurs override
- Cadenas jaune sur les défenseurs avec override actif (visible d'un coup d'œil)
- Bouton "↻ ré-auto-positionner" dans le menu contextuel (clic-droit) pour effacer un override

### Lignes de passe (FAIT)
- Nouveau composant `PassLanesOverlay`
- Toggle "lignes de passe" dans Visualisation (panneau défense)
- Pour chaque destinataire potentiel : ligne pointillée du porteur, catégorisée selon l'écart du défenseur le plus proche au segment
  - Vert "ouverte" : > 35px
  - Orange "contestée" : 18–35px
  - Rouge "bloquée" : < 18px
- Badge central avec ID + statut

### Rotation zone améliorée (FAIT)
- L'algo itère désormais sur les **zones surchargées** (pas sur les vides) et **consomme** les zones vides au fur et à mesure → plus de convergence multiple sur le même attaquant secondaire
- Tri des surchargées par criticité (proches du panier d'abord)

### Contraintes vsCarrier supplémentaires (FAIT)
- `topside` : force le porteur côté milieu (lateral offset +14px)
- `baseline` : force le porteur côté ligne de fond (lateral offset −14px)

### Stances off-ball (FAIT)
- `OffBallStance: 'sag' | 'behind' | 'deny-3q' | 'fronting'`
- Champ optionnel `DefenderRule.offBallStance`
- Les stances dirigées sautent le help bias (positions absolues)

### Distance min carrier defender (FAIT)
- `MIN_TARGET_DIST = 38` dans `carrierDefenderTarget` — empêche le défenseur de chevaucher visuellement le porteur

### Clic-droit fixed après screener layering (FAIT)
- Si la cible DOM est un attaquant (cas du poseur d'écran rendu au-dessus dans la pile SVG), fallback sur la recherche du défenseur le plus proche du point cliqué

### Bras défensifs (FAIT, version finale)
- Bras stylisés FIBA fixes au-dessus du cercle (ne tournent plus — la rotation vers `matchedTo` donnait visuellement un défenseur "à l'envers")
- Pointeur d'orientation : petit triangle plein sur le bord du cercle, du côté du `matchedTo`

### Calque z-order corrigé (FAIT)
- Annotations utilisateur (passe/dribble/course/écran) et indicateurs d'écran rendus **au-dessus** des joueurs
- ScreenIndicator renforcé : cercle plus épais + fond translucide sur le poseur + label sur fond blanc avec border

### Step 0 sans lateness (FAIT)
- À l'étape 0, la contrainte `defenseMaxSpeed` ne s'applique pas — c'est un setup, pas une transition
- La lateness ne joue qu'aux transitions step → step+1

---

## Backlog actuel (à attaquer)

### Métriques tactiques EJE / EJO / EJP (FAIT — fondation, 949 verts)
Module pur sous `src/lib/logic/tactical/` (commit `389aad5`). Inspiré de Mérand / Vandevelde : Espace de Jeu Effectif (convex hull + surface), Offensif (couloir ballon→cible 1.5 m / 2.5 m), Proche (8 secteurs égocentrés autour du porteur), graphe complet d'équipe (total spacing, centralité, pivot, diamètre), heuristique de niveau `grappe | comete | etalement | expert`. 23 tests dédiés ([tacticalMetrics.test.ts](src/lib/logic/__tests__/tacticalMetrics.test.ts)). **Aucun consommateur** pour l'instant — module inerte tant qu'on ne le branche pas. Doc complète : [docs/TACTICAL-METRICS.md](docs/TACTICAL-METRICS.md).

### Enrichir l'évaluation offensive avec EJO + EJP (TODO — branche A)
Brancher la fondation tactique dans `evaluateOffensiveOptions` de [offense.ts](src/lib/logic/offense.ts). Pour les **drives** : appliquer un facteur `1 − k · nbBloqueurs` (k ≈ 0.25 à calibrer) sur `driveShotQ`, avec `nbBloqueurs = corridorBlockers(buildEJO(carrierPos, hoop, EJO_CORRIDOR_WIDE_PX), defPos).length`. Un défenseur déjà dans le couloir large doit couper la qualité du drive. Pour les **passes** : si `readEJP(receiver, receiverBody, nearestDef).sector === 'front'`, malus sur `receivability` (passe interceptable) ; si `'back'`, bonus léger (défenseur trailing). L'orientation du receveur est déjà calculée par `computeAttackerOrientation`. Tests à ajouter : qualité de drive saturée vs couloir vide, receivability avec défenseur en front/back/right. Plan dédié à écrire avant implémentation.

### Auto-positionnement des attaquants hors-ballon (TODO — branche B)
Nouveau module `src/lib/logic/autoOffense/`. Pour chaque hors-ballon, échantillonner ≈ 12 positions candidates dans un anneau autour du panier compatible avec le profil (`shooter` au-delà de la 3pts, `rim-roller` proche du cercle, `creator` mid-range…). Pour chaque candidate, calculer `totalSpacing(buildSpacingGraph(off'))` où `off'` intègre la candidate, soustraire une pénalité si la candidate tombe dans l'EJO du porteur (sauf rôle "couper"), prendre l'argmax. **Obligatoire** : appliquer via `moveAttackerInState` pour déclencher le push-out anti-overlap de la [Règle 1](docs/PLAYER-CLEARANCE.md). UX : bouton "auto-position" dans le panneau offense, et option "appliquer à chaque step" pour recalculer après chaque déplacement du porteur. Plan dédié.

### Overlay debug EJE / EJO (TODO — branche C, optionnel mais utile pour A et B)
Nouveau composant `EJEOverlay.tsx` rendu sur le SVG du terrain. Toggle dans le panneau Visualisation. Dessine : (a) hull EJE offensif en pointillé, (b) rectangle EJO ballon→panier, (c) badge texte coloré avec `evaluateSpacing(off).level`. Pas de modification du moteur — pur overlay UI. Utile pour valider visuellement la branche A avant de la brancher dans l'EV.

### Numérotation des étapes sur le terrain (vignettes playbook)
Petits ronds 1, 2, 3 sur les positions des joueurs dans chaque vignette PDF, pour voir l'ordre des actions sans avoir à comparer mentalement étape N et N+1. À implémenter dans `StepThumbnail.tsx` : tracer un petit cercle blanc avec un numéro à côté du joueur qui bouge entre cette étape et la précédente.

### Presets défensifs globaux (FAIT)
6 presets dans `lib/data/defensePresets.ts` : Drop coverage, Switch tout, Hedge & recover, Ice (force baseline) + drop, Fond de raquette, Pression all-court. Section "Presets" en haut du panneau défense. Au clic, on patche système + screenRule + offBallScreenRule + dropDepth + distance + maxSpeed + triggers + 5 règles individuelles d'un coup (avec confirm). Les valeurs des règles sont **mergées** (le preset n'écrase que ses propres champs).

À ajouter plus tard : presets pour la zone (2-3 trapping, 1-3-1 active, match-up flex), presets utilisateur (sauvegarder ses propres configs).

### Plus de templates offensifs (FAIT v2 — 6 templates)
Ajoutés à la bibliothèque : Spain PNR (PNR + back-screen sur D5), UCLA cut (passe latérale + back-screen high post pour cut basket), Floppy (O2 sous le panier choisit son écran).

Encore à ajouter : Iverson cut, Hammer action, PNR aile / step-up / step-back, Princeton chin, Pistol, Stagger.

### Tests unitaires logique pure (FAIT — 79 tests)
Vitest installé, 79 tests passants sur 7 modules :
- `engine` (computeDefenseTargets man + zone, getMatchupsAt, effectiveDefensePositions, closeout, over-closeout, attackingDirection, trap)
- `screens` (detectScreen + forcedScreener, detectOffBallScreens, applyScreenAdjustment drop shallow/deep, applySwitch / applySwitchOffBall)
- `metrics` (paint coverage, mostFreeAttacker, lateCount, classification passes)
- `help` (sag baseline weak-side, strong-side denial avec proximité, désactivation paint/trigger/weak-side)
- `trap` (zones coins fond + sidelines mi-terrain, picker, target)
- `manDefense` (stance stunt — blend 0.4)
- `geometry` (pickBlockingObstacle, pickBlockingCluster super-cluster)

Doc : [docs/testing.md](docs/testing.md). Lancer : `npm test`.

À ajouter plus tard : `triggers.detectTriggers` (cas drive/post/paint isolés), `zoneDefense.pointInPolygon` + `mapAttackersToZones` (cas limites), `help.computeHelpTarget` priorité passlane et paint avec blockTarget.

### Menu contextuel attaquant (FAIT)
Clic-droit sur un attaquant ouvre un menu avec :
- **marquer comme porteur** — équivalent rapide du sélecteur "porteur" du panneau gauche
- **forcer comme poseur d'écran** — pose `Step.forcedScreener`, l'engine.detectScreen utilise cet attaquant directement (skip des checks de proximité). Cadenas violet sur le joueur. Bouton "↻ libérer" pour annuler.
- **effacer ses annotations** — supprime toutes les annotations dont `fromId === oId` sur l'étape active

Implémentation : variant `kind: 'attacker'` dans `ContextMenu.tsx`, fallback "joueur le plus proche du clic" dans `CourtView.onContextMenu` étendu aux attaquants. Tests : `screens.test.ts § detectScreen — forcedScreener` (3 cas).

### Raccourcis clavier (FAIT)
Implémenté dans `hooks/useKeyboardShortcuts.ts` :
- Espace : play/pause
- ←/→ : étape précédente/suivante
- M / P / D / R / E : outils (move / pass / dribble / cut / écran)
- Suppr ou Backspace : supprime la dernière annotation de l'étape active

Skip auto si focus dans input/textarea/select/contenteditable, ou si Ctrl/Cmd/Alt enfoncé. Doc : [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md).

### Undo / Redo
- Stack des AppState (max 50)
- Ctrl+Z / Ctrl+Y → restaurer l'état
- À séparer du state principal (un useReducer dédié)

---

---

## Comportements défensifs à affiner

### Sag weak-side baseline (FAIT)
Les défenseurs hors-ballon collaient leur homme tant qu'aucun trigger (drive/post-up/paint) n'était actif. Or en basket réel, un défenseur weak-side doit toujours :
- s'enfoncer d'un pas vers la ligne ballon-panier
- rester sous la ligne de la passe (y >= ball.y)
- avoir un pied dans la raquette si son homme est loin du ballon

Implémenté dans `help.ts` : sag baseline proportionnel à `helpPct` quand defender est weak-side.

### Path-aware screen avoidance (FAIT)
Implémenté via `curveAroundObstacle` (Bezier quadratique) appliqué pendant le playback et le scrubbing. Tous les défenseurs sauf le `screenerDef` contournent les poseurs d'écran (porteur + non-porteur). Le côté de contournement est choisi automatiquement (opposé à l'obstacle par rapport au segment direct).

Un filet de sécurité `pushOutOfMany` (plusieurs passes) pousse chaque défenseur hors de tous les autres joueurs (sauf son matchedTo) à la fin du calcul de chaque frame, pour éliminer les superpositions résiduelles.

Évolutions possibles :
- Étendre aux attaquants (notamment porteur qui contourne un écran avec son ballon)
- Choisir le côté de contournement selon la règle d'écran active (over/under) plutôt que automatique
- Multi-obstacles : le code actuel ne contourne qu'un seul poseur à la fois (le porteur en priorité). Si plusieurs écrans simultanés, prendre le plus proche du segment.

### Strong-side denial (FAIT v1)
Implémenté dans `help.computeHelpTarget`. Conditions : pas de trigger, strong-side, attaquant à <250px du ballon, `priority !== 'paint'`. Pull vers `denyAim = att + 0.35 * (carrier - att)` avec `denyFactor` jusqu'à 0.45 modulé par la proximité du ballon. Tests dans `help.test.ts § strong-side denial` (6 cas dont régression sag weak-side). Doc : `docs/logique-defensive.md § Strong-side denial automatique`.

À ajouter v2 : ring visuel dédié (différencier denial / help), tunable global ou par règle.

### Closeout dynamique (FAIT v1)
Implémenté dans `engine.effectiveDefensePositions` : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `defenseMaxSpeed × CLOSEOUT_SPEED_FACTOR` (1.4) sur la transition. Flag `closingOut: true` propagé dans `ComputedDefender`. Anneau orange autour du joueur dans `Player`. Tests dans `engine.test.ts § effectiveDefensePositions — closeout dynamique` (5 cas). Doc : `docs/logique-defensive.md`.

À ajouter v2 : modélisation de l'over-closeout (drive subi quand le défenseur arrive trop fort). Nécessite un trigger drive consolidé.

### Stunt and recover
Variante du hedge mais hors-ballon : tape vers le ballon puis recovery. Pas modélisé.

### Trap explicite (corner/sideline)
La règle blitz s'applique sur écrans. Un trap simple sur attrape-corner n'est pas modélisé.

---

## Features produit

### Persistance localStorage (FAIT)
Sauvegarde auto de l'état dans localStorage (debounce 400ms, clé `basket-tactics-state-v1`). Reset complet vide aussi le storage. Import/export inchangés. Merge avec defaults pour compatibilité ascendante.

### Step labels + carrier manuel + fin de playback (FAIT)
- Champ texte sur l'étape active pour la nommer ("dribble drive", "skip pass" etc.)
- Sélecteur du porteur du ballon par étape (sans avoir à dessiner une passe)
- Annotations affichées en cohérence avec l'étape en cours d'animation pendant le playback (avant : seulement celles de l'étape active)
- Fin de playback s'arrête sur la dernière étape (avant : retour à activeStep)

### Templates tactiques (FAIT — 3 templates v1)
Implémenté dans `lib/data/templates.ts` avec PNR central, Horns flare, Pindown coin. Section dépliable dans le panneau gauche, charger remplace les étapes en cours (avec confirmation si du travail est présent).

À ajouter plus tard : PNR aile, PNR step-up, Princeton chin, UCLA cut, Iverson cut, Floppy, Hammer action, Spain PNR. Format Template stable, ajouter une entrée dans le tableau `TEMPLATES` suffit.

### Métriques défensives (FAIT)
Calculées dans `lib/logic/metrics.ts` (fonction pure) et affichées dans `MetricsBar` sous la timeline. Métriques :
- **raquette** : nombre de défenseurs à moins de 100px du panier (proxy "raquette protégée")
- **gap max** : pour chaque attaquant, distance au défenseur le plus proche → on retient le MAX (= attaquant le plus libre). Tooltip indique qui c'est.
- **écart moy** : distance moyenne défenseur ↔ son matché
- **en retard** : count de `late: true`
- **aide** : somme des `helpFactor`
- **passes** : ratio passes ouvertes / total depuis le porteur (tooltip détaille ouvertes / contestées / bloquées)

Code couleur des pills : vert (good), orange (warn), rouge (bad), gris (neutral) selon des seuils définis par métrique. Les seuils sont à affiner avec l'usage.

À ajouter plus tard : graphique des métriques au fil des étapes (ligne d'évolution), comparaison entre deux configs défensives sur le même template, métriques "offensives" (espaces créés, options ouvertes).

### Comparaison côte à côte
Charger deux solutions tactiques du même set offensif et les jouer en parallèle pour comparer la couverture.

### Annotations richer
- Texte libre placé sur le terrain
- Numérotation des actions (1. dribble, 2. écran, 3. coupe...)
- Couleurs personnalisables par annotation

### Undo / Redo
Stack d'états avec Ctrl+Z / Ctrl+Y. ~50 derniers états.

### Mode présentation
Cacher la sidebar, plein écran SVG, gros boutons play/pause/step.

### Export vidéo / GIF
Capturer la lecture complète en vidéo téléchargeable (canvas → mediarecorder ou côté serveur).

### Export playbook PDF / image (FAIT v1)
Implémenté avec `PlaybookView` (overlay) + `StepThumbnail` (rendu statique réutilisable). Bouton "playbook (PDF)" en bas du panneau ouvre la vue, l'utilisateur ajuste titre / colonnes / défense / légende, puis clique "imprimer / PDF" — le navigateur fait son print dialog avec "Save as PDF". CSS `@media print` masque tout sauf le contenu playbook, gère pageBreakInside.

Améliorations possibles :
- Page de garde dédiée
- Numérotation auto des étapes sur le terrain (cercles 1, 2, 3 sur les positions)
- Diff visuel entre étapes consécutives (ghost de la position précédente)
- Vrai PDF côté client (jsPDF) pour piloter pagination plus finement

---

## Tech / qualité

### Tests unitaires
Logique pure très testable :
- `engine.computeDefenseTargets` : inputs canoniques → outputs attendus
- `screens.detectScreen` / `detectOffBallScreens` : matrice de cas
- `zoneDefense.pointInPolygon` : edge cases
- `geometry` : trivial mais utile

Vitest, ~30 tests pour couvrir les chemins critiques.

### Git init + premier commit
Pas encore de repo. À faire avant tout refactor risqué.

### Refactor : extraire l'animation
La boucle RAF dans CourtView est bien isolée mais elle pourrait devenir un hook `usePlayback(state)` réutilisable.

### Documentation
Le README mentionne le projet mais pas les nouveaux paliers (zone, écrans non-porteur, sag baseline). À mettre à jour après stabilisation.

### Performance
Pas de souci visible aujourd'hui (5 vs 5, frames 60Hz fluides) mais `effectiveDefensePositions` recompute toute la chaîne récursivement à chaque step. Memo possible.

---

## UI / UX

### Refonte UI complète (FAIT)
- Layout 3 colonnes responsive : **OffensePanel** (orange) à gauche, **court + Timeline** au centre, **DefensePanel** (bleu) à droite
- Header global avec actions playbook / export / import / reset
- Composants partagés `Panel`, `Section`, `Slider`, `CheckboxLine`, `Button` dans `ui.tsx`
- Couleurs cohérentes avec les joueurs (orange = attaque, bleu = défense)
- Media queries : 3 colonnes desktop, 2 colonnes-1 mobile
- Suppression de `ControlPanel.tsx` obsolète

### Timeline scrubbing (FAIT)
Barre de progression horizontale sous le terrain :
- Marqueurs cliquables pour chaque étape
- Drag du playhead = scrubbing fluide (interpolation entre étapes)
- Relâcher = snap à l'étape entière la plus proche
- Affiche n° d'étape, label, porteur courant
- Couleur orange en édition, bleue en lecture

### Réorganisation du menu défense (FAIT — séparation panneau)
Maintenant dans son propre panneau bleu à droite (DefensePanel), distinct du panneau attaque. Sections : Système, Configuration zone (si zone), Paramètres globaux + triggers, Écran porteur, Écran non-porteur, Règles individuelles, Visualisation.

### Symbolique défenseur "à la FIBA" (bras défensifs) (FAIT)
Deux arcs SVG (Bezier quadratique) au-dessus du cercle des défenseurs simulant les bras en posture défensive. Lisibilité immédiate.

Évolution future possible : pivoter les bras vers le porteur du ballon pour donner un effet "ils suivent le ballon".

### Terrain complet (FAIT)
Toggle `fullCourt` dans le panneau visu. Quand activé :
- viewBox étendu à 1080 de hauteur (au lieu de 560)
- moitié basse mirroitée via `transform="translate(0 1080) scale(1 -1)"`
- second panier symétrique au panier principal
- ligne médiane explicite + cercle central plein (au lieu du demi-cercle pointillé)
- clamps des positions joueurs étendus à `FULL_COURT_INNER_MAX_Y = 1060`

Reste à faire pour vraiment l'exploiter :
- Permettre à la défense d'avoir son propre panier (transition / fast break / contre-attaque). Actuellement `HOOP` est figé à (300, 75) et tout le calcul défensif se fait par rapport à ce panier unique.
- Repositionner les défenseurs selon le sens du jeu (défense bas, défense haut).
- Bouton "rotation 180°" pour basculer le sens d'attaque sans tout repositionner manuellement.

### Sliders avec input numérique
Actuellement uniquement curseurs pour distance/vit max/etc. Ajouter un input numérique en regard pour saisir la valeur précise.

### Tooltips sur les règles
"raquette" / "passlane" / "homme" : afficher au hover ce que ça veut dire concrètement.

### Drag avec snap optionnel
Ctrl+drag pour snap à la grille (positions homepos des zones, ligne 3pt, blocs bas).

### Mobile / tactile
PointerEvents fonctionnent mais la sidebar cache la moitié de l'écran sur petit écran. Layout responsive à revoir.

### Raccourcis clavier
- Espace : play/pause
- Flèches : changer d'étape
- M / P / D / R / E : changer d'outil
- Suppr : supprimer l'annotation sélectionnée

### Sélection d'annotation
Cliquer sur une flèche existante pour la sélectionner et la modifier/supprimer.

---

## Idées plus loin

### Modélisation des défenseurs comme agents
Au lieu d'une fonction pure qui calcule la position cible, chaque défenseur a un "état" (alerte, en récup, en aide) et des transitions. Plus réaliste mais nettement plus complexe.

### Mode coach (annotations vocales)
Enregistrer un commentaire audio synchronisé avec la lecture. Pour expliquer une tactique en différé.

### Multi-utilisateur / collaboration
Partage d'une simulation par URL, édition collaborative live. Backend nécessaire.

### IA suggérant la défense optimale
À partir d'un set offensif, proposer la meilleure réponse défensive (entraîner sur des datasets de matchs réels). Hors scope solo.
