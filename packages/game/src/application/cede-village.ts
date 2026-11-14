import { PEACE_REASONS } from '../domain/negotiation';
import {
  APPOINT_LORD,
  departAppointee,
  holderStamp,
  isLineMan,
  isVillageAbandoned,
  isVillageExtinct,
  setStewardOn,
  withSteward,
  type VillageState,
} from '../domain/village';
import { cellDistance } from '../domain/world/placement';
import { acceptHolderTransfers, transferVillages } from './escheat';
import type { HouseRepository } from './houses';
import type { PlayerLock } from './locks';
import type { Settlement, SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Postoupení vsí v míru (war.md – Konec války – mírové jednání; Martin 2. 11. 2026: „Pokud rod
// jinou ves nemá, nebude postoupení vsi v nabídce, pouze vazalství“). Ves přejde celá (po celé
// mapě jako v odúmrti – držitel je u sídla), muži rodu postupujícího s rodinami odejdou do jiné
// vsi svého rodu (schránka vsi, událost jako `lord-arrives`) a nový držitel má ve vsi zapnutého
// správce. Opakované volání nic nezdvojí (jedinečné `ref` příchodů, převod držitele je podmíněný).

export interface CedeDeps {
  houses: Pick<HouseRepository, 'byId' | 'activeOf'>;
  settlements: Pick<
    SettlementRepository,
    'find' | 'listActive' | 'transferHolder' | 'acceptTransfers' | 'archive'
  >;
  villages: Pick<VillageRepository, 'find' | 'listBySettlement' | 'save' | 'inbox'>;
  locks: PlayerLock;
}

/** Strany postoupení: kdo ves postupuje a kdo ji dostane. */
export type CedeCheck =
  { ok: true; fromHouseId: string; toHouseId: string } | { ok: false; reason: string };

/** Háčky postoupení pro jednání (`NegotiateDeps.cede`). */
export interface CedeHooks {
  /** Smí strana z dvojice postoupit tyto vsi? Určí, která. */
  check(parties: readonly [string, string], villageIds: readonly string[]): Promise<CedeCheck>;
  /** Provede postoupení (po transakci přijetí, nikdy pod zámkem hráče). */
  apply(input: {
    fromHouseId: string;
    toHouseId: string;
    villageIds: readonly string[];
    negotiationId: string;
    now: Date;
    today: number;
  }): Promise<void>;
}

/** Kolikrát se zkusí verzovaný zápis vsi při souběžné změně. */
const SAVE_ATTEMPTS = 5;

/** Mapa (sídlo) hráče s jeho vsemi. */
interface MapWithVillages {
  settlement: Settlement;
  villages: VillageRecord[];
}

async function mapsOf(deps: CedeDeps, playerId: string): Promise<MapWithVillages[]> {
  const out: MapWithVillages[] = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    out.push({ settlement, villages: await deps.villages.listBySettlement(settlement.id) });
  }
  return out;
}

const sleeps = (state: VillageState): boolean =>
  isVillageExtinct(state) || isVillageAbandoned(state);

/** Rozdělení map hráče na postupované (nesou některou z vsí) a zbylé. */
function splitMaps(
  maps: readonly MapWithVillages[],
  villageIds: readonly string[],
): { ceded: MapWithVillages[]; kept: MapWithVillages[] } {
  const wanted = new Set(villageIds);
  const ceded = maps.filter((m) => m.villages.some((v) => wanted.has(v.id)));
  return { ceded, kept: maps.filter((m) => !ceded.includes(m)) };
}

/**
 * Kontrola nabídky postoupení: všechny vsi patří jedné ze stran a postupující straně zůstane
 * aspoň jedna živá ves na jiné mapě (poslední ves rodu v nabídce být nesmí).
 */
export async function checkCede(
  deps: CedeDeps,
  parties: readonly [string, string],
  villageIds: readonly string[],
): Promise<CedeCheck> {
  for (const [fromId, toId] of [parties, [parties[1], parties[0]]] as const) {
    const from = await deps.houses.byId(fromId);
    if (!from?.playerId) continue;
    const maps = await mapsOf(deps, from.playerId);
    const owned = new Set(maps.flatMap((m) => m.villages.map((v) => v.id)));
    if (!villageIds.every((id) => owned.has(id))) continue;
    const { kept } = splitMaps(maps, villageIds);
    if (!kept.some((m) => m.villages.some((v) => !sleeps(v.state)))) {
      return { ok: false, reason: PEACE_REASONS.lastVillage };
    }
    return { ok: true, fromHouseId: fromId, toHouseId: toId };
  }
  return { ok: false, reason: PEACE_REASONS.badCede };
}

/** Ves nejbližší sídlu `origin` (políčka mapy), při shodě nižší id; null – žádná živá. */
function nearestLiving(
  kept: readonly MapWithVillages[],
  origin: { x: number; y: number } | null,
): VillageRecord | null {
  let best: { village: VillageRecord; distance: number } | null = null;
  for (const m of kept) {
    const cell = m.settlement.worldCell;
    const distance = origin && cell ? Math.max(1, cellDistance(origin, cell)) : 1;
    for (const village of m.villages) {
      if (sleeps(village.state)) continue;
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && village.id < best.village.id)
      ) {
        best = { village, distance };
      }
    }
  }
  return best?.village ?? null;
}

/**
 * Muži rodu z postupované vsi odejdou s rodinami do vsi `destination` (schránka, jedinečné `ref`
 * na muže). Ze zdroje odchází jeden po druhém z čerstvého stavu a zápis je verzovaný.
 */
async function sendMenAway(
  deps: CedeDeps,
  input: {
    villageId: string;
    destination: VillageRecord;
    days: number;
    negotiationId: string;
    today: number;
  },
): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const source = await deps.villages.find(input.villageId);
    if (!source) return;
    let state = source.state;
    let sent = 0;
    for (;;) {
      const man = state.people.find(isLineMan);
      if (!man) break;
      const departure = departAppointee(state, state.lastDay, man.id, input.destination.name);
      await deps.villages.inbox.post({
        villageId: input.destination.id,
        day: input.today + input.days,
        ref: `cede:${input.negotiationId}:${source.id}:${man.id}`,
        body: {
          kind: 'lord-arrives',
          party: departure.party,
          fromVillageId: source.id,
          ...holderStamp(input.destination.state),
        },
      });
      state = departure.state;
      sent++;
    }
    if (sent === 0 || (await deps.villages.save(source.id, state, source.version))) return;
  }
}

/**
 * Opakované postoupení, když vsi už od postupujícího odešly: nový držitel převezme, co na něj
 * čeká (pád mezi kroky převodu), a ve vsích map s postoupenými vsemi má zapnutého správce (pád
 * před zapnutím). Mapy, které nový držitel nedrží, se nemění. Volá ho i web po Začít znovu obránce
 * (vzdané vsi – `RestartGameResult.surrendered`), až uvolní zámek obránce; volající zámek nedrží.
 */
export async function finishCeded(
  deps: CedeDeps,
  villageIds: readonly string[],
  toPlayerId: string,
  today: number,
): Promise<void> {
  await deps.locks.run(toPlayerId, () => acceptHolderTransfers(deps, toPlayerId));
  const { ceded } = splitMaps(await mapsOf(deps, toPlayerId), villageIds);
  for (const map of ceded) {
    for (const village of map.villages) await enableSteward(deps, village.id, today);
  }
}

/**
 * Vzdané mapy po Začít znovu obránce (`RestartGameResult.surrendered`) převezmou jejich noví
 * držitelé (`finishCeded`, volající zámek nedrží). Chyba převzetí restart nezmaří – předá se
 * `onError` (zalogovat) a převzetí dokončí worker (`acceptHolderTransfers`); další mapy se
 * převezmou dál.
 */
export async function finishSurrendered(
  deps: CedeDeps,
  maps: readonly { villageIds: readonly string[]; toPlayerId: string }[],
  today: number,
  onError: (toPlayerId: string, error: unknown) => void,
): Promise<void> {
  for (const map of maps) {
    try {
      await finishCeded(deps, map.villageIds, map.toPlayerId, today);
    } catch (error) {
      onError(map.toPlayerId, error);
    }
  }
}

/** Nový držitel má ve vsi zapnutého správce (steward.md – Stav správce); idempotentní. */
async function enableSteward(deps: CedeDeps, villageId: string, day: number): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(villageId);
    if (!current) return;
    const next = structuredClone(withSteward(current.state));
    setStewardOn(next, day, true);
    if (await deps.villages.save(villageId, next, current.version)) return;
  }
}

/**
 * Provede postoupení: muži rodu odejdou, ves (celá mapa) přejde na nového držitele postupně pod
 * zámky (nikdy dva naráz – jako v odúmrti) a ve vsích se zapne správce. Volající nedrží žádný zámek.
 */
export async function cedeVillages(
  deps: CedeDeps,
  input: {
    fromHouseId: string;
    toHouseId: string;
    villageIds: readonly string[];
    negotiationId: string;
    now: Date;
    today: number;
  },
): Promise<void> {
  const from = await deps.houses.byId(input.fromHouseId);
  const to = await deps.houses.byId(input.toHouseId);
  if (!from?.playerId || !to?.playerId) return;
  const maps = await mapsOf(deps, from.playerId);
  const { ceded, kept } = splitMaps(maps, input.villageIds);
  // už přešlo (opakování) – po pádu (schránka jednání, audit A2) dokončit převzetí a správce
  if (ceded.length === 0) return finishCeded(deps, input.villageIds, to.playerId, input.today);
  const origin = ceded[0]?.settlement.worldCell ?? null;
  const destination = nearestLiving(kept, origin);
  if (!destination) return; // poslední ves se nepostupuje – kontrola to zachytila dřív
  const destCell = kept.find((m) => m.villages.some((v) => v.id === destination.id))?.settlement
    .worldCell;
  for (const map of ceded) {
    const distance =
      destCell && map.settlement.worldCell
        ? Math.max(1, cellDistance(destCell, map.settlement.worldCell))
        : 1;
    for (const village of map.villages) {
      if (sleeps(village.state)) continue;
      await sendMenAway(deps, {
        villageId: village.id,
        destination,
        days: APPOINT_LORD.daysPerMapStep * distance,
        negotiationId: input.negotiationId,
        today: input.today,
      });
    }
  }
  const all = ceded.flatMap((m) => m.villages.map((v) => v.id));
  await transferVillages(deps, all, from.playerId, to.playerId);
  // správce se zapíná pro všechny vsi nabídky, ne jen pro ty, které se převedly teď: po pádu mezi
  // mapami (audit A2, M2) už jsou některé převedené dřív a `ceded` je neobsahuje
  await finishCeded(deps, input.villageIds, to.playerId, input.today);
}
