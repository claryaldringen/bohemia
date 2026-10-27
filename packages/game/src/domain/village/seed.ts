// Osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob; Martin 27. 10. 2026: „Osivo ze
// zásob při setí“; pravidla návrh Clauda). Setí bere osivo ze zásob v den setí dílu – obilí
// (ozim, jař, obilí nad potřebu) ze zásob obilí, luštěniny ze zásob luštěnin, len seje semeno
// z vlastní úrody. Sklizeň pak osivo neodečítá. Ves dá do země jen zrno nad jídlo na příděl
// do žní (SEED_STORES – osivo do roční potřeby má přednost) a osivo, které na setí ještě čeká,
// nejí, dokud by příděl do žní neklesl pod tytéž prahy (`seedReserve`). Práce z doby před osivem
// ze zásob (`CropWork.seedKg` chybí) má zasetou část odpuštěnou – převod `withSeedForgiven`.
import { villageFoodNeed } from './diet';
import { winterEstimateLosses } from './disasters';
import { fieldFoodShare } from './field-food';
import { drawGrainPits } from './grain-pits';
import { SEED_STORES } from './rules';
import type { Crop, CropWork, FieldPart, SeedKg, VillageState } from './types';
import { cropSeedPerHa, daysUntilFoodHarvest, seasonCrops, sownShare } from './year-plan';

const M2_PER_HA = 10_000;
/** Méně osiva (kg) nebo práce (člověkodny) se nepočítá – zaokrouhlení. */
const EPSILON = 1e-9;

/** Zásoby, ze kterých se seje. */
export type SeedStore = keyof SeedKg;

/** Ze kterých zásob plodina seje: luštěniny z luštěnin, len ze své úrody (null), jinak obilí. */
export function seedStore(crop: Crop): SeedStore | null {
  if (crop === 'flax') return null;
  return crop === 'legume' ? 'legumes' : 'grain';
}

/** Osivo dílů plodiny (kg) – plocha × osivo na hektar. */
export function partsSeedKg(parts: Iterable<FieldPart>, crop: Crop): number {
  let ha = 0;
  for (const part of parts) ha += part.areaM2 / M2_PER_HA;
  return ha * cropSeedPerHa(crop);
}

/** Osivo celého plánu plodiny (kg) – díly, které ve stavu chybí, nic. */
export function workSeedKg(
  work: Pick<CropWork, 'partIds'>,
  partsById: ReadonlyMap<number, FieldPart>,
  crop: Crop,
): number {
  const parts: FieldPart[] = [];
  for (const id of work.partIds) {
    const part = partsById.get(id);
    if (part) parts.push(part);
  }
  return partsSeedKg(parts, crop);
}

/**
 * Převod (fields.md – Osivo ze zásob, Převod; návrh Clauda): práce z doby před osivem ze zásob
 * (`CropWork.seedKg` chybí) má osivo zaseté části odpuštěné – sklizeň ho neodečte a ves ho
 * nezaplatí dvakrát (postaru při sklizni a novým osevem ze zásob). Nezasetá část vezme osivo ze
 * zásob při setí jako nový plán. Jednou, idempotentně: plán, kde ho mají všechny práce, se nemění.
 */
export function withSeedForgiven(state: VillageState): VillageState {
  const season = state.season;
  if (!season || season.crops.every((work) => work.seedKg !== undefined)) return state;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  return {
    ...state,
    season: {
      ...season,
      crops: season.crops.map((work) =>
        work.seedKg !== undefined
          ? work
          : { ...work, seedKg: sownShare(work) * workSeedKg(work, partsById, work.crop) },
      ),
    },
  };
}

function storeKg(state: Pick<VillageState, 'storesKg' | 'legumesKg'>, store: SeedStore): number {
  return Math.max(0, store === 'grain' ? state.storesKg : (state.legumesKg ?? 0));
}

/**
 * Osivo ve zásobách obilí, které ves má jen na setí (kg – `VillageState.reservedSeedKg`, nejvýš
 * zásoby obilí): přinesené osadníky a koupené u sousedů (fields.md – Osivo pro ves bez zásob).
 */
export function reservedSeedKg(state: Pick<VillageState, 'storesKg' | 'reservedSeedKg'>): number {
  return Math.min(Math.max(0, state.reservedSeedKg ?? 0), Math.max(0, state.storesKg));
}

/**
 * Potřeba z pole do sklizně, se kterou počítá přídělový systém (kg obilí – `daysUntilFoodHarvest`);
 * z ní si ves nechá na jídlo příděl SEED_STORES.floorRation nebo keepRation. Podíl pole větší
 * z dlouhodobého (`fieldFoodShare`) a včerejší stravy – po úbytku stád jí ves obilí víc.
 */
export function foodUntilHarvestKg(state: VillageState, day: number): number {
  const shares = state.diet?.shares;
  const share = Math.max(fieldFoodShare(state), (shares?.grain ?? 0) + (shares?.legumes ?? 0));
  const fieldNeed = villageFoodNeed(state, day) * share;
  const days = daysUntilFoodHarvest(
    state.season,
    state.parts,
    day,
    fieldNeed,
    winterEstimateLosses(state, day),
  );
  return fieldNeed * days;
}

/** Osivo obilí, které letošní plán už vzal (kg – plány s osivem ze zásob). */
function grainSeedTakenKg(state: Pick<VillageState, 'season'>): number {
  if (!state.season) return 0;
  let kg = 0;
  for (const { crop, work } of seasonCrops(state.season)) {
    // osivo nad potřebu se do nároku nutných dílů nepočítá (`recordSeedPlan` je z něj vynechává)
    if (work.surplus) continue;
    if (seedStore(crop) === 'grain') kg += work.seedKg ?? 0;
  }
  return kg;
}

/**
 * Kolik osiva smí dnes do země (kg). Obilí: osivo do roční potřeby (`FarmSeason.seedFloorKg` bez
 * vzatého) ze zrna nad příděl SEED_STORES.floorRation potřeby do sklizně (`foodKg`), ostatní
 * nad příděl keepRation; `floor` false (obilí nad potřebu) jen nad keepRation. Luštěniny celé
 * (ves je nejí místo obilí – strop ve stravě) a k nim obilí nad keepRation – chybějící osivo
 * luštěnin ves vymění u sousedů za obilí (návrh Clauda; ves bez luštěnin je tak může začít sít).
 * Osivo, které ves má jen na setí (`reservedSeedKg` – osadníků a koupené), smí do země vždy a do
 * nutných dílů napřed; prahy přídělu platí pro zbytek zásob obilí.
 */
export function sowableSeedKg(
  state: Pick<VillageState, 'storesKg' | 'legumesKg' | 'season' | 'reservedSeedKg'>,
  store: SeedStore,
  foodKg: number,
  floor = true,
): number {
  const reserved = reservedSeedKg(state);
  const grain = storeKg(state, 'grain') - reserved;
  const grainAboveKeep = Math.max(0, grain - SEED_STORES.keepRation * foodKg);
  // luštěnin chybějících na osivo ves vymění u sousedů za obilí, které nesní
  if (store === 'legumes') return storeKg(state, 'legumes') + grainAboveKeep + reserved;
  if (!floor) return grainAboveKeep;
  const floorLeft = Math.max(
    0,
    (state.season?.seedFloorKg ?? 0) - grainSeedTakenKg(state) - reserved,
  );
  const aboveFloor = Math.max(0, grain - SEED_STORES.floorRation * foodKg);
  return reserved + Math.max(grainAboveKeep, Math.min(floorLeft, aboveFloor));
}

/**
 * Kolik práce setí plodiny (člověkodny) dnes osivo dovolí – zasetý podíl nejvýš (vzaté osivo +
 * osivo, které smí do země) / osivo celého plánu. Práce bez osiva ze zásob (převod) a len bez
 * omezení. `sowable` = osivo, které smí do země, po zásobách (`sowableSeedKg`).
 */
export function seedSowCap(
  work: CropWork,
  crop: Crop,
  partsById: ReadonlyMap<number, FieldPart>,
  sowable: SeedKg,
): number {
  const store = seedStore(crop);
  if (work.seedKg === undefined || store === null) return Infinity;
  const total = workSeedKg(work, partsById, crop);
  if (total <= EPSILON) return Infinity;
  const share = Math.min(1, (work.seedKg + sowable[store]) / total);
  return Math.max(0, share * work.required.sow - work.done.sow);
}

/**
 * Kolik osiva (kg) plodina dnes vezme, když zaseje `remaining` práce setí – ze zásob, které smí
 * do země; pro odečet od `sowable` dalších plodin téhož dne.
 */
export function seedUseKg(
  work: CropWork,
  crop: Crop,
  partsById: ReadonlyMap<number, FieldPart>,
  remaining: number,
  sowable: number,
): number {
  if (work.seedKg === undefined || work.required.sow <= EPSILON) return 0;
  const share = Math.min(1, (work.done.sow + remaining) / work.required.sow);
  const want = Math.max(0, share * workSeedKg(work, partsById, crop) - work.seedKg);
  return Math.min(want, sowable);
}

/**
 * Vezme ze zásob osivo zasetého podílu (mutuje stav a `work`): zasetý podíl × osivo celého plánu
 * bez osiva, které už plodina vzala; luštěniny napřed ze zásoby luštěnin, chybějící za obilí
 * (výměna u sousedů); obilí z otevřené obilné jámy, když zrno mimo jámy nestačí
 * (`drawGrainPits`); nutné díly berou obilí napřed z osiva, které ves má jen na setí
 * (`reservedSeedKg`). Vrací vzaté osivo (kg).
 */
export function takeSeed(
  state: VillageState,
  work: CropWork,
  crop: Crop,
  partsById: ReadonlyMap<number, FieldPart>,
): number {
  const store = seedStore(crop);
  if (work.seedKg === undefined || store === null) return 0;
  const due = sownShare(work) * workSeedKg(work, partsById, crop) - work.seedKg;
  if (due <= EPSILON) return 0;
  // luštěniny napřed ze své zásoby, chybějící vymění u sousedů za obilí
  const legumes = store === 'legumes' ? Math.min(due, storeKg(state, 'legumes')) : 0;
  if (legumes > 0) state.legumesKg = (state.legumesKg ?? 0) - legumes;
  const grain = Math.min(due - legumes, storeKg(state, 'grain'));
  if (grain > 0) {
    // osivo osadníků a koupené jde do nutných dílů – díl nad potřebu seje jen ze zbytku zásob
    const surplus = 'surplus' in work && work.surplus === true;
    const reserved = surplus ? 0 : reservedSeedKg(state);
    if (reserved > 0) {
      const left = reserved - Math.min(reserved, grain);
      if (left > EPSILON) state.reservedSeedKg = left;
      else delete state.reservedSeedKg;
    }
    state.storesKg -= grain;
    drawGrainPits(state);
  }
  // k plánu se přičte jen skutečně vzaté osivo – zbytek se vezme, až zásoba přibude
  work.seedKg += legumes + grain;
  return legumes + grain;
}

/**
 * Osivo, které na setí ještě čeká (kg po zásobách): nezasetý podíl plánů s osivem ze zásob
 * a díly vybrané, které na čelo práce teprve přijdou (`FarmSeason.seedWaitingKg`); s `neededOnly`
 * bez prací nad potřebu.
 */
export function seedAheadKg(
  state: Pick<VillageState, 'season' | 'parts'>,
  neededOnly = false,
): SeedKg {
  const ahead: SeedKg = { grain: 0, legumes: 0 };
  const season = state.season;
  if (!season) return ahead;
  let byId: Map<number, FieldPart> | null = null;
  for (const { crop, work } of seasonCrops(season)) {
    // `neededOnly` – jen nutné díly (bez obilí nad potřebu – nákup osiva u sousedů)
    if (neededOnly && work.surplus) continue;
    const store = seedStore(crop);
    if (work.seedKg === undefined || store === null || work.harvestedKg !== null) continue;
    const sown = sownShare(work);
    if (sown >= 1 - EPSILON) continue;
    // rozsetá plodina: osivo celého plánu z vzatého a zasetého podílu (díly bez hledání)
    if (sown > 0.01 && work.seedKg > EPSILON) {
      ahead[store] += Math.max(0, (work.seedKg * (1 - sown)) / sown);
      continue;
    }
    byId ??= new Map(state.parts.map((p) => [p.id, p]));
    ahead[store] += Math.max(0, workSeedKg(work, byId, crop) - work.seedKg);
  }
  ahead.grain += season.seedWaitingKg?.grain ?? 0;
  ahead.legumes += season.seedWaitingKg?.legumes ?? 0;
  return ahead;
}

/**
 * Osivo, které ves nejí (kg po zásobách – diet.md, fields.md – Osivo ze zásob): čekající osivo
 * obilí (`seedAheadKg`) a osivo luštěnin, na které jejich zásoba nestačí (vymění se za obilí) –
 * jen to, které smí do země (`sowableSeedKg` – pod prahy přídělu ho ves sní). Luštěniny ves jí
 * dál (do stropu ve stravě) – chybějící osivo luštěnin dá obilí. Osivo, které ves má jen na setí
 * (`reservedSeedKg` – osadníků a koupené), nesní nikdy.
 */
export function seedReserve(
  state: Pick<VillageState, 'season' | 'parts' | 'storesKg' | 'legumesKg' | 'reservedSeedKg'>,
  foodKg: number,
): SeedKg {
  const ahead = seedAheadKg(state);
  const legumesShort = Math.max(0, ahead.legumes - storeKg(state, 'legumes'));
  const sowable = Math.min(ahead.grain + legumesShort, sowableSeedKg(state, 'grain', foodKg));
  return { grain: Math.max(sowable, reservedSeedKg(state)), legumes: 0 };
}
