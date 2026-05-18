import { describe, expect, it } from 'vitest';
import type { ScriptedActionParams, ScriptedActionType } from '@/lib/types';
import {
  auditScriptedActionPairs,
  formatMovementSimulationFindings,
} from '../movementSimulationAudit';

const ACTION_TYPES: ScriptedActionType[] = [
  'pick-and-roll',
  'pick-and-pop',
  'pin-down',
  'flare-screen',
  'back-screen',
  'screen-the-screener',
  'ucla-cut',
  'v-cut',
  'l-cut',
  'iverson-cut',
  'staggered-screen',
  'elevator-screen',
  'hammer-screen',
  'ram-screen',
  'wide-screen',
  'wiper-screen',
  'screen-away',
  'slip',
  'reject',
  'drag-screen',
  'step-up-screen',
  'ghost-screen',
  'zoom-action',
  'rip-dho',
  'slide-action',
  'split-action',
];

const DEFAULT_PARAMS: Partial<Record<ScriptedActionType, ScriptedActionParams>> = {
  'pick-and-roll': { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'pick-and-pop': { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'pin-down': { screener: 'O4', cutter: 'O2' },
  'flare-screen': { screener: 'O4', cutter: 'O2' },
  'back-screen': { screener: 'O4', cutter: 'O2' },
  'screen-the-screener': { firstScreener: 'O4', secondScreener: 'O5', cutter: 'O2' },
  'ucla-cut': { cutter: 'O2', screener: 'O4' },
  'v-cut': { cutter: 'O2' },
  'l-cut': { cutter: 'O2' },
  'iverson-cut': { cutter: 'O1', firstScreener: 'O4', secondScreener: 'O5' },
  'staggered-screen': { cutter: 'O2', firstScreener: 'O4', secondScreener: 'O5' },
  'elevator-screen': { cutter: 'O2', firstScreener: 'O4', secondScreener: 'O5' },
  'hammer-screen': { screener: 'O4', cutter: 'O2' },
  'ram-screen': { firstScreener: 'O4', secondScreener: 'O5', ballHandler: 'O1' },
  'wide-screen': { screener: 'O4', cutter: 'O2' },
  'wiper-screen': { screener: 'O4', cutter: 'O2' },
  'screen-away': { passer: 'O1', receiver: 'O2', screener: 'O4', cutter: 'O3' },
  slip: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  reject: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'drag-screen': { screener: 'O5', ballHandler: 'O1' },
  'step-up-screen': { screener: 'O5', ballHandler: 'O1' },
  'ghost-screen': { screener: 'O5', ballHandler: 'O1' },
  'zoom-action': { giver: 'O2', cutter: 'O1', screener: 'O4' },
  'rip-dho': { giver: 'O2', cutter: 'O1', screener: 'O4' },
  'slide-action': { cutter: 'O2', screener: 'O4' },
  'split-action': { passer: 'O1', receiver: 'O3', screener: 'O4', cutter: 'O2' },
};

describe('movementSimulationAudit', () => {
  it('simule les paires écran/cut et ne laisse pas de flicker ou saut playback', { timeout: 60_000 }, () => {
    const findings = auditScriptedActionPairs(ACTION_TYPES, DEFAULT_PARAMS, {
      fps: 60,
      maxJumpPx: 20,
    });

    expect(
      findings,
      formatMovementSimulationFindings(findings),
    ).toEqual([]);
  });
});
