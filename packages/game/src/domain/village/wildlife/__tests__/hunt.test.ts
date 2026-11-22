import { describe, expect, it } from 'vitest';
import { dogsYear } from '../manor-dogs';
import {
  canSpareBeaters,
  emptyHunt,
  HUNT_DENIED_TEXT,
  huntDenied,
  pickQuarry,
  reserveBeaters,
} from '../hunt';
import { huntPool } from '../hunt-party';
import { lordRides, trainLordDay, updateLordTraining } from '../../people/lord';
import { awayFromWork, isAway, isInjured, laborPerDay } from '../../people/people';
import { villagersToday } from '../../core/morning-water';
import { advanceVillage } from '../../core/simulate';
import { PREDATOR_RISK, WILDLIFE_LAND } from '../../rules/rules-wildlife';
import type { Person, VillageState, WildlifeState } from '../../types';
import { freshWildlife } from '../wildlife';
import { at, horse, horseVillage, LORD_ID, SON_ID, YOUTH_ID } from '../../__tests__/horse-fixtures';

// Lov na tlačítko dvorce (hunting.md – Pravidla 1–3, 11): kalendářní lov rodu a lov navíc jsou
// pryč; lov nejde vyhlásit v hájení (březen–květen – podle dne honců), když lov vsi běží, když
// v lese vsi není velká zvěř a když ves zítra neuvolní 6 mužů z dílu na stavby. Honci chybí
// v práci vsi zítra; zvíře se losuje podle počtů zvěře. Psi dvorce a zranění zůstávají.

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

/**
 * Ves rodu se zvěří dopočítaná do dneška hráče – (měsíc, den) roku 602; dnes mužům na stavby
 * zbylo 20 čd (`commonLaborHistory`), takže honce uvolní.
 */
function villageOn(month: number, day: number): VillageState {
  const s = huntVillage(3, 3);
  s.lastDay = dayOf(month, day);
  s.commonLaborHistory = [20];
  return s;
}

/** Zvěř bez velké zvěře – jednotlivé testy doplní, co potřebují. */
function emptyForest(): WildlifeState {
  const w = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  w.deer = { stags: 0, hinds: 0, calves: 0 };
  w.boar = { adults: 0, piglets: 0 };
  w.wolves = 0;
  w.bear = { present: false, backDay: null };
  return w;
}

describe('kdy jde lov vyhlásit (hunting.md – Pravidla 2, 11)', () => {
  it('hájení březen až květen podle dne honců: 31. 5. s honci 1. 6. lze, 28. 2. s honci 1. 3. ne', () => {
    // `day` = den honců – zítřek dne vyhlášení
    expect(huntDenied(villageOn(4, 15), dayOf(4, 16), false)).toBe('closed-season');
    expect(huntDenied(villageOn(2, 28), dayOf(2, 28) + 1, false)).toBe('closed-season');
    expect(huntDenied(villageOn(5, 30), dayOf(5, 31), false)).toBe('closed-season');
    expect(huntDenied(villageOn(5, 31), dayOf(5, 31) + 1, false)).toBeNull();
    expect(huntDenied(villageOn(2, 27), dayOf(2, 28), false)).toBeNull();
    expect(huntDenied(villageOn(7, 10), dayOf(7, 11), false)).toBeNull();
    expect(HUNT_DENIED_TEXT['closed-season']).toContain('hájení');
  });

  it('pořadí důvodů: hájení → lov běží → není zvěř → honci', () => {
    const april = villageOn(4, 15);
    delete april.wildlife;
    april.commonLaborHistory = [];
    expect(huntDenied(april, dayOf(4, 16), true)).toBe('closed-season');
    const july = villageOn(7, 10);
    delete july.wildlife;
    july.commonLaborHistory = [];
    expect(huntDenied(july, dayOf(7, 11), true)).toBe('already');
    expect(huntDenied(july, dayOf(7, 11), false)).toBe('no-game');
    const busy = villageOn(7, 10);
    busy.commonLaborHistory = [];
    expect(huntDenied(busy, dayOf(7, 11), false)).toBe('no-beaters');
    expect(HUNT_DENIED_TEXT.already).toBe('Lov už běží.');
  });

  it('druh pod 1 kus nemá váhu a mláďata nikdy: 0,9 jelena a kolouši → null a „V lese vsi není zvěř“', () => {
    const s = villageOn(7, 10);
    const w = emptyForest();
    w.deer = { stags: 0.9, hinds: 0, calves: 5 };
    w.boar = { adults: 0.99, piglets: 6 };
    s.wildlife = w;
    expect(pickQuarry(w, s.seed, dayOf(7, 10), 0)).toBeNull();
    expect(huntDenied(s, dayOf(7, 11), false)).toBe('no-game');
    expect(HUNT_DENIED_TEXT['no-game']).toBe('V lese vsi není zvěř.');
  });

  it('honci: dnes mužům na stavby zbylo 11 čd – první lov projde, druhý týž den ne', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    s.commonLaborHistory = [30, 30, 11];
    expect(canSpareBeaters(s, d)).toBe(true);
    expect(huntDenied(s, d + 1, false)).toBeNull();
    reserveBeaters(s, d);
    expect(canSpareBeaters(s, d)).toBe(false);
    expect(huntDenied(s, d + 1, false)).toBe('no-beaters');
    expect(HUNT_DENIED_TEXT['no-beaters']).toContain('6 mužů');
    // bez historie (ves ještě nepracovala) honce neuvolní
    s.commonLaborHistory = [];
    expect(canSpareBeaters(s, d + 1)).toBe(false);
  });

  it('bez meze „jednou za 3 dny“: lov hned další den i druhý týž den (honci se sečtou)', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    reserveBeaters(s, d);
    // týž den druhý lov – honci se sčítají (12 ≤ 20)
    expect(huntDenied(s, d + 1, false)).toBeNull();
    // zítra lov s honci na pozítří – dnešní rezervace (na d + 1) se nepočítá
    expect(canSpareBeaters(s, d + 1)).toBe(true);
    expect(huntDenied(s, d + 2, false)).toBeNull();
  });
});

describe('los zvířete (hunting.md – Pravidla 3; plán 2026-11-22-hunting – Rozhodnutí 4)', () => {
  const w = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  w.bear = { present: true, backDay: null };
  const d = dayOf(7, 10);

  it('stejný seed, den a pořadí vyhlášení → týž druh; další pořadí losuje z jiného proudu', () => {
    for (let n = 0; n < 5; n++) expect(pickQuarry(w, 5, d, n)).toBe(pickQuarry(w, 5, d, n));
    const days = Array.from({ length: 50 }, (_, i) => d + i);
    expect(days.some((day) => pickQuarry(w, 5, day, 0) !== pickQuarry(w, 5, day, 1))).toBe(true);
    // stav zvěře se losem nemění
    const before = JSON.stringify(w);
    pickQuarry(w, 5, d, 0);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('les jen s medvědem → vždy medvěd (bez omezení měsíce)', () => {
    const bear = emptyForest();
    bear.bear = { present: true, backDay: null };
    for (let i = 0; i < 40; i++) expect(pickQuarry(bear, 9, dayOf(1, 5) + 9 * i, i)).toBe('bear');
  });

  it('10 jelenů a 10 laní a nic jiného: jelen zhruba v polovině ze 2 000 losů', () => {
    const deer = emptyForest();
    deer.deer = { stags: 10, hinds: 10, calves: 6 };
    let stags = 0;
    for (let i = 0; i < 2000; i++) {
      const q = pickQuarry(deer, 77, d + (i % 100), Math.floor(i / 100));
      expect(q === 'stag' || q === 'hind').toBe(true);
      if (q === 'stag') stags += 1;
    }
    expect(stags / 2000).toBeGreaterThanOrEqual(0.45);
    expect(stags / 2000).toBeLessThanOrEqual(0.55);
  });

  it('kanec a bachyně – každý polovina dospělých prasat (stav je nerozlišuje), selata nikdy', () => {
    const pigs = emptyForest();
    pigs.boar = { adults: 1, piglets: 30 };
    const drawn = new Set(Array.from({ length: 200 }, (_, i) => pickQuarry(pigs, 3, d + i, 0)));
    expect([...drawn].sort()).toEqual(['boar', 'sow']);
  });
});

describe('útočník lovu platí jen jeden den práce (Martin 22. 11. 2026)', () => {
  it('muž výpravy na lovu (`away.huntId`) pracuje se vsí; jeden den zaplatí jako honec', () => {
    const d = dayOf(7, 10);
    const s = villageOn(7, 10);
    const man = s.people.find((p) => p.id === 20)!;
    man.away = { kind: 'journey', refId: 'j1' };
    expect(laborPerDay(man, d + 1)).toBe(0);
    expect(villagersToday(s, d + 1, new Set()).villagers).not.toContain(man);
    man.away = { kind: 'journey', refId: 'j1', huntId: 1 };
    // pryč je dál (scéna, výprava), jen práce vsi ho počítá jako doma
    expect(isAway(man, d + 1)).toBe(true);
    expect(awayFromWork(man, d + 1)).toBe(false);
    expect(laborPerDay(man, d + 1)).toBe(1);
    expect(villagersToday(s, d + 1, new Set()).villagers).toContain(man);
    // den práce jako honec – k honcům zítřka
    reserveBeaters(s, d);
    reserveBeaters(s, d, 1);
    expect(s.wildlife!.hunt!.beaters).toEqual({ day: d + 1, men: 7 });
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
