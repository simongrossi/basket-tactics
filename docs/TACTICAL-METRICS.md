# Métriques tactiques — EJE / EJO / EJP + graphe de spacing

Module **pur, read-only** sous [`src/lib/logic/tactical/`](../src/lib/logic/tactical/).
Encode des concepts tactiques classiques (Mérand / Vandevelde) sous une
forme directement consommable par les algos de positionnement.

> **Statut au 2026-05-13** : fondation livrée et testée
> (23 tests, [tacticalMetrics.test.ts](../src/lib/logic/__tests__/tacticalMetrics.test.ts)).
> **Aucun consommateur** dans le moteur pour l'instant — module
> volontairement inerte. Les branchements prévus sont listés en
> [§ Branchements à venir](#branchements-à-venir).

---

## Pourquoi ce module

Le moteur existant raisonne **localement** : chaque évaluation regarde
au plus une paire (porteur ↔ défenseur le plus proche, attaquant ↔
receveur). Aucune notion de **forme collective** n'existait :

- pas de surface d'occupation d'équipe
- pas de couloir ballon-panier
- pas de structure égocentrée pour qualifier la position d'un défenseur
  relativement au porteur
- pas de **graphe** d'équipe (dispersion totale, centralité, pivot
  structurel)

Or les travaux de Robert Mérand (ENSEP) et Gilles Vandevelde ont
formalisé ces objets sous trois niveaux d'analyse spatiale (EJE, EJO,
EJP). Ce module les implémente à l'identique en TypeScript pour qu'on
puisse les brancher dans les couches suivantes : évaluation offensive,
auto-positionnement hors-ballon, scoring de spacing pour feedback user.

---

## Conventions de repère (imposées par l'existant)

| Repère        | Valeur                                                        |
| ------------- | ------------------------------------------------------------- |
| Coordonnées   | SVG : `x` vers la droite, `y` vers le bas                     |
| Échelle       | `PX_PER_M = 37` (cf. [`data/court.ts`](../src/lib/data/court.ts)) |
| Panier        | `HOOP = (300, 75)`                                            |
| Panier opposé | `HOOP_OPPOSITE = (300, 1005)`                                 |
| Angles        | 0° = nord, 90° = est, 180° = sud, 270° = ouest, **sens horaire** |
| Vocabulaire   | porteur / panier / défenseur / homme marqué (**jamais** cardinaux dans les noms publics) |

Toutes les fonctions du module respectent ces conventions. En interne,
quelques calculs trigo manipulent les directions en cardinal pour la
maths pure ; l'API publique ne les expose jamais.

---

## EJE — Espace de Jeu Effectif

> *Aire réelle sur laquelle se déploie l'activité des dix joueurs.*

Implémenté comme **convex hull** (enveloppe convexe) sur un set de
points, dans [`spacingGraph.ts`](../src/lib/logic/tactical/spacingGraph.ts).

### Algorithme

`convexHull(points)` utilise l'algorithme **Andrew's monotone chain** :

1. Tri lexicographique par `(x, y)`.
2. Déduplication des points strictement égaux.
3. Construction du **lower hull** : pour chaque point, on retire la
   queue de la pile tant que le triplet (avant-dernier, dernier, courant)
   ne fait pas un virage strictement à gauche (`cross > 0`).
4. Construction du **upper hull** dans l'ordre inverse.
5. Concaténation `lower + upper`, en retirant les doublons aux
   extrémités.

**Complexité** : `O(n log n)`.

**Critère de virage** :

```ts
cross(O, A, B) = (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)
```

Le test `cross <= 0` (≤, pas <) **retire les points colinéaires
intérieurs**, conformément à la définition d'un hull au sens strict.
Conséquence importante :

- 3 points colinéaires → hull de **2 points** (les deux extrêmes).
- Polygone à 4 sommets dont 1 sur une arête → hull de 3 sommets.

### Surface de l'EJE

`polygonArea(poly)` applique la formule du **lacet (shoelace)** :

```
A = | Σ (x_i · y_{i+1} − x_{i+1} · y_i) | / 2
```

Le `Math.abs` rend la fonction indépendante du sens de parcours du
polygone (utile car le sens "antihoraire mathématique" sur un repère
y-down s'inverse visuellement).

### Test d'appartenance

`pointInPolygon(p, poly)` utilise le **ray-casting** classique
(comptage des intersections d'un rayon horizontal partant de `p`). Cas
limites (point sur une arête) : comportement non garanti — on évite ce
cas en pratique en faisant légèrement déborder/réduire le polygone
selon le besoin.

---

## EJO — Espace de Jeu Offensif

> *Couloir de jeu direct entre le ballon et la cible. Vandevelde le
> trace de part et d'autre de l'axe à 1.5 m – 2.5 m de chaque côté.*

Implémenté dans [`ejo.ts`](../src/lib/logic/tactical/ejo.ts).

### Géométrie

`buildEJO(ball, target, halfWidthPx?)` construit un objet
`EJOCorridor` qui **cache** :

- `axis` : vecteur unitaire `ball → target`
- `length` : distance ball-cible
- `halfWidthPx` : demi-largeur du couloir (défaut
  `EJO_CORRIDOR_NARROW_PX = 55.5 px` = 1.5 m)

Deux largeurs canoniques exposées :

| Constante                  | Pixels | Mètres | Usage                                                   |
| -------------------------- | -----: | -----: | ------------------------------------------------------- |
| `EJO_CORRIDOR_NARROW_PX`   | 55.5   | 1.5    | Couloir "strict" — jeu direct sous pression             |
| `EJO_CORRIDOR_WIDE_PX`     | 92.5   | 2.5    | Couloir "large" — drive avec marge de manœuvre          |

### Distance signée — convention de signe

`signedDistanceToAxis(p, c)` retourne :

```
d = axis.x · v.y − axis.y · v.x        avec  v = p − ball
```

C'est le **produit en croix 2D** entre l'axe et le vecteur ball→p.
Comme `axis` est unitaire, `|d|` est la distance perpendiculaire à
l'axe.

**Convention de signe** (validée par les tests) :

- `d > 0` ⇔ le point est **à droite** de l'axe ball→target, dans le
  sens du déplacement le long de l'axe.
- `d < 0` ⇔ à **gauche**.

Vérification rapide : pour l'axe `ball=(300,200) → target=(300,75)`
qui pointe vers le nord, `axis = (0, −1)`. Un point à `(340, 150)` a
`v = (40, −50)` et `d = 0·(−50) − (−1)·40 = 40` (positif). En SVG
y-down, +x est à l'est, et "à droite quand on marche vers le nord"
c'est l'est. ✓

> ⚠️ Cette convention **suppose que `axis` est unitaire**. Si `length
> = 0` (ball == target), `axis = (0, 0)` et toutes les distances
> signées valent 0 — `inCorridor` retourne alors `false`
> systématiquement.

### Appartenance au couloir

`inCorridor(p, c)` teste :

1. **Longitudinal** : `0 ≤ t ≤ length` avec `t = axis · v` (projection
   scalaire sur l'axe). Refuse les points derrière le ballon et au-delà
   du panier.
2. **Latéral** : `|signedDistance| ≤ halfWidthPx`.

### Bloqueurs

`corridorBlockers(c, defenders)` retourne les ids des défenseurs
**dans le couloir**, **triés** par valeur croissante de `t` — donc du
plus proche du ballon vers le plus proche de la cible. Utile pour
identifier le premier obstacle d'une action de jeu direct.

### Jeu direct vs jeu indirect (Vandevelde)

L'EJO est l'instrument quantitatif pour distinguer :

- **Action de jeu direct** : le ballon (ou un joueur) progresse à
  l'intérieur du couloir vers la cible. Fixe la défense, recherche le
  tir immédiat.
- **Action de jeu indirect** : le mouvement modifie la direction de
  l'axe ballon→cible et change l'orientation du couloir. Renversement,
  création de décalages.

Une équipe qui multiplie les passes courtes **dans** le couloir impose
une pression verticale ; un swing au coin opposé est un **jeu
indirect** qui redéfinit l'EJO. Ce module fournit la **mesure
instantanée** ; le suivi temporel (transition direct ↔ indirect) reste
à construire au moment où on branchera l'analyse de séquence.

---

## EJP — Espace de Jeu Proche

> *Rapport topologique entre le porteur, son défenseur direct et le
> ballon. Espace cylindrique égocentré autour du joueur, découpé en
> secteurs par les plans sagittal, frontal et scapulo-huméral.*

Implémenté dans [`ejp.ts`](../src/lib/logic/tactical/ejp.ts).

### Découpe en 8 secteurs métier

```
                  front
              ╱        ╲
       frontLeft     frontRight
        ╱                ╲
      left   ●  porteur   right
        ╲                ╱
        backLeft      backRight
              ╲        ╱
                  back
```

Le porteur regarde **vers le haut du schéma** (direction de son
`bodyDeg`). Chaque secteur couvre **45°**, centré sur sa direction
nominale :

| Secteur       | Bearing relatif (°)        |
| ------------- | -------------------------- |
| `front`       | [−22.5, +22.5]             |
| `frontRight`  | [22.5, 67.5]               |
| `right`       | [67.5, 112.5]              |
| `backRight`   | [112.5, 157.5]             |
| `back`        | [157.5, 202.5]             |
| `backLeft`    | [202.5, 247.5]             |
| `left`        | [247.5, 292.5]             |
| `frontLeft`   | [292.5, 337.5]             |

### Calcul du bearing

`readEJP(carrier, carrierBodyDeg, defender)` :

1. `v = defender − carrier`
2. `worldDeg = atan2(v.x, −v.y) · 180/π`
   → angle de `v` dans la convention projet (0° = nord, horaire). Le
   `−v.y` compense le repère y-down.
3. `bearingDeg = normalizeAngle(worldDeg − carrierBodyDeg)`
   → angle relatif au porteur dans `[0, 360)`.
4. `sector = sectorOf(bearingDeg)` via un `floor(shifted / 45) % 8`
   avec décalage de 22.5°.

### Invariance par rotation

Vérifié par test : un défenseur à `(350, 300)` (à l'est en absolu) est
classé `right` quand le porteur est face au nord (`bodyDeg = 0`), et
reclassé `front` quand le porteur est face à l'est (`bodyDeg = 90`).
Le repère égocentré tourne avec le porteur, sans dépendre du repère
monde.

---

## Graphe de spacing

Implémenté dans [`spacingGraph.ts`](../src/lib/logic/tactical/spacingGraph.ts).

### Structure

`buildSpacingGraph(players)` construit un **graphe complet** dont :

- les nœuds sont les ids du `Record<string, Point>` passé en entrée,
- les arêtes portent la distance euclidienne entre les deux nœuds.

Stockage en matrice symétrique `dist[i][j]` avec diagonale nulle. Les
ids sont triés lexicographiquement pour rendre la représentation
déterministe (et donc les tests reproductibles).

### Métriques dérivées

| Fonction                      | Sémantique                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `totalSpacing(g)`             | Somme des poids des `n(n−1)/2` arêtes. Dispersion globale de l'équipe.         |
| `avgPairwiseDistance(g)`      | Moyenne. Métrique d'unité comparable entre setups de tailles d'équipe différentes. |
| `maxPairwiseDistance(g)`      | Diamètre. Utilisé par le bucket grappe/comète.                                 |
| `centralityScores(g)`         | Pour chaque joueur, somme des distances aux autres. **Faible = central.**      |
| `pivotPlayer(g)`              | Joueur de centralité minimale = pivot structurel.                              |

> **Note sur la centralité** : on utilise la centralité de **closeness
> inversée** (somme des distances brutes). Dans la littérature graphes,
> la "closeness centrality" est `1/Σd`. On garde la somme brute pour
> rester en pixels et éviter une normalisation arbitraire. Le rang
> reste identique.

---

## Niveaux Mérand — heuristique grappe / comète / étalement / expert

> *Mérand a décrit la progression du joueur en quatre niveaux :
> débutant (grappe), débrouillé (comète), initié (étalement),
> expert (occupation totale).*

Implémenté dans
[`levelHeuristic.ts`](../src/lib/logic/tactical/levelHeuristic.ts). À
l'usage : feedback au coach sur la **forme** de la scène qu'il dessine.

### Décision

```
si  diameter < GRAPPE_MAX_DIAMETER             →  grappe
sinon si  ejeArea / diameter² < COMETE_MAX_RATIO  →  comète
sinon si  avgPairwise ≥ EXPERT_MIN_AVG            →  expert
sinon                                              →  étalement
```

### Seuils calibrés au 2026-05-13

| Constante                  | Valeur | Justification                                               |
| -------------------------- | -----: | ----------------------------------------------------------- |
| `GRAPPE_MAX_DIAMETER`      | 80 px  | ≈ 2.16 m. En dessous, les 5 joueurs sont quasi-collés.      |
| `COMETE_MAX_AREA_TO_DIAM2` | 0.2    | Ratio aire/diam² pour un polygone allongé. Un pentagone régulier vaut ≈ 0.66 ; une ligne pure vaut 0. |
| `EXPERT_MIN_AVG`           | 110 px | ≈ 3 m de distance moyenne entre paires. Seuil empirique à raffiner sur templates réels. |

> Ces seuils sont **arbitraires** au lancement et exportés comme
> constantes pour permettre l'ajustement après calibration sur des
> templates de coachs réels. Pas de tuning automatique pour l'instant.

### Cas dégénérés couverts par les tests

| Configuration                                   | Niveau attendu | Vérifié |
| ----------------------------------------------- | -------------- | ------- |
| 5 joueurs empilés sur 10 px de haut             | `grappe`       | ✓       |
| 5 joueurs alignés sur 400 px (collinéaires)     | `comete`       | ✓       |
| 5 joueurs en pentagone régulier r = 150 px      | `expert`       | ✓       |

---

## Surface publique

`import { ... } from '@/lib/logic/tactical'` (via
[`index.ts`](../src/lib/logic/tactical/index.ts)).

| Export                                  | Source                |
| --------------------------------------- | --------------------- |
| `SpacingGraph`, `buildSpacingGraph`     | spacingGraph.ts       |
| `totalSpacing`, `avgPairwiseDistance`   | spacingGraph.ts       |
| `maxPairwiseDistance`                   | spacingGraph.ts       |
| `centralityScores`, `pivotPlayer`       | spacingGraph.ts       |
| `convexHull`, `polygonArea`, `pointInPolygon` | spacingGraph.ts |
| `EJOCorridor`, `buildEJO`, `inCorridor` | ejo.ts                |
| `signedDistanceToAxis`, `corridorBlockers` | ejo.ts             |
| `EJO_CORRIDOR_NARROW_PX`, `EJO_CORRIDOR_WIDE_PX` | ejo.ts       |
| `EJPSector`, `EJPRead`, `readEJP`       | ejp.ts                |
| `SpacingLevel`, `SpacingReport`, `evaluateSpacing` | levelHeuristic.ts |
| `GRAPPE_MAX_DIAMETER`, `COMETE_MAX_AREA_TO_DIAM2`, `EXPERT_MIN_AVG` | levelHeuristic.ts |

---

## Garanties et non-interactions

- **Aucune mutation de position** dans le module. Toutes les fonctions
  sont pures et idempotentes → la
  [Règle 1 anti-superposition](PLAYER-CLEARANCE.md) est trivialement
  satisfaite côté tactical.
- **Aucun import du module** depuis le reste du moteur au 2026-05-13.
  Désactivable instantanément (suppression du dossier sans casser
  aucune build).
- **Pas d'effet de bord I/O** : aucune lecture de `AppState`, aucun
  store mutation, aucun side-effect React. Utilisable depuis un test
  unitaire, un script node, un worker.

---

## Branchements à venir

Esquisses validées par les signatures actuelles. **Chaque branche fera
l'objet d'un plan séparé.**

### A. Enrichissement de l'évaluation offensive

Cible : [`src/lib/logic/offense.ts`](../src/lib/logic/offense.ts) →
`evaluateOffensiveOptions`.

1. **Drive — pénalité de couloir saturé** : avant de calculer
   `driveShotQ`, construire
   `ejo = buildEJO(carrierPos, hoop, EJO_CORRIDOR_WIDE_PX)`, compter les
   bloqueurs via `corridorBlockers(ejo, defPos)`. Multiplier
   `driveShotQ` par un facteur `1 − k · nbBloqueurs` (k à calibrer,
   probablement 0.25 pour qu'un seul homme déjà dans le couloir coupe
   25% de la qualité du drive).
2. **Pass-shoot — malus si défenseur en `'front'` du receveur** :
   appeler `readEJP(receiver, receiverBody, nearestDef)`. Si
   `sector === 'front'`, malus de `receivability` (passe interceptable).
   Si `sector === 'back'` au contraire, bonus léger (défenseur
   trailing). La présence de `carrierBodyDeg` côté receveur est déjà
   calculée par `computeAttackerOrientation`.

### B. Auto-positionnement attaquants hors-ballon

Cible : nouveau module `src/lib/logic/autoOffense/` (à créer).

Algorithme proposé :

1. Pour chaque hors-ballon `Oi`, échantillonner `k` (≈ 12) positions
   candidates dans un anneau autour du panier (compatibles avec son
   profil : `shooter` au-delà de la ligne à 3, `rim-roller` proche du
   cercle…).
2. Pour chaque candidate, recalculer
   `totalSpacing(buildSpacingGraph(off'))` avec `off'` = positions
   actuelles + cette candidate, et soustraire une pénalité dérivée du
   `EJO` (rester en dehors du couloir du porteur sauf si le rôle est
   de l'utiliser).
3. Prendre l'argmax.
4. **Obligatoire** : appliquer via `moveAttackerInState` pour que le
   push-out anti-overlap de la
   [Règle 1](PLAYER-CLEARANCE.md) se déclenche.

### C. Overlay debug (optionnel mais utile pour C.A et C.B)

Cible : nouveau composant `EJEOverlay.tsx` + toggle dans le panneau de
visualisation.

Dessine, quand activé :

- Le polygone EJE offensif (convex hull des 5 attaquants) en trait
  pointillé.
- Le couloir EJO (rectangle ballon→panier ± `halfWidthPx`).
- Un badge texte avec `evaluateSpacing(off).level` (grappe / comète /
  étalement / expert) coloré.

Pas besoin de toucher au moteur — overlay rendu côté UI uniquement.

---

## Tests

Suite unique :
[`src/lib/logic/__tests__/tacticalMetrics.test.ts`](../src/lib/logic/__tests__/tacticalMetrics.test.ts).

23 cas couvrant :

- **spacingGraph** (8 cas) : matrice symétrique, pentagone régulier,
  plus-sign centralité, hull carré, hull avec point intérieur, hull
  colinéaire, polygonArea, pointInPolygon, maxPairwiseDistance.
- **ejo** (5 cas) : axe nord, symétrie de la distance signée, largeur
  configurable, exclusion longitudinale, bloqueurs triés.
- **ejp** (5 cas) : front, right, back, left, invariance par rotation
  du porteur, frontRight (diagonale).
- **evaluateSpacing** (3 cas) : grappe, comète, expert.

Lancer ciblé : `npx vitest run src/lib/logic/__tests__/tacticalMetrics.test.ts`.

---

## Références théoriques

- **Robert Mérand** (ENSEP) — conception dialectique du sport ;
  couple attaquant/défenseur comme unité minimale d'analyse ; quatre
  niveaux d'expertise (débutant → expert).
- **Gilles Vandevelde** — formalisation des repères topologiques EJE /
  EJO / EJP ; distinction action de jeu direct / indirect ; indice
  d'effectivité du tir à mi-distance (TMD).
- **Andrew (1979)** — algorithme du *monotone chain* pour le convex
  hull en `O(n log n)`.

---

## Historique

- **2026-05-13** : fondation livrée (commit `389aad5`). 6 fichiers,
  562 LOC, 23 tests. Aucune modification du moteur existant.
