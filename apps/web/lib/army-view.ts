import type { CampaignEstimate, CampaignPlan, PersonRef, SurrenderOrder } from '@bohemia/game';

// Panel Vojsko (war.md – Co hráč vidí): tvary dat mezi serverem a rozhraním. Bez I/O – smí je
// importovat i klientský kód.

/** Muž rodu, který může na tažení. */
export interface ArmyManView {
  personId: number;
  /** Jméno muže rodu; bez jména null. */
  name: string | null;
  age: number;
  mounted: boolean;
}

/** Ves rodu v panelu Vojsko. */
export interface ArmyVillageView {
  id: string;
  name: string;
  /** Obilí ve skladu, které smí vojsko vzít (kg). */
  storesKg: number;
  lineMen: ArmyManView[];
  /** Vesničané 16–44 let způsobilí tažení. */
  candidates: number;
  /** Id dobrovolníků a ostatních způsobilých – prázdné, dokud není vybraný cíl. */
  volunteers: number[];
  others: number[];
  willing: number;
  unwilling: number;
}

/** Ves rodu ve válce, kterou lze napadnout. */
export interface ArmyTargetView {
  villageId: string;
  name: string;
  /** Jméno hlavy napadeného rodu; bez jména null. */
  lordName: string | null;
}

export interface ArmyPanelData {
  villages: ArmyVillageView[];
  targets: ArmyTargetView[];
  /** Hráčův muž (hlava rodu) – velí-li on, hráč vede živě. */
  lord: PersonRef | null;
}

export type { CampaignEstimate, CampaignPlan, SurrenderOrder };
