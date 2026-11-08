import { describe, expect, it } from 'vitest';
import { village, kin } from '../../village/__tests__/kin-fixtures';
import type { Dwelling } from '../../village/types';
import { hitDamage, type BattleState } from '../battle';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignWorld } from '../campaign-types';
import { WAR } from '../rules-war';
import { campaign, flat, MEADOW, member, SUMMER, world } from './campaign-fixtures';
import { attacker, battle, defender, field, fighter, palisade, run } from './battle-fixtures';

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
  function breachHours(gate: boolean): { hours: number; b: BattleState } {
    const f = field([palisade(gate)]);
    const b = battle({
      attackers: Array.from({ length: 4 }, (_, i) => attacker(i, { x: 0, z: -100 })),
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
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

  it('palisáda mimo bránu se 4 muži ≈ 1 den', () => {
    const { hours, b } = breachHours(false);
    expect(b.breaches.map((x) => x.spot)).toEqual(['wall']);
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
  });

  // násobek zrušen 8. 11. 2026 (dřív „násobek 3 – šíp ubere třetinu“): šíp ubere plný poloviční
  // zásah; nový los střelby – mistr luku (dovednost 100), ať na 45 m trefuje dost často
  it('obránce za palisádou dostane plný poloviční zásah šípem', () => {
    const fort = palisade(false);
    const f = field([fort]);
    const inside = { x: 0, z: -25 };
    const out = { x: 0, z: -70 };
    const b = battle({
      attackers: [attacker(0, out, { line: true, strength: 2, bowSkill: 100 })],
      defenders: [defender(1, inside, { atHouseOnly: true, strength: 0.1 })],
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
      let s = start;
      while (s.tick < end) {
        const next = stepCampaign(s, Math.min(end, s.tick + chunk), [], battleWorld);
        expect(next.waiting).toBeNull();
        s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
      }
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
