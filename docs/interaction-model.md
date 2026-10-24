# Modèle d'interaction du terrain

> Document de référence pour toute modification de `CourtView`, de
> `useCourtPointerHandlers` ou de la caméra. Il décrit le fonctionnement
> **actuel** (post-audit UX 2026-10) et les invariants à ne pas casser.

## 1. Repères et conversions

| Repère | Unité | Où |
|---|---|---|
| Terrain | unités logiques (600 × 560, ou 600 × 1080) | `AppState`, annotations, joueurs |
| SVG | unités du `viewBox` | `<g transform>` de la caméra |
| Écran | pixels CSS | pointeur, molette, pincement |

- Les **positions métier** vivent toujours dans le repère terrain. Elles ne
  dépendent ni du zoom, ni de la taille de l'écran, ni du périphérique.
- `svgPoint()` convertit écran → terrain via `getScreenCTM().inverse()`.
  C'est la seule conversion autorisée pour les positions.
- La **caméra** (`scale`, `x`, `y`) est appliquée dans le repère SVG.
  Toute valeur en pixels CSS doit donc être convertie avant :
  `src/lib/logic/camera.ts` (`viewportMetrics`, `zoomCameraAt`, `panCamera`,
  `clampCamera`, `fitCamera`). Ne jamais réintroduire
  `centerX - (centerX - prev.x) * factor` avec des pixels CSS.
- `clampCamera` garde le terrain dans la fenêtre : au zoom 1 le terrain est
  centré et ne peut pas être déplacé ; zoomé, les bords ne sortent plus.

## 2. Pipeline pointeur

Un seul hook, `useCourtPointerHandlers`, traite `pointerdown` / `move` / `up` /
`cancel` (Pointer Events uniquement, `touch-action: none` sur le SVG).

```text
pointerdown
 ├─ 2e doigt          → pincement (fin du drag en cours, commit)
 ├─ mode lecteur      → pan uniquement
 ├─ Espace / bouton 2 → pan
 ├─ outil Note        → popup de note
 ├─ outil Déplacer
 │   ├─ sur trajectoire → sélection (halo + poignées + barre)
 │   ├─ sur joueur      → appui (sélection immédiate), drag armé après 6 px
 │   └─ dans le vide    → pan ; un pan sans mouvement désélectionne
 └─ outil de tracé     → départ d'annotation (doit partir d'un joueur)
```

Règles :

1. **Seuil de tap** `TAP_SLOP_PX = 6` : en dessous, c'est une sélection ;
   l'historique et la poursuite défensive ne sont armés qu'au-delà.
2. **Sélection au plus proche** : `findPlayerAt` renvoie le joueur le plus
   proche dans le rayon, jamais le premier de l'ordre d'itération. À
   distance égale, l'attaquant est prioritaire.
3. **Appui long** 380 ms, annulé par le seuil de tap : anneau de progression
   + vibration, puis menu contextuel. Un drag en cours annule l'appui long.
4. **Échap** annule le geste en cours (capture) : drag restauré via
   `cancelPlayerDrag` (sans entrée d'historique), tracé jeté, pan remis à
   son cadrage d'origine.
5. **2e doigt** termine le drag en cours (commit) puis passe en pincement.
6. Le drag attaquant est plafonné en vitesse (240 u/s, 190 avec ballon) puis
   « finit sa course » jusqu'au point de lâcher. La destination finale est
   toujours exacte.

## 3. Cibles tactiles

- `pickRadiusUnits = max(22 u, 22 px / échelle écran)` → 44 px de diamètre
  minimum au doigt, sans élargir le rayon souris à l'échelle 1.
- L'échelle écran est mesurée par `useLayoutEffect` (CTM + `ResizeObserver`)
  et passée au hook et à `AnnotationHandles`.
- Les poignées sont un petit disque visible + une **cible invisible** de
  44 px (`HandleDot`). Ne jamais remettre les handlers sur le disque visible.
- La bande de sélection d'une trajectoire est aussi dimensionnée en px écran
  (`44 / échelle`), minimum 28 u.

## 4. Sélection (état éphémère)

- `selectedPlayerId` et `selectedAnnotation` vivent dans `CourtView`
  uniquement : pas d'`AppState`, pas d'undo, pas d'export.
- Un joueur sélectionné porte un halo cyan. Une trajectoire sélectionnée est
  surlignée (drop-shadow) et affiche ses poignées + une barre contextuelle :
  type d'action (course / dribble / écran), Supprimer, Fermer. La suppression
  affiche un toast « Annuler » (6 s) câblé sur l'historique.
- Le clic droit **ne supprime plus** : il sélectionne.
- La sélection est abandonnée au changement d'étape, d'outil, de mode ou sur
  Échap.

## 5. Modes

| Mode | Chrome | Terrain |
|---|---|---|
| Édition | header + sidebar + timeline | tout |
| Présentation (`presentMode`) | header/sidebar masqués | **verrouillé** (`readOnly`), zoom/pan |
| Lecteur (`isPlayerMode`) | terrain seul + `PresentationBar` | pan/zoom + transport |
| Enregistrement de gestes | barre d'enregistrement | déplacements seulement |

`readOnly` est la seule source du verrouillage d'édition. `presentMode` doit
toujours être passé à `readOnly` (sinon on peut modifier un système sans
Annuler visible).

## 6. Chrome mobile (≤ 900 px)

- Header condensé : marque, titre et diagnostics masqués, libellés en icônes.
- `CourtTouchBar` passe en **barre fixe en bas** (`position: fixed`) ;
  libellés masqués, étape précédente/suivante et « Figer départ » déplacés
  dans la barre latérale pour ne pas la surcharger.
- Zoom en ligne horizontale, terrain borné à `68dvh` en paysage.
- Menus contextuels et orchestrateur rendus en **portail viewport** : ils ne
  sont plus rognés par l'`overflow: hidden` du terrain.

## 7. Réorganisation des étapes

- Disponible dans le panneau Étapes (↑ / ↓ sur l'étape active), **hors
  séquences lissées** : si une étape `isInterpolated` existe, la
  réorganisation est désactivée (sa géométrie dépend de l'ordre d'origine).
- L'étape (positions, porteur, contexte, label, overrides) est déplacée, puis
  **toutes les extrémités d'actions sont recalculées** à partir des nouveaux
  états voisins (`stepOrderTransforms.ts`) : une course va de la position du
  joueur à sa position suivante, une passe part du porteur précédent. Les
  waypoints (courbes) sont conservés.
- Une confirmation est demandée dès que la séquence contient des actions,
  car les flèches changent de géométrie. L'opération est une entrée
  d'historique : `Annuler` restaure la séquence exacte.
- Les déplacements historiquement stockés sur leur étape d'arrivée sont
  d'abord normalisés vers l'étape de départ, sinon ils seraient relus comme
  le mouvement suivant du joueur.

## 8. Limites connues / à faire

- Le plafond de vitesse du drag attaquant est voulu (physique). Il est
  désactivable dans Réglages → Interaction (`dragSpeedCapEnabled`) pour un
  placement direct au doigt.
- Validation tactile réelle (iPhone/iPad/Android) à faire : les tests jsdom
  ne valident pas l'ergonomie au doigt.
