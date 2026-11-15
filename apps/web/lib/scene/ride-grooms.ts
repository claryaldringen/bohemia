// Podkoní (D69 – Martin 15. 11. 2026: „Koně by měl nějaký podkoní (rolník) přivést ke dvorci“;
// horses.md – Ve scéně, Z ohrady ke kůlu): před jízdou dne rodiny dojde rolník – dospělý muž vsi
// mimo rodinu vojvody – k brance ohrady, vyvede koně za uzdu po cestě `RidePlan.lead` ke kůlu
// u dvorce a vrátí se ke své práci; po jízdě si pro koně dojde a odvede ho do ohrady. Kůň se nikdy
// nehýbe bez člověka u sebe. Podkoní jde z rozvrhu (villager-timetable.ts – `Duties`): úloha navíc
// v okně přeruší, co dělá, a k brance i ke kůlu dojde z místa, kde je. Bez rolníků vede koně jezdec
// sám (villager-plan-lord.ts – `selfLead`). Jen podívaná – péči o koně počítá jádro (`horseCare`).
// Čisté funkce skutečného času (s – villagerSeconds) bez Babylonu.
import type { ScenePerson } from '../person-view';
import type { SceneLord, SceneVillage } from '../village-view';
import {
  leaderSpot,
  leadRepeat,
  leadTimes,
  LEAD_M_S,
  type LeadTimes,
  type RideLead,
  type RidePlan,
} from './riders';
import { createVillagerPose, walkSpeed, type PoseFn } from './villager-motion';
import { CHILD_UNDER, FIGURE_SCALE, type Point } from './villager-plan-types';
import type { CastSpan, DayCast, PersonTask } from './villager-schedule';
import type { Duties } from './villager-timetable';

/**
 * Podkoní je odvolán od své práce tolik s před vyvedením koně – dojde z místa, kde je, a u branky
 * koně chystá (návrh Clauda; rozvrh jde chůzí ≈ 1,3 m/s, tedy ze vzdálenosti přes 100 m).
 */
export const GROOM_CALL_S = 90;
/** Mezi nasednutím a odvoláním pro koně po jízdě aspoň tolik s – jinak podkoní počká u kůlu. */
export const GROOM_GAP_S = 60;
/** U kůlu přejde na stranu, odkud koně po jízdě povede zpět, za tolik s. */
const GROOM_STEP_S = 3;
/** Nejvýš tolik opakování jízdy se prohledá dopředu (dál už platí nejnovější obsazení). */
const MAX_SCAN = 8;
/** Tempo nohou podkoního – jde krokem koně (`LEAD_M_S`). */
const LEAD_PACE = LEAD_M_S / walkSpeed('man', 'walk', FIGURE_SCALE);

/** Druh okna podkoního: vyvede koně, odvede ho, nebo obojí (krátká jízda – počká u kůlu). */
export type GroomDutyKind = 'fetch' | 'return' | 'both';

/** Okno úlohy podkoního (s): jízda `ride` (index v `RideGrooms`), opakování `n`. */
export interface GroomWindow {
  ride: number;
  n: number;
  kind: GroomDutyKind;
  from: number;
  until: number;
  times: LeadTimes;
}

/** Jízda s cestou koně z ohrady (`RidePlan.lead`) a ohrada koně (péče o koně u ní má přednost). */
export interface GroomRide {
  plan: RidePlan;
  penId: number | null;
}

/** Možný podkoní a dveře jeho obydlí (vybírá se nejbližší ke kůlu). */
export interface GroomCandidate {
  id: number;
  door: Point | null;
}

/**
 * Kdo smí vést koně (D69): dospělý muž vsi, dnes doma, mimo rodinu vojvody (role `voivode…`,
 * obydlí dvorce, cvičící, domácnost a jezdci), starce, kněze a mistry huti. Bez nikoho vede koně
 * jezdec sám.
 */
export function groomCandidates(
  persons: readonly ScenePerson[],
  lord: SceneLord | null | undefined,
): ScenePerson[] {
  const family = new Set<number>([
    ...(lord?.trainees ?? []).map((t) => t.id),
    ...(lord?.household ?? []),
    ...(lord?.riders ?? []).map((r) => r.id),
    ...(lord?.lordId !== undefined ? [lord.lordId] : []),
  ]);
  return persons.filter(
    (p) =>
      p.sex === 'male' &&
      p.age >= CHILD_UNDER &&
      !p.away &&
      !p.priest &&
      !p.mason &&
      p.role !== 'old-man' &&
      !p.role.startsWith('voivode') &&
      p.home !== lord?.home &&
      !family.has(p.id),
  );
}

/**
 * Koně, které vede podkoní: prvních `count` různých koní jízd s cestou z ohrady (`count` – kolik je
 * možných podkoních); ostatní vede jezdec sám (villager-plan-lord.ts – `selfLead`).
 */
export function groomedHorses(rides: readonly RidePlan[], count: number): Set<number> {
  const out = new Set<number>();
  for (const r of rides) {
    if (out.size >= count) break;
    if (r.lead && r.span) out.add(r.horseId);
  }
  return out;
}

/** Jízdy, kterým vede koně podkoní: s cestou z ohrady a ve skutečném čase; ohrada koně ze vsi. */
export function groomRides(
  rides: readonly RidePlan[],
  village: Pick<SceneVillage, 'pens'>,
): GroomRide[] {
  return rides
    .filter((plan) => plan.lead && plan.span)
    .map((plan) => ({
      plan,
      penId:
        (village.pens ?? []).find((p) => p.horses?.some((h) => h.id === plan.horseId))?.id ?? null,
    }));
}

/**
 * Okna podkoního v opakování `n` jízdy `plan`: odvolání `GROOM_CALL_S` před vyvedením koně až do
 * nasednutí a od odvolání před sesednutím do návratu koně k brance; jsou-li od sebe méně než
 * `GROOM_GAP_S`, jedno okno – podkoní počká u kůlu.
 */
export function groomWindows(plan: RidePlan, ride: number, n: number): GroomWindow[] {
  const w = leadTimes(plan, n);
  if (!w) return [];
  const fetch = w.out - GROOM_CALL_S;
  const back = w.dismount - GROOM_CALL_S;
  if (back - w.mount < GROOM_GAP_S) {
    return [{ ride, n, kind: 'both', from: fetch, until: w.back, times: w }];
  }
  return [
    { ride, n, kind: 'fetch', from: fetch, until: w.mount, times: w },
    { ride, n, kind: 'return', from: back, until: w.back, times: w },
  ];
}

/**
 * Póza podkoního v okně (D69): u branky chystá koně (čelem k ohradě), vyvede ho za uzdu po cestě
 * `lead` ke kůlu (u hlavy koně – `leaderSpot`, krokem koně), stojí u něj, než jezdec nasedne; po
 * jízdě stojí u kůlu, jezdec sesedne a podkoní koně odvede k brance. Mimo okno stojí, kde skončil.
 */
export function groomPose(lead: RideLead, w: LeadTimes, kind: GroomDutyKind): PoseFn {
  const a = { x: 0, z: 0, headingX: 0, headingZ: 1 };
  const b = { x: 0, z: 0, headingX: 0, headingZ: 1 };
  return (t, _herds, out) => {
    out.hidden = false;
    delete out.stage;
    delete out.lift;
    let walking = false;
    if (kind !== 'return' && t < w.mount) {
      walking = t >= w.out && t < w.at;
      leaderSpot(lead, (t - w.out) * LEAD_M_S, false, out);
      if (t < w.out) {
        out.headingX = -out.headingX;
        out.headingZ = -out.headingZ;
      }
    } else if (kind !== 'fetch' && t >= w.dismount) {
      walking = t < w.back;
      leaderSpot(lead, lead.length - (t - w.dismount) * LEAD_M_S, true, out);
    } else if (kind === 'both' && t < w.mount + GROOM_STEP_S) {
      leaderSpot(lead, lead.length, false, a);
      leaderSpot(lead, lead.length, true, b);
      const f = Math.max(0, (t - w.mount) / GROOM_STEP_S);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      out.x = a.x + dx * f;
      out.z = a.z + dz * f;
      out.headingX = d > 1e-6 ? dx / d : a.headingX;
      out.headingZ = d > 1e-6 ? dz / d : a.headingZ;
      walking = d > 0.05;
    } else {
      leaderSpot(lead, lead.length, kind !== 'fetch', out);
    }
    out.clip = walking ? 'walk' : 'idle';
    out.pace = walking ? LEAD_PACE : 1;
    return out;
  };
}

/** Úloha, kvůli které člověk podkoním být nemůže: událost, spřežení či vůz, rodina vojvody. */
function busy(task: PersonTask): boolean {
  return task.interrupt !== undefined || task.pose === null || task.job.kind === 'lord';
}

/**
 * Podkoní okna z obsazení `cast` v jeho začátku (D69): přednostně ten, koho rozvrh dne má u koní
 * (péče o koně – u ohrady tohoto koně, pak jinde), pak volný (doma, pochůzka či práce na místě),
 * nakonec kdo drží úlohu u objektu (stádo, stavba); událost, spřežení a vůz ne. Při shodě
 * nejbližší dveře obydlí ke kůlu (jako vesničan výpravy – `pickGroom` v jádru), pak nižší id.
 */
export function pickRideGroom(
  candidates: readonly GroomCandidate[],
  cast: DayCast,
  ride: GroomRide,
  taken: ReadonlySet<number> = new Set(),
): number | null {
  const hitch = ride.plan.hitch;
  let best: { id: number; tier: number; d: number } | null = null;
  for (const c of candidates) {
    if (taken.has(c.id)) continue;
    const task = cast.get(c.id);
    if (task && busy(task)) continue;
    const job = task?.job;
    const care = job?.kind === 'share' && job.activity === 'horse-care';
    const tier = care
      ? job.target.kind === 'pen' && job.target.id === ride.penId
        ? 0
        : 1
      : task?.kind === 'hold'
        ? 3
        : 2;
    const d = c.door ? Math.hypot(c.door.x - hitch.x, c.door.z - hitch.z) : Infinity;
    if (
      best &&
      (tier > best.tier || (tier === best.tier && (d > best.d || (d === best.d && c.id > best.id))))
    ) {
      continue;
    }
    best = { id: c.id, tier, d };
  }
  return best?.id ?? null;
}

/**
 * Úlohy podkoních pro rozvrh (villager-timetable.ts – `Duties`): kdo vede koně kterého okna, určí
 * obsazení v začátku okna (`pickRideGroom`) – okno, které už běží, tak podkoního nezmění, ani když
 * přijde nový den. Každý kůň má v okně svého podkoního (jízdy napřed mají přednost).
 */
export class RideGrooms implements Duties {
  private readonly ids: ReadonlySet<number>;
  private readonly picked = new Map<string, { cast: DayCast; groom: number | null }>();
  private readonly tasks = new Map<string, PersonTask>();

  constructor(
    private readonly rides: readonly GroomRide[],
    private readonly candidates: readonly GroomCandidate[],
  ) {
    this.ids = new Set(rides.length > 0 ? candidates.map((c) => c.id) : []);
  }

  at(
    person: number,
    t: number,
    base: (t: number) => CastSpan,
  ): { task: PersonTask | null; from: number; until: number } | null {
    if (!this.ids.has(person)) return null;
    let from = -Infinity;
    let until = Infinity;
    for (let r = 0; r < this.rides.length; r++) {
      const plan = this.rides[r]!.plan;
      const first = plan.period ? leadRepeat(plan, t) - 1 : 0;
      let done = false;
      for (let n = first; n < first + MAX_SCAN && !done; n++) {
        for (const w of groomWindows(plan, r, n)) {
          const groom = this.groomOf(w, base);
          if (w.until <= t) {
            if (groom === person) from = Math.max(from, w.until);
          } else if (w.from <= t) {
            if (groom === person) return { task: this.taskOf(w), from: w.from, until: w.until };
          } else if (groom === person) {
            until = Math.min(until, w.from);
            done = true;
            break;
          } else if (base(w.from).until === Infinity) {
            // nejnovější obsazení – další opakování vyberou stejně
            done = true;
            break;
          }
        }
        if (!plan.period) break;
      }
    }
    return { task: null, from, until };
  }

  /** Podkoní okna `w` (podle obsazení v jeho začátku); podkoní jízd napřed v témž čase jsou zabraní. */
  private groomOf(w: GroomWindow, base: (t: number) => CastSpan): number | null {
    const cast = base(w.from).cast;
    const key = `${w.ride}:${w.n}:${w.kind}`;
    const hit = this.picked.get(key);
    if (hit && hit.cast === cast) return hit.groom;
    const taken = new Set<number>();
    for (let r = 0; r < w.ride; r++) {
      const plan = this.rides[r]!.plan;
      const n0 = leadRepeat(plan, w.from);
      for (const n of plan.period ? [n0 - 1, n0, n0 + 1] : [0]) {
        for (const o of groomWindows(plan, r, n)) {
          if (o.from >= w.until || o.until <= w.from) continue;
          const g = this.groomOf(o, base);
          if (g !== null) taken.add(g);
        }
      }
    }
    const groom = pickRideGroom(this.candidates, cast, this.rides[w.ride]!, taken);
    this.picked.set(key, { cast, groom });
    return groom;
  }

  /** Úloha podkoního v okně `w` – péče o koně u jeho ohrady, přeruší, co právě dělá. */
  private taskOf(w: GroomWindow): PersonTask {
    const key = `${w.ride}:${w.n}:${w.kind}`;
    let task = this.tasks.get(key);
    if (task) return task;
    const ride = this.rides[w.ride]!;
    const lead = ride.plan.lead!;
    const pose = groomPose(lead, w.times, w.kind);
    const probe = createVillagerPose();
    task = {
      key: `groom:${ride.plan.horseId}:${w.n}:${w.kind}`,
      job: {
        kind: 'share',
        activity: 'horse-care',
        target: ride.penId !== null ? { kind: 'pen', id: ride.penId } : { kind: 'village' },
      },
      kind: 'hold',
      range: 'long',
      pose,
      errand: null,
      at: lead.points[0]!,
      // k místu, kde podkoní v chvíli příchodu bude (u branky; pozdě – u koně na cestě)
      placeAt: (at) => {
        probe.hidden = false;
        const p = pose(at, [], probe);
        return { x: p.x, z: p.z };
      },
      interrupt: 'all',
    };
    this.tasks.set(key, task);
    return task;
  }
}
