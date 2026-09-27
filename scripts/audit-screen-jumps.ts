// Audit des sauts, téléportations et incohérences de trajectoire pendant la
// lecture, avec un focus sur les écrans (contournements, contacts, chocs).
//
// Usage : npx tsx scripts/audit-screen-jumps.ts [--seconds s] [--json fichier] [--top n] [templateId...]
//
// Rejoue chaque système de la bibliothèque (profil réaliste, séquence canonique
// de 60 sous-pas par étape, mémoire de lecture) et mesure, sous-pas par
// sous-pas :
//   - saut      : déplacement > garde-fou 9 px, ou vitesse instantanée > 9 m/s
//   - à-coup    : variation de vitesse > 2 m/s en un seul sous-pas (≈ 30 m/s²)
//   - aller-retour : deux déplacements successifs > 1,5 px à plus de 120°
//   - orbite    : défenseur en contact d'écran qui tourne de > 25° autour du
//                 poseur en un sous-pas (changement de côté)
//   - chevauchement : deux joueurs à < 34 px (règle 1), < 30 px (visible)
//   - décision : changement de contactKey / screenMode / routeKind / signe de
//                poussée sur un défenseur au même sous-pas qu'un saut ou à-coup
// Chaque événement est étiqueté selon le contexte écran (contact défenseur,
// poseur, attaquant qui contourne un poseur, frontière d'étape).

import { writeFileSync } from 'node:fs';
import { makeInitialState } from '../src/lib/data/initial';
import { TEMPLATES } from '../src/lib/data/templates';
import { PX_PER_M } from '../src/lib/data/court';
import { loadTemplate } from '../src/lib/state/transforms/coreTransforms';
import { resolveFrameAt, resolveTimelineFrame, type PlaybackFrame } from '../src/lib/logic/playback/frameResolver';
import { effectiveDefensePositions } from '../src/lib/logic/engine';
import { fullStepToSeconds } from '../src/lib/logic/timecode';
import type { AppState, Point } from '../src/lib/types';

const SUBSTEPS = 60;
const T = {
  jumpPx: 9,
  jumpMps: 9,
  jerkMps: 2,
  reversalMinPx: 1.5,
  reversalDeg: 120,
  orbitDeg: 25,
  orbitRadiusPx: 70,
  clearancePx: 34,
  visiblePx: 30,
  nearScreenerPx: 70,
} as const;

type Kind = 'saut' | 'à-coup' | 'aller-retour' | 'orbite' | 'chevauchement' | 'chevauchement visible';

interface Event {
  tpl: string;
  kind: Kind;
  player: string;
  other?: string;
  tick: number;
  step: string;
  localT: number;
  boundary: boolean;
  context: string;
  value: number;
  unit: string;
  decision?: string;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angDeg = (ax: number, ay: number, bx: number, by: number) => {
  const na = Math.hypot(ax, ay);
  const nb = Math.hypot(bx, by);
  if (na < 1e-9 || nb < 1e-9) return 0;
  const c = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (na * nb)));
  return (Math.acos(c) * 180) / Math.PI;
};
const wrap = (d: number) => ((d % 360) + 540) % 360 - 180;

function positions(f: PlaybackFrame): Record<string, Point> {
  const out: Record<string, Point> = {};
  Object.entries(f.off).forEach(([k, p]) => { if (p) out[k] = p as Point; });
  Object.entries(f.defPos).forEach(([k, p]) => { if (p) out[k] = p as Point; });
  return out;
}

function screeners(f: PlaybackFrame): string[] {
  const s = new Set<string>();
  Object.entries(f.attackerIsScreening).forEach(([k, v]) => { if (v) s.add(k); });
  if (f.screen?.screener) s.add(f.screen.screener);
  f.offBallScreens.forEach((o) => {
    const anyO = o as unknown as { screener?: string; screeners?: string[] };
    if (anyO.screener) s.add(anyO.screener);
    anyO.screeners?.forEach((x) => s.add(x));
  });
  return [...s];
}

function contextOf(f: PlaybackFrame, pid: string, pos: Record<string, Point>): string {
  if (pid.startsWith('D')) {
    const d = f.debug?.defenders[pid as keyof NonNullable<PlaybackFrame['debug']>['defenders']];
    if (d?.screenMode) {
      return `contact ${d.contactKind ?? '?'} ${d.screenMode}/${d.screenState ?? '-'} route=${d.routeKind ?? '-'} poseur=${d.activeScreener ?? d.contactScreener ?? '-'}`;
    }
    if (f.screen?.carrierDef === pid || f.screen?.screenerDef === pid) return `écran porteur (${f.screen.carrierDef === pid ? 'déf. porteur' : 'déf. poseur'})`;
  }
  const scr = screeners(f);
  if (scr.includes(pid)) return 'poseur';
  const near = scr.filter((s) => s !== pid && pos[s] && dist(pos[s], pos[pid]) < T.nearScreenerPx);
  if (near.length) return `contourne ${near.join('+')}`;
  return 'hors écran';
}

function decisionDelta(a: PlaybackFrame, b: PlaybackFrame, pid: string): string | undefined {
  if (!pid.startsWith('D')) return undefined;
  type Dbg = NonNullable<PlaybackFrame['debug']>['defenders'];
  const da = a.debug?.defenders[pid as keyof Dbg];
  const db = b.debug?.defenders[pid as keyof Dbg];
  if (!da && !db) return undefined;
  const keys = ['screenMode', 'screenState', 'contactKey', 'routeKind', 'forcedPushSign', 'curveBranch', 'pushMode', 'activeScreener', 'matchedTo', 'locked'] as const;
  const diffs = keys
    .filter((k) => (da?.[k] ?? null) !== (db?.[k] ?? null))
    .map((k) => `${k}: ${String(da?.[k] ?? '∅')}→${String(db?.[k] ?? '∅')}`);
  return diffs.length ? diffs.join(', ') : undefined;
}

function auditTemplate(state: AppState, id: string): { events: Event[]; frames: number; minClear: number; seconds: number } {
  const lastT = state.steps.length - 1;
  const frames: PlaybackFrame[] = [];
  const times: number[] = [];
  for (let tick = 0; tick <= lastT * SUBSTEPS; tick++) {
    const t = tick / SUBSTEPS;
    frames.push(resolveTimelineFrame(state, t, { collectDecisions: true })!);
    times.push(fullStepToSeconds(state, t));
  }
  const events: Event[] = [];
  const pos = frames.map(positions);
  const ids = Object.keys(pos[0]);
  let minClear = Infinity;
  const push = (e: Omit<Event, 'tpl' | 'step' | 'localT' | 'boundary'>) => {
    const step = Math.floor(e.tick / SUBSTEPS);
    const local = (e.tick % SUBSTEPS) / SUBSTEPS;
    events.push({
      tpl: id, ...e,
      step: `${Math.min(step, lastT - 1)}→${Math.min(step, lastT - 1) + 1}`,
      localT: e.tick === lastT * SUBSTEPS ? 1 : local,
      boundary: local < 2 / SUBSTEPS || local > 1 - 2 / SUBSTEPS,
    });
  };

  // Chevauchements (par paire, un événement par épisode continu).
  const inOverlap = new Map<string, boolean>();
  for (let i = 0; i < frames.length; i++) {
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const pa = pos[i][ids[a]];
        const pb = pos[i][ids[b]];
        if (!pa || !pb) continue;
        const d = dist(pa, pb);
        minClear = Math.min(minClear, d);
        const key = `${ids[a]}|${ids[b]}`;
        if (d < T.clearancePx - 0.5) {
          if (!inOverlap.get(key)) {
            push({
              kind: d < T.visiblePx ? 'chevauchement visible' : 'chevauchement',
              player: ids[a], other: ids[b], tick: i,
              context: contextOf(frames[i], ids[a], pos[i]),
              value: d, unit: 'px',
            });
          } else {
            const last = [...events].reverse().find((e) => e.player === ids[a] && e.other === ids[b]);
            if (last && d < last.value) {
              last.value = d;
              if (d < T.visiblePx) last.kind = 'chevauchement visible';
            }
          }
          inOverlap.set(key, true);
        } else inOverlap.set(key, false);
      }
    }
  }

  // Cinématique par joueur.
  for (const pid of ids) {
    let prevV = 0;
    let prevVec: Point | null = null;
    let prevOrbit: number | null = null;
    let prevOrbitScreener: string | null = null;
    for (let i = 1; i < frames.length; i++) {
      const a = pos[i - 1][pid];
      const b = pos[i][pid];
      if (!a || !b) continue;
      const dt = times[i] - times[i - 1];
      const dpx = dist(a, b);
      const v = dt > 0 ? dpx / PX_PER_M / dt : 0;
      const ctx = () => contextOf(frames[i], pid, pos[i]);
      const dec = () => decisionDelta(frames[i - 1], frames[i], pid);
      if (dpx > T.jumpPx + 0.05 || v > T.jumpMps) {
        push({ kind: 'saut', player: pid, tick: i, context: ctx(), value: dpx, unit: `px (${v.toFixed(1)} m/s)`, decision: dec() });
      } else if (Math.abs(v - prevV) > T.jerkMps && i > 1) {
        push({ kind: 'à-coup', player: pid, tick: i, context: ctx(), value: v - prevV, unit: `m/s en ${(dt * 1000).toFixed(0)} ms`, decision: dec() });
      }
      const vec = { x: b.x - a.x, y: b.y - a.y };
      if (prevVec && dpx > T.reversalMinPx && Math.hypot(prevVec.x, prevVec.y) > T.reversalMinPx) {
        const ang = angDeg(prevVec.x, prevVec.y, vec.x, vec.y);
        if (ang > T.reversalDeg) {
          push({ kind: 'aller-retour', player: pid, tick: i, context: ctx(), value: ang, unit: '°', decision: dec() });
        }
      }
      prevVec = dpx > 0.2 ? vec : prevVec;
      prevV = v;

      // Orbite autour du poseur (défenseurs en contact).
      if (pid.startsWith('D')) {
        type Dbg = NonNullable<PlaybackFrame['debug']>['defenders'];
        const d = frames[i].debug?.defenders[pid as keyof Dbg];
        const s = d?.screenMode ? (d.activeScreener ?? d.contactScreener) : undefined;
        const sp = s ? pos[i][s] : undefined;
        if (s && sp && dist(sp, b) < T.orbitRadiusPx) {
          const ang = (Math.atan2(b.y - sp.y, b.x - sp.x) * 180) / Math.PI;
          if (prevOrbit !== null && prevOrbitScreener === s) {
            const dAng = Math.abs(wrap(ang - prevOrbit));
            if (dAng > T.orbitDeg) {
              push({ kind: 'orbite', player: pid, other: s, tick: i, context: ctx(), value: dAng, unit: '° autour du poseur', decision: dec() });
            }
          }
          prevOrbit = ang;
          prevOrbitScreener = s;
        } else {
          prevOrbit = null;
          prevOrbitScreener = null;
        }
      }
    }
  }
  return { events, frames: frames.length, minClear, seconds: times[times.length - 1] };
}

interface Boundary {
  tpl: string;
  player: string;
  step: number;
  /** Cible du resolver (sans mémoire) juste avant / à la frontière, px. */
  rupture: number;
  /** Position jouée (avec mémoire) vs position affichée à l'arrêt sur l'étape, px. */
  playVsStatic: number;
}

/** Continuité aux frontières d'étape : la cible du resolver (scrub sans
 *  mémoire) doit être continue en t = k, et la lecture doit arriver là où
 *  l'étape s'affiche à l'arrêt (sinon téléportation au passage lecture ↔
 *  navigation par étape). */
function auditBoundaries(state: AppState, id: string): Boundary[] {
  const out: Boundary[] = [];
  const last = state.steps.length - 1;
  for (let k = 1; k <= last; k++) {
    const before = resolveFrameAt(state, k - 1e-4)!;
    const at = resolveFrameAt(state, k)!;
    const played = resolveTimelineFrame(state, k)!;
    const staticDef = effectiveDefensePositions(state, k) as Record<string, Point>;
    const staticOff = state.steps[k].off as Record<string, Point>;
    const pb = positions(before);
    const pa = positions(at);
    const pp = positions(played);
    for (const pid of Object.keys(pa)) {
      const ref = pid.startsWith('D') ? staticDef[pid] : staticOff[pid];
      if (!pb[pid] || !ref || !pp[pid]) continue;
      out.push({ tpl: id, player: pid, step: k, rupture: dist(pb[pid], pa[pid]), playVsStatic: dist(pp[pid], ref) });
    }
  }
  return out;
}

/** Annotations d'écran dont le point de pose diffère de la position de
 *  l'étape suivante : le poseur est tenu sur `to` pendant toute la
 *  transition, puis doit rejoindre la position d'étape d'un coup. */
function auditScreenHolds(state: AppState, id: string): string[] {
  const out: string[] = [];
  state.steps.forEach((st, n) => {
    (st.annotations ?? []).forEach((a) => {
      if (a.type !== 'screen') return;
      const pid = (a as unknown as { playerId?: string }).playerId
        ?? Object.entries(st.off).find(([, p]) => p && dist(p as Point, a.from) < 2)?.[0];
      if (!pid) return;
      const next = state.steps[n + 1]?.off as Record<string, Point> | undefined;
      if (!next?.[pid]) return;
      const gap = dist(a.to, next[pid]);
      if (gap > 3) out.push(`${id.padEnd(26)} étape ${n}→${n + 1} ${pid} tenu sur la pose (${a.to.x.toFixed(0)},${a.to.y.toFixed(0)}) puis rejoint (${next[pid].x.toFixed(0)},${next[pid].y.toFixed(0)}) : ${gap.toFixed(0)} px`);
    });
  });
  return out;
}

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const jsonOut = opt('--json');
const forcedSeconds = opt('--seconds') ? Number(opt('--seconds')) : undefined;
const top = Number(opt('--top') ?? 30);
const skip = new Set(['--json', '--seconds', '--top'].flatMap((n) => { const i = args.indexOf(n); return i >= 0 ? [i, i + 1] : []; }));
const wanted = args.filter((_, i) => !skip.has(i));
const templates = wanted.length ? TEMPLATES.filter((t) => wanted.includes(t.id)) : TEMPLATES;

const all: Event[] = [];
const bounds: Boundary[] = [];
const holds: string[] = [];
const perTpl: { id: string; seconds: number; minClear: number; counts: Record<string, number> }[] = [];
for (const tpl of templates) {
  const loaded = loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, tpl);
  const state: AppState = forcedSeconds
    ? { ...loaded, secondsPerStep: forcedSeconds, steps: loaded.steps.map((st) => ({ ...st, duration: undefined })) }
    : loaded;
  if (state.steps.length < 2) continue;
  try {
    const r = auditTemplate(state, tpl.id);
    all.push(...r.events);
    bounds.push(...auditBoundaries(state, tpl.id));
    holds.push(...auditScreenHolds(state, tpl.id));
    const counts: Record<string, number> = {};
    r.events.forEach((e) => { counts[e.kind] = (counts[e.kind] ?? 0) + 1; });
    perTpl.push({ id: tpl.id, seconds: r.seconds, minClear: r.minClear, counts });
  } catch (e) {
    console.error(`! ${tpl.id} : ${(e as Error).message}`);
  }
}

const kinds: Kind[] = ['saut', 'à-coup', 'aller-retour', 'orbite', 'chevauchement', 'chevauchement visible'];
const ctxBucket = (c: string) =>
  c.startsWith('contact') ? `contact d'écran (${c.split(' ')[1]} ${c.split(' ')[2].split('/')[0]})`
    : c.startsWith('contourne') ? 'attaquant qui contourne un poseur'
      : c;

console.log(`Audit sauts & écrans — ${perTpl.length} systèmes, profil réaliste, ${SUBSTEPS} sous-pas / étape` +
  `${forcedSeconds ? `, étapes de ${forcedSeconds} s` : ', tempo du système'}\n`);
console.log('Événements par type (dont frontière d\'étape ±2 sous-pas) :');
for (const k of kinds) {
  const ev = all.filter((e) => e.kind === k);
  if (!ev.length) { console.log(`  ${k.padEnd(22)} 0`); continue; }
  const b = ev.filter((e) => e.boundary).length;
  const withDec = ev.filter((e) => e.decision).length;
  console.log(`  ${k.padEnd(22)} ${String(ev.length).padStart(5)}  (frontière ${b}, changement de décision ${withDec})`);
}

console.log('\nPar contexte :');
const byCtx = new Map<string, Record<string, number>>();
all.forEach((e) => {
  const c = ctxBucket(e.context);
  const r = byCtx.get(c) ?? {};
  r[e.kind] = (r[e.kind] ?? 0) + 1;
  byCtx.set(c, r);
});
[...byCtx.entries()].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))
  .forEach(([c, r]) => console.log(`  ${c.padEnd(40)} ${kinds.filter((k) => r[k]).map((k) => `${k} ${r[k]}`).join(' · ')}`));

console.log('\nChangements de décision associés aux sauts / à-coups / orbites :');
const decCount = new Map<string, number>();
all.filter((e) => e.decision && e.kind !== 'aller-retour').forEach((e) => {
  e.decision!.split(', ').forEach((d) => {
    const k = d.split(':')[0];
    decCount.set(k, (decCount.get(k) ?? 0) + 1);
  });
});
[...decCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)} × ${k}`));

console.log('\nSystèmes les plus touchés :');
const score = (c: Record<string, number>) =>
  (c['saut'] ?? 0) * 3 + (c['chevauchement visible'] ?? 0) * 5 + (c['chevauchement'] ?? 0) * 2 + (c['orbite'] ?? 0) * 2 + (c['à-coup'] ?? 0) + (c['aller-retour'] ?? 0) * 0.5;
perTpl.filter((p) => score(p.counts) > 0).sort((a, b) => score(b.counts) - score(a.counts)).slice(0, 15)
  .forEach((p) => console.log(`  ${p.id.padEnd(30)} ${p.seconds.toFixed(1)} s  clearance min ${p.minClear.toFixed(1)} px  ` +
    kinds.filter((k) => p.counts[k]).map((k) => `${k} ${p.counts[k]}`).join(' · ')));

const sev = (e: Event) =>
  e.kind === 'chevauchement visible' ? 100 + (T.visiblePx - e.value)
    : e.kind === 'saut' ? 80 + e.value
      : e.kind === 'chevauchement' ? 60 + (T.clearancePx - e.value)
        : e.kind === 'orbite' ? 40 + e.value / 10
          : e.kind === 'à-coup' ? 20 + Math.abs(e.value)
            : e.value / 20;
console.log(`\nPires cas (top ${top}) :`);
[...all].sort((a, b) => sev(b) - sev(a)).slice(0, top).forEach((e) =>
  console.log(`  ${e.tpl.padEnd(26)} ${e.step} t=${e.localT.toFixed(2)}${e.boundary ? '*' : ' '} ${e.player}${e.other ? `/${e.other}` : ''}  ` +
    `${e.kind} ${Math.abs(e.value).toFixed(1)} ${e.unit}  [${e.context}]${e.decision ? `  Δ ${e.decision}` : ''}`));
console.log('  (* = à ±2 sous-pas d\'une frontière d\'étape)');

const pctl = (xs: number[], q: number) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0; };
for (const side of ['O', 'D'] as const) {
  const b = bounds.filter((x) => x.player.startsWith(side));
  const label = side === 'O' ? 'Attaquants' : 'Défenseurs';
  console.log(`\n${label} — frontières d'étape (${b.length} joueur × frontière) :`);
  console.log(`  rupture de cible en t = k (scrub)      médiane ${pctl(b.map((x) => x.rupture), 0.5).toFixed(0)}  p90 ${pctl(b.map((x) => x.rupture), 0.9).toFixed(0)}  max ${Math.max(0, ...b.map((x) => x.rupture)).toFixed(0)} px  (> 18 px : ${b.filter((x) => x.rupture > 18).length})`);
  console.log(`  lecture vs arrêt sur l'étape           médiane ${pctl(b.map((x) => x.playVsStatic), 0.5).toFixed(0)}  p90 ${pctl(b.map((x) => x.playVsStatic), 0.9).toFixed(0)}  max ${Math.max(0, ...b.map((x) => x.playVsStatic)).toFixed(0)} px  (> 18 px : ${b.filter((x) => x.playVsStatic > 18).length})`);
}
console.log('\nPires ruptures de cible (scrub, t = k − ε → k) :');
[...bounds].sort((a, b) => b.rupture - a.rupture).slice(0, 10)
  .forEach((x) => console.log(`  ${x.tpl.padEnd(26)} étape ${x.step} ${x.player}  ${x.rupture.toFixed(0)} px`));
console.log('\nPires écarts lecture ↔ arrêt sur l\'étape :');
[...bounds].sort((a, b) => b.playVsStatic - a.playVsStatic).slice(0, 10)
  .forEach((x) => console.log(`  ${x.tpl.padEnd(26)} étape ${x.step} ${x.player}  ${x.playVsStatic.toFixed(0)} px`));
console.log(`\nPoseurs tenus sur leur point de pose alors que l'étape suivante les place ailleurs : ${holds.length}`);
holds.forEach((h) => console.log(`  ${h}`));

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ seuils: T, perTpl, events: all, boundaries: bounds, screenHolds: holds }, null, 2));
  console.log(`\nDétail JSON : ${jsonOut}`);
}
