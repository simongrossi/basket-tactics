# Changelog

Toutes les évolutions notables du moteur de jeu et de l'UI.

Format inspiré de [keep-a-changelog](https://keepachangelog.com). Le projet n'est pas versionné via tags git ; les "versions" ci-dessous sont des regroupements thématiques pour faciliter le suivi.

## [Unreleased]

### UX — Templates défensifs utilisateur

Permet de sauvegarder ses **propres presets défensifs** (snapshot
des réglages courants : rules, screen, off-ball, triggers, distance,
maxSpeed, closeout, denial + B1-B10) sous un nom et les recharger.

**Stockage** : étend `UserLibrary` existante (déjà persistée localStorage
via `useLibrary`) avec un champ `defensePresets?: UserDefensePreset[]`.
Pas de nouveau storage à gérer.

**Nouveaux helpers purs** dans `src/lib/data/library.ts` :
- `snapshotDefensePreset(state, name, description?)` : capture les
  champs défensifs courants (16 champs au total).
- `applyUserDefensePreset(state, preset)` : applique sur un AppState,
  conserve steps + activeStep + attaquants.
- `addDefensePreset` / `deleteDefensePreset` / `renameDefensePreset` :
  CRUD pures sur la `UserLibrary`.

**Hook `useLibrary`** : nouveaux callbacks `saveDefensePreset` /
`loadDefensePreset` / `deleteDefensePreset` / `renameDefensePreset`.

**UI** : nouvelle sous-section "✚ Mes presets" dans `DefensePanel`,
sous les presets globaux. Bouton "💾 sauvegarder" qui prompt un nom et
capture l'état actuel. Liste des presets perso avec :
- Bouton 👤 [nom] pour appliquer (avec confirm)
- Bouton 🗑 pour supprimer (avec confirm)
- Distinction visuelle : presets globaux en bleu, presets perso en
  vert (`bg-green-50`, border `bbf7d0`)

**Câblage** dans `page.tsx` : extraction du patch défensif via destructuring
+ application via `app.patch(defensePatch)` (préserve steps + UI).

**Tests** : 10 unitaires sur le snapshot + apply + CRUD (création,
ajout multiple, suppression, renommage, no-op id inconnu, deep clone
des rules, préservation closeoutBoost). **678 → 688 tests verts**.

Roadmap : `#5 Templates utilisateurs` marqué 🟢.

### UX — Saisie numérique sur les sliders

Le composant `<Slider>` partagé (`src/components/ui.tsx`) gagne un
`<input type="number">` à droite du range. Permet de taper une valeur
exacte au clavier plutôt que viser au curseur.

**Comportement** :
- Le slider et l'input partagent la même `value` propulsée par le parent.
- Pendant la frappe : buffer local non clampé (n'interrompt pas la saisie).
- Validation au **blur**, **Enter**, ou re-perte de focus : clamp dans
  `[min, max]` puis snap au `step`.
- **Escape** : annule la saisie en cours, retour à la dernière valeur.

Tous les sliders du moteur en bénéficient automatiquement (distance défense,
maxSpeed, helpPct par défenseur, ballPressure / rotationSpeed /
verticalOffset zone, hedgeAggression, etc.) — pas de modification côté
caller.

**Tests** : pas de tests dédiés (composant React purement présentationnel,
testé indirectement via les 678 tests existants qui couvrent les flux qui
manipulent les valeurs). TS clean.

Roadmap : `#1 Saisie numérique sur les sliders` marqué 🟢.

### B6 — Dig / double au post

Couverture défensive auto sur post-up. Quand un attaquant est posté en
low post (trigger `post` actif), un défenseur "low man" peut digger
(faux help) ou doubler activement.

**Nouvelle couche** `defense/postCoverageLayer.ts` (4.5 du pipeline,
entre `trapLayer` et `directiveLayer`) :
- Identifie le carrierDef (reste sur le pivot) et le digger candidat
  (défenseur ≠ carrierDef le plus proche du pivot, helpFactor < 0.5,
  pas de pnrRole).
- 'dig' : digger fait 30 % du chemin vers le pivot + helpFactor = 0.6
  + pnrRole = 'stunt' (anneau bleu pâle visu).
- 'double' : digger fait 50 % du chemin + helpFactor = 0.9 (anneau
  help violet plein).

**Setting** : `state.postCoverage?: 'none' | 'dig' | 'double'`
(default `'none'`, opt-in). Requiert aussi `state.triggers.post = true`
pour que le post soit détecté.

**Tests** : 4 (none = no-op, dig rapproche, double > dig, sans trigger =
no-op). **674 → 678 tests verts**.

Roadmap : B6 marqué 🟢. **Liste B complète (B1-B10) entièrement livrée**.

### B10 — Bumping cutters automatique

Réaction défensive auto sur cuts non marqués : un défenseur sur la
trajectoire prev → cur du cutter reçoit un offset de 12px **vers le
cutter** (effet "léger contact"). Filet de sécurité quand le cutter
n'est marqué par personne directement.

**Nouvelle couche** `defense/cutterBumpLayer.ts` (5.5 du pipeline,
entre `directiveLayer` et `postPassOrientationLayer`) :
- Utilise `detectCuts` (déjà existant) pour identifier les cuts.
- Filtre les bumpers candidats : ≠ cutterDef (déjà sur le cutter),
  `helpFactor` < 0.3 (pas occupé en aide active), pas de `pnrRole`.
- Critère perpendiculaire : ≤ 40px de la ligne prev → cur du cutter.
- Au max 1 bumper par cut (le plus proche).

**Setting** : `state.autoBumpCutters?: boolean` (default `false`, opt-in
pour préserver la rétrocompat).

**Tests** : 4 (default off = no-op, activé = au moins 1 défenseur shifté,
cutterDef intact, cutter statique = no-op). **670 → 674 tests verts**.

Roadmap : B10 marqué 🟢.

### B9 — Top-lock off-ball avec timing

Quand un cutter sort son **2ᵉ écran consécutif** (chaîne ≥ 2), la
couverture `top-lock` (verrouillage côté ballon) devient inadaptée — le
cutter est déjà décollé du verrouillage initial. Bascule automatique
vers `chase` (trail derrière le shooter) **pour ce cutter uniquement**.

**Nouveau module** `screens/cutterScreenChain.ts` :
- `countCutterScreenChain(state, stepIdx, cutter, depth=3)` : compte les
  écrans off-ball détectés sur les K derniers steps impliquant le cutter.
- `cuttersInScreenChain(state, stepIdx, candidates, depth, threshold)` :
  retourne le Set des cutters au-dessus du seuil (default 2).

**Câblage** dans `defense/offBallScreenLayer.ts` :
- Calcul une fois par couche (Set partagé entre les écrans détectés)
- `effectiveRule` par cutter : `'top-lock' → 'chase'` si dans la chaîne
- Tous les `applyOffBallScreenAdjustment` et `applySwitchOffBall` utilisent
  `effectiveRule` au lieu de `state.offBallScreenRule` directement

**Comportement** :
- Seul `state.offBallScreenRule === 'top-lock'` déclenche le calcul de
  chaîne (autres rules : pas d'overhead, ni de bascule).
- Cutters non en chaîne : top-lock classique conservé.
- Cutters en chaîne (≥ 2 écrans dans 3 steps) : `chase` appliqué.

**Tests** : 10 (7 helper unitaires + 3 d'intégration sur le pipeline
défense). **660 → 670 tests verts**.

Roadmap : B9 marqué 🟢.

### B8 — Switch policy granulaire (team-level)

Filtre additionnel par-dessus `screenRule = 'switch'` ou `'peel-switch'`.
Le coach choisit quels couples de défenseurs peuvent switcher :

- `'all'`  : switch tous matchups (default, rétrocompat)
- `'1-3'`  : seulement entre D1/D2/D3 (guards + wings)
- `'1-4'`  : sauf si l'un des deux est D5 (pivot protégé)
- `'none'` : annule tout switch (équivalent rule `'over'` etc.)

**Nouveau helper** `switchAllowed(policy, d1, d2)` dans
`defense/mismatchTracking.ts`. Câblé dans `defense/context.ts` :
chaque tentative de `applySwitch` est filtrée avant application.

**Setting** : `state.switchPolicy?: 'all' | '1-3' | '1-4' | 'none'` (default `'all'`).

**UI** : sélecteur dans `DefensePanel`, visible quand `screenRule ∈
{'switch', 'peel-switch'}`. Placé avant le bloc Scram (logique :
filtre policy d'abord, scram ensuite).

**Tests** : 10 (helper unitaire pour les 4 policies, intégration avec
6 scénarios : default, none, 1-3 sur D1↔D5, 1-4 sur D1↔D5, 1-4 autorise
D1↔D4, 1-3 autorise D1↔D2). **650 → 660 tests verts**.

Roadmap : B8 marqué 🟢.

### B5 — Empty side PnR

Détecte un PnR exécuté sur un côté du terrain où aucun autre attaquant
n'est présent. Couverture défensive optimale change : ice contre-indiqué
(pas de baseline à fermer → drive 1c0), under naturel (pas de skip pass).

**Helper pur** `screens/emptySidePnR.ts > isEmptySidePnR(screen, off, hoop)` :
projette les autres attaquants sur la perpendiculaire à l'axe poseur→panier
et vérifie qu'aucun n'est du même côté que le porteur. Tolérance ±5px pour
les attaquants sur l'axe (ne cassent pas le empty).

**Règle coach** `coachDiagnostics/rules/emptySidePnR.ts` :
- 'info' systématique si pattern détecté (contexte au coach)
- 'critical' si screenRule = `ice` (drive 1c0 imminent — recommander under/hedge)
- 'good' si screenRule = `under` ou `weak` (cohérent)

**Tests** : 5 (côté opposé pur, attaquant même côté = false, attaquants en
masse côté opposé, porteur sur l'axe, attaquants sur l'axe ignorés).
**645 → 650 tests verts**.

Roadmap : B5 marqué 🟢.

### B7 — Defensive 3 seconds (règle FIBA)

Diagnostic coach quand un défenseur stationne 3 steps consécutifs dans
la raquette sans marquer un attaquant proche (> 50 px = "à un bras"). Pas
de pénalité simulée — uniquement un signal au coach.

**Module** : `coachDiagnostics/rules/defensiveThreeSeconds.ts`. Récupère
les positions défensives et offensives aux 3 derniers steps via
`effectiveDefensePositions` (déjà memoizé). Émet 1 warning par défenseur
qui viole la règle.

**Tests** : 4 (no history, violation 3 steps, marqueur proche, sortie de
raquette intermédiaire). **641 → 645 tests verts**.

Roadmap : B7 marqué 🟢.

### B4 — Snake dribble detection

Détecte le pattern offensif où le porteur **utilise l'écran, recule, et
re-utilise le même écran** (V-shape sur 3 steps). Différent de B2 :
reject = refus sans contact, snake = double usage avec retraite au milieu.

**Algorithme** (V strict sur 3 steps) :
- Step N-2 : carrier engagé sur poseur (distance ≤ `screenRadius × 2`)
- Step N-1 : retraite réelle (distance vs N-2 ≥ 25 px)
- Step N : ré-engagé sur poseur (distance vs N-1 ≤ -25 px, ET ≤ `screenRadius × 2`)
- Mouvement du porteur ≥ 25 px sur **chaque** segment (pas le total — un
  snake parfait revient PILE à sa position d'engagement)
- Le candidat retenu = celui qui maximise `upDelta + downDelta` (V le plus
  prononcé). Permet de distinguer 2 écrans concurrents.

**Nouveau module** `src/lib/logic/screens/detectSnakeDribble.ts`, exporté
via le barrel `screens/`. Retourne `SnakeDribble | null` avec les IDs + les
3 distances (entry / peak / return) pour le diagnostic.

**Nouvelle règle coach** `coachDiagnostics/rules/snakeDribble.ts` :
- 'warning' si V très marqué (peak > 1.5 × entry)
- 'info' sinon, avec les 3 valeurs de distance affichées

**V1 — diagnostic-only**. V2 : la défense devrait maintenir la couverture
engagée pendant la retraite plutôt que de re-armer à zéro.

**Tests** : 8 unitaires (no history, V parfait, micro-jitter, retraite
insuffisante, pas de ré-engagement, pas d'engagement initial, choix du V
le plus marqué entre 2 candidats, mapping matchups).
**633 → 641 tests verts**.

Roadmap : B4 marqué 🟢 (V1). Liste B critiques (B1-B4) entièrement traitée.

### B2 — Reject screen detection

Détecte le pattern offensif où le porteur **refuse l'écran** anticipé par
la défense (jab + drive opposé). La défense reste piégée par-dessus
l'écran qui n'a pas eu lieu.

**Algorithme** (4 critères tous obligatoires) :
1. Le porteur a bougé ≥ 25 px entre N-1 et N
2. À N-1, un attaquant ≠ porteur était dans `screenRadius × 1.5` du
   défenseur du porteur ET dans 80 px du porteur (= candidat poseur)
3. Le mouvement du porteur a une composante opposée au poseur (dot ≤ -0.3)
4. La distance porteur ↔ poseur a augmenté d'au moins 20 px

**Nouveau module** `src/lib/logic/screens/detectRejectedScreen.ts`,
exporté via le barrel `screens/`. Retourne `RejectedScreen | null` avec
les IDs concernés (carrier/screener/leurs défenseurs) + métriques.

**Nouvelle règle coach** `coachDiagnostics/rules/rejectedScreen.ts` :
- 'warning' si reject **sharp** (dot ≤ -0.7 = retraite directe)
- 'info' si reject de marge (dot dans [-0.7, -0.3])
- Messages typés vocabulaire coach ("Reject écran : O1 refuse O5 et vire
  opposé — défense sur-anticipée").

**V1 — diagnostic-only** : la défense n'est pas modifiée par la détection.
Le coach voit l'analyse a posteriori. V2 (plus tard) : ajuster la
couverture pour ne pas sur-anticiper (mémoire d'intent).

**Tests** : 9 unitaires (no prevOff, mouvement insuffisant, reject net,
reject sharp, approche normale, pas de candidat, divergence insuffisante,
mouvement perpendiculaire = pas un reject, mapping screenerDef).
**624 → 633 tests verts**.

Roadmap : B2 marqué 🟢.

### B3 — Hard hedge vs soft hedge

Sépare l'axe **quality** (qualité de l'écran posé, côté offense) de l'axe
**aggression** (intensité de la sortie défensive, côté défense). Avant,
les deux étaient conflés sur `q` → impossible de combiner un excellent
écran avec une couverture soft show, ou un écran moyen avec un hard hedge.

**Nouveau setting** : `state.hedgeAggression?: number` (0..100, default 50).

**Comportement** :
- `aggression = 0` (soft show) : D5 sort à 25px du porteur, recover vite
- `aggression = 50` (standard) : équivalent ancien comportement
- `aggression = 100` (hard hedge) : D5 sort à 60px DEVANT O1, barricade

**Indépendance des axes** : le `blendFactor = q × hedgeAgg`. Un écran
fantôme (q=0) reste fantôme même en hard hedge ; un écran solide (q=1)
avec soft show reste un show timide.

**UI** : slider "agressivité" dans `DefensePanel`, visible uniquement
quand `screenRule === 'hedge'`.

**Tests** : 5 nouveaux (soft, hard, monotone sur distance au poseur,
indépendance vs quality, default). **619 → 624 tests verts**.

Roadmap : B3 marqué 🟢.

### B1 — Mismatch tracking + scram switch

Détection automatique des mismatches créés par un switch porteur, avec
correction optionnelle par **scram switch** (3ᵉ échange défensif).

**Nouveau module** `src/lib/logic/defense/mismatchTracking.ts` :
- `defenderRank(D1..D5)` / `attackerRank(O1..O5)` → 1..5 (1 meneur, 5 pivot)
- `mismatchSeverity(d, a)` = `|defenderRank - attackerRank|`, range 0..4
- `applyScramSwitch(matchups, screen, off, def, options)` :
  - Identifie le pire mismatch post-switch (tie-break : côté porteur)
  - Cherche un défenseur tiers ≤ 200px de l'attaquant exposé
  - Applique un 2ᵉ swap si la réduction du **pire** mismatch est ≥ 2
  - Refuse si le candidat lui-même crée un nouveau mismatch > seuil

**Câblage** dans `src/lib/logic/defense/context.ts` : après `applySwitch`
classique, si `state.scramSwitchEnabled` est true, on tente le scram.
Résultat propagé via `ctx.scrammedSwitch` aux couches en aval.

**Settings** (nouveaux champs `AppState`) :
- `scramSwitchEnabled?: boolean` (default `false`, opt-in)
- `mismatchThreshold?: number` (default 2 = mismatch D5↔O3 minimum)
- `showMismatchBadges?: boolean` (default true)

**Propagation** : `ComputedDefender` gagne `mismatchSeverity?` et
`scrammedThisStep?`. Affichés à chaque step y compris en l'absence de
scram (sert au coach pour repérer les bad matchups manuels).

**Visuel** : nouveau badge sous le sprite défenseur — orange (severity 2),
rouge (≥3), bleu "SCRAM" si scram appliqué. Toggle global possible.

**Diagnostic coach** enrichi (`switchMismatch.ts`) :
- Scram appliqué → 'good' avec phrase explicative (qui prend qui)
- Severity ≥ 3 → 'critical' (mismatch extrême à exploiter)
- Severity ≥ threshold → 'warning' (avec valeur de severity affichée)
- Severity < threshold → 'info' (switch neutre)

**Settings UI** : nouveau bloc dans `DefensePanel` (visible uniquement
quand `screenRule ∈ {'switch', 'peel-switch'}`) — toggle + sélecteur de
seuil (1 = tout switch corrigé, 4 = scram seulement sur mismatch extrême).

**Tests** : 12 unitaires sur `mismatchTracking` (rank/severity/scram) +
5 d'intégration sur le pipeline complet. **602 → 619 tests verts**.

Roadmap : B1 marqué 🟢 (premier item de la liste B audit défensif livré).

### Modularité — découpage des gros fichiers

Refonte structurelle visant à **réduire le risque** de chaque nouvelle feature
basket. Les fichiers les plus volumineux ont été éclatés en sous-modules
cohérents sans changer l'API publique. Documentation détaillée :
[docs/refactoring-history.md](./docs/refactoring-history.md).

| Fichier | Avant | Après | Modules extraits |
|---|---:|---:|---|
| `lib/logic/scriptedGenerators.ts` | 1502 | 92 | helpers + tier1/2/3 |
| `hooks/useAppState.ts` | 967 | 510 | 8 namespaces `lib/state/transforms/` (purs) |
| `components/CourtView.tsx` | 902 | 446 | `useCourtFrame` · `useCourtPointerHandlers` · `<CourtPlayersLayer>` · `<CourtMenus>` |
| `components/ContextMenu.tsx` | 897 | 22 | popupHooks + ToolBar + sharedRows + DefenderMenu + AttackerMenu |
| `lib/logic/screens.ts` | 822 | barrel | helpers + 2 detect + 2 adjust |
| `lib/logic/coachDiagnostics.ts` | 834 | barrel + 13 rules | registry pattern, 1 fichier par règle |

Pas de changement de comportement runtime, **602 tests verts** (+61 nouveaux
tests sur les transforms purs `useAppState`, possibles depuis l'extraction
en fonctions pures — cf. `src/lib/state/__tests__/`).

### Étapes 2 à 5 — Réflexes défensifs avancés en zone

Refonte significative de la défense de zone pour encoder les principes basket fondamentaux qui doivent l'emporter sur la simple ownership géométrique. Documentation : [docs/logique-defensive.md > Réflexes défensifs avancés](./docs/logique-defensive.md#réflexes-défensifs-avancés-étapes-2-4).

#### Étape 2 — Désignation de couvreurs (zone)
- **2.a `designatedCoverer`** : un attaquant isolé en zone-tueuse (high-post / short-corner sans coéquipier <80px) déclenche une désignation explicite du défenseur le plus proche par homePos. Boost ×4 sur sa claim, bias home (40% vers attaquant pour high-post). Empêche la dilution d'ownership entre 5 défenseurs concurrents.
- **2.b `paintCoverage`** : nouveau slider `ZoneConfig.paintCoverage` (0-100, défaut 50) qui module l'agressivité des boosts désignation.
- **2.c `isHighPost` élargi** : couvre maintenant la "tête de raquette" complète (`verticalFromHoop ∈ [80, 200]` vs `[130, 200]` avant).
- **2.d `baselineDriveCoverer`** : nouveau module `baselineDrive.ts` détecte les attaques ligne de fond non fermées. Désigne le wing low côté ballon. Diagnostics coach `baseline-drive-open/soft/late/closed`.
- **2.e `ballPressureCoverer`** : LE défenseur structurellement responsable de presser le porteur. Front-row si ballon haut, back-row si bas. Préfère le défenseur du même côté que le ballon. Boost ×2.5 + bias home + seuil engagement abaissé.

#### Étape 3 — Réflexes basket universels
- **3.a `rimProtectorByThreat` ("pas d'easy basket")** : nouveau module `threatResolution.ts` avec `detectFreePathThreats`. Pour chaque attaquant à <220px du panier sans défenseur sur la trajectoire, désigne le défenseur disponible le plus proche du panier. Slider `rimProtection` (0-100).
- **3.b `detectCuts`** : détection des coupes hors-ballon vers le panier (Δ dHoop > 25, exclut les screeners). Diagnostic coach `cut-backdoor`.
- **3.c Step-up préventif** : `detectFreePathThreats` étendu pour détecter les drives en cours (220-280px avec mouvement vers panier). Réaction défensive AVANT que l'attaquant arrive sur le panier.
- **3.d `detectMatchupOrphans`** : signale via diagnostic coach les défenseurs en aide loin de leur home dont le matchup naturel n'est plus couvert.

#### Étape 4 — Axe central et recover
- **4.a Weakside paint sag** : `ballSideShifted` étendu — les défenseurs côté faible glissent vers l'**axe central** (x=300, pull ×0.8) ET vers le panier en Y (×0.4). Engagement réduit ×0.5 si défenseur ET matchup tous deux weakside. Effet : D4 weakside passe de 121px à 98px de l'axe central.
- **4.b Recover boost** : défenseur sans rôle d'aide actif reçoit ×1.15 sur claim au matchup naturel. Pull-back actif après aide.
- **4.c Couche `applyRimProtectionLayer` en man defense** : nouvelle couche 1.5 du pipeline man-to-man qui applique le rim protection aux positions post-baseTargets. Filet de sécurité pour les edge cases (défenseur perdu via écran, switch).

#### Étape 5 — Pass denial
- **`detectOpenPassThreats`** dans `threatResolution.ts` : pour chaque attaquant non-porteur, vérifie si segment carrier→att libre (perpDist >60px). Désigne le défenseur naturel (baseMatchups) si disponible, sinon le plus proche de l'intercept (sous 220px).
- Slider `passDenial` (0-100, défaut 50) dans DefensePanel.
- Boost claim sur le receveur + bias home vers point d'interception. Skipé pour les receveurs déjà couverts par d'autres designations (évite les conflits, ex : pivot D5 ne fait pas un skip pass perimetric).

#### Architecture
- Toutes les désignations vivent dans `zoneDefense.ts` et sont calculées **avant** la boucle de claims, dans cet ordre (priorité décroissante) : `designatedCoverer` (high-post) → `baselineDriveCoverer` → `ballPressureCoverer` → `rimProtectorByThreat` → `passDenierByReceiver`.
- Mécanisme commun : un seul défenseur boosté par menace (pas de dilution), `unavailable: Set<DefenderId>` propagé entre détections pour éviter qu'un défenseur cumule plusieurs missions.
- Tests : 348 → **394 tests verts** (+46 tests, dont 22 dans `threatResolution.test.ts`, 9 nouvelles sections dans `zoneDefense.test.ts`, 3 dans `rimProtectionLayer.test.ts`).

#### Étape 10 — Édition continue tStart/tEnd (façon vidéo)
- `Annotation.tStart` et `tEnd` (0..1) définissent les bornes temporelles de l'action dans le segment de transition. Permet à des actions parallèles d'avoir des durées différentes.
- `attackerTrajectoryAt` mappe le temps global vers le temps d'action selon ces bornes : avant tStart le joueur reste à `from`, après tEnd à `to`.
- UI : poignées de drag invisibles (`cursor=ew-resize`) sur les bords des segments dans MultiTrackTimeline. Glisser horizontalement modifie tStart/tEnd en temps réel.
- Handler `setAnnotationTiming` avec clamp 0..1 et durée minimum 0.05 (anti-instabilité visuelle).
- Tests : 4 cas sur attackerTrajectoryAt (tStart à 0.5, tEnd à 0.5, [0.2, 0.6], défaut). 421 → **425 tests verts**.

#### Étape 11 — Pénalité de contact d'écran
- Le défenseur du porteur marqué `onScreen=true` reçoit désormais une pénalité de vitesse `×0.55` dans `speedConstraint` (en plus de la friction proximité et de l'allongement de path arc length).
- Représente le contact physique avec le poseur d'écran : le défenseur ne traverse pas instantanément, il négocie le contact (perd ~0.3-0.6 sec).
- Cumulé pire cas : `0.33 × maxSpeed` → D1 nettement late après l'écran, intuition basket respectée.
- Limité au défenseur du porteur (le screenerDef a son propre rôle hedge/show).

#### Étape 14 — PDF lisible quand les actions se chevauchent
- Sous chaque vignette d'étape : bandeau timecode (`0:04 → 0:08 (4.0s)`) + liste à puces des annotations parallèles avec leurs timings absolus et leur qualité d'écran.
- Symbole **★** sur les annotations à cheval sur la transition adjacente (`tStart<0` ou `tEnd>1`).
- Tag **(début)** sur les annotations `phase='start'`.
- Nouvelle section **Synoptique multi-pistes** (cochable, sur page séparée) : grille joueur × transition avec barres positionnées selon tStart/tEnd. Pour les écrans, la qualité est indiquée (`gh/lo/st/so/lk`).
- Helper `annotationSummary` extrait dans `src/lib/logic/pdfRecap.ts` pour testabilité.
- Tests : 11 nouveaux cas (formatage des annotations, qualité, phase, cross-step, secondsPerStep variable). 449 → **460 tests verts**.

#### Étape 15 — Refonte du réalisme des écrans (12 commits, 460 → 493 tests verts)

Sprint dédié à la correction du comportement défensif sur écran. Plusieurs constats du coach :
- D1 reculait visuellement, mais "recollait" l'attaquant trop vite (effet de glissement sans contact)
- En édition libre (un seul step), aucune pénalité n'agissait — D1 traversait l'écran et se collait à O1
- L'indicateur visuel d'écran disparaissait parfois (détection ratée)
- Au moindre micro-décalage du porteur autour de l'axe poseur→panier, D1 se téléportait de l'autre côté du poseur
- Pendant la lecture animée, D1 "glissait" sur le poseur sans vraie sensation de blocage

##### Diagnostic central

`followDefendersAtFrame` (chargé de re-glue chaque défenseur sur son homme en temps réel) **écrasait** la position calculée par le pipeline freeze/courbe/easing. Tout le réalisme calculé en amont était perdu à la dernière étape.

##### Corrections

**Détection & cibles**
- À step 0 (édition libre), `detectScreen` utilisait `defenseInitial` (loin du jeu) → poseur jamais détecté. Substitution par les cibles homme-à-homme idéales (`buildStep0DetectionPositions` extrait dans [step0Detection.ts](src/lib/logic/step0Detection.ts)), réutilisée par `context.ts`, `speedConstraint.ts`, `CourtView.tsx` et `frameResolver.ts`.
- Restoration de l'indicateur visuel `écran X → Y [rule]` à step 0 quand D1 ne peut physiquement pas atteindre le poseur.
- `sideOfCarrier` passe de `Math.sign(carrier.x - screener.x)` (discontinu) à la **projection du vecteur normalisé poseur→porteur sur l'axe perpendiculaire** — continu dans [-1, 1] : plus de téléport lors d'une traversée d'axe.

**Cibles déplacées vers le poseur**
- `applyScreenAdjustment` reçoit maintenant `quality` en 9ᵉ paramètre. À q=0 garde le comportement legacy (faux écran), à q=100 plaque D1 sur le poseur.
- Nouvelles positions par rule (D1 carrierDef) :
  - **over** : juste derrière le poseur côté basket (lag 5→30px selon q)
  - **hedge** : plaqué AU poseur, côté opposé au porteur (D1 littéralement bloqué)
  - **under** : derrière O1 côté opposé au basket (20→55px de lag)
  - **drop** : over léger, D5 prend la charge avec son drop profond
- D5 (screenerDef) en hedge agressif : sort DEVANT O1 côté basket (25→60px selon q) au lieu de juste à mi-chemin.
- Helper `pushOutOfCarrier` garantit ≥ MIN_PLAYER_CLEARANCE_PX (34px) entre défenseur et porteur dans toutes les rules — **plus de chevauchement visuel**, jamais.

**Routes route-aware**
- `curveAroundObstacle` accepte `forcedPushSign` pour imposer le côté de contournement selon la rule.
- `carrierScreenRoutePreference` et `offBallScreenRoutePreference` calculent la direction préférée selon over/under/hedge/drop/ice/chase/top-lock.
- `contactQualityForRule` module la durée de contact selon la rule basket-pertinente : under ×1.18, weak ×1.08, hedge ×1.05, over ×0.85, ice ×0.65, switch ×0.

**Animation continue (frame resolver)**
- Nouveau `screenContactT` (sigmoïde lisse, k=1→13 selon q) remplace l'ancienne fonction piecewise qui créait une discontinuité de vélocité au défige.
  - `arriving` (q=100) : effT atteint 0.95 à mi-transition puis plateau long
  - `leaving` (q=100) : D1 reste figé jusqu'à t≈0.7, puis rattrape en fin
  - `stuck` : freeze au milieu
- `carrierApexSlownessFromQuality` pousse à 0.99 à q=100 (quasi-pause au sommet du contournement).
- **`screenLockedDefenders: Set<DefenderId>`** : les défenseurs en contact écran sont passés à `followDefendersAtFrame(skipIds)` qui les SAUTE → leur position calculée (freeze + courbe + easing) n'est plus écrasée.

**Recover qui prolonge la pénalité**
- `isRecoveringFromCarrierScreen` détecte les défenseurs qui SORTAIENT d'un écran au step précédent et conservent une pénalité de vitesse au step suivant. Le temps perdu n'est plus instantané, il s'étale sur le step de recover.
- `previousCarrierScreenQualityByDef` mémorise la quality pour appliquer la bonne pénalité.

**Écrans non-porteur**
- Le mode `arriving`/`leaving`/`stuck` s'applique aussi au défenseur du cutter (`offBallContact`).
- `applyOffBallScreenAdjustment` over/chase : cutterDef placé à `MIN_PLAYER_CLEARANCE` du screener (au lieu d'un offset arbitraire 18-24px qui ne respectait pas le clearance).

**Speed constraint cohérent**
- À l'arrivée sur écran (`isCarrierDefScreenedThisStep`), bypass du clamping de vitesse — sinon D1 s'arrêtait paradoxalement EN AVANT du poseur. La pénalité s'applique uniquement au step de recover.

**Solveur de collisions**
- `resolvePlayerCollisions` reste avec exclusion `matchedTo` (préserve la défense "coller" normale). La clearance vs porteur est gérée en amont dans `applyScreenAdjustment` par `pushOutOfCarrier`.

##### Tests

Nouveaux fichiers et invariants ajoutés :
- `screenContactFrame.test.ts` : 8 tests de bout-en-bout via `resolveFrameAt`
  - D1 à t=0.5 doit être au contact du poseur (≤50px) avec clearance respectée (≥33px)
  - D1 à t=0.7 n'a pas encore récupéré
  - Trajectoire de D1 ne traverse JAMAIS le rayon du poseur
  - Recover : D1 reste `late` après un lockdown, pas après un ghost
  - Off-ball : D2 stuck sur O4 pendant un pindown
  - Multi-screen : D1 lit la qualité du bon poseur
- `screenFreeze.test.ts` : 8 tests sur la sigmoïde (monotonie, continuité, dérivée bornée)
- `screenQuality.test.ts` : 7 tests sur `screenPenaltyFromQuality`
- `curveAroundObstacle.test.ts` : 4 + 1 tests (apex slowness + `forcedPushSign`)
- `screens.test.ts` : +9 tests sur les nouvelles cibles par rule, l'invariant de non-chevauchement (toutes rules × toutes qualities), la continuité de position autour de l'axe poseur→panier

**460 → 493 tests verts** (+33).

##### Limites encore ouvertes

- **État de contact écran multi-phase explicite** : actuellement encodé via les flags `onScreen` de defA/defB + le mode (arriving/leaving/stuck). Un vrai modèle de phase (approche → impact → arrest → contournement → recover) avec durées propres reste à concevoir.
- **Indicateur visuel dédié** : D1 affiche son anneau `isCarrierDefender` qui masque l'état "contact écran". Un badge spécifique "stuck"/"recover" aurait sa place.
- **Off-ball : pas encore de mémoire de retard au step suivant** : le `isRecoveringFromCarrierScreen` ne couvre que le carrier defender. Étendre au cutter defender (pindown, flare, stagger, hammer) reste à faire.

#### Étape 13 — Timecode (24s possession)
- Nouveaux champs `AppState.secondsPerStep` (défaut 4) et `possessionSeconds` (défaut 24).
- Module `src/lib/logic/timecode.ts` : `realStepToSeconds`, `shotClockAt`, `totalDurationSeconds`, `formatClock`, `formatShotClock`.
- Affichage MM:SS écoulé / total dans la Timeline + badge shot clock cliquable (jaune sous 5s, rouge en violation).
- Headers de la MultiTrackTimeline annotés avec le temps de chaque transition (`0.0s`, `4.0s`...).
- Réglages dans le panneau Paramètres : `s / étape` et `possession` (input numériques).
- Le moteur reste step-based : ces utilitaires sont uniquement pour l'AFFICHAGE.
- Tests : 16 nouveaux cas (formatage, conversion, clamp, steps interpolés). 433 → **449 tests verts**.

#### Étape 12 — Qualité d'écran (0-100)
- Nouveau champ `Annotation.quality` (0-100, défaut 50) sur les annotations `type='screen'`. Module la pénalité Étape 11 :
  - **0 (ghost)** : ×1.00 — faux écran, le défenseur passe sans ralentir.
  - **25 (loose)** : ×0.78 — léger frôlement (~0.2s perdues).
  - **50 (standard, défaut)** : ×0.55 — comportement Étape 11 inchangé.
  - **75 (solid)** : ×0.32 — écran tight, défenseur sensiblement late.
  - **100 (lockdown)** : ×0.18 — D1 quasi-stoppé (~1.2s).
- Courbe linéaire par morceaux `screenPenaltyFromQuality(q)` exportée par `speedConstraint`.
- UI : badge cliquable `ghost/loose/std/solid/lock` sur chaque segment screen du MultiTrackTimeline. Clic cycle 0→25→50→75→100.
- Handler `setAnnotationQuality(stepIdx, annoIdx, quality)` exposé par `useAppState`.
- Tests : 7 nouveaux cas sur `screenPenaltyFromQuality` (clamp, monotonie, points de référence). 426 → **433 tests verts**.

#### Étape 10b — Segments à cheval sur plusieurs étapes
- `tStart` peut désormais être < 0 (jusqu'à -1) et `tEnd` peut être > 1 (jusqu'à 2), permettant à une action de s'étendre dans la transition précédente ou suivante.
- `attackerTrajectoryAt` regarde les annotations sur les steps `idxA` ET `idxA+1` pour identifier les actions actives à un temps global donné (fenêtre [absStart, absEnd] = anchor + tStart, anchor + tEnd).
- UI : `overflow: visible` sur les cellules + `z-index` sur les segments pour les laisser déborder. Les poignées de drag acceptent les ratios hors [0, 1] et clampent côté state à [-1, 2]. Box-shadow autour du segment quand il déborde pour le repérer.
- Cas d'usage : un écran qui se pose pendant la fin du dribble du porteur (l'action démarre `tStart=-0.4` avant son anchor → D1 peut déjà commencer à le prendre).
- Test : 1 nouveau cas cross-step (tStart=-0.4, vérification position aux deux transitions). 425 → **426 tests verts**.

#### Étape 8 — Multi-track timeline + Étape 9 — Phase début/fin
- Nouveau module `playerTracks.ts` qui calcule pour chaque joueur ses segments d'activité à travers les étapes (idle, dribble, cut, screen, pass / pos, tracking, closeout, help).
- `PlayerTimelineModal` (popup zoom) + `MultiTrackTimeline` (docké en bas, façon Premiere) avec curseur vertical synchronisé temps réel et clic pour sauter à un step.
- Toggle "▲ pistes" à côté de la Timeline principale pour déplier/replier.
- Steps interpolés fusionnés dans la vue (pas de bruit visuel).
- Étape 9 : `Annotation.phase: 'start' | 'end'`. Permet de dire au moment du dessin si l'écran/cut/dribble est actif **dès le début** de l'étape (mouvement effectué dans la transition précédente) ou **à la fin** (mouvement effectué pendant cette étape). Bouton ◀/▶ sur les segments du multi-track pour basculer en place.
- `setAnnotationPhase` resynchronise les positions des étapes concernées (`step N-1`, `step N`, `step N+1`).
- Tests : `playerTracks.test.ts` (8 cas) + 2 nouveaux sur `upsertMovementAnnotation` (phase=start). 411 → **421 tests verts**.

#### Étape 7 — Branches manuelles de scénario
- Nouveau type `ScenarioBranch` ([types/index.ts](./src/lib/types/index.ts)) : variante terminale qui diverge après une action donnée du chemin principal.
- `AppState.scenarioBranches: ScenarioBranch[]` + `activeBranchId: string | null` + `pdfIncludeBranches: boolean`.
- `compileScenario(activeBranch?)` : si fournie, compile les actions du main jusqu'à `divergeAfterActionId` inclus puis continue avec `branch.actions`. Fallback graceful sur référence invalide.
- Handlers `addScenarioBranch`, `updateScenarioBranch`, `deleteScenarioBranch`, `setActiveBranch`. Les handlers d'actions existants deviennent **branch-aware** (routent vers `branch.actions` quand une branche est active).
- UI [`ScenarioPanel.tsx`](./src/components/ScenarioPanel.tsx) : sélecteur de tabs en haut (Principal + une par variante, double-clic pour renommer, × pour supprimer), bouton "+ variante" sur chaque action du main, bandeau d'info en mode branche active.
- UI [`PlaybookView.tsx`](./src/components/PlaybookView.tsx) : toggle "variantes" qui ajoute une section par branche dans le PDF (page-break avant chaque). Steps interpolés filtrés.
- V1 : un seul niveau (pas de sous-branches). Affichage simultané (split view) noté pour V2 dans [docs/ideas.md](./docs/ideas.md).
- Tests : `scenarioBranches.test.ts` (6 cas : sans branche, simple, multi-actions, invalide, vide). 401 → **406 tests verts**.

#### Étape 6 — Décomposition des téléports
- **`breakUpTeleports()`** ([`breakUpTeleports.ts`](./src/lib/logic/breakUpTeleports.ts)) appliqué après compilation. Si un joueur bouge >100 px entre deux steps, on insère des steps interpolés.
- Nouveau champ `Step.isInterpolated: boolean` marque les steps phantômes.
- UI : `OffensePanel` masque les interpolés de la liste utilisateur ; `Timeline` les affiche en gris/petit.
- Tests : 394 → **401 tests verts** (+7 nouveaux dans `breakUpTeleports.test.ts`).

#### Sliders zone disponibles dans DefensePanel
| Slider | Champ | Effet |
|--------|-------|-------|
| pression bal. | `ballPressure` | Pression sur porteur (ballPressureCoverer) |
| vit. rotation | `rotationSpeed` | Vitesse de mouvement de la zone |
| position vert. | `verticalOffset` | Décalage vertical des homePos |
| aide raquette | `paintCoverage` | Couverture zones-tueuses (high-post, short-corner, baseline) |
| protect. panier | `rimProtection` | Free-path threats (pas d'easy basket) |
| deny passes | `passDenial` | Fermeture des lignes de passe ouvertes |

### Refactor — Découpage du moteur défensif en couches isolées (engine.ts : 982 → 117 lignes)

`src/lib/logic/engine.ts` était devenu un "gravity well" mélangeant calcul des cibles défensives, ajustements playback, calcul d'orientation des attaquants, détection d'événements tactiques, et contrainte de vitesse. Le tout dans une seule grosse fonction `computeDefenseTargets` (~290 l) + un `effectiveDefensePositions` (~235 l) qui partageaient des dizaines d'imports. Découpage en pipeline de couches indépendantes, chacune testable en isolation.

**Fichiers extraits** (toutes nouvelles factorisations, comportement bit-identique, 336 tests verts à chaque commit) :

- **`defense/types.ts`** — type partagé `DefenderTarget` (sortie de `computeDefenseTargets`, entrée de `effectiveDefensePositions`).
- **`defense/context.ts`** — `DefenseFrameContext` + `buildDefenseFrameContext()`. Setup phase : matchups, prevDefenderPositions, écran porteur, switch/peel-switch, triggers, ballSide. Mute `step.switches` pour persistance.
- **`defense/baseTargets.ts`** — couche 1, base man-to-man + help (sag uniquement) + screen-on-target adjustment + offset latéral manuel + orientation initiale.
- **`defense/pnrLayer.ts`** — couche 2, rotations PnR (low-man tag + X-out + nail stunt) sur roll/short-roll/slip.
- **`defense/offBallScreenLayer.ts`** — couche 3, écrans hors-ballon (mute matchups en cas de switch off-ball).
- **`defense/trapLayer.ts`** — couche 4, trap auto en zone de trappe.
- **`defense/directiveLayer.ts`** — couche 5, directives défensives scriptées (`step.defensiveDirectives`).
- **`defense/postPassOrientation.ts`** — couche 6, recalcul orientation final depuis les positions ajustées (pour que low-man tag pointe la zone de menace, pas son homme original).
- **`defense/zoneTargets.ts`** — branche zone du calcul (ownership polygonal + tracking d'attaquant).
- **`defense/speedConstraint.ts`** — `effectiveDefensePositions` : contrainte vitesse max + closeout/over-closeout + friction de proximité + clusters d'écran + collisions.
- **`defense/frameAdjust.ts`** — `followDefendersAtFrame` + `recomputeDefenseFrameOrientations` (post-passes appliquées sur ComputedDefense pendant le playback, consommées par `frameResolver`).
- **`attackerVisuals.ts`** — `computeAttackerVisuals` (orientation des attaquants par rôle : carrier/passer/cutter/screener/idle).
- **`events/triggerDetector.ts`** — `detectStepScreenAction` (détection écran porteur + classification d'action : roll/pop/slip/short-roll/ghost/reject/snake/re-screen).

**Pipeline de `computeDefenseTargets`** réduit à 25 lignes orchestrateur :
```ts
const { ctx, matchups } = buildDefenseFrameContext(state, stepIdx, mutateStepForSwitch);
const positions = {};
applyBaseTargetsLayer(positions, matchups, ctx);   // 1
applyPnRRotationsLayer(positions, matchups, ctx);  // 2
applyOffBallScreenLayer(positions, matchups, ctx); // 3
applyTrapLayer(positions, matchups, ctx);          // 4
applyDirectiveLayer(positions, ctx);               // 5
applyPostPassOrientationLayer(positions, ctx);     // 6
```

**Bénéfice** : chaque couche est isolée derrière une signature claire `(positions, [matchups,] ctx) → void`. Modifier une règle d'aide (couche 1) ne risque plus de casser le PnR (couche 2) silencieusement. Ajouter une 7ᵉ couche (ex : communication défensive) = un fichier + une ligne dans le pipeline. L'ordre des couches est explicite et documenté.

Re-exports gardés sur `engine.ts` pour préserver l'API publique consommée par CourtView, frameResolver, app/page.tsx, coachDiagnostics, tacticalReads, etc. Aucune migration côté caller.

### Refactor — Extraction de la logique playback de CourtView (1222 → 811 lignes)

`CourtView.tsx` mêlait la boucle d'animation, le calcul de frame interpolée (défenseurs + attaquants + ballon + orientations + collisions) et le rendu SVG. Les boucles play (220 l) et scrub (170 l) dupliquaient ~95 % de leur logique.

- **`src/lib/logic/playback/frameResolver.ts`** — `resolveFrameAt(state, t)` fonction pure qui calcule une frame complète à un instant fractionnaire. Sert pour la lecture continue ET le scrub. Plus de divergence silencieuse possible entre play et scrub.
- **`src/hooks/usePlaybackAnimation.ts`** — boucle setInterval ~30 fps + conversion elapsed → t + fin de lecture. Ne calcule pas la frame (délégué au resolver).
- **`src/components/overlays/`** — les 10 fichiers d'overlay (HeatmapOverlay, FieldOfViewOverlay, PassLanesOverlay, ThreatOverlay, etc.) regroupés sous un sous-dossier `overlays/` (move via `git mv`, historique préservé). `Overlays.tsx` renommé en `MatchupAndScreenOverlays.tsx`. `GhostLayer` extrait inline → fichier dédié.

### Refactor — Centralisation des constantes physiques + helpers angulaires

- **`src/lib/data/court.ts`** enrichi : `COURT_CENTERLINE_X = 300`, `CARRIER_SIDE_TOLERANCE_PX = 30`, et 5 offsets `PLAYER_*` (PLAYER_OBSTACLE_RADIUS_PX, PLAYER_PICK_RADIUS_PX, PLAYER_CLUSTER_BASE_R_PX, PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_MIN_CLEARANCE_PX). Remplace les `PLAYER_RADIUS + N` éparpillés dans CourtView, Annotations, engine.
- **`src/lib/constants/gameplay.ts`** (nouveau) — `DRIBBLE_THRESHOLD_PX = 30`, `POST_HOLD_THRESHOLD_PX = 30`. Distincts des constantes terrain car ils décrivent des comportements joueur, pas une géométrie.
- **`src/lib/logic/angles.ts`** (nouveau) — `normalizeAngle`, `angleDiff`, `lerpAngleDeg` dédupliqués entre `orientation.ts` et `vision.ts`. **Ces deux modules restent strictement séparés** : seul le math angulaire pur est mutualisé. `vision.ts` (champ de vision, gaze locks) et `orientation.ts` (corps, bras, anatomie) sont deux concepts distincts.
- **`scriptedGenerators.ts`** — helper privé `carrierBaseSign(carrier)` remplace les 7 occurrences inline `carrier.x < 300`.

### Changed — Refonte du panneau Défense pour colonne étroite (plus de débordement)
- Section **"Appliquer à tous"** : abandon de la grille 6 colonnes (qui forçait une largeur min ≥ ~340 px et débordait sur écrans en colonne étroite). Refondue en layout vertical compact : label gauche fixe (80 px) + control qui s'étire sur le reste, via les helpers `MassRow` et `MassSelect`. Tient maintenant proprement dans n'importe quelle largeur de colonne ≥ 200 px.
- Section **"Règles individuelles"** : grille passée de `1fr 1fr 1fr 1fr` à `minmax(0,1fr) ... minmax(0,1fr)` pour accepter la compression CSS, et `min-width: 0; width: 100%; box-sizing: border-box` ajouté à tous les `<select>` pour qu'ils se compressent au lieu de pousser leur conteneur.
- Bouton "Réinitialiser les overrides individuels" passe en `width: 100%` pour s'aligner sur le bloc.
- Implémentation : [`DefensePanel.tsx`](src/components/DefensePanel.tsx).

### Fixed — Téléportation du défenseur du futur porteur lors d'une passe scriptée
- Sur un scénario type **give-and-go** (O1 passe à O3 puis coupe vers le panier), pendant la transition de balle entre l'étape A (porteur=O1) et l'étape B (porteur=O3), `followDefendersAtFrame` plaçait D3 sur O1 au lieu de O3 — apparence de "téléportation" de D3 vers le centre du terrain.
- Cause : `slot.isCarrierDefender` est hérité de l'étape B (donc D3 est marqué carrier-defender pour l'étape suivante), mais `ballCarrier` interpolé selon `localT < 0.5` valait encore O1 → on tirait D3 sur O1 alors qu'il défendait son propre homme O3 qui allait recevoir la balle.
- Fix : `followDefendersAtFrame` suit désormais **`slot.matchedTo`** (l'homme assigné) au lieu de `ballCarrier`. Si l'homme assigné est le porteur courant → comportement carrier-defender, sinon off-ball — sans téléportation. Implémentation : [`engine.ts`](src/lib/logic/engine.ts).

### Added — Pilotage défensif en masse depuis le DefensePanel
- Nouvelle section **"Appliquer à tous les défenseurs"** dans le panneau Défense (au-dessus de "Règles individuelles") qui pousse une consigne sur **tous les défenseurs en un clic**. Évite les 5 clics-droits successifs pour aligner toute l'équipe sur un schéma.
- Réglages exposés en masse : `helpPct`, `priority`, `vsCarrier`, `offBallStance`, `screenNav`, `helpMode` (auto/agressif/passif/désactivé), `gazeLock` (auto/mon homme/porteur/les deux), `bodyOrientationMode` (auto/ouvert/face homme/face porteur/ligne passe à plat/ligne passe perp.). Les selects ont une option "—" qui ne déclenche rien (placeholder).
- Bouton **"Réinitialiser les overrides individuels"** : efface `distance`, `maxSpeed`, `closeoutBoost`, `denyAggressiveness`, `screenNav` sur tous les défenseurs → ils retombent sur les valeurs globales (`state.defenseDistance`, etc.).
- Implémentation : nouvelles actions `updateAllRules(patch)` et `resetIndividualOverrides()` dans [`useAppState.ts`](src/hooks/useAppState.ts) (entrée d'historique unique pour le ctrl-z), props `onUpdateAllRules` / `onResetIndividualOverrides` ajoutées à [`DefensePanel.tsx`](src/components/DefensePanel.tsx).

### Added — Toggle pour masquer le bandeau "Lecture coach"
- Nouvelle option `state.showCoachDiagnostics` (default `true`) dans [Paramètres > VISU & LÉGENDE > "lecture coach"](src/components/ParametresPanel.tsx). Quand le bandeau apparaît/disparaît selon le nombre de warnings actifs, le terrain change de taille (effet de clignotement). Le toggle permet de masquer le panneau pour un layout vertical stable. Compteur "(X actifs)" mis à jour dans `ParametresLauncher`.
- Implémentation : champ `showCoachDiagnostics?: boolean` dans `AppState` ([types/index.ts](src/lib/types/index.ts)), conditionnement du rendu dans [page.tsx](src/app/page.tsx).

### Fixed — Pointes de flèches d'annotations visibles
- Le tracé `from → to` des annotations `cut`, `dribble`, `pass` se terminait au centre du joueur cible — la pointe de flèche (`markerEnd`) était masquée par le cercle joueur rendu par-dessus. Désormais le tracé est raccourci de `PLAYER_RADIUS + 4` px (helper `shrinkEnd` / `shrinkPolylineEnd` dans [`Annotations.tsx`](src/components/Annotations.tsx)) pour que la pointe s'affiche **avant** le badge — direction du mouvement claire, surtout sur les scénarios générés (Isolation, etc.) où plusieurs joueurs reçoivent une annotation `cut` simultanée.
- Markers SVG `arrow-orange` / `arrow-gray` agrandis de 6×6 à 8×8 pour une meilleure lisibilité à l'échelle terrain ([`Court.tsx`](src/components/Court.tsx)).
- Cas couverts : ligne droite (cut, pass, dribble sans waypoints), wave dribble Q-Bezier, polyline courbe Catmull-Rom (waypoints). Screen non touché (sa barre en T se positionne sur `to` réel, pas une flèche).

---

## [0.8.0] — 2026-05-10

**Cycle "lecture animée fidèle"** : trajectoires courbes (V-cut, L-cut, freehand via Shift+drag), suivi temps-réel des défenseurs sur les courbes, hedge complet, regard auto distance-based, pause/reprise depuis l'instant t, dribble en wave lisse, lecture ralentie à 2 s/étape.

### Changed — Lecture ralentie à 1× (2 s par étape au lieu de 1,5 s)
- `playbackSpeed = 1×` correspond désormais à **2000 ms par étape** (au lieu de 1500 ms). Le slider 0.3×–2× module sur cette base : de ~6,7 s à 1 s par étape. Permet de bien lire les déplacements en vitesse normale.
- Constante centralisée dans [`physics.ts > PLAYBACK_STEP_DURATION_MS`](src/lib/data/physics.ts), importée dans [`CourtView.tsx`](src/components/CourtView.tsx) (utilisée à 2 endroits : init `playStart` au démarrage du tick, et calcul de `globalT` dans la boucle).
- Implications calibration : les vitesses max par poste (`MAX_SPEED_BY_POSITION_PX`) en px/étape ne changent pas, mais la vitesse perçue en m/s diminue (ex. ailier passe de ~2,0 m/s à ~1,5 m/s à pleine vitesse). Docs [physics.md](docs/physics.md) et [GAME-ENGINE.md](docs/GAME-ENGINE.md) mises à jour.

### Fixed — Pause fige l'instant + reprise depuis la pause
- Cliquer sur ⏸ pendant la lecture **fige l'image à l'instant t courant** au lieu de retomber sur la frame statique de l'étape active (capture possible).
- Cliquer sur ▶ après une pause **reprend depuis l'instant t pause** au lieu de redémarrer du début.
- Implémentation : à la pause, `playbackT` est propagé dans `scrubT` qui pilote `scrubFrame` ([page.tsx](src/app/page.tsx)). Au play, `scrubT` est consommé comme offset via la nouvelle prop `playbackStartT` de CourtView ([CourtView.tsx](src/components/CourtView.tsx)) qui décale `playStart` en arrière de `T × stepDuration` au démarrage du tick. Stop (⏹) reste distinct et revient à l'étape 0.

### Fixed — Tous les défenseurs suivent leurs attaquants en temps réel (carrier + off-ball)
- Pendant la lecture, chaque défenseur en marquage individuel interpolait linéairement entre sa position à l'étape A et sa position à l'étape B → il prenait la **corde** d'un arc pendant que son homme faisait un V-cut, un L-cut, un démarquage en arc ou un dribble en wave. Visuellement il coupait au plus court et lâchait son homme.
- Désormais la position de **chaque défenseur** (carrier ET off-ball) est recalculée à chaque frame (playback + scrub) à partir de la position courante de son attaquant marqué :
  - Carrier defender → `carrierDefenderTarget` (vsCarrier, distance, hoop)
  - Off-ball → `offBallStanceTarget` (stance, ball) ou `manTarget` (sag/behind)
- **Placement manuel respecté** : si l'utilisateur a posé un override de position via drag (`defenseOverrides`) sur l'une des deux étapes du segment, sa position imposée prime — pas de follow, l'interpolation linéaire est conservée.
- Les flags d'état (`helpFactor`, `helpAim`, `closingOut`, `denying`) restent ceux calculés par `effectiveDefensePositions` aux étapes A/B et interpolés. Cette fonction réécrit uniquement la POSITION de marquage de base.
- Implémentation : `followDefendersAtFrame` ([engine.ts](src/lib/logic/engine.ts)), appelée dans [`CourtView.tsx`](src/components/CourtView.tsx) (playFrame + scrubFrame) avant `resolvePlayerCollisions` et `recomputeDefenseFrameOrientations`.

### Added — Annotations en courbe (Shift+drag freehand, V-cut/L-cut)
- Les annotations `cut`, `dribble` et `screen` supportent maintenant un champ optionnel `waypoints?: Point[]` ([types/index.ts](src/lib/types/index.ts)). Avec waypoints, la trajectoire suit une **spline Catmull-Rom** (tension τ=0.5, équivalent Bezier cubique exact en rendu) au lieu d'une ligne droite.
- **UX souris** : maintenir **Shift pendant le drag** d'une annotation enregistre le tracé à main levée. À la fin du drag, le buffer brut est simplifié via Douglas-Peucker (tolérance 6 px) en 3–7 waypoints propres. Drag normal sans Shift = comportement actuel inchangé (ligne droite, dribble en wave standard).
- **Cas couverts** : V-cut, L-cut, démarquage en aller-retour, courbe libre, dribble curviligne. La passe reste rectiligne par convention.
- **Lecture fluide** : `samplePolyline` ([polyline.ts](src/lib/logic/polyline.ts)) reparamètre la spline en longueur d'arc — vitesse perçue ~constante quel que soit la courbure, le joueur ne ralentit pas dans les virages serrés.
- **Rendu** : `polylinePath` produit un path SVG en `M ... C ...` lisse, partagé entre la preview pendant le drag (mise à jour live) et l'annotation finale. La trajectoire affichée est rigoureusement la même que celle parcourue par le joueur en lecture.
- Implémentation : [`polyline.ts`](src/lib/logic/polyline.ts), intégration dans [`playbackTrajectory.ts`](src/lib/logic/playbackTrajectory.ts) et [`Annotations.tsx`](src/components/Annotations.tsx), UX dans [`CourtView.tsx`](src/components/CourtView.tsx) (handlers `onPointerDown` / `onPointerMove` / `onPointerUp`). 14 nouveaux tests unitaires.

### Changed — `hedge` : le défenseur du porteur (D1) bouge maintenant aussi
- Historiquement, en règle d'écran `'hedge'` (valeur par défaut de `state.screenRule`), seul **le défenseur du poseur (D5)** réagissait — il sortait en _show_ vers le porteur. **Le défenseur du porteur (D1) restait à sa position de base**, ce qui donnait l'impression qu'il "ne réagissait pas" à un écran posé en lecture.
- Désormais en `'hedge'`, D1 **passe over the top** de l'écran avec un décalage latéral modéré (8 à 16 px selon la proximité de l'écran), tight sur le porteur. Le couple D1/D5 ferme à la fois la pénétration et la rejection, et D1 peut recover quand D5 rentre.
- Implémentation : nouveau cas `rule === 'hedge' && isCarrierDef` dans [`applyScreenAdjustment`](src/lib/logic/screens.ts) ([screens.ts:215-229](src/lib/logic/screens.ts:215-229)).
- Pour forcer la détection d'écran indépendamment de la géométrie : utiliser **« forcer comme poseur d'écran »** dans le clic-droit attaquant ([ContextMenu.tsx:758](src/components/ContextMenu.tsx:758)) — pose `cur.forcedScreener` qui saute les checks de proximité dans `detectScreen`.

### Changed — Regard auto plus dynamique en off-ball
- En stance `sag` / `behind` / défaut (sans `gazeLock` explicite), la cible primaire du regard bascule désormais selon la **distance** : si l'homme marqué est plus proche du défenseur que le ballon (ratio < 0.65), il devient la menace immédiate à fixer ; sinon le ballon reste primary. Le secondary reste visible si le cône 120° le permet et le clamp anatomique ±60° est préservé. Rend visibles entre étapes les transitions de regard quand l'attaquant marqué se rapproche/s'éloigne. Implémentation : [`vision.ts`](src/lib/logic/vision.ts).

### Fixed — Tracé du dribble en wave lisse (plus de zigzag)
- Le path SVG du dribble était une polyligne `L` chainée à ±5 px de l'axe → effet "dents de scie". Remplacé par une chaîne de courbes quadratiques Bezier (`Q`) avec jonctions C1 sur l'axe : courbe lisse, amplitude visuelle équivalente. [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) suit la même géométrie pour que la position du joueur reste alignée pixel-près avec le tracé rendu.

### Added — Actions jouées en lecture (annotations pilotent la trajectoire)
- Les annotations `dribble` / `cut` / `screen` dessinées sur une étape **pilotent réellement le mouvement** des joueurs en lecture, plus juste un schéma décoratif. Spec : [docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md](docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md), plan d'implémentation : [docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md](docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md).
- **Drag = annotation implicite** : déplacer un attaquant entre étapes auto-crée l'annotation correspondante (`dribble` si porteur, sinon `cut`). Plus de drag "neutre" qui ne raconte rien.
- **Dribble** : le porteur suit la **wave ondulée** dessinée pendant le segment, plus une ligne droite. Échantillonnage via [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) qui partage la même géométrie que le tracé SVG (le joueur est exactement sur la ligne rendue à chaque instant `t`).
- **Écran** : le poseur **arrive au point d'écran à mi-segment** (vitesse double sur la première moitié), puis **tient sa position en posture d'écran** avec le **regard pointé vers le défenseur du porteur** — flag `isScreening` propagé via [`attackerTrajectoryAt`](src/lib/logic/playbackTrajectory.ts) puis override de `gazeOrientation` côté [`CourtView.tsx`](src/components/CourtView.tsx).
- **Invariante** : exactement une annotation de mouvement (`cut|dribble|screen`) par attaquant qui bouge entre N et N+1. `pass` reste non-mouvement et peut coexister avec un mouvement.
- **Migration legacy auto-générée** : [`ensureAnnotationsForMovement`](src/lib/logic/migrateAnnotations.ts) scanne les transitions des templates / scripted actions / localStorage et génère les annotations manquantes. Idempotente. Les écrans existants (Spain PNR, Floppy, etc.) sont migrés en `cut` faute de signal explicite — ils suivent la trajectoire mais sans hold posture-écran (à raffiner ensuite côté `compileScenario.ts`).

### Changed — API de mutation centralisée
- Nouveau module [`stepMutations.ts`](src/lib/logic/stepMutations.ts) : seul point de mutation de `Step.off` et `Step.annotations`. Expose 4 helpers purs : `setPlayerPositionAt`, `upsertMovementAnnotation`, `upsertPassAnnotation`, `removeAnnotation`. Maintiennent l'invariante par construction (sync amont/aval, snap-back en suppression, cascade sur les `from` aval).
- [`useAppState.ts`](src/hooks/useAppState.ts) : `moveAttacker`, `addAnnotation`, `clearAnnotationsFor`, `deleteLastAnnotation`, `deleteAnnotation` routent désormais via ces helpers. Plus de mutation directe de `cur.off` / `cur.annotations` dans le hook.

### Changed — Vision humaine refondée
- Factorisation de la logique de vision humaine dans [`vision.ts`](src/lib/logic/vision.ts) : clamp tête ±60°, cône 120°, priorité homme/porteur et midpoint angulaire quand les deux peuvent coexister dans le champ de vision.
- Recalcul du triangle et du champ de vision depuis la position réelle affichée pendant les frames animées (playback + scrub), après interpolation, contournement et collisions, via `recomputeDefenseFrameOrientations`.
- Orientation du corps défensive plus basket : open stance angulaire `ball-you-man` (midpoint angulaire non biaisé par la distance), `deny-3q` (65%) / `stunt` (70%) biaisés côté ballon, `fronting` face à la passe, `behind` priorise l'homme.
- Clamp anatomique passé de ±90° à ±60° pour s'aligner sur le cône FOV (cohérence vision périphérique humaine).
- Menu clic-droit défenseur **corps** (`BodyOrientationMode`) : consignes `auto`, `ouvert homme/ballon`, `face homme`, `face porteur`, `ligne passe à plat`, `ligne passe perpendiculaire`. Le slider absolu `bodyOrientation` reste prioritaire.

### Tests
- 38 nouveaux tests Vitest pour les actions jouées en lecture : `dribbleWave` (10), `stepMutations` (18), `migrateAnnotations` (6), `playbackTrajectory` (7).
- Tests étendus pour la vision humaine : `orientation.test.ts` (+143 lignes), `engine.test.ts` (+25), `invariants.test.ts` (+13).
- Suite totale : **277 tests verts**.

---

## [0.7.0] — 2026-05-09

**Cycle "pictogramme + champ de vision + overrides manuels"** : convention B asymétrique, invariants anatomiques, champ de vision en cône heatmap (3 toggles : tous / défenseurs / attaquants), sliders manuels corps + regard pour défenseurs ET attaquants, design des bras figé (Design F après comparaison de 8 candidats), Paramètres déplacés en pop-up à gauche.

Highlights :
- **Champ de vision** par joueur : cônes heatmap cyan (défenseurs) / orange (attaquants), 120° d'ouverture, jusqu'aux limites du terrain. Heatmap croisée par superposition. 3 toggles globaux + clic-droit individuel par défenseur.
- **Invariants anatomiques inviolables** : regard ∈ ±60° du corps (= demi-ouverture du cône de vision), aucun bras dans le dos, porteur statique → panier (ou direction de dribble si > 30 px).
- **Sliders manuels orientation corps + regard** dans le clic-droit, pour défenseurs ET attaquants.
- **Design des bras figé** (Design F) après comparaison de 8 variantes via `/demo-arms`.
- **UI** : panneau Paramètres déplacé à gauche en pop-up modal (style LibraryPanel).

### Changed — Pictogramme : retour aux bras stylisés FIBA STATIQUES
- [`Player.tsx`](src/components/Player.tsx) : suppression du wrapper `transform="rotate(orientation, ...)"` autour des bras. Les arcs FIBA stylisés restent **toujours au-dessus du joueur**, identiques pour tous, peu importe stance ou orientation tactique.
- La direction du **regard** reste matérialisée par le **triangle pointeur** (`facing`), avec son clamp anatomique `gaze ∈ ±60° du body` qui reste actif (impossible de regarder derrière la tête).
- La logique métier (`bodyOrientation`, `gazeOrientation`, `armBallSide`, `armManSide` calculés en convention B) reste dans le data model pour usage futur (overlay debug, slider manuel, champ de vision).

### Changed — UI : panneau Paramètres déplacé en pop-up à gauche
- Nouveau composant [`ParametresLauncher.tsx`](src/components/ParametresLauncher.tsx) — bouton compact dans la colonne gauche (sous "Actions") qui ouvre une **modal centrée** avec tout le contenu de `ParametresPanel` (VISU & LÉGENDE + INDICATEURS AUTO + bouton sens d'attaque).
- Style cohérent avec [`LibraryPanel.tsx`](src/components/LibraryPanel.tsx) (même look bouton + modal).
- Compteur "(X actifs)" sur le bouton pour donner un retour visuel rapide du nombre d'options activées.
- Modal fermable par Échap, clic extérieur, ou bouton ×.
- Le panneau Paramètres a quitté la colonne droite — celle-ci ne contient plus que le DefensePanel, libérant de la verticale pour la simulation.

### Added — Champ de vision : toggle global "tous joueurs" + heatmap croisée
- Nouveau toggle global **"champ de vision (tous)"** dans le menu Paramètres (VISU & LÉGENDE) : active le cône de vision sur **tous les joueurs** (défenseurs + attaquants) en un clic. Stocké dans `state.showFieldOfViewAll`.
- Combiné par OR logique avec les toggles individuels (clic-droit défenseur) — l'un OU l'autre suffit pour afficher un cône.
- **Heatmap croisée** : quand plusieurs cônes se superposent, l'opacité s'accumule naturellement (cyan plus dense), matérialisant les zones du terrain les mieux couvertes (vues par plusieurs défenseurs simultanément).
- `FieldOfViewOverlay.tsx` étendu pour accepter aussi attaquants (`off` + `attVisuals`) et le toggle global.

### Added — Champ de vision défenseur (cône heatmap)
- Activable individuellement par défenseur via clic-droit → checkbox **"champ de vision"** (`rule.showFieldOfView`).
- Cône cyan semi-transparent (opacité 0.18) avec contour pointillé, centré sur le `gazeOrientation` du défenseur, ouverture 120° (60° de chaque côté du regard, vision humaine focale + périphérique nette), profondeur 200 px (~5,4 m).
- Composant [`FieldOfViewOverlay.tsx`](src/components/FieldOfViewOverlay.tsx) — rendu en arrière-plan des sprites joueur pour ne pas masquer les pictogrammes.
- Indépendant du triangle pointeur (regard) : on peut activer le cône pour visualiser la zone d'attention élargie en plus du regard pointu.

### Added — Convention B : bras asymétriques + invariants anatomiques
- **2 cibles distinctes** par joueur (`armBallSide` / `armManSide`) calculées par rôle dans [`orientation.ts`](src/lib/logic/orientation.ts) :
  - Off-ball sag : un bras vers ballon, un vers homme (open stance).
  - Fronting : 2 bras dans la ligne de passe homme→ballon.
  - Deny-3q / stunt : un bras dans la ligne de passe (intercepter), un sur l'homme.
  - PnR tag/x-out/stunt : un bras vers la zone de menace, un sur l'homme original.
  - On-ball : 2 bras vers le porteur (contestation).
  - Porteur statique : 2 bras vers le panier ; **en dribble (delta prev→cur > 30 px) → 2 bras vers la direction du mouvement**.
  - Cutter : 2 bras vers la destination de coupe.
  - Screener : 2 bras vers le défenseur ciblé (corps perpendiculaire pour bloquer la trajectoire).
  - Idle : 2 bras vers le porteur (demande la passe).
- **Invariants anatomiques inviolables** :
  - Le `gaze` (regard) est CLAMPÉ à ±60° du `body` (corps) — impossible de regarder derrière sa tête.
  - Aucune cible de bras ne tombe en dehors du demi-cercle frontal du corps — impossible d'avoir un bras dans le dos.
  - Ces clamps priment sur tout calcul auto et tout override manuel.
- `ComputedDefender` et `ComputedAttacker` étendus avec `gazeOrientation`, `armBallSide`, `armManSide`.
- `Player.tsx` : nouveau rendu — 2 bras tracés depuis les épaules (perpendiculaires au regard) vers leurs cibles, avec courbure vers l'avant. Fallback sur les arcs FIBA symétriques si les cibles ne sont pas fournies.
- 9 tests neufs (197/197 verts) dont l'invariant anatomique sur les 7 playbooks de la lib (gaze ∈ ±60° du body pour tous les joueurs à toutes les étapes).
- `DefenderRule` étendu avec `bodyOrientation?` (override absolu corps 0–360°) et `gazeLock?` (`opponent` / `ball-carrier` / `both`, clampé ±60° du corps). Le slider legacy `orientation` (delta ±45°) reste supporté.

### Fixed — Pictogramme joueur : convention FIBA respectée
- [`Player.tsx`](src/components/Player.tsx) : bras stylisés **statiques** au-dessus du cercle, identiques pour attaquants et défenseurs. Suppression de la rotation `transform="rotate(orientation, ...)"` ajoutée en 0.6.0 qui faisait tourner les bras avec l'orientation calculée — convention non-FIBA, produisait des bras anatomiquement incohérents (impression de bras "dans le dos" du joueur, ou tous orientés vers le panier).
- Référence : [FIBA Europe Basketball Terminology](https://www.fiba.com/) — les pictogrammes joueur conservent toujours la même posture quelle que soit l'action ; le sens du jeu se lit via les flèches d'action (passes / courses / écrans).
- Le triangle pointeur `facing` reste affiché comme info de debug discrète (où le défenseur regarde selon stance + ballon).
- La logique métier `computeDefenderOrientation` / `computeAttackerOrientation` reste utile pour les calculs internes (lateralOffset, decisions tactiques) mais n'influence plus le rendu visuel des bras.

---

## [0.6.0] — 2026-05-09

**Cycle "fidélité basket"** : orientation calculée, anti-téléportation, rim protection sur drive, vue debug aide, refactor physics centralisé, toggles fine. 73 nouveaux tests (111 → 188), 4 nouveaux modules ([`orientation.ts`](src/lib/logic/orientation.ts), [`physics.ts`](src/lib/data/physics.ts), [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) + tests d'invariants), 3 nouvelles docs ([`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md), [`docs/physics.md`](docs/physics.md), [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md)).

Highlights :
- **Orientation des joueurs** dérivée automatiquement de stance / ballon / homme / écran (avant : statique, manuelle).
- **Plus de téléportations** d'attaquants : interpolation avec contournement d'obstacles + diagnostic warning si saut > 4 m.
- **Rim protection** sur drive (tag and recover du big) : le pivot step-up sur la trajectoire au lieu de rester sur le post adverse.
- **`physics.ts`** : un seul module pour tuner toutes les constantes physiques (vitesses par poste, closeoutBoost, screenRadius, etc.) avec sémantique en mètres réels.
- **Vue debug aide** : flèches défenseur → cible d'aide avec pourcentage et tag de priorité, pour comprendre ce que la logique calcule.
- **8 toggles fine** dans la légende pour masquer chaque sous-visuel indépendamment.

### Added — Toggles légende fine (8 sous-visuels indépendants)
- 8 nouveaux toggles dans INDICATEURS AUTO ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)) : `showZoneTracking`, `showContestedPass`, `showBlockedPass`, `showOffBallScreenIndicator`, `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`. Default `true` — UX existante préservée.
- Combinés en ET logique avec leur master quand pertinent (`showLateRing && showStateRings`, `showForcedScreenerBadge && showLockBadges`, `showOffBallScreenIndicator && showScreenIndicators`). Permet de masquer un visuel précis sans tout couper.
- [`PassLanesOverlay.tsx`](src/components/PassLanesOverlay.tsx) accepte `showContested` / `showBlocked` pour filtrer les catégories indépendamment.
- [`Player.tsx`](src/components/Player.tsx) accepte `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`.
- Avant : ces 8 visuels étaient dans une légende **non-toggleable** (juste affichage du code couleur). Maintenant chaque ligne est une checkbox active.

### Changed — Refactor : module `physics.ts` centralisateur
- Toutes les constantes physiques regroupées dans [`src/lib/data/physics.ts`](src/lib/data/physics.ts) : `MIN_PLAYER_CLEARANCE_PX`, `DEFAULT_DEFENSE_MAX_SPEED_PX`, `DEFAULT_DEFENSE_DISTANCE_PX`, `DEFAULT_CLOSEOUT_BOOST`, `DEFAULT_DENY_AGGRESSIVENESS`, `MAX_SPEED_BY_POSITION_PX`, `DEFAULT_SCREEN_RADIUS_PX`, `RIM_PROTECTION_DROP_ZONE_PX`. Helpers `metersToPx` / `pxToMeters`.
- Migration des call-sites :
  - [`engine.ts`](src/lib/logic/engine.ts) : `DEFAULT_CLOSEOUT_SPEED_FACTOR`, `0.45` (denyAggressiveness fallback), `PLAYER_RADIUS * 2 + 2` × 2.
  - [`manDefense.ts`](src/lib/logic/manDefense.ts) : `MIN_TARGET_DIST` inline.
  - [`screens.ts`](src/lib/logic/screens.ts) : `pushOutOfScreener` clearance.
  - [`help.ts`](src/lib/logic/help.ts) : drop zone `75` (rim protection).
  - [`initial.ts`](src/lib/data/initial.ts) : `defaultRules.maxSpeed` × 5, `defenseDistance`, `defenseMaxSpeed`, `screenRadius`, `closeoutBoost`, `denyAggressiveness`.
- Aucun changement de comportement : 188/188 tests verts, valeurs strictement préservées.
- Nouvelle doc [`docs/physics.md`](docs/physics.md) avec sémantique en mètres réels (PX_PER_M=37, vitesses en m/s par poste, distances en m) et guide de tuning.

### Fixed — Rim protection sur drive (étape B)
- [`help.ts`](src/lib/logic/help.ts) branche `priority='paint'` : quand `trigger.drive` est actif, l'aim devient la **drop zone** (point sur la ligne porteur→panier à 75 px du panier) plutôt que de rester collé sur un post adverse à <120 px d'un low-block. Implémente le **tag and recover** classique du pivot.
- Avant : si un attaquant campait en strong high, le pivot le suivait au lieu de fermer la trajectoire de drive — D5 ne step-up pas, le porteur arrivait sous le cercle libre.
- 4 tests TDD ([`help.test.ts`](src/lib/logic/__tests__/help.test.ts)) : helpAim sur la ligne, ≠ pivot adverse, dans la drop zone 50–150 px, et régression sans trigger drive.

### Added — Vue debug d'aide défensive
- Toggle `state.showHelpDebug` dans VISU & LÉGENDE ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)).
- Nouveau composant [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) : pour chaque défenseur dont `helpFactor > 10%`, flèche pointillée du défenseur vers `helpAim` (cible idéale avant blend), avec badge `xx% · PRIORITÉ`. Couleurs distinctes pour priorité paint / man / passlane, denial strong-side, et rotations PnR (tag/x-out/stunt).
- `HelpResult` étendu avec `aim`, `priority`, `kind` ('sag-weakside' / 'denial-strongside' / 'active-help' / 'none').
- `ComputedDefender` étendu avec `helpAim`, `helpPriority`, `helpKind`. Les rotations PnR écrasent ces champs avec leur cible spécifique.

### Added — Orientation calculée des joueurs (P6)
- Module pur [`orientation.ts`](src/lib/logic/orientation.ts) avec `computeDefenderOrientation`, `computeAttackerOrientation`, `lerpAngleDeg`.
- `ComputedDefender` reçoit `orientation: number` + `facing: Point` calculés depuis stance / ballon / homme / pnrRole.
- Nouveau `computeAttackerVisuals(state, stepIdx)` qui détecte les rôles offensifs (carrier / passer / cutter / screener / idle) et produit `Record<AttackerId, { orientation, facing }>`.
- Le poseur d'écran s'oriente perpendiculairement à la ligne vers le défenseur ciblé (épaule de blocage).
- Le delta manuel `state.rules[id].orientation` est conservé comme **override clampé à ±45°** au-dessus du calcul auto.
- Bras FIBA + triangle pointeur étendus aux attaquants ([`Player.tsx`](src/components/Player.tsx)).
- Lerp angulaire dans [`CourtView.tsx`](src/components/CourtView.tsx) (plus court chemin sur le cercle).

### Added — Anti-téléportation des attaquants
- Interpolation des attaquants utilise désormais `pickBlockingCluster` + `curveAroundObstacle` (mêmes primitives que les défenseurs) pour contourner les autres joueurs entre étapes.
- Diagnostic [`coachDiagnostics.ts`](src/lib/logic/coachDiagnostics.ts) `tag: 'attacker-jump'` : warning si un attaquant parcourt > 4 m sur une étape.

### Added — Tests
- [`orientation.test.ts`](src/lib/logic/__tests__/orientation.test.ts) — 12 cas (stance × ballon × homme).
- [`invariants.test.ts`](src/lib/logic/__tests__/invariants.test.ts) — 35 cas rejouant les 7 playbooks de la lib (chevauchements, vitesse défensive bornée, sauts attaquants ≤ 5,5 m, orientations valides).
- [`zoneDefense.test.ts`](src/lib/logic/__tests__/zoneDefense.test.ts), [`zoneSituations.test.ts`](src/lib/logic/__tests__/zoneSituations.test.ts) — couverture du moteur ownership et des situations zone.

### Fixed
- **Top-lock** ([`screens.ts`](src/lib/logic/screens.ts)) : la branche `top-lock` ignorait explicitement le ballon (`void ballPos`) et plaçait le défenseur du shooter dans la direction screener→cutter au lieu de côté ballon. Signature de `applyOffBallScreenAdjustment` étendue avec `ballPos: Point`, calcul du `sideOfBall` par projection sur la perpendiculaire de l'axe d'écran.
- **Paint helper** ([`help.ts`](src/lib/logic/help.ts)) : `priority='paint'` applique maintenant un coefficient de proximité au `helpFactor` (1.0 si dist ≤ 120 px, dégradé jusqu'à 0.4 à ≥ 280 px). Avant : un coin opposé était tiré aussi fort qu'un wing strong-side.
- **Écrans fantômes** ([`screens.ts`](src/lib/logic/screens.ts)) : nouveau filtre `hasScreenIntent` qui rejette les attaquants en train de S'ÉLOIGNER du couple porteur/défenseur (mesure delta de distance entre étape précédente et courante). Bypass quand l'utilisateur a explicitement défini un `forcedScreener`.
- **`isShortCorner`** ([`zoneSituations.ts`](src/lib/logic/zoneSituations.ts)) : la v1 exigeait `dHoop < 130 ET lateral > 130` — mathématiquement impossible (sqrt(lat²+vert²) ≥ lat). La fonction ne matchait jamais → le boost critique `criticalMult = 1.4` n'était jamais appliqué sur un attaquant en short corner. Corrigé : `lateral > 130 ET vertical < 100 ET dHoop < 250`.

### Documentation
- Nouveau [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md).
- Nouveau [`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md) — cartographie individuel / collectif / physique.
- Nouveau [`CHANGELOG.md`](CHANGELOG.md).
- Mises à jour [`ROADMAP.md`](ROADMAP.md), [`docs/README.md`](docs/README.md), [`docs/logique-defensive.md`](docs/logique-defensive.md), [`docs/testing.md`](docs/testing.md).

---

## [0.5.0] — 2026-05-08

### Added — P0–P5 enrichissement basket
- **P0** Détection PnR enrichie : `roll`, `pop`, `slip`, `short-roll`, `ghost`, `reject`, `snake`, `re-screen` (`screenAction.ts`).
- **P1** Rotations PnR automatiques : low-man tag du roller, X-out sur l'orphelin, nail stunt depuis le high post (`pnrRotations.ts`).
- **P2** Couvertures PnR explicites : `ice` (force baseline), `weak` (under léger), `peel-switch` (drop puis switch déclenché par `peelSwitchShouldFire`).
- **P3** Comportement zone réaliste : overload détection, `isShortCorner` et `isHighPost` boost le claim, skip pass diagnostiqué (`zoneSituations.ts`).
- **P4** Écrans non-porteur enrichis : top-lock, chase, et reconnaissance d'enchaînements stagger / elevator / hammer / flex (`upgradeOffBallScreens` dans `screens.ts`).
- **P5** Lectures offensives auto : map couverture défense → opportunité offensive en vocabulaire coach (`tacticalReads.ts`).

### Added — Bibliothèque v2
- Dossiers personnels, sauvegarde locale (localStorage), export / import JSON par dossier.
- Modal centrée pour la bibliothèque, intégrée dans le panneau gauche.

---

## [0.4.0] — 2026-05-08

### Added — Refonte zone + physique + profils
- **Moteur ownership zone continu** : claims gaussiens × `naturalBonus` × `carrierBonus`, normalisation en parts par attaquant, primary = part max, blend `homePos` ↔ `trackedPos` proportionnel à l'engagement. Élimine les sauts de priorité aux frontières des polygones (`zoneDefense.ts`).
- **Physique 3 leviers** : longueur d'arc `pathArcLength` (le défenseur "paie" un détour Bezier autour d'un cluster), `proximityFriction` (vitesse réduite quand le trajet frôle un joueur non-matché), `pre-relaxation` (cible repoussée hors d'un attaquant non-matché avant l'application de `maxSpeed`).
- **Profils offensifs** (`OffensiveProfile`) : `creator`, `shooter`, `slasher`, `rim-roller`, `stretch-big`, `non-shooter`. Modulent shotQuality dans `threats.ts`, le coût de quitter dans `help.ts` (`leaveAttackerCostMultiplier`), et le bump closeout (`closeoutProfileBonus`).
- **Diagnostics coach** (`coachDiagnostics.ts`) : closeout long, low-man tag manquant, mismatch après switch, corner abandonné, gap périmètre, helper triggé... vocabulaire métier.
- **Profils défensifs** : 10 rôles applicables par défenseur (stopper, helper, denier, drop-big...) qui pré-règlent la rule via merge superficiel.

---

## [0.3.0] — 2026-05-07

### Added — Simulation tactique
- **Phase A** — score de menace par attaquant (`threats.ts`) : `shotQuality × receivability` avec 5 zones de tir, modulation contestée / ouverte, profils.
- **Phase B** — évaluation des options offensives (`offense.ts`) : tir, drive, passe + tir (un par coéquipier). Flèche "meilleure action" sur le porteur.
- **Phase C** — Monte Carlo de possessions (`simulator.ts`) : PPP, eFG%, distribution des outcomes. Reproductibilité avec RNG seedé (mulberry32).

---

## [0.2.0] — 2026-05-07

### Added
- **Vitesses max individuelles** par défenseur (`rule.maxSpeed`) — réduit la téléportation sur aides longues. Default selon le poste : meneur 145, arrière 130, ailier 110, ailier fort 90, pivot 75.
- **Distance per-défenseur** dans le menu clic-droit (`rule.distance` override `state.defenseDistance`).
- **`helpMode` per-défenseur** : `auto` / `aggressive` / `passive` / `disabled`.
- **`closeoutBoost` et `denyAggressiveness`** override individuels.
- **Mode édition de zones** : drag des sommets de polygone, drag du homePos, comportements par région (`auto` / `agressif` / `passif` / `trap`).
- **Préférence matchup naturel** en zone (`naturalBonus = 1.2` sur D3↔O3 etc).
- **Orientation manuelle du défenseur** en degrés (rotation du corps + 2 bras FIBA), un seul curseur ±90°. → étendu en P6 (cf. Unreleased).
- **Stance off-ball influence position** (`sag` / `deny-3q` / `fronting` / `behind` / `stunt`).
- **Main dominante** par attaquant (`attackerHands`) — informatif pour le coach.

### Changed
- Timeline regroupée sur une ligne unique (play / stop / scrub / vitesse).
- Restructure 4 panneaux : Actions + Attaque (gauche) / Défense + Paramètres (droite).
- Mode plein écran + visualisation 2-col ouverte par défaut.

### Fixed
- Téléportation D3 sur ballon en zone — corrigée par le tracking continu basé homePos.
- Hydration `<style>` Next.js — bornage strict de la colonne centrale par grid.
- Overflow vertical du panneau défense — pack des triggers + visualisation fermée par défaut.

---

## [0.1.0] — 2026-05-06

### Added — Premier jet
- Simulateur tactique basket en Next.js client-only.
- 5 attaquants + 5 défenseurs sur demi-terrain SVG, drag & drop.
- 4 conventions de tracé : passe (pointillés), dribble (zig-zag), course (ligne pleine), écran (T).
- Construction d'un système en étapes (keyframes), scrubber timeline, lecture animée.
- Bibliothèque de 7 systèmes : PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy, Hammer.
- Défense individuelle (homme à homme) avec règles d'écran : over / under / switch / hedge / drop / blitz.
- Défense de zone : 4 layouts (2-3, 1-3-1, 3-2, match-up).
- Métriques temps réel : couverture raquette, gap max, écart moyen, défenseurs en retard, intensité d'aide.
- Lignes de passe colorées (ouverte / contestée / bloquée).
- Indicateurs visuels : cercle violet sur le poseur d'écran, bras FIBA stylisés.
- Export Playbook PDF via `window.print()`.
- Persistance localStorage automatique (debounce 400 ms).
