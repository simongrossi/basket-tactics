// Scénarios animés d'exercices (drills) — visualisation sur le terrain.
//
// Un drill devient un `Template` jouable/présentable comme un système : le
// coach charge le scénario, le terrain montre les positions et les courses
// des joueurs, et le mode présentation le déroule pas-à-pas.
//
// `hideDefenseOnLoad: true` → seuls les attaquants sont affichés (un drill
// montre les courses offensives, pas un face-à-face défensif).

import type { AttackerPositions, DefenderPositions, Annotation } from '../types';
import type { Template } from './templates';

/** Défense « parking » : positionnée mais masquée au chargement (drill). */
function parkedDef(off: AttackerPositions): DefenderPositions {
  const HOOP = { x: 300, y: 75 };
  const ids: (keyof AttackerPositions)[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
  const def = {} as DefenderPositions;
  ids.forEach((oId, i) => {
    const dId = `D${i + 1}` as keyof DefenderPositions;
    const a = off[oId];
    const dx = HOOP.x - a.x;
    const dy = HOOP.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    def[dId] = { x: Math.round(a.x + (dx / len) * 40), y: Math.round(a.y + (dy / len) * 40) };
  });
  return def;
}

// ============================================================
// Philadelphia — finition en transition (3 couloirs)
// ============================================================
//
// Demi-terrain : la vague de 3 part de la médiane, remplit les couloirs
// larges, passe à l'aile et finit au cercle ; rebond + outlet → la ligne
// suivante repart. O4/O5 = la ligne d'attente (relance).

const phStart: AttackerPositions = {
  O1: { x: 300, y: 500 }, // meneur, ballon, couloir central
  O2: { x: 150, y: 510 }, // ailier couloir gauche
  O3: { x: 450, y: 510 }, // ailier couloir droit
  O4: { x: 70, y: 525 },  // ligne d'attente (gauche)
  O5: { x: 530, y: 525 }, // ligne d'attente (droite)
};

const phPush: AttackerPositions = {
  ...phStart,
  O1: { x: 300, y: 370 }, // dribble rapide vers la raquette
  O2: { x: 110, y: 330 }, // sprint couloir large, devant le ballon
  O3: { x: 490, y: 330 },
};

const phPass: AttackerPositions = {
  ...phPush,
  O1: { x: 300, y: 320 }, // suiveur (trailer)
  O2: { x: 170, y: 200 }, // reçoit et attaque l'aile
  O3: { x: 470, y: 230 },
};

const phFinish: AttackerPositions = {
  ...phPass,
  O1: { x: 300, y: 250 },
  O2: { x: 235, y: 110 }, // layup
  O3: { x: 430, y: 180 }, // rebond faible / spacing
};

const phOutlet: AttackerPositions = {
  ...phFinish,
  O2: { x: 235, y: 120 }, // a rebondi, fait l'outlet
  O4: { x: 95, y: 380 },  // la ligne d'attente lève pour recevoir → repart
};

const PHILADELPHIA_DRILL: Template = {
  id: 'drill-philadelphia',
  name: 'Drill — Philadelphia (transition)',
  tags: ['drill', 'transition', 'tir'],
  description:
    "Exercice de transition + tir en continu. La vague de 3 remplit les couloirs " +
    "larges, passe à l'aile et finit au cercle ; rebond + outlet, la ligne suivante " +
    "repart immédiatement. Demi-terrain (phase de finition) ; défense masquée.",
  hideDefenseOnLoad: true,
  defenseInitial: parkedDef(phStart),
  steps: [
    {
      label: 'Mise en place — 3 couloirs + ligne d\'attente',
      off: phStart,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'Lancement — remplir les couloirs larges',
      off: phPush,
      ballCarrier: 'O1',
      annotations: [
        { type: 'dribble', fromId: 'O1', toId: null, from: phStart.O1, to: phPush.O1 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: phStart.O2, to: phPush.O2 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: phStart.O3, to: phPush.O3 } as Annotation,
      ],
    },
    {
      label: 'Passe dans le couloir → aile',
      off: phPass,
      ballCarrier: 'O2',
      annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: phPush.O1, to: phPass.O2 } as Annotation,
        { type: 'cut', fromId: 'O2', toId: null, from: phPush.O2, to: phPass.O2 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: phPush.O3, to: phPass.O3 } as Annotation,
        { type: 'cut', fromId: 'O1', toId: null, from: phPush.O1, to: phPass.O1 } as Annotation,
      ],
    },
    {
      label: 'Finition layup',
      off: phFinish,
      ballCarrier: 'O2',
      annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: phPass.O2, to: phFinish.O2 } as Annotation,
        { type: 'cut', fromId: 'O1', toId: null, from: phPass.O1, to: phFinish.O1 } as Annotation,
        { type: 'cut', fromId: 'O3', toId: null, from: phPass.O3, to: phFinish.O3 } as Annotation,
      ],
    },
    {
      label: 'Rebond + outlet — la ligne repart',
      off: phOutlet,
      ballCarrier: 'O4',
      annotations: [
        { type: 'cut', fromId: 'O4', toId: null, from: phFinish.O4, to: phOutlet.O4 } as Annotation,
        { type: 'pass', fromId: 'O2', toId: 'O4', from: phOutlet.O2, to: phOutlet.O4 } as Annotation,
      ],
    },
  ],
};

export const DRILL_SCENARIOS: Template[] = [PHILADELPHIA_DRILL];
