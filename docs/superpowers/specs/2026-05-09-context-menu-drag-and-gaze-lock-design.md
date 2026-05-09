# ContextMenu déplaçable + verrouillages de regard

**Date** : 2026-05-09
**Type** : UX + petite feature (orientation)

## Contexte

Deux pains points actuels sur le menu contextuel des joueurs ([src/components/ContextMenu.tsx](../../src/components/ContextMenu.tsx)) :

1. **Le popup masque la zone du terrain qu'on est en train d'éditer.** L'utilisateur ne peut pas voir où sont les autres joueurs ni l'effet visuel de ses changements. Le popup est positionné automatiquement (`autoFlipPosition`) mais reste figé à cet emplacement.

2. **Le slider "orientation regard" produit un angle statique.** L'utilisateur veut que le regard suive automatiquement une cible (son homme, le porteur, ou le midpoint des deux), même quand les joueurs bougent d'une étape à l'autre. Un angle figé devient incohérent dès qu'on change d'étape.

## Objectif

Rendre le popup déplaçable manuellement, et remplacer le slider d'angle de regard par un sélecteur de cible (lock dynamique).

## Design

### A. ContextMenu déplaçable

#### Comportement

- Un **header drag-handle** apparaît en haut du popup, contenant le label du joueur (`D2`, `O1`, etc.) et le bouton `✕`.
- Pointer down sur le header (sauf sur le bouton `✕`) → début du drag, le popup suit la souris.
- Pointer up → fin du drag.
- L'état `pos` existant est mis à jour pendant le drag (déjà un `useState({x, y})` dans le composant).
- Curseur : `grab` au survol du header, `grabbing` pendant le drag.
- Le popup reste contraint dans le viewport visible (le `autoFlipPosition` actuel s'applique au mount mais pas pendant le drag — on accepte cette différence : pendant le drag c'est la souris qui décide).
- **Reset de position** : quand le `key` du popup change (joueur cible différent), la position revient à la valeur initiale (`initialX`, `initialY`). Ça évite que le popup s'ouvre au coin du terrain pour un nouveau joueur juste parce qu'on l'avait déplacé pour le précédent.

#### Implémentation

- Refacto léger dans [ContextMenu.tsx](../../src/components/ContextMenu.tsx) : extraire le header existant (`{title} ✕`) dans une zone propre avec les handlers `onPointerDown`, `onPointerMove`, `onPointerUp`.
- Pas de localStorage — la position est éphémère, perdue à la fermeture du popup.

### B. Verrouillages de regard (gazeLock)

#### Modèle de données

Dans [src/lib/types/index.ts:225-232](../../src/lib/types/index.ts), `DefenderRule` :

```ts
export interface DefenderRule {
  // ... champs existants
  // SUPPRIMER : gazeOrientation?: number (l'angle figé)
  // AJOUTER :
  /** Verrouillage du regard sur une cible dynamique. Le regard suit la
   *  position courante de la cible étape par étape. Si non défini,
   *  comportement auto selon la stance. */
  gazeLock?: 'opponent' | 'ball-carrier' | 'both';
}
```

Trois valeurs :
- `'opponent'` : regard sur l'homme marqué (`matchedTo`)
- `'ball-carrier'` : regard sur le porteur de balle
- `'both'` : regard sur le midpoint des deux (vision "head-on-swivel")
- `undefined` (default) : comportement actuel selon stance

#### Logique dans `computeDefenderOrientation`

Dans [src/lib/logic/orientation.ts](../../src/lib/logic/orientation.ts), `DefenderOrientationInput` ajoute :

```ts
gazeLock?: 'opponent' | 'ball-carrier' | 'both';
```

Dans la section `3. Gaze (regard)` (~lignes 156-176), avant le calcul auto par stance, on injecte le lock prioritaire :

```ts
let gazeTarget: Point;
if (gazeLock === 'opponent') {
  gazeTarget = manPos;
} else if (gazeLock === 'ball-carrier') {
  gazeTarget = ballPos;
} else if (gazeLock === 'both') {
  gazeTarget = { x: (manPos.x + ballPos.x) / 2, y: (manPos.y + ballPos.y) / 2 };
} else if (isCarrierDefender) {
  gazeTarget = manPos;
} else if (pnrRole === 'tag' || pnrRole === 'x-out' || pnrRole === 'stunt') {
  gazeTarget = ballPos;
} else if (stance === 'fronting' || stance === 'deny-3q' || stance === 'stunt') {
  gazeTarget = ballPos;
} else {
  gazeTarget = ballPos;
}
```

Le clamp anatomique `clampGazeToFrontal` reste appliqué après. Donc le lock est une **préférence** : si la cible est hors du cône ±60° du corps, le regard est ramené au bord du cône.

L'ancien `manualGaze` (un angle absolu) est supprimé du flow — il n'avait plus de sens dès qu'on remplace par des locks.

#### UI dans `ContextMenu.tsx`

Remplace le slider d'angle `orientation regard` actuel (lignes ~735-750) par un sélecteur compact à boutons :

```
orientation regard  [auto] [🔒 mon homme] [🔒 le porteur] [🔒 les deux]
```

Boutons type "toggle radio", style cohérent avec les boutons "auto/manuel" déjà présents en haut du menu (orange si actif, blanc sinon, fontSize 11).

**Cas particulier** : si le défenseur édité est le `carrierDefender` (= il marque le porteur), le bouton `🔒 mon homme` est **masqué** (il fait doublon avec `🔒 le porteur`). Détection : props.rule.matchedTo === ballCarrier.

#### Câblage

- Le `ContextMenu` reçoit déjà `rule: DefenderRule` et `onUpdate(patch: Partial<DefenderRule>)`.
- Cliquer sur un bouton → `onUpdate({ gazeLock: 'opponent' | 'ball-carrier' | 'both' | undefined })`.
- Bouton `auto` → `onUpdate({ gazeLock: undefined })`.
- Le `useAppState.updateRule` propage déjà `Partial<DefenderRule>` correctement, pas de changement nécessaire.
- Le moteur (`engine.ts`) lit `state.rules[id].gazeLock` quand il appelle `computeDefenderOrientation`. Il faut **chercher tous les call sites** de `computeDefenderOrientation` et passer `gazeLock`.

## Tests

Pas de logique métier complexe — vérification manuelle :

1. Ouvrir le ContextMenu d'un défenseur → header avec drag possible
2. Glisser le popup ailleurs → suit la souris, reste là après relâchement
3. Fermer + ouvrir le popup pour un autre joueur → position revient à l'initiale
4. Activer `🔒 le porteur` sur D2 → triangle/bras de D2 pointent vers O1 (et restent vers O1 si on change d'étape avec le porteur qui change de position)
5. Activer `🔒 les deux` sur D2 → regard pointe vers le midpoint O1-O2 (l'homme de D2)
6. Carrier defender (D1 marque O1) : option `🔒 mon homme` masquée du sélecteur
7. Cas extrême : si la cible verrouillée est anatomiquement derrière le corps (clamp ±60°), le regard est ramené au bord du cône, **jamais derrière**

Tests unitaires possibles à ajouter dans `src/lib/logic/__tests__/orientation.test.ts` (déjà existant) :
- `gazeLock = 'opponent'` → gaze pointe vers manPos (modulo clamp)
- `gazeLock = 'ball-carrier'` → gaze pointe vers ballPos
- `gazeLock = 'both'` → gaze pointe vers midpoint
- `gazeLock` + cible hors cône → clamp respecté

## Hors scope

- Pas de migration des `gazeOrientation: number` existantes dans les `defenseInitial` ou les step rules (le champ disparaît, valeurs anciennes ignorées par TypeScript après suppression du champ — pas de feature de masse côté user, peu probable que ça impacte).
- Pas de verrouillage côté attaquant (`AttackerOrientationInput`).
- Pas de slider d'angle restitué quelque part — si besoin futur, on l'ajoutera comme 5e option ou dans un sous-menu "avancé".
- Pas de persistance de la position du popup entre ouvertures (volontairement éphémère).
- Pas d'animation de drag (transformation directe).
