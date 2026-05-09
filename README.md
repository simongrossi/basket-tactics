# 🏀 Basket Tactics

Simulateur tactique de basket-ball pour visualiser des systèmes offensifs et observer la **réaction d'une défense entièrement paramétrable**. Tu construis ton système en étapes, tu règles le comportement de chaque défenseur, et le moteur calcule à la volée où ils devraient se trouver. Tout est interactif, vectoriel, et tient dans une page Next.js client-only.

> Pas de backend, pas de compte, pas de tracking. Tu lances `npm run dev`, c'est joué.

**Version actuelle : 0.8.0** (2026-05-10) — cycle **"lecture animée fidèle"** : trajectoires courbes (V-cut, L-cut, dribble curviligne via Shift+drag freehand, spline Catmull-Rom reparamétrée en longueur d'arc), suivi temps-réel des défenseurs sur les courbes (`followDefendersAtFrame`), `hedge` complet (D1 over the top + D5 show), regard auto distance-based (basculement ballon↔homme selon proximité), pause/reprise depuis l'instant t, dribble en wave Q-Bezier lisse, base de lecture ralentie à 2 s/étape. Voir [CHANGELOG.md](CHANGELOG.md). Précédente version : 0.7.0 (2026-05-09) — cycle "pictogramme + champ de vision + overrides manuels".

---

## Démarrage rapide

```bash
git clone https://github.com/simongrossi/basket-tactics.git
cd basket-tactics
npm install
npm run dev          # → http://localhost:3000
```

Autres commandes utiles :

```bash
npm run type-check   # tsc --noEmit
npm test             # Vitest — 302 tests sur la logique pure
npm run test:watch   # Vitest en mode watch
npm run build        # build de production statique
```

---

## Ce qu'on peut faire

### Côté attaque (panneau gauche, orange)

- Poser 5 attaquants et dessiner leur action via 4 conventions de tracé : **passe** (pointillés), **dribble** (zig-zag), **course** (ligne pleine), **écran** (T)
- Construire un système en plusieurs **étapes** (keyframes), chacune avec son label, son porteur de balle, ses annotations
- Charger un système depuis la **bibliothèque** : PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy
- Lire l'animation, **scrubber** dans la timeline pour voir les positions intermédiaires

### Côté défense (panneau droit, bleu)

- Bascule **homme à homme / zone** (4 layouts : 2-3, 1-3-1, 3-2, match-up)
- 6 règles d'écran porteur (over / under / switch / hedge / drop / blitz) + 4 pour écrans non-porteur
- 3 triggers d'aide globaux (drive / post-up / paint)
- **Règles individuelles par défenseur** : intensité d'aide, priorité (raquette / homme / passe), comportement vs porteur (coller / bumper / contester / reculer / topside / baseline), stance hors-ballon (sag / derrière / 3/4 deny / fronting), navigation sur écran (override individuel)
- 6 **presets défensifs** prêts à l'emploi : Drop coverage, Switch tout, Hedge & recover, Ice + drop, Fond de raquette, Pression all-court
- Position de chaque défenseur **manuellement modifiable** par drag (override par étape, désactivable d'un clic-droit)

### Visualisation

- **Métriques en temps réel** sous la timeline : couverture raquette, gap max, écart moyen, défenseurs en retard, intensité d'aide, ratio passes ouvertes
- **Lignes de passe** colorées (ouverte / contestée / bloquée) depuis le porteur
- **Lignes d'aide** : trait pointillé violet entre la position de marquage pure et la position d'aide effective
- **Indicateurs d'écran** : cercle violet sur le poseur d'écran porteur, vert sur écran non-porteur
- Bras stylisés FIBA + petit triangle d'orientation sur chaque défenseur
- Toggle **terrain complet** (demi-terrain par défaut)

### Export & persistance

- **Playbook PDF** : grille de vignettes 1/2/3 colonnes, options défense / légende, via `window.print()` du navigateur
- **Export / import JSON** complet
- **Persistance localStorage automatique** (debounce 400ms)

---

## Captures (pour info)

L'interface est un layout 3 colonnes :

```
┌──────────────┬──────────────────────────────┬──────────────┐
│              │                              │              │
│   ATTAQUE    │           TERRAIN            │   DÉFENSE    │
│   (orange)   │           (SVG)              │    (bleu)    │
│              │                              │              │
│  Outils      │                              │  Presets     │
│  Bibliothèque│                              │  Système     │
│  Étapes      │                              │  Triggers    │
│  Lecture     │                              │  Écran porteur│
│              │                              │  Écran nonP  │
│              ├──────────────────────────────┤  Règles indiv│
│              │   Timeline (scrubbing)       │  Visualisation│
│              │   Métriques (pills colorées) │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

---

## Architecture en 30 secondes

```
src/
├── app/                    # Next.js App Router (page.tsx)
├── components/             # OffensePanel, DefensePanel, CourtView,
│                          #   Timeline, MetricsBar, PlaybookView, ...
├── hooks/useAppState.ts    # état central + tous les callbacks
└── lib/
    ├── data/               # court.ts, initial.ts, zones.ts,
    │                       #   templates.ts, defensePresets.ts
    ├── logic/              # MOTEUR PUR — pas de React :
    │                       #   engine, manDefense, help, screens,
    │                       #   triggers, zoneDefense, geometry,
    │                       #   metrics
    └── types/index.ts      # types stricts
```

**Le moteur est pur**. `src/lib/logic/` ne dépend de rien (ni React, ni DOM). Tu lui passes l'état, il te rend les positions calculées. Conséquence : testable isolément, ré-utilisable côté serveur, et chaque modif d'un paramètre recalcule instantanément toutes les étapes.

---

## Documentation

Toute la doc technique vit dans [`docs/`](docs/) :

| Fichier | Sujet |
|---------|-------|
| [`docs/architecture.md`](docs/architecture.md) | Stack, structure des dossiers, flux de données |
| [`docs/data-model.md`](docs/data-model.md) | Forme de l'`AppState`, types, persistance |
| [`docs/concepts-basket.md`](docs/concepts-basket.md) | Vocabulaire basket modélisé (stances, screens, switches, zone, triggers, lateness) |
| [`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md) | **Cartographie complète du moteur** : individuel / collectif / physique |
| [`docs/physics.md`](docs/physics.md) | Constantes physiques centralisées avec sémantique en mètres réels |
| [`docs/logique-defensive.md`](docs/logique-defensive.md) | Pipeline du moteur étape par étape, formules, points d'extension |
| [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md) | Orientation calculée des joueurs, anti-téléportation, fixes basket récents |
| [`docs/ui-design.md`](docs/ui-design.md) | Choix visuels, layout, conventions de tracé |
| [`docs/menu-reference.md`](docs/menu-reference.md) | Référence exhaustive de chaque réglage de l'interface |
| [`docs/bibliotheque-systemes.md`](docs/bibliotheque-systemes.md) | Format des templates, comment en ajouter |
| [`docs/export-pdf.md`](docs/export-pdf.md) | Comment fonctionne l'export PDF |
| [`docs/testing.md`](docs/testing.md) | Stack Vitest, couverture des tests, conventions |
| [`docs/keyboard-shortcuts.md`](docs/keyboard-shortcuts.md) | Référence des raccourcis clavier |

Pour reprendre le projet, lis dans cet ordre : `architecture.md` → `concepts-basket.md` → `GAME-ENGINE.md` → `logique-defensive.md` (détail).

Vision produit et chantiers à venir : [`ROADMAP.md`](ROADMAP.md). Historique des évolutions de comportement : [`CHANGELOG.md`](CHANGELOG.md). Backlog technique et notes au fil de l'eau : [`IDEAS.md`](IDEAS.md).

---

## Décisions structurantes

- **Moteur pur** (`lib/logic/`) — aucune dépendance React, testable et réutilisable.
- **Positions défensives calculées, pas stockées** — seules les positions offensives par étape sont persistées. La défense est recomputée à chaque frame depuis l'état.
- **Override manuel par étape** — l'utilisateur peut imposer la position d'un défenseur sur une étape donnée (`Step.defenseOverrides`), le moteur la respecte.
- **Switches persistés sur l'étape** où ils ont lieu, cumulés via `getMatchupsAt()`.
- **Path-aware avoidance** — pendant l'animation, les défenseurs contournent les poseurs d'écran via une courbe Bezier (pas un push réactif), avec ralentissement au sommet.
- **Solveur de collisions strict** — aucun défenseur ne se superpose à un autre joueur (sauf à son matched man).
- **SVG natif plutôt que Canvas** — vectoriel, simple, lisible à l'export, performance largement suffisante.

---

## Tech

- **Next.js 14** (App Router) — application 100 % client-only
- **React 18**, **TypeScript** strict
- **SVG natif** — pas de Konva, pas de Canvas, pas de lib UI
- **localStorage** pour la persistance

---

## Statut

Projet personnel en évolution — voir [`IDEAS.md`](IDEAS.md) pour le backlog priorisé. Contributions, retours et idées bienvenus via les issues.
