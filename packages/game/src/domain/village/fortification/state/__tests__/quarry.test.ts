import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { packObstacles } from '../../../../landscape';
import { foundVillage } from '../../../core/actions';
import { applyBuildIntent } from '../../../buildings/build-intent';
import { cancelConstruction } from '../../../buildings/cancel-construction';
import { logArrivalPoint } from '../../../forest/log-piles';
import {
  QUARRY_MISSING,
  QUARRY_NO_ROCKS,
  QUARRY_ON_ROCK,
  QUARRY_TAKEN,
  QUARRY_TOO_FAR,
  blockCarryManDaysPerM3,
  checkQuarryPlacement,
  orderQuarrying,
  quarryBreakManDaysPerM3,
  quarryManDaysPerM3,
  startQuarry,
  stoneCartProgress,
  stoneCarryManDaysPerM3,
  type StoneCart,
} from '../quarry';
import { fortStonePlan } from '../fortifications';
import { OVERLAPS_QUARRY } from '../../../placement/placement-land';
import { STONE } from '../../../rules/rules-stone';
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

// Lom jako plocha u skal (fortifications.md – Kámen; Martin 14. 11. 2026 – schváleno).
const EDGE_Z = OUTCROP.z + 3; // okraj výchozu směrem +z (poloměr OUTCROP_RADIUS_M × 1)
const AREA = { x: OUTCROP.x, z: EDGE_Z + 10, rotation: 0.5 };

describe('lom – plocha u skal', () => {
  it('na rovině do 50 m od okraje výchozu projde, dál ne; bez výchozu na mapě ne', () => {
    const s = village();
    const near = checkQuarryPlacement(landscape, s, AREA, layer);
    expect(near).toMatchObject({ ok: true, outcrop: { id: 7, ...OUTCROP } });
    expect(near.rock!.x).toBeCloseTo(OUTCROP.x, 9);
    expect(near.rock!.z).toBeCloseTo(EDGE_Z, 9);
    const edge = { x: OUTCROP.x, z: EDGE_Z + STONE.quarryArea.rockReachM, rotation: 0 };
    expect(checkQuarryPlacement(landscape, s, edge, layer).ok).toBe(true);
    expect(checkQuarryPlacement(landscape, s, { ...edge, z: edge.z + 1 }, layer).reason).toBe(
      QUARRY_TOO_FAR,
    );
    const empty = packObstacles([], 16, 15);
    expect(checkQuarryPlacement(landscape, s, AREA, empty).reason).toBe(QUARRY_NO_ROCKS);
    // plocha je vedle skal – na výchoz (ani přes jeho okraj) ne
    expect(checkQuarryPlacement(landscape, s, { ...OUTCROP, rotation: 0 }, layer).reason).toBe(
      QUARRY_ON_ROCK,
    );
    expect(
      checkQuarryPlacement(landscape, s, { x: OUTCROP.x, z: EDGE_Z + 2, rotation: 0 }, layer)
        .reason,
    ).toBe(QUARRY_ON_ROCK);
    // nerovná země (3 m na políčko 15 m – pod plochou 8 m víc než 1 m)
    const slope = makeLandscape({ height: (x) => x * 3 });
    expect(checkQuarryPlacement(slope, s, AREA, layer).reason).toMatch(/příliš nerovná/);
  });

  it('stavba nese plochu, výchoz a bod lámání; u výchozu jeden lom; plochy se nepřekrývají', () => {
    const s = village();
    const started = ok(startQuarry(s, s.lastDay, landscape, layer, AREA));
    const c = started.constructions.find((x) => x.kind === 'quarry')!;
    expect(c).toMatchObject({ cost: 20, quarryOutcrop: 7, position: AREA });
    expect(c.quarryRock!.z).toBeCloseTo(EDGE_Z, 9);
    expect(c.wood).toBeUndefined();
    const other = { x: OUTCROP.x + 12, z: OUTCROP.z, rotation: 0 };
    expect(checkQuarryPlacement(landscape, started, other, layer).reason).toBe(QUARRY_TAKEN);
    // druhý výchoz kus dál – vlastní lom jde, jen ne přes plochu prvního
    const two = packObstacles(
      [
        { id: 7, kind: 'outcrop', look: 'rock-ridge', ...OUTCROP, rotation: 0, scale: 1 },
        { id: 8, kind: 'outcrop', look: 'rock-ridge', x: 60, z: 76, rotation: 0, scale: 1 },
      ],
      16,
      15,
    );
    const second = { x: 60, z: AREA.z + 6, rotation: 0 };
    expect(checkQuarryPlacement(landscape, started, second, two)).toMatchObject({
      ok: false,
      reason: OVERLAPS_QUARRY,
      outcrop: { id: 8 },
    });
    expect(checkQuarryPlacement(landscape, started, { ...second, z: 66 }, two).ok).toBe(true);
    // přes záměr stavby (jako ostatní stavby z nabídky)
    const intent = applyBuildIntent(s, s.lastDay, landscape, layer, {
      kind: 'quarry',
      position: { x: 0, z: 0, rotation: 0 },
    });
    expect(intent).toEqual({ ok: false, reason: QUARRY_TOO_FAR });
  });

  it('nošení bloků roste se vzdáleností plochy od skal (40 kg na cestu)', () => {
    // 2500 kg ÷ 40 kg = 62,5 cesty na m³, tam i zpět 1 m/s, naložení a složení 1 minuta, den 10 h
    expect(blockCarryManDaysPerM3(10)).toBeCloseTo((62.5 * (20 + 60)) / 36_000, 12);
    expect(blockCarryManDaysPerM3(50)).toBeGreaterThan(blockCarryManDaysPerM3(10));
    expect(quarryManDaysPerM3(100, 40) - quarryManDaysPerM3(100, 10)).toBeCloseTo(
      (62.5 * 60) / 36_000,
      12,
    );
    // lom na výchozu bloky nenosí – jen lámání
    expect(quarryBreakManDaysPerM3()).toBe(STONE.quarryManDaysPerM3);
    expect(quarryManDaysPerM3(100)).toBeCloseTo(1 + stoneCarryManDaysPerM3(100), 12);
    // vůz nahradí jen nošení z plochy – lámání a bloky zůstanou (`breakPerM3`)
    const cart: StoneCart = {
      constructionId: 1,
      outcropId: 7,
      maxM3: 10,
      crewPerM3: 0.1,
      carryPerM3: 0.6,
      breakPerM3: quarryBreakManDaysPerM3(30),
      loadM3: 0.16,
    };
    expect(stoneCartProgress(0.5, 1, cart).m3).toBeCloseTo(0.5 / (cart.breakPerM3 + 0.1), 12);
  });

  it('dovoz se měří od plochy, bloky od bodu lámání; hradba si nošení bloků pamatuje', () => {
    const s = village();
    s.quarries = [{ outcropId: 7, ...AREA, builtDay: DAY, rock: { x: OUTCROP.x, z: EDGE_Z } }];
    const ordered = ok(orderQuarrying(s, s.lastDay, 7, 10));
    const c = ordered.constructions.find((x) => x.kind === 'quarrying')!;
    const to = logArrivalPoint(s);
    const d = Math.hypot(AREA.x - to.x, AREA.z - to.z);
    expect(c.cost).toBeCloseTo(10 * quarryManDaysPerM3(d, 10), 9);
    const at = { x: 0, z: 0 };
    const plan = fortStonePlan(s, 4, at);
    expect(plan.quarry).toEqual({
      outcropId: 7,
      distanceM: Math.hypot(AREA.x, AREA.z),
      rockM: 10,
    });
    expect(plan.quarryManDays).toBeCloseTo(
      4 * quarryManDaysPerM3(Math.hypot(AREA.x, AREA.z), 10),
      9,
    );
  });

  it('dostavěný lom přibude do quarries s bodem lámání; nalámat do zásoby dá kámen u dvorce', () => {
    const s = village();
    expect(orderQuarrying(s, s.lastDay, 7, 10)).toEqual({ ok: false, reason: QUARRY_MISSING });
    const built = until(
      ok(startQuarry(s, s.lastDay, landscape, layer, AREA)),
      (x) => (x.quarries ?? []).length > 0,
    );
    expect(built.quarries).toEqual([
      expect.objectContaining({ outcropId: 7, ...AREA, rock: expect.any(Object) }),
    ]);
    expect(orderQuarrying(built, built.lastDay, 7, 0).ok).toBe(false);
    expect(orderQuarrying(built, built.lastDay, 7, 2.5).ok).toBe(false);
    const ordered = ok(orderQuarrying(built, built.lastDay, 7, 10));
    const done = until(ordered, (x) => !x.constructions.some((k) => k.kind === 'quarrying'));
    expect(stoneOnHand(done)).toBeCloseTo(10, 9);
    expect(done.stoneStacks).toHaveLength(1);
  });

  it('starý lom na výchozu dál pracuje – bloky se nenosí, kámen přibude', () => {
    const s = village();
    s.quarries = [{ outcropId: 7, ...OUTCROP, rotation: 0, builtDay: DAY }];
    // převod `quarry-area` pro něj rovnou plochu nenašel – zůstal na výchozu (quarry-move.test.ts)
    s.oldQuarriesMoved = true;
    const ordered = ok(orderQuarrying(s, s.lastDay, 7, 10));
    const c = ordered.constructions.find((x) => x.kind === 'quarrying')!;
    const to = logArrivalPoint(s);
    const d = Math.hypot(OUTCROP.x - to.x, OUTCROP.z - to.z);
    expect(c.cost).toBeCloseTo(10 * (1 + stoneCarryManDaysPerM3(d)), 9);
    const done = until(ordered, (x) => !x.constructions.some((k) => k.kind === 'quarrying'));
    expect(stoneOnHand(done)).toBeCloseTo(10, 9);
    // u výchozu starého lomu nový lom nejde
    expect(checkQuarryPlacement(landscape, s, AREA, layer).reason).toBe(QUARRY_TAKEN);
  });

  it('zrušené lámání složí, co se už nalámalo; zrušený lom zmizí', () => {
    const s = village();
    const started = ok(startQuarry(s, s.lastDay, landscape, layer, AREA));
    const site = started.constructions.find((x) => x.kind === 'quarry')!;
    const dropped = cancelConstruction(started, started.lastDay, site.id);
    expect(dropped.constructions.some((x) => x.kind === 'quarry')).toBe(false);
    expect(checkQuarryPlacement(landscape, dropped, AREA, layer).ok).toBe(true);
    const built = structuredClone(s);
    built.quarries = [{ outcropId: 7, ...OUTCROP, rotation: 0, builtDay: DAY }];
    const ordered = ok(orderQuarrying(built, built.lastDay, 7, 20));
    const order = ordered.constructions.find((x) => x.kind === 'quarrying')!;
    order.done = order.cost / 4;
    const cancelled = cancelConstruction(ordered, ordered.lastDay, order.id);
    expect(stoneOnHand(cancelled)).toBeCloseTo(5, 9);
  });
});
