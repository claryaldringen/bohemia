// Stav správce vsi (steward.md – Stav správce). Plán, vetá a odchozí schránka jsou zatím kostra
// pro další úlohy (plán sídla, soužití s hráčem, odchod synů).

/** Druh stavby, na kterou se vztahuje veto (kostra – doplní plán sídla). */
export type StewardPlanKind = string;

/** Uložený plán sídla a jeho otisk (kostra – doplní plán sídla). */
export interface StewardPlan {
  /** Otisk vsi, pro kterou plán vznikl. */
  fingerprint: string;
}

/** Veto hráče: tentýž druh stavby se na políčku do dne `untilDay` nestaví. */
export interface StewardVeto {
  kind: StewardPlanKind;
  cell: { x: number; y: number };
  untilDay: number;
}

/** Odchozí schránka odchodu synů (kostra). */
export interface StewardDeparture {
  personId: number;
}

export interface StewardState {
  /** Správce vsi řídí. */
  on: boolean;
  /** Od kdy je zapnutý / vypnutý (den poslední změny). */
  sinceDay: number;
  /** Značka „postavil správce“: id staveb, které založil, a těch, které z nich vznikly. */
  built: number[];
  plan?: StewardPlan;
  vetoes?: StewardVeto[];
  departures?: StewardDeparture[];
}
