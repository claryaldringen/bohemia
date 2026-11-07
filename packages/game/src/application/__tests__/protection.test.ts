import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { DAY, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import { returnHome } from '../../domain/vassalage';
import { applyInboxDay, type VillageEvent, type VillageState } from '../../domain/village';
import {
  PROTECTION_REASONS,
  recallProtection,
  requestProtection,
  sendProtection,
  type ProtectionDeps,
} from '../protection';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Ochrana vojskem (vassalage.md – Ochrana vojskem; plán – Úloha 6.13).

const LORD = 'hrac-pan';
const VASSAL = 'hrac-vazal';
const NOW = new Date('2026-11-05T12:00:00Z');

function withLine(state: VillageState, ids: number[]): VillageState {
  state.people.push({
    id: 900,
    name: 'Hlava',
    bornDay: DAY - 15_000,
    dwellingId: 500,
    sex: 'male',
  });
  for (const id of ids) {
    state.people.push({ id, bornDay: DAY - 8_000, dwellingId: 500, sex: 'male', line: true });
  }
  state.people.push({ id: 960, bornDay: DAY - 9_000, dwellingId: 500, sex: 'male' });
  return state;
}

describe('ochrana pánem', () => {
  it('žádost, muži rodu jako hosté chráněné vsi, odvolání je vrátí domů', async () => {
    const settlements = new InMemorySettlements();
    const villages = new InMemoryVillages();
    const houses = new InMemoryHouses();
    const vassalages = new InMemoryVassalages();
    const notices = new InMemoryNotices();
    const seat = async (ownerId: string, x: number): Promise<string> =>
      (await settlements.create({
        ownerId,
        landscapeSeed: x + 1,
        layerVersions: CURRENT_LAYER_VERSIONS,
        worldCell: { x, y: 0 },
      }))!.id;
    const lordVillage = await villages.add(
      await seat(LORD, 0),
      'Lhota',
      withLine(sender(), [901, 902]),
    );
    const vassalVillage = await villages.add(
      await seat(VASSAL, 2),
      'Dub',
      withLine(receiver(), []),
    );
    const lord = await houses.create({ playerId: LORD, kind: 'player', createdAt: NOW });
    await houses.setLord(lord.id, { villageId: lordVillage.id, personId: 900 });
    const vassal = await houses.create({ playerId: VASSAL, kind: 'player', createdAt: NOW });
    await houses.setLord(vassal.id, { villageId: vassalVillage.id, personId: 900 });
    const v = await vassalages.create({
      lordHouseId: lord.id,
      vassalHouseId: vassal.id,
      terms: {},
      origin: 'negotiation',
      sinceAt: NOW,
      sinceDay: DAY - 100,
    });
    const deps: ProtectionDeps = {
      vassalages,
      houses,
      notices,
      villages,
      settlements,
      shipments: {
        shipments: new InMemoryShipments(),
        villages,
        settlements,
        locks: new InMemoryPlayerLock(),
        now: () => NOW,
      },
      prepareVillage: () => Promise.resolve(null),
    };
    const base = { vassalageId: v.id, villageId: vassalVillage.id, today: DAY };
    expect(
      await requestProtection(deps, { ...base, playerId: VASSAL, message: 'Vlci u brány.' }),
    ).toEqual({
      ok: true,
    });
    expect(notices.notices.map((n) => n.kind)).toEqual(['protection-requested']);
    const villager = await sendProtection(deps, {
      ...base,
      playerId: LORD,
      men: [{ villageId: lordVillage.id, personId: 960 }],
    });
    expect(villager).toEqual({ ok: false, reason: PROTECTION_REASONS.notLineMan });
    const sent = await sendProtection(deps, {
      ...base,
      playerId: LORD,
      men: [
        { villageId: lordVillage.id, personId: 901 },
        { villageId: lordVillage.id, personId: 902 },
      ],
    });
    expect(sent).toMatchObject({ ok: true, sent: 2 });
    const home = (await villages.find(lordVillage.id))!.state;
    expect(home.people.filter((p) => p.away?.kind === 'protection')).toHaveLength(2);
    expect(home.people.find((p) => p.id === 901)?.away?.untilDay).toBeUndefined();

    // hosté přijdou do chráněné vsi a zůstanou do odvolání
    const arrive = sent.ok ? sent.arrivesDay! : 0;
    const inbox = (villageId: string): VillageEvent[] =>
      villages.inbox.events.filter((e) => e.villageId === villageId);
    const host = structuredClone((await villages.find(vassalVillage.id))!.state);
    applyInboxDay(host, arrive, inbox(vassalVillage.id));
    expect(host.guests?.map((g) => g.kind)).toEqual(['protection', 'protection']);
    returnHome(host, arrive + 400);
    expect(host.guests).toHaveLength(2);

    // odvolání: chráněná ves je dnes propustí, doma jsou za dny cesty
    const recalled = await recallProtection(deps, { ...base, playerId: LORD, today: arrive + 10 });
    expect(recalled).toEqual({ ok: true, men: 2 });
    applyInboxDay(host, arrive + 10, inbox(vassalVillage.id));
    expect(host.guests).toBeUndefined();
    const homeState = structuredClone(home);
    applyInboxDay(homeState, arrive + 10, inbox(lordVillage.id));
    const back = arrive + 10 + (arrive - DAY);
    expect(homeState.people.find((p) => p.id === 901)?.away?.untilDay).toBe(back);
    returnHome(homeState, back);
    expect(homeState.people.some((p) => p.away !== undefined)).toBe(false);
    expect(notices.notices.map((n) => n.kind)).toEqual([
      'protection-requested',
      'protection-sent',
      'protection-recalled',
    ]);
  });
});
