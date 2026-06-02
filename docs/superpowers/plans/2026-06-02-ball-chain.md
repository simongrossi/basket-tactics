# Ball-chain — reversal & DHO chain (motion sous-projet C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Router le ballon à travers une chaîne ordonnée de joueurs (ball reversal = passes, DHO chain = hand-offs, ou mixte) via deux types d'action presets sur un expander pur.

**Architecture:** `expandBallChain` déroule la chaîne en déléguant chaque lien à `genPass`/`genHandOff` (déjà exportés depuis tier1) et thread l'état. Chaque lien reçoit un id namespacé `#lI` (préservation manualOverride). Deux types `ball-reversal`/`dho-chain` enregistrés dans `SCRIPTED_GENERATORS`. Actions offensives normales : composent avec continuity, Règle 1 couverte par le pipeline aval.

**Tech Stack:** TypeScript strict, Vitest (TDD). Aucune nouvelle géométrie ; réutilise les générateurs un-lien.

---

## Spec de référence

`docs/superpowers/specs/2026-06-02-ball-chain-design.md`

## Fichiers touchés

| Chantier | Fichier | Action |
|---|---|---|
| 1 | `src/lib/types/index.ts` | 2 types d'action + 2 params |
| 1 | `src/lib/logic/scriptedGenerators/ballChain.ts` | expander + 2 générateurs (créer) |
| 1 | `src/lib/logic/scriptedGenerators/__tests__/ballChain.test.ts` | tests (créer) |
| 1 | `src/lib/logic/scriptedGenerators.ts` | enregistrer les 2 générateurs |
| 1 | `src/lib/logic/reads/__tests__/ballChainIntegration.test.ts` | intégration (créer) |
| 2 | `src/lib/data/scriptedActionsCatalog.ts` | `ParamKind: 'chain'` + 2 entrées catalogue |
| 2 | `src/components/ScenarioPanel.tsx` | `PARAM_LABELS['chain']` + ChainEditor + defaultParamsFor |
| 3 | `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md` | docs |

---

# CHANTIER 1 — Noyau (types + expander + registration)

## Task 1.1 — Types

**Files:**
- Modify: `src/lib/types/index.ts` (`ScriptedActionType` ~ligne 318 ; `ScriptedActionParams` ~ligne 363)

- [ ] **Step 1: Ajouter les 2 types d'action** — dans `ScriptedActionType`, section Combinations, après `| 'high-low-action'` :

```typescript
  | 'ball-reversal'
  | 'dho-chain'
```

- [ ] **Step 2: Ajouter les 2 params** — dans `ScriptedActionParams`, après `fromZone?: ZoneRef;` :

```typescript
  /** Phase Motion C — suite ordonnée de joueurs que le ballon traverse (≥ 2). */
  chain?: AttackerId[];
  /** Mode de chaque lien de la chaîne (longueur = chain.length − 1). Absent /
   *  plus court → les liens manquants prennent le mode global du preset. */
  chainLinkModes?: ('pass' | 'dho')[];
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → erreurs attendues (`SCRIPTED_ACTIONS_CATALOG` et `SCRIPTED_GENERATORS` sont des `Record<ScriptedActionType, …>` → les 2 nouveaux types manquent). On les comble aux Tasks 1.3 et 2.1. Noter les erreurs, continuer.

---

## Task 1.2 — Expander `expandBallChain` + générateurs (TDD)

**Files:**
- Create: `src/lib/logic/scriptedGenerators/ballChain.ts`
- Create: `src/lib/logic/scriptedGenerators/__tests__/ballChain.test.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { expandBallChain, genBallReversal, genDhoChain } from '@/lib/logic/scriptedGenerators/ballChain';
import type { AttackerPositions, OffensiveScriptedAction, Step } from '@/lib/types';

function prevStep(): Step {
  const off: AttackerPositions = {
    O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 120, y: 200 },
    O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
  };
  return { off, ballCarrier: 'O1', annotations: [] };
}
function chainAction(id: string, chain: string[], modes?: ('pass' | 'dho')[]): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'ball-reversal', params: { chain: chain as never, chainLinkModes: modes } };
}

describe('expandBallChain', () => {
  it('reversal tout-passe : N−1 steps, ballon finit sur le dernier joueur', () => {
    const steps = genBallReversal(prevStep(), chainAction('r', ['O1', 'O2', 'O3']));
    expect(steps).toHaveLength(2); // genPass = 1 step / lien
    expect(steps[steps.length - 1].ballCarrier).toBe('O3');
  });

  it('dho-chain : 2 steps par lien', () => {
    const steps = genDhoChain(prevStep(), chainAction('d', ['O1', 'O2']));
    expect(steps).toHaveLength(2); // genHandOff = 2 steps / lien
    expect(steps[steps.length - 1].ballCarrier).toBe('O2');
  });

  it('modes mixtes : pass puis dho', () => {
    const steps = expandBallChain(prevStep(), chainAction('m', ['O1', 'O2', 'O3'], ['pass', 'dho']), 'pass');
    expect(steps).toHaveLength(1 + 2); // lien0 pass (1) + lien1 dho (2)
  });

  it('chainLinkModes plus court → liens restants au defaultMode', () => {
    const steps = expandBallChain(prevStep(), chainAction('s', ['O1', 'O2', 'O3'], ['dho']), 'pass');
    expect(steps).toHaveLength(2 + 1); // lien0 dho (2) + lien1 pass (1)
  });

  it('generatedBy namespacé #lI', () => {
    const steps = genBallReversal(prevStep(), chainAction('r', ['O1', 'O2', 'O3']));
    expect(steps[0].generatedBy).toBe('r#l0');
    expect(steps[1].generatedBy).toBe('r#l1');
  });

  it('chain absent ou < 2 → []', () => {
    expect(genBallReversal(prevStep(), chainAction('x', []))).toEqual([]);
    expect(genBallReversal(prevStep(), chainAction('x', ['O1']))).toEqual([]);
    expect(genBallReversal(prevStep(), { kind: 'offensive', id: 'x', type: 'ball-reversal', params: {} })).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/scriptedGenerators/__tests__/ballChain.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter** — créer `ballChain.ts` :

```typescript
// Phase Motion C — ball-chain : route le ballon à travers une chaîne ordonnée
// de joueurs (reversal = passes, dho-chain = hand-offs, ou mixte). Délègue
// chaque lien aux générateurs un-lien existants. Voir
// docs/superpowers/specs/2026-06-02-ball-chain-design.md.

import type { OffensiveScriptedAction, Step } from '../../types';
import type { Generator } from './helpers';
import { genHandOff, genPass } from './tier1';

/** Déroule la chaîne `action.params.chain` en steps, lien par lien. Le mode de
 *  chaque lien = `chainLinkModes[i] ?? defaultMode`. Chaque lien reçoit un id
 *  namespacé `${action.id}#l${i}` (préservation manualOverride). Thread l'état :
 *  le dernier step d'un lien devient le `prev` du suivant. chain absent / < 2 →
 *  [] (no-op, comme les autres générateurs). */
export function expandBallChain(
  prev: Step,
  action: OffensiveScriptedAction,
  defaultMode: 'pass' | 'dho',
): Step[] {
  const chain = action.params.chain;
  if (!chain || chain.length < 2) return [];
  const modes = action.params.chainLinkModes;
  const steps: Step[] = [];
  let cur = prev;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    const mode = modes?.[i] ?? defaultMode;
    const sub: OffensiveScriptedAction =
      mode === 'dho'
        ? { kind: 'offensive', id: `${action.id}#l${i}`, type: 'hand-off', params: { giver: a, receiver: b } }
        : { kind: 'offensive', id: `${action.id}#l${i}`, type: 'pass', params: { from: a, to: b } };
    const linkSteps = mode === 'dho' ? genHandOff(cur, sub) : genPass(cur, sub);
    steps.push(...linkSteps);
    if (linkSteps.length) cur = linkSteps[linkSteps.length - 1];
  }
  return steps;
}

export const genBallReversal: Generator = (prev, action) => expandBallChain(prev, action, 'pass');
export const genDhoChain: Generator = (prev, action) => expandBallChain(prev, action, 'dho');
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/scriptedGenerators/__tests__/ballChain.test.ts` → 6 PASS.

---

## Task 1.3 — Enregistrer les générateurs

**Files:**
- Modify: `src/lib/logic/scriptedGenerators.ts`

- [ ] **Step 1: Importer le module** — en tête, près des autres imports de générateurs (vérifier le style exact : `import * as t1 from './scriptedGenerators/tier1'` etc.) :

```typescript
import { genBallReversal, genDhoChain } from './scriptedGenerators/ballChain';
```

- [ ] **Step 2: Enregistrer** — dans `SCRIPTED_GENERATORS`, section « Tier 2 — Combinations », après `'high-low-action': t2.genHighLowAction,` :

```typescript
  'ball-reversal': genBallReversal,
  'dho-chain': genDhoChain,
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → l'erreur côté `SCRIPTED_GENERATORS` disparaît (il reste l'erreur `SCRIPTED_ACTIONS_CATALOG`, comblée au Task 2.1).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/scriptedGenerators/ballChain.ts \
        src/lib/logic/scriptedGenerators/__tests__/ballChain.test.ts \
        src/lib/logic/scriptedGenerators.ts
git commit -m "feat(motion): ball-chain — expander + générateurs reversal/dho-chain"
```

---

## Task 1.4 — Test d'intégration (compileScenario)

**Files:**
- Create: `src/lib/logic/reads/__tests__/ballChainIntegration.test.ts`

- [ ] **Step 1: Écrire le test** :

```typescript
import { describe, it, expect } from 'vitest';
import type { AttackerPositions, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 120, y: 200 },
  O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
};
const reversal: OffensiveScriptedAction = {
  kind: 'offensive', id: 'rev', type: 'ball-reversal',
  params: { chain: ['O1', 'O2', 'O3'] },
};

describe('ball-chain — intégration compileScenario', () => {
  it('ball-reversal [O1,O2,O3] → le ballon finit sur O3', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [reversal], playerCount: 5 });
    expect(steps[steps.length - 1].ballCarrier).toBe('O3');
  });

  it('produit des steps avec generatedBy namespacé #lI', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [reversal], playerCount: 5 });
    expect(steps.some((s) => s.generatedBy === 'rev#l0')).toBe(true);
    expect(steps.some((s) => s.generatedBy === 'rev#l1')).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/reads/__tests__/ballChainIntegration.test.ts` → 2 PASS. (Si `breakUpTeleports` insère des steps interpolés, le dernier step réel garde `ballCarrier='O3'` — l'assertion sur le dernier step reste vraie car l'interpolation préserve le ballCarrier.)

---

## Task 1.5 — Règle 1 / 1bis + commit + push

- [ ] **Step 1: Suites garde-fou** : `npx vitest run overlap screens userJson screenLab` → tous PASS.

- [ ] **Step 2: Suite complète** : `npx vitest run` → 2019+ PASS (cible ~2027, +8 — l'UI n'ajoute pas de tests).

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/logic/reads/__tests__/ballChainIntegration.test.ts
git commit -m "test(motion): ball-chain — intégration compileScenario"
git push
```

---

# CHANTIER 2 — Catalogue + UI

## Task 2.1 — ParamKind `chain` + entrées catalogue

**Files:**
- Modify: `src/lib/data/scriptedActionsCatalog.ts`

- [ ] **Step 1: Ajouter le ParamKind** — dans `export type ParamKind`, ajouter `| 'chain'` :

```typescript
  | 'targetZone' | 'screenZone' | 'fromZone'
  | 'chain';
```

- [ ] **Step 2: Ajouter les 2 entrées catalogue** — dans `SCRIPTED_ACTIONS_CATALOG`, après l'entrée `high-low-action` (section Combinations) :

```typescript
  'ball-reversal': {
    type: 'ball-reversal',
    label: 'Renversement (ball reversal)',
    fibaTerm: 'Ball reversal',
    description: 'Le ballon traverse une chaîne de passes (swing guard-to-guard).',
    category: 'combinaison',
    requiredParams: ['chain'],
    stepsGenerated: 2,
    reader: (p) => `Renversement : ${(p.chain ?? []).join(' → ') || '—'} (passes).`,
  },
  'dho-chain': {
    type: 'dho-chain',
    label: 'Chaîne de DHO',
    fibaTerm: 'DHO chain',
    description: 'Hand-offs enchaînés : le ballon passe de main en main le long d\'une chaîne.',
    category: 'combinaison',
    requiredParams: ['chain'],
    stepsGenerated: 2,
    reader: (p) => `Chaîne DHO : ${(p.chain ?? []).join(' → ') || '—'}.`,
  },
```

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → l'erreur `SCRIPTED_ACTIONS_CATALOG` disparaît. Reste une erreur attendue dans `ScenarioPanel.tsx` : `PARAM_LABELS` (Record<ParamKind,string>) manque la clé `chain` — comblée au Task 2.2.

---

## Task 2.2 — ChainEditor dans ActionForm

**Files:**
- Modify: `src/components/ScenarioPanel.tsx`

- [ ] **Step 1: Ajouter le label** — dans `PARAM_LABELS` (Record<ParamKind,string>), ajouter :

```typescript
  chain: 'Chaîne',
```

- [ ] **Step 2: Défaut chain à la création** — dans `defaultParamsFor`, avant le `return params;` :

```typescript
  if (def.requiredParams.includes('chain')) params.chain = ['O1', 'O2'];
```

- [ ] **Step 3: Helper de mise à jour + rendu du ChainEditor** — dans `ActionForm`, après `updateZoneParam` (ligne ~1050), ajouter le helper :

```typescript
  const updateChain = (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => {
    const nextParams = { ...action.params } as Record<string, unknown>;
    nextParams.chain = chain;
    if (modes) nextParams.chainLinkModes = modes; else delete nextParams.chainLinkModes;
    onChange({ ...action, params: nextParams as OffensiveScriptedAction['params'] });
  };
```

- [ ] **Step 4: Brancher le rendu spécial `chain`** — dans le `allParams.map`, remplacer la condition de rendu pour intercepter `chain`. Le bloc actuel :

```tsx
          {isZoneParam(paramKey) ? (
            <ZoneSelect ... />
          ) : (
            <select ...>...</select>
          )}
```

devient :

```tsx
          {paramKey === 'chain' ? (
            <ChainEditor
              chain={(action.params.chain as AttackerId[] | undefined) ?? []}
              modes={action.params.chainLinkModes as ('pass' | 'dho')[] | undefined}
              defaultMode={action.type === 'dho-chain' ? 'dho' : 'pass'}
              attackerIds={attackerIds}
              onChange={updateChain}
            />
          ) : isZoneParam(paramKey) ? (
            <ZoneSelect
              value={action.params[paramKey] as ZoneRef | undefined}
              onChange={(z) => updateZoneParam(paramKey, z)}
              onOpenPicker={() => setZonePickerFor(paramKey)}
            />
          ) : (
            <select
              value={(action.params[paramKey] as string | undefined) ?? ''}
              onChange={(e) => updateParam(paramKey, e.target.value)}
              style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
            >
              <option value="">—</option>
              {paramOptionsFor(paramKey, attackerIds).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
```

- [ ] **Step 5: Définir le composant `ChainEditor`** — après la fonction `ActionForm` (avant `paramOptionsFor`), ajouter :

```tsx
function ChainEditor({
  chain, modes, defaultMode, attackerIds, onChange,
}: {
  chain: AttackerId[];
  modes: ('pass' | 'dho')[] | undefined;
  defaultMode: 'pass' | 'dho';
  attackerIds: AttackerId[];
  onChange: (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => void;
}) {
  const linkMode = (i: number): 'pass' | 'dho' => modes?.[i] ?? defaultMode;
  const setLinkMode = (i: number, m: 'pass' | 'dho') => {
    const next = Array.from({ length: Math.max(chain.length - 1, 0) }, (_, j) => (j === i ? m : linkMode(j)));
    onChange(chain, next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      {chain.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              value={p}
              onChange={(e) => onChange(chain.map((x, j) => (j === i ? (e.target.value as AttackerId) : x)), modes)}
              style={{ fontSize: 11 }}
            >
              {attackerIds.map((id) => (<option key={id} value={id}>{id}</option>))}
            </select>
            {chain.length > 2 && (
              <button
                onClick={() => onChange(chain.filter((_, j) => j !== i), modes?.filter((_, j) => j !== Math.min(i, chain.length - 2)))}
                title="Retirer ce maillon"
                style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
              >×</button>
            )}
          </div>
          {i < chain.length - 1 && (
            <button
              onClick={() => setLinkMode(i, linkMode(i) === 'pass' ? 'dho' : 'pass')}
              style={{ alignSelf: 'flex-start', fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #475569', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}
            >↓ {linkMode(i) === 'dho' ? 'DHO' : 'passe'}</button>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const used = new Set(chain);
          const next = attackerIds.find((id) => !used.has(id)) ?? attackerIds[0];
          onChange([...chain, next], modes);
        }}
        style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 6px', border: '1px solid #94a3b8', borderRadius: 3, background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
      >+ maillon</button>
    </div>
  );
}
```

- [ ] **Step 6: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 7: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 8: Vérif visuelle** : `preview_start`, `preview_console_logs level=error` → zéro erreur (vérif fonctionnelle couverte par les tests purs + intégration).

---

## Task 2.3 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/lib/data/scriptedActionsCatalog.ts src/components/ScenarioPanel.tsx
git commit -m "feat(motion): ball-chain — catalogue + ChainEditor (UI)"
git push
```

---

# CHANTIER 3 — Docs

## Task 3.1 — Sync

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`, `docs/fiba-actions-roadmap.md`, `docs/GAME-ENGINE.md`, `docs/todo-priorities.md`

- [ ] **Step 1: CHANGELOG** — section `[Unreleased]`, en tête :

```markdown
### Phase Motion — Ball-chain : reversal & DHO chain (2026-06-02)

Sous-projet C du motion offense (dernier des trois). Deux types d'action
`ball-reversal` (chaîne de passes) et `dho-chain` (hand-offs enchaînés) routent le
ballon à travers une suite ordonnée de joueurs `chain`, mode par lien
(`chainLinkModes`, pass/dho, mixte possible). Expander pur `expandBallChain` qui
délègue chaque lien à `genPass`/`genHandOff` et thread l'état ; id namespacé `#lI`
(préservation manualOverride). UI : ChainEditor dans le formulaire d'action.
**Axe motion complet (A continuité + B auto-replacement + C ball-chain).** ~8 tests.
```

- [ ] **Step 2: IDEAS §2** — compléter : `✅ **Ball reversal / DHO chain (sous-projet C) livré 2026-06-02**. Axe motion offense **complet** (A+B+C).`

- [ ] **Step 3: ROADMAP** — section « Motion offense » : ajouter C livré, retirer C du restant ; marquer l'axe motion comme complet (A+B+C livrés).

- [ ] **Step 4: fiba-actions-roadmap** — lignes **Ball reversal**, **Flip**, **Boomerang pass**, **Extra pass**, **Dishing** + ajouter/marquer la chaîne DHO : ✅ couvertes par `ball-reversal`/`dho-chain` (composition de chaîne).

- [ ] **Step 5: GAME-ENGINE** — note : `ball-reversal`/`dho-chain` sont des générateurs composites (`expandBallChain`) qui délèguent chaque lien à `genPass`/`genHandOff`.

- [ ] **Step 6: todo-priorities** — section « Livrés 2026-06-02 » : ajouter le ball-chain (sous-projet C) + noter l'axe motion complet.

- [ ] **Step 7: Commit + push**

```bash
git add CHANGELOG.md ROADMAP.md IDEAS.md docs/fiba-actions-roadmap.md docs/GAME-ENGINE.md docs/todo-priorities.md
git commit -m "docs: ball-chain (motion sous-projet C) livré — axe motion complet"
git push
```

---

## Notes d'exécution

- **Règle 1bis** : aucun fichier `screens/` ni `defense/context.ts` touché.
  `breakUpTeleports` + push-out tournent sur les steps composés ; lancer
  `overlap screens userJson screenLab` avant le commit du chantier 1.
- **Rétrocompat** : purement additif (nouveaux types + ParamKind). Scénarios
  existants inchangés.
- **Naming** : `expandBallChain` (expander) vs `genBallReversal`/`genDhoChain`
  (presets) — distincts. Liens namespacés `#lI` (vs cycles continuité `#cK`).
- **Réutilisation** : `genPass`/`genHandOff` exportés depuis `tier1.ts` (bloc
  `export { … }` existant) — aucun cycle d'import (ballChain n'importe pas la
  table `SCRIPTED_GENERATORS`).
- **Suite de référence** : 2019 verte au départ. Cible ~2027 (+8).
- **Hors scope** : auto-route côté faible, déclenchement auto-replacement sur lien
  DHO, chaînes > 5, mode de lien drive/screen.
```
