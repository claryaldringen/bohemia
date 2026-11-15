import { cellDistance } from '../domain/world/placement';
import {
  APPOINT_LORD,
  appointCandidate,
  departAppointee,
  familyAway,
  holderStamp,
  isVillageAbandoned,
  isVillageExtinct,
  withAwaitingLord,
  type AppointeeParty,
  type VillageState,
} from '../domain/village';
import type { HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Dosazení vojvody do vsi bez muže rodu (seniorate.md – Ves bez muže rodu – dosazení vojvody):
// ves, která zůstala bez muže rodu (`VillageState.awaitingLord`), dostane nejstaršího vhodného
// muže z jiné vsi rodu. Postup je idempotentní a snese přerušení mezi kroky: 1. cílová ves si
// zapíše, koho čeká (`appointee`), 2. muž s rodinou se spočítá a pošle schránkou cílové vsi na den
// příjezdu (`ref` jedinečný – druhý zápis se zahodí), 3. odejde ze své vsi. Opakované volání
// dokončí, co zbylo, a nic nezdvojí. Bez kandidáta ves čeká a zkusí se při dalším dopočtu.

export interface AppointLordDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  houses: Pick<HouseRepository, 'activeOf'>;
}

/** Kolikrát se zkusí verzovaný zápis vsi při souběžné změně. */
const SAVE_ATTEMPTS = 5;

/** Ves rodu: záznam a poloha jejího sídla na mapě světa (null – sídlo z doby před mřížkou). */
interface RodVillage {
  record: VillageRecord;
  cell: { x: number; y: number } | null;
}

/** Ves se nesimuluje – nic neposílá ani nepřijímá. */
function sleeps(state: VillageState): boolean {
  return isVillageExtinct(state) || isVillageAbandoned(state);
}

/**
 * Pošle vojvody do vsí hráče, které čekají (`awaitingLord`) a nemají vyslance. Vrací, kolik vojvodů
 * nově vyrazilo. Volající drží zámek hráče.
 */
export async function appointLords(
  deps: AppointLordDeps,
  input: { playerId: string; today: number },
): Promise<number> {
  const house = await deps.houses.activeOf(input.playerId);
  const exclude = house?.lord ? [house.lord] : [];
  const rod = await loadRod(deps, input.playerId);
  let sent = 0;
  for (const target of rod) {
    const state = target.record.state;
    if (sleeps(state) || state.journey !== undefined) continue;
    const waiting = withAwaitingLord(state).awaitingLord;
    if (!waiting) continue;
    if (waiting.appointee) {
      // vyslanec ze vsi, která rodu hráče nepatří (ves mezitím přešla – vzdání, postoupení): z cizí
      // vsi nikoho neposílat a nezapisovat do ní; ves vyslance zapomene a vybere si nového
      if (rod.some((v) => v.record.id === waiting.appointee!.fromVillageId)) {
        await finishDeparture(deps, target, waiting.appointee.personId);
      } else {
        await forgetAppointee(deps, target.record.id, waiting.appointee.fromVillageId);
      }
      continue;
    }
    // vsi, odkud už někdo vyrazil v tomto průchodu, kandidát nemění (stavy se čtou znovu)
    const fresh = await loadRod(deps, input.playerId);
    const candidate = appointCandidate(
      fresh.map((v) => ({ villageId: v.record.id, state: v.record.state })),
      target.record.id,
      input.today,
      exclude,
    );
    if (!candidate) continue;
    const from = fresh.find((v) => v.record.id === candidate.villageId);
    if (!from) continue;
    const days = APPOINT_LORD.daysPerMapStep * distance(target, from);
    const claimed = await claim(deps, target.record.id, {
      fromVillageId: candidate.villageId,
      personId: candidate.personId,
      arrivesDay: input.today + days,
    });
    if (!claimed) continue;
    sent += 1;
    await finishDeparture(deps, { ...target, record: claimed }, candidate.personId);
  }
  return sent;
}

/** Vzdálenost sídel vsí v mapách (nejméně 1; sídlo bez polohy – 1). */
function distance(a: RodVillage, b: RodVillage): number {
  if (!a.cell || !b.cell) return 1;
  return Math.max(1, cellDistance(a.cell, b.cell));
}

/** Všechny vsi hráče s polohou jejich sídel (pořadí sídel a vsí v nich). */
async function loadRod(deps: AppointLordDeps, playerId: string): Promise<RodVillage[]> {
  const out: RodVillage[] = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const record of await deps.villages.listBySettlement(settlement.id)) {
      out.push({ record, cell: settlement.worldCell });
    }
  }
  return out;
}

/**
 * Zapíše do cílové vsi, koho čeká (i čekání starší vsi). Vrací uloženou ves, nebo null – ves se
 * mezitím změnila tak, že vyslanec už nepatří (už ho má, nečeká); souběžný zápis se zopakuje.
 */
async function claim(
  deps: AppointLordDeps,
  villageId: string,
  appointee: NonNullable<VillageState['awaitingLord']>['appointee'],
): Promise<VillageRecord | null> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(villageId);
    if (!current) return null;
    const waiting = withAwaitingLord(current.state).awaitingLord;
    if (!waiting || waiting.appointee || !appointee) return null;
    const next: VillageState = { ...current.state, awaitingLord: { ...waiting, appointee } };
    const saved = await deps.villages.save(villageId, next, current.version);
    if (saved) return saved;
  }
  return null;
}

/**
 * Ves zapomene vyslance ze vsi `fromVillageId`, která rodu hráče nepatří (`awaitingLord` čeká dál
 * bez `appointee`); při dalším průchodu dostane kandidáta z rodu hráče. Verzovaný zápis.
 */
async function forgetAppointee(
  deps: AppointLordDeps,
  villageId: string,
  fromVillageId: string,
): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(villageId);
    const waiting = current?.state.awaitingLord;
    if (!current || waiting?.appointee?.fromVillageId !== fromVillageId) return;
    const rest = { ...waiting };
    delete rest.appointee;
    const next: VillageState = { ...current.state, awaitingLord: rest };
    if (await deps.villages.save(villageId, next, current.version)) return;
  }
}

/**
 * Druhá a třetí část: muž (je-li ještě ve své vsi) s rodinou vyrazí – družina se pošle schránkou
 * cílové vsi na den příjezdu a muž odejde z domova. Když už ve své vsi není, je hotovo.
 */
async function finishDeparture(
  deps: AppointLordDeps,
  target: RodVillage,
  personId: number,
): Promise<void> {
  const appointee = target.record.state.awaitingLord?.appointee;
  if (!appointee) return;
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const source = await deps.villages.find(appointee.fromVillageId);
    if (!source || !source.state.people.some((p) => p.id === personId)) return;
    // muž nebo jeho rodina je pryč (výprava…) – odchod počká na další průchod, až budou doma
    if (familyAway(source.state, personId, source.state.lastDay)) return;
    const departure = departAppointee(
      source.state,
      source.state.lastDay,
      personId,
      target.record.name,
    );
    await post(deps, target.record, appointee, departure.party);
    if (await deps.villages.save(source.id, departure.state, source.version)) return;
  }
}

/** Pošle družinu do schránky cílové vsi na den příjezdu (jedinečný `ref` – opakování nic nezdvojí). */
async function post(
  deps: AppointLordDeps,
  target: VillageRecord,
  appointee: { fromVillageId: string; arrivesDay: number },
  party: AppointeeParty,
): Promise<void> {
  const since = target.state.awaitingLord?.sinceDay ?? 0;
  await deps.villages.inbox.post({
    villageId: target.id,
    day: appointee.arrivesDay,
    ref: `appoint:${target.id}:${since}`,
    body: {
      kind: 'lord-arrives',
      party,
      fromVillageId: appointee.fromVillageId,
      ...holderStamp(target.state),
    },
  });
}
