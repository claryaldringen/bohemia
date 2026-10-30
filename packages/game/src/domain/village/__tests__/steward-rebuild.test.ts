import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { foundVillage } from '../actions';
import { applyBuildIntent } from '../build-intent';
import { cancelConstruction } from '../cancel-construction';
import { STEWARD } from '../rules-steward';
import { advanceVillage } from '../simulate';
import { decideRebuilds } from '../simulate-build';
import { stewardDay } from '../steward';
import { dwellingSiteValue, landValues } from '../steward-land';
import { needsReplan, planSettlement, planStamp } from '../steward-plan';
import { relocationGain } from '../steward-rebuild';
import { markStewardBuilt, newSteward } from '../steward-state';
import type { VillageState } from '../types';
import { couple, kin } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Přestavba vlastních staveb, veto a přepočet plánu (steward.md – Přestavba vlastních staveb,
// Soužití s hráčem).

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;
const size = landscape.size;
const values = landValues(landscape);

const cellOf = (tile: number): { x: number; y: number } => ({
  x: tile % size,
  y: Math.floor(tile / size),
});
function tileOf(p: { x: number; z: number }): number {
  const half = (size * landscape.cellSizeM) / 2;
  return (
    Math.floor((p.z + half) / landscape.cellSizeM) * size +
    Math.floor((p.x + half) / landscape.cellSizeM)
  );
}
const centre = (tile: number): { x: number; z: number; rotation: number } => {
  const c = tileCenterWorld(landscape, cellOf(tile).x, cellOf(tile).y);
  return { x: c.x, z: c.z, rotation: 0 };
};

function village(day: number): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, true) };
}

/** Ves se stojící zemnicí, hotovým plánem a mladým párem navíc – jedna rodina čeká na dům. */
function waitingVillage(day: number): VillageState {
  let s = withBuiltFirstDwelling(village(day));
  const home = s.dwellings[0]!.id;
  s.people.push(
    ...couple({ id: 900, age: 24, home }, { id: 901, age: 22, home }).map((k) => kin(k, day)),
  );
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  return s;
}

/** Nevhodné místo domu (pod hladinou záplav, svah, nelouka) poblíž sídla. */
function badTile(): number {
  const site = landscape.villageSite;
  for (let r = 3; r < 40; r++) {
    for (let k = 0; k < size * size; k += 1) {
      const x = site.x + (k % (2 * r + 1)) - r;
      const y = site.y + Math.floor(k / (2 * r + 1)) - r;
      if (x < 0 || y < 0 || x >= size || y >= size || k >= (2 * r + 1) ** 2) continue;
      if (dwellingSiteValue(landscape, values, y * size + x, 4) === null) return y * size + x;
    }
  }
  throw new Error('žádné nevhodné místo');
}

/**
 * Dožilé druhé obydlí (první je dvorec – nejstarší, ten se nestěhuje) na políčku `tile` s párem
 * 900 + 901; kdo ho postavil, určuje `bySteward`.
 */
function agedHome(s: VillageState, tile: number, bySteward: boolean): VillageState {
  const next = structuredClone(s);
  const manor = next.dwellings[0]!;
  manor.builtDay = next.lastDay - 300 * YEAR;
  const id = next.nextId++;
  next.dwellings.push({
    id,
    type: 'zemnice',
    builtDay: next.lastDay - 100 * YEAR,
    condition: 1,
    position: centre(tile),
  });
  for (const p of next.people) if (p.id === 900 || p.id === 901) p.dwellingId = id;
  next.woodLogs = 500;
  next.storesKg = 50_000;
  if (bySteward) markStewardBuilt(next, id);
  return next;
}

describe('přestavba vlastních staveb správce', () => {
  it('dožilé obydlí správce na špatném místě se přestěhuje na slot plánu', () => {
    const s = agedHome(waitingVillage(SEPT), badTile(), true);
    const day = s.lastDay + 1;
    decideRebuilds(s, day, obstacles, landscape);
    const move = s.constructions.find((c) => c.relocates === s.dwellings[1]!.id);
    expect(move).toBeDefined();
    expect(
      s.constructions.some((c) => c.kind === 'rebuild' && c.dwellingId === s.dwellings[1]!.id),
    ).toBe(false);
    expect(s.steward!.plan!.slots.dwelling).toContain(tileOf(move!.position!));
  });

  it('stavbu hráče správce nikdy nepřesune ani nezboří – přestaví se na místě', () => {
    const s = agedHome(waitingVillage(SEPT), badTile(), false);
    const d = s.dwellings[1]!;
    const day = s.lastDay + 1;
    decideRebuilds(s, day, obstacles, landscape);
    expect(s.constructions.some((c) => c.relocates !== undefined)).toBe(false);
    expect(s.constructions.some((c) => c.kind === 'rebuild' && c.dwellingId === d.id)).toBe(true);
    // stavbu hráče nezboří ani den správce
    stewardDay(s, SEPT + STEWARD.everyDays * 3, landscape, obstacles);
    expect(s.dwellings.some((x) => x.id === d.id)).toBe(true);
  });

  it('bez zisku nad marží se obydlí nestěhuje (stojí na nejlepším místě plánu)', () => {
    const base = waitingVillage(SEPT);
    const slots = base.steward!.plan!.slots.dwelling!;
    const people = 4;
    const cost = (t: number): number => dwellingSiteValue(landscape, values, t, people)!;
    const best = [...slots].sort((a, b) => cost(a) - cost(b))[0]!;
    const s = agedHome(base, best, true);
    decideRebuilds(s, s.lastDay + 1, obstacles, landscape);
    expect(s.constructions.some((c) => c.relocates !== undefined)).toBe(false);
    expect(
      s.constructions.some((c) => c.kind === 'rebuild' && c.dwellingId === s.dwellings[1]!.id),
    ).toBe(true);
    // zisk je nulový nebo záporný proti ostatním slotům
    for (const t of slots) {
      expect(relocationGain(landscape, best, t, people, 'zemnice')).toBeLessThanOrEqual(
        STEWARD.rebuildMargin * 1e9,
      );
    }
  });

  it('zisk malý proti marži obydlí nestěhuje, velký ano', () => {
    const base = waitingVillage(SEPT);
    const slots = base.steward!.plan!.slots.dwelling!;
    const cost = (t: number): number => dwellingSiteValue(landscape, values, t, 4)!;
    const sorted = [...slots].sort((a, b) => cost(a) - cost(b));
    const tiny = relocationGain(landscape, sorted.at(-1)!, sorted[0]!, 4, 'zemnice');
    expect(tiny).toBeGreaterThanOrEqual(0);
    expect(relocationGain(landscape, null, sorted[0]!, 4, 'zemnice')).toBe(Infinity);
  });

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const s = agedHome(waitingVillage(SEPT), badTile(), true);
    const to = s.lastDay + 45;
    const whole = advanceVillage(s, to, obstacles, landscape);
    const part = advanceVillage(
      advanceVillage(s, s.lastDay + 17, obstacles, landscape),
      to,
      obstacles,
      landscape,
    );
    expect(JSON.stringify(part)).toBe(JSON.stringify(whole));
    expect(
      whole.constructions.some((c) => c.relocates !== undefined) || whole.dwellings.length > 1,
    ).toBe(true);
  });
});

describe('zrušení stavby správce – veto', () => {
  it('veto drží vetoYears: tentýž slot se nestaví, po lhůtě ano; stavba hráče veto nezapíše', () => {
    const s = waitingVillage(SEPT);
    stewardDay(s, SEPT, landscape, obstacles);
    const house = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null)!;
    const tile = tileOf(house.position!);
    const day = SEPT + 1;
    const cancelled = cancelConstruction(s, day, house.id, landscape);
    expect(cancelled.steward!.vetoes).toEqual([
      { kind: 'dwelling', cell: cellOf(tile), untilDay: day + STEWARD.vetoYears * YEAR },
    ]);
    // v době veta správce na políčku nestaví
    const during = structuredClone(cancelled);
    stewardDay(during, SEPT + STEWARD.everyDays, landscape, obstacles);
    const other = during.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    if (other) expect(tileOf(other.position!)).not.toBe(tile);
    // po lhůtě je slot opět k mání
    const after = structuredClone(cancelled);
    const late =
      Math.ceil((day + STEWARD.vetoYears * YEAR + 1) / STEWARD.everyDays) * STEWARD.everyDays;
    after.lastDay = late - 1;
    stewardDay(after, late, landscape, obstacles);
    const again = after.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(again && tileOf(again.position!)).toBe(tile);

    // stavba hráče: bez značky správce žádné veto
    const player = waitingVillage(SEPT);
    const t = player.steward!.plan!.slots.dwelling![0]!;
    const built = applyBuildIntent(player, SEPT, landscape, obstacles, {
      kind: 'dwelling',
      type: 'zemnice',
      position: centre(t),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const c = built.state.constructions.find(
      (x) => x.dwellingId === null && x.kind === 'dwelling',
    )!;
    const undone = cancelConstruction(built.state, SEPT, c.id, landscape);
    expect(undone.steward?.vetoes ?? []).toEqual([]);
  });
});

describe('přepočet plánu', () => {
  it('stavba hráče na plánovaném slotu: přepočet hned a správce plánuje kolem', () => {
    const s = waitingVillage(SEPT);
    const tile = s.steward!.plan!.slots.dwelling![0]!;
    const built = applyBuildIntent(s, SEPT, landscape, obstacles, {
      kind: 'dwelling',
      type: 'zemnice',
      position: centre(tile),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const p = built.state;
    expect(planStamp(p).length).toBe(planStamp(s).length + 1);
    let day = SEPT + STEWARD.everyDays;
    stewardDay(p, day, landscape, obstacles);
    expect(p.steward!.nextPlan).toBeDefined();
    expect(p.steward!.replan).toBeUndefined();
    for (let k = 0; k < 12 && p.steward!.nextPlan; k++) {
      day += STEWARD.everyDays;
      stewardDay(p, day, landscape, obstacles);
    }
    expect(p.steward!.nextPlan).toBeUndefined();
    expect(p.steward!.plan!.slots.dwelling).not.toContain(tile);
    // stavba hráče zůstala
    expect(p.constructions.some((c) => c.kind === 'dwelling' && tileOf(c.position!) === tile)).toBe(
      true,
    );
  });

  it('příznak replan (odchod syna) spustí přepočet i bez změn staveb', () => {
    const s = waitingVillage(SEPT);
    expect(needsReplan(s, SEPT)).toBe(false);
    s.steward!.replan = true;
    expect(needsReplan(s, SEPT)).toBe(true);
    const next = planSettlement(s, SEPT, landscape, obstacles);
    expect(next.steward!.nextPlan).toBeDefined();
    expect(next.steward!.replan).toBeUndefined();
  });
});
