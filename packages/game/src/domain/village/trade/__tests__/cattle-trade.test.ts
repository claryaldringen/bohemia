import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { boughtOxTrainedDay, cattleForSale, cowsComing, withCattleKinds } from '../cattle-trade';
import {
  ardsWithoutTraining,
  isTrained,
  lastingOxen,
  oxRetireDay,
  trainTeamsWhenReady,
  villageOxen,
} from '../../livestock/oxen';
import { oxTrainedDay } from '../../livestock/pens';
import { CATTLE_TRADE, OXEN, TRADE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { addGood, finishExpeditions, sellPrice, villageGoodStock } from '../trade';
import { finishTrail, startTrail } from '../trail';
import type { Pen, TradeGoods, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Dobytek ve třech druzích (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s dobytkem
// by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
// vycvičit) a vycvičené voly“): dobytek z výpravy na cestě (markets.md – Pravidla 10) – krávy do
// stáda skotu, mladí voli do ohrady volů na výcvik, vycvičení voli táhnou hned; co ves dá ze stáda
// a z ohrady volů.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;

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

/** Ves s hotovou stezkou na jih, ohradami a zásobami obilí. */
function trading(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, 'S', LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 8000;
  next.woodLogs = 5;
  next.livestock!.herds.cow = 6;
  next.pens = pens(DAY);
  return next;
}

/** Výprava k dřívějšímu sousedovi na cestě (markets.md – Pravidla 10), která přivede `get`. */
function onTheWay(s: VillageState, get: TradeGoods): VillageState {
  const next = structuredClone(s);
  next.trade = {
    expeditions: [
      {
        id: 1,
        direction: 'S',
        trailId: next.trails![0]!.id,
        startedDay: DAY,
        give: { grain: 1200 },
        get,
        porters: 1,
        days: 6,
        cost: 6,
        done: 0,
      },
    ],
    nextId: 2,
  };
  return next;
}

/** Výprava se vrátí (odvedená práce = cena) – dobytek do vsi v den `day`, kronika. */
function returned(s: VillageState, day: number): VillageState {
  const next = structuredClone(s);
  for (const e of next.trade!.expeditions) e.done = e.cost;
  next.chronicle.push(...finishExpeditions(next, day));
  return next;
}

describe('ceny', () => {
  it('vycvičený vůl stojí dvě krávy, mladý vůl míň než kráva (rešerše 2026-10-20)', () => {
    expect(sellPrice('cows')).toBeCloseTo(600);
    expect(sellPrice('trainedOxen')).toBeCloseTo(1200);
    expect(sellPrice('youngOxen')).toBeCloseTo(350);
  });
});

describe('krávy z výpravy na cestě', () => {
  it('na cestě se s nimi počítá, po návratu jsou ve stádě skotu', () => {
    const away = onTheWay(trading(), { cows: 2 });
    expect(cowsComing(away)).toBe(2);
    const back = returned(away, DAY + 5);
    expect(cowsComing(back)).toBe(0);
    expect(back.livestock!.herds.cow).toBeCloseTo(8, 9);
    expect(back.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 2 } });
  });
});

describe('voli z výpravy na cestě', () => {
  it('mladí voli do ohrady volů na výcvik – za 2 roky táhnou', () => {
    const away = onTheWay(trading(), { youngOxen: 2 });
    // voli na cestě – ves s nimi počítá (výcvik pro ně nezačne)
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
    const s = trading();
    // ves má jednoho vycvičeného vola – s přivedeným je pár k rádlu
    s.pens![0]!.oxen = [{ trainedDay: DAY - 400 }];
    const away = onTheWay(s, { trainedOxen: 1 });
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

  it('kdo se po návratu nevejde (místa mezitím zabral výcvik), zůstane bez ohrady', () => {
    const away = onTheWay(trading(), { youngOxen: 2 });
    away.pens![0]!.oxen = Array.from({ length: 5 }, () => ({ trainedDay: DAY + 300 }));
    const back = returned(away, DAY + 6);
    expect(back.pens![0]!.oxen).toHaveLength(6);
    expect(back.looseOxen).toEqual([{ trainedDay: oxTrainedDay(DAY + 6) }]);
  });
});

describe('dobytek, který ves dá', () => {
  /** Ves u řemeslníků s voly ve výcviku i ve službě. */
  function selling(): VillageState {
    const s = trading();
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
  });

  it('odejde hned – mladí voli napřed ti, které výcvik čeká nejdéle, vycvičení nejstarší', () => {
    const s = selling();
    addGood(s, 'cows', -1, DAY);
    addGood(s, 'youngOxen', -1, DAY);
    addGood(s, 'trainedOxen', -1, DAY);
    expect(s.livestock!.herds.cow).toBeCloseTo(5, 9);
    expect(s.pens![0]!.oxen).toEqual([
      { trainedDay: DAY + 100 },
      { trainedDay: DAY - Math.ceil(9 * YEAR) },
      { trainedDay: DAY - Math.ceil(1 * YEAR) },
    ]);
  });
});

describe('převod – dobytek `cattle` uložený dřív', () => {
  /** Ves s výpravou pro 2 krávy na cestě (jeden druh dobytka) a kronikou. */
  function legacy(): VillageState {
    const s = onTheWay(trading(), { cattle: 2 } as TradeGoods);
    s.trade!.expeditions[0]!.porters = 48;
    s.trade!.expeditions[0]!.days = 3;
    s.trade!.expeditions[0]!.cost = 144;
    s.chronicle.push({
      day: DAY,
      kind: 'trade-returned',
      direction: 'S',
      get: { cattle: 1 } as TradeGoods,
    });
    return s;
  }

  it('dobytek výpravy a kroniky na krávy; idempotentně', () => {
    const s = legacy();
    const next = withCattleKinds(s);
    expect(next.trade!.expeditions[0]!.get).toEqual({ cows: 2 });
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 1 } });
    expect(withCattleKinds(next)).toBe(next);
    // vstupní stav beze změny, ves bez dobytka `cattle` tentýž objekt
    expect(s.trade!.expeditions[0]!.get).toEqual({ cattle: 2 });
    const fresh = trading();
    expect(withCattleKinds(fresh)).toBe(fresh);
  });

  it('v simulaci: výprava uložená s dobytkem přivede krávy', () => {
    const s = legacy();
    s.trade!.expeditions[0]!.done = 143;
    // bez ohrady volů – krávy nejdou na telata do výcviku
    s.pens = s.pens!.filter((p) => p.species !== 'team');
    // rod vojvody má uzené maso – letní porážka (diet.md – Strava po vrstvách a porážka celý rok)
    // by jinak vzala krávu, kterou si ves přes zimu nenechá
    s.meatKg = 500;
    const next = advanceVillage(s, DAY + 2, null, LANDSCAPE);
    expect(next.trade!.expeditions).toHaveLength(0);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get: { cows: 2 } });
    expect(next.livestock!.herds.cow).toBeGreaterThan(7.9);
  });
});
