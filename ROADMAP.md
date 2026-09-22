# Roadmap

Vision produit forward-looking.

- Pour l'**historique des évolutions de comportement** (livré, daté, structuré), voir [CHANGELOG.md](CHANGELOG.md).
- Pour la **cartographie du moteur de jeu** (individuel / collectif / physique), voir [docs/GAME-ENGINE.md](docs/GAME-ENGINE.md).
- Pour le **backlog technique fin et notes de développement**, voir [IDEAS.md](IDEAS.md).

Statuts : 🟢 fait · 🟡 en cours · ⚪ à faire

## 🧭 Priorité actuelle (mise à jour 2026-09-22)

Décision du user (22/09) : **finir d'abord le réalisme des déplacements et du
placement défensifs**, puis l'axe coaching (le quiz est validé comme idée mais
passe après). Ordre de travail :

1. **Réalisme défensif** — [plan P3/P4](docs/plan-comportements-physiques.md) :
   ✅ P3.3 congestion en trafic (2026-09-22) → ✅ P3.1 rampe d'accélération (2026-09-22) → P3.5 poursuite
   anticipée (closeout) → P4.1 porteur qui frôle son écran → poursuite V4 en
   lecture (fatigue, regard, anticipation — « Priorisation moteur » #9) ;
   P4.3 / P4.4 à instruire séparément.
2. **Axe coaching** (tableau § « Coaching — usage entraînement » ci-dessous) :
   quiz / lecture cachée → clés d'enseignement → fiche d'une page par système
   → effectif réutilisable → tableau blanc.
3. **Consolidation coach** ([PLAN-COACH.md](PLAN-COACH.md)) — lots 1 et 2 🟢 ;
   reste U06 (essai coachs + tablette physique, humain) et le lot 3 réalisme
   validé (R01→R04).
4. **Moteur / simulation** : tableau « Priorisation moteur » plus bas (fautes,
   transition, match simulé V2, zone…).

## 🔎 Audit expert basket — 2026-06-11 (consolidation)

> **Référence pour l'axe moteur / simulation** (l'ordre global est dans
> « Priorité actuelle » ci-dessus). Elle croise la
> relecture « œil de coach » du moteur avec **tous** les chantiers ⚪/🟡
> encore ouverts dans ce fichier et dans [IDEAS.md](IDEAS.md). Les
> sections plus bas restent l'historique détaillé.

### État des lieux

Le **demi-terrain placé est mature** : défense 14+ couches (PnR, scram,
junk, press, zones), offense en lecture réactive (Phase L), motion
complet (continuité + auto-replacement + ball-chain), réalisme
cinématique actif par défaut, ~2060 tests verts (2 466 au 2026-09-22). Les manques sont
désormais concentrés sur **4 axes** : contact/fautes, transition,
match-sim crédible, attaque de zone.

### 🔴 Critiques — ce qui empêche de simuler un vrai basket

1. **Contact & fautes — le demi-jeu absent.** Aucune faute dans le
   moteur : pas de faute défensive sur drive, pas d'and-one, pas de
   bonus / lancers-francs comme issue de possession, pas de passage en
   force. Le foul-to-give n'est qu'un diagnostic. ~20 % des possessions
   réelles se terminent sur un coup de sifflet. Déjà tracé (programme
   réalisme 2b.2 fautes → 2b.3 charge + chantier #12 ci-dessous) mais
   **à promouvoir en chantier structurant** : tag du roller, drive
   containment et rebond restent des approximations géométriques tant
   que le contact n'existe pas.
2. **Transition — livrée au tiers.** L'outlet + sprint des couloirs
   existe (sous-projet 1). Manquent : la **lecture de l'avantage
   numérique** (2c1 : attaquer le défenseur, passer au dernier moment ;
   3c2 : couloirs + drag), la **conclusion** (layup vs kick corner), le
   **secondary break** (bascule vers le demi-terrain placé), et côté
   défense le **cross-matching du repli** (prendre le premier attaquant
   disponible, pas son homme) avec la hiérarchie réelle : arrêter le
   ballon → protéger le panier → matcher ensuite. ~25-30 % des
   possessions.
3. **Match-sim — adversaire factice.** `AWAY_SCORE_PROBABILITY` à 50 %
   hardcodé : l'équipe adverse tire à pile ou face. Pas de fatigue en
   mode match, pas de quart-temps, pas de timeout, pas de banc. Le
   roster nommé livré appelle la suite logique : 5 de départ,
   remplacements, minutes.
4. **Attaque de zone** — 🟡 **V1 livrée 2026-06-12** (commit `4e353d9`) :
   3 templates anti-zone avec lectures (`antiZoneTemplates.ts`) —
   **Surcharge vs 2-3** (overload + short corner, lectures en cascade
   multi-niveaux : low sort → corner → fermé → renversement),
   **Flash high post vs 2-3** (nail + high-low), **Renversement short
   corner vs 1-3-1** (dilemme de l'ancre). Les templates activent la
   zone correspondante au chargement (`Template.defenseSystem/zoneType`).
   Reste ⚪ : écran sur la zone (screen the zone), zone matchup/3-2,
   lectures RÉACTIVES anti-zone (triggers lus sur la zone, pas seulement
   branches manuelles), spacing anti-zone dans les générateurs.

### 🟠 Moyens — réalisme et profondeur tactique

5. **Rebond naïf + décision crash vs repli.** `match/rebound.ts` ignore
   le box-out réel et la détente (multiplicateurs hardcodés :
   rim-roller ×1.4). Et côté offense il manque la **décision crash vs
   sécurité** (envoyer 2-3 au rebond offensif ou se replier) — un vrai
   choix de coach moderne. Recouvre A11 V3 (boxOutLayer dynamique).
6. **Extensions Phase L** : 🟡 **arbres multi-niveaux livrés 2026-06-11**
   (commit `77ab9c5` : `parentBranchId`, compilation en cascade,
   breadcrumb + sous-branches dans l'éditeur nodal). Reste ⚪ : receveur
   dynamique sur le drive-and-kick, lectures réactives de niveau 2
   (trigger sur une sous-branche).
7. **Game management fin de match** *(nouveau)*. Late shot clock et
   foul-to-give existent en diagnostic, mais aucune situation de fin de
   match : 2-for-1, faute volontaire à +3, tenir la dernière
   possession, raccourcir le jeu quand on mène.
8. **Lacunes défensives résiduelles** (IDEAS §8) : X-out limité à un
   seul roller, pas de re-scram en cascade, tag du roller sans contact.
   À ranger derrière le chantier fautes (le contact en est le
   prérequis).
9. **Poursuite défenseur V4 en playback.** Fatigue, lecture du regard et
   anticipation variable ne vivent qu'en édition (drag attaquant). En
   playback, seul le legacy `footworkRulesEnabled` est actif — la
   lecture animée est moins « vivante » que l'édition, alors que c'est
   elle qu'on montre aux joueurs.

### 🟡 Mineurs / opportunités

10. **Latéralité fonctionnelle** : `dominantHand` n'affecte que le
    sprite. Finition main faible / drive côté fort changerait les
    lectures de l'ice (forcer la mauvaise main est le but réel de cette
    couverture).
11. **Boxscore / stats par possession** dans le match-sim (efficacité
    par action, par joueur) — transformerait la simulation en outil
    d'analyse.
12. **Spacing optimum global** : `positionOffBall` reste glouton par
    paires ; fill spacing-optimal avec bonus corner noté restant
    (Phase Motion).
13. **Comparaison côte-à-côte** de deux défenses sur le même système
    (backlog IDEAS, forte valeur coach).

### 🛠️ Dette qui conditionne ces chantiers

- 🟢 **Tests d'intégration du pipeline défensif — couverts (2026-06-11)**.
  Le « risque de régression #1 » de l'audit 2026-05-29 était partiellement
  périmé : DM.2 (`defense/__tests__/pipelineIntegration.test.ts`) existait
  déjà, mais figé sur l'état pré-juin. **Vague 2 livrée** (commit `c581327`,
  +29 tests) : matrice étendue aux 6 couches de juin (driveContainment,
  weakSideAnchor, blitzRelease, unwind, snakeKeep, switchPolicy), test
  sémantique « PnR + aide coexistent », double écran porteur + off-ball,
  séquence multi-steps avec invariants à chaque step, systèmes
  court-circuit zone/junk/press. Les chantiers fautes/transition peuvent
  insérer des couches avec ce filet.
- **God-objects** : 🟢 `gameLoop.ts` **découpé 2026-06-11** (2080 → 325 l.,
  barrel + 7 modules dans `match/gameLoop/`, API publique inchangée,
  commit `0a3b95e`) — les chantiers fautes et match-sim V2 travailleront
  dans ces modules. Restent ⚪ : `frameResolver.ts` (~2000 l. — session
  dédiée, épicentre Règle 1bis), `DefensePanel.tsx` (~1550 l.), dédup
  ball-side/weak-side (3 chemins), prop drilling 40+ callbacks depuis
  `page.tsx`.

### 🏀 Coaching — usage entraînement / avec les joueurs (2026-06-17)

Axe « montrer & enseigner les systèmes » — l'usage premier de l'outil est de
présenter/enseigner des systèmes aux joueurs, pas de simuler des matchs
(cf. mémoires coaching-first + coaching-backlog). Backlog des 7 chantiers
identifiés à l'audit coaching, avec statut :

| # | Chantier | Statut | Notes |
|---|---|---|---|
| 1 | **Mode présentation des systèmes + révélation pas-à-pas** — grand terrain, zéro chrome d'édition, télécommande « étape suivante » pour dérouler le set phase par phase en parlant (tablette/TV) | 🟢 **livré** (`f5bb97a`) | `PresentationBar` + `realSteps.ts` (navigation) + `stepNumbering.ts` (compteur commun, 2026-09-22) : ◀/▶ étapes réelles, lecture, clavier ←/→/Espace, timeline masquée, entrée en lecteur force la vue terrain. Brique `masquage d'équipe` (`showDefenders`/`showAttackers`, `594bc4e`) incluse |
| 2 | **Mode quiz / lecture cachée** — montrer la situation, masquer la branche de lecture, « si drop, tu fais quoi ? », puis révéler. Entraînement à la décision | ⚪ **prochain** | Quasi gratuit : réutilise les arbres de lecture multi-niveaux (`scenarioBranches` + `parentBranchId`, `77ab9c5`). Très forte valeur pédagogique, unique |
| 3 | **Planification de séance / drills** — échauffement → exercice → situation → scrimmage, avec durées | 🟢 **livré** (`23901ec`, `3019aa5`) | Vue Séances + `practiceSessions.ts` : agenda de blocs chronométrés (systèmes biblio + blocs libres), total auto, fiche imprimable + déroulé guidé (U05, 2026-09-22 : bloc précédent/suivant, minuteur, consignes, variantes, reprise, brouillon restauré). Reste possible : éditeur de drills dédié (dessins distincts des systèmes) |
| 4 | **Fiches imprimables propres (handouts joueur)** — une page par système (diagramme + clés + consignes) à donner/afficher | ⚪ | `window.print()` actuel sort les vignettes Playbook + la fiche de séance, mais pas un handout d'une page par système. Synergie avec #5 |
| 5 | **Clés d'enseignement structurées par étape** — points clés / erreurs fréquentes / timing attachés au système, affichés en présentation | ⚪ | Aujourd'hui `Step.label` + notes texte libres seulement. Donnerait du contenu à #1 (présentation) et #4 (handouts) |
| 6 | **Roster réel réutilisable** — effectif d'équipe défini une fois (postes, main forte), appliqué à n'importe quel template | ⚪ | Noms/numéros aujourd'hui par-scénario (`playerNames`/`playerNumbers`). Personnaliserait les systèmes aux vrais joueurs |
| 7 | **Tableau blanc freehand** — stylo libre pour griffonner un ajustement à la volée (« je te le dessine ») | ⚪ | Annotations aujourd'hui structurées (passe/cut/écran). Réflexe coach en timeout |

Ordre conseillé pour la suite : **#2 (quiz)** d'abord (valeur max, coût quasi
nul vu les arbres multi-niveaux), puis **#5 → #4** (clés d'enseignement qui
alimentent les handouts), puis **#6 (roster)** et **#7 (whiteboard)**.

Autres finitions coaching ouvertes (IDEAS) : sélectionner une flèche pour la
supprimer / modifier (aujourd'hui « Supprimer la dernière flèche »), couleurs
des flèches, comparaison côte-à-côte de deux défenses.

🟢 **Construction d'un système pas à pas — 2026-09-22** : « + étape » sans
temps mort, outils accessibles en 1024×768, bandeau de guidage, numérotation
unique (`stepNumbering.ts`), et règle « ce qui est dessiné sur l'étape k se joue
pendant k → k+1, passes comprises » (`stepActions.ts`, libellés des modèles
remontés sur l'étape de l'action). Détail : CHANGELOG et PLAN-COACH.

### 📌 Priorisation moteur / simulation (après l'axe coaching — cf. « Priorité actuelle »)

| # | Chantier | Statut | Effort | Valeur |
|---|---|---|---|---|
| 1 | Tests d'intégration pipeline ✅ + découpe `gameLoop` ✅ (2080→325 l., 2026-06-11) · découpe `frameResolver` ⚪ (session dédiée — épicentre Règle 1bis) | 🟡 | 1j restant | 🛡 sécurise tout le reste |
| 2 | **Contact & fautes** — 2b.1 issues du drive ✅ (2026-06-11, pull-up/kick-out/strip mid-drive) → 2b.2 fautes ⚪ → 2b.3 charge ⚪ → bonus/LF ⚪ | 🟡 | 1-1.5j restants | 🔴 manque basket #1 |
| 3 | **Transition complète** (2c1/3c2 + secondary break + cross-matching) | ⚪ | 2-3j | 🔴 25-30 % des possessions |
| 4 | **Match-sim V2** (adversaire réel, fatigue, quart-temps, banc) | ⚪ | 2-3j | 🔴 dépend de 2+3 |
| 5 | **Attaque de zone** — V1 ✅ (2026-06-12, 3 templates + lectures) · screen-the-zone, lectures réactives anti-zone ⚪ | 🟡 | 1-2j restants | 🔴 gap critique comblé en V1 |
| 6 | Extensions Phase L — multi-niveaux ✅ (2026-06-11, sous-branches récursives) · receveur dynamique ⚪ | 🟡 | 0.5-1j restant | 🟠 synergie travail actuel |
| 7 | Game management fin de match (2-for-1, faute à +3…) | ⚪ | 1j | 🟠 |
| 8 | Rebond réaliste + crash vs repli (recouvre A11 V3) | ⚪ | 1-2j | 🟠 |
| 9 | Poursuite défenseur V4 en playback | ⚪ | 1j | 🟠 qualité visuelle lecture |
| 10 | Latéralité fonctionnelle · boxscore · comparaison côte-à-côte | ⚪ | ponctuel | 🟡 |

---

## 🟡 Chantiers de l'Audit (Juin 2026)

À la suite de l'audit complet du produit, de nouveaux chantiers prioritaires ont été définis pour rendre l'application pleinement opérationnelle pour des coachs réels :

1. **🟢 Roster Nommé & Numéros de maillots** : Remplacer les identifiants techniques `O1-O5` / `D1-D5` par les noms et numéros des vrais joueurs sur le terrain, dans les menus contextuels, et dans le panneau des paramètres. *(Fait)*
2. **🟢 Compatibilité Tactile & Ergonomie** : Bumper la zone de saisie des joueurs (~44px) pour tablettes, implémenter un appui long (long-press) pour remplacer le clic droit sur iOS/Android, et ajouter le Zoom & Pan SVG sur le terrain. *(Fait)*
3. **🟢 Partage Collaboratif Simplifié** : Permettre de générer des liens de partage instantané (ex. URL compressée en Base64 contenant tout l'état de l'application, ou base de données cloud légère). *(Fait)*
4. **⚪ Réalisme & Simulation de Match (Match-Sim) V2** : Ajouter un système de fautes réelles (personnelles et bonus), gestion des lancers-francs, et fatigue influençant la vitesse de pointe. → repris et élargi par l'audit 2026-06-11 (items 2 + 4 de la priorisation consolidée).
5. **🟡 Éditeur de Scénario Graphique** *(en cours, juin 2026)* : éditeur nodal pour concevoir et visualiser graphiquement les branches de lecture réactives. **V1 livrée** (canvas arbre interactif + sidebar propriétés + aperçu PiP + persistance Playbook Library + filtrage par perspective joueur). Arbres multi-niveaux livrés 2026-06-11 (`77ab9c5`). Restant : receveur dynamique, lectures réactives de niveau 2.

---

## 🟢 Offense en lecture réactive — Phase L (livré 2026-05-29)

Le moteur défensif est très abouti (14 couches, couvertures FIBA). L'offense
**lit maintenant la défense** et choisit sa continuation automatiquement
(blitz → short roll, drop → pull-up, switch → mismatch). C'est le passage
« tableau animé » → « simulateur tactique ».

**Livré (L.0 → L.3)** : noyau pur + bibliothèque de 7 lectures canoniques +
UI ScenarioPanel (onglets réactifs, badge "Lecture auto") + lectures hors PnR
(drive-and-kick via `help-source`, backdoor via `deny`). +40 tests. Suite 1864 verte.

**Extension livrée (2026-06-02)** : lecture probabiliste — la défense joue une
distribution de couvertures seedée (drop 70 % / blitz 30 %) pilotant à la fois le
rendu défensif et la branche lue.

**Restant (extensions)** :
- 🟢 Arbres multi-niveaux (sous-branches récursives) — livré 2026-06-11 (`77ab9c5`)
- Receveur dynamique sur le drive-and-kick

- Spec : [docs/superpowers/specs/2026-05-29-offense-lecture-reactive-design.md](docs/superpowers/specs/2026-05-29-offense-lecture-reactive-design.md)
- Plan (Phase L) : [docs/superpowers/plans/2026-05-29-offense-lecture-reactive.md](docs/superpowers/plans/2026-05-29-offense-lecture-reactive.md)
- Audit complet (motion, transition, fautes, dette code, produit) :
  [IDEAS.md § Audit expert 2026-05-29](IDEAS.md)

## 🟢 Motion offense — Phase Motion (livré juin 2026, A+B+C)

L'offense gagne la **continuité** (boucle + rotation des rôles), le **maintien du
spacing** (fill auto) et le **routage du ballon** (reversal / DHO). Axe motion
**complet**.

**Livré (2026-06-02)** :
- **Sous-projet A — continuité rotative** (`continuityLoop`) : déroulé au
  compile-time, permutation σ, sortie hybride sur lecture Phase L. ~19 tests.
- **Sous-projet B — auto-replacement** (`autoReplacementEnabled`) : cascade de
  fill *fill-from-behind* auto sur cut/drive, profondeur bornée 1–4, clearance
  garantie. ~21 tests.
- **Sous-projet C — ball-chain** (`ball-reversal` / `dho-chain`) : route le
  ballon à travers une chaîne unifiée (mode par lien pass/dho), expander
  `expandBallChain` déléguant aux générateurs un-lien. ~8 tests.

**Restant (extensions, non bloquant)** :
- Rotation auto-dérivée / miroir, sortie intra-cycle, snap formation, fill
  spacing-optimal (corner bonus), auto-route de chaîne côté faible

- Specs : [continuity](docs/superpowers/specs/2026-06-02-continuity-motion-offense-design.md) · [auto-replacement](docs/superpowers/specs/2026-06-02-auto-replacement-design.md) · [ball-chain](docs/superpowers/specs/2026-06-02-ball-chain-design.md)
- Plans : [continuity](docs/superpowers/plans/2026-06-02-continuity-motion-offense.md) · [auto-replacement](docs/superpowers/plans/2026-06-02-auto-replacement.md) · [ball-chain](docs/superpowers/plans/2026-06-02-ball-chain.md)

## 🟠 Transition / fast-break (en pause depuis juin 2026 — sous-projet 1 livré)

Le dernier gros 🔴 de l'audit (IDEAS §3, ~25-30 % des possessions). L'offense
gagne la **transition** : rebond → outlet → course.

**Livré (2026-06-02)** :
- **Sous-projet 1 — outlet + sprint des couloirs** (`buildFastBreakSteps` /
  `addFastBreakSteps`) : sur rebond défensif, l'équipe qui rebondit (mapping D→O
  sans miroir) part en fast-break full-court (outlet + 3 couloirs vers
  `HOOP_OPPOSITE` + repli défensif), bouton ⚡ StepsPanel. ~10 tests.

**Restant (sous-projets)** :
- Avantage numérique 2c1/3c2 + conclusion (layup / lecture) — sous-projet 2
- Secondary break → bascule vers le demi-terrain placé — sous-projet 3
- Transition auto dans le match-sim (audit #7)

- Spec : [fast-break](docs/superpowers/specs/2026-06-02-fast-break-outlet-lanes-design.md)
- Plan : [fast-break](docs/superpowers/plans/2026-06-02-fast-break-outlet-lanes.md)

## Livré récemment (juillet 2026)

- 🟢 **Session 2026-07-01/02 — Comportements physiques défensifs, plan P0→P2**
  (9 commits, 2213 → 2279 tests verts). Plan priorisé complet dans
  [docs/plan-comportements-physiques.md](docs/plan-comportements-physiques.md)
  (7 axes audités : déplacement, écrans, ralentissements, logique,
  contournements, lignes de passe, weak-side). Livré :
  - **P0.1** — utilitaire partagé `logic/courtSides.ts` (ball-side /
    weak-side / strong-side) : dé-duplique la logique de côté inlinée sur
    5 fichiers, 2 sémantiques historiques préservées (bande centrale vs
    signe strict), refacto bit-identique.
  - **P1.1** — stance help-side **split line** (opt-in
    `helpSideStanceEnabled`) : défenseur weak-side à 2 passes → axe panier
    à hauteur du ballon, un pied dans la raquette.
  - **P1.2** — côté de contournement selon over/under : **déjà couvert**
    par le moteur de routes (`carrierScreenRoutePreference`) — TODO
    IDEAS.md obsolète corrigé + 4 tests garde-fous du contrat.
  - **P1.3** — overlay pédagogique **triangles de vision** (« vois ton
    homme, vois le ballon ») : triangle ballon-défenseur-homme + badge
    d'angle open/wide/flat (toggle `showDefenseTriangles`).
  - **P1.4** — **shrink weak-side sur drive naissant** (opt-in
    `weakSideShrinkEnabled`) : pré-trigger `detectEarlyDrive` (rampe
    10→25 px vers le panier), l'aile opposée se resserre AVANT l'aide
    active.
  - **P2.1** — **jump the passing lane** (opt-in `jumpPassingLanesEnabled`) :
    pendant le vol d'une passe, pas dans la ligne (max 12 px, enveloppe
    sin(π·t), endpoints moteur intacts) puis retour.
  - **P2.2** — **deny du reversal au nail** (opt-in `denyReversalEnabled`) :
    ballon sur l'aile → le défenseur du joueur en tête conteste le swing
    au nail.
  - **P2.3** — re-scopé : déjà couvert (PassLanesOverlay + `passOpenRule`).
  - Audit P3/P4 : `realismProfile` (P3.4), inertie de virage playback
    (P3.1 partiel) et routage D.4 (P4.2) **déjà livrés** — le plan les
    re-scope ; restent la rampe d'accélération défenseur, la pénalité de
    congestion (tests RED écrits), le porteur shoulder-to-shoulder.

## Livré récemment (juin 2026)

- 🟢 **Session 2026-06-01/02 — Lacunes basket + défensives** : closeout quality
  ring (#5), spacing aux corners (#6), 3 templates offensifs (Iverson/Stagger/PNR
  aile), puis les 3 lacunes défensives de l'audit 2026-05-29 — hedge par défenseur
  (#8.3), ancre weak-side explicite (#8.2), relâche du blitz quand le ballon
  ressort (#8.1). Tout opt-in. **1923 → 1945 tests verts.** Détail dans
  [CHANGELOG.md](CHANGELOG.md).

## Livré récemment (mai 2026)

- 🟢 **Session 2026-05-12 — Grande session 4 phases** : **27 commits**,
  **541 → 714 tests verts (+173)**. Récap complet dans
  [docs/session-2026-05-12.md](docs/session-2026-05-12.md).

  **Phase 1 — Refactoring modularité (6 commits, +61 tests)** :
  6 plus gros fichiers du repo éclatés. 4 patterns documentés
  (barrel + dossier, transforms purs + hook mince, hooks + sous-composants,
  **registry de règles**). API publique strictement inchangée.

  **Phase 2 — Audit défensif B1-B10 (10 commits, +59 tests)** :
  10 concepts basket manquants identifiés et tous livrés :
  - **🔴 Critiques** : B1 mismatch+scram · B2 reject detect · B3 hard/soft
    hedge · B4 snake detect
  - **🟠 Moyens** : B5 empty side · B6 dig/double · B7 def 3sec ·
    B8 switch policy · B9 top-lock timing · B10 bump cutters

  **Phase 3 — UX panneau gauche (5 commits, +21 tests)** :
  #1 saisie num sliders · #2 snap-to-grid (Ctrl/Cmd) · #3 graphique
  métriques · #4 sélection multiple · #5 templates user.

  **Phase 4 — V2/v3 défensif (2 commits, +15 tests)** :
  Trap v3 (coexistence avec écran) · B2 V2 (unwind reject) · B4 V2
  (snake keep coverage) · Undo/Redo v2 marqué (déjà fait).

  **Nouveaux modules / patterns** :
  - **6 helpers purs** : `mismatchTracking`, `detectRejectedScreen`,
    `detectSnakeDribble`, `emptySidePnR`, `cutterScreenChain`,
    `switchAllowed`.
  - **2 nouvelles couches du pipeline défensif** :
    `postCoverageLayer` (4.5), `cutterBumpLayer` (5.5).
  - **6 nouveaux settings opt-in** : `scramSwitchEnabled`,
    `mismatchThreshold`, `hedgeAggression`, `switchPolicy`,
    `autoBumpCutters`, `postCoverage` (+ `unwindRejectedScreens` et
    `snakeKeepCoverage` pour les V2).
  - **5 nouvelles règles coach** : scram-switch enrichi, rejected-screen,
    snake-dribble, defensive-3sec, empty-side-pnr.
  - **8 modules de transforms purs** extraits de useAppState
    (testables sans React).

  Toutes les nouvelles features défensives sont **opt-in** pour
  préserver la rétrocompat. Tests à 100% verts à chaque commit, TS
  strict, API publique inchangée sur les refactos.

- 🟢 **B1 — Mismatch tracking + scram switch** (2026-05-12) :
  - **Détection** : `mismatchSeverity(D, A) = |defenderRank - attackerRank|`, range 0..4. Propagé sur chaque `ComputedDefender`, visible à chaque step y compris en l'absence de switch (le coach voit aussi les bad matchups manuels).
  - **Scram switch** correctif (opt-in via `state.scramSwitchEnabled`) : après un switch porteur qui crée un mismatch ≥ seuil, un défenseur tiers ≤ 200px de l'attaquant exposé prend le mismatch ; le défenseur en mismatch part sur l'attaquant naturel du scrameur. Algo basket-correct : tie-break côté porteur (menace immédiate), métrique d'amélioration sur le **pire** mismatch (pas la somme).
  - **Visuel** : badge sous le sprite défenseur — orange (severity 2), rouge (≥3), bleu "SCRAM" si scram appliqué.
  - **UI** : toggle + sélecteur de seuil dans `DefensePanel` (visible seulement avec rule `switch` ou `peel-switch`).
  - **Diagnostic coach** enrichi en 4 niveaux selon severity (good/critical/warning/info).
  - 17 tests (12 unitaires + 5 intégration). **602 → 619 tests verts**.
  - Premier item de la liste **B** (audit défensif) livré.

- 🟢 **Cycle modularité — découpage des 6 plus gros fichiers** (2026-05-12) :
  - **`scriptedGenerators.ts` : 1502 → 92 lignes** (barrel) — 57 générateurs FIBA répartis par tier (helpers + tier1/2/3). Ajouter une action = 1 sous-fichier + 1 ligne.
  - **`useAppState.ts` : 967 → 510 lignes** — toute la logique métier extraite en 8 namespaces de transformations pures `(state, ...args) => state` dans `src/lib/state/transforms/`. **61 nouveaux tests** unitaires sur ces transforms (sans setup React).
  - **`CourtView.tsx` : 902 → 446 lignes** — extraction des hooks `useCourtFrame` (frame statique/scrub/playback) et `useCourtPointerHandlers` (drag + tracé annotations en rAF-coalesced). Sous-composants `<CourtPlayersLayer>` (sprites + screener gaze override) et `<CourtMenus>` (context menus + zone region).
  - **`ContextMenu.tsx` : 897 → 22 lignes** — dispatch pur. Logique éclatée dans 5 modules : `popupHooks` (clamp + drag), `ToolBar`, `sharedRows`, `DefenderMenu`, `AttackerMenu`.
  - **`screens.ts` : 822 → barrel + 5 modules** — épicentre des bugs récurrents, isolé en `helpers.ts`, `detectCarrierScreen.ts`, `carrierScreenAdjust.ts`, `detectOffBallScreens.ts`, `offBallScreenAdjust.ts`. Ajouter une rule défensive = 1 fichier ciblé.
  - **`coachDiagnostics.ts` : 834 → barrel + 13 rules** — pattern **registry de règles** : chaque diagnostic vit dans `rules/<name>.ts` sous forme `(ctx) => CoachDiagnostic[]`. Ajouter un diagnostic basket = 1 fichier + 1 entrée dans le registry. Plus aucune lecture des 833 autres lignes.
  - **API publique strictement inchangée** sur les 6 fichiers : zéro caller modifié.
  - **541 → 602 tests verts** (+61 sur les transforms purs `useAppState`, possibles seulement après extraction).
  - 4 nouveaux patterns documentés dans [docs/architecture.md § Modularité & refactoring](docs/architecture.md#modularité--refactoring) : barrel + dossier, transforms purs + hook mince, hooks + sous-composants, registry de règles.
  - Historique complet : [docs/refactoring-history.md](docs/refactoring-history.md). Méthode reproductible pour les prochains gros fichiers.
  - **Audit moteur défensif** : ~70 % des concepts basket élémentaires couverts. **10 trous métier** identifiés et ajoutés à § 1 (mismatch tracking, reject screen, hard/soft hedge, snake dribble, empty side PnR, dig/double post, defensive 3 sec, switch policy granulaire, top-lock timing, bumping cutters). + **box-out/rebond** noté en § 4 comme demi-jeu manquant.

- 🟢 **Refacto moteur défensif en couches** (2026-05-10) :
  - **`engine.ts` : 982 → 117 lignes** (-88%). Le calcul des cibles défensives (`computeDefenseTargets`, ~290 lignes monolithique) découpé en pipeline de 6 couches isolées dans `src/lib/logic/defense/` : context → baseTargets → pnrRotations → offBallScreen → trap → directives → postPassOrientation. Chaque couche est testable en isolation derrière une signature `(positions, [matchups,] ctx) → void`.
  - `effectiveDefensePositions` (contrainte vitesse + closeout + friction + collisions, ~235 l) sortie dans `defense/speedConstraint.ts`. `followDefendersAtFrame` + `recomputeDefenseFrameOrientations` dans `defense/frameAdjust.ts`. `computeAttackerVisuals` dans `attackerVisuals.ts`. `detectStepScreenAction` dans `events/triggerDetector.ts`.
  - **`CourtView.tsx` : 1222 → 811 lignes** (-34%). Boucle d'animation extraite dans le hook `usePlaybackAnimation`, calcul de frame interpolée (play + scrub) unifié dans `playback/frameResolver.ts`. Plus de divergence silencieuse possible entre play et scrub. Les 10 overlays regroupés sous `src/components/overlays/`. `GhostLayer` extrait.
  - Centralisation des constantes physiques : `COURT_CENTERLINE_X`, `CARRIER_SIDE_TOLERANCE_PX`, 5 offsets `PLAYER_*` dans `data/court.ts` ; `DRIBBLE_THRESHOLD_PX`, `POST_HOLD_THRESHOLD_PX` dans `constants/gameplay.ts` ; `normalizeAngle`/`angleDiff`/`lerpAngleDeg` dédupliqués dans `logic/angles.ts`. **`vision.ts` et `orientation.ts` restent strictement séparés** — seul le math angulaire pur est mutualisé.
  - Comportement bit-identique (zéro changement fonctionnel), 336 tests verts à chaque sous-étape, ré-exports gardés sur `engine.ts` pour préserver l'API publique.
  - Détail complet : [CHANGELOG.md § Refactor](CHANGELOG.md). Architecture mise à jour : [docs/architecture.md](docs/architecture.md).

- 🟢 **0.8.0 — cycle "lecture animée fidèle"** (2026-05-10) :
  - **Trajectoires courbes** : annotation `cut`/`dribble`/`screen` gagne `waypoints?: Point[]`. Shift+drag enregistre un freehand simplifié en 3-7 waypoints (Douglas-Peucker, tolérance 6 px). Rendu et lecture via spline Catmull-Rom (τ=0.5, équivalent Bezier cubique exact en SVG), reparamétrée en longueur d'arc → vitesse perçue constante quel que soit la courbure. V-cut, L-cut, démarquage en arc, dribble curviligne couverts. Module [`polyline.ts`](src/lib/logic/polyline.ts).
  - **Suivi temps-réel des défenseurs en lecture** : `followDefendersAtFrame` ([`engine.ts`](src/lib/logic/engine.ts)) recalcule chaque défenseur (carrier + off-ball) à chaque frame depuis la position courante de son attaquant marqué via `carrierDefenderTarget` / `offBallStanceTarget` / `manTarget`. Avant, l'interpolation linéaire entre defA et defB faisait que le défenseur prenait la corde des arcs offensifs. Skip si placement manuel via `defenseOverrides`.
  - **`hedge` complet** : avant, seul `screenerDef` (D5) sortait en show. Maintenant `carrierDef` (D1) passe **over the top** avec décalage latéral 8-16 px tight sur le porteur. Le couple D1/D5 ferme à la fois pénétration et rejection.
  - **Regard auto distance-based** ([`vision.ts`](src/lib/logic/vision.ts)) : en stance sag/behind/défaut, la cible primaire bascule selon la distance (`PROXIMITY_GAZE_RATIO = 0.65`). Si l'homme est nettement plus proche que le ballon il devient primary, sinon le ballon reste primary. Clamp ±60° préservé.
  - **Dribble en wave lisse** : tracé du dribble passe d'une polyligne en dents de scie à une chaîne de Bezier quadratiques avec jonctions C1 ([`dribbleWave.ts`](src/lib/logic/dribbleWave.ts)).
  - **Pause fige + reprise depuis l'instant t** : ⏸ propage `playbackT` dans `scrubT` qui pilote `scrubFrame` (capture possible). ▶ après pause décale `playStart` en arrière de `T × stepDuration` via la nouvelle prop `playbackStartT`. ⏹ reset complet.
  - **Lecture ralentie** : `PLAYBACK_STEP_DURATION_MS = 2000` (au lieu de 1500), centralisé dans [`physics.ts`](src/lib/data/physics.ts). À 1× = 2 s par étape, slider 0.3×–2× module sur cette base.
  - 14 nouveaux tests dans `polyline.test.ts`, +1 dans `screens.test.ts`, mise à jour de `dribbleWave.test.ts`. Suite : **302 tests verts**.
  - Détail complet : [CHANGELOG.md § Unreleased](CHANGELOG.md).

- 🟢 **0.7.0 — cycle "pictogramme + champ de vision + overrides manuels"** (2026-05-09) :
  - Convention B asymétrique pour le calcul d'orientation (corps en open stance, regard, 2 cibles de bras par rôle).
  - Invariants anatomiques inviolables : regard ∈ ±60° du corps (cône de vision), aucun bras dans le dos.
  - Champ de vision par joueur : cônes heatmap cyan (défenseurs) / orange (attaquants), 120° d'ouverture, jusqu'aux limites du terrain. 3 toggles globaux dans Paramètres + clic-droit individuel par défenseur. Heatmap croisée par superposition.
  - Sliders manuels orientation corps + regard via clic-droit, pour défenseurs ET attaquants. Override absolu 0–360° (regard clampé à ±60° du corps en aval).
  - Design des bras figé (Design F) après comparaison de 8 variantes via la page `/demo-arms`.
  - UI : panneau Paramètres déplacé à gauche en pop-up modal (style LibraryPanel).
  - Détail complet : [CHANGELOG.md § 0.7.0](CHANGELOG.md).

- 🟢 **0.6.0 — cycle "fidélité basket"** (2026-05-09) :
  - Orientation des joueurs calculée auto (stance/ballon/homme/écran) + override manuel clampé. Module [`orientation.ts`](src/lib/logic/orientation.ts).
  - Anti-téléportation des attaquants : interpolation avec contournement d'obstacles + warning diagnostic si saut > 4 m.
  - Rim protection sur drive (tag and recover du big) : le pivot step-up sur la trajectoire au lieu de rester sur le post adverse.
  - Vue debug aide : flèches défenseur → cible d'aide avec %.
  - Refactor [`physics.ts`](src/lib/data/physics.ts) : toutes les constantes physiques centralisées (échelle, vitesses par poste, seuils de contact, boosts), avec sémantique en mètres réels documentée dans [docs/physics.md](docs/physics.md).
  - 8 toggles fine dans INDICATEURS AUTO (zone tracké, passe contestée, passe bloquée, écran non-porteur, déf. en retard, closeout actif, strong-side denial, poseur forcé).
  - Bugs basket : top-lock côté ballon (avant : ballon ignoré), paint helper pondéré par proximité, filtre d'intention sur les écrans, `isShortCorner` (logique mathématiquement impossible).
  - 73 nouveaux tests (111 → 188), 3 nouvelles docs ([GAME-ENGINE](docs/GAME-ENGINE.md), [physics](docs/physics.md), [orientation-anti-teleport](docs/orientation-anti-teleport.md)).
  - Détail complet : [CHANGELOG.md § 0.6.0](CHANGELOG.md).
- 🟢 **Raccourcis clavier** — [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md)
- 🟢 **Tests unitaires Vitest** — 84 tests sur engine / screens / metrics / help / trap / manDefense / geometry, [docs/testing.md](docs/testing.md)
- 🟢 **Closeout dynamique v1** — bump de vitesse ×1.4 + flag `closingOut` + anneau orange sur le défenseur du nouveau porteur. Cf. [docs/logique-defensive.md § Closeout dynamique](docs/logique-defensive.md#closeout-dynamique)
- 🟢 **Menu contextuel attaquant** — clic-droit sur un attaquant : marquer porteur, forcer comme poseur d'écran (override `detectScreen`), effacer ses annotations. Cadenas violet sur le joueur quand forcé.
- 🟢 **Strong-side denial automatique** — sans trigger, un défenseur strong-side proche du ballon glisse vers la ligne de passe (denial passif), intensité proportionnelle à la proximité. Cf. [docs/logique-defensive.md § Strong-side denial](docs/logique-defensive.md#strong-side-denial-automatique)
- 🟢 **Trap en corner v1** — toggle `triggers.trap` ; quand le porteur entre dans un coin fond, le défenseur le plus proche vient verrouiller le côté opposé pour fermer la cage.
- 🟢 **Stunt and recover v1** — nouvelle `OffBallStance: 'stunt'` (fake d'aide vers le ballon, blend 0.4 entre behind et fronting). Le "recover" est naturel : la stance par défaut est récupérée à l'étape suivante.
- 🟢 **Staggered screens v1** — `pickBlockingObstacle` choisit l'obstacle de plus profonde pénétration plutôt que le premier de la liste. Évitement plus fidèle quand plusieurs poseurs s'enchaînent. Limite : pas de double courbe.
- 🟢 **Inversion HOOP v2** — v1 (man) + zone defense directionnelle : `mirrorZoneLayout` miroite polygones/homePos autour de y=540. Engine + CourtView + StepThumbnail adaptent le rendu et le calcul.
- 🟢 **Numérotation des étapes v2** — badges 1, 2, 3… au pied du joueur initiateur sur les vignettes PDF (v1) ET dans CourtView à l'édition via toggle `state.showActionOrder` (v2). Composant partagé [`ActionOrderBadges`](src/components/ActionOrderBadges.tsx).
- 🟢 **Trajectoire du ballon entre étapes** — pendant playback/scrub, le ballon suit une parabole quand le porteur change (passe entrante). Hauteur de l'arc proportionnelle à la distance. Visuel renforcé en l'air (ombre projetée + contour blanc). Logique pure `geometry.computeBallFrame`.
- 🟢 **Mode fantôme (ghosting)** — toggle `state.showGhosts` qui affiche les positions de l'étape N-1 en cercles pointillés transparents pendant l'édition de l'étape N.
- 🟢 **Undo / Redo** — `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y`. Pile capée à 50 entrées via `setStateWithHistory` qui wrap toutes les mutations utilisateur.
- 🟢 **Bibliothèque en modal** — bouton compact `📚 Bibliothèque (N systèmes)` ouvre une modal centrée avec descriptions complètes, fermeture par `Échap` / clic extérieur / `×`. Cf. [`TemplateLibraryModal.tsx`](src/components/TemplateLibraryModal.tsx).
- 🟢 **Outils dans menus contextuels** — barre compacte `[déplacer / passe / dribble / course / écran]` en haut de chaque menu contextuel (attaquant ou défenseur). Évite l'aller-retour vers le panneau gauche pour changer d'outil.
- 🟢 **Suppression chirurgicale d'annotation** — sur l'étape active dans le panneau Attaque, liste des annotations avec un `×` rouge à droite de chacune. Combiné avec `Suppr` (dernière), `Ctrl+Z` (undo global), et clic-droit attaquant → "effacer ses annotations" (toutes pour ce joueur).
- 🟢 **UI tightening** — réductions padding/font dans Panel, Section, MetricsBar, header pour gagner ~30px verticaux sur les laptops courts. Visualisation ouverte par défaut côté défense.
- 🟢 **Logique défensive v2 — 5 chantiers** : ring denial cyan dédié · over-closeout (anneau rouge + ⚠) · trap sideline (4 zones au lieu de 2) · staggered super-cluster · zone defense directionnelle.

---

## 1. Logique basket (simulation)

Le moteur est solide sur le placement statique. Les chantiers ci-dessous visent le réalisme **dynamique** (urgence, transitions, séquences).

### 🟢 Closeout dynamique (v1)
Implémenté : quand `ballCarrier` change entre étape N-1 et N, le défenseur du nouveau porteur reçoit `maxSpeed × 1.4` sur la transition + flag `closingOut: true`. Anneau orange visible dans `Player`. Détails : [docs/logique-defensive.md](docs/logique-defensive.md#closeout-dynamique).

🟢 **v2 (over-closeout)** : `overClosed` sur `ComputedDefender` quand closeout ET le nouveau porteur a drive vers le panier (delta distance > 25, dans les 250px du panier). Anneau **rouge** `#DC2626` au lieu de l'orange + petit ⚠ à côté du joueur. Tests : 2 cas (avec/sans drive).

🟢 **v3 (tunable)** : `state.closeoutBoost` (default 1.4, range 1–2 step 0.1). Slider "closeout ×" dans le panneau défense → Paramètres globaux. Permet de désactiver le boost (×1.0) ou de le pousser à fond (×2.0).

### 🟢 Strong-side denial (v1 — automatique)
Implémenté dans `help.ts` : quand pas de trigger actif + défenseur strong-side + attaquant à <250px du ballon + `priority !== 'paint'`, glissement vers la ligne de passe avec intensité proportionnelle à la proximité (`denyFactor` jusqu'à 0.45). Détails : [docs/logique-defensive.md § Strong-side denial automatique](docs/logique-defensive.md#strong-side-denial-automatique).

🟢 **v2 (ring dédié)** : `HelpResult.denying` propagé jusqu'à `ComputedDefender.denying`. Player affiche un ring **cyan pointillé** (`#0EA5A8`, dasharray `4 3`) quand `denying`, à la place du ring violet plein "help".

🟢 **v3 (tunable)** : `state.denyAggressiveness` (default 0.45, range 0–1 step 0.05). Slider "denial agr." dans le panneau défense → Paramètres globaux. 0 désactive complètement le strong-side denial automatique ; 0.7+ donne un comportement très agressif (proche du full denial assumé).

### 🟢 Staggered screens (v3)
v1 : `pickBlockingObstacle` (geometry.ts) sélectionne l'obstacle de plus profonde pénétration dans le segment.
v2 : `pickBlockingCluster` fusionne tous les obstacles bloquants en super-cluster (centroid + rayon couvrant) → courbe simple autour de l'enveloppe.
**v3** : `pickStaggeredPair` détecte deux écrans sur des **côtés opposés** du segment direct (cas en quinconce). Si paire détectée → `curveAroundStaggeredPair` calcule une **cubic Bezier** avec deux points de contrôle (un par obstacle, poussé du côté opposé) → vraie courbe en S qui weave entre les deux écrans. Sinon (un seul ou tous du même côté) → fallback super-cluster v2. CourtView priorise le weave si applicable.

### 🟢 Stunt and recover (v1)
Implémenté : nouvelle `OffBallStance: 'stunt'` avec blend 0.4 dans `offBallStanceTarget`. Position intermédiaire entre behind et fronting, biaisée vers le ballon — le "recover" est naturel via le retour à `'sag'` à l'étape suivante.

### 🟢 Trap en corner / sideline (v3)
Implémenté dans `lib/logic/trap.ts` (polygones, helper picker, position cible) + trigger `state.triggers.trap` + override appliqué dans `engine.computeDefenseTargets`.
- **v2** : 4 zones au lieu de 2 — coins baseline (gauche/droite, y < 200) + sidelines mi-terrain (gauche/droite, y ∈ [200, 460]).
- **v3 (2026-05-12)** : coexistence trap + écran porteur. Le trap s'applique même avec un écran, sauf `'blitz'` (déjà un trap PnR) et `'switch'` (matchups swappés). `pickTrapHelper` exclut le `screenerDef`. 7 tests.

### 🟢 Inversion HOOP (v3, man + zone + visuel)
v1 : `state.attackingDirection: 'up' | 'down'` + threading `hoop?: Point` dans manDefense / help / screens / triggers / metrics / trap / geometry.
v2 : zone defense directionnelle (`computeZoneTargets` accepte `hoop`, `mirrorZoneLayout(layout)` miroite polygones et homePos autour de y=540).
**v3 — distinction visuelle des paniers** : en mode fullCourt, anneau orange pointillé (`#F97316`) + label "🎯 visé" autour du panier ciblé par l'attaque, et petit cercle bleu sobre (`#3b82f6`) + "🛡 protégé" autour du panier défendu. Suit `state.attackingDirection`. Pas d'effet en demi-terrain (le panier est toujours en haut). Implémenté dans `CourtBackground`, propagé depuis `CourtView` et `StepThumbnail`.

### Concepts défensifs basket à compléter

Audit moteur défensif (mai 2026) → ~70 % des concepts élémentaires couverts.
Restent **10 trous métier** à instruire, par ordre de valeur basket.

> ⚠️ Item séparé hors de cette liste : **box-out / rebond après tir** —
> demi-jeu absent du moteur. Tracé dans § 4 "Dette technique" comme chantier
> autonome (changement de scope : ajoute le rebond comme événement, pas
> seulement le placement défensif).

#### 🔴 Critiques

##### 🟢 Mismatch tracking après switch (livré 2026-05-12)
**Quoi.** Détection automatique des mismatches créés par un switch porteur
(D5 sur O1 = severity 4, etc.) + **scram switch** correctif (3ᵉ échange
défensif qui rétablit les matchups au moins partiellement).

**Pourquoi basket.** Un mismatch laissé = post-up garanti ou drive easy. En
match c'est la première chose qu'on attaque ; en défense c'est le premier
réflexe à corriger.

**Livré** :
- Module `defense/mismatchTracking.ts` : `defenderRank` / `attackerRank` /
  `mismatchSeverity` / `applyScramSwitch` (algo basket-correct : tie-break
  côté porteur, métrique d'amélioration sur le pire mismatch pas la somme).
- Câblage dans `defense/context.ts` après `applySwitch` natif.
- Propagation `mismatchSeverity` + `scrammedThisStep` sur `ComputedDefender`.
- Badge visuel sous le sprite défenseur (orange/rouge/bleu SCRAM).
- Toggle + slider de seuil dans `DefensePanel` (visible seulement avec
  rule `switch` ou `peel-switch`).
- Diagnostic coach enrichi (4 niveaux : good/critical/warning/info selon
  severity).
- 17 tests (12 unitaires + 5 intégration). **619 tests verts**.

##### 🟢 Reject screen detection (V1 livré 2026-05-12)
**Quoi.** Détecte le porteur qui refuse l'écran (jab + drive opposé)
quand la défense l'a anticipé.

**Livré V1 (diagnostic-only)** :
- Helper pur `screens/detectRejectedScreen.ts` : retourne `RejectedScreen`
  avec IDs et métriques (`prevDistance`, `curDistance`, `awayness`).
- Règle coach `coachDiagnostics/rules/rejectedScreen.ts` : 'warning' si
  sharp (dot ≤ -0.7), 'info' si marge.
- 9 tests unitaires. **633 tests verts**.

🟢 **V2 livré (2026-05-12)** : `state.unwindRejectedScreens` (opt-in).
Quand un reject SHARP (awayness ≤ -0.7) est détecté, l'écran est forcé
à `null` dans le `DefenseFrameContext` → la défense retombe sur la
couverture homme-à-homme pure. 4 tests intégration. **710 tests**.

##### 🟢 Hard hedge vs soft hedge (livré 2026-05-12)
**Quoi.** Sépare l'axe quality (côté offense) de l'axe aggression (côté
défense). Slider `state.hedgeAggression` (0..100, default 50) qui module
la sortie de D5 sur le porteur en hedge.

**Livré** :
- Argument `hedgeAggression` ajouté à `applyScreenAdjustment` (passé
  depuis `baseTargets.ts` via `state.hedgeAggression ?? 50`).
- Bloc `hedge && isScreenerDef` refondu : `aggressiveAdvance = 25 + 35 *
  hedgeAgg` (au lieu de `35 * q`), blendFactor = `q × hedgeAgg`.
- Indépendance des axes : q=0 (ghost) reste ghost même en hard hedge.
- Slider UI dans `DefensePanel`, visible seulement quand rule=hedge.
- 5 tests dédiés (soft, hard, monotone, independence, default). **624 tests**.

##### 🟢 Snake dribble (V1 livré 2026-05-12)
**Quoi.** Détecte le V sur 3 steps : porteur engagé → retraite → ré-engagé
sur le même poseur.

**Livré V1 (diagnostic-only)** :
- Helper pur `screens/detectSnakeDribble.ts` : retourne `SnakeDribble` avec
  les 3 distances (entry/peak/return).
- Règle coach `coachDiagnostics/rules/snakeDribble.ts` : 'warning' si V
  marqué (peak > 1.5 × entry), 'info' sinon.
- Critère segment-par-segment (pas total) : un snake parfait revient pile
  au point d'engagement, donc total ≈ 0.
- 8 tests unitaires. **641 tests verts**.

🟢 **V2 livré (2026-05-12)** : `state.snakeKeepCoverage` (opt-in). Quand
un snake est détecté au step N (retour), `screenQuality` effective est
forcée à **90 minimum** dans `baseTargets`. La 2ᵉ utilisation est traitée
comme un lockdown (D1 plaqué, D5 hedge fort) au lieu d'un re-arm.
4 tests intégration. **714 tests**.

#### 🟠 Moyens — patterns courants non couverts

##### 🟢 Empty side PnR (V1 livré 2026-05-12)
Helper pur `isEmptySidePnR` + règle coach. 'critical' si ice sur empty
(drive 1c0), 'good' si under/weak. 5 tests. **650 tests verts**.

##### 🟢 Dig / double au post (V1 livré 2026-05-12)
Nouvelle couche 4.5 du pipeline défensif (`postCoverageLayer`). Setting
`state.postCoverage: 'none' | 'dig' | 'double'` (opt-in). Quand trigger
post actif + couverture ≠ none, un défenseur low man (≠ carrierDef, le
plus proche du pivot, non occupé) fait 30 % du chemin ('dig') ou 50 %
('double') vers le pivot. 4 tests. **678 tests verts**.

##### 🟢 Defensive 3 seconds (V1 livré 2026-05-12)
Diagnostic coach quand un défenseur stationne 3 steps consécutifs dans
la raquette sans marquer (≤ 50 px d'un attaquant). Pas de pénalité simulée.
Règle `defensiveThreeSecondsRule` dans le registry. 4 tests. **645 tests**.

##### 🟢 Politique de switch granulaire (V1 livré 2026-05-12)
4 policies au niveau team : `'all'` (default), `'1-3'`, `'1-4'`, `'none'`.
Filtre additionnel par-dessus `screenRule = 'switch'`/'peel-switch'.
Helper `switchAllowed` + câblage dans `defense/context.ts` + UI dans
`DefensePanel`. 10 tests. **660 tests verts**.

##### 🟢 Top-lock off-ball avec timing (V1 livré 2026-05-12)
Helper `cuttersInScreenChain` + câblage dans `offBallScreenLayer`. Bascule
auto `top-lock → chase` pour les cutters avec ≥ 2 écrans dans 3 steps.
10 tests (7 unit + 3 intégration). **670 tests verts**.

##### 🟢 Bumping the cutter — réaction automatique (V1 livré 2026-05-12)
Nouvelle couche 5.5 du pipeline défensif (`cutterBumpLayer`). Détecte les
cuts via `detectCuts`, trouve le défenseur le plus proche de la
trajectoire (≤ 40px, pas le cutterDef, pas en aide active), applique un
offset de 12px vers le cutter. Setting `state.autoBumpCutters` (opt-in).
4 tests. **674 tests verts**.

---

## 2. Interface (UX/UI)

Objectif : réduire la friction lors de la création de systèmes complexes.

### Interactivité & raccourcis

#### 🟢 Saisie numérique sur les sliders (livré 2026-05-12)
`<input type="number">` ajouté à droite de chaque `<Slider>` dans
[`src/components/ui.tsx`](src/components/ui.tsx). Buffer local pendant la
frappe, clamp + snap au blur/Enter, Escape annule. Tous les sliders du
moteur en bénéficient sans modification côté caller. 678 tests verts.

#### 🟢 Raccourcis clavier
Table unique `resolveShortcut` dans `hooks/useKeyboardShortcuts.ts` (U03,
2026-09-22) : une touche = une action selon la vue, le mode (édition /
lecteur / présentation) et le focus. Référence complète, y compris les
équivalents tactiles : [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md).

#### 🟢 Snap-to-grid (livré 2026-05-12)
Module pur `lib/logic/snapToGrid.ts` + overlay visuel
`court/SnapGuideOverlay.tsx`. Activé pendant le drag d'un joueur avec
**Ctrl** (PC) ou **Cmd** (Mac), ou au doigt via le bouton **Aimanter** (U04). 9 cibles : médiane, 4 bords raquette,
LF, arc 3pts, 2 blocs bas. Seuil 8 px. Mode fullCourt adapté via
`HOOP_OPPOSITE`. 11 tests. **699 tests verts**.

### Visualisation & feedback

#### 🟢 Numérotation des étapes (v2 — playbook PDF + édition)
v1 : composant `ActionOrderBadges` rendu dans les vignettes `StepThumbnail` du playbook PDF.
**v2** : extrait dans [`ActionOrderBadges.tsx`](src/components/ActionOrderBadges.tsx) (réutilisable). Toggle `state.showActionOrder` dans le panneau défense (Visualisation). Quand actif et hors lecture/scrub, les badges s'affichent aussi dans `CourtView` à l'édition. Le coach voit l'ordre des actions sur l'étape active sans switcher entre les étapes.

#### 🟢 Mode fantôme (ghosting) (v1)
Implémenté : toggle `state.showGhosts`. Quand actif (et `activeStep > 0` et hors lecture/scrub), `GhostLayer` dans `CourtView` affiche les positions de l'étape N-1 en cercles pointillés (orange pour attaquants, bleu pour défenseurs) à 35% d'opacité, sans label. Visualise le vecteur de déplacement entre les deux étapes.

#### 🟢 Graphique de métriques (livré 2026-05-12)
Composant `MetricsChart` sous la Timeline. 4 métriques sélectionnables
(maxGap / paintCoverage / lateCount / helpFactorTotal). SVG fait main,
marqueur rouge sur step actif, clic = navigation. État replié par défaut
(bouton "📈 graphique métrique"). Mémoizé sur `[state, metric]`.
`computeMetrics` × `effectiveDefensePositions` cachée via WeakMap.

### Édition avancée

#### 🟢 Undo / Redo (v1)
Implémenté dans `useAppState` : pile `historyRef` (past/future) cap à 50, wrapper `setStateWithHistory` qui pousse l'état précédent à chaque mutation utilisateur. `undo` / `redo` exposés. Raccourcis `Ctrl/Cmd+Z` (undo) et `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` (redo) câblés dans `useKeyboardShortcuts`. U03 (2026-09-22) : boutons Annuler / Rétablir visibles, navigation d'étapes hors historique.

🟢 **v2 livré** : coalescing pendant le drag via `commitCoalescedHistory` + `dragHistoryAnchorRef` dans [`appStateHistory.ts`](src/lib/logic/appStateHistory.ts). Un drag continu = **1 seule entrée** dans la pile undo (snapshot pris au `beginPlayerDrag`, push différé au `commitPlayerDrag`). Réutilisé par la sélection multiple (#4) pour qu'un drag groupé soit aussi une seule entrée.

#### 🟢 Sélection multiple (V1 livré 2026-05-12)
State éphémère `selectedDefenders: Set<DefenderId>` dans CourtView.
Shift+clic = toggle, Shift+drag dans le vide = marquee, Esc = clear (au doigt : bouton **Sélection multiple** / **Désélectionner**, U04),
clic sur défenseur sélectionné = drag groupé (delta appliqué à tous,
1 entrée undo via le pattern beginPlayerDrag/DuringDrag/commitPlayerDrag
existant). Halo cyan + mini panneau info. 699 tests verts. **V2** : édition
groupée des `DefenderRule` (helpPct, priority…), pas couverte en V1.

**Découpage suggéré** : (a) sélection visible + marquee, (b) drag groupé, (c) édition groupée des règles. 3 commits.

#### 🟢 Mode présentation (v1)
Implémenté : bouton **"🎬 plein écran"** dans le header. Toggle local `presentMode`. Quand activé : panneaux Attack et Defense masqués (rendu conditionnel `{!presentMode && <Panel>}`), `layout-grid` passe en 1-colonne (`grid-template-columns: 1fr`), le terrain occupe toute la largeur. Sortie via le même bouton (devient "✕ quitter") ou touche `Échap`.

🟢 **v2 livré (2026-05-22)** : le toggle "plein écran" du menu déclenche
aussi `document.documentElement.requestFullscreen()` pour cacher la barre
d'onglets (utile sur tablette). Helpers `requestNativeFullscreen` /
`exitNativeFullscreen` mutualisés avec le mode match plein écran. Sync
`fullscreenchange` : quitter le plein écran natif (Échap navigateur, F11)
sort aussi du mode présentation.

---

## 3. Produit (export & partage)

### 🟢 Export vidéo / GIF — livré 2026-05-23
**Quoi.** Capturer l'animation fluide du système (lecture complète) en GIF ou vidéo MP4 téléchargeable. Permet de partager sur Slack/WhatsApp/X sans demander à quelqu'un d'ouvrir l'app.

**Implémentation.** Deux pistes complémentaires :

- **GIF** via [`gif.js`](https://github.com/jnordberg/gif.js) (~20kB gzipped). On lit le SVG frame par frame, on le convertit en canvas (via serialize → `Image` → `drawImage`), on push chaque frame dans `gif.js`. Avantage : portable, fonctionne partout. Inconvénient : taille de fichier lourde (3-10 MB pour 5s d'anim), qualité moyenne, encodage long.
- **MP4 / WebM** via `MediaRecorder` sur un canvas. On render le SVG dans un canvas via `OffscreenCanvas` à 30fps, on capture le stream avec `canvas.captureStream()`. Avantage : taille petite (~500kB pour 5s), encodage rapide. Inconvénient : support Safari capricieux historiquement (OK depuis 2023 mais à tester).

Bouton "🎥 exporter GIF / MP4" à côté du bouton playbook PDF actuel. Choix du format dans une modal.

**Effort** ~3h pour une v1 GIF, ~4h pour MP4. Le SVG → canvas conversion est le point délicat (foreignObject ou serialization XML).

**Risque** 🟡 · **Valeur** très haut (partage).

**Tradeoff.** `gif.js` ajoute du poids au bundle. Alternative : faire tourner l'encodage sur un Web Worker. Pour MP4 c'est natif, zéro dépendance, mais le support est plus capricieux. **Pragmatique** : commencer par GIF, ajouter MP4 plus tard en option utilisateur ("format : GIF / MP4").

### 🟢 Templates utilisateurs — presets défensifs (livré 2026-05-12)
Defense presets perso sauvegardables/rechargeables. Étend `UserLibrary`
existante avec `defensePresets?: UserDefensePreset[]`. Snapshot inclut
les 16 champs défensifs (rules + screen + offBall + triggers + B1-B10).
UI dédiée dans `DefensePanel` (vert distinct des presets globaux bleus).
10 tests unitaires. **688 tests verts**.

**Côté offensif** : déjà couvert par `SavedSystem` + `useLibrary` (la
bibliothèque utilisateur). Format différent (snapshot complet d'un
système avec steps + défense), mais le besoin "sauvegarder son
travail" est rempli.

### 🟢 Annotations textuelles libres — livré 2026-05-23
**Quoi.** Pouvoir déposer une note texte n'importe où sur le terrain ("trap si le 5 monte", "force baseline", "skip pass option"). Distincte des flèches d'action — c'est du commentaire libre, pour expliquer l'intention.

**Implémentation.** Étendre `AnnotationType` avec `'text'` dans `lib/types/index.ts`. Nouveau champ optionnel `text?: string` dans `Annotation`. Le `from` représente l'ancrage (point sur le terrain), `to` est ignoré. Nouvel outil `T` (Text) à côté de `M / P / D / R / E` dans `OffensePanel`. Au clic sur le terrain en mode texte, prompt inline : un `<foreignObject>` SVG affiche un `<input>` qui devient un `<text>` au blur. Rendu dans `Annotations.tsx` : un `<text>` avec fond blanc semi-opaque (rectangle de fond + label centré). Edit/delete au clic sur le texte (réouvre l'input).

**Effort** ~2h · **Risque** 🟡 · **Valeur** haut.

**Tradeoffs.** `<foreignObject>` a des bugs historiques sur Safari (rendu, scroll, focus). **Plan B** : édition via une modal/popup en HTML standard au lieu d'inline. Moins fluide mais plus robuste. Si on prend le plan B, on peut remplacer l'input inline par un `prompt()` ou une vraie modal. Décider au moment de l'implémentation après un essai foreignObject sur Safari.

**Découpage suggéré** : (a) ajout du type + outil + rendu, (b) édition inline ou modal, (c) édition/suppression d'une annotation existante.

---

## Synthèse priorisation (chantiers ⚪ restants)

### Chantiers de l'Audit (Juin 2026)

> ⚠️ Tableau historique. La priorisation à jour est dans
> [§ Audit expert basket 2026-06-11](#-audit-expert-basket--2026-06-11-consolidation)
> en tête de fichier.

| # | Chantier | Statut | Effort | Risque | Valeur |
|---|---|---|---|---|---|
| ~~**9**~~ | ~~**Roster Nommé & Numéros de maillots**~~ | 🟢 Livré | — | — | — |
| ~~**10**~~ | ~~**Compatibilité Tactile & Ergonomie (Zoom/Pan, hit-boxes, appui long)**~~ | 🟢 Livré | — | — | — |
| ~~**11**~~ | ~~**Partage Collaboratif Simplifié (Base64 URL)**~~ | 🟢 Livré | — | — | — |
| **12** | **Simulation Réaliste V2 (Fautes, lancers-francs, fatigue)** | ⚪ À faire — repris par l'audit 2026-06-11 (items 2+4) | 1.5j | 🔴 Élevé | 🔴 Critique (réévalué) |
| **13** | **Éditeur de Scénario Graphique Nodal** | 🟡 V1 + arbres multi-niveaux livrés (reste : receveur dynamique) | 3j | 🔴 Élevé | 🟡 Moyen |

### UX / Produit — Historique

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~5~~ | ~~Mode présentation v2 (fullscreen navigateur natif)~~ — 🟢 livré 2026-05-22 | — | — | — |
| ~~6~~ | ~~Export GIF/vidéo~~ — 🟢 livré 2026-05-23 | — | — | — |
| ~~8~~ | ~~Annotations texte libres~~ — 🟢 livré 2026-05-23 | — | — | — |

✅ **Livré 2026-05-12** : 1 (saisie num sliders), 2 (snap-to-grid),
3 (graphique métriques), 4 (sélection multiple V1), 7 (templates user).

### Logique basket — concepts défensifs (audit mai 2026) — ✅ TOUS LIVRÉS (2026-05-12)

Audit du moteur défensif → 10 concepts manquants identifiés et tous
livrés en une session. **+74 nouveaux tests** (B1-B10 + V2/v3).

| # | Chantier | Version | Tests |
|---|---|---|---:|
| ~~B1~~ | Mismatch tracking + scram switch | V1 | 17 |
| ~~B2~~ | Reject screen detection | V1 diag + V2 unwind | 9+4 |
| ~~B3~~ | Hard / soft hedge | V1 | 5 |
| ~~B4~~ | Snake dribble detection | V1 diag + V2 keep coverage | 8+4 |
| ~~B5~~ | Empty side PnR | V1 | 5 |
| ~~B6~~ | Dig / double au post | V1 | 4 |
| ~~B7~~ | Defensive 3 sec (FIBA) | V1 | 4 |
| ~~B8~~ | Switch policy granulaire | V1 | 10 |
| ~~B9~~ | Top-lock off-ball avec timing | V1 | 10 |
| ~~B10~~ | Bumping cutters automatique | V1 | 4 |
| ~~Trap v3~~ | Coexistence trap + écran | v3 | 7 |
| ~~Undo/Redo v2~~ | Coalescing drag | (déjà fait) | — |

**Total UX/Produit restant** : ~5-7h pour les 3 chantiers ⚪.
**Total logique basket restant** : 0 (tous livrés).

Détail complet dans [docs/session-2026-05-12.md](docs/session-2026-05-12.md).

**Ordre conseillé UX restant** : 5 (mode présentation v2, <30min, quick
win tablette) → 8 (annotations texte, valeur haute) → 6 (export vidéo,
le plus impactant pour le partage).

**Limites v3 documentées sur les chantiers déjà v2** :
- ✅ **Trap v3** livré : coexistence trap + écran (cf. section "Trap v3" plus haut).
- ✅ **Staggered v3** livré : double courbe Bezier (`pickStaggeredPair` + `curveAroundStaggeredPair`).
- ✅ **Inversion HOOP v3** livré : rendu visuel "🎯 visé" / "🛡 protégé".
- ✅ **Closeout / Denial** : tunables globaux + override par règle individuelle.
- ✅ **Undo/Redo v2** : coalescing drag via `commitCoalescedHistory`.
- ✅ **B2 V2** : unwind reject (cf. section B2 plus haut).
- ✅ **B4 V2** : snake keep coverage (cf. section B4 plus haut).

---

## 4. Dette technique & refactos restants

La passe de refacto de mai 2026 a découpé `engine.ts` (982 → 117 lignes) et `CourtView.tsx` (1222 → 811 lignes), centralisé les constantes physiques, et regroupé les overlays.

**Cycle modularité (mai 2026, post-refacto)** — 6 gros fichiers découpés
sans changement de comportement. Cf. [docs/refactoring-history.md](docs/refactoring-history.md)
pour les patterns réutilisables (barrel + dossier, transforms purs + hook
mince, hooks + sous-composants, registry de règles).

### 🟢 A4 — `scriptedGenerators.ts` (1502 → 92 LOC) — barrel + tier1/2/3

57 générateurs d'actions FIBA répartis par tier dans `src/lib/logic/scriptedGenerators/` :
- `helpers.ts` — géométrie commune + type `Generator`
- `tier1.ts` — 19 actions de base (PnR, cuts, screens, drive, shoot, iso)
- `tier2.ts` — 30 variantes (cuts spécialisés, off-ball, PnR variants, combos)
- `tier3.ts` — 9 sets d'entrée (horns, floppy, pistol, ucla, diamond…)
- `scriptedGenerators.ts` (index) — mapping action FIBA → générateur

Pour ajouter une action FIBA : écrire `genFooBar` dans le bon tier + une
ligne `'foo-bar': t<N>.genFooBar` dans le mapping.

### 🟢 A5 — `useAppState.ts` (967 → 510 LOC) — transforms purs

Hook réduit à **persistance + history + câblage**. La logique des
mutations vit dans 8 namespaces de fonctions pures `(state, ...args) =>
state` dans `src/lib/state/transforms/` :
- `stepTransforms` · `annotationTransforms` · `defenseTransforms` · `attackerTransforms`
- `zoneTransforms` · `scenarioTransforms` · `defensiveScriptedTransforms` · `coreTransforms`

61 tests unitaires ajoutés sur ces transforms (sans React, sans
localStorage). Total : **602 tests verts**.

### 🟢 A6 — Tests composants

Couvert par les 61 nouveaux tests sur les transforms `useAppState` (cf.
A5) + tests existants sur `polyline`, `dribbleWave`, `frameResolver`,
`appStateHistory`, etc. Les sous-composants extraits de CourtView /
ContextMenu sont testables, à compléter si besoin.

### 🟢 A7 — `CourtView.tsx` (902 → 446 LOC) — hooks + sous-composants

- `hooks/useCourtFrame.ts` — calcule staticFrame / scrubFrame / playFrame + threats
- `hooks/useCourtPointerHandlers.ts` — drag joueurs (rAF) + tracé d'annotations
- `components/court/CourtPlayersLayer.tsx` — sprites + screener gaze override
- `components/court/CourtMenus.tsx` — context menus (def/att) + zone region

### 🟢 A8 — `ContextMenu.tsx` (897 → 22 LOC) — dispatch + 5 modules

- `popupHooks.ts` · `ToolBar.tsx` · `sharedRows.tsx` · `DefenderMenu.tsx` · `AttackerMenu.tsx`

Ajouter une row à un menu = éditer le fichier dédié, plus de scroll de 900 l.

### 🟢 A9 — `screens.ts` (822 → barrel + 5 modules)

Épicentre des bugs récurrents, isolé en domaines clairs :
- `helpers.ts` · `detectCarrierScreen.ts` · `carrierScreenAdjust.ts`
- `detectOffBallScreens.ts` · `offBallScreenAdjust.ts`

Ajouter une rule défensive (over/under/hedge/…) = éditer 1 fichier ciblé.

### 🟢 A10 — `coachDiagnostics.ts` (834 → barrel + 13 rules) — registry pattern

Pattern de registry : chaque diagnostic vit dans `rules/<name>.ts` sous
forme `(ctx) => CoachDiagnostic[]`. Pour ajouter un diagnostic basket :
créer 1 fichier dans `rules/` + 1 entrée dans `REGISTRY`. Plus aucune
lecture des 833 autres lignes.

### 🟢 A11 V1 — Box-out / rebond après tir — livré 2026-05-18 (mode édition)

V1 livré 2026-05-18 en 3 phases + 1 docs. **3 commits + 25 tests** :

**Phase 1** (commit `b797c1d`, 7 tests) :
- Types `Step.shotOutcome?: 'made' | 'missed'` + `Step.shotPos?: Point`.
- Helper pur `shotTracking.ts` : `getShotPosForStep`, `hasShotOutcome`,
  `isMissedShot`.
- UI dans StepsPanel : bloc "TIR (A11)" avec 2 boutons toggles
  ✅ tir réussi / ❌ tir manqué.

**Phase 2** (commit `76bb002`, 13 tests) :
- Module pur `shotReboundSetup.ts` :
  - `buildShotReboundSetup(state, sourceStepIdx, { seed? })` construit
    les positions box-out défensives (constante `BOXOUT_OFFSET_PX = 18`
    identique à `gameLoop.computeBoxOutTargets`) + identifie le
    rebondeur via `computeRebound` de `match/rebound.ts` (réutilisé,
    déjà testé).
  - Rebond offensif → rebondeur poussé au cercle, devient ballCarrier.
  - Rebond défensif → rebondeur poussé au cercle, ballCarrier reste
    shooter (le moteur n'accepte qu'AttackerId).
  - `seededRng()` xorshift32 pour reproductibilité tests.
- Types `Step.rebounder?: AttackerId | DefenderId` + `Step.reboundType?:
  'offensive' | 'defensive' | 'team-out'` (informatifs).
- Transform `stepTransforms.addShotReboundStep(s, options?)` no-op si
  pas missed, sinon insère un step avec `defenseOverrides` (pattern F.2).
- UI : bouton "🏀 étape rebond auto (A11)" visible quand
  `shotOutcome === 'missed'`.

**Phase 3** (commit `3c05e02`, 5 tests) :
- Cohérence R1 résolue par audit : `ScriptedAction shoot` jamais
  converti en Step (consommé en mémoire par simulator/gameLoop/
  aiPossession). Note explicative ajoutée à `scriptedActionsCatalog.ts`
  pour clarifier les 2 mondes parallèles (coach édition vs mode IA).
- `boxOutCheckRule` étendu : détection robuste de la phase rebond via
  4 sources hiérarchisées (cur.reboundType → prev.shotOutcome →
  prev.context === 'free-throw' → label legacy).

**Coût réel** : ~3h (vs 5-8j estimé ROADMAP). Sous-estimation initiale
parce que beaucoup d'infra existait déjà (computeRebound, boxOutCheckRule,
pattern F.2, useAppState.patchStep).

**V2 livré 2026-05-18** (commits `dac7fb0` + ce commit, +12 tests
cumulés) :
- **`shotOutcome: 'blocked'`** : 3e outcome de tir = contre clean.
  Helper `blockedReboundResult` déterministe (défenseur le plus
  proche du shotPos, limite 110 px ~3 m). UI 3e bouton 🛑 contré (violet).
- **Reset shot clock 14s** sur rebond offensif : `addShotReboundStep`
  pose `Step.shotClockRemaining = 14` sur les rebonds off (règle FIBA/NBA,
  exploité par lateShotClockLayer F.5 si activé).
- **Outlet pass marker** : `Step.outletPassPending = true` posé
  automatiquement sur rebond défensif. Nouvelle règle coach
  `outletPassRule` émet un diag 'info' suggérant la passe outlet
  pour enclencher la transition adverse.

**V3 reportée** : couche `boxOutLayer` dynamique vs setter statique,
unification mode édition ↔ game loop, outlet pass setter auto qui
génère un step inbound après. Plan complet dans
[docs/a11-plan.md](docs/a11-plan.md).

⚪ Plan d'origine :

**Quoi.** Le moteur ne réagit pas au tir. Aucun box-out, aucun
positionnement de rebond, aucune transition possession. C'est un
**demi-jeu** du basket complètement absent.

**Pourquoi c'est dans dette technique (pas dans § 1 Logique basket).**
Parce que c'est un changement de **scope** du moteur, pas un raffinement
d'une couche existante : il faut ajouter un type d'événement (le tir
comme moment qui termine la séquence), une nouvelle phase de simulation
(box-out → rebond → outlet), et probablement un nouveau type de step
(`step.kind: 'play' | 'shot' | 'rebound'`).

**Plan haut niveau** :
- Annotation `shoot` existe → l'enrichir avec `shotOutcome: 'made' | 'missed' | 'blocked'`.
- Nouvelle couche défense `boxOutLayer` qui s'active sur step shooting :
  chaque défenseur fait un box-out sur son homme (offset vers le panier).
- Modèle de rebond simple : probabilité par zone + profil (bigs +30 %,
  guards -10 %), tirage déterministe.
- Outlet pass : si rebond défensif, possession bascule, nouveau step de
  transition.
- Estimation : **5-8 jours**, P2. C'est une feature majeure.

**Décision projet** : pas avant que les 10 items § 1 Concepts défensifs
soient instruits. Le moteur actuel sert très bien à enseigner la défense
de placement ; le rebond est une couche au-dessus.

### 🟢 Mode "Play IA — voir un match jouer tout seul" (B1-B5) — LIVRÉ 2026-05-15

L'infrastructure complète existe : game loop autonome 5 Hz, intent
persistant par joueur (porteur + 4 off-ball), transition multi-possessions
(rebond offensif 28 %), UI live synchronisée, calibration Monte-Carlo.

**Effort réel** : ~3j (vs 10-15j estimé init, sous-estimation initiale
des synergies avec le moteur existant).

**Récap des chantiers livrés** :

| # | Status | Commit | Description |
|---|---|---|---|
| ~~B1~~ | 🟢 | `edb43e6` | Game loop continu 5 Hz, intent porteur (drive/pass/shoot) |
| ~~B3a~~ | 🟢 | `bd2dccf` | Shot model enrichi (zone, contestation, position) |
| ~~B2~~ | 🟢 | `0da33a4` | Décideur off-ball (cut, drift, relocate) avec budget cuts |
| ~~B4~~ | 🟢 | `ac1bece` | UI live complète (CourtView + HUD synchronisés) |
| ~~B3b~~ | 🟢 | `40e5f0f` | Transition multi-possessions stub (off reb / new poss) |
| ~~B5~~ | 🟢 | `2e9ffee` | Calibration live vs Monte-Carlo (±0.15 PPP cible) |

**Stack du moteur de match autonome** :
- `src/lib/logic/match/gameLoop.ts` — tick pipeline + transitions
- `src/lib/logic/match/decisions/offBallMover.ts` — movers off-ball
- `src/lib/logic/match/calibration.ts` — headless runner + comparison
- `src/hooks/useMatchLoop.ts` — hook React 5 Hz avec start/pause/resume/stop
- `LiveMatchPanel` + `CalibrationPanel` dans `SimulationSection`

**Limites V1 conservées** :
- Pas d'écrans off-ball auto (V2 si besoin — design dans `offBallMover.ts`)
- Modélisation possession adverse absente (chaque nouvelle possession
  reste offensive pour notre équipe — stub assumé)
- Calibration manuelle pour l'instant (boucle de tuning auto = V2)

**Suite naturelle (hors Phase I)** : si Phase E.1 (box-out / rebond)
est un jour livrée, brancher B3b dessus pour avoir un vrai cycle de
possession adverse complet. Sinon V1 stub reste fonctionnel.

---

## 5. Audit transverse (2026-05-12) — chantiers restants par phase

Audit complet de l'état du moteur sur 5 dimensions (technique, logique
basket, trajectoires, vitesse réelle, notion du temps). Ce qui suit
ordonne les **chantiers identifiés mais non livrés**, par phases qui
respectent leurs dépendances logiques.

> 📌 La priorisation suit 3 principes :
> 1. **Quick wins avant features lourdes** — UI accessible avant
>    nouvelles features qui n'auraient pas de surface utilisateur.
> 2. **Foundations avant superstructures** — la notion du temps
>    (durée per step) débloque shot clock, end-of-clock defense, etc.
> 3. **Réalisme modéré avant changement de scope** — affiner le moteur
>    existant avant d'ajouter le rebond (= demi-jeu = +5-8 jours).

---

### Phase A — Quick wins UI accessible (~3-4h total)

Features livrées en code mais sans surface UI dédiée, ou UX simples
hautement valorisantes.

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~A.1~~ | ~~Visu nouvelles features défensives dans `DefensePanel`~~ — 🟢 livré 2026-05-12 | — | — | — |
| ~~A.2~~ | ~~Mode présentation v2 — fullscreen navigateur natif (`document.documentElement.requestFullscreen()`)~~ — 🟢 livré 2026-05-22 | — | — | — |
| ~~A.3~~ | ~~**Annotations texte libres**~~ : nouvelle entité `TextNote` (séparée d'`Annotation`), outil `note` + raccourci `T`, popup HTML d'édition au clic, suppression au `×`. Stocké dans `step.textNotes`, undo/persistance gratuits. | — | — | 🟢 livré 2026-05-23 |
| ~~A.4~~ | ~~V3 visu sur détections : badges/overlays~~ — 🟢 livré 2026-05-12 | — | — | — |

---

### Phase B — Notion du temps (foundation, ~1 jour)

Aujourd'hui : steps abstraits, durée uniforme 2 s, pas de shot clock.
Cette phase pose les fondations pour la suite (closeout réaliste, end-of-clock defense, etc.).

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~B.1~~ | ~~**Durée individuelle par step** : nouveau champ `step.duration?: number` (s, default `state.secondsPerStep`). Timeline + MultiTrack + Playbook recap utilisent `realStepToSeconds` cumulé.~~ | — | — | — | 🟢 livré 2026-05-17 (17 tests, 1262 verts) |
| ~~B.2~~ | ~~**Shot clock display** (24 s NBA / 14 s reset) : décrémente au fil des steps (durée cumulée). `shotClockAt`/`rawShotClockAt`/`isShotClockViolationAt` honorent les resets `step.shotClockRemaining`. Timeline câblée. Couleurs vert/jaune/rouge.~~ | — | — | — | 🟢 livré 2026-05-22 (8 tests) |
| ~~B.3~~ | ~~**End-of-clock defense awareness** : helper + règle coach 'warning' + badge SVG `🚫 NO FOUL` quand clockSeconds<5 ET fautes≥5 (équipe en bonus). Exclusif de F.4 sur l'axe defenseTeamFouls.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (7 tests, 1286 verts) |
| ~~B.4~~ | ~~**Synchronisation cross-actor** : nouveaux champs `Annotation.tStartAbs?` / `tEndAbs?` (secondes absolues depuis début transition) priment sur tStart/tEnd legacy. Helper `resolveAnnotationTiming`. Migration moteur (playbackTrajectory, pdfRecap, playerTracks). UI d'édition reportée en V2 (édition via JSON ou /loop futur).~~ | — | — | — | 🟢 V1 livré 2026-05-18 (10 tests, 1324 verts) |

---

### Phase C — Réalisme physique modéré (~1-2 semaines)

Affinement du moteur défensif existant. Pas de changement de scope —
juste plus de fidélité tactique.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~C.1~~ | ~~**Closeout footwork** : sprint+freinage via `closeoutEasing`~~ | — | — | — | 🟢 livré 2026-05-12 (7 tests, 721 verts) |
| ~~C.2~~ | ~~**Help-and-recover timing** : `helpStickiness` (1..3 steps) avec decay~~ | — | — | — | 🟢 livré 2026-05-13 (10 tests, 857 verts) |
| ~~C.3~~ | ~~**Hedge length** : `hedgeRecoveryDelay` (1..3 steps)~~ | — | — | — | 🟢 livré 2026-05-12 (8 tests, 732 verts) |
| ~~C.4~~ | ~~**Pre-rotation shift** : anticipation pré-écran (~10 px)~~ | — | — | — | 🟢 livré 2026-05-12 (10 tests, 746 verts) |
| ~~C.5~~ | ~~**Tag-then-switch dynamic** : `tagThenSwitchEnabled`~~ | — | — | — | 🟢 livré 2026-05-12 (4 tests, 736 verts) |
| ~~C.6~~ | ~~**Help angle** : mode `open-weighted` (distances)~~ | — | — | — | 🟢 livré 2026-05-12 (3 tests, 724 verts) |
| ~~C.7~~ | ~~**Read offensive action chains** : V1 diag/badge + V2 réaction défensive (re-screen tangentiel + flare-fade gazeLock)~~ | — | — | — | 🟢 V1 + V2 livrés 2026-05-13 (21 tests, 888 verts) |

#### 🟢 C.2 — Help-and-recover timing — livré

**Problème résolu.** Un défenseur aidait au step N (helpTriggered=true),
puis revenait instantanément sur son homme au step N+1. Maintenant le
recover est progressif, avec decay configurable en steps ou en ms.

**V1 livré 2026-05-13** (compteur step-based, 10 tests).
- Helper pur `defense/helpStepCounter.ts::consecutiveHelpSteps(state, stepIdx, defenderId)` (compte les steps consécutifs avec trigger d'aide plausible — drive/post/paint + helpPct>0 + stance sag).
- Setting opt-in `state.helpStickiness?: number` (range 1-3, default undefined = legacy).
- Couche d'intégration `defense/helpStickyLayer.ts` (couche 1.6, après baseTargets/rimProtection, avant pnrRotations). Skip si onScreen, pnrRole, switchedThisStep, scrammedThisStep. Decay : `blendFactor = 1 - consec / stickiness`.

**V2 livré 2026-05-17** (conversion temps réel, 8 tests, 1262 verts).
- Setting opt-in `state.helpStickinessMs?: number` (range 100-2500 ms). Prime sur V1 quand défini.
- Helper `cumulatedHelpMs(state, stepIdx, defenderId)` : somme `Step.duration × 1000` sur les steps comptés par `consecutiveHelpSteps`. Dépend de B.1 (step.duration) pour la granularité réelle, fallback `state.secondsPerStep` sinon.
- `helpStickyLayer` : si V2 actif, `blendFactor = 1 - cumMs / stickinessMs`. Plus fidèle basket (1200 ms ≈ standard NBA, indépendant du découpage en steps).
- UI : slider 0-2500 ms par pas de 100 ms dans `DefensePanel` (section *Couvertures avancées*) ; activation V2 → désactive V1 legacy automatiquement.

#### 🟢 C.7 — Read offensive action chains — livré (détail du plan ci-dessous)

**Problème actuel.** Une action complexe = enchaînement de plusieurs
écrans (flare → curl → fade, stagger sequential, re-screen, curl-into-cut)
est détectée step par step **sans continuité**. La défense ne "lit" pas
la séquence — elle réagit au 2ᵉ acte comme si le 1er n'avait jamais eu
lieu, donc se fait avoir par les mêmes patterns en boucle.

**V1 — Chain detection only (pas de modif comportement).**
- Helper pur `screens/detectScreenChain.ts` qui scanne N-2 / N-1 / N (lookback 3 frames) pour identifier 4 patterns :
  - **`re-screen`** : même poseur sur même cutter à 2 steps non consécutifs (déjà partiellement couvert par C.4 snake mais pour le porteur uniquement)
  - **`stagger-sequential`** : 2 poseurs différents successivement sur le même cutter (≤ 2 steps d'écart)
  - **`flare-then-fade`** : cutter écran-flare au step N-2/N-1, puis fade hors-ballon vers le coin au step N (delta y du cutter inversé)
  - **`curl-then-recut`** : cutter coupe (vers panier), ressort (loin du panier au step suivant), recoupe (vers panier au 3ᵉ)
- Retour `ScreenChain | null` avec `type`, `cutter: AttackerId`, `steps: [stepIdx, ...]`.
- Règles coach dédiées dans `coachDiagnostics/rules/screenChain.ts` (4 sous-règles, 1 par pattern).
- Badge SVG visuel par chaîne détectée (chaînon `🔗` sur le cutter, info-bulle au hover).

**V2 — La défense réagit.**
- Setting opt-in `state.readScreenChainsEnabled?: boolean`.
- Effet par pattern :
  - `re-screen` détecté → +20 quality effective sur le 2ᵉ acte
  - `stagger-sequential` → bascule `top-lock → chase` au 2ᵉ poseur (déjà fait par C.B9 cutterScreenChain — réutiliser ce câblage)
  - `flare-then-fade` → le défenseur du cutter passe en `gazeLock: 'opponent'` pour rester avec le shooter (no help)
  - `curl-then-recut` → le défenseur du cutter shifte 8 px vers la ligne 3 points (anticipation du recut)
- Pas de modification matchups, juste qualité/règles locales.

**Tests** : 4 patterns × (1-2 cas négatifs + 1 cas positif) + 2 cas intégration V2 = ~12 tests.

**Estimation** : 4-5h V1, +2h V2.

**Risque 🟡** : intersection avec C.4 (snake) et B9 (cutterScreenChain) — doit être conçu pour ne pas double-déclencher.

---

### Phase D — Trajectoires raffinées (~1-2 semaines)

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~D.1~~ | ~~**Easing cross-step** : `state.movementEasing?: 'linear' \| 'ease-in-out' \| 'ease-out'` appliqué sur localT du frameResolver. Default 'linear' = legacy. Invariants snapshots step préservés (e(0)=0, e(1)=1).~~ | — | — | — | 🟢 V1 livré 2026-05-18 (8 tests, 1303 verts) |
| ~~D.2~~ | ~~**Inertie / momentum V1+V2** : mémoire de vélocité défensive (`motionMemory`) dans `resolveFrameAt`. `applyDefenderMotionInertia` amortit les changements de direction (turnDeg + cos blend + speedLoss). Désactivé sur screenLock + overrides. V2 module par `rule.maxSpeed` (guards réactifs, intérieurs lourds). G.3+G.4 livrés 2026-05-18 finissent le couplage accel/profil.~~ | — | — | — | 🟢 V1+V2 livrés 2026-05-15 (frameResolver.applyDefenderMotionInertia) |
| ~~D.3~~ | ~~**Trajectoires de passes V1** : `Annotation.passKind?: 'direct' \| 'lob' \| 'bounce' \| 'skip'`. computeBallFrame étendu : lob ×0.65 lift (plafond 130 px), skip ×0.12 (plafond 40 px), bounce 2 paraboles (touche sol à mi-trajet), direct ×0.28 (legacy).~~ | — | — | — | 🟢 V1 livré 2026-05-18 (7 tests, 1310 verts) |
| ~~D.4~~ | ~~**Pathfinding défensif V1 + V2**~~ : module pur `defensiveRoute.ts` (routes candidates + escalade d'offset + lissage Catmull-Rom). V1 — câblé dans `frameResolver` (couche 5.c) route la trajectoire playback. V2 — câblé dans `speedConstraint` route les cibles de step (le défenseur `late` paie le détour non-écran et suit la route). Opt-in via `state.defensiveRouting`. | — | — | 🟢 V1+V2 livrés 2026-05-22 |
| ~~D.5~~ | ~~**Anti-collision pendant l'interpolation** : invariant confirmé. resolvePlayerCollisions est appelé sur defPos interpolées dans frameResolver (l. ~948). Test bout-en-bout sample 40 frames × N transitions × M scénarios (drive, écran, passe, statique) → clearance ≥ PLAYER_MIN_CLEARANCE_PX préservée.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (test d'invariant, 1314 verts) |

**D.2 V1 livré 2026-05-15.** `resolveFrameAt` a maintenant une
mémoire courte de vélocité défensive (`motionMemory`) et amortit les
changements de direction violents pendant le playback. L'effet est
désactivé sur écran verrouillé et override manuel, puis repasse par les
collisions + rate limiter. Reste une V2 plus profonde si besoin :
accélération/top speed par profil joueur et pathfinding défensif
pré-collision.

**D.2 V2 livré 2026-05-15.** L'inertie playback est maintenant modulée
par `rule.maxSpeed` : guards plus réactifs, intérieurs plus lourds sur
les changements de direction. Pas de nouveau champ utilisateur ; on
réutilise le profil vitesse existant.

**D.5 V1 livré 2026-05-15.** Passe finale de collision sur la frame
interpolée après inertie/rate limiter : poseurs et défenseurs lockés
restent fixes, les autres joueurs sont séparés par une clearance
visuelle bornée, puis reclamp anti-saut. Les golden metrics montent le
seuil minimal de clearance playback de 10 px à 20 px.

**D.4 exploration 2026-05-15.** Ne pas brancher un A* global directement
dans `effectiveDefensePositions` : le moteur écran possède déjà ses
routes tactiques (`over/under/hedge`, stagger/elevator, side constraints)
et un A* naïf risquerait de les contredire. Chemin sûr recommandé :
1. créer un helper pur `defensiveRoute` qui génère 2-3 routes candidates
   autour des obstacles dynamiques non-screen ;
2. l'activer uniquement hors `screenLockedDefenders`, hors override
   manuel, et seulement si le segment direct coupe plusieurs obstacles ;
3. garder les endpoints de step inchangés, ne modifier que la trajectoire
   playback ;
4. comparer via golden metrics (`maxJump`, `minClearance`, temps resolve)
   avant d'envisager un vrai A* grille.

---

### Phase E — Changement de scope (le gros)

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| E.1 | **A11 — Box-out / rebond après tir** | 5-8j | 🟡 | **Très haut** — demi-jeu manquant |
| ~~E.2~~ | ~~**Export GIF / WebM**~~ : modal d'export du terrain animé (GIF universel + WebM léger). Pilote le renderer live via `exportT` qui prime sur scrub/playback. Encodage `gif.js` (Web Worker) ou `MediaRecorder` natif. Téléchargement direct via Blob URL. Item dans le menu overflow `⋯`. | — | — | 🟢 V1 livré 2026-05-23 |

Détail A11 (cf. section 4 plus haut) : enrichir `annotation.shoot` avec
`shotOutcome`, nouvelle couche `boxOutLayer`, modèle de rebond, transition
de possession. Reset shot clock à 14 s (rebond offensif) ou switch possession.

---

### Phase F — Concepts spécialisés haute compétition

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| ~~F.1~~ | ~~**Junk defenses V1 + V2 (Box-and-1, Triangle-and-2, Diamond-and-1)** : `DefenseSystem` étendu à `'junk'` + `state.junkConfig: {type, chaser, chaser2?}`. Couche `computeJunkDefenseTargets` court-circuit (comme zone). 3 formations : box (4 corners), triangle (1 haut + 2 blocks), diamond (losange 1-2-1). 1 ou 2 chasseurs selon type. helpFactor=0 partout. UI complète dans SystemSelector + sub-config chaser picker (1 ou 2 selon type).~~ | — | — | — | 🟢 V1+V2 livrés 2026-05-18 (8+13 tests, 1349 verts) |
| ~~F.2~~ | ~~**Press V1+V2** : DefenseSystem 'press'. V1 half-court (2-2-1 statique). V2 full-court (1-2-1-1) + trap dynamique au franchissement de la médiane (TRAP_PULL_PX=35, 2 défenseurs proches sautent sur le porteur). Court-circuit comme zone/junk, zéro risque Règle 1bis.~~ | — | — | — | 🟢 V1+V2 livrés 2026-05-18 (9+6 tests, 1450 verts) |
| ~~F.3~~ | ~~**Free throw rebound positioning** : 10 positions canoniques + transform + badge UI~~ | — | — | — | 🟢 livré 2026-05-13 (11 tests, 899 verts) |
| ~~F.4~~ | ~~**End-of-quarter foul to give** : helper + diag critical + badge SVG `🟥 FOUL TO GIVE` + UI globale (defenseTeamFouls) + per-step (clockSeconds)~~ | — | — | — | 🟢 V1 livré 2026-05-18 (9 tests, 1279 verts) |
| ~~F.5~~ | ~~**Late shot clock defense** : `lateShotClockLayer` (couche 1.7, opt-in via lateShotClockDefenseEnabled + step.shotClockRemaining<5). carrierDef contest accru, autres défenseurs no-help.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (5 tests, 1279 verts) |

#### 🟢 F.1 V1 — Junk defenses — livré (Box-and-1)

V1 livré 2026-05-18 :
- `DefenseSystem` étendu à `'junk'`. `state.junkConfig?: { type: 'box-and-1'; chaser: AttackerId }`.
- `defense/junkLayer.ts::computeJunkDefenseTargets` : court-circuit du pipeline man (comme `computeZoneDefenseTargets`).
  - 4 défenseurs non-chasers placés sur 4 slots fixes (±80, ±60 px du panier).
  - Chaser placé entre panier et son homme (recul 18 px), stance `deny-3q` + `gazeLock: 'opponent'`. Si le chaser EST le carrierDef, stance neutre + contest classique.
  - helpFactor=0 / helpTriggered=false partout : aucune aide en junk.
- `engine.ts` : `persistDetectedSwitchForStep` skip aussi le mode junk (le chaser ne switch jamais).
- UI : SystemSelector active le bouton Box-and-1 (existant 🚧). Sub-config dans DefensePanel : picker chaser parmi O1-O5 (boutons orange, style cohérent avec le thème offense).
- Tests : 8 (positions box, slots distincts, chaser collé, matchedTo, helpFactor=0, INVARIANT clearance, isCarrierDefender quand shooter porteur, chaser variable).

V2 reportée : `triangle-and-2` (3 zone + 2 chasseurs), `diamond-and-1` (losange 1-2-1 + 1 chaser). Plan d'origine ci-dessous.

⚪ Plan d'origine :

**Concept.** Défense hybride : 3-4 joueurs en zone autour de la raquette,
1-2 chasseurs en homme strict sur les shooters adverses. Utilisé en
niveau lycée/college NCAA contre une équipe à 1-2 stars marqués.

**V1 — Box-and-1 seul.**
- Nouveau `DefenseSystem`: `'junk'` à côté de `'man'` / `'zone'`.
- Nouveau champ `state.junkConfig?: { type: 'box-and-1'; chaser: AttackerId }`.
- Couche dédiée `defense/junkLayer.ts` exécutée **avant baseTargets** (ou en remplacement) quand `defenseSystem === 'junk'` :
  - 4 défenseurs (≠ chaser's defender) sur 4 slots prédéfinis (corners de la raquette : 2 hauts, 2 bas).
  - 1 défenseur sur `chaser` en marquage strict via override `vsCarrier: 'topside'` + `offBallStance: 'deny-3q'`.
- Slot zone géométrique = `(hoop.x ± 80, hoop.y ± 60)`, calibré FIBA.
- Le défenseur du chaser **ne quitte jamais** le chaser (helpMode='disabled' forcé).
- UI : select `Système → junk` → sous-options "type" + "chaser (par nom)".
- Réutilise les briques offBallStance/vsCarrier existantes. Aucune refonte matchups.
- Tests : 4-5 (positions box, chaser suit, chaser tag-along, switch désactivé).

**V2 — Triangle-and-2 + Diamond-and-1.**
- Étend `junkConfig.type` à `'triangle-and-2' | 'diamond-and-1'`.
- `triangle-and-2` : 3 défenseurs en triangle (1 haut, 2 bas) + **2 chasseurs**.
- `diamond-and-1` : 4 défenseurs en diamant (1 haut, 2 ailes, 1 bas) + 1 chasseur. Géométrie 1-2-1 typique NCAA.

**Estimation** : V1 6h, V2 +6h. **Valeur** : permet de simuler des
défenses non-conventionnelles très demandées par les coachs lycée/U18.

#### 🟢 F.2 V1 — Half-court press 2-2-1 — livré 2026-05-18

V1 livré (commit `ed76448`, 9 tests). **Approche pragmatique différente
du ROADMAP** : au lieu de la refonte risquée de `getDefenseHoop`
préconisée, on a fait un court-circuit du pipeline (pattern F.1 junk
éprouvé) qui produit le même effet visuel sans toucher au moteur
d'écran.

- `DefenseSystem` étendu à `'press'`. `state.pressConfig: { type: 'half-court' | '2-2-1' }`.
- `defense/pressLayer.ts::computePressDefenseTargets` court-circuit.
- Formation 2-2-1 :
  - Front line (2) : `dx ± 120, dy -460` du panier défense (= ligne médiane).
  - Mid line (2) : `dx ± 110, dy -250` (= zone de relais).
  - Sweeper (1) : `dx 0, dy -50` (= centre proche panier défense).
- helpFactor=0 partout, matchups préservés.
- UI : bouton "Half-court" activé dans SystemSelector + sub-config rouge.

**V2 livré 2026-05-18** (6 nouveaux tests) :
- `PressType` étendu à `'half-court' | '2-2-1' | 'full-court' | '1-2-1-1'`.
- Formation 1-2-1-1 : 1 chaser (dy -720), 2 wings backcourt (dy -580), 1 mid (dy -460), 1 sweeper (dy -50).
- Trap dynamique : `trapOnHalfCourtCross?: boolean` (default `true` sur full-court). Quand `carrierPos.y < TRAP_CROSS_THRESHOLD_Y (540)` (côté offense), les 2 défenseurs les plus proches sautent vers le porteur (+`TRAP_PULL_PX = 35` px).
- UI : bouton "Full-court" activé + sub-config différencie V1/V2 dans DefensePanel.

**V2.5 reportée** :
- Retreat progressive si press cassée (60% du chemin médiane → panier déclenche retour homme-à-homme).

⚪ Plan d'origine ROADMAP (suggérait refonte `getDefenseHoop` — non retenue) :

**Concept.** Pression tout terrain : la défense reste côté offensif après
une réussite et harcèle la remise en jeu / la montée de balle. Très
chronophage à implémenter car contredit l'hypothèse "tout le jeu côté
défense" du moteur actuel.

**V1 — Half-court trap presse "2-2-1".**
- Nouveau flag `state.pressMode?: 'half-court' | undefined` (V1 ne fait pas full-court).
- Géométrie quand `pressMode === 'half-court'` :
  - 2 défenseurs sur la ligne médiane (D2, D3) en `vsCarrier: 'topside'`
  - 2 défenseurs dans la zone de relais (D1, D4) en `offBallStance: 'fronting'`
  - 1 protecteur arrière au centre du terrain (D5) en `behind`
- Trigger trap : **réutilise** `applyTrap` existant. Quand le porteur franchit la ligne médiane (côté offensif), 2 défenseurs proches sautent dessus.
- Inversion partielle de `getDefenseHoop` : les défenseurs regardent vers leur propre panier (le panier OFFENSE pendant la presse).
- Pas de "vrai" full-court : pas de simulation d'inbounds, pas de turnover, pas de retraite si la presse est cassée.
- UI : sélecteur "Pression : aucune / half-court" dans DefensePanel.
- Tests : 4-5 (positions presse, trap au franchissement, orientation joueurs).

**V2 — Full-court + retreat.**
- `pressMode: 'full-court'` : positions encore plus hautes (côté inbound).
- Retraite progressive si porteur dépasse la ligne médiane (60 % du chemin → retour homme-à-homme).

**Estimation** : V1 10-12h (le plus coûteux des F.*), V2 +2j.
**Risque 🔴** : touche `getDefenseHoop` (orientation par défaut des défenseurs) et plusieurs hypothèses du moteur. **À éviter sauf demande coach explicite.**

#### 🟢 F.3 — FT rebound positioning — livré

V1 entièrement intégrée bien avant cette session (l'item ⚪ était une
désynchronisation du ROADMAP) :
- `src/lib/logic/freeThrowSetup.ts::buildFreeThrowSetup()` — 10
  positions canoniques (O1 tireur, D4/D5 blocks, O4/O5 slots, D1 trail,
  O2/O3 + D2/D3 outlets 3pt). Toutes les paires respectent
  `PLAYER_MIN_CLEARANCE_PX`.
- `convertStepToFreeThrow(s)` dans `stepTransforms.ts` (transform pur +
  `Step.context: 'free-throw'` + `defenseOverrides` posés).
- UI : bouton "convertir en LF" dans StepsPanel + badge `🏀 LF` sur
  les steps contexte free-throw.
- Extension F.2 livrée 2026-05-16 : `buildFreeThrowReboundSetup(made)`
  + `addFreeThrowReboundStep` pour la phase course-rebond.
- Tests : `f3FreeThrowSetup.test.ts` — 11 tests (canoniques + transform
  + invariant clearance + intégration engine).

Le détail du plan ci-dessous reste comme référence historique.

⚪ Plan d'origine (livré) :

**Concept.** Sur un lancer franc, les 10 joueurs occupent 6 slots
normalisés autour de la raquette (NBA/FIBA rules). Defense prend cases
1-3 (intérieures, plus proches du panier), offense prend cases 2-4.

**V1 — Positions statiques.**
- Nouveau champ `Step.context?: 'live-play' | 'free-throw'` (default `'live-play'`).
- Quand `context === 'free-throw'` :
  - Positions des 10 joueurs **forcées** sur les 6 slots normalisés relatifs au panier :
    - Defense slots 1+3 (bas de la raquette) + 1 trail (libre throw line) + 1 weak-side outlet (3pt opposé)
    - Offense slots 2+4 (proches panier) + 1 shooter sur ligne de tir + 1 outlet
  - 1 attaquant supplémentaire en backcourt (transition defense).
- Setup automatique via `applyFreeThrowSetup(state)` au moment où on convertit un step.
- UI : bouton "convertir en LF" dans le panneau étape.
- Pas de simulation du tir lui-même — juste positions statiques visualisables (utile pour rappels visuels coach).
- Tests : 3-4 (setup applique 10 positions, contexte préservé sur step suivant, conversion réversible).

**Estimation** : V1 4h. Pas de V2 prévue (sauf à ajouter rebond offensif/défensif post-shot, qui touche E.1).

#### 🟢 F.4 — End-of-quarter foul to give — livré

**Concept.** Si l'équipe en défense a < 5 fautes au quart-temps, elle
peut "foul to give" sur les dernières secondes pour empêcher un
tir-au-buzzer. Stratégie ultra-courante NBA/EuroLeague.

**V1 — Diagnostic + badge.**
- Nouveau champ `step.clockSeconds?: number` (sec restantes au quart). Si absent, helper inactif.
- Nouveau champ `state.defenseTeamFouls?: number` (fautes équipe défense au quart, default 0). Range 0-5.
- Helper pur `defense/detectFoulToGiveOpportunity.ts` qui détecte :
  - `step.clockSeconds < 5`
  - `state.defenseTeamFouls < 5`
  - Porteur en mouvement vers le panier (`triggers.drive === true` ou delta vers hoop > 30 px)
- Affiche un **badge SVG** sur le défenseur du porteur : cercle rouge `🟥 FOUL TO GIVE` + info-bulle.
- Pas de modif des positions (V1 = coach voit l'opportunité, agit en plaçant manuellement).
- Tests : 4-5 (positifs + 3 négatifs : fautes ≥ 5, clock > 5s, pas de drive).

**V2 — La défense modifie sa trajectoire.**
- Sous condition `state.foulToGiveAutoEnabled`, le carrierDef change de cible pour intercepter physiquement (collision target sur le porteur).
- Ajoute un flag `step.simulatedFoul: DefenderId` qui freeze le step suivant.

**Estimation** : V1 2-3h (juste détection + badge), V2 +3h.

#### 🟢 F.5 — Late shot clock defense — livré

**Concept.** Sous les 5 dernières secondes du shot clock, la défense
sait que l'attaquant DOIT shooter. Donc : contest tout, no fouls, no
help (pas besoin de couvrir un dump-off ou un kick-out).

**V1 — Modulation globale.**
- Nouveau champ `step.shotClockRemaining?: number` (sec restantes au shot clock, default 24).
- Setting `state.lateShotClockDefenseEnabled?: boolean` (opt-in).
- Effet quand `shotClockRemaining < 5` ET flag activé :
  - Tous les `closeoutBoost` boostés ×1.3 (closeout encore plus rapide)
  - Tous les `helpMode` forcés à `'passive'` (no help, contest direct)
  - Tous les `vsCarrier` poussés vers `'contester'` (haute pression sur le porteur)
- Couche d'intégration `defense/lateShotClockLayer.ts` (après baseTargets, avant pnrLayer) : applique les modulations en mutant `positions` et flags.
- UI : checkbox + champ "shot clock restant" dans le step panel.
- Tests : 4-5 (modulation active, pas active si flag off, pas active si clock > 5).

**V2 — Intégration timeline.**
- Calcul automatique de `shotClockRemaining` à partir des durées cumulées (dépend B.1 et B.2).
- Reset auto à 24/14 sur tir / rebond offensif (dépend E.1).

**Estimation** : V1 3h. V2 dépend de B.1+B.2+E.1 livrés.

---

### Phase G — Calibration vitesse réelle (~2-3 jours)

Aujourd'hui : D1 max 1.96 m/s ≈ 7 km/h = **22 % d'un sprint NBA réel**.
Calibré pour les **mouvements tactiques**, pas les sprints. À expliciter
ou affiner.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~G.1~~ | ~~**Doc calibration explicite** : nouveau `docs/physics-calibration.md` qui pose le scope tactique vs sprint réel, ratios chiffrés vs NBA, coût d'un passage en sprint, cas où le mode tactique gêne.~~ | — | — | — | 🟢 livré 2026-05-18 |
| ~~G.2~~ | ~~**Sprint contextuel** : `step.sprintBoost?: boolean` ×1.8 sur la vitesse max effective défense. Cumulable avec G.4 et closeoutBoost. UI : toggle dans StepsPanel sur step actif.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (4 tests, 1295 verts) |
| ~~G.3~~ | ~~**Différenciation accélération vs top speed V1** (modèle linéaire) : `state.accelerationModelEnabled` + `state.defenderAcceleration` (px/step², default 75). Au step N, vitesse défenseur clampée à `accel × N`, plafond maxSpeed. UI toggle + slider DefensePanel. Limitation V1 : clamp porte sur target→target, l'effet est précis au step 1 puis subtil sur les suivants. V2 (vraie chaîne effective→effective via cache) à venir.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (4 tests, 1336 verts) |
| ~~G.4~~ | ~~**Profil athlétique** : `state.defenderSpeedProfiles?: Partial<Record<DefenderId, 'elite' \| 'standard' \| 'lent'>>` multiplie maxSpeed effective ×1.3 / ×1.0 / ×0.7. Module per-défenseur en plus de MAX_SPEED_BY_POSITION.~~ | — | — | — | 🟢 V1 livré 2026-05-18 (5 tests, 1291 verts) |

---

### Phase Phy.O — Physique offensive (mirror du moteur défensif côté attaque)

Le moteur physique était asymétrique : défense saturée (D.2 inertie, G.3 accel,
G.4 profils, Lever B friction, D.4 pathfinding…), attaque vide (sampling
linéaire en arc-length, aucune physique). Phy.O comble ce trou côté
attaque, en plusieurs vagues.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~Phy.O V1~~ | ~~**Profil de vitesse offensif (courbure + tier athlétique)**~~ : module pur `velocityProfile.ts` calcule la courbure le long de la courbe Catmull-Rom lissée et en déduit un remap `actionT_linéaire → s/L`. Un V-cut ralentit à l'apex et ré-accélère en sortie, un drive droit garde la vitesse max. Tier athlétique `attackerSpeedProfiles` (elite ×0.7 / standard / lent ×1.4 sur α). Câblé dans `playbackTrajectory` derrière le flag opt-in `state.attackerVelocityProfileEnabled`. Toggle dans `ParametresPanel`. Endpoints `ann.from`/`ann.to` strictement préservés. | — | — | — | 🟢 V1 livré 2026-05-23 (9 tests, 1720 verts) |
| ~~Phy.O V2~~ | ~~**Friction de proximité offensive**~~ : per-sample factor `friction(s) ∈ [0.6, 1]` dans `v(s) = friction(s) / (1 + α κ(s))`. Obstacles = autres joueurs au mid-segment, snapshot construit par `frameResolver`. Cache `WeakMap` indexé par `tier|obstaclesHash`. | — | — | — | 🟢 V2 livré 2026-05-23 (4 tests, ~1728 verts) |
| ~~Phy.O V3 V1~~ | ~~**Démarquage actif — lecture du matched defender**~~ (approche A du RFC) : facteur `defenseReading(s) ∈ [0.7, 1]` multiplicatif dans v(s), pour les samples du path proches (≤ 50 px) du matched defender mid-segment. Flag dédié `attackerActiveDemarquage` (opt-in, A/B-able vs profil de vitesse). | — | — | — | 🟢 V1 livré 2026-05-23 (3 tests) |
| ~~Phy.O V3 V4~~ | ~~**Boost post-feinte (lecture proactive)**~~ : feinte gaussienne devient asymétrique avec un pic v=1.4 placé ~10% d'arc après le creux. Activé par le même flag `attackerActiveDemarquage`. Sans nouvelle UI. | — | — | — | 🟢 livré 2026-05-23 (3 tests) |
| ~~Phy.O V3 V2~~ | ~~**Choix de côté du cut** (flip du path si défenseur du côté trigger)~~ — 🟢 livré 2026-06-02 (`cutSideFlip.ts`, 14 tests) | — | — | — |
| Phy.O V3 V3 | **Sortie tangentielle d'écran adaptée** (approche B, RFC `tangential-screen-exit-RFC.md`). | 1j | 🟡 | Haut | ⚪ |
| ~~Phy.O V4 V1~~ | ~~**Feintes / jab steps / hesitation dribbles (backend)**~~ : champ `Annotation.feintes?: number[]` (positions arc-length), creux gaussien par feinte sur v(s) (`depth=0.5`, `width=0.08`), `max` (pas somme) entre feintes. Combiné multiplicativement avec friction et courbure. Pas d'UI V1 (set via JSON ou attendre V2). | — | — | — | 🟢 V1 backend livré 2026-05-23 (4 tests) |
| ~~Phy.O V4 V2~~ | ~~**UI feintes**~~ : sliders par feinte dans StepsPanel (position 0..100% par tranche de 5%), bouton `+ feinte`, bouton `×` par feinte, marker SVG jaune-orangé sur le path. Transforms purs add/update/remove. | — | — | — | 🟢 V2 livré 2026-05-23 (5 tests) |
| ~~Phy.O UI tier~~ | ~~**UI per-attaquant pour le tier athlétique**~~ : select dans `AttackerMenu` (auto/elite/standard/lent), transform `setAttackerSpeedTier`, propagation Page → CourtView → CourtMenus → AttackerMenu. | — | — | — | 🟢 livré 2026-05-23 (4 tests transform) |

---

### Phase H — Tests composants React (~3-4 jours)

Aujourd'hui : zéro test sur `src/components/`. Convention du projet, OK
historique mais limite à terme. Si on veut renforcer :

| # | Chantier | Effort | Risque | Valeur |
|---|---|---|---|---|
| H.1 | Setup `@testing-library/react` + `jsdom` | 2h | 🟢 | (foundation) |
| H.2 | Tests CourtView pointer handlers (drag single, drag groupé, marquee, snap) | 1-2j | 🟡 | Haut |
| H.3 | Tests MetricsChart, MetricsBar, DefensePanel toggle | 1j | 🟢 | Moyen |
| H.4 | Tests ContextMenu (DefenderMenu, AttackerMenu) | 1j | 🟢 | Moyen |

---

### Phase I — Mode Play IA (🟢 100% livrée, B1 → B7 + V2 stage 1+2a)

**Status final 2026-05-16** : 100% livrée (B1-B5 noyau + B5+ B6 B7
polish + V2 stage 1+2a opposition adverse rendue). Seul reste V2
stage 2b (refacto AppState 2-way natif) qui demande sa propre session.

Récap chantiers livrés :

| # | Status | Commit | Description |
|---|---|---|---|
| B1 | 🟢 | `edb43e6` | Game loop continu, intent persistant porteur (drive/pass/shoot) |
| B3a | 🟢 | `bd2dccf` | Shot model enrichi (zone, contestation, position) + fix intent 'shoot' |
| B2 | 🟢 | `0da33a4` | Décideur off-ball (cut, space-drift, relocate) avec budget cuts |
| B4 | 🟢 | `ac1bece` | UI live complète : CourtView lit `matchState`, HUD événements |
| B3b | 🟢 | `40e5f0f` | Transition multi-possessions (rebond off 28 %, new poss reset) |
| B5 | 🟢 | `2e9ffee` | Calibration live vs Monte-Carlo (tolérance ±0.15 PPP) |
| Tick fix | 🟢 | `7ed6cc0` | Tick rate 5 Hz → 30 Hz, scaling proportionnel des constantes |
| **B5+** | 🟢 | `0192916` | Auto-tuning calibration par dichotomie (max 8 itérations) |
| **B6** | 🟢 | `6dd7e83` | Vitesse accélérée live ×1/×2/×4/×8 |
| **B7** | 🟢 | `486b039` | Replay détaillé post-match avec timeline + filtres |
| **V2 stage 1** | 🟢 | `6d99024` | Ballon adverse animé pendant phase away |
| **V2 stage 2a** | 🟢 | `1cefa67` | 5 adversaires simulés rendus visuellement (sprites rouges) |

**Stage 2b — Option A (V1 ultra-mini) livré 2026-05-18** (3 commits,
15 tests) :
- `Step.viewSide?: 'home' | 'away'` (default 'home', rétrocompat 100%).
- Module pur `awayPossessionSetup.ts` : `buildAwayPossessionSetup`
  mirror vertical autour de `HALF_COURT_Y = 540` (cohérent game loop).
  Mapping nominal D1↔O1...D5↔O5 préservé.
- Transform `convertStepToAwayPossession` avec modes 'insert' / 'replace'.
- UI : 2 boutons StepsPanel (guidé post-`outletPassPending` A11 V2 ext3 +
  libre toggle home↔away) + banner "🔄 PHASE ADVERSE (édition)" dans
  CourtView (distinct du banner game loop).
- Diag coach `awayPossessionRule` qui flag les steps adverses (évite
  confusion sur les autres diags qui assument "O = nos joueurs").

Le moteur défensif tourne **tel quel** (sémantique O/D inchangée),
seule la sémantique d'affichage change. Zéro risque Règle 1bis : aucune
modification de `frameResolver`, `screens/`, `defense/*Layer.ts`.

**Reste reporté (Options B et C)** :
- **Option B** team-aware soft : `Step.attackerTeamLabel` pour préserver
  l'identité joueur à travers les transitions home↔away.
- **Option C** refacto complet : `AppState.currentlyAttackingTeam`
  natif + engine défensif appliqué côté home pendant phase away +
  matchups inversés en mémoire. Plan complet dans
  [docs/e1-stage2b-plan.md](docs/e1-stage2b-plan.md).

**Modules livrés** (au-delà de la session initiale) :
- `src/lib/logic/match/autoTuning.ts` — dichotomie sur creativity
- `src/components/MatchReplay.tsx` — modal post-match timeline
- `MatchState` étendu : `awayBallPos`, `awayPlayerPositions`,
  `pendingRebound`, `shotBallStartPos`, `boxOutTargets`,
  `inboundTimerMs`

Doc : [docs/ai-possession.md](docs/ai-possession.md).

### Phase E.1 V1 + V2 stage 1+2a — Rebond + cycle home/away (🟢 livré)

| Item | Commit | Description |
|---|---|---|
| Modèle rebond géométrique | `5e48549` | Module `match/rebound.ts` : poids par profil, distance, zone tir |
| Box-Out V1 (snap) | `5e48549` | Shift défenseurs vers homme + offset panier au moment du tir |
| Box-Out V2 (animé) | `17aaac9` | Lerp ease-out 500 ms vers targets, `boxOutStartedAtMs` |
| Cycle home → away stub | `5e48549` | Phase adverse 12 s, score AWAY 50%, return to home |
| Score 2-côtés HOME/AWAY | `5e48549` | `homeScore`/`awayScore` séparés dans MatchState |
| V2 stage 1 ballon animé | `6d99024` | `awayBallPos` 4 waypoints |
| V2 stage 2a 5 adversaires | `1cefa67` | `awayPlayerPositions` miroir + course |

### Phase E.2 + E.3 + F.2 + F.4 — Situations basket complémentaires (🟢 livré)

> ⚠️ **Note de numérotation** : ces items sont indexés selon
> `docs/todo-priorities.md` créé pour la session, **différent** de la
> numérotation Phase E/F historique de cette roadmap (où E.2 = Export
> GIF, F.2 = Press full-court, etc., toujours pending).

| Item | Commit | Description |
|---|---|---|
| **E.2 Jump ball** | `a61323c` | Setup canonique entre-deux : 2 sauteurs + 4+4 en arc. Module `jumpBallSetup.ts` + setter `convertStepToJumpBall` |
| **E.3 Rebond animé** | `874d96c` | Pré-calcul rebond + animation parabole 2 phases du ballon (shooter→cercle→rebondeur) |
| **F.2 Free throw post-lancer** | `6bb780a` | `buildFreeThrowReboundSetup(made)` + `addFreeThrowReboundStep`. Course-rebond animée sur miss, transition adverse sur made |
| **F.4 Pénalité technique / DQ** | `5ae6e10` | `AppState.disqualifiedPlayers` + toggle UI + overlay rouge "DQ". V1 visuel uniquement |

### Système remises en jeu — 17 templates + diag + timer + modes défensifs (🟢 livré)

Phase complète documentée séparément :
[docs/inbound-system.md](docs/inbound-system.md).

---

### Phase K — Behavior Anomaly Detection (livrée 2026-05-18)

Nouveau pilier observabilité demandé par l'utilisateur pour "suivre et
améliorer les comportements anormaux et anomalies de déplacement".
Architecture pure / opt-in / zéro risque Règle 1bis. **7 commits, 56
tests, 1450 → 1506 verts.**

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~K.0~~ | ~~Types + module pur `anomaly/`~~ | — | — | — | 🟢 livré 2026-05-18 |
| ~~K.1 V1~~ | ~~`detectTeleport` (saut > 24 px, > 60 critical)~~ | — | — | — | 🟢 livré 2026-05-18 (8 tests) |
| ~~K.2 V1~~ | ~~`detectAberrantSpeed` (déf > maxSpeed × 1.95)~~ | — | — | — | 🟢 livré 2026-05-18 (6 tests) |
| ~~K.3 V1~~ | ~~`detectDetachedDefenders` (>250 px du matchedTo, hors aide/screen)~~ | — | — | — | 🟢 livré 2026-05-18 (7 tests) |
| ~~K.4 V1~~ | ~~`detectFlicker` (cos < -0.707 sur 3 frames, m > 5 px)~~ | — | — | — | 🟢 livré 2026-05-18 (8 tests) |
| ~~K.5 V1~~ | ~~`detectAnomalousGaze` (>90° corps↔regard, Règle 3 CLAUDE.md)~~ | — | — | — | 🟢 livré 2026-05-18 (10 tests) |
| ~~K.6~~ | ~~Règle coach `playerAnomalyRule` (K.1/K.2/K.3) + toggle ParametresPanel~~ | — | — | — | 🟢 livré 2026-05-18 (6 tests) |
| ~~K.7 V2~~ | ~~`clampTeleports` + `clampAberrantSpeed` (correction pure, opt-in via call site)~~ | — | — | — | 🟢 livré 2026-05-18 (11 tests) |

**Reportés** : K.4/K.5 brancher sur coachDiagnostics (nécessite 3-frame
window + snapshot des visuels orientés). K.7 wirer dans le pipeline live
(à n'envisager que si une régression visible justifie le risque Règle 1bis).

### Phase J — Moteur d'écran / playback : qualité & outillage (mai 2026)

Suite de la session debug UCLA cut (saut D1 de 52 px entre f113-f114).
Le fix anti-flip + le garde-fou diagnostic central ont été livrés ; les
items J.1-J.7 prolongent l'effort pour consolider le moteur d'écran et
son outillage **sans changer le scope basket**.

| # | Chantier | Effort | Risque | Valeur | Statut |
|---|---|---|---|---|---|
| ~~J.0a~~ | ~~**pushOutOfManyConstrained** — fix anti-flip D1 (UCLA cut)~~ | — | — | — | 🟢 livré 2026-05-14 (3 tests, commit `303fb25`) |
| ~~J.0b~~ | ~~**Garde-fou diagnostic anti-téléport central** — `collectDecisions` + 16 templates instrumentés~~ | — | — | — | 🟢 livré 2026-05-14 (commit `1c3feab`) |
| ~~J.1~~ | ~~**Parité scrub ↔ playback** — mémoire scrub déterministe recalculée depuis le début du segment~~ | — | — | — | 🟢 livré 2026-05-15 (commit `38209d6`) |
| ~~J.2~~ | ~~**Cache segmentaire du resolver** — memoize par segment `idxA→idxB`~~ | — | — | — | 🟢 livré 2026-05-15 (commit `87b212c`) |
| ~~J.3~~ | ~~**Solver de contraintes unifié** — un seul résolveur att/déf/poseurs/clusters/screen lock~~ | — | — | — | 🟢 livré 2026-05-15 (`f7fcb8a`, `6ba3927` + finalisation multi-entités) |
| ~~J.4~~ | ~~**Off-ball avancé** — stagger séquentiel, elevator 2 points, flare/backscreen, mémoire sortie tangentielle~~ | — | — | — | 🟢 livré 2026-05-15 (routes par type, gap elevator, sortie tangentielle active, mémoire multi-contact) |
| ~~J.5~~ | ~~**Profiling + budget frame** — mesurer `resolveFrameAt`, `effectiveDefensePositions`, détections, collisions ; fixer un budget~~ | — | — | — | 🟢 livré 2026-05-15 (commit `a40a8bc`) |
| ~~J.6~~ | ~~**Visual regression légère — golden scenarios** — exports métriques par scénario~~ | — | — | — | 🟢 livré 2026-05-15 (commit `e8ad45b`) |
| ~~J.7~~ | ~~**Panneau debug joueur** — lecture instantanée par défenseur (contactKey, mode, route, qualité, memory, jump last frame)~~ | — | — | — | 🟢 livré 2026-05-15 (commit `37a370f`) |

**État réel au 2026-05-15.**
- J.1, J.2, J.5, J.6, J.7 sont livrés et testés.
- J.3 est livré : `constraintSolver.ts`, `pushOutOfScreenContact`,
  `pushOutOfMany` et `resolvePlayerCollisions` passent par le socle commun
  (`solvePointConstraints` / `solveEntityCollisions`). Les wrappers historiques
  restent pour compatibilité, mais la logique itérative est centralisée.
- J.4 est livré : routes off-ball par type (`flare`, `backscreen`, `hammer`,
  `elevator`), contact stagger séquentiel, corridor physique elevator,
  sortie tangentielle par poseur actif et mémoire multi-contact
  (`contactScreeners`, `activeScreener`, `contactProgress`).

#### 🟢 J.1 — Parité scrub ↔ playback — livré V1 2026-05-18

V1 livré 2026-05-18 (8 tests). Audit a confirmé que la parité
POSITIONNELLE était déjà garantie par
`resolveFrameAtDeterministicScrub` qui reconstruit la mémoire de
playback depuis le début du segment (cf. SCREEN-ENGINE.md L.299-305).

Restait une **désync des options de diagnostic** entre les 2 appels :
- Scrub n'activait `collectDecisions` que sur `showScreenDebug` (J.7
  panneau debug joueur ne marchait pas en scrub).
- Scrub ne passait jamais `profile` (J.5 overlay vide en scrub).

**Fix V1** (`useCourtFrame.ts` l.~173) : aligner les flags
`collectDecisions: showScreenDebug || showPlayerDebug` et
`profile: showProfileOverlay` entre scrub et playback. Une seule
modification de 2 lignes.

**Tests d'invariant** (`j1ScrubPlaybackParity.test.ts`, 8 tests) :
- Positions playback ≈ scrub (écart < 25 px) sur 3 templates (ucla-cut,
  pnr-central, pindown-corner) × 5 sample points (0.25, 0.5, 0.75, 1.0,
  1.5).
- Carrier identique playback/scrub.
- Options diagnostic acceptées par scrub (collectDecisions + profile).
- Default sans options → debug/profile undefined.

**Checklist Règle 1bis CLAUDE.md** : tous les tests
`screens*` + `overlap*` + `userJson*` + `screenLab*` (155 tests) passent
sans régression. Suite complète : 1371 → 1379 verts (+8).

⚪ Plan d'origine :

**Problème actuel.** Le playback a une mémoire courte (`prevFrame` →
rate limiter 18 px/frame). Le scrub est **volontairement sans mémoire**
(chaque position de timeline recompute from scratch), donc un saut
masqué en lecture peut redevenir visible en glissant la souris.

**Plan.** Ajouter au scrub une mémoire **déterministe** : à chaque appel
de `resolveFrameAt` en mode scrub, recompute les N frames du début du
segment courant (`floor(t)` → `t`) en chaînant `prevFrame`, puis retourne
la frame finale. Pas d'historique caché (chaque appel reproductible),
juste un préfixe synthétique.

**Impact.** Les tests à la souris sur la timeline deviennent aussi
fiables que la lecture normale ; plus de différence visuelle scrub vs
play.

**Risque 🟡.** Coût CPU au scrub (60 frames par déplacement de
quelques px). Mitigation : memoize le préfixe (cf. J.2).

#### 🟢 J.2 — Cache segmentaire du resolver — livré 2026-05-15 (détail ci-dessous)

**Problème actuel.** `resolveFrameAt` recalcule à chaque appel :
`matchupsA/B`, `ctxA/B/exit`, `screenerObstacles`, qualités, routes.
Pour un segment `idxA → idxB` donné, ces valeurs sont **stables** sur
toute la transition — seul `localT` varie.

**Plan.** Cache LRU clé `(idxA, idxB, statePatchHash)` valeur :
- `ctxA`, `ctxB`, `screenerObstacles`, par-défenseur `contact`,
  `routePreference`, `screenLockedDefenders`, `singleClusterForSideConstraint`.
- Invalidé sur changement de `state.steps[idxA|idxB]`, `matchups`,
  `screenRule`, `offBallScreenRule`.

**Impact.** Fluidité playback (~50-70 % du calcul est segment-invariant
selon profiling brouillon), particulièrement perceptible quand
`collectDecisions: true` ou overlays debug actifs.

**Risque 🟢.** Cache pur sur valeurs stables, aucune sémantique
changée. Tests : ajouter assertion "résultat == résultat sans cache"
sur les 16 templates instrumentés.

#### 🟢 J.3 — Solver de contraintes unifié — livré 2026-05-15 (détail ci-dessous)

**Problème actuel.** On a empilé : `pushOutOfMany` (attaquants),
`pushOutOfMany` (défenseurs screen-locked), `pushOutOfManyConstrained`
(UCLA fix), `resolvePlayerCollisions` (final pass). Chaque solveur a
ses cas spéciaux, son ordre d'itération, sa convergence à 2 fixed
points (bug UCLA). Surface d'attaque large pour les régressions
latérales.

**Plan.** Un **solveur unique** qui prend toutes les contraintes :
- Obstacles (joueurs autres)
- Half-plane (côté navigué imposé par screen lock)
- Distance min par couple (MIN_CLEARANCE) avec exceptions paramétrables
- Targets (positions cibles à approcher si compatible)

Algorithme candidat : projection itérative type SoR (Successive
Over-Relaxation) ou QP léger (quadratic programming) sur sous-ensemble
actif.

**Impact.** Suppression de toutes les heuristiques "push à 2 fixed
points" → plus de surprises latérales. Code défensif réduit de ~30 %.

**Risque 🔴.** Refactor profond du pipeline final. À ne tenter qu'avec
J.6 (golden scenarios) en place comme garde-fou.

#### 🟢 J.4 — Off-ball avancé — livré

**Problème traité.** Le PnR (carrier screen) a 9 rules (over/under/
hedge/drop/blitz/ice/weak/switch/peel-switch), des transitions soignées
(C.1-C.7), un mémoire de sortie tangentielle. L'off-ball était plus
basique : routes moins différenciées, peu de mémoire spécifique de
contact, et les doubles écrans pouvaient retomber sur un simple contact.

**Livré.**
- **Stagger séquentiel** : modélise la chaîne O4 puis O5 avec phase
  `transition` entre les deux (D2 sort du contact 1 vers contact 2 sans
  retour à l'homme).
- **Elevator** : deux poseurs côte à côte, le défenseur passe par
  l'unique gap entre eux via un corridor physique centré sur le gap.
- **Flare / backscreen** : route propre (ne PAS poursuivre sur le côté
  du poseur opposé au panier).
- **Mémoire sortie tangentielle off-ball** : équivalent du
  `tangentReleasePoint` carrier pour les off-ball screens. Stagger sort
  tangentiellement autour du poseur actif ; elevator sort à travers le
  gap au lieu de tourner autour d'un centroïde.
- **Mémoire multi-contact** : `screenMemory` et `FrameDecision` exposent
  les poseurs impliqués, le poseur actif et la progression du contact.

**Impact.** Gros gain sur UCLA, floppy, pindown, hammer — les 4
templates où l'off-ball domine la séquence.

**Garde-fous.** Tests frame de bout en bout : progression O4→O5 sur
stagger, passage elevator dans le gap, mémoire qui n'empêche pas la
sortie de l'autre côté, fluidité pindown.

#### 🟢 J.5 — Profile overlay V1 — livré 2026-05-18

V1 livré 2026-05-18 (commit `ccf73b9`, 9 tests). Réutilise l'infra
`createFrameProfiler` + `FrameProfile` existante (testée par
`playbackPerf.test.ts`) et ajoute une couche d'agrégation + overlay.

- Module pur `playback/profileAggregator.ts` :
  `aggregateProfiles(profiles[])` → `AggregatedProfile { count, byPhase,
  total, hottestPhase }`. Stats : `mean / max / p95 / sum` par phase.
- Classe `ProfileRingBuffer` (maxSize 120, FIFO).
- `state.showProfileOverlay?: boolean` active `profile: true` dans
  `useCourtFrame` + monte `<FrameProfileOverlay>` (overlay haut-gauche
  du terrain, tableau mean/p95/max par phase, phase hottest highlightée).
- Toggle "profile (J.5)" dans ParametresPanel.

Plan d'origine ci-dessous comme référence.

⚪ Plan d'origine :

**Plan.**
- Wraper `performance.now()` autour de chaque phase clé de
  `resolveFrameAt` (lerp attaquants, détection écran, calcul cluster,
  loop défenseurs, pushOut, collisions, rate limiter).
- Test dédié `playbackPerf.test.ts` qui mesure le temps moyen sur
  les 16 templates × N=600 frames et vérifie un budget.
- Cible initiale : `resolveFrameAt < 2 ms en 5v5` (laisse 14 ms pour
  rendu R3F + overlays = 60 fps stable).
- Output dans CI (warning si > 80 % du budget, fail si > 100 %).

**Impact.** Optimisation ciblée plutôt qu'à l'aveugle. Repère pour
juger les J.2 (cache) et J.3 (solveur unifié).

#### 🟢 J.6 — Visual regression légère — livré 2026-05-18

V1 livré 2026-05-18 (9 tests). Utilise les snapshots Vitest natifs
(`.toMatchSnapshot`) sur 4 templates de référence :
- `ucla-cut` (coupe classique off-ball)
- `pnr-central` (PnR cœur de terrain)
- `pindown-corner` (off-ball screen latéral)
- `floppy` (double pindown miroir)

- Module pur `playback/sceneSnapshot.ts` :
  `snapshotScene(state, label, sampleTs?)` → `SceneSnapshot { label,
  frames }`. Capture positions ballon + 10 joueurs + flags
  défenseurs (matchedTo, helpFactor>0, helpTriggered, onScreen,
  screenPhase) à des instants choisis (default : début + milieu + fin
  de chaque transition). Positions arrondies à 1 décimale.
- Test golden `j6GoldenSnapshots.test.ts` : 4 templates × N frames
  par template = snapshot stocké dans `__snapshots__/`.
- Regen volontaire : `npx vitest run j6GoldenSnapshots -u`.

Plan d'origine ci-dessous comme référence.

⚪ Plan d'origine :

**Plan.** Un test par template `goldenScenarios.test.ts` qui produit
un snapshot JSON de métriques sur tout le playback :
- `maxJumpPxPerDefender`
- `meanDistToMatchedAtt`
- `meanDistToScreenerWhenStuck`
- `routeSideHistogram` (côté de route choisi par chaque défenseur)
- `minClearanceObservedPerStep`
- `screenLockDurationMs`

Snapshots versionnés. Toute évolution → diff lisible : "D2 reste 1.4 s
sur le poseur au lieu de 1.1 s, side route flippe 3× vs 1× avant fix".

**Impact.** Tout futur fix moteur sera **automatiquement comparé** à
l'état de référence — plus de "ça marche encore comme avant ?" à l'œil.

**Risque 🟢.** Snapshots peuvent générer du bruit ; commencer par
3-4 templates clés (UCLA cut, PnR central, pindown, floppy) avant
généralisation.

#### 🟢 J.7 — Panneau debug joueur — livré V1

V1 livré 2026-05-18 :
- Nouveau toggle `state.showPlayerDebug?: boolean` (toggle dans
  ParametresPanel, à côté de `debug écran`).
- Quand actif, `useCourtFrame` ajoute `collectDecisions: true` dans
  l'appel à `resolveFrameAt` → `frame.debug.defenders` rempli.
- Nouveau composant `<PlayerDebugTable>` (overlays/) qui affiche un
  tableau compact des 5 défenseurs avec : matched, screenState, route,
  helpKind/factor. Position absolue en haut-droite du terrain.
- Coexiste avec `ScreenPlayerDebugPanel` qui reste dédié à l'analyse
  screen-engine fine sur sélection.

Plan d'origine ci-dessous comme référence.

⚪ Plan d'origine :

**Problème actuel.** `collectDecisions` (livré J.0b) expose les
décisions par défenseur dans `frame.debug.defenders[id]`, mais
**uniquement en tests**. En dev mode UI, le coach n'a pas de fenêtre
sur ce qui se passe.

**Plan.** Overlay `<PlayerDebugPanel>` activable via
`state.showPlayerDebug` (toggle Paramètres) : pour chaque défenseur
sélectionné, affiche `screenMode`, `quality`, `clusterId`, `pushMode`,
`forcedPushSign`, `matchedTo`, `late`, + `jumpLastFrame` (delta px par
rapport à la frame précédente).

Layout : petit pavé flottant à droite du défenseur sélectionné, dépliable.

**Impact.** Quand un déplacement semble bizarre en dev, **un clic
suffit** pour voir la décision. Plus de retour aux tests pour
comprendre.

**Risque 🟢.** Pur ajout opt-in côté UI. Réutilise l'option
`collectDecisions` déjà branchée.

---

### Synthèse — ordre conseillé

**Phase C — état au 2026-05-17** : 7/7 livrés (C.1 → C.7, V1+V2 inclus).
Phase C complète. Phase B partiellement livrée (B.1 livré 2026-05-17,
reste B.2/B.3/B.4).

**Cette semaine** (~6h) : A.2 + A.3 + B.1 → débloque shot clock,
défense end-of-clock, plus de finesse coach.

**Cette semaine étendue** (~3-4j) : A.* complet + B.* complet → fondations
temps + UI accessibles. Le moteur passe à 100% utilisable côté coach.

**Mois suivant** (~2 semaines) : C.2 + C.7 (réalisme défensif final) +
quelques D.* (lissage, trajectoires de passes). Le moteur passe d'un
simulateur "tactique" à un simulateur "tactique + visuel réaliste".

**Quick wins F.* à intercaler** : F.4 + F.5 (~5-6h cumulés) — ajoutent
2 sliders de réalisme à faible coût, surtout après B.1 livré (champ
clock natif).

**Trimestre suivant** : E.1 (box-out/rebond, demi-jeu) — le changement
de scope qui ouvre le jeu complet. Suivi de F.1 (junk) + F.3 (FT
rebound) selon les besoins.

**Phase J (qualité moteur écran)** : J.1 à J.7 sont livrés. Le moteur
écran/playback a maintenant la parité scrub/playback, le cache
segmentaire, le solver unifié, les diagnostics anti-saut, les golden
metrics et les écrans off-ball avancés.

**À traiter en parallèle dès que possible** : G.1 (doc calibration) qui
clarifie le scope du moteur (tactique vs sprint réel).

**À reporter sauf demande explicite** : F.2 (press full-court, 10-12h
V1, refonte `getDefenseHoop`).

**Long terme** : H.* (tests composants) + I.* (Play IA).

### Récap statut phase C+F (mai 2026)

| Item | Statut | Tests | Commit |
|------|--------|-------|--------|
| C.1 Closeout footwork | 🟢 livré | 7 | `8b65aa6` |
| C.2 Help-and-recover | 🟢 V1 + V2 livrés (step + ms, slider DefensePanel) | 18 | (commits C.2 V1, V2 2026-05-17) |
| C.3 Hedge length | 🟢 livré | 8 | `5758086` |
| C.4 Pre-rotation | 🟢 livré | 10 | `9f2e21a` |
| C.5 Tag-then-switch | 🟢 livré | 4 | `18bf440` |
| C.6 Help angle continu | 🟢 livré | 3 | `0c3d9ae` |
| C.7 Action chains | 🟢 V1 + V2 livrés (diag+badge + réaction défensive) | 21 | (commits C.7 V1, V2) |
| F.1 Junk defenses | ⚪ détaillé (V1 box-and-1) | — | — |
| F.2 Press | ⚪ détaillé (V1 half-court) | — | — |
| F.3 FT rebound | 🟢 V1 livré (positions canoniques + F.2 extension rebond) | 11 | — |
| F.4 Foul to give | ⚪ détaillé (V1 diag+badge) | — | — |
| F.5 Late shot clock | ⚪ détaillé (V1 modulation globale) | — | — |

---

## Hors roadmap court terme

### 🟢 Refonte cinématique vectorielle tactique (CVT) — moteur défensif AAA-style

**Statut au 2026-05-22 : LIVRÉE ET ACTIVE.** Les 3 chantiers (Steering
Behaviors, Influence Map, Triangle défensif) sont complets et le moteur
de forces est le pipeline défensif unique (flag legacy supprimé,
sous-étape 1.4b). Raffinements livrés : hystérésis de détection
d'écran off-ball, PAI V1.5 (multi-passes), 4 sliders de tuning
(`steeringSlowingRadius`, `steeringScreenRepelWeight`,
`profileWeightingIntensity`, `paiMaxDeviation`). 1678 tests verts,
`tsc` 0 erreur. Reste : calibrage visuel des sliders par le coach.

**Historique du chantier ci-dessous** (vision initiale, non-régression
exigée sur diagnostics + `defenseOverrides`.

**Motivation** — passer du paradigme "cibles rigides" (Target-Seeking via
`effectiveDefensePositions(state, stepIdx)` qui retourne un `Point(x,y)` par
défenseur) à un paradigme **émergeant** de forces vectorielles pondérées
(type Reynolds steering / NBA 2K). Bénéfices attendus :
- Disparition des oscillations / téléportations résiduelles autour des
  écrans et changements de cible.
- Glissement fluide autour du cercle de clearance au lieu du push-out
  binaire actuel ([docs/PLAYER-CLEARANCE.md](docs/PLAYER-CLEARANCE.md)).
- Comportements émergeants (help, deny, shadow) lisibles par
  superposition de poids au lieu de cascades de couches `if/else`.

**Chantier 1 — Steering Behaviors (forces vectorielles)**
- 🟢 **Sous-étape 1.0 — Infra pure** (livré 2026-05-19) : nouveau module
  [`src/lib/logic/steeringEngine.ts`](src/lib/logic/steeringEngine.ts)
  exposant `interface SteeringForce { direction: Point; weight: number; label: string; }`,
  primitives `seek` / `repel` / `arrive`, accumulateur additif
  `accumulateForces` et intégrateur clampé `integrateForce`. 24 tests
  unitaires, 1545 → **1569 tests verts**. Aucun consommateur câblé,
  zéro impact runtime. Détail : CHANGELOG § Unreleased.
- 🟢 **Sous-étape 1.1** (livré 2026-05-19) : `manDefense.ts` migré en
  double-sortie. 3 variantes forces (`manTargetForces`,
  `carrierDefenderTargetForces`, `offBallStanceTargetForces`)
  émettant des `SteeringForce[]` bit-équivalents aux `Point` legacy.
  Flag `state.useSteeringEngine` (default false). Branche dans
  `defense/baseTargets.ts`. Helper `composeTarget(from, forces) → Point`
  pour ponter avec l'API legacy pendant la transition. **15 nouveaux
  tests** (5 unitaires bit-strict sur grille + 4 intégration pipeline
  complet + 4 helper + 2 cas dégénérés), **1584 tests verts**. Détail :
  CHANGELOG § Unreleased.
- 🟢 **Sous-étape 1.1b** (livré 2026-05-19) : `arrive` remplace
  `seek` dans les 3 variantes (`STEERING_MAN_SLOWING_RADIUS_PX = 12`
  dans `data/physics.ts`). `defenderRef` dans `baseTargets.ts` passe
  à `ctx.prevDefenderPositions[dId]` (vs `defenseInitial` avant) pour
  que l'amortissement fire vs position courante. Premier gain
  comportemental : anti-oscillation près de la cible (déviation max
  théorique = `slowingRadius/4 = 3 px`, zone loin bit-équivalente).
  **4 nouveaux tests** dampening + tolérance intégration ajustée à
  5 px. **1588 tests verts**. Détail : CHANGELOG § Unreleased.
- 🟢 **Sous-étape 1.2** (livré 2026-05-19) : `help.ts` migré.
  `computeHelpForces` wrappe les 3 branches (sag-weakside,
  denial-strongside, active-help) en `arrive` vers la cible legacy.
  Toute la métadonnée préservée (factor/denying/triggered/aim/kind).
  4 tests : bit-équiv loin, métadonnée, helpMode disabled, amorti
  zone proche. **1592 tests verts**.
- 🟡 **Sous-étape 1.3 — infra livrée (2026-05-19)** : module
  [`screens/repelForces.ts`](src/lib/logic/screens/repelForces.ts)
  avec `screenerRepelForce` + `screenersRepelForces`. Falloff
  linéaire dans `SCREEN_REPEL_RADIUS_PX = MIN_PLAYER_CLEARANCE_PX
  + 12`. 9 tests verts. **Non câblée**.
- 🟢 **Sous-étape 1.3b** (livré 2026-05-19, version conservatrice) :
  nouvelle couche
  [`defense/screenRepelLayer.ts`](src/lib/logic/defense/screenRepelLayer.ts)
  branchée 2.1 du pipeline. Affine la trajectoire des défenseurs
  **périphériques** (non carrier/screener/pnrRole) proches d'un
  poseur. Cap 3 px. **Ne remplace pas** le push-out binaire — voir 1.3c.
- 🟢 **Sous-étape 1.3c** (livré 2026-05-19, version compatible) :
  extension de `screenRepelLayer` aux écrans **hors-ballon** (via
  `detectOffBallScreens`). Forces `repel` cumulées des poseurs porteur
  + off-ball, shift borné à 3 px. **Le remplacement complet du
  push-out binaire** par repel est **INCOMPATIBLE** avec la Règle 1bis
  (D1 stuck à quality 100, cf. `docs/SCREEN-ENGINE.md` § Limites
  acceptées). Test garde-fou Règle 1bis ajouté.
- 🟢 **Sous-étape 1.4** (toggle UI livré 2026-05-19) : case à cocher
  dans `DefensePanel` pour comparaison A/B. Remplacée par 1.4b.
- 🟢 **Sous-étape 1.4b** (livré 2026-05-19) : flag `useSteeringEngine`
  **supprimé**, moteur de forces = pipeline défensif unique. Plus de
  double-sortie ni de branche legacy. 4 snapshots J.6 régénérés,
  tests de positions exactes mis à jour, toggle UI retiré. 1664 tests
  verts. **Le Chantier 1 (Steering Behaviors) est complet.**

**Chantier 2 — Influence Map & trajectoires invisibles**
- 🟡 **Infra livrée (2026-05-19)** : module
  [`src/lib/logic/influenceMap.ts`](src/lib/logic/influenceMap.ts) —
  `InfluenceLane`, `buildPassingLanes`, `buildDrivingLane`,
  `signedPerpDistance`, `projectOnSegment`, `interposeForce`,
  `interposeForcesAgainstLanes`. 20 tests. **Non câblée**.
- 🟢 **Sous-étape 2b** (livré 2026-05-19) : nouvelle couche
  [`defense/influenceLayer.ts`](src/lib/logic/defense/influenceLayer.ts)
  branchée 1.3 du pipeline. Shift soft (cap 5 px) vers projection
  porteur↔homme pour les défenseurs "libres". Filtres conservateurs.
  Tolérance équivalence intégrée passée à 12 px. 4 tests dédiés.

**Chantier 3 — Triangle défensif vectoriel dynamique**
- 🟡 **Infra livrée (2026-05-19)** : module
  [`src/lib/logic/defenseTriangle.ts`](src/lib/logic/defenseTriangle.ts) —
  `triangleAngleDeg`, `profileWeightMultipliers`, `isPassShadowed`,
  `passShadowsByDefender`. 21 tests. **Non câblée**.
- 🟢 **Sous-étape 3b** (livré 2026-05-19) : `isPassShadowed`
  propagé dans `DefenderTarget` + `ComputedDefender`. Calcul via
  `passShadowsByDefender` en fin de `baseTargets` quand flag on.
  Plumbed dans les 3 sites de mapping de `speedConstraint`. Aucun
  effet sur les positions — purement additif.
- 🟢 **Sous-étape 3c** (livré 2026-05-19) : pondération distance
  par profil offensif. `dist = baseDist / profileWeightMultipliers(profile).manWeight`.
  Shooter → close out tighter, slasher → sag franc. Bit-équivalent
  quand profil undefined ou flag off.

**Contraintes d'implémentation**
- TypeScript pur, déterministe, sans dépendance React, isolé dans
  `src/lib/logic/`. Aucune mutation des états d'entrée.
- **Rétrocompat** : la sortie du pipeline doit continuer d'alimenter
  `ComputedDefense` / `ComputedDefender` (anneaux `pnrRole`, `late`,
  `closingOut` préservés).
- La position finale issue de l'intégration des forces doit passer
  par le **solveur unifié `constraintSolver.ts`** pour la passe de
  clearance anti-overlap (Règle 1, [docs/PLAYER-CLEARANCE.md](docs/PLAYER-CLEARANCE.md)).
- Les `defenseOverrides` (placements manuels utilisateur) restent
  prioritaires et court-circuitent le pipeline de forces.
- Tests garde-fous : tous les `screens*` + `overlap*` + `userJson*` +
  `screenLab*` doivent rester verts à chaque sous-étape.

**Plan de fichiers prévisionnel**
- `src/lib/logic/steeringEngine.ts` — primitives `seek` / `repel` / `arrive`,
  accumulateur `accumulateForces(forces) → Point`.
- `src/lib/logic/influenceMap.ts` — segments passe + pénétration,
  distance perpendiculaire signée.
- `src/lib/logic/defenseTriangle.ts` — angle θ, pondération
  profil-dépendante, détection `isPassShadowed`.
- Refacto incrémentale des couches existantes
  (`defense/baseTargets.ts`, `defense/pnrLayer.ts`, `defense/helpLayer.ts`)
  pour émettre des `SteeringForce[]` consommés par
  `defense/speedConstraint.ts` → `constraintSolver.ts`.

**Pré-requis** : relire impérativement
[docs/SCREEN-ENGINE.md](docs/SCREEN-ENGINE.md) (règles impératives écran),
[docs/logique-defensive.md](docs/logique-defensive.md) (pipeline actuel) et
[docs/GAME-ENGINE.md](docs/GAME-ENGINE.md) (cartographie moteur) avant
toute ouverture de PR sur ce chantier.

---

### ✅ Réalisme physique et déplacements avancés (V1 complète)

Pilier physique opt-in : **15 items livrés sur 15**. Sections 1, 2, 3, 4, 5 toutes vertes. Tous les comportements nouveaux derrière des flags `AppState` (default false → comportement legacy préservé). Pistes V2 notées item par item.

> 🟢 **Cinématique fine #1 — preset réaliste par défaut (2026-06-02).** Le
> sous-groupe **cinématique déterministe** (accélération, momentum, velocity
> profile par courbure, footwork + reaction/plant-and-cut) n'est plus opt-in :
> il est **actif par défaut** via `realismProfile: 'realistic'` (champ `AppState`
> + resolver pur `resolveRealismFlags`, source de vérité unique). Toggle UI
> Réaliste/Tactique, migration des scénarios à l'ouverture, escape-hatch legacy
> par-flag. RNG / contact / transition restent opt-in. Suite 2045 verte. Cf.
> [spec](docs/superpowers/specs/2026-06-02-realism-profile-default-design.md) ·
> [plan](docs/superpowers/plans/2026-06-02-realism-profile-default.md).

> 🟠 **Défense vivante / drive 2a — `driveContainment` (2026-06-03).** Sur un
> drive, le défenseur du porteur **glisse couper la ligne** s'il gagne la course
> au point de contain (cœur pur `evaluateDriveContainment`, approche A : ETA
> porteur vs défenseur → `beaten`/`contained`/`walled`), avec diagnostic coach
> « drive contenu / ligne ouverte ». Opt-in `driveContainmentEnabled`, tracé
> dessiné intact. Le cœur est agnostique du contexte → **2b (à faire)** câblera
> le match-sim (issue du drive : pull-up / kick-out / strip au lieu du tir RNG à
> l'arrivée). Suite 2063 verte. Cf.
> [spec](docs/superpowers/specs/2026-06-03-drive-containment-design.md) ·
> [plan](docs/superpowers/plans/2026-06-03-drive-containment.md).

#### 1. Cinématique des déplacements et modèle de vitesse
- 🟢 **Vitesse Réelle vs Vitesse Tactique (Mode Sprint NBA)** — livré `b92d59d` via `realSpeedMode` : timeline 0.5s au lieu de 2s pour simuler buzzer-beaters/coast-to-coast.
- 🟢 **Accélération et décélération non-linéaires en attaque** — livré `b92d59d` via `attackerAccelerationEnabled` + slider 3–12 m/s² dans `velocityProfile.ts` (forward/backward pass).
- 🟢 **Inertie et momentum offensif (dérive centrifuge)** — livré `b92d59d` via `attackerMomentumEnabled` + slider 0.05–0.40 dans `playbackTrajectory.ts`.
- 🟢 **Sprint Boost contextuel offensif** — livré `b92d59d` via flag `sprint?: boolean` sur annotations cut/dribble (mouvement condensé sur 60 % du step).

#### 2. Physique du ballon, passes et tirs
- 🟢 **Interceptions actives physiques** — livré `b92d59d` via `activeInterceptionsEnabled` : cône 90°, z ≤ 55 px, 12 % proba tick-par-tick.
- 🟢 **Physique du tir et rebonds 3D non-déterministes** — livré `b92d59d` via `physicsReboundsEnabled` : gravité, restitution arceau/planche/sol, rebondeur au plus proche du landing spot.
- 🟢 **Physique du dribble** — livré `b92d59d` via `dribblePhysicsEnabled` : oscillations sinusoïdales liées à la vitesse du porteur + ombre dynamique du ballon.

#### 3. Biomécanique et motricité (Footwork)
- 🟢 **Modélisation des appuis (Course vs Pas chassés)** — livré `b92d59d` via `footworkRulesEnabled` : -25 % vitesse latérale, -40 % vitesse course arrière.
- 🟢 **Temps de réaction lié à l'attention visuelle** — livré `b92d59d` : latence 200 ms si trigger (passe/cut) hors du cône de regard (>60°).
- 🟢 **Pivots et changements de facing réalistes (plant-and-cut)** — livré `b92d59d` : 150–300 ms d'arrêt sur pivot > 90°.

#### 4. Physique des collisions et contacts ✅
- 🟢 **Stiffness & Impact (Physique de l'écran)** — livré `047de9e` via `screenStiffnessEnabled` + slider 1.0–3.0 : amplifie la pénalité `screenContactPenalty` en phase impact/recover. Cible D1 préservée (Rule 1bis).
- 🟢 **Luttes de force (Box-out & Post-up)** — livré `d785528` via `physicalContactBattlesEnabled` : poussée vectorielle défenseur→attaquant à l'opposé du panier pendant la phase box-out, réaction Newton ×0.3 sur le défenseur. Filet `pushOutOfMany` final pour Rule 1.
- 🟢 **CVT offensif (Pathfinding unifié)** — livré `6660454` via `cvtOffensiveEnabled` : remplace `curveAroundObstacle` (Bezier) par accumulateur `repel` (radius 52 px, weight 18, maxStep 6 px) via `steeringEngine`.

#### 5. Gestion du temps et transitions ✅
- 🟢 **Timeline multi-pistes désynchronisée** — livré incrémentalement avant la roadmap physique (Étape 10 + B.4) puis consolidé. Annotations portent `tStart`/`tEnd` (fractions) et `tStartAbs`/`tEndAbs` (secondes absolues). Moteur `playbackTrajectory` fait du lookback `[stepIdx, stepIdx+1]` → supporte `tStart < 0` et `tEnd > 1` (annotations qui débordent sur le step adjacent). Transform `setAnnotationTiming` autorise `[-1, 2]` selon steps présents. UI [MultiTrackTimeline](src/components/MultiTrackTimeline.tsx) : drag des poignées laisse ratio sortir `[-1, 2]`, segment rendu en `overflow: visible` avec mise en évidence (`boxShadow`) quand l'annotation déborde. Couverture tests : `b4AnnotationTiming` (intra-step async), `playbackTrajectory` (cross-step 1 actor), `timelineMultiTrack` (matrice combinée 3 acteurs + overflow + indépendance).
   - V2 possible : snap-to-other-annotation à l'édition (confort UX), tests rendu MultiTrackTimeline.
- 🟢 **Repli défensif (transition)** — livré `3fabd8c` via `defensiveTransitionEnabled` : pendant `TRANSITION_PAUSE_MS`, les ex-attaquants amorcent leur retraite vers leur panier OWN quand la possession va basculer (shot-made / turnover / rebond défensif). 3 px/tick, freeze à <80 px du panier, filet Rule 1. La partie "surveillance du ballon" via gaze orientation reste à faire en V2.


