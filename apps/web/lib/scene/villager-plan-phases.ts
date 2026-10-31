// Role fází činností z plánu dne (docs/design/villagers.md – Fáze činností; villager-phases.ts):
// kterou posloupnost fází dostane úloha člověka – podle podílu práce a stavu vsi dne (dvůr kovárny,
// stav milíře, dílna hrnčíře, žně) – a kde se dělají kroky jinde: odnos výrobků do cizí domácnosti
// (kovář, hrnčíř) a pole žní (cvičící muži, starší a nečinní pomáhají o žních). Čistý modul.
import { hash01 } from './smoke-schedule';
import { createVillagerPose } from './villager-motion';
import { doorPoint, stringHash } from './villager-plan-geometry';
import type { PhasePlaces, PhaseRole } from './villager-phases';
import type { Context, PlannedVillager, Point } from './villager-plan-types';

/** Role a místa kroků jinde úlohy postavy dne, nebo null (jen cesta, póza úlohy a návrat). */
export type PhasesOf = (
  f: PlannedVillager,
  at: Point,
) => { role: PhaseRole; places?: PhasePlaces } | null;

/**
 * Role fází úloh dne `ctx`: `people` = postavy dne (místa žní – řady na poli). Odnos jde k domu
 * jiné domácnosti losem podle postavy a dne; pomoc o žních k řadě žnečů losem – jen když se dnes žne.
 */
export function planPhases(
  ctx: Context,
  people: readonly PlannedVillager[],
  probeT: number,
): PhasesOf {
  const harvest = harvestSpots(people, probeT);
  const doors = ctx.homes
    .filter((h) => !h.pen && h.built)
    .map((h) => ({ id: h.id, door: doorPoint(h) }));
  const pick = <T>(list: readonly T[], key: string, salt: number): T | undefined =>
    list.length === 0
      ? undefined
      : list[Math.floor(hash01(stringHash(key), ctx.day, salt) * list.length) % list.length];
  const aidOf = (f: PlannedVillager): PhasePlaces | undefined => {
    const aid = pick(harvest, f.key, 0x41d);
    return aid ? { aid } : undefined;
  };
  const dropOf = (f: PlannedVillager, at: Point): PhasePlaces | undefined => {
    // jiná domácnost než dílna (nejbližší dům místu práce je dílna sama)
    const own = nearest(doors, at);
    const drop = pick(
      doors.filter((d) => d !== own),
      f.key,
      0xd20,
    );
    return drop ? { drop: drop.door } : undefined;
  };
  return (f, at) => {
    const job = f.job;
    if (!job) return null;
    switch (job.kind) {
      case 'elder': {
        const places = aidOf(f);
        return places ? { role: 'elder', places } : null;
      }
      case 'lord': {
        if (job.household) return null;
        const places = aidOf(f);
        return places ? { role: 'train', places } : null;
      }
      case 'share':
        break;
      default:
        return null;
    }
    const t = job.target;
    switch (job.activity) {
      case 'harvest':
        return t.kind === 'field' ? { role: 'reap' } : null;
      case 'mow':
        return { role: t.kind === 'meadow' ? 'meadow' : 'reap' };
      case 'haul':
        // nakladači u vozu (honáka kreslí vůz)
        if (t.kind === 'field') return { role: 'load-sheaves' };
        return t.kind === 'meadow' ? { role: 'load-hay' } : null;
      case 'fish':
        return { role: 'fish' };
      case 'idle': {
        const places = aidOf(f);
        return places ? { role: 'idle', places } : null;
      }
      case 'craft':
        break;
      default:
        return null;
    }
    // řemeslo: uhlíř u milíře podle stavu milíře, kovář podle dvora dne, hrnčíř
    if (t.kind === 'kiln') return kilnRole(ctx, t.kiln, t.id);
    if (t.kind !== 'dwelling') return null;
    const house = ctx.houses.find((h) => h.id === t.id);
    if (house?.craft === 'burner') return kilnRole(ctx, undefined, house.id);
    // při tavbě i měchař (syn 10–13) – pomáhá prát a pražit rudu
    if (house?.craft === 'smith') {
      const task = house.yard?.task;
      if (task === 'smelt') return { role: 'smelt' };
      if (task === 'refine') return { role: 'refine' };
      if (task === 'forge') {
        const places = dropOf(f, at);
        return { role: 'forge', ...(places ? { places } : {}) };
      }
      return null;
    }
    if (house?.craft === 'potter') {
      const places = dropOf(f, at);
      return { role: 'pottery', ...(places ? { places } : {}) };
    }
    return null;
  };
}

/** Uhlíř u milíře – fáze podle stavu milíře (dřevo, stavba, pálení, vytahování uhlí). */
function kilnRole(
  ctx: Context,
  kilnId: number | undefined,
  burnerId: number,
): { role: PhaseRole } | null {
  const kilns = ctx.village.kilns ?? [];
  const kiln =
    kilns.find((k) => kilnId !== undefined && k.id === kilnId) ??
    kilns.find((k) => k.burnerId === burnerId);
  if (!kiln) return null;
  const roles = {
    wood: 'kiln-wood',
    build: 'kiln-build',
    burn: 'kiln-burn',
    draw: 'kiln-draw',
  } as const satisfies Record<typeof kiln.stage, PhaseRole>;
  return { role: roles[kiln.stage] };
}

/** Kde se dnes žne – místa žnečů na poli (póza v začátku dne), nejvýš pár desítek. */
function harvestSpots(people: readonly PlannedVillager[], probeT: number): Point[] {
  const out: Point[] = [];
  const probe = createVillagerPose();
  for (const f of people) {
    const job = f.job;
    if (job?.kind !== 'share' || job.activity !== 'harvest' || job.target.kind !== 'field') {
      continue;
    }
    if (out.length >= 24) break;
    const pose = f.pose(probeT, [], probe);
    out.push({ x: pose.x, z: pose.z });
  }
  return out;
}

function nearest<T extends { door: Point }>(list: readonly T[], at: Point): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const d of list) {
    const dist = Math.hypot(d.door.x - at.x, d.door.z - at.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}
