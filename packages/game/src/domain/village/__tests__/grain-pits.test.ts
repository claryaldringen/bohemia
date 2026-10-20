import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { eatDiet } from '../diet';
import {
  addThreshedGrain,
  currentGrainPits,
  drawGrainPits,
  grainInPitsKg,
  grainPitTask,
  grainStoresKeep,
  looseGrainKg,
  moveGrainFromPits,
  openGrainPits,
  settleGrainPits,
  workGrainPits,
} from '../grain-pits';
import {
  chooseGrainPitSite,
  coveredGrainPitIds,
  grainPitSites,
  withGrainPits,
  withoutBuiltOverGrainPits,
} from '../grain-pit-site';
import { laborDay } from '../labor-report';
import { HUMNO, GRAIN_PITS } from '../rules';
import { advanceVillage } from '../simulate';
import { threshingFloorFootprint } from '../threshing-floors';
import { pointInPolygon } from '../polygon';
import type { GrainPit, RoadProfilePoint, VillageRoads, VillageState } from '../types';
import { neighbourSnapshot } from '../neighbourhood';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling, withThreshingFloor } from './village-fixtures';

// Obilné jámy (production-chains.md – Obilné jámy): vesničané po výmlatu vykopou jámy, naplní je
// zrnem a zapečetí; během roku otvírají jednu jámu po druhé. Zásoba obilí `storesKg` zůstává celá
// (jámy + zrno mimo ně), v zapečetěné jámě ubývá méně. Prázdná jáma se znovu naplní, stavba na
// zavřené jámě zrno přendá bez ztráty.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const HOME = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];
const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
const village = (day: number, withField = true): VillageState =>
  foundVillage({
    seed: 42,
    day,
    dwellingPosition: HOME,
    ...(withField ? { firstField: { outline: OUTLINE, parts: field() } } : {}),
  });
/** Den, kdy testovací jámy vykopali (rok před testy). */
const DUG = at(599, 9, 1);
const pit = (
  id: number,
  grainKg: number,
  state: GrainPit['state'],
  filledDay = DUG + 10,
): GrainPit => ({
  id,
  x: 20 + id,
  z: 0,
  capacityKg: GRAIN_PITS.capacityKg,
  grainKg,
  state,
  dugDay: DUG,
  ...(state === 'empty' ? {} : { filledDay }),
});
/** Pevné cesty vsi s jednou rozestavěnou vozovou cestou (zemní práce) po ose `profile`. */
function roadsWith(profile: RoadProfilePoint[]): VillageRoads {
  return {
    nextId: 1,
    roads: [],
    trees: [],
    candidates: [],
    labor: { from: 0, days: 0, shares: [] },
    earthworks: [
      {
        id: 900,
        profile,
        pieces: [{ toM: 200, manDays: 100, builtDay: null }],
        startedDay: 0,
        constructionId: 900,
      },
    ],
  };
}
/** Ves uložená před jamami (převod – `withGrainPits`). */
const oldVillage = (day: number, withField = true): VillageState => {
  const s = village(day, withField);
  delete s.grainPits;
  return s;
};
/** Ves s jamami a zásobou (bez simulace) – den `day` je poslední odsimulovaný. */
function withPits(day: number, pits: GrainPit[], looseKg = 0): VillageState {
  const s = village(day);
  s.lastDay = day;
  s.grainPits = pits.map((p) => ({ ...p }));
  s.storesKg = grainInPitsKg(pits) + looseKg;
  return s;
}

describe('jámy po výmlatu', () => {
  it('vymlácené zrno čeká na humně; v době plnění se po plných jamách uloží, zásoby se nemění', () => {
    const day = at(600, 8, 20);
    const s = withPits(day, []);
    s.storesKg = 500;
    // výmlat přidá do zásob 3 500 kg – čekají na uložení do jam
    s.storesKg += 3500;
    addThreshedGrain(s, 3500);
    expect(s.grainPitWork).toEqual({ queueKg: 3500, manDays: 0 });
    // ještě se mlátí – dvě plné jámy, zbytek 500 kg počká na konec výmlatu
    const full = GRAIN_PITS.digManDays + GRAIN_PITS.fillManDays;
    expect(grainPitTask(s, day, true)).toBeCloseTo(2 * full, 9);
    let id = 0;
    const work = workGrainPits(s, day, 2 * full, true, () => ({ x: 30 + 3 * id++, z: 5 }));
    expect(work?.pit).toMatchObject({ x: 30, z: 5 });
    expect(s.grainPits!.map((p) => [p.state, p.grainKg])).toEqual([
      ['sealed', 1500],
      ['sealed', 1500],
    ]);
    expect(s.storesKg).toBe(4000);
    expect(grainInPitsKg(s.grainPits) + looseGrainKg(s)).toBe(s.storesKg);
    expect(s.grainPitWork!.queueKg).toBeCloseTo(500, 9);
    // po výmlatu jde do jámy i neúplná dávka (aspoň GRAIN_PITS.minFillKg)
    expect(grainPitTask(s, day, false)).toBeCloseTo(full, 9);
    workGrainPits(s, day, full, false, () => ({ x: 40, z: 5 }));
    expect(s.grainPits!.map((p) => p.grainKg)).toEqual([1500, 1500, 500]);
    expect(looseGrainKg(s)).toBeCloseTo(500, 9);
    expect(grainPitTask(s, day, false)).toBe(0);
  });

  it('menší zbytek než GRAIN_PITS.minFillKg zůstane doma; mimo dobu plnění se jámy neplní', () => {
    const s = withPits(at(600, 9, 10), []);
    s.storesKg = GRAIN_PITS.minFillKg - 1;
    addThreshedGrain(s, GRAIN_PITS.minFillKg - 1);
    expect(grainPitTask(s, at(600, 9, 10), false)).toBe(0);
    s.storesKg = 2000;
    addThreshedGrain(s, 1000);
    expect(grainPitTask(s, at(600, 12, 1), false)).toBe(0);
    expect(grainPitTask(s, at(600, 7, 31), false)).toBe(0);
    expect(grainPitTask(s, at(600, 11, 30), true)).toBeGreaterThan(0);
  });

  it('práce se střádá – jáma je hotová, až na ni práce stačí; místo nové jámy se drží', () => {
    const day = at(600, 8, 25);
    const s = withPits(day, []);
    s.storesKg = 1500;
    addThreshedGrain(s, 1500);
    let picks = 0;
    const site = (): { x: number; z: number } => ({ x: 10 + picks++, z: 0 });
    const first = workGrainPits(s, day, 1, true, site);
    expect(s.grainPits).toEqual([]);
    expect(s.grainPitWork!.site).toMatchObject({ x: 10, z: 0 });
    expect(first?.pit).toEqual(s.grainPitWork!.site);
    workGrainPits(s, day, 1, true, site);
    expect(picks).toBe(1);
    workGrainPits(s, day, GRAIN_PITS.digManDays + GRAIN_PITS.fillManDays - 2, true, site);
    expect(s.grainPits).toEqual([
      expect.objectContaining({ id: first!.pit.id, x: 10, grainKg: 1500, state: 'sealed' }),
    ]);
    expect(s.grainPitWork!.site).toBeUndefined();
    expect(s.grainPitWork!.manDays).toBe(0);
  });

  it('ves s humnem po žni vykope jámy a uloží do nich zrno; zásoby = jámy + zrno mimo ně', () => {
    // první sklizeň vsi založené v březnu je malá – jámy po druhé
    let s = advanceVillage(withThreshingFloor(village(at(600, 3, 1))), at(601, 7, 31), null);
    const activities = new Set<string>();
    for (let day = at(601, 8, 1); day <= at(601, 11, 30); day++) {
      s = advanceVillage(s, day, null);
      for (const share of s.labor?.shares ?? []) {
        if (share.activity === 'grain-pit') activities.add(share.target.kind);
      }
      expect(grainInPitsKg(s.grainPits) + looseGrainKg(s)).toBeCloseTo(s.storesKg, 6);
      expect(s.grainPits!.filter((p) => p.state === 'open').length).toBeLessThanOrEqual(1);
      // do žně jaře jen plné jámy – neúplná počká na zrno jaře
      if (day <= at(601, 8, 31)) {
        for (const p of s.grainPits!.filter((q) => q.state === 'sealed')) {
          expect(p.grainKg).toBeGreaterThan(p.capacityKg * 0.99);
        }
      }
    }
    expect(activities).toEqual(new Set(['grain-pit']));
    expect(s.grainPits!.length).toBeGreaterThan(0);
    expect(grainInPitsKg(s.grainPits)).toBeGreaterThan(0);
    // vymlácené zrno je uložené (zbytek pod GRAIN_PITS.minFillKg zůstane doma)
    expect(s.grainPitWork?.queueKg ?? 0).toBeLessThan(GRAIN_PITS.minFillKg);
  }, 120_000);

  it('ves bez výmlatu jámy nekope – zásoby osadníků leží doma', () => {
    const s = advanceVillage(village(at(600, 3, 1), false), at(601, 2, 1), null);
    expect(s.grainPits).toEqual([]);
    expect(s.grainPitWork).toBeUndefined();
  });
});

describe('jedna otevřená jáma', () => {
  it('ubude-li víc zásob, než je zrna mimo jámy, otevře se jáma zapečetěná nejdéle', () => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed', 300), pit(2, 1500, 'sealed', 200)]);
    s.storesKg -= 200;
    drawGrainPits(s);
    expect(s.grainPits!.map((p) => [p.id, p.state, p.grainKg])).toEqual([
      [1, 'sealed', 1500],
      [2, 'open', 1300],
    ]);
    // jí se z otevřené – druhá zůstane zapečetěná, dokud se otevřená nevyprázdní
    s.storesKg -= 1500;
    drawGrainPits(s);
    expect(s.grainPits!.map((p) => [p.id, p.state, p.grainKg])).toEqual([
      [1, 'open', 1300],
      [2, 'empty', 0],
    ]);
    expect(openGrainPits(s).map((p) => p.id)).toEqual([1]);
  });

  it('zrno mimo jámy se jí napřed; pohled ukáže jámy po odběru i před dalším dnem', () => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed')], 300);
    s.storesKg -= 200;
    drawGrainPits(s);
    expect(s.grainPits![0]!.state).toBe('sealed');
    // akce hráče (prodej) ubere zásoby – pohled odebere z jámy jako simulace, stav se nemění
    s.storesKg -= 400;
    expect(currentGrainPits(s)).toEqual([
      expect.objectContaining({ state: 'open', grainKg: 1200 }),
    ]);
    expect(s.grainPits![0]!.state).toBe('sealed');
  });

  it('za rok simulace je otevřená nejvýš jedna jáma a zrno se jí z jam', () => {
    let s = withGrainPits(oldVillage(at(600, 3, 1), false), null);
    expect(s.grainPits!.filter((p) => p.state === 'open')).toHaveLength(1);
    const before = s.storesKg;
    for (let day = at(600, 3, 1); day <= at(601, 2, 28); day += 7) {
      s = advanceVillage(s, day, null);
      expect(s.grainPits!.filter((p) => p.state === 'open').length).toBeLessThanOrEqual(1);
      expect(grainInPitsKg(s.grainPits)).toBeCloseTo(s.storesKg, 6);
    }
    expect(s.storesKg).toBeLessThan(before);
  }, 120_000);
});

describe('ztráty v zapečetěné jámě', () => {
  it('zapečetěné zrno ubývá GRAIN_PITS.sealedLossPerYear, ostatní jako dosud', () => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed'), pit(2, 500, 'open')], 0);
    const keep = grainStoresKeep(s, 0)!;
    const sealed = (1 - GRAIN_PITS.sealedLossPerYear) ** (1 / 365);
    const open = (1 - 0.1) ** (1 / 365);
    expect(keep).toBeCloseTo((1500 * sealed + 500 * open) / 2000, 12);
    // bez zapečetěného zrna jídlo počítá ztrátu jako dřív
    expect(grainStoresKeep(withPits(at(600, 12, 1), [pit(2, 500, 'open')]), 0)).toBeUndefined();
    // jídlo dne s jamami ubere méně zásob než bez nich
    const meal = (keepPerDay?: number): number =>
      eatDiet({
        grainKg: 2000,
        ...(keepPerDay === undefined ? {} : { grainKeepPerDay: keepPerDay }),
        meatKg: 0,
        fruitKg: 0,
        needPerDay: 10,
        daysToHarvest: 100,
        daysToRot: 0,
        daysToMeatEnd: 1,
        potteryCoverage: 0,
      }).grainKg;
    expect(meal(keep)).toBeGreaterThan(meal());
    // po jídle dne jámy ztratí totéž – zásoby pořád sedí se součtem jam
    s.storesKg = meal(keep);
    settleGrainPits(s, at(600, 12, 1), 0);
    expect(grainInPitsKg(s.grainPits)).toBeCloseTo(s.storesKg, 9);
    expect(s.grainPits![0]!.grainKg).toBeCloseTo(1500 * sealed, 9);
  });

  it('ves se zásobami v jamách má po roce víc obilí než ves bez jam', () => {
    const start = oldVillage(at(600, 3, 1), false);
    start.storesKg = 6000;
    const plain = advanceVillage(start, at(600, 12, 31), null);
    const pits = advanceVillage(withGrainPits(start, null), at(600, 12, 31), null);
    expect(plain.storesKg).toBeGreaterThan(0);
    expect(pits.storesKg).toBeGreaterThan(plain.storesKg);
  }, 120_000);
});

describe('prázdná jáma se použije znovu, dosloužilá se zasype', () => {
  it('dávka jde napřed do prázdné jámy – jen naplnit a zapečetit', () => {
    const day = at(600, 9, 15);
    const s = withPits(day, [pit(1, 0, 'empty')]);
    s.storesKg = 1500;
    addThreshedGrain(s, 1500);
    expect(grainPitTask(s, day, false)).toBeCloseTo(GRAIN_PITS.fillManDays, 9);
    workGrainPits(s, day, GRAIN_PITS.fillManDays, false, () => {
      throw new Error('nová jáma se nekope');
    });
    expect(s.grainPits).toEqual([
      expect.objectContaining({ id: 1, grainKg: 1500, state: 'sealed', filledDay: day }),
    ]);
  });

  it('prázdná jáma po GRAIN_PITS.lifeYears se zasype a kope se nová', () => {
    const day = at(600, 9, 15);
    const old = { ...pit(1, 0, 'empty'), dugDay: day - GRAIN_PITS.lifeYears * 365 };
    const s = withPits(day, [old]);
    s.storesKg = 1500;
    addThreshedGrain(s, 1500);
    expect(grainPitTask(s, day, false)).toBeCloseTo(
      GRAIN_PITS.digManDays + GRAIN_PITS.fillManDays,
      9,
    );
    settleGrainPits(s, day, 0);
    expect(s.grainPits).toEqual([]);
  });
});

describe('stavba na zavřené jámě', () => {
  it('zrno se přendá do prázdné jámy bez ztráty, jáma zmizí', () => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed'), pit(2, 0, 'empty')]);
    const stores = s.storesKg;
    moveGrainFromPits(s, at(600, 12, 1), new Set([1]));
    expect(s.grainPits).toEqual([
      expect.objectContaining({ id: 2, grainKg: 1500, state: 'sealed' }),
    ]);
    expect(s.storesKg).toBe(stores);
  });

  it('bez prázdné jámy jde zrno domů – zásoby se nemění, jí se napřed', () => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed'), pit(2, 800, 'sealed')]);
    moveGrainFromPits(s, at(600, 12, 1), new Set([1]));
    expect(s.grainPits!.map((p) => p.id)).toEqual([2]);
    expect(s.storesKg).toBe(2300);
    expect(looseGrainKg(s)).toBe(1500);
  });

  it('po akci hráče: obydlí přes zapečetěnou jámu – jáma zmizí, zrno se přendá', () => {
    const landscape = makeLandscape();
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed'), pit(2, 0, 'empty')]);
    s.grainPits![0]!.x = 60;
    s.grainPits![0]!.z = 60;
    expect(withoutBuiltOverGrainPits(s, landscape)).toBe(s);
    const built: VillageState = {
      ...s,
      dwellings: [
        ...s.dwellings,
        {
          id: 999,
          type: 'zemnice',
          position: { x: 60, z: 60, rotation: 0 },
          builtDay: at(600, 11, 1),
          condition: 1,
        } as VillageState['dwellings'][number],
      ],
    };
    expect(coveredGrainPitIds(built, landscape)).toEqual(new Set([1]));
    const next = withoutBuiltOverGrainPits(built, landscape);
    expect(next.grainPits).toEqual([expect.objectContaining({ id: 2, grainKg: 1500 })]);
    expect(next.storesKg).toBe(built.storesKg);
    // vstup se nemění
    expect(built.grainPits).toHaveLength(2);
  });
});

describe('místo jámy', () => {
  const landscape = makeLandscape({
    // voda na políčku východně od humna
    surface: (x, y) => (x === 10 && y === 8 ? 'water' : 'meadow'),
  });
  const floor = { x: 20, z: 7.5, rotation: 0 };
  const withFloor = (): VillageState => {
    const s = village(at(600, 3, 1));
    s.threshingFloors = [{ id: 70_000, position: floor, builtDay: at(600, 4, 1) }];
    s.grainPits = [];
    return s;
  };

  /** Místa jam – všechna nalezená. */
  const found = (sites: ({ x: number; z: number } | null)[]): { x: number; z: number }[] =>
    sites.map((p) => {
      expect(p).not.toBeNull();
      return p!;
    });

  it('u humna (do GRAIN_PITS.siteM), mimo humno, jeho vstup, pole a vodu, jámy od sebe', () => {
    const s = withFloor();
    const sites = found(grainPitSites(s, at(600, 9, 1), landscape, null, 6));
    const footprint = threshingFloorFootprint(floor);
    for (const p of sites) {
      expect(Math.hypot(p.x - floor.x, p.z - floor.z)).toBeLessThanOrEqual(GRAIN_PITS.siteM);
      expect(pointInPolygon([p.x, p.z], footprint)).toBe(false);
      // vstup na předku (+z) zůstane volný
      expect(Math.hypot(p.x - floor.x, p.z - (floor.z + HUMNO.sizeM.z / 2 + 1))).toBeGreaterThan(4);
      // voda – políčko (10, 8) = x 30–45, z 0–15
      expect(p.x >= 30 && p.x <= 45 && p.z >= 0 && p.z <= 15).toBe(false);
    }
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        expect(
          Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.z - sites[j]!.z),
        ).toBeGreaterThanOrEqual(GRAIN_PITS.spacingM);
      }
    }
    // deterministicky
    expect(grainPitSites(withFloor(), at(600, 9, 1), landscape, null, 6)).toEqual(sites);
    expect(chooseGrainPitSite(s, at(600, 9, 1), landscape)).toEqual(sites[0]);
  });

  it('bez humna u dvorce; bez krajiny řada jam kus od humna', () => {
    const s = village(at(600, 3, 1));
    s.grainPits = [];
    const site = chooseGrainPitSite(s, at(600, 9, 1), landscape)!;
    expect(Math.hypot(site.x - HOME.x, site.z - HOME.z)).toBeLessThanOrEqual(GRAIN_PITS.siteM);
    const flat = grainPitSites(withFloor(), at(600, 9, 1), null, null, 2);
    expect(flat).toEqual([
      { x: floor.x + 12, z: floor.z },
      { x: floor.x + 12 + GRAIN_PITS.spacingM, z: floor.z },
    ]);
  });

  it('mimo zemní práce vozové cesty – pláň i svah úvozu celé plánované osy', () => {
    const before = found(grainPitSites(withFloor(), at(600, 9, 1), landscape, null, 6));
    // osa vozové cesty přes první místo jámy, úvoz 2 m (svah 1 : 1 do 4,75 m od osy), nehotová
    const z = before[0]!.z;
    const s = withFloor();
    s.roads = roadsWith([
      { x: -100, z, y: -2 },
      { x: 100, z, y: -2 },
    ]);
    const sites = found(grainPitSites(s, at(600, 9, 1), landscape, null, 6));
    // jáma s okrajem (2,2 m) ani nezasahuje do svahu úvozu
    for (const p of sites) expect(Math.abs(p.z - z)).toBeGreaterThanOrEqual(4.75 + 2.2 - 0.01);
    expect(before.some((p) => Math.abs(p.z - z) < 6.9)).toBe(true);
  });

  it('mimo stavby a půdu jiné vsi na téže mapě', () => {
    const before = found(grainPitSites(withFloor(), at(600, 9, 1), landscape, null, 6));
    // jiná ves postavila obydlí přímo na prvním místě jámy – celé políčko pod ním je její
    const first = before[0]!;
    const other = withBuiltFirstDwelling(
      foundVillage({
        seed: 7,
        day: at(600, 3, 1),
        dwellingPosition: { x: first.x, z: first.z, rotation: 0 },
      }),
    );
    const s = withFloor();
    s.neighbours = neighbourSnapshot([other], at(600, 9, 1))!;
    const sites = found(grainPitSites(s, at(600, 9, 1), landscape, null, 6));
    const tile = (v: number): number => Math.floor((v + 120) / 15);
    for (const p of sites) {
      // čtverec jámy s okrajem (2,2 m) leží mimo cizí políčko
      const inside =
        tile(p.x - 2.2) <= tile(first.x) &&
        tile(p.x + 2.2) >= tile(first.x) &&
        tile(p.z - 2.2) <= tile(first.z) &&
        tile(p.z + 2.2) >= tile(first.z);
      expect(inside).toBe(false);
    }
  });

  it('bez vhodného místa do 180 m jámu nevykopou – zrno zůstane mimo jámy', () => {
    const forest = makeLandscape({ surface: () => 'forest' });
    const s = withFloor();
    expect(grainPitSites(s, at(600, 9, 1), forest, null, 2)).toEqual([null, null]);
    expect(chooseGrainPitSite(s, at(600, 9, 1), forest)).toBeNull();
    // převod: zásoby zůstanou doma, jámy žádné
    const old = oldVillage(at(600, 3, 1));
    old.storesKg = 3000;
    const converted = withGrainPits(old, forest);
    expect(converted.grainPits).toEqual([]);
    expect(looseGrainKg(converted)).toBe(3000);
  });
});

describe('bez místa pro novou jámu', () => {
  it('letos jen do prázdných jam, zbytek mimo jámy; příští rok se místo hledá znovu', () => {
    const day = at(600, 9, 15);
    const s = withPits(day, [pit(1, 0, 'empty')]);
    s.storesKg = 3000;
    addThreshedGrain(s, 3000);
    let asked = 0;
    const none = (): null => {
      asked++;
      return null;
    };
    expect(grainPitTask(s, day, false, none)).toBeCloseTo(GRAIN_PITS.fillManDays, 9);
    expect(asked).toBe(1);
    expect(s.grainPitWork!.noSiteYear).toBe(600);
    expect(s.grainPitWork!.site).toBeUndefined();
    workGrainPits(s, day, GRAIN_PITS.fillManDays, false, none);
    expect(s.grainPits!.map((p) => [p.id, p.grainKg, p.state])).toEqual([[1, 1500, 'sealed']]);
    expect(looseGrainKg(s)).toBe(1500);
    // letos už nic – místo se nehledá znovu
    expect(grainPitTask(s, day + 1, false, none)).toBe(0);
    expect(asked).toBe(1);
    // příští rok znovu
    const next = at(601, 8, 20);
    expect(grainPitTask(s, next, false, () => ({ x: 9, z: 9 }))).toBeCloseTo(
      GRAIN_PITS.digManDays + GRAIN_PITS.fillManDays,
      9,
    );
    expect(s.grainPitWork!.site).toMatchObject({ x: 9, z: 9 });
  });
});

describe('zemní práce vozové cesty přes jámu', () => {
  const landscape = makeLandscape();
  const sealed = (): VillageState => {
    const s = withPits(at(600, 12, 1), [pit(1, 1500, 'sealed'), pit(2, 0, 'empty')]);
    s.grainPits![0]!.x = 60;
    s.grainPits![0]!.z = 60;
    return s;
  };

  it('pláň nebo svah úvozu přes zavřenou jámu – zrno se přendá jako pod stavbou', () => {
    // pláň přes jámu (bez úpravy výšky)
    const flat = sealed();
    flat.roads = roadsWith([
      { x: 0, z: 61, y: 0 },
      { x: 100, z: 61, y: 0 },
    ]);
    expect(coveredGrainPitIds(flat, landscape)).toEqual(new Set([1]));
    expect(coveredGrainPitIds(flat, null)).toEqual(new Set([1]));
    // osa 4 m vedle: pláň (2,75 m) jámu (1,2 m) mine, úvoz 2 m se svahem ji zasáhne
    const cut = sealed();
    cut.roads = roadsWith([
      { x: 0, z: 64, y: -2 },
      { x: 100, z: 64, y: -2 },
    ]);
    expect(coveredGrainPitIds(cut, landscape)).toEqual(new Set([1]));
    const level = sealed();
    level.roads = roadsWith([
      { x: 0, z: 64, y: 0 },
      { x: 100, z: 64, y: 0 },
    ]);
    expect(coveredGrainPitIds(level, landscape)).toEqual(new Set());
    const next = withoutBuiltOverGrainPits(cut, landscape);
    expect(next.grainPits).toEqual([expect.objectContaining({ id: 2, grainKg: 1500 })]);
    expect(next.storesKg).toBe(cut.storesKg);
  });
});

describe('převod starší vsi', () => {
  it('zásoby jdou do jam u dvorce bez práce – zapečetěné kromě poslední; jednou', () => {
    const old = oldVillage(at(600, 3, 1));
    old.storesKg = 3711.4;
    const next = withGrainPits(old, makeLandscape());
    expect(next).not.toBe(old);
    expect(old.grainPits).toBeUndefined();
    expect(next.storesKg).toBe(3711.4);
    expect(next.grainPits!.map((p) => [p.state, p.grainKg])).toEqual([
      ['sealed', 1500],
      ['sealed', 1500],
      ['open', expect.closeTo(711.4, 9)],
    ]);
    expect(grainInPitsKg(next.grainPits)).toBeCloseTo(next.storesKg, 9);
    expect(next.grainPitWork).toBeUndefined();
    expect(new Set(next.grainPits!.map((p) => p.id)).size).toBe(3);
    expect(next.nextId).toBe(old.nextId + 3);
    for (const p of next.grainPits!) {
      expect(Math.hypot(p.x - HOME.x, p.z - HOME.z)).toBeLessThanOrEqual(GRAIN_PITS.siteM);
    }
    expect(withGrainPits(next, makeLandscape())).toBe(next);
  });
});

describe('práce na jámách v rozdělení práce', () => {
  it('práce dne jde k jámě, do které se ukládá', () => {
    const s = village(at(600, 9, 2));
    const labor = laborDay(s, at(600, 9, 2), {
      allocation: {
        dailyMin: 0,
        eldersDailyMin: 0,
        away: 0,
        carting: 0,
        tasks: {
          reclaim: 0,
          dig: 0,
          sow: 0,
          weed: 0,
          harvest: 0,
          thresh: 0,
          plough: 0,
          mow: 0,
          slaughter: 0,
          'grain-pit': 2,
          'orchard-care': 0,
          'orchard-harvest': 0,
        },
        taskAmounts: [2],
        common: 0,
      },
      repairs: [],
      constructions: [],
      grainPits: { manDays: 2, pit: { id: 77, x: 12, z: 3 } },
    });
    expect(labor.shares).toContainEqual({
      activity: 'grain-pit',
      target: { kind: 'grain-pit', id: 77, x: 12, z: 3 },
      manDays: 2,
    });
  });
});
