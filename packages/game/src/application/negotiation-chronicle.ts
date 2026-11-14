import type { ChronicleEvent } from '../domain/village';
import type { House } from './houses';
import type { NegotiationTx } from './negotiations';
import type { PlayerNoticeKind } from './notices';
import type { VillageRepository } from './villages';

// Společné součástky jednání a blokování: jména rodů, upozornění hráči a kronika do vlastní vsi.

/** Náhradní jméno rodu, jehož hlava nemá jméno (nebo rod hlavu nemá). */
export const UNNAMED_HOUSE = 'Rod bez jména';

export interface NegotiationVillages {
  villages: Pick<VillageRepository, 'find' | 'inbox'>;
}

/** Jméno hlavy rodu (vlastní ves rodu = `lord.villageId`). */
export async function houseName(
  deps: { villages: Pick<VillageRepository, 'find'> },
  house: Pick<House, 'lord'>,
): Promise<string> {
  if (!house.lord) return UNNAMED_HOUSE;
  const village = await deps.villages.find(house.lord.villageId);
  const name = village?.state.people.find((p) => p.id === house.lord?.personId)?.name;
  return name !== undefined && name !== '' ? name : UNNAMED_HOUSE;
}

/**
 * Upozornění hráči rodu uvnitř transakce; NPC rod hráče nemá. Payload nese jen veřejné údaje
 * (id rodu a jednání, jméno) – žádná id účtů.
 */
export async function noticeHouse(
  tx: NegotiationTx,
  to: Pick<House, 'playerId'>,
  kind: PlayerNoticeKind,
  payload: Record<string, unknown>,
  day: number,
): Promise<void> {
  if (to.playerId === null) return;
  await tx.notices.post({ playerId: to.playerId, kind, payload, gameDay: day });
}

/**
 * Zápis do kroniky vlastní vsi rodu přes schránku. Volá se až **po** úspěšné transakci: schránka
 * je jiná tabulka a jiná transakce, takže zápis nemůže vrátit hotové jednání zpět. Jedinečný `ref`
 * (`<ref>:<ves>`) dělá opakování bezpečné – druhý zápis téhož se zahodí. Selhání schránky se
 * spolkne: akce hráče už platí a upozornění ji ukáže i bez záznamu v kronice.
 */
export async function chronicleHouses(
  deps: NegotiationVillages,
  houses: readonly Pick<House, 'lord'>[],
  ref: string,
  event: ChronicleEvent,
): Promise<void> {
  for (const house of houses) {
    if (!house.lord) continue;
    try {
      await deps.villages.inbox.post({
        villageId: house.lord.villageId,
        day: event.day,
        ref: `${ref}:${house.lord.villageId}`,
        body: { kind: 'chronicle', event },
      });
    } catch {
      // ves rodu mezitím zanikla – záznam nemá kam
    }
  }
}
