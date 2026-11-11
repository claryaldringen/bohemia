import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent } from '../../village/core/inbox';
import { newSteward } from '../../village/steward/steward-state';
import type { VillageState } from '../../village/types';
import type { GridCell } from '../../village/people/world-grid';
import { alarmVillage } from '../alarm';
import type { AlarmOwner, AlarmVillage } from '../alarm-types';
import { stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignState,
  CampaignStep,
  CampaignWorld,
} from '../campaign-types';
import { MarchGridMemo } from '../march-grid';
import { WAR } from '../rules-war';
import { land, palisade } from './battle-fixtures';
import { campaign, intent, member, MEADOW, SUMMER, world } from './campaign-fixtures';

// Kdo rozhoduje při varování (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 11, Otevřené 6, Review Focus 6; Martin 9. 11. 2026: správce a NPC rody hned, ves bez
// správce čeká na hráče nejvýš 1 herní den, pak pravidlo správce). Ves A (políčko 1, 0) má dům
// u východního okraje mapy (x = 800 m) a hájek 35 m severně od něj; hradiště C (2, 0) s palisádou
// je soused na východě, ves D (2, 1) patří do domény C. Vojsko vyjde ze západního okraje mapy A.

const A: GridCell = { x: 1, y: 0 };
const C: GridCell = { x: 2, y: 0 };
const D: GridCell = { x: 2, y: 1 };
const PLAYER: AlarmOwner = { playerId: 'p2', npc: false, houseId: 'h2' };
const NPC: AlarmOwner = { playerId: null, npc: true, houseId: 'h-a' };
const LORD: AlarmOwner = { playerId: 'p3', npc: false, houseId: 'h3' };
const HOME = { x: 800, z: 0 };
const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
const GRACE = WAR.alarm.playerGraceTicks;

/** Hájek 4 × 4 políčka krajiny (x 750–810 m, z 30–90 m). */
const grove = (tx: number, ty: number): boolean => tx >= 114 && tx <= 117 && ty >= 66 && ty <= 69;

/** Ves A: vesničan 30 let (posel), muž rodu, dvě ženy a dvě děti, zásoby a stádo. */
function villageA(extra: Partial<VillageState> = {}): VillageState {
  return village(
    [
      kin({ id: 1, age: 30, sex: 'male' }, SUMMER),
      { ...kin({ id: 2, age: 35, sex: 'male' }, SUMMER), line: true },
      kin({ id: 3, age: 30, sex: 'female' }, SUMMER),
      kin({ id: 4, age: 28, sex: 'female' }, SUMMER),
      kin({ id: 5, age: 10, sex: 'male' }, SUMMER),
      kin({ id: 6, age: 3, sex: 'female' }, SUMMER),
    ],
    [{ ...dwelling(1), position: { ...HOME, rotation: 0 } }],
    {
      lastDay: SUMMER - 1,
      storesKg: 300,
      livestock: { herds: { ...NO_HERD, sheep: 10, cow: 2 }, young: { ...NO_HERD } },
      ...extra,
    },
  );
}

/** Hradiště C – dva vesničani (poslové do domény), palisáda; správce podle `steward`. */
function villageC(steward = false): VillageState {
  return village(
    [kin({ id: 1, age: 20, sex: 'male' }, SUMMER), kin({ id: 2, age: 25, sex: 'male' }, SUMMER)],
    [dwelling(1)],
    {
      lastDay: SUMMER - 1,
      fortifications: [palisade(true)],
      ...(steward ? { steward: newSteward(SUMMER - 10, true) } : {}),
    },
  );
}

const villageD = village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)], {
  lastDay: SUMMER - 1,
});

const mapOf = (villageIds: string[], forest?: typeof grove): CampaignMap => ({
  landscape: land(forest),
  obstacles: null,
  villageIds,
});

interface Setup {
  a?: VillageState;
  c?: VillageState;
  ownerA?: AlarmOwner;
  ownerC?: AlarmOwner;
  /** Mapa A bez hájku. */
  bare?: boolean;
}

function worldOf(setup: Setup = {}): CampaignWorld {
  const states: Record<string, VillageState> = {
    a: setup.a ?? villageA(),
    c: setup.c ?? villageC(),
    d: villageD,
  };
  const maps: Record<string, CampaignMap> = {
    '1,0': mapOf(['a'], setup.bare ? undefined : grove),
    '2,0': mapOf(['c']),
    '2,1': mapOf(['d']),
  };
  const owners: Record<string, AlarmOwner> = {
    a: setup.ownerA ?? PLAYER,
    c: setup.ownerC ?? { playerId: null, npc: true, houseId: 'h-c' },
    d: { playerId: null, npc: true, houseId: 'h-d' },
  };
  return {
    clock: world,
    landscapeOf: (cell) => maps[`${cell.x},${cell.y}`] ?? MEADOW,
    villageAt: (id) => states[id] ?? null,
    watcherOf: (id) => (id === 'a' ? { playerId: 'p2', name: 'Vlkov' } : null),
    alarmOf: (id) => owners[id] ?? { playerId: null, npc: true, houseId: `h-${id}` },
    refugeHostsOf: (id) => (id === 'a' ? [{ villageId: 'c', cell: C }] : []),
    domainOf: (id) => (id === 'c' ? [{ villageId: 'd', cell: D }] : []),
    villageNameOf: (id) => ({ a: 'Vlkov', c: 'Hradec', d: 'Dub' })[id] ?? null,
    grids: new MarchGridMemo(),
  };
}

/**
 * Vojsko (30 mužů) stojí u západního okraje mapy A (`fromX`) a táhne k vsi A (nebo daleko na
 * západ – `away`); ves ho tam viděla a dozví se o něm v prvním počítaném taktu (`warnTick`).
 */
function approaching(owner: AlarmOwner, fromX = -900, away = false): CampaignState {
  const target = away
    ? { villageId: 'knezice', cell: { x: -3, y: 0 }, pos: { x: 0, z: 0 } }
    : { villageId: 'a', cell: { ...A }, pos: { x: 700, z: 0 } };
  const members = [member(1, 0, true)];
  for (let i = 2; i <= 30; i++) members.push(member(i, 1, false));
  const s = campaign({ liveCommand: false, foodKg: 400, members, target });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...A };
    g.pos = { x: fromX, z: 0 };
    g.goal = structuredClone(target);
    g.route = away ? [0, -1, -2, -3].map((x) => ({ x, y: 0 })) : [];
    g.arrived = false;
  }
  s.alarm = {
    villages: [
      {
        villageId: 'a',
        owner,
        seenTick: s.tick,
        seenAt: { cell: { ...A }, pos: { x: fromX, z: 0 } },
        warnTick: s.tick + 1,
        by: 'villager',
        hosts: ['c'],
      },
    ],
    messengers: [],
    flights: [],
    nextRef: 0,
  };
  return s;
}

const byA = (tick: number, body: CampaignIntent['body']): CampaignIntent =>
  intent(tick, 1, body, 'p2');

const of = (events: readonly NewVillageEvent[], villageId: string): string[] =>
  events.filter((e) => e.villageId === villageId).map((e) => e.body.kind);

function alarmOf(step: CampaignStep, id: string): AlarmVillage {
  const v = alarmVillage(step.state, id);
  if (!v) throw new Error(`${id} o vojsku neví`);
  return v;
}

describe('správce a NPC rody rozhodují (Úloha 11)', () => {
  it('(a) NPC ves – posel (vesničan pěšky) a útěk do hradiště „se vším“ v taktu varování', () => {
    const start = approaching(NPC);
    const t1 = start.tick + 1;
    const step = stepCampaign(start, t1, [], worldOf({ ownerA: NPC }));
    expect(step.waiting).toBeNull();
    expect(alarmOf(step, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(step.state.alarm!.messengers[0]).toMatchObject({
      personId: 1,
      mounted: false,
      toVillageId: 'c',
      departTick: t1,
    });
    // posel ve skupině nejde – vesničan 1 běží, ostatní odejdou se vším
    expect(step.state.alarm!.flights[0]).toMatchObject({
      mode: 'all',
      hostVillageId: 'c',
      departTick: t1,
      herd: { ...NO_HERD, sheep: 10, cow: 2 },
    });
    expect(step.state.alarm!.flights[0]!.people.map((p) => p.id)).toEqual([2, 3, 4, 5, 6]);
    expect(of(step.villageEvents, 'a')).toEqual([
      'threat-signal',
      'messenger-out',
      'refuge-depart',
      'raid-day',
    ]);
  });

  it('(a) ves hráče se zapnutým správcem rozhodne hned jako NPC', () => {
    const start = approaching(PLAYER);
    const a = villageA({ steward: newSteward(SUMMER - 10, true) });
    const step = stepCampaign(start, start.tick + 1, [], worldOf({ a }));
    expect(alarmOf(step, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    expect(step.state.alarm!.flights[0]!.mode).toBe('all');
  });

  it('(b) hráč bez správce a bez volby – po 1 herním dni (344 taktů) rozhodne pravidlo správce', () => {
    const start = approaching(PLAYER);
    const warnTick = start.tick + 1;
    const w = worldOf();
    const before = stepCampaign(start, warnTick + GRACE - 1, [], w);
    expect(alarmOf(before, 'a').decided).toBeUndefined();
    expect(before.state.alarm!.messengers).toEqual([]);
    expect(before.state.alarm!.flights).toEqual([]);
    const after = stepCampaign(before.state, warnTick + GRACE, [], w);
    expect(alarmOf(after, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(after.state.alarm!.messengers[0]!.departTick).toBe(warnTick + GRACE);
    expect(after.state.alarm!.flights[0]).toMatchObject({
      mode: 'all',
      departTick: warnTick + GRACE,
    });
  });

  it('(b) volba hráče v taktu 100 má přednost – správce už nerozhoduje (Review Focus 6)', () => {
    const start = approaching(PLAYER);
    const t100 = start.tick + 100;
    const step = stepCampaign(
      start,
      start.tick + 2 * GRACE,
      [byA(t100, { kind: 'alarm-messenger', village: 'a' })],
      worldOf(),
    );
    expect(alarmOf(step, 'a')).toMatchObject({ decided: 'player', messenger: 'c1:a0' });
    expect(alarmOf(step, 'a').flight).toBeUndefined();
    expect(step.state.alarm!.messengers).toHaveLength(1);
    expect(step.state.alarm!.flights).toEqual([]);
  });

  it('(c) postoj „bránit“ – jen posel, lidé zůstanou a brání ves jako dnes', () => {
    const start = approaching(NPC);
    const a = villageA({ defense: { stance: 'defend' } });
    const step = stepCampaign(start, start.tick + 3200, [], worldOf({ a, ownerA: NPC }));
    expect(step.waiting).toBeNull();
    expect(alarmOf(step, 'a')).toMatchObject({ decided: 'steward', messenger: 'c1:a0' });
    expect(step.state.alarm!.flights).toEqual([]);
    const defenders = step.state.battle!.fighters.filter((x) => x.side === 'defend');
    expect(defenders.length).toBeGreaterThan(0);
    // muž rodu zůstal doma a brání (posel se mezitím vrátil – běžel tam i zpět dřív, než vojsko došlo)
    expect(defenders.some((x) => x.ref === 2)).toBe(true);
  });

  it('(d) vlastní opevnění s plochou – jen posel (útočiště má doma)', () => {
    const start = approaching(NPC);
    const a = villageA({ fortifications: [palisade(true)] });
    const step = stepCampaign(start, start.tick + 1, [], worldOf({ a, ownerA: NPC }));
    expect(alarmOf(step, 'a')).toMatchObject({ decided: 'steward', messenger: 'c1:a0' });
    expect(step.state.alarm!.flights).toEqual([]);
  });

  it('(e) do hradiště to nestihnou ani jen lidé – les; bez lesa nic (platí postoj při boji)', () => {
    // vojsko viděli 150 m od domu
    const start = approaching(NPC, 650);
    const forest = stepCampaign(start, start.tick + 1, [], worldOf({ ownerA: NPC }));
    expect(alarmOf(forest, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    expect(forest.state.alarm!.flights[0]).toMatchObject({ mode: 'forest', hostVillageId: null });
    const bare = stepCampaign(start, start.tick + 1, [], worldOf({ ownerA: NPC, bare: true }));
    expect(alarmOf(bare, 'a')).toMatchObject({ decided: 'steward', messenger: 'c1:a0' });
    expect(alarmOf(bare, 'a').flight).toBeUndefined();
    expect(bare.state.alarm!.flights).toEqual([]);
  });
});

describe('hradiště varuje doménu (Úloha 11)', () => {
  /** Posel A doběhne do C; takt příchodu. */
  function arrival(step: CampaignStep): number {
    const m = step.state.alarm!.messengers.find((x) => x.fromVillageId === 'a');
    if (m?.status !== 'arrived') throw new Error('posel A nedoběhl');
    return m.doneTick!;
  }
  const domainSent = (step: CampaignStep): string[] =>
    step.state.alarm!.messengers.filter((m) => m.fromVillageId === 'c').map((m) => m.toVillageId);

  it('(f) hradiště se správcem rozešle posly do domény hned, jak doběhne posel vsi', () => {
    const start = approaching(NPC, -900, true);
    const w = worldOf({ ownerA: NPC, c: villageC(true), ownerC: LORD });
    const step = stepCampaign(start, start.tick + 1500, [], w);
    expect(step.waiting).toBeNull();
    const heard = arrival(step);
    expect(domainSent(step)).toEqual(['d']);
    const m = step.state.alarm!.messengers.find((x) => x.fromVillageId === 'c')!;
    expect(m.departTick).toBe(heard);
    expect(alarmOf(step, 'c').domain).toEqual([m.refId]);
  });

  it('(f) hradiště hráče bez správce – posly do domény po lhůtě; volba hráče má přednost', () => {
    const start = approaching(NPC, -900, true);
    const w = worldOf({ ownerA: NPC, ownerC: LORD });
    const step = stepCampaign(start, start.tick + 1500, [], w);
    const heard = arrival(step);
    const m = step.state.alarm!.messengers.find((x) => x.fromVillageId === 'c')!;
    expect(m.departTick).toBe(heard + GRACE);
    // hráč C zvolil, že nikoho neposílá dál (prázdný výběr) – lhůta ho nepřebije
    const chosen = stepCampaign(
      start,
      start.tick + 1500,
      [intent(heard + 10, 1, { kind: 'alarm-domain', village: 'c', to: [] }, 'p3')],
      w,
    );
    expect(domainSent(chosen)).toEqual([]);
    expect(alarmOf(chosen, 'c').domain).toEqual([]);
  });
});

describe('po kouscích taktů (Úloha 11)', () => {
  it(
    '(g) lhůta hráče, posel a hradiště po 1, 7 a 40 taktech přes JSON = vcelku',
    { timeout: 120_000 },
    () => {
      const start = approaching(PLAYER, -900, true);
      const end = start.tick + 1600;
      const w = worldOf({ ownerC: LORD });
      const whole = stepCampaign(start, end, [], w);
      expect(whole.waiting).toBeNull();
      expect(alarmOf(whole, 'a').decided).toBe('steward');
      expect(alarmOf(whole, 'c').domain).toHaveLength(1);
      for (const chunk of [1, 7, 40]) {
        const events: NewVillageEvent[] = [];
        const notices: CampaignStep['notices'] = [];
        let s = start;
        while (s.tick < end) {
          const next = stepCampaign(
            s,
            Math.min(end, s.tick + chunk),
            [],
            worldOf({ ownerC: LORD }),
          );
          expect(next.waiting).toBeNull();
          events.push(...next.villageEvents);
          notices.push(...next.notices);
          s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
        }
        expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
        expect(events).toEqual(whole.villageEvents);
        expect(notices).toEqual(whole.notices);
      }
    },
  );
});
