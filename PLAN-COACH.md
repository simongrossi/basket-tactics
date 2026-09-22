# Plan de consolidation coach

Référence : [audit du 22 septembre 2026](AUDIT-UX-BASKET.md).
Ordre approuvé par l'utilisateur : fiabilité, parcours coach, réalisme validé.
Ce document suit le travail effectif ; une case n'est cochée qu'après validation.

## Lot 1 — Fiabilité basket, données et animation

- [ ] F01 Géométrie 2/3 points partagée, coins et deux paniers ; profils de tir cohérents.
- [ ] F02 Diagnostics FIBA : pas de 3 secondes défensives ; bonus après quatre fautes.
- [ ] F03 Résultat de rebond unique de l'animation à la possession et aux statistiques.
- [ ] F04 Violation de possession à zéro ; préserver un tir réellement lâché à temps.
- [ ] F05 Partage : parser les paramètres, restituer le système et le mode lecteur.
- [ ] F06 Bibliothèque : conserver le contexte basket et les paramètres de simulation.
- [ ] F07 Enregistrer un système existant ; statut de sauvegarde et protection du brouillon.
- [ ] F08 Horloge commune : durées d'étapes, lecture, ralenti, export et déplacements.
- [ ] F09 Respecter timing et trajet de l'action lors des évitements.
- [ ] F10 Calcul reproductible à un même instant, indépendamment de la fréquence d'affichage.
- [ ] F11 Séparation finale des joueurs, profil applicatif inclus, sans retour du flicker d'écran.
- [ ] F12 Garantir les contraintes athlétiques ou signaler une durée impossible.
- [ ] F13 Conseils et métriques synchronisés avec l'image et le panier attaqué.

Validation : tests de régression sur les cas de l'audit, suite existante, type-check,
contrôle visuel des systèmes et parcours réels de sauvegarde/partage.

## Lot 2 — Usage quotidien par un coach

- [ ] U01 Entrées créer / modèle / séance ; presets et vocabulaire métier en premier.
- [ ] U02 Niveaux coach / analyse / développement ; unités mètres et secondes.
- [ ] U03 Annuler/rétablir visibles ; raccourcis uniques selon vue, mode et focus.
- [ ] U04 Édition tactile complète, cibles confortables, contraste et accessibilité.
- [ ] U05 Déroulé de séance : contexte conservé, retour, blocs précédent/suivant, minuteur.
- [ ] U06 Vérification terrain avec coachs et tablette physique (validation humaine à organiser).

## Lot 3 — Réalisme validé

- [ ] R01 Modèle partagé de tir, profils et symétrie des deux équipes.
- [ ] R02 Hypothèses statistiques explicites ; comparaison de possessions équivalentes.
- [ ] R03 Contacts/écrans, box-out dynamique et continuité tir–rebond–transition.
- [ ] R04 Validation de situations pédagogiques avec des coachs et des séquences annotées.

## État initial de validation

Au début du chantier : 2 280 tests passent ; 6 échecs et 2 erreurs de typage
proviennent du fichier local non suivi `congestionPenalty.test.ts`, qui attend
`congestionFactor` et `congestionPenaltyEnabled`. `library.ts` et
`librarySessions.test.ts` contiennent également du travail local préexistant.
Ces changements doivent être préservés et distingués des commits de consolidation.

## Journal

- 2026-09-22 : audit intégral ajouté à la racine ; plan créé ; lot 1 commencé.
