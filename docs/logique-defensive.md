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
        ├── if (d <= maxSpeed) défenseur arrive à la cible
        └── else défenseur en chemin, marqué late: true
```

## Récursion sur les étapes précédentes

`computeDefenseTargets(state, stepIdx)` appelle récursivement `computeDefenseTargets(state, stepIdx-1)` pour connaître les positions au début de l'étape.

C'est **inefficace** mais correct : O(n) par appel, O(n²) si on demande toutes les étapes. Pour 5–10 étapes c'est invisible. Memoisation possible si besoin.

Pourquoi récursif ? Parce que :
- la défense de l'étape N dépend de où elle était à l'étape N-1 (contrainte de vitesse)
- la défense de l'étape N-1 dépend de l'étape N-2, etc.
- pas de cache stocké pour éviter les invalidations

## Détection d'écran

`detectScreen()` cherche le poseur d'écran le plus probable :

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
  minClearance = 2 * PLAYER_RADIUS + 2  // 38px
  if d >= minClearance: return target
  return screener + (target - screener) * (minClearance / d)
```

Évite que les défenseurs traversent visuellement le poseur.

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
  if (d <= maxSpeed):
    out[dId] = target  (late: false)
  else:
    r = maxSpeed / d
    out[dId] = lerp(from, target, r)  (late: true)
```

Le défenseur en retard est rendu avec un contour rouge.

## Points d'extension

Pour ajouter un nouveau comportement défensif :

1. **Nouveau `vsCarrier`** : ajouter un case dans `carrierDefenderTarget()` (manDefense.ts)
2. **Nouvelle stance off-ball** : étendre `OffBallStance` (types) + case dans `offBallStanceTarget()`
3. **Nouvelle règle d'écran** : étendre `ScreenRule` + case dans `applyScreenAdjustment()`
4. **Nouveau trigger** : étendre `DefenseTriggers` + condition dans `detectTriggers()`
5. **Nouveau type de zone** : étendre `ZoneType` + layout dans `zones.ts`

Tous les changements doivent passer le type-check (`tsc --noEmit`) — TypeScript force l'exhaustivité des switches.
