// Index des générateurs scriptés FIBA.
//
// Le code des générateurs vit dans `scriptedGenerators/` :
//  - helpers.ts  : helpers géométriques + types (Generator, etc.)
//  - tier1.ts    : 19 générateurs de base (PnR, cuts, écrans, drive, passe, tir)
//  - tier2.ts    : 30 variantes (cuts spécialisés, off-ball, PnR variants, combos)
//  - tier3.ts    : 9 sets d'entrée de jeu (horns, floppy, pistol, ucla…)
//
// Ce fichier ne fait QUE le câblage : la table `SCRIPTED_GENERATORS` qui mappe
// chaque action FIBA à son générateur. Pour ajouter une nouvelle action,
// ajouter le générateur dans le sous-fichier approprié et l'enregistrer ici.

import { type Generator } from './scriptedGenerators/helpers';
import * as t1 from './scriptedGenerators/tier1';
import * as t2 from './scriptedGenerators/tier2';
import * as t3 from './scriptedGenerators/tier3';
import { genBallReversal, genDhoChain } from './scriptedGenerators/ballChain';

export type { Generator };

export const SCRIPTED_GENERATORS: Record<string, Generator> = {
  // Tier 1
  'pick-and-roll': t1.genPickAndRoll,
  'pick-and-pop': t1.genPickAndPop,
  'hand-off': t1.genHandOff,
  'give-and-go': t1.genGiveAndGo,
  'basket-cut': t1.genBasketCut,
  'backdoor-cut': t1.genBackdoorCut,
  'flare-cut': t1.genFlare,
  'curl-cut': t1.genCurlCut,
  'shuffle-cut': t1.genShuffleCut,
  'pin-down': t1.genPinDown,
  'flare-screen': t1.genFlareScreen,
  'back-screen': t1.genBackScreen,
  'cross-screen': t1.genCrossScreen,
  'screen-the-screener': t1.genScreenTheScreener,
  drive: t1.genDrive,
  pass: t1.genPass,
  'kick-out': t1.genKickOut,
  shoot: t1.genShoot,
  isolation: t1.genIsolation,

  // Tier 2 — Cuts
  'flash-cut': t2.genFlashCut,
  'flex-cut': t2.genFlexCut,
  'i-cut': t2.genICut,
  'popout-cut': t2.genPopoutCut,
  'shallow-cut': t2.genShallowCut,
  'ucla-cut': t2.genUclaCut,
  'v-cut': t2.genVCut,
  'l-cut': t2.genLCut,
  'banana-cut': t2.genBananaCut,
  'iverson-cut': t2.genIversonCut,

  // Tier 2 — Off-ball screens
  'staggered-screen': t2.genStaggeredScreen,
  'elevator-screen': t2.genElevatorScreen,
  'hammer-screen': t2.genHammerScreen,
  'ram-screen': t2.genRamScreen,
  'wide-screen': t2.genWideScreen,
  'wiper-screen': t2.genWiperScreen,
  'screen-away': t2.genScreenAway,

  // Tier 2 — PnR variants
  slip: t2.genSlip,
  reject: t2.genReject,
  'drag-screen': t2.genDragScreen,
  'step-up-screen': t2.genStepUpScreen,
  'ghost-screen': t2.genGhostScreen,

  // Tier 2 — Combinations
  'zoom-action': t2.genZoomAction,
  'rip-dho': t2.genRipDho,
  'slide-action': t2.genSlideAction,
  'split-action': t2.genSplitAction,
  'high-low-action': t2.genHighLowAction,
  'ball-reversal': genBallReversal,
  'dho-chain': genDhoChain,

  // Tier 2 — Replacements
  drift: t2.genDrift,
  lift: t2.genLift,
  replacement: t2.genReplacement,

  // Tier 3 — Sets
  'horns-set': t3.genHornsSet,
  'floppy-set': t3.genFloppySet,
  'pistol-set': t3.genPistolSet,
  'ucla-set': t3.genUclaSet,
  'iverson-set': t3.genIversonSet,
  'diamond-set': t3.genDiamondSet,
  'chicago-set': t3.genChicagoSet,
  'loop-set': t3.genLoopSet,
  'america-set': t3.genAmericaSet,
};
