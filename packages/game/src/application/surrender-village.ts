import type { WorldClock } from '../domain/calendar';
import { isVillageDormant } from '../domain/village';
import { escheatVillage } from '../domain/vassalage/escheat';
import type { CampaignState, IntentBody } from '../domain/war';
import { queueIntentPastPoint, type CampaignRepository } from './campaigns';
import { settlementLandscape } from './enter-game';
import type { HouseRepository } from './houses';
import type { NoticeRepository } from './notices';
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

/** Mapa obránce pod nájezdem: nájezdy na její vsi a ten, jehož vůdce ji dostane. */
interface SurrenderPlan {
  settlement: Settlement;
  villages: VillageRecord[];
  raids: CampaignState[];
  winner: CampaignState;
}

/**
 * Vsi hráče `playerId` pod běžícím nájezdem se vzdají – volá `restartGame` před archivem, pod
 * zámkem hráče (`settlements`, `villages` – jeho aktivní sídla a vsi dopočítané do dneška).
 *
 * - Nájezd na ves je běžící tažení s cílem ve vsi (`activeAgainst`) ve fázi sbírání, pochodu nebo
 *   boje – nebo takové, kterému se ves už vzdala (`yielded` – opakování po pádu), a jen s živým
 *   rodem vůdce (staré vojsko po Začít znovu útočníka ne).
 * - Mapu dostane vůdce nejstaršího nájezdu (pořadí `activeAgainst` – založení, při shodě menší id;
 *   víc vsí na mapě – první ves mapy v pořadí `villages`); všechny nájezdy na vsi mapy se obrátí
 *   domů záměrem obránce `turn-back` se `surrender`.
 * - Vůdce dostane upozornění `village-surrendered` (klíč `restart-surrender:<ves>:<den>`).
 * - Rod obránce ves nevede (`escheatVillage` – muži, ženy a dcery rodu zůstanou jako obyčejní
 *   lidé, vojvoda není, správce zapnutý; ves čeká na muže rodu nového držitele).
 * - Uprchlíci vsi v hradišti jiné vsi obránce, která jde do archivu, odejdou domů i se zásobami
 *   (`departFromHost`); z lesa a z cizího hradiště je vrátí správce, až vojsko odtáhne.
 * - Nakonec 1. krok převodu (`transferHolder`) – sídlo už hráči nepatří, `listActive` ho nevrátí,
 *   archiv ho mine. Převezme ho vůdce pod svým zámkem (`finishCeded` po zámku obránce, jinak worker
 *   – `acceptHolderTransfers`).
 *
 * Opakování po pádu: dokud převod neproběhl, udělá vše znovu bez zdvojení (záměr nájezdu, kterému
 * se ves už vzdala, se nepíše; upozornění a návrat mají klíč, převod vsi je idempotentní); po
 * převodu mapu už nevidí. Vrací vzdané mapy.
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
    const raids: CampaignState[] = [];
    for (const village of villages) {
      for (const id of await deps.campaigns.activeAgainst(village.id)) {
        const state = (await deps.campaigns.checkpoint(id))?.state;
        if (!state || state.playerId === input.playerId) continue;
        if (RAIDING.has(state.phase) || state.yielded) raids.push(state);
      }
    }
    const winner = await firstLiving(deps, raids);
    if (winner) plans.push({ settlement, villages, raids, winner });
  }
  const leaving = new Set(plans.map((p) => p.settlement.id));
  const out: SurrenderedMap[] = [];
  for (const plan of plans) {
    await surrenderMap(deps, input, plan, leaving);
    out.push({
      settlementId: plan.settlement.id,
      toPlayerId: plan.winner.playerId,
      villageIds: plan.villages.map((v) => v.id),
    });
  }
  return out;
}

/** První nájezd, jehož vůdce má živý rod, kterým tažení vede (u bodu bez rodu jakýkoli živý). */
async function firstLiving(
  deps: Pick<SurrenderDeps, 'houses'>,
  raids: readonly CampaignState[],
): Promise<CampaignState | null> {
  for (const raid of raids) {
    const house = await deps.houses.activeOf(raid.playerId);
    if (house && (raid.houseId === undefined || raid.houseId === house.id)) return raid;
  }
  return null;
}

/** Jedna mapa se vzdá – kroky v pořadí, převod jako poslední (viz `surrenderRaidedVillages`). */
async function surrenderMap(
  deps: SurrenderDeps,
  input: { playerId: string; today: number; nowMs: number; settlements: readonly Settlement[] },
  plan: SurrenderPlan,
  leaving: ReadonlySet<string>,
): Promise<void> {
  const { settlement, raids, winner } = plan;
  for (const raid of raids) {
    if (raid.yielded) continue;
    await queueIntentPastPoint(deps, {
      campaignId: raid.id,
      byPlayer: input.playerId,
      body: SURRENDER_TURN_BACK,
      nowMs: input.nowMs,
    });
  }
  const living = plan.villages.filter((v) => !isVillageDormant(v.state));
  for (const village of living) {
    await deps.notices?.post({
      playerId: winner.playerId,
      kind: 'village-surrendered',
      payload: { villageId: village.id, name: village.name, campaignId: winner.id },
      gameDay: input.today,
      ref: `restart-surrender:${village.id}:${input.today}`,
    });
  }
  const landscape = settlementLandscape(settlement, deps.landscapes);
  for (const village of living) {
    const result = await updateVillage(
      deps.villages,
      village.id,
      input.today,
      landscape,
      (state) => ({ ok: true, state: escheatVillage(state, input.today) }),
      deps.pause,
    );
    if (result.ok) await refugeesHome(deps, result.village, input, leaving);
  }
  await deps.settlements.transferHolder(settlement.id, input.playerId, winner.playerId);
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
