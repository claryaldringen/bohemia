import { describe, expect, it } from 'vitest';
import {
  dateOfDayIndex,
  OFFICIAL_WORLD,
  realTimeOf,
  type WarSceneFighter,
  type WarSceneView,
} from '@bohemia/game';
import { sceneWarOf } from '../war-scene-view';

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
          fighters: [fighter('d:1', 'defend', 10), fighter('a:0', 'attack', 60)],
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
    expect(war?.march?.groups[0]).toEqual({
      id: 0,
      order: 'attack-all',
      pos: { x: 5, z: 5 },
      arrived: false,
      heading: { x: 1, z: 0 },
    });
  });
});
