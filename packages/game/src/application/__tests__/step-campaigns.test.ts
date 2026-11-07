import { describe, expect, it } from 'vitest';
import { village } from '../../domain/village/__tests__/kin-fixtures';
import type { GridCell } from '../../domain/village/world-grid';
import { msOfTick, stepCampaign, type CampaignState } from '../../domain/war';
import {
  campaign,
  LAUNCH,
  MEADOW,
  SET_OUT,
  SUMMER,
  world,
  worldOf,
} from '../../domain/war/__tests__/campaign-fixtures';
import { queueCampaignIntent, type CampaignCells } from '../campaigns';
import {
  newCampaignMemory,
  stepCampaigns,
  type CampaignMemory,
  type StepCampaignsDeps,
} from '../step-campaigns';
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

/** Kola smyčky po 1 s (4 takty, nebo `every`) od taktu `from` do `to`. */
async function rounds(
  deps: StepCampaignsDeps,
  from: number,
  to: number,
  every = 4,
): Promise<{ outcomes: string[] }> {
  const outcomes: string[] = [];
  for (let tick = from; tick <= to; tick += every) {
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
  // vede NPC velitel – smyčka nečeká na přítomnost hráče (živé vedení bez ní se rozpadne – Ú6.12)
  const whole = stepCampaign(campaign({ liveCommand: false }), END, SET_OUT, worldOf());

  it('kola po 1 s s restartem uprostřed = vcelku; bod nejvýš po 40 taktech, události jednou', async () => {
    const { deps, campaigns, villages, notices } = setup();
    await campaigns.create(campaign({ liveCommand: false }));
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
    await campaigns.create(campaign({ liveCommand: false }));
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
    await campaigns.create(campaign({ liveCommand: false }));
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
    const expected = stepCampaign(
      campaign({ liveCommand: false }),
      at + 41,
      [{ ...queued!, seq: 1 }],
      worldOf(),
    );
    expect(JSON.stringify(state)).toBe(JSON.stringify(expected.state));
    expect(state.phase).toBe('marching');
  });

  it('záměr do už spočteného (neuloženého) taktu – bod se neuloží, další kolo ho použije', async () => {
    const { deps, campaigns } = setup();
    await campaigns.create(campaign({ liveCommand: false }));
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

  describe('paměť workeru (poslední spočtený stav)', () => {
    /** Uložené kontrolní body (JSON) v pořadí uložení. */
    function recordSaves(campaigns: InMemoryCampaigns): string[] {
      const saved: string[] = [];
      const realSave = campaigns.saveCheckpoint.bind(campaigns);
      campaigns.saveCheckpoint = async (id, input): ReturnType<typeof realSave> => {
        const result = await realSave(id, input);
        if (result === 'saved') saved.push(JSON.stringify(input.state));
        return result;
      };
      return saved;
    }

    it.each([1, 3, 7, 13])(
      'kola po %i taktech: s pamětí tytéž body i konec jako bez ní (= vcelku)',
      async (every) => {
        const plain = setup();
        await plain.campaigns.create(campaign({ liveCommand: false }));
        const plainSaves = recordSaves(plain.campaigns);
        const remembering = setup();
        await remembering.campaigns.create(campaign({ liveCommand: false }));
        const memorySaves = recordSaves(remembering.campaigns);
        for (const { campaigns } of [plain, remembering]) {
          await campaigns.addIntent('c1', {
            tick: LAUNCH + 2,
            byPlayer: 'p1',
            body: { kind: 'set-out' },
          });
        }
        const memory = newCampaignMemory();
        await rounds(plain.deps, LAUNCH + 1, END + 40, every);
        const outcomes = (
          await rounds({ ...remembering.deps, memory }, LAUNCH + 1, END + 40, every)
        ).outcomes;
        expect(outcomes).toContain('computed');
        expect(memorySaves).toEqual(plainSaves);
        expect(JSON.stringify(await stored(remembering.campaigns))).toBe(
          JSON.stringify(whole.state),
        );
        expect(remembering.villages.inbox.events.map((e) => e.body)).toEqual(
          whole.villageEvents.map((e) => e.body),
        );
        // skončené tažení z paměti zmizí
        expect(memory.states.size).toBe(0);
      },
    );

    it.each([4, 7])(
      'nájezd na ves (mřížka s vsí z paměti) po %i taktech: tytéž body jako bez paměti',
      async (every) => {
        const runs: string[][] = [];
        for (const memory of [undefined, newCampaignMemory()]) {
          const { deps, campaigns, villages } = setup();
          villages.records.set('knezice', {
            id: 'knezice',
            settlementId: 's-knezice',
            name: 'Kněžice',
            state: village([], [], { lastDay: SUMMER + 10 }),
            version: 1,
          });
          const cells: CampaignCells = {
            mapOf: (cell) =>
              Promise.resolve(cell.x === 1 ? { ...MEADOW, villageIds: ['knezice'] } : MEADOW),
          };
          await campaigns.create(campaign({ liveCommand: false }));
          await campaigns.addIntent('c1', {
            tick: LAUNCH + 2,
            byPlayer: 'p1',
            body: { kind: 'set-out' },
          });
          const saves = recordSaves(campaigns);
          const used = { ...deps, cells, ...(memory ? { memory } : {}) };
          await rounds(used, LAUNCH + 1, END + 40, every);
          runs.push(saves);
        }
        const [plain, remembering] = runs;
        expect(plain!.some((s) => s.includes('"battle"'))).toBe(true);
        expect(remembering).toEqual(plain);
      },
    );

    it('ves téže verze se znovu nenačítá (jen otisk); uložení i post do schránky ji načtou', async () => {
      const { deps, campaigns, villages } = setup();
      villages.records.set('knezice', {
        id: 'knezice',
        settlementId: 's-knezice',
        name: 'Kněžice',
        state: village([], [], { lastDay: SUMMER + 10 }),
        version: 1,
      });
      const cells: CampaignCells = {
        mapOf: (cell) =>
          Promise.resolve(cell.x === 1 ? { ...MEADOW, villageIds: ['knezice'] } : MEADOW),
      };
      // vojsko stojí u cíle na mapě vsi – každé kolo ji potřebuje (nájezd)
      const base = campaign({ liveCommand: false });
      const at = { cell: { x: 1, y: 0 }, pos: { ...base.target.pos } };
      await campaigns.create({
        ...base,
        phase: 'marching',
        groups: base.groups.map((g) => ({ ...g, ...at, goal: at, arrived: true })),
      });
      const loaded: number[] = [];
      const find = villages.find.bind(villages);
      villages.find = async (id) => {
        const record = await find(id);
        if (id === 'knezice' && record) loaded.push(record.version);
        return record;
      };
      const memory = newCampaignMemory();
      const used = { ...deps, cells, memory };
      let usedVersion: number | null = null;
      const counts: number[] = [];
      /** Jedno kolo: kolikrát se ves načetla celá; vždy se počítá s její aktuální verzí. */
      const round = async (tick: number): Promise<number> => {
        const before = loaded.length;
        const version = villages.records.get('knezice')!.version;
        await rounds(used, tick, tick);
        const loads = loaded.length - before;
        expect(loads).toBe(version === usedVersion ? 0 : 1);
        expect(memory.villages.get('knezice')?.version).toBe(version);
        usedVersion = version;
        counts.push(loads);
        return loads;
      };
      expect(await round(LAUNCH + 4)).toBe(1);
      for (let tick = LAUNCH + 8; tick <= LAUNCH + 24; tick += 4) await round(tick);
      const record = villages.records.get('knezice')!;
      await villages.save('knezice', record.state, record.version);
      expect(await round(LAUNCH + 28)).toBe(1);
      await villages.inbox.post({
        villageId: 'knezice',
        day: SUMMER + 11,
        ref: 'test:1',
        body: { kind: 'shipment', goods: {} } as never,
      });
      expect(await round(LAUNCH + 32)).toBe(1);
      await round(LAUNCH + 36);
      // stejná verze bez načtení – jen otisky
      expect(counts.filter((n) => n === 0).length).toBeGreaterThan(0);
      expect(villages.stampQueries).toBeGreaterThan(0);
    });

    /** Tažení ve shromaždišti s pamětí po kole do LAUNCH + 20 (bez uložení bodu). */
    async function remembered(): Promise<{
      deps: StepCampaignsDeps;
      campaigns: InMemoryCampaigns;
      memory: CampaignMemory;
    }> {
      const { deps, campaigns } = setup();
      await campaigns.create(campaign({ liveCommand: false }));
      const memory = newCampaignMemory();
      const withMemory = { ...deps, memory };
      expect((await rounds(withMemory, LAUNCH + 20, LAUNCH + 20)).outcomes).toEqual(['computed']);
      expect(memory.states.get('c1')?.state.tick).toBe(LAUNCH + 20);
      return { deps: withMemory, campaigns, memory };
    }

    it('pokračuje od zapamatovaného stavu, dokud stojí bod a záměry', async () => {
      const { deps, memory } = await remembered();
      // značka v zapamatovaném stavu – další kolo ji převezme, tedy nepočítá od bodu
      const memo = memory.states.get('c1')!;
      memory.states.set('c1', {
        ...memo,
        state: { ...memo.state, supplies: { ...memo.state.supplies, foodKg: 123 } },
      });
      expect((await rounds(deps, LAUNCH + 24, LAUNCH + 24)).outcomes).toEqual(['computed']);
      expect(memory.states.get('c1')?.state.supplies.foodKg).toBe(123);
      expect(memory.states.get('c1')?.state.tick).toBe(LAUNCH + 24);
    });

    it('záměr do spočtených taktů paměť zahodí – počítá se od bodu i se záměrem', async () => {
      const { deps, campaigns } = await remembered();
      // zpožděný záměr webu na takt, který paměť už spočítala (bod je pořád starší)
      const late = await campaigns.addIntent('c1', {
        tick: LAUNCH + 10,
        byPlayer: 'p1',
        body: { kind: 'set-out' },
      });
      expect(late).not.toBeNull();
      expect((await rounds(deps, LAUNCH + 41, LAUNCH + 41)).outcomes).toEqual(['saved']);
      const expected = stepCampaign(
        campaign({ liveCommand: false }),
        LAUNCH + 41,
        [late!],
        worldOf(),
      );
      expect(JSON.stringify(await stored(campaigns))).toBe(JSON.stringify(expected.state));
      expect((await stored(campaigns)).phase).toBe('marching');
    });

    it('jiný kontrolní bod (týž takt, jiný stav) paměť zahodí', async () => {
      const { deps, campaigns, memory } = await remembered();
      const row = campaigns.rows.get('c1')!;
      const changed = { ...campaign({ liveCommand: false }), supplies: { foodKg: 7 } };
      row.state = JSON.stringify(changed);
      expect((await rounds(deps, LAUNCH + 24, LAUNCH + 24)).outcomes).toEqual(['computed']);
      const expected = stepCampaign(changed, LAUNCH + 24, [], worldOf());
      expect(JSON.stringify(memory.states.get('c1')?.state)).toBe(JSON.stringify(expected.state));
    });

    it('stav paměti za teď (hodiny zpět) se nepoužije', async () => {
      const { deps, memory } = await remembered();
      expect((await rounds(deps, LAUNCH + 12, LAUNCH + 12)).outcomes).toEqual(['computed']);
      expect(memory.states.get('c1')?.state.tick).toBe(LAUNCH + 12);
    });
  });
});
