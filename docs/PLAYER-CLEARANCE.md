# Anti-superposition — règle absolue

**Règle inviolable, sans exception.**

> **Aucun joueur ne peut chevaucher un autre joueur, quels qu'ils soient.**
> Coéquipiers, adversaires, défenseur sur son homme matché, deux poseurs,
> deux défenseurs entre eux : **toutes les paires** doivent respecter
> `PLAYER_MIN_CLEARANCE_PX = 34 px` (≈ 2 × rayon sprite + 2 px de marge).

Cette règle l'emporte sur tout réalisme tactique. Le coach doit voir un
terrain lisible à tout moment ; deux sprites superposés sont
visuellement illisibles et brisent immédiatement l'utilité pédagogique
de l'outil.

## Constante de référence

```typescript
// src/lib/data/court.ts
export const PLAYER_RADIUS = 16;
export const PLAYER_MIN_CLEARANCE_PX = PLAYER_RADIUS * 2 + 2; // = 34
```

Le `+ 2` est la marge anti-aliasing : à 34 px de centre à centre, les
deux cercles de 16 px de rayon ont **2 px d'espace** entre leurs bords.

## Mécanismes d'enforcement

La règle est appliquée à **trois niveaux indépendants** pour qu'aucun
chemin de code ne puisse la contourner :

### Niveau 1 — Drag utilisateur (édition libre)

`src/lib/logic/playerMove.ts` → `moveAttackerInState` et
`moveDefenderInState` appellent **`pushOutOfOtherPlayers`** avant tout
write. Le point cible du drag est itérativement repoussé hors de tous
les autres joueurs actifs (attaquants + défenseurs) jusqu'à respecter
la clearance.

S'applique pendant le drag (`moveAttackerDuringDrag` /
`moveDefenderDuringDrag`) et au commit final → le coach ne peut
**physiquement pas** créer une superposition avec la souris.

### Niveau 2 — Moteur défensif (édition libre + génération scriptée)

`src/lib/logic/geometry.ts` → `resolvePlayerCollisions` est appelé en
fin de `effectiveDefensePositions` (cf. `defense/speedConstraint.ts:493`).
Pour chaque défenseur, il pousse sa position hors de **tous les
attaquants + tous les autres défenseurs**, sans exception.

> ⚠️ Note historique : une exception "matched coller" autorisait un
> défenseur à se poser sur son attaquant matché (le D1 peut visuellement
> coller à son O1 en défense serrée). **Supprimée mai 2026** suite au
> retour utilisateur. La défense "coller" reste tactiquement possible
> via `manTarget` qui clampe `targetDist = Math.max(MIN_CLEARANCE, …)`
> — mais visuellement les sprites restent séparés de 34 px.

### Niveau 3 — Playback (frame interpolation)

Deux solveurs distincts pendant l'animation entre 2 steps :

**3a. Attaquants entre eux** (`frameResolver.ts` étape 1.b) :
`pushOutOfMany` itéré 5 passes sur les positions interpolées de tous
les attaquants. **Aucune exception.** Indispensable quand les
trajectoires de 2 attaquants SE CROISENT (ex : O1 dribble vers la
droite + O3 vient poser un écran au milieu — sans ce solveur, ils sont
visuellement empilés à t≈0.35). Cf. systeme_basket-10.json, scénario
reproducteur dans `userJsonOverlap.test.ts`.

**3b. Défenseurs** (`frameResolver.ts` étape 5) : `resolvePlayerCollisions`
sur tous les défenseurs après leur interpolation. Le set
`screenLockedDefenders` SKIP la résolution pour les défenseurs en
contact d'écran (anti-flicker visuel).

**3c. Projection finale commune (F11)** : après les couches tactiques et
l'inertie, `solveMovingEntityCollisions` traite les dix joueurs ensemble.
Chaque paire est séparée de 34 px au minimum. Les normales viennent de la
frame canonique précédente : le défenseur peut être corrigé sans changer
brutalement de côté autour du poseur. Le poseur reste une ancre fixe ; le
screen-lock n'exempte plus un défenseur de la séparation finale.

Les disques de déplacement (9 px par sous-pas) et les demi-plans séparateurs
sont projetés dans la même boucle. Aucun clamp ultérieur ne peut recréer une
superposition. Deux images intermédiaires issues du même prédécesseur restent
ainsi dans le budget visuel de 18 px, indépendamment des FPS affichés.

Si les contraintes sont incompatibles (deux poseurs importés au même point,
ancre téléportée), la séparation est prioritaire : placement déterministe,
première ancre conservée, puis correction des autres joueurs. Ce cas invalide
peut dépasser le budget de déplacement ; le diagnostic des durées et mouvements
impossibles reste le chantier F12.

## Tests garde-fous

`src/lib/logic/__tests__/overlapInvariants.test.ts` verrouille :

1. **Tout D ↔ tout O** (matched ou non) ≥ 34 px après `effectiveDefensePositions`
2. **Tout D ↔ tout autre D** ≥ 34 px
3. **Tout A ↔ tout autre A** ≥ 34 px après `moveAttackerInState`
4. Scénario user (O3 poseur PILE sur O1 porteur + tag-then-switch
   activé) → toutes les paires restent ≥ 34 px
5. Override pathologique (D5 forcé sur O3) → engine pousse à 34 px
6. Override matched pathologique (D1 forcé sur O1) → engine pousse
   à 34 px (preuve qu'il n'y a plus d'exception coller)

`src/lib/logic/__tests__/invariants.test.ts` valide pareil sur les
7 playbooks de la bibliothèque (PNR central, Horns flare, Pindown coin,
Spain PNR, UCLA cut, Floppy, Hammer) — pour chaque step de chaque
playbook, aucun chevauchement.

## Comment ajouter un nouveau chemin d'écriture de position

Si tu écris une nouvelle fonction qui mute une position (ex : un nouvel
import depuis JSON, une transformation batch, un nouveau type de drag) :

- ✅ Passe par `moveAttackerInState` / `moveDefenderInState` si
  possible — le push-out est appliqué automatiquement.
- ⚠️ Si tu écris directement dans `state.steps[i].off[id]` ou
  `state.steps[i].defenseOverrides[id]`, **tu cours le risque** de
  créer une superposition. Ajoute un appel explicite à
  `pushOutOfMany(target, otherPlayers, PLAYER_MIN_CLEARANCE_PX)`
  avant le write.
- ✅ Ajoute un cas test dans `overlapInvariants.test.ts` qui charge
  ton nouveau chemin et vérifie la clearance.

## Cas particuliers documentés

- **Ballon ↔ joueur** : pas de clearance imposée. Le ballon est plus
  petit (rayon ~6 px) et son interaction avec le porteur est gérée
  visuellement (offset main). Ne s'applique pas ici.
- **Joueurs inactifs (≠ playerCount)** : ignorés par les solveurs.
  En config 3v3, O4/O5/D4/D5 ne contraignent personne.
- **Zone homepos editor** : `state.zoneOverrides[regionId].homePos`
  n'est PAS contraint par cette règle (ce sont des positions
  conceptuelles de zone, pas des joueurs).
