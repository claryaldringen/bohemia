import { sameCell, type GridCell, type MemberHorse } from '@bohemia/game';
import type { PartyView } from './journey-view';
import type { ScenePerson } from './person-view';

// Tlačítka Osedlat / Sesednout / Domů v panelu vybraných lidí (expeditions.md – Co hráč vidí).
// Jen to, co se ukáže a zašedne; pravidla (kdo smí, kolik to trvá) má server – jádro výprav.

/** Co o vybraném člověku ví panel: složí se z `ScenePerson.expedition` a `PartyView`. */
export interface ExpeditionPersonState {
  personId: number;
  /** Má jezdeckého koně (umí jezdit). */
  rider: boolean;
  /** Sedí na koni. */
  mounted: boolean;
  /** Kůň u něj (`ridden` pod ním, `led` vedle); null – kůň je v ohradě. */
  horse: MemberHorse | null;
  /** Je ve skupině výpravy. */
  inParty: boolean;
  /** Stojí na domovské mapě (doma ve vsi nebo se skupinou na mapě vsi). */
  atHomeMap: boolean;
  /** Jeho skupina právě sedlá nebo odsedlává. */
  horseWork: boolean;
}

/** Stav tlačítka: skryté, povolené, nebo zašedlé s důvodem do popisku. */
export type ButtonState = 'hidden' | 'enabled' | { disabled: string };

export interface ExpeditionButtonStates {
  saddle: ButtonState;
  dismount: ButtonState;
  home: ButtonState;
}

/**
 * Stavy tlačítek pro vybrané lidi. Osedlat – je-li vybraný jezdec, který nesedí na koni (zašedlé,
 * když všichni takoví jsou mimo domovskou mapu a kůň je v ohradě, nebo jejich skupina právě sedlá);
 * Sesednout – sedí-li někdo na koni; Domů – je-li někdo ve skupině.
 */
export function expeditionButtons(
  people: readonly ExpeditionPersonState[],
): ExpeditionButtonStates {
  const unmounted = people.filter((p) => p.rider && !p.mounted);
  let saddle: ButtonState = 'hidden';
  if (unmounted.length > 0) {
    if (unmounted.some((p) => p.horseWork)) saddle = { disabled: 'Skupina právě sedlá.' };
    else if (unmounted.every((p) => !p.atHomeMap && p.horse === null))
      saddle = { disabled: 'Kůň je doma.' };
    else saddle = 'enabled';
  }
  return {
    saddle,
    dismount: people.some((p) => p.mounted) ? 'enabled' : 'hidden',
    home: people.some((p) => p.inParty) ? 'enabled' : 'hidden',
  };
}

/**
 * Výprava člověka pro tlačítka (`ExpeditionPersonState`): člen skupiny podle `PartyView` (kůň,
 * sedí, práce s koňmi; doma je, stojí-li jeho hlouček na mapě `homeCell` – bez ní se bere, že ano),
 * ostatní podle `ScenePerson.expedition` (doma bez koně u sebe). Bez údajů o výpravě null – i člověk,
 * kterého ves má ještě pryč, ale ve skupině (pohledu) není: hlouček už došel domů a ves to potvrdí
 * až další den, nebo pohled ještě nepřišel – Domů ani Osedlat by server odmítl („Je pryč.“).
 */
export function expeditionPersonState(
  person: ScenePerson | undefined,
  id: number,
  parties: readonly PartyView[],
  homeCell: GridCell | null,
): ExpeditionPersonState | null {
  for (const party of parties) {
    const member = party.people.find((m) => m.personId === id);
    if (!member) continue;
    const group = party.groups.find((g) => g.id === member.group);
    return {
      personId: id,
      rider: member.rider,
      mounted: member.mounted,
      horse: member.horse,
      inParty: true,
      atHomeMap: homeCell === null || group === undefined || sameCell(group.cell, homeCell),
      horseWork: party.horseWork !== null,
    };
  }
  if (!person?.expedition || person.expedition.inParty) return null;
  return {
    personId: id,
    rider: person.expedition.rider === true,
    mounted: false,
    horse: null,
    inParty: false,
    atHomeMap: true,
    horseWork: false,
  };
}
