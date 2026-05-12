# Logique défensive

Comment le moteur calcule les positions des défenseurs à partir de l'état.

## Vue d'ensemble

Le moteur est dans [`src/lib/logic/`](../src/lib/logic/). C'est du **TypeScript pur**, sans dépendance à React. Il prend un `AppState` et un index d'étape, retourne les positions calculées.

```
effectiveDefensePositions(state, stepIdx) : ComputedDefense
```

C'est le seul point d'entrée appelé par le rendu. Tout le reste est interne.

## Modules

| Fichier | Rôle |
|---------|------|
| `engine.ts` | Pipeline principal. `effectiveDefensePositions`, `computeDefenseTargets`, dispatch man/zone, switches/écrans. |
| `manDefense.ts` | Cibles individuelles : `manTarget`, `carrierDefenderTarget`, `offBallStanceTarget`, offset latéral selon orientation. |
| `zoneDefense.ts` | Cibles en zone : moteur ownership continu (claims gaussiens + parts normalisées par attaquant) + paramètres tactiques par type. |
| `help.ts` | Calcul de l'aide weak-side / strong-side denial / sag. |
| `screens.ts` | Détection écrans porteur (`detectScreen`) et non-porteur (`detectOffBallScreens`). |
| `triggers.ts` | Conditions qui activent l'aide (drive, post, paint, trap). |
| `trap.ts` | Choix du défenseur qui vient au piège quand un trap-zone est déclenché. |
| `geometry.ts` | Helpers `distance`, `clamp`, Bezier de contournement, `pathArcLength` (longueur d'arc), `proximityFriction` (friction de contact), solveur de collisions, makeCluster. |
| `metrics.ts` | Métriques défensives temps réel (gap, paint coverage, passes…). |
| `threats.ts` | **Phase A simulation** : score de menace par attaquant. Voir [simulation.md](simulation.md). |
| `offense.ts` | **Phase B simulation** : EV des actions offensives + meilleure action. |
| `simulator.ts` | **Phase C simulation** : Monte Carlo de possessions (PPP, eFG%). |
| `coachDiagnostics.ts` | Phrases coach automatiques (closeout long, low man tag, corner abandonné…) — vocabulaire métier basé sur l'état défensif. |
| `screenAction.ts` | **P0** — Détection du type d'action sur écran porteur (roll/pop/slip/short-roll/ghost/reject/snake/re-screen). |
| `pnrRotations.ts` | **P1** — Calcule les rotations PnR : low-man tag du roller, X-out, nail stunt. Override la cible des défenseurs concernés et tag `pnrRole`. |
| `zoneSituations.ts` | **P3** — Détection des situations zone (overload, short corner, high post, skip pass) qui modulent le moteur ownership. |
| `tacticalReads.ts` | **P5** — Lectures offensives auto : map la couverture défense → opportunité offensive en vocabulaire coach. |
| `orientation.ts` | **P6** — Calcul d'orientation et de facing pour défenseurs et attaquants. Voir [orientation-anti-teleport.md](orientation-anti-teleport.md). |
| `baselineDrive.ts` | **Étape 1** — Détection "attaque ligne de fond" (carrier en bande baseline ; phase driving/static ; verdict uncovered). Pur géométrique, alimente coachDiagnostics et zone (`baselineDriveCoverer`). |
| `threatResolution.ts` | **Étape 3** — Détection unifiée des menaces : `detectFreePathThreats` (couloir libre vers panier), `detectCuts` (coupes hors-ballon), `detectMatchupOrphans` (défenseurs perdus en aide). |
| `defense/rimProtectionLayer.ts` | **Étape 4.c** — Couche 1.5 man defense : applique `detectFreePathThreats` après baseTargets pour fermer les couloirs libres. |

## Pipeline de calcul

```
effectiveDefensePositions(state, stepIdx)
  │
  ├── computeDefenseTargets(state, stepIdx)
  │     │
  │     ├── if (state.defenseSystem === 'zone'):
  │     │     return computeZoneDefenseTargets(...)
  │     │
  │     ├── matchups = getMatchupsAt(steps, stepIdx-1)
  │     ├── prevDefenderPositions = positions précédentes (récursion)
  │     ├── screen = detectScreen(off, carrier, matchups, prevDef, screenRadius)
  │     ├── if (screen && rule==='switch') matchups = applySwitch(matchups, screen)
  │     │     et retourne detectedSwitch pour persistance explicite
  │     ├── triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers)
  │     │
  │     ├── pour chaque défenseur dId:
  │     │     ├── isCarrierDefender ?
  │     │     │     ├── oui → carrierDefenderTarget(rule.vsCarrier, ...)
  │     │     │     └── non:
  │     │     │           ├── stance = rule.offBallStance ?? 'sag'
  │     │     │           ├── if (stance !== 'sag'):
  │     │     │           │     target = offBallStanceTarget(att, ball, stance)
  │     │     │           └── else:
  │     │     │                 target = manTarget(att, distance)
  │     │     │                 target = computeHelpTarget(target, rule, triggers, ...)
  │     │     │
  │     │     └── if (screen) target = applyScreenAdjustment(target, screen, rule, ...)
  │     │
  │     └── pour chaque écran non-porteur:
  │           └── applyOffBallScreenAdjustment() ou applySwitchOffBall()
  │
  └── Pour chaque défenseur:
        ├── from = position au step précédent
        ├── d = distance(from, target)
        ├── closingOut = (transition + ballCarrier a changé + man + isCarrierDefender)
        ├── maxSpeed = closingOut ? base × 1.4 : base
        ├── if (d <= maxSpeed) défenseur arrive à la cible
        └── else défenseur en chemin, marqué late: true
```

## Strong-side denial automatique

Sans trigger actif, un défenseur **strong-side** (même côté du terrain que le ballon) reste par défaut à `manPos` — entre son homme et le panier. Or en basket réel, à une passe du ballon, on doit **denier la ligne de passe d'entrée**.

`computeHelpTarget` glisse le défenseur vers la ligne porteur ↔ attaquant quand toutes les conditions sont remplies :
- `triggers.any === false` (les triggers déclenchent l'aide, pas le denial)
- `ballSide !== 0` et `myAttSide !== 0` et `myAttSide === ballSide` (vraiment strong-side)
- `distance(att, carrier) < 250` (≈ "à une passe")
- `rule.priority !== 'paint'` (les protecteurs de raquette gardent leur zone)

La cible "denyAim" est sur le segment porteur ↔ attaquant à 35% du chemin depuis l'attaquant. L'intensité du pull (`denyFactor` jusqu'à 0.45) augmente avec la proximité du ballon : plus l'attaquant est près de la passe d'entrée, plus le denial est agressif.

Pour un denial **manuel total** (fronting, 3/4 deny), l'utilisateur garde le contrôle via `DefenderRule.offBallStance` (`'fronting'` ou `'deny-3q'`), traités séparément en amont dans le moteur.

## Stance off-ball `'stunt'` (fake d'aide)

Cinquième valeur de `OffBallStance`, à côté de `sag / behind / deny-3q / fronting`. Position calculée dans `offBallStanceTarget` avec un blend 0.4 entre la position "behind" (entre homme et panier) et la position "fronting" (entre homme et ballon). Moins agressif que `deny-3q` (0.75), plus offensif que `behind`. Le "recover" est naturel : à l'étape suivante, l'utilisateur remet la stance à `sag` ou `behind`, le défenseur revient sur son homme avec la lateness habituelle (modulée par `defenseMaxSpeed`).

## Trap en corner

Module dédié [`lib/logic/trap.ts`](../src/lib/logic/trap.ts). Quand `state.triggers.trap` est activé ET aucun écran n'est détecté ET le porteur est dans une zone de trappe, le défenseur le plus proche du porteur (hors carrierDef) est forcé en position de trap : sur la prolongation du vecteur carrierDef→porteur, à 28px au-delà du porteur. Cela ferme le côté opposé et crée la cage à deux.

Zones définies par bbox (TRAP_ZONES) :
- Coin gauche fond : `x ∈ [20, 130]`, `y ∈ [20, 200]`
- Coin droit fond : `x ∈ [470, 580]`, `y ∈ [20, 200]`
- Sideline gauche mi-terrain : `x ∈ [20, 110]`, `y ∈ [200, 460]`
- Sideline droite mi-terrain : `x ∈ [490, 580]`, `y ∈ [200, 460]`

`isInTrapZone(carrierPos, hoop?)` miroite la position autour de la ligne médiane si `hoop.y > 540` pour appliquer les zones du côté du panier de référence.

## Staggered screens (sélection de l'obstacle bloquant)

Pendant le playback et le scrubbing, `CourtView` utilise `curveAroundObstacle` pour faire contourner les défenseurs autour des poseurs d'écran. Avant : la première occurrence de la liste `screenerObstacles` était utilisée (break après match), ce qui pouvait être arbitraire avec plusieurs écrans simultanés.

`pickBlockingObstacle(start, end, obstacles)` (geometry.ts) sélectionne l'obstacle de **plus profonde pénétration** dans le segment du défenseur (`pen = radius - distance_to_line`).

**v2 — super-cluster** : `pickBlockingCluster(start, end, obstacles)` fusionne tous les obstacles bloquants en une seule masse (centroid des centres + rayon couvrant l'enveloppe). Le défenseur contourne alors les écrans en chaîne d'un seul mouvement large plutôt que de slalomer.

**v3 — weave réel** : `pickStaggeredPair(start, end, obstacles)` détecte deux écrans positionnés sur des **côtés opposés** du segment direct (cas en quinconce, type stagger qui force vraiment à zigzaguer). Quand la paire existe, `curveAroundStaggeredPair` calcule une **cubic Bezier** avec deux points de contrôle (un par obstacle, poussé perpendiculairement du côté opposé). Le résultat est une courbe en S qui passe à droite de A puis à gauche de B (ou inversement). Sinon (un seul écran, ou tous du même côté) on retombe sur le super-cluster v2. CourtView priorise le weave dans `playFrame` et `scrubFrame`.

## Inversion du panier de référence (`attackingDirection`)

`state.attackingDirection: 'up' | 'down'` (default `'up'` = compatibilité avec l'historique). Le helper `getDefenseHoop(state)` retourne `HOOP` ou `HOOP_OPPOSITE` selon la direction.

Toutes les fonctions pures qui utilisaient `HOOP` en constante prennent maintenant un paramètre optionnel `hoop?: Point` (default = `HOOP`) :
- `manTarget`, `carrierDefenderTarget`, `offBallStanceTarget` (manDefense.ts)
- `computeHelpTarget` (help.ts) — paint priority et sag baseline adaptés via `intoCourtY = hoop.y > 540 ? -1 : 1`
- `applyScreenAdjustment` (screens.ts) — direction du drop relative au panier
- `detectTriggers` (triggers.ts) — détection drive/post/paint via `yIntoCourt = (carrier.y - hoop.y) * intoCourtSign`
- `computeMetrics` (metrics.ts) — paint coverage via le panier paramétré
- `isInTrapZone` (trap.ts), `inPaint` / `distHoop` (geometry.ts) — miroir autour de y=540 si bottom

`engine.computeDefenseTargets` extrait `hoop` une fois par étape et le thread à toutes les fonctions appelées. Le bouton "↻ sens d'attaque" dans le panneau défense est gated sur `fullCourt` (l'inversion n'a de sens que sur le terrain entier).

**v2 — zone defense directionnelle** : `computeZoneTargets` accepte `hoop` et le propage à `manTarget` / `carrierDefenderTarget` ainsi qu'aux sortings internes (zone surchargée la plus proche du panier, attaquant primaire le plus proche du panier). `mirrorZoneLayout(layout)` (data/zones.ts) miroite polygones et homePos autour de y=540, appliqué quand `attackingDirection='down'`. Le rendu (`ZoneOverlay` dans CourtView et StepThumbnail) utilise le layout miroité pour rester cohérent avec les positions défensives.

**Limite v2** : le rendu visuel ne distingue pas encore le panier "actif" (visé par l'attaque) du panier "protégé" (côté défense). Les deux paniers se ressemblent.

## Closeout dynamique

Quand le ballon change de mains entre l'étape N-1 et N, le défenseur du **nouveau** porteur reçoit un bump de vitesse `× CLOSEOUT_SPEED_FACTOR` (1.4) sur cette transition. Cela modélise l'urgence du closeout : sur une passe entrante, le défenseur sait que son homme va recevoir et accélère pour fermer la distance avant le tir/drive.

Conditions cumulées pour qu'un closeout soit appliqué :
- `stepIdx > 0` (pas au setup)
- `state.defenseSystem === 'man'` (la zone a sa propre logique de rotation)
- `steps[stepIdx-1].ballCarrier !== steps[stepIdx].ballCarrier`
- `targets[dId].isCarrierDefender === true` (uniquement le défenseur du nouveau porteur)

Le flag `closingOut: true` est exposé dans `ComputedDefender`, ce qui permet au composant `Player` d'afficher un anneau orange autour du défenseur concerné. Hors-scope v1 : modélisation de l'over-closeout (l'attaquant qui drive sur un défenseur arrivé trop vite) — sera attaqué quand on aura un trigger de drive consolidé sur l'étape.

## Récursion sur les étapes précédentes

`computeDefenseTargets(state, stepIdx)` appelle récursivement `computeDefenseTargets(state, stepIdx-1)` pour connaître les positions au début de l'étape.

C'est **inefficace** mais correct : O(n) par appel, O(n²) si on demande toutes les étapes. Pour 5–10 étapes c'est invisible. Memoisation possible si besoin.

Pourquoi récursif ? Parce que :
- la défense de l'étape N dépend de où elle était à l'étape N-1 (contrainte de vitesse)
- la défense de l'étape N-1 dépend de l'étape N-2, etc.
- pas de cache stocké pour éviter les invalidations

## Détection d'écran

`detectScreen()` cherche le poseur d'écran le plus probable :

> **Override utilisateur** : si `Step.forcedScreener` est posé (clic-droit sur un attaquant → "forcer comme poseur d'écran"), `detectScreen` saute toute la logique de proximité ci-dessous et utilise directement l'attaquant désigné comme poseur. Les checks `screenRadius` et `dToCarrier > 80` sont ignorés. Garde-fous restants : le forcedScreener doit exister dans `off`, doit être différent du porteur, et doit avoir un défenseur dans `matchups` — sinon retour à l'auto-detection ou `null`.

```
pour chaque attaquant non-porteur p:
  d_to_carrierDef = distance(p, position_du_defenseur_du_porteur)
  d_to_carrier = distance(p, porteur)
  si d_to_carrierDef > screenRadius → skip
  si d_to_carrier > 80 → skip
  score = d_to_carrierDef + 0.5 * d_to_carrier
  garde le plus petit score
```

Le score favorise un poseur **proche du défenseur du porteur** ET **proche du porteur** — c'est-à-dire bien positionné pour faire obstacle.

## Application d'une règle d'écran

`applyScreenAdjustment()` modifie la position cible selon la règle :

### `over`
Le défenseur du porteur est poussé du côté du porteur, perpendiculairement à l'axe screener-panier.

```
amplitude = 14 + screenTightness * 18  // 14–32 px
target += perp * amplitude * sideOfCarrier
target = pushOutOfScreener(target)
```

`screenTightness` augmente quand le défenseur est très près du screener.

### `under`
Le défenseur passe sous le screener vers le panier.

```
target += direction_panier * 36
target = pushOutOfScreener(target)
```

### `hedge`

**Défenseur du poseur (`isScreenerDef`)** — montre temporairement vers le porteur :

```
showT = clamp((carrier-screener-distance - radius) / radius, 0, 1)
showPos = (screener + carrier) / 2 - direction_panier * 6
target = lerp(showPos, baseTarget, showT)  // recover quand le porteur s'éloigne
```

**Défenseur du porteur (`isCarrierDef`)** — passe **over the top** de l'écran en restant tight sur le porteur (le couple D1/D5 ferme à la fois la pénétration et la rejection ; D1 doit pouvoir recover quand D5 rentre) :

```
tightness = 1 - min(distance(screener, baseTarget), screenRadius) / screenRadius
amplitude = 8 + tightness * 8                         // 8–16 px (plus modéré qu'un 'over' pur)
target += perp * amplitude * sideOfCarrier
target = pushOutOfScreener(target, screener)
```

> Avant le commit `feat(screens): hedge — D1 passe over the top`, la règle `'hedge'` ne modifiait QUE la position de `screenerDef`. Le défenseur du porteur restait à sa position de base, donnant l'impression que la défense ne réagissait pas du tout à un écran posé en lecture.

### `drop`
Le défenseur du screener reste en couverture derrière le screener.

```
depth = shallow:18 | medium:35 | deep:55
target = screener + direction_panier * depth
```

### `switch`
Avant le calcul, les matchups sont mutés : `applySwitch(matchups, screen)`. Pas d'ajustement géométrique, juste un swap des hommes.

### `blitz`
Les deux défenseurs forment un V autour du porteur, à 45° de chaque côté.

```
direction = porteur - screener
target = porteur - dir * 14 + perp * 18 * (carrierDef ? 1 : -1)
```

## Suivi temps-réel des défenseurs en lecture (`followDefendersAtFrame`)

`effectiveDefensePositions(state, stepIdx)` calcule **une position par étape**. En lecture (playback ou scrubbing), CourtView interpolait linéairement entre `defA[id]` et `defB[id]` pour produire la frame intermédiaire. **Problème** : quand l'attaquant fait une trajectoire courbe (wave dribble, V-cut, polyline freehand), son défenseur prenait la **corde** de l'arc — il coupait au plus court pendant que son homme tournait, et lâchait son marquage le temps du segment.

Solution : à chaque frame, **réécrire la position de marquage** des défenseurs en marquage individuel à partir de la position courante interpolée de leur attaquant.

```
followDefendersAtFrame(defPos, off, ballCarrier, state, idxA, idxB):
  pour chaque défenseur dId :
    si defenseOverrides[dId] sur idxA OU idxB → skip (placement manuel prime)
    sinon si isCarrierDefender :
      target = carrierDefenderTarget(rule.vsCarrier, off[ballCarrier], dist, hoop)
    sinon (off-ball) :
      target = stance ? offBallStanceTarget(matchedAtt, ball, dist, stance, hoop)
                      : manTarget(matchedAtt, dist, hoop)
    slot.x = round(target.x); slot.y = round(target.y)
```

| Champ écrasé | Champ préservé |
|---|---|
| `slot.x`, `slot.y` (position de marquage de base) | `helpFactor`, `helpAim`, `closingOut`, `denying`, `isCarrierDefender`, `matchedTo`, `pnrRole` (calculés aux étapes A/B et interpolés) |

Appelée dans `CourtView.tsx` (playFrame ligne ~308 et scrubFrame ligne ~516) **avant** `resolvePlayerCollisions` et `recomputeDefenseFrameOrientations` — l'ordre garantit que :
1. La cible "follow" est posée
2. Les collisions résolues sur les nouvelles positions
3. Le triangle d'orientation est recalculé depuis la position finale

### Pourquoi `defenseOverrides` est respecté

Quand l'utilisateur drag un défenseur sur une étape, sa position est imposée via `defenseOverrides[stepIdx][dId]`. `effectiveDefensePositions` lit cet override en priorité. Pour rester cohérent, `followDefendersAtFrame` **skip ce défenseur** si un override est posé sur l'étape A ou B du segment courant — l'interpolation linéaire entre override et l'autre extrémité reste active. Le placement manuel a ainsi toujours préséance sur le follow auto.

### Approximation ball ≈ carrier

`offBallStanceTarget` consomme une position de ballon (utilisée par `fronting`, `deny-3q`, `stunt`). Pendant la lecture, on passe `off[ballCarrier]` comme position du ballon — approximation acceptable hors passe en vol, où ces stances ne sont pas critiques visuellement (la passe est rectiligne et courte). Pas de visual artefact constaté.

## Garde anti-superposition (`pushOutOfScreener`)

Après chaque ajustement, on s'assure que la cible n'est pas à l'intérieur du cercle du poseur d'écran :

```
function pushOutOfScreener(target, screener):
  d = distance(target, screener)
  minClearance = 2 * PLAYER_RADIUS + 2  // 34px (avec PLAYER_RADIUS = 16)
  if d >= minClearance: return target
  return screener + (target - screener) * (minClearance / d)
```

Évite que les défenseurs traversent visuellement le poseur.

## Contournement pendant l'animation (`curveAroundObstacle` + clusters)

Pour les frames d'animation (playback ET scrubbing), le défenseur ne se contente pas d'une interpolation linéaire entre `defA[id]` et `defB[id]`. Si le segment direct passe à travers le cercle d'un obstacle, on bend la trajectoire en **Bezier quadratique** avec easing au sommet :

```
curveAroundObstacle(start, end, obstacle, radius, t):
  proj = projection de obstacle sur le segment start→end
  si projection hors segment OU distance(obstacle, ligne) >= radius:
    return interpolation linéaire
  perp = vecteur perpendiculaire au segment
  side = signe(croix(obstacle - start, perp))
  // Amplitude PROPORTIONNELLE à la pénétration : un frôlement
  // produit une mini courbe, une traversée profonde une grande.
  penetration = radius - distance(obstacle, ligne)
  peak = penetration + 6
  ctrl = milieu(start, end) + perp * 2 * peak * (-side)
  te = easeSlowAtApex(t)  // ralentit au sommet pour éviter l'effet "snap"
  return (1-te)² * start + 2(1-te)te * ctrl + te² * end
```

### Stabilisation de l'obstacle pendant le segment

L'obstacle (poseur d'écran) bouge entre `idxA` et `idxB` puisqu'il est interpolé. Si on utilise sa position COURANTE (à `t` donné) pour calculer la courbe, la géométrie change frame par frame → quand le segment direct passe juste à la limite du cercle, on alterne entre courbe et ligne droite → effet de clignotement.

Fix : on utilise la position **midpoint** entre A et B comme obstacle stable pour TOUTE la durée du segment. La courbe est figée pour le segment, plus de flicker.

Le côté de contournement est choisi automatiquement (opposé à l'obstacle par rapport au segment).

### Clusters (poseur + son défenseur)

Le poseur d'écran et son propre défenseur sont quasi-collés sur l'action. Pour éviter deux courbes successives (et l'effet "téléportation" entre elles), on les regroupe en **cluster** via `makeCluster` :

```
makeCluster(core, others, linkDist, baseRadius):
  members = core + others à moins de linkDist du core
  center = barycentre(members)
  radius = max(distance(center, member)) + baseRadius
  return { center, radius }
```

Avec `linkDist = 4 * PLAYER_RADIUS` (64px) : si le défenseur du poseur est à moins de 64px du poseur, ils ne forment qu'une seule masse à contourner d'un coup. La courbe est plus large mais lisse, le défenseur ne snap plus entre deux courbes.

### Easing au sommet

`easeSlowAtApex(t, a=0.3)` : `t + a · sin(2πt) / (2π)`. La dérivée vaut `1 + a` aux extrémités et `1 − a` au milieu — visuellement, le défenseur "négocie" l'écran (ralentit en plein contournement) au lieu de filer comme une fusée.

### Solveur de collisions strict

Toujours appliqué après le contournement Bezier : voir section suivante.

## Solveur de collisions strict (`resolvePlayerCollisions`)

Appliqué partout (engine statique, playback tick, scrubFrame, vignettes PDF) : itère jusqu'à 8 fois la résolution.

```
pour iter de 1 à 8:
  anyMoved = false
  pour chaque défenseur D:
    obstacles = (tous attaquants sauf D.matchedTo) + (tous autres défenseurs)
    nouveau = pushOutOfMany(D.pos, obstacles, 2 * PLAYER_RADIUS + 2)
    si déplacement > 0.5px : D.pos = nouveau, anyMoved = true
  si !anyMoved : stop
```

Garantie : aucun défenseur ne reste à moins de `2 * PLAYER_RADIUS + 2` (= 34px avec `PLAYER_RADIUS=16`) d'un autre joueur, sauf de son `matchedTo` (la proximité voulue avec le marqué).

L'exemption du `matchedTo` permet à `vsCarrier=coller` ou `offBallStance=fronting` de fonctionner — le défenseur peut être tout proche de son homme sans que le solveur ne l'écarte.

## Aide (help)

`computeHelpTarget(manPos, rule, triggers, carrier, attacker, side, allOff)` retourne :
- soit `manPos` (pas d'aide)
- soit un point biaisé vers la priorité (paint / passlane / man) selon `helpPct`

### Sag baseline (toujours actif)

Si `triggers.any === false` mais `helpPct > 0` et défenseur weak-side :
- sagFactor = `helpPct / 100 * 0.5`
- aim = midpoint(attaquant, panier) biaisé vers le ballon, sous la ligne de la passe
- target = lerp(manPos, aim, sagFactor)

### Aide active (avec triggers)

```
sideFactor = (myAttSide !== ballSide) ? 1 : 0.35  // weak-side aide plus
helpFactor = (helpPct / 100) * sideFactor
aim = selon priority:
  paint    → bloc bas le plus chargé OU centre raquette
  passlane → midpoint(attaquant, porteur) biaisé 30% vers le porteur
  man      → manPos (no help)
target = lerp(manPos, aim, helpFactor)
```

## Triggers — comportement détaillé

Trois conditions activent l'aide globale (par-dessus le sag baseline) :

- **`drive`** :
  - Étape > 0 avec prev step : delta distance au panier > 25px ET dans 250px du panier
  - Étape 0 (pas de prev) : carrier dans 250px du panier (zone de menace, suffisant pour anticiper)
- **`post`** : porteur en poste bas, lateral 80–160px du panier, profondeur 45–145px, déplacement <30px
- **`paint`** : carrier DANS la raquette OU à <80px du panier (couvre les drives qui finissent juste hors raquette, runner, floater)
- **`trap`** : carrier dans une zone de trappe (coins fond + sidelines mi-terrain) — déclenche le trap auto

Quand au moins un trigger est actif, le `helpFactor` de chaque défenseur est calculé selon `(helpPct/100) × sideFactor` et le mouvement vise la cible définie par `priority`. Le résultat est exposé sur `ComputedDefender.helpTriggered = true`, ce qui permet à HelpLines de rendre le trait plus marqué (violet vif `#7c3aed`, dasharray `6 3`, opacité 0.9) versus le sag baseline passif (violet pâle, fin, opacité 0.55).

## Priority `man` avec léger biais paint

Avant : priority='man' → `aim = manPos` → aucun mouvement même avec helpPct=100%, ce qui était contre-intuitif. Maintenant : `aim = manPos + (hoop - manPos) × 0.3` → le défenseur descend 30% du chemin vers le panier quand le helpFactor est plein. Permet à un coach d'avoir tout le panier qui aide même sur priority=man.

## Détection de triggers (legacy)

`detectTriggers(off, prevOff, ballCarrier, config)` :

- **drive** : actif si `prevOff` disponible ET delta de distance au panier > 25px (porteur s'approche) ET dans les 250px du panier
- **post** : actif si `y > HOOP.y + 45` ET (si `prevOff` dispo, mouvement < 30px → stationnaire)
- **paint** : actif si porteur à `inPaint(carrierPos)`

Si **un seul** trigger est activé ET la config user le permet, `triggers.any === true`.

## Défense de zone — moteur ownership continu

Pipeline 100% continu, **sans seuil binaire** (plus de `pointInPolygon` qui flippe la priorité, plus de hand-off threshold, plus de `applyZoneRotation` qui réécrit la cible). Trois étapes :

```
computeZoneTargets(off, carrier, layout, config, defenseDistance)
  │
  ├── tactic = TACTICS[config.type] ?? DEFAULT_TACTIC
  │     (paramètres par type : zone-2-3, zone-3-2, zone-1-3-1, zone-2-1-2, zone-matchup)
  │
  ├── pour chaque zone, homeShifted = ballSideShifted(homePos, ballPos, tactic.ballSideHelp)
  │     (asymétrique : weak-side glisse 100%, strong-side 30%, central 60%, ±80px max)
  │
  ├── Étape 1 — claims gaussiens
  │     pour chaque (défenseur D, attaquant A):
  │       proximity = exp(-(distance(A, homeShifted_D) / reach)²)
  │       claim(D, A) = proximity × naturalBonus(D, A) × carrierBonus(A)
  │
  ├── Étape 2 — ownership normalisée
  │     pour chaque attaquant A:
  │       ownership(D, A) = claim(D, A) / Σ_D' claim(D', A)
  │     (somme à 1 sur les défenseurs ; epsilon=1e-6 stabilise quand A est isolé)
  │
  └── Étape 3 — primary + engagement = part d'ownership
        pour chaque défenseur D:
          primary(D) = argmax_A ownership(D, A)
          engagement = ownership(D, primary(D))   ∈ [0, 1]
          mode (auto/agressif/passif/trap) module engagement
          tracked = manTarget ou carrierDefenderTarget selon le rôle
          position = lerp(homeShifted, tracked, engagement)
```

### Pourquoi c'est continu

- Quand un attaquant traverse une bordure de polygone, sa proximité aux homePos varie de quelques pixels → claims des défenseurs varient continûment → ownership glisse → engagement n'a pas de saut.
- 50/50 contesté donne naturellement engagement = 0.5 → défenseur reste à mi-chemin (pas de téléportation).
- Hand-off émerge tout seul : quand A se rapproche de D₂ et s'éloigne de D₁, l'ownership de A bascule progressivement de D₁ vers D₂. Pas de seuil dur.
- Surcharge gérée par compétition d'ownership : si 2 attaquants partagent la même zone, les défenseurs voisins se distribuent. Pas besoin d'`applyZoneRotation`.

### Paramètres tactiques par type ([zoneDefense.ts:99-147](../src/lib/logic/zoneDefense.ts))

| Type | naturalBonus | carrierBonus | ballSideHelp | reachMult |
|------|--------------|--------------|--------------|-----------|
| zone-2-3 | 1.2 | 1.5 | 0.5 | 1.0 |
| zone-3-2 | 1.3 | 1.6 | 0.35 | 0.95 |
| zone-1-3-1 | 1.15 | 1.4 | 0.6 | 1.05 |
| zone-2-1-2 | 1.2 | 1.5 | 0.5 | 1.0 |
| zone-matchup | 2.0 | 1.3 | 0.25 | 1.0 |

- **`naturalBonus`** : multiplicateur de claim quand `assignedTo[D] === baseMatchups[A]` (ex. D3↔O3). Match-up zone très haut → comportement man-like.
- **`carrierBonus`** : multiplicateur quand `A === ballCarrier`. 3-2 (1.6) pressente plus que match-up (1.3).
- **`ballSideHelp`** : amplitude du shift `homePos.x → ballPos.x` côté faible. 1-3-1 (0.6) sage beaucoup, match-up (0.25) garde la discipline.
- **`reachMult`** : multiplicateur du rayon gaussien (default 200px). 3-2 (0.95) plus serré, 1-3-1 (1.05) plus élastique.

### Bascule individuelle ↔ zone

`updateZoneConfig` (useAppState.ts) NE force PLUS d'overrides au changement de type. Comportement : recalcule `defenseInitial` aux nouveaux homePos, supprime tous les overrides existants, laisse le moteur calculer dynamiquement. Sinon les défenseurs étaient figés au homePos sur l'étape active, désactivant le tracking.

## Réflexes défensifs avancés (Étapes 2-4)

Au-dessus du moteur ownership de base, plusieurs **mécaniques de désignation** identifient des situations basket précises et désignent un défenseur "responsable", à qui on applique :
1. Un **boost de claim** sur l'attaquant ciblé (concentré sur lui plutôt que partagé entre les 5 défenseurs, sinon l'ownership se dilue et personne ne s'engage vraiment)
2. Un **bias homePos** vers une position structurelle adaptée à la situation
3. Un **seuil d'engagement abaissé** (0.08 au lieu de 0.15) pour qu'il s'engage même avec une ownership partagée

Toutes ces mécaniques vivent dans [`zoneDefense.ts`](../src/lib/logic/zoneDefense.ts) et sont calculées **avant** la boucle de claims, dans cet ordre (priorité décroissante quand plusieurs s'appliquent) :

| Ordre | Désignation | Source | Module |
|-------|-------------|--------|--------|
| 1 | `designatedCoverer` (high-post / short-corner isolé) | `findCriticalZoneAttackers` + détection isolement | `zoneSituations.ts` |
| 2 | `baselineDriveCoverer` (porteur en attaque ligne de fond) | `detectBaselineDriveFromPositions` | `baselineDrive.ts` |
| 3 | `ballPressureCoverer` (défenseur structurel responsable du porteur) | calcul interne (front/back row + côté ballon) | `zoneDefense.ts` |
| 4 | `rimProtectorByThreat` (free-path vers panier sans couvreur) | `detectFreePathThreats` | `threatResolution.ts` |
| 5 | `passDenierByReceiver` (ligne de passe ouverte vers un coéquipier) | `detectOpenPassThreats` | `threatResolution.ts` |

Les défenseurs déjà désignés à un niveau supérieur sont **exclus** des niveaux suivants (passés via `unavailable: Set<DefenderId>`), évitant qu'un même défenseur cumule plusieurs missions.

### Sliders de configuration

Trois sliders dans `Configuration zone` modulent ces mécaniques (`ZoneConfig`) :

| Slider | Champ | Effet |
|--------|-------|-------|
| `pression bal.` | `ballPressure` 0-100 | Module `ballPressureCoverer` (boost ×1+1.5×factor) + bias home (30%-60% vers le ballon) |
| `aide raquette` | `paintCoverage` 0-100 | Module `designatedCoverer` (boost ×4 à factor=1) + `baselineDriveCoverer` |
| `protect. panier` | `rimProtection` 0-100 | Module `rimProtectorByThreat` (boost ×3+urgency, bias toward intercept point) |
| `deny passes` | `passDenial` 0-100 | Module `passDenierByReceiver` (boost ×1+2×urgency×factor, bias 50% vers mi-segment porteur→receveur) |

À 0 chaque slider désactive complètement la mécanique correspondante (zone passive). À 50 (défaut) comportement standard. À 100 mécanique amplifiée.

### High-post / short-corner isolé ([zoneDefense.ts:230-280](../src/lib/logic/zoneDefense.ts))

Un attaquant dans une **zone-tueuse** (high-post centré ou short-corner) sans coéquipier dans 80 px est marqué **isolé**.

- `criticalIds` = `findCriticalZoneAttackers(off, hoop)` (cf. `zoneSituations.ts`)
- `isolatedIds` = critical ∩ (aucun coéquipier dans 80 px)
- Pour chaque attaquant isolé, on désigne le défenseur dont le `homePos` est le plus proche
- En claim loop : `criticalMult = 4.0` pour le couvreur désigné, `1.2` pour les autres défenseurs (faible attraction sans diluer l'ownership). À factor=0 : tout neutre. À factor=1 : 4.0/1.2. À factor=2 : 7.0/1.4
- Pour le **high-post** spécifiquement, on bias aussi le `homePos` du couvreur de 40% vers l'attaquant (le pivot anchor à y=145 remonte vers le high-post à y=220 plutôt que d'y rester)

### Baseline drive ([baselineDrive.ts](../src/lib/logic/baselineDrive.ts))

Détection en **deux phases** d'un porteur attaquant la ligne de fond :
- `phase: 'driving'` quand mouvement net vers panier (Δ lateral > 15 ou Δ dHoop > 20 entre prev et current step)
- `phase: 'static'` quand porteur posté en zone baseline (`distToHoop < 180`) sans mouvement

Critères d'éligibilité :
- `verticalFromHoop < 80 px` (bande baseline)
- `lateral` ∈ [95, 260] px (entre paint edge et corner 3pt)

Verdict `uncovered` :
- Trouve le défenseur le plus proche du segment carrier→panier (perpendiculaire)
- Si `perpDist > 70 px` ou défenseur `late` → couloir non fermé → désigne ce défenseur comme `closer`

En claim loop : `baselineMult = 1+2*paintCoverageFactor` sur la claim du closer au porteur.

Diagnostics coach associés (4 cas) : `baseline-drive-open` (critical/warning selon profil), `baseline-drive-soft` (info, posté), `baseline-drive-late` (warning), `baseline-drive-closed` (good).

### Ball-pressure coverer ([zoneDefense.ts:286-330](../src/lib/logic/zoneDefense.ts))

LE défenseur structurellement responsable de presser le porteur. Sans cette désignation, le moteur ownership pur peut laisser le porteur seul (cas top-of-arc central : tous les guards à 191 px du porteur).

Heuristique :
- Ballon "haut" (vert > 100 px du panier) → candidats = front-row (homePos.y > médiane). Ballon "bas" → candidats = back-row.
- Filtre par côté : préfère les candidats du **même côté** que le ballon (la zone absorbe par la position, pas par matchup naturel)
- Choisit le plus proche latéralement parmi les candidats restants

En claim loop : `pressureMult = 1+1.5*ballPressureFactor` sur la claim au porteur, **empilé seulement** s'il n'est pas déjà `designatedCoverer` ou `baselineDriveCoverer`.

Bias homePos : 30%-60% vers le ballon (selon `ballPressureFactor`).

### Rim protection — "pas d'easy basket" ([threatResolution.ts](../src/lib/logic/threatResolution.ts))

Détection systématique des **couloirs libres vers le panier** :

```
detectFreePathThreats(off, hoop, defPositions, unavailable, prevOff?)
  │
  ├── pour chaque attaquant A à dHoop < 220 (statique) OU dHoop < 280 ET Δ dHoop > 20 (drive en cours):
  │     trouve le défenseur disponible le plus proche du segment A→panier
  │     si perpDist > 80 → menace détectée
  │
  └── pour chaque menace, désigne LE défenseur disponible le plus proche du PANIER
        (préserve la défense basket-side, pas du couloir lui-même)
```

**unavailable** est passé par zoneDefense pour exclure les défenseurs déjà engagés ailleurs (high-post, baseline) — sinon on désignerait un défenseur structurellement indisponible.

**urgency** ∈ [0, 1] : 1 quand A à dHoop=0, 0 à 280 px. Échelle linéaire incluant la bande étendue.

En claim loop : `rimMult = 1+3*urgency*rimProtectionFactor` sur la claim du couvreur à l'attaquant menaçant. Bias homePos : 40% × urgency × factor vers le point d'interception (mi-chemin attaquant→panier).

### Pass denial — fermeture des lignes de passe ([threatResolution.ts > detectOpenPassThreats](../src/lib/logic/threatResolution.ts))

Détection systématique des **lignes de passe ouvertes** depuis le porteur vers ses coéquipiers :

```
detectOpenPassThreats(off, carrier, hoop, defPositions, unavailable, matchups?)
  │
  ├── pour chaque attaquant A non-porteur, passLen > 80 px:
  │     trouve le défenseur disponible le plus proche du segment carrier→A
  │     si perpDist > 60 → passe ouverte
  │
  └── désignation :
        1. Préférer le défenseur naturel du receveur (baseMatchups) s'il est dispo
        2. Sinon, le plus proche du point d'interception, MAIS sous 220 px de son home
           (au-delà → pas réaliste, skip)
```

**Urgence** = 0.4 × proximité receveur↔panier + 0.6 × ouverture du couloir. Une passe vers un receveur proche du panier avec couloir grand ouvert est très urgente.

En claim loop : `passDenialMult = 1+2×urgency×passDenialFactor` sur la claim du couvreur au receveur. Bias homePos : 50% × urgency × factor vers le point d'interception (mi-segment carrier→receveur).

**Filtres** :
- Skip les receveurs déjà couverts par `designatedCoverer` ou `rimProtectorByThreat` (évite que deux défenseurs convergent sur le même attaquant pour des raisons différentes).
- L'`unavailable` set inclut tous les défenseurs déjà désignés ailleurs (high-post, baseline, ball-pressure, rim) — empêche un défenseur de cumuler deux missions.

Le bénéfice basket : sur une scène équilibrée, les défenseurs trackent activement leurs matchups via la pression sur les lignes de passe, au lieu de rester en formation passive.

### Détection de cuts ([threatResolution.ts > detectCuts](../src/lib/logic/threatResolution.ts))

Cuts hors-ballon (différents du baseline drive qui cible le porteur) :
- Attaquant non-porteur, dHoop courant < 250
- Δ dHoop > 25 entre prev et current step (mouvement net)
- Pas en train de poser un écran (aucun coéquipier dans 30 px)

Alimente le diagnostic coach `cut-backdoor` (warning si défenseur naturel à >80 px, info sinon).

### Weakside paint sag ([zoneDefense.ts:165-205](../src/lib/logic/zoneDefense.ts))

`ballSideShifted` étendu pour appliquer le principe basket "weakside help into paint" :
- **Strong-side** (même côté que ballon) : peu de shift X (×0.3), déjà près du ballon
- **Centre** : shift X modéré vers ballon (×0.6)
- **Weak-side** (opposé) :
  - Pull X ×0.8 vers l'**axe central** (x=300), pas seulement vers le ballon
  - Sag Y ×0.4 vers le panier
  - Cap ±80 px (X), ±60 px (Y)

En plus, en claim/engagement loop : si défenseur ET son primary sont tous deux côté faible (et le primary n'est pas le porteur), `engagement *= 0.5`. Le défenseur reste en aide raquette plutôt que de coller son matchup naturel à 5 m du ballon.

Effet mesuré (ballon wing droit) : D4 weakside passe de (179, 97) — 121 px de l'axe central — à (202, 115) — 98 px (à l'orée de la raquette).

### Recover boost ([zoneDefense.ts:600-625](../src/lib/logic/zoneDefense.ts))

Quand un défenseur n'a **aucun rôle d'aide actif** (pas critical/baseline/pressure/rim), sa claim sur son matchup naturel reçoit un boost ×1.15. Évite les défenseurs qui restent en aide errante après une rotation — ils reviennent activement sur leur homme.

### Diagnostic "matchup orphan" ([threatResolution.ts > detectMatchupOrphans](../src/lib/logic/threatResolution.ts))

Détecte les rotations imparfaites :
- Défenseur courant à >100 px de son `homePos` (déplacé en aide)
- ET son matchup naturel à >100 px de tout défenseur
- → orphelin, sévérité critical si shooter sinon warning

Le moteur ne corrige pas (limites speed constraint), mais le coach voit le trou via `LECTURE COACH`.

### Couche `rimProtectionLayer` en man defense ([defense/rimProtectionLayer.ts](../src/lib/logic/defense/rimProtectionLayer.ts))

Couche 1.5 du pipeline man-to-man (entre `baseTargets` et `pnrRotations`). Utilise `detectFreePathThreats` avec les positions COURANTES (post-baseTargets) plutôt que homePos.

Différences vs zone :
- Exclut le `carrierDef` (déjà sa mission sur le porteur)
- Skip le porteur lui-même (déjà géré)
- Bias = 50% × urgency vers point d'interception

En pratique, la défense individuelle gère la plupart des cas via les matchups (D3 suit O3 même en cut). Cette couche est un filet de sécurité pour les edge cases (défenseur perdu via écran, switch laissant un attaquant en transit).

## Vitesse maximale, `late`, physique du déplacement

Dans `effectiveDefensePositions`, le coût d'un déplacement n'est plus la distance euclidienne mais la **longueur d'arc effective** corrigée par la **friction de proximité**. Trois leviers cumulés :

### Lever C — Pré-relaxation de la cible

Avant tout calcul de vitesse, la cible idéale est repoussée hors des attaquants non-matchés (`pushOutOfMany` sur `nonMatchedAttackerPositions`, clearance `2 × PLAYER_RADIUS + 2`). Évite que la contrainte de vitesse compare une distance qui mène DANS un autre joueur.

### Lever A — Longueur d'arc autour des écrans

Si le segment from→to traverse un cluster d'écran, on remplace `d = distance(from, to)` par la longueur réelle de la trajectoire courbe Bezier que CourtView trace au scrub :

```
pathArcLength(from, to, blocking, samples=12):
  pour i=1..samples: somme distance entre points consécutifs sur la courbe
  return total
```

Le moteur construit les **mêmes screener clusters que CourtView** (poseur + son défenseur fusionnés via `makeCluster`, `linkDist=4×PLAYER_RADIUS`), filtre les candidats avec `pickBlockingCluster` pour que chaque défenseur ignore le cluster dont il fait partie. Conséquence : le défenseur du porteur en pick-and-roll **paie le détour**. Plus besoin de `dropDepth` pour modéliser le retard, c'est dans la mécanique.

### Lever B — Friction de proximité

```
proximityFriction(from, to, nearby, threshold=30, floor=0.6, samples=8):
  minDist = min sur i, j de distance(point_i_sur_segment, nearby_j)
  if minDist >= threshold: return 1
  return floor + (1 - floor) × (minDist / threshold)
```

`nearby` = tous les attaquants non-matchés + tous les autres défenseurs. Frôler quelqu'un à <30px coûte jusqu'à 40% de vitesse (floor 0.6). Modélise le contact "épaule" hors écran formel.

### Mise en équation

```
maxSpeed = (closingOut ? indivMax × closeoutBoost : indivMax)
effectiveMaxSpeed = maxSpeed × friction

pour chaque défenseur:
  to = pushOutOfMany(target, nonMatchedAttackers, ...)            // C
  blocking = pickBlockingCluster(from, to, screenerObstacles)
  pathLen = pathArcLength(from, to, blocking)                      // A
  friction = proximityFriction(from, to, allOtherPlayers)          // B
  if (stepIdx === 0 OR pathLen <= effectiveMaxSpeed):
    out[dId] = to (late: false)
  else:
    r = effectiveMaxSpeed / pathLen
    out[dId] = lerp(from, to, r) (late: true)
```

Le défenseur en retard reste interpolé linéairement le long de from→to (la courbe visuelle est tracée par CourtView au scrub indépendamment), avec contour rouge.

**Important** : à l'étape 0 (setup initial), la contrainte de vitesse ne s'applique PAS — les défenseurs sont à leur position idéale d'entrée. Sinon, repositionner un attaquant en mode édition donnerait l'illusion que le défenseur "ne défend plus" (en réalité il était en retard depuis `defenseInitial`).

À la fin du calcul, le solveur strict `resolvePlayerCollisions` repousse les défenseurs hors des autres joueurs (sauf matchedTo) — voir section dédiée plus bas.

## Profils joueurs offensifs (impact moteur)

Chaque attaquant porte un `OffensiveProfile` (`creator`, `shooter`, `slasher`, `rim-roller`, `stretch-big`, `non-shooter`) — voir [data-model.md](data-model.md#profils-joueurs-offensifs). Trois leviers du moteur sont modulés par le profil :

### 1. Qualité de tir — `threats.ts`

`profileShotMultiplier(profile, zone)` multiplie le `shotQuality` (qui sert au scoring de menace ET à l'EV des actions offensives). Bornes [0.55, 1.30] :

| Profil       | rim  | paint | mid  | three | deep |
|--------------|------|-------|------|-------|------|
| shooter      | 0.90 | 0.95  | 1.20 | 1.20  | 0.95 |
| stretch-big  | 0.95 | 1.00  | 1.05 | 1.15  | 1.00 |
| slasher      | 1.18 | 1.18  | 1.00 | 0.85  | 1.00 |
| rim-roller   | 1.30 | 1.10  | 0.85 | 0.65  | 0.85 |
| creator      | 1.00 | 1.00  | 1.05 | 1.00  | 1.00 |
| non-shooter  | 0.95 | 0.85  | 0.65 | 0.65  | 0.65 |

### 2. Coût de quitter — `help.ts`

`leaveAttackerCostMultiplier(profile)` modifie le helpFactor quand le défenseur de cet attaquant l'abandonne pour aider :
- shooter 0.55, stretch-big 0.65 → on aide moins fort (skip 3pts trop cher)
- creator 0.85, slasher 0.85 → légère retenue
- rim-roller 0.95 → quasi neutre
- non-shooter 1.30 → sag franc autorisé

Multiplie le sagFactor (baseline) ET le helpFactor (aide active). Le strong-side denial n'est pas modulé (c'est une décision sur la passe d'entrée, pas sur l'aide).

### 3. Closeout boost — `engine.ts`

`closeoutProfileBonus(profile)` multiplie le `closeoutBoost` (vitesse de fermeture sur le nouveau porteur) :
- shooter 1.15, stretch-big 1.10 → fermer vite, le 3pts est imminent
- creator/slasher 1.0 → neutre
- rim-roller 0.95, non-shooter 0.85 → relâcher (drive moins dangereux qu'un tir)

## Auto-diagnostics coach — `coachDiagnostics.ts`

Convertit l'état défensif calculé en phrases courtes de vocabulaire coach. Appelé dans `page.tsx` via `useMemo`, affiché dans le bandeau `<CoachDiagnostics />` sous la `MetricsBar`.

```
computeCoachDiagnostics(state, stepIdx) : CoachDiagnostic[]
```

Détections actuelles (tag stable + sévérité) :

| Tag                | Trigger                                                  | Sévérité       |
|--------------------|----------------------------------------------------------|----------------|
| `over-closeout`    | `overClosed === true` sur défenseur du porteur          | critical       |
| `closeout-long`    | `late + closingOut` sur porteur                          | warning/critical (si shooter) |
| `late`             | `late` simple                                            | warning        |
| `switch-mismatch`  | `switchedThisStep === true`                              | warning        |
| `low-man-tag`      | écran détecté + screener à <180px panier + low-man >130px du screener | critical |
| `low-man-tag-soft` | écran détecté + low-man entre 90-130px                  | warning        |
| `corner-open`      | corner faible + nearest def >180px                       | critical       |
| `corner-help`      | corner faible + nearest def 130-180px                    | warning/critical (si shooter) |
| `pass-open`        | threats.receivability=1 + score>0.42 (non-corner)        | warning/critical (>0.55) |
| `paint-no-help`    | porteur in paint + helpFactor total <0.6                 | critical       |
| `all-good`         | aucun problème détecté                                   | good           |

Les profils joueurs sont lus pour enrichir le message ("Closeout long sur O1 (créateur)") et **escalader la sévérité** quand un shooter/stretch-big est concerné (un corner faible avec un shooter devient critical au lieu de warning).

## Couche défensive scriptable

La défense standard (aide, écrans, zone…) est calculée en temps réel par le moteur. La couche scriptable y ajoute des **directives explicites** posées par le coach lors de la construction du scénario.

### Architecture

```
ScriptedAction[] (kind='defensive')
  │
  └── compileScenario (passe 2 — defensiveCompilation.ts)
        │
        ├── defensiveDefaults.ts : infère les params manquants selon le contexte
        │   (ex : trap sur PnR → defenders = [porteurDef, screenerDef])
        │
        └── Step.defensiveDirectives[] : DefensiveDirective par step concerné
              │
              └── engine.ts : applyDirective (si defenseScriptedDirectivesEnabled)
                    │
                    └── ajuste les positions cibles standard avant le moteur physique
```

1. Le compilateur de scénario (`compileScenario`) exécute une **passe 2** sur les actions défensives (`defensiveCompilation.ts`). Pour chaque `DefensiveScriptedAction`, il génère les `DefensiveDirective[]` correspondantes et les injecte dans les `Step.defensiveDirectives[]` des steps ciblés.
2. `defensiveDefaults.ts` infère les paramètres absents selon le contexte (ex. : un `trap` couplé à un PnR désigne automatiquement le défenseur du porteur et du screener).
3. À chaque frame, l'engine appelle `applyDirective` pour chaque directive active du step courant. `applyDirective` ajuste la position cible du ou des défenseurs concernés **avant** l'application du moteur physique (arc, friction, maxSpeed).

### Les 4 actions MVP

| Type | Comportement |
|------|-------------|
| `help-and-recover` | Un défenseur aide (phase `engage`) puis revient sur son homme (phase `release`). `helpStep` et `recoverStep` bornent les deux phases. |
| `pre-switch` | Échange anticipé entre deux défenseurs avant le croisement. Modifie `assignmentOverrides` sur les steps concernés. |
| `trap` | Deux défenseurs ferment le porteur (cage à deux). Override les cibles de `defenders` vers la position de piège. |
| `tag` | Un défenseur quitte son homme pour coller le roller/cutter ciblé (`target`). |

### Couplage action offensive / couverture libre

- **Couplée** (`parentActionId` défini) : la couverture s'applique sur les mêmes steps que l'action offensive parente. Pratique pour scripter "quand O5 pose un PnR, D4 vient trapper".
- **Libre** (`affectedSteps` requis) : la couverture n'est rattachée à aucune action offensive. Les indices de steps sont posés manuellement par le coach.

### Toggle global

`AppState.defenseScriptedDirectivesEnabled` (default `true`) permet de désactiver toutes les directives d'un coup. Géré par `useAppState.toggleScriptedDefense`. Utile pour comparer la couverture standard et la couverture scriptée sur le même scénario.

## Points d'extension

Pour ajouter un nouveau comportement défensif :

1. **Nouveau `vsCarrier`** : ajouter un case dans `carrierDefenderTarget()` (manDefense.ts)
2. **Nouvelle stance off-ball** : étendre `OffBallStance` (types) + case dans `offBallStanceTarget()`
3. **Nouvelle règle d'écran** : étendre `ScreenRule` + case dans `applyScreenAdjustment()`
4. **Nouveau trigger** : étendre `DefenseTriggers` + condition dans `detectTriggers()`
5. **Nouveau type de zone** : étendre `ZoneType` + layout dans `zones.ts` + entrée dans `TACTICS` (zoneDefense.ts) pour préciser naturalBonus, carrierBonus, ballSideHelp, reachMultiplier — sinon le moteur retombe sur `DEFAULT_TACTIC`

Tous les changements doivent passer le type-check (`tsc --noEmit`) — TypeScript force l'exhaustivité des switches.
