import { describe, expect, it } from 'vitest';
import { villageSpare } from '../../../vassalage/spare';
import { grainOnHandKg, grainReserveKg } from '../../../vassalage/spare';
import { cartIronBarsKg, craftCoverage, craftTargets } from '../../crafts/crafts';
import { FORGE } from '../../crafts/iron-rates';
import { toolNeedKg } from '../../crafts/iron';
import { cartsWanted, missingCart } from '../../livestock/draft';
import { horsesWanted } from '../../livestock/horse-breeding';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { LIVESTOCK } from '../../livestock/livestock';
import { CARPENTRY, CART_IRON } from '../../rules';
import { stewardOutlook } from '../../steward/steward-outlook';
import type { VillageState } from '../../types';
import { START, horse, horseVillage } from '../../__tests__/horse-fixtures';
import { yearlyNeed } from '../../wares/hides';
import { HONEY } from '../../rules';
import { marketStance } from '../market-stance';
import { villageGoodStock } from '../trade';
import { withWorkshop } from './market-fixtures';

// Co ves na trhu nabízí a shání (markets.md – Rozhodnutí plánu 2, bod 5; Rozhodnutí plánu 3,
// bod 5): makrokomodity výhledu dávek a výrobky dílen, nabídka nejvýš zásoba, stav se nemění.

const day = START;

/** Ves s vojvodovou rodinou, bez volů, s polem v zásobách `storesKg`. */
function village(storesKg: number): VillageState {
  const s = horseVillage([]);
  s.storesKg = storesKg;
  return s;
}

describe('co ves na trhu nabízí a shání (marketStance)', () => {
  it('obilí nad pojistku nabízí, pod pojistkou shání', () => {
    const rich = village(50_000);
    expect(villageSpare(rich, day).grainKg).toBeGreaterThan(0);
    expect(marketStance(rich, day).offer.grain).toBe(villageSpare(rich, day).grainKg);
    expect(marketStance(rich, day).wants.grain ?? 0).toBe(0);

    const poor = village(10);
    const outlook = stewardOutlook(poor, day, craftCoverage(poor, day));
    const short = grainReserveKg(poor, day, outlook) - grainOnHandKg(poor);
    expect(short).toBeGreaterThan(0);
    expect(marketStance(poor, day).wants.grain).toBeCloseTo(short, 6);
    expect(marketStance(poor, day).offer.grain ?? 0).toBe(0);
    expect(marketStance({ ...rich, hungry: true }, day).offer.grain ?? 0).toBe(0);
  });

  it('krávy nad chovné jádro nabízí, chybějící shání', () => {
    const herd = village(50_000);
    herd.livestock!.herds.cow = 0;
    const keep = breedingCows(herd) + oxenCalvesWanted(herd, day);
    expect(keep).toBe(LIVESTOCK.breedingMin);
    herd.livestock!.herds.cow = keep + 5;
    expect(marketStance(herd, day).offer.cows).toBe(5);
    herd.livestock!.herds.cow = 1;
    expect(marketStance(herd, day).wants.cows).toBe(LIVESTOCK.breedingMin - 1);
  });

  it('koně: klisny nad chovné na prodej, chybějící se shánějí', () => {
    const mares = (n: number): VillageState =>
      horseVillage(Array.from({ length: n }, (_, i) => horse(i + 1, 5, 'female')));
    const want = horsesWanted(mares(0), START).mares;
    expect(want).toBeGreaterThan(0);
    expect(marketStance(mares(want + 2), START).offer.mares).toBe(2);
    expect(marketStance(mares(want + 2), START).wants.mares ?? 0).toBe(0);
    expect(marketStance(mares(0), START).wants.mares).toBe(want);
  });

  it('klády a kámen: celá hromada, nikdy ve wants', () => {
    const s = village(50_000);
    s.woodLogs = 37.6;
    expect(marketStance(s, day).offer.logs).toBe(37);
    expect(marketStance(s, day).offer.stone ?? 0).toBe(villageGoodStock(s, 'stone', day));
    expect(marketStance(s, day).wants.logs ?? 0).toBe(0);
    expect(marketStance(s, day).wants.stone ?? 0).toBe(0);
  });

  it('jídlo a zboží vsi (maso, sýr, luštěniny, kůže) hostitel nenabízí ani neshání', () => {
    const stocked = village(50_000);
    stocked.meatKg = 400;
    stocked.cheeseKg = 300;
    stocked.legumesKg = 200;
    stocked.wares = { honeyKg: 20, hides: 5 } as VillageState['wares'];
    for (const g of ['meat', 'cheese', 'legumes', 'hides'] as const) {
      expect(villageGoodStock(stocked, g, day), g).toBeGreaterThan(0);
      expect(marketStance(stocked, day).offer[g] ?? 0, g).toBe(0);
      expect(marketStance(stocked, day).wants[g] ?? 0, g).toBe(0);
    }
  });

  it('stav nemění', () => {
    const s = village(50_000);
    s.woodLogs = 10;
    const before = structuredClone(s);
    marketStance(s, day);
    expect(s).toEqual(before);
  });
});

// Výrobky dílen (markets.md – Rozhodnutí plánu 3, bod 5): nad vlastní potřebu ves nabízí, do
// potřeby shání jen bez vlastního pracujícího řemeslníka.
describe('výrobky dílen na trhu (Rozhodnutí plánu 3, bod 5)', () => {
  it('nástroje: s kovářem nabízí vybavení nad toolNeedKg a neshání', () => {
    const s = village(50_000);
    withWorkshop(s, 'smith', 700);
    s.toolEquipmentKg = toolNeedKg(s, day) + 30;
    expect(marketStance(s, day).offer.tools).toBe(30);
    expect(marketStance(s, day).wants.tools ?? 0).toBe(0);
  });

  it('nástroje: bez kováře shání do potřeby a nenabízí; s kovářem neshání', () => {
    const s = village(50_000);
    s.toolEquipmentKg = toolNeedKg(s, day) - 12;
    expect(marketStance(s, day).wants.tools).toBe(12);
    expect(marketStance(s, day).offer.tools ?? 0).toBe(0);
    withWorkshop(s, 'smith', 700);
    s.toolEquipmentKg = toolNeedKg(s, day) - 12;
    expect(marketStance(s, day).wants.tools ?? 0).toBe(0);
  });

  it('keramika a dřevěné nářadí: nad craftTargets nabízí, bez řemeslníka shání do zásoby', () => {
    const s = village(50_000);
    withWorkshop(s, 'potter', 700);
    const targets = craftTargets(s, day);
    s.crafts = { charcoalKg: 0, potteryKg: targets.potteryKg + 8, woodToolsKg: 5 };
    expect(marketStance(s, day).offer.pottery).toBeCloseTo(8, 9);
    expect(marketStance(s, day).wants.pottery ?? 0).toBe(0);
    // dřevěné nářadí bez tesaře: chybí do zásoby tesaře
    expect(marketStance(s, day).wants.woodTools).toBeCloseTo(targets.woodToolsKg - 5, 9);
    expect(marketStance(s, day).offer.woodTools ?? 0).toBe(0);
    s.crafts.woodToolsKg = targets.woodToolsKg + 6;
    expect(marketStance(s, day).offer.woodTools).toBeCloseTo(6, 9);
    expect(marketStance(s, day).wants.woodTools ?? 0).toBe(0);
    // keramika bez hrnčíře pod zásobou: shání, co chybí
    const bare = village(50_000);
    bare.crafts = { charcoalKg: 0, potteryKg: 10 };
    expect(marketStance(bare, day).wants.pottery).toBeCloseTo(
      craftTargets(bare, day).potteryKg - 10,
      9,
    );
  });

  it('hřivny: bez kováře shání přesně na vůz čekající na kování, s kovářem ne', () => {
    const s = village(50_000);
    withWorkshop(s, 'carpenter', 700, {
      cart: { kind: 'two-wheel', done: CARPENTRY.cartManDays['two-wheel'] },
    });
    s.crafts = { charcoalKg: 0, potteryKg: 0 };
    // 3 kg kování dvoukoláku × hřivny na kg kování
    expect(cartIronBarsKg('two-wheel')).toBeCloseTo(
      CART_IRON.kg['two-wheel'] * FORGE.barsKgPerKg,
      9,
    );
    expect(marketStance(s, day).wants.ironBars).toBe(cartIronBarsKg('two-wheel'));
    expect(marketStance(s, day).offer.ironBars ?? 0).toBe(0);
    withWorkshop(s, 'smith', 701);
    expect(marketStance(s, day).wants.ironBars ?? 0).toBe(0);
  });
});

// Vozy (markets.md – Rozhodnutí plánu 3, bod 5): volné vozy nad vozy, které ves chce, nabízí; bez
// vlastního pracujícího tesaře shání vůz, který chybí (`missingCart`).
describe('vozy na trhu (Rozhodnutí plánu 3, bod 5)', () => {
  /** Ves s ohradou volů (vycvičený pár), které se loni vyplatil právě jeden dvoukolák. */
  function cartVillage(): VillageState {
    const s = village(50_000);
    s.pens = [
      ...(s.pens ?? []),
      {
        id: 900,
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: day - 800,
        team: { readyDay: day - 10 },
        training: null,
      },
    ];
    s.draft = {
      lastYear: { from: day - 365, 'two-wheel': [100], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    return s;
  }

  it('bez tesaře a bez vozu shání dvoukolák (missingCart), s tesařem ne', () => {
    const s = cartVillage();
    expect(missingCart(s)).toBe('two-wheel');
    expect(marketStance(s, day).wants.twoWheelCarts).toBe(1);
    expect(marketStance(s, day).wants.fourWheelCarts ?? 0).toBe(0);
    expect(marketStance(s, day).offer.twoWheelCarts ?? 0).toBe(0);
    withWorkshop(s, 'carpenter', 700);
    expect(marketStance(s, day).wants.twoWheelCarts ?? 0).toBe(0);
  });

  it('s tesařem a 2 volnými dvoukoláky při cartsWanted 1 nabízí jeden', () => {
    const s = cartVillage();
    withWorkshop(s, 'carpenter', 700);
    s.carts = [
      { id: 1, kind: 'two-wheel', builtDay: day - 30 },
      { id: 2, kind: 'two-wheel', builtDay: day - 20 },
    ];
    expect(cartsWanted(s, 'two-wheel')).toBe(1);
    expect(cartsWanted(s, 'four-wheel')).toBe(0);
    expect(marketStance(s, day).offer.twoWheelCarts).toBe(1);
    expect(marketStance(s, day).offer.fourWheelCarts ?? 0).toBe(0);
    expect(marketStance(s, day).wants.twoWheelCarts ?? 0).toBe(0);
    // vůz na cestě pro kování není volný – nad vozy, které ves chce, už nic nezbývá
    s.dwellings.find((d) => d.id === 700)!.workshop!.ironTrip = {
      personId: 1,
      son: false,
      startedDay: day,
      days: 4,
      done: 0,
      kg: 3,
      grainKg: 0,
      to: { kind: 'neighbour', name: 'Lhota', direction: 'E', trailId: null, edge: { x: 0, z: 0 } },
      cartId: 2,
    };
    expect(marketStance(s, day).offer.twoWheelCarts ?? 0).toBe(0);
  });
});

describe('med, vosk a kožešiny na trhu (marketStance – Rozhodnutí plánu 4, bod 6)', () => {
  /** Ves s obilím nad pojistkou a zásobami zboží; kožešin `extraFurs` nad roční potřebou. */
  function withWares(
    extraFurs: number,
    honeyKg = 100,
    waxKg = 12.7,
    storesKg = 50_000,
  ): VillageState {
    const s = village(storesKg);
    const need = yearlyNeed(s, day).furs;
    s.wares = { honeyKg, waxKg, sheepFurs: need + extraFurs - 10, wildFurs: 10, hides: 0 };
    return s;
  }

  it('med nad roční příděl, celý vosk a kožešiny nad potřebu – celé dolů', () => {
    const s = withWares(30);
    expect(villageSpare(s, day).grainKg).toBeGreaterThan(0);
    const { offer, wants } = marketStance(s, day);
    expect(offer.honey).toBe(Math.floor(100 - HONEY.kgPerPersonYear * s.people.length));
    expect(offer.wax).toBe(12);
    expect(offer.furs).toBe(30);
    expect(wants).not.toHaveProperty('honey');
    expect(wants).not.toHaveProperty('wax');
    expect(wants).not.toHaveProperty('furs');
  });

  it('kožešiny pod potřebou nejsou v nabídce, bez zásob zboží nic z toho', () => {
    expect(marketStance(withWares(-5), day).offer).not.toHaveProperty('furs');
    expect(marketStance(withWares(0), day).offer).not.toHaveProperty('furs');
    const bare = village(50_000);
    const { offer } = marketStance(bare, day);
    expect(offer).not.toHaveProperty('honey');
    expect(offer).not.toHaveProperty('wax');
    expect(offer).not.toHaveProperty('furs');
  });

  it('med jen s obilím nad pojistkou: ves pod ní ho neprodá, vosk a kožešiny ano', () => {
    const rich = withWares(30);
    const reserve = grainReserveKg(rich, day, stewardOutlook(rich, day, craftCoverage(rich, day)));
    // pod pojistkou dvou ročních potřeb, ale ne v hladu
    const s = withWares(30, 100, 12.7, reserve * 0.95);
    expect(villageSpare(s, day).grainKg).toBe(0);
    const { offer } = marketStance(s, day);
    expect(offer).not.toHaveProperty('honey');
    expect(offer.wax).toBe(12);
    expect(offer.furs).toBe(30);
  });

  it('nabídka nikdy nad villageGoodStock', () => {
    const s = withWares(30);
    const { offer } = marketStance(s, day);
    for (const good of ['honey', 'wax', 'furs'] as const) {
      expect(offer[good]!).toBeLessThanOrEqual(villageGoodStock(s, good, day));
    }
  });
});
