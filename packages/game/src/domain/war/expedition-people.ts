import { horsePens, isGrainHorse, penHorses } from '../village/livestock/horses';
import { currentLord, isLineMan } from '../village/people/dynasty';
import { villageHappiness } from '../village/people/happiness';
import { ageYears, isAway, isInjured } from '../village/people/people';
import type { Horse, Person, VillageState } from '../village/types';
import type { JourneyRecruit } from './journey-types';
import { JOURNEY, WAR } from './rules-war';
import { lineManStrength, villagerStrength } from './strength';

// Lidé ze vsi na výpravu (expeditions.md – Kdo smí jít; plán 2026-11-14 – Rozhodnutí 8, Úloha 5):
// kdo smí jít a s čím jde – síla do meče, boj proti šelmám, jezdecký kůň. Use-case výpravy
// (`application/expedition.ts`) podle toho dělí výběr hráče; pohled osob z toho bere důvod
// u kurzoru. Jen čte stav vsi.

/**
 * Proč člověk ze vsi na výpravu nejde (expeditions.md – Kdo smí jít): mladší 12 let (`young`),
 * raněný (`wounded`), na tažení (`campaign`), jinak pryč – robota, služba, zajetí, výprava
 * (`away`).
 */
export type ExpeditionPersonRefusal = 'young' | 'wounded' | 'campaign' | 'away';

/**
 * Člověk `person` vsi `state` ve dni `day` jako nový člověk výpravy, nebo důvod, proč nejde
 * (v pořadí `young`, `wounded`, `campaign`, `away`). Data rekruta: `recruitOf`. Stav vsi své id
 * nezná – `villageId` do `ref` doplní volající (chybí = prázdné).
 */
export function expeditionRecruit(
  state: VillageState,
  person: Person,
  day: number,
  villageId = '',
): JourneyRecruit | ExpeditionPersonRefusal {
  if (ageYears(person.bornDay, day) < JOURNEY.minAge) return 'young';
  if (isInjured(person, day)) return 'wounded';
  if (isAway(person, day)) return person.away?.kind === 'campaign' ? 'campaign' : 'away';
  return recruitOf(state, person, day, villageId);
}

/**
 * Data člověka na výpravu bez ověření, smí-li jít (`expeditionRecruit`): vojvoda (`currentLord`), boj `arms.combat` (proti šelmám – kdo bránit
 * neumí, má vyšší riziko), jméno, žena, den narození a síla do meče (Rozhodnutí 8; war.md – Síla:
 * bojují muži od 16 let): muž rodu `lineManStrength` pěšky, na svém jezdeckém koni
 * `strengthMounted`; vesničan `villagerStrength` podle štěstí vsi (jako nábor); ženy a mladší 0.
 * Jezdec (`horseId`) – kdo má v ohradě jezdeckého koně se svým `riderId` (`ridingHorseOf`).
 */
export function recruitOf(
  state: VillageState,
  person: Person,
  day: number,
  villageId = '',
): JourneyRecruit {
  const horse = ridingHorseOf(state, person.id, day);
  const fights = ageYears(person.bornDay, day) >= WAR.army.minAge;
  const line = fights && isLineMan(person);
  let strength = 0;
  if (line) strength = lineManStrength(person, null);
  else if (fights && person.sex === 'male') {
    strength = villagerStrength(false, villageHappiness(state));
  }
  return {
    ref: { villageId, personId: person.id },
    lord: currentLord(state)?.id === person.id,
    strength,
    fight: person.arms?.combat ?? 0,
    ...(person.name ? { name: person.name } : {}),
    ...(person.sex === 'female' ? { female: true as const } : {}),
    bornDay: person.bornDay,
    ...(horse ? { horseId: horse.id } : {}),
    ...(horse && line ? { strengthMounted: lineManStrength(person, horse) } : {}),
  };
}

/**
 * Jezdecký kůň člověka `personId` v ohradách koní vsi – `riderId` jeho, samec od 3 let
 * (`isGrainHorse`, jako `riderHorse` výpravy); jinak null. Jen čte stav.
 */
export function ridingHorseOf(state: VillageState, personId: number, day: number): Horse | null {
  for (const pen of horsePens(state)) {
    for (const horse of penHorses(pen)) {
      if (horse.riderId === personId && isGrainHorse(horse, day)) return horse;
    }
  }
  return null;
}
