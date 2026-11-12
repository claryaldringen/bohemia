import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf, packObstacles } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { NO_PLOT, applyBuildIntent, type BuildIntent } from '../build-intent';
import { LOG_HOUSE_YEAR, dwellingYearReason, isManorType, manorTypeOn } from '../log-house';
import { buildAffordability } from '../costs';
import { checkPlotPlacement } from '../../placement/placement-dwellings';
import { villageManor } from '../../people/manor';
import {
  BETTER_DWELLING,
  DWELLING_FOOTPRINT_M,
  DWELLING_TREES,
  DWELLINGS,
  LOG_HOUSE,
  PLOT_TYPES,
  dwellingBuildLabor,
} from '../../rules';
import type { DwellingPlot, Position, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// log-house.md – Dům, Dvorec od roku 800 (Martin 12. 11. 2026): nadzemní dům (srub) jde stavět
// od 1. 1. 800; dvorec postavený nebo přestavěný od roku 800 je nadzemní srub (`dvorec-srub`).

const LAST_799 = dayIndexOf({ year: 799, month: 12, day: 31 });
const FIRST_800 = dayIndexOf({ year: 800, month: 1, day: 1 });
const HOME: Position = { x: -50, z: -50, rotation: 0 };
const landscape = makeLandscape();
const EMPTY = packObstacles([], 16, 15);
const PLOT: DwellingPlot = { cell: { x: 10, y: 10 }, variant: 'center' };

/** Ves s dostavěnou zemnicí zakladatelů založená dne `day` (dopočítaná do dne předtím), 40 klád. */
function settled(day: number): VillageState {
  const state = withBuiltFirstDwelling(foundVillage({ seed: 4242, day, dwellingPosition: HOME }));
  state.woodLogs = 40;
  return state;
}

function build(state: VillageState, intent: BuildIntent): ReturnType<typeof applyBuildIntent> {
  return applyBuildIntent(state, state.lastDay, landscape, obstaclesOf(landscape), intent);
}

const SRUB: BuildIntent = { kind: 'dwelling', type: 'srub', position: HOME, plot: PLOT };

describe('nadzemní dům od roku 800', () => {
  it('důvod roku jen u srubu do 31. 12. 799', () => {
    expect(LOG_HOUSE.fromYear).toBe(800);
    expect(LOG_HOUSE_YEAR).toBe('Od roku 800');
    expect(dwellingYearReason('srub', LAST_799)).toBe('Od roku 800');
    expect(dwellingYearReason('srub', FIRST_800)).toBeNull();
    expect(dwellingYearReason('polozemnice', LAST_799)).toBeNull();
    expect(dwellingYearReason('polozemnice', FIRST_800)).toBeNull();
    expect(dwellingYearReason('zemnice', 0)).toBeNull();
  });

  it('čísla podle tabulky návrhu', () => {
    expect(DWELLINGS.srub).toMatchObject({
      capacity: 8,
      cost: 300,
      lifespanYears: 35,
      childDeathFactor: 0.7,
      emptyLifespanYears: 12,
    });
    expect(DWELLINGS['dvorec-srub']).toMatchObject({
      capacity: 12,
      cost: 450,
      lifespanYears: 35,
      childDeathFactor: 0.7,
      emptyLifespanYears: 12,
    });
    expect(DWELLING_TREES.srub).toBe(28);
    expect(DWELLING_TREES['dvorec-srub']).toBe(40);
    expect(DWELLING_FOOTPRINT_M.srub).toEqual({ width: 5, depth: 6 });
    expect(DWELLING_FOOTPRINT_M['dvorec-srub']).toEqual({ width: 7, depth: 11 });
    // cena v sobě má kácení blízkého lesa jako u ostatních obydlí
    expect(dwellingBuildLabor('srub') + DWELLING_TREES.srub * 2).toBe(DWELLINGS.srub.cost);
    expect(PLOT_TYPES.srub).toBe(true);
    expect(PLOT_TYPES['dvorec-srub']).toBe(true);
  });

  it('vesničané na srub nepřestavují, dosloužilý srub se přestaví zase na srub', () => {
    expect(BETTER_DWELLING.zemnice).toBe('polozemnice');
    expect(BETTER_DWELLING.polozemnice).toBe('polozemnice');
    expect(BETTER_DWELLING.srub).toBe('srub');
    expect(BETTER_DWELLING['dvorec-srub']).toBe('dvorec-srub');
  });

  it('stavbu srubu v roce 799 odmítne i obejitím tlačítka, v roce 800 začne', () => {
    // ves dopočítaná do 31. 12. 799, resp. do 1. 1. 800 (stavba začíná dnem `lastDay`)
    const before = settled(LAST_799 + 1);
    expect(before.lastDay).toBe(LAST_799);
    expect(buildAffordability(before, 'srub', obstaclesOf(landscape)).affordable).toBe(true);
    expect(build(before, SRUB)).toEqual({ ok: false, reason: 'Od roku 800' });
    const after = settled(FIRST_800 + 1);
    expect(after.lastDay).toBe(FIRST_800);
    const result = build(after, SRUB);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.state.constructions.find(
      (c) => c.kind === 'dwelling' && c.dwellingType === 'srub',
    );
    expect(site).toMatchObject({ dwellingType: 'srub', plot: PLOT });
    expect(site?.wood?.trees).toBe(DWELLING_TREES.srub);
  });

  it('srub stojí na pozemku – bez pozemku ne', () => {
    const result = build(settled(FIRST_800 + 1), {
      kind: 'dwelling',
      type: 'srub',
      position: HOME,
    });
    expect(result).toEqual({ ok: false, reason: NO_PLOT });
  });
});

describe('dvorec od roku 800', () => {
  it('typ dvorce podle dne a co je dvorec', () => {
    expect(manorTypeOn(LAST_799)).toBe('dvorec');
    expect(manorTypeOn(FIRST_800)).toBe('dvorec-srub');
    expect(isManorType('dvorec')).toBe(true);
    expect(isManorType('dvorec-srub')).toBe(true);
    expect(isManorType('srub')).toBe(false);
    expect(isManorType('polozemnice')).toBe(false);
  });

  it('dvorec, který dožil po roce 800, se přestaví na dvorec-srub', () => {
    const day = dayIndexOf({ year: 805, month: 10, day: 1 });
    const s = settled(day);
    const manor = s.dwellings[0]!;
    manor.type = 'dvorec';
    manor.builtDay = day - (DWELLINGS.dvorec.lifespanYears + 1) * 366;
    s.woodLogs = 0;
    const decided = advanceVillage(s, day, null);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild');
    expect(rebuild).toMatchObject({ dwellingId: manor.id, dwellingType: 'dvorec-srub' });
    expect(rebuild?.wood?.trees).toBe(DWELLING_TREES['dvorec-srub']);
    expect(rebuild?.cost).toBe(DWELLINGS['dvorec-srub'].cost);
  });

  it('dvorec přestavěný před rokem 800 zůstane dvorcem', () => {
    const day = dayIndexOf({ year: 790, month: 10, day: 1 });
    const s = settled(day);
    s.dwellings[0]!.builtDay = day - (DWELLINGS.zemnice.lifespanYears + 1) * 366;
    const decided = advanceVillage(s, day, null);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild');
    expect(rebuild).toMatchObject({ dwellingType: 'dvorec' });
  });

  it('ves založená v roce 810 má dvorec rovnou nadzemní – na pozemku se dvorem', () => {
    const founded = dayIndexOf({ year: 810, month: 4, day: 1 });
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day: founded, dwellingPosition: { x: 7.5, z: 7.5, rotation: 0 } }),
    );
    s.dwellings[0]!.builtDay = founded - (DWELLINGS.zemnice.lifespanYears + 1) * 366;
    const decided = advanceVillage(s, s.lastDay + 1, EMPTY, landscape);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild')!;
    expect(rebuild.dwellingType).toBe('dvorec-srub');
    expect(rebuild.plot?.yard).toBeDefined();
    let later = decided;
    for (let i = 0; i < 80 && later.constructions.some((c) => c.kind === 'rebuild'); i++) {
      later = advanceVillage(later, later.lastDay + 30, EMPTY, landscape);
    }
    const manor = villageManor(later)!;
    expect(manor.type).toBe('dvorec-srub');
    expect(manor.plot).toEqual(rebuild.plot);
  });

  it('dvorec se dvorem se po roce 800 přestaví na stejném pozemku – větší půdorys se vejde', () => {
    const plot: DwellingPlot = { cell: { x: 8, y: 8 }, variant: 'center', yard: { x: 8, y: 7 } };
    const check = checkPlotPlacement(landscape, null, 'dvorec-srub', plot, EMPTY);
    expect(check.ok).toBe(true);
    // dům uprostřed políčka 15 m: polovina délky 5,5 m + plot 0,5 m od kraje se vejde
    expect(DWELLING_FOOTPRINT_M['dvorec-srub'].depth / 2).toBeLessThan(15 / 2 - 0.5);
    const day = dayIndexOf({ year: 805, month: 10, day: 1 });
    const s = settled(day);
    const manor = s.dwellings[0]!;
    manor.type = 'dvorec';
    manor.plot = plot;
    manor.position = check.position!;
    manor.builtDay = day - (DWELLINGS.dvorec.lifespanYears + 1) * 366;
    const decided = advanceVillage(s, s.lastDay + 1, EMPTY, landscape);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild')!;
    expect(rebuild.dwellingType).toBe('dvorec-srub');
    // na místě – nový pozemek nehledá
    expect(rebuild.position).toBeNull();
    expect(rebuild.plot).toBeUndefined();
  });
});
