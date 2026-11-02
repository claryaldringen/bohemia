import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { SceneVillage } from '../../village-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { createVillagerPose, walkSpeed } from '../villager-motion';
import { planVillagersWithCrew, type VillagerGround } from '../villager-plan';
import { FIGURE_SCALE } from '../villager-plan-types';
import { Timetable } from '../villager-timetable';

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: () => null,
  treesIn: () => [],
};
const square = (cx: number, cy: number) => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown' as const,
});
const house = (id: number, x: number, z: number) => ({
  id,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  inhabited: true,
});
const MANOR = {
  cell: { x: 0, y: 0 },
  x: 0,
  z: 0,
  size: 15,
  variant: 'center' as const,
  yard: { cell: { x: 0, y: 1 }, x: 0, z: 15 },
};
const PEOPLE: RolePerson[] = [
  { id: 101, age: 35, sex: 'male', home: 1, spouse: 102 },
  { id: 102, age: 33, sex: 'female', home: 1, spouse: 101 },
  { id: 103, age: 10, sex: 'male', home: 1, father: 101, mother: 102 },
  { id: 201, age: 30, sex: 'male', home: 2, spouse: 202 },
  { id: 202, age: 28, sex: 'female', home: 2, spouse: 201 },
];
function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
  }));
}
const DAY_S = 86.4;
const D0 = 1000;
function village(day: number, field: boolean): SceneVillage {
  return {
    dwellings: [{ ...house(1, 0, 0), plot: MANOR }, house(2, -40, 0)],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    labor: {
      day,
      month: 8,
      people: { children: 1, adults: 4, elders: 0 },
      shares: [{ activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: field ? 3 : 1 }],
      homes: [1, 2].map((id) => ({ id, people: 3 })),
      persons: persons(),
      lord: {
        home: 1,
        lordId: 101,
        trainees: field
          ? [{ id: 103, bow: 2, combat: 1, riding: 0 }]
          : [
              { id: 101, bow: 1, combat: 1, riding: 0 },
              { id: 103, bow: 2, combat: 1, riding: 0 },
            ],
        household: [102],
      },
    },
  };
}

// Žně a den rodiny (lord.md – Kdy jde rodina na pole, bod 3; Ve scéně): ve žňový den jde
// vojvoda na pole mezi ostatní, jindy cvičí – přepnutí je činnost rozvrhu (villagers.md –
// Činnosti od začátku do konce): na pole dojde chůzí, z pole se vrátí, nikdy neskočí ani neběží.
describe('vojvoda o žních – mezi cvičištěm a polem chůzí', () => {
  it('dny na poli a dny výcviku se střídají – chůze nejvýš 1,3×, mizí jen ve dveřích', () => {
    const window = (d: number) => ({
      startMs: LIVESTOCK_EPOCH_MS + (d - D0) * DAY_S * 1000,
      endMs: LIVESTOCK_EPOCH_MS + (d - D0 + 1) * DAY_S * 1000,
    });
    const tt = new Timetable(7, walkSpeed('woman', 'walk', FIGURE_SCALE));
    const FASTEST = walkSpeed('man', 'walk-lord', FIGURE_SCALE) * 1.3;
    const DT = 0.25;
    const out = createVillagerPose();
    let prev: { x: number; z: number; hidden: boolean; lord: boolean } | null = null;
    const fast: string[] = [];
    const blinks: string[] = [];
    let onField = 0;
    let onYard = 0;
    for (let d = D0; d < D0 + 60; d++) {
      // po třech dnech žně / výcvik
      const v = village(d, Math.floor((d - D0) / 3) % 2 === 1);
      const plan = planVillagersWithCrew(v, GROUND, { seed: 7, herds: 0, dayWindow: window });
      const doors = new Map(persons().map((p) => [p.id, plan.doors.get(p.home) ?? null]));
      tt.setDoors(doors);
      tt.setDay(d, (d - D0) * DAY_S, plan.tasks);
      for (let t = (d - D0) * DAY_S; t < (d - D0 + 1) * DAY_S; t += DT) {
        out.hidden = false;
        const p = tt.pose(101, t, [], out);
        const cur = {
          x: p.x,
          z: p.z,
          hidden: p.hidden === true,
          lord: tt.activity(101, t).task?.job.kind === 'lord',
        };
        if (!cur.hidden && cur.x > 30) onField++;
        if (!cur.hidden && Math.abs(cur.x) < 7.5 && cur.z > 7.5) onYard++;
        if (prev && !prev.hidden && !cur.hidden) {
          const speed = Math.hypot(cur.x - prev.x, cur.z - prev.z) / DT;
          // den rodiny a přechody do něj a z něj (práci na poli hlídají testy rozvrhu)
          const lord = tt.activity(101, t).task?.job.kind === 'lord' || prev.lord;
          if (lord && speed > FASTEST) fast.push(`${t.toFixed(1)} ${speed.toFixed(1)} m/s`);
        }
        // zmizí a objeví se jen ve dveřích – u vchodu do dvorce (den rodiny) nebo u dveří rozvrhu
        if (prev && prev.hidden !== cur.hidden) {
          const door = doors.get(101)!;
          const at = cur.hidden ? prev : cur;
          const house = Math.abs(at.x) < 1 && Math.abs(at.z - 5) < 1;
          if (!house && Math.hypot(at.x - door.x, at.z - door.z) > 1) blinks.push(t.toFixed(1));
        }
        prev = cur;
      }
    }
    expect(fast).toEqual([]);
    expect(blinks).toEqual([]);
    // na poli i na cvičišti (dvůr dvorce) je vidět
    expect(onField).toBeGreaterThan(0);
    expect(onYard).toBeGreaterThan(0);
  });
});
