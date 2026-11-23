import { TOTAL_GAME_DAYS } from '../domain/calendar';
import {
  marketArrivalRef,
  marketResult,
  marketResultRef,
  type MarketArrival,
  type MarketResult,
  type MarketTrip,
  type VillageMail,
  type VillageState,
} from '../domain/village';
import type { SettlementRepository } from './settlements';
import { placeOf, sleeps } from './shipments';
import type { VillageRecord, VillageRepository } from './villages';

// Pošta mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6; village-core.md – Schránka vsi):
// ves sbírá zprávy pro jiné vsi do odchozí schránky (`VillageState.outbox` – příjezd výpravy na
// trh, výsledek trhu) a `deliverVillageMail` je zapíše do schránek cílových vsí (`inbox.post` –
// druhý zápis téhož `ref` se zahodí) a doručené smaže (verzovaný zápis vsi). Volá se po dopočtu
// tam, kde se vybavují odchody správce (`advancePlayer`, `dynastyForVillage`, `advanceDynasty`),
// a po odeslání výpravy; worker doručí i ves, kterou už dopočítal web – pád mezi uložením vsi
// a doručením tak dožene příští kolo. Výprava po termínu (`lastDay ≥ returnDay`, výsledek
// nepřišel) se podívá na hostitele: výsledek z jeho odchozí schránky doručí sama, zaniklý hostitel
// ji vrátí. Každá zpráva výpravy má pevný `ref`, takže domů přijde nejvýš jeden výsledek.

/**
 * Kolikrát se zkusí smazat doručené z odchozí schránky při souběžné změně vsi – technická mez, ne
 * pravidlo (proto ne v `rules*.ts`).
 */
export const MAIL_ATTEMPTS = 5;

/** Co doručení potřebuje: vsi (i schránku) a sídla – zaniklý hostitel (sídlo v archivu). */
export interface VillageMailDeps {
  villages: VillageRepository;
  settlements: Pick<SettlementRepository, 'find'>;
}

/** Výprava na trh po termínu: je doma (`lastDay ≥ returnDay`) a výsledek trhu nepřišel. */
function overdueTrips(state: VillageState): MarketTrip[] {
  return (state.trade?.expeditions ?? []).flatMap((e) =>
    e.kind === 'market' && e.market !== undefined && state.lastDay >= e.market.returnDay
      ? [e.market]
      : [],
  );
}

/**
 * Má ves co doručit: neprázdný `outbox`, nebo výprava 'market' s `lastDay ≥ market.returnDay`
 * (výsledek nepřišel).
 */
export function hasVillageMail(state: VillageState): boolean {
  return (state.outbox?.length ?? 0) > 0 || overdueTrips(state).length > 0;
}

/** Zpráva výsledku trhu pro domovskou ves `villageId` na den `day` (`ref` = `marketResultRef`). */
function resultMail(villageId: string, day: number, result: MarketResult): VillageMail {
  return {
    villageId,
    day,
    ref: marketResultRef(result.key),
    body: { kind: 'market-result', result },
  };
}

/** Zapíše zprávu do schránky cílové vsi; true = zapsaná (ne duplicita téhož `ref`). */
async function post(deps: VillageMailDeps, mail: VillageMail): Promise<boolean> {
  return (await deps.villages.inbox.post(mail)) !== null;
}

/**
 * Doručí odchozí schránku vsi a vyřeší její výpravy na trh po termínu (Rozhodnutí 6). Vrací počet
 * zapsaných zpráv.
 *
 * 1. Každou zprávu `outbox` zapíše do schránky cílové vsi. Cílová ves neexistuje (`post` by na
 *    neznámé vsi spadl): příjezd se změní ve výsledek `returned` se vším, co výprava vezla, do
 *    schránky vsi v den plánovaného návratu (lidé jsou doma v plánovaný den); výsledek pro
 *    zmizelou domovskou ves se zahodí.
 * 2. Zapsané a zahozené smaže z `outbox` (verzovaný zápis, při souběhu znovu, nejvýš
 *    `MAIL_ATTEMPTS`); prázdný `outbox` se ze stavu smaže celý.
 * 3. Výpravy po termínu (`overdueTrips`): výsledek v odchozí schránce hostitele zapíše; hostitel
 *    pryč (vymřel, opuštěn, sídlo v archivu, ves chybí) – nepoužitý příjezd (ve schránce
 *    hostitele; chybí-li hostitel, v odchozí schránce vsi) se vrátí se vším, výprava na trhu
 *    hostitele s tím, co drží (`returned`, den `lastDay + 1`); živý hostitel pozadu znamená čekat.
 */
export async function deliverVillageMail(
  deps: VillageMailDeps,
  villageId: string,
): Promise<number> {
  let village = await deps.villages.find(villageId);
  if (!village) return 0;
  const outbox = village.state.outbox ?? [];
  let written = 0;
  if (outbox.length > 0) {
    // existence cílových vsí jedním levným dotazem (otisky bez stavu)
    const stamps = await deps.villages.stampsOfVillages([
      ...new Set(outbox.map((m) => m.villageId)),
    ]);
    const known = new Set(stamps.map((s) => s.id));
    for (const mail of outbox) {
      if (known.has(mail.villageId)) {
        if (await post(deps, mail)) written++;
      } else if (mail.body.kind === 'market-arrive') {
        const { arrival } = mail.body;
        // hostitel zmizel – výprava se vrátí se vším v den plánovaného návratu
        const returnDay = mail.day + arrival.stayDays + arrival.travelDays;
        const result = marketResult(arrival, { returned: true });
        if (await post(deps, resultMail(villageId, returnDay, result))) written++;
      }
      // výsledek pro zmizelou domovskou ves se zahodí
    }
    const saved = await dropDelivered(deps, villageId, outbox);
    if (!saved) return written; // ves mezitím zmizela
    village = saved;
  }
  for (const trip of overdueTrips(village.state)) {
    const mail = await overdueResult(deps, village, trip, outbox);
    if (mail && (await post(deps, mail))) written++;
  }
  return written;
}

/**
 * Smaže doručené zprávy `delivered` z odchozí schránky vsi (verzovaný zápis; zprávy, které mezitím
 * přibyly, zůstanou). Vrací uložený záznam, nebo null, když nebylo co mazat (nebo ves zmizela).
 */
async function dropDelivered(
  deps: VillageMailDeps,
  villageId: string,
  delivered: readonly VillageMail[],
): Promise<VillageRecord | null> {
  const refs = new Set(delivered.map((m) => m.ref));
  for (let attempt = 0; attempt < MAIL_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(villageId);
    if (!current) return null;
    const outbox = current.state.outbox ?? [];
    if (!outbox.some((m) => refs.has(m.ref))) return current;
    const rest = outbox.filter((m) => !refs.has(m.ref));
    const next: VillageState = { ...current.state };
    if (rest.length > 0) next.outbox = rest;
    else delete next.outbox;
    const saved = await deps.villages.save(villageId, next, current.version);
    if (saved) return saved;
  }
  throw new Error(
    `Ves ${villageId}: odchozí schránku se nepodařilo uložit – příliš mnoho souběžných změn.`,
  );
}

/**
 * Výsledek výpravy po termínu (krok 3): ze schránky hostitele, nebo `returned` od zaniklého
 * hostitele; null – čekat (živý hostitel pozadu), nebo výsledek už je na cestě domů.
 */
async function overdueResult(
  deps: VillageMailDeps,
  home: VillageRecord,
  trip: MarketTrip,
  outbox: readonly VillageMail[],
): Promise<VillageMail | null> {
  const host = await deps.villages.find(trip.villageId);
  const ref = marketResultRef(trip.key);
  const ready = host?.state.outbox?.find((m) => m.ref === ref);
  if (ready) return ready;
  const gone = sleeps(host) || (await placeOf(deps, host!)) === null;
  if (!gone) return null;
  // nepoužitý příjezd: hostitel existuje – jen jeho schránka (příjezd z odchozí schránky vsi do ní
  // zapsal už krok 1; zpráva, kterou minule nešlo smazat, nedokazuje, že ji hostitel nepoužil);
  // hostitel chybí – příjezd v odchozí schránce vsi (krok 1 ho už vrátil – zápis se zahodí)
  // zaniklý hostitel se mohl dopočítat přes den příjezdu (spící ves dál posouvá `lastDay`), proto
  // se příjezd hledá od `arriveDay − 1`, ne od `lastDay`; napřed návštěvník – použitý příjezd je
  // vidět jinde (návštěvník na trhu, výsledek v `outbox` hostitele, nebo už ve schránce domova)
  const visitor = host?.state.market?.visitors.find((v) => v.key === trip.key);
  const unused = visitor
    ? null
    : host
      ? await pendingArrival(deps, host, trip)
      : outboxArrival(outbox, trip.key);
  const from = visitor ?? unused;
  if (!from) return null;
  return resultMail(home.id, home.state.lastDay + 1, marketResult(from, { returned: true }));
}

/** Příjezd výpravy `key` v odchozí schránce vsi. */
function outboxArrival(outbox: readonly VillageMail[], key: string): MarketArrival | null {
  const mail = outbox.find((m) => m.ref === marketArrivalRef(key));
  return mail?.body.kind === 'market-arrive' ? mail.body.arrival : null;
}

/** Příjezd výpravy `key`, který hostitel ještě nepoužil (čeká v jeho schránce). */
async function pendingArrival(
  deps: VillageMailDeps,
  host: VillageRecord,
  trip: MarketTrip,
): Promise<MarketArrival | null> {
  const pending = await deps.villages.inbox.pending(host.id, trip.arriveDay - 1, TOTAL_GAME_DAYS);
  for (const event of pending) {
    if (event.body.kind === 'market-arrive' && event.body.arrival.key === trip.key) {
      return event.body.arrival;
    }
  }
  return null;
}

/** Jako `deliverVillageMail`, chybu zapíše do logu a vrátí 0 – dopočet vsi nezastaví. */
export async function deliverVillageMailSafely(
  deps: VillageMailDeps,
  villageId: string,
  log: (message: string, error: unknown) => void = console.error,
): Promise<number> {
  try {
    return await deliverVillageMail(deps, villageId);
  } catch (error) {
    log(`Ves ${villageId}: doručení odchozí schránky selhalo.`, error);
    return 0;
  }
}
