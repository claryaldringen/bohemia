import { dateOfDayIndex, dayIndexOf } from '../domain/calendar';
import {
  discoveryYear,
  firstDiscoveryYear,
  houseFaithSeed,
  npcBaptismYear,
} from '../domain/village/people/faith';
import type { House, HouseRepository } from './houses';
import { chronicleHouses } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import { playerDay, type TimeOffsetRepository } from './player-time';
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
  stewardships: Pick<StewardshipRepository, 'listByStewardHouse'>;
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
  /** Posun času hráčů – rod hráče losuje do roku svého dne, NPC rod do roku dne světa. */
  offsets: Pick<TimeOffsetRepository, 'offsetOf'>;
  /**
   * Paměť workeru: pro každý rod rok (jeho dne), za který už úloha proběhla. Los padá 1. 1.,
   * v témže roce se rod nemusí opakovat (worker úlohu jinak volá každou minutu); skok času hráče
   * přes 1. 1. změní jeho rok, a rod se tak znovu losuje. Chybí – úloha běží pokaždé (idempotentně).
   */
  done?: ChristianityMemory;
}

/** Paměť roční úlohy křesťanství v procesu workeru (`ChristianityDeps.done`). */
export interface ChristianityMemory {
  /** Id rodu → rok, za který už rod losoval. */
  houseYears: Map<string, number>;
  /** Rok světa, za který už úloha prošla NPC rody (při shodě se NPC rody ani nenačítají). */
  npcYear: number | null;
}

/**
 * Roční úloha světa (christianity.md – Objev křesťanství, Křest rodu): rodu, který křesťanství
 * nezná, přehraje los objevu od prvního 1. 1. po založení do letošního roku (`discoveryYear`);
 * padne-li, zapíše rok objevu, hráči pošle upozornění a do kroniky vsi vojvody zápis. Rod hráče losuje
 * do roku svého dne (den světa + posun času hráče), NPC rod do roku dne světa (návrh Clauda). NPC rod, který
 * zná, se pokřtí 1. 1. roku křtu (`npcBaptismYear`) – událost do jeho vsí a den křtu v rodu.
 * Opakovaný běh nic nezdvojí (podmíněné zápisy rodu, jedinečné `ref` schránky).
 */
export async function advanceChristianity(
  deps: ChristianityDeps,
  today: number,
): Promise<{ known: number; npcBaptized: number }> {
  const worldYear = dateOfDayIndex(today).year;
  const result = { known: 0, npcBaptized: 0 };
  const memory = deps.done;
  const houses = await playerHouses(deps);
  if (memory?.npcYear !== worldYear) houses.push(...(await npcHouses(deps, houses)));
  for (const house of houses) {
    // rod hráče žije v dni hráče, NPC rod ve dni světa
    const houseToday =
      house.kind === 'player' && house.playerId !== null
        ? playerDay(today, await deps.offsets.offsetOf(house.playerId))
        : today;
    const year = dateOfDayIndex(houseToday).year;
    if (memory?.houseYears.get(house.id) === year) continue;
    await advanceHouse(deps, house, houseToday, year, result);
    memory?.houseYears.set(house.id, year);
  }
  if (memory) memory.npcYear = worldYear;
  return result;
}

/** Los objevu a křest jednoho rodu k roku `year` jeho dne `houseToday`. */
async function advanceHouse(
  deps: ChristianityDeps,
  house: House,
  houseToday: number,
  year: number,
  result: { known: number; npcBaptized: number },
): Promise<void> {
  const seed = houseFaithSeed(deps.worldSeed, house.id);
  let knownYear = house.christianityKnownYear;
  if (knownYear === null) {
    knownYear = discoveryYear(seed, firstDiscoveryYear(deps.dayOf(house.createdAt)), year);
    if (knownYear === null) return;
    // souběžný worker mohl zapsat dřív – stejný rok (los je pevný), oznámí jen ten, kdo zapsal
    if (await deps.houses.markChristianityKnown(house.id, knownYear)) {
      result.known++;
      await announceKnown(deps, house, knownYear, houseToday);
    }
  }
  if (house.kind !== 'npc' || house.baptizedDay !== null) return;
  const baptismYear = npcBaptismYear(seed, knownYear);
  if (baptismYear > year) return;
  const day = dayIndexOf({ year: baptismYear, month: 1, day: 1 });
  // nejdřív vsi (jedinečný `ref` – opakování po pádu workeru nic nezdvojí), pak rod
  await sendRodBaptized(deps, house.id, day);
  if (await deps.houses.markBaptized(house.id, day)) result.npcBaptized++;
}

/**
 * Křest rodu `houseId` ve dni `day` do schránky všech jeho vsí (událost `rod-baptized`; ves zapíše
 * den křtu a ve vsi vojvody ho pokřtí – `baptizeVillage`). Vsi rodu: NPC rod – vsi, které spravuje
 * (`npc`, jeho hlava v nich je vojvodou vsi); hráč – všechny vsi jeho aktivních sídel, i ty, které
 * za něj řídí NPC rod (příznak tam platí až po konci NPC rodu – `rodBaptized`), a ves vojvody
 * (`House.lord`) dostane `lord`. Jedinečný `ref` – opakování nic nezdvojí.
 */
export async function sendRodBaptized(
  deps: RodBaptizedDeps,
  houseId: string,
  day: number,
): Promise<void> {
  const house = await deps.houses.byId(houseId);
  if (!house) return;
  const npc = house.kind === 'npc';
  for (const villageId of await houseVillageIds(deps, house)) {
    const lord = !npc && house.lord?.villageId === villageId;
    try {
      await deps.villages.inbox.post({
        villageId,
        day,
        ref: `rod-baptized:${houseId}:${villageId}`,
        body: {
          kind: 'rod-baptized',
          houseId,
          ...(npc ? { npc: true as const } : {}),
          ...(lord ? { lord: true as const } : {}),
        },
      });
    } catch {
      // ves mezitím zanikla – zpráva nemá kam
    }
  }
}

/** Živé rody hráčů (umístěné i odříznuté). */
async function playerHouses(deps: ChristianityDeps): Promise<House[]> {
  const houses = [
    ...(await deps.houses.playerHousesSince(new Date(0))),
    ...(await deps.houses.waitingNewcomers()),
  ];
  const seen = new Set<string>();
  return houses.filter((h) => !seen.has(h.id) && seen.add(h.id));
}

/** Živé NPC rody (každý je vazalem – povýšení), kromě už načtených rodů `known`. */
async function npcHouses(deps: ChristianityDeps, known: House[]): Promise<House[]> {
  const seen = new Set(known.map((h) => h.id));
  const npcs: House[] = [];
  for (const v of await deps.vassalages.allActive()) {
    if (seen.has(v.vassalHouseId)) continue;
    seen.add(v.vassalHouseId);
    const house = await deps.houses.byId(v.vassalHouseId);
    if (house?.kind === 'npc' && house.endedAt === null) npcs.push(house);
  }
  return npcs;
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
  const ids: string[] = [];
  for (const settlement of await deps.settlements.listActive(house.playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) ids.push(village.id);
  }
  return ids;
}
