// Règle C.7 — Action chains (lecture de séquences d'écrans).
//
// Le moteur détecte chaque écran isolément ; cette règle reconnaît les
// CHAÎNES (re-screen, stagger sequential, flare-then-fade) et alerte le
// coach. V1 diagnostic-only — la réaction défensive (V2) viendrait via
// une nouvelle couche défensive si activée.

import type { CoachDiagnostic, Rule } from '../types';
import { detectScreenChain } from '../../screens';
import { withProfile } from '../helpers';

export const screenChainRule: Rule = (ctx) => {
  const { state, stepIdx, profiles } = ctx;

  const chain = detectScreenChain(state, stepIdx);
  if (!chain) return [];

  const cutterLabel = withProfile(chain.cutter, profiles?.[chain.cutter]);
  const screenersLabel = chain.screeners
    .map((s) => withProfile(s, profiles?.[s]))
    .join(' + ');

  let severity: CoachDiagnostic['severity'];
  let message: string;
  let tag: string;

  switch (chain.type) {
    case 're-screen':
      severity = 'warning';
      message = `Re-screen : ${cutterLabel} revient sur le poseur ${screenersLabel} après relâchement — défense doit anticiper le 2ᵉ acte`;
      tag = 'chain-re-screen';
      break;
    case 'stagger-sequential':
      severity = 'warning';
      message = `Stagger : ${cutterLabel} traverse 2 écrans successifs (${screenersLabel}) — top-lock le 2ᵉ`;
      tag = 'chain-stagger';
      break;
    case 'flare-then-fade':
      severity = 'info';
      message = `Flare + fade : ${cutterLabel} sort vers le coin après écran de ${screenersLabel} — défense doit suivre le shooter`;
      tag = 'chain-flare-fade';
      break;
  }

  return [
    {
      id: `chain-${chain.type}-${chain.cutter}-${stepIdx}`,
      severity,
      message,
      tag,
      defenders: [],
      attackers: [chain.cutter, ...chain.screeners],
    },
  ];
};
