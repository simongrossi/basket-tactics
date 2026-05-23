# Phy.O V3 V3 — Sortie tangentielle d'écran adaptée — RFC

Date : 2026-05-23
Statut : **spec design — implémentation à reprendre en session dédiée.**

## Problème

Quand le défenseur défend un cut sur écran avec `screenRule: 'over'`
(passe par-dessus), un attaquant intelligent sort de l'écran du côté
opposé pour le perdre. Si `'under'` (passe par-dessous), sortir
par-dessus. Le path actuel ignore le screenRule défensif.

## Approche retenue (B — règle déclarative liée au screenRule)

**Règle unique, opt-in par annotation `cut` :** `Annotation.adaptScreenExit?:
boolean`. Quand `true` ET un `screen` annotation existe avec ce cutter
comme bénéficiaire (target du cut autour de l'écran), le path est
modifié à la sortie de l'écran selon `state.screenRule` :
- `over` → forcer la sortie tangentielle côté opposé au défenseur.
- `under` → forcer la sortie côté défenseur (court-circuit avant impact).
- `switch` / autres → garder le path dessiné.

## Architecture proposée

- **Data** : `Annotation.adaptScreenExit?: boolean`.
- **Détection couplage cut↔écran** : besoin de matcher un cut avec un
  screen co-localisé. Pattern : screen.fromId = poseur, cut.fromId =
  cutter, cut.from proche du screen.to. À traiter dans une helper
  `findScreenForCut(state, stepIdx, annIdx)`.
- **Modification path** : injecte un waypoint au point de sortie du
  cluster d'écran, du bon côté selon la règle.
- **Cache** : invalidation comme V3 V2.

## Effort

~1j en session dédiée. 5-6 tâches TDD. Complexité supérieure à V3 V2
parce que la détection cut↔screen est non-triviale (réutilise la logique
existante `detectStepScreenAction`).

## Pourquoi pas dans cette session

Demande un détour par le moteur écran (`detectStepScreenAction`,
`pickBlockingCluster`), avec risques Règle 1bis si mal câblé. Justifie
une session dédiée focalisée sur le moteur écran offensif.
