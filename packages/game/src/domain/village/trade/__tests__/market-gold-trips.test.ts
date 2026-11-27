import { describe, expect, it } from 'vitest';
import { toolNeedKg } from '../../crafts/iron';
import type {
  MarketArrival,
  MarketOrder,
  MarketResult,
  MarketVisitor,
  TripBy,
  VillageState,
} from '../../types';
import { jewelleryOf } from '../jewellery';
import { joinMarket, marketDay, marketResult, marketResultRef } from '../market';
import { applyMarketResult, departMarketInPlace, tripJewelleryG } from '../market-trip';
import { D, homeVillage, marketVillage, target } from './market-fixtures';

// Šperkař na výpravě (gold.md – Pravidla 4; Rozhodnutí plánu 6, bod 6): výprava hráče a správce si
// veze kapacitu šperkaře ke kovu v nákladu (spočtenou ze vsi před jeho odchodem), na trhu ji použije
// a nepoužitou přiveze domů, kde ji `addJewellery` přičte až po kovu a uloženou ořízne na kov.
// Výprava vesničanů kapacitu nebere (mince neutrácí). Výsledek se zlatem nese `origin` jako výsledek
// s mincemi. Ceny testu: nástroje 5 mincí za kg.

/** Vlkov (H) s 30 mincemi, 10 g zlata a uloženou kapacitou 50 g – kovu je jen 40 g. */
function jewelledHome(): VillageState {
  const s = homeVillage();
  s.coins = 30;
  s.gold = 10;
  s.jewelleryG = 50;
  return s;
}

/** Celý kov vsi na trh pro 9 kg nástrojů (45 mincí). */
const ORDER: MarketOrder = { give: { coins: 30, gold: 10 }, wants: { tools: 9 }, stayDays: 1 };

/** Výprava vyrazí z `s` (mutuje) – příjezd a jeho den z odchozí schránky. */
function depart(
  s: VillageState,
  order: MarketOrder = ORDER,
  by?: TripBy,
): { arrival: MarketArrival; day: number } {
  const sent = departMarketInPlace(s, D, order, target, by ? { by } : {});
  if (!sent.ok) throw new Error(sent.reason);
  const mail = s.outbox?.at(-1);
  if (mail?.body.kind !== 'market-arrive') throw new Error('Příjezd chybí.');
  return { arrival: mail.body.arrival, day: mail.day };
}

/** Lhota (M) dopočítaná do dne před příjezdem `day`, na trhu zatím nikdo. */
function hostOn(day: number): VillageState {
  const s = marketVillage();
  s.lastDay = day - 1;
  return s;
}

/** Hostitel s 50 mincemi a 20 kg nástrojů nad potřebu po 5 mincích. */
function toolHost(day: number): VillageState {
  const s = hostOn(day);
  s.coins = 50;
  s.toolEquipmentKg = toolNeedKg(s, day) + 20;
  s.market = { prices: { tools: 5 }, visitors: [], nextOrder: 1, arrivals: [] };
  return s;
}

/** Návštěvník `key` na trhu – odkaz platí i po odjezdu. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Výsledek trhu výpravy `key` v odchozí schránce hostitele i s dnem návratu. */
function resultOf(s: VillageState, key: string): { result: MarketResult; day: number } {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return { result: mail.body.result, day: mail.day };
}

/** Výprava z `home` stojí jeden tržní den u hostitele `host(den)` – výsledek a den návratu. */
function marketTrip(
  home: VillageState,
  order: MarketOrder,
  host: (day: number) => VillageState,
): { result: MarketResult; day: number; host: VillageState; visitor: MarketVisitor } {
  const { arrival, day } = depart(home, order);
  const h = host(day);
  joinMarket(h, day, arrival);
  const visitor = visitorOf(h, arrival.key);
  marketDay(h, day);
  return { ...resultOf(h, arrival.key), host: h, visitor };
}

describe('kapacita na cestu (tripJewelleryG, odjezd)', () => {
  it('ves s kapacitou 50 a kovem 40 pošle 30 mincí a 10 g: příjezd nese 40, ve vsi zbude 10', () => {
    const s = jewelledHome();
    expect(tripJewelleryG(s, ORDER.give)).toBe(40);
    const { arrival } = depart(s);
    expect(arrival.jewelleryG).toBe(40);
    expect(arrival.goods).toEqual({ coins: 30, gold: 10 });
    // uložená kapacita kov přeroste jen po odjezdu výpravy s kovem – použitelná je 0
    expect([s.coins, s.gold, s.jewelleryG, jewelleryOf(s)]).toEqual([undefined, undefined, 10, 0]);
  });

  it('nejvýš kov v nákladu: 10 mincí ze 30 vezou kapacitu 10, ve vsi zbude 40 na 30 g kovu', () => {
    const s = jewelledHome();
    const { arrival } = depart(s, { give: { coins: 10 }, wants: {}, stayDays: 1 });
    expect(arrival.jewelleryG).toBe(10);
    expect([s.coins, s.gold, s.jewelleryG, jewelleryOf(s)]).toEqual([20, 10, 40, 30]);
  });

  it('nejvýš použitelná kapacita vsi: kapacita 25 na 40 g kovu odjede celá, ve vsi nic', () => {
    const s = jewelledHome();
    s.jewelleryG = 25;
    const { arrival } = depart(s);
    expect(arrival.jewelleryG).toBe(25);
    expect(s).not.toHaveProperty('jewelleryG');
  });

  it('správce si kapacitu veze jako hráč', () => {
    const s = jewelledHome();
    expect(tripJewelleryG(s, ORDER.give, 'steward')).toBe(40);
    expect(depart(s, ORDER, 'steward').arrival.jewelleryG).toBe(40);
    expect(s.jewelleryG).toBe(10);
  });

  it('výprava vesničanů kapacitu nenese – celá zůstane ve vsi', () => {
    const s = jewelledHome();
    expect(tripJewelleryG(s, ORDER.give, 'villagers')).toBe(0);
    const { arrival } = depart(s, ORDER, 'villagers');
    expect(arrival).not.toHaveProperty('jewelleryG');
    expect(arrival.goods).toEqual({ coins: 30, gold: 10 });
    expect(s.jewelleryG).toBe(50);
  });

  it('bez kovu v nákladu nebo bez šperkaře odjezd jako dřív – příjezd bez pole', () => {
    const grain: MarketOrder = { give: { grain: 100 }, wants: {}, stayDays: 1 };
    const s = jewelledHome();
    expect(tripJewelleryG(s, grain.give)).toBe(0);
    const plain = jewelledHome();
    delete plain.jewelleryG;
    const withJeweller = depart(s, grain);
    expect(withJeweller).toEqual(depart(plain, grain));
    expect(withJeweller.arrival).not.toHaveProperty('jewelleryG');
    expect(s.jewelleryG).toBe(50);
    delete s.jewelleryG;
    expect(s).toEqual(plain);
    // ani s kovem bez šperkaře
    const bare = jewelledHome();
    delete bare.jewelleryG;
    expect(depart(bare).arrival).not.toHaveProperty('jewelleryG');
    expect(bare).not.toHaveProperty('jewelleryG');
  });
});

describe('kapacita na trhu a doma (joinMarket, marketResult, applyMarketResult)', () => {
  it('za 45 mincí nástrojů zaplatí 30 (kapacita 40 → 10), zlato vymění 1:1; doma 10 + 10 na kov 10', () => {
    const home = jewelledHome();
    const { result, day, host, visitor } = marketTrip(home, ORDER, toolHost);
    expect(result).toMatchObject({
      sold: { gold: 10 },
      bought: { tools: 9 },
      coinsPaid: 30,
      coinsGot: 10,
      jewelleryG: 10,
    });
    expect(result.unsold).toEqual({ coins: 10 });
    expect(visitor.jewelleryG).toBe(10);
    // hostitel: 50 − 10 za zlato + 30 za nástroje, zlato 10 g, jeho kapacita nevznikla
    expect([host.coins, host.gold, host.jewelleryG]).toEqual([70, 10, undefined]);
    // doma napřed zboží (10 mincí), pak kapacita: uložených 10 + vrácených 10 ořízne kov 10
    applyMarketResult(home, day, result);
    expect([home.coins, home.gold, home.jewelleryG, jewelleryOf(home)]).toEqual([
      10,
      undefined,
      10,
      10,
    ]);
  });

  it('příjezd kapacitu předá výpravě na trhu, příjezd bez ní výpravu bez pole', () => {
    const { arrival, day } = depart(jewelledHome());
    const host = toolHost(day);
    joinMarket(host, day, arrival);
    expect(visitorOf(host, arrival.key).jewelleryG).toBe(40);
    const bare = jewelledHome();
    delete bare.jewelleryG;
    const plain = depart(bare);
    joinMarket(host, day, { ...plain.arrival, key: 'market:h:99' });
    expect(visitorOf(host, 'market:h:99')).not.toHaveProperty('jewelleryG');
  });

  it('hostitel zanikl před příjezdem (returned): kapacita 40 se vrátí celá', () => {
    const home = jewelledHome();
    const { arrival } = depart(home);
    const result = marketResult(arrival, { returned: true });
    expect(result).toMatchObject({ returned: true, jewelleryG: 40 });
    expect(result.unsold).toEqual({ coins: 30, gold: 10 });
    applyMarketResult(home, D + 2, result);
    // uložených 10 + 40 = 50 ořízne kov 40 – jako před odjezdem použitelných 40
    expect([home.coins, home.gold, home.jewelleryG, jewelleryOf(home)]).toEqual([30, 10, 40, 40]);
  });

  it('hostitel zanikl, když výprava stála na trhu: vrátí se kapacita, kterou drží', () => {
    const { arrival, day } = depart(jewelledHome());
    const host = toolHost(day);
    joinMarket(host, day, arrival);
    const visitor = visitorOf(host, arrival.key);
    visitor.jewelleryG = 12.5;
    expect(marketResult(visitor, { returned: true }).jewelleryG).toBe(12.5);
    delete visitor.jewelleryG;
    expect(marketResult(visitor, { returned: true })).not.toHaveProperty('jewelleryG');
  });

  it('výprava koupí zlato od šperkaře: kapacitu si nechá, doma ji addJewellery ořízne na kov', () => {
    const home = homeVillage();
    home.coins = 40;
    home.jewelleryG = 40;
    const order: MarketOrder = { give: { coins: 40 }, wants: { gold: 40 }, stayDays: 1 };
    const { result, day, host } = marketTrip(home, order, (d) => {
      const s = hostOn(d);
      s.gold = 100;
      s.jewelleryG = 30;
      return s;
    });
    // 26 g po 1,5 za 39 mincí (27. gram by stál 41) – nákup zlata kapacitu kupujícího nebere
    expect(result).toMatchObject({ bought: { gold: 26 }, coinsPaid: 39, jewelleryG: 40 });
    expect(result.unsold).toEqual({ coins: 1 });
    expect([host.coins, host.gold, host.jewelleryG]).toEqual([39, 74, 4]);
    expect(home).not.toHaveProperty('jewelleryG');
    applyMarketResult(home, day, result);
    // kov doma 1 mince + 26 g – kapacita 40 se ořízne na 27
    expect([home.coins, home.gold, home.jewelleryG, jewelleryOf(home)]).toEqual([1, 26, 27, 27]);
  });

  it('výsledek bez kapacity uloženou kapacitu vsi nemění (ani když přeroste kov)', () => {
    const home = jewelledHome();
    const { arrival } = depart(home, ORDER, 'villagers');
    expect(home.jewelleryG).toBe(50);
    const result = marketResult({ ...arrival, goods: {} }, { returned: true });
    expect(result).not.toHaveProperty('jewelleryG');
    applyMarketResult(home, D + 2, result);
    expect([home.coins, home.gold, home.jewelleryG]).toEqual([undefined, undefined, 50]);
  });
});

describe('výsledek se zlatem nese origin (departVisitors)', () => {
  const ORIGIN = { villageId: 'h', villageName: 'Vlkov', direction: 'W' };

  it('jen s neprodaným zlatem (bez lidí a mincí) – hostitel bez mincí zlato nevymění', () => {
    const home = homeVillage();
    home.gold = 10;
    const { result } = marketTrip(home, { give: { gold: 10 }, wants: {}, stayDays: 1 }, hostOn);
    expect(result.unsold).toEqual({ gold: 10 });
    expect(result.origin).toEqual(ORIGIN);
  });

  it('jen s koupeným zlatem – za všechny mince', () => {
    const home = homeVillage();
    home.coins = 10;
    const order: MarketOrder = { give: { coins: 10 }, wants: { gold: 10 }, stayDays: 1 };
    const { result } = marketTrip(home, order, (d) => {
      const s = hostOn(d);
      s.gold = 20;
      return s;
    });
    expect(result).toMatchObject({ bought: { gold: 10 }, unsold: {}, coinsPaid: 10 });
    expect(result.origin).toEqual(ORIGIN);
  });

  it('bez lidí, mincí a zlata origin dál chybí', () => {
    const { result } = marketTrip(homeVillage(), { give: {}, wants: {}, stayDays: 1 }, hostOn);
    expect(result).not.toHaveProperty('origin');
    expect(result).not.toHaveProperty('jewelleryG');
  });
});
