# Architecture

## Stack

- **Next.js 14** (App Router) — application client-only, pas de backend
- **React 18** — UI déclarative
- **TypeScript** strict — typage des positions, règles, états
- **SVG natif** — rendu du terrain et des joueurs (pas de Canvas, pas de WebGL)
- **localStorage** — persistance unique de l'état
- **Pas de bibliothèque UI** — tous les styles inline ou en CSS modules

## Pourquoi SVG plutôt que Canvas ?

- Le terrain est un schéma vectoriel (lignes, cercles, arcs) → SVG est natif
- Les annotations sont quelques flèches/courbes → trivial en SVG
- Le clic droit, le drag, les hover events sont gérés par le DOM → simple
- Le rendu reste lisible à l'export PDF (pas de pixellisation)
- Performance acceptable jusqu'à 50+ éléments animés (largement suffisant pour 10 joueurs)

## Structure des dossiers

```
src/
├── app/
│   ├── layout.tsx        # racine Next.js
│   └── page.tsx          # point d'entrée — orchestre tout
├── components/
│   ├── ui.tsx                    # primitives partagées (Panel, Section, Slider, Button)
│   │
│   │   — Panneaux latéraux —
│   ├── OffensePanel.tsx          # panneau gauche — orange, attaque
│   ├── DefensePanel.tsx          # panneau droit — bleu, défense
│   ├── ScenarioPanel.tsx         # panneau scénario (directives scriptées)
│   ├── LibraryPanel.tsx          # panneau bibliothèque de systèmes
│   ├── MetricsBar.tsx            # barre de métriques défensives
│   ├── ParametresPanel.tsx       # panneau paramètres avancés
│   ├── SimulationSection.tsx     # section simulation Monte Carlo
│   │
│   │   — Terrain SVG interactif —
│   ├── CourtView.tsx             # câblage : viewBox + overlays + clic-droit (446 l)
│   ├── court/                    # sous-composants de CourtView (cf. § CourtView)
│   │   ├── CourtPlayersLayer.tsx #   sprites + screener gaze override
│   │   └── CourtMenus.tsx        #   context menus (def/att) + zone region menu
│   ├── Court.tsx                 # arrière-plan terrain (lignes)
│   ├── Player.tsx                # cercle + bras défensifs + ballon
│   ├── Annotations.tsx           # flèches passe/dribble/course/écran
│   ├── Timeline.tsx              # scrubber horizontal sous le terrain
│   ├── ContextMenu.tsx           # dispatch defender / attacker (22 l)
│   ├── contextMenu/              # menus contextuels (cf. § ContextMenu)
│   │   ├── popupHooks.ts         #   useClampedPosition + useDraggablePopup
│   │   ├── ToolBar.tsx           #   barre d'outils move/pass/dribble/cut/screen
│   │   ├── sharedRows.tsx        #   Row + OverrideSliderRow + GazeLockButton
│   │   ├── DefenderMenu.tsx      #   17 rows tactiques défenseur
│   │   └── AttackerMenu.tsx      #   carrier / screener / profil / orientation / main
│   ├── StepThumbnail.tsx         # rendu statique réutilisable (export)
│   │
│   │   — Overlays SVG —
│   ├── Overlays.tsx              # matchups, lignes d'aide, écran indicators, zones
│   ├── HeatmapOverlay.tsx        # heatmap de danger offensif
│   ├── ThreatOverlay.tsx         # visualisation des menaces (Phase A)
│   ├── PassLanesOverlay.tsx      # lignes de passe ouvertes/contestées
│   ├── FieldOfViewOverlay.tsx    # cônes de vision des défenseurs
│   ├── BestActionOverlay.tsx     # meilleure action offensive simulée
│   ├── ZoneCoverage.tsx          # dessin des zones de couverture
│   ├── ZoneEditOverlay.tsx       # édition interactive des zones
│   ├── ActionOrderBadges.tsx     # badges d'ordre des actions scriptées
│   │
│   │   — Modales et lanceurs —
│   ├── AddCoverageModal.tsx      # modale ajout de couverture défensive
│   ├── LibraryModal.tsx          # modale bibliothèque / import de systèmes
│   ├── FloatingActionsMenu.tsx   # menu flottant d'actions rapides
│   ├── ParametresLauncher.tsx    # bouton/lanceur du panneau paramètres
│   │
│   │   — Formulaires défensifs —
│   ├── DefensiveActionForm.tsx   # formulaire d'action défensive scriptée
│   ├── ScenarioReader.tsx        # lecture/affichage d'un scénario compilé
│   │
│   │   — Debug / diagnostics —
│   ├── CoachDiagnostics.tsx      # diagnostics coach (avertissements tactiques)
│   └── HelpDebugOverlay.tsx      # overlay de debug des vecteurs d'aide
├── hooks/
│   ├── useAppState.ts             # état central — persistance + history + câblage transforms (510 l)
│   ├── useCourtFrame.ts           # calcule staticFrame / scrubFrame / playFrame (+ threats)
│   └── useCourtPointerHandlers.ts # drag joueurs + tracé d'annotations (rAF-coalesced)
└── lib/
    ├── state/transforms/          # transformations pures AppState → AppState (cf. § useAppState)
    │   ├── index.ts               #   barrel — namespaces par domaine
    │   ├── shared.ts              #   markStepAsManual + recompileScenarioSteps + mutateActionsScope
    │   ├── stepTransforms.ts      #   CRUD step + label + ballCarrier
    │   ├── annotationTransforms.ts#   CRUD annotation + timing / quality / phase + forcedScreener
    │   ├── defenseTransforms.ts   #   rules / profils / presets / système / switchs / overrides
    │   ├── attackerTransforms.ts  #   hand / orientation / profil offensif
    │   ├── zoneTransforms.ts      #   overrides régionaux + zoneConfig
    │   ├── scenarioTransforms.ts  #   actions scriptées + branches (branch-aware)
    │   ├── defensiveScriptedTransforms.ts # actions défensives scriptées
    │   └── coreTransforms.ts      #   tool / template / import / patch / playerCount / resetAll
    ├── data/
    │   ├── court.ts                    # constantes terrain, panier, dimensions
    │   ├── initial.ts                  # AppState par défaut
    │   ├── zones.ts                    # polygones des zones (2-3, 1-3-1, etc.)
    │   ├── templates.ts                # bibliothèque systèmes (PNR, Horns, Pindown)
    │   ├── library.ts                  # gestion persistence bibliothèque locale
    │   ├── physics.ts                  # constantes physiques (vitesse, radius)
    │   ├── defenderProfiles.ts         # profils défenseurs (vitesse, portée)
    │   ├── defensePresets.ts           # préréglages de stratégie défensive
    │   ├── defensiveActionsCatalog.ts  # catalogue des actions défensives scriptées
    │   └── scriptedActionsCatalog.ts   # catalogue des actions offensives scriptées
    ├── logic/                # MOTEUR PUR (aucun React)
    │   │   — Cœur défensif (orchestrateur + couches) —
    │   ├── engine.ts                   # orchestrateur 117 l : compose les couches via le pipeline
    │   ├── attackerVisuals.ts          # orientation des attaquants par rôle (carrier/passer/cutter/screener/idle)
    │   ├── defense/
    │   │   ├── types.ts                # type partagé DefenderTarget
    │   │   ├── context.ts              # DefenseFrameContext + buildDefenseFrameContext (setup phase)
    │   │   ├── baseTargets.ts          # couche 1 : base man-to-man + help + screen-on-target + orientation initiale
    │   │   ├── pnrLayer.ts             # couche 2 : rotations PnR (low-man tag + X-out + nail stunt)
    │   │   ├── offBallScreenLayer.ts   # couche 3 : écrans hors-ballon (mute matchups si switch)
    │   │   ├── trapLayer.ts            # couche 4 : trap auto en zone de trappe
    │   │   ├── directiveLayer.ts       # couche 5 : directives défensives scriptées (step.defensiveDirectives)
    │   │   ├── postPassOrientation.ts  # couche 6 : recalcul orientation final depuis positions ajustées
    │   │   ├── zoneTargets.ts          # branche zone (ownership polygonal + tracking d'attaquant)
    │   │   ├── speedConstraint.ts      # effectiveDefensePositions : vitesse max + closeout + friction + collisions
    │   │   └── frameAdjust.ts          # followDefendersAtFrame + recomputeDefenseFrameOrientations (post-passes playback)
    │   │
    │   │   — Briques métier consommées par les couches —
    │   ├── manDefense.ts               # marquage individuel + stances
    │   ├── help.ts                     # logique d'aide (sag baseline + triggers)
    │   ├── triggers.ts                 # détection drive / post-up / paint
    │   ├── screens/                    # moteur d'écrans — découpé en 5 modules (cf. § Moteur d'écrans)
    │   │   ├── index.ts                #   barrel — re-exporte l'API publique
    │   │   ├── helpers.ts              #   intent filter, smoothstep, push-out clearance
    │   │   ├── detectCarrierScreen.ts  #   detectScreen (PnR / drag / ghost)
    │   │   ├── carrierScreenAdjust.ts  #   applyScreenAdjustment + peelSwitchShouldFire + applySwitch
    │   │   ├── detectOffBallScreens.ts #   detect + upgrade stagger / elevator / flex / hammer
    │   │   └── offBallScreenAdjust.ts  #   applyOffBallScreenAdjustment + applySwitchOffBall
    │   ├── zoneDefense.ts              # ownership polygonal de zone
    │   ├── trap.ts                     # choix du défenseur en aide-trap
    │   ├── metrics.ts                  # métriques défensives (gap, paint coverage, passes)
    │   ├── orientation.ts              # calcul des orientations O et D (corps + regard + bras)
    │   ├── vision.ts                   # vision humaine : clamp ±60°, cône 120°, regard distance-based
    │   ├── angles.ts                   # math angulaire pur partagé (normalizeAngle, angleDiff, lerpAngleDeg)
    │   ├── geometry.ts                 # utilitaires : distance, clamp, lerp, ballSide
    │   │
    │   │   — Détection d'événements —
    │   ├── events/
    │   │   └── triggerDetector.ts      # detectStepScreenAction (écran porteur + classification d'action)
    │   │
    │   │   — Trajectoires et lecture (playback) —
    │   ├── playbackTrajectory.ts       # position interpolée d'un attaquant à t selon ses annotations
    │   ├── polyline.ts                 # spline Catmull-Rom (V-cut, freehand) : sample, path, simplify
    │   ├── dribbleWave.ts              # wave Q-Bezier du dribble (sans waypoints)
    │   ├── playback/
    │   │   └── frameResolver.ts        # resolveFrameAt(state, t) — fonction pure unifiée play+scrub
    │   │
    │   │   — Actions défensives scriptées —
    │   ├── applyDirective.ts           # application d'une directive défensive à l'engine
    │   ├── defensiveCompilation.ts     # compilation des actions scriptées → directives
    │   ├── defensiveDefaults.ts        # valeurs par défaut des actions défensives
    │   ├── scriptedActionMigration.ts  # migration des anciens formats d'actions
    │   ├── scriptedGenerators.ts       # barrel — câblage action FIBA → générateur (92 l)
    │   ├── scriptedGenerators/         # 57 générateurs scriptés, découpés par tier
    │   │   ├── helpers.ts              #   géométrie commune + types Generator
    │   │   ├── tier1.ts                #   19 actions de base (PnR, cuts, screens, drive…)
    │   │   ├── tier2.ts                #   30 variantes (off-ball, PnR variants, combos…)
    │   │   └── tier3.ts                #   9 sets d'entrée (horns, floppy, pistol, ucla…)
    │   ├── compileScenario.ts          # compilation complète d'un scénario
    │   ├── pnrRotations.ts             # rotations défensives sur PNR
    │   ├── screenAction.ts             # logique d'action sur écran
    │   │
    │   │   — Simulation (Phases A/B/C) —
    │   ├── threats.ts                  # Phase A : score de menace par attaquant
    │   ├── offense.ts                  # Phase B : EV des actions offensives
    │   ├── simulator.ts                # Phase C : Monte Carlo de possessions (PPP)
    │   ├── tacticalReads.ts            # lectures tactiques offensives
    │   │
    │   │   — Zone et situations —
    │   ├── zoneSituations.ts           # détection de situations de zone (overload, skip)
    │   └── coachDiagnostics/           # diagnostics coach — registry de règles (cf. § Diagnostics coach)
    │       ├── index.ts                #   orchestrateur + registry + computeCoachDiagnostics
    │       ├── types.ts                #   CoachDiagnostic, CoachSeverity, Rule, RuleContext
    │       ├── helpers.ts              #   profileTag, withProfile, sideOf, isCornerAttacker
    │       └── rules/                  #   13 règles, une par fichier (closeoutLong, switchMismatch, …)
    ├── constants/
    │   └── gameplay.ts                 # DRIBBLE_THRESHOLD_PX, POST_HOLD_THRESHOLD_PX
    └── types/
        └── index.ts                    # tous les types
```

## Modularité & refactoring

Plusieurs fichiers stratégiques ont été éclatés en sous-modules au fil des
itérations. Trois motifs reviennent :

### 1. Barrel + dossier (logique métier dense)

Quand un fichier de logique pure dépasse ~700 lignes ET contient plusieurs
domaines distincts, on le remplace par un dossier homonyme avec un `index.ts`
de ré-export. Les imports `from '@/lib/logic/<name>'` continuent de marcher
sans modification (résolution `<name>/index.ts`).

Exemples :
- **`screens/`** (ex `screens.ts` 822 l → 5 modules) — `detectCarrierScreen`,
  `carrierScreenAdjust`, `detectOffBallScreens`, `offBallScreenAdjust`,
  `helpers`. Ajouter une nouvelle rule défensive = éditer 1 fichier ciblé.
- **`scriptedGenerators/`** (ex `scriptedGenerators.ts` 1502 l → tier1/2/3 +
  helpers + barrel 92 l) — ajouter une action FIBA = éditer 1 sous-fichier +
  1 ligne de câblage.

### 2. Transformations pures + hook mince (state React)

Le hook `useAppState` ne fait plus que persistance + history + câblage. Toute
la **logique métier** des mutations d'état vit dans `lib/state/transforms/`,
sous forme de fonctions pures `(state, ...args) => state`. Le hook ré-expose
chacune via `useCallback((args) => setStateWithHistory(s => stepTx.foo(s, args)))`.

Bénéfices :
- Transformations testables sans React (`stepTx.addStep(initialState)`).
- Le hook devient lisible : ~20 lignes par section au lieu de 967 entremêlées.
- API publique inchangée : zero risque côté callers (page.tsx, CourtView…).

### 3. Hooks + sous-composants (gros composant React)

Quand un composant React dépasse ~700 lignes et mélange état pointer / calcul
de frame / rendu, on extrait :
- Les sources d'état → **hooks dédiés** (`useCourtFrame`, `useCourtPointerHandlers`).
- Les sections de JSX → **sous-composants** (`<CourtPlayersLayer>`,
  `<CourtMenus>`, `contextMenu/DefenderMenu`, `contextMenu/AttackerMenu`).
- Les helpers de layout réutilisés → **modules partagés** (`sharedRows.tsx`,
  `popupHooks.ts`).

Exemples : **`CourtView`** (902 → 446 l), **`ContextMenu`** (897 → 22 l).

### Bilan des refontes

| Fichier | Avant | Après | Modules extraits |
|---|---:|---:|---|
| `scriptedGenerators.ts` | 1502 | 92 | helpers + tier1 + tier2 + tier3 |
| `useAppState.ts` | 967 | 510 | 8 namespaces `state/transforms/` (purs) |
| `CourtView.tsx` | 902 | 446 | `useCourtFrame` · `useCourtPointerHandlers` · `<CourtPlayersLayer>` · `<CourtMenus>` |
| `ContextMenu.tsx` | 897 | 22 | popupHooks + ToolBar + sharedRows + DefenderMenu + AttackerMenu |
| `screens.ts` | 822 | barrel | helpers + 2 detect + 2 adjust |
| `coachDiagnostics.ts` | 834 | barrel + 13 rules | registry pattern, 1 fichier par règle |

### Pattern 4 — Registry de règles (coachDiagnostics)

Quand un fichier contient une **liste numérotée de règles** indépendantes
qui consomment toutes le même contexte (ex: "1. closeout long", "2. switch
mismatch", "3. pick-and-roll", …), on extrait :

- Un **type `Rule`** = `(ctx: RuleContext) => CoachDiagnostic[]` (signature commune).
- Un **`RuleContext`** = données pré-calculées une seule fois par étape
  (positions, défenseurs actifs, profils, hoop…).
- Une **règle par fichier** dans `rules/<name>.ts` (chacune purement testable).
- Un **registry** (`Rule[]` ordonné) dans `index.ts` qui itère et concatène.

Bénéfices :
- Ajouter une règle = créer 1 fichier + 1 entrée dans le tableau.
- Chaque règle est testable unitairement sans monter tout le moteur.
- L'ordre du registry est explicite et documenté (utile pour les dédups
  post-collecte type "corner-* prime sur pass-open").

## Flux de données

```
User input (drag, click, slider)
  ↓
useAppState callbacks
  ↓
setState immutable
  ↓
useEffect [state] → localStorage (debounce 400ms)
  ↓
Re-render des composants qui dépendent de state
  ↓
CourtView → effectiveDefensePositions(state, activeStep)
  ↓
Le moteur recalcule les positions défensives à chaque frame
```

### Lecture (playback)

Le RAF de lecture vit dans `CourtView`. Il utilise un **`stateRef.current`** (pas une dépendance d'effet) pour accéder à la version courante de `state` sans redémarrer la boucle à chaque mutation.

À chaque tick :
- calcul du `globalT` (fraction d'étape écoulée)
- interpolation des positions O et D entre `idxA` et `idxB`
- `setPlayFrame(...)` met à jour la frame locale
- `onPlaybackTick(globalT)` remonte vers la page

La page stocke `playbackT` et le passe à la `Timeline` qui affiche le playhead qui avance.

### Overrides défense

L'utilisateur peut **drag** un défenseur sur le terrain → la position est écrite dans `state.steps[activeStep].defenseOverrides[D_i]`. Pour cette étape, l'engine **respecte** l'override : pas de calcul de cible, pas de lateness. Le défenseur est marqué visuellement avec un petit cadenas. Pour réauto-positionner, clic-droit → "↻ ré-auto-positionner".

### Pourquoi le moteur est-il pur ?

Toute la logique défensive (engine.ts, defense/*.ts, screens/, etc.) est **pure** : entrée = `AppState`, sortie = positions. Aucun hook React, aucun localStorage, aucun side-effect.

Avantages :
- Testable isolément (cf. [testing.md](testing.md) — 541 tests Vitest dans 46 fichiers : engine, screens, metrics, help, trap, manDefense, geometry, threats, offense, simulator, orientation, zone, directives défensives scriptées…)
- Réutilisable en SSR / export PDF / preview
- Le rendu peut s'appuyer dessus sans gérer d'état intermédiaire

## Cycle de calcul d'une étape

`computeDefenseTargets(state, stepIdx)` est un **orchestrateur** qui compose un pipeline de couches indépendantes (`src/lib/logic/defense/`). Chaque couche prend le contexte de frame en lecture, et mute le record `positions` (et éventuellement `matchups`) en place.

```
computeDefenseTargets(state, stepIdx)
├── Branche zone ──→ computeZoneDefenseTargets()
└── Branche man (par défaut) :
    │
    │   ── Setup ──
    ├── buildDefenseFrameContext(state, stepIdx)
    │   ├── getMatchupsAt(steps, stepIdx-1)        # cumule les switches passés
    │   ├── prevDefenderPositions (récursion N-1, ou setup si N=0)
    │   ├── detectScreen + détermine effectiveScreenRule
    │   ├── applySwitch() si rule === 'switch' (matchup local seulement)
    │   ├── detectedSwitch retourné pour persistance explicite
    │   ├── peelSwitchShouldFire() → switch tardif si porteur a dépassé
    │   ├── detectTriggers (drive/post/paint)
    │   └── ballSide, hoop, prevOff
    │
    │   ── Pipeline (couches enchaînées sur positions muté en place) ──
    ├── 1. applyBaseTargetsLayer
    │   └── pour chaque défenseur :
    │       ├── isCarrierDefender ? → carrierDefenderTarget(vsCarrier, …)
    │       │                       │ sinon → offBallStanceTarget OU manTarget
    │       ├── stance === 'sag' ? → computeHelpTarget (bias d'aide)
    │       ├── applyScreenAdjustment (drop/over/under/chase/blitz/hedge)
    │       ├── orientationLateralOffset (offset latéral manuel)
    │       └── computeDefenderOrientation (orientation initiale)
    │
    ├── 2. applyPnRRotationsLayer
    │   ├── detectScreenAction (roll/short-roll/slip/pop/ghost/reject/snake)
    │   └── computePnRRotations → low-man tag + X-out + nail stunt
    │
    ├── 3. applyOffBallScreenLayer
    │   ├── detectOffBallScreens
    │   └── applyOffBallScreenAdjustment OU applySwitchOffBall (mute matchups)
    │
    ├── 4. applyTrapLayer
    │   └── pickTrapHelper + trapTarget (si trigger trap + porteur en zone)
    │
    ├── 5. applyDirectiveLayer
    │   └── applyDirective(...) pour chaque step.defensiveDirectives
    │
    └── 6. applyPostPassOrientationLayer
        └── computeDefenderOrientation à partir des positions FINALES
            (pour que low-man tag pointe la zone de menace, pas son homme)
```

Chaque couche est isolée derrière une signature `(positions, [matchups,] ctx) → void` et testable indépendamment. Pour ajouter une 7ᵉ couche (ex : communication défensive) : un fichier dans `defense/` + une ligne dans le pipeline.

`effectiveDefensePositions` (`defense/speedConstraint.ts`) consomme le résultat du pipeline et ajoute :
- pré-relaxation hors des attaquants non-matchés (lever C)
- longueur d'arc autour des clusters d'écran (lever A — mêmes obstacles que le rendu du scrub)
- friction de proximité (lever B)
- closeout + over-closeout (transition de balle, modulé par profil offensif du porteur)
- contrainte de vitesse max → si la cible est trop loin, le défenseur reste en chemin et est marqué `late: true`
- solveur de collisions strict
- recompute orientation final depuis les positions effectives

## Persistance

- Clé localStorage : `basket-tactics-state-v1`
- Sérialisation : `JSON.stringify(state)`
- Sauvegarde debounce 400ms après chaque mutation
- Restauration au mount, mergée avec `makeInitialState()` pour la rétrocompatibilité (champs ajoutés ultérieurement)
- Reset complet vide le storage et restaure les valeurs par défaut

## Build / déploiement

- `npm run dev` — serveur de dev avec HMR
- `npm run build` — production statique (Next.js export)
- `npm run type-check` — `tsc --noEmit`
- L'app est entièrement statique (aucune route dynamique, aucune API), peut être servie depuis n'importe quel CDN
