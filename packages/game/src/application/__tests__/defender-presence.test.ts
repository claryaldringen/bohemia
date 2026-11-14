import { describe, expect, it } from 'vitest';
import {
  msOfTick,
  WAR,
  type AlarmMessenger,
  type AlarmOwner,
  type AlarmVillage,
  type CampaignIntent,
  type CampaignState,
} from '../../domain/war';
import { campaign, LAUNCH, world } from '../../domain/war/__tests__/campaign-fixtures';
import { answerPresence } from '../defender-presence';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryPresence } from './in-memory-presence';

// Odpověď workeru na přítomnost obránce (war.md – Hráč ve vsi a mimo ni; plán 2026-11-14 –
// Rozhodnutí plánu 2, Úloha 6): ves, která se ptá (`askedTick`), dostane záměr `alarm-presence` na
// takt `state.tick + 2` od vlastníka s poslední přítomností hráče (oříznutou na takt záměru);
// přítomnost starší než `presenceRefreshTicks` se obnoví jen novější přítomností a jen u vsi, o které
// ještě může rozhodnout.

/** Takt spočteného stavu tažení. */
const T = LAUNCH + 1000;
const REFRESH = WAR.alarm.presenceRefreshTicks;
const P2: AlarmOwner = { playerId: 'p2', npc: false, houseId: 'h2', lordId: 2 };
const P3: AlarmOwner = { playerId: 'p3', npc: false, houseId: 'h3', lordId: 2 };
const NPC: AlarmOwner = { playerId: null, npc: true, houseId: 'h-n' };
const PLACE = { cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } };

/** Ves varovaná 200 taktů před `T` (vojvoda ji varoval při vstupu vojska na mapu). */
function warned(
  villageId: string,
  owner: AlarmOwner,
  extra: Partial<AlarmVillage> = {},
): AlarmVillage {
  return {
    villageId,
    owner,
    seenTick: T - 200,
    seenAt: structuredClone(PLACE),
    warnTick: T - 200,
    by: 'lord',
    ...extra,
  };
}

/** Posel vsi `from` doběhl do hradiště `to` v taktu `T − 10`. */
function arrived(refId: string, from: string, to: string): AlarmMessenger {
  return {
    refId,
    fromVillageId: from,
    personId: 1,
    toVillageId: to,
    mounted: false,
    status: 'arrived',
    departTick: T - 150,
    doneTick: T - 10,
    ...structuredClone(PLACE),
    route: [],
    leg: null,
    target: structuredClone(PLACE),
  };
}

/** Tažení spočtené do taktu `T` s varovanými vsemi. */
function stateWith(villages: AlarmVillage[], messengers: AlarmMessenger[] = []): CampaignState {
  const s = campaign({ liveCommand: false });
  s.tick = T;
  s.alarm = { villages, messengers, flights: [], nextRef: messengers.length + 1 };
  return s;
}

/**
 * `answerPresence` nad stavem `state` (tažení v úložišti s bodem v taktu `T`): `seen` = takt
 * poslední přítomnosti hráčů, `port: false` = bez portu přítomnosti, `intents` = záměry kola.
 */
async function answer(
  state: CampaignState,
  opts: { seen?: Record<string, number>; port?: boolean; intents?: CampaignIntent[] } = {},
): Promise<{ written: number; added: CampaignIntent[]; presence: InMemoryPresence }> {
  const campaigns = new InMemoryCampaigns();
  await campaigns.create(structuredClone(state));
  const presence = new InMemoryPresence();
  for (const [playerId, tick] of Object.entries(opts.seen ?? {})) {
    await presence.note(playerId, new Date(msOfTick(tick, world)));
  }
  const written = await answerPresence(
    { campaigns, world, ...(opts.port === false ? {} : { presence }) },
    { campaignId: state.id, state, intents: opts.intents ?? [] },
  );
  return { written, added: await campaigns.intentsAfter(state.id, T), presence };
}

const presenceOf = (village: string, seenTick: number | null): CampaignIntent['body'] => ({
  kind: 'alarm-presence',
  village,
  seenTick,
});

describe('odpověď workeru na přítomnost obránce (Úloha 6)', () => {
  it('ves se ptá – jeden záměr na takt state.tick + 2 od vlastníka', async () => {
    const s = stateWith([
      warned('a', P2, { askedTick: T - 30 }),
      warned('b', NPC),
      // hradiště se ptá i po rozhodnutí správce za vesnickou část (doména) – odpověď dostane
      warned('c', P2, { decided: 'steward', askedTick: T - 3 }),
      warned('d', P3, { askedTick: T - 5 }),
    ]);
    const { written, added, presence } = await answer(s, { seen: { p2: T - 50 } });
    expect(written).toBe(3);
    expect(added).toEqual([
      { tick: T + 2, seq: 1, byPlayer: 'p2', body: presenceOf('a', T - 50) },
      { tick: T + 2, seq: 2, byPlayer: 'p2', body: presenceOf('c', T - 50) },
      { tick: T + 2, seq: 3, byPlayer: 'p3', body: presenceOf('d', null) },
    ]);
    // jedno lastSeen pro všechny vlastníky
    expect(presence.asks).toEqual([['p2', 'p3']]);
  });

  it('čeká-li už záměr alarm-presence té vsi za state.tick – žádný další', async () => {
    const s = stateWith([
      warned('a', P2, { askedTick: T - 1 }),
      warned('d', P3, { askedTick: T - 1 }),
    ]);
    const intents: CampaignIntent[] = [
      // už použitý (do T) – nečeká
      { tick: T - 1, seq: 1, byPlayer: 'p3', body: presenceOf('d', null) },
      { tick: T + 1, seq: 2, byPlayer: 'p2', body: presenceOf('a', T - 3) },
      // jiný záměr vlastníka odpověď nenahradí
      { tick: T + 1, seq: 3, byPlayer: 'p3', body: { kind: 'alarm-messenger', village: 'd' } },
    ];
    const { written, added } = await answer(s, { seen: { p2: T, p3: T }, intents });
    expect(written).toBe(1);
    expect(added.map((i) => [i.byPlayer, i.body])).toEqual([['p3', presenceOf('d', T)]]);
  });

  it('bez portu – seenTick null', async () => {
    const s = stateWith([
      warned('a', P2, { askedTick: T - 1 }),
      // obnova bez portu nic nepřinese
      warned('d', P3, { presenceTick: T - REFRESH - 10 }),
    ]);
    const { written, added } = await answer(s, { port: false });
    expect(written).toBe(1);
    expect(added).toEqual([{ tick: T + 2, seq: 1, byPlayer: 'p2', body: presenceOf('a', null) }]);
  });

  it('obnova po presenceRefreshTicks jen s novější přítomností', async () => {
    const s = stateWith([
      warned('a', P2, { presenceTick: T - REFRESH }),
      // přítomnost mladší než presenceRefreshTicks
      warned('b', P2, { presenceTick: T - REFRESH + 1 }),
      // hráč u hry nebyl – rozhodl správce
      warned('c', P2, { presenceTick: null, decided: 'steward' }),
      // novější přítomnost hráč p3 nemá
      warned('d', P3, { presenceTick: T - 200 }),
      warned('e', P3, { presenceTick: T - 300 }),
    ]);
    const { written, added } = await answer(s, { seen: { p2: T - 3, p3: T - 300 } });
    expect(written).toBe(1);
    expect(added).toEqual([{ tick: T + 2, seq: 1, byPlayer: 'p2', body: presenceOf('a', T - 3) }]);
  });

  it('obnova jen u vsi, o které přítomnost ještě rozhoduje', async () => {
    const old = T - 200;
    const s = stateWith(
      [
        // posel hráče z A doběhl do hradiště H
        warned('a', P2, { presenceTick: old, decided: 'player', messenger: 'c1:a1' }),
        warned('b', P2, { presenceTick: old, decided: 'steward' }),
        // lidé odešli – správce už nemá co převzít
        warned('c', P2, { presenceTick: old, decided: 'player', flight: 'c1:a2' }),
        // hradiště s doběhlým poslem posly do domény ještě nerozeslalo
        warned('h', P2, { presenceTick: old, decided: 'steward', by: 'messenger' }),
        warned('n', NPC, { presenceTick: old }),
        // cíl tažení – vojvoda se vzdal (varování skončilo)
        warned('t', P2, { presenceTick: old }),
      ],
      [arrived('c1:a1', 'a', 'h')],
    );
    s.target.villageId = 't';
    s.returnReason = 'yielded';
    const { added } = await answer(s, { seen: { p2: T - 3 } });
    expect(added.map((i) => i.body)).toEqual([presenceOf('a', T - 3), presenceOf('h', T - 3)]);

    // hradiště, které posly do domény už rozeslalo, přítomnost nepotřebuje
    s.alarm!.villages.find((v) => v.villageId === 'h')!.domain = [];
    const after = await answer(s, { seen: { p2: T - 3 } });
    expect(after.added.map((i) => i.body)).toEqual([presenceOf('a', T - 3)]);
  });

  it('lastSeen novější než takt – seenTick oříznutý na takt záměru', async () => {
    // worker o 2000 taktů pozadu (restart, výpadek): hráč byl u hry „v budoucnosti“ tažení
    const s = stateWith([
      warned('a', P2, { askedTick: T - 1 }),
      warned('d', P3, { presenceTick: T - REFRESH }),
    ]);
    const { added } = await answer(s, { seen: { p2: T + 2000, p3: T + 2000 } });
    expect(added.map((i) => [i.tick, i.body])).toEqual([
      [T + 2, presenceOf('a', T + 2)],
      [T + 2, presenceOf('d', T + 2)],
    ]);
    // s přítomností v taktu záměru se ves další obnovy dočká až po presenceRefreshTicks
    const next = stateWith([warned('a', P2, { presenceTick: T + 2 })]);
    next.tick = T + 1 + REFRESH;
    const again = await answer(next, { seen: { p2: T + 2000 } });
    expect(again.written).toBe(0);
  });

  it('bez vsí k odpovědi přítomnost nečte; skončené tažení nic', async () => {
    const quiet = stateWith([warned('a', P2, { presenceTick: T - 10 }), warned('b', NPC)]);
    const none = await answer(quiet, { seen: { p2: T } });
    expect(none.written).toBe(0);
    expect(none.presence.asks).toEqual([]);

    const ended = stateWith([warned('a', P2, { askedTick: T - 1 })]);
    ended.phase = 'done';
    const done = await answer(ended, { seen: { p2: T } });
    expect(done.written).toBe(0);
    expect(done.presence.asks).toEqual([]);
  });
});
