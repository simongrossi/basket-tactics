# Moteur physique

Toutes les **constantes physiques** du moteur (cinématique, dimensions, seuils de contact, vitesses) sont centralisées dans [`src/lib/data/physics.ts`](../src/lib/data/physics.ts). Ce document explique leur **sémantique en mètres réels** pour que le tuning reste guidé par la réalité basket plutôt que par des chiffres flottants.

> Conversion : 1 mètre = **37 pixels SVG** (`PX_PER_M`). Le demi-terrain canonique 600 × 560 px représente 16,2 m × 15,1 m, proche FIBA 15 × 14 m (écart 6-8 % absorbé par les marges).

## Échelle

| Constante | Valeur px | Valeur réelle | Origine |
|---|---|---|---|
| `PX_PER_M` | 37 | 1 m = 37 px | dérivé du diamètre du cercle restrictif (1,25 m → 46 px) |
| `PLAYER_RADIUS` | 16 | ≈ 43 cm | rayon de la silhouette épaule à épaule |
| `BALL_RADIUS` | 7 | ≈ 19 cm | ballon FIBA Taille 7 |

Helpers : `metersToPx(m)` et `pxToMeters(px)` pour les conversions.

## Clearances (distances minimales)

| Constante | Valeur px | Valeur réelle | Sémantique |
|---|---|---|---|
| `MIN_PLAYER_CLEARANCE_PX` | 34 | ≈ 92 cm | distance min entre centres de deux joueurs ; au-delà, leurs cercles se chevauchent. Utilisée par le solveur de collisions, `pushOutOfScreener`, et le pré-relax avant maxSpeed. |

## Cinématique défensive

| Constante | Valeur | Sémantique |
|---|---|---|
| `DEFAULT_DEFENSE_MAX_SPEED_PX` | 110 px/étape | ≈ 3 m sur 2 s = **1,5 m/s**. Vitesse "tactique" (placement, pas sprint). Tunable via `state.defenseMaxSpeed`. |
| `DEFAULT_DEFENSE_DISTANCE_PX` | 40 px | ≈ 1,08 m. Distance défenseur ↔ son homme (à un bras). Tunable via `state.defenseDistance` ou `rule.distance` per-défenseur. |
| `DEFAULT_CLOSEOUT_BOOST` | 1.4 | +40 % de vitesse pour le défenseur du nouveau porteur sur la transition de balle. Modulé par le profil offensif via `closeoutProfileBonus` (shooter ×1.15, non-shooter ×0.85). |
| `PLAYBACK_STEP_DURATION_MS` | 2000 ms | Durée d'une étape en lecture à `playbackSpeed = 1×`. Le slider 0.3×–2× module via `stepDuration = BASE / speed` (de ~6,7 s à 1 s par étape). |

### Vitesses par poste

`MAX_SPEED_BY_POSITION_PX` modélise la mobilité réelle :

| Poste | px/étape | m/étape | m/s (à 2 s) | Profil |
|---|---|---|---|---|
| `guard` | 145 | 3,9 | 2,0 | meneur perimeter, mobile |
| `shootingGuard` | 130 | 3,5 | 1,8 | arrière |
| `wing` | 110 | 3,0 | 1,5 | ailier (= défaut moteur) |
| `forward` | 90 | 2,4 | 1,2 | ailier fort |
| `center` | 75 | 2,0 | 1,0 | pivot, raquette |

Ces valeurs sont **sous-réelles** (un sprint NBA atteint 9 m/s ; le moteur tourne à ~22 % de cette vitesse). C'est volontaire : le simulateur travaille au pas tactique, pas au pas physique. Augmenter ces valeurs réduit l'effet "défense en retard" sur les rotations longues mais rend le moteur plus permissif. Pour le détail des trade-offs, les cas où ce choix gêne, et le chemin hypothétique vers un mode sprint réel, voir [`physics-calibration.md`](./physics-calibration.md) (G.1).

## Aide défensive

| Constante | Valeur | Sémantique |
|---|---|---|
| `DEFAULT_DENY_AGGRESSIVENESS` | 0.45 | Intensité du strong-side denial automatique (sans trigger). 0 = désactivé, 1 = pull complet vers la ligne de passe. Tunable via `state.denyAggressiveness` ou `rule.denyAggressiveness`. |
| `RIM_PROTECTION_DROP_ZONE_PX` | 75 | ≈ 2 m. Distance du panier où le helper paint pose son aim sur la ligne porteur→panier lors du "tag and recover" du big sur drive. Voir [orientation-anti-teleport.md § Bugs basket corrigés](orientation-anti-teleport.md). |

## Détection d'écran

| Constante | Valeur px | Valeur réelle | Sémantique |
|---|---|---|---|
| `DEFAULT_SCREEN_RADIUS_PX` | 35 | ≈ 95 cm | Distance max screener ↔ carrierDef pour qu'un écran porteur soit détecté. Au-delà, on considère qu'il n'y a pas de contact d'écran. Tunable via `state.screenRadius`. |

## Physique opt-in (V1 livrée mai 2026)

Au-delà des constantes ci-dessus, le moteur expose 10 **flags physiques opt-in** dans `AppState`. Tous default `false` → comportement legacy strictement préservé. UI : Paramètres → "Physique & Biomécanique" / "Physique du ballon & tirs". Voir [ROADMAP.md § Réalisme physique](../ROADMAP.md) pour le détail item par item.

| Flag | Default | Effet | Câblage principal |
|---|---|---|---|
| `realSpeedMode` | false | Mode Sprint NBA : timeline 0.5 s/étape (au lieu de 2 s) — vitesses perçues × 4 | `playbackClock`, `timecode`, `usePlaybackAnimation` |
| `attackerAccelerationEnabled` + `attackerAcceleration` | false / 5.0 | Accélération non-linéaire attaquant (slider 3–12 m/s²), forward/backward pass | `velocityProfile.ts` |
| `attackerMomentumEnabled` + `attackerMomentum` | false / 0.15 | Dérive centrifuge sur virages (slider 0.05–0.40) | `playbackTrajectory.ts` |
| `activeInterceptionsEnabled` | false | Interceptions tick-par-tick (cône 90°, z ≤ 55 px, 12 % proba) | `match/gameLoop.ts` |
| `physicsReboundsEnabled` | false | Tir 3D avec gravité + restitution arceau/planche/sol ; rebondeur = plus proche du landing | `match/gameLoop.ts` |
| `dribblePhysicsEnabled` | false | Oscillations sinusoïdales du dribble + ombre dynamique | `geometry.ts`, `Player.tsx` |
| `footworkRulesEnabled` | false | -25 % latéral, -40 % course arrière, latence 200 ms angle mort, pivot 150–300 ms | `defense/speedConstraint.ts` |
| `cvtOffensiveEnabled` | false | Remplace `curveAroundObstacle` (Bezier) par `repel`/`integrateForce` (steeringEngine) — radius 52 px, weight 18, maxStep 6 px | `playback/frameResolver.ts` |
| `screenStiffnessEnabled` + `screenStiffness` | false / 1.5 | Amplifie la pénalité écran existante (multiplicateur 1.0–3.0, borne basse 0.08) | `defense/speedConstraint.ts` |
| `physicalContactBattlesEnabled` | false | Luttes de force en box-out : poussée vectorielle attaquant↔défenseur, rayon 40 px, force 5 px/frame | `match/gameLoop.ts` |

L'annotation `cut`/`dribble` accepte aussi un flag `sprint?: boolean` (mouvement condensé sur 60 % du temps de l'étape — toggle dans StepsPanel).

**Types étendus :**
- `Point` gagne `z?: number` pour la 3D du ballon (parabole tir, parabole passe, hauteur dribble).
- `ComputedDefender` gagne `delayFraction?: number` pour la latence de réaction footwork (fraction de l'étape pendant laquelle le défenseur reste immobilisé).

**Garde-fous Rule 1 / Rule 1bis :** chaque flag a son test dédié (`cvtOffensive.test.ts`, `screenStiffness.test.ts`, `contactBattles.test.ts`, etc.). Les couches qui mutent une position passent toujours par `pushOutOfMany` final ou `pushOutOfScreenContact`. Le pipeline d'écran (détection/response/animation) reste strictement intouché par Stiffness — seule la pénalité de vitesse existante est amplifiée.

## Tuning : par où commencer ?

Les chiffres sont **conservateurs**. Pour les ajuster sans casser l'équilibre :

- **Défense trop molle / "en retard"** sur les rotations PnR → augmenter `MAX_SPEED_BY_POSITION_PX` (surtout `forward` et `center`) de +10 à +20 px. Vérifier que les tests d'invariants passent toujours (`npx vitest run invariants`).
- **Drives qui finissent libres au cercle** → augmenter `RIM_PROTECTION_DROP_ZONE_PX` (le pivot vient plus loin du panier, donc plus tôt dans la trajectoire) ou abaisser le seuil `triggers.drive` dans [`triggers.ts`](../src/lib/logic/triggers.ts).
- **Aide trop précoce** sur des passes simples → réduire `DEFAULT_DENY_AGGRESSIVENESS` à 0,3 ou activer `helpMode='passive'` par défaut sur certains défenseurs.
- **Joueurs qui se chevauchent visuellement** → augmenter `MIN_PLAYER_CLEARANCE_PX` (mais cela crée des "trous" entre joueurs serrés ; la valeur actuelle est déjà au minimum).

## Pourquoi un module séparé ?

Avant le refactor (commit < 390c90d), ces constantes étaient dispersées :
- échelle dans [`data/court.ts`](../src/lib/data/court.ts)
- vitesses par poste **inlinées** dans `defaultRules` ([`data/initial.ts`](../src/lib/data/initial.ts))
- `DEFAULT_CLOSEOUT_SPEED_FACTOR` dans `engine.ts` (constante locale)
- `MIN_TARGET_DIST = PLAYER_RADIUS * 2 + 2` répété **3 fois** (`manDefense.ts`, `engine.ts`, `screens.ts`)
- `0.45` (denyAggressiveness fallback) en littéral dans `engine.ts`

Conséquences :
- Tuner un comportement nécessitait de chercher la valeur dans plusieurs fichiers.
- Risque d'incohérence : modifier la valeur à un endroit sans répercuter ailleurs.
- Aucune documentation de la sémantique réelle (px/étape, valeurs en mètres).

Maintenant : **un seul point d'entrée**, valeurs nommées, documentées, dérivées les unes des autres quand pertinent (`MIN_PLAYER_CLEARANCE_PX = 2 * PLAYER_RADIUS + 2`).
