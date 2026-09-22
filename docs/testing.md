# Tests

## Stack

[Vitest](https://vitest.dev/) en environnement Node, sans setup React (la logique testée est pure). Les chemins `@/*` sont résolus via `resolve.tsconfigPaths: true` (support natif Vitest 4).

## Environnement jsdom + Web Storage

Quelques fichiers déclarent `// @vitest-environment jsdom` (persistance,
hooks UI). Sous **vitest 4 + jsdom 29**, `window.localStorage` n'est pas exposé
(le getter renvoie `undefined`, alors que jsdom 29 le supporte en standalone —
bug d'intégration ; Node 22+ a en plus un `localStorage` natif expérimental,
vide, qui parasite). Fix dans `vitest.setup.ts` (référencé par `setupFiles`) :
polyfill in-memory conforme à l'API Web Storage (classe `MemoryStorage`
instanciable + instances `localStorage`/`sessionStorage`), activé uniquement
quand le storage natif est absent/cassé. `environmentOptions.jsdom.url` fournit
aussi une origine non-opaque.

## Tests lourds (timeouts explicites)

- `movementSimulationAudit.test.ts` : audit brute-force frame-par-frame de
  26 actions × paires → ~130 s. Timeout porté à 240 s.
- `deterministicScrub.test.ts` : ~8,5 s seul mais sensible à la contention CPU
  quand l'audit tourne en parallèle → timeout 45 s.

## Lancer les tests

```bash
npm test           # run unique (CI)
npm run test:watch # mode watch local
```

## Structure

```
src/lib/
├── data/__tests__/
│   └── defensiveActionsCatalog.test.ts
├── state/__tests__/                 # transforms purs extraites de useAppState
│   ├── annotationTransforms.test.ts # 13 tests
│   ├── attackerTransforms.test.ts   # 5 tests
│   ├── coreTransforms.test.ts       # 4 tests
│   ├── defenseTransforms.test.ts    # 11 tests
│   ├── scenarioTransforms.test.ts   # 9 tests
│   ├── stepTransforms.test.ts       # 12 tests
│   └── zoneTransforms.test.ts       # 7 tests
└── logic/__tests__/
    ├── applyDirective.test.ts
    ├── coachDiagnostics.test.ts (via invariants)
    ├── defenseScriptedIntegration.test.ts
    ├── defensiveCompilation.test.ts
    ├── defensiveDefaults.test.ts
    ├── engine.test.ts
    ├── geometry.test.ts
    ├── help.test.ts
    ├── invariants.test.ts
    ├── manDefense.test.ts
    ├── metrics.test.ts
    ├── offense.test.ts
    ├── orientation.test.ts
    ├── screens.test.ts
    ├── scriptedActionMigration.test.ts
    ├── scriptedGenerators.test.ts
    ├── simulator.test.ts
    ├── threats.test.ts
    ├── trap.test.ts
    ├── zoneDefense.test.ts
    └── zoneSituations.test.ts
```

Les tests vivent à côté du code testé sous `__tests__/`. Le pattern d'inclusion `vitest.config.ts` est `src/**/__tests__/**/*.test.ts`.

## Couverture actuelle

Validation complète du **23 septembre 2026** : **2 648 tests dans 271
fichiers**, typage TypeScript et build de production réussis. La suite couvre
notamment la logique défensive, la simulation, les écrans, les zones, les
transformations d’état, les hooks et les composants React.

Les codes de partage ont leurs tests de format, limites, validation et
compatibilité dans `state/__tests__/situationCode.test.ts` et
`manualGestureCode.test.ts`. La capture/relecture manuelle est couverte par
`useManualRecording.test.tsx`, `useCourtFrame.recorded.test.tsx` et
`CourtView.recorded.test.tsx`, notamment les sauts conservés sans interpolation,
la lecture seule, les formats réduits et une capture maximale de 60 secondes.
La continuité au drag et le cas D5 en zone 2-1-2 ont des régressions dédiées.

Voir [CHANGELOG.md](../CHANGELOG.md) pour le détail des ajouts récents.

### `state/__tests__/*` — transforms purs

61 tests sur les 8 modules de transformations `AppState → AppState` extraits
de `useAppState` (cf. [refactoring-history.md § 2](refactoring-history.md#2-useappstatets--wrapper--libstatetransforms-967--510-loc)).
Couvrent : CRUD step, annotations (timing/quality/phase + clamp cross-step),
rules défense + profils + presets + zone↔man + overrides, attackers
(hand/orientation/profil), zones (overrides régionaux + resnap au changement
de type), scénarios (actions main + branches branch-aware), transversal
(tool, patch, playerCount, reset).

Aucun mock React nécessaire — chaque transform se teste comme
`stepTx.addStep(makeInitialState())`.

### `engine.test.ts`
- `getMatchupsAt` : matchups de base, application d'un switch, cumul de plusieurs switches sur étapes successives, immuabilité de `baseMatchups`.
- `computeDefenseTargets` (man) : 5 défenseurs renvoyés, `isCarrierDefender` correct, `helpFactor=0` et `onScreen=false` au setup, position du carrier defender entre porteur et panier, `detectedSwitch` retourné sans mutation, persistance explicite via `persistDetectedSwitchForStep`, et absence d'effet de bord dans `effectiveDefensePositions`.
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

### `trap.test.ts`
- `isInTrapZone` : détection des coins fond gauche/droit, exclusion du centre / haut de raquette / milieu de terrain.
- `pickTrapHelper` : choisit le défenseur non-porteur le plus proche, retourne null si aucun défenseur n'est sur le porteur.
- `trapTarget` : place le helper côté opposé au carrierDef, à <50px du porteur.

### `manDefense.test.ts`
- `offBallStanceTarget` stance `'stunt'` : entre l'homme et la ligne homme↔ballon (blend 0.4), moins agressif que `'fronting'`, fallback sur `manTarget` quand le ballon est absent.

### `geometry.test.ts`
- `pickBlockingObstacle` : retourne null sans obstacle bloquant ; retourne l'unique obstacle bloquant ; staggered screens : préfère l'obstacle de pénétration max ; ignore les obstacles hors segment ; gère le segment de longueur nulle.
- `pickBlockingCluster` : 1 obstacle = parité avec pickBlockingObstacle ; 2+ fusionnés en super-cluster (centroid + rayon couvrant) ; ignore les non-bloquants ; null si aucun bloqueur.
- `pickStaggeredPair` : null si <2 bloqueurs ou tous du même côté ; détecte une paire sur côtés opposés et la retourne ordonnée par projection le long du segment.
- `curveAroundStaggeredPair` : t=0/t=1 aux extrémités, courbe en S qui dévie du côté opposé à chaque obstacle (test sur la position près de chaque obstacle).
- `computeBallFrame` : porteur inchangé → suit avec offset (16, -16) ; en mouvement → interpolation linéaire ; passe → t=0/t=1 aux extrémités, mi-trajet plus haut (parabole), arc plus haut quand la distance est grande.

### Engine — attackingDirection
Régression que `attackingDirection='up'` (default) place les défenseurs entre attaquants et HOOP top, et que `attackingDirection='down'` (avec positions miroir en bas) les place entre attaquants et HOOP_OPPOSITE.

### `orientation.test.ts`
- `computeDefenderOrientation` : on-ball regarde le porteur, fronting/deny-3q regardent le ballon, sag = midpoint angulaire, `gazeLock` garde homme + porteur dans le cône quand c'est possible, `bodyOrientationMode` couvre corps dans/perpendiculaire à la ligne de passe, angle horaire depuis le nord (cas est=+90°), modulation `vsCarrier='topside'` (+30°), delta manuel ajouté et clampé à ±45°.
- `computeAttackerOrientation` : porteur→panier, passeur→receveur, coupeur→nextPos, poseur d'écran orienté perpendiculairement à la ligne vers le défenseur ciblé (différence ≈ 90° vs facing frontal), défaut→ballon.

### `invariants.test.ts` (régression sur playbooks)
Pour les 7 playbooks de la lib (PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy, Hammer) :
- aucun chevauchement aux étapes (att-att, def-def, def vs non-matched att) — tolérance 1px arrondi ;
- vitesse défensive ≤ `maxSpeed × 1.65 + PLAYER_RADIUS×2 + 5` (couvre closeoutBoost × profileBonus + résolution de collisions) ;
- saut attaquant ≤ 5,5 m par étape (limite physique sprint 1 s) ;
- orientation et facing toujours valides (nombres finis) à toutes les étapes ;
- porteur toujours orienté vers le panier dans `computeAttackerVisuals`.

### `zoneDefense.test.ts`
- `computeZoneTargets` : 5 cibles, au moins 2 défenseurs trackent (ownership continu), shift ball-side (centroïde glisse vers le ballon), front-2 pression le porteur en wing droit, overload côté ballon tire la zone plus fort.
- `mapAttackersToZones` : Map indexée par `zone.id`, chaque attaquant attribué à exactement une zone.

### `zoneSituations.test.ts`
- `attackerSide` : -1 / 0 / +1 selon `x` vs panier (tolérance ±30 pour le centre).
- `detectOverload` : count + intensity (0 / 0.6 / 1.0) selon le nombre d'attaquants côté ballon.
- `isShortCorner` : bande baseline (lateral > 130, vertical < 100, dHoop < 250). Note : v1 cassée car `dHoop < 130 ET lateral > 130` mathématiquement impossible — cf. [orientation-anti-teleport.md](orientation-anti-teleport.md#isshortcorner-cassée--zonesituationsts).
- `isHighPost` : centré (lateral < 60), 130–200 px du panier.
- `findCriticalZoneAttackers` : retourne la liste avec le label de zone.
- `detectSkipPass` : porteur change ET côté change ; null si même côté ou même porteur.

### `threats.test.ts` (Phase A simulation)
- `shotZoneFor` : classification correcte des 5 zones (rim, paint, mid, three, deep) selon distance au panier.
- `computeAttackerThreats` : porteur a `receivability=1`, défenseur collé contestera fortement le tir (shotQuality réduite), O5 sous le panier (rim) > O1 deep en shotQuality, `bestOffensiveOption` renvoie l'attaquant avec le score max.

### `offense.test.ts` (Phase B simulation)
- `evaluateOffensiveOptions` : inclut shoot + 4 passes (un par coéquipier), inclut un drive si carrier > 60px du panier, exclut le drive si déjà au rim, choisit `pass-shoot` vers le meilleur shooter ouvert plutôt que tir loin contesté, actions triées par EV décroissant.

### `simulator.test.ts` (Phase C simulation Monte Carlo)
- `simulatePossessions` : PPP cohérent dans [0, 3], défense lockdown produit un PPP plus faible que défense absente (régression de cohérence du modèle), somme des outcomes = N runs, `runs=0` retourne ppp=0 sans crash, **reproductibilité avec RNG seedé** (deux runs avec la même seed donnent un PPP identique — utilisation de mulberry32).

### Actions défensives scriptées (ajouts récents)

#### `defensiveActionsCatalog.test.ts` (data)
- Vérifie que le catalogue expose les actions attendues avec les champs obligatoires (`id`, `label`, `directive`), sans doublons d'identifiant.

#### `applyDirective.test.ts`
- `applyDirective` : application correcte des 4 directives MVP (`blitz`, `hedge`, `drop`, `switch`) sur l'état engine ; immutabilité de l'entrée ; résultat cohérent (positions modifiées uniquement pour les défenseurs concernés).

#### `defensiveCompilation.test.ts`
- `compileDefensiveActions` : directives correctement ordonnées par étape, actions sans étape ignorées, fusion avec les cibles engine sans écrasement des overrides manuels.

#### `defensiveDefaults.test.ts`
- Valeurs par défaut correctes pour chaque type d'action (seuils de distance, stances, facteur d'aide) ; cohérence avec les constantes `physics.ts`.

#### `scriptedActionMigration.test.ts`
- Migration des anciens formats d'actions scriptées vers le schéma courant ; pas de perte de données ; idempotence (migrer deux fois = même résultat).

#### `scriptedGenerators.test.ts`
- Générateurs (`generatePnrDirectives`, etc.) : nombre d'actions produit, champs présents, positions de départ/arrivée dans les bornes du terrain.

#### `defenseScriptedIntegration.test.ts`
- Test d'intégration end-to-end : scénario avec directives scriptées compilé puis exécuté via `effectiveDefensePositions` ; les positions finales reflètent les directives (blitz → two defenders on carrier, drop → drop defender behind screen).

## Conventions

- **Fixtures via helpers** : `cloneState()` (deep clone de `makeInitialState()`) dans `engine.test.ts`, `carrierAt()`/`defAt()` dans `screens.test.ts`, `makeDef()` dans `metrics.test.ts`. Permet d'ajouter un test sans recopier toutes les positions.
- **Pas d'I/O, pas de DOM** : les modules testés sont purs ; aucun mock nécessaire.
- **Coordonnées** : les fixtures respectent les positions canoniques de `src/lib/data/initial.ts` et les seuils de détection (`screenRadius=35`, distance porteur<80) pour rester proches du domaine réel.

## À ajouter

- `triggers.detectTriggers` (drive movement, post-up stationnaire) — partiellement couvert via `invariants.test.ts`, mais pas de tests unitaires dédiés.
- `zoneDefense.pointInPolygon` (cas limites de polygones — concaves, points sur l'arête).
- `geometry` complet (lerp, normalize, computeBallFrame avec edge cases — déjà partiellement testé pour les obstacles).
- Ajouts P6 maintenant couverts : `help.computeHelpTarget` (sag, denial, priorité paint, rim-protect), `orientation.*`, `zoneDefense` ownership, `zoneSituations`, invariants playbooks. ✓
