import { cellDistance, type LanguageGroup, type OfferCandidate } from '../domain/world';
import { ageYears, type GridCell } from '../domain/village';
import type { House, HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';
import type { VillageDigestRecord } from './villages';

// Adresář rodů (vassalage.md – Přehled pána): co smí hráč o cizím rodu vidět. Rodokmeny šlechty
// jsou veřejné (Martin 2. 11. 2026) – muži rodu od 16 let a jejich věk; zásoby, výzbroj, koně ani
// lidi vsí cizí hráč nevidí, proto `PublicHouse` nese jen tato pole a nic se do ní nekopíruje ze
// souhrnů plošně.

/** Od kolika let je muž rodu v cizím rodokmenu vidět (vassalage.md – Přehled pána). */
const PUBLIC_MAN_MIN_AGE = 16;

/** Záznam adresáře: živý rod, jeho sídelní sídlo a souhrny jeho vsí. */
export interface DirectoryEntry {
  house: House;
  seat: GridCell;
  digests: VillageDigestRecord[];
}

/** Port adresáře rodů. */
export interface WorldDirectory {
  /**
   * Nejbližší živé rody hráčů (kromě `excludeHouseId`) podle vzdálenosti jejich sídelního sídla
   * od `center` (Čebyšev), při shodě podle id rodu; nejvýš `limit`. Souhrny nesou vsi rodu
   * v aktivních sídlech (jen ty, které mají souhrn současné verze).
   */
  nearestHouses(center: GridCell, limit: number, excludeHouseId: string): Promise<DirectoryEntry[]>;
  /** Záznamy živých rodů hráčů s danými id (pořadí nezaručeno; rod bez sídelního sídla chybí). */
  entriesOf(houseIds: string[]): Promise<DirectoryEntry[]>;
  /**
   * Záznamy živých odříznutých rodů hráčů (bez umístění na mapu světa, newcomers.md) s danými id;
   * `seat` je místní poloha sídla. Jen pro vlastní panel rodu a žádost nováčka u pána – adresář
   * a nabídka je nevidí.
   */
  isolatedEntriesOf(houseIds: string[]): Promise<DirectoryEntry[]>;
  /**
   * Kandidáti nabídky pánů (newcomers.md): živé umístěné rody hráčů s počtem živých vsí (souhrn
   * současné verze, ves nevymřelá ani opuštěná); odříznuté rody ne.
   */
  offerCandidates(): Promise<OfferCandidate[]>;
}

/** Cizí rod, jak ho vidí hráč. */
export interface PublicHouse {
  houseId: string;
  /** Jméno hlavy rodu, pokud je známé. */
  lordName: string | null;
  seat: GridCell;
  /** Vzdálenost sídelních sídel (políčka mřížky). */
  distance: number;
  men: {
    name: string | null;
    age: number;
    villageName: string;
    /** Ves a osoba v jejím stavu – v panelu vlastního rodu klik přepne na ves, stolec a praporec. */
    villageId: string;
    personId: number;
  }[];
  /** Počet aktivních vsí rodu. */
  villages: number;
  /** Jazyková skupina rodu (veřejná) – ikona v adresáři, pořadí nabídky pánů. */
  language: LanguageGroup;
}

/** Veřejný pohled na rod z jeho záznamu v adresáři; vzdálenost se měří od `center`. */
export function publicHouseOf(entry: DirectoryEntry, center: GridCell, today: number): PublicHouse {
  const awake = entry.digests.filter(
    (d) => d.digest.extinctDay === undefined && d.digest.abandonedDay === undefined,
  );
  const lord = entry.house.lord;
  const lordName =
    lord === null
      ? null
      : (awake
          .find((d) => d.id === lord.villageId)
          ?.digest.publicLineMen.find((m) => m.id === lord.personId)?.name ?? null);
  return {
    houseId: entry.house.id,
    lordName,
    seat: { x: entry.seat.x, y: entry.seat.y },
    distance: cellDistance(center, entry.seat),
    men: awake.flatMap((d) =>
      d.digest.publicLineMen
        .map((m) => ({
          name: m.name ?? null,
          age: ageYears(m.bornDay, today),
          villageName: d.name,
          villageId: d.id,
          personId: m.id,
        }))
        .filter((m) => m.age >= PUBLIC_MAN_MIN_AGE),
    ),
    villages: awake.length,
    language: entry.house.language,
  };
}

/** Rody v okolí sídelního sídla diváka (vlastní rod vynechán); divák bez rodu nebo sídla – nic. */
export async function housesNear(
  deps: {
    houses: HouseRepository;
    settlements: SettlementRepository;
    worldDirectory: WorldDirectory;
  },
  input: { viewerId: string; today: number; limit: number },
): Promise<PublicHouse[]> {
  const own = await deps.houses.activeOf(input.viewerId);
  const seat = await deps.settlements.findSeat(input.viewerId);
  if (!own || !seat?.worldCell) return [];
  const center = seat.worldCell;
  const entries = await deps.worldDirectory.nearestHouses(center, input.limit, own.id);
  return entries
    .map((entry) => publicHouseOf(entry, center, input.today))
    .sort((a, b) => a.distance - b.distance || (a.houseId < b.houseId ? -1 : 1))
    .slice(0, input.limit);
}
