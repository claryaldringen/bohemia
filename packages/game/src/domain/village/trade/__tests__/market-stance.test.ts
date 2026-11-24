import { describe, expect, it } from 'vitest';
import { villageSpare } from '../../../vassalage/spare';
import { grainOnHandKg, grainReserveKg } from '../../../vassalage/spare';
import { cartIronBarsKg, craftCoverage, craftTargets } from '../../crafts/crafts';
import { FORGE } from '../../crafts/iron-rates';
import { toolNeedKg } from '../../crafts/iron';
import { horsesWanted } from '../../livestock/horse-breeding';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { LIVESTOCK } from '../../livestock/livestock';
import { CARPENTRY, CART_IRON } from '../../rules';
import { stewardOutlook } from '../../steward/steward-outlook';
import type { VillageState } from '../../types';
import { START, horse, horseVillage } from '../../__tests__/horse-fixtures';
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

  it('jídlo a zboží vsi (maso, sýr, luštěniny, med, kůže) hostitel nenabízí ani neshání', () => {
    const stocked = village(50_000);
    stocked.meatKg = 400;
    stocked.cheeseKg = 300;
    stocked.legumesKg = 200;
    stocked.wares = { honeyKg: 20, hides: 5 } as VillageState['wares'];
    for (const g of ['meat', 'cheese', 'honey', 'legumes', 'hides'] as const) {
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
