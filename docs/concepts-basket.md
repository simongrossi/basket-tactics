# Concepts basket modélisés

Glossaire des concepts tactiques implémentés dans le moteur, avec leur contrepartie code.

## Marquage individuel (man-to-man)

Chaque défenseur D1–D5 est associé à un attaquant O1–O5 (`Matchups`). Sa position cible par défaut est entre son homme et le panier, à `defenseDistance` pixels devant lui.

Code : `manTarget()` dans [`manDefense.ts`](../src/lib/logic/manDefense.ts).

## Comportement vs porteur (carrier behavior)

Quand un défenseur affronte directement le porteur du ballon, il peut adopter 6 attitudes :

| Code | Description | Effet géométrique |
|------|-------------|-------------------|
| `coller` | Pression rapprochée | base ratio 0.4, près du porteur |
| `bumper` | Reste entre porteur et panier | ratio 0.25 + offset 8px vers le panier |
| `contester` | Recul actif, contestation tir | ratio 0.7, plus loin |
| `reculer` | Drop profond, ne presse pas | ratio 1.3, très loin |
| `topside` | Force le porteur vers le milieu | offset latéral +14px côté ligne médiane |
| `baseline` | Force le porteur vers la ligne de fond | offset latéral -14px |

Tous modulés par un `pressureFactor` qui resserre le marquage quand le porteur est proche du panier.

## Stance hors-ballon (off-ball)

Quand un défenseur ne défend PAS le porteur, sa stance détermine où il se tient :

| Code | Description | Position |
|------|-------------|----------|
| `sag` (défaut) | Position d'aide classique avec sag baseline weak-side | manTarget + biais d'aide |
| `behind` | Strict entre attaquant et panier, pas d'aide | manTarget pur |
| `deny-3q` | 3/4 deny, pied dans la ligne de passe | 75% entre behind et fronting |
| `fronting` | Full denial / face guard | Entre attaquant et ballon |

Géométriquement, `deny-3q` et `fronting` interpolent entre le point « behind » (sur la ligne attaquant-panier) et le point « fronting » (sur la ligne attaquant-ballon).

Quand la stance est dirigée (≠ sag), les triggers d'aide sont **ignorés** : la position est absolue, pas modulée.

## Aide défensive (help)

L'aide est l'action de quitter momentanément son homme pour combler un danger. Elle est paramétrée par 3 dimensions :

- **`helpPct`** (0–100) : intensité de l'aide
- **`priority`** : où viser quand on aide
  - `paint` : couvre la raquette (cible le bloc bas le plus chargé)
  - `man` : reste sur son homme (n'aide jamais)
  - `passlane` : se rabat sur la ligne de passe entre son homme et le porteur
- **Triggers** : quand l'aide se déclenche
  - `drive` : porteur qui s'approche du panier (delta de 25px entre étapes)
  - `post` : porteur en poste bas, immobile (`y > 120`, mouvement < 30px)
  - `paint` : porteur dans la raquette

### Sag baseline (toujours actif)

Indépendamment des triggers, un défenseur weak-side avec `helpPct > 0` sag d'environ 50% de son helpPct vers la ligne d'aide. C'est le **principe ball-you-man** appliqué automatiquement.

Le sag est désactivé si `priority === 'man'`, et n'agit que si l'attaquant et le porteur sont du côté opposé du terrain (côté faible).

## Ligne du ballon (ball side)

Le terrain est divisé en deux côtés (gauche / droite) par l'axe ballon-panier. Un défenseur est :
- **Strong-side** : du même côté que le ballon → reste près de son homme
- **Weak-side** : côté opposé → sag en aide

Code : `ballSide(carrierPos)` dans [`geometry.ts`](../src/lib/logic/geometry.ts).

## Écran porteur (on-ball screen / pick & roll)

Un attaquant non-porteur (le « screener ») se positionne près du défenseur du porteur pour lui faire obstacle. Détection : tout attaquant à moins de `screenRadius` du défenseur du porteur ET à moins de 80px du porteur.

### Six réponses défensives

| Règle | Description | Effet |
|-------|-------------|-------|
| `over` | Le défenseur du porteur passe par-dessus l'écran (côté ballon) | Décalage perpendiculaire 14–32px du côté du porteur |
| `under` | Le défenseur passe sous l'écran (côté panier) | Décalage de 36px vers le panier |
| `switch` | Les deux défenseurs échangent leurs hommes | Mutation des matchups, persistée dans `Step.switches` |
| `hedge` | Le défenseur du screener montre puis recover | Avance temporairement vers le porteur, interpolation selon la distance |
| `drop` | Le défenseur du screener recule en couverture | Position derrière le screener vers le panier (depth shallow/medium/deep) |
| `blitz` | Les deux défenseurs piègent le porteur | Forme un V à 45° autour du porteur |

### Override par défenseur (`screenNav`)

Chaque défenseur peut avoir son **propre** comportement vs écran via `DefenderRule.screenNav` :
- `'auto'` (défaut) : suit la règle globale `state.screenRule`
- `'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz'` : override individuel

Quand un écran est détecté, le moteur regarde la `screenNav` du **défenseur du porteur** (`carrierDef`). Si non-auto, c'est cette valeur qui sert de règle effective pour la résolution de l'écran (et qui est affichée dans l'indicateur sur le terrain). Cas d'usage : tu peux avoir 5 défenseurs avec 5 comportements différents pour expliquer une consigne par poste ("D5 fait drop, D2 fait switch, les autres over").

### Garde anti-superposition

`pushOutOfScreener()` garantit qu'aucune position cible de défenseur ne se retrouve à l'intérieur du cercle du poseur d'écran (clearance = 2 × rayon joueur + 2px). Le poseur est aussi rendu **au-dessus** des défenseurs dans la pile SVG pour la lisibilité.

## Écran non-porteur (off-ball screen)

Un attaquant non-porteur pose un écran pour libérer un autre coupeur (cutter). Trois types détectés selon la géométrie :

- **`pindown`** : écran descendant — le screener est plus haut que le cutter (`screener.y > cutter.y + 20`)
- **`backscreen`** : écran montant / cutter coupe vers le panier (`screener.y < cutter.y - 20`)
- **`flare`** : écran latéral, cutter s'écarte du ballon (screener plus proche du ballon)

Quatre réponses : `over`, `under`, `switch`, `bump`.

## Switches cumulés

Les switches d'écran sont **persistés** par étape dans `Step.switches`. La fonction `getMatchupsAt(steps, stepIdx)` calcule les matchups en vigueur en cumulant tous les switches passés.

Cela permet de garder une cohérence : si D1↔D2 switchent au step 1, ce switch reste actif au step 2 (D1 défend O2, D2 défend O1) jusqu'à un éventuel re-switch ou un reset manuel.

Le bouton « annuler les switches actifs » vide tous les `Step.switches`.

## Défense de zone

Le terrain est partitionné en **régions** polygonales. Chaque défenseur est assigné à une région et doit couvrir l'attaquant le plus dangereux qui s'y trouve.

### Cinq layouts implémentés

Convention de coordonnées : `y=20` = ligne de fond (proche du panier), `y=540` = ligne médiane. Donc dans la description ci-dessous, "haut" du terrain = grands `y`, "bas" (près du panier) = petits `y`.

- **2-3** (style Wikipedia, compact) : 2 gardes au top (y=240..540), 3 derrière compacts y=20..240 (pivot dans la raquette à `y=110`, 2 ailes au niveau low blocks à `y=170`). Philosophie focus raquette.
- **1-3-1** : ancre baseline (y=20..160), 3 sur la ligne des LF (y=160..380, splittés G/C/D), chasseur top y=380..540.
- **3-2** : 3 au top large bande (y=220..540), 2 en bas restreint à la raquette + low blocks (y=20..220). Philosophie focus perimeter.
- **2-1-2** (losange) : 2 fronts perimeter (y=320..540, splittés G/D), 1 cœur de raquette (y=160..320 full width), 2 lows presque au niveau panier (y=20..160, splittés G/D).
- **match-up** : mêmes polygones que le 2-3 mais marquage individuel à l'intérieur de la zone.

### Algorithme par défenseur

Pour chaque zone :
1. Si **0 attaquant** dans la zone → shift de homePos vers le ballon (pondéré par `ballPressure`)
2. Si **1 attaquant** → position style man-target sur lui
3. Si **2+ attaquants** → on garde le plus proche du panier, on déclenche une rotation
4. Si le **porteur est dans la zone** → comportement « contester »

### Rotation

Si une zone est surchargée (2+) et qu'une zone adjacente est vide, le défenseur de la zone vide se déplace vers l'attaquant secondaire (plus loin du panier) de la zone surchargée. Marqué `isRotating: true`.

Code : `applyZoneRotation()` dans [`zoneDefense.ts`](../src/lib/logic/zoneDefense.ts).

### Décalage vertical (`verticalOffset`)

Slider "position vert." dans la config zone (-100 à +150 px). Décale tous les polygones et homePos verticalement, permet de "remonter" (zone basse) ou "redescendre" (zone haute) sans recoder les layouts. Appliqué dans `getZoneLayout(type, offset)`.

### Couverture (composant `ZoneCoverage`)

En zone, le composant remplace les `Matchups` classiques (toggle "matchups (traits)" du panneau visu) :
- Trait épais violet entre le défenseur et son `trackedAttacker` (l'attaquant principal de sa zone)
- Trait fin pointillé vert entre le défenseur et chaque autre attaquant présent dans sa zone (cas d'overload où plusieurs attaquants entrent dans la même zone)

Le défenseur "voit" donc tous les joueurs dont il a la charge à un instant donné, ce qui colle à la réalité d'une défense de zone (responsabilité par zone, pas par homme).

## Triggers d'aide (homme à homme)

Trois conditions activent l'aide globale (par-dessus le sag baseline) :

- **`drive`** : porteur en mouvement vers le panier — différence de distance au panier > 25px entre l'étape précédente et l'actuelle, ET dans les 250px du panier
- **`post`** : porteur en poste bas — `y > HOOP.y + 45` ET déplacement < 30px (stationnaire)
- **`paint`** : porteur dans la raquette

Quand au moins un trigger est actif, le `helpFactor` est calculé selon le `helpPct`, la stance, le côté ballon, et la priorité.

## Vitesse maximale (lateness)

Un défenseur ne peut pas se téléporter. Si la cible calculée est plus loin que `defenseMaxSpeed` pixels de sa position précédente, il est interpolé sur le chemin et marqué `late: true` (rendu en rouge).

C'est une simulation de la **réalité physique** : un défenseur en retard sur une rotation ne peut pas couvrir parfaitement.
