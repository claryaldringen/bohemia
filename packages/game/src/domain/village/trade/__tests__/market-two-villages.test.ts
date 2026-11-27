import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import { villageCarts } from '../../crafts/carts';
import { smithBarsTargetKg } from '../../crafts/crafts';
import { FORGE } from '../../crafts/iron-rates';
import { toolEquipmentKg, toolNeedKg } from '../../crafts/iron';
import { oxenHome } from '../../livestock/oxen';
import { CRAFT_NEEDS } from '../../rules';
import type {
  ChronicleEvent,
  MarketArrival,
  MarketPerson,
  MarketResult,
  Person,
  VillageMail,
  VillageState,
} from '../../types';
import { marketResult, marketResultRef } from '../market';
import { marketStance } from '../market-stance';
import { departMarket } from '../market-trip';
import { expeditionLaborNeed } from '../trade';
import { planVillagerPurchases } from '../villager-trips';
import { craftCoverage } from '../../crafts/crafts';
import { reservedSeedKg } from '../../fields/seed';
import { seedShortKg } from '../../fields/seed-reserve';
import {
  DAUGHTER,
  SON,
  brideVillage,
  seekerVillage,
} from '../../people/__tests__/kin-match-fixtures';
import {
  D,
  FAMILY_IDS,
  NOV15,
  SEP1,
  asEvents,
  familyHome,
  homeVillage,
  marketVillage,
  seedHome,
  sownPart,
  target,
  villagersHome,
  withWorkshop,
  withoutOutbox,
} from './market-fixtures';

// Dvě vsi a trh mezi nimi (markets.md – Co se ověří, bod 2 bez kupců): výprava z H prodá obilí na
// trhu M a koupí krávu. Vsi mezi kroky žijí (jídlo, práce, stáda), proto se bilance počítá jen ze
// zboží výpravy a trhu, ne z celých zásob. Pošta mezi vsemi jde jako události schránky.

describe('výprava na trh mezi dvěma vsemi (markets.md – Co se ověří, bod 2)', () => {
  it('v součtu nic nevznikne ani nezmizí; cena a zpráva přijdou domů', () => {
    const h = homeVillage();
    const m = marketVillage();
    const sent = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    // obchody hostitele
    const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!;
    const h1 = advanceVillage(withoutOutbox(sent.state), D + 2, null, null, asEvents(m1.outbox!));
    const back = h1.chronicle.find((e) => e.kind === 'market-returned')!;
    // kronika hostitele: nejdřív příjezd výpravy, pak obchod (morning.push – ranní zápisy po ranách)
    const kinds = m1.chronicle.map((e) => e.kind);
    expect(kinds.indexOf('market-arrived')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('market-arrived')).toBeLessThan(kinds.indexOf('market-held'));
    // odešlo z H (týž den, bez simulace)
    expect(h.storesKg - sent.state.storesKg).toBeCloseTo(600, 6);
    expect(result.sold.grain! + (result.unsold.grain ?? 0)).toBeCloseTo(600, 6);
    // co výprava koupila, hostitel prodal; co výprava prodala, hostitel koupil
    expect(held).toMatchObject({ sold: result.bought });
    expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6);
    expect(back).toMatchObject({ sold: result.sold, bought: { cows: 1 }, unsold: result.unsold });
    expect(h1.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    // cena krávy zůstala na dně – nabídka převýšila poptávku, ale pod výchozí cenu nejde
    expect(m1.market!.prices.cows!).toBeCloseTo(20 / 3, 12); // 600 kg ÷ 90 kg za minci
    expect(h1.news![0]).toMatchObject({ villageId: 'm', prices: m1.market!.prices });
  });

  it('totéž s 20 mincemi: mince prodané hostiteli = mince koupené, součet týž, v kronice obou stran', () => {
    const h = homeVillage();
    h.coins = 20;
    const m = marketVillage();
    m.crafts = { charcoalKg: 0, potteryKg: 500 };
    // kráva za 600 kg obilí zápočtem, 75 kg keramiky za 2,5 mince (1/30 mince za kg), platí se 3
    const sent = departMarket(
      h,
      D,
      { give: { grain: 600, coins: 20 }, wants: { cows: 1, pottery: 75 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const arrival = (sent.state.outbox![0]!.body as { arrival: MarketArrival }).arrival;
    // mince odešly s výpravou celé, ve vsi nezůstala žádná
    expect(sent.state).not.toHaveProperty('coins');
    expect(arrival.goods).toEqual({ grain: 600, coins: 20 });
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!;
    // zaplacené mince má hostitel, zbytek měšce jde domů – do `sold` a `bought` se nepřičítají
    expect(result).toMatchObject({ coinsPaid: 3, unsold: { coins: 17 } });
    expect(result).not.toHaveProperty('coinsGot');
    expect(result.bought).toEqual({ cows: 1, pottery: 75 });
    expect(Object.keys(result.sold)).toEqual(['grain']);
    expect(m1.coins).toBe(3);
    expect(m1.coins! + result.unsold.coins!).toBe(20);
    expect(held.sold).toEqual(result.bought);
    expect(held.bought.coins).toBe(result.coinsPaid);
    expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6);
    const h1 = advanceVillage(withoutOutbox(sent.state), D + 2, null, null, asEvents(m1.outbox!));
    type Returned = Extract<ChronicleEvent, { kind: 'market-returned' }>;
    const back = h1.chronicle.find((e): e is Returned => e.kind === 'market-returned')!;
    expect(h1.coins).toBe(17);
    expect(back.sold).toStrictEqual({ grain: result.sold.grain!, coins: 3 });
    expect(back.bought).toStrictEqual({ cows: 1, pottery: 75 });
    expect(back.unsold).not.toHaveProperty('coins');
    // dopočet obou vsí po kouscích dá týž stav
    const mParts = advanceVillage(
      JSON.parse(JSON.stringify(advanceVillage(m, D, null, null))) as VillageState,
      D + 1,
      null,
      null,
      asEvents(sent.state.outbox!),
    );
    expect(JSON.parse(JSON.stringify(mParts))).toEqual(JSON.parse(JSON.stringify(m1)));
  });

  it('o mapu dál: příjezd D + 2, výsledek D + 4, lidé pryč D + 1 až D + 3', () => {
    const h = homeVillage();
    const m = marketVillage();
    const far = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
      { ...target, cells: 2 },
    );
    if (!far.ok) throw new Error(far.reason);
    expect(far.state.outbox).toEqual([expect.objectContaining({ day: D + 2 })]);
    const mFar = advanceVillage(m, D + 2, null, null, asEvents(far.state.outbox!));
    expect(mFar.outbox).toEqual([
      expect.objectContaining({ day: D + 4, ref: marketResultRef(far.trip.key) }),
    ]);
    expect([D + 1, D + 3, D + 4].map((d) => expeditionLaborNeed(far.state, d))).toEqual([3, 3, 0]);
  });

  it('domovská ves po kouscích dopočtu = vcelku; vůz pryč jen ve dnech cesty a pobytu', () => {
    const h = homeVillage();
    const m = marketVillage();
    const sent = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 2 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 2, null, null, asEvents(sent.state.outbox!));
    const events = asEvents(m1.outbox!);
    expect(events.map((e) => e.day)).toEqual([D + 3]);
    const home = withoutOutbox(sent.state);
    const whole = advanceVillage(home, D + 4, null, null, events);
    let parts = home;
    for (const day of [D + 1, D + 2, D + 3, D + 4]) {
      parts = advanceVillage(parts, day, null, null, events);
      // vůz je pryč ve dnech D + 1 a D + 2, od D + 3 doma (výsledek přijde týž den)
      expect(parts.trade!.expeditions.some((e) => (e.carts ?? []).length > 0)).toBe(day < D + 3);
    }
    expect(parts).toEqual(whole);
    expect(whole.chronicle.filter((e) => e.kind === 'market-returned')).toHaveLength(1);
  });

  // Výrobky dílen (markets.md – Rozhodnutí plánu 3, body 4 a 5): ves bez kováře koupí nástroje
  // u kováře souseda za obilí. Bilance proti téže vsi bez trhu (vsi mezi kroky žijí).
  it('nástroje za obilí: H bez kováře koupí 10 kg od M s kovářem, 2/3 mince za kg proti 1 ÷ 90', () => {
    const h = homeVillage();
    h.toolEquipmentKg = toolNeedKg(h, D) - 10;
    const m = marketVillage();
    withWorkshop(m, 'smith', 700, { oreKg: 500 });
    m.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    m.toolEquipmentKg = toolNeedKg(m, D) + 30;
    // M nabízí vybavení nad potřebu a shání obilí; H shání přesně 10 kg
    expect(marketStance(m, D).offer.tools).toBe(30);
    expect(marketStance(m, D).wants.grain).toBeGreaterThan(600);
    expect(marketStance(h, D).wants.tools).toBe(10);
    const sent = departMarket(
      h,
      D,
      { give: { grain: 900 }, wants: { tools: 10 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const mAlone = advanceVillage(m, D + 1, null, null);
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    // 10 kg × 2/3 mince = 6,67 mince = 600 kg obilí × 1 ÷ 90; zbylých 300 kg se vrátí
    expect(result.bought).toEqual({ tools: 10 });
    expect(result.sold.grain).toBeCloseTo(600, 6);
    expect(result.unsold.grain).toBeCloseTo(300, 6);
    expect(m1.market!.prices.tools).toBeCloseTo(2 / 3, 12);
    // M prodal nástroje a koupil přesně obilí, které H prodala
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!;
    expect(held.sold).toEqual({ tools: 10 });
    expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6);
    // M: o 10 kg vybavení méně (nad potřebou se opotřebí stejně); zásoby obilí o prodané víc, bez
    // ztrát skladováním zbytku dne (0,17 kg z 600)
    expect(toolEquipmentKg(mAlone) - toolEquipmentKg(m1)).toBeCloseTo(10, 9);
    expect(m1.storesKg - mAlone.storesKg).toBeCloseTo(600, 0);
    expect(m1.storesKg - mAlone.storesKg).toBeLessThan(600);
    // H: výsledek ráno D + 2 přidá 10 kg do vybavení; ten den se v užívání opotřebí jako ostatní
    // (CRAFT_NEEDS.toolWearPerYear ÷ 365 – wearCraftStocks)
    const home = withoutOutbox(sent.state);
    const h1 = advanceVillage(home, D + 2, null, null, asEvents(m1.outbox!));
    const hAlone = advanceVillage(home, D + 2, null, null);
    expect(h1.chronicle.find((e) => e.kind === 'market-returned')).toMatchObject({
      bought: { tools: 10 },
    });
    expect(toolEquipmentKg(h1) - toolEquipmentKg(hAlone)).toBeCloseTo(
      10 * (1 - CRAFT_NEEDS.toolWearPerYear / 365),
      9,
    );
  });

  // Vozy (markets.md – Rozhodnutí plánu 3, body 4 a 5): H bez tesaře koupí dvoukolák od M s tesařem
  // za obilí; koupený vůz táhne domů vůl, který jde s výpravou.
  it('vůz za obilí: H o vůz víc, M o ten s vyšším id méně, voli H doma v returnDay', () => {
    const h = homeVillage();
    // čtyřkolák s párem volů poveze obilí, další 2 vycvičení voli jsou volní
    h.pens!.find((p) => p.id === 900)!.oxen = Array.from({ length: 4 }, () => ({
      trainedDay: D - 10,
    }));
    const m = marketVillage();
    withWorkshop(m, 'carpenter', 700);
    m.carts = [
      { id: 1, kind: 'two-wheel', builtDay: D - 400 },
      { id: 2, kind: 'two-wheel', builtDay: D - 300 },
    ];
    // M bez ohrady volů žádný vůz nechce – nabízí oba, shání obilí
    expect(marketStance(m, D).offer.twoWheelCarts).toBe(2);
    expect(marketStance(m, D).wants.grain).toBeGreaterThan(400);
    const order = { give: { grain: 400 }, wants: { twoWheelCarts: 1 }, stayDays: 1 };
    const sent = departMarket(h, D, order, target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(sent.trip).toMatchObject({ oxen: 1, returnDay: D + 2 });
    // na cestě čtyřkolák se 2 voly a vůl pro koupený vůz
    expect(oxenHome(sent.state, D + 1)).toBe(1);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    // dvoukolák 320 kg obilí (21⅓ mince); zbylých 80 kg se vrátí
    expect(result.bought).toEqual({ twoWheelCarts: 1 });
    expect(result.sold.grain).toBeCloseTo(320, 6);
    expect(result.unsold.grain).toBeCloseTo(80, 6);
    expect(villageCarts(m1).map((c) => c.id)).toEqual([1]);
    const home = withoutOutbox(sent.state);
    const h1 = advanceVillage(home, D + 2, null, null, asEvents(m1.outbox!));
    expect(villageCarts(h1)).toHaveLength(villageCarts(h).length + 1);
    // koupený vůz má stáří vozu prodejce (nejmladší volný vůz M, id 2)
    expect(villageCarts(h1).at(-1)).toEqual({ id: 2, kind: 'two-wheel', builtDay: D - 300 });
    expect(oxenHome(h1, D + 2)).toBe(4);
    expect(h1.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    // voli jsou doma v returnDay i bez výsledku trhu (výprava čeká na zboží)
    const late = advanceVillage(home, D + 2, null, null);
    expect(oxenHome(late, D + 2)).toBe(4);
    expect(late.trade!.expeditions.find((e) => e.kind === 'market')!.market!.oxen).toBeUndefined();
  });

  // Zakázka (markets.md – Rozhodnutí plánu 3, bod 6; Martin 24. 11. 2026 – řemeslník bere obilí
  // vždy): M s kovářem nemá nástroje na prodej a obilí neshání, přesto zakázku H vezme, vykove ji,
  // ohlásí a druhé výpravě H nástroje prodá za obilí.
  it('zakázka: M nástroje vykove, ohlásí a prodá druhé výpravě H za obilí', () => {
    const h = homeVillage();
    h.toolEquipmentKg = toolNeedKg(h, D) - 10;
    const m = marketVillage(-1_000);
    withWorkshop(m, 'smith', 700, { oreKg: 500 });
    // hřivny na zakázku má kovář na skladě – z rudy by 10 kg nástrojů trvalo skoro rok
    m.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    m.crafts.ironBarsKg = smithBarsTargetKg(m, D) + 10 * FORGE.barsKgPerKg;
    m.toolEquipmentKg = toolNeedKg(m, D);
    m.nearby = {
      day: D - 1,
      self: { villageId: 'm', name: 'Lhota' },
      villages: [{ villageId: 'h', name: 'Vlkov', cells: 1, firstStep: 'W' }],
    };
    // M nástroje nenabízí (vybavení na potřebě) a obilí neshání (nad pojistkou)
    expect(marketStance(m, D).offer.tools).toBeUndefined();
    expect(marketStance(m, D).wants.grain).toBeUndefined();
    const list = { give: { grain: 900 }, wants: { tools: 10 }, stayDays: 1 };
    const first = departMarket(h, D, list, target);
    if (!first.ok) throw new Error(first.reason);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(first.state.outbox!));
    // M nic neprodala – zakázka zapsaná při odjezdu, výsledek ji nese
    expect(m1.market!.orders).toEqual([
      { villageId: 'h', name: 'Vlkov', good: 'tools', amount: 10, day: D + 1 },
    ]);
    const firstResult = resultMail(m1, first.trip.key);
    expect(firstResult.ordered).toEqual({ tools: 10 });
    expect(firstResult.bought).toEqual({});
    const h1 = advanceVillage(withoutOutbox(first.state), D + 2, null, null, [
      resultEvent(m1, first.trip.key),
    ]);
    expect(h1.orders).toEqual([
      { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10, day: D + 2, status: 'open' },
    ]);

    // M kuje na zakázku a ohlásí ji (nejvýš 60 dní)
    let mk = withoutOutbox(m1);
    // M bez výpravy H – bez zakázky
    let mAlone = advanceVillage(m, D + 1, null, null);
    while (!mk.outbox?.some((x) => x.body.kind === 'order-ready') && mk.lastDay < D + 61) {
      mk = advanceVillage(mk, mk.lastDay + 1, null, null);
      mAlone = advanceVillage(mAlone, mAlone.lastDay + 1, null, null);
    }
    const ready = mk.outbox!.find((x) => x.body.kind === 'order-ready')!;
    expect(ready).toEqual({
      villageId: 'h',
      day: mk.lastDay + 1,
      ref: `order:m:h:tools:${D + 1}`,
      body: {
        kind: 'order-ready',
        ready: { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 },
      },
    });
    expect(mk.market!.orders).toEqual([
      {
        villageId: 'h',
        name: 'Vlkov',
        good: 'tools',
        amount: 10,
        day: D + 1,
        readyDay: mk.lastDay,
      },
    ]);
    // zásoba nad potřebou po opotřebení dne ohlášení
    expect(toolEquipmentKg(mk) - toolNeedKg(mk, mk.lastDay)).toBeCloseTo(10, 1);

    // H se dozví ráno dne zprávy a pošle druhou výpravu
    const h2 = advanceVillage(h1, ready.day, null, null, asEvents([ready]));
    expect(h2.chronicle.filter((e) => e.kind === 'order-ready')).toEqual([
      { day: ready.day, kind: 'order-ready', villageName: 'Lhota', villageId: 'm', good: 'tools' },
    ]);
    expect(h2.orders![0]!.status).toBe('ready');
    const second = departMarket(h2, ready.day, list, target);
    if (!second.ok) throw new Error(second.reason);
    const arrive = asEvents(second.state.outbox!);
    const m2 = advanceVillage(withoutOutbox(mk), arrive[0]!.day, null, null, arrive);
    const mAlone2 = advanceVillage(mAlone, arrive[0]!.day, null, null);
    const result = resultMail(m2, second.trip.key);
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = m2.chronicle.filter((e): e is Held => e.kind === 'market-held').at(-1)!;
    // H koupí nástroje zakázky – bez opotřebení vybavení M od ohlášení po trh (nejvýš 2 dny)
    const bought = result.bought.tools!;
    const wearPerDay = (toolNeedKg(mk, mk.lastDay) * CRAFT_NEEDS.toolWearPerYear) / 365;
    expect(bought).toBeLessThanOrEqual(10);
    expect(bought).toBeGreaterThan(10 - 2 * wearPerDay - 1e-9);
    // vyzvednutí hotovou zakázku uzavře – hostiteli nezůstane zakázka na gramy opotřebení
    expect(result.ordered).toBeUndefined();
    expect(m2.market?.orders).toBeUndefined();
    // obilí jen mezi H a M: co H prodala, M koupila; co M prodala, H koupila
    expect(held.sold).toEqual({ tools: bought });
    expect(held.bought).toEqual(result.sold);
    expect(result.sold.grain).toBeGreaterThan(0);
    expect(Object.keys(result.sold)).toEqual(['grain']);
    // nástroje, které M vykovala navíc, odešly k H: M je po prodeji zase na potřebě (bez zbytku
    // zakázky a dne opotřebení), M bez zakázky navíc nekovala
    expect(Math.abs(toolEquipmentKg(m2) - toolNeedKg(m2, m2.lastDay))).toBeLessThan(2 * wearPerDay);
    expect(toolEquipmentKg(mAlone2)).toBeLessThan(toolNeedKg(mAlone2, mAlone2.lastDay) + 1);
    const back = resultEvent(m2, second.trip.key);
    const h3 = advanceVillage(withoutOutbox(second.state), back.day, null, null, [back]);
    const hAlone3 = advanceVillage(withoutOutbox(second.state), back.day, null, null);
    expect(h3.chronicle.filter((e) => e.kind === 'market-returned').at(-1)).toMatchObject({
      bought: { tools: bought },
    });
    // H přibyly koupené nástroje (ten den se v užívání opotřebí jako ostatní)
    expect(toolEquipmentKg(h3) - toolEquipmentKg(hAlone3)).toBeCloseTo(
      bought * (1 - CRAFT_NEEDS.toolWearPerYear / 365),
      9,
    );
    // koupené zakázku uzavře
    expect(h3.orders ?? []).toEqual([]);
  });
});

// Vesničané na trhu (markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7; Martin 24. 11. 2026 –
// řemeslník bere obilí vždy): H bez kováře 15. 11. sama pošle výpravu pro nástroje do M s kovářem,
// která obilí neshání (nad pojistkou). Bilance proti týmž vsím bez trhu (vsi mezi kroky žijí).
describe('vesničané na trhu mezi dvěma vsemi (Rozhodnutí plánu 3, bod 7)', () => {
  it('H o plánované nástroje víc, M o ně méně a o zaplacené obilí víc; kronika s vesmi', () => {
    const NOV16 = NOV15 + 1;
    const h = villagersHome();
    const plan = planVillagerPurchases(h, NOV15, craftCoverage(h, NOV15))[0]!;
    expect(plan).toMatchObject({ good: 'tools', villageId: 'm', worthIt: true });
    const m = marketVillage();
    m.lastDay = NOV15;
    withWorkshop(m, 'smith', 700, { oreKg: 500 });
    m.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    m.toolEquipmentKg = toolNeedKg(m, NOV16) + 30;
    // M obilí neshání: bez zásob by shánělo celou pojistku, má o 1 000 kg víc
    m.storesKg = 0;
    m.storesKg = marketStance(m, NOV16).wants.grain! + 1_000;
    expect(marketStance(m, NOV16).wants.grain).toBeUndefined();
    expect(marketStance(m, NOV16).offer.tools).toBe(30);

    // H 15. 11. – výprava vesničanů do M (příjezd 16. 11.)
    const h1 = advanceVillage(h, NOV15, null, null);
    const sent = h1.trade!.expeditions.find((e) => e.by === 'villagers')!;
    expect(sent.market!.wants).toEqual({ tools: plan.amount });
    const paid = sent.give.grain!;
    expect(paid).toBeCloseTo(plan.amount * 60, 6);
    const m1 = advanceVillage(m, NOV16, null, null, asEvents(h1.outbox!));
    const mAlone = advanceVillage(m, NOV16, null, null);
    const result = resultMail(m1, sent.market!.key);
    expect(result.bought.tools).toBeCloseTo(plan.amount, 9);
    expect(result.sold.grain).toBeCloseTo(paid, 6);
    expect(m1.chronicle.find((e) => e.kind === 'market-arrived')).toMatchObject({
      villageName: 'Vlkov',
      villageId: 'h',
    });
    // M: o nástroje méně, o zaplacené obilí víc (bez ztrát skladováním zbytku dne)
    expect(toolEquipmentKg(mAlone) - toolEquipmentKg(m1)).toBeCloseTo(plan.amount, 9);
    expect(m1.storesKg - mAlone.storesKg).toBeCloseTo(paid, 0);
    // H: výsledek 17. 11. přidá nástroje do vybavení – ten den se opotřebí jen v užívání (do
    // potřeby), takže přibude plánované množství bez nejvýš dne opotřebení
    const home = withoutOutbox(h1);
    const back = resultEvent(m1, sent.market!.key);
    expect(back.day).toBe(NOV16 + 1);
    const h2 = advanceVillage(home, back.day, null, null, [back]);
    const hAlone = advanceVillage(home, back.day, null, null);
    const gained = toolEquipmentKg(h2) - toolEquipmentKg(hAlone);
    expect(gained).toBeLessThanOrEqual(plan.amount);
    expect(gained).toBeGreaterThan(plan.amount * (1 - CRAFT_NEEDS.toolWearPerYear / 365));
    expect(h2.chronicle.filter((e) => e.kind === 'market-returned')).toEqual([
      expect.objectContaining({
        day: back.day,
        villageName: 'Lhota',
        villageId: 'm',
        by: 'villagers',
        bought: { tools: result.bought.tools },
      }),
    ]);
    expect(h2.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
  });

  it('osivo za krávu: M krávy shání a obilí nabízí – H má po návratu osivo v rezervě', () => {
    const h = advanceVillage(seedHome(200), SEP1, null, null);
    const sent = h.trade!.expeditions.find((e) => e.by === 'villagers')!;
    expect(sent.give).toEqual({ cows: 1, ironBars: 2 });
    const arrive = sent.market!.arriveDay;
    const m = marketVillage();
    m.lastDay = arrive - 1;
    m.livestock!.herds.cow = 1;
    m.storesKg = 0;
    m.storesKg = marketStance(m, arrive).wants.grain! + 3_000;
    expect(marketStance(m, arrive).wants.cows).toBeGreaterThan(0);
    expect(marketStance(m, arrive).offer.grain).toBeGreaterThan(1_000);
    const m1 = advanceVillage(m, arrive, null, null, asEvents(h.outbox!));
    const result = resultMail(m1, sent.market!.key);
    // kráva se prodá celá za 600 kg obilí, hřivny M neshání
    expect(result.sold).toEqual({ cows: 1 });
    expect(result.bought).toEqual({ grain: 600 });
    expect(result.unsold).toEqual({ ironBars: 2 });
    const home = withoutOutbox(h);
    const back = resultEvent(m1, sent.market!.key);
    const h2 = advanceVillage(home, back.day, null, null, [back]);
    const hAlone = advanceVillage(home, back.day, null, null);
    expect(seedShortKg(hAlone, back.day)).toBeGreaterThan(100);
    expect(seedShortKg(h2, back.day)).toBeCloseTo(0, 6);
    // osivem je jen chybějících 200 kg, zbytek (400 kg) je jídlo v zásobách
    expect(reservedSeedKg(h2) - reservedSeedKg(hAlone)).toBeCloseTo(200, 6);
    expect(h2.crafts!.ironBarsKg).toBe(2);
  });
});

// Lidé na trhu (markets.md – Rozhodnutí plánu 3, bod 10): lidé cestují jako skuteční lidé – každý je
// vždy právě na jednom místě (ve vsi, v nákladu pošty, na trhu), nikdo nevznikne ani nezmizí.
describe('lidé na trhu mezi dvěma vsemi (Rozhodnutí plánu 3, bod 10)', () => {
  /** Lhota (M) s půdou nad práci (200 osetých dílů) a 2 000 kg obilí nad pojistkou, den před D. */
  function peopleHost(): VillageState {
    const m = marketVillage();
    m.fields = [{ id: 1 }];
    m.parts = Array.from({ length: 200 }, (_, i) => sownPart(100 + i));
    m.storesKg = 0;
    m.storesKg = marketStance(m, D).wants.grain! + 2_000;
    return m;
  }

  /** Lidé na cestě: v nákladu odchozí schránky (příjezdy, výsledky) a na trhu vsi. */
  function onTheWay(s: VillageState): number {
    let n = 0;
    const count = (groups: readonly MarketPerson[] | undefined): void => {
      for (const g of groups ?? []) n += g.people.length;
    };
    for (const mail of s.outbox ?? []) {
      if (mail.body.kind === 'market-arrive') count(mail.body.arrival.people);
      if (mail.body.kind === 'market-result') {
        count(mail.body.result.people);
        count(mail.body.result.newcomers);
      }
    }
    for (const v of s.market?.visitors ?? []) {
      count(v.people);
      count(v.boughtPeople);
    }
    return n;
  }

  /** Porody minus úmrtí v kronice vsi po dni `after` (lidé, kteří ve vsi přibyli sami). */
  function bornMinusDied(s: VillageState, after: number): number {
    const kinds = s.chronicle.filter((e) => e.day > after).map((e) => e.kind);
    return kinds.filter((k) => k === 'birth').length - kinds.filter((k) => k === 'death').length;
  }

  it('rodina na trhu: M o 4 lidi víc (nová id), H o 4 méně a o 720 kg obilí víc', () => {
    const h = familyHome();
    const m = peopleHost();
    expect(marketStance(m, D).wants.families).toBeGreaterThan(0);
    // ves, která shání rodiny, neshání otroky (Rozhodnutí plánu 5, bod 7)
    expect(marketStance(m, D).wants.slaves).toBeUndefined();
    expect(marketStance(m, D).offer.grain).toBeGreaterThan(720);
    const total = h.people.length + m.people.length;
    const sent = departMarket(
      h,
      D,
      { give: { families: 1 }, wants: { grain: 720 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    // odchod: rodina je v nákladu příjezdu
    expect(onTheWay(sent.state)).toBe(4);
    expect(sent.state.people.length + onTheWay(sent.state) + m.people.length).toBe(total);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const result = resultMail(m1, sent.trip.key);
    expect(result.sold).toEqual({ families: 1 });
    expect(result.bought.grain).toBeCloseTo(720, 6);
    // M rodinu usadila s novými id od svého nextId, ze západu (H je na západě)
    const came = m1.people.filter((p) => p.id >= m.nextId && p.origin === 'W');
    expect(came).toHaveLength(4);
    expect(m1.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'newcomer', group: 'family', villageName: 'Vlkov' }),
    );
    // po trhu: na cestě jen výsledek bez lidí – bez `origin` (Rozhodnutí plánu 3, bod 13)
    expect(onTheWay(m1)).toBe(0);
    expect(result.origin).toBeUndefined();
    const bornM = bornMinusDied(m1, m.lastDay);
    expect(m1.people.length + sent.state.people.length - bornM).toBe(total);
    const home = withoutOutbox(sent.state);
    const h1 = advanceVillage(home, D + 2, null, null, asEvents(m1.outbox!));
    const hAlone = advanceVillage(home, D + 2, null, null);
    // návrat: H o 720 kg obilí víc než bez trhu (bez ztrát skladování dne návratu),
    // o rodinu méně, nikdo nezmizel
    expect(h1.storesKg - hAlone.storesKg).toBeCloseTo(720, 0);
    expect(h1.storesKg - hAlone.storesKg).toBeLessThanOrEqual(720);
    const bornH = bornMinusDied(h1, D);
    expect(h.people.length - h1.people.length + bornH).toBe(4);
    expect(family(h1.people)).toEqual([]);
    expect(h1.emigrants!.filter((e) => FAMILY_IDS.includes(e.id)).map((e) => e.direction)).toEqual([
      'E',
      'E',
      'E',
      'E',
    ]);
    expect(h1.people.length + m1.people.length - bornH - bornM).toBe(total);
  });

  it('neprodaná rodina: výsledek ji nese s výpravou, jak ji viděl hostitel (`origin`)', () => {
    // M lidi neshání (bez polí) – rodina se neprodá a jde s výsledkem domů; zanikne-li H, pošta ji
    // podle `origin` vrátí k M (Rozhodnutí plánu 3, bod 13)
    const sent = departMarket(
      familyHome(),
      D,
      { give: { families: 1 }, wants: { grain: 720 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(marketVillage(), D + 1, null, null, asEvents(sent.state.outbox!));
    const result = resultMail(m1, sent.trip.key);
    expect(result.unsold).toEqual({ families: 1 });
    expect(result.people!.flatMap((g) => g.people.map((p) => p.id))).toEqual(FAMILY_IDS);
    expect(result.origin).toEqual({ villageId: 'h', villageName: 'Vlkov', direction: 'W' });
  });

  it('zaniklý hostitel: výsledek returned vrátí H rodinu s původními id', () => {
    const sent = departMarket(
      familyHome(),
      D,
      { give: { families: 1 }, wants: { grain: 720 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const mail = sent.state.outbox![0]!;
    if (mail.body.kind !== 'market-arrive') throw new Error('příjezd chybí');
    // M zanikla (`extinctDay`) před příjezdem: pošta vrátí nepoužitý příjezd jako výsledek
    // `returned` se vším, co výprava vezla, v den plánovaného návratu (application/village-mail.ts)
    const back: VillageMail = {
      villageId: 'h',
      day: sent.trip.returnDay,
      ref: marketResultRef(sent.trip.key),
      body: { kind: 'market-result', result: marketResult(mail.body.arrival, { returned: true }) },
    };
    const home = withoutOutbox(sent.state);
    const h1 = advanceVillage(home, sent.trip.returnDay, null, null, asEvents([back]));
    // po kouscích dopočtu stejně jako vcelku
    let parts = home;
    for (let day = D + 1; day <= sent.trip.returnDay; day++) {
      parts = advanceVillage(parts, day, null, null, asEvents([back]));
    }
    expect(parts).toEqual(h1);
    expect(ids(family(h1.people))).toEqual(FAMILY_IDS);
    expect(h1.people.find((p) => p.id === 64)).toMatchObject({ motherId: 63, fatherId: 62 });
    expect((h1.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
    // nikdo nový – nová id mají jen narození, lidí je o rodinu víc
    const born = h1.chronicle.filter((e) => e.day > D && e.kind === 'birth').length;
    expect(h1.people.filter((p) => p.id >= home.nextId)).toHaveLength(born);
    expect(h1.people.length - home.people.length - bornMinusDied(h1, D)).toBe(4);
    expect(h1.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'market-returned', returned: true, unsold: { families: 1 } }),
    );
  });
});

describe('nevěsta ze sousední vsi (Rozhodnutí plánu 3, bod 11)', () => {
  /** Lidé v nákladu odchozí schránky (příjezdy, výsledky) a na trhu vsi. */
  function travelling(s: VillageState): number {
    let n = 0;
    const count = (groups: readonly MarketPerson[] | undefined): void => {
      for (const g of groups ?? []) n += g.people.length;
    };
    for (const mail of s.outbox ?? []) {
      if (mail.body.kind === 'market-arrive') count(mail.body.arrival.people);
      if (mail.body.kind === 'market-result') {
        count(mail.body.result.people);
        count(mail.body.result.newcomers);
      }
    }
    for (const v of s.market?.visitors ?? []) count(v.people);
    return n;
  }

  /** Porody a úmrtí v kronice vsi po dni `after` – v okně kola nemají být. */
  function bornOrDied(s: VillageState, after: number): number {
    return s.chronicle.filter((e) => e.day > after && (e.kind === 'birth' || e.kind === 'death'))
      .length;
  }

  it('dotaz → výprava → příjezd → výsledek: v A vdaná, v B v emigrants, nikdo nevznikl ani nezmizel', () => {
    // A (Lhota) – syn bez nevěsty; B (Bukovec) – dcera bez ženicha; obě vsi se znají z okolí
    const a0 = seekerVillage();
    const b0 = brideVillage();
    // první rok, ve kterém A pošle dotaz – pak znovu přesně do dne dotazu (dopočet je deterministický)
    let from = a0;
    let probe = a0;
    for (let year = 1; year <= 20; year++) {
      probe = advanceVillage(from, a0.lastDay + Math.round(year * 365.25), null);
      if (probe.outbox?.some((m) => m.body.kind === 'kin-ask')) break;
      from = probe;
    }
    const ask = probe.outbox!.find((m) => m.body.kind === 'kin-ask')!;
    const d = ask.day - 1;
    const a1 = advanceVillage(from, d, null);
    expect(a1.outbox).toEqual([ask]);
    const bD = advanceVillage(b0, d, null);
    const total = a1.people.length + bD.people.length;
    // B dostane dotaz a pošle dceru s doprovodem
    const b1 = advanceVillage(bD, d + 1, null, null, asEvents(a1.outbox!));
    expect(b1.people.map((p) => p.id)).not.toContain(DAUGHTER);
    expect(b1.emigrants).toContainEqual(expect.objectContaining({ id: DAUGHTER, direction: 'W' }));
    const trip = b1.trade!.expeditions.find((e) => e.by === 'kin')!;
    expect(trip.market).toMatchObject({ villageId: 'a', arriveDay: d + 2, returnDay: d + 3 });
    expect(a1.people.length + b1.people.length + travelling(b1)).toBe(total);
    // A: příjezd – svatba hned, doprovod večer odjede s prázdným výsledkem
    const a2 = advanceVillage(withoutOutbox(a1), d + 2, null, null, asEvents(b1.outbox!));
    const son = a2.people.find((p) => p.id === SON)!;
    const bride = a2.people.find((p) => p.id === son.spouseId)!;
    expect(bride).toMatchObject({ sex: 'female', spouseId: SON, origin: 'E' });
    expect(a2.chronicle).toContainEqual(
      expect.objectContaining({
        kind: 'bride-from-outside',
        villageName: 'Bukovec',
        villageId: 'b',
      }),
    );
    expect(a2.people.length + b1.people.length + travelling(a2)).toBe(total);
    const result = resultMail(a2, trip.market!.key);
    expect(result).toMatchObject({ sold: {}, bought: {}, unsold: {} });
    expect(result.people).toBeUndefined();
    // B: doprovod je doma v returnDay, výprava zmizí s výsledkem
    expect([d + 2, d + 3].map((day) => expeditionLaborNeed(b1, day))).toEqual([1, 0]);
    const b2 = advanceVillage(withoutOutbox(b1), d + 3, null, null, [
      resultEvent(a2, trip.market!.key),
    ]);
    expect(b2.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    expect(a2.people.length + b2.people.length).toBe(total);
    expect(b2.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'married-away', villageName: 'Lhota', villageId: 'a' }),
    );
    expect(bornOrDied(a2, d) + bornOrDied(b2, d)).toBe(0);
  });
});

/** Id lidí vzestupně. */
function ids(people: readonly Person[]): number[] {
  return people.map((p) => p.id).sort((a, b) => a - b);
}

/** Lidé rodiny na prodej (`FAMILY_IDS`) ve vsi. */
function family(people: readonly Person[]): Person[] {
  return people.filter((p) => FAMILY_IDS.includes(p.id));
}

/** Výsledek trhu výpravy `key` z odchozí schránky hostitele. */
function resultMail(s: VillageState, key: string): MarketResult {
  const out = s.outbox!.find((x) => x.ref === marketResultRef(key))!;
  return (out.body as { result: MarketResult }).result;
}

/** Výsledek trhu výpravy `key` jako událost schránky domovské vsi. */
function resultEvent(s: VillageState, key: string): ReturnType<typeof asEvents>[number] {
  return asEvents(s.outbox!.filter((x) => x.ref === marketResultRef(key)))[0]!;
}
