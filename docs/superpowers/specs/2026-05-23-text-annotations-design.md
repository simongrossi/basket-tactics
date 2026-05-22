# A.3 — Annotations texte libres — Design

Date : 2026-05-23
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Le coach ne peut déposer aucun commentaire libre sur le terrain. Les seules
annotations sont les flèches d'action (`pass` / `dribble` / `cut` / `screen`),
qui décrivent un mouvement — pas une intention (« trap si le 5 monte »,
« force baseline », « option skip pass »).

A.3 ajoute des **notes texte libres** : déposer une note à un endroit du
terrain pour expliquer l'intention tactique.

## Décisions de design

| Sujet | Décision |
|---|---|
| Stockage | Entité séparée `TextNote`, tableau `Step.textNotes?` — **pas** une extension d'`Annotation`. Les notes sont purement visuelles : elles ne traversent aucun moteur (trajectoire, défense, playback physique, PDF). |
| Édition | Popup HTML ancré au point de clic (pattern `popupHooks` des menus contextuels). La note rendue reste un `<text>` SVG. |
| Portée | Par étape — la note vit dans `step.textNotes`, comme les annotations d'action. |
| Identification | Par index dans le tableau, comme les annotations d'action (pas d'`id`). |

## Section 1 — Modèle de données

Dans `src/lib/types/index.ts` :

```ts
/** A.3 — Note texte libre déposée sur le terrain. Purement visuelle :
 *  ne traverse aucun moteur (trajectoire, défense, playback). */
export interface TextNote {
  /** Ancrage sur le terrain (coordonnées court). */
  pos: Point;
  /** Contenu de la note. */
  text: string;
}
```

- `Step` gagne un champ optionnel `textNotes?: TextNote[]`. Absent = rétrocompat
  stricte (aucun système existant n'a de notes).
- Le type `Tool` gagne la valeur `'text'` (à côté de
  `'move' | 'pass' | 'dribble' | 'cut' | 'screen'`).
- `Annotation` et `AnnotationType` ne sont **pas** modifiés.

## Section 2 — Création / édition / suppression

**Outil.** `OffenseToolsPanel` gagne une entrée `{ value: 'text', label: 'note' }`
avec une icône dédiée dans `ToolIcon`. Raccourci clavier `T` ajouté à
`useKeyboardShortcuts` (table de bascule d'outils, à côté de M/P/D/R/E).

**Créer.** Outil `text` actif + clic sur une zone vide du terrain → ouverture
d'un popup HTML (`TextNotePopup`) ancré au point de clic. Un champ de saisie
prend le focus. `Entrée` ou blur avec contenu non vide → ajoute une `TextNote`
`{ pos: pointDeClic, text }` à l'étape active. `Échap` ou contenu vide →
annule sans rien créer.

**Éditer / supprimer.** Outil `text` actif + clic sur une note existante →
le popup se rouvre, pré-rempli avec le texte de la note. Sauver met à jour le
texte ; un bouton `×` dans le popup supprime la note. Sauver avec un texte
vide supprime également la note (équivalent suppression).

**Non-interférence.** Avec un autre outil actif (`move`/`pass`/…), les notes
sont seulement affichées — aucun clic ne les ouvre, aucun conflit avec les
autres outils.

**Popup.** `components/court/TextNotePopup.tsx` réutilise le pattern
`popupHooks` (clamp dans le viewport, fermeture au clic extérieur / `Échap`)
déjà utilisé par les menus contextuels. C'est du HTML positionné en absolu
par-dessus le SVG — robuste tous navigateurs (pas de `<foreignObject>`).

## Section 3 — Rendu

Nouveau composant `components/court/TextNotesLayer.tsx` :

- Pour chaque note de l'étape rendue : un `<rect>` de fond blanc semi-opaque
  (lisibilité par-dessus le terrain) + un `<text>` SVG centré sur `note.pos`.
- Monté dans `CourtView`, à côté de la couche d'annotations.
- Rend les notes de l'**étape active** en édition, et de l'étape courante
  pendant lecture/scrub — la note apparaît au moment où son étape est active.

**Hors périmètre V1.** L'export PDF des notes (rendu dans `StepThumbnail` /
`pdfRecap`) n'est pas inclus. V1 = affichage sur le canvas éditeur
(`CourtView`) uniquement. Follow-up éventuel.

## Section 4 — Transforms, persistance, tests

**Transforms purs.** Nouveau fichier `src/lib/state/transforms/textNoteTransforms.ts`
exposant trois fonctions pures `(state, ...args) => state` :

- `addTextNote(state, stepIdx, note: TextNote)` — ajoute une note à l'étape.
- `updateTextNote(state, stepIdx, noteIdx, text: string)` — change le texte.
- `removeTextNote(state, stepIdx, noteIdx)` — retire la note d'index donné.

Aucune ne mute son entrée (copies immuables, cohérent avec les autres
transforms du dossier).

**Persistance & undo.** Les transforms sont câblés dans `useAppState` via le
wrapper `setStateWithHistory` existant. Les notes vivant dans `state.steps`,
elles bénéficient gratuitement de la persistance localStorage et de
l'undo/redo.

**Tests.** Tests unitaires sur les trois transforms : ajout, mise à jour,
suppression, et rétrocompat (`textNotes` absent → initialisé proprement).
Les composants React (`TextNotePopup`, `TextNotesLayer`) ne sont pas testés
unitairement — convention du projet (aucun test composant, Phase H non
livrée) : vérification par `tsc` strict + contrôle visuel.

## Hors périmètre (YAGNI)

- Extension du type `Annotation` — explicitement écarté au profit de
  `TextNote`.
- Export PDF des notes (`StepThumbnail`).
- Toggle de visibilité global — les notes sont délibérément placées, toujours
  affichées.
- Notes globales (visibles sur toutes les étapes) — la portée est par étape.
- Style riche du texte (gras, couleur, taille) — V1 = texte simple.
- Glisser-déposer d'une note existante pour la repositionner — V1 = position
  fixée à la création (édition = texte uniquement).

## Fichiers touchés

- **Modifier** : `src/lib/types/index.ts` (`TextNote`, `Step.textNotes`,
  `Tool`), `src/hooks/useAppState.ts` (câblage transforms),
  `src/components/OffenseToolsPanel.tsx` (outil + icône),
  `src/hooks/useKeyboardShortcuts.ts` (raccourci `T`),
  `src/hooks/useCourtPointerHandlers.ts` (clic création/édition),
  `src/components/CourtView.tsx` (montage couche + popup).
- **Créer** : `src/lib/state/transforms/textNoteTransforms.ts` + tests,
  `src/components/court/TextNotePopup.tsx`,
  `src/components/court/TextNotesLayer.tsx`.
