import { describe, expect, it } from 'vitest';
import type { NewVillageEvent, VillageEventBody } from '../../village/core/inbox';
import type { VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import { alarmVillage } from '../alarm';
import type { AlarmOwner } from '../alarm-types';
import { campaignFinished, stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignState,
  CampaignStep,
  CampaignWorld,
} from '../campaign-types';
import { MarchGridMemo } from '../march-grid';
import { applyRaidResult, noLoot, type RaidResult } from '../raid-apply';
import {
  campaign,
  flat,
  intent,
  LAUNCH,
  MEADOW,
  member,
  present,
  SET_OUT,
  SUMMER,
  world,
} from './campaign-fixtures';

// Vzdání vojvody (war.md – Hráč ve vsi a mimo ni: „Když se hráč vzdá, vítěz ho zajme, odvede a pak
// dojde k jednání“, Martin 14. 11. 2026; plán 2026-11-14 – Úloha 7, Rozhodnutí plánu 5): záměr
// obránce `lord-surrender` jde jen pro cíl tažení, dokud nájezd není rozhodnutý (`raidDay`), se
// skupinou na mapě cíle a s vojvodou doma. Vojvoda je vždy zajat, nájezd končí (`'yielded'`)
// a vojsko odnese jen to, co už vzalo. Kněžice hráče p2 (políčko 1, 0): vojvoda je muž rodu 1,
// dům u západního okraje mapy, ves se brání; vojsko hráče p1 vyjde z Lhoty na mapě (0, 0).

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const KNEZICE = { x: 1, y: 0 };
/** Kněžice hráče p2 s vojvodou (muž rodu 1) v sídelní vsi. */
const OWNER: AlarmOwner = { playerId: 'p2', npc: false, houseId: 'h2', lordId: 1 };
const LORD_REF = { villageId: 'knezice', personId: 1 };

function knezice(lordAway = false): VillageState {
  const people = [
    kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
    kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
    kin({ id: 3, age: 5, sex: 'male', mother: 2, father: 1 }, SUMMER),
    kin({ id: 4, age: 26, sex: 'male' }, SUMMER),
    kin({ id: 5, age: 40, sex: 'male' }, SUMMER),
  ];
  people[0]!.line = true;
  people[3]!.line = true;
  people[4]!.noble = { houseId: 'npc-rod' };
  // vojvoda na výjezdu (lord-control.md) – ves je bez hráče
  if (lordAway) people[0]!.away = { kind: 'journey' };
  const v = village(people, undefined, {
    lastDay: SUMMER,
    storesKg: 1000,
    defense: { stance: 'defend' },
  });
  v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
  return v;
}

function worldOf(state: VillageState = knezice(), owner: AlarmOwner = OWNER): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => (cell.x === KNEZICE.x && cell.y === KNEZICE.y ? TARGET : MEADOW),
    villageAt: (id) => (id === 'knezice' ? state : null),
    alarmOf: (id) => (id === 'knezice' ? owner : { playerId: null, npc: true, houseId: `h-${id}` }),
    grids: new MarchGridMemo(),
  };
}

/** Obránce `personId` v boji padl. */
const killed =
  (personId: number) =>
  (s: CampaignState): boolean =>
    s.battle?.fighters.some((f) => f.side === 'defend' && f.ref === personId && f.killed) === true;

const BASE = {
  assembly: { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
  target: { villageId: 'knezice', name: 'Kněžice', cell: KNEZICE, pos: { x: -880, z: 30 } },
  ambush: true,
  // přesila: osm útočníků proti třem mužům
  members: [member(1, 0, true), ...[2, 11, 12, 13, 14, 15, 16].map((id) => member(id, 1, false))],
};
const END = LAUNCH + 3000;

/** Záměr obránce „vzdát vojvodu“ hráče `by` (vlastník Kněžic p2). */
const surrender = (tick: number, seq = 1, village = 'knezice', by = 'p2'): CampaignIntent =>
  intent(tick, seq, { kind: 'lord-surrender', village }, by);

const bodies = (
  events: readonly NewVillageEvent[],
  villageId: string,
  kind: VillageEventBody['kind'],
): VillageEventBody[] =>
  events.filter((e) => e.villageId === villageId && e.body.kind === kind).map((e) => e.body);

/** Jediný výsledek nájezdu pro Kněžice v kroku. */
function raidOf(step: CampaignStep): RaidResult {
  const raids = bodies(step.villageEvents, 'knezice', 'raid-result');
  expect(raids).toHaveLength(1);
  const [raid] = raids;
  if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
  return raid.result;
}

/** Krokuje po taktu, dokud stav na konci taktu nesplní `until`; vrací ten stav. */
function stepUntil(
  start: CampaignState,
  intents: readonly CampaignIntent[],
  w: CampaignWorld,
  until: (s: CampaignState) => boolean,
): CampaignState {
  let s = start;
  while (s.tick < END) {
    const step = stepCampaign(s, s.tick + 1, intents, w);
    expect(step.waiting).toBeNull();
    s = step.state;
    if (until(s)) return s;
  }
  throw new Error('stav nenastal');
}

const fighting = (s: CampaignState): boolean => s.battle?.outcome === 'ongoing';

/**
 * Vojsko pochoduje po mapě cíle od východního okraje (x = 900) k Lhotě vzdálenému domu Kněžic
 * (1,7 km – boj tak brzy nezačne); `target` jiný než Kněžice = Kněžice jen míjí.
 */
function marching(target: typeof BASE.target = BASE.target, cell = KNEZICE): CampaignState {
  // jídla dost i na cestu zpět (NPC velitel jinak obrátí – `'supplies'`)
  const s = campaign({ ...BASE, target, liveCommand: false, foodKg: 400 });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...cell };
    g.pos = { x: 900, z: 0 };
    g.goal = { cell: { ...target.cell }, pos: { ...target.pos } };
    g.route = sameCell(cell, target.cell) ? [] : [{ ...target.cell }];
    g.arrived = false;
  }
  return s;
}

const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  a.x === b.x && a.y === b.y;

/** Kněžice o vojsku vědí (`warnTick` = takt stavu) – vojvoda, nebo posel, když vojsko na mapě není. */
function warned(s: CampaignState): CampaignState {
  s.alarm = {
    villages: [
      {
        villageId: 'knezice',
        owner: { ...OWNER },
        seenTick: s.tick,
        seenAt: { cell: { ...KNEZICE }, pos: { x: 900, z: 0 } },
        warnTick: s.tick,
        by: 'lord',
      },
    ],
    messengers: [],
    flights: [],
    nextRef: 0,
  };
  return s;
}

/** Záměr se zahodí: žádný výsledek nájezdu, zajatec ani obrat. */
function expectRefused(start: CampaignState, w: CampaignWorld, i: CampaignIntent): void {
  const out = stepCampaign(start, i.tick, [i], w);
  expect(out.waiting).toBeNull();
  expect(bodies(out.villageEvents, 'knezice', 'raid-result')).toEqual([]);
  expect(out.state.returnReason).toBe(start.returnReason);
  expect(out.state.raidDay).toBe(start.raidDay);
  expect(out.state.captives).toEqual(start.captives);
  expect(out.state.battle?.yielded).toBeUndefined();
}

describe('vzdání vojvody v tažení', () => {
  it('boj běží – v taktu záměru návrat yielded, vojvoda zajat', () => {
    const w = worldOf();
    const fight = stepUntil(campaign({ ...BASE, liveCommand: false }), SET_OUT, w, fighting);
    const at = fight.tick + 1;
    const out = stepCampaign(fight, at, [...SET_OUT, surrender(at)], w);
    expect(out.waiting).toBeNull();
    expect(out.state).toMatchObject({ phase: 'returning', returnReason: 'yielded' });
    expect(out.state.raidDay).toBe(out.state.day);
    expect(out.state.battle).toMatchObject({ yielded: 1, outcome: 'withdrawn' });
    const raid = raidOf(out);
    expect(raid.captured).toEqual([1]);
    expect(raid.captorVillageId).toBe('lhota');
    // z vsi nic – žádná kořist ani odvedení
    expect(raid.led).toEqual([]);
    expect(raid.loot).toEqual(noLoot());
    expect(raid.pitsFound).toEqual([]);
    expect(out.state.loot.prisoners?.map((p) => p.ref)).toEqual([LORD_REF]);
    expect(out.state.loot.people).toBeUndefined();
    expect(out.state.captives).toEqual([LORD_REF]);
    // vojsko jde domů a ves už nedrancuje – zajatý vojvoda přijde do Lhoty
    const end = stepCampaign(out.state, END, [], w);
    expect(end.state.phase).toBe('done');
    expect(bodies(end.villageEvents, 'knezice', 'raid-result')).toEqual([]);
    const [ret] = bodies(end.villageEvents, 'lhota', 'campaign-return');
    if (ret?.kind !== 'campaign-return') throw new Error('chybí návrat');
    expect(ret.result.prisoners?.map((p) => p.ref)).toEqual([LORD_REF]);
    expect(ret.result.people).toBeUndefined();
    expect(end.notices).toContainEqual(
      expect.objectContaining({
        kind: 'campaign-returned',
        payload: expect.objectContaining({ reason: 'yielded' }),
      }),
    );
  });

  it('útočník zvolil kill – vojvoda přesto zajat', () => {
    const w = worldOf();
    const start = campaign({ ...BASE, liveCommand: true });
    start.surrendered = 'kill';
    const live = [...SET_OUT, ...present(LAUNCH + 100, END)];
    const fight = stepUntil(start, live, w, fighting);
    const at = fight.tick + 1;
    const out = stepCampaign(fight, at, [...live, surrender(at)], w);
    expect(out.state.returnReason).toBe('yielded');
    const raid = raidOf(out);
    expect(raid.captured).toEqual([1]);
    expect(raid.fallen).not.toContain(1);
    expect(raid.wounded).not.toContain(1);
    expect(out.state.loot.prisoners?.map((p) => p.ref)).toEqual([LORD_REF]);
  });

  it('vojsko na mapě cíle ještě pochoduje – zajetí bez boje', () => {
    const w = worldOf();
    const start = marching();
    // vojvoda doma vidí vojsko, jakmile stojí na mapě vsi (Úloha 4)
    const seen = stepCampaign(start, start.tick + 1, [], w);
    expect(alarmVillage(seen.state, 'knezice')).toMatchObject({ by: 'lord' });
    expect(seen.state.phase).toBe('marching');
    const at = seen.state.tick + 1;
    const out = stepCampaign(seen.state, at, [surrender(at)], w);
    expect(out.waiting).toBeNull();
    expect(out.state).toMatchObject({ phase: 'returning', returnReason: 'yielded' });
    expect(out.state.raidDay).toBe(out.state.day);
    expect(out.state.battle).toBeUndefined();
    const raid = raidOf(out);
    expect(raid).toMatchObject({
      captured: [1],
      captorVillageId: 'lhota',
      fallen: [],
      wounded: [],
      led: [],
      pitsFound: [],
    });
    expect(raid.loot).toEqual(noLoot());
    expect(out.state.loot.prisoners).toEqual([
      expect.objectContaining({ id: 'c1:1', ref: LORD_REF, sinceDay: out.state.day + 1 }),
    ]);
    expect(out.state.captives).toEqual([LORD_REF]);
    // ve vsi dnešní cesta zajetí: vojvoda pryč v zajetí, ves řídí formální správce, nic nezmizí
    const home = knezice();
    home.dynasty = { lordId: 1 } as VillageState['dynasty'];
    applyRaidResult(home, out.state.day + 1, raid);
    expect(home.people.find((p) => p.id === 1)?.away).toMatchObject({
      kind: 'captive',
      hostVillageId: 'lhota',
    });
    expect(home.steward).toMatchObject({ on: true, byCaptivity: true });
    expect(home.people).toHaveLength(5);
    expect(home.storesKg).toBe(1000);
    // domů bez boje – další výsledek nájezdu nepřijde
    const end = stepCampaign(out.state, END, [], w);
    expect(end.state.phase).toBe('done');
    expect(end.state.battle).toBeUndefined();
    expect(bodies(end.villageEvents, 'knezice', 'raid-result')).toEqual([]);
    const [ret] = bodies(end.villageEvents, 'lhota', 'campaign-return');
    if (ret?.kind !== 'campaign-return') throw new Error('chybí návrat');
    expect(ret.result.prisoners?.map((p) => p.ref)).toEqual([LORD_REF]);
  });

  it('odmítne: vojvoda pryč, cizí hráč, ves není cíl, nájezd rozhodnut, vojsko mimo mapu cíle', () => {
    const w = worldOf();
    // vojvoda na výjezdu
    const away = warned(marching());
    expectRefused(away, worldOf(knezice(true)), surrender(away.tick + 1));
    // záměr od jiného hráče než vlastníka vsi
    const onMap = warned(marching());
    expectRefused(onMap, w, surrender(onMap.tick + 1, 1, 'knezice', 'p3'));
    // Kněžice nejsou cíl – vojsko táhne na Hradec na téže mapě
    const hradec = { villageId: 'hradec', name: 'Hradec', cell: KNEZICE, pos: { x: 0, z: 0 } };
    const passing = warned(marching(hradec));
    expectRefused(passing, w, surrender(passing.tick + 1));
    // nájezd rozhodnut – boj skončil, vojsko ještě stojí na mapě cíle
    const decided = stepUntil(
      campaign({ ...BASE, liveCommand: false }),
      SET_OUT,
      w,
      (s) => s.raidDay !== undefined,
    );
    expect(decided.groups.some((g) => sameCell(g.cell, KNEZICE))).toBe(true);
    expectRefused(decided, w, surrender(decided.tick + 1));
    // vojvoda v boji padl – ve stavu vsi je až do výsledku nájezdu, vzdát se už nemůže
    const dead = stepUntil(campaign({ ...BASE, liveCommand: false }), SET_OUT, w, killed(1));
    const after = stepCampaign(dead, dead.tick + 1, [surrender(dead.tick + 1)], w);
    expect(after.state.battle?.yielded).toBeUndefined();
    expect(after.state.returnReason).not.toBe('yielded');
    // vojsko ještě na mapě shromaždiště – Kněžice varoval posel
    const far = warned(marching(BASE.target, BASE.assembly.cell));
    expectRefused(far, w, surrender(far.tick + 1));
  });

  it('dva záměry v jednom taktu – platí první (i v taktu, kdy boj skončí)', () => {
    const w = worldOf();
    // bez boje: jediný výsledek nájezdu a jediný zajatec
    const seen = stepCampaign(marching(), marching().tick + 1, [], w).state;
    const at = seen.tick + 1;
    const out = stepCampaign(seen, at, [surrender(at, 1), surrender(at, 2)], w);
    expect(raidOf(out).captured).toEqual([1]);
    expect(out.state.captives).toEqual([LORD_REF]);
    expect(out.state.loot.prisoners).toHaveLength(1);
    // v boji: vzdání v taktu, ve kterém by boj skončil, předběhne výsledek boje; muž rodu 1 do
    // konce boje padne, vojvodou je proto muž rodu 4 – raněný, ale živý
    const w4 = worldOf(knezice(), { ...OWNER, lordId: 4 });
    const start = campaign({ ...BASE, liveCommand: false });
    const over = stepUntil(start, SET_OUT, w4, (s) => s.raidDay !== undefined);
    const fight = stepCampaign(start, over.tick - 1, SET_OUT, w4).state;
    expect(fight.battle?.outcome).toBe('ongoing');
    expect(fight.battle?.fighters.find((f) => f.side === 'defend' && f.ref === 4)).toMatchObject({
      state: 'down',
      killed: false,
    });
    const last = stepCampaign(
      fight,
      over.tick,
      [...SET_OUT, surrender(over.tick, 1), surrender(over.tick, 2)],
      w4,
    );
    expect(last.state.returnReason).toBe('yielded');
    const raid = raidOf(last);
    // raněný vojvoda je zajatý, ne raněný doma
    expect(raid.captured).toEqual([4]);
    expect(raid.wounded).not.toContain(4);
    expect(raid.led).toEqual([]);
    expect(raid.loot).toEqual(noLoot());
    expect(last.state.captives).toEqual([{ villageId: 'knezice', personId: 4 }]);
    expect(last.state.loot.prisoners).toHaveLength(1);
  });

  it('po 1 / 7 / 40 taktech přes JSON = vcelku', { timeout: 120_000 }, () => {
    const probe = stepUntil(
      campaign({ ...BASE, liveCommand: false }),
      SET_OUT,
      worldOf(),
      fighting,
    );
    const scenarios: [CampaignState, CampaignIntent[]][] = [
      // v boji
      [campaign({ ...BASE, liveCommand: false }), [...SET_OUT, surrender(probe.tick + 1)]],
      // bez boje – vojsko na mapě cíle pochoduje
      [marching(), [surrender(marching().tick + 2)]],
    ];
    for (const [start, intents] of scenarios) {
      const whole = stepCampaign(start, END, intents, worldOf());
      expect(whole.waiting).toBeNull();
      expect(whole.state).toMatchObject({ phase: 'done', returnReason: 'yielded' });
      const last = whole.state.tick;
      for (const chunk of [1, 7, 40]) {
        const events: NewVillageEvent[] = [];
        const notices: CampaignStep['notices'] = [];
        let s = start;
        while (s.tick < last && !campaignFinished(s)) {
          const next = stepCampaign(s, Math.min(last, s.tick + chunk), intents, worldOf());
          expect(next.waiting).toBeNull();
          events.push(...next.villageEvents);
          notices.push(...next.notices);
          s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
        }
        expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
        expect(events).toEqual(whole.villageEvents);
        expect(notices).toEqual(whole.notices);
      }
    }
  });
});
