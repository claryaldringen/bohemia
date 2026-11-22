import { describe, expect, it } from 'vitest';
import { applyHuntResult } from '../hunt';
import { bearBackDay, freshWildlife } from '../wildlife';
import { cloneState } from '../../core/clone';
import { loseHorse } from '../../livestock/horse-riders';
import { villageHorses } from '../../livestock/horses';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import type { HuntResult, QuarryKind, VillageState } from '../../types';
import { at, horse, horseVillage, LORD_ID, SON_ID } from '../../__tests__/horse-fixtures';

// Výsledek lovu ve vsi (hunting.md – Pravidla 5–7; plán 2026-11-22-hunting – Rozhodnutí 6, 7):
// úbytek zvěře, maso a kůže, úlovek roku, výcvik, zranění a smrt lovců a ztracení koně
// (`applyHuntResult`; událost schránky `hunt-result` testuje `core/__tests__/inbox.test.ts`).

const DAY = at(602, 7, 10);
/** Muž mimo dvorec (26 let) – lovec z vesnice. */
const VILLAGER_ID = 20;

/** Dvorec s koněm vojvody, zvěř se všemi druhy, muži 40 / 50 / 60 v luku, boji a jízdě. */
function village(): VillageState {
  const s = horseVillage([{ ...horse(1, 8, 'male', 100), riderId: LORD_ID }], 2, 4);
  s.lastDay = DAY - 1;
  const w = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  w.deer = { stags: 5, hinds: 8, calves: 3 };
  w.boar = { adults: 6, piglets: 4 };
  w.wolves = 3;
  w.bear = { present: true, backDay: null };
  s.wildlife = w;
  for (const p of s.people) if (p.sex === 'male') p.arms = { bow: 40, combat: 50, riding: 60 };
  s.people.find((p) => p.id === SON_ID)!.name = 'Lutobor';
  return s;
}

/** Výsledek lovu bez výcviku, ran a koní. */
function result(quarry: QuarryKind, killed: boolean, extra: Partial<HuntResult> = {}): HuntResult {
  return {
    quarry,
    killed,
    names: killed ? ['Bořivoj', 'Lutobor'] : [],
    trained: [],
    casualties: [],
    horsesLost: [],
    ...extra,
  };
}

const NO_KILLS = { boar: 0, deer: 0, wolves: 0, bear: 0 };

describe('úlovek (hunting.md – Pravidla 7; wildlife.md – Kolik)', () => {
  it('jelen: −1 jelen, 90 kg masa do zásoby, kůže, úlovek roku a kronika se jmény', () => {
    const s = village();
    const meat = s.meatKg ?? 0;
    const hides = s.wares?.hides ?? 0;
    const events = applyHuntResult(s, DAY, result('stag', true));
    expect(s.wildlife!.deer).toEqual({ stags: 4, hinds: 8, calves: 3 });
    expect(s.meatKg).toBeCloseTo(meat + 90, 9);
    expect(s.wares!.hides).toBe(hides + 1);
    expect(s.wildlife!.hunt!.year).toEqual({ ...NO_KILLS, deer: 1, meatKg: 90, days: 1 });
    expect(events).toEqual([
      {
        day: DAY,
        kind: 'hunt',
        kills: { ...NO_KILLS, deer: 1 },
        meatKg: 90,
        names: ['Bořivoj', 'Lutobor'],
      },
    ]);
  });

  it('laň: −1 laň, 50 kg masa a kůže; kanec i bachyně: −1 dospělé prase, 45 kg a menší kůže', () => {
    const s = village();
    applyHuntResult(s, DAY, result('hind', true));
    expect(s.wildlife!.deer.hinds).toBe(7);
    expect(s.wildlife!.hunt!.year.meatKg).toBe(50);
    applyHuntResult(s, DAY, result('boar', true));
    applyHuntResult(s, DAY, result('sow', true));
    expect(s.wildlife!.boar).toEqual({ adults: 4, piglets: 4 });
    expect(s.wares!.smallHides).toBe(2);
    expect(s.wares!.hides).toBe(1);
    expect(s.wildlife!.hunt!.year).toEqual({
      ...NO_KILLS,
      deer: 1,
      boar: 2,
      meatKg: 50 + 45 + 45,
      days: 3,
    });
  });

  it('medvěd: v kraji není, vrátí se jiný (`bearBackDay`), 100 kg masa, bez kůže', () => {
    const s = village();
    const events = applyHuntResult(s, DAY, result('bear', true));
    expect(s.wildlife!.bear).toEqual({ present: false, backDay: bearBackDay(DAY) });
    expect(s.wildlife!.hunt!.year).toEqual({ ...NO_KILLS, bear: 1, meatKg: 100, days: 1 });
    expect(s.wares?.hides ?? 0).toBe(0);
    expect(s.wares?.smallHides ?? 0).toBe(0);
    expect(events[0]).toMatchObject({ kind: 'hunt', kills: { ...NO_KILLS, bear: 1 } });
  });

  it('vlk: −1 vlk, bez masa a kůže', () => {
    const s = village();
    const meat = s.meatKg ?? 0;
    const events = applyHuntResult(s, DAY, result('wolf', true));
    expect(s.wildlife!.wolves).toBe(2);
    expect(s.meatKg ?? 0).toBe(meat);
    expect(s.wares?.hides ?? 0).toBe(0);
    expect(s.wares?.smallHides ?? 0).toBe(0);
    expect(s.wildlife!.hunt!.year).toEqual({ ...NO_KILLS, wolves: 1, meatKg: 0, days: 1 });
    expect(events[0]).toMatchObject({ kind: 'hunt', kills: { ...NO_KILLS, wolves: 1 }, meatKg: 0 });
  });

  it('zvěř nejníž 0 – poslední zlomek kusu', () => {
    const s = village();
    s.wildlife!.wolves = 0.4;
    applyHuntResult(s, DAY, result('wolf', true));
    expect(s.wildlife!.wolves).toBe(0);
  });

  it('útěk: jen den lovu navíc – zvěř, maso, kůže a kronika beze změny', () => {
    const s = village();
    const before = cloneState(s);
    const events = applyHuntResult(s, DAY, result('boar', false));
    expect(events).toEqual([]);
    expect(s.wildlife!.hunt!.year).toEqual({ ...NO_KILLS, meatKg: 0, days: 1 });
    delete s.wildlife!.hunt;
    expect(s).toEqual(before);
  });
});

describe('výcvik, rány a koně (plán 2026-11-22-hunting – Rozhodnutí 5, 7; hunting.md – Pravidla 6)', () => {
  it('výcvik lovem: strop 70 – jízda 69 po 3 h jízdy nepřesáhne 70, ale přibude', () => {
    const s = village();
    const son = s.people.find((p) => p.id === SON_ID)!;
    son.arms = { bow: 10, combat: 20, riding: 69 };
    applyHuntResult(
      s,
      DAY,
      result('stag', true, {
        trained: [{ personId: SON_ID, hours: { bow: 0, combat: 1, riding: 3 } }],
      }),
    );
    expect(son.arms.riding).toBeGreaterThan(69);
    expect(son.arms.riding).toBeLessThanOrEqual(70);
    expect(son.arms.combat).toBeGreaterThan(20);
    expect(son.arms.bow).toBe(10);
    expect(son.arms.best?.riding).toBe(son.arms.riding);
  });

  it('raněný lovec: 60 dní nepracuje (do dne + 61) a kronika „zraněn na lovu“', () => {
    const s = village();
    const events = applyHuntResult(
      s,
      DAY,
      result('boar', true, { casualties: [{ personId: SON_ID, outcome: 'wounded' }] }),
    );
    expect(s.people.find((p) => p.id === SON_ID)!.injuredUntilDay).toBe(DAY + 61);
    expect(events).toContainEqual({ day: DAY, kind: 'hunt-injury', prey: 'boar', name: 'Lutobor' });
  });

  it('zranění nezkrátí delší ránu z dřívějška', () => {
    const s = village();
    s.people.find((p) => p.id === SON_ID)!.injuredUntilDay = DAY + 200;
    applyHuntResult(
      s,
      DAY,
      result('bear', false, { casualties: [{ personId: SON_ID, outcome: 'wounded' }] }),
    );
    expect(s.people.find((p) => p.id === SON_ID)!.injuredUntilDay).toBe(DAY + 200);
  });

  it('padlý lovec zmizí z vsi a kronika „zahynul na lovu“ s druhem zvěře', () => {
    const s = village();
    const people = s.people.length;
    const events = applyHuntResult(
      s,
      DAY,
      result('bear', false, { casualties: [{ personId: VILLAGER_ID, outcome: 'dead' }] }),
    );
    expect(s.people.some((p) => p.id === VILLAGER_ID)).toBe(false);
    expect(s.people.length).toBe(people - 1);
    const death = events.find((e) => e.kind === 'death');
    expect(death).toMatchObject({
      day: DAY,
      kind: 'death',
      group: 'adult',
      cause: 'hunt',
      prey: 'bear',
      population: people - 1,
    });
  });

  it('padlý kůň se ztratí z ohrady – jezdec jde dál pěšky', () => {
    const s = village();
    const lord = s.people.find((p) => p.id === LORD_ID)!;
    lord.away = { kind: 'journey', refId: 'j1', horseId: 1 };
    applyHuntResult(s, DAY, result('boar', true, { horsesLost: [1] }));
    expect(villageHorses(s).some((h) => h.id === 1)).toBe(false);
    expect(lord.away.horseId).toBeUndefined();
    expect(loseHorse(s, 1)).toBe(false);
  });

  it('neexistující lovec a kůň: nic se nezmění, úlovek platí', () => {
    const s = village();
    const expected = cloneState(s);
    applyHuntResult(expected, DAY, result('hind', true));
    applyHuntResult(
      s,
      DAY,
      result('hind', true, {
        trained: [{ personId: 999, hours: { bow: 2, combat: 2, riding: 2 } }],
        casualties: [
          { personId: 998, outcome: 'dead' },
          { personId: 997, outcome: 'wounded' },
        ],
        horsesLost: [77],
      }),
    );
    expect(s).toEqual(expected);
  });
});
