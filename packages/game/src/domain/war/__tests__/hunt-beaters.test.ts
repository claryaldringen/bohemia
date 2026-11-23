import { describe, expect, it } from 'vitest';
import { HUNT, HUNT_FIGHT } from '../../village/rules/rules-wildlife';
import { beatersAt, beatersPlan, endBeaters, huntStartOf, type HuntBeaters } from '../hunt-beaters';
import { MARCH_FOREST, type MarchGrid, type Pos } from '../march-grid';
import { WAR } from '../rules-war';
import { TICKS_PER_SECOND } from '../ticks';

// Honci lovu (plán 2026-11-22-hunting – Úloha 6): dveře nejbližšího lesa a výběh zvířete, cesta
// honců ke dveřím a zpět do dvorce, odnos úlovku na tyči.

const W = 120;
const H = 40;

/** Louka W × H po 2,5 m se středem buňky (0, 0) v (0, 0); `dense(i, j)` – hustý les. */
function forestGrid(dense: (i: number, j: number) => boolean): MarchGrid {
  const pace = new Float32Array(W * H).fill(1);
  const flags = new Uint16Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!dense(i, j)) continue;
      pace[j * W + i] = 0;
      flags[j * W + i] = MARCH_FOREST;
    }
  }
  return { width: W, height: H, originX: 0, originZ: 0, cellM: 2.5, pace, flags };
}

/** Metry za takt honce (tempo pochodu pěšky). */
const STEP = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
const MEN = HUNT.beaters.men;
/** Dvorec a dveře lesa 350 m od něj – 400 taktů chůze. */
const FROM: Pos = { x: 0, z: 0 };
const DOOR: Pos = { x: 350, z: 0 };
const START = 100;
const ARRIVE = START + 400;

function dist(a: Pos, b: Pos): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Poloha honce `i` v taktu `tick` (musí být venku). */
function at(b: HuntBeaters, tick: number, i: number): { pos: Pos; carrying: boolean } {
  const p = beatersAt(b, tick, i);
  if (!p) throw new Error(`Honec ${i} v taktu ${tick} není venku`);
  return p;
}

/** Střed řady honců `ids` v taktu `tick`. */
function middle(b: HuntBeaters, tick: number, ids: readonly number[]): Pos {
  const ps = ids.map((i) => at(b, tick, i).pos);
  return {
    x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
    z: ps.reduce((s, p) => s + p.z, 0) / ps.length,
  };
}

/** Vzdálenost bodu `p` od přímky `a`–`b`. */
function offLine(p: Pos, a: Pos, b: Pos): number {
  const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  return Math.abs(cross) / dist(a, b);
}

describe('huntStartOf – dveře lesa a výběh zvířete (plán 2026-11-22-hunting, Úloha 6)', () => {
  it('dveře nejbližšího hustého lesa a výběh 40 m od nich ke dvorci', () => {
    // les od buňky i = 100 (x ≥ 250 m) – nejbližší průchodná buňka u něj je i = 99 v řadě dvorce
    const start = huntStartOf(
      forestGrid((i) => i >= 100),
      { x: 50, z: 50 },
      { quarry: 'stag', day: 7, dogs: 2 },
    )!;
    expect(start).toMatchObject({ quarry: 'stag', day: 7, dogs: 2, door: { x: 247.5, z: 50 } });
    expect(start.out.x).toBeCloseTo(247.5 - HUNT_FIGHT.emergeM, 9);
    expect(start.out.z).toBeCloseTo(50, 9);
  });

  it('ze šikmého směru: výběh 40 m po přímce ode dveří ke dvorci', () => {
    const manor: Pos = { x: 50, z: 10 };
    const start = huntStartOf(
      forestGrid((i, j) => i >= 100 && j >= 30),
      manor,
      { quarry: 'boar', day: 3, dogs: 0 },
    )!;
    expect(start.door).toEqual({ x: 247.5, z: 72.5 });
    expect(dist(start.out, start.door)).toBeCloseTo(HUNT_FIGHT.emergeM, 9);
    expect(offLine(start.out, start.door, manor)).toBeLessThan(1e-9);
    expect(dist(start.out, manor)).toBeLessThan(dist(start.door, manor));
  });

  it('mřížka bez lesa → null', () => {
    expect(
      huntStartOf(
        forestGrid(() => false),
        { x: 50, z: 50 },
        { quarry: 'stag', day: 1, dogs: 1 },
      ),
    ).toBeNull();
  });
});

describe('honci – cesta ke dveřím lesa a zpět (plán 2026-11-22-hunting, Úloha 6)', () => {
  it('ke dveřím dojdou za ⌈vzdálenost ÷ krok pochodu⌉ taktů; konec ani návrat zatím nejsou', () => {
    const b = beatersPlan(FROM, DOOR, START);
    expect(b).toEqual({
      from: FROM,
      door: DOOR,
      startTick: START,
      arriveTick: START + Math.ceil(350 / STEP),
      end: null,
      homeTick: null,
    });
    expect(b.arriveTick).toBe(ARRIVE);
    // stav nesdílí body volajícího
    expect(b.from).not.toBe(FROM);
    expect(b.door).not.toBe(DOOR);
  });

  it('v půli času v půli cesty, řada napříč cestou po 1,5 m; před vyhlášením nejsou venku', () => {
    const b = beatersPlan(FROM, DOOR, START);
    expect(beatersAt(b, START - 1, 0)).toBeNull();
    const half = (START + ARRIVE) / 2;
    const zs: number[] = [];
    for (let i = 0; i < MEN; i++) {
      const p = at(b, half, i);
      expect(p.carrying).toBe(false);
      expect(p.pos.x).toBeCloseTo(175, 9);
      zs.push(p.pos.z);
    }
    for (let i = 1; i < MEN; i++) expect(Math.abs(zs[i]! - zs[i - 1]!)).toBeCloseTo(1.5, 9);
    // honci 0 a 1 (nesou tyč) jdou po obou stranách osy cesty
    expect(zs[0]! + zs[1]!).toBeCloseTo(0, 9);
  });

  it('u dveří lesa stojí, dokud lov neskončí', () => {
    const b = beatersPlan(FROM, DOOR, START);
    for (const tick of [ARRIVE, ARRIVE + 1, ARRIVE + 5000]) {
      for (let i = 0; i < MEN; i++) {
        expect(at(b, tick, i).pos).toEqual(at(b, ARRIVE, i).pos);
      }
      expect(middle(b, tick, [0, 1]).x).toBeCloseTo(DOOR.x, 9);
      expect(middle(b, tick, [0, 1]).z).toBeCloseTo(DOOR.z, 9);
    }
  });

  it('konec s úlovkem: honci 0 a 1 dojdou ke zvířeti a nesou ho přes `at` domů pomaleji, ostatní rovnou domů', () => {
    const b = beatersPlan(FROM, DOOR, START);
    const END = 600;
    const AT: Pos = { x: 300, z: 40 };
    endBeaters(b, END, AT, true);
    const reach = END + Math.ceil(dist(DOOR, AT) / STEP);
    const carryHome = reach + Math.ceil(dist(AT, FROM) / (STEP * HUNT_FIGHT.carryPaceShare));
    const othersHome = END + Math.ceil(dist(DOOR, FROM) / STEP);
    expect(b.end).toEqual({ tick: END, at: AT, carry: true });
    expect(b.homeTick).toBe(carryHome);
    expect(carryHome).toBeGreaterThan(othersHome);
    // ke zvířeti jdou s prázdnou, u něj ho zvednou na tyč – zvíře visí mezi nimi
    expect(at(b, reach - 1, 0).carrying).toBe(false);
    expect(offLine(middle(b, reach - 1, [0, 1]), DOOR, AT)).toBeLessThan(1e-9);
    expect(middle(b, reach, [0, 1]).x).toBeCloseTo(AT.x, 9);
    expect(middle(b, reach, [0, 1]).z).toBeCloseTo(AT.z, 9);
    const mid = Math.round((reach + carryHome) / 2);
    for (const i of [0, 1]) {
      expect(at(b, reach, i).carrying).toBe(true);
      expect(at(b, mid, i).carrying).toBe(true);
    }
    expect(offLine(middle(b, mid, [0, 1]), AT, FROM)).toBeLessThan(1e-9);
    // tempo s úlovkem: v půli času nesení v půli cesty od zvířete domů
    expect(dist(middle(b, mid, [0, 1]), AT) / dist(AT, FROM)).toBeCloseTo(
      (mid - reach) / (carryHome - reach),
      9,
    );
    // ostatní jdou ode dveří rovnou domů po svých stopách a doma už venku nejsou
    for (let i = 2; i < MEN; i++) {
      const p = at(b, reach, i);
      expect(p.carrying).toBe(false);
      expect(p.pos.z).toBeCloseTo(at(b, ARRIVE, i).pos.z, 9);
      expect(p.pos.x).toBeCloseTo(
        DOOR.x - (DOOR.x - FROM.x) * ((reach - END) / (othersHome - END)),
        9,
      );
      expect(beatersAt(b, othersHome, i)).toBeNull();
    }
    expect(beatersAt(b, carryHome - 1, 0)).not.toBeNull();
    for (let i = 0; i < MEN; i++) expect(beatersAt(b, carryHome, i)).toBeNull();
    expect(beatersAt(b, carryHome + 100, 1)).toBeNull();
  });

  it('konec bez úlovku: všichni ode dveří domů; po homeTick nikdo venku; druhý konec nic nezmění', () => {
    const b = beatersPlan(FROM, DOOR, START);
    const END = 900;
    endBeaters(b, END, { x: 320, z: 10 }, false);
    const home = END + Math.ceil(dist(DOOR, FROM) / STEP);
    expect(b.homeTick).toBe(home);
    const half = Math.round((END + home) / 2);
    for (let i = 0; i < MEN; i++) {
      expect(at(b, half, i).carrying).toBe(false);
      expect(at(b, half, i).pos.z).toBeCloseTo(at(b, ARRIVE, i).pos.z, 9);
    }
    expect(middle(b, half, [0, 1]).x).toBeCloseTo(DOOR.x / 2, 9);
    for (let i = 0; i < MEN; i++) expect(beatersAt(b, home, i)).toBeNull();
    endBeaters(b, END + 50, { x: 0, z: 0 }, true);
    expect(b.end).toEqual({ tick: END, at: { x: 320, z: 10 }, carry: false });
    expect(b.homeTick).toBe(home);
  });

  it('stav honců je JSON – poloha z kopie přes JSON je táž', () => {
    const b = beatersPlan(FROM, DOOR, START);
    endBeaters(b, 700, { x: 310, z: -30 }, true);
    const copy = JSON.parse(JSON.stringify(b)) as HuntBeaters;
    for (const tick of [START, 300, ARRIVE, 650, 700, 760, 900, b.homeTick! - 1]) {
      for (let i = 0; i < MEN; i++) expect(beatersAt(copy, tick, i)).toEqual(beatersAt(b, tick, i));
    }
  });
});
