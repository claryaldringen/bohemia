import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_WORLD,
  SURFACE_CODES,
  battleTick,
  foundVillage,
  hoursPerTick,
  marchGrid,
  openBattle,
  tickRandom,
  type BattleField,
  type Landscape,
} from '@bohemia/game';
import {
  HUDDLE_SPACING_M,
  RIDER_LIFT_M,
  armyDrawCalls,
  battleFigures,
  battleFortifications,
  fighterClip,
  huddleSlots,
  marchAt,
  marchFigures,
  orderIcons,
  sceneBattle,
  sceneMarch,
  type SceneBattle,
  type SceneFighter,
  type SceneMarch,
  type SceneMarchMember,
} from '../army';
import { arrowAt, dustAt, fallenShown, strikesOf, type Shot } from '../battle-fx';
import { createFog, fogPixels, fogSees, revealFog, FOG_ALPHA } from '../fog-of-war';
import { drivenHerd, fleeWalkAt, planFlight } from '../villager-plan';

/** Muž v boji pro scénu – výchozí pěší útočník v boji. */
function man(id: string, o: Partial<SceneFighter> = {}): SceneFighter {
  return {
    id,
    side: 'attack',
    group: 0,
    line: false,
    bow: false,
    mounted: false,
    health: 100,
    pos: { x: 0, z: 0 },
    home: { x: 0, z: -50 },
    state: 'fight',
    cooldown: 0,
    aim: null,
    killed: false,
    breachAt: null,
    ...o,
  };
}

function snapshot(fighters: SceneFighter[], ticks = 1): SceneBattle {
  return {
    ticks,
    outcome: 'ongoing',
    fighters,
    groups: [{ side: 'attack', id: 0, order: 'attack-all', broken: false }],
    closedGates: [],
    breaches: [],
    ladders: [],
    walls: [],
  };
}

/** Rovná louka 64 × 64 políček po 15 m. */
function meadow(): Landscape {
  const size = 64;
  return {
    size,
    cellSizeM: 15,
    heights: new Float32Array(size * size),
    surface: new Uint8Array(size * size).fill(SURFACE_CODES.meadow),
    fertility: new Uint8Array(size * size),
    villageSite: { x: 32, y: 32 },
    stream: [],
    obstacleLayer: null,
  };
}

describe('hloučky pochodu', () => {
  it('místa hloučku drží rozestup a stejný počet dá stejný hlouček', () => {
    const slots = huddleSlots(12, HUDDLE_SPACING_M.foot);
    expect(slots).toEqual(huddleSlots(12, HUDDLE_SPACING_M.foot));
    expect(slots[0]).toEqual({ x: 0, z: 0 });
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z);
        expect(d).toBeGreaterThan(0.9);
      }
    }
  });

  it('jezdci rodu sedí na koních vpředu, pěší za nimi; padlí a zajatí chybí', () => {
    const march = sceneMarch({
      members: [
        member({ line: true, mounted: true }),
        member({}),
        member({ wounded: true }),
        member({ status: 'fallen' }),
      ],
      groups: [group()],
    });
    const { figures, animals } = marchFigures(march);
    expect(figures).toHaveLength(3);
    expect(animals).toHaveLength(1);
    const rider = figures.find((f) => f.key === 'm0')!;
    expect(rider.lift).toBe(RIDER_LIFT_M);
    expect(rider.clip).toBe('ride');
    expect(animals[0]!.x).toBeCloseTo(rider.x);
    // směr pochodu na +x: pěší jsou za jezdcem
    for (const f of figures.filter((x) => x.key !== 'm0')) {
      expect(f.x).toBeLessThan(rider.x);
      expect(f.clip).toBe('walk-spear');
    }
    expect(orderIcons(null, march)).toEqual([{ group: 0, order: 'follow-leader', x: 10, z: 5 }]);
  });
});

function member(o: Partial<SceneMarchMember>): SceneMarchMember {
  return { line: false, mounted: false, wounded: false, group: 0, status: 'active', ...o };
}

function group(): Parameters<typeof sceneMarch>[0]['groups'][number] {
  return {
    id: 0,
    order: 'follow-leader',
    pos: { x: 10, z: 5 },
    arrived: false,
    goal: null,
    leg: {
      points: [
        { x: 10, z: 5 },
        { x: 60, z: 5 },
      ],
      meadowM: [],
      walkedM: 0,
    },
  };
}

describe('plynulý pochod mezi snímky', () => {
  const at = (x: number, z: number, arrived = false): SceneMarch => ({
    members: [member({})],
    groups: [{ id: 0, order: 'follow-leader', pos: { x, z }, arrived, heading: { x: 0, z: 1 } }],
    tick: 0,
  });

  it('skupina jde rovnoměrně ve směru posunu, i když v novém snímku už stojí', () => {
    const half = marchAt(at(0, 0), at(6, 8, true), 0.5, 2);
    expect(half.groups[0]!.pos).toEqual({ x: 3, z: 4 });
    expect(half.groups[0]!.arrived).toBe(false);
    expect(half.groups[0]!.heading.x).toBeCloseTo(0.6);
    expect(half.groups[0]!.heading.z).toBeCloseTo(0.8);
    expect(marchFigures(half).figures[0]!.clip).toBe('walk-spear');
    // na konci posunu nový snímek beze změny
    const end = marchAt(at(0, 0), at(6, 8, true), 1, 2);
    expect(end.groups[0]!.pos).toEqual({ x: 6, z: 8 });
    expect(end.groups[0]!.arrived).toBe(true);
  });

  it('bez předchozího snímku, nová skupina a skok z jiné mapy stojí rovnou v novém snímku', () => {
    expect(marchAt(null, at(6, 8), 0.5, 2).groups[0]!.pos).toEqual({ x: 6, z: 8 });
    const other = { ...at(0, 0), groups: [{ ...at(0, 0).groups[0]!, id: 7 }] };
    expect(marchAt(other, at(6, 8), 0.5, 2).groups[0]!.pos).toEqual({ x: 6, z: 8 });
    // 300 m za 2 s – skupina přešla na jinou mapu a zpět
    expect(marchAt(at(0, 0), at(300, 0), 0.5, 2).groups[0]!.pos).toEqual({ x: 300, z: 0 });
  });
});

describe('postavy boje', () => {
  it('poloha mezi takty plynule, pohled ke směru chůze', () => {
    const prev = snapshot([man('a:0', { pos: { x: 0, z: 0 } })], 1);
    const cur = snapshot([man('a:0', { pos: { x: 1, z: 0 } })], 2);
    const half = battleFigures(prev, cur, 0.5, { showFallen: true }).figures[0]!;
    expect(half.x).toBeCloseTo(0.5);
    expect(half.hx).toBeCloseTo(1);
    expect(half.clip).toBe('walk-spear');
  });

  it('padlý leží, raněný sedí u domu, utečený chybí; po konci dne nikdo neleží', () => {
    const cur = snapshot([
      man('a:0', { state: 'down', killed: true, pos: { x: 5, z: 5 } }),
      man('d:1', {
        side: 'defend',
        state: 'down',
        killed: false,
        pos: { x: 2, z: 2 },
        home: { x: 9, z: 9 },
      }),
      man('a:2', { state: 'fled' }),
    ]);
    const { figures } = battleFigures(null, cur, 1, { showFallen: true });
    expect(figures).toHaveLength(2);
    expect(figures[0]).toMatchObject({ lying: true, x: 5, z: 5, pace: 0 });
    expect(figures[1]).toMatchObject({ lying: false, clip: 'sit', x: 9, z: 9 });
    expect(battleFigures(null, cur, 1, { showFallen: false }).figures).toHaveLength(0);
    expect(fallenShown(1000, 2000)).toBe(true);
    expect(fallenShown(2000, 2000)).toBe(false);
    expect(fallenShown(5, null)).toBe(true);
  });

  it('jezdec má koně, cizí mimo dohled se nekreslí', () => {
    const cur = snapshot([
      man('a:0', { mounted: true, line: true }),
      man('d:1', { side: 'defend', pos: { x: 500, z: 0 } }),
    ]);
    const out = battleFigures(null, cur, 1, {
      showFallen: true,
      visible: (side, x) => side === 'attack' || x < 100,
    });
    expect(out.figures.map((f) => f.key)).toEqual(['a:0']);
    expect(out.animals).toHaveLength(1);
    expect(out.figures[0]!.lift).toBe(RIDER_LIFT_M);
  });

  it('klipy: rána zblízka, luk, kryt štítem, prolamování sekerou', () => {
    const near = { pos: { x: 2, z: 0 } };
    const far = { pos: { x: 40, z: 0 } };
    const base = { mounted: false, pos: { x: 0, z: 0 }, aim: 't' } as const;
    expect(
      fighterClip({ ...base, state: 'fight', bow: false, line: false, cooldown: 8 }, near, 0),
    ).toBe('spear-thrust');
    expect(
      fighterClip({ ...base, state: 'fight', bow: false, line: true, cooldown: 8 }, near, 0),
    ).toBe('sword-strike');
    expect(
      fighterClip({ ...base, state: 'fight', bow: false, line: true, cooldown: 2 }, near, 0),
    ).toBe('shield-block');
    expect(
      fighterClip({ ...base, state: 'fight', bow: true, line: true, cooldown: 16 }, far, 0),
    ).toBe('bow-release');
    expect(
      fighterClip({ ...base, state: 'fight', bow: true, line: true, cooldown: 3 }, far, 0),
    ).toBe('bow-draw');
    expect(
      fighterClip({ ...base, state: 'breach', bow: false, line: false, cooldown: 0 }, undefined, 0),
    ).toBe('fell');
    expect(
      fighterClip({ ...base, state: 'flee', bow: false, line: false, cooldown: 0 }, undefined, 2),
    ).toBe('walk');
  });

  it('ikona rozkazu nad bojujícími muži skupiny, zlomená skupina bez ikony', () => {
    const cur = snapshot([
      man('a:0', { pos: { x: 0, z: 0 } }),
      man('a:1', { pos: { x: 4, z: 2 } }),
    ]);
    expect(orderIcons(cur, null)).toEqual([{ group: 0, order: 'attack-all', x: 2, z: 1 }]);
    cur.groups[0]!.broken = true;
    expect(orderIcons(cur, null)).toEqual([]);
  });

  it('opevnění z boje: zavřená brána a prolomený úsek', () => {
    const forts = [{ segments: [{ index: 0 }, { index: 1 }] }, { segments: [{ index: 0 }] }];
    const out = battleFortifications(
      forts,
      {
        closedGates: ['0:1'],
        breaches: [
          {
            key: 'b',
            fort: 0,
            segment: 1,
            spot: 'gate',
            at: { x: 0, z: 0 },
            method: 'cut',
            phase: 'done',
            progress: 1,
            breached: true,
            fuel: 1,
            fill: 1,
          },
        ],
      },
      12,
    );
    expect(out[0]).toEqual({
      gatesClosed: true,
      segments: [{ index: 0 }, { index: 1, breachedDay: 12 }],
    });
    expect(out[1]).toBe(forts[1]);
  });

  it('draw cally: druh postavy a zvířete, stíny, šípy, rozkazy a mlha', () => {
    expect(
      armyDrawCalls({
        figures: [{ kind: 'man' }, { kind: 'man' }],
        animals: [{ species: 'horse' }],
        icons: [{ order: 'attack-all' }, { order: 'hold-place' }],
        arrows: 3,
        dust: 0,
        fog: true,
      }),
    ).toBe(7);
  });
});

describe('boj taktem jádra', () => {
  it('výstřely a srážky z rány jádra, postavy pro každý takt', () => {
    const l = meadow();
    const grid = marchGrid(
      l,
      null,
      foundVillage({ seed: 1, day: 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
      { day: 10 },
    );
    const field: BattleField = {
      grid,
      geo: l,
      forts: [],
      day: 10,
      hoursPerTick: hoursPerTick(OFFICIAL_WORLD),
    };
    const b = openBattle({
      attackers: [
        {
          member: 0,
          group: 0,
          line: true,
          mounted: false,
          strength: 1,
          health: 100,
          pos: { x: 0, z: -40 },
        },
        {
          member: 1,
          group: 0,
          line: false,
          mounted: false,
          strength: 0.4,
          health: 100,
          pos: { x: 2, z: -40 },
        },
      ],
      defenders: [
        {
          personId: 1,
          pos: { x: 0, z: 0 },
          houseGroup: 0,
          strength: 0.4,
          line: false,
          bow: false,
          atHouseOnly: false,
          lastLine: false,
        },
      ],
      groups: [{ id: 0, order: 'attack-all', holdAt: null }],
      commander: null,
      deputy: null,
      liveCommand: false,
    });
    let prev: SceneBattle | null = null;
    let shots = 0;
    let clashes = 0;
    for (let t = 1; t <= 600 && b.outcome === 'ongoing'; t++) {
      battleTick(b, field, tickRandom(3, t, 'battle'));
      const cur = sceneBattle(b);
      const fx = strikesOf(prev, cur, t / 4);
      shots += fx.shots.length;
      clashes += fx.clashes.length;
      expect(battleFigures(prev, cur, 0.5, { showFallen: true }).figures.length).toBeGreaterThan(0);
      prev = cur;
    }
    expect(b.outcome).not.toBe('ongoing');
    // muž rodu střílí lukem z dálky, zblízka se srážejí
    expect(shots).toBeGreaterThan(0);
    expect(clashes).toBeGreaterThan(0);
  });
});

describe('šípy a prach', () => {
  it('šíp letí obloukem od střelce k cíli a dopadne', () => {
    const shot: Shot = {
      key: 's',
      from: { x: 0, z: 0 },
      to: { x: 45, z: 0 },
      startS: 10,
      flightS: 1,
    };
    expect(arrowAt(shot, 9.9)).toBeNull();
    const mid = arrowAt(shot, 10.5)!;
    expect(mid.x).toBeCloseTo(22.5);
    expect(mid.y).toBeGreaterThan(arrowAt(shot, 10.1)!.y);
    expect(mid.dy).toBeCloseTo(0);
    expect(arrowAt(shot, 10.1)!.dy).toBeGreaterThan(0);
    expect(arrowAt(shot, 11.01)).toBeNull();
    expect(dustAt({ key: 'c', at: { x: 0, z: 0 }, startS: 0 }, 0.3)).toBeGreaterThan(0.6);
    expect(dustAt({ key: 'c', at: { x: 0, z: 0 }, startS: 0 }, 1)).toBeNull();
  });
});

describe('mlha války', () => {
  it('dohled 150 m, z lesa 50 m; objevené zůstane šeré', () => {
    const fog = createFog(1000);
    const seen = revealFog(fog, [{ x: 0, z: 0, forest: false }]);
    expect(fogSees(fog, seen, 140, 0)).toBe(true);
    expect(fogSees(fog, seen, 160, 0)).toBe(false);
    const inForest = revealFog(fog, [{ x: 300, z: 300, forest: true }]);
    expect(fogSees(fog, inForest, 340, 300)).toBe(true);
    expect(fogSees(fog, inForest, 360, 300)).toBe(false);
    // první dohled už není v dohledu, ale je objevený
    expect(fogSees(fog, inForest, 0, 0)).toBe(false);
    const px = fogPixels(fog, inForest);
    const alpha = (x: number, z: number): number => {
      const i = Math.floor((x - fog.minX) / fog.cellM);
      const j = Math.floor((z - fog.minZ) / fog.cellM);
      return px[(j * fog.size + i) * 4 + 3]!;
    };
    expect(alpha(0, 0)).toBe(FOG_ALPHA.explored);
    expect(alpha(300, 300)).toBe(FOG_ALPHA.seen);
    expect(alpha(-450, -450)).toBe(FOG_ALPHA.hidden);
  });

  it('do lesa z louky jen 50 m', () => {
    const fog = createFog(1000);
    const seen = revealFog(fog, [{ x: 0, z: 0, forest: false }], (x) => x > 30);
    expect(fogSees(fog, seen, 45, 0)).toBe(true);
    expect(fogSees(fog, seen, 100, 0)).toBe(false);
    expect(fogSees(fog, seen, -100, 0)).toBe(true);
  });
});

describe('napadená ves', () => {
  it('útěk k lesu: od domu k okraji lesa, s nůší pomaleji, lidé vycházejí postupně', () => {
    const walks = planFlight(
      [
        { id: 1, home: { x: 0, z: 0 }, kind: 'woman', child: false, carries: true },
        { id: 2, home: { x: 0, z: 0 }, kind: 'man', child: false, carries: false },
      ],
      { x: 100, z: 0 },
    );
    expect(walks[0]!.clip).toBe('carry');
    expect(walks[0]!.speed).toBeLessThan(walks[1]!.speed);
    expect(walks[1]!.startS).toBeGreaterThan(walks[0]!.startS);
    expect(fleeWalkAt(walks[0]!, 0)).toMatchObject({ x: 0, z: 0, moving: false });
    expect(fleeWalkAt(walks[0]!, 10).moving).toBe(true);
    const end = fleeWalkAt(walks[0]!, 1000);
    expect(end.moving).toBe(false);
    expect(Math.hypot(end.x - 100, end.z)).toBeLessThan(10);
  });

  it('odehnané stádo jde za vojskem v řadách', () => {
    const herd = drivenHerd({ x: 0, z: 0 }, { x: 0, z: 1 }, 6);
    expect(herd).toHaveLength(6);
    for (const p of herd) expect(p.z).toBeLessThan(-5);
    expect(herd[3]!.z).toBeLessThan(herd[0]!.z);
  });
});
