import type { WorldClock } from '../domain/calendar';
import type { VillageState } from '../domain/village/types';
import type { GridCell } from '../domain/village/people/world-grid';
import {
  campaignFinished,
  CHECKPOINT_TICKS,
  isHarmlessArmy,
  MarchGridMemo,
  stepCampaign,
  tickOfMs,
  UNKNOWN_ALARM_OWNER,
  type AlarmOwner,
  type CampaignIntent,
  type CampaignMap,
  type CampaignOutbox,
  type CampaignState,
  type CampaignStep,
  type CampaignWorld,
} from '../domain/war';
import type {
  AlarmOwnerPort,
  CampaignCells,
  CampaignCheckpoint,
  CampaignLock,
  CampaignRepository,
  VillageCell,
} from './campaigns';
import type { HouseRepository } from './houses';
import type { NoticeRepository } from './notices';
import { passageCovers, type PassageRepository } from './passages';
import type { SettlementRepository } from './settlements';
import type { VassalageRepository } from './vassalages';
import type { VillageRecord, VillageRepository } from './villages';

// Takt workeru pro tažení (plán 2026-11-03 – Úloha 6.5, rozhodnutí 12): každé aktivní tažení
// pod zámkem dopočte z kontrolního bodu do teď, nejvýš po 40 taktech (nebo s událostmi) uloží nový
// bod a pak doručí události do schránek vsí (opakování téhož `ref` se zahodí) a upozornění.
// Restart workeru nebo webu tak pokračuje z bodu se stejným výsledkem (Review bod 5).

/** Kolikrát nejvýš se v jednom kole načítají chybějící mapy a vsi (každé kolo posune takty). */
const MAX_LOADS = 8;

export interface StepCampaignsDeps {
  campaigns: CampaignRepository;
  campaignLock: CampaignLock;
  cells: CampaignCells;
  /** Vsi tažení – s pamětí workeru se celý stav načte jen u vsí, jejichž otisk se změnil. */
  villages: Pick<VillageRepository, 'find' | 'stampsOfVillages' | 'inbox'>;
  notices: Pick<NoticeRepository, 'post'>;
  world: WorldClock;
  /**
   * Kdo ves vlastní a čí vojsko je jí neškodné (war.md – Obránci). Bez toho nikdo není varován
   * a každé vojsko škodí; composition root doplní vlastníka vsi a vztahy pána a vazalů
   * (`isHarmlessArmy`).
   */
  watchers?: VillageWatchers;
  /**
   * Kdo za varovanou ves rozhoduje, kandidáti hradišť a doména hradiště (war.md – Varování, poslové
   * a útěk do hradiště; plán 2026-11-09 – Úloha 6). Bez toho rod vsi neznámý (rozhoduje pravidlo),
   * hradiště ani doména žádné.
   */
  alarmOwners?: AlarmOwnerPort;
  /** Skončené tažení ukončí svá ohlášení průchodu (war.md – Pohyb). */
  passages?: Pick<PassageRepository, 'voidOfCampaign'>;
  /**
   * Paměť workeru napříč koly (`newCampaignMemory`) – jen zrychlení: bez ní se každé kolo
   * počítá od kontrolního bodu, s ní od posledního spočteného stavu se stejným výsledkem.
   */
  memory?: CampaignMemory;
}

/**
 * Poslední spočtený, ještě neuložený stav tažení (docs/code/worker.md – Výkon – Tažení) nebo výjezdu
 * (`S` = `JourneyState`). Platí, dokud stojí týž kontrolní bod (jeho verze z úložiště) a záměry do
 * `state.tick` jsou tytéž – pak je pokračování od něj tentýž výpočet jako od bodu (stav po taktech
 * nezávisí na kouscích).
 */
export interface CampaignMemo<S = CampaignState> {
  /** Verze kontrolního bodu, od kterého se počítalo (`CampaignCheckpoint.version`). */
  checkpoint: string;
  /** Záměry s taktem do `state.tick`, se kterými se počítalo (`seq@takt`). */
  intents: string;
  state: S;
}

/**
 * Paměť smyčky tažení napříč koly – drží ji vstupní bod (worker), jeden proces. Výjezdy mají vlastní
 * instanci (`S` = `JourneyState`, `stepJourneys`): konec kola zapomene vše, co mezi aktivními id
 * kola není (`forgetEnded`), sdílená paměť by tak zahodila záznamy druhé smyčky.
 */
export interface CampaignMemory<S = CampaignState> {
  /**
   * Kontrolní body načtené v minulých kolech: dokud úložiště hlásí tutéž verzi, kolo stav bodu
   * znovu nečte (`readCheckpoint` – JSON jen při změně). Bod se nemění na místě (takty kopírují).
   * Jen tažení – úložiště výjezdů verzi zvlášť nehlásí.
   */
  points: Map<string, CampaignCheckpoint>;
  states: Map<string, CampaignMemo<S>>;
  /** Mřížky pochodu napříč koly (klíč = identita krajiny, překážek a stavu vsi a den). */
  grids: MarchGridMemo;
  /**
   * Vsi načtené v posledním kole: ves téže verze (a jména) dostane tentýž objekt stavu, takže
   * její mřížky pochodu v `grids` platí dál (verze roste s každým uložením – stav je tentýž),
   * a znovu se nenačítá – stačí otisk (`stampsOfVillages`, `loadVillages`).
   */
  villages: Map<string, VillageRecord>;
  /** Vsi načtené v tomto kole – ostatní se na konci kola zapomenou. */
  seen: Set<string>;
  /**
   * Co tažení (výjezd) v posledním kole četlo (mapy políček a vsi) – další kolo to načte předem
   * (`computeWithLoads`), ať první krok nečeká zbytečně. Jen seznam: data se načtou znovu stejně
   * jako na vyžádání (mapa z `CampaignCells`, ves podle otisku, vlastník a vztahy). Dotazy
   * varování ne – takt je potřebuje jen občas (ves vstupuje do varování), předem by byly navíc.
   */
  needs: Map<string, CampaignNeeds>;
}

/** Co tažení v kole četlo – políčka map a vsi (i neexistující). */
export interface CampaignNeeds {
  cells: readonly GridCell[];
  villageIds: readonly string[];
}

/** Prázdná paměť smyčky tažení (výjezdů: `newCampaignMemory<JourneyState>()`). */
export function newCampaignMemory<S = CampaignState>(): CampaignMemory<S> {
  return {
    points: new Map(),
    states: new Map(),
    grids: new MarchGridMemo(),
    villages: new Map(),
    seen: new Set(),
    needs: new Map(),
  };
}

/** Ves z úložiště – téže verze a jména jako v paměti = záznam z paměti (tentýž objekt stavu). */
function recallVillage(
  memory: CampaignMemory<unknown> | undefined,
  record: VillageRecord | null,
): VillageRecord | null {
  if (!memory || !record) return record;
  memory.seen.add(record.id);
  const known = memory.villages.get(record.id);
  if (known && known.version === record.version && known.name === record.name) return known;
  memory.villages.set(record.id, record);
  return record;
}

/**
 * Vsi `villageIds` z úložiště (neznámá – null): s pamětí workeru se nejdřív zeptá jen na otisky
 * (verze a jméno bez stavu) a celý stav (u velké vsi přes 2 MB JSON) načte jen u vsí, které paměť
 * nemá nebo jejichž verze či jméno se liší. Každý zápis stavu verzi zvedá (uložení, post do
 * schránky), přejmenování mění jméno – výsledek je tedy tentýž jako `find` u každé vsi.
 */
async function loadVillages(
  deps: Pick<StepCampaignsDeps, 'villages'> & { memory?: CampaignMemory<unknown> },
  villageIds: readonly string[],
): Promise<Map<string, VillageRecord | null>> {
  const memory = deps.memory;
  const known = memory ? villageIds.filter((id) => memory.villages.has(id)) : [];
  const stamps =
    known.length > 0
      ? new Map((await deps.villages.stampsOfVillages(known)).map((s) => [s.id, s]))
      : null;
  const records = new Map<string, VillageRecord | null>();
  for (const villageId of villageIds) {
    if (records.has(villageId)) continue;
    const record = memory?.villages.get(villageId);
    const stamp = stamps?.get(villageId);
    if (memory && record && stamp?.version === record.version && stamp.name === record.name) {
      memory.seen.add(villageId);
      records.set(villageId, record);
      continue;
    }
    records.set(villageId, recallVillage(memory, await deps.villages.find(villageId)));
  }
  return records;
}

/** Konec kola: zapomene skončená tažení (výjezdy) a vsi, které kolo nenačetlo. */
export function forgetEnded(memory: CampaignMemory<unknown>, active: readonly string[]): void {
  const running = new Set(active);
  for (const id of [...memory.states.keys()]) if (!running.has(id)) memory.states.delete(id);
  for (const id of [...memory.points.keys()]) if (!running.has(id)) memory.points.delete(id);
  for (const id of [...memory.needs.keys()]) if (!running.has(id)) memory.needs.delete(id);
  for (const id of [...memory.villages.keys()]) {
    if (!memory.seen.has(id)) memory.villages.delete(id);
  }
  memory.seen.clear();
}

/** Záměry, se kterými se počítalo do taktu `tick` – jiný seznam = paměť neplatí. */
export function memoIntentsKey(
  intents: readonly Pick<CampaignIntent, 'seq' | 'tick'>[],
  tick: number,
): string {
  return intents
    .filter((i) => i.tick <= tick)
    .map((i) => `${i.seq}@${i.tick}`)
    .join(',');
}

/**
 * Stav, od kterého kolo počítá: zapamatovaný, když platí pro bod `from` a záměry a není za
 * `toTick` (hodiny se nevracejí, ale bod nesmí předběhnout teď); jinak bod sám. Tažení i výjezd.
 */
export function roundStart<S extends { tick: number }>(
  memo: CampaignMemo<S> | undefined,
  from: { state: S; version: string },
  intents: readonly Pick<CampaignIntent, 'seq' | 'tick'>[],
  toTick: number,
): S {
  const state = from.state;
  if (!memo || memo.checkpoint !== from.version) return state;
  if (memo.state.tick > toTick || memo.state.tick <= state.tick) return state;
  return memo.intents === memoIntentsKey(intents, memo.state.tick) ? memo.state : state;
}

/**
 * Kontrolní bod tažení: s pamětí workeru se nejdřív zeptá jen na verzi a stav (JSON) čte jen,
 * když se bod od minulého kola změnil (uložení, doručení událostí, jiný proces) – jinak vrátí
 * tentýž objekt jako minule. Výsledek je tentýž jako čtení v každém kole: táž verze = týž bod
 * a bod se nemění na místě (`stepCampaign` vstup nemění; bod s doručenými událostmi i uložený bod
 * paměť zahodí).
 */
async function readCheckpoint(
  deps: Pick<StepCampaignsDeps, 'campaigns' | 'memory'>,
  campaignId: string,
): Promise<CampaignCheckpoint | null> {
  const points = deps.memory?.points;
  const known = points?.get(campaignId);
  if (known && (await deps.campaigns.checkpointVersion(campaignId)) === known.version) {
    return known;
  }
  const checkpoint = await deps.campaigns.checkpoint(campaignId);
  if (checkpoint) points?.set(campaignId, checkpoint);
  else points?.delete(campaignId);
  return checkpoint;
}

/** Vlastník vsi a vztahy rodů pro obranu vsi. */
export interface VillageWatchers {
  /** Hráč, kterému ves patří, a jméno vsi; ves bez hráče null. */
  watcherOf(villageId: string): Promise<{ playerId: string; name: string } | null>;
  /**
   * Je vojsko hráče `armyPlayerId` pro ves `villageId` hráče `ownerPlayerId` neškodné (vlastní,
   * pán, vazalové, platný ohlášený průchod její mapou bez „Nevěřit“)?
   */
  harmless(
    armyPlayerId: string,
    ownerPlayerId: string,
    villageId: string,
    campaignId: string,
  ): Promise<boolean>;
}

/** Jak dopadlo jedno tažení v kole. */
export type CampaignOutcome =
  /** Dopočteno a uložen kontrolní bod. */
  | 'saved'
  /** Dopočteno, bod se ještě neukládal (méně než 40 taktů bez událostí). */
  | 'computed'
  /** Nic nového (takt už spočtený, tažení skončilo). */
  | 'idle'
  /** Mezitím přibyl záměr – spočte se znovu v dalším kole. */
  | 'stale'
  /** Počítá jiný proces. */
  | 'busy'
  /** Chybí data (ves bez potřebného dne – bariéra Ú6.7). */
  | 'waiting'
  | 'failed';

export interface CampaignResult {
  campaignId: string;
  outcome: CampaignOutcome;
  error?: unknown;
}

/**
 * Jedno kolo smyčky tažení: všechna aktivní tažení do taktu `tickOfMs(nowMs)`. Chyba jednoho
 * tažení ostatní nezastaví (`failed` ve výsledku).
 */
export async function stepCampaigns(
  deps: StepCampaignsDeps,
  input: { nowMs: number },
): Promise<CampaignResult[]> {
  const toTick = tickOfMs(input.nowMs, deps.world);
  const results: CampaignResult[] = [];
  const active = await deps.campaigns.active();
  for (const campaignId of active) {
    try {
      const held = await deps.campaignLock.tryRun(campaignId, () =>
        stepOne(deps, campaignId, toTick, input.nowMs),
      );
      results.push({ campaignId, outcome: held.ran ? held.value : 'busy' });
    } catch (error) {
      results.push({ campaignId, outcome: 'failed', error });
    }
  }
  if (deps.memory) forgetEnded(deps.memory, active);
  return results;
}

/** Rozpadlé nebo skončené tažení: jeho ohlášení průchodu přestanou platit (idempotentně). */
async function endPassages(
  deps: StepCampaignsDeps,
  state: CampaignState,
  nowMs: number,
): Promise<void> {
  if (state.phase !== 'done' && state.phase !== 'disbanded') return;
  await deps.passages?.voidOfCampaign(state.id, new Date(nowMs));
}

async function stepOne(
  deps: StepCampaignsDeps,
  campaignId: string,
  toTick: number,
  nowMs: number,
): Promise<CampaignOutcome> {
  const checkpoint = await readCheckpoint(deps, campaignId);
  if (!checkpoint) return 'idle';
  const from = checkpoint.state;
  if (checkpoint.outbox) {
    await deliverOutbox(deps, checkpoint.outbox);
    await deps.campaigns.clearOutbox(campaignId, from.tick);
    // zápis bodu mění jeho verzi – další kolo ho přečte celý
    deps.memory?.points.delete(campaignId);
  }
  if (campaignFinished(from)) {
    await endPassages(deps, from, nowMs);
    return 'idle';
  }
  if (toTick <= from.tick) return 'idle';

  const intents = await deps.campaigns.intentsAfter(campaignId, from.tick);
  // paměť workeru: pokračovat od posledního spočteného stavu (bez událostí – jinak by se uložil)
  const states = deps.memory?.states;
  const start = roundStart(states?.get(campaignId), checkpoint, intents, toTick);
  states?.delete(campaignId);
  const step = await computeCampaign(deps, start, toTick, intents);
  if (step.state.tick === from.tick) return 'waiting';

  const outbox: CampaignOutbox | null =
    step.villageEvents.length > 0 || step.notices.length > 0
      ? { villageEvents: step.villageEvents, notices: step.notices }
      : null;
  // tažení čeká na ves (bariéra Ú6.7) – bod se uloží hned, ať mez vsi povyroste a ves smí
  // spočítat den, na který tažení čeká (jinak by obě strany čekaly navzájem)
  const due =
    outbox !== null ||
    campaignFinished(step.state) ||
    (step.waiting?.villageIds.length ?? 0) > 0 ||
    step.state.tick - from.tick >= CHECKPOINT_TICKS;
  if (!due) {
    states?.set(campaignId, {
      checkpoint: checkpoint.version,
      intents: memoIntentsKey(intents, step.state.tick),
      state: step.state,
    });
    return step.waiting ? 'waiting' : 'computed';
  }

  deps.memory?.points.delete(campaignId);
  const saved = await deps.campaigns.saveCheckpoint(campaignId, {
    fromTick: from.tick,
    seenIntents: intents.filter((i) => i.tick <= step.state.tick).length,
    state: step.state,
    outbox,
  });
  if (saved === 'stale') return 'stale';
  await endPassages(deps, step.state, nowMs);
  if (outbox) {
    await deliverOutbox(deps, outbox);
    await deps.campaigns.clearOutbox(campaignId, step.state.tick);
  }
  return 'saved';
}

/**
 * Dopočet tažení s načítáním dat (`computeWithLoads` nad `stepCampaign`): když takt chybí mapa nebo
 * ves, načtou se a výpočet pokračuje od zastaveného taktu (výsledek je tentýž jako s daty předem).
 */
export async function computeCampaign(
  deps: Pick<
    StepCampaignsDeps,
    'cells' | 'villages' | 'world' | 'watchers' | 'alarmOwners' | 'memory'
  >,
  state: CampaignState,
  toTick: number,
  intents: readonly CampaignIntent[],
): Promise<CampaignStep> {
  return computeWithLoads(deps, state, (current, world) =>
    stepCampaign(current, toTick, intents, world),
  );
}

/** Výsledek kroku po taktech – tvar `CampaignStep` pro stav `S` (tažení, výjezd – `JourneyStep`). */
export type LoadedStep<S> = Omit<CampaignStep, 'state'> & { state: S };

/** Porty dopočtu s načítáním; paměť workeru kteréhokoli druhu stavu (čte jen mapy, vsi a mřížky). */
export type LoadingDeps = Pick<
  StepCampaignsDeps,
  'cells' | 'villages' | 'world' | 'watchers' | 'alarmOwners'
> & { memory?: CampaignMemory<unknown> };

/**
 * Dopočet s načítáním dat pro tažení i výjezd: `step` posune stav do cíle (`stepCampaign`,
 * `stepJourney` se zavřeným `toTick` a záměry); když takt chybí mapa nebo ves, načtou se a výpočet
 * pokračuje od zastaveného taktu (výsledek je tentýž jako s daty předem). Ves pro den `d` je její
 * uložený stav, má-li už spočtený den `d − 1` (bariéra Ú6.7 – `VillageHolds` ji dál nepustí); jinak
 * takt čeká, ves se v dalším kole načte znovu.
 */
export async function computeWithLoads<S extends { id: string; playerId: string }>(
  deps: LoadingDeps,
  state: S,
  step: (state: S, world: CampaignWorld) => LoadedStep<S>,
): Promise<LoadedStep<S>> {
  /** Mapy políček; `read` = takt se na mapu ptal (paměť workeru – `CampaignNeeds`). */
  const maps = new Map<string, { map: CampaignMap; cell: GridCell; read: boolean }>();
  const villages = new Map<string, { state: VillageState; read: boolean }>();
  /** Vsi, které se už zkusily načíst (i neexistující). */
  const tried = new Set<string>();
  /** Neexistující vsi, na které se takt ptal. */
  const missing = new Set<string>();
  const watchers = new Map<string, { playerId: string; name: string }>();
  /** Jména načtených vsí (kronika a upozornění uprchlíků – Úloha 8 plánu 2026-11-09). */
  const names = new Map<string, string>();
  const harmlessTo = new Map<string, boolean>();
  const alarms = deps.alarmOwners ? alarmWorld(deps.alarmOwners) : null;
  const key = (c: GridCell): string => `${c.x},${c.y}`;
  const world: CampaignWorld = {
    clock: deps.world,
    landscapeOf: (cell: GridCell): CampaignMap | null => {
      const known = maps.get(key(cell));
      if (!known) return null;
      known.read = true;
      return known.map;
    },
    // bariéra (Ú6.7): stav ke konci dne `day − 1` – ves bez toho dne ještě není
    villageAt: (villageId: string, day: number): VillageState | null => {
      const known = villages.get(villageId);
      if (!known) {
        missing.add(villageId);
        return null;
      }
      known.read = true;
      return known.state.lastDay >= day - 1 ? known.state : null;
    },
    // ves se zkusila načíst a není (zanikla) – výjezd s takovým domovem skončí (tažení se neptá)
    villageGone: (villageId: string): boolean => tried.has(villageId) && !villages.has(villageId),
    watcherOf: (villageId: string): { playerId: string; name: string } | null =>
      watchers.get(villageId) ?? null,
    harmless: (villageId: string): boolean => harmlessTo.get(villageId) ?? false,
    villageNameOf: (villageId: string): string | null => names.get(villageId) ?? null,
    ...(alarms ? alarms.world : {}),
    ...(deps.memory ? { grids: deps.memory.grids } : {}),
  };

  /** Načte mapy a vsi; true, když přibylo něco nového (takt to má zkusit znovu). */
  const load = async (
    cells: readonly GridCell[],
    villageIds: readonly string[],
  ): Promise<boolean> => {
    let loaded = false;
    for (const cell of cells) {
      if (maps.has(key(cell))) continue;
      maps.set(key(cell), { map: await deps.cells.mapOf(cell), cell: { ...cell }, read: false });
      loaded = true;
    }
    // ves bez potřebného dne se načte znovu – mezitím ji mohl worker posunout (s pamětí jen otisk)
    const records = await loadVillages(deps, villageIds);
    for (const villageId of villageIds) {
      const firstTry = !tried.has(villageId);
      tried.add(villageId);
      const record = records.get(villageId) ?? null;
      if (!record) {
        if (firstTry) loaded = true;
        continue;
      }
      const cached = villages.get(villageId);
      if (cached && record.state.lastDay <= cached.state.lastDay) continue;
      villages.set(villageId, { state: record.state, read: cached?.read ?? false });
      names.set(villageId, record.name);
      loaded = true;
      if (cached) continue;
      const watcher = (await deps.watchers?.watcherOf(villageId)) ?? null;
      if (watcher) {
        watchers.set(villageId, { playerId: watcher.playerId, name: record.name });
        if (await deps.watchers?.harmless(state.playerId, watcher.playerId, villageId, state.id)) {
          harmlessTo.set(villageId, true);
        }
      }
    }
    return loaded;
  };

  // paměť workeru: co tažení četlo minulé kolo, se načte předem – stejně jako na vyžádání, jen
  // dřív (výsledek je tentýž jako s daty předem), takže první krok nečeká na mapy a vsi
  const needs = deps.memory?.needs.get(state.id);
  if (needs) await load(needs.cells, needs.villageIds);
  const result: LoadedStep<S> = { state, villageEvents: [], notices: [], waiting: null };
  for (let round = 0; round <= MAX_LOADS; round++) {
    const next = step(result.state, world);
    result.state = next.state;
    result.villageEvents.push(...next.villageEvents);
    result.notices.push(...next.notices);
    result.waiting = next.waiting;
    if (!next.waiting || round === MAX_LOADS) break;
    let loaded = await load(next.waiting.cells, next.waiting.villageIds);
    if (alarms && (await alarms.load())) loaded = true;
    if (!loaded) break;
  }
  // co takty četly (i ves, která neexistuje) – mapa nebo ves, na kterou se už neptají, vypadne
  deps.memory?.needs.set(state.id, {
    cells: [...maps.values()].filter((m) => m.read).map((m) => m.cell),
    villageIds: [
      ...[...villages].filter(([, v]) => v.read).map(([id]) => id),
      ...[...missing].filter((id) => !villages.has(id)),
    ],
  });
  return result;
}

/** Odpovědi portu varování pro synchronní svět tažení a jejich dočtení, když na ně takt čeká. */
interface AlarmWorld {
  world: Required<Pick<CampaignWorld, 'alarmOf' | 'refugeHostsOf' | 'domainOf'>>;
  /** Načte, na co se takt ptal a svět ještě neznal; true, když něco načetl. */
  load(): Promise<boolean>;
}

/**
 * Svět varování nad portem `AlarmOwnerPort` (vzor `watcherOf` / `harmless`): synchronní dotaz vrátí,
 * co je načtené, jinak si dotaz zapamatuje a vrátí null (takt čeká – `MissingData`); `load` pak
 * dotazy načte. Neznámá ves = neznámý rod (`UNKNOWN_ALARM_OWNER` – rozhoduje pravidlo).
 */
function alarmWorld(port: AlarmOwnerPort): AlarmWorld {
  const owners = new Map<string, AlarmOwner>();
  const hosts = new Map<string, VillageCell[]>();
  const domains = new Map<string, VillageCell[]>();
  const asked = { owners: new Set<string>(), hosts: new Set<string>(), domains: new Set<string>() };
  const lookup =
    <T>(known: Map<string, T>, want: Set<string>) =>
    (villageId: string): T | null => {
      const value = known.get(villageId);
      if (value !== undefined) return value;
      want.add(villageId);
      return null;
    };
  const fill = async <T>(
    known: Map<string, T>,
    want: Set<string>,
    read: (villageId: string) => Promise<T>,
  ): Promise<boolean> => {
    const ids = [...want].filter((id) => !known.has(id));
    want.clear();
    for (const id of ids) known.set(id, await read(id));
    return ids.length > 0;
  };
  return {
    world: {
      alarmOf: lookup(owners, asked.owners),
      refugeHostsOf: lookup(hosts, asked.hosts),
      domainOf: lookup(domains, asked.domains),
    },
    load: async () => {
      // ves vstupuje do varování s vlastníkem i kandidáty hradišť – načtou se spolu (jedno kolo)
      for (const id of asked.owners) asked.hosts.add(id);
      for (const id of asked.hosts) asked.owners.add(id);
      const a = await fill(owners, asked.owners, async (id) => {
        return (await port.ownerOf(id)) ?? { ...UNKNOWN_ALARM_OWNER };
      });
      const b = await fill(hosts, asked.hosts, (id) => port.refugeHostsOf(id));
      const c = await fill(domains, asked.domains, (id) => port.domainOf(id));
      return a || b || c;
    },
  };
}

/**
 * Doručí události do schránek vsí (stejný `ref` podruhé zahozen) a upozornění hráčům – schránka
 * bodu tažení i výjezdu. Ves, která mezitím zanikla, se přeskočí – jinak by nedoručitelná událost
 * zastavila tažení navždy.
 */
export async function deliverOutbox(
  deps: Pick<StepCampaignsDeps, 'villages' | 'notices'>,
  outbox: CampaignOutbox,
): Promise<void> {
  for (const event of outbox.villageEvents) {
    const [exists] = await deps.villages.stampsOfVillages([event.villageId]);
    if (exists) await deps.villages.inbox.post(event);
  }
  for (const notice of outbox.notices) await deps.notices.post(notice);
}

/**
 * Vlastník vsi a neškodná vojska z portů (composition root): vlastník = majitel sídla vsi; vojsko
 * je neškodné pro vlastního, pána i vazaly (`isHarmlessArmy` nad sítí vazalství do 8 kroků).
 */
export function villageWatchers(deps: {
  /** Jen otisky – sídlo a jméno vsi bez načtení stavu. */
  villages: Pick<VillageRepository, 'stampsOfVillages'>;
  settlements: Pick<SettlementRepository, 'find'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  vassalages: Pick<VassalageRepository, 'edgesNear'>;
  /** Ohlášené průchody (war.md – Pohyb); bez nich ohlášené vojsko škodí jako každé cizí. */
  passages?: Pick<PassageRepository, 'validBetween'>;
}): VillageWatchers {
  return {
    watcherOf: async (villageId) => {
      const [village] = await deps.villages.stampsOfVillages([villageId]);
      const settlement = village ? await deps.settlements.find(village.settlementId) : null;
      return village && settlement ? { playerId: settlement.ownerId, name: village.name } : null;
    },
    harmless: async (armyPlayerId, ownerPlayerId, villageId, campaignId) => {
      if (armyPlayerId === ownerPlayerId) return true;
      const [army, owner] = await Promise.all([
        deps.houses.activeOf(armyPlayerId),
        deps.houses.activeOf(ownerPlayerId),
      ]);
      if (!army || !owner) return false;
      if (isHarmlessArmy(army.id, owner.id, await deps.vassalages.edgesNear(army.id, 8))) {
        return true;
      }
      // ohlášený průchod mapou vsi – ves vojsko bere za neškodné, „Nevěřit“ = podle postoje
      if (!deps.passages) return false;
      const passages = await deps.passages.validBetween(army.id, owner.id);
      if (passages.length === 0) return false;
      const [village] = await deps.villages.stampsOfVillages([villageId]);
      const settlement = village ? await deps.settlements.find(village.settlementId) : null;
      const cell = settlement?.worldCell;
      return cell !== null && cell !== undefined && passageCovers(passages, cell, campaignId);
    },
  };
}
