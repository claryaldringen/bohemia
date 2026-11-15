// Rozvrh člověka ve skutečném čase (docs/design/villagers.md – Činnosti od začátku do konce;
// Martin 31. 10. 2026: „Činnost typicky začíná tím, že postava vyjde z domu a končí tím, že
// postava do domu zajde.“): každý člověk vsi má řadu celých činností – vyjde ze dveří, dojde
// k práci či cíli, pracuje a vrátí se domů; mezi nimi chvíli doma. Co při vyjití dělá, dá obsazení
// dne v tu chvíli (`DayCast` – villager-plan.ts), přelom herního dne rozběhnutou činnost
// nepřeruší. Čisté funkce skutečného času (s, `villagerSeconds`) bez Babylonu: stejný okamžik
// a stejný vstup = stejná činnost, nic se nepočítá krokově za snímek. Volá se při vyjití
// a změně obsazení, ne za snímek.
import {
  alongRoute,
  createVillagerPose,
  TOOL_WALK,
  type HerdView,
  type PoseFn,
  type Route,
  type VillagerPose,
} from './villager-motion';
import type { ActivityPhase, PhasePlaces, PhaseRole } from './villager-phases';
import type { DraftCrew, Errand, PlannedVillager } from './villager-plan-types';
import type { PersonJob } from './villager-roster';
import { hash01 } from './smoke-schedule';

/**
 * Mřížka začátků a konců činností (s – villagers.md, Determinismus a načtení stránky): řetězy
 * započaté v různých okamžicích splynou, jakmile padnou na týž bod mřížky.
 */
export const GRID_S = 30;

/**
 * O kolik zpět se po načtení stránky dohrává řetěz činností (s – 60 minut ≈ 42 herních dní, déle
 * než nejdelší činnost a zvon `BELL_S`; villagers.md – Determinismus a načtení stránky).
 */
export const HISTORY_S = 60 * 60;

/** Pauza doma mezi činnostmi (s, los – villagers.md, Tři druhy činností: Doma). */
export const PAUSE_S = { from: 30, to: 90 } as const;

/**
 * Délka práce na místě podle druhu (s, los – villagers.md, Tři druhy činností; návrh Clauda):
 * řada na poli, stavba, kácení, sad, hřbitov, výmlat a dílna 3–8 minut (`long`), domácí práce
 * u domu, nečinní, starší a cvičiště 2–5 minut (`short`).
 */
export const WORK_RANGE_S = {
  long: { from: 3 * 60, to: 8 * 60 },
  short: { from: 2 * 60, to: 5 * 60 },
} as const;

/**
 * Zvon jednou za hodinu (návrh Clauda; Martin 31. 10. 2026: „Podle tvého doporučení“ –
 * villagers.md, Determinismus a načtení stránky): každý člověk má po `BELL_S` (55 minut, dlouhá
 * pochůzka venku ≈ 86 % času) vlastní okamžik, kdy je doma – činnost, která by ho přesáhla, nezačne (práce na místě
 * se zkrátí, pochůzka počká doma) a po zvonu vyjde v týž okamžik každý řetěz. Řetězy z různých
 * počátků tak splynou nejpozději u prvního zvonu (`BELL_S` < `HISTORY_S`); úlohy u objektu
 * (`hold`) zvon nepřeruší – splynou svým koncem.
 */
export const BELL_S = 55 * 60;

/** Nejkratší práce na místě, kterou zvon ještě nechá začít (s); kratší – člověk počká doma. */
export const MIN_WORK_S = 60;

/** Druh práce na místě – rozsah její délky (`WORK_RANGE_S`). */
export type WorkRange = keyof typeof WORK_RANGE_S;

/**
 * K požáru jdou jen lidé, kteří jsou v okamžiku vzplanutí blíž (m – návrh Clauda; villagers.md –
 * Události: „dospělí, kteří jsou ve vsi“); vzdálenější svou činnost dokončí.
 */
export const FIRE_REACH_M = 150;

/**
 * Jak úloha přeruší rozběhnutou činnost (villagers.md – Události): `all` – hned, ať člověk dělá
 * cokoli (pohřeb, svatba, karavana a odchod do nové vsi, jízda vojvodovy rodiny); `near` – jen
 * blízko (požár – `FIRE_REACH_M`).
 */
export type Interrupt = 'all' | 'near';

/**
 * Tři druhy činností (villagers.md): pochůzka (`errand` – délka celá z trasy), práce na místě
 * (`bout` – chůze tam, práce losem, chůze zpět) a úloha u objektu (`hold` – pasák u stáda, oráč
 * a honák u spřežení, vozka u vozu, první stavitel; drží ji, dokud ji obsazení dne dává).
 */
export type TaskKind = 'errand' | 'bout' | 'hold';

/** Činnost rozvrhu – druh úlohy, nebo doma (postava není vidět). */
export type ActivityKind = TaskKind | 'home';

/** Úloha člověka v obsazení dne – co dnes dělá, když vyjde z domu (villager-plan.ts). */
export interface PersonTask {
  /** Místo či trasa dne (klíč postavy – stejný klíč = táž úloha i zítra). */
  key: string;
  job: PersonJob;
  kind: TaskKind;
  /** Rozsah délky práce na místě (`bout`). */
  range: WorkRange;
  /** Póza úlohy dne; null – postavu kreslí spřežení nebo vůz (oráč, honák, vozka). */
  pose: PoseFn | null;
  /** Cyklus pochůzky (trasa a tempo – `shuttleErrand`); jen `errand`. */
  errand: Errand | null;
  /** Kde se pracuje (m) – odtud se počítá chůze ode dveří; null – u spřežení či vozu. */
  at: { x: number; z: number } | null;
  /**
   * Kde úloha v okamžik `t` je, když se místo samo mění – vojvodova rodina má vlastní den ve
   * skutečném čase (lord-day.ts: dvorec, terče, kůň, stání u dvorku). Chůze tam se pak měří
   * k místu v chvíli příchodu a zpět od místa v chvíli odchodu, ne k `at` (jinak by běžel).
   */
  placeAt?: (t: number) => { x: number; z: number };
  /** Událost – přeruší rozběhnutou činnost, jakmile ji obsazení dne dá (`Interrupt`). */
  interrupt?: Interrupt;
  /**
   * Posloupnost fází práce v místě (villager-phases.ts – Fáze činností) a kde se dělají kroky
   * jinde (odnos do domácností, pole žní). Bez role jen cesta, póza úlohy a návrat.
   */
  role?: PhaseRole;
  places?: PhasePlaces;
}

/** Obsazení dne: id člověka → úloha. Kdo v něm není, zůstane doma. */
export type DayCast = ReadonlyMap<number, PersonTask>;

/** Obsazení platné v okamžik `t` a odkdy dokdy platí (s; nejnovější známé do `Infinity`). */
export interface CastSpan {
  cast: DayCast;
  from: number;
  until: number;
}

/** Chůze a práce úlohy (s): ode dveří k místu, práce u cíle pochůzky, zpět ke dveřím. */
export interface TaskWalk {
  outS: number;
  /** Práce u cíle pochůzky (`errand`); práci na místě dá los (`WORK_RANGE_S`). */
  endS: number;
  backS: number;
}

/** Vstup rozvrhu: seed vsi, obsazení podle času a délky chůze úloh (ze sítě pěšin). */
export interface ScheduleInput {
  seed: number;
  castOf(t: number): CastSpan;
  /**
   * Chůze úlohy; `when` – kdy dojde (`out`) a kdy odchází (`back`) u úlohy s místem v čase
   * (`PersonTask.placeAt`), jinak se nepoužije.
   */
  lengthOf(personId: number, task: PersonTask, when?: { out?: number; back?: number }): TaskWalk;
  /** Dveře domu člověka (události – odkud jde, kdo je doma); bez údaje místo práce. */
  doorOf?(personId: number): Point | null;
  /** Chůze (s) z bodu do bodu – člověk jde z místa, kde ho událost zastihla; bez údaje 0. */
  walkS?(from: Point, to: Point, personId: number): number;
  /**
   * Je místo v okamžik `t` pod vodou povodně (villagers.md – Události: kdo má cíl na rozlité
   * vodě, jde domů; nové činnosti vedou jen po suché zemi)? Bez údaje sucho.
   */
  wet?(x: number, z: number, t: number): boolean;
  /**
   * Kde člověk v činnosti `a` v okamžik `t` je – jako kreslená póza, po fázích činnosti a po
   * trase (villager-timetable.ts): odkud jde k události, dosah k požáru. Bez údaje póza úlohy
   * bez fází a rovně.
   */
  placeAt?(a: Activity, t: number): Point;
}

/** Bod na zemi (m). */
export interface Point {
  x: number;
  z: number;
}

/**
 * Jedna činnost člověka (s): vyjde v `start`, u místa je v `arrive`, odchází v `leave` a vejde
 * do domu v `end` (mřížka `GRID_S`). Doma (`home`) od `start` do `end` – vyjde v `end`. Úloha
 * u objektu, kterou obsazení dává i v nejnovějším známém dni, má `leave` a `end` `Infinity`.
 */
export interface Activity {
  person: number;
  kind: ActivityKind;
  /** Úloha, se kterou vyšel (obsazení dne v `start`); doma null. */
  task: PersonTask | null;
  start: number;
  arrive: number;
  leave: number;
  end: number;
  /** Odkud člověk vyšel, když ho k úloze odvolala událost (jinak ode dveří). */
  from?: Point;
  /** Návrat domů z místa `from` (povodeň) – celá činnost je cesta domů. */
  retreat?: boolean;
  /** Přerušená činnost: kdy by skončila (chůze zpět si drží tempo) a co ji přerušilo. */
  cut?: { end: number; by: PersonTask | null };
}

/** Úsek činnosti: cesta tam, práce, cesta zpět, doma. */
export type ActivityStage = 'out' | 'work' | 'back' | 'home';

// soli losů – každý los rozvrhu jiný
const PAUSE_SALT = 0x5ced;
const WORK_SALT = 0x3a17;
const BELL_SALT = 0x6b11;

/** Nejvýš tolik kroků při hledání vyjití či konce úlohy – pojistka proti nekonečnému obsazení. */
const MAX_STEPS = 10_000;

/** Okamžik `t` zaokrouhlený nahoru na mřížku `GRID_S`. */
export function gridUp(t: number): number {
  return Math.ceil(t / GRID_S - 1e-9) * GRID_S;
}

/** Okamžik `t` zaokrouhlený dolů na mřížku `GRID_S`. */
export function gridDown(t: number): number {
  return Math.floor(t / GRID_S + 1e-9) * GRID_S;
}

/** Číslo bodu mřížky (los podle začátku). */
function cell(t: number): number {
  return Math.round(t / GRID_S);
}

/** Kdy člověk, který vešel do domu v `endT`, znovu vyjde (pauza doma losem, mřížka). */
export function nextStart(seed: number, personId: number, endT: number): number {
  const r = hash01(seed ^ PAUSE_SALT, personId, cell(endT));
  return gridUp(endT + PAUSE_S.from + r * (PAUSE_S.to - PAUSE_S.from));
}

/** První zvon člověka v `t` nebo po něm (`BELL_S`, mřížka). */
export function bellAt(seed: number, personId: number, t: number): number {
  const phase = gridDown(hash01(seed ^ BELL_SALT, personId, 7) * BELL_S);
  return phase + Math.ceil((t - phase) / BELL_S - 1e-9) * BELL_S;
}

/** Délka práce na místě (s) – los v rozsahu druhu podle člověka a začátku činnosti. */
export function workLength(
  range: WorkRange,
  seed: number,
  personId: number,
  start: number,
): number {
  const { from, to } = WORK_RANGE_S[range];
  return from + hash01(seed ^ WORK_SALT, personId, cell(start)) * (to - from);
}

/**
 * Činnost s úlohou `task`, která začne v `start` (villagers.md – Délka činnosti): pochůzka celá
 * z trasy, práce na místě = cesta tam + práce losem + cesta zpět, úloha u objektu do přelomu dne,
 * od kterého ji obsazení nedává (pak pěšky domů). Konec na mřížce, zbytek do mřížky připadne
 * práci. Nevejde-li se pochůzka či práce na místě do `limit` (zvon), null.
 */
export function activityLength(
  input: ScheduleInput,
  personId: number,
  start: number,
  task: PersonTask,
  limit = Infinity,
): Activity | null {
  // úloha s místem v čase – k místu, kde bude v chvíli příchodu (jedno zpřesnění)
  const first = input.lengthOf(personId, task, { out: start, back: start });
  const walk = task.placeAt
    ? input.lengthOf(personId, task, { out: start + first.outS, back: start })
    : first;
  const arrive = start + walk.outS;
  const made = (end: number, backS = walk.backS): Activity => ({
    person: personId,
    kind: task.kind,
    task,
    start,
    arrive,
    leave: end - backS,
    end,
  });
  if (task.kind === 'errand') {
    const end = gridUp(arrive + walk.endS + walk.backS);
    return end <= limit ? made(end) : null;
  }
  if (task.kind === 'bout') {
    const work = Math.min(
      workLength(task.range, input.seed, personId, start),
      limit - arrive - walk.backS,
    );
    return work >= MIN_WORK_S ? made(gridUp(arrive + work + walk.backS)) : null;
  }
  const until = holdUntil(input, personId, start, task);
  if (until === Infinity) return made(Infinity);
  const leave = Math.max(until, arrive);
  const backS = input.lengthOf(personId, task, { back: leave }).backS;
  return made(gridUp(leave + backS), backS);
}

/** Úloha u objektu – drží ji, dokud ji obsazení dne dává (i přes přelom dne): přelom bez ní. */
function holdUntil(
  input: ScheduleInput,
  personId: number,
  start: number,
  task: PersonTask,
): number {
  let until = input.castOf(start).until;
  for (let n = 0; n < MAX_STEPS && until !== Infinity; n++) {
    const next = input.castOf(until);
    if (next.cast.get(personId)?.key !== task.key) break;
    until = next.until;
  }
  return until;
}

/** Je místo úlohy v okamžik `t` pod vodou povodně? */
function wetTask(input: ScheduleInput, task: PersonTask, t: number): boolean {
  return task.at !== null && input.wet !== undefined && input.wet(task.at.x, task.at.z, t);
}

/** Doma od `since` do vyjití `out` (bez něj do `Infinity`). */
function homeActivity(personId: number, since: number, out: Activity | null): Activity {
  return {
    person: personId,
    kind: 'home',
    task: null,
    start: since,
    arrive: since,
    leave: since,
    end: out ? out.start : Infinity,
  };
}

/** Činnost bez přerušení (jak by šla celá). */
export function uncut(a: Activity): Activity {
  if (!a.cut) return a;
  const { cut, ...rest } = a;
  return { ...rest, end: cut.end };
}

/** Kde člověk v činnosti `a` v okamžik `t` je (doma u dveří; jinak `ScheduleInput.placeAt`). */
function whereAt(input: ScheduleInput, a: Activity, t: number): Point {
  const door = input.doorOf?.(a.person) ?? a.task?.at ?? { x: 0, z: 0 };
  if (a.kind === 'home') return door;
  if (input.placeAt) return input.placeAt(a, t);
  const pose = activityPose(uncut(a), door)(t, [], createVillagerPose());
  return { x: pose.x, z: pose.z };
}

/**
 * Úloha u objektu, ke které člověk šel odjinud (`a.from`) – konec znovu podle obsazení (nový den
 * ji může ukončit), příchod zůstává.
 */
export function rehold(input: ScheduleInput, personId: number, a: Activity): Activity {
  if (!a.task || a.retreat) return a;
  const until = holdUntil(input, personId, a.start, a.task);
  if (until === Infinity) return { ...a, leave: Infinity, end: Infinity };
  const backS = input.lengthOf(personId, a.task, { back: Math.max(until, a.arrive) }).backS;
  const end = gridUp(Math.max(until, a.arrive) + backS);
  return { ...a, leave: end - backS, end };
}

/**
 * Co přeruší činnost `a` (villagers.md – Události): první přelom dne v jejím průběhu, od kterého
 * obsazení dává událost (`PersonTask.interrupt` – k požáru jen kdo je blízko), nebo kdy je místo
 * práce pod vodou (povodeň – `task` null, jde domů). Bez přerušení null.
 */
function interruption(
  input: ScheduleInput,
  personId: number,
  a: Activity,
): { at: number; task: PersonTask | null } | null {
  let t = input.castOf(a.start).until;
  for (let n = 0; n < MAX_STEPS && t < a.end; n++) {
    const span = input.castOf(t);
    const task = span.cast.get(personId);
    if (task?.interrupt && task.key !== a.task?.key) {
      const at = task.at;
      const where = at && task.interrupt === 'near' ? whereAt(input, a, t) : null;
      if (!where || !at || Math.hypot(where.x - at.x, where.z - at.z) <= FIRE_REACH_M) {
        return { at: t, task };
      }
    }
    if (a.kind !== 'home' && !a.retreat && a.task && t < a.leave && wetTask(input, a.task, t)) {
      return { at: t, task: null };
    }
    t = span.until;
  }
  return null;
}

/** Činnost `a`, nebo její část do přerušení (událost, povodeň). */
export function settle(input: ScheduleInput, personId: number, a: Activity): Activity {
  const whole = uncut(a);
  const cut = interruption(input, personId, whole);
  return cut ? { ...whole, end: cut.at, cut: { end: whole.end, by: cut.task } } : whole;
}

/**
 * Další činnost po `prev` (bez přerušení – to přidá `settle`): po přerušené k události (pěšky
 * z místa, kde ho zastihla) nebo domů (povodeň), po činnosti doma, z domu další vyjití.
 */
export function nextActivity(input: ScheduleInput, personId: number, prev: Activity): Activity {
  if (prev.cut) {
    const at = prev.end;
    const from = whereAt(input, uncut(prev), at);
    const task = prev.cut.by;
    if (!task) {
      // povodeň – otočí se a jde domů
      const door = input.doorOf?.(personId) ?? from;
      const back = input.walkS?.(from, door, personId) ?? 0;
      return {
        person: personId,
        kind: prev.kind === 'home' ? 'bout' : prev.kind,
        task: prev.task,
        start: at,
        arrive: at,
        leave: at,
        end: gridUp(at + back),
        from,
        retreat: true,
      };
    }
    // k místu úlohy – u úlohy s místem v čase tam, kde bude v chvíli příchodu (jedno zpřesnění)
    const walkTo = (p: Point | null): number => (p ? (input.walkS?.(from, p, personId) ?? 0) : 0);
    const first = walkTo(task.placeAt?.(at) ?? task.at);
    const approach = task.placeAt ? walkTo(task.placeAt(at + first)) : first;
    return rehold(input, personId, {
      person: personId,
      kind: 'hold',
      task,
      start: at,
      arrive: at + approach,
      leave: Infinity,
      end: Infinity,
      from,
    });
  }
  if (prev.kind !== 'home') {
    return homeActivity(personId, prev.end, departAfter(input, personId, prev.end));
  }
  return departAfter(input, personId, prev.start) ?? homeActivity(personId, prev.end, null);
}

/**
 * Další činnost člověka, který je doma od `since` (villagers.md – Ve frontě je jen další
 * činnost): vyjde po pauze (`nextStart`) s úlohou obsazení dne v tu chvíli; kdo v obsazení není,
 * zůstane doma a zkusí to po další pauze. Zvon (`BELL_S`): činnost, která by ho přesáhla,
 * nezačne – po zvonu vyjde každý řetěz v týž okamžik. Null – v nejnovějším známém obsazení
 * člověk není (doma, dokud nepřijde nové).
 */
export function departAfter(
  input: ScheduleInput,
  personId: number,
  since: number,
): Activity | null {
  const { seed } = input;
  let bell = bellAt(seed, personId, since);
  let start = nextStart(seed, personId, since);
  for (let n = 0; n < MAX_STEPS; n++) {
    let limit = bell;
    const canonical = start >= bell;
    if (canonical) {
      // doma přes zvon – vyjde v týž okamžik, ať byl doma odkdykoli
      start = nextStart(seed, personId, bell);
      bell += BELL_S;
      limit = bell;
    }
    const span = input.castOf(start);
    const found = span.cast.get(personId);
    // povodeň – na rozlitou vodu nikdo nejde (zkusí to po další pauze)
    const task = found && !wetTask(input, found, start) ? found : undefined;
    if (task) {
      const out =
        activityLength(input, personId, start, task, task.kind === 'hold' ? Infinity : limit) ??
        // po zvonu vyjde vždy, i kdyby činnost byla delší než do dalšího zvonu
        (canonical ? activityLength(input, personId, start, task) : null);
      if (out) return out;
      // nevejde se před zvon – počká doma do zvonu
      start = bell;
      continue;
    }
    if (span.until === Infinity) return null;
    start = nextStart(seed, personId, start);
  }
  return null;
}

/**
 * Řetěz činností člověka od `origin` (doma od počátku – mřížka dolů): doma, činnost, doma… Končí
 * činností, která trvá do `Infinity` (úloha u objektu nebo doma bez úlohy v nejnovějším dni).
 */
export function* activities(
  input: ScheduleInput,
  personId: number,
  origin: number,
): Generator<Activity, void, undefined> {
  const since = gridDown(origin);
  let a = settle(
    input,
    personId,
    homeActivity(personId, since, departAfter(input, personId, since)),
  );
  for (let n = 0; n < MAX_STEPS; n++) {
    yield a;
    if (a.end === Infinity) return;
    a = settle(input, personId, nextActivity(input, personId, a));
  }
}

/**
 * Činnost člověka v okamžik `t` (villagers.md – Determinismus a načtení stránky): řetěz od
 * `origin` (bez údaje `t − HISTORY_S` – po načtení stránky). Čistá funkce vstupu a času: stejný
 * `t` a počátek = stejná činnost; řetězy z různých počátků splynou nejpozději u zvonu.
 */
export function scheduleAt(
  input: ScheduleInput,
  personId: number,
  t: number,
  origin = t - HISTORY_S,
): Activity {
  let last: Activity | null = null;
  for (const a of activities(input, personId, Math.min(origin, t))) {
    last = a;
    if (t < a.end) return a;
  }
  // pojistka (MAX_STEPS) – doma
  return (
    last ?? { person: personId, kind: 'home', task: null, start: t, arrive: t, leave: t, end: t }
  );
}

/** Úsek činnosti `a` v okamžik `t`. */
export function activityStage(a: Activity, t: number): ActivityStage {
  if (a.kind === 'home' || t >= a.end) return 'home';
  if (t < a.arrive) return 'out';
  if (t < a.leave) return 'work';
  return 'back';
}

/**
 * Obsazení podle času z obsazení dnů (vzestupně podle začátku `from`, s): dny před nejstarším
 * známým nahradí nejstarší (villagers.md – Martin 31. 10. 2026: dva prohlížeče „zatím stačí
 * srovnat“), nejnovější platí do `Infinity`. Bez dnů nikdo nic.
 */
export function castTimeline(
  days: readonly { from: number; cast: DayCast }[],
): (t: number) => CastSpan {
  const empty: CastSpan = { cast: new Map(), from: -Infinity, until: Infinity };
  return (t) => {
    if (days.length === 0) return empty;
    // poslední den se začátkem ≤ t (půlení), před prvním první
    let lo = 0;
    let hi = days.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (days[mid]!.from <= t) lo = mid;
      else hi = mid - 1;
    }
    const day = days[lo]!;
    return {
      cast: day.cast,
      from: lo === 0 ? -Infinity : day.from,
      until: lo + 1 < days.length ? days[lo + 1]!.from : Infinity,
    };
  };
}

/** Úlohy u objektu – objekt je ve scéně celý den (villagers.md – Úlohy u jiného objektu). */
const HOLD_JOBS: ReadonlySet<PersonJob['kind']> = new Set([
  'herd',
  'plough',
  'cart',
  'watch',
  // události (pohřeb, svatba, požár, karavana) drží, dokud je obsazení dává, a přerušují
  'caravan',
  'funeral',
  'wedding',
  'fire',
]);

/**
 * Práce podílu u objektu dne: kování koně u kůlu, parta porážky u stanoviště a stavba – všichni
 * stavitelé stavby s dnešní prací u ní zůstanou, dokud jim ji obsazení dne dává, nechodí mezi
 * dávkami domů (Martin 15. 11. 2026: „Proč jde tenhle rolník domů? Měl by stavět.“).
 */
const HOLD_SHARES: ReadonlySet<string> = new Set(['horse-shoeing', 'slaughter', 'build']);

/** Kratší práce na místě (`WORK_RANGE_S.short`): domácí práce, nečinní. */
const SHORT_SHARES: ReadonlySet<string> = new Set(['domestic', 'idle']);

/** Druh úlohy a rozsah délky práce podle toho, co postava dělá. */
export function taskKind(
  job: PersonJob,
  errand: boolean,
  hold: boolean,
): { kind: TaskKind; range: WorkRange } {
  if (errand) return { kind: 'errand', range: 'long' };
  if (hold || HOLD_JOBS.has(job.kind)) return { kind: 'hold', range: 'long' };
  if (job.kind === 'share') {
    if (HOLD_SHARES.has(job.activity)) return { kind: 'hold', range: 'long' };
    return { kind: 'bout', range: SHORT_SHARES.has(job.activity) ? 'short' : 'long' };
  }
  // vojvodova rodina má vlastní den ve skutečném čase (lord-day.ts – sám vyjde z dvorce a vejde):
  // drží ho, dokud ho obsazení dává, a přes přelom dne navazuje (žně – na pole dojde, vrátí se)
  if (job.kind === 'lord') return { kind: 'hold', range: 'short' };
  // starší u domu, mistr huti bez práce na kostele u domu
  if (job.kind === 'elder' || (job.kind === 'master' && job.work === 'home')) {
    return { kind: 'bout', range: 'short' };
  }
  return { kind: 'bout', range: 'long' };
}

/** Jak úloha přeruší rozběhnutou činnost (villagers.md – Události); jiné úlohy nepřerušují. */
export function interruptOf(job: PersonJob, rider: boolean): Interrupt | undefined {
  if (rider || job.kind === 'funeral' || job.kind === 'wedding' || job.kind === 'caravan') {
    return 'all';
  }
  return job.kind === 'fire' ? 'near' : undefined;
}

/**
 * Obsazení dne jako člověk → úloha (villagers.md – Divadlo): z postav dne (`people` s člověkem)
 * a lidí u spřežení a vozů (`crew`). `holds` = klíče postav prvních stavitelů (úloha u stavby).
 * Jezdci s trasou (`crew.rides` – kůň nesmí jet bez jezdce) drží úlohu jako událost. Místo úlohy
 * (`at`) je póza v `probeT` (začátek dne). Každý člověk nejvýš jednou (DayRoster); bez lidí ve scéně prázdné.
 */
export function personTasks(
  people: readonly PlannedVillager[],
  crew: DraftCrew,
  holds: ReadonlySet<string> = new Set(),
  probeT = 0,
  phasesOf?: (f: PlannedVillager, at: Point) => { role: PhaseRole; places?: PhasePlaces } | null,
  herds: readonly HerdView[] = [],
): Map<number, PersonTask> {
  const riders = new Set((crew.rides ?? []).filter((r) => r.route !== null).map((r) => r.riderId));
  const out = new Map<number, PersonTask>();
  const pose = createVillagerPose();
  for (const f of people) {
    if (f.person === undefined || !f.job || out.has(f.person)) continue;
    // se stády – pasák bez nich stojí u návsi, chůze ode dveří by se počítala tam, ne ke stádu
    f.pose(probeT, herds, pose);
    const rider = riders.has(f.person);
    const interrupt = interruptOf(f.job, rider);
    const at = { x: pose.x, z: pose.z };
    const phases = phasesOf?.(f, at) ?? null;
    out.set(f.person, {
      key: f.key,
      job: f.job,
      ...taskKind(f.job, f.errand !== undefined, rider || holds.has(f.key)),
      pose: f.pose,
      errand: f.errand ?? null,
      at,
      ...(f.job.kind === 'lord' ? { placeAt: placeOf(f.pose, herds) } : {}),
      ...(interrupt ? { interrupt } : {}),
      ...(phases ? { role: phases.role, ...(phases.places ? { places: phases.places } : {}) } : {}),
    });
  }
  const atObject = (id: number | null, key: string, job: PersonJob): void => {
    if (id === null || out.has(id)) return;
    out.set(id, { key, job, kind: 'hold', range: 'long', pose: null, errand: null, at: null });
  };
  crew.teams.forEach((team, k) => {
    atObject(team.ploughman, `plough:${k}:ploughman`, {
      kind: 'plough',
      team: k,
      role: 'ploughman',
    });
    atObject(team.leader, `plough:${k}:leader`, { kind: 'plough', team: k, role: 'leader' });
  });
  for (const c of crew.carts) atObject(c.drover, `cart:${c.cart}`, { kind: 'cart', cart: c.cart });
  return out;
}

/** Postava doma – skrytá u dveří. */
/** Místo pózy v čase (`PersonTask.placeAt`) – vlastní vzorek, nic nesdílí. */
function placeOf(pose: PoseFn, herds: readonly HerdView[]): (t: number) => Point {
  const probe = createVillagerPose();
  return (t) => {
    probe.hidden = false;
    const p = pose(t, herds, probe);
    return { x: p.x, z: p.z };
  };
}

function inside(out: VillagerPose, door: { x: number; z: number }): VillagerPose {
  out.x = door.x;
  out.z = door.z;
  out.clip = 'idle';
  out.pace = 1;
  out.stage = 'rest';
  out.hidden = true;
  return out;
}

/** Chůze rovně z (ax, az) do (bx, bz), podíl cesty `f` (0–1). */
function walkLine(
  out: VillagerPose,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  f: number,
): VillagerPose {
  const length = Math.hypot(bx - ax, bz - az);
  const k = Math.min(1, Math.max(0, f));
  out.x = ax + (bx - ax) * k;
  out.z = az + (bz - az) * k;
  if (length > 1e-6) {
    out.headingX = (bx - ax) / length;
    out.headingZ = (bz - az) / length;
  }
  out.clip = 'walk';
  out.pace = 1;
  return out;
}

/**
 * Přesná trasa chůze pro pózu (villagers.md – Cesty postav): `routeOf` hledá trasu z bodu do bodu
 * (null – rovně), `speed` = tempo chůze rozvrhu (m/s) – postava jde po trase tak, aby dorazila
 * v čase činnosti (tempo nohou `pace` podle poměru délky trasy a času).
 */
export interface PoseWalk {
  routeOf(from: Point, to: Point): Route | null;
  speed: number;
}

/** Tempo nohou při chůzi po trase jinak dlouhé, než počítá odhad – nejvýš tolikrát jinak. */
const PACE_RANGE = { from: 0.6, to: 1.8 } as const;

/**
 * Úsek chůze z (ax, az) do (bx, bz) za `duration` s, podíl `f`: po trase `r` (přesná trasa
 * v záběru), jinak rovně; tempo nohou podle délky a času (`speed`).
 */
function walkLeg(
  out: VillagerPose,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  f: number,
  r: Route | null,
  duration: number,
  speed: number | null,
): VillagerPose {
  const k = Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 1;
  let length: number;
  if (r && r.length > 1e-6) {
    alongRoute(r, k * r.length, false, out);
    out.clip = 'walk';
    length = r.length;
  } else {
    walkLine(out, ax, az, bx, bz, k);
    length = Math.hypot(bx - ax, bz - az);
  }
  out.pace =
    speed === null || duration <= 1e-6
      ? 1
      : Math.min(PACE_RANGE.to, Math.max(PACE_RANGE.from, length / duration / speed));
  return out;
}

/**
 * Póza činnosti `a` (napojení ve villagers.ts): doma skrytá u dveří; pochůzka podle cyklu úlohy
 * posunutého tak, že vyjde v `a.start` (po návratu skrytá); práce na místě a úloha u objektu – ode
 * dveří (nebo z místa, kde člověka zastihla událost) k místu práce, póza úlohy dne, zpět. S `walk`
 * po přesné trase (hledá se jednou za úsek, jen když se póza kreslí), jinak rovně. Úloha bez pózy
 * (oráč, honák, vozka – kreslí je spřežení a vůz) je ve fázi práce skrytá. S `phases`
 * (villager-phases.ts) jde práce v místě po fázích: fáze s klipem stojí, kde ji zastihla, s jiným
 * klipem; krok jinde dojde na své místo a zpět; návrat domů s klipem fáze (rybář s úlovkem).
 */
export function activityPose(
  a: Activity,
  door: Point,
  walk?: PoseWalk,
  phases?: readonly ActivityPhase[],
): PoseFn {
  const task = a.task;
  const probe = createVillagerPose();
  // kde postavu fáze s klipem zastihla (póza úlohy v začátku fáze) – podle začátku fáze
  const stops = new Map<number, { x: number; z: number; hx: number; hz: number }>();
  const phaseOf = (t: number): ActivityPhase | null => {
    if (!phases || phases.length === 0) return null;
    let found = phases[0]!;
    for (const p of phases) {
      if (p.from > t) break;
      found = p;
    }
    return found;
  };
  const speed = walk?.speed ?? null;
  // přesné trasy úseků – až při prvním kreslení úseku (undefined = ještě nehledaná)
  let going: Route | null | undefined;
  let coming: Route | null | undefined;
  const routed = (cached: Route | null | undefined, from: Point, to: Point): Route | null =>
    cached !== undefined ? cached : (walk?.routeOf(from, to) ?? null);
  return (t, herds, out) => {
    out.hidden = false;
    delete out.stage;
    if (!task || t < a.start || t >= a.end) return inside(out, door);
    // přerušená činnost jde do přerušení stejně, jako by šla celá
    const end = a.cut?.end ?? a.end;
    const from = a.from ?? door;
    if (a.retreat) {
      // povodeň – z místa, kde ho zastihla, rovnou domů
      coming = routed(coming, from, door);
      const span = end - a.start;
      walkLeg(out, from.x, from.z, door.x, door.z, (t - a.start) / span, coming, span, speed);
      out.stage = 'back';
      return out;
    }
    if (task.kind === 'errand' && task.errand && task.pose) {
      const since = t - a.start;
      if (since >= task.errand.homeS) return inside(out, door);
      return task.pose(since - task.errand.shiftS, herds, out);
    }
    if (t >= a.arrive && t < a.leave) {
      if (!task.pose) return inside(out, door);
      const phase = phaseOf(t);
      if (!phase?.clip) return task.pose(t, herds, out);
      return phasePose(phase, t, task.pose, herds, out);
    }
    const out1 = t < a.arrive;
    probe.hidden = false;
    const at = task.pose ? task.pose(out1 ? a.arrive : a.leave, herds, probe) : null;
    // událost skončila doma (pohřeb, svatba – průvod domů) – zpět už nejde
    if (!out1 && at?.hidden) return inside(out, door);
    const x = at?.x ?? task.at?.x ?? door.x;
    const z = at?.z ?? task.at?.z ?? door.z;
    if (out1) {
      // bod cíle jen pro první hledání trasy – za snímek nic nealokuje (null = bez trasy)
      if (going === undefined) going = routed(going, from, { x, z });
      const span = a.arrive - a.start;
      walkLeg(out, from.x, from.z, x, z, (t - a.start) / span, going, span, speed);
      out.stage = 'out';
      // k práci s motykou či sekerou na rameni (0 A.D. walk_hoe, walk_axe)
      const tool = at ? TOOL_WALK[at.clip] : undefined;
      if (tool) out.clip = tool;
    } else {
      if (coming === undefined) coming = routed(coming, { x, z }, door);
      const span = end - a.leave;
      walkLeg(out, x, z, door.x, door.z, (t - a.leave) / span, coming, span, speed);
      out.stage = 'back';
      const tool = at ? TOOL_WALK[at.clip] : undefined;
      if (tool) out.clip = tool;
      // návrat s nákladem (rybář nese úlovek)
      const back = phaseOf(t);
      if (back?.clip && back.from >= a.leave) out.clip = back.clip;
    }
    return out;
  };

  /** Fáze s klipem: stojí, kde ji zastihla (nebo na místě kroku jinde), cesta ke kroku a zpět. */
  function phasePose(
    phase: ActivityPhase,
    t: number,
    pose: PoseFn,
    herds: readonly HerdView[],
    out: VillagerPose,
  ): VillagerPose {
    if (phase.walk) {
      const { from, to } = phase.walk;
      const span = phase.to - phase.from;
      walkLeg(out, from.x, from.z, to.x, to.z, (t - phase.from) / span, null, span, speed);
      out.clip = phase.clip ?? 'walk';
      out.stage = phase.walk.from === task?.at ? 'out' : 'back';
      return out;
    }
    let stop = stops.get(phase.from);
    if (!stop) {
      probe.hidden = false;
      const p = pose(phase.from, herds, probe);
      const at = phase.at;
      const hx = at && task?.at ? at.x - task.at.x : p.headingX;
      const hz = at && task?.at ? at.z - task.at.z : p.headingZ;
      const n = Math.hypot(hx, hz) || 1;
      stop = { x: at?.x ?? p.x, z: at?.z ?? p.z, hx: hx / n, hz: hz / n };
      stops.set(phase.from, stop);
    }
    out.x = stop.x;
    out.z = stop.z;
    out.headingX = stop.hx;
    out.headingZ = stop.hz;
    out.clip = phase.clip!;
    out.pace = phase.pace ?? 1;
    return out;
  }
}
