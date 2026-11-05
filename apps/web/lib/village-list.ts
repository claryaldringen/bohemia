import {
  isFullVillage,
  villageDigest,
  type DynastyVillage,
  type HungerLevel,
  type VillageDigest,
} from '@bohemia/game';
import { otherVillageDisasters, type OtherVillageDisasters } from './disasters-view';

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
  /**
   * Humno (production-chains.md – Humno): před žněmi ves bez humna (`floorNeeded`), snopy čekají
   * na humno (`waiting`) – pro upozornění z jiné vsi; nic z toho – bez údaje.
   */
  threshing?: { emergency?: true };
  /**
   * Pohromy (disasters.md – Co hráč vidí): odhalené zlé počasí roku a poslední místní pohroma –
   * pro upozornění z jiné vsi; nic – bez údaje.
   */
  disasters?: OtherVillageDisasters;
  /** Správce vsi je zapnutý (steward.md – Co hráč vidí); vypnutý bez údaje. */
  steward?: true;
  /** Je tu hráčův muž – vlastní ves hráče (seniorate.md – Hráčův muž a vlastní ves); jinak bez údaje. */
  playerLord?: true;
  /** Je tu senior rodu – stolec (seniorate.md – Seniorát); jinak bez údaje. */
  senior?: true;
}

/**
 * Položka přepínače z uložené vsi (celé, nebo jen se souhrnem – `dynastyForVillage`) v den
 * `day`. Celá ves jde přes týž souhrn (`villageDigest`), takže položka ze souhrnu je táž jako
 * ze stavu; na dni závisí jen počasí roku (ze vstupů v souhrnu).
 */
export function villageListItem(
  village: DynastyVillage,
  day: number,
  /** Ves hráčova muže (`DynastyView.playerLord.villageId`). */
  playerLordVillageId?: string,
  /** Ves seniora rodu (`House.senior.villageId`). */
  seniorVillageId?: string,
): VillageListItem {
  const digest = isFullVillage(village) ? villageDigest(village.state) : village.digest;
  const item = listItemOf(village, digest, day);
  return {
    ...item,
    ...(playerLordVillageId === village.id ? { playerLord: true as const } : {}),
    ...(seniorVillageId === village.id ? { senior: true as const } : {}),
  };
}

function listItemOf(
  village: Pick<DynastyVillage, 'id' | 'settlementId' | 'name'>,
  digest: VillageDigest,
  day: number,
): VillageListItem {
  const extinct = digest.extinctDay !== undefined;
  const abandoned = digest.abandonedDay !== undefined;
  // ves se nesimuluje (`isVillageDormant`) – hlad, humno ani pohromy se neukazují
  const dormant = extinct || abandoned || digest.travelling;
  const disasters = dormant
    ? undefined
    : otherVillageDisasters(
        {
          weatherSeed: digest.weatherSeed,
          disasters: digest.disasters,
          chronicle: digest.lastLocalDisaster ? [digest.lastLocalDisaster] : [],
        },
        day,
      );
  return {
    id: village.id,
    settlementId: village.settlementId,
    name: village.name,
    // opuštěná ves po konci rodu drží lidi jen jako záznam – nikdo v ní nežije (lord.md)
    people: abandoned ? 0 : digest.people,
    extinct,
    abandoned,
    travelling: digest.travelling,
    hunger: dormant ? 'fed' : digest.hunger,
    ...(!dormant && digest.threshingEmergency ? { threshing: { emergency: true as const } } : {}),
    ...(disasters ? { disasters } : {}),
    ...(digest.steward ? { steward: true as const } : {}),
  };
}

/**
 * Akce nad jinou vsí ze seznamu (správce) vrátí pohled té vsi – zobrazená ves zůstane a z odpovědi
 * se vezme jen aktualizovaný seznam vsí. Stejná ves nebo nic zobrazeného: odpověď beze změny.
 */
export function keepShownVillage<T extends { id: string; villages: VillageListItem[] }>(
  shown: T | null,
  result: T,
): T {
  if (!shown || shown.id === result.id) return result;
  return { ...shown, villages: result.villages };
}
