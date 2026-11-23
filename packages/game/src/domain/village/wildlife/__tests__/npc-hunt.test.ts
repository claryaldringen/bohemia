import { describe, expect, it } from 'vitest';
import { npcHuntDay, npcHunters } from '../npc-hunt';
import { emptyHunt } from '../hunt';
import { freshWildlife } from '../wildlife';
import { cloneState } from '../../core/clone';
import { advanceVillage } from '../../core/simulate';
import { craftCoverage } from '../../crafts/crafts';
import { HORSE_SHOEING } from '../../rules/rules-livestock';
import { STEWARD } from '../../rules/rules-steward';
import { HUNT, HUNT_FIGHT, WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { newSteward } from '../../steward/steward-state';
import { huntWanted, needSteps } from '../../steward/steward-needs';
import type { ArmsSkills, VillageState, WildlifeState } from '../../types';
import { at, horse, horseVillage, LORD_ID, SON_ID, YOUTH_ID } from '../../__tests__/horse-fixtures';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';

// Lov správce bez scény (hunting.md – Pravidla 8, 9; plán 2026-11-22-hunting – Rozhodnutí 8,
// Úloha 8): správce vyhlásí lov na zítřek, když zvěř škodí na polích, a zítra ho ves dopočte
// v kroku dne – nejvýš 2 nejlepší muži, na kance a bachyni jen nad branou umu, souboj se zvěří
// na rovné louce. Ves bez správce velkou zvěř neloví.

const DAY = at(602, 7, 10);
const ARMS: ArmsSkills = { bow: 85, combat: 85, riding: 85 };
/** Vesničané mimo dvorec (muži 27 a 29 let). */
const VILLAGERS = [20, 22];

type Game = Partial<Pick<WildlifeState, 'deer' | 'boar' | 'wolves' | 'bear'>>;

/** Les bez velké zvěře – test doplní, co potřebuje. */
const NO_GAME: Required<Game> = {
  deer: { stags: 0, hinds: 0, calves: 0 },
  boar: { adults: 0, piglets: 0 },
  wolves: 0,
  bear: { present: false, backDay: null },
};

/**
 * Dvorec rodu (vojvoda Bořivoj 41, syn Radim 18 – oba na vycvičeném koni a se zbraněmi `arms`,
 * chlapec 12) a vesničané 20 a 22; v lese vsi jen zvěř `game`. Dnes mužům na stavby zbylo 20 čd
 * (`commonLaborHistory`), takže ves honce uvolní.
 */
function village(game: Game, arms: ArmsSkills = ARMS): VillageState {
  const s = horseVillage(
    [
      { ...horse(1, 8, 'male', 100), riderId: LORD_ID },
      { ...horse(2, 8, 'male', 100), riderId: SON_ID },
    ],
    2,
    4,
  );
  s.lastDay = DAY - 1;
  for (const p of s.people) {
    if (p.id === LORD_ID || p.id === SON_ID || p.id === YOUTH_ID) {
      p.line = true;
      p.arms = { ...arms };
    }
  }
  s.people.find((p) => p.id === LORD_ID)!.name = 'Bořivoj';
  s.people.find((p) => p.id === SON_ID)!.name = 'Radim';
  s.dynasty = { lordId: LORD_ID, lords: [] };
  const w = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  Object.assign(w, NO_GAME, game);
  s.wildlife = w;
  s.horsesCaredToday = 1;
  s.horsesFed = true;
  s.commonLaborHistory = [20];
  return s;
}

/** Ves s lovem správce na den `day` (vyhlášený včera). */
function withNpcHunt(s: VillageState, day = DAY): VillageState {
  s.wildlife!.hunt = { ...emptyHunt(), npc: { day }, declared: 1 };
  return s;
}

/** Ves se správcem a škodou zvěře na polích letos `kg`. */
function damaged(kg: number): VillageState {
  const s = village({ deer: { stags: 5, hinds: 8, calves: 3 }, boar: { adults: 6, piglets: 4 } });
  s.steward = newSteward(DAY - 400, true);
  s.wildlife!.damage = {
    fromDay: DAY - 30,
    risk: [],
    parts: {},
    topPartId: null,
    totalKg: kg,
  };
  return s;
}

describe('správce vyhlásí lov (hunting.md – Pravidla 8)', () => {
  it('škody v červenci → správce vyhlásí lov na zítřek (beaters i npc), týž den podruhé ne', () => {
    const s = damaged(1_000_000);
    const ctx = { day: DAY, landscape: LANDSCAPE, coverage: craftCoverage(s, DAY) };
    needSteps(s, ctx);
    const hunt = s.wildlife!.hunt!;
    expect(hunt.npc).toEqual({ day: DAY + 1 });
    // honci a lovci správce zítra celý den mimo práci vsi – útočník platí den jako honec
    expect(hunt.beaters).toEqual({ day: DAY + 1, men: HUNT.beaters.men + HUNT.npc.hunters });
    expect(hunt.declared).toBe(1);
    expect(s.steward!.summerHunts).toEqual({ year: 602, count: 1 });
    // týž den podruhé ne – lov na zítřek už je (`already`)
    expect(huntWanted(s, DAY, 0)).toBe(false);
    needSteps(s, ctx);
    expect(s.wildlife!.hunt).toEqual(hunt);
    expect(s.steward!.summerHunts).toEqual({ year: 602, count: 1 });
  });

  it('bez škod, mimo měsíce škod nebo nad počet lovů za léto nic', () => {
    const calm = damaged(0);
    expect(huntWanted(calm, DAY, 0)).toBe(false);
    const s = damaged(1_000_000);
    expect(huntWanted(s, DAY, 0)).toBe(true);
    expect(huntWanted(s, at(602, 9, 10), 0)).toBe(false);
    s.steward!.summerHunts = { year: 602, count: STEWARD.huntsPerSummer };
    expect(huntWanted(s, DAY, 0)).toBe(false);
  });

  it('ves bez správce velkou zvěř neloví ani při škodách', () => {
    for (const steward of [null, newSteward(DAY - 400, false)]) {
      const s = damaged(1_000_000);
      if (steward) s.steward = steward;
      else delete s.steward;
      const after = advanceVillage(s, DAY + 30, null, null);
      expect(after.wildlife!.hunt?.npc).toBeUndefined();
      expect(after.wildlife!.hunt?.beaters).toBeUndefined();
      expect(after.wildlife!.hunt?.year.days ?? 0).toBe(0);
      expect(after.chronicle.some((e) => e.kind === 'hunt')).toBe(false);
    }
  }, 60_000);
});

describe('lovci správce (`npcHunters`)', () => {
  it('2 nejlepší muži od 14 let: boj + jízda jezdce, pak id; raněný a pryč ne', () => {
    const s = village({ deer: { stags: 5, hinds: 0, calves: 0 } });
    const hunters = npcHunters(s, DAY, 'stag');
    expect(HUNT.npc.hunters).toBe(2);
    expect(hunters.map((h) => h.personId)).toEqual([LORD_ID, SON_ID]);
    expect(hunters.every((h) => h.mounted && h.lineMan && h.health === 100)).toBe(true);
    expect(hunters[0]!.skills).toEqual({ bow: 85, combat: 85, riding: 85 });
    expect(hunters[0]!.strength).toBeGreaterThan(hunters[0]!.footStrength);
    // syn raněný, vojvoda pryč → vesničané silou vesničana a bez dovedností
    s.people.find((p) => p.id === SON_ID)!.injuredUntilDay = DAY + 5;
    s.people.find((p) => p.id === LORD_ID)!.away = { kind: 'labor', untilDay: DAY + 5 };
    const villagers = npcHunters(s, DAY, 'stag');
    expect(villagers.map((h) => h.personId)).toEqual(VILLAGERS);
    expect(villagers[0]).toMatchObject({
      mounted: false,
      lineMan: false,
      skills: { bow: 0, combat: 0, riding: 0 },
    });
    expect(villagers[0]!.strength).toBeGreaterThan(0);
    // chlapec 12 let nejde
    expect(villagers.some((h) => h.personId === YOUTH_ID)).toBe(false);
  });

  it('nepodkutý kůň → správce pošle pěší', () => {
    const s = village({ deer: { stags: 5, hinds: 0, calves: 0 } });
    s.shoeing = { lastDay: DAY - HORSE_SHOEING.everyDays - 1 };
    const hunters = npcHunters(s, DAY, 'stag');
    expect(hunters.map((h) => h.personId)).toEqual([LORD_ID, SON_ID]);
    expect(hunters.every((h) => !h.mounted)).toBe(true);
    expect(hunters[0]!.strength).toBe(hunters[0]!.footStrength);
    s.shoeing = { lastDay: DAY };
    expect(npcHunters(s, DAY, 'stag').every((h) => h.mounted)).toBe(true);
  });

  it('na kance a bachyni jen nad branou umu – z koně, jinak pěšky', () => {
    const gate = HUNT_FIGHT.boarGate;
    // boj nad branou, jízda pod branou z koně → pěšky
    const foot = village({ boar: { adults: 6, piglets: 0 } }, { bow: 0, combat: 60, riding: 50 });
    expect(gate.mounted.riding).toBeGreaterThan(50);
    const onFoot = npcHunters(foot, DAY, 'boar');
    expect(onFoot.map((h) => [h.personId, h.mounted])).toEqual([
      [LORD_ID, false],
      [SON_ID, false],
    ]);
    // i jízda nad branou → z koně
    const riders = village({ boar: { adults: 6, piglets: 0 } }, { bow: 0, combat: 60, riding: 70 });
    expect(npcHunters(riders, DAY, 'sow').every((h) => h.mounted)).toBe(true);
    // na jelena jdou i vesničané bez umu, na kance ne
    expect(npcHunters(foot, DAY, 'stag')).toHaveLength(2);
    foot.people.find((p) => p.id === SON_ID)!.arms = { bow: 0, combat: 59, riding: 50 };
    expect(npcHunters(foot, DAY, 'boar').map((h) => h.personId)).toEqual([LORD_ID]);
  });
});

describe('lov správce v kroku dne (`npcHuntDay`)', () => {
  it('kanec bez muže nad branou: nikdo nejde, zvíře uteče, maso 0, days +1', () => {
    const s = withNpcHunt(
      village({ boar: { adults: 6, piglets: 2 } }, { bow: 40, combat: 50, riding: 80 }),
    );
    expect(npcHunters(s, DAY, 'boar')).toEqual([]);
    expect(npcHunters(s, DAY, 'sow')).toEqual([]);
    const meat = s.meatKg ?? 0;
    const events = npcHuntDay(s, DAY);
    expect(events).toEqual([]);
    expect(s.meatKg ?? 0).toBe(meat);
    expect(s.wildlife!.boar.adults).toBe(6);
    expect(s.wildlife!.hunt!.year).toMatchObject({ boar: 0, meatKg: 0, days: 1 });
    expect(s.wildlife!.hunt!.npc).toBeUndefined();
    // druhé volání téhož dne už nic
    expect(npcHuntDay(s, DAY)).toEqual([]);
    expect(s.wildlife!.hunt!.year.days).toBe(1);
  });

  it('zabitý jelen: maso, kůže, jelenů −1, kronika hunt', () => {
    const s = withNpcHunt(village({ deer: { stags: 5, hinds: 0, calves: 2 } }));
    const meat = s.meatKg ?? 0;
    const hides = s.wares?.hides ?? 0;
    const events = npcHuntDay(s, DAY);
    expect(s.wildlife!.deer).toEqual({ stags: 4, hinds: 0, calves: 2 });
    expect(s.meatKg).toBeCloseTo(meat + HUNT.meatKg.stag, 9);
    expect(s.wares!.hides).toBe(hides + 1);
    expect(s.wildlife!.hunt!.year).toMatchObject({ deer: 1, meatKg: HUNT.meatKg.stag, days: 1 });
    const hunt = events.find((e) => e.kind === 'hunt');
    expect(hunt).toMatchObject({ day: DAY, kind: 'hunt', meatKg: HUNT.meatKg.stag });
    expect(hunt?.kind === 'hunt' && [...hunt.names].sort()).toEqual(['Bořivoj', 'Radim']);
    // jen den lovu správce – jiný den nic
    const other = withNpcHunt(village({ deer: { stags: 5, hinds: 0, calves: 2 } }));
    expect(npcHuntDay(other, DAY + 1)).toEqual([]);
    expect(other.wildlife!.deer.stags).toBe(5);
  });

  it('poslední muž rodu smí padnout (seed s medvědem, kde padne) – bez ochrany', () => {
    const s = withNpcHunt(
      village({ bear: { present: true, backDay: null } }, { bow: 20, combat: 30, riding: 0 }),
    );
    // jediný muž od 14 let a jediný muž rodu je vojvoda
    s.people = s.people.filter((p) => p.id === LORD_ID || p.sex === 'female');
    s.seed = BEAR_SEED;
    expect(npcHunters(s, DAY, 'bear').map((h) => h.personId)).toEqual([LORD_ID]);
    const events = npcHuntDay(s, DAY);
    expect(s.people.some((p) => p.id === LORD_ID)).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'death', cause: 'hunt', prey: 'bear' }),
    );
    expect(s.wildlife!.bear.present).toBe(true);
  });

  it('npcHuntDay je deterministický a ves vcelku = po kouscích (advanceChunked přes den lovu)', () => {
    const game: Game = {
      deer: { stags: 5, hinds: 8, calves: 3 },
      boar: { adults: 6, piglets: 4 },
      wolves: 3,
      bear: { present: true, backDay: null },
    };
    const a = withNpcHunt(village(game));
    const b = cloneState(a);
    expect(JSON.stringify(npcHuntDay(a, DAY))).toBe(JSON.stringify(npcHuntDay(b, DAY)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // přes den lovu v simulaci: vcelku i po jednom dni stejně
    const start = withNpcHunt(village(game), DAY + 1);
    start.wildlife!.hunt!.beaters = { day: DAY + 1, men: HUNT.beaters.men + HUNT.npc.hunters };
    const to = DAY + 3;
    const whole = advanceVillage(start, to, null, null);
    let chunked = start;
    while (chunked.lastDay < to) chunked = advanceVillage(chunked, chunked.lastDay + 1, null, null);
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    expect(whole.wildlife!.hunt!.year.days).toBe(1);
    expect(whole.wildlife!.hunt!.npc).toBeUndefined();
  }, 60_000);
});

/**
 * Seed vsi, ve kterém medvěd osamělého vojvodu (luk 20, boj 30) na lovu zabije – hledáno
 * 23. 11. 2026 mezi seedy 1–60 (padl ve 20, raněný ve 38, medvěda složil ve 2).
 */
const BEAR_SEED = 3;
