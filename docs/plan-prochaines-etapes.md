# Plan des prochaines étapes — UX / interactions

> Backlog d'exécution qui suit l'audit UX/interaction de octobre 2026.
> Les lots 0 à 7 sont livrés (commits `d0d8e2c` → `d1de97e`) : le socle de
> manipulation, la caméra, le chrome mobile et l'édition sont en place.
> Ce document liste ce qui reste, dans l'ordre recommandé.
>
> Référence d'architecture : [interaction-model.md](interaction-model.md).
> Dernière mise à jour : 2026-10-25.

## État de départ

- **Livré** : sélection au plus proche, seuil tap/drag, annulation Échap,
  présentation verrouillée, suppression non destructive + toast, cibles
  tactiles en pixels écran, caméra juste, barre d'outils basse, menus en
  portail, sélection + barre contextuelle, transport de présentation
  (scrub/vitesse/boucle), gel de l'analyse pendant un drag, réorganisation
  des étapes avec recalcul des trajectoires.
- **Vérifié** : `tsc --noEmit` propre, 2 856 tests verts (282 fichiers),
  `npm run build` OK.
- **Non vérifié** : l'ergonomie réelle au doigt et au stylet. C'est l'objet
  du P0 et cela ne peut pas être fait dans l'environnement de développement.

## Priorités

| P | Chantier | Pourquoi | Effort | Risque |
|---|---|---|---|---|
| **P0** | Validation appareils réels | Seule preuve valable du tactile ; peut réordonner le reste | ½ j de préparation + ½ j de tests | Aucun (lecture seule) |
| **P1** | Actions destructives restantes | Suppression d'étape, reset, import : ni confirmation ni « Annuler » | 1 j | Faible |
| **P2** | Options joueur au doigt | L'appui long seul est fragile et peu découvrable | 1–2 j | Moyen (doublon de menus) |
| **P3** | Partage & sauvegarde | Lien très long, sauvegarde qui quitte le terrain | 2–3 j | Moyen (dépendance QR) |
| **P4** | Accessibilité timeline | Dernier contrôle de lecture hors norme (focus, ARIA, cibles) | 1 j | Faible |
| **P5** | Performance mesurée | On a optimisé sans mesurer ; il faut des chiffres | 2 j | Faible |
| **P6** | Réorganisation avancée | Réorganisation refusée sur les séquences lissées | 2–3 j | Élevé |
| **P7** | Filet E2E tactile | Verrouiller les scénarios de manipulation | 2–3 j | Faible |

## P0 — Validation sur appareils réels

**But** : confirmer ou corriger les seuils (6 px, 44 px, 68dvh, taille de la
barre basse) avant d'ajouter quoi que ce soit.

### Matrice minimale

| Appareil | Ce qu'on valide |
|---|---|
| iPhone (Safari, pouce) | terrain, barre basse, menus, pincement |
| iPad (Safari, paysage) | présentation, lisibilité à 2 m, transport |
| Android milieu de gamme | fluidité du drag, clavier, retour |
| Desktop souris | clic droit, Espace, Ctrl+Z, molette |
| Hybride tactile + souris | bascule doigt/souris sans état bloqué |
| Stylet (Apple Pencil / S Pen) | paume, bouton latéral, survol |

### Scénarios à dérouler

1. **Cinq joueurs** : placer les 5 attaquants au doigt, dont deux à moins de
   34 unités. Aucun mauvais joueur saisi, aucun déplacement involontaire.
2. **Deux joueurs proches** : taper au milieu de deux joueurs ; vérifier que
   le plus proche est sélectionné et que le halo correspond.
3. **Tracés** : dessiner une course, un dribble, une passe ; vérifier le
   départ depuis le bon joueur et la flèche au bon endroit.
4. **Courbe** : taper une flèche, tirer la poignée de milieu, vérifier que la
   courbe suit le doigt et reste après relâchement.
5. **Terrain** : pincer pour zoomer sur un panier, vérifier que le point sous
   les doigts ne glisse pas ; panner ; recadrer avec le bouton.
6. **Présentation** : lancer, mettre en pause, scruber, changer la vitesse,
   activer la boucle, revenir au début. Vérifier qu'aucune modification n'est
   possible.
7. **Annuler** : supprimer une flèche, appuyer sur « Annuler » dans le toast ;
   supprimer une étape et vérifier l'état (P1) ; `Échap` pendant un drag.
8. **Réorganisation** : déplacer une étape avec des actions, vérifier la
   confirmation et que les flèches restent cohérentes, puis annuler.

### Métriques et cibles

| Métrique | Mesure | Cible |
|---|---|---|
| T1 — placer 5 joueurs | chrono | < 60 s |
| T2 — sélectionner 2 joueurs proches | erreurs / 20 essais | < 5 % |
| T3 — tracer 4 actions + 3 étapes | gestes | ≤ 2 gestes par action |
| T4 — courber une trajectoire | essais avant succès | 1 essai sur 2 |
| T5 — pan + zoom sans perdre le terrain | recadrages manuels | 0 |
| T6 — latence pointeur → pixel | p95 | < 50 ms |
| T7 — images perdues pendant un drag | % | < 5 % |
| T8 — modifications accidentelles en 10 min de présentation | occurrences | 0 |
| T9 — annulations après erreur de sélection | % des drags | < 5 % |

### Grille de retour

Pour chaque anomalie : appareil + navigateur, scénario, geste exact,
attendu / constaté, capture si possible, et si c'est un problème de **seuil**
(à ajuster) ou de **logique** (à corriger).

## P1 — Actions destructives restantes

- **Supprimer une étape** (`StepsPanel`) : confirmation ou toast « Annuler »
  (l'historique existe déjà, il suffit de le rendre visible).
- **Reset complet** (`SidebarOverflowMenu`) : confirmation explicite.
- **Import JSON** (`handleFile`) : protéger le brouillon courant avant
  écrasement, comme le fait déjà l'ouverture d'un lien partagé
  (`RECOVERY_KEY`), et proposer « Restaurer brouillon ».
- **Suppression dossier / système / séance** dans la Bibliothèque :
  confirmation (aujourd'hui immédiat).
- Critère de done : aucune action destructive sans confirmation ou
  annulation visible ; tests sur chaque point.

## P2 — Options joueur au doigt

- Ajouter une **barre de sélection joueur** (comme celle des trajectoires) :
  nom/numéro, « Options », « Ballon » (porteur), « Fermer ».
- Ouvrir le menu contextuel **au relâchement** de l'appui long (au lieu de
  pendant le maintien), pour éviter les menus ouverts par un doigt qui
  tremble.
- Conserver le clic droit et l'appui long comme entrées ; la barre est la
  troisième, découvrable.
- Critère de done : toutes les options d'un joueur accessibles en 2 gestes
  maximum au doigt, sans appui long.

## P3 — Partage et sauvegarde

- **QR code** du lien partagé (dépendance à valider : `qrcode`).
- **Sauvegarde inline** : nom + dossier dans une petite modale, sans quitter
  le terrain (aujourd'hui « Sauvegarder… » route vers la Bibliothèque).
- **Accès rapide en mode lecteur** : sélecteur des systèmes sauvegardés pour
  rejouer immédiatement (Situation D).
- **Longueur d'URL** : mesurer un système complet ; si > ~8 000 caractères,
  proposer le code BT1 en secours.
- Critère de done : partager un système en 2 gestes, le rouvrir sur un autre
  appareil sans quitter la lecture.

## P4 — Accessibilité de la timeline

- `role="slider"`, `aria-valuemin/max/now` et focus clavier sur la piste.
- Marqueurs d'étape à 20 px (aujourd'hui 14 px) avec zone de clic élargie.
- `aria-label` sur les boutons de pas fin/grossier (déjà présents) et
  annonce du compteur d'étape.
- Critère de done : navigation complète au clavier, cibles ≥ 44 px au doigt.

## P5 — Performance mesurée

- Instrumentation **dev uniquement** : marque au `pointerdown`, mesure du
  délai jusqu'au prochain paint, histogramme p50/p95.
- Réduire le double rendu `onFrameChange` → `setDisplayedCourt` quand seul
  l'identifiant de frame change.
- Mesurer sur les appareils du P0 et comparer aux cibles T6/T7.
- Critère de done : chiffres avant/après dans ce document.

## P6 — Réorganisation avancée

- Autoriser la réorganisation sur les séquences **lissées** : après le
  déplacement, régénérer les étapes interpolées (`breakUpTeleports`,
  `smoothMovementFlickers`) ou déplacer le bloc d'étapes lié.
- Statuer sur la convention de libellés des modèles importés
  (`toDepartureLabels`).
- Critère de done : réorganisation possible sur toute séquence, avec tests
  de lecture avant/après.

## P7 — Filet E2E tactile

- Playwright avec émulation tactile : tap vs drag, Échap, pincement, menus
  portail, présentation verrouillée.
- **Ce n'est pas une preuve tactile** : seulement un filet anti-régression.
- Critère de done : suite verte en CI, scénarios P0 rejoués automatiquement
  quand c'est possible.

## Ordre conseillé

1. **P0** (validation) + **P1** (sécurité) — aucun risque, gain immédiat.
2. **P2** puis **P4** — finitions de manipulation.
3. **P3** — parcours de partage.
4. **P5** — chiffrer avant d'optimiser davantage.
5. **P7** — filet, puis **P6** (le plus risqué) en dernier.

## Hors périmètre (décisions déjà prises)

- Pas de refonte esthétique sans bénéfice fonctionnel.
- Pas de remplacement du SVG par un canvas.
- Pas de multiplication des modes : édition / présentation / lecteur suffisent.
- Les formats `BT1` / `BTA1` / `BTG1`, le JSON et les liens partagés restent
  compatibles.
