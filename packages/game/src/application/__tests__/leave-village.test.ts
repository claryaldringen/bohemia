import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  SUCCESSOR_STAYS,
  isVillageTravelling,
  type Person,
  type Position,
  type VillageState,
} from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement } from '../found-village';
import {
  LEAVE_ONLY_TO_NEW_MAP,
  NOT_ARRIVED,
  OWN_MAP_THERE,
  leaveVillage,
  settleJourney,
  type LeaveDestination,
} from '../leave-village';
import { loadVillage } from '../load-village';
import { setSteward } from '../set-steward';
import { placeDwelling } from '../place-dwelling';
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

describe('leaveVillage – jedna ves, jedna mapa', () => {
  it('cíl na téže mapě (dřívější `here`) server odmítne a nic nezmění', async () => {
    const { deps, villageId, sonHome } = await player();
    const here = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'here', dwelling: at(200, 200) } as unknown as LeaveDestination,
    });
    expect(here).toEqual({ ok: false, reason: LEAVE_ONLY_TO_NEW_MAP });
    const empty = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [12345],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(empty.ok).toBe(false);
    expect(deps.villages.records.size).toBe(1);
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(7);
  });

  it('odejdou-li všichni, stará ves je opuštěná a akce v ní nejdou; každé sídlo má jednu ves', async () => {
    const { deps, settlementId, villageId, sonHome } = await player();
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [1, sonHome],
      destination: { kind: 'map', direction: 'E' },
    });
    if (!left.ok) throw new Error(left.reason);
    expect(left.from.state.abandonedDay).toBe(TODAY + 1);
    expect(left.to.settlementId).not.toBe(settlementId);
    expect(await deps.villages.listBySettlement(settlementId)).toHaveLength(1);
    expect(await deps.villages.listBySettlement(left.to.settlementId)).toHaveLength(1);
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

/**
 * Hráčova ves s rodem: syn zakladatelů z druhé zemnice dostane jméno Bořivoj (muž rodu) a v dvorci
 * žije nástupce Bořek (17 let, syn hlavní manželky). Vrací id obou.
 */
async function lordPlayer(): Promise<
  Awaited<ReturnType<typeof player>> & { sonId: number; heirId: number }
> {
  const base = await player();
  let sonId = 0;
  let heirId = 0;
  base.deps.villages.edit(base.villageId, (state: VillageState) => {
    const son = state.people.find((p) => p.dwellingId === base.sonHome && p.sex === 'male')!;
    son.line = true;
    son.name = 'Bořivoj';
    sonId = son.id;
    const heir: Person = {
      id: state.nextId++,
      bornDay: TODAY - Math.ceil(17 * YEAR),
      dwellingId: state.manorId ?? 1,
      sex: 'male',
      fatherId: son.fatherId!,
      motherId: son.motherId!,
      line: true,
      mainWifeSon: true,
      name: 'Bořek',
    };
    heirId = heir.id;
    state.people.push(heir);
  });
  return { ...base, sonId, heirId };
}

describe('leaveVillage – syn vojvody s poměrnou částí vsi', () => {
  it('syn odejde se svou rodinou a v nové vsi je vojvodou; kronika zná jméno nové vsi', async () => {
    const { deps, villageId, sonId } = await lordPlayer();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      sonId,
      destination: { kind: 'map', direction: 'E' },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.to.settlementId).not.toBe(result.from.settlementId);
    expect(result.to.state.people.map((p) => p.id)).toContain(sonId);
    // na cestě vede syn (po příjezdu je vojvodou – test níž)
    expect(result.to.state.journey?.lordId).toBe(sonId);
    expect(result.from.state.people.map((p) => p.id)).not.toContain(sonId);
    expect(result.from.state.chronicle).toContainEqual(
      expect.objectContaining({
        kind: 'son-left-village',
        name: 'Bořivoj',
        village: result.to.name,
      }),
    );
  });

  it('nástupce odchod nevede – server odmítne a nic nezmění', async () => {
    const { deps, villageId, heirId } = await lordPlayer();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      sonId: heirId,
      destination: { kind: 'map', direction: 'E' },
    });
    expect(result).toEqual({ ok: false, reason: SUCCESSOR_STAYS });
    expect(deps.villages.records.size).toBe(1);
  });

  it('správce se dá přepnout i u vsi na cestě – zapnutý příjezd založí, vypnutý ho vrátí hráči', async () => {
    const { deps, villageId, sonId } = await lordPlayer();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      sonId,
      destination: { kind: 'map', direction: 'N' },
    });
    if (!result.ok) throw new Error(result.reason);
    const arrival = result.to.state.journey!.arrivalDay;
    const base = { playerId: PLAYER, villageId: result.to.id, landscape };
    const on = await setSteward(deps, { ...base, today: TODAY + 2, on: true });
    expect(on.ok && on.village.state.steward?.on).toBe(true);
    const off = await setSteward(deps, { ...base, today: TODAY + 2, on: false });
    expect(off.ok && off.village.state.steward?.on).toBe(false);
    const again = await setSteward(deps, { ...base, today: TODAY + 2, on: true });
    expect(again.ok).toBe(true);
    const loaded = await loadVillage(deps, {
      villageId: result.to.id,
      today: arrival + 3,
      landscape,
    });
    expect(isVillageTravelling(loaded!.state)).toBe(false);
    expect(loaded!.state.steward?.on).toBe(true);
  });

  it('na novou mapu: vůdce ves na cestě drží a po příjezdu je vojvodou', async () => {
    const { deps, villageId, sonId } = await lordPlayer();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      sonId,
      destination: { kind: 'map', direction: 'N' },
    });
    if (!result.ok) throw new Error(result.reason);
    const journey = result.to.state.journey!;
    expect(journey.lordId).toBe(sonId);
    // odchod spuštěný hráčem sám založit nejde – správce na cestě je vypnutý a ves čeká na hráče
    expect(result.to.state.steward?.on).toBe(false);
    const late = await loadVillage(deps, {
      villageId: result.to.id,
      today: journey.arrivalDay + 3,
      landscape,
    });
    expect(isVillageTravelling(late!.state)).toBe(true);
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: result.to.id,
      today: journey.arrivalDay,
      dwelling: at(0, 0),
    });
    if (!settled.ok) throw new Error(settled.reason);
    expect(settled.village.state.dynasty?.lordId).toBe(sonId);
    expect(settled.village.state.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'lord', name: 'Bořivoj' }),
    );
  });
});
