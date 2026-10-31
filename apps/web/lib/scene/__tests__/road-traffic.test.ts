import { WATER_FETCHING, woodErrandTrips } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import {
  MAX_TRAFFIC,
  MIN_STREAM_LOAD,
  TRAFFIC_DAY_S,
  streamLoad,
  streamPhase,
  trafficCounts,
  trafficHomes,
  waterTrips,
  woodTrips,
  type TrafficStream,
} from '../road-traffic';

describe('road-traffic – kolik lidí je na cestách (villagers.md – Provoz na cestách)', () => {
  it('cesty pro vodu jako simulace – na člověka a den, co přivezl vůz, pěšky nikdo', () => {
    expect(waterTrips({ people: 5 })).toBeCloseTo(5 * WATER_FETCHING.tripsPerPerson, 9);
    expect(waterTrips({ people: 5, cartWater: 1 })).toBe(0);
    expect(waterTrips({ people: 5, cartWater: 0.5 })).toBeCloseTo(
      2.5 * WATER_FETCHING.tripsPerPerson,
      9,
    );
    expect(waterTrips({ people: 0 })).toBe(0);
  });

  it('cesty pro dřevo jako síť pěšin – v zimě víc', () => {
    expect(woodTrips(1)).toBe(woodErrandTrips(1));
    expect(woodTrips(1)).toBeGreaterThan(woodTrips(7));
  });

  it('lidí na cestě = cesty × doba cesty ÷ TRAFFIC_DAY_S (proud, ne celý den naráz)', () => {
    expect(streamLoad({ trips: 10, activeS: TRAFFIC_DAY_S })).toBeCloseTo(10, 9);
    expect(streamLoad({ trips: 10, activeS: TRAFFIC_DAY_S / 2 })).toBeCloseTo(5, 9);
    expect(streamLoad({ trips: -1, activeS: 100 })).toBe(0);
  });

  it('počty postav úměrně cestám, celkem nejvýš strop', () => {
    const stream = (kind: TrafficStream['kind'], trips: number): TrafficStream => ({
      kind,
      trips,
      activeS: TRAFFIC_DAY_S,
    });
    expect(trafficCounts([stream('water', 4), stream('water', 2)])).toEqual([4, 2]);
    // dvakrát víc cest – dvakrát víc lidí
    expect(trafficCounts([stream('water', 8), stream('water', 4)])).toEqual([8, 4]);
    // strop: poměrně méně
    const capped = trafficCounts([stream('water', 40), stream('kiln', 20)], 12);
    expect(capped.reduce((a, b) => a + b, 0)).toBe(12);
    expect(capped).toEqual([8, 4]);
    expect(trafficCounts([stream('water', 100)]).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      MAX_TRAFFIC,
    );
    // nikdo nikam nechodí
    expect(trafficCounts([stream('water', 0)])).toEqual([0]);
    expect(trafficCounts([])).toEqual([]);
  });

  it('každý druh cesty, po které někdo chodí, má aspoň jednoho člověka', () => {
    const short = (kind: TrafficStream['kind'], trips: number): TrafficStream => ({
      kind,
      trips,
      activeS: (TRAFFIC_DAY_S * 0.4) / trips,
    });
    // každý proud jen 0,4 člověka – zaokrouhlením by někdo zmizel
    const counts = trafficCounts([short('water', 2), short('wood', 1), short('kiln', 3)]);
    // pro vodu a dřevo aspoň jeden; uhlíř k milíři jen podle zaokrouhlení (jako dřív)
    expect(counts).toEqual([1, 1, 0]);
    // druh celkem pod MIN_STREAM_LOAD nikdo, nad ním aspoň jeden – i z drobných proudů
    const tiny = {
      kind: 'wood' as const,
      trips: 1,
      activeS: MIN_STREAM_LOAD * TRAFFIC_DAY_S * 0.6,
    };
    expect(trafficCounts([tiny, tiny])).toEqual([1, 0]);
    expect(
      trafficCounts([{ kind: 'wood', trips: 1, activeS: MIN_STREAM_LOAD * TRAFFIC_DAY_S * 0.5 }]),
    ).toEqual([0]);
    // přes strop se ubere tomu, kdo má víc lidí
    const full = trafficCounts(
      [
        { kind: 'water', trips: 10, activeS: TRAFFIC_DAY_S },
        { kind: 'wood', trips: 1, activeS: TRAFFIC_DAY_S * 0.3 },
      ],
      4,
    );
    expect(full).toEqual([3, 1]);
  });

  it('fáze v proudu: přibude-li člověk, ostatní zůstanou; rozestupy skoro stejné', () => {
    const base = 0.37;
    const four = [0, 1, 2, 3].map((k) => streamPhase(k, base));
    const five = [0, 1, 2, 3, 4].map((k) => streamPhase(k, base));
    expect(five.slice(0, 4)).toEqual(four);
    for (const p of five) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    const sorted = [...five].sort((a, b) => a - b);
    const gaps = sorted.map((p, i) => (i === 0 ? p + 1 - sorted.at(-1)! : p - sorted[i - 1]!));
    expect(Math.min(...gaps)).toBeGreaterThan(0.1);
  });

  it('domácnosti: z rozdělení práce, u dřívějšího pohledu lidé rovným dílem', () => {
    const people = { children: 4, adults: 6, elders: 2 };
    expect(
      trafficHomes(
        {
          people,
          homes: [
            { id: 1, people: 7 },
            { id: 9, people: 3 },
          ],
        },
        [1],
      ),
    ).toEqual([{ id: 1, people: 7 }]);
    expect(trafficHomes({ people }, [1, 2, 3])).toEqual([
      { id: 1, people: 4 },
      { id: 2, people: 4 },
      { id: 3, people: 4 },
    ]);
    expect(trafficHomes({ people }, [])).toEqual([]);
  });
});
