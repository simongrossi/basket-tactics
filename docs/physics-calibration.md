# Calibration des vitesses — scope tactique vs sprint réel

> **G.1 du ROADMAP** — Clarification du périmètre du moteur. Document
> de référence quand on se pose la question "pourquoi les joueurs
> bougent-ils si lentement comparé à la NBA ?" ou "comment passer en
> mode sprint réel ?".
>
> Voir aussi [`physics.md`](./physics.md) pour le détail des constantes,
> et `src/lib/data/physics.ts` pour l'implémentation.

---

## TL;DR

Le moteur est **volontairement sous-calibré** par rapport au basket
réel : les vitesses max sont ~22 % d'un sprint NBA. C'est un choix
assumé pour modéliser le **placement tactique** (qui est où, dans quel
ordre, sous quelle pression) plutôt que la **vitesse physique réelle**
(qui sprint, accélère, décélère).

| Aspect modélisé | Mode tactique (actuel) | Mode sprint réel (hypothétique) |
|---|---|---|
| Lecture tactique (rotations, aides, écrans) | ✅ Fidèle | ✅ Fidèle |
| Closeout, recover, switch | ✅ Visible step-par-step | ⚠ Trop rapide pour être lisible |
| Sprint baseline (fast break, run-out) | ❌ Sous-modélisé | ✅ Fidèle |
| Latence d'accélération (start-stop) | ❌ Binaire | ✅ Modélisée |
| Lisibilité animation | ✅ Step lent = clair | ⚠ Trop dense |

Le mode tactique gagne sur la pédagogie et la lecture ; le mode sprint
gagne sur le réalisme physique. Le projet a choisi tactique par défaut.

---

## Chiffres de référence

### Vitesses moteur actuelles (mode tactique)

D'après `MAX_SPEED_BY_POSITION_PX` dans
[`src/lib/data/physics.ts`](../src/lib/data/physics.ts), à 1 step = 2 s :

| Poste | px/étape | m/étape | m/s | km/h |
|---|---|---|---|---|
| Guard (D1, meneur) | 145 | 3,9 | **1,96** | 7,1 |
| Shooting guard (D2) | 130 | 3,5 | 1,76 | 6,3 |
| Wing (D3, ailier) | 110 | 3,0 | 1,49 | 5,4 |
| Forward (D4, ailier fort) | 90 | 2,4 | 1,22 | 4,4 |
| Center (D5, pivot) | 75 | 2,0 | 1,01 | 3,7 |

### Vitesses NBA / FIBA réelles (référence)

D'après les tracking data NBA (SportVU, Second Spectrum) :

| Action | Vitesse moyenne | Pic (sprint) |
|---|---|---|
| Walk / set defense | 1,0 – 1,5 m/s | — |
| Half-speed jog (recover) | 2,5 – 3,5 m/s | — |
| Closeout (course active) | 4 – 5 m/s | 6 m/s |
| Drive offensif (porteur) | 4 – 6 m/s | 7 m/s |
| **Fast break sprint (guard)** | 6 – 7 m/s | **9 m/s** |
| Transition (big) | 5 – 6 m/s | 7,5 m/s |

### Ratio tactique / réel

| Comparaison | Moteur | Réel | Ratio |
|---|---|---|---|
| Guard max (D1 sprint) | 1,96 m/s | 9 m/s | **22 %** |
| Wing max (D3 closeout) | 1,49 m/s | 5 m/s | 30 % |
| Center max (D5 transition) | 1,01 m/s | 6 m/s | 17 % |

Le moteur tourne donc à environ **un cinquième** de la vitesse réelle.
Cela rend chaque step lisible : un déplacement de 110 px = 3 m en 2 s,
c'est exactement la distance qu'un humain perçoit en suivant un point
sur l'écran. À pleine vitesse réelle, l'œil aurait du mal à isoler
les actions individuelles dans la même fenêtre temporelle.

---

## Pourquoi ce choix ?

### Le moteur est un outil de **lecture tactique**

Le projet ne simule pas "qui gagne un match" mais **"quelle est la
bonne réaction défensive ici"**. Les cas d'usage :

- Un coach explique à ses joueurs : *"Sur ce drive baseline, D2 doit
  fermer la ligne, D5 doit tag le roller, et D4 doit faire le low man"*.
  → On a besoin de voir chaque rotation **séparément**, dans un ordre
  visible.
- Un analyste regarde le replay frame-par-frame d'une couverture PnR
  hedge. → Le step lent permet de voir le hand-off du show, le drop
  du big, le recover du guard sans devoir mettre en slow-motion.

Si les joueurs sprintaient à 9 m/s, ces 3 actions tiendraient dans
~250 ms — illisible sans replay au ralenti.

### Calibration "step lent" délibérée

Le step de 2 secondes (`PLAYBACK_STEP_DURATION_MS = 2000`) est la base.
Un step = "un beat tactique" :

- 2 s = un dribble + une coupe
- 2 s = un screen posé + une réaction (over / under / switch)
- 2 s = un closeout sur passe entrante

À l'échelle réelle, ces actions durent 0,5 à 1,5 s. Le moteur les
**étire** pour rendre visible la causalité (cause → effet → réponse).

### Cohérence physique préservée

Même si les vitesses sont sous-réelles, les **ratios entre postes**
sont conservés (guard > shooting guard > wing > forward > center).
La hiérarchie de mobilité reste celle du basket réel. C'est ce qui
permet, par ex, le tag-then-switch (C.5) de marcher : un center
slow-mais-puissant peut tag, un guard rapide peut recover, dans le bon
ordre.

---

## Mode "sprint réel" — comment l'activer (hypothétique)

Si un jour on veut passer le moteur en mode réaliste pour, par
exemple, simuler un fast break correctement, voici **ce qu'il faudrait
changer** :

### 1. Augmenter les vitesses max (×3 à ×5)

```ts
// src/lib/data/physics.ts
export const MAX_SPEED_BY_POSITION_PX = {
  guard: 145 * 4.5,        // 1.96 → 8.8 m/s
  shootingGuard: 130 * 4.2,
  wing: 110 * 4,
  forward: 90 * 3.6,
  center: 75 * 3.4,
};
```

### 2. Réduire `PLAYBACK_STEP_DURATION_MS` (option)

À 500 ms par step au lieu de 2000 ms, l'animation montre 4 steps par
seconde. Plus dense, plus réaliste, mais perte de lisibilité step par
step.

### 3. Implémenter G.2 et G.3 (pré-requis pour le réalisme physique)

Avant de monter les vitesses brutes, il faut modéliser la **physique
des accélérations** :

- **G.2 — Sprint boost contextuel** : un setting `state.sprintBoost`
  qui temporairement ×2 la vitesse pendant 1 step (transition, fast
  break, run-out post-rebond). Sans ça, augmenter les vitesses max
  rendrait TOUS les déplacements aussi rapides qu'un sprint, ce qui
  est faux (la défense n'est pas en sprint en half-court).
- **G.3 — Différenciation accélération / top speed** : un guard atteint
  9 m/s, mais met **~2 secondes** à y arriver. Aujourd'hui le moteur
  est binaire : soit le joueur est à 0, soit à sa vitesse max. Pour
  un fast break réaliste, il faut une courbe `acceleration(dt)` qui
  monte progressivement.

### 4. Conséquences sur le tuning défensif

Augmenter les vitesses sans rééquilibrer **casserait** :

- `DEFAULT_CLOSEOUT_BOOST = 1.4` : si la vitesse de base monte ×4, le
  closeout devient ×5.6, irréaliste.
- `RIM_PROTECTION_DROP_ZONE_PX = 75` : à vitesse réelle, le big a le
  temps de venir de bien plus loin. Il faudrait monter à 120-150 px.
- Tous les tests d'invariants (overlap, screen lock, etc.) supposent
  des déplacements step ≤ 145 px. Il faudrait revoir les seuils.

### 5. Coût

Estimation : **2-3 semaines** pour un refacto complet vers le mode
sprint, dont :

- 1 semaine sur G.2 + G.3 (les pré-requis modélisation).
- 1 semaine sur le re-tuning défensif (closeout, drop, denial,
  rim protection).
- 1 semaine sur la révision des tests d'invariants (≈ 200 tests à
  re-calibrer).

Pas dans la priorité actuelle (cf. ROADMAP, phase G est P3).

---

## Cas où le mode tactique gêne

Pour transparence, voici les cas où le moteur actuel **ne suffit pas** :

- **Fast break / transition** : les joueurs ne sprintent pas, ils
  marchent vite. Visuellement crédible mais physiquement faux.
- **Buzzer beater coast-to-coast** : impossible à modéliser
  correctement (un guard met théoriquement 11 steps × 2 s = 22 s pour
  traverser le terrain, vs ~5 s en réel).
- **Aide tardive last-second** : la couche `helpStickyLayer` C.2 V2
  simule bien le délai humain, mais sous-estime la rapidité d'un
  recover de wing rapide.

Pour ces cas, le coach peut :

1. Réduire `state.secondsPerStep` à 1 s (timeline interne) pour
   compresser temporellement la lecture.
2. Modifier ponctuellement `rule.maxSpeed` sur un défenseur via le
   menu contextuel pour modéliser un sprint individuel (slider 40-200
   px/étape).
3. Utiliser `Step.duration` (B.1) pour donner moins de temps à
   l'attaque sur les phases rapides.

---

## Historique

| Date | Décision |
|---|---|
| 2025-XX | Choix initial : moteur tactique, ratio ~25 % NBA. |
| 2026-05-12 | C.1 closeout footwork — ajoute le sprint+freinage local, sans toucher la vitesse de base. |
| 2026-05-17 | B.1 step.duration — la durée d'un step devient per-step, ce qui permet d'éviter le re-calibrage global pour les phases lentes/rapides. |
| 2026-05-18 | G.1 — ce document. Décision : pas de refacto vers sprint réel à court terme. À revoir si E.1/A11 (box-out + transition complète) demande plus de réalisme physique. |

---

## Réferences

- [`docs/physics.md`](./physics.md) — détail des constantes physiques.
- [`src/lib/data/physics.ts`](../src/lib/data/physics.ts) — implémentation.
- ROADMAP Phase G (G.2 sprint boost, G.3 accel/top speed) — pré-requis
  pour le mode sprint réel.
- ROADMAP Phase D (D.1 easing, D.2 momentum) — lissage visuel
  orthogonal aux vitesses brutes.
