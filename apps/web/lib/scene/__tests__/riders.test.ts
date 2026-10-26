import { describe, expect, it } from 'vitest';
import type { SceneLord } from '../../village-view';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { HUNT_PACE, HUNT_SWEEP_M, huntRoute, straightLeg } from '../rider-route';
import {
  createRideState,
  HUNT_BLOCK,
  huntPlans,
  isRiding,
  rideState,
  ridingHorseIds,
  RIDE_HORSE_SCALE,
  RIDER_SEAT_M,
  ridePlans,
  rideHorsePose,
  riderPose,
  type RidePlanInput,
} from '../riders';
import { createVillagerPose } from '../villager-motion';
import type { Point } from '../villager-plan-types';

const LORD: SceneLord = {
  home: 1,
  trainees: [],
  household: [],
  riders: [
    { id: 10, horseId: 1, training: 40, hours: 2 },
    { id: 12, horseId: 2, training: 10, hours: 2 },
  ],
};
const DAY_MS = 86_400;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + DAY_MS };
const input = (lord: SceneLord, month = 6): RidePlanInput => ({
  village: {
    fields: [
      { id: 1, parts: [{ x: 0, z: 40, size: 20 }] },
      { id: 2, parts: [{ x: 0, z: -40, size: 20 }] },
    ],
    trails: [],
    labor: { month },
  } as unknown as RidePlanInput['village'],
  lord,
  hitch: { x: 4, z: 0, headingX: 1, headingZ: 0 },
  homes: [{ x: 0, z: 0 }],
  leg: straightLeg,
  window,
});
/** Čas (s) v hodinu `hour` herního dne. */
const at = (hour: number): number => ((hour / 24) * DAY_MS) / 1000;

describe('jezdec na koni (horses.md – Ve scéně)', () => {
  it('jezdec sedí na svém koni – stejná poloha, zvednutý o sed, klip sedu', () => {
    const plans = ridePlans(input(LORD));
    expect(plans.map((p) => [p.riderId, p.horseId])).toEqual([
      [10, 1],
      [12, 2],
    ]);
    for (const plan of plans) {
      const t = at(8.4);
      const horse = rideHorsePose(plan, t, createRideState(), createLivestockPose());
      const rider = riderPose(plan)(t, [], createVillagerPose());
      expect(rider.x).toBeCloseTo(horse.x, 6);
      expect(rider.z).toBeCloseTo(horse.z, 6);
      expect(rider.headingX).toBeCloseTo(horse.forwardX, 6);
      expect(['ride', 'ride-trot']).toContain(rider.clip);
      expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    }
  });

  it('jede jen v bloku jízdy (po luku a boji), jinak kůň stojí u kůlu a jezdec je doma', () => {
    const [lead, second] = ridePlans(input(LORD));
    // trainees prázdné: luk ani boj, bloky jízdy 8–9 a 14–15 h (po hodině z dvou)
    expect(lead!.blocks).toEqual([
      [8, 9],
      [14, 15],
    ]);
    const night = rideHorsePose(lead!, at(23), createRideState(), createLivestockPose());
    expect(night.stride).toBe(0);
    expect(riderPose(lead!)(at(23), [], createVillagerPose()).hidden).toBe(true);
    expect(isRiding(lead!, at(12))).toBe(false);
    expect(isRiding(lead!, at(8.4))).toBe(true);
    expect(isRiding(lead!, at(14.4))).toBe(true);
    const a = rideHorsePose(lead!, at(8.4), createRideState(), createLivestockPose());
    const b = rideHorsePose(second!, at(8.4), createRideState(), createLivestockPose());
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    expect(Math.hypot(a.x - night.x, a.z - night.z)).toBeGreaterThan(0);
  });

  it('blok jízdy začíná po luku a boji podle hodin jádra', () => {
    const lord: SceneLord = {
      ...LORD,
      trainees: [{ id: 10, bow: 2, combat: 2, riding: 2 } as SceneLord['trainees'][number]],
    };
    const [plan] = ridePlans(input(lord));
    expect(plan!.blocks).toEqual([
      [10, 11],
      [16, 17],
    ]);
  });

  it('blok začíná i končí u kůlu – ráno žádný pop-in uprostřed trasy, večer žádný skok', () => {
    const [plan] = ridePlans(input(LORD));
    const pose = (hour: number): { x: number; z: number } =>
      rideHorsePose(plan!, at(hour), createRideState(), createLivestockPose());
    const hitch = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - plan!.hitch.x, p.z - plan!.hitch.z);
    // těsně před začátkem (u kůlu) a těsně po začátku bloku: kousek od kůlu
    expect(hitch(pose(7.99))).toBeLessThan(0.5);
    expect(hitch(pose(8.01))).toBeLessThan(3);
    // konec bloku: zpět u kůlu a hned po něm stojí tamtéž
    expect(hitch(pose(8.99))).toBeLessThan(3);
    expect(hitch(pose(9.01))).toBeLessThan(0.5);
    // v půlce bloku je od kůlu nejdál
    expect(hitch(pose(8.5))).toBeGreaterThan(hitch(pose(8.1)));
  });

  it('koně na jízdě v čase (ohrada je pustí jen v bloku)', () => {
    const plans = ridePlans(input(LORD));
    const ms = (hour: number): number => LIVESTOCK_EPOCH_MS + at(hour) * 1000;
    expect([...ridingHorseIds(plans, ms(8.4))].sort()).toEqual([1, 2]);
    expect(ridingHorseIds(plans, ms(12)).size).toBe(0);
    expect(ridingHorseIds(plans, ms(23)).size).toBe(0);
  });

  it('bez jezdců žádné jízdy', () => {
    expect(ridePlans(input({ ...LORD, riders: [] }))).toEqual([]);
  });
});

describe('lov ve scéně (huntPlans – wildlife.md, Ve scéně)', () => {
  const hunt = {
    target: 'game' as const,
    riders: [
      { id: 10, horseId: 1 },
      { id: 12, horseId: 2 },
    ],
    foot: [20, 21],
    kills: 1,
  };
  const huntInput = {
    hunt,
    hitch: { x: 4, z: 0, headingX: 1, headingZ: 0 },
    edge: { x: 104, z: 0 },
    leg: straightLeg,
    walkable: (): boolean => true,
    window,
  };
  const hourT = (h: number): number => (h / 24) * (DAY_MS / 1000);

  it('jezdci a pěší vyrazí v 6 h, v půlce bloku jsou u lesa a ve 19 h zase u kůlu', () => {
    const { rides, foot } = huntPlans(huntInput);
    expect(rides.map((r) => r.riderId)).toEqual([10, 12]);
    expect(foot.map((r) => r.riderId)).toEqual([20, 21]);
    const state = createRideState();
    for (const plan of [rides[0]!, foot[0]!]) {
      expect(isRiding(plan, hourT(HUNT_BLOCK[0] - 0.5))).toBe(false);
      expect(isRiding(plan, hourT(HUNT_BLOCK[1] + 0.5))).toBe(false);
      const mid = (HUNT_BLOCK[0] + HUNT_BLOCK[1]) / 2;
      rideState(plan, hourT(mid - 0.2), state);
      // u okraje lesa (sem a tam podél něj nejvýš o HUNT_SWEEP_M)
      expect(Math.hypot(state.x - 104, state.z)).toBeLessThan(HUNT_SWEEP_M.along + 8);
      rideState(plan, hourT(HUNT_BLOCK[1] - 0.01), state);
      expect(Math.hypot(state.x - 4, state.z)).toBeLessThan(6);
    }
  });

  it('trasa pokryje půlku bloku – jízda se nepřetočí na začátek; pěší stojí s oštěpem', () => {
    const halfS = ((HUNT_BLOCK[1] - HUNT_BLOCK[0]) / 2) * hourT(1);
    const way = [huntInput.hitch, { x: 44, z: 0 }];
    const sweep: [Point, Point] = [
      { x: 50, z: 20 },
      { x: 50, z: -20 },
    ];
    const ride = huntRoute(way, sweep, false, halfS)!;
    const walk = huntRoute(way, sweep, true, halfS)!;
    expect(ride.period).toBeGreaterThanOrEqual(halfS);
    expect(walk.period).toBeGreaterThanOrEqual(halfS);
    expect(Math.max(...ride.pace)).toBeLessThanOrEqual(HUNT_PACE.ride.max);
    expect(walk.pace.some((p) => p === HUNT_PACE.stop)).toBe(true);
    expect(ride.pace.some((p) => p === HUNT_PACE.stop)).toBe(false);
  });

  it('plán lovu je čistá funkce vstupu a bez hodin světa se neloví', () => {
    expect(JSON.stringify(huntPlans(huntInput))).toBe(JSON.stringify(huntPlans(huntInput)));
    expect(huntPlans({ ...huntInput, window: null })).toEqual({ rides: [], foot: [] });
  });
});
