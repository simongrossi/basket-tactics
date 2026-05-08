# Pick-and-roll, écrans non-porteur et lectures offensives

Pipeline complet de la roadmap "réalité basket" (P0 → P5) qui transforme
le moteur d'un système de positions en un moteur tactique reconnaissable
par un coach. Chaque chantier ajoute une couche au-dessus du calcul de
positions, sans toucher la base.

## P0 — Détection enrichie de l'action sur écran porteur

[`screenAction.ts`](../src/lib/logic/screenAction.ts)

### Types d'action détectées

```
type ScreenAction =
  | 'roll'        // poseur court vers le panier après contact
  | 'pop'         // poseur ressort à 3pts après contact
  | 'slip'        // poseur part au panier sans contact (timing court)
  | 'short-roll'  // roll arrêté en mid-range
  | 'ghost'       // faux écran, poseur à 3pts sans contact
  | 'reject'      // porteur drive du côté opposé à l'écran
  | 'snake'       // porteur ressort par où il est venu
  | 're-screen';  // second écran posé immédiatement par même paire
```

### Heuristiques

`detectScreenAction(off, prevOff, screen, prevScreen?, prevPrevOff?, hoop)`
analyse le mouvement entre étapes :

| Action | Signature |
|---|---|
| `re-screen` | `prevScreen` = même `(screener, carrier)` |
| `slip` | pas de contact + `Δd_panier_screener < −18px` |
| `ghost` | pas de contact + `Δd_panier_screener > +18px` ET final >220px |
| `snake` | porteur change de direction latérale (besoin step N-2) |
| `reject` | porteur drive `Δx > 30px` côté **opposé** à l'écran |
| `roll` | screener `Δd < −18px` (au cercle si `<100px`, mid si 100-220px → short-roll) |
| `pop` | screener `Δd > +18px` après contact |

### Helpers exportés

- `screenActionLabel(kind)` : libellé français court
- `actionRequiresLowManTag(kind)` : true pour roll/short-roll/slip
- `actionRequiresPopRecover(kind)` : true pour pop/ghost
- `actionBreaksCoverage(kind)` : true pour reject/snake

### Glue

`detectStepScreenAction(state, stepIdx)` (engine.ts) rassemble matchups,
positions défensives N-1, écran de l'étape précédente, positions N-2.
Retourne `{screen, action}` ou `null`. Consommé par `coachDiagnostics`,
`tacticalReads` et la pill "action PnR" de `MetricsBar`.

## P1 — Rotations PnR : low-man tag, X-out, nail stunt

[`pnrRotations.ts`](../src/lib/logic/pnrRotations.ts)

`computePnRRotations(off, matchups, screen, action, defenderTargets, hoop,
defenseInitial)` retourne la liste des défenseurs à overrider, avec leur
rôle et leur cible. Trois rôles possibles :

### 1. `tag` — low-man bumpe le roller

Identifie le défenseur back-side faible le plus proche du panier (hors
carrierDef et screenerDef). Heuristique côté faible :
`matchedTo` de l'autre côté que le porteur OU central.

Cible = `screener + 0.35 × (hoop − screener)` — entre le roller et le
panier, à 35% du chemin depuis le roller.

### 2. `x-out` — couvre l'orphelin du low-man

L'attaquant que le low-man marquait initialement est orphelin. Le
défenseur dont l'homme est le plus proche de cet orphelin (hors
carrierDef, screenerDef, lowMan) shift à 50% du chemin vers l'orphelin.

### 3. `stunt` — faux mouvement depuis le nail

Défenseur en zone high-post (`matchedTo` lateral <90px de l'axe panier,
vertical 80-200px du panier). Cible = `base + 0.25 × (carrier − base)`.

### Wiring

`engine.ts` (après `applyScreenAdjustment`) :

```
if (screen && rule !== 'switch'):
  action = detectScreenAction(...)
  overrides = computePnRRotations(...)
  for each ov in overrides:
    positions[ov.defender] = { x, y, pnrRole: ov.role, helpFactor=0.6, helpTriggered=true }
```

`pnrRole` est exposé sur `ComputedDefender` et propagé dans les 3
branches de `effectiveDefensePositions`.

### Visuel

[`Player.tsx`](../src/components/Player.tsx) trace un anneau coloré
selon `pnrRole` :
- `tag` : doré pointillé + label "TAG"
- `x-out` : magenta + label "X"
- `stunt` : bleu pâle + label "STUNT"

## P2 — Couvertures PnR explicites

[`screens.ts`](../src/lib/logic/screens.ts) — `applyScreenAdjustment`

`ScreenRule` étendu de 6 → 9 valeurs. Trois nouvelles couvertures :

### `ice` / no-middle (force baseline)

Cible carrier def : shift perpendiculaire **opposé** à `over` (signe
inversé sur `sideOfCarrier`), amplitude 18-34px. Coupe la trajectoire
middle.

Cible screener def : drop profond 45px (vs medium 35), absorbe le drive
baseline.

### `weak` (under léger, recover shooter)

Carrier def : descend 22px sur l'axe screener→panier (vs 36 pour under).
Reste au niveau de l'écran pour recover si pop.

Screener def : drop léger 22px.

### `peel-switch` (drop puis switch quand porteur dépasse)

Géométriquement = drop tant que pas déclenché.

`peelSwitchShouldFire(off, screen, screenerDefPos, hoop)` retourne
`true` si `dist(carrier, hoop) + 30 < dist(screenerDefPos, hoop)` →
porteur a passé l'écran.

`engine.ts` : si la condition est remplie, `applySwitch(matchups,
screen)` automatique + enregistrement dans `cur.switches`.

### UI

- [`DefensePanel.tsx`](../src/components/DefensePanel.tsx) — select
  consigne écran porteur ajoute `ice`, `weak`, `peel-switch`.
- [`ContextMenu.tsx`](../src/components/ContextMenu.tsx) — override par
  défenseur (`rule.screenNav`) supporte aussi les 3 nouvelles.

## P3 — Comportement zone réaliste

[`zoneSituations.ts`](../src/lib/logic/zoneSituations.ts)

### Détections

- `detectOverload(off, ballCarrier, hoop)` → `{side, count, intensity}`.
  Intensity : 0 si ≤2, 0.6 si 3, 1.0 si 4+ attaquants côté ballon.
- `isShortCorner(pos)` : lateral >130px ET `dist(panier)` 60-130px.
- `isHighPost(pos)` : lateral <60px ET `dist(panier)` 130-200px.
- `findCriticalZoneAttackers(off)` → liste d'attaquants en short-corner
  ou high-post.
- `detectSkipPass(prevOff, off, prevCarrier, carrier)` → détecte
  changement de moitié de terrain.

### Effets sur le moteur de zone

[`zoneDefense.ts`](../src/lib/logic/zoneDefense.ts) `computeZoneTargets` :

1. **Overload → glissement renforcé** :
   ```
   effectiveBallSideHelp = tactic.ballSideHelp × (1 + intensity × 0.6)
   ```
   Avec un overload sévère, ballSideHelp passe de ex. 0.5 → 0.8.

2. **Short corner / high post → boost claim** :
   ```
   claim = proximity × naturalBonus × carrierBonus × criticalMult
   criticalMult = 1.4 si attaquant en zone tueuse
   ```
   Tous les défenseurs voisins renforcent leur claim → ownership monte
   → engagement franc.

3. **Skip pass** : pas de logique spécifique (la contrainte de vitesse
   déjà existante crée naturellement des `late: true`). Diagnostic :
   compte les `late` post-skip.

## P4 — Écrans non-porteur enrichis

[`screens.ts`](../src/lib/logic/screens.ts) — `OffBallScreenRule` et
`OffBallScreenType` étendus.

### Couvertures (`OffBallScreenRule`)

| Règle | Géométrie |
|---|---|
| `over` (existant) | shift +18px le long axe screener→cutter |
| `under` (existant) | shift −22px |
| `switch` (existant) | swap matchups |
| `bump` (existant) | screenerDef ferme côté cutter, +12px perpendiculaire |
| `top-lock` (P4) | shift +14px côté ballon, contact préventif |
| `chase` (P4) | shift +24px collé au cutter (jamais sous) |

### Types détectés (`OffBallScreenType`)

`upgradeOffBallScreens` post-traite la liste de screens simples :

| Type | Détection |
|---|---|
| `pindown` (existant) | `screenerY > cutterY + 20` |
| `flare` (existant) | screener plus proche du ballon que cutter |
| `backscreen` (existant) | `screenerY < cutterY − 20` |
| `stagger` (P4) | 2 pindowns sur même cutter, screeners ≥55px d'écart |
| `elevator` (P4) | 2 pindowns sur même cutter, screeners <55px (couloir) |
| `hammer` (P4) | backscreen baseline + cutter va côté faible (corner opposé) |
| `flex` (P4) | backscreen baseline + cutter reste côté fort |

`DetectedOffBallScreen` porte `secondScreener`/`secondScreenerDef`/
`secondScreenerPos` pour stagger et elevator.

## P5 — Lectures offensives auto

[`tacticalReads.ts`](../src/lib/logic/tacticalReads.ts)

`computeTacticalReads(state, stepIdx, defPos)` retourne
`CoachDiagnostic[]` avec tag préfixé `read-*`. Mapping couverture →
lecture (toutes les phrases sont préfixées "→") :

### PnR

| Couverture | Lecture proposée |
|---|---|
| `drop` | "Pull-up ouvert pour {carrier}" + "Pop {screener (stretch)} 3pts" |
| `switch` | "Drive iso" si carrier guard / "Post-up" si screener big |
| `hedge` | "Short roll 4v3 par {screener} — passe pocket" |
| `ice` | "Reject + drive baseline" |
| `weak` | "Tir 3 ouvert" si carrier shooter |
| `blitz` | "Skip vers côté faible, 4v3" |
| `over` | "Snake dribble pour repasser sous l'écran" |
| `peel-switch` | "Continuer le drive avant que le switch fire" |
| `under` | "Pull-up 3 ouvert" si shooter |

### Zone

| Situation | Lecture |
|---|---|
| Overload | "Skip pass vers côté faible (zone glissée)" |
| Short corner libre | "Drop pass + tir court" |
| High post libre | "Flash high post, attaquer la raquette" |

### Closeout

| Trigger | Lecture |
|---|---|
| `late` simple sur porteur | "Drive avant fermeture" |
| `overClosed` | "Déborde, finition au cercle" |

### Filtres profils

Toutes les lectures consomment `state.attackerProfiles` :
- "Drive iso" n'apparaît que si carrier ∈ {creator, slasher, shooter}.
- "Post-up" n'apparaît que si screener ∈ {rim-roller, stretch-big}.
- "Pull-up 3" n'apparaît que si carrier ∈ {shooter, stretch-big}.

## UI bandeau coach séparé

[`CoachDiagnostics.tsx`](../src/components/CoachDiagnostics.tsx) sépare
visuellement les diagnostics en deux blocs sous la `MetricsBar` :

1. **LECTURE COACH** — diagnostics taggés non-`read-*` (critique
   défense). Triés par sévérité critical → warning → info → good.
2. **LECTURE OFFENSIVE** — diagnostics taggés `read-*`. Préfixés "→"
   pour distinction visuelle.

## Synergie P0 → P5

Sur un seul scénario PnR, le système peut produire :

```
LECTURE COACH
✕ slip de O5 (rim-roller) : D5 doit tagger — actuellement à 152px
⚠ Switch : D1 sur O5 (rim-roller) — mismatch potentiel à attaquer

LECTURE OFFENSIVE
→ Hedge : short roll 4v3 par O5 (rim-roller) — passe pocket
→ Switch : O5 (rim-roller) pose un post-up sur D1
```

Sans annotation manuelle. Toutes les phrases sont dérivées de l'analyse
géométrique et tactique des positions, des profils joueurs, et de la
couverture défensive choisie par le coach.
