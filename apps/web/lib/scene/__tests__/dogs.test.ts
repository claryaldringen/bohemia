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
import { straightLeg } from '../rider-route';
import {
  createRideState,
  HUNT_REAL_S,
  HUNT_START_H,
  huntPlans,
  rideState,
  type RidePlan,
} from '../riders';

const DAY_MS = 86_400;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + DAY_MS };
const hourT = (h: number): number => (h / 24) * (DAY_MS / 1000);
/** Lov ve skutečném čase (s): za šera dne lovu, HUNT_REAL_S dlouho. */
const HUNT_T = [hourT(HUNT_START_H), hourT(HUNT_START_H) + HUNT_REAL_S] as const;
const hitch = { x: 4, z: 0, headingX: 1, headingZ: 0 };
const hunt = (foot: number[]): ReturnType<typeof huntPlans> =>
  huntPlans({
    hunt: { target: 'game', riders: [{ id: 10, horseId: 1 }], foot, kills: 0 },
    hitch,
    edge: { x: 84, z: 0 },
    leg: straightLeg,
    walkable: () => true,
    window,
  });
const input = (over: Partial<DogPlanInput>): DogPlanInput => ({
  count: 5,
  hitch,
  hunt: { rides: [], foot: [] },
  rides: [],
  patrol: false,
  free: () => true,
  ...over,
});

describe('psi dvorce (dogs.ts – wildlife.md, Psi)', () => {
  it('na začátku a konci bloku lovu pes neskočí – dobíhá od dvorce k vůdci a zpět', () => {
    const plans = dogPlans(input({ hunt: hunt([20, 21]) }));
    const pose = createLivestockPose();
    const state = createDogState();
    for (const edge of [HUNT_T[0], HUNT_T[1]]) {
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

  it('bez lovu a hlídky jsou všichni u dvorce – kolem kůlu a čichají', () => {
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

  it('v den lovu běží všichni s pěšími lovci, mimo blok lovu jsou u dvorce', () => {
    const plans = dogPlans(input({ hunt: hunt([20, 21]) }));
    expect(plans.every((p) => p.leader?.horseId === -1)).toBe(true);
    const pose = createLivestockPose();
    const state = createDogState();
    const lead = createRideState();
    const mid = (HUNT_T[0] + HUNT_T[1]) / 2 - 1;
    for (const plan of plans) {
      dogPose(plan, mid, state, pose);
      rideState(plan.leader!, mid, lead);
      expect(Math.hypot(pose.x - lead.x, pose.z - lead.z)).toBeLessThan(6);
      dogPose(plan, HUNT_T[1] + 4, state, pose);
      expect(Math.hypot(pose.x - hitch.x, pose.z - hitch.z)).toBeLessThan(8);
    }
    // bez pěších běží s jezdci
    expect(dogPlans(input({ hunt: hunt([]) })).every((p) => p.leader?.horseId === 1)).toBe(true);
  });

  it('v den hlídky běží s objížďkou nejvýš PATROL_DOGS psů, ostatní zůstanou', () => {
    const ride: RidePlan = { ...hunt([]).rides[0]! };
    const plans = dogPlans(input({ rides: [ride], patrol: true }));
    expect(plans.filter((p) => p.leader !== null)).toHaveLength(PATROL_DOGS);
    expect(dogPlans(input({ rides: [ride], patrol: false })).every((p) => !p.leader)).toBe(true);
  });

  it('póza je čistá funkce času a plánu', () => {
    const [plan] = dogPlans(input({ hunt: hunt([20]) }));
    const a = dogPose(plan!, 1234.5, createDogState(), createLivestockPose());
    const b = dogPose(plan!, 1234.5, createDogState(), createLivestockPose());
    expect(a).toEqual(b);
  });
});
