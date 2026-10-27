import { describe, expect, it } from 'vitest';
import type { ChronicleEvent, VillageState } from '@bohemia/game';
import { charredRuinKeys, sceneFire } from '../fire-view';

type FireState = Pick<VillageState, 'chronicle' | 'dwellings' | 'ruins' | 'disasters'>;

function state(): FireState {
  const event = {
    day: 20,
    kind: 'fire',
    startedDwellingId: 1,
    burnedDwellingIds: [1, 2],
    lostGrainKg: 0,
    lostMeatKg: 0,
    lostCheeseKg: 0,
    lostHayKg: 0,
  } as ChronicleEvent;
  return {
    chronicle: [{ ...event, day: 5 }, event],
    // obydlí 2 přežilo poškozené, 1 se zřítilo (zbytek jámy téhož dne)
    dwellings: [{ id: 2, type: 'zemnice', position: { x: 10, z: 0, rotation: 0 } }] as never,
    ruins: [{ id: 1, type: 'polozemnice', position: { x: 0, z: 0, rotation: 0.5 }, day: 20 }],
    disasters: {
      fireFight: {
        day: 20,
        dwellingId: 1,
        water: { x: 0, z: -40 },
        distanceM: 40,
        people: 20,
        spacingM: 2,
        efficiency: 1,
      },
    },
  };
}

describe('požár pro scénu (fire-view.ts)', () => {
  it('jen v den požáru: hořící stavby ze zápisu kroniky a řetěz z plánu hašení', () => {
    const fire = sceneFire(state(), 20)!;
    expect(fire.burning.map((b) => [b.id, b.x, b.started ?? false])).toEqual([
      [1, 0, true],
      [2, 10, false],
    ]);
    expect(fire.chain).toEqual({
      water: { x: 0, z: -40 },
      target: { x: 0, z: 0 },
      people: 20,
      spacingM: 2,
    });
    expect(sceneFire(state(), 21)).toBeNull();
    expect(sceneFire(state(), 19)).toBeNull();
  });

  it('bez vody řetěz chybí, plán jiného dne neplatí', () => {
    const dry = state();
    dry.disasters!.fireFight!.water = null;
    expect(sceneFire(dry, 20)!.chain).toBeUndefined();
    const old = state();
    old.disasters!.fireFight!.day = 19;
    expect(sceneFire(old, 20)!.chain).toBeUndefined();
  });

  it('ohořelé zbytky jam podle zápisů požárů', () => {
    const keys = charredRuinKeys(state());
    expect(keys.has('1@20')).toBe(true);
    expect(keys.has('2@20')).toBe(true);
    expect(keys.has('1@5')).toBe(true);
    expect(keys.has('3@20')).toBe(false);
  });
});
