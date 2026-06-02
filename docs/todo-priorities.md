# 📋 TODO — chantiers restants

> **Consigne globale 2026-05-15** : priorité **BASKET** d'abord. UX,
> tests UI et mobile sont repoussés. On développe le moteur tactique
> jusqu'au bout avant de polir l'interface.
>
> Mise à jour automatique à chaque session : tout ce qui est livré
> bascule dans CHANGELOG / ROADMAP et disparaît d'ici.
>
> Légende statut : ⚪ pending · 🔵 docs only · 🟡 partiel
> Légende priorité : 🏀 = basket (P1 / P2 / P3) · ⏸ = repoussé

---

## 🏀 BASKET — priorité absolue

### Phase L — Offense en lecture réactive ✅ COMPLÈTE L.0→L.3 (livré 2026-05-29)

> Saut « tableau animé » → « simulateur tactique ». L'offense lit la couverture
> défensive jouée et choisit automatiquement sa continuation (blitz→short roll,
> drop→pull-up, switch→mismatch…). Réutilise `ScenarioBranch` + `OnScreenNav`
> déjà présents — chaînon manquant seulement.
>
> Spec : [2026-05-29-offense-lecture-reactive-design.md](superpowers/specs/2026-05-29-offense-lecture-reactive-design.md)
> · Plan : [2026-05-29-offense-lecture-reactive.md](superpowers/plans/2026-05-29-offense-lecture-reactive.md)

| Item | Statut | Description | Effort |
|---|---|---|---|
| ~~**L.0**~~ | 🟢 livré 2026-05-29 | Noyau pur : `ReadTrigger` + `trigger?`/`resolvedReadBranchId?` (types) + `resolveScreenCoverage` (réutilise `buildDefenseFrameContext` → parité) + `selectReactiveBranch` (manuel prime, lit `generatedBy`). 13 tests. Helper `effectiveScreenNav` abandonné (inutile). | — |
| ~~**L.1**~~ | 🟢 livré 2026-05-29 | Câblage `recompileScenarioSteps` (manuel prime, pose `resolvedReadBranchId`) + `readLibrary.ts` (7 lectures canoniques) + 11 tests (intégration 3 couvertures). Golden verts. | — |
| ~~**L.2**~~ | 🟢 livré 2026-05-29 | UI `ScenarioPanel` : bouton « 🤖 lectures auto » (insère les branches canoniques), onglets réactifs marqués + puce couverture, badge « Lecture auto ». `addScenarioBranches` (recompile groupé). +3 tests. | — |
| ~~**L.3**~~ | 🟢 livré 2026-05-29 | Lectures hors PnR : `ReadTrigger` union (`screen-coverage`/`help-source`/`deny`) + `resolveHelpSource`/`classifyHelpOrigin`/`resolveDeny` + `buildDriveKickReads`/`buildBackdoorReads` + dispatch `selectReactiveBranch` + UI contextuelle. +16 tests. Restent : arbres multi-niveaux, lecture probabiliste, receveur dynamique. | — |

### Dette moteur — à traiter avant d'empiler (audit 2026-05-29)

| Item | Statut | Description | Effort |
|---|---|---|---|
| ~~**DM.1**~~ | 🟢 livré 2026-05-29 | `defense/constants.ts` — 15 constantes centralisées (noms préfixés par couche), imports aliasés (behavior-preserving). Collision `HELP_BUSY_THRESHOLD` levée : 2 noms distincts documentés (`POST_*`=0.5 / `CUTTER_BUMP_*`=0.3 — écart volontaire, pas un bug). +2 tests verrou. Suite 1864 verte. | — |
| ~~**DM.2**~~ | 🟢 livré 2026-05-29 | `pipelineIntegration.test.ts` — 31 tests de coexistence entre les 14 couches (PnR + help, trap + screen, etc.). Suite 1897 verte. | — |
| ~~**DM.3**~~ | 🟢 livré 2026-05-29 | Helper `screenAndCut(...)` dans `scriptedGenerators/helpers.ts` — factorise le motif screen→cut copié dans 6 générateurs tier1. | — |

### Phase B — Notion du temps ✅ COMPLÈTE (4/4)

| Item | Statut | Description |
|---|---|---|
| ~~**B.1**~~ | 🟢 livré 2026-05-17 | `Step.duration?` + accumulation cumulative timecode (17 tests). |
| ~~**B.2**~~ | 🟢 livré 2026-05-18 | `shotClockBand()` 3 paliers vert/jaune/rouge mutualisés. |
| ~~**B.3**~~ | 🟢 livré 2026-05-18 (`c51160e`) | End-of-quarter contest awareness V1 — badge `🚫 NO FOUL` quand clock<5 + fautes≥5 (7 tests). |
| ~~**B.4**~~ | 🟢 V1 + UI livrés 2026-05-18 (`5ad5508` + `634071e`) | `Annotation.tStartAbs/tEndAbs` en secondes ABSOLUES priment sur fractions legacy. Helper `resolveAnnotationTiming`. UI : shift+click sur segment MultiTrackTimeline (14 tests). |

### Phase E — Situations spéciales basket

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**A11 V1**~~ | 🟢 livré 2026-05-18 | Mode édition statique : Step.shotOutcome + addShotReboundStep + boxOutCheckRule robuste. 25 tests. | — | — |
| ~~**A11 V2**~~ | 🟢 livré 2026-05-18 (`dac7fb0` + ext2+ext3) | 'blocked' déterministe + reset shot clock 14s + outletPassPending + outletPassRule diag. 12 tests. | — | — |
| ~~**E.1 V2 stage 2b**~~ | 🟢 V1 livré 2026-05-18 (Option A ultra-mini, 3 commits, 15 tests) | `Step.viewSide?` + setter `convertStepToAwayPossession` (mirror y=540) + UI + diag coach. Options B/C reportées. | — | — |
| **A11 V3** | ⚪ reporté | Couche `boxOutLayer` dynamique vs setter statique, unification mode édition ↔ game loop, outlet pass setter auto (génère step inbound après). Plan dans [a11-plan.md](a11-plan.md). | — | — |

### Phase F — Situations FIBA / haute compétition ✅ 5/5 livrés

| Item | Statut | Description |
|---|---|---|
| ~~**F.1 V1 + V2**~~ | 🟢 livré 2026-05-18 (`49be60b` + `fa6e1e2`) | Junk defenses : Box-and-1, Triangle-and-2, Diamond-and-1. 3 formations + 1 ou 2 chasseurs (21 tests). |
| ~~**F.2 V1 + V2**~~ | 🟢 livrés 2026-05-18 (V1 `ed76448` 9 tests + V2 6 tests) | Press defenses : half-court 2-2-1 + full-court 1-2-1-1 + trap dynamique (mi-terrain). Court-circuit pattern (F.1 junk), pas de refonte `getDefenseHoop`. V2.5 retreat progressive reportée. |
| ~~**F.3**~~ | 🟢 V1 livré 2026-05-13 | `buildFreeThrowSetup` (11 tests). |
| ~~**F.4**~~ | 🟢 V1 livré 2026-05-18 | Helper + diag critical + badge `🟥 FOUL TO GIVE` (9 tests). |
| ~~**F.5**~~ | 🟢 V1 livré 2026-05-18 | `lateShotClockLayer` couche 1.7 (5 tests). |

### Phase C — Réalisme physique modéré ✅ COMPLÈTE (7/7)

C.1 → C.7 livrés (V1 + V2 inclus). C.2 V2 (`helpStickinessMs`) livré
le 2026-05-17, commit `751acf6`, 8 nouveaux tests. Voir ROADMAP pour
les détails.

### Phase D — Trajectoires raffinées ✅ COMPLÈTE (5/5)

| Item | Statut | Description |
|---|---|---|
| ~~**D.1**~~ | 🟢 livré 2026-05-18 | Easing cross-step linear/ease-in-out/ease-out (8 tests). |
| ~~**D.2**~~ | 🟢 V1+V2 livrés 2026-05-15 | `motionMemory` + `applyDefenderMotionInertia` modulés par `rule.maxSpeed`. |
| ~~**D.3**~~ | 🟢 livré 2026-05-18 | `Annotation.passKind` direct/lob/bounce/skip (7 tests). |
| ~~**D.4**~~ | 🟢 V1+V2 livrés 2026-05-22 | `defensiveRoute.ts` — routes candidates + lissage Catmull-Rom. V1 câblé dans frameResolver (trajectoire playback), V2 dans speedConstraint (cibles de step). Opt-in `state.defensiveRouting`. |
| ~~**D.5**~~ | 🟢 validé 2026-05-18 | Invariant collision cross-frame testé bout-en-bout (4 tests). |

### Phase J — Moteur écran / playback ✅ COMPLÈTE (7/7)

| Item | Statut | Description | Effort |
|---|---|---|---|
| ~~**J.4**~~ | 🟢 livré 2026-05-15 | Off-ball avancé. | — |
| ~~**J.5**~~ | 🟢 V1 livré 2026-05-18 (`ccf73b9`) | Profile overlay live (mean/p95/max par phase, hottest highlight). | — |
| ~~**J.6**~~ | 🟢 V1 livré 2026-05-18 (`d1d6792`) | Golden snapshots Vitest sur 4 templates (ucla-cut, pnr-central, pindown-corner, floppy). | — |
| ~~**J.7**~~ | 🟢 V1 livré 2026-05-18 (`b5aced8`) | Panneau debug joueur (overlay tableau 5 défenseurs). | — |
| ~~**J.1**~~ — Parité scrub ↔ playback | 🟢 livré 2026-05-15 (`38209d6`) | Mémoire scrub déterministe recalculée depuis début de segment. | — |
| ~~**J.2**~~ — Cache segmentaire du resolver | 🟢 livré 2026-05-15 (`87b212c`) | Mémoïse les segments inchangés entre frames. | — |
| ~~**J.3**~~ — Solver de contraintes unifié | 🟢 livré 2026-05-15 (`f7fcb8a`) | `constraintSolver.ts` — socle commun att/déf/poseurs/screen lock. | — |

### Phase K — Behavior Anomaly Detection ✅ COMPLÈTE (7/7)

| Item | Statut | Description |
|---|---|---|
| ~~**K.0**~~ | 🟢 livré 2026-05-18 | Types `AnomalyKind` / `AnomalyReport` + module pur `anomalyDetector.ts`. |
| ~~**K.1 V1**~~ | 🟢 livré 2026-05-18 | `detectTeleport` (saut > 24 px), 8 tests. |
| ~~**K.2 V1**~~ | 🟢 livré 2026-05-18 | `detectAberrantSpeed` (> maxSpeed × 1.95), 6 tests. |
| ~~**K.3 V1**~~ | 🟢 livré 2026-05-18 | `detectDetachedDefenders` (> 250 px de son homme, hors aide/screen), 7 tests. |
| ~~**K.4 V1**~~ | 🟢 livré 2026-05-18 | `detectFlicker` (oscillation 3 frames, cos < -0.707), 8 tests. |
| ~~**K.5 V1**~~ | 🟢 livré 2026-05-18 | `detectAnomalousGaze` (regard > 90° du corps, CLAUDE.md Règle 3), 10 tests. |
| ~~**K.6**~~ | 🟢 livré 2026-05-18 | Règle coach `playerAnomalyRule` (K.1/K.2/K.3) + toggle ParametresPanel `anomalyDetectionEnabled`. 6 tests intégration. |
| ~~**K.7 V2**~~ | 🟢 livré 2026-05-18 | `clampTeleports` + `clampAberrantSpeed` (helpers purs opt-in, non wirés au resolver). 11 tests. |

### Phase G — Calibration vitesse ✅ COMPLÈTE (4/4)

| Item | Statut | Description |
|---|---|---|
| ~~**G.1**~~ | 🟢 livré 2026-05-18 | [docs/physics-calibration.md](physics-calibration.md) — scope tactique vs sprint réel. |
| ~~**G.2**~~ | 🟢 V1 livré 2026-05-18 (`c4ae2da`) | `Step.sprintBoost` ×1.8 sur vitesse max défense (4 tests). |
| ~~**G.3**~~ | 🟢 V1 livré 2026-05-18 (`84467e1`) | `accelerationModelEnabled` + `defenderAcceleration` — clamp linéaire depuis le repos (4 tests). |
| ~~**G.4**~~ | 🟢 V1 livré 2026-05-18 (`86b13d7`) | `defenderSpeedProfiles` elite/standard/lent ×1.3/×1.0/×0.7 (5 tests). |

---

## ⏸ REPOUSSÉ — pas dans la priorité basket actuelle

### Phase A — UX quick wins

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~A.2~~ — Mode présentation v2 | 🟢 livré 2026-05-22 | `requestFullscreen()` + sync `fullscreenchange` → sortie native sort aussi du mode présentation. | — |
| ~~A.3~~ — Annotations texte | 🟢 livré 2026-05-23 | `TextNote` séparé d'`Annotation`, outil `note` + raccourci `T`, popup HTML édition, undo/persistance gratuits. | — |

### Phase H — Tests composants UI

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| H.1 — Tests DefensePanel | ⚪ | Test des boutons, sélecteurs, sliders, dropdowns | ~1-2h | ⏸ **après basket** |
| H.2 — Tests SimulationSection | ⚪ | Test des panneaux live + calibration | ~1-2h | ⏸ **après basket** |
| H.3 — Tests StepsPanel | ⚪ | Test conversion FT/inbound, annotations | ~1h | ⏸ **après basket** |
| H.4 — Tests CourtView (intégration) | ⚪ | Drag, click, overlay, scrub | ~2-3h | ⏸ **après basket** |
| H.5 — Tests LiveMatchOverlay | ⚪ | Test du HUD plein écran | ~30 min | ⏸ **après basket** |

### Mobile / iOS

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| Phase 1 — Simulateur iOS | ⚪ | Config Capacitor + Next.js export | ~2-3h | ⏸ **app desktop stable d'abord** |
| Phase 2 — iPhone physique | ⚪ | Apple ID gratuit + signature ad-hoc | ~1-2h | ⏸ |
| Phase 3 — Adaptation tactile | ⚪ | Long-press, drag, safe area | ~4-6h | ⏸ |
| Phase 4 — Polish iOS | ⚪ | Icône, splash, status bar | ~2-3h | ⏸ |
| Phase 5 — TestFlight | ⚪ | Apple Developer 99 $/an + métadonnées | ~1-2j | ⏸ |

---

## 🎯 Livrés session 2026-06-01

| Item | Statut | Description |
|---|---|---|
| ~~**Closeout quality ring**~~ | 🟢 livré 2026-06-01 | `closeoutQuality` clean/desperate/late sur `ComputedDefender`. Ring vert/orange/rouge dans Player.tsx. Règle coach `shooterCloseoutRule`. 4 tests. |
| ~~**Corner preference**~~ | 🟢 livré 2026-06-01 | `CORNER_BONUS_PX=45` + candidates corner explicites dans `positionOffBall.ts` pour shooter/stretch-big. 4 tests. |
| ~~**Templates offensifs +3**~~ | 🟢 livré 2026-06-01 | Iverson cut + Stagger + PNR aile dans CLASSIC_TEMPLATES. +18 golden snapshots. |

## 🎯 Livrés session 2026-06-02 — Lacunes défensives #8 (audit 2026-05-29)

| Item | Statut | Description |
|---|---|---|
| ~~**#8.3 hedge per-déf**~~ | 🟢 livré 2026-06-02 | `DefenderRule.hedgeAggression` override le global (B3). Slider DefenderMenu + récap DefensePanel. 3 tests. |
| ~~**#8.2 ancre weak-side**~~ | 🟢 livré 2026-06-02 | Couche 1.4 `weakSideAnchorLayer` + helper `pickWeakSideAnchor` (auto low man / override coach). Opt-in `weakSideAnchorEnabled`. Marqueur ⚓. 7 tests. |
| ~~**#8.1 relâche blitz**~~ | 🟢 livré 2026-06-02 | Couche 2.6 `blitzReleaseLayer` + `detectBlitzRelease` + `blitzReleaseEasing` (frameResolver). screenerDef récupère le roller. Opt-in `blitzReleaseEnabled`. Badge ↩ RECOVER. 12 tests. |
| ~~**Lecture probabiliste** (extension Phase L)~~ | 🟢 livré 2026-06-02 | Distribution de couvertures seedée (drop 70 % / blitz 30 %). `rolledCoverage` pilote `effectiveScreenRule` → défense + branche (source unique). Helpers `rollCoverage`/`coverageBranchStats`, `mulberry32` extrait dans `rng.ts`. UI ScenarioPanel (éditeur distribution + 🎲 rejouer + stats). ~16 tests. |
| ~~**Continuity offense** (Phase Motion, sous-projet A)~~ | 🟢 livré 2026-06-02 | Boucle rotative : plage d'actions × K cycles (1–6) + rotation des rôles σ^k (relabel IDs joueurs, id namespacé `#cK`) + sortie hybride sur lecture Phase L. Helpers purs `rotateActionParams`/`expandContinuityLoop`, opt-in `continuityLoop`, déroulé au compile-time (défense suit son homme, 0 remap). UI ScenarioPanel (plage, roue, cycles, sortie). ~19 tests. Replacement (B) + reversal (C) restants. |
| ~~**Auto-replacement** (Phase Motion, sous-projet B)~~ | 🟢 livré 2026-06-02 | Cascade de fill *fill-from-behind* auto-déclenchée sur cut/drive (`basket-cut`/`backdoor-cut`/`flash-cut`/`give-and-go`/`drive`) : le joueur du même côté plus loin du panier comble le spot vidé, profondeur bornée 1–4. Fusion concurrente dans le step du cut, clearance `pushOutOfMany`. Module pur `autoReplacement.ts`, opt-in `autoReplacementEnabled`. UI ScenarioPanel (toggle + profondeur). ~21 tests. Ball reversal/DHO (C) restant. |
| ~~**Ball-chain** (Phase Motion, sous-projet C)~~ | 🟢 livré 2026-06-02 | `ball-reversal` (chaîne de passes) + `dho-chain` (hand-offs enchaînés) : route le ballon via une chaîne ordonnée `chain`, mode par lien (`chainLinkModes`, pass/dho/mixte). Expander pur `expandBallChain` déléguant à `genPass`/`genHandOff`, threading, id namespacé `#lI`. UI ChainEditor. ~8 tests. **Axe motion COMPLET (A+B+C).** |
| ~~**Fast-break** (Transition, sous-projet 1)~~ | 🟢 livré 2026-06-02 | Sur rebond défensif : l'équipe qui rebondit (mapping D→O sans miroir) part en fast-break full-court — outlet vers le meneur le plus proche + sprint des 3 couloirs vers `HOOP_OPPOSITE` (ball milieu, ailes extrêmes, rebondeur trailer) + repli défensif (`sprintBoost`). `buildFastBreakSteps`/`addFastBreakSteps`, bouton ⚡ StepsPanel. ~10 tests. Avantage numérique 2c1/3c2 (2) + secondary break (3) restants. |

**Restent ouverts dans IDEAS §8** : tag roller avec modèle de contact/faute,
X-out multi-roller, re-scram en cascade.

## 🎯 Ordre d'attaque proposé (basket only)

État au **2026-05-18 (tooling)** : Phases B/C/F/G **complètes** (20/20),
Phase D 5/5, Phase J 7/7. Le moteur tactique est dans un état excellent
ET muni d'outils de mesure + régression auto.

### Tous les chantiers basket sont désormais livrés ✅

A11 V1 (le dernier gros chantier basket) livré 2026-05-18 en ~3h
(estimation initiale 5-8j). Le moteur tactique est **complet** :
- Toutes les phases défensives (B, C, F, G) à 100 %.
- Phase D 5/5.
- Phase J 7/7.
- Phase E partielle : E.2, E.3, E.1 V2 stage 1+2a, A11 V1. Reste
  E.1 V2 stage 2b (refacto 2-way) — gros chantier reporté.

Le projet est livrable pour démos coachs réels.

### À reporter sauf demande explicite
- **F.2 V2.5** Retreat progressive (interpolation press → man-to-man arrière) (~1j).
- **A11 V3 unification** mode édition ↔ game loop (1-2j).
- **E.1 stage 2b Options B/C** team-aware soft / refacto complet.
- **D.4** Pathfinding défensif (plan d'audit écrit, gain visuel modéré
  vs risque Règle 1bis CLAUDE.md).
- **Phase J fines** (J.2/J.3) — qualité moteur, pas bloquant.

### Options "consolidation" (entre 2 sessions basket)
- Refresh docs périodique (hygiène).
- Stop : projet livrable en l'état pour feedback coachs réels.

---

## ✏️ Notes libres du user

> Ajoute ici tes consignes globales, priorités hors-tableau, idées
> nouvelles, refus de scope, deadlines, etc.

- **Priorité globale 2026-05-15** : basket uniquement, UX/mobile/tests UI repoussés
- **Décision 2026-05-17** : C.2 V2 livrée en s'appuyant sur B.1 (la
  cible basket "1.2s d'aide standard NBA" est désormais exprimable en
  ms, indépendante du découpage en steps).
- **Décision 2026-05-18 soir** : D.4 V1 (pathfinding défensif) reporté
  malgré audit risque écrit ([d4-pathfinding-plan.md](d4-pathfinding-plan.md)).
  Le gain (positions interpolées plus lisses à mi-step) ne justifie pas
  le risque sur les 13 tests screen sensibles (Règle 1bis CLAUDE.md).
- **Bilan 2026-05-18 soir** : Phases B/C/F/G 100 % livrées. 1353/1353
  tests verts. Le moteur tactique est livrable pour feedback coachs.
- **Bilan 2026-05-18 tooling** : Phase J étendue à 4/7 (J.5 profile +
  J.6 golden snapshots). 1371/1371 verts. Le projet bénéficie maintenant
  d'un filet de sécurité automatique : toute future modif moteur
  déclenche un diff snapshot lisible. Profile overlay live disponible
  pour mesurer A11 ou tout futur chantier.
- **Bilan 2026-05-18 A11** : J.1 livré (parité scrub/playback, 2 lignes
  + 8 tests) puis A11 V1 livré (demi-jeu rebond, 3 phases, 25 tests,
  ~3h vs 5-8j estimé). 1404/1404 verts. **Le seul gros chantier basket
  restant est désormais livré.** Reste pour le futur : A11 V2 (blocked,
  reset shot clock, outlet pass auto), E.1 V2 stage 2b (refacto 2-way),
  F.2 press, J.2/J.3 (qualité moteur). Tous reportés / optionnels.
-

---

Mise à jour : 2026-05-18 Phase K (anomaly detection complète) — version UI 0.18.0
