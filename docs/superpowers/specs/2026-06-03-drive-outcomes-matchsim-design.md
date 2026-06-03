# Spec — Défense vivante / drive 2b.1 : issues du drive dans le match-sim

**Date** : 2026-06-03
**Sous-projet** : Défense vivante / drive #2b.1 (issues du drive, sans fautes)
**Statut** : design validé, prêt pour plan d'implémentation

> Suite du sous-projet 2 (défense vivante / drive). 2a a livré le **cœur pur**
> `evaluateDriveContainment` + le câblage **playback**. 2b câble le **match-sim**.
> « Charge complète » voulue par le user → le système de fautes est un
> sous-système à part, séquencé après : **2b.1** (issues sans fautes, ici) →
> **2b.2** (système de fautes) → **2b.3** (charge, utilisant 2b.2).

---

## Problème

Dans la simulation de match (`gameLoop.ts`), un drive **atteint toujours le
cercle** : `advanceDrive` fait avancer le porteur pas-à-pas jusqu'au spot de
layup, puis `resolveShot` tire au `scoreProbability` (modulé par le contest
final). Le défenseur ne **stoppe jamais** une pénétration en cours — il est
« gelé » du point de vue de l'issue (audit IDEAS #7). Sa position n'altère que
la probabilité du tir final, pas le déroulé du drive.

**Objectif 2b.1** : pendant le drive, le défenseur du porteur peut réellement
**couper la pénétration**, produisant une issue réaliste — **pull-up**,
**kick-out** ou **strip** — au lieu du layup systématique suivi d'un tir RNG.

---

## Décisions de cadrage (validées)

- **Mid-drive dynamique** : le containment est ré-évalué pendant `advanceDrive`,
  pas seulement au choix de l'action. Le défenseur stoppe une pénétration lancée.
- **Issues** : `contained` → pull-up · `walled` → kick-out (ou strip avec petite
  proba). `beaten` → continue au cercle (comportement actuel). La **charge** est
  hors 2b.1 (→ 2b.3, après le système de fautes 2b.2).
- **Opt-in** : réutilise le flag existant `driveContainmentEnabled` (un seul
  concept « défense vivante sur drive », piloté partout). Off → comportement
  actuel inchangé (drive → cercle → tir RNG).
- **Déterminisme** : RNG seedée du match (`seededAiRng(state.seed + …)`),
  reproductible. Le cœur de containment est déterministe (géométrie).
- **Réutilisation maximale** : `turnover-drive` existe déjà dans
  `AiPossessionOutcome` → c'est l'issue du strip. Pull-up se résout via
  `resolveShot` (→ `shot-made/missed`), kick-out via l'intent `pass` existant.
  **Aucun nouvel outcome.**

---

## Architecture

### 1. Décideur pur — `src/lib/logic/match/decisions/driveOutcome.ts`

Fonction pure, déterministe, sans état :

```ts
import type { ContainmentLevel } from '../../driveContainment';

export type DriveOutcome = 'continue' | 'pullup' | 'kickout' | 'strip';

/** Petite proba qu'un drive 'walled' devienne un strip (sinon kick-out). */
export const STRIP_PROBABILITY = 0.12;

export function resolveDriveOutcome(
  level: ContainmentLevel,
  rng: () => number,
): DriveOutcome;
```

Mapping :
- `beaten` → `'continue'`
- `contained` → `'pullup'`
- `walled` → `rng() < STRIP_PROBABILITY ? 'strip' : 'kickout'`

`STRIP_PROBABILITY` calibrable.

### 2. Câblage dans `advanceDrive` (`gameLoop.ts`)

- **Garde** : si `!baseAppState.driveContainmentEnabled` → comportement actuel
  (aucun changement de flux).
- **Étendre l'intent drive** : `{ kind:'drive'; target; expectedAction; startPos?: Point; resolved?: boolean }`.
  - `startPos` est posé à la **création** de l'intent drive (position du porteur
    au démarrage). Sert de `carrierPrev` au cœur (le porteur a progressé > seuil
    depuis le départ → `isDriving` vrai malgré le grain fin des ticks, dont le
    pas de 8 px serait sinon sous `DRIVE_MIN_GAIN_PX`).
  - `resolved` empêche le re-déclenchement (anti-flapping) : on évalue **une
    seule fois**.
- **Zone de décision** : on n'évalue qu'à l'entrée dans la zone dangereuse —
  `distToHoop < DRIVE_DECISION_ZONE_PX` (~140 px, abords raquette). Avant ça, le
  drive avance normalement.
- **Évaluation** (à la première entrée en zone, `!resolved`) :
  1. Identifier le `carrierDef` (défenseur matché au porteur dans `state.defPos`,
     champ `isCarrierDefender`).
  2. `evaluateDriveContainment({ carrier: carrierPos, carrierPrev: intent.startPos,
     defender: carrierDefPos, hoop, carrierSpeed, defenderSpeed })` avec
     `carrierSpeed/defenderSpeed = containmentSpeed(tier, base)` et
     `base = baseAppState.defenseMaxSpeed`.
  3. `resolveDriveOutcome(level, rng)` avec `rng = seededAiRng(state.seed + state.tickCount * 53 + 7)` (constantes premières arbitraires, cohérentes avec les autres seeds dérivées du loop).
  4. Marquer `intent.resolved = true`.
- **Application de l'issue** :
  - `'continue'` → ne rien changer (poursuite vers le cercle, layup ; comportement actuel).
  - `'pullup'` → `intent = { kind:'shoot', action: <action pull-up>, forced:false }`.
    L'action pull-up est obtenue en ré-évaluant `evaluateOffensiveOptions` à la
    position courante et en prenant l'action `type:'shoot'` (tir contesté à
    mi-distance, `scoreProbability` naturellement plus basse qu'un layup). Le
    handler `'shoot'` existant résout au tick suivant.
  - `'kickout'` → choisir la meilleure action `type:'pass-shoot'` de
    `evaluateOffensiveOptions` (receveur le plus ouvert via la machinerie d'EV
    existante) → `intent = { kind:'pass', receiver, progress:0, expectedAction }`.
    Fallback `'pullup'` si aucune passe viable. La machinerie `advancePass`
    existante prend le relais.
  - `'strip'` → `state.outcome = 'turnover-drive'` ; incrémenter `turnovers` de
    l'équipe attaquante (calque du bloc `turnover-pass`) ; `eventLog.push(... type:'turnover', label:'Strip sur drive {carrier} par {carrierDef}')` ; `intent = { kind:'idle' }`.

### 3. Constantes

`DRIVE_DECISION_ZONE_PX` (~140) co-localisée dans `gameLoop.ts` (ou un module de
constantes match existant) ; `STRIP_PROBABILITY` dans `driveOutcome.ts`.

---

## Plan de tests

1. **Décideur pur** (`driveOutcome.test.ts`) :
   - `beaten` → `continue` ; `contained` → `pullup`.
   - `walled` + `rng=0.05` → `strip` ; `walled` + `rng=0.9` → `kickout`.
   - `STRIP_PROBABILITY` exporté.
2. **advanceDrive — issues** (test ciblé du match-loop) :
   - flag off → drive atteint le cercle (comportement actuel inchangé).
   - flag on + géométrie `contained` → intent devient `'shoot'` (pull-up) à la
     position courante, pas au cercle.
   - flag on + géométrie `walled` + rng strip → `outcome='turnover-drive'`,
     `turnovers` +1.
   - flag on + géométrie `walled` + rng kick-out → intent devient `'pass'` vers
     un receveur.
   - flag on + géométrie `beaten` → drive continue au cercle.
   - **anti-flapping** : une fois `resolved`, un tick suivant ne ré-évalue pas.
3. **Déterminisme** : même seed → même séquence d'issues (reproductible).
4. **Non-régression** : la suite match (`gameLoop`, `aiPossession`, `symmetricEngine`,
   `teamStats`, `calibration`) verte avec flag off (défaut) → aucun changement.

---

## Hors scope (séquencé après)

- **2b.2 — système de fautes** : compteurs faute joueur + équipe, bonus/pénalité,
  lancers francs comme issue de possession, disqualification effective.
- **2b.3 — charge** : drive dans un défenseur `walled`/établi → faute offensive,
  utilisant 2b.2.
- Recalibrage fin des taux (strip %, zone de décision) au-delà des valeurs
  initiales — ajustable via `autoTuning`/`calibration` existants si besoin.
- Effet du `level` sur le **choix** initial de driver (decideNextAction) : 2b.1
  agit en cours de drive, pas sur la sélection d'action amont.

---

## Risques

- **Régression du moteur de match** : tout le flux est gardé par
  `driveContainmentEnabled` (default off) → match-sim inchangé tant que le flag
  n'est pas activé. La suite match doit rester verte avec flag off.
- **Flapping / drives qui s'arrêtent trop tôt** : zone de décision + `resolved`
  (évaluation unique) bornent le comportement ; valeurs calibrables.
- **Grain des ticks vs `DRIVE_MIN_GAIN_PX`** : résolu en passant `intent.startPos`
  comme `carrierPrev` (progression cumulée depuis le départ, pas un seul tick).
- **Kick-out sans receveur viable** : fallback explicite vers pull-up.
- **Determinisme** : n'utiliser que la RNG seedée du match (jamais `Math.random`).
