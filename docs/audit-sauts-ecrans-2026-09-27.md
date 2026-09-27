# Audit — sauts, téléportations et incohérences autour des écrans — 27/09/2026

Outil : [`scripts/audit-screen-jumps.ts`](../scripts/audit-screen-jumps.ts)
(`npx tsx scripts/audit-screen-jumps.ts [--seconds s] [--top n] [--json fichier] [id…]`).

40 systèmes de la bibliothèque, profil **réaliste**, séquence canonique de 60
sous-pas par étape avec mémoire de lecture (`resolveTimelineFrame`, comme
l'UI), tempo du système puis étapes forcées à 2 s. Chaque événement est
étiqueté par contexte (contact d'écran, poseur, attaquant qui contourne un
poseur, hors écran) et par changement de décision écran au même sous-pas.

## Ce qui tient

| Mesure (lecture) | Tempo auto | Étapes de 2 s |
|---|---|---|
| Sauts > 9 px ou > 9 m/s en un sous-pas | **0** | **0** |
| Chevauchements < 34 px (règle 1) | **0** | **0** |
| Défenseur qui change de côté du poseur (> 25° en un sous-pas) | **0** | **0** |

Le garde-fou de 9 px, la projection finale F11 et l'ancrage du côté de
contact font leur travail : **aucune téléportation image par image pendant la
lecture continue**. Les incohérences sont ailleurs.

## Constats

### 1. La cible des défenseurs est discontinue à chaque frontière d'étape (cause racine)

`followDefendersAtFrame` (`frameResolver.ts:1168` → `defense/frameAdjust.ts`)
remplace, en milieu de segment, la position interpolée `defA → defB` par une
cible **homme-à-homme pure** (`manTarget` / `offBallStanceTarget` /
`carrierDefenderTarget`) sur l'attaquant interpolé. Cette cible ignore tout ce
que le moteur calcule à l'étape : zone, aide, rotations PnR, protection du
cercle, retard (`late`) hors écran. À t = k, la position repasse d'un coup à
celle du moteur (`effectiveDefensePositions`).

Mesure sans mémoire (scrub), entre t = k − ε et t = k :

| | médiane | p90 | max | cas > 18 px |
|---|---|---|---|---|
| Défenseurs | 0 | **82 px** | **352 px** | 107 / 465 |
| Attaquants | 0 | 0 | 130 px | 5 / 465 |

Pires cas : zones (`az-shortcorner-131` D5 352 px, `az-overload-23` D1
288 px — la fonction ne teste pas `defenseSystem`, les défenseurs de zone
suivent donc « leur » attaquant en individuel pendant le segment), mais aussi
les écrans : `screen-lab-chain-rescreen` D5 271 px, `stagger` D3 ~180 px,
`hammer` D5 ~80 px, `pnr-central` D5 97 px en fin de roll.

En lecture, le limiteur de 9 px / sous-pas et la cinématique masquent la
rupture, mais produisent :
- **des allers-retours** : `az-shortcorner-131` D5 descend de ~300 px vers le
  porteur pendant l'étape 1→2, puis remonte de ~300 px pendant 2→3 ;
- **un retard permanent** sur la position de l'étape.

### 2. La lecture n'arrive pas là où l'étape s'affiche à l'arrêt

Écart entre la position jouée en t = k et la position affichée en navigation
par étape (`staticFrame` = `effectiveDefensePositions` / `step.off`) :

| | médiane | p90 | max | cas > 18 px |
|---|---|---|---|---|
| Défenseurs | 18 px | **138 px** | **307 px** | 230 / 465 |
| Attaquants | 0 | 0 | 121 px | 4 / 465 |

La pause et la fin de lecture sont continues (elles passent par `scrubT`).
Mais dès qu'on revient à la navigation par étape (boutons étape, raccourcis,
Stop, mode présentation pas-à-pas), l'affichage bascule sur la position
calculée : **téléportation visible** de dizaines à centaines de pixels. Même
chose dans l'autre sens au lancement de la lecture depuis une étape arrêtée.
Conséquence directe du constat 1 ; se corrige avec lui.

### 3. Poseur figé toute la transition alors que l'étape suivante le fait partir

`attackerTrajectoryAt` tient le poseur sur `ann.to` jusqu'à la fin du
segment dès que `SCREEN_SET_FRACTION` est passé. Quand l'étape suivante place
le poseur ailleurs, son déplacement n'est **jamais joué** et il doit rejoindre
la position d'étape d'un coup (limité à 9 px, puis écart résiduel) :

| Système | Transition | Poseur | Écart non joué |
|---|---|---|---|
| `slob-high-drag` | 1→2 | O5 | 130 px (le roll vers (400,200) n'a pas lieu) |
| `blob-hawk` | 1→2 | O5 | 95 px |
| `slob-stagger` | 1→2 | O4 | 57 px |

Les annotations de ces modèles sont posées sur l'étape d'arrivée (convention
« N-1 → N ») : la coupe de sortie d'écran, sur l'étape N+1, n'est jamais
candidate (absStart = N+1), alors que l'écran de l'étape N tient tout N → N+1.

### 4. Relâche instantanée du poseur (pose décalée de 18 px)

Les modèles PnR posent l'écran 18 px plus loin que la position d'étape
(`pnr-central` O5 (340,290) → (340,308), `pnr-wing` O4, `spain-pnr`). En fin
d'écran, le poseur revient d'un coup à la position d'étape au début du
segment suivant : **à-coup de 6 à 8 m/s en 30 ms** au départ du roll (O5
`pnr-central` : 0 → 6,2 m/s ; O4 `pnr-wing` : 0 → 8,1 m/s, crochet latéral de
~17 px avant de partir). Même mécanisme à l'**activation** de l'écran : un
poseur repoussé par le solveur avant la pose est replacé d'un coup sur
`ann.to` quand `isScreening` passe à vrai, car il sort alors du solveur et du
limiteur (`spain-pnr` O4 : 7 px en un sous-pas).

### 5. À-coups aux départs d'attaquants

65 à-coups (> 2 m/s de variation en un sous-pas) au tempo auto, 62 à 2 s,
dont ~40 % à une frontière d'étape. Au-delà des poseurs (constat 4), ce sont
des coupes qui démarrent directement à pleine vitesse (`ucla-cut` O1,
`iverson-cut` O1, `slob-floppy` O2) : le profil trapézoïdal ne couvre que les
déplacements rectilignes sans waypoints. Les accélérations des attaquants
étaient déjà signalées dans l'audit réalisme (p90 ~27 m/s²).

45 allers-retours (> 120° entre deux sous-pas), dont la moitié au même instant
qu'un changement de décision défensive (`locked`, `pushMode`, `screenMode`) :
basculement de régime entre verrou d'écran et suivi homme-à-homme.

## Corrections proposées (par priorité)

1. **Suivi continu aux bornes** (constats 1 et 2) — dans
   `followDefendersAtFrame`, n'appliquer le suivi que comme un **écart** par
   rapport à l'interpolation moteur :
   `p = lerp(defA, defB, t) + (follow(t) − lerp(follow(0), follow(1), t))`.
   Le défenseur suit toujours le mouvement de son homme en milieu de segment,
   mais vaut exactement `defA` à t = 0 et `defB` à t = 1 : plus de rupture,
   lecture = arrêt sur l'étape. Désactiver le suivi en zone (ou le rendre
   relatif au spot de zone). Zone Règle 1bis : relancer screens\* / overlap\*
   / userJson\* / screenLab\* + golden metrics.
2. **Poseur libéré avant la fin du segment** (constat 3) — si
   `step[N+1].off` diffère de `ann.to`, tenir la pose jusqu'à une fraction
   (ex. 0,6) puis rejoindre la position d'étape ; ou corriger les trois
   modèles concernés. Ajouter un test bibliothèque « lecture = step.off à
   chaque borne pour les attaquants ».
3. **Relâche et prise d'écran progressives** (constat 4) — continuité de
   position à la frontière (décroissance de l'écart `ann.to − step.off` sur
   les premiers sous-pas du segment suivant) et entrée dans `isScreening`
   depuis la position réellement affichée, pas depuis `ann.to`.
4. **Départ progressif des coupes à waypoints** (constat 5) — étendre le
   remap `restToRestProgress` aux coupes avec waypoints qui partent de l'arrêt.
5. **Garde-fou** — intégrer les deux mesures de frontière de l'outil
   (rupture de cible, lecture vs arrêt) dans un test bibliothèque, avec un
   seuil d'abord permissif puis resserré après le correctif 1.
