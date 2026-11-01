// Stav správce vsi (steward.md – Stav správce). Vetá (soužití s hráčem) a odchozí schránka odchodu synů – `StewardDeparture`.
import type { Settlers } from './departure';
import type { Direction8 } from './types-state';

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

/** Hospodářství plánu: dům (políčko) a blok pole. */
export interface StewardFarm {
  house: number;
  /** Stojící obydlí vsi nebo jeho stavba (id) – chybí u domu ze slotu plánu. */
  dwellingId?: number;
  /**
   * Blok pole jako běhy seřazených indexů políček `[začátek, délka, začátek, délka, …]` – v plánu
   * se tak drží stovky bytů místo kilobajtů; `farmCells` je rozbalí od nejbližšího políčka k domu.
   */
  runs: number[];
}

/**
 * Uložený plán sídla (steward.md – Plán sídla). Místa jsou indexy políček krajiny
 * (y × size + x): dům stojí uprostřed políčka, čtverce polí a ostatních staveb jsou políčka.
 */
export interface StewardPlan {
  stage: StewardPlanStage;
  /**
   * Verze pravidel rozvrhu (`STEWARD_PLAN_VERSION`); plán bez ní nebo se starší se přepočítá
   * vedle platného (steward.md – Pole blízko a podle práce).
   */
  version?: number;
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
  /**
   * Sloty po druzích v pořadí, jak je správce bere (`dwelling` – nové domy hospodářství). Jen
   * ověřené kontrolou umístění (`checkPlanSlot`); u domů v etapě `checks` jen prvních `checked`.
   */
  slots: Partial<Record<StewardSlotKind, number[]>>;
  /** Etapa `slots`: kandidáti ostatních druhů v pořadí, ještě neověření (po ověření zmizí). */
  candidates?: Partial<Record<StewardSlotKind, number[]>>;
  /** Hospodářství – stojící obydlí, pak nové domy ve stejném pořadí jako `slots.dwelling`. */
  farms: StewardFarm[];
  /**
   * Sloty druhu došly – celý plán znovu, nejdřív `STEWARD.exhaustedReplanDays` po dokončení
   * (nastaví den správce).
   */
  exhausted?: true;
}

/** Veto hráče: tentýž druh stavby se na políčku do dne `untilDay` nestaví. */
export interface StewardVeto {
  kind: StewardPlanKind;
  cell: { x: number; y: number };
  untilDay: number;
}

/** Směr odchodu na novou mapu a dny cesty (od dvorce ke kraji mapy, po hotové stezce 1 den). */
export interface StewardDirection {
  direction: Direction8;
  travelDays: number;
}

/**
 * Záznam odchozí schránky (steward.md – Kde správce běží, Jména synů a odchod syna): syn vojvody
 * odešel s dílem vsi a use-case `settleStewardDepartures` pro něj založí novou ves. Seed, jméno
 * a cíl spočítala simulace deterministicky.
 */
export interface StewardDeparture {
  /** Id záznamu – den odchodu (nejvýš jeden odchod za rok); podle něj je vybavení idempotentní. */
  id: number;
  sonId: number;
  /** Seed nové vsi (`deriveSeed(seed vsi, 'steward-son:' + den)`). */
  seed: number;
  /** Jméno nové vsi (`suggestVillageName(seed)`). */
  name: string;
  /**
   * Směry na novou mapu v pořadí, jak je správce zkouší (napřed hotová stezka, pak nejkratší cesta
   * ke kraji, při shodě pevné pořadí) – use-case vezme první, kde není vlastní ves.
   */
  directions: StewardDirection[];
  /** Osadníci, dokud ves nevznikla – po vybavení zmizí. */
  settlers?: Settlers;
  /** Id založené vsi (záznam je vybavený). */
  villageId?: string;
  /** Kolikrát se vybavení nezdařilo (nikam nešlo) – po `STEWARD.departureAttempts` se nezkouší. */
  attempts?: number;
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
  /** Platný plán – podle něj správce staví (i během přepočtu). První plán vsi i rozpracovaný. */
  plan?: StewardPlan;
  /** Rozpracovaný přepočet: počítá se po etapách vedle `plan`, hotový ho jedním krokem nahradí. */
  nextPlan?: StewardPlan;
  vetoes?: StewardVeto[];
  /**
   * Plán je třeba přepočítat hned (nejbližší den správce), bez čekání na `replanYears` a počet
   * změn: stavba hráče na plánovaném místě, odchod syna. Zmizí, když se začne počítat nový plán.
   */
  replan?: true;
  departures?: StewardDeparture[];
  /** Co správce zkusil a nešlo (cesta, směr stezky) – nezkouší znovu do `untilDay`. */
  skips?: { kind: string; id: number; untilDay: number }[];
  /**
   * Nejvyšší nahromaděný hlad (`starvationDays`) od posledního dne odchodu syna – spouštěč odchodu
   * v pasti osiva (`STEWARD.departureHungerDays`). Chybí – ves od té doby nehladověla.
   */
  hungerPeak?: number;
  /**
   * `hungerPeak` předchozího roku odchodu (do minulého 31. 8.) – hladověla-li přelidněná ves už
   * loni, pole navíc rok nepomohla a syn odejde i s místem na pole. Chybí – loni nehladověla.
   */
  lastYearHunger?: number;
  /**
   * Nahromaděný hlad v minulý den správce – Nouze, jen když hlad od té doby roste (steward.md –
   * Režim správce). Chybí – 0.
   */
  lastHunger?: number;
}
