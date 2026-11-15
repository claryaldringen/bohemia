import { dateOfDayIndex } from '../domain/calendar';
import {
  DOMAIN_FOOD,
  allocateDomainFood,
  cattleFoodKg,
  domainFoodReadyYear,
  domainNeedKg,
  domainOffer,
  noMacroGoods,
  transportLimit,
  type DomainDelivery,
  type DomainOffer,
  type MacroBundle,
} from '../domain/vassalage';
import {
  CATTLE_GOODS,
  isVillageAbandoned,
  isVillageExtinct,
  isVillageTravelling,
  type VillageState,
} from '../domain/village';
import { cellDistance } from '../domain/world/placement';
import { playerDays, type PlayerDayOf, type PlayerTimeDeps } from './player-time';
import type { SettlementRepository, WorldCell } from './settlements';
import { sendShipment, settlementCell, type ShipmentDeps } from './shipments';
import type { VillageRecord, VillageRepository } from './villages';

// Jídlo domény – krok světa (hillfort.md – Jídlo domény; plán 2026-11-08-hillfort, Úloha 7).
// Vsi se dopočítávají každá zvlášť a žádná nevidí stav jiné, proto rozdělení neběží v simulaci vsi,
// ale tady – stejně jako dávky vazalů: krok v den `today` dopočítá všechny vsi domény do téhož dne
// (`loadVillage`), z jejich stavů spočítá čistými funkcemi plán dárce, plán NAPŘED zapíše
// (`DomainFoodRepository.reserve`, jeden na ves a rok) a pak provede zásilkami s jedinečným
// `refId` – po pádu se pošle uložený plán, nic se nezdvojí a nový se nepočítá. Příjezd jde schránkou
// cílové vsi (`sendShipment`), takže výsledek nezávisí na pořadí dopočtu. Pořadí uvnitř kroku je
// pevné (držitelé, dárci i příjemci podle id); jídlo domény na cestě se od potřeby odečte.

/** Účel zásilky jídla domény (`ShipmentRecord.purpose`, popisek kroniky). */
export const DOMAIN_FOOD_PURPOSE = 'domain-food';

/** Rozhodnutí vsi-dárce o jídle domény na rok (tabulka `domain_food_round`, Úloha 8). */
export interface DomainFoodRound {
  /** Dárce. */
  villageId: string;
  /** Herní rok kola (rok dne `day`). */
  year: number;
  /** Herní den, kdy se plán spočítal. */
  day: number;
  /** Plán – dodávky podle `toVillageId`; prázdný = ves letos rozhodla, že nedá nic. */
  deliveries: DomainDelivery[];
  /** Plán je proveden (zásilky odeslané nebo odmítnuté); null – ještě ne (po pádu). */
  finishedAt: Date | null;
}

/** Port: kola jídla domény – rozhodnutí každé vsi na rok (docs/code/vassalage.md). */
export interface DomainFoodRepository {
  /** Vsi z `villageIds`, které rok `year` už rozhodly (plán zapsaný, provedený nebo ne). */
  decided(villageIds: readonly string[], year: number): Promise<Set<string>>;
  /** Zapíše plán; existuje-li řádek (ves, rok), vrátí stávající a nic nemění. */
  reserve(round: Omit<DomainFoodRound, 'finishedAt'>): Promise<DomainFoodRound>;
  /** Zapsané a neprovedené plány (po pádu), nejstarší napřed. */
  unfinished(): Promise<DomainFoodRound[]>;
  /** Označí plán (ves, rok) za provedený. */
  finish(villageId: string, year: number): Promise<void>;
}

/** `offsets`: doména jede ve dni svého držitele (posun času hráče – vsi jedou v jeho dni). */
export interface DomainFoodDeps extends PlayerTimeDeps {
  settlements: Pick<SettlementRepository, 'listActive' | 'ownersWithManyActive'>;
  villages: Pick<VillageRepository, 'stampsOf' | 'digestsOf'>;
  /** Dopočet vsi do dneška a její záznam (composition root jako `prepareVillage` Odvodů). */
  loadVillage: (villageId: string, today: number) => Promise<VillageRecord | null>;
  shipments: ShipmentDeps;
  rounds: DomainFoodRepository;
  /**
   * Pokusy o rozdělení, které nevyšly (dárce po dopočtu není připravený, ves se nenačetla): ves →
   * herní den pokusu. Takový dárce se zkusí znovu nejdřív další herní den (návrh Clauda, Úloha 8)
   * – krok běží 1× za minutu (≈ 86 s je herní den), ale dopočet všech vsí domény je drahý. Worker
   * drží mapu po celý běh; po restartu se zkusí jednou znovu. Bez mapy (testy) se neomezuje.
   */
  attempts?: Map<string, number>;
  /** Odmítnutá dodávka (po pádu a dalším dni ves tolik nemá…); výchozí `console.warn`. */
  log?: (message: string) => void;
}

/** Jedinečný klíč zásilky jídla domény – jedna na dárce, příjemce a rok. */
export function domainFoodRef(year: number, fromVillageId: string, toVillageId: string): string {
  return `domain:${year}:${fromVillageId}:${toVillageId}`;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Kg obilí za jeden kus dobytka (porážka v cíli – hillfort.md). */
const HEAD_KG = cattleFoodKg({ cows: 1, youngOxen: 0, trainedOxen: 0 });

/** Ves se nesimuluje – nic nedá ani nedostane. */
function sleeps(state: VillageState): boolean {
  return isVillageExtinct(state) || isVillageAbandoned(state);
}

/**
 * Krok světa (worker, `runWorldTasks`): napřed provede plány, které zůstaly po pádu neprovedené;
 * pak u každého držitele s víc vsemi (podle id) najde dárce – vsi po letošním výmlatu
 * (`VillageDigest.domainReadyYear`), ne na cestě, bez rozhodnutí na rok. Teprve když nějaký je,
 * dopočítá všechny vsi domény do `today`; každý dárce (podle id) rozdělí nabídku
 * (`domainOffer` v mezi dopravy a zásob) mezi ostatní vsi s lidmi, kterým chybí aspoň
 * `DOMAIN_FOOD.minNeedKg` po odečtení jídla domény na cestě, plán zapíše a provede. Dnešek a rok
 * jdou ve dni držitele (den světa + jeho posun času).
 */
export async function sendDomainFood(
  deps: DomainFoodDeps,
  input: { today: number },
): Promise<void> {
  const log = deps.log ?? console.warn;
  const dayOf = playerDays(deps, input.today);
  for (const round of await deps.rounds.unfinished()) {
    // dárce do dneška – zásilka odchází ze stavu v den `today` jeho držitele
    const today = await holderDay(deps, round.villageId, dayOf);
    await deps.loadVillage(round.villageId, today);
    await carryOut(deps, round, today, log);
  }
  const owners = [...(await deps.settlements.ownersWithManyActive())].sort(byId);
  for (const ownerId of owners) {
    const today = await dayOf(ownerId);
    await ownerRound(deps, ownerId, dateOfDayIndex(today).year, today, log);
  }
}

/** Dnešek vsi – den držitele jejího sídla (ztracené sídlo – den světa). */
async function holderDay(
  deps: DomainFoodDeps,
  villageId: string,
  dayOf: PlayerDayOf,
): Promise<number> {
  const village = await deps.shipments.villages.find(villageId);
  const settlement = village ? await deps.shipments.settlements.find(village.settlementId) : null;
  return dayOf(settlement?.ownerId ?? null);
}

/** Ves domény po dopočtu – záznam, políčko a potřeba bez jídla na cestě (počítá se jednou). */
interface DomainVillage {
  record: VillageRecord;
  cell: WorldCell;
  needKg: number | null;
}

async function ownerRound(
  deps: DomainFoodDeps,
  ownerId: string,
  year: number,
  today: number,
  log: (message: string) => void,
): Promise<void> {
  const settlements = await deps.settlements.listActive(ownerId);
  const stamps = (await deps.villages.stampsOf(settlements.map((s) => s.id))).filter(
    (s) => !s.asleep,
  );
  if (stamps.length < 2) return;
  // souhrn bez současné verze chybí – ves se posoudí po příštím uložení (worker po pár dnech)
  const ready = (await deps.villages.digestsOf(stamps.map((s) => s.id)))
    .filter((d) => d.digest.domainReadyYear === year && !d.digest.travelling)
    .map((d) => d.id);
  if (ready.length === 0) return;
  const decided = await deps.rounds.decided(ready, year);
  const donors = ready
    .filter((id) => !decided.has(id) && (deps.attempts?.get(id) ?? -1) < today)
    .sort(byId);
  if (donors.length === 0) return;

  const cells = new Map(settlements.map((s) => [s.id, settlementCell(s)]));
  const domain = new Map<string, DomainVillage>();
  for (const stamp of [...stamps].sort((a, b) => byId(a.id, b.id))) {
    const record = await deps.loadVillage(stamp.id, today);
    const cell = record ? cells.get(record.settlementId) : undefined;
    if (record && cell) domain.set(record.id, { record, cell, needKg: null });
  }
  const order = [...domain.keys()].sort(byId);

  for (const donorId of donors) {
    const donor = domain.get(donorId);
    if (!donor || !canGive(donor.record.state, today, year)) {
      // nevyšlo – žádný zápis plánu, jen pokus; další pokus nejdřív další herní den
      deps.attempts?.set(donorId, today);
      continue;
    }
    const recipients: { villageId: string; needKg: number; cells: number }[] = [];
    for (const id of order) {
      const village = domain.get(id)!;
      if (id === donorId || !canReceive(village.record.state)) continue;
      village.needKg ??= domainNeedKg(village.record.state, today);
      const needKg =
        village.needKg - (await domainFoodOnTheWay(deps, id, village.record.state.lastDay));
      if (needKg < DOMAIN_FOOD.minNeedKg) continue;
      recipients.push({ villageId: id, needKg, cells: cellDistance(donor.cell, village.cell) });
    }
    const deliveries =
      recipients.length === 0
        ? []
        : allocateDomainFood(
            carriedOffer(donor.record.state, today, Math.max(...recipients.map((r) => r.cells))),
            recipients,
            HEAD_KG,
          );
    // provádí se uložený plán – po souběhu nebo pádu ten, který se zapsal první
    const round = await deps.rounds.reserve({ villageId: donorId, year, day: today, deliveries });
    if (await carryOut(deps, round, today, log)) {
      // dárce po odeslání (méně obilí) – kdyby byl příjemcem dalšího dárce
      const after = await deps.shipments.villages.find(donorId);
      if (after) domain.set(donorId, { record: after, cell: donor.cell, needKg: null });
    }
  }
}

/** Dárce: žije, není na cestě a je po letošním výmlatu (stav v den `today`). */
function canGive(state: VillageState, today: number, year: number): boolean {
  return (
    !sleeps(state) && !isVillageTravelling(state) && domainFoodReadyYear(state, today) === year
  );
}

/** Příjemce: žije, má lidi a není na cestě. */
function canReceive(state: VillageState): boolean {
  return !sleeps(state) && !isVillageTravelling(state) && state.people.length > 0;
}

/**
 * Jídlo domény na cestě do vsi (kg obilí – obilí + dobytek k porážce): zásilky, které ves ještě
 * nedostala (příjezd po dni `lastDay`, do kterého je dopočtená).
 */
async function domainFoodOnTheWay(
  deps: DomainFoodDeps,
  villageId: string,
  lastDay: number,
): Promise<number> {
  let kg = 0;
  for (const r of await deps.shipments.shipments.onTheWay(villageId)) {
    if (r.purpose !== DOMAIN_FOOD_PURPOSE || r.arrivesDay <= lastDay) continue;
    kg += r.body.grainKg + cattleFoodKg(r.body.cattle);
  }
  return kg;
}

/**
 * Nabídka dárce v mezi dopravy k nejvzdálenějšímu příjemci (`transportLimit` – obilí a každý druh
 * dobytka zvlášť, návrh Clauda jako výhled dávek) a obilí jen ze zásob (snopy se nevezou).
 */
function carriedOffer(state: VillageState, today: number, cells: number): DomainOffer {
  const offer = domainOffer(state, today);
  const limit = transportLimit(state, today, cells);
  const cattle = { ...offer.cattle };
  for (const good of CATTLE_GOODS) cattle[good] = Math.min(cattle[good], limit.cattle[good]);
  return {
    grainKg: Math.max(0, Math.min(offer.grainKg, Math.floor(state.storesKg), limit.grainKg)),
    cattle,
  };
}

/** Svazek zásilky z dodávky – jen obilí a dobytek. */
function deliveryBundle(delivery: DomainDelivery): MacroBundle {
  return {
    ...noMacroGoods(),
    grainKg: delivery.grainKg,
    cattle: { ...delivery.cattle },
    people: { families: 0, men: 0, women: 0 },
    laborDays: 0,
  };
}

/**
 * Provede uložený plán: každá dodávka jako zásilka jídla domény s jedinečným `refId` (opakování po
 * pádu nic nezdvojí), odmítnutou přeskočí a zapíše do logu; nakonec plán označí za provedený.
 * Vrací, jestli nějaká zásilka odešla.
 */
async function carryOut(
  deps: DomainFoodDeps,
  round: DomainFoodRound,
  today: number,
  log: (message: string) => void,
): Promise<boolean> {
  let sent = false;
  for (const delivery of round.deliveries) {
    const result = await sendShipment(deps.shipments, {
      fromVillageId: round.villageId,
      toVillageId: delivery.toVillageId,
      bundle: deliveryBundle(delivery),
      purpose: DOMAIN_FOOD_PURPOSE,
      refId: domainFoodRef(round.year, round.villageId, delivery.toVillageId),
      today,
      domain: true,
    });
    if (result.ok) sent = true;
    else {
      log(
        `Jídlo domény ${round.year}: ves ${round.villageId} → ${delivery.toVillageId} neodešlo – ${result.reason}`,
      );
    }
  }
  await deps.rounds.finish(round.villageId, round.year);
  return sent;
}
