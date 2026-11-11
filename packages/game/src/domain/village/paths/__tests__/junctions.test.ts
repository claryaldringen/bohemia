import { describe, expect, it } from 'vitest';
import {
  bendRoadEnd,
  drawLandmark,
  fitJunction,
  junctionArmDirs,
  junctionEntranceM,
  junctionEntrances,
  landmarkPlace,
  splitCrowdedNode,
} from '../junctions';
import { JUNCTION } from '../../rules/rules-roads';
import type { RoadPoint } from '../../types';

// Křižovatky – čisté funkce (paths.md – Křižovatky; plán cest v2, Úloha 9a): tvar a natočení,
// ohyb konce osy do vchodu, rozdělení uzlu s 5+ cestami a los znamení.

const deg = (d: number): number => (d * Math.PI) / 180;
/** Odchylka dvou směrů v [−π, π]. */
const diff = (a: number, b: number): number => {
  const d = (((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
};
const dist = (a: RoadPoint, b: RoadPoint): number => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
const onCm = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

describe('fitJunction – tvar a natočení', () => {
  it('tvar T je Y s nejmenším součtem čtverců odchylek', () => {
    // souměrné trojcestí (β = 60°, kmen v kolmé cestě) by dalo odchylky 30°, 0°, 30° (1 800 °²);
    // pootočené Y s β = 45° a kmenem proti cestě na západ dá 15°, 15°, 30° (1 350 °²)
    const dirs = [0, deg(90), deg(180)];
    const fit = fitJunction(dirs, [false, false, false]);
    expect(fit.shape).toBe('y');
    expect(fit.spread).toBeCloseTo(deg(45), 9);
    expect(fit.rotation).toBeCloseTo(deg(210), 9);
    expect(fit.assign[2]).toBe(0);
    const arms = junctionArmDirs(fit.shape, fit.rotation, fit.spread);
    const devs = dirs.map((d, i) => Math.abs(diff(d, arms[fit.assign[i]!]!)) / deg(1));
    expect(devs.map((d) => Math.round(d * 1e6) / 1e6)).toEqual([15, 15, 30]);
    expect(fit.cost).toBeCloseTo(1350 * deg(1) * deg(1), 9);
  });

  it('souměrné trojcestí má β = 60°', () => {
    const fit = fitJunction([deg(90), deg(210), deg(330)], [false, false, false]);
    expect(fit.spread).toBeCloseTo(deg(60), 9);
    expect(fit.cost).toBeCloseTo(0, 9);
  });

  it('čtyři cesty dají kříž natočený po 5°', () => {
    const dirs = [deg(12), deg(97), deg(188), deg(283)];
    const fit = fitJunction(dirs, [false, false, false, false]);
    expect(fit.shape).toBe('cross');
    expect(fit.spread).toBeUndefined();
    expect(Math.round(fit.rotation / deg(5)) * deg(5)).toBeCloseTo(fit.rotation, 9);
    expect([...fit.assign].sort()).toEqual([0, 1, 2, 3]);
    const arms = junctionArmDirs(fit.shape, fit.rotation);
    for (const [i, d] of dirs.entries()) {
      expect(Math.abs(diff(d, arms[fit.assign[i]!]!))).toBeLessThanOrEqual(deg(10));
    }
  });

  it('při shodě vyhraje menší úhel natočení', () => {
    // souměrné trojcestí pootočené o 7° – natočení 5° i 125° i 245° dají tutéž odchylku
    const fit = fitJunction([deg(7), deg(127), deg(247)], [false, false, false]);
    expect(fit.shape).toBe('y');
    expect(fit.spread).toBeCloseTo(deg(60), 9);
    expect(fit.rotation).toBeCloseTo(deg(5), 9);
    expect(fit.assign[0]).toBe(0);
  });

  it('pevné rameno (stezka) leží přesně ve svém směru', () => {
    const dirs = [deg(17.3), deg(100), deg(200)];
    const fit = fitJunction(dirs, [true, false, false]);
    const arms = junctionArmDirs(fit.shape, fit.rotation, fit.spread);
    expect(diff(arms[fit.assign[0]!]!, dirs[0]!)).toBeCloseTo(0, 9);
  });

  it('je deterministická – stejný vstup, stejný výsledek', () => {
    const dirs = [deg(3), deg(141), deg(222)];
    expect(fitJunction(dirs, [false, true, false])).toEqual(
      fitJunction(dirs, [false, true, false]),
    );
  });
});

describe('vchody', () => {
  it('vchod je 1,5 × šířka nejširší přicházející cesty', () => {
    expect(junctionEntranceM([1.9])).toBeCloseTo(2.85, 9);
    expect(junctionEntranceM([1.9, 3, 3.5])).toBeCloseTo(5.25, 9);
  });

  it('vchody leží na koncích ramen, na cm', () => {
    const entrances = junctionEntrances({ x: 10, z: -4 }, [0, deg(90)], 3);
    expect(entrances[0]).toEqual({ x: 13, z: -4 });
    expect(entrances[1]).toEqual({ x: 10, z: -1 });
  });
});

describe('bendRoadEnd – cesta vede přesně do vchodu', () => {
  const center = { x: 0, z: 0 };
  const armDir = deg(90);
  const [entrance] = junctionEntrances(center, [armDir], junctionEntranceM([1.9]));
  // cesta přichází šikmo zleva shora a končí kousek vedle středu
  const road: RoadPoint[] = [
    { x: -40, z: 30 },
    { x: -25, z: 20 },
    { x: -10, z: 8 },
    { x: -1, z: 1 },
  ];

  it('konec osy je přesně ve vchodu a tečna míří po rameni dovnitř', () => {
    const bent = bendRoadEnd(road, entrance!, armDir, JUNCTION.bendM);
    const last = bent[bent.length - 1]!;
    expect(last).toEqual(entrance);
    const prev = bent[bent.length - 2]!;
    const inward = Math.atan2(last.z - prev.z, last.x - prev.x);
    expect(Math.abs(diff(inward, armDir + Math.PI))).toBeLessThan(deg(15));
    for (const p of bent) expect(onCm(p.x) && onCm(p.z)).toBe(true);
  });

  it('dál než 12 m od konce se osa nemění, oblouk má body po ≈ 1 m', () => {
    const bent = bendRoadEnd(road, entrance!, armDir, JUNCTION.bendM);
    // poslední úsek osy má 11,4 m – oblouk začne 0,6 m před bodem (−10, 8)
    expect(bent.slice(0, 2)).toEqual(road.slice(0, 2));
    expect(bent[2]).not.toEqual(road[2]);
    const curve = bent.slice(2);
    for (let i = 1; i < curve.length; i++) {
      expect(dist(curve[i - 1]!, curve[i]!)).toBeLessThanOrEqual(1.1);
    }
  });

  it('konec u křižovatky může být i první bod osy', () => {
    const reversed = [...road].reverse();
    const bent = bendRoadEnd(reversed, entrance!, armDir, JUNCTION.bendM);
    expect(bent[0]).toEqual(entrance);
    expect(bent[bent.length - 1]).toEqual(road[0]);
    expect([...bent].reverse()).toEqual(bendRoadEnd(road, entrance!, armDir, JUNCTION.bendM));
  });

  it('cesta kratší než oblouk se ohne celá, začátek zůstane', () => {
    const short = [
      { x: -6, z: 4 },
      { x: -1, z: 0.5 },
    ];
    const bent = bendRoadEnd(short, entrance!, armDir, JUNCTION.bendM);
    expect(bent[0]).toEqual(short[0]);
    expect(bent[bent.length - 1]).toEqual(entrance);
  });
});

describe('splitCrowdedNode – sedm cest dají dvě křižovatky a spojku (Martin 3. 11. 2026: šest a víc)', () => {
  const center = { x: 10, z: 20 };
  const dirs = [deg(0), deg(50), deg(100), deg(150), deg(200), deg(250), deg(300)];

  it('dvě skupiny sousedních ramen 3 + 4, středy 10 m od sebe', () => {
    const split = splitCrowdedNode(center, dirs, JUNCTION.pairM)!;
    expect(split).not.toBeNull();
    const sizes = split.groups.map((g) => g.length).sort();
    expect(sizes).toEqual([3, 4]);
    expect([...split.groups[0], ...split.groups[1]].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(dist(split.centers[0], split.centers[1])).toBeCloseTo(JUNCTION.pairM, 1);
    for (const c of split.centers) expect(onCm(c.x) && onCm(c.z)).toBe(true);
  });

  it('každá křižovatka i se spojkou má 4–5 ramen a jde do tvaru', () => {
    const split = splitCrowdedNode(center, dirs, JUNCTION.pairM)!;
    const [a, b] = split.centers;
    const ab = Math.atan2(b.z - a.z, b.x - a.x);
    for (const [k, group] of split.groups.entries()) {
      const link = k === 0 ? ab : ab + Math.PI;
      const groupDirs = [...group.map((i) => dirs[i]!), link];
      expect(groupDirs.length === 4 || groupDirs.length === 5).toBe(true);
      const fit = fitJunction(
        groupDirs,
        groupDirs.map(() => false),
      );
      expect(fit.shape).toBe(groupDirs.length === 5 ? 'star' : 'cross');
    }
  });

  it('čtyři ani pět cest uzel nedělí, šest ano (3 + 3)', () => {
    expect(splitCrowdedNode(center, dirs.slice(0, 4), JUNCTION.pairM)).toBeNull();
    expect(splitCrowdedNode(center, dirs.slice(0, 5), JUNCTION.pairM)).toBeNull();
    const six = splitCrowdedNode(center, dirs.slice(0, 6), JUNCTION.pairM)!;
    expect(six.groups.map((g) => g.length)).toEqual([3, 3]);
  });

  it('hvězda: kříž a páté rameno 45° od ramene 0; pět cest dá hvězdu s nejmenšími odchylkami', () => {
    const arms = junctionArmDirs('star', deg(10));
    expect(arms.map((a) => Math.round(a / deg(1)))).toEqual([10, 100, 190, 280, 55]);
    // kříž po 90° a pátá cesta v mezeře 40° od jednoho ramene
    const fit = fitJunction([deg(0), deg(90), deg(180), deg(270), deg(40)]);
    expect(fit.shape).toBe('star');
    const dirs5 = junctionArmDirs(fit.shape, fit.rotation, fit.spread);
    expect(fit.assign.slice(0, 4).map((k) => Math.round(dirs5[k]! / deg(1)))).toEqual([
      0, 90, 180, 270,
    ]);
    expect(fit.assign[4]).toBe(4);
    // pevná cesta určí natočení přesně (mimo krok 5°)
    const fixed = fitJunction([deg(2), deg(92), deg(182), deg(272), deg(40)], [true]);
    expect(fixed.rotation).toBeCloseTo(deg(2), 9);
  });
});

describe('drawLandmark – znamení křižovatky', () => {
  it('týž seed a id dají totéž znamení', () => {
    expect(drawLandmark(1234, '17,3')).toEqual(drawLandmark(1234, '17,3'));
    expect(drawLandmark(99, '3,3')).toEqual(drawLandmark(99, '3,3'));
  });

  it('strom 40 %, kámen 30 %, kůl 30 %; podoba 1–2; strom má druh', () => {
    const count = { tree: 0, stone: 0, post: 0 };
    for (let id = 1; id <= 2000; id++) {
      const mark = drawLandmark(4242, String(id));
      count[mark.kind]++;
      expect(mark.look === 1 || mark.look === 2).toBe(true);
      expect(mark.turn).toBeGreaterThanOrEqual(0);
      expect(mark.turn).toBeLessThan(2 * Math.PI);
      if (mark.kind === 'tree') expect(['oak', 'elm', 'poplar']).toContain(mark.species);
      else expect(mark.species).toBeUndefined();
    }
    expect(count.tree / 2000).toBeCloseTo(0.4, 1);
    expect(count.stone / 2000).toBeCloseTo(0.3, 1);
    expect(count.post / 2000).toBeCloseTo(0.3, 1);
  });

  it('znamení stojí v nejširší mezeře mezi rameny, 1,5 m za vchody', () => {
    // tvar T: mezery 90°, 90° a 180° – nejširší je na jih (270°)
    const spot = landmarkPlace({ x: 5, z: 5 }, [0, deg(90), deg(180)], 3);
    expect(spot.x).toBeCloseTo(5, 2);
    expect(spot.z).toBeCloseTo(5 - 3 - JUNCTION.landmarkGapM, 2);
    expect(onCm(spot.x) && onCm(spot.z)).toBe(true);
  });
});
