import { describe, expect, it } from 'vitest';
import type { DbChange } from '@bohemia/db';
import {
  computeKey,
  routeChange,
  scopeTasks,
  type ComputeTask,
  type ConnectionScope,
} from '../routing';

const V_OWN = 'v-own';
const V_OTHER = 'v-other';
const V_ALARMED = 'v-alarmed';
const CAMPAIGN = 'c-1';

function scope(over: Partial<ConnectionScope> & { playerId: string }): ConnectionScope {
  return {
    villageId: null,
    settlementId: null,
    cell: null,
    campaignId: null,
    scene: null,
    ...over,
  };
}

/** Spojení se zobrazenou vsí – ves leží v sídle `s-<ves>` na políčku `cell`. */
function inVillage(
  playerId: string,
  villageId: string,
  cell: { x: number; y: number } | null,
): ConnectionScope {
  return scope({ playerId, villageId, settlementId: `s-${villageId}`, cell });
}

function sinks(...scopes: ConnectionScope[]): { id: number; scope: ConnectionScope }[] {
  return scopes.map((s, i) => ({ id: i + 1, scope: s }));
}

function signalsOf(
  change: DbChange,
  list: { id: number; scope: ConnectionScope }[],
): { sinkId: number; name: string; data: unknown }[] {
  return routeChange(change, list).signals;
}

describe('směrování změn na spojení (Rozhodnutí 4)', () => {
  it('v jde vlastníkovi (i s jinou vsí na očích) i správci se zobrazenou vsí', () => {
    const list = sinks(
      inVillage('owner', V_OTHER, { x: 0, y: 0 }),
      inVillage('steward', V_OWN, { x: 1, y: 0 }),
      inVillage('stranger', 'v-stranger', { x: 5, y: 5 }),
    );
    const change: DbChange = { k: 'v', id: V_OWN, ver: 7, p: 'owner' };
    const { signals, computes } = routeChange(change, list);
    expect(signals).toEqual([
      { sinkId: 1, name: 'village', data: { villageId: V_OWN, version: 7 } },
      { sinkId: 2, name: 'village', data: { villageId: V_OWN, version: 7 } },
    ]);
    expect(computes).toEqual([]);
  });

  it('v bez vlastníka jde jen spojením se zobrazenou vsí', () => {
    const list = sinks(inVillage('a', V_OWN, null), inVillage('b', V_OTHER, null));
    expect(signalsOf({ k: 'v', id: V_OWN, ver: 2, p: null }, list)).toEqual([
      { sinkId: 1, name: 'village', data: { villageId: V_OWN, version: 2 } },
    ]);
  });

  it('s jde novému (p) i starému (op) vlastníkovi – ves bez id, dočíst vždy', () => {
    const list = sinks(
      inVillage('new', V_OWN, null),
      scope({ playerId: 'old' }),
      inVillage('stranger', V_OTHER, null),
    );
    expect(signalsOf({ k: 's', p: 'new', op: 'old' }, list)).toEqual([
      { sinkId: 1, name: 'village', data: { villageId: null, version: null } },
      { sinkId: 2, name: 'village', data: { villageId: null, version: null } },
    ]);
    expect(signalsOf({ k: 's', p: 'new', op: null }, list).map((s) => s.sinkId)).toEqual([1]);
  });

  it('n a x jdou jen hráči p', () => {
    const list = sinks(scope({ playerId: 'p' }), scope({ playerId: 'q' }));
    expect(signalsOf({ k: 'n', p: 'p' }, list)).toEqual([{ sinkId: 1, name: 'notices', data: {} }]);
    const progress = { doneDays: 10, totalDays: 365 };
    expect(signalsOf({ k: 'x', p: 'q', progress }, list)).toEqual([
      { sinkId: 2, name: 'skip', data: { progress } },
    ]);
  });

  it('j dá journeys jen připojenému vlastníkovi a visitors jen spojením s políčkem v c', () => {
    const list = sinks(
      scope({ playerId: 'owner' }),
      inVillage('host', V_OWN, { x: 1, y: 2 }),
      inVillage('far', V_OTHER, { x: 9, y: 9 }),
      inVillage('isolated', 'v-isolated', null),
    );
    const change: DbChange = { k: 'j', id: 'j-1', t: 5, p: 'owner', c: [[1, 2]], big: false };
    const { signals, computes } = routeChange(change, list);
    expect(signals).toEqual([]);
    expect(computes).toEqual<ComputeTask[]>([
      { what: 'journeys', playerId: 'owner' },
      { what: 'visitors', playerId: 'host', villageId: V_OWN },
    ]);
    // vlastník není připojený – jeho výpravy nikdo nepočítá
    const absent = routeChange({ ...change, p: 'nobody' }, list).computes;
    expect(absent).toEqual<ComputeTask[]>([
      { what: 'visitors', playerId: 'host', villageId: V_OWN },
    ]);
  });

  it('c dá campaign, war-scene, war-home (políčko v c i ves v a) a alarm', () => {
    const list = sinks(
      scope({ playerId: 'leader', campaignId: CAMPAIGN }),
      scope({ playerId: 'leader', scene: { campaignId: CAMPAIGN, cell: { x: 4, y: 4 } } }),
      inVillage('defender', 'v-defender', { x: 4, y: 4 }),
      inVillage('warned', V_ALARMED, { x: 7, y: 1 }),
      inVillage('stranger', V_OTHER, { x: 20, y: 20 }),
      scope({ playerId: 'other', campaignId: 'c-other' }),
    );
    const change: DbChange = {
      k: 'c',
      id: CAMPAIGN,
      t: 3,
      c: [[4, 4]],
      a: [V_ALARMED],
      big: false,
    };
    const { signals, computes } = routeChange(change, list);
    expect(computes).toEqual<ComputeTask[]>([
      { what: 'campaign', playerId: 'leader', campaignId: CAMPAIGN },
      { what: 'war-scene', playerId: 'leader', campaignId: CAMPAIGN, cell: { x: 4, y: 4 } },
      { what: 'war-home', playerId: 'defender', settlementId: 's-v-defender' },
      { what: 'war-home', playerId: 'warned', settlementId: `s-${V_ALARMED}` },
    ]);
    expect(signals).toEqual([{ sinkId: 4, name: 'alarm', data: { villageId: V_ALARMED } }]);
  });

  it('big platí pro všechna spojení s políčkem nebo vsí', () => {
    const list = sinks(
      inVillage('a', V_OWN, { x: 1, y: 1 }),
      inVillage('b', 'v-isolated', null),
      scope({ playerId: 'c' }),
    );
    const campaign = routeChange({ k: 'c', id: CAMPAIGN, t: null, c: [], a: [], big: true }, list);
    expect(campaign.computes).toEqual<ComputeTask[]>([
      { what: 'war-home', playerId: 'a', settlementId: `s-${V_OWN}` },
      { what: 'war-home', playerId: 'b', settlementId: 's-v-isolated' },
    ]);
    expect(campaign.signals).toEqual([
      { sinkId: 1, name: 'alarm', data: { villageId: V_OWN } },
      { sinkId: 2, name: 'alarm', data: { villageId: 'v-isolated' } },
    ]);
    const journey = routeChange({ k: 'j', id: 'j-1', t: 9, p: 'c', c: [], big: true }, list);
    expect(journey.computes).toEqual<ComputeTask[]>([
      { what: 'journeys', playerId: 'c' },
      { what: 'visitors', playerId: 'a', villageId: V_OWN },
    ]);
  });

  it('dva panely téhož hráče s toutéž vsí dají jeden výpočet', () => {
    const list = sinks(
      inVillage('host', V_OWN, { x: 1, y: 2 }),
      inVillage('host', V_OWN, { x: 1, y: 2 }),
      scope({ playerId: 'owner' }),
      scope({ playerId: 'owner' }),
    );
    const { computes } = routeChange(
      { k: 'j', id: 'j-1', t: 5, p: 'owner', c: [[1, 2]], big: false },
      list,
    );
    expect(computes).toEqual<ComputeTask[]>([
      { what: 'journeys', playerId: 'owner' },
      { what: 'visitors', playerId: 'host', villageId: V_OWN },
    ]);
  });

  it('computeKey rozliší hráče i předmět', () => {
    const keys = new Set(
      (
        [
          { what: 'journeys', playerId: 'p' },
          { what: 'journeys', playerId: 'q' },
          { what: 'visitors', playerId: 'p', villageId: 'v' },
          { what: 'campaign', playerId: 'p', campaignId: 'c' },
          { what: 'war-home', playerId: 'p', settlementId: 's' },
          { what: 'war-scene', playerId: 'p', campaignId: 'c', cell: { x: 1, y: 2 } },
          { what: 'war-scene', playerId: 'p', campaignId: 'c', cell: { x: 2, y: 1 } },
        ] satisfies ComputeTask[]
      ).map(computeKey),
    );
    expect(keys.size).toBe(7);
  });

  it('scopeTasks – stav rozsahu při připojení: válka na vlastní i cizí mapě a tažení (revize Úlohy 5)', () => {
    expect(scopeTasks(scope({ playerId: 'p' }))).toEqual([]);
    expect(scopeTasks(inVillage('p', V_OWN, null))).toEqual([
      { what: 'war-home', playerId: 'p', settlementId: `s-${V_OWN}` },
      { what: 'visitors', playerId: 'p', villageId: V_OWN },
    ]);
    const full = scope({
      ...inVillage('p', V_OWN, { x: 1, y: 1 }),
      campaignId: CAMPAIGN,
      scene: { campaignId: 'c-2', cell: { x: 5, y: 5 } },
    });
    // jezdci na mapě vsi jdou taky (bez `MapWatch.riders`); vlastní výpravy ne – pokryje je dotaz
    expect(scopeTasks(full)).toEqual([
      { what: 'war-home', playerId: 'p', settlementId: `s-${V_OWN}` },
      { what: 'war-scene', playerId: 'p', campaignId: 'c-2', cell: { x: 5, y: 5 } },
      { what: 'campaign', playerId: 'p', campaignId: CAMPAIGN },
      { what: 'visitors', playerId: 'p', villageId: V_OWN },
    ]);
  });
});
