import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departWithSon,
  newSteward,
  pendingStewardDepartures,
  type Dwelling,
  type Position,
  type StewardDeparture,
  type VillageState,
} from '../../domain/village';
import { trackedVillage } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { advanceDynasty } from '../advance-dynasty';
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

const input = { playerId: PLAYER, today: DAY };
const founded = (villages: InMemoryVillages): VillageState[] =>
  [...villages.records.values()].map((r) => r.state).filter((s) => s.origin !== undefined);

describe('advanceDynasty – kola vybavení schránek', () => {
  it('nová ves syna vznikne a je dopočtená k dnešku', async () => {
    const { deps, villageId } = await world(at(200, 200));
    const status = await advanceDynasty(deps, input);
    expect(status.villages).toHaveLength(2);
    const son = status.villages.find((v) => v.id !== villageId)!;
    expect(son.name).toBe('Lhota');
    expect(son.state.lastDay).toBe(DAY);
    const mother = status.villages.find((v) => v.id === villageId)!;
    expect(pendingStewardDepartures(mother.state)).toHaveLength(0);
    expect(status.gameOver).toBe(false);
  });

  it('opakované volání nic nezdvojí', async () => {
    const { deps } = await world(at(200, 200));
    await advanceDynasty(deps, input);
    const again = await advanceDynasty(deps, input);
    expect(again.villages).toHaveLength(2);
    expect(founded(deps.villages)).toHaveLength(1);
  });
});
