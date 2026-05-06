# Documentation — Simulateur tactique basket

Cette documentation couvre tous les aspects du projet, de l'architecture à la sémantique basket en passant par les décisions de design.

## Index

| Document | Sujet |
|----------|-------|
| [architecture.md](architecture.md) | Stack technique, structure des dossiers, flux de données |
| [data-model.md](data-model.md) | Forme de l'`AppState`, types, persistance |
| [concepts-basket.md](concepts-basket.md) | Vocabulaire basket : écrans, défense de zone, denial, switch… |
| [logique-defensive.md](logique-defensive.md) | Comment le moteur calcule les positions des défenseurs |
| [ui-design.md](ui-design.md) | Choix visuels, layout 3 colonnes, codes couleur, conventions de tracé |
| [menu-reference.md](menu-reference.md) | Référence exhaustive de chaque réglage du panneau |
| [bibliotheque-systemes.md](bibliotheque-systemes.md) | Templates fournis, format pour en ajouter |
| [export-pdf.md](export-pdf.md) | Comment fonctionne l'export playbook |

## Pour reprendre le projet

1. `npm install`
2. `npm run dev` → http://localhost:3000
3. Charger un template depuis le panneau gauche pour explorer
4. Lire `architecture.md` puis `logique-defensive.md` pour comprendre le moteur

## État actuel

Voir [../IDEAS.md](../IDEAS.md) pour le backlog priorisé et l'historique des features.
