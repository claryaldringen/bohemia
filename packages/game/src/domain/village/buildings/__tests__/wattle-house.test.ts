import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { NO_PLOT, applyBuildIntent, type BuildIntent } from '../build-intent';
import { BUILD_COSTS, buildAffordability } from '../costs';
import { decayEmptyDwelling } from '../dwellings';
import {
  HOUSE_TYPES_BEST_FIRST,
  WATTLE_HOUSE_YEAR,
  bestHouseTypeOn,
  dwellingYearReason,
  isHouseType,
} from '../log-house';
import {
  BETTER_DWELLING,
  DWELLING_FOOTPRINT_M,
  DWELLING_QUALITY,
  DWELLING_TREES,
  DWELLINGS,
  PLOT_TYPES,
  WATTLE_HOUSE,
  dwellingBuildLabor,
} from '../../rules';
import type { Dwelling, DwellingPlot, Position, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// log-house.md – Dům s vypletenými stěnami od roku 750 (Martin 14. 11. 2026: „Nadzemní dům
// s vypletenými stěnami může být od roku 750“; čísla v tabulce – „Ano“).

/** Rok obydlí (dwellings.ts – věk v neceločíselných letech). */
const YEAR = 365.25;
const LAST_749 = dayIndexOf({ year: 749, month: 12, day: 31 });
const FIRST_750 = dayIndexOf({ year: 750, month: 1, day: 1 });
const FIRST_800 = dayIndexOf({ year: 800, month: 1, day: 1 });
const HOME: Position = { x: -50, z: -50, rotation: 0 };
const landscape = makeLandscape();
const PLOT: DwellingPlot = { cell: { x: 10, y: 10 }, variant: 'center' };
const WATTLE: BuildIntent = { kind: 'dwelling', type: 'vypleteny', position: HOME, plot: PLOT };

/** Ves s dostavěnou zemnicí zakladatelů založená dne `day` (dopočítaná do dne předtím), 40 klád. */
function settled(day: number): VillageState {
  const state = withBuiltFirstDwelling(foundVillage({ seed: 4242, day, dwellingPosition: HOME }));
  state.woodLogs = 40;
  return state;
}

function build(state: VillageState, intent: BuildIntent): ReturnType<typeof applyBuildIntent> {
  return applyBuildIntent(state, state.lastDay, landscape, obstaclesOf(landscape), intent);
}

describe('vypletený dům od roku 750', () => {
  it('důvod roku do 31. 12. 749, nejlepší nadzemní dům podle roku', () => {
    expect(WATTLE_HOUSE.fromYear).toBe(750);
    expect(WATTLE_HOUSE_YEAR).toBe('Od roku 750');
    expect(dwellingYearReason('vypleteny', LAST_749)).toBe('Od roku 750');
    expect(dwellingYearReason('vypleteny', FIRST_750)).toBeNull();
    expect(dwellingYearReason('srub', FIRST_750)).toBe('Od roku 800');
    expect(bestHouseTypeOn(LAST_749)).toBeNull();
    expect(bestHouseTypeOn(FIRST_750)).toBe('vypleteny');
    expect(bestHouseTypeOn(FIRST_800)).toBe('srub');
    expect(HOUSE_TYPES_BEST_FIRST).toEqual(['srub', 'vypleteny']);
    expect(isHouseType('vypleteny')).toBe(true);
    expect(isHouseType('dvorec-srub')).toBe(false);
  });

  it('čísla podle tabulky návrhu, cena předem jen dřevo', () => {
    expect(DWELLINGS.vypleteny).toMatchObject({
      capacity: 8,
      cost: 260,
      lifespanYears: 25,
      childDeathFactor: 0.75,
      emptyLifespanYears: 10,
    });
    expect(DWELLING_TREES.vypleteny).toBe(14);
    expect(DWELLING_FOOTPRINT_M.vypleteny).toEqual({ width: 5, depth: 6 });
    expect(PLOT_TYPES.vypleteny).toBe(true);
    // cena v sobě má kácení blízkého lesa jako u ostatních obydlí; hlína je jen práce
    expect(dwellingBuildLabor('vypleteny') + DWELLING_TREES.vypleteny * 2).toBe(260);
    expect(BUILD_COSTS.vypleteny).toEqual({
      laborManDays: 260,
      perHa: false,
      upfront: { wood: 14 },
    });
    // pořadí kvality: srub > vypletený dům > polozemnice > zemnice
    expect(DWELLING_QUALITY.srub).toBeGreaterThan(DWELLING_QUALITY.vypleteny);
    expect(DWELLING_QUALITY.vypleteny).toBeGreaterThan(DWELLING_QUALITY.polozemnice);
    expect(DWELLING_QUALITY.polozemnice).toBeGreaterThan(DWELLING_QUALITY.zemnice);
  });

  it('vesničané na něj nepřestavují, dosloužilý se přestaví zase na vypletený dům', () => {
    expect(BETTER_DWELLING.polozemnice).toBe('polozemnice');
    expect(BETTER_DWELLING.vypleteny).toBe('vypleteny');
  });

  it('stavbu v roce 749 odmítne i obejitím tlačítka, v roce 750 začne – 14 stromů', () => {
    const before = settled(LAST_749 + 1);
    expect(before.lastDay).toBe(LAST_749);
    expect(buildAffordability(before, 'vypleteny', obstaclesOf(landscape)).affordable).toBe(true);
    expect(build(before, WATTLE)).toEqual({ ok: false, reason: 'Od roku 750' });
    const result = build(settled(FIRST_750 + 1), WATTLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.state.constructions.find(
      (c) => c.kind === 'dwelling' && c.dwellingType === 'vypleteny',
    );
    expect(site).toMatchObject({ dwellingType: 'vypleteny', plot: PLOT });
    expect(site?.wood?.trees).toBe(14);
    expect(build(settled(FIRST_750 + 1), { ...WATTLE, plot: undefined })).toEqual({
      ok: false,
      reason: NO_PLOT,
    });
  });

  it('prázdný zchátrá za ≈ 10 let (srub za 12, polozemnice za 8)', () => {
    const lastsYears = (type: Dwelling['type']): number => {
      const d: Dwelling = {
        id: 1,
        type,
        builtDay: 0,
        condition: 1,
        position: { x: 0, z: 0, rotation: 0 },
      };
      let day = 0;
      while (d.condition > 0) decayEmptyDwelling(d, ++day);
      return day / YEAR;
    };
    const wattle = lastsYears('vypleteny');
    expect(wattle).toBeGreaterThan(9.5);
    expect(wattle).toBeLessThan(10.5);
    expect(lastsYears('srub')).toBeGreaterThan(wattle);
    expect(lastsYears('polozemnice')).toBeLessThan(wattle);
  });
});
