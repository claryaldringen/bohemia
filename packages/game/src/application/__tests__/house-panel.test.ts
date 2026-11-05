import { describe, expect, it } from 'vitest';
import type { VillageDigest } from '../../domain/village';
import { INVITES } from '../../domain/world';
import { housePanel, type HousePanelDeps } from '../house-panel';
import type { VillageDigestRecord } from '../villages';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryWorldDirectory } from './in-memory-world-directory';

// Panel Rod a vazalové: vlastní rod, páni, vazalové, cizí hráči a pozvánky – jen veřejné údaje.

const TODAY = 100_000;
const NOW = new Date('2026-11-05T12:00:00Z');
const YEAR = 365.25;
const bornAgo = (years: number): number => TODAY - Math.floor(years * YEAR) - 1;

function digest(
  id: string,
  men: { id: number; name?: string; bornDay: number }[],
): VillageDigestRecord {
  const d = {
    v: 2,
    lastDay: TODAY,
    people: 40,
    publicLineMen: men,
    stores: { grain: 900 },
  } as unknown as VillageDigest;
  return { id, settlementId: `s-${id}`, name: `Ves ${id}`, version: 1, digest: d };
}

async function setup() {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const worldDirectory = new InMemoryWorldDirectory();
  const vassalages = new InMemoryVassalages();
  const invites = new InMemoryInvites();
  const activity = new InMemoryActivity();
  const negotiations = new InMemoryNegotiations(vassalages, new InMemoryNotices(), () => NOW);
  const deps: HousePanelDeps = {
    negotiations,
    houses,
    settlements,
    worldDirectory,
    vassalages,
    invites,
    successionCredits: new InMemoryCredits(),
    activity,
    now: () => NOW,
  };
  const make = async (playerId: string, x: number, y: number, men: number[]) => {
    const house = await houses.create({ playerId, kind: 'player', createdAt: NOW });
    await settlements.createSeat({
      ownerId: playerId,
      landscapeSeed: 1,
      layerVersions: {} as never,
      worldCell: { x, y },
    });
    worldDirectory.entries.push({
      house,
      seat: { x, y },
      digests: [
        digest(
          `v-${playerId}`,
          men.map((age, i) => ({ id: i + 1, name: `Muž ${playerId}${i}`, bornDay: bornAgo(age) })),
        ),
      ],
    });
    return house;
  };
  return { deps, make, vassalages, invites, activity, negotiations };
}

describe('housePanel', () => {
  it('hráč bez rodu dostane prázdný panel', async () => {
    const { deps } = await setup();
    const data = await housePanel(deps, { playerId: 'nikdo', today: TODAY });
    expect(data.hasHouse).toBe(false);
    expect(data.freeInviteSlots).toBe(0);
  });

  it('páni, vazalové a ostatní se nepřekrývají, muži jsou od 16 let', async () => {
    const { deps, make, vassalages } = await setup();
    const me = await make('me', 0, 0, [30, 12, 50]);
    const lord = await make('lord', 5, 0, [40]);
    const vassal = await make('vassal', 2, 0, [20]);
    const other = await make('other', 1, 0, [33]);
    for (const [l, v] of [
      [lord.id, me.id],
      [me.id, vassal.id],
    ] as const) {
      await vassalages.create({
        lordHouseId: l,
        vassalHouseId: v,
        terms: {},
        origin: 'invite',
        sinceAt: NOW,
        sinceDay: TODAY,
      });
    }
    const data = await housePanel(deps, { playerId: 'me', today: TODAY });
    expect(data.own?.men.map((m) => m.age)).toEqual([30, 50]);
    expect(data.lords.map((h) => h.houseId)).toEqual([lord.id]);
    expect(data.vassals.map((h) => h.houseId)).toEqual([vassal.id]);
    expect(data.others.map((h) => h.houseId)).toEqual([other.id]);
    expect(JSON.stringify(data)).not.toContain('grain');
    expect(JSON.stringify(data)).not.toContain('"playerId"');
  });

  it('pozvánky: volná místa, využitá s rozehraným pozvaným', async () => {
    const { deps, make, invites, activity } = await setup();
    await make('me', 0, 0, [30]);
    const guest = await make('guest', 1, 0, [25]);
    await invites.issue({
      code: 'AAAAAAAA',
      issuerId: 'me',
      createdAt: NOW,
      validUntil: new Date(NOW.getTime() + 5 * 86_400_000),
    });
    await invites.issue({
      code: 'BBBBBBBB',
      issuerId: 'me',
      createdAt: NOW,
      validUntil: new Date(NOW.getTime() + 5 * 86_400_000),
    });
    await invites.reserve('BBBBBBBB', 'guest', NOW);
    await invites.consumeReservation('guest', NOW);
    let data = await housePanel(deps, { playerId: 'me', today: TODAY });
    expect(data.freeInviteSlots).toBe(INVITES.maxUnused - 1);
    expect(data.invites).toEqual([
      { state: 'open', code: 'AAAAAAAA', validUntil: expect.any(Date) },
      {
        state: 'used',
        code: 'BBBBBBBB',
        house: expect.objectContaining({ houseId: guest.id }),
        played: false,
      },
    ]);
    for (let d = 0; d < INVITES.playedDays; d++)
      await activity.record('guest', `2026-11-0${d + 1}`);
    data = await housePanel(deps, { playerId: 'me', today: TODAY });
    expect(data.invites[1]).toMatchObject({ played: true });
  });
  it('jednání: kdo je na tahu a důvody zašednutí tlačítek u cizích hráčů', async () => {
    const { deps, make, negotiations } = await setup();
    const me = await make('me', 0, 0, [30]);
    const a = await make('a', 1, 0, [33]);
    const b = await make('b', 2, 0, [33]);
    const c = await make('c', 3, 0, [33]);
    const oath = { kind: 'oath' as const, lord: me.id, vassal: a.id };
    await negotiations.transaction((tx) =>
      tx.open({
        initiatorHouseId: me.id,
        recipientHouseId: a.id,
        round: { authorHouseId: me.id, items: [oath], message: 'Pojď', at: NOW },
      }),
    );
    await negotiations.transaction(async (tx) => {
      await tx.setBlock(b.id, me.id, true, NOW);
      await tx.recordReject(me.id, c.id, NOW);
    });
    const data = await housePanel(deps, { playerId: 'me', today: TODAY });
    expect(data.negotiations).toHaveLength(1);
    expect(data.negotiations[0]).toMatchObject({ myTurn: false, message: 'Pojď', rounds: 1 });
    expect(data.negotiations[0]?.other.houseId).toBe(a.id);
    expect(data.actions[a.id]?.offer).toBe('Jednáte už.');
    expect(data.actions[b.id]).toMatchObject({
      offer: 'Zablokoval tě.',
      request: 'Zablokoval tě.',
    });
    expect(data.actions[c.id]).toMatchObject({ offer: 'Odmítl – zkus zítra.' });
    const theirs = await housePanel(deps, { playerId: 'a', today: TODAY });
    expect(theirs.negotiations[0]?.myTurn).toBe(true);
  });
});
