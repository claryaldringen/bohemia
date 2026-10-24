import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { FOREIGN_LAND, type Person, type Position, type VillageState } from '../../domain/village';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement, TOO_CLOSE_TO_VILLAGE } from '../found-village';
import { NOT_ARRIVED, OWN_MAP_THERE, leaveVillage, settleJourney } from '../leave-village';
import { loadVillage } from '../load-village';
import { placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { dynastyStatus } from '../restart-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { VILLAGE_ABANDONED, VILLAGE_TRAVELLING } from '../update-village';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Odchod do nové vsi (migration.md – fáze 3 a 4) nad repozitáři v paměti.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365.25;
const PLAYER = 'hrac-1';
/** Krajina 48 × 48 políček (720 m) – pro všechna sídla stejná. */
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });
const seeds = (): SeedSource => {
  let next = 4242;
  return { nextSeed: () => next++ };
};

/**
 * Ves zakladatelů rodu – vojvoda s manželkami, dostavěná zemnice (lord.md – Zakladatelé) – a rodina
 * syna v druhé zemnici – 7 lidí.
 */
async function player(): Promise<{
  deps: {
    settlements: InMemorySettlements;
    villages: InMemoryVillages;
    seeds: SeedSource;
    landscapes: LandscapeSource;
  };
  settlementId: string;
  villageId: string;
  sonHome: number;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: seeds() },
    { settlementId: seat.id, landscape, today: TODAY, name: 'Libice', dwelling: at(-200, -200) },
  );
  if (!founded.ok) throw new Error(founded.reason);
  let sonHome = 0;
  villages.edit(founded.village.id, (state: VillageState) => {
    Object.assign(state, withBuiltFirstDwelling(state));
    sonHome = state.nextId++;
    state.dwellings.push({
      id: sonHome,
      type: 'zemnice',
      builtDay: TODAY,
      condition: 1,
      position: at(-150, -200),
    });
    // syn zakladatelů (manželé ze zakladatelů jsou jeho rodiče)
    const father = state.people.find((p) => p.sex === 'male' && p.spouseId !== undefined)!;
    const son: Person = {
      id: state.nextId++,
      bornDay: TODAY - Math.ceil(22 * YEAR),
      dwellingId: sonHome,
      sex: 'male',
      fatherId: father.id,
      motherId: father.spouseId!,
    };
    const wife: Person = {
      id: state.nextId++,
      bornDay: TODAY - Math.ceil(21 * YEAR),
      dwellingId: sonHome,
      sex: 'female',
      spouseId: son.id,
    };
    son.spouseId = wife.id;
    state.people.push(son, wife);
    state.storesKg = 1500;
  });
  return {
    deps: { settlements, villages, seeds: seeds(), landscapes },
    settlementId: seat.id,
    villageId: founded.village.id,
    sonHome,
  };
}

describe('leaveVillage – na téže mapě', () => {
  it('domácnost založí druhou ves daleko od staré – s jídlem a dílem stád', async () => {
    const { deps, settlementId, villageId, sonHome } = await player();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'here', dwelling: at(200, 200) },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).toBe(settlementId);
    expect(result.to.settlementId).toBe(settlementId);
    expect(result.to.state.people).toHaveLength(2);
    expect(result.to.state.constructions[0]).toMatchObject({ dwellingType: 'zemnice' });
    expect(result.to.state.constructions[0]!.position).toEqual(at(200, 200));
    expect(result.to.state.storesKg).toBeGreaterThan(0);
    // zůstalo 5 zakladatelů rodu
    expect(result.from.state.people).toHaveLength(5);
    expect(result.from.state.chronicle.at(-1)).toMatchObject({
      kind: 'households-left',
      people: 2,
    });
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 2 });
    expect(status.villages).toHaveLength(2);
  });

  it('příliš blízko staré vsi nebo z prázdného domu odmítne a nic nezmění', async () => {
    const { deps, villageId, sonHome } = await player();
    const near = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'here', dwelling: at(-100, -100) },
    });
    expect(near).toEqual({ ok: false, reason: TOO_CLOSE_TO_VILLAGE });
    const empty = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [12345],
      destination: { kind: 'here', dwelling: at(200, 200) },
    });
    expect(empty.ok).toBe(false);
    expect(deps.villages.records.size).toBe(1);
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(7);
  });

  it('stará ves zná novou: pole přes její staveniště nejde', async () => {
    const { deps, villageId, sonHome } = await player();
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'here', dwelling: at(200, 200) },
    });
    if (!left.ok) throw new Error(left.reason);
    // políčka 36–38 × 37–38 = svět 180–225 × 195–225 m – přes první zemnici nové vsi
    const result = await placeField(deps, {
      villageId,
      landscape,
      today: TODAY + 2,
      cells: block(36, 37, 3, 2),
    });
    expect(result).toEqual({ ok: false, reason: FOREIGN_LAND });
  });

  it('odejdou-li všichni, stará ves je opuštěná a akce v ní nejdou', async () => {
    const { deps, villageId, sonHome } = await player();
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [1, sonHome],
      destination: { kind: 'here', dwelling: at(200, 200) },
    });
    if (!left.ok) throw new Error(left.reason);
    expect(left.from.state.abandonedDay).toBe(TODAY + 1);
    const result = await placeDwelling(deps, {
      villageId,
      landscape,
      today: TODAY + 2,
      type: 'zemnice',
      position: at(-250, -250),
    });
    expect(result).toEqual({ ok: false, reason: VILLAGE_ABANDONED });
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 3 });
    expect(status.gameOver).toBe(false);
  });
});

describe('leaveVillage – na novou mapu', () => {
  it('sídelní sídlo dostane (0, 0), nové sídlo vedle, lidé dorazí za 1–3 dny', async () => {
    const { deps, settlementId, villageId, sonHome } = await player();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'N' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat = deps.settlements.settlements.find((s) => s.id === settlementId)!;
    expect(seat.worldCell).toEqual({ x: 0, y: 0 });
    expect(result.settlement).toMatchObject({ isSeat: false, worldCell: { x: 0, y: 1 } });
    const journey = result.to.state.journey!;
    expect(journey.direction).toBe('N');
    expect(journey.arrivalDay - journey.departedDay).toBeGreaterThanOrEqual(1);
    expect(journey.arrivalDay - journey.departedDay).toBeLessThanOrEqual(3);
    expect(result.to.state.people).toHaveLength(2);
    // stará ves si pamatuje, kam odešli (war.md)
    expect(result.from.state.emigrants?.map((e) => e.direction)).toContain('N');
    expect(result.from.state.emigrants?.every((e) => e.direction === 'N')).toBe(true);

    // na cestě se ves nesimuluje a nestaví
    const travelling = result.to.id;
    const place = await placeDwelling(deps, {
      villageId: travelling,
      landscape,
      today: TODAY + 1,
      type: 'zemnice',
      position: at(0, 0),
    });
    expect(place).toEqual({ ok: false, reason: VILLAGE_TRAVELLING });
    const early = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: travelling,
      today: journey.arrivalDay - 1,
      dwelling: at(0, 0),
    });
    expect(early).toEqual({ ok: false, reason: NOT_ARRIVED });

    // po příjezdu hráč umístí první zemnici – ves stojí
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: travelling,
      today: journey.arrivalDay,
      dwelling: at(0, 0),
    });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.village.state.journey).toBeUndefined();
    expect(settled.village.state.people).toHaveLength(2);
    expect(settled.village.state.constructions[0]!.position).toEqual(at(0, 0));
    expect(settled.village.state.chronicle.map((e) => e.kind)).toContain('journey-started');
    const later = await loadVillage(deps, {
      villageId: travelling,
      today: journey.arrivalDay + 30,
      landscape,
    });
    expect(later!.state.lastDay).toBe(journey.arrivalDay + 30);
  });

  it('tím směrem už vlastní ves – odmítne; jiným směrem nové sídlo', async () => {
    const { deps, villageId, sonHome } = await player();
    const first = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(first.ok).toBe(true);
    const again = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [1],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(again).toEqual({ ok: false, reason: OWN_MAP_THERE });
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(5);
    const west = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [1],
      destination: { kind: 'map', direction: 'W' },
    });
    expect(west.ok).toBe(true);
    if (!west.ok) return;
    expect(west.settlement.worldCell).toEqual({ x: -1, y: 0 });
    expect(west.from.state.abandonedDay).toBe(TODAY + 1);
  });
});
