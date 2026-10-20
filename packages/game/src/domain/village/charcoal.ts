import { dateOfDayIndex } from '../calendar';
import { length2, obstacleIndex, type ObstacleLayer } from '../landscape';
import { distanceFactor } from './fields';
import { buildingLocalToWorld, fellTrees, obstacleChangesAt, plantOnStump } from './obstacles';
import { monthInWindow } from './orchard';
import {
  BEECH_PLANTING,
  CART_JOBS,
  CHARCOAL_KILN,
  CRAFT_PRODUCTION,
  MILIR,
  ORCHARD_PLANTING_WINDOWS,
} from './rules';
import type {
  CharcoalKiln,
  CraftStocks,
  Dwelling,
  Position,
  VillageState,
  Workshop,
  WorkshopActivity,
} from './types';
import type { Walk } from './paths/walking';
import {
  availableTrees,
  claimedObstacles,
  fellingCost,
  fellingsOf,
  isBeech,
  isTreeStanding,
  nearestMatureTrees,
} from './wood';

// Uhlíř (crafts.md – Uhlíř, Martin 18. 10. 2026; rešerše 2026-10-18-charcoal.md): pálí jen buky
// po dávkách do milíře – vybere nejbližší dospělé buky (vyhradí je), skácí je a připraví dřevo,
// postaví milíř a pálí ho 8 dní (hlídá ve dne i v noci). Leží-li dávka blízko dílny, pálí u ní;
// dál staví milíř v lese u dávky a za chůzi platí přirážku vzdálenosti. Na pařezy skácených buků
// sází mladé buky (obnova lesa). Milíř stojí vždy (crafts.md – Milíř stojí vždy, Martin
// 19. 10. 2026): uhlíř má jeden milíř, vypálený je zásobou uhlí a uhlíř z něj vytahá uhlí kovářům,
// jak ho spotřebují – rozebraný zmizí a uhlíř staví nový; s vypáleným milířem sází, nebo pomáhá
// vsi. Krok dne mutuje stav (volat na klonu), den po dni – na kouscích nezávisí.

/** Tolerance proti chybám desetinných čísel u odvedené práce. */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků práce uhlíře za den (sázení, buky, fáze milíře). */
const MAX_STEPS = 64;
/**
 * Vytahání a třídění uhlí z vypáleného milíře – čd na kg: z 2 čd na buk po 120 kg (vytahání,
 * třídění a odnos) bez odnosu v koších (CART_JOBS.charcoal.carryShare) – ten dělá kovářova
 * domácnost, nebo vůz se sedlákem (crafts.md – Uhlí a ruda kováře).
 */
const DRAW_MAN_DAYS_PER_KG =
  (CHARCOAL_KILN.drawManDaysPerTree / CRAFT_PRODUCTION.charcoalKgPerTree) *
  (1 - CART_JOBS.charcoal.carryShare);

/** Střed milíře u uhlířovy zemnice ve světě (MILIR.offset v souřadnicích modelu). */
export function homeKilnCenter(position: Position): { x: number; z: number } {
  const [x, z] = buildingLocalToWorld(position, MILIR.offset.x, MILIR.offset.z);
  return { x, z };
}

/** Kolik uhlí dá milíř (kg) – 120 kg z každého buku dávky. */
export function kilnYieldKg(kiln: Pick<CharcoalKiln, 'trees'>): number {
  return kiln.trees.length * CRAFT_PRODUCTION.charcoalKgPerTree;
}

/**
 * Uhlí, které ve vypáleném milíři zbývá (kg; crafts.md – Milíř stojí vždy); milíř, který se teprve
 * chystá nebo pálí, 0. Vypálený milíř ze starší vsi (bez `charcoalKg`) má celou dávku.
 */
export function kilnCharcoalKg(
  kiln: Pick<CharcoalKiln, 'stage' | 'trees' | 'charcoalKg'> | null | undefined,
): number {
  if (!kiln || kiln.stage !== 'draw') return 0;
  return Math.max(0, kiln.charcoalKg ?? kilnYieldKg(kiln));
}

/** Podíl uhlí, které ve vypáleném milíři zbývá, 0–1 (scéna – milíř se zmenšuje); jinak 0. */
export function kilnCharcoalShare(
  kiln: Pick<CharcoalKiln, 'stage' | 'trees' | 'charcoalKg'> | null | undefined,
): number {
  const total = kiln ? kilnYieldKg(kiln) : 0;
  return total > 0 ? Math.min(1, kilnCharcoalKg(kiln) / total) : 0;
}

/**
 * Zásoba uhlí vsi (kg; crafts.md – Milíř stojí vždy): uhlí u kováře (`crafts.charcoalKg` – co
 * uhlíř donesl a kovář ještě nespálil, koupené) a uhlí ve vypálených milířích uhlířů.
 */
export function charcoalStockKg(state: Pick<VillageState, 'dwellings' | 'crafts'>): number {
  let kg = state.crafts?.charcoalKg ?? 0;
  for (const d of state.dwellings) kg += kilnCharcoalKg(d.workshop?.kiln);
  return kg;
}

/**
 * Vezme ze zásoby vsi `kg` uhlí (mutuje stav; prodej sousedovi – trade.md): napřed u kováře, pak
 * z vypálených milířů v pořadí id dílen – milíř se tím rozebírá (vytahají ho nosiči výpravy),
 * rozebraný zmizí a uhlíř postaví nový. Vrátí, kolik uhlí vzal.
 */
export function takeCharcoal(state: VillageState, kg: number): number {
  let left = Math.max(0, kg);
  const crafts = state.crafts;
  if (crafts && crafts.charcoalKg > 0) {
    const loose = Math.min(left, crafts.charcoalKg);
    crafts.charcoalKg -= loose;
    left -= loose;
  }
  const burners = state.dwellings
    .filter((d) => kilnCharcoalKg(d.workshop?.kiln) > 0)
    .sort((a, b) => a.id - b.id);
  for (const d of burners) {
    if (left <= EPSILON) break;
    const workshop = d.workshop!;
    const kiln = workshop.kiln!;
    const inKiln = kilnCharcoalKg(kiln);
    const taken = Math.min(left, inKiln);
    left -= taken;
    if (inKiln - taken <= EPSILON) workshop.kiln = null;
    else kiln.charcoalKg = inKiln - taken;
  }
  return Math.max(0, kg) - left;
}

/**
 * Převod milíře ze starší vsi (mutuje): milíř, ze kterého se uhlí vytahovalo najednou (fáze `draw`
 * bez `charcoalKg`), je vypálený s celou dávkou uhlí – rozdělané vytahání se zapomene (crafts.md –
 * Milíř stojí vždy, Starší vsi). Idempotentní.
 */
export function migrateKiln(kiln: CharcoalKiln): void {
  if (kiln.stage !== 'draw' || kiln.charcoalKg !== undefined) return;
  kiln.charcoalKg = kilnYieldKg(kiln);
  kiln.done = 0;
}

/**
 * Kolik dní uhlíř připraví a vypálí další milíř (crafts.md – Milíř stojí vždy, Rozebraný milíř):
 * odhad z dávky `kiln` – kácení a dovoz, příprava dřeva a stavba, u lesního milíře s přirážkou za
 * chůzi z dílny `home` – při práci `labor` čd za den, a k tomu pálení. Bez práce 0.
 */
export function kilnLeadDays(
  kiln: Pick<CharcoalKiln, 'trees' | 'site' | 'walkM'>,
  home: Position,
  labor: number,
): number {
  if (labor <= EPSILON) return 0;
  const work =
    kiln.trees.reduce(
      (sum, t) =>
        sum + t.cost + CHARCOAL_KILN.prepManDaysPerTree + CHARCOAL_KILN.buildManDaysPerTree,
      0,
    ) * kilnWalkFactor(kiln, home);
  return work / labor + CHARCOAL_KILN.burnDays;
}

/**
 * Kolik uhlí uhlíř dnes vytahá kovářům z vypáleného milíře (kg; crafts.md – Milíř stojí vždy):
 * - zbývá-li v milíři a u kováře jen tolik uhlí, kolik kováři spálí, než uhlíř připraví a vypálí
 *   další milíř (`leadKg`), vytahá zbytek celý – milíř je rozebraný a uhlíř začne nový,
 * - jinak když uhlí u kováře (`looseKg`) nestačí na dnešní kování (`forgeKg` – všichni kováři, kteří
 *   dnes kovou, na plný úvazek), vytahá uhlí na CHARCOAL_KILN.drawBatchDays dní kování, nejvýš co
 *   v milíři zbývá,
 * - jinak 0 – milíř stojí a čeká (bez kováře vždy).
 */
export function charcoalDrawKg(
  kiln: Pick<CharcoalKiln, 'stage' | 'trees' | 'charcoalKg'> | null | undefined,
  looseKg: number,
  forgeKg: number,
  leadKg = 0,
): number {
  const inKiln = kilnCharcoalKg(kiln);
  if (inKiln <= EPSILON) return 0;
  if (leadKg > EPSILON && inKiln + looseKg <= leadKg) return inKiln;
  if (forgeKg <= EPSILON || looseKg + EPSILON >= forgeKg) return 0;
  return Math.min(inKiln, forgeKg * CHARCOAL_KILN.drawBatchDays);
}

/**
 * Násobek práce u milíře za chůzi z dílny (crafts.md – Uhlíř): milíř v lese o 1 % dražší za
 * každých 10 m nad 100 m od dílny (DISTANCE), milíř u dílny 1.
 */
export function kilnWalkFactor(kiln: Pick<CharcoalKiln, 'site' | 'walkM'>, home: Position): number {
  if (!kiln.site) return 1;
  return distanceFactor(kiln.walkM ?? length2(kiln.site.x - home.x, kiln.site.z - home.z));
}

/** Je den v okně výsadby (jaro, podzim – jako sad)? */
export function inPlantingWindow(day: number): boolean {
  return monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month);
}

/**
 * Nová dávka buků pro milíř (crafts.md – Uhlíř): nejbližší stojící dospělý buk k milíři u dílny,
 * který nepatří jiné stavbě ani dílně a není posvátný. Do CHARCOAL_KILN.homeReachM od milíře
 * u dílny se pálí doma a dávka jsou nejbližší buky k němu; dál stojí milíř v lese u prvního buku
 * a dávka jsou buky nejblíž k němu. Kácení a dovoz se platí od milíře (`fellingCost`). Bez
 * vrstvy překážek (null – jen testy) se kácí bez polohy u dílny. Když není z čeho kácet, null.
 */
export function startKiln(
  state: VillageState,
  dwelling: Pick<Dwelling, 'position'>,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): CharcoalKiln | null {
  const fresh = (site: CharcoalKiln['site'], trees: CharcoalKiln['trees']): CharcoalKiln => ({
    site,
    trees,
    stage: 'wood',
    prepared: 0,
    done: 0,
  });
  if (!obstacles) {
    const tree = { id: null, cost: fellingCost(0) };
    return fresh(
      null,
      Array.from({ length: CHARCOAL_KILN.trees }, () => ({ ...tree })),
    );
  }
  // bez buků v celé krajině se nehledá po políčkách (celá vrstva by se procházela každý den)
  if (availableTrees(obstacles, state, day, 'beeches') <= 0) return null;
  const changes = obstacleChangesAt(state, day);
  const claimed = claimedObstacles(state);
  const home = homeKilnCenter(dwelling.position);
  const [first] = nearestMatureTrees(obstacles, changes, home, 1, claimed, isBeech);
  if (!first) return null;
  const site = first.distanceM <= CHARCOAL_KILN.homeReachM ? null : { x: first.x, z: first.z };
  const trees = nearestMatureTrees(
    obstacles,
    changes,
    site ?? home,
    CHARCOAL_KILN.trees,
    claimed,
    isBeech,
  );
  // dovoz dřeva k milíři a chůze z dílny k lesnímu milíři po pevných cestách s půdou (walk)
  const kiln = fresh(
    site,
    fellingsOf(trees, site ?? home, walk).map((t) => ({ id: t.id, cost: t.cost })),
  );
  if (site && walk) kiln.walkM = walk(dwelling.position, [site])[0]!;
  return kiln;
}

/** Výsledek dne uhlíře pro rozdělení práce dne a panel. */
export interface BurnerDay {
  /** Kácení a příprava dřeva u buků (člověkodny) a buky, u kterých se dnes pracovalo. */
  felling: number;
  fellingTrees: number[];
  /** Práce u milíře – stavba, hlídání, vytahání (čd). */
  making: number;
  /** Sázení mladých buků (čd) a pařezy, na které dnes uhlíř zasadil. */
  planting: number;
  plantedTrees: number[];
  /** Uhlí, které dnes přibylo (kg – vytahaný milíř). */
  producedKg: number;
  /** Milíř v lese, u kterého se dnes pracovalo (střed, m); u dílny null. */
  site: { x: number; z: number } | null;
  activity: WorkshopActivity;
}

/** Co uhlíř dnes dělá s vypáleným milířem (crafts.md – Milíř stojí vždy). */
export interface BurnerPlan {
  /**
   * Kolik uhlí dnes vytahá z vypáleného milíře pro kováře (kg – `charcoalDrawKg`); 0 = nevytahá.
   * Do kovárny ho donese kovářova domácnost nebo vůz (crafts.md – Uhlí a ruda kováře).
   */
  drawKg: number;
}

/**
 * Starší dílna uhlíře (mutuje stav, idempotentně): z doby před milíři – skácené dřevo, ze kterého
 * ještě nevzniklo uhlí, se dopálí do zásoby u kováře a rozdělané kácení se opustí (strom se
 * uvolní); z doby, kdy se milíř vytahal najednou, je vytahovaný milíř vypálený s celou dávkou
 * (`migrateKiln`). Volá se v kroku práce řemeslníků pro každou dílnu uhlíře, takže se to stane
 * v prvním dopočítaném dni – na kouscích nezávisí.
 */
export function migrateBurner(workshop: Workshop, stocks: CraftStocks): void {
  if (workshop.fuelKg > 0) stocks.charcoalKg += workshop.fuelKg;
  workshop.fuelKg = 0;
  workshop.felling = null;
  if (workshop.kiln) migrateKiln(workshop.kiln);
}

/**
 * Den uhlíře (mutuje stav): `labor` = práce domácnosti řemeslu (po denním minimu).
 * Pálící milíř zabere celý den (hlídání ve dne i v noci) – po CHARCOAL_KILN.burnDays dnech je
 * vypálený. Jinak v okně výsadby nejdřív sází mladé buky na pařezy, pak pokračuje v milíři (buky
 * strom po stromu: kácení a dovoz, pak příprava dřeva; stavba), a když žádný nemá, začne nový –
 * milíř stojí vždy (crafts.md – Milíř stojí vždy). Z vypáleného milíře vytahá a vytřídí pro
 * kováře `plan.drawKg` uhlí (u milíře v lese s přirážkou za chůzi) do zásoby u kováře – donese ho
 * kovářova domácnost nebo vůz se sedlákem (crafts.md – Uhlí a ruda kováře); rozebraný milíř
 * zmizí a nový začne od zítřka.
 */
export function workBurner(
  state: VillageState,
  dwelling: Dwelling,
  stocks: CraftStocks,
  labor: number,
  day: number,
  obstacles: ObstacleLayer | null,
  plan: BurnerPlan,
  walk?: Walk,
): BurnerDay {
  const workshop = dwelling.workshop!;
  migrateBurner(workshop, stocks);
  const out: BurnerDay = {
    felling: 0,
    fellingTrees: [],
    making: 0,
    planting: 0,
    plantedTrees: [],
    producedKg: 0,
    site: workshop.kiln?.site ?? null,
    activity: 'idle',
  };
  let left = Math.max(0, labor);
  let worked: WorkshopActivity | null = null;
  let noWood = false;
  const kilnNow = workshop.kiln ?? null;
  // pálící milíř se hlídá ve dne i v noci – celá práce dne
  if (kilnNow?.stage === 'burn') {
    out.making = left;
    kilnNow.done += 1;
    if (kilnNow.done + EPSILON >= CHARCOAL_KILN.burnDays) {
      // vypálený milíř je zásobou uhlí – rozebírá se podle odběru kovářů
      kilnNow.stage = 'draw';
      kilnNow.done = 0;
      kilnNow.charcoalKg = kilnYieldKg(kilnNow);
    }
    out.activity = 'burning';
    return out;
  }
  // obnova lesa: v okně výsadby mladé buky na pařezy (crafts.md – Uhlíř)
  if (inPlantingWindow(day)) {
    const toPlant = workshop.toPlant ?? [];
    while (left > EPSILON && toPlant.length > 0) {
      const id = toPlant[0]!;
      toPlant.shift();
      if (!plantOnStump(state, id, day)) continue;
      const cost = BEECH_PLANTING.manDaysPerTree * stumpWalkFactor(obstacles, id, dwelling);
      const spent = Math.min(left, cost);
      left -= spent;
      out.planting += spent;
      out.plantedTrees.push(id);
      worked = 'planting';
    }
    if (workshop.toPlant) {
      if (toPlant.length > 0) workshop.toPlant = toPlant;
      else delete workshop.toPlant;
    }
  }
  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    let kiln = workshop.kiln ?? null;
    if (!kiln) {
      // milíř stojí vždy – rozebraný dnes, nový od zítřka
      if (out.producedKg > 0) break;
      kiln = startKiln(state, dwelling, day, obstacles, walk);
      if (!kiln) {
        noWood = true;
        break;
      }
      workshop.kiln = kiln;
    }
    out.site = kiln.site;
    const factor = kilnWalkFactor(kiln, dwelling.position);
    if (kiln.stage === 'burn') break;
    if (kiln.stage === 'wood') {
      const tree = kiln.trees[kiln.prepared]!;
      const total = tree.cost + CHARCOAL_KILN.prepManDaysPerTree;
      const work = Math.min(left / factor, Math.max(0, total - kiln.done));
      const before = kiln.done;
      kiln.done += work;
      left -= work * factor;
      out.felling += work * factor;
      if (tree.id !== null && !out.fellingTrees.includes(tree.id)) out.fellingTrees.push(tree.id);
      if (before < tree.cost - EPSILON && kiln.done + EPSILON >= tree.cost)
        fellBeech(state, workshop, tree.id, day);
      worked = 'felling';
      if (kiln.done + EPSILON >= total) {
        kiln.prepared++;
        kiln.done = 0;
        if (kiln.prepared >= kiln.trees.length) kiln.stage = 'build';
      }
      continue;
    }
    if (kiln.stage === 'build') {
      const total = CHARCOAL_KILN.buildManDaysPerTree * kiln.trees.length;
      const work = Math.min(left / factor, Math.max(0, total - kiln.done));
      kiln.done += work;
      left -= work * factor;
      out.making += work * factor;
      worked = 'building';
      if (kiln.done + EPSILON < total) continue;
      // postavený milíř se zapálí – pálí se od zítřka
      kiln.stage = 'burn';
      kiln.done = 0;
      break;
    }
    // vypálený milíř: uhlíř vytahá a vytřídí uhlí pro kováře podle plánu dne, jinak milíř stojí
    // a čeká; do kovárny ho donese kovářova domácnost nebo vůz (crafts.md – Uhlí a ruda kováře)
    const inKiln = kilnCharcoalKg(kiln);
    const perKg = DRAW_MAN_DAYS_PER_KG * factor;
    const kg = Math.min(plan.drawKg - out.producedKg, inKiln, left / perKg);
    if (kg <= EPSILON) break;
    left -= kg * perKg;
    out.making += kg * perKg;
    out.producedKg += kg;
    stocks.charcoalKg += kg;
    worked = 'drawing';
    if (inKiln - kg > EPSILON) {
      kiln.charcoalKg = inKiln - kg;
      break;
    }
    // rozebraný milíř zmizí – zbytek uhlí uhlíř vytahá celý
    stocks.charcoalKg += inKiln - kg;
    out.producedKg += inKiln - kg;
    workshop.kiln = null;
  }
  out.activity =
    worked ??
    (noWood
      ? 'no-wood'
      : labor <= EPSILON
        ? 'idle'
        : workshop.kiln?.stage === 'draw'
          ? 'resting'
          : workshop.kiln
            ? 'idle'
            : 'resting');
  return out;
}

/**
 * Pokácí buk dávky (pařez) a zapíše ho k obnově – na pařez uhlíř později zasadí mladý buk.
 * Vyhrazený buk, který mezitím zmizel (vyklidila ho jiná stavba), se počítá jako skácený, ale
 * není kam sázet.
 */
function fellBeech(state: VillageState, workshop: Workshop, id: number | null, day: number): void {
  if (id === null || !isTreeStanding(state, id, day)) return;
  state.felledTrees = fellTrees(state, [id], day).felledTrees ?? [];
  (workshop.toPlant ??= []).push(id);
}

/** Přirážka za chůzi z dílny k pařezu, na který uhlíř sází (bez vrstvy 1). */
function stumpWalkFactor(obstacles: ObstacleLayer | null, id: number, dwelling: Dwelling): number {
  if (!obstacles) return 1;
  const index = obstacleIndex(obstacles, id);
  if (index < 0) return 1;
  return distanceFactor(
    length2(obstacles.x[index]! - dwelling.position.x, obstacles.z[index]! - dwelling.position.z),
  );
}

/**
 * Kolik uhlí kováři dnes spálí, když kovají celý den (kg): práce kováře za den ÷ práce na kg
 * nástrojů × 50 kg uhlí. Volající dává práci kovářů (`workshopLabor` v crafts.ts).
 */
export function smithForgeCharcoalKg(
  smiths: readonly { labor: number; oreFactor: number }[],
): number {
  return smiths.reduce(
    (sum, s) =>
      sum +
      (s.labor / (CRAFT_PRODUCTION.toolManDaysPerKg * s.oreFactor)) *
        CRAFT_PRODUCTION.toolCharcoalKgPerKg,
    0,
  );
}
