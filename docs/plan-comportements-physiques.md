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

### P3.1 — Inertie défenseur en playback 〔L〕

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

### P3.2 — `slowingRadius` d'arrive corrélé à la friction 〔S〕

`STEERING_MAN_SLOWING_RADIUS_PX = 12` est trop court (piège noté
IDEAS.md) : un closeout réel freine sur ~1 m. Corréler avec
`PROXIMITY_FRICTION_RADIUS`, mesurer sur les Labs, ajuster.

### P3.3 — Pénalité de congestion en trafic 〔M〕

Un défenseur qui traverse une raquette encombrée va à vitesse max.
Pénalité fonction du nombre de joueurs dans un rayon (~60 px), dans
`speedConstraint.ts`, opt-in. Rend crédibles les rotations
weak-side → paint.

### P3.4 — Preset « Réalisme » groupant les flags physiques 〔S〕

12 flags opt-in default off que personne n'active
(`footworkRulesEnabled`, `screenStiffnessEnabled`, momentum, etc.).
Un bouton preset dans Paramètres qui active un set validé
visuellement. Zéro moteur, pure UI.

### P3.5 — Lead pursuit (anticipation de trajectoire) 〔M-L〕

Closeout et chase d'écran visent la position **courante** de l'homme ;
un vrai défenseur vise le point d'interception. Cible = projection de
la trajectoire de l'attaquant (waypoints/annotation déjà connus du
resolver). Opt-in, après P3.1.

---

## P4 — Écrans avancés & long terme

### P4.1 — Porteur shoulder-to-shoulder sur son écran 〔M〕

Le porteur prend une courbe large autour du poseur au lieu de le
raser — l'écran paraît inutile. Resserrer la Bezier attaquant côté
poseur (offset ≈ `MIN_PLAYER_CLEARANCE_PX`) quand l'annotation dribble
traverse un écran détecté. TODO connu (IDEAS.md § contournement,
« étendre aux attaquants »).

### P4.2 — Pathfinding D.4 V1 〔L〕

Plan d'audit écrit ([d4-pathfinding-plan.md](d4-pathfinding-plan.md)),
jamais lancé. Nécessaire seulement pour les traversées de stack
(elevator, zipper, 3+ obstacles). Déclencher quand P4.1 et le weave v3
montrent leurs limites — pas avant.

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

## Ordre d'exécution recommandé

```
P0.1 ──► P1.1 ──► P1.4
   │        │
   │        └──► (valide le vocabulaire weak-side)
   ├──► P2.2
P1.2 (indépendant, dès maintenant)
P1.3 (indépendant, quick win)
P2.1 ──► P2.3
P3.2 / P3.4 (quick wins indépendants)
P3.1 ──► P3.3 ──► P3.5
P4.* (à la demande, quand le besoin visuel est prouvé)
```

**Prochain sprint suggéré** : P0.1 + P1.1 + P1.3 (une fondation, un
concept d'enseignement majeur, un overlay quick-win) — cohérent avec
le backlog coaching en cours.

**Règles transverses** (rappel CLAUDE.md) : tout nouveau comportement
est opt-in default off ; toute mutation de position passe par le
push-out / solveur ; toucher `frameResolver`/`baseTargets`/`pnrLayer`
⇒ relire SCREEN-ENGINE.md + batterie `screens*` `overlap*` `userJson*`
`screenLab*` avant commit.
