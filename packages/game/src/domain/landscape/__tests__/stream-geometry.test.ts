import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import {
  nearestWaterPair,
  riverCenterline,
  riverCenterlines,
  streamCenterline,
  watersCenterline,
} from '../stream-geometry';
import {
  CURRENT_LAYER_VERSIONS,
  PREVIOUS_LAYER_VERSIONS,
  SURFACE_CODES,
  type StreamPoint,
} from '../types';
import { tileCenterWorld } from '../world';
import type { SkeletonRiverPort, SkeletonSlice } from '../skeleton/types';

const landscape = generateLandscape(3);
const stream = streamCenterline(landscape);

describe('streamCenterline – výšky stěn u potoka (terén 2)', () => {
  const rocky = generateLandscape(16);
  const centerline = streamCenterline(rocky);

  it('nese výšky stěn z dat krajiny a dotaz vrátí stěnu na své straně', () => {
    // Bod, kde je stěna jen na jedné straně (nejvyšší rozdíl stran).
    const lean = (i: number): number =>
      (rocky.stream[i]!.bankLeft ?? 0) - (rocky.stream[i]!.bankRight ?? 0);
    let k = 1;
    for (let i = 1; i < rocky.stream.length - 1; i++) {
      if (Math.abs(lean(i)) > Math.abs(lean(k))) k = i;
    }
    expect(Math.abs(lean(k))).toBeGreaterThan(3);
    const side = Math.sign(lean(k));
    const half = (rocky.size * rocky.cellSizeM) / 2;
    const p = rocky.stream[k]!;
    const a = rocky.stream[k - 1]!;
    const b = rocky.stream[k + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    // Levá normála toku × strana se stěnou.
    const nx = (-(b.y - a.y) / length) * side;
    const nz = ((b.x - a.x) / length) * side;
    const x = -half + (p.x + 0.5) * rocky.cellSizeM;
    const z = -half + (p.y + 0.5) * rocky.cellSizeM;
    const wall = side > 0 ? p.bankLeft! : p.bankRight!;
    const off = (side > 0 ? p.halfWidthLeft : p.halfWidthRight) * rocky.cellSizeM + 2;
    expect(centerline.nearest(x + nx * off, z + nz * off).bank).toBeCloseTo(wall, 0);
    expect(centerline.nearest(x - nx * off, z - nz * off).bank).toBeLessThan(wall - 2);
  });

  it('krajina terénu 1 stěny nemá', () => {
    const plain = streamCenterline(generateLandscape(16, PREVIOUS_LAYER_VERSIONS));
    expect(plain.points.every((p) => p.bankLeft === 0 && p.bankRight === 0)).toBe(true);
  });
});

describe('streamCenterline', () => {
  it('vede od okraje k okraji krajiny', () => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const nearEdge = (p: { x: number; z: number }): boolean =>
      Math.max(Math.abs(p.x), Math.abs(p.z)) > half - landscape.cellSizeM;
    expect(nearEdge(stream.points[0]!)).toBe(true);
    expect(nearEdge(stream.points.at(-1)!)).toBe(true);
  });

  it('hladina podél osy nikde nestoupá (teče od prvního bodu dolů)', () => {
    for (let i = 1; i < stream.points.length; i++) {
      expect(stream.points[i]!.level).toBeLessThanOrEqual(stream.points[i - 1]!.level + 1e-6);
    }
  });

  it('osa prochází blízko každého vodního políčka (do šířky břehu + 1 políčka)', () => {
    for (let i = 0; i < landscape.surface.length; i++) {
      if (landscape.surface[i] !== SURFACE_CODES.water) continue;
      const tx = i % 128;
      const ty = Math.floor(i / 128);
      const nearestPoint = landscape.stream.reduce((best, p) =>
        Math.hypot(p.x - tx, p.y - ty) < Math.hypot(best.x - tx, best.y - ty) ? p : best,
      );
      const reach = Math.max(nearestPoint.halfWidthLeft, nearestPoint.halfWidthRight) + 1;
      const { x: worldX, z: worldZ } = tileCenterWorld(landscape, tx, ty);
      expect(stream.nearest(worldX, worldZ).distance).toBeLessThanOrEqual(
        reach * landscape.cellSizeM,
      );
    }
  });

  it('daleko od potoka nic nenajde', () => {
    const far = stream.points[0]!;
    expect(stream.nearest(far.x + 900, far.z + 900, 40).distance).toBe(Infinity);
  });

  const cell = landscape.cellSizeM;
  const half = (landscape.size * cell) / 2;
  const world = (p: { x: number; y: number }): { x: number; z: number } => ({
    x: -half + (p.x + 0.5) * cell,
    z: -half + (p.y + 0.5) * cell,
  });
  /** Bod osy z dat krajiny, jednotkový směr toku a levá normála ve světě. */
  const frame = (
    k: number,
  ): { x: number; z: number; tx: number; tz: number; nx: number; nz: number } => {
    const a = world(landscape.stream[Math.max(0, k - 1)]!);
    const b = world(landscape.stream[Math.min(landscape.stream.length - 1, k + 1)]!);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / length;
    const tz = (b.z - a.z) / length;
    return { ...world(landscape.stream[k]!), tx, tz, nx: -tz, nz: tx };
  };
  const inner = landscape.stream.slice(20, -20).map((_, i) => i + 20);

  it('šířka vody na straně dotazu odpovídá levému a pravému břehu z dat krajiny', () => {
    for (const k of inner.filter((_, i) => i % 25 === 0)) {
      const p = landscape.stream[k]!;
      const f = frame(k);
      const left = stream.nearest(f.x + f.nx * 1.5, f.z + f.nz * 1.5);
      const right = stream.nearest(f.x - f.nx * 1.5, f.z - f.nz * 1.5);
      expect(left.halfWidth).toBeCloseTo(p.halfWidthLeft * cell, 0);
      expect(right.halfWidth).toBeCloseTo(p.halfWidthRight * cell, 0);
    }
  });

  it('vzdálenost od okraje vody: ve vodě záporná, na břehu kladná', () => {
    for (const k of inner.filter((_, i) => i % 25 === 0)) {
      const p = landscape.stream[k]!;
      const f = frame(k);
      expect(stream.nearest(f.x, f.z).bankDistance).toBeLessThan(0);
      const out = p.halfWidthLeft * cell + 5;
      const bank = stream.nearest(f.x + f.nx * out, f.z + f.nz * out).bankDistance;
      // V oblouku bývá sousední úsek osy o kus blíž – dolní mez o půl metru volnější.
      expect(bank).toBeGreaterThan(2.5);
      expect(bank).toBeLessThan(7);
    }
  });

  it('proud: v tůních pomalý, v mělčinách rychlý, směr toku míří po proudu', () => {
    const halfWidth = (k: number): number =>
      (landscape.stream[k]!.halfWidthLeft + landscape.stream[k]!.halfWidthRight) / 2;
    const pools = inner.filter((k) => halfWidth(k) >= 1.6);
    const shallows = inner.filter((k) => landscape.stream[k]!.shallow);
    expect(pools.length).toBeGreaterThan(0);
    expect(shallows.length).toBeGreaterThan(0);
    const speed = (k: number): number => stream.nearest(frame(k).x, frame(k).z).speed;
    const mean = (ks: number[]): number => ks.reduce((sum, k) => sum + speed(k), 0) / ks.length;
    expect(mean(pools)).toBeLessThan(0.3);
    expect(mean(shallows)).toBeGreaterThan(0.6);
    for (const k of inner.filter((_, i) => i % 10 === 0)) {
      const f = frame(k);
      const q = stream.nearest(f.x, f.z);
      expect(q.flowX * f.tx + q.flowZ * f.tz).toBeGreaterThan(0.9);
    }
  });

  it('vnitřní strana oblouku je kladná, vnější záporná', () => {
    // Nejostřejší oblouk: směr toku se nejvíc stočí na krátké vzdálenosti.
    let best = { k: -1, turn: 0 };
    for (const k of inner) {
      const a = frame(k - 6);
      const b = frame(k + 6);
      const turn = a.tx * b.tz - a.tz * b.tx; // kladné = stáčí se doleva
      if (Math.abs(turn) > Math.abs(best.turn)) best = { k, turn };
    }
    const f = frame(best.k);
    const side = Math.sign(best.turn); // levá strana je vnitřní, když se stáčí doleva
    const insideQuery = stream.nearest(f.x + f.nx * side * 2, f.z + f.nz * side * 2);
    const outsideQuery = stream.nearest(f.x - f.nx * side * 2, f.z - f.nz * side * 2);
    expect(insideQuery.innerBend).toBeGreaterThan(0.2);
    expect(outsideQuery.innerBend).toBeLessThan(-0.2);
  });
});

describe('osa vod – potok a řeka prémiové krajiny', () => {
  it('krajina bez řeky: řeka není, osa vod dává přesně odpovědi osy potoka', () => {
    expect(riverCenterline(landscape)).toBeNull();
    const waters = watersCenterline(landscape);
    expect(waters).toBe(watersCenterline(landscape));
    expect(waters.points).toEqual(stream.points);
    for (const [x, z] of [
      [0, 0],
      [120, -340],
      [-400, 200],
      [stream.points[40]!.x + 3, stream.points[40]!.z - 2],
    ] as const) {
      expect(waters.nearest(x, z)).toEqual(stream.nearest(x, z));
      expect(waters.nearestPair(x, z)).toEqual(stream.nearestPair(x, z));
    }
  });

  it('s řekou: nejbližší místo z obou toků, body osy potoka', () => {
    // Ruční „řeka“ – osa rovnoběžná s okrajem mapy daleko od potoka.
    const river: StreamPoint[] = Array.from({ length: 200 }, (_, k) => ({
      x: k * 0.5,
      y: 6,
      halfWidthLeft: 0.6,
      halfWidthRight: 0.6,
      level: 1,
      shallow: k > 90 && k < 100,
    }));
    const withRiver = { ...landscape, river };
    const waters = watersCenterline(withRiver);
    const r = riverCenterline(withRiver)!;
    expect(r.points.length).toBeGreaterThan(river.length);
    expect(waters.points).toEqual(streamCenterline(withRiver).points);
    const half = (landscape.size * landscape.cellSizeM) / 2;
    // Bod v brodu „řeky“ (osa x = 47 políček, y = 6).
    const ford = { x: -half + 47.5 * 15, z: -half + 6.5 * 15 };
    const here = waters.nearest(ford.x, ford.z);
    expect(here).toEqual(r.nearest(ford.x, ford.z));
    expect(here.bankDistance).toBeLessThan(0);
    expect(here.shallow).toBeGreaterThan(0.5);
    // Kdekoli vyhrává bližší z obou toků; druhé místo dvojice je to druhé nejbližší.
    for (const k of [10, 60, 120]) {
      const p = stream.points[k]!;
      for (const [x, z] of [
        [p.x, p.z],
        [p.x + 20, p.z - 15],
      ] as const) {
        const a = stream.nearestPair(x, z);
        const b = r.nearestPair(x, z);
        const [first, second] = waters.nearestPair(x, z);
        expect(first.bankDistance).toBe(Math.min(a[0].bankDistance, b[0].bankDistance));
        const rest =
          a[0].bankDistance <= b[0].bankDistance
            ? Math.min(a[1].bankDistance, b[0].bankDistance)
            : Math.min(b[1].bankDistance, a[0].bankDistance);
        expect(second.bankDistance).toBe(rest);
      }
    }
  });
});

describe('osa řeky – souvislý tok bez tůní', () => {
  const withRiver = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'navigable-river');
  const river = riverCenterline(withRiver)!;

  it('řeka 25–45 m nemá tůně a teče – není stojatá voda (potok tůně má dál)', () => {
    expect(river).not.toBeNull();
    // široká řeka by s prahy potoka (tůň od poloviční šířky 18 m) vyšla jako tůň
    expect(Math.max(...river.points.map((p) => (p.halfLeft + p.halfRight) / 2))).toBeGreaterThan(
      18,
    );
    expect(river.points.every((p) => p.pool === 0)).toBe(true);
    // teče aspoň jako středně rychlý potok – v zimě zamrzne jen u břehů
    expect(Math.min(...river.points.map((p) => p.speed))).toBeGreaterThanOrEqual(0.5);
    expect(streamCenterline(withRiver).points.some((p) => p.pool > 0.5)).toBe(true);
  });

  it('osa řeky je z mezipaměti podle objektu krajiny', () => {
    expect(riverCenterline(withRiver)).toBe(river);
    expect(riverCenterline(landscape)).toBe(riverCenterline(landscape));
  });

  it('nejbližší místo vody ze dvou toků je jako osa vod a ví, že leží na řece', () => {
    const stream42 = streamCenterline(withRiver);
    const waters = watersCenterline(withRiver);
    const onRiver = river.points[Math.floor(river.points.length / 2)]!;
    const onStream = stream42.points[Math.floor(stream42.points.length / 2)]!;
    for (const [x, z, second] of [
      [onRiver.x, onRiver.z, true],
      [onRiver.x + 25, onRiver.z - 10, true],
      [onStream.x, onStream.z, false],
    ] as const) {
      const pair = nearestWaterPair(stream42, river, x, z);
      expect([pair.near, pair.other]).toEqual(waters.nearestPair(x, z));
      expect(pair.second).toBe(second);
    }
    // bez řeky přesně potok
    const alone = nearestWaterPair(stream, null, onStream.x, onStream.z);
    expect([alone.near, alone.other]).toEqual(stream.nearestPair(onStream.x, onStream.z));
    expect(alone.second).toBe(false);
  });
});

describe('osa vod – víc řek kostry na jedné mapě (soutok, pramen)', () => {
  const SKELETON_VERSIONS = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 } as const;
  const port = (
    side: SkeletonRiverPort['side'],
    at: number,
    widthM: number,
    flow: 'in' | 'out',
  ): SkeletonRiverPort => ({ side, at, widthM, flow });
  const slice = (...rivers: SkeletonRiverPort[]): SkeletonSlice => ({
    world: 1,
    rivers,
    trails: [],
  });
  // Výřezy jako v testu pásma map s řekou (`skeleton/__tests__/skeleton-band.ts`).
  const confluence = generateLandscape(
    1,
    SKELETON_VERSIONS,
    undefined,
    slice(port('N', 50, 40, 'in'), port('E', 64, 25, 'in'), port('S', 80, 45, 'out')),
  );
  const rivers = riverCenterlines(confluence);
  const courses = confluence.rivers!;
  const half = (confluence.size * confluence.cellSizeM) / 2;
  const world = (p: StreamPoint): { x: number; z: number } => ({
    x: -half + (p.x + 0.5) * confluence.cellSizeM,
    z: -half + (p.y + 0.5) * confluence.cellSizeM,
  });

  it('každá řeka má svou osu – k okraji se prodlouží jen konce na okraji, přítok končí v soutoku', () => {
    expect(courses).toHaveLength(2);
    expect(rivers).toHaveLength(2);
    expect(riverCenterlines(confluence)).toBe(rivers);
    // hlavní tok od okraje k okraji – o bod víc na obou koncích
    expect(rivers[0]!.points).toHaveLength(courses[0]!.length + 2);
    // přítok: vtok z okraje prodloužen, ústí v ose hlavního toku ne (nevyčnívá za protější břeh)
    expect(rivers[1]!.points).toHaveLength(courses[1]!.length + 1);
    const mouth = world(courses[1]!.at(-1)!);
    expect(rivers[1]!.points.at(-1)!.x).toBeCloseTo(mouth.x, 6);
    expect(rivers[1]!.points.at(-1)!.z).toBeCloseTo(mouth.z, 6);
    // řeka kostry je řeka – bez tůní a teče
    for (const r of rivers) {
      expect(r.points.every((p) => p.pool === 0)).toBe(true);
      expect(Math.min(...r.points.map((p) => p.speed))).toBeGreaterThanOrEqual(0.5);
    }
    // osa řek dohromady: body hlavního toku, dotazy přes obě řeky
    const all = riverCenterline(confluence)!;
    expect(all.points).toBe(rivers[0]!.points);
    const onTributary = world(courses[1]![Math.floor(courses[1]!.length / 2)]!);
    expect(all.nearest(onTributary.x, onTributary.z)).toEqual(
      rivers[1]!.nearest(onTributary.x, onTributary.z),
    );
  });

  it('osa vod vrací nejbližší místo ze všech toků – potoka i obou řek', () => {
    const lines = [streamCenterline(confluence), ...rivers];
    const waters = watersCenterline(confluence);
    const nearestOfAll = (x: number, z: number): ReturnType<typeof waters.nearest> =>
      lines
        .map((c) => c.nearest(x, z))
        .reduce((best, s) => (s.bankDistance < best.bankDistance ? s : best));
    courses.forEach((course, k) => {
      for (const t of [0.1, 0.5, 0.9]) {
        const p = world(course[Math.floor(t * (course.length - 1))]!);
        for (const [x, z] of [
          [p.x, p.z],
          [p.x + 20, p.z - 15],
        ] as const) {
          expect(waters.nearest(x, z)).toEqual(nearestOfAll(x, z));
        }
        // na ose řeky je voda té řeky
        expect(waters.nearest(p.x, p.z)).toEqual(rivers[k]!.nearest(p.x, p.z));
        expect(waters.nearest(p.x, p.z).bankDistance).toBeLessThan(0);
      }
    });
  });

  it('v soutoku dá dvojice místo z obou řek a ví, že leží na řece', () => {
    const waters = watersCenterline(confluence);
    const brook = streamCenterline(confluence);
    // na ose přítoku ≈ 30 m nad ústím
    const tributary = courses[1]!;
    const p = world(tributary[tributary.length - 5]!);
    const [near, other] = waters.nearestPair(p.x, p.z);
    expect(near).toEqual(rivers[1]!.nearest(p.x, p.z));
    expect(other).toEqual(rivers[0]!.nearest(p.x, p.z));
    const pair = nearestWaterPair(brook, riverCenterline(confluence), p.x, p.z);
    expect([pair.near, pair.other]).toEqual([near, other]);
    expect(pair.second).toBe(true);
  });

  it('řeka z pramene uvnitř mapy se k okraji prodlouží jen na výtoku', () => {
    const source = generateLandscape(
      1,
      SKELETON_VERSIONS,
      undefined,
      slice(port('S', 64, 25, 'out')),
    );
    const [river] = riverCenterlines(source);
    const course = source.rivers![0]!;
    expect(river!.points).toHaveLength(course.length + 1);
    const h = (source.size * source.cellSizeM) / 2;
    expect(river!.points[0]!.x).toBeCloseTo(-h + (course[0]!.x + 0.5) * source.cellSizeM, 6);
    expect(river!.points[0]!.z).toBeCloseTo(-h + (course[0]!.y + 0.5) * source.cellSizeM, 6);
  });

  it('prémiová řeka (`river`) jde osou vod jako dřív – jediná řeka, obě konce prodloužené', () => {
    const premium = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'navigable-river');
    const [only, ...rest] = riverCenterlines(premium);
    expect(rest).toHaveLength(0);
    expect(riverCenterline(premium)).toBe(only);
    expect(only!.points).toHaveLength(premium.river!.length + 2);
  });
});
