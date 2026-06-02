# Spec — Défense vivante pendant le drive, 2a : cœur `driveContainment` + câblage playback

**Date** : 2026-06-03
**Sous-projet** : Défense vivante / drive #2a (cœur partagé + playback)
**Statut** : design validé, prêt pour plan d'implémentation

> Deuxième axe du programme « comportement plus réel et précis »
> (cinématique ✅ → **défense vivante / drive** → contact & fautes). Le user
> a choisi un **moteur partagé** : une logique pure de containment du drive,
> câblée d'abord dans le playback (2a, cette spec) puis réutilisée par le
> match-sim (2b, spec suivante).

---

## Problème

Quand un attaquant drive vers le panier, le défenseur du porteur ne fait
que **suivre** : il ne coupe jamais la ligne de pénétration. Dans le
playback, sa cible est dérivée de `carrierDefenderTarget` (distance
proportionnelle au panier) sans notion de **course au point de contain**.
Le défenseur n'est pas « vivant » : il ne gagne ni ne perd le duel selon
sa position et son athlétisme.

**Objectif 2a** : un défenseur qui, sur un drive, **glisse couper la
ligne** s'il est athlétiquement capable d'y arriver à temps, et un
**diagnostic honnête** qui dit au coach si son drive dessiné est contenu
ou si la ligne est ouverte — **sans modifier le tracé dessiné** (intention
du coach préservée).

---

## Décisions de cadrage (validées)

- **Approche A** — course au point de contain (cinématique géométrique) :
  comparaison d'ETA porteur vs défenseur jusqu'au point d'interception.
  Déterministe, testable, réutilise les tiers athlétiques existants.
- **Tracé du porteur intact** : le réalisme vit dans la réaction du
  défenseur + le diagnostic ; on ne réécrit pas l'annotation de drive du
  coach. La déviation automatique est hors-scope (→ 2b match-sim, où les
  trajectoires sont générées par l'IA).
- **Opt-in, hors preset réaliste** en 2a : flag `driveContainmentEnabled`
  (default off → golden snapshots intacts). Intégration au preset
  `realismProfile` envisageable plus tard, après calibrage.

---

## Architecture

### 1. Cœur pur — `src/lib/logic/driveContainment.ts`

Module pur, déterministe, sans dépendance moteur ni mutation. Testable
isolément.

```ts
import type { Point } from '../types';

export type ContainmentLevel = 'beaten' | 'contained' | 'walled';

export interface DriveContainmentResult {
  /** Le porteur se rapproche-t-il du panier (drive en cours) ? */
  isDriving: boolean;
  /** Point sur la ligne porteur→panier que le défenseur cherche à
   *  atteindre (pied de perpendiculaire, clampé en avant du porteur). */
  containPoint: Point;
  level: ContainmentLevel;
  /** ETA_def − ETA_porteur jusqu'au containPoint (en « steps »).
   *  Négatif = le défenseur arrive avant. */
  margin: number;
}

export interface DriveContainmentInput {
  carrier: Point;
  carrierPrev: Point | null;   // dérive direction + détection drive
  defender: Point;
  hoop: Point;
  carrierSpeed: number;        // px/step (tier athlétique × base)
  defenderSpeed: number;       // px/step (tier athlétique × base)
}

export function evaluateDriveContainment(
  input: DriveContainmentInput,
): DriveContainmentResult;
```

**Géométrie (approche A)** :

1. **Détection drive** : `isDriving = carrierPrev != null && (dist(carrierPrev, hoop) − dist(carrier, hoop)) > DRIVE_MIN_GAIN_PX`. Si faux → renvoyer `{ isDriving:false, level:'beaten', containPoint:carrier, margin:+∞ }` (le layer ignorera).
2. **Ligne de drive** = segment `carrier → hoop`.
3. **containPoint** = projection orthogonale du `defender` sur le segment (via helper de `geometry.ts`), **clampée** entre le porteur et le panier (le défenseur contient *devant*, pas derrière le porteur).
4. **ETA** : `etaCarrier = dist(carrier, containPoint) / carrierSpeed`, `etaDef = dist(defender, containPoint) / defenderSpeed`. (Garde-fous : `speed ≤ 0` → ETA = +∞.)
5. **Verdict** par `margin = etaDef − etaCarrier` :
   - `margin < −CONTAIN_MARGIN_STEPS` → `walled` (défenseur clairement avant).
   - `|margin| ≤ CONTAIN_MARGIN_STEPS` → `contained` (arrivée ~simultanée, contest).
   - `margin > CONTAIN_MARGIN_STEPS` → `beaten` (blow-by, défenseur en retard).

Constantes (co-localisées) : `DRIVE_MIN_GAIN_PX` (~15 px), `CONTAIN_MARGIN_STEPS` (~0.15). Valeurs initiales, calibrables au preview.

**Vitesses athlétiques** — helper `containmentSpeed(tier, baseSpeed)` mappant le tier (`elite`→×1.3, `standard`→×1.0, `lent`→×0.7, identique aux multiplicateurs `defenderSpeedProfiles` existants) × une base commune (`state.defenseMaxSpeed` côté défenseur ; même base pour le porteur en 2a — un profil de vitesse offensif distinct est une extension possible). Le mapping vit dans le cœur pour rester pur.

### 2. Couche playback — `src/lib/logic/defense/driveContainmentLayer.ts`

Suit le pattern des couches existantes (`applyXxxLayer(positions, matchups, ctx)`).

- **Opt-in** `state.driveContainmentEnabled` (nouveau champ `AppState`, default `undefined`/off). Court-circuit immédiat si absent → no-op bit-identique (golden intacts).
- **Slot** : juste après `applyBaseTargetsLayer` (Couche 1) et avant `applyInfluenceLayer` — il raffine la **cible du défenseur du porteur**, posée par baseTargets. Ne touche aucun autre défenseur.
- **Logique** :
  1. Résoudre `carrier` (porteur) et `carrierDef` (défenseur matché au porteur via `matchups`).
  2. Construire l'input depuis `ctx` (positions courantes, `ctx` expose `prevOff`/step précédent pour `carrierPrev`, `hoop`, tiers athlétiques).
  3. `evaluateDriveContainment(...)`. Si `!isDriving` → return (no-op).
  4. `contained` ou `walled` → glisser `positions[carrierDef]` vers `containPoint`, **cap de magnitude** `CONTAINMENT_MAX_SHIFT_PX` (~8 px/step, cohérent avec les autres couches), via blend borné. `beaten` → ne rien faire (défenseur en retard = réaliste).
  5. **Tag** la décision sur la métadonnée de sortie (niveau + containPoint + carrierDef) pour le diagnostic et l'overlay.
- **Clearance Rule 1** : aucune écriture brute de position court-circuitant le push-out ; la cible nudgée repasse par `resolvePlayerCollisions` en aval (comme les autres couches). Test garde-fou ajouté à `overlapInvariants`.

> CLAUDE.md Règle 1bis : cette couche s'insère dans le pipeline défensif.
> Lire `docs/SCREEN-ENGINE.md` avant implémentation. Lancer
> `screens*` + `overlap*` + `userJson*` + `screenLab*` avant tout commit.

### 3. Diagnostic + overlay (aide coach)

- **`coachDiagnostics`** : ajouter une phrase dérivée du tag de containment :
  - `walled`/`contained` → « Drive de {carrier} contenu par {carrierDef} — ligne coupée ».
  - drive détecté mais `beaten` → « Drive de {carrier} — ligne ouverte ({carrierDef} battu) ».
  - Ne s'émet que si `driveContainmentEnabled` et un drive est détecté.
- **Badge** : marqueur visuel au `containPoint` via l'overlay de détections existant (`DetectionBadgesOverlay`), couleur selon le niveau. Read-only.

### 4. Données partagées (réutilisé par 2b)

Le cœur `driveContainment.ts` est **agnostique du contexte** : il ne
connaît ni playback ni match-sim. 2b (match-sim) importera
`evaluateDriveContainment` et mappera `level` vers une issue (pull-up /
kick-out / strip) dans `gameLoop.ts`. Aucune dépendance inverse.

---

## Plan de tests

1. **Cœur pur** (`driveContainment.test.ts`) :
   - `beaten` : défenseur loin derrière, porteur ETA bien plus court.
   - `contained` : défenseur latéral à marge ~nulle.
   - `walled` : défenseur déjà sur la ligne, en avant.
   - `isDriving=false` quand le porteur ne gagne pas de terrain vers le panier.
   - `containPoint` clampé entre porteur et panier (jamais derrière le porteur).
   - garde-fous : `speed ≤ 0` → pas de NaN/crash.
2. **Couche** (`driveContainmentLayer.test.ts`) :
   - flag off → sortie bit-identique au pipeline sans la couche (no-op).
   - flag on + `contained` → `carrierDef` déplacé vers `containPoint`, déplacement ≤ `CONTAINMENT_MAX_SHIFT_PX`.
   - flag on + `beaten` → `carrierDef` inchangé.
   - n'altère **que** le défenseur du porteur (les 4 autres intacts).
3. **Clearance** (`overlapInvariants.test.ts`) : un cas où le containPoint
   colle un coéquipier défenseur → clearance 34 px préservée après pipeline.
4. **Diagnostic** : phrase correcte pour chaque niveau ; absente si flag off.
5. **Non-régression** : `screens*` + `overlap*` + `userJson*` + `screenLab*`
   verts (flag off → pipeline inchangé).

---

## Hors scope (sous-projets / extensions ultérieurs)

- **2b — câblage match-sim** : l'issue du drive (pull-up / kick-out /
  strip / charge) découle de `level` dans `gameLoop.ts`, remplaçant le
  « toujours atteindre le cercle puis tir RNG ».
- Déviation automatique du tracé dessiné (réécriture de l'annotation drive).
- Profil de vitesse offensif distinct pour l'ETA porteur (2a réutilise la
  base défensive).
- Aide weak-side dédiée au drive contenu (interaction avec rimProtection /
  pnrRotations) — au-delà du duel porteur/défenseur.
- Intégration de `driveContainmentEnabled` au preset `realismProfile`
  (après calibrage visuel).

---

## Risques

- **Régression pipeline** (Règle 1bis) : couche opt-in default-off +
  invariant bit-identique flag-off → golden snapshots non touchés.
- **Sur-glissement** du défenseur (téléport visuel) : cap dur
  `CONTAINMENT_MAX_SHIFT_PX` + passage par `resolvePlayerCollisions`.
- **Calibration** des seuils (`DRIVE_MIN_GAIN_PX`, `CONTAIN_MARGIN_STEPS`,
  cap) : valeurs initiales, ajustées au preview avant figeage.
- **Double comptage** avec `rimProtectionLayer` (qui ferme déjà les
  couloirs libres) : le containment ne touche que le `carrierDef` ; rim
  protection désigne un *autre* défenseur. Périmètres disjoints — à
  vérifier par un test d'intégration « drive + rim protection coexistent ».
