import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  PLAYER_SUCCESSION,
  isStewardOn,
  type Person,
  type Position,
  type VillageState,
} from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement } from '../found-village';
import {
  DEPARTURE_DEADLINE_PASSED,
  NO_PENDING_DEPARTURE,
  autoPlayerDeparture,
  choosePlayerDeparture,
} from '../player-departure';
import type { LandscapeSource, SeedSource } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Odchod mladšího syna po pohřbu (seniorate.md – Nástupnictví hráče, bod 4) nad repozitáři v paměti.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365.25;
const PLAYER = 'hrac-1';
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
    worldSeed: number;
    landscapes: LandscapeSource;
  };
  settlementId: string;
  villageId: string;
  sonHome: number;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.seatAtOrigin({
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
    deps: { settlements, villages, seeds: seeds(), worldSeed: 4242, landscapes },
    settlementId: seat.id,
    villageId: founded.village.id,
    sonHome,
  };
}

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

/** Hráčova ves po pohřbu otce: vojvodou je nástupce Bořek, hráč hraje za mladšího syna (los). */
async function afterFuneral(opts: { named?: boolean } = {}) {
  const base = await lordPlayer();
  const houses = new InMemoryHouses();
  const house = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  base.deps.villages.edit(base.villageId, (state: VillageState) => {
    const son = state.people.find((p) => p.id === base.sonId)!;
    if (opts.named === false) delete son.name;
    const fatherId = son.fatherId!;
    state.people = state.people.filter((p) => p.id !== fatherId);
    state.dynasty = {
      lordId: base.heirId,
      lords: [
        { id: fatherId, name: 'Otec', fromDay: TODAY - 400, toDay: TODAY },
        { id: base.heirId, name: 'Bořek', fromDay: TODAY },
      ],
    };
  });
  await houses.commitSuccession(house.id, {
    deathDay: TODAY,
    lord: { villageId: base.villageId, personId: base.sonId },
    pendingDeparture: {
      villageId: base.villageId,
      sonId: base.sonId,
      deathDay: TODAY,
      deadlineDay: TODAY + PLAYER_SUCCESSION.departDays,
    },
  });
  return { ...base, houses, house, deps: { ...base.deps, houses } };
}

describe('odchod mladšího syna po pohřbu', () => {
  it('volba ve lhůtě: výprava vyrazí hned, správce na cestě vypnutý, mateřská ves se správcem', async () => {
    const w = await afterFuneral();
    const result = await choosePlayerDeparture(w.deps, {
      playerId: PLAYER,
      villageId: w.villageId,
      direction: 'E',
      today: TODAY + 5,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.to.state.journey?.lordId).toBe(w.sonId);
    expect(result.to.state.steward?.on).toBe(false);
    expect(isStewardOn(result.from.state)).toBe(true);
    expect(result.from.state.people.map((p) => p.id)).not.toContain(w.sonId);
    expect(result.from.state.dynasty?.lordId).toBe(w.heirId);
    // hráčův muž přešel na novou ves, čekající odchod je pryč
    expect(w.house.lord).toEqual({ villageId: result.to.id, personId: w.sonId });
    expect(w.house.pendingDeparture).toBeNull();
  });

  it('opakování nic nezdvojí', async () => {
    const w = await afterFuneral();
    const input = {
      playerId: PLAYER,
      villageId: w.villageId,
      direction: 'E' as const,
      today: TODAY + 5,
    };
    const first = await choosePlayerDeparture(w.deps, input);
    expect(first.ok).toBe(true);
    const again = await choosePlayerDeparture(w.deps, input);
    expect(again).toEqual({ ok: false, reason: NO_PENDING_DEPARTURE });
    expect(await autoPlayerDeparture(w.deps, { playerId: PLAYER, today: TODAY + 40 })).toBeNull();
    expect(w.deps.villages.records.size).toBe(2);
  });

  it('syn bez jména déle než rok: jméno mu dal rod (absence.md), odejde s ním', async () => {
    // změněné očekávání jen proto, že syn v testu zůstal přes rok bez jména – dřív ho panel
    // odmítl, teď mu jméno po roce přidělí rod
    const w = await afterFuneral({ named: false });
    const input = {
      playerId: PLAYER,
      villageId: w.villageId,
      direction: 'E' as const,
      today: TODAY + 5,
    };
    const ok = await choosePlayerDeparture(w.deps, input);
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.from.state.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'son-left-village', name: expect.any(String) }),
    );
  });

  it('po lhůtě volba neprojde', async () => {
    const w = await afterFuneral();
    const late = await choosePlayerDeparture(w.deps, {
      playerId: PLAYER,
      villageId: w.villageId,
      direction: 'E',
      today: TODAY + PLAYER_SUCCESSION.departDays,
    });
    expect(late).toEqual({ ok: false, reason: DEPARTURE_DEADLINE_PASSED });
  });

  it('bez volby vyrazí 30. den sama: jméno vygenerované, správce na cestě zapnutý', async () => {
    const w = await afterFuneral({ named: false });
    expect(await autoPlayerDeparture(w.deps, { playerId: PLAYER, today: TODAY + 29 })).toBeNull();
    const result = await autoPlayerDeparture(w.deps, {
      playerId: PLAYER,
      today: TODAY + PLAYER_SUCCESSION.departDays,
    });
    if (!result?.ok) throw new Error(result?.reason ?? 'nic');
    expect(result.to.state.steward?.on).toBe(true);
    expect(result.to.state.journey?.lordId).toBe(w.sonId);
    const named = result.to.state.people.find((p) => p.id === w.sonId)?.name;
    expect(named).toBeTruthy();
    expect(isStewardOn(result.from.state)).toBe(true);
    expect(w.house.lord?.villageId).toBe(result.to.id);
    expect(w.house.pendingDeparture).toBeNull();
    // podruhé nic
    expect(await autoPlayerDeparture(w.deps, { playerId: PLAYER, today: TODAY + 31 })).toBeNull();
    expect(w.deps.villages.records.size).toBe(2);
  });
});
