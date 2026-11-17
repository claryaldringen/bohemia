import { describe, expect, it } from 'vitest';
import type { ScenePerson } from '../../person-view';
import type { SceneLord } from '../../village-view';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { LORD_CYCLE, LORD_CYCLE_S } from '../lord-day';
import {
  groomCandidates,
  groomedHorses,
  groomRides,
  pickRideGroom,
  RideGrooms,
} from '../ride-grooms';
import { straightLeg } from '../rider-route';
import {
  createRideState,
  isLed,
  isRiding,
  leaderSpot,
  leadTimes,
  rideHorsePose,
  ridePlans,
  riderPose,
  withLead,
  type RidePlan,
  type RidePlanInput,
} from '../riders';
import { createVillagerPose, stand, type PoseFn } from '../villager-motion';
import { selfLead } from '../villager-plan-lord';
import type { PersonTask } from '../villager-schedule';
import { Timetable } from '../villager-timetable';

// Podkoní (D69 – Martin 15. 11. 2026: „Koně by měl nějaký podkoní (rolník) přivést ke dvorci“):
// kůň jde z ohrady ke kůlu a zpět jen s člověkem u sebe – podkoní z rozvrhu, bez rolníků jezdec.

const lordOf = (hours: number): SceneLord => ({
  home: 1,
  trainees: [],
  household: [],
  riders: [{ id: 10, horseId: 1, training: 40, hours }],
});
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + 86_400 };
const input = (lord: SceneLord): RidePlanInput => ({
  village: {
    fields: [
      { id: 1, parts: [{ x: 0, z: 40, size: 20 }] },
      { id: 2, parts: [{ x: 0, z: -40, size: 20 }] },
    ],
    trails: [],
    labor: { month: 6 },
  } as unknown as RidePlanInput['village'],
  lord,
  hitch: { x: 4, z: 0, headingX: 1, headingZ: 0 },
  homes: [{ x: 0, z: 0 }],
  leg: straightLeg,
  window,
});
const GATE = { x: 30, z: 20 };
const PENS = { pens: [{ id: 61, horses: [{ id: 1 }] }] } as never;
/** Čas (s) `s` sekund po začátku jízdy cyklu 3 dne rodiny. */
const ride = (s: number): number => 3 * LORD_CYCLE_S + LORD_CYCLE.ride + s;

function ledPlan(hours: number): RidePlan {
  return withLead(ridePlans(input(lordOf(hours)))[0]!, GATE, straightLeg);
}

/** Rolník 300 žne na poli 40 m od dveří (práce na místě). */
const DOOR = { x: 40, z: 30 };
function reapTask(at = { x: 60, z: -10 }): PersonTask {
  return {
    key: 'share:harvest:0',
    job: { kind: 'share', activity: 'harvest', target: { kind: 'field', id: 4 } },
    kind: 'bout',
    range: 'long',
    pose: stand(at.x, at.z, 1, 0, 'reap'),
    errand: null,
    at,
  };
}

/** Rozvrh rolníka 300 (dveře `door`, žne na `work`) s podkoním jízdy `plan`. */
function groomTable(plan: RidePlan, door = DOOR, work?: { x: number; z: number }): Timetable {
  const tt = new Timetable(3, 1.25);
  tt.setDoors(new Map([[300, door]]));
  tt.setDuties(new RideGrooms(groomRides([plan], PENS), [{ id: 300, door }]));
  tt.setDay(1, 0, new Map([[300, reapTask(work)]]));
  return tt;
}

const STEP = 0.25;

/**
 * Projde jízdu cyklu 3 po `STEP` s: kůň na cestě z ohrady a do ní má u sebe podkoního (u hlavy,
 * viditelného) a podkoní nikde nepřeskočí (z domu vyjde a vejde ve dveřích `door`). Vrátí, kolik
 * kroků byl kůň veden a kolik z nich jako úloha podkoního.
 */
function followRide(plan: RidePlan, tt: Timetable, door: { x: number; z: number }): number[] {
  const length = plan.lead!.length;
  const rideS = (plan.span![1] - plan.span![0]) / 1000;
  const state = createRideState();
  let prev: { x: number; z: number; hidden: boolean } | null = null;
  let led = 0;
  let duty = 0;
  for (let t = ride(-length / 1.2 - 700); t < ride(rideS + length / 1.2 + 300); t += STEP) {
    const p = tt.pose(300, t, [], createVillagerPose());
    const hidden = p.hidden === true;
    if (isLed(plan, t) && !isRiding(plan, t)) {
      led++;
      const horse = rideHorsePose(plan, t, state, createLivestockPose());
      expect(hidden, `${t}`).toBe(false);
      expect(dist(p, horse), `${t}`).toBeLessThan(1.5);
      if (tt.activity(300, t).task?.key.startsWith('groom:')) duty++;
    }
    if (prev && !prev.hidden && !hidden) {
      // chůze, žádný přeskok (rozvrh jde nejvýš 1,8× tempem chůze)
      expect(dist(p, prev) / STEP, `${t}`).toBeLessThan(3);
    } else if (prev && prev.hidden !== hidden) {
      expect(dist(hidden ? prev : p, door), `${t}`).toBeLessThan(1);
    }
    prev = { x: p.x, z: p.z, hidden };
  }
  return [led, duty];
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('podkoní vede koně z ohrady ke kůlu a zpět (D69)', () => {
  for (const [label, hours] of [
    ['dlouhá jízda – mezi tím se vrátí k práci', 2],
    ['krátká jízda – počká u kůlu', 0.5],
  ] as const) {
    it(`kůň má po celé cestě u sebe podkoního, ten dojde z místa, kde je, bez přeskoku (${label})`, () => {
      const plan = ledPlan(hours);
      const [led, duty] = followRide(plan, groomTable(plan), DOOR);
      // tam i zpět krokem koně a celou dobu jako podkoní (péče o koně)
      expect(led! * STEP).toBeGreaterThan((2 * plan.lead!.length) / 1.2);
      expect(duty).toBe(led);
    });
  }

  it('podkoní 300 m od branky je u ní dřív, než kůň vyjde, a po jízdě u kůlu dřív, než jezdec sesedne', () => {
    const plan = ledPlan(2);
    const door = { x: 330, z: 20 };
    const work = { x: 330, z: 60 };
    const tt = groomTable(plan, door, work);
    const w = leadTimes(plan, 3)!;
    const spot = { x: 0, z: 0, headingX: 0, headingZ: 1 };
    const gate = { ...leaderSpot(plan.lead!, 0, false, spot) };
    const hitch = { ...leaderSpot(plan.lead!, plan.lead!.length, true, spot) };
    for (const [t, at] of [
      [w.out - 1, gate],
      [w.dismount - 1, hitch],
    ] as const) {
      const p = tt.pose(300, t, [], createVillagerPose());
      expect(p.hidden ?? false, `${t}`).toBe(false);
      expect(dist(p, at), `${t}`).toBeLessThan(0.5);
      expect(tt.activity(300, t).task?.key.startsWith('groom:'), `${t}`).toBe(true);
    }
    const [led, duty] = followRide(plan, groomTable(plan, door, work), door);
    expect(led! * STEP).toBeGreaterThan((2 * plan.lead!.length) / 1.2);
    expect(duty).toBe(led);
  });

  it('mimo okna dělá podkoní svou práci a panel ho při vedení ukáže u koní', () => {
    const plan = ledPlan(2);
    const tt = groomTable(plan);
    // uprostřed jízdy (mezi vyvedením a odvedením) žne, nebo jde od dvorce k práci a domů
    const mid = tt.activity(300, ride(100));
    expect(mid.task?.key.startsWith('groom:') ?? false).toBe(false);
    const job = tt.activity(300, ride(-12)).task?.job;
    expect(job).toEqual({
      kind: 'share',
      activity: 'horse-care',
      groom: true,
      target: { kind: 'pen', id: 61 },
    });
  });
});

describe('kdo je podkoní (D69)', () => {
  const man = (id: number, home: number, role = 'farmer', age = 30): ScenePerson => ({
    id,
    age,
    sex: 'male',
    home,
    role: role as ScenePerson['role'],
  });

  it('dospělý muž mimo rodinu vojvody; ves bez rolníků nemá nikoho', () => {
    const lord: SceneLord = { ...lordOf(2), lordId: 10, home: 1 };
    const persons = [
      man(10, 1, 'voivode'),
      man(11, 1, 'voivode-son', 20),
      man(20, 2),
      man(21, 2, 'child', 8),
      { ...man(22, 3), sex: 'female' as const },
      man(23, 4, 'old-man', 70),
      man(24, 5, 'smith'),
      man(25, 2, 'farmer-son', 15),
    ];
    const dwellings = [{ id: 5, craft: 'smith' }] as never;
    // řemeslník (domácnost dílny) ne, patnáctiletý syn rolníka ano
    expect(groomCandidates(persons, lord, dwellings).map((p) => p.id)).toEqual([20, 25]);
    expect(groomCandidates(persons.slice(0, 2), lord)).toEqual([]);
    expect(groomedHorses([ledPlan(2)], 0).size).toBe(0);
    expect([...groomedHorses([ledPlan(2)], 1)]).toEqual([1]);
  });

  it('přednost má ten, koho rozvrh dne má u koní, jinak nejbližší volný; spřežení ne', () => {
    const ride = groomRides([ledPlan(2)], PENS)[0]!;
    const task = (job: PersonTask['job'], extra: Partial<PersonTask> = {}): PersonTask => ({
      ...reapTask(),
      key: JSON.stringify(job),
      job,
      ...extra,
    });
    const care = task({ kind: 'share', activity: 'horse-care', target: { kind: 'pen', id: 61 } });
    const near = { id: 1, door: { x: 5, z: 0 } };
    const far = { id: 2, door: { x: 90, z: 90 } };
    const cands = [near, far];
    expect(pickRideGroom(cands, new Map(), ride)).toBe(1);
    expect(pickRideGroom(cands, new Map([[2, care]]), ride)).toBe(2);
    const funeral = task({ kind: 'funeral' } as PersonTask['job'], { interrupt: 'all' });
    const plough = task({ kind: 'plough', team: 0, role: 'ploughman' }, { pose: null });
    expect(pickRideGroom(cands, new Map([[1, funeral]]), ride)).toBe(2);
    // kůň sám nejde: i ze svatby či pohřbu, když nikdo jiný není; od spřežení ne
    const pick = (a: PersonTask, b: PersonTask): number | null =>
      pickRideGroom(
        cands,
        new Map([
          [1, a],
          [2, b],
        ]),
        ride,
      );
    expect(pick(plough, funeral)).toBe(2);
    expect(pick(plough, plough)).toBeNull();
  });
});

describe('ves bez rolníků – koně vede jezdec sám (D69)', () => {
  it('jezdec dojde k brance, vyvede koně, nasedne a po jízdě ho odvede – bez přeskoku', () => {
    const plan = ledPlan(2);
    const rest = stand(-6, 4, 1, 0, 'idle');
    const mounted = riderPose(plan);
    const base: PoseFn = (t, herds, out) =>
      isRiding(plan, t) ? mounted(t, herds, out) : rest(t, herds, out);
    const pose = selfLead(base, plan, 1.3);
    const state = createRideState();
    const length = plan.lead!.length;
    const rideS = (plan.span![1] - plan.span![0]) / 1000;
    let prev: { x: number; z: number; riding: boolean } | null = null;
    let led = 0;
    const step = 0.25;
    for (let t = ride(-length / 1.2 - 80); t < ride(rideS + length / 1.2 + 80); t += step) {
      const p = pose(t, [], createVillagerPose());
      const riding = isRiding(plan, t);
      expect(p.hidden ?? false, `${t}`).toBe(false);
      if (isLed(plan, t) && !riding) {
        led++;
        const horse = rideHorsePose(plan, t, state, createLivestockPose());
        expect(dist(p, horse), `${t}`).toBeLessThan(1.5);
      }
      if (prev && !prev.riding && !riding) {
        expect(dist(p, prev) / step, `${t}`).toBeLessThan(3);
      }
      prev = { x: p.x, z: p.z, riding };
    }
    expect(led * step).toBeGreaterThan((2 * length) / 1.2);
    // před i po vedení stojí, kde ho den rodiny nechal
    const before = pose(ride(-length / 1.2 - 60), [], createVillagerPose());
    const after = pose(ride(rideS + length / 1.2 + 60), [], createVillagerPose());
    expect(dist(before, { x: -6, z: 4 })).toBeLessThan(1e-6);
    expect(dist(after, { x: -6, z: 4 })).toBeLessThan(1e-6);
  });
});
