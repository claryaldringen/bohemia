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
 * Podkoní je u branky (před vyvedením koně) a u kůlu (před sesednutím) aspoň tolik s dřív (D69,
 * návrh Clauda – kůň nikdy nejde sám, podkoní radši chvíli počká).
 */
export const GROOM_RESERVE_S = 10;
/** Nejdřív tolik s před vyvedením koně se podkoní vybírá a smí být zavolán (≈ 750 m chůze). */
export const GROOM_MAX_CALL_S = 600;
/** Mezi nasednutím a zavoláním pro koně po jízdě aspoň tolik s – jinak podkoní počká u kůlu. */
export const GROOM_GAP_S = 60;
/** Krok hledání chvíle zavolání (s). */
const CALL_STEP_S = 2;
/** Kde člověk může být: místa jeho úloh obsazení za tolik s zpět (práce na místě nejvýš 8 minut). */
const LOOKBACK_S = 600;
/** Rezerva odhadu chůze – trasa po pěšinách bývá delší než odhad. */
const WALK_MARGIN = 1.1;
/** U kůlu přejde na stranu, odkud koně po jízdě povede zpět, za tolik s. */
const GROOM_STEP_S = 3;
/** Nejvýš tolik opakování jízdy se prohledá dopředu (dál už platí nejnovější obsazení). */
const MAX_SCAN = 8;
/** Tempo nohou podkoního – jde krokem koně (`LEAD_M_S`). */
const LEAD_PACE = LEAD_M_S / walkSpeed('man', 'walk', FIGURE_SCALE);
/** Tempo chůze rozvrhu bez odhadu po pěšinách (m/s). */
const WALK_M_S = 1.25;

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
 * Kdo smí vést koně (D69 – podkoní je rolník): dospělý muž vsi (i patnáctiletý), dnes doma, mimo
 * rodinu vojvody (role `voivode…`, obydlí dvorce, cvičící, domácnost a jezdci) a mimo domácnost
 * dílny (`dwellings` s řemeslem – řemeslo dělají muži domácnosti, jádro `craftHands`), bez starců,
 * kněží a mistrů huti. Bez nikoho vede koně jezdec sám.
 */
export function groomCandidates(
  persons: readonly ScenePerson[],
  lord: SceneLord | null | undefined,
  dwellings: SceneVillage['dwellings'] = [],
): ScenePerson[] {
  const workshops = new Set(dwellings.filter((d) => d.craft !== undefined).map((d) => d.id));
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
      !p.injured &&
      !p.priest &&
      !p.mason &&
      p.role !== 'old-man' &&
      !p.role.startsWith('voivode') &&
      p.home !== lord?.home &&
      !workshops.has(p.home) &&
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

/** Úloha, od které podkoní odejít nemůže: u spřežení či vozu (postavu kreslí ony), rodina vojvody. */
function bound(task: PersonTask): boolean {
  return task.pose === null || task.job.kind === 'lord';
}

/**
 * Podkoní opakování jízdy z obsazení `cast` (D69): přednostně ten, koho rozvrh dne má u koní (péče
 * o koně – u ohrady tohoto koně, pak jinde), pak volný (doma, pochůzka či práce na místě), pak kdo
 * drží úlohu u objektu (stádo, stavba) a nakonec i kdo je na události – kůň nikdy nejde sám, je-li
 * kdo; spřežení a vůz ne. Při shodě nejbližší dveře obydlí ke kůlu (jako vesničan výpravy –
 * `pickGroom` v jádru), pak nižší id.
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
    if (task && bound(task)) continue;
    const job = task?.job;
    const care = job?.kind === 'share' && job.activity === 'horse-care';
    const tier = care
      ? job.target.kind === 'pen' && job.target.id === ride.penId
        ? 0
        : 1
      : task?.interrupt !== undefined
        ? 4
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

/** Opakování jízdy pro podkoní: časy vedení, chvíle výběru, podkoní a jeho okna. */
interface GroomRepeat {
  times: LeadTimes;
  anchor: number;
  groom: number | null;
  windows: GroomWindow[];
}

/**
 * Úlohy podkoních pro rozvrh (villager-timetable.ts – `Duties`). Podkoního opakování jízdy vybere
 * obsazení v chvíli výběru (`GROOM_MAX_CALL_S` před vyvedením koně – `pickRideGroom`); každý kůň
 * má v témž čase jiného. Kdy ho zavolat, spočítá `callTime` z míst, kde podle rozvrhu může být –
 * u branky a u kůlu je vždy včas. Obojí rozhoduje jen obsazení do té chvíle, takže zavolání, které
 * už proběhlo, nový den nezmění (podkoní nepřeskočí).
 */
export class RideGrooms implements Duties {
  private readonly ids: ReadonlySet<number>;
  private readonly doors: ReadonlyMap<number, Point | null>;
  /** Branky a kůly jízd – odtud jde podkoní po vedení domů. */
  private readonly spots: readonly Point[];
  private readonly repeats = new Map<string, GroomRepeat | null>();
  private readonly tasks = new Map<string, PersonTask>();

  constructor(
    private readonly rides: readonly GroomRide[],
    private readonly candidates: readonly GroomCandidate[],
    /** Chůze rozvrhu (s) z bodu do bodu – stejný odhad jako `Timetable` (bez sítě rovně). */
    private readonly walkS: (a: Point, b: Point) => number = (a, b) =>
      Math.hypot(b.x - a.x, b.z - a.z) / WALK_M_S,
  ) {
    this.ids = new Set(rides.length > 0 ? candidates.map((c) => c.id) : []);
    this.doors = new Map(candidates.map((c) => [c.id, c.door]));
    this.spots = rides.flatMap((r) => [r.plan.lead!.points[0]!, r.plan.hitch]);
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
        const rep = this.repeat(r, n, base);
        if (rep?.groom === person) {
          for (const w of rep.windows) {
            if (w.until <= t) from = Math.max(from, w.until);
            else if (w.from <= t) return { task: this.taskOf(w), from: w.from, until: w.until };
            else {
              until = Math.min(until, w.from);
              done = true;
              break;
            }
          }
        } else if (rep && rep.anchor > t && base(rep.anchor).until === Infinity) {
          // nejnovější obsazení – další opakování vyberou stejně
          done = true;
        }
        if (!plan.period) break;
      }
    }
    return { task: null, from, until };
  }

  /** Opakování `n` jízdy `r`: podkoní z obsazení v chvíli výběru a jeho okna; jízda se nejede – null. */
  private repeat(r: number, n: number, base: (t: number) => CastSpan): GroomRepeat | null {
    const key = `${r}:${n}`;
    const known = this.repeats.get(key);
    if (known !== undefined) return known;
    const ride = this.rides[r]!;
    const times = leadTimes(ride.plan, n);
    let rep: GroomRepeat | null = null;
    if (times) {
      const anchor = times.out - GROOM_MAX_CALL_S;
      // zabraní: podkoní jiných jízd v témž čase vybraní dřív (při shodě jízdy napřed)
      const taken = new Set<number>();
      for (let q = 0; q < this.rides.length; q++) {
        const other = this.rides[q]!.plan;
        if (q === r) continue;
        const m0 = leadRepeat(other, anchor);
        for (const m of other.period ? [m0 - 1, m0, m0 + 1] : [0]) {
          const o = leadTimes(other, m);
          if (!o) continue;
          const at = o.out - GROOM_MAX_CALL_S;
          if (at >= times.back || o.back <= anchor || at > anchor || (at === anchor && q > r)) {
            continue;
          }
          const g = this.repeat(q, m, base)?.groom;
          if (g !== undefined && g !== null) taken.add(g);
        }
      }
      const groom = pickRideGroom(this.candidates, base(anchor).cast, ride, taken);
      rep = {
        times,
        anchor,
        groom,
        windows: groom === null ? [] : this.windowsFor(r, n, times, anchor, groom, base),
      };
    }
    this.repeats.set(key, rep);
    return rep;
  }

  /**
   * Okna podkoního: od zavolání k brance do nasednutí a od zavolání ke kůlu do návratu koně
   * k brance; když by pro koně musel být zavolán dřív než `GROOM_GAP_S` po nasednutí, jedno okno –
   * počká u kůlu.
   */
  private windowsFor(
    r: number,
    n: number,
    times: LeadTimes,
    anchor: number,
    groom: number,
    base: (t: number) => CastSpan,
  ): GroomWindow[] {
    const lead = this.rides[r]!.plan.lead!;
    const gate = leaderSpot(lead, 0, false, { x: 0, z: 0, headingX: 0, headingZ: 1 });
    const hitch = leaderSpot(lead, lead.length, true, { x: 0, z: 0, headingX: 0, headingZ: 1 });
    const fetch = this.callTime(groom, gate, times.out, anchor, base);
    const gap = times.mount + GROOM_GAP_S;
    const back = this.callTime(groom, hitch, times.dismount, gap, base);
    if (back <= gap) return [{ ride: r, n, kind: 'both', from: fetch, until: times.back, times }];
    return [
      { ride: r, n, kind: 'fetch', from: fetch, until: times.mount, times },
      { ride: r, n, kind: 'return', from: back, until: times.back, times },
    ];
  }

  /**
   * Kdy podkoního zavolat, aby byl u `target` aspoň `GROOM_RESERVE_S` před `deadline` (D69): krok
   * po kroku od `from` – zavolá se v první chvíli, kdy by po dalším kroku čekání z některého místa,
   * kde podle rozvrhu může být (`reach`), nedošel včas. Za krok dojde nejvýš o krok dál, takže
   * zavolaný dojde vždy včas (u branky či u kůlu pak počká). Rozhoduje jen obsazení do té chvíle.
   */
  private callTime(
    person: number,
    target: Point,
    deadline: number,
    from: number,
    base: (t: number) => CastSpan,
  ): number {
    for (let c = from; c < deadline; c += CALL_STEP_S) {
      const reach = this.reach(person, c, target, base);
      if (c + reach + 2 * CALL_STEP_S + GROOM_RESERVE_S >= deadline) return c;
    }
    return from;
  }

  /**
   * Nejdelší chůze k `target` (s, s rezervou odhadu) z míst, kde člověk v `c` podle rozvrhu může
   * být: dveře domu, místa jeho úloh v obsazení za `LOOKBACK_S` zpět (cesta mezi nimi je blíž než
   * dál z nich) a branky a kůly jízd (od koní jde domů).
   */
  private reach(person: number, c: number, target: Point, base: (t: number) => CastSpan): number {
    let worst = 0;
    const add = (p: Point | null | undefined): void => {
      if (p) worst = Math.max(worst, this.walkS(p, target));
    };
    add(this.doors.get(person));
    for (const s of this.spots) add(s);
    let t = c;
    for (let k = 0; k < 64; k++) {
      const span = base(t);
      const task = span.cast.get(person);
      if (task) {
        add(task.at);
        for (const p of Object.values(task.places ?? {})) add(p);
      }
      if (span.from <= c - LOOKBACK_S) break;
      t = span.from - 1e-6;
    }
    return worst * WALK_MARGIN;
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
