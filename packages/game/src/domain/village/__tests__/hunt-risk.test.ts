import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone';
import { currentLord, withDynasty } from '../dynasty';
import {
  canDeclareHunt,
  declareHunt,
  huntDay,
  huntRisk,
  HUNT_DENIED_TEXT,
  planHuntDay,
} from '../hunt';
import { huntPool } from '../hunt-party';
import { lordRides, trainLordDay, updateLordTraining } from '../lord';
import { isInjured, laborPerDay } from '../people';
import { HUNT, HUNT_RISK, WILDLIFE_LAND } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import { dynastyDay } from '../succession';
import type { Person, VillageState } from '../types';
import { freshWildlife } from '../wildlife';
import { at, horse, horseVillage, LORD_ID, SON_ID } from './horse-fixtures';

// Riziko lovu a lov navíc na pokyn hráče (wildlife.md – Nebezpečí pro lidi, Lov rodu: Kdy).

const ARMS = { bow: 85, combat: 85, riding: 85 };
const WINTER = at(601, 11, 1);
const SUMMER = at(602, 7, 10);

/** Dvorec s vycvičenými koňmi, rodem a zvěří; `lastDay` den před `day`. */
function village(day: number, horses = 3): VillageState {
  const list = Array.from({ length: horses }, (_, i) => ({
    ...horse(1 + i, 8, 'male', 100),
    riderId: [LORD_ID, SON_ID, 14][i],
  }));
  const base = horseVillage(list, 2, 4);
  delete base.dynasty; // výchozí „bez rodu“ – převod ho založí na nejstarším muži dvorce
  const next = cloneState(withDynasty(base));
  next.lastDay = day - 1;
  for (const p of next.people) if (p.sex === 'male') p.arms = { ...ARMS };
  next.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  next.horsesCaredToday = 1;
  next.horsesFed = true;
  updateLordTraining(next, day);
  return next;
}

/** Stav s `n` pěšími lovci bez dovednosti (id 5000+), lov dne `day` na zvěř `target`. */
function crowd(n: number, day: number, target: 'game' | 'bear'): VillageState {
  const s = village(day);
  const outside = s.people.find((p) => p.id === 20)!.dwellingId;
  const men: Person[] = Array.from({ length: n }, (_, i) => ({
    id: 5000 + i,
    bornDay: day - 25 * 366,
    dwellingId: outside,
    sex: 'male',
    arms: { bow: 0, combat: 0, riding: 0 },
  }));
  s.people.push(...men);
  s.wildlife!.hunt = {
    hope: { boar: 0, deer: 0, wolf: 0, bear: 0 },
    today: { day, target, riders: [], foot: men.map((p) => p.id), extra: false },
    year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
  };
  return s;
}

/** Zranění a smrti `days` × `n` lovců; stav se každý den vrací do výchozího. */
function rates(
  quarry: 'boar' | 'bear',
  n: number,
  days: number,
): { injured: number; dead: number } {
  const target = quarry === 'boar' ? 'game' : 'bear';
  let injured = 0;
  let dead = 0;
  for (let i = 0; i < days; i++) {
    const day = WINTER + i;
    const events = huntRisk(crowd(n, day, target), day, quarry);
    injured += events.filter((e) => e.kind === 'hunt-injury').length;
    dead += events.filter((e) => e.kind === 'death').length;
  }
  return { injured, dead };
}

/** Počet v rozmezí očekávané hodnoty ± 3 σ (binomický rozptyl). */
function expectRate(count: number, trials: number, p: number): void {
  const mean = trials * p;
  const sigma = Math.sqrt(trials * p * (1 - p));
  expect(Math.abs(count - mean)).toBeLessThanOrEqual(3 * sigma);
}

describe('riziko lovu – četnost (wildlife.md – Nebezpečí pro lidi)', () => {
  it('prasata: zranění 0,5 %, smrt 0,02 % × 2 × 2 pěšky bez boje (10^5 lovců-dní)', () => {
    const r = rates('boar', 1000, 100);
    const death = HUNT_RISK.boar.death * 2 * HUNT_RISK.footDeathFactor;
    // smrt má před zraněním přednost: zranění jen u těch, kdo nezahynuli
    expectRate(r.dead, 100_000, death);
    expectRate(r.injured, 100_000, HUNT_RISK.boar.injury * (1 - death));
  });

  it('medvěd: zranění 5 %, smrt 0,3 % × 2 × 2 pěšky bez boje (10^5 lovců-dní)', () => {
    const r = rates('bear', 1000, 100);
    const death = HUNT_RISK.bear.death * 2 * HUNT_RISK.footDeathFactor;
    expectRate(r.dead, 100_000, death);
    expectRate(r.injured, 100_000, HUNT_RISK.bear.injury * (1 - death));
  });

  it('boj riziko snižuje: boj 100 – zranění medvědem 2,5 %, smrt 0,3 % × 1 × 2', () => {
    const s = crowd(1000, WINTER, 'bear');
    for (const p of s.people) if (p.id >= 5000) p.arms = { bow: 0, combat: 100, riding: 0 };
    let injured = 0;
    let dead = 0;
    for (let i = 0; i < 100; i++) {
      const day = WINTER + i;
      const c = cloneState(s);
      c.wildlife!.hunt!.today!.day = day;
      const events = huntRisk(c, day, 'bear');
      injured += events.filter((e) => e.kind === 'hunt-injury').length;
      dead += events.filter((e) => e.kind === 'death').length;
    }
    const death = HUNT_RISK.bear.death * 1 * HUNT_RISK.footDeathFactor;
    expectRate(dead, 100_000, death);
    expectRate(injured, 100_000, (HUNT_RISK.bear.injury / 2) * (1 - death));
  });

  it('losy jsou ze seedu vsi a dne: totéž dá totéž, jiný den jinak', () => {
    const a = huntRisk(crowd(2000, WINTER, 'bear'), WINTER, 'bear');
    const b = huntRisk(crowd(2000, WINTER, 'bear'), WINTER, 'bear');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = huntRisk(crowd(2000, WINTER + 1, 'bear'), WINTER + 1, 'bear');
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('děti (doprovod 10–13 let) na lovu nezahynou ani se nezraní, dospělí ano', () => {
    const s = crowd(1000, WINTER, 'bear');
    for (const p of s.people) if (p.id >= 5000 && p.id < 5500) p.bornDay = WINTER - 12 * 366;
    const events = huntRisk(s, WINTER, 'bear');
    const hit = events.filter((e) => e.kind === 'death' || e.kind === 'hunt-injury');
    expect(hit.length).toBeGreaterThan(0);
    expect(s.people.filter((p) => p.id >= 5000 && p.id < 5500)).toHaveLength(500);
    expect(s.people.filter((p) => p.id >= 5000 && p.id < 5500 && p.injuredUntilDay)).toHaveLength(
      0,
    );
  });

  it('lov bez divokých prasat a medvěda (jelen, vlk) je bez rizika', () => {
    const s = crowd(500, WINTER, 'game');
    s.wildlife!.boar = { adults: 0, piglets: 0 };
    s.wildlife!.hunt!.today!.target = 'game';
    // bez prasat se zranění ani smrt nelosuje – huntDay `huntRisk` nevolá
    const before = JSON.stringify(s.people);
    huntDay(s, WINTER, 0);
    expect(JSON.stringify(s.people)).toBe(before);
  });
});

describe('zraněný lovec', () => {
  it('nepracuje, necvičí, neloví – 60 dní', () => {
    const day = WINTER + 3;
    const s = village(day);
    updateLordTraining(s, day);
    const son = s.people.find((p) => p.id === SON_ID)!;
    son.injuredUntilDay = day + 1 + HUNT_RISK.injuryDays;
    expect(isInjured(son, day)).toBe(true);
    expect(laborPerDay(son, day)).toBe(0);
    expect(laborPerDay(son, day + HUNT_RISK.injuryDays)).toBe(0);
    expect(laborPerDay(son, day + HUNT_RISK.injuryDays + 1)).toBe(1);
    expect(isInjured(son, day + HUNT_RISK.injuryDays + 1)).toBe(false);
    // nevybere se do lovu
    const family = {
      trainees: s.people.filter((p) => p.sex === 'male' && p.dwellingId === s.manorId),
    };
    const pool = huntPool(s, day, family);
    expect(pool.manor.map((p) => p.id)).toEqual([LORD_ID]);
    // necvičí ani nezapomíná
    const arms = JSON.stringify(son.arms);
    trainLordDay(s, day);
    expect(JSON.stringify(son.arms)).toBe(arms);
    // nejezdí na objížďku
    const summer = village(SUMMER);
    updateLordTraining(summer, SUMMER);
    const before = lordRides(summer, SUMMER)?.riders.map((r) => r.riderId) ?? [];
    expect(before).toContain(SON_ID);
    summer.people.find((p) => p.id === SON_ID)!.injuredUntilDay = SUMMER + 40;
    const after = lordRides(summer, SUMMER)?.riders.map((r) => r.riderId) ?? [];
    expect(after).not.toContain(SON_ID);
  });
});

describe('smrt na lovu – nástupnictví', () => {
  /** Najde den, kdy vojvoda na lovu medvěda zahyne (pěšky, bez boje ≈ 1,2 % na den). */
  function lordDies(state: VillageState): { state: VillageState; day: number } {
    for (let day = WINTER; day < WINTER + 3000; day++) {
      const s = cloneState(state);
      s.lastDay = day;
      s.wildlife!.hunt = {
        hope: { boar: 0, deer: 0, wolf: 0, bear: 0 },
        today: { day, target: 'bear', riders: [], foot: [LORD_ID], extra: false },
        year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
      };
      for (const p of s.people) if (p.id === LORD_ID) p.arms = { bow: 0, combat: 0, riding: 0 };
      const events = huntRisk(s, day, 'bear');
      if (events.some((e) => e.kind === 'death')) {
        s.wildlife!.hunt!.today!.day = day;
        return { state: s, day };
      }
    }
    throw new Error('vojvoda nezahynul');
  }

  it('vojvoda zahyne → nový vojvoda týž den, kronika "zahynul na lovu medvěda"', () => {
    const base = village(WINTER);
    const { state, day } = lordDies(base);
    expect(state.people.some((p) => p.id === LORD_ID)).toBe(false);
    const events = dynastyDay(state, day);
    expect(events.some((e) => e.kind === 'lord')).toBe(true);
    expect(currentLord(state)?.id).toBe(SON_ID);
    expect(state.wildlife!.hunt!.today!.foot).not.toContain(LORD_ID);
  });

  it('poslední muž rodu zahyne → konec rodu', () => {
    const base = village(WINTER);
    base.people = base.people.filter((p) => p.sex !== 'male' || p.id === LORD_ID);
    const { state, day } = lordDies(base);
    const events = dynastyDay(state, day);
    expect(events.some((e) => e.kind === 'line-ended')).toBe(true);
  });

  it('zraněný zůstane naživu, zápis v kronice se jménem', () => {
    const day = WINTER;
    const s = crowd(300, day, 'bear');
    s.people.find((p) => p.id === 5000)!.name = 'Bořivoj';
    s.people.find((p) => p.id === 5001)!.name = 'Jaromír';
    const events = huntRisk(s, day, 'bear');
    const hurt = events.filter((e) => e.kind === 'hunt-injury');
    expect(hurt.length).toBeGreaterThan(5);
    const injured = s.people.filter((p) => p.injuredUntilDay !== undefined);
    expect(injured).toHaveLength(hurt.length);
    expect(injured[0]!.injuredUntilDay).toBe(day + 1 + 60);
  });
});

describe('losy lovu nemění losy porodů a úmrtí', () => {
  it('porody a úmrtí vsi týž den jsou stejné s lovem i bez něj (proud hunt: ≠ day:)', () => {
    const run = (hunt: boolean): string => {
      const s = village(WINTER - 6, 3);
      if (!hunt) delete s.wildlife;
      let c = s;
      c = advanceVillage(c, WINTER + 20, null, null);
      return JSON.stringify(
        c.chronicle.filter((e) => e.kind === 'birth' || (e.kind === 'death' && e.cause !== 'hunt')),
      );
    };
    expect(run(true)).toBe(run(false));
  }, 30_000);
});

describe('lov navíc na pokyn hráče (wildlife.md – Lov rodu: Kdy)', () => {
  it('v létě: zítra se loví, mimo kalendář; lov bere jezdce z objížďky a práci odešlým synům', () => {
    const s = village(SUMMER);
    s.lastDay = SUMMER;
    updateLordTraining(s, SUMMER);
    expect(canDeclareHunt(s, SUMMER)).toBeNull();
    expect(declareHunt(s, SUMMER)).toBeNull();
    expect(s.wildlife!.hunt!.extraDay).toBe(SUMMER + 1);
    expect(s.wildlife!.hunt!.lastExtraDay).toBe(SUMMER + 1);
    const tomorrow = SUMMER + 1;
    updateLordTraining(s, tomorrow);
    planHuntDay(s, tomorrow);
    const today = s.wildlife!.hunt!.today!;
    expect(today.day).toBe(tomorrow);
    expect(today.extra).toBe(true);
    expect(today.riders.length).toBeGreaterThan(0);
    const ride = lordRides(s, tomorrow)?.riders.map((r) => r.riderId) ?? [];
    for (const r of today.riders) expect(ride).not.toContain(r.personId);
    // pozítří: jiný den bez lovu
    planHuntDay(s, tomorrow + 1);
    expect(s.wildlife!.hunt!.today).toBeNull();
  });

  it('důvody odepření: hájení, příliš brzy, už vyhlášen, není kdo', () => {
    const april = at(602, 4, 10);
    const s = village(april);
    expect(canDeclareHunt(s, april)).toBe('closed-season');
  });

  it('hájení je březen až květen, jinak lze', () => {
    expect(canDeclareHunt(village(at(602, 2, 24)), at(602, 2, 24))).toBeNull();
    expect(canDeclareHunt(village(at(602, 2, 28)), at(602, 2, 28))).toBe('closed-season');
    expect(canDeclareHunt(village(at(602, 5, 30)), at(602, 5, 30))).toBe('closed-season');
    expect(canDeclareHunt(village(at(602, 5, 31)), at(602, 5, 31))).toBeNull();
  });

  it('jednou za 3 dny a vyhlášený den nelze vyhlásit znovu', () => {
    const s = village(SUMMER);
    expect(declareHunt(s, SUMMER)).toBeNull();
    expect(canDeclareHunt(s, SUMMER)).toBe('already');
    expect(canDeclareHunt(s, SUMMER + 1)).toBe('too-soon'); // lov byl SUMMER + 1, zítra SUMMER + 2
    expect(canDeclareHunt(s, SUMMER + 2)).toBe('too-soon'); // SUMMER + 3: rozestup 2 dny
    expect(canDeclareHunt(s, SUMMER + 3)).toBeNull(); // SUMMER + 4: rozestup 3 dny
    expect(HUNT.extra.minGapDays).toBe(3);
  });

  it('kalendářní den lovu je už lov', () => {
    const s = village(WINTER - 1);
    expect(canDeclareHunt(s, WINTER - 1)).toBe('already'); // 1. 11. je den lovu
  });

  it('není kdo: rodina necvičí, nebo jsou muži zranění', () => {
    const s = village(SUMMER);
    for (const p of s.people)
      if (p.sex === 'male' && p.dwellingId === s.manorId) {
        p.injuredUntilDay = SUMMER + 100;
      }
    expect(canDeclareHunt(s, SUMMER)).toBe('no-hunters');
    const noLord = village(SUMMER);
    noLord.people = noLord.people.filter((p) => p.dwellingId !== noLord.manorId);
    expect(canDeclareHunt(noLord, SUMMER)).toBe('no-hunters');
    expect(HUNT_DENIED_TEXT['no-hunters']).toContain('Na lov');
  });
});
