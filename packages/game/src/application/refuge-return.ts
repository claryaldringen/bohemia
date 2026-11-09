import { TOTAL_GAME_DAYS, type WorldClock } from '../domain/calendar';
import { cloneState } from '../domain/village/clone';
import { clearRefugeLeaving, departRefuge, refugeLeavingOf } from '../domain/village/refugees';
import type { VillageEventBody } from '../domain/village/inbox';
import type { HerdSpecies, RefugeLeaving } from '../domain/village/types';
import {
  armyApproaching,
  armyOnCell,
  refugeReturnDays,
  stewardMayReturn,
} from '../domain/war/refuge-return';
import type { CampaignRepository } from './campaigns';
import { settlementLandscape } from './enter-game';
import type { PlayerLock } from './locks';
import { ACTION_RIGHTS, requireRight, type RightsDeps } from './rights';
import type { LandscapeSource } from './settlements';
import { settlementCell } from './shipments';
import type { StewardshipRepository } from './stewardships';
import { updateVillage } from './update-village';
import type { Pause, VillageRecord } from './villages';

// Návrat uprchlíků domů (war.md – Varování, poslové a útěk do hradiště: „domů se vrátí, až vojsko
// odtáhne z jejich mapy – rozhodne hráč, za nepřítomného správce“; plán 2026-11-09 – Úloha 10,
// Otevřené 11). Use-case mimo tažení – tažení už může být skončené. Z lesa se lidé vrátí týž den
// (ukryté si ves vrátí sama – tělo nese 0), z hradiště za odhad cesty: pod zámkem držitele hradiště
// odejdou hosté a pobyt (`departRefuge` – zbytek zásob a stádo jdou do záznamu `refugeLeaving`),
// pak událost `refuge-back` domů a záznam zmizí. Pád mezi uložením hradiště a zápisem události –
// opakování (hráč, nebo úloha světa) dopíše událost ze záznamu.

/** Důvody odmítnutí (návrh Clauda) – jediné místo textů. */
export const REFUGE_RETURN_REASONS = {
  none: 'Ves nikoho neodvedla.',
  notArrived: 'Lidé ještě nedorazili.',
  army: 'Vojsko je ještě na mapě.',
  returning: 'Lidé se už vracejí.',
} as const;

/** Ves, jejíž lidé jsou na útěku (`VillageState.refuge`); hradiště null – les. */
export interface RefugeAway {
  villageId: string;
  refId: string;
  hostVillageId: string | null;
}

/** Port – vsi na útěku (úloha světa: správce je vrací, obnova po pádu). */
export interface RefugeRepository {
  /** Nespící vsi s `refuge` ve stavu, podle id. */
  awayVillages(): Promise<RefugeAway[]>;
}

export interface RefugeReturnDeps extends RightsDeps {
  campaigns: Pick<CampaignRepository, 'activeAlarming' | 'checkpoint'>;
  /** Zámek držitele hradiště – změna jeho vsi; volající zámek hráče nedrží. */
  locks: PlayerLock;
  landscapes?: LandscapeSource;
  /** Hodiny světa – takty herního dne v odhadu cesty. */
  world: WorldClock;
  pause?: Pause;
}

export type ReturnFromRefugeResult =
  { ok: true; arrivesDay: number } | { ok: false; reason: string };

const NO_HERD: Record<HerdSpecies, number> = { sheep: 0, goat: 0, pig: 0, cow: 0 };
/** Střed mapy – odhad cesty mezi vsemi vzdušnou čarou (návrh Clauda). */
const CENTER = { x: 0, z: 0 };

/**
 * Hráč vrátí uprchlíky vsi `villageId` domů (tlačítko **Vrátit se**): právo `war` (správce cizí vsi
 * ho nemá), ves má `refuge`, skupina dorazila (ukrytá v lese, nebo pobyt u hradiště) a vojsko
 * žádného tažení, které ves varuje nebo cílí (`activeAlarming`), na mapě vsi nestojí. Vrací den
 * příchodu domů; opakování (dvojklik, po pádu) vrátí týž den a druhou událost nezapíše.
 */
export async function returnFromRefuge(
  deps: RefugeReturnDeps,
  input: { playerId: string; villageId: string; today: number },
): Promise<ReturnFromRefugeResult> {
  // obrana je válka – jen držitel vsi (tlačítko Vrátit se – akce webu `returnFromRefuge`)
  const found = await requireRight(deps, { ...input, right: ACTION_RIGHTS.returnFromRefuge });
  if (typeof found === 'string') return { ok: false, reason: found };
  return returnRefugees(deps, { villageId: found.village.id, today: input.today, steward: false });
}

/**
 * Návrat bez ověření práva – hráčův (`returnFromRefuge`) i správcův (`returnStewardRefugees`,
 * kronika „Správce vrátil lidi domů.“).
 */
async function returnRefugees(
  deps: RefugeReturnDeps,
  input: { villageId: string; today: number; steward: boolean },
): Promise<ReturnFromRefugeResult> {
  const home = await deps.villages.find(input.villageId);
  const refuge = home?.state.refuge;
  if (!home || !refuge) return { ok: false, reason: REFUGE_RETURN_REASONS.none };
  // rozhodnuto dřív – událost už je ve schránce, nebo ji hradiště drží po pádu
  const pending = await pendingReturn(deps, home, refuge.refId);
  if (pending !== null) return { ok: true, arrivesDay: pending };
  const hostId = refuge.hostVillageId;
  const host = hostId === undefined ? null : await deps.villages.find(hostId);
  const leaving = host ? refugeLeavingOf(host.state, refuge.refId) : null;
  if (!leaving) {
    const settlement = await deps.settlements.find(home.settlementId);
    const cell = settlement ? settlementCell(settlement) : null;
    if (cell && (await threatOf(deps, home.id, cell)).onMap) {
      return { ok: false, reason: REFUGE_RETURN_REASONS.army };
    }
  }
  const back = {
    kind: 'refuge-back' as const,
    refId: refuge.refId,
    ...(input.steward ? { steward: true as const } : {}),
  };
  if (hostId === undefined) {
    // les: ukryté zásoby a stádo si ves vrátí sama (`applyRefugeBack`)
    if (!refuge.hidden) return { ok: false, reason: REFUGE_RETURN_REASONS.notArrived };
    const day = await postBack(deps, home.id, input.today, refuge.refId, {
      ...back,
      foodKg: 0,
      herd: { ...NO_HERD },
    });
    return { ok: true, arrivesDay: day };
  }
  const hostSettlement = host ? await deps.settlements.find(host.settlementId) : null;
  if (!host || !hostSettlement) {
    // hradiště zaniklo i se sídlem – lidé se vrátí s prázdnou (návrh Clauda; jinak by zůstali pryč)
    const day = await postBack(deps, home.id, input.today, refuge.refId, {
      ...back,
      foodKg: 0,
      herd: { ...NO_HERD },
    });
    return { ok: true, arrivesDay: day };
  }
  const homeSettlement = await deps.settlements.find(home.settlementId);
  const homePlace = {
    cell: homeSettlement ? settlementCell(homeSettlement) : settlementCell(hostSettlement),
    pos: CENTER,
  };
  const hostPlace = { cell: settlementCell(hostSettlement), pos: CENTER };
  const landscape = settlementLandscape(hostSettlement, deps.landscapes);
  return deps.locks.run(hostSettlement.ownerId, async () => {
    // zapisuje ho změna vsi (callback) – v krabičce, ať ho TypeScript nezúží na null
    const box: { left: RefugeLeaving | null } = { left: null };
    const result = await updateVillage(
      deps.villages,
      host.id,
      input.today,
      landscape,
      (state) => {
        box.left = refugeLeavingOf(state, refuge.refId);
        if (box.left) return { ok: true, state };
        const stay = state.refugeStays?.find((s) => s.refId === refuge.refId);
        if (!stay) return { ok: false, reason: REFUGE_RETURN_REASONS.notArrived };
        const days = refugeReturnDays(hostPlace, homePlace, stay.herd, input.today, deps.world);
        const next = cloneState(state);
        box.left = departRefuge(next, refuge.refId, home.id, input.today + days);
        return { ok: true, state: next };
      },
      deps.pause,
    );
    if (!result.ok) {
      // souběžný návrat (hráč a úloha světa) prošel napřed – pobyt už zmizel, událost čeká
      const fresh = await deps.villages.find(home.id);
      const done = fresh ? await pendingReturn(deps, fresh, refuge.refId) : null;
      return done === null ? result : { ok: true, arrivesDay: done };
    }
    const leaving = box.left;
    if (!leaving) return { ok: false, reason: REFUGE_RETURN_REASONS.notArrived };
    const day = await postBack(deps, home.id, leaving.arrivesDay, refuge.refId, {
      ...back,
      foodKg: leaving.foodKg,
      herd: { ...leaving.herd },
    });
    await updateVillage(
      deps.villages,
      host.id,
      input.today,
      landscape,
      (state) => {
        const next = cloneState(state);
        return { ok: true, state: clearRefugeLeaving(next, refuge.refId) ? next : state };
      },
      deps.pause,
    );
    return { ok: true, arrivesDay: day };
  });
}

/** Zapíše `refuge-back` domů (`ref` = `refuge-back:<refId>`); už zapsaná – den té události. */
async function postBack(
  deps: RefugeReturnDeps,
  homeId: string,
  day: number,
  refId: string,
  body: Extract<VillageEventBody, { kind: 'refuge-back' }>,
): Promise<number> {
  const posted = await deps.villages.inbox.post({
    villageId: homeId,
    day,
    ref: `refuge-back:${refId}`,
    body,
  });
  if (posted) return posted.day;
  const home = await deps.villages.find(homeId);
  return (home ? await pendingReturn(deps, home, refId) : null) ?? day;
}

/** Den nespotřebované události návratu skupiny `refId` ve schránce domova; žádná – null. */
async function pendingReturn(
  deps: Pick<RefugeReturnDeps, 'villages'>,
  home: VillageRecord,
  refId: string,
): Promise<number | null> {
  const events = await deps.villages.inbox.pending(home.id, home.state.lastDay, TOTAL_GAME_DAYS);
  const back = events.find((e) => e.body.kind === 'refuge-back' && e.body.refId === refId);
  return back ? back.day : null;
}

/** Vojsko tažení, která ves varují nebo cílí: stojí na mapě vsi, nebo na ves teprve jde? */
async function threatOf(
  deps: Pick<RefugeReturnDeps, 'campaigns'>,
  villageId: string,
  cell: { x: number; y: number },
): Promise<{ onMap: boolean; approaching: boolean }> {
  let onMap = false;
  let approaching = false;
  for (const id of await deps.campaigns.activeAlarming(villageId)) {
    const s = (await deps.campaigns.checkpoint(id))?.state;
    if (!s) continue;
    onMap ||= armyOnCell(s, cell);
    approaching ||= armyApproaching(s, villageId);
  }
  return { onMap, approaching };
}

/** Tlačítko **Vrátit se** v pohledu na varování (Úloha 12). */
export interface RefugeReturnState {
  /** Proč návrat teď nejde (`REFUGE_RETURN_REASONS`); null – jde. */
  blocked: string | null;
  /** Lidé už jdou domů – den příchodu (návrat je rozhodnutý). */
  arrivesDay?: number;
}

/**
 * Jde návrat vsi `home` (stejné podmínky jako `returnFromRefuge`, bez práva – to ukáže rozhraní)?
 * Ves bez `refuge` null. Rozhodnutý návrat (událost ve schránce) – „Lidé se už vracejí.“ s dnem
 * příchodu; po pádu rozdělaný návrat (záznam u hradiště) jde vždy.
 */
export async function refugeReturnState(
  deps: Pick<RefugeReturnDeps, 'villages' | 'settlements' | 'campaigns'>,
  home: VillageRecord,
): Promise<RefugeReturnState | null> {
  const refuge = home.state.refuge;
  if (!refuge) return null;
  const pending = await pendingReturn(deps, home, refuge.refId);
  if (pending !== null) return { blocked: REFUGE_RETURN_REASONS.returning, arrivesDay: pending };
  const hostId = refuge.hostVillageId;
  const host = hostId === undefined ? null : await deps.villages.find(hostId);
  if (host && refugeLeavingOf(host.state, refuge.refId)) return { blocked: null };
  const settlement = await deps.settlements.find(home.settlementId);
  const cell = settlement ? settlementCell(settlement) : null;
  if (cell && (await threatOf(deps, home.id, cell)).onMap) {
    return { blocked: REFUGE_RETURN_REASONS.army };
  }
  if (hostId === undefined) {
    return { blocked: refuge.hidden ? null : REFUGE_RETURN_REASONS.notArrived };
  }
  // hradiště zaniklo – lidé se vrátí s prázdnou (jako `returnRefugees`)
  if (!host) return { blocked: null };
  const arrived = host.state.refugeStays?.some((s) => s.refId === refuge.refId) === true;
  return { blocked: arrived ? null : REFUGE_RETURN_REASONS.notArrived };
}

export interface StewardRefugeDeps extends RefugeReturnDeps {
  refugees: RefugeRepository;
  stewardships: Pick<StewardshipRepository, 'of'>;
}

/**
 * Úloha světa (worker 1× za minutu – `runWorldTasks`): správce (`steward.on`) a NPC rod vrátí
 * uprchlíky domů den po posledním dni nájezdu, když vojsko na mapě nestojí ani na ves teprve nejde
 * (`stewardMayReturn`); hráčovu ves bez správce nechá na hráči. Každé vsi na útěku navíc dopíše
 * událost návratu, který se po pádu nezapsal (záznam `refugeLeaving` u hradiště). Vrací, kolik vsí
 * se vrací.
 */
export async function returnStewardRefugees(
  deps: StewardRefugeDeps,
  input: { today: number },
): Promise<number> {
  let returned = 0;
  for (const away of await deps.refugees.awayVillages()) {
    const home = await deps.villages.find(away.villageId);
    const refuge = home?.state.refuge;
    if (!home || !refuge || refuge.refId !== away.refId) continue;
    const npc = (await deps.stewardships.of(home.id))?.kind === 'npc';
    if (!npc && home.state.steward?.on !== true) {
      // hráč rozhoduje sám – jen obnova návratu po pádu
      const host = away.hostVillageId ? await deps.villages.find(away.hostVillageId) : null;
      if (host && refugeLeavingOf(host.state, away.refId)) {
        await returnRefugees(deps, { villageId: home.id, today: input.today, steward: false });
      }
      continue;
    }
    if ((await pendingReturn(deps, home, refuge.refId)) !== null) continue;
    const settlement = await deps.settlements.find(home.settlementId);
    const threat = settlement
      ? await threatOf(deps, home.id, settlementCell(settlement))
      : { onMap: false, approaching: false };
    const may = stewardMayReturn({
      departedDay: refuge.departedDay,
      ...(home.state.raidDay !== undefined ? { raidDay: home.state.raidDay } : {}),
      today: input.today,
      armyOnMap: threat.onMap,
      approaching: threat.approaching,
    });
    if (!may) continue;
    const result = await returnRefugees(deps, {
      villageId: home.id,
      today: input.today,
      steward: true,
    });
    if (result.ok) returned++;
  }
  return returned;
}
