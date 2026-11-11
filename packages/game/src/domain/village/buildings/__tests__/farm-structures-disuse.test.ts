import { describe, expect, it } from 'vitest';
import { abandonmentCheck, abandonmentDay } from '../abandonment';
import { demolishStructure, demolitionCost, demolitionOf, finishDemolition } from '../demolition';
import { settleGrainPits } from '../../fields/grain-pits';
import { orchardExpectedYieldKg } from '../orchard';
import { advanceVillage } from '../../core/simulate';
import { abandonStructure, restoreStructure, disuseBlock, STRUCTURE_BUSY } from '../structure-use';
import { builtThreshingFloors, markThreshed } from '../../fields/threshing-floors';
import { builtThreshingFloorCount } from '../../fields/threshing';
import { ABANDONMENT, HUMNO, ORCHARD, THRESHING } from '../../rules';
import type { GrainPit, Orchard, VillageState } from '../../types';
import { Y1, village } from '../../__tests__/abandonment-fixtures';

// Humno, obilná jáma a sad: opustit, vrátit, zbourat a chátrání (demolition.md – Rozhodnutí).

const YEAR = 365.25;
const NO_VISITS = new Map<string, number>();

function ok(r: ReturnType<typeof abandonStructure>): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function farm(): VillageState {
  const s = village(Y1);
  s.threshingFloors = [
    { id: 60, position: { x: 40, z: 40, rotation: 0 }, builtDay: Y1 - 3 * 365 },
    { id: 61, position: { x: 60, z: 40, rotation: 0 }, builtDay: Y1 - 3 * 365 },
  ];
  return s;
}

const pit = (id: number, extra: Partial<GrainPit> = {}): GrainPit => ({
  id,
  x: 50,
  z: 50,
  capacityKg: 1500,
  grainKg: 800,
  state: 'sealed',
  dugDay: Y1 - 365,
  filledDay: Y1 - 100,
  ...extra,
});

const orchard = (): Orchard => ({
  id: 70,
  squares: [
    {
      cell: { x: 3, y: 3 },
      areaM2: 5000,
      distanceM: 40,
      plantingCost: 40,
      plantingDone: 40,
      plantedDay: Y1 - 20 * 365,
    },
    {
      cell: { x: 4, y: 3 },
      areaM2: 5000,
      distanceM: 40,
      plantingCost: 40,
      plantingDone: 40,
      plantedDay: Y1 - 20 * 365,
    },
  ],
});

describe('Humno', () => {
  it('opuštěné humno nemlátí a nepočítá se do kapacity; Vrátit ho vrátí do provozu', () => {
    const s = farm();
    expect(builtThreshingFloorCount(s)).toBe(2);
    const next = ok(abandonStructure(s, Y1, { structure: 'threshing-floor', id: 60 }));
    expect(builtThreshingFloorCount(next)).toBe(1);
    expect(builtThreshingFloors(next).map((f) => f.id)).toEqual([61]);
    expect(next.threshingFloors![0]!.idleSince).toBe(Y1);
    const back = restoreStructure(next, Y1 + 5, { structure: 'threshing-floor', id: 60 });
    if (!back.ok) throw new Error(back.reason);
    expect(builtThreshingFloorCount(back.state)).toBe(2);
    expect(back.state.threshingFloors![0]!.idleSince).toBeUndefined();
  });

  it('rozestavěné humno jde jen zrušit', () => {
    const s = farm();
    s.threshingFloors![0]!.builtDay = null;
    expect(disuseBlock(s, { structure: 'threshing-floor', id: 60 })).toMatch(/Rozestavěnou/);
  });

  it('výmlat označí jen potřebná humna a roční kontrola označení smaže', () => {
    const s = farm();
    markThreshed(s, THRESHING.floorManDaysPerDay * 0.5);
    expect(s.threshingFloors!.map((f) => f.threshed)).toEqual([true, undefined]);
    abandonmentCheck(s, Y1, NO_VISITS);
    expect(s.threshingFloors![0]!.threshed).toBeUndefined();
    expect(s.threshingFloors![0]!.idleSince).toBeUndefined();
    // druhé humno se nemlátilo – chátrá od loňské kontroly
    expect(s.threshingFloors![1]!.idleSince).toBeCloseTo(Y1 - YEAR, 1);
  });

  it('humno bez výmlatu zaroste za 10 let, s výmlatem jednou za rok nikdy', () => {
    const s = farm();
    const fell: string[] = [];
    for (let year = 0; year <= 11; year++) {
      const day = Y1 + Math.round(year * YEAR);
      // první humno se mlátí každý rok, druhé ne
      s.threshingFloors!.find((f) => f.id === 60)!.threshed = true;
      abandonmentCheck(s, day, NO_VISITS);
      for (const e of abandonmentDay(s, day, null)) {
        if (e.kind === 'structure-overgrown') fell.push(`${e.id}@${year}`);
      }
    }
    expect(fell).toEqual(['61@10']);
    expect(s.threshingFloors!.map((f) => f.id)).toEqual([60]);
  });

  it('opuštěné humno zaroste 10 let od pokynu, ne od roční kontroly', () => {
    const s = ok(abandonStructure(farm(), Y1, { structure: 'threshing-floor', id: 60 }));
    const years = ABANDONMENT.overgrowYears['threshing-floor'];
    abandonmentCheck(s, Y1 + 100, NO_VISITS);
    abandonmentDay(s, Y1 + Math.floor(years * YEAR) - 1, null);
    expect(s.threshingFloors!.some((f) => f.id === 60)).toBe(true);
    const events = abandonmentDay(s, Y1 + Math.ceil(years * YEAR), null);
    expect(events).toContainEqual({
      day: Y1 + Math.ceil(years * YEAR),
      kind: 'structure-overgrown',
      structure: 'threshing-floor',
      id: 60,
    });
    expect((s.threshingFloors ?? []).map((f) => f.id)).not.toContain(60);
  });

  it('zbourat: čtvrtina práce humna, žádné klády; po dokončení zmizí', () => {
    const s = farm();
    const ref = { structure: 'threshing-floor', id: 60 } as const;
    expect(demolitionCost(s, ref, Y1)).toEqual({ laborManDays: HUMNO.laborManDays / 4, logs: 0 });
    const r = demolishStructure(s, Y1, ref);
    if (!r.ok) throw new Error(r.reason);
    const c = demolitionOf(r.state, ref)!;
    expect(builtThreshingFloorCount(r.state)).toBe(1);
    const event = finishDemolition(r.state, Y1 + 3, c);
    expect(event).toMatchObject({ kind: 'structure-demolished', id: 60, logs: 0 });
    expect(r.state.threshingFloors!.map((f) => f.id)).toEqual([61]);
  });
});

describe('Obilná jáma', () => {
  it('Opustit vyprázdní jámu: zrno je mimo jámy, zásoby se nemění', () => {
    const s = village(Y1);
    s.grainPits = [pit(80), pit(81, { grainKg: 300 })];
    s.storesKg = 5000;
    const next = ok(abandonStructure(s, Y1, { structure: 'grain-pit', id: 80 }));
    const p = next.grainPits![0]!;
    expect(p).toMatchObject({ grainKg: 0, state: 'empty', disusedDay: Y1 });
    expect(p.filledDay).toBeUndefined();
    expect(next.storesKg).toBe(5000);
  });

  it('opuštěná jáma se po 5 letech zasype, dřív ne', () => {
    const s = village(Y1);
    s.grainPits = [pit(80)];
    const next = ok(abandonStructure(s, Y1, { structure: 'grain-pit', id: 80 }));
    const years = ABANDONMENT.overgrowYears['grain-pit'];
    // mladá jáma by se bez pokynu nezasypala dřív než za GRAIN_PITS.lifeYears
    settleGrainPits(next, Y1 + years * 365 - 1, 0);
    expect(next.grainPits).toHaveLength(1);
    settleGrainPits(next, Y1 + years * 365, 0);
    expect(next.grainPits).toHaveLength(0);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'structure-overgrown', id: 80 });
  });

  it('zbourat: jáma zmizí bez klád', () => {
    const s = village(Y1);
    s.grainPits = [pit(80)];
    const ref = { structure: 'grain-pit', id: 80 } as const;
    const r = demolishStructure(s, Y1, ref);
    if (!r.ok) throw new Error(r.reason);
    finishDemolition(r.state, Y1 + 1, demolitionOf(r.state, ref)!);
    expect(r.state.grainPits).toHaveLength(0);
  });
});

describe('Sad', () => {
  it('opuštěný sad nedá úrodu a nezačne sezónní práci', () => {
    const s = village(Y1);
    s.orchards = [orchard()];
    expect(orchardExpectedYieldKg(s.orchards[0]!, Y1)).toBeGreaterThan(0);
    const next = ok(abandonStructure(s, Y1, { structure: 'orchard', id: 70 }));
    expect(orchardExpectedYieldKg(next.orchards![0]!, Y1)).toBe(0);
    // sklizeň jablek (září–říjen) rozběhne práci jen v sadu, který se používá
    const harvest = Y1 + 320;
    expect(advanceVillage(s, harvest, null).orchardWork?.task).toBe('harvest');
    expect(advanceVillage(next, harvest, null).orchardWork ?? null).toBeNull();
  });

  it('s rozestavěnou výsadbou nejde opustit', () => {
    const s = village(Y1);
    s.orchards = [orchard()];
    s.constructions.push({
      id: 71,
      kind: 'orchard',
      startedDay: Y1,
      cost: 10,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      orchardId: 70,
    });
    expect(disuseBlock(s, { structure: 'orchard', id: 70 })).toBe(STRUCTURE_BUSY);
  });

  it('zbourat = vykácet: čtvrtina výsadby, žádné klády, sad zmizí', () => {
    const s = village(Y1);
    s.orchards = [orchard()];
    const ref = { structure: 'orchard', id: 70 } as const;
    expect(demolitionCost(s, ref, Y1)).toEqual({
      laborManDays: ORCHARD.plantingPerHa * 1 * 0.25,
      logs: 0,
    });
    const r = demolishStructure(s, Y1, ref);
    if (!r.ok) throw new Error(r.reason);
    const event = finishDemolition(r.state, Y1 + 2, demolitionOf(r.state, ref)!);
    expect(event).toMatchObject({ kind: 'structure-demolished', structure: 'orchard', logs: 0 });
    expect(r.state.orchards).toBeUndefined();
    expect(r.state.logStacks ?? []).toHaveLength(0);
  });
});
