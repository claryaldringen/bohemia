import type { WorldClock } from '../domain/calendar';
import type { VillageState } from '../domain/village/types';
import type { GridCell } from '../domain/village/world-grid';
import {
  campaignFinished,
  CHECKPOINT_TICKS,
  isHarmlessArmy,
  MarchGridMemo,
  stepCampaign,
  tickOfMs,
  type CampaignIntent,
  type CampaignMap,
  type CampaignOutbox,
  type CampaignState,
  type CampaignStep,
  type CampaignWorld,
} from '../domain/war';
import type { CampaignCells, CampaignLock, CampaignRepository } from './campaigns';
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
  /** Skončené tažení ukončí svá ohlášení průchodu (war.md – Pohyb). */
  passages?: Pick<PassageRepository, 'voidOfCampaign'>;
  /**
   * Paměť workeru napříč koly (`newCampaignMemory`) – jen zrychlení: bez ní se každé kolo
   * počítá od kontrolního bodu, s ní od posledního spočteného stavu se stejným výsledkem.
   */
  memory?: CampaignMemory;
}

/**
 * Poslední spočtený, ještě neuložený stav tažení (docs/code/worker.md – Výkon – Tažení). Platí,
 * dokud stojí týž kontrolní bod (otisk jeho stavu) a záměry do `state.tick` jsou tytéž – pak je
 * pokračování od něj tentýž výpočet jako od bodu (stav po taktech nezávisí na kouscích).
 */
export interface CampaignMemo {
  /** Otisk kontrolního bodu, od kterého se počítalo (JSON jeho stavu). */
  checkpoint: string;
  /** Záměry s taktem do `state.tick`, se kterými se počítalo (`seq@takt`). */
  intents: string;
  state: CampaignState;
}

/** Paměť smyčky tažení napříč koly – drží ji vstupní bod (worker), jeden proces. */
export interface CampaignMemory {
  states: Map<string, CampaignMemo>;
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
}

/** Prázdná paměť smyčky tažení. */
export function newCampaignMemory(): CampaignMemory {
  return { states: new Map(), grids: new MarchGridMemo(), villages: new Map(), seen: new Set() };
}

/** Ves z úložiště – téže verze a jména jako v paměti = záznam z paměti (tentýž objekt stavu). */
function recallVillage(
  memory: CampaignMemory | undefined,
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
  deps: Pick<StepCampaignsDeps, 'villages' | 'memory'>,
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

/** Konec kola: zapomene skončená tažení a vsi, které kolo nenačetlo. */
function forget(memory: CampaignMemory, active: readonly string[]): void {
  const running = new Set(active);
  for (const id of [...memory.states.keys()]) if (!running.has(id)) memory.states.delete(id);
  for (const id of [...memory.villages.keys()]) {
    if (!memory.seen.has(id)) memory.villages.delete(id);
  }
  memory.seen.clear();
}

/** Záměry, se kterými se počítalo do taktu `tick` – jiný seznam = paměť neplatí. */
function intentsKey(intents: readonly CampaignIntent[], tick: number): string {
  return intents
    .filter((i) => i.tick <= tick)
    .map((i) => `${i.seq}@${i.tick}`)
    .join(',');
}

/**
 * Stav, od kterého kolo počítá: zapamatovaný, když platí pro bod `from` a záměry a není za
 * `toTick` (hodiny se nevracejí, ale bod nesmí předběhnout teď); jinak bod sám.
 */
function startOf(
  memo: CampaignMemo | undefined,
  from: CampaignState,
  fingerprint: () => string,
  intents: readonly CampaignIntent[],
  toTick: number,
): CampaignState {
  if (!memo || memo.state.tick > toTick || memo.state.tick <= from.tick) return from;
  if (memo.intents !== intentsKey(intents, memo.state.tick)) return from;
  return memo.checkpoint === fingerprint() ? memo.state : from;
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
  if (deps.memory) forget(deps.memory, active);
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
  const checkpoint = await deps.campaigns.checkpoint(campaignId);
  if (!checkpoint) return 'idle';
  const from = checkpoint.state;
  if (checkpoint.outbox) {
    await deliver(deps, checkpoint.outbox);
    await deps.campaigns.clearOutbox(campaignId, from.tick);
  }
  if (campaignFinished(from)) {
    await endPassages(deps, from, nowMs);
    return 'idle';
  }
  if (toTick <= from.tick) return 'idle';

  const intents = await deps.campaigns.intentsAfter(campaignId, from.tick);
  // paměť workeru: pokračovat od posledního spočteného stavu (bez událostí – jinak by se uložil)
  const states = deps.memory?.states;
  let fingerprint: string | null = null;
  const fingerprintOf = (): string => (fingerprint ??= JSON.stringify(from));
  const start = startOf(states?.get(campaignId), from, fingerprintOf, intents, toTick);
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
      checkpoint: fingerprintOf(),
      intents: intentsKey(intents, step.state.tick),
      state: step.state,
    });
    return step.waiting ? 'waiting' : 'computed';
  }

  const saved = await deps.campaigns.saveCheckpoint(campaignId, {
    fromTick: from.tick,
    seenIntents: intents.filter((i) => i.tick <= step.state.tick).length,
    state: step.state,
    outbox,
  });
  if (saved === 'stale') return 'stale';
  await endPassages(deps, step.state, nowMs);
  if (outbox) {
    await deliver(deps, outbox);
    await deps.campaigns.clearOutbox(campaignId, step.state.tick);
  }
  return 'saved';
}

/**
 * Dopočet tažení s načítáním dat: když takt chybí mapa nebo ves, načtou se a výpočet pokračuje
 * od zastaveného taktu (výsledek je tentýž jako s daty předem). Ves pro den `d` je její uložený
 * stav, má-li už spočtený den `d − 1` (bariéra Ú6.7 – `VillageHolds` ji dál nepustí); jinak takt
 * čeká, ves se v dalším kole načte znovu.
 */
export async function computeCampaign(
  deps: Pick<StepCampaignsDeps, 'cells' | 'villages' | 'world' | 'watchers' | 'memory'>,
  state: CampaignState,
  toTick: number,
  intents: readonly CampaignIntent[],
): Promise<CampaignStep> {
  const maps = new Map<string, CampaignMap>();
  const villages = new Map<string, VillageState>();
  /** Vsi, které se už zkusily načíst (i neexistující) – pro posla. */
  const tried = new Set<string>();
  const watchers = new Map<string, { playerId: string; name: string }>();
  const harmlessTo = new Map<string, boolean>();
  const key = (c: GridCell): string => `${c.x},${c.y}`;
  const world: CampaignWorld = {
    clock: deps.world,
    landscapeOf: (cell: GridCell): CampaignMap | null => maps.get(key(cell)) ?? null,
    // bariéra (Ú6.7): stav ke konci dne `day − 1` – ves bez toho dne ještě není
    villageAt: (villageId: string, day: number): VillageState | null => {
      const state = villages.get(villageId);
      return state && state.lastDay >= day - 1 ? state : null;
    },
    watcherOf: (villageId: string): { playerId: string; name: string } | null =>
      watchers.get(villageId) ?? null,
    harmless: (villageId: string): boolean => harmlessTo.get(villageId) ?? false,
    // posel jde z jiné vsi téhož hráče (rodu) jako cíl; bez `watchers` se nic neví – posel nejde
    messengerTo: (from: string, to: string): boolean | null => {
      if (!deps.watchers) return false;
      if (!tried.has(from) || !tried.has(to)) return null;
      const a = watchers.get(from);
      const b = watchers.get(to);
      return a !== undefined && b !== undefined && a.playerId === b.playerId;
    },
    ...(deps.memory ? { grids: deps.memory.grids } : {}),
  };
  const result: CampaignStep = { state, villageEvents: [], notices: [], waiting: null };
  for (let round = 0; round <= MAX_LOADS; round++) {
    const step = stepCampaign(result.state, toTick, intents, world);
    result.state = step.state;
    result.villageEvents.push(...step.villageEvents);
    result.notices.push(...step.notices);
    result.waiting = step.waiting;
    if (!step.waiting || round === MAX_LOADS) break;
    let loaded = false;
    for (const cell of step.waiting.cells) {
      if (maps.has(key(cell))) continue;
      maps.set(key(cell), await deps.cells.mapOf(cell));
      loaded = true;
    }
    // ves bez potřebného dne se načte znovu – mezitím ji mohl worker posunout (s pamětí jen otisk)
    const records = await loadVillages(deps, step.waiting.villageIds);
    for (const villageId of step.waiting.villageIds) {
      const firstTry = !tried.has(villageId);
      tried.add(villageId);
      const record = records.get(villageId) ?? null;
      if (!record) {
        if (firstTry) loaded = true;
        continue;
      }
      const cached = villages.get(villageId);
      if (cached && record.state.lastDay <= cached.lastDay) continue;
      villages.set(villageId, record.state);
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
    if (!loaded) break;
  }
  return result;
}

/**
 * Doručí události do schránek vsí (stejný `ref` podruhé zahozen) a upozornění hráčům. Ves, která
 * mezitím zanikla, se přeskočí – jinak by nedoručitelná událost zastavila tažení navždy.
 */
async function deliver(deps: StepCampaignsDeps, outbox: CampaignOutbox): Promise<void> {
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
