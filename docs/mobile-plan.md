# Mobile plan — portage iOS (à venir)

> **Statut** : ⏸ en attente. À attaquer **quand l'app desktop sera
> considérée stable et fonctionnellement complète côté coach**. Ce
> document capture les décisions et le plan pour ne pas avoir à refaire
> l'analyse plus tard.
>
> Référencé depuis [ROADMAP.md](../ROADMAP.md).
>
> **Mise à jour 2026-09-22 (U04)** : une partie de la phase 3 est faite côté
> web — `touch-action: none` sur le terrain, appui long, pinch-zoom, barre
> tactile pour les gestes à modificateur (sélection multiple / lasso, tracé
> libre, aimantation), commandes 44 px sous `pointer: coarse`, disposition
> une colonne sous 900 px. Reste à valider sur appareil réel (U06).

---

## Décision technique — Capacitor

**Choix retenu : Capacitor (Ionic).**

Trois options évaluées :

| Approche | Avantages | Inconvénients | Verdict |
|---|---|---|---|
| **Capacitor** | Mature depuis 2019 sur iOS, écosystème énorme, plugins natifs prêts, doc/SO en pagaille, compatible Next.js static export | Bundle un peu plus gros qu'alternative natif | ✅ **Retenu** |
| Tauri v2 mobile | Bundle plus petit, ecosystem Rust | Stable iOS depuis fin 2024 seulement, peu de retours prod, doc mobile encore jeune | ❌ Trop tôt |
| SwiftUI natif | Meilleur UX iOS, perfs natives | Réécriture complète de l'UI (~1-2 semaines), 2 codebases à maintenir | ❌ Coût trop élevé pour le besoin |
| React Native | ~50-60 % de code partagé | Réécriture UI quand même, SVG moins propre via `react-native-svg` | ❌ Compromis sans gros gain |

**Pourquoi Capacitor est le sweet spot pour basket-tactics** :
- L'app est **100 % client-side** : state dans localStorage, pas d'API
  routes, pas de SSR. Static export Next.js direct.
- Le moteur tactique est du JS pur ; aucune dépendance native exotique.
- Les overlays SVG s'affichent nativement dans WKWebView sans
  réécriture.
- 1 codebase, 1 langage, 1 build pipeline.

---

## Pré-requis matériel & comptes

| Item | Coût | Quand l'avoir |
|---|---|---|
| Mac avec Xcode + Command Line Tools | (déjà là) | Phase 1 |
| Apple ID (gratuit) | 0 | Phase 2 |
| iPhone physique connecté en USB | (perso) | Phase 2 (optionnel — simulateur OK) |
| **Apple Developer Program** (99 $/an) | 99 $ | **Phase 5 uniquement** (TestFlight / App Store) |

Tester sur son propre iPhone via Xcode direct = **gratuit** (signature
ad-hoc 7 jours, à renouveler). Le compte Developer payant n'est requis
QUE pour TestFlight ou l'App Store.

---

## Phase 1 — Faire tourner sur simulateur (~2-3h)

| Tâche | Effort | Bloquant ? | Notes |
|---|---|---|---|
| Audit `next.config.js` : peut-il passer en `output: 'export'` ? | 30 min | 🟡 si SSR caché | Vérifier API routes, `getServerSideProps`, `next/image` |
| Ajouter Capacitor au repo (`init`, `add ios`, scripts npm) | 30 min | 🟢 | `npx @capacitor/cli init` |
| Adapter le build : `unoptimized: true` sur `next/image`, fix routes dynamiques | 30 min | 🟢 | |
| Installer Xcode + Command Line Tools (si pas déjà) | 30 min (gros DL) | 🟢 | App Store, ~15 GB |
| `npx cap open ios` → run sur simulateur iPhone 15 | 30 min | 🟢 | |

**Livrable phase 1** : l'app tourne dans le simulateur iOS.

---

## Phase 2 — Faire tourner sur iPhone physique (~1-2h)

| Tâche | Effort | Bloquant ? |
|---|---|---|
| Apple ID gratuit + signature ad-hoc dans Xcode (7 jours) | 30 min | 🟢 |
| Connecter iPhone, Trust Computer, run depuis Xcode | 30 min | 🟢 |
| 1ère vérif visuelle : terrain visible, scroll, premier clic | 30 min | 🟢 |

**Livrable phase 2** : app installée sur ton iPhone, gratuit, sans
compte développeur. **Limite** : re-signer toutes les semaines.

---

## Phase 3 — Adapter le tactile (~4-6h)

C'est **le vrai sujet**. Touch ≠ souris, plusieurs points à câbler :

| Tâche | Effort | Pourquoi |
|---|---|---|
| `touch-action: none` sur SVG terrain | 15 min | Sinon le scroll page intercepte le drag joueur |
| Désactiver double-tap zoom + pinch sur la viewport (meta tag) | 15 min | UX zoom involontaire |
| Tester drag joueur en touch, ajuster les zones tactiles si trop petites | 1-2h | Sprites ~30 px peut être petit au doigt — bumper le rayon de hit |
| **Long-press → équivalent clic-droit** (menu contextuel défenseur `✋ manuel`) | 1h | Pas de right-click sur iOS — câbler `onContextMenu` ou détection long-press custom |
| Tester le scrub de timeline en touch | 30 min | OK normalement |
| Safe area insets (notch + home indicator) | 30 min | Sinon UI rognée en haut/bas |
| Gérer le keyboard (si saisie numérique sliders) | 30 min | Push de la vue, scroll into view |

**Livrable phase 3** : app utilisable confortablement au doigt sur
iPhone, sans frustration tactile.

**Points sensibles spécifiques au projet** :
- Le menu contextuel `DefenderMenu` (qui contient le toggle `✋ manuel`)
  repose sur le clic droit. À porter en long-press iOS.
- Le drag joueur passe par `useCourtPointerHandlers` (rAF-coalesced) —
  vérifier que `PointerEvent` fonctionne en touch (normalement oui dans
  WKWebView moderne).
- La sélection multiple via marquee : tester le geste en touch (peut
  conflitter avec scroll natif).

---

## Phase 4 — Polish iOS (~2-3h)

| Tâche | Effort |
|---|---|
| Icône app (1024×1024 + `@capacitor/assets` génère le reste) | 30 min |
| Splash screen | 30 min |
| Status bar style (clair sur fond foncé) | 15 min |
| Orientation lock paysage (terrain est plus lisible en paysage) | 15 min |
| Plein écran (automatique en mode standalone WebView) | 0 |

**Livrable phase 4** : app visuellement aboutie, indistinguable d'une
app native au premier coup d'œil.

---

## Phase 5 — TestFlight pour partage (~1-2 jours dont 1-2 j d'attente Apple)

| Tâche | Effort |
|---|---|
| Inscription Apple Developer Program (99 $/an) | 30 min remplissage + **1-2 jours d'attente Apple** pour activation |
| Certificat + provisioning profile (auto via Xcode) | 30 min |
| Archive + upload App Store Connect | 30 min |
| Remplir métadonnées TestFlight (description, screenshots) | 1-2h |
| Invitation testeurs (toi + qq coachs) par email | 15 min |

**Livrable phase 5** : tes coachs reçoivent l'app sur leur iPhone via
TestFlight, sans avoir à passer par l'App Store public.

---

## Récap timing

- **Voir tourner en simulateur** : 2-3h
- **Voir tourner sur ton iPhone** : +1-2h
- **App utilisable au doigt** : +4-6h
- **App polish iOS** : +2-3h
- **TestFlight pour partage** : +1-2 jours (dont attente Apple)

**Total effort effectif** : ~10-15h de boulot étalé sur ~3-4 jours
calendaires (à cause des 1-2j d'attente Apple Developer Program).

---

## Ordre conseillé d'attaque

1. **Phase 1 entière** (commit unique) — Capacitor branché, static
   export OK, simulateur tourne. C'est le test "le projet est-il
   compatible Capacitor ?". Aucune réponse à ce stade côté UX, juste un
   "ça compile et ça s'affiche".
2. **Phase 2** — installer sur ton iPhone perso pour avoir le vrai
   feeling et identifier les bugs tactiles à corriger en phase 3.
3. **Phase 3** itérative — pas tout d'un coup. Corriger les blocages
   majeurs (drag, long-press, safe area) avant le polish.
4. **Phase 4** — polish quand le reste est confortable.
5. **Phase 5** — n'engager les 99 $ de l'Apple Developer Program QUE
   quand tu es sûr de vouloir partager. L'app est utilisable sur ton
   iPhone perso sans ça.

---

## Pré-requis projet avant d'attaquer

Conditions pour que ça vaille le coup de lancer la phase 1 :

- ✅ L'app desktop est **stable et utilisable** côté coach (= aucun bug
  bloquant connu, parcours principal fluide).
- ✅ Le moteur d'écran ne bouge plus tous les 3 jours (sinon on
  multiplie les chantiers de QA mobile pour des changements qui vont
  être refaits).
- ✅ Les chantiers Phase J du roadmap (qualité moteur, golden
  scenarios) sont au moins **partiellement livrés** — pour avoir des
  garde-fous automatisés et ne pas avoir à tout vérifier à l'œil sur
  mobile.

Tant que ces conditions ne sont pas réunies, le portage iOS reste **à
planifier mais pas à exécuter**.

---

## Risques connus / pièges anticipés

| Risque | Impact | Mitigation |
|---|---|---|
| `next/image` ne tolère pas le static export sans `unoptimized: true` | bloquant phase 1 | Audit avant commit Capacitor |
| Routes dynamiques `[id]` non compatibles static export | bloquant phase 1 | Audit ; à ce jour le repo n'en utilise pas |
| `localStorage` quota plus strict dans WKWebView (~5 MB selon iOS version) | moyen | Vérifier la taille typique d'un scénario sauvegardé |
| Drag joueur erratique en touch via `useCourtPointerHandlers` | bloquant phase 3 | À tester tôt, fallback `TouchEvent` natif si `PointerEvent` foire |
| Long-press vs scroll natif iOS qui se confondent | moyen | Implementer custom long-press avec timer + tolérance déplacement |
| Apple Developer Program délai d'activation imprévu | bas | Anticiper l'inscription dès qu'on sait qu'on va shipper TestFlight |

---

## Quand revisiter ce plan

- Quand l'app desktop est jugée "prête" par le user.
- Quand Phase J est avancée (golden scenarios livrés au minimum).
- Quand on a un cas d'usage concret pour iOS (ex : un coach demande à
  bosser sur iPad, démos sur tablette pendant un match).

D'ici là, **ne pas toucher**. Ce document existe pour ne pas réfléchir
deux fois.
