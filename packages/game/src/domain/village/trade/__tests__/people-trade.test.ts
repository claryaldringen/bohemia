import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { availableSettlers, familiesOf } from '../../people/households';
import { createRandom, deriveSeed } from '../../../landscape/random';
import { emigrantGroups, newcomerProfiles, settleNewcomers } from '../people-trade';
import { ageYears } from '../../people/people';
import { advanceVillage } from '../../core/simulate';
import { finishExpeditions } from '../trade';
import { finishTrail, startTrail } from '../trail';
import type { Person, Sex, TradeExpedition, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Lidé, které ves dá, a lidé z výpravy na cestě (trade.md – Výměna lidí; Martin 19. 10. 2026):
// koho ves smí dát (zásilky vazalů); výprava k dřívějšímu sousedovi na cestě přivede rodiny
// a svobodné muže a ženy (markets.md – Pravidla 10).

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

/** Výprava k dřívějšímu sousedovi na jihu na cestě (markets.md – Pravidla 10). Nová ves. */
function onTheWay(s: VillageState, fields: Partial<TradeExpedition>): VillageState {
  const next = structuredClone(s);
  next.trade = {
    expeditions: [
      {
        id: 1,
        direction: 'S',
        trailId: next.trails![0]!.id,
        startedDay: DAY,
        give: {},
        get: {},
        porters: 1,
        days: 4,
        cost: 4,
        done: 0,
        ...fields,
      },
    ],
    nextId: 2,
  };
  return next;
}

describe('koho ves dá', () => {
  it('rodinu mladšího ženatého syna – dědic a rodiče zůstávají, dvorec ne', () => {
    const s = trading();
    const { families, men, women } = emigrantGroups(s, DAY, { families: 2, men: 0, women: 0 });
    // jediná rodina, která se smí oddělit; dvorec (zakladatelé) nedá nikoho
    expect(families.map((f) => f.people.map((p) => p.id))).toEqual([[504, 505, 506]]);
    expect(men).toEqual([]);
    expect(women).toEqual([]);
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

describe('lidé z výpravy na cestě (markets.md – Pravidla 10)', () => {
  it('lidé přijdou s návratem: rodina do prázdného domu, dospělý do domu s nejvíc místy', () => {
    const base = trading();
    base.dwellings.push({
      id: 950,
      type: 'zemnice',
      builtDay: DAY - 100,
      condition: 1,
      position: { x: 60, z: 0, rotation: 0 },
    });
    const s = onTheWay(base, { getPeople: { families: [2], men: 1, women: 0 } });
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
    const s = onTheWay(trading(), {
      give: { meat: 359 },
      getPeople: { families: [2], men: 0, women: 0 },
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
    const s = onTheWay(trading(), { give: { meat: 1 }, get: { grain: 1 } });
    const e = s.trade!.expeditions[0]!;
    e.done = e.cost;
    const people = s.people.length;
    const events = finishExpeditions(s, DAY + 9);
    expect(events).toEqual([{ day: DAY + 9, kind: 'trade-returned', direction: 'S', get: e.get }]);
    expect(s.people).toHaveLength(people);
  });
});

describe('muži a ženy zvlášť (Martin 19. 10. 2026)', () => {
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
