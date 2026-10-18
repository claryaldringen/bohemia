import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../actions';
import { isManor, keepManor, villageManor, villageManorId, withManor } from '../manor';
import { checkPlotPlacement, dwellingPlot, plotHousePosition, yardRotation } from '../placement';
import { plotCells } from '../plot-cells';
import { copyPlot, relocationPlot } from '../plots';
import { DWELLINGS, DWELLING_TREES, dwellingBuildLabor } from '../rules';
import { advanceVillage } from '../simulate';
import type { Dwelling, Position, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Dvorec vojvody (trade.md – Dvorec vojvody): první zemnice zakladatelů, ve starší vsi nejstarší
// obydlí; dožilý dvorec se přestaví na typ `dvorec` (kapacita 10, cena a dřevo polozemnice × 1,5)
// na pozemku dvou políček – dům a dvůr.

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const landscape = makeLandscape();
const EMPTY = packObstacles([], 16, 15);

function village(): VillageState {
  return withBuiltFirstDwelling(foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME }));
}

function addDwelling(state: VillageState, builtDay: number, extra: Partial<Dwelling> = {}): number {
  const id = state.nextId++;
  state.dwellings.push({
    id,
    type: 'polozemnice',
    builtDay,
    condition: 1,
    position: { x: 40, z: 40, rotation: 0 },
    ...extra,
  });
  return id;
}

describe('kdo je dvorec', () => {
  it('v nové vsi první zemnice zakladatelů – i dokud se staví', () => {
    const founded = foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME });
    expect(founded.manorId).toBe(1);
    expect(villageManorId(founded)).toBe(1);
    // zemnice se teprve staví – dvorec ještě nestojí
    expect(villageManor(founded)).toBeNull();
    const built = withBuiltFirstDwelling(founded);
    expect(villageManor(built)?.id).toBe(1);
    expect(isManor(built, 1)).toBe(true);
  });

  it('ve starší vsi bez údaje nejstarší obydlí (dílna až nakonec), deterministicky', () => {
    const s = village();
    delete s.manorId;
    s.dwellings[0]!.builtDay = DAY - 10;
    const older = addDwelling(s, DAY - 400);
    const workshop = addDwelling(s, DAY - 900, {
      workshop: { craft: 'potter', felling: null, fuelKg: 0, activity: 'empty' },
    });
    expect(villageManorId(s)).toBe(older);
    expect(villageManorId(s)).not.toBe(workshop);
    const migrated = withManor(s);
    expect(migrated.manorId).toBe(older);
    expect(s.manorId).toBeUndefined();
    // převedená ves se vrací beze změny
    expect(withManor(migrated)).toBe(migrated);
  });

  it('po zániku dvorce se dvorcem stane nejstarší obydlí (keepManor)', () => {
    const s = village();
    const other = addDwelling(s, DAY - 50);
    s.dwellings = s.dwellings.filter((d) => d.id !== 1);
    keepManor(s);
    expect(s.manorId).toBe(other);
    s.dwellings = [];
    keepManor(s);
    expect(s.manorId).toBeUndefined();
  });
});

describe('přestavba dvorce', () => {
  it('dožilý dvorec obyvatelé přestaví na dvorec – cena a dřevo polozemnice × 1,5', () => {
    expect(DWELLINGS.dvorec.capacity).toBe(10);
    expect(DWELLINGS.dvorec.cost).toBe(DWELLINGS.polozemnice.cost * 1.5);
    expect(DWELLING_TREES.dvorec).toBe(DWELLING_TREES.polozemnice * 1.5);
    const s = village();
    s.dwellings[0]!.builtDay = DAY - (DWELLINGS.zemnice.lifespanYears + 1) * 366;
    s.woodLogs = 0;
    const decided = advanceVillage(s, DAY, null);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild');
    expect(rebuild).toMatchObject({ dwellingId: 1, dwellingType: 'dvorec' });
    expect(rebuild?.wood?.trees).toBe(DWELLING_TREES.dvorec);
    // kácení bez polohy (testy) za cenu blízkého lesa – celkem cena dvorce
    expect(rebuild?.cost).toBe(dwellingBuildLabor('dvorec') + DWELLING_TREES.dvorec * 2);
    expect(rebuild?.cost).toBe(DWELLINGS.dvorec.cost);
    expect(decided.chronicle).toContainEqual({
      day: DAY,
      kind: 'rebuild-decided',
      dwellingId: 1,
      type: 'dvorec',
    });
  });

  it('s krajinou na novém pozemku dvou políček; po dostavění dvorec s dvorem', () => {
    const s = village();
    s.dwellings[0]!.position = { x: 7.5, z: 7.5, rotation: 0 };
    s.dwellings[0]!.builtDay = DAY - (DWELLINGS.zemnice.lifespanYears + 1) * 366;
    const decided = advanceVillage(s, s.lastDay + 1, EMPTY, landscape);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild')!;
    expect(rebuild.dwellingType).toBe('dvorec');
    expect(rebuild.plot?.yard).toBeDefined();
    expect(rebuild.position).toEqual(plotHousePosition(landscape, rebuild.plot!));
    let later = decided;
    for (let i = 0; i < 80 && later.constructions.some((c) => c.kind === 'rebuild'); i++) {
      later = advanceVillage(later, later.lastDay + 30, EMPTY, landscape);
    }
    const manor = villageManor(later)!;
    expect(manor.type).toBe('dvorec');
    expect(manor.plot).toEqual(rebuild.plot);
    expect(later.manorId).toBe(1);
  });
});

describe('pozemek dvorce', () => {
  const cell = { x: 8, y: 8 };

  it('dům uprostřed políčka vchodem ke dvoru', () => {
    expect(yardRotation(cell, { x: 8, y: 7 })).toBeCloseTo(Math.PI);
    expect(yardRotation(cell, { x: 8, y: 9 })).toBe(0);
    expect(yardRotation(cell, { x: 9, y: 8 })).toBeCloseTo(Math.PI / 2);
    expect(yardRotation(cell, { x: 7, y: 8 })).toBeCloseTo(-Math.PI / 2);
    const plot = { cell, variant: 'center' as const, yard: { x: 9, y: 8 } };
    expect(plotHousePosition(landscape, plot)).toEqual({ x: 7.5, z: 7.5, rotation: Math.PI / 2 });
    expect(plotCells(plot)).toEqual([cell, { x: 9, y: 8 }]);
    // pozemek zabírá obě políčka
    expect(
      dwellingPlot(landscape, { type: 'dvorec', position: { x: 7.5, z: 7.5, rotation: 0 }, plot }),
    ).toHaveLength(3);
    expect(copyPlot(plot)).toEqual(plot);
    expect(copyPlot(plot).yard).not.toBe(plot.yard);
  });

  it('dvorec chce dvůr vedle domu; polozemnice dvůr mít nesmí', () => {
    const ok = checkPlotPlacement(
      landscape,
      null,
      'dvorec',
      {
        cell,
        variant: 'center',
        yard: { x: 8, y: 7 },
      },
      EMPTY,
    );
    expect(ok.ok).toBe(true);
    expect(
      checkPlotPlacement(landscape, null, 'dvorec', { cell, variant: 'center' }, EMPTY).ok,
    ).toBe(false);
    expect(
      checkPlotPlacement(
        landscape,
        null,
        'dvorec',
        { cell, variant: 'center', yard: { x: 10, y: 8 } },
        EMPTY,
      ).ok,
    ).toBe(false);
    expect(
      checkPlotPlacement(
        landscape,
        null,
        'polozemnice',
        { cell, variant: 'center', yard: { x: 8, y: 7 } },
        EMPTY,
      ).ok,
    ).toBe(false);
  });

  it('přestavba hledá nejbližší dvě volná políčka (dvůr napřed vpředu)', () => {
    const s = village();
    const site = relocationPlot(
      s,
      landscape,
      EMPTY,
      { id: 999, position: { x: 7.5, z: 7.5, rotation: 0 } },
      'dvorec',
      DAY,
    );
    expect(site?.plot).toEqual({ cell, variant: 'center', yard: { x: 8, y: 7 } });
    expect(site?.position.rotation).toBeCloseTo(Math.PI);
  });
});
