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
  /** Velký lov rodu (W4; wildlife.md – Lov rodu); chybí = rod ještě nelovil. */
  hunt?: HuntState;
}

/** Smečka dvorce: počet s podílem kusu a zda ji ves naposled nakrmila (štěňata jen z nakrmené). */
export interface ManorDogs {
  count: number;
  fed: boolean;
}

/** Druhy kusů úlovku (kronika, statistika roku). */
export interface HuntKills {
  boar: number;
  deer: number;
  wolves: number;
  bear: number;
}

/** Velký lov rodu (wildlife.md – Lov rodu): akumulátory úlovku, lov dne a součty roku. */
export interface HuntState {
  /** Naděje úlovku po druzích – celé kusy se uloví, zlomek zůstane (bez náhody). */
  hope: { boar: number; deer: number; wolf: number; bear: number };
  /** Lov dne – rozhodne `planHuntDay` ráno; null = dnes se neloví. */
  today: HuntDay | null;
  /** Lov navíc na pokyn hráče (den; až W5). */
  extraDay?: number | null;
  /** Poslední lov navíc (omezení 1× za 3 dny; až W5). */
  lastExtraDay?: number;
  /** Úlovek od 1. 5.: kusy po druzích, kg masa a dnů lovu (panel dvorce). */
  year: HuntKills & { meatKg: number; days: number };
}

/** Lov jednoho dne: cíl, kdo jede na koni a kdo jde pěšky (id lidí). */
export interface HuntDay {
  day: number;
  /** Prasata a jeleni zároveň / vlci / medvěd. */
  target: 'game' | 'wolves' | 'bear';
  riders: { personId: number; horseId: number }[];
  /** Pěší lovci: muži dvorce bez koně a odešlí synové rodu. */
  foot: number[];
  /** Lov navíc na pokyn hráče (až W5). */
  extra: boolean;
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
