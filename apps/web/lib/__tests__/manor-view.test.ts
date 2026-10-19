import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  neighbourOf,
  tradeSeason,
  type Person,
  type VillageState,
} from '@bohemia/game';
import { neighbourViews } from '../manor-view';
import { tradePreview } from '../trade-quote';

// Sousedé po hotových stezkách pro panel obchodu (trade.md) – výměna lidí: koho soused dá a vezme
// a koho by ves dala, stejně jako server (`tradeQuote`).

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;

const person = (
  id: number,
  age: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({
  id,
  bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
  dwellingId: 900,
  sex,
  ...extra,
});

/** Ves s hotovou stezkou na jih a přeplněnou polozemnicí (rodiče, dědic, mladší syn, dcera). */
function village(): VillageState {
  const s = foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  const site = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null)!;
  s.constructions = s.constructions.filter((c) => c !== site);
  s.dwellings.push(
    {
      id: site.dwellingId!,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: site.position!,
    },
    {
      id: 900,
      type: 'polozemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
    },
  );
  s.manorId = site.dwellingId!;
  s.people.push(
    person(500, 50, 'male', { spouseId: 501 }),
    person(501, 41, 'female', { spouseId: 500 }),
    person(502, 24, 'male', { spouseId: 503, motherId: 501, fatherId: 500 }),
    person(503, 22, 'female', { spouseId: 502 }),
    person(504, 21, 'male', { spouseId: 505, motherId: 501, fatherId: 500 }),
    person(505, 20, 'female', { spouseId: 504 }),
    person(506, 1, 'male', { motherId: 505, fatherId: 504 }),
    person(507, 18, 'female', { motherId: 501, fatherId: 500 }),
    person(508, 12, 'male', { motherId: 501, fatherId: 500 }),
  );
  s.trails = [
    { id: 1, direction: 'S', pieces: [], lengthM: 500, startedDay: DAY - 100, builtDay: DAY - 1 },
  ];
  const n = neighbourOf(s.seed, 'S');
  s.trade = {
    neighbours: [
      {
        direction: 'S',
        season: tradeSeason(DAY),
        supply: { ...n.supply },
        demand: { ...n.demand },
        people: { families: [2], adults: 1, takes: { families: 2, adults: 3 } },
      },
    ],
    expeditions: [],
    nextId: 1,
  };
  return s;
}

describe('výměna lidí v panelu obchodu (trade.md – Výměna lidí)', () => {
  it('koho soused dá a vezme a koho by ves dala – jen tolik, kolik server pustí', () => {
    const [n] = neighbourViews(village(), DAY);
    expect(n!.people.offers).toEqual({
      families: [{ people: 4, price: 1036.8 }],
      adults: 1,
      adultPrice: 345.6,
    });
    expect(n!.people.takes).toEqual({ families: 2, adults: 3 });
    // jediná rodina, která smí odejít (mladší syn se ženou a dítětem), a svobodná dcera
    expect(n!.people.have).toEqual({
      families: [{ people: 3, credit: 900 }],
      adults: 1,
      adultCredit: 360,
    });
    const preview = tradePreview(
      n!,
      {},
      {},
      {
        give: { families: 1, adults: 1 },
        get: { families: 0, adults: 0 },
      },
    );
    expect(preview.credit).toBe(1260);
    expect(preview.blocked).toBeNull();
  });
});
