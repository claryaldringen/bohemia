import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  neighbourOf,
  tradeSeason,
  type Person,
  type VillageState,
} from '@bohemia/game';
import { sceneExpeditions } from '../caravan-view';
import { expeditionView, manorFamily, neighbourViews } from '../manor-view';
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
        people: {
          families: [2],
          men: 1,
          women: 0,
          takes: { families: 2, men: 2, women: 3 },
        },
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
      men: 1,
      women: 0,
      adultPrice: 345.6,
    });
    expect(n!.people.takes).toEqual({ families: 2, men: 2, women: 3 });
    // jediná rodina, která smí odejít (mladší syn se ženou a dítětem), a svobodná dcera
    expect(n!.people.have).toEqual({
      families: [{ people: 3, credit: 900 }],
      men: 0,
      women: 1,
      adultCredit: 360,
    });
    const preview = tradePreview(
      n!,
      {},
      {},
      {
        give: { families: 1, men: 0, women: 1 },
        get: { families: 0, men: 0, women: 0 },
      },
    );
    expect(preview.credit).toBe(1260);
    expect(preview.blocked).toBeNull();
  });
});

describe('výprava na cestě v panelu – tempo z práce dne (trade.md – Obchod)', () => {
  const sent = (today: number | null, done = 24): VillageState => {
    const s = village();
    s.lastDay = DAY;
    s.trade!.expeditions = [
      {
        id: 1,
        direction: 'S',
        trailId: 1,
        startedDay: today === null ? DAY : DAY - 3,
        give: { meat: 289 },
        get: {},
        porters: 12,
        days: 5,
        cost: 60,
        done,
        getPeople: { families: [], adults: 2 },
      },
    ];
    s.labor = {
      day: DAY,
      shares:
        today === null || today === 0
          ? []
          : [{ activity: 'trade', target: { kind: 'trail', id: 1 }, manDays: today }],
    };
    return s;
  };

  it('plné tempo, zdržení, stání (ves bez dospělých) a výprava vyslaná dnes', () => {
    const view = (s: VillageState): ReturnType<typeof expeditionView> =>
      expeditionView(s, s.trade!.expeditions[0]!);
    expect(view(sent(12))).toMatchObject({ pace: 'full', daysLeft: 3, today: 12, progress: 0.4 });
    expect(view(sent(7.18))).toMatchObject({ pace: 'slow', daysLeft: 6, today: 7.18 });
    expect(view(sent(0))).toMatchObject({ pace: 'waiting', daysLeft: null, today: 0 });
    expect(view(sent(null, 0))).toMatchObject({ pace: 'starting', daysLeft: 5, today: null });
    // poslední den stačilo méně než nosiči – není to zdržení
    expect(view(sent(4, 60))).toMatchObject({ pace: 'full', daysLeft: 0 });
    // výprava uložená s dospělými bez pohlaví – v panelu polovina muži, zbytek ženy
    expect(view(sent(12)).getPeople).toEqual({ families: 0, men: 1, women: 1 });
  });
});

describe('výprava pro karavanu ve scéně (trade.md – Ve scéně)', () => {
  it('kdo jde tam a zpátky, postup a dnešní tempo', () => {
    const s = village();
    s.lastDay = DAY;
    s.trade!.expeditions = [
      {
        id: 4,
        direction: 'S',
        trailId: 1,
        startedDay: DAY - 2,
        give: { meat: 100 },
        get: {},
        porters: 6,
        days: 5,
        cost: 30,
        done: 12,
        givePeople: {
          families: 0,
          men: 1,
          women: 0,
          people: 1,
          members: [{ sex: 'male', bornDay: DAY - Math.ceil(20.5 * YEAR), group: 'man' }],
        },
        getPeople: { families: [1], men: 0, women: 1 },
      },
    ];
    s.labor = {
      day: DAY,
      shares: [{ activity: 'trade', target: { kind: 'trail', id: 1 }, manDays: 3 }],
    };
    const [e] = sceneExpeditions(s);
    expect(e).toMatchObject({
      id: 4,
      trailId: 1,
      porters: 6,
      carriesOut: true,
      carriesBack: false,
      progress: 0.4,
      rate: 0.1,
      onMap: 0.8,
    });
    expect(e!.leaving).toEqual([{ sex: 'male', age: 20 }]);
    // rodina se třemi lidmi a svobodná žena – pohlaví a věk jako při příchodu (newcomerProfiles)
    expect(e!.coming).toHaveLength(4);
    expect(e!.coming.map((p) => p.sex).slice(0, 2)).toEqual(['male', 'female']);
    expect(e!.coming[3]!.sex).toBe('female');
    // výprava dnes nepostoupila – stojí
    s.labor = { day: DAY, shares: [] };
    expect(sceneExpeditions(s)[0]!.rate).toBe(0);
  });
});

describe('rodina ve dvorci (lord.md – Co hráč vidí)', () => {
  it('obyvatelé dvorce od nejstaršího; cvičící muži mají dovednosti, ženy ne', () => {
    const s = village();
    const day = DAY;
    const arms = { bow: 64.4, combat: 51, riding: 0 };
    s.people.find((p) => p.id === 502)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 500)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 501)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 503)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 502)!.arms = arms;
    const family = manorFamily(s, day);
    const by = (id: number) => family.find((m) => m.id === id);
    expect(by(500)?.role).toBe('Vojvoda');
    expect(by(500)?.arms).toEqual({ bow: 0, combat: 0, riding: 0 });
    expect(by(502)?.arms).toEqual({ bow: 64, combat: 51, riding: 0 });
    expect(by(501)?.arms).toBeNull();
    expect(by(503)?.arms).toBeNull();
    expect(by(502)?.horse).toBe(false);
    const ages = family.map((m) => m.age);
    expect(ages).toEqual([...ages].sort((a, b) => b - a));
  });
});
