// Rozvrhy lidí vsi ve scéně (docs/design/villagers.md – Činnosti od začátku do konce, úloha 3):
// obsazení posledních dnů v paměti, poslední činnost každého člověka a póza z ní. Postava člověka
// je jeho rozvrh – přelom herního dne rozběhnutou činnost nepřeruší, novou práci si člověk vybere
// až při dalším vyjití z domu (villager-schedule.ts). Čistý modul bez Babylonu; počítá líně –
// činnost člověka jen tehdy, když scéna chce jeho pózu (ves v záběru) nebo stav vybraného.
import {
  activityPose,
  activityStage,
  castTimeline,
  departAfter,
  HISTORY_S,
  nextActivity,
  rehold,
  scheduleAt,
  settle,
  uncut,
  type Activity,
  type CastSpan,
  type DayCast,
  type ScheduleInput,
} from './villager-schedule';
import { activityPhases, phaseAt, type ActivityPhase, type PhaseName } from './villager-phases';
import {
  createVillagerPose,
  type HerdView,
  type PoseFn,
  type Route,
  type VillagerPose,
} from './villager-motion';
import type { PersonJob } from './villager-roster';

/** Kolik herních dnů obsazení si scéna pamatuje (villagers.md – Pro implementaci, úloha 3). */
export const MAX_DAYS = 30;

/** Bod na zemi (m). */
interface Point {
  x: number;
  z: number;
}

/** Obdélník na zemi (m). */
export interface Extent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Kde se lidé s rozvrhem během dne můžou objevit: dveře jejich domů (`doors`) a místa úloh
 * obsazení dne `cast` i s kroky jinde (`PersonTask.places`) – pevné za den. Scéna z toho skládá
 * obal postav pro ořez (villagers.ts), ať se hýbe i ten, kdo vyjde z domu mimo poslední pózy.
 * Nic – null.
 */
export function dayExtent(cast: DayCast, doors: Iterable<Point | null>): Extent | null {
  let out: Extent | null = null;
  const add = (p: Point | null | undefined): void => {
    if (!p) return;
    if (!out) out = { minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z };
    else {
      out.minX = Math.min(out.minX, p.x);
      out.maxX = Math.max(out.maxX, p.x);
      out.minZ = Math.min(out.minZ, p.z);
      out.maxZ = Math.max(out.maxZ, p.z);
    }
  };
  for (const door of doors) add(door);
  for (const task of cast.values()) {
    add(task.at);
    for (const place of Object.values(task.places ?? {})) add(place);
  }
  return out;
}

/** Poslední činnost člověka, póza z ní (líně) a další činnost po návratu (doma – kdy vyjde). */
interface Entry {
  act: Activity;
  pose: PoseFn | null;
  /** Fáze činnosti (villager-phases.ts) – líně, s pózou. */
  phases?: ActivityPhase[] | null;
}

/** Úsek cesty činnosti pro panel postavy: k práci a z ní (pochůzku řekne její póza). */
export type ActivityLeg = 'out' | 'back';

/**
 * Rozvrhy lidí jedné vsi (`seed`) – `speed` = tempo chůze (m/s; délky z odhadu sítě pěšin –
 * `setEstimate`, bez sítě rovně). Obsazení dnů přidává `setDay` (z plánu dne), dveře domů `setDoors`.
 */
export class Timetable {
  private days: { day: number; from: number; cast: DayCast }[] = [];
  private castOf: (t: number) => CastSpan = castTimeline([]);
  private doors: ReadonlyMap<number, Point | null> = new Map();
  private readonly entries = new Map<number, Entry>();
  private wet: ((x: number, z: number, t: number) => boolean) | null = null;
  private estimate: ((a: Point, b: Point) => number) | null = null;
  private router: ((personId: number, from: Point, to: Point) => Route | null) | null = null;
  readonly input: ScheduleInput;
  private readonly speed: number;

  constructor(
    readonly seed: number,
    speed: number,
  ) {
    const v = Math.max(0.1, speed);
    this.speed = v;
    // délka chůze z odhadu po síti pěšin (villagers.md – Cesty postav; bez sítě rovně)
    const walkM = (a: Point, b: Point): number =>
      this.estimate?.(a, b) ?? Math.hypot(b.x - a.x, b.z - a.z);
    this.input = {
      seed,
      castOf: (t) => this.castOf(t),
      lengthOf: (id, task, when) => {
        if (task.errand) {
          return { outS: task.errand.homeS / 2, endS: 0, backS: task.errand.homeS / 2 };
        }
        const door = this.doors.get(id) ?? null;
        // úloha s místem v čase (vojvodova rodina) – tam, kde v chvíli příchodu a odchodu bude
        const place = (t: number | undefined): Point | null =>
          t !== undefined && task.placeAt ? task.placeAt(t) : task.at;
        const there = place(when?.out);
        const back = place(when?.back);
        return {
          outS: door && there ? walkM(door, there) / v : 0,
          endS: 0,
          backS: door && back ? walkM(door, back) / v : 0,
        };
      },
      doorOf: (id) => this.doors.get(id) ?? null,
      walkS: (a, b) => walkM(a, b) / v,
      wet: (x, z, t) => this.wet?.(x, z, t) ?? false,
      placeAt: (a, t) => this.placeAt(a, t),
    };
  }

  /**
   * Odhad délky chůze po síti pěšin (`VillagerPaths.walkLength` – stejný model jako simulace,
   * stejné časy ve všech prohlížečích i mimo záběr); null – rovně. Platí od další činnosti.
   */
  setEstimate(estimate: ((a: Point, b: Point) => number) | null): void {
    this.estimate = estimate;
  }

  /**
   * Přesná trasa chůze (po pěšinách, kolem domů – villager-plan.ts `walk`) – hledá se jen pro
   * pózu, která se kreslí (postava v záběru nebo vybraná), jednou za úsek činnosti.
   */
  setRouter(router: ((personId: number, from: Point, to: Point) => Route | null) | null): void {
    this.router = router;
  }

  /**
   * Povodeň (villagers.md – Události): je místo v okamžik `t` (s) pod vodou? Platí od dalšího
   * výpočtu činností (kdo je venku s cílem pod vodou, jde od přelomu dne domů). Null – sucho.
   */
  setWet(wet: ((x: number, z: number, t: number) => boolean) | null): void {
    this.wet = wet;
  }

  /** Počet známých dnů obsazení (pro testy). */
  get dayCount(): number {
    return this.days.length;
  }

  /** Dveře domu člověka (id → bod před vchodem; zbořený dům null) – platí od další činnosti. */
  setDoors(doors: ReadonlyMap<number, Point | null>): void {
    this.doors = doors;
  }

  /** Dveře domu člověka, nebo null. */
  doorOf(id: number): Point | null {
    return this.doors.get(id) ?? null;
  }

  /**
   * Obsazení herního dne `day`, který začíná v `from` (s): týž den nahradí (změna vsi během dne –
   * začátek zůstane), nejvýš `MAX_DAYS` dnů. Rozběhnutá pochůzka a práce na místě se nemění;
   * kdo je doma, vyjde podle nového obsazení a úloha u objektu se přepočítá (drží ji, dokud ji
   * obsazení dává – nový den ji může ukončit).
   */
  setDay(day: number, from: number, cast: DayCast): void {
    const same = this.days.find((d) => d.day === day);
    if (same) same.cast = cast;
    else {
      this.days.push({ day, from, cast });
      this.days.sort((a, b) => a.from - b.from);
      if (this.days.length > MAX_DAYS) this.days.splice(0, this.days.length - MAX_DAYS);
    }
    this.castOf = castTimeline(this.days);
    const newest = this.days[this.days.length - 1]?.day === day;
    for (const [id, e] of this.entries) {
      const a = uncut(e.act);
      let next = a;
      if (a.kind === 'home') {
        // doma – vyjde podle obsazení, jaké je teď (villagers.md: rozhoduje se při vyjití)
        const out = departAfter(this.input, id, a.start);
        next = { ...a, end: out ? out.start : Infinity };
      } else if (a.kind === 'hold') {
        // úloha u objektu – s novým dnem ji obsazení může přestat dávat; vojvodova rodina (úloha
        // s místem v čase) dostane do běžícího dne rodiny dnešní plán – lov, jízdy, hodiny dne
        // (lord-day.ts – čistá funkce skutečného času, cyklus navazuje)
        const fresh = newest ? cast.get(id) : undefined;
        const task =
          fresh?.placeAt && a.task && fresh.key === a.task.key && fresh !== a.task ? fresh : a.task;
        next = rehold(this.input, id, task === a.task ? a : { ...a, task });
      }
      // nový den může přinést událost, která rozběhnutou činnost přeruší (villagers.md – Události)
      const settled = settle(this.input, id, next);
      if (settled.end !== e.act.end || settled.cut?.by !== e.act.cut?.by || next !== a) {
        e.act = settled;
        e.pose = null;
        e.phases = null;
      }
    }
  }

  /** Zapomene obsazení i činnosti (jiné hodiny světa, jiná ves). */
  reset(): void {
    this.days = [];
    this.castOf = castTimeline([]);
    this.entries.clear();
  }

  /** Zapomene činnosti lidí, kteří ve vsi nejsou (zemřeli, odešli). */
  retain(living: ReadonlySet<number>): void {
    for (const id of this.entries.keys()) if (!living.has(id)) this.entries.delete(id);
  }

  /**
   * Činnost člověka v okamžik `t` (s). Poprvé (a po dlouhé době mimo záběr) řetěz od
   * `t − HISTORY_S` – splyne s nepřetržitým během (villager-schedule.ts, test splynutí); jinak od
   * poslední činnosti, jen když skončila (další vyjití podle obsazení v tu chvíli).
   */
  activity(id: number, t: number): Activity {
    return this.entry(id, t).act;
  }

  /** Póza postavy člověka v `t` – doma skrytá u dveří (`activityPose` po fázích činnosti). */
  pose(id: number, t: number, herds: readonly HerdView[], out: VillagerPose): VillagerPose {
    const e = this.entry(id, t);
    const router = this.router;
    e.pose ??= activityPose(
      e.act,
      this.doorOf(id) ?? e.act.task?.at ?? { x: 0, z: 0 },
      router ? { routeOf: (from, to) => router(id, from, to), speed: this.speed } : undefined,
      this.phasesOf(e),
    );
    return e.pose(t, herds, out);
  }

  /** Fáze činnosti člověka v `t` (villager-phases.ts – panel postavy, tempo nohou). */
  phase(id: number, t: number): ActivityPhase {
    return phaseAt(this.phasesOf(this.entry(id, t)), t);
  }

  /**
   * Kde člověk v činnosti `a` v `t` je – stejně jako kreslená póza (fáze, přesná trasa): odtud jde
   * k události a od tohoto místa se měří dosah k požáru (villager-schedule.ts – `whereAt`).
   */
  private placeAt(a: Activity, t: number): Point {
    const id = a.person;
    const router = this.router;
    const pose = activityPose(
      a,
      this.doorOf(id) ?? a.task?.at ?? { x: 0, z: 0 },
      router ? { routeOf: (from, to) => router(id, from, to), speed: this.speed } : undefined,
      activityPhases(a, this.seed, (p, q) => this.input.walkS!(p, q, id)),
    )(t, [], createVillagerPose());
    return { x: pose.x, z: pose.z };
  }

  private phasesOf(e: Entry): ActivityPhase[] {
    e.phases ??= activityPhases(e.act, this.seed, (a, b) => this.input.walkS!(a, b, e.act.person));
    return e.phases;
  }

  /**
   * Je člověk v `t` doma – mezi činnostmi, po návratu z pochůzky (do konce činnosti na mřížce)
   * nebo bez úlohy?
   */
  indoors(id: number, t: number): boolean {
    return activityIndoors(this.entry(id, t).act, t);
  }

  private entry(id: number, t: number): Entry {
    let e = this.entries.get(id);
    if (!e || t < e.act.start || t - e.act.end > HISTORY_S) {
      e = { act: scheduleAt(this.input, id, t), pose: null };
      this.entries.set(id, e);
      return e;
    }
    while (t >= e.act.end) {
      e.act = this.after(id, e.act);
      e.pose = null;
      e.phases = null;
    }
    return e;
  }

  /** Činnost po `prev` (villager-schedule.ts – `nextActivity`), přerušená událostí do ní. */
  private after(id: number, prev: Activity): Activity {
    return settle(this.input, id, nextActivity(this.input, id, prev));
  }
}

/** Je člověk v činnosti `a` v okamžik `t` doma? */
export function activityIndoors(a: Activity, t: number): boolean {
  const task = a.task;
  if (a.kind === 'home' || !task || t < a.start || t >= a.end) return true;
  return task.kind === 'errand' && task.errand !== null && t - a.start >= task.errand.homeS;
}

/** Co o vybraném člověku s rozvrhem řekne panel (person-activity.ts – `PersonFigureState`). */
export interface ScheduledState {
  /** Úloha rozběhnuté činnosti (i přes přelom dne); doma null. */
  job: PersonJob | null;
  /** Cesta k práci či z ní (práce na místě, úloha u objektu); jinak null. */
  leg: ActivityLeg | null;
  /** Je doma (postava není vidět). */
  home: boolean;
  /** Vešel do domu, když byl předtím venku – výběr se zruší (kromě vojvody). */
  indoors: boolean;
  /**
   * Fáze činnosti, když ji panel řekne jinak než úloha (villager-phases.ts – váže snopy, pere
   * rudu, nese nástroje…); cesta, práce úlohy a doma null.
   */
  phase: PhaseName | null;
}

/**
 * Stav vybraného člověka z jeho rozvrhu (villagers.md – Výběr postavy): úloha a úsek platí celou
 * činnost, i když simulace mezitím přešla na jinou práci. `wasOut` = viděl ho výběr venku; když
 * pak zajde do domu, `indoors` – výběr se zruší, **kromě vojvody** (`lord` – panel říká „doma“).
 */
export function scheduledState(
  a: Activity,
  t: number,
  wasOut: boolean,
  lord: boolean,
  phase: ActivityPhase | null = null,
): ScheduledState {
  const home = activityIndoors(a, t);
  const stage = activityStage(a, t);
  const leg = !home && a.kind !== 'errand' && (stage === 'out' || stage === 'back') ? stage : null;
  const named = phase && !home && !GENERIC_PHASES.has(phase.name) ? phase.name : null;
  return {
    job: home ? null : (a.task?.job ?? null),
    leg,
    home,
    indoors: home && wasOut && !lord,
    phase: named,
  };
}

/** Fáze, které panel řekne podle úlohy a úseku cesty (ne podle fáze). */
const GENERIC_PHASES: ReadonlySet<PhaseName> = new Set(['out', 'work', 'back', 'home']);
