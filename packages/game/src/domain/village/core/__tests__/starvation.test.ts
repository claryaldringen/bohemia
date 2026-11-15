import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundCemetery, foundField, foundOrchard, startNewDwelling } from '../actions';
import { isGameOver, isVillageExtinct, villageLifespan } from '../extinction';
import { daysUntilHarvest } from '../food';
import { foodNeedPerDay } from '../../people/people';
import { LUCKY_STARVATION_CAP } from '../../people/population';
import { LUCKY_YEARS, STARVATION } from '../../rules';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import { withoutSmallGame } from '../../__tests__/village-fixtures';
import type { ChronicleEvent, Person, VillageState } from '../../types';

// Hlad a vymření (population.md): nahromaděný hlad, úmrtí hladem, vymřelá ves a konec hry.

const YEAR = 365.25;
const START = dayIndexOf({ year: 700, month: 9, day: 1 });
/** Věky smíšené vsi – děti, dospělí i starší. */
const MIXED_AGES = [3, 8, 12, 18, 25, 30, 35, 40, 50, 60] as const;

/**
 * Ves bez polí s `count` lidmi (věky po řadě z `ages`, šest na zemnici) dopočítaná do dne před
 * START; hájení skončilo dávno, pokud `foundedDay` neurčí jinak. Zásoby 0.
 */
function village(
  seed: number,
  count: number,
  ages: readonly number[] = MIXED_AGES,
  foundedDay = START - 100 * 366,
): VillageState {
  const people: Person[] = Array.from({ length: count }, (_, i) => ({
    id: 10 + i,
    bornDay: START - Math.ceil((ages[i % ages.length]! + 0.5) * YEAR),
    dwellingId: 1 + Math.floor(i / 6),
  }));
  return withoutSmallGame({
    seed,
    foundedDay,
    lastDay: START - 1,
    nextId: 10_000,
    people,
    dwellings: Array.from({ length: Math.ceil(count / 6) }, (_, i) => ({
      id: 1 + i,
      type: 'zemnice' as const,
      builtDay: START - 100,
      condition: 1,
      position: { x: i * 10, z: 0, rotation: 0 },
    })),
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    // bez stád – žádné mléko ani maso (jídlo jen ze zásob obilí, vajec a medu z klátů u obydlí –
    // hides-honey.md; od 1. 9. do konce září jich deset zemnic dá ≈ 12 kg)
    livestock: {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    },
  });
}

type Death = Extract<ChronicleEvent, { kind: 'death' }>;
const deaths = (s: VillageState): Death[] =>
  s.chronicle.filter((e): e is Death => e.kind === 'death');
const needPerDay = (s: VillageState, day: number): number =>
  s.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
const daysFromStart = (day: number): number => day - START + 1;

describe('hladovění – bez jídla', () => {
  it('ze sytosti vymřou do 60 dní všichni, děti a starší do 45 (50 vsí po 30 lidech)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = advanceVillage(village(seed, 30), START + 59, null);
      expect(s.people).toEqual([]);
      expect(s.extinctDay).toBeDefined();
      for (const d of deaths(s)) {
        if (d.group !== 'adult') expect(daysFromStart(d.day)).toBeLessThanOrEqual(45);
        // hladem nikdo nezemře, dokud hlad nepřekročí práh
        if (d.cause === 'hunger') {
          expect(daysFromStart(d.day)).toBeGreaterThan(STARVATION.threshold.child);
        }
      }
    }
  });

  it('dospělí umírají hladem až po prahu 20 dní a většina žije ještě po měsíci', () => {
    let aliveAfterMonth = 0;
    let total = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const start = village(seed, 30, [20, 25, 30, 35, 40]);
      const s = advanceVillage(start, START + 29, null);
      for (const d of deaths(s)) {
        if (d.cause === 'hunger') expect(daysFromStart(d.day)).toBeGreaterThan(20);
      }
      aliveAfterMonth += s.people.length;
      total += start.people.length;
    }
    expect(aliveAfterMonth / total).toBeGreaterThan(0.6);
  });

  it('v hájení nikdo nezemře hladem – hlad zůstane den pod prahem dospělých', () => {
    const founded = START - 5 * 366; // pátý rok vsi
    const s = advanceVillage(village(3, 30, MIXED_AGES, founded), START + 199, null);
    const died = deaths(s);
    expect(died.filter((d) => d.group !== 'child')).toEqual([]);
    expect(died.filter((d) => d.cause === 'hunger')).toEqual([]);
    expect(s.extinctDay).toBeUndefined();
    expect(s.starvationDays).toBe(LUCKY_STARVATION_CAP);
  });

  it('po konci hájení umírají hlady postupně, ne všichni druhý den (30 vsí)', () => {
    // hájení skončí 50 dní po začátku hladu – hlad je do té doby na stropu 19
    const luckEnds = START + 50;
    const founded = luckEnds - Math.ceil(LUCKY_YEARS * YEAR);
    for (let seed = 1; seed <= 30; seed++) {
      const start = village(seed, 30, MIXED_AGES, founded);
      const atEnd = advanceVillage(start, luckEnds - 1, null);
      expect(atEnd.starvationDays).toBe(LUCKY_STARVATION_CAP);
      expect(deaths(atEnd).filter((d) => d.cause === 'hunger')).toEqual([]);
      // první den po hájení: hlad 20 – dospělým ještě nic nehrozí
      const first = advanceVillage(atEnd, luckEnds, null);
      expect(deaths(first).some((d) => d.cause === 'hunger' && d.group === 'adult')).toBe(false);
      // první týden: hlad 20–26, dospělí sotva nad prahem – většina žije
      const week = advanceVillage(first, luckEnds + 6, null);
      expect(week.people.length).toBeGreaterThan(atEnd.people.length * 0.7);
      // hlad dojde k jisté smrti dospělých (60) za 41 dní – pak ves vymře
      const end = advanceVillage(week, luckEnds + 41, null);
      expect(end.extinctDay).toBeDefined();
    }
  });
});

describe('hladovění – poloviční příděl', () => {
  /**
   * Ves 60 lidí s polovičními zásobami do sklizně, dopočítaná do 1. 1. (za čtyři měsíce) a do
   * 1. 3. (za půl roku).
   */
  const halfRation = (
    seed: number,
  ): { start: VillageState; january: VillageState; end: VillageState } => {
    const start = village(seed, 60);
    // zásoby na polovinu potřeby do sklizně (ztráta při skladování ≈ 5 % do sklizně navíc)
    start.storesKg = 0.5 * needPerDay(start, START) * daysUntilHarvest(START) * 1.06;
    const january = advanceVillage(start, dayIndexOf({ year: 701, month: 1, day: 1 }), null);
    const end = advanceVillage(january, dayIndexOf({ year: 701, month: 3, day: 1 }), null);
    return { start, january, end };
  };

  it('ves se zmenší, až jsou zbylí sytí, a přežije (20 vsí)', () => {
    let recovered = 0;
    let lateHunger = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { start, january, end } = halfRation(seed);
      const share = end.people.length / start.people.length;
      expect(share).toBeGreaterThan(0.25);
      expect(share).toBeLessThan(0.75);
      expect(end.extinctDay).toBeUndefined();
      // smrt zvedla příděl zbylým k 90 % – hlad se zotavuje (od 90 % energie o den denně)
      expect(summarizeVillage(january, january.lastDay).diet.energy).toBeGreaterThan(0.85);
      if (january.starvationDays === 0) recovered++;
      // příděl kolísá kolem 90 % – hlad může zůstat kousek nad prahem dětí, riziko je zanedbatelné
      expect(end.starvationDays).toBeLessThan(STARVATION.threshold.child + 3);
      lateHunger += deaths(end).filter(
        (d) => d.cause === 'hunger' && d.day > january.lastDay,
      ).length;
    }
    // Vymírání skončí, až příděl zbylých dosáhne ≈ 90 %. Výhled zná ztráty skladováním do žní
    // (fields.md – Přídělový systém; Martin 15. 11. 2026), takže příděl pak neklesá a hlad z vymírání se zotaví.
    // Dřív příděl klesal rychlostí ztrát (≈ 0,0026 za 10 dní) a ves těsně nad hranou pod ni
    // spadla – meze byly 14. 11. 2026 dočasně nejvýš 2 z 20 vsí a 3 pozdní úmrtí hladem.
    expect(recovered).toBeGreaterThanOrEqual(15);
    expect(lateHunger).toBeLessThanOrEqual(2);
  }, 120_000);

  it('ves se zmenšuje postupně – úmrtí hladem začnou až po týdnech a trvají týdny', () => {
    const { end } = halfRation(1);
    const hunger = deaths(end).filter((d) => d.cause === 'hunger');
    const first = Math.min(...hunger.map((d) => daysFromStart(d.day)));
    const last = Math.max(...hunger.map((d) => daysFromStart(d.day)));
    // při polovičním přídělu hlad přibývá o 0,44 denně – práh dětí 12 dní je za 27 dní
    expect(first).toBeGreaterThan(27);
    expect(last - first).toBeGreaterThan(21);
  });
});

describe('hladovění – zotavení a dopočet', () => {
  it('po návratu jídla hlad ubývá o den denně až k nule', () => {
    const start = village(4, 12);
    const hungry = advanceVillage(start, START + 9, null);
    // vejce slepic u obydlí dají trošku energie (diet.md) – hlad přibývá skoro o den denně
    expect(hungry.starvationDays).toBeCloseTo(10, 0);
    hungry.storesKg = 10_000;
    const fed = advanceVillage(hungry, START + 13, null);
    expect(fed.starvationDays).toBeCloseTo(6, 0);
    expect(advanceVillage(fed, START + 30, null).starvationDays).toBe(0);
  });

  it('ves uložená před hladověním (bez starvationDays a extinctDay) se dopočítá', () => {
    const old = village(5, 12);
    old.storesKg = 50_000;
    const json = JSON.parse(JSON.stringify(old)) as VillageState;
    expect('starvationDays' in json).toBe(false);
    const s = advanceVillage(json, START + 30, null);
    expect(s.starvationDays).toBe(0);
    expect(s.extinctDay).toBeUndefined();
  });

  it('po kouscích s JSON mezi nimi dá stejný stav i s hladem a vymřením', () => {
    const start = village(6, 18);
    // příděl ≈ 0,05 do sklizně – ves vymře
    start.storesKg = 0.1 * needPerDay(start, START) * 200;
    const end = START + 500;
    const whole = advanceVillage(start, end, null);
    expect(whole.extinctDay).toBeDefined();
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(start);
    const steps = [1, 9, 3, 30, 2, 17, 100];
    for (let i = 0; chunked.lastDay < end; i++) {
      const to = Math.min(end, chunked.lastDay + steps[i % steps.length]!);
      chunked = viaJson(advanceVillage(chunked, to, null));
    }
    expect(chunked).toEqual(whole);
  });
});

describe('vymření vsi', () => {
  const extinct = (): VillageState => advanceVillage(village(7, 12), START + 59, null);

  it('poslední úmrtí ves vymře – den vymření a událost v kronice', () => {
    const s = extinct();
    expect(s.people).toEqual([]);
    expect(isVillageExtinct(s)).toBe(true);
    const last = s.chronicle.at(-1);
    expect(last).toEqual({ day: s.extinctDay, kind: 'village-extinct' });
    expect(s.chronicle.filter((e) => e.kind === 'village-extinct')).toHaveLength(1);
    expect(deaths(s).at(-1)?.day).toBe(s.extinctDay);
  });

  it('vymřelá ves stojí – dopočet posune jen poslední den', () => {
    const s = extinct();
    const later = advanceVillage(s, s.lastDay + 3000, null);
    expect(later.lastDay).toBe(s.lastDay + 3000);
    expect({ ...later, lastDay: s.lastDay }).toEqual(s);
  });

  it('ves bez lidí uložená před vymíráním vymře hned další den', () => {
    const empty = { ...village(8, 6), people: [], storesKg: 1000 };
    const s = advanceVillage(empty, START + 10, null);
    expect(s.extinctDay).toBe(START);
    expect(s.storesKg).toBe(advanceVillage(empty, START, null).storesKg);
  });

  it('do vymřelé vsi nejde stavět', () => {
    const s = extinct();
    const day = s.lastDay;
    const position = { x: 50, z: 50, rotation: 0 };
    const part = {
      areaM2: 1000,
      distanceM: 50,
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    };
    expect(() => startNewDwelling(s, day, 'zemnice', position, 0)).toThrow(/vymřela/);
    expect(() => foundField(s, day, { parts: [part] })).toThrow(/vymřela/);
    expect(() =>
      foundCemetery(s, day, {
        squares: [{ cell: { x: 1, y: 1 }, x: 0, z: 0, waterDistanceM: 200, obstacleCost: 0 }],
        squareSizeM: 15,
      }),
    ).toThrow(/vymřela/);
    expect(() =>
      foundOrchard(s, day, {
        squares: [{ cell: { x: 1, y: 1 }, areaM2: 225, distanceM: 50, obstacleCost: 0 }],
      }),
    ).toThrow(/vymřela/);
  });

  it('souhrn ukáže den vymření a hladovění', () => {
    const s = extinct();
    expect(summarizeVillage(s, s.lastDay)).toMatchObject({
      extinctDay: s.extinctDay,
      starving: false,
      people: { children: 0, adults: 0, elders: 0 },
    });
    const starving = advanceVillage(village(9, 12), START + 15, null);
    const summary = summarizeVillage(starving, starving.lastDay);
    expect(summary).toMatchObject({ extinctDay: null, starving: true });
    // vejce slepic u obydlí dají trošku energie (diet.md)
    expect(summary.starvationDays).toBeCloseTo(16, 0);
  });
});

describe('konec hry', () => {
  const alive = { extinctDay: undefined };
  const dead = { extinctDay: 1234 };

  it('končí, když hráč má vsi a žádná nežije', () => {
    expect(isGameOver([dead])).toBe(true);
    expect(isGameOver([dead, dead])).toBe(true);
    expect(isGameOver([dead, alive])).toBe(false);
    expect(isGameOver([alive])).toBe(false);
  });

  it('bez vsí hra nekončí – hráč zakládá', () => {
    expect(isGameOver([])).toBe(false);
  });

  it('délka života vymřelé vsi v herních letech', () => {
    const founded = dayIndexOf({ year: 512, month: 3, day: 15 });
    const extinctDay = dayIndexOf({ year: 587, month: 1, day: 2 });
    expect(villageLifespan({ foundedDay: founded, extinctDay })).toEqual({
      foundedYear: 512,
      extinctYear: 587,
      years: 74,
    });
    expect(villageLifespan({ foundedDay: founded })).toBeNull();
  });
});
