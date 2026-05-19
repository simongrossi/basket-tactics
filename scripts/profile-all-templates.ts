// Profile global de tous les templates écran principaux.
// Pour chaque template, mesure :
// - Min clearance frame-by-frame (paire la plus proche).
// - Max Δ par frame (snap detection).
// - Min dist O↔poseur pendant un drive (overlap visuel).
// - Présence d'un screenPhase stuck pendant la phase critique.
//
// Usage : npx tsx scripts/profile-all-templates.ts

import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt, type PlaybackFrame } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import { MIN_PLAYER_CLEARANCE_PX } from '../src/lib/data/physics';
import type { AppState, AttackerId, DefenderId, Point } from '../src/lib/types';

const TARGET_IDS = ['pnr-central', 'horns-flare', 'pindown-corner', 'spain-pnr', 'ucla-cut', 'floppy', 'hammer'];

interface TemplateAudit {
  id: string;
  steps: number;
  framesTotal: number;
  minClearance: { value: number; pair: string; t: number };
  maxFrameDelta: { value: number; player: string; t: number };
  hasStuckPhase: boolean;
  hasScreenDetected: boolean;
  hasTraversal: boolean; // any frame with clearance violation
  warnings: string[];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function auditTemplate(tplId: string, withPAI = false): TemplateAudit {
  const tpl = TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) return { id: tplId, steps: 0, framesTotal: 0, minClearance: { value: 0, pair: '', t: 0 }, maxFrameDelta: { value: 0, player: '', t: 0 }, hasStuckPhase: false, hasScreenDetected: false, hasTraversal: false, warnings: ['template introuvable'] };

  const state: AppState = {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    screenRule: 'hedge',
    activeStep: 0,
    pathAwareInterpolation: withPAI,
  };

  const transitions = state.steps.length - 1;
  const fps = 30;
  const totalFrames = transitions * fps;
  let minClearance = { value: Infinity, pair: '', t: 0 };
  let maxFrameDelta = { value: 0, player: '', t: 0 };
  let hasStuckPhase = false;
  let hasScreenDetected = false;
  let prevFrame: PlaybackFrame | null = null;

  const warnings: string[] = [];

  for (let f = 0; f <= totalFrames; f++) {
    const t = f / fps;
    const frame = resolveFrameAt(state, t, { prevFrame: prevFrame ?? undefined });
    if (!frame) continue;

    // Min clearance entre toutes les paires
    const players: { id: string; p: Point }[] = [
      ...Object.entries(frame.off).map(([id, p]) => ({ id, p: p as Point })),
      ...Object.entries(frame.defPos).map(([id, p]) => ({ id, p: { x: p.x, y: p.y } })),
    ];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const d = dist(players[i].p, players[j].p);
        if (d < minClearance.value) {
          minClearance = { value: d, pair: `${players[i].id}↔${players[j].id}`, t };
        }
      }
    }

    // Max Δ par défenseur
    if (prevFrame) {
      for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as DefenderId[]) {
        const prev = prevFrame.defPos[id];
        const cur = frame.defPos[id];
        if (!prev || !cur) continue;
        const delta = dist(prev, cur);
        if (delta > maxFrameDelta.value) {
          maxFrameDelta = { value: delta, player: id, t };
        }
      }
      for (const id of ['O1', 'O2', 'O3', 'O4', 'O5'] as AttackerId[]) {
        const prev = prevFrame.off[id];
        const cur = frame.off[id];
        if (!prev || !cur) continue;
        const delta = dist(prev, cur);
        if (delta > maxFrameDelta.value) {
          maxFrameDelta = { value: delta, player: id, t };
        }
      }
    }

    // Detect stuck phase
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as DefenderId[]) {
      if (frame.defPos[id]?.screenPhase === 'stuck') {
        hasStuckPhase = true;
      }
    }
    if (frame.screen) hasScreenDetected = true;

    prevFrame = frame;
  }

  // Génère warnings
  if (minClearance.value < MIN_PLAYER_CLEARANCE_PX) {
    warnings.push(`❌ TRAVERSÉE : clearance ${minClearance.value.toFixed(1)} px à t=${minClearance.t.toFixed(2)} (${minClearance.pair})`);
  } else if (minClearance.value < 20) {
    warnings.push(`⚠️ Clearance basse : ${minClearance.value.toFixed(1)} px à t=${minClearance.t.toFixed(2)} (${minClearance.pair})`);
  }
  if (maxFrameDelta.value > 18) {
    warnings.push(`⚠️ Snap : Δ ${maxFrameDelta.value.toFixed(1)} px à t=${maxFrameDelta.t.toFixed(2)} (${maxFrameDelta.player})`);
  }
  if (!hasScreenDetected) {
    warnings.push(`❌ Aucun écran détecté (template écran sans écran fonctionnel ?)`);
  } else if (!hasStuckPhase) {
    warnings.push(`⚠️ Écran détecté mais aucune phase "stuck" — défenseur pas plaqué`);
  }

  const hasTraversal = minClearance.value < MIN_PLAYER_CLEARANCE_PX;
  return {
    id: tplId,
    steps: state.steps.length,
    framesTotal: totalFrames,
    minClearance,
    maxFrameDelta,
    hasStuckPhase,
    hasScreenDetected,
    hasTraversal,
    warnings,
  };
}

console.log('=== Audit des templates écran ===\n');
console.log('Métriques : clearance (≥ 34 px attendu), Δ frame max (≤ 18 px attendu),');
console.log('détection écran + phase stuck (attendus pour un PnR/écran fonctionnel).\n');

console.log('Comparaison : PAI off vs PAI on (gain attendu sur min clearance).\n');

for (const tplId of TARGET_IDS) {
  const noPai = auditTemplate(tplId, false);
  const withPai = auditTemplate(tplId, true);
  const paiGain = withPai.minClearance.value - noPai.minClearance.value;

  console.log(`📋 ${noPai.id} (${noPai.steps} steps, ${noPai.framesTotal} frames)`);
  console.log(`   sans PAI : clearance ${noPai.minClearance.value.toFixed(1)} px (${noPai.minClearance.pair}) | Δ max ${noPai.maxFrameDelta.value.toFixed(1)} px`);
  console.log(`   avec PAI : clearance ${withPai.minClearance.value.toFixed(1)} px (${withPai.minClearance.pair}) | Δ max ${withPai.maxFrameDelta.value.toFixed(1)} px`);
  console.log(`   gain PAI  : ${paiGain >= 0 ? '+' : ''}${paiGain.toFixed(1)} px clearance ${paiGain > 1 ? '🟢' : paiGain > 0 ? '🟡' : '⬜'}`);
  console.log(`   écran détecté : ${noPai.hasScreenDetected ? '✓' : '❌'} | phase stuck : ${noPai.hasStuckPhase ? '✓' : '❌'}`);
  const allWarnings = withPai.warnings;
  if (allWarnings.length === 0) {
    console.log(`   STATUS : ✅ propre (avec PAI)`);
  } else {
    allWarnings.forEach((w) => console.log(`   ${w}`));
  }
  console.log('');
}
