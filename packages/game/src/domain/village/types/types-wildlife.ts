// Typy stavu divoké zvěře vsi (wildlife.md – Kde zvěř žije a kolik jí je).
// Rozcestník je `types.ts`; další úlohy (škody, šelmy, lov…) přidávají jen volitelná pole.

import type { HerdSpecies } from './types-livestock';

/** Krajina zvěře do 1 km od středu vsi (wildlife.md – Kde zvěř žije), k 1. 5. nebo převodu. */
export interface WildlifeLand {
  /** Souvislý les od 1 ha, bez čtverců vsi, s lesem vsi (ha). */
  forestHa: number;
  /** Louky, příloh a pole – zajíci (ha). */
  openHa: number;
  /** Voda – ryby (ha). */
  waterHa: number;
  /** Tůně do 1 km (loviště, nejvýš 3 rybáři na tůň). */
  pools: number;
}

/**
 * Divoká zvěř vsi (wildlife.md): kusy jsou čísla s podílem kusu jako stáda vsi. Lišky a vrány se
 * neukládají – odvodí se z krajiny (`wildlifeCaps`, `crowFlocks`).
 */
export interface WildlifeState {
  /** Krajina při posledním přepočtu (1. 5.) nebo převodu. */
  land: WildlifeLand;
  deer: { stags: number; hinds: number; calves: number };
  boar: { adults: number; piglets: number };
  hares: number;
  /** Lišky v kraji; chybí = strop `foxCount(land)` (do ok se loví, 1. 5. se vrátí na strop). */
  foxes?: number;
  wolves: number;
  /** Medvěd je v kraji; `backDay` = den, od kterého se po úlovku vrátí jiný (1. 5. po něm). */
  bear: { present: boolean; backDay: number | null };
  /** Biomasa ryb (kg). */
  fishKg: number;
  /** Škody na polích letošní sezóny (W2); chybí = ves ještě nepřešla 1. 6. */
  damage?: FieldDamage;
  /** Šelmy na dobytku (W3); chybí = ještě nic neměly. */
  predation?: Predation;
  /** Psi dvorce (W4; wildlife.md – Psi); chybí = dvorec psy ještě nechová. */
  dogs?: ManorDogs;
  /** Lov vsi (hunting.md) – úlovek roku a honci; chybí = ves ještě nelovila. */
  hunt?: HuntState;
  /** Ryby a oka vesničanů (W7; wildlife.md – Drobná zvěř a ryby); chybí = ještě nic nechytali. */
  smallGame?: SmallGameState;
  /** Noční hlídka polí letošní sezóny (W6; wildlife.md – Obrana polí); chybí = 1. 6. ještě nebylo. */
  watch?: FieldWatch;
  /** Jezdecká hlídka dnešního dne spočtená jednou (W6): škoda polí i úlovek z hlídky ji čtou stejnou. */
  patrol?: { day: number; power: number; cut: number };
  /**
   * Naděje úlovku prasat z jezdecké hlídky (W6, `patrolHuntDay`) – celé kusy se uloví, zlomek zůstane
   * (bez náhody); chybí = 0. Dřív sdílela naději prasat kalendářního lovu (`hunt.hope.boar`).
   */
  patrolHope?: number;
}

/** Úlovek ryb a zajíců od 1. 5. (kg masa se počítá zvlášť). */
export interface SmallGameYear {
  fishKg: number;
  hares: number;
  /** Lišky z ok od 1. 5. (chybí = 0). */
  foxes?: number;
  /** Maso ryb a zajíců od 1. 5. (kg; jí se čerstvé, bez práce porážky). */
  meatKg: number;
  /** Dny, kdy se chytalo. */
  days: number;
}

/**
 * Ryby a oka vesničanů (W7): dnešní rybáři pro scénu (rybáři s prutem u tůní), úlovek roku
 * a loňské maso ze zvěře (velký lov i drobná zvěř) pro rozhodnutí, jestli ves bílkoviny chce.
 */
export interface SmallGameState {
  /** Dnešní chytání: rybáři po tůních (index tůně → počet lidí) nebo oka; null = dnes ne. */
  today: { day: number; kind: 'fish' | 'snare'; pools: number[]; kg: number } | null;
  year: SmallGameYear;
  /**
   * Roční kvóta od 1. 5. (ryby: kg biomasy, zajíci: kusy) podle přírůstku; chybí = spočte se
   * při prvním chytání roku ze zásoby a úlovku.
   */
  quota?: { fishKg: number; hares: number; foxes?: number };
  /** Maso ze zvěře (velký lov i drobná zvěř) minulého roku (kg). */
  lastWildMeatKg?: number;
}

/**
 * Noční hlídka polí (wildlife.md – Noční hlídka vesničanů): plán z 1. 6. (díly s hrozbou škody
 * aspoň 10 % úrody za sezónu) a dnešní pokrytí dospělými. Po žních (31. 8.) se zahodí.
 */
export interface FieldWatch {
  /** Den 1. 6. sezóny. */
  fromDay: number;
  /** Hlídané díly: plocha (ha), hrozba bez hlídky (podíl úrody), kryté 1. stupněm 0–1, potřebují dospělé. */
  parts: { partId: number; ha: number; threat: number; free: number; adult: boolean }[];
  /** Hlídači 1. stupně (staří a výrostci mimo dvorec). */
  guards: { elders: number; youngsters: number };
  /** Dnešní pokrytí dospělými: den a podíl chtěné práce, který ves dala. */
  adultDay?: number;
  adultFrac?: number;
  /** Práce dospělých letos: chtěná a daná (člověkodny). */
  wantedManDays: number;
  paidManDays: number;
}

/**
 * Smečka dvorce: počet s podílem kusu. Starší vsi nesou ještě `fed` (psi dřív jedli obilí) – nečte se.
 */
export interface ManorDogs {
  count: number;
  fed?: boolean;
}

/** Druhy kusů úlovku (kronika, statistika roku). */
export interface HuntKills {
  boar: number;
  deer: number;
  wolves: number;
  bear: number;
}

/**
 * Lov vsi (hunting.md): úlovek roku a honci na zítřek. Starší vsi nesly i kalendářní lov a lov
 * navíc (`hope`, `today`, `extraDay`, `lastExtraDay`) – převod `calendar-hunt` je smaže.
 */
export interface HuntState {
  /** Úlovek od 1. 5. – kusy po druzích, kg masa, dny lovu (panel dvorce). */
  year: HuntKills & { meatKg: number; days: number };
  /**
   * Honci na den `day`: `men` mužů celý den mimo práci vsi (hunting.md – Pravidla 2) – práci dne
   * `day` vezmou z dílu mužů na stavby (`allocateDay` – `beaters`).
   */
  beaters?: { day: number; men: number };
  /**
   * Počet vyhlášených lovů vsi – pořadí vyhlášení je štítek losu zvířete (`pickQuarry`), takže
   * druhý lov téhož dne vyžene jiné zvíře. Chybí = 0.
   */
  declared?: number;
  /**
   * Lov správce (hunting.md – Pravidla 8; plán 2026-11-22-hunting – Úloha 8): v den `day` ho ves
   * dopočte v kroku dne bez scény (`npcHuntDay`). Chybí = správce lov nevyhlásil.
   */
  npc?: { day: number };
}

/**
 * Zvíře, které honci vyženou (hunting.md – Pravidla 3): jelen, laň, kanec, bachyně, vlk, medvěd.
 * Kanec i bachyně jsou ve stavu zvěře dospělá prasata (`boar.adults`) – stav je nerozlišuje.
 */
export type QuarryKind = 'stag' | 'hind' | 'boar' | 'sow' | 'wolf' | 'bear';

/**
 * Výsledek lovu pro ves (hunting.md – Pravidla 5–7; `applyHuntResult`): vydá ho výprava jednou
 * při konci lovu (událost schránky `hunt-result`), nebo lov správce v kroku dne.
 */
export interface HuntResult {
  quarry: QuarryKind;
  /** Zvíře padlo (jinak uteklo do lesa). */
  killed: boolean;
  /** Jména útočníků, první = kdo zvíře složil (kronika `hunt`). */
  names: string[];
  /** Herní hodiny výcviku po lidech (plán 2026-11-22-hunting – Rozhodnutí 7). */
  trained: { personId: number; hours: { bow: number; combat: number; riding: number } }[];
  /** Lovci, které zvíře (nebo šíp druhého lovce) zranilo nebo zabilo. */
  casualties: { personId: number; outcome: 'wounded' | 'dead' }[];
  /** Id koní, kteří v boji padli – z vsi se ztratí (`loseHorse`). */
  horsesLost: number[];
}

/** Škody šelem na dobytku (wildlife.md – Vlci na dobytku): akumulátory celých kusů do kroniky. */
export interface Predation {
  /** Zlomky kusů strhnutých vlky; celé kusy odejdou do kroniky. */
  acc: Record<HerdSpecies, number>;
  /** Zlomek prasete, které vzal medvěd. */
  bearAcc?: number;
  /** Celé kusy vlků a medvěda za rozpracovaný měsíc; poslední den měsíce jdou do kroniky. */
  monthHeads?: { wolf: Record<HerdSpecies, number>; bear: number };
  /** Dny, kdy šelmy strhly celý kus, za posledních 30 dní (upozornění, lov vlků). */
  killDays: number[];
  /** Kusy strhnuté od 1. 5. po druzích (tooltip). */
  yearHeads: Record<HerdSpecies, number>;
}

/**
 * Škody zvěře na polích sezóny (wildlife.md – Škody, Prasata a jeleni na polích): ohrožené díly
 * spočítané 1. 6. a ztráty po dílech (jen nenulové). Po žních (31. 8.) se `risk` a `parts` vyprázdní,
 * aby ztráty neovlivnily výhled další sezóny.
 */
export interface FieldDamage {
  /** Den 1. 6. sezóny. */
  fromDay: number;
  /** Osetý díl ozimu nebo jaře: plocha × váha od lesa (ha) a vzdálenost od okraje lesa (m). */
  risk: { partId: number; weightHa: number; edgeM: number }[];
  /** Ztráta dílu: podíl hrubé úrody (nejvýš `FIELD_DAMAGE.maxShare`) a kg obilí. */
  parts: Record<string, { share: number; kg: number }>;
  /** Díl s dnes největší škodou (scéna); null = žádná. */
  topPartId: number | null;
  /** Škoda letos celkem (kg obilí; kronika, upozornění). */
  totalKg: number;
  /** Škoda minulé sezóny (kg; tooltip druhu). */
  lastYearKg?: number;
}

/** Stropy kusů podle krajiny (neukládají se). */
export interface WildlifeCaps {
  deer: number;
  boar: number;
  hares: number;
  foxes: number;
  wolves: number;
  bear: boolean;
  fishKg: number;
}
