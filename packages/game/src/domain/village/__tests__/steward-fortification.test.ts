import { beforeAll, describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
  tileOfWorldPoint,
} from '../../landscape';
import { foundVillage } from '../actions';
import {
  fortificationOutline,
  fortOutlineOf,
  hullOffsetPoints,
  villageThreat,
} from '../fortification';
import { fortificationCore } from '../fortification-proposal';
import { pointInPolygon } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import { startFortification } from '../fortifications';
import { applyInboxDay } from '../inbox';
import { NO_CRAFTS } from '../productivity';
import { STEWARD } from '../rules-steward';
import { advanceVillage } from '../simulate';
import { fortificationStep, extraSteps } from '../steward-extras';
import {
  fortValue,
  refugeNeedM2,
  stewardFortificationFor,
  stewardKgPerManDay,
} from '../steward-fortification';
import { planSettlement } from '../steward-plan';
import { newSteward } from '../steward-state';
import type { StewardContext, StewardMode } from '../steward';
import type { StewardOutlook } from '../steward-outlook';
import type { ThreatSignal, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Krok Opevnění správce (fortifications.md – Správce, Hrozba; steward.md – Rozhodovací pořadí).

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

const OPEN_OUTLOOK: StewardOutlook = {
  laborHa: Infinity,
  seedHa: Infinity,
  landHa: 0,
  bottleneck: 'land',
  lasting: 'land',
  workPerHa: 0,
  landPeople: 0,
  sustainablePeople: 0,
};

function ctxOf(day: number, mode: StewardMode = 'growth'): StewardContext {
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage: NO_CRAFTS,
    mode,
    outlook: OPEN_OUTLOOK,
  };
}

function dayOn(year: number, month: number, d: number): number {
  return Math.ceil(dayIndexOf({ year, month, day: d }) / STEWARD.everyDays) * STEWARD.everyDays;
}

const forts = (s: VillageState): string[] =>
  s.constructions.filter((c) => c.kind === 'fortification').map((c) => c.fortWork ?? '');

describe('steward-fortification – opevnění podle hrozby', () => {
  let grown: VillageState;
  let day: number;
  beforeAll(() => {
    const site = landscape.villageSite;
    const c = tileCenterWorld(landscape, site.x, site.y);
    const start = {
      ...foundVillage({ seed: 4242, day: SEPT, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } }),
      steward: newSteward(SEPT, true),
    };
    let s = advanceVillage(
      planSettlementDone(withBuiltFirstDwelling(start)),
      SEPT + 3 * YEAR,
      obstacles,
      landscape,
    );
    s = planSettlementDone(s);
    s.woodLogs = 5000;
    grown = s;
    day = Math.max(grown.lastDay + 1, dayOn(dateOfDayIndex(grown.lastDay).year + 1, 10, 5));
  }, 120_000);

  function planSettlementDone(state: VillageState): VillageState {
    let s = state;
    for (let k = 0; k < 12 && s.steward?.plan?.stage !== 'done'; k++) {
      s = planSettlement(s, s.lastDay, landscape, obstacles);
    }
    s.commonLaborHistory = Array.from({ length: 30 }, () => 60);
    return s;
  }

  const threatened = (kind: ThreatSignal['kind'] = 'raid-here'): VillageState => {
    const s = structuredClone(grown);
    s.threats = [{ kind, day }];
    return s;
  };

  it('hrozba 0: správce neopevní, ani když zbývá práce', () => {
    const s = structuredClone(grown);
    extraSteps(s, ctxOf(day));
    expect(forts(s)).toHaveLength(0);
    s.threats = [{ kind: 'raid-here', day: 0 }];
    // signál starší než 50 let se nepočítá
    extraSteps(s, ctxOf(day + 60 * YEAR));
    expect(forts(s)).toHaveLength(0);
  });

  it('po signálu „nájezd na tuto ves“ v Růstu i v Obnově postaví opevnění; v Nouzi ne', () => {
    const growth = threatened();
    fortificationStep(growth, ctxOf(day));
    expect(forts(growth)).toEqual(['build']);
    const c = growth.constructions.find((x) => x.kind === 'fortification')!;
    // stavba i opevnění jsou správcovy
    expect(growth.steward!.built).toContain(c.id);
    expect(growth.steward!.built).toContain(c.fortificationId);
    expect(growth.fortifications).toHaveLength(1);
    const recovery = threatened();
    extraSteps(recovery, ctxOf(day, 'recovery'));
    expect(forts(recovery).length).toBeGreaterThanOrEqual(0);
    const emergency = threatened();
    extraSteps(emergency, ctxOf(day, 'emergency'));
    expect(forts(emergency)).toHaveLength(0);
  });

  it('nestaví v žních (červenec, srpen)', () => {
    const s = threatened();
    fortificationStep(s, ctxOf(dayOn(dateOfDayIndex(day).year, 8, 5)));
    expect(forts(s)).toHaveLength(0);
  });

  it('nejlepší druh má kladnou hodnotu přínos × horizont − cena; slabší hrozba druh zmenší', () => {
    const s = threatened();
    const kg = stewardKgPerManDay(s, landscape, obstacles);
    const length = stewardFortificationFor(s, landscape, obstacles, day, 'fence')!.lengthM;
    const input = { lengthM: length, kgPerManDay: kg, years: 25 };
    const fence = fortValue(s, day, 'fence', 1, input);
    const palisade = fortValue(s, day, 'palisade', 1, input);
    expect(fence.gain * 25 - fence.cost).toBeGreaterThan(0);
    // palisáda přinese víc (násobek 2 proti 1,25) a stojí víc
    expect(palisade.gain).toBeGreaterThan(fence.gain);
    expect(palisade.cost).toBeGreaterThan(fence.cost);
    // hrozba 0,001: přínos nepokryje cenu
    const weak = fortValue(s, day, 'fence', 0.001, input);
    expect(weak.gain * 25 - weak.cost).toBeLessThan(0);
    // vylepšení plotu na palisádu počítá jen rozdíl násobků
    const up = fortValue(s, day, 'palisade', 1, { ...input, from: 'fence' });
    expect(up.gain).toBeCloseTo(palisade.gain - fence.gain, 9);
  });

  it('obvod obsahuje obydlí, humna a ohrady, pole ne', () => {
    const s = structuredClone(grown);
    expect(stewardFortificationFor(s, landscape, obstacles, day, 'fence')).not.toBeNull();
    const inside = (line: readonly (readonly [number, number])[], x: number, z: number): boolean =>
      pointInPolygon([x, z], line);
    const ring = (state: VillageState): (readonly [number, number])[] =>
      fortificationOutline(hullOffsetPoints(fortificationCore(state, landscape), 4), 'fence')!
        .polyline;
    for (const d of s.dwellings) expect(inside(ring(s), d.position.x, d.position.z)).toBe(true);
    // ohrada a humno daleko od vsi vstoupí do obvodu, pole ne
    const home = s.dwellings[0]!.position;
    const far = { x: home.x + 60, z: home.z };
    const t = tileOfWorldPoint(landscape, far.x, far.z)!;
    s.pens = [{ id: 7001, cell: t, x: far.x, z: far.z, builtDay: 0, species: 'cattle' }];
    s.threshingFloors = [
      { id: 7002, position: { ...home, x: home.x - 50, rotation: 0 }, builtDay: 0 },
    ];
    const wider = ring(s);
    expect(inside(wider, far.x, far.z)).toBe(true);
    expect(inside(wider, home.x - 50, home.z)).toBe(true);
    // pole daleko od staveb do obvodu nepatří
    const half = (landscape.size * landscape.cellSizeM) / 2;
    expect(inside(wider, half - 5, half - 5)).toBe(false);
  });

  it('útočiště pojme lidi a dobytek + 20 %', () => {
    const s = withThreat(grown);
    const offset = FORTIFICATIONS.bandM.fence + FORTIFICATIONS.proposal.clearanceM;
    const bare = fortificationOutline(
      hullOffsetPoints(fortificationCore(s, landscape), offset),
      'fence',
    )!;
    const cows = Math.ceil(bare.innerAreaM2 / 20);
    s.livestock = {
      herds: { cow: cows, pig: 20, sheep: 40, goat: 0 },
      young: { cow: 0, pig: 0, sheep: 0, goat: 0 },
    };
    let beasts = 0;
    for (const p of s.pens ?? []) beasts += (p.oxen?.length ?? 0) + (p.horses?.length ?? 0);
    beasts += (s.looseOxen?.length ?? 0) + (s.looseHorses?.length ?? 0);
    const need = (s.people.length * 10 + (cows + 0.25 * 60 + beasts) * 20) * 1.2;
    expect(refugeNeedM2(s)).toBeCloseTo(need, 6);
    // holý obvod útočiště nepojme, správce odstup po 5 m zvětší
    expect(bare.innerAreaM2).toBeLessThan(need);
    fortificationStep(s, ctxOf(day));
    const fort = s.fortifications?.[0];
    expect(fort).toBeDefined();
    expect(fort!.points).toBeDefined();
    expect(fortOutlineOf(landscape, fort!)!.innerAreaM2).toBeGreaterThanOrEqual(need);
  });

  function withThreat(s: VillageState): VillageState {
    const c = structuredClone(s);
    c.threats = [{ kind: 'raid-here', day }];
    return c;
  }

  it('hráčovo opevnění správce nemění a vedle něj nestaví', () => {
    const s = threatened();
    const points = stewardFortificationFor(s, landscape, obstacles, day, 'fence')!.points;
    const r = startFortification(s, s.lastDay, landscape, obstacles, { points, kind: 'fence' });
    if (!r.ok) throw new Error(r.reason);
    const player = r.state;
    // dostavěné hráčovo opevnění
    for (const f of player.fortifications!) for (const seg of f.segments) seg.builtDay = 0;
    player.constructions = player.constructions.filter((c) => c.kind !== 'fortification');
    const before = JSON.stringify(player.fortifications);
    fortificationStep(player, ctxOf(day));
    expect(forts(player)).toHaveLength(0);
    expect(JSON.stringify(player.fortifications)).toBe(before);
  });

  it('vlastní plot správce se vylepší na palisádu jen s přínosem rozdílu násobků', () => {
    const s = threatened();
    fortificationStep(s, ctxOf(day));
    const fort = s.fortifications![0]!;
    // dostavěný plot (druh vynutíme – krok si vybírá podle hodnoty)
    fort.kind = 'fence';
    for (const seg of fort.segments) seg.builtDay = 0;
    s.constructions = s.constructions.filter((c) => c.kind !== 'fortification');
    fortificationStep(s, ctxOf(day + STEWARD.everyDays));
    // palisáda proti plotu: přínos roste s hrozbou, vylepšení je stavba téhož opevnění
    expect(s.fortifications).toHaveLength(1);
    const upgrade = s.constructions.find((c) => c.kind === 'fortification');
    expect(upgrade?.fortWork).toBe('upgrade');
    expect(upgrade?.fortificationId).toBe(fort.id);
  });

  it('schránka: threat-signal se zapíše, zdvojí se jen jednou a válka dostane konec', () => {
    const s = structuredClone(grown);
    const ev = (signal: ThreatSignal, seq: number) => ({
      id: `e${seq}`,
      villageId: 'v',
      day: day,
      seq,
      body: { kind: 'threat-signal' as const, signal },
    });
    applyInboxDay(s, day, [
      ev({ kind: 'raid-here', day }, 1),
      ev({ kind: 'raid-here', day }, 2),
      ev({ kind: 'war', day }, 3),
      ev({ kind: 'war', day, endDay: day + 100 }, 4),
    ]);
    expect(s.threats).toEqual([
      { kind: 'raid-here', day },
      { kind: 'war', day, endDay: day + 100 },
    ]);
    expect(villageThreat(s.threats, day)).toBe(1);
  });

  it('po kouscích (1, 3, 10 dní) stejně jako vcelku', { timeout: 120_000 }, () => {
    const start = advanceVillage(structuredClone(grown), day - 1, obstacles, landscape);
    start.threats = [{ kind: 'raid-here', day: start.lastDay }];
    // rozpočet práce nebrání (jinak by stavbu zablokovaly rozdělané stavby)
    start.commonLaborHistory = Array.from({ length: 30 }, () => 5000);
    const to = start.lastDay + 10;
    const whole = advanceVillage(start, to, obstacles, landscape);
    const step = (n: number): VillageState => {
      let s = start;
      while (s.lastDay < to)
        s = advanceVillage(s, Math.min(to, s.lastDay + n), obstacles, landscape);
      return s;
    };
    expect(forts(whole)).toEqual(['build']);
    expect(JSON.stringify(step(1))).toBe(JSON.stringify(whole));
    expect(JSON.stringify(step(3))).toBe(JSON.stringify(whole));
  });
});
