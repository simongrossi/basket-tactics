# Logique défensive

Comment le moteur calcule les positions des défenseurs à partir de l'état.

## Vue d'ensemble

Le moteur est dans [`src/lib/logic/`](../src/lib/logic/). C'est du **TypeScript pur**, sans dépendance à React. Il prend un `AppState` et un index d'étape, retourne les positions calculées.

```
effectiveDefensePositions(state, stepIdx) : ComputedDefense
```

C'est le seul point d'entrée appelé par le rendu. Tout le reste est interne.

## Pipeline de calcul

```
effectiveDefensePositions(state, stepIdx)
  │
  ├── computeDefenseTargets(state, stepIdx, mutate=true)
  │     │
  │     ├── if (state.defenseSystem === 'zone'):
  │     │     return computeZoneDefenseTargets(...)
  │     │
  │     ├── matchups = getMatchupsAt(steps, stepIdx-1)
  │     ├── prevDefenderPositions = positions précédentes (récursion)
  │     ├── screen = detectScreen(off, carrier, matchups, prevDef, screenRadius)
  │     ├── if (screen && rule==='switch') matchups = applySwitch(matchups, screen)
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
Le défenseur du screener montre temporairement vers le porteur.

```
showT = clamp((carrier-screener-distance - radius) / radius, 0, 1)
showPos = (screener + carrier) / 2 - direction_panier * 6
target = lerp(showPos, baseTarget, showT)  // recover quand le porteur s'éloigne
```

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

## Détection de triggers

`detectTriggers(off, prevOff, ballCarrier, config)` :

- **drive** : actif si `prevOff` disponible ET delta de distance au panier > 25px (porteur s'approche) ET dans les 250px du panier
- **post** : actif si `y > HOOP.y + 45` ET (si `prevOff` dispo, mouvement < 30px → stationnaire)
- **paint** : actif si porteur à `inPaint(carrierPos)`

Si **un seul** trigger est activé ET la config user le permet, `triggers.any === true`.

## Défense de zone

Pipeline distinct (pas de matchups, pas de récursion sur les écrans) :

```
computeZoneTargets(off, carrier, layout, config, defenseDistance)
  │
  ├── zoneAttackers = mapAttackersToZones(off, layout)
  ├── pour chaque zone z:
  │     attackers = zoneAttackers[z]
  │     if (0 attaquants) → shift homePos vers ballon * ballPressure
  │     elif (1 attaquant) → man-style target sur lui
  │     elif (2+ attaquants) → garde le plus proche du panier
  │     if (carrier in attackers) → comportement carrier
  │
  └── applyZoneRotation():
        repère zones surchargées (2+) et zones vides
        rapproche le défenseur d'une zone vide vers l'attaquant secondaire
```

## Vitesse maximale et `late`

Dans `effectiveDefensePositions`:

```
maxSpeed = state.defenseSystem === 'zone' ? rotationSpeed : defenseMaxSpeed
pour chaque défenseur:
  d = distance(from, target)
  if (stepIdx === 0 OR d <= maxSpeed):
    out[dId] = target  (late: false)
  else:
    r = maxSpeed / d
    out[dId] = lerp(from, target, r)  (late: true)
```

Le défenseur en retard est rendu avec un contour rouge.

**Important** : à l'étape 0 (setup initial), la contrainte de vitesse ne s'applique PAS — les défenseurs sont à leur position idéale d'entrée. La lateness ne joue qu'entre les étapes suivantes (transitions). Sinon, repositionner un attaquant en mode édition donnerait l'illusion que le défenseur "ne défend plus" (en réalité il était en retard depuis `defenseInitial`).

## Points d'extension

Pour ajouter un nouveau comportement défensif :

1. **Nouveau `vsCarrier`** : ajouter un case dans `carrierDefenderTarget()` (manDefense.ts)
2. **Nouvelle stance off-ball** : étendre `OffBallStance` (types) + case dans `offBallStanceTarget()`
3. **Nouvelle règle d'écran** : étendre `ScreenRule` + case dans `applyScreenAdjustment()`
4. **Nouveau trigger** : étendre `DefenseTriggers` + condition dans `detectTriggers()`
5. **Nouveau type de zone** : étendre `ZoneType` + layout dans `zones.ts`

Tous les changements doivent passer le type-check (`tsc --noEmit`) — TypeScript force l'exhaustivité des switches.
