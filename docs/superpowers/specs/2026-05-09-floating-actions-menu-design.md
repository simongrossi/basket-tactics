# Menu d'actions globales flottant

**Date** : 2026-05-09
**Type** : Refonte UX (UI)

## Contexte

Le bloc `🏀 Actions` ([src/components/ActionsPanel.tsx](../../src/components/ActionsPanel.tsx)) en haut de la colonne gauche empile 5 boutons full-width (plein écran, playbook PDF, exporter JSON, importer JSON, reset complet). Il consomme une hauteur significative dans une colonne déjà chargée (Attaque, Défense, Scénario, Bibliothèque, Paramètres).

Ces actions sont **globales** et utilisées ponctuellement — elles n'ont pas besoin d'être visibles en permanence.

## Objectif

Remplacer le bloc par un **bouton flottant** ancré au terrain qui ouvre un **menu déroulant** contenant les mêmes 5 actions. Libérer la verticalité de la colonne gauche tout en gardant les actions accessibles depuis le mode plein écran.

## Design

### Nouveau composant

`src/components/FloatingActionsMenu.tsx`

- Bouton circulaire ~32px, icône `⋯`, fond blanc, bordure légère, ombre douce
- Positionné `position: absolute; top: 8px; right: 8px; z-index: 50` dans le conteneur du terrain (parent direct de `CourtView`)
- Reste visible en mode plein écran (les panneaux sont masqués mais le terrain reste affiché)

### Menu déroulant

- Ancré sous le bouton, aligné à droite
- Largeur ~200px, items empilés verticalement, padding `6px 10px`
- Style cohérent avec les boutons existants de l'app (radius 6px, fontSize 12)
- Items dans l'ordre :
  1. `🎬 plein écran` ou `✕ quitter plein écran` (label dynamique selon `presentMode`)
  2. `📄 playbook PDF`
  3. `exporter JSON`
  4. `importer JSON`
  5. divider visuel (1px gris clair)
  6. `reset complet` (couleur `#b91c1c`)

### Interactions

- Clic sur le bouton → toggle ouvert/fermé
- Clic sur un item → exécute l'action puis ferme le menu
- Clic extérieur (sur n'importe quel élément hors du menu/bouton) → ferme
- Touche `Échap` → ferme le menu **sans déclencher la sortie de plein écran** (si menu ouvert, Échap consomme l'event et ne propage pas au handler de plein écran)

### Props

```ts
interface FloatingActionsMenuProps {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  onOpenPlaybook: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}
```

Identiques à celles d'`ActionsPanel` actuel.

## Suppressions

- `src/components/ActionsPanel.tsx` → supprimé
- L'import et l'usage dans [src/app/page.tsx:11](../../src/app/page.tsx) et [src/app/page.tsx:177](../../src/app/page.tsx) → retirés
- Les mêmes props sont câblées au nouveau composant `FloatingActionsMenu`, monté dans le conteneur du terrain (à identifier dans `page.tsx` ou `CourtView`)

## Intégration

Le composant doit être monté **dans le même conteneur** que `CourtView`, qui sert de référence positionnelle (`position: relative`). Vérifier dans `page.tsx` que ce conteneur a bien `position: relative` ou l'ajouter sinon.

## Tests

Pas de logique métier — c'est un composant de présentation. Le test manuel suffit :
- Bouton visible en haut à droite du terrain en mode normal
- Bouton visible en haut à droite du terrain en mode plein écran
- Menu s'ouvre/ferme au clic sur le bouton
- Chaque action fonctionne (déclenche le bon callback)
- Clic extérieur ferme le menu
- Échap ferme le menu sans quitter le plein écran (si menu ouvert)
- Le bloc `🏀 Actions` n'apparaît plus dans la colonne gauche

## Hors scope

- Pas de refonte des autres panneaux de la colonne gauche
- Pas de raccourcis clavier nouveaux pour les actions individuelles
- Pas d'animation d'ouverture/fermeture du menu (transition CSS simple suffit)
