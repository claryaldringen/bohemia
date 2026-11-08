import { describe, expect, it } from 'vitest';
import {
  LADDER_TOP_M,
  armyDrawCalls,
  WALL_STAND_M,
  battleFigures,
  battleFortifications,
  breachFagots,
  breachFires,
  climberPose,
  fighterClip,
  minePits,
  FAGOTS_PER_BREACH,
  type SceneBattle,
  type SceneBreach,
  type SceneFighter,
  type SceneLadder,
  type SceneWall,
} from '../army';
import { climbTicks } from '@bohemia/game';
import { WALKWAY } from '../fortification-layout';

// Scéna boje u hradby (fortifications.md – Hradby a obrana, Ve scéně; plán hradeb Úloha 21):
// lezci na žebřících, obránci na ochozu, otepi, oheň a jáma podkopu z průlomů jádra.

/** Hradba úseku 0 opevnění 0 – čára podél osy x v z = 0 (venku je z < 0). */
function wall(kind: SceneWall['kind'], rampart = 0): SceneWall {
  return {
    fort: 0,
    segment: 0,
    path: [
      { x: -20, z: 0 },
      { x: 20, z: 0 },
    ],
    kind,
    rampart,
  };
}

function man(id: string, o: Partial<SceneFighter> = {}): SceneFighter {
  return {
    id,
    side: 'attack',
    group: 0,
    line: false,
    bow: false,
    mounted: false,
    health: 100,
    pos: { x: 0, z: -1 },
    home: { x: 0, z: -50 },
    state: 'fight',
    cooldown: 0,
    aim: null,
    killed: false,
    breachAt: null,
    ...o,
  };
}

const LADDER: SceneLadder = {
  key: '0:0:0',
  fort: 0,
  segment: 0,
  foot: { x: 0, z: -1 },
  top: { x: 0, z: 0 },
  inner: null,
  climber: 'a:0',
  up: true,
};

function battle(o: Partial<SceneBattle> = {}): SceneBattle {
  return {
    ticks: 10,
    outcome: 'ongoing',
    fighters: [],
    groups: [],
    closedGates: [],
    breaches: [],
    ladders: [],
    walls: [],
    ...o,
  };
}

function breach(o: Partial<SceneBreach> = {}): SceneBreach {
  return {
    key: '0:0:wall',
    fort: 0,
    segment: 0,
    spot: 'wall',
    at: { x: 2, z: -1.5 },
    method: 'burn',
    phase: 'burn',
    progress: 0.5,
    breached: false,
    fuel: 1,
    fill: 1,
    ...o,
  };
}

describe('lezci a obránci na hradbě', () => {
  it('lezec v půli žebříku je 2,5 m nad patou (5 m k předprsni komorové hradby)', () => {
    expect(LADDER_TOP_M.chamber).toBe(5);
    const up = climbTicks('chamber').up;
    const climber = man('a:0', {
      state: 'climb',
      climb: { ladder: LADDER.key, phase: 'up', ticks: up / 2 },
    });
    const b = battle({ fighters: [climber], ladders: [LADDER], walls: [wall('chamber')] });
    const pose = climberPose(b, climber, up / 2)!;
    expect(pose.lift).toBeCloseTo(2.5);
    expect(pose.z).toBeCloseTo(-0.5);
    // hledí k hradbě
    expect(pose.hz).toBeCloseTo(1);
    // nahoře stojí na koruně, val ho zvedne
    const top = climberPose(
      battle({ ladders: [LADDER], walls: [wall('chamber', 1)] }),
      { ...climber, climb: { ladder: LADDER.key, phase: 'up', ticks: 0 } },
      0,
    )!;
    expect(top.lift).toBeCloseTo(WALL_STAND_M.chamber + 2);
    // na zemi (nese žebřík) nic
    expect(
      climberPose(b, { ...climber, climb: { ladder: null, phase: 'carry', ticks: 0 } }, 0),
    ).toBeNull();
  });

  it('postava lezce je zvednutá, obránce na ochozu stojí ve výšce koruny', () => {
    const up = climbTicks('walkway').up;
    const climber = man('a:0', {
      state: 'climb',
      climb: { ladder: LADDER.key, phase: 'up', ticks: up },
    });
    const guard = man('d:1', { side: 'defend', pos: { x: 6, z: 1 }, onWall: true });
    const below = man('d:2', { side: 'defend', pos: { x: 6, z: 12 } });
    const b = battle({
      fighters: [climber, guard, below],
      ladders: [LADDER],
      walls: [wall('walkway')],
    });
    const out = battleFigures(null, b, 1, { showFallen: true });
    const lift = (id: string): number => out.figures.find((f) => f.key === id)!.lift;
    expect(lift('a:0')).toBeCloseTo(0);
    expect(lift('d:1')).toBeCloseTo(WALKWAY.deckM);
    expect(lift('d:2')).toBe(0);
    expect(out.figures.find((f) => f.key === 'a:0')!.clip).toBe('build');
    // opřený žebřík od paty k vrcholu (5 m díl stačí na palisádu s ochozem)
    expect(out.ladders).toHaveLength(1);
    expect(out.ladders[0]!.model).toBe('ladder-5');
    expect(out.ladders[0]!.up.y).toBeGreaterThan(0.9);
    expect(out.ladders[0]!.up.z).toBeGreaterThan(0);
  });

  it('nesený žebřík na rameni, ležící u paty ven od hradby; kopáč v podkopu není vidět', () => {
    const carrier = man('a:1', {
      state: 'climb',
      ladder: true,
      climb: { ladder: null, phase: 'carry', ticks: 0 },
    });
    const digger = man('a:2', { state: 'breach', breachAt: 'm', underground: true });
    const prev = battle({ ticks: 9, fighters: [{ ...carrier, pos: { x: 0, z: -6 } }, digger] });
    const lying: SceneLadder = { ...LADDER, key: 'l2', climber: null, up: false };
    const cur = battle({
      fighters: [carrier, digger],
      ladders: [lying],
      walls: [wall('palisade')],
    });
    const out = battleFigures(prev, cur, 0.5, { showFallen: true });
    expect(out.figures.map((f) => f.key)).toEqual(['a:1']);
    expect(out.figures[0]!.clip).toBe('carry-wood');
    const carried = out.ladders.find((l) => l.key === 'carry:a:1')!;
    expect(carried.lift).toBeGreaterThan(1);
    expect(Math.abs(carried.up.y)).toBeLessThan(0.1);
    const flat = out.ladders.find((l) => l.key === 'l2')!;
    expect(flat.up.z).toBeLessThan(-0.99);
  });

  it('klipy prolamování podle postupu a fáze, lezec opírá žebřík', () => {
    const at = man('a:0', { state: 'breach', breachAt: 'b' });
    expect(fighterClip(at, undefined, 0, { method: 'cut', phase: 'work' })).toBe('fell');
    expect(fighterClip(at, undefined, 0, { method: 'dig', phase: 'work' })).toBe('hoe');
    expect(fighterClip(at, undefined, 0, { method: 'mine', phase: 'work' })).toBe('hoe');
    expect(fighterClip(at, undefined, 0, { method: 'burn', phase: 'fill' })).toBe('hoe');
    expect(fighterClip(at, undefined, 2, { method: 'burn', phase: 'fuel' })).toBe('carry-wood');
    expect(fighterClip(at, undefined, 0, { method: 'burn', phase: 'burn' })).toBe('seed');
    const climber = man('a:1', {
      state: 'climb',
      climb: { ladder: 'l', phase: 'lean', ticks: 3 },
    });
    expect(fighterClip(climber, undefined, 0)).toBe('pitch');
  });
});

describe('oheň, otepi a podkop', () => {
  it('draw cally u hradby: kameny, oštěpy, díl žebříku, otepi, jámy a oheň', () => {
    const base = { figures: [], animals: [], icons: [], arrows: 0, dust: 0, fog: false };
    expect(armyDrawCalls(base)).toBe(0);
    expect(
      armyDrawCalls({
        ...base,
        siege: {
          stones: 2,
          javelins: 0,
          ladders: [{ model: 'ladder-5' }, { model: 'ladder-5' }, { model: 'ladder-7' }],
          fagots: 10,
          pits: 0,
          fires: 1,
        },
      }),
    ).toBe(5);
  });

  it('oheň u místa ve fázi burn – u paty vně hradby, natočený podél ní', () => {
    const b = battle({
      walls: [wall('palisade')],
      breaches: [breach(), breach({ key: 'x', phase: 'fuel', fuel: 0.5 })],
    });
    const fires = breachFires(b);
    expect(fires).toHaveLength(1);
    expect(fires[0]!.x).toBeCloseTo(2);
    expect(fires[0]!.z).toBeCloseTo(-0.5);
    expect(Math.abs(Math.cos(fires[0]!.yaw))).toBeCloseTo(1);
    // otepi: hořící místo plná hromada, nanášené podle podílu
    const fagots = breachFagots(b);
    expect(fagots.filter((f) => f.key.startsWith('0:0:wall:'))).toHaveLength(FAGOTS_PER_BREACH);
    expect(fagots.filter((f) => f.key.startsWith('x:'))).toHaveLength(FAGOTS_PER_BREACH / 2);
    expect(fagots.every((f) => f.z < 0)).toBe(true);
    // vyhořelo – oheň ani otepi
    const done = battle({ walls: [wall('palisade')], breaches: [breach({ phase: 'done' })] });
    expect(breachFires(done)).toEqual([]);
    expect(breachFagots(done)).toEqual([]);
  });

  it('jáma podkopu roste do pětiny práce, ohořelý průlom a zasypaný příkop v opevnění', () => {
    const pits = minePits(
      battle({
        breaches: [
          breach({ key: 'a', method: 'mine', phase: 'work', progress: 0.1 }),
          breach({ key: 'b', method: 'mine', phase: 'work', progress: 0.5 }),
          breach({ key: 'c', method: 'mine', phase: 'work', progress: 0 }),
        ],
      }),
      0.2,
    );
    expect(pits.map((p) => p.key)).toEqual(['a', 'b']);
    expect(pits[0]!.radius).toBeLessThan(pits[1]!.radius);
    const forts = [{ segments: [{ index: 0 }, { index: 1 }] }];
    const out = battleFortifications(
      forts,
      {
        closedGates: [],
        breaches: [
          breach({ segment: 0, phase: 'done', breached: true }),
          breach({
            segment: 1,
            method: 'ladder',
            phase: 'fill',
            fill: 0.4,
            moat: { from: { x: 0, z: -9 }, to: { x: 0, z: -1 } },
          }),
        ],
      },
      30,
    );
    expect(out[0]).toEqual({
      moatFills: [{ from: { x: 0, z: -9 }, to: { x: 0, z: -1 }, share: 0.4 }],
      segments: [{ index: 0, breachedDay: 30, burnedDay: 30 }, { index: 1 }],
    });
  });
});
