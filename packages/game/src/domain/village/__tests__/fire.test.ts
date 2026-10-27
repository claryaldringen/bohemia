import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { createRandom } from '../../landscape/random';
import { foundVillage } from '../actions';
import { DWELLING_FOOTPRINT_M } from '../rules';
import { dwellingFireChance, fireDay, jumpChance, spreadFire } from '../fire';
import { advanceVillage } from '../simulate';
import type { Dwelling, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Požár (disasters.md – Požár): vznik, řetězové šíření, zeleň, zásoby a ochrana nové vsi.

const YEAR = 365.25;
const FOUNDED = dayIndexOf({ year: 500, month: 1, day: 1 });
const OLD = FOUNDED + 10 * 365;
const WIDTH = DWELLING_FOOTPRINT_M.polozemnice.width;

/** Obydlí bez varianty rozměrů (půdorys přesně podle pravidel), natočení 0. */
function house(id: number, x: number, z = 0, extra: Partial<Dwelling> = {}): Dwelling {
  return {
    id,
    type: 'polozemnice',
    builtDay: FOUNDED,
    condition: 1,
    position: { x, z, rotation: 0 },
    plainShape: true,
    ...extra,
  };
}

/** Ves se zadanými obydlími; kraj má počasí (ves bez seedu počasí nehoří). */
function village(dwellings: Dwelling[], seed = 7): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed, day: FOUNDED, dwellingPosition: { x: -500, z: 0, rotation: 0 } }),
  );
  base.weatherSeed = 12345;
  base.dwellings = dwellings;
  base.people = [];
  return base;
}

/** Dům `b` ve vzdálenosti obrysů `gapM` od domu `a` (stejná řada, natočení 0). */
const beside = (a: Dwelling, id: number, gapM: number): Dwelling =>
  house(id, a.position.x + WIDTH + gapM, a.position.z);

/** Podíl pokusů, ve kterých oheň z domu 1 přeskočí na dům 2 (různá semínka). */
function jumpRate(dwellings: Dwelling[]): number {
  let hits = 0;
  const runs = 3000;
  for (let i = 0; i < runs; i++) {
    const fire = spreadFire(dwellings, 1, createRandom(i + 1), {
      layer: null,
      status: null,
      orchards: [],
    });
    if (fire.includes(2)) hits++;
  }
  return hits / runs;
}

describe('šance stavby', () => {
  const MID_JAN = 1;
  it('kovárna, milíř a pec ×3, zemnice ×½, zima ×1,5', () => {
    const plain = dwellingFireChance({ type: 'polozemnice' }, 5, 'normal');
    expect(plain).toBeCloseTo(0.004, 10);
    expect(dwellingFireChance({ type: 'zemnice' }, 5, 'normal')).toBeCloseTo(plain / 2, 10);
    for (const craft of ['smith', 'burner', 'potter'] as const) {
      const shop = dwellingFireChance(
        { type: 'polozemnice', workshop: { craft } as Dwelling['workshop'] },
        5,
        'normal',
      );
      expect(shop).toBeCloseTo(plain * 3, 10);
    }
    expect(dwellingFireChance({ type: 'polozemnice' }, MID_JAN, 'normal')).toBeCloseTo(
      plain * 1.5,
      10,
    );
  });

  it('suché léto ×2, kruté sucho ×3, deštivé léto ×½ – jen duben až srpen', () => {
    expect(dwellingFireChance({ type: 'polozemnice' }, 7, 'dry')).toBeCloseTo(0.008, 10);
    expect(dwellingFireChance({ type: 'polozemnice' }, 7, 'drought')).toBeCloseTo(0.012, 10);
    expect(dwellingFireChance({ type: 'polozemnice' }, 7, 'wet')).toBeCloseTo(0.002, 10);
    expect(dwellingFireChance({ type: 'polozemnice' }, 10, 'drought')).toBeCloseTo(0.004, 10);
  });

  it('ves s 15 domy: ≈ 6–7 % požárů ročně (zima přidává)', () => {
    const homes = Array.from({ length: 15 }, (_, i) => house(i + 1, i * 100));
    const base = village(homes);
    let fires = 0;
    const years = 1500;
    for (let day = OLD; day < OLD + years * YEAR; day++) {
      if (fireDay(base, Math.floor(day), null, null).length > 0) {
        fires++;
        base.dwellings = homes.map((d) => structuredClone(d));
      }
    }
    const perYear = fires / years;
    expect(perYear).toBeGreaterThan(0.05);
    expect(perYear).toBeLessThan(0.09);
  });
});

describe('šíření ohně', () => {
  it('pásma: do 6 m 70 %, do 12 m 40 %, dál nic', () => {
    expect(jumpChance(5)).toBe(0.7);
    expect(jumpChance(6)).toBe(0.7);
    expect(jumpChance(10)).toBe(0.4);
    expect(jumpChance(12.5)).toBe(0);
  });

  it('rozestup 15 m nepřeskočí, 5 m přeskočí ≈ 70 %, 10 m ≈ 40 %', () => {
    const a = house(1, 0);
    expect(jumpRate([a, beside(a, 2, 15)])).toBe(0);
    expect(jumpRate([a, beside(a, 2, 5)])).toBeGreaterThan(0.66);
    expect(jumpRate([a, beside(a, 2, 5)])).toBeLessThan(0.74);
    expect(jumpRate([a, beside(a, 2, 10)])).toBeGreaterThan(0.36);
    expect(jumpRate([a, beside(a, 2, 10)])).toBeLessThan(0.44);
  });

  it('řetězově: třetí dům za 12 m od prvního chytí přes druhý', () => {
    const a = house(1, 0);
    const b = beside(a, 2, 5);
    const c = beside(b, 3, 5);
    let reached = 0;
    for (let i = 0; i < 2000; i++) {
      const fire = spreadFire([a, b, c], 1, createRandom(i + 1), {
        layer: null,
        status: null,
        orchards: [],
      });
      if (fire.includes(3)) reached++;
    }
    // vzdálenost a–c je 2 × šířka + 10 m, tedy dál než 12 m; chytí jen řetězem (0,7 × 0,7)
    expect(reached / 2000).toBeGreaterThan(0.43);
    expect(reached / 2000).toBeLessThan(0.55);
  });

  it('strom na spojnici půlí přeskok, jehličnan ne', () => {
    const a = house(1, 0);
    const b = beside(a, 2, 5);
    const midX = a.position.x + WIDTH + 2.5;
    const place = (look: ObstaclePlacement['look']): ObstaclePlacement => ({
      id: 1,
      kind: 'tree',
      look,
      x: midX,
      z: 0,
      rotation: 0,
      scale: 1,
    });
    const status = { kindOf: () => 'tree' as const, addedIn: () => [] };
    const rate = (look: ObstaclePlacement['look']): number => {
      const layer = packObstacles([place(look)], 16, 15);
      let hits = 0;
      for (let i = 0; i < 3000; i++) {
        const fire = spreadFire([a, b], 1, createRandom(i + 1), { layer, status, orchards: [] });
        if (fire.includes(2)) hits++;
      }
      return hits / 3000;
    };
    expect(rate('beech-1')).toBeGreaterThan(0.31);
    expect(rate('beech-1')).toBeLessThan(0.39);
    expect(rate('spruce-1')).toBeGreaterThan(0.66);
  });

  it('sad na spojnici půlí přeskok', () => {
    const a = house(1, 0);
    const b = beside(a, 2, 5);
    const midX = a.position.x + WIDTH + 2.5;
    const orchards = [
      [
        [midX - 1, -3],
        [midX + 1, -3],
        [midX + 1, 3],
        [midX - 1, 3],
      ] as [number, number][],
    ];
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const fire = spreadFire([a, b], 1, createRandom(i + 1), {
        layer: null,
        status: null,
        orchards,
      });
      if (fire.includes(2)) hits++;
    }
    expect(hits / 3000).toBeGreaterThan(0.31);
    expect(hits / 3000).toBeLessThan(0.39);
  });

  it('hašení řetězem sníží přeskok o 0,7 × účinnost', () => {
    const a = house(1, 0);
    const b = beside(a, 2, 5);
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const fire = spreadFire(
        [a, b],
        1,
        createRandom(i + 1),
        { layer: null, status: null, orchards: [] },
        1,
      );
      if (fire.includes(2)) hits++;
    }
    expect(hits / 3000).toBeGreaterThan(0.17);
    expect(hits / 3000).toBeLessThan(0.23);
  });
});

describe('dopad požáru', () => {
  const DAY = OLD;

  function twoHouses(): VillageState {
    const a = house(1, 0);
    const b = beside(a, 2, 40);
    const state = village([a, b]);
    state.foundedDay = FOUNDED;
    state.storesKg = 10_000;
    state.grainPits = [
      { id: 9, x: 200, z: 0, capacityKg: 4000, grainKg: 4000, state: 'sealed', dugDay: FOUNDED },
    ];
    state.meatKg = 100;
    state.cheeseKg = 40;
    state.hay = { kg: 2000, mowing: null };
    state.people = [
      { id: 1, bornDay: DAY - 30 * 365, dwellingId: 1, sex: 'male' },
      { id: 2, bornDay: DAY - 6 * 365, dwellingId: 1, fatherId: 1 },
      { id: 3, bornDay: DAY - 30 * 365, dwellingId: 2, sex: 'female' },
    ];
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    return state;
  }

  it('stavba shoří, zbytek jámy, zásoby domu ubydou o podíl, zrno v jámě přečká', () => {
    const state = twoHouses();
    const events = fireDay(state, DAY, null, null);
    expect(events).toHaveLength(1);
    expect(state.dwellings.map((d) => d.id)).toEqual([2]);
    expect(state.ruins?.map((r) => r.id)).toEqual([1]);
    // volné zrno 6000 kg × ½ = 3000 kg pryč, zrno v jámě (4000 kg) zůstalo
    expect(state.storesKg).toBeCloseTo(7000, 5);
    expect(state.grainPits?.[0]?.grainKg).toBe(4000);
    expect(state.meatKg).toBeCloseTo(50, 5);
    expect(state.cheeseKg).toBeCloseTo(20, 5);
    expect(state.hay?.kg).toBeCloseTo(1000, 5);
    expect(events[0]).toMatchObject({
      kind: 'fire',
      startedDwellingId: 1,
      burnedDwellingIds: [1],
      lostGrainKg: 3000,
    });
  });

  it('lidé neumírají, bydlí u příbuzných', () => {
    const state = twoHouses();
    fireDay(state, DAY, null, null);
    expect(state.people).toHaveLength(3);
    expect(state.people.every((p) => p.dwellingId === 2)).toBe(true);
  });

  it('poslední obydlí vsi se nezboří (zůstane poničené)', () => {
    const state = village([house(1, 0)]);
    state.people = [{ id: 1, bornDay: DAY - 30 * 365, dwellingId: 1, sex: 'male' }];
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    fireDay(state, DAY, null, null);
    expect(state.dwellings).toHaveLength(1);
    expect(state.dwellings[0]?.condition).toBeLessThan(0.2);
  });

  it('s hašením klesne stav jen o 1 − 0,5 × účinnost a stavba stojí', () => {
    const state = twoHouses();
    fireDay(state, DAY, null, null, 1);
    expect(state.dwellings.map((d) => d.id)).toEqual([1, 2]);
    expect(state.dwellings[0]?.condition).toBeCloseTo(0.5, 5);
    expect(state.storesKg).toBeCloseTo(10_000 - 6000 * 0.25, 5);
  });
});

describe('ochrana nové vsi a determinismus', () => {
  /** Mnoho vzdálených domů – hazard ≈ 1 požár ročně. */
  function bigVillage(): VillageState {
    const homes = Array.from({ length: 250 }, (_, i) => house(i + 1, i * 100));
    return village(homes);
  }

  it('prvních 5 let nic, v 6. roce ano', () => {
    const state = bigVillage();
    const firesIn = (fromYear: number, toYear: number): number => {
      let n = 0;
      for (let day = FOUNDED + fromYear * 365; day < FOUNDED + toYear * 365; day++) {
        if (fireDay(state, day, null, null).length > 0) n++;
      }
      return n;
    };
    expect(firesIn(0, 5)).toBe(0);
    expect(firesIn(6, 8)).toBeGreaterThan(0);
  });

  it('ves bez počasí kraje nehoří', () => {
    const state = bigVillage();
    delete state.weatherSeed;
    let n = 0;
    for (let day = OLD; day < OLD + 3 * 365; day++) n += fireDay(state, day, null, null).length;
    expect(n).toBe(0);
  });

  it('vynucený požár přebije ochranu a po kouscích dopadne stejně', () => {
    const fireDayIndex = FOUNDED + 40;
    const make = (): VillageState => {
      const state = village([house(1, 0), house(2, 3 * WIDTH), house(3, 400)]);
      state.disasters = { override: { fire: { [fireDayIndex]: 1 } } };
      state.people = [{ id: 1, bornDay: FOUNDED - 30 * 365, dwellingId: 1, sex: 'male' }];
      return state;
    };
    const end = fireDayIndex + 20;
    const whole = advanceVillage(make(), end, null);
    let chunked = make();
    for (let day = chunked.lastDay; day < end;) {
      day = Math.min(end, day + 7);
      chunked = advanceVillage(chunked, day, null);
    }
    const fires = (s: VillageState): unknown[] => s.chronicle.filter((e) => e.kind === 'fire');
    expect(fires(whole)).toHaveLength(1);
    expect(fires(chunked)).toEqual(fires(whole));
    expect(chunked.dwellings.map((d) => d.id)).toEqual(whole.dwellings.map((d) => d.id));
    expect(whole.dwellings.some((d) => d.id === 1)).toBe(false);
  });
});
