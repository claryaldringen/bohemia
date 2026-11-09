import { describe, expect, it } from 'vitest';
import {
  dateOfDayIndex,
  msOfTick,
  OFFICIAL_WORLD,
  realTimeOf,
  type CampaignView,
  type CampaignViewMan,
  type WarSceneFighter,
  type WarSceneView,
} from '@bohemia/game';
import {
  armyFocusOf,
  breakoutOf,
  followCellOf,
  foreignVillageOf,
  SCENE_HERD_MAX,
  sceneWarOf,
  watchCellOf,
} from '../war-scene-view';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru): odpověď serveru (už po mlze
// války – packages/game `war-scene.test.ts`) se převede na snímek scény beze změny obsahu.

const fighter = (id: string, side: 'attack' | 'defend', x: number): WarSceneFighter => ({
  id,
  side,
  group: 0,
  line: false,
  bow: side === 'defend',
  mounted: false,
  health: 80,
  pos: { x, z: 0 },
  home: { x, z: 5 },
  state: 'fight',
  cooldown: 0,
  aim: null,
  killed: false,
  breachAt: null,
});

/** Cizí muž, jak ho pošle server – bez zdraví. */
const foreign = (id: string, x: number): WarSceneFighter => {
  const man = fighter(id, 'attack', x);
  delete man.health;
  return man;
};

const BASE: Omit<WarSceneView, 'battle' | 'march'> = {
  campaignId: 'c1',
  tick: 40,
  day: 12,
  side: 'defend',
};

describe('sceneWarOf', () => {
  it('bez války nic', () => {
    expect(sceneWarOf(null, OFFICIAL_WORLD)).toBeNull();
    expect(sceneWarOf({ ...BASE, battle: null, march: null }, OFFICIAL_WORLD)).toBeNull();
  });

  it('boj z odpovědi: jen poslaní bojovníci, hradby z odpovědi, bez závoje, padlí do konce dne', () => {
    const wall = {
      fort: 0,
      segment: 1,
      path: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ],
      kind: 'palisade' as const,
      rampart: 0,
    };
    const war = sceneWarOf(
      {
        ...BASE,
        march: null,
        battle: {
          ticks: 40,
          outcome: 'ongoing',
          fighters: [fighter('d:1', 'defend', 10), { ...foreign('a:0', 60), hits: 1 }],
          groups: [{ side: 'defend', id: 0, order: 'attack-all', broken: false }],
          closedGates: ['0:2'],
          breaches: [],
          ladders: [],
          walls: [wall],
        },
      },
      OFFICIAL_WORLD,
    );
    expect(war?.battle?.fighters.map((f) => f.id)).toEqual(['d:1', 'a:0']);
    expect(war?.battle?.fighters[0]).toMatchObject({ health: 80, home: { x: 10, z: 5 } });
    // cizí muž bez zdraví (mlha války) – scéna ho kreslí celého, ránu pozná podle zásahů
    expect(war?.battle?.fighters[1]).toMatchObject({ health: 100, hits: 1 });
    expect(war?.battle?.walls).toEqual([wall]);
    expect(war?.battle?.closedGates).toEqual(['0:2']);
    expect(war?.march).toBeNull();
    // vlastní mapa – bez závoje; cizí mimo dohled server neposlal
    expect(war?.fog).toBeNull();
    expect(war?.dayEndMs).toBe(realTimeOf(dateOfDayIndex(13), OFFICIAL_WORLD));
  });

  it('pochod z odpovědi: hloučky skupin se směrem chůze', () => {
    const war = sceneWarOf(
      {
        ...BASE,
        side: 'attack',
        battle: null,
        march: {
          members: [
            { line: true, mounted: true, wounded: false, group: 0, status: 'active' },
            { line: false, mounted: false, wounded: false, group: 0, status: 'active' },
          ],
          groups: [
            {
              id: 0,
              order: 'attack-all',
              pos: { x: 5, z: 5 },
              arrived: false,
              heading: { x: 1, z: 0 },
            },
          ],
        },
      },
      OFFICIAL_WORLD,
    );
    expect(war?.battle).toBeNull();
    expect(war?.march?.members).toHaveLength(2);
    // takt snímku – plynulý pochod mezi dvěma dotazy
    expect(war?.march?.tick).toBe(BASE.tick);
    expect(war?.march?.groups[0]).toEqual({
      id: 0,
      order: 'attack-all',
      pos: { x: 5, z: 5 },
      arrived: false,
      heading: { x: 1, z: 0 },
    });
  });
});

describe('kryt, vzdaní a „Probít se“ (fortifications.md – Obrana bez násobku 3)', () => {
  const battle = (fighters: WarSceneFighter[]): WarSceneView['battle'] => ({
    ticks: 40,
    outcome: 'ongoing',
    fighters,
    groups: [],
    closedGates: [],
    breaches: [],
    ladders: [],
    walls: [],
  });

  it('kryjící se a vzdaný jdou do scény, jak je server poslal', () => {
    const war = sceneWarOf(
      {
        ...BASE,
        march: null,
        battle: battle([
          { ...fighter('d:1', 'defend', 10), cover: true, onWall: true },
          { ...fighter('d:2', 'defend', 12), state: 'fled', surrendered: true },
          fighter('d:3', 'defend', 14),
        ]),
      },
      OFFICIAL_WORLD,
    );
    const men = war!.battle!.fighters;
    expect(men[0]).toMatchObject({ cover: true, onWall: true });
    expect(men[1]).toMatchObject({ state: 'fled', surrendered: true });
    expect(men[2]).not.toHaveProperty('cover');
    expect(men[2]).not.toHaveProperty('surrendered');
  });

  it('tlačítko jen obránci s opevněním s branou; důvod česky', () => {
    const view: WarSceneView = { ...BASE, march: null, battle: battle([]) };
    expect(breakoutOf(null)).toBeNull();
    expect(breakoutOf(view)).toBeNull();
    expect(breakoutOf({ ...view, breakout: { blocked: null } })).toEqual({ denied: null });
    expect(breakoutOf({ ...view, breakout: { blocked: 'undefended' } })).toEqual({
      denied: 'Nikdo nebrání hradbu.',
    });
    expect(breakoutOf({ ...view, breakout: { blocked: 'over' } })).toEqual({
      denied: 'Boj neběží.',
    });
    expect(breakoutOf({ ...view, side: 'attack', breakout: { blocked: null } })).toBeNull();
  });
});

describe('napadená ves ve scéně – útěk, stádo, padlí (war.md – Ve scéně)', () => {
  const march: WarSceneView['march'] = {
    members: [{ line: false, mounted: false, wounded: false, group: 3, status: 'active' }],
    groups: [
      {
        id: 3,
        order: 'follow-leader',
        pos: { x: 50, z: 7 },
        arrived: false,
        heading: { x: 0, z: 1 },
      },
    ],
  };

  it('útěk do lesa: lidé od domů k okraji lesa své skupiny domů, od taktu útěku, dobytek', () => {
    const flight: WarSceneView['flight'] = {
      startTick: 30,
      forests: [
        { x: 0, z: 100 },
        { x: 200, z: 100 },
      ],
      people: [
        { id: 11, home: { x: 0, z: 0 }, kind: 'woman', child: false, carries: true, forest: 0 },
        { id: 12, home: { x: 0, z: 0 }, kind: 'man', child: true, carries: false, forest: 0 },
        { id: 21, home: { x: 200, z: 0 }, kind: 'man', child: false, carries: true, forest: 1 },
      ],
      herd: 80,
    };
    const war = sceneWarOf({ ...BASE, battle: null, march, flight }, OFFICIAL_WORLD)!;
    expect(war.flight?.startMs).toBe(msOfTick(30, OFFICIAL_WORLD));
    expect(war.flight?.walks.map((w) => [w.id, w.kind, w.child, w.clip])).toEqual([
      [11, 'woman', false, 'carry'],
      [12, 'man', true, 'walk'],
      [21, 'man', false, 'carry'],
    ]);
    // každý k okraji lesa své skupiny domů (rozptyl do 9 m)
    const to = war.flight!.walks.map((w) => Math.abs(Math.round(w.to.x / 100)));
    expect(to).toEqual([0, 0, 2]);
    expect(war.flight?.herd).toBe(SCENE_HERD_MAX);
    // starší stav bez taktu útěku – lidé už stojí u lesa
    const old = sceneWarOf(
      { ...BASE, battle: null, march, flight: { ...flight, startTick: null } },
      OFFICIAL_WORLD,
    )!;
    expect(old.flight?.startMs).toBe(-Infinity);
  });

  it('odehnané stádo jde za skupinou, se kterou ho vedou; bez stáda nic', () => {
    expect(sceneWarOf({ ...BASE, battle: null, march }, OFFICIAL_WORLD)?.herd).toBeNull();
    const war = sceneWarOf(
      { ...BASE, battle: null, march: { ...march, herd: { group: 3, count: 7 } } },
      OFFICIAL_WORLD,
    );
    expect(war?.herd).toEqual({ lead: { x: 50, z: 7 }, heading: { x: 0, z: 1 }, count: 7 });
    expect(war?.flight).toBeNull();
  });

  it('rozhodnutý boj s padlými vedle pochodu – padlí do konce herního dne', () => {
    const dead = { ...fighter('d:1', 'defend', 10), state: 'down' as const, killed: true };
    const war = sceneWarOf(
      {
        ...BASE,
        march,
        battle: {
          ticks: 90,
          outcome: 'attackers',
          fighters: [dead],
          groups: [],
          closedGates: [],
          breaches: [],
          ladders: [],
          walls: [],
        },
      },
      OFFICIAL_WORLD,
    )!;
    expect(war.battle?.fighters.map((f) => [f.id, f.state, f.killed])).toEqual([
      ['d:1', 'down', true],
    ]);
    expect(war.march?.members).toHaveLength(1);
    expect(war.dayEndMs).toBe(realTimeOf(dateOfDayIndex(BASE.day + 1), OFFICIAL_WORLD));
  });
});

describe('cizí mapa ve scéně (war.md – Ve scéně – cizí mapa)', () => {
  const man = (
    member: number,
    cell: { x: number; y: number },
    extra: Partial<CampaignViewMan> = {},
  ): CampaignViewMan => ({
    member,
    line: false,
    mounted: false,
    wounded: false,
    health: 100,
    status: 'active',
    group: 0,
    cell,
    pos: { x: 0, z: 0 },
    commander: false,
    deputy: false,
    fight: null,
    ...extra,
  });
  const campaign = (men: CampaignViewMan[], extra: Partial<CampaignView> = {}): CampaignView =>
    ({
      phase: 'raiding',
      men,
      allies: [],
      ...extra,
    }) as unknown as CampaignView;
  const HOME = { x: 0, y: 0 };
  const AWAY = { x: 1, y: 0 };

  it('výběr mapy: políčko velitele, jinak vlastního muže, jinak spojence; doma nic', () => {
    const view = campaign([man(1, { x: 2, y: 0 }), man(2, AWAY, { commander: true })]);
    expect(watchCellOf(view, HOME)).toEqual(AWAY);
    // velitel padl – mapa prvního muže na nohou
    const fallen = campaign([
      man(1, { x: 2, y: 0 }),
      man(2, AWAY, { commander: true, status: 'fallen' }),
    ]);
    expect(watchCellOf(fallen, HOME)).toEqual({ x: 2, y: 0 });
    // vazal, jehož muži padli, sleduje tažení muži pána
    const ally = campaign([man(1, AWAY, { status: 'fallen' })], {
      allies: [{ ...man(5, { x: 3, y: 1 }) }],
    });
    expect(watchCellOf(ally, HOME)).toEqual({ x: 3, y: 1 });
    // vojsko na mapě sídla ve scéně – tam ho ukazuje scéna vsi sama
    expect(watchCellOf(campaign([man(1, HOME, { commander: true })]), HOME)).toBeNull();
    // konec tažení, nikdo na nohou
    expect(watchCellOf(campaign([man(1, AWAY)], { phase: 'done' }), HOME)).toBeNull();
    expect(watchCellOf(campaign([man(1, AWAY, { status: 'captive' })]), HOME)).toBeNull();
    // odříznuté sídlo – jakákoli mapa vojska
    expect(watchCellOf(campaign([man(1, HOME)]), null)).toEqual(HOME);
  });

  it('scéna jde za vojskem na další mapu; konec tažení a návrat domů = zpět na ves', () => {
    const NEXT = { x: 2, y: 0 };
    // velitel přešel na sousední mapu – scéna za ním
    expect(followCellOf(campaign([man(1, NEXT, { commander: true })]), AWAY, HOME)).toEqual(NEXT);
    // vojsko přišlo na mapu sídla ve scéně, tažení skončilo, nikdo nestojí – zpět na ves
    expect(followCellOf(campaign([man(1, HOME, { commander: true })]), AWAY, HOME)).toBeNull();
    expect(followCellOf(campaign([man(1, NEXT)], { phase: 'done' }), AWAY, HOME)).toBeNull();
    expect(followCellOf(campaign([man(1, NEXT, { status: 'fallen' })]), AWAY, HOME)).toBeNull();
    // pohled ho má pořád na téže mapě – nic nového, zpět na ves
    expect(followCellOf(campaign([man(1, AWAY)]), AWAY, HOME)).toBeNull();
  });

  it('na cizí mapě závoj mlhy ze strany hráče, na vlastní ne', () => {
    const view: WarSceneView = {
      ...BASE,
      side: 'attack',
      battle: null,
      march: {
        members: [{ line: false, mounted: false, wounded: false, group: 0, status: 'active' }],
        groups: [
          {
            id: 0,
            order: 'follow-leader',
            pos: { x: 5, z: 6 },
            arrived: true,
            heading: { x: 0, z: 1 },
          },
        ],
      },
    };
    expect(sceneWarOf(view, OFFICIAL_WORLD, true)?.fog).toEqual({ side: 'attack' });
    expect(sceneWarOf(view, OFFICIAL_WORLD)?.fog).toBeNull();
    expect(armyFocusOf(view)).toEqual({ x: 5, z: 6 });
  });

  it('cizí ves jen z poslaných domů – stojící, bez lidí a polí', () => {
    expect(foreignVillageOf(undefined)).toBeNull();
    expect(foreignVillageOf([])).toBeNull();
    const village = foreignVillageOf([
      { id: 7, type: 'zemnice', position: { x: 60, z: 0, rotation: 1 } },
    ]);
    expect(village).toEqual({
      dwellings: [
        {
          id: 7,
          type: 'zemnice',
          position: { x: 60, z: 0, rotation: 1 },
          built: true,
          progress: 1,
        },
      ],
      fields: [],
    });
  });

  it('pohled na vojsko: první vlastní bojovník na nohou', () => {
    const view: WarSceneView = {
      ...BASE,
      side: 'attack',
      battle: {
        ticks: 1,
        outcome: 'ongoing',
        fighters: [
          { ...fighter('d:1', 'defend', 50) },
          { ...fighter('a:0', 'attack', 10), state: 'down' },
          fighter('a:1', 'attack', 20),
        ],
        groups: [],
        closedGates: [],
        breaches: [],
        ladders: [],
        walls: [],
      },
      march: null,
    };
    expect(armyFocusOf(view)).toEqual({ x: 20, z: 0 });
  });
});
