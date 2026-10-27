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
 * Řetěz s vědry v den požáru (disasters.md – Hašení; jen ke čtení pro scénu): hořící stavba,
 * místo na břehu nejblíž ní (`water`, bez vody null), počet hasících dospělých, rozestup mezi nimi
 * (m) a účinnost 0–1.
 */
export interface FireFight {
  day: number;
  dwellingId: number;
  water: { x: number; z: number } | null;
  distanceM: number;
  people: number;
  spacingM: number;
  efficiency: number;
}

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

/**
 * Krupobití v rozpisu roku vsi (`yearSchedule` – disasters.md, Kroupy): den, směr pruhu (úhel
 * v radiánech, 0 = podél osy x) a posun jeho středu od středu vsi (m, kolmo ke směru).
 */
export interface HailPlan {
  day: number;
  angle: number;
  offsetM: number;
}

/** Rozpis místních pohrom roku vsi ze seedu vsi – zatím kroupy (povodeň a smršť přidají P6, P9). */
export interface LocalYearSchedule {
  hail: HailPlan | null;
}

/** Pruh krupobití: střed vsi v den krupobití (m), směr a posun (`HailPlan`). */
export interface HailStrip {
  x: number;
  z: number;
  angle: number;
  offsetM: number;
}

/** Poslední krupobití vsi (pro scénu a sad): den a pruh. */
export interface HailRecord {
  day: number;
  strip: HailStrip;
  /** Podíl letošních jablek sadů, který kroupám zbyl (0–1) – sklizeň 1. 9. téhož roku. */
  apples?: number;
}

/**
 * Podíly ztráty hrubé úrody po dílech za rok sklizně (`harvestYearOf`) – sloučí se se škodou zvěře
 * a počasím v `dayPartLosses`. Smršť přidá P9.
 */
export interface PartDisasterLosses {
  year: number;
  hail?: Record<string, number>;
  /** Povodeň (disasters.md – Povodeň potoka) – nesklizená úroda a ozim zatopených dílů. */
  flood?: Record<string, number>;
}
/** Poslední povodeň, která vsi něco zatopila (pro scénu): den, stupeň a výška vody nad potokem. */
export interface FloodRecord {
  day: number;
  level: FloodLevel;
  heightM: number;
}

/** Pohromy vsi (disasters.md); další části přidají místní pohromy. */
export interface DisasterState {
  /** Řetěz s vědry posledního požáru (platí jen v jeho den). */
  fireFight?: FireFight;
  /** Ochrana dílů před počasím, jednou za rok 1. 4. (jen ves se `weatherSeed`). */
  protection?: PartProtections;
  /** Poslední krupobití (jen ves se `weatherSeed` nebo vynucené). */
  hail?: HailRecord;
  /** Poslední povodeň, která vsi něco zatopila (jen ves s krajinou). */
  flood?: FloodRecord;
  /** Ztráty dílů z místních pohrom za rok sklizně. */
  losses?: PartDisasterLosses;
  /**
   * Paměť hladu (disasters.md – Dopady, Zásoby a pojistka): do tohoto roku včetně drží ves
   * vyšší pojistku – zapíše `famineMemoryDay` 1. 9. po krutém roce.
   */
  famineMemoryUntilYear?: number;
  /** Jen testy a dev: přebije los – klíč = herní rok. */
  override?: {
    weather?: Record<number, WeatherOverride>;
    /** Vynucený požár: herní den → id obydlí, které chytí (přebije los i ochranu nové vsi). */
    fire?: Record<number, number>;
    /** Vynucené krupobití: herní den → směr a posun pruhu (přebije los i ochranu nové vsi). */
    hail?: Record<number, Omit<HailPlan, 'day'>>;
  };
}
