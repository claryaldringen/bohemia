import {
  currentLord,
  drawPlayerLot,
  dynastySenior,
  isPlayerLot,
  isVillageAbandoned,
  isVillageExtinct,
  playerLotCandidates,
  PLAYER_SUCCESSION,
} from '../domain/village';
import type { VillageState } from '../domain/village';
import type { HouseRepository, PersonRef } from './houses';
import type { NoticeRepository } from './notices';
import type { SettlementRepository } from './settlements';
import type { SuccessionCreditRepository } from './succession-credits';
import type { DynastyDeps } from './restart-game';
import type { VillageRecord, VillageRepository } from './villages';

// Nástupnictví hráče (seniorate.md – Nástupnictví hráče): po smrti hráčova muže (`House.lord`)
// rozhodne, za koho hráč hraje dál. Odchod mladšího syna po pohřbu je úloha 2.5 – tady jen výsledek
// losu a den, do kterého má hráč na volbu směru (`deadlineDay`).

export interface PlayerSuccessionDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'commitSuccession'>;
  settlements: SettlementRepository;
  villages: VillageRepository;
  notices: NoticeRepository;
  successionCredits: Pick<SuccessionCreditRepository, 'unused' | 'consumeOne'>;
}

/**
 * Výsledek: `alive` – hráčův muž žije (nebo ještě není převod / ves nejde načíst), nic se
 * nezměnilo; `none` – nikdo z rodu nežije (konec hry jako dnes); `successor` – nástupce vsi (i za
 * kredit); `younger-son` – los padl na mladšího syna (`deadlineDay` = den smrti + `departDays`);
 * `senior` / `oldest-lord` – ves bez muže rodu.
 */
export type PlayerSuccessionOutcome =
  | { kind: 'alive' }
  | { kind: 'none' }
  | { kind: 'successor' | 'senior' | 'oldest-lord'; lord: PersonRef }
  | { kind: 'younger-son'; lord: PersonRef; deadlineDay: number };

/**
 * Když hráčův muž zemřel, rozhodne o novém: 1. nástupce vsi je-li jediný kandidát; 2. jsou-li v losu
 * aspoň dva (nástupce + mladší synové od 16 let), nevyužité nástupnictví bez losu se spotřebuje
 * (nástupce), jinak los ze seedu vsi a dne smrti; 3. bez nástupce z rodu senior rodu, je-li vojvodou
 * některé vsi, jinak nejstarší vojvoda rodu (jeho ves se stane vlastní – stejná hlava rodu); 4. nikdo
 * – `none`.
 *
 * Idempotence (web i worker, souběh): den smrti (`deathDay`) je z kroniky vojvodů vsi, ne z doby
 * dopočtu. Rozhodnutí se zapíše jediným podmíněným příkazem `commitSuccession` (hlava rodu +
 * `succession_day`, jen když pro tento nebo pozdější den ještě není zapsáno) – souběžná volání
 * zapíšou jedno. Kredit se spotřebuje teprve po úspěšném zápisu, takže nejvýš jednou a jen
 * vítězným voláním; jediná cesta, jak kredit propadne bez nástupnictví, neexistuje (zápis je před
 * ním), naopak přerušení mezi zápisem a spotřebou hráči kredit ponechá. Upozornění se posílá taky
 * jen po úspěšném zápisu. Volající drží zámek hráče.
 */
export async function resolvePlayerSuccession(
  deps: PlayerSuccessionDeps,
  input: { playerId: string; today: number },
): Promise<PlayerSuccessionOutcome> {
  const house = await deps.houses.activeOf(input.playerId);
  const lord = house?.lord;
  if (!house || !lord) return { kind: 'alive' };
  const home = await deps.villages.find(lord.villageId);
  if (!home || isVillageAbandoned(home.state)) return { kind: 'alive' };
  if (home.state.people.some((p) => p.id === lord.personId)) return { kind: 'alive' };

  const record = home.state.dynasty?.lords.find((l) => l.id === lord.personId);
  // vojvoda má den konce vlády (= den smrti) v kronice rodu; jiný muž rodu (mladší syn po losu) má
  // den smrti v kronice vsi (`death.personId`). Záložní `today` jen pro starší stavy bez `personId`
  // (tam los závisí na době dopočtu, nic lepšího není) – zápis `succession_day` ho stejně zajistí.
  const deathEntry = home.state.chronicle.find(
    (e) => e.kind === 'death' && e.personId === lord.personId,
  );
  const deathDay = record?.toDay ?? deathEntry?.day ?? input.today;
  const candidates = playerLotCandidates(home.state, deathDay, lord.personId);

  let chosen: { ref: PersonRef; kind: PlayerSuccessionOutcome['kind'] } | null = null;
  let useCredit = false;
  if (candidates.successor !== null) {
    let personId = candidates.successor;
    let kind: PlayerSuccessionOutcome['kind'] = 'successor';
    if (isPlayerLot(candidates)) {
      if ((await deps.successionCredits.unused(input.playerId)) > 0) {
        useCredit = true;
      } else {
        personId = drawPlayerLot(home.state.seed, deathDay, candidates);
        if (personId !== candidates.successor) kind = 'younger-son';
      }
    }
    chosen = { ref: { villageId: home.id, personId }, kind };
  } else {
    chosen = await fallbackLord(deps, input.playerId, input.today);
  }
  if (!chosen) return { kind: 'none' };

  const deadlineDay =
    chosen.kind === 'younger-son' ? deathDay + PLAYER_SUCCESSION.departDays : null;
  const written = await deps.houses.commitSuccession(house.id, {
    deathDay,
    lord: chosen.ref,
    pendingDeparture:
      deadlineDay === null
        ? null
        : { villageId: chosen.ref.villageId, sonId: chosen.ref.personId, deathDay, deadlineDay },
  });
  // souběžné volání už rozhodlo – jeho výsledek platí, tady nic dalšího (kredit ani upozornění)
  if (!written) return { kind: 'alive' };
  if (useCredit) await deps.successionCredits.consumeOne(input.playerId, deathDay);

  const newState = chosen.ref.villageId === home.id ? home.state : await stateOf(deps, chosen.ref);
  await deps.notices.post({
    playerId: input.playerId,
    kind: 'player-succession',
    payload: {
      deadName: record?.name ?? null,
      newName: newState?.people.find((p) => p.id === chosen.ref.personId)?.name ?? null,
    },
    gameDay: input.today,
  });
  if (deadlineDay !== null) {
    return { kind: 'younger-son', lord: chosen.ref, deadlineDay };
  }
  return { kind: chosen.kind as 'successor' | 'senior' | 'oldest-lord', lord: chosen.ref };
}

async function stateOf(
  deps: Pick<PlayerSuccessionDeps, 'villages'>,
  ref: PersonRef,
): Promise<VillageState | undefined> {
  return (await deps.villages.find(ref.villageId))?.state;
}

/** Živé vsi aktivních sídel hráče. */
async function livingVillages(
  deps: Pick<PlayerSuccessionDeps, 'settlements' | 'villages'>,
  playerId: string,
): Promise<VillageRecord[]> {
  const living: VillageRecord[] = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      if (!isVillageExtinct(village.state) && !isVillageAbandoned(village.state)) {
        living.push(village);
      }
    }
  }
  return living;
}

/**
 * Ves bez muže rodu (bod 5): senior rodu, je-li vojvodou některé vsi, jinak nejstarší vojvoda rodu
 * (dřív narozený, pak nižší id osoby a vsi). Bez vojvody v kterékoli vsi null (muži rodu jsou, ale
 * žádný nevládne – ves ho dosadí sama, hráč zatím nemá koho hrát).
 */
async function fallbackLord(
  deps: Pick<PlayerSuccessionDeps, 'settlements' | 'villages'>,
  playerId: string,
  today: number,
): Promise<{ ref: PersonRef; kind: 'senior' | 'oldest-lord' } | null> {
  const living = await livingVillages(deps, playerId);
  const lords = living.flatMap((v) => {
    const lord = currentLord(v.state);
    return lord ? [{ villageId: v.id, personId: lord.id, bornDay: lord.bornDay }] : [];
  });
  if (lords.length === 0) return null;
  const senior = dynastySenior(
    living.map((v) => ({ villageId: v.id, state: v.state })),
    today,
  );
  if (
    senior &&
    lords.some((l) => l.villageId === senior.villageId && l.personId === senior.personId)
  ) {
    return { ref: senior, kind: 'senior' };
  }
  const oldest = [...lords].sort(
    (a, b) =>
      a.bornDay - b.bornDay || a.personId - b.personId || (a.villageId < b.villageId ? -1 : 1),
  )[0];
  return oldest
    ? { ref: { villageId: oldest.villageId, personId: oldest.personId }, kind: 'oldest-lord' }
    : null;
}

/**
 * `resolvePlayerSuccession` nad závislostmi dopočtu rodu – bez rodů, upozornění nebo kreditů
 * (testy, úzké vstupy) se nic neděje. Volá ho web (`dynastyForVillage`) i worker po dopočtu vsí.
 */
export async function resolveSuccessionOf(
  deps: DynastyDeps,
  input: { playerId: string; today: number },
): Promise<PlayerSuccessionOutcome> {
  if (!deps.houses || !deps.notices || !deps.successionCredits) return { kind: 'alive' };
  return resolvePlayerSuccession(
    {
      houses: deps.houses,
      settlements: deps.settlements,
      villages: deps.villages,
      notices: deps.notices,
      successionCredits: deps.successionCredits,
    },
    input,
  );
}
