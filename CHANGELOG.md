# Changelog

Toutes les évolutions notables du moteur de jeu et de l'UI.

Format inspiré de [keep-a-changelog](https://keepachangelog.com). Le projet n'est pas versionné via tags git ; les "versions" ci-dessous sont des regroupements thématiques pour faciliter le suivi.

## [Unreleased]

### CVT Chantier 1.3c — Écrans off-ball couverts + invariant Règle 1bis validé

Extension de `defense/screenRepelLayer.ts` aux écrans **hors-ballon**
(pin-down, flare, stagger, etc.) détectés via `detectOffBallScreens`.
La couche 2.1 du pipeline parcourt désormais tous les poseurs (porteur
+ off-ball), additionne les forces `repel` et applique un shift
cumulé borné à `SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3 px`.

**Décision architecturale documentée** : remplacer
`pushOutOfScreener` / `pushOutOfCarrier` par un système `repel` pur
est **INCOMPATIBLE** avec la Règle 1bis du moteur d'écran
([docs/SCREEN-ENGINE.md](docs/SCREEN-ENGINE.md)) qui exige `dist(D1,
screener) ≤ MIN_PLAYER_CLEARANCE_PX + 1` à quality 100. Un repel
linéaire produit toujours `dist > clearance`, ce qui violerait
l'invariant "D1 stuck au poseur à quality 100". Le push-out binaire
reste donc en place ; CVT 1.3 livre uniquement le raffinement
périphérique soft.

- `defense/screenRepelLayer.ts` : helper `collectScreenerObstacles`
  qui agrège poseurs porteur + off-ball avec leur set `engaged`
  (carrierDef/screenerDef pour porteur, screenerDef/cutterDef +
  secondScreenerDef pour off-ball). Le défenseur skip un poseur où
  il est engagé.
- Forces cumulées (somme additive) puis shift clampé au cap global.
- **2 nouveaux tests** : Règle 1bis préservée (q=100 → D1 ≤
  clearance+2 même flag on), écart cumulatif off-ball ≤ 12 px.
- `docs/SCREEN-ENGINE.md` : section "Limites acceptées" documente
  l'incompatibilité repel-pur ↔ Règle 1bis.
- 1653 → **1655 tests verts**.

### CVT Chantier 1.3b — Couche screen repel (raffinement trajectoires périphériques)

Nouvelle couche
[`defense/screenRepelLayer.ts`](src/lib/logic/defense/screenRepelLayer.ts)
branchée après `applyPnRRotationsLayer` (couche 2.1). **Conservatrice
par design** — ne remplace PAS le push-out binaire existant, vient
l'affiner pour les défenseurs périphériques.

Pour chaque défenseur **non impliqué directement** dans l'action écran
(non `carrierDef`, non `screenerDef`, non `pnrRole`), proche d'un
poseur d'écran détecté, applique un shift `repel` fluide (rampe
linéaire dans `SCREEN_REPEL_RADIUS_PX = 46 px`). Cap dur
`SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3 px` — encore plus serré que
l'interpose layer pour limiter le risque sur les tests
`screens*` / `overlap*`.

- Filtres conservateurs : `dId === screen.carrierDef` /
  `screen.screenerDef` / `pos.pnrRole` → skip.
- No-op quand aucun écran détecté (`ctx.screen === null`).
- Opt-in via `state.useSteeringEngine`.
- 3 tests dédiés : cap exporté, flag off legacy strict, no-op sans
  écran.
- 1650 → **1653 tests verts**.

**Limitation documentée** : la couche affine la trajectoire des
défenseurs périphériques mais ne remplace PAS le push-out binaire
de `screens/helpers.ts` (`pushOutOfScreener`/`pushOutOfCarrier`).
Le remplacement complet (vraie "glisse fluide" autour du clearance
au lieu du snap) demanderait de refactorer `applyScreenAdjustment`
en profondeur et de revalider toute la suite `screens*` —
sous-étape future (1.3c).

### CVT Chantier 2b — Couche d'influence : interpose vers les lignes de passe

Nouvelle couche
[`defense/influenceLayer.ts`](src/lib/logic/defense/influenceLayer.ts)
branchée après `baseTargets` (couche 1.3 du pipeline). Pour chaque
défenseur "libre" (non carrier, non denying, non onScreen, non
pnrRole, helpFactor < 0.5), applique un shift soft vers la projection
sur la ligne `porteur ↔ son homme`. Effet basket : les défenseurs
occupent activement les lignes de passe au lieu de simplement marquer.

- `INTERPOSE_MAX_SHIFT_PX = 5` — cap dur du shift. Reste sous le bruit
  visuel mais oriente le placement.
- Filtres conservateurs : carrier defender / denying / onScreen /
  pnrRole / helpFactor ≥ 0.5 → pas de shift (priorité aux couches
  spécialisées en aval).
- Opt-in via `state.useSteeringEngine` (zéro impact flag off).
- Tolérance des tests d'équivalence intégrés : 5 → **12 px**.
  Documentée comme borne cumulative (3 px dampening 1.1b + 5 px
  interpose 2b + arrondis pipeline). Bit-équivalence stricte (1e-9)
  toujours valide au niveau unitaire (`manDefense.test.ts`).
- 4 tests dédiés dans
  [`defense/__tests__/influenceLayer.test.ts`](src/lib/logic/defense/__tests__/influenceLayer.test.ts) :
  flag off legacy strict, shift borné, constante exportée, filtre
  carrier defender.
- 1646 → **1650 tests verts**.

### CVT Chantier 3b + 3c — Triangle défensif câblé (pass shadow + pondération profil)

Premier câblage du Chantier 3. Opt-in via `state.useSteeringEngine`.

**3b — isPassShadowed**
- `DefenderTarget` + `ComputedDefender` gagnent `isPassShadowed?: boolean`.
- `defense/baseTargets.ts` : appelle `passShadowsByDefender` en fin
  de couche (quand flag on + porteur défini). Plumbed à travers les
  3 sites de mapping de `defense/speedConstraint.ts`.
- Métadonnée tactique consommable par futures couches de help et UI
  (badge "shadowing" optionnel). Zéro effet sur les positions
  défensives — purement additif.

**3c — pondération distance par profil offensif**
- `defense/baseTargets.ts` : `dist = (rule.distance ?? state.defenseDistance) / profileWeightMultipliers(profile).manWeight`.
  Effet :
  - `shooter` / `stretch-big` (manWeight > 1) → distance plus petite,
    close out plus serré, deny renforcé.
  - `slasher` / `rim-roller` / `non-shooter` (manWeight < 1) → distance
    plus grande, sag franc pour anticiper drive / float.
  - `creator` / undefined (manWeight ≈ 1) → comportement legacy.
- Bit-équivalence préservée quand profil undefined ou flag off.
- 4 nouveaux tests : isPassShadowed propagé / undefined sans flag,
  effet 3c shooter vs non-shooter vs neutre, légère insensitivité
  flag off.
- 1642 → **1646 tests verts**.

### CVT Chantier 3 — Triangle défensif vectoriel (infra, non câblée)

Nouveau module
[`src/lib/logic/defenseTriangle.ts`](src/lib/logic/defenseTriangle.ts).
Formalisation math du repère **Ballon – Défenseur – Attaquant – Panier**.
**Non câblée** au pipeline — sous-étape 3b séparée.

- `triangleAngleDeg(ball, defender, attacker)` → angle θ au sommet
  défenseur (0..180°). 90° = posture *open stance* idéale (vision
  triangulaire). Cas dégénérés (def === ball ou def === att) → 0.
  Clamp anti-NaN sur `acos(cos)`.
- `profileWeightMultipliers(profile)` → `{ manWeight, basketWeight }`
  pour pondération du Chantier 3. Calibration basket :
  - `shooter` / `stretch-big` : `manWeight > 1`, `basketWeight < 1`
    (deny dominant).
  - `slasher` / `rim-roller` : `basketWeight > 1`, `manWeight < 1`
    (sag dominant).
  - `creator` : équilibré (~1, ~1).
  - `non-shooter` : laisser flotter, `basketWeight > 1`.
- `isPassShadowed(defenderPos, carrierPos, attackerPos, tolerance?)` :
  vrai si défenseur occulte la ligne de passe (proj dans le segment
  ET `|perpDist| < tolerance`). Tolérance par défaut =
  `PASS_SHADOW_TOLERANCE_PX = 16 px` ≈ rayon visuel défenseur.
- `passShadowsByDefender(defenders, carrierId, carrierPos, off)` →
  map `{ DefenderId → boolean }`. Destiné à alimenter
  `ComputedDefender.isPassShadowed` quand câblé.
- Nouvelle constante `PASS_SHADOW_TOLERANCE_PX` dans
  [`data/physics.ts`](src/lib/data/physics.ts).
- **21 nouveaux tests** : angle triangle (alignement / perpendiculaire
  / oblique / dégénéré / borné), multiplicateurs profils (calibration
  shooter / slasher / undefined / signe cohérent), pass shadow
  (sur ligne / tolérance / hors segment / dégénéré / custom tolerance),
  batch defenders (5 défenseurs × 4 lignes + edge cases).
- 1621 → **1642 tests verts**. Zéro impact runtime.

### CVT Chantier 2 — Influence Map & lignes invisibles (infra, non câblée)

Nouveau module
[`src/lib/logic/influenceMap.ts`](src/lib/logic/influenceMap.ts).
Pose les primitives géométriques pour le contrôle défensif des lignes
de passe et couloirs de pénétration. **Non câblée** au pipeline
défensif — utilisable mais inutilisée. Le câblage (probablement
nouvelle couche `influenceLayer` entre `baseTargets` et
`pnrRotations`) sera la sous-étape 2b.

- `InfluenceLane` : segment porteur ↔ cible avec `kind: 'pass' | 'drive'`.
- `buildPassingLanes(carrierId, carrierPos, off)` : génère un segment
  par non-porteur présent.
- `buildDrivingLane(carrierPos, hoop?)` : segment porteur ↔ panier.
- `signedPerpDistance(p, a, b)` : distance perpendiculaire **signée**
  d'un point à la droite passant par `a` et `b`. Positif à gauche
  du vecteur `a→b` (convention produit vectoriel 2D).
- `projectOnSegment(p, a, b)` : projection orthogonale clampée aux
  extrémités.
- `interposeForce(defenderRef, a, b, weight, label)` : force `seek`
  vers la projection orthogonale — pousse le défenseur sur la ligne
  tactique. Variante de `seek` avec cible dynamique.
- `interposeForcesAgainstLanes(defenderRef, lanes, weight)` : batch
  avec labels détaillés (`interpose-pass-O3`, etc.).
- **20 nouveaux tests** : génération de lanes, exclusion du porteur,
  filtrage attaquants absents, signe perpendiculaire (gauche/droite/
  on-line/dégénéré), projection clampée (intérieur/avant/après/
  dégénérée), interpose direction/poids/composeTarget.
- 1601 → **1621 tests verts**. Zéro impact runtime.

### CVT Chantier 1.3 — Infra `repel` autour des poseurs d'écran (non câblée)

Nouveau module
[`src/lib/logic/screens/repelForces.ts`](src/lib/logic/screens/repelForces.ts)
posant l'infrastructure pour la répulsion fluide autour des poseurs.
**Statut : non câblée** — aucun consommateur dans `defense/*` ni
dans `applyScreenAdjustment`. Le câblage attend une sous-étape 1.3b
dédiée pour valider l'interaction avec les tests `screens*` /
`overlap*` sans surprise.

- `screenerRepelForce(defenderRef, screenerPos, weight?, label?, radius?)`
  → émet une force `repel` à falloff linéaire dans
  `SCREEN_REPEL_RADIUS_PX = MIN_PLAYER_CLEARANCE_PX + 12 = 46 px`.
  Hors rayon = force morte (glissement fluide, jamais de mur).
- `screenersRepelForces(defenderRef, screeners[], weight?)` → batch
  indexé pour stagger/elevator/double screen.
- 2 nouvelles constantes dans
  [`data/physics.ts`](src/lib/data/physics.ts) :
  `STEERING_SCREEN_REPEL_BUFFER_PX = 12`,
  `STEERING_SCREEN_REPEL_WEIGHT = 20`.
- **9 nouveaux tests** :
  constante calculée, direction radiale, falloff linéaire,
  force morte hors rayon, cas dégénéré (overlap → solveur dur),
  label custom, batch indexé, filtrage forces mortes, liste vide.
- 1592 → **1601 tests verts**.

### CVT Chantier 1.2 — `help.ts` câblé en double-sortie sous `useSteeringEngine`

Migration de la couche d'aide. `computeHelpForces` ajouté à
[`help.ts`](src/lib/logic/help.ts) : wrappe `computeHelpTarget` et
émet un `arrive` vers la cible d'aide legacy (sag-weakside,
denial-strongside, active-help). Bit-équivalent en zone loin, amorti
en zone proche (anti-oscillation autour de l'aide ou du denial).

- `HelpForcesResult` étend `HelpResult` avec `forces: SteeringForce[]`.
  Toute la métadonnée legacy (helpFactor, denying, triggered, aim,
  priority, kind) est préservée — seule la position est routée
  par les forces.
- `defense/baseTargets.ts` : branche `useSteeringEngine` ajoutée au
  bloc help (stance === 'sag' && att && carrierPos). Quand off,
  appel direct à `computeHelpTarget` (inchangé).
- **4 nouveaux tests** dans `help.test.ts` : bit-équivalence loin,
  préservation métadonnée, helpMode disabled, amortissement zone
  proche (3 px à 6 px de la cible).
- 1588 → **1592 tests verts**. Pipeline legacy strictement inchangé.

### CVT Chantier 1.1b — Amortissement `arrive` près de la cible (anti-oscillation)

Premier vrai gain comportemental du moteur de forces. Les variantes
de `manDefense.ts` utilisent désormais la primitive `arrive` (rampe
linéaire dans `STEERING_MAN_SLOWING_RADIUS_PX = 12 px`) au lieu d'un
`seek` brut. Effet : quand le défenseur est "essentiellement arrivé"
sur sa cible (à ≤ 12 px), le target composé est légèrement dampé,
ce qui annule les micro-oscillations entre frames sans dégrader le
suivi en zone "loin".

- Nouvelle constante [`STEERING_MAN_SLOWING_RADIUS_PX = 12`](src/lib/data/physics.ts)
  (≈ 10 % de `DEFAULT_DEFENSE_MAX_SPEED_PX=110`, soit la zone "déjà
  arrivé en pratique").
- `manTargetForces` / `carrierDefenderTargetForces` /
  `offBallStanceTargetForces` : remplacent `seek(dist)` par
  `arrive(slowingRadius, dist)`. En zone loin (`dist ≥ slowingRadius`),
  magnitude = dist → `composeTarget` reproduit la cible legacy
  bit-pour-bit. En zone proche, magnitude = `dist²/radius` →
  target amorti.
- `defense/baseTargets.ts` : `defenderRef` passe de
  `state.defenseInitial[dId]` à
  `ctx.prevDefenderPositions[dId] ?? state.defenseInitial[dId]`.
  Indispensable pour que l'amortissement fire réellement par rapport
  à la position courante du défenseur (et pas un layout statique).
- **4 nouveaux tests** dédiés au comportement amorti dans
  `manDefense.test.ts` : zone loin (bit-équivalent), zone proche
  (amorti strict), frontière (rampe = 1, bit-équivalent), écart max
  théorique (`SLOWING/4 = 3 px` à `dist = SLOWING/2`).
- Tests d'intégration `cvtSteeringEquivalence.test.ts` : tolérance
  passe de `1e-6` (bit-stricte) à `STEERING_TOLERANCE_PX = 5` —
  documenté comme borne supérieure du gain anti-oscillation, pas
  une régression. Toujours 4 scénarios verts (chase, stances variées,
  vsCarrier varié, att absent).
- 1584 → **1588 tests verts**. Pipeline legacy (flag off) inchangé,
  les 1543 tests préexistants restent verts.

### CVT Chantier 1.1 — `manDefense` câblé en double-sortie sous flag `useSteeringEngine`

Première migration consommatrice du moteur de forces. `manDefense.ts`
expose désormais 3 variantes forces (`manTargetForces`,
`carrierDefenderTargetForces`, `offBallStanceTargetForces`)
bit-équivalentes aux fonctions `Point` legacy. `baseTargets.ts` branche
sur `state.useSteeringEngine` (default false). **Aucune modification
de comportement à ce stade** — le flag prépare 1.1b (ajout
d'`arrive` + retuning), 1.3 (`repel` autour des écrans) et chantiers 2/3.

- Nouvelles fonctions dans [`manDefense.ts`](src/lib/logic/manDefense.ts) :
  émettent un unique `seek` de poids `= distance(defenderRef, targetLegacy)`
  → `composeTarget` reproduit exactement le `Point` legacy quel que
  soit `defenderRef` (preuve numérique dans les tests).
- Nouveau helper [`composeTarget(from, forces) → Point`](src/lib/logic/steeringEngine.ts)
  pour ponter forces ↔ API legacy pendant la transition.
- Flag `state.useSteeringEngine?: boolean` ajouté à `AppState`
  (opt-in, default false). Documenté inline.
- Branche dans [`defense/baseTargets.ts`](src/lib/logic/defense/baseTargets.ts) :
  3 chemins (carrier, off-ball stance non-sag, sag) basculent vers
  les variantes forces quand le flag est on. `defenderRef =
  state.defenseInitial[dId]` — choix neutre (stable, déterministe).
- **15 nouveaux tests** :
  - 4 tests `composeTarget` (vide, bit-équivalence seek, additivité,
    forces opposées).
  - 5 tests unitaires d'équivalence bit-strict (1e-9) sur grille
    croisée *attaquant × defenderRef × distance × hoop × stance*.
  - 4 tests d'intégration pipeline complet via `effectiveDefensePositions`
    avec flag off/on (1e-6 tolérance pour absorber arrondis cumulés).
- 1569 → **1584 tests verts**. Zéro régression sur les tests legacy
  (flag off = comportement bit-identique).

### CVT Chantier 1 — `steeringEngine.ts` (infra pure, non câblée)

Première brique de la **Refonte cinématique vectorielle tactique** (cf.
ROADMAP § "Hors roadmap court terme"). Pose les fondations du paradigme
émergeant "forces vectorielles pondérées" qui remplacera à terme
l'approche par "cibles absolues" (Target-Seeking).

- Nouveau module [`src/lib/logic/steeringEngine.ts`](src/lib/logic/steeringEngine.ts) :
  type `SteeringForce` + 3 primitives `seek` / `repel` / `arrive` +
  accumulateur additif Reynolds `Σ(W_i · F_i)` + `integrateForce` (clamp
  magnitude → anti-téléportation).
- Math pur déterministe, aucune mutation, aucun état caché. Réutilise
  `distance` / `normalize` / `clamp` de `geometry.ts`.
- `repel` à falloff linéaire (pas de `1/d²`) + force morte hors rayon →
  glissement fluide, jamais de mur. Cas dégénéré `from === obstacle`
  retourne force morte (le solveur `constraintSolver.ts` reste filet
  de sécurité dur pour la Règle 1).
- `arrive` avec rampe `min(1, dist/slowingRadius)` → tue les
  oscillations autour des cibles.
- **24 nouveaux tests** dans `steeringEngine.test.ts` : primitives,
  composition additive, commutativité, cas dégénérés, clamp
  d'intégration, composition réaliste seek+repel.
- **Zéro consommateur** à cette étape : `defense/*`, `engine.ts` et
  `constraintSolver.ts` non modifiés. Zéro impact runtime, zéro
  risque de régression. Suite complète : **1545 → 1569 tests verts**.
- Sous-étapes suivantes du Chantier 1 (à venir) : migration progressive
  `manDefense` → `helpLayer` → `pnrRotations` en double-sortie sous
  flag `useSteeringEngine`, en préservant `ComputedDefense` /
  `ComputedDefender` et le passage par `constraintSolver.ts`.

## [0.18.0] — 2026-05-18 (Phase K — Behavior Anomaly Detection V1 + V2)

Nouveau pilier "observabilité du comportement joueur". 7 sous-chantiers
(K.0 → K.7), 7 commits, **56 nouveaux tests**, 1450 → **1506 verts**.
Zéro modification du moteur (resolver, screens, defense/*) — toutes les
helpers sont purs et opt-in. **Zéro risque Règle 1bis** : 155 tests
screen-sensibles toujours verts.

### K.0 — Infra

- `src/lib/logic/anomaly/types.ts` : `AnomalyKind`, `AnomalyReport`,
  `AnomalySeverity`, `PlayerId`.
- `src/lib/logic/anomaly/anomalyDetector.ts` : module pur centralisé.

### K.1 V1 — Détection téléportation (8 tests)

`detectTeleport(prev, cur, threshold?, criticalThreshold?)` flag toute
position prev→cur dont la distance dépasse `TELEPORT_THRESHOLD_PX=24`
(> clamp visuel 18 px/frame). `TELEPORT_CRITICAL_PX=60` → severity
critical. Couvre attaquants + défenseurs.

### K.2 V1 — Détection vitesse aberrante (6 tests)

`detectAberrantSpeed(prev, cur, globalMaxSpeed, rules, tolerance?, criticalMult?)`
flag tout défenseur dépassant `rule.maxSpeed × (1 + 0.95)`. La tolérance
0.95 couvre `sprintBoost × 1.8` + bruit. Severity critical au-delà du
ratio ×3.

### K.3 V1 — Détection défenseur décroché (7 tests)

`detectDetachedDefenders(off, defPos, stepIdx, threshold?, criticalThreshold?)`
flag un défenseur > 250 px de son `matchedTo` (`DETACHED_DEFENDER_PX`).
Exclusions automatiques : `helpFactor ≥ 0.1` (aide légitime),
`screenPhase ∈ {approach...released}` (contact écran). Critical à 450 px.

### K.4 V1 — Détection flicker / oscillation (8 tests)

`detectFlicker(prevPrev, prev, cur, minVelocity?, cosThreshold?)`
flag les virages > 135° entre 2 transitions consécutives quand les
deux magnitudes sont ≥ 5 px (filtre bruit statique).
`FLICKER_COS_THRESHOLD = -0.707` (cos(135°)). Cos ≤ -0.95 = critical
(180° flip parfait).

### K.5 V1 — Détection regard anormal (10 tests)

`detectAnomalousGaze(players, stepIdx, maxDeltaDeg?)` filet de sécurité
CLAUDE.md Règle 3 (regard ±90° du corps inviolable). Helper exporté
`circularDeltaDeg(a, b)` pour les deltas signés sur 360°. Critical au-delà
de 135°.

### K.6 — Intégration coach + UI toggle (6 tests)

- `src/lib/logic/coachDiagnostics/rules/playerAnomaly.ts` : branche K.1
  + K.2 + K.3 sur le pipeline coach. K.4/K.5 restent en helpers non
  branchés (incompatibles avec l'API step-by-step).
- `AppState.anomalyDetectionEnabled?: boolean` opt-in strict (default off).
- ParametresPanel : ToggleCard "anomalies (K)" rouge.
- REGISTRY étendu (`playerAnomaly` en fin de chaîne).
- Diags tagués `anomaly-teleport` / `anomaly-aberrant-speed` /
  `anomaly-detached`. Severity warning/critical conservée.

### K.7 V2 — Correction opt-in (11 tests)

- `clampTeleports(prev, cur, maxStep?)` retourne un nouveau snapshot
  avec positions ramenées à `prev + dir × maxStep`. Immutable.
- `clampAberrantSpeed(prev, cur, globalMaxSpeed, rules, tolerance?)`
  clampe les défenseurs trop rapides à `maxSpeed × (1 + tolerance)`.
- **Volontairement non wiré dans le frameResolver** (Règle 1bis).
  Disponibles comme API pure pour callers externes (tests, scripts
  post-hoc, futur UI debug).

### Reportés

K.4 / K.5 brancher sur coachDiagnostics (nécessite 3-frame window et
snapshot des visuels orientés). Auto-correction K.7 wirée dans le
pipeline live (à n'envisager que si une régression visible justifie
le risque Règle 1bis).

## [0.17.0] — 2026-05-18 (F.2 V2 — full-court 1-2-1-1 + trap dynamique)

Extension naturelle de F.2 V1. 1 commit, 6 nouveaux tests, 1444 → 1450
verts. Coût ~30 min grâce à V1 solide.

- Types : `PressType` étendu à `'half-court' | '2-2-1' | 'full-court' |
  '1-2-1-1'`. `PressConfig.trapOnHalfCourtCross?: boolean` (default
  true sur full-court).
- `pressLayer.ts` :
  - `PRESS_1_2_1_1_OFFSETS` : 1 chaser (sous panier offense), 2 wings
    backcourt, 1 mid (ligne médiane), 1 sweeper (sous notre panier).
  - `offsetsForType(type)` dispatch selon V1/V2.
  - **Trap dynamique** : si `trapOnHalfCourtCross` actif ET porteur
    franchit la médiane (`carrier.y < 540` côté offense), les 2
    défenseurs les plus proches du porteur sont tirés de +35 px vers
    lui (TRAP_PULL_PX). Clearance min préservée via clamp.
  - Helper `hasCrossedHalfCourt(carrierPos, hoop)` adapté selon
    attackingDirection.
- UI : bouton "Full-court" activé dans SystemSelector. Sub-config
  DefensePanel différencie V1 (half-court 2-2-1) et V2 (full-court
  1-2-1-1 avec trap) avec descriptions adaptées.

### Tests V2 (6 nouveaux)

- Chaser le plus éloigné du panier défense.
- Positions full-court distinctes de half-court (delta > 200 px).
- Trap modifie ≥2 défenseurs quand porteur côté offense.
- Pas de trap si porteur côté défense.
- INVARIANT clearance avec trap actif (≥ PLAYER_MIN_CLEARANCE_PX).
- Override `trapOnHalfCourtCross: true` fonctionne aussi sur half-court.

### Reportés V2.5

Retreat progressive si press cassée (60% du chemin médiane → panier
déclenche retour homme-à-homme). Pas critique en V2.

### Checklist Règle 1bis

155 tests `screens*`/`overlap*`/`userJson*`/`screenLab*` tous verts.
Aucune modification de `frameResolver`, `screens/`, `defense/*` autre
que pressLayer.

## [0.16.0] — 2026-05-18 (A11 V3 outlet + F.2 V1 half-court press)

Session **bonus** complétant le moteur tactique. 2 commits, 1435 → 1444
verts (+9 nouveaux tests).

### A11 V3 — addOutletPassStep (commit `82add8e`, +4 tests)

Setter combiné qui unifie A11 V2 ext3 (`outletPassPending`) et E.1
stage 2b (`convertStepToAwayPossession`) en un seul appel :

1. Vérifie `outletPassPending: true` (sinon no-op idempotent).
2. Clear le flag sur sourceStep.
3. Insère un step adverse via `convertStepToAwayPossession`.

UX : 1 clic au lieu de 2 pour le flux "rebond défensif → transition
adverse". Bouton renommé "🔄 outlet → transition adverse (A11 V3)"
dans StepsPanel.

### F.2 V1 — Half-court press 2-2-1 (commit `ed76448`, +9 tests)

**Approche pragmatique différente du ROADMAP** : au lieu de refonte
risquée de `getDefenseHoop`, court-circuit du pipeline (pattern F.1
junk). Zéro risque Règle 1bis.

- `DefenseSystem` étendu à `'man' | 'zone' | 'junk' | 'press'`.
- `PressType = 'half-court' | '2-2-1'`.
- `AppState.pressConfig?: { type: PressType }`.
- `defense/pressLayer.ts::computePressDefenseTargets` court-circuit
  comme zone/junk.
- Formation 2-2-1 :
  - Front line (D2/D3 typique) : ligne médiane.
  - Mid line (D1/D4) : zone de relais.
  - Sweeper (D5) : centre, proche panier défense.
- helpFactor=0 partout, matchups préservés.
- UI : bouton "Half-court" activé dans SystemSelector (était 🚧 F.2)
  + sub-config rouge dans DefensePanel avec description et note V1
  statique.

**Checklist Règle 1bis** : 155 tests `screens*` + `overlap*` +
`userJson*` + `screenLab*` tous verts.

**V2 reportée (par choix)** : full-court press, trap dynamique au
franchissement médiane, retreat progressive.

### Phase F désormais 6/6 (avec F.2 V1 livré)

| Item | Statut |
|---|---|
| F.1 V1 + V2 | 🟢 Junk defenses (Box/Triangle/Diamond) |
| **F.2 V1** | 🟢 **Half-court press 2-2-1** (nouveau) |
| F.3 | 🟢 FT rebound positioning |
| F.4 V1 | 🟢 Foul to give |
| F.5 V1 | 🟢 Late shot clock defense |

## [0.15.0] — 2026-05-18 (E.1 stage 2b V1 — phase adverse édition)

3 phases, 4 commits, 1416 → 1431 tests verts. Coût ~1h grâce au pattern
A11 réutilisé (Step.* champs optionnels + setter + UI conditionnelle).

### Approche choisie : Option A (V1 ultra-mini)

3 options architecturales documentées dans
[docs/e1-stage2b-plan.md](docs/e1-stage2b-plan.md). Choix : **Option A**
— flag d'affichage + setter mirror vertical. Le moteur défensif tourne
**tel quel** (sémantique O/D inchangée). Zéro risque Règle 1bis.

### Phase 1 — Types + setter (commit `efc6166`, 12 tests)

- Type `Step.viewSide?: 'home' | 'away'` (default 'home', rétrocompat 100%).
- Module pur `awayPossessionSetup.ts` :
  `buildAwayPossessionSetup(state, sourceStepIdx)` produit un setup
  mirror vertical autour de `HALF_COURT_Y = 540`. Mapping nominal
  D1↔O1, D2↔O2 ... D5↔O5 préservé (= D source devient O destination
  et inversement, avec y inversé).
- Transform `convertStepToAwayPossession(s, options?)` :
  - `mode 'insert'` (default) : ajoute step après sourceStepIdx.
  - `mode 'replace'` : remplace le step actif.
  - Pose viewSide='away' + label + defenseOverrides figés.
- Hook `useAppState.convertStepToAwayPossession` exposé.

### Phase 2 — UI (commit `d184c66`)

- **StepsPanel** : 2 boutons sur step actif :
  - "🔄 étape transition adverse (E.1 stage 2b)" : guidé, visible
    UNIQUEMENT quand `outletPassPending: true` (= rebond défensif récent
    A11 V2 ext3). Flux naturel post-rebond → transition.
  - "↩ convertir en phase adverse" / "↩ revenir en mode home" : libre,
    visible sur tout step. Toggle visuel selon viewSide actuel
    (vert si already away, rouge si home).
- **CourtView** : banner "🔄 PHASE ADVERSE (édition)" en haut du
  terrain quand `state.steps[activeStep].viewSide === 'away'`. Style
  cohérent avec le banner game loop existant (POSSESSION ADVERSE),
  mais suffixe "édition" pour distinguer les 2 sources.
- Page.tsx : prop `onConvertStepToAwayPossession` câblée.

### Phase 3 — Diag coach + docs (ce commit, +3 tests)

- Nouvelle règle `awayPossessionRule` dans `coachDiagnostics/rules/`.
  Émet un diag 'info' tag `away-possession` sur les steps `viewSide='away'`.
  Message clé : "les rôles offensif/défensif sont visuellement inversés.
  Les O représentent l'équipe adverse, les D vos joueurs home désormais
  en défense." Évite la confusion sur les autres diags qui assument
  "O = nos attaquants".
- Registry `coachDiagnostics/index.ts` étendu.

### Architecture finale E.1 (V1 + V2 stage 1 + stage 2a + stage 2b)

```
Game loop (mode live) :
  attackingTeam = 'home' → moteur défensif normal
  attackingTeam = 'away' → awayBallPos + awayPlayerPositions + banner

Mode édition (stage 2b) :
  Step.viewSide = 'home' (default) → comportement legacy
  Step.viewSide = 'away' → banner + diag 'away-possession'
                         + mapping D↔O mirror y=540
                         + le moteur tourne tel quel
                         (O = ce qui attaque ce step)

Flux post-A11 V2 ext3 (rebond défensif) :
  rebond defensif (outletPassPending=true)
        ↓
  Bouton "🔄 étape transition adverse"
        ↓
  Step adverse généré avec mirror vertical
        ↓
  Le coach édite la phase adverse normalement
```

### Reportés (Options B et C documentées)

- **Option B** (1-2j) : team-aware soft avec
  `Step.attackerTeamLabel` pour préserver l'identité joueur à
  travers les transitions home↔away.
- **Option C** (4-6j) : refacto complet ROADMAP avec
  `AppState.currentlyAttackingTeam` natif et matchups inversés en
  mémoire. **Risque Règle 1bis ÉLEVÉ** (touche le moteur d'écran).
  Plan complet dans [docs/e1-stage2b-plan.md](docs/e1-stage2b-plan.md).

## [0.14.0] — 2026-05-18 (A11 V2 — extensions)

Trois extensions naturelles à A11 V1 (livré ce matin). 2 commits, 5
fichiers, 1404 → 1416 tests verts (+12). Estimation initiale ~3-4h →
réel ~1h grâce à l'infra V1 solide.

### A11 V2 ext1 — `shotOutcome: 'blocked'` (commit `dac7fb0`, +5 tests)

3e outcome de tir = contre clean. Différence avec 'missed' : pas de
tirage probabiliste, c'est le défenseur le plus proche du shooter qui
récupère directement (= possession défensive clean).

- Type `Step.shotOutcome` étendu à `'made' | 'missed' | 'blocked'`.
- Helper `blockedReboundResult` déterministe (closestDef au shotPos,
  limite 110 px ~3 m sinon team-out).
- `buildShotReboundSetup` dispatch : blocked → blockedReboundResult,
  missed → computeRebound probabiliste.
- `reboundStepLabel` : "Tir contré par D5" au lieu de "Rebond défensif D5".
- UI : 3e bouton 🛑 contré (violet) dans StepsPanel. Le bouton "étape
  rebond auto" devient "étape post-contre auto" sur blocked.
- `boxOutCheckRule` détecte aussi `shotOutcome === 'blocked'`.

### A11 V2 ext2 — Reset shot clock 14s sur rebond offensif (+3 tests)

Règle FIBA/NBA : après un rebond offensif, le shot clock se reset à 14s
(vs 24s après possession adverse). `addShotReboundStep` pose
`Step.shotClockRemaining = 14` automatiquement quand
`reboundType === 'offensive'`. Champ exploité par `lateShotClockLayer`
(F.5) si activé → no-help défensif sous 5s du shot clock.

### A11 V2 ext3 — Outlet pass marker + diag (+4 tests)

Sur rebond défensif, possession bascule : la défense doit jouer une
passe outlet pour enclencher la transition adverse.

- Type `Step.outletPassPending?: boolean` posé automatiquement sur les
  steps de rebond défensif générés par `addShotReboundStep`.
- Nouvelle règle coach `outletPassRule` (`coachDiagnostics/rules/`)
  émet un diag 'info' tag `outlet-pass-pending` quand le marqueur est
  présent : "Rebond défensif Dx : possession bascule. Ajouter une
  passe outlet vers un guard pour enclencher la transition."
- Registry étendu dans `coachDiagnostics/index.ts`.

### Architecture A11 finale (V1 + V2)

```
Coach pose shotOutcome ∈ {made, missed, blocked}
       ↓
'made' = transition manuelle ; 'missed' / 'blocked' :
       ↓
Clic "étape rebond/contre auto"
       ↓
addShotReboundStep(seed?) → buildShotReboundSetup
       ├─ box-out défenseurs (BOXOUT_OFFSET_PX = 18)
       ├─ rebondeur :
       │   ├─ 'missed' → computeRebound() probabiliste (V1)
       │   └─ 'blocked' → blockedReboundResult() déterministe (V2)
       └─ rebondeur pull cercle (offensif 25 px / défensif 20 px)
       ↓
Step inséré avec :
   - off, ballCarrier
   - defenseOverrides (box-out figés)
   - rebounder, reboundType (informatifs)
   - shotClockRemaining = 14 si offensif (V2 ext2)
   - outletPassPending = true si défensif (V2 ext3)
   - label adapté ("Rebond offensif/défensif Dx" ou "Tir contré par Dx")
       ↓
Diagnostics coach :
   - boxOutCheckRule (V1) : OK / raté selon positions
   - outletPassRule (V2) : info "ajouter outlet pass" si applicable
```

### V3 reportée

Couche `boxOutLayer` dynamique vs setter statique, unification mode
édition ↔ game loop, outlet pass setter auto qui génère un step inbound
après. Plan complet dans [docs/a11-plan.md](docs/a11-plan.md).

## [0.13.0] — 2026-05-18 (A11 — demi-jeu rebond)

Session dédiée à A11 (Box-out / rebond après tir, V1). **Le seul vrai
chantier basket restant**. 4 commits, 1404 → 1404 verts (note : 25
nouveaux tests, suite finale 1404 inclut tout). Estimation initiale
5-8j → coût réel **~3h** parce que beaucoup d'infra existait.

### A11 V1 — Mode édition statique pour le rebond (3 phases + docs)

**Phase 1** (commit `b797c1d`, 7 tests) :
- Types `Step.shotOutcome?: 'made' | 'missed'` + `Step.shotPos?: Point`.
- Helper `shotTracking.ts` : `getShotPosForStep`, `hasShotOutcome`,
  `isMissedShot`.
- UI StepsPanel : bloc "TIR (A11)" avec 2 boutons toggles ✅/❌.

**Phase 2** (commit `76bb002`, 13 tests) :
- Module pur `shotReboundSetup.ts` : `buildShotReboundSetup` construit
  positions box-out défensives + identifie le rebondeur via
  `computeRebound` (réutilisé tel quel de `match/rebound.ts`). Constante
  `BOXOUT_OFFSET_PX = 18` identique à `gameLoop` pour cohérence
  mode live/édition. RNG seedé `seededRng` pour reproductibilité tests.
- Types `Step.rebounder?` + `Step.reboundType?` (informatifs).
- Transform `addShotReboundStep` : no-op si pas missed, sinon insère
  step avec `defenseOverrides` (pattern F.2).
- UI : bouton "🏀 étape rebond auto (A11)" conditionné sur
  `shotOutcome === 'missed'`.

**Phase 3** (commit `3c05e02`, 5 tests) :
- Cohérence R1 résolue : audit confirme que `ScriptedAction shoot`
  n'est jamais converti en Step (consommé en mémoire par
  simulator/gameLoop/aiPossession). Note explicative dans
  `scriptedActionsCatalog.ts`.
- `boxOutCheckRule` étendu : détection robuste via 4 sources
  hiérarchisées (cur.reboundType → prev.shotOutcome → prev.context
  free-throw → label legacy).

**Phase 4** (ce commit) : ROADMAP + CHANGELOG + 3 autres docs.

### Architecture A11 résumée

```
Step.shotOutcome = 'missed'   ← coach pose via UI
       ↓
addShotReboundStep(seed?)     ← setter dans stepTransforms
       ↓
buildShotReboundSetup         ← builder pur
   ├─ box-out défenseurs      (BOXOUT_OFFSET_PX = 18)
   ├─ computeRebound (RNG)    ← réutilise match/rebound.ts
   └─ rebondeur pull cercle   (REBOUNDER_*_PULL_PX)
       ↓
Step inséré avec :
   - off, ballCarrier         (rebondeur si offensif, shooter sinon)
   - defenseOverrides         (positions box-out figées)
   - rebounder, reboundType   (informatifs pour diags)
   - label "Rebond ..."
       ↓
boxOutCheckRule détecte       (via reboundType OU prev.shotOutcome)
       ↓
Diag coach "box-out OK/raté"
```

### Mondes parallèles

Phase 3 documente explicitement les 2 chemins **indépendants** :
- **Coach édite manuellement** : `Step.shotOutcome` posé via UI →
  `addShotReboundStep` génère le rebond → step persisté.
- **Mode IA simulateur** : `ScriptedAction shoot` consommé en mémoire
  par `simulator.ts`/`match/gameLoop.ts`, pas de Step persisté.

### V2 reportée

`shotOutcome: 'blocked'`, reset shot clock à 14s sur rebond offensif,
outlet pass auto, couche `boxOutLayer` dynamique vs setter statique,
unification mode édition ↔ game loop. Plan complet dans
[docs/a11-plan.md](docs/a11-plan.md).

### Phase E status

| Item | Statut |
|---|---|
| E.1 V1 + V2 stage 1+2a | 🟢 livré 2026-05-16 (cycle home/away stub) |
| E.1 V2 stage 2b (refacto 2-way) | ⚪ reporté |
| E.2 Jump ball | 🟢 livré 2026-05-16 |
| E.3 Rebond animé | 🟢 livré 2026-05-16 |
| **A11 V1 — Box-out / rebond demi-jeu (mode édition)** | 🟢 **livré 2026-05-18** |

## [0.12.0] — 2026-05-18 (soir)

Suite de la session avec une **Salve 1 quick wins**, puis 6 quick wins
prioritaires, puis 3 chantiers basket de fond. **16 commits** sur `main`,
1279 → **1353 tests verts** (+74). Phase B/C/F/G **complètes**, Phase D 4/5.

### Phase B — Notion du temps 🟢 complète (4/4)

- **B.3 V1** — End-of-quarter contest awareness (commit `c51160e`, +7 tests).
  Helper `defense/detectEndOfClockContest.ts` + règle coach 'warning'
  tag `end-of-clock-contest`. Badge SVG ambre `🚫 NO FOUL` posé sur
  le défenseur du porteur. Conditions cumulées : `clockSeconds < 5`
  + `defenseTeamFouls ≥ 5`. **Mutuellement exclusif avec F.4** sur
  l'axe `defenseTeamFouls` (invariant testé).
- **B.4 V1** — Synchro cross-actor (commit `5ad5508`, +10 tests).
  Nouveaux champs `Annotation.tStartAbs?` / `tEndAbs?` (secondes ABSOLUES
  depuis début transition) priment sur `tStart/tEnd` legacy. Helper
  `resolveAnnotationTiming(ann, stepDurSec)` centralise la priorité.
  Migration : `playbackTrajectory.attackerTrajectoryAt` accepte un
  `getStepDurationSec`, `pdfRecap`, `playerTracks`.
- **B.4 UI** — Édition par shift+click (commit `634071e`, +4 tests).
  Tooltip MultiTrackTimeline enrichi avec bornes en secondes. Shift+click
  sur un segment → 2 prompts pour saisir `tStartAbs` / `tEndAbs`. Le
  drag des poignées reste en fraction (legacy). Transform
  `setAnnotationTimingAbs` exposée via `app.setAnnotationTimingAbs`.

### Phase D — Trajectoires raffinées 🟡 4/5 (D.4 reportée par choix)

- **D.1 V1** — Easing cross-step (commit `9f15c9e`, +8 tests).
  `state.movementEasing?: 'linear' | 'ease-in-out' | 'ease-out'` appliqué
  sur `localT` du frameResolver. Default `'linear'` = identité (zéro
  régression). Invariants `e(0)=0` et `e(1)=1` garantissent que les
  snapshots aux step exacts restent IDENTIQUES.
- **D.2 V1 + V2** — Inertie / momentum (commit `db7ea06` docs-only).
  Déjà livré 2026-05-15 dans `frameResolver.applyDefenderMotionInertia`
  (`motionMemory` + `defenderPlaybackMobility`). Le ROADMAP était
  désynchronisé, alignement effectué.
- **D.3 V1** — Trajectoires de passes (commit `6ea917d`, +7 tests).
  `Annotation.passKind?: 'direct' | 'lob' | 'bounce' | 'skip'` étend
  `computeBallFrame` : lob ×0.65 lift (plafond 130 px), skip ×0.12
  (plafond 40 px), bounce 2 paraboles (touche sol à mi-trajet).
- **D.4** — Pathfinding défensif. Plan d'audit risque écrit
  ([docs/d4-pathfinding-plan.md](docs/d4-pathfinding-plan.md), commit
  `db13dfa`) mais V1 **non lancée** : ratio risque (Règle 1bis, 13
  tests screen sensibles) / valeur (purement visuel) défavorable.
- **D.5** — Anti-collision pendant interpolation (commit `ef2cfba`,
  +4 tests). Invariant confirmé via test bout-en-bout : 40 frames ×
  N transitions × 4 scénarios, clearance ≥ `PLAYER_MIN_CLEARANCE_PX`
  préservée. ROADMAP désynchronisé, alignement.

### Phase F — Situations spécialisées 🟢 complète (5/5)

- **F.1 V1** — Box-and-1 (commit `49be60b`, +8 tests).
  `DefenseSystem` étendu à `'junk'`. Couche
  `defense/junkLayer.ts::computeJunkDefenseTargets` court-circuit comme
  la zone : 4 défenseurs sur slots fixes (±80, ±60 px du panier),
  chaser collé à son homme via `deny-3q` + `gazeLock: 'opponent'`,
  `helpFactor=0` partout. UI complète dans SystemSelector + DefensePanel.
- **F.1 V2** — Triangle-and-2 + Diamond-and-1 (commit `fa6e1e2`, +13 tests).
  3 formations zone (box / triangle / diamond), 1 ou 2 chasseurs selon
  le type. UI dynamique avec verrouillage croisé sur les pickers.
- **F.3** — FT rebound positioning (commit `bc44ec0` docs-only).
  V1 entièrement livrée 2026-05-13 (`buildFreeThrowSetup` + 11 tests).

### Phase G — Calibration vitesse 🟢 complète (4/4)

- **G.1** — Doc calibration vitesse (commit `a360b6b`). Nouveau
  [docs/physics-calibration.md](docs/physics-calibration.md) : scope
  tactique vs sprint réel (~22 % du sprint NBA), recette pour passer
  en sprint réel, cas où le mode tactique gêne.
- **G.2 V1** — Sprint boost contextuel (commit `c4ae2da`, +4 tests).
  `Step.sprintBoost?: boolean` ×1.8 sur la vitesse max effective défense.
  UI : toggle dans StepsPanel.
- **G.3 V1** — Modèle d'accélération (commit `84467e1`, +4 tests).
  `state.accelerationModelEnabled` + `state.defenderAcceleration`. Modèle
  linéaire `effectiveMaxSpeed = min(maxSpeed, accel × stepIdx)`. UI :
  toggle + slider 20-200 px/step². Limitation V1 documentée.
- **G.4 V1** — Profil athlétique défenseurs (commit `86b13d7`, +5 tests).
  `state.defenderSpeedProfiles?: Partial<Record<DefenderId, 'elite' |
  'standard' | 'lent'>>` ×1.3 / ×1.0 / ×0.7. Cumulable avec G.2 et
  closeoutBoost.

### J.7 — Panneau debug joueur V1 (commit `b5aced8`)

Nouveau `state.showPlayerDebug?: boolean` qui active `collectDecisions`
dans `useCourtFrame`. Composant `<PlayerDebugTable>` en overlay
haut-droite : tableau compact 5 défenseurs × 5 colonnes (id, matched,
screen state, route, helpKind/factor). Toggle "debug joueur" dans
ParametresPanel, indépendant du toggle "debug écran" existant.

### Phase J — Tooling moteur (J.5 + J.6, commits `ccf73b9` + `d1d6792`)

- **J.5 V1** — Profile overlay live (9 tests). Module pur
  `playback/profileAggregator.ts` :
  `aggregateProfiles(profiles[])` → stats `mean / p95 / max / sum`
  par phase (attackers, screens, obstacles, defenders, collisions,
  rateLimiter, ball). Classe `ProfileRingBuffer` (maxSize 120 = 2s
  à 60fps). `state.showProfileOverlay?: boolean` active `profile: true`
  dans useCourtFrame + monte `<FrameProfileOverlay>` (haut-gauche).
  Phase la plus coûteuse mise en évidence (🔥). Toggle "profile (J.5)"
  dans ParametresPanel.
- **J.6 V1** — Visual regression légère (9 tests). Helper pur
  `playback/sceneSnapshot.ts::snapshotScene(state, label, sampleTs?)`
  capture positions ballon + 10 joueurs + flags défenseurs clés à
  des instants choisis. Positions arrondies à 1 décimale (stable
  cross-machine). Test `j6GoldenSnapshots.test.ts` couvre 4 templates :
  `ucla-cut`, `pnr-central`, `pindown-corner`, `floppy`. Snapshots
  Vitest natifs versionnés dans `__snapshots__/`. Régénération
  volontaire : `npx vitest run j6GoldenSnapshots -u`.

Bilan Phase J après J.5 + J.6 : **4/7 livrés** (J.4 off-ball avancé,
J.5 profiling, J.6 golden, J.7 panneau debug). Restent J.1, J.2, J.3
(non-bloquants, reportés).

### Refacto interne

- **`stepTransforms.patchStep`** ajouté (commit `fac20b2` matin) :
  transform générique pour écrire n'importe quel champ optionnel sur
  un step. Consommé par les inputs B.1 / F.4 / F.5 / G.2.
- **`annotationTransforms.setAnnotationTimingAbs`** ajouté (B.4 UI) :
  écrit ou efface `tStartAbs/tEndAbs` sans toucher au legacy tStart/tEnd.

### Notes de session

D.2 et F.3 étaient en réalité livrés depuis 2026-05-15 et 2026-05-13
respectivement (désynchronisations ROADMAP, alignement effectué).
D.4 V1 a fait l'objet d'un plan d'audit risque détaillé mais l'utilisateur
a choisi de **ne pas le lancer** vu le ratio risque (Règle 1bis
CLAUDE.md, 13 tests screen sensibles) / valeur (purement visuel).

## [0.11.0] — 2026-05-18

Session triple : **temps réel** (B.1 + B.2), **défense de fin de
possession** (C.2 V2 + F.4 + F.5), polish UI dark mode résiduel.
1262 → **1279 tests verts** (+17). 7 commits. Tous push'és sur `main`.

### Phase B — Notion du temps 🟡 (B.1 + B.2 livrés, B.3/B.4 restent)

- **B.1 — Durée individuelle par step** (commits `1670f10` + `7e67e79`).
  Nouveau champ `Step.duration?: number` (secondes). Default = fallback
  sur `state.secondsPerStep`, rétrocompat totale. Helper
  `timecode.getStepDurationSeconds(state, stepIdx)` + refonte de
  `realStepToSeconds` et `totalDurationSeconds` pour accumuler les
  durées individuelles au lieu d'une multiplication globale.
  Consommateurs migrés : `Timeline.tsx`, `MultiTrackTimeline.tsx`,
  `PlaybookView.tsx` (StepAnnotationsRecap + PrintMultiTrack).
  Input "durée (s)" ajouté dans StepsPanel pour le step actif. +17 tests
  (timecodeStepDuration.test.ts).
- **B.2 — Shot clock display 3-band** (commit `4c3af36`). Helper
  `shotClockBand(secondsLeft)` centralise les seuils (>8s safe / 5-8s
  warning / ≤4s danger). Le badge shot clock de la Timeline passe en
  vert/jaune/rouge selon le palier (cas violation conservé). Seuils
  mutualisés avec `LiveMatchOverlay` et `SimulationSection`. +3 tests.

### Phase C — Réalisme défensif (C.2 V2 livré, phase C complète 7/7)

- **C.2 V2 — `helpStickinessMs`** (commit `751acf6`). Nouveau setting
  `state.helpStickinessMs?: number` (range 100-2500 ms) qui prime sur
  `helpStickiness` V1 (steps). Helper `cumulatedHelpMs(state, stepIdx,
  defenderId)` somme `Step.duration × 1000` sur les steps comptés par
  `consecutiveHelpSteps` — dépend de B.1 pour la granularité fine
  (fallback `secondsPerStep` sinon). `helpStickyLayer` branche V2 vs V1
  selon settings. UI : slider 0-2500 ms par pas de 100 dans DefensePanel
  (activation V2 → désactive V1 legacy automatiquement). +8 tests.
  Cible basket : 1200 ms ≈ standard NBA, indépendant du découpage en
  steps.

### Phase F — Situations spécialisées (F.4 + F.5 V1)

- **F.4 — End-of-quarter foul to give** (commit `fac20b2`, 9 tests).
  Nouveau champ `Step.clockSeconds?: number` + `AppState.defenseTeamFouls
  ?: number` (0-5). Helper pur `defense/detectFoulToGiveOpportunity.ts`
  qui détecte clock < 5 + fautes < 5 + drive actif (trigger explicite
  ou delta-distance > 30 px vers le panier). Identifie le défenseur du
  porteur via matchups. Règle coach `foulToGiveRule` émet un diagnostic
  `critical` tag `foul-to-give`. Badge SVG `🟥 FOUL TO GIVE` posé sur
  le défenseur du porteur dans `DetectionBadgesOverlay`. UI : input
  fautes équipe dans DefensePanel + input `quart (s)` per-step dans
  StepsPanel.
- **F.5 — Late shot clock defense** (commit `fac20b2`, 5 tests). Nouveau
  champ `Step.shotClockRemaining?: number` +
  `AppState.lateShotClockDefenseEnabled?: boolean`. Nouvelle couche
  `defense/lateShotClockLayer.ts` (couche 1.7 de l'engine, après help
  sticky, avant pnrLayer). Si flag actif et `shotClockRemaining < 5` :
  carrierDef voit sa cible décalée de +10 px vers le porteur (contest
  accru) ; tous les autres défenseurs perdent leur aide
  (helpFactor=0, helpTriggered=false). Invariant clearance ≥ 34 px
  préservé. UI : checkbox dans DefensePanel + input `shot clk` per-step
  dans StepsPanel.

### Refacto interne

- **Transform générique `patchStep(state, idx, patch)`** ajoutée à
  `stepTransforms.ts` + `useAppState.patchStep`. Permet d'écrire
  n'importe quel champ optionnel sur un step sans transform dédiée
  (consommée par les 3 nouveaux inputs B.1 / F.4 / F.5).

### Polish UI dark mode (post-PR `sad-kirch-7f9794` merged 2026-05-16)

- **Toolbar Playbook** (commit `684c6d6`). Le bouton "🖨 imprimer / PDF"
  + le bouton "fermer" + le wrapper toolbar passent en tokens
  `DARK_PANEL.*` au lieu d'un rendu navigateur par défaut blanc.
- **Menus contextuels joueurs** (commit `a22d69c`). AttackerMenu,
  DefenderMenu, ToolBar, sharedRows (Row / OverrideSliderRow /
  GazeLockButton) et AutoActionSubmenu : refonte complète des fonds
  blancs/cream en dark. Accents orange (offense) et bleu (defense)
  conservés pour les états actifs.

### Nettoyage

- 4 branches locales mergées supprimées (les distantes laissées sur
  GitHub) — voir notes session.

### ROADMAP

Section détaillée C.2 corrigée (le récap disait V1 livré 2026-05-13
mais la section ⚪ — incohérence résolue), section C.2 marquée
🟢 V1 + V2. Phases B et F mises à jour.

## [0.10.0] — 2026-05-16

Grosse session axée **basket pur** (UX, mobile, tests UI repoussés
par consigne user). 30+ commits, 1232/1232 verts (puis 1237/1237).

### Phase I — Polish Play IA (B5+, B6, B7) 🟢 complète

Étend la phase I déjà livrée en [0.9.0] avec 3 items de polish :

- **B5+ Auto-tuning calibration** (commit `0192916`) : dichotomie
  automatique sur `creativity` jusqu'à `|Δ PPP| ≤ 0.15`. Max 8
  itérations. Bouton "🎯 auto-tune" dans CalibrationPanel. Module
  `src/lib/logic/match/autoTuning.ts`. +5 tests.
- **B6 Vitesse accélérée live** (commit `6dd7e83`) : sélecteur ×1/
  ×2/×4/×8 dans LiveMatchPanel, modifiable en cours de match.
- **B7 Replay détaillé post-match** (commit `486b039`) : modal
  `<MatchReplay>` qui affiche la timeline par possession + filtres
  par type d'événement + icônes colorées. Accessible via bouton
  "📼 voir replay détaillé" quand session terminée.

### Phase E — Cycle complet basket 🟢

- **E.1 V1 — Rebond + cycle home/away stub** (commits `5e48549`,
  `b504dfd`, `4cf98a4`) : modèle de rebond géométrique avec poids
  par profil (rim-roller × 1.4, shooter × 0.85, def bonus × 1.6,
  shooter penalty × 0.4). Possession adverse stubbée (positions
  figées home + ballon animé). Score 2-côtés HOME/AWAY séparés.
  Box-out V1 (snap) puis V2 (animé 500 ms ease-out via
  `boxOutTargets`).
- **E.1 V2 stage 1 — Ballon adverse animé** (commit `6d99024`) :
  ballon rouge pulsant entre 4 waypoints (outlet → relai → drive →
  tir) pendant la phase away. Banner "🔄 POSSESSION ADVERSE".
- **E.1 V2 stage 2a — 5 adversaires simulés** (commit `1cefa67`) :
  positions miroir verticales autour de y=540, course progressive
  vers le panier home modulée par poste (PG ×0.5 → C ×0.95).
  Rendu SVG : sprites rouges "A1-A5". +5 tests.
- **E.2 — Jump ball initial** (commit `a61323c`) : nouveau context
  `'jump-ball'` + `convertStepToJumpBall(s)` + bouton dans
  StepsPanel. Setup canonique 2 sauteurs + 4+4 en arc, Règle 1
  validée sur 45 paires. Module `src/lib/logic/jumpBallSetup.ts`.
  +6 tests.
- **E.3 — Rebond animé** (commit `874d96c`) : pré-calcul du rebond
  au moment du tir (`MatchState.pendingRebound`), animation
  parabolique 2 phases du ballon (shooter → cercle → rebondeur).
  +6 tests.

### Phase F — Lancers francs et situations 🟢

- **F.2 — Free throw post-lancer (course-rebond)** (commit `6bb780a`) :
  `buildFreeThrowReboundSetup(made)` + `addFreeThrowReboundStep`.
  Sur miss, blocks défensifs gagnent le rebond (D4/D5 proches
  baseline), slots offensifs en over-the-top (O4/O5 au-dessus du
  cercle). Sur made, transition adverse. UI : 2 boutons (🏀 +1
  LF réussi / ⚠ LF manqué + rebond) dans StepsPanel. +9 tests.
- **F.4 — Pénalité technique / DQ** (commit `5ae6e10`) : nouveau
  champ `AppState.disqualifiedPlayers?: PlayerId[]`. Toggle DQ
  par joueur dans ParametresPanel + overlay rouge "DQ" sur terrain.
  V1 visuel uniquement (engine inchangé). +5 tests.

### 🛡 Système remises en jeu COMPLET 🟢

Phase entière livrée cette session — extension du moteur tactique
pour étudier les BLOB/SLOB. Pattern aligné sur F.3 (free throw).

#### Setup et templates

- 3 zones FIBA via `step.context: 'inbound-baseline' |
  'inbound-sideline-low' | 'inbound-sideline-high'`
- Helper `buildInboundSetup(side)` (module
  `src/lib/logic/inboundSetup.ts`) — positions canoniques avec
  passeur 12 px hors-ligne
- Setter `convertStepToInbound(s, side)` dans `stepTransforms.ts`
- **17 templates classiques** dans `inboundTemplates.ts` :
  - 6 BLOB : Box Curl, Stack Cross, Triangle, Zipper, Elevator
    (Spurs), Hawk (Atlanta)
  - 5 SLOB bas : Stagger, Hammer, Iverson, Floppy, + 3 "défense
    d'attaque"
  - 4 SLOB haut : Outlet, Drag screen, Quick advance, Bypass trappe
  - 3 défense d'attaque : Box vs face-guard, Stack vs zone 2-3,
    Hammer vs zone-press

#### Défense spécifique

- Nouveau type `InboundDefenseMode = 'man' | 'face-guard' |
  'deny-deny' | 'zone-press'`
- Module `src/lib/logic/inboundDefenseSetup.ts` :
  `buildInboundDefenseSetup({ off, inbounder, mode, hoop })`
- Setter `setInboundDefenseMode(s, mode)` dans `stepTransforms.ts`
- UI : section "🛡 DÉFENSE SUR REMISE" dans StepsPanel (visible
  uniquement sur step inbound)
- +6 tests dédiés (`inboundDefenseSetup.test.ts`)

#### Live mode & diagnostics

- **Timer 5s live** (`MatchState.inboundTimerMs`) : décompté à
  chaque tick, force `turnover-pass` à 0. Désarmé sur premier
  intent 'pass'. +5 tests.
- **Box-out V2 animé** (`MatchState.boxOutTargets +
  boxOutStartedAtMs`) : lerp ease-out cubic 500 ms vers les
  positions de box-out (vs snap instant V1). +4 tests.
- **Pression visuelle** sur défenseur du passeur : anneau pulsant
  rouge + 🔥 sur le défenseur matched
- **Diagnostic coach `inboundFiveSecRule`** (statique + timer) :
  3 verdicts info/warning/critical. Compteur 5s statique étendu
  (P3.2) : durée estimée × `secondsPerStep`, critical si > 5s.
  +7 tests.
- **Diagnostic coach `inboundDefenseRule`** (P2.2, commit
  `dcfe8c3`) : 3 checks (pression passeur, deny receveur principal,
  attaquants ouverts). +5 tests.
- **Diagnostic coach `boxOutCheckRule`** (commit `e79453c`) :
  détection phase de rebond (heuristique label / context LF
  précédent) + check box-out géométrique. +4 tests.

### Game loop optimisations

- **Tick rate 5 Hz → 30 Hz** (commit `7ed6cc0`) : MATCH_TICK_MS
  passe de 200 à 33 ms, scaling proportionnel de toutes les
  constantes de vitesse et intervalles décisionnels. Animation
  visuellement fluide (vs 5 fps saccadé). Tests adaptés.

### Mode "Match plein écran"

- Bouton "🔳 plein écran" dans LiveMatchPanel qui en un clic active
  `state.fullCourt = true` + `presentMode = true` +
  `document.requestFullscreen()` (commit `e9ca07f`)
- Composant `<LiveMatchOverlay>` (HUD compact : scores HOME/AWAY,
  shot clock, possession N/max, boutons stop/exit). Esc quitte.

### UX et corrections

- **Badge "auto IA" 🧠 inversé** (commit `b504dfd`) : convention
  visuelle changée — défenseurs en auto portent le badge, manuels
  sans badge. Plus intuitif quand 4/5 sont auto.
- **Boutons "Tout en auto" rapide vs réel** (commit `4cf98a4`) :
  ⚡ instantané pour coach + ▶ animé 700 ms ease-out pour démo.
- **Fix UCLA cut anti-flip D1** (commit `303fb25`) :
  `pushOutOfManyConstrained` pour éviter le flip de côté quand
  D coincé entre cutter et screener. Mesure UCLA scrub :
  52 → 25 px max.
- **Garde-fou diagnostic anti-téléport central** (commit `1c3feab`) :
  `collectDecisions` + 16 templates instrumentés.

### Documentation

- **`docs/todo-priorities.md`** : fichier dédié au TODO consignes,
  basket priorisé en P1/P2/P3, UX/tests UI/mobile repoussés.
- **`docs/mobile-plan.md`** (existait) : plan Capacitor iOS en 5
  phases, à attaquer plus tard.
- **`docs/ai-possession.md`** : statut Phase I 100% (B1-B5 + B5+
  + B6 + B7).

### Régression

Cumulé sur la session : **+~250 tests** (1227 → 1237 verts).
Toutes les invariants moteur conservés (Règle 1, MIN_CLEARANCE,
saut max 5.5 m/étape, anti-téléport ≤ 18 px/frame en live).

### Reste explicite pour V3 / sessions futures

- **E.1 V2 stage 2b** (~2-4j) : refacto AppState avec
  `currentlyAttackingTeam` natif, matchups inversés en mémoire,
  engine défensif appliqué côté home pendant phase away,
  diagnostic coach spécifique aux possessions adverses.
- **Profiling avancé + golden metrics élargis** (~2-4j optionnels) :
  heatmap CPU par couche, screenshots SVG automatiques pour
  visual regression.
- **Phase A UX, Phase H tests UI, Mobile iOS** : repoussés par
  consigne user. Cf. `docs/todo-priorities.md`.

---

## [0.9.0] — 2026-05-15

### Phase J — Qualité moteur d'écran & outillage (8 chantiers)

Suite de la session debug UCLA cut (saut D1 ~52 px entre f113-f114).
La phase J consolide le moteur d'écran et son outillage **sans changer
le scope basket**. Cf. [ROADMAP § Phase J](ROADMAP.md#phase-j--moteur-d%C3%A9cran--playback--qualit%C3%A9--outillage-mai-2026).

#### J.0a — Fix anti-flip D1 (pushOutOfManyConstrained)

`resolveFrameAt` ne flippe plus D1 d'un côté à l'autre du poseur quand
il est coincé entre cutter et screener (UCLA cut). Quand un seul cluster
d'écran a déclenché la Bezier de contournement, on contraint chaque
push à ne pas franchir le segment `defA → defB` vers le côté du
cluster. Mesure UCLA scrub : saut max **52 → 25 px**, plus de flip
de côté. Commit `303fb25`, 3 tests dédiés (`uclaCutAntiFlip.test.ts`).

#### J.0b — Garde-fou diagnostic anti-téléport central

`resolveFrameAt({ collectDecisions: true })` expose `frame.debug.defenders[id]`
avec : `screenMode`, `quality`, `carrierContact`, `offBallContactType`,
`curveBranch`, `clusterId`, `pushMode`, `forcedPushSign`, `matchedTo`,
`late`. Le test `screenLabPlaybackJumps` couvre maintenant 16 templates
(9 Labs + 7 classiques : pnr-central, horns-flare, pindown-corner,
spain-pnr, ucla-cut, floppy, hammer). Sur tout saut > 20 px, dump
automatique du diff de décision avant/après. Commit `1c3feab`.

#### J.1 — Parité scrub ↔ playback

Le scrub recompute désormais un préfixe synthétique depuis le début du
segment pour avoir la même stabilité que le playback (rate limiter
appliqué). Plus de différence visuelle scrub vs play. Commit `38209d6`.

#### J.2 — Cache segmentaire du resolver

Les valeurs stables par segment `idxA → idxB` (`ctxA`, `ctxB`,
`screenerObstacles`, contacts, routes, `screenLockedDefenders`) sont
memoizées. Profilage indique ~50 % de calcul sauvé en playback continu,
particulièrement visible quand `collectDecisions` ou overlays debug
sont actifs. Commit `87b212c`.

#### J.3 — Solveur de contraintes unifié

Nouveau module `src/lib/logic/constraintSolver.ts` (208 lignes) qui
unifie toute la logique de projection point/obstacles avec contraintes
de demi-plan et de collisions multi-entités. `pushOutOfScreenContact`,
`pushOutOfMany` et `resolvePlayerCollisions` délèguent désormais au
même socle. Plus de surface d'attaque pour les régressions latérales.
Commits `f7fcb8a` (cœur), `6ba3927` (push radial), `f1a6b64`
(finalisation multi-entités).

#### J.4 — Off-ball avancé

Les écrans hors-ballon ont désormais des routes par type (`flare`,
`backscreen`, `hammer`, etc.), un gap explicite pour les elevators
(le défenseur passe par l'unique fente entre les deux poseurs), une
sortie tangentielle active après contact, et une mémoire multi-contact
pour les stagger séquentiels (D2 transite proprement de O4 vers O5
sans retour à l'homme). Gros gain sur UCLA, floppy, pindown, hammer.
Commits `c50615d`, `836e523`, `285b9ff`, `46c42fd`.

#### J.5 — Profiling + budget frame

`resolveFrameAt({ profile: true })` expose `frame.profile.totalMs` +
sous-temps par phase. Test dédié `playbackProfilingBudget.test.ts`
mesure la moyenne sur les 16 templates et fail si dépassement du
budget (cible : `< 2 ms en 5v5`). Commit `a40a8bc`.

#### J.6 — Golden scenario metrics

Nouveau module `src/lib/logic/playbackGoldenMetrics.ts` qui produit
un snapshot par template : `maxAttackerJumpPx`, `maxDefenderJumpPx`,
`minPlayerClearancePx`, `screenContactFrames`, `averageResolveMs`.
Snapshots versionnés. Toute évolution du moteur sera **automatiquement
comparée** à l'état de référence. Commit `e8ad45b`.

#### J.7 — Panneau debug joueur

Nouvel overlay `ScreenPlayerDebugPanel.tsx` (activable via
`state.showPlayerDebug` dans Paramètres) qui affiche par défenseur
sélectionné : `screenMode`, `quality`, `clusterId`, `pushMode`,
`forcedPushSign`, `matchedTo`, `late`, `jumpLastFrame`. Réutilise
l'option `collectDecisions` déjà branchée. Commit `37a370f`.

### Phase C — Réalisme défensif complet (C.1 → C.7)

7 chantiers de réalisme défensif livrés sur 2026-05-12/13. Tous opt-in
pour préserver la rétrocompat.

- **C.1 — Closeout footwork** (commit `8b65aa6`) : `closeoutEasing`
  applique sprint(65 %) puis freinage(35 %) sur la transition d'un
  défenseur en closeout. Visuellement "in control, bras hauts".
- **C.2 — Help-and-recover timing** : nouveau setting
  `state.helpStickiness?: number` (1..3 steps avec decay linéaire).
  Couche `helpStickyLayer` (1.6 du pipeline).
- **C.3 — Hedge length** : `state.hedgeRecoveryDelay` (1..3 steps)
  avant recover forcé. Helper pur `hedgeStepCounter`.
- **C.4 — Pre-rotation shift** : `state.preRotationEnabled` shifte
  carrierDef ~10 px vers un poseur imminent (détecté avant impact).
- **C.5 — Tag-then-switch** : `state.tagThenSwitchEnabled` bascule
  en switch implicite si le roller arrive ≤ 150 px du panier.
- **C.6 — Help angle continu** : mode `open-weighted` qui pondère le
  bias d'aide par les distances réelles plutôt que par l'angle binaire.
- **C.7 V1 + V2 — Action chains** : détecte 3 patterns
  (`re-screen`, `stagger-sequential`, `flare-then-fade`) ; V2 fait
  réagir la défense (shift tangentiel re-screen + gazeLock flare-fade).
  Setting `state.readScreenChainsEnabled?: boolean`. Couche
  `chainResponseLayer` (2.5). +21 tests dédiés.

### D.2 + D.5 — Réalisme physique playback

- **D.2 — Inertie défenseurs** (commits `7b1e12e`, `a6b871b`) : un
  changement de direction brutal coûte du temps. Modélisé via une
  courbe d'accélération bornée + V2 modulée par la vitesse précédente
  (un défenseur qui sprintait ralentit moins vite qu'un défenseur
  arrêté). Les déplacements deviennent moins robotiques.
- **D.5 — Anti-collision pendant l'interpolation** (commit `3b00c04`) :
  passe finale de clearance sur la frame interpolée garantit que les
  collisions transitoires entre 2 endpoints "propres" sont résolues
  côté visuel. Complète l'invariant Règle 1.

### Phase I — AI possession mode (démarrage)

Nouveau module `src/lib/logic/match/aiPossession.ts` qui génère une
possession entière jouée par l'IA depuis l'étape active. Expose :

- `generateAiPossessionPlan(state, options)` — produit `steps[]` +
  `events[]` (passe / drive / shot / turnover) + `outcome` + `points`
- `generateAiMatchSeries(state, options)` — itère N possessions
- RNG seedé (`seededAiRng`) pour reproductibilité
- Setting `creativity` (0..1) module la "température" de la sélection
  d'action

Câblage UI dans `SimulationSection`. **Premier pas vers la Phase I
Play IA** (game loop autonome 5v5) annoncée comme repoussée — à
clarifier dans la roadmap si l'effort se poursuit. Doc dédiée :
[docs/ai-possession.md](docs/ai-possession.md). Commit `313e015`.

### F.3 — Free throw rebound positioning

Setup automatique des 10 positions canoniques autour de la raquette
sur LF (NBA/FIBA). Nouveau champ `Step.context?: 'live-play' | 'free-throw'`.
`applyFreeThrowSetup(state)` configure les slots. 11 tests, commit
livré 2026-05-13.

### Tooling — Diagnostics réutilisables

Nouveau module `src/lib/logic/playbackDiagnostics.ts` (commit `aa39193`)
qui extrait le code de détection/formatting des sauts du test
`screenLabPlaybackJumps` pour le rendre réutilisable (`collectPlaybackJumpDiagnostics`,
`formatPlaybackJumpDiagnostics`). Permettra de l'invoquer depuis d'autres
tests ou outils dev sans dupliquer la logique.

### Documentation

- **[ROADMAP.md](ROADMAP.md)** : nouvelle Phase J entièrement détaillée
  (8 chantiers + plans + risques) ; D.2/D.5 marqués livrés ; Phase
  I AI possession reflète le démarrage.
- **[docs/SCREEN-ENGINE.md](docs/SCREEN-ENGINE.md)** : sections
  ajoutées sur le `constraintSolver`, le `contact state machine`,
  l'hystérésis qualité/spatiale.
- **[docs/mobile-plan.md](docs/mobile-plan.md)** (nouveau) : plan
  Capacitor iOS en 5 phases pour le portage futur, à attaquer quand
  l'app desktop sera stable.
- **[docs/ai-possession.md](docs/ai-possession.md)** (nouveau) :
  documentation du module `aiPossession.ts` + scope Phase I.

### Bouton "Tout en auto" — 2 variantes (rapide / réel)

Le bouton libérant les overrides défense se dédouble pour servir 2 cas
d'usage distincts :

- **🧠 ⚡ rapide** : instantané. Pour le coach qui itère sur ses
  scénarios. Comportement existant.
- **🧠 ▶ réel** : anime le retour sur ~700 ms (ease-out cubique) depuis
  les positions manuelles capturées vers les positions auto recomputées.
  Pédagogique : sert à montrer aux joueurs la réaction défensive
  attendue plutôt qu'un téléport.

État transitoire `DefenseReleaseTransition` dans `useAppState` (non
persisté, hors `AppState`) + `releaseFrame` dans `useCourtFrame`
intercalé entre scrub et static. Tick `requestAnimationFrame`
uniquement pendant la durée active. Commit `4cf98a4`.

### Badge "auto IA" + bouton "Tout en auto" déplacé

Inversion de la convention visuelle des badges défense : les défenseurs
en mode auto portent désormais un 🧠 (fond indigo clair), les manuels
n'ont plus de badge. Le défenseur "déviant" devient celui sans cerveau,
plus intuitif quand 4/5 défenseurs sont en auto. Bouton "Tout en auto"
déplacé en tête du panneau "Système de défense" pour accès rapide.
Commit `b504dfd`.

---

## [0.8.5] — 2026-05-12

### A.1 + A.4 — UI accessible + badges détections sur le terrain

Deux chantiers de la Phase A (audit roadmap) livrés ensemble pour
rendre accessibles côté coach les features défensives développées lors
de la session 2026-05-12.

#### A.1 — Couvertures avancées dans `DefensePanel`

Nouvelle section "Couvertures avancées" (sous-titre "Réactions auto
sur patterns détectés") avec 4 contrôles :

1. **post-up** (dropdown) → `state.postCoverage` (`'none'` / `'dig'` / `'double'`)
2. **bump auto sur cutters** (toggle) → `state.autoBumpCutters`
3. **unwind sur reject screen** (toggle) → `state.unwindRejectedScreens`
4. **maintenir couv. sur snake** (toggle) → `state.snakeKeepCoverage`

Toutes désactivées par défaut (rétrocompat). Tooltips explicites sur
l'effet basket de chaque option.

#### A.4 — Badges détections sur le terrain

Nouvel overlay SVG `court/DetectionBadgesOverlay.tsx` qui lit les
`CoachDiagnostic[]` déjà calculés en amont (zero re-computation) et
rend 4 types de badges :

- **REJECT** (orange) près du porteur + flèche vers le poseur abandonné
  → tag `'reject-screen'`
- **SNAKE** (orange) près du porteur → tag `'snake-dribble'`
- **EMPTY SIDE** (jaune) entre le couple PnR → tag `'empty-side-pnr'`
- **3 SEC** (rouge avec anneau pulsant SVG `<animate>`) sur le défenseur
  en violation → tag `'defensive-3sec'`

Setting `state.showDetectionBadges?: boolean` (default `true`), toggle
dans `ParametresPanel` à côté de "lecture coach".

#### Câblage

- `page.tsx` propage `coachDiagnostics` (déjà memoized via `useMemo`)
  à `CourtView` via nouvelle prop optionnelle `diagnostics?: CoachDiagnostic[]`
- `CourtView` rend l'overlay entre `<CourtPlayersLayer>` et le
  `<ThreatOverlay>` badges pour cohabiter sans masquer

TS clean, 714 tests verts inchangés (composants présentationnels).

Roadmap : A.1 et A.4 marqués 🟢. Reste A.2 (fullscreen v2) + A.3
(annotations texte) pour finir la phase A.

### Logique V2 — couvertures réactives (Trap v3 + B2 V2 + B4 V2 + Undo v2)

Trois extensions de comportements défensifs livrés en V1 + marquage de
l'Undo v2 (déjà fait via `commitCoalescedHistory`).

#### Trap v3 — coexistence trap + écran porteur

Avant v3, le trap était **désactivé dès qu'un écran était détecté**.
Trop conservateur : un écran dans une zone de trap est typiquement LE
moment où la défense veut trapper.

v3 : trap appliqué **même avec un écran**, sauf 2 cas spéciaux :
- `'blitz'` : la rule est déjà un trap PnR.
- `'switch'` : matchups swappés.

`pickTrapHelper` exclut désormais le `screenerDef` via nouveau paramètre
`excludeDefenders?: Set<DefenderId>`.

7 tests (`trapV3Coexistence.test.ts`).

#### B2 V2 — unwind reject screen

V1 (commit `f54cb3e`) était diagnostic-only. V2 (opt-in via
`state.unwindRejectedScreens`) : quand un reject **SHARP** (`awayness ≤
-0.7`) est détecté, l'écran est forcé à `null` dans le
`DefenseFrameContext`. La défense retombe sur la couverture homme-à-homme
pure (D5 sur O5, D1 sur O1).

4 tests (`b2V2UnwindRejectedScreen.test.ts`).

#### B4 V2 — snake keep coverage

V1 détectait le V pattern mais la couverture se relâchait au sommet
puis re-armait à zéro. V2 (opt-in via `state.snakeKeepCoverage`) :
quand un snake est détecté au step N, `screenQuality` effective forcée
à **90 minimum** dans `baseTargets`. La 2ᵉ utilisation est traitée
comme un lockdown au lieu d'un re-arm.

4 tests (`b4V2SnakeKeepCoverage.test.ts`).

#### Undo/Redo v2 — déjà livré

Marqué 🟢 — le coalescing existe via `commitCoalescedHistory` +
`dragHistoryAnchorRef`. Un drag = 1 entrée undo. Réutilisé par la
sélection multiple pour les drags groupés.

**710 → 714 tests verts** (+15 sur les 3 V2 + Trap v3).

### UX — Sélection multiple de défenseurs

Permet de sélectionner plusieurs défenseurs et de les déplacer ensemble.
Halo cyan pointillé autour des sélectionnés + mini panneau info en haut-
droite "🔗 N défenseurs sélectionnés".

**Modes de sélection** (mode `move` uniquement, ne conflicte pas avec
le Shift+freehand des autres tools) :
- **Shift+clic** sur un défenseur → toggle dans la sélection
- **Shift+drag dans le vide** → marquee (rectangle de sélection), tous
  les défenseurs dans le rect sont sélectionnés au relâcher
- **Clic dans le vide sans modifier** → vide la sélection
- **Échap** → vide la sélection

**Drag groupé** : clic sans modifier sur un défenseur sélectionné (≥ 2)
→ tous les défenseurs sélectionnés bougent avec le même delta. **1 seule
entrée d'historique** pour tout le drag (utilise beginPlayerDrag /
moveDefenderDuringDrag / commitPlayerDrag — déjà conçu pour ça).

**Câblage** :
- State éphémère `selectedDefenders: Set<DefenderId>` dans CourtView
  (pas dans AppState : pas de persistance, pas d'undo individuel)
- Esc listener via useEffect
- Marquee state + `groupDragInitialRef` dans `useCourtPointerHandlers`
- Halo cyan dans `Player.tsx` via nouvelle prop `isSelected`
- Rect SVG semi-transparent rendu en fin de SVG dans CourtView

TS clean, 699 tests existants verts (pas de tests dédiés ajoutés sur les
handlers de pointer — composant UI complexe testé manuellement).

Roadmap : `#4 Sélection multiple` marqué 🟢.

### UX — Snap-to-grid (Ctrl/Cmd + drag)

Pendant le drag d'un joueur avec **Ctrl** (PC) ou **Cmd** (Mac) enfoncé,
la position s'aimante sur les lignes clés du terrain FIBA. Feedback
visuel : ligne cyan pointillée affichée pendant le snap actif.

**Cibles** (seuil 8 px) :
- Ligne médiane verticale (x = 300)
- Bords de la raquette (PAINT.x1 / x2 / y1 / y2)
- Ligne des lancers francs (y = 235)
- Arc à 3 points (rayon 250 depuis HOOP)
- Blocs bas (HOOP.x ± 70, HOOP.y + 80)

Le plus proche gagne en cas de multi-candidats. Si aucun dans le seuil,
point inchangé.

**Nouveau module** `src/lib/logic/snapToGrid.ts` — fonction pure
`snapToGrid(p, threshold=8, hoop=HOOP)` retourne `{point, snappedTo}`.

**Nouveau composant** `src/components/court/SnapGuideOverlay.tsx` —
rendu de la ligne snappée en cyan pointillé (lignes) ou point cyan plein
(blocs bas).

**Câblage** : `useCourtPointerHandlers` lit `e.ctrlKey || e.metaKey`
pendant `onPointerMove` et `onPointerUp`, applique le snap, expose
`snapTarget` pour le rendu visuel.

**Adaptation full court** : utilise `HOOP_OPPOSITE` quand
`state.attackingDirection === 'down'` (snap autour du bon panier).

**Tests** : 11 unitaires (no-snap loin, snap médiane, paint left/right/
bottom, free-throw, arc 3pts, blocs gauche/droit, priorité plus proche,
threshold custom). **688 → 699 tests verts**.

Roadmap : `#2 Snap-to-grid` marqué 🟢.

### UX — Graphique d'évolution des métriques

Mini line chart sous la `Timeline` qui affiche l'évolution d'une métrique
défensive au fil des étapes. Le coach voit d'un coup d'œil les étapes les
plus dangereuses (pic de gap max) ou les plus engagées (pic d'aide).

**Nouveau composant** `src/components/MetricsChart.tsx` :
- 4 métriques sélectionnables : `maxGap`, `paintCoverage`, `lateCount`,
  `helpFactorTotal`.
- Affichage SVG fait main (pas de lib charting — overkill pour un mini-graphe).
- Marqueur rouge sur le step actif (ligne verticale en pointillés).
- Clic sur un point = navigation au step (`onSetActiveStep`).
- Tooltip natif au hover : `Étape N — métrique: valeur`.
- État replié par défaut (bouton "📈 graphique métrique" en bas-droite
  de la timeline). Quand déplié, sélecteur de métrique + bouton ✕.

**Performance** : à chaque render, `effectiveDefensePositions` est appelée
pour chaque step (déjà memoizée via WeakMap dans engine), puis
`computeMetrics` (pure). Mémoizé sur `[state, metric]`.

**Câblage** dans `page.tsx` : ajouté juste après `MetricsBar` (qui montre
l'étape active). Reçoit `state`, `activeStep`, `onSetActiveStep`.

Pas de tests dédiés (composant React purement présentationnel). Les
fonctions appelées (`computeMetrics`, `effectiveDefensePositions`) sont
déjà testées.

Roadmap : `#3 Graphique de métriques` marqué 🟢.

### UX — Templates défensifs utilisateur

Permet de sauvegarder ses **propres presets défensifs** (snapshot
des réglages courants : rules, screen, off-ball, triggers, distance,
maxSpeed, closeout, denial + B1-B10) sous un nom et les recharger.

**Stockage** : étend `UserLibrary` existante (déjà persistée localStorage
via `useLibrary`) avec un champ `defensePresets?: UserDefensePreset[]`.
Pas de nouveau storage à gérer.

**Nouveaux helpers purs** dans `src/lib/data/library.ts` :
- `snapshotDefensePreset(state, name, description?)` : capture les
  champs défensifs courants (16 champs au total).
- `applyUserDefensePreset(state, preset)` : applique sur un AppState,
  conserve steps + activeStep + attaquants.
- `addDefensePreset` / `deleteDefensePreset` / `renameDefensePreset` :
  CRUD pures sur la `UserLibrary`.

**Hook `useLibrary`** : nouveaux callbacks `saveDefensePreset` /
`loadDefensePreset` / `deleteDefensePreset` / `renameDefensePreset`.

**UI** : nouvelle sous-section "✚ Mes presets" dans `DefensePanel`,
sous les presets globaux. Bouton "💾 sauvegarder" qui prompt un nom et
capture l'état actuel. Liste des presets perso avec :
- Bouton 👤 [nom] pour appliquer (avec confirm)
- Bouton 🗑 pour supprimer (avec confirm)
- Distinction visuelle : presets globaux en bleu, presets perso en
  vert (`bg-green-50`, border `bbf7d0`)

**Câblage** dans `page.tsx` : extraction du patch défensif via destructuring
+ application via `app.patch(defensePatch)` (préserve steps + UI).

**Tests** : 10 unitaires sur le snapshot + apply + CRUD (création,
ajout multiple, suppression, renommage, no-op id inconnu, deep clone
des rules, préservation closeoutBoost). **678 → 688 tests verts**.

Roadmap : `#5 Templates utilisateurs` marqué 🟢.

### UX — Saisie numérique sur les sliders

Le composant `<Slider>` partagé (`src/components/ui.tsx`) gagne un
`<input type="number">` à droite du range. Permet de taper une valeur
exacte au clavier plutôt que viser au curseur.

**Comportement** :
- Le slider et l'input partagent la même `value` propulsée par le parent.
- Pendant la frappe : buffer local non clampé (n'interrompt pas la saisie).
- Validation au **blur**, **Enter**, ou re-perte de focus : clamp dans
  `[min, max]` puis snap au `step`.
- **Escape** : annule la saisie en cours, retour à la dernière valeur.

Tous les sliders du moteur en bénéficient automatiquement (distance défense,
maxSpeed, helpPct par défenseur, ballPressure / rotationSpeed /
verticalOffset zone, hedgeAggression, etc.) — pas de modification côté
caller.

**Tests** : pas de tests dédiés (composant React purement présentationnel,
testé indirectement via les 678 tests existants qui couvrent les flux qui
manipulent les valeurs). TS clean.

Roadmap : `#1 Saisie numérique sur les sliders` marqué 🟢.

### B6 — Dig / double au post

Couverture défensive auto sur post-up. Quand un attaquant est posté en
low post (trigger `post` actif), un défenseur "low man" peut digger
(faux help) ou doubler activement.

**Nouvelle couche** `defense/postCoverageLayer.ts` (4.5 du pipeline,
entre `trapLayer` et `directiveLayer`) :
- Identifie le carrierDef (reste sur le pivot) et le digger candidat
  (défenseur ≠ carrierDef le plus proche du pivot, helpFactor < 0.5,
  pas de pnrRole).
- 'dig' : digger fait 30 % du chemin vers le pivot + helpFactor = 0.6
  + pnrRole = 'stunt' (anneau bleu pâle visu).
- 'double' : digger fait 50 % du chemin + helpFactor = 0.9 (anneau
  help violet plein).

**Setting** : `state.postCoverage?: 'none' | 'dig' | 'double'`
(default `'none'`, opt-in). Requiert aussi `state.triggers.post = true`
pour que le post soit détecté.

**Tests** : 4 (none = no-op, dig rapproche, double > dig, sans trigger =
no-op). **674 → 678 tests verts**.

Roadmap : B6 marqué 🟢. **Liste B complète (B1-B10) entièrement livrée**.

### B10 — Bumping cutters automatique

Réaction défensive auto sur cuts non marqués : un défenseur sur la
trajectoire prev → cur du cutter reçoit un offset de 12px **vers le
cutter** (effet "léger contact"). Filet de sécurité quand le cutter
n'est marqué par personne directement.

**Nouvelle couche** `defense/cutterBumpLayer.ts` (5.5 du pipeline,
entre `directiveLayer` et `postPassOrientationLayer`) :
- Utilise `detectCuts` (déjà existant) pour identifier les cuts.
- Filtre les bumpers candidats : ≠ cutterDef (déjà sur le cutter),
  `helpFactor` < 0.3 (pas occupé en aide active), pas de `pnrRole`.
- Critère perpendiculaire : ≤ 40px de la ligne prev → cur du cutter.
- Au max 1 bumper par cut (le plus proche).

**Setting** : `state.autoBumpCutters?: boolean` (default `false`, opt-in
pour préserver la rétrocompat).

**Tests** : 4 (default off = no-op, activé = au moins 1 défenseur shifté,
cutterDef intact, cutter statique = no-op). **670 → 674 tests verts**.

Roadmap : B10 marqué 🟢.

### B9 — Top-lock off-ball avec timing

Quand un cutter sort son **2ᵉ écran consécutif** (chaîne ≥ 2), la
couverture `top-lock` (verrouillage côté ballon) devient inadaptée — le
cutter est déjà décollé du verrouillage initial. Bascule automatique
vers `chase` (trail derrière le shooter) **pour ce cutter uniquement**.

**Nouveau module** `screens/cutterScreenChain.ts` :
- `countCutterScreenChain(state, stepIdx, cutter, depth=3)` : compte les
  écrans off-ball détectés sur les K derniers steps impliquant le cutter.
- `cuttersInScreenChain(state, stepIdx, candidates, depth, threshold)` :
  retourne le Set des cutters au-dessus du seuil (default 2).

**Câblage** dans `defense/offBallScreenLayer.ts` :
- Calcul une fois par couche (Set partagé entre les écrans détectés)
- `effectiveRule` par cutter : `'top-lock' → 'chase'` si dans la chaîne
- Tous les `applyOffBallScreenAdjustment` et `applySwitchOffBall` utilisent
  `effectiveRule` au lieu de `state.offBallScreenRule` directement

**Comportement** :
- Seul `state.offBallScreenRule === 'top-lock'` déclenche le calcul de
  chaîne (autres rules : pas d'overhead, ni de bascule).
- Cutters non en chaîne : top-lock classique conservé.
- Cutters en chaîne (≥ 2 écrans dans 3 steps) : `chase` appliqué.

**Tests** : 10 (7 helper unitaires + 3 d'intégration sur le pipeline
défense). **660 → 670 tests verts**.

Roadmap : B9 marqué 🟢.

### B8 — Switch policy granulaire (team-level)

Filtre additionnel par-dessus `screenRule = 'switch'` ou `'peel-switch'`.
Le coach choisit quels couples de défenseurs peuvent switcher :

- `'all'`  : switch tous matchups (default, rétrocompat)
- `'1-3'`  : seulement entre D1/D2/D3 (guards + wings)
- `'1-4'`  : sauf si l'un des deux est D5 (pivot protégé)
- `'none'` : annule tout switch (équivalent rule `'over'` etc.)

**Nouveau helper** `switchAllowed(policy, d1, d2)` dans
`defense/mismatchTracking.ts`. Câblé dans `defense/context.ts` :
chaque tentative de `applySwitch` est filtrée avant application.

**Setting** : `state.switchPolicy?: 'all' | '1-3' | '1-4' | 'none'` (default `'all'`).

**UI** : sélecteur dans `DefensePanel`, visible quand `screenRule ∈
{'switch', 'peel-switch'}`. Placé avant le bloc Scram (logique :
filtre policy d'abord, scram ensuite).

**Tests** : 10 (helper unitaire pour les 4 policies, intégration avec
6 scénarios : default, none, 1-3 sur D1↔D5, 1-4 sur D1↔D5, 1-4 autorise
D1↔D4, 1-3 autorise D1↔D2). **650 → 660 tests verts**.

Roadmap : B8 marqué 🟢.

### B5 — Empty side PnR

Détecte un PnR exécuté sur un côté du terrain où aucun autre attaquant
n'est présent. Couverture défensive optimale change : ice contre-indiqué
(pas de baseline à fermer → drive 1c0), under naturel (pas de skip pass).

**Helper pur** `screens/emptySidePnR.ts > isEmptySidePnR(screen, off, hoop)` :
projette les autres attaquants sur la perpendiculaire à l'axe poseur→panier
et vérifie qu'aucun n'est du même côté que le porteur. Tolérance ±5px pour
les attaquants sur l'axe (ne cassent pas le empty).

**Règle coach** `coachDiagnostics/rules/emptySidePnR.ts` :
- 'info' systématique si pattern détecté (contexte au coach)
- 'critical' si screenRule = `ice` (drive 1c0 imminent — recommander under/hedge)
- 'good' si screenRule = `under` ou `weak` (cohérent)

**Tests** : 5 (côté opposé pur, attaquant même côté = false, attaquants en
masse côté opposé, porteur sur l'axe, attaquants sur l'axe ignorés).
**645 → 650 tests verts**.

Roadmap : B5 marqué 🟢.

### B7 — Defensive 3 seconds (règle FIBA)

Diagnostic coach quand un défenseur stationne 3 steps consécutifs dans
la raquette sans marquer un attaquant proche (> 50 px = "à un bras"). Pas
de pénalité simulée — uniquement un signal au coach.

**Module** : `coachDiagnostics/rules/defensiveThreeSeconds.ts`. Récupère
les positions défensives et offensives aux 3 derniers steps via
`effectiveDefensePositions` (déjà memoizé). Émet 1 warning par défenseur
qui viole la règle.

**Tests** : 4 (no history, violation 3 steps, marqueur proche, sortie de
raquette intermédiaire). **641 → 645 tests verts**.

Roadmap : B7 marqué 🟢.

### B4 — Snake dribble detection

Détecte le pattern offensif où le porteur **utilise l'écran, recule, et
re-utilise le même écran** (V-shape sur 3 steps). Différent de B2 :
reject = refus sans contact, snake = double usage avec retraite au milieu.

**Algorithme** (V strict sur 3 steps) :
- Step N-2 : carrier engagé sur poseur (distance ≤ `screenRadius × 2`)
- Step N-1 : retraite réelle (distance vs N-2 ≥ 25 px)
- Step N : ré-engagé sur poseur (distance vs N-1 ≤ -25 px, ET ≤ `screenRadius × 2`)
- Mouvement du porteur ≥ 25 px sur **chaque** segment (pas le total — un
  snake parfait revient PILE à sa position d'engagement)
- Le candidat retenu = celui qui maximise `upDelta + downDelta` (V le plus
  prononcé). Permet de distinguer 2 écrans concurrents.

**Nouveau module** `src/lib/logic/screens/detectSnakeDribble.ts`, exporté
via le barrel `screens/`. Retourne `SnakeDribble | null` avec les IDs + les
3 distances (entry / peak / return) pour le diagnostic.

**Nouvelle règle coach** `coachDiagnostics/rules/snakeDribble.ts` :
- 'warning' si V très marqué (peak > 1.5 × entry)
- 'info' sinon, avec les 3 valeurs de distance affichées

**V1 — diagnostic-only**. V2 : la défense devrait maintenir la couverture
engagée pendant la retraite plutôt que de re-armer à zéro.

**Tests** : 8 unitaires (no history, V parfait, micro-jitter, retraite
insuffisante, pas de ré-engagement, pas d'engagement initial, choix du V
le plus marqué entre 2 candidats, mapping matchups).
**633 → 641 tests verts**.

Roadmap : B4 marqué 🟢 (V1). Liste B critiques (B1-B4) entièrement traitée.

### B2 — Reject screen detection

Détecte le pattern offensif où le porteur **refuse l'écran** anticipé par
la défense (jab + drive opposé). La défense reste piégée par-dessus
l'écran qui n'a pas eu lieu.

**Algorithme** (4 critères tous obligatoires) :
1. Le porteur a bougé ≥ 25 px entre N-1 et N
2. À N-1, un attaquant ≠ porteur était dans `screenRadius × 1.5` du
   défenseur du porteur ET dans 80 px du porteur (= candidat poseur)
3. Le mouvement du porteur a une composante opposée au poseur (dot ≤ -0.3)
4. La distance porteur ↔ poseur a augmenté d'au moins 20 px

**Nouveau module** `src/lib/logic/screens/detectRejectedScreen.ts`,
exporté via le barrel `screens/`. Retourne `RejectedScreen | null` avec
les IDs concernés (carrier/screener/leurs défenseurs) + métriques.

**Nouvelle règle coach** `coachDiagnostics/rules/rejectedScreen.ts` :
- 'warning' si reject **sharp** (dot ≤ -0.7 = retraite directe)
- 'info' si reject de marge (dot dans [-0.7, -0.3])
- Messages typés vocabulaire coach ("Reject écran : O1 refuse O5 et vire
  opposé — défense sur-anticipée").

**V1 — diagnostic-only** : la défense n'est pas modifiée par la détection.
Le coach voit l'analyse a posteriori. V2 (plus tard) : ajuster la
couverture pour ne pas sur-anticiper (mémoire d'intent).

**Tests** : 9 unitaires (no prevOff, mouvement insuffisant, reject net,
reject sharp, approche normale, pas de candidat, divergence insuffisante,
mouvement perpendiculaire = pas un reject, mapping screenerDef).
**624 → 633 tests verts**.

Roadmap : B2 marqué 🟢.

### B3 — Hard hedge vs soft hedge

Sépare l'axe **quality** (qualité de l'écran posé, côté offense) de l'axe
**aggression** (intensité de la sortie défensive, côté défense). Avant,
les deux étaient conflés sur `q` → impossible de combiner un excellent
écran avec une couverture soft show, ou un écran moyen avec un hard hedge.

**Nouveau setting** : `state.hedgeAggression?: number` (0..100, default 50).

**Comportement** :
- `aggression = 0` (soft show) : D5 sort à 25px du porteur, recover vite
- `aggression = 50` (standard) : équivalent ancien comportement
- `aggression = 100` (hard hedge) : D5 sort à 60px DEVANT O1, barricade

**Indépendance des axes** : le `blendFactor = q × hedgeAgg`. Un écran
fantôme (q=0) reste fantôme même en hard hedge ; un écran solide (q=1)
avec soft show reste un show timide.

**UI** : slider "agressivité" dans `DefensePanel`, visible uniquement
quand `screenRule === 'hedge'`.

**Tests** : 5 nouveaux (soft, hard, monotone sur distance au poseur,
indépendance vs quality, default). **619 → 624 tests verts**.

Roadmap : B3 marqué 🟢.

### B1 — Mismatch tracking + scram switch

Détection automatique des mismatches créés par un switch porteur, avec
correction optionnelle par **scram switch** (3ᵉ échange défensif).

**Nouveau module** `src/lib/logic/defense/mismatchTracking.ts` :
- `defenderRank(D1..D5)` / `attackerRank(O1..O5)` → 1..5 (1 meneur, 5 pivot)
- `mismatchSeverity(d, a)` = `|defenderRank - attackerRank|`, range 0..4
- `applyScramSwitch(matchups, screen, off, def, options)` :
  - Identifie le pire mismatch post-switch (tie-break : côté porteur)
  - Cherche un défenseur tiers ≤ 200px de l'attaquant exposé
  - Applique un 2ᵉ swap si la réduction du **pire** mismatch est ≥ 2
  - Refuse si le candidat lui-même crée un nouveau mismatch > seuil

**Câblage** dans `src/lib/logic/defense/context.ts` : après `applySwitch`
classique, si `state.scramSwitchEnabled` est true, on tente le scram.
Résultat propagé via `ctx.scrammedSwitch` aux couches en aval.

**Settings** (nouveaux champs `AppState`) :
- `scramSwitchEnabled?: boolean` (default `false`, opt-in)
- `mismatchThreshold?: number` (default 2 = mismatch D5↔O3 minimum)
- `showMismatchBadges?: boolean` (default true)

**Propagation** : `ComputedDefender` gagne `mismatchSeverity?` et
`scrammedThisStep?`. Affichés à chaque step y compris en l'absence de
scram (sert au coach pour repérer les bad matchups manuels).

**Visuel** : nouveau badge sous le sprite défenseur — orange (severity 2),
rouge (≥3), bleu "SCRAM" si scram appliqué. Toggle global possible.

**Diagnostic coach** enrichi (`switchMismatch.ts`) :
- Scram appliqué → 'good' avec phrase explicative (qui prend qui)
- Severity ≥ 3 → 'critical' (mismatch extrême à exploiter)
- Severity ≥ threshold → 'warning' (avec valeur de severity affichée)
- Severity < threshold → 'info' (switch neutre)

**Settings UI** : nouveau bloc dans `DefensePanel` (visible uniquement
quand `screenRule ∈ {'switch', 'peel-switch'}`) — toggle + sélecteur de
seuil (1 = tout switch corrigé, 4 = scram seulement sur mismatch extrême).

**Tests** : 12 unitaires sur `mismatchTracking` (rank/severity/scram) +
5 d'intégration sur le pipeline complet. **602 → 619 tests verts**.

Roadmap : B1 marqué 🟢 (premier item de la liste B audit défensif livré).

### Modularité — découpage des gros fichiers

Refonte structurelle visant à **réduire le risque** de chaque nouvelle feature
basket. Les fichiers les plus volumineux ont été éclatés en sous-modules
cohérents sans changer l'API publique. Documentation détaillée :
[docs/refactoring-history.md](./docs/refactoring-history.md).

| Fichier | Avant | Après | Modules extraits |
|---|---:|---:|---|
| `lib/logic/scriptedGenerators.ts` | 1502 | 92 | helpers + tier1/2/3 |
| `hooks/useAppState.ts` | 967 | 510 | 8 namespaces `lib/state/transforms/` (purs) |
| `components/CourtView.tsx` | 902 | 446 | `useCourtFrame` · `useCourtPointerHandlers` · `<CourtPlayersLayer>` · `<CourtMenus>` |
| `components/ContextMenu.tsx` | 897 | 22 | popupHooks + ToolBar + sharedRows + DefenderMenu + AttackerMenu |
| `lib/logic/screens.ts` | 822 | barrel | helpers + 2 detect + 2 adjust |
| `lib/logic/coachDiagnostics.ts` | 834 | barrel + 13 rules | registry pattern, 1 fichier par règle |

Pas de changement de comportement runtime, **602 tests verts** (+61 nouveaux
tests sur les transforms purs `useAppState`, possibles depuis l'extraction
en fonctions pures — cf. `src/lib/state/__tests__/`).

### Étapes 2 à 5 — Réflexes défensifs avancés en zone

Refonte significative de la défense de zone pour encoder les principes basket fondamentaux qui doivent l'emporter sur la simple ownership géométrique. Documentation : [docs/logique-defensive.md > Réflexes défensifs avancés](./docs/logique-defensive.md#réflexes-défensifs-avancés-étapes-2-4).

#### Étape 2 — Désignation de couvreurs (zone)
- **2.a `designatedCoverer`** : un attaquant isolé en zone-tueuse (high-post / short-corner sans coéquipier <80px) déclenche une désignation explicite du défenseur le plus proche par homePos. Boost ×4 sur sa claim, bias home (40% vers attaquant pour high-post). Empêche la dilution d'ownership entre 5 défenseurs concurrents.
- **2.b `paintCoverage`** : nouveau slider `ZoneConfig.paintCoverage` (0-100, défaut 50) qui module l'agressivité des boosts désignation.
- **2.c `isHighPost` élargi** : couvre maintenant la "tête de raquette" complète (`verticalFromHoop ∈ [80, 200]` vs `[130, 200]` avant).
- **2.d `baselineDriveCoverer`** : nouveau module `baselineDrive.ts` détecte les attaques ligne de fond non fermées. Désigne le wing low côté ballon. Diagnostics coach `baseline-drive-open/soft/late/closed`.
- **2.e `ballPressureCoverer`** : LE défenseur structurellement responsable de presser le porteur. Front-row si ballon haut, back-row si bas. Préfère le défenseur du même côté que le ballon. Boost ×2.5 + bias home + seuil engagement abaissé.

#### Étape 3 — Réflexes basket universels
- **3.a `rimProtectorByThreat` ("pas d'easy basket")** : nouveau module `threatResolution.ts` avec `detectFreePathThreats`. Pour chaque attaquant à <220px du panier sans défenseur sur la trajectoire, désigne le défenseur disponible le plus proche du panier. Slider `rimProtection` (0-100).
- **3.b `detectCuts`** : détection des coupes hors-ballon vers le panier (Δ dHoop > 25, exclut les screeners). Diagnostic coach `cut-backdoor`.
- **3.c Step-up préventif** : `detectFreePathThreats` étendu pour détecter les drives en cours (220-280px avec mouvement vers panier). Réaction défensive AVANT que l'attaquant arrive sur le panier.
- **3.d `detectMatchupOrphans`** : signale via diagnostic coach les défenseurs en aide loin de leur home dont le matchup naturel n'est plus couvert.

#### Étape 4 — Axe central et recover
- **4.a Weakside paint sag** : `ballSideShifted` étendu — les défenseurs côté faible glissent vers l'**axe central** (x=300, pull ×0.8) ET vers le panier en Y (×0.4). Engagement réduit ×0.5 si défenseur ET matchup tous deux weakside. Effet : D4 weakside passe de 121px à 98px de l'axe central.
- **4.b Recover boost** : défenseur sans rôle d'aide actif reçoit ×1.15 sur claim au matchup naturel. Pull-back actif après aide.
- **4.c Couche `applyRimProtectionLayer` en man defense** : nouvelle couche 1.5 du pipeline man-to-man qui applique le rim protection aux positions post-baseTargets. Filet de sécurité pour les edge cases (défenseur perdu via écran, switch).

#### Étape 5 — Pass denial
- **`detectOpenPassThreats`** dans `threatResolution.ts` : pour chaque attaquant non-porteur, vérifie si segment carrier→att libre (perpDist >60px). Désigne le défenseur naturel (baseMatchups) si disponible, sinon le plus proche de l'intercept (sous 220px).
- Slider `passDenial` (0-100, défaut 50) dans DefensePanel.
- Boost claim sur le receveur + bias home vers point d'interception. Skipé pour les receveurs déjà couverts par d'autres designations (évite les conflits, ex : pivot D5 ne fait pas un skip pass perimetric).

#### Architecture
- Toutes les désignations vivent dans `zoneDefense.ts` et sont calculées **avant** la boucle de claims, dans cet ordre (priorité décroissante) : `designatedCoverer` (high-post) → `baselineDriveCoverer` → `ballPressureCoverer` → `rimProtectorByThreat` → `passDenierByReceiver`.
- Mécanisme commun : un seul défenseur boosté par menace (pas de dilution), `unavailable: Set<DefenderId>` propagé entre détections pour éviter qu'un défenseur cumule plusieurs missions.
- Tests : 348 → **394 tests verts** (+46 tests, dont 22 dans `threatResolution.test.ts`, 9 nouvelles sections dans `zoneDefense.test.ts`, 3 dans `rimProtectionLayer.test.ts`).

#### Étape 10 — Édition continue tStart/tEnd (façon vidéo)
- `Annotation.tStart` et `tEnd` (0..1) définissent les bornes temporelles de l'action dans le segment de transition. Permet à des actions parallèles d'avoir des durées différentes.
- `attackerTrajectoryAt` mappe le temps global vers le temps d'action selon ces bornes : avant tStart le joueur reste à `from`, après tEnd à `to`.
- UI : poignées de drag invisibles (`cursor=ew-resize`) sur les bords des segments dans MultiTrackTimeline. Glisser horizontalement modifie tStart/tEnd en temps réel.
- Handler `setAnnotationTiming` avec clamp 0..1 et durée minimum 0.05 (anti-instabilité visuelle).
- Tests : 4 cas sur attackerTrajectoryAt (tStart à 0.5, tEnd à 0.5, [0.2, 0.6], défaut). 421 → **425 tests verts**.

#### Étape 11 — Pénalité de contact d'écran
- Le défenseur du porteur marqué `onScreen=true` reçoit désormais une pénalité de vitesse `×0.55` dans `speedConstraint` (en plus de la friction proximité et de l'allongement de path arc length).
- Représente le contact physique avec le poseur d'écran : le défenseur ne traverse pas instantanément, il négocie le contact (perd ~0.3-0.6 sec).
- Cumulé pire cas : `0.33 × maxSpeed` → D1 nettement late après l'écran, intuition basket respectée.
- Limité au défenseur du porteur (le screenerDef a son propre rôle hedge/show).

#### Étape 14 — PDF lisible quand les actions se chevauchent
- Sous chaque vignette d'étape : bandeau timecode (`0:04 → 0:08 (4.0s)`) + liste à puces des annotations parallèles avec leurs timings absolus et leur qualité d'écran.
- Symbole **★** sur les annotations à cheval sur la transition adjacente (`tStart<0` ou `tEnd>1`).
- Tag **(début)** sur les annotations `phase='start'`.
- Nouvelle section **Synoptique multi-pistes** (cochable, sur page séparée) : grille joueur × transition avec barres positionnées selon tStart/tEnd. Pour les écrans, la qualité est indiquée (`gh/lo/st/so/lk`).
- Helper `annotationSummary` extrait dans `src/lib/logic/pdfRecap.ts` pour testabilité.
- Tests : 11 nouveaux cas (formatage des annotations, qualité, phase, cross-step, secondsPerStep variable). 449 → **460 tests verts**.

#### Étape 15 — Refonte du réalisme des écrans (12 commits, 460 → 493 tests verts)

Sprint dédié à la correction du comportement défensif sur écran. Plusieurs constats du coach :
- D1 reculait visuellement, mais "recollait" l'attaquant trop vite (effet de glissement sans contact)
- En édition libre (un seul step), aucune pénalité n'agissait — D1 traversait l'écran et se collait à O1
- L'indicateur visuel d'écran disparaissait parfois (détection ratée)
- Au moindre micro-décalage du porteur autour de l'axe poseur→panier, D1 se téléportait de l'autre côté du poseur
- Pendant la lecture animée, D1 "glissait" sur le poseur sans vraie sensation de blocage

##### Diagnostic central

`followDefendersAtFrame` (chargé de re-glue chaque défenseur sur son homme en temps réel) **écrasait** la position calculée par le pipeline freeze/courbe/easing. Tout le réalisme calculé en amont était perdu à la dernière étape.

##### Corrections

**Détection & cibles**
- À step 0 (édition libre), `detectScreen` utilisait `defenseInitial` (loin du jeu) → poseur jamais détecté. Substitution par les cibles homme-à-homme idéales (`buildStep0DetectionPositions` extrait dans [step0Detection.ts](src/lib/logic/step0Detection.ts)), réutilisée par `context.ts`, `speedConstraint.ts`, `CourtView.tsx` et `frameResolver.ts`.
- Restoration de l'indicateur visuel `écran X → Y [rule]` à step 0 quand D1 ne peut physiquement pas atteindre le poseur.
- `sideOfCarrier` passe de `Math.sign(carrier.x - screener.x)` (discontinu) à la **projection du vecteur normalisé poseur→porteur sur l'axe perpendiculaire** — continu dans [-1, 1] : plus de téléport lors d'une traversée d'axe.

**Cibles déplacées vers le poseur**
- `applyScreenAdjustment` reçoit maintenant `quality` en 9ᵉ paramètre. À q=0 garde le comportement legacy (faux écran), à q=100 plaque D1 sur le poseur.
- Nouvelles positions par rule (D1 carrierDef) :
  - **over** : juste derrière le poseur côté basket (lag 5→30px selon q)
  - **hedge** : plaqué AU poseur, côté opposé au porteur (D1 littéralement bloqué)
  - **under** : derrière O1 côté opposé au basket (20→55px de lag)
  - **drop** : over léger, D5 prend la charge avec son drop profond
- D5 (screenerDef) en hedge agressif : sort DEVANT O1 côté basket (25→60px selon q) au lieu de juste à mi-chemin.
- Helper `pushOutOfCarrier` garantit ≥ MIN_PLAYER_CLEARANCE_PX (34px) entre défenseur et porteur dans toutes les rules — **plus de chevauchement visuel**, jamais.

**Routes route-aware**
- `curveAroundObstacle` accepte `forcedPushSign` pour imposer le côté de contournement selon la rule.
- `carrierScreenRoutePreference` et `offBallScreenRoutePreference` calculent la direction préférée selon over/under/hedge/drop/ice/chase/top-lock.
- `contactQualityForRule` module la durée de contact selon la rule basket-pertinente : under ×1.18, weak ×1.08, hedge ×1.05, over ×0.85, ice ×0.65, switch ×0.

**Animation continue (frame resolver)**
- Nouveau `screenContactT` (sigmoïde lisse, k=1→13 selon q) remplace l'ancienne fonction piecewise qui créait une discontinuité de vélocité au défige.
  - `arriving` (q=100) : effT atteint 0.95 à mi-transition puis plateau long
  - `leaving` (q=100) : D1 reste figé jusqu'à t≈0.7, puis rattrape en fin
  - `stuck` : freeze au milieu
- `carrierApexSlownessFromQuality` pousse à 0.99 à q=100 (quasi-pause au sommet du contournement).
- **`screenLockedDefenders: Set<DefenderId>`** : les défenseurs en contact écran sont passés à `followDefendersAtFrame(skipIds)` qui les SAUTE → leur position calculée (freeze + courbe + easing) n'est plus écrasée.

**Recover qui prolonge la pénalité**
- `isRecoveringFromCarrierScreen` détecte les défenseurs qui SORTAIENT d'un écran au step précédent et conservent une pénalité de vitesse au step suivant. Le temps perdu n'est plus instantané, il s'étale sur le step de recover.
- `previousCarrierScreenQualityByDef` mémorise la quality pour appliquer la bonne pénalité.

**Écrans non-porteur**
- Le mode `arriving`/`leaving`/`stuck` s'applique aussi au défenseur du cutter (`offBallContact`).
- `applyOffBallScreenAdjustment` over/chase : cutterDef placé à `MIN_PLAYER_CLEARANCE` du screener (au lieu d'un offset arbitraire 18-24px qui ne respectait pas le clearance).

**Speed constraint cohérent**
- À l'arrivée sur écran (`isCarrierDefScreenedThisStep`), bypass du clamping de vitesse — sinon D1 s'arrêtait paradoxalement EN AVANT du poseur. La pénalité s'applique uniquement au step de recover.

**Solveur de collisions**
- `resolvePlayerCollisions` reste avec exclusion `matchedTo` (préserve la défense "coller" normale). La clearance vs porteur est gérée en amont dans `applyScreenAdjustment` par `pushOutOfCarrier`.

##### Tests

Nouveaux fichiers et invariants ajoutés :
- `screenContactFrame.test.ts` : 8 tests de bout-en-bout via `resolveFrameAt`
  - D1 à t=0.5 doit être au contact du poseur (≤50px) avec clearance respectée (≥33px)
  - D1 à t=0.7 n'a pas encore récupéré
  - Trajectoire de D1 ne traverse JAMAIS le rayon du poseur
  - Recover : D1 reste `late` après un lockdown, pas après un ghost
  - Off-ball : D2 stuck sur O4 pendant un pindown
  - Multi-screen : D1 lit la qualité du bon poseur
- `screenFreeze.test.ts` : 8 tests sur la sigmoïde (monotonie, continuité, dérivée bornée)
- `screenQuality.test.ts` : 7 tests sur `screenPenaltyFromQuality`
- `curveAroundObstacle.test.ts` : 4 + 1 tests (apex slowness + `forcedPushSign`)
- `screens.test.ts` : +9 tests sur les nouvelles cibles par rule, l'invariant de non-chevauchement (toutes rules × toutes qualities), la continuité de position autour de l'axe poseur→panier

**460 → 493 tests verts** (+33).

##### Limites encore ouvertes

- **État de contact écran multi-phase explicite** : actuellement encodé via les flags `onScreen` de defA/defB + le mode (arriving/leaving/stuck). Un vrai modèle de phase (approche → impact → arrest → contournement → recover) avec durées propres reste à concevoir.
- **Indicateur visuel dédié** : D1 affiche son anneau `isCarrierDefender` qui masque l'état "contact écran". Un badge spécifique "stuck"/"recover" aurait sa place.
- **Off-ball : pas encore de mémoire de retard au step suivant** : le `isRecoveringFromCarrierScreen` ne couvre que le carrier defender. Étendre au cutter defender (pindown, flare, stagger, hammer) reste à faire.

#### Étape 13 — Timecode (24s possession)
- Nouveaux champs `AppState.secondsPerStep` (défaut 4) et `possessionSeconds` (défaut 24).
- Module `src/lib/logic/timecode.ts` : `realStepToSeconds`, `shotClockAt`, `totalDurationSeconds`, `formatClock`, `formatShotClock`.
- Affichage MM:SS écoulé / total dans la Timeline + badge shot clock cliquable (jaune sous 5s, rouge en violation).
- Headers de la MultiTrackTimeline annotés avec le temps de chaque transition (`0.0s`, `4.0s`...).
- Réglages dans le panneau Paramètres : `s / étape` et `possession` (input numériques).
- Le moteur reste step-based : ces utilitaires sont uniquement pour l'AFFICHAGE.
- Tests : 16 nouveaux cas (formatage, conversion, clamp, steps interpolés). 433 → **449 tests verts**.

#### Étape 12 — Qualité d'écran (0-100)
- Nouveau champ `Annotation.quality` (0-100, défaut 50) sur les annotations `type='screen'`. Module la pénalité Étape 11 :
  - **0 (ghost)** : ×1.00 — faux écran, le défenseur passe sans ralentir.
  - **25 (loose)** : ×0.78 — léger frôlement (~0.2s perdues).
  - **50 (standard, défaut)** : ×0.55 — comportement Étape 11 inchangé.
  - **75 (solid)** : ×0.32 — écran tight, défenseur sensiblement late.
  - **100 (lockdown)** : ×0.18 — D1 quasi-stoppé (~1.2s).
- Courbe linéaire par morceaux `screenPenaltyFromQuality(q)` exportée par `speedConstraint`.
- UI : badge cliquable `ghost/loose/std/solid/lock` sur chaque segment screen du MultiTrackTimeline. Clic cycle 0→25→50→75→100.
- Handler `setAnnotationQuality(stepIdx, annoIdx, quality)` exposé par `useAppState`.
- Tests : 7 nouveaux cas sur `screenPenaltyFromQuality` (clamp, monotonie, points de référence). 426 → **433 tests verts**.

#### Étape 10b — Segments à cheval sur plusieurs étapes
- `tStart` peut désormais être < 0 (jusqu'à -1) et `tEnd` peut être > 1 (jusqu'à 2), permettant à une action de s'étendre dans la transition précédente ou suivante.
- `attackerTrajectoryAt` regarde les annotations sur les steps `idxA` ET `idxA+1` pour identifier les actions actives à un temps global donné (fenêtre [absStart, absEnd] = anchor + tStart, anchor + tEnd).
- UI : `overflow: visible` sur les cellules + `z-index` sur les segments pour les laisser déborder. Les poignées de drag acceptent les ratios hors [0, 1] et clampent côté state à [-1, 2]. Box-shadow autour du segment quand il déborde pour le repérer.
- Cas d'usage : un écran qui se pose pendant la fin du dribble du porteur (l'action démarre `tStart=-0.4` avant son anchor → D1 peut déjà commencer à le prendre).
- Test : 1 nouveau cas cross-step (tStart=-0.4, vérification position aux deux transitions). 425 → **426 tests verts**.

#### Étape 8 — Multi-track timeline + Étape 9 — Phase début/fin
- Nouveau module `playerTracks.ts` qui calcule pour chaque joueur ses segments d'activité à travers les étapes (idle, dribble, cut, screen, pass / pos, tracking, closeout, help).
- `PlayerTimelineModal` (popup zoom) + `MultiTrackTimeline` (docké en bas, façon Premiere) avec curseur vertical synchronisé temps réel et clic pour sauter à un step.
- Toggle "▲ pistes" à côté de la Timeline principale pour déplier/replier.
- Steps interpolés fusionnés dans la vue (pas de bruit visuel).
- Étape 9 : `Annotation.phase: 'start' | 'end'`. Permet de dire au moment du dessin si l'écran/cut/dribble est actif **dès le début** de l'étape (mouvement effectué dans la transition précédente) ou **à la fin** (mouvement effectué pendant cette étape). Bouton ◀/▶ sur les segments du multi-track pour basculer en place.
- `setAnnotationPhase` resynchronise les positions des étapes concernées (`step N-1`, `step N`, `step N+1`).
- Tests : `playerTracks.test.ts` (8 cas) + 2 nouveaux sur `upsertMovementAnnotation` (phase=start). 411 → **421 tests verts**.

#### Étape 7 — Branches manuelles de scénario
- Nouveau type `ScenarioBranch` ([types/index.ts](./src/lib/types/index.ts)) : variante terminale qui diverge après une action donnée du chemin principal.
- `AppState.scenarioBranches: ScenarioBranch[]` + `activeBranchId: string | null` + `pdfIncludeBranches: boolean`.
- `compileScenario(activeBranch?)` : si fournie, compile les actions du main jusqu'à `divergeAfterActionId` inclus puis continue avec `branch.actions`. Fallback graceful sur référence invalide.
- Handlers `addScenarioBranch`, `updateScenarioBranch`, `deleteScenarioBranch`, `setActiveBranch`. Les handlers d'actions existants deviennent **branch-aware** (routent vers `branch.actions` quand une branche est active).
- UI [`ScenarioPanel.tsx`](./src/components/ScenarioPanel.tsx) : sélecteur de tabs en haut (Principal + une par variante, double-clic pour renommer, × pour supprimer), bouton "+ variante" sur chaque action du main, bandeau d'info en mode branche active.
- UI [`PlaybookView.tsx`](./src/components/PlaybookView.tsx) : toggle "variantes" qui ajoute une section par branche dans le PDF (page-break avant chaque). Steps interpolés filtrés.
- V1 : un seul niveau (pas de sous-branches). Affichage simultané (split view) noté pour V2 dans [docs/ideas.md](./docs/ideas.md).
- Tests : `scenarioBranches.test.ts` (6 cas : sans branche, simple, multi-actions, invalide, vide). 401 → **406 tests verts**.

#### Étape 6 — Décomposition des téléports
- **`breakUpTeleports()`** ([`breakUpTeleports.ts`](./src/lib/logic/breakUpTeleports.ts)) appliqué après compilation. Si un joueur bouge >100 px entre deux steps, on insère des steps interpolés.
- Nouveau champ `Step.isInterpolated: boolean` marque les steps phantômes.
- UI : `OffensePanel` masque les interpolés de la liste utilisateur ; `Timeline` les affiche en gris/petit.
- Tests : 394 → **401 tests verts** (+7 nouveaux dans `breakUpTeleports.test.ts`).

#### Sliders zone disponibles dans DefensePanel
| Slider | Champ | Effet |
|--------|-------|-------|
| pression bal. | `ballPressure` | Pression sur porteur (ballPressureCoverer) |
| vit. rotation | `rotationSpeed` | Vitesse de mouvement de la zone |
| position vert. | `verticalOffset` | Décalage vertical des homePos |
| aide raquette | `paintCoverage` | Couverture zones-tueuses (high-post, short-corner, baseline) |
| protect. panier | `rimProtection` | Free-path threats (pas d'easy basket) |
| deny passes | `passDenial` | Fermeture des lignes de passe ouvertes |

### Refactor — Découpage du moteur défensif en couches isolées (engine.ts : 982 → 117 lignes)

`src/lib/logic/engine.ts` était devenu un "gravity well" mélangeant calcul des cibles défensives, ajustements playback, calcul d'orientation des attaquants, détection d'événements tactiques, et contrainte de vitesse. Le tout dans une seule grosse fonction `computeDefenseTargets` (~290 l) + un `effectiveDefensePositions` (~235 l) qui partageaient des dizaines d'imports. Découpage en pipeline de couches indépendantes, chacune testable en isolation.

**Fichiers extraits** (toutes nouvelles factorisations, comportement bit-identique, 336 tests verts à chaque commit) :

- **`defense/types.ts`** — type partagé `DefenderTarget` (sortie de `computeDefenseTargets`, entrée de `effectiveDefensePositions`).
- **`defense/context.ts`** — `DefenseFrameContext` + `buildDefenseFrameContext()`. Setup phase : matchups, prevDefenderPositions, écran porteur, switch/peel-switch, triggers, ballSide. Mute `step.switches` pour persistance.
- **`defense/baseTargets.ts`** — couche 1, base man-to-man + help (sag uniquement) + screen-on-target adjustment + offset latéral manuel + orientation initiale.
- **`defense/pnrLayer.ts`** — couche 2, rotations PnR (low-man tag + X-out + nail stunt) sur roll/short-roll/slip.
- **`defense/offBallScreenLayer.ts`** — couche 3, écrans hors-ballon (mute matchups en cas de switch off-ball).
- **`defense/trapLayer.ts`** — couche 4, trap auto en zone de trappe.
- **`defense/directiveLayer.ts`** — couche 5, directives défensives scriptées (`step.defensiveDirectives`).
- **`defense/postPassOrientation.ts`** — couche 6, recalcul orientation final depuis les positions ajustées (pour que low-man tag pointe la zone de menace, pas son homme original).
- **`defense/zoneTargets.ts`** — branche zone du calcul (ownership polygonal + tracking d'attaquant).
- **`defense/speedConstraint.ts`** — `effectiveDefensePositions` : contrainte vitesse max + closeout/over-closeout + friction de proximité + clusters d'écran + collisions.
- **`defense/frameAdjust.ts`** — `followDefendersAtFrame` + `recomputeDefenseFrameOrientations` (post-passes appliquées sur ComputedDefense pendant le playback, consommées par `frameResolver`).
- **`attackerVisuals.ts`** — `computeAttackerVisuals` (orientation des attaquants par rôle : carrier/passer/cutter/screener/idle).
- **`events/triggerDetector.ts`** — `detectStepScreenAction` (détection écran porteur + classification d'action : roll/pop/slip/short-roll/ghost/reject/snake/re-screen).

**Pipeline de `computeDefenseTargets`** réduit à 25 lignes orchestrateur :
```ts
const { ctx, matchups } = buildDefenseFrameContext(state, stepIdx, mutateStepForSwitch);
const positions = {};
applyBaseTargetsLayer(positions, matchups, ctx);   // 1
applyPnRRotationsLayer(positions, matchups, ctx);  // 2
applyOffBallScreenLayer(positions, matchups, ctx); // 3
applyTrapLayer(positions, matchups, ctx);          // 4
applyDirectiveLayer(positions, ctx);               // 5
applyPostPassOrientationLayer(positions, ctx);     // 6
```

**Bénéfice** : chaque couche est isolée derrière une signature claire `(positions, [matchups,] ctx) → void`. Modifier une règle d'aide (couche 1) ne risque plus de casser le PnR (couche 2) silencieusement. Ajouter une 7ᵉ couche (ex : communication défensive) = un fichier + une ligne dans le pipeline. L'ordre des couches est explicite et documenté.

Re-exports gardés sur `engine.ts` pour préserver l'API publique consommée par CourtView, frameResolver, app/page.tsx, coachDiagnostics, tacticalReads, etc. Aucune migration côté caller.

### Refactor — Extraction de la logique playback de CourtView (1222 → 811 lignes)

`CourtView.tsx` mêlait la boucle d'animation, le calcul de frame interpolée (défenseurs + attaquants + ballon + orientations + collisions) et le rendu SVG. Les boucles play (220 l) et scrub (170 l) dupliquaient ~95 % de leur logique.

- **`src/lib/logic/playback/frameResolver.ts`** — `resolveFrameAt(state, t)` fonction pure qui calcule une frame complète à un instant fractionnaire. Sert pour la lecture continue ET le scrub. Plus de divergence silencieuse possible entre play et scrub.
- **`src/hooks/usePlaybackAnimation.ts`** — boucle setInterval ~30 fps + conversion elapsed → t + fin de lecture. Ne calcule pas la frame (délégué au resolver).
- **`src/components/overlays/`** — les 10 fichiers d'overlay (HeatmapOverlay, FieldOfViewOverlay, PassLanesOverlay, ThreatOverlay, etc.) regroupés sous un sous-dossier `overlays/` (move via `git mv`, historique préservé). `Overlays.tsx` renommé en `MatchupAndScreenOverlays.tsx`. `GhostLayer` extrait inline → fichier dédié.

### Refactor — Centralisation des constantes physiques + helpers angulaires

- **`src/lib/data/court.ts`** enrichi : `COURT_CENTERLINE_X = 300`, `CARRIER_SIDE_TOLERANCE_PX = 30`, et 5 offsets `PLAYER_*` (PLAYER_OBSTACLE_RADIUS_PX, PLAYER_PICK_RADIUS_PX, PLAYER_CLUSTER_BASE_R_PX, PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_MIN_CLEARANCE_PX). Remplace les `PLAYER_RADIUS + N` éparpillés dans CourtView, Annotations, engine.
- **`src/lib/constants/gameplay.ts`** (nouveau) — `DRIBBLE_THRESHOLD_PX = 30`, `POST_HOLD_THRESHOLD_PX = 30`. Distincts des constantes terrain car ils décrivent des comportements joueur, pas une géométrie.
- **`src/lib/logic/angles.ts`** (nouveau) — `normalizeAngle`, `angleDiff`, `lerpAngleDeg` dédupliqués entre `orientation.ts` et `vision.ts`. **Ces deux modules restent strictement séparés** : seul le math angulaire pur est mutualisé. `vision.ts` (champ de vision, gaze locks) et `orientation.ts` (corps, bras, anatomie) sont deux concepts distincts.
- **`scriptedGenerators.ts`** — helper privé `carrierBaseSign(carrier)` remplace les 7 occurrences inline `carrier.x < 300`.

### Changed — Refonte du panneau Défense pour colonne étroite (plus de débordement)
- Section **"Appliquer à tous"** : abandon de la grille 6 colonnes (qui forçait une largeur min ≥ ~340 px et débordait sur écrans en colonne étroite). Refondue en layout vertical compact : label gauche fixe (80 px) + control qui s'étire sur le reste, via les helpers `MassRow` et `MassSelect`. Tient maintenant proprement dans n'importe quelle largeur de colonne ≥ 200 px.
- Section **"Règles individuelles"** : grille passée de `1fr 1fr 1fr 1fr` à `minmax(0,1fr) ... minmax(0,1fr)` pour accepter la compression CSS, et `min-width: 0; width: 100%; box-sizing: border-box` ajouté à tous les `<select>` pour qu'ils se compressent au lieu de pousser leur conteneur.
- Bouton "Réinitialiser les overrides individuels" passe en `width: 100%` pour s'aligner sur le bloc.
- Implémentation : [`DefensePanel.tsx`](src/components/DefensePanel.tsx).

### Fixed — Téléportation du défenseur du futur porteur lors d'une passe scriptée
- Sur un scénario type **give-and-go** (O1 passe à O3 puis coupe vers le panier), pendant la transition de balle entre l'étape A (porteur=O1) et l'étape B (porteur=O3), `followDefendersAtFrame` plaçait D3 sur O1 au lieu de O3 — apparence de "téléportation" de D3 vers le centre du terrain.
- Cause : `slot.isCarrierDefender` est hérité de l'étape B (donc D3 est marqué carrier-defender pour l'étape suivante), mais `ballCarrier` interpolé selon `localT < 0.5` valait encore O1 → on tirait D3 sur O1 alors qu'il défendait son propre homme O3 qui allait recevoir la balle.
- Fix : `followDefendersAtFrame` suit désormais **`slot.matchedTo`** (l'homme assigné) au lieu de `ballCarrier`. Si l'homme assigné est le porteur courant → comportement carrier-defender, sinon off-ball — sans téléportation. Implémentation : [`engine.ts`](src/lib/logic/engine.ts).

### Added — Pilotage défensif en masse depuis le DefensePanel
- Nouvelle section **"Appliquer à tous les défenseurs"** dans le panneau Défense (au-dessus de "Règles individuelles") qui pousse une consigne sur **tous les défenseurs en un clic**. Évite les 5 clics-droits successifs pour aligner toute l'équipe sur un schéma.
- Réglages exposés en masse : `helpPct`, `priority`, `vsCarrier`, `offBallStance`, `screenNav`, `helpMode` (auto/agressif/passif/désactivé), `gazeLock` (auto/mon homme/porteur/les deux), `bodyOrientationMode` (auto/ouvert/face homme/face porteur/ligne passe à plat/ligne passe perp.). Les selects ont une option "—" qui ne déclenche rien (placeholder).
- Bouton **"Réinitialiser les overrides individuels"** : efface `distance`, `maxSpeed`, `closeoutBoost`, `denyAggressiveness`, `screenNav` sur tous les défenseurs → ils retombent sur les valeurs globales (`state.defenseDistance`, etc.).
- Implémentation : nouvelles actions `updateAllRules(patch)` et `resetIndividualOverrides()` dans [`useAppState.ts`](src/hooks/useAppState.ts) (entrée d'historique unique pour le ctrl-z), props `onUpdateAllRules` / `onResetIndividualOverrides` ajoutées à [`DefensePanel.tsx`](src/components/DefensePanel.tsx).

### Added — Toggle pour masquer le bandeau "Lecture coach"
- Nouvelle option `state.showCoachDiagnostics` (default `true`) dans [Paramètres > VISU & LÉGENDE > "lecture coach"](src/components/ParametresPanel.tsx). Quand le bandeau apparaît/disparaît selon le nombre de warnings actifs, le terrain change de taille (effet de clignotement). Le toggle permet de masquer le panneau pour un layout vertical stable. Compteur "(X actifs)" mis à jour dans `ParametresLauncher`.
- Implémentation : champ `showCoachDiagnostics?: boolean` dans `AppState` ([types/index.ts](src/lib/types/index.ts)), conditionnement du rendu dans [page.tsx](src/app/page.tsx).

### Fixed — Pointes de flèches d'annotations visibles
- Le tracé `from → to` des annotations `cut`, `dribble`, `pass` se terminait au centre du joueur cible — la pointe de flèche (`markerEnd`) était masquée par le cercle joueur rendu par-dessus. Désormais le tracé est raccourci de `PLAYER_RADIUS + 4` px (helper `shrinkEnd` / `shrinkPolylineEnd` dans [`Annotations.tsx`](src/components/Annotations.tsx)) pour que la pointe s'affiche **avant** le badge — direction du mouvement claire, surtout sur les scénarios générés (Isolation, etc.) où plusieurs joueurs reçoivent une annotation `cut` simultanée.
- Markers SVG `arrow-orange` / `arrow-gray` agrandis de 6×6 à 8×8 pour une meilleure lisibilité à l'échelle terrain ([`Court.tsx`](src/components/Court.tsx)).
- Cas couverts : ligne droite (cut, pass, dribble sans waypoints), wave dribble Q-Bezier, polyline courbe Catmull-Rom (waypoints). Screen non touché (sa barre en T se positionne sur `to` réel, pas une flèche).

---

## [0.8.0] — 2026-05-10

**Cycle "lecture animée fidèle"** : trajectoires courbes (V-cut, L-cut, freehand via Shift+drag), suivi temps-réel des défenseurs sur les courbes, hedge complet, regard auto distance-based, pause/reprise depuis l'instant t, dribble en wave lisse, lecture ralentie à 2 s/étape.

### Changed — Lecture ralentie à 1× (2 s par étape au lieu de 1,5 s)
- `playbackSpeed = 1×` correspond désormais à **2000 ms par étape** (au lieu de 1500 ms). Le slider 0.3×–2× module sur cette base : de ~6,7 s à 1 s par étape. Permet de bien lire les déplacements en vitesse normale.
- Constante centralisée dans [`physics.ts > PLAYBACK_STEP_DURATION_MS`](src/lib/data/physics.ts), importée dans [`CourtView.tsx`](src/components/CourtView.tsx) (utilisée à 2 endroits : init `playStart` au démarrage du tick, et calcul de `globalT` dans la boucle).
- Implications calibration : les vitesses max par poste (`MAX_SPEED_BY_POSITION_PX`) en px/étape ne changent pas, mais la vitesse perçue en m/s diminue (ex. ailier passe de ~2,0 m/s à ~1,5 m/s à pleine vitesse). Docs [physics.md](docs/physics.md) et [GAME-ENGINE.md](docs/GAME-ENGINE.md) mises à jour.

### Fixed — Pause fige l'instant + reprise depuis la pause
- Cliquer sur ⏸ pendant la lecture **fige l'image à l'instant t courant** au lieu de retomber sur la frame statique de l'étape active (capture possible).
- Cliquer sur ▶ après une pause **reprend depuis l'instant t pause** au lieu de redémarrer du début.
- Implémentation : à la pause, `playbackT` est propagé dans `scrubT` qui pilote `scrubFrame` ([page.tsx](src/app/page.tsx)). Au play, `scrubT` est consommé comme offset via la nouvelle prop `playbackStartT` de CourtView ([CourtView.tsx](src/components/CourtView.tsx)) qui décale `playStart` en arrière de `T × stepDuration` au démarrage du tick. Stop (⏹) reste distinct et revient à l'étape 0.

### Fixed — Tous les défenseurs suivent leurs attaquants en temps réel (carrier + off-ball)
- Pendant la lecture, chaque défenseur en marquage individuel interpolait linéairement entre sa position à l'étape A et sa position à l'étape B → il prenait la **corde** d'un arc pendant que son homme faisait un V-cut, un L-cut, un démarquage en arc ou un dribble en wave. Visuellement il coupait au plus court et lâchait son homme.
- Désormais la position de **chaque défenseur** (carrier ET off-ball) est recalculée à chaque frame (playback + scrub) à partir de la position courante de son attaquant marqué :
  - Carrier defender → `carrierDefenderTarget` (vsCarrier, distance, hoop)
  - Off-ball → `offBallStanceTarget` (stance, ball) ou `manTarget` (sag/behind)
- **Placement manuel respecté** : si l'utilisateur a posé un override de position via drag (`defenseOverrides`) sur l'une des deux étapes du segment, sa position imposée prime — pas de follow, l'interpolation linéaire est conservée.
- Les flags d'état (`helpFactor`, `helpAim`, `closingOut`, `denying`) restent ceux calculés par `effectiveDefensePositions` aux étapes A/B et interpolés. Cette fonction réécrit uniquement la POSITION de marquage de base.
- Implémentation : `followDefendersAtFrame` ([engine.ts](src/lib/logic/engine.ts)), appelée dans [`CourtView.tsx`](src/components/CourtView.tsx) (playFrame + scrubFrame) avant `resolvePlayerCollisions` et `recomputeDefenseFrameOrientations`.

### Added — Annotations en courbe (Shift+drag freehand, V-cut/L-cut)
- Les annotations `cut`, `dribble` et `screen` supportent maintenant un champ optionnel `waypoints?: Point[]` ([types/index.ts](src/lib/types/index.ts)). Avec waypoints, la trajectoire suit une **spline Catmull-Rom** (tension τ=0.5, équivalent Bezier cubique exact en rendu) au lieu d'une ligne droite.
- **UX souris** : maintenir **Shift pendant le drag** d'une annotation enregistre le tracé à main levée. À la fin du drag, le buffer brut est simplifié via Douglas-Peucker (tolérance 6 px) en 3–7 waypoints propres. Drag normal sans Shift = comportement actuel inchangé (ligne droite, dribble en wave standard).
- **Cas couverts** : V-cut, L-cut, démarquage en aller-retour, courbe libre, dribble curviligne. La passe reste rectiligne par convention.
- **Lecture fluide** : `samplePolyline` ([polyline.ts](src/lib/logic/polyline.ts)) reparamètre la spline en longueur d'arc — vitesse perçue ~constante quel que soit la courbure, le joueur ne ralentit pas dans les virages serrés.
- **Rendu** : `polylinePath` produit un path SVG en `M ... C ...` lisse, partagé entre la preview pendant le drag (mise à jour live) et l'annotation finale. La trajectoire affichée est rigoureusement la même que celle parcourue par le joueur en lecture.
- Implémentation : [`polyline.ts`](src/lib/logic/polyline.ts), intégration dans [`playbackTrajectory.ts`](src/lib/logic/playbackTrajectory.ts) et [`Annotations.tsx`](src/components/Annotations.tsx), UX dans [`CourtView.tsx`](src/components/CourtView.tsx) (handlers `onPointerDown` / `onPointerMove` / `onPointerUp`). 14 nouveaux tests unitaires.

### Changed — `hedge` : le défenseur du porteur (D1) bouge maintenant aussi
- Historiquement, en règle d'écran `'hedge'` (valeur par défaut de `state.screenRule`), seul **le défenseur du poseur (D5)** réagissait — il sortait en _show_ vers le porteur. **Le défenseur du porteur (D1) restait à sa position de base**, ce qui donnait l'impression qu'il "ne réagissait pas" à un écran posé en lecture.
- Désormais en `'hedge'`, D1 **passe over the top** de l'écran avec un décalage latéral modéré (8 à 16 px selon la proximité de l'écran), tight sur le porteur. Le couple D1/D5 ferme à la fois la pénétration et la rejection, et D1 peut recover quand D5 rentre.
- Implémentation : nouveau cas `rule === 'hedge' && isCarrierDef` dans [`applyScreenAdjustment`](src/lib/logic/screens.ts) ([screens.ts:215-229](src/lib/logic/screens.ts:215-229)).
- Pour forcer la détection d'écran indépendamment de la géométrie : utiliser **« forcer comme poseur d'écran »** dans le clic-droit attaquant ([ContextMenu.tsx:758](src/components/ContextMenu.tsx:758)) — pose `cur.forcedScreener` qui saute les checks de proximité dans `detectScreen`.

### Changed — Regard auto plus dynamique en off-ball
- En stance `sag` / `behind` / défaut (sans `gazeLock` explicite), la cible primaire du regard bascule désormais selon la **distance** : si l'homme marqué est plus proche du défenseur que le ballon (ratio < 0.65), il devient la menace immédiate à fixer ; sinon le ballon reste primary. Le secondary reste visible si le cône 120° le permet et le clamp anatomique ±60° est préservé. Rend visibles entre étapes les transitions de regard quand l'attaquant marqué se rapproche/s'éloigne. Implémentation : [`vision.ts`](src/lib/logic/vision.ts).

### Fixed — Tracé du dribble en wave lisse (plus de zigzag)
- Le path SVG du dribble était une polyligne `L` chainée à ±5 px de l'axe → effet "dents de scie". Remplacé par une chaîne de courbes quadratiques Bezier (`Q`) avec jonctions C1 sur l'axe : courbe lisse, amplitude visuelle équivalente. [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) suit la même géométrie pour que la position du joueur reste alignée pixel-près avec le tracé rendu.

### Added — Actions jouées en lecture (annotations pilotent la trajectoire)
- Les annotations `dribble` / `cut` / `screen` dessinées sur une étape **pilotent réellement le mouvement** des joueurs en lecture, plus juste un schéma décoratif. Spec : [docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md](docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md), plan d'implémentation : [docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md](docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md).
- **Drag = annotation implicite** : déplacer un attaquant entre étapes auto-crée l'annotation correspondante (`dribble` si porteur, sinon `cut`). Plus de drag "neutre" qui ne raconte rien.
- **Dribble** : le porteur suit la **wave ondulée** dessinée pendant le segment, plus une ligne droite. Échantillonnage via [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) qui partage la même géométrie que le tracé SVG (le joueur est exactement sur la ligne rendue à chaque instant `t`).
- **Écran** : le poseur **arrive au point d'écran à mi-segment** (vitesse double sur la première moitié), puis **tient sa position en posture d'écran** avec le **regard pointé vers le défenseur du porteur** — flag `isScreening` propagé via [`attackerTrajectoryAt`](src/lib/logic/playbackTrajectory.ts) puis override de `gazeOrientation` côté [`CourtView.tsx`](src/components/CourtView.tsx).
- **Invariante** : exactement une annotation de mouvement (`cut|dribble|screen`) par attaquant qui bouge entre N et N+1. `pass` reste non-mouvement et peut coexister avec un mouvement.
- **Migration legacy auto-générée** : [`ensureAnnotationsForMovement`](src/lib/logic/migrateAnnotations.ts) scanne les transitions des templates / scripted actions / localStorage et génère les annotations manquantes. Idempotente. Les écrans existants (Spain PNR, Floppy, etc.) sont migrés en `cut` faute de signal explicite — ils suivent la trajectoire mais sans hold posture-écran (à raffiner ensuite côté `compileScenario.ts`).

### Changed — API de mutation centralisée
- Nouveau module [`stepMutations.ts`](src/lib/logic/stepMutations.ts) : seul point de mutation de `Step.off` et `Step.annotations`. Expose 4 helpers purs : `setPlayerPositionAt`, `upsertMovementAnnotation`, `upsertPassAnnotation`, `removeAnnotation`. Maintiennent l'invariante par construction (sync amont/aval, snap-back en suppression, cascade sur les `from` aval).
- [`useAppState.ts`](src/hooks/useAppState.ts) : `moveAttacker`, `addAnnotation`, `clearAnnotationsFor`, `deleteLastAnnotation`, `deleteAnnotation` routent désormais via ces helpers. Plus de mutation directe de `cur.off` / `cur.annotations` dans le hook.

### Changed — Vision humaine refondée
- Factorisation de la logique de vision humaine dans [`vision.ts`](src/lib/logic/vision.ts) : clamp tête ±60°, cône 120°, priorité homme/porteur et midpoint angulaire quand les deux peuvent coexister dans le champ de vision.
- Recalcul du triangle et du champ de vision depuis la position réelle affichée pendant les frames animées (playback + scrub), après interpolation, contournement et collisions, via `recomputeDefenseFrameOrientations`.
- Orientation du corps défensive plus basket : open stance angulaire `ball-you-man` (midpoint angulaire non biaisé par la distance), `deny-3q` (65%) / `stunt` (70%) biaisés côté ballon, `fronting` face à la passe, `behind` priorise l'homme.
- Clamp anatomique passé de ±90° à ±60° pour s'aligner sur le cône FOV (cohérence vision périphérique humaine).
- Menu clic-droit défenseur **corps** (`BodyOrientationMode`) : consignes `auto`, `ouvert homme/ballon`, `face homme`, `face porteur`, `ligne passe à plat`, `ligne passe perpendiculaire`. Le slider absolu `bodyOrientation` reste prioritaire.

### Tests
- 38 nouveaux tests Vitest pour les actions jouées en lecture : `dribbleWave` (10), `stepMutations` (18), `migrateAnnotations` (6), `playbackTrajectory` (7).
- Tests étendus pour la vision humaine : `orientation.test.ts` (+143 lignes), `engine.test.ts` (+25), `invariants.test.ts` (+13).
- Suite totale : **277 tests verts**.

---

## [0.7.0] — 2026-05-09

**Cycle "pictogramme + champ de vision + overrides manuels"** : convention B asymétrique, invariants anatomiques, champ de vision en cône heatmap (3 toggles : tous / défenseurs / attaquants), sliders manuels corps + regard pour défenseurs ET attaquants, design des bras figé (Design F après comparaison de 8 candidats), Paramètres déplacés en pop-up à gauche.

Highlights :
- **Champ de vision** par joueur : cônes heatmap cyan (défenseurs) / orange (attaquants), 120° d'ouverture, jusqu'aux limites du terrain. Heatmap croisée par superposition. 3 toggles globaux + clic-droit individuel par défenseur.
- **Invariants anatomiques inviolables** : regard ∈ ±60° du corps (= demi-ouverture du cône de vision), aucun bras dans le dos, porteur statique → panier (ou direction de dribble si > 30 px).
- **Sliders manuels orientation corps + regard** dans le clic-droit, pour défenseurs ET attaquants.
- **Design des bras figé** (Design F) après comparaison de 8 variantes via `/demo-arms`.
- **UI** : panneau Paramètres déplacé à gauche en pop-up modal (style LibraryPanel).

### Changed — Pictogramme : retour aux bras stylisés FIBA STATIQUES
- [`Player.tsx`](src/components/Player.tsx) : suppression du wrapper `transform="rotate(orientation, ...)"` autour des bras. Les arcs FIBA stylisés restent **toujours au-dessus du joueur**, identiques pour tous, peu importe stance ou orientation tactique.
- La direction du **regard** reste matérialisée par le **triangle pointeur** (`facing`), avec son clamp anatomique `gaze ∈ ±60° du body` qui reste actif (impossible de regarder derrière la tête).
- La logique métier (`bodyOrientation`, `gazeOrientation`, `armBallSide`, `armManSide` calculés en convention B) reste dans le data model pour usage futur (overlay debug, slider manuel, champ de vision).

### Changed — UI : panneau Paramètres déplacé en pop-up à gauche
- Nouveau composant [`ParametresLauncher.tsx`](src/components/ParametresLauncher.tsx) — bouton compact dans la colonne gauche (sous "Actions") qui ouvre une **modal centrée** avec tout le contenu de `ParametresPanel` (VISU & LÉGENDE + INDICATEURS AUTO + bouton sens d'attaque).
- Style cohérent avec [`LibraryPanel.tsx`](src/components/LibraryPanel.tsx) (même look bouton + modal).
- Compteur "(X actifs)" sur le bouton pour donner un retour visuel rapide du nombre d'options activées.
- Modal fermable par Échap, clic extérieur, ou bouton ×.
- Le panneau Paramètres a quitté la colonne droite — celle-ci ne contient plus que le DefensePanel, libérant de la verticale pour la simulation.

### Added — Champ de vision : toggle global "tous joueurs" + heatmap croisée
- Nouveau toggle global **"champ de vision (tous)"** dans le menu Paramètres (VISU & LÉGENDE) : active le cône de vision sur **tous les joueurs** (défenseurs + attaquants) en un clic. Stocké dans `state.showFieldOfViewAll`.
- Combiné par OR logique avec les toggles individuels (clic-droit défenseur) — l'un OU l'autre suffit pour afficher un cône.
- **Heatmap croisée** : quand plusieurs cônes se superposent, l'opacité s'accumule naturellement (cyan plus dense), matérialisant les zones du terrain les mieux couvertes (vues par plusieurs défenseurs simultanément).
- `FieldOfViewOverlay.tsx` étendu pour accepter aussi attaquants (`off` + `attVisuals`) et le toggle global.

### Added — Champ de vision défenseur (cône heatmap)
- Activable individuellement par défenseur via clic-droit → checkbox **"champ de vision"** (`rule.showFieldOfView`).
- Cône cyan semi-transparent (opacité 0.18) avec contour pointillé, centré sur le `gazeOrientation` du défenseur, ouverture 120° (60° de chaque côté du regard, vision humaine focale + périphérique nette), profondeur 200 px (~5,4 m).
- Composant [`FieldOfViewOverlay.tsx`](src/components/FieldOfViewOverlay.tsx) — rendu en arrière-plan des sprites joueur pour ne pas masquer les pictogrammes.
- Indépendant du triangle pointeur (regard) : on peut activer le cône pour visualiser la zone d'attention élargie en plus du regard pointu.

### Added — Convention B : bras asymétriques + invariants anatomiques
- **2 cibles distinctes** par joueur (`armBallSide` / `armManSide`) calculées par rôle dans [`orientation.ts`](src/lib/logic/orientation.ts) :
  - Off-ball sag : un bras vers ballon, un vers homme (open stance).
  - Fronting : 2 bras dans la ligne de passe homme→ballon.
  - Deny-3q / stunt : un bras dans la ligne de passe (intercepter), un sur l'homme.
  - PnR tag/x-out/stunt : un bras vers la zone de menace, un sur l'homme original.
  - On-ball : 2 bras vers le porteur (contestation).
  - Porteur statique : 2 bras vers le panier ; **en dribble (delta prev→cur > 30 px) → 2 bras vers la direction du mouvement**.
  - Cutter : 2 bras vers la destination de coupe.
  - Screener : 2 bras vers le défenseur ciblé (corps perpendiculaire pour bloquer la trajectoire).
  - Idle : 2 bras vers le porteur (demande la passe).
- **Invariants anatomiques inviolables** :
  - Le `gaze` (regard) est CLAMPÉ à ±60° du `body` (corps) — impossible de regarder derrière sa tête.
  - Aucune cible de bras ne tombe en dehors du demi-cercle frontal du corps — impossible d'avoir un bras dans le dos.
  - Ces clamps priment sur tout calcul auto et tout override manuel.
- `ComputedDefender` et `ComputedAttacker` étendus avec `gazeOrientation`, `armBallSide`, `armManSide`.
- `Player.tsx` : nouveau rendu — 2 bras tracés depuis les épaules (perpendiculaires au regard) vers leurs cibles, avec courbure vers l'avant. Fallback sur les arcs FIBA symétriques si les cibles ne sont pas fournies.
- 9 tests neufs (197/197 verts) dont l'invariant anatomique sur les 7 playbooks de la lib (gaze ∈ ±60° du body pour tous les joueurs à toutes les étapes).
- `DefenderRule` étendu avec `bodyOrientation?` (override absolu corps 0–360°) et `gazeLock?` (`opponent` / `ball-carrier` / `both`, clampé ±60° du corps). Le slider legacy `orientation` (delta ±45°) reste supporté.

### Fixed — Pictogramme joueur : convention FIBA respectée
- [`Player.tsx`](src/components/Player.tsx) : bras stylisés **statiques** au-dessus du cercle, identiques pour attaquants et défenseurs. Suppression de la rotation `transform="rotate(orientation, ...)"` ajoutée en 0.6.0 qui faisait tourner les bras avec l'orientation calculée — convention non-FIBA, produisait des bras anatomiquement incohérents (impression de bras "dans le dos" du joueur, ou tous orientés vers le panier).
- Référence : [FIBA Europe Basketball Terminology](https://www.fiba.com/) — les pictogrammes joueur conservent toujours la même posture quelle que soit l'action ; le sens du jeu se lit via les flèches d'action (passes / courses / écrans).
- Le triangle pointeur `facing` reste affiché comme info de debug discrète (où le défenseur regarde selon stance + ballon).
- La logique métier `computeDefenderOrientation` / `computeAttackerOrientation` reste utile pour les calculs internes (lateralOffset, decisions tactiques) mais n'influence plus le rendu visuel des bras.

---

## [0.6.0] — 2026-05-09

**Cycle "fidélité basket"** : orientation calculée, anti-téléportation, rim protection sur drive, vue debug aide, refactor physics centralisé, toggles fine. 73 nouveaux tests (111 → 188), 4 nouveaux modules ([`orientation.ts`](src/lib/logic/orientation.ts), [`physics.ts`](src/lib/data/physics.ts), [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) + tests d'invariants), 3 nouvelles docs ([`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md), [`docs/physics.md`](docs/physics.md), [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md)).

Highlights :
- **Orientation des joueurs** dérivée automatiquement de stance / ballon / homme / écran (avant : statique, manuelle).
- **Plus de téléportations** d'attaquants : interpolation avec contournement d'obstacles + diagnostic warning si saut > 4 m.
- **Rim protection** sur drive (tag and recover du big) : le pivot step-up sur la trajectoire au lieu de rester sur le post adverse.
- **`physics.ts`** : un seul module pour tuner toutes les constantes physiques (vitesses par poste, closeoutBoost, screenRadius, etc.) avec sémantique en mètres réels.
- **Vue debug aide** : flèches défenseur → cible d'aide avec pourcentage et tag de priorité, pour comprendre ce que la logique calcule.
- **8 toggles fine** dans la légende pour masquer chaque sous-visuel indépendamment.

### Added — Toggles légende fine (8 sous-visuels indépendants)
- 8 nouveaux toggles dans INDICATEURS AUTO ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)) : `showZoneTracking`, `showContestedPass`, `showBlockedPass`, `showOffBallScreenIndicator`, `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`. Default `true` — UX existante préservée.
- Combinés en ET logique avec leur master quand pertinent (`showLateRing && showStateRings`, `showForcedScreenerBadge && showLockBadges`, `showOffBallScreenIndicator && showScreenIndicators`). Permet de masquer un visuel précis sans tout couper.
- [`PassLanesOverlay.tsx`](src/components/PassLanesOverlay.tsx) accepte `showContested` / `showBlocked` pour filtrer les catégories indépendamment.
- [`Player.tsx`](src/components/Player.tsx) accepte `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`.
- Avant : ces 8 visuels étaient dans une légende **non-toggleable** (juste affichage du code couleur). Maintenant chaque ligne est une checkbox active.

### Changed — Refactor : module `physics.ts` centralisateur
- Toutes les constantes physiques regroupées dans [`src/lib/data/physics.ts`](src/lib/data/physics.ts) : `MIN_PLAYER_CLEARANCE_PX`, `DEFAULT_DEFENSE_MAX_SPEED_PX`, `DEFAULT_DEFENSE_DISTANCE_PX`, `DEFAULT_CLOSEOUT_BOOST`, `DEFAULT_DENY_AGGRESSIVENESS`, `MAX_SPEED_BY_POSITION_PX`, `DEFAULT_SCREEN_RADIUS_PX`, `RIM_PROTECTION_DROP_ZONE_PX`. Helpers `metersToPx` / `pxToMeters`.
- Migration des call-sites :
  - [`engine.ts`](src/lib/logic/engine.ts) : `DEFAULT_CLOSEOUT_SPEED_FACTOR`, `0.45` (denyAggressiveness fallback), `PLAYER_RADIUS * 2 + 2` × 2.
  - [`manDefense.ts`](src/lib/logic/manDefense.ts) : `MIN_TARGET_DIST` inline.
  - [`screens.ts`](src/lib/logic/screens.ts) : `pushOutOfScreener` clearance.
  - [`help.ts`](src/lib/logic/help.ts) : drop zone `75` (rim protection).
  - [`initial.ts`](src/lib/data/initial.ts) : `defaultRules.maxSpeed` × 5, `defenseDistance`, `defenseMaxSpeed`, `screenRadius`, `closeoutBoost`, `denyAggressiveness`.
- Aucun changement de comportement : 188/188 tests verts, valeurs strictement préservées.
- Nouvelle doc [`docs/physics.md`](docs/physics.md) avec sémantique en mètres réels (PX_PER_M=37, vitesses en m/s par poste, distances en m) et guide de tuning.

### Fixed — Rim protection sur drive (étape B)
- [`help.ts`](src/lib/logic/help.ts) branche `priority='paint'` : quand `trigger.drive` est actif, l'aim devient la **drop zone** (point sur la ligne porteur→panier à 75 px du panier) plutôt que de rester collé sur un post adverse à <120 px d'un low-block. Implémente le **tag and recover** classique du pivot.
- Avant : si un attaquant campait en strong high, le pivot le suivait au lieu de fermer la trajectoire de drive — D5 ne step-up pas, le porteur arrivait sous le cercle libre.
- 4 tests TDD ([`help.test.ts`](src/lib/logic/__tests__/help.test.ts)) : helpAim sur la ligne, ≠ pivot adverse, dans la drop zone 50–150 px, et régression sans trigger drive.

### Added — Vue debug d'aide défensive
- Toggle `state.showHelpDebug` dans VISU & LÉGENDE ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)).
- Nouveau composant [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) : pour chaque défenseur dont `helpFactor > 10%`, flèche pointillée du défenseur vers `helpAim` (cible idéale avant blend), avec badge `xx% · PRIORITÉ`. Couleurs distinctes pour priorité paint / man / passlane, denial strong-side, et rotations PnR (tag/x-out/stunt).
- `HelpResult` étendu avec `aim`, `priority`, `kind` ('sag-weakside' / 'denial-strongside' / 'active-help' / 'none').
- `ComputedDefender` étendu avec `helpAim`, `helpPriority`, `helpKind`. Les rotations PnR écrasent ces champs avec leur cible spécifique.

### Added — Orientation calculée des joueurs (P6)
- Module pur [`orientation.ts`](src/lib/logic/orientation.ts) avec `computeDefenderOrientation`, `computeAttackerOrientation`, `lerpAngleDeg`.
- `ComputedDefender` reçoit `orientation: number` + `facing: Point` calculés depuis stance / ballon / homme / pnrRole.
- Nouveau `computeAttackerVisuals(state, stepIdx)` qui détecte les rôles offensifs (carrier / passer / cutter / screener / idle) et produit `Record<AttackerId, { orientation, facing }>`.
- Le poseur d'écran s'oriente perpendiculairement à la ligne vers le défenseur ciblé (épaule de blocage).
- Le delta manuel `state.rules[id].orientation` est conservé comme **override clampé à ±45°** au-dessus du calcul auto.
- Bras FIBA + triangle pointeur étendus aux attaquants ([`Player.tsx`](src/components/Player.tsx)).
- Lerp angulaire dans [`CourtView.tsx`](src/components/CourtView.tsx) (plus court chemin sur le cercle).

### Added — Anti-téléportation des attaquants
- Interpolation des attaquants utilise désormais `pickBlockingCluster` + `curveAroundObstacle` (mêmes primitives que les défenseurs) pour contourner les autres joueurs entre étapes.
- Diagnostic [`coachDiagnostics.ts`](src/lib/logic/coachDiagnostics.ts) `tag: 'attacker-jump'` : warning si un attaquant parcourt > 4 m sur une étape.

### Added — Tests
- [`orientation.test.ts`](src/lib/logic/__tests__/orientation.test.ts) — 12 cas (stance × ballon × homme).
- [`invariants.test.ts`](src/lib/logic/__tests__/invariants.test.ts) — 35 cas rejouant les 7 playbooks de la lib (chevauchements, vitesse défensive bornée, sauts attaquants ≤ 5,5 m, orientations valides).
- [`zoneDefense.test.ts`](src/lib/logic/__tests__/zoneDefense.test.ts), [`zoneSituations.test.ts`](src/lib/logic/__tests__/zoneSituations.test.ts) — couverture du moteur ownership et des situations zone.

### Fixed
- **Top-lock** ([`screens.ts`](src/lib/logic/screens.ts)) : la branche `top-lock` ignorait explicitement le ballon (`void ballPos`) et plaçait le défenseur du shooter dans la direction screener→cutter au lieu de côté ballon. Signature de `applyOffBallScreenAdjustment` étendue avec `ballPos: Point`, calcul du `sideOfBall` par projection sur la perpendiculaire de l'axe d'écran.
- **Paint helper** ([`help.ts`](src/lib/logic/help.ts)) : `priority='paint'` applique maintenant un coefficient de proximité au `helpFactor` (1.0 si dist ≤ 120 px, dégradé jusqu'à 0.4 à ≥ 280 px). Avant : un coin opposé était tiré aussi fort qu'un wing strong-side.
- **Écrans fantômes** ([`screens.ts`](src/lib/logic/screens.ts)) : nouveau filtre `hasScreenIntent` qui rejette les attaquants en train de S'ÉLOIGNER du couple porteur/défenseur (mesure delta de distance entre étape précédente et courante). Bypass quand l'utilisateur a explicitement défini un `forcedScreener`.
- **`isShortCorner`** ([`zoneSituations.ts`](src/lib/logic/zoneSituations.ts)) : la v1 exigeait `dHoop < 130 ET lateral > 130` — mathématiquement impossible (sqrt(lat²+vert²) ≥ lat). La fonction ne matchait jamais → le boost critique `criticalMult = 1.4` n'était jamais appliqué sur un attaquant en short corner. Corrigé : `lateral > 130 ET vertical < 100 ET dHoop < 250`.

### Documentation
- Nouveau [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md).
- Nouveau [`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md) — cartographie individuel / collectif / physique.
- Nouveau [`CHANGELOG.md`](CHANGELOG.md).
- Mises à jour [`ROADMAP.md`](ROADMAP.md), [`docs/README.md`](docs/README.md), [`docs/logique-defensive.md`](docs/logique-defensive.md), [`docs/testing.md`](docs/testing.md).

---

## [0.5.0] — 2026-05-08

### Added — P0–P5 enrichissement basket
- **P0** Détection PnR enrichie : `roll`, `pop`, `slip`, `short-roll`, `ghost`, `reject`, `snake`, `re-screen` (`screenAction.ts`).
- **P1** Rotations PnR automatiques : low-man tag du roller, X-out sur l'orphelin, nail stunt depuis le high post (`pnrRotations.ts`).
- **P2** Couvertures PnR explicites : `ice` (force baseline), `weak` (under léger), `peel-switch` (drop puis switch déclenché par `peelSwitchShouldFire`).
- **P3** Comportement zone réaliste : overload détection, `isShortCorner` et `isHighPost` boost le claim, skip pass diagnostiqué (`zoneSituations.ts`).
- **P4** Écrans non-porteur enrichis : top-lock, chase, et reconnaissance d'enchaînements stagger / elevator / hammer / flex (`upgradeOffBallScreens` dans `screens.ts`).
- **P5** Lectures offensives auto : map couverture défense → opportunité offensive en vocabulaire coach (`tacticalReads.ts`).

### Added — Bibliothèque v2
- Dossiers personnels, sauvegarde locale (localStorage), export / import JSON par dossier.
- Modal centrée pour la bibliothèque, intégrée dans le panneau gauche.

---

## [0.4.0] — 2026-05-08

### Added — Refonte zone + physique + profils
- **Moteur ownership zone continu** : claims gaussiens × `naturalBonus` × `carrierBonus`, normalisation en parts par attaquant, primary = part max, blend `homePos` ↔ `trackedPos` proportionnel à l'engagement. Élimine les sauts de priorité aux frontières des polygones (`zoneDefense.ts`).
- **Physique 3 leviers** : longueur d'arc `pathArcLength` (le défenseur "paie" un détour Bezier autour d'un cluster), `proximityFriction` (vitesse réduite quand le trajet frôle un joueur non-matché), `pre-relaxation` (cible repoussée hors d'un attaquant non-matché avant l'application de `maxSpeed`).
- **Profils offensifs** (`OffensiveProfile`) : `creator`, `shooter`, `slasher`, `rim-roller`, `stretch-big`, `non-shooter`. Modulent shotQuality dans `threats.ts`, le coût de quitter dans `help.ts` (`leaveAttackerCostMultiplier`), et le bump closeout (`closeoutProfileBonus`).
- **Diagnostics coach** (`coachDiagnostics.ts`) : closeout long, low-man tag manquant, mismatch après switch, corner abandonné, gap périmètre, helper triggé... vocabulaire métier.
- **Profils défensifs** : 10 rôles applicables par défenseur (stopper, helper, denier, drop-big...) qui pré-règlent la rule via merge superficiel.

---

## [0.3.0] — 2026-05-07

### Added — Simulation tactique
- **Phase A** — score de menace par attaquant (`threats.ts`) : `shotQuality × receivability` avec 5 zones de tir, modulation contestée / ouverte, profils.
- **Phase B** — évaluation des options offensives (`offense.ts`) : tir, drive, passe + tir (un par coéquipier). Flèche "meilleure action" sur le porteur.
- **Phase C** — Monte Carlo de possessions (`simulator.ts`) : PPP, eFG%, distribution des outcomes. Reproductibilité avec RNG seedé (mulberry32).

---

## [0.2.0] — 2026-05-07

### Added
- **Vitesses max individuelles** par défenseur (`rule.maxSpeed`) — réduit la téléportation sur aides longues. Default selon le poste : meneur 145, arrière 130, ailier 110, ailier fort 90, pivot 75.
- **Distance per-défenseur** dans le menu clic-droit (`rule.distance` override `state.defenseDistance`).
- **`helpMode` per-défenseur** : `auto` / `aggressive` / `passive` / `disabled`.
- **`closeoutBoost` et `denyAggressiveness`** override individuels.
- **Mode édition de zones** : drag des sommets de polygone, drag du homePos, comportements par région (`auto` / `agressif` / `passif` / `trap`).
- **Préférence matchup naturel** en zone (`naturalBonus = 1.2` sur D3↔O3 etc).
- **Orientation manuelle du défenseur** en degrés (rotation du corps + 2 bras FIBA), un seul curseur ±90°. → étendu en P6 (cf. Unreleased).
- **Stance off-ball influence position** (`sag` / `deny-3q` / `fronting` / `behind` / `stunt`).
- **Main dominante** par attaquant (`attackerHands`) — informatif pour le coach.

### Changed
- Timeline regroupée sur une ligne unique (play / stop / scrub / vitesse).
- Restructure 4 panneaux : Actions + Attaque (gauche) / Défense + Paramètres (droite).
- Mode plein écran + visualisation 2-col ouverte par défaut.

### Fixed
- Téléportation D3 sur ballon en zone — corrigée par le tracking continu basé homePos.
- Hydration `<style>` Next.js — bornage strict de la colonne centrale par grid.
- Overflow vertical du panneau défense — pack des triggers + visualisation fermée par défaut.

---

## [0.1.0] — 2026-05-06

### Added — Premier jet
- Simulateur tactique basket en Next.js client-only.
- 5 attaquants + 5 défenseurs sur demi-terrain SVG, drag & drop.
- 4 conventions de tracé : passe (pointillés), dribble (zig-zag), course (ligne pleine), écran (T).
- Construction d'un système en étapes (keyframes), scrubber timeline, lecture animée.
- Bibliothèque de 7 systèmes : PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy, Hammer.
- Défense individuelle (homme à homme) avec règles d'écran : over / under / switch / hedge / drop / blitz.
- Défense de zone : 4 layouts (2-3, 1-3-1, 3-2, match-up).
- Métriques temps réel : couverture raquette, gap max, écart moyen, défenseurs en retard, intensité d'aide.
- Lignes de passe colorées (ouverte / contestée / bloquée).
- Indicateurs visuels : cercle violet sur le poseur d'écran, bras FIBA stylisés.
- Export Playbook PDF via `window.print()`.
- Persistance localStorage automatique (debounce 400 ms).
