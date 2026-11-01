import { describe, expect, it } from 'vitest';
import { createVillagerPose, route, shuttle, stand } from '../villager-motion';
import { shuttleErrand } from '../villager-errands';
import { GRID_S, HISTORY_S, type Activity, type PersonTask } from '../villager-schedule';
import { dayExtent, MAX_DAYS, scheduledState, Timetable } from '../villager-timetable';
import { personActivity, type PersonFigureState } from '../../person-activity';
import { selectionDetails } from '../../selection-details';
import type { SceneVillage } from '../../village-view';

// Rozvrhy lidí ve scéně (villagers.md – Činnosti od začátku do konce, úloha 3): přelom dne
// činnost nepřeruší, výběr postavy čte činnost z rozvrhu a zruší se, když postava zajde domů.

const DOOR = { x: 0, z: 0 };
const T0 = 100_000;
const DAY_S = 86.4;

/** Pochůzka pro vodu: 100 m k vodě, 5 s nabírá, zpět (cyklus `shuttle` jako ve scéně). */
function waterTask(): PersonTask {
  const r = route([
    [0, 0],
    [100, 0],
  ]);
  const options = {
    outClip: 'carry-water' as const,
    outSpeed: 1,
    endClip: 'water-idle' as const,
    endS: 5,
    backClip: 'carry-water' as const,
    backSpeed: 1,
    restClip: 'idle' as const,
    restS: 40,
    phase: 0.37,
    restHidden: true,
  };
  return {
    key: 'traffic:water:0',
    job: { kind: 'traffic', traffic: 'water' },
    kind: 'errand',
    range: 'long',
    pose: shuttle(r, options),
    errand: shuttleErrand(r, options),
    at: { x: 100, z: 0 },
  };
}

/** Žně na řadě pole 50 m od dveří (práce na místě). */
function reapTask(): PersonTask {
  return {
    key: 'share:harvest:0',
    job: { kind: 'share', activity: 'harvest', target: { kind: 'field', id: 4 } },
    kind: 'bout',
    range: 'long',
    pose: stand(30, 40, 1, 0, 'reap'),
    errand: null,
    at: { x: 30, z: 40 },
  };
}

function timetable(): Timetable {
  const tt = new Timetable(3, 1.25);
  tt.setDoors(new Map([[202, DOOR]]));
  return tt;
}

/** První činnost druhu `kind` v `t` nebo po něm (krok 10 s). */
function nextOf(tt: Timetable, kind: Activity['kind'], t: number): Activity {
  for (let s = t; s < t + 4 * HISTORY_S; s += 10) {
    const a = tt.activity(202, s);
    if (a.kind === kind) return a;
  }
  throw new Error(`žádná činnost ${kind}`);
}

describe('rozvrhy ve scéně (villager-timetable.ts)', () => {
  it('postava nepřeruší pochůzku na přelomu dne – novou práci vybere až při dalším vyjití', () => {
    const tt = timetable();
    const water = waterTask();
    tt.setDay(1, T0, new Map([[202, water]]));
    const a = nextOf(tt, 'errand', T0 + HISTORY_S);
    const mid = (a.start + a.end) / 2;
    const out = createVillagerPose();
    const before = { ...tt.pose(202, mid, [], out) };
    // nový den uprostřed pochůzky – žně místo vody
    tt.setDay(2, mid - 1, new Map([[202, reapTask()]]));
    expect(tt.activity(202, mid)).toEqual(a);
    expect(tt.pose(202, mid, [], out)).toMatchObject({ x: before.x, z: before.z });
    expect(tt.activity(202, a.end - 1).task?.key).toBe(water.key);
    // doma po pochůzce, pak vyjde na žně (obsazení dne v okamžik vyjití)
    expect(tt.activity(202, a.end).kind).toBe('home');
    const next = nextOf(tt, 'bout', a.end);
    expect(next.start).toBeGreaterThanOrEqual(a.end + 30);
    expect(next.task?.key).toBe('share:harvest:0');
  });

  it('kdo je doma, vyjde podle nového dne; úloha u objektu skončí, když ji nový den nedává', () => {
    const tt = timetable();
    const herd: PersonTask = {
      ...reapTask(),
      key: 'herd:0',
      kind: 'hold',
      job: { kind: 'herd', herd: 0 },
    };
    tt.setDay(1, T0, new Map([[202, herd]]));
    const a = nextOf(tt, 'hold', T0 + HISTORY_S);
    expect(a.end).toBe(Infinity);
    const from = a.arrive + 200;
    tt.setDay(2, from, new Map());
    const held = tt.activity(202, from - 1);
    expect(held.task?.key).toBe('herd:0');
    // 50 m domů po 1,25 m/s = 40 s, konec na mřížce
    expect(held.end).toBe(Math.ceil((from + 40) / GRID_S - 1e-9) * GRID_S);
    // pak doma – nový den mu nic nedává
    expect(tt.activity(202, held.end + 1)).toMatchObject({ kind: 'home', end: Infinity });
  });

  it('nejvýš MAX_DAYS dnů; týž den nahradí obsazení, začátek zůstane', () => {
    const tt = timetable();
    for (let d = 0; d < MAX_DAYS + 5; d++) tt.setDay(d, T0 + d * DAY_S, new Map());
    expect(tt.dayCount).toBe(MAX_DAYS);
    tt.setDay(MAX_DAYS + 4, T0, new Map([[202, reapTask()]]));
    expect(tt.dayCount).toBe(MAX_DAYS);
    expect(tt.input.castOf(T0 + (MAX_DAYS + 4) * DAY_S + 1).cast.has(202)).toBe(true);
  });

  it('stejný čas = stejná činnost, ať se rozvrh posouval po snímcích, nebo počítal naráz', () => {
    const stepped = timetable();
    const fresh = timetable();
    const cast = new Map([[202, waterTask()]]);
    stepped.setDay(1, T0, cast);
    fresh.setDay(1, T0, cast);
    const t = T0 + 2 * HISTORY_S;
    for (let s = T0 + HISTORY_S; s < t; s += 7) stepped.activity(202, s);
    expect(stepped.activity(202, t)).toEqual(fresh.activity(202, t));
  });

  it('obal dne (dveře a místa úloh) pokryje každou pózu – i kdo vyjde, když jsou všichni doma', () => {
    const tt = new Timetable(3, 1.25);
    const doors = new Map([
      [202, DOOR],
      [203, { x: -40, z: 10 }],
    ]);
    tt.setDoors(doors);
    // druhý: nečinný o žních – u místa úlohy a paběrky jinde (krok jinde)
    const idle: PersonTask = {
      ...reapTask(),
      key: 'idle:0',
      role: 'idle',
      places: { aid: { x: -20, z: 90 } },
    };
    const cast = new Map([
      [202, waterTask()],
      [203, idle],
    ]);
    tt.setDay(1, T0, cast);
    const box = dayExtent(cast, doors.values())!;
    expect(box).toEqual({ minX: -40, maxX: 100, minZ: 0, maxZ: 90 });
    const out = createVillagerPose();
    let seen = 0;
    for (let s = T0 + HISTORY_S; s < T0 + 3 * HISTORY_S; s += 3) {
      for (const id of [202, 203]) {
        const p = tt.pose(id, s, [], out);
        if (p.hidden) continue;
        seen++;
        expect(p.x).toBeGreaterThanOrEqual(box.minX - 1e-6);
        expect(p.x).toBeLessThanOrEqual(box.maxX + 1e-6);
        expect(p.z).toBeGreaterThanOrEqual(box.minZ - 1e-6);
        expect(p.z).toBeLessThanOrEqual(box.maxZ + 1e-6);
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect(dayExtent(new Map(), [null])).toBeNull();
  });
});

describe('výběr postavy z rozvrhu (scheduledState)', () => {
  it('výběr se zruší, když postava zajde do domu – u vojvody ne', () => {
    const tt = timetable();
    tt.setDay(1, T0, new Map([[202, waterTask()]]));
    const a = nextOf(tt, 'errand', T0 + HISTORY_S);
    const water = a.task!.job;
    expect(scheduledState(a, a.start + 1, false, false)).toEqual({
      job: water,
      leg: null,
      home: false,
      indoors: false,
      phase: null,
    });
    // po návratu (cyklus `homeS`) je doma – byl venku, výběr se zruší
    const inside = a.start + a.task!.errand!.homeS + 1;
    expect(tt.indoors(202, inside)).toBe(true);
    expect(scheduledState(a, inside, true, false)).toMatchObject({ home: true, indoors: true });
    // vojvoda: výběr zůstane, panel „doma“
    expect(scheduledState(a, inside, true, true)).toMatchObject({
      job: null,
      home: true,
      indoors: false,
    });
    // vybraný doma (ze seznamu) – výběr zůstane, dokud nevyjde a zase nezajde
    expect(scheduledState(a, inside, false, false).indoors).toBe(false);
  });
});

describe('popisek vybrané postavy odpovídá činnosti rozvrhu', () => {
  const VILLAGE: SceneVillage = {
    dwellings: [
      { id: 2, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    ],
    fields: [],
    labor: {
      day: 1000,
      month: 7,
      people: { children: 0, adults: 1, elders: 0 },
      shares: [],
      persons: [{ id: 202, age: 28, sex: 'female', home: 2, role: 'farmer-wife' }],
    },
  };

  /** Stav panelu jako ve villagers.ts: úloha a cesta z rozvrhu, úsek a skrytí z pózy. */
  function panel(tt: Timetable, t: number): { role: string; activity: string } {
    const a = tt.activity(202, t);
    const s = scheduledState(a, t, true, false);
    const pose = tt.pose(202, t, [], createVillagerPose());
    const state: PersonFigureState = {
      id: 202,
      job: s.job,
      stage: pose.stage ?? null,
      hidden: pose.hidden === true,
      herd: null,
      leg: s.leg,
    };
    const details = selectionDetails(null, VILLAGE, { kind: 'person', id: 202 }, state);
    if (details?.kind !== 'person') throw new Error('panel postavy');
    return { role: details.role, activity: personActivity(state, VILLAGE) };
  }

  it('„žena rolníka – jde pro vodu“ celou cestu tam, „nese vodu“ zpět, pak „doma“', () => {
    const tt = timetable();
    tt.setDay(1, T0, new Map([[202, waterTask()]]));
    const a = nextOf(tt, 'errand', T0 + HISTORY_S);
    expect(panel(tt, a.start + 10)).toEqual({ role: 'Žena rolníka', activity: 'jde pro vodu' });
    // přelom dne (jiná práce) – pořád pochůzka pro vodu
    tt.setDay(2, a.start + 20, new Map([[202, reapTask()]]));
    expect(panel(tt, a.start + 50).activity).toBe('jde pro vodu');
    expect(panel(tt, a.start + 150).activity).toBe('nese vodu');
    expect(panel(tt, a.start + a.task!.errand!.homeS + 1).activity).toBe('doma');
  });

  it('práce na místě: „jde na pole“, „žne“, „jde domů“', () => {
    const tt = timetable();
    tt.setDay(1, T0, new Map([[202, reapTask()]]));
    const a = nextOf(tt, 'bout', T0 + HISTORY_S);
    expect(panel(tt, a.start + 1).activity).toBe('jde na pole');
    expect(panel(tt, (a.arrive + a.leave) / 2).activity).toBe('žne');
    expect(panel(tt, (a.leave + a.end) / 2).activity).toBe('jde domů');
    expect(panel(tt, a.end + 1).activity).toBe('doma');
  });
});
