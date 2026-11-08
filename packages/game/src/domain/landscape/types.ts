import type { PremiumType } from './premium/types';
import type { SkeletonSlice } from './skeleton/types';

export const LANDSCAPE_SIZE = 128;
export const CELL_SIZE_M = 15;

export type Surface = 'water' | 'forest' | 'meadow';
export const SURFACE_CODES = { water: 0, forest: 1, meadow: 2 } as const;
const SURFACES_BY_CODE: readonly Surface[] = ['water', 'forest', 'meadow'];

/** Verze vrstev generátoru – ukládají se u sídla, aby změna generátoru nepřepsala jeho krajinu. */
export interface LayerVersions {
  /**
   * 2 = skály u potoka (20. 10. 2026): skalní ostroh v ostrém ohybu, strmý nárazový břeh nebo
   * skalní stěna na vnější straně oblouku a na části map zaříznutý meandr s ostrožnou.
   */
  terrain: 1 | 2;
  /** 2 = víc kvalitní louky kolem vsi (18. 10. 2026). */
  vegetation: 1 | 2;
  /** 2 = úrodná niva a mírné svahy (18. 10. 2026). */
  fertility: 1 | 2;
  /**
   * Vrstva překážek (stromy, keře, kameny – `generateObstacles`). Chybí u sídel založených před
   * jejím vznikem – nová vrstva platí pro všechna sídla, takže u nich je to verze 1.
   */
  /** 2 = navíc suť a skály na skalních stěnách u potoka (s terénem 2, 20. 10. 2026). */
  obstacles?: 1 | 2;
  /**
   * Prémiový průchod (premium-landscapes.md – Generátor) – platí jen pro krajinu s prémiovým
   * typem, chybí = 1. Průměrná krajina (bez typu) ho nemá a nic se jí nemění.
   */
  premium?: 1;
  /**
   * Mapa z kostry světa (world-skeleton.md – Uložení, verze vrstev): 1 = terén „řeka první“
   * z výřezu (`skeleton/terrain.ts`). Jen u map s neprázdným výřezem – suchá mapa ji nemá
   * a generuje se jako dřív; výřez bez verze nebo verze bez výřezu = `RangeError`.
   */
  skeleton?: 1;
}
/** Verze vrstvy kostry pro nové mapy s výřezem. */
export const SKELETON_LAYER_VERSION = 1;
/** Verze vrstev pro nová sídla. */
export const CURRENT_LAYER_VERSIONS: LayerVersions = {
  terrain: 2,
  vegetation: 2,
  fertility: 2,
  obstacles: 2,
};
/** Verze vrstev nových sídel do 20. 10. 2026 (víc louky, bez skal u potoka) – pro srovnání. */
export const PREVIOUS_LAYER_VERSIONS: LayerVersions = {
  terrain: 1,
  vegetation: 2,
  fertility: 2,
  obstacles: 1,
};
/** Verze vrstev sídel založených do 18. 10. 2026 – jejich krajina se generuje dál stejně. */
export const INITIAL_LAYER_VERSIONS: LayerVersions = {
  terrain: 1,
  vegetation: 1,
  fertility: 1,
  obstacles: 1,
};

/** Seed a verze vrstvy překážek, ze kterých ji `generateObstacles` vygeneruje (líně). */
export interface ObstacleLayerSeed {
  readonly seed: number;
  readonly version: 1 | 2;
}

/**
 * Bod osy potoka, seřazené po proudu. Souřadnice v políčkách (celé číslo = střed políčka),
 * šířky v políčkách: levý břeh leží ve směru (−ty, tx) od směru toku (tx, ty).
 */
export interface StreamPoint {
  readonly x: number;
  readonly y: number;
  /** Vzdálenost levého a pravého okraje vody od osy (políčka) – břehy meandrují každý jinak. */
  readonly halfWidthLeft: number;
  readonly halfWidthRight: number;
  /** Hladina (m nad nejnižším políčkem krajiny); po proudu nestoupá. */
  readonly level: number;
  /** Mělčina nebo brod – široký mělký úsek (rákos, štěrk), ne tůň. */
  readonly shallow: boolean;
  /**
   * Výška strmého břehu nad hladinou vlevo a vpravo (m) – nárazový břeh, skalní stěna, skalní
   * ostroh nebo stěna ostrožny (terén 2, 0 = bez stěny). Chybí u krajin terénu 1.
   */
  readonly bankLeft?: number;
  readonly bankRight?: number;
}

/**
 * Ostrožna (terén 2): výběžek nad tokem – plocha nahoře rovná nebo mírná, ze 2–3 stran prudké
 * svahy a skalní stěny k vodě, na jedné straně úzká šíje do okolí. Zatím bez herní funkce – místo
 * pro budoucí hradiště (vision.md) a základ zvláštních míst krajiny. Souřadnice v políčkách jako
 * `villageSite`.
 */
export interface Promontory {
  /**
   * Jak ostrožna vznikla: `meander` = jádro zaříznutého meandru (smyčka potoka, terén 2),
   * `ford-hill` = vyvýšenina nad brodem přes řeku a `confluence` = ostrožna mezi řekou a potokem
   * nad soutokem (prémiové krajiny – `premium/river.ts`). Data jsou pro všechny stejná.
   */
  readonly kind: 'meander' | 'ford-hill' | 'confluence';
  /** Obrys plochy nahoře (políčka), uzavřený mnohoúhelník. */
  readonly outline: readonly { x: number; y: number }[];
  /** Šíje – konce nejužšího místa, kudy ostrožna souvisí s okolím (políčka). */
  readonly neck: readonly [{ x: number; y: number }, { x: number; y: number }];
  /** Střed plochy (políčka). */
  readonly center: { x: number; y: number };
  /** Výška plochy nad hladinou potoka u ostrožny (m). */
  readonly heightM: number;
  /** Plocha nahoře (ha). */
  readonly areaHa: number;
}

/** Krajina sídla – mřížka size × size, index políčka y * size + x. */
export interface Landscape {
  readonly size: number;
  readonly cellSizeM: number;
  /** Metry nad nejnižším políčkem krajiny. */
  readonly heights: Float32Array;
  /** Kódy povrchu podle SURFACE_CODES. */
  readonly surface: Uint8Array;
  /** Úrodnost půdy 0–100. */
  readonly fertility: Uint8Array;
  /** Střed místa, kde se dá založit vesnice. */
  readonly villageSite: { x: number; y: number };
  /** Osa potoka s šířkou břehů a hladinou (pro vykreslení koryta). */
  readonly stream: readonly StreamPoint[];
  /**
   * Osa řeky (prémiové krajiny se splavnou řekou, brodem pod vyvýšeninou a soutokem –
   * `premium/river.ts`) ve stejném tvaru jako osa potoka: od okraje k okraji po proudu, šířky
   * břehů, hladina, brody (`shallow`) a výšky stěn. Chybí = krajina bez řeky. Vodní políčka řeky
   * jsou vodou povrchu jako potok.
   */
  readonly river?: readonly StreamPoint[];
  /**
   * Osy řek kostry světa (mapa s řekou kostry – `skeleton/rivers.ts`) ve stejném tvaru jako
   * `river`: hlavní tok první (od vtoku nebo pramene k výtoku), pak přítoky, které do něj ústí.
   * Chybí = mapa bez řeky kostry. Všechny řeky mapy (i prémiovou) dá `riversOf`.
   */
  readonly rivers?: readonly (readonly StreamPoint[])[];
  /**
   * Výřez kostry světa, ze kterého mapa vznikla (řeky a stezky na okraji); chybí = suchá mapa.
   * Mapa jen se stezkou má terén suché mapy a výřez nese pro stezku.
   */
  readonly skeleton?: SkeletonSlice;
  /**
   * Vrstva překážek se negeneruje s krajinou (stovky ms) – až když je potřeba, ze seedu a verze
   * (`obstaclesOf`). null = krajina bez překážek (ručně vyrobená krajina v testech).
   */
  readonly obstacleLayer: ObstacleLayerSeed | null;
  /** Ostrožny (terén 2, může být prázdné); chybí u krajin terénu 1. */
  readonly promontories?: readonly Promontory[];
  /**
   * Prémiový typ krajiny lidského hráče (premium-landscapes.md); chybí = průměrná krajina.
   * Jde přenosem i do prohlížeče – prvky typu (`premiumFeaturesOf`) i vrstva překážek krajiny
   * s typem tak vyjdou na obou stranách stejně.
   */
  readonly premium?: PremiumType;
}

/** Ostrožny krajiny – u krajin bez nich (terén 1) prázdný seznam. */
export function promontoriesOf(landscape: Landscape): readonly Promontory[] {
  return landscape.promontories ?? [];
}

export function surfaceAt(landscape: Landscape, x: number, y: number): Surface {
  return SURFACES_BY_CODE[landscape.surface[y * landscape.size + x]!]!;
}
