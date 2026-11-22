import { describe, expect, it } from 'vitest';
import { dogsYear } from '../manor-dogs';
import { emptyHunt, HUNT_DENIED_TEXT, huntDenied, reserveBeaters } from '../hunt';
import { huntPool } from '../hunt-party';
import { lordRides, trainLordDay, updateLordTraining } from '../../people/lord';
import { isInjured, laborPerDay } from '../../people/people';
import { villagersToday } from '../../core/morning-water';
import { advanceVillage } from '../../core/simulate';
import { PREDATOR_RISK, WILDLIFE_LAND } from '../../rules/rules-wildlife';
import type { Person, VillageState } from '../../types';
import { freshWildlife } from '../wildlife';
import { at, horse, horseVillage, LORD_ID, SON_ID, YOUTH_ID } from '../../__tests__/horse-fixtures';

// Lov na tlačítko dvorce (hunting.md – Pravidla 1, 2, 11): kalendářní lov rodu a lov navíc jsou
// pryč; lov nejde vyhlásit v hájení (březen–květen) a když lov vsi běží, honci chybí v práci vsi
// zítra. Psi dvorce a zranění zůstávají.

const ARMS = { bow: 85, combat: 85, riding: 85 };
const AWAY_ID = 30;
const START_WINTER = at(601, 11, 1);

/** Dvorec (vojvoda, syn 17, chlapec 11) na `horses` vycvičených koních, 85 ve všem, + odešlý syn. */
function huntVillage(horses: number, dogs: number, away = true): VillageState {
  const list = Array.from({ length: horses }, (_, i) => ({
    ...horse(1 + i, 8, 'male', 100),
    riderId: [LORD_ID, SON_ID, YOUTH_ID][i],
  }));
  const s = horseVillage(horses > 0 ? list : null, 2, 4);
  s.lastDay = START_WINTER - 1;
  for (const p of s.people) if (p.sex === 'male') p.arms = { ...ARMS };
  if (away) {
    const son: Person = {
      id: AWAY_ID,
      bornDay: START_WINTER - 20 * 366,
      dwellingId: s.people.find((p) => p.id === 20)!.dwellingId,
      sex: 'male',
      line: true,
      fatherId: LORD_ID,
      arms: { ...ARMS },
    };
    s.people.push(son);
  }
  s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  if (dogs > 0) s.wildlife.dogs = { count: dogs, fed: true };
  s.horsesCaredToday = 1;
  s.horsesFed = true;
  return s;
}

/** Index dne (měsíc, den) roku 602. */
const dayOf = (month: number, day: number): number => at(602, month, day);

/** Ves rodu se zvěří dopočítaná do dneška hráče – (měsíc, den) roku 602. */
function villageOn(month: number, day: number): VillageState {
  const s = huntVillage(3, 3);
  s.lastDay = dayOf(month, day);
  return s;
}

describe('kdy jde lov vyhlásit (hunting.md – Pravidla 2, 11)', () => {
  it('hájení březen až květen, jinak lze; běžící lov vsi nejde vyhlásit znovu', () => {
    expect(huntDenied(villageOn(4, 15), dayOf(4, 15), false)).toBe('closed-season');
    expect(huntDenied(villageOn(3, 1), dayOf(3, 1), false)).toBe('closed-season');
    expect(huntDenied(villageOn(5, 31), dayOf(5, 31), false)).toBe('closed-season');
    expect(huntDenied(villageOn(2, 28), dayOf(2, 28), false)).toBeNull();
    expect(huntDenied(villageOn(7, 10), dayOf(7, 10), true)).toBe('already');
    expect(huntDenied(villageOn(6, 1), dayOf(6, 1), false)).toBeNull();
    expect(huntDenied(villageOn(7, 10), dayOf(7, 10), false)).toBeNull();
    expect(HUNT_DENIED_TEXT['closed-season']).toContain('hájení');
  });

  it('bez meze „jednou za 3 dny“: honci na zítřek lov znovu nezakážou, ani týž den', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    reserveBeaters(s, d);
    expect(huntDenied(s, d, false)).toBeNull();
    expect(huntDenied(s, d + 1, false)).toBeNull();
  });
});

describe('honci na zítřek (hunting.md – Pravidla 2)', () => {
  it('týž den se honci sčítají, jiný den přepíšou', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    reserveBeaters(s, d);
    reserveBeaters(s, d);
    expect(s.wildlife!.hunt!.beaters).toEqual({ day: d + 1, men: 12 });
    reserveBeaters(s, d + 1);
    expect(s.wildlife!.hunt!.beaters).toEqual({ day: d + 2, men: 6 });
  });

  it('ves, která ještě nelovila, dostane prázdný úlovek roku a honce', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    expect(s.wildlife!.hunt).toBeUndefined();
    reserveBeaters(s, d);
    expect(s.wildlife!.hunt).toEqual({ ...emptyHunt(), beaters: { day: d + 1, men: 6 } });
  });
});

describe('kalendářní lov je pryč (hunting.md – Pravidla 1)', () => {
  it('bývalý den lovu (1. 11.): odešlý syn pracuje se vsí, muži dvorce jedou objížďku', () => {
    const s = advanceVillage(huntVillage(3, 3), START_WINTER, null, null);
    const villagers = villagersToday(s, START_WINTER, new Set()).villagers;
    expect(villagers.some((p) => p.id === AWAY_ID)).toBe(true);
    const fresh = huntVillage(3, 3);
    updateLordTraining(fresh, START_WINTER);
    expect(lordRides(fresh, START_WINTER)?.riders.map((r) => r.riderId)).toEqual([
      LORD_ID,
      SON_ID,
      YOUTH_ID,
    ]);
  });

  it('zima v celé simulaci: žádný den lovu ani zápis lovu v kronice, maso jen z vlastních zásob', () => {
    const base = huntVillage(3, 0, true);
    base.lastDay = at(601, 10, 25);
    const s = advanceVillage(base, at(602, 3, 3), null, null);
    expect(s.wildlife?.hunt?.year.days ?? 0).toBe(0);
    expect(s.wildlife?.hunt?.beaters).toBeUndefined();
    expect(s.chronicle.some((e) => e.kind === 'hunt' || e.kind === 'hunt-injury')).toBe(false);
    // psi dvorce zůstávají – smečka se založí hned
    expect(s.wildlife?.dogs?.count ?? 0).toBeGreaterThan(0);
  }, 60_000);
});

describe('zraněný muž (PREDATOR_RISK.injuryDays)', () => {
  it('nepracuje, necvičí a nejezdí – 60 dní', () => {
    const day = START_WINTER + 3;
    const s = huntVillage(3, 3);
    updateLordTraining(s, day);
    const son = s.people.find((p) => p.id === SON_ID)!;
    son.injuredUntilDay = day + 1 + PREDATOR_RISK.injuryDays;
    expect(isInjured(son, day)).toBe(true);
    expect(laborPerDay(son, day)).toBe(0);
    expect(laborPerDay(son, day + PREDATOR_RISK.injuryDays)).toBe(0);
    expect(laborPerDay(son, day + PREDATOR_RISK.injuryDays + 1)).toBe(1);
    expect(isInjured(son, day + PREDATOR_RISK.injuryDays + 1)).toBe(false);
    // psi dvorce ho nepočítají
    const family = {
      trainees: s.people.filter((p) => p.sex === 'male' && p.dwellingId === s.manorId),
    };
    expect(huntPool(s, day, family).manor.map((p) => p.id)).toEqual([LORD_ID]);
    // necvičí ani nezapomíná
    const arms = JSON.stringify(son.arms);
    trainLordDay(s, day);
    expect(JSON.stringify(son.arms)).toBe(arms);
    // nejezdí na objížďku
    expect(lordRides(s, day)?.riders.map((r) => r.riderId)).not.toContain(SON_ID);
  });
});

describe('psi hned (recenze W4)', () => {
  it('existující dvorec bez smečky ji založí hned, ne až 1. 5.; podruhé nic nemění', () => {
    const s = huntVillage(3, 0);
    expect(s.wildlife!.dogs).toBeUndefined();
    dogsYear(s, START_WINTER);
    expect(s.wildlife!.dogs).toEqual({ count: 4 });
    const before = JSON.stringify(s.wildlife);
    dogsYear(s, START_WINTER + 1);
    expect(JSON.stringify(s.wildlife)).toBe(before);
  });

  it('dvorec bez lovců psy nezaloží', () => {
    const s = huntVillage(0, 0, false);
    s.people = s.people.filter((p) => p.sex !== 'male');
    dogsYear(s, START_WINTER);
    expect(s.wildlife!.dogs).toBeUndefined();
  });
});
