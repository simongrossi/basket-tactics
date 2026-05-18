# A11 — Box-out / rebond demi-jeu : plan d'architecture V1

> Document de cadrage à valider avant tout code. Référence ROADMAP :
> Phase E ligne ⚪ A11 (estimation 5-8j).

---

## TL;DR

**Réestimation** : ~2-3 jours (pas 5-8) parce que **beaucoup existe déjà**
côté mode match (game loop autonome) :
- `computeRebound()` modèle probabiliste complet
- `boxOutTargets` + animation live
- `buildFreeThrowReboundSetup()` pour le post-LF
- Phase E.1 V2 stage 1+2a livré (ballon adverse + adversaires miroir)
- `boxOutCheckRule` diag coach

**A11 V1 = exposer en mode édition tactique** ce qui existe déjà en mode
live, sans refonte du moteur défensif. Pattern identique aux livraisons
B.1 / F.4 / F.5 / G.2 d'hier (nouveaux champs sur Step + couche
défensive opt-in).

---

## 🎯 Décisions architecturales

### D1 — Où placer le tir ?

| Option | Pour | Contre |
|---|---|---|
| **A** nouveau `AnnotationType: 'shoot'` | Cohérent avec pass/cut/dribble/screen | Doit modifier l'union, casse les `switch` exhaustifs |
| **B** nouveau `Step.kind: 'play' \| 'shot' \| 'rebound'` | Sémantique propre, le rebond est un step entier | Refonte du type Step, impacte `compileScenario`, UI |
| **C** champs optionnels sur Step : `shotOutcome?`, `shotPos?` | Pattern déjà utilisé (B.1 duration, F.4 clockSeconds, F.5 shotClockRemaining), minimal | Sémantique moins propre |

**Choix V1 : C**. Cohérent avec ce qu'on a fait hier (16 commits de
mode "champs optionnels sur Step"). Migration zéro, scopable.

### D2 — Génération de la phase rebond

| Option | Pour | Contre |
|---|---|---|
| **A** setter `addShotReboundStep(outcome)` auto | Pattern F.2 (`addFreeThrowReboundStep`) | Génère un step "rebond" qui peut être modifié à la main ensuite |
| **B** couche `boxOutLayer` modifie positions du step suivant | Plus dynamique | Touche le pipeline défensif (Règle 1bis) |
| **C** setup statique pur, user compose à la main | Zéro risque | Pas d'aide utilisateur |

**Choix V1 : A** (setter). Pattern éprouvé F.2, zéro modification du
pipeline défensif (donc zéro risque Règle 1bis). Le step rebond généré
reste éditable.

### D3 — Modèle de rebond

| Option | Pour | Contre |
|---|---|---|
| **A** Réutiliser `computeRebound()` de `match/rebound.ts` | Code déjà testé, calibré | Couplage entre modes match et édition |
| **B** Nouveau modèle dédié édition | Indépendance | Duplique le code |

**Choix V1 : A**. `computeRebound()` est pur (pas de side-effect game
loop). On l'importe directement. Si besoin de variantes (ex: désactiver
random pour reproductibilité tests), on ajoute des params optionnels.

### D4 — Box-out auto

Quand le coach saisit `shotOutcome: 'missed'` sur le step N, le setter
`addShotReboundStep` génère le step N+1 avec :

- **Positions attaquants** : conservées (légères variations selon profil ?)
- **Positions défenseurs** : recalculées en mode **box-out**
  = chaque défenseur placé entre son matched et le panier, à
  `BOX_OUT_OFFSET_PX` du panier (réutilise les constantes E.1 V2)
- **Rebondeur** : déterminé par `computeRebound()` avec graine
  reproductible (option `seed?: number` dans le setter, pour stabilité
  tests + UI)
- **ballCarrier** : le rebondeur si attaquant, sinon premier défenseur
  (qui devient porteur du step transition adverse)

### D5 — Made vs Missed

- **`shotOutcome: 'made'`** : pas de step rebond généré. Possibilité
  d'enchaîner directement sur un setter `addInboundStep` (BLOB / SLOB)
  pour la transition. V1 minimal : le coach gère manuellement.
- **`shotOutcome: 'missed'`** : génère step de rebond.
- **`shotOutcome: 'blocked'`** : reporté V2 (geste défensif spécifique).

---

## 🏗 Plan d'implémentation par phase

### Phase 1 — Types + UI saisie (~3-4h)

- Types `Step.shotOutcome?: 'made' | 'missed'` (V1 sans 'blocked'),
  `Step.shotPos?: Point` (position du shooter au moment du tir, default
  = position du carrier au step actuel).
- Helper `getShotPosForStep(step) → Point | null` (pur).
- UI dans **StepsPanel** : section "tir" sur step actif quand
  porteur identifié. 3 boutons : "tir réussi", "tir manqué", "annuler tir".
- Pas de couche moteur dans cette phase. Pas de tests d'invariant
  positionnel.
- Tests : 3-4 sur les transforms + helper.

### Phase 2 — Setter `addShotReboundStep` (~4-6h)

- Module `src/lib/logic/shotReboundSetup.ts` (nouveau, pur).
  - `buildShotReboundSetup(state, stepIdx, options): ReboundSetup`
  - Réutilise `computeRebound` de `match/rebound.ts`
  - Réutilise constantes E.1 V2 (BOX_OUT_OFFSET_PX, etc.)
- Transform `addShotReboundStep(s, idx, options?)` dans
  `stepTransforms.ts` qui ajoute un step en `idx+1` avec les positions
  calculées.
- UI : bouton "Étape rebond auto" dans StepsPanel après "tir manqué"
  (visible uniquement si step actif a `shotOutcome: 'missed'`).
- Tests : 5-7 sur le builder + transform (positions box-out, rebondeur
  identifié, possession bascule sur rebond défensif, seed reproductible).

### Phase 3 — Diagnostic coach étendu (~2-3h)

- Étendre `boxOutCheckRule` existant pour détecter le pattern
  "step.shotOutcome=missed → step suivant = rebond". Aujourd'hui détecte
  via label heuristique. Avec A11, détection robuste via le champ.
- Optionnel : nouvelle règle `shotReboundOpportunityRule` qui flag les
  rebonds offensifs probables (≥2 attaquants proches du panier après
  tir manqué).
- Tests : 3-4.

### Phase 4 — Documentation + ROADMAP (~1h)

- Mettre à jour [docs/etat-avancement.md](etat-avancement.md) + [docs/concepts-basket.md](concepts-basket.md).
- ROADMAP : A11 V1 livré, V2 (blocked + reset shot clock + outlet pass
  auto) reportée.
- CHANGELOG : [0.13.0] dédié.

---

## 🟢 Ce qui est SANS RISQUE

### A. Pipeline défensif intact

`addShotReboundStep` est un setter qui **génère un step entier**, pas
une couche moteur. Le step généré passe ensuite par `computeDefenseTargets`
normalement (avec `defenseOverrides` si on en pose). **Aucune
modification de** `frameResolver`, `screens/`, `defense/*Layer.ts`.

### B. computeRebound déjà testé

Le modèle de rebond vient de `src/lib/logic/match/rebound.ts` qui est
livré (E.1 V2 stage 1+2a) et testé. On l'importe tel quel.

### C. Pattern setter éprouvé

`addFreeThrowReboundStep` (F.2) est exactement le même pattern :
- Setter dans `stepTransforms.ts`
- Builder pur dans un module dédié
- Tests sur le builder + transform
- UI bouton dans StepsPanel

**A11 = F.2 généralisé** aux tirs live (pas seulement LF).

### D. Règle 1bis CLAUDE.md non concernée

A11 V1 NE TOUCHE PAS :
- `screens/`
- `frameResolver.ts`
- `defense/baseTargets.ts`
- `defense/pnrLayer.ts`
- `playbackTrajectory.ts`

Donc la checklist Règle 1bis (tests `screens*` + `overlap*` + `userJson*`
+ `screenLab*`) ne s'applique pas. Risque maîtrisé.

### E. Réversible

Si A11 V1 produit des steps de rebond gênants, le coach peut
simplement les supprimer (les steps standards `deleteStep` marchent).
Pas d'effet permanent dans l'AppState.

---

## 🔴 Risques identifiés

### R1 — Cohérence avec ScriptedAction `shoot` existante

Le `scriptedActionsCatalog.ts` a déjà une action `shoot` (utilisée par
les générateurs de scénario). Si on ajoute `Step.shotOutcome`, il faut
décider : est-ce que la ScriptedAction `shoot` pose `shotOutcome` ou
non ?

**Mitigation V1** : ne PAS modifier la ScriptedAction `shoot`. Le coach
appose `shotOutcome` manuellement via UI. Si on veut le câbler en V2,
on le fait à ce moment.

### R2 — Mode live VS mode édition divergent

Le mode match (gameLoop) modélise déjà tout cela mais sans exposer à
l'AppState. Si on stocke `shotOutcome` sur Step en mode édition mais
que la game loop ne le lit pas, on a 2 sources de vérité.

**Mitigation V1** : V1 mode édition uniquement. Documenter clairement
que la game loop reste autonome. V2 pourra unifier.

### R3 — Calibration des positions box-out

Les constantes `BOX_OUT_OFFSET_PX` etc. sont calibrées pour l'animation
live. En mode édition statique, sans animation, ces positions peuvent
paraître figées ou bizarres. À tester sur 3-4 templates.

**Mitigation V1** : utiliser les MÊMES constantes que la game loop pour
cohérence. Si retour utilisateur "c'est moche", ajuster en V1.5.

### R4 — Reproductibilité tests

`computeRebound` utilise un RNG. Pour les tests, il faut une graine
reproductible.

**Mitigation V1** : le setter accepte `options.seed?: number`. En
production (UI), graine = Date.now() ou random natif. En tests, graine
fixe.

### R5 — Rebond offensif → possession continue, MAIS step suivant ?

Si rebond offensif, le step de rebond généré met le rebondeur comme
porteur. Mais que faire ensuite ? Le coach doit pouvoir continuer le
scénario (la 2e chance offensive).

**Mitigation V1** : le step rebond est juste un step normal après. Le
coach peut ajouter des annotations dessus, drag les joueurs, etc. Pas
d'auto-magie au-delà du step initial.

---

## 🛡 Checklist pré-commit (par phase)

Pas de Règle 1bis (on ne touche pas le moteur d'écran). Standards :

1. [ ] `npx tsc --noEmit` propre
2. [ ] `npx vitest run` suite complète verte
3. [ ] Tests nouveaux dédiés (3-7 par phase)
4. [ ] Inspection manuelle dans Screen Lab + Playbook View
5. [ ] Update du CHANGELOG / ROADMAP / etat-avancement à la fin

---

## ⏱ Estimation finale

| Phase | Effort | Risque |
|---|---|---|
| 1 — Types + UI saisie | 3-4h | 🟢 |
| 2 — Setter `addShotReboundStep` | 4-6h | 🟡 (premier vrai code moteur) |
| 3 — Diag coach étendu | 2-3h | 🟢 |
| 4 — Docs + ROADMAP | 1h | 🟢 |
| **Total V1** | **10-14h** ≈ **2 jours** | 🟡 |

**Beaucoup moins que les 5-8 jours estimés au ROADMAP** parce que :
1. `computeRebound` existe et est testé
2. `boxOutCheckRule` existe (juste à enrichir)
3. Pattern setter F.2 éprouvé
4. UI inputs Step déjà rodés (B.1, F.4, F.5, G.2)

---

## V2 reportée (non incluse)

- `shotOutcome: 'blocked'` + geste défensif spécifique
- Reset shot clock à 14s sur rebond offensif
- Outlet pass auto sur rebond défensif (transition vers BLOB/SLOB)
- Couche `boxOutLayer` dynamique (vs setter statique)
- Unification mode édition ↔ mode match (shoot sync)
- Annotation `shoot` exposée à l'UI (= variante D1 Option A)

---

## ❓ Questions à valider avant de coder

1. **Choix D1** : `Step.shotOutcome?` (option C) ou `step.kind`
   (option B) ? Mon recommandation : **C** (cohérence avec hier).
2. **Choix D2** : setter (option A) ou couche (option B) ? Mon
   recommandation : **A** (zéro risque Règle 1bis).
3. **Estimation 2j OK** ou tu veux V1 encore plus minimal (~1j sans
   diag étendu) ?
4. **'Blocked'** : V1 ou V2 ? Mon recommandation : **V2** (moins
   courant, geste défensif spécifique à modéliser).

Une fois validé, je découpe en 4 commits (1 par phase) et go.
