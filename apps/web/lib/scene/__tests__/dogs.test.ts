import { describe, expect, it } from 'vitest';
import {
  createDogState,
  DOG_JOIN_S,
  dogPlans,
  dogPose,
  PATROL_DOGS,
  type DogPlanInput,
} from '../dogs';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { huntRoute } from '../rider-route';
import { hitchSpot, type RidePlan } from '../riders';

const DAY_MS = 86_400;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + DAY_MS };
/** Blok jízdy ve skutečném čase (s): deset minut od šedesáté sekundy. */
const RIDE_T = [60, 660] as const;
const hitch = { x: 4, z: 0, headingX: 1, headingZ: 0 };
/** Jezdec objížďky: z kůlu po trase k bodu 80 m a zpět v bloku `RIDE_T`. */
const ride = (): RidePlan => ({
  riderId: 10,
  horseId: 1,
  route: huntRoute([hitch, { x: 84, z: 0 }], null, false, (RIDE_T[1] - RIDE_T[0]) / 2),
  behind: 0,
  side: 0,
  offset: 0,
  blocks: null,
  span: [LIVESTOCK_EPOCH_MS + RIDE_T[0] * 1000, LIVESTOCK_EPOCH_MS + RIDE_T[1] * 1000],
  hitch: hitchSpot(hitch, 0),
  window,
});
const input = (over: Partial<DogPlanInput>): DogPlanInput => ({
  count: 5,
  hitch,
  rides: [],
  patrol: false,
  free: () => true,
  ...over,
});

describe('psi dvorce (dogs.ts – wildlife.md, Psi)', () => {
  it('na začátku a konci bloku jízdy pes neskočí – dobíhá od dvorce k vůdci a zpět', () => {
    const plans = dogPlans(input({ rides: [ride()], patrol: true }));
    const pose = createLivestockPose();
    const state = createDogState();
    for (const edge of RIDE_T) {
      for (const plan of plans) {
        let last: { x: number; z: number } | null = null;
        for (let t = edge - 1; t <= edge + DOG_JOIN_S + 1; t += 0.1) {
          dogPose(plan, t, state, pose);
          if (last) expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(1);
          last = { x: pose.x, z: pose.z };
        }
      }
    }
  });

  it('bez hlídky jsou všichni u dvorce – kolem kůlu a čichají', () => {
    const plans = dogPlans(input({}));
    expect(plans).toHaveLength(5);
    const pose = createLivestockPose();
    const state = createDogState();
    let sniffing = false;
    for (const plan of plans) {
      expect(plan.leader).toBeNull();
      for (let t = 0; t < 60; t += 3) {
        dogPose(plan, t, state, pose);
        expect(Math.hypot(pose.x - hitch.x, pose.z - hitch.z)).toBeLessThan(8);
        if (pose.head > 0.5) sniffing = true;
      }
    }
    expect(sniffing).toBe(true);
  });

  it('v den hlídky běží s objížďkou nejvýš PATROL_DOGS psů, ostatní zůstanou', () => {
    const rp = ride();
    const plans = dogPlans(input({ rides: [rp], patrol: true }));
    expect(plans.filter((p) => p.leader !== null)).toHaveLength(PATROL_DOGS);
    expect(dogPlans(input({ rides: [rp], patrol: false })).every((p) => !p.leader)).toBe(true);
  });

  it('póza je čistá funkce času a plánu', () => {
    const [plan] = dogPlans(input({ rides: [ride()], patrol: true }));
    const a = dogPose(plan!, 1234.5, createDogState(), createLivestockPose());
    const b = dogPose(plan!, 1234.5, createDogState(), createLivestockPose());
    expect(a).toEqual(b);
  });
});
