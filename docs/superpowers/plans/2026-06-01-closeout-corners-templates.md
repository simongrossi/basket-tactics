# Closeout shooters + Spacing corners + Templates offensifs — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Modéliser la qualité du closeout sur un shooter, (2) inciter le spacing aux coins pour les profils shooter/stretch-big, (3) ajouter 3 templates offensifs (Iverson, Stagger, PNR aile).

**Architecture:** Trois chantiers strictement indépendants — chacun se termine par commit+push. #1 touche `types/index.ts` + `speedConstraint.ts` + `Player.tsx` + 1 nouvelle règle coach. #2 touche uniquement `positionOffBall.ts`. #3 touche uniquement `templates.ts`.

**Tech Stack:** TypeScript strict, Vitest (TDD), SVG inline pour les anneaux Player.

---

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| #1 | `src/lib/types/index.ts` | Ajouter `closeoutQuality` sur `ComputedDefender` |
| #1 | `src/lib/logic/defense/speedConstraint.ts` | Calculer + propager `closeoutQuality` |
| #1 | `src/components/Player.tsx` | Colorer le ring selon quality |
| #1 | `src/lib/logic/coachDiagnostics/rules/shooterCloseout.ts` | Nouvelle règle |
| #1 | `src/lib/logic/coachDiagnostics/index.ts` | Enregistrer la règle |
| #1 | `src/lib/logic/__tests__/shooterCloseout.test.ts` | Tests |
| #2 | `src/lib/logic/autoOffense/positionOffBall.ts` | Corner candidates + bonus |
| #2 | `src/lib/logic/__tests__/positionOffBall.test.ts` | Tests |
| #3 | `src/lib/data/templates.ts` | 3 nouveaux templates |

---

## Chantier 1 — Closeout vers shooters (quality ring)

### Tâche 1.1 — Type `closeoutQuality` sur `ComputedDefender`

**Fichiers :**
- Modifier : `src/lib/types/index.ts` (autour de la ligne 789 où `closingOut?: boolean` est défini)

- [ ] **Ajouter le type dans `index.ts`** — juste après `closingOut?: boolean` :

```typescript
  /** Qualité du closeout en cours (calculée par speedConstraint quand closingOut=true).
   *  'clean'     : dist < 80px — défenseur à portée raisonnable, contest correct.
   *  'desperate' : 80–159px   — long sprint, contest dégradé.
   *  'late'      : ≥ 160px    — tir ouvert avant l'arrivée du défenseur. */
  closeoutQuality?: 'clean' | 'desperate' | 'late';
```

- [ ] **Vérifier le build** : `npx tsc --noEmit` → zéro erreur.

---

### Tâche 1.2 — Tests unitaires (écrire avant le code)

**Fichiers :**
- Créer : `src/lib/logic/__tests__/shooterCloseout.test.ts`

- [ ] **Écrire le fichier de tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { makeMinimalState } from './helpers/stateFactory';
import { effectiveDefensePositions } from '../engine';

// Helper : construit un state minimal avec un skip pass vers O3 (shooter).
// prevDef est la position du défenseur D3 à l'étape précédente.
function makeSkipPassState(prevDefPos: { x: number; y: number }) {
  // Step 0 : O1 porteur, O3 en corner droit (547, 80). D3 loin (prevDefPos).
  // Step 1 : O3 devient porteur (skip pass reçu).
  return makeMinimalState({
    steps: [
      {
        off: { O1: { x: 300, y: 470 }, O2: { x: 100, y: 380 }, O3: { x: 547, y: 80 }, O4: { x: 200, y: 230 }, O5: { x: 400, y: 230 } },
        ballCarrier: 'O1',
        def: { D1: { x: 310, y: 440 }, D2: { x: 120, y: 360 }, D3: prevDefPos, D4: { x: 210, y: 220 }, D5: { x: 390, y: 220 } },
      },
      {
        off: { O1: { x: 300, y: 470 }, O2: { x: 100, y: 380 }, O3: { x: 547, y: 80 }, O4: { x: 200, y: 230 }, O5: { x: 400, y: 230 } },
        ballCarrier: 'O3',
        def: { D1: { x: 310, y: 440 }, D2: { x: 120, y: 360 }, D3: prevDefPos, D4: { x: 210, y: 220 }, D5: { x: 390, y: 220 } },
      },
    ],
    attackerProfiles: { O1: 'creator', O2: 'slasher', O3: 'shooter', O4: 'rim-roller', O5: 'stretch-big' },
  });
}

describe('closeoutQuality — qualité du closeout sur shooter', () => {
  it('clean : D3 à 60px du corner — closeoutQuality = clean', () => {
    // D3 est déjà proche du corner (60px), closeout court.
    const state = makeSkipPassState({ x: 540, y: 138 }); // ~60px de O3
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('clean');
  });

  it('desperate : D3 à 120px — closeoutQuality = desperate', () => {
    const state = makeSkipPassState({ x: 500, y: 185 }); // ~120px de O3
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('desperate');
  });

  it('late : D3 à 200px — closeoutQuality = late', () => {
    const state = makeSkipPassState({ x: 400, y: 250 }); // ~200px de O3
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('late');
  });

  it('sans closingOut (porteur inchangé) — closeoutQuality undefined', () => {
    const state = makeSkipPassState({ x: 540, y: 138 });
    const result = effectiveDefensePositions(state, 0); // step 0, O1 porteur inchangé
    expect(result.D1.closingOut).toBeUndefined();
    expect(result.D1.closeoutQuality).toBeUndefined();
  });
});
```

- [ ] **Lancer les tests** : `npx vitest run src/lib/logic/__tests__/shooterCloseout.test.ts`
  - Attendu : 4 tests FAIL (`closeoutQuality` n'existe pas encore dans la sortie).

---

### Tâche 1.3 — Implémenter `closeoutQuality` dans `speedConstraint.ts`

**Fichier :** `src/lib/logic/defense/speedConstraint.ts`

Chercher le bloc à la ligne ~461 :
```typescript
const closingOut = isCloseoutTransition && targets[dId].isCarrierDefender;
const overClosed = isOverClosedTransition && targets[dId].isCarrierDefender;
```

- [ ] **Ajouter le calcul de qualité juste après** :

```typescript
const closingOut = isCloseoutTransition && targets[dId].isCarrierDefender;
const overClosed = isOverClosedTransition && targets[dId].isCarrierDefender;

// Qualité du closeout : distance que le défenseur doit parcourir vers le
// nouveau porteur. Utilisé pour colorer le ring et le diagnostic coach.
let closeoutQuality: 'clean' | 'desperate' | 'late' | undefined;
if (closingOut) {
  const defFrom = prevPositions[dId] ?? from;
  const carrierTargetPos = curStep.off[curCarrier as keyof typeof curStep.off] as { x: number; y: number } | undefined;
  if (carrierTargetPos) {
    const dist = Math.hypot(defFrom.x - carrierTargetPos.x, defFrom.y - carrierTargetPos.y);
    closeoutQuality = dist < 80 ? 'clean' : dist < 160 ? 'desperate' : 'late';
  }
}
```

- [ ] **Propager dans la sortie** — dans les deux blocs `out[dId] = { ... }` (lignes ~623 et ~667), ajouter après `overClosed: overClosed || undefined,` :

```typescript
closeoutQuality: closeoutQuality,
```

- [ ] **Lancer les tests** : `npx vitest run src/lib/logic/__tests__/shooterCloseout.test.ts`
  - Attendu : 4 tests PASS.

- [ ] **Suite complète** : `npx vitest run`
  - Attendu : 1897+ tests PASS, 0 fail.

---

### Tâche 1.4 — Ring coloré dans `Player.tsx`

**Fichier :** `src/components/Player.tsx`

- [ ] **Ajouter `closeoutQuality` dans `PlayerProps`** — juste après `closingOut?: boolean` :

```typescript
  closeoutQuality?: 'clean' | 'desperate' | 'late';
```

- [ ] **Destructurer dans le composant** — trouver la ligne `closingOut,` dans la destructuration et ajouter en dessous :

```typescript
  closeoutQuality,
```

- [ ] **Remplacer le rendu du ring closeout** — trouver le bloc `{closingOut && !isAttacker && showStateRings && showCloseoutRing && (` et remplacer la couleur dynamiquement :

```tsx
{closingOut && !isAttacker && showStateRings && showCloseoutRing && (
  <g pointerEvents="none">
    <circle
      cx={pos.x}
      cy={pos.y}
      r={r + 5}
      fill="none"
      stroke={
        overClosed ? '#DC2626'
        : closeoutQuality === 'late' ? '#DC2626'
        : closeoutQuality === 'desperate' ? '#F97316'
        : '#22C55E'
      }
      strokeWidth={2.5}
      opacity={0.85}
    />
    <circle
      cx={pos.x}
      cy={pos.y}
      r={r + 9}
      fill="none"
      stroke={
        overClosed ? '#DC2626'
        : closeoutQuality === 'late' ? '#DC2626'
        : closeoutQuality === 'desperate' ? '#F97316'
        : '#22C55E'
      }
      strokeWidth={1}
      opacity={0.4}
    />
    {(overClosed || closeoutQuality === 'late') && (
      <text
        x={pos.x + r + 14}
        y={pos.y - r - 4}
        fontSize={9}
        fontWeight={700}
        fill="#DC2626"
      >
        ⚠
      </text>
    )}
  </g>
)}
```

- [ ] **Vérifier** : `npx tsc --noEmit` → 0 erreur.

---

### Tâche 1.5 — Règle coach `shooterCloseoutRule`

**Fichiers :**
- Créer : `src/lib/logic/coachDiagnostics/rules/shooterCloseout.ts`
- Modifier : `src/lib/logic/coachDiagnostics/index.ts`

- [ ] **Créer la règle** :

```typescript
// Règle — Closeout de qualité dégradée sur shooter/stretch-big.
//
// Quand le porteur vient de recevoir une skip pass et est un tireur extérieur,
// vérifier que le closeout est 'clean'. Si 'desperate' → warning, si 'late' → critical.
// Complément de closeoutLongRule (qui détecte late+late, pas quality sur shooter).

import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const shooterCloseoutRule: Rule = (ctx) => {
  const { defPos, carrier, profiles } = ctx;
  const out: CoachDiagnostic[] = [];

  // Seulement pertinent si le porteur est un tireur extérieur.
  if (!isOutsideThreat(profiles?.[carrier])) return out;

  const carrierDef = Object.entries(defPos).find(([, p]) => p.matchedTo === carrier);
  if (!carrierDef) return out;

  const [dId, p] = carrierDef as [string, typeof defPos[keyof typeof defPos]];
  if (!p.closingOut || !p.closeoutQuality) return out;

  const carrierLabel = withProfile(carrier, profiles?.[carrier]);

  if (p.closeoutQuality === 'late') {
    out.push({
      id: `shooter-closeout-late-${dId}`,
      severity: 'critical',
      message: `${dId} trop loin : ${carrierLabel} a le temps de tirer avant le closeout`,
      tag: 'shooter-closeout-late',
      defenders: [dId as import('../../../types').DefenderId],
      attackers: [carrier],
    });
  } else if (p.closeoutQuality === 'desperate') {
    out.push({
      id: `shooter-closeout-desperate-${dId}`,
      severity: 'warning',
      message: `${dId} ferme en urgence sur ${carrierLabel} — contest dégradé`,
      tag: 'shooter-closeout-desperate',
      defenders: [dId as import('../../../types').DefenderId],
      attackers: [carrier],
    });
  }

  return out;
};
```

- [ ] **Enregistrer dans le registry** — dans `src/lib/logic/coachDiagnostics/index.ts`, trouver le tableau `REGISTRY` et ajouter l'import + l'entrée :

```typescript
import { shooterCloseoutRule } from './rules/shooterCloseout';
// ... dans REGISTRY :
shooterCloseoutRule,
```

- [ ] **Suite complète** : `npx vitest run` → 1897+ tests PASS.

---

### Tâche 1.6 — Commit + push #1

- [ ] **Commit** :

```bash
git add src/lib/types/index.ts \
        src/lib/logic/defense/speedConstraint.ts \
        src/components/Player.tsx \
        src/lib/logic/coachDiagnostics/rules/shooterCloseout.ts \
        src/lib/logic/coachDiagnostics/index.ts \
        src/lib/logic/__tests__/shooterCloseout.test.ts
git commit -m "feat(defense): closeout quality ring — clean/desperate/late sur shooter (#5)"
```

- [ ] **Push** : `git push`

---

## Chantier 2 — Spacing aux corners pour shooter/stretch-big

### Tâche 2.1 — Tests (écrire avant le code)

**Fichier :** `src/lib/logic/__tests__/positionOffBall.test.ts`
(Le fichier existe peut-être déjà — vérifier, sinon créer.)

- [ ] **Ajouter ces tests** (ou créer le fichier) :

```typescript
import { describe, it, expect } from 'vitest';
import { computeOffBallPositions, CORNER_BONUS_PX } from '../autoOffense/positionOffBall';
import type { AttackerPositions } from '../../types';

const HOOP = { x: 300, y: 75 };

// Setup : O1 porteur au top, O2-O5 en positions neutres loin des coins.
const baseOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 200, y: 380 },
  O3: { x: 400, y: 380 },
  O4: { x: 220, y: 250 },
  O5: { x: 380, y: 250 },
};

describe('computeOffBallPositions — corner preference', () => {
  it('CORNER_BONUS_PX est exporté et vaut 45', () => {
    expect(CORNER_BONUS_PX).toBe(45);
  });

  it('un shooter préfère le corner au wing à spacing équivalent', () => {
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'shooter', O3: 'slasher', O4: 'rim-roller', O5: 'stretch-big',
    });
    const o2pos = result.find(r => r.id === 'O2')!.pos;
    // Le corner droit est à (547, 80), le corner gauche à (53, 80).
    // O2 (shooter) doit finir dans un des deux coins (x < 80 ou x > 520, y < 110).
    const inCorner = (o2pos.x < 90 || o2pos.x > 510) && o2pos.y < 120;
    expect(inCorner).toBe(true);
  });

  it('un stretch-big préfère aussi le corner', () => {
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'slasher', O3: 'non-shooter', O4: 'rim-roller', O5: 'stretch-big',
    });
    const o5pos = result.find(r => r.id === 'O5')!.pos;
    const inCorner = (o5pos.x < 90 || o5pos.x > 510) && o5pos.y < 120;
    expect(inCorner).toBe(true);
  });

  it('un non-shooter ne va pas forcément au corner', () => {
    // Le non-shooter peut aller n\'importe où — on vérifie juste que le test
    // précédent (stretch-big au corner) ne contamine pas cette config.
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'non-shooter', O3: 'slasher', O4: 'rim-roller', O5: 'rim-roller',
    });
    // Aucune assertion stricte — le non-shooter peut être dans plein d'endroits.
    // On vérifie juste que la fonction tourne sans erreur.
    expect(result).toHaveLength(4);
  });
});
```

- [ ] **Lancer les tests** : `npx vitest run src/lib/logic/__tests__/positionOffBall.test.ts`
  - Attendu : FAIL sur les tests corner (CORNER_BONUS_PX non exporté, préférence corner inexistante).

---

### Tâche 2.2 — Implémenter le corner bonus dans `positionOffBall.ts`

**Fichier :** `src/lib/logic/autoOffense/positionOffBall.ts`

- [ ] **Ajouter les constantes corner** après `CORRIDOR_PENALTY_PX` :

```typescript
/** Bonus de score (px de spacing équivalent) quand un shooter/stretch-big
 *  se positionne dans un coin. Le corner 3pts est la position #1 du basket
 *  moderne : angle favorable, défenseur forcé de sortir loin. */
export const CORNER_BONUS_PX = 45;

/** Rayon de détection autour d'un coin (px). */
const CORNER_DETECT_RADIUS = 35;

/** Positions des deux coins 3pts (demi-terrain haut, panier en y≈75). */
const CORNER_POSITIONS_HALF: readonly [{ x: number; y: number }, { x: number; y: number }] = [
  { x: 53, y: 80 },   // corner gauche
  { x: 547, y: 80 },  // corner droit
];

const CORNER_BOOSTED_PROFILES: ReadonlySet<import('../../types').OffensiveProfile> =
  new Set<import('../../types').OffensiveProfile>(['shooter', 'stretch-big']);
```

- [ ] **Modifier `generateCandidates`** — ajouter les coins comme candidates explicites pour les profils boostés. Trouver la fin de la fonction (avant `return out`) et ajouter :

```typescript
  // Pour shooter/stretch-big : injecter les 2 coins comme candidates
  // explicites (en plus de l'éventail générique).
  if (CORNER_BOOSTED_PROFILES.has(profile ?? 'creator' as import('../../types').OffensiveProfile)) {
    const corners = hoop.y < 540
      ? CORNER_POSITIONS_HALF
      : CORNER_POSITIONS_HALF.map(c => ({ x: c.x, y: 1080 - c.y }));
    corners.forEach(c => out.push(clampToCourt(c, hoop)));
  }
  return out;
```

- [ ] **Modifier la boucle de scoring** dans `computeOffBallPositions` — trouver `let score = totalSpacing(g);` et ajouter juste après :

```typescript
      // Bonus corner pour shooter/stretch-big.
      if (CORNER_BOOSTED_PROFILES.has(profile ?? 'creator' as import('../../types').OffensiveProfile)) {
        const isNearCorner = (hoop.y < 540 ? CORNER_POSITIONS_HALF : CORNER_POSITIONS_HALF.map(c => ({ x: c.x, y: 1080 - c.y })))
          .some(corner => Math.hypot(cand.x - corner.x, cand.y - corner.y) < CORNER_DETECT_RADIUS);
        if (isNearCorner) score += CORNER_BONUS_PX;
      }
```

- [ ] **Lancer les tests corner** : `npx vitest run src/lib/logic/__tests__/positionOffBall.test.ts`
  - Attendu : 4 tests PASS.

- [ ] **Suite complète** : `npx vitest run` → tous PASS.

---

### Tâche 2.3 — Commit + push #2

- [ ] **Commit** :

```bash
git add src/lib/logic/autoOffense/positionOffBall.ts \
        src/lib/logic/__tests__/positionOffBall.test.ts
git commit -m "feat(offense): corner preference pour shooter/stretch-big dans positionOffBall (#6)"
```

- [ ] **Push** : `git push`

---

## Chantier 3 — Templates offensifs (Iverson, Stagger, PNR aile)

### Tâche 3.1 — Iverson cut

Le mouvement Iverson = O1 traverse la raquette en utilisant deux écrans hauts
successifs (O4 elbow G puis O5 elbow D), ressort côté opposé.

**Fichier :** `src/lib/data/templates.ts`

- [ ] **Ajouter les positions et le template** à la fin du fichier, avant l'accolade finale `];` :

```typescript
// ============================================================
// Iverson cut — O1 traverse la raquette sur 2 écrans elbow
// ============================================================
const iversonSetup: AttackerPositions = {
  O1: { x: 300, y: 420 },   // top, porteur
  O2: { x: 100, y: 330 },   // wing gauche
  O3: { x: 500, y: 330 },   // wing droit
  O4: { x: 200, y: 210 },   // elbow gauche, 1er poseur
  O5: { x: 400, y: 210 },   // elbow droit, 2e poseur
};
const iversonCut1: AttackerPositions = {
  ...iversonSetup,
  O1: { x: 200, y: 340 },   // O1 amorce vers elbow G
};
const iversonCut2: AttackerPositions = {
  ...iversonCut1,
  O1: { x: 340, y: 230 },   // O1 passe sous O4 (1er écran), traverse la raquette
};
const iversonExit: AttackerPositions = {
  ...iversonCut2,
  O1: { x: 460, y: 310 },   // O1 sort côté droit, reçoit la passe en sortie d'écran
};

export const IVERSON_CUT: Template = {
  id: 'iverson-cut',
  name: 'Iverson cut',
  tags: ['set', 'iverson', 'off-ball', 'cut'],
  description: "O1 traverse la raquette en utilisant deux écrans elbow successifs (O4 puis O5) — ressort côté opposé pour recevoir une passe en sortie de course.",
  defenseInitial: defaultDef(iversonSetup),
  steps: [
    { label: 'Setup', off: iversonSetup, ballCarrier: 'O2', annotations: [] },
    {
      label: 'O1 amorce vers l\'écran O4',
      off: iversonCut1,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O1', toId: null, from: iversonSetup.O1, to: iversonCut1.O1 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: null, from: iversonSetup.O4, to: { x: iversonSetup.O4.x + 10, y: iversonSetup.O4.y + 15 } } as Annotation,
      ],
    },
    {
      label: 'O1 traverse — écran O5',
      off: iversonCut2,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O1', toId: null, from: iversonCut1.O1, to: iversonCut2.O1 } as Annotation,
        { type: 'screen', fromId: 'O5', toId: null, from: iversonSetup.O5, to: { x: iversonSetup.O5.x - 10, y: iversonSetup.O5.y + 15 } } as Annotation,
      ],
    },
    {
      label: 'Passe à O1 en sortie',
      off: iversonExit,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O1', toId: null, from: iversonCut2.O1, to: iversonExit.O1 } as Annotation,
        { type: 'pass', fromId: 'O2', toId: 'O1', from: iversonSetup.O2, to: iversonExit.O1 } as Annotation,
      ],
    },
  ],
};
```

---

### Tâche 3.2 — Stagger (double écran séquentiel)

Le Stagger = deux poseurs (O4 puis O5) posent des écrans successifs pour libérer
un shooter (O3) vers un coin ou l'aile.

- [ ] **Ajouter dans `templates.ts`** :

```typescript
// ============================================================
// Stagger — double écran séquentiel pour O3 (shooter)
// ============================================================
const staggerSetup: AttackerPositions = {
  O1: { x: 460, y: 430 },   // porteur côté droit
  O2: { x: 540, y: 310 },   // wing droit
  O3: { x: 100, y: 280 },   // shooter côté gauche, sous les écrans
  O4: { x: 200, y: 220 },   // 1er poseur (stagger bas)
  O5: { x: 290, y: 170 },   // 2e poseur (stagger haut)
};
const staggerScreen1: AttackerPositions = {
  ...staggerSetup,
  O3: { x: 200, y: 280 },   // O3 passe sous le 1er écran (O4)
};
const staggerScreen2: AttackerPositions = {
  ...staggerScreen1,
  O3: { x: 310, y: 210 },   // O3 passe sous le 2e écran (O5)
};
const staggerCatch: AttackerPositions = {
  ...staggerScreen2,
  O3: { x: 420, y: 290 },   // O3 sort en wing droit pour recevoir
};

export const STAGGER: Template = {
  id: 'stagger',
  name: 'Stagger',
  tags: ['set', 'stagger', 'off-ball', 'shooter'],
  description: "Double écran séquentiel (O4 bas, O5 haut) pour libérer O3 (shooter) vers l'aile. Le défenseur doit choisir : passer par-dessus les deux écrans ou switcher.",
  defenseInitial: defaultDef(staggerSetup),
  steps: [
    { label: 'Setup', off: staggerSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: 'O3 traverse le 1er écran (O4)',
      off: staggerScreen1,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O4', toId: null, from: staggerSetup.O4, to: { x: staggerSetup.O4.x, y: staggerSetup.O4.y + 20 } } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: staggerSetup.O3, to: staggerScreen1.O3 } as Annotation,
      ],
    },
    {
      label: 'O3 traverse le 2e écran (O5)',
      off: staggerScreen2,
      ballCarrier: 'O1',
      annotations: [
        { type: 'screen', fromId: 'O5', toId: null, from: staggerSetup.O5, to: { x: staggerSetup.O5.x, y: staggerSetup.O5.y + 20 } } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: staggerScreen1.O3, to: staggerScreen2.O3 } as Annotation,
      ],
    },
    {
      label: 'Passe → O3 en sortie d\'écran',
      off: staggerCatch,
      ballCarrier: 'O3',
      annotations: [
        { type: 'cut', fromId: 'O3', toId: null, from: staggerScreen2.O3, to: staggerCatch.O3 } as Annotation,
        { type: 'pass', fromId: 'O1', toId: 'O3', from: staggerSetup.O1, to: staggerCatch.O3 } as Annotation,
      ],
    },
  ],
};
```

---

### Tâche 3.3 — PNR aile (pick-and-roll sur l'aile à 45°)

Le PNR aile = l'écran est posé sur l'aile (45°) au lieu du haut de la raquette,
créant un angle de pénétration différent du PNR central.

- [ ] **Ajouter dans `templates.ts`** :

```typescript
// ============================================================
// PNR aile — pick-and-roll sur l'aile côté gauche
// ============================================================
const pnrWingSetup: AttackerPositions = {
  O1: { x: 130, y: 350 },   // porteur wing gauche
  O2: { x: 300, y: 460 },   // meneur top, garde l'espace
  O3: { x: 490, y: 320 },   // wing droit, corner spacing
  O4: { x: 130, y: 210 },   // O4 descend pour poser l'écran aile
  O5: { x: 370, y: 200 },   // O5 haut, rebond / spacing
};
const pnrWingScreen: AttackerPositions = {
  ...pnrWingSetup,
  O4: { x: 130, y: 310 },   // O4 en position d'écran sur l'aile
};
const pnrWingDrive: AttackerPositions = {
  ...pnrWingScreen,
  O1: { x: 220, y: 260 },   // O1 utilise l'écran, attaque la raquette
};
const pnrWingRoll: AttackerPositions = {
  ...pnrWingDrive,
  O4: { x: 230, y: 160 },   // O4 roll vers le panier
};

export const PNR_WING: Template = {
  id: 'pnr-wing',
  name: 'PNR aile',
  tags: ['pnr', 'wing', 'porteur'],
  description: "Pick-and-roll posé sur l'aile gauche à 45° — angle de pénétration différent du PNR central, oblige la défense à gérer la ligne de drive et le roll simultanément.",
  defenseInitial: defaultDef(pnrWingSetup),
  steps: [
    { label: 'Setup', off: pnrWingSetup, ballCarrier: 'O1', annotations: [] },
    {
      label: 'O4 monte poser l\'écran aile',
      off: pnrWingScreen,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: pnrWingSetup.O4, to: pnrWingScreen.O4 } as Annotation,
        { type: 'screen', fromId: 'O4', toId: null, from: pnrWingScreen.O4, to: { x: pnrWingScreen.O4.x + 18, y: pnrWingScreen.O4.y } } as Annotation,
      ],
    },
    {
      label: 'O1 dribble — O4 roll',
      off: pnrWingDrive,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: pnrWingSetup.O1, to: pnrWingDrive.O1 } as Annotation,
      ],
    },
    {
      label: 'O4 roll vers le panier',
      off: pnrWingRoll,
      ballCarrier: 'O1',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: pnrWingDrive.O4, to: pnrWingRoll.O4 } as Annotation,
        { type: 'dribble', fromId: 'O1', toId: null, from: pnrWingDrive.O1, to: { x: 260, y: 210 } } as Annotation,
      ],
    },
  ],
};
```

- [ ] **Enregistrer les 3 templates** — trouver le tableau `export const TEMPLATES: Template[]` dans `templates.ts` et ajouter les 3 templates avant la fermeture `]` :

```typescript
  IVERSON_CUT,
  STAGGER,
  PNR_WING,
```

- [ ] **Vérifier le build** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Suite complète** : `npx vitest run` → tous PASS.

---

### Tâche 3.4 — Commit + push #3

- [ ] **Commit** :

```bash
git add src/lib/data/templates.ts
git commit -m "feat(templates): Iverson cut + Stagger + PNR aile (#3 templates offensifs)"
```

- [ ] **Push** : `git push`

---

## Mise à jour docs

### Tâche 4 — Sync ROADMAP + todo-priorities

- [ ] **Dans `ROADMAP.md`** — trouver la section `## Synthèse priorisation` et ajouter une ligne dans le tableau UX/Produit :

```markdown
| ~~closeout quality~~ | ~~Closeout vers shooters — ring clean/desperate/late~~ — 🟢 livré 2026-06-01 | — | — | — |
| ~~spacing corners~~  | ~~Spacing aux corners (shooter/stretch-big)~~ — 🟢 livré 2026-06-01 | — | — | — |
| ~~templates +3~~     | ~~Iverson cut + Stagger + PNR aile~~ — 🟢 livré 2026-06-01 | — | — | — |
```

- [ ] **Dans `docs/todo-priorities.md`** — effacer les 3 items correspondants des `⚪` IDEAS.md si présents, ou noter qu'ils sont livrés.

- [ ] **Commit docs** :

```bash
git add ROADMAP.md docs/todo-priorities.md
git commit -m "docs: sync roadmap — closeout quality + corners + templates livrés"
git push
```
