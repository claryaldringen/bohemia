import { dateOfDayIndex } from '../calendar';
import { WAR } from './rules-war';

// Zima tažení (war.md – Nájezdy bez omezení – roční doba a zima): od 1. 12. do konce února jde
// vojsko sněhem pomaleji (`marchSpeed`) a venku ho unavuje mráz; zastávka ve vsi mráz zastaví
// a muži se zotaví.

/** Je herní den `day` v zimě tažení (prosinec až únor – `WAR.frost`)? */
export function isMarchWinter(day: number): boolean {
  const month = dateOfDayIndex(day).month;
  return month >= WAR.frost.fromMonth || month <= WAR.frost.toMonth;
}

/** Co mráz mění u muže tažení: zdraví (0–100) a síla jako podíl plné (0–1). */
export interface FrostMember {
  health: number;
  vigor: number;
}

/** Změna zdraví a síly muže za herní den. */
export interface MemberDelta {
  health: number;
  vigor: number;
}

/**
 * Únava z mrazu za herní den `day` (war.md – Zima; čísla návrh Clauda): v zimě venku (`outside`)
 * −3 zdraví a −2 % síly; ve vsi (vlastní, neutrální, která vojsko pustí, nebo dobytá) se muž
 * zotaví +10 zdraví a +5 % síly za den až do plných – i po zimě, dokud únavu nedohoní (návrh
 * Clauda). Mimo zimu venku beze změny. Zdraví neklesne pod 0, síla pod 0 ani nad 1.
 */
export function frostDay(member: FrostMember, outside: boolean, day: number): MemberDelta {
  const full = WAR.combat.health;
  if (!outside) {
    return {
      health: Math.max(0, Math.min(WAR.frost.healthGainPerDay, full - member.health)),
      vigor: Math.max(0, Math.min(WAR.frost.strengthGainPerDay, 1 - member.vigor)),
    };
  }
  if (!isMarchWinter(day)) return { health: 0, vigor: 0 };
  return {
    health: -Math.max(0, Math.min(WAR.frost.healthLossPerDay, member.health)),
    vigor: -Math.max(0, Math.min(WAR.frost.strengthLossPerDay, member.vigor)),
  };
}
