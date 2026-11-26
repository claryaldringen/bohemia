import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundVillage, startWorkshop } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { applyBuildIntent, type BuildIntent } from '../../buildings/build-intent';
import { BUILD_COSTS, workshopBuildCost, workshopCosts } from '../../buildings/costs';
import { PLAIN_SHAPE } from '../../buildings/dwelling-shape';
import type { HouseType } from '../../buildings/log-house';
import { checkWorkshopPlacement } from '../../placement/placement';
import {
  CRAFTS,
  DWELLINGS,
  DWELLING_TREES,
  WORKSHOP_SIDE_M,
  workshopBuildLabor,
  workshopCost,
  workshopShelter,
  workshopTrees,
} from '../../rules';
import type { Craft, Person, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';
import { newWorkshop, workshopFootprints } from '../crafts';

// workshops.md – Nadzemní dílna: vypletená od roku 750, roubená od roku 800 (dům + přístřešek
// u boční stěny); dnešní dílny před rokem 750 beze změny.

const LAST_749 = dayIndexOf({ year: 749, month: 12, day: 31 });
const FIRST_750 = dayIndexOf({ year: 750, month: 1, day: 1 });
const LAST_799 = dayIndexOf({ year: 799, month: 12, day: 31 });
const FIRST_800 = dayIndexOf({ year: 800, month: 1, day: 1 });
const YEAR = 365.25;
const HOME = { x: -50, z: -50, rotation: 0 };
const SITE = { x: 0, z: 0, rotation: 0 };
const landscape = makeLandscape();

const person = (id: number, years: number, dwellingId: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

/** Ves s dostavěnou zemnicí a 60 kládami založená dne `day` (dopočítaná do dne předtím). */
function settled(day: number): VillageState {
  const state = withBuiltFirstDwelling(foundVillage({ seed: 4242, day, dwellingPosition: HOME }));
  state.woodLogs = 60;
  return state;
}

const intent = (craft: Craft, type?: HouseType): BuildIntent => ({
  kind: 'workshop',
  craft,
  position: SITE,
  ...(type ? { type } : {}),
});

function build(state: VillageState, i: BuildIntent): ReturnType<typeof applyBuildIntent> {
  return applyBuildIntent(state, state.lastDay, landscape, obstaclesOf(landscape), i);
}

/** Bounding box rohů obdélníku. */
function bounds(corners: readonly (readonly [number, number])[]): number[] {
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map(
    (n) => Math.round(n * 1000) / 1000,
  );
}

describe('ceny nadzemní dílny (workshops.md – Rozhodnutí 2)', () => {
  it('přirážka dílny a dnešní ceny beze změny', () => {
    expect(workshopShelter('smith')).toEqual({ manDays: 66, trees: 5 });
    expect(workshopShelter('potter')).toEqual({ manDays: 66, trees: 5 });
    expect(workshopShelter('carpenter')).toEqual({ manDays: 66, trees: 5 });
    expect(workshopShelter('burner')).toEqual({ manDays: 0, trees: 0 });
    expect(workshopCost('smith')).toBe(286);
    expect(workshopTrees('smith')).toBe(23);
    expect(workshopCost('burner')).toBe(60);
    expect(workshopTrees('burner')).toBe(7);
    expect(workshopCost('smith', 'polozemnice')).toBe(286);
  });

  it('vypletená a roubená dílna podle tabulky', () => {
    for (const craft of ['potter', 'smith', 'carpenter'] as const) {
      expect(workshopCost(craft, 'vypleteny')).toBe(326);
      expect(workshopTrees(craft, 'vypleteny')).toBe(19);
      expect(workshopCost(craft, 'srub')).toBe(366);
      expect(workshopTrees(craft, 'srub')).toBe(33);
    }
    expect(workshopCost('burner', 'vypleteny')).toBe(DWELLINGS.vypleteny.cost);
    expect(workshopTrees('burner', 'vypleteny')).toBe(DWELLING_TREES.vypleteny);
    expect(workshopCost('burner', 'srub')).toBe(300);
    expect(workshopTrees('burner', 'srub')).toBe(28);
    expect(workshopBuildLabor('carpenter', 'srub')).toBe(300);
    expect(workshopBuildLabor('smith', 'vypleteny')).toBe(288);
    expect(workshopBuildLabor('burner', 'vypleteny')).toBe(232);
    expect(workshopBuildLabor('burner', 'srub')).toBe(244);
  });

  it('workshopBuildCost a workshopCosts nahradí jen cenu dílny', () => {
    expect(workshopBuildCost('smith')).toEqual(BUILD_COSTS.smith);
    expect(workshopBuildCost('smith', 'vypleteny')).toEqual({
      laborManDays: 326,
      perHa: false,
      upfront: { wood: 19 },
    });
    const costs = workshopCosts('smith', 'srub');
    expect(costs.smith.upfront).toEqual({ wood: 33 });
    expect(costs.potter).toEqual(BUILD_COSTS.potter);
    expect(WORKSHOP_SIDE_M).toEqual({
      potter: 3.2,
      smith: 3.2,
      carpenter: 3.2,
      burner: 2,
      panner: 2,
      jeweller: 3.2,
      minter: 3.2,
    });
    expect(CRAFTS).toHaveLength(7);
  });
});

describe('půdorys nadzemní dílny', () => {
  it('dům rozšířený o přístřešek na +x', () => {
    const [straight] = workshopFootprints('smith', SITE, PLAIN_SHAPE, 'srub');
    expect(workshopFootprints('smith', SITE, PLAIN_SHAPE, 'srub')).toHaveLength(1);
    expect(bounds(straight!)).toEqual([-2.5, 5.7, -3, 3]);
    const burner = workshopFootprints('burner', SITE, PLAIN_SHAPE, 'vypleteny')[0]!;
    expect(bounds(burner)).toEqual([-2.5, 4.5, -3, 3]);
  });

  it('dnešní dílna na polozemnici zůstane (přístřešek vpředu)', () => {
    const [today] = workshopFootprints('smith', SITE, PLAIN_SHAPE, 'polozemnice');
    expect(bounds(today!)).toEqual([-2.5, 2.5, -2.5, 5.7]);
  });

  it('kontrola umístění bere půdorys podle typu (přístřešek u stěny)', () => {
    const land = makeLandscape();
    expect(checkWorkshopPlacement(land, null, 'smith', SITE, undefined, 'srub').ok).toBe(true);
    expect(checkWorkshopPlacement(land, null, 'smith', SITE).ok).toBe(true);
  });
});

describe('stavba nadzemní dílny', () => {
  it('rok varianty hlídá i obejití tlačítka, neplatný typ vstup odmítne', () => {
    const before = settled(LAST_749 + 1);
    expect(before.lastDay).toBe(LAST_749);
    expect(build(before, intent('smith', 'vypleteny'))).toEqual({
      ok: false,
      reason: 'Od roku 750',
    });
    expect(build(settled(LAST_799 + 1), intent('smith', 'srub'))).toEqual({
      ok: false,
      reason: 'Od roku 800',
    });
    const bad = build(settled(FIRST_800 + 1), intent('smith', 'dvorec' as HouseType));
    expect(bad.ok).toBe(false);
  });

  it('od 1. 1. 750 začne vypletená dílna – cena domu a přístřešku', () => {
    const result = build(settled(FIRST_750 + 1), intent('smith', 'vypleteny'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.state.constructions.find((c) => c.craft === 'smith');
    expect(site).toMatchObject({ kind: 'dwelling', dwellingType: 'vypleteny', craft: 'smith' });
    expect(site?.wood?.trees).toBe(19);
    expect(site?.cost).toBeGreaterThanOrEqual(workshopBuildLabor('smith', 'vypleteny'));
  });

  it('bez typu se staví dnešní dílna i po roce 750', () => {
    const result = build(settled(FIRST_800 + 1), intent('smith'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.find((c) => c.craft === 'smith')).toMatchObject({
      dwellingType: 'polozemnice',
    });
  });

  it('startWorkshop s typem, který není nadzemní dům, hodí RangeError', () => {
    expect(() =>
      startWorkshop(
        settled(FIRST_800 + 1),
        FIRST_800,
        'smith',
        SITE,
        0,
        [],
        {},
        'dvorec' as HouseType,
      ),
    ).toThrow(RangeError);
  });

  it('dostavěná dílna je obydlí typu domu s řemeslem a bez pozemku', () => {
    const state = settled(FIRST_750 + 1);
    const started = startWorkshop(state, state.lastDay, 'smith', SITE, 0, [], {}, 'vypleteny');
    const site = started.constructions.find((c) => c.craft === 'smith')!;
    site.done = site.cost;
    site.wood!.felled = site.wood!.fell.length;
    const done = advanceVillage(started, started.lastDay + 2, null);
    const dwelling = done.dwellings.find((d) => d.workshop?.craft === 'smith')!;
    expect(dwelling.type).toBe('vypleteny');
    expect(dwelling.plot).toBeUndefined();
  });
});

describe('přestavba nadzemní dílny', () => {
  it('roubená kovárna po 35 letech se přestaví na roubenou za cenu dílny toho typu', () => {
    const day = FIRST_800 + 100 * 365;
    const s = withoutSmallGame(
      withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: SITE })),
    );
    s.constructions = [];
    s.storesKg = 50_000;
    s.lastDay = day;
    s.nextId = 100;
    s.woodLogs = 0;
    s.people = [person(2, 25, 1, day), person(3, 25, 1, day)];
    s.dwellings.push({
      id: 50,
      type: 'srub',
      builtDay: day - Math.ceil(36 * YEAR),
      condition: 1,
      position: { x: 40, z: 0, rotation: 0 },
      workshop: newWorkshop('smith'),
    });
    s.people.push(person(60, 24, 50, day), person(61, 22, 50, day));
    const after = advanceVillage(s, day + 1, null);
    const rebuild = after.constructions.find((c) => c.kind === 'rebuild');
    expect(rebuild).toMatchObject({ dwellingId: 50, dwellingType: 'srub' });
    expect(rebuild!.wood!.trees).toBe(workshopTrees('smith', 'srub'));
    expect(rebuild!.cost).toBeGreaterThanOrEqual(workshopBuildLabor('smith', 'srub'));
    expect(rebuild!.cost).toBeCloseTo(
      workshopBuildLabor('smith', 'srub') + workshopTrees('smith', 'srub') * 2,
      6,
    );
  });
});
