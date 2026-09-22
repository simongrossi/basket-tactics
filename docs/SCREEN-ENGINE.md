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
| `src/lib/logic/defense/helpStepCounter.ts` | C.2 help-and-recover — compteur consecutive help |
| `src/lib/logic/defense/helpStickyLayer.ts` | C.2 help-and-recover — couche 1.6 (blend decay) |
| `src/lib/logic/screens/detectScreenChain.ts` | C.7 action chains — 3 patterns (re-screen, stagger, flare-fade) |
| `src/lib/logic/coachDiagnostics/rules/screenChain.ts` | C.7 — règle coach (warning/info selon pattern) |
| `src/lib/logic/defense/chainResponseLayer.ts` | C.7 V2 — couche 2.5 réaction défensive aux chaînes |
| `src/lib/logic/screens/detectRejectedScreen.ts` | B2 reject — détecte le porteur qui vire opposé |
| `src/lib/logic/screens/detectSnakeDribble.ts` | B4 snake — détecte V sur 3 steps |
| `src/lib/logic/defense/detectBlitzRelease.ts` | #8.1 — détecte le ballon qui ressort d'un blitz (carrier changé après un blitz N-1) |
| `src/lib/logic/defense/pickWeakSideAnchor.ts` | #8.2 — désigne l'ancre weak-side (auto low man ou override coach) |
| `src/lib/logic/blitzReleaseEasing.ts` | #8.1 — ease-out cubique de relâche du blitz (frameResolver) |
| `src/lib/logic/screenPhysics.ts` | `screenContactT/Phase/Adhesion/TangentRelease` — easing sigmoïdal qui FIGE D1 sur le poseur |
| `src/lib/logic/constraintSolver.ts` | solveur unifié point/obstacles/demi-plan + collisions multi-entités |
| `src/lib/logic/screens.ts` | barrel (ré-export) |

### Pipeline d'application

```
state.steps[N].off + matchups
    ↓
[buildDefenseFrameContext]  — détecte écran, calcule effectiveScreenRule
    ↓
[applyBaseTargetsLayer]      — cible homme-à-homme + applyScreenAdjustment
    ↓
[applyWeakSideAnchorLayer]   — couche 1.4 ancre weak-side (#8.2, opt-in)
    ↓
[applyRimProtectionLayer]    — pas d'easy basket
    ↓
[applyHelpStickyLayer]       — C.2 sticky help avec decay
    ↓
[applyPnRRotationsLayer]     — low-man tag + X-out + nail stunt
    ↓
[applyChainResponseLayer]    — C.7 V2 réaction aux chaînes d'écrans
    ↓
[applyBlitzReleaseLayer]     — couche 2.6 relâche du blitz (#8.1, opt-in)
[rate limiter playback]      — couches 1.c (attaquants) + 5.b (défenseurs)
                               quand `options.prevFrame` est fourni
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

✅ **Évitement offensif fidèle au tracé et au timing** : consommer la `route`
(path + progression après remap) retournée par `attackerTrajectoryAt`. Ne pas
remplacer ce résultat par une courbe `offA → offB` au temps global du segment.
`avoidAttackerRoute` corrige la portion entre deux points de passage ; les
solveurs de collision restent appliqués en aval. Les déviations anticipatives
sont désactivées avant le départ et après l'arrivée, y compris en mode CVT.

✅ **Poseur set = obstacle solide** : dès que `attackerIsScreening[id]`
est true, le poseur ne passe plus dans le solveur attaquant↔attaquant
et n'est plus clampé par le rate limiter attaquant. Il reste exactement
au point `ann.to`; les autres joueurs doivent contourner ce point.

✅ **Obstacles construits depuis les ENDPOINTS UNIQUEMENT** (offA/defA
+ offB/defB), pas depuis les positions interpolées intermédiaires.
Sinon `screenerObstacles` apparaît/disparaît mid-segment et fait
flicker `curveAroundObstacle` (bug `systeme_basket-8`).

✅ **Cache segmentaire du resolver** : les données stables sur un segment
`idxA → idxB` sont calculées une seule fois par état : matchups A/B,
contextes écran A/B, contextes de sortie, et obstacles de poseurs. La
détection courante interpolée reste recalculée par frame car elle dépend
de `localT`. Le test `frameResolverSegmentCache.test.ts` compare le
résultat avec et sans cache sur les scénarios écran clés.

✅ **`screenLockedDefenders` skip `followDefendersAtFrame`** : un
défenseur en contact d'écran ne doit pas suivre son homme normalement
pendant le freeze. La lerp avec le time-remap sigmoïdal (`screenContactT`)
gère la trajectoire.

✅ **Push-out single-pass après l'adhésion** pour les défenseurs en
screen lock (cf. PLAYER-CLEARANCE.md niveau 3b). Compense la lerp qui
peut dipper sous clearance même quand les endpoints sont propres.

✅ **Solver collision dédié aux contacts écran** :
`pushOutOfScreenContact()` vit dans `screenCollision.ts`. Il remplace
le push radial local quand un seul cluster d'écran a déclenché la
Bezier. Si le push radial ferait traverser le segment defA→defB vers
le cluster, le résultat est mirrorré du côté stable. En cas de stagger
ou de côté non fiable, le solver retombe volontairement sur
`pushOutOfMany`.

Important : dans un cluster géométriquement impossible (pas de point
qui satisfasse toutes les clearances sans changer brutalement de côté),
ce solver privilégie la continuité du côté stable plutôt qu'une
correction pleine distance en une frame. Le rate limiter playback et
les endpoints moteur prennent le relais pour éviter les snaps.

Depuis J.3a, `pushOutOfScreenContact()` délègue la projection à
`solvePointConstraints()` (`constraintSolver.ts`). Ce solveur est le
socle unique à étendre avant de migrer les autres push-out locaux :
obstacles, distance minimale par obstacle, demi-plan optionnel, et
direction de fallback en cas de point confondu.

Depuis J.3b, `pushOutOfMany()` délègue aussi à ce même socle. Les
solveurs historiques gardent leur API, mais le push radial simple,
les collisions finales et les ajustements qui appellent `pushOutOfMany`
partagent désormais le même moteur de projection.

Depuis J.3c, `resolvePlayerCollisions()` délègue à
`solveEntityCollisions()` : les défenseurs mobiles, les défenseurs
`screenLocked` fixes, et les attaquants obstacles sont résolus par le
même moteur de contraintes. Les wrappers historiques restent en place
pour préserver les appels existants, mais la logique itérative ne vit
plus dans `geometry.ts`.

✅ **Identité stable du contact** : `defenderScreenContact()` attribue
une `contactKey` logique (`carrier:D1:O1:O5` ou `off:D2:O2:O4+O5`).
Deux endpoints A/B ne sont considérés `stuck` que s'ils parlent du
même contact. Un écran O4 à A et un écran O5 à B deviennent une
transition `leaving`/`arriving`, jamais un faux stuck.

✅ **Hystérésis qualité** : entrer dans un contact demande un signal
plus fort que rester en contact. Les constantes vivent dans
`screenPhysics.ts` :

```typescript
SCREEN_CONTACT_ENTER_QUALITY = 12;
SCREEN_CONTACT_EXIT_QUALITY = 7;
```

Cela évite les oscillations lock/unlock sur les écrans faibles ou à la
limite de détection.

✅ **Hystérésis spatiale** : l'entrée d'un contact utilise le rayon
normal `state.screenRadius`, mais la sortie peut conserver le même
`contactKey` dans un rayon interne plus large :

```typescript
SCREEN_CONTACT_EXIT_RADIUS_MULTIPLIER = 1.28;
```

Ce rayon élargi n'autorise pas de nouveau contact. Il sert uniquement
à maintenir un contact déjà identifié à l'endpoint opposé, pour éviter
qu'un défenseur décroche/recolle quand il flotte à la limite du poseur.

✅ **Mémoire courte playback** : `PlaybackFrame.screenMemory` propage
par défenseur le `contactKey`, le poseur d'ancrage, le point de contact
et le `forcedPushSign` de la frame précédente. Cette mémoire n'est lue
que si `options.prevFrame` est fourni, donc uniquement pendant la
lecture continue. Le scrub pur reste sans mémoire et déterministe.

La mémoire ne peut stabiliser qu'un contact identique (`contactKey`
égale). Elle ne peut pas transformer un nouveau contact en ancien
contact.

✅ **Lecture, scrub et export avec mémoire synthétique commune** :
`resolveTimelineFrame()` reconstruit une séquence canonique de 60 sous-pas
par étape, indépendante des FPS du navigateur et de la vitesse de lecture.
Le hook `useCourtFrame` utilise ce point d'entrée pour les trois modes.
Seules les frames sur cette grille alimentent la mémoire : demander une
frame intermédiaire ou revenir en arrière ne change pas les calculs suivants.
L'easing est appliqué une seule fois dans le resolver bas niveau.

Le cache est borné à quatre états et quatre variantes diagnostiques par état.
Chaque entrée possède un snapshot isolé ; toute modification du contenu de
l'état invalide la séquence. Les frames retournées sont en lecture seule.
`resolveFrameAtDeterministicScrub()` reste disponible pour les tests historiques
qui choisissent explicitement une résolution synthétique. Son paramètre `fps`
désigne des sous-pas par étape, jamais la fréquence d'affichage du navigateur.

✅ **Route explicite** : chaque `FrameDecision` expose `routeKind`
(`over`, `under`, `hedge`, `chase`, `top-lock`, etc.). Le debug écran
doit toujours pouvoir montrer quelle route a produit le vecteur de
contournement et le `forcedPushSign`.

Les routes off-ball tiennent compte du type d'écran : un backscreen,
flex ou hammer force une préférence côté panier ; un flare distingue
chase côté ballon et under côté opposé ; un elevator force le passage
par le gap entre les deux poseurs. Les pindowns/staggers simples
gardent la route screener→cutter historique.

✅ **Contact off-ball avancé** :
- Sur un `stagger`, le point d'ancrage du contact glisse progressivement
  du premier poseur vers le second (`localT` 0.34→0.72). La sortie
  tangentielle se fait autour du poseur actif, pas autour d'un centroïde
  virtuel.
- Sur un `elevator`, le point de contact traverse le couloir physique
  entre les deux poseurs : centre du gap + normale de passage. La mémoire
  anti-flip ne verrouille pas ce passage, sinon elle empêcherait D2 de
  sortir de l'autre côté du gap.
- La mémoire de frame stocke maintenant `contactScreeners`,
  `activeScreener` et `contactProgress`. Le panneau debug joueur et les
  diagnostics anti-jump affichent ces informations pour vérifier qu'un
  double écran reste bien traité comme une seule séquence multi-contact.

Le défenseur du cutter ne revient donc pas sur son homme entre les deux
écrans : il reste en retard et traverse la chaîne comme un vrai chase
sur double écran.

✅ **Machine d'état écran centralisée** :
`resolveScreenContactState()` vit dans `screenPhysics.ts` et formalise
le cycle complet par défenseur :

```
approach → impact → stuck → navigate → recover → released
```

Le resolver n'invente plus une phase locale : il consomme le résultat
de la machine (`state`, `visualPhase`, `contactActive`, `released`).
`released` n'est émis qu'après un contact récent sans mode actif ; les
défenseurs neutres gardent `screenPhase = undefined`.

✅ **Diagnostic anti-jump réutilisable** :
`collectPlaybackJumpDiagnostics()` vit dans `playbackDiagnostics.ts`.
Il échantillonne le playback avec `prevFrame`, collecte les sauts
attaquants/défenseurs au-dessus d'un seuil et garde le diff de décision
écran (`screenMode`, `contactKey`, `routeKind`, `memoryUsed`,
`clusterId`, `pushMode`, etc.). Le test Screen Lab utilise ce helper au
lieu de dupliquer sa logique.

✅ **Profiling opt-in** : `resolveFrameAt(..., { profile: true })`
ajoute `frame.profile` avec `totalMs` et les phases `attackers`,
`screens`, `obstacles`, `defenders`, `collisions`, `rateLimiter`,
`ball`. Le profiling ne doit jamais être activé par défaut dans l'UI ;
il sert aux tests perf et aux outils debug.

✅ **Golden metrics playback** :
`collectPlaybackGoldenMetrics()` (`playbackGoldenMetrics.ts`) échantillonne
un scénario et exporte `maxAttackerJumpPx`, `maxDefenderJumpPx`,
`minPlayerClearancePx`, `screenContactFrames`, `averageResolveMs`. Les
tests golden valident ces métriques sur les scénarios écran canoniques
pour attraper les régressions invisibles aux tests unitaires purs.

✅ **Overlay debug écran** : `state.showScreenDebug` active un calque SVG
qui affiche mode, qualité, `contactKey`, poseur d'ancrage, cluster,
push mode et lock. Cet overlay est strictement diagnostique : il ne
doit jamais influencer la physique.

✅ **Panneau debug joueur** : quand `showScreenDebug` est actif et qu'un
ou plusieurs défenseurs sont sélectionnés, `ScreenPlayerDebugPanel`
affiche par défenseur `contactKey`, état/mode, route, qualité, mémoire,
push, cluster et `lastJumpPx`. `lastJumpPx` est alimenté par
`FrameDecision` quand `prevFrame` existe.

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
| `helpStickiness` | global | undefined | C.2 — nb steps de sticky help avec decay après disparition du trigger (1..3) |
| `readScreenChainsEnabled` | global | undefined | C.7 V2 — défense réagit aux chaînes (re-screen shift tangentiel, flare-fade gazeLock no-help). Diag V1 actif indépendamment via badges. |
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
| `screenStiffnessEnabled` | global | false | Pilier physique (047de9e) — amplifie la pénalité `screenContactPenalty` existante en phases impact/recover (`defense/speedConstraint.ts`). Cible D1 strictement préservée. |
| `screenStiffness` | global | 1.5 | Multiplicateur 1.0–3.0 du flag ci-dessus. Borne basse de la pénalité finale à 0.08 pour éviter la paralysie. |

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

- **`systeme_basket-8` scenario extrême** : ~13 px de secousse
  côté D1 quand le poseur se déplace de 138 px entre 2 steps.
  Bornée par le rate limiter (cf. ci-dessous).
- **CVT 1.3 : remplacement complet de `pushOutOfScreener`/`pushOutOfCarrier`
  par `repel` pur est INCOMPATIBLE avec ce moteur** — la Règle 1bis
  exige D1 strictement plaqué au poseur à quality 100
  (`dist ≤ MIN_PLAYER_CLEARANCE_PX + 1`). Un repel à falloff linéaire
  produit `dist = clearance + δ` avec `δ > 0`, ce qui casse
  l'invariant. Le moteur d'écran garde donc le push-out binaire.
  Ce qui est livré dans CVT 1.3 :
  - `screens/repelForces.ts` (infra) + couche
    `defense/screenRepelLayer.ts` (additive, cap 3 px) qui raffine
    la trajectoire des défenseurs **périphériques** (non
    carrier/screener/cutter/pnrRole) proches d'un poseur (écran
    porteur OU off-ball).
  - Test garde-fou
    `defense/__tests__/screenRepelLayer.test.ts` qui valide
    l'invariant Règle 1bis sur écran q=100 même flag on.

### C.7 — Action chains V1 (diagnostic + badge, livré 2026-05-13)

**Concept basket** : la défense doit LIRE la séquence (chaîne d'écrans),
pas juste chaque écran isolément. Sans cette lecture, elle se fait avoir
au 2ᵉ acte comme si c'était une surprise.

**Patterns V1 détectés** :
- `re-screen` : même paire (poseur, cutter) à N-2 et N, ABSENT à N-1
  (relâchement entre les 2 utilisations). Carrier OU off-ball.
- `stagger-sequential` : 2 poseurs DIFFÉRENTS successifs sur le même
  cutter en ≤ 2 steps (Floppy, flex stagger).
- `flare-then-fade` : écran flare à N-1 puis cutter fade vers un coin
  à N (∆dist au panier ≥ 20 px, |x - hoopX| > 200 ET y > 350).

**Implémentation** :
- Helper pur `screens/detectScreenChain.ts` : lookback 3 steps, retourne
  `ScreenChain | null` (cutter + screeners + steps clés). Aucun appel à
  `computeDefenseTargets` (utilise `approxDefenderPositions` pattern).
- Règle coach `coachDiagnostics/rules/screenChain.ts` : inscrite dans le
  registry. 3 sous-types de diag : `chain-re-screen` (warning),
  `chain-stagger` (warning), `chain-flare-fade` (info).
- Badges SVG dans `DetectionBadgesOverlay.tsx` : pastille violet
  (re-screen/stagger) ou bleu (flare-fade) avec icône 🔗 au-dessus du
  cutter, info-bulle hover.
- 2 labs dev focalisés : `🧪 Lab Chain re-screen` (3 steps = 4s) et
  `🧪 Lab Chain stagger` (3 steps = 4s).

**V2 livré 2026-05-13 (réaction défensive opt-in)** :
- Setting `state.readScreenChainsEnabled?: boolean` (opt-in, default false)
- Couche `chainResponseLayer.ts` (couche **2.5**, entre PnR et offBallScreens).
- Effet par pattern :
  - **re-screen** : carrierDef shifté TANGENTIELLEMENT 6 px côté hoop
    (perpendiculaire à `target → screener`, sens panier). Le shift survit
    au push-out de clearance car perpendiculaire. + `helpFactor` boosté
    à 0.5 minimum + `helpKind='active-help'` (rendu visuel renforcé).
  - **stagger-sequential** : NO-OP. La logique B9 `cutterScreenChain`
    bascule déjà automatiquement `top-lock → chase`. Préserve pour éviter
    le double-décalage.
  - **flare-then-fade** : cutterDef force `gazeLock: 'opponent'` (regard
    forcé sur le shooter qui fade vers le coin) + `helpTriggered=false`
    + `helpFactor=0` (no-help, suit le shooter).
- Garanties anti-régression :
  - ✅ Skip si `switchedThisStep` / `scrammedThisStep` / `onScreen` (flare)
  - ✅ Shift perpendiculaire = pas de violation de clearance
  - ✅ `resolvePlayerCollisions` en aval garantit la règle absolue
  - ✅ Tests invariants : 0 overlap + jump < 70 px frame-à-frame

**Garanties anti-régression V1** :
- ✅ Pas de modification de positions ni matchups (diag-only)
- ✅ Helper pur — tests `pure : 2 appels successifs == même résultat`
- ✅ Anti-récursion — test 10 calls successifs sans crash
- ✅ Anti-faux-positif — test sur 6 playbooks classiques

### C.2 — Help-and-recover timing (couche 1.6, livré 2026-05-13)

**Concept basket** : un défenseur en aide ne revient pas instantanément
sur son homme quand le trigger disparaît — il glisse progressivement
(1-3 steps = 2-6s à 2s/step).

**Implémentation** :
- Setting `state.helpStickiness?: number` (1..3, opt-in)
- Helper pur `helpStepCounter::consecutiveHelpSteps()` qui compte les
  steps précédents avec trigger d'aide actif (sans récursion via
  `computeDefenseTargets`)
- Couche `helpStickyLayer` (couche **1.6** du pipeline, entre
  rimProtection et pnrRotations) qui blend `prevHelpAim` avec la cible
  homme-à-homme courante via `blendFactor = 1 - consec/stickiness`
- Skip : défenseur déjà en aide courante / onScreen / pnrRole /
  switchedThisStep / scrammedThisStep (priorités respectées)

**Garanties anti-régression** :
- ✅ Anti-superposition : la position blendée passe par `resolvePlayerCollisions`
  en aval (règle absolue maintenue). Test invariant dédié.
- ✅ Anti-téléportation : decay LINÉAIRE (`1 - consec/stickiness`) → pas de
  saut brutal au passage `consec === stickiness`. Test dédié : max jump
  D3 frame-à-frame < 50 px.
- ✅ Anti-récursion : `consecutiveHelpSteps` n'appelle PAS
  `computeDefenseTargets` (utilise une approximation basée sur `detectTriggers`
  qui est pure). La couche elle-même appelle `computeDefenseTargets(N-1)`
  mais sur index décroissant → terminaison garantie.

### Rate limiter playback (couche 5.b, livré 2026-05-13)

**Problème** : malgré les fixes successifs (idle lerp + anti-superposition
+ adhesion smooth), des sauts résiduels 30-70 px subsistaient sur des
défenseurs mi-segment quand l'état d'écran changeait brutalement (détection
qui s'allume/s'éteint, Bezier qui flip de côté, adhesion qui change de
blend, curveAroundObstacle dont le cluster bouge).

**Fix** : `resolveFrameAt` accepte un `options.prevFrame` ; quand fourni
(= sous-pas précédent de la reconstruction canonique), un
**rate limiter** clamp le delta inter-frame à :
- `MAX_DEFENDER_JUMP_PX = 18` (couche 5.b)
- `MAX_ATTACKER_JUMP_PX = 18` (couche 1.c, après le solveur anti-superposition)

À 60 fps, 18 px/frame = 1080 px/s ≈ 29 m/s. Au-delà = snap visuel.
Un cut basket réel à 7 m/s ≈ 4.4 px/frame, largement sous le seuil.

**Effet mesuré** :
| Lab | Avant | Après |
|-----|-------|-------|
| Lab Snake (D5) | 68 px | 18 px |
| Lab Pindown (D3) | 55 px | 18 px |
| Lab Chain stagger (D4) | 54 px | 18 px |
| Tous Labs | jusqu'à 68 px | ≤ 18 px |

**À RESPECTER** :
- ✅ Le rate limiter ne s'active QUE quand `options.prevFrame` est passé.
  Le scrub (sans prevFrame) et l'engine pur (`computeDefenseTargets`)
  restent inchangés. Garantit que les invariants step-by-step ne sont
  pas affectés.
- ✅ La mémoire provient uniquement de la séquence synthétique canonique,
  jamais de la dernière frame affichée. Pause, reprise et export partagent
  donc le même résultat, même si des images ont été sautées.

**À INTERDIRE** :
- ❌ Ne pas augmenter le seuil au-dessus de ~20 sans mesurer l'impact
  visuel. Les utilisateurs perçoivent les sauts > 20 px.
- ❌ Ne pas appliquer en mode édition libre (1 step) — le delta n'a pas
  de sens, pas de prev. `useCourtFrame::handleTick` gère déjà ça
  implicitement (prev=null à isPlaying=false).

### Recovery snap résolu (2026-05-19)

**Avant** : `screenContactAdhesion` en mode `'leaving'` libérait
D1 sur 10 % du segment (window `[0.88, 0.98]` à quality 1.0).
Conséquence : D1 stuck à 85 % puis sprint brutal de ~70 px en
fin de transition. Δ frame jusqu'à 24 px sur PNR central.

**Fix** : window élargie à `[0.55 + q × 0.15, 0.95]`. Quality
1.0 → 25 % du segment, ghost screen → 39 %. Continuité aux
boundaries préservée. Δ frame max 15 px sur PNR central.

Test garde-fou : [`screenRecoverySnap.test.ts`](../src/lib/logic/__tests__/screenRecoverySnap.test.ts).
Scripts de diagnostic réutilisables :
[`scripts/diag-pnr-frames.ts`](../scripts/diag-pnr-frames.ts)
(frame par frame) et
[`scripts/diag-pnr-central.ts`](../scripts/diag-pnr-central.ts)
(step par step).

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
