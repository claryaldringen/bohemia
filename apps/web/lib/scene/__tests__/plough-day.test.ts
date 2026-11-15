import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneLaborShare, SceneVillage } from '../../village-view';
import { dayStints, splitStints, startOfDayVillage } from '../plough-day';
import { PLOUGH_ROW_M } from '../plough-front';
import {
  PLOUGH_CORNER_M,
  TURN_RADIUS_M,
  ardReach,
  createTeamPose,
  crossField,
  furrowRows,
  outsideSquare,
  ploughRoute,
  routeDistance,
  routeFurrows,
  routePose,
  rowExtent,
  stintRowCount,
  type FurrowBand,
  type PloughField,
  type RouteTrack,
} from '../plough-team';

// Celá dnešní orba za herní den (oxen.md – ladicí; Martin, 19. 10. 2026): spřežení projede
// všechny dnešní díly a pruhy, za rádlem zůstává brázda, na konci dne sedí s polem dalšího dne.

const CELL = 15;
const part = (id: number, cx: number, extra: Partial<SceneFieldPart> = {}): SceneFieldPart => ({
  id,
  cell: { x: cx, y: 0 },
  x: cx * CELL + CELL / 2,
  z: CELL / 2,
  size: CELL,
  stage: 'sown',
  look: 'plowed',
  ...extra,
});

/** Pole o čtyřech dílech v řadě podél x, dům u z = −20 (práce jde do +z). */
function village(parts: SceneFieldPart[], share: Partial<SceneLaborShare>): SceneVillage {
  return {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: 0, z: -20, rotation: 0 }, built: true, progress: 1 },
    ],
    // ves letos orá rádlem – celé pole má kulaté rohy (oxen.md – Jen rádlo)
    fields: [{ id: 5, parts, ard: true }],
    labor: {
      day: 250,
      month: 9,
      people: { children: 0, adults: 4, elders: 0 },
      shares: [{ activity: 'plough', target: { kind: 'field', id: 5 }, manDays: 2, ...share }],
    },
  };
}

/** Dnes: díl 51 dokončený z 1/4, 52 celý, 53 do 5/8 (čelo); 54 nezačatý. */
const today = (): SceneVillage =>
  village(
    [
      part(51, 0, { before: 'stubble' }),
      part(52, 1, { before: 'stubble' }),
      part(53, 2, { work: 0.6, before: 'stubble' }),
      part(54, 3, { look: 'stubble' }),
    ],
    {
      parts: [51, 52, 53],
      progress: [
        [0.25, 1],
        [0, 1],
        [0, 0.6],
      ],
    },
  );

const area = (b: FurrowBand): number => (b.to - b.from) * 2 * b.half;

describe('pruhy dnešní orby', () => {
  it('po dílech v pořadí práce, ráno a večer po pruzích obtisku', () => {
    const all = dayStints(today());
    // orba křížem: každý pruh napřed podél řad, hned po něm napříč (oxen.md – Orba rádlem křížem)
    expect(all.map((s) => [s.partId, s.cross ?? false])).toEqual([
      [51, false],
      [51, true],
      [52, false],
      [52, true],
      [53, false],
      [53, true],
    ]);
    const stints = all.filter((s) => !s.cross);
    expect(stints.map((s) => [s.partId, s.from, s.to])).toEqual([
      [51, 0.25, 1],
      [52, 0, 1],
      [53, 0, 0.625],
    ]);
    // pruh dílu napříč řadami (od strany u vsi) a kulaté vnější rohy pole
    const [first] = stints;
    expect(first!.field).toMatchObject({ from: 0.25 * CELL - CELL / 2, to: CELL / 2 });
    expect(first!.field.corners).toHaveLength(2);
    // bez postupu od jádra: od začátku dílu k čáře orby
    const old = dayStints({
      ...today(),
      labor: {
        ...today().labor!,
        shares: [{ activity: 'plough', target: { kind: 'field', id: 5 }, manDays: 2, parts: [53] }],
      },
    });
    expect(old.map((s) => [s.partId, s.from, s.to, s.cross ?? false])).toEqual([
      [53, 0, 0.625, false],
      [53, 0, 0.625, true],
    ]);
  });

  it('pole na začátku dne: ráno zoraná část, zbytek před orbou', () => {
    const v = startOfDayVillage(today(), dayStints(today()));
    const parts = v.fields[0]!.parts;
    expect(parts[0]).toMatchObject({ look: 'plowed', work: 0.25, before: 'stubble' });
    expect(parts[1]).toMatchObject({ look: 'stubble' });
    expect(parts[1]!.work).toBeUndefined();
    expect(parts[2]).toMatchObject({ look: 'stubble' });
    expect(parts[3]).toEqual(today().fields[0]!.parts[3]);
  });

  it('víc spřežení si dnešní díly rozdělí po souvislých kusech', () => {
    const stints = dayStints(today());
    expect(splitStints(stints, 1)).toEqual([stints]);
    const two = splitStints(stints, 2);
    expect(two).toHaveLength(2);
    expect(two.flat()).toEqual(stints);
    expect(splitStints(stints, 5).length).toBeLessThanOrEqual(3);
    expect(splitStints([], 2)).toEqual([]);
    // druhý průchod křížem zůstane spřežení, které pruh zoralo napoprvé
    for (const team of [...two, ...splitStints(stints, 5)]) {
      expect(team[0]!.cross).toBeUndefined();
      team.forEach((s, i) => {
        if (s.cross) expect(team[i - 1]!.partId).toBe(s.partId);
      });
    }
  });
});

describe('trasa dne a brázda za rádlem', () => {
  const stints = dayStints(today());
  const track: RouteTrack = { route: ploughRoute(stints), startMs: 1000, endMs: 87_000 };

  it('na začátku nic, na konci brázda pokryje celé dnešní pruhy (jako pole dalšího dne)', () => {
    expect(routeFurrows(track, 0)).toEqual([]);
    expect(routeFurrows(track, 1000)).toEqual([]);
    const end = routeFurrows(track, 90_000);
    for (const stint of stints.filter((s) => !s.cross)) {
      const bands = end.filter((b) => b.partId === stint.partId && !b.cross);
      const width = (stint.to - stint.from) * CELL;
      // pásy řad vedle sebe pokryjí pruh napříč
      const across = bands.reduce((sum, b) => sum + 2 * b.half, 0);
      expect(across).toBeCloseTo(width, 6);
      // a podél řad celý díl (u kulatého rohu po oblouk)
      for (const b of bands) {
        const extent = rowExtent(b.v, CELL / 2, [0, 0, 0, 0]);
        expect(b.from).toBeGreaterThanOrEqual(extent.lo - 1e-9);
        expect(b.to).toBeLessThanOrEqual(extent.hi + 1e-9);
        expect(b.to - b.from).toBeGreaterThan(CELL - 2 * PLOUGH_CORNER_M - 1e-6);
      }
    }
  });

  it('brázda jen přibývá a končí tam, kam radlice dojela', () => {
    let last = 0;
    const pose = createTeamPose();
    for (let t = 1000; t <= 87_000; t += 500) {
      const total = routeFurrows(track, t).reduce((sum, b) => sum + area(b), 0);
      expect(total).toBeGreaterThanOrEqual(last - 1e-6);
      last = total;
      routePose(track, t, pose);
      if (pose.lift === 0) {
        // radlice v zemi: leží na konci nějakého pásu brázdy (± kousek)
        const near = routeFurrows(track, t).some((b) => {
          const ux = (pose.ard.x - b.x) * b.along[0] + (pose.ard.z - b.z) * b.along[1];
          const vx = (pose.ard.x - b.x) * b.across[0] + (pose.ard.z - b.z) * b.across[1];
          return Math.abs(vx - b.v) <= b.half + 0.3 && ux >= b.from - 0.6 && ux <= b.to + 0.6;
        });
        expect(near).toBe(true);
      }
    }
    expect(last).toBeGreaterThan(0);
  });

  it('spřežení projede trasu za herní den – zrychleně, spojitě, rádlo v zemi jen na díle', () => {
    expect(routeDistance(track, 87_000)).toBeCloseTo(track.route.length, 6);
    const speed = track.route.length / 86;
    const pose = createTeamPose();
    let prev: { x: number; z: number } | null = null;
    for (let t = 1000; t <= 87_000; t += 100) {
      routePose(track, t, pose);
      if (prev) {
        expect(Math.hypot(pose.yoke.x - prev.x, pose.yoke.z - prev.z)).toBeLessThanOrEqual(
          speed * 0.1 * 1.01 + 1e-6,
        );
      }
      prev = { x: pose.yoke.x, z: pose.yoke.z };
      if (pose.lift === 0) {
        // radlice v zemi jen uvnitř některého dnešního dílu (kulaté rohy); hrot radlice je
        // pár cm za bodem, podle kterého se rádlo zvedá – na začátku řady může kus přesáhnout
        const inside = stints.some((s) => {
          const du = pose.ard.x - s.field.x;
          const dv = pose.ard.z - s.field.z;
          return outsideSquare(du, dv, CELL / 2, [0, 0, 0, 0]) <= 0.05;
        });
        expect(inside).toBe(true);
      }
    }
  });

  it('od místa, kde spřežení stálo, dojde k první řadě se zvednutým rádlem', () => {
    const from = { x: 200, z: 60 };
    const route = ploughRoute(stints, from);
    expect(route.segmentStint[0]).toBe(-1);
    const moving: RouteTrack = { route, startMs: 0, endMs: 86_000 };
    const pose = routePose(moving, 0, createTeamPose());
    expect(pose.yoke.x).toBeCloseTo(from.x, 6);
    expect(pose.yoke.z).toBeCloseTo(from.z, 6);
    // kousek po přesunu je rádlo nahoře
    expect(routePose(moving, 1000, createTeamPose()).lift).toBe(1);
  });

  it('kulatý roh: krajní řada končí na oblouku, radlice tam ze země', () => {
    const radii = [PLOUGH_CORNER_M, 0, 0, 0] as const;
    // řada u okraje v rohu (−, −) je kratší o kus oblouku, řada uprostřed celá
    const edge = rowExtent(-CELL / 2 + 0.5, CELL / 2, radii);
    expect(edge.lo).toBeGreaterThan(-CELL / 2 + 1);
    expect(edge.hi).toBe(CELL / 2);
    expect(rowExtent(0, CELL / 2, radii)).toEqual({ lo: -CELL / 2, hi: CELL / 2 });
    // bod v rohu za obloukem je venku, bod na oblouku na hraně
    expect(outsideSquare(-7, -7, CELL / 2, radii)).toBeGreaterThan(0);
    const r = PLOUGH_CORNER_M;
    const c = -CELL / 2 + r;
    expect(outsideSquare(c - r / Math.SQRT2, c - r / Math.SQRT2, CELL / 2, radii)).toBeCloseTo(
      0,
      6,
    );
    // obrat spřežení na souvrati (TURN_RADIUS_M) a dosah rádla – roh ≈ 5 m
    expect(PLOUGH_CORNER_M).toBeGreaterThanOrEqual(TURN_RADIUS_M + ardReach() - 0.5);
  });
});

describe('orba rádlem křížem (oxen.md – Martin 14. 11. 2026)', () => {
  const stints = dayStints(today());
  const track: RouteTrack = { route: ploughRoute(stints), startMs: 0, endMs: 86_000 };
  const dot = (a: readonly [number, number], b: readonly [number, number]): number =>
    a[0] * b[0] + a[1] * b[1];

  it('brázdy dílu po orbě tvoří dvě kolmé sady – každá pokryje celý dnešní pruh', () => {
    const end = routeFurrows(track, 86_000);
    for (const stint of stints.filter((s) => !s.cross)) {
      const own = end.filter((b) => b.partId === stint.partId);
      const first = own.filter((b) => !b.cross);
      const second = own.filter((b) => b.cross);
      expect(first.length).toBeGreaterThan(1);
      expect(second.length).toBeGreaterThan(1);
      // v každé sadě souběžné brázdy, sady navzájem kolmé – i textura brázd (mřížka)
      for (const b of first) expect(Math.abs(dot(b.along, first[0]!.along))).toBeCloseTo(1, 9);
      for (const b of second) {
        expect(Math.abs(dot(b.along, second[0]!.along))).toBeCloseTo(1, 9);
        expect(dot(b.along, first[0]!.along)).toBeCloseTo(0, 9);
        expect(dot(furrowRows(b), furrowRows(first[0]!))).toBeCloseTo(0, 9);
      }
      // druhý průchod: řady vedle sebe přes celý díl podél řad prvního, každá jen přes pruh
      const width = (stint.to - stint.from) * CELL;
      expect(second.reduce((sum, b) => sum + 2 * b.half, 0)).toBeCloseTo(CELL, 6);
      for (const b of second) {
        expect(b.to - b.from).toBeLessThanOrEqual(width + 1e-6);
        // středy brázd druhého průchodu leží v pruhu prvního
        const mid = (b.from + b.to) / 2;
        const x = b.x + b.along[0] * mid + b.across[0] * b.v;
        const z = b.z + b.along[1] * mid + b.across[1] * b.v;
        const v =
          (x - stint.field.x) * first[0]!.across[0] + (z - stint.field.z) * first[0]!.across[1];
        expect(v).toBeGreaterThanOrEqual(stint.field.from! - 1e-6);
        expect(v).toBeLessThanOrEqual(stint.field.to! + 1e-6);
      }
      // plocha obou sad stejná (kulaté rohy ubírají oběma)
      const sum = (bands: FurrowBand[]): number => bands.reduce((s, b) => s + area(b), 0);
      expect(sum(second)).toBeGreaterThan(sum(first) * 0.9);
      expect(sum(second)).toBeLessThan(sum(first) * 1.1);
    }
  });

  it('napřed celý první průchod pruhu, pak křížem – práce orby (pruhy dne) se nemění', () => {
    // v polovině druhého průchodu dílu 51 je první průchod celý, druhý rozpracovaný
    const rows = track.route.stints[1]!.rows;
    const half = rows[Math.floor(rows.length / 2)]!;
    const s = track.route.starts[half.segment]!;
    const ms = (s / track.route.length) * 86_000;
    const bands = routeFurrows(track, ms).filter((b) => b.partId === 51);
    const first = bands.filter((b) => !b.cross);
    expect(first.reduce((sum, b) => sum + 2 * b.half, 0)).toBeCloseTo(0.75 * CELL, 6);
    const second = bands.filter((b) => b.cross);
    expect(second.length).toBeGreaterThan(0);
    expect(second.reduce((sum, b) => sum + 2 * b.half, 0)).toBeLessThan(CELL);
    // pruhy dne (co jádro dnes zoralo) jsou stejné jako bez druhého průchodu
    expect(stints.filter((s) => s.cross).map((s) => [s.partId, s.from, s.to])).toEqual(
      stints.filter((s) => !s.cross).map((s) => [s.partId, s.from, s.to]),
    );
  });

  it('úzký pruh v kulatém rohu: řady končí na oblouku, řady celé za obloukem vynechá', () => {
    // pruh 1/8 dílu (1,875 m) u okraje s kulatým rohem (oblouk 5 m)
    const field: PloughField = {
      x: 0,
      z: 0,
      size: CELL,
      dirX: 1,
      dirZ: 0,
      rows: 2,
      from: -CELL / 2,
      to: -CELL / 2 + CELL / 8,
      corners: [{ x: -CELL / 2, z: -CELL / 2 }],
    };
    const cross = crossField(field, PLOUGH_ROW_M);
    expect(cross.length).toBeCloseTo(CELL / 8, 9);
    expect(cross.size).toBe(CELL);
    const route = ploughRoute([{ fieldId: 1, partId: 1, field: cross, cross: true }]);
    const rows = route.stints[0]!.rows;
    // krajní řada u rohu je kratší (končí na oblouku), řady uprostřed přes celý pruh
    expect(rows).toHaveLength(stintRowCount(cross));
    expect(rows[0]!.hi - rows[0]!.lo).toBeLessThan(CELL / 8 - 1);
    expect(rows[2]!.hi - rows[2]!.lo).toBeCloseTo(CELL / 8, 9);
    // hustší řady: krajní řady leží celé za obloukem – spřežení je vynechá
    const dense = crossField(field, 1);
    const kept = ploughRoute([{ fieldId: 1, partId: 1, field: dense, cross: true }]).stints[0]!
      .rows;
    expect(kept.length).toBeLessThan(stintRowCount(dense));
    for (const row of kept) expect(row.hi - row.lo).toBeGreaterThan(0);
  });
});

describe('pás orby přes víc dílů (oxen.md – Co nejdelší brázda)', () => {
  const furrow = { axis: 'x' as const, sweep: 1 as const };
  /** Dnes: díly 61–63 jednoho pásu zorané z 1/4 na 3/4 (stejně – orají se spolu). */
  const band = (): SceneVillage =>
    village(
      [61, 62, 63].map((id, i) => part(id, i, { furrow, work: 0.75, before: 'stubble' })),
      {
        parts: [61, 62, 63],
        progress: [
          [0.25, 0.75],
          [0.25, 0.75],
          [0.25, 0.75],
        ],
      },
    );

  it('díly pásu jsou jeden pruh – brázda přes celý pás, obraty jen na jeho koncích', () => {
    const stints = dayStints(band());
    // pruh a hned po něm týž pruh křížem
    expect(stints.map((s) => s.cross ?? false)).toEqual([false, true]);
    const [stint] = stints;
    expect(stint!.partIds).toEqual([61, 62, 63]);
    expect(stint!.field.length).toBeCloseTo(3 * CELL, 9);
    expect(stint!.field.x).toBeCloseTo(1.5 * CELL, 9);
    // řady jdou přes celý pás
    const route = ploughRoute(stints);
    const rows = route.stints[0]!.rows;
    expect(rows.length).toBeGreaterThan(1);
    // (krajní řady u kulatých rohů pásu kratší)
    for (const row of rows) expect(row.hi - row.lo).toBeLessThanOrEqual(3 * CELL + 1e-6);
    expect(Math.max(...rows.map((row) => row.hi - row.lo))).toBeCloseTo(3 * CELL, 6);
    // pole na začátku dne – všechny díly pásu zorané ráno z 1/4
    const start = startOfDayVillage(band(), stints);
    for (const p of start.fields[0]!.parts) expect(p.work).toBe(0.25);
  });

  it('v den výjezdu a návratu: spřežení vyjde z ohrady, dojede po cestě a večer se vrátí', () => {
    const stints = dayStints(band());
    const approach = [
      { x: -40, z: -30 },
      { x: -20, z: -30 },
      { x: -5, z: 0 },
    ];
    const route = ploughRoute(stints, { x: -40, z: -31 }, TURN_RADIUS_M, {
      out: approach,
      home: [...approach].reverse(),
    });
    const track: RouteTrack = { route, startMs: 0, endMs: 1000 };
    const pose = createTeamPose();
    routePose(track, 0, pose, () => 0);
    expect(Math.hypot(pose.yoke.x + 40, pose.yoke.z + 31)).toBeLessThan(1.5);
    routePose(track, 1000, pose, () => 0);
    expect(Math.hypot(pose.yoke.x + 40, pose.yoke.z + 30)).toBeLessThan(1.5);
    // cesta tam a zpět rádlo v zemi nemá – brázda jen na pásu
    expect(route.segmentStint.filter((s) => s < 0).length).toBeGreaterThanOrEqual(5);
  });
});

describe('osa brázdy podle bloku (Martin, 19. 10. 2026 – orba i sever – jih)', () => {
  it('pás podél y (sever – jih): spřežení jede sever – jih, brázda přes celý pás', () => {
    // díly 71–74 v jednom sloupci pole (y 0–3), herní jádro dalo osu y
    const furrow = { axis: 'y' as const, sweep: 1 as const };
    const parts = [71, 72, 73, 74].map((id, y) => ({
      ...part(id, 0, { furrow, work: 0.5, before: 'stubble' as const }),
      cell: { x: 0, y },
      z: y * CELL + CELL / 2,
    }));
    const stints = dayStints(
      village(parts, {
        parts: [71, 72, 73, 74],
        progress: parts.map(() => [0, 0.5] as [number, number]),
      }),
    );
    expect(stints.map((s) => s.cross ?? false)).toEqual([false, true]);
    const field = stints[0]!.field;
    // řady podél z (sever – jih), pás přes 4 díly
    expect(Math.abs(field.dirZ)).toBeCloseTo(1, 9);
    expect(field.dirX).toBeCloseTo(0, 9);
    expect(field.length).toBeCloseTo(4 * CELL, 9);
    // druhý průchod křížem – řady východ – západ přes pruh
    expect(Math.abs(stints[1]!.field.dirX)).toBeCloseTo(1, 9);
    const route = ploughRoute(stints);
    const lines = route.segments.filter(
      (seg, i) => seg.kind === 'line' && route.segmentStint[i] === 0 && seg.length > CELL,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const seg of lines) {
      if (seg.kind !== 'line') continue;
      expect(Math.abs(seg.dz)).toBeCloseTo(1, 6);
    }
  });
});

describe('zoraná zem jen kudy rádlo projelo (Martin, 19. 10. 2026)', () => {
  const furrow = { axis: 'x' as const, sweep: 1 as const };
  /**
   * Dnes: pás A (díly 71–73) dozorán z půlky do konce a za pluhem už i zaset, přejezd na pás B
   * jiného bloku (81–83, kus dál) zoraný do půlky; díl 74 dnes nikdo neoral.
   */
  const day = (): SceneVillage =>
    village(
      [
        ...[71, 72, 73].map((id, i) =>
          part(id, i, { furrow, look: 'sown', unploughed: 'stubble', work: undefined }),
        ),
        part(74, 3, { look: 'stubble' }),
        ...[81, 82, 83].map((id, i) =>
          part(id, 6 + i, { furrow, work: 0.5, before: 'stubble', unploughed: 'stubble' }),
        ),
      ],
      {
        parts: [71, 72, 73, 81, 82, 83],
        progress: [
          [0.5, 1],
          [0.5, 1],
          [0.5, 1],
          [0, 0.5],
          [0, 0.5],
          [0, 0.5],
        ],
      },
    );

  it('díly dnešní orby projede rádlo celé – i zasetý za pluhem; jiné díly se nezmění', () => {
    const village = day();
    const stints = dayStints(village);
    expect(stints.map((s) => s.partIds)).toEqual([
      [71, 72, 73],
      [71, 72, 73],
      [81, 82, 83],
      [81, 82, 83],
    ]);
    const start = startOfDayVillage(village, stints);
    const look = (v: SceneVillage, id: number): SceneFieldPart =>
      v.fields[0]!.parts.find((p) => p.id === id)!;
    // ráno: pás A zoraný do půlky, pás B ještě strniště, díl 74 beze změny
    for (const id of [71, 72, 73])
      expect(look(start, id)).toMatchObject({ look: 'plowed', work: 0.5 });
    for (const id of [81, 82, 83]) expect(look(start, id).look).toBe('stubble');
    expect(look(start, 74)).toEqual(look(village, 74));
    // dvě spřežení – každé svůj pás; brázdy na konci dne pokryjí přesně dnešní pruhy
    for (const team of splitStints(stints, 2)) {
      const route = ploughRoute(team);
      const track: RouteTrack = { route, startMs: 0, endMs: 1000 };
      const bands = routeFurrows(track, 1000);
      for (const stint of team.filter((s) => !s.cross)) {
        const own = bands.filter(
          (b) => !b.cross && (stint.partIds.includes(b.partId ?? -1) || b.partId === stint.partId),
        );
        const across = own.reduce((sum, b) => sum + 2 * b.half, 0);
        expect(across).toBeCloseTo((stint.to - stint.from) * CELL, 6);
        // brázda leží jen na dílech pásu (podél řad přes celý pás)
        for (const b of own) {
          expect(b.to - b.from).toBeLessThanOrEqual(3 * CELL + 1e-6);
          expect(Math.abs(b.x - stint.field.x)).toBeLessThan(1e-6);
        }
      }
      // přejezd mezi bloky rádlo nese – zvednuté, žádná brázda
      expect(bands.every((b) => b.partId !== 74)).toBe(true);
    }
  });
});
