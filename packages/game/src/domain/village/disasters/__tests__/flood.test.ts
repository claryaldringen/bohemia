import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { packObstacles, type Landscape, type Surface } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { dayPartLosses } from '../disasters';
import { endOfSeason } from '../../fields/fields';
import { floodBand, floodDay, floodToday, meanPartDepths } from '../flood';
import { grainPitSites } from '../../fields/grain-pit-site';
import { localDisastersDay } from '../local-disasters';
import { heightAboveStreamAt } from '../part-protection';
import { FLOOD, FLOOD_WATER } from '../../rules/rules-disasters';
import { advanceVillage } from '../../core/simulate';
import type {
  Dwelling,
  DwellingType,
  FarmSeason,
  FieldPart,
  FloodLevel,
  GrainPit,
  RegionFlood,
  SeasonCrop,
  VillageState,
} from '../../types';
import { yearWeather } from '../weather';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Povodeň potoka (disasters.md – Povodeň potoka): četnosti stupňů, hloubka podle terénu, škody na
// úrodě, loukách, stavbách a jamách, naplavenina, úmrtí od pětisetleté vody, dvě vsi téže mapy,
// ochrana nové vsi, dopočet po kouscích a ves bez počasí.

const SIZE = 128;
const CELL = 15;
const HALF = (SIZE * CELL) / 2;
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const centerX = (tx: number): number => -HALF + (tx + 0.5) * CELL;
const centerZ = (ty: number): number => -HALF + (ty + 0.5) * CELL;
const FOUNDED = at(500, 9, 2);
const FLOOD_DAY = at(510, 7, 10);

/**
 * Potok ve sloupci 56; východně od něj políčka 0,2 / 1,0 / 1,7 / 2,6 / 3,2 m nad potokem
 * (sloupce 57–61), dál i západně 10 m. Stoletá voda (2 m) zatopí sloupec 57 do 1,8 m, 58 do 1 m
 * a 59 do 0,3 m.
 */
const RISE = [0, 0.2, 1, 1.7, 2.6, 3.2];
const STREAM_X = 56;
const landscape: Landscape = makeLandscape({
  size: SIZE,
  surface: (x): Surface => (x === STREAM_X ? 'water' : 'meadow'),
  height: (x) => (x < STREAM_X ? 10 : (RISE[x - STREAM_X] ?? 10)),
});

function part(id: number, tx: number, ty = 64): FieldPart {
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
    cell: { x: tx, y: ty },
  };
}

function crop(name: SeasonCrop['crop'], partIds: number[], harvestedKg: number | null): SeasonCrop {
  const tasks = { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
  return { crop: name, partIds, required: tasks, done: { ...tasks }, harvestedKg };
}

/** Obydlí vsi: hlavní (všichni lidé) ve sloupci `homeX`, další podle `extra`. */
function village(
  seed = 7,
  founded = FOUNDED,
  homeX = 64,
  extra: { id: number; tx: number; type: DwellingType }[] = [],
): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed, day: founded, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const first = base.dwellings[0]!;
  const at = (tx: number) => ({ x: centerX(tx), z: centerZ(64), rotation: 0 });
  base.dwellings = [
    { ...first, position: at(homeX), condition: 1 },
    ...extra.map((e): Dwelling => ({
      ...first,
      id: e.id,
      type: e.type,
      position: at(e.tx),
      condition: 1,
    })),
  ];
  base.weatherSeed = 12345;
  return base;
}

function forceFlood(
  state: VillageState,
  level: FloodLevel,
  season: RegionFlood['season'] = 'summer',
  day = FLOOD_DAY,
): void {
  const date = dateOfDayIndex(day);
  const heightM = FLOOD_WATER.levels.find((l) => l.level === level)!.heightM;
  const flood: RegionFlood = { level, heightM, season, month: date.month, day: date.day };
  state.disasters = { ...state.disasters, override: { weather: { [date.year]: { flood } } } };
}

describe('stupně vody', () => {
  it('pásma hloubky – do 0,5 m, 0,5–1,5 m, nad 1,5 m; nezatopené nic', () => {
    expect(floodBand(0)).toBeNull();
    expect(floodBand(-1)).toBeNull();
    expect(floodBand(0.5)?.silt).toBe(0.1);
    expect(floodBand(0.51)?.silt).toBe(0.2);
    expect(floodBand(1.5)?.silt).toBe(0.2);
    expect(floodBand(1.6)?.silt).toBe(0.3);
    expect(floodBand(9)?.zemnice).toBe(1);
  });

  it('10 000 let: stoletá a vyšší voda ≈ 3 % let (posun o stupeň), tisíciletá aspoň 0,1 %', () => {
    const counts = new Map<string, number>();
    for (let y = 0; y < 10_000; y++) {
      const flood = yearWeather(777, 500 + y).flood;
      const key = flood?.level ?? 'none';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const share = (...levels: string[]): number =>
      levels.reduce((sum, l) => sum + (counts.get(l) ?? 0), 0) / 10_000;
    expect(share('hundred', 'twoHundred', 'fiveHundred', 'thousand')).toBeGreaterThan(0.022);
    expect(share('hundred', 'twoHundred', 'fiveHundred', 'thousand')).toBeLessThan(0.038);
    expect(share('fiveHundred', 'thousand')).toBeGreaterThan(0.002);
    expect(share('thousand')).toBeGreaterThanOrEqual(0.001);
    expect(share('none')).toBeLessThan(0.432);
  });
});

describe('škody podle terénu', () => {
  it('výška nad potokem z krajiny – potok 0, svah podle sloupce', () => {
    expect(heightAboveStreamAt(landscape, centerX(56), 0)).toBe(0);
    expect(heightAboveStreamAt(landscape, centerX(58), 0)).toBeCloseTo(1, 5);
    expect(heightAboveStreamAt(landscape, centerX(64), 0)).toBe(10);
  });

  it('letní stoletá voda: úroda ×0 / ×0,3 / ×0,7 podle hloubky, sklizený díl a suchý díl nic', () => {
    const s = village();
    s.parts = [part(1, 57), part(2, 58), part(3, 59), part(4, 60), part(5, 57, 65)];
    s.season = {
      startDay: at(509, 9, 1),
      crops: [crop('spring', [1, 2, 3, 4], null), crop('winter', [5], 1000)],
    } as FarmSeason;
    forceFlood(s, 'hundred');
    const events = floodDay(s, FLOOD_DAY, landscape);
    const flood = s.disasters?.losses?.flood ?? {};
    expect(flood['1']).toBeCloseTo(1, 9);
    expect(flood['2']).toBeCloseTo(0.7, 9);
    expect(flood['3']).toBeCloseTo(0.3, 9);
    expect(flood['4']).toBeUndefined();
    expect(flood['5']).toBeUndefined();
    expect(events[0]).toMatchObject({ kind: 'flood', level: 'hundred', heightM: 2 });
    expect(events[0]).toMatchObject({ partIds: [1, 2, 3, 5] });
    expect(s.disasters?.flood).toEqual({ day: FLOOD_DAY, level: 'hundred', heightM: 2 });
    // sklizeň: ztráta povodně se sloučí se škodou zvěře (léto bez počasí, ať čísla sedí)
    s.weatherSeed = undefined;
    const losses = dayPartLosses(s, at(510, 8, 1), 'spring', [2, 4], { '2': { share: 0.5 } });
    expect(losses?.['2']?.share).toBeCloseTo(1 - 0.5 * 0.3, 9);
    expect(losses?.['4']?.share).toBeCloseTo(0, 9);
  });

  it('jarní voda bere jen ozim (×0,2 / ×0,5 / ×0,85), jařiny ne', () => {
    const s = village();
    const day = at(510, 3, 10);
    s.parts = [part(1, 57), part(2, 58), part(3, 59), part(4, 57, 65)];
    s.season = {
      startDay: at(509, 9, 1),
      crops: [crop('winter', [1, 2, 3], null), crop('spring', [4], null)],
    } as FarmSeason;
    forceFlood(s, 'hundred', 'spring', day);
    floodDay(s, day, landscape);
    const flood = s.disasters?.losses?.flood ?? {};
    expect(flood['1']).toBeCloseTo(0.8, 9);
    expect(flood['2']).toBeCloseTo(0.5, 9);
    expect(flood['3']).toBeCloseTo(0.15, 9);
    expect(flood['4']).toBeUndefined();
  });

  it('stavby: −30 % v metru vody, zemnice v hluboké vodě se zřítí, suchá stavba nic', () => {
    const s = village(7, FOUNDED, 64, [
      { id: 901, tx: 57, type: 'zemnice' },
      { id: 902, tx: 58, type: 'polozemnice' },
      { id: 903, tx: 59, type: 'zemnice' },
    ]);
    forceFlood(s, 'hundred');
    const [event] = floodDay(s, FLOOD_DAY, landscape);
    expect(event).toMatchObject({ dwellingIds: [901, 902, 903], collapsedDwellingIds: [901] });
    const byId = new Map(s.dwellings.map((d) => [d.id, d.condition]));
    expect(byId.has(901)).toBe(false);
    expect(byId.get(902)).toBeCloseTo(0.7, 9);
    expect(byId.get(903)).toBeCloseTo(0.7, 9);
    expect(byId.get(s.dwellings[0]!.id)).toBe(1);
    expect((s.ruins ?? []).length).toBeGreaterThan(0);
  });

  it('jámy: do zatopené zateče – zrno −25 %, zásoby s ním; suchá jáma nic', () => {
    const s = village();
    const pit = (id: number, tx: number): GrainPit => ({
      id,
      x: centerX(tx),
      z: centerZ(64),
      capacityKg: 2000,
      grainKg: 1000,
      state: 'sealed',
      dugDay: FOUNDED,
    });
    s.grainPits = [pit(1, 58), pit(2, 64)];
    s.storesKg = 3000;
    forceFlood(s, 'hundred');
    const [event] = floodDay(s, FLOOD_DAY, landscape);
    expect(event).toMatchObject({ kind: 'flood', lostGrainKg: 250 });
    expect(s.grainPits.map((p) => p.grainKg)).toEqual([750, 1000]);
    expect(s.storesKg).toBeCloseTo(2750, 6);
  });
});

describe('naplavenina', () => {
  it('úrodnost +0,3 / +0,2 / +0,1 podle hloubky, strop 130 %; příloh i luštěniny ji nesrazí', () => {
    const s = village();
    s.parts = [part(1, 57), part(2, 58), part(3, 59), part(4, 57, 65), part(5, 64)];
    s.parts[3]!.fertilityShare = 1.25;
    s.parts[2]!.fertilityShare = 0.8;
    forceFlood(s, 'hundred');
    floodDay(s, FLOOD_DAY, landscape);
    const shares = s.parts.map((p) => p.fertilityShare);
    expect(shares[0]).toBeCloseTo(1.3, 9);
    expect(shares[1]).toBeCloseTo(1.2, 9);
    expect(shares[2]).toBeCloseTo(0.9, 9);
    expect(shares[3]).toBeCloseTo(1.3, 9);
    expect(shares[4]).toBe(1);
    // konec roku: příloh i luštěniny úrodnost nad přirozenou nezvednou, ale ani nesrazí na 1
    const fallow: FieldPart = { ...s.parts[0]!, state: 'fallow' };
    endOfSeason(fallow, at(510, 9, 1));
    expect(fallow.fertilityShare).toBeCloseTo(1.3, 9);
    const legume: FieldPart = { ...s.parts[1]!, crop: 'legume' };
    endOfSeason(legume, at(510, 9, 1));
    expect(legume.fertilityShare).toBeCloseTo(1.2, 9);
    const low: FieldPart = { ...s.parts[2]!, state: 'fallow' };
    endOfSeason(low, at(510, 9, 1));
    expect(low.fertilityShare).toBeGreaterThan(0.9);
    expect(low.fertilityShare).toBeLessThanOrEqual(1);
  });

  it('nová jáma se nekope níž než dvacetiletá voda (1,2 m nad potokem)', () => {
    const empty = packObstacles([], SIZE, CELL);
    const s = village(7, FOUNDED, 57);
    const [site] = grainPitSites(s, FLOOD_DAY, landscape, empty);
    expect(site).not.toBeNull();
    expect(heightAboveStreamAt(landscape, site!.x, site!.z)).toBeGreaterThanOrEqual(
      FLOOD.pitMinHeightM,
    );
    // ves bez počasí kraje (testy, kalibrace) beze změny – jáma smí i níž
    const plain = { ...village(7, FOUNDED, 57), weatherSeed: undefined };
    const [low] = grainPitSites(plain, FLOOD_DAY, landscape, empty);
    expect(heightAboveStreamAt(landscape, low!.x, low!.z)).toBeLessThan(FLOOD.pitMinHeightM);
  });
});

describe('úmrtí', () => {
  /** Ves s lidmi v zatopeném obydlí (sloupec 58); vrátí úmrtí a počet obyvatel. */
  function drown(seed: number, level: FloodLevel): { deaths: number; people: number } {
    const s = village(seed, FOUNDED, 58);
    const people = s.people.length;
    forceFlood(s, level);
    const events = floodDay(s, FLOOD_DAY, landscape);
    const deaths = events.filter((e) => e.kind === 'death' && e.cause === 'flood').length;
    expect(s.people.length).toBe(people - deaths);
    return { deaths, people };
  }

  it('stoletá a dvousetletá voda nezabíjí', () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(drown(seed, 'hundred').deaths).toBe(0);
      expect(drown(seed, 'twoHundred').deaths).toBe(0);
    }
  });

  it('od pětisetleté vody zemře obyvatel zatopeného obydlí s šancí ≈ 2 %', () => {
    let deaths = 0;
    let people = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = drown(seed, seed % 2 === 0 ? 'fiveHundred' : 'thousand');
      deaths += r.deaths;
      people += r.people;
    }
    expect(people).toBeGreaterThan(1500);
    expect(deaths / people).toBeGreaterThan(0.01);
    expect(deaths / people).toBeLessThan(0.03);
  });
});

describe('kraj, ochrana a determinismus', () => {
  it('dvě vsi téže mapy: stejná voda týž den, škody podle políček každé vsi', () => {
    let year = 510;
    while ((yearWeather(12345, year).flood?.heightM ?? 0) < 1.2) year++;
    const flood = yearWeather(12345, year).flood!;
    const day = at(year, flood.month, flood.day);
    const low = village(7);
    low.parts = [part(1, 57)];
    const high = village(8);
    high.parts = [part(1, 62)];
    expect(floodToday(low, day)).toEqual(floodToday(high, day));
    expect(floodToday(low, day)?.heightM).toBeGreaterThanOrEqual(1.2);
    const lowEvents = localDisastersDay(low, day, landscape, null);
    const highEvents = localDisastersDay(high, day, landscape, null);
    expect(lowEvents.find((e) => e.kind === 'flood')).toMatchObject({ partIds: [1] });
    expect(highEvents.some((e) => e.kind === 'flood')).toBe(false);
    expect(low.parts[0]!.fertilityShare).toBeGreaterThan(1);
    expect(high.parts[0]!.fertilityShare).toBe(1);
  });

  it('nová ves (5 let) nic z rozpisu, vynucená voda ochranu přebije; bez krajiny nic', () => {
    const young = village(7, at(507, 9, 2));
    young.parts = [part(1, 57)];
    forceFlood(young, 'thousand');
    const events = floodDay(young, FLOOD_DAY, landscape);
    expect(events[0]).toMatchObject({ kind: 'flood', level: 'thousand' });
    expect(young.disasters?.losses?.flood).toBeUndefined(); // bez sezóny není co ztratit
    expect(young.disasters?.flood?.day).toBe(FLOOD_DAY);
    const natural = village(7, at(507, 9, 2));
    natural.parts = [part(1, 57)];
    expect(floodDay(natural, FLOOD_DAY, landscape)).toEqual([]);
    const flat = village();
    flat.parts = [part(1, 57)];
    forceFlood(flat, 'thousand');
    expect(floodDay(flat, FLOOD_DAY, null)).toEqual([]);
  });

  it('záznam povodně se smaže po dnech bahna, dřív zůstává (i po opadnutí vody)', () => {
    const s = village();
    s.parts = [part(1, 57)];
    forceFlood(s, 'hundred');
    floodDay(s, FLOOD_DAY, landscape);
    expect(s.disasters?.flood).toBeDefined();
    floodDay(s, FLOOD_DAY + FLOOD.standDays + 1, landscape);
    expect(s.disasters?.flood).toBeDefined();
    floodDay(s, FLOOD_DAY + FLOOD.mudDays, landscape);
    expect(s.disasters?.flood).toBeDefined();
    floodDay(s, FLOOD_DAY + FLOOD.mudDays + 1, landscape);
    expect(s.disasters?.flood).toBeUndefined();
  });

  it('hloubka dílu je průměr přes čtverce, nezatopené počítají 0', () => {
    const depths = meanPartDepths([
      { partId: 1, depth: 2 },
      { partId: 1, depth: -1 },
      { partId: 1, depth: 0 },
      { partId: 1, depth: 1 },
      { partId: 2, depth: -3 },
    ]);
    expect(depths.get(1)).toBeCloseTo(0.75, 9);
    expect(depths.has(2)).toBe(false);
  });

  it('ves bez seedu počasí nemá vodu – beze změny', () => {
    const s = { ...village(), weatherSeed: undefined };
    s.parts = [part(1, 57)];
    const before = structuredClone(s);
    for (let day = at(510, 1, 1); day < at(512, 1, 1); day++) {
      expect(floodDay(s, day, landscape)).toEqual([]);
    }
    expect(s).toEqual(before);
  });

  it('vcelku = po kouscích přes den povodně', () => {
    const start = at(510, 7, 1);
    const end = at(510, 7, 12);
    const make = (): VillageState => {
      const s = village(7, FOUNDED, 64, [{ id: 902, tx: 58, type: 'polozemnice' }]);
      s.parts = [part(1, 57), part(2, 58), part(3, 64)];
      forceFlood(s, 'hundred');
      return { ...s, lastDay: start };
    };
    const whole = advanceVillage(make(), end, null, landscape);
    let chunked = make();
    while (chunked.lastDay < end) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + 3), null, landscape);
    }
    expect(whole.disasters?.flood?.day).toBe(FLOOD_DAY);
    expect(whole.chronicle.some((e) => e.kind === 'flood')).toBe(true);
    expect(chunked.disasters).toEqual(whole.disasters);
    expect(chunked.parts).toEqual(whole.parts);
    expect(chunked.dwellings).toEqual(whole.dwellings);
    expect(chunked.chronicle).toEqual(whole.chronicle);
  });
});
