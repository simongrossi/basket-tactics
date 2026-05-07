# Simulation tactique : modèle de menace, EV des actions, Monte Carlo

Comment le moteur transforme une configuration défensive en chiffres lisibles par le coach. Trois couches qui s'empilent, chacune utilisable seule.

## C'est quoi Monte Carlo ?

**Monte Carlo** est une méthode statistique qui consiste à **rejouer N fois** une situation avec des décisions/résultats aléatoires, puis à **agréger les moyennes**. Le nom vient du casino — l'idée est qu'on tire des nombres au hasard suivant une distribution réaliste (FG% NBA, taux de turnover, etc.).

Concrètement dans notre cas : depuis l'état du terrain à un instant donné, on simule 50, 200 ou 1000 possessions différentes en faisant prendre au porteur des décisions probabilistes (parfois il tire, parfois il passe, parfois il drive — selon ce qui est statistiquement le mieux MAIS avec une part de hasard). Pour chaque possession, on tire les dés (le tir rentre ? la passe arrive ?). Au bout des N runs, on a une distribution réaliste de ce qu'aurait donné cette configuration en match.

> **Pourquoi pas un seul calcul déterministe ?** Parce qu'un calcul donne *une* prédiction. Monte Carlo donne *une distribution* — on voit la médiane mais aussi les extrêmes (pertes de balle, paniers faciles, tirs forcés). C'est plus riche pour évaluer la robustesse d'un système.

> **Pourquoi du softmax pour les décisions ?** Parce qu'un coach humain ne prend pas TOUJOURS la meilleure option mathématique. Un tireur peut shooter même contesté s'il sent le coup. La *température* `τ=0.3` règle ce compromis : `τ→0` = toujours la meilleure option (greedy), `τ→∞` = aléatoire pur. À 0.3, les options proches en EV sont quasi-équiprobables, les très mauvaises sont écartées.

## Les trois phases

### Phase A — Score de menace par attaquant

**Fichier** : [`src/lib/logic/threats.ts`](../src/lib/logic/threats.ts)

Pour chaque attaquant, calcule la probabilité qu'il marque s'il devient l'option offensive — sans simulation, juste un produit de proba :

```
threat(O_x) = receivability(O_x) × shotQuality(O_x)
```

**`shotQuality`** = FG% brut selon la zone × multiplicateur de contest

| Zone | Distance au panier | FG% base |
|------|-----|---|
| `rim` | < 30px | 0.65 |
| `paint` | 30–80px | 0.50 |
| `mid` | 80–200px | 0.40 |
| `three` | 200–290px | 0.36 |
| `deep` | > 290px | 0.28 |

Multiplicateur de contest (défenseur le plus proche du tireur) :
- 0px (contact) → ×0.50
- 80px+ → ×1.00 (aucune pénalité)
- linéaire entre

**`receivability`** = probabilité que la balle arrive à l'attaquant
- `1` si c'est le porteur
- Sinon dépend de la **ligne de passe** (clearance par rapport au défenseur le plus proche du segment porteur→cible) :
  - clearance < 18px → `0.2` (passe bloquée)
  - clearance < 35px → `0.6` (passe contestée)
  - clearance ≥ 35px → `1.0` (passe ouverte)

**Affichage** : toggle `menace attaquants` dans Visu/Légende → anneau coloré + badge % autour de chaque attaquant. Vert = open, rouge = locked. Le porteur a un anneau plein, les non-porteurs un pointillé.

### Phase B — Évaluation des options offensives

**Fichier** : [`src/lib/logic/offense.ts`](../src/lib/logic/offense.ts)

Pour le **porteur**, on évalue chaque action possible et on calcule l'**espérance de points** (EV) :

```
EV = successRate × scoreProbability × shotPoints
```

| Action | EV |
|---|---|
| **Tir direct** | `1 × shotQuality(carrier) × points(zone)` |
| **Drive** | `0.75 × shotQuality(zone projetée) × 0.7 (pénalité défense) × points` — uniquement si carrier > 60px du panier |
| **Passe → OX → tir** | `receivability(OX) × shotQuality(OX) × points(OX zone)` — un par coéquipier |

Les actions sont triées par EV décroissant. La meilleure est exposée par `bestOffensiveAction`.

**Affichage** : toggle `meilleure action` dans Visu/Légende → flèche dorée du porteur vers la position de tir, label compact `Tir/Drive/Passe OX · X.XX pts`. Pill `meilleure action` dans la barre de métriques (vert ≤ 0.7, jaune, rouge ≥ 1.2).

### Phase C — Monte Carlo de possessions

**Fichier** : [`src/lib/logic/simulator.ts`](../src/lib/logic/simulator.ts)

À partir de l'état courant, on simule **N possessions** stochastiques. Chaque possession est une suite de décisions enchaînées jusqu'à un résultat terminal.

**Décision offensive** — softmax sur les EV (Phase B) :
```
P(action_i) = exp(EV_i / τ) / Σ exp(EV_j / τ)        avec τ = 0.3
```

**Résolution stochastique** :
- Tir : tirage aléatoire `< shotQuality` → make / miss
- Drive : tirage `< 0.75` (taux de réussite) → tir au rim, sinon turnover
- Passe : tirage `< receivability` → le receveur devient porteur (la sim continue), sinon turnover

**Terminal** : tout tir (réussi ou manqué) ou turnover termine la possession. Profondeur max = 4 décisions (24s violation émulée → tir forcé).

**Outcomes typés** :
| Outcome | Description |
|---|---|
| `shot-made` | Tir réussi |
| `shot-missed` | Tir manqué |
| `turnover-pass` | Passe interceptée |
| `turnover-drive` | Drive perdu (charge, sortie de balle) |
| `forced-shot-made` | Tir forcé en fin de possession, réussi |
| `forced-shot-missed` | Tir forcé, manqué |

**Stats agrégées** :
- **PPP** (points per possession) = points totaux / N — la métrique reine
- **eFG%** (effective field goal) = (makes 2pt + 1.5 × makes 3pt) / tentatives
- **score%** = % de possessions qui finissent en tir réussi

**Affichage** : section **Simulation (Monte Carlo)** en bas du panneau Défense. 3 boutons preset (50 / 200 / 1000 runs). Stats en grand + distribution détaillée des outcomes. Couleurs : vert défense ferme (PPP ≤ 0.85), jaune neutre, rouge système troué (PPP ≥ 1.10).

## Limites assumées du MVP

Documentées en commentaire dans `simulator.ts` :

1. **La défense est figée pendant la simulation**. Snapshot de `defPos` au temps T, pas de réaction dynamique aux passes/drives. Modélise "que se passe-t-il dans les 1-2 secondes suivantes avec cette configuration".
2. **Les attaquants ne se déplacent pas** hors du porteur qui drive. Pas de cuts, pas de relocations.
3. **Pas de comparaison A/B intégrée**. On lance la sim, on note le PPP, on change le système, on relance. La comparaison côte-à-côte est la prochaine itération naturelle.

Ces limites sont des choix volontaires pour livrer un MVP utilisable. La vision long terme (sim avec défense réactive + offense AI multi-joueurs) demanderait un moteur plus lourd.

## Reproductibilité

Le RNG est injectable. Par défaut `Math.random` mais les tests passent un RNG seedé (mulberry32) pour des résultats déterministes — voir [`simulator.test.ts`](../src/lib/logic/__tests__/simulator.test.ts).

```ts
import { simulatePossessions } from '@/lib/logic/simulator';
const r = simulatePossessions(off, defPos, 'O1', 200, HOOP, seededRng(42));
```

## Pour étendre

**Modifier les FG% par zone** : éditer la table `FG_BY_ZONE` dans `offense.ts` ou `SHOT_QUALITY_BY_ZONE` dans `threats.ts`. Garder les deux synchronisées.

**Ajuster la pénalité de contest** : fonction `contestMultiplier(distToNearestDef)` dans les deux modules.

**Changer le comportement décisionnel** : `SOFTMAX_TEMPERATURE` dans `simulator.ts`. À 0.1 quasi-greedy, à 1.0 plus aléatoire.

**Ajouter une action** : étendre `OffensiveActionType` dans `offense.ts`, gérer dans `evaluateOffensiveOptions` ET dans la boucle de `simulateOnePossession`.

**Faire réagir la défense** : remplacer le snapshot statique par un appel au moteur après chaque décision (passe, drive). Lourd — il faudrait projeter les positions défensives en avant. Pas trivial vu que le moteur est conçu pour des étapes pré-définies.
