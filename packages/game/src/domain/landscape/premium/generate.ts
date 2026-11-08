import { seatSlot } from '../../world/skeleton/sites';
import { obstaclesOf, type ObstacleLayer } from '../obstacles';
import { transferPrecision } from '../quantize';
import { deriveSeed } from '../random';
import type { SkeletonTerrainOptions } from '../skeleton/terrain';
import type { SkeletonSlice } from '../skeleton/types';
import type { Terrain, TerrainOptions } from '../terrain';
import type { Landscape, LayerVersions } from '../types';
import { PREMIUM_TYPES } from './catalog';
import { DEPOSIT_PASSES } from './deposits';
import { RELIEF_PASSES } from './relief';
import { SOIL_FOREST_PASSES } from './soil-forest';
import { SKELETON_WATER_PASSES, WATER_PASSES } from './water';
import {
  SKELETON_PREMIUM_SLOTS,
  type PremiumFeatures,
  type PremiumSite,
  type PremiumType,
} from './types';

/**
 * Verze prémiového průchodu (premium-landscapes.md – Generátor). Ukládá se u sídla s prémiovým
 * typem v `LayerVersions.premium`; chybí = 1, jako u vrstvy překážek (návrh Clauda). Po ostrém
 * spuštění vyžaduje změna průchodu kteréhokoli typu novou verzi – průměrnou krajinu (bez typu)
 * průchod nemění nikdy. 1 = typy kostry s vlastní řekou s náhodným vstupem a výstupem (bez
 * výřezu); 2 = prémie na kostře (world-skeleton.md – Mapa z kostry): typ kostry jen na svém místě
 * kostry (`SKELETON_PREMIUM_SLOTS`, řeku a stezku bere z výřezu), ostatní typy jako ve verzi 1
 * jen na suché mapě.
 */
export const PREMIUM_LAYER_VERSION = 2;

/** Verze prémiového průchodu, které generátor umí. */
export type PremiumLayerVersion = NonNullable<LayerVersions['premium']>;

/** Verze průchodu z verzí vrstev – chybí = 1; neznámá verze vyhodí RangeError. */
export function premiumVersionOf(versions: LayerVersions): PremiumLayerVersion {
  const version = versions.premium ?? 1;
  if (version !== 1 && version !== 2) {
    throw new RangeError(`Neznámá verze prémiového průchodu: ${String(version)}`);
  }
  return version;
}

/**
 * Smí typ v dané verzi průchodu vzniknout na mapě s tímto výřezem kostry? Verze 1 jen na suché
 * mapě (výřez null) – řeku si typ kostry přidá sám. Verze 2: typ kostry jen na svém místě kostry
 * (`SKELETON_PREMIUM_SLOTS` = `seatSlot(výřez)`), ostatní typy jen na suché mapě. Jinak
 * RangeError – takové sídlo hra nezaloží (`placeSeat`).
 */
export function assertPremiumSlot(
  type: PremiumType,
  version: PremiumLayerVersion,
  slice: SkeletonSlice | null,
): void {
  if (version === 1) {
    if (slice) throw new RangeError(`Prémiový typ ${type} na mapě z kostry jen s premium: 2.`);
    return;
  }
  const expected = SKELETON_PREMIUM_SLOTS[type] ?? 'dry';
  const slot = seatSlot(slice);
  if (slot !== expected) {
    throw new RangeError(
      `Prémiový typ ${type} (premium: 2) patří na místo ${expected}, výřez je ${String(slot)}.`,
    );
  }
}

/** Vstup průchodu typu při generování krajiny. */
export interface PremiumPassContext {
  readonly type: PremiumType;
  readonly version: PremiumLayerVersion;
  /**
   * Vlastní seed průchodu (`deriveSeed(seed pokusu, 'premium')`) – průchod nebere náhodu
   * z vrstev průměrné krajiny, takže se jim nic nepřelosuje.
   */
  readonly seed: number;
  /** Verze vrstev průměrné krajiny, nad kterou průchod běží. */
  readonly versions: LayerVersions;
  /** Výřez kostry mapy (prémie na kostře, verze 2); null = suchá mapa. */
  readonly skeleton: SkeletonSlice | null;
}

/** Vstup hledání prvků typu – na serveru i v prohlížeči stejný. */
export interface PremiumSiteContext {
  /** Krajina s přesností prohlížeče (`transferPrecision`) – obě strany počítají ze stejných čísel. */
  readonly landscape: Landscape;
  /** Vrstva překážek krajiny – líně, z mezipaměti původního objektu krajiny (`obstaclesOf`). */
  obstacles(): ObstacleLayer;
}

/**
 * Prémiový průchod jednoho typu. Úpravy vrstev běží při generování (jen server – prohlížeč
 * dostane hotové vrstvy přenosem); prvky typu hledá `sites` v hotové krajině na serveru
 * i v prohlížeči, proto jen deterministickou matematikou (`det-math.ts`, celá složka `premium/`
 * je v deterministické vrstvě – hlídá ESLint). Úpravy vrstvy překážek patří do rozmisťovačů
 * (`landscape.premium` jde přenosem i do prohlížeče). Chybějící úprava = vrstva průměrné krajiny.
 */
export interface PremiumPass {
  /**
   * Parametry terénu typu (`generateTerrain`) – terén se pak generuje ze seedu terénu pokusu
   * s nimi, ne z terénu průměrné krajiny (přirozená pevnost – jistá velká ostrožna). Mění jen
   * meze, náhoda zůstane.
   */
  readonly terrainOptions?: TerrainOptions;
  /**
   * Parametry terénu mapy z kostry (`generateSkeletonTerrain`) – terén se generuje znovu ze seedu
   * terénu pokusu a výřezu s nimi (splavná řeka – širší niva). Jen prémie na kostře.
   */
  readonly skeletonTerrainOptions?: SkeletonTerrainOptions;
  /** Terén před vegetací – výšky, voda, potok, místo pro vesnici (smí upravit předaný objekt). */
  readonly terrain?: (terrain: Terrain, ctx: PremiumPassContext) => Terrain;
  /**
   * Úrodnost se počítá s průměrnou výškou souše průměrné krajiny pokusu, ne upraveného terénu
   * (typy reliéfu – hora zvedne průměr a zbytek mapy by vyšel úrodnější; výhoda nesouvisející
   * s typem pryč).
   */
  readonly fertilityAverageMean?: true;
  /** Povrch (kódy `SURFACE_CODES`) před úrodností. */
  readonly vegetation?: (
    surface: Uint8Array,
    terrain: Terrain,
    ctx: PremiumPassContext,
  ) => Uint8Array;
  /** Úrodnost 0–100 (voda 0). */
  readonly fertility?: (
    fertility: Uint8Array,
    terrain: Terrain,
    surface: Uint8Array,
    ctx: PremiumPassContext,
  ) => Uint8Array;
  /** Prvky typu; null = prvek v krajině chybí (pokus neprojde kontrolou typu – `checkPremium`). */
  readonly sites: (ctx: PremiumSiteContext) => readonly PremiumSite[] | null;
}

/**
 * Průchody po typech. Typ, který ještě není napsaný, průchod nemá: krajina s ním je průměrná,
 * nemá prvky a kontrolou typu neprojde.
 */
const PREMIUM_PASSES: Partial<Record<PremiumType, PremiumPass>> = {
  ...SOIL_FOREST_PASSES,
  ...WATER_PASSES,
  ...RELIEF_PASSES,
  ...DEPOSIT_PASSES,
};

/**
 * Průchody typů kostry ve verzi 2 (prémie na kostře) – řeku a stezku berou z výřezu. Typ kostry,
 * který tu ještě není, průchod ve verzi 2 nemá (krajina průměrná, kontrolou typu neprojde).
 */
const SKELETON_PREMIUM_PASSES: Partial<Record<PremiumType, PremiumPass>> = {
  ...SKELETON_WATER_PASSES,
};

const KNOWN_TYPES: ReadonlySet<string> = new Set(PREMIUM_TYPES);

/**
 * Průchod typu ve verzi (null = typ zatím bez průchodu); neznámý typ vyhodí RangeError jako
 * neznámá verze. Ostatní typy než typy kostry mají ve verzi 2 stejný průchod jako ve verzi 1.
 */
function premiumPassOf(type: PremiumType, version: PremiumLayerVersion): PremiumPass | null {
  if (!KNOWN_TYPES.has(type)) throw new RangeError(`Neznámý prémiový typ: ${String(type)}`);
  if (version === 2 && SKELETON_PREMIUM_SLOTS[type] !== undefined) {
    return SKELETON_PREMIUM_PASSES[type] ?? null;
  }
  return PREMIUM_PASSES[type] ?? null;
}

/** Umí generátor prémiový typ ve verzi průchodu (má průchod)? Bez verze verze 1. */
export function hasPremiumPass(type: PremiumType, version: PremiumLayerVersion = 1): boolean {
  return premiumPassOf(type, version) !== null;
}

/** Úpravy vrstev jednoho pokusu – bez úpravy vrací vrstvu beze změny. */
export interface PremiumGeneration {
  /** Průchod mění terén / povrch – vrstvy průměrné krajiny pak nejde použít znovu. */
  readonly changesTerrain: boolean;
  readonly changesVegetation: boolean;
  /**
   * Parametry terénu typu – terén se generuje s nimi znovu ze seedu terénu (ne kopie terénu
   * průměrné krajiny); null = terén průměrné krajiny.
   */
  readonly terrainOptions: TerrainOptions | null;
  /**
   * Parametry terénu mapy z kostry typu – terén se generuje s nimi znovu z výřezu (ne kopie
   * terénu průměrné krajiny); null = bez nich (i na suché mapě).
   */
  readonly skeletonTerrainOptions: SkeletonTerrainOptions | null;
  /** Úrodnost s průměrnou výškou souše průměrné krajiny pokusu (`PremiumPass.fertilityAverageMean`). */
  readonly fertilityAverageMean: boolean;
  terrain(terrain: Terrain): Terrain;
  vegetation(surface: Uint8Array, terrain: Terrain): Uint8Array;
  fertility(fertility: Uint8Array, terrain: Terrain, surface: Uint8Array): Uint8Array;
}

/**
 * Prémiový průchod pokusu `attemptSeed` – generátor ho volá po každé vrstvě. Výřez kostry
 * (`skeleton`, null = suchá mapa) musí typu a verzi odpovídat (`assertPremiumSlot`).
 */
export function premiumGeneration(
  type: PremiumType,
  attemptSeed: number,
  versions: LayerVersions,
  skeleton: SkeletonSlice | null = null,
): PremiumGeneration {
  const version = premiumVersionOf(versions);
  const pass = premiumPassOf(type, version);
  assertPremiumSlot(type, version, skeleton);
  const ctx: PremiumPassContext = {
    type,
    version,
    seed: deriveSeed(attemptSeed, 'premium'),
    versions,
    skeleton,
  };
  const skeletonTerrainOptions = skeleton ? (pass?.skeletonTerrainOptions ?? null) : null;
  return {
    changesTerrain:
      pass?.terrain !== undefined ||
      pass?.terrainOptions !== undefined ||
      skeletonTerrainOptions !== null,
    changesVegetation: pass?.vegetation !== undefined,
    terrainOptions: pass?.terrainOptions ?? null,
    skeletonTerrainOptions,
    fertilityAverageMean: pass?.fertilityAverageMean === true,
    terrain: (terrain) => pass?.terrain?.(terrain, ctx) ?? terrain,
    vegetation: (surface, terrain) => pass?.vegetation?.(surface, terrain, ctx) ?? surface,
    fertility: (fertility, terrain, surface) =>
      pass?.fertility?.(fertility, terrain, surface, ctx) ?? fertility,
  };
}

const featuresCache = new WeakMap<Landscape, PremiumFeatures | null>();

/**
 * Prvky prémiového typu krajiny (naleziště, brod, průsmyk…) – čistá funkce krajiny, spočítaná
 * jednou na objekt krajiny jako `obstaclesOf`. Vychází z krajiny s přesností prohlížeče, takže
 * prohlížeči (krajina z přenosu) vyjde stejně jako serveru. null = krajina bez typu, nebo typ
 * bez prvků. Verzi průchodu krajina nenese – určí ji výřez: prémie na mapě z kostry je vždy
 * verze 2, verze 1 výřez nikdy nemá a ostatní typy mají na suché mapě v obou verzích stejný
 * průchod.
 */
export function premiumFeaturesOf(landscape: Landscape): PremiumFeatures | null {
  const type = landscape.premium;
  if (type === undefined) return null;
  const cached = featuresCache.get(landscape);
  if (cached !== undefined) return cached;
  const pass = premiumPassOf(type, landscape.skeleton ? 2 : 1);
  const sites =
    pass?.sites({
      landscape: transferPrecision(landscape),
      obstacles: () => obstaclesOf(landscape),
    }) ?? null;
  const features = sites === null ? null : { type, sites };
  featuresCache.set(landscape, features);
  return features;
}
