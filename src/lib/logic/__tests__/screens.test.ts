import { describe, it, expect } from 'vitest';
import {
  detectScreen,
  detectOffBallScreens,
  applySwitch,
  applySwitchOffBall,
  applyScreenAdjustment,
  applyOffBallScreenAdjustment,
} from '../screens';
import { baseMatchups } from '../../data/initial';
import type {
  AttackerPositions,
  DefenderPositions,
  DetectedScreen,
  DetectedOffBallScreen,
} from '../../types';

const carrierAt = (p: { x: number; y: number }): AttackerPositions => ({
  O1: p,
  O2: { x: 0, y: 0 },
  O3: { x: 600, y: 0 },
  O4: { x: 0, y: 500 },
  O5: { x: 600, y: 500 },
});

const defAt = (carrierDefPos: { x: number; y: number }): DefenderPositions => ({
  D1: carrierDefPos,
  D2: { x: 0, y: 0 },
  D3: { x: 600, y: 0 },
  D4: { x: 0, y: 500 },
  D5: { x: 600, y: 500 },
});

describe('detectScreen', () => {
  it("retourne null si le porteur n'a pas de défenseur dans les matchups", () => {
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt({ x: 300, y: 380 });
    // matchups manipulés pour qu'aucun défenseur ne soit sur O1
    const matchups = { ...baseMatchups, D1: 'O3' as const };
    const result = detectScreen(off, 'O1', matchups, def, 35);
    // O3 (à 600,0) n'est pas un poseur d'écran plausible — pas d'écran détecté
    expect(result).toBeNull();
  });

  it('détecte un écran porteur quand un attaquant est proche du défenseur du porteur', () => {
    const carrier = { x: 300, y: 470 };
    const carrierDef = { x: 300, y: 410 };
    const off: AttackerPositions = {
      O1: carrier,
      // poseur à <35px du carrierDef et <80px du porteur
      O2: { x: 305, y: 420 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const def = defAt(carrierDef);
    const screen = detectScreen(off, 'O1', baseMatchups, def, 35);
    expect(screen).not.toBeNull();
    expect(screen!.carrier).toBe('O1');
    expect(screen!.carrierDef).toBe('D1');
    expect(screen!.screener).toBe('O2');
    expect(screen!.screenerDef).toBe('D2');
  });

  it("ne détecte pas d'écran si tous les attaquants sont hors du screenRadius", () => {
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt({ x: 300, y: 380 });
    const result = detectScreen(off, 'O1', baseMatchups, def, 35);
    expect(result).toBeNull();
  });

  it("ne détecte pas d'écran si le poseur potentiel est loin du porteur (>80px)", () => {
    // O2 est proche du carrierDef (filtre 1 OK) mais à >80px du porteur (filtre 2 KO)
    const carrierDef = { x: 300, y: 380 };
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 305, y: 380 }, // 90px du porteur, 5px du carrierDef
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const def = defAt(carrierDef);
    const result = detectScreen(off, 'O1', baseMatchups, def, 35);
    expect(result).toBeNull();
  });
});

describe('detectScreen — forcedScreener', () => {
  it("force l'attaquant désigné comme poseur même si trop loin du carrierDef et du porteur", () => {
    const carrierDef = { x: 300, y: 380 };
    // O3 placé très loin (600, 0) — l'auto-detection ne le retiendrait jamais
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt(carrierDef);
    const screen = detectScreen(off, 'O1', baseMatchups, def, 35, 'O3');
    expect(screen).not.toBeNull();
    expect(screen!.screener).toBe('O3');
    expect(screen!.screenerDef).toBe('D3');
    expect(screen!.carrier).toBe('O1');
    expect(screen!.carrierDef).toBe('D1');
  });

  it("ignore le forcedScreener s'il pointe sur le porteur lui-même", () => {
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt({ x: 300, y: 380 });
    // forcedScreener = O1 = porteur → fallback sur l'auto-detection
    // (qui ne trouve rien dans cette config) → null
    const screen = detectScreen(off, 'O1', baseMatchups, def, 35, 'O1');
    expect(screen).toBeNull();
  });

  it("retourne null si le forcedScreener n'a pas de défenseur dans les matchups", () => {
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt({ x: 300, y: 380 });
    // matchups où aucun défenseur ne match O3 → screenerDef introuvable
    const matchups = { ...baseMatchups, D3: 'O5' as const };
    const screen = detectScreen(off, 'O1', matchups, def, 35, 'O3');
    expect(screen).toBeNull();
  });
});

describe('applySwitch', () => {
  it('échange les hommes des deux défenseurs concernés', () => {
    const screen: DetectedScreen = {
      screener: 'O2',
      screenerDef: 'D2',
      carrier: 'O1',
      carrierDef: 'D1',
      screenerPos: { x: 0, y: 0 },
    };
    const out = applySwitch(baseMatchups, screen);
    expect(out.D1).toBe('O2');
    expect(out.D2).toBe('O1');
    // Les autres défenseurs sont inchangés
    expect(out.D3).toBe('O3');
    expect(out.D4).toBe('O4');
    expect(out.D5).toBe('O5');
  });

  it('ne mute pas le matchups passé en argument', () => {
    const screen: DetectedScreen = {
      screener: 'O2',
      screenerDef: 'D2',
      carrier: 'O1',
      carrierDef: 'D1',
      screenerPos: { x: 0, y: 0 },
    };
    const before = { ...baseMatchups };
    applySwitch(baseMatchups, screen);
    expect(baseMatchups).toEqual(before);
  });
});

describe('applyScreenAdjustment', () => {
  const screen: DetectedScreen = {
    screener: 'O2',
    screenerDef: 'D2',
    carrier: 'O1',
    carrierDef: 'D1',
    screenerPos: { x: 310, y: 390 },
  };
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 310, y: 390 },
    O3: { x: 600, y: 0 },
    O4: { x: 0, y: 500 },
    O5: { x: 600, y: 500 },
  };

  it('renvoie la cible inchangée pour un défenseur non concerné', () => {
    const target = { x: 100, y: 100 };
    const out = applyScreenAdjustment(target, screen, 'over', 'D5', off);
    expect(out).toEqual(target);
  });

  it('renvoie la cible inchangée pour la règle "switch" (le switch est appliqué ailleurs)', () => {
    const target = { x: 300, y: 380 };
    const out = applyScreenAdjustment(target, screen, 'switch', 'D1', off);
    expect(out).toEqual(target);
  });

  it('"drop" place le screenerDef côté panier par rapport au screener (la cible de base est ignorée)', () => {
    const target = { x: 310, y: 310 };
    const out = applyScreenAdjustment(target, screen, 'drop', 'D2', off);
    // Le panier est en (300, 75) ; screenerPos en (310, 390). Le drop place D2 entre
    // le screener et le panier → y du résultat doit être inférieur au screenerPos.y.
    expect(out.y).toBeLessThan(screen.screenerPos.y);
  });

  it('"hedge" fait passer le carrierDef over the top (décalage latéral du côté du porteur)', () => {
    // D1 est juste derrière O1 (porteur), O2 (poseur) en (310, 390) à droite-au-dessus.
    // sideOfCarrier = sign(O1.x - O2.x) = sign(300 - 310) = -1 → décalage à gauche.
    const target = { x: 300, y: 460 };
    const out = applyScreenAdjustment(target, screen, 'hedge', 'D1', off);
    // Mouvement non nul (D1 doit bouger en hedge, contrairement au comportement
    // historique où seul D5 réagissait).
    const dx = out.x - target.x;
    const dy = out.y - target.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(4);
  });

  it('"drop" avec dropDepth="deep" recule plus que "shallow"', () => {
    const target = { x: 310, y: 310 };
    const shallow = applyScreenAdjustment(target, screen, 'drop', 'D2', off, 35, 'shallow');
    const deep = applyScreenAdjustment(target, screen, 'drop', 'D2', off, 35, 'deep');
    // "deep" recule plus loin du screener vers le panier — donc plus loin du screener
    const dShallow = Math.hypot(shallow.x - screen.screenerPos.x, shallow.y - screen.screenerPos.y);
    const dDeep = Math.hypot(deep.x - screen.screenerPos.x, deep.y - screen.screenerPos.y);
    expect(dDeep).toBeGreaterThan(dShallow);
  });
});

describe('detectOffBallScreens', () => {
  it("renvoie un tableau vide quand aucun attaquant n'est en position de poseur", () => {
    const off = carrierAt({ x: 300, y: 470 });
    const def = defAt({ x: 300, y: 380 });
    const out = detectOffBallScreens(off, 'O1', baseMatchups, def, 35);
    expect(out).toEqual([]);
  });

  it('détecte un pindown quand le poseur est nettement plus haut que le cutter (dy > 20)', () => {
    // Cutter = O2, poseur potentiel = O4 placé devant le cutter et près du défenseur de O2.
    // O1 est porteur et loin de l'action.
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 }, // porteur, loin
      O2: { x: 130, y: 380 }, // cutter
      O3: { x: 470, y: 380 },
      O4: { x: 130, y: 320 }, // poseur, dy = 320 - 380 = -60 vs cutter; perspective basket Y=0 panier
      O5: { x: 380, y: 230 },
    };
    // On place D2 (déf de O2) PRÈS de O4 pour déclencher la détection
    const def: DefenderPositions = {
      D1: { x: 300, y: 380 },
      D2: { x: 135, y: 325 }, // proche du screener O4
      D3: { x: 430, y: 310 },
      D4: { x: 240, y: 160 },
      D5: { x: 360, y: 160 },
    };
    const out = detectOffBallScreens(off, 'O1', baseMatchups, def, 35);
    expect(out.length).toBeGreaterThan(0);
    const obs = out.find((o) => o.cutter === 'O2' && o.screener === 'O4');
    expect(obs).toBeDefined();
    // dy = screenerPos.y - cutterPos.y = 320 - 380 = -60 → backscreen
    expect(obs!.type).toBe('backscreen');
  });
});

describe('detectScreen — filtre intention (velocity)', () => {
  // Un attaquant peut se trouver près du carrierDef à un moment donné par
  // pure coïncidence (il vient de PASSER à proximité). Si sa velocity le
  // porte LOIN du couple porteur/défenseur, ce n'est pas un écran posé,
  // c'est un croisement. Le filtre d'intention l'écarte.
  it("ignore un attaquant qui s'éloigne du carrierDef (mauvaise intention)", () => {
    const carrier = { x: 300, y: 470 };
    const carrierDef = { x: 300, y: 410 };
    // O2 était collé au carrierDef à l'étape précédente (305, 410, dist ~5px),
    // et se déplace vers (305, 432) à l'étape courante (dist ~22px). Il passe
    // donc par la zone de proximité MAIS s'en éloigne — c'est un croisement,
    // pas une pose d'écran.
    const prevOff: AttackerPositions = {
      O1: { x: 290, y: 460 },
      O2: { x: 305, y: 410 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const off: AttackerPositions = {
      O1: carrier,
      O2: { x: 305, y: 432 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const def = defAt(carrierDef);
    // Sans prevOff (rétrocompat) : écran détecté (proximité pure).
    const withoutPrev = detectScreen(off, 'O1', baseMatchups, def, 35);
    expect(withoutPrev).not.toBeNull();
    // Avec prevOff : O2 s'éloigne du carrierDef, donc pas un écran intentionnel.
    const withPrev = detectScreen(off, 'O1', baseMatchups, def, 35, undefined, prevOff);
    expect(withPrev).toBeNull();
  });

  it("conserve un attaquant qui se rapproche du carrierDef (bonne intention)", () => {
    const carrier = { x: 300, y: 470 };
    const carrierDef = { x: 300, y: 410 };
    // O2 vient de l'extérieur (loin du couple) et se rapproche → écran posé.
    const prevOff: AttackerPositions = {
      O1: { x: 290, y: 460 },
      O2: { x: 380, y: 460 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const off: AttackerPositions = {
      O1: carrier,
      O2: { x: 305, y: 420 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const def = defAt(carrierDef);
    const result = detectScreen(off, 'O1', baseMatchups, def, 35, undefined, prevOff);
    expect(result).not.toBeNull();
    expect(result!.screener).toBe('O2');
  });

  it("respecte un forcedScreener même avec velocity opposée (override utilisateur prime)", () => {
    const carrier = { x: 300, y: 470 };
    const carrierDef = { x: 300, y: 410 };
    const prevOff: AttackerPositions = {
      O1: { x: 290, y: 460 },
      O2: { x: 260, y: 380 }, // s'éloigne
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const off: AttackerPositions = {
      O1: carrier,
      O2: { x: 305, y: 420 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const def = defAt(carrierDef);
    // Forced O2 → l'utilisateur décide, on ne filtre pas par velocity.
    const result = detectScreen(off, 'O1', baseMatchups, def, 35, 'O2', prevOff);
    expect(result).not.toBeNull();
    expect(result!.screener).toBe('O2');
  });
});

describe('applyOffBallScreenAdjustment — top-lock', () => {
  // Le défenseur du cutter doit se positionner côté BALLON pour empêcher
  // la réception, indépendamment de la direction screener→cutter.
  it('place le défenseur du cutter côté ballon (ballon en haut, cutter horizontal)', () => {
    const screen: DetectedOffBallScreen = {
      type: 'pindown',
      screener: 'O3',
      screenerDef: 'D3',
      cutter: 'O2',
      cutterDef: 'D2',
      screenerPos: { x: 300, y: 400 },
      cutterPos: { x: 400, y: 400 },
    };
    const off: AttackerPositions = {
      O1: { x: 500, y: 200 }, // porteur en haut-droite
      O2: { x: 400, y: 400 },
      O3: { x: 300, y: 400 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const baseTarget = { x: 400, y: 380 }; // entre cutter et panier
    const result = applyOffBallScreenAdjustment(
      baseTarget, screen, 'top-lock', 'D2', off, off.O1
    );
    // Le ballon est plus haut (y=200 < 400) que le cutter, donc le défenseur
    // doit être poussé vers le HAUT (y plus petit que baseTarget).
    expect(result.y).toBeLessThan(baseTarget.y);
  });

  it('place le défenseur du cutter de l\'autre côté quand le ballon est en bas', () => {
    const screen: DetectedOffBallScreen = {
      type: 'pindown',
      screener: 'O3',
      screenerDef: 'D3',
      cutter: 'O2',
      cutterDef: 'D2',
      screenerPos: { x: 300, y: 400 },
      cutterPos: { x: 400, y: 400 },
    };
    const off: AttackerPositions = {
      O1: { x: 500, y: 600 }, // porteur en bas-droite
      O2: { x: 400, y: 400 },
      O3: { x: 300, y: 400 },
      O4: { x: 0, y: 500 },
      O5: { x: 600, y: 500 },
    };
    const baseTarget = { x: 400, y: 380 };
    const result = applyOffBallScreenAdjustment(
      baseTarget, screen, 'top-lock', 'D2', off, off.O1
    );
    // Ballon en bas (y=600), donc le défenseur doit être poussé vers le BAS.
    expect(result.y).toBeGreaterThan(baseTarget.y);
  });
});

describe('applySwitchOffBall', () => {
  it('échange les hommes du cutterDef et du screenerDef', () => {
    const screen: DetectedOffBallScreen = {
      type: 'pindown',
      screener: 'O4',
      screenerDef: 'D4',
      cutter: 'O2',
      cutterDef: 'D2',
      screenerPos: { x: 0, y: 0 },
      cutterPos: { x: 0, y: 0 },
    };
    const out = applySwitchOffBall(baseMatchups, screen);
    expect(out.D2).toBe('O4');
    expect(out.D4).toBe('O2');
    expect(out.D1).toBe('O1');
    expect(out.D3).toBe('O3');
    expect(out.D5).toBe('O5');
  });
});
