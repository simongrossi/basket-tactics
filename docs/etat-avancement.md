# État d'avancement du projet

> Vue consolidée de **ce qui est fait**, **ce qui est en cours**, et **ce qui reste à faire**, pour ne rien oublier entre deux sessions de travail.
>
> Mise à jour : **2026-05-09**.
>
> Pour la roadmap exhaustive des actions FIBA, voir [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md).

---

## ✅ Fait (livré sur `main`)

### Engine & moteur
- **Défense individuelle** complète (man-to-man, help, denial, ICE, lateral steps).
- **Défense de zone** : 2-3, 3-2, 1-3-1, 2-1-2, match-up — paramétrables (pression, rotation, vertical offset, trap coin, extension 3pts).
- **Mode édition zones** : override par défenseur, presets, reset.
- **Pipeline de simulation** Monte Carlo (best action, threats, pass lanes).
- **Coach diagnostics** : couverture propre / fuites / aide en place / corners tenus.
- **Anti-téléport** : interpolation continue des positions inter-steps.

### Mode scénario (Phase 1+2)
- **Tier 1 offensives** : pick-and-roll, pick-and-pop, hand-off (DHO), back-screen, away-screen, flare, pin-down, cross-screen, hammer, drive, cut, pass, screen, shot. Empilables → génération auto de `Step[]`.
- **Sélecteur d'action** en modale popup avec filtre texte (`AddActionModal`).
- **Carte d'action compact/expand** dans `ScenarioPanel`.
- **Réordonnement** monter/descendre, suppression, libellé libre par action.

### Phase 3 — défense scriptable (MVP)
- `ScriptedAction` est une **union discriminée** (`kind: 'offensive' | 'defensive'`).
- **4 actions défensives MVP** : `help-and-recover`, `pre-switch`, `trap`, `tag`.
- Modules : `applyDirective.ts`, `defensiveCompilation.ts`, `defensiveDefaults.ts`, `defensiveActionsCatalog.ts`.
- **Couvertures couplées** (attachées à une action offensive via `parentActionId`) avec defaults inférés du contexte.
- **Actions défensives libres** (`affectedSteps` explicite) avec section dédiée dans `ScenarioPanel`.
- **Toggle global** `defenseScriptedDirectivesEnabled` (default true) dans `DefensePanel`.
- Tests d'intégration : `applyDirective.test.ts`, `defenseScriptedIntegration.test.ts`, `defensiveCompilation.test.ts`, `defensiveDefaults.test.ts`, `defensiveActionsCatalog.test.ts`.

### UI
- Layout 3 colonnes responsive avec `presentMode` (plein écran) — Échap pour quitter.
- **`FloatingActionsMenu`** : bouton `⋯` flottant en haut à droite du terrain → menu avec 5 actions globales (plein écran, playbook PDF, exporter/importer JSON, reset). Reste visible en plein écran.
- **Scroll vertical indépendant** sur les colonnes latérales (overflow-y auto).
- Bibliothèque de systèmes : 7 templates classiques + sauvegarde locale + import/export par dossier.
- Playbook PDF (export multi-pages avec annotations).
- Timeline (lecture, scrub, pause/play, vitesse).
- Métriques en bas : raquette, gap max, écart moy, en retard, aide, passes, meilleure action.

---

## 🚧 En cours (spec ou WIP non mergé)

### Scénario en popup plein écran
- **Spec** : [`docs/superpowers/specs/2026-05-09-scenario-editor-modal-design.md`](./superpowers/specs/2026-05-09-scenario-editor-modal-design.md) ✅
- **Plan d'implémentation** : ❌ pas écrit
- **Implémentation** : ❌ pas commencée
- **Idée** : alléger drastiquement la colonne gauche en réduisant `ScenarioPanel` à un résumé minimal (liste des libellés + bouton ouvrir) et déplacer toute l'édition (formulaires, couvertures, défense libre) dans une modale `ScenarioEditorModal`.

### Multi-format de jeu (2x2 / 3x3 / 4x4 / 5x5)
- **Branche** : `wip/player-count` (commit `3e92420`, poussée sur GitHub, **pas mergée**)
- **État** : 17 fichiers touchés, nouveau type `PlayerCount`, nouveau module `src/lib/logic/players.ts`, nouveau champ `AppState.playerCount`, propagation à travers engine + composants. **Travail non terminé.**
- **À reprendre quand** : on décide d'attaquer le multi-format. Le commit WIP est intentionnellement isolé pour ne pas bloquer `main`.

---

## 📋 À faire (planifié, pas démarré)

### Mode scénario — Phase 2 (Tier 2 offensives)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 1. Toutes les variantes d'écrans non couvertes par le Tier 1 :
- **Écrans porteur** : angle/slot, butt, drag, double drag, flat, ghost, hostage/Gortat, inverted, logo/side, Spain/stack, step-up, twist, wedge.
- **Écrans non-porteur** : ATO horns, chicken (Iverson + flare), elevator, floppy, hammer wing, Iverson, rip, screen-the-screener (STS), shuffle, single-double, staggered, UCLA, wide pin-down, zipper.
- **Cuts/pénétration variantes** : back-cut, basket-cut, baseline drive variantes, curl, fade, flex cut, give-and-go, L-cut, V-cut, shallow cut, slip cut, spot up.

### Phase 3 — défense scriptable (au-delà du MVP)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 2. Actions défensives à ajouter :
- **Couvertures PnR** non couvertes : drop coverage, soft hedge, switch (vrai switch défensif, pas pre-switch), ICE/blue, weak, X-out.
- **Actions de pression** : closeout, double-team (différent de trap), stunt, dig, gap.
- **Aide off-ball** : jam-cutter, lock-and-trail, rotation X (rotation triggérée par drive), shell rotation.

### Phase 4 — entrées et sets pré-formattés
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 3. Génère 1 step de positionnement initial :
- Box, horns, 4-out 1-in, 5-out, 1-4 high/low, double stack, etc.

### Backlog UI / UX
- Refonte `ScenarioPanel` en popup plein écran (cf "En cours")
- **Popup timeline multi-pistes par joueur** : inspiré FastDraw — une popup affichant une timeline horizontale avec une piste par joueur (5 attaquants + 5 défenseurs), chaque piste montrant les segments de mouvement / passes / écrans avec leur durée précise. Permettrait au coach de voir d'un coup d'œil le découpage temporel de chaque joueur, qui bouge quand, et le synchronisme entre actions. À placer en plus de la timeline globale actuelle.
- Import multi-fichiers JSON (drag & drop)
- Édition inline du libellé d'étape sans cliquer (focus auto à la création)
- Annotations textuelles libres sur le terrain (cf `Annotations.tsx`)
- Mode "présentation projetée" (police plus grosse, contrastes augmentés)
- Raccourcis clavier pour ouvrir le menu flottant (cf [`keyboard-shortcuts.md`](./keyboard-shortcuts.md))

### Backlog tests / qualité
- Vérifier la couverture de `applyDirective` pour `pre-switch` avec swapWith manquant
- Tests E2E (Playwright ?) sur le flow complet : créer scénario → simuler → exporter PDF
- Configurer `eslint` correctement (actuellement `npm run lint` échoue — config manquante)
- Ajouter `.claude/` au `.gitignore` (worktrees Claude pollue le `git status`)

### Documentation
- Mettre à jour `docs/architecture.md` avec le multi-format quand `wip/player-count` sera mergée
- Documenter `applyDirective` en détail (pseudo-code par type d'action)
- Tutoriel "premier scénario" pour onboarder un nouveau coach utilisateur

---

## Conventions de mise à jour

Quand une feature passe de "en cours" à "fait", la **déplacer** dans la section ✅ avec un résumé court.
Quand une nouvelle idée émerge, l'**ajouter** à 📋 avec assez de contexte pour qu'on s'y retrouve dans 6 mois.
Mettre à jour la **date** en tête du doc à chaque modif.
