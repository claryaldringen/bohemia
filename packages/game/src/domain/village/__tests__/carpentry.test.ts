import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  carpentryHelp,
  constructionLaborFactor,
  constructionWoodShare,
  restingCarpenters,
} from '../carpentry';
import {
  EVERYWHERE,
  cartTargets,
  haulAvailable,
  haulCartsToday,
  haulPlan,
  haulProgress,
  missingCart,
  retireCarts,
  straightCartAccess,
  teamsHomeShare,
  tradeCarts,
} from '../carts';
import { BUILD_COSTS } from '../costs';
import { craftCoverage, craftTargets, newWorkshop } from '../crafts';
import { carpenterWorkFactor, woodToolsLaborFactor, woodworkLabor } from '../productivity';
import { CARPENTRY, CARTS, CRAFT_BASE, workshopCost, workshopTrees } from '../rules';
import { advanceVillage } from '../simulate';
import { expeditionTransport } from '../trade';
import type { Construction, FieldPart, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Tesař a vozy (wagons.md – fáze 1): výroba vozů a dřevěného nářadí podle potřeby, pomoc
// stavbám (dřevěná část práce), svoz vozem tam, kam dojede, vozy na výpravě.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const DAY = at(600, 10, 1);
const CARPENTER_ID = 50;

function person(id: number, years: number, dwellingId: number, day: number) {
  return { id, bornDay: day - Math.ceil(years * YEAR), dwellingId };
}

/** Ves s hotovou zemnicí (id 1), plnou domácností a hromadou klád; bez polí a staveb. */
function village(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 25, 1, day),
    person(3, 25, 1, day),
    person(4, 20, 1, day),
    person(5, 19, 1, day),
    person(6, 5, 1, day),
  ];
  s.constructions = [];
  s.storesKg = 50_000;
  s.woodLogs = 10;
  s.lastDay = day;
  s.nextId = 100;
  return s;
}

/** Přidá hotovou dílnu tesaře s domácností dvou dospělých. */
function withCarpenter(s: VillageState): VillageState {
  s.dwellings.push({
    id: CARPENTER_ID,
    type: CRAFT_BASE.carpenter,
    builtDay: s.lastDay,
    condition: 1,
    position: { x: 40, z: 0, rotation: 0 },
    workshop: newWorkshop('carpenter'),
  });
  s.people.push(person(60, 24, CARPENTER_ID, s.lastDay), person(61, 22, CARPENTER_ID, s.lastDay));
  return s;
}

/** Přidá hotovou ohradu s vycvičeným spřežením. */
function withTeam(s: VillageState): VillageState {
  s.pens = [
    {
      id: 900,
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: s.lastDay - 800,
      team: { readyDay: s.lastDay - 10 },
      training: null,
    },
  ];
  return s;
}

/** Rozestavěná polozemnice bez kácení (dřevo z hromady). */
function polozemnice(day: number, cost = 200): Construction {
  return {
    id: 300,
    kind: 'dwelling',
    startedDay: day,
    cost,
    done: 0,
    dwellingType: 'polozemnice',
    position: { x: -40, z: 0, rotation: 0 },
    dwellingId: null,
    fieldId: null,
  };
}

describe('dílna tesaře (wagons.md – Tesař)', () => {
  it('polozemnice + 30 % práce i dřeva, jedna domácnost k osídlení', () => {
    expect(CRAFT_BASE.carpenter).toBe('polozemnice');
    expect(workshopCost('carpenter')).toBe(286);
    expect(workshopTrees('carpenter')).toBe(23);
    expect(BUILD_COSTS.carpenter).toEqual({
      laborManDays: 286,
      perHa: false,
      upfront: { wood: 23, settlers: 1 },
    });
  });

  it('bez ohrady a s plnou zásobou nářadí odpočívá – domácnost pracuje se vsí', () => {
    const s = withCarpenter(village());
    s.crafts = {
      charcoalKg: 0,
      toolsKg: 0,
      potteryKg: 0,
      woodToolsKg: craftTargets(s, DAY).woodToolsKg + 1,
    };
    expect(restingCarpenters(s, DAY, null).get(CARPENTER_ID)).toBe('resting');
    const next = advanceVillage(s, DAY + 1, null);
    expect(next.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!.activity).toBe('resting');
  });

  it('vyrábí dřevěné nářadí do zásoby – klády z hromady, pokrytí zlepší práci vsi', () => {
    const s = withCarpenter(village());
    const next = advanceVillage(s, DAY + 30, null);
    const target = craftTargets(next, DAY + 30).woodToolsKg;
    expect(next.crafts!.woodToolsKg).toBeGreaterThan(target * 0.9);
    // kláda z hromady dá 100 kg nářadí – vzal jednu
    expect(next.woodLogs).toBeLessThan(10);
    const coverage = craftCoverage(next, DAY + 30);
    expect(coverage.woodTools).toBeGreaterThan(0.9);
    expect(woodToolsLaborFactor(1)).toBeCloseTo(1 / 0.95, 9);
    expect(woodToolsLaborFactor(0)).toBe(1);
  });

  it('vyrobí dvoukolák pro spřežení – 25 čd a kláda, kronika', () => {
    const s = withTeam(withCarpenter(village()));
    expect(missingCart(s)).toBe('two-wheel');
    const next = advanceVillage(s, DAY + 90, null);
    expect(next.carts).toHaveLength(1);
    expect(next.carts![0]!.kind).toBe('two-wheel');
    expect(next.chronicle.some((e) => e.kind === 'cart-made')).toBe(true);
    expect(missingCart(next)).toBeNull();
  });

  it('bez klád si skácí strom sám (pařez), bez stromů hlásí, že nemá dřevo', () => {
    const s = withTeam(withCarpenter(village()));
    s.woodLogs = 0;
    const next = advanceVillage(s, DAY + 5, null);
    // bez vrstvy překážek se kácí bez polohy – dílna dřevo má
    expect(next.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!.activity).not.toBe(
      'no-wood',
    );
  });
});

describe('pomoc stavbám – dřevěná část práce (wagons.md – Tesař, Účinek)', () => {
  it('podíl dřevěné práce podle druhu stavby a meze 1 → 0,6', () => {
    expect(constructionWoodShare({ kind: 'dwelling', dwellingType: 'polozemnice' })).toBe(0.5);
    expect(constructionWoodShare({ kind: 'rebuild', dwellingType: 'zemnice' })).toBe(0.4);
    expect(constructionWoodShare({ kind: 'ard', dwellingType: null })).toBe(1);
    expect(constructionWoodShare({ kind: 'field', dwellingType: null })).toBe(0);
    expect(woodworkLabor(1)).toBeCloseTo(0.6, 9);
    const c = { kind: 'dwelling' as const, dwellingType: 'polozemnice' as const };
    expect(constructionLaborFactor(c, 0)).toBe(1);
    expect(constructionLaborFactor(c, 1)).toBeCloseTo(0.8, 9);
    expect(constructionLaborFactor({ kind: 'field', dwellingType: null }, 1)).toBe(1);
    expect(carpenterWorkFactor(0)).toBeCloseTo(1.5, 9);
  });

  it('tesař vede CARPENTRY.crew čd dřevěné práce na svůj čd – pokrytí podle jeho práce', () => {
    const s = withCarpenter(village());
    s.constructions = [polozemnice(DAY)];
    const coverage = craftCoverage(s, DAY);
    const help = carpentryHelp(s, DAY, coverage, 1, new Map(), () => 20);
    // bez nástrojů od kováře 1,5× – vedení 20 čd chce 20 × 1,5 / 4 = 7,5 čd tesaře
    const needed = (20 * 1.5) / CARPENTRY.crew;
    expect(help.labor).toBeGreaterThan(0);
    expect(help.labor).toBeLessThan(needed);
    expect(help.coverage).toBeCloseTo(help.labor / needed, 9);
    expect(help.byWorkshop.get(CARPENTER_ID)).toBeCloseTo(help.labor, 9);
  });

  it('se stavbou neodpočívá a stavba postoupí víc, než na ni ves dala práce', () => {
    const s = withCarpenter(village());
    s.crafts = {
      charcoalKg: 0,
      toolsKg: 0,
      potteryKg: 0,
      woodToolsKg: craftTargets(s, DAY).woodToolsKg + 1,
    };
    s.constructions = [polozemnice(DAY, 2000)];
    expect(restingCarpenters(s, DAY, null).size).toBe(0);
    const next = advanceVillage(s, DAY + 1, null);
    const c = next.constructions.find((x) => x.id === 300)!;
    const labor = next
      .labor!.shares.filter((share) => share.construction === 300)
      .reduce((sum, share) => sum + share.manDays, 0);
    expect(c.done).toBeGreaterThan(labor * 1.01);
    const workshop = next.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!;
    expect(workshop.activity).toBe('helping');
    expect(workshop.woodworkCoverage).toBeGreaterThan(0);
  });
});

describe('vozy (wagons.md – Vůz)', () => {
  it('dvoukolák na spřežení, čtyřkolák s hotovou stezkou', () => {
    const s = village();
    expect(cartTargets(s)).toEqual({ 'two-wheel': 0, 'four-wheel': 0 });
    withTeam(s);
    expect(cartTargets(s)).toEqual({ 'two-wheel': 1, 'four-wheel': 0 });
    s.trails = [
      { id: 1, direction: 'S', pieces: [], lengthM: 500, startedDay: DAY, builtDay: DAY },
    ];
    expect(cartTargets(s)).toEqual({ 'two-wheel': 1, 'four-wheel': 1 });
  });

  it('vůz za den odveze jako 8 nosičů, jdou s ním 2 lidé; nejvýš podíl nošení úlohy', () => {
    const plan = haulPlan(20, 1);
    expect(plan).toEqual({ work: CARTS.carrierManDays, crew: CARTS.crew, carts: 1 });
    expect(haulPlan(4, 3)).toEqual({ work: 4, crew: 1, carts: 1 });
    // honáci jdou napřed – s menší prací vozy převezmou poměrně méně
    expect(haulProgress(5, plan)).toBeCloseTo(5 - 2 + 8, 9);
    expect(haulProgress(1, plan)).toBeCloseTo(4, 9);
    expect(haulAvailable(100, 100, 0, 0.4)).toBe(40);
    expect(haulAvailable(100, 50, 30, 0.4)).toBeCloseTo(10, 9);
    expect(haulAvailable(100, 10, 0, 0.4)).toBeCloseTo(4, 9);
  });

  it('vůz po 10 letech doslouží (kronika), na výpravě až po návratu', () => {
    const s = withTeam(village());
    s.carts = [
      { id: 1, kind: 'two-wheel', builtDay: DAY - 3700 },
      { id: 2, kind: 'two-wheel', builtDay: DAY - 100 },
    ];
    const events = retireCarts(s, DAY);
    expect(events).toEqual([{ day: DAY, kind: 'cart-worn-out', cart: 'two-wheel' }]);
    expect(s.carts.map((c) => c.id)).toEqual([2]);
  });

  it('svoz sena – vůz převezme čtvrtinu seče, seč postoupí víc', () => {
    const day = at(601, 6, 10);
    const meadow = (id: number): FieldPart => ({
      id,
      fieldId: 1,
      areaM2: 10_000,
      distanceM: 100,
      naturalFertility: 70,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'fallow',
      sownYears: 0,
      fallowSinceDay: at(596, 9, 1),
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
    });
    const base = (): VillageState => {
      const s = withTeam(village(day));
      s.fields = [{ id: 1 }];
      s.parts = [meadow(9), meadow(10)];
      s.hay = { kg: 0, mowing: { partIds: [9, 10], required: 30, done: 0, yieldKg: 3000 } };
      return s;
    };
    const without = advanceVillage(base(), day + 1, null);
    const s = base();
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: day - 10 }];
    const withCart = advanceVillage(s, day + 1, null);
    expect(withCart.hay!.mowing!.done).toBeGreaterThan(without.hay!.mowing!.done + 1);
    expect(withCart.hay!.mowing!.hauled).toBeGreaterThan(0);
    const haul = withCart.labor!.shares.find((share) => share.activity === 'haul');
    expect(haul?.carts).toBe(1);
  });

  it('klády ke stavbě – vůz převezme polovinu dovozu, stavba postoupí víc', () => {
    const base = (): VillageState => {
      const s = withTeam(village());
      const c = polozemnice(DAY, 400);
      c.wood = {
        trees: 5,
        fromPile: 0,
        fell: Array.from({ length: 5 }, () => ({ id: null, cost: 4 })),
        felled: 0,
      };
      s.constructions = [c];
      return s;
    };
    const without = advanceVillage(base(), DAY + 1, null);
    const s = base();
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
    const withCart = advanceVillage(s, DAY + 1, null);
    const done = (v: VillageState): number => v.constructions.find((c) => c.id === 300)!.done;
    expect(done(withCart)).toBeGreaterThan(done(without) + 1);
    expect(withCart.constructions[0]!.wood!.hauled).toBeGreaterThan(0);
  });

  it('ve dny orby voli orají a s výpravou jsou pryč – vůz stojí', () => {
    const s = withTeam(village());
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
    expect(haulCartsToday(s, false)).toBe(1);
    expect(haulCartsToday(s, true)).toBe(0);
    expect(tradeCarts(s).map((c) => c.id)).toEqual([1]);
    s.trade = {
      neighbours: [],
      nextId: 2,
      expeditions: [
        {
          id: 1,
          direction: 'S',
          trailId: 1,
          startedDay: DAY,
          give: {},
          get: {},
          porters: 2,
          days: 3,
          cost: 6,
          done: 0,
          carts: [1],
        },
      ],
    };
    expect(haulCartsToday(s, false)).toBe(0);
    expect(tradeCarts(s)).toEqual([]);
    expect(teamsHomeShare(s)).toBe(0);
  });

  it('výprava s vozem – náklad na voze, dva lidé místo nosičů', () => {
    expect(expeditionTransport({ grain: 400 }, {}, [])).toEqual({ porters: 16, carts: 0 });
    expect(expeditionTransport({ grain: 400 }, {}, ['two-wheel'])).toEqual({
      porters: CARTS.tradeCrew,
      carts: 1,
    });
    // čtyřkolák napřed, druhý vůz jen když ušetří lidi
    expect(expeditionTransport({ grain: 1000 }, {}, ['four-wheel', 'two-wheel'])).toEqual({
      porters: 4,
      carts: 2,
    });
    // malý náklad – vůz se nevyplatí
    expect(expeditionTransport({ grain: 25 }, {}, ['two-wheel'])).toEqual({ porters: 1, carts: 0 });
  });
});

describe('dosah vozu – zástupná odpověď (wagons.md – Vozová síť, fáze 1)', () => {
  it('rovně po louce dojede, přes vodu, les a příkrý svah ne; bez krajiny všude', () => {
    const flat = makeLandscape();
    const from = { x: 7.5, z: 7.5 };
    expect(straightCartAccess(flat, from).reach({ x: 52.5, z: 7.5 })).toBeCloseTo(45, 6);
    const water = makeLandscape({ surface: (x) => (x === 10 ? 'water' : 'meadow') });
    expect(straightCartAccess(water, from).reach({ x: 52.5, z: 7.5 })).toBeNull();
    const forest = makeLandscape({ surface: (x) => (x >= 10 ? 'forest' : 'meadow') });
    expect(straightCartAccess(forest, from).reach({ x: 67.5, z: 7.5 })).toBeNull();
    // kládu z kraje lesa vlečou lidé – posledních 30 m lesem smí
    expect(straightCartAccess(forest, from).reach({ x: 37.5, z: 7.5 }, 30)).not.toBeNull();
    // 3 m na políčko 15 m = 20 % – vůz nevyjede
    const steep = makeLandscape({ height: (x) => x * 3 });
    expect(straightCartAccess(steep, from).reach({ x: 52.5, z: 7.5 })).toBeNull();
    expect(EVERYWHERE.reach({ x: 1e6, z: 0 })).toBe(0);
  });
});

describe('determinismus – tesař a vozy na kouscích nezávisí', () => {
  it('dopočet najednou = po kouscích', () => {
    const s = withTeam(withCarpenter(village()));
    s.constructions = [polozemnice(DAY, 300)];
    const whole = advanceVillage(s, DAY + 200, null);
    let pieces = s;
    for (const to of [DAY + 37, DAY + 120, DAY + 200]) pieces = advanceVillage(pieces, to, null);
    expect(pieces).toEqual(whole);
    expect(whole.carts?.length ?? 0).toBeGreaterThan(0);
  });
});
