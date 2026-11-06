import { dispatchShipment, type MacroBundle } from '../domain/vassalage';
import { isVillageAbandoned, isVillageExtinct, type ShipmentBody } from '../domain/village';
import type { Direction8 } from '../domain/village';
import { GRID_STEPS, OPPOSITE } from '../domain/village/world-grid';
import { cellDistance } from '../domain/world/placement';
import type { PlayerLock } from './locks';
import type { SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Zásilky mezi vsemi různých hráčů (vassalage.md – Doprava a cílová ves; plán 2026-11-03 –
// rozhodnutí 10). Postup `sendShipment` je pod zámkem držitele odesílající vsi a snese pád mezi
// kroky: 1. řádek `shipment` (rezervace, jedinečný `refId`), 2. odesílající ves se uloží se
// zásilkou na cestě (zboží a lidé zmizí, výprava nese `shipmentId`), 3. událost `shipment` do
// schránky cílové vsi (`ref` = `ship:<id>`, druhý zápis se zahodí) a `posted_at`. Co se po pádu
// zastavilo, dokončí `reconcileShipments`: řádek bez uložené vsi se zruší, řádek s uloženou vsí
// bez události se dopíše – právě jednou.
//
// Příjezd do vsi, která zatím zanikla (vymřela, opuštěná) nebo zmizela: zboží i lidé se VRÁTÍ
// odesílateli (zpáteční událost schránky, stejná doba cesty). Schránka spící vsi se nikdy
// nepoužije (docs/code/village-core.md), takže bez vrácení by zboží zmizelo a porušila by se
// bilance; stejné pravidlo platí, když cíl zanikne ještě před odesláním události.

/** Kolikrát se zkusí verzovaný zápis vsi při souběžné změně. */
const SAVE_ATTEMPTS = 5;
/** Dostatečně vzdálený den pro „všechny nespotřebované události“. */
const FAR_DAY = Number.MAX_SAFE_INTEGER;

/** Řádek zásilky (tabulka `shipment`). */
export interface ShipmentRecord {
  id: string;
  fromVillageId: string;
  toVillageId: string;
  /** Co zásilka veze – přesně to, co dojde do schránky cílové vsi. */
  body: ShipmentBody;
  purpose: string;
  /** Jedinečný klíč odeslání (volající: dialog, dohoda…) – opakované odeslání nic nezdvojí. */
  refId: string;
  sentDay: number;
  arrivesDay: number;
  /** Událost je zapsaná ve schránce (null – ještě ne, obnoví `reconcileShipments`). */
  postedAt: Date | null;
  /** Zásilka je vyřízená (doručená, nebo vrácená) – už nic neřeší. */
  settledAt: Date | null;
}

/** Port: zásilky na cestě mezi vsemi hráčů (docs/code/vassalage.md – Zásilky). */
export interface ShipmentRepository {
  /** Nový řádek; jedinečný `refId` – existuje-li, vrátí `created: false` a stávající řádek. */
  reserve(
    input: Omit<ShipmentRecord, 'id' | 'postedAt' | 'settledAt'>,
  ): Promise<{ record: ShipmentRecord; created: boolean }>;
  findByRef(refId: string): Promise<ShipmentRecord | null>;
  /** Řádky bez zapsané události (po pádu), nejstarší napřed. */
  unposted(): Promise<ShipmentRecord[]>;
  /** Zapsané a nevyřízené zásilky (na cestě). */
  open(): Promise<ShipmentRecord[]>;
  /** Zásilky na cestě do vsi `toVillageId` (zapsané, nevyřízené) – seznam „na cestě“. */
  onTheWay(toVillageId: string): Promise<ShipmentRecord[]>;
  markPosted(id: string, at: Date): Promise<void>;
  settle(id: string, at: Date): Promise<void>;
  /** Zruší rezervaci, jejíž odeslání se nedokončilo (ves se neuložila). */
  remove(id: string): Promise<void>;
}

export interface ShipmentDeps {
  shipments: ShipmentRepository;
  villages: VillageRepository;
  settlements: SettlementRepository;
  locks: PlayerLock;
  now: () => Date;
}

export type SendShipmentResult =
  { ok: true; shipmentId: string; arrivesDay: number } | { ok: false; reason: string };

/** Ves se nesimuluje – nic neposílá ani nepřijímá. */
function sleeps(record: VillageRecord | null): boolean {
  return record === null || isVillageExtinct(record.state) || isVillageAbandoned(record.state);
}

/** Směr prvního kroku z políčka `from` k `to` (stejné políčko – sever). */
function stepToward(from: { x: number; y: number }, to: { x: number; y: number }): Direction8 {
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  for (const [direction, step] of Object.entries(GRID_STEPS) as [
    Direction8,
    { x: number; y: number },
  ][]) {
    if (step.x === sx && step.y === sy) return direction;
  }
  return 'N';
}

/** Poloha vsi na mapě světa (sídlo z doby před mřížkou – počátek) a držitel. */
async function placeOf(
  deps: Pick<ShipmentDeps, 'settlements'>,
  village: VillageRecord,
): Promise<{ cell: { x: number; y: number }; ownerId: string } | null> {
  const settlement = await deps.settlements.find(village.settlementId);
  if (!settlement) return null;
  return { cell: settlement.worldCell ?? { x: 0, y: 0 }, ownerId: settlement.ownerId };
}

/**
 * Pošle zásilku z vsi `fromVillageId` do vsi `toVillageId` (jiného hráče, může být i téhož rodu):
 * zboží a lidé ze svazku `bundle` odejdou hned, dojdou za `2 × vzdálenost` dní od `today`.
 * Ves odesílatele se napřed dopočítá volající (stav v den `today`); mez dopravy (`transportLimit`)
 * hlídá dialog. Opakované volání se stejným `refId` nic nezdvojí. Nedostatek nebo zaniklý cíl
 * → `{ ok: false, reason }`.
 */
export async function sendShipment(
  deps: ShipmentDeps,
  input: {
    fromVillageId: string;
    toVillageId: string;
    bundle: MacroBundle;
    purpose: string;
    refId: string;
    today: number;
  },
): Promise<SendShipmentResult> {
  const from = await deps.villages.find(input.fromVillageId);
  if (!from) return { ok: false, reason: 'Odesílající ves neexistuje.' };
  const fromPlace = await placeOf(deps, from);
  if (!fromPlace) return { ok: false, reason: 'Odesílající ves nemá sídlo.' };
  return deps.locks.run(fromPlace.ownerId, () => sendLocked(deps, input));
}

async function sendLocked(
  deps: ShipmentDeps,
  input: Parameters<typeof sendShipment>[1],
): Promise<SendShipmentResult> {
  const existing = await deps.shipments.findByRef(input.refId);
  if (existing) {
    // opakované odeslání (po pádu, dvojklik): dokončit rozdělané, nebo – řádek bez uložené vsi – začít znovu
    if (existing.postedAt !== null) return doneResult(existing);
    if ((await finishUnposted(deps, existing, input.today)) !== 'cancelled') {
      return doneResult(existing);
    }
  }
  if (input.fromVillageId === input.toVillageId) {
    return { ok: false, reason: 'Zásilka nemůže jít do téže vsi.' };
  }
  const to = await deps.villages.find(input.toVillageId);
  if (sleeps(to)) return { ok: false, reason: 'Cílová ves zanikla.' };
  const toPlace = await placeOf(deps, to!);
  if (!toPlace) return { ok: false, reason: 'Cílová ves nemá sídlo.' };
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const from = await deps.villages.find(input.fromVillageId);
    if (sleeps(from)) return { ok: false, reason: 'Odesílající ves nevysílá.' };
    const fromPlace = await placeOf(deps, from!);
    if (!fromPlace) return { ok: false, reason: 'Odesílající ves nemá sídlo.' };
    const cells = cellDistance(fromPlace.cell, toPlace.cell);
    const sent = dispatchShipment(from!.state, input.today, {
      bundle: input.bundle,
      cells,
      firstStep: stepToward(fromPlace.cell, toPlace.cell),
      toName: to!.name,
      fromName: from!.name,
      fromVillageId: from!.id,
      purpose: input.purpose,
    });
    if (!sent.ok) return sent;
    const { record } = await deps.shipments.reserve({
      fromVillageId: from!.id,
      toVillageId: to!.id,
      body: sent.body,
      purpose: input.purpose,
      refId: input.refId,
      sentDay: input.today,
      arrivesDay: sent.arrivesDay,
    });
    const expedition = sent.state.trade?.expeditions.find(
      (e) => e.kind === 'shipment' && e.shipmentId === undefined,
    );
    if (expedition) expedition.shipmentId = record.id;
    const saved = await deps.villages.save(from!.id, sent.state, from!.version);
    if (!saved) {
      await deps.shipments.remove(record.id);
      continue;
    }
    await post(deps, record);
    return { ok: true, shipmentId: record.id, arrivesDay: record.arrivesDay };
  }
  return { ok: false, reason: 'Ves se mezitím změnila, zkus to znovu.' };
}

function doneResult(record: ShipmentRecord): SendShipmentResult {
  return { ok: true, shipmentId: record.id, arrivesDay: record.arrivesDay };
}

/** Zapíše událost do schránky cílové vsi a řádek označí (druhý zápis téhož `ref` se zahodí). */
async function post(deps: ShipmentDeps, record: ShipmentRecord): Promise<void> {
  await deps.villages.inbox.post({
    villageId: record.toVillageId,
    day: record.arrivesDay,
    ref: `ship:${record.id}`,
    body: { kind: 'shipment', shipment: record.body },
  });
  await deps.shipments.markPosted(record.id, deps.now());
}

/** Vrátí zásilku odesílateli (cíl zanikl): zpáteční událost, stejná doba cesty; řádek se vyřídí. */
async function returnToSender(
  deps: ShipmentDeps,
  record: ShipmentRecord,
  target: VillageRecord | null,
  today: number,
): Promise<void> {
  const sender = await deps.villages.find(record.fromVillageId);
  if (!sender || sleeps(sender)) {
    // vymřeli oba – není komu vracet
    await deps.shipments.settle(record.id, deps.now());
    return;
  }
  await deps.villages.inbox.post({
    villageId: record.fromVillageId,
    day: today + (record.arrivesDay - record.sentDay),
    ref: `ship-back:${record.id}`,
    body: {
      kind: 'shipment',
      shipment: {
        ...record.body,
        key: `${record.body.key}:back`,
        fromVillageId: record.toVillageId,
        fromName: target?.name ?? '',
        direction: OPPOSITE[record.body.direction],
        returned: true,
      },
    },
  });
  if (record.postedAt === null) await deps.shipments.markPosted(record.id, deps.now());
  await deps.shipments.settle(record.id, deps.now());
}

/**
 * Dokončí řádek bez zapsané události: odesílající ves už zásilku nese (`shipmentId` ve výpravě)
 * → událost do schránky cíle (nebo zpět odesílateli, zanikl-li cíl); jinak se ves neuložila
 * a rezervace se zruší (zboží ve vsi zůstalo). Volající drží zámek držitele odesílatele.
 */
async function finishUnposted(
  deps: ShipmentDeps,
  record: ShipmentRecord,
  today: number,
): Promise<'posted' | 'returned' | 'cancelled'> {
  const sender = await deps.villages.find(record.fromVillageId);
  const carried = sender?.state.trade?.expeditions.some((e) => e.shipmentId === record.id) ?? false;
  if (!carried) {
    await deps.shipments.remove(record.id);
    return 'cancelled';
  }
  const target = await deps.villages.find(record.toVillageId);
  if (sleeps(target)) {
    await returnToSender(deps, record, target, today);
    return 'returned';
  }
  await post(deps, record);
  return 'posted';
}

/** Zapsala schránka cíle událost téhle zásilky a ještě ji nepoužila? */
async function unconsumed(deps: ShipmentDeps, record: ShipmentRecord): Promise<boolean> {
  const target = await deps.villages.find(record.toVillageId);
  if (!target) return true;
  const pending = await deps.villages.inbox.pending(
    record.toVillageId,
    target.state.lastDay,
    FAR_DAY,
  );
  return pending.some((e) => e.body.kind === 'shipment' && e.body.shipment.key === record.body.key);
}

/**
 * Obnova zásilek (worker 1× za minutu v úlohách světa): dopíše události řádkům, které se po pádu
 * nedostaly do schránky (`finishUnposted`), a vrátí odesílateli zásilky, jejichž cíl mezitím zanikl
 * dřív, než událost použil; doručené zásilky vyřídí. Každý řádek pod zámkem držitele odesílatele
 * (zaneprázdněného přeskočí – příště). Vrací, kolik zásilek dopsala nebo vrátila.
 */
export async function reconcileShipments(deps: ShipmentDeps, today: number): Promise<number> {
  let fixed = 0;
  for (const record of await deps.shipments.unposted()) {
    fixed += await underLock(deps, record, async () => {
      const outcome = await finishUnposted(deps, record, today);
      return outcome === 'cancelled' ? 0 : 1;
    });
  }
  for (const record of await deps.shipments.open()) {
    fixed += await underLock(deps, record, async () => {
      const target = await deps.villages.find(record.toVillageId);
      if (await unconsumed(deps, record)) {
        if (!sleeps(target)) return 0;
        await returnToSender(deps, record, target, today);
        return 1;
      }
      await deps.shipments.settle(record.id, deps.now());
      return 0;
    });
  }
  return fixed;
}

/** Spustí `run` pod zámkem držitele odesílající vsi; zaneprázdněného nebo ztraceného přeskočí. */
async function underLock(
  deps: ShipmentDeps,
  record: ShipmentRecord,
  run: () => Promise<number>,
): Promise<number> {
  const from = await deps.villages.find(record.fromVillageId);
  const place = from ? await placeOf(deps, from) : null;
  if (!place) {
    // odesílatel zanikl i s řádkem v obnově – nemá komu patřit zámek, dokončí se bez něj
    return run();
  }
  const result = await deps.locks.tryRun(place.ownerId, run);
  return result.ran ? result.value : 0;
}
