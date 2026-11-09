import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  NO_COW_ROOM,
  NO_OX_ROOM,
  boughtOxTrainedDay,
  cattleForSale,
  cattleRoom,
  withCattleKinds,
} from '../cattle-trade';
import { neighbourKind, neighbourOf, neighbourStock } from '../neighbours';
import {
  ardsWithoutTraining,
  isTrained,
  lastingOxen,
  oxRetireDay,
  trainTeamsWhenReady,
  villageOxen,
} from '../oxen';
import { roomForWinter } from '../livestock';
import { herdRoom, oxTrainedDay, penCapacity } from '../pens';
import { CATTLE_TRADE, OXEN, TRADE } from '../rules';
import { advanceVillage } from '../simulate';
import {
  OVER_STOCK,
  buyPrice,
  expeditionPorters,
  finishExpeditions,
  launchExpedition,
  sellPrice,
  startExpedition,
  tradeQuote,
  villageGoodStock,
  withoutForeignGoods,
} from '../trade';
import { finishTrail, startTrail } from '../trail';
import type { Direction8, Pen, TradeGoods, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Dobytek ve třech druzích (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s dobytkem
// by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
// vycvičit) a vycvičené voly“): krávy do stáda skotu (místo v ohradě skotu), mladí voli do ohrady
// volů na výcvik, vycvičení voli táhnou hned; prodej ze stáda a z ohrady volů; honák bez nosičů.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;
/** Seed 3: na jihu pastevci – nabízejí krávy, mladé i vycvičené voly. */
const HERDERS = { seed: 3, direction: 'S' as Direction8 };
/** Seed 46: na jihu řemeslníci – shánějí krávy, mladé i vycvičené voly. */
const CRAFTERS = { seed: 46, direction: 'S' as Direction8 };

/** Hotová ohrada volů (1 čtverec – 6 míst) a ohrada skotu (1 čtverec – 45 míst). */
function pens(day: number): Pen[] {
  return [
    {
      id: 900,
      species: 'team',
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: day - 800,
      oxen: [],
    },
    { id: 901, species: 'cattle', cell: { x: 4, y: 4 }, x: 65, z: 60, builtDay: day - 800 },
  ];
}

/** Ves s hotovou stezkou ke kraji, ohradami a zásobami obilí. */
function trading({ seed, direction }: { seed: number; direction: Direction8 }): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 8000;
  next.woodLogs = 5;
  next.livestock!.herds.cow = 6;
  next.pens = pens(DAY);
  return next;
}

/** Obilí za `get` (s rezervou) – pastevci obilí shánějí. */
function payFor(get: TradeGoods): TradeGoods {
  const price = Object.entries(get).reduce(
    (sum, [g, n]) => sum + n! * buyPrice(g as keyof TradeGoods),
    0,
  );
  return { grain: Math.ceil(price / sellPrice('grain')) };
}

/** Výprava se vrátí (odvedená práce = cena) – dobytek do vsi v den `day`, kronika. */
function returned(s: VillageState, day: number): VillageState {
  const next = structuredClone(s);
  for (const e of next.trade!.expeditions) e.done = e.cost;
  next.chronicle.push(...finishExpeditions(next, day));
  return next;
}

describe('povaha a ceny', () => {
  it('seed 3 má na jihu pastevce, seed 46 řemeslníky – fixtura testů', () => {
    expect(neighbourKind(HERDERS.seed, HERDERS.direction)).toBe('herders');
    expect(neighbourKind(CRAFTERS.seed, CRAFTERS.direction)).toBe('crafters');
    expect(neighbourOf(CRAFTERS.seed, CRAFTERS.direction).demands).toEqual(
      expect.arrayContaining(['cows', 'youngOxen', 'trainedOxen']),
    );
  });

  it('vycvičený vůl stojí dvě krávy, mladý vůl míň než kráva (rešerše 2026-10-20)', () => {
    expect(sellPrice('cows')).toBeCloseTo(600);
    expect(sellPrice('trainedOxen')).toBeCloseTo(1200);
    expect(sellPrice('youngOxen')).toBeCloseTo(350);
    expect(buyPrice('trainedOxen')).toBeGreaterThan(buyPrice('youngOxen') + buyPrice('cows'));
  });

  it('dobytek jde po svých s honákem – honák na 10 kusů, bez nosičů', () => {
    expect(expeditionPorters({}, { cows: 2 })).toBe(1);
    expect(expeditionPorters({}, { cows: 5, youngOxen: 3, trainedOxen: 2 })).toBe(1);
    expect(expeditionPorters({ youngOxen: 11 }, {})).toBe(2);
  });
});

describe('koupě – krávy', () => {
  it('do stáda skotu, jen do volných míst ohrady skotu', () => {
    const s = trading(HERDERS);
    const get = { cows: 2 };
    expect(tradeQuote(s, { direction: 'S', give: payFor(get), get }, DAY).blocked).toBeNull();
    // bez ohrady skotu se krávy nevejdou (krávy jen v ohradě – oxen.md, Ohrady podle druhu)
    const noPen = structuredClone(s);
    noPen.pens = noPen.pens!.filter((p) => p.species !== 'cattle');
    expect(cattleRoom(noPen, 'cows')).toBe(0);
    expect(tradeQuote(noPen, { direction: 'S', give: payFor(get), get }, DAY).blocked).toBe(
      NO_COW_ROOM,
    );
    // plná ohrada – místo pro jednu: krávy se i s jarními telaty musí vejít do ohrady skotu a k domům
    // (roomForWinter – 1. 11. ves nad ně porazí)
    const places = Math.min(penCapacity(s).cow, roomForWinter(herdRoom(s), 'cow'));
    const full = structuredClone(s);
    full.livestock!.herds.cow = Math.floor(places) - 1;
    expect(cattleRoom(full, 'cows')).toBe(1);
    expect(tradeQuote(full, { direction: 'S', give: payFor(get), get }, DAY).blocked).toBe(
      NO_COW_ROOM,
    );
    // na cestě – krávy výpravy místo zabírají, po návratu jsou ve stádě
    const away = startExpedition(s, DAY, { direction: 'S', give: payFor(get), get });
    expect(cattleRoom(away, 'cows')).toBe(Math.floor(places - 6 - 2));
    const back = returned(away, DAY + 5);
    expect(back.livestock!.herds.cow).toBeCloseTo(8, 9);
    expect(back.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 2 } });
  });
});

describe('koupě – voli', () => {
  it('mladí voli do ohrady volů na výcvik – za 2 roky táhnou', () => {
    const s = trading(HERDERS);
    const get = { youngOxen: 2 };
    const away = startExpedition(s, DAY, { direction: 'S', give: payFor(get), get });
    // voli na cestě – místa v ohradě a voli, se kterými ves počítá (výcvik pro ně nezačne)
    expect(cattleRoom(away, 'youngOxen')).toBe(4);
    expect(lastingOxen(away, DAY)).toBe(2);
    const arrival = DAY + 6;
    const back = returned(away, arrival);
    const oxen = back.pens![0]!.oxen!;
    expect(oxen).toEqual([
      { trainedDay: oxTrainedDay(arrival) },
      { trainedDay: oxTrainedDay(arrival) },
    ]);
    expect(isTrained(oxen[0]!, arrival)).toBe(false);
    expect(isTrained(oxen[0]!, oxTrainedDay(arrival))).toBe(true);
    expect(villageOxen(back)).toBe(2);
  });

  it('vycvičení voli táhnou hned – za sebou 3 roky služby, slouží ještě 7', () => {
    const s = trading(HERDERS);
    // ves má jednoho vycvičeného vola – s koupeným je pár k rádlu
    s.pens![0]!.oxen = [{ trainedDay: DAY - 400 }];
    const get = { trainedOxen: 1 };
    const away = startExpedition(s, DAY, { direction: 'S', give: payFor(get), get });
    const arrival = DAY + 6;
    const back = returned(away, arrival);
    const bought = back.pens![0]!.oxen![1]!;
    expect(bought.trainedDay).toBe(boughtOxTrainedDay('trainedOxen', arrival));
    expect(arrival - bought.trainedDay).toBe(Math.round(CATTLE_TRADE.servedYears * YEAR));
    expect(isTrained(bought, arrival)).toBe(true);
    expect((oxRetireDay(bought) - arrival) / YEAR).toBeCloseTo(
      OXEN.serviceYears - CATTLE_TRADE.servedYears,
      1,
    );
    // pár bez rádla – vesničané rádlo vyrobí bez výcviku (jinak by koupený pár nikdy neoral)
    const goal = { oxen: 2, ploughPairs: 1, breedingCows: 100 };
    expect(ardsWithoutTraining(back, goal)).toBe(1);
    trainTeamsWhenReady(back, arrival, null, goal);
    expect(back.constructions.filter((c) => c.kind === 'ard')).toHaveLength(1);
    expect(ardsWithoutTraining(back, goal)).toBe(0);
  });

  it('voli se vejdou jen do volných míst ohrad volů (mladí i vycvičení sdílejí místa)', () => {
    const s = trading(HERDERS);
    s.pens![0]!.oxen = Array.from({ length: 5 }, () => ({ trainedDay: DAY - 400 }));
    expect(cattleRoom(s, 'trainedOxen')).toBe(1);
    const get = { youngOxen: 2 };
    expect(tradeQuote(s, { direction: 'S', give: payFor(get), get }, DAY).blocked).toBe(NO_OX_ROOM);
    const one = { youngOxen: 1 };
    expect(tradeQuote(s, { direction: 'S', give: payFor(one), get: one }, DAY).blocked).toBeNull();
    // bez ohrady volů žádná místa
    const noPen = structuredClone(s);
    noPen.pens = noPen.pens!.filter((p) => p.species !== 'team');
    expect(cattleRoom(noPen, 'youngOxen')).toBe(0);
  });

  it('kdo se po návratu nevejde (místa mezitím zabral výcvik), zůstane bez ohrady', () => {
    const s = trading(HERDERS);
    const get = { youngOxen: 2 };
    const away = startExpedition(s, DAY, { direction: 'S', give: payFor(get), get });
    away.pens![0]!.oxen = Array.from({ length: 5 }, () => ({ trainedDay: DAY + 300 }));
    const back = returned(away, DAY + 6);
    expect(back.pens![0]!.oxen).toHaveLength(6);
    expect(back.looseOxen).toEqual([{ trainedDay: oxTrainedDay(DAY + 6) }]);
  });
});

describe('prodej', () => {
  /** Ves u řemeslníků s voly ve výcviku i ve službě. */
  function selling(): VillageState {
    const s = trading(CRAFTERS);
    s.pens![0]!.oxen = [
      { trainedDay: DAY + 100 },
      { trainedDay: DAY + 600 },
      // dosluhuje – posledních 2 let služby
      { trainedDay: DAY - Math.ceil(9 * YEAR) },
      { trainedDay: DAY - Math.ceil(5 * YEAR) },
      { trainedDay: DAY - Math.ceil(1 * YEAR) },
    ];
    return s;
  }

  it('krávy ze stáda (chovný pár zůstane), mladí voli z výcviku, vycvičení mimo dosluhující', () => {
    const s = selling();
    expect(cattleForSale(s, 'cows', DAY)).toBe(6 - TRADE.keepCows);
    expect(villageGoodStock(s, 'youngOxen', DAY)).toBe(2);
    expect(villageGoodStock(s, 'trainedOxen', DAY)).toBe(2);
    expect(tradeQuote(s, { direction: 'S', give: { youngOxen: 3 }, get: {} }, DAY).blocked).toBe(
      OVER_STOCK,
    );
  });

  it('prodaní voli odejdou hned – mladí napřed ti, které výcvik čeká nejdéle, vycvičení nejstarší', () => {
    const s = selling();
    const next = startExpedition(s, DAY, {
      direction: 'S',
      give: { cows: 1, youngOxen: 1, trainedOxen: 1 },
      get: {},
    });
    expect(next.livestock!.herds.cow).toBeCloseTo(5, 9);
    expect(next.pens![0]!.oxen).toEqual([
      { trainedDay: DAY + 100 },
      { trainedDay: DAY - Math.ceil(9 * YEAR) },
      { trainedDay: DAY - Math.ceil(1 * YEAR) },
    ]);
    // honák jde se stádem (3 kusy) – jeden člověk
    expect(next.trade!.expeditions[0]!.porters).toBe(1);
  });

  it('prodaní vycvičení voli vůz výpravy netáhnou', () => {
    const s = selling();
    s.pens![0]!.oxen = [{ trainedDay: DAY - Math.ceil(1 * YEAR) }];
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 100 }];
    const offer = { direction: 'S' as Direction8, give: { grain: 200 }, get: {} };
    expect(tradeQuote(s, offer, DAY).carts).toEqual(['two-wheel']);
    const withOx = { ...offer, give: { grain: 200, trainedOxen: 1 } };
    expect(tradeQuote(s, withOx, DAY).carts).toEqual([]);
    expect(startExpedition(s, DAY, withOx).trade!.expeditions[0]!.carts).toBeUndefined();
  });

  it('launchExpedition (správce, bez kopie vsi) zmutuje stav na totéž, co vrátí startExpedition', () => {
    // vozy, voli a koně se čtou před prodejem – na mutovaném stavu by se prodaný vůl odečetl
    // podruhé a vůz by netáhl nikdo
    const s = selling();
    s.pens![0]!.oxen = [
      { trainedDay: DAY - Math.ceil(1 * YEAR) },
      { trainedDay: DAY - Math.ceil(2 * YEAR) },
    ];
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 100 }];
    const offer = { direction: 'S' as Direction8, give: { grain: 200, trainedOxen: 1 }, get: {} };
    const before = JSON.stringify(s);
    const copy = startExpedition(s, DAY, offer);
    expect(copy.trade!.expeditions[0]!.carts).toEqual([1]);
    expect(JSON.stringify(s)).toBe(before);
    launchExpedition(s, DAY, offer);
    expect(JSON.stringify(s)).toBe(JSON.stringify(copy));
    // výměna, která nejde – RangeError a stav beze změny
    const after = JSON.stringify(s);
    const tooMany = { ...offer, give: { trainedOxen: 99 } };
    expect(() => launchExpedition(s, DAY, tooMany)).toThrow(RangeError);
    expect(JSON.stringify(s)).toBe(after);
  });
});

describe('převod – dobytek `cattle` uložený dřív', () => {
  /** Ves s pastevci, kterým zbyla 1 kráva, a výpravou pro 2 krávy na cestě (jeden druh). */
  function legacy(): VillageState {
    const s = trading(HERDERS);
    const stock = neighbourStock(s, 'S', DAY);
    const old = (goods: TradeGoods): TradeGoods => {
      const out: Record<string, number> = {};
      for (const [g, n] of Object.entries(goods)) {
        if (g === 'cows') out.cattle = 1;
        else if (g !== 'youngOxen' && g !== 'trainedOxen') out[g] = n!;
      }
      return out as TradeGoods;
    };
    s.trade = {
      nextId: 2,
      neighbours: [{ ...stock, supply: old(stock.supply) }],
      expeditions: [
        {
          id: 1,
          direction: 'S',
          trailId: s.trails![0]!.id,
          startedDay: DAY,
          give: { grain: 1200 },
          get: { cattle: 2 } as TradeGoods,
          porters: 48,
          days: 3,
          cost: 144,
          done: 0,
        },
      ],
    };
    s.chronicle.push({
      day: DAY,
      kind: 'trade-returned',
      direction: 'S',
      get: { cattle: 1 } as TradeGoods,
    });
    return s;
  }

  it('dobytek na krávy, zbytek roku souseda dostane mladé a vycvičené voly; idempotentně', () => {
    const s = legacy();
    const next = withCattleKinds(s);
    const supply = next.trade!.neighbours[0]!.supply;
    const yearly = neighbourOf(s.seed, 'S').supply;
    expect(supply).not.toHaveProperty('cattle');
    expect(supply.cows).toBe(1);
    expect(supply.youngOxen).toBe(yearly.youngOxen);
    expect(supply.trainedOxen).toBe(yearly.trainedOxen);
    expect(next.trade!.expeditions[0]!.get).toEqual({ cows: 2 });
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 1 } });
    // zbytek roku sedí na povahu – převod zboží zvenku ho nechá
    expect(withoutForeignGoods(next).trade!.neighbours[0]!.supply.cows).toBe(1);
    expect(withCattleKinds(next)).toBe(next);
    // vstupní stav beze změny, ves bez dobytka `cattle` tentýž objekt
    expect(s.trade!.expeditions[0]!.get).toEqual({ cattle: 2 });
    const fresh = trading(HERDERS);
    expect(withCattleKinds(fresh)).toBe(fresh);
  });

  it('v simulaci: výprava uložená s dobytkem přivede krávy', () => {
    const s = legacy();
    s.trade!.expeditions[0]!.done = 143;
    // bez ohrady volů – krávy nejdou na telata do výcviku
    s.pens = s.pens!.filter((p) => p.species !== 'team');
    const next = advanceVillage(s, DAY + 2, null, LANDSCAPE);
    expect(next.trade!.expeditions).toHaveLength(0);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 2 } });
    expect(next.livestock!.herds.cow).toBeGreaterThan(7.9);
  });
});
