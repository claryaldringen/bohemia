// Rýžování zlata (plán 6, úloha 4; gold.md – Pravidla 1 a 2): sezóna, výběr náplavu, výkon
// rýžovníka, vyčerpání náplavu, náplav bez cesty a dopočet po kouscích.
import { beforeAll, describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { generateAcceptedLandscape, type Landscape } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { goldPlacers } from '../../core/premium-effects';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { distanceFactor } from '../../fields/fields';
import { villageRoadWalk, type Walk } from '../../paths/walking';
import { CRAFT_BASE } from '../../rules/rules-crafts';
import { PANNING } from '../../rules/rules-gold';
import type { Dwelling, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';
import { newWorkshop, restingCrafters, workCrafts } from '../crafts';
import { choosePlacer, inPanningSeason, placerLeftG, workPanner } from '../gold-crafts';

const YEAR = 365.25;
const at = (month: number, day: number): number => dayIndexOf({ year: 601, month, day });
const PANNER = 50;
const PLACERS = [
  { x: 100, z: 0 },
  { x: 300, z: 0 },
];
const MASTER = { craft: 1, skill: 1 };

const person = (id: number, years: number, dwellingId: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

/** Ves s dílnou rýžovníka v `workshopAt` – vyučený muž a jeho žena; vesnice v (0, 0). */
function pannerVillage(day: number, workshopAt = { x: 0, z: 0 }): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [person(2, 25, 1, day), person(3, 25, 1, day), person(4, 20, 1, day)];
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = day;
  s.nextId = 100;
  s.dwellings.push({
    id: PANNER,
    type: CRAFT_BASE.panner,
    builtDay: day,
    condition: 1,
    position: { ...workshopAt, rotation: 0 },
    workshop: newWorkshop('panner'),
  });
  s.people.push(person(60, 24, PANNER, day), { ...person(61, 22, PANNER, day), sex: 'female' });
  return withoutSmallGame(s);
}
const panner = (s: VillageState): Dwelling => s.dwellings.find((d) => d.id === PANNER)!;
const exhausted = (s: VillageState): { day: number; left: number }[] =>
  s.chronicle.flatMap((e) => (e.kind === 'placer-exhausted' ? [{ day: e.day, left: e.left }] : []));

describe('rýžování – náplavy předané přímo (bez krajiny – chůze vzdušně)', () => {
  it('30 květnových dní u náplavu 100 m: 30 g, goldPanned [30], náplav 0; učeň 0,5 g', () => {
    const s = pannerVillage(at(4, 30));
    for (let d = 1; d <= 30; d++) {
      expect(workPanner(s, panner(s), MASTER, at(5, d), PLACERS)).toEqual({
        activity: 'producing',
        pannedG: 1,
        site: { x: 100, z: 0 },
      });
    }
    expect(s.gold).toBe(30);
    expect(s.goldPanned).toEqual([30]);
    expect(panner(s).workshop!.placer).toEqual({ index: 0, walkM: 100 });
    const young = pannerVillage(at(4, 30));
    const out = workPanner(young, panner(young), { craft: 1, skill: 0.5 }, at(5, 1), PLACERS);
    expect(out.pannedG).toBe(0.5);
    expect(young.gold).toBe(0.5);
  });

  it('sezóna: 31. 3. a 1. 11. se nerýžuje (resting), 1. 4. a 31. 10. ano', () => {
    const days = [at(3, 31), at(4, 1), at(10, 31), at(11, 1)];
    expect(days.map(inPanningSeason)).toEqual([false, true, true, false]);
    for (const [day, pans] of [
      [at(3, 31), false],
      [at(4, 1), true],
      [at(10, 31), true],
      [at(11, 1), false],
    ] as const) {
      const s = pannerVillage(day - 1);
      // mimo sezónu odpočívá a náplav nevybírá (bez chůze)
      if (!pans) {
        expect(restingCrafters(s, day, NO_CRAFTS).get(PANNER)).toBe('resting');
        expect(panner(s).workshop!.placer).toBeUndefined();
      }
      const out = workPanner(s, panner(s), MASTER, day, PLACERS);
      expect(out.activity).toBe(pans ? 'producing' : 'resting');
      expect(s.gold ?? 0).toBe(pans ? 1 : 0);
      expect(s.goldPanned).toEqual(pans ? [1] : undefined);
    }
  });

  it('okraj náplavu: zbytek 0,5 g, náplav vyčerpaný, další den náplav 1 (300 m)', () => {
    const s = pannerVillage(at(5, 1));
    s.goldPanned = [1_499.5];
    const first = workPanner(s, panner(s), MASTER, at(5, 2), PLACERS);
    expect(first).toEqual({
      activity: 'producing',
      pannedG: 0.5,
      site: { x: 100, z: 0 },
      exhaustedLeft: 1,
    });
    expect(s.goldPanned).toEqual([1_500]);
    expect(placerLeftG(s, 0)).toBe(0);
    expect(panner(s).workshop!.placer).toBeUndefined();
    const next = workPanner(s, panner(s), MASTER, at(5, 3), PLACERS);
    expect(next.exhaustedLeft).toBeUndefined();
    expect(next.site).toEqual({ x: 300, z: 0 });
    expect(panner(s).workshop!.placer).toEqual({ index: 1, walkM: 300 });
    expect(distanceFactor(300)).toBeCloseTo(1.2, 12);
    expect(next.pannedG).toBeCloseTo(1 / distanceFactor(300), 12);
    expect(s.goldPanned).toEqual([1_500, next.pannedG]);
    expect(s.gold).toBeCloseTo(0.5 + 1 / 1.2, 12);
  });

  it('oba náplavy vyčerpané: no-placer, nic navíc; součet goldPanned = přírůstek zlata', () => {
    const s = pannerVillage(at(5, 1));
    s.goldPanned = [1_499.5, 1_499.8];
    s.gold = 7;
    const a = workPanner(s, panner(s), MASTER, at(5, 2), PLACERS);
    const b = workPanner(s, panner(s), MASTER, at(5, 3), PLACERS);
    const c = workPanner(s, panner(s), MASTER, at(5, 4), PLACERS);
    expect([a.exhaustedLeft, b.exhaustedLeft, c.exhaustedLeft]).toEqual([1, 0, undefined]);
    expect(b.pannedG).toBeCloseTo(0.2, 9);
    expect(c).toEqual({ activity: 'no-placer', pannedG: 0, site: null });
    expect(panner(s).workshop!.placer).toBeNull();
    expect(s.goldPanned).toEqual([1_500, 1_500]);
    expect(s.gold).toBeCloseTo(7 + 0.5 + 0.2, 9);
  });

  it('při shodě vzdálenosti vyhraje nižší index', () => {
    const s = pannerVillage(at(5, 1));
    const tie = [
      { x: 0, z: 200 },
      { x: 200, z: 0 },
    ];
    expect(choosePlacer(s, panner(s), tie)).toEqual({ index: 0, walkM: 200 });
    expect(choosePlacer(s, panner(s), [...tie].reverse())).toEqual({ index: 0, walkM: 200 });
  });

  it('náplav bez cesty (Infinity) se nevybere a JSON nedostane null; vyrýžovaný také ne', () => {
    const s = pannerVillage(at(5, 1));
    const across: Walk = (_from, targets) => targets.map((t) => (t.x === 100 ? Infinity : 300));
    const placer = choosePlacer(s, panner(s), PLACERS, across);
    expect(placer).toEqual({ index: 1, walkM: 300 });
    expect(JSON.parse(JSON.stringify(placer))).toEqual({ index: 1, walkM: 300 });
    expect(choosePlacer(s, panner(s), PLACERS, (_f, t) => t.map(() => Infinity))).toBeNull();
    s.goldPanned = [0, 1_500];
    expect(choosePlacer(s, panner(s), PLACERS, across)).toBeNull();
    // uložený výběr je vždy konečné číslo – i po JSON
    const out = workPanner(s, panner(s), MASTER, at(5, 2), PLACERS, across);
    expect(out).toEqual({ activity: 'no-placer', pannedG: 0, site: null });
    expect(JSON.parse(JSON.stringify(panner(s).workshop))).toMatchObject({ placer: null });
  });

  it('placer: null v sezóně → no-placer (domácnost pracuje se vsí), ne práce naprázdno', () => {
    const s = pannerVillage(at(5, 1));
    panner(s).workshop!.placer = null;
    expect(restingCrafters(s, at(5, 2), NO_CRAFTS).get(PANNER)).toBe('no-placer');
    expect(workCrafts(s, at(5, 2), null, NO_CRAFTS)).toEqual([]);
    expect(panner(s).workshop!.activity).toBe('no-placer');
    expect(s.gold).toBeUndefined();
  });
});

describe('rýžování – krajina se zlatonosným potokem (seed 11)', () => {
  let gold: Landscape;
  let placers: readonly { x: number; z: number }[];
  const FROM = { x: 40, z: 0 };
  beforeAll(() => {
    gold = generateAcceptedLandscape(11, undefined, 'gold-stream').landscape;
    placers = goldPlacers(gold);
  });
  /** Chůze z dílny k náplavům po pevných cestách s půdou (na cm). */
  const walks = (s: VillageState): number[] =>
    villageRoadWalk(s, gold)(FROM, placers).map((m) => Math.round(m * 100) / 100);

  it('restingCrafters vybere nejbližší náplav po cestách v sezóně; 1. 4. zahodí placer: null', () => {
    const s = pannerVillage(at(3, 30), FROM);
    const w = walks(s);
    expect(w.every(Number.isFinite)).toBe(true);
    const nearest = w.indexOf(Math.min(...w));
    // mimo sezónu nic nevybírá
    expect(restingCrafters(s, at(3, 31), NO_CRAFTS, 1, null, undefined, gold).get(PANNER)).toBe(
      'resting',
    );
    expect(panner(s).workshop!.placer).toBeUndefined();
    // uprostřed sezóny null zůstává (no-placer), 1. 4. se hledá znovu
    panner(s).workshop!.placer = null;
    expect(restingCrafters(s, at(4, 2), NO_CRAFTS, 1, null, undefined, gold).get(PANNER)).toBe(
      'no-placer',
    );
    expect(panner(s).workshop!.placer).toBeNull();
    expect(restingCrafters(s, at(4, 1), NO_CRAFTS, 1, null, undefined, gold).has(PANNER)).toBe(
      false,
    );
    expect(panner(s).workshop!.placer).toEqual({ index: nearest, walkM: w[nearest] });
  });

  it('workCrafts: pan a placerExhausted v práci dne, zlato do stavu', () => {
    const s = pannerVillage(at(5, 1), FROM);
    const w = walks(s);
    const nearest = w.indexOf(Math.min(...w));
    s.goldPanned = placers.map((_, i) => (i === nearest ? 1_499.9 : 0));
    const resting = restingCrafters(s, at(5, 2), NO_CRAFTS, 1, null, undefined, gold);
    const [day] = workCrafts(s, at(5, 2), null, NO_CRAFTS, 1, resting, gold);
    expect(day).toMatchObject({
      dwellingId: PANNER,
      craft: 'panner',
      producedKg: 0,
      pan: placers[nearest],
      placerExhausted: placers.length - 1,
    });
    expect(panner(s).workshop!.activity).toBe('producing');
    expect(s.goldPanned![nearest]).toBe(PANNING.placerG);
    expect(s.gold).toBeCloseTo(PANNING.placerG - 1_499.9, 9);
  });

  it('ves po dnech: každý náplav vyčerpaný jednou, kronika left n−1…0, pak no-placer; po kouscích = vcelku', () => {
    const start = pannerVillage(at(3, 30), FROM);
    start.goldPanned = placers.map(() => 1_499.9);
    const end = at(4, 1) + placers.length + 1;
    const whole = advanceVillage(start, end, null, gold);
    let pieces = start;
    for (let d = at(3, 31); d <= end; d++) {
      pieces = JSON.parse(JSON.stringify(advanceVillage(pieces, d, null, gold))) as VillageState;
    }
    expect(pieces).toEqual(whole);
    // každý den od 1. 4. jeden náplav (nejbližší se zlatem), poslední zápis left 0
    expect(exhausted(whole)).toEqual(
      placers.map((_, k) => ({ day: at(4, 1) + k, left: placers.length - 1 - k })),
    );
    expect(whole.goldPanned).toEqual(placers.map(() => PANNING.placerG));
    const panned = whole.goldPanned!.reduce((sum, g) => sum + g, 0) - placers.length * 1_499.9;
    expect(whole.gold).toBeCloseTo(panned, 9);
    expect(panner(whole).workshop!.activity).toBe('no-placer');
    expect(panner(whole).workshop!.placer).toBeNull();
  }, 60_000);
});
