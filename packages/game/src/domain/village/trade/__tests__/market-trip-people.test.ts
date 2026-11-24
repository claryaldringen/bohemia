import { describe, expect, it } from 'vitest';
import { ironTripHelpers } from '../../crafts/cart-iron';
import { purchaseTravelers } from '../../crafts/craft-buying';
import { awayFromWork, isAdult } from '../../people/people';
import type { Person, TradeGoods, TradePeople, VillageState } from '../../types';
import { dwelling } from '../../__tests__/kin-fixtures';
import { leavingGroups, peopleOf, withoutGroups } from '../market-people';
import { marketFreeAdults, marketTripPeople, planMarketTrip } from '../market-trip';
import { emigrantGroups, emigrantList, type EmigrantGroup } from '../people-trade';
import { expeditionLaborNeed } from '../trade';
import { D, FAMILY_IDS, familyHome, target } from './market-fixtures';

// Lidé na prodej a volní nosiči pro náhled výpravy (markets.md – Rozhodnutí plánu 3, bod 10; plán 3,
// Úloha 11, opravné kolo 2): server spočítá jen vybrané počty (`marketTripPeople`) stejně jako
// kontrola výpravy (`planMarketTrip`). Dřívější model všech kombinací (`marketPeopleModel`) stál
// (F+1)·(M+2) výběrů – u vsi s 250 lidmi vteřiny při každém pohledu na dvorec.

/**
 * Dnešní model před opravným kolem 2 (`marketPeopleModel` + `marketPreviewPeople` @ 1c262f86) –
 * reference pro test rovnosti. Výběr je sekvenční: `men[f]` po odchodu `f` rodin, `women[f][m]`
 * po odchodu `f` rodin a `m` mužů.
 */
interface LegacyModel {
  families: number[];
  men: number[][];
  women: number[][][];
  adults: number;
  busy: number;
}

function legacyModel(state: VillageState, day: number): LegacyModel {
  const adultsOf = (groups: readonly EmigrantGroup[]): number[] =>
    groups.map((g) => g.people.filter((p) => isAdult(p, day) && !awayFromWork(p, day)).length);
  const everyone = { families: Infinity, men: Infinity, women: Infinity };
  const groups = emigrantGroups(state, day, everyone).families;
  const model: LegacyModel = {
    families: adultsOf(groups),
    men: [],
    women: [],
    adults: state.people.filter((p) => isAdult(p, day) && !awayFromWork(p, day)).length,
    busy: expeditionLaborNeed(state, day + 1) + purchaseTravelers(state) + ironTripHelpers(state),
  };
  for (let f = 0; f <= groups.length; f++) {
    const men = emigrantGroups(state, day, { families: f, men: Infinity, women: 0 }).men;
    model.men.push(adultsOf(men));
    const row: number[][] = [];
    for (let m = 0; m <= men.length; m++) {
      const women = emigrantGroups(state, day, { families: f, men: m, women: Infinity }).women;
      row.push(adultsOf(women));
    }
    model.women.push(row);
  }
  return model;
}

function legacyPreview(
  model: LegacyModel,
  give: TradeGoods,
): { stock: TradePeople; adults: number } {
  const want = peopleOf(give);
  const f = Math.min(want.families, model.families.length);
  const men = model.men[f] ?? [];
  const m = Math.min(want.men, men.length);
  const women = model.women[f]?.[m] ?? [];
  const w = Math.min(want.women, women.length);
  const sum = (list: readonly number[], n: number): number =>
    list.slice(0, n).reduce((a, b) => a + b, 0);
  const leaving = sum(model.families, f) + sum(men, m) + sum(women, w);
  return {
    stock: { families: f, men: m, women: w },
    adults: Math.max(0, model.adults - leaving - model.busy),
  };
}

/**
 * Ves `familyHome` s dalšími domy: v každém z `families` domů drží dům starší pár se ženatým
 * dědicem (35 let) a smí odejít rodina mladšího syna (30 let, dvě malé děti); svobodný syn a dcera
 * páru jsou na prodej jako muž a žena. V každém z `singles` domů vdovec či vdova s dospělým synem
 * a dcerou. Rodiny a svobodní berou z týchž domů – po odchodu rodiny se mění přeplnění domů,
 * a tím i pořadí mužů a žen ve výběru.
 */
function households(families: number, singles: number): VillageState {
  const s = familyHome();
  let id = 1_000;
  let house = 600;
  const person = (
    age: number,
    dwellingId: number,
    sex: Person['sex'],
    extra: Partial<Person> = {},
  ): Person => ({
    id: id++,
    bornDay: D - Math.ceil((age + 0.5) * 365.25),
    dwellingId,
    sex,
    ...extra,
  });
  const marry = (man: Person, wife: Person): void => {
    man.spouseId = wife.id;
    wife.spouseId = man.id;
  };
  const addHouse = (): number => {
    s.dwellings.push({
      ...dwelling(house),
      position: { x: 100 + (house - 600) * 20, z: 40, rotation: 0 },
    });
    return house++;
  };
  for (let i = 0; i < families; i++) {
    const home = addHouse();
    const father = person(60, home, 'male');
    const mother = person(57, home, 'female');
    marry(father, mother);
    s.people.push(father, mother);
    for (const [age, kids] of [
      [35, [8, 5]],
      [30, [6, 3]],
    ] as const) {
      const son = person(age, home, 'male', { fatherId: father.id, motherId: mother.id });
      const wife = person(age - 3, home, 'female');
      marry(son, wife);
      s.people.push(son, wife);
      for (const kid of kids) {
        s.people.push(
          person(kid, home, kid % 2 ? 'male' : 'female', { fatherId: son.id, motherId: wife.id }),
        );
      }
    }
    const parents = { fatherId: father.id, motherId: mother.id };
    s.people.push(person(20 + (i % 5), home, 'male', parents));
    s.people.push(person(18 + (i % 4), home, 'female', parents));
  }
  for (let i = 0; i < singles; i++) {
    const home = addHouse();
    const parent = person(55, home, i % 2 ? 'male' : 'female');
    const of = i % 2 ? { fatherId: parent.id } : { motherId: parent.id };
    s.people.push(
      parent,
      person(22 + (i % 10), home, 'male', of),
      person(20 + (i % 9), home, 'female', of),
    );
  }
  s.nextId = id;
  return s;
}

/** Ves s rodinami, svobodnými a lidmi pryč (práce mimo ves) – dospělí rodin i svobodní. */
function withAway(): VillageState {
  const s = households(4, 4);
  for (const p of s.people.filter((q) => q.id % 7 === 0)) {
    p.away = { kind: 'labor', untilDay: D + 30 };
  }
  return s;
}

const FIXTURES: Record<string, () => VillageState> = {
  'jedna rodina na prodej': familyHome,
  'pět domů s rodinami a tři se svobodnými': () => households(5, 3),
  'rodiny, svobodní a lidé pryč': withAway,
};

describe('marketTripPeople – lidé a nosiči v náhledu = server (plán 3, Úloha 11)', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    it(`${name}: pro každý výběr totéž jako dnešní model`, () => {
      const s = make();
      const model = legacyModel(s, D);
      const F = model.families.length;
      const M = model.men[0]!.length;
      const W = model.women[0]![0]!.length;
      expect(F).toBeGreaterThan(0);
      for (let families = 0; families <= F + 1; families++) {
        for (let men = 0; men <= M + 1; men++) {
          for (let women = 0; women <= W + 1; women++) {
            const give = { families, men, women };
            expect(marketTripPeople(s, D, give), JSON.stringify(give)).toEqual(
              legacyPreview(model, give),
            );
          }
        }
      }
    });
  }

  it('výběr mužů a žen se s odchodem rodin mění – model všech kombinací nejde spočítat jedním průchodem', () => {
    const s = households(5, 3);
    const ids = (groups: readonly EmigrantGroup[]): number[] => groups.map((g) => g.people[0]!.id);
    const men = (families: number): number[] =>
      ids(emigrantGroups(s, D, { families, men: Infinity, women: 0 }).men);
    const first = emigrantGroups(s, D, { families: 1, men: 0, women: 0 }).families[0]!;
    const gone = new Set(first.people.map((p) => p.id));
    expect(men(1)).not.toEqual(men(0).filter((id) => !gone.has(id)));
  });

  it('= kontrola výpravy: skupiny, které server odvede, a volní nosiči bez nich', () => {
    const s = households(3, 2);
    for (const give of [
      { families: 2 },
      { men: 3, women: 1 },
      { families: 1, men: 9, grain: 100 },
    ]) {
      const leaving = leavingGroups(s, D, give);
      expect(marketTripPeople(s, D, give)).toEqual({
        stock: {
          families: leaving.families.length,
          men: leaving.men.length,
          women: leaving.women.length,
        },
        adults: marketFreeAdults(withoutGroups(s, emigrantList(leaving)), D),
      });
    }
  });

  it('muži bez odchodu rodin jsou ve výběru, i když po všech rodinách už nezbyli', () => {
    const s = familyHome();
    const all = emigrantGroups(s, D, { families: Infinity, men: Infinity, women: Infinity });
    const none = marketTripPeople(s, D, { men: 99 });
    expect(none.stock.men).toBeGreaterThanOrEqual(all.men.length);
    expect(none.stock.men).toBe(leavingGroups(s, D, { men: 99 }).men.length);
  });

  it('rodina odejde i s dospělými: nosičů ubude', () => {
    const s = familyHome();
    const plan = planMarketTrip(s, D, { give: { families: 1 }, wants: {}, stayDays: 1 }, target);
    expect(plan.ok).toBe(true);
    const rest = { ...s, people: s.people.filter((p) => !FAMILY_IDS.includes(p.id)) };
    expect(marketFreeAdults(rest, D)).toBe(marketFreeAdults(s, D) - 2);
    expect(marketTripPeople(s, D, { families: 1 }).adults).toBe(marketFreeAdults(rest, D));
  });
});
