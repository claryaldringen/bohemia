import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { packObstacles, type ObstacleLayer } from '../../../../landscape';
import { foundVillage } from '../../../core/actions';
import { migrateVillage, type VillageMigrationContext } from '../../../core/migrations';
import { STONE } from '../../../rules/rules-stone';
import { planCentre } from '../../../steward/steward-land';
import type { Construction, Quarry, VillageState } from '../../../types';
import { makeLandscape } from '../../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';
import {
  checkQuarryPlacement,
  finishQuarry,
  nearestOutcrop,
  orderQuarrying,
  quarryRockM,
  startQuarry,
} from '../quarry';
import { needsQuarryMove, withQuarriesBesideRocks } from '../quarry-move';
import { addStone } from '../stone';

// Převod `quarry-area` (fortifications.md – Lom jako plocha u skal; Martin 15. 11. 2026: „A oprav
// stávající lom ve Vlkově.“): starší lom na středu výchozu se přesune na rovnou plochu u skal.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const landscape = makeLandscape();
const OUTCROP = { x: 60, z: 40 };
const layer = packObstacles(
  [{ id: 7, kind: 'outcrop', look: 'rock-ridge', ...OUTCROP, rotation: 0, scale: 1 }],
  16,
  15,
);
const ctx: VillageMigrationContext = { obstacles: layer, landscape };

/** Plocha nového lomu 10 m za okrajem výchozu 7. */
const AREA = { x: OUTCROP.x, z: OUTCROP.z + 13, rotation: 0 };

function village(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
}

/** Ves se starým lomem na středu výchozu 7 (z doby před plochou u skal – bez bodu lámání). */
function withOldQuarry(): VillageState {
  const s = village();
  s.quarries = [{ outcropId: 7, ...OUTCROP, rotation: Math.PI, builtDay: DAY }];
  return s;
}

function ok(
  result: { ok: true; state: VillageState } | { ok: false; reason: string },
): VillageState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Starý lom se zakázkou „nalámat do zásoby“ 10 m³. */
function withOrder(): VillageState {
  const s = withOldQuarry();
  return ok(orderQuarrying(s, s.lastDay, 7, 10));
}

/** Ves bez lomu `q` – kontrola umístění nového lomu na jeho místo. */
function without(state: VillageState, q: Quarry): VillageState {
  return { ...state, quarries: (state.quarries ?? []).filter((x) => x !== q) };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('převod starého lomu na plochu u skal (quarry-area)', () => {
  it('lom se přesune na rovnou plochu vedle skal na straně ke vsi; zakázky a kámen zůstanou', () => {
    const ordered = withOrder();
    addStone(ordered, 3, { x: 10, z: 10 });
    const order = ordered.constructions.find((c) => c.kind === 'quarrying')!;
    order.done = order.cost / 4;
    order.stoneCart = { costM: 120, x: 0, z: 0 };
    const before = structuredClone(ordered);

    const moved = migrateVillage(ordered, ctx);
    expect(ordered).toEqual(before); // vstupní stav nemění
    const q = moved.quarries![0]!;
    expect(q).toMatchObject({ outcropId: 7, builtDay: DAY, rotation: 0 });
    // plocha podle pravidel nového lomu – do 50 m od okraje, na rovině, mimo výchoz
    expect(checkQuarryPlacement(landscape, without(moved, q), q, layer)).toMatchObject({
      ok: true,
      outcrop: { id: 7 },
      rock: q.rock,
    });
    expect(nearestOutcrop(layer, q)!.edgeM).toBeLessThanOrEqual(STONE.quarryArea.rockReachM);
    // hned vedle skal (první kruh) a blíž ke středu vsi než výchoz
    expect(quarryRockM(q)).toBeLessThan(8);
    const centre = planCentre(moved)!;
    expect(dist(q, centre)).toBeLessThan(dist(OUTCROP, centre));
    // rozpracovaná zakázka a hromada kamene beze změny, jen jízda vozu se spočítá znovu
    const kept = moved.constructions.find((c) => c.kind === 'quarrying')!;
    expect(kept).toEqual({ ...order, stoneCart: undefined });
    expect('stoneCart' in kept).toBe(false);
    expect(moved.stoneStacks).toEqual(before.stoneStacks);
    expect(moved.oldQuarriesMoved).toBe(true);
    // podruhé nic – týž objekt
    expect(migrateVillage(moved, ctx)).toBe(moved);
  });

  it('bez rovné plochy do 50 m lom zůstane na výchozu a převod se nezopakuje', () => {
    const old = withOldQuarry();
    // šachovnice výšek 0 a 10 m po políčkách – pod plochou 8 × 8 m nikde rovina
    const rugged = makeLandscape({ height: (x, y) => ((x + y) % 2) * 10 });
    const kept = migrateVillage(old, { obstacles: layer, landscape: rugged });
    expect(kept.quarries).toEqual(old.quarries);
    expect(kept.oldQuarriesMoved).toBe(true);
    expect(needsQuarryMove(kept)).toBe(false);
    // ani s rovinou se už nepřesune – převod je jednorázový
    expect(migrateVillage(kept, ctx)).toBe(kept);
  });

  it('bez krajiny počká; ves s lomem u skal (i rozestavěným) – týž objekt bez značky', () => {
    const old = migrateVillage(withOldQuarry(), { obstacles: null, landscape: null });
    expect(old.quarries).toEqual(withOldQuarry().quarries);
    expect(old.oldQuarriesMoved).toBeUndefined();
    expect(needsQuarryMove(old)).toBe(true);
    const fresh = village();
    const building = migrateVillage(
      ok(startQuarry(fresh, fresh.lastDay, landscape, layer, AREA)),
      ctx,
    );
    expect(needsQuarryMove(building)).toBe(false);
    expect(migrateVillage(building, ctx)).toBe(building);
    expect(building.oldQuarriesMoved).toBeUndefined();
  });

  it('rozestavěný starý lom se přesune a dostaví se s bodem lámání', () => {
    const fresh = village();
    const s = ok(startQuarry(fresh, fresh.lastDay, landscape, layer, AREA));
    const site = s.constructions.find((c) => c.kind === 'quarry')!;
    site.position = { ...OUTCROP, rotation: Math.PI };
    delete site.quarryRock;
    expect(needsQuarryMove(s)).toBe(true);

    withQuarriesBesideRocks(s, landscape, layer);
    expect(site.quarryOutcrop).toBe(7);
    expect(site.quarryRock).toBeDefined();
    expect(checkQuarryPlacement(landscape, fresh, site.position!, layer).ok).toBe(true);
    finishQuarry(s, site, DAY + 30);
    expect(s.quarries![0]).toMatchObject({ outcropId: 7, rock: site.quarryRock });
  });

  it('plocha jen u sousedního výchozu – lom dostane jeho id i se zakázkami', () => {
    // malý výchoz 7 v kruhu osmi větších (skalní hřbet): žádné místo, kde by byl nejbližší
    const ring = Array.from({ length: 8 }, (_, k) => ({
      id: 8 + k,
      kind: 'outcrop' as const,
      look: 'rock-ridge' as const,
      x: OUTCROP.x + 12 * Math.cos((k * Math.PI) / 4),
      z: OUTCROP.z + 12 * Math.sin((k * Math.PI) / 4),
      rotation: 0,
      scale: 1,
    }));
    const ridge: ObstacleLayer = packObstacles(
      [
        { id: 7, kind: 'outcrop', look: 'rock-ridge', ...OUTCROP, rotation: 0, scale: 0.5 },
        ...ring,
      ],
      16,
      15,
    );
    const s = withOrder();
    const wall: Construction = {
      id: s.nextId++,
      kind: 'fortification',
      startedDay: DAY,
      cost: 100,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      fortStone: { outcropId: 7, m3: 5, distanceM: 150, at: { x: 0, z: 0 } },
      stoneCart: { costM: 160, x: 0, z: 0 },
    };
    s.constructions.push(wall);

    withQuarriesBesideRocks(s, landscape, ridge);
    const q = s.quarries![0]!;
    expect(q.outcropId).toBeGreaterThanOrEqual(8);
    expect(nearestOutcrop(ridge, q)!.id).toBe(q.outcropId);
    expect(checkQuarryPlacement(landscape, without(s, q), q, ridge).ok).toBe(true);
    // do 50 m od okraje původního výchozu
    expect(dist(q, OUTCROP) - 1.5).toBeLessThanOrEqual(STONE.quarryArea.rockReachM);
    expect(s.constructions.find((c) => c.kind === 'quarrying')!.quarryOutcrop).toBe(q.outcropId);
    expect(wall.fortStone!.outcropId).toBe(q.outcropId);
    expect(wall.stoneCart).toBeUndefined();
  });
});
