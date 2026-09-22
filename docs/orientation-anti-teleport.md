# Orientation calculée & anti-téléportation

Cette page documente les changements apportés pour que les déplacements et postures des joueurs respectent la logique basket : pas de téléportations, orientation cohérente avec la situation, écrans et aides physiquement plausibles.

## Pourquoi

Avant ces changements :

- L'**orientation** des défenseurs était un curseur manuel statique (réglage `state.rules[id].orientation`), jamais dérivé du jeu. Une posture `fronting` ne tournait pas le défenseur face au ballon, par exemple.
- Les **attaquants n'avaient aucune orientation** ni aucun pointeur visuel — porteur, passeur, coupeur et poseur d'écran apparaissaient à l'identique.
- Les **attaquants se téléportaient** : leur interpolation entre étapes était une ligne droite brute, sans contournement d'obstacle ni borne de vitesse. Un attaquant pouvait traverser un défenseur ou un poseur d'écran.
- **Top-lock** ignorait le ballon (`void ballPos` dans le code) : le défenseur du shooter était poussé vers le cutter au lieu d'être placé côté ballon.
- Le **paint helper** appliquait son intensité à tous les défenseurs sans tenir compte de leur distance à la cible — un coin opposé pouvait être tiré aussi fort qu'un wing strong-side.
- Les **écrans fantômes** étaient détectés sur simple proximité, sans vérifier que le screener marchait bien vers le couple porteur/défenseur.

## Continuité pendant le déplacement manuel des attaquants

Le déplacement des défenseurs est toujours borné en vitesse pendant le
glissement d'un attaquant, y compris avec l'option **Appuis et fatigue pendant
le déplacement** (`defenderDragInertiaEnabled`) désactivée. Cette option ajoute
les effets des appuis, du regard et de la fatigue ; elle ne commande plus
l'activation de la poursuite.

À chaque tick, le budget de déplacement est `vitesse effective × dt`. La
vitesse de base est le `maxSpeed` du défenseur (ou `defenseMaxSpeed`), divisé
par la durée de l'étape active en millisecondes, bornée à au moins 100 ms.
Le profil de vitesse s'applique toujours : élite ×1,3, lent ×0,7, standard ×1.
Les modulateurs optionnels et leurs conditions sont détaillés dans
[physics.md](physics.md#poursuite-défenseur-pendant-les-gestes-dédition).

Le départ utilise les positions réellement affichées. Au relâchement, le
rattrapage continue depuis ces positions jusqu'à la cible : aucun retour au
snapshot initial, aucun saut si la distance dépasse 200 px, aucun abandon
après 500 ms. Un nouveau glissement reprend là où les joueurs se trouvent.
Les callbacks d'animation retardés sont plafonnés à 50 ms de déplacement.

Pour un glissement groupé de défenseurs, le joueur qui sert de référence
et ses coéquipiers partent aussi des positions affichées. Repartir des
anciens `defenseInitial` ou overrides produisait un décalage dès le premier
mouvement du groupe.

Pour la zone 2-1-2, les receveurs déjà couverts par une mission prioritaire
sont exclus avant l'affectation des défenseurs aux lignes de passe. Les
exclure après affectation réservait inutilement un défenseur : dans la
situation de régression, bouger O1 d'un pixel faisait sauter la cible de D5
d'environ 73 px (deux mètres).

Régressions : [poursuite affichée](../src/hooks/__tests__/useCourtFrame.pursuit.test.tsx),
[cycle de vie de la poursuite](../src/hooks/__tests__/useAppState.pursuit.test.tsx),
[continuité des cibles de zone](../src/lib/logic/__tests__/zoneDefenseContinuity.test.ts)
et [gestes individuels/groupés et lecture seule](../src/components/__tests__/CourtView.recorded.test.tsx).

Pour transmettre un nouveau bug, [enregistrer les gestes et copier leur code
`BTG1`](SITUATION-CODE.md#enregistrer-et-transmettre-des-gestes-manuels).
La trace conserve les demandes de déplacement et les positions affichées avec
leurs timestamps. Sa relecture affiche les échantillons tels quels, sans
lissage temporel ni nouvelle simulation défensive ; elle permet donc de
retrouver un saut au lieu de le masquer.

## Module `orientation.ts`

[`src/lib/logic/orientation.ts`](../src/lib/logic/orientation.ts) — fonctions pures.

### `computeDefenderOrientation`

Retourne `{ bodyOrientation, gazeOrientation, facing, armBallSide, armManSide }` pour un défenseur.

| Cas | `gazeOrientation` / triangle | `bodyOrientation` |
|-----|----------|-----------------------------|
| `isCarrierDefender = true` | porteur | porteur, modulé par `vsCarrier='topside'` (+30°) / `'baseline'` (-30°) |
| `pnrRole` ∈ {tag, stunt} | ballon prioritaire, homme en périphérie si possible | 75% côté ballon, 25% recover homme |
| `pnrRole = x-out` | ballon prioritaire, homme en périphérie si possible | 60% côté ballon |
| `stance = fronting` | ballon | ballon / ligne de passe |
| `stance = deny-3q` | ballon prioritaire, homme en périphérie si possible | 65% côté ballon |
| `stance = stunt` | ballon prioritaire, homme en périphérie si possible | 70% côté ballon |
| `stance = behind` | ballon prioritaire, homme en périphérie si possible | homme |
| `stance = sag` / undefined | ballon prioritaire, homme en périphérie si possible | midpoint **angulaire** homme-ballon |

Les angles sont horaires depuis le NORD (haut, y négatif). 0° = face haut, +90° = face droite.

La logique de vision humaine vit dans [`src/lib/logic/vision.ts`](../src/lib/logic/vision.ts) :
- tête clampée à ±60° du corps (`clampGazeToFrontal`) ;
- champ de vision de 120° centré sur le regard (`FIELD_OF_VIEW_HALF_ANGLE_DEG = 60`) ;
- si homme + porteur peuvent entrer ensemble dans le cône, la cible secondaire reste en périphérie (cône partagé via `resolveSharedGaze`) ;
- si c'est physiquement impossible, la consigne prioritaire gagne sans fabriquer un regard dans le dos.

### Regard auto distance-based (`PROXIMITY_GAZE_RATIO`)

En stance `sag` / `behind` / défaut (sans `gazeLock` explicite), `resolveDefenderGaze` choisit dynamiquement la cible primaire selon la **distance** :

```
dMan  = distance(défenseur → homme marqué)
dBall = distance(défenseur → ballon)
si dMan < dBall × 0.65 → primary = homme (menace immédiate)
sinon                  → primary = ballon (lecture d'aide, anticipation passe)
```

Avant ce comportement, le mode auto pointait quasi systématiquement vers le ballon — visuellement le triangle pivotait de quelques degrés à peine d'une étape à l'autre, ce qui donnait une impression de figé. Avec le ratio 0.65, le triangle saute franchement vers l'homme dès qu'il s'approche du défenseur (cut dans la raquette, démarquage proche), puis revient sur le ballon quand l'homme s'éloigne. Le secondary reste visible si la géométrie le permet (cône partagé 120°), et le clamp anatomique ±60° est inviolable.

Cette logique ne s'applique qu'au mode auto. Les `gazeLock` explicites (`'opponent'`, `'ball-carrier'`, `'both'`) et les stances actives (`fronting`, `deny-3q`, `stunt`, rôles PnR `tag`/`x-out`/`stunt`) gardent leur cible déterministe.

Le clic-droit défenseur expose aussi une consigne tactique de corps :

| Mode corps | Effet |
|---|---|
| `auto` | suit la stance (`sag`, `deny-3q`, `fronting`, etc.) |
| `open` | corps ouvert au midpoint angulaire homme/ballon |
| `face-man` | corps face à l'homme marqué |
| `face-ball` | corps face au porteur / ballon |
| `pass-lane-flat` | corps dans l'axe porteur→homme marqué |
| `pass-lane-perp` | corps à 90° de l'axe porteur→homme marqué |

Le slider absolu `bodyOrientation` reste prioritaire quand il est défini.

### Override manuel : delta clampé

Quand `state.rules[id].orientation` est défini par l'utilisateur, on l'**ajoute** au calcul auto avec un clamp dur à `[-45°, +45°]`. Conséquence :

- l'auto produit toujours une orientation **valide basket** ;
- le réglage manuel module la posture sans pouvoir la rendre aberrante (un fronting ne peut pas tourner le dos au ballon) ;
- la valeur persistée par l'utilisateur dans le ContextMenu reste respectée.

### `computeAttackerOrientation`

Cinq rôles avec leurs règles de facing :

| Rôle | Détection (cf. `computeAttackerVisuals`) | `facing` | Particularité |
|------|-------------------------------------------|----------|---------------|
| `carrier` | `id === cur.ballCarrier` | panier | — |
| `passer` | étape précédente : `prev.ballCarrier === id && cur.ballCarrier !== id` | nouveau porteur | — |
| `cutter` | distance vers étape suivante > 30 px | `nextPos` | — |
| `screener` | écran porteur OU off-ball détecté avec ce screener | défenseur ciblé (carrierDef / cutterDef) | **orientationDeg += 90°** (corps perpendiculaire à la trajectoire du défenseur) |
| `idle` | défaut | ballon | — |

### Lerp angulaire

[`lerpAngleDeg`](../src/lib/logic/orientation.ts) interpole deux angles via le plus court chemin sur le cercle (modulo 360). Évite l'effet "rotation à l'envers" quand on traverse 0/360 entre deux étapes.

## Câblage

- [`engine.ts`](../src/lib/logic/engine.ts) : `computeDefenseTargets` alimente `orientation` et `facing` dans chaque `ComputedDefender`. Une post-pass à la fin recalcule l'orientation après les ajustements PnR / off-ball / trap pour utiliser la position FINALE et le `pnrRole` effectif.
- [`engine.ts`](../src/lib/logic/engine.ts) : nouvelle export `computeAttackerVisuals(state, stepIdx)` qui détecte les rôles d'attaquants à une étape et retourne un `Record<AttackerId, { orientation, facing }>`.
- [`CourtView.tsx`](../src/components/CourtView.tsx) : passe `frame.attVisuals[id]` aux `Player` attaquants ; passe `p.orientation` / `p.facing` aux défenseurs (au lieu de l'ancienne valeur statique).
- [`Player.tsx`](../src/components/Player.tsx) : bras FIBA + triangle pointeur étendus aux attaquants (couleur stroke ajustée, opacité 0.7 pour rester visuellement distinct des défenseurs).
- [`StepThumbnail.tsx`](../src/components/StepThumbnail.tsx) : même branchement pour le rendu PDF / vignettes.

## Anti-téléportation des attaquants

Avant : interpolation linéaire pure, traverse les obstacles. Maintenant, dans [`CourtView.tsx`](../src/components/CourtView.tsx) (playFrame ET scrubFrame) :

1. Pour chaque attaquant, on construit la liste des obstacles : autres attaquants (position moyenne A-B) + défenseurs (position moyenne A-B).
2. `pickBlockingCluster(from, to, obstacles)` détecte si un obstacle bloque le segment.
3. Si oui, `curveAroundObstacle` génère une trajectoire Bezier qui contourne — exactement la même physique que celle déjà en place pour les défenseurs.
4. La position est interpolée selon les annotations via [`attackerTrajectoryAt`](../src/lib/logic/playbackTrajectory.ts) : `cut` ligne droite, `dribble` wave Q-Bezier (`sampleDribbleWave`), `screen` vitesse double sur la première moitié puis hold, et **avec waypoints** : polyline lissée Catmull-Rom (`samplePolyline`) reparamétrée en longueur d'arc — vitesse perçue constante quel que soit la courbure.

Les défenseurs gardent leur pipeline complet (longueur d'arc, `proximityFriction`, `maxSpeed` individuel par règle, `closeoutBoost`).

### Suivi des défenseurs sur trajectoires courbes

Avant le commit `fix(playback): tous les défenseurs suivent leurs attaquants`, l'interpolation défensive était purement linéaire entre `defA[id]` et `defB[id]`. Quand l'attaquant suivait un arc (wave dribble, V-cut, polyline freehand), le défenseur prenait la corde de l'arc et lâchait visuellement son homme. La fonction `followDefendersAtFrame` ([`engine.ts`](../src/lib/logic/engine.ts), documentée dans [logique-defensive.md](logique-defensive.md#suivi-temps-réel-des-défenseurs-en-lecture-followdefendersatframe)) résout le problème en réécrivant la position de marquage de chaque défenseur (carrier + off-ball) à chaque frame, à partir de la position courante de son attaquant marqué. Les overrides manuels (`defenseOverrides`) restent prioritaires.

## Diagnostic anti-téléportation

**Mise à jour F12 (septembre 2026)** : le seuil historique décrit ci-dessous
est remplacé par `movement-duration`, qui rapporte la vitesse demandée aux
durées et aux fenêtres d'action. Voir [PLAN-COACH.md](../PLAN-COACH.md).

[`coachDiagnostics.ts`](../src/lib/logic/coachDiagnostics.ts) — nouveau diagnostic `tag: 'attacker-jump'`. Si un attaquant parcourt plus de **4 m** entre deux étapes consécutives (4 × `PX_PER_M` = 148 px), un warning informatif s'affiche. La simulation n'est pas bloquée — le coach est juste alerté que la keyframe est suspecte.

Seuil : 4 m correspond à environ 1 seconde de course soutenue pour un joueur ; au-delà, c'est probablement un saut éditorial à corriger.

## Bugs basket corrigés

### Top-lock — [`screens.ts:483`](../src/lib/logic/screens.ts)

Avant, la branche top-lock de `applyOffBallScreenAdjustment` faisait :

```ts
const ballPos = off[Object.keys(off)[0] as AttackerId]; // placeholder
void ballPos;
return pushOutOfScreener({ x: baseTarget.x + cx * 14, y: baseTarget.y + cy * 14 }, screenerPos);
```

Le ballon était récupéré puis explicitement ignoré, et le défenseur du cutter était décalé dans la direction screener→cutter — sans rapport avec le côté ballon.

Après : la signature accepte `ballPos: Point` (passé par `engine.ts`), et le défenseur est placé côté ballon de la ligne screener→cutter via projection sur la perpendiculaire :

```ts
const sideOfBall = Math.sign(perpX * (ballPos.x - cutterPos.x) + perpY * (ballPos.y - cutterPos.y)) || 1;
return pushOutOfScreener({
  x: baseTarget.x + perpX * 16 * sideOfBall - cx * 4,
  y: baseTarget.y + perpY * 16 * sideOfBall - cy * 4,
}, screenerPos);
```

### Paint helper pondéré par proximité — [`help.ts`](../src/lib/logic/help.ts)

`priority='paint'` applique maintenant un coefficient de proximité au `helpFactor` selon la distance du défenseur à la cible d'aide :

| Distance défenseur → aim | Coefficient |
|---|---|
| ≤ 120 px | ×1.0 |
| 120–280 px | dégradé linéaire 1.0 → 0.4 |
| ≥ 280 px | ×0.4 |

Conséquence : un défenseur en coin opposé n'aide plus aussi fort qu'un wing strong-side.

### Filtre d'intention sur les écrans — [`screens.ts`](../src/lib/logic/screens.ts)

`detectScreen` et `detectOffBallScreens` acceptent un nouveau paramètre optionnel `prevOff?: AttackerPositions`. Quand fourni, la nouvelle fonction `hasScreenIntent` compare la distance d'un attaquant au couple porteur/défenseur entre l'étape précédente et l'étape courante :

- s'il s'**est rapproché** (cur ≤ prev) ou **statique** (vitesse < 5 px) → intention plausible, candidat conservé ;
- s'il s'**éloigne** (cur > prev) avec vitesse ≥ 5 px → croisement, pas un écran posé, candidat rejeté.

Sans `prevOff`, le filtre est désactivé (rétrocompatibilité). L'override `forcedScreener` bypass le filtre (l'utilisateur a explicitement désigné un poseur).

### `isShortCorner` cassée — [`zoneSituations.ts`](../src/lib/logic/zoneSituations.ts)

Découvert via les tests d'invariants. La v1 exigeait `dHoop < 130 ET lateral > 130`, mathématiquement impossible (sqrt(lat² + vert²) ≥ lat). La fonction ne matchait jamais → le boost critique `criticalMult = 1.4` n'était jamais appliqué sur les attaquants en short corner, contrairement à l'intention.

Corrigé en : `lateral > 130 ET vertical < 100 ET dHoop < 250` — bande baseline hors raquette, pas trop loin du panier.

## Tests d'invariants

[`src/lib/logic/__tests__/invariants.test.ts`](../src/lib/logic/__tests__/invariants.test.ts) — rejoue chaque playbook de la bibliothèque (PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy, Hammer) et vérifie pour chaque paire d'étapes :

- aucun chevauchement de joueurs (distance ≥ `2 * PLAYER_RADIUS - 1`) ;
- vitesse défensive bornée à `maxSpeed × 1.65 + PLAYER_RADIUS×2 + 5` (la marge couvre le bonus de closeout × profil + le solveur de collisions post-pass) ;
- saut attaquant ≤ 5,5 m (limite physique sprint sur 1 s ≈ 5,5 m/s) ;
- orientation et facing toujours valides (nombres finis) ;
- porteur regarde bien le panier.

Ces tests sont des **garde-fous** contre les régressions futures : si quelqu'un casse le moteur en touchant le contournement d'obstacle ou le calcul d'orientation, ces tests échouent immédiatement sur la bibliothèque.

## Récapitulatif fichiers

| Fichier | Lot | Action |
|---------|-----|--------|
| [src/lib/logic/orientation.ts](../src/lib/logic/orientation.ts) | 2 | Nouveau module |
| [src/lib/logic/engine.ts](../src/lib/logic/engine.ts) | 2, 3 | Câblage orientation, `computeAttackerVisuals` |
| [src/lib/logic/screens.ts](../src/lib/logic/screens.ts) | 1.1, 1.3 | Top-lock corrigé, filtre `hasScreenIntent` |
| [src/lib/logic/help.ts](../src/lib/logic/help.ts) | 1.2 | Pondération paint helper |
| [src/lib/logic/coachDiagnostics.ts](../src/lib/logic/coachDiagnostics.ts) | 3.3 | Diagnostic `attacker-jump` |
| [src/lib/logic/zoneSituations.ts](../src/lib/logic/zoneSituations.ts) | 4 | Fix `isShortCorner` |
| [src/lib/types/index.ts](../src/lib/types/index.ts) | 2 | `ComputedDefender.orientation/facing`, `ComputedAttackerVisuals` |
| [src/components/CourtView.tsx](../src/components/CourtView.tsx) | 2, 3 | Lerp angulaire, contournement attaquants, branchement orientation |
| [src/components/Player.tsx](../src/components/Player.tsx) | 2 | Bras FIBA + triangle étendus aux attaquants |
| [src/components/StepThumbnail.tsx](../src/components/StepThumbnail.tsx) | 2 | Branchement orientation pour vignettes |
| [src/lib/logic/__tests__/orientation.test.ts](../src/lib/logic/__tests__/orientation.test.ts) | 2 | Tests TDD orientation (12 cas) |
| [src/lib/logic/__tests__/invariants.test.ts](../src/lib/logic/__tests__/invariants.test.ts) | 4 | Invariants sur les playbooks (35 tests) |
| [src/lib/logic/__tests__/zoneDefense.test.ts](../src/lib/logic/__tests__/zoneDefense.test.ts) | 4 | Tests ownership zone |
| [src/lib/logic/__tests__/zoneSituations.test.ts](../src/lib/logic/__tests__/zoneSituations.test.ts) | 4 | Tests overload / short-corner / high-post / skip |

Bilan : **111 → 184 tests** (73 nouveaux), `npm run type-check` propre, build de production OK.
