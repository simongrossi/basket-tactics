# Menu d'actions globales flottant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le bloc `🏀 Actions` (colonne gauche) par un bouton flottant `⋯` ancré au terrain qui ouvre un menu déroulant avec les 5 actions globales (plein écran, playbook PDF, exporter JSON, importer JSON, reset complet).

**Architecture:** Nouveau composant `FloatingActionsMenu` (présentation pure, état local d'ouverture). Monté dans un wrapper `position: relative` autour de `CourtView`. Suppression de `ActionsPanel`. Câblage des mêmes callbacks dans `page.tsx`.

**Tech Stack:** React 18 + Next.js 14 (App Router), TypeScript, styles inline (cohérent avec le reste du codebase).

**Spec:** [docs/superpowers/specs/2026-05-09-floating-actions-menu-design.md](../specs/2026-05-09-floating-actions-menu-design.md)

---

## File Structure

- **Create:** `src/components/FloatingActionsMenu.tsx` — bouton flottant + menu déroulant, props identiques aux callbacks actuels d'`ActionsPanel`.
- **Modify:** `src/app/page.tsx`
  - Retirer l'import et le rendu d'`ActionsPanel`
  - Importer `FloatingActionsMenu`
  - Wrapper `<CourtView>` dans un `<div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }}>` et y monter `FloatingActionsMenu`
- **Delete:** `src/components/ActionsPanel.tsx`

Pas de tests unitaires : composant 100 % présentation, vérification manuelle dans le navigateur (cohérent avec les autres composants UI du projet).

---

## Task 1: Créer FloatingActionsMenu (squelette)

**Files:**
- Create: `src/components/FloatingActionsMenu.tsx`

- [ ] **Step 1: Créer le fichier avec le squelette du composant**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface FloatingActionsMenuProps {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  onOpenPlaybook: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

export function FloatingActionsMenu(props: FloatingActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clic extérieur ferme le menu
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Échap ferme le menu (sans propager — empêche la sortie de plein écran)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  const runAndClose = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 8, right: 8, zIndex: 50 }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        title="Actions globales"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '1px solid #cbd5e1',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          fontWeight: 700,
          color: '#334155',
          boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 6px 16px rgba(15,23,42,0.12)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <MenuItem
            onClick={runAndClose(props.onTogglePresentMode)}
            label={props.presentMode ? '✕ quitter plein écran' : '🎬 plein écran'}
          />
          <MenuItem onClick={runAndClose(props.onOpenPlaybook)} label="📄 playbook PDF" />
          <MenuItem onClick={runAndClose(props.onExport)} label="exporter JSON" />
          <MenuItem onClick={runAndClose(props.onImport)} label="importer JSON" />
          <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />
          <MenuItem
            onClick={runAndClose(props.onReset)}
            label="reset complet"
            color="#b91c1c"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick, label, color,
}: {
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: color ?? '#334155',
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f1f5f9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run type-check`
Expected: pas d'erreur TypeScript

- [ ] **Step 3: Commit**

```bash
git add src/components/FloatingActionsMenu.tsx
git commit -m "feat(ui): composant FloatingActionsMenu (menu d'actions globales)"
```

---

## Task 2: Brancher FloatingActionsMenu dans page.tsx, supprimer ActionsPanel

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/components/ActionsPanel.tsx`

- [ ] **Step 1: Remplacer l'import dans page.tsx**

Dans [src/app/page.tsx:11](../../src/app/page.tsx), remplacer :

```tsx
import { ActionsPanel } from '@/components/ActionsPanel';
```

par :

```tsx
import { FloatingActionsMenu } from '@/components/FloatingActionsMenu';
```

- [ ] **Step 2: Retirer le bloc `<ActionsPanel ... />` de la colonne gauche**

Dans [src/app/page.tsx](../../src/app/page.tsx), supprimer entièrement le bloc lignes 177-184 :

```tsx
<ActionsPanel
  presentMode={presentMode}
  onTogglePresentMode={() => setPresentMode((p) => !p)}
  onOpenPlaybook={() => setShowPlaybook(true)}
  onExport={handleExport}
  onImport={handleImport}
  onReset={app.resetAll}
/>
```

- [ ] **Step 3: Wrapper CourtView et monter FloatingActionsMenu à l'intérieur**

Dans `<div className="center-col">` (à partir de la ligne 189), remplacer :

```tsx
<div className="center-col">
  <CourtView
    ...
  />
```

par :

```tsx
<div className="center-col">
  <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }}>
    <CourtView
      ...
    />
    <FloatingActionsMenu
      presentMode={presentMode}
      onTogglePresentMode={() => setPresentMode((p) => !p)}
      onOpenPlaybook={() => setShowPlaybook(true)}
      onExport={handleExport}
      onImport={handleImport}
      onReset={app.resetAll}
    />
  </div>
```

Et fermer le wrapper avec `</div>` juste après la fermeture de `<CourtView ... />` (avant le `<ScenarioReader>` conditionnel ligne 218).

**Attention :** la grille `.center-col` utilise `grid-template-rows: minmax(0, 1fr) auto auto;` — la ligne 1 (le terrain) doit garder sa flexibilité. Le wrapper hérite de cette première ligne, c'est OK.

- [ ] **Step 4: Supprimer le fichier ActionsPanel.tsx**

Run: `rm src/components/ActionsPanel.tsx`

- [ ] **Step 5: Vérifier la compilation et le lint**

Run: `npm run type-check && npm run lint`
Expected: pas d'erreur

- [ ] **Step 6: Vérification manuelle dans le navigateur**

Run: `npm run dev` (en background si nécessaire)

Vérifier dans le navigateur (http://localhost:3000) :
1. Le bloc "🏀 Actions" n'apparaît plus dans la colonne gauche
2. Un bouton rond `⋯` est visible en haut à droite du terrain
3. Clic sur le bouton → menu s'ouvre avec les 5 actions
4. Clic sur "🎬 plein écran" → bascule en présentation, le bouton `⋯` reste visible en haut à droite du terrain
5. Clic sur `⋯` en plein écran → le menu s'ouvre, le label affiche "✕ quitter plein écran"
6. Clic sur "✕ quitter plein écran" → retour à la vue normale
7. Clic sur "exporter JSON" → téléchargement déclenché, menu fermé
8. Clic sur "importer JSON" → file picker ouvert, menu fermé
9. Clic sur "📄 playbook PDF" → modale playbook ouverte, menu fermé
10. Clic sur "reset complet" (en rouge) → reset effectué, menu fermé
11. Menu ouvert + clic en dehors (sur le terrain) → menu se ferme
12. Menu ouvert + Échap → menu se ferme **sans** quitter le plein écran (à tester en plein écran)

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/ActionsPanel.tsx src/components/FloatingActionsMenu.tsx
git commit -m "feat(ui): bascule actions globales sur menu flottant ⋯ ancré au terrain

Supprime le bloc 🏀 Actions de la colonne gauche, libère de la verticalité.
Le menu reste accessible en mode plein écran."
```

- [ ] **Step 8: Push**

```bash
git push
```

---

## Self-Review Notes

- **Spec coverage** : ✓ bouton flottant top-right, menu déroulant 5 items, Échap+clic-extérieur, label dynamique plein écran, item rouge pour reset, divider, suppression ActionsPanel.
- **Placeholders** : aucun.
- **Type consistency** : les props de `FloatingActionsMenu` sont identiques aux callbacks actuels d'`ActionsPanel` (vérifié contre `page.tsx:177-184`).
- **Risque positionnement** : le wrapper ajouté autour de `CourtView` doit hériter correctement de la première ligne de la grille `.center-col` (`minmax(0, 1fr)`). Si le terrain ne s'affiche plus correctement après wrap, ajuster en passant les styles `min-height: 0; overflow: hidden;` au wrapper (déjà fait Step 3).
- **Échap** : le handler dans `FloatingActionsMenu` utilise `capture: true` + `stopPropagation()` pour intercepter avant le handler `presentMode` de `page.tsx:71-73`. Si menu fermé, le listener n'est pas monté, donc Échap continue de quitter le plein écran normalement.
