# Lacunes défensives #8 — Design

Date : 2026-06-02
Statut : **spec validée — prête pour le plan d'implémentation.**

Trois raffinements du moteur défensif identifiés par l'audit expert 2026-05-29
(IDEAS.md § 8 « Lacunes défensives ciblées »). Chacun est **opt-in** pour
préserver la rétrocompat. Chantiers indépendants, commit+push séparé.

---

## #1 — Relâche du blitz quand le ballon ressort

### Problème

Le blitz (`screenRule === 'blitz'`, trap à 2 sur le porteur dans
`screens/carrierScreenAdjust.ts`) s'arrête déjà naturellement au step suivant
quand le porteur change (la détection d'écran est par-step depuis le
`ballCarrier`). MAIS la **récupération n'est pas modélisée** : les 2 trappeurs
retombent sur leurs cibles homme-à-homme génériques sans priorité tactique, et
pendant l'animation de la passe sortante ils restent figés sur la cage.

En basket réel : dès que le ballon sort du trap, le `screenerDef` récupère le
**roller** (la menace n°1, le poseur qui a roulé au panier), et le `carrierDef`
sprinte vers son homme / la menace la plus proche.

### Partie A — Récup tactique au step suivant

- **Helper pur** `defense/detectBlitzRelease.ts::detectBlitzRelease(state, stepIdx)`.
  Retourne `BlitzRelease | null` :
  ```ts
  interface BlitzRelease {
    carrierDefId: DefenderId;   // ex-défenseur du porteur trappé
    screenerDefId: DefenderId;  // ex-défenseur du poseur
    rollerId: AttackerId;       // le poseur (devient le roller à récupérer)
    formerCarrierId: AttackerId; // l'ancien porteur (qui a passé)
  }
  ```
  Conditions de déclenchement :
  1. `stepIdx >= 1`.
  2. Au step N-1, un écran porteur était détecté avec `effectiveScreenRule === 'blitz'`.
     (réutilise `buildDefenseFrameContext(state, stepIdx-1)` → `screen` +
     `effectiveScreenRule`, comme `detectRejectedScreen` lit le contexte du
     step précédent.)
  3. Le `ballCarrier` a changé entre N-1 et N (ballon sorti).

- **Nouvelle couche** `defense/blitzReleaseLayer.ts::applyBlitzReleaseLayer`
  (couche 2.6, insérée juste après `applyChainResponseLayer` couche 2.5).
  Opt-in via `state.blitzReleaseEnabled`. Skip si non détecté.
  - `screenerDef` → cible homme-à-homme sur le **roller** (entre roller et
    panier, offset 30px comme le low-man tag de pnrLayer). Pose
    `positions[screenerDefId].matchedTo = rollerId` si le roller n'est pas déjà
    son homme, ET `blitzRecovering = true`.
  - `carrierDef` → garde sa cible homme-à-homme naturelle (déjà calculée par
    baseTargets), mais on pose `blitzRecovering = true` pour le visuel + l'easing.
  - Pas de modification des matchups persistés (le swap roller est local au
    step, comme le tag PnR). `pushOutOfMany` appelé en aval par
    `resolvePlayerCollisions` (Règle #0 garantie).

- **Type** : `ComputedDefender.blitzRecovering?: boolean`.

### Partie B — Relâche intra-step pendant la passe

- **Easing** `blitzReleaseEasing.ts::blitzReleaseEasing(t)` — ease-OUT cubique
  (`1 - (1-t)^3`), symétrique de `closeoutEasing` (qui est ease-in). Départ
  rapide : les 2 trappeurs quittent vite la cage puis se posent sur leur cible.

- **Câblage** dans `playback/frameResolver.ts`, à côté du bloc closeout existant
  (ligne ~773) :
  ```ts
  if (!screenMode && defB[id].closingOut) {
    effT = closeoutEasing(effT);
  } else if (!screenMode && defB[id].blitzRecovering) {
    effT = blitzReleaseEasing(effT);
  }
  ```
  STRICTEMENT le même point d'intervention que le closeout : on ne modifie QUE
  le `effT` de ces défenseurs, jamais la math d'interpolation cœur. La passe par
  `resolvePlayerCollisions` en aval reste intacte (Règle #0).

### Opt-in & visuel

- `state.blitzReleaseEnabled?: boolean` (default undefined = legacy strict).
- Visuel : badge `↩ RECOVER` (couleur cyan `#0EA5A8`) sur les 2 défenseurs
  `blitzRecovering` dans `Player.tsx`, master `showStateRings`.
- Toggle dans `DefensePanel` (section *Couvertures avancées*), visible quand
  `screenRule === 'blitz'`.

### Tests

- `detectBlitzRelease` : 3 cas positifs (blitz N-1 + carrier changé) + 3 négatifs
  (pas de blitz, carrier inchangé, step 0).
- Intégration `blitzReleaseLayer` : screenerDef récupère le roller, flag posé,
  désactivé par défaut, INVARIANT clearance ≥ 34px.
- `blitzReleaseEasing` : e(0)=0, e(1)=1, monotone, ease-out (e(0.5) > 0.5).
- ~12 tests.

### Règle 1bis

Touche `frameResolver.ts` → **relire SCREEN-ENGINE.md** (fait), lancer
`screens* + overlap* + userJson* + screenLab*` avant chaque commit.

---

## #2 — Ancre weak-side explicite

### Problème

`help.ts` a une stance `sag-weakside` mais c'est **passif et distribué** : chaque
défenseur sag selon son propre `helpPct`, aucun défenseur n'est **désigné** pour
protéger la raquette / le skip côté faible. En basket réel, un défenseur ancre
(« low man ») s'enfonce explicitement pour protéger le panier et dissuader le
skip-and-drive.

### Architecture

- **Helper pur** `defense/pickWeakSideAnchor.ts::pickWeakSideAnchor(off, carrier,
  matchups, defenderIds, hoop, rules)`. Retourne `DefenderId | null`.
  - Priorité 1 : override manuel — le premier `dId` avec
    `rules[dId]?.weakSideAnchor === true` (côté faible vérifié quand même).
  - Priorité 2 (auto) : le défenseur **weak-side le plus bas** (côté opposé au
    ballon, plus proche de la ligne panier). Côté = `ballSide(carrierPos)` vs
    `ballSide(manPos)`. « Le plus bas » = distance min au panier parmi les
    weak-side.
  - Exclut le `carrierDef` et le `screenerDef` (déjà engagés).

- **Nouvelle couche** `defense/weakSideAnchorLayer.ts::applyWeakSideAnchorLayer`
  (couche 1.4, après `applyInfluenceLayer` couche 1.3, avant
  `applyRimProtectionLayer` couche 1.5). Opt-in via `state.weakSideAnchorEnabled`.
  - Place l'ancre sur un point dédié : **nail weak-side** = barycentre pondéré
    entre (son homme), (le panier) et (le centre raquette), biaisé vers la
    protection. Concrètement : `anchor = lerp(manPos, paintProtectPoint, 0.5)`
    où `paintProtectPoint` est sur la ligne homme→panier à mi-raquette.
  - Pose `positions[anchorId].weakSideAnchor = true`.
  - N'écrase PAS un défenseur déjà en `pnrRole` ou `onScreen` (skip).
  - `resolvePlayerCollisions` en aval (Règle #0).

- **Type** : `ComputedDefender.weakSideAnchor?: boolean` +
  `DefenderRule.weakSideAnchor?: boolean`.

### Opt-in & visuel

- `state.weakSideAnchorEnabled?: boolean` (default undefined = legacy).
- Visuel : marqueur `⚓` (ancre) sous le sprite du défenseur ancre dans
  `Player.tsx`.
- UI : toggle dans `DefensePanel` + case « ancre weak-side » dans le `DefenderMenu`
  (clic-droit défenseur) pour l'override manuel.

### Tests

- `pickWeakSideAnchor` : auto choisit le low weak-side, override manuel prime,
  exclut carrierDef/screenerDef, retourne null si pas de weak-side. ~6 cas.
- Intégration `weakSideAnchorLayer` : ancre positionnée plus bas que son sag
  naturel, flag posé, désactivé par défaut, INVARIANT clearance. ~4 cas.
- ~10 tests.

---

## #3 — Agressivité de hedge par défenseur

### Problème

`state.hedgeAggression` (0-100, B3) est **global**. Le `DefenderRule` a déjà
`closeoutBoost`, `denyAggressiveness`, `distance`, `maxSpeed`, `helpMode` en
override per-défenseur — `hedgeAggression` manque et suit exactement ce pattern.

### Architecture

- **Type** : `DefenderRule.hedgeAggression?: number` (0-100).
- **Câblage** dans `baseTargets.ts:152` :
  ```ts
  state.rules[dId]?.hedgeAggression ?? state.hedgeAggression ?? 50
  ```
  (un seul point, `applyScreenAdjustment` reçoit déjà la valeur résolue).

### UI

- Slider « agressivité hedge » dans `DefenderMenu` (clic-droit défenseur),
  visible seulement quand `screenRule === 'hedge'`. Buffer local + clamp 0-100.
- Section dans `DefensePanel` listant l'agressivité hedge effective par
  défenseur (lecture, comme le panneau debug des autres overrides).

### Tests

- Override per-défenseur prime sur global, fallback global, fallback 50.
- Intégration : 2 défenseurs hedge avec aggressions différentes → sorties D5
  distinctes. ~5 tests.

### Règle 1bis

`baseTargets.ts` touche le pipeline d'écran → relire SCREEN-ENGINE.md (fait),
lancer la suite screen avant commit.

---

## Synthèse

| # | Couche/Fichier | Opt-in | Tests | Règle 1bis |
|---|---|---|---|---|
| 1 | `blitzReleaseLayer` (2.6) + `frameResolver` easing | `blitzReleaseEnabled` | ~12 | ⚠️ frameResolver |
| 2 | `weakSideAnchorLayer` (1.4) | `weakSideAnchorEnabled` | ~10 | non |
| 3 | `baseTargets:152` + UI | per-rule (pas de flag global) | ~5 | ⚠️ baseTargets |

**Total ~27 tests.** Ordre d'implémentation : #3 (le plus simple) → #2 → #1
(le plus risqué, frameResolver en dernier). Chacun commit+push séparé.

Docs à mettre à jour après : CHANGELOG, ROADMAP, todo-priorities, SCREEN-ENGINE
(couches 1.4, 2.6 + easing blitz release dans le tableau des couches), IDEAS
(§ 8 cocher les 3 items).
