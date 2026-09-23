# Plan priorisé — comportements physiques des joueurs

> Audit 2026-07-01 : déplacement, écrans, ralentissements, logique,
> contournements, lignes de passe, positionnement weak-side.
> Priorisation alignée sur la stratégie **coaching-first** (enseigner
> les systèmes > simuler le match).
>
> Sources : [SCREEN-ENGINE.md](SCREEN-ENGINE.md),
> [physics.md](physics.md), [physics-calibration.md](physics-calibration.md),
> [logique-defensive.md](logique-defensive.md), IDEAS.md, ROADMAP.md.

Effort : **S** ≤ ½ journée · **M** 1-2 jours · **L** chantier multi-sessions.

> **État au 2026-07-02 : P0 ✅ · P1 ✅ · P2 ✅** (9 commits, 2279 tests
> verts). L'audit d'exécution a révélé que plusieurs items P3/P4 étaient
> déjà livrés par des chantiers antérieurs (voir re-scopes ci-dessous) —
> le backlog restant réel : P3.1-V1 (rampe d'accélération défenseur),
> P3.3 (congestion — tests RED écrits), P3.5 (lead pursuit closeout),
> P4.1 (porteur shoulder-to-shoulder), P4.3, P4.4.

---

## Activation par défaut (2026-09-23)

P3.3, P3.1 (+ poursuite V4) et P3.5 font partie du profil « Réaliste »
(`PRESET_REALISTIC`, profil par défaut de l'application) ; les options
restent désactivables une à une. P1.1, P1.4, P2.1 et P2.2 sont regroupées
sous la case coach « Placement défensif avancé » (`advancedPlacementPatch`,
`defensePresets.ts`). Garde-fou : `realisticDefenseGuard.test.ts`.

---

## P0 — Fondation (à faire avant tout le reste)

### ✅ P0.1 — Dé-doublonner la logique ball-side / weak-side / aide 〔M〕 (livré 2026-07-01)

> Livré : module pur [`src/lib/logic/courtSides.ts`](../src/lib/logic/courtSides.ts)
> (`sideWithTolerance` / `strictSide` / `binarySide` / `ballSide` /
> `attackerSide` / `isWeakSide` / `isStrongSide`). Les deux sémantiques
> historiques (bande centrale vs signe strict) sont conservées telles
> quelles — les unifier serait un changement de comportement, hors scope.
> Consommé par `help.ts`, `zoneDefense.ts`, `manDefense.ts` ; ré-exports
> de compat dans `geometry.ts` et `zoneSituations.ts` (zéro caller touché).
> Refacto bit-identique : 2229 tests verts, +11 tests unitaires
> `courtSides.test.ts`.

**Pourquoi d'abord** : la logique « quel côté du terrain, qui est en
position d'aide » est dupliquée sur 3 modules (noté IDEAS.md § dette).
Tous les items P1/P2 weak-side se feraient en triple sans ce refactor.

- Extraire un module pur `defense/courtSides.ts` (ou similaire) :
  côté ballon, côté attaquant, « à une passe / deux passes »,
  helpers strong/weak.
- Refactor pur, comportement bit-identique, tests d'équivalence sur
  les 7 playbooks classiques (pattern déjà utilisé pour CVT 1.1).
- Risque : faible. Aucun changement visuel.

---

## P1 — Coaching visible (valeur pédagogique directe)

### ✅ P1.1 — Split-line / help-side stance weak-side 〔M〕 (livré 2026-07-01)

> Livré : branche `helpside-splitline` dans `computeHelpTarget` (help.ts),
> opt-in `state.helpSideStanceEnabled` (toggle DefensePanel « stance split
> line »). Conditions : weak-side + homme à ≥ 250 px du ballon
> (`HELP_SIDE_TWO_PASSES_PX`) + pas de trigger. Cible = axe panier à hauteur
> du ballon, pull `HELP_SIDE_SPLIT_LINE_PULL = 0.85` × helpPct/100 ×
> leaveMultiplier. À une passe, le sag legacy reste. 9 nouveaux tests
> (6 unitaires help + 3 intégration pipeline), 2238 verts.

Le concept d'enseignement n°1 absent du moteur : un défenseur à deux
passes du ballon se positionne sur la **ligne médiane** (split line),
un pied dans la raquette — pas juste un sag proportionnel.

- Étendre `help.ts` : quand défenseur weak-side ET homme à ≥ 2 passes,
  cible = projection vers la split line (blend tunable, opt-in
  `state.helpSideStanceEnabled` puis default on après validation).
- Dépend de P0.1.
- Tests : positions attendues sur spacing 5-out et 4-out ; invariants
  overlap ; pas de régression sag baseline (`help.test.ts`).
- Visible sur **chaque** diapo de séance → meilleur ratio valeur/effort
  du plan.

### ✅ P1.2 — Côté de contournement selon la règle over/under 〔S-M〕 (re-scopé 2026-07-02)

> **Déjà couvert par le moteur de routes** — le TODO d'IDEAS.md qui a
> motivé cet item était obsolète. `carrierScreenRoutePreference` /
> `offBallScreenRoutePreference` (screenPhysics.ts) produisent le
> `forcedPushSign` consommé par frameResolver : under/weak → côté
> panier, over/hedge/drop/blitz/peel-switch → côté opposé, ice → côté
> opposé au porteur, switch → pas de route ; off-ball routé par type
> (backscreen/flex/hammer côté panier, flare chase/under, elevator gap).
> Livré P1.2 : 4 tests garde-fous du contrat porteur dans
> `screenPhysicsRoute.test.ts` + TODO IDEAS.md corrigé. Le seul cas
> encore « automatique » = défenseurs périphériques hors contact, où
> le côté géométrique est le bon comportement basket.

### ✅ P1.3 — Overlay pédagogique triangle ballon-homme-panier 〔S〕 (livré 2026-07-02)

> Livré : helper pur `defenseTriangleOverlayData` + `triangleVerdict`
> (defenseTriangle.ts) — verdict open (≤ 120° = cône de vision) / wide /
> flat (> 150°, aligné). Composant `DefenseTriangleOverlay` (triangle
> translucide + 2 lignes de vision + badge d'angle coloré), toggle
> « triangles vision défense » dans Paramètres → VISU & LÉGENDE
> (`state.showDefenseTriangles`). Diag-only, défenseur du porteur exclu.
> 6 tests, vérifié en preview.

`defenseTriangle.ts` calcule déjà les angles ; rien ne l'affiche.

- Overlay SVG opt-in (toggle Indicateurs auto) : triangle + angle par
  défenseur sélectionné, code couleur bon/fermé.
- Diag-only, zéro impact physique — même pattern que l'overlay debug
  écran. Risque quasi nul.

### ✅ P1.4 — Shrink weak-side sur drive naissant 〔M〕 (livré 2026-07-02)

> Livré : détecteur pur `detectEarlyDrive` (triggers.ts) — rampe 0..1
> sur le delta porteur→panier (10→25 px = seuil du vrai trigger drive),
> gated à 350 px du panier. Option `earlyDriveShrink` de
> `computeHelpTarget` : approfondit le sag ET la split line weak-side
> de `intensité × EARLY_DRIVE_SHRINK_BOOST (0.35)`, capé à 1.
> Neutralisé dès que l'aide active se déclenche (triggers.any).
> Opt-in `state.weakSideShrinkEnabled` (toggle DefensePanel).
> 12 tests (7 détecteur + 3 help + 2 intégration), 2260 verts.

---

## P2 — Lignes de passe (l'axe le moins développé du moteur)

### ✅ P2.1 — Jump the passing lane pendant le vol du ballon 〔M〕 (livré 2026-07-02)

> Livré : helper pur `passLaneJumpOffset` (passLaneJump.ts) — pendant le
> vol d'une passe (carrierA ≠ carrierB), tout défenseur à < 60 px de la
> ligne passeur→receveur (endpoints stables) fait un pas dans la ligne
> (max 12 px, enveloppe sin(π·t) → nul aux bornes, jamais au-delà de la
> ligne). Injecté dans resolveFrameAt après followDefendersAtFrame,
> avant collisions ; exclusions : screen-locked, closeout (le défenseur
> du receveur sprinte sur son homme), overrides. Opt-in
> `state.jumpPassingLanesEnabled` (toggle DefensePanel). 11 tests
> (7 helper + 4 intégration frame-level), batterie écran complète verte.

### ✅ P2.2 — Deny du reversal au nail 〔S-M〕 (livré 2026-07-02)

> Livré : branche nail dans `computeHelpTarget` (avant le denial
> strong-side legacy). Conditions : ballon sur une aile + homme en tête
> (bande centrale ±30 px) + pas de trigger + `priority ≠ paint`
> (cohérent avec le denial legacy). Cible = nail (axe panier, hauteur
> lancers francs `FT_LINE_Y`, miroité si panier inversé), intensité
> pilotée par `denyAggressiveness`. Opt-in `state.denyReversalEnabled`
> (toggle DefensePanel « deny du reversal au nail »). 8 tests TDD.

### ✅ P2.3 — Interceptions visibles hors mode match 〔S〕 (re-scopé 2026-07-02)

> **Déjà couvert par l'existant** — l'audit initial avait manqué deux
> briques : `PassLanesOverlay` affiche les lignes de passe contestées /
> bloquées en édition et lecture (toggles `showContestedPass` /
> `showBlockedPass`, default on), et la règle coach `passOpenRule`
> (registry coachDiagnostics) signale les lignes OUVERTES vers une
> menace (`receivability` + score, warning/critical). Le « badge passe
> risquée » demandé existe donc des deux points de vue (défense :
> ligne ouverte à fermer ; attaque : passe contestée/bloquée).
> Aucun code nécessaire.

---

## P3 — Réalisme du mouvement (gains visuels, chantiers plus lourds)

### ✅ Continuité des gestes d'édition (septembre 2026)

Le cap de vitesse défensive pendant un drag attaquant est désormais
systématique. `defenderDragInertiaEnabled` commande les effets supplémentaires
d'appuis, de regard et de fatigue. La vitesse de base tient compte du
`maxSpeed`, de la durée de l'étape et du profil de vitesse du défenseur ;
le temps consommé par un tick est plafonné à 50 ms.

Le drag et son rattrapage partent des positions affichées. Au relâchement,
la poursuite continue jusqu'à convergence, sans snap au-delà de 200 px ni
arrêt après 500 ms. Un nouveau drag reprend à l'endroit visible. Le déplacement
groupé de défenseurs utilise aussi les positions affichées comme origines.

La régression de zone 2-1-2 a été corrigée à la source : les receveurs déjà
couverts sont retirés avant d'affecter les missions de fermeture de passe.
Une passe vers O5 déjà couvert ne réserve plus D2 inutilement et ne fait plus
basculer la cible de D5 d'environ 2 m pour un mouvement de O1 d'un pixel.

Voir [la limite de vitesse et ses modulateurs](physics.md#poursuite-défenseur-pendant-les-gestes-dédition),
[les régressions de continuité](orientation-anti-teleport.md#continuité-pendant-le-déplacement-manuel-des-attaquants)
et [l'enregistrement `BTG1` pour transmettre un bug](SITUATION-CODE.md#enregistrer-et-transmettre-des-gestes-manuels).
La lecture de cette trace conserve les positions observées ; elle ne rejoue
pas le moteur avec de nouvelles décisions tactiques.

### ✅ P3.1-V1 — Rampe d'accélération défenseur en playback 〔M〕 (livré 2026-09-22)

> **Livré** : `frameResolver :: applyDefenderMotionInertia` borne, à chaque
> sous-pas canonique, la vitesse à `v_prev + a·dt` (a = 4,5 m/s² par défaut,
> `defenderPlaybackAcceleration`), départ à l'arrêt compris. Vitesse mémorisée
> en px/s (`motionMemory.speedPxPerSec`) grâce à l'instant `t` des frames →
> indépendant de la durée des étapes. Opt-in `defenderPlaybackAccelerationEnabled`
> (case « départ progressif en lecture »). Mêmes exclusions que l'inertie
> (contact d'écran, overrides) ; collisions résolues en aval. Mesure : D5 du
> PNR central jusqu'à 1,8 m de retard au départ du repli, rattrapé ; ≤ 0,18 m
> en fin de lecture. Tests : `p31DefenderAccelerationRamp.test.ts` (dont
> séparation 34 px et sauts ≤ 18 px sur 6 modèles). Reste V2 : freinage
> (décélération) — **livré 2026-09-23** : vitesse bornée à `v_homme + √(2·b·d)`,
> b = 7 m/s² (`DEFAULT_DEFENDER_PLAYBACK_BRAKING`), dans la même rampe.
>
> **V2 livrée le même jour (poursuite V4 en lecture, ROADMAP #9)** :
> `defense/pursuitModulators.ts` module l'accélération de la rampe comme la
> poursuite au drag — profil (élite ×1,3 / lent ×0,7), appuis (pas chassés
> ×0,7, recul ×0,6), regard (homme vu ×1,2, dans le dos ×0,7). Fatigue non
> reprise (seuil du drag ≈ 8 m atteint par tous en une possession ; relève du
> match simulé). Latence de pivot non reprise : couverte par l'inertie de
> virage existante.

### Historique — P3.1 inertie défenseur en playback (re-scopé 2026-07-02)

Ce bloc conserve le constat et les propositions de juillet. La continuité
en édition est maintenant systématique, comme décrit ci-dessus ; les
livraisons P3.1-V1/V2 précisent séparément ce qui a été porté en lecture.

> **Audit** : l'inertie de virage existe déjà et est active par défaut en
> playback — `applyDefenderMotionInertia` (frameResolver) : mémoire de
> vélocité par frame (`motionMemory`), pénalité proportionnelle à l'angle
> de virage, profils de mobilité par vitesse de poste
> (`defenderPlaybackMobility`), skip écran/overrides. Le footwork
> (latéral/reculons) est couvert par `footworkRulesEnabled` via
> `realismProfile`. **Reste réel** : la rampe d'ACCÉLÉRATION depuis
> l'arrêt (la fonction skip quand `previousSpeed < MIN` → un défenseur
> immobile atteint sa vitesse max en 1 frame). V1 restante : cap de
> croissance de vitesse par frame, opt-in, dans la même fonction.

Le plus gros gain de réalisme : les défenseurs partent/s'arrêtent
instantanément (latence d'accélération « binaire »,
physics-calibration.md). Tous les modulateurs existent déjà dans la
poursuite au drag (`defenderDragInertiaEnabled` : cap vitesse, footwork,
fatigue, gaze, latence pivot) mais ne tournent qu'en édition.

- Porter `profileMult × footworkMult × fatigueMult × gazeMult` +
  latence plant-and-cut dans `speedConstraint.ts` / `resolveFrameAt`,
  opt-in `state.defenderInertiaPlaybackEnabled`.
- ⚠ Chantier à risque : touche `frameResolver` → relire SCREEN-ENGINE.md
  intégralement, golden metrics playback obligatoires, batterie
  complète `screens*`/`overlap*`/`screenLab*`.
- À découper : V1 accélération/décélération seule, V2 footwork,
  V3 fatigue/gaze.

### ✅ P3.2 — `slowingRadius` d'arrive corrélé à la friction 〔S〕 (re-scopé 2026-07-02)

> **Déjà couvert par le tunable** : slider « CVT amorti px » (4-30,
> default 12, `state.steeringSlowingRadius`) dans DefensePanel →
> Réglages globaux. Changer le default 12 casserait la bit-compat legacy
> (contre la convention projet) ; le coach qui veut un freinage plus
> réaliste monte le slider vers 20-25. Repère : la friction de proximité
> (`proximityFriction`, threshold 30 px) borne le comportement au contact.

### ✅ P3.3 — Pénalité de congestion en trafic 〔M〕 (livré 2026-09-22)

> **Re-scopé après audit** : `proximityFriction` couvre déjà le frôlement
> (distance MIN au trajet, threshold 30 px, floor 0.6) — le manque réel
> est la **densité** : traverser 4 corps coûte comme en frôler 1. Reste :
> `congestionFactor(from, to, obstacles)` (compte des corps à < 55 px du
> segment, pénalité dégressive, plancher 0.55), multiplié à la friction
> dans speedConstraint Lever B, opt-in `congestionPenaltyEnabled`.
> **Livré 2026-09-22** : `geometry.ts :: congestionFactor` (rayon 55 px,
> 1er corps laissé à `proximityFriction`, puis ×0.8 dégressif par corps,
> plancher 0.55) multiplié à la friction du Lever B (`speedConstraint.ts`),
> opt-in `congestionPenaltyEnabled` (case « ralenti dans la foule », niveau
> Développement → Réglages globaux → Couvertures avancées). Tests :
> `congestionPenalty.test.ts` (7 verts).

### ✅ P3.4 — Preset « Réalisme » groupant les flags physiques 〔S〕 (re-scopé 2026-07-02)

> **Déjà livré** par le chantier cinématique : `state.realismProfile`
> (`'realistic'` / `'legacy'`), résolu par `realismProfile.ts ::
> resolveRealismFlags` (source de vérité unique, preset
> `PRESET_REALISTIC` : accélération + momentum + velocity profile +
> footwork, overrides coach respectés). UI : SegmentButtons
> « Réaliste / Tactique » dans Paramètres → Physique & Biomécanique.
> Les flags RNG (rebonds, interceptions, dribble) restent volontairement
> hors preset (scope cinématique déterministe).

### ✅ P3.5 — Poursuite anticipée en lecture 〔M〕 (livré 2026-09-22)

> **Livré** : dans le bloc de la rampe P3.1 (`applyDefenderMotionInertia`),
> quand un défenseur ne peut pas atteindre sa place ce sous-pas, il vise le
> point de rencontre : place idéale + vitesse de son homme × temps de
> rattrapage (≤ 0,6 s). Sans retard, rien ne change (pas de défenseur placé
> devant son homme). Opt-in `defenderLeadPursuitEnabled`, effet seulement avec
> la rampe. Mesure (coupe en L, D2 parti de l'arrêt) : retard moyen après le
> changement de direction 0,71 → 0,61 m ; retard max inchangé (ligne droite).
> Effet modeste mais juste. Le cas « closeout sur un receveur en mouvement »
> est couvert par le même mécanisme. Tests : `p35LeadPursuit.test.ts`.

### Historique — P3.5 lead pursuit (re-scopé 2026-07-02)

> **Audit** : l'interception existe déjà pour la **recovery post-écran**
> — `recoveryTarget` (screenPhysics.ts) combine lookahead (projection de
> vélocité), basket-line bias et résolution quadratique du point
> d'interception. **Reste réel** : étendre au closeout hors écran (le
> défenseur du nouveau porteur vise la position courante, pas le point
> de rencontre). Opt-in, après P3.1-V1.

---

## P4 — Écrans avancés & long terme

### ✅ P4.1 — Porteur shoulder-to-shoulder sur son écran 〔M → S〕 (re-scopé 2026-09-22)

> **Audit** : déjà obtenu. Sur PNR central, Spain PNR, PNR aile et Lab PnR
> (profils legacy et réaliste), le porteur passe à 34,0 px du poseur
> (= clearance, sprites au contact) grâce à l'évitement fidèle au tracé (F09)
> et à la projection finale de séparation (F11). Garde-fou :
> `p41CarrierShaveScreen.test.ts` (min ∈ [34, 40] px). Texte d'origine :

Le porteur prend une courbe large autour du poseur au lieu de le
raser — l'écran paraît inutile. Resserrer la Bezier attaquant côté
poseur (offset ≈ `MIN_PLAYER_CLEARANCE_PX`) quand l'annotation dribble
traverse un écran détecté. TODO connu (IDEAS.md § contournement,
« étendre aux attaquants »).

### ✅ P4.2 — Pathfinding D.4 V1 〔L〕 (re-scopé 2026-07-02)

> **Déjà livré** — contrairement à ce que ROADMAP/IDEAS laissaient
> penser (« V1 non lancée »), le routage est câblé : module pur
> `defensiveRoute.ts` (`computeDefensiveRoute` : détour gauche/droite
> autour du cluster bloquant, escalade d'offset, choix route dégagée la
> plus courte, échantillonnage Catmull-Rom) + injection frameResolver
> couche 5.c derrière `state.defensiveRouting` (exclusions : écran,
> pnrRole, closeout, overrides). Tests : `defensiveRoute.test.ts`,
> `d4DefensiveRouting.test.ts`, `d4DefensiveRoutingV2.test.ts`.

### P4.3 — Obstacles échantillonnés sur le segment 〔M〕

Les obstacles sont construits depuis les endpoints (règle anti-flicker) ;
un poseur très mobile est mal évité à mi-segment (secousse ~13 px,
limite acceptée `systeme_basket-8`). Piste : échantillonner l'obstacle
en 2-3 points du segment avec hystérésis. ⚠ Contredit partiellement
une règle SCREEN-ENGINE — à instruire avec soin, golden metrics.

### P4.4 — Mémoire d'intention défensive multi-step 〔L〕

Help sticky (C.2) et hedge counter (C.3) sont des rustines ponctuelles.
Généraliser : un défenseur en rotation « finit sa rotation » au lieu de
recalculer à froid chaque step. Design à brainstormer (état persistant
par défenseur vs approximations pures — attention à la règle
anti-récursion de SCREEN-ENGINE).

---

## Ordre d'exécution — état au 2026-07-02

```
✅ P0.1 → ✅ P1.1 → ✅ P1.4          (fondation → weak-side)
✅ P1.2 (re-scope + garde-fous)      ✅ P1.3 (overlay triangles)
✅ P2.1 → ✅ P2.2 → ✅ P2.3          (lignes de passe)
✅ P3.2 / ✅ P3.4 / ✅ P4.2          (re-scopes : déjà livrés ailleurs)

Backlog restant réel :
✅ P3.3 congestion (2026-09-22) ──► ✅ P3.1-V1 rampe accélération (2026-09-22)
──► ✅ P3.5 poursuite anticipée (2026-09-22) ──► ✅ P4.1 (déjà couvert, garde-fou 2026-09-22)
P4.3 / P4.4 : à instruire séparément (risque écran / design multi-step)
```

**Prochain sprint suggéré** : P3.3 (GREEN sur les tests existants) +
P3.1-V1 (rampe d'accélération dans `applyDefenderMotionInertia`) +
P4.1 (le porteur frotte son écran — visible sur chaque PnR enseigné).

**Règles transverses** (rappel CLAUDE.md) : tout nouveau comportement
est opt-in default off ; toute mutation de position passe par le
push-out / solveur ; toucher `frameResolver`/`baseTargets`/`pnrLayer`
⇒ relire SCREEN-ENGINE.md + batterie `screens*` `overlap*` `userJson*`
`screenLab*` avant commit.
