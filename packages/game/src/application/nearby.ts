import {
  isVillageAsleep,
  type NearbyVillage,
  type VillageEvent,
  type VillageNearby,
} from '../domain/village';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import { cellDistance, ringCells } from '../domain/world/placement';
import { isIsolated, type Settlement, type SettlementRepository } from './settlements';
import { settlementCell, stepToward } from './shipments';
import type { VillageRecord, VillageRepository } from './villages';

// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): ves dostane v pevné dny kalendáře snímek vsí
// na 8 sousedních mapách událostí schránky `nearby`. Zapíše ji dopočet vsi (`updateVillage`) před
// dopočtem přes den obnovy – přes podport úložiště vsí `villages.nearby` (jako bariéra `holds`) –,
// takže den snímku nezávisí na tom, po jakých kouscích se ves dopočítá. Ves ho použije na začátku
// dne události (`applyNearby`) a rozhodnutí podle okolí zůstanou uvnitř dne.

/**
 * Technická mez, ne pravidlo – okolí je snímek, který se celý nahradí (Rozhodnutí 1): stav vsi
 * neroste a sousedé se nečtou každý den; mez určuje jen, jak rychle se ves dozví o nové vsi
 * za kopcem (proto ne v `rules*.ts`). Dny obnovy jsou dny kalendáře dělitelné touto mezí.
 */
export const NEARBY_REFRESH_DAYS = 30;

/**
 * Jak dlouho schránka drží použité snímky okolí, než je úklid smaže (`inbox.pruneNearby`) –
 * technická mez, ne pravidlo (proto ne v `rules*.ts`). Použitý snímek už nic nečte, ale jeho řádek
 * drží `ref` `nearby:<ves>:<den>` proti dalšímu zápisu téhož dne: dopočet se starším stavem vsi
 * (souběh webu a workeru) by ho po smazání zapsal znovu na nejbližší nespočtený den. Rok je daleko
 * za každou dávkou dopočtu; schránka tak drží nejvýš ~12 snímků na ves místo ~12 za každý herní rok.
 */
export const NEARBY_KEEP_DAYS = 365;

/** Dny obnovy okolí v `(afterDay, toDay]` – pevné dny kalendáře dělitelné `NEARBY_REFRESH_DAYS`. */
export function nearbyDays(afterDay: number, toDay: number): number[] {
  const days: number[] = [];
  const first = (Math.floor(afterDay / NEARBY_REFRESH_DAYS) + 1) * NEARBY_REFRESH_DAYS;
  for (let day = first; day <= toDay; day += NEARBY_REFRESH_DAYS) days.push(day);
  return days;
}

/**
 * Co potřebuje sken okolí: otisky vsí (jméno, spí-li ves), souhrny vsí (svobodní) a sídla (poloha,
 * držitelé políček).
 */
export interface NearbyDeps {
  villages: Pick<VillageRepository, 'stampsOf' | 'digestsOf'>;
  settlements: Pick<SettlementRepository, 'find' | 'holderAt' | 'listActive'>;
}

/** Pořadí id vsí podle kódů znaků – nezávisí na jazyku prostředí (na rozdíl od `localeCompare`). */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Vsi na 8 sousedních mapách vsi `home` (i vsi téhož hráče), jak jsou v okamžiku dotazu – bez
 * načtení stavů: sídla na prstenci 1 (`holderAt`, `listActive` – archivované sídlo ani sídlo
 * s čekajícím převodem mezi nimi není), jejich otisky (`stampsOf` – jméno; spící ves chybí)
 * a souhrny (`digestsOf` – svobodní `singles`, markets.md – Rozhodnutí plánu 3, bod 11; souhrn bez
 * nich nebo ves bez souhrnu současné verze = nikdo). `cells` a `firstStep` jako přehled trhu
 * a výprava; řazeno podle `cells`, pak `villageId`. Odříznutý rod (newcomers.md – místní mřížka
 * není mapa světa) a archivované sídlo – prázdné.
 */
export async function nearbyVillages(
  deps: NearbyDeps,
  home: VillageRecord,
): Promise<NearbyVillage[]> {
  const settlement = await deps.settlements.find(home.settlementId);
  if (!settlement || isIsolated(settlement)) return [];
  const center = settlementCell(settlement);
  // sídla na prstenci mají políčko mapy světa – odříznuté sídlo (jen místní mřížka) mezi nimi
  // nebývá, kontrola přes odříznutí (`crossesIsolation`) tu proto není potřeba
  const cellOf = new Map<string, GridCell>();
  const activeOf = new Map<string, Settlement[]>();
  for (const cell of ringCells(center, 1)) {
    const holder = await deps.settlements.holderAt(cell);
    if (holder === null) continue;
    let active = activeOf.get(holder);
    if (!active) {
      active = await deps.settlements.listActive(holder);
      activeOf.set(holder, active);
    }
    for (const s of active) {
      if (s.worldCell && sameCell(s.worldCell, cell)) cellOf.set(s.id, cell);
    }
  }
  if (cellOf.size === 0) return [];
  const stamps = (await deps.villages.stampsOf([...cellOf.keys()])).filter(
    (stamp) => cellOf.has(stamp.settlementId) && !stamp.asleep,
  );
  if (stamps.length === 0) return [];
  const singlesOf = new Map(
    (await deps.villages.digestsOf(stamps.map((stamp) => stamp.id))).map((d) => [
      d.id,
      d.digest.singles,
    ]),
  );
  const villages: NearbyVillage[] = [];
  for (const stamp of stamps) {
    const cell = cellOf.get(stamp.settlementId)!;
    const singles = singlesOf.get(stamp.id);
    villages.push({
      villageId: stamp.id,
      name: stamp.name,
      cells: cellDistance(center, cell),
      firstStep: stepToward(center, cell),
      ...(singles && singles.length > 0 ? { singles: structuredClone(singles) } : {}),
    });
  }
  return villages.sort((a, b) => a.cells - b.cells || compareIds(a.villageId, b.villageId));
}

/**
 * Port: okolí vsi v pevné dny – volitelný podport úložiště vsí (`VillageRepository.nearby`), jako
 * bariéra `holds`. Úložiště v DB ho má vždy (`nearbyRefresh`); chybí (testy jádra, kalibrace) –
 * dopočet okolí nezapisuje a ves simuluje jako dřív (zlaté otisky).
 */
export interface NearbyRefresh {
  /**
   * Před dopočtem vsi `home` přes dny `(afterDay, toDay]`: na každý den obnovy (`nearbyDays`), na
   * který ve schránce (`pending` – události těchto dnů) ještě událost `nearby` není, zapíše snímek
   * okolí (`nearbyVillages` – v okamžiku zápisu) s `ref` `nearby:<ves>:<den>`. Čekající událost je
   * čerstvé okolí – sken se neopakuje. Spící ves nic. Po zápisu smaže použité snímky starší než
   * `NEARBY_KEEP_DAYS` (`inbox.pruneNearby` – dny ≤ `afterDay − NEARBY_KEEP_DAYS`). true = něco
   * se zapsalo (zápis zvedl verzi vsi).
   */
  post(
    home: VillageRecord,
    afterDay: number,
    toDay: number,
    pending: readonly VillageEvent[],
  ): Promise<boolean>;
}

/** Podport `villages.nearby` nad úložištěm vsí (schránka, otisky) a sídel. */
export function nearbyRefresh(
  deps: NearbyDeps & { villages: Pick<VillageRepository, 'inbox' | 'stampsOf' | 'digestsOf'> },
): NearbyRefresh {
  return {
    async post(home, afterDay, toDay, pending): Promise<boolean> {
      if (isVillageAsleep(home.state)) return false;
      const due = nearbyDays(afterDay, toDay).filter(
        (day) => !pending.some((e) => e.day === day && e.body.kind === 'nearby'),
      );
      if (due.length === 0) return false;
      const villages = await nearbyVillages(deps, home);
      let posted = false;
      for (const day of due) {
        const nearby: VillageNearby = {
          day,
          self: { villageId: home.id, name: home.name },
          villages,
        };
        const event = await deps.villages.inbox.post({
          villageId: home.id,
          day,
          ref: `nearby:${home.id}:${day}`,
          body: { kind: 'nearby', nearby },
        });
        if (event !== null) posted = true;
      }
      // úklid: ~1× za dobu obnovy – jen když přibyl snímek
      if (posted) await deps.villages.inbox.pruneNearby(home.id, afterDay - NEARBY_KEEP_DAYS);
      return posted;
    },
  };
}
