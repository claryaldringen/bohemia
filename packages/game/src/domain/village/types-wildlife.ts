// Typy stavu divoké zvěře vsi (wildlife.md – Kde zvěř žije a kolik jí je).
// Rozcestník je `types.ts`; další úlohy (škody, šelmy, lov…) přidávají jen volitelná pole.

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
