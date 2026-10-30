// Stav správce vsi (steward.md – Stav správce). Vetá a odchozí schránka jsou zatím kostra pro další
// úlohy (soužití s hráčem, odchod synů).

/** Šablona rozvrhu vsi (steward.md – Plán sídla): shluk, řadová ves, samoty v polnostech. */
export type StewardTemplate = 'cluster' | 'row' | 'scattered';

/** Druh slotu plánu – místa pro stavby, které správce bere po pořadí. */
export type StewardSlotKind =
  'dwelling' | 'cemetery' | 'orchard' | 'pen' | 'threshing-floor' | 'workshop';

/** Druh stavby, na kterou se vztahuje veto (slot plánu nebo pole). */
export type StewardPlanKind = StewardSlotKind | 'field';

/**
 * Další etapa výpočtu plánu (steward.md – Výpočetní rozpočet): mapa hodnot a šablony běží v den
 * začátku přepočtu, pak kontroly míst domů po dávkách (`checks`), ostatní sloty (`slots`)
 * a hotovo. Každá etapa v jiném dni správce.
 */
export type StewardPlanStage = 'checks' | 'slots' | 'done';

/** Hospodářství plánu: dům (políčko) a blok pole (políčka od nejbližšího). */
export interface StewardFarm {
  house: number;
  /** Stojící obydlí vsi nebo jeho stavba (id) – chybí u domu ze slotu plánu. */
  dwellingId?: number;
  cells: number[];
}

/**
 * Uložený plán sídla (steward.md – Plán sídla). Místa jsou indexy políček krajiny
 * (y × size + x): dům stojí uprostřed políčka, čtverce polí a ostatních staveb jsou políčka.
 */
export interface StewardPlan {
  stage: StewardPlanStage;
  /** Den, kdy přepočet začal (etapa `sites`). */
  startDay: number;
  /** Den, kdy byl plán hotový – od něj se počítá `STEWARD.replanYears`. */
  doneDay?: number;
  /** Otisk – seřazená id staveb vsi v den začátku přepočtu (`planStamp`). */
  stamp: number[];
  /** Plán je na tolik lidí a domácností. */
  people: number;
  households: number;
  /** Políček v bloku pole jedné domácnosti. */
  blockCells: number;
  /** Rozpracované kontroly míst domů: zkontrolované domy slotu (od začátku), kontrol celkem. */
  checked?: number;
  checks?: number;
  /** Vybraná šablona a ceny všech tří (člověkodny na tunu čisté úrody – nižší je lepší). */
  template?: StewardTemplate;
  costs?: Partial<Record<StewardTemplate, number>>;
  /** Sloty po druzích v pořadí, jak je správce bere (`dwelling` – nové domy hospodářství). */
  slots: Partial<Record<StewardSlotKind, number[]>>;
  /** Hospodářství – stojící obydlí, pak nové domy ve stejném pořadí jako `slots.dwelling`. */
  farms: StewardFarm[];
  /** Sloty druhu došly – při příštím dni správce celý plán znovu (nastaví den správce). */
  exhausted?: true;
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
  /**
   * Značka „postavil správce“ – jen to, co správce skutečně založil: id staveb (`markStewardStarted`),
   * dílů polí (`FieldPart.id`, nové díly i při rozšíření hráčova pole) a entit, které stavba sama
   * založila (nové obydlí, pole, ohrada, hřbitov, sad, vylepšené úseky cest). Rozšíření stojící
   * ohrady či hřbitova (`Construction.extends`) označí jen id stavby – čtverce rozšíření se
   * nerozlišují, celek zůstává hráčův; přestavba a oprava hráčova domu nic neoznačí.
   */
  built: number[];
  plan?: StewardPlan;
  vetoes?: StewardVeto[];
  departures?: StewardDeparture[];
}
