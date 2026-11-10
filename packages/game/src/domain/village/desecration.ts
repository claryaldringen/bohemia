// Posvátná místa a hřbitov po křtu rodu (christianity.md – Co křest rodu umožní): pokřtěný rod
// smí kácet posvátné duby a dubové háje a na jejich místě stavět a orat, plný nebo nepoužívaný
// hřbitov smí zbourat (zaorat). Platí jen pro stavby a pole hráče – vesničané (dřevo, milíře),
// pěšiny, vozová síť i správce posvátná místa dál obcházejí (`sacredSitesOf`). Každé zničené
// místo zapíše `faith.desecrated` – pohané z něj mají nespokojenost (christianity.md – Štěstí).

import { dateOfDayIndex, dayIndexOf, monthLength } from '../calendar';
import { obstacleIndex, type ObstacleLayer } from '../landscape';
import { freePlaces, isCemeteryBuilding } from './cemetery';
import { rodBaptized } from './faith';
import type { PlacementVillage } from './placement-types';
import { FAITH } from './rules-faith';
import { sacredSitesOf, type GroveSite, type SacredSites } from './sacred';
import type { Cemetery, VillageState } from './types';

/** Žádná posvátná místa – stavbám pokřtěného rodu nic nebrání. */
const NO_SACRED_SITES: SacredSites = {
  oaks: [],
  groves: [],
  oaksByTile: new Map(),
  groveByTile: new Map(),
  protectedTrees: new Set(),
};

/**
 * Posvátná místa, která brání stavbě nebo poli hráče ve vsi `village`: ves pokřtěného rodu
 * (`sacredFree` – jen umístění hráčem, `playerPlacementVillage`) žádná, jinak duby a háje vrstvy.
 */
export function sacredSitesFor(
  village: Pick<PlacementVillage, 'sacredFree'> | null,
  layer: ObstacleLayer,
): SacredSites {
  return village?.sacredFree ? NO_SACRED_SITES : sacredSitesOf(layer);
}

/** Stromy, které stavba nebo pole hráče nekácí: pokřtěnému rodu žádné (`sacredSitesFor`). */
export function protectedTreesFor(
  village: Pick<PlacementVillage, 'sacredFree'> | null,
  layer: ObstacleLayer,
): ReadonlySet<number> {
  return sacredSitesFor(village, layer).protectedTrees;
}

/** Zničené posvátné místo: posvátný dub, dubový háj, nebo slovanský hřbitov. */
export type DesecratedSite = 'oak' | 'grove' | 'cemetery';

/**
 * Zapíše zničené posvátné místo (mutuje stav – volat na klonu): +1 do `faith.desecrated` (dub a háj
 * do `oaksOrGroves`, hřbitov do `cemeteries`) a událost kroniky.
 */
export function recordDesecration(state: VillageState, site: DesecratedSite, day: number): void {
  const faith = (state.faith ??= {});
  const desecrated = (faith.desecrated ??= { oaksOrGroves: 0, cemeteries: 0 });
  if (site === 'cemetery') {
    desecrated.cemeteries++;
    state.chronicle.push({ day, kind: 'cemetery-ploughed' });
  } else {
    desecrated.oaksOrGroves++;
    state.chronicle.push({ day, kind: 'sacred-felled', site });
  }
}

/** Háj, kterému strom `id` vrstvy patří (strom na čtverci háje), jinak null. */
function groveOfTree(sites: SacredSites, layer: ObstacleLayer, id: number): GroveSite | null {
  const index = obstacleIndex(layer, id);
  if (index < 0) return null;
  const half = (layer.size * layer.cellSizeM) / 2;
  const tileOf = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  return (
    sites.groveByTile.get(tileOf(layer.z[index]!) * layer.size + tileOf(layer.x[index]!)) ?? null
  );
}

/**
 * Zapíše posvátná místa, která stavba nebo pole hráče právě odstranily (`ids` – překážky odstraněné
 * teď, už zapsané v `clearedObstacles`): posvátný dub jednou za strom, háj jednou – jen když z něj
 * dřív nezmizel žádný strom. Mutuje stav (volat na klonu). Vesničané, cesty ani správce posvátné
 * stromy neodstraňují, takže každý posvátný strom mezi odstraněnými je stavba hráče.
 */
export function recordFelledSacred(
  state: VillageState,
  layer: ObstacleLayer,
  ids: Iterable<number>,
  day: number,
): void {
  const sites = sacredSitesOf(layer);
  const fresh = new Set<number>();
  for (const id of ids) if (sites.protectedTrees.has(id)) fresh.add(id);
  if (fresh.size === 0) return;
  const oaks = new Set(sites.oaks.map((o) => o.id));
  const groves = new Map<number, GroveSite>();
  for (const id of [...fresh].sort((a, b) => a - b)) {
    if (oaks.has(id)) {
      recordDesecration(state, 'oak', day);
      continue;
    }
    const grove = groveOfTree(sites, layer, id);
    if (grove) groves.set(grove.id, grove);
  }
  if (groves.size === 0) return;
  // háj, ze kterého už dřív zmizel strom, je zapsaný – počítá se jednou
  const earlier = new Set(
    (state.clearedObstacles ?? []).map((c) => c.id).filter((id) => !fresh.has(id)),
  );
  for (const grove of [...groves.values()].sort((a, b) => a.id - b.id)) {
    const touched = [...sites.protectedTrees].some(
      (id) => earlier.has(id) && groveOfTree(sites, layer, id) === grove,
    );
    if (!touched) recordDesecration(state, 'grove', day);
  }
}

/**
 * Posvátná místa, která akce hráče odstranila: překážky v `after.clearedObstacles`, které v `before`
 * nebyly (mutuje `after` – nový stav akce).
 */
export function recordFelledSacredSince(
  before: Pick<VillageState, 'clearedObstacles'>,
  after: VillageState,
  layer: ObstacleLayer,
  day: number,
): void {
  const known = new Set((before.clearedObstacles ?? []).map((c) => c.id));
  const fresh = (after.clearedObstacles ?? []).filter((c) => !known.has(c.id)).map((c) => c.id);
  recordFelledSacred(after, layer, fresh, day);
}

/**
 * Posvátná místa, která v den `day` odstranilo zakládání polí, sadů a hřbitovů hráče (simulace dne
 * – volá se po dni, mutuje stav): překážky odstraněné v ten den (`clearedObstacles` přibývají na
 * konci podle dne, stačí projít konec seznamu). Jen ves pokřtěného rodu – jinde posvátné stromy
 * nikdo neodstraňuje.
 */
export function recordFelledSacredOn(state: VillageState, layer: ObstacleLayer, day: number): void {
  if (!rodBaptized(state)) return;
  const cleared = state.clearedObstacles ?? [];
  const today: number[] = [];
  for (let i = cleared.length - 1; i >= 0 && cleared[i]!.day >= day; i--) {
    if (cleared[i]!.day === day) today.push(cleared[i]!.id);
  }
  if (today.length > 0) recordFelledSacred(state, layer, today, day);
}

/**
 * Den posledního pohřbu na hřbitově: nejpozdější mohyla; hřbitov jen se starými hroby (bez dne)
 * nebo prázdný – den dokončení (návrh Clauda); rozestavěný null.
 */
export function lastBurialDay(cemetery: Pick<Cemetery, 'mounds' | 'builtDay'>): number | null {
  let last = cemetery.builtDay;
  for (const m of cemetery.mounds ?? []) if (last === null || m.day > last) last = m.day;
  return last;
}

/** Je den `day` aspoň `years` celých let po dni `from`? */
function yearsSince(from: number, day: number, years: number): boolean {
  // den před začátkem světa (starý hrob před rokem 500) je jistě dávno – kalendář ho nezná
  if (from < 0) return true;
  const d = dateOfDayIndex(from);
  const year = d.year + years;
  return (
    day >= dayIndexOf({ year, month: d.month, day: Math.min(d.day, monthLength(year, d.month)) })
  );
}

/**
 * Smí hřbitov zmizet – zbourat ho, zaorat (christianity.md – Co křest rodu umožní)? Jen pokřtěný
 * rod, hotový hřbitov bez rozšíření ve stavbě, a to plný (žádné volné místo), nebo nepoužívaný –
 * poslední pohřeb před aspoň `FAITH.cemeteryUnusedYears` lety.
 */
export function cemeteryMayGo(
  state: Pick<VillageState, 'faith' | 'nobles'>,
  cemetery: Cemetery,
  day: number,
): boolean {
  if (!rodBaptized(state) || isCemeteryBuilding(cemetery)) return false;
  if (freePlaces(cemetery) === 0) return true;
  const last = lastBurialDay(cemetery);
  return last !== null && yearsSince(last, day, FAITH.cemeteryUnusedYears);
}

/** Důvod u kurzoru – hřbitov, který pokřtěný rod ještě zbourat nesmí. */
export const CEMETERY_IN_USE = 'Hřbitov ještě slouží.';
