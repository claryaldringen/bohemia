import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { cartIronDay } from '../cart-iron';
import {
  craftCoverage,
  newWorkshop,
  restingCrafters,
  smithBarsTargetKg,
  smithBellowsToday,
  wearCraftStocks,
  workCrafts,
  workshopLabor,
} from '../crafts';
import {
  barsReserveKg,
  smithBellows,
  toolEquipmentKg,
  toolNeedKg,
  withToolEquipment,
} from '../iron';
import { FORGE, ORE_KG_PER_TOOL_KG, REFINE, SMELT } from '../iron-rates';
import { TRADE_GOODS } from '../../trade/goods';
import { NO_CRAFTS } from '../../core/productivity';
import { CRAFT_BASE, IRON, TRADE_GOOD_VALUES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { summarizeVillage } from '../../core/summary';
import {
  sellPrice,
  villageGoodStock,
  withIronBarsTrade,
  withoutForeignGoods,
} from '../../trade/trade';
import type { Craft, Dwelling, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Kovář – od rudy po hřivny a nástroje (production-chains.md – Kovář; Martin 20. 10. 2026): ruda
// a uhlí → tavba v redukční peci s měchařem → železná houba → překování → hřivny → nástroje do
// vybavení domácností. V liště a v obchodu hřivny, nástroje jsou vybavení.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
/** 10. 1. – žádná polní práce. */
const WINTER = at(601, 1, 10);
const SMITH = 51;
const SMITH_HEAD = 510;
const EPS = 1e-9;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  day: number,
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: day - Math.ceil(years * YEAR) - 10, dwellingId, ...extra });

/** Ves se čtyřmi dospělými (obydlí 1), bez dětí a bez polí. */
function village(day = WINTER): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19].map((age, i) =>
    person(2 + i, age, 1, day, { sex: i % 2 === 0 ? 'male' : 'female' }),
  );
  s.constructions = [];
  s.storesKg = 5_000;
  s.lastDay = day;
  s.nextId = 1000;
  s.crafts = { charcoalKg: 10_000, potteryKg: 0 };
  return s;
}

function addWorkshop(s: VillageState, craft: Craft, id: number): Dwelling {
  const dwelling: Dwelling = {
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { x: 40, z: 40, rotation: 0 },
    workshop: newWorkshop(craft),
  };
  s.dwellings.push(dwelling);
  return dwelling;
}

/**
 * Kovárna (51) s kovářem 36 let, s ženou (`wife`) a syny daného věku; v kovárně `oreKg` rudy.
 */
function withSmith(
  s: VillageState,
  { wife = true, sons = [] as number[], oreKg = 500 } = {},
): Dwelling {
  const smith = addWorkshop(s, 'smith', SMITH);
  smith.workshop!.oreKg = oreKg;
  s.people.push(person(SMITH_HEAD, 36, SMITH, s.lastDay, { sex: 'male' }));
  if (wife) s.people.push(person(SMITH_HEAD + 1, 30, SMITH, s.lastDay, { sex: 'female' }));
  sons.forEach((age, k) =>
    s.people.push(
      person(SMITH_HEAD + 2 + k, age, SMITH, s.lastDay, {
        sex: 'male',
        fatherId: SMITH_HEAD,
        ...(wife ? { motherId: SMITH_HEAD + 1 } : {}),
      }),
    ),
  );
  return smith;
}

const smithOf = (s: VillageState): NonNullable<Dwelling['workshop']> =>
  s.dwellings.find((d) => d.id === SMITH)!.workshop!;

/** Den práce dílen bez zbytku simulace (štěstí 50 → práce × 1). */
function craftDay(s: VillageState): void {
  s.lastDay += 1;
  workCrafts(s, s.lastDay, null, NO_CRAFTS, 1);
}

describe('ceny kroků řetězu (production-chains.md – Kovář)', () => {
  it('tavba, překování a kování dají dohromady dnešní cenu kování – 10 čd, 50 kg uhlí, 8 kg rudy', () => {
    // na kg nástrojů 1,2 kg hřiven z 2 kg houby
    const bloom = IRON.barsPerToolKg / IRON.barsPerBloomKg;
    expect(bloom).toBe(2);
    expect(SMELT.manDaysPerKg).toBeCloseTo(3, 12);
    expect(SMELT.charcoalKgPerKg).toBeCloseTo(20, 12);
    expect(SMELT.oreKgPerKg).toBe(4);
    expect(REFINE.bloomKgPerKg).toBeCloseTo(1 / 0.6, 12);
    expect(FORGE.barsKgPerKg).toBe(1.2);
    const labor =
      bloom * SMELT.manDaysPerKg + IRON.barsPerToolKg * REFINE.manDaysPerKg + FORGE.manDaysPerKg;
    const charcoal =
      bloom * SMELT.charcoalKgPerKg +
      IRON.barsPerToolKg * REFINE.charcoalKgPerKg +
      FORGE.charcoalKgPerKg;
    expect(labor).toBeCloseTo(10, 9);
    expect(charcoal).toBeCloseTo(50, 9);
    // podíly: tavba 60 % práce a 80 % uhlí, překování 25 % a 15 %, kování 15 % a 5 %
    expect((bloom * SMELT.manDaysPerKg) / labor).toBeCloseTo(0.6, 9);
    expect((IRON.barsPerToolKg * REFINE.charcoalKgPerKg) / charcoal).toBeCloseTo(0.15, 9);
    expect(ORE_KG_PER_TOOL_KG).toBeCloseTo(8, 12);
  });
});

describe('řetěz kovárny – ruda a uhlí → houba → hřivny → vybavení', () => {
  it('bez hřiven a houby kovář taví – s měchařem plným tempem', () => {
    const s = village();
    // žena měch nešlape (crafts.md – Kdo dělá řemeslo) – měchařem je syn
    withSmith(s, { sons: [11] });
    const labor = workshopLabor(s, s.lastDay + 1, SMITH, 0).craft;
    craftDay(s);
    expect(smithOf(s).activity).toBe('smelting');
    expect(s.crafts!.bloomKg).toBeCloseTo(labor / SMELT.manDaysPerKg, 9);
    expect(smithOf(s).oreKg).toBeCloseTo(500 - s.crafts!.bloomKg! * 4, 9);
    expect(s.crafts!.charcoalKg).toBeCloseTo(10_000 - s.crafts!.bloomKg! * 20, 9);
  });

  it('za pár měsíců má ves vybavení do potřeby a hřivny na rok obnovy – nic navíc', () => {
    const s = village();
    withSmith(s, { sons: [20] });
    const charcoal0 = s.crafts!.charcoalKg;
    const ore0 = smithOf(s).oreKg!;
    const activities = new Set<string>();
    let smelted = 0;
    let refined = 0;
    let forged = 0;
    for (let i = 0; i < 240; i++) {
      s.lastDay += 1;
      const days = workCrafts(s, s.lastDay, null, NO_CRAFTS, 1);
      for (const d of days) {
        smelted += d.smelt?.bloomKg ?? 0;
        refined += d.refine?.barsKg ?? 0;
        forged += d.producedKg;
      }
      activities.add(smithOf(s).activity);
      wearCraftStocks(s, s.lastDay);
      // ruda nedojde – kovář nekope (test řetězu, ne rudy)
      smithOf(s).oreKg = Math.max(smithOf(s).oreKg!, 100);
    }
    const day = s.lastDay;
    const need = toolNeedKg(s, day);
    const reserve = barsReserveKg(s, day);
    // činnost dne je krok s nejvíc prací – tavba; s plným vybavením a zásobou odpočívá
    expect(activities).toEqual(new Set(['smelting', 'resting']));
    expect(smelted).toBeGreaterThan(0);
    expect(refined).toBeGreaterThan(0);
    expect(forged).toBeGreaterThan(0);
    // vybavení na potřebě, hřivny na zásobě – nejvýš o den práce dílny pod ní
    expect(toolEquipmentKg(s)).toBeGreaterThan(need * 0.98);
    expect(toolEquipmentKg(s)).toBeLessThanOrEqual(need + EPS);
    expect(s.crafts!.ironBarsKg!).toBeGreaterThan(reserve - 1.5);
    expect(s.crafts!.ironBarsKg!).toBeLessThan(reserve + 1.5);
    expect(smithBarsTargetKg(s, day)).toBeCloseTo(reserve, 9);
    // co šlo dovnitř, vyšlo ven: houba = vytavená − překovaná, hřivny = překované − vykované
    expect(s.crafts!.bloomKg!).toBeCloseTo(smelted - refined * REFINE.bloomKgPerKg, 6);
    expect(s.crafts!.ironBarsKg!).toBeCloseTo(refined - forged * FORGE.barsKgPerKg, 6);
    const charcoal =
      smelted * SMELT.charcoalKgPerKg +
      refined * REFINE.charcoalKgPerKg +
      forged * FORGE.charcoalKgPerKg;
    expect(charcoal0 - s.crafts!.charcoalKg).toBeCloseTo(charcoal, 6);
    expect(smelted * SMELT.oreKgPerKg).toBeGreaterThan(0);
    expect(ore0).toBe(500);
  });

  it('bez měchaře kovář taví polovičním tempem; syn 10–13 šlape měch a ten den nepase', () => {
    const alone = village();
    withSmith(alone, { wife: false });
    expect(smithBellows(alone, SMITH, alone.lastDay + 1)).toBeNull();
    const labor = workshopLabor(alone, alone.lastDay + 1, SMITH, 0).craft;
    craftDay(alone);
    expect(alone.crafts!.bloomKg).toBeCloseTo((labor * IRON.aloneRate) / SMELT.manDaysPerKg, 9);
    expect(smithOf(alone).activity).toBe('smelting');

    const son = village();
    withSmith(son, { wife: false, sons: [11] });
    const helper = smithBellows(son, SMITH, son.lastDay + 1);
    expect(helper).toMatchObject({ kind: 'son', age: 11, personId: SMITH_HEAD + 2 });
    craftDay(son);
    expect(son.crafts!.bloomKg).toBeCloseTo(labor / SMELT.manDaysPerKg, 9);
    // syn, který dnes nosí uhlí, měch nešlape
    expect(smithBellows(son, SMITH, son.lastDay, new Set([SMITH_HEAD + 2]))).toBeNull();
    // žena kováře měch nešlape (crafts.md – Kdo dělá řemeslo; Martin 22. 10. 2026) – ani když
    // je dospělá a doma, měchařem je syn, a bez syna je kovář sám
    const wife = village();
    withSmith(wife, { sons: [11] });
    expect(smithBellows(wife, SMITH, wife.lastDay + 1)).toMatchObject({
      kind: 'son',
      personId: SMITH_HEAD + 2,
    });
    const wifeOnly = village();
    withSmith(wifeOnly);
    expect(smithBellows(wifeOnly, SMITH, wifeOnly.lastDay + 1)).toBeNull();
    // dospělý syn (muž) je měchařem jako dospělý z domácnosti
    const grown = village();
    withSmith(grown, { sons: [20] });
    expect(smithBellows(grown, SMITH, grown.lastDay + 1)).toMatchObject({ kind: 'adult' });
  });

  it('v simulaci syn u měchu nepase a rozdělení práce ho ukáže u kovárny', () => {
    const summer = at(601, 6, 10);
    // dospělý syn šlape měch (žena ne) – mladší syn pase ovce zakladatelů
    const withWife = village(summer);
    withSmith(withWife, { sons: [20, 11] });
    const herding = advanceVillage(withWife, summer + 1, null);
    expect(herding.labor?.herders?.children).toBe(1);
    // kovář sám – syn šlape měch a nepase
    const s = village(summer);
    withSmith(s, { wife: false, sons: [11] });
    const resting = restingCrafters(s, summer + 1, NO_CRAFTS);
    expect(resting.has(SMITH)).toBe(false);
    const bellows = smithBellowsToday(s, summer + 1, resting, new Set());
    expect(bellows.get(SMITH)).toMatchObject({ kind: 'son', age: 11 });
    const next = advanceVillage(s, summer + 1, null);
    expect(next.labor?.herders?.children ?? 0).toBe(0);
    const share = next.labor?.shares.find((sh) => sh.activity === 'craft' && sh.ages?.[0] === 11);
    expect(share?.target).toEqual({ kind: 'dwelling', id: SMITH });
    expect(smithOf(next).activity).toBe('smelting');
  });
});

describe('kovář stojí bez rudy nebo uhlí (production-chains.md – Kovář)', () => {
  it('bez uhlí čeká na uhlí, bez rudy a místa ke kopání nemá rudu', () => {
    const coal = village();
    withSmith(coal);
    coal.crafts!.charcoalKg = 0;
    expect(restingCrafters(coal, coal.lastDay + 1, NO_CRAFTS).get(SMITH)).toBe('no-charcoal');
    const ore = village();
    withSmith(ore, { oreKg: 0 });
    smithOf(ore).oreSite = null;
    expect(restingCrafters(ore, ore.lastDay + 1, NO_CRAFTS).get(SMITH)).toBe('no-ore');
    craftDay(ore);
    expect(smithOf(ore).activity).toBe('no-ore');
    // s hřivnami bez rudy kove – houbu ani rudu k tomu nepotřebuje
    const bars = village();
    withSmith(bars, { oreKg: 0 });
    smithOf(bars).oreSite = null;
    bars.crafts!.ironBarsKg = 20;
    expect(restingCrafters(bars, bars.lastDay + 1, NO_CRAFTS).has(SMITH)).toBe(false);
    craftDay(bars);
    expect(smithOf(bars).activity).toBe('producing');
    expect(toolEquipmentKg(bars)).toBeGreaterThan(0);
  });

  it('kovář bez práce na celý den pracuje se vsí', () => {
    const s = village();
    withSmith(s, { sons: [20] });
    const day = s.lastDay + 1;
    s.toolEquipmentKg = toolNeedKg(s, day);
    s.crafts!.ironBarsKg = barsReserveKg(s, day);
    expect(restingCrafters(s, day, NO_CRAFTS).get(SMITH)).toBe('resting');
    // chybí kousek – méně než den práce, pořád odpočívá
    s.toolEquipmentKg -= 0.1;
    expect(restingCrafters(s, day, NO_CRAFTS).get(SMITH)).toBe('resting');
    // chybí víc než den práce – jde do dílny
    s.toolEquipmentKg -= 2;
    expect(restingCrafters(s, day, NO_CRAFTS).has(SMITH)).toBe(false);
  });
});

describe('nástroje jako vybavení domácností (production-chains.md)', () => {
  it('pokrytí nástroji = vybavení ÷ potřeba, hřivny pokrytí nedávají', () => {
    const s = village();
    // 4 pracující → potřeba 12 kg
    s.toolEquipmentKg = 6;
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 100 };
    expect(craftCoverage(s, s.lastDay).tools).toBe(0.5);
    delete s.toolEquipmentKg;
    expect(craftCoverage(s, s.lastDay)).toEqual(NO_CRAFTS);
  });

  it('vybavení se opotřebí a kovář ho z hřiven doplní', () => {
    const s = village();
    withSmith(s);
    const day = s.lastDay;
    const need = toolNeedKg(s, day);
    s.toolEquipmentKg = need;
    s.crafts!.ironBarsKg = barsReserveKg(s, day);
    for (let i = 1; i <= 365; i++) wearCraftStocks(s, day + i);
    // v užívání je potřeba – za rok se opotřebí 30 %, přebytek hřiven leží
    expect(toolEquipmentKg(s)).toBeCloseTo(need * (1 - 0.3 / 365) ** 365, 6);
    expect(s.crafts!.ironBarsKg).toBeCloseTo(barsReserveKg(s, day), 9);
    s.lastDay = day + 365;
    craftDay(s);
    expect(smithOf(s).activity).toBe('producing');
    expect(toolEquipmentKg(s)).toBeGreaterThan(need * 0.75);
  });

  it('nákup u sousedů přidá nástroje do vybavení', async () => {
    const { finishPurchases } = await import('../craft-buying');
    const s = village();
    s.toolEquipmentKg = 2;
    s.purchases = [
      {
        direction: 'N',
        startedDay: s.lastDay - 6,
        group: 2,
        days: 6,
        done: 6,
        trailId: null,
        edge: { x: 0, z: 400 },
        get: { toolsKg: 5 },
        pay: { grainKg: 300 },
      },
    ];
    finishPurchases(s, s.lastDay);
    expect(toolEquipmentKg(s)).toBe(7);
    expect(s.crafts!.ironBarsKg ?? 0).toBe(0);
  });

  it('souhrn kovárny – houba, hřivny, zásoba, vybavení a měchař', () => {
    const s = village();
    withSmith(s, { sons: [11] });
    s.crafts = { charcoalKg: 100, potteryKg: 0, bloomKg: 3, ironBarsKg: 5 };
    s.toolEquipmentKg = 4;
    const summary = summarizeVillage(s, s.lastDay);
    expect(summary.crafts.equipmentKg).toBe(4);
    const iron = summary.crafts.workshops.find((w) => w.dwellingId === SMITH)!.iron!;
    expect(iron).toMatchObject({ bloomKg: 3, barsKg: 5, equipmentKg: 4 });
    expect(iron.needKg).toBe(toolNeedKg(s, s.lastDay));
    expect(iron.barsTargetKg).toBeCloseTo(barsReserveKg(s, s.lastDay), 9);
    expect(iron.bellows).toMatchObject({ kind: 'son', sex: 'male' });
  });
});

describe('kování vozu z hřiven (wagons.md – Kování vozů)', () => {
  it('vůz čekající na kování vezme 1,2 kg hřiven na kg kování', () => {
    const s = village();
    const carpenter = addWorkshop(s, 'carpenter', 60);
    s.people.push(person(600, 30, 60, s.lastDay, { sex: 'male' }));
    carpenter.workshop!.cart = { kind: 'two-wheel', done: 1_000 };
    s.crafts!.ironBarsKg = 5;
    const events = cartIronDay(s, s.lastDay + 1);
    expect(events.map((e) => e.kind)).toEqual(['cart-made']);
    expect(s.crafts!.ironBarsKg).toBeCloseTo(5 - 3 * 1.2, 9);
  });
});

describe('obchod s hřivnami (production-chains.md – Kovář, trade.md)', () => {
  it('hřivny jsou zboží obchodu – za 45 kg obilí na kg; nástroje z vybavení (plán 3 trhu)', () => {
    expect(TRADE_GOODS).toContain('ironBars');
    expect(TRADE_GOOD_VALUES.ironBars.valueKg).toBe(45);
    expect(sellPrice('ironBars')).toBeCloseTo(45, 9);
    const s = village();
    s.crafts!.ironBarsKg = 12.7;
    expect(villageGoodStock(s, 'ironBars')).toBe(12);
    // nástroje nejsou zásoba kovárny, na trh jdou z vybavení domácností (markets.md – Rozhodnutí
    // plánu 3, bod 4)
    expect(TRADE_GOODS).toContain('tools');
    s.toolEquipmentKg = 9.5;
    expect(villageGoodStock(s, 'tools')).toBe(9);
  });
});

describe('převod starší vsi (production-chains.md – Kovář, Starší vsi)', () => {
  it('zásoba nástrojů → vybavení do potřeby, přebytek na hřivny (÷ 1,2); jednou', () => {
    const s = village();
    // 4 pracující → potřeba 12 kg
    (s as unknown as { crafts: Record<string, number> }).crafts = {
      charcoalKg: 7,
      toolsKg: 30,
      potteryKg: 9,
    };
    const next = withToolEquipment(s);
    expect(next.toolEquipmentKg).toBe(12);
    expect(next.crafts).toEqual({ charcoalKg: 7, potteryKg: 9, ironBarsKg: 15 });
    expect(withToolEquipment(next)).toBe(next);
    // méně nástrojů, než ves potřebuje – vše do vybavení
    (s as unknown as { crafts: Record<string, number> }).crafts = {
      charcoalKg: 0,
      toolsKg: 5,
      potteryKg: 0,
    };
    const few = withToolEquipment(s);
    expect(few.toolEquipmentKg).toBe(5);
    expect(few.crafts).toEqual({ charcoalKg: 0, potteryKg: 0 });
    // ves bez zásoby nástrojů beze změny
    const plain = village();
    expect(withToolEquipment(plain)).toBe(plain);
  });

  it('nástroje v obchodu → hřivny: výprava na cestě a kronika', () => {
    const s = village();
    const direction = 'S';
    s.trade = {
      expeditions: [
        {
          id: 1,
          direction,
          trailId: 77,
          startedDay: s.lastDay - 1,
          give: { grain: 500 },
          get: { tools: 6 },
          porters: 2,
          days: 4,
          cost: 8,
          done: 2,
        },
      ],
      nextId: 2,
    } as unknown as VillageState['trade'];
    s.chronicle = [
      { day: s.lastDay - 1, kind: 'trade-departed', direction, give: { tools: 12 } },
    ] as unknown as VillageState['chronicle'];
    const next = withoutForeignGoods(withIronBarsTrade(s));
    expect(next.trade!.expeditions[0]!.get).toEqual({ ironBars: 5 });
    expect(next.trade!.expeditions[0]!.give).toEqual({ grain: 500 });
    expect(next.chronicle[0]).toMatchObject({ give: { ironBars: 10 } });
    // jednou
    const again = withIronBarsTrade(next);
    expect(again).toBe(next);
  });

  it('nástroje výpravy na trh a zásilky jsou zboží – převod je nechá (markets.md – plán 3, bod 4)', () => {
    const s = village();
    const expedition = {
      direction: 'E' as const,
      trailId: -1,
      startedDay: s.lastDay,
      get: {},
      porters: 1,
      days: 3,
      cost: 3,
      done: 0,
    };
    s.trade = {
      expeditions: [
        { ...expedition, id: 1, kind: 'market', give: { tools: 5, grain: 100 } },
        { ...expedition, id: 2, kind: 'shipment', give: { woodTools: 4, tools: 2 } },
      ],
      nextId: 3,
    };
    expect(withIronBarsTrade(s)).toBe(s);
    expect(withoutForeignGoods(s)).toBe(s);
  });

  it('v simulaci starší kovárna s nástroji v zásobě pracuje dál', () => {
    const s = village();
    withSmith(s);
    (s as unknown as { crafts: Record<string, number> }).crafts = {
      charcoalKg: 5_000,
      toolsKg: 25,
      potteryKg: 0,
    };
    const next = advanceVillage(s, s.lastDay + 60, null);
    expect('toolsKg' in next.crafts!).toBe(false);
    // 6 pracujících → potřeba 18 kg, přebytek 7 kg → 5,8 kg hřiven
    expect(toolEquipmentKg(next)).toBeGreaterThan(17);
    expect(next.crafts!.ironBarsKg).toBeGreaterThan(0);
  });
});
