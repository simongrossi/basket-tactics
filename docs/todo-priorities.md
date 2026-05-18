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
| **E.1 V2 stage 2b** — refacto 2-way | ⚪ | Refacto AppState avec `currentlyAttackingTeam` natif, matchups inversés en mémoire, engine défensif côté home pendant phase away, diagnostic coach spécifique. | 2-4 j | 🏀 **P3** (futur) |
| **A11** — Box-out / rebond après tir (demi-jeu) | ⚪ | Ajouter la phase "tir → rebond → transition" comme demi-jeu complet (≠ E.1 stage 2b qui est just l'autre côté). Modèle physique de rebond, contestabilité. | 1-2 sem | 🏀 **P2** |

### Phase F — Situations FIBA / haute compétition ✅ 5/5 livrés (F.2 reporté)

| Item | Statut | Description |
|---|---|---|
| ~~**F.1 V1 + V2**~~ | 🟢 livré 2026-05-18 (`49be60b` + `fa6e1e2`) | Junk defenses : Box-and-1, Triangle-and-2, Diamond-and-1. 3 formations + 1 ou 2 chasseurs (21 tests). |
| ~~**F.3**~~ | 🟢 V1 livré 2026-05-13 | `buildFreeThrowSetup` (11 tests). |
| ~~**F.4**~~ | 🟢 V1 livré 2026-05-18 | Helper + diag critical + badge `🟥 FOUL TO GIVE` (9 tests). |
| ~~**F.5**~~ | 🟢 V1 livré 2026-05-18 | `lateShotClockLayer` couche 1.7 (5 tests). |
| **F.2** — Press full/half-court | ⚪ reporté | Refonte `getDefenseHoop`. Gros chantier (10-12h V1). |

### Phase C — Réalisme physique modéré ✅ COMPLÈTE (7/7)

C.1 → C.7 livrés (V1 + V2 inclus). C.2 V2 (`helpStickinessMs`) livré
le 2026-05-17, commit `751acf6`, 8 nouveaux tests. Voir ROADMAP pour
les détails.

### Phase D — Trajectoires raffinées 🟡 4/5 (D.4 reportée)

| Item | Statut | Description |
|---|---|---|
| ~~**D.1**~~ | 🟢 livré 2026-05-18 | Easing cross-step linear/ease-in-out/ease-out (8 tests). |
| ~~**D.2**~~ | 🟢 V1+V2 livrés 2026-05-15 | `motionMemory` + `applyDefenderMotionInertia` modulés par `rule.maxSpeed`. |
| ~~**D.3**~~ | 🟢 livré 2026-05-18 | `Annotation.passKind` direct/lob/bounce/skip (7 tests). |
| **D.4** | ⚪ reporté (plan écrit) | Pathfinding défensif. Plan d'audit risque dans [d4-pathfinding-plan.md](d4-pathfinding-plan.md). Non lancé : ratio risque (Règle 1bis) / valeur (visuel) défavorable. |
| ~~**D.5**~~ | 🟢 validé 2026-05-18 | Invariant collision cross-frame testé bout-en-bout (4 tests). |

### Phase J — Moteur écran / playback fines

| Item | Statut | Description | Effort |
|---|---|---|---|
| ~~**J.7**~~ | 🟢 V1 livré 2026-05-18 (`b5aced8`) | Panneau debug joueur `<PlayerDebugTable>` overlay + toggle ParametresPanel. | — |
| **J.1** — Parité scrub ↔ playback | ⚪ | Décrochages détectés en scrub absents en lecture animée. | ~6-8h |
| **J.2** — Cache segmentaire du resolver | ⚪ | Mémoïse les segments inchangés entre frames. | ~6-8h |
| **J.3** — Solver de contraintes unifié | ⚪ | Reformule le pipeline en problème d'optimisation. | ~2-3j |
| **J.5** — Profiling + budget frame | ⚪ | Heatmap CPU par couche défensive. | ~1-2j |
| **J.6** — Visual regression légère | ⚪ | Snapshots SVG par template. | ~1-2j |

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
| A.2 — Mode présentation v2 | ⚪ | Fullscreen navigateur natif universel + raccourcis clavier | ~2h | ⏸ **après basket** |
| A.3 — Annotations texte | ⚪ | Notes coaching inline sur steps/zones | ~2h | ⏸ **après basket** |

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

## 🎯 Ordre d'attaque proposé (basket only)

État au **2026-05-18 soir** : Phases B/C/F/G **complètes** (20/20),
Phase D 4/5 (D.4 reportée), J.7 livré. Le moteur tactique est dans un
état excellent. Il ne reste vraiment qu'un gros chantier basket et du
tooling moteur optionnel.

### Le seul gros chantier basket restant
1. **A11 / E.1 V2 stage 2b** — Box-out / rebond demi-jeu (5-8 jours)
   — le SEUL vrai changement de scope basket. Modélise la phase
   post-shot (rebond contesté, transition home/away).

### À reporter sauf demande explicite
- **F.2** Press full/half-court (10-12h V1, refonte `getDefenseHoop`).
- **D.4** Pathfinding défensif (plan d'audit écrit, gain visuel modéré
  vs risque Règle 1bis CLAUDE.md).
- **Phase J fines** (J.1/J.2/J.3/J.5/J.6) — qualité moteur, pas
  bloquant (J.7 livré pour devx).

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
-

---

Mise à jour : 2026-05-18 soir (post-session B.3/B.4/D.1-3-5/F.1 V1+V2/G.1-4/J.7)
