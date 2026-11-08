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
import {
  advanceWorldStep,
  WORLD_STEP_DAYS,
  type WorldStep,
  type WorldStepDeps,
} from '../advance-world';
import { awakeSince } from '../activity';
import { dynastyForVillage } from '../dynasty-for-village';
import { isFullVillage } from '../villages';
import { loadVillage } from '../load-village';
import type { LandscapeSource } from '../settlements';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWorldQueue } from './in-memory-world-queue';

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
      tracked(FAMILY, TODAY - 3),
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

      const worker = await make();
      expect(await worker.world.untilIdle(stepDays)).toBe(Math.ceil(23 / stepDays));
      expect(JSON.stringify(worker.world.state(worker.id))).toBe(expected);

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
      expect(isFullVillage(shown) ? JSON.stringify(shown.state) : null).toBe(expected);
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

  it('vsi nečinného hráče (i bez aktivního dne) worker nepočítá, aktivního ano', async () => {
    const world = new World();
    const queue = world.deps.queue as InMemoryWorldQueue;
    const [active] = await world.player('aktivni', [tracked(FAMILY, TODAY - 9)]);
    const [idle] = await world.player('necinny', [tracked(FAMILY, TODAY - 9)]);
    const [never] = await world.player('nikdy', [tracked(FAMILY, TODAY - 9)]);
    await queue.activity.record('aktivni', '2026-11-09');
    await queue.activity.record('necinny', '2026-11-08');

    const step = await stepAt(world, NOW);
    expect(step.players.map((p) => p.playerId)).toEqual(['aktivni']);
    expect(world.state(active!).lastDay).toBe(TODAY);
    expect(world.state(idle!).lastDay).toBe(TODAY - 9);
    expect(world.state(never!).lastDay).toBe(TODAY - 9);
    expect((await stepAt(world, NOW)).idle).toBe(true);
    // návrat hráče – zapsaný aktivní den ho probudí
    await queue.activity.record('necinny', '2026-11-12');
    expect((await stepAt(world, NOW)).players.map((p) => p.playerId)).toEqual(['necinny']);
    // bez okamžiku kola (testy, měření) nikdo nespí
    expect((await stepAt(world, undefined)).players.map((p) => p.playerId)).toEqual(['nikdy']);
  });

  it('dotek tažením: přednostní ves nečinného hráče se dopočítá do meze', async () => {
    const world = new World();
    world.villages.withHolds();
    const queue = world.deps.queue as InMemoryWorldQueue;
    const [held] = await world.player('necinny', [tracked(FAMILY, TODAY - 9)]);
    world.villages.holdLimits.set(held!, TODAY - 4);
    queue.priority = [held!];
    const step = await stepAt(world, NOW);
    expect(step.players.map((p) => p.playerId)).toEqual(['necinny']);
    expect(world.state(held!).lastDay).toBe(TODAY - 4);
    // na mezi zase spí – tažení ještě nepostoupilo
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
    // uspaná: worker ji nepočítá, zásilka čeká ve schránce, dotek (otevření) ji dopočte naráz
    const sleeping = new World();
    const [s] = await sleeping.player('hrac', [tracked(FAMILY, start)]);
    await convert(sleeping, s!);
    expect((await stepAt(sleeping, NOW)).idle).toBe(true);
    await sleeping.villages.inbox.post(event(s!));
    expect(sleeping.state(s!).lastDay).toBe(start);
    const touched = await loadVillage(sleeping.deps, { villageId: s!, today: TODAY, landscape });

    expect(touched?.state.lastDay).toBe(TODAY);
    expect(JSON.stringify(touched!.state)).toBe(JSON.stringify(awake.state(a!)));
  });
});
