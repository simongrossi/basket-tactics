# Phy.O V3 V2 — Choix de côté du cut (approche B) — RFC

Date : 2026-05-23
Statut : **🟢 LIVRÉ 2026-06-02** (commit `b3263be`). Helper `cutSideFlip.ts`,
résolveur dédié `flipDefenderFor`, select tri-état StepsPanel. 14 tests.

## Problème

Si le coach dessine un cut qui va à GAUCHE et que le défenseur matché est
déjà sur la gauche, le cut va dans le mur de la défense. Un attaquant
intelligent réoriente vers le côté opposé. V3 V1 (lecture défensive)
ralentit seulement — il ne change pas la forme du path.

## Approche retenue (B — règle déclarative simple)

**Une règle unique, opt-in par annotation :** `Annotation.flipSideIfDefenderOn?:
'left' | 'right'`. Si défini, à la lecture, on évalue : le matched
defender est-il du côté `'left'` ou `'right'` par rapport à la ligne
`from→to` ? Si OUI sur le côté spécifié, on **flippe le path** par
symétrie axiale autour de la ligne `from→to`. Si NON, on garde le path
dessiné.

**Avantages.**
- Le coach reste owner : il choisit le côté trigger ET le path par défaut.
- Pas de DSL : juste un champ optionnel. UI = un select à 3 options
  ('non', 'gauche', 'droite') dans la liste d'annotations.
- Implémentable en ~1j.

**Limites.**
- Symétrie axiale = miroir parfait. Le path miroité ressemble au path
  dessiné mais flippé — pas toujours le path le plus naturel pour le
  coach. C'est une approximation.
- Pas de "lecture continue" : la décision est binaire au début du segment.

## Architecture proposée

- **Data** : `Annotation.flipSideIfDefenderOn?: 'left' | 'right'`.
- **Math** : avant le `samplePolyline(path, s)` dans `playbackTrajectory.ts`,
  évaluer la règle. Si déclenchée, transformer le `path` via une symétrie
  axiale autour de `from→to`.
- **Eval** : la position du défenseur est résolue par le caller
  (`frameResolver`) via `state.matchups` + interp `t=0.5`. Comparer le
  signe du cross-product `(to-from) × (defender-from)`.
- **Cache** : invalidation via inclusion du choix de flip dans la clé du
  `getOrBuildProfile` (ou hash séparé sur les waypoints — la transformation
  produit un path différent donc forcément un profil différent).
- **UI** : un select dans la sous-row d'annotation `StepsPanel` (pareil
  que les feintes V4 V2).
- **Tests** : 4 unitaires.
  - Path → defender côté gauche, flipSide='left' → path miroité.
  - Path → defender côté droit, flipSide='left' → path inchangé.
  - flipSide=undefined → toujours path inchangé.
  - Endpoints préservés après flip.

## Effort

~1j en session dédiée. 4-5 tâches TDD.

## Pourquoi pas dans cette session

Implementation propre demande :
- Décider de la place exacte (transformer le `path` AVANT `getOrBuildProfile`
  vs ajouter le flip dans le velocityProfile).
- Décider de l'UX (select tri-état dans StepsPanel — assez similaire au
  feintes UI mais distinct).
- Tests d'invariance (un flip de flip = identité, le cas droite + 'right'
  triggers correctement, etc.).

Mieux fait en session reposée pour la qualité de design.
