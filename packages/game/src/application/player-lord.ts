import { cloneState } from '../domain/village/clone';
import {
  currentLord,
  isStewardOn,
  isVillageAbandoned,
  isVillageExtinct,
  setStewardOn,
} from '../domain/village';
import type { HouseRepository, PersonRef } from './houses';
import type { SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Hráčův muž a vlastní ves (seniorate.md – Hráčův muž a vlastní ves, Převod rozehraných her):
// muž rodu, za kterého hráč hraje, je `House.lord`. Převod rozehrané hry proběhne jednou –
// dokud je `lord` prázdný.

export interface PlayerLordDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'setLord'>;
  settlements: SettlementRepository;
  villages: VillageRepository;
}

/** Kolikrát se zkusí zapnout správce vsi při souběžném zápisu. */
const SAVE_ATTEMPTS = 5;

/** Hráčův muž (ves a číslo osoby), nebo null – hráč bez živého rodu, nebo před převodem. */
export async function playerLordOf(
  deps: { houses: Pick<HouseRepository, 'activeOf'> },
  playerId: string,
): Promise<PersonRef | null> {
  return (await deps.houses.activeOf(playerId))?.lord ?? null;
}

/**
 * Převod rozehrané hry (jednou a idempotentně – jen když `house.lord` je null): hráčovým mužem je
 * vojvoda první vsi hráče se správcem vypnutým, jinak vojvoda nejstarší vsi s vojvodou; ostatním
 * vsím hráče se zapne správce. Nejdřív se zapínají správci a až pak se zapíše muž – přerušený
 * převod se při dalším volání dokončí stejně (vybraná ves zůstává jediná se správcem vypnutým,
 * případně je pořád nejstarší). Bez vsi s vojvodou (ještě nezaložená, rod bez převodu) se nic
 * neděje a převod se zkusí příště. Volající drží zámek hráče.
 */
export async function ensurePlayerLord(
  deps: PlayerLordDeps,
  input: { playerId: string; today: number },
): Promise<PersonRef | null> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return null;
  if (house.lord) return house.lord;
  const settlements = await deps.settlements.listActive(input.playerId);
  const living: VillageRecord[] = [];
  for (const settlement of settlements) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      if (!isVillageExtinct(village.state) && !isVillageAbandoned(village.state)) {
        living.push(village);
      }
    }
  }
  const withLord = living.filter((v) => currentLord(v.state) !== undefined);
  const chosen =
    withLord.find((v) => !isStewardOn(v.state)) ??
    withLord.reduce<VillageRecord | undefined>(
      (oldest, v) =>
        oldest === undefined || v.state.foundedDay < oldest.state.foundedDay ? v : oldest,
      undefined,
    );
  const lord = chosen ? currentLord(chosen.state) : undefined;
  if (!chosen || !lord) return null;
  for (const village of living) {
    if (village.id !== chosen.id) await turnStewardOn(deps.villages, village.id);
  }
  const ref: PersonRef = { villageId: chosen.id, personId: lord.id };
  await deps.houses.setLord(house.id, ref);
  return ref;
}

/** Zapne správce vsi (verzovaný zápis s opakováním); zapnutý správce nic neukládá. */
async function turnStewardOn(villages: VillageRepository, villageId: string): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await villages.find(villageId);
    if (!current || isStewardOn(current.state)) return;
    const next = cloneState(current.state);
    setStewardOn(next, next.lastDay, true);
    if (await villages.save(villageId, next, current.version)) return;
  }
}

/**
 * Hráčův muž odešel na novou mapu (`personIds` jsou lidé, kteří odešli z vsi `fromVillageId`):
 * `house.lord.villageId` přejde na novou ves `toVillageId`, číslo osoby zůstává (lidé si při
 * odchodu nechávají id). Odešel-li někdo jiný, nic se nemění. Volající drží zámek hráče.
 */
export async function followPlayerLord(
  deps: { houses: Pick<HouseRepository, 'activeOf' | 'setLord'> },
  input: {
    playerId: string;
    fromVillageId: string;
    toVillageId: string;
    personIds: readonly number[];
  },
): Promise<void> {
  const house = await deps.houses.activeOf(input.playerId);
  const lord = house?.lord;
  if (!house || !lord) return;
  if (lord.villageId !== input.fromVillageId || !input.personIds.includes(lord.personId)) return;
  await deps.houses.setLord(house.id, { villageId: input.toVillageId, personId: lord.personId });
}
