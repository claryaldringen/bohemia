// Rozvrh člověka ve skutečném čase (docs/design/villagers.md – Činnosti od začátku do konce;
// Martin 31. 10. 2026: „Činnost typicky začíná tím, že postava vyjde z domu a končí tím, že
// postava do domu zajde.“): každý člověk vsi má řadu celých činností – vyjde ze dveří, dojde
// k práci či cíli, pracuje a vrátí se domů; mezi nimi chvíli doma. Co při vyjití dělá, dá obsazení
// dne v tu chvíli (`DayCast` – villager-plan.ts), přelom herního dne rozběhnutou činnost
// nepřeruší. Čisté funkce skutečného času (s, `villagerSeconds`) bez Babylonu: stejný okamžik
// a stejný vstup = stejná činnost, nic se nepočítá krokově za snímek. Volá se při vyjití
// a změně obsazení, ne za snímek.
import { createVillagerPose, type PoseFn } from './villager-motion';
import type { DraftCrew, Errand, PlannedVillager } from './villager-plan-types';
import type { PersonJob } from './villager-roster';
import { hash01 } from './smoke-schedule';

/**
 * Mřížka začátků a konců činností (s – villagers.md, Determinismus a načtení stránky): řetězy
 * započaté v různých okamžicích splynou, jakmile padnou na týž bod mřížky.
 */
export const GRID_S = 30;

/**
 * O kolik zpět se po načtení stránky dohrává řetěz činností (s – 40 minut ≈ 28 herních dní, déle
 * než nejdelší činnost; villagers.md – Determinismus a načtení stránky).
 */
export const HISTORY_S = 40 * 60;

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
 * Zvon (návrh Clauda – villagers.md, Determinismus a načtení stránky): každý člověk má po
 * `BELL_S` vlastní okamžik, kdy je doma – činnost, která by ho přesáhla, nezačne (práce na místě
 * se zkrátí, pochůzka počká doma) a po zvonu vyjde v týž okamžik každý řetěz. Řetězy z různých
 * počátků tak splynou nejpozději u prvního zvonu (`BELL_S` < `HISTORY_S`); úlohy u objektu
 * (`hold`) zvon nepřeruší – splynou svým koncem.
 */
export const BELL_S = 35 * 60;

/** Nejkratší práce na místě, kterou zvon ještě nechá začít (s); kratší – člověk počká doma. */
export const MIN_WORK_S = 60;

/** Druh práce na místě – rozsah její délky (`WORK_RANGE_S`). */
export type WorkRange = keyof typeof WORK_RANGE_S;

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
  lengthOf(personId: number, task: PersonTask): TaskWalk;
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
  const walk = input.lengthOf(personId, task);
  const arrive = start + walk.outS;
  const made = (end: number): Activity => ({
    person: personId,
    kind: task.kind,
    task,
    start,
    arrive,
    leave: end - walk.backS,
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
  // úloha u objektu – drží ji, dokud ji obsazení dne dává (i přes přelom dne)
  let until = input.castOf(start).until;
  for (let n = 0; n < MAX_STEPS && until !== Infinity; n++) {
    const next = input.castOf(until);
    if (next.cast.get(personId)?.key !== task.key) break;
    until = next.until;
  }
  if (until === Infinity) return made(Infinity);
  return made(gridUp(Math.max(until, arrive) + walk.backS));
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
    const task = span.cast.get(personId);
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
  let since = gridDown(origin);
  for (let n = 0; n < MAX_STEPS; n++) {
    const out = departAfter(input, personId, since);
    const home: Activity = {
      person: personId,
      kind: 'home',
      task: null,
      start: since,
      arrive: since,
      leave: since,
      end: out ? out.start : Infinity,
    };
    yield home;
    if (!out) return;
    yield out;
    if (out.end === Infinity) return;
    since = out.end;
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
  // události (pohřeb, svatba, požár, karavana) do úlohy 5 drží, dokud je obsazení dává
  'caravan',
  'funeral',
  'wedding',
  'fire',
]);

/** Práce podílu u objektu dne: kování koně u kůlu, parta porážky u stanoviště. */
const HOLD_SHARES: ReadonlySet<string> = new Set(['horse-shoeing', 'slaughter']);

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
  // starší u domu, vojvodova rodina na cvičišti a u dvorce
  if (job.kind === 'elder' || job.kind === 'lord') return { kind: 'bout', range: 'short' };
  return { kind: 'bout', range: 'long' };
}

/**
 * Obsazení dne jako člověk → úloha (villagers.md – Divadlo): z postav dne (`people` s člověkem)
 * a lidí u spřežení a vozů (`crew`). `holds` = klíče postav prvních stavitelů (úloha u stavby).
 * Každý člověk nejvýš jednou (DayRoster); bez lidí ve scéně prázdné.
 */
export function personTasks(
  people: readonly PlannedVillager[],
  crew: DraftCrew,
  holds: ReadonlySet<string> = new Set(),
): Map<number, PersonTask> {
  const out = new Map<number, PersonTask>();
  const pose = createVillagerPose();
  for (const f of people) {
    if (f.person === undefined || !f.job || out.has(f.person)) continue;
    f.pose(0, [], pose);
    out.set(f.person, {
      key: f.key,
      job: f.job,
      ...taskKind(f.job, f.errand !== undefined, holds.has(f.key)),
      pose: f.pose,
      errand: f.errand ?? null,
      at: { x: pose.x, z: pose.z },
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
