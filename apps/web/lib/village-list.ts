import {
  isVillageAbandoned,
  isVillageDormant,
  isVillageExtinct,
  isVillageTravelling,
  summarizeVillage,
  type HungerLevel,
  type VillageRecord,
} from '@bohemia/game';

// Vsi hráče pro přepínač v horní liště (migration.md – Víc vsí jednoho hráče): jméno, lidé
// a co se v nich děje – upozornění z jiné vsi se ukážou i při pohledu na jinou ves. Čistý modul
// – smí i do prohlížeče.

/** Ves hráče v přepínači vsí. */
export interface VillageListItem {
  id: string;
  /** Sídlo (mapa) vsi – ves na jiné mapě se přepne novým načtením stránky (jiná krajina). */
  settlementId: string;
  name: string;
  /** Lidé ve vsi. */
  people: number;
  /** Ves vymřela. */
  extinct: boolean;
  /** Ves je opuštěná – odešli všichni (migration.md). */
  abandoned: boolean;
  /** Lidé jsou na cestě na novou mapu – ves ještě nestojí (migration.md). */
  travelling: boolean;
  /**
   * Stupeň hladu (population.md – Co hráč vidí): šetří jídlem, hladoví, lidé umírají hlady – pro
   * upozornění z jiné vsi.
   */
  hunger: HungerLevel;
}

/** Položka přepínače z uložené vsi dopočítané do dne `day`. */
export function villageListItem(record: VillageRecord, day: number): VillageListItem {
  const extinct = isVillageExtinct(record.state);
  const dormant = isVillageDormant(record.state);
  const summary = dormant ? null : summarizeVillage(record.state, day);
  return {
    id: record.id,
    settlementId: record.settlementId,
    name: record.name,
    people: record.state.people.length,
    extinct,
    abandoned: isVillageAbandoned(record.state),
    travelling: isVillageTravelling(record.state),
    hunger: summary?.hunger ?? 'fed',
  };
}
