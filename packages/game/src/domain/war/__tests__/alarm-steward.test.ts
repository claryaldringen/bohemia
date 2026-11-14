import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent } from '../../village/core/inbox';
import { newSteward } from '../../village/steward/steward-state';
import type { VillageState } from '../../village/types';
import type { GridCell } from '../../village/people/world-grid';
import { alarmVillage } from '../alarm';
import type { AlarmOwner, AlarmVillage } from '../alarm-types';
import { campaignFinished, stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignState,
  CampaignStep,
  CampaignWorld,
} from '../campaign-types';
import { alarmTaken } from '../evacuation';
import { MarchGridMemo } from '../march-grid';
import { absentTicks } from '../ticks';
import { land, palisade } from './battle-fixtures';
import { campaign, intent, member, MEADOW, SUMMER, world } from './campaign-fixtures';

// Kdo rozhoduje při varování (war.md – Varování, poslové a útěk do hradiště; Hráč ve vsi a mimo
// ni; plán 2026-11-14 – Úloha 5, 5b): NPC rody a ves, kde vojvoda není doma (i v zajetí tažení),
// rozhodnou pravidlem správce hned. Ves s vojvodou doma – i se zapnutým správcem – se zeptá, zda
// je hráč u hry (`askedTick`), a čeká na odpověď (záměr `alarm-presence`): hráč u hry rozhoduje
// sám, bez přítomnosti déle než 1 herní den (`absentTicks`) rozhodne správce – i po volbě hráče.
// Vzdáním vojvody varování vsi končí. Ves A (políčko 1, 0) má dům
// u východního okraje mapy (x = 800 m) a hájek 35 m severně od něj; hradiště C (2, 0) s palisádou
// je soused na východě, ves D (2, 1) patří do domény C. Vojsko vyjde ze západního okraje mapy A.

const A: GridCell = { x: 1, y: 0 };
const C: GridCell = { x: 2, y: 0 };
const D: GridCell = { x: 2, y: 1 };
/** Ves A hráče p2 – vojvoda tu nežije (vlastník bez `lordId`). */
const PLAYER: AlarmOwner = { playerId: 'p2', npc: false, houseId: 'h2' };
/** Ves A hráče p2 s vojvodou doma – hráčův muž je muž rodu 2 (35 let). */
const LORD_HOME: AlarmOwner = { ...PLAYER, lordId: 2 };
const NPC: AlarmOwner = { playerId: null, npc: true, houseId: 'h-a' };
/** Hradiště C hráče p3 – vojvoda tu nežije. */
const LORD: AlarmOwner = { playerId: 'p3', npc: false, houseId: 'h3' };
/** Hradiště C hráče p3 s vojvodou doma (muž 2 hradiště). */
const LORD_C_HOME: AlarmOwner = { ...LORD, lordId: 2 };
const HOME = { x: 800, z: 0 };
const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
/** 1 herní den v taktech – hráč bez přítomnosti déle je pryč. */
const ABSENT = absentTicks(world);

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

/** Odpověď workeru na přítomnost (`alarm-presence`) – poslední přítomnost hráče `seenTick`. */
const presence = (
  tick: number,
  seenTick: number | null,
  village = 'a',
  byPlayer = 'p2',
): CampaignIntent => intent(tick, 1, { kind: 'alarm-presence', village, seenTick }, byPlayer);

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

  it('(a) ves se zapnutým správcem a vojvodou doma ovládá hráč – jako ves bez správce', () => {
    // Martin 14. 11. 2026: „Pokud je hráč ve své vesnici, tak jí ovládá.“ (Ruling 5 – přebíjí
    // Rozhodnutí plánu 3)
    const start = approaching(LORD_HOME);
    const warnTick = start.tick + 1;
    const t = warnTick + 2;
    const a = villageA({ steward: newSteward(SUMMER - 10, true) });
    const w = worldOf({ a, ownerA: LORD_HOME });
    // bez odpovědi se ves zeptá a čeká
    const asked = stepCampaign(start, t + 5, [], w);
    expect(asked.waiting).toBeNull();
    expect(alarmOf(asked, 'a').askedTick).toBe(warnTick);
    expect(alarmOf(asked, 'a').decided).toBeUndefined();
    expect(asked.state.alarm!.messengers).toEqual([]);
    expect(asked.state.alarm!.flights).toEqual([]);
    // hráč u hry – správce nic do absentTicks, pak rozhodne
    const present = stepCampaign(start, t + ABSENT, [presence(t, t)], w);
    expect(alarmOf(present, 'a').decided).toBeUndefined();
    expect(present.state.alarm!.flights).toEqual([]);
    const later = stepCampaign(present.state, t + ABSENT + 1, [presence(t, t)], w);
    expect(alarmOf(later, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    // hráč u hry není – správce v taktu odpovědi
    const gone = stepCampaign(start, t, [presence(t, null)], w);
    expect(alarmOf(gone, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(gone.state.alarm!.flights[0]).toMatchObject({ mode: 'all', departTick: t });
    // vojvoda mimo ves – se správcem i bez něj nastavení hned v taktu varování
    const away = stepCampaign(approaching(PLAYER), warnTick, [], worldOf({ a, ownerA: PLAYER }));
    expect(alarmOf(away, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    expect(alarmOf(away, 'a').askedTick).toBeUndefined();
  });
});

describe('hráč ve vsi, nebo nastavení (plán 2026-11-14 – Úloha 5)', () => {
  it('vojvoda mimo ves – správce hned v taktu varování', () => {
    // vlastník bez hráčova muže (jiná ves rodu) i muž, který ve vsi nežije
    for (const owner of [PLAYER, { ...PLAYER, lordId: 99 }]) {
      const start = approaching(owner);
      const warnTick = start.tick + 1;
      const step = stepCampaign(start, warnTick, [], worldOf({ ownerA: owner }));
      expect(step.waiting).toBeNull();
      const v = alarmOf(step, 'a');
      expect(v).toMatchObject({ decided: 'steward', messenger: 'c1:a0', flight: 'c1:a1' });
      expect(v.askedTick).toBeUndefined();
      expect(step.state.alarm!.messengers[0]!.departTick).toBe(warnTick);
      expect(step.state.alarm!.flights[0]).toMatchObject({ mode: 'all', departTick: warnTick });
    }
  });

  it('vojvoda doma bez odpovědi – ves čeká a zapíše askedTick', () => {
    const start = approaching(LORD_HOME);
    const warnTick = start.tick + 1;
    const step = stepCampaign(start, warnTick + ABSENT + 10, [], worldOf({ ownerA: LORD_HOME }));
    expect(step.waiting).toBeNull();
    const v = alarmOf(step, 'a');
    expect(v.decided).toBeUndefined();
    expect(v.askedTick).toBe(warnTick);
    expect('presenceTick' in v).toBe(false);
    expect(step.state.alarm!.messengers).toEqual([]);
    expect(step.state.alarm!.flights).toEqual([]);
  });

  it('odpověď seenTick null – správce v taktu odpovědi', () => {
    const start = approaching(LORD_HOME);
    const warnTick = start.tick + 1;
    const answer = warnTick + 2;
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [presence(answer, null)];
    const before = stepCampaign(start, answer - 1, intents, w);
    expect(alarmOf(before, 'a').askedTick).toBe(warnTick);
    expect(alarmOf(before, 'a').decided).toBeUndefined();
    const after = stepCampaign(before.state, answer, intents, w);
    const v = alarmOf(after, 'a');
    expect(v).toMatchObject({
      decided: 'steward',
      presenceTick: null,
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(v.askedTick).toBeUndefined();
    expect(after.state.alarm!.messengers[0]!.departTick).toBe(answer);
    expect(after.state.alarm!.flights[0]!.departTick).toBe(answer);
  });

  it('hráč u hry – ves nerozhoduje; po absentTicks bez přítomnosti správce', () => {
    const start = approaching(LORD_HOME);
    const t = start.tick + 3;
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [presence(t, t)];
    const present = stepCampaign(start, t + ABSENT, intents, w);
    expect(present.waiting).toBeNull();
    const v = alarmOf(present, 'a');
    expect(v.decided).toBeUndefined();
    expect(v.presenceTick).toBe(t);
    expect(v.askedTick).toBeUndefined();
    expect(present.state.alarm!.messengers).toEqual([]);
    expect(present.state.alarm!.flights).toEqual([]);
    const gone = stepCampaign(present.state, t + ABSENT + 1, intents, w);
    expect(alarmOf(gone, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(gone.state.alarm!.messengers[0]!.departTick).toBe(t + ABSENT + 1);
    expect(gone.state.alarm!.flights[0]!.departTick).toBe(t + ABSENT + 1);
  });

  it('každý záměr alarm-* od vlastníka je přítomnost', () => {
    const start = approaching(LORD_HOME);
    const warnTick = start.tick + 1;
    const t = warnTick + 2;
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [
      // cizí hráč – přítomnost vlastníka to není
      intent(warnTick + 1, 1, { kind: 'alarm-domain', village: 'a', to: [] }, 'p9'),
      // pokyn vlastníka, který ves nerozhodne (doména bez vsí)
      byA(t, { kind: 'alarm-domain', village: 'a', to: [] }),
      // pozdější odpověď workeru přítomnost neubere: null ani starší takt
      presence(t + 5, null),
      presence(t + 6, t - 1),
    ];
    const foreign = stepCampaign(start, warnTick + 1, intents, w);
    expect(alarmOf(foreign, 'a').askedTick).toBe(warnTick);
    expect('presenceTick' in alarmOf(foreign, 'a')).toBe(false);
    const present = stepCampaign(foreign.state, t + ABSENT, intents, w);
    const v = alarmOf(present, 'a');
    expect(v).toMatchObject({ presenceTick: t, domain: [] });
    expect(v.askedTick).toBeUndefined();
    expect(v.decided).toBeUndefined();
    const gone = stepCampaign(present.state, t + ABSENT + 1, intents, w);
    expect(alarmOf(gone, 'a').decided).toBe('steward');
  });

  it('vojvoda vyběhne jako posel – správce v témž taktu (Review Focus 2)', () => {
    const start = approaching(LORD_HOME);
    const t = start.tick + 3;
    const go = t + 3;
    const step = stepCampaign(
      start,
      go,
      [presence(t, t), byA(go, { kind: 'alarm-messenger', village: 'a', personId: 2 })],
      worldOf({ ownerA: LORD_HOME }),
    );
    expect(step.waiting).toBeNull();
    // hráč odešel s vojvodou – ves bez hráče se zařídí podle nastavení (útěk) v témž taktu
    expect(alarmOf(step, 'a')).toMatchObject({
      decided: 'steward',
      presenceTick: go,
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(step.state.alarm!.messengers[0]).toMatchObject({ personId: 2, departTick: go });
    expect(step.state.alarm!.flights[0]!.departTick).toBe(go);
    expect(step.state.alarm!.flights[0]!.people.map((p) => p.id)).not.toContain(2);
  });

  it('po volbě hráče: hráč odejde od hry – správce dořeší zbytek, posla nezopakuje (Ruling 4)', () => {
    const start = approaching(LORD_HOME);
    const t = start.tick + 3;
    const go = t + 3;
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [presence(t, t), byA(go, { kind: 'alarm-messenger', village: 'a' })];
    // hráč u hry – po jeho volbě (posel) ves dál řídí on
    const present = stepCampaign(start, go + ABSENT, intents, w);
    expect(present.waiting).toBeNull();
    expect(alarmOf(present, 'a')).toMatchObject({
      decided: 'player',
      messenger: 'c1:a0',
      presenceTick: go,
    });
    expect(alarmOf(present, 'a').flight).toBeUndefined();
    expect(present.state.alarm!.flights).toEqual([]);
    // přítomnost starší než absentTicks – správce: útěk, druhého posla ne
    const gone = stepCampaign(present.state, go + ABSENT + 1, intents, w);
    expect(alarmOf(gone, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    const fromA = gone.state.alarm!.messengers.filter((m) => m.fromVillageId === 'a');
    expect(fromA.map((m) => m.personId)).toEqual([1]);
    expect(gone.state.alarm!.flights[0]!.departTick).toBe(go + ABSENT + 1);
    expect(gone.state.alarm!.flights[0]!.people.map((p) => p.id)).not.toContain(1);
  });

  it('po volbě hráče vojvoda odjede nebo je zajat – správce převezme v témž taktu', () => {
    const start = approaching(LORD_HOME);
    const t = start.tick + 3;
    const go = t + 3;
    const intents = [presence(t, t), byA(go, { kind: 'alarm-messenger', village: 'a' })];
    const chose = stepCampaign(start, go + 2, intents, worldOf({ ownerA: LORD_HOME }));
    expect(chose.waiting).toBeNull();
    expect(alarmOf(chose, 'a')).toMatchObject({ decided: 'player', messenger: 'c1:a0' });
    expect(chose.state.alarm!.flights).toEqual([]);
    const fromA = (step: CampaignStep): number[] =>
      step.state.alarm!.messengers.filter((m) => m.fromVillageId === 'a').map((m) => m.personId);
    // výjezd vojvody (lord-control.md) – ves zůstala bez hráče
    const a = villageA();
    a.people.find((p) => p.id === 2)!.away = { kind: 'journey' };
    const rode = stepCampaign(chose.state, go + 3, intents, worldOf({ a, ownerA: LORD_HOME }));
    expect(rode.waiting).toBeNull();
    expect(alarmOf(rode, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    expect(fromA(rode)).toEqual([1]);
    expect(rode.state.alarm!.flights[0]!.departTick).toBe(go + 3);
    // zajetí – tažení vojvodu odvedlo (`captives`), stav vsi o tom ještě neví (Ruling 6)
    const held = structuredClone(chose.state);
    held.captives.push({ villageId: 'a', personId: 2 });
    const caught = stepCampaign(held, go + 3, intents, worldOf({ ownerA: LORD_HOME }));
    expect(caught.waiting).toBeNull();
    expect(alarmOf(caught, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
    expect(fromA(caught)).toEqual([1]);
    expect(caught.state.alarm!.flights[0]!.people.map((p) => p.id)).not.toContain(2);
  });

  it('starý bod bez askedTick a presenceTick – zeptá se (Review Focus 5)', () => {
    // bod uložený před Úlohou 5: ves varovaná před 100 takty čeká na hráče (dřívější lhůta)
    const saved = (owner: AlarmOwner): CampaignState => {
      const s = approaching(owner);
      const v = s.alarm!.villages[0]!;
      v.seenTick = s.tick - 101;
      v.warnTick = s.tick - 100;
      return JSON.parse(JSON.stringify(s)) as CampaignState;
    };
    const home = saved(LORD_HOME);
    const asked = stepCampaign(home, home.tick + 1, [], worldOf({ ownerA: LORD_HOME }));
    expect(asked.waiting).toBeNull();
    expect(alarmOf(asked, 'a').askedTick).toBe(home.tick + 1);
    expect(alarmOf(asked, 'a').decided).toBeUndefined();
    // vlastník zapsaný bez hráčova muže – vojvoda není doma, správce hned
    const old = saved(PLAYER);
    const step = stepCampaign(old, old.tick + 1, [], worldOf());
    expect(step.waiting).toBeNull();
    expect(alarmOf(step, 'a')).toMatchObject({ decided: 'steward', messenger: 'c1:a0' });
    expect(alarmOf(step, 'a').askedTick).toBeUndefined();
  });
});

describe('nastavení rozhoduje, jen dokud vojsko hrozí (Ruling 9)', () => {
  // hráč u hry v taktu t nic nezvolí a odejde – po absentTicks by za ves rozhodlo nastavení
  const leftAt = (start: CampaignState): number => start.tick + 3;
  const offMapA = (s: CampaignState): boolean =>
    s.groups.every((g) => g.cell.x !== A.x || g.cell.y !== A.y);

  it('(a) vojsko dál míří na ves – po absentTicks rozhodne nastavení jako dřív', () => {
    const start = approaching(LORD_HOME);
    const t = leftAt(start);
    const w = worldOf({ ownerA: LORD_HOME });
    const step = stepCampaign(start, t + ABSENT + 1, [presence(t, t)], w);
    expect(step.waiting).toBeNull();
    expect(offMapA(step.state)).toBe(false);
    expect(alarmOf(step, 'a')).toMatchObject({
      decided: 'steward',
      messenger: 'c1:a0',
      flight: 'c1:a1',
    });
    expect(step.state.alarm!.flights[0]!.departTick).toBe(t + ABSENT + 1);
  });

  it('(b) vojsko ves minulo – čekající rozhodnutí propadne: žádný posel ani útěk', () => {
    const start = approaching(LORD_HOME, -900, true);
    const t = leftAt(start);
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [presence(t, t)];
    // vojsko mapu A opustí dřív, než by nastavení rozhodlo – míří jinam
    const passed = stepCampaign(start, t + ABSENT, intents, w);
    expect(offMapA(passed.state)).toBe(true);
    const step = stepCampaign(passed.state, t + ABSENT + 300, intents, w);
    expect(step.waiting).toBeNull();
    const v = alarmOf(step, 'a');
    expect(v.decided).toBeUndefined();
    expect(v.presenceTick).toBe(t);
    expect(step.state.alarm!.messengers).toEqual([]);
    expect(step.state.alarm!.flights).toEqual([]);
  });

  it('(b) vojsko se vrací domů – nic, ani po volbě hráče (playerLeft)', () => {
    const start = approaching(LORD_HOME);
    start.phase = 'returning';
    start.returnReason = 'order';
    const t = leftAt(start);
    const w = worldOf({ ownerA: LORD_HOME });
    // vojsko stojí na mapě A, ale jde domů – hrozba pominula
    const quiet = stepCampaign(start, t + ABSENT + 50, [presence(t, t)], w);
    expect(quiet.waiting).toBeNull();
    expect(offMapA(quiet.state)).toBe(false);
    expect(alarmOf(quiet, 'a').decided).toBeUndefined();
    expect(quiet.state.alarm!.messengers).toEqual([]);
    expect(quiet.state.alarm!.flights).toEqual([]);
    // hráč poslal posla a odešel – správce útěk nedořeší
    const go = t + 3;
    const chose = [presence(t, t), byA(go, { kind: 'alarm-messenger', village: 'a' })];
    const left = stepCampaign(start, go + ABSENT + 50, chose, w);
    expect(left.waiting).toBeNull();
    expect(alarmOf(left, 'a')).toMatchObject({ decided: 'player', messenger: 'c1:a0' });
    expect(left.state.alarm!.flights).toEqual([]);
  });
});

describe('pravidlo správce – postoj, útočiště, les (Úloha 11)', () => {
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

  it('hradiště hráče: doména podle téhož pravidla', () => {
    const start = approaching(NPC, -900, true);
    const sentAt = (step: CampaignStep): number | undefined =>
      step.state.alarm!.messengers.find((x) => x.fromVillageId === 'c')?.departTick;
    // vojvoda C mimo hradiště – posly do domény hned, jak doběhne posel vsi
    const away = stepCampaign(start, start.tick + 1500, [], worldOf({ ownerA: NPC, ownerC: LORD }));
    expect(away.waiting).toBeNull();
    const heard = arrival(away);
    expect(domainSent(away)).toEqual(['d']);
    expect(sentAt(away)).toBe(heard);
    // vojvoda doma bez odpovědi – hradiště se zeptá a čeká
    const w = worldOf({ ownerA: NPC, ownerC: LORD_C_HOME });
    const asked = stepCampaign(start, start.tick + 1500, [], w);
    expect(domainSent(asked)).toEqual([]);
    expect(alarmOf(asked, 'c').askedTick).toBe(heard);
    expect(alarmOf(asked, 'c').domain).toBeUndefined();
    // odpověď bez přítomnosti – posly v taktu odpovědi
    const answered = stepCampaign(
      start,
      start.tick + 1500,
      [presence(heard + 2, null, 'c', 'p3')],
      w,
    );
    expect(domainSent(answered)).toEqual(['d']);
    expect(sentAt(answered)).toBe(heard + 2);
    // hráč u hry nikoho dál neposlal (prázdný výběr) – správce ho nepřebije ani po absentTicks
    const chosen = stepCampaign(
      start,
      heard + ABSENT + 20,
      [
        presence(heard + 2, heard + 2, 'c', 'p3'),
        intent(heard + 10, 1, { kind: 'alarm-domain', village: 'c', to: [] }, 'p3'),
      ],
      w,
    );
    expect(chosen.waiting).toBeNull();
    expect(domainSent(chosen)).toEqual([]);
    expect(alarmOf(chosen, 'c').domain).toEqual([]);
  });
});

/** Záměr obránce „vzdát vojvodu“ vsi A (vlastník p2). */
const surrender = (tick: number, seq = 1): CampaignIntent =>
  intent(tick, seq, { kind: 'lord-surrender', village: 'a' }, 'p2');

describe('zajatý vojvoda a vzdání (plán 2026-11-14 – Úloha 5b)', () => {
  it('alarmTaken – zajatí a odvedení tažení z té vsi nejsou doma (Ruling 6)', () => {
    const s = approaching(LORD_HOME);
    s.captives.push(
      { villageId: 'a', personId: 5 },
      { villageId: 'c', personId: 1 },
      { villageId: 'a', personId: 2 },
    );
    expect([...alarmTaken(s, 'a', s.day, world).people].sort()).toEqual([2, 5]);
    expect([...alarmTaken(s, 'c', s.day, world).people]).toEqual([1]);
    expect(alarmTaken(s, 'd', s.day, world).people.size).toBe(0);
  });

  it('bez boje: posel ani útěk s vojvodou v taktu vzdání neprojdou, ves pak neutíká (Ruling 6, 7)', () => {
    const start = approaching(LORD_HOME);
    const at = start.tick + 3;
    const w = worldOf({ ownerA: LORD_HOME });
    const intents = [
      surrender(at),
      intent(at, 2, { kind: 'alarm-messenger', village: 'a', personId: 2 }, 'p2'),
      intent(at, 3, { kind: 'alarm-flee', village: 'a', mode: 'all' }, 'p2'),
      // hráč pak u hry není – nastavení by za ves bez vojvody rozhodlo hned
      presence(at + 5, null),
    ];
    const step = stepCampaign(start, at, intents, w);
    expect(step.waiting).toBeNull();
    expect(step.state).toMatchObject({ phase: 'returning', returnReason: 'yielded' });
    expect(step.state.captives).toEqual([{ villageId: 'a', personId: 2 }]);
    expect(step.state.alarm!.messengers).toEqual([]);
    expect(step.state.alarm!.flights).toEqual([]);
    expect(alarmOf(step, 'a').decided).toBeUndefined();
    expect(of(step.villageEvents, 'a')).toContain('raid-result');
    expect(of(step.villageEvents, 'a')).not.toContain('messenger-out');
    expect(of(step.villageEvents, 'a')).not.toContain('refuge-depart');
    // vzdáním varování vsi skončilo – před odcházejícím vojskem ves neutíká, správce nerozhoduje
    const later = stepCampaign(step.state, at + ABSENT + 20, intents, w);
    expect(later.waiting).toBeNull();
    expect(later.state.alarm!.messengers).toEqual([]);
    expect(later.state.alarm!.flights).toEqual([]);
    expect(alarmOf(later, 'a').decided).toBeUndefined();
    expect(alarmOf(later, 'a').askedTick).toBeUndefined();
    expect(of(later.villageEvents, 'a')).not.toContain('refuge-depart');
  });

  it('v boji: posel s vojvodou v taktu vzdání neprojde, vojvoda je zajatý (Ruling 6, 7)', () => {
    // ves se brání (postoj) – boj trvá; hráč je u hry, takže ves sama nic nevolí
    const a = villageA({ defense: { stance: 'defend' } });
    const w = worldOf({ a, ownerA: LORD_HOME });
    const start = approaching(LORD_HOME);
    const here = Array.from({ length: 9 }, (_, k) => {
      const tick = start.tick + 2 + 300 * k;
      return presence(tick, tick);
    });
    let fight = stepCampaign(start, start.tick + 1800, here, w).state;
    while (fight.battle?.outcome !== 'ongoing') {
      if (fight.tick > start.tick + 2500) throw new Error('boj nezačal');
      const next = stepCampaign(fight, fight.tick + 1, here, w);
      expect(next.waiting).toBeNull();
      fight = next.state;
    }
    expect(fight.alarm!.messengers).toEqual([]);
    const at = fight.tick + 1;
    const out = stepCampaign(
      fight,
      at,
      [
        ...here,
        surrender(at),
        intent(at, 2, { kind: 'alarm-messenger', village: 'a', personId: 2 }, 'p2'),
      ],
      w,
    );
    expect(out.waiting).toBeNull();
    expect(out.state).toMatchObject({ phase: 'returning', returnReason: 'yielded' });
    expect(out.state.battle?.lordYielded).toBe(2);
    expect(out.state.alarm!.messengers).toEqual([]);
    expect(out.state.captives).toEqual([{ villageId: 'a', personId: 2 }]);
    expect(out.state.loot.prisoners?.map((p) => p.ref)).toEqual([{ villageId: 'a', personId: 2 }]);
  });
});

describe('po kouscích taktů (Úloha 5, 5b)', () => {
  /** Po 1 / 7 / 40 taktech přes JSON = vcelku (stav, události vsí, upozornění). */
  function expectChunked(
    start: CampaignState,
    end: number,
    intents: readonly CampaignIntent[],
    setup: Setup,
  ): CampaignStep {
    const whole = stepCampaign(start, end, intents, worldOf(setup));
    expect(whole.waiting).toBeNull();
    for (const chunk of [1, 7, 40]) {
      const events: NewVillageEvent[] = [];
      const notices: CampaignStep['notices'] = [];
      let s = start;
      while (s.tick < end && !campaignFinished(s)) {
        const next = stepCampaign(s, Math.min(end, s.tick + chunk), intents, worldOf(setup));
        expect(next.waiting).toBeNull();
        events.push(...next.villageEvents);
        notices.push(...next.notices);
        s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
      }
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(events).toEqual(whole.villageEvents);
      expect(notices).toEqual(whole.notices);
    }
    return whole;
  }

  it('po 1 / 7 / 40 taktech přes JSON = vcelku', { timeout: 120_000 }, () => {
    // A s vojvodou doma se zeptá, hráč je u hry, pak odejde – vojsko dál míří na A, rozhodne
    // správce (Ruling 9); posel A doběhne do C (vojvoda mimo hradiště) a C varuje doménu
    const start = approaching(LORD_HOME);
    const warnTick = start.tick + 1;
    const intents = [presence(warnTick + 2, warnTick), presence(warnTick + 4, null)];
    const whole = expectChunked(start, start.tick + 1600, intents, {
      ownerA: LORD_HOME,
      ownerC: LORD,
    });
    expect(alarmOf(whole, 'a')).toMatchObject({ decided: 'steward', presenceTick: warnTick });
    expect(whole.state.alarm!.messengers[0]!.departTick).toBe(warnTick + ABSENT + 1);
    expect(alarmOf(whole, 'c').domain).toHaveLength(1);
  });

  it(
    'správce, volba hráče a vzdání – po 1 / 7 / 40 taktech = vcelku (Úloha 5b)',
    { timeout: 120_000 },
    () => {
      // zapnutý správce, hráč u hry zvolí posla a odejde – správce dořeší útěk (Ruling 4, 5)
      const left = approaching(LORD_HOME);
      const t = left.tick + 3;
      const steward = {
        a: villageA({ steward: newSteward(SUMMER - 10, true) }),
        ownerA: LORD_HOME,
      };
      const chose = [presence(t, t), byA(t + 3, { kind: 'alarm-messenger', village: 'a' })];
      // převzetí v taktu t + 3 + ABSENT + 1, pak pár taktů skupiny na cestě
      const whole = expectChunked(left, t + ABSENT + 12, chose, steward);
      expect(alarmOf(whole, 'a')).toMatchObject({ decided: 'steward', flight: 'c1:a1' });
      // vzdání s posly a útěkem v témž taktu, pak hráč pryč (Ruling 6, 7)
      const yielded = approaching(LORD_HOME);
      const at = yielded.tick + 3;
      const intents = [
        surrender(at),
        intent(at, 2, { kind: 'alarm-messenger', village: 'a', personId: 2 }, 'p2'),
        intent(at, 3, { kind: 'alarm-flee', village: 'a', mode: 'all' }, 'p2'),
        presence(at + 5, null),
      ];
      const end = expectChunked(yielded, at + 40, intents, { ownerA: LORD_HOME });
      expect(end.state).toMatchObject({
        returnReason: 'yielded',
        captives: [{ villageId: 'a', personId: 2 }],
      });
      expect(end.state.alarm!.flights).toEqual([]);
    },
  );
});
