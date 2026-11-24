import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departWithSon,
  isVillageTravelling,
  newSteward,
  pendingStewardDepartures,
  type Dwelling,
  type Position,
  type StewardDeparture,
  type VillageState,
} from '../../domain/village';
import { DAY, trackedVillage, type KinSpec } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { D } from '../../domain/village/trade/__tests__/market-fixtures';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import {
  advancePlayer,
  advanceWorldStep,
  WORLD_STEP_DAYS,
  type WorldStep,
  type WorldStepDeps,
} from '../advance-world';
import { awakeSince } from '../activity';
import { dynastyForVillage } from '../dynasty-for-village';
import { isFullVillage } from '../villages';
import { loadVillage } from '../load-village';
import { NEARBY_REFRESH_DAYS } from '../nearby';
import type { LandscapeSource } from '../settlements';
import { deliverVillageMail } from '../village-mail';
import type { PlayerLock } from '../locks';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWorldQueue } from './in-memory-world-queue';
import { H_PLAYER, M_PLAYER, marketWorld, returnedOf, type MarketWorld } from './market-world';

const TODAY = DAY + 30;
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
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
const asleep = (lastDay: number): VillageState => ({
  ...tracked(FAMILY, lastDay),
  extinctDay: lastDay,
});

/**
 * Stav vsi jako JSON bez okolí (nearby.ts): okolí zapíše worker po dávce na `lastDay + 1`, den
 * snímku tak závisí na dávkách (technická mez – markets.md, Rozhodnutí plánu 3, bod 1); zbytek stavu
 * na dávkách nezávisí. Okolí testy ověří zvlášť.
 */
function withoutNearby(state: VillageState): string {
  const copy = structuredClone(state);
  delete copy.nearby;
  return JSON.stringify(copy);
}

/** Okolí vsi samotné na mapě – snímek bez sousedů ze dne `day`. */
const loneNearby = (villageId: string, name: string, day: number): VillageState['nearby'] => ({
  day,
  self: { villageId, name },
  villages: [],
});

/** Svět v paměti – každá ves hráče na vlastní mapě (ves samotná na mapě). */
class World {
  readonly settlements = new InMemorySettlements();
  readonly villages = new InMemoryVillages();
  readonly offsets = new InMemoryTimeOffsets();
  readonly locks = new InMemoryPlayerLock();
  private players = 0;
  readonly deps: WorldStepDeps = {
    settlements: this.settlements,
    villages: this.villages,
    landscapes,
    worldSeed: 4242,
    locks: this.locks,
    queue: new InMemoryWorldQueue(this.settlements, this.villages, this.offsets),
  };

  /** Hráč se vsemi (první na sídelní mapě, další na mapách vedle) – vrátí id vsí. */
  async player(playerId: string, states: VillageState[]): Promise<string[]> {
    const ids: string[] = [];
    const base = 16 * this.players++; // každý hráč ve svém pásu mřížky
    for (const [i, state] of states.entries()) {
      const place = {
        ownerId: playerId,
        landscapeSeed: 11 + i,
        layerVersions: CURRENT_LAYER_VERSIONS,
      };
      const settlement =
        i === 0
          ? await this.settlements.createSeat({ ...place, worldCell: { x: base, y: 0 } })
          : await this.settlements.create({ ...place, worldCell: { x: base + i, y: 0 } });
      ids.push((await this.villages.add(settlement!.id, `Ves ${i}`, state)).id);
    }
    return ids;
  }

  state(villageId: string): VillageState {
    return this.villages.records.get(villageId)!.state;
  }

  step(stepDays = WORLD_STEP_DAYS, skip?: ReadonlySet<string>): Promise<WorldStep> {
    return advanceWorldStep(this.deps, { worldDay: TODAY, stepDays, limit: 10, skip });
  }

  /** Kola, dokud je co dělat – vrátí jejich počet. */
  async untilIdle(stepDays = WORLD_STEP_DAYS): Promise<number> {
    for (let rounds = 0; rounds < 100; rounds++) {
      if ((await this.step(stepDays)).idle) return rounds;
    }
    throw new Error('Worker nedošel do dneška.');
  }
}

/** Den, kdy syn se správcem odešel z mateřské vsi. */
const LEFT = TODAY - 3;

/**
 * Mateřská ves hráče `hrac-a` se správcem, ze které v den `LEFT` odešel syn Bořivoj (30) do vsi
 * Kouřim – na místo `dwelling` téže mapy, bez něj na novou mapu na sever. Vrátí id mateřské vsi.
 */
async function departure(world: World, dwelling?: Position): Promise<string> {
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
    { storesKg: 2000, steward: newSteward(LEFT, true) },
  );
  for (const p of mother.people) {
    if (p.id === 20) p.mainWifeSon = true;
    if (p.id === 20) p.name = 'Bořek';
    if (p.id === 30) p.name = 'Bořivoj';
  }
  mother.lastDay = LEFT;
  const departed = departWithSon(mother, LEFT, 30, { villageName: 'Kouřim' });
  const record: StewardDeparture = {
    id: LEFT,
    sonId: 30,
    seed: 99,
    name: 'Kouřim',
    ...(dwelling ? { dwelling } : {}),
    directions: [{ direction: 'N', travelDays: 2 }],
    settlers: departed.settlers,
  };
  const [id] = await world.player('hrac-a', [
    { ...departed.state, steward: { ...departed.state.steward!, departures: [record] } },
  ]);
  return id!;
}

describe('WorldQueue v paměti', () => {
  it('hráči nejvíc pozadu první, pak podle id; posun času, spící vsi a archiv', async () => {
    const world = new World();
    await world.player('hrac-a', [tracked(FAMILY, TODAY - 2)]);
    await world.player('hrac-c', [tracked(FAMILY, TODAY - 8)]);
    await world.player('hrac-b', [tracked(FAMILY, TODAY), tracked(FAMILY, TODAY - 8)]);
    await world.player('hrac-d', [asleep(TODAY - 30)]);
    const [archived] = await world.player('hrac-e', [tracked(FAMILY, TODAY - 20)]);
    await world.settlements.archive(world.villages.records.get(archived!)!.settlementId);
    await world.player('hrac-f', [tracked(FAMILY, TODAY)]);
    world.offsets.offsets.set('hrac-f', 5);
    await world.player('hrac-g', [tracked(FAMILY, TODAY)]);

    const queue = await world.deps.queue.behind(TODAY, 10);
    expect(queue).toEqual([
      { playerId: 'hrac-b', today: TODAY, oldestDay: TODAY - 8 },
      { playerId: 'hrac-c', today: TODAY, oldestDay: TODAY - 8 },
      { playerId: 'hrac-f', today: TODAY + 5, oldestDay: TODAY },
      { playerId: 'hrac-a', today: TODAY, oldestDay: TODAY - 2 },
    ]);
    expect((await world.deps.queue.behind(TODAY, 2)).map((p) => p.playerId)).toEqual([
      'hrac-b',
      'hrac-c',
    ]);
  });
});

describe('advanceWorldStep – krok světa', () => {
  it('posune nejvíc zpožděné hráče o dávku nejvýš stepDays dní (i s posunem času)', async () => {
    const world = new World();
    const [a1, a2, a3] = await world.player('hrac-a', [
      tracked(FAMILY, TODAY - 25),
      tracked(FAMILY, TODAY - 20),
      // ves napřed s čerstvým okolím – worker do ní nic nezapíše (ani okolí do schránky)
      { ...tracked(FAMILY, TODAY - 3), nearby: loneNearby('a3', 'Ves 2', TODAY - 3) },
    ]);
    const [b1] = await world.player('hrac-b', [tracked(FAMILY, TODAY - 1)]);
    world.offsets.offsets.set('hrac-b', 3);
    const untouched = world.villages.records.get(a3!)!.version;

    const step = await world.step();
    expect(step.players.map((p) => [p.playerId, p.outcome, p.targetDay])).toEqual([
      ['hrac-a', 'done', TODAY - 15],
      ['hrac-b', 'done', TODAY + 3],
    ]);
    expect(world.state(a1!).lastDay).toBe(TODAY - 15);
    expect(world.state(a2!).lastDay).toBe(TODAY - 15);
    expect(world.state(a3!).lastDay).toBe(TODAY - 3);
    expect(world.villages.records.get(a3!)!.version).toBe(untouched);
    expect(world.state(b1!).lastDay).toBe(TODAY + 3);
    expect(step.players[0]).toMatchObject({ villages: 2, days: 15, founded: 0, gameOver: false });
    expect(step).toMatchObject({ villages: 3, days: 19, idle: false });
  });

  it('obsazený hráč se přeskočí, jiný se mezitím dopočte; odložený se nebere', async () => {
    const world = new World();
    const [a] = await world.player('hrac-a', [tracked(FAMILY, TODAY - 10)]);
    const [b] = await world.player('hrac-b', [tracked(FAMILY, TODAY - 5)]);
    let release = (): void => {};
    const web = world.locks.run('hrac-a', () => new Promise<void>((done) => (release = done)));
    const step = await world.step();
    expect(step.players.map((p) => [p.playerId, p.outcome])).toEqual([
      ['hrac-a', 'busy'],
      ['hrac-b', 'done'],
    ]);
    expect(world.state(a!).lastDay).toBe(TODAY - 10);
    expect(world.state(b!).lastDay).toBe(TODAY);
    release();
    await web;

    const skipped = await world.step(WORLD_STEP_DAYS, new Set(['hrac-a']));
    expect(skipped).toMatchObject({ players: [], idle: true });
    expect((await world.step()).players.map((p) => p.outcome)).toEqual(['done']);
    expect(world.state(a!).lastDay).toBe(TODAY);
  });

  it('spící vsi se nepočítají – ani v dávce, ani ve frontě', async () => {
    const world = new World();
    const [dead, alive] = await world.player('hrac-a', [
      asleep(TODAY - 30),
      tracked(FAMILY, TODAY - 5),
    ]);
    await world.player('hrac-b', [asleep(TODAY - 20)]);
    const version = world.villages.records.get(dead!)!.version;
    const step = await world.step();
    expect(step.players.map((p) => [p.playerId, p.targetDay, p.villages])).toEqual([
      ['hrac-a', TODAY, 1],
    ]);
    expect(world.state(alive!).lastDay).toBe(TODAY);
    expect(world.state(dead!).lastDay).toBe(TODAY - 30);
    expect(world.villages.records.get(dead!)!.version).toBe(version);
    expect((await world.step()).idle).toBe(true);
  });

  it('chyba u jednoho hráče nezastaví ostatní', async () => {
    const world = new World();
    const [a] = await world.player('hrac-a', [tracked(FAMILY, TODAY - 9)]);
    const [b] = await world.player('hrac-b', [tracked(FAMILY, TODAY - 4)]);
    const failure = new Error('výpadek databáze');
    world.villages.beforeSave = (id): void => {
      if (id === a) throw failure;
    };
    const step = await world.step();
    expect(step.players[0]).toMatchObject({
      playerId: 'hrac-a',
      outcome: 'failed',
      error: { villageId: a, cause: failure },
    });
    expect(step.players[1]).toMatchObject({ playerId: 'hrac-b', outcome: 'done' });
    expect(world.state(b!).lastDay).toBe(TODAY);
  });

  it.each([1, 3, 10])(
    'po %i dnech až do dneška = dopočet najednou (i se zbytkem ve webu)',
    async (stepDays) => {
      const make = async (): Promise<{ world: World; id: string }> => {
        const world = new World();
        const [id] = await world.player('hrac-a', [tracked(FAMILY, TODAY - 23)]);
        // jednorázové převody starší vsi (odklad ohrad a mlácení) počítají od dne prvního
        // načtení – ves z fixture se převede předem, jako by ji už jednou načetl web
        await loadVillage(world.deps, { villageId: id!, today: TODAY - 23, landscape });
        return { world, id: id! };
      };
      const whole = await make();
      const once = await loadVillage(whole.world.deps, {
        villageId: whole.id,
        today: TODAY,
        landscape,
      });
      const expected = JSON.stringify(once!.state);

      // okolí zapíše worker po první dávce (den po ní), simulace je jinak stejná jako vcelku
      const nearby = (id: string): VillageState['nearby'] =>
        loneNearby(id, 'Ves 0', TODAY - 23 + stepDays + 1);
      expect(once!.state.nearby).toBeUndefined();
      const worker = await make();
      expect(await worker.world.untilIdle(stepDays)).toBe(Math.ceil(23 / stepDays));
      expect(worker.world.state(worker.id).nearby).toEqual(nearby(worker.id));
      expect(withoutNearby(worker.world.state(worker.id))).toBe(expected);

      // worker jedno kolo, zbytek dopočte web při pohledu
      const mixed = await make();
      await mixed.world.step(stepDays);
      expect(mixed.world.state(mixed.id).lastDay).toBe(TODAY - 23 + stepDays);
      const view = await dynastyForVillage(mixed.world.deps, {
        playerId: 'hrac-a',
        villageId: mixed.id,
        today: TODAY,
      });
      const shown = view.villages[0]!;
      expect(isFullVillage(shown) ? shown.state.nearby : null).toEqual(nearby(mixed.id));
      expect(isFullVillage(shown) ? withoutNearby(shown.state) : null).toBe(expected);
    },
  );

  it('schránka správce se vybaví a novou ves syna dopočte další kolo', async () => {
    const world = new World();
    const motherId = await departure(world, { x: 200, z: 200, rotation: 0 });
    const first = await world.step();
    expect(first.players[0]).toMatchObject({ outcome: 'done', villages: 1, founded: 1 });
    expect(pendingStewardDepartures(world.state(motherId))).toHaveLength(0);
    const son = [...world.villages.records.values()].find((v) => v.name === 'Kouřim')!;
    expect(son.state.lastDay).toBeLessThan(TODAY);

    const second = await world.step();
    expect(second.players[0]).toMatchObject({ villages: 1, founded: 0 });
    expect(world.state(son.id).lastDay).toBe(TODAY);
    expect((await world.step()).idle).toBe(true);
    expect(world.villages.records.size).toBe(2);
  });

  it('ves na cestě se správcem se v den příjezdu založí sama', async () => {
    const world = new World();
    await departure(world); // místo na mapě není – nová mapa na sever, 2 dny cesty
    await world.step();
    const son = [...world.villages.records.values()].find((v) => v.name === 'Kouřim')!;
    expect(isVillageTravelling(son.state)).toBe(true);
    expect(await world.untilIdle()).toBe(1);
    const arrived = world.state(son.id);
    expect(isVillageTravelling(arrived)).toBe(false);
    expect(arrived.foundedDay).toBe(LEFT + 2);
    expect(arrived.steward?.on).toBe(true);
    expect(arrived.lastDay).toBe(TODAY);
  });

  it('konec rodu se zjistí po dávce – ze smíšených dnů ne', async () => {
    const world = new World();
    const [a, b] = await world.player('hrac-a', [
      tracked(WIDOW, TODAY - 4),
      tracked(WIDOW, TODAY - 2),
    ]);
    // dávka po dni: první ves dojde jen na TODAY − 3, druhá je na TODAY − 2 – smíšené dny
    const first = await world.step(1);
    expect(first.players[0]).toMatchObject({ targetDay: TODAY - 3, gameOver: false });
    expect(world.state(a!).abandonedDay).toBeUndefined();
    // všechny vsi na jednom dni – rod bez muže skončil, vsi zanikly a fronta je prázdná
    const second = await world.step(1);
    expect(second.players[0]).toMatchObject({ targetDay: TODAY - 2, gameOver: true });
    expect(world.state(a!).abandonedDay).toBeDefined();
    expect(world.state(b!).abandonedDay).toBeDefined();
    expect((await world.step()).idle).toBe(true);
  });
});

describe('bariéra ves × tažení (Úloha 6.7)', () => {
  it('ves u tažení jen do meze, ostatní vsi hráče do dneška; přednostní hráč první', async () => {
    const world = new World();
    world.villages.withHolds();
    const queue = world.deps.queue as InMemoryWorldQueue;
    // hráč „a“ víc pozadu, „b“ má ves u tažení – jde přesto první
    await world.player('a', [tracked(FAMILY, TODAY - 9)]);
    const [held, free] = await world.player('b', [
      tracked(FAMILY, TODAY - 5),
      tracked(FAMILY, TODAY - 5),
    ]);
    world.villages.holdLimits.set(held!, TODAY - 3);
    queue.priority = [held!];
    const first = await advanceWorldStep(world.deps, {
      worldDay: TODAY,
      stepDays: WORLD_STEP_DAYS,
      limit: 1,
    });
    expect(first.players.map((p) => p.playerId)).toEqual(['b']);
    expect(first.held).toBe(1);
    expect((await world.villages.find(held!))!.state.lastDay).toBe(TODAY - 3);
    expect((await world.villages.find(free!))!.state.lastDay).toBe(TODAY);
    // ves na mezi není pozadu – hráč „b“ už ve frontě není, hráč „a“ ano
    const second = await world.step();
    expect(second.players.map((p) => p.playerId)).toEqual(['a']);
    expect((await world.step()).idle).toBe(true);
    // mez povyrostla (tažení spočítalo další den) – ves pokračuje, nikdy dál než mez
    world.villages.holdLimits.set(held!, TODAY - 2);
    await world.step();
    expect((await world.villages.find(held!))!.state.lastDay).toBe(TODAY - 2);
    // ves dopočtená dál než mez (dřív, než k ní tažení došlo) počká – nepočítá se zpět
    world.villages.holdLimits.set(held!, TODAY - 4);
    const view = await loadVillage(world.deps, { villageId: held!, today: TODAY, landscape });
    expect(view?.state.lastDay).toBe(TODAY - 2);
  });
});

describe('uspání nečinných (absence.md – Zátěž serveru)', () => {
  /** Okamžik kola: 12. 11. 2026 v poledne v Praze – hráč aktivní od 9. 11. (3 dny zpět) nespí. */
  const NOW = new Date('2026-11-12T11:00:00Z');
  const stepAt = (world: World, now: Date | undefined): Promise<WorldStep> =>
    advanceWorldStep(world.deps, {
      worldDay: TODAY,
      stepDays: WORLD_STEP_DAYS,
      limit: 10,
      ...(now ? { now } : {}),
    });

  it('mez probuzení: poslední aktivní den nejdřív před 3 dny (datum v Praze)', () => {
    expect(awakeSince(NOW)).toBe('2026-11-09');
    // pár minut po pražské půlnoci se mez posune o den
    expect(awakeSince(new Date('2026-11-12T23:05:00Z'))).toBe('2026-11-10');
  });

  it('spící hráči (i bez aktivního dne) jdou až po aktivních – dokud aktivní zaostávají, čekají', async () => {
    const world = new World();
    const queue = world.deps.queue as InMemoryWorldQueue;
    const [active] = await world.player('aktivni', [tracked(FAMILY, TODAY - 25)]);
    const [idle] = await world.player('necinny', [tracked(FAMILY, TODAY - 29)]);
    const [never] = await world.player('nikdy', [tracked(FAMILY, TODAY - 29)]);
    await queue.activity.record('aktivni', '2026-11-09');
    await queue.activity.record('necinny', '2026-11-08');

    // aktivní je méně pozadu, a přesto jde sám, dokud zaostává (3 dávky po 10 dnech)
    for (let round = 0; round < 3; round++) {
      const step = await stepAt(world, NOW);
      expect(step.players.map((p) => p.playerId)).toEqual(['aktivni']);
      expect(step.asleep).toBe(0);
      expect(world.state(idle!).lastDay).toBe(TODAY - 29);
    }
    expect(world.state(active!).lastDay).toBe(TODAY);
    // nikdo vzhůru nezaostává – volnou kapacitu dostanou spící (nejvíc pozadu první)
    const sleepers = await stepAt(world, NOW);
    expect(sleepers.players.map((p) => p.playerId)).toEqual(['necinny', 'nikdy']);
    expect(sleepers.asleep).toBe(2);
    expect(sleepers.idle).toBe(false);
    expect(world.state(never!).lastDay).toBe(TODAY - 19);
    // nový herní den: aktivní je zase pozadu a jde před spícími
    const next = await advanceWorldStep(world.deps, {
      worldDay: TODAY + 1,
      stepDays: WORLD_STEP_DAYS,
      limit: 10,
      now: NOW,
    });
    expect(next.players.map((p) => p.playerId)).toEqual(['aktivni']);
    // návrat hráče – zapsaný aktivní den ho probudí
    await queue.activity.record('necinny', '2026-11-12');
    expect((await stepAt(world, NOW)).players.map((p) => p.playerId)).toEqual(['necinny']);
    // bez okamžiku kola (testy, měření) se spící nerozlišují
    expect((await stepAt(world, undefined)).players.map((p) => p.playerId)).toEqual([
      'nikdy',
      'necinny',
    ]);
  });

  it('dotek tažením: přednostní ves spícího hráče jde první, do meze', async () => {
    const world = new World();
    world.villages.withHolds();
    const queue = world.deps.queue as InMemoryWorldQueue;
    await world.player('aktivni', [tracked(FAMILY, TODAY - 9)]);
    await queue.activity.record('aktivni', '2026-11-12');
    const [held] = await world.player('necinny', [tracked(FAMILY, TODAY - 9)]);
    world.villages.holdLimits.set(held!, TODAY - 4);
    queue.priority = [held!];
    const step = await stepAt(world, NOW);
    expect(step.players.map((p) => p.playerId)).toEqual(['necinny', 'aktivni']);
    expect(step.asleep).toBe(0);
    expect(world.state(held!).lastDay).toBe(TODAY - 4);
    // na mezi ves dál čeká na tažení – ani jako spící se nepočítá
    expect((await stepAt(world, NOW)).idle).toBe(true);
  });

  it('uspaná ves po dotyku = průběžně počítaná (i se zásilkou ve schránce)', async () => {
    const start = TODAY - 27;
    const event = (villageId: string): Parameters<InMemoryVillages['inbox']['post']>[0] => ({
      villageId,
      day: start + 13,
      ref: `test:${villageId}`,
      body: { kind: 'chronicle', event: { day: start + 13, kind: 'line-named', name: 'Bořivoj' } },
    });
    // převody starého stavu (`withPenGrace`, `withThreshingGrace`) běží ke dni načtení – výjimka
    // z „po kouscích“ (worker.md – Výjimky); ves je proto napřed převedená ke dni `start`
    const convert = (world: World, villageId: string): Promise<unknown> =>
      loadVillage(world.deps, { villageId, today: start, landscape });
    // průběžně: worker po dávkách, zásilka dorazí mezi dávkami
    const awake = new World();
    const [a] = await awake.player('hrac', [tracked(FAMILY, start)]);
    await convert(awake, a!);
    await (awake.deps.queue as InMemoryWorldQueue).activity.record('hrac', '2026-11-12');
    await stepAt(awake, NOW);
    await awake.villages.inbox.post(event(a!));
    await awake.untilIdle();
    // uspaná: worker ji nepočítá (aktivní hráč zaostává), zásilka čeká ve schránce, dotek
    // (otevření) ji dopočte naráz
    const sleeping = new World();
    const [s] = await sleeping.player('hrac', [tracked(FAMILY, start)]);
    await convert(sleeping, s!);
    await sleeping.player('aktivni', [tracked(FAMILY, start)]);
    const queue = sleeping.deps.queue as InMemoryWorldQueue;
    await queue.activity.record('aktivni', '2026-11-12');
    expect((await stepAt(sleeping, NOW)).players.map((p) => p.playerId)).toEqual(['aktivni']);
    await sleeping.villages.inbox.post(event(s!));
    expect(sleeping.state(s!).lastDay).toBe(start);
    const touched = await loadVillage(sleeping.deps, { villageId: s!, today: TODAY, landscape });

    expect(touched?.state.lastDay).toBe(TODAY);
    // okolí zapsal worker po první dávce průběžné vsi – dotek ho nemá, zbytek stavu je stejný
    expect(awake.state(a!).nearby).toEqual(loneNearby(a!, 'Ves 0', start + WORLD_STEP_DAYS + 1));
    expect(touched!.state.nearby).toBeUndefined();
    expect(withoutNearby(touched!.state)).toBe(withoutNearby(awake.state(a!)));
  });
});

describe('pošta mezi vsemi ve workeru (village-mail.ts; markets.md – Rozhodnutí plánu 2, bod 6)', () => {
  const ORDER = { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 };
  const advance = (
    w: MarketWorld,
    playerId: string,
    today: number,
  ): ReturnType<typeof advancePlayer> =>
    advancePlayer(w.deps, { playerId, today, stepDays: WORLD_STEP_DAYS });

  it('web dopočte, worker doručí: ves na dnešku nedopočítá, příjezd zapíše jednou', async () => {
    const w = await marketWorld();
    // pád webu po uložení H – odchozí schránka se nedoručila
    const trip = await w.depart(ORDER);
    const first = await advance(w, H_PLAYER, D);
    expect(first).toMatchObject({ outcome: 'done', villages: 0, days: 0 });
    expect(w.state(w.h).lastDay).toBe(D);
    const arrivals = await w.villages.inbox.pending(w.m, D, D + 1);
    expect(arrivals).toEqual([
      expect.objectContaining({
        day: D + 1,
        body: expect.objectContaining({ kind: 'market-arrive' }),
      }),
    ]);
    expect(arrivals[0]!.body).toMatchObject({ arrival: { key: trip.key } });
    expect(trip.key.startsWith(`market:${w.h}:`)).toBe(true);
    expect(w.state(w.h).outbox).toBeUndefined();
    const version = w.version(w.h);
    expect(await advance(w, H_PLAYER, D)).toMatchObject({ outcome: 'done', villages: 0 });
    expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toHaveLength(1);
    expect(w.version(w.h)).toBe(version);
  });

  it('totéž pro hostitele: výsledek z odchozí schránky M dopočtené webem jde do schránky H', async () => {
    const w = await marketWorld();
    const trip = await w.depart(ORDER);
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.m, D + 1);
    expect(w.state(w.m).outbox).toHaveLength(1);
    const step = await advance(w, M_PLAYER, D + 1);
    expect(step).toMatchObject({ outcome: 'done', villages: 0 });
    const results = await w.villages.inbox.pending(w.h, -1, TOTAL_GAME_DAYS);
    expect(results).toEqual([
      expect.objectContaining({
        day: D + 2,
        body: expect.objectContaining({ kind: 'market-result' }),
      }),
    ]);
    expect(results[0]!.body).toMatchObject({ result: { key: trip.key } });
    expect(w.state(w.m).outbox).toBeUndefined();
  });

  it('zámek mezitím vzal web – doručení vsi na dnešku se přeskočí (busy)', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    // přijetí odúmrti zámek dostane, doručení už ne
    let tries = 0;
    const locks: PlayerLock = {
      run: (playerId, run) => w.locks.run(playerId, run),
      tryRun: (playerId, run) =>
        tries++ === 0 ? w.locks.tryRun(playerId, run) : Promise.resolve({ ran: false }),
    };
    const step = await advancePlayer(
      { ...w.deps, locks },
      { playerId: H_PLAYER, today: D, stepDays: WORLD_STEP_DAYS },
    );
    expect(step).toMatchObject({ outcome: 'busy', villages: 0 });
    expect(tries).toBe(2);
    expect(w.state(w.h).outbox).toHaveLength(1);
  });

  it.each([1, WORLD_STEP_DAYS])('kola workeru po %i dnech = ruční postup', async (stepDays) => {
    // ručně: po odeslání web doručí, M se dopočte a doručí, pak H. Rovnost platí díky pořadí:
    // M je o den víc pozadu, takže ji fronta vezme první; kdyby šla napřed H, doběhla by s
    // `stepDays` 10 na D + 2 dřív, než M výsledek vyrobí, a výsledek by padl na D + 3.
    const manual = await marketWorld();
    await manual.depart(ORDER);
    await deliverVillageMail(manual.deps, manual.h);
    await manual.load(manual.m, D + 1);
    await deliverVillageMail(manual.deps, manual.m);
    await manual.load(manual.h, D + 2);
    await manual.load(manual.m, D + 2);
    expect(returnedOf(manual.state(manual.h))).toHaveLength(1);

    // worker: po odeslání web doručí, zbytek kola workeru do dneška D + 2
    const worker = await marketWorld();
    await worker.depart(ORDER);
    await deliverVillageMail(worker.deps, worker.h);
    for (let round = 0; ; round++) {
      expect(round).toBeLessThan(20);
      const step = await advanceWorldStep(worker.deps, { worldDay: D + 2, stepDays, limit: 10 });
      if (step.idle) break;
    }
    // okolí (nearby.ts) zapisuje jen worker, den snímku závisí na dávkách – trh na něm nezávisí
    expect(withoutNearby(worker.state(worker.h))).toBe(withoutNearby(manual.state(manual.h)));
    expect(withoutNearby(worker.state(worker.m))).toBe(withoutNearby(manual.state(manual.m)));
  });
});

describe('okolí vsi ve workeru (nearby.ts; markets.md – Rozhodnutí plánu 3, bod 1)', () => {
  const advance = (w: MarketWorld, today: number): ReturnType<typeof advancePlayer> =>
    advancePlayer(w.deps, { playerId: H_PLAYER, today, stepDays: WORLD_STEP_DAYS });
  /** Dny událostí `nearby` ve schránce H. */
  const nearbyDays = async (w: MarketWorld): Promise<number[]> =>
    (await w.villages.inbox.pending(w.h, -1, TOTAL_GAME_DAYS))
      .filter((e) => e.body.kind === 'nearby')
      .map((e) => e.day);

  it('ves dopočtená webem dostane okolí jednou, ve stavu je po dopočtu, znovu až zestárne', async () => {
    const w = await marketWorld();
    // H na dnešku (dopočítal web) – worker ji nedopočítá, okolí zapíše na lastDay + 1
    expect(await advance(w, D)).toMatchObject({ outcome: 'done', villages: 0, days: 0 });
    expect(await nearbyDays(w)).toEqual([D + 1]);
    expect(await advance(w, D)).toMatchObject({ outcome: 'done', villages: 0 });
    expect(await nearbyDays(w)).toEqual([D + 1]);
    // dopočet na D + 1 okolí použije – je čerstvé, další se nezapíše
    expect(await advance(w, D + 1)).toMatchObject({ outcome: 'done', villages: 1, days: 1 });
    expect(w.state(w.h).nearby).toEqual({
      day: D + 1,
      self: { villageId: w.h, name: 'Vlkov' },
      villages: [{ villageId: w.m, name: 'Lhota', cells: 1, firstStep: 'E' }],
    });
    expect(await nearbyDays(w)).toEqual([D + 1]);
    // okolí staré NEARBY_REFRESH_DAYS − 1 dní ještě platí, staré NEARBY_REFRESH_DAYS se obnoví
    w.state(w.h).nearby!.day = D + 1 - (NEARBY_REFRESH_DAYS - 1);
    await advance(w, D + 1);
    expect(await nearbyDays(w)).toEqual([D + 1]);
    w.state(w.h).nearby!.day = D + 1 - NEARBY_REFRESH_DAYS;
    await advance(w, D + 1);
    expect(await nearbyDays(w)).toEqual([D + 1, D + 2]);
  });

  it('dopočtená ves bez okolí ho dostane po dopočtu (den po posledním spočteném)', async () => {
    const w = await marketWorld();
    expect(await advance(w, D + 2)).toMatchObject({ outcome: 'done', villages: 1, days: 2 });
    expect(w.state(w.h).nearby).toBeUndefined();
    expect(await nearbyDays(w)).toEqual([D + 3]);
  });
});
