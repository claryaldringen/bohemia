import { beforeAll, describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { foundVillage } from '../actions';
import { bufferFill } from '../field-food';
import { NO_CRAFTS } from '../productivity';
import { STEWARD } from '../rules-steward';
import { advanceVillage } from '../simulate';
import { fieldSowingTargets } from '../simulate-plan';
import { planSettlement } from '../steward-plan';
import { newSteward } from '../steward-state';
import { extraSteps, roadStep, sacredStep } from '../steward-extras';
import type { StewardContext, StewardMode } from '../steward';
import type { Road, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Kroky 5 až 10 dne správce (steward.md – Ostatní stavby): hřbitov, humno, ohrady, sad, posvátná
// místa a cesty – spouštěče, okna roku, režimy a sdílený rozpočet práce.

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

function village(day: number): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, true) };
}

/** Den správce v kalendářním dni (nejbližší dělitelný `everyDays` po `y. m. d.`). */
function dayOn(year: number, month: number, d: number): number {
  return Math.ceil(dayIndexOf({ year, month, day: d }) / STEWARD.everyDays) * STEWARD.everyDays;
}

function ctxOf(day: number, mode: StewardMode = 'growth'): StewardContext {
  return { day, date: dateOfDayIndex(day), landscape, obstacles, coverage: NO_CRAFTS, mode };
}

/** Ves dopočítaná do dne `day` s hotovým plánem; volná práce štědrá (rozpočet práce nebrání). */
function planned(state: VillageState): VillageState {
  let s = state;
  for (let k = 0; k < 12 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  s.commonLaborHistory = Array.from({ length: 30 }, () => 60);
  return s;
}

const kinds = (s: VillageState): string[] => s.constructions.map((c) => c.kind);

describe('steward-extras – hřbitov', () => {
  it('po první zemnici hned (i v Nouzi); bez zemnice ne', () => {
    const young = planned(withBuiltFirstDwelling(village(SEPT)));
    for (const mode of ['emergency', 'recovery', 'growth'] as const) {
      const s = structuredClone(young);
      extraSteps(s, ctxOf(SEPT, mode));
      expect(kinds(s)).toContain('cemetery');
      expect(s.steward?.built).toContain(s.constructions.find((c) => c.kind === 'cemetery')!.id);
    }
    const none = planned(village(SEPT));
    extraSteps(none, ctxOf(SEPT));
    expect(kinds(none)).not.toContain('cemetery');
  });

  it('rozšíření o čtverec, až když volná místa nestačí na graveYears; v Nouzi ne', () => {
    let s = planned(withBuiltFirstDwelling(village(SEPT)));
    extraSteps(s, ctxOf(SEPT));
    s = advanceVillage(s, SEPT + 80, obstacles, landscape);
    const cem = s.cemeteries?.[0];
    expect(cem?.builtDay).not.toBeNull();
    const done = planned(s);
    const cemeteries = (x: VillageState): number =>
      x.constructions.filter((c) => c.kind === 'cemetery').length;
    extraSteps(done, ctxOf(done.lastDay + 1));
    expect(cemeteries(done)).toBe(0);
    // místa dochází
    const full = structuredClone(done);
    full.cemeteries![0]!.graves = full.cemeteries![0]!.squares.length * 56;
    const emergency = structuredClone(full);
    extraSteps(emergency, ctxOf(done.lastDay + 1, 'emergency'));
    expect(cemeteries(emergency)).toBe(0);
    extraSteps(full, ctxOf(done.lastDay + 1));
    expect(cemeteries(full)).toBe(1);
  });
});

describe('steward-extras – humno, ohrady, posvátná místa a cesty', () => {
  let grown: VillageState;
  beforeAll(() => {
    grown = advanceVillage(
      planned(withBuiltFirstDwelling(village(SEPT))),
      SEPT + 3 * YEAR,
      obstacles,
      landscape,
    );
    grown = planned(grown);
  }, 120_000);

  /** Příští den správce v daném kalendářním měsíci po stavu `grown`. */
  const at = (month: number, d = 5): number => {
    const year = dateOfDayIndex(grown.lastDay).year + 1;
    return Math.max(grown.lastDay + 1, dayOn(year, month, d));
  };

  it('humno: v Růstu i Obnově před žněmi; ne v Nouzi, ne po 31. 7., ne s humnem', () => {
    expect(grown.parts.length).toBeGreaterThan(0);
    const run = (month: number, mode: StewardMode): string[] => {
      const s = structuredClone(grown);
      s.threshingFloors = [];
      s.constructions = s.constructions.filter((c) => c.kind !== 'threshing-floor');
      extraSteps(s, ctxOf(at(month), mode));
      return kinds(s);
    };
    expect(run(4, 'growth')).toContain('threshing-floor');
    expect(run(4, 'recovery')).toContain('threshing-floor');
    expect(run(4, 'emergency')).not.toContain('threshing-floor');
    expect(run(8, 'growth')).not.toContain('threshing-floor');
  });

  it('rozpočet práce je sdílený – bez volné práce nestaví nic (kromě prvního hřbitova)', () => {
    const s = structuredClone(grown);
    s.threshingFloors = [];
    s.commonLaborHistory = [];
    const before = s.constructions.length;
    extraSteps(s, ctxOf(at(4)));
    expect(s.constructions.length).toBe(before);
  });

  it('ohrada skotu pro plné stádo; mimo okno (žně) ne', () => {
    const base = structuredClone(grown);
    base.pens = [];
    base.livestock = {
      ...(base.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
      herds: { sheep: 0, goat: 0, pig: 0, cow: 4 },
    } as NonNullable<VillageState['livestock']>;
    const spring = structuredClone(base);
    extraSteps(spring, ctxOf(at(3)));
    expect(spring.constructions.some((c) => c.kind === 'pen')).toBe(true);
    const harvest = structuredClone(base);
    extraSteps(harvest, ctxOf(at(8)));
    expect(harvest.constructions.some((c) => c.kind === 'pen')).toBe(false);
  });

  it('modla jen pod hranicí štěstí a v Obnově ano, v Nouzi ne', () => {
    const low = structuredClone(grown);
    low.happiness = {
      ...(low.happiness ?? { value: 50 }),
      value: STEWARD.happinessFloor - 20,
    } as never;
    const ctx = ctxOf(at(10));
    const growth = structuredClone(low);
    sacredStep(growth, ctx);
    const happy = structuredClone(grown);
    happy.happiness = {
      ...(happy.happiness ?? { value: 50 }),
      value: STEWARD.happinessFloor + 5,
    } as never;
    sacredStep(happy, ctx);
    expect(kinds(happy)).not.toContain('idol');
    const emergency = structuredClone(low);
    extraSteps(emergency, ctxOf(ctx.day, 'emergency'));
    expect(kinds(emergency)).not.toContain('idol');
    expect(kinds(growth).filter((k) => k === 'idol')).toHaveLength(1);
    const recovery = structuredClone(low);
    extraSteps(recovery, ctxOf(ctx.day, 'recovery'));
    expect(kinds(recovery)).toContain('idol');
  });

  it('cesty: vylepšení jen v Růstu, v okně roku a při dost velkém provozu', () => {
    const roads: Road[] = (grown.roads?.roads ?? []).filter((r) => r.grade === 'trodden');
    expect(roads.length).toBeGreaterThan(0);
    const s = structuredClone(grown);
    for (const r of s.roads!.roads) r.traffic = [200];
    const growth = structuredClone(s);
    roadStep(growth, ctxOf(at(11)));
    const recovery = structuredClone(s);
    extraSteps(recovery, ctxOf(at(11), 'recovery'));
    expect(kinds(recovery)).not.toContain('road');
    const spring = structuredClone(s);
    roadStep(spring, ctxOf(at(4)));
    expect(kinds(spring)).not.toContain('road');
    const quiet = structuredClone(s);
    for (const r of quiet.roads!.roads) r.traffic = [0];
    roadStep(quiet, ctxOf(at(11)));
    expect(kinds(quiet)).not.toContain('road');
    expect(kinds(growth).filter((k) => k === 'road')).toHaveLength(1);
    const road = growth.constructions.find((c) => c.kind === 'road')!;
    expect(growth.steward?.built).toContain(road.id);
  });

  it('zemská stezka až od trailPeople lidí', () => {
    const s = structuredClone(grown);
    roadStep(s, ctxOf(at(11)));
    expect(s.trails ?? []).toHaveLength(0);
  });

  it('pojistka: bufferFill mimo Nouzi (hlídá spuštění testu)', () => {
    expect(bufferFill(fieldSowingTargets(grown, grown.lastDay, NO_CRAFTS))).toBeGreaterThanOrEqual(
      0,
    );
  });
});
