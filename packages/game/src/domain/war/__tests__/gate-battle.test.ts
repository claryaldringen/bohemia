import { describe, expect, it } from 'vitest';
import { village } from '../../village/__tests__/kin-fixtures';
import { fortPincerArms, pincerBandInM } from '../../village/fortification';
import type { Fortification } from '../../village/fortification/types';
import { FORTIFICATIONS } from '../../village/rules-fortifications';
import { battleTick, type BattleField, type BattleState } from '../battle';
import { MARCH_WALL, marchCellAt, marchGrid, type Pos } from '../march-grid';
import { dist2 } from '../orders';
import { inSight } from '../sight';
import { tickRandom } from '../ticks';
import {
  battlePincers,
  crownAt,
  pincerPoint,
  towerAt,
  towerPosts,
  towerReach,
  wallPosts,
  type BattlePincer,
} from '../wall-defense';
import {
  DAY,
  attacker,
  battle,
  defender,
  field,
  fighter,
  land,
  palisade,
  run,
} from './battle-fixtures';

// Brány v bitvě – ulička a věž (fortifications.md – Hradby a obrana, Brány; plán hradeb Úloha 19):
// k vratům klešťové brány se vejdou nejvýš 4, obránci na ramenech zasahují útočníky v uličce z obou
// stran, z věže luk do 80 m a dohled 250 m; ramena blokují pochod i při zavřené bráně.

/** Palisáda s klešťovou branou na jihu (hotová ve dni 0), volitelně s věží nad vraty. */
function pincerFort(tower = false): Fortification {
  const fort = palisade(true);
  fort.gates = [{ ...fort.gates[0]!, pincerDay: 0, ...(tower ? { towerDay: 0 } : {}) }];
  return fort;
}

function pincerOf(f: BattleField): BattlePincer {
  const p = battlePincers(f.forts[0]!, DAY)[0];
  if (!p) throw new Error('Klešťová brána chybí');
  return p;
}

/** Bod `m` m ven od bodu `at` (proti směru dovnitř brány). */
function outFrom(p: BattlePincer, at: Pos, m: number): Pos {
  return { x: at.x - p.nx * m, z: at.z - p.nz * m };
}

describe('klešťová brána na bojišti', () => {
  it('ulička od čáry hradby po vrata 12 m za vnitřním okrajem pásu palisády', () => {
    const p = pincerOf(field([pincerFort()]));
    expect(p.endM).toBeCloseTo(FORTIFICATIONS.bandM.palisade + 12, 9);
    expect(p.kind).toBe('walkway');
    expect(p.tower).toBe(false);
    // dovnitř = k severu (brána na jihu, střed opevnění v 0, 0)
    expect(p.nz).toBeCloseTo(1, 9);
  });

  it('k vratům klešťové brány pracuje nejvýš 4 – prolamují vrata na konci uličky', () => {
    const f = field([pincerFort()]);
    const p = pincerOf(f);
    const b = battle({
      attackers: Array.from({ length: 8 }, (_, i) => attacker(i, { x: 0, z: -100 })),
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    b.groups[0]!.assault = 'cut';
    let most = 0;
    run(b, f, 1500, () => {
      const n = b.fighters.filter(
        (x) => x.state === 'breach' && x.breachAt?.endsWith(':gate') === true,
      ).length;
      most = Math.max(most, n);
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(FORTIFICATIONS.pincerGate.maxMen);
    const gate = b.breaches.find((x) => x.spot === 'gate');
    expect(gate).toBeDefined();
    expect(dist2(gate!.at, pincerPoint(p, 0, p.endM - 1))).toBeLessThan(1e-9);
  });

  it('obránci na ramenech zasahují útočníka v uličce z obou stran', () => {
    const f = field([pincerFort()]);
    const p = pincerOf(f);
    const posts = wallPosts(f.forts, 2, DAY);
    expect(posts).toHaveLength(2);
    // po jednom na každém rameni, oba na ochozu
    const along = posts.map((q) => (q.x - p.mx) * p.ux + (q.z - p.mz) * p.uz);
    expect(Math.sign(along[0]!)).toBe(-Math.sign(along[1]!));
    for (const q of posts) expect(crownAt(f.forts, q, DAY)).toBe(true);
    const b = battle({
      attackers: [attacker(0, pincerPoint(p, 0, p.endM - 1))],
      defenders: posts.map((q, i) => defender(i + 1, q, { post: q, onWall: true })),
    });
    b.closedGates.push(`0:${p.segment}`);
    const aimed = new Set<string>();
    run(b, f, 80, () => {
      for (const d of b.fighters) if (d.side === 'defend' && d.aim === 'a:0') aimed.add(d.id);
    });
    expect([...aimed].sort()).toEqual(['d:1', 'd:2']);
    expect(fighter(b, 'a:0').health).toBeLessThan(100);
  });

  it('bez klešťové brány stojí obránci brány po 2 v hradbě, ne na ramenech', () => {
    const f = field([palisade(true)]);
    expect(battlePincers(f.forts[0]!, DAY)).toEqual([]);
    for (const q of wallPosts(f.forts, 2, DAY)) expect(crownAt(f.forts, q, DAY)).toBe(false);
  });
});

describe('věž nad branou v bitvě', () => {
  it('věž obsadí 4 obránci jako první, pak ramena', () => {
    const f = field([pincerFort(true)]);
    const tower = towerPosts(f.forts, DAY);
    expect(tower).toHaveLength(FORTIFICATIONS.tower.defenders);
    const posts = wallPosts(f.forts, 6, DAY);
    expect(posts.slice(0, 4)).toEqual(tower);
    for (const q of tower) {
      expect(towerAt(f.forts, q, DAY)).toBe(true);
      expect(crownAt(f.forts, q, DAY)).toBe(true);
    }
    for (const q of posts.slice(4)) expect(towerAt(f.forts, q, DAY)).toBe(false);
  });

  it('z věže luk na 75 m ano, ze stejného místa bez věže ne', () => {
    const shoot = (tower: boolean): string | null => {
      const f = field([pincerFort(tower)]);
      const p = pincerOf(f);
      const post = towerPosts(field([pincerFort(true)]).forts, DAY)[1]!;
      const b = battle({
        attackers: [attacker(0, outFrom(p, post, 75))],
        defenders: [defender(1, post, { post, onWall: true, bow: true })],
      });
      battleTick(b, f, tickRandom(7, 1, 'battle'));
      return fighter(b, 'd:1').aim;
    };
    expect(shoot(true)).toBe('a:0');
    expect(shoot(false)).toBeNull();
  });

  it('věž vidí útočníka na 200 m, ochoz jen na 150 m', () => {
    const f = field([pincerFort(true)]);
    const p = pincerOf(f);
    const post = towerPosts(f.forts, DAY)[0]!;
    const b = battle({
      attackers: [attacker(0, outFrom(p, post, 200))],
      defenders: [defender(1, post, { post, onWall: true })],
    });
    const reach = towerReach(fighter(b, 'd:1'), f);
    expect(reach).toEqual({ sightM: 250, bowMaxM: 80 });
    const foe = fighter(b, 'a:0').pos;
    expect(inSight(f.grid, post, foe, reach.sightM)).toBe(true);
    expect(inSight(f.grid, post, foe)).toBe(false);
    // útočník u paty věže na věži nestojí; obránce na zemi taky ne
    expect(towerReach(fighter(b, 'a:0'), f).sightM).toBe(150);
    const ground = { ...fighter(b, 'd:1') };
    delete ground.onWall;
    expect(towerReach(ground, f).bowMaxM).toBe(60);
  });
});

describe('ramena klešťové brány jako stěny', () => {
  it('pochod: ramena blokují i při zavřené bráně', () => {
    const landscape = land();
    const grid = (fort: Fortification): Uint16Array => {
      const v = village([], [], { fortifications: [fort], lastDay: DAY });
      const closedGates = new Set([fort.gates[0]!.segment]);
      return marchGrid(landscape, null, v, { day: DAY, closedGates }).flags;
    };
    const f = field([pincerFort()]);
    const p = pincerOf(f);
    const arm = pincerPoint(p, -(2 + FORTIFICATIONS.bandM.walkway / 2), p.endM - 2);
    const g = marchGrid(landscape, null, village([], [], { fortifications: [] }), { day: DAY });
    const cell = marchCellAt(g, arm);
    expect(grid(pincerFort())[cell]! & MARCH_WALL).toBe(MARCH_WALL);
    expect(grid(palisade(true))[cell]! & MARCH_WALL).toBe(0);
  });

  it('prolomený díl s branou ramena nechá, zbořený je vezme', () => {
    const landscape = land();
    const fort = pincerFort();
    const seg = fort.gates[0]!.segment;
    const breached = {
      ...fort,
      segments: fort.segments.map((s) => (s.index === seg ? { ...s, breachedDay: DAY } : s)),
    };
    expect(pincerBandInM(breached, seg)).toBeCloseTo(FORTIFICATIONS.bandM.palisade, 9);
    expect(fortPincerArms(landscape, breached)).toHaveLength(2);
    // v bitvě ramena stojí dál i na prolomeném dílu
    expect(battlePincers(field([breached]).forts[0]!, DAY)).toHaveLength(1);
    const demolished = {
      ...fort,
      segments: fort.segments.map((s) => (s.index === seg ? { ...s, demolishedDay: DAY } : s)),
    };
    expect(pincerBandInM(demolished, seg)).toBeNull();
    expect(battlePincers(field([demolished]).forts[0]!, DAY)).toEqual([]);
  });
});

describe('bitva u klešťové brány s věží po kouscích = vcelku', () => {
  const TICKS = 400;
  const start = (): BattleState => {
    const f = field([pincerFort(true)]);
    const posts = wallPosts(f.forts, 6, DAY);
    return battle({
      attackers: Array.from({ length: 6 }, (_, i) =>
        attacker(i, { x: (i - 2.5) * 3, z: -90 }, { line: i === 0 }),
      ),
      defenders: posts.map((q, i) =>
        defender(i + 1, q, { post: q, onWall: true, bow: i < 4, line: i === 0 }),
      ),
    });
  };
  const play = (size: number): string => {
    const f = field([pincerFort(true)]);
    let b = start();
    b.groups[0]!.assault = 'burn';
    for (let t = 0; t < TICKS; t += size) {
      for (let k = 1; k <= Math.min(size, TICKS - t); k++) {
        battleTick(b, f, tickRandom(7, t + k, 'battle'));
      }
      b = JSON.parse(JSON.stringify(b)) as BattleState;
    }
    return JSON.stringify(b);
  };

  it('1 / 7 / 40 taktů přes JSON = vcelku', () => {
    const whole = play(TICKS);
    expect(play(1)).toBe(whole);
    expect(play(7)).toBe(whole);
    expect(play(40)).toBe(whole);
  });
});
