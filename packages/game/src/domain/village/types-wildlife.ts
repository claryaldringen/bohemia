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
