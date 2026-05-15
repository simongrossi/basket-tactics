# AI possession mode

> **Statut** : 🟡 V1 livrée (commit `313e015`, 2026-05-15). **Décision
> projet 2026-05-15 : on continue jusqu'au game loop autonome
> complet** (B1 → B5). La Phase I n'est plus reportée — c'est
> maintenant un chantier actif. Détail B1-B5 + séquencement dans
> [ROADMAP § Phase I](../ROADMAP.md).

Module `src/lib/logic/match/aiPossession.ts`. Génère une **possession
entière jouée par l'IA** depuis l'étape active, produit des steps,
des événements typés (passe / drive / tir / turnover) et un outcome
scorable. RNG seedé pour la reproductibilité.

---

## Cas d'usage

Permet au coach de :
- **Voir une possession se dérouler automatiquement** depuis une situation
  donnée pour évaluer ce que l'IA "voit" comme meilleure séquence
  d'actions (passe vers le free → drive → kick-out → tir corner).
- **Comparer plusieurs possessions seedées** pour identifier les
  patterns récurrents (toujours le même premier choix de passe ?
  toujours le même tireur final ?).
- **Tester un scénario sous pression** : la défense IA suit ses règles
  normales (engine défensif inchangé), l'attaque IA prend les meilleures
  EV à chaque étape.

C'est l'équivalent en mode "ce que ferait l'IA si elle continuait" du
mode édition du coach (= "ce que devrait faire l'équipe selon moi").

---

## API publique

### `generateAiPossessionPlan(state, options, possession?)`

Génère **une possession**. Retourne `AiPossessionPlan` :

```ts
interface AiPossessionPlan {
  possession: number;          // numéro de possession (1-indexé)
  seed: number;                // seed RNG utilisée
  steps: Step[];               // steps avec le préfixe original + segment IA généré
  generatedStartIndex: number; // index où le segment IA commence
  events: AiPossessionEvent[]; // séquence d'événements typés
  outcome: AiPossessionOutcome;
  points: number;              // 0 / 2 / 3 selon le tir final
}
```

`AiPossessionEvent` typé : `'pass' | 'drive' | 'shot' | 'turnover' | 'forced-shot'`,
avec `label` lisible, `actor`/`targetId`, `expectedPoints`, `successRate`,
`scoreProbability`, `points`.

`AiPossessionOutcome` : `'shot-made' | 'shot-missed' | 'turnover-pass' | 'turnover-drive' | 'forced-shot-made' | 'forced-shot-missed' | 'empty'`.

### `generateAiMatchSeries(state, options)`

Itère N possessions (default 3). Retourne `AiMatchSeries` avec un
`AiMatchSeriesSummary` agrégé (PPP, distribution outcomes, score
total). Chaque possession a sa propre seed dérivée de la seed
maîtresse.

### `seededAiRng(seed: number): () => number`

Mulberry32, déterministe. Exposé pour tests + reproductibilité hors
module.

---

## Options de génération

```ts
interface GenerateAiMatchOptions {
  possessions?: number;          // default 3
  seed?: number;                 // default Date.now()
  maxActionsPerPossession?: number; // default 6
  creativity?: number;           // default 0.35, range 0..1
}
```

- **`creativity`** module la "température" de la sélection d'action :
  - `0` → toujours la meilleure EV (déterministe, mais sec)
  - `0.35` (default) → biais fort vers les meilleures EV avec un peu
    de variance
  - `1` → quasi-aléatoire pondéré par les EV

- **`maxActionsPerPossession`** sécurise contre les boucles. Si atteint
  sans tir, la possession finit en `forced-shot` (tir tenté sous
  pression du shot clock simulé).

---

## Pipeline interne

1. **Lecture de l'étape active** comme position de départ.
2. **Boucle d'action** (jusqu'à `maxActionsPerPossession`) :
   a. `evaluateOffensiveOptions` calcule les options offensives
   (tir / drive / passe vers chaque coéquipier) sur la position
   courante.
   b. `pickAction` sélectionne une option pondérée par `expectedPoints`
   et `creativity`.
   c. Si l'action est un tir, `scoreOutcome` tire un succès/échec
   selon `scoreProbability` et termine la possession.
   d. Sinon : applique l'action (déplacement du porteur ou de la
   balle), génère un nouveau step, log l'événement.
3. **Smoothing final** via `breakUpTeleports` (limite 80 px par step)
   + `ensureAnnotationsForMovement` pour que la lecture continue ait
   des annotations cohérentes.
4. **Outcome scoring** : `'shot-made' / 'shot-missed' / 'turnover-*'`
   selon le tir final ou la sortie de la boucle.

---

## Câblage UI

Branché dans `SimulationSection` (panneau de droite). Le coach peut :
- Lancer une possession unique ou une série (3-10)
- Choisir une seed manuelle (reproductible) ou Date.now()
- Voir les événements en time-line lisible
- Importer le `steps[]` généré dans le scénario actif via
  `handleLoadAiSteps` (callback dans `page.tsx`)

---

## Garanties

- **Déterminisme** : avec la même seed et le même état initial,
  `generateAiPossessionPlan` produit exactement la même `AiPossessionPlan`.
  Tests : `aiPossession.test.ts` (à vérifier dans le repo si présent).
- **Anti-téléport** : `breakUpTeleports` (déjà utilisé pour les imports
  de scénarios) clamp les steps IA à 80 px max pour éviter qu'une
  passe longue ne produise une trajectoire instantanée.
- **Engine défensif inchangé** : la défense suit ses règles normales,
  l'IA d'attaque ne modifie pas le pipeline défensif.

---

## Limites V1 et chantiers ouverts

V1 fait **une possession** = la sélection d'actions offensives basée
sur EV à chaque step. Il **manque** pour atteindre la "Phase I — Play
IA" complète annoncée dans la roadmap :

- **B1 — Game loop continu** : `match/gameLoop.ts` avec `tick(matchState, dt)`
  à 5 Hz, interpolation entre. Aujourd'hui : génération step-by-step,
  pas de boucle de match.
- **B2 — Décideur joueur autonome off-ball** : les coéquipiers du porteur
  bougent uniquement quand sélectionnés comme cible de passe. Manque la
  logique spacing / cuts / écrans permanents en off-ball.
- **B3 — Modèle de tir + rebond + transition possession** : V1 a un
  modèle de tir, mais **pas de rebond** ni de transition vers
  possession suivante. Dépend de la Phase E.1 (box-out / rebond).
- **B4 — UI "▶ Play IA (live)"** : V1 propose un bouton "générer une
  possession" qui produit des `steps[]` revues post-mortem. Manque le
  bouton "lecture live" qui joue le match en continu avec HUD
  (possession, shot clock, score).
- **B5 — Tuning Monte-Carlo en parallèle** : comparer la PPP du mode
  live vs le simulator existant. Marge attendue ±0.15.

---

## Décision de scope — 2026-05-15

**Choix : on va jusqu'au game loop complet (option 3).**

Justification : V1 single-shot est utile mais sous-exploite le moteur
défensif existant. Un game loop autonome 5v5 valide formellement le
moteur sur des séquences longues (24 s shot clock) et est la brique
nécessaire pour B5 (tuning Monte-Carlo comparé live vs simulator).

Séquence d'exécution adoptée (cf. [ROADMAP § Phase I](../ROADMAP.md)) :

1. **B1 — Game loop** (`match/gameLoop.ts` + `tick(matchState, dt)`)
2. **B3a — Modèle de tir minimal** (réutilise `evaluateOffensiveOptions`)
3. **B2 — Décideur off-ball** (spacing / cuts permanents)
4. **B4 — UI "▶ Play IA (live)"** + HUD
5. **B3b — Rebond + transition possession** (dépend Phase E.1
   box-out/rebond — si E.1 n'est pas livré, on stub la transition par
   "fin de possession, score noté")
6. **B5 — Tuning Monte-Carlo comparé**

---

## Référencé depuis

- [ROADMAP.md § Phase I](../ROADMAP.md) — décrit les 5 sous-chantiers
  (B1-B5) attendus pour une Phase I complète.
- [docs/simulation.md](simulation.md) — simulator Monte-Carlo existant
  (différent de l'AI possession : tire des outcomes statistiques sur
  un état figé, ne génère pas de steps).
