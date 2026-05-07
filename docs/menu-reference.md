# Référence des menus

Documentation exhaustive de chaque réglage disponible dans l'interface.

## Header global

Affiché en haut de la page, regroupe les actions transverses.

| Bouton | Action |
|--------|--------|
| 📄 **playbook PDF** | Ouvre la vue playbook (overlay) pour exporter en PDF |
| **exporter JSON** | Télécharge l'état actuel en `.json` |
| **importer JSON** | Charge un fichier `.json` (merge avec defaults) |
| **reset complet** | Réinitialise tout, vide le localStorage |

## Panneau attaque (gauche, orange)

### Outils

Sélection de l'outil actif pour interagir avec le terrain.

| Outil | Comportement |
|-------|--------------|
| **déplacer** | Drag-and-drop pour repositionner les joueurs |
| **passe** | Dessine une flèche pointillée orange ; change le porteur |
| **dribble** | Dessine une flèche en zig-zag orange |
| **course** | Dessine une flèche pleine grise (cut) |
| **écran** | Dessine un trait + barre en T (manuel, indépendant de la détection) |

### Bibliothèque systèmes

Templates de systèmes offensifs chargeables en un clic.

| Système | Contenu |
|---------|---------|
| **PNR central** | Pick & roll au centre, 4 étapes (setup, écran, utilisation, roll) |
| **Horns flare** | Alignement Horns + flare screen côté faible, 4 étapes |
| **Pindown coin** | Pindown pour O2 dans le coin, 4 étapes |

Charger un système écrase les étapes en cours (avec confirmation si présence de travail).

### Étapes

Liste des étapes du système courant. L'étape active est éditable :
- **#N** : numéro
- **input texte** : label libre éditable ("dribble drive", "skip pass"…)
- **switch** : indicateur si un switch a été enregistré
- **porteur** : sélecteur du porteur de balle (O1–O5)
- **N annot.** : nombre d'annotations dessinées

Boutons :
- **+ étape** : ajoute une étape héritant des positions de l'étape active
- **dup.** : duplique l'étape active
- **suppr.** : supprime l'étape active (si plus d'une)

### Lecture

| Bouton | Action |
|--------|--------|
| ▶ **play / ⏸ pause** | Démarre/met en pause la lecture animée |
| ■ **stop** | Stoppe et revient à l'étape 0 |
| **vitesse** | Multiplicateur 0.3× → 2× (slider) |

## Métriques (sous la timeline)

Pills colorées affichées en temps réel selon l'étape active. Voir `lib/logic/metrics.ts` pour la formule de chaque indicateur :

| Pill | Sens | Tooltip |
|------|------|---------|
| **raquette** | Nb défenseurs à <100px du panier | Couverture raquette |
| **gap max** | Plus grand écart attaquant ↔ défenseur le plus proche | Indique l'attaquant le plus libre |
| **écart moy** | Distance moyenne défenseur ↔ son matché | — |
| **en retard** | Nb de défenseurs `late: true` | — |
| **aide** | Somme des `helpFactor` | Intensité d'aide globale |
| **passes** | `ouvertes / total` depuis le porteur | Détail ouvertes/contestées/bloquées |

Code couleur des pills : vert (bon), orange (alerte), rouge (mauvais), gris (neutre).

## Timeline

Sous le terrain. Permet de naviguer dans les étapes.

- **Track** : barre horizontale, portion remplie en orange (édition) / bleue (lecture)
- **Marqueurs** : un cercle par étape, cliquable pour activer
- **Playhead** : draggable, scrubbing fluide entre étapes au drag
- **Snap** : au relâchement, l'étape entière la plus proche est activée
- **Pendant la lecture** : le playhead avance automatiquement, alimenté par `playbackT` remonté depuis `CourtView`
- **Texte** : "Étape N / total — label" + "porteur : Ox"

## Panneau défense (droit, bleu)

### Presets

Configurations défensives complètes chargeables en un clic. Six presets fournis :

- **Drop coverage** : pivot recule, extérieurs over
- **Switch tout** : tous switchent (porteur + non-porteur)
- **Hedge & recover** : show classique du défenseur du screener puis recover
- **Ice (force baseline) + drop** : pousse le porteur côté ligne de fond, drop shallow
- **Fond de raquette** : priorité absolue à la protection raquette, under sur écrans
- **Pression all-court** : pression haute, blitz sur écran porteur, peu d'aide

Chaque preset patche : `defenseSystem`, `screenRule`, `dropDepth`, `offBallScreenRule`, `defenseDistance`, `defenseMaxSpeed`, `triggers`, et les 5 règles individuelles. Une confirmation est demandée avant application.

### Système

Choix entre **homme** et **zone**. Bascule masque/affiche les sections suivantes.

### Configuration zone (visible si système = zone)

| Réglage | Valeurs | Effet |
|---------|---------|-------|
| **type** | 2-3, 1-3-1, 3-2, match-up | Layout de la zone |
| **pression bal.** | 0–100 | Attraction des défenseurs vers le ballon |
| **vit. rotation** | 40–200 | Vitesse max des rotations en zone |
| **trap en coin** | bool | (zone-only) toggle pour la défense de zone — voir `zoneConfig.trapCorners`. Ne pas confondre avec `triggers.trap` qui régit le trap automatique en défense individuelle. |
| **extension 3pts** | bool | Étend la couverture au-delà de la ligne (placeholder) |

### Paramètres globaux (visible si système = homme)

| Réglage | Valeurs | Effet |
|---------|---------|-------|
| **distance** | 20–80 | Distance par défaut défenseur ↔ son homme |
| **vit. max** | 40–200 | Distance max parcourue par étape — au-delà : `late` |

#### Triggers d'aide

Conditions qui activent l'aide automatique :

| Trigger | Condition |
|---------|-----------|
| **aide sur drive** | Porteur s'approche du panier (delta > 25px / 250px du panier) |
| **aide sur post-up** | Porteur en poste bas, stationnaire |
| **aide si porteur dans raquette** | Porteur dans la peinture |
| **trap si porteur en coin fond** | Porteur dans la zone coin gauche/droit fond → le défenseur le plus proche vient verrouiller le côté opposé pour fermer la cage |

Indépendants des triggers :
- **sag baseline weak-side** toujours actif (défenseurs avec `helpPct > 0` côté faible)
- **strong-side denial** automatique quand pas de trigger + même côté que le ballon + `priority !== 'paint'`

### Écran porteur (visible si système = homme)

| Réglage | Valeurs | Effet |
|---------|---------|-------|
| **consigne** | over/under/switch/hedge/drop/blitz | Réponse défensive aux écrans porteur |
| **détection** | 20–60 | Rayon de détection de l'écran (px) |
| **profondeur** | shallow/medium/deep | Visible si consigne = drop, profondeur du repli |
| **annuler les switches actifs** | — | Vide tous les `Step.switches` |

### Écran non-porteur (visible si système = homme)

| Réglage | Valeurs | Effet |
|---------|---------|-------|
| **consigne** | over/under/switch/bump | Réponse défensive aux écrans hors-ballon |

### Règles individuelles (visible si système = homme)

Tableau 5 lignes (D1–D5) × 6 colonnes :

| Colonne | Valeurs | Description |
|---------|---------|-------------|
| **D#** | — | Identifiant du défenseur |
| **aide** | 0–100 | Intensité d'aide en % |
| **prio.** | raquette / homme / passe | Cible préférée quand on aide |
| **vs porteur** | coller / bumper / contester / reculer / topside / baseline | Comportement quand on défend le porteur |
| **hors-bal.** | sag / derrière / stunt / 3/4 deny / devant | Stance quand on défend hors-ballon (stunt = fake d'aide, blend 0.4 entre derrière et devant) |
| **écran** | auto / over / under / switch / hedge / drop / blitz | Override individuel sur écran porteur (auto = règle globale) |

Astuce : **clic-droit** sur un défenseur sur le terrain ouvre un menu compact avec les mêmes réglages.

### Visualisation

| Toggle | Effet |
|--------|-------|
| **lignes d'aide** | Affiche les lignes pointillées violettes entre la position d'aide et la position de marquage homme |
| **matchups (traits)** | Trait gris entre chaque défenseur et son attaquant (orange si switch) |
| **terrain complet** | Étend le terrain à 1080 de hauteur avec second panier (active aussi le bouton "↻ sens d'attaque") |
| **lignes de passe** | Lignes colorées (vert / orange / rouge) depuis le porteur vers chaque cible selon ouverture/contestation/blocage |
| **mode fantôme (ghost N-1)** | Affiche en transparence les positions de l'étape précédente pour visualiser les vecteurs de déplacement. Inactif pendant la lecture et le scrubbing. |
| **numéroter les actions (1, 2, 3…)** | Affiche des badges noirs numérotés au pied du joueur initiateur de chaque annotation de l'étape active, dans l'ordre des annotations. Inactif pendant la lecture et le scrubbing. Apparaît aussi automatiquement dans les vignettes du playbook PDF. |
| **↻ sens d'attaque** | Bascule `attackingDirection` entre `up` et `down`. Disponible uniquement en terrain complet. La logique défensive (man + zone) suit le panier ciblé : positions, layouts de zone (polygones miroir), triggers, trap, metrics, rotations. |

## Menu contextuel (clic-droit)

Le clic-droit ouvre un menu différent selon le joueur ciblé.

### Outils (commun aux deux menus)

Une barre compacte en haut de chaque menu permet de **changer l'outil** courant sans aller chercher le panneau gauche : `déplacer / passe / dribble / course / écran`. L'outil est un état global, pas lié au joueur survolé. Les outils non-applicables aux défenseurs (passe/dribble/course/écran — qui dessinent depuis un attaquant) sont grisés visuellement dans le menu défenseur mais restent cliquables : ils définissent le mode pour les prochaines interactions sur les attaquants.

### Sur un défenseur (bleu)

Cinq réglages :
- **aide %** : slider 0–100 + valeur
- **priorité** : raquette / homme / passe
- **vs porteur** : 6 valeurs (cf. tableau)
- **hors-ballon** : 5 stances (sag / derrière / stunt / 3/4 deny / devant)
- **vs écran** : auto + 6 règles d'écran (override individuel)

Si une position manuelle (override drag) est active, un bouton "↻ ré-auto-positionner" apparaît en bas du menu.

### Sur un attaquant (orange)

Trois actions :
- **marquer comme porteur** — équivalent rapide du sélecteur "porteur" du panneau gauche
- **forcer comme poseur d'écran** — pose `Step.forcedScreener` sur l'étape active. Le moteur saute l'auto-detection de proximité et utilise cet attaquant directement comme poseur. Cadenas violet 🔒 affiché sur le joueur. Bouton "↻ libérer" pour annuler.
- **effacer ses annotations** — supprime toutes les annotations dont `fromId === oId` sur l'étape active

### Comportement commun

Se ferme au clic en dehors. Si la cible DOM est un poseur d'écran (rendu au-dessus dans la pile SVG, masque le `data-id` du joueur en dessous), fallback automatique sur la recherche du joueur le plus proche du point cliqué.

## Vue playbook (overlay)

Ouverte par le bouton "📄 playbook PDF" du header.

| Réglage | Effet |
|---------|-------|
| **titre** | Titre du document (input éditable) |
| **colonnes** | 1 / 2 / 3 vignettes par ligne |
| **défense** | Affiche ou masque les défenseurs dans les vignettes |
| **légende** | Affiche en pied de page la légende des conventions de tracé |
| **🖨 imprimer / PDF** | Lance `window.print()` du navigateur |
| **fermer** | Ferme l'overlay |

Le CSS `@media print` masque tout sauf le contenu playbook pour l'export.

## Persistance automatique

Tous les réglages sont sauvegardés en localStorage (clé `basket-tactics-state-v1`) avec un debounce de 400ms après chaque modification. Au prochain reload, tout est restauré.

Le bouton **reset complet** vide aussi le localStorage.
