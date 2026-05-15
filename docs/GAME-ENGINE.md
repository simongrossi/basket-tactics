# Moteur de jeu

Cartographie de toute la logique basket en place, organisée en **trois couches d'exécution** (individuel, collectif, physique) plus une **couche d'analyse** read-only (métriques tactiques). Cette séparation est implicite dans le code (les modules existent déjà) ; ce document la rend explicite et donne un point d'entrée unique.

> Pour le **pipeline d'orchestration** module-par-module (qui appelle qui), voir [logique-defensive.md § Pipeline de calcul](logique-defensive.md#pipeline-de-calcul).
>
> Pour le **vocabulaire basket** sans code, voir [concepts-basket.md](concepts-basket.md).
>
> Pour suivre les **évolutions de comportement**, voir [../CHANGELOG.md](../CHANGELOG.md).

---

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  AppState (steps, rules, zoneConfig, triggers, profils, overrides…)  │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
   ┌──────────▼──────────┐               ┌────────────▼────────────┐
   │  MOTEUR INDIVIDUEL  │               │   MOTEUR COLLECTIF      │
   │  (1v1 / dyade)      │               │   (rotations, zone)     │
   ├─────────────────────┤               ├─────────────────────────┤
   │ manDefense          │               │ pnrRotations            │
   │ help                │               │ zoneDefense             │
   │ orientation (def.)  │               │ zoneSituations          │
   │ screenAction        │               │ trap                    │
   │ orientation (att.)  │               │ tacticalReads           │
   │ screens (détection) │               │ screens (couvertures)   │
   └──────────┬──────────┘               └────────────┬────────────┘
              │                                       │
              └───────────────────┬───────────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │   MOTEUR PHYSIQUE   │
                       │   (cinématique)     │
                       ├─────────────────────┤
                       │ geometry            │
                       │ data/court          │
                       │ rule.maxSpeed       │
                       │ closeoutBoost       │
                       │ proximityFriction   │
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │  ComputedDefense    │
                       │  + AttackerVisuals  │
                       └─────────────────────┘
```

L'orchestration est dans **[`engine.ts`](../src/lib/logic/engine.ts)** (`computeDefenseTargets`, `effectiveDefensePositions`, `computeAttackerVisuals`).

---

## Moteur individuel

Tout ce qui se décide à l'échelle d'**un défenseur** ou d'**une dyade** (défenseur + son homme). Pas de connaissance des 4 autres défenseurs.

### Modules

| Module | Rôle | Fonctions clés |
|---|---|---|
| [`manDefense.ts`](../src/lib/logic/manDefense.ts) | Position cible de marquage | `manTarget`, `carrierDefenderTarget`, `offBallStanceTarget`, `orientationLateralOffset` |
| [`help.ts`](../src/lib/logic/help.ts) | Aide weak-side, denial strong-side, sag baseline | `computeHelpTarget`, `leaveAttackerCostMultiplier`, `closeoutProfileBonus` |
| [`orientation.ts`](../src/lib/logic/orientation.ts) | Orientation et facing (corps, regard, bras) | `computeDefenderOrientation`, `computeAttackerOrientation`, `lerpAngleDeg`, `computeDefenderBodyOrientation` |
| [`vision.ts`](../src/lib/logic/vision.ts) | Vision humaine : clamp ±60°, cône 120°, résolution dynamique de la cible primaire | `resolveDefenderGaze`, `clampGazeToFrontal`, constantes `HEAD_TURN_LIMIT_DEG`, `FIELD_OF_VIEW_HALF_ANGLE_DEG`, `PROXIMITY_GAZE_RATIO` (basculement ballon↔homme selon distance) |
| [`screens.ts`](../src/lib/logic/screens.ts) | Détection écran porteur / non-porteur, couvertures dyadiques | `detectScreen`, `detectOffBallScreens`, `applyScreenAdjustment` (dont `'hedge'` D5 + D1 over-the-top), `applyOffBallScreenAdjustment`, `hasScreenIntent` |
| [`screenAction.ts`](../src/lib/logic/screenAction.ts) | Type d'action sur écran (roll / pop / slip / short-roll / ghost / reject / snake / re-screen) | `detectScreenAction`, `actionRequiresLowManTag`, `actionRequiresPopRecover`, `actionBreaksCoverage` |
| [`engine.ts`](../src/lib/logic/engine.ts) | Pipeline + suivi runtime | `effectiveDefensePositions`, `computeDefenseTargets`, `recomputeDefenseFrameOrientations`, `followDefendersAtFrame` (suivi temps-réel des défenseurs sur trajectoires courbes en lecture) |
| [`playbackTrajectory.ts`](../src/lib/logic/playbackTrajectory.ts) | Position interpolée d'un attaquant à `t` selon ses annotations | `attackerTrajectoryAt` (cut/dribble/screen/idle, avec ou sans waypoints) |
| [`polyline.ts`](../src/lib/logic/polyline.ts) | Trajectoires courbes (V-cut, L-cut, freehand) | `samplePolyline` (Catmull-Rom reparamétré en longueur d'arc), `polylinePath` (path SVG `M ... C ...`), `simplifyPolyline` (Douglas-Peucker pour drag freehand) |
| [`dribbleWave.ts`](../src/lib/logic/dribbleWave.ts) | Wave de dribble (sans waypoints) | `sampleDribbleWave`, `dribbleWavePath` — chaîne de Bezier quadratiques avec jonctions C1, lissée (plus de zigzag dent-de-scie) |

### Comportements

#### Défense sur porteur (`carrierDefenderTarget`)
6 valeurs de `vsCarrier` qui modulent `baseRatio` (distance défenseur/homme proportionnelle à la distance homme/panier) :

| Valeur | baseRatio | Effet |
|---|---|---|
| `coller` | 0.4 | défenseur très proche |
| `bumper` | 0.25 | proche + bumpOffset 8 px vers le panier |
| `contester` | 0.7 | distance moyenne, contestée |
| `reculer` | 1.3 | sag, donne de l'espace |
| `topside` | 0.4 | + lateralOffset +14 px (force baseline) |
| `baseline` | 0.4 | + lateralOffset −14 px (force milieu) |

Modulé par `pressureFactor = 1 + (1 − dist/THREE_POINT_RADIUS) × 0.8` (plus on est proche du panier, plus on serre).

#### Stance off-ball (`offBallStanceTarget`)
| Stance | Position | Description |
|---|---|---|
| `sag` (default) | sur la ligne homme-panier | head-on-swivel passif |
| `behind` | strict entre homme et panier | sans biais d'aide |
| `deny-3q` | blend 0.75 entre `behind` et `front` | un pied dans la ligne de passe |
| `fronting` | blend 1.0 (full) | face-guard, dos au panier |
| `stunt` | blend 0.4 | fake d'aide, recover à l'étape suivante |

#### Aide (`computeHelpTarget`)
4 régimes selon la priorité et la présence de trigger actif :

1. **Sag baseline weak-side** (sans trigger) — `helpFactor = (helpPct/100) × 0.5 × leaveMult` si attaquant côté faible.
2. **Strong-side denial** (sans trigger) — `helpFactor = denyAggressiveness × proximity` quand attaquant côté ballon à < 250 px du porteur. Glisse sur la ligne de passe (35 % du chemin).
3. **Aide active** (trigger drive / post / paint) — `helpFactor = (helpPct/100) × sideFactor × leaveMult` × pondération de proximité paint (1.0 si dist ≤ 120 px → 0.4 à ≥ 280 px).
4. **`helpMode='disabled'`** — court-circuit, retourne `manPos`.

`leaveAttackerCostMultiplier(profile)` : 0.55 sur shooter (ne quitte pas) à 1.30 sur non-shooter (sag franc). Borné [0.5, 1.3].

#### Orientation et facing
Voir [orientation-anti-teleport.md](orientation-anti-teleport.md). Règles auto + override manuel clampé à ±45°.

#### Détection d'écran
- **Porteur** (`detectScreen`) : meilleur candidat parmi les attaquants à < `screenRadius` (default 35) du carrierDef ET < 80 px du porteur, scoré par `dToCD + 0.5 × dToCarrier`. Filtre d'intention via `hasScreenIntent` qui rejette les screeners s'éloignant du couple porteur/défenseur (delta de distance entre étapes).
- **Off-ball** (`detectOffBallScreens`) : 6 types — pindown (`dy > 20`), backscreen (`dy < -20`), flare, et upgrade en stagger / elevator / hammer / flex via `upgradeOffBallScreens`.

#### Couvertures d'écran
8 règles porteur (`ScreenRule`) : `over`, `under`, `switch`, `hedge`, `drop` (3 profondeurs), `blitz`, `ice` (force baseline), `weak` (under léger), `peel-switch`. 4 règles off-ball (`OffBallScreenRule`) : `over`, `under`, `switch`, `bump`, `top-lock`, `chase`.

Les règles `applyScreenAdjustment` et `applyOffBallScreenAdjustment` sont **dyadiques** : elles modifient uniquement la cible du défenseur du porteur et celle du défenseur du screener.

---

## Moteur collectif

Ce qui ne peut se décider qu'avec une **vue globale des 5 défenseurs et des 5 attaquants** : rotations, glissements de zone, traps, lectures.

### Modules

| Module | Rôle | Fonctions clés |
|---|---|---|
| [`pnrRotations.ts`](../src/lib/logic/pnrRotations.ts) | Rotations PnR : low-man tag, X-out, nail stunt | `computePnRRotations` |
| [`zoneDefense.ts`](../src/lib/logic/zoneDefense.ts) | Moteur ownership continu pour la zone | `computeZoneTargets`, `mapAttackersToZones`, `pointInPolygon` |
| [`zoneSituations.ts`](../src/lib/logic/zoneSituations.ts) | Situations critiques de zone : overload, short-corner, high-post, skip | `detectOverload`, `isShortCorner`, `isHighPost`, `findCriticalZoneAttackers`, `detectSkipPass` |
| [`trap.ts`](../src/lib/logic/trap.ts) | Trap zones (4 coins / sidelines) + helper | `isInTrapZone`, `pickTrapHelper`, `trapTarget` |
| [`tacticalReads.ts`](../src/lib/logic/tacticalReads.ts) | Lectures offensives auto en vocabulaire coach | `computeTacticalReads` |
| [`triggers.ts`](../src/lib/logic/triggers.ts) | Détection des triggers globaux (drive, post, paint) | `detectTriggers` |
| [`coachDiagnostics.ts`](../src/lib/logic/coachDiagnostics.ts) | Phrases coach automatiques | `computeCoachDiagnostics` |

### Comportements

#### Rotations PnR (`computePnRRotations`)
Déclenchées si l'action sur écran exige un tag (`actionRequiresLowManTag`). Trois rôles overridés :
- **`tag`** (low-man) : weak-side ou central, le plus proche du panier hors carrierDef/screenerDef. Cible = 35 % du chemin roller→panier.
- **`x-out`** : défenseur dont l'homme est le plus proche de l'orphelin du low-man. Cible = mi-chemin entre baseTarget et orphelin.
- **`stunt`** : défenseur en zone high-post (lateral < 90, vert. 80–200). Cible = 25 % du chemin baseTarget→porteur.

Le rôle est exposé dans `ComputedDefender.pnrRole` pour rendre un anneau dédié dans l'UI.

#### Zone defense (`computeZoneTargets`)
**Moteur ownership continu** plutôt que matching binaire :

1. Pour chaque défenseur, calcul de `claim(attaquant) = exp(-(d/reach)²) × naturalBonus × carrierBonus × criticalMult` où `reach = zone.radius × tactic.reachMultiplier` (default 200 × 1.0 = 200 px).
2. Normalisation par attaquant (somme des claims = 1) → **ownership** (parts).
3. Primary = attaquant avec ownership max ; engagement = ownership max.
4. Cible blend `homePos × (1−engagement) + trackedPos × engagement`. `homePos` est shifté ball-side via `ballSideShifted` (max ±80 px).

Tactiques par type de zone (`TACTICS`) :
| Type | naturalBonus | carrierBonus | ballSideHelp | reach× |
|---|---|---|---|---|
| 2-3 | 1.2 | 1.5 | 0.5 | 1.0 |
| 3-2 | 1.3 | 1.6 | 0.35 | 0.95 |
| 1-3-1 | 1.15 | 1.4 | 0.6 | 1.05 |
| 2-1-2 | 1.2 | 1.5 | 0.5 | 1.0 |
| match-up | 2.0 | 1.3 | 0.25 | 1.0 |

#### Situations zone (`zoneSituations.ts`)
- `detectOverload` — 3+ attaquants côté ballon → boost `effectiveBallSideHelp = ballSideHelp × (1 + intensity × 0.6)`. Intensité 0.6 (3 joueurs) ou 1.0 (4+).
- `isShortCorner` — bande baseline (`lateral > 130 ET vert. < 100 ET dHoop < 250`) → `criticalMult = 1.4`.
- `isHighPost` — centré (`lateral < 60 ET vert. 130–200`) → `criticalMult = 1.4`.
- `detectSkipPass` — porteur change ET côté change → marqué dans diagnostics.

#### Trap (`trap.ts`)
4 zones de trap (`isInTrapZone`) : deux coins fond + deux sidelines mi-terrain. Quand le porteur y entre ET `triggers.trap=true` ET pas d'écran actif, le défenseur le plus proche (hors carrierDef) vient à `trapTarget` côté opposé du carrierDef à 28 px.

#### Lectures offensives (`tacticalReads.ts`)
Map la couverture défensive détectée → opportunité offensive. Tag `read-*`, severity `info` ou `warning`. Exemples : drop coverage → pull-up, switch → mismatch, overload → skip pass faible-côté.

---

## Moteur physique

La cinématique : comment un joueur passe d'un point A à un point B, à quelle vitesse, en évitant quoi. **Toutes les constantes physiques sont centralisées** dans [`data/physics.ts`](../src/lib/data/physics.ts) — voir [physics.md](physics.md) pour la sémantique en mètres réels.

### Modules

| Module | Rôle | Fonctions / constantes clés |
|---|---|---|
| [`data/physics.ts`](../src/lib/data/physics.ts) | **Constantes physiques centralisées** | `PX_PER_M`, `PLAYER_RADIUS`, `MIN_PLAYER_CLEARANCE_PX`, `DEFAULT_DEFENSE_MAX_SPEED_PX`, `DEFAULT_DEFENSE_DISTANCE_PX`, `DEFAULT_CLOSEOUT_BOOST`, `DEFAULT_DENY_AGGRESSIVENESS`, `MAX_SPEED_BY_POSITION_PX`, `DEFAULT_SCREEN_RADIUS_PX`, `RIM_PROTECTION_DROP_ZONE_PX`, helpers `metersToPx` / `pxToMeters` |
| [`geometry.ts`](../src/lib/logic/geometry.ts) | Math 2D + trajectoires | `distance`, `lerp`, `clamp`, `normalize`, `pushOutOfMany`, `resolvePlayerCollisions`, `curveAroundObstacle`, `pickBlockingCluster`, `pickStaggeredPair`, `curveAroundStaggeredPair`, `pathArcLength`, `proximityFriction`, `computeBallFrame`, `makeCluster` |
| [`constraintSolver.ts`](../src/lib/logic/constraintSolver.ts) | **Solveur de contraintes unifié** (J.3, 2026-05-15) | `solvePointConstraints` (point + obstacles + demi-plan optionnel) ; `solveEntityCollisions` (collisions multi-entités). Socle commun derrière `pushOutOfMany`, `pushOutOfScreenContact`, `resolvePlayerCollisions`. |
| [`data/court.ts`](../src/lib/data/court.ts) | Dimensions structurelles du terrain (FIBA) | `COURT 600×560`, `FULL_COURT_HEIGHT = 1080`, `HOOP {300,75}`, `HOOP_OPPOSITE`, `THREE_POINT_RADIUS = 250`, `PAINT`, `FT_LINE_Y`, `RESTRICTED_AREA_RADIUS`, `CENTER_CIRCLE_RADIUS`, etc. |
| [`engine.ts`](../src/lib/logic/engine.ts) (section bas) | Application des contraintes | `effectiveDefensePositions` : path arc length, friction, maxSpeed, closeoutBoost |

### Constantes physiques

#### Échelle
- `PX_PER_M = 37` — 1 mètre = 37 pixels. Dérivé du diamètre du cercle restrictif (1,25 m → 46 px).
- Demi-terrain canonique : 600 × 560 px ≈ **15,0 m × 15,1 m** (proche FIBA 15×14 m).
- Terrain complet : 600 × 1080 px ≈ **15 m × 28 m**.

#### Joueurs
- `PLAYER_RADIUS = 16` px ≈ **43 cm** — rayon du cercle joueur (silhouette épaule à épaule).
- Vitesses max par défaut (`defaultRules`) en px/étape : meneur 145, arrière 130, ailier 110, ailier fort 90, pivot 75. À 30 fps × 2000 ms par étape (`PLAYBACK_STEP_DURATION_MS`), le meneur couvre ~145 px ≈ **3,9 m/étape ≈ 2,0 m/s** (volontairement bas — c'est de la position tactique, pas du sprint).
- `closeoutBoost = 1.4` × `closeoutProfileBonus` (1.15 sur shooter, 0.85 sur non-shooter).
- Borné par `proximityFriction` qui multiplie la vitesse par un facteur ∈ [0, 1] selon la proximité d'obstacles non-matchés.

#### Ballon
- `BALL_RADIUS = 7` px ≈ **19 cm**.
- Trajectoire en parabole pendant les passes (`computeBallFrame`) — hauteur de l'arc proportionnelle à la distance.

#### Écrans
- `screenRadius = 35` px (default, configurable) ≈ **95 cm** — distance max screener ↔ carrierDef pour qu'un écran soit détecté.
- `MIN_TARGET_DIST = PLAYER_RADIUS × 2 + 2 = 34` px ≈ **92 cm** — clearance minimale entre deux joueurs.

### Pipeline de contrainte (`effectiveDefensePositions`)

Pour chaque défenseur, à chaque étape :

1. **Pré-relaxation** : si la cible idéale est à < `MIN_TARGET_DIST` d'un attaquant non-matché, on la repousse via `pushOutOfMany`.
2. **Path arc length** : si le segment from→to traverse un cluster d'écran, on calcule la longueur de la courbe Bezier qui contourne. Le défenseur "paie" le détour.
3. **Friction de proximité** : `proximityFriction(from, to, obstacles)` réduit la vitesse max si le trajet frôle un joueur non-matché. Modélise le contact épaule.
4. **MaxSpeed** : `effectiveMaxSpeed = (rule.maxSpeed × closeoutBoost × profileBonus) × friction`. Si `pathLen > effectiveMaxSpeed`, le défenseur s'arrête en chemin et reçoit `late=true`.
5. **Solveur de collisions final** : `resolvePlayerCollisions` itère pour qu'aucun défenseur ne se superpose à un autre joueur (sauf son matchedTo).

> **Note J.3 (2026-05-15)** : depuis la phase J.3, toutes les passes
> de projection (`pushOutOfMany`, `pushOutOfScreenContact`,
> `resolvePlayerCollisions`) délèguent à
> [`constraintSolver.ts`](../src/lib/logic/constraintSolver.ts) qui
> expose deux primitives unifiées : `solvePointConstraints` (un point +
> obstacles + demi-plan optionnel) et `solveEntityCollisions`
> (entités mobiles + obstacles statiques). Les wrappers historiques
> gardent leurs noms pour préserver les appels existants, mais la
> logique itérative ne vit plus dans `geometry.ts`. Bénéfices :
> moins de surface d'attaque pour les régressions latérales (cf. fix
> UCLA cut), socle commun pour faire évoluer la stratégie de
> projection (ex : passer à SoR ou QP léger). Détails dans
> [SCREEN-ENGINE § J.3](SCREEN-ENGINE.md).

**Côté attaquants** (depuis P6) : pendant l'interpolation A→B dans [`CourtView.tsx`](../src/components/CourtView.tsx), `pickBlockingCluster` + `curveAroundObstacle` génèrent une trajectoire Bezier qui contourne les autres joueurs. Pas de `maxSpeed` (l'utilisateur garde la liberté de placement) ; un diagnostic warning s'affiche si saut > 4 m sur une étape.

#### Trajectoires d'attaquants au playback (`attackerTrajectoryAt`)

[`playbackTrajectory.ts`](../src/lib/logic/playbackTrajectory.ts) résout la position d'un attaquant à un instant `localT ∈ [0, 1]` selon l'annotation de mouvement présente sur l'étape :

| Type d'annotation | Sans `waypoints` | Avec `waypoints` |
|---|---|---|
| `cut` | Lerp linéaire `from → to` | `samplePolyline([from, ...waypoints, to], t)` — Catmull-Rom reparamétré en longueur d'arc |
| `dribble` | `sampleDribbleWave(from, to, t)` — wave Q-Bezier ([dribbleWave.ts](../src/lib/logic/dribbleWave.ts)) | `samplePolyline(...)` (la wave standard ne s'applique pas à une polyline ; l'utilisateur a dessiné explicitement la trajectoire) |
| `screen` | Vitesse double sur la première moitié pour atteindre `to` à `t=0.5`, puis hold | Idem mais via `samplePolyline` sur la première moitié |
| absent | idle (position constante = `step.off[id]`) | — |

Le flag `isScreening: true` est posé à `t ≥ 0.5` pour `screen` — propagé à `Player.tsx` pour activer la posture d'écran (orientation perpendiculaire, regard vers le défenseur du porteur).

#### Suivi temps-réel des défenseurs (`followDefendersAtFrame`)

Sans cet override, l'interpolation défensive entre les positions calculées aux étapes A et B serait **strictement linéaire** — le défenseur prendrait la corde des arcs offensifs. La fonction réécrit la position de marquage de chaque défenseur en marquage individuel à chaque frame :

- **Carrier defender** → `carrierDefenderTarget(rule.vsCarrier, off[carrier], dist, hoop)`
- **Off-ball** → `offBallStanceTarget(matchedAtt, ball, dist, stance, hoop)` ou `manTarget(matchedAtt, dist, hoop)`
- **Skip** si `defenseOverrides[dId]` posé sur idxA ou idxB (placement manuel prime)

Appelée dans CourtView (playFrame + scrubFrame) avant `resolvePlayerCollisions` et `recomputeDefenseFrameOrientations`. Voir [logique-defensive.md > Suivi temps-réel](logique-defensive.md#suivi-temps-réel-des-défenseurs-en-lecture-followdefendersatframe).

---

## Orchestration

Le point d'entrée unique pour le rendu est :

```ts
effectiveDefensePositions(state: AppState, stepIdx: number) : ComputedDefense
computeAttackerVisuals(state: AppState, stepIdx: number)   : ComputedAttackerVisuals
```

L'ordre interne (cf. [logique-defensive.md § Pipeline de calcul](logique-defensive.md#pipeline-de-calcul)) :

1. **`computeDefenseTargets`** (man) calcule les **cibles individuelles** (manTarget / carrierDefenderTarget / offBallStanceTarget + help blend).
2. Applique les **couvertures d'écran porteur** (`applyScreenAdjustment`).
3. Applique les **rotations PnR collectives** (`computePnRRotations`).
4. Applique les **couvertures off-ball** (`applyOffBallScreenAdjustment`).
5. Applique les **traps** (`trapTarget`).
6. Applique les **directives défensives scriptées** (`applyDirective`) : si `state.defenseScriptedDirectivesEnabled === true` et que `step.defensiveDirectives` contient des directives pour ce step, l'engine ajuste les positions cibles des défenseurs concernés (help-and-recover, pre-switch, trap, tag) avant le moteur physique. Les directives sont produites par `defensiveCompilation.ts` lors de `compileScenario`.
7. **Recalcul d'orientation post-pass** avec position finale + pnrRole.
8. **`effectiveDefensePositions`** applique le **moteur physique** (path arc, friction, maxSpeed, collisions).

Pour la zone, étape 1 est remplacée par `computeZoneDefenseTargets` (ownership continu).

---

## Métriques tactiques (read-only)

Couche d'**analyse** parallèle aux trois couches d'exécution. Calcule
des indicateurs collectifs (forme, dispersion, couloirs) sans muter
aucune position. **Aucun module du moteur ne l'importe** au
2026-05-13 — la couche est livrée comme fondation, en attente de
branchements (voir plus bas).

Localisation : [`src/lib/logic/tactical/`](../src/lib/logic/tactical/).
Doc complète des concepts, conventions de signe et seuils :
[TACTICAL-METRICS.md](TACTICAL-METRICS.md).

### Modules

- **[`spacingGraph.ts`](../src/lib/logic/tactical/spacingGraph.ts)** —
  graphe complet d'une équipe (matrice de distances), métriques
  dérivées (`totalSpacing`, `avgPairwiseDistance`,
  `maxPairwiseDistance`, `centralityScores`, `pivotPlayer`). Convex
  hull par Andrew monotone chain en `O(n log n)`, surface (formule du
  lacet), test point-dans-polygone (ray-casting).
- **[`ejo.ts`](../src/lib/logic/tactical/ejo.ts)** — Espace de Jeu
  Offensif (Vandevelde). Couloir rectangulaire ballon→cible, demi-largeur
  configurable (1.5 m = `EJO_CORRIDOR_NARROW_PX = 55.5`, 2.5 m =
  `EJO_CORRIDOR_WIDE_PX = 92.5`). Distance signée à l'axe avec
  convention `+` = côté droit du déplacement. `corridorBlockers`
  retourne les défenseurs dans le couloir, triés par distance au
  ballon.
- **[`ejp.ts`](../src/lib/logic/tactical/ejp.ts)** — Espace de Jeu
  Proche, repère égocentré du porteur. 8 secteurs métier (front,
  frontRight, right, backRight, back, backLeft, left, frontLeft) de
  45° chacun. `readEJP(carrier, bodyDeg, defender)` retourne
  `{ distance, sector, bearingDeg }`.
- **[`levelHeuristic.ts`](../src/lib/logic/tactical/levelHeuristic.ts)** —
  bucket qualitatif `grappe | comete | etalement | expert` dérivé du
  diamètre, de l'aire EJE et de la distance moyenne. Seuils exportés
  pour calibration future.

### Garanties

- **Pures, sans effet de bord** : aucune lecture `AppState`, aucune
  mutation, aucun side-effect.
- **Aucune dépendance sortante** vers le moteur — seulement
  [`geometry.ts`](../src/lib/logic/geometry.ts) (pour `distance`) et
  [`angles.ts`](../src/lib/logic/angles.ts) (pour `normalizeAngle`).
- **Trivialement compatible avec la
  [Règle 1 anti-superposition](PLAYER-CLEARANCE.md)** puisqu'aucune
  fonction ne mute de position.

### Tests

[`tacticalMetrics.test.ts`](../src/lib/logic/__tests__/tacticalMetrics.test.ts)
— 23 cas couvrant les 4 modules. Cas dégénérés explicites : 3 points
colinéaires → hull de 2 sommets ; ballon == cible → `inCorridor`
retourne `false` ; rotation du porteur reclasse les défenseurs sans
changer leur position absolue.

### Branchements prévus (plans séparés)

1. **Enrichir [`offense.ts`](../src/lib/logic/offense.ts)** : pénalité
   `corridorBlockers` sur `driveShotQ` ; bonus/malus de `receivability`
   selon `readEJP(receiver, …).sector` sur les passes.
2. **Auto-positionnement attaquants hors-ballon** : nouveau module
   `autoOffense/` optimisant `totalSpacing` sur un anneau autour du
   panier compatible avec le profil de chaque joueur. Application
   obligatoire via `moveAttackerInState` pour le push-out anti-overlap.
3. **Overlay debug** (optionnel) : composant `EJEOverlay.tsx`
   dessinant hull + couloir + badge niveau, toggle dans le panneau
   Visualisation.

---

## Pour étendre

- **Ajouter un comportement individuel** : nouveau cas dans `manDefense.ts` (stance) ou `help.ts` (régime), nouveau test ciblé, mise à jour du `ContextMenu` si visible côté UI.
- **Ajouter une rotation collective** : module dédié style `pnrRotations.ts`, appel orchestré depuis `engine.ts`. Le rôle peut être tagué dans `ComputedDefender.pnrRole` (ou un nouveau champ).
- **Tuner la physique** : modifier les valeurs dans `defaultRules` (vitesses), `closeoutBoost`, ou les seuils `screenRadius` / `screenRadius` / `proximityFriction`. Les tests d'invariants ([`invariants.test.ts`](../src/lib/logic/__tests__/invariants.test.ts)) attrapent les régressions globales.
- **Tuner la physique** : tout est dans [`data/physics.ts`](../src/lib/data/physics.ts), un seul point d'entrée. Voir [physics.md](physics.md) pour les valeurs réelles (m/s, mètres) et le guide de tuning.
