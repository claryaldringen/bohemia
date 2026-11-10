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
  withoutHiddenMounds,
  type FuneralEnv,
  type FuneralPlan,
} from '../funeral-plan';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { FLAMES_PER_PYRE, SPARKS_PER_PYRE, fireSprites } from '../pyre-fire';
import { PYRE_PLUME, plumePuffs, plumeReach, PLUME_REACH_M } from '../smoke-schedule';
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
    const grey = pyreState(t, v(0.9));
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

describe('kostrový pohřeb křesťana (christianity.md – Pohřby) – bez hranice', () => {
  const CHRISTIAN: SceneFuneral = { ...FUNERAL, size: 'small', rite: 'inhumation' };

  it('nic se nezapálí: po spuštění do hrobu chvíli u hrobu, hrob se zahrne hned', () => {
    const t = funeralTimeline(windowOf(DAY), 20, 'inhumation');
    expect(t.inhumation).toBe(true);
    expect(t.outMs - t.litMs).toBe(FUNERAL_TIMING.graveS * 1000);
    expect(t.coldMs).toBe(t.outMs);
    // bez doutnání – o herní den dřív než po žárovém pohřbu
    expect(t.coldMs).toBeLessThan(funeralTimeline(windowOf(DAY), 20).outMs);
    const none = { stack: 0, bier: 0, fire: 0, remains: 0, glow: 0, ash: 0, smoke: 0 };
    for (const at of [t.startMs, t.arriveMs + 1, t.litMs + 1, (t.litMs + t.outMs) / 2, t.outMs]) {
      expect(pyreState(t, at)).toEqual(none);
    }
    // žárový pohřeb na stejném místě hranici má
    expect(funeralTimeline(windowOf(DAY), 20).inhumation).toBeUndefined();
  });

  it('máry nesou rovnou k hrobu, položí je na zem a zemřelého spustí do hrobu', () => {
    const p = plan(CHRISTIAN);
    const t = p.timeline;
    expect(t.inhumation).toBe(true);
    const carried = bierPose(p, (t.departMs + t.arriveMs) / 2, createBierPose());
    expect(carried).toMatchObject({ visible: true, lift: BIER.carryM, onPyre: false });
    // pokládání: z ramen dolů, nikdy nahoru na hranici
    const laying = bierPose(p, (t.arriveMs + t.litMs) / 2, createBierPose());
    expect(laying.lift).toBeLessThan(BIER.carryM);
    expect(laying.lift).toBeGreaterThan(0);
    const down = bierPose(p, t.litMs + 1, createBierPose());
    expect(down).toMatchObject({ visible: true, onPyre: true, x: FUNERAL.x, z: FUNERAL.z });
    expect(down.lift).toBeLessThanOrEqual(0);
    const lowered = bierPose(p, t.litMs + (t.outMs - t.litMs) * 0.2, createBierPose());
    expect(lowered.lift).toBeLessThan(down.lift);
    expect(bierPose(p, (t.litMs + t.outMs) / 2, createBierPose()).visible).toBe(false);
  });

  it('lidé stojí kolem hrobu, pak jdou domů; hrob se ukáže, jak odcházejí', () => {
    const christian = plan(CHRISTIAN);
    const pagan = plan();
    const t = christian.timeline;
    expect(moundHidden(christian, t.litMs + 1)).toBe(true);
    expect(moundHidden(christian, t.outMs)).toBe(false);
    const m = christian.members[5]!;
    expect(m.leaveMs).toBeGreaterThan(t.outMs);
    expect(m.leaveMs).toBeLessThan(pagan.members[5]!.leaveMs);
    const pose = funeralPose(christian, 5, 'woman', 1.2);
    const praying = pose(villagerSeconds((t.litMs + t.outMs) / 2), [], createVillagerPose());
    expect(praying.clip).toBe('idle');
    expect(Math.hypot(praying.x - m.ring.x, praying.z - m.ring.z)).toBeLessThan(1e-6);
    expect(christian.figuresUntilMs).toBeLessThan(pagan.figuresUntilMs);
  });
});

describe('mohyla až po dohoření (withoutHiddenMounds)', () => {
  it('hřbitov ve scéně bez mohyly pohřbu, dokud hranice nevychladne', () => {
    const p = plan();
    const cemeteries = VILLAGE.cemeteries!;
    const hidden = (nowMs: number): Set<string> => new Set(moundHidden(p, nowMs) ? [p.key] : []);
    const burning = withoutHiddenMounds(cemeteries, hidden(p.timeline.litMs + 1000));
    expect(burning[0]).not.toHaveProperty('mounds');
    const cold = withoutHiddenMounds(cemeteries, hidden(p.timeline.coldMs));
    expect(cold).toBe(cemeteries);
    expect(cold[0]!.mounds).toHaveLength(1);
  });
});

describe('oheň hranice (pyre-fire.ts) a hustší dým', () => {
  const heading = { x: 0, z: 1 };
  const lit = (out: ReturnType<typeof fireSprites>): number =>
    out.filter((f) => f.intensity > 0).length;

  it('bez ohně nic nesvítí; hořící hranice má plameny, jiskry a záři', () => {
    const idle = fireSprites(5, 100, { fire: 0, stack: 1, glow: 0 }, heading);
    expect(idle).toHaveLength(FLAMES_PER_PYRE + SPARKS_PER_PYRE + 1);
    expect(lit(idle)).toBe(0);
    const burning = fireSprites(5, 100, { fire: 1, stack: 1, glow: 0 }, heading);
    expect(lit(burning)).toBeGreaterThan(FLAMES_PER_PYRE * 0.8);
    // plameny šlehají z hranice nahoru, jiskry výš
    const flames = burning.slice(0, FLAMES_PER_PYRE).filter((f) => f.intensity > 0);
    for (const f of flames) {
      expect(Math.abs(f.dz)).toBeLessThan(PYRE.lengthM);
      expect(f.dy).toBeGreaterThan(0);
    }
    const weak = fireSprites(5, 100, { fire: 0.3, stack: 0.5, glow: 0.5 }, heading);
    expect(lit(weak)).toBeLessThan(lit(burning));
    // uhlíky bez plamenů – jen záře
    const embers = fireSprites(5, 100, { fire: 0, stack: 0, glow: 1 }, heading);
    expect(lit(embers)).toBe(1);
  });

  it('stejný okamžik = stejné plameny', () => {
    const a = fireSprites(9, 1234.5, { fire: 0.8, stack: 0.9, glow: 0 }, heading);
    const b = fireSprites(9, 1234.5, { fire: 0.8, stack: 0.9, glow: 0 }, heading);
    expect(a).toEqual(b);
  });

  it('dým z hranice je hustší a vyšší než z dýmníku', () => {
    expect(PYRE_PLUME.puffs).toBeGreaterThan(18);
    expect(plumeReach(PYRE_PLUME).up).toBeGreaterThan(PLUME_REACH_M.up * 2);
    const puffs = plumePuffs(3, 500, () => 1, [], PYRE_PLUME);
    expect(puffs).toHaveLength(PYRE_PLUME.puffs);
    expect(Math.max(...puffs.map((p) => p.dy))).toBeGreaterThan(PLUME_REACH_M.up);
  });
});
