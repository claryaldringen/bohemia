import { cemeteryEntrance } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFuneral, SceneMourner } from '../../funeral-view';
import type { SceneVillage } from '../../village-view';
import {
  BIER,
  FUNERAL_TIMING,
  PYRE,
  bierPose,
  createBierPose,
  funeralActiveIn,
  funeralPhase,
  funeralPlan,
  funeralPose,
  funeralTimeline,
  moundHidden,
  processionPace,
  pyreState,
  type FuneralEnv,
  type FuneralPlan,
} from '../funeral-plan';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { createVillagerPose, villagerSeconds } from '../villager-motion';

// Pohřeb ve scéně (cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je pohřeb, chtěl bych
// vidět průvod lidí na hřbitov a pak na hřbitově hranici.“) – čisté funkce času.

const DAY_MS = 86_000;
const START = LIVESTOCK_EPOCH_MS + 1_000_000_000;
const DAY = 500;
const windowOf = (day: number): { startMs: number; endMs: number } => ({
  startMs: START + (day - DAY) * DAY_MS,
  endMs: START + (day - DAY + 1) * DAY_MS,
});

/** Ves: dva domy jižně od hřbitova (čtverec se středem 0, 60). */
const VILLAGE: SceneVillage = {
  dwellings: [
    { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    { id: 2, type: 'zemnice', position: { x: 25, z: 5, rotation: 0 }, built: true, progress: 1 },
  ],
  fields: [],
  cemeteries: [
    {
      id: 20,
      squares: [{ cell: { x: 0, y: 4 }, x: 0, z: 60, size: 15 }],
      built: true,
      progress: 1,
      graves: 0,
      mounds: [{ cell: { x: 0, y: 4 }, column: 3, row: 5, size: 'normal' }],
    },
  ],
};
const mourners = (n: number): SceneMourner[] =>
  Array.from({ length: n }, (_, i) => ({
    sex: i % 2 ? 'female' : 'male',
    age: 10 + i * 8,
    home: i < 3 ? 1 : 2,
  }));
const FUNERAL: SceneFuneral = {
  key: '20:0:4:3:5',
  cemeteryId: 20,
  cell: { x: 0, y: 4 },
  column: 3,
  row: 5,
  size: 'normal',
  rank: 'adult',
  day: DAY,
  x: 0.5,
  z: 63,
  from: 1,
  mourners: mourners(6),
};
/** Pěšiny: z každého bodu přes ohyb (x + 6) – trasa po pěšině není rovná čára. */
const ENV: FuneralEnv = {
  dayWindow: windowOf,
  door: (id) => {
    const d = VILLAGE.dwellings.find((w) => w.id === id);
    return d ? { x: d.position.x, z: d.position.z + 4 } : null;
  },
  route: (a, b) => [
    [a.x, a.z],
    [(a.x + b.x) / 2 + 6, (a.z + b.z) / 2],
    [b.x, b.z],
  ],
  standable: () => true,
  figureScale: 1.2,
};

function plan(funeral: SceneFuneral = FUNERAL, env: FuneralEnv = ENV): FuneralPlan {
  const p = funeralPlan(funeral, VILLAGE, env);
  if (!p) throw new Error('bez plánu');
  return p;
}

describe('časy obřadu (funeralTimeline)', () => {
  it('blízký hřbitov: průvod v první části dne, hoří do konce dne, další den doutná', () => {
    const t = funeralTimeline(windowOf(DAY), 10);
    expect(processionPace(10)).toBe(FUNERAL_TIMING.pace.slow);
    expect(t.departMs).toBe(START + FUNERAL_TIMING.gatherS * 1000);
    expect(t.arriveMs - t.departMs).toBeCloseTo((10 / 0.6) * 1000, 0);
    expect(t.litMs).toBeLessThan(windowOf(DAY).endMs);
    expect(t.outMs).toBe(windowOf(DAY).endMs);
    expect(t.coldMs).toBe(windowOf(DAY + 1).endMs);
  });

  it('vzdálený hřbitov: průvod rychleji (nejvýš běžnou chůzí), hranice hoří aspoň 45 s', () => {
    expect(processionPace(150)).toBeCloseTo(150 / FUNERAL_TIMING.walkMaxS, 6);
    expect(processionPace(400)).toBe(FUNERAL_TIMING.pace.fast);
    const t = funeralTimeline(windowOf(DAY), 300);
    expect(t.outMs - t.litMs).toBeGreaterThanOrEqual(FUNERAL_TIMING.minBurnS * 1000);
    expect(t.coldMs - t.outMs).toBe(DAY_MS);
  });

  it('fáze jdou za sebou', () => {
    const t = funeralTimeline(windowOf(DAY), 20);
    expect(funeralPhase(t, START - 1)).toBe('before');
    expect(funeralPhase(t, START + 1)).toBe('gathering');
    expect(funeralPhase(t, t.departMs + 1)).toBe('procession');
    expect(funeralPhase(t, t.arriveMs + 1)).toBe('laying');
    expect(funeralPhase(t, t.litMs + 1)).toBe('burning');
    expect(funeralPhase(t, t.outMs + 1)).toBe('smouldering');
    expect(funeralPhase(t, t.coldMs)).toBe('done');
  });
});

describe('hranice (pyreState)', () => {
  const t = funeralTimeline(windowOf(DAY), 20);
  const at = (u: number): number => t.litMs + (t.outMs - t.litMs) * u;

  it('připravená hranice, pak hoří, sesedá a máry shoří', () => {
    expect(pyreState(t, t.startMs)).toMatchObject({ stack: 1, fire: 0, bier: 0, remains: 0 });
    const early = pyreState(t, at(0.2));
    expect(early.fire).toBeGreaterThan(0.9);
    expect(early.bier).toBeGreaterThan(0);
    expect(early.smoke).toBeGreaterThan(0.9);
    const late = pyreState(t, at(0.9));
    expect(late.fire).toBeLessThan(early.fire);
    expect(late.stack).toBeLessThan(0.6);
    expect(late.bier).toBe(0);
    expect(late.remains).toBeGreaterThan(0.5);
  });

  it('druhý den uhlíky žhnou, pak zšednou a dým slábne; po vychladnutí nic', () => {
    const v = (u: number): number => t.outMs + (t.coldMs - t.outMs) * u;
    const hot = pyreState(t, v(0.05));
    const grey = pyreState(t, v(0.8));
    expect(hot).toMatchObject({ stack: 0, remains: 1 });
    expect(hot.glow).toBeGreaterThan(0.9);
    expect(grey.glow).toBe(0);
    expect(grey.ash).toBeGreaterThan(hot.ash);
    expect(grey.smoke).toBeLessThan(hot.smoke);
    expect(pyreState(t, t.coldMs)).toEqual({
      stack: 0,
      bier: 0,
      fire: 0,
      remains: 0,
      glow: 0,
      ash: 0,
      smoke: 0,
    });
  });
});

describe('průvod (funeralPlan)', () => {
  it('od vchodu domu zemřelého po pěšinách k brance a k místu hrobu', () => {
    const p = plan();
    const first = p.path.points[0]!;
    expect(first).toEqual([0, 4]);
    const last = p.path.points[p.path.points.length - 1]!;
    expect(last).toEqual([FUNERAL.x, FUNERAL.z]);
    // trasa jde přes ohyb pěšiny a brankou hřbitova
    expect(p.path.points.some(([x]) => x > 4)).toBe(true);
    const gate = cemeteryEntrance(VILLAGE.cemeteries![0]!, VILLAGE.dwellings)!;
    expect(p.path.points.some(([x, z]) => Math.hypot(x - gate.x, z - gate.z) < 1e-6)).toBe(true);
    expect(p.pyre).toMatchObject({ x: FUNERAL.x, z: FUNERAL.z });
  });

  it('mohyla uložená dřív (bez domácnosti) – průvod vyjde od domu nejblíž k brance', () => {
    const { from: _from, ...old } = FUNERAL;
    void _from;
    const p = plan({ ...old, key: 'old', mourners: [] });
    // dům 1 (0, 0) je k brance (jižní strana čtverce u z ≈ 52) blíž než dům 2 (25, 5)
    expect(p.path.points[0]).toEqual([0, 4]);
    expect(p.members).toHaveLength(4);
  });

  it('vpředu čtyři muži s márami, za nimi lidé po dvou; kruh kolem hranice', () => {
    const p = plan();
    expect(p.members).toHaveLength(4 + 6);
    expect(p.members.slice(0, 4).every((m) => m.bearer && m.sex === 'male')).toBe(true);
    expect(p.members.slice(4).map((m) => m.behind)).toEqual(
      [...p.members.slice(4).map((m) => m.behind)].sort((a, b) => a - b),
    );
    expect(p.members[4]!.child).toBe(true);
    expect(p.members[9]!.elder).toBe(true);
    for (const m of p.members) {
      const r = Math.hypot(m.ring.x - FUNERAL.x, m.ring.z - FUNERAL.z);
      expect(r).toBeGreaterThan(PYRE.lengthM);
    }
    const keys = new Set(p.members.map((m) => `${m.ring.x.toFixed(2)},${m.ring.z.toFixed(2)}`));
    expect(keys.size).toBe(p.members.length);
  });

  it('bez hodin světa se pohřeb nekreslí – mohyla je vidět hned', () => {
    expect(funeralPlan(FUNERAL, VILLAGE, { ...ENV, dayWindow: () => null })).toBeNull();
    expect(moundHidden(null, START)).toBe(false);
  });
});

describe('pohyb průvodu a már v čase', () => {
  it('stejný okamžik = stejná póza; průvod postupuje k hranici a nosiči nesou máry', () => {
    const p = plan();
    const t = p.timeline;
    const pose = funeralPose(p, 0, 'man', 1.2);
    const a = createVillagerPose();
    const b = createVillagerPose();
    const mid = (t.departMs + t.arriveMs) / 2;
    pose(villagerSeconds(mid), [], a);
    pose(villagerSeconds(mid), [], b);
    expect(a).toEqual(b);
    expect(a.clip).toBe('walk');
    const later = createVillagerPose();
    pose(villagerSeconds(t.arriveMs - 1000), [], later);
    const toPyre = (q: { x: number; z: number }): number =>
      Math.hypot(q.x - FUNERAL.x, q.z - FUNERAL.z);
    expect(toPyre(later)).toBeLessThan(toPyre(a));
    // máry mezi nosiči na ramenou
    const bier = bierPose(p, mid, createBierPose());
    expect(bier).toMatchObject({ visible: true, lift: BIER.carryM, onPyre: false });
    const bearers = [0, 1, 2, 3].map((i) =>
      funeralPose(p, i, 'man', 1.2)(villagerSeconds(mid), [], createVillagerPose()),
    );
    const cx = bearers.reduce((s, q) => s + q.x, 0) / 4;
    const cz = bearers.reduce((s, q) => s + q.z, 0) / 4;
    expect(Math.hypot(cx - bier.x, cz - bier.z)).toBeLessThan(0.05);
  });

  it('máry se položí na hranici a shoří; lidé stojí v kruhu, pak odejdou domů a zmizí', () => {
    const p = plan();
    const t = p.timeline;
    const onPyre = bierPose(p, t.litMs + 1000, createBierPose());
    expect(onPyre).toMatchObject({ visible: true, onPyre: true, x: FUNERAL.x, z: FUNERAL.z });
    expect(bierPose(p, t.outMs - 1, createBierPose()).visible).toBe(false);
    const m = p.members[5]!;
    const pose = funeralPose(p, 5, 'woman', 1.2);
    const burning = pose(villagerSeconds((t.litMs + t.outMs) / 2), [], createVillagerPose());
    expect(burning).toMatchObject({ clip: 'idle' });
    expect(Math.hypot(burning.x - m.ring.x, burning.z - m.ring.z)).toBeLessThan(1e-6);
    const leaving = pose(villagerSeconds(m.leaveMs + 3000), [], createVillagerPose());
    expect(leaving.clip).toBe('walk');
    expect(leaving.hidden).toBe(false);
    const home = pose(villagerSeconds(p.figuresUntilMs + 1), [], createVillagerPose());
    expect(home.hidden).toBe(true);
    // před začátkem dne pohřbu nikdo
    expect(pose(villagerSeconds(t.startMs - 1), [], createVillagerPose()).hidden).toBe(true);
  });

  it('mohyla až po dohoření; lidé pohřbu se počítají jen ve dnech obřadu', () => {
    const p = plan();
    expect(moundHidden(p, p.timeline.outMs + 1)).toBe(true);
    expect(moundHidden(p, p.timeline.coldMs)).toBe(false);
    expect(funeralActiveIn(p, windowOf(DAY))).toBe(true);
    expect(funeralActiveIn(p, windowOf(DAY - 1))).toBe(false);
    expect(funeralActiveIn(p, windowOf(DAY + 5))).toBe(false);
    expect(funeralActiveIn(p, null)).toBe(false);
  });
});
