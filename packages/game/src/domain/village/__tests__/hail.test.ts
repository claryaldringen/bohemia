import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { dayPartLosses, yearSchedule } from '../disasters';
import { localDisastersDay } from '../local-disasters';
import { hailDay, hailLoss, hailZone } from '../hail';
import { applesAfterHail, squareExpectedYieldKg } from '../orchard';
import { DWELLINGS } from '../rules-people';
import { HAIL } from '../rules-disasters';
import { advanceVillage } from '../simulate';
import type { FarmSeason, FieldPart, HayMowing, SeasonCrop, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Kroupy (disasters.md – Kroupy): rozpis roku, pruh přes okolí vsi, ochrana stromy, sklizené díly,
// louky, sad, střechy, dopočet po kouscích a dvě vsi téže mapy.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const FOUNDED = at(500, 9, 2);
const HAIL_DAY = at(510, 7, 10);
/** Políčko krajiny (128 × 15 m) se středem v `z` = −960 + (y + 0,5) × 15 m; x = 7,5 m. */
const cellAtZ = (y: number): { x: number; y: number } => ({ x: 64, y });

function part(id: number, y: number): FieldPart {
  return {
    id,
    fieldId: id,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 50,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: cellAtZ(y),
  };
}

function crop(name: SeasonCrop['crop'], partIds: number[], harvestedKg: number | null): SeasonCrop {
  const tasks = { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
  return { crop: name, partIds, required: tasks, done: { ...tasks }, harvestedKg };
}

/**
 * Ves s obydlím ve středu (0, 0) a díly ve sloupci 64: díl 1 (z 7,5 m – vnitřek pruhu podél osy x),
 * 2 (z 127,5 m – okraj), 3 (z 172,5 m – mimo), 4 (vnitřek, ozim už sklizený).
 */
function village(seed = 7): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  base.dwellings = base.dwellings.map((d) => ({
    ...d,
    position: { x: 0, z: 0, rotation: 0 },
    condition: 1,
  }));
  base.weatherSeed = 12345;
  base.parts = [part(1, 64), part(2, 72), part(3, 75), part(4, 64)];
  base.season = {
    startDay: at(509, 9, 1),
    crops: [crop('spring', [1, 2, 3], null), crop('winter', [4], 1000)],
  } as FarmSeason;
  return base;
}

/** Vynucené krupobití: pruh podél osy x středem vsi. */
function forceHail(state: VillageState, day: number, offsetM = 0): void {
  state.disasters = { ...state.disasters, override: { hail: { [day]: { angle: 0, offsetM } } } };
}

describe('rozpis roku', () => {
  it('kroupy v 6 % let (2000 let – dvě vsi po 1000 letech), vždy jeden den června až srpna', () => {
    let years = 0;
    for (let i = 0; i < 2000; i++) {
      const year = 500 + (i % 1000);
      const hail = yearSchedule(99 + Math.floor(i / 1000), year).hail;
      if (!hail) continue;
      years++;
      const date = dateOfDayIndex(hail.day);
      expect(date.year).toBe(year);
      expect(date.month).toBeGreaterThanOrEqual(6);
      expect(date.month).toBeLessThanOrEqual(8);
      expect(Math.abs(hail.offsetM)).toBeLessThanOrEqual(HAIL.offsetM);
    }
    expect(years / 2000).toBeGreaterThan(0.045);
    expect(years / 2000).toBeLessThan(0.075);
  });

  it('dvě vsi téže mapy mají jiné kroupy (seed vsi), rozpis je stálý', () => {
    const hailYears = (seed: number): number[] =>
      Array.from({ length: 300 }, (_, i) => 500 + i).filter((y) => yearSchedule(seed, y).hail);
    expect(hailYears(1)).not.toEqual(hailYears(2));
    expect(yearSchedule(1, 777)).toEqual(yearSchedule(1, 777));
  });
});

describe('pruh', () => {
  it('vnitřek 200 m, okraje 50 m z každé strany, posun kolmo ke směru', () => {
    const strip = { x: 0, z: 0, angle: 0, offsetM: 0 };
    expect(hailZone(strip, 500, 99)).toBe('core');
    expect(hailZone(strip, -500, -120)).toBe('edge');
    expect(hailZone(strip, 0, 151)).toBeNull();
    expect(hailZone({ ...strip, offsetM: 300 }, 0, 300)).toBe('core');
    // pruh napříč (90°): rozhoduje x
    expect(hailZone({ ...strip, angle: Math.PI / 2 }, 0, 900)).toBe('core');
    expect(hailZone({ ...strip, angle: Math.PI / 2 }, 200, 0)).toBeNull();
  });

  it('strom chrání: zeleň 1 → 36 %, zeleň 0 → 60 %, okraj 30 %', () => {
    expect(hailLoss('core', 0.4 * 1)).toBeCloseTo(0.36, 10);
    expect(hailLoss('core', 0)).toBeCloseTo(0.6, 10);
    expect(hailLoss('edge', 0)).toBeCloseTo(0.3, 10);
  });
});

describe('den krupobití', () => {
  it('nesklizené díly v pruhu ztratí podle zeleně, sklizený díl a díl mimo nic', () => {
    const state = village();
    state.disasters = {
      protection: { year: 510, parts: { '1': { green: 1 }, '2': { green: 0 } } },
    };
    forceHail(state, HAIL_DAY);
    const event = hailDay(state, HAIL_DAY, null);
    expect(event).toMatchObject({ kind: 'hail', partIds: [1, 2] });
    const hail = state.disasters?.losses?.hail ?? {};
    expect(hail['1']).toBeCloseTo(0.36, 10);
    expect(hail['2']).toBeCloseTo(0.3, 10);
    expect(hail['3']).toBeUndefined();
    expect(hail['4']).toBeUndefined();
    // sklizeň téhož roku: kroupy se sloučí se škodou zvěře, jiný rok sklizně nic (bez počasí kraje)
    delete state.weatherSeed;
    const losses = dayPartLosses(state, at(510, 8, 31), 'spring', [1, 3], { '1': { share: 0.5 } });
    expect(losses?.['1']?.share).toBeCloseTo(1 - 0.5 * 0.64, 10);
    expect(losses?.['3']?.share).toBeCloseTo(0, 10);
    expect(dayPartLosses(state, at(511, 8, 31), 'spring', [1], undefined)).toBeUndefined();
  });

  it('střechy v pruhu zchátrají o rok, louka a sad ztratí', () => {
    const state = village();
    const dwelling = state.dwellings[0]!;
    const mowing: HayMowing = {
      partIds: [],
      squares: [{ cell: cellAtZ(64), areaM2: 225, distanceM: 50 }],
      required: 10,
      done: 0,
      yieldKg: 300,
    } as unknown as HayMowing;
    state.hay = { kg: 0, mowing } as VillageState['hay'];
    state.orchards = [
      {
        id: 1,
        squares: [{ cell: cellAtZ(64), areaM2: 225, distanceM: 50, plantedDay: at(500, 3, 1) }],
      },
    ] as unknown as VillageState['orchards'];
    const day = at(510, 6, 10);
    forceHail(state, day);
    const event = hailDay(state, day, null);
    expect(dwelling.condition).toBeCloseTo(1 - 1 / DWELLINGS[dwelling.type].emptyLifespanYears);
    expect(event).toMatchObject({ dwellingIds: [dwelling.id] });
    // přirozená louka bez ochrany dílu: typická zeleň 0,25 → 0,6 × 0,9
    expect(mowing.hailFactor).toBeCloseTo(1 - 0.54, 10);
    expect(applesAfterHail(state, at(510, 9, 1))).toBeCloseTo(0.6, 10);
    expect(applesAfterHail(state, at(511, 9, 1))).toBe(1);
  });

  it('kroupy prázdnou stavbu nezboří a sad se páruje se čtverci podle pořadí', () => {
    const state = village();
    const dwelling = state.dwellings[0]!;
    dwelling.condition = 0.1;
    const day = at(510, 6, 10);
    state.orchards = [
      {
        id: 1,
        squares: [{ cell: cellAtZ(75), areaM2: 225, distanceM: 50, plantedDay: at(500, 3, 1) }],
      },
      {
        id: 2,
        squares: [{ cell: cellAtZ(64), areaM2: 225, distanceM: 50, plantedDay: at(509, 3, 1) }],
      },
    ] as unknown as VillageState['orchards'];
    forceHail(state, day);
    hailDay(state, day, null);
    expect(dwelling.condition).toBeCloseTo(HAIL.roofMinCondition, 10);
    // v pruhu je jen druhý sad (jiná úroda než první) – ztráta je jeho podíl z celku
    const [a, b] = (state.orchards ?? []).map((o) => squareExpectedYieldKg(o.squares[0]!, day));
    expect(a).not.toBeCloseTo(b!, 6);
    expect(applesAfterHail(state, at(510, 9, 1))).toBeCloseTo(1 - (b! * 0.4) / (a! + b!), 6);
  });

  it('ves bez počasí kraje kroupy nemá, vynucené ano', () => {
    const state = village();
    delete state.weatherSeed;
    for (let day = at(510, 6, 1); day <= at(530, 8, 31); day++) {
      expect(hailDay(state, day, null)).toBeNull();
    }
    forceHail(state, HAIL_DAY);
    expect(hailDay(state, HAIL_DAY, null)).not.toBeNull();
  });

  it('záznam krupobití se smaže až v dalším roce (pruh i jablka do konce roku)', () => {
    const state = village();
    forceHail(state, HAIL_DAY);
    hailDay(state, HAIL_DAY, null);
    hailDay(state, at(510, 12, 31), null);
    expect(state.disasters?.hail).toBeDefined();
    hailDay(state, at(511, 1, 1), null);
    expect(state.disasters?.hail).toBeUndefined();
  });

  it('požár v rámci místních pohrom dál funguje', () => {
    const state = village();
    state.disasters = { override: { fire: { [HAIL_DAY]: state.dwellings[0]!.id } } };
    const events = localDisastersDay(state, HAIL_DAY, null, null);
    expect(events.map((e) => e.kind)).toEqual(['fire']);
    expect(state.disasters.fireFight?.day).toBe(HAIL_DAY);
  });

  it('po kouscích přes den krupobití dopadne stejně', () => {
    const make = (): VillageState => {
      const state = village();
      forceHail(state, HAIL_DAY);
      state.lastDay = HAIL_DAY - 10;
      return state;
    };
    const end = HAIL_DAY + 10;
    const whole = advanceVillage(make(), end, null);
    let chunked = make();
    for (let day = chunked.lastDay; day < end;) {
      day = Math.min(end, day + 3);
      chunked = advanceVillage(chunked, day, null);
    }
    const hails = (s: VillageState): unknown[] => s.chronicle.filter((e) => e.kind === 'hail');
    expect(hails(whole)).toHaveLength(1);
    expect(hails(chunked)).toEqual(hails(whole));
    expect(chunked.disasters).toEqual(whole.disasters);
    expect(chunked.dwellings).toEqual(whole.dwellings);
  });
});
