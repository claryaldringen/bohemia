import { cloneState } from './clone';
import { moveParts } from './land-taken';
import type { CropWork, FarmSeason, SeasonCrop, VillageState } from './types';
import { TASK_ORDER, putSeasonCrop } from './year-plan';

// Převod (fields.md – Osevní postup po dílech, bod 3 – Starší vsi, 9. 11. 2026): hospodářský rok
// z doby, kdy ves dělila díly na nutné a nad potřebu, má ozim a jař dvakrát – druhou plodinu
// s příznakem `surplus` a výběr dílů s roční potřebou z pole (`selection.floorKg`). Díly jsou teď
// jedna fronta: plodina nad potřebu se slije s plodinou téhož obilí i s hotovou prací a osivem.

/** Plodina uložená s příznakem dílů nad potřebu. */
type LegacyCrop = SeasonCrop & { surplus?: unknown };
/** Výběr dílů uložený s roční potřebou z pole. */
type LegacySelection = NonNullable<FarmSeason['selection']> & { floorKg?: unknown };

/** Hospodářský rok z doby dílů nad potřebu. */
function legacy(season: FarmSeason | null): boolean {
  if (!season) return false;
  const selection = season.selection as LegacySelection | undefined;
  return (
    season.crops.some((c: LegacyCrop) => c.surplus !== undefined) ||
    (selection !== undefined && 'floorKg' in selection)
  );
}

/** Co z plodiny už šlo do snopů – pozice žně a úroda (sklizená plodina celá). */
function sheavedOf(work: CropWork): { harvest: number; kg: number } {
  if (work.harvestedKg !== null) return { harvest: work.done.harvest, kg: work.harvestedKg };
  return work.sheaved ?? { harvest: 0, kg: 0 };
}

/**
 * Slije plodinu `from` do `into` sečtením práce (mutuje `into`): díly `from` napřed (jako
 * `moveParts`), práce úloh, orba, osivo a vozy se sečtou. Úroda, která už šla do snopů, se sečte –
 * obě sklizené zůstanou sklizené, jinak je hotová žeň obou „ve snopech“ a zbytek se žne dál.
 * Pro plodiny po začátku žní, kde `moveParts` (dílčí práce podle úseků) nejde.
 */
function sumInto(into: SeasonCrop, from: SeasonCrop): void {
  const sheaved = { harvest: 0, kg: 0 };
  for (const work of [into, from]) {
    const own = sheavedOf(work);
    sheaved.harvest += own.harvest;
    sheaved.kg += own.kg;
  }
  const harvested = into.harvestedKg !== null && from.harvestedKg !== null;
  into.partIds = [...from.partIds, ...into.partIds];
  for (const task of TASK_ORDER) {
    into.required[task] += from.required[task];
    into.done[task] += from.done[task];
  }
  const reclaim = [...(from.reclaimIds ?? []), ...(into.reclaimIds ?? [])];
  if (reclaim.length > 0) into.reclaimIds = reclaim;
  if (into.seedKg !== undefined || from.seedKg !== undefined) {
    into.seedKg = (into.seedKg ?? 0) + (from.seedKg ?? 0);
  }
  if (from.hauled !== undefined) into.hauled = (into.hauled ?? 0) + from.hauled;
  if (from.seedHauled !== undefined) into.seedHauled = (into.seedHauled ?? 0) + from.seedHauled;
  if (into.plough && from.plough) {
    into.plough.partIds = [...from.plough.partIds, ...into.plough.partIds];
    into.plough.required += from.plough.required;
    into.plough.done += from.plough.done;
    into.plough.weight += from.plough.weight;
    const sod = [...(from.plough.sodIds ?? []), ...(into.plough.sodIds ?? [])];
    if (sod.length > 0) into.plough.sodIds = sod;
    // pásy obou plodin se po žních nepoužijí – díly bez pásů (jako plány starších vsí)
    delete into.plough.bands;
  }
  if (harvested) {
    into.harvestedKg = sheaved.kg;
    delete into.sheaved;
    return;
  }
  into.harvestedKg = null;
  if (sheaved.harvest > 0 || sheaved.kg > 0) into.sheaved = sheaved;
  else delete into.sheaved;
}

/** Hospodářský rok bez dílů nad potřebu (mutuje kopii `season` ve stavu `state`). */
function mergeSeason(state: VillageState, season: FarmSeason): void {
  const selection = season.selection as LegacySelection | undefined;
  if (selection) delete selection.floorKg;
  for (const crop of ['winter', 'spring'] as const) {
    const from = season.crops.find((c: LegacyCrop) => c.crop === crop && c.surplus !== undefined);
    if (!from) continue;
    delete (from as LegacyCrop).surplus;
    const into = season.crops.find((c: LegacyCrop) => c.crop === crop && c !== from);
    season.crops = season.crops.filter((c) => c !== from);
    // jen nad potřebu – plodina se stane plodinou roku na svém místě v pořadí
    if (!into) {
      putSeasonCrop(season, from);
      continue;
    }
    const clean =
      into.harvestedKg === null &&
      from.harvestedKg === null &&
      into.sheaved === undefined &&
      from.sheaved === undefined;
    // před žněmi i s hotovou prací po úsecích (jako dřív povýšení dílu nad potřebu na nutný)
    if (clean) moveParts(state, season, from, into, [...from.partIds], state.lastDay, 1);
    else sumInto(into, from);
  }
}

/**
 * Ves uložená s díly nad potřebu (plodina `surplus`, `selection.floorKg`) je má jednou frontou
 * (fields.md – Osevní postup po dílech, bod 3): ozim a jař nad potřebu se slijí s ozimem a jaří
 * i s hotovou prací, osivem a úrodou ve snopech – letošního roku i roku u výmlatu. Jednou,
 * idempotentně: stav bez nich se nemění; vstupní stav nemění. Práce, kterou převod přepočítává
 * (`moveParts` – jen když se přenáší i mezi orbou a motykou), bere plné pokrytí nástroji.
 */
export function withoutSurplusCrops(state: VillageState): VillageState {
  if (!legacy(state.season) && !legacy(state.threshingSeason)) return state;
  const next: VillageState = {
    ...state,
    season: cloneState(state.season),
    threshingSeason: cloneState(state.threshingSeason),
  };
  for (const season of [next.season, next.threshingSeason]) {
    if (legacy(season)) mergeSeason(next, season!);
  }
  return next;
}
