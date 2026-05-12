// Moteur d'écrans (porteur + hors-ballon).
//
// Ce barrel ne fait que ré-exporter l'API publique. La logique vit dans :
//
//  - helpers.ts                 : intent filter, smoothstep, push-out clearance
//  - detectCarrierScreen.ts     : `detectScreen` (PnR / drag / ghost / etc.)
//  - carrierScreenAdjust.ts     : `applyScreenAdjustment` + peel-switch fire + applySwitch
//  - detectOffBallScreens.ts    : `detectOffBallScreens` + upgrade stagger/elevator/flex/hammer
//  - offBallScreenAdjust.ts     : `applyOffBallScreenAdjustment` + `applySwitchOffBall`
//
// Pour ajouter une nouvelle rule défensive (carrier ou off-ball) : éditer le
// `*Adjust.ts` du bon module, ajouter le bloc `if (rule === '…') { … }`.
// Pour ajouter un nouveau TYPE d'écran : étendre `OffBallScreenType` dans les
// types et `upgradeOffBallScreens` dans `detectOffBallScreens.ts`.

export { detectScreen } from './detectCarrierScreen';
export {
  applyScreenAdjustment,
  applySwitch,
  peelSwitchShouldFire,
} from './carrierScreenAdjust';
export { detectOffBallScreens } from './detectOffBallScreens';
export {
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
} from './offBallScreenAdjust';
export { detectRejectedScreen, type RejectedScreen } from './detectRejectedScreen';
