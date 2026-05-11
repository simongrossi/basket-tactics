// Tests de frame finale (resolveFrameAt) : valident que le défenseur en
// contact d'écran ne se "téléporte" PAS sur le porteur pendant la transition
// — pas seulement que les briques freeze/curve/easing fonctionnent en
// isolation. Couvre le bug central : followDefendersAtFrame court-circuitait
// tout le réalisme en réécrivant la position de D1 à chaque frame.

import { describe, it, expect } from 'vitest';
import { resolveFrameAt } from '../playback/frameResolver';
import { makeInitialState } from '../../data/initial';
import { TEMPLATES } from '../../data/templates';
import type { AppState, Annotation, Step } from '../../types';

/**
 * Construit un scénario minimal 2 steps avec un écran O3→O1 entre les deux,
 * D1 démarre éloigné, doit "prendre" l'écran lors de la transition.
 */
function buildScreenScenario(quality: number = 100): AppState {
  const base = makeInitialState();
  const annotations: Annotation[] = [
    {
      type: 'screen',
      fromId: 'O3',
      toId: 'O1',
      from: { x: 470, y: 380 },
      to: { x: 320, y: 460 },
      quality,
    } as Annotation,
  ];
  const step0: Step = {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations,
  };
  const step1: Step = {
    off: {
      // Le porteur reste, le poseur s'est mis en place
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 320, y: 460 }, // poseur collé à O1
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations: [],
  };
  return {
    ...base,
    steps: [step0, step1],
    screenRule: 'hedge',
    defenseInitial: {
      // D1 colle son homme dès le départ (sinon le screen detection rate
      // l'écran : O3 doit être à <screenRadius=35px de D1).
      D1: { x: 300, y: 460 },
      D2: { x: 130, y: 370 },
      D3: { x: 460, y: 370 },
      D4: { x: 220, y: 220 },
      D5: { x: 380, y: 220 },
    },
    activeStep: 0,
  } as AppState;
}

function buildRecoverScenario(quality: number = 100): AppState {
  const state = buildScreenScenario(quality);
  state.steps = [
    ...state.steps,
    {
      off: {
        O1: { x: 390, y: 430 },
        O2: { x: 130, y: 380 },
        O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 },
        O5: { x: 380, y: 230 },
      },
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'dribble',
          fromId: 'O1',
          toId: null,
          from: { x: 300, y: 470 },
          to: { x: 390, y: 430 },
        } as Annotation,
      ],
    },
  ];
  return state;
}

function buildOffBallScreenScenario(quality: number = 100): AppState {
  const base = makeInitialState();
  return {
    ...base,
    steps: [
      {
        off: {
          O1: { x: 300, y: 470 },
          O2: { x: 120, y: 380 },
          O3: { x: 470, y: 380 },
          O4: { x: 220, y: 360 },
          O5: { x: 380, y: 230 },
        },
        ballCarrier: 'O1',
        annotations: [
          {
            type: 'cut',
            fromId: 'O2',
            toId: null,
            from: { x: 120, y: 380 },
            to: { x: 220, y: 380 },
          } as Annotation,
          {
            type: 'screen',
            fromId: 'O4',
            toId: 'O2',
            from: { x: 220, y: 360 },
            to: { x: 150, y: 380 },
            quality,
          } as Annotation,
        ],
      },
      {
        off: {
          O1: { x: 300, y: 470 },
          O2: { x: 220, y: 380 },
          O3: { x: 470, y: 380 },
          O4: { x: 150, y: 380 },
          O5: { x: 380, y: 230 },
        },
        ballCarrier: 'O1',
        annotations: [],
      },
    ],
    defenseInitial: {
      D1: { x: 300, y: 460 },
      D2: { x: 150, y: 380 },
      D3: { x: 460, y: 370 },
      D4: { x: 220, y: 340 },
      D5: { x: 380, y: 220 },
    },
    offBallScreenRule: 'chase',
    screenRadius: 120,
    activeStep: 0,
  } as AppState;
}

function buildOffBallRecoverScenario(quality: number = 100): AppState {
  const state = buildOffBallScreenScenario(quality);
  state.steps = [
    ...state.steps,
    {
      off: {
        O1: { x: 300, y: 470 },
        O2: { x: 340, y: 330 },
        O3: { x: 470, y: 380 },
        O4: { x: 150, y: 380 },
        O5: { x: 380, y: 230 },
      },
      ballCarrier: 'O1',
      annotations: [
        {
          type: 'cut',
          fromId: 'O2',
          toId: null,
          from: { x: 220, y: 380 },
          to: { x: 340, y: 330 },
        } as Annotation,
      ],
    },
  ];
  return state;
}

describe('resolveFrameAt — contact écran de bout en bout (Étape diagnostic)', () => {
  describe('Quality 100 (lockdown) — D1 doit rester collé au poseur', () => {
    const state = buildScreenScenario(100);

    it('à t=0.5 : D1 est au contact du poseur (clearance respectée)', () => {
      const frame = resolveFrameAt(state, 0.5);
      expect(frame).not.toBeNull();
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      // D1 doit être PROCHE du poseur (au contact, à ~MIN_CLEARANCE), pas
      // baladé à mi-chemin. Tolérance large pour absorber les variations
      // géométriques selon stance/règle.
      expect(distToScreener, 'D1 doit être au contact du poseur (≤ 50px)')
        .toBeLessThan(50);
      // Et jamais à l'intérieur du poseur.
      expect(distToScreener, 'D1 doit respecter la clearance avec le poseur')
        .toBeGreaterThanOrEqual(33);
      expect(d1.screenPhase).toBe('stuck');
    });

    it("à t=0.7 : D1 n'a pas encore récupéré (proche du poseur)", () => {
      const frame = resolveFrameAt(state, 0.7);
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      expect(distToScreener, 'D1 doit encore être proche du poseur à 70%')
        .toBeLessThan(80);
    });

    it('trajectoire : D1 ne traverse jamais le rayon du poseur', () => {
      // Échantillonne t de 0 à 1, vérifie que D1 reste à >= 16px (PLAYER_RADIUS)
      // du poseur. Pas de coupage à travers le disque.
      const screener = state.steps[1].off.O3;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        const dist = Math.hypot(d1.x - screener.x, d1.y - screener.y);
        expect(dist, `t=${t.toFixed(2)} : D1 ne doit pas traverser le poseur`)
          .toBeGreaterThanOrEqual(15); // marge 1px pour les arrondis
      }
    });

    it("utilise la qualité du bon poseur quand plusieurs écrans existent sur le step", () => {
      const multiScreenState = buildScreenScenario(100);
      multiScreenState.steps[0].annotations = [
        {
          type: 'screen',
          fromId: 'O2',
          toId: 'O5',
          from: { x: 130, y: 380 },
          to: { x: 150, y: 380 },
          quality: 0,
        } as Annotation,
        ...multiScreenState.steps[0].annotations,
      ];

      const frame = resolveFrameAt(multiScreenState, 0.7);
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      expect(distToScreener, "D1 doit lire la qualité lockdown de l'écran O3, pas le ghost O2")
        .toBeLessThan(80);
    });
  });

  describe("Anti-flicker — poseur qui se déplace entre les steps (systeme_basket-8)", () => {
    it('D1 ne saute pas de côté à côté du poseur quand celui-ci se déplace significativement', () => {
      // Reproduit le bug de systeme_basket-8.json : O3 se déplace de
      // (470,380) à (338.58, 428.97) pendant le segment 1→2. Pendant le
      // scrub, le poseur "traverse" l'axe defA→defB de D1 et la détection
      // current-frame `screen` fire par intermittence → screenerObstacles
      // apparaît/disparaît → curveAroundObstacle bascule → D1 saute.
      // Le fix : screenerObstacles construit uniquement depuis screenA/B
      // (stables), pas depuis screen interpolé.
      const base = makeInitialState();
      const state = {
        ...base,
        steps: [
          {
            off: {
              O1: { x: 300, y: 470 },
              O2: { x: 130, y: 380 },
              O3: { x: 470, y: 380 },
              O4: { x: 220, y: 230 },
              O5: { x: 380, y: 230 },
            },
            ballCarrier: 'O1',
            annotations: [
              {
                type: 'screen',
                fromId: 'O3',
                toId: null,
                from: { x: 470, y: 380 },
                to: { x: 338.58, y: 428.97 },
                phase: 'end',
              } as Annotation,
            ],
          },
          {
            off: {
              O1: { x: 513, y: 322 },
              O2: { x: 130, y: 380 },
              O3: { x: 338.58, y: 428.97 },
              O4: { x: 220, y: 230 },
              O5: { x: 380, y: 230 },
            },
            ballCarrier: 'O1',
            annotations: [],
          },
        ],
        screenRule: 'hedge',
        defenseInitial: {
          D1: { x: 300, y: 380 },
          D2: { x: 170, y: 310 },
          D3: { x: 430, y: 310 },
          D4: { x: 240, y: 160 },
          D5: { x: 360, y: 160 },
        },
        activeStep: 0,
      } as AppState;

      // Échantillonne fin (1/60 step) pour détecter le flicker mid-segment.
      // On ÉVITE le boundary t=1.0 où la frame bascule de "transition
      // idxA=0→idxB=1" à "step idxA=1 fixe" (la frame source change
      // d'algorithme et un saut natif peut apparaître).
      let prev: { x: number; y: number } | null = null;
      let maxJump = 0;
      for (let f = 0; f < 60; f++) {
        const t = f / 60;
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        if (prev) {
          const jump = Math.hypot(d1.x - prev.x, d1.y - prev.y);
          if (jump > maxJump) maxJump = jump;
        }
        prev = { x: d1.x, y: d1.y };
      }
      // Avant fixes Phase 1 : sauts > 120px (D1 flippait d'un côté à l'autre).
      // Après Phase 1 + Phase 2 : trajectoire fluide sub-pixel.
      expect(maxJump, `saut max entre 2 frames adjacents mid-segment`).toBeLessThan(5);
    });
  });

  describe("Arriving — pas de basculement de côté pendant l'approche", () => {
    it("en arriving, D1 ne flippe pas d'un côté à l'autre du poseur pendant le scrub", () => {
      // Bug constaté : pendant l'approche, le contactPoint était recalculé
      // depuis p (qui suit la Bezier ou un lerp vers défB qui peut être
      // de l'autre côté du poseur). Quand p traversait l'axe, D1 visuellement
      // sautait de gauche à droite. Fix : anchor = defB (stuck point final)
      // pour 'arriving', donne un côté stable pour toute la transition.
      const state = buildScreenScenario(100);
      // Côté du stuck final (defB[D1] au step 1) par rapport au poseur.
      const finalFrame = resolveFrameAt(state, 0.99);
      expect(finalFrame).not.toBeNull();
      const finalD1 = finalFrame!.defPos.D1;
      const screener = finalFrame!.off.O3;
      const finalSide = Math.sign(finalD1.x - screener.x);

      // Pendant l'approche (stuck phase de arriving, localT > 0.3),
      // D1 doit être du même côté que sa position finale.
      for (let t = 0.30; t <= 0.95; t += 0.05) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        const screenerNow = frame.off.O3;
        const sideNow = Math.sign(d1.x - screenerNow.x);
        if (finalSide !== 0 && sideNow !== 0) {
          expect(sideNow, `t=${t.toFixed(2)} : D1 ne doit pas être du côté opposé au stuck`)
            .toBe(finalSide);
        }
      }
    });
  });

  describe("Recovery — pas d'orbite autour du poseur (bug 'rattrape à l'opposé')", () => {
    it('en leaving, D1 ne bascule pas du côté opposé au stuck point pendant la décohésion', () => {
      // Bug constaté : pendant la recovery, D1 partait orbiter du côté
      // opposé au stuck point via la Bezier (forcedPushSign basé sur la rule
      // pointait à l'opposé du stuck side). Fix : Bezier désactivée en
      // 'leaving', et l'adhésion ancre le contactPoint sur defA (stuck),
      // pas sur p courant.
      const state = buildRecoverScenario(100);
      // Stuck point à la fin du step 1 (juste avant la transition recovery).
      const stuckFrame = resolveFrameAt(state, 0.99);
      expect(stuckFrame).not.toBeNull();
      const stuckD1 = stuckFrame!.defPos.D1;
      const screener = stuckFrame!.off.O3;
      const stuckSide = Math.sign(stuckD1.x - screener.x);

      // Pendant la phase stuck de la recovery (localT du segment 1→2 < ~0.85),
      // D1 doit rester côté `stuckSide`. Au-delà il peut se rapprocher de O1
      // qui est de l'autre côté, mais sans flip brutal au milieu.
      for (let t = 1.05; t <= 1.7; t += 0.05) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        const screenerNow = frame.off.O3;
        const sideNow = Math.sign(d1.x - screenerNow.x);
        if (stuckSide !== 0 && sideNow !== 0) {
          expect(sideNow, `t=${t.toFixed(2)} : D1 ne doit pas orbiter de l'autre côté`)
            .toBe(stuckSide);
        }
      }
    });
  });

  describe('Recover après impact — le temps perdu se prolonge au step suivant', () => {
    it('D1 reste late au step suivant un écran lockdown', () => {
      const state = buildRecoverScenario(100);
      const frame = resolveFrameAt(state, 2);
      expect(frame).not.toBeNull();
      expect(frame!.defPos.D1.late).toBe(true);
      expect(frame!.defPos.D1.screenPhase).toBe('recover');
    });

    it('D1 récupère normalement après un ghost screen', () => {
      const state = buildRecoverScenario(0);
      const frame = resolveFrameAt(state, 2);
      expect(frame).not.toBeNull();
      expect(frame!.defPos.D1.late).toBe(false);
    });
  });

  describe('Template PNR central — poseur planté + défenseur collé', () => {
    it("D1 reste collé à O5 quand l'écran est posé", () => {
      const template = TEMPLATES.find((t) => t.id === 'pnr-central');
      expect(template).toBeTruthy();
      const state = {
        ...makeInitialState(),
        steps: structuredClone(template!.steps),
        defenseInitial: structuredClone(template!.defenseInitial),
        screenRule: 'hedge',
        activeStep: 0,
      } as AppState;
      const frame = resolveFrameAt(state, 1.5);
      expect(frame).not.toBeNull();
      const d1 = frame!.defPos.D1;
      const o5 = frame!.off.O5;
      expect(d1.screenPhase).toBe('stuck');
      // D1 doit être proche du poseur (au sens "à portée de contact"). Le
      // contact est ancré au midpoint de la trajectoire du poseur (cf. fix
      // anti-flicker), donc si O5 bouge pendant la transition la distance
      // par rapport à sa position INTERPOLÉE peut être plus large. Tolérance
      // étendue à 75px pour absorber les déplacements normaux du poseur.
      expect(Math.hypot(d1.x - o5.x, d1.y - o5.y)).toBeLessThan(75);
    });
  });

  describe('Écran non-porteur — le défenseur du cutter perd aussi du temps', () => {
    it('D2 reste proche du poseur pendant un pindown solide', () => {
      const state = buildOffBallScreenScenario(100);
      const frame = resolveFrameAt(state, 0.7);
      expect(frame).not.toBeNull();
      expect(frame!.offBallScreens.some((s) => s.cutterDef === 'D2' && s.screener === 'O4')).toBe(true);
      const d2 = frame!.defPos.D2;
      const screener = frame!.off.O4;
      const distToScreener = Math.hypot(d2.x - screener.x, d2.y - screener.y);
      expect(distToScreener).toBeLessThan(80);
      expect(d2.screenPhase).toBe('stuck');
    });

    it('D2 reste en recover au step suivant un pindown solide', () => {
      const state = buildOffBallRecoverScenario(100);
      const frame = resolveFrameAt(state, 2);
      expect(frame).not.toBeNull();
      expect(frame!.defPos.D2.late).toBe(true);
      expect(frame!.defPos.D2.screenPhase).toBe('recover');
    });
  });

  describe('Quality 0 (ghost) — D1 récupère son homme normalement', () => {
    const state = buildScreenScenario(0);

    it('à t=0.7 : D1 est plus proche de O1 que du poseur (faux écran)', () => {
      const frame = resolveFrameAt(state, 0.7);
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const carrier = frame!.off.O1;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      const distToCarrier = Math.hypot(d1.x - carrier.x, d1.y - carrier.y);
      // À ghost, D1 ignore le poseur et suit son homme → plus proche de O1.
      expect(distToCarrier).toBeLessThan(distToScreener);
    });
  });

  describe('Continuité dans le temps — pas de saut visuel', () => {
    const state = buildScreenScenario(75);

    it("la position de D1 varie de moins de 30px entre deux frames adjacentes", () => {
      let prev: { x: number; y: number } | null = null;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        if (prev) {
          const jump = Math.hypot(d1.x - prev.x, d1.y - prev.y);
          expect(jump, `t=${t.toFixed(2)} : saut de D1 (avant fix : ~70px à la transition follow)`)
            .toBeLessThan(30);
        }
        prev = { x: d1.x, y: d1.y };
      }
    });
  });
});
