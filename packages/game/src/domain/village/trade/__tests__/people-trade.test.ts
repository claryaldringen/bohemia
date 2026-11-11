import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { availableSettlers, familiesOf } from '../../people/households';
import { hasCloseKinIn } from '../../people/kinship';
import { neighbourOf, neighbourStock, tradeSeason } from '../neighbours';
import { createRandom, deriveSeed } from '../../../landscape/random';
import {
  emigrantGroups,
  neighbourFamilyValue,
  neighbourPeople,
  newcomerProfiles,
  personValue,
  settleNewcomers,
  storedNeighbourPeople,
} from '../people-trade';
import { ageYears } from '../../people/people';
import { PEOPLE_TRADE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import {
  NO_EMIGRANTS,
  NO_PEOPLE_OFFERED,
  NO_PEOPLE_WANTED,
  OVER_PEOPLE_DEMAND,
  OVER_PEOPLE_SUPPLY,
  UNFAIR,
  adultBuyPrice,
  familyBuyPrice,
  finishExpeditions,
  startExpedition,
  tradeQuote,
  villageGoodStock,
} from '../trade';
import { finishTrail, startTrail, DIRECTIONS } from '../trail';
import type { NeighbourPeople, Person, Sex, TradeGoods, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Výměna lidí se sousedem (trade.md – Výměna lidí; Martin 19. 10. 2026): soused má na rok lidi
// navíc, nebo je shání; vyměňují se rodiny a svobodní dospělí za zboží; naši odejdou s výpravou,
// lidé souseda přijdou s jejím návratem.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;
/** Dům plné rodiny (polozemnice) – id obydlí. */
const HOUSE = 900;

/** Člověk ve věku `age` (uprostřed roku) v domě HOUSE. */
function person(id: number, age: number, sex: Sex, extra: Partial<Person> = {}): Person {
  return {
    id,
    bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
    dwellingId: HOUSE,
    sex,
    ...extra,
  };
}

/**
 * Ves s hotovou stezkou na jih, zásobami a přeplněnou polozemnicí: rodiče (50, 41), ženatý syn
 * dědic se ženou, mladší ženatý syn se ženou a dítětem, svobodná dcera 18 a syn 12 – 9 lidí.
 */
function trading(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, 'S', LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 100000;
  next.meatKg = 5000;
  next.cheeseKg = 5000;
  next.legumesKg = 5000;
  next.woodLogs = 500;
  next.crafts = { charcoalKg: 50000, potteryKg: 5000, ironBarsKg: 500 };
  next.livestock!.herds.cow = 60;
  next.dwellings.push({
    id: HOUSE,
    type: 'polozemnice',
    builtDay: DAY - 2000,
    condition: 1,
    position: { x: 30, z: 0, rotation: 0 },
  });
  next.people.push(
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
  next.nextId = Math.max(next.nextId, 600);
  return next;
}

/** Soused na jihu má letos lidi podle `people` (zbytek roku uložený ve vsi). */
function withNeighbourPeople(state: VillageState, people: NeighbourPeople): VillageState {
  const n = neighbourOf(state.seed, 'S');
  const next = structuredClone(state);
  next.trade = {
    neighbours: [
      {
        direction: 'S',
        season: tradeSeason(DAY),
        supply: { ...n.supply },
        demand: { ...n.demand },
        people,
      },
    ],
    expeditions: [],
    nextId: 1,
  };
  return next;
}

/** Všechno, co soused jihu letos shání (ves má dost všeho) – bilance aspoň 1 600 kg obilí. */
function payAll(state: VillageState): TradeGoods {
  const stock = neighbourStock(state, 'S', DAY);
  return Object.fromEntries(
    neighbourOf(state.seed, 'S').demands.map((g) => [
      g,
      Math.min(stock.demand[g] ?? 0, villageGoodStock(state, g)),
    ]),
  ) as TradeGoods;
}

const TAKES: NeighbourPeople = {
  families: [],
  men: 0,
  women: 0,
  takes: { families: 1, men: 1, women: 1 },
};
const GIVES: NeighbourPeople = {
  families: [2, 0],
  men: 1,
  women: 1,
  takes: { families: 0, men: 0, women: 0 },
};

describe('lidé souseda na rok obchodu', () => {
  it('deterministicky ze seedu, směru a roku; lidi navíc, nebo je shání, nebo nic', () => {
    expect(neighbourPeople(7, 'N', 600)).toEqual(neighbourPeople(7, 'N', 600));
    let surplus = 0;
    let shortage = 0;
    let total = 0;
    for (let seed = 1; seed <= 80; seed++) {
      for (const d of DIRECTIONS) {
        const p = neighbourPeople(seed, d, 600 + (seed % 5));
        total++;
        const gives = p.families.length + p.men + p.women;
        const takes = p.takes.families + p.takes.men + p.takes.women;
        // buď dá, nebo vezme – ne obojí
        expect(gives > 0 && takes > 0).toBe(false);
        if (gives > 0) surplus++;
        if (takes > 0) shortage++;
        expect(p.families.length).toBeLessThanOrEqual(PEOPLE_TRADE.families.max);
        expect(p.men + p.women).toBeLessThanOrEqual(PEOPLE_TRADE.adults.max);
        expect(p.takes.families).toBeLessThanOrEqual(PEOPLE_TRADE.families.max);
        expect(p.takes.men + p.takes.women).toBeLessThanOrEqual(PEOPLE_TRADE.adults.max);
        for (const c of p.families) {
          expect(c).toBeGreaterThanOrEqual(PEOPLE_TRADE.children.min);
          expect(c).toBeLessThanOrEqual(PEOPLE_TRADE.children.max);
        }
      }
    }
    expect(surplus / total).toBeGreaterThan(0.3);
    expect(surplus / total).toBeLessThan(0.5);
    expect(shortage / total).toBeGreaterThan(0.2);
    expect(shortage / total).toBeLessThan(0.4);
    // jiný rok, jiní lidé (aspoň u některých sousedů)
    const years = new Set(
      [600, 601, 602, 603].map((y) => JSON.stringify(neighbourPeople(7, 'N', y))),
    );
    expect(years.size).toBeGreaterThan(1);
  });

  it('zbytek roku uložený před výměnou lidí – lidé platí celý rok podle povahy', () => {
    const s = trading();
    const n = neighbourOf(s.seed, 'S');
    s.trade = {
      neighbours: [
        { direction: 'S', season: tradeSeason(DAY), supply: { ...n.supply }, demand: {} },
      ],
      expeditions: [],
      nextId: 1,
    };
    const stock = neighbourStock(s, 'S', DAY);
    expect(stock.demand).toEqual({});
    expect(stock.people).toEqual(neighbourPeople(s.seed, 'S', tradeSeason(DAY)));
  });
});

describe('koho ves dá', () => {
  it('rodinu mladšího ženatého syna – dědic a rodiče zůstávají, dvorec ne', () => {
    const s = trading();
    const { families, men, women } = emigrantGroups(s, DAY, { families: 2, men: 0, women: 0 });
    // jediná rodina, která se smí oddělit; dvorec (zakladatelé) nedá nikoho
    expect(families.map((f) => f.people.map((p) => p.id))).toEqual([[504, 505, 506]]);
    expect(men).toEqual([]);
    expect(women).toEqual([]);
    // dítě za polovinu
    expect(families[0]!.valueKg).toBe(PEOPLE_TRADE.adultValueKg * 2.5);
    expect(
      familiesOf(
        s,
        s.dwellings.find((d) => d.id === HOUSE)!,
        DAY,
      ),
    ).toHaveLength(1);
  });

  it('svobodné muže a ženy 16–44 zvlášť – dcera 18 je žena; dvanáctiletý syn ne', () => {
    const s = trading();
    const { men, women } = emigrantGroups(s, DAY, { families: 0, men: 3, women: 3 });
    expect(women.map((a) => a.people.map((p) => p.id))).toEqual([[507]]);
    expect(women[0]!.kind).toBe('woman');
    expect(women[0]!.valueKg).toBe(PEOPLE_TRADE.adultValueKg);
    expect(men).toEqual([]);
  });

  it('výběr je postupný – prvních n skupin je pro každé větší n stejných', () => {
    const s = trading();
    const one = emigrantGroups(s, DAY, { families: 1, men: 0, women: 1 });
    const more = emigrantGroups(s, DAY, { families: 2, men: 3, women: 3 });
    expect(more.families.slice(0, 1)).toEqual(one.families);
    expect(more.women.slice(0, 1)).toEqual(one.women);
  });

  it('nikdy ne svobodného dědice neplodných rodičů ani člověka, bez kterého se dům rozpadne', () => {
    const s = trading();
    s.people = s.people.filter((p) => p.dwellingId !== HOUSE);
    s.people.push(
      // matka 50 už nerodí, ženatý syn není – nejstarší syn (20) je dědic, odejít smí bratr (18)
      person(500, 52, 'male', { spouseId: 501 }),
      person(501, 50, 'female', { spouseId: 500 }),
      person(502, 20, 'male', { motherId: 501, fatherId: 500 }),
      person(503, 18, 'male', { motherId: 501, fatherId: 500 }),
    );
    expect(
      emigrantGroups(s, DAY, { families: 0, men: 2, women: 0 }).men.map((a) => a.people[0]!.id),
    ).toEqual([503]);
    // dům se dvěma staršími a jednou dcerou – bez ní by se domácnost rozpadla
    s.people = s.people.filter((p) => p.dwellingId !== HOUSE);
    s.people.push(
      person(500, 60, 'male', { spouseId: 501 }),
      person(501, 58, 'female', { spouseId: 500 }),
      person(507, 18, 'female', { motherId: 501, fatherId: 500 }),
    );
    expect(emigrantGroups(s, DAY, { families: 0, men: 0, women: 1 }).women).toEqual([]);
  });
});

describe('ocenění a kontrola výměny lidí', () => {
  it('dospělý ≈ dvouletá spotřeba jídla, dítě polovina; přirážky jako u zboží', () => {
    expect(PEOPLE_TRADE.adultValueKg).toBe(360);
    expect(neighbourFamilyValue(2)).toBe(360 * 3);
    expect(familyBuyPrice(2)).toBeCloseTo(360 * 3 * 0.96);
    expect(adultBuyPrice()).toBeCloseTo(360 * 0.96);
    const child = person(1, 5, 'male');
    expect(personValue(child, DAY)).toBe(180);
  });

  it('lidi ves dá, jen když je soused shání; vezme jen, co soused nabízí', () => {
    const s = trading();
    const none = withNeighbourPeople(s, {
      families: [],
      men: 0,
      women: 0,
      takes: { families: 0, men: 0, women: 0 },
    });
    const giveOne = {
      direction: 'S' as const,
      give: {},
      get: {},
      givePeople: { families: 0, men: 0, women: 1 },
    };
    expect(tradeQuote(none, giveOne, DAY).blocked).toBe(NO_PEOPLE_WANTED);
    const getOne = {
      direction: 'S' as const,
      give: {},
      get: {},
      getPeople: { families: 0, men: 1, women: 0 },
    };
    expect(tradeQuote(none, getOne, DAY).blocked).toBe(NO_PEOPLE_OFFERED);
    const takes = withNeighbourPeople(s, TAKES);
    expect(
      tradeQuote(takes, { ...giveOne, givePeople: { families: 2, men: 0, women: 0 } }, DAY).blocked,
    ).toBe(OVER_PEOPLE_DEMAND);
    // dva dospělí soused vezme, ale ves má jen jednoho, koho smí dát
    expect(
      tradeQuote(takes, { ...giveOne, givePeople: { families: 0, men: 1, women: 0 } }, DAY).blocked,
    ).toBe(NO_EMIGRANTS);
    const gives = withNeighbourPeople(s, GIVES);
    expect(
      tradeQuote(gives, { ...getOne, getPeople: { families: 3, men: 0, women: 0 } }, DAY).blocked,
    ).toBe(OVER_PEOPLE_SUPPLY);
    // za rodinu je třeba zaplatit
    expect(
      tradeQuote(gives, { ...getOne, getPeople: { families: 1, men: 0, women: 0 } }, DAY).blocked,
    ).toBe(UNFAIR);
  });

  it('bilance: rodina souseda za obilí; naše dcera za obilí souseda', () => {
    const s = trading();
    const gives = withNeighbourPeople(s, GIVES);
    const quote = tradeQuote(
      gives,
      {
        direction: 'S',
        give: payAll(gives),
        get: {},
        getPeople: { families: 1, men: 1, women: 0 },
      },
      DAY,
    );
    expect(quote.blocked).toBeNull();
    expect(quote.price).toBeCloseTo(familyBuyPrice(2) + adultBuyPrice(), 1);
    // lidé nosiče nepotřebují
    const empty = tradeQuote(
      gives,
      { direction: 'S', give: {}, get: {}, getPeople: { families: 1, men: 0, women: 0 } },
      DAY,
    );
    expect(empty.porters).toBe(1);
    const takes = withNeighbourPeople(s, TAKES);
    const sell = tradeQuote(
      takes,
      { direction: 'S', give: {}, get: {}, givePeople: { families: 1, men: 0, women: 1 } },
      DAY,
    );
    expect(sell.blocked).toBeNull();
    expect(sell.credit).toBeCloseTo(360 * 2.5 + 360, 1);
  });
});

describe('výprava s lidmi', () => {
  it('naši odejdou hned – v rodokmenu jako odešlí ve směru souseda; soused odepíše poptávku', () => {
    const s = withNeighbourPeople(trading(), TAKES);
    const next = startExpedition(s, DAY, {
      direction: 'S',
      give: {},
      get: {},
      givePeople: { families: 1, men: 0, women: 1 },
    });
    const gone = [504, 505, 506, 507];
    expect(next.people.some((p) => gone.includes(p.id))).toBe(false);
    // v rodokmenu zůstanou ti, jejichž rodič nebo sourozenec ve vsi žije (kinship.md)
    expect(next.emigrants?.map((e) => e.id).sort()).toEqual([504, 507]);
    expect(next.emigrants?.every((e) => e.direction === 'S')).toBe(true);
    // rodiče, kteří zůstali, mají příbuzné ve vsi souseda (válka – war.md)
    expect(hasCloseKinIn(next, 500, 'S')).toBe(true);
    const stock = neighbourStock(next, 'S', DAY);
    expect(stock.people!.takes).toEqual({ families: 0, men: 1, women: 0 });
    const e = next.trade!.expeditions[0]!;
    expect(e.givePeople).toMatchObject({ families: 1, men: 0, women: 1, people: 4 });
    // kdo odešel – pohlaví a den narození (postavy karavany ve scéně)
    expect(e.givePeople!.members!.map((m) => [m.sex, m.group])).toEqual([
      ['male', 'family'],
      ['female', 'family'],
      ['male', 'family'],
      ['female', 'woman'],
    ]);
    expect(e.getPeople).toBeUndefined();
    expect(next.chronicle.at(-1)).toMatchObject({
      kind: 'trade-departed',
      people: { families: 1, men: 0, women: 1 },
    });
  });

  it('lidé souseda přijdou s návratem: rodina do prázdného domu, dospělý do domu s nejvíc místy', () => {
    const base = withNeighbourPeople(trading(), GIVES);
    base.dwellings.push({
      id: 950,
      type: 'zemnice',
      builtDay: DAY - 100,
      condition: 1,
      position: { x: 60, z: 0, rotation: 0 },
    });
    const s = startExpedition(base, DAY, {
      direction: 'S',
      give: payAll(base),
      get: {},
      getPeople: { families: 1, men: 1, women: 0 },
    });
    expect(s.trade!.expeditions[0]!.getPeople).toEqual({ families: [2], men: 1, women: 0 });
    expect(neighbourStock(s, 'S', DAY).people).toMatchObject({ families: [0], men: 0, women: 1 });
    const before = s.people.length;
    const e = s.trade!.expeditions[0]!;
    e.done = e.cost;
    const events = finishExpeditions(s, DAY + 5);
    expect(s.people.length).toBe(before + 5);
    const newcomers = s.people.filter((p) => p.origin === 'S' && p.id >= 600);
    expect(newcomers).toHaveLength(5);
    const family = newcomers.filter((p) => p.dwellingId === 950);
    expect(family).toHaveLength(4);
    const [husband, wife] = family;
    expect(husband!.sex).toBe('male');
    expect(wife!.spouseId).toBe(husband!.id);
    expect(husband!.spouseId).toBe(wife!.id);
    // rodiče dospělých neznámí, děti mají rodiče z rodiny
    expect(husband!.motherId).toBeUndefined();
    const kids = family.slice(2);
    expect(kids.every((k) => k.motherId === wife!.id && k.fatherId === husband!.id)).toBe(true);
    expect(kids.every((k) => ageYears(k.bornDay, DAY + 5) < 14)).toBe(true);
    // mezi matkou a nejstarším dítětem aspoň 16 let
    for (const k of kids) {
      expect(ageYears(wife!.bornDay, DAY + 5) - ageYears(k.bornDay, DAY + 5)).toBeGreaterThan(16);
    }
    const adult = newcomers.find((p) => p.dwellingId !== 950)!;
    const age = ageYears(adult.bornDay, DAY + 5);
    expect(age).toBeGreaterThanOrEqual(16);
    expect(age).toBeLessThanOrEqual(44);
    expect(adult.spouseId).toBeUndefined();
    expect(events.filter((ev) => ev.kind === 'newcomer')).toEqual([
      {
        day: DAY + 5,
        kind: 'newcomer',
        direction: 'S',
        group: 'family',
        people: 4,
        dwellingId: 950,
      },
      expect.objectContaining({ kind: 'newcomer', direction: 'S', people: 1 }),
    ]);
    expect(events[0]).toMatchObject({
      kind: 'trade-returned',
      people: { families: 1, men: 1, women: 0 },
    });
  });

  it('bez prázdného domu jde rodina do domu s nejvíc místy – a smí pak do nového domu', () => {
    const s = trading();
    const extra = person(520, 30, 'male', { dwellingId: 960 });
    s.dwellings.push({
      id: 960,
      type: 'polozemnice',
      builtDay: DAY - 100,
      condition: 1,
      position: { x: 90, z: 0, rotation: 0 },
    });
    s.people.push(extra);
    // dvorec (zemnice 6) má 4 lidi, dům 960 (polozemnice 8) jednoho – rodina jde do 960, do
    // dvorce rodina nejde, dokud může jinam
    const settlers = availableSettlers(s, DAY);
    const events = settleNewcomers(s, DAY, 'S', { families: [1] }, 'x');
    expect(events).toEqual([
      { day: DAY, kind: 'newcomer', direction: 'S', group: 'family', people: 3, dwellingId: 960 },
    ]);
    expect(availableSettlers(s, DAY)).toBe(settlers);
    // přeplněný dům: rodina jde k plné rodině HOUSE – ženatý muž bez rodičů v domě se smí oddělit
    const crowded = trading();
    const before = availableSettlers(crowded, DAY);
    settleNewcomers(crowded, DAY, 'S', { families: [1] }, 'y');
    const house = crowded.dwellings.find((d) => d.id === HOUSE)!;
    const manor = crowded.dwellings[0]!.id;
    expect(crowded.people.filter((p) => p.dwellingId === manor)).toHaveLength(4);
    const newcomers = crowded.people.filter((p) => p.origin === 'S');
    expect(newcomers.every((p) => p.dwellingId === HOUSE)).toBe(true);
    const families = familiesOf(crowded, house, DAY).map((f) => f.people.map((p) => p.id));
    expect(families).toContainEqual(newcomers.map((p) => p.id));
    // z HOUSE teď můžou odejít dvě rodiny (12 lidí na 8 míst) – o jednu víc lidí k osídlení
    expect(availableSettlers(crowded, DAY)).toBe(before + 1);
  });

  it('v simulaci: lidé přijdou po dnech cesty a výsledek nezávisí na kouscích dopočtu', () => {
    const base = withNeighbourPeople(trading(), GIVES);
    // soused jihu (seed 11) jsou obilnáři, kteří shánějí maso a klády – rodina za maso
    expect(neighbourOf(base.seed, 'S').demands).toContain('meat');
    const s = startExpedition(base, DAY, {
      direction: 'S',
      give: { meat: 359 },
      get: {},
      getPeople: { families: 1, men: 0, women: 0 },
    });
    const whole = advanceVillage(s, DAY + 60, null, LANDSCAPE);
    const arrived = whole.chronicle.filter((ev) => ev.kind === 'newcomer');
    expect(arrived).toHaveLength(1);
    expect(whole.people.filter((p) => p.origin === 'S')).toHaveLength(4);
    let parts = s;
    for (const step of [1, 2, 5, 13, 31, 60]) {
      parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    }
    expect(parts).toEqual(whole);
  });

  it('starší výprava bez lidí se vrátí beze změny', () => {
    const base = trading();
    const s = startExpedition(base, DAY, {
      direction: 'S',
      give: { meat: 1 },
      get: { grain: 1 },
    });
    const e = s.trade!.expeditions[0]!;
    expect(e.givePeople).toBeUndefined();
    expect(e.getPeople).toBeUndefined();
    expect(s.chronicle.at(-1)).not.toHaveProperty('people');
    e.done = e.cost;
    const people = s.people.length;
    const events = finishExpeditions(s, DAY + 9);
    expect(events).toEqual([{ day: DAY + 9, kind: 'trade-returned', direction: 'S', get: e.get }]);
    expect(s.people).toHaveLength(people);
  });
});

describe('muži a ženy zvlášť (Martin 19. 10. 2026)', () => {
  it('zbytek roku uložený s dospělými bez pohlaví se převede podle povahy roku', () => {
    const s = trading();
    const season = tradeSeason(DAY);
    const nature = neighbourPeople(s.seed, 'S', season);
    const n = neighbourOf(s.seed, 'S');
    const legacy = {
      families: [1],
      adults: 2,
      takes: { families: 0, adults: 1 },
    } as unknown as NeighbourPeople;
    s.trade = {
      neighbours: [{ direction: 'S', season, supply: { ...n.supply }, demand: {}, people: legacy }],
      expeditions: [],
      nextId: 1,
    };
    const people = neighbourStock(s, 'S', DAY).people!;
    expect(people.families).toEqual([1]);
    expect(people.men + people.women).toBe(2);
    expect(people.men).toBe(Math.min(nature.men, 2));
    expect(people.takes.men + people.takes.women).toBe(1);
    expect(people.takes.men).toBe(Math.min(nature.takes.men, 1));
    expect('adults' in people).toBe(false);
    // deterministicky – stejný převod pokaždé, nový zbytek roku se nemění
    expect(neighbourStock(s, 'S', DAY).people).toEqual(people);
    const fresh = neighbourPeople(s.seed, 'S', season);
    expect(storedNeighbourPeople(fresh, s.seed, 'S', season)).toBe(fresh);
  });

  it('výprava uložená s dospělými bez pohlaví doběhne – pohlaví se losuje jako dřív', () => {
    const seed = 77;
    // dřívější los: pro každého dospělého pohlaví, věk 16–26 a den narození
    const rnd = createRandom(deriveSeed(seed, 'newcomers:5'));
    const old = [0, 1].map(() => {
      const sex = rnd.next() < 0.5 ? 'male' : 'female';
      const age = 16 + Math.floor(rnd.next() * 11);
      return { sex, age, extra: Math.floor(rnd.next() * 365) };
    });
    const profiles = newcomerProfiles(seed, '5', { families: [], adults: 2 });
    expect(
      profiles.map((p) => [p.members[0]!.sex, p.members[0]!.ageYears, p.members[0]!.extraDays]),
    ).toEqual(old.map((o) => [o.sex, o.age, o.extra]));
    expect(profiles.map((p) => p.group)).toEqual(
      old.map((o) => (o.sex === 'male' ? 'man' : 'woman')),
    );
  });

  it('objednaní muži a ženy přijdou s daným pohlavím; postavy karavany jsou stejní lidé', () => {
    const s = trading();
    const key = '9';
    const coming = { families: [2], men: 1, women: 2 };
    const profiles = newcomerProfiles(s.seed, key, coming);
    expect(profiles.map((p) => p.group)).toEqual(['family', 'man', 'woman', 'woman']);
    const before = s.people.length;
    const events = settleNewcomers(s, DAY, 'S', coming, key);
    const arrived = s.people.slice(before);
    expect(arrived.map((p) => p.sex)).toEqual(profiles.flatMap((p) => p.members.map((m) => m.sex)));
    expect(arrived.map((p) => ageYears(p.bornDay, DAY))).toEqual(
      profiles.flatMap((p) => p.members.map((m) => m.ageYears)),
    );
    expect(events.map((e) => (e.kind === 'newcomer' ? e.group : null))).toEqual([
      'family',
      'man',
      'woman',
      'woman',
    ]);
  });
});
