import { describe, expect, it } from 'vitest';
import type { ScenePerson } from '../../person-view';
import { fishingLine, LINE_BEYOND_M, ROD_TIP } from '../fishing-lines';
import { createVillagerPose } from '../villager-motion';
import {
  ANGLERS_PER_POOL,
  anglerSpot,
  anglers,
  herderPeople,
  WATCH_CHILDREN,
  watchChildren,
} from '../villager-plan-folk';
import { DayRoster } from '../villager-roster';
import type { Context } from '../villager-plan-types';

// tůň se středem v počátku, tok podél +x, voda 3 m na obě strany (|z| < 3 je voda a břeh)
const POOL = { x: 0, z: 0, flowX: 1, flowZ: 0, halfLeft: 3, halfRight: 3 };
const water = (x: number, z: number): boolean => Math.abs(z) < 3.5 && Math.abs(x) < 30;
const kid = (id: number): ScenePerson => ({ id, age: 10, sex: 'male', home: 1, role: 'child' });

function ctx(over: {
  pools?: (typeof POOL)[];
  watchParts?: number[];
  persons?: ScenePerson[];
}): Context {
  return {
    village: {
      wildlife: { pools: over.pools ?? [POOL], watchParts: over.watchParts },
      fields: [
        {
          id: 1,
          parts: [
            { id: 7, x: 40, z: 40, size: 20 },
            { id: 8, x: 80, z: 40, size: 20 },
          ],
        },
      ],
    },
    ground: { walkable: (x: number, z: number) => !water(x, z) },
    seed: 3,
    day: 100,
    sexes: { women: null, elderWomen: null, girls: null, married: null },
    center: { x: 0, z: 30 },
    roster: over.persons ? new DayRoster(over.persons, 3) : null,
  } as unknown as Context;
}

describe('rybáři u tůně (wildlife.md – Ve scéně)', () => {
  it('stojí na břehu mimo vodu, čelem k vodě, nejvýš 3 na tůň', () => {
    const c = ctx({});
    const spots = [0, 1, 2, 3].map((i) => anglerSpot(c, 0, i));
    expect(spots[ANGLERS_PER_POOL]).toBeNull();
    for (const s of spots.slice(0, ANGLERS_PER_POOL)) {
      expect(s).not.toBeNull();
      expect(water(s!.x, s!.z)).toBe(false);
      expect(Math.abs(s!.z)).toBeLessThan(3 + 8.1);
      // hledí k ose tůně
      expect(Math.sign(s!.headingZ)).toBe(-Math.sign(s!.z));
    }
    // ne dva na stejném místě
    const keys = new Set(spots.slice(0, 3).map((s) => `${s!.x.toFixed(1)},${s!.z.toFixed(1)}`));
    expect(keys.size).toBe(3);
  });

  it('postava rybáře drží prut (klip fish); bez tůně nikdo', () => {
    const pose = anglers(ctx({}), 0)(0, { kind: 'man' } as never);
    expect(pose?.(10, [], createVillagerPose()).clip).toBe('fish');
    expect(anglers(ctx({}), 1)(0, { kind: 'man' } as never)).toBeNull();
    expect(anglerSpot(ctx({ pools: [] }), 0, 0)).toBeNull();
  });
});

describe('děti s řehtačkou na hlídaných dílech', () => {
  it('na každém hlídaném dílu jedno dítě, chodí po okraji dílu', () => {
    const people = watchChildren(
      ctx({ watchParts: [7, 8, 99], persons: [kid(1), kid(2), kid(3)] }),
    );
    expect(people).toHaveLength(2);
    expect(people.length).toBeLessThanOrEqual(WATCH_CHILDREN);
    const out = createVillagerPose();
    for (const t of [0, 7, 19, 33]) {
      people[0]!.pose(t, [], out);
      // u okraje dílu 7 (střed 40, 40, strana 20) – na mezi kolem čtverce
      expect(Math.max(Math.abs(out.x - 40), Math.abs(out.z - 40))).toBeLessThan(11.5);
      expect(Math.max(Math.abs(out.x - 40), Math.abs(out.z - 40))).toBeGreaterThan(9.5);
    }
  });

  it('děti s řehtačkou se berou až po pasácích – pasáci nezůstanou bez postavy', () => {
    const c = ctx({ watchParts: [7, 8], persons: [kid(1), kid(2), kid(3)] });
    const herders = herderPeople(c, { herders: { children: 2 } } as never);
    expect(herders).toHaveLength(2);
    const people = watchChildren(c);
    expect(people).toHaveLength(1);
    const left = [1, 2, 3].filter((id) => !herders.some((p) => p.id === id));
    expect(people[0]!.person).toBe(left[0]);
  });

  it('bez dětí nebo bez hlídky nikdo', () => {
    expect(watchChildren(ctx({ watchParts: [7], persons: [] }))).toHaveLength(0);
    expect(watchChildren(ctx({ persons: [kid(1)] }))).toHaveLength(0);
  });
});

describe('vlasec (fishing-lines.ts)', () => {
  it('od špičky prutu muže (šikmo vpřed vlevo) dolů na hladinu před ním', () => {
    // muž hledí na −z, jeho levá ruka je na +x
    const [tx, ty, tz, wx, wy, wz] = fishingLine(
      { x: 1, z: 5, headingX: 0, headingZ: -1 },
      'man',
      1,
      // břeh 10 m, za 3 m od rybáře sráz do tůně (dno 6 m)
      (_x, z) => (z > 2 ? 10 : 6),
    );
    expect(ty).toBeCloseTo(10 + ROD_TIP.man.up);
    expect(tx).toBeCloseTo(1 - ROD_TIP.man.right);
    expect(tx).toBeGreaterThan(1.5);
    expect(tz).toBeCloseTo(5 - ROD_TIP.man.forward);
    // dopad na dně pod hladinou, o kus dál ve směru pohledu než špička, bez posunu do strany
    expect(wy).toBeLessThan(6);
    expect(wx).toBeCloseTo(tx);
    expect(wz).toBeCloseTo(tz - LINE_BEYOND_M);
  });

  it('žena drží prut šikmo nad vodu jako muž – špička vpředu, větší postava dál', () => {
    const at = { x: 0, z: 0, headingX: 1, headingZ: 0 };
    const flat = (): number => 0;
    const [tx, ty] = fishingLine(at, 'woman', 1, flat);
    expect(ty).toBeLessThan(2);
    expect(tx).toBeGreaterThan(1.8);
    const [bx, by] = fishingLine(at, 'woman', 1.2, flat);
    expect(bx).toBeCloseTo(tx * 1.2);
    expect(by).toBeCloseTo(ty * 1.2);
  });
});
