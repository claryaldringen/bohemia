// Osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob; Martin 27. 10. 2026: „Osivo ze
// zásob při setí“; pravidla návrh Clauda). Setí bere osivo ze zásob v den setí dílu – obilí
// (ozim, jař) ze zásob obilí, luštěniny ze zásob luštěnin, len seje semeno z vlastní úrody.
// Sklizeň pak osivo neodečítá. Osivo bez cíle osevu (Martin 9. 11. 2026): na začátku okna setí si
// ves odloží osivo na všechny díly na řadě, nejvýš zásoby bez přežívací zásoby do žní
// (`seedKeepKg`); hromada osiva okna (`sowingSeedDay`) drží každý den jen osivo ideálního zbytku
// okna – za nestihnutou část dne se osivo hned vrátí do jídla (`settleSowingSeed`), na konci okna
// všechno nezaseté. Od listopadu do konce února drží ves zimní osivo na jarní díly na řadě
// (Martin 9. 11. 2026: „Tak když věděli, že mají málo jídla, proč žrali jak protržení?“). Práce z doby před osivem ze zásob (`CropWork.seedKg` chybí) má zasetou část
// odpuštěnou – převod `withSeedForgiven`.
import { craftCoverage } from './crafts';
import { grainAheadForOutlookKg, grainKeepPerDay, villageFoodNeed, type DietInput } from './diet';
import { winterEstimateLosses } from './disasters';
import { fieldFoodShare } from './field-food';
import { drawGrainPits } from './grain-pits';
import { dateOfDayIndex } from '../calendar';
import { ableTeams, oxenStrength } from './oxen';
import { ageGroup, laborPerDay } from './people';
import { PLOUGH_HA_PER_DAY } from './plough';
import { fieldWorkPerHa } from './productivity';
import { CROP_WINDOWS, PEAK_CAPACITY_SHARE, SEED_BUYING, SEED_STORES, STARVATION } from './rules';
import { windowDaysLeft } from './sowing';
import { nextSowing, onTurn } from './rotation';
import { sheavesOutlook } from './threshing';
import { springSowingExtended, springSowingHeld } from './weather-effects';
import type {
  Crop,
  CropWork,
  FarmSeason,
  FieldPart,
  SeedKg,
  SowingSeed,
  VillageState,
} from './types';
import {
  cropSeedPerHa,
  daysUntilFoodHarvest,
  seasonCrops,
  sownShare,
  windowEndOf,
} from './year-plan';
import { baseMealInput } from './meal-input';
import { partsByIdOf } from './parts-by-id';

const M2_PER_HA = 10_000;
/** Méně osiva (kg) nebo práce (člověkodny) se nepočítá – zaokrouhlení. */
const EPSILON = 1e-9;

/** Počasí vsi (dlouhá zima drží a prodlužuje setí jařin). */
type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

/** Zásoby, ze kterých se seje. */
export type SeedStore = keyof SeedKg;

/**
 * Ze kterých zásob plodina seje: luštěniny (jen dosévané díly starších vsí – fields.md, Luštěniny,
 * zrušeno) z luštěnin, len ze své úrody (null), jinak obilí.
 */
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
 * Osivo zakladatelů v lhůtě (kg – fields.md, Zásoby a nasycení, Start; FOUNDERS_STORES): rezerva
 * osiva (`reservedSeedKg`) před `reservedSeedUntilDay` – slouží na víc osevů, jídlem není. Jinak 0.
 */
export function keptSeedKg(
  state: Pick<VillageState, 'storesKg' | 'reservedSeedKg' | 'reservedSeedUntilDay'>,
  day: number,
): number {
  const until = state.reservedSeedUntilDay;
  return until !== undefined && day < until ? reservedSeedKg(state) : 0;
}

/**
 * Denní potřeba z pole (kg obilí) a dny do sklizně, se kterými počítá přídělový systém
 * (`daysUntilFoodHarvest`). Podíl pole větší z dlouhodobého (`fieldFoodShare`) a včerejší stravy –
 * po úbytku stád jí ves obilí víc.
 */
function fieldNeedUntilHarvest(
  state: VillageState,
  day: number,
): { perDayKg: number; days: number } {
  const shares = state.diet?.shares;
  const share = Math.max(fieldFoodShare(state), (shares?.grain ?? 0) + (shares?.legumes ?? 0));
  const perDayKg = villageFoodNeed(state, day) * share;
  const days = daysUntilFoodHarvest(
    state.season,
    state.parts,
    day,
    perDayKg,
    winterEstimateLosses(state, day),
  );
  return { perDayKg, days };
}

/** Potřeba z pole do sklizně, se kterou počítá přídělový systém (kg obilí). */
export function foodUntilHarvestKg(state: VillageState, day: number): number {
  const need = fieldNeedUntilHarvest(state, day);
  return need.perDayKg * need.days;
}

/**
 * Přežívací zásoba do žní (kg obilí – zásoby i snopy; fields.md, Úroda, Osivo ze zásob; Martin
 * 6. 11. 2026: „Musí zasít“, výpočet ze stravy návrh Clauda): nejmenší zrno, při kterém celé
 * nasycení do žní nedovede nahromaděný hlad (`starvationDays`) k prahu úmrtí nejcitlivější skupiny
 * ve vsi (STARVATION.threshold – děti a starší 12, dospělí 20) bez SEED_STORES.marginDays; s osivem
 * jen na setí (`reservedSeedKg`) ani k prahu, od kterého ho ves sní
 * (SEED_BUYING.eatFromStarvationDays) – ostatní zrno je osivo. Pod STARVATION.fedFrom přibude za
 * den (fedFrom − příděl) / fedFrom dne hladu, ves tedy unese `slack` dní hladu: příděl energie do
 * žní aspoň fedFrom × (1 − slack / dny do žní). Obilí na něj spočte výhled jídla dne
 * (`grainAheadForOutlookKg`) s celou ostatní stravou ze vstupu jídla (`baseMealInput` – mléko stád
 * do sklizně, maso v zásobě a ze zimní porážky, sýr, vejce, luštěniny a ovoce); k tomu ztráty
 * skladováním do žní (zrno leží v průměru půl doby do žní). `input` – vstup jídla dne bez osiva,
 * je-li po ruce (`dayMealInput`); jinak se spočte. Ves bez lidí 0.
 */
export function seedKeepKg(state: VillageState, day: number, input?: DietInput): number {
  if (state.people.length === 0) return 0;
  let limit = Infinity;
  for (const person of state.people) {
    limit = Math.min(limit, STARVATION.threshold[ageGroup(person, day)]);
  }
  if (reservedSeedKg(state) > EPSILON) limit = Math.min(limit, SEED_BUYING.eatFromStarvationDays);
  const slack = Math.max(0, limit - SEED_STORES.marginDays - (state.starvationDays ?? 0));
  const meal = input ?? baseMealInput(state, day, craftCoverage(state, day).pottery, 1);
  const days = Math.max(1, meal.daysToHarvest);
  const ration = STARVATION.fedFrom * Math.max(0, 1 - slack / days);
  if (ration <= EPSILON) return 0;
  const aheadKg = grainAheadForOutlookKg(meal, ration);
  return aheadKg / grainKeepPerDay(meal) ** ((days + 1) / 2);
}

/** Osivo obilí, které letošní plán už vzal (kg – plány s osivem ze zásob). */
export function grainSeedTakenKg(state: Pick<VillageState, 'season'>): number {
  if (!state.season) return 0;
  let kg = 0;
  for (const { crop, work } of seasonCrops(state.season)) {
    if (seedStore(crop) === 'grain') kg += work.seedKg ?? 0;
  }
  return kg;
}

/** Osivo obilí odložené v okně setí, které dnes běží (kg – `VillageState.sowingSeed`, nejvýš zásoby). */
export function sowingSeedKg(state: Pick<VillageState, 'storesKg' | 'sowingSeed'>): number {
  return Math.min(Math.max(0, state.sowingSeed?.kg ?? 0), Math.max(0, state.storesKg));
}

/**
 * Obilí, které ves nejí (kg – fields.md, Osivo bez cíle osevu): hromada osiva okna setí
 * (`sowingSeedKg`) a osivo, které ves má jen na setí (`reservedSeedKg` – osadníků, koupené,
 * zakladatelů), nejvýš zásoby obilí.
 */
export function uneatenSeedKg(
  state: Pick<VillageState, 'storesKg' | 'sowingSeed' | 'reservedSeedKg'>,
): number {
  return Math.min(Math.max(0, state.storesKg), sowingSeedKg(state) + reservedSeedKg(state));
}

/**
 * Kolik hektarů jařiny nebo ozimu ves za den zorá a zaseje (výhled zásob – `pileSowsKg`; návrh
 * Clauda 9. 11. 2026): spřežení, která dnes orají (`ableTeams`), po PLOUGH_HA_PER_DAY podle síly
 * volů; ves bez spřežení zkope a zaseje motykou všechnou prací dospělých (PEAK_CAPACITY_SHARE ÷
 * kopání a setí hektaru).
 */
function sowingHaPerDay(
  state: VillageState,
  day: number,
  crop: SowingCrop,
  toolCoverage: number,
): number {
  const teams = ableTeams(state, day);
  if (teams > 0) return teams * PLOUGH_HA_PER_DAY * oxenStrength(state, day);
  const perHa =
    fieldWorkPerHa('dig', toolCoverage, crop) + fieldWorkPerHa('sow', toolCoverage, crop);
  if (perHa <= EPSILON) return Infinity;
  const labor = state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  return (labor * PEAK_CAPACITY_SHARE) / perHa;
}

/**
 * Osivo hromady, které ves ještě zaseje (kg – výhled zásob, fields.md – Výhled zásob k sklizni;
 * návrh Clauda 9. 11. 2026): v okně setí nejvýš osivo plochy, kterou ves dnešním tempem
 * (`sowingHaPerDay`) zorá a zaseje do konce okna (`sowingDaysLeft`) – stejné tempo jako průběžné
 * vracení osiva (`settleSowingSeed`); v zimě (zimní osivo) osivo jarních dílů, které ves stihne
 * za celé jarní okno. Zbytek hromady se do jídla vrátí – výhled ho počítá jako zásobu.
 */
export function pileSowsKg(state: VillageState, day: number, toolCoverage: number): number {
  const pile = state.sowingSeed;
  const kg = sowingSeedKg(state);
  if (!pile || kg <= EPSILON) return 0;
  const days = pile.beforeWindow
    ? windowDaysLeft(day, CROP_WINDOWS.spring.sow)
    : sowingDaysLeft(state, pile.crop, day);
  const ha = sowingHaPerDay(state, day, pile.crop, toolCoverage) * days;
  return Math.min(kg, ha * cropSeedPerHa(pile.crop));
}

/**
 * Obilí, které zásoby k příští sklizni nekrmí (kg – výhled zásob `storesOutlook`; fields.md,
 * Výhled zásob k sklizni): s hromadou osiva (okno setí i zimní osivo) osivo, které ves ještě
 * zaseje (`pileSowsKg`), a osivo jen na setí (`reservedSeedKg`); bez hromady nic – jen osivo
 * zakladatelů v lhůtě (`keptSeedKg`) jídlem není nikdy. Nejvýš zásoby obilí.
 */
export function seedOutsideFoodKg(state: VillageState, day: number, toolCoverage: number): number {
  const pile = state.sowingSeed
    ? Math.min(
        Math.max(0, state.storesKg),
        pileSowsKg(state, day, toolCoverage) + reservedSeedKg(state),
      )
    : 0;
  return Math.max(pile, keptSeedKg(state, day));
}

/**
 * Kolik osiva smí dnes do země (kg – fields.md, Úroda, Osivo ze zásob, a Osivo bez cíle osevu).
 * Obilí: hromada osiva okna (`sowingSeedKg`), nebo všechno běžné zrno nad přežívací zásobu do žní
 * (`keepKg` – `seedKeepKg`), je-li ho víc – ves, která seje rychleji než ideální denní díl, nebo
 * přílohy 70–95 % až po dílech na řadě, sejí z toho, co zbude nad přežívací zásobou. Osivo, které
 * ves má jen na setí (`reservedSeedKg` – zakladatelů, osadníků a koupené), smí do země vždy.
 * Luštěniny (jen dosévané díly starších vsí) jen ze své zásoby.
 */
export function sowableSeedKg(
  state: Pick<VillageState, 'storesKg' | 'legumesKg' | 'reservedSeedKg' | 'sowingSeed'>,
  store: SeedStore,
  keepKg: number,
): number {
  if (store === 'legumes') return storeKg(state, 'legumes');
  const reserved = reservedSeedKg(state);
  const ordinary = Math.max(0, storeKg(state, 'grain') - reserved);
  const free = Math.max(Math.min(sowingSeedKg(state), ordinary), ordinary - keepKg);
  return reserved + Math.max(0, free);
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
 * Podíly plánů jaře, luštěnin a lnu, které ves v jarním okně setí připraví (kopání, orba, vracení
 * přílohu – fields.md, Osivo ze zásob; oprava, návrh Clauda 2. 11. 2026): nákup osiva 1. 3. už
 * proběhl a nezasetý díl na konci dubna vypadne i s rozkopáním (`returnPart`), takže vesničané
 * připraví jen díly, na které osivo mají – vzaté, které smí do země (`sowableSeedKg`), a zrno
 * a luštěniny ve snopech, které výmlat ještě dá. Osivo zásob se dělí mezi plodiny v pořadí plánu.
 * Ozim (do jaře přejde i se zkopanou částí) a podzimní příprava jaře (osivo může přijít nákupem
 * 1. 3.) se neomezují – v mapě chybí.
 */
export function seedPrepShares(
  state: VillageState,
  day: number,
  partsById: ReadonlyMap<number, FieldPart>,
): Map<CropWork, number> {
  const shares = new Map<CropWork, number>();
  const season = state.season;
  if (!season) return shares;
  const month = dateOfDayIndex(day).month;
  let pool: SeedKg | null = null;
  for (const { crop, work } of seasonCrops(season)) {
    const store = seedStore(crop);
    if (crop === 'winter' || store === null || work.seedKg === undefined) continue;
    if (!CROP_WINDOWS[crop].sow.some(([from, to]) => month >= from && month <= to)) continue;
    const total = workSeedKg(work, partsById, crop);
    if (total <= EPSILON) continue;
    if (!pool) {
      const keepKg = seedKeepKg(state, day);
      pool = {
        grain: sowableSeedKg(state, 'grain', keepKg) + (state.sheaves?.grainKg ?? 0),
        legumes: sowableSeedKg(state, 'legumes', keepKg) + (state.sheaves?.legumesKg ?? 0),
      };
    }
    const cover = Math.min(Math.max(0, total - work.seedKg), pool[store]);
    pool[store] -= cover;
    shares.set(work, Math.min(1, (work.seedKg + cover) / total));
  }
  return shares;
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
 * bez osiva, které už plodina vzala; luštěniny (dosévané díly starších vsí) jen ze zásoby
 * luštěnin; obilí z otevřené obilné jámy, když zrno mimo jámy nestačí (`drawGrainPits`). Obilí
 * napřed z hromady osiva okna (`VillageState.sowingSeed`), pak z běžného zrna nad přežívací zásobu
 * do žní (`keepKg` – `seedKeepKg`), pak z osiva, které ves má jen na setí (`reservedSeedKg` – zakladatelů, osadníků, koupené), a teprve pak ze zbytku zásob
 * (oprava, návrh Clauda 2. 11. 2026 – osivo zakladatelů má přečkat roky, kdy děti dorůstají, ne se
 * vyset jako první; fields.md – Osivo ze zásob). Vrací vzaté osivo (kg).
 */
export function takeSeed(
  state: VillageState,
  work: CropWork,
  crop: Crop,
  partsById: ReadonlyMap<number, FieldPart>,
  keepKg: number,
): number {
  const store = seedStore(crop);
  if (work.seedKg === undefined || store === null) return 0;
  const due = sownShare(work) * workSeedKg(work, partsById, crop) - work.seedKg;
  if (due <= EPSILON) return 0;
  // luštěniny jen ze své zásoby (výměnu za obilí zrušilo vyřazení luštěnin z polí)
  const legumes = store === 'legumes' ? Math.min(due, storeKg(state, 'legumes')) : 0;
  if (legumes > 0) state.legumesKg = (state.legumesKg ?? 0) - legumes;
  const grain = store === 'grain' ? Math.min(due, storeKg(state, 'grain')) : 0;
  if (grain > 0) {
    const reserved = reservedSeedKg(state);
    const ordinary = Math.max(0, state.storesKg) - reserved;
    const pile = Math.min(sowingSeedKg(state), Math.max(0, ordinary));
    const fromPile = Math.min(grain, pile);
    if (state.sowingSeed) state.sowingSeed.kg = Math.max(0, pile - fromPile);
    // osivo jen na setí jde do dílů, až když hromada a běžné zrno nad zásobu nestačí
    if (reserved > 0) {
      const aboveKeep = Math.max(0, ordinary - pile - keepKg);
      const fromReserved = Math.min(reserved, Math.max(0, grain - fromPile - aboveKeep));
      const left = reserved - fromReserved;
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

/** Obilí okna setí – ozim, nebo jař. */
export type SowingCrop = SowingSeed['crop'];

/** Den patří k oknu setí plodiny – i dny, kdy ho dlouhá zima drží, a dohra setí jařin do 14. 5. */
function inSowingWindow(state: WeatherState, crop: SowingCrop, day: number): boolean {
  return (
    windowEndOf(CROP_WINDOWS[crop].sow, dateOfDayIndex(day).month) !== null ||
    springSowingExtended(state, day, crop)
  );
}

/**
 * Okno setí, které dnes běží (fields.md – Osivo bez cíle osevu): ozim v září–říjnu, jař
 * v březnu–dubnu a po dlouhé zimě do 14. 5. (`springSowingExtended`). Jinak null.
 */
export function sowingWindowCrop(state: WeatherState, day: number): SowingCrop | null {
  if (inSowingWindow(state, 'winter', day)) return 'winter';
  return inSowingWindow(state, 'spring', day) ? 'spring' : null;
}

/**
 * Dny setí okna od `day` do jeho konce včetně – bez dní, kdy dlouhá zima setí jařin drží
 * (`springSowingHeld`). Mimo okno 0.
 */
export function sowingDaysLeft(state: WeatherState, crop: SowingCrop, day: number): number {
  let days = 0;
  for (let d = day; inSowingWindow(state, crop, d); d++) {
    if (!springSowingHeld(state, d, crop)) days++;
  }
  return days;
}

/**
 * Osivo na všechny díly na řadě pro obilí okna (kg – fields.md, Osivo bez cíle osevu; „na řadě“
 * návrh Clauda): nezasetý podíl letošní práce plodiny a díly mimo letošní
 * práci na řadě (`nextSowing`) – pro ozim první osev a díly po jaři, pro jař i díly po ozimu.
 * Přílohy 70–95 % a nouzové přílohy se nepočítají – sejí se z toho, co zbude nad přežívací zásobu.
 */
export function windowSeedNeedKg(
  state: Pick<VillageState, 'season' | 'parts'>,
  crop: SowingCrop,
): number {
  let kg = 0;
  const inSeason = new Set<number>();
  const season = state.season;
  if (season) {
    let byId: ReadonlyMap<number, FieldPart> | null = null;
    for (const { crop: workCrop, work } of seasonCrops(season)) {
      for (const id of work.partIds) inSeason.add(id);
      if (workCrop !== crop || work.harvestedKg !== null) continue;
      byId ??= partsByIdOf(state.parts);
      kg += workSeedKg(work, byId, crop) * (1 - sownShare(work));
    }
  }
  const onTurnParts: FieldPart[] = [];
  for (const part of state.parts) {
    if (inSeason.has(part.id)) continue;
    const kind = nextSowing(part);
    if (crop === 'winter' ? kind === 'first' || kind === 'winter' : onTurn(kind)) {
      onTurnParts.push(part);
    }
  }
  return kg + partsSeedKg(onTurnParts, crop);
}

/**
 * Den patří k zimě mezi podzimním a jarním oknem setí (listopad – únor, podle CROP_WINDOWS): ves
 * drží zimní osivo (`sowingSeedDay`).
 */
function winterSeedMonth(day: number): boolean {
  const month = dateOfDayIndex(day).month;
  const autumnEnd = Math.max(...CROP_WINDOWS.winter.sow.map(([, to]) => to));
  const springStart = Math.min(...CROP_WINDOWS.spring.sow.map(([from]) => from));
  return month > autumnEnd || month < springStart;
}

/**
 * Osivo nad přežívací zásobu do žní (kg): nejvýš `wantKg`, zásoby a snopy, které ves vymlátí, bez
 * přežívací zásoby (`seedKeepKg`), a nejvýš vymlácené zrno – bez osiva jen na setí.
 */
function pileKg(state: VillageState, day: number, wantKg: number): number {
  const ordinary = Math.max(0, state.storesKg - reservedSeedKg(state));
  if (wantKg <= EPSILON || ordinary <= EPSILON) return 0;
  const aboveKeep = ordinary + sheavesOutlook(state, day).grainKg - seedKeepKg(state, day);
  return Math.max(0, Math.min(wantKg, aboveKeep, ordinary));
}

/**
 * Hromada osiva okna ráno (fields.md – Osivo bez cíle osevu; Martin 9. 11. 2026: „Na všechny
 * díly. Bude hladovět max ty dva měsíce – to není hladovění, ale spíš půst“; mutuje stav). V první
 * den okna si ves zapíše osivo na všechny díly na řadě (`windowSeedNeedKg`) a dny setí okna; každý
 * den pak drží osivo ideálního zbytku okna – celé osivo × zbývající dny setí / dny okna, nejvýš
 * osivo dílů, které ještě zasít zbývá –, bez osiva, které má jen na setí (`reservedSeedKg`).
 * Nejvýš zásoby a snopy, které ves vymlátí, bez přežívací zásoby do žní (`seedKeepKg`), a nejvýš
 * vymlácené zrno – osivo přibývá, jak přibývá vymláceného zrna. Od listopadu do konce února drží
 * zimní osivo (fields.md – Zimní osivo; Martin 9. 11. 2026: „Tak když věděli, že mají málo jídla,
 * proč žrali jak protržení? Zaslouží si chcípnout“): každý den osivo na jarní díly na řadě
 * (`windowSeedNeedKg` jaře) se stejnými mezemi – ves jí jen zbytek a šetří už v zimě; 1. 3. ho
 * převezme hromada jarního okna. Od konce jarního okna do září se osivo zvlášť nedrží (hromada
 * zmizí – na konci okna se nezaseté vrátí do zásob).
 */
export function sowingSeedDay(state: VillageState, day: number): void {
  const crop = sowingWindowCrop(state, day);
  if (crop === null) {
    if (!winterSeedMonth(day)) {
      delete state.sowingSeed;
      return;
    }
    const totalKg = windowSeedNeedKg(state, 'spring');
    const kg = pileKg(state, day, totalKg - reservedSeedKg(state));
    state.sowingSeed = { crop: 'spring', totalKg, days: 0, kg, beforeWindow: true };
    return;
  }
  let pile = state.sowingSeed;
  if (!pile || pile.crop !== crop || pile.beforeWindow) {
    pile = {
      crop,
      totalKg: windowSeedNeedKg(state, crop),
      days: Math.max(1, sowingDaysLeft(state, crop, day)),
      kg: 0,
    };
    state.sowingSeed = pile;
  }
  const ideal = (pile.totalKg * Math.min(pile.days, sowingDaysLeft(state, crop, day))) / pile.days;
  const want = Math.min(ideal, windowSeedNeedKg(state, crop)) - reservedSeedKg(state);
  pile.kg = pileKg(state, day, want);
}

/**
 * Osivo za nestihnutou část dne zpět do jídla (fields.md – Osivo bez cíle osevu; Martin 9. 11.
 * 2026: „reálně voli stihnou míň… třeba jen 80 %. 20 % osiva tak zbyde a může se vrátit do
 * jídla.“; mutuje stav): po práci dne hromada drží nejvýš osivo ideálního zbytku okna od zítřka.
 * Ves, která dnes zasela méně než ideální denní díl, má rozdíl hned v jídle; v poslední den okna
 * se vrátí všechno nezaseté.
 */
export function settleSowingSeed(state: VillageState, day: number): void {
  const pile = state.sowingSeed;
  // zimní osivo se nevrací – v zimě se nic neseje
  if (!pile || pile.beforeWindow) return;
  const left = Math.min(pile.days, sowingDaysLeft(state, pile.crop, day + 1));
  const ideal = (pile.totalKg * left) / pile.days;
  pile.kg = Math.max(0, Math.min(pile.kg, ideal - reservedSeedKg(state)));
}

/**
 * Převod (fields.md – Osivo bez cíle osevu): plán z doby cíle osevu nese osivo čekajících dílů
 * a osivo do roční potřeby (`seedWaitingKg`, `seedFloorKg`) – obojí zmizí, osivo drží hromada okna.
 * Jednou, idempotentně: stav bez nich se nemění; vstupní stav nemění.
 */
export function withoutSeedTarget(state: VillageState): VillageState {
  const legacy = (season: FarmSeason | null): boolean =>
    season !== null && ('seedWaitingKg' in season || 'seedFloorKg' in season);
  if (!legacy(state.season) && !legacy(state.threshingSeason)) return state;
  const strip = (season: FarmSeason | null): FarmSeason | null => {
    if (!season || !legacy(season)) return season;
    const rest: FarmSeason & { seedWaitingKg?: unknown; seedFloorKg?: unknown } = { ...season };
    delete rest.seedWaitingKg;
    delete rest.seedFloorKg;
    return rest;
  };
  return { ...state, season: strip(state.season), threshingSeason: strip(state.threshingSeason) };
}
