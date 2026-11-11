import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { DWELLING_FOOTPRINT_M } from '../../rules';
import { craftHouseholds } from '../../crafts/crafts';
import { evacuationTarget } from '../../people/population';
import { collapseDwellings, dwellingFireChance, fireDay, jumpChance, spreadFire } from '../fire';
import { occupyEmptyDwellings } from '../../people/households';
import { withCharredRuins } from '../../buildings/ruins';
import { advanceVillage } from '../../core/simulate';
import type { Dwelling, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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
    const fire = spreadFire(dwellings, 1, i + 1, 0, {
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
      const fire = spreadFire([a, b, c], 1, i + 1, 0, {
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
        const fire = spreadFire([a, b], 1, i + 1, 0, { layer, status, orchards: [] });
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
      const fire = spreadFire([a, b], 1, i + 1, 0, {
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
      const fire = spreadFire([a, b], 1, i + 1, 0, { layer: null, status: null, orchards: [] }, 1);
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
      collapsedDwellingIds: [1],
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

  it('s hašením dům ohoří, nezřítí se – kronika ho nepočítá mezi zřícené', () => {
    const state = twoHouses();
    const [event] = fireDay(state, DAY, null, null, 1);
    expect(event).toMatchObject({ burnedDwellingIds: [1], collapsedDwellingIds: [] });
  });
});

describe('evakuace a dílna', () => {
  const workshop = { craft: 'burner', felling: null, fuelKg: 0, activity: 'empty' } as const;

  function crowd(extra: Dwelling[]): VillageState {
    const state = village([house(1, 0), house(2, 40, 0, { workshop: { ...workshop } }), ...extra]);
    state.people = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      bornDay: OLD - 30 * 365,
      dwellingId: i === 0 ? 2 : 1,
      sex: 'male' as const,
    }));
    return state;
  }

  it('evakuovaní jdou do obydlí bez dílny, i když je tam méně místa', () => {
    const state = crowd([house(3, 80)]);
    state.people.push({ id: 20, bornDay: OLD - 30 * 365, dwellingId: 3, sex: 'female' });
    const members = state.people.filter((p) => p.dwellingId === 1);
    const homes = state.dwellings.filter((d) => d.id !== 1);
    expect(evacuationTarget(state, OLD, members, 1, homes)?.id).toBe(3);
  });

  it('bez jiného domu se nastěhují do dílny, ale přeplněná dílna není řemeslnická domácnost', () => {
    const state = crowd([]);
    const members = state.people.filter((p) => p.dwellingId === 1);
    const homes = state.dwellings.filter((d) => d.id !== 1);
    const target = evacuationTarget(state, OLD, members, 1, homes);
    expect(target?.id).toBe(2);
    expect([...craftHouseholds(state)]).toEqual([2]);
    for (const p of members) p.dwellingId = 2;
    expect(craftHouseholds(state).size).toBe(0);
  });

  it('smršť zboří vše kromě dílny – ves dál seje', () => {
    const state = crowd([]);
    state.disasters = { override: { fire: { [OLD]: 1 } } };
    state.dwellings[1]!.condition = 1;
    const [house1] = state.dwellings;
    house1!.condition = 0;
    collapseDwellings(state, OLD, [house1!]);
    expect(state.dwellings.map((d) => d.id)).toEqual([2]);
    expect(state.people.every((p) => p.dwellingId === 2)).toBe(true);
    expect(craftHouseholds(state).size).toBe(0);
  });
});

describe('po požáru', () => {
  const DAY = OLD;
  const born = (years: number): number => DAY - years * 365;

  it('shořelá kovárna a hrnčířství odnesou svou zásobu, milíř a ostatní ne', () => {
    const smith = house(1, 0, 0, { workshop: { craft: 'smith' } as Dwelling['workshop'] });
    const potter = house(2, 100, 0, { workshop: { craft: 'potter' } as Dwelling['workshop'] });
    const burner = house(3, 200, 0, { workshop: { craft: 'burner' } as Dwelling['workshop'] });
    const state = village([smith, potter, burner]);
    state.crafts = { charcoalKg: 300, potteryKg: 80, ironBarsKg: 40, bloomKg: 20 };
    state.people = [{ id: 1, bornDay: born(30), dwellingId: 2, sex: 'male' }];
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    const events = fireDay(state, DAY, null, null);
    expect(state.crafts).toMatchObject({ charcoalKg: 0, potteryKg: 80, ironBarsKg: 0, bloomKg: 0 });
    expect(events[0]).toMatchObject({ lostCharcoalKg: 300, lostIronKg: 60, lostPotteryKg: 0 });
    state.disasters = { override: { fire: { [DAY + 1]: 2 } } };
    fireDay(state, DAY + 1, null, null);
    expect(state.crafts?.potteryKg).toBe(0);
  });

  it('vyhořelý dům zůstane ruinou, rodinu pod střechu přijme až dům, který postaví hráč', () => {
    const a = house(1, 0);
    const b = house(2, 100);
    const state = village([a, b]);
    state.people = [
      { id: 5, bornDay: born(50), dwellingId: 2, sex: 'male', spouseId: 6 },
      { id: 6, bornDay: born(44), dwellingId: 2, sex: 'female', spouseId: 5 },
      { id: 1, bornDay: born(30), dwellingId: 1, sex: 'male', spouseId: 2 },
      { id: 2, bornDay: born(28), dwellingId: 1, sex: 'female', spouseId: 1 },
      { id: 3, bornDay: born(3), dwellingId: 1, fatherId: 1, motherId: 2 },
    ];
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    fireDay(state, DAY, null, null);
    expect(state.ruins?.map((r) => r.id)).toEqual([1]);
    expect(state.constructions.some((c) => c.kind === 'rebuild')).toBe(false);
    expect(state.people.every((p) => p.dwellingId === 2)).toBe(true);
    // hráč postaví nový dům – prázdné obydlí osídlí rodina syna (jako po rozpadu)
    state.dwellings.push(house(3, 200));
    occupyEmptyDwellings(state, DAY);
    expect(
      state.people
        .filter((p) => p.dwellingId === 3)
        .map((p) => p.id)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  it('stavba vázaná na shořelý dům zanikne, ves pak 365 dní běží bez výjimky', () => {
    const state = village([house(1, 0), house(2, 100)]);
    state.people = [{ id: 1, bornDay: born(30), dwellingId: 1, sex: 'male' }];
    state.constructions.push({
      id: 77,
      kind: 'repair',
      startedDay: DAY,
      cost: 10,
      done: 0,
      dwellingType: 'polozemnice',
      position: null,
      dwellingId: 1,
      fieldId: null,
    } as unknown as VillageState['constructions'][number]);
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    state.lastDay = DAY - 1;
    fireDay(state, DAY, null, null);
    expect(state.constructions.some((c) => c.id === 77)).toBe(false);
    const later = advanceVillage(state, DAY + 365, null);
    expect(later.people.length).toBeGreaterThan(0);
    expect(later.dwellings.some((d) => d.id === 1)).toBe(false);
  });

  it('los přeskoku je vlastní pro každou dvojici – nezávisí na ostatních domech', () => {
    const a = house(1, 0);
    const b = beside(a, 2, 5);
    const far = house(3, 5000);
    const green = { layer: null, status: null, orchards: [] };
    for (let seed = 1; seed < 200; seed++) {
      const alone = spreadFire([a, b], 1, seed, 9, green).includes(2);
      const crowd = spreadFire([a, far, b], 1, seed, 9, green).includes(2);
      expect(crowd).toBe(alone);
    }
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

describe('ohořelá ruina', () => {
  it('shořelé obydlí zanechá ohořelou ruinu natrvalo, jiný zánik ne', () => {
    const state = village([house(1, 0), house(2, 100)]);
    const [a, b] = state.dwellings;
    collapseDwellings(state, OLD, [a!]);
    state.ruins!.push({ id: b!.id, type: b!.type, position: b!.position, day: OLD });
    expect(state.ruins!.map((r) => [r.id, r.charred ?? false])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('starší ves dostane příznak z kroniky jednou a idempotentně', () => {
    const state = village([house(2, 100)]);
    state.ruins = [
      { id: 1, type: 'polozemnice', position: { x: 0, z: 0, rotation: 0 }, day: OLD },
      { id: 3, type: 'polozemnice', position: { x: 9, z: 0, rotation: 0 }, day: OLD },
    ];
    state.chronicle = [
      {
        day: OLD,
        kind: 'fire',
        startedDwellingId: 1,
        burnedDwellingIds: [1],
        lostGrainKg: 0,
        lostMeatKg: 0,
        lostCheeseKg: 0,
        lostHayKg: 0,
      } as VillageState['chronicle'][number],
    ];
    const once = withCharredRuins(state);
    expect(once.ruins!.map((r) => r.charred ?? false)).toEqual([true, false]);
    expect(withCharredRuins(once)).toBe(once);
    expect(state.ruins[0]!.charred).toBeUndefined();
  });
});
