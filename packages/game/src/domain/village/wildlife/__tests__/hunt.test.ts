import { describe, expect, it } from 'vitest';
import { cloneState } from '../../core/clone';
import { dogsYear, feedDogs } from '../manor-dogs';
import { emptyHunt, huntDay, huntSeasonIndex, planHuntDay } from '../hunt';
import { huntFootIds } from '../hunt-party';
import { lordRides, trainLordDay, updateLordTraining } from '../../people/lord';
import { villagersToday } from '../../core/morning-water';
import { advanceVillage } from '../../core/simulate';
import { HUNT, WILDLIFE_LAND } from '../../rules/rules-wildlife';
import type { ChronicleEvent, Person, VillageState } from '../../types';
import { freshWildlife } from '../wildlife';
import { at, horse, horseVillage, LORD_ID, SON_ID, YOUTH_ID } from '../../__tests__/horse-fixtures';

// Velký lov rodu (wildlife.md – Lov rodu): kalendář, síla lovců, úlovek akumulátorem, maso přes
// porážku, pěší lovci mimo práci vsi, psi, determinismus po kouscích.

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

interface Winter {
  state: VillageState;
  events: ChronicleEvent[];
  huntDays: number[];
}

/** Zima 1. 11. – 28. 2.: ráno plán a úlovek dne (bez celé simulace). */
function winter(state: VillageState, step = 1): Winter {
  const events: ChronicleEvent[] = [];
  const huntDays: number[] = [];
  const end = at(602, 2, 28);
  for (let day = START_WINTER; day <= end; day += step) {
    updateLordTraining(state, day);
    planHuntDay(state, day);
    if (state.wildlife?.hunt?.today?.day === day) huntDays.push(day);
    events.push(...huntDay(state, day, 0));
  }
  return { state, events, huntDays };
}

const kills = (w: Winter): { boar: number; deer: number; wolves: number; bear: number } => {
  const y = w.state.wildlife!.hunt!.year;
  return { boar: y.boar, deer: y.deer, wolves: y.wolves, bear: y.bear };
};

describe('kalendář lovu (wildlife.md – Lov rodu: Kdy)', () => {
  it('od 1. 11. každý 7. den do února, v březnu a v létě ne', () => {
    expect(huntSeasonIndex(at(601, 11, 1))).toBe(0);
    expect(huntSeasonIndex(at(601, 11, 8))).toBe(1);
    expect(huntSeasonIndex(at(601, 11, 2))).toBeNull();
    expect(huntSeasonIndex(at(601, 12, 31))).toBeNull(); // 60. den
    expect(huntSeasonIndex(at(602, 1, 1))).toBeNull(); // 61. den
    expect(huntSeasonIndex(at(602, 1, 3))).toBe(9); // 63. den
    expect(huntSeasonIndex(at(602, 3, 1))).toBeNull();
    expect(huntSeasonIndex(at(602, 7, 5))).toBeNull();
    const w = winter(huntVillage(3, 3));
    expect(w.huntDays.length).toBeGreaterThanOrEqual(17);
    expect(w.huntDays.length).toBeLessThanOrEqual(18);
    expect(w.huntDays[0]).toBe(at(601, 11, 1));
    expect(w.huntDays[1]).toBe(at(601, 11, 8));
  });

  it('rodina, která necvičí, neloví', () => {
    const s = huntVillage(3, 3);
    s.people = s.people.filter((p) => p.dwellingId === s.manorId || p.id === AWAY_ID);
    const w = winter(s);
    expect(w.huntDays).toHaveLength(0);
  });
});

describe('úlovek (wildlife.md – Lov rodu: Kolik)', () => {
  it('typický rod (3 jezdci, odešlý syn se psem) za zimu ≈ 4 prasata a 1–2 jeleni, maso ≈ 350–400 kg', () => {
    const w = winter(huntVillage(3, 3));
    const k = kills(w);
    expect(k.boar).toBeGreaterThanOrEqual(3);
    expect(k.boar).toBeLessThanOrEqual(5);
    expect(k.deer).toBeGreaterThanOrEqual(1);
    expect(k.deer).toBeLessThanOrEqual(3);
    // medvěd (jen v listopadu, pěšky) padne nejvýš jednou a vrátí se za 3 roky
    expect(k.bear).toBeLessThanOrEqual(1);
    const meat = w.state.wildlife!.hunt!.year.meatKg;
    expect(meat).toBeGreaterThan(250);
    expect(meat).toBeLessThan(500);
    // maso jde do zásoby přes porážku
    expect(w.state.meatKg ?? 0).toBeCloseTo(meat, 6);
    expect(w.state.livestock?.slaughterWork?.required).toBeCloseTo(meat / 20, 6);
    // kronika jednou za den lovu s kusy
    const hunts = w.events.filter((e) => e.kind === 'hunt');
    expect(hunts.length).toBeGreaterThan(0);
    expect(hunts.length).toBeLessThanOrEqual(w.huntDays.length);
  });

  it('bez koní zhruba jedno prase za zimu (návrh: ≈ 1 prase za zimu)', () => {
    const w = winter(huntVillage(0, 3));
    expect(kills(w).boar).toBeLessThanOrEqual(2);
  });

  it('jeleni, dokud jich je aspoň 1 na 3 laně; laně a kolouši ne', () => {
    const s = huntVillage(3, 3);
    s.wildlife!.deer = { stags: 3, hinds: 5, calves: 1 };
    s.wildlife!.hunt = {
      hope: { boar: 0, deer: 5, wolf: 0, bear: 0 },
      today: null,
      year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
    };
    const day = START_WINTER;
    updateLordTraining(s, day);
    planHuntDay(s, day);
    huntDay(s, day, 0);
    // 3 jeleni na 5 laní: ulovit se smí, dokud jich je aspoň 5 ÷ 3 – dva a stop; laně pod stropem a kolouši zůstanou
    expect(s.wildlife!.deer).toEqual({ stags: 1, hinds: 5, calves: 1 });
    // nad stropem se loví i laně (strop 9,5 kusu)
    const over = huntVillage(3, 3);
    over.wildlife!.deer = { stags: 1, hinds: 12, calves: 4 };
    over.wildlife!.hunt = {
      hope: { boar: 0, deer: 2, wolf: 0, bear: 0 },
      today: null,
      year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
    };
    updateLordTraining(over, day);
    planHuntDay(over, day);
    huntDay(over, day, 0);
    expect(over.wildlife!.deer.calves).toBe(4);
    expect(over.wildlife!.deer.hinds).toBeLessThan(12);
  });

  it('prasata napřed dospělá, selata až bez dospělých', () => {
    const s = huntVillage(3, 3);
    s.wildlife!.boar = { adults: 0.5, piglets: 3 };
    s.wildlife!.hunt = {
      hope: { boar: 2, deer: 0, wolf: 0, bear: 0 },
      today: null,
      year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
    };
    const day = START_WINTER;
    updateLordTraining(s, day);
    planHuntDay(s, day);
    huntDay(s, day, 0);
    expect(s.wildlife!.boar.adults).toBe(0.5);
    expect(s.wildlife!.boar.piglets).toBeLessThan(3);
    const year = s.wildlife!.hunt!.year;
    expect(year.boar).toBeGreaterThan(0);
    expect(year.meatKg).toBe(year.boar * HUNT.meatKg.piglet + year.deer * 0);
  });

  it('vlci dostanou den po 2 škodách za 30 dní, medvěd jen v listopadu', () => {
    const s = huntVillage(3, 3);
    const day = at(601, 12, 6);
    s.wildlife!.predation = {
      acc: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      killDays: [day - 5, day - 3],
      yearHeads: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    updateLordTraining(s, at(601, 12, 6));
    // 6. 12. není lovný den, nejbližší je 6. 12.? 1. 11. + 35 = 6. 12.
    planHuntDay(s, day);
    expect(s.wildlife!.hunt!.today?.target).toBe('wolves');
    // listopadový druhý lov (8. 11.) je medvědí, zimní už ne
    const s2 = huntVillage(3, 3);
    s2.wildlife!.bear = { present: true, backDay: null };
    updateLordTraining(s2, at(601, 11, 8));
    planHuntDay(s2, at(601, 11, 8));
    expect(s2.wildlife!.hunt!.today?.target).toBe('bear');
    expect(s2.wildlife!.hunt!.today?.riders).toHaveLength(0);
    planHuntDay(s2, at(601, 12, 6));
    expect(s2.wildlife!.hunt!.today?.target).toBe('game');
  });
});

describe('lovci a výcvik (wildlife.md – Lov rodu: Kdo)', () => {
  it('odešlý syn chybí v práci vsi, jen v den lovu', () => {
    const s = huntVillage(3, 3);
    const day = at(601, 11, 8);
    updateLordTraining(s, day);
    planHuntDay(s, day);
    expect(huntFootIds(s, day).has(AWAY_ID)).toBe(true);
    expect(villagersToday(s, day, new Set()).villagers.some((p) => p.id === AWAY_ID)).toBe(false);
    const other = at(601, 11, 9);
    updateLordTraining(s, other);
    planHuntDay(s, other);
    expect(huntFootIds(s, other).size).toBe(0);
    expect(villagersToday(s, other, new Set()).villagers.some((p) => p.id === AWAY_ID)).toBe(true);
  });

  it('děti na lov nechodí: chlapec 11 let s koněm cvičí doma jako jindy (Martin 27. 10. 2026)', () => {
    const s = huntVillage(3, 3);
    const day = START_WINTER;
    updateLordTraining(s, day);
    planHuntDay(s, day);
    const t = s.wildlife!.hunt!.today!;
    expect(t.riders.map((r) => r.personId).sort()).toEqual([LORD_ID, SON_ID].sort());
    expect(t.foot).not.toContain(YOUTH_ID);
    // v den lovu jede chlapec objížďku a cvičí stejně jako ve všední den
    expect(lordRides(s, day)?.riders.map((r) => r.riderId)).toEqual([YOUTH_ID]);
    const plain = cloneState(s);
    plain.wildlife!.hunt!.today = null;
    huntDay(s, day, 0);
    trainLordDay(s, day);
    trainLordDay(plain, day);
    const youth = (v: VillageState): Person => v.people.find((p) => p.id === YOUTH_ID)!;
    expect(youth(s).arms).toEqual(youth(plain).arms);
    // bez koně nejde ani pěšky
    const none = huntVillage(0, 0, false);
    updateLordTraining(none, day);
    planHuntDay(none, day);
    expect(none.wildlife!.hunt!.today?.riders).toHaveLength(0);
    expect(none.wildlife!.hunt!.today?.foot).not.toContain(YOUTH_ID);
  });

  it('děti nechodí ani na lov navíc', () => {
    const s = huntVillage(3, 3);
    const day = at(602, 7, 10);
    s.wildlife!.hunt = { ...(s.wildlife!.hunt ?? emptyHunt()), extraDay: day };
    updateLordTraining(s, day);
    planHuntDay(s, day);
    const t = s.wildlife!.hunt!.today!;
    expect(t.extra).toBe(true);
    expect(t.riders.map((r) => r.personId)).not.toContain(YOUTH_ID);
    expect(t.foot).not.toContain(YOUTH_ID);
  });

  it('nepodkutý kůň nejezdí – všichni pěšky', () => {
    const s = huntVillage(3, 3);
    s.shoeing = { lastDay: START_WINTER - 1000 } as never;
    const day = START_WINTER;
    updateLordTraining(s, day);
    planHuntDay(s, day);
    const t = s.wildlife!.hunt!.today!;
    expect(t.riders).toHaveLength(0);
    expect([...t.foot].sort()).toEqual([LORD_ID, SON_ID, AWAY_ID].sort());
  });
});

describe('slabý jezdec a hladová rodina (recenze W4)', () => {
  it('jezdec s jízdou ≈ 3 jde pěšky, kůň zůstane; zdatný jede', () => {
    const s = huntVillage(3, 3);
    for (const p of s.people) if (p.id === LORD_ID && p.arms) p.arms = { ...p.arms, riding: 3 };
    const day = START_WINTER;
    updateLordTraining(s, day);
    planHuntDay(s, day);
    const t = s.wildlife!.hunt!.today!;
    expect(t.riders.map((r) => r.personId)).not.toContain(LORD_ID);
    expect(t.foot).toContain(LORD_ID);
    expect(t.riders.map((r) => r.personId)).toContain(SON_ID);
  });

  it('rodina strhnutá polem (žně) v den lovu: huntDay vyřadí i pěší muže dvorce', () => {
    const s = huntVillage(0, 3);
    updateLordTraining(s, START_WINTER);
    planHuntDay(s, START_WINTER);
    expect(s.wildlife!.hunt!.today!.foot).toContain(LORD_ID);
    huntDay(s, START_WINTER, 0.5);
    expect(s.wildlife!.hunt!.today!.foot).toEqual([AWAY_ID]);
  });
});

describe('pěší lov (recenze W4)', () => {
  it('rod s jedním pěším lovcem a psy uloví prase do 3 zim', () => {
    const s = huntVillage(0, 0, false);
    // ostatní muži dvorce nic neumějí – lovec je jediný vojvoda
    for (const p of s.people)
      if (p.sex === 'male' && p.id !== LORD_ID) p.arms = { bow: 0, combat: 0, riding: 0 };
    let boar = 0;
    for (let year = 0; year < 3; year++) {
      for (let day = at(601 + year, 11, 1); day <= at(602 + year, 2, 28); day++) {
        dogsYear(s, day);
        updateLordTraining(s, day);
        planHuntDay(s, day);
        for (const e of huntDay(s, day, 0)) if (e.kind === 'hunt') boar += e.kills.boar;
      }
    }
    expect(s.wildlife!.dogs!.count).toBeGreaterThan(0);
    expect(boar).toBeGreaterThanOrEqual(1);
  });
});

describe('psi hned (recenze W4)', () => {
  it('existující dvorec bez smečky ji založí hned, ne až 1. 5.; podruhé nic nemění', () => {
    const s = huntVillage(3, 0);
    expect(s.wildlife!.dogs).toBeUndefined();
    dogsYear(s, START_WINTER);
    expect(s.wildlife!.dogs).toEqual({ count: 4, fed: true });
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

describe('determinismus (po kouscích)', () => {
  it('zima po dnech a po 7 dnech dá týž stav lovu', () => {
    const a = winter(huntVillage(3, 3));
    const b = winter(huntVillage(3, 3));
    expect(JSON.stringify(a.state.wildlife)).toBe(JSON.stringify(b.state.wildlife));
    const c = cloneState(huntVillage(3, 3));
    const d = winter(c, 1);
    expect(JSON.stringify(d.state.wildlife?.hunt?.year)).toBe(
      JSON.stringify(a.state.wildlife?.hunt?.year),
    );
  });
});

describe('krmení psů dvorce', () => {
  it('bez obilí a při hladu psi nedostanou a štěňata nepřibudou', () => {
    const s = huntVillage(3, 4);
    s.storesKg = 10_000;
    feedDogs(s, START_WINTER, 10_000, 100);
    expect(s.wildlife!.dogs!.fed).toBe(true);
    expect(s.storesKg).toBeCloseTo(10_000 - 1.2, 9);
    s.hungry = true;
    feedDogs(s, START_WINTER, 10_000, 100);
    expect(s.wildlife!.dogs!.fed).toBe(false);
  });
});

describe('celá simulace: lov v dopočtu po kouscích', () => {
  it('1 den, 7 dní, 30 dní a celý úsek dají týž lov, psy i maso', () => {
    const base = huntVillage(3, 0, true);
    base.lastDay = at(601, 10, 25);
    const target = at(602, 3, 3);
    const run = (chunk: number): VillageState => {
      let s = base;
      while (s.lastDay < target)
        s = advanceVillage(s, Math.min(target, s.lastDay + chunk), null, null);
      return s;
    };
    const whole = run(1000);
    const key = (s: VillageState): string =>
      JSON.stringify([s.wildlife, s.meatKg, s.people.map((p) => p.arms), s.storesKg]);
    expect(whole.wildlife?.hunt?.year.days).toBeGreaterThan(10);
    for (const chunk of [1, 7, 30]) expect(key(run(chunk))).toBe(key(whole));
  }, 60_000);
});
