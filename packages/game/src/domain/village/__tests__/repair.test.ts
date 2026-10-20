import { describe, expect, it } from 'vitest';
import { obstaclesOf } from '../../landscape';
import { abandonmentCheck, isAbandoned, structureCondition, visitKey } from '../abandonment';
import { laborDay } from '../labor-report';
import { computePathNetwork, type PathVillage } from '../paths/network';
import {
  cancelRepair,
  fullRepairManDays,
  isRepairFinished,
  repairOf,
  repairedCondition,
  startRepair,
  workRepair,
} from '../repair';
import { STRUCTURE_REPAIR } from '../rules';
import { advanceVillage } from '../simulate';
import { ROTATION_STEP, squareCenter } from '../square-grid';
import type {
  CemeterySquare,
  Construction,
  SacredBuilding,
  SquareGrid,
  VillageState,
} from '../types';
import { LANDSCAPE, house, pathTestTerrain } from './paths-fixtures';
import { NOV1, Y1, cemetery, idol, json, pen, village } from './abandonment-fixtures';

// Oprava staveb, ke kterým se zase chodí (abandonment.md – Oprava; Martin 19. 10. 2026).

const LAYER = obstaclesOf(LANDSCAPE);
const shrine = (id: number, x: number, z: number, builtDay: number): SacredBuilding => ({
  ...idol(id, x, z, builtDay),
  kind: 'shrine',
});

/** Ves s modlou, svatyní, hřbitovem a ohradou – všechno pod plným stavem, ke všemu se chodí. */
function worn(): VillageState {
  const s = village();
  s.sacredBuildings = [
    { ...idol(7, 20, -30, Y1 - 30 * 365), wear: { condition: 0.5 } },
    { ...shrine(8, -60, -60, Y1 - 30 * 365), wear: { condition: 0.2 } },
  ];
  s.cemeteries = [
    cemetery(20, {
      squares: [
        { cell: { x: 14, y: 8 }, x: 67.5, z: -22.5, waterDistanceM: 100 },
        { cell: { x: 14, y: 9 }, x: 67.5, z: -7.5, waterDistanceM: 90 },
        // rozšíření ve stavbě – plot nemá, oprava ho nepočítá
        { cell: { x: 15, y: 8 }, x: 82.5, z: -22.5, waterDistanceM: 80, constructionId: 99 },
      ],
      fenceWear: { condition: 0 },
    }),
  ];
  s.pens = [pen(1, { team: { readyDay: Y1 - 400 }, wear: { condition: 0.6 } })];
  return s;
}

const ALL_VISITED = new Map([
  [visitKey('idol', 7), 1],
  [visitKey('shrine', 8), 1],
  [visitKey('cemetery', 20), 1],
  [visitKey('pen', 1), 1],
]);

describe('cena opravy (STRUCTURE_REPAIR)', () => {
  it('podíl z ceny stavby bez kácení – modla, svatyně, plot hotových čtverců a ohrada', () => {
    const s = worn();
    expect(STRUCTURE_REPAIR.share).toEqual({
      idol: 0.25,
      shrine: 0.25,
      'cemetery-fence': 0.3,
      pen: 0.5,
    });
    // modla 30 čd − kácení dubu 2, svatyně 400 − 3 duby, ohrada 40 − 6 stromů, plot 10 čd/čtverec
    expect(fullRepairManDays(s, { structure: 'idol', id: 7 })).toBeCloseTo(7, 9);
    expect(fullRepairManDays(s, { structure: 'shrine', id: 8 })).toBeCloseTo(98.5, 9);
    expect(fullRepairManDays(s, { structure: 'pen', id: 1 })).toBeCloseTo(14, 9);
    expect(fullRepairManDays(s, { structure: 'cemetery-fence', id: 20 })).toBeCloseTo(6, 9);
    // stavba, která nestojí (padlá modla, druh neodpovídá), opravit nejde
    expect(fullRepairManDays(s, { structure: 'idol', id: 99 })).toBe(0);
    expect(fullRepairManDays(s, { structure: 'shrine', id: 7 })).toBe(0);
  });
});

describe('roční kontrola zakládá a ruší opravy', () => {
  it('navštěvovaná stavba pod plným stavem dostane opravu podle chybějícího stavu', () => {
    const s = worn();
    abandonmentCheck(s, Y1, ALL_VISITED);
    const cost = (c: Construction | undefined): number => c?.cost ?? NaN;
    expect(cost(repairOf(s, { structure: 'idol', id: 7 }))).toBeCloseTo(7 * 0.5, 9);
    expect(cost(repairOf(s, { structure: 'shrine', id: 8 }))).toBeCloseTo(98.5 * 0.8, 9);
    expect(cost(repairOf(s, { structure: 'pen', id: 1 }))).toBeCloseTo(14 * 0.4, 9);
    // spadlý plot se postaví celý znovu
    expect(cost(repairOf(s, { structure: 'cemetery-fence', id: 20 }))).toBeCloseTo(6, 9);
    expect(s.constructions.every((c) => c.kind === 'repair')).toBe(true);
    expect(new Set(s.constructions.map((c) => c.id)).size).toBe(4);
    // druhá kontrola, dokud se opravuje, druhou opravu nezaloží
    abandonmentCheck(s, NOV1(601), ALL_VISITED);
    expect(s.constructions).toHaveLength(4);
  });

  it('celá, opuštěná a dnes padající stavba opravu nedostane', () => {
    const s = village();
    s.sacredBuildings = [
      idol(7, 20, -30, Y1 - 30 * 365),
      { ...idol(9, 60, -120, Y1 - 30 * 365), wear: { condition: 0.5 } },
      // modla, které dnes došel stav – spadne, oprava už nepomůže
      { ...idol(10, -60, -120, Y1 - 30 * 365), wear: { condition: 0.001, abandonedDay: Y1 - 8 } },
    ];
    abandonmentCheck(
      s,
      Y1,
      new Map([
        [visitKey('idol', 7), 1],
        [visitKey('idol', 10), 1],
      ]),
    );
    expect(s.constructions).toEqual([]);
    expect(isAbandoned(s.sacredBuildings[1]!.wear)).toBe(true);
  });

  it('stavbu, kterou znovu opustili, přestanou opravovat – spravené zůstane a chátrá dál', () => {
    const s = worn();
    abandonmentCheck(s, Y1, ALL_VISITED);
    const c = repairOf(s, { structure: 'idol', id: 7 })!;
    workRepair(s, c, c.cost / 2, false);
    expect(s.sacredBuildings![0]!.wear).toEqual({ condition: 0.75 });
    const next = NOV1(601);
    abandonmentCheck(s, next, new Map());
    expect(repairOf(s, { structure: 'idol', id: 7 })).toBeUndefined();
    // ohrada se spřežením opuštěná není – její oprava běží dál
    expect(s.constructions.map((x) => x.repair?.structure)).toEqual(['pen']);
    expect(s.sacredBuildings![0]!.wear).toEqual({ condition: 0.75, abandonedDay: next });
  });
});

describe('práce opravy', () => {
  it('stav roste s prací, po dokončení záznam chátrání zmizí', () => {
    const s = worn();
    startRepair(s, Y1, { structure: 'shrine', id: 8 }, 0.2);
    const c = repairOf(s, { structure: 'shrine', id: 8 })!;
    workRepair(s, c, c.cost / 4, false);
    expect(repairedCondition(c)).toBeCloseTo(0.4, 9);
    expect(s.sacredBuildings![1]!.wear).toEqual({ condition: repairedCondition(c) });
    expect(isRepairFinished(s, c)).toBe(false);
    workRepair(s, c, 0, true);
    expect(isRepairFinished(s, c)).toBe(true);
    // stavba, která přestala stát, oprava skončí bez zápisu
    const pen = repairOf(s, { structure: 'cemetery-fence', id: 20 });
    expect(pen).toBeUndefined();
    startRepair(s, Y1, { structure: 'pen', id: 1 }, 0.6);
    s.pens = [];
    expect(isRepairFinished(s, repairOf(s, { structure: 'pen', id: 1 })!)).toBe(true);
    cancelRepair(s, { structure: 'pen', id: 1 });
    expect(repairOf(s, { structure: 'pen', id: 1 })).toBeUndefined();
  });

  it('simulace: oprava bere společnou práci a kronika zapíše opravenou stavbu', () => {
    const s = worn();
    s.lastDay = Y1;
    abandonmentCheck(s, Y1, ALL_VISITED);
    const after = advanceVillage(s, Y1 + 120, null);
    expect(after.constructions.filter((c) => c.kind === 'repair')).toEqual([]);
    expect(after.sacredBuildings!.map((b) => b.wear)).toEqual([undefined, undefined]);
    expect(after.cemeteries![0]!.fenceWear).toBeUndefined();
    expect(after.pens![0]!.wear).toBeUndefined();
    const repaired = after.chronicle.filter((e) => e.kind === 'structure-repaired');
    expect(repaired.map((e) => ('structure' in e ? e.structure : null)).sort()).toEqual([
      'cemetery-fence',
      'idol',
      'pen',
      'shrine',
    ]);
    // obecné „dostavěno“ se k opravě nepíše
    expect(
      after.chronicle.some(
        (e) => e.kind === 'construction-finished' && e.constructionKind === 'repair',
      ),
    ).toBe(false);
  }, 60_000);

  it('rozdělení práce dne – plot po obvodu hřbitova, ohrada, modla a svatyně u stavby', () => {
    const s = worn();
    abandonmentCheck(s, Y1, ALL_VISITED);
    const constructions = s.constructions.map((c) => ({
      construction: c,
      manDays: 1,
      doneBefore: 0,
      felledBefore: 0,
    }));
    const labor = laborDay(s, Y1, {
      allocation: {
        away: 0,
        carting: 0,
        tasks: {
          reclaim: 0,
          dig: 0,
          sow: 0,
          weed: 0,
          harvest: 0,
          thresh: 0,
          plough: 0,
          mow: 0,
          slaughter: 0,
          'orchard-care': 0,
          'orchard-harvest': 0,
        },
        taskAmounts: [],
        dailyMin: 0,
        eldersDailyMin: 0,
        common: 4,
      },
      repairs: [],
      constructions,
    });
    const shares = labor.shares.filter((x) => x.construction !== undefined);
    expect(shares.map((x) => [x.activity, x.target])).toEqual([
      ['repair', { kind: 'sacred', id: 7 }],
      ['repair', { kind: 'sacred', id: 8 }],
      ['cemetery', { kind: 'cemetery', id: 20 }],
      ['pen', { kind: 'pen', id: 1 }],
    ]);
  });

  it('práce opravy modly je v síti pěšin provoz k modle', () => {
    const v: PathVillage = {
      dwellings: [house(1, 0, 0), house(2, 14, 4)],
      fields: [],
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          { id: 7, kind: 'idol', position: { x: 20, z: -30, rotation: 0 }, built: true },
          { id: 8, kind: 'idol', position: { x: -60, z: -120, rotation: 0 }, built: true },
        ],
      },
      labor: {
        day: 4000,
        month: 11,
        people: { children: 2, adults: 6, elders: 1 },
        shares: [{ target: { kind: 'sacred', id: 8 }, manDays: 2 }],
      },
    };
    const { visits } = computePathNetwork({ village: v, terrain: pathTestTerrain() });
    expect(visits.get(visitKey('idol', 8))).toBeGreaterThan(0);
  });
});

describe('oprava v simulaci s krajinou', () => {
  /** Natočený hřbitov o dvou čtvercích (fields.md – Natočené stavby) se spadlým plotem. */
  function turned(): VillageState {
    const s = village(Y1 - 6);
    const grid: SquareGrid = { x: 60, z: -30, rotation: 2 * ROTATION_STEP };
    const square = (x: number, y: number): CemeterySquare => {
      const center = squareCenter(LANDSCAPE, grid, { x, y });
      return { cell: { x, y }, x: center.x, z: center.z, waterDistanceM: 100 };
    };
    s.cemeteries = [
      cemetery(20, { grid, squares: [square(0, 0), square(1, 0)], fenceWear: { condition: 0 } }),
    ];
    s.sacredBuildings = [{ ...idol(7, 20, -30, Y1 - 30 * 365), wear: { condition: 0.3 } }];
    s.pens = [pen(1, { team: { readyDay: Y1 - 400 }, wear: { condition: 0.6 } })];
    return s;
  }

  it('1. 11. se k nim chodí – opraví se, i natočený hřbitov; nezávisí na kouscích dopočtu', () => {
    const start = turned();
    const end = Y1 + 60;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    expect(whole.cemeteries![0]!.fenceWear).toBeUndefined();
    expect(whole.sacredBuildings![0]!.wear).toBeUndefined();
    expect(whole.pens![0]!.wear).toBeUndefined();
    expect(whole.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'structure-repaired', structure: 'cemetery-fence', id: 20 }),
    );
    expect(whole.constructions.some((c) => c.kind === 'repair')).toBe(false);
    // před kontrolou stav stál (chátrání zastavené, oprava ještě nezačala)
    const before = advanceVillage(start, Y1 - 1, LAYER, LANDSCAPE);
    expect(before.sacredBuildings![0]!.wear).toEqual({ condition: 0.3 });
    expect(structureCondition(before.cemeteries![0]!.fenceWear, 'cemetery-fence', Y1)).toBe(0);
    const steps = [5, 3, 11, 7];
    let chunked = json(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          LAYER,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(json(whole));
  }, 120_000);
});
