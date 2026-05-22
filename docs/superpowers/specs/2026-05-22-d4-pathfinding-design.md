# D.4 — Pathfinding défensif (routage anticipé) — Design

Date : 2026-05-22
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Aujourd'hui un défenseur va en **ligne droite** vers sa cible :
- dans le calcul des cibles de step (`speedConstraint.ts` :
  `from + (to - from) * r`) ;
- dans le rendu playback (`frameResolver.ts` :
  `lerpPoint(defA[id], defB[id], effT)`).

Quand ce trajet droit croise un autre joueur, c'est `resolvePlayerCollisions`
qui corrige **a posteriori**. Conséquence : du bruit latéral, des
micro-secousses, et tout un empilement de pansements (rate limiter, jump
diagnostics, idle lerp). `docs/SCREEN-ENGINE.md` documente ~13 px de secousse
résiduelle sur `systeme_basket-8`.

Le système existant `pathAwareInterpolation.ts` (PAI) applique une déviation
tangentielle **réactive** par frame (cap 6 px) : il corrige les quasi-collisions
au coup par coup mais ne **planifie** pas un trajet propre à l'avance.

D.4 comble ce trou : un **routage anticipé** des trajectoires défensives
autour des obstacles dynamiques non-écran.

## Périmètre

Routage complet, livré en **2 phases** pour isoler le risque :

- **V1 — playback** : route la trajectoire d'interpolation entre 2 steps
  (`frameResolver`). Risque maîtrisé, golden metrics J.6 valident.
- **V2 — cibles de step** : route aussi le calcul des cibles dans
  `speedConstraint`. Touche le cœur du moteur défensif (Règle 1bis CLAUDE.md),
  livré **après** que V1 soit prouvé stable.

Le cœur du chantier — le module pur `defensiveRoute.ts` — s'écrit **une seule
fois** et est consommé aux deux endroits. Aucun retravail entre les phases ;
le découpage sert uniquement l'isolation du risque.

## Décisions de design

| Sujet | Décision |
|---|---|
| Algorithme | Routes candidates + courbe lisse. A* grille gardé comme fallback documenté si les golden metrics révèlent un cas non couvert. |
| Activation | Flag opt-in `state.defensiveRouting` (default `false` en V1), bascule défaut `true` une fois V1 prouvé stable. |
| Déclenchement | Dès **1 obstacle traversé** (suppression maximale du bruit). |
| Obstacles | Défenseurs + attaquants non-marqués. **Poseurs d'écran exclus** (gérés par le moteur d'écran — Règle 1bis : le routeur ne contredit jamais les routes over/under/hedge). |

## Section 1 — Module pur `defensiveRoute.ts`

Nouveau module dans `src/lib/logic/`. Aucune dépendance React, déterministe,
sans mutation d'entrée.

**Rôle unique** : étant donné `from`, `to`, et une liste d'obstacles
(points + rayon de clearance), produire un trajet lisse restant à
≥ clearance de chaque obstacle.

**Algorithme — routes candidates** :

1. Construire le segment direct `from → to`.
2. Filtrer les obstacles dont la distance au segment < seuil de clearance →
   obstacles « bloquants ».
3. Aucun bloquant → retour trajet droit (zéro waypoint).
4. Bloquants → les fusionner en cluster (centroïde + rayon couvrant), en
   réutilisant `pickBlockingCluster` de `geometry.ts`.
5. Générer **2 routes candidates** : un waypoint décalant le centroïde à
   gauche du segment, un à droite, chacun poussé de
   `rayonCluster + clearance`.
6. Valider chaque route (`from → waypoint → to`) contre **tous** les
   obstacles, scorer par longueur totale.
7. Retenir la plus courte valide. Si les deux échouent → fallback sur celle
   de moindre pénétration. Le routeur **dégrade gracieusement**, ne lève
   jamais d'exception.
8. Lisser la polyligne résultante en Catmull-Rom via `polyline.ts` (déjà
   reparamétré en longueur d'arc → vitesse perçue constante).

**Sortie** : un objet route échantillonnable `sampleAt(t ∈ [0,1]) → Point`,
plus sa longueur d'arc.

**Réutilisation** : `geometry.ts` a déjà `pickBlockingObstacle` /
`pickBlockingCluster` / `curveAroundStaggeredPair` pour les clusters
d'**écran**. D.4 mirroite cette logique pour les obstacles **non-écran** —
prior art éprouvé, mêmes patterns.

## Section 2 — V1 : câblage dans `frameResolver`

La position playback d'un défenseur est aujourd'hui
`lerpPoint(defA[id], defB[id], effT)`.

**Changement** : pour les défenseurs **éligibles**, remplacer ce lerp droit
par l'échantillonnage d'une route
`defensiveRoute(defA[id], defB[id], obstacles)`.

**Éligibilité** (sinon → lerp droit inchangé) :
- PAS dans `screenLockedDefenders` (contact d'écran → moteur d'écran) ;
- PAS piloté par `pnrRole` (rotations PnR tactiques) ;
- PAS d'override manuel (`defenseOverrides`).

**Obstacles** = positions des autres joueurs au **milieu de segment**
(`t = 0.5`), sauf : l'attaquant marqué (`matchedTo`), les poseurs du cluster
d'écran, le défenseur lui-même. Snapshot statique mid-segment → route
calculée **une fois par segment**, déterministe, cacheable via le cache
segmentaire J.2. Pas de recalcul par frame.

**Filets en aval conservés** :
- PAI (nudge réactif 6 px) reste pour les quasi-collisions résiduelles dues
  au mouvement des obstacles vs le snapshot mid-segment ;
- `resolvePlayerCollisions` reste le filet dur de clearance.

Le routeur agit **en amont** pour supprimer le bruit ; il ne remplace aucune
garantie existante.

## Section 3 — V2 : câblage dans `speedConstraint`

Dans `computeEffectiveDefensePositions`, le trajet `from → to` est aujourd'hui
une ligne droite mise à l'échelle (`from + (to - from) * r`).

**Changement** :
- Le défenseur suit `defensiveRoute(from, to, obstacles)`.
- Le `pathLen` qui sert au clamp de vitesse devient la **longueur de la
  route** (pas la distance droite) — le défenseur « paie » le détour,
  cohérent avec le Lever A existant qui fait déjà ça pour les clusters
  d'écran.
- La position d'un défenseur `late` devient « route échantillonnée à la
  longueur d'arc `r × routeLen` » au lieu du lerp droit.

**Obstacles** = attaquants non-marqués + autres défenseurs (les
`frictionObstacles` déjà construits dans cette fonction), **hors poseurs**
(les clusters d'écran restent gérés par `pathAroundScreensLength` / Lever A).

V2 et le Lever A sont donc **complémentaires** : V2 route les obstacles
non-écran, le Lever A route les écrans.

C'est la partie sensible **Règle 1bis** — d'où la livraison après validation
de V1.

## Section 4 — Tests & garde-fous

- **Module pur** : route évite l'obstacle · retourne droit si dégagé ·
  choisit le côté le plus court · cas dégénérés (obstacle sur un endpoint,
  `from == to`) · déterminisme (2 appels successifs = même résultat).
- **Golden metrics J.6** : régénérer les 4 snapshots de référence, vérifier
  `maxJump` en baisse, `minClearance` en hausse, zéro nouvel overlap.
- **Règle 1bis** : suite complète `screens*` + `overlap*` + `userJson*` +
  `screenLab*` verte à chaque commit (obligation CLAUDE.md).
- **Invariant clearance** : les défenseurs routés ne se superposent jamais
  (`overlapInvariants.test.ts`, cf. `docs/PLAYER-CLEARANCE.md`).
- **Flag** : `state.defensiveRouting` (default `false` en V1) → toggle dans
  `DefensePanel` pour comparaison A/B → bascule défaut `true` une fois V1
  validé.

## Hors périmètre (YAGNI)

- A* sur grille : non implémenté en V1/V2 ; reste un fallback documenté,
  activé seulement si les golden metrics prouvent un cas non couvert par
  les routes candidates.
- Recalcul du routage par frame : non — snapshot mid-segment suffit, PAI
  absorbe le résiduel.
- Routage des attaquants : hors périmètre (D.4 = défensif uniquement).
- Routage des poseurs et des défenseurs en contact d'écran : exclu par
  construction (moteur d'écran, Règle 1bis).

## Fichiers touchés

- **Nouveau** : `src/lib/logic/defensiveRoute.ts` + tests.
- **V1** : `src/lib/logic/playback/frameResolver.ts` (bloc interpolation
  défenseurs).
- **V2** : `src/lib/logic/defense/speedConstraint.ts`
  (`computeEffectiveDefensePositions`).
- `src/lib/types/index.ts` : champ `defensiveRouting?: boolean`.
- `src/components/DefensePanel.tsx` : toggle A/B.
- `src/lib/logic/playback/sceneSnapshot.ts` / snapshots J.6 : régénération.
