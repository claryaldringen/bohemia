import { describe, expect, it } from 'vitest';
import type { SceneLord } from '../../village-view';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { straightLeg } from '../rider-route';
import {
  createRideState,
  RIDE_HORSE_SCALE,
  RIDER_SEAT_M,
  ridePlans,
  rideHorsePose,
  riderPose,
  type RidePlanInput,
} from '../riders';
import { createVillagerPose } from '../villager-motion';

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
      const t = at(10);
      const horse = rideHorsePose(plan, t, createRideState(), createLivestockPose());
      const rider = riderPose(plan)(t, [], createVillagerPose());
      expect(rider.x).toBeCloseTo(horse.x, 6);
      expect(rider.z).toBeCloseTo(horse.z, 6);
      expect(rider.headingX).toBeCloseTo(horse.forwardX, 6);
      expect(['ride', 'ride-trot']).toContain(rider.clip);
      expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    }
  });

  it('v noci kůň stojí u kůlu a jezdec je doma; ve dne jedou za sebou', () => {
    const [lead, second] = ridePlans(input(LORD));
    const night = rideHorsePose(lead!, at(23), createRideState(), createLivestockPose());
    expect(night.stride).toBe(0);
    expect(riderPose(lead!)(at(23), [], createVillagerPose()).hidden).toBe(true);
    const a = rideHorsePose(lead!, at(12), createRideState(), createLivestockPose());
    const b = rideHorsePose(second!, at(12), createRideState(), createLivestockPose());
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    expect(Math.hypot(a.x - night.x, a.z - night.z)).toBeGreaterThan(0);
  });

  it('bez jezdců žádné jízdy', () => {
    expect(ridePlans(input({ ...LORD, riders: [] }))).toEqual([]);
  });
});
