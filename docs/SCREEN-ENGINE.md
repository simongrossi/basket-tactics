# Moteur physique d'écran — principes inviolables

**À lire avant toute modification du pipeline d'écran.** Ce document
liste les **règles impératives**, les **patterns interdits**, et les
**invariants** qui ne doivent **jamais** être cassés. Chaque ligne ici
représente un bug déjà rencontré et corrigé — toute régression est un
retour en arrière, pas une avancée.

> Référencé par [CLAUDE.md](../CLAUDE.md) comme règle projet.
> Complémentaire à [docs/PLAYER-CLEARANCE.md](PLAYER-CLEARANCE.md)
> (anti-superposition absolue).

---

## 🛡 Règle #0 — anti-superposition absolue (rappel)

**Aucun joueur ne peut chevaucher un autre joueur.** Voir
[PLAYER-CLEARANCE.md](PLAYER-CLEARANCE.md) pour le détail.

Cette règle s'applique aussi pendant l'animation d'un écran. Le poseur
ne peut pas se superposer au porteur, le défenseur du porteur ne peut
pas se superposer au poseur (même quand "stuck on screener"), etc.

`PLAYER_MIN_CLEARANCE_PX = 34` (= 2 × rayon sprite + 2 px de marge).

---

## 🏗 Architecture — où vit la logique d'écran

### Briques en lecture seule (helpers purs)

| Fichier | Rôle |
|---------|------|
| `src/lib/logic/screens/detectCarrierScreen.ts` | `detectScreen()` — détecte un écran porteur (poseur ≤ `screenRadius` du défenseur du porteur) |
| `src/lib/logic/screens/detectOffBallScreens.ts` | écrans hors-ballon (stagger, elevator, flex, hammer, flare, pin) |
| `src/lib/logic/screens/carrierScreenAdjust.ts` | `applyScreenAdjustment()` — repositionne le défenseur du porteur selon `screenRule` (over/hedge/under/drop/blitz/ice/weak/peel-switch/switch) |
| `src/lib/logic/screens/offBallScreenAdjust.ts` | repositionnement défenseur du cutter (chase, top-lock, over, switch, bump) |
| `src/lib/logic/screens/helpers.ts` | `pushOutOfScreener` / `pushOutOfCarrier` — push-out de clearance |
| `src/lib/logic/screens/detectImminentScreen.ts` | C.4 pre-rotation — détecte un poseur en approche |
| `src/lib/logic/screens/hedgeStepCounter.ts` | C.3 hedge length — compteur consecutive hedge |
| `src/lib/logic/screens/detectRejectedScreen.ts` | B2 reject — détecte le porteur qui vire opposé |
| `src/lib/logic/screens/detectSnakeDribble.ts` | B4 snake — détecte V sur 3 steps |
| `src/lib/logic/screenPhysics.ts` | `screenContactT/Phase/Adhesion/TangentRelease` — easing sigmoïdal qui FIGE D1 sur le poseur |
| `src/lib/logic/screens.ts` | barrel (ré-export) |

### Pipeline d'application

```
state.steps[N].off + matchups
    ↓
[buildDefenseFrameContext]  — détecte écran, calcule effectiveScreenRule
    ↓
[applyBaseTargetsLayer]      — cible homme-à-homme + applyScreenAdjustment
    ↓
[applyRimProtectionLayer]    — pas d'easy basket
    ↓
[applyPnRRotationsLayer]     — low-man tag + X-out + nail stunt
    ↓
[applyOffBallScreenLayer]    — écrans hors-ballon
    ↓
[applyTrapLayer]             — trap auto
    ↓
[applyPostCoverageLayer]     — dig/double sur pivot (B6)
    ↓
[applyDirectiveLayer]        — directives scriptées
    ↓
[applyCutterBumpLayer]       — bump auto sur cutters (B10)
    ↓
[applyPostPassOrientationLayer] — recalcul orientation final
    ↓
positions (DefenderTarget par défenseur)
    ↓
[effectiveDefensePositions]  — speed constraint + resolvePlayerCollisions
    ↓
ComputedDefense (cible idéale FINAL avec clearance garantie au step)
    ↓
[resolveFrameAt]             — interpolation entre 2 steps avec freeze écran
    ↓
PlaybackFrame (positions à un instant t de la lecture)
```

**Règle : ne JAMAIS court-circuiter cette chaîne.** Si tu écris une
nouvelle couche, insère-la en respectant l'ordre. Toute nouvelle
fonction qui écrit une position doit déclencher `resolvePlayerCollisions`
en aval.

---

## 🎯 Règles impératives — détection d'écran

### À RESPECTER

✅ **`detectScreen` est PUR** : prend positions + matchups + screenRadius,
retourne `DetectedScreen | null`. Pas d'effet de bord, pas de cache.

✅ **`forcedScreener` est l'override autoritatif** : si défini sur un
step, force ce joueur comme poseur même s'il est géométriquement loin
du défenseur du porteur. Utilisé pour les annotations utilisateur et
les templates dev.

✅ **À step 0 (édition libre), utilise `buildStep0DetectionPositions`** :
substitue les positions homme-à-homme idéales aux homepos pour que la
détection trouve les poseurs. Sinon en édition libre aucun écran n'est
jamais détecté.

✅ **Filtre `hasScreenIntent`** : si le poseur candidat s'éloigne de
sa cible (carrierDef) avec une velocity ≥ 5 px entre prev/cur, c'est un
écran "fantôme" (croisement), pas une pose — REJETER.

### À INTERDIRE

❌ **Ne pas modifier `state.steps[i]` depuis `detectScreen`.** Les
helpers de détection sont purs ; toute mutation crée des effets
incompréhensibles plus tard.

❌ **Ne pas faire dépendre la détection de `computeDefenseTargets`
récursivement.** Toute fonction de détection qui regarde plusieurs
steps doit utiliser une APPROXIMATION (positions homepos / overrides),
jamais re-déclencher le calcul défensif complet. Cf. pattern
`approxDefenderPositions` dans `hedgeStepCounter.ts`.

❌ **Ne pas baser une décision d'écran sur les positions
INTERPOLÉES** (mid-frame). La détection doit utiliser uniquement les
positions DES STEPS (endpoints stables). Sinon le badge "écran" flicke
pendant le scrub.

❌ **Ne pas changer `screenRadius` par défaut** (= 35 px). Très sensible :
< 35 → écrans rarement détectés ; > 50 → faux positifs en file & cuts.

---

## 🎬 Règles impératives — réponse à un écran (applyScreenAdjustment)

### À RESPECTER

✅ **Le défenseur du porteur (carrierDef) est PLAQUÉ AU POSEUR**, pas
collé au porteur, dès qu'un écran est détecté. La distance carrierDef
↔ poseur dépend de `quality` (q=0 → léger décalage, q=1 → stuck à
`MIN_PLAYER_CLEARANCE_PX` exactement).

✅ **`pushOutOfScreener` et `pushOutOfCarrier` sont OBLIGATOIRES** à
la fin de chaque branche de rule. Garantit la clearance même si
l'amplitude calculée est < `MIN_PLAYER_CLEARANCE_PX`.

✅ **Le hedge dissocie `quality` et `hedgeAggression`** (B3) :
- `quality` = qualité offensive de l'écran (0..100)
- `hedgeAggression` = agressivité défensive du show (0..100)
- Les deux axes sont INDÉPENDANTS : un écran ghost (q=0) avec hard
  hedge (agg=100) doit voir D5 sortir agressif, même si l'écran ne
  "prend" pas.

✅ **À `quality = 0` (ghost), l'ajustement est quasi-nul** : D1 garde
sa cible homme-à-homme. C'est une "annotation visuelle sans contact".

✅ **À `quality = 100` (lockdown), D1 est STRICTEMENT plaqué au
poseur** : distance ≤ `MIN_PLAYER_CLEARANCE_PX + 1`.

### À INTERDIRE

❌ **Ne PAS modéliser la pénalité d'écran via la vitesse seule** :
clamper la vitesse de D1 sans changer sa cible le fait atterrir sur
une ligne droite arbitraire qui ne passe pas par le poseur. Le bon
endroit pour modéliser un écran = la CIBLE de D1 (= sur/derrière le
poseur), pas sa vitesse. Cf. plan refonte mai 2026.

❌ **Ne PAS appliquer `applyScreenAdjustment` quand `rule === 'switch'`** :
le switch est un swap de matchups, pas un repositionnement.

❌ **Ne PAS oublier l'invariant "screen détecté ⇒ D1 plaqué au poseur"
pour les non-`carrierDef`/`screenerDef`.** Les autres défenseurs ne
sont pas affectés par `applyScreenAdjustment` (ils gardent leur stance
homme-à-homme + help bias). Le câblage est dans `baseTargets.ts`.

---

## 🎭 Règles impératives — animation (resolveFrameAt)

### À RESPECTER

✅ **Lerp linéaire par défaut entre `step.off[idxA]` et
`step.off[idxB]`** pour les attaquants sans annotation (idle). Si on
garde uniquement `cur.off`, l'attaquant SNAPPE de la totalité du delta
au boundary final (bug f435/436 = jusqu'à 141 px).

✅ **`curveAroundObstacle` (Bezier) pour `cut`, `idle`, `dribble`** —
pas pour `screen` (le poseur DOIT atteindre sa position de pose, pas
l'éviter).

✅ **Obstacles construits depuis les ENDPOINTS UNIQUEMENT** (offA/defA
+ offB/defB), pas depuis les positions interpolées intermédiaires.
Sinon `screenerObstacles` apparaît/disparaît mid-segment et fait
flicker `curveAroundObstacle` (bug `systeme_basket-8`).

✅ **`screenLockedDefenders` skip `followDefendersAtFrame`** : un
défenseur en contact d'écran ne doit pas suivre son homme normalement
pendant le freeze. La lerp avec le time-remap sigmoïdal (`screenContactT`)
gère la trajectoire.

✅ **Push-out single-pass après l'adhésion** pour les défenseurs en
screen lock (cf. PLAYER-CLEARANCE.md niveau 3b). Compense la lerp qui
peut dipper sous clearance même quand les endpoints sont propres.

✅ **Anti-superposition attaquant↔attaquant pendant l'interpolation**
(frameResolver étape 1.b). Itère `pushOutOfMany` sur les attaquants
interpolés. Sinon deux attaquants dont les trajectoires se croisent
sont empilés à mi-segment (bug `systeme_basket-10`).

### À INTERDIRE

❌ **Ne PAS skip `screenLockedDefenders` dans `resolvePlayerCollisions`
si le push-out manque ailleurs.** Le skip existe pour anti-flicker
mais la clearance est compensée par le push-out single-pass dans
l'adhesion (cf. ci-dessus). Toute suppression de ce push-out doit
être compensée par un autre mécanisme.

❌ **Ne PAS ajouter d'annotation de mouvement (`cut`/`dribble`)
redondante avec le lerp idle.** Les annotations ont une CONVENTION
de timing : `absStart = checkIdx + tStart`, donc une annotation sur
le step N drive transition N→N+1 (= part de N et va vers N+1). Si
tu mets `from = step[N].off` et `to = step[N+1].off`, l'annotation
duplique l'idle lerp = identité, OK. Mais si `from = step[N-1].off`
(intention "drive transition N-1→N"), elle SNAPPE le joueur à
`from` au début de sa fenêtre. Bug typique du Lab dev.

❌ **Ne PAS utiliser un `forcedPushSign` qui n'est pas STABLE
pendant la transition.** Si le côté de la courbe Bezier flippe
mid-segment, D1 saute de 60-120 px. Cf. fix `screenMode === 'stuck'`
dans frameResolver qui ancre le côté sur defA.

❌ **Ne PAS round les positions intermédiaires** (sous-pixel
nécessaire pour la fluidité). Le moteur consomme des floats jusqu'au
rendu SVG final. `Math.round` cumulé sur 60 frames = bruit visible.

---

## 🔬 Règles impératives — animations spécifiques par mode d'écran

### Stuck (D1 plaqué au poseur, milieu de contact)

✅ **Anchor du point de contact = `midpoint(defA, defB)`** (pas la
lerp courante). Sans ancrage stable, contactPoint flip de côté
quand le poseur traverse l'axe defA→defB pendant le segment, D1
saute visuellement.

✅ **`forcedPushSign` aligné sur le côté de defA** : où D1 est
déjà → où il restera. Pas de flip pendant le contournement.

### Arriving (D1 arrive au contact à la fin du segment)

✅ **Anchor = defB** (position stuck à la fin). D1 va vers le
contact, le côté est fixé par où il se retrouvera plaqué.

### Leaving (D1 sort du contact au début du segment)

✅ **Anchor = defA** (position stuck au début).

✅ **`allowCurve = false`** : pendant la phase 'leaving',
`curveAroundObstacle` ne s'applique PAS. D1 sort en ligne droite
vers sa nouvelle cible. La Bezier en recovery faisait orbiter D1
vers le côté opposé au stuck point (bug "rattrape à l'opposé").

✅ **`tangentReleasePoint`** pour la sortie tangentielle : D1 ne
sort pas radialement (= droit dans le porteur) mais sur la tangente
du cercle du poseur, côté oppose au panier.

---

## 🎚 Settings opt-in liés aux écrans

| Setting | Couche | Default | Effet |
|---------|--------|---------|-------|
| `screenRule` | global | `hedge` | Réponse défensive par défaut (over/hedge/under/drop/switch/blitz/ice/weak/peel-switch) |
| `screenRadius` | global | 35 | Seuil de détection (px) |
| `hedgeAggression` | global | 50 | B3 — agressivité du hedge sur D5 (indépendant de quality) |
| `dropDepth` | global | medium | Profondeur du drop (shallow/medium/deep) |
| `offBallScreenRule` | global | over | Réponse défensive par défaut sur écran hors-ballon |
| `hedgeRecoveryDelay` | global | undefined | C.3 — nb steps consécutifs avant recover forcé en hedge (1..3) |
| `tagThenSwitchEnabled` | global | false | C.5 — bascule switch implicite si roller proche panier |
| `preRotationEnabled` | global | false | C.4 — shift carrierDef 10 px vers un poseur imminent |
| `unwindRejectedScreens` | global | false | B2 V2 — annule la couverture si reject SHARP détecté |
| `snakeKeepCoverage` | global | false | B4 V2 — boost quality à 90 minimum si snake détecté |
| `switchPolicy` | global | `all` | B8 — granularité du switch (`all` / `1-3` / `1-4` / `none`) |
| `mismatchThreshold` | global | 2 | B1 — seuil scram switch |
| `scrammedSwitchEnabled` | global | false | B1 — active le scram switch correctif |
| `step.forcedScreener` | step | undefined | Force la détection sur un attaquant spécifique |
| `step.annotations[screen]` | step | undefined | Annotation visuelle (badge UI) — convention timing : drive transition N→N+1 |
| `rule.screenNav` | par défenseur | undefined | Override individuel de la rule globale |

**Règle : tout nouveau setting est OPT-IN (default falsy/undefined),
préserve le comportement legacy.** Pas de régression silencieuse.

---

## 🧪 Garde-fous (tests)

### Tests à NE JAMAIS supprimer

| Test | Fichier | Vérifie |
|------|---------|---------|
| `aucun chevauchement de joueurs aux étapes` | `invariants.test.ts` | Règle #0 sur les 7 playbooks classiques |
| `respect de la vitesse max des défenseurs` | `invariants.test.ts` | Pas de saut > vitesse × 1.65 + clearance |
| `attaquants : ≤ 5.5m par étape` | `invariants.test.ts` | Limite physique offensive |
| `D1 ne saute pas de côté à côté du poseur` | `screenContactFrame.test.ts` | Anti-flicker mid-segment (seuil 18 px) |
| `en leaving, D1 sort tangentiellement` | `screenContactFrame.test.ts` | Pas d'orbite autour du poseur en recovery |
| `INVARIANT aucun chevauchement` | `overlapInvariants.test.ts` | Règle #0 + cas pathologiques |
| `screenLabPlaybackJumps` | `screenLabPlaybackJumps.test.ts` | Pas de jump > 70 px frame-à-frame sur les Labs dev |
| `userJsonOverlap` | `userJsonOverlap.test.ts` | Cas reproducteur `systeme_basket-10.json` |
| `screenLabSanity` | `screenLabSanity.test.ts` | Engine cohérent sur chaque étape des Labs dev |

### Workflow recommandé

Avant tout commit qui touche au moteur d'écran :

```bash
# 1. Tests ciblés
npx vitest run src/lib/logic/__tests__/screens.test.ts
npx vitest run src/lib/logic/__tests__/screenContactFrame.test.ts
npx vitest run src/lib/logic/__tests__/overlapInvariants.test.ts
npx vitest run src/lib/logic/__tests__/userJsonOverlap.test.ts

# 2. Suite complète
npx vitest run

# 3. Validation visuelle dans les 4 templates dev
npm run dev → bibliothèque → 🧪 Lab PnR / Pindown / Flare / Cross
# - Naviguer step par step (boutons étape)
# - Lancer la lecture en boucle
# - Vérifier qu'aucun joueur ne se superpose à aucun moment
# - Vérifier qu'aucun joueur ne saute > 1 corps en 1 frame
```

---

## ⏱ Règle de réalisme — durée d'un système

**Une possession FIBA = 24 secondes au shot clock**, dont environ
**6s pour remonter la balle** → reste **18s d'action effective**.
Un système conçu pour le moteur ne doit JAMAIS dépasser cette
borne, sinon il est physiquement irréaliste.

`PLAYBACK_STEP_DURATION_MS = 2000` (2s par transition).

| Système type | Steps | Transitions | Durée |
|--------------|-------|-------------|-------|
| Action courte (PnR roll) | 4-5 | 3-4 | 6-8s |
| Action moyenne (snake) | 4-5 | 3-4 | 6-8s |
| Action enchaînée | 6-7 | 5-6 | 10-12s |
| **MAXIMUM ABSOLU** | **10** | **9** | **18s** |

### À RESPECTER

✅ **Tout nouveau template = ≤ 10 steps.** Verrouillé par le test
`aucun Lab dev ne dépasse 18 secondes` dans
`screenLabSanity.test.ts`.

✅ **Préférer 4-6 steps par scénario** (= 6-10s d'action). Un
public-and-roll réel s'exécute en 3-5 secondes ; une action complète
NBA-classique en 8-12s.

✅ **Si un test multi-scénarios est nécessaire, SPLITTER en
plusieurs templates focalisés** plutôt qu'un gros système.
Exemple Lab PnR (5 steps) + Lab Snake (4 steps) + Lab Reject (3 steps)
au lieu d'un seul Lab à 8 steps.

### À INTERDIRE

❌ **Pas de système > 18 secondes.** Si tu as besoin de plus, le
scénario n'est pas une possession — c'est plusieurs séquences, à
modéliser comme plusieurs systèmes.

❌ **Pas de "padding" avec des steps statiques** ("setup neutre"
sans action). Démarrer directement à la position d'action.

---

## 🚧 Limites connues et chantiers ouverts

### Limites acceptées

- **Jumps résiduels 30-70 px côté défense** quand la détection
  d'écran s'active/se désactive mi-transition. Visible mais pas
  dramatique. Chantier : smoother les transitions d'état d'écran
  via interpolation de `screenLockedDefenders` plutôt que skip
  binaire.
- **`systeme_basket-8` scenario extrême** : 13 px de secousse
  côté D1 quand le poseur se déplace de 138 px entre 2 steps.
  Trade-off documenté inline (seuil test 18 px vs 5 px).

### Bugs résolus mai 2026 (NE JAMAIS REGRESSER)

| Bug | Symptôme | Fix |
|-----|----------|-----|
| Anti-superposition manquant attaquants ↔ attaquants | O3 draggé sur O1 = empilé | `pushOutOfOtherPlayers` dans `playerMove.ts` |
| Anti-superposition manquant frame interpolation | Trajectoires croisées (systeme_basket-10) = empilés à mi-segment | étape 1.b dans `resolveFrameAt` |
| Exception "matched coller" | D peut superposer son O matched | Suppression dans `resolvePlayerCollisions` |
| Adhesion screen produit overlap | D1 stuck à 30-32 px du poseur | Single-pass push-out après adhesion |
| Idle lerp absent | Attaquant snappe au boundary | Fix `attackerTrajectoryAt` fallback |
| Annotation `screen` snappe à `from` | Joueur revient en arrière au début de fenêtre | Convention documentée + utilisation `forcedScreener` à la place |
| Galerie d'écran téléporte inter-scène | Sauts > 200 px à chaque boundary | Split en 4 templates dev continus |
| Push-out après dribble linéaire | Téléport 30 px quand trajectoire passe sur un joueur | Curve avoidance étendue à `dribble` |

---

## 📚 Pour aller plus loin

- **Cartographie générale du moteur** : [docs/GAME-ENGINE.md](GAME-ENGINE.md)
- **Anti-superposition** : [docs/PLAYER-CLEARANCE.md](PLAYER-CLEARANCE.md)
- **Refactorings historiques** : [docs/refactoring-history.md](refactoring-history.md)
- **Roadmap des concepts défensifs C.*/F.\*** : [ROADMAP.md](../ROADMAP.md)
- **Changelog technique** : [CHANGELOG.md](../CHANGELOG.md)
