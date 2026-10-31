import { describe, expect, it } from 'vitest';
import { createVillagerPose, route, shuttle, stand } from '../villager-motion';
import { shuttleErrand } from '../villager-errands';
import { hash01 } from '../smoke-schedule';
import {
  BELL_S,
  GRID_S,
  HISTORY_S,
  MIN_WORK_S,
  PAUSE_S,
  WORK_RANGE_S,
  activities,
  activityPose,
  activityStage,
  bellAt,
  castTimeline,
  nextStart,
  scheduleAt,
  straightWalk,
  type Activity,
  type DayCast,
  type PersonTask,
  type ScheduleInput,
  type TaskKind,
  type TaskWalk,
} from '../villager-schedule';

// Rozvrh člověka (villagers.md – Činnosti od začátku do konce): čistá funkce času a obsazení dnů.

/** Herní den ≈ 86 s skutečného času. */
const DAY_S = 86.4;
const DAYS = 160;
const T0 = 1_000_000;

function task(key: string, kind: TaskKind, range: PersonTask['range'] = 'long'): PersonTask {
  return {
    key,
    job: { kind: 'elder' },
    kind,
    range,
    pose: stand(0, 0, 0, 1, 'idle'),
    errand: null,
    at: { x: 0, z: 0 },
  };
}

/**
 * Obsazení dne `d` pro lidi 1–`people`: lidé „u objektu“ (asi 15 %) ho mají většinu dnů po
 * dlouhých úsecích, ostatní mění úlohu po několika dnech (pochůzka, práce na místě, nic).
 */
function syntheticCast(d: number, people: number): DayCast {
  const cast = new Map<number, PersonTask>();
  for (let p = 1; p <= people; p++) {
    if (hash01(p, 1, 3) < 0.15) {
      const run = Math.floor(d / (20 + Math.floor(hash01(p, 2, 3) * 40)));
      if (hash01(p, run, 4) < 0.85) cast.set(p, task(`hold:${p}`, 'hold'));
      continue;
    }
    const epoch = Math.floor(d / (3 + Math.floor(hash01(p, 3, 3) * 8)));
    const r = hash01(p, epoch, 5);
    if (r < 0.15) continue;
    if (r < 0.5) cast.set(p, task(`errand:${p}:${Math.floor(r * 10)}`, 'errand'));
    else cast.set(p, task(`bout:${p}:${Math.floor(r * 10)}`, 'bout', r < 0.75 ? 'long' : 'short'));
  }
  return cast;
}

/** Délka chůze podle klíče úlohy: pochůzka 2–14 minut, chůze k práci 20–150 s. */
function lengthOf(_p: number, t: PersonTask): TaskWalk {
  let h = 0;
  for (const ch of t.key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = hash01(h, 9, 1);
  if (t.kind === 'errand') {
    const total = 120 + r * 720;
    return { outS: total * 0.45, endS: total * 0.1, backS: total * 0.45 };
  }
  return { outS: 20 + r * 130, endS: 0, backS: 20 + r * 130 };
}

function input(cast: (d: number) => DayCast = (d) => syntheticCast(d, 300)): ScheduleInput {
  const days = Array.from({ length: DAYS }, (_, d) => ({ from: T0 + d * DAY_S, cast: cast(d) }));
  return { seed: 7, castOf: castTimeline(days), lengthOf };
}

/** Co je v okamžik `t` vidět – druh, úloha, úsek a časy, které ho určují. */
function state(a: Activity, t: number): string {
  const stage = activityStage(a, t);
  const times =
    stage === 'out'
      ? `${a.start}-${a.arrive}`
      : stage === 'back'
        ? `${a.leave}-${a.end}`
        : `${a.end}`;
  return `${a.kind}:${a.task?.key ?? '-'}:${stage}:${times}`;
}

const INPUT = input();

/** Činnost bez objektu úlohy (jen klíč) – k porovnání činností z různých vstupů. */
function plain(a: Activity): Omit<Activity, 'task'> & { task: string | null } {
  return { ...a, task: a.task?.key ?? null };
}

describe('rozvrh člověka – čistá funkce času (villager-schedule.ts)', () => {
  it('stejný čas a vstup = stejná činnost; začátky a konce na mřížce', () => {
    for (let p = 1; p <= 60; p++) {
      const t = T0 + 4000 + p * 37;
      const a = scheduleAt(INPUT, p, t);
      expect(scheduleAt(INPUT, p, t)).toEqual(a);
      // jiný, stejně sestavený vstup (jiné objekty úloh) – stejná činnost
      expect(plain(scheduleAt(input(), p, t))).toEqual(plain(a));
      expect(a.start).toBeLessThanOrEqual(t);
      expect(a.end).toBeGreaterThan(t);
      expect(a.start % GRID_S).toBeCloseTo(0, 6);
      if (Number.isFinite(a.end)) expect(a.end % GRID_S).toBeCloseTo(0, 6);
    }
  });

  it('tentýž člověk a úloha po celou činnost – přelom dne ji nepřeruší', () => {
    let crossing = 0;
    for (let p = 1; p <= 80; p++) {
      for (const a of activities(INPUT, p, T0 + 3000)) {
        if (a.start > T0 + 9000) break;
        if (a.kind !== 'errand' && a.kind !== 'bout') continue;
        // činnost přes několik herních dní – v každém okamžiku stejná
        if (a.end - a.start > 2 * DAY_S) crossing++;
        for (let t = a.start; t < a.end; t += 13) {
          const at = scheduleAt(INPUT, p, t, T0 + 3000);
          expect(at).toEqual(a);
        }
      }
    }
    expect(crossing).toBeGreaterThan(50);
  });

  it('pochůzka je celá a nezávisí na obsazení po vyjití; další činnost podle dne, kdy začne', () => {
    // jiné obsazení od dne 60 – rozběhnuté činnosti beze změny
    const other = input((d) => (d < 60 ? syntheticCast(d, 300) : new Map()));
    const cut = T0 + 60 * DAY_S;
    let checked = 0;
    for (let p = 1; p <= 120; p++) {
      for (const a of activities(INPUT, p, T0)) {
        if (a.start >= cut) break;
        if (a.kind !== 'errand' || a.end <= cut) continue;
        const walk = lengthOf(p, a.task!);
        expect(a.end).toBe(
          Math.ceil((a.start + walk.outS + walk.endS + walk.backS) / GRID_S - 1e-9) * GRID_S,
        );
        expect(plain(scheduleAt(other, p, cut + 1, T0))).toEqual(plain(a));
        checked++;
        // úloha každé činnosti = obsazení dne, kdy začala
      }
      for (const a of activities(INPUT, p, T0)) {
        if (a.start > T0 + 8000) break;
        if (a.task) expect(INPUT.castOf(a.start).cast.get(p)).toBe(a.task);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('mezi činnostmi pauza doma 30–90 s (na mřížce), déle jen kvůli zvonu nebo bez úlohy', () => {
    let pauses = 0;
    for (let p = 1; p <= 100; p++) {
      let prev: Activity | null = null;
      for (const a of activities(INPUT, p, T0)) {
        if (a.start > T0 + 10_000) break;
        if (a.kind === 'home' && prev && prev.kind !== 'home' && Number.isFinite(a.end)) {
          expect(a.end - a.start).toBeGreaterThanOrEqual(PAUSE_S.from);
          // první pokus o vyjití po pauze; jinak bez úlohy, nebo se činnost nevešla před zvon
          const first = nextStart(INPUT.seed, p, a.start);
          const bell = bellAt(INPUT.seed, p, a.start);
          if (first < bell && INPUT.castOf(first).cast.has(p) && a.end <= bell) {
            expect(a.end).toBe(first);
            expect(a.end - a.start).toBeLessThanOrEqual(PAUSE_S.to + GRID_S);
            pauses++;
          }
        }
        prev = a;
      }
    }
    expect(pauses).toBeGreaterThan(200);
  });

  it('práce na místě: cesta tam, práce losem v rozsahu druhu (zvon ji smí zkrátit), cesta zpět', () => {
    let bouts = 0;
    for (let p = 1; p <= 100; p++) {
      for (const a of activities(INPUT, p, T0)) {
        if (a.start > T0 + 10_000) break;
        if (a.kind !== 'bout') continue;
        const work = a.leave - a.arrive;
        const range = WORK_RANGE_S[a.task!.range];
        expect(work).toBeLessThanOrEqual(range.to + GRID_S);
        expect(work).toBeGreaterThanOrEqual(MIN_WORK_S);
        // nikdy přes zvon
        expect(a.end).toBeLessThanOrEqual(bellAt(INPUT.seed, p, a.start + 1e-6));
        bouts++;
      }
    }
    expect(bouts).toBeGreaterThan(300);
  });

  it('úloha u objektu bez losované délky – drží ji, dokud ji obsazení dává, pak domů', () => {
    // pasák: dny 0–29 u stáda, od dne 30 nic
    const herd = task('herd:0', 'hold');
    const cast = (d: number): DayCast => new Map(d < 30 ? [[5, herd]] : []);
    const inp = input(cast);
    const a = scheduleAt(inp, 5, T0 + 10 * DAY_S, T0);
    expect(a.kind).toBe('hold');
    expect(a.leave).toBeGreaterThanOrEqual(T0 + 30 * DAY_S);
    expect(a.end).toBe(
      Math.ceil((T0 + 30 * DAY_S + lengthOf(5, herd).backS) / GRID_S - 1e-9) * GRID_S,
    );
    expect(a.end - a.start).toBeGreaterThan(BELL_S / 2);
    // pak doma – obsazení ho už nemá
    const after = scheduleAt(inp, 5, a.end + 1, T0);
    expect(after.kind).toBe('home');
    expect(after.end).toBe(Infinity);
    // obsazení ho dává i v nejnovějším dni – drží do odvolání
    const always = input(() => new Map([[5, herd]]));
    expect(scheduleAt(always, 5, T0 + 50 * DAY_S, T0).end).toBe(Infinity);
  });

  it('řetězy z různých počátků splynou před t – po načtení stránky jako nepřetržitý běh', () => {
    let compared = 0;
    for (let p = 1; p <= 300; p++) {
      for (let k = 0; k < 3; k++) {
        const t = T0 + HISTORY_S + 600 + hash01(p, k, 11) * (DAYS * DAY_S - HISTORY_S - 900);
        // nepřetržitý běh od začátku dnů, načtení v t − HISTORY_S a o něco dřív
        const run = scheduleAt(INPUT, p, t, T0);
        const loaded = scheduleAt(INPUT, p, t);
        // o něco dřív – až o dvě délky historie (dny před nejstarším jako nejstarší)
        const earlier = scheduleAt(INPUT, p, t, t - HISTORY_S - hash01(p, k, 12) * 2 * HISTORY_S);
        expect(state(loaded, t)).toBe(state(run, t));
        expect(state(earlier, t)).toBe(state(run, t));
        compared++;
      }
    }
    expect(compared).toBe(900);
  });

  it('zvon jednou za hodinu: dlouhá pochůzka je venku přes 80 % času (Martin 31. 10. 2026)', () => {
    // 12minutová pochůzka každý den – podíl času venku za 3 hodiny (návrh: ≈ 86 %)
    const water = task('errand:water', 'errand');
    const inp: ScheduleInput = {
      seed: 7,
      castOf: castTimeline([{ from: T0, cast: new Map([[1, water]]) }]),
      lengthOf: () => ({ outS: 330, endS: 60, backS: 330 }),
    };
    expect(BELL_S).toBe(55 * 60);
    expect(HISTORY_S).toBe(60 * 60);
    let outside = 0;
    const span = 3 * 3600;
    for (const a of activities(inp, 1, T0)) {
      if (a.start >= T0 + span) break;
      if (a.kind === 'errand') outside += Math.min(a.end, T0 + span) - a.start;
    }
    expect(outside / span).toBeGreaterThan(0.8);
  });

  it('obsazení podle času: dny před nejstarším známým jako nejstarší, nejnovější do odvolání', () => {
    const a: DayCast = new Map([[1, task('a', 'bout')]]);
    const b: DayCast = new Map([[1, task('b', 'bout')]]);
    const castOf = castTimeline([
      { from: 100, cast: a },
      { from: 200, cast: b },
    ]);
    expect(castOf(50)).toEqual({ cast: a, from: -Infinity, until: 200 });
    expect(castOf(150).cast).toBe(a);
    expect(castOf(200)).toEqual({ cast: b, from: 200, until: Infinity });
    expect(castTimeline([])(5).cast.size).toBe(0);
  });

  it('póza činnosti: ode dveří k práci, póza úlohy, zpět ke dveřím, doma skrytá', () => {
    const door = { x: 0, z: 0 };
    const row: PersonTask = {
      ...task('row', 'bout'),
      pose: stand(30, 40, 1, 0, 'reap'),
      at: { x: 30, z: 40 },
    };
    const cast: DayCast = new Map([[1, row]]);
    const inp: ScheduleInput = {
      seed: 3,
      castOf: castTimeline([{ from: 0, cast }]),
      lengthOf: straightWalk(() => door, 1.25),
    };
    const a = [...activities(inp, 1, 0)].find((x) => x.kind === 'bout')!;
    // 50 m po 1,25 m/s = 40 s tam i zpět
    expect(a.arrive - a.start).toBeCloseTo(40, 6);
    const pose = activityPose(a, door);
    const out = createVillagerPose();
    expect(pose(a.start, [], out)).toMatchObject({ x: 0, z: 0, clip: 'walk', stage: 'out' });
    expect(pose(a.start + 20, [], out)).toMatchObject({ x: 15, z: 20, stage: 'out' });
    expect(pose(a.arrive + 1, [], out)).toMatchObject({
      x: 30,
      z: 40,
      clip: 'reap',
      hidden: false,
    });
    const back = pose((a.leave + a.end) / 2, [], out);
    expect([back.x, back.z, back.stage]).toEqual([15, 20, 'back']);
    expect(pose(a.end, [], out).hidden).toBe(true);
    expect(activityPose({ ...a, kind: 'home', task: null }, door)(a.start, [], out).hidden).toBe(
      true,
    );
  });

  it('póza pochůzky: cyklus vyjde ze dveří v začátku činnosti, po návratu doma', () => {
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
    const water: PersonTask = {
      ...task('water', 'errand'),
      pose: shuttle(r, options),
      errand: shuttleErrand(r, options),
    };
    const inp: ScheduleInput = {
      seed: 3,
      castOf: castTimeline([{ from: 0, cast: new Map([[1, water]]) }]),
      lengthOf: straightWalk(() => null, 1),
    };
    const a = [...activities(inp, 1, 0)].find((x) => x.kind === 'errand')!;
    expect(a.end).toBe(Math.ceil((a.start + 205) / GRID_S - 1e-9) * GRID_S);
    const pose = activityPose(a, { x: 0, z: 0 });
    const out = createVillagerPose();
    expect(pose(a.start + 1, [], out)).toMatchObject({ stage: 'out' });
    expect(pose(a.start + 1, [], out).x).toBeCloseTo(1, 6);
    expect(pose(a.start + 102, [], out).stage).toBe('end');
    expect(pose(a.start + 150, [], out).stage).toBe('back');
    expect(pose(a.start + 206, [], out).hidden).toBe(true);
  });
});
