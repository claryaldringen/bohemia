import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../actions';
import { FORTIFICATIONS } from '../rules-fortifications';
import { decideFortRebuilds, fortUpkeep, segmentState } from '../fortification/decay';
import { fortificationCost, fortificationRebuildCost } from '../fortification/cost';
import { segmentIsOld } from '../fortification/life';
import { fortWalls } from '../fortification/walls';
import { squarePoints } from '../fortification/convert';
import {
  finishFortification,
  outlineOf,
  startFortification,
  villageFortifications,
} from '../fortifications';
import { fortSegments } from '../fortification/segments';
import { advanceVillage } from '../simulate';
import type { FortKind, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stáří, přestavba a údržba opevnění (fortifications.md – Životnost a oprava). Krajina 16 × 16
// políček po 15 m; dospělé opevnění se „zestárne“ posunem dne dokončení úseků.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);
const YEAR = 365;

function village(logs = 400): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = logs;
  return s;
}

/** Opevnění `kind` s úseky dokončenými před `ageDays` dny (bez simulace stavby). */
function aged(kind: FortKind, ageDays: number, logs = 400): VillageState {
  const result = startFortification(village(), DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, kind)!,
    kind,
  });
  if (!result.ok) throw new Error(result.reason);
  const s = result.state;
  s.woodLogs = logs;
  s.constructions = s.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(s)[0]!.segments) {
    seg.builtDay = DAY - ageDays;
    seg.state = 1;
  }
  return s;
}

const fortOf = (s: VillageState): ReturnType<typeof villageFortifications>[number] =>
  villageFortifications(s)[0]!;
const rebuilds = (s: VillageState): number =>
  s.constructions.filter((c) => c.kind === 'fortification' && c.fortWork === 'rebuild').length;

describe('stav úseku podle stáří', () => {
  it('plná do konce životnosti, pak rovnoměrně na nulu za 5 let', () => {
    const fort = { kind: 'fence' as const };
    const seg = { builtDay: 0 };
    const life = FORTIFICATIONS.lifeYears.fence * YEAR;
    expect(segmentState(fort, seg, life)).toBe(1);
    expect(segmentState(fort, seg, life + 2.5 * YEAR)).toBeCloseTo(0.5, 6);
    expect(segmentState(fort, seg, life + 5 * YEAR)).toBe(0);
    expect(segmentState({ kind: 'palisade' }, seg, FORTIFICATIONS.lifeYears.palisade * YEAR)).toBe(
      1,
    );
    expect(segmentState({ kind: 'rampart' }, seg, 100 * YEAR)).toBe(1);
  });
});

describe('přestavba dožilých úseků', () => {
  it('plot po 15 letech obyvatelé přestaví sami, staré kůly nic nevrátí', () => {
    const young = aged('fence', 15 * YEAR - 5);
    expect(decideFortRebuilds(young, DAY, landscape, EMPTY)).toHaveLength(0);
    const s = aged('fence', 15 * YEAR);
    const logs = s.woodLogs ?? 0;
    const started = decideFortRebuilds(s, DAY, landscape, EMPTY);
    expect(started).toHaveLength(1);
    expect(started[0]!.fortWork).toBe('rebuild');
    expect(started[0]!.fortSegments).toHaveLength(fortOf(s).segments.length);
    // cena nového plotu (15 klád na 100 m obvodu), nic se nevrací
    expect(logs - (s.woodLogs ?? 0)).toBeGreaterThan(30);
    expect(rebuilds(s)).toBe(1);
  });

  it('palisáda se přestaví po 20 letech, ne po 19; hráčovo opevnění stejně', () => {
    expect(decideFortRebuilds(aged('palisade', 19 * YEAR), DAY, landscape, EMPTY)).toHaveLength(0);
    expect(decideFortRebuilds(aged('palisade', 20 * YEAR), DAY, landscape, EMPTY)).toHaveLength(1);
  });

  it('přestavba dokončí úseky s novým dnem a plným stavem, úsek stojí po celou dobu', () => {
    let s = aged('fence', 15 * YEAR);
    decideFortRebuilds(s, DAY, landscape, EMPTY);
    expect(fortWalls({ size: 16, cellSizeM: 15 }, fortOf(s)).walls.length).toBeGreaterThan(0);
    for (let i = 0; i < 40 && rebuilds(s) > 0; i++) {
      s = advanceVillage(s, s.lastDay + 5, EMPTY, landscape);
    }
    expect(rebuilds(s)).toBe(0);
    for (const seg of fortOf(s).segments) {
      expect(seg.builtDay).toBeGreaterThan(DAY - 1);
      expect(seg.state).toBe(1);
    }
  });

  it('bez dřeva úsek chátrá a na nule je mezera, síť cest ji pustí', () => {
    const s = aged('fence', 15 * YEAR + Math.round(2.5 * YEAR), 0);
    expect(decideFortRebuilds(s, DAY, landscape, EMPTY)).toHaveLength(0);
    expect(fortOf(s).segments[0]!.state).toBeCloseTo(0.5, 2);
    const dead = aged('fence', 20 * YEAR + 1, 0);
    decideFortRebuilds(dead, DAY, landscape, EMPTY);
    expect(fortOf(dead).segments.every((x) => x.state === 0)).toBe(true);
    const geo = { size: 16, cellSizeM: 15 };
    expect(fortWalls(geo, fortOf(dead)).walls).toHaveLength(0);
    expect(fortWalls(geo, fortOf(s)).walls.length).toBeGreaterThan(0);
    // dřevo přišlo – přestaví se
    dead.woodLogs = 400;
    expect(decideFortRebuilds(dead, DAY, landscape, EMPTY)).toHaveLength(1);
  });

  it('průlom se přestaví přednostně (první v plánu)', () => {
    const s = aged('fence', 0);
    fortOf(s).segments[3]!.breachedDay = DAY - 2;
    const started = decideFortRebuilds(s, DAY, landscape, EMPTY);
    expect(started[0]!.fortSegments).toHaveLength(1);
    expect(started[0]!.fortSegments![0]!.index).toBe(3);
  });

  it('průlom z války (schránka) – úsek se stavem 0, přestaví se přednostně a zase stojí', () => {
    const s = aged('fence', 0);
    s.lastDay = DAY;
    const breach = {
      id: 'b1',
      villageId: 'v1',
      day: DAY + 1,
      seq: 1,
      body: { kind: 'fortification-breach' as const, fortificationId: fortOf(s).id, segments: [3] },
    };
    const next = advanceVillage(s, DAY + 1, EMPTY, landscape, [breach]);
    const seg = fortOf(next).segments[3]!;
    expect(seg).toMatchObject({ breachedDay: DAY + 1, state: 0 });
    const work = next.constructions.filter((c) => c.kind === 'fortification');
    expect(work[0]!.fortSegments![0]!.index).toBe(3);
    let later = next;
    for (let i = 0; i < 40 && rebuilds(later) > 0; i++) {
      later = advanceVillage(later, later.lastDay + 5, EMPTY, landscape);
    }
    expect(fortOf(later).segments[3]!.breachedDay).toBeUndefined();
    expect(fortOf(later).segments[3]!.state).toBe(1);
  });

  it('opuštěná ves nepřestavuje', () => {
    const s = aged('fence', 15 * YEAR);
    s.people = [];
    expect(decideFortRebuilds(s, DAY, landscape, EMPTY)).toHaveLength(0);
  });

  it('po kouscích (1, 3, 10 dní + zbytek) dá stejný stav jako vcelku', () => {
    const base = aged('fence', 15 * YEAR - 4);
    base.lastDay = DAY;
    const whole = advanceVillage(structuredClone(base), DAY + 20, EMPTY, landscape);
    let pieces = structuredClone(base);
    for (const step of [1, 3, 10, 6]) {
      pieces = advanceVillage(pieces, pieces.lastDay + step, EMPTY, landscape);
    }
    expect(JSON.stringify(pieces.fortifications)).toBe(JSON.stringify(whole.fortifications));
    expect(JSON.stringify(pieces.constructions)).toBe(JSON.stringify(whole.constructions));
    expect(JSON.stringify(whole.fortifications)).toContain('"builtDay"');
  });
});

describe('údržba hradby po úsecích a přestavba nových druhů', () => {
  const totalLength = (s: VillageState): number =>
    fortSegments(outlineOf(landscape, fortOf(s))!).reduce((sum, x) => sum + x.lengthM, 0);

  it('palisáda s prací na údržbu stárne normálně, bez práce za rok o dva roky', () => {
    const s = aged('palisade', 0);
    const need = fortUpkeep(structuredClone(s), 1000, landscape).used * YEAR;
    // 1 čd na 100 m ročně
    expect(need).toBeCloseTo(totalLength(s) / 100, 6);
    for (let d = 0; d < YEAR; d++) fortUpkeep(s, 1000, landscape);
    expect(fortOf(s).segments.every((x) => x.extraAgeDays === undefined)).toBe(true);
    for (let d = 0; d < YEAR; d++) fortUpkeep(s, 0, landscape);
    const seg = fortOf(s).segments[0]!;
    expect(seg.extraAgeDays).toBeCloseTo(YEAR, 6);
    // o rok po dokončení je hradba stará jako dvouletá
    expect(segmentIsOld(fortOf(s), { ...seg, extraAgeDays: 19 * YEAR }, DAY + YEAR)).toBe(true);
    expect(segmentIsOld(fortOf(s), { ...seg, extraAgeDays: 0 }, DAY + YEAR)).toBe(false);
  });

  it('nedodělek se dělí rovným dílem na všechny díly', () => {
    const s = aged('palisade', 0);
    const need = fortUpkeep(structuredClone(s), 1000, landscape).used;
    fortUpkeep(s, need / 4, landscape);
    for (const seg of fortOf(s).segments) expect(seg.extraAgeDays).toBeCloseTo(0.75, 6);
  });

  it('díl, na kterém běží stavba, se neudržuje a nepřestavuje; ostatní ano', () => {
    const s = aged('fence', 15 * YEAR);
    const first = decideFortRebuilds(s, DAY, landscape, EMPTY)[0]!;
    // stavba pracuje jen na prvním dílu
    first.fortSegments = first.fortSegments!.slice(0, 1);
    const busyIndex = first.fortSegments[0]!.index;
    for (const seg of fortOf(s).segments) seg.state = 1;
    const second = decideFortRebuilds(s, DAY + 1, landscape, EMPTY);
    expect(second).toHaveLength(1);
    const indices = second[0]!.fortSegments!.map((w) => w.index);
    expect(indices).not.toContain(busyIndex);
    expect(indices).toHaveLength(fortOf(s).segments.length - 1);
    fortUpkeep(s, 0, landscape);
    expect(fortOf(s).segments.find((x) => x.index === busyIndex)!.extraAgeDays).toBeUndefined();
  });

  it('roštová dožije za 30 let a přestavba stojí třetinu bez kamene', () => {
    const cost = fortificationRebuildCost('crib', 100);
    const full = fortificationCost('crib', 100);
    expect(cost.stoneM3).toBe(0);
    expect(cost.logs).toBeCloseTo(330 / 3, 6);
    expect(cost.laborManDays).toBeCloseTo((1050 - 100) / 3 - 330 / 3, 6);
    expect(cost.laborManDays).toBeLessThan(full.laborManDays / 2);
    const kind = { kind: 'crib' as const };
    expect(segmentIsOld(kind, { builtDay: 0 }, 30 * YEAR - 1)).toBe(false);
    expect(segmentIsOld(kind, { builtDay: 0 }, 30 * YEAR)).toBe(true);
  });

  it('ochoz se přestaví s palisádou: cena palisády a fošny, násyp zůstane', () => {
    const cost = fortificationRebuildCost('walkway', 100);
    const palisade = fortificationCost('palisade', 100);
    expect(cost.logs).toBeCloseTo(palisade.logs + 10, 6);
    // fošny 2 h na 1 m = 20 čd na 100 m komplet
    expect(cost.laborManDays).toBeCloseTo(palisade.laborManDays + 20 - 10, 6);
    expect(cost.stoneM3).toBe(0);
    expect(fortificationRebuildCost('palisade', 100)).toEqual(palisade);
  });
});

describe('val – údržba a obnova', () => {
  const rampart = (): VillageState => aged('rampart', 0);

  it('s plnou údržbou drží výšku', () => {
    const s = rampart();
    const outline = outlineOf(landscape, fortOf(s))!;
    const meters = fortSegments(outline).reduce((sum, x) => sum + x.lengthM, 0);
    let used = 0;
    for (let d = 0; d < 5 * YEAR; d++) used += fortUpkeep(s, 1000, landscape).used;
    expect(fortOf(s).rampartHeight).toBeUndefined();
    // 2 čd na 100 m ročně
    expect(used).toBeCloseTo((meters / 100) * 2 * 5, 6);
  });

  it('bez údržby má za 50 let výšku 0,5', () => {
    const s = rampart();
    for (let d = 0; d < 50 * YEAR; d++) fortUpkeep(s, 0, landscape);
    expect(fortOf(s).rampartHeight).toBeCloseTo(0.5, 6);
  });

  it('polovina potřebné práce sníží výšku o poloviční tempo', () => {
    const s = rampart();
    const need = fortUpkeep(s, 1000, landscape).used;
    const half = rampart();
    for (let d = 0; d < 50 * YEAR; d++) fortUpkeep(half, need / 2, landscape);
    expect(fortOf(half).rampartHeight).toBeCloseTo(0.75, 6);
  });

  it('pod výškou 0,75 obyvatelé val obnoví za polovinu ceny, po dokončení je zase plný', () => {
    const s = rampart();
    fortOf(s).rampartHeight = 0.74;
    const started = decideFortRebuilds(s, DAY, landscape, EMPTY);
    expect(started).toHaveLength(1);
    expect(started[0]!.fortWork).toBe('restore');
    const full = FORTIFICATIONS.costPer100M.rampart.laborManDays;
    const outline = outlineOf(landscape, fortOf(s))!;
    const meters = fortSegments(outline).reduce((sum, x) => sum + x.lengthM, 0);
    const total = started[0]!.fortSegments!.reduce((sum, w) => sum + w.cost, 0);
    expect(total).toBeCloseTo((full * 0.5 * meters) / 100, 4);
    // další den na opevnění už nic nezačne
    expect(decideFortRebuilds(s, DAY + 1, landscape, EMPTY)).toHaveLength(0);
    started[0]!.done = started[0]!.cost;
    finishFortification(s, started[0]!, DAY + 30);
    expect(fortOf(s).rampartHeight).toBeUndefined();
  });
});

describe('ves bez opevnění', () => {
  it('nic nezměnilo, funkce nic nespotřebují', () => {
    const s = village();
    expect(decideFortRebuilds(s, DAY, landscape, EMPTY)).toHaveLength(0);
    expect(fortUpkeep(s, 5, landscape).used).toBe(0);
  });
});
