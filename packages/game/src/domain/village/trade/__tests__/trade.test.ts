import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { neighbourOf, neighbourStock } from '../neighbours';
import { TRADE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import {
  EXPEDITION_AWAY,
  addGood,
  NOT_OFFERED,
  NOT_WANTED,
  NO_TRAIL,
  OVER_STOCK,
  OVER_SUPPLY,
  UNFAIR,
  buyPrice,
  expeditionLaborNeed,
  expeditionLaborToday,
  finishExpeditions,
  sellPrice,
  startExpedition,
  tradeQuote,
  villageGoodStock,
  withoutForeignGoods,
  workExpeditions,
} from '../trade';
import { finishTrail, startTrail, trailTripDays } from '../trail';
import type { Direction8, NeighbourStock, TradeGood, TradeGoods, VillageState } from '../../types';
import { CARTS } from '../../rules/rules-crafts';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Obchod se sousedy (trade.md – Obchod): ceny s přirážkou, bilance pro souseda, nosiči po 25 kg,
// dny cesty podle stezky, práce ze společné práce vsi, zboží po návratu, jedna výprava naráz.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });

/** Ves s hotovou stezkou na jih a zásobami všeho, co sousedé můžou chtít. */
function trading(direction: Direction8 = 'S'): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 5000;
  next.meatKg = 300;
  next.cheeseKg = 200;
  next.legumesKg = 300;
  next.woodLogs = 20;
  next.crafts = { charcoalKg: 500, potteryKg: 80, ironBarsKg: 30 };
  next.livestock!.herds.cow = 6;
  return next;
}

/** Výměna, kterou soused vezme: kus jeho nabídky za sháněné zboží v hodnotě s rezervou. */
function fairOffer(
  state: VillageState,
  direction: Direction8,
): { give: TradeGoods; get: TradeGoods } {
  const n = neighbourOf(state.seed, direction);
  const want = n.offers[0]!;
  const get = { [want]: 1 } as TradeGoods;
  const need = buyPrice(want);
  const pay = n.demands.find((g) => villageGoodStock(state, g) * sellPrice(g) >= need)!;
  const give = { [pay]: Math.ceil(need / sellPrice(pay)) } as TradeGoods;
  return { give, get };
}

describe('ceny výměny', () => {
  it('sháněné zboží soused bere za hodnotu, nabízené prodá za 0,96 hodnoty', () => {
    expect(sellPrice('cheese')).toBeCloseTo(4);
    expect(buyPrice('ironBars')).toBeCloseTo(45 * 1.2 * 0.8);
    expect(buyPrice('cows')).toBeCloseTo(600 * 0.96);
    expect(buyPrice('youngOxen')).toBeCloseTo(350 * 0.96);
    expect(buyPrice('trainedOxen')).toBeCloseTo(1200 * 0.96);
    expect(TRADE.markup).toBe(0.2);
  });
});

describe('kůže, kožešiny, med a vosk (hides-honey.md – Obchod)', () => {
  it('zásoba kožešin = z lovu + ovčí, kůže = velké + malé přepočtem plochou, dolů', () => {
    const s = trading();
    s.wares = { hides: 2, smallHides: 3, sheepFurs: 3, wildFurs: 2.5, honeyKg: 7.9, waxKg: 1.2 };
    expect(villageGoodStock(s, 'furs')).toBe(5);
    // 2 + 3 × 0,8 / 3 = 2,8
    expect(villageGoodStock(s, 'hides')).toBe(2);
    expect(villageGoodStock(s, 'honey')).toBe(7);
    expect(villageGoodStock(s, 'wax')).toBe(1);
    expect(villageGoodStock(trading(), 'honey')).toBe(0);
  });

  it('prodej kožešin bere napřed z lovu, nákup přidává k lovu', () => {
    const s = trading();
    s.wares = { hides: 0, sheepFurs: 3, wildFurs: 2.5, honeyKg: 0, waxKg: 0 };
    addGood(s, 'furs', -4, DAY);
    expect(s.wares.wildFurs).toBe(0);
    expect(s.wares.sheepFurs).toBe(1.5);
    addGood(s, 'furs', 6, DAY);
    expect(s.wares.wildFurs).toBe(6);
  });

  it('prodej kůží bere napřed velké, pak malé přepočtem plochou', () => {
    const s = trading();
    s.wares = { hides: 2, smallHides: 15, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0 };
    // 2 + 15 × 0,8 / 3 = 6
    expect(villageGoodStock(s, 'hides')).toBe(6);
    addGood(s, 'hides', -3, DAY);
    expect(s.wares.hides).toBe(0);
    // chybějící kus kůže skotu = 3 / 0,8 malé kůže
    expect(s.wares.smallHides).toBeCloseTo(15 - 3.75);
  });

  it('nákup 10 kg medu přidá honeyKg, prodej nad zásobu je OVER_STOCK', () => {
    const s = trading();
    addGood(s, 'honey', 10, DAY);
    expect(s.wares?.honeyKg).toBe(10);
    const n = neighbourOf(s.seed, 'S');
    const wanted = (['hides', 'furs', 'honey', 'wax'] as TradeGood[]).find((g) =>
      n.demands.includes(g),
    );
    if (wanted) {
      s.wares = { hides: 1, sheepFurs: 1, wildFurs: 0, honeyKg: 1, waxKg: 1 };
      const q = tradeQuote(s, { direction: 'S', give: { [wanted]: 2 }, get: {} }, DAY);
      expect(q.blocked).toBe(OVER_STOCK);
    }
  });

  it('prodej nad zásobu (každý druh souseda, který ho shání) je OVER_STOCK', () => {
    for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as Direction8[]) {
      const n = neighbourOf(11, dir);
      const wanted = n.demands.find((g) => g === 'honey' || g === 'wax');
      if (!wanted) continue;
      const s = trading(dir);
      const q = tradeQuote(s, { direction: dir, give: { [wanted]: 5 }, get: {} }, DAY);
      expect(q.blocked).toBe(OVER_STOCK);
      return;
    }
  });
});

describe('ocenění a kontrola výměny', () => {
  it('bez hotové stezky nejde', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
    );
    expect(tradeQuote(s, { direction: 'S', give: {}, get: {} }, DAY).blocked).toBe(NO_TRAIL);
  });

  it('nosiči po 25 kg, dny podle délky stezky, práce = nosiči × dny', () => {
    const s = trading();
    const { give, get } = fairOffer(s, 'S');
    const quote = tradeQuote(s, { direction: 'S', give, get }, DAY);
    expect(quote.blocked).toBeNull();
    expect(quote.balance).toBeGreaterThanOrEqual(0);
    expect(quote.days).toBe(trailTripDays(s.trails![0]!.lengthM));
    expect(quote.manDays).toBe(quote.porters * quote.days);
    const n = neighbourOf(s.seed, 'S');
    const heavy = n.demands.find((g) => g === 'grain' || g === 'legumes' || g === 'meat');
    if (heavy) {
      const q = tradeQuote(s, { direction: 'S', give: { [heavy]: 60 }, get: {} }, DAY);
      expect(q.porters).toBe(3);
    }
  });

  it('jen sháněné a nabízené zboží, nejvýš zásoby; bilance pro souseda ≥ 0', () => {
    const s = trading();
    const n = neighbourOf(s.seed, 'S');
    const offered = n.offers[0]!;
    const notWanted = (['grain', 'meat', 'cheese', 'legumes', 'logs'] as TradeGood[]).find(
      (g) => !n.demands.includes(g),
    )!;
    expect(tradeQuote(s, { direction: 'S', give: { [notWanted]: 1 }, get: {} }, DAY).blocked).toBe(
      NOT_WANTED,
    );
    const notOffered = n.demands[0]!;
    expect(tradeQuote(s, { direction: 'S', give: {}, get: { [notOffered]: 1 } }, DAY).blocked).toBe(
      NOT_OFFERED,
    );
    const supply = neighbourStock(s, 'S', DAY).supply[offered]!;
    expect(
      tradeQuote(s, { direction: 'S', give: {}, get: { [offered]: supply + 1 } }, DAY).blocked,
    ).toBe(OVER_SUPPLY);
    expect(tradeQuote(s, { direction: 'S', give: {}, get: { [offered]: 1 } }, DAY).blocked).toBe(
      UNFAIR,
    );
    const pay = n.demands[0]!;
    const tooMuch = villageGoodStock(s, pay) + 1;
    const over = tradeQuote(s, { direction: 'S', give: { [pay]: tooMuch }, get: {} }, DAY);
    expect([OVER_STOCK, 'Tolik soused letos nevezme.']).toContain(over.blocked);
  });
});

describe('výprava s vozem (wagons.md – Obchod)', () => {
  it('vůz se spřežením vezme náklad místo nosičů a je do návratu pryč', () => {
    const s = trading();
    s.pens = [
      {
        id: 900,
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
    const n = neighbourOf(s.seed, 'S');
    const heavy = n.demands.find((g) => g === 'grain' || g === 'legumes' || g === 'meat');
    if (!heavy) return;
    const quote = tradeQuote(s, { direction: 'S', give: { [heavy]: 200 }, get: {} }, DAY);
    expect(quote.carts).toEqual(['two-wheel']);
    // 200 kg na voze – jen honák a pomocník místo 8 nosičů
    expect(quote.porters).toBe(2);
    const next = startExpedition(s, DAY, { direction: 'S', give: { [heavy]: 200 }, get: {} });
    expect(next.trade!.expeditions[0]!.carts).toEqual([1]);
    expect(tradeQuote(next, { direction: 'S', give: {}, get: {} }, DAY).carts).toEqual([]);
  });

  it('vůz jede víckrát a výprava trvá déle (wagons.md – Opakované jízdy vozu)', () => {
    const s = trading();
    s.pens = [
      {
        id: 900,
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
    const offer = { direction: 'S' as const, give: { grain: 900 }, get: {} };
    const quote = tradeQuote(s, offer, DAY);
    const tripDays = trailTripDays(s.trails![0]!.lengthM);
    // 900 kg na dvoukolák (400 kg): 2 plné jízdy, zbylých 100 kg = 4 nosiči, 2 při každé jízdě
    expect(quote.trips).toBe(2);
    expect(quote.porters).toBe(CARTS.tradeCrew + 2);
    expect(quote.days).toBe(2 * tripDays);
    expect(quote.manDays).toBe(quote.porters * quote.days);
  });
});

describe('výprava', () => {
  it('zboží odejde, soused ho odepíše; druhá výprava k témuž sousedovi nejde', () => {
    const s = trading();
    const { give, get } = fairOffer(s, 'S');
    const [pay, amount] = Object.entries(give)[0] as [TradeGood, number];
    const before = villageGoodStock(s, pay);
    const next = startExpedition(s, DAY, { direction: 'S', give, get });
    expect(villageGoodStock(next, pay)).toBe(before - amount);
    const stock = neighbourStock(next, 'S', DAY);
    expect(stock.demand[pay]).toBe(neighbourOf(s.seed, 'S').demand[pay]! - amount);
    expect(next.trade!.expeditions).toHaveLength(1);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-departed', direction: 'S' });
    expect(tradeQuote(next, { direction: 'S', give, get }, DAY).blocked).toBe(EXPEDITION_AWAY);
    expect(() => startExpedition(next, DAY, { direction: 'S', give, get })).toThrow(
      EXPEDITION_AWAY,
    );
  });

  it('nosiči berou nejvýš svůj počet za den; zboží dorazí po návratu', () => {
    const s = startExpedition(trading(), DAY, { direction: 'S', ...fairOffer(trading(), 'S') });
    const e = s.trade!.expeditions[0]!;
    const work = workExpeditions(s, 100);
    expect(work.used).toBe(Math.min(e.porters, e.cost));
    expect(work.shares).toEqual([{ trailId: e.trailId, manDays: work.used }]);
    // málo společné práce – cesta trvá déle
    const slow = structuredClone(s);
    expect(workExpeditions(slow, 0.5).used).toBe(0.5);
    // dokončená práce – zboží dorazí
    e.done = e.cost;
    const [good, amount] = Object.entries(e.get)[0] as [TradeGood, number];
    const before = villageGoodStock(s, good);
    const events = finishExpeditions(s, DAY + 9);
    expect(events).toEqual([{ day: DAY + 9, kind: 'trade-returned', direction: 'S', get: e.get }]);
    expect(villageGoodStock(s, good)).toBe(before + amount);
    expect(s.trade!.expeditions).toHaveLength(0);
  });

  it('v simulaci se výprava vrátí po dnech cesty a nezávisí na kouscích dopočtu', () => {
    const s = startExpedition(trading(), DAY, { direction: 'S', ...fairOffer(trading(), 'S') });
    const days = s.trade!.expeditions[0]!.days;
    const whole = advanceVillage(s, DAY + 40, null, LANDSCAPE);
    const returned = whole.chronicle.find((ev) => ev.kind === 'trade-returned');
    expect(returned).toBeDefined();
    expect(returned!.day).toBeGreaterThanOrEqual(DAY + days);
    // výprava trvá dny cesty, jen když má ves dost dospělých na nosiče (zakladatelé: 2)
    if (s.trade!.expeditions[0]!.porters <= 2) expect(returned!.day).toBe(DAY + days);
    expect(whole.labor).toBeDefined();
    let parts = s;
    for (const step of [1, 2, 5, 40]) parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    expect(parts).toEqual(whole);
  });

  it('nosiči mají vlastní podíl práce – výprava trvá jen dny cesty i bez volné práce', () => {
    // ves se čtrnácti dospělými navíc (vojvoda se ženou nenosí – lord.md, Den rodiny); domácí
    // výroba s velkým nedodělkem sní všechnu volnou práci
    const base = trading();
    for (let i = 0; i < 14; i++) {
      base.people.push({
        id: 700 + i,
        bornDay: DAY - Math.ceil((25 + i) * 365.25),
        dwellingId: base.dwellings[0]!.id,
        sex: i % 2 === 0 ? 'male' : 'female',
      });
    }
    base.nextId = 800;
    const s = startExpedition(base, DAY, {
      direction: 'S',
      give: { meat: 300 },
      get: {},
    });
    const e = s.trade!.expeditions[0]!;
    expect(e.porters).toBeGreaterThan(2);
    expect(expeditionLaborNeed(s)).toBe(e.porters);
    const whole = advanceVillage(s, DAY + e.days + 2, null, LANDSCAPE);
    const returned = whole.chronicle.find((ev) => ev.kind === 'trade-returned');
    // přesně dny z náhledu – nosiči jdou před úlohami dne, společná práce na ně nečeká
    expect(returned!.day).toBe(DAY + e.days);
    // nezávisle na kouscích dopočtu
    let parts = s;
    for (const step of [1, 2, 3, e.days, e.days + 2]) {
      parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    }
    expect(parts).toEqual(whole);
  });

  it('nosiči jsou dospělí – víc, než kolik jich ves má, nejde; denní minimum má přednost', () => {
    const s = startExpedition(trading(), DAY, { direction: 'S', give: { meat: 300 }, get: {} });
    const e = s.trade!.expeditions[0]!;
    // zakladatelé: 2 dospělí (13 a 12 let jsou výrostci u stád) – výprava chce dva člověkodny
    expect(expeditionLaborToday(s, s.people, DAY + 1)).toBe(Math.min(e.porters, 2));
    expect(expeditionLaborToday(trading(), trading().people, DAY + 1)).toBe(0);
    const next = advanceVillage(s, DAY + 1, null, LANDSCAPE);
    // denní minimum má přednost – výpravě zbude práce dvou dospělých (× štěstí) bez minima
    // domácnosti 0,5
    const away = next.trade!.expeditions[0]!.done;
    expect(away).toBeLessThan(Math.min(e.porters, 2));
    expect(away + 0.5).toBeGreaterThan(2 * 0.8);
    expect(away + 0.5).toBeLessThan(2 * 1.1);
    const share = next.labor!.shares.find((x) => x.activity === 'trade');
    expect(share!.manDays).toBeCloseTo(away, 2);
    // denní minimum domácností dostane práci vždy
    expect(next.labor!.shares.some((x) => x.activity === 'domestic')).toBe(true);
    // lidé na výpravě společnou práci neberou – volná práce dne zůstane celá nevyužitá (bez staveb)
    expect(next.constructions).toHaveLength(0);
    const idle = next
      .labor!.shares.filter((x) => x.activity === 'idle')
      .reduce((sum, x) => sum + x.manDays, 0);
    expect(idle).toBeCloseTo(next.commonLaborHistory.at(-1)!, 2);
  });

  it('nosiči jsou v rozdělení práce dne u stezky', () => {
    const s = startExpedition(trading(), DAY, { direction: 'S', ...fairOffer(trading(), 'S') });
    const next = advanceVillage(s, DAY + 1, null, LANDSCAPE);
    const share = next.labor!.shares.find((x) => x.activity === 'trade');
    expect(share?.target).toEqual({ kind: 'trail', id: s.trails![0]!.id });
  });
});

describe('starší vsi bez zboží zvenku (trade.md – Jen společné suroviny)', () => {
  /** Ves uložená před 19. 10. 2026: zásoby zvenku, med v jídle, soused se solí, výprava pro sůl. */
  function legacy(): VillageState {
    const s = startExpedition(trading(), DAY, { direction: 'S', ...fairOffer(trading(), 'S') });
    const e = s.trade!.expeditions[0]!;
    const old = s as unknown as Record<string, unknown>;
    old.goods = { saltKg: 12, ironKg: 3, honeyKg: 40, furs: 2 };
    s.diet = {
      energy: 1,
      protein: 1,
      diversity: 1,
      satiation: 1,
      shares: { grain: 0.9, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, honey: 0.05 },
    } as VillageState['diet'];
    s.trade!.neighbours = [
      { direction: 'S', season: 599, supply: { salt: 80, grain: 400 }, demand: { cheese: 100 } },
    ] as unknown as NeighbourStock[];
    e.get = { salt: 10, grain: 5 } as TradeGoods;
    s.chronicle.push({
      day: DAY - 30,
      kind: 'trade-returned',
      direction: 'S',
      get: {
        salt: 20,
        cheese: 3,
      } as TradeGoods,
    });
    return s;
  }

  it('zásoby zvenku a med zmizí, soused se solí začne rok znovu, výprava pro sůl se ruší', () => {
    const s = legacy();
    const give = { ...s.trade!.expeditions[0]!.give };
    const next = withoutForeignGoods(s);
    expect('goods' in next).toBe(false);
    expect(next.diet!.shares).toEqual({
      grain: 0.9,
      meat: 0,
      dairy: 0,
      eggs: 0,
      fruit: 0,
      legumes: 0,
    });
    // zbytek roku, který nesedí na povahu souseda, se zahodí – plné roční zásoby
    expect(next.trade!.neighbours).toEqual([]);
    expect(neighbourStock(next, 'S', DAY).supply).toEqual(neighbourOf(next.seed, 'S').supply);
    // nosiči přinesou zpět, co nesli
    expect(next.trade!.expeditions[0]!.give).toEqual(give);
    expect(next.trade!.expeditions[0]!.get).toEqual(give);
    expect(next.chronicle.at(-1)).toEqual({
      day: DAY - 30,
      kind: 'trade-returned',
      direction: 'S',
      get: { cheese: 3 },
    });
    // vstupní stav beze změny, převod je idempotentní
    expect((s as unknown as Record<string, unknown>).goods).toBeDefined();
    expect(withoutForeignGoods(next)).toBe(next);
    // ves bez zboží zvenku se nemění (tentýž objekt – nic se neukládá)
    const fresh = startExpedition(trading(), DAY, { direction: 'S', ...fairOffer(trading(), 'S') });
    expect(withoutForeignGoods(fresh)).toBe(fresh);
  });

  it('v simulaci: vrácená výprava vrátí dané zboží, nezávisle na kouscích dopočtu', () => {
    const s = legacy();
    const [good, amount] = Object.entries(s.trade!.expeditions[0]!.give)[0] as [TradeGood, number];
    const before = villageGoodStock(s, good);
    const whole = advanceVillage(s, DAY + 40, null, LANDSCAPE);
    expect('goods' in whole).toBe(false);
    const returned = whole.chronicle.filter((ev) => ev.kind === 'trade-returned').at(-1);
    expect(returned).toMatchObject({ direction: 'S', get: { [good]: amount } });
    expect(whole.trade!.expeditions).toHaveLength(0);
    let parts = s;
    for (const step of [0, 1, 3, 17, 40])
      parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    expect(parts).toEqual(whole);
    // zboží se vrátilo (obilí, maso a sýr se mezitím jedí – jen krávy, klády a výrobky drží)
    if (good === 'cows' || good === 'logs' || good === 'ironBars' || good === 'pottery') {
      expect(villageGoodStock(whole, good)).toBeGreaterThanOrEqual(before - 1);
    }
  });
});
