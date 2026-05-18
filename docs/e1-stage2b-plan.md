# E.1 V2 stage 2b — Refacto 2-way : plan d'architecture

> Document de cadrage à valider avant tout code. ROADMAP : Phase E.1
> stage 2b. Estimation initiale 2-4j.

---

## TL;DR

Stage 2b vise à permettre l'**édition de scénarios où l'équipe adverse
attaque et nos défenseurs (home) jouent en défense**. Aujourd'hui le
mode édition est strictement *one-way* (O attaque toujours, D défend
toujours). Le mode match (game loop) gère déjà `attackingTeam: 'home' |
'away'` mais c'est un **stub visuel** (rendu sprites rouges), pas un
vrai 2-way moteur.

**3 niveaux possibles**, du plus simple au plus profond. **Je recommande
la V1 ultra-mini** pour ce projet : zéro risque, 4-6h, complète
proprement A11 V2 (rebond défensif → transition adverse).

---

## 🔍 État actuel

### Ce qui existe déjà (game loop, mode match)
- `MatchState.attackingTeam: 'home' | 'away'`
- `MatchState.awayBallPos: Point | null` (ballon adverse pendant phase away)
- `MatchState.awayPlayerPositions: Record<DefenderId, Point> | null` —
  positions adverses calculées miroir vertical, **stockées sous des
  IDs défenseur (D1-D5) mais sémantique inversée**.
- Rendu visuel : sprites rouges A1-A5 dans CourtView (l.451-477).
- Bascule auto sur rebond défensif (game loop).
- Banner "🔄 POSSESSION ADVERSE".

### Ce qui n'existe PAS
- `AppState.currentlyAttackingTeam` — pas de notion d'équipe attaquante
  en mode édition.
- `Step.attackingTeam` — pas de marquage per-step.
- Matchups inversés (= D défenseur home jouant ATTAQUE contre Away).
- Moteur défensif côté home pendant phase away.
- Setter `convertStepToAwayPossession` pour générer un step "transition".
- Diag coach spécifique.

### Le gap critique
A11 V2 ext3 vient de poser `Step.outletPassPending = true` sur les
rebonds défensifs **MAIS il n'y a pas de moyen propre de continuer le
scénario en mode away**. Le coach doit composer à la main avec des
positions inversées.

---

## 🎯 3 options architecturales

### Option A — V1 ultra-mini (4-6h) ⭐ RECOMMANDÉE

**Sémantique conservée** : O = ceux qui attaquent ce step, D = ceux qui
défendent. Peu importe que ce soit nominalement "home" ou "away" dans
la storyline.

**Ajouts** :
1. `Step.viewSide?: 'home' | 'away'` — flag d'affichage uniquement.
   Default 'home' (rétrocompat totale).
2. Rendu visuel : sur step `viewSide === 'away'`, les O sont colorés
   en rouge (style adverse) et les D en bleu home (nos défenseurs).
3. Setter `convertStepToAwayPossession(s)` qui inverse les positions
   verticalement (mirror autour de y=540) et marque le step
   `viewSide: 'away'`. Pose aussi un label "Transition adverse".
4. Bouton UI dans StepsPanel : "↩ Convertir en possession adverse".
5. Auto-déclenchement : sur step avec `outletPassPending: true`,
   bouton "🔄 Étape transition adverse" qui appelle directement le
   setter.
6. Diag coach `awayPossessionRule` qui flag les steps away pour
   indiquer le contexte au coach.

**Avantages** :
- Le moteur défensif tourne **tel quel** (sémantique O/D inchangée)
- Zéro risque Règle 1bis (Read SCREEN-ENGINE.md → on ne touche pas
  frameResolver, screens/, defense/*.ts)
- Aucune migration de données existantes
- Rétrocompat 100%

**Inconvénients** :
- Pas de "vrai" 2-way avec matchups identitaires inversés (D1 home
  ne reste pas le même joueur entre phases home et away dans la
  storyline). C'est implicite.
- Le coach doit composer manuellement les scénarios complexes
  d'enchaînement home → away → home.

**Estimation** : 4-6h en 3 commits :
- Phase 1 : types + setter `convertStepToAwayPossession` + tests (2h)
- Phase 2 : UI bouton dans StepsPanel + rendu couleurs CourtView (1-2h)
- Phase 3 : diag coach + docs (1h)

### Option B — V1 moyen "team-aware soft" (1-2j) 🟡

Tout V1 ultra-mini, **plus** :
- `Step.attackerTeamLabel?: { O1: 'home' | 'away'; ... }` — identité
  par joueur. Permet de tracer "D1 home a été ce joueur tout au long
  de la possession" même quand il devient temporairement "attaquant"
  dans une phase de transition.
- Helper `mapStepToTeamView(step)` qui renvoie les positions remappées.
- UI : icônes différentes pour les joueurs home vs away.
- Bouton "↩ Permuter possession" qui fait un swap propre des rôles.

**Avantages** :
- Identité des joueurs préservée à travers les transitions.
- Permet l'analyse "comment D5 home s'est comporté en attaque puis en
  défense ?"

**Inconvénients** :
- Beaucoup plus de code UI + helpers.
- Risque modéré sur les diagnostics coach qui assument O = attaque.
- Pas réellement nécessaire si A11 V2 est l'unique cas d'usage.

**Estimation** : 1-2j en 5-6 commits.

### Option C — V1 complet ROADMAP (4-6j) 🔴

Refacto profond comme décrit dans le ROADMAP :
- `AppState.currentlyAttackingTeam: 'home' | 'away'` natif
- Toutes les fonctions de l'engine acceptent un `team` ou détectent via le state
- Matchups inversés en mémoire selon le team
- Engine défensif côté home pendant phase away (= D devient attaquant
  contre 5 nouveaux défenseurs away simulés)
- Hoop ciblé selon team (déjà existant via `attackingDirection`)
- Nouvelle UI complète pour la bascule
- Migration des données existantes

**Avantages** :
- Vrai 2-way complet, scénarios full match possibles
- Identité des joueurs préservée
- Le mode édition = le mode live

**Inconvénients ÉNORMES** :
- **Touche le moteur d'écran** (Règle 1bis CLAUDE.md, 13 fichiers de
  tests sensibles).
- Risque de régression sur **1416 tests existants**.
- Beaucoup de UI à reconstruire.
- 4-6 jours minimum, probablement plus avec les surprises de migration.

**Estimation** : 4-6j, possiblement plus.

---

## 🟢 Pourquoi je recommande l'Option A

1. **Le besoin réel actuel** : compléter A11 V2 ext3
   (`outletPassPending`) avec un setter qui génère le step suivant
   "transition adverse". C'est ça que le coach veut concrètement.

2. **Le scope vraiment utile** : Option A couvre 80% des cas
   pédagogiques (montrer "tir manqué → rebond déf → transition
   adverse" en 3-4 steps). Les 20% restants (full match avec identités
   joueurs préservées) sont du nice-to-have.

3. **Zéro risque Règle 1bis** : Option A ne touche pas le moteur
   défensif ni le moteur d'écran. On reste sur le pattern qu'on connaît
   (Step.* champs optionnels + setter + UI conditionnelle).

4. **Cohérence avec ce qu'on vient de livrer** : A11 V1 + V2 ont posé
   le pattern "setter génère un step avec defenseOverrides + label".
   Option A est l'extension naturelle.

5. **Rendements décroissants évidents** : Option B/C demandent 5-10×
   plus de travail pour un gain marginal sur les usages réels.

---

## ⚙ Plan détaillé Option A

### Phase 1 — Types + setter (~2h, 1 commit)

**Types** :
- `Step.viewSide?: 'home' | 'away'` (default 'home', rétrocompat).

**Setter** : `stepTransforms.convertStepToAwayPossession(s, options?)`
- Pré-requis : step actif doit avoir `outletPassPending: true` (= rebond
  défensif récent) OU être en mode édition libre.
- Inverse les positions verticalement autour de y=540 (= mirror around
  half-court). Les attaquants (O) deviennent les nouveaux défenseurs
  away simulés mais on garde la sémantique O/D pour le moteur.
- Marque `Step.viewSide = 'away'`.
- Label automatique "Transition adverse".

**Helper pur** : `awayPossessionSetup.ts::buildAwayPossessionSetup(state, sourceStepIdx)`
qui produit les positions inversées + matchups conservés.

**Tests** : 5-6 (setup miroir vertical, viewSide posé, label,
rétrocompat steps sans viewSide).

### Phase 2 — UI (~1-2h, 1 commit)

**StepsPanel** :
- Bouton "↩ Possession adverse" toujours visible sur step actif
  (libre).
- Bouton "🔄 Étape transition adverse" sur step avec
  `outletPassPending: true` (= flux naturel post-rebond défensif).

**CourtView** :
- Sur step `viewSide === 'away'`, modifier les couleurs :
  - O sprites en **rouge** (= adversaires perspective home)
  - D sprites en bleu home (= nos défenseurs)
  - Banner discret "🔄 PHASE ADVERSE" (cohérent avec le banner game
    loop existant).

### Phase 3 — Diag coach + docs (~1h, 1 commit)

**Règle** : `coachDiagnostics/rules/awayPossession.ts`
- Émet un diag 'info' tag `away-possession` sur les steps `viewSide === 'away'`.
- Message : "Phase adverse — les rôles offensif/défensif sont visuellement
  inversés. Les D représentent vos joueurs home, les O les adversaires."

**Docs** :
- ROADMAP : E.1 V2 stage 2b 🟢 V1 livré.
- CHANGELOG [0.15.0].
- etat-avancement / todo-priorities / IDEAS.

---

## 🛡 Garde-fous

### Sans risque
- Pas de modification du moteur défensif (`computeDefenseTargets`,
  `effectiveDefensePositions`, `frameResolver`).
- Pas de migration des données existantes.
- Default `viewSide = 'home'` → 100% des scénarios existants inchangés.

### Risques à surveiller
1. **R1 — Cohérence A11 V2 outletPassPending** : le setter doit
   correctement consommer ce flag pour ne pas le repasser sur les
   steps suivants.
2. **R2 — Diagnostics coach existants** : certains diags supposent
   "O = nos joueurs". Sur step away, le message peut être trompeur
   ("D1 mal positionné" alors que D1 est notre joueur en attaque).
   → Mitigation V1 : ajouter un warning global dans les diags quand
   `viewSide === 'away'`, à raffiner si confusion.

### Checklist pré-commit
- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run` (suite complète)
- [ ] Tests dédiés (4-6 par phase)
- [ ] Inspection manuelle CourtView : couleurs adverses correctes,
      label visible, transition propre depuis A11 V2 rebond défensif.

---

## ❓ Décisions à valider

1. **Option A / B / C** ? → Recommandation : **A**.
2. **Estimation 4-6h OK** ?
3. **Couleurs** : O rouge / D bleu en mode away. Cohérent avec la game
   loop. OK ?
4. **Inversion verticale** : miroir autour de y=540. C'est la même
   constante que la game loop. OK ?
5. **Bouton UI** : sur step avec `outletPassPending` ET en libre, ou
   uniquement guidé par outletPassPending pour V1 ? Recommandation :
   les deux (libre + guidé).
6. **Identité joueurs** (Option B) : V2 plus tard si besoin remonté ?

Une fois validé, je lance Phase 1.
