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

### Phase B — Notion du temps (foundation)

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**B.1** — Durée individuelle par step~~ | 🟢 livré 2026-05-17 (commits `1670f10` + `7e67e79`) | Champ `Step.duration?`. Accumulation cumulative dans Timeline + MultiTrack + Playbook recap. 17 tests. | — | — |
| ~~**B.2** — Shot clock display vert/jaune/rouge~~ | 🟢 livré 2026-05-18 (commit `4c3af36`) | Helper `shotClockBand()` mutualisé. Timeline + LiveMatchOverlay + SimulationSection alignés. | — | — |
| **B.3** — End-of-clock defense awareness | ⚪ | `defensiveContext.timeRemaining` lu par les couches. À <5 s : `contest mode` (no fouls, all-hands-up). Note : F.5 déjà livre le no-help en bout de shot clock, B.3 serait l'équivalent en bout de quart. | ~2h | 🏀 **P2** |
| **B.4** — Synchronisation cross-actor | ⚪ | `annotation.tStart/tEnd` en secondes ABSOLUES plutôt que fraction du step. Permet à O1 (dribble 1.5s) et O5 (cut 0.8s) de finir à des moments différents. | ~4-6h | 🏀 **P2** |

### Phase E — Situations spéciales basket

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| **E.1 V2 stage 2b** — refacto 2-way | ⚪ | Refacto AppState avec `currentlyAttackingTeam` natif, matchups inversés en mémoire, engine défensif côté home pendant phase away, diagnostic coach spécifique. | 2-4 j | 🏀 **P3** (futur) |
| **A11** — Box-out / rebond après tir (demi-jeu) | ⚪ | Ajouter la phase "tir → rebond → transition" comme demi-jeu complet (≠ E.1 stage 2b qui est just l'autre côté). Modèle physique de rebond, contestabilité. | 1-2 sem | 🏀 **P2** |

### Phase F — Situations FIBA / haute compétition

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**F.4** — End-of-quarter foul to give~~ | 🟢 V1 livré 2026-05-18 (commit `fac20b2`) | Helper + diag critical + badge SVG `🟥 FOUL TO GIVE`. 9 tests. | — | — |
| ~~**F.5** — Late shot clock defense~~ | 🟢 V1 livré 2026-05-18 (commit `fac20b2`) | `lateShotClockLayer` couche 1.7. carrierDef contest accru, autres défenseurs no-help. 5 tests. | — | — |
| **F.1** — Junk defenses (box-and-1, triangle-and-2) | ⚪ | Couvertures hybrides homme-zone pour neutraliser un shooter dominant. V1 box-and-1. | ~6h V1 | 🏀 **P2** |
| **F.3** — FT rebound positioning | ⚪ | 10 positions canoniques + transform + badge UI. | ~3h V1 | 🏀 **P2** |
| **F.2** — Press full/half-court | ⚪ | Pression tout terrain. Gros chantier (refonte `getDefenseHoop`). | ~10-12h V1 | 🏀 **P3** |

### Phase C — Réalisme physique modéré ✅ COMPLÈTE (7/7)

C.1 → C.7 livrés (V1 + V2 inclus). C.2 V2 (`helpStickinessMs`) livré
le 2026-05-17, commit `751acf6`, 8 nouveaux tests. Voir ROADMAP pour
les détails.

### Phase J — Moteur écran / playback fines

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| **J.1** — Parité scrub ↔ playback | ⚪ | Décrochages détectés en scrub absents en lecture animée. | ~6-8h | 🏀 **P3** |
| **J.2** — Cache segmentaire du resolver | ⚪ | Mémoïse les segments inchangés entre frames. | ~6-8h | 🏀 **P3** |
| **J.3** — Solver de contraintes unifié | ⚪ | Reformule le pipeline en problème d'optimisation (plus prédictible). | ~2-3j | 🏀 **P3** |
| **J.5** — Profiling + budget frame | ⚪ | Heatmap CPU par couche défensive. | ~1-2j | 🏀 **P3** |
| **J.6** — Visual regression légère | ⚪ | Snapshots SVG par template pour détecter régressions UI. | ~1-2j | 🏀 **P3** |
| **J.7** — Panneau debug joueur | ⚪ | Vue détaillée des décisions du moteur pour un joueur donné. | ~1-2j | 🏀 **P3** |

### Phase G — Calibration vitesse réelle

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| **G.1** — Doc calibration vitesse | ⚪ | Clarifier le scope du moteur (tactique vs sprint réel ; D1 max 1.96 m/s ≈ 22% NBA). | ~1j | 🏀 **P2** |

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

État au **2026-05-18** : Phase B partiellement livrée (B.1 + B.2),
Phase C complète (C.1 → C.7), F.4 + F.5 V1 livrés. Restent ~3-5
chantiers basket de bonne valeur.

### Court terme (1-2 sessions)
1. **B.3** — End-of-quarter defense awareness (~2h) — complète F.5
   en miroir côté chrono de quart
2. **F.3** — FT rebound positioning (~3h) — gain visuel direct sur LF
3. **F.1** — Junk defenses (~6h V1) — box-and-1 first

### Moyen terme
4. **B.4** — Annotation tStart/tEnd absolu (~4-6h) — débloque la
   synchro cross-actor fine
5. **A11 / E.1 V2 stage 2b** — Box-out / demi-jeu rebond (1-2 sem) —
   gros chantier mais ouvre le 2-way complet
6. **G.1** — Doc calibration vitesse (~1j) — clarifie le scope

### À reporter sauf demande explicite
- **F.2** Press full/half-court (10-12h V1, refonte `getDefenseHoop`)
- Phase J fines (J.1/J.2/J.3/J.5/J.6/J.7) — moteur fonctionne déjà bien

---

## ✏️ Notes libres du user

> Ajoute ici tes consignes globales, priorités hors-tableau, idées
> nouvelles, refus de scope, deadlines, etc.

- **Priorité globale 2026-05-15** : basket uniquement, UX/mobile/tests UI repoussés
- **Décision 2026-05-17** : C.2 V2 livrée en s'appuyant sur B.1 (la
  cible basket "1.2s d'aide standard NBA" est désormais exprimable en
  ms, indépendante du découpage en steps).
-

---

Mise à jour : 2026-05-18 (post-session B.1/B.2/C.2 V2/F.4/F.5)
