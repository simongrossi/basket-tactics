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
│   ├── CourtView.tsx             # SVG interactif du terrain
│   ├── Court.tsx                 # arrière-plan terrain (lignes)
│   ├── Player.tsx                # cercle + bras défensifs + ballon
│   ├── Annotations.tsx           # flèches passe/dribble/course/écran
│   ├── Timeline.tsx              # scrubber horizontal sous le terrain
│   ├── ContextMenu.tsx           # menu clic-droit sur défenseur
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
│   └── useAppState.ts    # état central + tous les callbacks
└── lib/
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
    │   │   — Cœur défensif —
    │   ├── engine.ts                   # orchestration : appelle tous les autres + suivi runtime (followDefendersAtFrame, recomputeDefenseFrameOrientations)
    │   ├── manDefense.ts               # marquage individuel + stances
    │   ├── help.ts                     # logique d'aide (sag baseline + triggers)
    │   ├── triggers.ts                 # détection drive / post-up / paint
    │   ├── screens.ts                  # détection + ajustement écrans (porteur + non-porteur). 'hedge' bouge D5 (show) ET D1 (over the top).
    │   ├── zoneDefense.ts              # logique de zone (mapping, rotation)
    │   ├── trap.ts                     # choix du défenseur en aide-trap
    │   ├── metrics.ts                  # métriques défensives (gap, paint coverage, passes)
    │   ├── orientation.ts              # calcul des orientations O et D (corps + regard + bras)
    │   ├── vision.ts                   # vision humaine : clamp ±60°, cône 120°, regard distance-based
    │   ├── geometry.ts                 # utilitaires : distance, clamp, lerp, ballSide
    │   │
    │   │   — Trajectoires et lecture —
    │   ├── playbackTrajectory.ts       # position interpolée d'un attaquant à t selon ses annotations
    │   ├── polyline.ts                 # spline Catmull-Rom (V-cut, freehand) : sample, path, simplify
    │   ├── dribbleWave.ts              # wave Q-Bezier du dribble (sans waypoints)
    │   │
    │   │   — Actions défensives scriptées —
    │   ├── applyDirective.ts           # application d'une directive défensive à l'engine
    │   ├── defensiveCompilation.ts     # compilation des actions scriptées → directives
    │   ├── defensiveDefaults.ts        # valeurs par défaut des actions défensives
    │   ├── scriptedActionMigration.ts  # migration des anciens formats d'actions
    │   ├── scriptedGenerators.ts       # générateurs d'actions scriptées (PNR, etc.)
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
    │   └── coachDiagnostics.ts         # génération des avertissements coach
    └── types/
        └── index.ts          # tous les types
```

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

Toute la logique défensive (engine.ts, screens.ts, etc.) est **pure** : entrée = `AppState`, sortie = positions. Aucun hook React, aucun localStorage, aucun side-effect.

Avantages :
- Testable isolément (cf. [testing.md](testing.md) — ~198 tests Vitest dans 21 fichiers : engine, screens, metrics, help, trap, manDefense, geometry, threats, offense, simulator, orientation, zone, directives défensives scriptées…)
- Réutilisable en SSR / export PDF / preview
- Le rendu peut s'appuyer dessus sans gérer d'état intermédiaire

## Cycle de calcul d'une étape

```
computeDefenseTargets(state, stepIdx)
├── Branche zone ──→ computeZoneDefenseTargets()
└── Branche man (par défaut)
    ├── getMatchupsAt(steps, stepIdx-1)        # cumule les switches passés
    ├── detectScreen(...)                       # écran sur porteur ?
    ├── applySwitch() si rule === 'switch'
    ├── pour chaque défenseur :
    │   ├── isCarrierDefender ?
    │   │   ├── oui → carrierDefenderTarget(rule.vsCarrier, ...)
    │   │   └── non → offBallStanceTarget OU manTarget + computeHelpTarget
    │   └── applyScreenAdjustment() si concerné
    └── detectOffBallScreens(...)               # écrans non-porteur
        └── applyOffBallScreenAdjustment() ou applySwitchOffBall()
```

`effectiveDefensePositions` ajoute par-dessus :
- contrainte de vitesse max → si la cible est trop loin, le défenseur reste en chemin et est marqué `late: true`

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
