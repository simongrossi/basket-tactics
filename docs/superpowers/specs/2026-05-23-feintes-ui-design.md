# Phy.O V4 V2 — UI feintes — Design

Date : 2026-05-23
Statut : design validé.

## Problème

Le backend Phy.O V4 V1 (commit `87803da`) accepte `Annotation.feintes?: number[]`
mais aucune UI ne le pose. Le coach ne peut configurer les feintes que par
import JSON. Cette UI clôt le chantier feintes pour le coach.

## Décisions de design

- **Emplacement** : sous-bloc dans la liste des annotations du `StepsPanel`
  (sous le `×` delete), visible seulement pour `cut` / `dribble` à l'étape active.
- **Pattern d'édition** : par feinte, un mini-slider `[0..1]` step `0.05`,
  affichage en `%`, un `×` pour supprimer. Bouton `+ feinte` ajoute une
  feinte à `t=0.5` (centre). Cohérent avec le pattern des annotations
  supprimables.
- **Marker visuel** : un petit cercle (rayon 4 px) à la position de chaque
  feinte sur le path rendu dans `Annotations.tsx`, fill jaune-orangé,
  visible en édition.
- **Transforms** : 3 transforms purs dans `annotationTransforms.ts` :
  `addFeinte(state, stepIdx, annIdx, t)`, `updateFeinte(state, stepIdx, annIdx, feinteIdx, t)`,
  `removeFeinte(state, stepIdx, annIdx, feinteIdx)`.
- **Câblage** : `useAppState` expose les 3 setters, propagés via `Page` →
  `StepsPanel`.

## Fichiers

- **Modifier** : `attackerTransforms.ts` ou `annotationTransforms.ts`
  (à voir au plan), `useAppState.ts`, `StepsPanel.tsx`, `Annotations.tsx`,
  `Page.tsx`.
- **Tester** : 3 transforms (add/update/remove).
