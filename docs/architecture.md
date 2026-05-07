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
│   ├── ui.tsx            # primitives partagées (Panel, Section, Slider, Button)
│   ├── OffensePanel.tsx  # panneau gauche — orange, attaque
│   ├── DefensePanel.tsx  # panneau droit — bleu, défense
│   ├── CourtView.tsx     # SVG interactif du terrain
│   ├── Court.tsx         # arrière-plan terrain (lignes)
│   ├── Player.tsx        # cercle + bras défensifs + ballon
│   ├── Annotations.tsx   # flèches passe/dribble/course/écran
│   ├── Overlays.tsx      # matchups, lignes d'aide, écran indicators, zones
│   ├── Timeline.tsx      # scrubber horizontal sous le terrain
│   ├── ContextMenu.tsx   # menu clic-droit sur défenseur
│   ├── StepThumbnail.tsx # rendu statique réutilisable (export)
│   └── PlaybookView.tsx  # overlay export PDF
├── hooks/
│   └── useAppState.ts    # état central + tous les callbacks
└── lib/
    ├── data/
    │   ├── court.ts          # constantes terrain, panier, dimensions
    │   ├── initial.ts        # AppState par défaut
    │   ├── zones.ts          # polygones des zones (2-3, 1-3-1, etc.)
    │   └── templates.ts      # bibliothèque systèmes (PNR, Horns, Pindown)
    ├── logic/                # MOTEUR PUR (aucun React)
    │   ├── engine.ts         # orchestration : appelle tous les autres
    │   ├── manDefense.ts     # marquage individuel + stances
    │   ├── help.ts           # logique d'aide (sag baseline + triggers)
    │   ├── triggers.ts       # détection drive / post-up / paint
    │   ├── screens.ts        # détection + ajustement écrans (porteur + non-porteur)
    │   ├── zoneDefense.ts    # logique de zone (mapping, rotation)
    │   └── geometry.ts       # utilitaires : distance, clamp, lerp, ballSide
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
- Testable isolément (cf. [testing.md](testing.md) — 79 tests Vitest sur engine, screens, metrics, help, trap, manDefense, geometry)
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
