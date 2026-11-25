import { describe, expect, it } from 'vitest';
import { generateLandscape, obstaclesOf, tileCenterWorld } from '../../../landscape';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import { migrateVillage, VILLAGE_MIGRATIONS, type VillageMigrationContext } from '../migrations';
import { withoutForeignGoods } from '../../trade/trade';
import { advanceVillage } from '../simulate';
import { createCropWork } from '../year-plan';
import { ploughWorkPerHa } from '../../livestock/plough';
import { villageHorses } from '../../livestock/horses';
import { horsePen } from '../../__tests__/horse-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import type {
  CraftPurchase,
  FieldPart,
  IronTrip,
  PloughWork,
  TradeExpedition,
  VillageState,
} from '../../types';

// Převody starších vsí (village-core.md – Převody starších vsí): jeden seznam pro načtení vsi
// i dopočet – každý převod jednou, převody `loadOnly` jen při načtení.

const landscape = generateLandscape(42);
const obstacles = obstaclesOf(landscape);
const DAY = 400;

function founded(): VillageState {
  const site = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  return foundVillage({
    seed: 7,
    day: DAY,
    dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
    obstacles,
  });
}

const advance: VillageMigrationContext = { obstacles, landscape };
const load: VillageMigrationContext = {
  obstacles,
  landscape,
  load: { today: DAY + 10, weatherSeed: 99, landscape, obstacles },
};

describe('seznam převodů', () => {
  it('id jsou jedinečná a den zavedení je datum', () => {
    const ids = VILLAGE_MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of VILLAGE_MIGRATIONS) expect(m.since).toMatch(/^2026-\d{2}-\d{2}$/);
  });

  it('dopočet přeskočí převody jen pro načtení, načtení je projde', () => {
    const old = founded();
    delete old.livestock?.pensFromDay;
    const advanced = migrateVillage(old, advance);
    expect(advanced.livestock?.pensFromDay).toBeUndefined();
    expect(advanced.weatherSeed).toBeUndefined();
    const loaded = migrateVillage(old, load);
    expect(loaded.livestock?.pensFromDay).toBeDefined();
    expect(loaded.weatherSeed).toBe(99);
  });

  it('podruhé nic nezmění – vrátí týž objekt', () => {
    const once = migrateVillage(founded(), load);
    expect(migrateVillage(once, load)).toBe(once);
    expect(migrateVillage(once, advance)).toBe(once);
  });

  it('vstupní stav nemění', () => {
    const state = founded();
    const before = JSON.stringify(state);
    migrateVillage(state, load);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("postoj 'surrender' se převede na 'flee', podruhé beze změny (war.md – Obránci)", () => {
    const old = founded();
    (old as { defense?: { stance: string } }).defense = { stance: 'surrender' };
    const once = migrateVillage(old, advance);
    expect(once.defense).toEqual({ stance: 'flee' });
    expect(migrateVillage(once, advance)).toBe(once);
    expect((old.defense as { stance: string }).stance).toBe('surrender');
    const kept = founded();
    kept.defense = { stance: 'defend' };
    expect(migrateVillage(kept, advance).defense).toEqual({ stance: 'defend' });
    expect(migrateVillage(founded(), advance).defense).toBeUndefined();
  });

  it('nová ves má strop dovedností od založení (war.md – Síla)', () => {
    expect(founded().armsCapped).toBe(true);
  });
});

describe('podíl medu v jídle (`foreign-goods` – trade.md, Jen společné suroviny)', () => {
  /** Ves, která včera jedla med (podíl 0,002 energie). */
  function sweet(): VillageState {
    const s = migrateVillage(founded(), load);
    s.diet = {
      energy: 1,
      protein: 1,
      diversity: 0.9,
      satiation: 0.9,
      shares: { grain: 0.998, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, honey: 0.002 },
    };
    return s;
  }

  it('ves se zbožím (`wares`) jí med z klátů – převod vrátí týž objekt', () => {
    const s = sweet();
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 4, waxKg: 0.3 };
    expect(withoutForeignGoods(s)).toBe(s);
    expect(migrateVillage(s, load)).toBe(s);
  });

  it('ves bez zboží – podíl medu je ze starého zboží zvenku a zmizí', () => {
    const s = sweet();
    const next = withoutForeignGoods(s);
    expect(next.diet!.shares).toEqual({
      grain: 0.998,
      meat: 0,
      dairy: 0,
      eggs: 0,
      fruit: 0,
      legumes: 0,
    });
    expect(s.diet!.shares.honey).toBe(0.002);
  });
});

describe('lov bez kalendáře a lovu navíc (hunting.md – Pravidla 1)', () => {
  it('ze stavu lovu zmizí naděje, lov dne a lov navíc, úlovek roku zůstane; podruhé beze změny', () => {
    const old = migrateVillage(founded(), load);
    const year = { boar: 2, deer: 1, wolves: 0, bear: 0, meatKg: 140, days: 3 };
    const legacy = {
      hope: { boar: 0.4, deer: 0.2, wolf: 0, bear: 0 },
      today: { day: DAY, target: 'game', riders: [], foot: [1], extra: true },
      extraDay: DAY,
      lastExtraDay: DAY,
      year: { ...year },
    };
    Object.assign(old.wildlife!, { hunt: legacy });
    const once = migrateVillage(old, advance);
    expect(once.wildlife!.hunt).toEqual({ year });
    expect(migrateVillage(once, advance)).toBe(once);
    expect(migrateVillage(once, load)).toBe(once);
    // vstupní stav beze změny
    expect(old.wildlife!.hunt).toBe(legacy);
    expect(Object.keys(legacy)).toEqual(['hope', 'today', 'extraDay', 'lastExtraDay', 'year']);
  });

  it('nový stav lovu (úlovek roku a honci) se nepřevádí', () => {
    const s = migrateVillage(founded(), load);
    s.wildlife!.hunt = {
      year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
      beaters: { day: DAY + 1, men: 6 },
    };
    expect(migrateVillage(s, advance)).toBe(s);
  });
});

describe('sazba orby letošního plánu (oxen.md – Účinek na práci, Nástroje během sezóny)', () => {
  const part = (id: number, over: Partial<FieldPart> = {}): FieldPart => ({
    id,
    fieldId: 1,
    areaM2: 5_000,
    distanceM: 300 + id,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  });
  /** Ves, která orá ozim při pokrytí nástroji `tools` (díl 3 s drnem) – plán uložený bez sazby. */
  function ploughing(tools: number): VillageState {
    const s = migrateVillage(founded(), load);
    s.parts = [part(1), part(2), part(3, { state: 'ready', sod: true })];
    const work = createCropWork(s.parts, DAY, tools, true, undefined, 'winter');
    work.plough!.done = work.plough!.required / 3;
    delete work.plough!.perHa;
    s.season = {
      startDay: DAY,
      ard: true,
      crops: [
        { crop: 'winter', ...work },
        // jař bez dílů – prázdná orba sazbu nepotřebuje
        { crop: 'spring', ...createCropWork([], DAY, tools, true) },
      ],
    };
    delete s.season.crops[1]!.plough!.perHa;
    return s;
  }
  const ploughOf = (s: VillageState): PloughWork => s.season!.crops[0]!.plough!;

  it('plán uložený bez sazby ji dostane podle váhy oraných dílů; orba i vstup beze změny', () => {
    for (const tools of [0, 0.4, 1]) {
      const old = ploughing(tools);
      const before = JSON.stringify(old);
      const once = migrateVillage(old, advance);
      expect(ploughOf(once).perHa).toBeCloseTo(ploughWorkPerHa(tools), 9);
      expect({ ...ploughOf(once), perHa: undefined }).toEqual({
        ...ploughOf(old),
        perHa: undefined,
      });
      expect(migrateVillage(once, advance)).toBe(once);
      expect(JSON.stringify(old)).toBe(before);
    }
  });

  it('díly z různých dnů dají průměrnou sazbu, nejvýš v mezích sazby', () => {
    const mixed = ploughing(0);
    ploughOf(mixed).required *= 0.8;
    expect(ploughOf(migrateVillage(mixed, advance)).perHa).toBeCloseTo(8, 9);
    // váhy dílů se od plánu změnily (kratší cesta k poli)
    const drifted = ploughing(0);
    ploughOf(drifted).required *= 1.2;
    expect(ploughOf(migrateVillage(drifted, advance)).perHa).toBe(ploughWorkPerHa(0));
  });

  it('plán se sazbou se nemění', () => {
    const s = ploughing(1);
    ploughOf(s).perHa = 7;
    expect(migrateVillage(s, advance)).toBe(s);
  });
});

describe('dvě zásoby uzeného (diet.md – Pořadí jídla, Uzené z porážky 1. 11. rovným dílem)', () => {
  /** Ves před převodem – uzené 400 kg bez rozdělení na zásoby, poslední den `lastDay`. */
  const unconverted = (lastDay: number): VillageState => {
    const s = { ...founded(), lastDay, meatKg: 400 };
    delete s.slaughterMeatKg;
    return s;
  };
  const day = (year: number, month: number, d: number): number =>
    dayIndexOf({ year, month, day: d });

  it('mezi 1. 11. a 31. 8. je uzené zásobou z porážky 1. 11., v září a říjnu ostatním', () => {
    for (const lastDay of [day(601, 11, 1), day(602, 1, 15), day(602, 8, 31)]) {
      const next = migrateVillage(unconverted(lastDay), advance);
      expect(next.slaughterMeatKg).toBe(400);
      expect(next.meatKg).toBe(400);
    }
    for (const lastDay of [day(602, 9, 1), day(602, 10, 31)]) {
      const next = migrateVillage(unconverted(lastDay), advance);
      expect(next.slaughterMeatKg).toBe(0);
      expect(next.meatKg).toBe(400);
    }
  });

  it('jednou – převedená ves (i s 0) a nová ves se vrátí beze změny', () => {
    const once = migrateVillage(unconverted(day(602, 1, 15)), advance);
    expect(migrateVillage(once, advance)).toBe(once);
    const fresh = founded();
    expect(fresh.slaughterMeatKg).toBe(0);
    expect(migrateVillage(fresh, advance).slaughterMeatKg).toBe(0);
  });
});

describe('konec smyšlených sousedů (`fictional-neighbours` – markets.md, Pravidla 10)', () => {
  /** Výprava k sousedovi na cestě: nese obilí, přinese sýr, krávu, klisnu a rodinu s mužem. */
  const expedition: TradeExpedition = {
    id: 3,
    direction: 'S',
    trailId: 7,
    startedDay: DAY - 2,
    give: { grain: 100 },
    get: { cheese: 20, cows: 1, mares: 1 },
    porters: 2,
    days: 6,
    cost: 12,
    done: 4,
    horses: [{ bornDay: DAY - 6 * 365, sex: 'female', training: 0 }],
    getPeople: { families: [1], men: 1, women: 0 },
  };
  const purchase: CraftPurchase = {
    direction: 'N',
    startedDay: DAY - 1,
    group: 1,
    days: 8,
    done: 1,
    trailId: null,
    edge: { x: 0, z: 960 },
    get: { potteryKg: 20 },
    pay: { grainKg: 60 },
  };
  const ironTrip: IronTrip = {
    personId: 1,
    son: false,
    startedDay: DAY - 1,
    days: 6,
    done: 1,
    kg: 3,
    grainKg: 170,
    to: { kind: 'neighbour', name: 'Lhota', direction: 'N', trailId: null, edge: { x: 0, z: 960 } },
  };

  /**
   * Ves uložená před koncem smyšlených sousedů: zbytky roku dvou sousedů, výprava na cestě, nákup
   * na cestě, cesta pro kování a ohrada koní (pro klisnu z výpravy). `withTrip` – tesař s cestou
   * pro kování (jen převod; dopočet bez dílny).
   */
  function legacy(withTrip = false): VillageState {
    const s = structuredClone(migrateVillage(withBuiltFirstDwelling(founded()), load));
    s.trails = [{ id: 7, direction: 'S', pieces: [], lengthM: 400, startedDay: 0, builtDay: 1 }];
    s.pens = [...(s.pens ?? []), horsePen(900, [])];
    s.trade = {
      neighbours: [
        { direction: 'S', season: 500, supply: { cheese: 80 }, demand: { grain: 900 } },
        { direction: 'N', season: 500, supply: { logs: 12 }, demand: { meat: 300 } },
      ],
      expeditions: [structuredClone(expedition)],
      nextId: 4,
    } as unknown as VillageState['trade'];
    s.purchases = [structuredClone(purchase)];
    if (withTrip) {
      s.dwellings[0]!.workshop = {
        craft: 'carpenter',
        felling: null,
        fuelKg: 0,
        activity: 'producing',
        skillTracked: true,
        ironTrip: structuredClone(ironTrip),
      };
    }
    return s;
  }

  it('zbytky roku sousedů zmizí, výpravy, nákupy a cesty pro kování na cestě zůstanou', () => {
    const old = legacy(true);
    const before = JSON.stringify(old);
    const next = migrateVillage(old, advance);
    expect('neighbours' in next.trade!).toBe(false);
    expect(next.trade!.expeditions).toEqual(old.trade!.expeditions);
    expect(next.trade!.nextId).toBe(4);
    expect(next.purchases).toEqual(old.purchases);
    expect(next.dwellings).toBe(old.dwellings);
    expect(next.dwellings[0]!.workshop!.ironTrip).toEqual(ironTrip);
    // vstupní stav beze změny, podruhé týž objekt; ves bez obchodu týž objekt
    expect(JSON.stringify(old)).toBe(before);
    expect(migrateVillage(next, advance)).toBe(next);
    const villageWithoutTrade = migrateVillage(founded(), load);
    expect(villageWithoutTrade.trade).toBeUndefined();
    expect(migrateVillage(villageWithoutTrade, advance)).toBe(villageWithoutTrade);
    expect(migrateVillage(villageWithoutTrade, load)).toBe(villageWithoutTrade);
  });

  it('po převodu výprava na cestě doběhne – zboží, kráva, klisna a lidé přibudou', () => {
    const old = legacy();
    const control = structuredClone(old);
    control.trade!.expeditions = [];
    const next = advanceVillage(old, DAY + 60, obstacles, landscape);
    const without = advanceVillage(control, DAY + 60, obstacles, landscape);
    expect(next.trade).toEqual({ expeditions: [], nextId: 4 });
    expect(next.chronicle.filter((e) => e.kind === 'trade-returned')).toEqual([
      expect.objectContaining({ direction: 'S', get: expedition.get }),
    ]);
    // kráva přibude do stáda (stádo pak roste i s ní)
    expect(next.livestock!.herds.cow).toBeGreaterThanOrEqual(without.livestock!.herds.cow + 1);
    expect(villageHorses(next)).toHaveLength(villageHorses(without).length + 1);
    // rodina (muž, žena a dítě) a svobodný muž od dřívějšího souseda (settleNewcomers)
    expect(next.people.filter((p) => p.origin === 'S')).toHaveLength(4);
    expect(next.chronicle.filter((e) => e.kind === 'newcomer')).toHaveLength(2);
    expect(next.purchases).toBeUndefined();
  });
});
