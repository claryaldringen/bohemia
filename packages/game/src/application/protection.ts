import { shipmentDays } from '../domain/vassalage';
import type { PersonRef } from '../domain/village';
import { lineCandidates } from '../domain/war';
import { cellDistance } from '../domain/world/placement';
import { NEGOTIATION } from '../domain/negotiation';
import type { HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { houseName } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import { findPlayerVillage } from './player-villages';
import type { SettlementRepository } from './settlements';
import { sendMen, type ShipmentDeps } from './shipments';
import type { VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';

// Ochrana vojskem (vassalage.md – Povinnosti pána: Ochrana vojskem; Martin: „Ano“ – na žádost
// vazala). Vazal požádá o ochranu vsi se vzkazem, pán rozhodne, jestli a koho pošle – muže svého
// rodu. Poslaní muži jsou hosty chráněné vsi (`away` druhu `protection` doma, `VillageState.guests`
// u vazala), živí je chráněná ves a vrátí se, když je pán odvolá (`recallProtection`). Nic se
// nevynucuje – žádost pána k ničemu nezavazuje.

export const PROTECTION_REASONS = {
  notVassal: 'Taková dohoda není.',
  notYourVillage: 'Tahle ves vazalovi nepatří.',
  noMen: 'Vyber muže rodu schopné služby.',
  notLineMan: 'Na ochranu smí jen muži rodu schopní služby.',
  messageTooLong: 'Vzkaz je příliš dlouhý.',
  nobody: 'V té vsi nikoho na ochraně nemáš.',
} as const;

export interface ProtectionDeps {
  vassalages: Pick<VassalageRepository, 'byId'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  notices: Pick<NoticeRepository, 'post'>;
  villages: VillageRepository;
  settlements: SettlementRepository;
  shipments: ShipmentDeps;
  /** Dopočítá ves k dnešku před odesláním mužů. */
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
}

type Result<T> = ({ ok: true } & T) | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Odkaz ochrany vsi `villageId` podle dohody `vassalageId` (`away.refId` u mužů). */
export const protectionRef = (vassalageId: string, villageId: string): string =>
  `protection:${vassalageId}:${villageId}`;

/** Živá dohoda, v níž je rod hráče `side`, a druhý rod. */
async function agreementOf(
  deps: Pick<ProtectionDeps, 'vassalages' | 'houses'>,
  input: { playerId: string; vassalageId: string; side: 'lord' | 'vassal' },
): Promise<{ lordId: string; vassalId: string; ownId: string } | null> {
  const own = await deps.houses.activeOf(input.playerId);
  const v = await deps.vassalages.byId(input.vassalageId);
  if (!own || !v || v.endedAt !== null) return null;
  const mine = input.side === 'lord' ? v.lordHouseId : v.vassalHouseId;
  return mine === own.id
    ? { lordId: v.lordHouseId, vassalId: v.vassalHouseId, ownId: own.id }
    : null;
}

/** Je ves `villageId` vsí hráče rodu `houseId`? */
async function villageOfHouse(
  deps: Pick<ProtectionDeps, 'houses' | 'villages' | 'settlements'>,
  houseId: string,
  villageId: string,
): Promise<boolean> {
  const house = await deps.houses.byId(houseId);
  if (!house?.playerId) return false;
  return (await findPlayerVillage(deps, { playerId: house.playerId, villageId })) !== null;
}

/** Vazal požádá pána o ochranu své vsi (upozornění se vzkazem). */
export async function requestProtection(
  deps: ProtectionDeps,
  input: {
    playerId: string;
    vassalageId: string;
    villageId: string;
    message: string;
    today: number;
  },
): Promise<Result<object>> {
  const deal = await agreementOf(deps, { ...input, side: 'vassal' });
  if (!deal) return fail(input.playerId ? PROTECTION_REASONS.notVassal : NO_HOUSE);
  const own = await findPlayerVillage(deps, input);
  if (!own) return fail(PROTECTION_REASONS.notYourVillage);
  const message = input.message.trim();
  if (message.length > NEGOTIATION.messageMaxChars) return fail(PROTECTION_REASONS.messageTooLong);
  const lord = await deps.houses.byId(deal.lordId);
  const vassal = await deps.houses.byId(deal.vassalId);
  if (lord?.playerId && vassal) {
    await deps.notices.post({
      playerId: lord.playerId,
      kind: 'protection-requested',
      payload: {
        vassalageId: input.vassalageId,
        name: await houseName(deps, vassal),
        villageId: own.village.id,
        villageName: own.village.name,
        message: message === '' ? null : message,
      },
      gameDay: input.today,
    });
  }
  return { ok: true };
}

/**
 * Pán pošle muže svého rodu `men` (schopné služby, z vlastních vsí) na ochranu vsi vazala
 * `villageId` – do odvolání. Vazal dostane upozornění.
 */
export async function sendProtection(
  deps: ProtectionDeps,
  input: {
    playerId: string;
    vassalageId: string;
    villageId: string;
    men: readonly PersonRef[];
    today: number;
  },
): Promise<Result<{ sent: number; arrivesDay: number | null }>> {
  const deal = await agreementOf(deps, { ...input, side: 'lord' });
  if (!deal) return fail(PROTECTION_REASONS.notVassal);
  if (!(await villageOfHouse(deps, deal.vassalId, input.villageId))) {
    return fail(PROTECTION_REASONS.notYourVillage);
  }
  const byVillage = new Map<string, number[]>();
  for (const ref of input.men) {
    const list = byVillage.get(ref.villageId) ?? [];
    if (!list.includes(ref.personId)) list.push(ref.personId);
    byVillage.set(ref.villageId, list);
  }
  if (byVillage.size === 0) return fail(PROTECTION_REASONS.noMen);
  for (const [villageId, ids] of byVillage) {
    const own = await findPlayerVillage(deps, { playerId: input.playerId, villageId });
    if (!own) return fail(PROTECTION_REASONS.notLineMan);
    const fit = new Set(lineCandidates(own.village.state, input.today).map((p) => p.id));
    if (ids.some((id) => !fit.has(id))) return fail(PROTECTION_REASONS.notLineMan);
  }
  let sent = 0;
  let arrivesDay: number | null = null;
  for (const [villageId, ids] of byVillage) {
    await deps.prepareVillage(villageId, input.today);
    const result = await sendMen(deps.shipments, {
      fromVillageId: villageId,
      toVillageId: input.villageId,
      personIds: ids,
      kind: 'protection',
      days: null,
      refId: protectionRef(input.vassalageId, input.villageId),
      today: input.today,
    });
    if (!result.ok) return fail(result.reason);
    sent += ids.length;
    arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
  }
  const lord = await deps.houses.byId(deal.lordId);
  const vassal = await deps.houses.byId(deal.vassalId);
  if (vassal?.playerId && lord) {
    await deps.notices.post({
      playerId: vassal.playerId,
      kind: 'protection-sent',
      payload: { name: await houseName(deps, lord), men: sent, villageId: input.villageId },
      gameDay: input.today,
    });
  }
  return { ok: true, sent, arrivesDay };
}

/**
 * Pán odvolá muže z ochrany vsi `villageId`: chráněná ves je dnes propustí (`guests-leave`) a doma
 * jsou za dny cesty (`away-ends` – 2 dny na políčko). Vrací, kolik mužů se vrací.
 */
export async function recallProtection(
  deps: ProtectionDeps,
  input: { playerId: string; vassalageId: string; villageId: string; today: number },
): Promise<Result<{ men: number }>> {
  const deal = await agreementOf(deps, { ...input, side: 'lord' });
  if (!deal) return fail(PROTECTION_REASONS.notVassal);
  const host = await deps.villages.find(input.villageId);
  const hostPlace = host ? await deps.settlements.find(host.settlementId) : null;
  if (!host || !hostPlace?.worldCell) return fail(PROTECTION_REASONS.notYourVillage);
  const refId = protectionRef(input.vassalageId, input.villageId);
  let men = 0;
  for (const settlement of await deps.settlements.listActive(input.playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      const away = village.state.people.filter(
        (p) => p.away?.refId === refId && p.away.untilDay === undefined,
      );
      if (away.length === 0 || !settlement.worldCell) continue;
      men += away.length;
      const travel = shipmentDays(cellDistance(settlement.worldCell, hostPlace.worldCell)).arrive;
      await deps.villages.inbox.post({
        villageId: input.villageId,
        day: input.today,
        ref: `recall:${refId}:${village.id}:${input.today}`,
        body: {
          kind: 'guests-leave',
          away: 'protection',
          guests: away.map((p) => ({ villageId: village.id, personId: p.id })),
        },
      });
      await deps.villages.inbox.post({
        villageId: village.id,
        day: input.today,
        ref: `recall-home:${refId}:${input.today}`,
        body: { kind: 'away-ends', refId, untilDay: input.today + travel },
      });
    }
  }
  if (men === 0) return fail(PROTECTION_REASONS.nobody);
  const lord = await deps.houses.byId(deal.lordId);
  const vassal = await deps.houses.byId(deal.vassalId);
  if (vassal?.playerId && lord) {
    await deps.notices.post({
      playerId: vassal.playerId,
      kind: 'protection-recalled',
      payload: { name: await houseName(deps, lord), villageId: input.villageId },
      gameDay: input.today,
    });
  }
  return { ok: true, men };
}
