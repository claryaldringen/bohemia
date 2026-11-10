import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  advanceVillage,
  currentLord,
  foundVillage,
  isChristian,
  rodBaptized,
  type VillageState,
} from '../../domain/village';
import { BAPTIZE_REASONS, baptizeLord, type BaptizeDeps } from '../baptize';
import { villageAccess } from '../rights';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVillages } from './in-memory-villages';

// Křest vojvody (christianity.md – Křest rodu; plán 2026-11-10 – K4, Review Focus 1): use-case
// ověří rod hráče, zapíše křest rodu a pošle ho do všech vsí rodu.

const PLAYER = 'hrac-1';
const TODAY = dayIndexOf({ year: 700, month: 3, day: 1 });
const FOUNDED = TODAY - 30;

interface Setup {
  deps: BaptizeDeps;
  houses: InMemoryHouses;
  villages: InMemoryVillages;
  houseId: string;
  seat: string;
  other: string;
}

/** Rod hráče se dvěma vsemi (dvě sídla): vojvoda žije v `seat`. */
async function setup(known: boolean): Promise<Setup> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const stewardships = new InMemoryStewardships();
  let cell = 0;
  const village = async (state: VillageState): Promise<string> => {
    const settlement = await settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 100 + cell,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: cell++, y: 0 },
    });
    return (await villages.add(settlement!.id, `Ves ${cell}`, state)).id;
  };
  const position = { x: 0, z: 0, rotation: 0 };
  const lordVillage = foundVillage({ seed: 1, day: FOUNDED, dwellingPosition: position, lord: {} });
  const seat = await village(lordVillage);
  const other = await village(foundVillage({ seed: 2, day: FOUNDED, dwellingPosition: position }));
  const house = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  await houses.setLord(house.id, { villageId: seat, personId: currentLord(lordVillage)!.id });
  if (known) await houses.markChristianityKnown(house.id, 699);
  const deps: BaptizeDeps = { houses, settlements, villages, stewardships };
  return { deps, houses, villages, houseId: house.id, seat, other };
}

/** Stav vsi dopočítaný přes den události ze schránky (ves je za dneškem – událost má den TODAY). */
async function afterInbox(s: Setup, villageId: string): Promise<VillageState> {
  const record = (await s.villages.find(villageId))!;
  const events = s.villages.inbox.events.filter((e) => e.villageId === villageId);
  return advanceVillage(record.state, TODAY + 1, null, null, events);
}

describe('baptizeLord', () => {
  it('rod, který křesťanství nezná, se pokřtít nemůže', async () => {
    const s = await setup(false);
    expect(
      await baptizeLord(s.deps, { playerId: PLAYER, villageId: s.seat, today: TODAY }),
    ).toEqual({ ok: false, reason: BAPTIZE_REASONS.unknown });
    expect(s.villages.inbox.events).toEqual([]);
  });

  it('jen ve vsi, kde žije vojvoda rodu', async () => {
    const s = await setup(true);
    const result = await baptizeLord(s.deps, {
      playerId: PLAYER,
      villageId: s.other,
      today: TODAY,
    });
    expect(result).toEqual({ ok: false, reason: BAPTIZE_REASONS.lordAway });
    expect((await s.houses.byId(s.houseId))!.baptizedDay).toBeNull();
  });

  it('pokřtí rod, obě vsi rodu dostanou den křtu, vojvoda je křesťan; podruhé důvod', async () => {
    const s = await setup(true);
    const input = { playerId: PLAYER, villageId: s.seat, today: TODAY };
    expect(await baptizeLord(s.deps, input)).toEqual({ ok: true });
    expect((await s.houses.byId(s.houseId))!.baptizedDay).toBe(TODAY);
    expect(await baptizeLord(s.deps, input)).toEqual({
      ok: false,
      reason: BAPTIZE_REASONS.done,
    });
    const events = s.villages.inbox.events;
    expect(events.map((e) => e.villageId).sort()).toEqual([s.seat, s.other].sort());
    const seat = await afterInbox(s, s.seat);
    const other = await afterInbox(s, s.other);
    for (const state of [seat, other]) {
      expect(state.faith?.rodBaptizedDay).toBe(TODAY);
      expect(rodBaptized(state)).toBe(true);
    }
    expect(isChristian(currentLord(seat)!)).toBe(true);
    expect(seat.chronicle.map((e) => e.kind)).toContain('lord-baptized');
    expect(other.chronicle.map((e) => e.kind)).not.toContain('lord-baptized');
  });
});

// Tlačítko „Nechat se pokřtít“ (K8): přístup ke vsi řekne, jestli se vojvoda tady smí nechat
// pokřtít – stejné podmínky jako use-case.
describe('villageAccess – baptizable', () => {
  const access = async (s: Setup, villageId: string): Promise<true | undefined> =>
    (await villageAccess(s.deps, { playerId: PLAYER, villageId, today: TODAY }))?.baptizable;

  it('jen ve vsi vojvody rodu, který křesťanství zná a ještě není pokřtěný', async () => {
    const unknown = await setup(false);
    expect(await access(unknown, unknown.seat)).toBeUndefined();
    const s = await setup(true);
    expect(await access(s, s.seat)).toBe(true);
    expect(await access(s, s.other)).toBeUndefined();
    await baptizeLord(s.deps, { playerId: PLAYER, villageId: s.seat, today: TODAY });
    expect(await access(s, s.seat)).toBeUndefined();
  });
});
