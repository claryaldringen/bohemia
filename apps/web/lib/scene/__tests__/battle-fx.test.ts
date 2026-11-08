import { describe, expect, it } from 'vitest';
import { THROW_TICKS, MELEE_TICKS, BOW_TICKS, type SceneBattle, type SceneFighter } from '../army';
import { THROW_FLIGHT_S, arrowAt, strikesOf } from '../battle-fx';
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
