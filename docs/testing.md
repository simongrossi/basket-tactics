# Tests

## Stack

[Vitest](https://vitest.dev/) en environnement Node, sans setup React (la logique testée est pure). Les chemins `@/*` sont résolus via `resolve.tsconfigPaths: true` (support natif Vitest 4).

## Lancer les tests

```bash
npm test           # run unique (CI)
npm run test:watch # mode watch local
```

## Structure

```
src/lib/logic/
├── engine.ts
├── screens.ts
├── metrics.ts
└── __tests__/
    ├── engine.test.ts
    ├── screens.test.ts
    └── metrics.test.ts
```

Les tests vivent à côté du code testé sous `__tests__/`. Le pattern d'inclusion `vitest.config.ts` est `src/**/__tests__/**/*.test.ts`.

## Couverture actuelle

48 tests sur 4 modules de la logique défensive.

### `engine.test.ts`
- `getMatchupsAt` : matchups de base, application d'un switch, cumul de plusieurs switches sur étapes successives, immuabilité de `baseMatchups`.
- `computeDefenseTargets` (man) : 5 défenseurs renvoyés, `isCarrierDefender` correct, `helpFactor=0` et `onScreen=false` au setup, position du carrier defender entre porteur et panier, écriture de switch dans `state.steps[i].switches` quand `mutateStepForSwitch=true` + règle=`switch`, **non**-mutation quand `mutateStepForSwitch=false`.
- `computeDefenseTargets` (zone) : matchups dérivés du tracking, `helpFactor=0` toujours, pas d'écran appliqué.
- `effectiveDefensePositions` : pas de lateness à l'étape 0 (setup), lateness aux étapes >0 quand maxSpeed est trop bas, respect strict des `defenseOverrides`.
- `effectiveDefensePositions — closeout dynamique` : pas de closeout à l'étape 0, pas de closeout si `ballCarrier` n'a pas changé, `closingOut=true` sur le seul défenseur du nouveau porteur quand le ballon change de mains, le bump ×1.4 réduit la lateness (la distance parcourue dépasse `defenseMaxSpeed`), pas de closeout en zone.

### `screens.test.ts`
- `detectScreen` : null si aucun défenseur du porteur, détection nominale (poseur proche du carrierDef et du porteur), null si aucun candidat dans `screenRadius`, null si poseur à >80px du porteur.
- `applySwitch` : échange D-O, immuabilité de l'argument.
- `applyScreenAdjustment` : pass-through pour les défenseurs non concernés, pass-through pour la règle `switch`, drop oriente bien le screenerDef vers le panier, comparaison `shallow` vs `deep` (deep recule plus).
- `detectScreen — forcedScreener` : force l'attaquant désigné même quand il est trop loin (auto-detection bypass), ignore le forcedScreener s'il vaut le porteur, retourne null si le forcedScreener n'a pas de défenseur dans les matchups.
- `detectOffBallScreens` : tableau vide en config initiale, détection d'un backscreen quand `dy < -20`.
- `applySwitchOffBall` : échange D-O entre cutterDef et screenerDef, autres défenseurs intacts.

### `metrics.test.ts`
- `computeMetrics` : couverture raquette (seuil strict <100px du panier), identification du `mostFreeAttacker`, comptage `lateCount`, agrégation `helpFactorTotal` arrondie, classification passes open/contested/blocked, comportement quand `off` est vide.

### `help.test.ts`
- Régression : sag baseline weak-side sans trigger reste actif (helpFactor > 0).
- Strong-side denial : pull vers la ligne de passe pour un défenseur proche du ballon, intensité décroissante avec la distance att↔ballon, désactivé au-delà de 250px, désactivé pour `priority='paint'`, désactivé quand un trigger est actif (l'aide prime), désactivé pour les défenseurs weak-side (qui restent sur leur sag baseline).

## Conventions

- **Fixtures via helpers** : `cloneState()` (deep clone de `makeInitialState()`) dans `engine.test.ts`, `carrierAt()`/`defAt()` dans `screens.test.ts`, `makeDef()` dans `metrics.test.ts`. Permet d'ajouter un test sans recopier toutes les positions.
- **Pas d'I/O, pas de DOM** : les modules testés sont purs ; aucun mock nécessaire.
- **Coordonnées** : les fixtures respectent les positions canoniques de `src/lib/data/initial.ts` et les seuils de détection (`screenRadius=35`, distance porteur<80) pour rester proches du domaine réel.

## À ajouter

- `triggers.detectTriggers` (drive movement, post-up stationnaire)
- `zoneDefense.pointInPolygon` + `mapAttackersToZones` (cas limites de polygones)
- `geometry` (trivial mais utile en garde-fou)
- `help.computeHelpTarget` (sag baseline, priorités paint/man/passlane)
