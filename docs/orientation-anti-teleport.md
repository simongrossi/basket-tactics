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

## Module `orientation.ts`

[`src/lib/logic/orientation.ts`](../src/lib/logic/orientation.ts) — fonctions pures.

### `computeDefenderOrientation`

Retourne `{ orientationDeg, facing }` pour un défenseur.

| Cas | `facing` | Modulation `orientationDeg` |
|-----|----------|-----------------------------|
| `isCarrierDefender = true` | porteur | `vsCarrier='topside'` → +30° (push baseline), `'baseline'` → -30° (push milieu) |
| `pnrRole` ∈ {tag, x-out, stunt} | ballon | — |
| `stance` ∈ {fronting, deny-3q, stunt} | ballon | — |
| `stance` ∈ {sag, behind, undefined} | midpoint(homme, ballon) | — |

`orientationDeg` est l'angle horaire depuis le NORD (haut, y négatif). 0° = face haut, +90° = face droite. Calculé via `Math.atan2(dx, -dy) * 180 / π` à partir du vecteur défenseur→facing.

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

Les défenseurs gardent leur pipeline complet (longueur d'arc, `proximityFriction`, `maxSpeed` individuel par règle, `closeoutBoost`).

## Diagnostic anti-téléportation

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
