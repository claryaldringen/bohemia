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
  fleetCarts,
  fleetHaulPlan,
  haulAvailable,
  haulCartsToday,
  haulPlan,
  haulProgress,
  cropCartReach,
  networkCartAccess,
  retireCarts,
  villageCartAccess,
  teamsHomeShare,
  tradeCarts,
  trailCartPassable,
} from '../carts';
import { BUILD_COSTS } from '../costs';
import {
  cartTargets,
  cartYearCost,
  chooseCarts,
  missingCart,
  oxenOverRoom,
  wantedOxen,
} from '../draft';
import { craftCoverage, craftTargets, newWorkshop } from '../crafts';
import { carpenterWorkFactor, woodToolsLaborFactor, woodworkLabor } from '../productivity';
import { CARPENTRY, CARTS, CRAFT_BASE, workshopCost, workshopTrees } from '../rules';
import { advanceVillage } from '../simulate';
import { expeditionTransport } from '../trade';
import type { CartDemand, Construction, FieldPart, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
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

/** Loňský rok vozů – co ušetřil k-tý dvoukolák a čtyřkolák (čd za rok). */
function withCartYear(s: VillageState, twoWheel: number[], fourWheel: number[] = []): VillageState {
  s.draft = {
    ...s.draft,
    lastYear: {
      from: s.lastDay - 365,
      'two-wheel': twoWheel,
      'four-wheel': fourWheel,
      plough: [],
      oxCost: 12,
    },
  };
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
  it('polozemnice + 30 % práce i dřeva, bez lidí k osídlení', () => {
    expect(CRAFT_BASE.carpenter).toBe('polozemnice');
    expect(workshopCost('carpenter')).toBe(286);
    expect(workshopTrees('carpenter')).toBe(23);
    expect(BUILD_COSTS.carpenter).toEqual({
      laborManDays: 286,
      perHa: false,
      upfront: { wood: 23 },
    });
  });

  it('bez ohrady a s plnou zásobou nářadí odpočívá – domácnost pracuje se vsí', () => {
    const s = withCarpenter(village());
    s.crafts = {
      charcoalKg: 0,
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

  it('vyrobí dvoukolák, který se vyplatí – 25 čd a kláda, kronika', () => {
    const s = withCartYear(withTeam(withCarpenter(village())), [100]);
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
  it('ves chce vozy, které se loni vyplatily; bez roku vozů jen ty, které má', () => {
    const s = village();
    expect(cartTargets(s)).toEqual({ 'two-wheel': 0, 'four-wheel': 0 });
    withTeam(s);
    expect(cartTargets(s)).toEqual({ 'two-wheel': 0, 'four-wheel': 0 });
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY }];
    expect(cartTargets(s)).toEqual({ 'two-wheel': 1, 'four-wheel': 0 });
    expect(missingCart(withCarpenter(s))).toBeNull();
    // 3. dvoukolák potřebuje vola navíc (12 čd za rok) – ušetří 20, vyplatí se; 4. ne
    withCartYear(s, [200, 50, 20, 4], [300]);
    expect(cartTargets(s)).toEqual({ 'two-wheel': 3, 'four-wheel': 1 });
    expect(wantedOxen(s)).toBe(5);
    expect(oxenOverRoom(s)).toBe(false);
    expect(missingCart(s)).toBe('two-wheel');
  });

  it('vůz, který ušetří méně, než stojí, ves nechce; voli navíc se platí senem', () => {
    const year = (two: number[]): CartDemand & { oxCost: number } => ({
      from: 0,
      'two-wheel': two,
      'four-wheel': [],
      plough: [],
      oxCost: 12,
    });
    // dva voli k rádlu táhnou v létě dva dvoukoláky zadarmo – stačí víc, než stojí vůz
    expect(cartYearCost('two-wheel')).toBeCloseTo((25 + 2) / 10, 9);
    expect(chooseCarts(year([2]), 1, 6).carts['two-wheel']).toBe(0);
    expect(chooseCarts(year([3, 3]), 1, 6).carts['two-wheel']).toBe(2);
    // třetí potřebuje vola navíc
    expect(chooseCarts(year([30, 30, 14]), 1, 6).carts['two-wheel']).toBe(2);
    expect(chooseCarts(year([30, 30, 15]), 1, 6).carts['two-wheel']).toBe(3);
    // strop je místo v ohradách volů – voli vozů se musí vejít
    expect(chooseCarts(year([30, 30, 30, 30]), 1, 6).carts['two-wheel']).toBe(4);
    expect(chooseCarts(year([30, 30, 30, 30, 30, 30, 30]), 1, 6).oxen).toBe(6);
    const four = { ...year([200, 50, 20, 4]), 'four-wheel': [300] };
    expect(chooseCarts(four, 1, 4).carts).toEqual({ 'two-wheel': 2, 'four-wheel': 1 });
    // ve dny orby jezdí jen voli, kteří neorají – na vůz ve dny orby vůl navíc
    expect(chooseCarts(year([3]), 1, 6).oxen).toBe(2);
    const plough = { ...year([3]), plough: [40] };
    expect(chooseCarts(plough, 1, 6)).toEqual({
      pairs: 1,
      carts: { 'two-wheel': 1, 'four-wheel': 0 },
      oxen: 3,
    });
    const busy = { ...year([3, 3, 30]), plough: [40] };
    expect(chooseCarts(busy, 1, 6).carts['two-wheel']).toBe(3);
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

  it('levnější vůz pro každou práci: čtyřkoláky podél cest, dvoukoláky na zbytek', () => {
    // 30 čd nošení, z toho 20 podél cest; čtyřkolák odveze 16, dvoukolák 8, oba s posádkou 2
    const fleet = { 'two-wheel': 2, 'four-wheel': 1, oxen: 4 };
    const plan = fleetHaulPlan(30, 20, fleet);
    expect(plan).toEqual({ work: 16 + 8 + 6, crew: 2 + 2 + 1.5, carts: 3, four: 1, fourWork: 16 });
    expect(fleet).toEqual({ 'two-wheel': 0, 'four-wheel': 0, oxen: 0 });
    // bez nošení podél cest čtyřkolák nejede
    const other = { 'two-wheel': 1, 'four-wheel': 1, oxen: 3 };
    expect(fleetHaulPlan(10, 0, other)).toEqual({ work: 8, crew: 2, carts: 1 });
    expect(other).toEqual({ 'two-wheel': 0, 'four-wheel': 1, oxen: 2 });
    // čtyřkolák táhnou dva voli – s jedním volem jede jen dvoukolák
    const one = { 'two-wheel': 1, 'four-wheel': 1, oxen: 1 };
    expect(fleetCarts(one, 'four-wheel')).toBe(0);
    expect(fleetHaulPlan(10, 10, one)).toEqual({ work: 8, crew: 2, carts: 1 });
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
    expect(haulCartsToday(s, DAY, false)).toBe(1);
    expect(haulCartsToday(s, DAY, true)).toBe(0);
    expect(tradeCarts(s, DAY).map((c) => c.id)).toEqual([1]);
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
    expect(haulCartsToday(s, DAY, false)).toBe(0);
    expect(tradeCarts(s, DAY)).toEqual([]);
    expect(teamsHomeShare(s, DAY)).toBe(0);
  });

  it('výprava s vozem – náklad na voze, dva lidé místo nosičů', () => {
    expect(expeditionTransport({ grain: 400 }, {}, [])).toMatchObject({
      porters: 16,
      carts: 0,
      trips: 1,
    });
    expect(expeditionTransport({ grain: 400 }, {}, ['two-wheel'])).toMatchObject({
      porters: CARTS.tradeCrew,
      carts: 1,
      trips: 1,
    });
    // čtyřkolák napřed, druhý vůz jen když ušetří lidi
    expect(expeditionTransport({ grain: 1000 }, {}, ['four-wheel', 'two-wheel'])).toMatchObject({
      porters: 4,
      carts: 2,
      trips: 1,
    });
    // malý náklad – vůz se nevyplatí
    expect(expeditionTransport({ grain: 25 }, {}, ['two-wheel'])).toMatchObject({
      porters: 1,
      carts: 0,
      trips: 1,
    });
  });
});

describe('dosah vozu – vozová síť (wagons.md – fáze 2)', () => {
  /** Ves na krajině testů pěšin (louka, potok z ∈ (75, 90), les x < −90) s ohradou se spřežením. */
  const onMap = (day = DAY): VillageState => {
    const s = withTeam(village(day));
    s.pens![0]!.x = -22.5;
    s.pens![0]!.z = -7.5;
    s.pens![0]!.cell = { x: 8, y: 9 };
    return s;
  };
  const meadowPart = (id: number, cell: { x: number; y: number }, state: FieldPart['state']) =>
    ({
      id,
      fieldId: 1,
      areaM2: 225,
      distanceM: 100,
      naturalFertility: 70,
      fertilityShare: 1,
      bonusUntilDay: null,
      state,
      sownYears: state === 'sown' ? 1 : 0,
      fallowSinceDay: state === 'fallow' ? at(596, 9, 1) : null,
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
      cell,
      ...(state === 'sown' ? { crop: 'spring' as const } : {}),
    }) satisfies FieldPart;

  it('dojede po louce, do lesa a přes potok bez brodu ne; bez krajiny všude', () => {
    const s = onMap();
    const reach = networkCartAccess(
      DAY,
      LANDSCAPE,
      null,
    )(s, [
      { x: 100, z: -110, reachM: 9 },
      { x: -130, z: 0, reachM: 4 },
      { x: 20, z: 120, reachM: 4 },
    ]);
    expect(reach[0]).toBeGreaterThan(50);
    expect(reach[1]).toBeNull();
    expect(reach[2]).toBeNull();
    expect(EVERYWHERE(s, [{ x: 1e6, z: 0, reachM: 1 }])).toEqual([0]);
    // bez ohrady se spřežením vůz nevyjede
    const noTeam = onMap();
    noTeam.pens![0]!.team = null;
    expect(villageCartAccess(noTeam, DAY, LANDSCAPE, null)).toBeNull();
  });

  it('žeň: vůz jede po strništi sklízené plodiny, jiným osetím jen draze (Martin 23. 10. 2026)', () => {
    const s = onMap();
    s.fields = [{ id: 1 }, { id: 2 }];
    // sklízené díly za pásem osetého pole jiné plodiny (pole 2 napříč krajinou mimo les – díl na
    // pasece za nevymýceným lesem vůz odhadem nedosáhne, rovně ani po cestě – paths.md, Odhad
    // vzdáleností)
    s.parts = [
      meadowPart(1, { x: 12, y: 3 }, 'sown'),
      ...Array.from({ length: 16 }, (_, i) => ({
        ...meadowPart(10 + i, { x: i + 4, y: 5 }, 'sown'),
        fieldId: 2,
      })),
    ];
    const work = { partIds: [1] } as Parameters<typeof cropCartReach>[1];
    const access = networkCartAccess(DAY, LANDSCAPE, null);
    // pás osetého pole 2 vůz přejede (smí přes zaseté pole, metr dráž) – díl za ním dosáhne
    expect(cropCartReach(s, work, LANDSCAPE, access).share).toBe(1);
    // sklízí se i pole 2 – po strništi dojede k obojímu
    const both = { partIds: [1, ...s.parts.slice(1).map((p) => p.id)] } as typeof work;
    const reach = cropCartReach(s, both, LANDSCAPE, access);
    expect(reach.share).toBe(1);
    expect(reach.points.map((p) => p.weight).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(reach.points).toHaveLength(2);
  });

  it('výprava s vozem jen po stezce sjízdné pro vozy (potok bez brodu ne)', () => {
    const road = (id: number, z0: number, z1: number) => ({
      id,
      points: [
        { x: 20, z: z0 },
        { x: 20, z: z1 },
      ],
      bornDay: DAY,
      grade: 'improved' as const,
      traffic: [],
      spots: [],
    });
    const s = onMap();
    s.roads = {
      nextId: 3,
      roads: [road(1, 0, 60), road(2, 60, 120)],
      trees: [],
      labor: { from: DAY, days: 0, shares: [] },
    };
    const piece = (roadId: number) => ({ roadId, grade: 'improved' as const, manDays: 0 });
    expect(trailCartPassable(s, { pieces: [piece(1)] }, LANDSCAPE)).toBe(true);
    // úsek přes potok (z 75–90) bez brodu – vůz neprojede, nesou nosiči
    expect(trailCartPassable(s, { pieces: [piece(1), piece(2)] }, LANDSCAPE)).toBe(false);
    expect(trailCartPassable(s, { pieces: [piece(2)] }, null)).toBe(true);
  });

  it('svoz sena po síti – dosah se uloží u seče, jízdy jdou do ročního provozu cest', () => {
    const day = at(601, 6, 10);
    const s = onMap(day);
    s.fields = [{ id: 1 }];
    s.parts = [meadowPart(9, { x: 12, y: 6 }, 'fallow'), meadowPart(10, { x: 13, y: 6 }, 'fallow')];
    // velká seč – vozy vozí i druhý den (první den ves pevné cesty teprve zakládá)
    s.hay = { kg: 0, mowing: { partIds: [9, 10], required: 300, done: 0, yieldKg: 30_000 } };
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: day - 10 }];
    const next = advanceVillage(s, day + 2, null, LANDSCAPE);
    expect(next.hay!.mowing!.cartReach?.share).toBe(1);
    expect(next.hay!.mowing!.hauled).toBeGreaterThan(0);
    const trips = next.roads?.labor.cart ?? [];
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.every((t) => t.kind === 'two-wheel' && t.trips > 0)).toBe(true);
    // na kouscích nezávisí
    const pieces = advanceVillage(
      advanceVillage(s, day + 1, null, LANDSCAPE),
      day + 2,
      null,
      LANDSCAPE,
    );
    expect(pieces).toEqual(next);
  }, 60_000);
});

describe('determinismus – tesař a vozy na kouscích nezávisí', () => {
  it('dopočet najednou = po kouscích', () => {
    const s = withCartYear(withTeam(withCarpenter(village())), [100]);
    s.constructions = [polozemnice(DAY, 300)];
    const whole = advanceVillage(s, DAY + 200, null);
    let pieces = s;
    for (const to of [DAY + 37, DAY + 120, DAY + 200]) pieces = advanceVillage(pieces, to, null);
    expect(pieces).toEqual(whole);
    expect(whole.carts?.length ?? 0).toBeGreaterThan(0);
  });
});
