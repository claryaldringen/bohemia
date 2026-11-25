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
import type { VillageRecord, VillageRepository, VillageStamp } from './villages';

// Pošta mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6; village-core.md – Schránka vsi):
// ves sbírá zprávy pro jiné vsi do odchozí schránky (`VillageState.outbox` – příjezd výpravy na
// trh, výsledek trhu) a `deliverVillageMail` je zapíše do schránek cílových vsí (`inbox.post` –
// druhý zápis téhož `ref` se zahodí) a doručené smaže (verzovaný zápis vsi). Volá se po dopočtu
// tam, kde se vybavují odchody správce (`advancePlayer`, `dynastyForVillage`, `advanceDynasty`),
// a po odeslání výpravy; worker doručí i ves, kterou už dopočítal web – pád mezi uložením vsi
// a doručením tak dožene příští kolo. Výprava po termínu (`lastDay ≥ returnDay`, výsledek
// nepřišel) se podívá na hostitele: výsledek z jeho odchozí schránky doručí sama, zaniklý hostitel
// ji vrátí. Každá zpráva výpravy má pevný `ref`, takže domů přijde nejvýš jeden výsledek. Lidé
// a mince výsledku se zaniklou domovskou vsí nezmizí – jdou zpět k hostiteli (Rozhodnutí plánu 3,
// bod 13, a plánu 4, bod 9).

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

/**
 * Nese zpráva lidi – výsledek trhu s neprodanými nebo koupenými lidmi (markets.md – Rozhodnutí
 * plánu 3, bod 10)?
 */
function carriesPeople(mail: VillageMail): boolean {
  if (mail.body.kind !== 'market-result') return false;
  const { people = [], newcomers = [] } = mail.body.result;
  return people.length + newcomers.length > 0;
}

/**
 * Nese zpráva mince domů – výsledek trhu s měšcem výpravy `unsold.coins` (markets.md – Rozhodnutí
 * plánu 4, bod 9)?
 */
function carriesCoins(mail: VillageMail): boolean {
  return mail.body.kind === 'market-result' && (mail.body.result.unsold.coins ?? 0) > 0;
}

/** Výsledek, který se se zaniklou domovskou vsí nesmí zahodit celý – nese lidi nebo mince. */
function mustReturn(mail: VillageMail): boolean {
  return carriesPeople(mail) || carriesCoins(mail);
}

/** Zpráva bez nákladu (markets.md – Rozhodnutí plánu 3, bod 13) – do zaniklé vsi se zahodí. */
function isQuery(mail: VillageMail): boolean {
  const kind = mail.body.kind;
  return kind === 'kin-ask' || kind === 'smith-ask' || kind === 'order-ready';
}

/**
 * Lidé a mince z výsledku `result` (`ref` výsledku `ref`, den `day`) pro zaniklou domovskou ves
 * zpět k hostiteli `hostId` (Rozhodnutí plánu 3, bod 13, a plánu 4, bod 9): zpráva
 * `stranded-people` s `ref` `<ref výsledku>:back` – skupiny, které hostitel prodal sám (`fromHost`),
 * v `own` (vrátí se s původními id), ostatní (`people`, koupení od jiné výpravy) v `people` (usadí
 * se s novými id), `coins` = měšec výpravy při odjezdu (`unsold.coins`), `from` = `origin` výsledku.
 * Zboží výsledku se zahodí. Krok 1 pošty i úloha světa `returnStrandedPeople` skládají tutéž zprávu
 * – druhý zápis téhož `ref` se zahodí.
 */
function strandedMail(hostId: string, ref: string, day: number, result: MarketResult): VillageMail {
  const newcomers = result.newcomers ?? [];
  const own = newcomers.filter((g) => g.fromHost === true);
  const coins = result.unsold.coins ?? 0;
  return {
    villageId: hostId,
    day,
    ref: `${ref}:back`,
    body: {
      kind: 'stranded-people',
      key: result.key,
      people: [...(result.people ?? []), ...newcomers.filter((g) => g.fromHost !== true)],
      ...(own.length > 0 ? { own } : {}),
      ...(coins > 0 ? { coins } : {}),
      from: result.origin,
    },
  };
}

/**
 * Výprava `key` domovské vsi, na jejíž výsledek ves ještě čeká (`trade.expeditions`) – použitý
 * výsledek ji odebere (`applyMarketResult`); null = výsledek ves už použila.
 */
function awaitedTrip(state: VillageState, key: string): MarketTrip | null {
  const expedition = (state.trade?.expeditions ?? []).find(
    (e) => e.kind === 'market' && e.market?.key === key,
  );
  return expedition?.market ?? null;
}

/**
 * Zaniklé cílové vsi zpráv `outbox`, na kterých záleží (dotazy a výsledky s lidmi nebo mincemi):
 * ves chybí, spí (`asleep` v otisku – vymřela, opuštěná), nebo má sídlo v archivu (Začít znovu –
 * `archivedOf`; archivovanou ves nikdo nedopočítá, jako zaniklého hostitele v kroku 3).
 */
async function goneTargets(
  deps: VillageMailDeps,
  outbox: readonly VillageMail[],
  stamps: readonly VillageStamp[],
): Promise<Set<string>> {
  const wanted = new Set(outbox.filter((m) => isQuery(m) || mustReturn(m)).map((m) => m.villageId));
  if (wanted.size === 0) return new Set();
  const stampOf = new Map(stamps.map((s) => [s.id, s]));
  const gone = new Set([...wanted].filter((id) => stampOf.get(id)?.asleep ?? true));
  const alive = [...wanted].filter((id) => !gone.has(id));
  if (alive.length > 0) for (const id of await deps.villages.archivedOf(alive)) gone.add(id);
  return gone;
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
 * 1. Každou zprávu `outbox` zapíše do schránky cílové vsi, kromě (markets.md – Rozhodnutí plánu 3,
 *    bod 13):
 *    - cílová ves neexistuje (`post` by na neznámé vsi spadl): příjezd se změní ve výsledek
 *      `returned` se vším, co výprava vezla, do schránky vsi v den plánovaného návratu (lidé jsou
 *      doma v plánovaný den); výsledek bez lidí a mincí a ostatní zprávy se zahodí;
 *    - výsledek s lidmi (`people`, `newcomers`) nebo mincemi (`unsold.coins` – Rozhodnutí plánu 4,
 *      bod 9) pro domovskou ves, která chybí, spí nebo má sídlo v archivu (`goneTargets`): lidé
 *      a mince jdou zpět do schránky této vsi – hostitele (`stranded-people`, `strandedMail`),
 *      zboží se zahodí; spí-li i hostitel, zahodí se celý – obě vsi jsou pryč (hostitele v archivu
 *      krok nezkoumá: zpráva padne do schránky, kterou nikdo nepoužije – ztráta je táž); výsledek,
 *      který domovská ves už použila (výprava není v jejím stavu – opakované doručení po pádu), se
 *      zahodí;
 *    - dotaz a ohlášení bez nákladu (`kin-ask`, `smith-ask`, `order-ready`) do zaniklé vsi se
 *      zahodí – nikdo nikam nejde.
 *    Příjezd do spící vsi nebo do vsi se sídlem v archivu se zapíše jako dřív – vrátí ho krok 3.
 * 2. Zapsané a zahozené smaže z `outbox` (verzovaný zápis, při souběhu znovu, nejvýš
 *    `MAIL_ATTEMPTS`); prázdný `outbox` se ze stavu smaže celý.
 * 3. Výpravy po termínu (`overdueTrips`): výsledek v odchozí schránce hostitele zapíše; hostitel
 *    pryč (vymřel, opuštěn, sídlo v archivu, ves chybí) – nepoužitý příjezd (ve schránce
 *    hostitele; chybí-li hostitel, v odchozí schránce vsi) se vrátí se vším, výprava na trhu
 *    hostitele s tím, co drží (`returned`, den `lastDay + 1`); živý hostitel pozadu znamená čekat.
 *    Spící domovská ves krok přeskočí – nic by nepoužila.
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
    const gone = await goneTargets(deps, outbox, stamps);
    for (const mail of outbox) {
      if (mail.body.kind === 'market-result' && mustReturn(mail) && gone.has(mail.villageId)) {
        // lidé a mince nesmí zmizet – zpět k hostiteli; spí-li i on, jsou obě vsi pryč; výsledek,
        // který domov už použil (opakované doručení po pádu), se nevrací
        const { result } = mail.body;
        const home = known.has(mail.villageId) ? await deps.villages.find(mail.villageId) : null;
        const used = home !== null && awaitedTrip(home.state, result.key) === null;
        const back = strandedMail(villageId, mail.ref, mail.day, result);
        if (!used && !sleeps(village) && (await post(deps, back))) written++;
      } else if (!known.has(mail.villageId)) {
        if (mail.body.kind === 'market-arrive') {
          const { arrival } = mail.body;
          // hostitel zmizel – výprava se vrátí se vším v den plánovaného návratu
          const returnDay = mail.day + arrival.stayDays + arrival.travelDays;
          const result = marketResult(arrival, { returned: true });
          if (await post(deps, resultMail(villageId, returnDay, result))) written++;
        }
        // výsledek bez lidí a mincí a ostatní zprávy do zmizelé vsi se zahodí
      } else if (!(isQuery(mail) && gone.has(mail.villageId))) {
        if (await post(deps, mail)) written++;
      }
    }
    const saved = await dropDelivered(deps, villageId, outbox);
    if (!saved) return written; // ves mezitím zmizela
    village = saved;
  }
  // spící ves už nic nepoužije (výsledek vrátí živý hostitel v kroku 1) – z příjezdu, který zaniklý
  // hostitel dávno použil, by se jí mince složily podruhé
  if (sleeps(village)) return written;
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

/**
 * Úloha světa (worker 1× za minutu – `runWorldTasks`; markets.md – Rozhodnutí plánu 3, bod 13,
 * a plánu 4, bod 9): výsledek s lidmi nebo mincemi došel do schránky domovské vsi a ta pak zanikla
 * (vymřela, je opuštěná, sídlo v archivu) dřív, než ho použila – lidé a mince jdou zpět k hostiteli
 * jako `stranded-people` (`strandedMail` – tentýž `ref` jako v kroku 1 pošty, druhý zápis se
 * zahodí). Nepoužitý výsledek = výprava je ještě ve stavu vsi (`awaitedTrip`), hostitel je její cíl;
 * den zprávy = den výsledku. Zanikl-li i hostitel (spí, chybí, sídlo v archivu), lidé a mince se
 * ztratí – jediná přijatá ztráta, oba konce jsou mrtvé. Zboží výsledku se zahodí jako v kroku 1.
 * Vyřízené výsledky (vrácené, použité i ztracené) se ze schránky zaniklé vsi smažou
 * (`dropStranded`) až po zápisu zpráv – pád mezi tím znamená příště týž `ref`. Vrací počet zapsaných
 * zpráv.
 */
export async function returnStrandedPeople(deps: VillageMailDeps): Promise<number> {
  let written = 0;
  const done: string[] = [];
  for (const event of await deps.villages.inbox.strandedResults()) {
    if (event.body.kind !== 'market-result') continue;
    const { result } = event.body;
    const home = await deps.villages.find(event.villageId);
    const trip = home && awaitedTrip(home.state, result.key);
    if (trip) {
      const host = await deps.villages.find(trip.villageId);
      const alive = !sleeps(host) && (await placeOf(deps, host!)) !== null;
      const back = strandedMail(trip.villageId, marketResultRef(result.key), event.day, result);
      if (alive && (await post(deps, back))) written++;
    }
    done.push(event.id);
  }
  if (done.length > 0) await deps.villages.inbox.dropStranded(done);
  return written;
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
