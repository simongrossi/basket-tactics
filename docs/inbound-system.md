# Système de remises en jeu (BLOB / SLOB)

> **Statut 2026-05-16** : 🟢 100% livré. 17 templates + 4 modes
> défensifs + timer 5s live + 3 diagnostics coach + box-out V2 animé
> + pression visuelle. Cycle complet de la rentrée de balle au tir.

## Vue d'ensemble

Permet au coach d'**étudier les remises en jeu** comme des situations
tactiques à part entière : passeur hors-ligne, contraintes de 5
secondes, choix défensif (man / face-guard / deny-deny / zone-press),
templates classiques BLOB et SLOB.

3 zones FIBA modélisées via `step.context` :
- `'inbound-baseline'` — BLOB (Baseline Out-Of-Bounds), passeur
  derrière la ligne de fond
- `'inbound-sideline-low'` — SLOB côté offensif (touche basse,
  au niveau du free throw line)
- `'inbound-sideline-high'` — SLOB côté défensif (transition,
  advance the ball)

---

## Modules

| Fichier | Rôle |
|---|---|
| `src/lib/types/index.ts` | Types `InboundSide`, `InboundDefenseMode` |
| `src/lib/logic/inboundSetup.ts` | `buildInboundSetup(side)` — positions canoniques par zone |
| `src/lib/logic/inboundDefenseSetup.ts` | `buildInboundDefenseSetup({ off, inbounder, mode, hoop })` |
| `src/lib/data/inboundTemplates.ts` | 17 templates : 6 BLOB + 5 SLOB bas + 4 SLOB haut + 3 "défense d'attaque" |
| `src/lib/state/transforms/stepTransforms.ts` | Setters `convertStepToInbound(s, side)`, `setInboundDefenseMode(s, mode)` |
| `src/lib/logic/coachDiagnostics/rules/inboundFiveSec.ts` | Règle coach : info/warning/critical sur scénarios incomplets ou trop longs |
| `src/lib/logic/coachDiagnostics/rules/inboundDefense.ts` | Règle coach défensive : pression passeur, deny receveur, attaquants ouverts |
| `src/lib/logic/coachDiagnostics/rules/boxOutCheck.ts` | Règle coach box-out sur phases de rebond (heuristique label / context LF précédent) |
| `src/lib/logic/match/gameLoop.ts` | Timer 5s live (`inboundTimerMs`) + box-out V2 animé (`boxOutTargets + boxOutStartedAtMs`) |
| `src/components/CourtView.tsx` | Overlays badge "⏱ BLOB/SLOB · 5s" + 🔥 pression sur défenseur passeur + 🚫 DQ |

---

## 17 templates classiques

### BLOB (6 templates)

| ID | Nom | Mécanique |
|---|---|---|
| `blob-box-curl` | BLOB · Box curl | Box 4-coins, double pin-down (O4+O5) pour curl O3 wing droit |
| `blob-stack-cross` | BLOB · Stack cross | Thin Box 2-2, split corners + back-cut O2 vers panier |
| `blob-triangle` | BLOB · Triangle | Triangle 2-1-2, pin-down O4 sur O2 wing gauche |
| `blob-zipper` | BLOB · Zipper | Cut vertical O3 via écran O4 au coude, top du cercle |
| `blob-elevator` | BLOB · Elevator | Spurs : 2 portes (O4, O5) au coude, O3 cut entre, portes ferment |
| `blob-hawk` | BLOB · Hawk | Atlanta : O5 down-screen pour O2 wing, puis slip vers panier |

### SLOB bas (5 templates)

| ID | Nom | Mécanique |
|---|---|---|
| `slob-stagger` | SLOB · Stagger ball-side | O4+O5 stagger pour O3 (shooter weak-side) qui curl ball-side |
| `slob-hammer` | SLOB · Hammer | Back screen weak-side O4 sur D3, O3 cut baseline corner faible, skip pass O2 |
| `slob-iverson` | SLOB · Iverson cut | Cut horizontal entre 2 gates (O4, O5), ressort ball-side mid-range |
| `slob-floppy` | SLOB · Floppy gauche | O2 sous panier choisit côté gauche, curl autour O4, 3-pt wing gauche |
| (variantes "défense d'attaque" listées plus bas) | | |

### SLOB haut (4 templates)

| ID | Nom | Mécanique |
|---|---|---|
| `slob-high-outlet` | SLOB haut · Outlet transition | Premier template haut. Outlet à O2, advance à O5 en course intérieure |
| `slob-high-drag` | SLOB haut · Drag screen | Outlet à O2 qui advance + drag screen O5 mi-terrain, mid-range / roll |
| `slob-high-quick` | SLOB haut · Quick advance | Pédagogie : ne dribble pas. Long pass direct à O5 déjà parti vers panier |
| `slob-high-trap-break` | SLOB haut · Bypass trappe | Anti-presse : O4 monte ball-side recevoir, O2 cut derrière, advance |

### Défense d'attaque (3 templates pédagogiques)

| ID | Nom | Mécanique |
|---|---|---|
| `blob-box-vs-face-guard` | BLOB Box vs Face-guard | Box offense + face-guard sur O3 receveur principal |
| `blob-stack-vs-zone-23` | BLOB Stack vs Zone 2-3 | Stack offense + zone 2-3 (2 top + 3 back paint) |
| `slob-hammer-vs-press` | SLOB Hammer vs Zone-press | Hammer offense + zone-press (trap passeur + denials + sweeper) |

---

## Modes défensifs

```ts
type InboundDefenseMode = 'man' | 'face-guard' | 'deny-deny' | 'zone-press';
```

| Mode | Logique |
|---|---|
| `'man'` | Standard, défenseur entre attaquant et panier (38 px de l'attaquant). |
| `'face-guard'` | Le défenseur du receveur principal (= attaquant le plus proche du passeur) en deny. Autres en man. |
| `'deny-deny'` | TOUS les défenseurs sur les lignes de passe directes entre leur homme et le passeur (20 px du receveur). |
| `'zone-press'` | 2 défenseurs sur le passeur (trap), 2 denials, 1 sweeper arrière au centre. |

UI : section "🛡 DÉFENSE SUR REMISE" dans StepsPanel, visible
uniquement sur step inbound. 4 boutons.

---

## Diagnostics coach

3 règles dédiées :

### `inboundFiveSecRule`

Analyse offensive du scénario de remise.

| Verdict | Severity | Trigger |
|---|---|---|
| `inbound-incomplete` | 🔴 critical | Step inbound est le dernier de la timeline |
| `inbound-no-pass` | 🟠 warning | Aucune passe de l'inbounder dans les steps suivants |
| `inbound-5s-overflow` | 🔴 critical | Durée estimée > 5s (passStepOffset × `secondsPerStep`) |
| `inbound-5s-info` | 🔵 info | Tout va bien, affiche la durée estimée |

### `inboundDefenseRule`

Analyse défensive de la couverture du step inbound.

| Verdict | Severity | Trigger |
|---|---|---|
| `inbound-no-pressure` | 🟠 warning | Aucun défenseur à < 50 px du passeur |
| `inbound-no-deny` | 🟠 warning | Receveur principal sans deny (def hors-ligne > 80 px) |
| `inbound-too-many-open` | 🔴 critical | > 2 attaquants à > 80 px de leur défenseur |
| `inbound-defense-ok` | ✓ good | Aucun défaut détecté |

### `boxOutCheckRule`

Détecte les phases de rebond (heuristique label "rebond/course/manqué"
OU step précédent context `free-throw`) et vérifie le box-out
géométrique de chaque défenseur.

| Verdict | Severity | Trigger |
|---|---|---|
| `box-out-missing` | 🟠 warning | ≥ 1 défenseur a `distFromHoop > attDistFromHoop + 8 px` |
| `box-out-ok` | 🔵 info | Tous les défenseurs sont devant leur homme |

---

## Live mode — game loop integration

### Timer 5s violation

- Champ `MatchState.inboundTimerMs: number | null`
- Initialisé à 5000 si `step.context` commence par `'inbound-'`
- Décompté à chaque tick en mode live
- Désarmé (= null) dès qu'un intent `'pass'` se déclenche sur le porteur
- Si atteint 0 sans passe → `outcome = 'turnover-pass'` + event log
  "⚠ Violation 5s remise"

### Box-out V2 animé

- Champs `boxOutTargets: Partial<Record<DefenderId, Point>> | null` +
  `boxOutStartedAtMs: number | null`
- Posés au moment de `resolveShot` (au lieu de snapper instantanément)
- `handleTransitionPause` lerp ease-out cubic sur 500 ms vers les
  targets pendant la pause de transition
- Désarmés à la fin de la pause

### Pression visuelle

Overlay SVG sur le défenseur du passeur quand `step.context` inbound :
- Anneau pulsant rouge (r 22→28→22 sur 1.2 s)
- Étiquette "🔥 presse" au-dessus
- Détection automatique : matched ou plus proche si pas de matchup

---

## UI

### StepsPanel

- Boutons "⏱ BLOB / SLOB bas / SLOB haut" (création d'un step inbound)
- Badge "⏱ BLOB" / "⏱ SLOB" sur les steps inbound dans la liste
- Section rouge "🛡 DÉFENSE SUR REMISE" sur step inbound actif
  (4 boutons mode défensif)

### CourtView

- Badge "⏱ BLOB/SLOB · 5s" au-dessus du passeur
- Anneau pulsant rouge + 🔥 sur défenseur du passeur
- Overlay rouge "DQ" sur joueurs disqualifiés (F.4)

### LiveMatchOverlay / LiveMatchPanel

- Countdown "⏱ remise 5s" remplace le shot clock pendant phase inbound
- Pulse rouge < 2s
- En mode plein écran : countdown dans le HUD compact

---

## Tests

Couverture : ~30 tests dédiés.

- `inboundSetup.test.ts` — positions canoniques
- `inboundDefenseSetup.test.ts` — 4 modes défensifs
- `inboundFiveSec.test.ts` — 7 cas (info, no-pass, incomplete,
  overflow, durée OK, ciblage, hors-inbound)
- `inboundDefense.test.ts` — 5 cas (3 checks + ok + hors-inbound)
- `boxOutCheck.test.ts` — 4 cas (no-op, F.2 rebond, OK vs missing,
  heuristique label)
- `gameLoop.test.ts` (timer + box-out V2) — 9 cas

Invariants moteur respectés (Règle 1 MIN_CLEARANCE, saut max 5.5 m,
anti-téléport 18 px/frame en live) : validés automatiquement sur les
17 templates inbound par les invariants existants.

---

## Workflow utilisateur

1. **Charger** un template inbound depuis la bibliothèque (17 choix)
   OU **convertir** un step existant via les boutons "⏱ BLOB / SLOB..."
2. **Choisir un mode défensif** dans la section "🛡 DÉFENSE SUR
   REMISE" (man / face-guard / deny-deny / zone-press)
3. **Animer** les étapes manuellement OU **lancer le mode live** pour
   voir le timer 5s décompter
4. **Lire les diagnostics coach** : info / warning / critical sur le
   panneau "Lecture coach"
5. **Sur fin de session** : 📼 voir replay détaillé pour analyse

---

## Reste / extensions possibles

- **Templates plus rares** : Box-out tactique offensif, Hand-back DHO,
  Steal-and-go, formations spécifiques aux remises arbitrales
- **Diag défensif plus fin** : détection spécifique par mode (ex
  "deny-deny laisse O3 libre car D3 mal positionné")
- **Box-out auto post-shot ENGINE-LEVEL** : couche défensive
  `boxOutLayer` qui s'applique à TOUS les rebonds (pas seulement
  inbound + LF post-lancer), via une nouvelle couche dans le pipeline
  `effectiveDefensePositions`. V1 actuel = coach diagnostic uniquement.
- **Compteur 5s côté défense** : visualiser la pression intensifiée
  quand `inboundTimerMs <= 2000` (ex : anneau plus large)
