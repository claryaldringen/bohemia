import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { createRandom, deriveSeed } from '../../../landscape/random';
import { MERCHANTS } from '../../rules';
import type { MerchantStop } from '../../types';
import { merchantVisits, nextMerchantVisit, type MerchantVisit } from '../merchant-plan';

// Plán cizích kupců (markets.md – Rozhodnutí plánu 4, bod 5): příjezdy na zastávky vsi jsou čistá
// funkce seedu spojení stezky a roku – průjezd, jeho začátek a směr losuje `pass:<rok>:<průjezd>`.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 3, length: 21 };
/** Konec nejdelší cesty – průjezd z konce roku sem dojede i po Novém roce. */
const FAR: MerchantStop = { key: '0,0,N', seed: 11, index: 38, length: 39 };
/** Poslední průjezd světa (1499:3) sem dojede až po konci světa (den 365 254). */
const LATE: MerchantStop = { ...FAR, seed: 52 };
/** Poslední průjezd světa sem dojede poslední den světa (365 249). */
const LAST: MerchantStop = { ...FAR, seed: 22 };

const LAST_DAY = TOTAL_GAME_DAYS - 1;

function newYear(year: number): number {
  return dayIndexOf({ year, month: 1, day: 1 });
}

/** Jednodenní dotazy na dny `from` … `to` za sebou. */
function dayByDay(stops: readonly MerchantStop[], from: number, to: number): MerchantVisit[] {
  const visits: MerchantVisit[] = [];
  for (let day = from; day <= to; day++) visits.push(...merchantVisits(stops, day, day));
  return visits;
}

/** Otisk FNV-1a 32 bitů z JSON – pozná i nejmenší změnu plánu. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

describe('průjezdy spojení (merchantVisits)', () => {
  it('čtyři průjezdy po 91 dnech se vejdou do roku a jejich okna se nekryjí', () => {
    expect(MERCHANTS.passesPerYear).toBe(4);
    expect(MERCHANTS.passesPerYear * MERCHANTS.passSpacingDays).toBe(364);
    expect(MERCHANTS.passWindowDays).toBeLessThanOrEqual(MERCHANTS.passSpacingDays);
  });

  it.each([510, 511, 512])('rok %i: právě čtyři příjezdy, každý ve svém okně', (year) => {
    const visits = merchantVisits([STOP], newYear(year), newYear(year + 1) - 1);
    expect(visits.map((visit) => visit.key)).toEqual(
      [0, 1, 2, 3].map((pass) => `merchants:0,0,E:${year}:${pass}`),
    );
    // políčko 3 z 21: 3 dny tam, 17 zpátky
    visits.forEach(({ day }, pass) => {
      expect(day).toBeGreaterThanOrEqual(newYear(year) + pass * 91 + 3);
      expect(day).toBeLessThanOrEqual(newYear(year) + pass * 91 + 59 + 17);
    });
  });

  it('skutečné dny roku 510', () => {
    expect(merchantVisits([STOP], newYear(510), newYear(511) - 1)).toEqual([
      { key: 'merchants:0,0,E:510:0', day: 3714 },
      { key: 'merchants:0,0,E:510:1', day: 3771 },
      { key: 'merchants:0,0,E:510:2', day: 3858 },
      { key: 'merchants:0,0,E:510:3', day: 3994 },
    ]);
  });

  it('den = začátek průjezdu + políčka cesty – tam, nebo zpátky podle druhého čísla', () => {
    const directions = { there: 0, back: 0 };
    for (let year = 520; year < 530; year++) {
      const visits = merchantVisits([STOP], newYear(year), newYear(year + 1) - 1);
      visits.forEach(({ day }, pass) => {
        const random = createRandom(deriveSeed(7, `pass:${year}:${pass}`));
        const start = newYear(year) + pass * 91 + Math.floor(random.next() * 60);
        const back = random.next() < 0.5;
        directions[back ? 'back' : 'there']++;
        expect(day).toBe(start + (back ? 21 - 1 - 3 : 3));
      });
    }
    expect(directions.there).toBeGreaterThan(0);
    expect(directions.back).toBeGreaterThan(0);
  });

  it('po kouscích totéž jako vcelku', () => {
    const stops = [STOP, FAR];
    const from = newYear(540);
    const to = newYear(546) - 1;
    const whole = merchantVisits(stops, from, to);
    const random = createRandom(4);
    for (let i = 0; i < 3; i++) {
      const split = from + Math.floor(random.next() * (to - from));
      expect([
        ...merchantVisits(stops, from, split),
        ...merchantVisits(stops, split + 1, to),
      ]).toEqual(whole);
    }
    expect(dayByDay(stops, from, to)).toEqual(whole);
  });

  it('opakované volání dá totéž, jiný seed zastávky jiné dny', () => {
    const days = (stop: MerchantStop): number[] =>
      merchantVisits([stop], newYear(510), newYear(513) - 1).map((visit) => visit.day);
    expect(days(STOP)).toEqual(days(STOP));
    expect(days({ ...STOP, seed: 8 })).not.toEqual(days(STOP));
  });

  it('průjezd z konce roku dojede i po Novém roce – najde ho i dotaz na jediný den', () => {
    expect(dateOfDayIndex(15711)).toMatchObject({ year: 543, month: 1, day: 6 });
    const visit = { key: 'merchants:0,0,N:542:3', day: 15711 };
    expect(merchantVisits([FAR], 15711, 15711)).toEqual([visit]);
    expect(nextMerchantVisit([FAR], newYear(543))).toEqual(visit);
  });

  it('křižovatka: příjezdy všech zastávek podle dne, pak podle klíče', () => {
    const from = newYear(510);
    const to = newYear(515) - 1;
    const visits = merchantVisits([STOP, FAR], from, to);
    expect(visits).toHaveLength(2 * 5 * MERCHANTS.passesPerYear);
    expect(visits).toEqual(
      [...merchantVisits([STOP], from, to), ...merchantVisits([FAR], from, to)].sort(
        (a, b) => a.day - b.day || (a.key < b.key ? -1 : 1),
      ),
    );
    expect(merchantVisits([FAR, STOP], from, to)).toEqual(visits);
    // dvě zastávky týž den – rozhodne klíč
    const twins = [STOP, { ...STOP, key: '-1,0,E' }];
    expect(merchantVisits(twins, newYear(510), 3771)).toEqual([
      { key: 'merchants:-1,0,E:510:0', day: 3714 },
      { key: 'merchants:0,0,E:510:0', day: 3714 },
      { key: 'merchants:-1,0,E:510:1', day: 3771 },
      { key: 'merchants:0,0,E:510:1', day: 3771 },
    ]);
  });

  it('bez zastávek a v prázdném rozsahu nikdo nepřijede', () => {
    expect(merchantVisits([], 0, LAST_DAY)).toEqual([]);
    expect(merchantVisits([STOP], 3714, 3713)).toEqual([]);
    expect(merchantVisits([STOP], -400, -1)).toEqual([]);
  });

  it('začátek světa: dny 0–40 a rok před ním (499) nevadí', () => {
    for (const stops of [[STOP], [FAR], [STOP, FAR]]) {
      const whole = merchantVisits(stops, 0, 40);
      expect(whole.every(({ day }) => day >= 0 && day <= 40)).toBe(true);
      expect(dayByDay(stops, 0, 40)).toEqual(whole);
      expect(merchantVisits(stops, -400, 40)).toEqual(whole);
    }
    expect(merchantVisits([STOP, FAR], 0, 40)).toEqual([
      { key: 'merchants:0,0,N:500:0', day: 11 },
      { key: 'merchants:0,0,E:500:0', day: 15 },
    ]);
  });

  it('konec světa: posledních 100 dní a rok po něm (1500) nevadí', () => {
    const from = LAST_DAY - 99;
    for (const stops of [[STOP], [FAR], [LATE], [LAST], [STOP, LATE, LAST]]) {
      const whole = merchantVisits(stops, from, LAST_DAY);
      expect(whole.every(({ day }) => day >= from && day <= LAST_DAY)).toBe(true);
      expect(dayByDay(stops, from, LAST_DAY)).toEqual(whole);
      expect(merchantVisits(stops, from, LAST_DAY + 400)).toEqual(whole);
    }
    // poslední průjezd světa: po konci světa nikdo nepřijede, poslední den ano
    expect(merchantVisits([LATE], from, LAST_DAY)).toEqual([]);
    expect(merchantVisits([LAST], from, LAST_DAY)).toEqual([
      { key: 'merchants:0,0,N:1499:3', day: LAST_DAY },
    ]);
    expect(merchantVisits([STOP], LAST_DAY + 1, LAST_DAY + 400)).toEqual([]);
  });

  it('zlatý otisk plánu let 510–512', () => {
    // po ostrém spuštění se plán nemění (markets.md – Rozhodnutí plánu 4, bod 5)
    expect(fingerprint(merchantVisits([STOP], newYear(510), newYear(513) - 1))).toBe(
      '517:6909a367',
    );
  });
});

describe('nejbližší příjezd (nextMerchantVisit)', () => {
  it('nejmenší den ≥ zadaný – každý den dvou let', () => {
    const stops = [STOP, FAR];
    const all = merchantVisits(stops, newYear(510), newYear(515) - 1);
    for (let day = newYear(510); day < newYear(512); day++) {
      expect(nextMerchantVisit(stops, day)).toEqual(all.find((visit) => visit.day >= day));
    }
  });

  it('v den příjezdu týž den, den po něm až další průjezd', () => {
    expect(nextMerchantVisit([STOP], 3714)).toEqual({ key: 'merchants:0,0,E:510:0', day: 3714 });
    expect(nextMerchantVisit([STOP], 3715)).toEqual({ key: 'merchants:0,0,E:510:1', day: 3771 });
  });

  it('bez zastávek a za koncem světa null', () => {
    expect(nextMerchantVisit([], newYear(510))).toBeNull();
    expect(nextMerchantVisit([STOP], TOTAL_GAME_DAYS)).toBeNull();
    expect(nextMerchantVisit([STOP], TOTAL_GAME_DAYS + 5000)).toBeNull();
  });

  it('poslední dny světa: tentýž den, nebo null', () => {
    expect(nextMerchantVisit([LAST], LAST_DAY)).toEqual({
      key: 'merchants:0,0,N:1499:3',
      day: LAST_DAY,
    });
    expect(nextMerchantVisit([STOP], LAST_DAY)).toBeNull();
    // poslední průjezd, který ve světě ještě přijede, je 1499:2 (den 365 102)
    expect(nextMerchantVisit([LATE], 365102)).toEqual({
      key: 'merchants:0,0,N:1499:2',
      day: 365102,
    });
    expect(nextMerchantVisit([LATE], 365103)).toBeNull();
  });

  it('před začátkem světa první příjezd světa', () => {
    expect(nextMerchantVisit([FAR], -1000)).toEqual({ key: 'merchants:0,0,N:500:0', day: 11 });
  });
});
