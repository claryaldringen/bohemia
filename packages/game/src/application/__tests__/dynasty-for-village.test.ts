import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departWithSon,
  newSteward,
  type Dwelling,
  type StewardDeparture,
  type VillageState,
} from '../../domain/village';
import {
  DAY,
  kin,
  trackedVillage,
  village,
  type KinSpec,
} from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { advanceDynasty } from '../advance-dynasty';
import { dynastyForVillage, WORKER_LAG_DAYS } from '../dynasty-for-village';
import type { LandscapeSource, SeedSource } from '../settlements';
import { updateVillage } from '../update-village';
import type { VillageRecord } from '../villages';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

const PLAYER = 'hrac-1';
const TODAY = DAY + 10;
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const seeds = (): SeedSource => {
  let next = 4242;
  return { nextSeed: () => next++ };
};
const house = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});
const houses = [house(1, -200, -200), house(2, -160, -200), house(3, -200, -160)];

/** Ves rodu: vojvoda (muž rodu) se ženou a synem, zásoby na pár dní. */
const FAMILY: KinSpec[] = [
  { id: 10, age: 40, sex: 'male', spouse: 11 },
  { id: 11, age: 36, sex: 'female', spouse: 10 },
  { id: 12, age: 12, sex: 'male', father: 10, mother: 11 },
];
/** Ves rodu bez muže rodu – jen vdova. */
const WIDOW: KinSpec[] = [{ id: 11, age: 36, sex: 'female' }];

const tracked = (specs: KinSpec[], lastDay: number): VillageState => ({
  ...trackedVillage(specs, houses, { storesKg: 2000 }),
  lastDay,
});

type Deps = {
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
  seeds: SeedSource;
  landscapes: LandscapeSource;
};

/**
 * Hráč se dvěma vsmi, každá na vlastní mapě (sídle): zobrazená `shown` na sídelní mapě a jiná
 * `other` na mapě vedle – každá dopočítaná do dne ze zadání.
 */
async function world(
  shown: VillageState,
  other: VillageState,
): Promise<{ deps: Deps; shownId: string; otherId: string }> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const next = await settlements.create({
    ownerId: PLAYER,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  });
  const a = await villages.add(seat.id, 'Libice', shown);
  const b = await villages.add(next!.id, 'Lhota', other);
  return {
    deps: { settlements, villages, seeds: seeds(), landscapes },
    shownId: a.id,
    otherId: b.id,
  };
}

const byId = (villages: readonly VillageRecord[], id: string): VillageRecord =>
  villages.find((v) => v.id === id)!;
const input = (villageId: string): { playerId: string; villageId: string; today: number } => ({
  playerId: PLAYER,
  villageId,
  today: TODAY,
});

describe('dynastyForVillage – web dopočítá jen zobrazenou ves', () => {
  it('zobrazená ves se dopočte do dneška, jiná ves pod mezí zůstane uložená', async () => {
    const { deps, shownId, otherId } = await world(
      tracked(FAMILY, TODAY - 5),
      tracked(FAMILY, TODAY - 1),
    );
    const before = deps.villages.records.get(otherId)!;
    const status = await dynastyForVillage(deps, input(shownId));
    expect(status.villages.map((v) => v.id)).toEqual([shownId, otherId]);
    expect(byId(status.villages, shownId).state.lastDay).toBe(TODAY);
    expect(byId(status.villages, otherId)).toEqual(before);
    expect(deps.villages.records.get(otherId)!.version).toBe(before.version);
    expect(status.gameOver).toBe(false);
  });

  it(`jiná ves právě ${WORKER_LAG_DAYS} dny pozadu se nepočítá, o den víc ano`, async () => {
    const atLimit = await world(tracked(FAMILY, TODAY), tracked(FAMILY, TODAY - WORKER_LAG_DAYS));
    const limit = await dynastyForVillage(atLimit.deps, input(atLimit.shownId));
    expect(byId(limit.villages, atLimit.otherId).state.lastDay).toBe(TODAY - WORKER_LAG_DAYS);

    const over = await world(tracked(FAMILY, TODAY), tracked(FAMILY, TODAY - 5));
    const status = await dynastyForVillage(over.deps, input(over.shownId));
    expect(byId(status.villages, over.otherId).state.lastDay).toBe(TODAY);
    expect(over.deps.villages.records.get(over.otherId)!.state.lastDay).toBe(TODAY);
  });

  it('sousední ves téže mapy se dopočte do dneška i pod mezí (kontrola umístění vidí aktuální stav)', async () => {
    const settlements = new InMemorySettlements();
    const villages = new InMemoryVillages();
    const seat = await settlements.createSeat({
      ownerId: PLAYER,
      landscapeSeed: 11,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const a = await villages.add(seat.id, 'Libice', tracked(FAMILY, TODAY - 1));
    const b = await villages.add(seat.id, 'Paseka', tracked(FAMILY, TODAY - 1));
    const deps = { settlements, villages, seeds: seeds(), landscapes };
    const status = await dynastyForVillage(deps, input(a.id));
    expect(byId(status.villages, a.id).state.lastDay).toBe(TODAY);
    expect(byId(status.villages, b.id).state.lastDay).toBe(TODAY);
    expect(villages.records.get(b.id)!.state.lastDay).toBe(TODAY);
  });

  it('zobrazená ves vyjde stejně jako při plném dopočtu (determinismus)', async () => {
    const make = (): ReturnType<typeof world> =>
      world(tracked(FAMILY, TODAY - 7), tracked(FAMILY, TODAY - 2));
    const part = await make();
    const full = await make();
    const partial = await dynastyForVillage(part.deps, input(part.shownId));
    const whole = await advanceDynasty(full.deps, { playerId: PLAYER, today: TODAY });
    expect(JSON.stringify(byId(partial.villages, part.shownId).state)).toBe(
      JSON.stringify(byId(whole.villages, full.shownId).state),
    );
    // zbytek jiné vsi později (worker nebo web) – stejný stav jako dopočet vcelku
    const rest = await dynastyForVillage(part.deps, input(part.otherId));
    expect(JSON.stringify(byId(rest.villages, part.otherId).state)).toBe(
      JSON.stringify(byId(whole.villages, full.otherId).state),
    );
  });

  it('všechny vsi na dnešku – stejný výsledek jako advanceDynasty a nic se neuloží', async () => {
    const { deps, shownId } = await world(tracked(FAMILY, TODAY - 1), tracked(FAMILY, TODAY - 1));
    const full = await advanceDynasty(deps, { playerId: PLAYER, today: TODAY });
    const saves = deps.villages.saves;
    const status = await dynastyForVillage(deps, input(shownId));
    expect(status).toEqual(full);
    expect(deps.villages.saves).toBe(saves);
  });

  it('akce na zobrazené vsi dopadne stejně jako po plném dopočtu', async () => {
    const make = (): ReturnType<typeof world> =>
      world(tracked(FAMILY, TODAY - 4), tracked(FAMILY, TODAY - 2));
    const act = (deps: Deps, villageId: string): ReturnType<typeof updateVillage> =>
      updateVillage(deps.villages, villageId, TODAY, landscape, (state) => ({
        ok: true,
        state: { ...state, storesKg: state.storesKg + 100 },
      }));
    const part = await make();
    const full = await make();
    await dynastyForVillage(part.deps, input(part.shownId));
    await advanceDynasty(full.deps, { playerId: PLAYER, today: TODAY });
    const a = await act(part.deps, part.shownId);
    const b = await act(full.deps, full.shownId);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.village.state)).toBe(JSON.stringify(b.village.state));
  });

  it('skutečný konec rodu ze smíšených dnů se ověří plným dopočtem', async () => {
    const { deps, shownId, otherId } = await world(
      tracked(WIDOW, TODAY - 1),
      tracked(WIDOW, TODAY - 2),
    );
    const status = await dynastyForVillage(deps, input(shownId));
    expect(status.gameOver).toBe(true);
    // plný dopočet: i jiná ves je na dnešku a zanikla s koncem rodu
    const other = byId(status.villages, otherId).state;
    expect(other.lastDay).toBe(TODAY);
    expect(other.abandonedDay).toBeDefined();
  });

  it('falešný konec rodu ze smíšených dnů se nepotvrdí', async () => {
    // jiná ves uložená před rodem: muže rodu dostane až při dopočtu (převod) – za zbytek dnů se
    // stav změní stejně, jako kdyby se tam mezitím narodil chlapec
    const beforeLine = village(
      FAMILY.map((spec) => kin(spec)),
      houses,
      { storesKg: 2000, lastDay: TODAY - 2 },
    );
    const { deps, shownId, otherId } = await world(tracked(WIDOW, TODAY), beforeLine);
    const status = await dynastyForVillage(deps, input(shownId));
    expect(status.gameOver).toBe(false);
    expect(byId(status.villages, otherId).state.lastDay).toBe(TODAY);
    expect(byId(status.villages, shownId).state.abandonedDay).toBeUndefined();
  });

  it('nová ves syna ze schránky zobrazené vsi se v přepínači objeví hned', async () => {
    const mother = trackedVillage(
      [
        { id: 10, age: 60, sex: 'male', spouse: 11 },
        { id: 11, age: 55, sex: 'female', spouse: 10 },
        { id: 20, age: 30, sex: 'male', spouse: 21, father: 10, mother: 11, home: 2 },
        { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
        { id: 30, age: 24, sex: 'male', spouse: 31, father: 10, mother: 11, home: 3 },
        { id: 31, age: 22, sex: 'female', spouse: 30, home: 3 },
      ],
      houses,
      { storesKg: 2000, steward: newSteward(TODAY, true) },
    );
    for (const p of mother.people) {
      if (p.id === 20) p.mainWifeSon = true;
      if (p.id === 20) p.name = 'Bořek';
      if (p.id === 30) p.name = 'Bořivoj';
    }
    mother.lastDay = TODAY;
    const departed = departWithSon(mother, TODAY, 30, { villageName: 'Kouřim' });
    const record: StewardDeparture = {
      id: TODAY,
      sonId: 30,
      seed: 99,
      name: 'Kouřim',
      dwelling: { x: 200, z: 200, rotation: 0 },
      directions: [{ direction: 'N', travelDays: 2 }],
      settlers: departed.settlers,
    };
    const shown: VillageState = {
      ...departed.state,
      steward: { ...departed.state.steward!, departures: [record] },
    };
    const { deps, shownId } = await world(shown, tracked(FAMILY, TODAY - 1));
    const status = await dynastyForVillage(deps, input(shownId));
    expect(status.villages.map((v) => v.name)).toContain('Kouřim');
    expect(status.villages).toHaveLength(3);
  });
});
