// Générateurs Tier 3 : entrées de jeu (sets). Chaque set produit 1 step
// d'alignement avec les 5 attaquants placés selon la formation typique.

import type {
  AttackerId,
  AttackerPositions,
  Step,
} from '@/lib/types';
import { type Generator, clamp, makeStepFrom } from './helpers';

function alignmentStep(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  actionId: string,
  label: string,
): Step {
  return makeStepFrom(off, ballCarrier, [], { generatedBy: actionId, label });
}

const genHornsSet: Generator = (_prev, action) => {
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur (PG spot)
    O2: clamp({ x: 120, y: 260 }), // aile gauche
    O3: clamp({ x: 480, y: 260 }), // aile droite
    O4: clamp({ x: 225, y: 235 }), // coude gauche
    O5: clamp({ x: 375, y: 235 }), // coude droit
  };
  return [alignmentStep(off1, 'O1', action.id, 'Horns 1-2-2')];
};

const genFloppySet: Generator = (_prev, action) => {
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 330 }), // meneur top
    O2: clamp({ x: 53, y: 80 }),   // tireur corner gauche
    O3: clamp({ x: 547, y: 80 }),  // tireur corner droit
    O4: clamp({ x: 225, y: 235 }), // grand coude gauche
    O5: clamp({ x: 375, y: 235 }), // grand coude droit
  };
  return [alignmentStep(off1, 'O1', action.id, 'Floppy')];
};

const genPistolSet: Generator = (_prev, action) => {
  // Pistol = entrée transition. Meneur + arrière côté fort, big traînant.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 470 }), // meneur (logo)
    O2: clamp({ x: 480, y: 380 }), // arrière côté droit (drag)
    O3: clamp({ x: 120, y: 380 }), // ailier côté gauche
    O4: clamp({ x: 547, y: 80 }),  // ailier 2 corner
    O5: clamp({ x: 300, y: 235 }), // pivot trail
  };
  return [alignmentStep(off1, 'O1', action.id, 'Pistol')];
};

const genUclaSet: Generator = (_prev, action) => {
  // 1-3-1 : meneur top, 3 ailiers/coude, pivot bas.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur
    O2: clamp({ x: 120, y: 260 }), // aile G
    O3: clamp({ x: 480, y: 260 }), // aile D
    O4: clamp({ x: 300, y: 235 }), // haut poste (futur screener UCLA)
    O5: clamp({ x: 300, y: 95 }),  // pivot bas
  };
  return [alignmentStep(off1, 'O1', action.id, 'UCLA 1-3-1')];
};

const genIversonSet: Generator = (_prev, action) => {
  // Meneur top, 2 grands coudes, 2 ailiers en bas.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 120, y: 260 }), // aile G basse
    O3: clamp({ x: 480, y: 260 }), // aile D basse
    O4: clamp({ x: 225, y: 235 }), // coude G
    O5: clamp({ x: 375, y: 235 }), // coude D
  };
  return [alignmentStep(off1, 'O1', action.id, 'Iverson')];
};

const genDiamondSet: Generator = (_prev, action) => {
  // Losange : 1 top, 2 mi-distance, 1 bas du poste, 1 axe.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // pointe haute
    O2: clamp({ x: 120, y: 260 }), // mi-G
    O3: clamp({ x: 480, y: 260 }), // mi-D
    O4: clamp({ x: 300, y: 165 }), // axe / mi-poste
    O5: clamp({ x: 300, y: 95 }),  // pointe basse
  };
  return [alignmentStep(off1, 'O1', action.id, 'Diamond')];
};

const genChicagoSet: Generator = (_prev, action) => {
  // Setup pour DHO + pin-down : meneur côté droit, big au coude droit.
  const off1: AttackerPositions = {
    O1: clamp({ x: 480, y: 260 }), // meneur aile D
    O2: clamp({ x: 120, y: 260 }), // ailier G
    O3: clamp({ x: 53, y: 80 }),   // tireur corner G
    O4: clamp({ x: 375, y: 235 }), // grand coude D (DHO)
    O5: clamp({ x: 225, y: 95 }),  // 5 low-block G (pin-down ensuite)
  };
  return [alignmentStep(off1, 'O1', action.id, 'Chicago setup')];
};

const genLoopSet: Generator = (_prev, action) => {
  // Cutter en bas, 2 screeners en stagger côté D.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 547, y: 80 }),  // cutter corner D
    O3: clamp({ x: 120, y: 260 }), // aile G
    O4: clamp({ x: 375, y: 165 }), // 1er screener mi-poste D
    O5: clamp({ x: 375, y: 235 }), // 2e screener coude D
  };
  return [alignmentStep(off1, 'O1', action.id, 'Loop setup')];
};

const genAmericaSet: Generator = (_prev, action) => {
  // Triple écran : 3 grands alignés à gauche, 1 cutter qui les utilise.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 547, y: 80 }),  // cutter coin D
    O3: clamp({ x: 225, y: 95 }),  // 1er écran low-block G
    O4: clamp({ x: 225, y: 165 }), // 2e écran mi-poste G
    O5: clamp({ x: 225, y: 235 }), // 3e écran coude G
  };
  return [alignmentStep(off1, 'O1', action.id, 'America (triple)')];
};

export {
  genHornsSet, genFloppySet, genPistolSet, genUclaSet, genIversonSet,
  genDiamondSet, genChicagoSet, genLoopSet, genAmericaSet,
};
