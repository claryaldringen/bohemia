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
 * výš (obojí naráz jen o jeden), tisíciletá zůstává.
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

/** Místní pohromy (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou ochranu“). */
export const LOCAL_DISASTERS = {
  /** Prvních tolik let vsi žádné kroupy, povodeň, požár ani smršť; počasí kraje naplno. */
  protectionYears: 5,
} as const;

/**
 * Požár (disasters.md – Požár; Martin 27. 10. 2026: „Pojďme na požár“, „Ano a ano“ – řetězově
 * z každé stavby, která chytí).
 */
export const FIRE = {
  /** Šance stavby na rok (ves s 15 domy ≈ 6 % ročně). */
  perBuildingPerYear: 0.004,
  /** Násobky šance: suché léto, kruté sucho, deštivé léto (duben–srpen). */
  dryFactor: 2,
  droughtFactor: 3,
  wetFactor: 0.5,
  summerMonths: { from: 4, to: 8 },
  /** Zima – topí se (listopad–únor). */
  winterFactor: 1.5,
  winterMonths: [11, 12, 1, 2] as readonly number[],
  /** Kovárna, milíř a pec; zemnice (nevelká, hlína). */
  craftFactor: 3,
  zemniceFactor: 0.5,
  /** Přeskok podle vzdálenosti obrysů – od nejbližšího pásma: do 6 m 70 %, do 12 m 40 %. */
  jumps: [
    { reachM: 6, chance: 0.7 },
    { reachM: 12, chance: 0.4 },
  ] as const,
  /** Zeleň (listnatý strom, keř, sad) na spojnici půlí šanci přeskoku. */
  greeneryFactor: 0.5,
  /** Strom nebo keř je „na spojnici“, je-li od ní nejvýš tolik (m) – návrh Clauda. */
  greeneryReachM: 2,
  /**
   * Hašení řetězem (P8): přeskok × (1 − spreadCut × účinnost), stav stavby klesne o
   * 1 − damageShare × účinnost; `handoverM` = největší rozestup, na který si lidé podávají vědra
   * z ruky do ruky (víc – každý nosí po svém úseku), účinnost = min(1; handoverM ÷ rozestup).
   */
  firefighting: { spreadCut: 0.7, damageShare: 0.5, handoverM: 2.5 },
} as const;

/**
 * Sousedé po zlém roce (disasters.md – Co z toho plyne, Obchod; návrh Clauda, rešerše, schváleno
 * Martinem 27. 10. 2026): při doplnění 1. 11. zásoba obilí a hodnota ostatního zboží v kg obilí
 * (obilí je dražší). Zlý rok = zlé léto, krutý = `isCruelYear`.
 */
export const DISASTER_TRADE = {
  bad: { grainStock: 0.5, goodsValue: 0.67 },
  cruel: { grainStock: 0.25, goodsValue: 0.5 },
} as const;

/**
 * Zvěř po zlém počasí (disasters.md – Co z toho plyne, Zvěř): 1. 5. po holomrazné nebo dlouhé
 * zimě ubude navíc část jelení zvěře a prasat; po krutém suchu (málo žaludů loni na podzim) jen
 * poloviční selata.
 */
export const DISASTER_WILDLIFE = {
  badWinterDeerLoss: 0.1,
  badWinterBoarLoss: 0.15,
  droughtPigletShare: 0.5,
} as const;
