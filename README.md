# Basket Tactics

Simulateur tactique de basket-ball pour observer les failles des systèmes offensifs et défensifs.
Migration du prototype développé en artifacts Claude vers un projet Next.js + TypeScript structuré.

## Stack

- **Next.js 14** (App Router) — framework React + futur backend
- **React 18** — UI
- **TypeScript** — typage strict de toute la logique métier
- **SVG natif** — rendu du terrain et des joueurs (pas de Konva, pas de Canvas)

## Démarrage

```bash
npm install
npm run dev
```

Ouvre http://localhost:3000.

```bash
npm run type-check  # vérifier les types sans build
npm run build       # build de production
npm start           # lancer le build de prod
```

## Arborescence

```
src/
├── app/
│   ├── layout.tsx                  # layout root Next
│   └── page.tsx                    # page principale (Page > ControlPanel + CourtView)
├── components/
│   ├── Court.tsx                   # SVG du terrain (lignes, raquette, panier)
│   ├── Player.tsx                  # un joueur (cercle + numéro) + balle
│   ├── Annotations.tsx             # passes/dribbles/courses/écrans dessinés
│   ├── Overlays.tsx                # matchups, lignes d'aide, indicateur d'écran
│   ├── ControlPanel.tsx            # panneau de gauche (étapes, défense, règles, visu)
│   ├── ContextMenu.tsx             # menu clic droit sur un défenseur
│   └── CourtView.tsx               # composant principal qui assemble + gère les pointer events
├── hooks/
│   └── useAppState.ts              # hook centralisé de gestion d'état
└── lib/
    ├── types/
    │   └── index.ts                # tous les types du domaine (Step, Annotation, AppState...)
    ├── data/
    │   ├── court.ts                # constantes terrain (HOOP, PAINT, dimensions)
    │   └── initial.ts              # positions et règles par défaut
    └── logic/                      # MOTEUR DE SIMULATION (fonctions pures, sans React)
        ├── geometry.ts             # helpers (distance, lerp, ballSide...)
        ├── triggers.ts             # détection des triggers d'aide (drive, post, paint)
        ├── manDefense.ts           # marquage individuel + comportements vs porteur
        ├── help.ts                 # aides côté faible
        ├── screens.ts              # détection et résolution des écrans porteurs
        └── engine.ts               # orchestrateur principal
```

Le découpage `lib/logic` vs `components/` est volontaire : tout `lib/logic/`
est du **TypeScript pur sans React**, ce qui veut dire que tu peux le tester
unitairement, le réutiliser sur un backend Node, ou le porter ailleurs sans
toucher aux composants.

## Ce qui marche déjà (Paliers 0 → 3-B)

- Placement libre des 5 attaquants et 5 défenseurs
- Système d'étapes (keyframes) avec porteur de balle qui suit les passes
- Annotations : passe (zigzag), dribble (plein), course (pointillé), écran (T)
- Lecture animée avec interpolation entre étapes
- Défense homme à homme avec :
  - Distance globale et vitesse max (visualisation des retards en rouge)
  - Triggers d'aide (drive, post-up, porteur dans la raquette)
  - Règles individuelles par défenseur (% d'aide, priorité, comportement vs porteur)
  - Édition par clic droit ou tableau
- Écrans porteurs auto-détectés avec 6 consignes : over / under / switch / hedge / drop / blitz
- Switches persistants entre étapes
- Export / import JSON
- Visualisation des matchups, lignes d'aide, écrans

## Ce qui reste à améliorer / à faire

### Comportements défensifs à affiner (TODO inline dans le code)

Dans `lib/logic/screens.ts` :

- **blitz** : géométrie du trap à améliorer, les deux défenseurs doivent former un angle qui ferme la sortie de balle
- **hedge** : modèle d'étapes ne capture pas la séquence "show puis recover", il faudrait peut-être générer une étape intermédiaire
- **drop** : profondeur configurable (ice drop vs deep drop)
- **over / under** : amplitudes à calibrer en testant avec des systèmes réels
- **détection auto** : utiliser aussi les annotations 'screen' explicites de l'utilisateur

Dans `lib/logic/help.ts` :

- **passlane** : actuellement au milieu de la ligne, devrait être décalé côté ballon
- **paint** : devrait considérer le poste bas plutôt qu'un point fixe

Dans `lib/logic/manDefense.ts` :

- Les ratios de comportement vs porteur (`coller`/`bumper`/etc) devraient dépendre de la distance au panier

Dans `lib/logic/triggers.ts` :

- Le drive devrait se détecter comme un MOUVEMENT (différence entre étapes), pas une position
- Le post-up devrait vérifier l'orientation dos au panier

### Palier 3 — Bloc C (zones)

Le seul gros bloc fonctionnel manquant :

- Defense de zone 2-3, 1-3-1, 3-2, match-up
- Affichage des zones de responsabilité de chaque défenseur
- Passage de relais quand un attaquant change de zone

Plan de mise en œuvre suggéré :

1. Ajouter un type `DefenseSystem = 'man' | 'zone-2-3' | 'zone-1-3-1' | 'zone-3-2'`
2. Pour chaque zone, définir une "home zone" pour chaque défenseur (polygone ou rect)
3. Quand `system !== 'man'`, le marquage devient zonal : chaque défenseur surveille les attaquants présents dans sa zone
4. Visualisation : tracer chaque zone avec une teinte légère

### Palier 4

- Écrans non-porteur (pin-down, flare, back-screen)
- Anticipation de la défense (pré-positionnement avant la passe)
- Consignes d'orientation (forcer baseline / middle)
- Bump sur cuts et flash
- Matrice de règles trigger × défenseur (Option 3 du brainstorm initial)

### Palier 5 — Analyse

- Métriques par étape : distance d'aide, espace libre côté faible, temps de rotation
- Surlignage des failles automatiquement
- Comparaison de séquences

### Backend (justification du choix Next.js)

- Sauvegarde des systèmes en base (Prisma + Postgres ?)
- Bibliothèque partagée entre coachs
- Compte utilisateur
- Export vidéo via API serverless (puppeteer + ffmpeg)

## Décisions architecturales notables

- **Les positions défensives sont calculées, pas stockées.** À chaque étape, le moteur recalcule où devraient être les défenseurs en fonction de l'état offensif. Seules les positions INITIALES des défenseurs (avant la première étape) sont stockées dans `state.defenseInitial`. Conséquence : changer un paramètre défensif global (distance, vitesse, consigne d'écran) recalcule tout immédiatement.

- **Les switches sont stockés sur l'étape où ils ont lieu.** Le moteur les rejoue dans l'ordre pour reconstituer les matchups en vigueur sur n'importe quelle étape. Conséquence : annuler tous les switches = effacer `step.switches` de toutes les étapes.

- **Le moteur est volontairement non-React.** Toute la logique de `lib/logic/` n'a aucune dépendance à React. Si un jour tu veux faire un export vidéo serveur ou une analyse batch, le moteur tourne tel quel.

## Limitations connues

- L'unité de vitesse défensive est en pixels par étape, pas en m/s. Pour avoir des chiffres réalistes, il faudrait calibrer avec une échelle terrain (28m × 15m → 600px × 560px ≈ 21 px/m).
- Les annotations sont stockées par étape mais ne pilotent pas le mouvement automatique : tu repositionnes manuellement le joueur sur l'étape suivante. C'est un choix volontaire pour garder la main.
- Le porteur de balle ne peut changer que via une annotation `pass` qui finit sur un attaquant. Pas de moyen de changer le porteur "manuellement" autrement que par une passe.
