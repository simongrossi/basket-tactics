# 📋 TODO — chantiers restants

> Fichier à compléter par le user. Colonne **"Consignes / Priorité"**
> à remplir avec tes annotations (priorité, scope, refus, à attaquer
> plus tard, etc.).
>
> Mise à jour automatique à chaque session : tout ce qui est livré
> bascule dans CHANGELOG / ROADMAP et disparaît d'ici.
>
> Légende statut : ⚪ pending · 🔵 docs only · 🟡 partiel

---

## Phase A — Quick wins UX

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| A.2 — Mode présentation v2 | ⚪ | Fullscreen navigateur natif universel (pas seulement match), raccourcis clavier ←/→ entre steps, espace pour play/pause | ~2h |  |
| A.3 — Annotations texte | ⚪ | Notes coaching inline sur steps/zones du terrain (callout, post-it, tag textuel) | ~2h |  |

---

## Phase E — Situations spéciales

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| E.1 V2 — 2-way complet | ⚪ | Pendant la phase adverse stub, rendre les positions adverses visuellement (mirroring + matchups inversés), AppState étendu avec côté attaquant | 5-8 j |  |
| E.2 — Jump ball initial | ⚪ | Setup début de match : entre-deux au cercle central, 8 joueurs en cercle | ~1 j |  |
| E.3 — Rebond animé sur tir manqué | ⚪ | Animation du rebond (trajectoire balle, contact main, tip-in possible) au lieu d'un simple attributeur de balle | ~1 j |  |

---

## Phase F — Situations FIBA non livrées

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| F.1 — Jump ball | ⚪ | Cf. E.2 (doublonné dans la roadmap). À fusionner ou clarifier. | ~1 j |  |
| F.2 — Free throw + course-rebond | ⚪ | Animation post-lancer : si missed, les joueurs en couloir LF rebondissent vers la balle (vs setup figé actuel) | ~1-2 j |  |
| F.4 — Pénalité technique / DQ | ⚪ | Marquer un joueur disqualifié (graphiquement absent ou grisé) + recompose des matchups à 4v5 temporaire | ~0.5 j |  |

---

## Phase G — Tooling extensions optionnelles

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| G.x — Profiling avancé | 🟡 | Le profiling de base est livré (J.5). Extensions possibles : heatmap CPU par couche défensive, graphe d'appels resolveFrameAt frame par frame. | ~1-2 j |  |
| G.x — Golden metrics élargis | 🟡 | Le golden metrics est livré (J.6). Extensions : screenshots SVG automatiques per template pour visual regression complet (image diff). | ~1-2 j |  |

---

## Phase H — Tests composants UI (0% couverture actuelle)

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| H.1 — Tests DefensePanel | ⚪ | Test des boutons "Tout en auto rapide/réel", sélecteurs zone, sliders, dropdown defensive inbound mode | ~1-2h |  |
| H.2 — Tests SimulationSection | ⚪ | Test des panneaux live (start/pause/stop), calibration, possessions sélecteur, HUD overlay | ~1-2h |  |
| H.3 — Tests StepsPanel | ⚪ | Test conversion FT/inbound, annotation delete, ball carrier select | ~1h |  |
| H.4 — Tests CourtView (intégration) | ⚪ | Drag joueur, click annotation, overlay rendering, scrub timeline | ~2-3h |  |
| H.5 — Tests LiveMatchOverlay | ⚪ | Test du HUD plein écran (scores 2-côtés, shot clock, timer remise, boutons stop/exit) | ~30 min |  |

---

## Phase I — Polish Play IA (V2)

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| B5+ — Auto-tuning calibration | ⚪ | Boucle automatique qui ajuste `creativity` jusqu'à `\|Δ PPP\| ≤ 0.15` (au lieu de suggestions textuelles manuelles) | ~1-2 j |  |
| B6 — Vitesse accélérée live | ⚪ | Multiplicateurs ×2 / ×4 / ×8 sur la game loop pour tests rapides (déjà partiellement câblé via `useMatchLoop.speed`) | ~30 min |  |
| B7 — Replay détaillé post-match | ⚪ | Vue "post-mortem" qui affiche la séquence d'événements + permet le scrub sur le matchState complet (au-delà du current step-by-step) | ~1 j |  |

---

## 📱 Mobile / iOS — Phase Capacitor

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| Phase 1 — Simulateur iOS | ⚪ | `next.config.js output: 'export'`, Capacitor init, `cap add ios`, run sur simulateur Xcode | ~2-3h |  |
| Phase 2 — iPhone physique | ⚪ | Apple ID gratuit, signature ad-hoc 7j, install via Xcode | ~1-2h |  |
| Phase 3 — Adaptation tactile | ⚪ | `touch-action: none`, long-press → menu contextuel défenseur, safe area insets notch, drag joueur au doigt | ~4-6h |  |
| Phase 4 — Polish iOS | ⚪ | Icône 1024×1024, splash screen, status bar style, orientation lock paysage | ~2-3h |  |
| Phase 5 — TestFlight | ⚪ | Apple Developer Program 99 $/an, certificats, archive, métadonnées, invitation testeurs | ~1-2j + 1-2j attente Apple |  |

---

## Extensions remises en jeu (V2 — si désir)

| Item | Statut | Description | Effort | Consignes / Priorité |
|---|---|---|---|---|
| Box-out auto post-shot | ⚪ | Étendre le box-out V2 à TOUS les rebonds (pas seulement inbound), avec couche défensive `boxOutLayer` dans le pipeline engine | ~1 j |  |
| Diagnostic défensif sur remise | ⚪ | Coach diag spécifique : "ton mode deny-deny laisse O3 libre coin", "zone-press = D5 sweeper hors-zone", etc. | ~1-2 j |  |
| Templates "défense d'attaque" | ⚪ | Templates qui montrent une zone 1-3-1 ou 2-3 face à un BLOB Box (pédagogie défensive sur remise) | ~30 min / template |  |
| Compteur 5s diagnostic statique | 🟡 | Le timer live est livré. Ajouter un diagnostic statique qui calcule la durée estimée des étapes inbound et flag si > 5s (basé sur secondsPerStep) | ~1h |  |

---

## ✏️ Notes libres du user

> Ajoute ici tes consignes globales, priorités hors-tableau, idées
> nouvelles, refus de scope, deadlines, etc.

-

---

## Workflow recommandé

1. Tu remplis la colonne **"Consignes / Priorité"** des items qui t'intéressent
   (ex: "P1 — pour ce week-end", "P3 — après les tests", "skip", "scope à clarifier")
2. À la prochaine session, on attaque dans l'ordre des priorités
3. Une fois livré, l'item bascule dans CHANGELOG et disparaît d'ici

Mise à jour : 2026-05-15 (post-extension remises en jeu)
