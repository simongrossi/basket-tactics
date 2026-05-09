# Édition du scénario en popup plein écran

**Date** : 2026-05-09
**Type** : Refonte UX (UI)

## Contexte

Le panneau `ScenarioPanel` ([src/components/ScenarioPanel.tsx](../../src/components/ScenarioPanel.tsx), ~625 lignes) occupe une grande hauteur dans la colonne gauche. Il empile : description, liste d'actions FIBA dépliables avec formulaires de paramètres inline, sous-section couvertures défensives par action, section défense libre, bouton "+ ajouter une action", bouton "🗑 effacer le scénario".

La colonne gauche est saturée (Attaque + Scénario + Bibliothèque + Paramètres) et l'utilisateur n'a pas la place de manipuler confortablement un scénario à 4-5 actions avec leurs couvertures.

## Objectif

Réduire le panneau de gauche à un **résumé minimal** (juste les libellés) avec un bouton qui ouvre un **popup plein écran** contenant tout l'éditeur. Aucune logique métier ne change — c'est un déplacement DOM avec un découpage en deux composants.

## Design

### Composant `ScenarioPanel` (résumé)

Fichier : [src/components/ScenarioPanel.tsx](../../src/components/ScenarioPanel.tsx) — réécriture complète.

Contenu :
- Titre `🎬 Scénario` (déjà géré par `Panel`)
- Si la liste est vide : message _"Aucune action."_ en italique gris
- Si non vide : liste compacte des libellés, sans dépliage, sans formulaires, sans suppression :
  - Actions offensives : `#01 Drive`, `#02 Pick & Roll central`, … (orange, badge `#NN` numéroté à partir de 1, label = `def.label`)
  - Couvertures défensives attachées : indentées sous leur parent, format `🛡️ <label>` (bleu)
  - Actions défensives libres : section finale `🛡️ DÉFENSE (LIBRE)` puis `🛡️ <label> · steps NN`
- Un seul bouton en bas : `✏️ ouvrir le scénario` (style `Button theme="offense" variant="solid" fullWidth`)

Cliquer sur le bouton appelle `props.onOpenEditor()`.

### Composant `ScenarioEditorModal` (popup)

Fichier : `src/components/ScenarioEditorModal.tsx` — nouveau.

Contenu = **tout ce qui est aujourd'hui dans `ScenarioPanel`**, déplacé tel quel :
- Texte d'intro ("Empile des actions FIBA nommées…")
- Liste d'actions offensives dépliables (header, badge #NN, label, ▼/▲, ✕, formulaires `ActionForm`, boutons monter/descendre, sous-section couvertures défensives)
- Section actions défensives libres dépliables (`DefensiveActionForm`, steps cibles)
- Bouton `+ Ajouter une action` qui ouvre l'`AddActionModal` interne (inchangé)
- Bouton `🗑 Effacer le scénario`
- `AddCoverageModal` rendu conditionnellement (inchangé)

Structure de la modale (cohérente avec `AddActionModal` du même fichier d'origine) :
- Overlay : `position: fixed; inset: 0; background: rgba(15,23,42,0.45); zIndex: 1000`
- Conteneur centré : `width: min(900px, 95vw); maxHeight: 90vh; background: #fff; borderRadius: 12; display: flex; flexDirection: column; overflow: hidden; boxShadow: 0 20px 60px rgba(15,23,42,0.3)`
- Clic sur l'overlay → ferme
- Clic dans le conteneur → `stopPropagation`
- Touche `Échap` → ferme

Header sticky :
- Titre `🎬 Édition du scénario`
- Bouton `✕` à droite (ferme)

Body scrollable (`overflow: auto; flex: 1; padding: 14px 18px`) :
- Texte d'intro
- Liste des actions offensives
- Section défense libre

Footer sticky bas (`borderTop: 1px solid; padding: 12px 18px; display: flex; gap: 8px`) :
- `+ Ajouter une action` (à gauche, orange solide)
- `🗑 Effacer le scénario` (si liste non vide, neutre)
- `Fermer` (à droite, neutre)

### Sous-composants & helpers à déplacer

Tous extraits du `ScenarioPanel.tsx` actuel et déplacés dans `ScenarioEditorModal.tsx` :
- Modal interne `AddActionModal` (~170 lignes)
- Composant `ActionForm` (~40 lignes)
- Helpers `paramOptionsFor`, `defaultParamsFor`
- Constantes locales `ATTACKER_IDS`, `SIDES`, `DRIVE_DIRECTIONS`, `PARAM_LABELS`

### Câblage dans `page.tsx`

- Nouvel état local : `const [showScenarioEditor, setShowScenarioEditor] = useState(false);`
- `ScenarioPanel` reçoit en plus : `onOpenEditor={() => setShowScenarioEditor(true)}`
- Nouveau rendu conditionnel après la grille principale (à côté de `<PlaybookView>` etc.) :
  ```tsx
  {showScenarioEditor && (
    <ScenarioEditorModal
      scriptedActions={...}
      onAddAction={...}
      onUpdateAction={...}
      onDeleteAction={...}
      onMoveAction={...}
      onClearAll={...}
      onAddDefensiveAction={...}
      onUpdateDefensiveAction={...}
      onDeleteDefensiveAction={...}
      onClose={() => setShowScenarioEditor(false)}
    />
  )}
  ```

### Props

```ts
// ScenarioPanel — gros allègement
interface ScenarioPanelProps {
  scriptedActions: ScriptedAction[];
  onOpenEditor: () => void;
}

// ScenarioEditorModal — props identiques au ScenarioPanel actuel + onClose
interface ScenarioEditorModalProps {
  scriptedActions: ScriptedAction[];
  onAddAction: (action: ScriptedAction) => void;
  onUpdateAction: (id: string, action: ScriptedAction) => void;
  onDeleteAction: (id: string) => void;
  onMoveAction: (id: string, dir: 'up' | 'down') => void;
  onClearAll: () => void;
  onAddDefensiveAction: (
    type: DefensiveActionType,
    params: DefensiveActionParams,
    parentActionId?: string,
    affectedSteps?: number[],
  ) => void;
  onUpdateDefensiveAction: (id: string, updated: DefensiveScriptedAction) => void;
  onDeleteDefensiveAction: (id: string) => void;
  onClose: () => void;
}
```

## Tests

Pas de logique métier — vérification manuelle :
1. Le panneau gauche n'affiche plus que la liste des libellés + bouton ouvrir
2. Clic sur "✏️ ouvrir le scénario" → modale s'ouvre
3. Toutes les opérations existantes fonctionnent dans la modale (ajouter, éditer params, déplier, déplacer, supprimer, ajouter couverture, effacer scénario)
4. Échap ferme la modale (sans déclencher la sortie de plein écran de `presentMode`)
5. Clic en dehors de la modale ferme la modale
6. La modale s'affiche par-dessus le `FloatingActionsMenu` (z-index)
7. Le résumé à gauche se met à jour en temps réel quand on édite dans la modale

## Hors scope

- Pas de modification de la logique métier (compilation d'étapes, défaults défensifs, etc.)
- Pas de modification de `AddCoverageModal`, `DefensiveActionForm`
- Pas d'animation d'ouverture/fermeture
- Pas de raccourci clavier pour ouvrir la modale
- Pas de différence de rendu entre desktop et mobile (la modale est centrée et capée à 95vw / 90vh)
