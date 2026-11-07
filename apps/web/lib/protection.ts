import {
  announcePassage,
  houseName,
  protectionRef,
  recallProtection,
  requestProtection,
  sendProtection,
  serviceMenOf,
  WAR,
  worldRoute,
  type ProtectionDeps,
  type WorldCell,
} from '@bohemia/game';
import { levyDeps } from './levies';
import { gameDeps, playerToday } from './game';
import { requestProtectionActionForPlayer } from './village';

// Composition root ochrany vojskem a ohlášení průchodu z panelu války (Úloha 6.13): use-casy
// `requestProtection`, `sendProtection`, `recallProtection` a `announcePassage` nad skutečnými
// repozitáři. Herní logika je v `packages/game/src/application/{protection,passage}.ts`.

/** Ves vazala, kam smí pán poslat muže na ochranu. */
export interface GuardedVillageView {
  vassalageId: string;
  villageId: string;
  villageName: string;
  houseName: string;
  /** Kolik pánových mužů v ní je (nebo jde) na ochraně. */
  sent: number;
}

/** Ochrana v panelu války: žádost u pánů, vsi vazalů a muži pána ve zobrazené vsi. */
export interface ProtectionView {
  /** Pánové hráče – u nich smí požádat o ochranu zobrazené vsi. */
  lords: { vassalageId: string; name: string }[];
  /** Muži pána, kteří zobrazenou ves chrání (hosté). */
  guards: number;
  /** Vsi přímých vazalů (hráčů) a kolik mužů tam hráč má. */
  vassalVillages: GuardedVillageView[];
  /** Muži rodu hráče schopní služby (kolik smí poslat). */
  serviceMen: number;
}

function protectionDeps(): ProtectionDeps {
  const deps = gameDeps();
  const levy = levyDeps();
  return {
    vassalages: deps.vassalages,
    houses: deps.houses,
    notices: deps.notices,
    villages: deps.villages,
    settlements: deps.settlements,
    shipments: levy.shipments,
    prepareVillage: levy.prepareVillage,
  };
}

/** Pohled na ochranu pro panel války (zobrazená ves `villageId`). */
export async function protectionViewForPlayer(
  playerId: string,
  villageId: string | null,
): Promise<ProtectionView> {
  const deps = gameDeps();
  const view: ProtectionView = { lords: [], guards: 0, vassalVillages: [], serviceMen: 0 };
  const own = await deps.houses.activeOf(playerId);
  const today = await playerToday(playerId);
  if (!own || !today.ok) return view;
  const shown = villageId ? await deps.villages.find(villageId) : null;
  const shownPlace = shown ? await deps.settlements.find(shown.settlementId) : null;
  if (shown && shownPlace?.ownerId === playerId) {
    view.guards = (shown.state.guests ?? []).filter((g) => g.kind === 'protection').length;
  }
  const away = new Map<string, number>();
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      for (const p of village.state.people) {
        const ref = p.away?.kind === 'protection' ? p.away.refId : undefined;
        if (ref !== undefined) away.set(ref, (away.get(ref) ?? 0) + 1);
      }
    }
  }
  for (const v of await deps.vassalages.activeOf(own.id)) {
    const otherId = v.lordHouseId === own.id ? v.vassalHouseId : v.lordHouseId;
    const other = await deps.houses.byId(otherId);
    if (!other || other.endedAt !== null) continue;
    const name = await houseName(deps, other);
    if (v.vassalHouseId === own.id) {
      view.lords.push({ vassalageId: v.id, name });
      continue;
    }
    if (!other.playerId) continue;
    for (const settlement of await deps.settlements.listActive(other.playerId)) {
      for (const village of await deps.villages.listBySettlement(settlement.id)) {
        view.vassalVillages.push({
          vassalageId: v.id,
          villageId: village.id,
          villageName: village.name,
          houseName: name,
          sent: away.get(protectionRef(v.id, village.id)) ?? 0,
        });
      }
    }
  }
  view.serviceMen = (await serviceMenOf(deps, { playerId, today: today.day })).length;
  return view;
}

/** Vazal požádá pána o ochranu zobrazené vsi (pod zámkem vsi, právo `war`). */
export async function requestProtectionForPlayer(
  playerId: string,
  input: { vassalageId: string; villageId: string; message: string },
): Promise<{ ok: true } | { error: string }> {
  const result = await requestProtectionActionForPlayer(playerId, input.villageId, (ctx) =>
    requestProtection(protectionDeps(), { playerId, ...input, today: ctx.day }),
  );
  if ('error' in result) return result;
  return result.ok ? { ok: true } : { error: result.reason };
}

/**
 * Pán pošle `men` nejzdatnějších mužů rodu do vsi vazala (jako předvyplnění Svolání). Bez zámku
 * vsi – `sendMen` bere zámek držitele odesílající vsi sám (jako odpověď na Svolání).
 */
export async function sendProtectionForPlayer(
  playerId: string,
  input: { vassalageId: string; villageId: string; men: number },
): Promise<{ ok: true; sent: number } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const deps = protectionDeps();
  const men = (await serviceMenOf(deps, { playerId, today: today.day }))
    .slice(0, input.men)
    .map((m) => m.ref);
  const result = await sendProtection(deps, {
    playerId,
    vassalageId: input.vassalageId,
    villageId: input.villageId,
    men,
    today: today.day,
  });
  return result.ok ? { ok: true, sent: result.sent } : { error: result.reason };
}

/** Pán odvolá své muže z ochrany vsi vazala. */
export async function recallProtectionForPlayer(
  playerId: string,
  input: { vassalageId: string; villageId: string },
): Promise<{ ok: true; men: number } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await recallProtection(protectionDeps(), {
    playerId,
    ...input,
    today: today.day,
  });
  return result.ok ? { ok: true, men: result.men } : { error: result.reason };
}

/**
 * Ohlášení průchodu z panelu války (war.md – Pohyb): mapy = trasa od sídla hráče k sídlu rodu,
 * se kterým válčí (nejvýš `WAR.passage.maxCells`), den = dnes – vojsko může vyrazit hned (návrh
 * Clauda).
 */
export async function announceWarPassageForPlayer(
  playerId: string,
  input: { warId: string; house: string; message: string },
): Promise<{ ok: true } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const deps = gameDeps();
  const own = await deps.houses.activeOf(playerId);
  const war = own ? (await deps.wars.activeOf(own.id)).find((w) => w.id === input.warId) : null;
  if (!own || !war) return { error: 'Taková válka není.' };
  const enemy = await deps.houses.byId(war.houses[0] === own.id ? war.houses[1] : war.houses[0]);
  const from = (await deps.settlements.findSeat(playerId))?.worldCell ?? null;
  const to = enemy?.playerId
    ? ((await deps.settlements.findSeat(enemy.playerId))?.worldCell ?? null)
    : null;
  if (!from || !to) return { error: 'Trasa k nepříteli není známá.' };
  const cells: WorldCell[] = worldRoute(from, to, () => false).slice(0, WAR.passage.maxCells);
  const result = await announcePassage(
    {
      passages: deps.passages,
      houses: deps.houses,
      wars: deps.wars,
      notices: deps.notices,
      villages: deps.villages,
      now: () => new Date(),
    },
    {
      playerId,
      house: input.house,
      cells,
      eta: today.day,
      message: input.message,
      today: today.day,
    },
  );
  return result.ok ? { ok: true } : { error: result.reason };
}
