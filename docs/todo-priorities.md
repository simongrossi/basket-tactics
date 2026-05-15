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

### Phase E — Situations spéciales basket

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**E.3** — Rebond animé~~ | 🟢 livré 2026-05-16 (commit `874d96c`) | Trajectoire ballon shooter → cercle → rebondeur, parabole 2 phases. Rebond pré-calculé pour cohérence animation/outcome. | — | — |
| ~~**E.2** — Jump ball initial~~ | 🟢 livré 2026-05-16 (commit `a61323c`) | Setup canonique entre-deux : 2 sauteurs au cercle central + 4+4 en arc, Règle 1 validée sur 45 paires. | — | — |
| **E.1 V2 stage 1** | 🟢 livré 2026-05-16 (commit `6d99024`) | Ballon adverse animé entre 4 waypoints pendant `away-possession`. Banner "🔄 POSSESSION ADVERSE". Donne le visuel "il se passe qqch côté adverse". | — | — |
| **E.1 V2 stage 2a** | 🟢 livré 2026-05-16 (commit `1cefa67`) | 5 adversaires miroir vertical autour de y=540, animés vers panier home, rendus en sprites rouges distinctifs. | — | — |
| **E.1 V2 stage 2b** — refacto 2-way | ⚪ | Refacto AppState avec `currentlyAttackingTeam` natif, matchups inversés en mémoire, engine défensif côté home pendant phase away, diagnostic coach spécifique. | 2-4 j | 🏀 **P3** (futur) |

### Phase F — Situations FIBA basket

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**F.2** — Free throw avec course-rebond~~ | 🟢 livré 2026-05-16 (commit `6bb780a`) | Setter `addFreeThrowReboundStep(made)` qui ajoute une étape post-lancer animée. Blocks défensifs gagnent rebond, slots offensifs over-the-top. Made = transition adverse. | — | — |
| ~~**F.4** — Pénalité technique / DQ~~ | 🟢 livré 2026-05-16 (commit `5ae6e10`) | Toggle DQ par joueur (10 boutons dans ParametresPanel) + overlay rouge "DQ" sur le terrain. V1 visuel seulement (engine non modifié). | — | — |

### Extensions remises en jeu V2 (basket pur)

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**Box-out auto post-shot**~~ | 🟢 livré 2026-05-16 (commit `e79453c`) | Coach diagnostic `boxOutCheckRule` qui détecte phase de rebond et flag défenseurs mal positionnés. Le box-out animé live existait déjà (E.1 V2). | — | — |
| ~~**Diagnostic défensif sur remise**~~ | 🟢 livré 2026-05-16 (commit `dcfe8c3`) | Règle coach `inboundDefenseRule` : 3 checks (pression passeur, deny receveur principal, attaquants ouverts). Verdict ok-vs-warning-vs-critical. | — | — |
| ~~**Templates défense d'attaque**~~ | 🟢 livré 2026-05-16 (commit `e73aad2`) | 3 templates pédagogiques : Box vs face-guard, Stack vs zone 2-3, Hammer vs zone-press. Défense figée par defenseOverrides. | — | — |
| ~~**Compteur 5s diagnostic statique**~~ | 🟢 livré 2026-05-16 (commit `6dd7e83`) | Extension inboundFiveSecRule : scan steps suivants pour trouver passe, calcule durée estimée × secondsPerStep, flag critical si > 5s. | — | — |

### Phase I — Polish Play IA (basket dans le tuning)

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| ~~**B5+ — Auto-tuning calibration**~~ | 🟢 livré 2026-05-16 (commit `0192916`) | Dichotomie sur creativity, max 8 itérations. Bouton "🎯 auto-tune" dans CalibrationPanel. Verdict converged/non + historique. | — | — |
| ~~**B6 — Vitesse accélérée live**~~ | 🟢 livré 2026-05-16 (commit `6dd7e83`) | Sélecteur ×1/×2/×4/×8 dans LiveMatchPanel. | — | — |
| ~~**B7 — Replay détaillé post-match**~~ | 🟢 livré 2026-05-16 (commit `486b039`) | Modal `<MatchReplay>` avec timeline par possession + filtres + icônes. | — | — |

### Phase G — Tooling basket-related

| Item | Statut | Description | Effort | Priorité |
|---|---|---|---|---|
| **Profiling avancé** | 🟡 | Le profiling de base est livré (J.5). Extensions : heatmap CPU par couche défensive, graphe d'appels resolveFrameAt frame par frame. | ~1-2 j | 🏀 **P3** |
| **Golden metrics élargis** | 🟡 | Le golden metrics est livré (J.6). Extensions : screenshots SVG automatiques per template pour visual regression complet (image diff). | ~1-2 j | 🏀 **P3** |

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

Total basket P1 + P2 : **~10-15 jours** ouvrés.

### ~~Salve P1 (essentiels)~~ — 🟢 livrée 2026-05-16 (4 commits)
1. ~~**E.3 — Rebond animé**~~ ✅ commit `874d96c`
2. ~~**F.2 — Free throw post-lancer**~~ ✅ commit `6bb780a`
3. ~~**Box-out auto post-shot**~~ ✅ commit `e79453c`
4. ~~**E.2 — Jump ball initial**~~ ✅ commit `a61323c`

### ~~Salve P2 (extensions tactiques)~~ — 🟡 partiellement livrée 2026-05-16
5. **E.1 V2 stage 1** ✅ commit `6d99024` — ballon adverse animé
5b. **E.1 V2 stage 2** ⚪ reste (3-5j) — 5 adversaires complets + matchups + refacto
6. ~~**Diagnostic défensif sur remise**~~ ✅ commit `dcfe8c3`
7. ~~**Templates défense d'attaque**~~ ✅ commit `e73aad2`
8. ~~**B5+ — Auto-tuning**~~ ✅ commit `0192916`

### ~~Salve P3 (polish basket)~~ — 🟢 livrée 2026-05-16 (4/4 items + 2 optionnels en suspens)
9. ~~**F.4 — Pénalité technique**~~ ✅ commit `5ae6e10`
10. ~~**Compteur 5s statique**~~ ✅ commit `6dd7e83`
11. ~~**B6 — Vitesse accélérée**~~ ✅ commit `6dd7e83`
12. ~~**B7 — Replay post-match**~~ ✅ commit `486b039`
13. **Profiling avancé** (~1-2j) — toujours en suspens, non critique
14. **Golden metrics élargis** (~1-2j) — toujours en suspens, non critique

---

## ✏️ Notes libres du user

> Ajoute ici tes consignes globales, priorités hors-tableau, idées
> nouvelles, refus de scope, deadlines, etc.

- **Priorité globale 2026-05-15** : basket uniquement, UX/mobile/tests UI repoussés
-

---

Mise à jour : 2026-05-15 (annotation priorités basket)
