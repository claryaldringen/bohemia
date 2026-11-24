import { describe, expect, it } from 'vitest';
import { craftCoverage } from '../../crafts/crafts';
import { stewardOutlook } from '../../steward/steward-outlook';
import { peopleSpare } from '../../../vassalage/spare';
import { ageGroup } from '../../people/people';
import { dwelling } from '../../__tests__/kin-fixtures';
import type { MarketArrival, MarketResult, Person, VillageState } from '../../types';
import { joinMarket, marketDay } from '../market';
import { emigrantGroups, emigrantList } from '../people-trade';
import { peopleWanted } from '../market-people';
import { marketStance } from '../market-stance';
import { D, familyHome, report, sownPart } from './market-fixtures';

// Hostitel prodá dospělých nejvýš tolik, kolik postrádá (`peopleSpare` je rozpočet) – rodiny, muži
// a ženy se na trhu sčítají, nesmí si každý druh vzít celý rozpočet (oprava úlohy 8).

const adults = (s: VillageState): number =>
  s.people.filter((p) => ageGroup(p, D) === 'adult').length;

function person(
  id: number,
  age: number,
  dw: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person {
  return { id, bornDay: D - Math.ceil((age + 0.5) * 365.25), dwellingId: dw, sex, ...extra };
}

/** Hostitel s prací nad půdu: familyHome + `houses` domů s párem a jedním svobodným dospělým. */
function sellerHost(houses: number): VillageState {
  const s = familyHome();
  s.fields = [{ id: 1 }];
  s.parts = [sownPart(100)];
  s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
  let id = 700;
  for (let i = 0; i < houses; i++) {
    const dw = 600 + i;
    s.dwellings.push({ ...dwelling(dw), position: { x: 100 + 12 * i, z: 30, rotation: 0 } });
    const h = id++;
    const w = id++;
    s.people.push(
      person(h, 30, dw, 'male', { spouseId: w }),
      person(w, 28, dw, 'female', { spouseId: h }),
    );
    s.people.push(person(id++, 20 + (i % 10), dw, i % 2 === 0 ? 'male' : 'female'));
  }
  s.storesKg = 0;
  const o = stewardOutlook(s, D, craftCoverage(s, D));
  const n = Math.floor((0.85 * o.laborHa) / o.landHa);
  s.parts = Array.from({ length: n }, (_, i) => sownPart(100 + i));
  return s;
}

function arrival(): MarketArrival {
  return {
    key: 'market:x:1',
    fromVillageId: 'x',
    fromName: 'X',
    stayDays: 1,
    travelDays: 0,
    goods: { grain: 200_000 },
    horses: [],
    wants: { families: 9, men: 9, women: 9 },
    report,
    firstStep: 'W',
  };
}

function resultOf(s: VillageState): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.body.kind === 'market-result');
  if (!mail || mail.body.kind !== 'market-result') throw new Error('výsledek chybí');
  return mail.body.result;
}

function budgetOf(s: VillageState): number {
  const o = stewardOutlook(s, D, craftCoverage(s, D));
  const share = o.landHa > 0 && o.laborHa > o.landHa ? 1 - o.landHa / o.laborHa : 0;
  return Math.floor(adults(s) * share + 1e-9);
}

describe('lidé na trhu – sdílený rozpočet dospělých', () => {
  for (const houses of [2, 4, 6, 10]) {
    it(`kupec shání rodiny, muže i ženy: prodá nejvýš rozpočet (${houses} domů)`, () => {
      const host = sellerHost(houses);
      const budget = budgetOf(host);
      expect(budget).toBeGreaterThan(0);
      const stance = marketStance(host, D);
      const offered = emigrantList(
        emigrantGroups(host, D, {
          families: stance.offer.families ?? 0,
          men: stance.offer.men ?? 0,
          women: stance.offer.women ?? 0,
        }),
      ).reduce((n, g) => n + g.people.filter((p) => ageGroup(p, D) === 'adult').length, 0);
      expect(offered).toBeLessThanOrEqual(budget);
      const before = adults(host);
      joinMarket(host, D, arrival());
      marketDay(host, D);
      const sold = (resultOf(host).newcomers ?? []).reduce(
        (n, g) => n + g.people.filter((p) => ageGroup(p, D) === 'adult').length,
        0,
      );
      expect(sold).toBeLessThanOrEqual(budget);
      expect(before - adults(host)).toBeLessThanOrEqual(budget);
    });
  }

  it('skupiny, které prodal sám hostitel, nese výsledek v `newcomers` s `fromHost` (Rozhodnutí plánu 3, bod 13)', () => {
    const host = sellerHost(6);
    joinMarket(host, D, arrival());
    marketDay(host, D);
    const newcomers = resultOf(host).newcomers ?? [];
    expect(newcomers.length).toBeGreaterThan(0);
    expect(newcomers.map((g) => g.fromHost)).toEqual(newcomers.map(() => true));
    // id jsou id hostitele – v jeho `emigrants` se stejným dnem narození
    const emigrated = new Set((host.emigrants ?? []).map((e) => `${e.id}:${e.bornDay}`));
    expect(newcomers.some((g) => g.people.some((p) => emigrated.has(`${p.id}:${p.bornDay}`)))).toBe(
      true,
    );
  });

  it('hostitel druhý den neshání lidi zpět kvůli prodeji', () => {
    const host = sellerHost(6);
    joinMarket(host, D, arrival());
    marketDay(host, D);
    const outlook = stewardOutlook(host, D, craftCoverage(host, D));
    const wanted = peopleWanted(host, D, outlook);
    expect(wanted).toEqual({ families: 0, men: 0, women: 0 });
    expect(peopleSpare(host, D, outlook).families).toBeGreaterThanOrEqual(0);
  });
});
