import { obstaclesOf, type ObstacleLayer } from '../obstacles';
import { transferPrecision } from '../quantize';
import { deriveSeed } from '../random';
import type { Terrain } from '../terrain';
import type { Landscape, LayerVersions } from '../types';
import { PREMIUM_TYPES } from './catalog';
import type { PremiumFeatures, PremiumSite, PremiumType } from './types';

/**
 * Verze prémiového průchodu (premium-landscapes.md – Generátor). Ukládá se u sídla s prémiovým
 * typem v `LayerVersions.premium`; chybí = 1, jako u vrstvy překážek (návrh Clauda). Po ostrém
 * spuštění vyžaduje změna průchodu kteréhokoli typu novou verzi – průměrnou krajinu (bez typu)
 * průchod nemění nikdy.
 */
export const PREMIUM_LAYER_VERSION = 1;

/** Verze prémiového průchodu, které generátor umí. */
export type PremiumLayerVersion = NonNullable<LayerVersions['premium']>;

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
  /** Terén před vegetací – výšky, voda, potok, místo pro vesnici (smí upravit předaný objekt). */
  readonly terrain?: (terrain: Terrain, ctx: PremiumPassContext) => Terrain;
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
const PREMIUM_PASSES: Partial<Record<PremiumType, PremiumPass>> = {};

const KNOWN_TYPES: ReadonlySet<string> = new Set(PREMIUM_TYPES);

/** Průchod typu (null = typ zatím bez průchodu); neznámý typ vyhodí RangeError jako neznámá verze. */
function premiumPassOf(type: PremiumType): PremiumPass | null {
  if (!KNOWN_TYPES.has(type)) throw new RangeError(`Neznámý prémiový typ: ${String(type)}`);
  return PREMIUM_PASSES[type] ?? null;
}

/** Umí generátor prémiový typ (má průchod)? */
export function hasPremiumPass(type: PremiumType): boolean {
  return premiumPassOf(type) !== null;
}

/** Úpravy vrstev jednoho pokusu – bez úpravy vrací vrstvu beze změny. */
export interface PremiumGeneration {
  terrain(terrain: Terrain): Terrain;
  vegetation(surface: Uint8Array, terrain: Terrain): Uint8Array;
  fertility(fertility: Uint8Array, terrain: Terrain, surface: Uint8Array): Uint8Array;
}

/** Prémiový průchod pokusu `attemptSeed` – generátor ho volá po každé vrstvě. */
export function premiumGeneration(
  type: PremiumType,
  attemptSeed: number,
  versions: LayerVersions,
): PremiumGeneration {
  const pass = premiumPassOf(type);
  const version = versions.premium ?? 1;
  if (version !== 1) {
    throw new RangeError(`Neznámá verze prémiového průchodu: ${String(version)}`);
  }
  const ctx: PremiumPassContext = {
    type,
    version,
    seed: deriveSeed(attemptSeed, 'premium'),
    versions,
  };
  return {
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
 * bez prvků.
 */
export function premiumFeaturesOf(landscape: Landscape): PremiumFeatures | null {
  const type = landscape.premium;
  if (type === undefined) return null;
  const cached = featuresCache.get(landscape);
  if (cached !== undefined) return cached;
  const pass = premiumPassOf(type);
  const sites =
    pass?.sites({
      landscape: transferPrecision(landscape),
      obstacles: () => obstaclesOf(landscape),
    }) ?? null;
  const features = sites === null ? null : { type, sites };
  featuresCache.set(landscape, features);
  return features;
}
