import { describe, expect, it } from 'vitest';
import { createVillagerPose, route, shuttle, stand } from '../villager-motion';
import { shuttleErrand } from '../villager-errands';
import {
  activityPose,
  castTimeline,
  FIRE_REACH_M,
  HISTORY_S,
  interruptOf,
  scheduleAt,
  type Activity,
  type DayCast,
  type PersonTask,
  type ScheduleInput,
} from '../villager-schedule';
import { straightWalk } from './straight-walk';
import { Timetable } from '../villager-timetable';

// Události přerušují (villagers.md – Činnosti od začátku do konce, Události; úloha 5): pohřeb,
// svatba, karavana a jízda přeruší rozběhnutou činnost hned, k požáru jen kdo je blízko, z povodně
// domů; po události domů a dál podle rozvrhu.

const ID = 202;
const DOOR = { x: 0, z: 0 };
const T0 = 100_000;
const DAY_S = 86.4;
const SPEED = 1.25;

/** Pochůzka pro vodu 300 m od dveří (cyklus ≈ 9 minut). */
function waterTask(): PersonTask {
  const r = route([
    [0, 0],
    [300, 0],
  ]);
  const options = {
    outClip: 'carry-water' as const,
    outSpeed: 1.1,
    endClip: 'water-idle' as const,
    endS: 5,
    backClip: 'carry-water' as const,
    backSpeed: 1.1,
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
    at: { x: 300, z: 0 },
  };
}

/** Práce na místě (žně) v bodě `at`. */
function reapTask(at: { x: number; z: number }): PersonTask {
  return {
    key: `share:harvest:${at.x}`,
    job: { kind: 'share', activity: 'harvest', target: { kind: 'field', id: 4 } },
    kind: 'bout',
    range: 'long',
    pose: stand(at.x, at.z, 1, 0, 'reap'),
    errand: null,
    at,
  };
}

/** Událost u bodu `at` (pohřeb – stojí v kruhu; požár – řetěz s vědry). */
function eventTask(kind: 'funeral' | 'fire', at: { x: number; z: number }): PersonTask {
  const job = kind === 'funeral' ? { kind, bearer: false } : { kind };
  return {
    key: `${kind}:7:${ID}`,
    job: job as PersonTask['job'],
    kind: 'hold',
    range: 'long',
    pose: stand(at.x, at.z, 1, 0, 'idle'),
    errand: null,
    at,
    interrupt: interruptOf(job as PersonTask['job'], false)!,
  };
}

function timetable(days: DayCast[]): Timetable {
  const tt = new Timetable(3, SPEED);
  tt.setDoors(new Map([[ID, DOOR]]));
  days.forEach((cast, i) => tt.setDay(i + 1, T0 + i * DAY_S, cast));
  return tt;
}

/** První činnost, pro kterou platí `test`, v `from` nebo po něm (krok 5 s). */
function find(tt: Timetable, from: number, test: (a: Activity) => boolean): Activity {
  for (let s = from; s < from + 4 * HISTORY_S; s += 5) {
    const a = tt.activity(ID, s);
    if (test(a)) return a;
  }
  throw new Error('činnost nenalezena');
}

function poseAt(tt: Timetable, t: number): ReturnType<typeof createVillagerPose> {
  return tt.pose(ID, t, [], createVillagerPose());
}

describe('události přerušují (villager-schedule.ts – settle, nextActivity)', () => {
  it('druh přerušení: pohřeb, svatba, karavana a jezdec hned, požár jen blízko', () => {
    expect(interruptOf({ kind: 'funeral', bearer: true }, false)).toBe('all');
    expect(interruptOf({ kind: 'wedding', role: 'guest' }, false)).toBe('all');
    expect(interruptOf({ kind: 'caravan', trip: null, porter: true }, false)).toBe('all');
    expect(interruptOf({ kind: 'lord', household: false }, true)).toBe('all');
    expect(interruptOf({ kind: 'fire' }, false)).toBe('near');
    expect(interruptOf({ kind: 'elder' }, false)).toBeUndefined();
  });

  it('pohřeb přeruší pochůzku hned – z místa, kde je, jde pěšky k pohřbu, pak domů', () => {
    const water = waterTask();
    const funeral = eventTask('funeral', { x: -60, z: 20 });
    const days: DayCast[] = [new Map([[ID, water]])];
    const tt = timetable(days);
    // pochůzka rozběhnutá v nejnovějším dni, pak den s pohřbem a den bez něj
    const errand = find(tt, T0 + HISTORY_S, (a) => a.kind === 'errand' && a.end - a.start > 400);
    const cutAt = errand.start + 200;
    const tt2 = new Timetable(3, SPEED);
    tt2.setDoors(new Map([[ID, DOOR]]));
    tt2.setDay(1, T0, new Map([[ID, water]]));
    tt2.setDay(2, cutAt, new Map([[ID, funeral]]));
    tt2.setDay(3, cutAt + 600, new Map([[ID, reapTask({ x: 30, z: 40 })]]));
    const before = tt2.activity(ID, cutAt - 1);
    expect(before.kind).toBe('errand');
    expect(before.end).toBe(cutAt);
    expect(before.cut?.by?.key).toBe(funeral.key);
    // hned po přerušení u vody, ne u dveří – odtud jde k pohřbu
    const after = tt2.activity(ID, cutAt + 1);
    expect(after.task?.key).toBe(funeral.key);
    expect(after.start).toBe(cutAt);
    expect(after.from).toBeDefined();
    expect(Math.hypot(after.from!.x, after.from!.z)).toBeGreaterThan(50);
    const p0 = poseAt(tt2, cutAt + 0.01);
    expect(Math.hypot(p0.x - after.from!.x, p0.z - after.from!.z)).toBeLessThan(1);
    expect(p0.clip).toBe('walk');
    // chůze z místa přerušení k pohřbu tempem chůze
    const walk = Math.hypot(after.from!.x + 60, after.from!.z - 20) / SPEED;
    expect(after.arrive - after.start).toBeCloseTo(walk, 3);
    const there = poseAt(tt2, after.arrive + 1);
    expect(Math.hypot(there.x + 60, there.z - 20)).toBeLessThan(0.5);
    // po pohřbu (den 3 ho nedává) domů a dál podle rozvrhu
    expect(after.end).toBeLessThan(Infinity);
    expect(tt2.activity(ID, after.end + 1).kind).toBe('home');
    const next = find(tt2, after.end, (a) => a.kind === 'bout');
    expect(next.task?.key).toBe('share:harvest:30');
  });

  it('k události jde z místa, kde ho zastihla i u kroku jinde (paběrky) – bez skoku', () => {
    // nečinný o žních: u místa úlohy, pak paběrky u žnečů 30 m dál (villager-phases.ts – `idle`)
    const site = { x: 20, z: 0 };
    const aid = { x: 20, z: 30 };
    const idle: PersonTask = { ...reapTask(site), key: 'idle:0', role: 'idle', places: { aid } };
    const tt = timetable([new Map([[ID, idle]])]);
    let cutAt = NaN;
    for (let s = T0 + HISTORY_S; s < T0 + 5 * HISTORY_S && Number.isNaN(cutAt); s += 5) {
      const phase = tt.phase(ID, s);
      if (phase.name === 'glean' && phase.at) cutAt = Math.round((phase.from + phase.to) / 2);
    }
    expect(cutAt).not.toBeNaN();
    // pohřeb: jde z paběrků, ne od místa úlohy
    const funeral = timetable([new Map([[ID, idle]])]);
    funeral.setDay(2, cutAt, new Map([[ID, eventTask('funeral', { x: -60, z: 20 })]]));
    const before = poseAt(funeral, cutAt - 0.01);
    expect(Math.hypot(before.x - aid.x, before.z - aid.z)).toBeLessThan(2);
    const after = funeral.activity(ID, cutAt + 1);
    expect(after.start).toBe(cutAt);
    expect(Math.hypot(after.from!.x - before.x, after.from!.z - before.z)).toBeLessThan(0.5);
    const p0 = poseAt(funeral, cutAt + 0.01);
    expect(Math.hypot(p0.x - before.x, p0.z - before.z)).toBeLessThan(0.5);
    // požár na dosah od paběrků, ale ne od místa úlohy – dosah od skutečného místa
    const fireAt = { x: aid.x, z: aid.z + FIRE_REACH_M - 5 };
    expect(Math.hypot(fireAt.x - site.x, fireAt.z - site.z)).toBeGreaterThan(FIRE_REACH_M);
    const fire = timetable([new Map([[ID, idle]])]);
    fire.setDay(2, cutAt, new Map([[ID, eventTask('fire', fireAt)]]));
    expect(fire.activity(ID, cutAt - 1).end).toBe(cutAt);
    expect(fire.activity(ID, cutAt + 1).task?.key).toBe('fire:7:202');
  });

  it('k požáru jdou jen lidé blízko – vzdálený dokončí práci na poli', () => {
    const fire = eventTask('fire', { x: 10, z: -10 });
    for (const [at, cut] of [
      [{ x: 40, z: 30 }, true],
      [{ x: FIRE_REACH_M + 200, z: 0 }, false],
    ] as const) {
      const work = reapTask(at);
      const tt = timetable([new Map([[ID, work]])]);
      const bout = find(tt, T0 + HISTORY_S, (a) => a.kind === 'bout');
      const mid = (bout.arrive + bout.leave) / 2;
      const tt2 = timetable([new Map([[ID, work]])]);
      tt2.setDay(2, mid, new Map([[ID, fire]]));
      const a = tt2.activity(ID, mid - 1);
      expect(a.kind).toBe('bout');
      expect(a.end === mid).toBe(cut);
      if (!cut) {
        // dokončí a pak jde k požáru z domu
        expect(a.end).toBe(bout.end);
        const later = find(tt2, a.end, (x) => x.task?.key === fire.key);
        expect(later.from).toBeUndefined();
      }
    }
  });

  it('povodeň: kdo má práci pod vodou, jde od přelomu dne domů; na vodu nikdo nevyjde', () => {
    const work = reapTask({ x: 80, z: 60 });
    const tt = timetable([new Map([[ID, work]])]);
    const bout = find(tt, T0 + HISTORY_S, (a) => a.kind === 'bout');
    const mid = (bout.arrive + bout.leave) / 2;
    const wetFrom = mid;
    const tt2 = timetable([new Map([[ID, work]])]);
    tt2.setWet((x, _z, t) => t >= wetFrom && x > 50);
    tt2.setDay(2, mid, new Map([[ID, work]]));
    const a = tt2.activity(ID, mid - 1);
    expect(a.end).toBe(mid);
    const back = tt2.activity(ID, mid + 1);
    expect(back.retreat).toBe(true);
    const p = poseAt(tt2, mid + 0.01);
    expect(Math.hypot(p.x - 80, p.z - 60)).toBeLessThan(1);
    expect(p.stage).toBe('back');
    const door = poseAt(tt2, back.end - 0.01);
    expect(Math.hypot(door.x, door.z)).toBeLessThan(2);
    // dokud je pod vodou, k práci nevyjde
    for (let s = back.end; s < back.end + 900; s += 30) {
      expect(tt2.activity(ID, s).kind).toBe('home');
    }
  });

  it('řetězy s událostmi z různých počátků splynou (stejný čas = stejná činnost)', () => {
    const water = waterTask();
    const funeral = eventTask('funeral', { x: -60, z: 20 });
    const days = Array.from({ length: 30 }, (_, i) => ({
      from: T0 + i * DAY_S * 4,
      cast: new Map([[ID, i % 9 === 4 ? funeral : i % 2 ? water : reapTask({ x: 20, z: 30 })]]),
    }));
    const doors = (): { x: number; z: number } => DOOR;
    const input: ScheduleInput = {
      seed: 11,
      castOf: castTimeline(days),
      lengthOf: straightWalk(doors, SPEED),
      doorOf: doors,
      walkS: (a, b) => Math.hypot(b.x - a.x, b.z - a.z) / SPEED,
    };
    let same = 0;
    let total = 0;
    for (let k = 0; k < 40; k++) {
      const t = T0 + HISTORY_S * 2 + k * 97.3;
      const a = scheduleAt(input, ID, t);
      const b = scheduleAt(input, ID, t, t - 2 * HISTORY_S - 410);
      total++;
      if (a.start === b.start && a.end === b.end && a.task?.key === b.task?.key) same++;
      // póza z činnosti je čistá funkce času
      const pa = activityPose(a, DOOR)(t, [], createVillagerPose());
      const pb = activityPose(a, DOOR)(t, [], createVillagerPose());
      expect([pa.x, pa.z]).toEqual([pb.x, pb.z]);
    }
    expect(same).toBe(total);
  });
});

describe('délka ze sítě pěšin, přesná trasa jen při kreslení (úloha 6)', () => {
  it('délka chůze z odhadu sítě; trasa se hledá až pro kreslenou pózu a dorazí v čase', () => {
    const work = reapTask({ x: 60, z: 80 });
    const tt = timetable([]);
    // odhad sítě: 1,5× rovně (objížďka)
    tt.setEstimate((a, b) => 1.5 * Math.hypot(b.x - a.x, b.z - a.z));
    let calls = 0;
    // přesná trasa do L: nejdřív po x, pak po z
    tt.setRouter((_id, from, to) => {
      calls++;
      return route([
        [from.x, from.z],
        [to.x, from.z],
        [to.x, to.z],
      ]);
    });
    tt.setDay(1, T0, new Map([[ID, work]]));
    const bout = find(tt, T0 + HISTORY_S, (a) => a.kind === 'bout');
    expect(bout.arrive - bout.start).toBeCloseTo((1.5 * 100) / SPEED, 3);
    // rozvrh bez kreslení trasu nehledá
    expect(calls).toBe(0);
    const mid = (bout.start + bout.arrive) / 2;
    const p = poseAt(tt, mid);
    expect(calls).toBe(1);
    // v půli času v půli trasy (70 m z 140 m: 60 po x, 10 po z)
    expect(p.x).toBeCloseTo(60, 3);
    expect(p.z).toBeCloseTo(10, 3);
    // trasa 140 m za čas odhadu 150 m – nohy o kus pomaleji
    expect(p.pace).toBeCloseTo(140 / 150, 3);
    poseAt(tt, mid + 1);
    expect(calls).toBe(1);
    const there = poseAt(tt, bout.arrive + 0.5);
    expect([there.x, there.z]).toEqual([60, 80]);
    // cesta domů – druhý úsek, jedno hledání
    poseAt(tt, (bout.leave + bout.end) / 2);
    expect(calls).toBe(2);
  });
});
