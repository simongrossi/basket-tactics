# Plan de consolidation coach

Référence : [audit du 22 septembre 2026](AUDIT-UX-BASKET.md).
Ordre approuvé par l'utilisateur : fiabilité, parcours coach, réalisme validé.
Ce document suit le travail effectif ; une case n'est cochée qu'après validation.

## Lot 1 — Fiabilité basket, données et animation

- [x] F01 Géométrie 2/3 points partagée, coins et deux paniers ; profils de tir cohérents.
- [x] F02 Diagnostics FIBA : pas de 3 secondes défensives ; bonus après quatre fautes.
- [x] F03 Résultat de rebond unique de l'animation à la possession et aux statistiques.
- [x] F04 Violation de possession à zéro ; préserver un tir réellement lâché à temps.
- [x] F05 Partage : parser les paramètres, restituer le système et le mode lecteur.
- [x] F06 Bibliothèque : conserver le contexte basket et les paramètres de simulation.
- [x] F07 Enregistrer un système existant ; statut de sauvegarde et protection du brouillon.
- [x] F08 Horloge commune : durées d'étapes, lecture, ralenti, export et déplacements.
  Lecture et export corrigés : durées individuelles et interpolations respectées ;
  changement de vitesse sans redémarrage. Budgets défensifs et délais physiques
  calibrés sur la durée réelle de la transition source.
- [x] F09 Respecter timing et trajet de l'action lors des évitements.
- [x] F10 Calcul reproductible à un même instant, indépendamment de la fréquence d'affichage.
- [x] F11 Séparation finale des joueurs, profil applicatif inclus, sans retour du flicker d'écran.
- [x] F12 Signaler une durée impossible au regard de la vitesse demandée.
- [x] F13 Conseils et métriques synchronisés avec l'image et le panier attaqué.

Validation : tests de régression sur les cas de l'audit, suite existante, type-check,
contrôle visuel des systèmes et parcours réels de sauvegarde/partage.

## Lot 2 — Usage quotidien par un coach

- [x] U01 Entrées créer / modèle / séance ; presets et vocabulaire métier en premier.
- [x] U02 Niveaux coach / analyse / développement ; unités mètres et secondes.
- [x] U03 Annuler/rétablir visibles ; raccourcis uniques selon vue, mode et focus.
- [x] U04 Édition tactile complète, cibles confortables, contraste et accessibilité.
- [x] U05 Déroulé de séance : contexte conservé, retour, blocs précédent/suivant, minuteur.
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

- Premier correctif : géométrie 2/3 points (coins et deux paniers), modèle de tir partagé,
  retrait du faux diagnostic FIBA, seuil des fautes corrigé, rebond pré-calculé conservé,
  paramètres de partage parsés séparément. 89 tests ciblés passent ; après mise à jour
  du test qui attendait à tort une violation FIBA, ses 6 cas passent également.
  Suite complète : seul le chantier congestion reste en échec après cette correction.

- Deuxième correctif : violation au signal sans lâcher, tirs déjà lâchés préservés ;
  les systèmes sauvegardent leur effectif, terrain, sens de jeu et réglages du moteur.
  Anciens systèmes : valeurs par défaut stables, indépendantes du système précédent.
  Validation : 120 tests ciblés passent ; le typage ne signale que les deux
  erreurs préexistantes du chantier congestion.

- Troisième correctif : mise à jour d'un système sans changement d'identité,
  identité conservée au rechargement, sauvegarde visible et erreurs signalées,
  écriture avant fermeture, récupération du brouillon remplacé.
  Vérification navigateur : création, mise à jour sans doublon et rechargement OK.
  La confirmation native de chargement bloque l'outil navigateur ; récupération
  vérifiée par test d'intégration (remplacement puis remontage du hook).
  235 tests ciblés passent avant ajout du cas de récupération. Suite complète :
  2 298 passent, 6 échecs congestion préexistants et un ancien test qui forçait
  un tir au signal ; ce dernier est corrigé pour lâcher avant le signal (test repassé).

- Validation finale de cette tranche : 2 299 tests passent (238 fichiers), en
  excluant explicitement le test local de congestion inachevé. Les seuls diagnostics
  TypeScript restent ses deux erreurs préexistantes. F08–F13 et les lots 2–3 restent ouverts.

- Correction courte F08 : lecture et export utilisent les durées réelles des étapes.
  Les étapes interpolées subdivisent la durée sans l'allonger. La reprise et les
  changements de vitesse conservent la position atteinte. Export échantillonné
  en secondes à fréquence constante, y compris avec des durées différentes.
  Validation : 57 tests ciblés passent (horloge, pause/reprise, vitesse, capture
  d'export). Les deux erreurs TypeScript du test local congestion restent préexistantes.
  Pas de modification des trajectoires ou du solveur physique dans cette tranche.

- F09 terminé : l'évitement utilise la route sélectionnée et la progression de
  l'action (départ différé, timing absolu, sprint et profil de vitesse), au lieu
  de remplacer le mouvement par une courbe entre les étapes. Les points de
  passage bornent chaque portion corrigée ; les portions libres sont conservées.
  Les splines qui débordent de leur corde sont également prises en compte.
  Avant le départ et après l'arrivée, aucune déviation anticipative n'est ajoutée.
  Les solveurs de collision restent prioritaires si un point demandé est occupé.
  Validation : 2 315 tests passent dans la suite complète, incluant les écrans,
  overlaps et scénarios utilisateur ; seuls les 6 échecs congestion préexistants
  subsistent. Un cas supplémentaire de spline débordante passe ensuite (9 tests
  ciblés au total). TypeScript : uniquement les 2 erreurs congestion préexistantes.

- F10 terminé : lecture, pause/scrub et export passent par un même resolver
  à mémoire synthétique (60 sous-pas par étape, indépendants des FPS affichés).
  Reconstruction incrémentale mise en cache ; les requêtes intermédiaires ne
  modifient pas la séquence. Cache borné et invalidé à chaque édition du système.
  Easing appliqué une seule fois. La fin de lecture conserve la frame finale
  de cette séquence ; une nouvelle lecture repart du début.
  Tests : parité à 24/30/60/144 Hz, retours arrière, sauts d'images, easing,
  invalidation après édition, options diagnostiques, performance du cache et
  intégration du hook lecture/pause/reprise/export.
  Validation complète : 2 322 tests passent (244 fichiers). Seuls les 6 échecs
  et 2 erreurs TypeScript préexistants du chantier local congestion subsistent.


- F11 terminé : séparation finale de 34 px avec projection commune des
  contacts et des limites de déplacement. Le côté du contact précédent
  stabilise les corrections ; le clamp qui recréait des chevauchements est
  supprimé. Budget ramené à 9 px par sous-pas pour borner aussi à 18 px les
  divergences entre images intermédiaires et grille canonique.
  Régressions : toutes les paires à 120 échantillons par étape sur les Labs
  écran et systèmes classiques, profils legacy et réaliste ; écran fixe,
  déterminisme, absence de mutation et ancres importées confondues.
  Les entrées incompatibles privilégient la séparation ; les diagnostics de
  mouvement impossible restent F12. Validation visuelle non renouvelée dans
  cette tranche (outil navigateur bloqué par la confirmation native antérieure).
  Validation complète : 2 326 tests passent (244 fichiers), dont tous les
  garde-fous écran/overlap/userJson/screenLab. Seuls les 6 échecs et 2 erreurs
  TypeScript préexistants du chantier local congestion subsistent.


- F12 livré sous forme de diagnostic coach, sans retouche automatique du système.
  L'ancien avertissement arbitraire « plus de 4 m par étape » est remplacé par
  une vérification en m/s, visible dans la lecture coach dès la première transition.
  Trajectoires offensives échantillonnées avant limitation visuelle : points de
  passage, fenêtres fractionnaires/absolues, sprint, arrivée du poseur et profil
  réaliste. Les bornes des actions très courtes sont échantillonnées explicitement.
  Défense : déplacement entre positions calculées, donc vitesse minimale requise.
  Durées issues de l'horloge commune, interpolations comprises. Repère pédagogique
  de 7 m/s, clairement nommé comme hypothèse du modèle ; le message propose
  d'allonger la durée/la fenêtre d'action ou de raccourcir le trajet.
  Limites : ce diagnostic ne certifie pas la faisabilité athlétique complète
  (accélération, fatigue, détours défensifs et corrections de collision). F08 et
  les validations de réalisme restent ouverts. Pas de nouveau contrôle visuel
  navigateur ; intégration vérifiée via le moteur qui alimente le panneau existant.
  Validation finale : 9 nouveaux tests ; suite complète à 2 335 tests réussis
  (245 fichiers). Les 6 échecs et 2 erreurs TypeScript du chantier local
  congestion restent préexistants et inchangés.


- F13 : le terrain transmet sa frame exacte aux métriques et aux conseils
  (lecture, pause, scrub, export, poursuite au drag et match live).
  Le panier vient du sens de jeu et de l'équipe attaquante ; les anneaux de
  menace utilisent désormais ce même panier. Les conseils animés utilisent
  seulement les règles applicables à une image, sans relire l'étape sélectionnée.
  Les analyses historiques restent disponibles dans l'éditeur. Aucune proposition
  de nouvelle passe/tir pendant le vol du ballon. Tests : analyse indépendante de
  l'étape active, panier adverse, porteur, absence de mutation et transmission
  de la frame via le hook en lecture/pause/reprise/export.
  Validation F13 : 2 338 tests passent ; seuls les 6 échecs et 2 erreurs
  TypeScript préexistants liés à la congestion subsistent.


- F08 terminé : budget défensif proportionnel à la durée écoulée, avec 4 s
  comme référence conservant le réglage standard. Les interpolations divisent
  le temps disponible ; elles ne créent ni vitesse ni accélération gratuite.
  Délais de perception/pivot calculés sur cette même durée source, cache invalidé
  lors des changements de durée. Les scénarios temporisés et le profil réaliste
  repartent de la position effectivement atteinte. Le mode legacy sans durée
  explicite conserve ses cibles historiques et ses snapshots.
  Les trajectoires offensives restent celles dessinées par le coach ; F12
  signale une vitesse demandée excessive. Contacts imposés et overrides gardent
  leur priorité : une simulation biomécanique complète reste le lot R03/R04.
  Validation F08 : 2 342 tests passent, dont tous les tests écran, overlap,
  userJson et screenLab. Seuls les 6 échecs et 2 erreurs TypeScript préexistants
  du chantier congestion subsistent.


- U01 : accès persistants « Créer un système », « Partir d’un modèle » et
  « Préparer une séance ». Les modèles ouvrent directement les systèmes
  classiques ; créer utilise la protection du brouillon déjà existante.
  Le choix d'un style défensif est placé avant les réglages détaillés.
  Navigation renommée « Enchaînements », « Fiches systèmes », « Match simulé » ;
  noms accessibles conservés lorsque la barre latérale est repliée.
  Vérification navigateur : accès modèles et séances, retour terrain et présence
  du choix de style en premier dans Défense. L'édition tactile complète et
  l'adaptation aux petits écrans restent U04.
  Validation U01 : suite complète à 2 342 tests réussis, puis test supplémentaire
  de refus de création si la protection du brouillon échoue (3 tests du hook
  repassés). Seuls les 6 échecs et 2 erreurs TypeScript congestion préexistants
  subsistent. La création réussie quitte aussi le match live et la lecture.


- U02 : préférence d’interface Coach / Analyse / Développement persistée
  séparément du système, accessible dans la barre latérale et les paramètres.
  Coach conserve préparation, consignes et lecture coach ; Analyse ajoute les
  mesures avancées, champs de vision, graphiques et réglages globaux ;
  Développement expose les diagnostics, paramètres expérimentaux et modèles Lab.
  Les overlays sont masqués effectivement sans modifier les flags du système
  ni sa physique. Les modèles Lab disparaissent aussi des filtres par catégorie.
  Distances des métriques en mètres, réglages globaux en mètres et m/s
  (budget historique ramené à la transition de référence de 4 s), navigation fine
  en secondes réelles ; indices de frames réservés au développement.
  Le compteur de protection de raquette respecte le nombre de joueurs actifs.
  Vérification navigateur : trois niveaux, unités, retour Lab → Coach, paramètres
  et lisibilité du sélecteur. Tests : persistance, stockage indisponible, absence
  de mutation du système/historique et conversion des unités. Suite complète :
  2 347 réussis, seuls les 6 échecs congestion préexistants ; type-check :
  les 2 erreurs congestion préexistantes. Prochaine priorité : U03.


- U03 : boutons « Annuler » / « Rétablir » visibles au-dessus du terrain
  (cibles 36 px, désactivés quand la pile est vide ou pendant la lecture,
  infobulles avec raccourci). Naviguer entre étapes ne remplit plus
  l’historique : Annuler revient sur la dernière vraie modification.
  Un seul gestionnaire clavier (`resolveShortcut`) remplace les trois
  gestionnaires de flèches et les deux d’Espace : ←/→ = étape (étapes réelles
  en lecteur/présentation), Maj+←/→ = 1/10 de transition, `,`/`.` = image
  fine, PageUp/PageDown en présentation, Échap quitte la présentation.
  Espace = lecture/pause au relâchement ; maintenu + glisser = déplacer la vue.
  Aucun raccourci hors terrain, dans un champ, ou avec une fenêtre modale
  ouverte (modales désormais `role="dialog"` / `aria-modal`) ; un bouton
  focus garde Espace. Outils : touche indiquée dans l’infobulle.
  Vérification navigateur : glisser → Annuler actif, Ctrl+Z puis Rétablir au clic.
  Suite complète : 2 366 réussis, seuls les 6 échecs congestion préexistants ;
  type-check : les 2 erreurs congestion préexistantes. Prochaine priorité : U04.


- U04 : barre tactile sur le terrain (édition uniquement) donnant un bouton à
  chaque geste qui exigeait une touche : « Sélection multiple » (Maj : toucher
  des défenseurs, lasso sur le vide), « Aimanter » (Ctrl/⌘), « Tracé libre »
  (Maj, dribble/course/écran), « Supprimer la dernière flèche » (Suppr/clic
  droit), « Annuler la passe » (Échap) et « Désélectionner ». Masquée en
  lecture, en mode lecteur et sur la page Simulation. Les aides « i » des menus
  joueur s'ouvrent au toucher ; renommer une variante et gérer les fiches de la
  bibliothèque (renommer, déplacer, supprimer) ne dépendent plus du survol ni du
  double-clic. Cibles : 36 px minimum à la souris sur les commandes d'édition,
  44 px pour toutes les commandes au doigt (`pointer: coarse`), cases à cocher
  24 px. Noms accessibles sur les boutons icône (lecture, arrêt, images, zoom,
  suppressions). Petits écrans (≤ 900 px) : la règle une colonne perdait en
  spécificité face à celle de 1100 px — terrain pleine largeur en tête, outils
  et vues dessous ; barre tactile en haut du terrain pour rester visible.
  Contraste (audit automatique WCAG 4,5:1 sur toutes les vues) : puce narrative
  du système réécrite en thème sombre (1,18 → > 7), noms des modèles de la
  bibliothèque (1,54 → 9), fiche imprimable restée blanche (titre 1,24 → 17),
  outil actif et boutons primaires sur orange/bleu foncés (3,9 → 5,2), croix de
  suppression et numéros d'actions éclaircis. Plus aucun texte sous le seuil
  hormis un dégradé décoratif du mode démo (≥ 4,4).
  Vérification navigateur : bureau 1440, tablette 767×1024 et téléphone 375 en
  émulation tactile (toutes commandes ≥ 44 px, appui long → menu joueur).
  Tests : 8 nouveaux (aimanter, sélection, tracé libre, suppression, passe en
  attente, visibilité). Suite complète : 2 374 réussis, seuls les 6 échecs
  congestion préexistants ; type-check : les 2 erreurs congestion préexistantes.
  Reste hors code : essai sur tablette physique (U06). Prochaine priorité : U05.


- U05 : « Dérouler la séance » (ou depuis un bloc) ouvre le terrain en mode
  lecteur avec une barre de déroulé : séance et bloc n/N, Précédent / Suivant,
  minuteur du bloc (départ, pause, remise à zéro, dépassement en +mm:ss),
  consignes repliables, choix de variante du système (sous-variantes libellées
  par leur chemin, « Lecture auto » si variantes réactives) et « Ma séance ».
  Un bloc libre sans visuel affiche une carte titre + consignes au lieu du
  système du bloc précédent ; un bloc système orphelin aussi. Contexte
  conservé : séance sélectionnée tenue par la page, déroulé (bloc, minuteur)
  persisté et recalé si des blocs sont supprimés ; bandeau « Déroulé en cours ·
  Reprendre / Terminer » dans la vue Séances. Défaut corrigé : chaque bloc
  ouvert écrasait l'unique copie de récupération du brouillon ; elle n'est
  désormais prise qu'au premier bloc chargé et « Terminer » restaure le
  brouillon d'avant la séance. La navigation d'étapes du lecteur reste
  indépendante des blocs.
  Vérification navigateur : séance de 5 blocs (libre, 3 anti-zones à variantes,
  Philadelphia) déroulée de bout en bout, variantes changées sur chaque système,
  aller-retour vers le plan, rechargement en cours de déroulé (même bloc),
  fin → brouillon PNR central retrouvé intact. Tests : module pur (minuteur,
  recalage, persistance, visuel de bloc), barre (bornes, minuteur, variantes),
  protection du brouillon sur enchaînement. Suite complète : 2 392 réussis,
  seuls les 6 échecs congestion préexistants ; type-check : les 2 erreurs
  congestion préexistantes. Lot 2 restant : U06 (validation humaine terrain).


- Construction pas à pas (hors lot initial, demandé après U05) : parcours coach
  rejoué dans le navigateur (créer, dessiner une course, « + étape », passe,
  annuler). Corrigés : étape vide dupliquée par « + étape » (temps mort de 4 s),
  zone Outils écrasée à 27 px en 1024×768, cinq compteurs d'étapes divergents
  (panneau, timeline, badge ▶, lecteur, présentation — puis fiches), passe
  dessinée en premier jamais animée, passe dessinée sur l'étape k jouée pendant
  k−1 → k. Règle retenue : ce qui est affiché sur l'étape k se joue pendant
  k → k+1 (`stepActions.ts`) ; stockage et moteur de lecture inchangés
  (seul export d'une constante dans `playbackTrajectory.ts`). Modèles : libellés
  remontés sur l'étape de l'action. Guidage : bandeau sur système vierge,
  panneau Étapes ouvert par défaut.
  Vérification navigateur : course → + étape → passe (course 0–4 s, passe
  4–8 s, ballon chez le passeur), Horns flare (3 étapes + position finale,
  barre Système alignée), fiche imprimable. Tests : 31 modèles passés en revue
  automatiquement. Suite complète : 2 466 réussis, seuls les 6 échecs
  congestion préexistants ; type-check : les 2 erreurs congestion préexistantes.
  Limite connue : les systèmes déjà enregistrés affichent leurs passes une
  étape plus tôt (là où elles se jouent) ; des libellés écrits pour l'ancien
  affichage peuvent être décalés d'une étape.
