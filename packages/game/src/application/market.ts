import {
  departMarket,
  isVillageAbandoned,
  isVillageExtinct,
  isVillageTravelling,
  marketTravelDays,
  type Craft,
  type MarketOrder,
  type MarketTarget,
  type VillageNews,
} from '../domain/village';
import { cellDistance, ringCells } from '../domain/world/placement';
import type { GridCell } from '../domain/village/people/world-grid';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { LandscapeSource, SettlementRepository } from './settlements';
import { settlementLandscape } from './enter-game';
import { crossesIsolation, placeOf, settlementCell, stepToward, sleeps } from './shipments';
import { updateLivingVillage, VILLAGE_TRAVELLING } from './update-village';
import { deliverVillageMailSafely, type VillageMailDeps } from './village-mail';
import type { VillageRecord } from './villages';

// Přehled vsí a odeslání výpravy na trh (markets.md – Pravidla 2, 3 a 8; Rozhodnutí plánu 2, body
// 2 a 7). Přehled sbírá vsi, o kterých hráč smí vědět: vlastní, na 8 sousedních mapách, ze znalosti
// rodu a ze zpráv na pivo. Odeslání smí jen do vsi z přehledu, která není zablokovaná.

export const MARKET_UNKNOWN = 'Tu ves lidé neznají.';
export const MARKET_GONE = 'Ta ves už nestojí.';

/** Co potřebuje přehled a odeslání – `MarketDeps` skládá web z `gameDeps()`. */
export interface MarketDeps extends VillageMailDeps {
  settlements: Pick<SettlementRepository, 'find' | 'listActive' | 'holderAt'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  knowledge: Pick<KnowledgeRepository, 'knownCellsOf' | 'of'>;
  landscapes: LandscapeSource;
}

/** Ves v přehledu trhu. */
export interface MarketVillage {
  villageId: string;
  name: string;
  houseName: string | null;
  own: boolean;
  cells: number;
  travelDays: number;
  /** Proč tam výprava nejede; null – jede. */
  blocked: string | null;
  /** Zpráva na pivo z výpravy nebo od obchodníka (stav domovské vsi). */
  news: VillageNews | null;
  /** Co muži rodu viděli při výjezdech a tažení (domy a řemesla v dílnách). */
  seen: { day: number; houses: number; crafts: Craft[] } | null;
}

/** Ves přehledu s polohou – pro odeslání (`firstStep`). */
interface Candidate {
  village: MarketVillage;
  cell: GridCell;
}

/** Zpráva domovské vsi o vsi `villageId`. */
function newsOf(home: VillageRecord, villageId: string): VillageNews | null {
  return home.state.news?.find((n) => n.villageId === villageId) ?? null;
}

/** Vsi sídel na políčkách `cells` (jejich držitelé na sousedních mapách), bez vsí hráče `except`. */
async function villagesAt(
  deps: MarketDeps,
  cells: readonly GridCell[],
  except: string | null,
): Promise<string[]> {
  const out: string[] = [];
  for (const cell of cells) {
    const holder = await deps.settlements.holderAt(cell);
    if (holder === null || holder === except) continue;
    for (const settlement of await deps.settlements.listActive(holder)) {
      const at = settlement.worldCell;
      if (at?.x !== cell.x || at.y !== cell.y) continue;
      for (const village of await deps.villages.listBySettlement(settlement.id)) {
        out.push(village.id);
      }
    }
  }
  return out;
}

/** Jméno hlavy rodu držitele sídla vsi (veřejný rodokmen); bez rodu nebo jména null. */
async function houseNameOf(deps: MarketDeps, holderId: string): Promise<string | null> {
  const lord = (await deps.houses.activeOf(holderId))?.lord;
  if (!lord) return null;
  const digest = (await deps.villages.digestsOf([lord.villageId]))[0];
  return digest?.digest.publicLineMen.find((m) => m.id === lord.personId)?.name ?? null;
}

/**
 * Všechny vsi, které hráč zná, i zablokované (bez domovské vsi a archivovaných sídel). `null` –
 * `villageId` není ves hráče `playerId`. Řazeno podle vzdálenosti, pak jména.
 */
async function collect(
  deps: MarketDeps,
  input: { playerId: string; villageId: string; actorId?: string },
): Promise<Candidate[] | null> {
  const home = await deps.villages.find(input.villageId);
  if (!home) return null;
  const homePlace = await placeOf(deps, home);
  if (!homePlace || homePlace.ownerId !== input.playerId) return null;
  // správce cizí vsi (jednající ≠ držitel) o ostatních vsích držitele ani o jeho znalosti mapy neví
  const steward = input.actorId !== undefined && input.actorId !== input.playerId;
  const house = steward ? null : await deps.houses.activeOf(input.playerId);

  // id vsi → co o ní rod viděl (null – nic)
  const ids = new Map<string, { day: number; houses: number; crafts: Craft[] } | null>();
  const add = (id: string, seen: { day: number; houses: number; crafts: Craft[] } | null): void => {
    if (id === home.id) return;
    if (!ids.has(id) || (ids.get(id) === null && seen !== null)) ids.set(id, seen);
  };

  // 1. vlastní vsi, 2. sousední mapy (odříznutý rod je nemá – místní mřížka není mapa světa)
  if (!steward) {
    for (const settlement of await deps.settlements.listActive(input.playerId)) {
      for (const village of await deps.villages.listBySettlement(settlement.id))
        add(village.id, null);
    }
  }
  if (!homePlace.isolated) {
    for (const id of await villagesAt(
      deps,
      ringCells(homePlace.cell, 1),
      steward ? input.playerId : null,
    ))
      add(id, null);
    // 3. mapy ze znalosti rodu: jen ves, jejíž stavby rod na mapě viděl (world.md – Co je veřejné)
    if (house) {
      for (const known of await deps.knowledge.knownCellsOf(house.id)) {
        const id = known.seenVillageId;
        if (id === null || known.seenParts === 0 || !known.villageIds.includes(id)) continue;
        const seenCell = await deps.knowledge.of(house.id, known.cell);
        const dwellings = (seenCell?.parts ?? []).flatMap((p) =>
          p.data.kind === 'dwelling' ? [{ day: p.day, craft: p.data.craft }] : [],
        );
        const crafts = [...new Set(dwellings.flatMap((d) => (d.craft ? [d.craft] : [])))];
        add(id, {
          day: Math.max(0, ...dwellings.map((d) => d.day)),
          houses: dwellings.length,
          crafts,
        });
      }
    }
  }
  // 4. vsi, o kterých má ves zprávu
  for (const news of home.state.news ?? []) add(news.villageId, null);

  const out: Candidate[] = [];
  const names = new Map<string, string | null>();
  for (const [id, seen] of ids) {
    const record = await deps.villages.find(id);
    if (!record) continue;
    const place = await placeOf(deps, record); // archivované sídlo – bez polohy, v přehledu není
    if (!place || crossesIsolation(homePlace, place)) continue;
    const own = place.ownerId === input.playerId;
    if (!names.has(place.ownerId)) {
      names.set(place.ownerId, own ? null : await houseNameOf(deps, place.ownerId));
    }
    const cells = cellDistance(homePlace.cell, place.cell);
    out.push({
      cell: place.cell,
      village: {
        villageId: id,
        name: record.name,
        houseName: names.get(place.ownerId) ?? null,
        own,
        cells,
        travelDays: marketTravelDays(cells),
        blocked: blockedReason(record, cells),
        news: newsOf(home, id),
        seen,
      },
    });
  }
  return out.sort(
    (a, b) =>
      a.village.cells - b.village.cells || a.village.name.localeCompare(b.village.name, 'cs'),
  );
}

/** Proč na trh do vsi nejede nikdo: zanikla (vymřela, opuštěná), je na cestě, nebo je na stejném políčku. */
function blockedReason(record: VillageRecord, cells: number): string | null {
  if (sleeps(record) || isVillageExtinct(record.state) || isVillageAbandoned(record.state)) {
    return MARKET_GONE;
  }
  if (isVillageTravelling(record.state)) return VILLAGE_TRAVELLING;
  if (cells < 1) return MARKET_UNKNOWN;
  return null;
}

/**
 * Přehled vsí, kam smí výprava z vsi `villageId` na trh (Rozhodnutí plánu 2, bod 7). `null` – ves
 * není hráče `playerId`; práva hlídá web.
 */
export async function marketOverview(
  deps: MarketDeps,
  input: { playerId: string; villageId: string; actorId?: string },
): Promise<MarketVillage[] | null> {
  return (await collect(deps, input))?.map((c) => c.village) ?? null;
}

/**
 * Pošle výpravu z vsi `villageId` na trh do vsi `targetVillageId`. Cíl musí být v přehledu a bez
 * `blocked` (vlastní domovská ves, zaniklá, na cestě, archivovaná a odříznutá tam nejsou). Ves
 * pozadu se napřed dopočte do `today` (markets.md – Pravidla 3), pak výprava vyrazí (`departMarket`)
 * a odchozí schránka se doručí. Volá se pod zámkem hráče.
 */
export async function sendMarketExpedition(
  deps: MarketDeps,
  input: {
    playerId: string;
    villageId: string;
    /** Jednající hráč; liší-li se od `playerId`, je to správce a ostatní vsi držitele nevidí. */
    actorId?: string;
    targetVillageId: string;
    order: MarketOrder;
    today: number;
  },
): Promise<{ ok: true; arriveDay: number; returnDay: number } | { ok: false; reason: string }> {
  const all = await collect(deps, input);
  const target = all?.find((c) => c.village.villageId === input.targetVillageId);
  if (!all || !target) return { ok: false, reason: MARKET_UNKNOWN };
  if (target.village.blocked !== null) return { ok: false, reason: target.village.blocked };
  const home = (await deps.villages.find(input.villageId))!;
  const settlement = (await deps.settlements.find(home.settlementId))!;
  const homeCell = settlementCell(settlement);
  const market: MarketTarget = {
    villageId: input.targetVillageId,
    name: target.village.name,
    cells: target.village.cells,
    firstStep: stepToward(homeCell, target.cell),
    homeVillageId: input.villageId,
    homeName: home.name,
  };
  let trip: { arriveDay: number; returnDay: number } | null = null;
  const result = await updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    settlementLandscape(settlement, deps.landscapes),
    (state) => {
      const sent = departMarket(state, input.today, input.order, market);
      if (!sent.ok) return sent;
      trip = { arriveDay: sent.trip.arriveDay, returnDay: sent.trip.returnDay };
      return { ok: true, state: sent.state };
    },
  );
  if (!result.ok) return result;
  await deliverVillageMailSafely(deps, input.villageId);
  return { ok: true, ...trip! };
}
