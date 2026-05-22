import { describe, it, expect } from 'vitest';
import { computeDefensiveRoute, sampleRoute } from '../defensiveRoute';

describe('defensiveRoute — computeDefensiveRoute', () => {
  it('retourne le trajet droit sans obstacle', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(r.waypoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(r.length).toBeCloseTo(100);
  });

  it('retourne droit si les obstacles ne bloquent pas le segment', () => {
    const r = computeDefensiveRoute(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ center: { x: 50, y: 200 }, radius: 34 }],
    );
    expect(r.waypoints).toHaveLength(2);
  });

  it('contourne un obstacle posé sur le segment', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute(from, to, [obs]);
    expect(r.waypoints).toHaveLength(3);
    const mid = r.waypoints[1];
    // le waypoint de détour est au moins à `radius` du centre de l'obstacle
    expect(Math.hypot(mid.x - obs.center.x, mid.y - obs.center.y))
      .toBeGreaterThanOrEqual(34);
    // la route détournée est plus longue que le trajet droit
    expect(r.length).toBeGreaterThan(100);
  });

  it('choisit le côté de détour le plus court', () => {
    // obstacle légèrement décalé vers +y → le détour le plus court passe
    // du côté -y (opposé au décalage).
    const obs = { center: { x: 50, y: 5 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    expect(r.waypoints).toHaveLength(3);
    expect(r.waypoints[1].y).toBeLessThan(0);
  });

  it('from == to → route dégénérée de longueur 0', () => {
    const r = computeDefensiveRoute(
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      [{ center: { x: 10, y: 10 }, radius: 34 }],
    );
    expect(r.length).toBe(0);
    expect(r.waypoints).toEqual([{ x: 10, y: 10 }, { x: 10, y: 10 }]);
  });

  it('est déterministe (2 appels successifs = résultat identique)', () => {
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 60, y: 10 }, radius: 30 },
    ];
    const a = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    const b = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(a).toEqual(b);
  });

  it('dégrade gracieusement quand aucune route candidate n\'est dégagée', () => {
    // Obstacles serrés des deux côtés du détour → aucune route à 1 waypoint
    // n'est totalement dégagée. Le module renvoie quand même une route.
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 50, y: 80 }, radius: 60 },
      { center: { x: 50, y: -80 }, radius: 60 },
    ];
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(r.waypoints).toHaveLength(3);
    expect(Number.isFinite(r.length)).toBe(true);
  });

  it('dégradation gracieuse asymétrique → choisit le côté le moins pénétré', () => {
    // Scénario asymétrique qui force le fallback `else` (aucune route à 1
    // waypoint n'est dégagée). Un obstacle sur le segment forme le cluster
    // (r=34). Deux obstacles flanquent chaque côté du détour, hors du segment
    // direct (donc PAS dans le cluster) et assez près pour qu'AUCUN offset de
    // waypoint (du minimum 38 px au plafond r*3+4 = 106 px) ne les dégage :
    //   - côté +y : obstacle géant (centre y=200, r=180) → pénétration ~18.
    //   - côté -y : obstacle plus modeste (centre y=-120, r=90) → pénétration ~8.
    // Les deux côtés pénètrent, mais différemment → le fallback DOIT renvoyer
    // le côté -y (moindre pénétration).
    const from = { x: 0, y: 0 };
    const to = { x: 200, y: 0 };
    const obs = [
      { center: { x: 100, y: 0 }, radius: 34 },    // cluster sur le segment
      { center: { x: 100, y: 200 }, radius: 180 }, // flanc +y, très pénétrant
      { center: { x: 100, y: -120 }, radius: 90 }, // flanc -y, peu pénétrant
    ];
    const r = computeDefensiveRoute(from, to, obs);
    expect(r.waypoints).toHaveLength(3);

    // Le waypoint de détour doit être du côté -y (le moins encombré).
    const mid = r.waypoints[1];
    expect(mid.y).toBeLessThan(0);

    // Vérification indépendante du choix : recalcul de la pénétration max de
    // la route renvoyée vs une route miroir côté +y. La route renvoyée doit
    // être strictement moins pénétrante.
    const ptToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    const routePenetration = (wps: { x: number; y: number }[]) => {
      let worst = 0;
      for (let i = 0; i < wps.length - 1; i++) {
        for (const o of obs) {
          const pen = o.radius - ptToSeg(o.center, wps[i], wps[i + 1]);
          if (pen > worst) worst = pen;
        }
      }
      return worst;
    };
    const chosenPen = routePenetration(r.waypoints);
    const mirrored = [r.waypoints[0], { x: mid.x, y: -mid.y }, r.waypoints[2]];
    const mirroredPen = routePenetration(mirrored);
    // L'assertion échoue si le module a choisi le mauvais côté (+y).
    expect(chosenPen).toBeLessThan(mirroredPen);
  });
});

describe('defensiveRoute — sampleRoute', () => {
  it('renvoie from à t=0 et to à t=1', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(sampleRoute(r, 0)).toEqual({ x: 0, y: 0 });
    expect(sampleRoute(r, 1)).toEqual({ x: 100, y: 0 });
  });

  it('suit le détour à mi-parcours', () => {
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    const mid = sampleRoute(r, 0.5);
    // à mi-parcours la position est écartée de l'axe direct y=0
    expect(Math.abs(mid.y)).toBeGreaterThan(10);
  });
});
