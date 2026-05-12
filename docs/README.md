# Documentation — Simulateur tactique basket

Cette documentation couvre tous les aspects du projet, de l'architecture à la sémantique basket en passant par les décisions de design.

## Index

| Document | Sujet |
|----------|-------|
| [architecture.md](architecture.md) | Stack technique, structure des dossiers, flux de données |
| [refactoring-history.md](refactoring-history.md) | Découpages structurels successifs, patterns réutilisables, méthode reproductible |
| [session-2026-05-12.md](session-2026-05-12.md) | Récap de la grande session de mai 2026 — refacto + audit défensif + UX (27 commits, +173 tests) |
| [data-model.md](data-model.md) | Forme de l'`AppState`, types, persistance |
| [concepts-basket.md](concepts-basket.md) | Vocabulaire basket : écrans, défense de zone, denial, switch… |
| [GAME-ENGINE.md](GAME-ENGINE.md) | **Cartographie de tout le moteur** : individuel / collectif / physique, avec règles, constantes, pipeline |
| [physics.md](physics.md) | Constantes physiques centralisées (`data/physics.ts`) avec sémantique en mètres réels et guide de tuning |
| [logique-defensive.md](logique-defensive.md) | Comment le moteur calcule les positions des défenseurs (vue pipeline détaillée) |
| [orientation-anti-teleport.md](orientation-anti-teleport.md) | Orientation calculée des joueurs, anti-téléportation, fixes top-lock / paint helper / écrans fantômes |
| [../CHANGELOG.md](../CHANGELOG.md) | Historique des évolutions de comportement, structuré par milestones |
| [simulation.md](simulation.md) | Modèle de menace, EV des actions, Monte Carlo possessions (PPP/eFG%) |
| [ui-design.md](ui-design.md) | Choix visuels, layout 3 colonnes, codes couleur, conventions de tracé |
| [menu-reference.md](menu-reference.md) | Référence exhaustive de chaque réglage du panneau |
| [bibliotheque-systemes.md](bibliotheque-systemes.md) | Templates fournis, format pour en ajouter |
| [export-pdf.md](export-pdf.md) | Comment fonctionne l'export playbook |
| [testing.md](testing.md) | Stack Vitest, couverture, conventions de tests |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Référence des raccourcis clavier |

## Pour reprendre le projet

1. `npm install`
2. `npm run dev` → http://localhost:3000
3. Charger un template depuis le panneau gauche pour explorer
4. Lire `architecture.md` puis `logique-defensive.md` pour comprendre le moteur

## État actuel

- [../ROADMAP.md](../ROADMAP.md) — vision forward-looking, structurée en 3 sections (Logique / UX / Produit) avec statuts ⚪🟡🟢
- [../IDEAS.md](../IDEAS.md) — backlog technique fin et historique des features livrées
