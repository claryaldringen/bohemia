import { describe, expect, it } from 'vitest';
import { kin, village } from '../../domain/village/__tests__/kin-fixtures';
import type { GridCell } from '../../domain/village/people/world-grid';
import type { VillageState } from '../../domain/village';
import {
  msOfTick,
  stepCampaign,
  type CampaignMap,
  type CampaignState,
  type CampaignWorld,
} from '../../domain/war';
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
import type { House } from '../houses';
import { turnBackLedCampaigns } from '../restart-game';
import {
  deliverOutbox,
  newCampaignMemory,
  stepCampaigns,
  type CampaignMemory,
  type StepCampaignsDeps,
} from '../step-campaigns';
import { InMemoryCampaignLock, InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryKnowledge } from './in-memory-knowledge';
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

  it.each([
    ['vymřelá ves', { extinctDay: 5 }, false],
    ['opuštěná ves', { abandonedDay: 5 }, false],
    ['ves bez značky se starým dnem', {}, true],
  ])('%s první na mapě po cestě', async (_name, mark, waits) => {
    const { deps, campaigns, villages } = setup();
    villages.records.set('spici', {
      id: 'spici',
      settlementId: 's-spici',
      name: 'Spící',
      state: village([], [], { lastDay: 0, ...mark }),
      version: 1,
    });
    const cells: CampaignCells = {
      mapOf: () => Promise.resolve({ ...MEADOW, villageIds: ['spici'] }),
    };
    await campaigns.create(campaign({ liveCommand: false }));
    await campaigns.addIntent('c1', {
      tick: LAUNCH + 2,
      byPlayer: 'p1',
      body: { kind: 'set-out' },
    });
    const { outcomes } = await rounds({ ...deps, cells }, LAUNCH + 1, LAUNCH + 301);
    expect(outcomes.includes('waiting')).toBe(waits);
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

  it('pád po doručení, před smazáním schránky – upozornění se doručí právě jednou', async () => {
    const { deps, campaigns, villages, notices } = setup();
    await campaigns.create(campaign({ liveCommand: false }));
    await campaigns.addIntent('c1', {
      tick: LAUNCH + 2,
      byPlayer: 'p1',
      body: { kind: 'set-out' },
    });
    let crashed = false;
    const clear = campaigns.clearOutbox.bind(campaigns);
    campaigns.clearOutbox = async (id, tick) => {
      // spadne až smazání schránky, ve které je upozornění (už doručené)
      const carries = ((await campaigns.checkpoint(id))?.outbox?.notices.length ?? 0) > 0;
      if (crashed || !carries) return clear(id, tick);
      crashed = true;
      return Promise.reject(new Error('spojení spadlo'));
    };
    const outcomes = (await rounds(deps, LAUNCH + 1, END + 40)).outcomes;
    expect(outcomes).toContain('failed');
    expect(notices.notices.map((n) => n.kind)).toEqual(['campaign-returned']);
    expect(villages.inbox.events).toHaveLength(whole.villageEvents.length);
  });

  it('deliverOutbox: týž klíč podruhé nic nezapíše, dvě upozornění téhož taktu obě', async () => {
    const { deps, notices } = setup();
    const n = { playerId: 'p1', kind: 'campaign-returned' as const, payload: {}, gameDay: 1 };
    const outbox = {
      villageEvents: [],
      notices: [
        { ...n, ref: 'camp:c1:5:n0' },
        { ...n, ref: 'camp:c1:5:n1' },
      ],
    };
    await deliverOutbox(deps, outbox);
    await deliverOutbox(deps, outbox);
    expect(notices.notices).toHaveLength(2);
  });

  it('znalost z tažení dostane jen rod vůdce – ze stavu, u staršího bodu podle hráče (Úloha 11)', async () => {
    const houses = {
      activeOf: (playerId: string): Promise<House | null> =>
        Promise.resolve(playerId === 'p1' ? ({ id: 'h-p1' } as House) : null),
    };
    const setOut = { tick: LAUNCH + 2, byPlayer: 'p1', body: { kind: 'set-out' } } as const;
    // nové tažení s rodem vůdce ve stavu – stopa cizí mapy
    const fresh = campaign({ liveCommand: false, houseId: 'h-7' });
    const trail = stepCampaign(fresh, END, SET_OUT, worldOf()).state.seen?.['1,0']?.trail;
    expect(trail?.length).toBeGreaterThan(0);
    const a = setup();
    const known = new InMemoryKnowledge();
    await a.campaigns.create(fresh);
    await a.campaigns.addIntent('c1', setOut);
    await rounds({ ...a.deps, knowledge: known, houses }, LAUNCH + 1, END + 40);
    expect(await a.campaigns.active()).toEqual([]);
    expect([...known.cells.keys()]).toEqual(['h-7|1,0']);
    expect(known.cells.get('h-7|1,0')!.trail).toEqual(trail);

    // bod z doby před Úlohou 11 (bez rodu, bez stopy): objevený dům cílové vsi dostane rod hráče
    const b = setup();
    const target = village(
      [
        kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
        kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
        kin({ id: 3, age: 5, sex: 'male', mother: 2, father: 1 }, SUMMER),
      ],
      undefined,
      { lastDay: SUMMER + 20, defense: { stance: 'surrender' } },
    );
    target.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
    b.villages.records.set('knezice', {
      id: 'knezice',
      settlementId: 's-knezice',
      name: 'Kněžice',
      state: target,
      version: 1,
    });
    const cells: CampaignCells = {
      mapOf: (cell) =>
        Promise.resolve(cell.x === 1 ? { ...MEADOW, villageIds: ['knezice'] } : MEADOW),
    };
    const knowledge = new InMemoryKnowledge();
    await b.campaigns.create(campaign({ liveCommand: false }));
    await b.campaigns.addIntent('c1', setOut);
    await rounds({ ...b.deps, cells, knowledge, houses }, LAUNCH + 1, LAUNCH + 3000);
    expect(await b.campaigns.active()).toEqual([]);
    expect([...knowledge.cells.keys()]).toEqual(['h-p1|1,0']);
    expect(knowledge.cells.get('h-p1|1,0')).toMatchObject({
      villageId: 'knezice',
      trail: [],
      parts: [{ key: `dwelling:${target.dwellings[0]!.id}`, pos: { x: -860, z: 30 } }],
    });
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

    /** Zmrazí čtené kontrolní body – paměť bodu by jinak skryla úpravu bodu na místě. */
    function freezeCheckpoints(campaigns: InMemoryCampaigns): void {
      const deepFreeze = (value: unknown): void => {
        if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
        Object.freeze(value);
        for (const inner of Object.values(value)) deepFreeze(inner);
      };
      const read = campaigns.checkpoint.bind(campaigns);
      campaigns.checkpoint = async (id): ReturnType<typeof read> => {
        const point = await read(id);
        deepFreeze(point);
        return point;
      };
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
        freezeCheckpoints(remembering.campaigns);
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
        // skončené tažení z paměti zmizí (stav, bod i co četlo)
        expect(memory.states.size).toBe(0);
        expect(memory.points.size).toBe(0);
        expect(memory.needs.size).toBe(0);
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
          if (memory) freezeCheckpoints(campaigns);
          const used = { ...deps, cells, ...(memory ? { memory } : {}) };
          await rounds(used, LAUNCH + 1, END + 40, every);
          runs.push(saves);
        }
        const [plain, remembering] = runs;
        expect(plain!.some((s) => s.includes('"battle"'))).toBe(true);
        expect(remembering).toEqual(plain);
      },
    );

    it('bod téže verze se znovu nečte (jen verze); po uložení ho kolo přečte celý', async () => {
      const { deps, campaigns } = setup();
      await campaigns.create(campaign({ liveCommand: false }));
      const used = { ...deps, memory: newCampaignMemory() };
      const outcomes: string[] = [];
      /** Za kolo: [celé čtení bodu, dotaz jen na verzi]. */
      const reads: number[][] = [];
      for (let tick = LAUNCH + 4; tick <= LAUNCH + 52; tick += 4) {
        const [full, version] = [campaigns.checkpointReads, campaigns.versionQueries];
        outcomes.push(...(await rounds(used, tick, tick)).outcomes);
        reads.push([campaigns.checkpointReads - full, campaigns.versionQueries - version]);
      }
      // bod po 40 taktech (LAUNCH + 40) – další kolo ho přečte celý, pak zase jen verze
      expect(outcomes).toEqual([
        ...Array<string>(9).fill('computed'),
        'saved',
        ...Array<string>(3).fill('computed'),
      ]);
      expect(reads).toEqual([
        [1, 0],
        ...Array.from({ length: 9 }, () => [0, 1]),
        [1, 0],
        [0, 1],
        [0, 1],
      ]);
    });

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
      // co kolo četlo (mapa vsi, ves) – další kolo to načte předem, ves jen podle otisku
      expect(memory.needs.get('c1')?.cells).toContainEqual({ x: 1, y: 0 });
      expect(memory.needs.get('c1')?.villageIds).toEqual(['knezice']);
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

describe('Začít znovu během nájezdu – útočník (war.md)', () => {
  const RAID_END = LAUNCH + 4000;
  /** Kněžice s domem u cíle a muži, kteří se brání (jako campaign-restart.test.ts). */
  function knezice(): VillageState {
    const people = [
      kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
      kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
      kin({ id: 3, age: 25, sex: 'male' }, SUMMER),
      kin({ id: 4, age: 35, sex: 'male' }, SUMMER),
    ];
    const v = village(people, undefined, {
      lastDay: SUMMER + 30,
      storesKg: 1000,
      defense: { stance: 'defend' },
    });
    v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
    return v;
  }

  /**
   * Tažení p1 (vede NPC) z Lhoty (políčko 0, 0) s mužem vazala p2 z Brodu na Kněžice (1, 0).
   * Lhota stojí na své mapě, dokud její sídlo není v archivu (jako `createCampaignCells` – políčko
   * archivovaného sídla je prázdné). Den Lhoty stojí (archiv se nedopočítá) – kdyby ji mapa po
   * archivu ukazovala dál, návrat z boje by na ni čekal navždy (bariéra Ú6.7).
   */
  function raid(): ReturnType<typeof setup> & { domainWorld: CampaignWorld } {
    const base = setup();
    const { villages } = base;
    villages.records.get('lhota')!.state = village([], [], { lastDay: SUMMER - 1 });
    villages.records.set('knezice', {
      id: 'knezice',
      settlementId: 's-knezice',
      name: 'Kněžice',
      state: knezice(),
      version: 1,
    });
    const mapAt = (cell: GridCell): CampaignMap => {
      if (cell.x === 1 && cell.y === 0) return { ...MEADOW, villageIds: ['knezice'] };
      const home = cell.x === 0 && cell.y === 0 && !villages.archivedSettlements.has('s-lhota');
      return home ? { ...MEADOW, villageIds: ['lhota'] } : MEADOW;
    };
    const cells: CampaignCells = { mapOf: (cell) => Promise.resolve(mapAt(cell)) };
    const domainWorld: CampaignWorld = {
      clock: world,
      landscapeOf: mapAt,
      villageAt: (id) => villages.records.get(id)?.state ?? null,
    };
    return { ...base, deps: { ...base.deps, cells }, domainWorld };
  }

  const start = (): CampaignState => {
    const s = campaign({ liveCommand: false });
    for (const m of s.members) if (m.ref.villageId === 'brod') m.playerId = 'p2';
    return s;
  };

  /** První takt, kdy tažení (bez restartu) splní `when`. */
  function firstTick(w: CampaignWorld, when: (s: CampaignState) => boolean): number {
    let s = start();
    while (!when(s)) {
      if (s.phase === 'done' || s.tick > RAID_END) throw new Error('fáze nenastala');
      s = stepCampaign(s, s.tick + 1, SET_OUT, w).state;
    }
    return s.tick;
  }

  /** Hodiny restartu (záměr na takt teď + 2) podle fáze. */
  const restartAt: Record<string, (w: CampaignWorld) => number> = {
    assembling: () => LAUNCH - 1,
    marching: () => LAUNCH + 38,
    raiding: (w) =>
      firstTick(w, (s) => s.phase === 'raiding' && s.battle?.outcome === 'ongoing') - 1,
    returning: (w) => firstTick(w, (s) => s.phase === 'returning'),
  };

  /** Worker do restartu, archiv Lhoty a `restarts` × obrat domů, pak worker do konce. */
  async function play(phase: string, restarts = 1) {
    const { deps, campaigns, villages, notices, domainWorld } = raid();
    await campaigns.create(start());
    await campaigns.addIntent('c1', {
      tick: LAUNCH + 2,
      byPlayer: 'p1',
      body: { kind: 'set-out' },
    });
    const now = restartAt[phase]!(domainWorld);
    if (now > LAUNCH) await rounds(deps, LAUNCH + 1, now, 4);
    villages.archivedSettlements.add('s-lhota');
    for (let i = 0; i < restarts; i++) {
      await turnBackLedCampaigns(
        { campaigns, world },
        { playerId: 'p1', nowMs: msOfTick(now, world) },
      );
    }
    const { outcomes } = await rounds(deps, now + 1, RAID_END + 40, 40);
    return { campaigns, villages, notices, outcomes, state: await stored(campaigns) };
  }

  it.each([
    ['ve shromaždišti', 'assembling'],
    ['na pochodu', 'marching'],
    ['v boji na mapě cíle', 'raiding'],
    ['na zpáteční cestě', 'returning'],
  ])(
    '%s: vojsko se obrátí domů, tažení skončí; muži domů právě jednou',
    async (_name, phase) => {
      const { campaigns, villages, outcomes, state } = await play(phase);
      expect(campaigns.intents.filter((i) => i.body.kind === 'turn-back')).toHaveLength(1);
      // archivovaná Lhota tažení nezdrží – políčko bez sídla je prázdné
      expect(outcomes).not.toContain('waiting');
      expect(state.phase).toBe('done');
      expect(await campaigns.active()).toEqual([]);
      if (phase !== 'returning') expect(state.returnReason).toBe('order');
      if (phase === 'raiding') expect(state.battle?.outcome).toBe('withdrawn');
      // muži Lhoty i vazalův muž z Brodu se vrátí právě jednou
      const back = villages.inbox.events.filter((e) => e.body.kind === 'campaign-return');
      expect(back.map((e) => e.villageId).sort()).toEqual(['brod', 'lhota']);
    },
    60_000,
  );

  it('dvojitý restart (pád mezi archivem a záměry) = jeden obrat', async () => {
    const once = await play('marching');
    const twice = await play('marching', 2);
    expect(twice.campaigns.intents.filter((i) => i.body.kind === 'turn-back')).toHaveLength(2);
    expect(JSON.stringify(twice.state)).toBe(JSON.stringify(once.state));
    expect(twice.villages.inbox.events).toEqual(once.villages.inbox.events);
    expect(twice.notices.notices).toEqual(once.notices.notices);
  }, 60_000);

  it('restart vazala ve službě tažení neobrátí – vojsko jde dál', async () => {
    const { campaigns } = raid();
    await campaigns.create(start());
    await turnBackLedCampaigns(
      { campaigns, world },
      { playerId: 'p2', nowMs: msOfTick(LAUNCH + 38, world) },
    );
    expect(campaigns.intents).toEqual([]);
  });
});
