import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { neighbourCell } from '../../domain/village/world-grid';
import {
  cellDistance,
  cellLandscapeSeed,
  isDry,
  NEWCOMERS,
  seatSlot,
  skeletonSlice,
  SLOT_TYPES,
  WORLD,
  type LanguageGroup,
} from '../../domain/world';
import { cellSkeletonVersions } from '../cell-landscape';
import { PREMIUM_SEAT_VERSIONS } from '../world-seat';
import {
  acceptNegotiation,
  counterNegotiation,
  openNegotiation,
  rejectNegotiation,
  withdrawNegotiation,
  type NegotiateDeps,
} from '../negotiate';
import {
  expireNewcomerWaits,
  NEWCOMER_REASONS,
  newcomerFoundingReason,
  newcomerStatus,
  requestLords,
  startFree,
  type NewcomerWorldDeps,
} from '../newcomers';
import { targetSettlement } from '../new-village';
import type { VillageRecord, VillageRepository } from '../villages';
import type { DirectoryEntry } from '../world-directory';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryPlacement } from './in-memory-placement';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryWorldDirectory } from './in-memory-world-directory';

const NOW = new Date('2026-11-07T12:00:00Z');
const DAY_MS = 86_400_000;
const TODAY = 100;
const layers = CURRENT_LAYER_VERSIONS;

/** Rody `a`, `b` (2 vsi), `c` (3 vsi) na mapě světa a odříznutý nováček `n` se dvěma sídly. */
async function setup(
  language: LanguageGroup = 'cs',
  extraLords = 0,
): Promise<{
  deps: NewcomerWorldDeps;
  houses: InMemoryHouses;
  settlements: InMemorySettlements;
  vassalages: InMemoryVassalages;
  notices: InMemoryNotices;
  negotiations: InMemoryNegotiations;
  ids: Record<string, string>;
}> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const negotiations = new InMemoryNegotiations(vassalages, notices, () => NOW);
  negotiations.placement = new InMemoryPlacement(settlements, houses);
  const directory = new InMemoryWorldDirectory();
  const ids: Record<string, string> = {};
  const lords: [string, number, number, LanguageGroup][] = [
    ['a', 0, 2, 'cs'],
    ['b', 10, 2, 'de'],
    ['c', 20, 3, 'cs'],
    // další rody se dvěma vsemi (souběh výběrů)
    ...Array.from({ length: extraLords }, (_, i): [string, number, number, LanguageGroup] => [
      `x${i}`,
      30 + 10 * i,
      2,
      'cs',
    ]),
  ];
  for (const [key, x, count, lang] of lords) {
    const house = await houses.create({
      playerId: `player-${key}`,
      kind: 'player',
      createdAt: NOW,
      language: lang,
    });
    await houses.setLord(house.id, { villageId: `village-${key}`, personId: 1 });
    await settlements.createSeat({
      ownerId: `player-${key}`,
      landscapeSeed: 1,
      layerVersions: layers,
      worldCell: { x, y: 0 },
    });
    ids[key] = house.id;
    const digests = Array.from({ length: count }, (_, i) => ({
      id: i === 0 ? `village-${key}` : `village-${key}${i}`,
      name: `Ves ${key}`,
      digest: { v: 4, publicLineMen: [{ id: 1, name: key.toUpperCase(), bornDay: 0 }] },
    }));
    directory.entries.push({
      house: (await houses.byId(house.id))!,
      seat: { x, y: 0 },
      digests,
    } as unknown as DirectoryEntry);
  }
  const newcomer = await houses.create({
    playerId: 'player-n',
    kind: 'player',
    createdAt: NOW,
    language,
    placedAt: null,
  });
  await houses.setLord(newcomer.id, { villageId: 'village-n', personId: 1 });
  ids.n = newcomer.id;
  await settlements.createSeat({
    ownerId: 'player-n',
    landscapeSeed: 2,
    layerVersions: { ...layers, premium: 1 },
    premiumType: 'fertile',
    localCell: { x: 0, y: 0 },
  });
  await settlements.create({
    ownerId: 'player-n',
    landscapeSeed: 3,
    layerVersions: layers,
    localCell: { x: 1, y: 0 },
  });
  // nováček už staví – na obou mapách stojí ves (ves syna vznikla odchodem z vsi sídla)
  for (const own of await settlements.listActive('player-n')) settlements.withVillage.add(own.id);
  const villages: NegotiateDeps['villages'] = {
    find: (villageId) =>
      Promise.resolve({
        id: villageId,
        state: { people: [{ id: 1, name: villageId.slice(-1).toUpperCase() }] },
      } as unknown as VillageRecord),
    inbox: { post: () => Promise.resolve(null), pending: () => Promise.resolve([]) },
  };
  return {
    deps: {
      houses,
      negotiations,
      villages,
      worldDirectory: directory,
      worldSeed: 4242,
      locks: new InMemoryPlayerLock(),
    },
    houses,
    settlements,
    vassalages,
    notices,
    negotiations,
    ids,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const lordOf = (s: Setup, key: string): string => `player-${key}`;

/** Jednání nováčka s rodem `key`. */
function requestTo(s: Setup, key: string): string {
  const record = s.negotiations.records.find(
    (r) => r.newcomer && r.recipientHouseId === s.ids[key],
  );
  if (!record) throw new Error(`žádost na ${key} chybí`);
  return record.id;
}

const accept = (s: Setup, key: string): ReturnType<typeof acceptNegotiation> =>
  acceptNegotiation(s.deps, {
    playerId: lordOf(s, key),
    negotiationId: requestTo(s, key),
    now: NOW,
    today: TODAY,
  });

describe('nabídka a žádosti nováčka', () => {
  it('nabídka: jen rody se dvěma vsemi, stejný jazyk první; týden ještě neběží', async () => {
    const s = await setup('de');
    const status = await newcomerStatus(s.deps, 'player-n');
    expect(status).toEqual({
      phase: 'isolated',
      offer: [
        { houseId: s.ids.b, lordName: 'B', language: 'de' },
        { houseId: s.ids.a, lordName: 'A', language: 'cs' },
      ],
      requests: [],
      deadline: null,
    });
  });

  it('žádá jen 1–5 rodů z nabídky; první žádost spustí týden; čekající žádosti brání novým', async () => {
    const s = await setup();
    const req = (houseIds: string[]): ReturnType<typeof requestLords> =>
      requestLords(s.deps, { playerId: 'player-n', houseIds, now: NOW, today: TODAY });
    expect(await req([])).toEqual({ ok: false, reason: NEWCOMER_REASONS.choices });
    expect(await req(['1', '2', '3', '4', '5', '6'])).toEqual({
      ok: false,
      reason: NEWCOMER_REASONS.choices,
    });
    expect(await req([s.ids.c!])).toEqual({ ok: false, reason: NEWCOMER_REASONS.notOffered });
    expect(await req([s.ids.a!, s.ids.b!])).toEqual({ ok: true });
    expect(s.negotiations.records.filter((r) => r.newcomer)).toHaveLength(2);
    expect(s.notices.notices.filter((n) => n.kind === 'newcomer-request')).toHaveLength(2);
    expect((await s.houses.byId(s.ids.n!))?.newcomerSince).toEqual(NOW);
    expect(await req([s.ids.a!])).toEqual({ ok: false, reason: NEWCOMER_REASONS.waiting });
    const status = await newcomerStatus(s.deps, 'player-n');
    expect(status.phase === 'isolated' && status.deadline).toEqual(
      new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS),
    );
  });

  it('pán jen přijme nebo odmítne – protinávrh nejde', async () => {
    const s = await setup();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    const counter = await counterNegotiation(s.deps, {
      playerId: lordOf(s, 'a'),
      negotiationId: requestTo(s, 'a'),
      items: [{ kind: 'oath', lord: s.ids.a!, vassal: s.ids.n! }],
      message: null,
      now: NOW,
      today: TODAY,
    });
    expect(counter).toEqual({ ok: false, reason: NEWCOMER_REASONS.onlyAccept });
  });

  it('odříznutý rod s nikým nejedná a nikdo s ním', async () => {
    const s = await setup();
    const oath = (
      lord: string,
      vassal: string,
    ): { kind: 'oath'; lord: string; vassal: string } => ({
      kind: 'oath',
      lord,
      vassal,
    });
    const base = { message: null, now: NOW, today: TODAY };
    expect(
      await openNegotiation(s.deps, {
        ...base,
        playerId: 'player-a',
        to: s.ids.n!,
        items: [oath(s.ids.a!, s.ids.n!)],
      }),
    ).toEqual({ ok: false, reason: NEWCOMER_REASONS.isolatedTarget });
    expect(
      await openNegotiation(s.deps, {
        ...base,
        playerId: 'player-n',
        to: s.ids.a!,
        items: [oath(s.ids.a!, s.ids.n!)],
      }),
    ).toEqual({ ok: false, reason: NEWCOMER_REASONS.notPlaced });
  });
});

describe('umístění nováčka', () => {
  it('první přijetí vyhraje: shluk vsí vedle pána se stejnou vzájemnou polohou, ostatní žádosti zaniknou', async () => {
    const s = await setup();
    await requestLords(s.deps, {
      playerId: 'player-n',
      houseIds: [s.ids.a!, s.ids.b!],
      now: NOW,
      today: TODAY,
    });
    expect((await accept(s, 'a')).ok).toBe(true);
    const house = await s.houses.byId(s.ids.n!);
    expect(house?.placedAt).toEqual(NOW);
    const [seat, second] = await s.settlements.listActive('player-n');
    expect(seat?.localCell).toBeNull();
    // umístění shluku krajinu nemění – sídelní sídlo si nechá seed i prémiový typ, ves syna průměrná
    expect(seat).toMatchObject({ landscapeSeed: 2, premiumType: 'fertile' });
    expect(second).toMatchObject({ landscapeSeed: 3 });
    expect(second?.premiumType ?? null).toBeNull();
    expect(await s.settlements.lastPremiumType('player-n')).toBe('fertile');
    expect(second!.worldCell!.x - seat!.worldCell!.x).toBe(1);
    expect(second!.worldCell!.y).toBe(seat!.worldCell!.y);
    for (const o of await s.settlements.occupiedCells()) {
      if (o.ownerId === 'player-n') continue;
      for (const own of [seat!, second!]) {
        expect(cellDistance(o.cell, own.worldCell!)).toBeGreaterThanOrEqual(WORLD.invitedGap);
      }
    }
    expect(cellDistance(seat!.worldCell!, { x: 0, y: 0 })).toBeLessThanOrEqual(3);
    expect(s.vassalages.vassalages).toHaveLength(1);
    expect(s.vassalages.vassalages[0]).toMatchObject({
      lordHouseId: s.ids.a,
      vassalHouseId: s.ids.n,
      origin: 'newcomer',
      terms: {},
    });
    expect(s.notices.notices.map((n) => n.kind)).toEqual(
      expect.arrayContaining(['newcomer-accepted', 'newcomer-taken']),
    );
    // pozdější potvrzení neplatí
    expect(await accept(s, 'b')).toEqual({ ok: false, reason: NEWCOMER_REASONS.taken });
    expect(await newcomerStatus(s.deps, 'player-n')).toEqual({ phase: 'placed' });
  });

  it('dva páni přijmou naráz → jedno vazalství, druhý dostane „Nováček už má pána.“', async () => {
    const s = await setup();
    await requestLords(s.deps, {
      playerId: 'player-n',
      houseIds: [s.ids.a!, s.ids.b!],
      now: NOW,
      today: TODAY,
    });
    const results = await Promise.all([accept(s, 'a'), accept(s, 'b')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: NEWCOMER_REASONS.taken }]);
    expect(s.vassalages.vassalages).toHaveLength(1);
  });

  it('všichni odmítnou → upozornění a nový výběr jen do konce týdne', async () => {
    const s = await setup();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    await rejectNegotiation(s.deps, {
      playerId: lordOf(s, 'a'),
      negotiationId: requestTo(s, 'a'),
      now: NOW,
      today: TODAY,
    });
    expect(s.notices.notices.some((n) => n.kind === 'newcomer-rejected-all')).toBe(true);
    const status = await newcomerStatus(s.deps, 'player-n');
    expect(status.phase === 'isolated' && status.requests).toEqual([
      { houseId: s.ids.a, lordName: expect.any(String) as string, state: 'rejected' },
    ]);
    // odmítnutý se znovu nenabízí; po týdnu nový výběr nejde
    expect(status.phase === 'isolated' && status.offer.map((o) => o.houseId)).toEqual([s.ids.b]);
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    expect(
      await requestLords(s.deps, {
        playerId: 'player-n',
        houseIds: [s.ids.b!],
        now: late,
        today: TODAY,
      }),
    ).toEqual({ ok: false, reason: NEWCOMER_REASONS.weekOver });
    expect(
      (
        await requestLords(s.deps, {
          playerId: 'player-n',
          houseIds: [s.ids.b!],
          now: NOW,
          today: TODAY,
        })
      ).ok,
    ).toBe(true);
  });

  it('Svobodný: stáhne žádosti a umístí se k rodům svého jazyka s odstupem 3', async () => {
    const s = await setup('de');
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    expect(await startFree(s.deps, { playerId: 'player-n', now: NOW, today: TODAY })).toEqual({
      ok: true,
    });
    expect(s.negotiations.records.find((r) => r.newcomer)?.status).toBe('withdrawn');
    expect(s.vassalages.vassalages).toHaveLength(0);
    const seat = await s.settlements.findSeat('player-n');
    // nejblíž rodu `b` (de, x = 10), aspoň 3 políčka od všech cizích map
    expect(cellDistance(seat!.worldCell!, { x: 10, y: 0 })).toBe(WORLD.independentGap);
    // nováček s vsí: shluk jen na suchá políčka kostry, krajina sídla beze změny
    for (const own of await s.settlements.listActive('player-n')) {
      expect(isDry(skeletonSlice(4242, own.worldCell!))).toBe(true);
    }
    expect(seat).toMatchObject({ landscapeSeed: 2, premiumType: 'fertile' });
    expect(await startFree(s.deps, { playerId: 'player-n', now: NOW, today: TODAY })).toEqual({
      ok: false,
      reason: NEWCOMER_REASONS.placed,
    });
  });
});

describe('svobodný nováček bez vsi (world-skeleton.md)', () => {
  it('sídlo dostane místo u jazykové skupiny, typ podle místa a krajinu z políčka světa', async () => {
    const s = await setup();
    await s.houses.create({
      playerId: 'player-m',
      kind: 'player',
      createdAt: NOW,
      language: 'cs',
      placedAt: null,
    });
    const isolated = await s.settlements.createSeat({
      ownerId: 'player-m',
      landscapeSeed: 5,
      layerVersions: PREMIUM_SEAT_VERSIONS,
      premiumType: 'fertile',
      localCell: { x: 0, y: 0 },
    });
    // typ sídla bez vsi hráči nepatří – při přesídlení se vybírá znovu
    expect(await s.settlements.lastPremiumType('player-m')).toBeNull();
    expect(await startFree(s.deps, { playerId: 'player-m', now: NOW, today: TODAY })).toEqual({
      ok: true,
    });
    const seat = (await s.settlements.findSeat('player-m'))!;
    expect(seat.id).toBe(isolated!.id);
    expect(seat.localCell).toBeNull();
    const cell = seat.worldCell!;
    const slice = skeletonSlice(4242, cell);
    expect(SLOT_TYPES[seatSlot(slice)!]).toContain(seat.premiumType);
    expect(seat.skeleton ?? null).toEqual(slice);
    expect(seat.layerVersions).toEqual(cellSkeletonVersions(slice, PREMIUM_SEAT_VERSIONS));
    const drawn = cellLandscapeSeed(4242, cell);
    expect(seat.landscapeSeed - drawn).toBeGreaterThanOrEqual(0);
    expect(seat.landscapeSeed - drawn).toBeLessThan(64);
    // u map rodů svého jazyka (a, c – cs), aspoň 3 políčka od všech cizích map
    const near = Math.min(cellDistance(cell, { x: 0, y: 0 }), cellDistance(cell, { x: 20, y: 0 }));
    expect(near).toBeLessThanOrEqual(WORLD.independentGap + 1);
    for (const o of await s.settlements.occupiedCells()) {
      if (o.ownerId !== 'player-m') {
        expect(cellDistance(cell, o.cell)).toBeGreaterThanOrEqual(WORLD.independentGap);
      }
    }
    expect((await s.houses.activeOf('player-m'))?.placedAt).toEqual(NOW);
  }, 120_000);

  it('sídlo s vsí se nepřesídlí – přesune se na suché políčko a krajinu si nechá', async () => {
    const s = await setup();
    await s.houses.create({
      playerId: 'player-m',
      kind: 'player',
      createdAt: NOW,
      language: 'cs',
      placedAt: null,
    });
    const isolated = await s.settlements.createSeat({
      ownerId: 'player-m',
      landscapeSeed: 5,
      layerVersions: PREMIUM_SEAT_VERSIONS,
      premiumType: 'fertile',
      localCell: { x: 0, y: 0 },
    });
    s.settlements.withVillage.add(isolated!.id);
    expect(await s.settlements.lastPremiumType('player-m')).toBe('fertile');
    expect((await startFree(s.deps, { playerId: 'player-m', now: NOW, today: TODAY })).ok).toBe(
      true,
    );
    const seat = (await s.settlements.findSeat('player-m'))!;
    expect(seat).toMatchObject({ landscapeSeed: 5, premiumType: 'fertile', localCell: null });
    expect(seat.skeleton ?? null).toBeNull();
    expect(isDry(skeletonSlice(4242, seat.worldCell!))).toBe(true);
  });
});

describe('volba cesty a stažení žádosti', () => {
  it('odříznutý založí ves až po volbě cesty – žádost nebo svobodný (newcomers.md)', async () => {
    const s = await setup();
    expect(await newcomerFoundingReason(s.houses, 'player-n')).toBe(NEWCOMER_REASONS.choosePath);
    expect(await newcomerFoundingReason(s.houses, 'player-a')).toBeNull();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    expect(await newcomerFoundingReason(s.houses, 'player-n')).toBeNull();
    const t = await setup();
    await startFree(t.deps, { playerId: 'player-n', now: NOW, today: TODAY });
    expect(await newcomerFoundingReason(t.houses, 'player-n')).toBeNull();
  });

  it('stažení žádosti nováčka = svobodný: stáhne všechny a umístí ho bez pána', async () => {
    const s = await setup();
    await requestLords(s.deps, {
      playerId: 'player-n',
      houseIds: [s.ids.a!, s.ids.b!],
      now: NOW,
      today: TODAY,
    });
    const done = await withdrawNegotiation(s.deps, {
      playerId: 'player-n',
      negotiationId: requestTo(s, 'a'),
      now: NOW,
      today: TODAY,
    });
    expect(done.ok).toBe(true);
    const requests = s.negotiations.records.filter((r) => r.newcomer);
    expect(requests.map((r) => r.status)).toEqual(['withdrawn', 'withdrawn']);
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(NOW);
    expect(s.vassalages.vassalages).toHaveLength(0);
    // nový výběr po stažení už nejde – nováček je na mapě světa
    expect(
      await requestLords(s.deps, {
        playerId: 'player-n',
        houseIds: [s.ids.c!],
        now: NOW,
        today: TODAY,
      }),
    ).toEqual({ ok: false, reason: NEWCOMER_REASONS.placed });
  });
});

describe('souběh výběru a umístění', () => {
  it('dva výběry pánů naráz → dohromady nejvýš 5 žádostí; Svobodný souběžně nenechá žádnou otevřenou', async () => {
    const s = await setup('cs', 8);
    const offered = ['a', 'b', ...Array.from({ length: 8 }, (_, i) => `x${i}`)].map(
      (k) => s.ids[k]!,
    );
    const ask = (ids: string[]): ReturnType<typeof requestLords> =>
      requestLords(s.deps, { playerId: 'player-n', houseIds: ids, now: NOW, today: TODAY });
    await Promise.all([ask(offered.slice(0, 5)), ask(offered.slice(5, 10))]);
    const open = s.negotiations.records.filter((r) => r.newcomer && r.status === 'open');
    expect(open.length).toBeLessThanOrEqual(NEWCOMERS.maxChoices);

    const t = await setup('cs', 8);
    await Promise.all([
      requestLords(t.deps, {
        playerId: 'player-n',
        houseIds: [t.ids.a!, t.ids.b!],
        now: NOW,
        today: TODAY,
      }),
      startFree(t.deps, { playerId: 'player-n', now: NOW, today: TODAY }),
    ]);
    expect((await t.houses.byId(t.ids.n!))?.placedAt).toEqual(NOW);
    expect(t.negotiations.records.filter((r) => r.newcomer && r.status === 'open')).toEqual([]);
  });
});

describe('umístění × souběžný zápis do mřížky', () => {
  it('políčko mezitím obsadil pozvaný → umístění se zopakuje s čerstvou mapou obsazení', async () => {
    const s = await setup();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    const placement = s.negotiations.placement!;
    const move = placement.moveIsolated.bind(placement);
    const taken: { x: number; y: number }[] = [];
    placement.moveIsolated = async (ownerId, shift) => {
      if (taken.length === 0) {
        // sídlo nováčka je v místní mřížce na (0, 0) – cíl přesunu je přímo `shift`
        taken.push({ ...shift });
        await s.settlements.create({
          ownerId: 'player-z',
          landscapeSeed: 9,
          layerVersions: layers,
          worldCell: shift,
        });
      }
      return move(ownerId, shift);
    };
    expect((await accept(s, 'a')).ok).toBe(true);
    const seat = await s.settlements.findSeat('player-n');
    expect(seat?.worldCell).not.toBeNull();
    expect(seat?.worldCell).not.toEqual(taken[0]);
    expect(s.vassalages.vassalages).toHaveLength(1);
  });
});

describe('odchod syna × umístění (newcomers.md)', () => {
  it('rod umístěný během odchodu: sídlo v místní mřížce nevznikne, odchod pokračuje ve světě', async () => {
    const s = await setup();
    const from = (await s.settlements.findSeat('player-n'))!;
    const create = s.settlements.create.bind(s.settlements);
    // umístění vyhraje těsně před zápisem odchodu – podmíněný zápis v místní mřížce nic nezapíše
    s.settlements.create = async (input) => {
      if ('localCell' in input) {
        s.settlements.moveIsolated('player-n', { x: 40, y: 0 });
        (await s.houses.byId(s.ids.n!))!.placedAt = NOW;
        return null;
      }
      return create(input);
    };
    const villages = {
      listBySettlement: () => Promise.resolve([]),
    } as unknown as VillageRepository;
    const result = await targetSettlement(
      { settlements: s.settlements, villages, worldSeed: 4242, houses: s.houses },
      from,
      'player-n',
      'N',
    );
    expect(result.ok && result.settlement.worldCell).toEqual(neighbourCell({ x: 40, y: 0 }, 'N'));
    const own = s.settlements.settlements.filter((x) => x.ownerId === 'player-n');
    expect(own.every((x) => x.worldCell !== null && !x.localCell)).toBe(true);
  });
});

describe('expireNewcomerWaits', () => {
  it('los běží pod zámkem hráče nováčka (jako startFree a založení vsi na webu)', async () => {
    const s = await setup();
    const held: string[] = [];
    let inside = false;
    const lock = new InMemoryPlayerLock();
    const run = lock.run.bind(lock);
    s.deps.locks = {
      run: (playerId, fn) => {
        held.push(playerId);
        return run(playerId, async () => {
          inside = true;
          try {
            return await fn();
          } finally {
            inside = false;
          }
        });
      },
      tryRun: lock.tryRun.bind(lock),
    };
    const place = s.negotiations.transaction.bind(s.negotiations);
    let placedInsideLock = false;
    s.negotiations.transaction = (fn) => {
      placedInsideLock = inside;
      return place(fn);
    };
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect(held).toEqual(['player-n']);
    expect(placedInsideLock).toBe(true);
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(late);
  });

  it('los nevybere rod, který mezi čtením žádostí a losem odmítl', async () => {
    const s = await setup();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    // los čte žádosti mimo transakci – snímek ještě před odmítnutím
    const stale = (await s.negotiations.newcomerRequestsOf(s.ids.n!)).map((r) => ({ ...r }));
    await rejectNegotiation(s.deps, {
      playerId: lordOf(s, 'a'),
      negotiationId: requestTo(s, 'a'),
      now: NOW,
      today: TODAY,
    });
    const fresh = s.negotiations.newcomerRequestsOf.bind(s.negotiations);
    s.negotiations.newcomerRequestsOf = () => Promise.resolve(stale);
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect(s.vassalages.vassalages).toHaveLength(0);
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toBeNull();
    // příští kolo s čerstvými žádostmi: nikdo nezbyl → svobodný
    s.negotiations.newcomerRequestsOf = fresh;
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect(s.vassalages.vassalages).toHaveLength(0);
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(late);
  });

  it('chyba jednoho rodu nepřeruší kolo losu – vyhodí se až na konci', async () => {
    const s = await setup();
    const other = await s.houses.create({
      playerId: 'player-m',
      kind: 'player',
      createdAt: NOW,
      placedAt: null,
    });
    const waiting = s.houses.waitingNewcomers.bind(s.houses);
    // rod `m` první a bez sídla – umístění u něj spadne
    s.houses.waitingNewcomers = async () =>
      [...(await waiting())].sort((x) => (x.id === other.id ? -1 : 1));
    const transaction = s.negotiations.transaction.bind(s.negotiations);
    let calls = 0;
    s.negotiations.transaction = (fn) => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('settlement_grid_idx'));
      return transaction(fn);
    };
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expect(expireNewcomerWaits(s.deps, { now: late, today: TODAY })).rejects.toThrow(
      'settlement_grid_idx',
    );
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(late);
  });

  it('odříznutý bez žádosti po týdnu od založení rodu začne svobodný, dřív nic', async () => {
    const s = await setup();
    await expireNewcomerWaits(s.deps, {
      now: new Date(NOW.getTime() + (NEWCOMERS.waitDays - 1) * DAY_MS),
      today: TODAY,
    });
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toBeNull();
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(late);
    expect(s.vassalages.vassalages).toHaveLength(0);
    const seat = await s.settlements.findSeat('player-n');
    expect(seat?.worldCell).not.toBeNull();
  });

  it('po týdnu los mezi neodmítnutými (deterministicky); před koncem týdne nic', async () => {
    const s = await setup();
    await requestLords(s.deps, {
      playerId: 'player-n',
      houseIds: [s.ids.a!, s.ids.b!],
      now: NOW,
      today: TODAY,
    });
    await rejectNegotiation(s.deps, {
      playerId: lordOf(s, 'a'),
      negotiationId: requestTo(s, 'a'),
      now: NOW,
      today: TODAY,
    });
    await expireNewcomerWaits(s.deps, { now: new Date(NOW.getTime() + DAY_MS), today: TODAY });
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toBeNull();
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect(s.vassalages.vassalages).toEqual([
      expect.objectContaining({ lordHouseId: s.ids.b, origin: 'newcomer-lot' }),
    ]);
    expect(s.notices.notices.filter((n) => n.kind === 'newcomer-assigned')).toHaveLength(2);
    expect(s.notices.notices.some((n) => n.kind === 'newcomer-taken')).toBe(false);
    expect((await s.houses.byId(s.ids.n!))?.placedAt).toEqual(late);
  });

  it('nikdo nezbyl → svobodný; souběh s přijetím dá jediný výsledek', async () => {
    const s = await setup();
    await requestLords(s.deps, { playerId: 'player-n', houseIds: [s.ids.a!], now: NOW, today: 1 });
    await rejectNegotiation(s.deps, {
      playerId: lordOf(s, 'a'),
      negotiationId: requestTo(s, 'a'),
      now: NOW,
      today: TODAY,
    });
    const late = new Date(NOW.getTime() + NEWCOMERS.waitDays * DAY_MS);
    await expireNewcomerWaits(s.deps, { now: late, today: TODAY });
    expect(s.vassalages.vassalages).toHaveLength(0);
    expect(s.notices.notices.find((n) => n.kind === 'newcomer-assigned')?.payload).toEqual({
      houseId: null,
    });

    const t = await setup();
    await requestLords(t.deps, { playerId: 'player-n', houseIds: [t.ids.a!], now: NOW, today: 1 });
    const [accepted] = await Promise.all([
      accept(t, 'a'),
      expireNewcomerWaits(t.deps, { now: late, today: TODAY }),
    ]);
    expect(t.vassalages.vassalages).toHaveLength(1);
    const seats = t.settlements.settlements.filter((x) => x.ownerId === 'player-n');
    expect(seats.every((x) => x.worldCell !== null && !x.localCell)).toBe(true);
    // přijetí buď vyhrálo, nebo dostalo „už má pána“ – nikdy obojí
    expect(accepted.ok || (!accepted.ok && accepted.reason === NEWCOMER_REASONS.taken)).toBe(true);
  });
});
