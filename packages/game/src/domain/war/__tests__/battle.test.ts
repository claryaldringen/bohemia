import { describe, expect, it } from 'vitest';
import { SURFACE_CODES, packObstacles } from '../../landscape';
import { village, kin } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, Road } from '../../village/types';
import { hitDamage, type BattleField, type BattleState } from '../battle';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignWorld, GroupAssault } from '../campaign-types';
import {
  MARCH_FOREST,
  MARCH_ROAD,
  MarchGridMemo,
  marchCellAt,
  marchCellCenter,
  marchGrid,
} from '../march-grid';
import { nearestForestDoor } from '../forest-doors';
import { WAR } from '../rules-war';
import { campaign, flat, MEADOW, member, stepInChunks, SUMMER, world } from './campaign-fixtures';
import {
  attacker,
  battle,
  defender,
  field,
  fighter,
  fortOf,
  palisade,
  run,
} from './battle-fixtures';

// Boj muž po muži (war.md – Boj, Ztráty; fortifications.md – Obrana, Prolomení).

/** Úbytky zdraví muže po taktech (zásahy). */
function hitsOn(
  b: BattleState,
  id: string,
): { hits: number[]; ticks: number[]; track: (t: number) => void } {
  const out = { hits: [] as number[], ticks: [] as number[], last: fighter(b, id).health };
  return {
    hits: out.hits,
    ticks: out.ticks,
    track: (t) => {
      const h = fighter(b, id).health;
      if (h < out.last) {
        out.hits.push(out.last - h);
        out.ticks.push(t);
      }
      out.last = h;
    },
  };
}

describe('souboj mužů (war.md – Boj – Souboj mužů)', () => {
  it('příklad: muž rodu se silou 2 srazí vesničana 0,4 pěti ranami, vesničan jeho pětadvaceti', () => {
    // násobek zrušen 8. 11. 2026 – `hitDamage` už nebere násobek (dřív 1), čísla stejná
    expect(Math.ceil(WAR.combat.health / hitDamage(2, false))).toBe(5);
    expect(Math.ceil(WAR.combat.health / hitDamage(0.4, false))).toBe(25);
    expect(hitDamage(2, true)).toBe(10);
  });

  // násobek zrušen 8. 11. 2026 (Martin „a“ – i u domu): obránce u domu dostane plný zásah – pět ran
  // místo osmi (dřív 20 ÷ 1,5)
  it('v boji: zblízka po 2 s, obránce u domu plný zásah, los, zda rána padne', () => {
    const f = field();
    const b = battle({
      attackers: [attacker(0, { x: 2, z: 0 }, { line: true, strength: 2 })],
      defenders: [defender(1, { x: 0, z: 0 })],
    });
    const onDefender = hitsOn(b, 'd:1');
    const onAttacker = hitsOn(b, 'a:0');
    run(b, f, 2000, (t) => {
      onDefender.track(t);
      onAttacker.track(t);
    });
    expect(b.outcome).toBe('attackers');
    expect(fighter(b, 'd:1').state).toBe('down');
    // u domu plný zásah 20 – pět ran
    for (const h of onDefender.hits) expect(h).toBeCloseTo(20, 6);
    expect(onDefender.hits).toHaveLength(5);
    for (const h of onAttacker.hits) expect(h).toBeCloseTo(4, 6);
    // rány jen v taktu po 8 (2 s), část jich nepadne
    for (let i = 1; i < onDefender.ticks.length; i++) {
      expect((onDefender.ticks[i]! - onDefender.ticks[0]!) % 8).toBe(0);
    }
    expect(onDefender.ticks.at(-1)! - onDefender.ticks[0]!).toBeGreaterThan(4 * 8);
  });
});

describe('bod zlomu podle počtu (war.md – Boj – Bod zlomu)', () => {
  it('skupina tažení uteče při 30 % padlých a raněných, velitel sám ne', () => {
    const f = field();
    const at = { x: 0, z: 0 };
    const b = battle({
      attackers: Array.from({ length: 10 }, (_, i) => attacker(i, at)),
      defenders: [defender(1, { x: 900, z: 0 })],
      orders: { 0: 'hold-place' },
      commander: 0,
    });
    b.fighters[1]!.state = 'down';
    b.fighters[2]!.state = 'down';
    run(b, f, 1);
    expect(b.groups[0]!.broken).toBe(false);
    b.fighters[3]!.state = 'down';
    run(b, f, 1);
    expect(b.groups[0]!.broken).toBe(true);
    expect(fighter(b, 'a:0').state).toBe('fight');
    for (const m of b.fighters.slice(4, 10)) expect(['flee', 'fled']).toContain(m.state);
  });

  it('obránci utečou při 45 %', () => {
    const f = field();
    const b = battle({
      attackers: [attacker(0, { x: -900, z: 0 })],
      defenders: Array.from({ length: 20 }, (_, i) => defender(i + 1, { x: 0, z: 0 })),
      orders: { 0: 'hold-place' },
    });
    const men = b.fighters.filter((x) => x.side === 'defend');
    for (const m of men.slice(0, 8)) m.state = 'down';
    run(b, f, 1);
    expect(b.groups.find((g) => g.side === 'defend')!.broken).toBe(false);
    men[8]!.state = 'down';
    run(b, f, 1);
    expect(b.groups.find((g) => g.side === 'defend')!.broken).toBe(true);
    // bez lesa se obránci hned schovají
    for (const m of men.slice(9)) expect(m.state).toBe('fled');
  });
});

describe('útěk obránců do hustého lesa (Rozhodnutí 10)', () => {
  it('obránce na útěku skončí „fled“ do 2 m od dveří lesa a nikdy v neprůchodné buňce', () => {
    const f = field([], (tx) => tx >= 85);
    const door = nearestForestDoor(f.grid, { x: 0, z: 0 })!;
    const b = battle({
      attackers: [attacker(0, { x: -900, z: 0 })],
      defenders: Array.from({ length: 20 }, (_, i) => defender(i + 1, { x: 0, z: 0 })),
      orders: { 0: 'hold-place' },
    });
    const men = b.fighters.filter((x) => x.side === 'defend');
    for (const m of men.slice(0, 9)) m.state = 'down';
    run(b, f, 3000, () => {
      for (const m of men.slice(9)) {
        if (m.state === 'flee') expect(f.grid.pace[marchCellAt(f.grid, m.pos)]!).toBeGreaterThan(0);
      }
    });
    for (const m of men.slice(9)) {
      expect(m.state).toBe('fled');
      expect(Math.hypot(m.pos.x - door.x, m.pos.z - door.z)).toBeLessThan(2);
    }
  });
});

describe('pohyb v boji podél hustého lesa (plán 2026-11-16-dense-forest – Úloha 5)', () => {
  it('útočníci z ramene průseku do L dojdou k domu na konci druhého ramene', () => {
    // hustý les všude kromě průseků dvou cest v pravém úhlu (8 m široké): rameno od západu
    // (z = 0, x −200…0) a rameno k severu (x = 0, z 0…200); dům na severním konci
    const base = field();
    const pace = Float32Array.from(base.grid.pace);
    const flags = Uint16Array.from(base.grid.flags);
    for (let c = 0; c < pace.length; c++) {
      const p = marchCellCenter(base.grid, c);
      const west = Math.abs(p.z) <= 4 && p.x >= -200 && p.x <= 4;
      const north = Math.abs(p.x) <= 4 && p.z >= -4 && p.z <= 200;
      flags[c] = flags[c]! | MARCH_FOREST | (west || north ? MARCH_ROAD : 0);
      pace[c] = west || north ? 1.5 : 0;
    }
    const f: BattleField = { ...base, grid: { ...base.grid, pace, flags } };
    const house = { x: 0, z: 190 };
    const b = battle({
      attackers: [0, 1, 2].map((k) => attacker(k, { x: -190 + 2 * k, z: 0 })),
      defenders: [defender(1, house, { atHouseOnly: true })],
    });
    let nearest = Infinity;
    run(b, f, 1200, () => {
      for (const x of b.fighters) {
        if (x.side !== 'attack') continue;
        expect(f.grid.pace[marchCellAt(f.grid, x.pos)]!).toBeGreaterThan(0);
        nearest = Math.min(nearest, Math.hypot(x.pos.x - house.x, x.pos.z - house.z));
      }
    });
    expect(nearest).toBeLessThanOrEqual(WAR.combat.meleeM);
  });
});

describe('poslední muž rodu doma (war.md – Ztráty)', () => {
  it('neklesne pod 10 zdraví a uteče do lesa i pod řízením hráče', () => {
    const f = field([], (tx) => tx < 50);
    const b = battle({
      attackers: Array.from({ length: 6 }, (_, i) =>
        attacker(i, { x: 6, z: 0 }, { line: true, strength: 3 }),
      ),
      defenders: [
        defender(1, { x: 0, z: 0 }, { line: true, bow: true, strength: 1, lastLine: true }),
      ],
    });
    const lord = fighter(b, 'd:1');
    lord.controlled = true;
    lord.chosen = 'a:0';
    let lowest = 100;
    run(b, f, 4000, () => {
      lowest = Math.min(lowest, lord.health);
      expect(lord.state).not.toBe('down');
    });
    expect(lowest).toBe(WAR.lastLineManMinHealth);
    expect(lord.state).toBe('fled');
    expect(lord.pos.x).toBeLessThan(-200);
    expect(b.outcome).toBe('attackers');
  });
});

describe('útok na palisádu (fortifications.md – Obrana, Prolomení)', () => {
  /** Herní hodiny práce na průlomu – od první práce do průlomu. */
  function breachHours(gate: boolean, assault?: GroupAssault): { hours: number; b: BattleState } {
    const f = field([palisade(gate)]);
    const b = battle({
      attackers: Array.from({ length: 4 }, (_, i) => attacker(i, { x: 0, z: -100 })),
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    if (assault) b.groups[0]!.assault = assault;
    let first = -1;
    let done = -1;
    run(b, f, 3000, (t) => {
      const br = b.breaches[0];
      if (br && br.progress.done > 0 && first < 0) first = t;
      if (br?.progress.breached && done < 0) done = t;
    });
    expect(done).toBeGreaterThan(0);
    return { hours: (done - first + 1) * f.hoursPerTick, b };
  }

  it('brána se 4 muži ≈ 3 herní hodiny – brána se před nimi zavře', () => {
    const { hours, b } = breachHours(true);
    expect(b.closedGates).toHaveLength(1);
    expect(b.breaches.map((x) => x.spot)).toEqual(['gate']);
    expect(hours).toBeGreaterThan(2.9);
    expect(hours).toBeLessThan(3.1);
    expect(b.outcome).toBe('attackers');
  });

  // plán hradeb Úloha 14: bez lesa je nejrychlejší odkopat (20 h) – test si sekání vynutí rozkazem
  it('palisáda mimo bránu se 4 muži ≈ 1 den', () => {
    const { hours, b } = breachHours(false, 'cut');
    expect(b.breaches.map((x) => x.spot)).toEqual(['wall']);
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
  });

  // plán hradeb Úloha 12 (fortifications.md – Obrana bez násobku 2): přes palisádu bez ochozu šíp
  // nejde – za kůly není vidět (dřív test „obránce za palisádou dostane plný poloviční zásah“)
  it('obránce za palisádou bez ochozu šípem zasáhnout nejde', () => {
    const f = field([palisade(false)]);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -70 }, { line: true, strength: 2, bowSkill: 100 })],
      defenders: [defender(1, { x: 0, z: -25 }, { atHouseOnly: true, strength: 0.1 })],
      orders: { 0: 'hold-place' },
    });
    const hits = hitsOn(b, 'd:1');
    run(b, f, 400, hits.track);
    expect(hits.hits).toEqual([]);
  });

  // násobek zrušen 8. 11. 2026 (dřív „násobek 3 – šíp ubere třetinu“): šíp ubere plný poloviční
  // zásah; obránce na ochozu kryje předprseň (0,25 m²) – mistr luku (dovednost 100) na 41 m
  it('obránce na ochozu dostane plný poloviční zásah šípem', () => {
    const f = field([fortOf('walkway')]);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -70 }, { line: true, strength: 2, bowSkill: 100 })],
      defenders: [
        defender(1, { x: 0, z: -29 }, { atHouseOnly: true, strength: 0.1, onWall: true }),
      ],
      orders: { 0: 'hold-place' },
    });
    const hits = hitsOn(b, 'd:1');
    run(b, f, 400, hits.track);
    expect(hits.hits.length).toBeGreaterThan(0);
    for (const h of hits.hits) expect(h).toBeCloseTo(hitDamage(2, true), 6);
  });
});

describe('střelba podle dovednosti (fortifications.md – Střelba a viditelná plocha)', () => {
  it('šíp do hloučku smí trefit vlastního (Review Focus 5)', () => {
    // mistr luku na 40 m: kruh 0,67 m – v něm obránce a útočníkův vlastní muž, který s ním bojuje
    const f = field();
    const b = battle({
      attackers: [
        attacker(0, { x: 0, z: -40 }, { line: true, strength: 2, bowSkill: 100 }),
        attacker(1, { x: 0.4, z: 0 }, { group: 1 }),
      ],
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.01 })],
      orders: { 0: 'hold-place', 1: 'hold-place' },
    });
    const own = hitsOn(b, 'a:1');
    const foe = hitsOn(b, 'd:1');
    run(b, f, 400, (t) => {
      own.track(t);
      foe.track(t);
    });
    const arrow = hitDamage(2, true);
    // šíp (10) trefil vlastního i obránce; zblízka obránce ubírá jen 0,1
    expect(own.hits.some((h) => h >= arrow - 1e-6)).toBe(true);
    expect(foe.hits.some((h) => h >= arrow - 1e-6)).toBe(true);
  });

  it('nováček trefí na 60 m zřídka, mistr často', () => {
    const shots = (skill: number): number => {
      const f = field();
      const b = battle({
        attackers: [attacker(0, { x: 0, z: -60 }, { line: true, strength: 2, bowSkill: skill })],
        defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.01 })],
        orders: { 0: 'hold-place' },
      });
      const hits = hitsOn(b, 'd:1');
      run(b, f, 16 * 40, hits.track);
      return hits.hits.length;
    };
    // 40 výstřelů: nováček (šance 0,85 ÷ 16 π ≈ 1,7 %) skoro nic, mistr (≈ 27 %) kolem deseti
    expect(shots(0)).toBeLessThan(4);
    expect(shots(100)).toBeGreaterThan(5);
  });
});

describe('boj v tažení (war.md – Pro implementaci – determinismus)', () => {
  const TARGET = { x: 1, y: 0 };
  const house = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: 0,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  const knezice = village(
    [
      kin({ id: 1, age: 30, sex: 'male', home: 1 }, SUMMER),
      kin({ id: 2, age: 25, sex: 'male', home: 1 }, SUMMER),
      kin({ id: 3, age: 28, sex: 'female', home: 2 }, SUMMER),
      kin({ id: 4, age: 20, sex: 'male', home: 2 }, SUMMER),
    ],
    [house(1, -860, 30), house(2, -850, 55)],
    // boj za zeleným stolem – bránit se (výchozí útěk by vesnici vyklidil)
    { lastDay: SUMMER, defense: { stance: 'defend' } },
  );
  const targetMap: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
  const battleWorld: CampaignWorld = {
    clock: world,
    landscapeOf: (c) => (c.x === TARGET.x && c.y === TARGET.y ? targetMap : MEADOW),
    villageAt: (id) => (id === 'knezice' ? knezice : null),
    // mřížky napříč voláními jako worker – kroky po kouscích by jemnou mřížku stavěly znovu
    grids: new MarchGridMemo(),
  };

  /** Tažení stojí u cíle a začíná nájezd. */
  function raiding(): CampaignState {
    const s = campaign({
      liveCommand: false,
      members: [
        member(1, 0, true),
        member(2, 1, false),
        member(3, 1, false),
        member(4, 1, false),
        member(5, 1, false),
        member(6, 1, false),
      ],
    });
    s.phase = 'raiding';
    for (const g of s.groups) {
      g.cell = { ...TARGET };
      g.pos = { ...s.target.pos };
      g.arrived = true;
    }
    return s;
  }

  it('stejný výsledek po kouscích taktů (1 / 7 / 40) i přes JSON', () => {
    const start = raiding();
    const end = start.tick + 240;
    const whole = stepCampaign(start, end, [], battleWorld).state;
    expect(whole.battle?.ticks).toBeGreaterThan(0);
    expect(whole.battle!.fighters.some((x) => x.health < 100)).toBe(true);
    for (const chunk of [1, 7, 40]) {
      const { state: s } = stepInChunks(start, end, { chunk, world: battleWorld });
      expect(s).toEqual(whole);
    }
  });

  it('přítomný hráč dostane upozornění „Cizí vojsko u …“ jednou, při příchodu k vsi', () => {
    const watched: CampaignWorld = {
      ...battleWorld,
      watcherOf: (id) => (id === 'knezice' ? { playerId: 'p-domaci', name: 'Kněžice' } : null),
    };
    const start = raiding();
    const step = stepCampaign(start, start.tick + 20, [], watched);
    const alerts = step.notices.filter((n) => n.kind === 'foreign-army');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      playerId: 'p-domaci',
      payload: { villageId: 'knezice', name: 'Kněžice' },
    });
  });

  it('neškodné vojsko (vlastní, pána, vazalů) nebojuje a vrací se bez upozornění', () => {
    const friendly: CampaignWorld = {
      ...battleWorld,
      harmless: () => true,
      watcherOf: () => ({ playerId: 'p-domaci', name: 'Kněžice' }),
    };
    const start = raiding();
    const step = stepCampaign(start, start.tick + 20, [], friendly);
    expect(step.state.battle).toBeUndefined();
    expect(step.state.phase).toBe('returning');
    expect(step.notices.filter((n) => n.kind === 'foreign-army')).toEqual([]);
  });

  it('skupina v průseku hustým lesem (5 buněk) se sešikuje do průseku a každý muž se pohne', () => {
    // celá mapa cíle je les; průsek dvou pevných cest 6 m od sebe (z = 30 a 36) – 5 buněk 2,5 m;
    // skupiny stojí na ose v (−930, 30), daleko od pasek vsi, a jdou na dům na cestě (−860, 30)
    const lane = (id: number, z: number): Road => ({
      id,
      points: [
        { x: -958, z },
        { x: -840, z },
      ],
      bornDay: 0,
      grade: 'improved',
      traffic: [],
      spots: [],
    });
    const meadow = flat();
    const forest = {
      ...meadow,
      surface: new Uint8Array(meadow.surface.length).fill(SURFACE_CODES.forest),
    };
    const layer = packObstacles([], forest.size, forest.cellSizeM);
    const home = {
      ...knezice,
      roads: {
        nextId: 3,
        roads: [lane(1, 30), lane(2, 36)],
        trees: [],
        labor: { from: 0, days: 0, shares: [] },
      },
    };
    const forestMap: CampaignMap = { landscape: forest, obstacles: layer, villageIds: ['knezice'] };
    const forestWorld: CampaignWorld = {
      ...battleWorld,
      landscapeOf: (c) => (c.x === TARGET.x && c.y === TARGET.y ? forestMap : MEADOW),
      villageAt: (id) => (id === 'knezice' ? home : null),
      grids: new MarchGridMemo(),
    };
    const grid = marchGrid(forest, layer, home, { day: SUMMER });
    const start = raiding();
    start.members = [
      start.members[0]!,
      ...Array.from({ length: 35 }, (_, k) => ({
        ...start.members[1]!,
        ref: { villageId: 'brod', personId: 100 + k },
      })),
    ];
    for (const x of start.groups) x.pos = { x: -930, z: 30 };
    const g = start.groups.find((x) => x.id === 1)!;
    // šik bez opravy: řady 6 a 7 (z = 40 a 42 m) padnou do hustého lesa
    const raw = Array.from({ length: 35 }, (_, k) => ({
      x: g.pos.x + ((k % 5) - 2) * 2,
      z: g.pos.z + Math.floor(k / 5) * 2,
    }));
    const stuck = raw.filter((p) => grid.pace[marchCellAt(grid, p)] === 0);
    expect(stuck.length).toBeGreaterThanOrEqual(10);
    for (const p of stuck)
      expect(grid.flags[marchCellAt(grid, p)]! & MARCH_FOREST).toBe(MARCH_FOREST);
    const opened = stepCampaign(start, start.tick + 1, [], forestWorld).state;
    const attackers = opened.battle!.fighters.filter((f) => f.side === 'attack');
    expect(attackers).toHaveLength(36);
    for (const f of attackers) expect(grid.pace[marchCellAt(grid, f.pos)]!).toBeGreaterThan(0);
    const later = stepCampaign(opened, opened.tick + 20, [], forestWorld).state;
    for (const f of attackers) {
      const now = later.battle!.fighters.find((x) => x.id === f.id)!;
      expect(Math.hypot(now.pos.x - f.pos.x, now.pos.z - f.pos.z)).toBeGreaterThan(0);
    }
  });

  it('po boji se tažení vrací; padlí a ranění se propíšou do mužů', () => {
    const start = raiding();
    const done = stepCampaign(start, start.tick + 3000, [], battleWorld).state;
    expect(done.battle!.outcome).not.toBe('ongoing');
    expect(['returning', 'done']).toContain(done.phase);
    for (const f of done.battle!.fighters) {
      if (f.side !== 'attack' || f.state !== 'down') continue;
      const m = done.members[f.ref]!;
      expect(f.killed ? m.status === 'fallen' : m.wounded).toBe(true);
    }
  });
});
