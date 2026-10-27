// Čísla pravidel přírodních pohrom – každé s odkazem na sekci návrhu `docs/design/disasters.md`.

import type { CalendarDate } from '../calendar';
import type { FloodLevel, SummerWeather, WinterWeather } from './types-disasters';

/** Den v roce (měsíc a den) – kdy je počasí vidět, okna povodně. */
export type MonthDay = Omit<CalendarDate, 'year'>;

/** Násobky úrody a krmení v létě (disasters.md – Léto, tabulka). Jařiny = jař, luštěniny, len. */
export interface SummerEffect {
  winterCrop: number;
  springCrop: number;
  hay: number;
  pasture: number;
}

/** Počasí roku – kraj (disasters.md – Počasí roku – kraj). */
export const WEATHER = {
  /**
   * Léto (disasters.md – Léto): dlouhodobé četnosti z tabulky. Po zlém létě jsou šance zlých
   * let ×`clusterFactor`; v ostatních letech o tolik menší, aby dlouhodobé četnosti seděly
   * s tabulkou (návrh Clauda).
   */
  summerChances: {
    good: 0.25,
    normal: 0.46,
    dry: 0.1,
    drought: 0.04,
    wet: 0.11,
    wetHarvest: 0.04,
  } satisfies Record<SummerWeather, number>,
  /** Násobky hrubé úrody, sena a pastvy (disasters.md – Léto, tabulka). */
  summerEffects: {
    good: { winterCrop: 1.15, springCrop: 1.15, hay: 1.1, pasture: 1 },
    normal: { winterCrop: 1, springCrop: 1, hay: 1, pasture: 1 },
    dry: { winterCrop: 0.9, springCrop: 0.75, hay: 0.7, pasture: 0.8 },
    drought: { winterCrop: 0.75, springCrop: 0.5, hay: 0.45, pasture: 0.6 },
    wet: { winterCrop: 0.85, springCrop: 0.85, hay: 0.75, pasture: 1 },
    wetHarvest: { winterCrop: 0.6, springCrop: 0.6, hay: 0.6, pasture: 1 },
  } satisfies Record<SummerWeather, SummerEffect>,
  /**
   * Kdy je léto vidět (disasters.md – Léto, „Kdy je vidět“). Mokré žně jsou od 1. 6. vidět jako
   * deštivé léto, jako mokré žně až od `wetHarvestRevealed`; normální léto je jisté od 1. 6., kdy
   * by se ukázalo každé jiné (návrh Clauda).
   */
  summerRevealed: {
    good: { month: 6, day: 1 },
    normal: { month: 6, day: 1 },
    dry: { month: 5, day: 1 },
    drought: { month: 5, day: 1 },
    wet: { month: 6, day: 1 },
    wetHarvest: { month: 6, day: 1 },
  } satisfies Record<SummerWeather, MonthDay>,
  wetHarvestRevealed: { month: 7, day: 15 } satisfies MonthDay,
  /** Zlá léta – po nich se zlé roky shlukují (disasters.md – Léto, Zlé roky se shlukují). */
  badSummers: ['dry', 'drought', 'wet', 'wetHarvest'] as const satisfies readonly SummerWeather[],
  /** Kruté léto (disasters.md – Co z toho plyne, Krutý rok). */
  cruelSummers: ['drought', 'wetHarvest'] as const satisfies readonly SummerWeather[],
  /** Zima (disasters.md – Zima): četnosti z tabulky, zlé zimy se po zlém létě shlukují také. */
  winterChances: {
    normal: 0.82,
    blackFrost: 0.09,
    long: 0.09,
  } satisfies Record<WinterWeather, number>,
  /** Kdy je zima vidět (disasters.md – Zima); normální je jistá od 1. 4., kdy zima končí (návrh Clauda). */
  winterRevealed: {
    normal: { month: 4, day: 1 },
    blackFrost: { month: 2, day: 1 },
    long: { month: 3, day: 1 },
  } satisfies Record<WinterWeather, MonthDay>,
  /** Po zlém létě šance zlých let příští rok ×1,25 (disasters.md – Léto, Bekar 2019). */
  clusterFactor: 1.25,
  /**
   * Shlukování sahá nejvýš tolik let zpět – rok −8 má dlouhodobé četnosti; O(1) a stejné pro
   * všechny vsi kraje (návrh Clauda, plán – Datový model).
   */
  historyYears: 8,
  /** Průměr let, se kterým počítá osev (disasters.md – Dopady, Osev). */
  expectedYield: 0.95,
} as const;

/** Stupně roční nejvyšší vody (disasters.md – Povodeň potoka, tabulka). */
export interface FloodLevelRule {
  level: FloodLevel | null;
  chance: number;
  /** Výška vody nad hladinou potoka (m); žádná voda 0. */
  heightM: number;
}

/**
 * Povodeň potoka – voda kraje (disasters.md – Povodeň potoka; Martin 27. 10. 2026: „Ano a ano“ –
 * výška společná pro celý kraj). Stupně vzestupně; po dlouhé zimě a v deštivém létě o stupeň
 * výš (obojí naráz jen o jeden), tisíciletá zůstává. Kvůli posunu o stupeň vychází stoletá
 * a vyšší voda efektivně ≈ 3 % let, ne 1,8 % z tabulky.
 */
export const FLOOD_WATER = {
  levels: [
    { level: null, chance: 0.432, heightM: 0 },
    { level: 'small', chance: 0.3, heightM: 0.3 },
    { level: 'five', chance: 0.2, heightM: 0.7 },
    { level: 'twenty', chance: 0.05, heightM: 1.2 },
    { level: 'hundred', chance: 0.01, heightM: 2 },
    { level: 'twoHundred', chance: 0.005, heightM: 2.4 },
    { level: 'fiveHundred', chance: 0.002, heightM: 3 },
    { level: 'thousand', chance: 0.001, heightM: 3.5 },
  ] as const satisfies readonly FloodLevelRule[],
  /** Jarní voda (tání) a letní (bouřky) – okna dnů (disasters.md – Povodeň potoka, Kdy). */
  springWindow: { from: { month: 3, day: 1 }, to: { month: 3, day: 20 } },
  summerWindow: { from: { month: 6, day: 15 }, to: { month: 8, day: 15 } },
  /** Bez dlouhé zimy i deštivého léta (nebo s obojím) je voda jarní s touto šancí (půl na půl). */
  springShare: 0.5,
} as const;

/**
 * Ochrana dílu ze zeleně a vlhkosti (disasters.md – Ochrana dílu; Martin 27. 10. 2026: „Takhle to
 * sedí, zahrň i vlhkost půdy“). Počítá se 1. 4., jednou za rok.
 */
export const PROTECTION = {
  /** Kdy se ochrana dílů přepočítá. */
  day: { month: 4, day: 1 } satisfies MonthDay,
  /** Zeleň v dosahu do tolika metrů dává plnou ochranu, v `noGreenM` nulu, mezi nimi lineárně. */
  fullGreenM: 15,
  noGreenM: 100,
  /** Okraj velkého lesa chrání jen díl do tolika metrů od něj (přímo sousedící), dál se les nepočítá. */
  forestEdgeM: 15,
  /** Solitér (strom bez dalšího stromu do `soloLinkM`, jabloň u cesty) do `soloM` +`soloBonus`. */
  soloM: 50,
  soloBonus: 0.25,
  soloLinkM: 15,
  /** Remíz – strom nebo keř aspoň se dvěma dalšími do `remizLinkM` (tedy skupina od 3) je zeleň. */
  remizMinNeighbours: 2,
  remizLinkM: 15,
  /** U vody: voda do `nearWaterM` nebo díl v nivě (do `lowlandM` nad potokem), sucho +`waterBonus`. */
  nearWaterM: 60,
  lowlandM: 1.5,
  waterBonus: 0.2,
  /** Vyvýšený: víc než `raisedM` nad potokem a nad průměrem políček do `raisedRadiusM`, −`raisedPenalty`. */
  raisedM: 6,
  raisedRadiusM: 45,
  raisedPenalty: 0.2,
  /** Svah: převýšení k sousednímu políčku aspoň `slopeM` (10 %, návrh Clauda). */
  slopeM: 1.5,
  /** Deštivé léto: niva −`wetShift`, svah +`wetShift` (zeleň se nepočítá). */
  wetShift: 0.2,
  /** Kroupy: zeleň se počítá jen z `hailGreenShare` (rozptýlená pole proti kroupám). */
  hailGreenShare: 0.4,
  /** Ochrana snižuje ztrátu nejvýš o polovinu: ztráta × (1 − `lossShare` × ochrana). */
  lossShare: 0.5,
  /** Bez krajiny (kalibrace, testy) i pro díl bez údaje: typická ves. */
  noLandscapeGreen: 0.25,
} as const;

/** Místní pohromy (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou ochranu“). */
export const LOCAL_DISASTERS = {
  /** Prvních tolik let vsi žádné kroupy, povodeň, požár ani smršť; počasí kraje naplno. */
  protectionYears: 5,
} as const;
