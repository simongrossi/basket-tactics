'use client';

// Point d'entrée des menus contextuels affichés au clic-droit sur un joueur.
//
// Le composant ne fait que le dispatch entre `DefenderMenu` et `AttackerMenu`
// selon `kind`. Les deux menus vivent dans `contextMenu/` avec leurs helpers :
//
//  - popupHooks.ts  : useClampedPosition + useDraggablePopup
//  - ToolBar.tsx    : barre d'outils (move/pass/dribble/cut/screen)
//  - sharedRows.tsx : Row, OverrideSliderRow, GazeLockButton
//  - DefenderMenu.tsx
//  - AttackerMenu.tsx

import { DefenderMenu, type DefenderMenuProps } from './contextMenu/DefenderMenu';
import { AttackerMenu, type AttackerMenuProps } from './contextMenu/AttackerMenu';

type ContextMenuProps = DefenderMenuProps | AttackerMenuProps;

export function ContextMenu(props: ContextMenuProps) {
  if (props.kind === 'attacker') return <AttackerMenu {...props} />;
  return <DefenderMenu {...props} />;
}
