import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { nearestPlotVariant, plotHousePosition } from '../placement';
import { relocationPlot, withPlots } from '../plots';
import { DWELLINGS, PLOT_RELOCATION_M, PLOT_SNAP_M } from '../rules';
import { advanceVillage } from '../simulate';
import type { Dwelling, Position, VillageState } from '../types';
import { logsFromClearedTrees } from '../wood';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Pozemky starších polozemnic (population.md – Umístění obydlí, Martin 18. 10. 2026). Ruční
// krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m, střed
// (7,5; 7,5). Ves založená zemnicí daleko vlevo dole (−100, −20).

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const landscape = makeLandscape();
const tree = (id: number, x: number, z: number, look: ObstaclePlacement['look'] = 'beech-1') => ({
  id,
  kind: 'tree' as const,
  look,
  x,
  z,
  rotation: 0,
  scale: 1,
});
const layerOf = (placements: ObstaclePlacement[]): ObstacleLayer =>
  packObstacles(
    [...placements].sort((a, b) => a.id - b.id),
    16,
    15,
  );
const EMPTY = layerOf([]);

/** Ves s postavenou první zemnicí (domácnost v ní bydlí). */
function village(obstacles: ObstacleLayer = EMPTY): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles }),
  );
}

/** Přidá hotové obydlí bez pozemku (jako postavené před pozemky); vrátí jeho id. */
function addDwelling(
  state: VillageState,
  position: Position,
  type: Dwelling['type'] = 'polozemnice',
): number {
  const id = state.nextId++;
  state.dwellings.push({ id, type, builtDay: DAY - 400, condition: 1, position });
  return id;
}

const dwelling = (state: VillageState, id: number): Dwelling =>
  state.dwellings.find((d) => d.id === id)!;

describe('nearestPlotVariant – kde na políčku dům stojí', () => {
  const cell = { x: 8, y: 8 };

  it('blízko středu uprostřed, zřetelně v rohu nejbližší roh; do 2 m se dům posune', () => {
    const near = nearestPlotVariant(landscape, cell, { x: 8.3, z: 7, rotation: 1 });
    expect(near.variant).toBe('center');
    expect(near.snapped).toEqual({ x: 7.5, z: 7.5, rotation: 1 });
    const corner = nearestPlotVariant(landscape, cell, { x: 3.9, z: 11.1, rotation: 2 });
    expect(corner.variant).toBe('back-left');
    expect(corner.snapped).toEqual({
      ...plotHousePosition(landscape, { cell, variant: 'back-left' }),
      rotation: 2,
    });
    // daleko od všech variant – dům zůstane, varianta nejbližší
    const far = nearestPlotVariant(landscape, cell, { x: 14, z: 1, rotation: 0 });
    expect(far.variant).toBe('front-right');
    expect(far.snapped).toBeNull();
    const offset = plotHousePosition(landscape, { cell, variant: 'front-right' });
    expect(Math.hypot(offset.x - 14, offset.z - 1)).toBeGreaterThan(PLOT_SNAP_M);
  });
});

describe('withPlots – převod starších polozemnic při načtení vsi', () => {
  it('polozemnice dostane políčko pod středem domu, varianta podle polohy, dům se posune', () => {
    const s = village();
    const near = addDwelling(s, { x: 8.2, z: 6.9, rotation: 0.4 });
    const far = addDwelling(s, { x: 14.1, z: -13.9, rotation: 2 });
    const next = withPlots(s, landscape, EMPTY);
    expect(next.plotsMigrated).toBe(true);
    expect(dwelling(next, near).plot).toEqual({ cell: { x: 8, y: 8 }, variant: 'center' });
    expect(dwelling(next, near).position).toEqual({ x: 7.5, z: 7.5, rotation: 0.4 });
    // dál než 2 m od místa varianty – dům zůstane, kde stojí, i s natočením
    expect(dwelling(next, far).plot).toEqual({ cell: { x: 8, y: 7 }, variant: 'front-right' });
    expect(dwelling(next, far).position).toEqual(dwelling(s, far).position);
    // zemnice pozemek nemá
    expect(next.dwellings.find((d) => d.type === 'zemnice')!.plot).toBeUndefined();
    // vstup se nemění
    expect(dwelling(s, near).plot).toBeUndefined();
  });

  it('překážky na políčku zmizí jako u nového pozemku – strom dá klády, vyhrazený stavbou ne', () => {
    const obstacles = layerOf([tree(901, 2, 13), tree(902, 13, 2)]);
    const s = village(obstacles);
    const id = addDwelling(s, { x: 7.5, z: 7.5, rotation: 0 });
    const logs = s.woodLogs ?? 0;
    const next = withPlots(s, landscape, obstacles);
    expect(dwelling(next, id).plot?.cell).toEqual({ x: 8, y: 8 });
    const cleared = (next.clearedObstacles ?? []).map((c) => c.id);
    expect(cleared).toEqual(expect.arrayContaining([901, 902]));
    expect(next.woodLogs).toBeCloseTo(logs + logsFromClearedTrees(2), 9);
    // rozestavěná první zemnice si oba stromy vyhradila ke kácení – klády z mýcení nedají
    const building = foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles });
    addDwelling(building, { x: 7.5, z: 7.5, rotation: 0 });
    const reserved = withPlots(building, landscape, obstacles);
    expect(reserved.woodLogs ?? 0).toBeCloseTo(building.woodLogs ?? 0, 9);
  });

  it('obsazené políčko: pozemek nedostane – pole, jiné obydlí, posvátný dub, hřbitov, sad, výchoz', () => {
    const at: Position = { x: 7.5, z: 7.5, rotation: 0 };
    const cell = { x: 8, y: 8 };
    const cases: [string, (s: VillageState) => void, ObstacleLayer?][] = [
      [
        'pole',
        (s) => {
          s.parts.push({
            id: 777,
            fieldId: 1,
            areaM2: 225,
            distanceM: 0,
            naturalFertility: 50,
            fertilityShare: 1,
            bonusUntilDay: null,
            state: 'ready',
            sownYears: 0,
            fallowSinceDay: null,
            foundingCost: 0,
            foundingDone: 0,
            surface: 'meadow',
            cell,
          });
        },
      ],
      ['zemnice', (s) => void addDwelling(s, { x: 12, z: 12, rotation: 0 }, 'zemnice')],
      ['jiná stará polozemnice', (s) => void addDwelling(s, { x: 3, z: 3, rotation: 0 })],
      [
        'hřbitov',
        (s) => {
          s.cemeteries = [
            {
              id: 778,
              squares: [{ cell, x: 7.5, z: 7.5, waterDistanceM: 500 }],
              squareSizeM: 15,
              graves: 0,
              builtDay: DAY,
            },
          ];
        },
      ],
      [
        'sad',
        (s) => {
          s.orchards = [
            {
              id: 779,
              squares: [
                {
                  cell,
                  areaM2: 225,
                  distanceM: 0,
                  plantingCost: 0,
                  plantingDone: 0,
                  plantedDay: DAY,
                },
              ],
            },
          ];
        },
      ],
      ['posvátný dub', () => {}, layerOf([{ ...tree(903, 12, 12, 'oak-large-1'), scale: 1.2 }])],
      [
        'skalní výchoz',
        () => {},
        layerOf([
          { id: 904, kind: 'outcrop', look: 'rock-boulder', x: 2, z: 2, rotation: 0, scale: 1 },
        ]),
      ],
    ];
    for (const [name, setup, obstacles = EMPTY] of cases) {
      const s = village(obstacles);
      setup(s);
      const id = addDwelling(s, at);
      const next = withPlots(s, landscape, obstacles);
      expect(dwelling(next, id).plot, name).toBeUndefined();
      expect(dwelling(next, id).position, name).toEqual(at);
      expect(next.plotsMigrated, name).toBe(true);
    }
  });

  it('dvě staré polozemnice na jednom políčku – pozemek nedostane ani jedna', () => {
    const s = village();
    const a = addDwelling(s, { x: 4, z: 7.5, rotation: 0 });
    const b = addDwelling(s, { x: 11, z: 7.5, rotation: 0 });
    const next = withPlots(s, landscape, EMPTY);
    expect(dwelling(next, a).plot).toBeUndefined();
    expect(dwelling(next, b).plot).toBeUndefined();
  });

  it('rozestavěná polozemnice bez pozemku ho dostane taky', () => {
    const s = village();
    s.constructions.push({
      id: s.nextId++,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 10,
      done: 0,
      dwellingType: 'polozemnice',
      position: { x: 22.6, z: 7.6, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    });
    const next = withPlots(s, landscape, EMPTY);
    const site = next.constructions.at(-1)!;
    expect(site.plot).toEqual({ cell: { x: 9, y: 8 }, variant: 'center' });
    expect(site.position).toEqual({ x: 22.5, z: 7.5, rotation: 0 });
  });

  it('idempotentní: převedená ves se už nemění, ani když se políčko později uvolní', () => {
    const s = village();
    const id = addDwelling(s, { x: 7.5, z: 7.5, rotation: 0 });
    const zemnice = addDwelling(s, { x: 12, z: 12, rotation: 0 }, 'zemnice');
    const once = withPlots(s, landscape, EMPTY);
    expect(withPlots(once, landscape, EMPTY)).toBe(once);
    expect(structuredClone(withPlots(structuredClone(once), landscape, EMPTY))).toEqual(once);
    expect(dwelling(once, id).plot).toBeUndefined();
    // zemnice zmizí – políčko je volné, ale převod už proběhl
    const freed = { ...once, dwellings: once.dwellings.filter((d) => d.id !== zemnice) };
    expect(dwelling(withPlots(freed, landscape, EMPTY), id).plot).toBeUndefined();
  });
});

describe('přestavba polozemnice bez pozemku', () => {
  /** Ves, kde domácnost žije ve staré polozemnici na políčku (8, 8) s cizí zemnicí – bez pozemku. */
  function crowded(): { s: VillageState; id: number } {
    const s = village();
    const home = s.dwellings[0]!;
    home.type = 'polozemnice';
    home.position = { x: 7.5, z: 7.5, rotation: 0 };
    home.builtDay = DAY - (DWELLINGS.polozemnice.lifespanYears + 1) * 366; // dožila – hned se přestaví
    addDwelling(s, { x: 12.5, z: 12.5, rotation: 0 }, 'zemnice');
    return { s: withPlots(s, landscape, EMPTY), id: home.id };
  }

  it('převod ji nechá bez pozemku; přestavba ji postaví na nejbližším volném políčku', () => {
    const { s, id } = crowded();
    expect(dwelling(s, id).plot).toBeUndefined();
    const decided = advanceVillage(s, s.lastDay + 1, EMPTY, landscape);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild')!;
    expect(rebuild).toBeDefined();
    expect(rebuild.plot).toBeDefined();
    const cell = rebuild.plot!.cell;
    expect(Math.abs(cell.x - 8) + Math.abs(cell.y - 8)).toBe(1);
    expect(rebuild.position).toEqual(plotHousePosition(landscape, rebuild.plot!));
    // dokud se staví, domácnost bydlí ve starém domě
    expect(dwelling(decided, id).plot).toBeUndefined();
    let later = decided;
    for (let i = 0; i < 40 && later.constructions.some((c) => c.kind === 'rebuild'); i++) {
      later = advanceVillage(later, later.lastDay + 30, EMPTY, landscape);
    }
    expect(later.constructions.some((c) => c.kind === 'rebuild')).toBe(false);
    expect(dwelling(later, id).plot).toEqual(rebuild.plot);
    expect(dwelling(later, id).position).toEqual(rebuild.position);
  });

  it('nezávisí na kouscích dopočtu', () => {
    const { s } = crowded();
    const end = s.lastDay + 400;
    const whole = advanceVillage(s, end, EMPTY, landscape);
    let parts = s;
    for (const step of [1, 37, 120, 400]) {
      parts = advanceVillage(parts, Math.min(end, s.lastDay + step), EMPTY, landscape);
    }
    expect(parts).toEqual(whole);
    expect(whole.dwellings.find((d) => d.type === 'polozemnice')?.plot).toBeDefined();
  });

  it('bez krajiny (testy, měření) se přestaví na místě; bez volného políčka do 50 m taky', () => {
    const { s, id } = crowded();
    const inPlace = advanceVillage(s, s.lastDay + 1, EMPTY);
    const rebuild = inPlace.constructions.find((c) => c.kind === 'rebuild')!;
    expect(rebuild.plot).toBeUndefined();
    expect(rebuild.position).toBeNull();
    // všude kolem les – volné políčko pro pozemek není
    const forest = makeLandscape({ surface: (x, y) => (x === 8 && y === 8 ? 'meadow' : 'forest') });
    expect(relocationPlot(s, forest, EMPTY, dwelling(s, id), 'polozemnice', s.lastDay)).toBeNull();
    const none = advanceVillage(s, s.lastDay + 1, EMPTY, forest);
    expect(none.constructions.find((c) => c.kind === 'rebuild')!.plot).toBeUndefined();
    expect(PLOT_RELOCATION_M).toBe(50);
  });
});
