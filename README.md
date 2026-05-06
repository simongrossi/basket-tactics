# 🏀 Basket Tactics

Simulateur tactique de basket pour visualiser des systèmes offensifs et observer la réaction d'une défense paramétrable. Next.js 14 + TypeScript + SVG natif, application client-only.

## Démarrage

```bash
npm install
npm run dev          # → http://localhost:3000
npm run type-check   # vérifier les types
npm run build        # build statique
```

## Quoi ?

Tu poses 5 attaquants et 5 défenseurs sur un terrain, tu construis un système en plusieurs étapes (passes, dribbles, écrans, courses), tu règles le comportement défensif (homme à homme avec consignes individuelles, ou zone 2-3 / 1-3-1 / 3-2 / match-up), et le moteur calcule où devraient être les défenseurs à chaque étape.

Tu peux ensuite :
- Lire l'animation entre étapes
- Scrubber dans la timeline pour voir les positions intermédiaires
- Charger un système pré-construit depuis la **bibliothèque** (PNR central, Horns flare, Pindown coin)
- Exporter en **playbook PDF** pour partager avec un staff
- Sauvegarder/charger en JSON

## Documentation

Toute la doc structurée vit dans [`docs/`](docs/) :

- [docs/architecture.md](docs/architecture.md) — stack, dossiers, flux de données
- [docs/data-model.md](docs/data-model.md) — types, AppState, persistance
- [docs/concepts-basket.md](docs/concepts-basket.md) — vocabulaire basket modélisé
- [docs/logique-defensive.md](docs/logique-defensive.md) — fonctionnement du moteur
- [docs/ui-design.md](docs/ui-design.md) — choix visuels, layout, conventions de tracé
- [docs/menu-reference.md](docs/menu-reference.md) — référence exhaustive des menus
- [docs/bibliotheque-systemes.md](docs/bibliotheque-systemes.md) — format des templates
- [docs/export-pdf.md](docs/export-pdf.md) — comment fonctionne l'export PDF

Backlog et historique : [IDEAS.md](IDEAS.md).

## Décisions structurantes

- **Le moteur est pur** — aucune dépendance à React, testable isolément, réutilisable. Tout vit dans `src/lib/logic/`.
- **Les positions défensives sont calculées, pas stockées.** Seules les positions OFFENSIVES par étape et la position INITIALE de la défense sont persistées. Tout le reste est recalculé à la volée. Conséquence : changer un paramètre défensif global recalcule instantanément toutes les étapes.
- **Les switches d'écran sont persistés par étape** dans `step.switches` et cumulés via `getMatchupsAt()`.
- **SVG plutôt que Canvas** — vectoriel, simple, lisible à l'export, performance largement suffisante pour 10 joueurs.

## Tech

- Next.js 14 (App Router), client-only
- React 18, TypeScript strict
- SVG natif (pas de Konva, pas de Canvas, pas de bibliothèque UI)
- localStorage pour la persistance

Pour reprendre le projet, lis dans cet ordre : `docs/architecture.md` → `docs/concepts-basket.md` → `docs/logique-defensive.md`.
