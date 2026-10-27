// Počasí kraje a přírodní pohromy (disasters.md) – JSON-serializovatelné typy.

/** Léto roku (disasters.md – Léto). */
export type SummerWeather = 'good' | 'normal' | 'dry' | 'drought' | 'wet' | 'wetHarvest';

/** Zima roku – prosinec až březen, patří k roku, ve kterém končí (disasters.md – Zima). */
export type WinterWeather = 'normal' | 'blackFrost' | 'long';

/** Stupeň roční nejvyšší vody podle doby návratu (disasters.md – Povodeň potoka). */
export type FloodLevel =
  'small' | 'five' | 'twenty' | 'hundred' | 'twoHundred' | 'fiveHundred' | 'thousand';

/**
 * Roční nejvyšší voda potoka – společná pro celý kraj (Martin 27. 10. 2026: „Ano a ano“). Škody
 * počítá každá ves sama podle svých políček.
 */
export interface RegionFlood {
  level: FloodLevel;
  /** Výška vody nad hladinou potoka (m). */
  heightM: number;
  /** Jarní (tání) nebo letní (bouřky). */
  season: 'spring' | 'summer';
  month: number;
  day: number;
}

/** Počasí roku kraje – čistá funkce seedu počasí mapy a roku (`yearWeather`). */
export interface YearWeather {
  year: number;
  summer: SummerWeather;
  winter: WinterWeather;
  /** Žádná voda = null. */
  flood: RegionFlood | null;
}

/**
 * Počasí, které už je vidět (disasters.md – Léto, Zima, „Kdy je vidět“) – co ještě vidět není,
 * chybí. Mokré žně jsou do 15. 7. vidět jako deštivé léto.
 */
export interface RevealedWeather {
  year: number;
  summer?: SummerWeather;
  winter?: WinterWeather;
  flood?: RegionFlood;
}

/** Vynucené počasí roku (jen testy a dev „Vynutit zlý rok“) – přebije los. */
export type WeatherOverride = Partial<Pick<YearWeather, 'summer' | 'winter' | 'flood'>>;

/**
 * Ochrana jednoho dílu před počasím – složky spočtené 1. 4. (disasters.md – Ochrana dílu). Z nich
 * `partProtection` složí ochranu pro sucho, mokro, holomráz a kroupy.
 */
export interface PartProtection {
  /** Zeleň 0–1: nejbližší zeleň (les, sad, remíz, strom na mezi) plus solitéry do 50 m. */
  green: number;
  /** U vody (do 60 m od vody) nebo v nivě – sucho +0,2. */
  nearWater?: true;
  /** V nivě (do 1,5 m nad potokem) – deštivé léto −0,2. */
  lowland?: true;
  /** Vyvýšený díl na hřbetu – sucho a holomráz −0,2. */
  raised?: true;
  /** Svah (převýšení k sousednímu políčku ≥ 1,5 m) – deštivé léto +0,2. */
  slope?: true;
}

/** Druh počasí, proti kterému ochrana chrání. */
export type ProtectionKind = 'dry' | 'wet' | 'frost' | 'hail';

/** Ochrana dílů spočtená 1. 4. roku `year` (klíč = id dílu). */
export interface PartProtections {
  year: number;
  parts: Record<string, PartProtection>;
}

/** Pohromy vsi (disasters.md); další části přidají místní pohromy. */
export interface DisasterState {
  /** Ochrana dílů před počasím, jednou za rok 1. 4. (jen ves se `weatherSeed`). */
  protection?: PartProtections;
  /**
   * Paměť hladu (disasters.md – Dopady, Zásoby a pojistka): do tohoto roku včetně drží ves
   * vyšší pojistku – zapíše `famineMemoryDay` 1. 9. po krutém roce.
   */
  famineMemoryUntilYear?: number;
  /** Jen testy a dev: přebije los – klíč = herní rok. */
  override?: { weather?: Record<number, WeatherOverride> };
}
