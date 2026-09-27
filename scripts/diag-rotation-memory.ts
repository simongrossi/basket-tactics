// Diagnostic P4.4 — que deviennent les rotations défensives (tag, X-out,
// stunt, aide) d'une étape à la suivante ?
//
// Usage : ROTATION=auto|stay|recover npx tsx scripts/diag-rotation-memory.ts [templateId...]
//         (sans ROTATION : comportement historique)
//
// Pour chaque étape et chaque défenseur : homme marqué, rôle de rotation,
// aide déclenchée, distance à son homme. Signale les « abandons » : un
// défenseur en rotation à N-1 qui n'a plus aucun rôle à N (retour à froid).

import { makeInitialState } from '../src/lib/data/initial';
import { computeDefenseTargets } from '../src/lib/logic/engine';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState, DefenderId, RotationMemoryMode } from '../src/lib/types';

const mode = process.env.ROTATION as RotationMemoryMode | undefined;

const ids = process.argv.slice(2);
const targets = ids.length
  ? TEMPLATES.filter((t) => ids.includes(t.id))
  : TEMPLATES.filter((t) => (t.tags ?? []).includes('pnr') || /pnr|spain|horns/i.test(t.id));

for (const tpl of targets) {
  const state: AppState = {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    screenRule: 'hedge',
    activeStep: 0,
    rotationMemory: mode,
  };
  console.log(`\n=== ${tpl.id} [mémoire: ${mode ?? 'off'}] (${state.steps.length} étapes) ===`);
  let prev: ReturnType<typeof computeDefenseTargets> | null = null;
  for (let i = 0; i < state.steps.length; i++) {
    const res = computeDefenseTargets(state, i);
    const off = state.steps[i].off as Record<string, { x: number; y: number }>;
    const parts: string[] = [];
    (Object.keys(res.positions) as DefenderId[]).forEach((d) => {
      const p = res.positions[d];
      const man = off[p.matchedTo];
      const dist = man ? Math.round(Math.hypot(p.x - man.x, p.y - man.y)) : -1;
      const role = p.rotation ?? p.pnrRole ?? (p.helpTriggered ? 'help' : p.onScreen ? 'screen' : '');
      parts.push(`${d}→${p.matchedTo}${role ? `[${role}]` : ''}@${dist}`);
      const pp = prev?.positions[d];
      const prevRole = pp?.pnrRole ?? (pp?.helpTriggered ? 'help' : '');
      if (pp && prevRole && !role) {
        const jump = Math.round(Math.hypot(p.x - pp.x, p.y - pp.y));
        parts.push(`  ⚠ ${d} abandonne ${prevRole} (cible déplacée de ${jump} px)`);
      }
    });
    console.log(`step ${i} carrier=${state.steps[i].ballCarrier} ${parts.join(' ')}`);
    prev = res;
  }
}
