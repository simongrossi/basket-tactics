# Bibliothèque systèmes

Format des templates et procédure pour en ajouter.

## Templates fournis (v1)

| ID | Nom | Étapes | Description |
|----|-----|--------|-------------|
| `pnr-central` | PNR central | 4 | Pick & roll au centre. O5 monte poser l'écran, O1 attaque, O5 plonge. |
| `horns-flare` | Horns flare | 4 | Alignement Horns. O1 passe à O2 puis utilise un flare screen de O5 côté faible pour un tir extérieur. |
| `pindown-corner` | Pindown coin | 4 | O4 descend poser un pindown pour O2 au coin. O2 sort vers l'aile et reçoit la passe pour un tir. |

Définis dans [`src/lib/data/templates.ts`](../src/lib/data/templates.ts).

## Format Template

```typescript
interface Template {
  id: string;                  // identifiant unique
  name: string;                // nom court affiché dans la liste
  description: string;         // 1 phrase, affichée sous le nom
  defenseInitial: DefenderPositions;  // positions D1-D5 au début
  steps: Step[];               // étapes pré-construites
}
```

Chaque `Step` :

```typescript
interface Step {
  off: AttackerPositions;            // positions O1-O5
  ballCarrier: AttackerId;           // qui a la balle
  annotations: Annotation[];         // flèches dessinées
  label?: string;                    // titre de l'étape
}
```

## Coordonnées du terrain

Le SVG terrain fait 600×560 (demi-terrain). Le panier est à `(300, 75)`. La raquette occupe `x: 240–360, y: 20–210`. La ligne 3 points est un arc de rayon 220 centré sur le panier.

Repères utiles :
- **Top of key** : `(300, 290)`
- **Wing gauche** : `(140, 280)` — angle 3 points gauche
- **Wing droit** : `(460, 280)` — angle 3 points droit
- **Coin gauche** : `(80, 140)` — proche ligne de fond
- **Coin droit** : `(520, 140)`
- **Bloc bas gauche** : `(230, 155)` — dans la raquette
- **Bloc bas droit** : `(370, 155)`
- **Elbow gauche** : `(245, 215)` — angle FT line / paint
- **Elbow droit** : `(355, 215)`
- **Free throw line** : `y = 210`
- **Mid-court** : `y = 540`

## Comment ajouter un template

1. Définir les positions de chaque étape :

```typescript
const myActionSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 },
  O5: { x: 380, y: 220 },
};

const myActionStep2: AttackerPositions = {
  ...myActionSetup,
  O5: { x: 290, y: 340 },  // O5 monte
};
```

L'astuce du spread `{...prev}` minimise la duplication : seuls les joueurs qui bougent sont redéclarés.

2. Construire les annotations correspondantes :

```typescript
{
  type: 'cut',
  fromId: 'O5',
  toId: null,
  from: myActionSetup.O5,
  to: myActionStep2.O5,
}
```

3. Helper pour la défense initiale :

```typescript
defenseInitial: defaultDef(myActionSetup),
```

`defaultDef()` aligne les défenseurs entre leur attaquant et le panier à 40px de distance — bon point de départ. À ajuster ensuite manuellement si besoin (poste bas qui fronte, etc.).

4. Créer la structure :

```typescript
const MY_ACTION: Template = {
  id: 'my-action',
  name: 'Mon action',
  description: 'Description en 1 phrase.',
  defenseInitial: defaultDef(myActionSetup),
  steps: [
    {
      label: 'Setup',
      off: myActionSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'Step 2',
      off: myActionStep2,
      ballCarrier: 'O1',
      annotations: [/* ... */],
    },
    // ...
  ],
};
```

5. L'enregistrer dans le tableau exporté :

```typescript
export const TEMPLATES: Template[] = [PNR_CENTRAL, HORNS_FLARE, PINDOWN_CORNER, MY_ACTION];
```

## Templates à ajouter (backlog)

Voir [IDEAS.md](../IDEAS.md). Candidats :
- **Spain PNR** : PNR central avec back-screen sur le défenseur du screener
- **UCLA cut** : passe latérale + back-screen high post pour cut basket
- **Iverson cut** : double écran top-of-key pour traverser
- **Floppy** : option deux côtés, le coupeur choisit son écran
- **Hammer action** : skip pass + back-screen baseline côté faible
- **PNR aile / step-up / step-back** : variantes de pick & roll

## Tester un template

Au chargement, le moteur recalcule entièrement la défense à partir de l'`AppState` courant (système, règles, triggers). Donc un template doit "fonctionner" avec n'importe quelle config défensive.

Tests à faire après ajout :
- Vérifier visuellement que les étapes s'enchaînent logiquement (▶ play)
- Vérifier que les annotations correspondent aux mouvements (passe = ballon change, dribble = porteur bouge avec balle)
- Tester contre différents systèmes défensifs (man + over, man + switch, zone 2-3) pour voir si la réponse est crédible
- Exporter en playbook PDF pour vérifier la lisibilité figée
