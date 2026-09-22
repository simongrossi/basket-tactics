# 🏀 Basket Tactics

Simulateur tactique de basket-ball pour visualiser des systèmes offensifs et observer la **réaction d'une défense entièrement paramétrable**. Tu construis ton système en étapes, tu règles le comportement de chaque défenseur, et le moteur calcule à la volée où ils devraient se trouver. Tout est interactif, vectoriel, et tient dans une page Next.js client-only.

> Pas de backend, pas de compte, pas de tracking. Tu lances `npm run dev`, c'est joué.

**Version affichée : 0.18.0** (septembre 2026). Usage premier : **préparer, expliquer et présenter des systèmes à ses joueurs** (création pas à pas, modèles, présentation, fiches, séances d'entraînement). La simulation défensive et le match simulé restent disponibles en arrière-plan. Historique détaillé : [CHANGELOG.md](CHANGELOG.md).

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
npm test             # Vitest — ~2 470 tests (moteur, transforms, composants)
npm run test:watch   # Vitest en mode watch
npm run build        # build de production statique
```

---

## Ce qu'on peut faire

### Préparer un entraînement (niveau d'interface « Coach »)

- **Créer un système** étape par étape : choisir une action (course, passe, dribble, écran, note), glisser depuis un joueur, puis « + étape » pour la suite. **Ce qui est dessiné sur une étape se joue pendant cette étape** — passes comprises (le ballon reste chez le passeur sur l'étape où la flèche est dessinée).
- **Partir d'un modèle** : 31 systèmes classiques — sets (PNR central, Horns flare, Spain PNR, UCLA, Floppy, Hammer, Iverson, Stagger, PNR aile…), 17 remises en jeu BLOB/SLOB, 3 attaques de zone, exercice Philadelphia.
- **Préparer une séance** : blocs chronométrés (systèmes, exercices, blocs libres), fiche imprimable, puis **déroulé guidé** (bloc précédent / suivant, minuteur, consignes, variantes).
- **Présenter** : mode lecteur plein terrain, étape par étape (◀ / ▶, espace), masquage d'une équipe.
- **Fiches systèmes** imprimables (PDF via le navigateur), **partage** par lien, export JSON / GIF / WebM, bibliothèque locale avec enregistrement et brouillon protégé.
- Tablette : édition au doigt (barre tactile, cibles 44 px, appui long = clic droit).

### Défense

- Homme à homme / zone (2-3, 1-3-1, 3-2, match-up), presse, junk (box-and-1), presets défensifs en tête du panneau.
- Couvertures d'écran porteur et non-porteur, aides, règles individuelles par défenseur, placement manuel par étape.

### Analyse et développement (niveaux « Analyse » / « Développement »)

- Métriques en mètres et secondes, lignes de passe, champs de vision, triangles de vision défensive, lecture coach (diagnostics).
- Lectures réactives (l'attaque choisit sa suite selon la couverture), continuité motion, éditeur nodal des variantes.
- Match simulé (Play IA), paramètres physiques et outils de diagnostic.

---

## Interface

Barre latérale (entrées coach, vues, outils Attaque / Défense / Étapes / Scénario) à gauche, terrain au centre avec Annuler / Rétablir au-dessus et la timeline dessous. Sous 900 px : terrain pleine largeur en tête, outils dessous.

---

## Architecture en 30 secondes

```
src/
├── app/                    # Next.js App Router (page.tsx)
├── components/             # CourtView, StepsPanel, DefensePanel, Timeline,
│                           #   PlaybookView, SessionsView, sidebar/, court/…
├── hooks/                  # useAppState (état + historique), lecture, bibliothèque
└── lib/
    ├── data/               # modèles (templates, remises en jeu, anti-zone,
    │                       #   exercices), séances, bibliothèque, terrain
    ├── logic/              # MOTEUR PUR — pas de React : défense, écrans,
    │                       #   lecture (playback/), match/, numérotation des étapes
    ├── state/transforms/   # transformations pures de l'état (testées sans React)
    └── types/              # types stricts
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
- **Aucune superposition de joueurs** — toutes les paires (coéquipiers, adversaires, défenseur sur son homme) gardent 34 px entre centres. Règle inviolable : [docs/PLAYER-CLEARANCE.md](docs/PLAYER-CLEARANCE.md).
- **SVG natif plutôt que Canvas** — vectoriel, simple, lisible à l'export, performance largement suffisante.

---

## Tech

- **Next.js 14** (App Router) — application 100 % client-only
- **React 18**, **TypeScript** strict
- **SVG natif** — pas de Konva, pas de Canvas, pas de lib UI
- **localStorage** pour la persistance

---

## Statut

Projet personnel en évolution — priorités et chantiers ouverts dans [`ROADMAP.md`](ROADMAP.md) (section « Priorisation »), plan de consolidation en cours dans [`PLAN-COACH.md`](PLAN-COACH.md). Contributions, retours et idées bienvenus via les issues.
