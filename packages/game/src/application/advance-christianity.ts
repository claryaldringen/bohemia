import { dateOfDayIndex, dayIndexOf } from '../domain/calendar';
import {
  discoveryYear,
  firstDiscoveryYear,
  houseFaithSeed,
  npcBaptismYear,
} from '../domain/village/faith';
import type { House, HouseRepository } from './houses';
import { chronicleHouses } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import type { SettlementRepository } from './settlements';
import type { StewardshipRepository } from './stewardships';
import type { VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';

// Křesťanství ve světě (christianity.md – Objev křesťanství, Křest rodu): roční úloha světa losuje
// objev pro rody, které křesťanství neznají, a NPC rody se po objevu samy pokřtí. Los je pevný ze
// seedu světa a rodu – přehrání za víc let naráz dá totéž co los rok po roku.

/** Závislosti zprávy o křtu rodu do jeho vsí. */
export interface RodBaptizedDeps {
  houses: Pick<HouseRepository, 'byId'>;
  settlements: Pick<SettlementRepository, 'listActive'>;
  villages: Pick<VillageRepository, 'find' | 'listBySettlement' | 'inbox'>;
  stewardships: Pick<StewardshipRepository, 'listByHolderHouse' | 'listByStewardHouse'>;
}

/** Závislosti roční úlohy světa (worker: úlohy světa). */
export interface ChristianityDeps extends RodBaptizedDeps {
  houses: Pick<
    HouseRepository,
    'byId' | 'playerHousesSince' | 'waitingNewcomers' | 'markChristianityKnown' | 'markBaptized'
  >;
  vassalages: Pick<VassalageRepository, 'allActive'>;
  notices: Pick<NoticeRepository, 'post'>;
  worldSeed: number;
  /** Herní den okamžiku – rok založení rodu z `House.createdAt`. */
  dayOf: (at: Date) => number;
  /**
   * Paměť workeru: herní rok, za který úloha už proběhla. Los padá 1. 1., v témže roce se úloha
   * nemusí opakovat (worker ji jinak volá každou minutu). Chybí – úloha běží pokaždé (idempotentně).
   */
  doneYear?: { year: number | null };
}

/**
 * Roční úloha světa (christianity.md – Objev křesťanství, Křest rodu): rodu, který křesťanství
 * nezná, přehraje los objevu od prvního 1. 1. po založení do letošního roku (`discoveryYear`);
 * padne-li, zapíše rok objevu, hráči pošle upozornění a do kroniky vsi vojvody zápis. NPC rod, který
 * zná, se pokřtí 1. 1. roku křtu (`npcBaptismYear`) – událost do jeho vsí a den křtu v rodu.
 * Opakovaný běh nic nezdvojí (podmíněné zápisy rodu, jedinečné `ref` schránky).
 */
export async function advanceChristianity(
  deps: ChristianityDeps,
  today: number,
): Promise<{ known: number; npcBaptized: number }> {
  const year = dateOfDayIndex(today).year;
  const result = { known: 0, npcBaptized: 0 };
  if (deps.doneYear?.year === year) return result;
  for (const house of await livingHouses(deps)) {
    const seed = houseFaithSeed(deps.worldSeed, house.id);
    let knownYear = house.christianityKnownYear;
    if (knownYear === null) {
      knownYear = discoveryYear(seed, firstDiscoveryYear(deps.dayOf(house.createdAt)), year);
      if (knownYear === null) continue;
      // souběžný worker mohl zapsat dřív – stejný rok (los je pevný), oznámí jen ten, kdo zapsal
      if (await deps.houses.markChristianityKnown(house.id, knownYear)) {
        result.known++;
        await announceKnown(deps, house, knownYear, today);
      }
    }
    if (house.kind !== 'npc' || house.baptizedDay !== null) continue;
    const baptismYear = npcBaptismYear(seed, knownYear);
    if (baptismYear > year) continue;
    const day = dayIndexOf({ year: baptismYear, month: 1, day: 1 });
    // nejdřív vsi (jedinečný `ref` – opakování po pádu workeru nic nezdvojí), pak rod
    await sendRodBaptized(deps, house.id, day);
    if (await deps.houses.markBaptized(house.id, day)) result.npcBaptized++;
  }
  if (deps.doneYear) deps.doneYear.year = year;
  return result;
}

/**
 * Křest rodu `houseId` ve dni `day` do schránky všech jeho vsí (událost `rod-baptized`; co ves
 * udělá, doplní K4). Vsi rodu: NPC rod – vsi, které spravuje; hráč – vsi jeho aktivních sídel
 * kromě vsí, které za něj spravuje NPC rod (ty patří tomu rodu). Jedinečný `ref` – opakování nic
 * nezdvojí.
 */
export async function sendRodBaptized(
  deps: RodBaptizedDeps,
  houseId: string,
  day: number,
): Promise<void> {
  const house = await deps.houses.byId(houseId);
  if (!house) return;
  for (const villageId of await houseVillageIds(deps, house)) {
    try {
      await deps.villages.inbox.post({
        villageId,
        day,
        ref: `rod-baptized:${houseId}:${villageId}`,
        body: { kind: 'rod-baptized', houseId },
      });
    } catch {
      // ves mezitím zanikla – zpráva nemá kam
    }
  }
}

/** Živé rody: hráčů (umístěné i odříznuté) a NPC rody (každý je vazalem – povýšení). */
async function livingHouses(deps: ChristianityDeps): Promise<House[]> {
  const houses = [
    ...(await deps.houses.playerHousesSince(new Date(0))),
    ...(await deps.houses.waitingNewcomers()),
  ];
  const seen = new Set(houses.map((h) => h.id));
  for (const v of await deps.vassalages.allActive()) {
    if (seen.has(v.vassalHouseId)) continue;
    seen.add(v.vassalHouseId);
    const house = await deps.houses.byId(v.vassalHouseId);
    if (house?.kind === 'npc' && house.endedAt === null) houses.push(house);
  }
  return houses;
}

/**
 * Objev hráčova rodu: upozornění a kronika vsi vojvody. NPC rod nic – kroniku jeho vsi čte držitel
 * a „Rod“ by v ní mátl (návrh Clauda).
 */
async function announceKnown(
  deps: ChristianityDeps,
  house: House,
  year: number,
  today: number,
): Promise<void> {
  if (house.kind !== 'player' || house.playerId === null) return;
  await deps.notices.post({
    playerId: house.playerId,
    kind: 'christianity-known',
    payload: { year },
    gameDay: today,
  });
  await chronicleHouses(deps, [house], `christianity-known:${house.id}`, {
    day: today,
    kind: 'christianity-known',
  });
}

async function houseVillageIds(deps: RodBaptizedDeps, house: House): Promise<string[]> {
  if (house.kind === 'npc') {
    const run = await deps.stewardships.listByStewardHouse(house.id);
    return run.filter((s) => s.kind === 'npc').map((s) => s.villageId);
  }
  if (house.playerId === null) return [];
  const npcRun = new Set(
    (await deps.stewardships.listByHolderHouse(house.id))
      .filter((s) => s.kind === 'npc')
      .map((s) => s.villageId),
  );
  const ids: string[] = [];
  for (const settlement of await deps.settlements.listActive(house.playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      if (!npcRun.has(village.id)) ids.push(village.id);
    }
  }
  return ids;
}
