import { describe, expect, it } from 'vitest';
import { THROW_TICKS, MELEE_TICKS, BOW_TICKS, type SceneBattle, type SceneFighter } from '../army';
import { THROW_FLIGHT_S, arrowAt, strikeTicks, strikesOf } from '../battle-fx';
import { WALKWAY } from '../fortification-layout';

// Hody z ochozu a šípy k zasaženému (fortifications.md – Obrana bez násobku 3; plán hradeb Ú21).

function man(id: string, o: Partial<SceneFighter> = {}): SceneFighter {
  return {
    id,
    side: 'defend',
    group: 0,
    line: false,
    bow: false,
    mounted: false,
    health: 100,
    pos: { x: 0, z: 1 },
    home: { x: 0, z: 20 },
    state: 'fight',
    cooldown: 0,
    aim: null,
    killed: false,
    breachAt: null,
    ...o,
  };
}

function snap(ticks: number, fighters: SceneFighter[]): SceneBattle {
  return {
    ticks,
    outcome: 'ongoing',
    fighters,
    groups: [],
    closedGates: [],
    breaches: [],
    ladders: [],
    walls: [
      {
        fort: 0,
        segment: 0,
        path: [
          { x: -20, z: 0 },
          { x: 20, z: 0 },
        ],
        kind: 'walkway',
        rampart: 0,
      },
    ],
  };
}

describe('hody z ochozu', () => {
  it('hod kamenem či oštěpem letí po oblouku 0,5 s z výšky ochozu k zasaženému', () => {
    const foe = man('a:0', { side: 'attack', pos: { x: 0, z: -10 } });
    const thrower = man('d:1', { onWall: true, aim: 'a:0' });
    const prev = snap(4, [thrower, foe]);
    const cur = snap(5, [
      { ...thrower, cooldown: THROW_TICKS },
      { ...foe, health: 90 },
    ]);
    const { shots, clashes } = strikesOf(prev, cur, 100);
    expect(clashes).toEqual([]);
    expect(shots).toHaveLength(1);
    const shot = shots[0]!;
    expect(['stone', 'javelin']).toContain(shot.kind);
    expect(shot.flightS).toBe(THROW_FLIGHT_S);
    expect(shot.fromLift).toBeCloseTo(WALKWAY.deckM);
    expect(shot.to).toEqual({ x: 0, z: -10 });
    const start = arrowAt(shot, 100)!;
    const mid = arrowAt({ ...shot, kind: 'stone' }, 100.25)!;
    const end = arrowAt(shot, 100.5)!;
    // oblouk nad spojnicí – v půli výš než průměr konců
    expect(mid.y).toBeGreaterThan((start.y + end.y) / 2 + 0.5);
    expect(start.y).toBeGreaterThan(end.y);
    expect(arrowAt(shot, 100.51)).toBeNull();
  });

  it('cizí muž bez zdraví ze serveru: ránu pozná podle počtu zásahů', () => {
    const foe = man('a:0', { side: 'attack', pos: { x: 0, z: -10 } });
    const thrower = man('d:1', { onWall: true, aim: 'a:0' });
    const prev = snap(4, [thrower, foe]);
    const cur = snap(5, [
      { ...thrower, cooldown: THROW_TICKS },
      { ...foe, hits: 1 },
    ]);
    const { shots } = strikesOf(prev, cur, 100);
    // zasažen – hod letí k němu, ne za něj na zem
    expect(shots[0]?.to).toEqual({ x: 0, z: -10 });
  });

  it('kámen k patě hradby místo srážky; lezec na žebříku bez prachu', () => {
    const below = man('a:0', { side: 'attack', pos: { x: 0, z: -1 } });
    const guard = man('d:1', { onWall: true, aim: 'a:0' });
    const prev = snap(4, [guard, below]);
    const cur = snap(5, [{ ...guard, cooldown: MELEE_TICKS }, below]);
    const { shots, clashes } = strikesOf(prev, cur, 0);
    expect(clashes).toEqual([]);
    expect(shots[0]!.kind).toBe('stone');
    // mimo – dopadne za cíl na zem
    expect(shots[0]!.miss).toBe(true);
    expect(shots[0]!.to.z).toBeLessThan(-1);
    const climber = {
      ...below,
      state: 'climb' as const,
      climb: { ladder: null, phase: 'up' as const, ticks: 2 },
    };
    const fight = strikesOf(
      snap(4, [guard, climber]),
      snap(5, [{ ...guard, cooldown: MELEE_TICKS }, climber]),
      0,
    );
    expect(fight.shots).toEqual([]);
    expect(fight.clashes).toEqual([]);
  });

  it('šíp mimo cíl letí k zasaženému v kruhu rozptylu, ne k cíli', () => {
    const archer = man('a:9', { side: 'attack', bow: true, pos: { x: 0, z: -40 }, aim: 'd:1' });
    const target = man('d:1', { pos: { x: 0, z: 0 } });
    const other = man('d:2', { pos: { x: 3, z: 1 } });
    const prev = snap(4, [archer, target, other]);
    const cur = snap(5, [{ ...archer, cooldown: BOW_TICKS }, target, { ...other, health: 80 }]);
    const shot = strikesOf(prev, cur, 0).shots[0]!;
    expect(shot.kind).toBeUndefined();
    expect(shot.to).toEqual({ x: 3, z: 1 });
    expect(shot.miss).toBeUndefined();
  });
});

describe('rány mezi dvěma dotazy scény', () => {
  it('takty ran z cooldownu: poslední rána i dřívější téhož boje, nic, co cooldown nepustil', () => {
    const fight = { state: 'fight' as const, aim: 'a:0' };
    // v taktu `cur` – jako po jednom taktu
    expect(strikeTicks({ ...fight, cooldown: 0 }, { ...fight, cooldown: 8 }, 8, 1)).toEqual([0]);
    // takt vynechaný: rána o takt dřív (cooldown už o 1 klesl)
    expect(strikeTicks({ ...fight, cooldown: 0 }, { ...fight, cooldown: 7 }, 8, 2)).toEqual([1]);
    // 20 taktů mezi snímky: rány 3, 11 a 19 taktů zpět
    expect(strikeTicks({ ...fight, cooldown: 0 }, { ...fight, cooldown: 5 }, 8, 20)).toEqual([
      3, 11, 19,
    ]);
    // jiný cíl v `prev` – jen poslední rána (dřívější nejsou poznat)
    expect(
      strikeTicks({ ...fight, aim: 'a:9', cooldown: 0 }, { ...fight, cooldown: 5 }, 8, 20),
    ).toEqual([3]);
    // cooldown z `prev` ránu dřív nepustil: 6 taktů zbývalo, rána o 3 takty dřív (z 4) nejde
    expect(strikeTicks({ ...fight, cooldown: 6 }, { ...fight, cooldown: 7 }, 8, 4)).toEqual([]);
    // cooldown jen klesá – žádná rána
    expect(strikeTicks({ ...fight, cooldown: 7 }, { ...fight, cooldown: 5 }, 8, 2)).toEqual([]);
  });

  it('srážka z vynechaného taktu začne, až k ní dojde plynulý pohyb, z místa mezi snímky', () => {
    const foe = man('a:0', { side: 'attack', pos: { x: 0, z: 0 } });
    const hitter = man('d:1', { pos: { x: 4, z: 0 }, aim: 'a:0' });
    const prev = snap(10, [hitter, foe]);
    // 4 takty mezi snímky, rána 1 takt před `cur`; muž mezitím došel z 4 m na 1 m
    const cur = snap(14, [{ ...hitter, pos: { x: 1, z: 0 }, cooldown: MELEE_TICKS - 1 }, foe]);
    const { clashes } = strikesOf(prev, cur, 100, 1);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.key).toBe('d:1@13');
    // takt 13 = 3/4 cesty: muž na 1,75 m, srážka mezi ním a cílem
    expect(clashes[0]!.at.x).toBeCloseTo(0.875);
    // plynulý posun trvá 1 s (4 takty) – rána 2 takty po prvním, tedy za 0,5 s
    expect(clashes[0]!.startS).toBeCloseTo(100.5);
  });

  it('šíp z vynechaného taktu i dřívější výstřel téhož střelce', () => {
    const foe = man('d:0', { pos: { x: 0, z: 30 }, hits: 1 });
    const archer = man('a:1', { side: 'attack', bow: true, pos: { x: 0, z: 0 }, aim: 'd:0' });
    const prev = snap(0, [archer, { ...foe, hits: 0 }]);
    const cur = snap(40, [{ ...archer, cooldown: BOW_TICKS - 2 }, foe]);
    const { shots } = strikesOf(prev, cur, 0);
    expect(shots.map((s) => s.key)).toEqual(['a:1@38', 'a:1@22', 'a:1@6']);
    // zásah zná server jen součtem – šípy letí k zasaženému, poslední v taktu 38 (9,25 s)
    expect(shots.every((s) => !s.miss)).toBe(true);
    expect(shots[0]!.startS).toBeCloseTo((40 - 1 - 2) / 4);
  });
});
