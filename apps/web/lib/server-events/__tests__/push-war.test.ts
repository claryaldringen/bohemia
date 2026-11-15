import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbChange } from '@bohemia/db';
import type { CampaignView, WarSceneView } from '@bohemia/game';
import type { ServerEventName } from '../protocol';
import type { ConnectionScope } from '../routing';

vi.mock('server-only', () => ({}));

const { createHub } = await import('../hub');
const { createWarComputers } = await import('../push-war');

// Počítadla tažení a války (server-events.md – Válka): stav počítají tytéž funkce jako routes,
// spojení dostane výsledek jen při změně klíče – takt tažení s fází, takt války (null = `none`).

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const COALESCE_MS = 50;

const campaign = (tick: number, phase = 'march'): CampaignView =>
  ({ id: 'c1', tick, phase, fresh: true, leader: true }) as unknown as CampaignView;
const war = (tick: number): WarSceneView =>
  ({ campaignId: 'c1', tick, day: 1, side: 'defend' }) as unknown as WarSceneView;

function sink(scope: Partial<ConnectionScope>): {
  scope: ConnectionScope;
  send: (name: ServerEventName, data: unknown) => void;
  close: () => void;
  sent: { name: ServerEventName; data: unknown }[];
} {
  const sent: { name: ServerEventName; data: unknown }[] = [];
  return {
    scope: {
      playerId: 'p',
      villageId: null,
      settlementId: null,
      cell: null,
      campaignId: null,
      scene: null,
      ...scope,
    },
    send: (name, data) => sent.push({ name, data }),
    close: () => undefined,
    sent,
  };
}

/** Změna bodu tažení `c1` na políčku 1,1 (trigger `c`). */
const change = (t: number): DbChange => ({ k: 'c', id: 'c1', t, c: [[1, 1]], a: [], big: false });

describe('počítadla tažení a války', () => {
  it('campaign nese pohled a klíč takt@fáze, war klíč mapy a klíč taktu války', async () => {
    const computers = createWarComputers({
      campaign: async () => campaign(40),
      home: async () => war(41),
      scene: async () => null,
    });
    const view = await computers.campaign!({ what: 'campaign', playerId: 'p', campaignId: 'c1' });
    expect(view).toEqual({
      name: 'campaign',
      data: { campaignId: 'c1', view: campaign(40) },
      key: '40@march',
    });
    const home = await computers['war-home']!({
      what: 'war-home',
      playerId: 'p',
      settlementId: 's1',
    });
    expect(home).toEqual({
      name: 'war',
      data: { key: 'settlement:s1', war: war(41) },
      key: 'c1@41',
    });
    const scene = await computers['war-scene']!({
      what: 'war-scene',
      playerId: 'p',
      campaignId: 'c1',
      cell: { x: 2, y: -3 },
    });
    expect(scene).toEqual({ name: 'war', data: { key: 'scene:c1@2,-3', war: null }, key: 'none' });
  });

  it('tažení, které hráč nezná, nese view null a klíč none', async () => {
    const computers = createWarComputers({
      campaign: async () => null,
      home: async () => null,
      scene: async () => null,
    });
    const view = await computers.campaign!({ what: 'campaign', playerId: 'p', campaignId: 'c1' });
    expect(view).toEqual({
      name: 'campaign',
      data: { campaignId: 'c1', view: null },
      key: 'none',
    });
  });

  it('stejný takt podruhé nic nepošle', async () => {
    const computers = createWarComputers({
      campaign: async () => campaign(40),
      home: async () => war(40),
      scene: async () => null,
    });
    const hub = createHub({ computers, coalesceMs: COALESCE_MS, log: () => undefined });
    const home = sink({ villageId: 'v1', settlementId: 's1', cell: { x: 1, y: 1 } });
    const map = sink({ campaignId: 'c1' });
    hub.add(home);
    hub.add(map);
    hub.dispatch(change(40));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    hub.dispatch(change(40));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(home.sent.filter((s) => s.name === 'war')).toHaveLength(1);
    expect(map.sent.filter((s) => s.name === 'campaign')).toHaveLength(1);
  });

  it('null po neprázdném pošle war: null', async () => {
    let current: WarSceneView | null = war(40);
    const computers = createWarComputers({
      campaign: async () => null,
      home: async () => current,
      scene: async () => null,
    });
    const hub = createHub({ computers, coalesceMs: COALESCE_MS, log: () => undefined });
    const home = sink({ villageId: 'v1', settlementId: 's1', cell: { x: 1, y: 1 } });
    hub.add(home);
    hub.dispatch(change(40));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    current = null;
    hub.dispatch(change(80));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(home.sent.filter((s) => s.name === 'war').map((s) => s.data)).toEqual([
      { key: 'settlement:s1', war: war(40) },
      { key: 'settlement:s1', war: null },
    ]);
  });
});
