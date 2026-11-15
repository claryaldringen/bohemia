import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, SKELETON_LAYER_VERSION } from '../../domain/landscape';
import {
  cellDistance,
  INVITES,
  ringCells,
  seatSlot,
  skeletonSlice,
  SLOT_TYPES,
  WORLD,
} from '../../domain/world';
import { seatSkeleton } from '../world-seat';
import { enterGame, type EnterGameDeps } from '../enter-game';
import { enterPlaced } from './placed-player';
import { grantSuccessionCredits, runWorldTasks } from '../succession-credits';
import { pragueDateOf, recordActiveDay } from '../activity';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVassalages } from './in-memory-vassalages';

const NOW = new Date('2026-11-05T12:00:00Z');
const DAY = 86_400_000;

function setup(): {
  deps: EnterGameDeps;
  houses: InMemoryHouses;
  settlements: InMemorySettlements;
  invites: InMemoryInvites;
  vassalages: InMemoryVassalages;
  notices: InMemoryNotices;
} {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const invites = new InMemoryInvites();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const deps: EnterGameDeps = {
    settlements,
    houses,
    now: () => NOW,
    worldSeed: 4242,
    invitation: { invites, vassalages, notices, gameDay: () => 77 },
  };
  return { deps, houses, settlements, invites, vassalages, notices };
}

async function inviteFor(
  s: ReturnType<typeof setup>,
  issuerId: string,
  userId: string,
): Promise<void> {
  const invite = await s.invites.issue({
    code: `CODE-${userId}`,
    issuerId,
    createdAt: NOW,
    validUntil: new Date(NOW.getTime() + 14 * DAY),
  });
  await s.invites.reserve(invite!.code, userId, NOW);
}

describe('enterGame s pozvánkou', () => {
  it('pozvaný začíná jako vazal blízko pána, pán dostane upozornění', async () => {
    const s = setup();
    await enterPlaced(s.deps, 'pan', { x: 0, y: 0 });
    await enterPlaced(s.deps, 'nezavisly', { x: 3, y: 0 });
    await inviteFor(s, 'pan', 'host');
    const { settlement, landscape } = await enterGame(s.deps, 'host');
    // pozvaný je na mapě světa hned – umístěný od vstupu
    expect((await s.houses.activeOf('host'))?.placedAt).toEqual(NOW);
    // i pozvaný dostane prémiovou krajinu – typ, který ve světě ještě nikdo nemá
    const lordType = (await s.settlements.findSeat('pan'))?.premiumType;
    expect(settlement.premiumType).toBeTruthy();
    expect(settlement.premiumType).not.toBe(lordType);
    expect(landscape.premium).toBe(settlement.premiumType);

    const lordSeat = s.settlements.settlements.find((x) => x.ownerId === 'pan')!;
    const others = s.settlements.settlements.filter((x) => x.ownerId !== 'host');
    for (const o of others) {
      expect(cellDistance(settlement.worldCell!, o.worldCell!)).toBeGreaterThanOrEqual(
        WORLD.invitedGap,
      );
    }
    // blíž pánovi než nezávislému hráči
    const independent = s.settlements.settlements.find((x) => x.ownerId === 'nezavisly')!;
    expect(cellDistance(settlement.worldCell!, lordSeat.worldCell!)).toBeLessThanOrEqual(
      cellDistance(settlement.worldCell!, independent.worldCell!),
    );

    const lordHouse = await s.houses.activeOf('pan');
    const hostHouse = await s.houses.activeOf('host');
    expect(s.vassalages.vassalages).toHaveLength(1);
    expect(s.vassalages.vassalages[0]).toMatchObject({
      lordHouseId: lordHouse!.id,
      vassalHouseId: hostHouse!.id,
      terms: {},
      origin: 'invite',
      sinceAt: NOW,
      sinceDay: 77,
      endedAt: null,
      breaches: 0,
    });
    expect(s.notices.notices).toHaveLength(1);
    expect(s.notices.notices[0]).toMatchObject({
      playerId: 'pan',
      kind: 'invite-accepted',
      gameDay: 77,
    });
    // do prohlížeče pána jde jen veřejné id rodu, ne id účtu pozvaného
    expect(s.notices.notices[0]!.payload).toEqual({ houseId: hostHouse!.id });
  });

  it('pozvaný dostane místo a typ podle kostry – typ kostry na místě kostry, s výřezem políčka', async () => {
    const s = setup();
    // typy bez kostry už ve světě jsou (odříznutí hráči mimo mapu) – nejméně zastoupený je typ kostry
    for (const [i, type] of SLOT_TYPES.dry.entries()) {
      await s.settlements.createSeat({
        ownerId: `jiny-${i}`,
        landscapeSeed: 1,
        layerVersions: { ...CURRENT_LAYER_VERSIONS, premium: 2 },
        premiumType: type,
        localCell: { x: 0, y: 0 },
      });
    }
    // pán tam, kde je v prstencích 2–3 kolem něj řeka (kandidáti pozvaného)
    const skeleton = seatSkeleton(4242);
    let lordCell = { x: 0, y: 0 };
    for (let x = 0; x < 200; x += 7) {
      lordCell = { x, y: 0 };
      const near = [2, 3].flatMap((r) => ringCells(lordCell, r));
      if (near.some((c) => skeleton.slotOf(c) === 'river')) break;
    }
    await enterPlaced(s.deps, 'pan', lordCell);
    await inviteFor(s, 'pan', 'host');
    const { settlement, landscape } = await enterGame(s.deps, 'host');
    const cell = settlement.worldCell!;
    const slice = skeletonSlice(4242, cell);
    const slot = seatSlot(slice);
    expect(slot).not.toBe('dry');
    expect(SLOT_TYPES[slot!]).toContain(settlement.premiumType);
    expect(settlement.skeleton).toEqual(slice);
    expect(settlement.layerVersions).toEqual({
      ...CURRENT_LAYER_VERSIONS,
      premium: 2,
      skeleton: SKELETON_LAYER_VERSION,
    });
    expect(landscape.premium).toBe(settlement.premiumType);
    expect(cellDistance(cell, lordCell)).toBeLessThanOrEqual(3);
  }, 120_000);

  it('kód je jednorázový a opakovaný vstup nic nezdvojí', async () => {
    const s = setup();
    await enterPlaced(s.deps, 'pan', { x: 0, y: 0 });
    await inviteFor(s, 'pan', 'host');
    await enterGame(s.deps, 'host');
    await enterGame(s.deps, 'host');
    expect(s.vassalages.vassalages).toHaveLength(1);
    expect(s.notices.notices).toHaveLength(1);
    expect(s.invites.invites[0]!.usedBy).toBe('host');
    expect(await s.invites.consumeReservation('host', NOW)).toBeNull();
  });

  it('vymřelý pán: pozvaný začne odříznutý (bez pána) a kód je spotřebovaný', async () => {
    const s = setup();
    await enterPlaced(s.deps, 'pan', { x: 0, y: 0 });
    await inviteFor(s, 'pan', 'host');
    const house = await s.houses.activeOf('pan');
    await s.houses.end(house!.id, NOW, 70);
    await enterGame(s.deps, 'host');
    expect(s.vassalages.vassalages).toHaveLength(0);
    expect(s.notices.notices).toHaveLength(0);
    expect(s.invites.invites[0]!.usedBy).toBe('host');
    const host = s.settlements.settlements.find((x) => x.ownerId === 'host')!;
    expect(host).toMatchObject({ worldCell: null, localCell: { x: 0, y: 0 } });
    expect((await s.houses.activeOf('host'))?.placedAt).toBeNull();
  });

  it('hráč s existujícím sídlem rezervaci nevyužije', async () => {
    const s = setup();
    await enterPlaced(s.deps, 'pan', { x: 0, y: 0 });
    await enterGame(s.deps, 'host');
    await inviteFor(s, 'pan', 'host');
    await enterGame(s.deps, 'host');
    expect(s.vassalages.vassalages).toHaveLength(0);
    expect(s.invites.invites[0]!.usedBy).toBeNull();
  });
});

describe('aktivní dny', () => {
  it('den se zapíše jednou a hranice dne je podle Europe/Prague', async () => {
    const activity = new InMemoryActivity();
    await recordActiveDay({ activity }, 'p', new Date('2026-11-05T08:00:00Z'));
    await recordActiveDay({ activity }, 'p', new Date('2026-11-05T20:00:00Z'));
    expect(await activity.distinctDays('p')).toBe(1);
    // 23:30 UTC je v Praze (zima, UTC+1) už další den
    expect(pragueDateOf(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
    expect(pragueDateOf(new Date('2026-07-05T21:30:00Z'))).toBe('2026-07-05');
    await recordActiveDay({ activity }, 'p', new Date('2026-11-05T23:30:00Z'));
    expect(await activity.distinctDays('p')).toBe(2);
  });
});

describe('grantSuccessionCredits', () => {
  async function world(): Promise<{
    s: ReturnType<typeof setup>;
    activity: InMemoryActivity;
    credits: InMemoryCredits;
    deps: Parameters<typeof grantSuccessionCredits>[0];
  }> {
    const s = setup();
    await enterPlaced(s.deps, 'pan', { x: 0, y: 0 });
    await inviteFor(s, 'pan', 'host');
    await enterGame(s.deps, 'host');
    const activity = new InMemoryActivity();
    const credits = new InMemoryCredits();
    const notices = new InMemoryNotices();
    return {
      s,
      activity,
      credits,
      deps: { invites: s.invites, activity, credits, notices, houses: s.houses },
    };
  }

  it('kredit až od 3 různých dnů, jednou za pozvaného, s upozorněním', async () => {
    const { s, activity, credits, deps } = await world();
    const input = { now: NOW, today: 80 };
    await activity.record('host', '2026-11-05');
    await activity.record('host', '2026-11-06');
    expect(await grantSuccessionCredits(deps, input)).toBe(0);
    expect(await credits.unused('pan')).toBe(0);
    await activity.record('host', '2026-11-07');
    expect(INVITES.playedDays).toBe(3);
    expect(await grantSuccessionCredits(deps, input)).toBe(1);
    await runWorldTasks(deps, input);
    await activity.record('host', '2026-11-08');
    await runWorldTasks(deps, input);
    expect(await credits.unused('pan')).toBe(1);
    const posted = (deps.notices as InMemoryNotices).notices;
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ playerId: 'pan', kind: 'invitee-played', gameDay: 80 });
    expect(posted[0]!.payload).toEqual({ houseId: (await s.houses.activeOf('host'))!.id });
  });

  it('upozornění pozvatele nese jeho den s posunem času', async () => {
    const { activity, deps } = await world();
    for (const day of ['2026-11-05', '2026-11-06', '2026-11-07']) {
      await activity.record('host', day);
    }
    const offsets = new InMemoryTimeOffsets();
    offsets.offsets.set('pan', 365);
    expect(await grantSuccessionCredits({ ...deps, offsets }, { now: NOW, today: 80 })).toBe(1);
    const posted = (deps.notices as InMemoryNotices).notices;
    expect(posted[0]).toMatchObject({ playerId: 'pan', kind: 'invitee-played', gameDay: 445 });
  });

  it('platí i po ukončení vazalství', async () => {
    const { s, activity, credits, deps } = await world();
    await s.vassalages.end(s.vassalages.vassalages[0]!.id, 'vypovězení', NOW);
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07']) await activity.record('host', d);
    await grantSuccessionCredits(deps, { now: NOW, today: 80 });
    expect(await credits.unused('pan')).toBe(1);
  });

  it('consumeOne ubere jeden kredit a zapíše den', async () => {
    const credits = new InMemoryCredits();
    await credits.grantOnce('pan', 'a', NOW);
    await credits.grantOnce('pan', 'b', NOW);
    expect(await credits.consumeOne('pan', 123)).toBe(true);
    expect(await credits.unused('pan')).toBe(1);
    expect(credits.credits[0]!.usedDay).toBe(123);
    expect(await credits.consumeOne('pan', 124)).toBe(true);
    expect(await credits.consumeOne('pan', 125)).toBe(false);
  });
});
