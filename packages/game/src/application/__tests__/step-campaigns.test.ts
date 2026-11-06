import { describe, expect, it } from 'vitest';
import { village } from '../../domain/village/__tests__/kin-fixtures';
import type { GridCell } from '../../domain/village/world-grid';
import { msOfTick, stepCampaign, type CampaignState } from '../../domain/war';
import {
  campaign,
  LAUNCH,
  MEADOW,
  SET_OUT,
  world,
  worldOf,
} from '../../domain/war/__tests__/campaign-fixtures';
import { queueCampaignIntent, type CampaignCells } from '../campaigns';
import { stepCampaigns, type StepCampaignsDeps } from '../step-campaigns';
import { InMemoryCampaignLock, InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryVillages } from './in-memory-villages';

// Smyčka tažení nad porty v paměti (Úloha 6.5, Review bod 5): restart workeru uprostřed tažení
// pokračuje z kontrolního bodu se stejným výsledkem a události do vsí se nezdvojí.

const END = LAUNCH + 900;

function setup(): {
  deps: StepCampaignsDeps;
  campaigns: InMemoryCampaigns;
  villages: InMemoryVillages;
  notices: InMemoryNotices;
  lock: InMemoryCampaignLock;
  loads: GridCell[];
} {
  const campaigns = new InMemoryCampaigns();
  const villages = new InMemoryVillages();
  for (const id of ['lhota', 'brod']) {
    villages.records.set(id, {
      id,
      settlementId: `s-${id}`,
      name: id,
      state: village([], [], { lastDay: 0 }),
      version: 1,
    });
  }
  const notices = new InMemoryNotices();
  const lock = new InMemoryCampaignLock();
  const loads: GridCell[] = [];
  const cells: CampaignCells = {
    mapOf: (cell) => {
      loads.push(cell);
      return Promise.resolve(MEADOW);
    },
  };
  const deps = { campaigns, campaignLock: lock, cells, villages, notices, world };
  return { deps, campaigns, villages, notices, lock, loads };
}

/** Kola smyčky po 1 s (4 takty) od taktu `from` do `to`. */
async function rounds(
  deps: StepCampaignsDeps,
  from: number,
  to: number,
): Promise<{ outcomes: string[] }> {
  const outcomes: string[] = [];
  for (let tick = from; tick <= to; tick += 4) {
    for (const r of await stepCampaigns(deps, { nowMs: msOfTick(tick, world) })) {
      outcomes.push(r.outcome);
    }
  }
  return { outcomes };
}

async function stored(campaigns: InMemoryCampaigns, id = 'c1'): Promise<CampaignState> {
  return (await campaigns.checkpoint(id))!.state;
}

describe('stepCampaigns', () => {
  const whole = stepCampaign(campaign(), END, SET_OUT, worldOf());

  it('kola po 1 s s restartem uprostřed = vcelku; bod nejvýš po 40 taktech, události jednou', async () => {
    const { deps, campaigns, villages, notices } = setup();
    await campaigns.create(campaign());
    const intent = await queueCampaignIntent(
      { campaigns, world },
      {
        campaignId: 'c1',
        playerId: 'p1',
        body: { kind: 'set-out' },
        nowMs: msOfTick(LAUNCH, world),
      },
    );
    expect(intent?.tick).toBe(LAUNCH + 2);
    const first = await rounds(deps, LAUNCH + 1, LAUNCH + 301);
    expect(first.outcomes).toContain('computed');
    // „restart“: nové porty (zámek, mapy), stejné úložiště
    const restarted = { ...setup().deps, campaigns, villages, notices };
    await rounds(restarted, LAUNCH + 305, END + 40);
    expect(JSON.stringify(await stored(campaigns))).toBe(JSON.stringify(whole.state));
    expect(campaigns.saves).toBeLessThan((END - LAUNCH) / 4 / 5);
    expect(villages.inbox.events.map((e) => e.body)).toEqual(
      whole.villageEvents.map((e) => e.body),
    );
    expect(notices.notices.map((n) => n.kind)).toEqual(['campaign-returned']);
    expect(await campaigns.active()).toEqual([]);
  });

  it('pád po uložení bodu, před doručením – další kolo doručí, nic se nezdvojí', async () => {
    const { deps, campaigns, villages, notices } = setup();
    await campaigns.create(campaign());
    await campaigns.addIntent('c1', {
      tick: LAUNCH + 2,
      byPlayer: 'p1',
      body: { kind: 'set-out' },
    });
    let failNotice = true;
    const flaky = {
      ...deps,
      notices: {
        post: (n: Parameters<InMemoryNotices['post']>[0]): Promise<void> => {
          if (failNotice) {
            failNotice = false;
            return Promise.reject(new Error('spojení spadlo'));
          }
          return notices.post(n);
        },
      },
    };
    const outcomes = (await rounds(flaky, LAUNCH + 1, END + 40)).outcomes;
    expect(outcomes).toContain('failed');
    expect(villages.inbox.events).toHaveLength(whole.villageEvents.length);
    expect(notices.notices).toHaveLength(1);
    expect(await campaigns.active()).toEqual([]);
  });

  it('záměr s taktem nejvýš kontrolním bodem úložiště odmítne, teď + 2 použije přesně v něm', async () => {
    const { deps, campaigns } = setup();
    await campaigns.create(campaign());
    await rounds(deps, LAUNCH + 41, LAUNCH + 41);
    const at = (await stored(campaigns)).tick;
    expect(at).toBe(LAUNCH + 41);
    expect(
      await campaigns.addIntent('c1', { tick: at, byPlayer: 'p1', body: { kind: 'set-out' } }),
    ).toBeNull();
    const queued = await queueCampaignIntent(
      { campaigns, world },
      { campaignId: 'c1', playerId: 'p1', body: { kind: 'set-out' }, nowMs: msOfTick(at, world) },
    );
    expect(queued?.tick).toBe(at + 2);
    await rounds(deps, at + 1, at + 1);
    await rounds(deps, at + 41, at + 41);
    const state = await stored(campaigns);
    const expected = stepCampaign(campaign(), at + 41, [{ ...queued!, seq: 1 }], worldOf());
    expect(JSON.stringify(state)).toBe(JSON.stringify(expected.state));
    expect(state.phase).toBe('marching');
  });

  it('záměr do už spočteného (neuloženého) taktu – bod se neuloží, další kolo ho použije', async () => {
    const { deps, campaigns } = setup();
    await campaigns.create(campaign());
    // záměr „zpožděný“ – zapíše se, až worker takt spočítal (souběh webu), ale bod je pořád starší
    const late = { tick: LAUNCH + 2, byPlayer: 'p1', body: { kind: 'set-out' as const } };
    const realSave = campaigns.saveCheckpoint.bind(campaigns);
    let injected = false;
    campaigns.saveCheckpoint = async (id, input): ReturnType<typeof realSave> => {
      if (!injected) {
        injected = true;
        await campaigns.addIntent(id, late);
      }
      return realSave(id, input);
    };
    expect((await rounds(deps, LAUNCH + 41, LAUNCH + 41)).outcomes).toEqual(['stale']);
    expect((await rounds(deps, LAUNCH + 45, LAUNCH + 45)).outcomes).toEqual(['saved']);
    expect((await stored(campaigns)).phase).toBe('marching');
  });

  it('chyba jednoho tažení nezastaví ostatní; tažení s cizím zámkem se přeskočí', async () => {
    const { deps, campaigns, lock } = setup();
    await campaigns.create(campaign({ id: 'bad' }));
    await campaigns.create(campaign({ id: 'busy' }));
    await campaigns.create(campaign({ id: 'good' }));
    campaigns.rows.get('bad')!.state = '{"zkažený": true}';
    lock.held.add('busy');
    const results = await stepCampaigns(deps, { nowMs: msOfTick(LAUNCH + 41, world) });
    expect(results.map((r) => [r.campaignId, r.outcome])).toEqual([
      ['bad', 'failed'],
      ['busy', 'busy'],
      ['good', 'saved'],
    ]);
    expect((await stored(campaigns, 'good')).tick).toBe(LAUNCH + 41);
  });
});
