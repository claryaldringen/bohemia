import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, generateAcceptedLandscape } from '../../domain/landscape';
import { isolatedLandscapeSeed } from '../../domain/world';
import {
  SUCCESSOR_STAYS,
  isVillageTravelling,
  type MerchantStop,
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
  FOREIGN_MAP_THERE,
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
import { coinsOfWorld } from './market-world';

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
 * Ves zakladatelů rodu – vojvoda s manželkami a čtyřmi syny, dostavěná zemnice (lord.md –
 * Zakladatelé) – a rodina dalšího syna v druhé zemnici – 11 lidí.
 */
async function player(isolated = false): Promise<{
  deps: {
    settlements: InMemorySettlements;
    villages: InMemoryVillages;
    seeds: SeedSource;
    worldSeed: number;
    landscapes: LandscapeSource;
  };
  settlementId: string;
  villageId: string;
  sonHome: number;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  // sídelní sídlo s prémiovou krajinou – nové mapy synů jsou průměrné (premium-landscapes.md)
  const seatInput = {
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
    premiumType: 'fertile' as const,
  };
  const seat = isolated
    ? (await settlements.createSeat({ ...seatInput, localCell: { x: 0, y: 0 } }))!
    : await settlements.seatAtOrigin(seatInput);
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
    deps: { settlements, villages, seeds: seeds(), worldSeed: 4242, landscapes },
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
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(11);
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

describe('leaveVillage – celá ves bere úplně vše (migration.md – Co si vezmou)', () => {
  it('přes cestu i založení nové vsi: nic nezmizí, snědlo se jen jídlo dne založení', async () => {
    const { deps, villageId, sonHome } = await player();
    deps.villages.edit(villageId, (state: VillageState) => {
      // zakladatelé mají rezervu osiva 3 240 kg (FOUNDERS_STORES)
      state.storesKg = 5000;
      state.crafts = { charcoalKg: 80, potteryKg: 0, ironBarsKg: 25, bloomKg: 4 };
      state.wares = { hides: 3, sheepFurs: 5, wildFurs: 2, honeyKg: 8, waxKg: 1 };
      state.ards = 1;
      state.carts = [
        { id: 800, kind: 'two-wheel', builtDay: TODAY - 100 },
        { id: 801, kind: 'four-wheel', builtDay: TODAY - 50 },
      ];
      state.looseOxen = [{ trainedDay: TODAY - 300 }, { trainedDay: TODAY + 200 }];
      state.hay = { kg: 640, mowing: null };
      state.cheeseKg = 30;
      state.woodLogs = 9;
      state.logStacks = [{ id: 802, fieldId: 0, x: -190, z: -190, logs: 9 }];
    });
    const today = TODAY + 1;
    const before = (await loadVillage(deps, { villageId, today, landscape }))!.state;
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today,
      dwellingIds: [1, sonHome],
      destination: { kind: 'map', direction: 'E' },
    });
    if (!left.ok) throw new Error(left.reason);
    const old = left.from.state;
    const onTheWay = left.to.state;
    // ve staré vsi nezbylo nic než stavby a hromada klád
    expect(old).toMatchObject({ abandonedDay: today, storesKg: 0, cheeseKg: 0 });
    expect(old.woodLogs).toBe(before.woodLogs);
    expect(old.logStacks).toEqual(before.logStacks);
    expect(old.crafts).toBeUndefined();
    expect(old.wares).toBeUndefined();
    expect(old.carts).toBeUndefined();
    expect(old.hay).toMatchObject({ kg: 0 });
    expect(old.livestock!.herds).toEqual({ sheep: 0, goat: 0, pig: 0, cow: 0 });
    expect(old.dwellings).toHaveLength(2);
    // ves na cestě má všechno
    for (const key of [
      'storesKg',
      'meatKg',
      'slaughterMeatKg',
      'cheeseKg',
      'crafts',
      'wares',
      'ards',
      'hay',
      'looseOxen',
      'carts',
    ] as const) {
      expect([key, onTheWay[key]]).toEqual([key, before[key]]);
    }
    expect(before.reservedSeedKg).toBeGreaterThan(3000);
    expect(onTheWay.reservedSeedKg).toBe(before.reservedSeedKg);
    expect(onTheWay.reservedSeedUntilDay).toBe(before.reservedSeedUntilDay);
    expect(onTheWay.livestock!.herds).toEqual(before.livestock!.herds);
    const arrival = onTheWay.journey!.arrivalDay;
    const travelled = (await loadVillage(deps, {
      villageId: left.to.id,
      today: arrival,
      landscape,
    }))!.state;
    // cestou se nic nesnědlo (ves na cestě se nesimuluje)
    expect(travelled.storesKg).toBe(before.storesKg);
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: left.to.id,
      today: arrival,
      dwelling: at(0, 0),
    });
    if (!settled.ok) throw new Error(settled.reason);
    const fresh = settled.village.state;
    expect(fresh.people).toHaveLength(before.people.length);
    expect(fresh.crafts).toEqual(before.crafts);
    expect(fresh.wares).toMatchObject({ hides: 3, sheepFurs: 5, wildFurs: 2 });
    expect(fresh.ards).toBe(1);
    expect(fresh.carts!.map((c) => c.kind)).toEqual(['two-wheel', 'four-wheel']);
    expect(fresh.looseOxen).toEqual(before.looseOxen);
    expect(fresh.reservedSeedKg).toBe(before.reservedSeedKg);
    expect(fresh.reservedSeedUntilDay).toBe(before.reservedSeedUntilDay);
    // jídlo: den založení se snědl (nejvýš denní potřeba všech)
    const eaten = before.storesKg - fresh.storesKg;
    expect(eaten).toBeGreaterThan(0);
    expect(eaten).toBeLessThan(before.people.length * 1.5);
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
    // prémie patří první mapě – nová mapa na mapě světa je průměrná
    expect(seat.premiumType).toBe('fertile');
    expect(result.settlement.premiumType ?? null).toBeNull();
    expect(result.settlement.layerVersions).toEqual(CURRENT_LAYER_VERSIONS);
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

  it.each<[string, MerchantStop[] | undefined]>([
    ['zastávky nové mapy', [{ key: '0,0,E', seed: 7, index: 3, length: 20 }]],
    ['mapa bez stezky', []],
    ['nezjištěné', undefined],
  ])(
    'zastávky kupců ves na cestě přenese do založené vsi (markets.md, Rozhodnutí plánu 4, bod 5) – %s',
    async (_name, stops) => {
      const { deps, villageId, sonHome } = await player();
      const left = await leaveVillage(deps, {
        playerId: PLAYER,
        villageId,
        today: TODAY + 1,
        dwellingIds: [sonHome],
        destination: { kind: 'map', direction: 'N' },
      });
      if (!left.ok) throw new Error(left.reason);
      deps.villages.edit(left.to.id, (state) => {
        if (stops) state.merchantStops = structuredClone(stops);
      });
      const settled = await settleJourney(deps, {
        playerId: PLAYER,
        villageId: left.to.id,
        today: left.to.state.journey!.arrivalDay,
        dwelling: at(0, 0),
      });
      if (!settled.ok) throw new Error(settled.reason);
      expect(settled.village.state.journey).toBeUndefined();
      if (stops) expect(settled.village.state.merchantStops).toEqual(stops);
      else expect(settled.village.state).not.toHaveProperty('merchantStops');
    },
  );

  it('zastávky, které ves na cestě dostane až při založení, se neztratí', async () => {
    const { deps, villageId, sonHome } = await player();
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'N' },
    });
    if (!left.ok) throw new Error(left.reason);
    const stop: MerchantStop = { key: '0,0,E', seed: 7, index: 3, length: 20 };
    const asked: string[] = [];
    deps.villages.merchantStopsOf = async (settlementId) => {
      await Promise.resolve();
      asked.push(settlementId);
      return [stop];
    };
    const arrival = left.to.state.journey!.arrivalDay;
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: left.to.id,
      today: arrival,
      dwelling: at(0, 0),
    });
    if (!settled.ok) throw new Error(settled.reason);
    expect(settled.village.state.merchantStops).toEqual([stop]);
    // ptala se na sídlo nové mapy a jen jednou – i po dalším načtení
    await loadVillage(deps, { villageId: left.to.id, today: arrival + 2, landscape });
    expect(asked).toEqual([left.settlement.id]);
  });

  it('odříznutý rod: odchod na východ založí odříznuté sídlo (1, 0) v místní mřížce s vlastní krajinou', async () => {
    const { deps, villageId, sonHome } = await player(true);
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement).toMatchObject({
      isSeat: false,
      worldCell: null,
      localCell: { x: 1, y: 0 },
    });
    const accepted = generateAcceptedLandscape(
      isolatedLandscapeSeed(deps.worldSeed, `${PLAYER}:1,0`),
    );
    expect(result.settlement.landscapeSeed).toBe(accepted.seed);
    // nová mapa v místní mřížce je průměrná (prémie patří první mapě)
    expect(result.settlement.premiumType ?? null).toBeNull();
    expect(result.settlement.layerVersions).toEqual(CURRENT_LAYER_VERSIONS);
    // mapa světa zůstane prázdná – nikdo odříznutý rod nevidí
    expect(await deps.settlements.occupiedCells()).toEqual([]);
    // tímtéž směrem znovu: vlastní ves už tam stojí
    const again = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(again).toEqual({ ok: false, reason: OWN_MAP_THERE });
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
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(9);
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

  it('na políčku leží mapa jiného hráče – odmítne a nic nezmění', async () => {
    const { deps, villageId, sonHome } = await player();
    const foreign = await deps.settlements.create({
      ownerId: 'cizi-hrac',
      landscapeSeed: 99,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    expect(foreign).not.toBeNull();
    const result = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'E' },
    });
    expect(result).toEqual({ ok: false, reason: FOREIGN_MAP_THERE });
    expect((await deps.villages.find(villageId))!.state.people).toHaveLength(11);
    expect(await deps.settlements.listActive(PLAYER)).toHaveLength(1);
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
    // nástupce – nejstarší syn hlavní manželky mezi zakladateli (lord.md – Zakladatelé, Nástupnictví)
    heirId = state.people.find((p) => p.fatherId === son.fatherId && p.mainWifeSon === true)!.id;
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

describe('leaveVillage – mince a zbroj (markets.md – Rozhodnutí plánu 4, bod 9)', () => {
  /** 40 mincí a meč do zásob vsi. */
  function enrich(deps: { villages: InMemoryVillages }, villageId: string): void {
    deps.villages.edit(villageId, (state) => {
      state.coins = 40;
      state.arms = { swords: 1 };
    });
  }

  it.each(['hráč (settleJourney)', 'správce (stewardArrival)'] as const)(
    'odejdou všichni a ves založí %s: mince a meč jdou s nimi, ve staré vsi nezbylo nic',
    async (founder) => {
      const { deps, villageId, sonHome } = await player();
      enrich(deps, villageId);
      const coins = async (): Promise<void> => expect(await coinsOfWorld(deps)).toBe(40);
      await coins();
      const left = await leaveVillage(deps, {
        playerId: PLAYER,
        villageId,
        today: TODAY + 1,
        dwellingIds: [1, sonHome],
        destination: { kind: 'map', direction: 'E' },
      });
      if (!left.ok) throw new Error(left.reason);
      const old = left.from.state;
      expect(old.abandonedDay).toBe(TODAY + 1);
      expect(old).not.toHaveProperty('coins');
      expect(old).not.toHaveProperty('arms');
      expect(left.to.state).toMatchObject({ coins: 40, arms: { swords: 1 } });
      await coins();
      const arrival = left.to.state.journey!.arrivalDay;
      const base = { playerId: PLAYER, villageId: left.to.id };
      if (founder.startsWith('správce')) {
        const on = await setSteward(deps, { ...base, today: TODAY + 1, landscape, on: true });
        expect(on.ok).toBe(true);
        await loadVillage(deps, { villageId: left.to.id, today: arrival, landscape });
      } else {
        await loadVillage(deps, { villageId: left.to.id, today: arrival, landscape });
        await coins();
        const settled = await settleJourney(deps, { ...base, today: arrival, dwelling: at(0, 0) });
        if (!settled.ok) throw new Error(settled.reason);
      }
      const fresh = (await deps.villages.find(left.to.id))!.state;
      expect(isVillageTravelling(fresh)).toBe(false);
      expect(fresh.foundedDay).toBe(arrival);
      expect(fresh.coins).toBe(40);
      expect(fresh.arms).toStrictEqual({ swords: 1 });
      await coins();
      const stored = (await deps.villages.find(villageId))!.state;
      expect(stored).not.toHaveProperty('coins');
      expect(stored).not.toHaveProperty('arms');
    },
  );

  it('odejde část domácností: mince a zbroj zůstanou celé ve staré vsi, v nové nejsou', async () => {
    const { deps, villageId, sonHome } = await player();
    enrich(deps, villageId);
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      dwellingIds: [sonHome],
      destination: { kind: 'map', direction: 'N' },
    });
    if (!left.ok) throw new Error(left.reason);
    expect(left.from.state).toMatchObject({ coins: 40, arms: { swords: 1 } });
    expect(left.from.state).not.toHaveProperty('abandonedDay');
    expect(await coinsOfWorld(deps)).toBe(40);
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: left.to.id,
      today: left.to.state.journey!.arrivalDay,
      dwelling: at(0, 0),
    });
    if (!settled.ok) throw new Error(settled.reason);
    for (const state of [left.to.state, settled.village.state]) {
      expect(state).not.toHaveProperty('coins');
      expect(state).not.toHaveProperty('arms');
    }
    expect(await coinsOfWorld(deps)).toBe(40);
  });

  it('odejde syn (departWithSon): mince a zbroj zůstanou celé ve staré vsi, v nové nejsou', async () => {
    const { deps, villageId, sonId } = await lordPlayer();
    enrich(deps, villageId);
    const left = await leaveVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY + 1,
      sonId,
      destination: { kind: 'map', direction: 'N' },
    });
    if (!left.ok) throw new Error(left.reason);
    expect(left.from.state).toMatchObject({ coins: 40, arms: { swords: 1 } });
    expect(await coinsOfWorld(deps)).toBe(40);
    const settled = await settleJourney(deps, {
      playerId: PLAYER,
      villageId: left.to.id,
      today: left.to.state.journey!.arrivalDay,
      dwelling: at(0, 0),
    });
    if (!settled.ok) throw new Error(settled.reason);
    for (const state of [left.to.state, settled.village.state]) {
      expect(state).not.toHaveProperty('coins');
      expect(state).not.toHaveProperty('arms');
    }
    expect(await coinsOfWorld(deps)).toBe(40);
  });
});
