import type { WorldClock } from '../domain/calendar';
import type { VillageState } from '../domain/village/types';
import type { GridCell } from '../domain/village/world-grid';
import {
  campaignFinished,
  CHECKPOINT_TICKS,
  isHarmlessArmy,
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
import type { VillageRepository } from './villages';

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
  villages: Pick<VillageRepository, 'find' | 'inbox'>;
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
  for (const campaignId of await deps.campaigns.active()) {
    try {
      const held = await deps.campaignLock.tryRun(campaignId, () =>
        stepOne(deps, campaignId, toTick, input.nowMs),
      );
      results.push({ campaignId, outcome: held.ran ? held.value : 'busy' });
    } catch (error) {
      results.push({ campaignId, outcome: 'failed', error });
    }
  }
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
  const step = await computeCampaign(deps, from, toTick, intents);
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
  if (!due) return step.waiting ? 'waiting' : 'computed';

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
  deps: Pick<StepCampaignsDeps, 'cells' | 'villages' | 'world' | 'watchers'>,
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
    for (const villageId of step.waiting.villageIds) {
      // ves bez potřebného dne se načte znovu – mezitím ji mohl worker posunout
      const firstTry = !tried.has(villageId);
      tried.add(villageId);
      const record = await deps.villages.find(villageId);
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
    if (await deps.villages.find(event.villageId)) await deps.villages.inbox.post(event);
  }
  for (const notice of outbox.notices) await deps.notices.post(notice);
}

/**
 * Vlastník vsi a neškodná vojska z portů (composition root): vlastník = majitel sídla vsi; vojsko
 * je neškodné pro vlastního, pána i vazaly (`isHarmlessArmy` nad sítí vazalství do 8 kroků).
 */
export function villageWatchers(deps: {
  villages: Pick<VillageRepository, 'find'>;
  settlements: Pick<SettlementRepository, 'find'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  vassalages: Pick<VassalageRepository, 'edgesNear'>;
  /** Ohlášené průchody (war.md – Pohyb); bez nich ohlášené vojsko škodí jako každé cizí. */
  passages?: Pick<PassageRepository, 'validBetween'>;
}): VillageWatchers {
  return {
    watcherOf: async (villageId) => {
      const village = await deps.villages.find(villageId);
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
      const village = await deps.villages.find(villageId);
      const settlement = village ? await deps.settlements.find(village.settlementId) : null;
      const cell = settlement?.worldCell;
      return cell !== null && cell !== undefined && passageCovers(passages, cell, campaignId);
    },
  };
}
