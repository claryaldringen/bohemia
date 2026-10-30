import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departWithSon,
  isVillageTravelling,
  newSteward,
  pendingStewardDepartures,
  stewardDepartureOrigin,
  type Dwelling,
  type Position,
  type StewardDeparture,
  type VillageState,
} from '../../domain/village';
import { trackedVillage } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { loadVillage } from '../load-village';
import { settleStewardDepartures } from '../settle-steward-departures';
import type { LandscapeSource, SeedSource } from '../settlements';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

const PLAYER = 'hrac-1';
const DAY = dayIndexOf({ year: 600, month: 8, day: 31 });
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });
const seeds = (): SeedSource => {
  let next = 4242;
  return { nextSeed: () => next++ };
};
const house = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: at(x, z),
});

/**
 * Mateřská ves se správcem, ze které 31. 8. odešel syn Bořivoj (30) – záznam schránky s cílem
 * `dwelling` (tady), jinak nová mapa na sever.
 */
async function world(dwelling?: Position): Promise<{
  deps: {
    settlements: InMemorySettlements;
    villages: InMemoryVillages;
    seeds: SeedSource;
    landscapes: LandscapeSource;
  };
  villageId: string;
  seatId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const s = trackedVillage(
    [
      { id: 10, age: 60, sex: 'male', spouse: 11 },
      { id: 11, age: 55, sex: 'female', spouse: 10 },
      { id: 20, age: 30, sex: 'male', spouse: 21, father: 10, mother: 11, home: 2 },
      { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
      { id: 30, age: 24, sex: 'male', spouse: 31, father: 10, mother: 11, home: 3 },
      { id: 31, age: 22, sex: 'female', spouse: 30, home: 3 },
    ],
    [house(1, -200, -200), house(2, -160, -200), house(3, -200, -160)],
    { storesKg: 2000, steward: newSteward(DAY, true) },
  );
  for (const p of s.people) {
    if (p.id === 20) p.mainWifeSon = true;
    if (p.id === 20) p.name = 'Bořek';
    if (p.id === 30) p.name = 'Bořivoj';
  }
  s.lastDay = DAY;
  const departed = departWithSon(s, DAY, 30, { villageName: 'Lhota' });
  const record: StewardDeparture = {
    id: DAY,
    sonId: 30,
    seed: 99,
    name: 'Lhota',
    ...(dwelling ? { dwelling } : {}),
    directions: [{ direction: 'N', travelDays: 2 }],
    settlers: departed.settlers,
  };
  const mother: VillageState = {
    ...departed.state,
    steward: { ...departed.state.steward!, departures: [record] },
  };
  const added = await villages.add(seat.id, 'Libice', mother);
  return {
    deps: { settlements, villages, seeds: seeds(), landscapes },
    villageId: added.id,
    seatId: seat.id,
  };
}

const withOrigin = (villages: InMemoryVillages): VillageState[] =>
  [...villages.records.values()].map((r) => r.state).filter((s) => s.origin !== undefined);

describe('settleStewardDepartures – vybavení schránky', () => {
  it('tady: ves syna vznikne na místě ze záznamu – vojvodou syn, správce zapnutý', async () => {
    const { deps, villageId, seatId } = await world(at(200, 200));
    const settled = await settleStewardDepartures(deps, { playerId: PLAYER, villageId });
    expect(settled).toHaveLength(1);
    const village = settled[0]!;
    expect(village.settlementId).toBe(seatId);
    expect(village.name).toBe('Lhota');
    expect(village.state.origin).toBe(stewardDepartureOrigin(villageId, DAY));
    expect(village.state.dynasty?.lordId).toBe(30);
    expect(village.state.steward?.on).toBe(true);
    expect(village.state.lastDay).toBe(DAY);
    const mother = (await deps.villages.find(villageId))!.state;
    expect(mother.steward?.departures?.[0]).toMatchObject({ id: DAY, villageId: village.id });
    expect(mother.steward?.departures?.[0]?.settlers).toBeUndefined();
    expect(pendingStewardDepartures(mother)).toHaveLength(0);
  });

  it('opakované i souběžné volání založí ves právě jednou', async () => {
    const { deps, villageId } = await world(at(200, 200));
    const [a, b] = await Promise.all([
      settleStewardDepartures(deps, { playerId: PLAYER, villageId }),
      settleStewardDepartures(deps, { playerId: PLAYER, villageId }),
    ]);
    expect(withOrigin(deps.villages)).toHaveLength(1);
    expect(a[0]?.id ?? b[0]?.id).toBeDefined();
    if (a[0] && b[0]) expect(a[0].id).toBe(b[0].id);
    expect(await settleStewardDepartures(deps, { playerId: PLAYER, villageId })).toEqual([]);
    expect(withOrigin(deps.villages)).toHaveLength(1);
  });

  it('pád mezi založením vsi a značkou v mateřské vsi – ves se podruhé nezaloží', async () => {
    const { deps, villageId, seatId } = await world(at(200, 200));
    const origin = stewardDepartureOrigin(villageId, DAY);
    const mother = (await deps.villages.find(villageId))!.state;
    const lost = await deps.villages.addOnce(seatId, 'Lhota', { ...mother, origin });
    const settled = await settleStewardDepartures(deps, { playerId: PLAYER, villageId });
    expect(settled.map((v) => v.id)).toEqual([lost!.id]);
    expect(withOrigin(deps.villages)).toHaveLength(1);
    const marked = (await deps.villages.find(villageId))!.state;
    expect(marked.steward?.departures?.[0]?.villageId).toBe(lost!.id);
  });

  it('nová mapa: lidé na cestě, po příjezdu se ves založí sama', async () => {
    const { deps, villageId } = await world();
    const [village] = await settleStewardDepartures(deps, { playerId: PLAYER, villageId });
    expect(village).toBeDefined();
    expect(isVillageTravelling(village!.state)).toBe(true);
    expect(village!.state.journey).toMatchObject({
      direction: 'N',
      arrivalDay: DAY + 2,
      stewarded: true,
    });
    const target = (await deps.settlements.listActive(PLAYER)).find(
      (s) => s.id === village!.settlementId,
    );
    expect(target?.worldCell).toEqual({ x: 0, y: 1 });
    const loaded = await loadVillage(deps, { villageId: village!.id, today: DAY + 4, landscape });
    expect(isVillageTravelling(loaded!.state)).toBe(false);
    expect(loaded!.state.dynasty?.lordId).toBe(30);
    expect(loaded!.state.steward?.on).toBe(true);
    expect(loaded!.state.foundedDay).toBe(DAY + 2);
  });
});
