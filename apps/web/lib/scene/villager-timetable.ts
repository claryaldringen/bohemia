// Rozvrhy lidí vsi ve scéně (docs/design/villagers.md – Činnosti od začátku do konce, úloha 3):
// obsazení posledních dnů v paměti, poslední činnost každého člověka a póza z ní. Postava člověka
// je jeho rozvrh – přelom herního dne rozběhnutou činnost nepřeruší, novou práci si člověk vybere
// až při dalším vyjití z domu (villager-schedule.ts). Čistý modul bez Babylonu; počítá líně –
// činnost člověka jen tehdy, když scéna chce jeho pózu (ves v záběru) nebo stav vybraného.
import {
  activityLength,
  activityPose,
  activityStage,
  castTimeline,
  departAfter,
  HISTORY_S,
  scheduleAt,
  straightWalk,
  type Activity,
  type CastSpan,
  type DayCast,
  type ScheduleInput,
} from './villager-schedule';
import type { HerdView, PoseFn, VillagerPose } from './villager-motion';
import type { PersonJob } from './villager-roster';

/** Kolik herních dnů obsazení si scéna pamatuje (villagers.md – Pro implementaci, úloha 3). */
export const MAX_DAYS = 30;

/** Bod na zemi (m). */
interface Point {
  x: number;
  z: number;
}

/** Poslední činnost člověka, póza z ní (líně) a další činnost po návratu (doma – kdy vyjde). */
interface Entry {
  act: Activity;
  pose: PoseFn | null;
}

/** Úsek cesty činnosti pro panel postavy: k práci a z ní (pochůzku řekne její póza). */
export type ActivityLeg = 'out' | 'back';

/**
 * Rozvrhy lidí jedné vsi (`seed`) – `speed` = tempo chůze rovně ode dveří (m/s; do úlohy 6, pak
 * délky ze sítě pěšin). Obsazení dnů přidává `setDay` (z plánu dne), dveře domů `setDoors`.
 */
export class Timetable {
  private days: { day: number; from: number; cast: DayCast }[] = [];
  private castOf: (t: number) => CastSpan = castTimeline([]);
  private doors: ReadonlyMap<number, Point | null> = new Map();
  private readonly entries = new Map<number, Entry>();
  readonly input: ScheduleInput;

  constructor(
    readonly seed: number,
    speed: number,
  ) {
    this.input = {
      seed,
      castOf: (t) => this.castOf(t),
      lengthOf: straightWalk((id) => this.doors.get(id) ?? null, speed),
    };
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
    for (const [id, e] of this.entries) {
      const a = e.act;
      if (a.kind === 'home') {
        // doma – vyjde podle obsazení, jaké je teď (villagers.md: rozhoduje se při vyjití)
        const out = departAfter(this.input, id, a.start);
        e.act = { ...a, end: out ? out.start : Infinity };
        e.pose = null;
      } else if (a.kind === 'hold' && a.task) {
        // úloha u objektu – s novým dnem ji obsazení může přestat dávat
        e.act = activityLength(this.input, id, a.start, a.task) ?? a;
        e.pose = null;
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

  /** Póza postavy člověka v `t` – doma skrytá u dveří (`activityPose`). */
  pose(id: number, t: number, herds: readonly HerdView[], out: VillagerPose): VillagerPose {
    const e = this.entry(id, t);
    e.pose ??= activityPose(e.act, this.doorOf(id) ?? e.act.task?.at ?? { x: 0, z: 0 });
    return e.pose(t, herds, out);
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
    }
    return e;
  }

  /** Činnost po `prev`: po činnosti doma (pauza do dalšího vyjití), z domu další činnost. */
  private after(id: number, prev: Activity): Activity {
    const home = (since: number, out: Activity | null): Activity => ({
      person: id,
      kind: 'home',
      task: null,
      start: since,
      arrive: since,
      leave: since,
      end: out ? out.start : Infinity,
    });
    if (prev.kind !== 'home') return home(prev.end, departAfter(this.input, id, prev.end));
    return departAfter(this.input, id, prev.start) ?? home(prev.end, null);
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
): ScheduledState {
  const home = activityIndoors(a, t);
  const stage = activityStage(a, t);
  const leg = !home && a.kind !== 'errand' && (stage === 'out' || stage === 'back') ? stage : null;
  return {
    job: home ? null : (a.task?.job ?? null),
    leg,
    home,
    indoors: home && wasOut && !lord,
  };
}
