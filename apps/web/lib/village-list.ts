import { isVillageExtinct, summarizeVillage, type VillageRecord } from '@bohemia/game';

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
  /** Ves hladoví – zásoby nevystačí do sklizně. */
  hungry: boolean;
  /** Lidé umírají hlady. */
  starving: boolean;
}

/** Položka přepínače z uložené vsi dopočítané do dne `day`. */
export function villageListItem(record: VillageRecord, day: number): VillageListItem {
  const extinct = isVillageExtinct(record.state);
  const summary = extinct ? null : summarizeVillage(record.state, day);
  return {
    id: record.id,
    settlementId: record.settlementId,
    name: record.name,
    people: record.state.people.length,
    extinct,
    hungry: summary?.hungry ?? false,
    starving: summary?.starving ?? false,
  };
}
