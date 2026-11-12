import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { packObstacles } from '../../../../landscape';
import { foundVillage } from '../../../core/actions';
import { applyBuildIntent } from '../../../buildings/build-intent';
import { cancelConstruction } from '../../../buildings/cancel-construction';
import { logArrivalPoint } from '../../../forest/log-piles';
import {
  QUARRY_MISSING,
  QUARRY_NO_OUTCROP,
  QUARRY_TAKEN,
  checkQuarryPlacement,
  orderQuarrying,
  quarryManDaysPerM3,
  startQuarry,
  stoneCarryManDaysPerM3,
} from '../quarry';
import { advanceVillage } from '../../../core/simulate';
import { addStone, stoneOnHand } from '../stone';
import type { VillageState } from '../../../types';
import { makeLandscape } from '../../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';

// Lom a hromady kamení (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026).

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const landscape = makeLandscape();
const OUTCROP = { x: 60, z: 40 };
const layer = packObstacles(
  [{ id: 7, kind: 'outcrop', look: 'rock-ridge', ...OUTCROP, rotation: 0, scale: 1 }],
  16,
  15,
);

function village(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
}

function ok(
  result: { ok: true; state: VillageState } | { ok: false; reason: string },
): VillageState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Dopočítá ves po 5 dnech, dokud neplatí `done` (nejvýš 400 dní). */
function until(state: VillageState, done: (s: VillageState) => boolean): VillageState {
  let s = state;
  for (let d = 0; d < 400 && !done(s); d += 5) {
    s = advanceVillage(s, s.lastDay + 5, layer, landscape);
  }
  return s;
}

describe('hromady kamení u cesty', () => {
  it('kámen přibude na hromadu, blízká hromada se zvětší; id z nextStoneStackId, nextId stojí', () => {
    const s = village();
    const nextId = s.nextId;
    addStone(s, 3, { x: 10, z: 10 });
    addStone(s, 2, { x: 14, z: 10 });
    addStone(s, 1.5, { x: 200, z: 200 });
    expect(stoneOnHand(s)).toBeCloseTo(6.5, 9);
    expect(s.stoneStacks!.map((x) => [x.id, x.m3])).toEqual([
      [1, 5],
      [2, 1.5],
    ]);
    expect(s.nextStoneStackId).toBe(3);
    expect(s.nextId).toBe(nextId);
    // nic nepřidá
    addStone(s, 0, null);
    expect(s.stoneStacks).toHaveLength(2);
  });
});

describe('lom na skalním výchozu', () => {
  it('jen na výchoz, na jednom výchozu jeden lom', () => {
    const s = village();
    expect(checkQuarryPlacement(s, layer, { x: 0, z: 0 })).toMatchObject({
      ok: false,
      reason: QUARRY_NO_OUTCROP,
    });
    expect(checkQuarryPlacement(s, layer, { x: OUTCROP.x + 2, z: OUTCROP.z })).toMatchObject({
      ok: true,
      outcrop: { id: 7, ...OUTCROP },
    });
    const started = ok(startQuarry(s, s.lastDay, layer, { x: 61, z: 41, rotation: 0.5 }));
    const c = started.constructions.find((x) => x.kind === 'quarry')!;
    expect(c).toMatchObject({
      cost: 20,
      quarryOutcrop: 7,
      position: { ...OUTCROP, rotation: 0.5 },
    });
    expect(c.wood).toBeUndefined();
    expect(checkQuarryPlacement(started, layer, OUTCROP).reason).toBe(QUARRY_TAKEN);
    // přes záměr stavby (jako ostatní stavby z nabídky)
    const intent = applyBuildIntent(s, s.lastDay, landscape, layer, {
      kind: 'quarry',
      position: { x: 0, z: 0, rotation: 0 },
    });
    expect(intent).toEqual({ ok: false, reason: QUARRY_NO_OUTCROP });
  });

  it('dostavěný lom přibude do quarries; nalámat do zásoby dá kámen na hromadu u dvorce', () => {
    const s = village();
    expect(orderQuarrying(s, s.lastDay, 7, 10)).toEqual({ ok: false, reason: QUARRY_MISSING });
    const built = until(
      ok(startQuarry(s, s.lastDay, layer, { ...OUTCROP, rotation: 0 })),
      (x) => (x.quarries ?? []).length > 0,
    );
    expect(built.quarries).toEqual([
      expect.objectContaining({ outcropId: 7, ...OUTCROP, rotation: 0 }),
    ]);
    expect(orderQuarrying(built, built.lastDay, 7, 0).ok).toBe(false);
    expect(orderQuarrying(built, built.lastDay, 7, 2.5).ok).toBe(false);
    const ordered = ok(orderQuarrying(built, built.lastDay, 7, 10));
    const c = ordered.constructions.find((x) => x.kind === 'quarrying')!;
    const to = logArrivalPoint(built);
    const d = Math.hypot(OUTCROP.x - to.x, OUTCROP.z - to.z);
    expect(c.cost).toBeCloseTo(10 * quarryManDaysPerM3(d), 9);
    expect(quarryManDaysPerM3(d)).toBeCloseTo(1 + stoneCarryManDaysPerM3(d), 12);
    const done = until(ordered, (x) => !x.constructions.some((k) => k.kind === 'quarrying'));
    expect(stoneOnHand(done)).toBeCloseTo(10, 9);
    expect(done.stoneStacks).toHaveLength(1);
  });

  it('zrušené lámání složí, co se už nalámalo; zrušený lom zmizí', () => {
    const s = village();
    const started = ok(startQuarry(s, s.lastDay, layer, { ...OUTCROP, rotation: 0 }));
    const site = started.constructions.find((x) => x.kind === 'quarry')!;
    const dropped = cancelConstruction(started, started.lastDay, site.id);
    expect(dropped.constructions.some((x) => x.kind === 'quarry')).toBe(false);
    expect(checkQuarryPlacement(dropped, layer, OUTCROP).ok).toBe(true);
    const built = structuredClone(s);
    built.quarries = [{ outcropId: 7, ...OUTCROP, rotation: 0, builtDay: DAY }];
    const ordered = ok(orderQuarrying(built, built.lastDay, 7, 20));
    const order = ordered.constructions.find((x) => x.kind === 'quarrying')!;
    order.done = order.cost / 4;
    const cancelled = cancelConstruction(ordered, ordered.lastDay, order.id);
    expect(stoneOnHand(cancelled)).toBeCloseTo(5, 9);
  });
});
