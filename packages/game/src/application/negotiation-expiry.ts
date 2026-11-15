import { ABSENT_VASSAL } from '../domain/vassalage/rules-absence';
import type { HouseRepository } from './houses';
import {
  chronicleHouses,
  houseName,
  noticeHouse,
  type NegotiationVillages,
} from './negotiation-chronicle';
import type { NegotiationRecord, NegotiationRepository } from './negotiations';
import { playerDays, type PlayerTimeDeps } from './player-time';

// Vypršení jednání (absence.md – Povinnosti vazala, když hráč nehraje; Martin 8. 11. 2026: „ano“):
// nová jednání čekají na hráče; návrh, na který druhá strana neodpoví do lhůty
// (`ABSENT_VASSAL.negotiationExpiryDays` – návrh Clauda: 1 herní rok od posledního kola), vyprší.
// Žádosti odříznutého nováčka mají vlastní týden a los (newcomers.md) – ty se tu nepočítají.

/**
 * `offsets`: lhůta ve dni strany, která má odpovědět, upozornění a kronika ve dni každé strany
 * (accounts.md – Posun času v úlohách světa).
 */
export interface ExpireNegotiationsDeps extends NegotiationVillages, PlayerTimeDeps {
  negotiations: Pick<NegotiationRepository, 'allOpen' | 'transaction'>;
  houses: Pick<HouseRepository, 'byId'>;
  /** Herní den okamžiku – kolo jednání nese skutečný čas. */
  dayOf: (at: Date) => number;
}

/** Herní den, kdy otevřené jednání vyprší (null – žádost nováčka nebo jednání bez kola). */
export function negotiationExpiryDay(
  record: Pick<NegotiationRecord, 'newcomer' | 'rounds'>,
  dayOf: (at: Date) => number,
): number | null {
  const last = record.rounds[record.rounds.length - 1];
  if (record.newcomer || !last) return null;
  return dayOf(last.at) + ABSENT_VASSAL.negotiationExpiryDays;
}

/**
 * Úloha světa: otevřená jednání, jejichž poslední kolo čeká na odpověď déle než lhůta, vyprší
 * (stav `expired`). Obě strany dostanou upozornění `negotiation-expired` a kronika obou rodů zápis
 * „Návrh dohody vypršel“. Vypršení není odmítnutí – pauza po odmítnutí se nezapisuje a nový návrh
 * smí kdokoli poslat hned. Podmíněné `setStatus` (verze řádku) dá přednost odpovědi, která přišla
 * dřív; opakování nic nezdvojí. Vrací počet vypršelých. Lhůta jde ve dni strany, která má odpovědět
 * – kolo nese skutečný čas, převede se jejím dnešním posunem, takže lhůta je dál rok běhu světa
 * (posun hráče ji nezkrátí); upozornění a zápis do kroniky dostane každá strana ve svém dni.
 */
export async function expireNegotiations(
  deps: ExpireNegotiationsDeps,
  input: { now: Date; today: number },
): Promise<number> {
  const dayOf = playerDays(deps, input.today);
  let expired = 0;
  for (const record of await deps.negotiations.allOpen()) {
    const day = negotiationExpiryDay(record, deps.dayOf);
    if (day === null) continue;
    const authorId = record.rounds[record.rounds.length - 1]!.authorHouseId;
    const otherId =
      authorId === record.initiatorHouseId ? record.recipientHouseId : record.initiatorHouseId;
    const other = await deps.houses.byId(otherId);
    const otherPlayer = other?.playerId ?? null;
    if ((await dayOf(otherPlayer)) < (await dayOf(otherPlayer, day))) continue;
    const author = await deps.houses.byId(authorId);
    const days = {
      author: await dayOf(author?.playerId ?? null),
      other: await dayOf(otherPlayer),
    };
    const names = {
      author: author ? await houseName(deps, author) : '',
      other: other ? await houseName(deps, other) : '',
    };
    const done = await deps.negotiations.transaction(async (tx): Promise<boolean> => {
      const fresh = await tx.getForUpdate(record.id);
      // mezitím někdo odpověděl (nové kolo, přijetí, odmítnutí) – odpověď má přednost
      if (fresh?.status !== 'open' || fresh.rounds.length !== record.rounds.length) return false;
      if (!(await tx.setStatus(fresh.id, 'expired', fresh.version, input.now))) return false;
      const payload = (houseId: string, name: string): Record<string, unknown> => ({
        negotiationId: record.id,
        houseId,
        name,
      });
      if (author) {
        await noticeHouse(
          tx,
          author,
          'negotiation-expired',
          payload(otherId, names.other),
          days.author,
        );
      }
      if (other) {
        await noticeHouse(
          tx,
          other,
          'negotiation-expired',
          payload(authorId, names.author),
          days.other,
        );
      }
      return true;
    });
    if (!done) continue;
    expired++;
    for (const [side, sideDay] of [
      [author, days.author],
      [other, days.other],
    ] as const) {
      if (!side) continue;
      await chronicleHouses(deps, [side], `neg:${record.id}:${record.rounds.length}:expired`, {
        day: sideDay,
        kind: 'negotiation',
        step: 'expired',
        actor: names.author,
        other: names.other,
      });
    }
  }
  return expired;
}
