# Raccourcis clavier

Implémentation : [`src/hooks/useKeyboardShortcuts.ts`](../src/hooks/useKeyboardShortcuts.ts), monté une fois dans `app/page.tsx`.

## Bindings

| Touche | Action |
|--------|--------|
| `Espace` | Play / Pause |
| `←` | Étape précédente |
| `→` | Étape suivante |
| `M` | Outil **move** (déplacer) |
| `P` | Outil **pass** (passe) |
| `D` | Outil **dribble** |
| `R` | Outil **cut** (couRse) |
| `E` | Outil **screen** (Écran) |
| `Suppr` ou `Backspace` | Supprime la dernière annotation de l'étape active |
| `Ctrl/Cmd+Z` | Undo — restaure l'état précédent (pile cap à 50) |
| `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` | Redo — re-applique l'état undone |

## Modificateurs souris

| Modificateur | Effet |
|---|---|
| **`Shift` + drag** sur un attaquant avec un outil annotation (`dribble`, `course`/cut, `écran`) | Enregistre la trajectoire freehand et crée une annotation avec `waypoints` (spline Catmull-Rom, vitesse perçue constante en lecture). Drag normal sans Shift = ligne droite ou wave dribble standard. Cf. [data-model.md > Trajectoire courbe](data-model.md#trajectoire-courbe-polyline--catmull-rom). |
| **Clic-droit** sur un défenseur | Menu contextuel : profils, sliders globaux/individuels (distance, vit. max, closeout, denial), `vsCarrier`, `offBallStance`, `screenNav`, `bodyOrientationMode`, `gazeLock`, ré-auto-positionner. |
| **Clic-droit** sur un attaquant | Menu contextuel : marquer comme porteur, forcer comme poseur d'écran (pose `forcedScreener`), effacer ses annotations, profil offensif, sliders d'orientation corps/regard. |
| **Clic-droit** sur une annotation | Suppression directe de l'annotation. |

## Comportement

- **Skip auto** quand le focus est dans un champ texte : `<input>`, `<textarea>`, `<select>`, ou élément `contenteditable`. Permet de taper des labels d'étape sans déclencher les raccourcis.
- **Skip auto** quand `Ctrl`, `Cmd` ou `Alt` est enfoncé — laisse passer les raccourcis natifs (Ctrl+R rafraîchir, Cmd+L barre d'adresse, etc.). Exception : Undo/Redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`) sont interceptés explicitement avant ce filtre.
- `preventDefault()` est appelé sur chaque touche gérée pour éviter que `Espace` ne scrolle la page ou que `Backspace` ne déclenche un retour navigateur.

## Ajouter un raccourci

1. Étendre le type `Handlers` dans `useKeyboardShortcuts.ts` avec un nouveau callback.
2. Ajouter le branchement dans le `handler` `keydown`.
3. Câbler le callback depuis `app/page.tsx` (passe l'action venant de `useAppState`).
4. Documenter ici.

## Limites connues

- `Suppr` supprime la **dernière** annotation, pas une annotation sélectionnée. Une vraie sélection clic + delete arrivera avec le chantier annotations richer.
- Undo/Redo : pas de coalescing pendant un drag continu (chaque mouvement de pointeur crée une entrée dans la pile). À tunir en v2.
