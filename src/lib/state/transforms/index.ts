// Barrel des transformations d'état AppState → AppState.
//
// Toutes les transformations sont des fonctions PURES, testables sans React.
// `useAppState` ne fait que les câbler avec setStateWithHistory.
//
// Domaines :
//  - step              : CRUD step + label + ballCarrier
//  - annotation        : CRUD annotation + timing/quality/phase + forcedScreener
//  - defense           : rules, profils, presets, système (man/zone), switchs, overrides
//  - attacker          : hand, orientation, profil offensif
//  - zone              : overrides régionaux, zoneConfig
//  - scenario          : actions scriptées + branches
//  - defensiveScripted : actions défensives scriptées
//  - core              : tool, template, import, patch, playerCount, resetAll

export * as stepTx from './stepTransforms';
export * as annotationTx from './annotationTransforms';
export * as defenseTx from './defenseTransforms';
export * as attackerTx from './attackerTransforms';
export * as zoneTx from './zoneTransforms';
export * as scenarioTx from './scenarioTransforms';
export * as defensiveTx from './defensiveScriptedTransforms';
export * as coreTx from './coreTransforms';
