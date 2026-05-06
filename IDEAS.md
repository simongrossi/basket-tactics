# Idées & TODO

Notes de développement au fil de l'eau. Les items en haut sont les plus récents.

---

## Comportements défensifs à affiner

### Sag weak-side baseline (FAIT)
Les défenseurs hors-ballon collaient leur homme tant qu'aucun trigger (drive/post-up/paint) n'était actif. Or en basket réel, un défenseur weak-side doit toujours :
- s'enfoncer d'un pas vers la ligne ballon-panier
- rester sous la ligne de la passe (y >= ball.y)
- avoir un pied dans la raquette si son homme est loin du ballon

Implémenté dans `help.ts` : sag baseline proportionnel à `helpPct` quand defender est weak-side.

### Path-aware screen avoidance (animation)
Aujourd'hui les positions cibles passent au-dessus du poseur d'écran (fonction `pushOutOfScreener`) mais le **chemin** entre étape N et étape N+1 reste une interpolation linéaire qui peut traverser le poseur d'écran pendant le playback. Pour que l'animation soit physiquement crédible :
- Détecter pendant l'animation si le segment `from→to` du défenseur croise le cercle du poseur d'écran
- Dévier la trajectoire (courbe Bezier ou détour à 1 point intermédiaire) qui contourne le poseur
- À implémenter dans la boucle RAF de `CourtView.tsx` avant l'interpolation

Idem pour le porteur qui dribble vers / passe à côté du poseur d'écran.

### Strong-side denial
Symétrique du sag : un défenseur strong-side proche du ballon devrait jouer "denial" (sur la ligne de passe entre son homme et le ballon, pas entre son homme et le panier). Actuellement le manTarget place toujours le défenseur entre attaquant et HOOP, jamais en denial.

### Closeout dynamique
Quand le ballon arrive sur un attaquant (passe entrante), son défenseur devrait faire un closeout (rapprochement rapide les deux dernières yards). Actuellement la transition est linéaire.

### Stunt and recover
Variante du hedge mais hors-ballon : tape vers le ballon puis recovery. Pas modélisé.

### Trap explicite (corner/sideline)
La règle blitz s'applique sur écrans. Un trap simple sur attrape-corner n'est pas modélisé.

---

## Features produit

### Persistance localStorage (FAIT)
Sauvegarde auto de l'état dans localStorage (debounce 400ms, clé `basket-tactics-state-v1`). Reset complet vide aussi le storage. Import/export inchangés. Merge avec defaults pour compatibilité ascendante.

### Step labels + carrier manuel + fin de playback (FAIT)
- Champ texte sur l'étape active pour la nommer ("dribble drive", "skip pass" etc.)
- Sélecteur du porteur du ballon par étape (sans avoir à dessiner une passe)
- Annotations affichées en cohérence avec l'étape en cours d'animation pendant le playback (avant : seulement celles de l'étape active)
- Fin de playback s'arrête sur la dernière étape (avant : retour à activeStep)

### Templates tactiques (FAIT — 3 templates v1)
Implémenté dans `lib/data/templates.ts` avec PNR central, Horns flare, Pindown coin. Section dépliable dans le panneau gauche, charger remplace les étapes en cours (avec confirmation si du travail est présent).

À ajouter plus tard : PNR aile, PNR step-up, Princeton chin, UCLA cut, Iverson cut, Floppy, Hammer action, Spain PNR. Format Template stable, ajouter une entrée dans le tableau `TEMPLATES` suffit.

### Métriques défensives
Score de couverture par étape :
- Distance moyenne défenseur ↔ son homme
- Nombre de gaps (espaces > Xpx entre adjacents)
- Couverture de la raquette (combien de défenseurs à <100px de HOOP)
- "Help score" : somme des helpFactor

Affichage dans un panneau lateral.

### Comparaison côte à côte
Charger deux solutions tactiques du même set offensif et les jouer en parallèle pour comparer la couverture.

### Annotations richer
- Texte libre placé sur le terrain
- Numérotation des actions (1. dribble, 2. écran, 3. coupe...)
- Couleurs personnalisables par annotation

### Undo / Redo
Stack d'états avec Ctrl+Z / Ctrl+Y. ~50 derniers états.

### Mode présentation
Cacher la sidebar, plein écran SVG, gros boutons play/pause/step.

### Export vidéo / GIF
Capturer la lecture complète en vidéo téléchargeable (canvas → mediarecorder ou côté serveur).

### Export playbook PDF / image (FAIT v1)
Implémenté avec `PlaybookView` (overlay) + `StepThumbnail` (rendu statique réutilisable). Bouton "playbook (PDF)" en bas du panneau ouvre la vue, l'utilisateur ajuste titre / colonnes / défense / légende, puis clique "imprimer / PDF" — le navigateur fait son print dialog avec "Save as PDF". CSS `@media print` masque tout sauf le contenu playbook, gère pageBreakInside.

Améliorations possibles :
- Page de garde dédiée
- Numérotation auto des étapes sur le terrain (cercles 1, 2, 3 sur les positions)
- Diff visuel entre étapes consécutives (ghost de la position précédente)
- Vrai PDF côté client (jsPDF) pour piloter pagination plus finement

---

## Tech / qualité

### Tests unitaires
Logique pure très testable :
- `engine.computeDefenseTargets` : inputs canoniques → outputs attendus
- `screens.detectScreen` / `detectOffBallScreens` : matrice de cas
- `zoneDefense.pointInPolygon` : edge cases
- `geometry` : trivial mais utile

Vitest, ~30 tests pour couvrir les chemins critiques.

### Git init + premier commit
Pas encore de repo. À faire avant tout refactor risqué.

### Refactor : extraire l'animation
La boucle RAF dans CourtView est bien isolée mais elle pourrait devenir un hook `usePlayback(state)` réutilisable.

### Documentation
Le README mentionne le projet mais pas les nouveaux paliers (zone, écrans non-porteur, sag baseline). À mettre à jour après stabilisation.

### Performance
Pas de souci visible aujourd'hui (5 vs 5, frames 60Hz fluides) mais `effectiveDefensePositions` recompute toute la chaîne récursivement à chaque step. Memo possible.

---

## UI / UX

### Réorganisation du menu défense (FAIT — bandeaux)
Bandeaux de section "DÉFENSE COLLECTIVE" et "DÉFENSE INDIVIDUELLE" pour distinguer visuellement les deux niveaux dans le panneau de droite. La structure des `<details>` reste inchangée.

À faire ensuite : presets globaux ("fond de raquette", "pression all-court", "switch tout", "drop coverage") qui appliquent en une fois système + screen rule + triggers + ratios — un select au-dessus des bandeaux.

### Symbolique défenseur "à la FIBA" (bras défensifs) (FAIT)
Deux arcs SVG (Bezier quadratique) au-dessus du cercle des défenseurs simulant les bras en posture défensive. Lisibilité immédiate.

Évolution future possible : pivoter les bras vers le porteur du ballon pour donner un effet "ils suivent le ballon".

### Terrain complet (FAIT)
Toggle `fullCourt` dans le panneau visu. Quand activé :
- viewBox étendu à 1080 de hauteur (au lieu de 560)
- moitié basse mirroitée via `transform="translate(0 1080) scale(1 -1)"`
- second panier symétrique au panier principal
- ligne médiane explicite + cercle central plein (au lieu du demi-cercle pointillé)
- clamps des positions joueurs étendus à `FULL_COURT_INNER_MAX_Y = 1060`

Reste à faire pour vraiment l'exploiter :
- Permettre à la défense d'avoir son propre panier (transition / fast break / contre-attaque). Actuellement `HOOP` est figé à (300, 75) et tout le calcul défensif se fait par rapport à ce panier unique.
- Repositionner les défenseurs selon le sens du jeu (défense bas, défense haut).
- Bouton "rotation 180°" pour basculer le sens d'attaque sans tout repositionner manuellement.

### Sliders avec input numérique
Actuellement uniquement curseurs pour distance/vit max/etc. Ajouter un input numérique en regard pour saisir la valeur précise.

### Tooltips sur les règles
"raquette" / "passlane" / "homme" : afficher au hover ce que ça veut dire concrètement.

### Drag avec snap optionnel
Ctrl+drag pour snap à la grille (positions homepos des zones, ligne 3pt, blocs bas).

### Mobile / tactile
PointerEvents fonctionnent mais la sidebar cache la moitié de l'écran sur petit écran. Layout responsive à revoir.

### Raccourcis clavier
- Espace : play/pause
- Flèches : changer d'étape
- M / P / D / R / E : changer d'outil
- Suppr : supprimer l'annotation sélectionnée

### Sélection d'annotation
Cliquer sur une flèche existante pour la sélectionner et la modifier/supprimer.

---

## Idées plus loin

### Modélisation des défenseurs comme agents
Au lieu d'une fonction pure qui calcule la position cible, chaque défenseur a un "état" (alerte, en récup, en aide) et des transitions. Plus réaliste mais nettement plus complexe.

### Mode coach (annotations vocales)
Enregistrer un commentaire audio synchronisé avec la lecture. Pour expliquer une tactique en différé.

### Multi-utilisateur / collaboration
Partage d'une simulation par URL, édition collaborative live. Backend nécessaire.

### IA suggérant la défense optimale
À partir d'un set offensif, proposer la meilleure réponse défensive (entraîner sur des datasets de matchs réels). Hors scope solo.
