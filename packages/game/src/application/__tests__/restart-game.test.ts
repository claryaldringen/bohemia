import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { Position, VillageState } from '../../domain/village';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { placeCemetery } from '../place-cemetery';
import { placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { placeOrchard } from '../place-orchard';
import { renameVillage } from '../rename-village';
import { DYNASTY_ALIVE, dynastyStatus, restartGame } from '../restart-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { VILLAGE_EXTINCT } from '../update-village';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

const TODAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
/** Ruční krajina testů pro každé sídlo – generátor by se jen zdržoval. */
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });

/** Seedy po řadě – nové sídlo po restartu dostane další. */
function seedsFrom(...values: number[]): SeedSource {
  let next = 0;
  return { nextSeed: () => values[next++ % values.length]! };
}

/** Hráč se sídlem (seed krajiny 11) a založenou vsí; `kill` ji nechá vymřít. */
async function playerWithVillage(kill: boolean): Promise<{
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
  settlementId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: seedsFrom(4242) },
    {
      settlementId: seat.id,
      landscape,
      today: TODAY - 40,
      name: 'Libice',
      dwelling: at(-50, -50),
      fieldCells: block(6, 6, 4, 4),
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  if (kill) villages.edit(seat.id, dieOut);
  return { settlements, villages, settlementId: seat.id };
}

/** Všichni zemřou – ves vymře příští dopočítaný den (jako ves uložená bez lidí). */
function dieOut(state: VillageState): void {
  state.people = [];
}

describe('dynastyStatus', () => {
  it('dopočítá vsi do dneška – ves bez lidí vymře, uloží se a hra končí', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(true);
    const status = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(status.gameOver).toBe(true);
    expect(status.villages).toHaveLength(1);
    expect(status.villages[0]?.state.extinctDay).toBe(TODAY - 39);
    expect(villages.records.get(settlementId)?.state.extinctDay).toBe(TODAY - 39);
  });

  it('se živou vsí ani bez vsi hra nekončí', async () => {
    const living = await playerWithVillage(false);
    const alive = await dynastyStatus(
      { ...living, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(alive.gameOver).toBe(false);
    const fresh = await dynastyStatus(
      { settlements: new InMemorySettlements(), villages: new InMemoryVillages(), landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(fresh).toEqual({ settlements: [], villages: [], gameOver: false });
  });
});

describe('restartGame', () => {
  it('po vymření archivuje sídlo a založí nové s novým seedem – bez vsi', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(true);
    const result = await restartGame(
      { settlements, villages, landscapes, seeds: seedsFrom(777) },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).not.toBe(settlementId);
    expect(result.settlement).toMatchObject({ ownerId: PLAYER, isSeat: true });
    expect(result.settlement.landscapeSeed).not.toBe(11);
    expect(settlements.archived.has(settlementId)).toBe(true);
    expect(await settlements.findSeat(PLAYER)).toEqual(result.settlement);
    expect(await settlements.listActive(PLAYER)).toEqual([result.settlement]);
    // vymřelá ves zůstane v archivu, nové sídlo zakládá ves jako nový hráč
    expect(villages.records.get(settlementId)?.state.extinctDay).toBeDefined();
    expect(villages.records.has(result.settlement.id)).toBe(false);
    const after = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(after.gameOver).toBe(false);
    const again = await foundVillageForSettlement(
      { villages, seeds: seedsFrom(1) },
      {
        settlementId: result.settlement.id,
        landscape,
        today: TODAY,
        name: 'Nová Libice',
        dwelling: at(-50, -50),
      },
    );
    expect(again.ok).toBe(true);
  }, 30_000);

  it('se živou vsí restart odmítne a nic nezmění', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(false);
    const result = await restartGame(
      { settlements, villages, landscapes, seeds: seedsFrom(777) },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result).toEqual({ ok: false, reason: DYNASTY_ALIVE });
    expect(settlements.archived.size).toBe(0);
    expect((await settlements.findSeat(PLAYER))?.id).toBe(settlementId);
  });

  it('bez vsi vrátí sídlo beze změny (druhý restart po prvním)', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const deps = { settlements, villages, landscapes, seeds: seedsFrom(777, 888) };
    const first = await restartGame(deps, { playerId: PLAYER, today: TODAY });
    const second = await restartGame(deps, { playerId: PLAYER, today: TODAY });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.settlement).toEqual(first.settlement);
    expect(settlements.settlements).toHaveLength(2);
  }, 30_000);

  it('souběžné restarty založí jediné nové sídlo', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const deps = { settlements, villages, landscapes, seeds: seedsFrom(777, 888, 999) };
    const results = await Promise.all(
      [1, 2, 3].map(() => restartGame(deps, { playerId: PLAYER, today: TODAY })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.settlement.id : '')));
    expect(ids.size).toBe(1);
    expect(await settlements.listActive(PLAYER)).toHaveLength(1);
  }, 60_000);
});

describe('restartGame s abandon (nabídka hry)', () => {
  it('se živou vsí archivuje sídlo i se vsí a založí nové s novým seedem', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(false);
    const result = await restartGame(
      { settlements, villages, landscapes, seeds: seedsFrom(777) },
      { playerId: PLAYER, today: TODAY, abandon: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).not.toBe(settlementId);
    expect(result.settlement).toMatchObject({ ownerId: PLAYER, isSeat: true });
    expect(result.settlement.landscapeSeed).not.toBe(11);
    expect(settlements.archived.has(settlementId)).toBe(true);
    expect(await settlements.listActive(PLAYER)).toEqual([result.settlement]);
    // opuštěná ves zůstane v archivu, jak byla – živá, jen se dál nedopočítává
    const abandoned = villages.records.get(settlementId)?.state;
    expect(abandoned?.extinctDay).toBeUndefined();
    expect(abandoned?.people.length).toBeGreaterThan(0);
    expect(villages.records.has(result.settlement.id)).toBe(false);
    const after = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(after).toMatchObject({ villages: [], gameOver: false });
  }, 30_000);

  it('bez abandon (i s abandon: false) se živou vsí dál odmítne', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(false);
    const result = await restartGame(
      { settlements, villages, landscapes, seeds: seedsFrom(777) },
      { playerId: PLAYER, today: TODAY, abandon: false },
    );
    expect(result).toEqual({ ok: false, reason: DYNASTY_ALIVE });
    expect(settlements.archived.size).toBe(0);
    expect((await settlements.findSeat(PLAYER))?.id).toBe(settlementId);
  });

  it('po vymření funguje jako restart z obrazovky porážky', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(true);
    const result = await restartGame(
      { settlements, villages, landscapes, seeds: seedsFrom(777) },
      { playerId: PLAYER, today: TODAY, abandon: true },
    );
    expect(result.ok && result.settlement.id !== settlementId).toBe(true);
    expect(settlements.archived.has(settlementId)).toBe(true);
  }, 30_000);

  it('bez vsi vrátí sídlo beze změny – opakované potvrzení nezaloží další krajinu', async () => {
    const { settlements, villages } = await playerWithVillage(false);
    const deps = { settlements, villages, landscapes, seeds: seedsFrom(777, 888) };
    const first = await restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true });
    const second = await restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.settlement).toEqual(first.settlement);
    expect(settlements.settlements).toHaveLength(2);
    expect(settlements.archived.size).toBe(1);
  }, 30_000);

  it('souběžné restarty se živou vsí založí jediné nové sídlo', async () => {
    const { settlements, villages } = await playerWithVillage(false);
    const deps = { settlements, villages, landscapes, seeds: seedsFrom(777, 888, 999) };
    const results = await Promise.all(
      [1, 2, 3].map(() => restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.settlement.id : '')));
    expect(ids.size).toBe(1);
    expect(await settlements.listActive(PLAYER)).toHaveLength(1);
    expect(settlements.settlements).toHaveLength(2);
  }, 60_000);
});

describe('akce ve vymřelé vsi', () => {
  it('stavby i přejmenování odmítne česky, načíst ves jde', async () => {
    const { villages, settlementId } = await playerWithVillage(true);
    const base = { settlementId, landscape, today: TODAY };
    const deps = { villages };
    const dwelling = await placeDwelling(deps, {
      ...base,
      type: 'zemnice',
      position: at(-80, -50),
    });
    expect(dwelling).toEqual({ ok: false, reason: VILLAGE_EXTINCT });
    expect(await placeField(deps, { ...base, cells: block(10, 6, 3, 4) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await placeCemetery(deps, { ...base, cells: block(0, 12, 2, 2) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await placeOrchard(deps, { ...base, cells: block(0, 12, 2, 1) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await renameVillage(deps, { ...base, name: 'Jiná' })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(villages.records.get(settlementId)?.name).toBe('Libice');
    const loaded = await loadVillage(deps, base);
    expect(loaded?.state.extinctDay).toBe(TODAY - 39);
  });
});
