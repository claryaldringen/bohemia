import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { TRADE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { tradeCarts } from '../../crafts/carts';
import {
  addGood,
  expeditionLaborNeed,
  expeditionLaborToday,
  finishExpeditions,
  sellPrice,
  villageGoodStock,
  withoutForeignGoods,
  workExpeditions,
} from '../trade';
import { finishTrail, startTrail, trailTripDays } from '../trail';
import type { TradeExpedition, TradeGood, TradeGoods, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Obchod vsi (markets.md – Pravidla 1 a 10): zboží ve vsi, hodnota v kg obilí a výprava
// k dřívějšímu sousedovi na cestě – nosiči ze společné práce vsi, zboží po návratu.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });

/** Ves s hotovou stezkou na jih a zásobami. */
function trading(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, 'S', LANDSCAPE, null);
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

/**
 * Ves s výpravou k dřívějšímu sousedovi na jihu, uloženou před koncem smyšlených sousedů
 * (markets.md – Pravidla 10): vyrazila v den DAY po stezce vsi, nesla maso, přinese sýr; nosiči
 * `porters` (výchozí 1) na dny cesty. Nová ves.
 */
function onTheWay(s: VillageState, fields: Partial<TradeExpedition> = {}): VillageState {
  const next = structuredClone(s);
  const trail = next.trails![0]!;
  const days = trailTripDays(trail.lengthM);
  const porters = fields.porters ?? 1;
  next.trade = {
    expeditions: [
      {
        id: 1,
        direction: 'S',
        trailId: trail.id,
        startedDay: DAY,
        give: { meat: 50 },
        get: { cheese: 20 },
        porters,
        days,
        cost: porters * days,
        done: 0,
        ...fields,
      },
    ],
    nextId: 2,
  };
  return next;
}

describe('hodnota zboží', () => {
  it('za zboží ves dostane jeho hodnotu v kg obilí (÷ přirážka × příplatek)', () => {
    expect(sellPrice('cheese')).toBeCloseTo(4);
    expect(sellPrice('cows')).toBeCloseTo(600);
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

  it('10 kg medu přidá honeyKg', () => {
    const s = trading();
    addGood(s, 'honey', 10, DAY);
    expect(s.wares?.honeyKg).toBe(10);
  });
});

describe('výprava na cestě (markets.md – Pravidla 10)', () => {
  it('nosiči berou nejvýš svůj počet za den; zboží dorazí po návratu', () => {
    const s = onTheWay(trading());
    const e = s.trade!.expeditions[0]!;
    const work = workExpeditions(s, 100, DAY + 1);
    expect(work.used).toBe(Math.min(e.porters, e.cost));
    expect(work.shares).toEqual([{ trailId: e.trailId, manDays: work.used }]);
    // málo společné práce – cesta trvá déle
    const slow = structuredClone(s);
    expect(workExpeditions(slow, 0.5, DAY + 1).used).toBe(0.5);
    // dokončená práce – zboží dorazí
    e.done = e.cost;
    const before = villageGoodStock(s, 'cheese');
    const events = finishExpeditions(s, DAY + 9);
    expect(events).toEqual([{ day: DAY + 9, kind: 'trade-returned', direction: 'S', get: e.get }]);
    expect(villageGoodStock(s, 'cheese')).toBe(before + 20);
    expect(s.trade!.expeditions).toHaveLength(0);
  });

  it('v simulaci se výprava vrátí po dnech cesty a nezávisí na kouscích dopočtu', () => {
    const s = onTheWay(trading());
    const days = s.trade!.expeditions[0]!.days;
    const whole = advanceVillage(s, DAY + 40, null, LANDSCAPE);
    const returned = whole.chronicle.find((ev) => ev.kind === 'trade-returned');
    // výprava trvá dny cesty – ves má na nosiče dost dospělých i po denním minimu (zakladatelé: 2)
    expect(returned!.day).toBe(DAY + days);
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
    const s = onTheWay(base, { give: { meat: 300 }, get: {}, porters: 12 });
    const e = s.trade!.expeditions[0]!;
    expect(expeditionLaborNeed(s, DAY + 1)).toBe(e.porters);
    const whole = advanceVillage(s, DAY + e.days + 2, null, LANDSCAPE);
    const returned = whole.chronicle.find((ev) => ev.kind === 'trade-returned');
    // přesně dny cesty – nosiči jdou před úlohami dne, společná práce na ně nečeká
    expect(returned!.day).toBe(DAY + e.days);
    // nezávisle na kouscích dopočtu
    let parts = s;
    for (const step of [1, 2, 3, e.days, e.days + 2]) {
      parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    }
    expect(parts).toEqual(whole);
  });

  it('nosiči jsou dospělí – víc, než kolik jich ves má, nejde; denní minimum má přednost', () => {
    const s = onTheWay(trading(), { give: { meat: 300 }, get: {}, porters: 12 });
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
    const s = onTheWay(trading());
    const next = advanceVillage(s, DAY + 1, null, LANDSCAPE);
    const share = next.labor!.shares.find((x) => x.activity === 'trade');
    expect(share?.target).toEqual({ kind: 'trail', id: s.trails![0]!.id });
  });

  it('vůz výpravy se spřežením je do návratu pryč (wagons.md – Obchod)', () => {
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
    expect(tradeCarts(s, DAY).map((c) => c.id)).toEqual([1]);
    const away = onTheWay(s, { carts: [1] });
    expect(tradeCarts(away, DAY)).toEqual([]);
    expect(workExpeditions(structuredClone(away), 100, DAY + 1).shares[0]).toMatchObject({
      carts: 1,
    });
    const e = away.trade!.expeditions[0]!;
    e.done = e.cost;
    finishExpeditions(away, DAY + e.days);
    expect(tradeCarts(away, DAY + e.days).map((c) => c.id)).toEqual([1]);
  });
});

describe('starší vsi bez zboží zvenku (trade.md – Jen společné suroviny)', () => {
  /** Ves uložená před 19. 10. 2026: zásoby zvenku, med v jídle, výprava pro sůl na cestě. */
  function legacy(): VillageState {
    const s = onTheWay(trading(), {
      give: { ironBars: 5 },
      get: { salt: 10, grain: 5 } as TradeGoods,
    });
    const old = s as unknown as Record<string, unknown>;
    old.goods = { saltKg: 12, ironKg: 3, honeyKg: 40, furs: 2 };
    s.diet = {
      energy: 1,
      protein: 1,
      diversity: 1,
      satiation: 1,
      shares: { grain: 0.9, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, honey: 0.05 },
    } as VillageState['diet'];
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

  it('zásoby zvenku a med zmizí, výprava pro sůl se ruší', () => {
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
    const fresh = onTheWay(trading());
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
    // hřivny se vrátily
    expect(villageGoodStock(whole, good)).toBeGreaterThanOrEqual(before + amount - 1);
  });
});
