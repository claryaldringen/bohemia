import type { WorldClock } from '../domain/calendar';
import { isVillageAsleep, type VillageState, type VillageSurrender } from '../domain/village';
import { shipmentDays } from '../domain/vassalage';
import { surrenderVillage } from '../domain/vassalage/escheat';
import type { CampaignState, IntentBody } from '../domain/war';
import { cellDistance } from '../domain/world/placement';
import { queueIntentPastPoint, type CampaignRepository } from './campaigns';
import { settlementLandscape } from './enter-game';
import type { HouseRepository } from './houses';
import type { NoticeRepository } from './notices';
import { sendGuardsHome } from './protection';
import { departFromHost } from './refuge-return';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';
import { updateVillage } from './update-village';
import type { Pause, VillageRecord, VillageRepository } from './villages';

// Začít znovu obránce (war.md – Začít znovu během nájezdu; Martin 14. 11. 2026: „Pokud to udělá
// hráč obránce, tak se vesnice automaticky vzdá a je považována za dobytou“, „Pokud se ves vzdá,
// připadne mu celá“). Ves pod běžícím nájezdem se před archivem vzdá: celá mapa přejde na vůdce
// nájezdu se vším, co na ní je, rod obránce ji už nevede (lidé zůstanou jako obyčejní obyvatelé)
// a řídí ji správce nového držitele – jako ves z odúmrti (`escheatVillage`). Nájezdy se obrátí
// domů a vůdce dostane upozornění.

export interface SurrenderDeps {
  settlements: Pick<SettlementRepository, 'find' | 'transferHolder'>;
  villages: VillageRepository;
  landscapes?: LandscapeSource;
  pause?: Pause;
  /** Živý rod vůdce – nájezd starého vojska (vůdce dal Začít znovu) ves nedostane. */
  houses: Pick<HouseRepository, 'activeOf'>;
  campaigns: Pick<CampaignRepository, 'activeAgainst' | 'checkpoint' | 'addIntent'>;
  /** Upozornění vůdci; bez něj se nepošle (testy bez upozornění). */
  notices?: Pick<NoticeRepository, 'post'>;
  /** Hodiny světa – takt záměru obratu. */
  world: WorldClock;
}

/** Mapa, která se vzdala: komu připadla a její vsi (2. krok převodu – `finishCeded`). */
export interface SurrenderedMap {
  settlementId: string;
  toPlayerId: string;
  villageIds: string[];
}

/** Obrat domů ze Začít znovu obránce – záměr obránce (`isSurrenderIntent`). */
const SURRENDER_TURN_BACK: IntentBody = { kind: 'turn-back', restart: true, surrender: true };

/** Nájezd ještě běží – sbírá se, táhne, nebo bojuje; na zpáteční cestě už skončil. */
const RAIDING: ReadonlySet<CampaignState['phase']> = new Set(['assembling', 'marching', 'raiding']);

/** Klíč upozornění „ves se vzdala“ – vítězný nájezd a ves (opakování ho nezdvojí). */
export function surrenderNoticeRef(campaignId: string, villageId: string): string {
  return `restart-surrender:${campaignId}:${villageId}`;
}

/** Komu mapa připadne: vůdce vítězného nájezdu, rod, kterým ho vede, a nájezd. */
interface Winner {
  campaignId: string;
  playerId: string;
  houseId?: string;
}

/** Mapa obránce pod nájezdem: nájezdy na její vsi a ten, jehož vůdce ji dostane. */
interface SurrenderPlan {
  settlement: Settlement;
  /** Vsi mapy, které nespí (i putující) – vzdají se. */
  living: VillageRecord[];
  villageIds: string[];
  raids: CampaignState[];
  winner: Winner;
}

/**
 * Vsi hráče `playerId` pod běžícím nájezdem se vzdají – volá `restartGame` před archivem, pod
 * zámkem hráče (`settlements`, `villages` – jeho aktivní sídla a vsi dopočítané do dneška).
 *
 * - Nájezd na ves je běžící tažení s cílem ve vsi (`activeAgainst`) ve fázi sbírání, pochodu nebo
 *   boje – nebo takové, kterému ves vzdal tentýž hráč (`yielded.byPlayer` – opakování po pádu),
 *   a jen s živým rodem vůdce (staré vojsko po Začít znovu útočníka ne).
 * - Mapu dostane vůdce nejstaršího nájezdu (pořadí `activeAgainst` – založení, při shodě menší id;
 *   víc vsí na mapě – první ves mapy v pořadí `villages`). Nese-li ves značku vzdání téhož hráče
 *   (`VillageState.surrender` – opakovaný restart po pádu), dostane ji vítěz ze značky, i když
 *   nájezd mezitím skončil; vítěz bez živého rodu ji nedostane (archiv). Mapa bez živé vsi se
 *   nevzdává (archiv).
 * - Kroky: značka vzdání ve vsích mapy → záměr obránce `turn-back` se `surrender` všem nájezdům
 *   na vsi mapy → hosté vázaní na obránce odejdou (`guestsLeave`) a uprchlíci vsi z hradiště
 *   jiné vsi obránce, která jde do archivu, domů (`refugeesHome`) → 1. krok převodu
 *   (`transferHolder`; neuspěje-li, mapa se nevzdala) → rod obránce ves nevede (`surrenderVillage`
 *   – lidé rodu zůstanou jako obyčejní, vojvoda není, správce zapnutý) → upozornění vůdci
 *   `village-surrendered` (klíč `surrenderNoticeRef`).
 * - Převezme ho vůdce pod svým zámkem (`finishCeded` po zámku obránce, jinak worker –
 *   `acceptHolderTransfers`); převzetí dokončí vzdání i po pádu po převodu a vsi pro rod, který
 *   mezitím skončil, archivuje.
 *
 * Opakování po pádu nic nezdvojí (značka, záměr nájezdu, kterému se ves už vzdala, se nepíše,
 * události a upozornění mají klíč). Vrací vzdané mapy.
 */
export async function surrenderRaidedVillages(
  deps: SurrenderDeps,
  input: {
    playerId: string;
    today: number;
    nowMs: number;
    settlements: readonly Settlement[];
    villages: readonly VillageRecord[];
  },
): Promise<SurrenderedMap[]> {
  const plans: SurrenderPlan[] = [];
  for (const settlement of input.settlements) {
    const villages = input.villages.filter((v) => v.settlementId === settlement.id);
    // mapa bez živé vsi se nevzdává – jde do archivu jako dřív (návrh Clauda)
    const living = villages.filter((v) => !isVillageAsleep(v.state));
    if (living.length === 0) continue;
    const raids: CampaignState[] = [];
    for (const village of villages) {
      for (const id of await deps.campaigns.activeAgainst(village.id)) {
        const state = (await deps.campaigns.checkpoint(id))?.state;
        if (!state || state.playerId === input.playerId) continue;
        if (RAIDING.has(state.phase) || state.yielded?.byPlayer === input.playerId) {
          raids.push(state);
        }
      }
    }
    const winner = await winnerOf(deps, input.playerId, living, raids);
    if (winner) {
      plans.push({ settlement, living, villageIds: villages.map((v) => v.id), raids, winner });
    }
  }
  const leaving = new Set(plans.map((p) => p.settlement.id));
  const out: SurrenderedMap[] = [];
  for (const plan of plans) {
    if (!(await surrenderMap(deps, input, plan, leaving))) continue;
    out.push({
      settlementId: plan.settlement.id,
      toPlayerId: plan.winner.playerId,
      villageIds: plan.villageIds,
    });
  }
  return out;
}

/**
 * Komu mapa připadne: vítěz ze značky vzdání téhož hráče (opakovaný restart), jinak první nájezd,
 * jehož vůdce má živý rod, kterým tažení vede. Vůdce bez něj (dal Začít znovu) mapu nedostane.
 */
async function winnerOf(
  deps: Pick<SurrenderDeps, 'houses'>,
  playerId: string,
  living: readonly VillageRecord[],
  raids: readonly CampaignState[],
): Promise<Winner | null> {
  const mark = living.map((v) => v.state.surrender).find((m) => m?.byPlayer === playerId);
  const candidates: Winner[] = mark
    ? [{ campaignId: mark.campaignId, playerId: mark.toPlayerId, houseId: mark.houseId }]
    : raids.map((r) => ({ campaignId: r.id, playerId: r.playerId, houseId: r.houseId }));
  for (const candidate of candidates) {
    const house = await deps.houses.activeOf(candidate.playerId);
    if (house && (candidate.houseId === undefined || candidate.houseId === house.id)) {
      return candidate;
    }
  }
  return null;
}

/** Značka vzdání ve vsi – stejná (týž hráč a nájezd) se nepřepíše. */
function withMark(state: VillageState, mark: VillageSurrender): VillageState {
  const had = state.surrender;
  if (had?.byPlayer === mark.byPlayer && had.campaignId === mark.campaignId) return state;
  return { ...state, surrender: mark };
}

/** Jedna mapa se vzdá – kroky v pořadí (viz `surrenderRaidedVillages`); true – převod proběhl. */
async function surrenderMap(
  deps: SurrenderDeps,
  input: {
    playerId: string;
    today: number;
    nowMs: number;
    settlements: readonly Settlement[];
    villages: readonly VillageRecord[];
  },
  plan: SurrenderPlan,
  leaving: ReadonlySet<string>,
): Promise<boolean> {
  const { settlement, winner } = plan;
  const landscape = settlementLandscape(settlement, deps.landscapes);
  const mark: VillageSurrender = {
    byPlayer: input.playerId,
    toPlayerId: winner.playerId,
    ...(winner.houseId === undefined ? {} : { houseId: winner.houseId }),
    campaignId: winner.campaignId,
    day: input.today,
  };
  const marked: VillageRecord[] = [];
  for (const village of plan.living) {
    const result = await updateVillage(
      deps.villages,
      village.id,
      input.today,
      landscape,
      (state) => ({ ok: true, state: withMark(state, mark) }),
      deps.pause,
    );
    marked.push(result.ok ? result.village : village);
  }
  for (const raid of plan.raids) {
    if (raid.yielded?.byPlayer === input.playerId) continue;
    await queueIntentPastPoint(deps, {
      campaignId: raid.id,
      byPlayer: input.playerId,
      body: SURRENDER_TURN_BACK,
      nowMs: input.nowMs,
    });
  }
  for (const village of marked) {
    await guestsLeave(deps, village, settlement, input, leaving);
    await refugeesHome(deps, village, input, leaving);
  }
  // převod před vzdáním a upozorněním – ves nesmí zůstat obránci bez rodu
  if (!(await deps.settlements.transferHolder(settlement.id, input.playerId, winner.playerId))) {
    return false;
  }
  for (const village of marked) {
    await updateVillage(
      deps.villages,
      village.id,
      input.today,
      landscape,
      (state) => ({ ok: true, state: surrenderVillage(state, input.today) }),
      deps.pause,
    );
    await deps.notices?.post({
      playerId: winner.playerId,
      kind: 'village-surrendered',
      payload: { villageId: village.id, name: village.name, campaignId: winner.campaignId },
      gameDay: input.today,
      ref: surrenderNoticeRef(winner.campaignId, village.id),
    });
  }
  return true;
}

/**
 * Hosté vzdané vsi `host` vázaní na obránce odejdou (návrh Clauda): uprchlíci jeho vsí, které jdou
 * do archivu, skončí s ukončenou hrou – pobyt a hosté zmizí a ves je dál nekrmí (`departFromHost`;
 * `refuge-back` do archivované vsi se už nepoužije); muži pána z ochrany jdou domů, dohoda vzdáním
 * skončila (`sendGuardsHome` jako odvolání pánem). Každé jednou – klíče `refuge-back:<ref>`
 * a `restart-guard:<ves>:<domov>`.
 */
async function guestsLeave(
  deps: SurrenderDeps,
  host: VillageRecord,
  hostSettlement: Settlement,
  input: { today: number; villages: readonly VillageRecord[] },
  leaving: ReadonlySet<string>,
): Promise<void> {
  for (const home of input.villages) {
    if (home.state.refuge?.hostVillageId !== host.id || leaving.has(home.settlementId)) continue;
    const fresh = await deps.villages.find(host.id);
    if (!fresh) break;
    await departFromHost(deps, {
      home,
      host: fresh,
      hostSettlement,
      today: input.today,
      steward: true,
    });
  }
  const guards = new Map<string, number[]>();
  for (const guest of host.state.guests ?? []) {
    if (guest.kind !== 'protection') continue;
    guards.set(guest.ref.villageId, [
      ...(guards.get(guest.ref.villageId) ?? []),
      guest.ref.personId,
    ]);
  }
  for (const [homeId, personIds] of guards) {
    const home = await deps.villages.find(homeId);
    const refId = home?.state.people.find((p) => personIds.includes(p.id) && p.away)?.away?.refId;
    if (!home || refId === undefined) continue;
    const place = await deps.settlements.find(home.settlementId);
    const travelDays =
      place?.worldCell && hostSettlement.worldCell
        ? shipmentDays(cellDistance(place.worldCell, hostSettlement.worldCell)).arrive
        : 0;
    await sendGuardsHome(deps, {
      hostId: host.id,
      homeId,
      personIds,
      refId,
      travelDays,
      today: input.today,
      refs: {
        leave: `restart-guard:${host.id}:${homeId}`,
        home: `restart-guard-home:${host.id}:${homeId}`,
      },
    });
  }
}

/**
 * Uprchlíci vsi `home` v hradišti jiné vsi obránce, která jde do archivu, odejdou domů i se
 * zásobami a stádem (zámek držitele hradiště – obránce – drží volající). Hradiště vzdané mapy nebo
 * cizí a les ne – ty vrátí správce (`returnStewardRefugees`), až vojsko odtáhne.
 */
async function refugeesHome(
  deps: SurrenderDeps,
  home: VillageRecord,
  input: { today: number; settlements: readonly Settlement[] },
  leaving: ReadonlySet<string>,
): Promise<void> {
  const hostId = home.state.refuge?.hostVillageId;
  if (hostId === undefined) return;
  const host = await deps.villages.find(hostId);
  const hostSettlement = input.settlements.find((s) => s.id === host?.settlementId);
  if (!host || !hostSettlement || leaving.has(hostSettlement.id)) return;
  await departFromHost(deps, { home, host, hostSettlement, today: input.today, steward: true });
}
