# Audit Basket Tactics — interface, physique et usage coach

22 septembre 2026. Audit du code présent, y compris les modifications locales existantes. Aucune source modifiée. Référence métier : basket FIBA, conformément au terrain du projet.

Le produit dispose déjà d'une base fonctionnelle étendue : systèmes, variantes, défenses, annotations, lecture, présentation, exports, bibliothèque et séances. Le prochain jalon devrait être une démonstration fiable et simple à conduire par un coach. Plusieurs défauts traversent aujourd'hui la frontière entre dessin, simulation et explication pédagogique.

P1 = corriger avant de s'appuyer sur le résultat pour enseigner ou évaluer une situation ; P2 = nécessaire à un usage régulier confortable ; P3 = approfondissement après consolidation. Les recommandations ergonomiques ci-dessous sont un audit expert, pas les conclusions d'une étude menée avec des coachs.

## Fiabilité basket — P1

**1. Aligner les tirs à 2/3 points sur le terrain.** Le modèle classe un tir à 3 points dès 200 unités SVG du panier ; l'arc est dessiné à 250. Sonde reproduite : joueur en `(300,295)`, à 220 du panier, classé à 3 points alors qu'il est à l'intérieur de l'arc. Cela affecte les évaluations de tir et les modèles qui les utilisent. Centraliser la géométrie de tir, coins compris, pour les deux paniers. Acceptation : mêmes décisions sur le terrain, dans les conseils et dans le score, avec cas sur la ligne, juste avant/après et dans les coins.

Preuves : [threats.ts:88](src/lib/logic/threats.ts), [offense.ts:67](src/lib/logic/offense.ts), [court.ts:66](src/lib/data/court.ts).

**2. Corriger les diagnostics réglementaires.** Une « violation 3 sec défensive » est actuellement signalée et décrite comme FIBA. La règle FIBA des trois secondes concerne l'attaquant dans la raquette adverse. Le diagnostic assimile en outre trois étapes à trois secondes. Autre cas reproduit : une faute à donner est conseillée avec déjà quatre fautes collectives, alors que la suivante relève de la pénalité. Le moteur doit connaître le règlement appliqué, la durée réelle et le contexte de la faute.

Preuves : [defensiveThreeSeconds.ts:104](src/lib/logic/coachDiagnostics/rules/defensiveThreeSeconds.ts), [detectFoulToGiveOpportunity.ts:43](src/lib/logic/defense/detectFoulToGiveOpportunity.ts). Référence : [règles officielles FIBA 2024, articles 26 et 41](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf).

**3. Unifier événement de rebond et possession.** `pendingRebound` est effacé avant la transition qui devait le consommer ; un nouveau tirage est alors effectué. Sonde reproduite en terrain complet, graine 1 : rebond animé prévu pour D5, puis journal « Rebond offensif O5 (continue) ». Un unique résultat doit piloter trajectoire, gagnant, possession, statistiques et remise du chrono. Acceptation : le joueur qui prend visuellement le ballon est toujours celui qui reçoit la possession.

Preuve : [possessionFlow.ts:259](src/lib/logic/match/gameLoop/possessionFlow.ts), puis calcul à la ligne 301 du même fichier.

**4. Traiter réellement l'expiration de possession.** Dans le match, atteindre zéro déclenche un tir forcé, même si aucun lâcher valide n'a précédé le signal. Sonde : chrono à 1 ms, tick suivant, tir résolu à zéro. Séparer préparation du tir, lâcher et ballon en vol. Acceptation : violation sans lâcher à temps ; résolution normale d'un tir déjà en vol, selon le règlement.

Preuve : [gameLoop.ts:245](src/lib/logic/match/gameLoop.ts). Référence : [FIBA, article 29](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf).

## Physique et animation — P1

**5. Une seule horloge pour le système.** Le playback avance par étapes de 2 s à vitesse 1× ; le timecode affiche par défaut 4 s par étape. Les durées propres aux étapes sont lues pour l'affichage mais ne sont pas transmises à la boucle de lecture. Ainsi, un PNR de trois transitions affiche 12 s avec une animation nominale de 6 s. Il faut un temps de simulation commun ; le ralenti ne doit modifier que la vitesse de présentation. Acceptation : durées, chronomètre, trajets, export et pause/reprise correspondent au même instant.

Preuves : [playbackClock.ts:8](src/lib/logic/playbackClock.ts), [timecode.ts:11](src/lib/logic/timecode.ts), [usePlaybackAnimation.ts:58](src/hooks/usePlaybackAnimation.ts).

**6. Garantir la séparation des joueurs avec le profil réellement utilisé.** Des sondes du resolver, avec le profil initial applicatif « realistic », reproduisent des distances entre centres inférieures aux 34 unités exigées par le projet : PNR central, O5–D5 à 21,77 ; scénario laboratoire de stagger, D3–D4 à 5,71. Ce sont des résultats de sondes moteur, pas des observations vidéo. Les tests golden actuels utilisent l'état historique et acceptent une distance de 18. Le vert de ces tests ne garantit donc pas l'invariant utilisateur. Acceptation : invariant final sur toutes les paires, après toutes les corrections, pour les profils proposés dans l'application et sur l'ensemble des séquences de référence.

Preuves : [playbackGoldenMetrics.test.ts:16](src/lib/logic/__tests__/playbackGoldenMetrics.test.ts), seuil ligne 34 ; [initial.ts:154](src/lib/data/initial.ts).

**7. Stabiliser le résultat indépendamment de la fréquence de calcul.** La même séquence de PNR, au même instant normalisé 2,1333, donne une position D5 différente de 45,4 unités, soit environ 1,23 m, selon qu'elle est calculée à 30 ou 60 échantillons par étape. La mémoire de mouvement et les limites par frame participent à cette dépendance. Utiliser une simulation à pas fixe ou des contraintes exprimées en temps physique. Acceptation : lecture, recherche d'un instant et export restituent la même situation à une tolérance définie ; changer la fréquence d'affichage ne change pas la lecture tactique.

Preuve du mécanisme : [frameResolver.ts:263](src/lib/logic/playback/frameResolver.ts). Sondes avec `resolveFrameAt`, état applicatif réaliste et templates existants.

**8. Respecter le tracé et le départ différé d'une action lors des évitements.** En présence d'un obstacle, le resolver peut remplacer toute la trajectoire par une courbe entre les positions initiale et finale, avec le temps global du segment. Il perd alors le passage intermédiaire et le temps de départ de l'annotation. Sonde : course programmée pour débuter à mi-étape ; au quart de l'étape, le joueur a déjà avancé d'environ 119 unités. Corriger localement la trajectoire en conservant la fenêtre d'action. Acceptation : aucun mouvement avant le départ prévu ; passage par les points imposés ou avertissement explicite si le trajet est irréalisable.

Preuve : [frameResolver.ts:543](src/lib/logic/playback/frameResolver.ts).

**9. Garantir les contraintes athlétiques annoncées — P1/P2.** Les profils de vitesse/accélération sont appliqués aux courses et dribbles avec points intermédiaires ; les tracés droits utilisent une interpolation linéaire. Un poseur d'écran rejoint sa position pendant une fraction fixe de 35 % de l'action. Ajouter un point ne devrait pas changer le modèle athlétique. Même avec le profil, la renormalisation temporelle force l'arrivée à la durée demandée : une sonde de 10 m en 1 s avec départ/arrivée à l'arrêt et accélération configurée à 5 m/s² atteint une pointe de 18,84 m/s. L'accélération annoncée ne peut pas être respectée dans ce cas. Unifier déplacement, freinage, arrêt et installation de l'écran ; signaler les durées impossibles. Acceptation : deux tracés géométriquement identiques produisent le même mouvement ; une course plus longue exige du temps supplémentaire ou une alerte.

Preuves : [playbackTrajectory.ts:347](src/lib/logic/playbackTrajectory.ts), dribble ligne 421, écran ligne 425 ; [velocityProfile.ts:327](src/lib/logic/velocityProfile.ts).

## Confiance dans l'interface — P1

**10. Synchroniser les conseils avec l'image visible.** Les métriques, la meilleure action et les diagnostics de page utilisent `activeStep`, tandis que le terrain utilise `scrubT`/`playbackT`. Durant la lecture, `activeStep` ne change qu'à la fin. Un arrêt sur image peut donc afficher les conseils d'une autre situation. Utiliser un état de frame commun pour terrain et analyse, ou annoncer clairement un diagnostic limité à l'étape. Acceptation : déplacer la tête de lecture actualise ensemble joueurs, porteur, conseils et valeurs.

Preuves : [page.tsx:143](src/app/page.tsx), [page.tsx:711](src/app/page.tsx).

**11. Réparer et vérifier le partage complet.** Le bouton produit `#share=PAYLOAD&mode=player`. Le chargeur transmet tout ce suffixe au décodeur Base64, y compris `&mode=player`. Reproduction du décodage : `InvalidCharacterError`. Le bouton affiche pourtant « Lien copié ». Parser séparément les paramètres et tester le lien réellement généré. Acceptation : ouverture dans un navigateur vierge, bon système, lecteur actif et rechargement cohérent.

Preuves : [page.tsx:304](src/app/page.tsx), [useAppState.ts:129](src/hooks/useAppState.ts), [urlCompression.ts:37](src/lib/state/urlCompression.ts). Le bouton a été testé dans le navigateur ; le défaut de décodage a été vérifié isolément. L'ouverture du lien local dans un second onglet a été bloquée par la politique URL de l'outil, sans contournement.

**12. Sauvegarder le contexte basket et permettre une vraie mise à jour.** Le snapshot bibliothèque omet notamment nombre de joueurs, terrain complet, sens de jeu, noms/numéros, profil de réalisme et plusieurs paramètres physiques. Au chargement, ces valeurs viennent du système précédemment ouvert. De plus, « sauvegarder » crée une nouvelle entrée ; les séances continuent de référencer l'ancien identifiant. Ajouter document courant, titre, état enregistré/modifié, Enregistrer et Enregistrer une copie, avec une règle explicite de version pour les séances. Acceptation : sauvegarder un 3c3, passer à un 5c5 configuré différemment, puis recharger restitue fidèlement le 3c3 et son animation.

Preuves : [library.ts:240](src/lib/data/library.ts), chargement ligne 309 ; [useLibrary.ts:71](src/hooks/useLibrary.ts). Les échecs de stockage sont aussi silencieux : [persistence.ts:70](src/lib/state/persistence.ts). Prévoir message d'échec et possibilité de restauration du brouillon.

## Parcours coach — P2

**13. Simplifier le niveau de lecture initial.** Le terrain et les conventions de dessin sont déjà présents. En revanche, l'entrée ouvre directement un éditeur, les réglages défense forment une longue liste, et la barre affiche pixels, aide chiffrée et estimation de « meilleure action ». Proposer des entrées explicites : créer un système, partir d'un modèle, préparer une séance. Mettre les presets et consignes basket avant les réglages fins. Réserver les outils de développement à une vue dédiée. Afficher mètres/secondes et préciser si les couleurs jugent l'attaque ou la défense.

Preuves : [MetricsBar.tsx:44](src/components/MetricsBar.tsx), [ParametresPanel.tsx:521](src/components/ParametresPanel.tsx). Observation visuelle : la puce narrative de système manque de contraste ; les boutons éditeur de lecture mesurés font environ 24 px de haut. Le mode présentation possède déjà de plus grandes commandes.

**14. Finir l'édition au doigt et clarifier les raccourcis.** Long press et zoom tactile existent : il faut compléter les parcours plutôt que refaire ces fonctions. Ajouter Annuler/Rétablir visibles, commandes pour les gestes nécessitant une touche, cibles plus grandes et labels accessibles. Les flèches clavier ont plusieurs gestionnaires concurrents : navigation d'étapes, navigation du lecteur et déplacement fin dans la timeline. Les raccourcis globaux restent actifs dans d'autres vues. Acceptation : une touche produit une seule action adaptée à la vue ; construire, corriger, enregistrer et montrer un système fonctionne sans clavier externe.

Preuves : [page.tsx:246](src/app/page.tsx), [Timeline.tsx:118](src/components/Timeline.tsx), [SessionsView.tsx:526](src/components/SessionsView.tsx).

**15. Relier préparation et conduite d'une séance.** Blocs, durées, notes et impression existent. Ouvrir un système quitte cependant la séance pour le lecteur ; le retour passe par l'éditeur et la sélection de séance peut être perdue. Ajouter Retour à ma séance, bloc précédent/suivant, consignes et minuteur de bloc. Acceptation : dérouler cinq blocs avec leurs variantes en conservant le contexte.

Preuves : [page.tsx:125](src/app/page.tsx), [SessionsView.tsx:72](src/components/SessionsView.tsx).

## Aide à la décision et approfondissement

**Cohérence des profils et du panier — P1/P2.** Le tir direct ignore le profil du tireur alors que l'évaluation passe + tir l'applique. Sonde ouverte : shooter et non-shooter obtiennent tous deux 36 % en tir direct. Certains overlays utilisent également le panier par défaut au lieu du panier attaqué. Unifier ces entrées et vérifier la symétrie des deux sens de jeu. Preuves : [offense.ts:152](src/lib/logic/offense.ts), [useCourtFrame.ts:460](src/hooks/useCourtFrame.ts), [CourtView.tsx:862](src/components/CourtView.tsx).

**Portée des statistiques — P2.** Le Monte Carlo fige la défense et termine la possession au premier tir ; la calibration vise l'accord avec un autre modèle interne. Cet accord ne valide pas la valeur prédictive pour une équipe réelle. Présenter les résultats comme estimations du modèle, expliquer leurs hypothèses et comparer des possessions définies de la même manière. Avant d'employer les chiffres pour choisir une stratégie, confronter les sorties à des séquences annotées et à l'avis de coachs. Preuves : [simulator.ts:14](src/lib/logic/simulator.ts), [calibration.ts:9](src/lib/logic/match/calibration.ts).

**Approfondissements — P3.** Une fois les invariants restaurés, travailler les écrans légaux et contacts, le box-out dynamique, la continuité tir–rebond–première passe–transition, puis les ajustements collectifs sous plusieurs menaces. Définir pour chacun une situation pédagogique observée et un résultat attendu avant d'ajouter des paramètres. Les fonctionnalités avancées déjà présentes doivent être évaluées ensemble : une option testée isolément ne garantit pas la cohérence de leur combinaison.

## Ordre de réalisation proposé

| Lot | Résultat attendu | Critère de sortie |
|---|---|---|
| 1. Fiabilité | Score/règles corrects, rebond unique, horloge commune, collisions et trajets stables, partage et sauvegarde fidèles | Situations de référence reproductibles, aucun conseil sur une autre frame, round-trip sauvegarde/partage validé |
| 2. Usage coach | Document nommé, enregistrement clair, presets accessibles, commandes tactiles, lecteur relié aux séances | Des coachs réalisent sans aide : créer un PNR, comparer deux couvertures, corriger/enregistrer, partager puis dérouler une séance |
| 3. Réalisme validé | Profils cohérents, meilleurs contacts et transitions, hypothèses statistiques explicites | Revue de séquences avec coachs ; mesures et sorties compatibles avec les situations visées |

Je commencerais par les points 1–8 et 10–12. Une refonte graphique seule ne résoudrait pas les erreurs pédagogiques observées.

## Vérifications effectuées et limites

- Inspection du code actuel, démarrage local, parcours terrain → bibliothèque → PNR → défense → partage et contrôle visuel desktop.
- Sondes isolées sur les fonctions de tir, faute à donner, chrono, rebond et resolver physique. Les résultats numériques de collision/fréquence proviennent de ces sondes, sans inspection vidéo exhaustive de tous les systèmes.
- `npm test` : 235 suites et 2 280 tests réussis ; 1 suite et 6 tests échoués dans le fichier local non suivi `congestionPenalty.test.ts`.
- `npm run type-check` : deux erreurs liées au même chantier (`congestionFactor` et `congestionPenaltyEnabled` absents). Il s'agit du travail local présent au début de l'audit, pas d'une régression introduite ici.
- Les sondes physiques montrent que certains tests actuels passent avec un profil différent de celui proposé par l'application et un seuil inférieur à l'invariant déclaré.
- Aucun essai sur tablette physique, aucune séance terrain avec des utilisateurs et aucune validation prédictive sur données de match. Ces validations restent à mener.
- Sources et modifications utilisateur laissées intactes ; serveur temporaire arrêté après inspection.
