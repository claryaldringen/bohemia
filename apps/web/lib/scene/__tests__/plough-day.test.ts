import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneLaborShare, SceneVillage } from '../../village-view';
import { dayStints, splitStints, startOfDayVillage } from '../plough-day';
import {
  PLOUGH_CORNER_M,
  TURN_RADIUS_M,
  ardReach,
  createTeamPose,
  outsideSquare,
  ploughRoute,
  routeDistance,
  routeFurrows,
  routePose,
  rowExtent,
  type FurrowBand,
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
  ploughed: true,
  ...extra,
});

/** Pole o čtyřech dílech v řadě podél x, dům u z = −20 (práce jde do +z). */
function village(parts: SceneFieldPart[], share: Partial<SceneLaborShare>): SceneVillage {
  return {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: 0, z: -20, rotation: 0 }, built: true, progress: 1 },
    ],
    fields: [{ id: 5, parts }],
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
      part(54, 3, { look: 'stubble', ploughed: undefined }),
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
    const stints = dayStints(today());
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
    expect(old.map((s) => [s.partId, s.from, s.to])).toEqual([[53, 0, 0.625]]);
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
  });
});

describe('trasa dne a brázda za rádlem', () => {
  const stints = dayStints(today());
  const track: RouteTrack = { route: ploughRoute(stints), startMs: 1000, endMs: 87_000 };

  it('na začátku nic, na konci brázda pokryje celé dnešní pruhy (jako pole dalšího dne)', () => {
    expect(routeFurrows(track, 0)).toEqual([]);
    expect(routeFurrows(track, 1000)).toEqual([]);
    const end = routeFurrows(track, 90_000);
    for (const stint of stints) {
      const bands = end.filter((b) => b.partId === stint.partId);
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
        // radlice v zemi jen uvnitř některého dnešního dílu (kulaté rohy)
        const inside = stints.some((s) => {
          const du = pose.ard.x - s.field.x;
          const dv = pose.ard.z - s.field.z;
          return outsideSquare(du, dv, CELL / 2, [0, 0, 0, 0]) <= 0.01;
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
