// Otroci (markets.md – Pravidla 7, Rozhodnutí plánu 5): odvedený pohan je od usazení otrok.

import type { Person } from '../types';
import { isChristian } from './faith';

/** Je člověk otrok? */
export function isSlave(p: Person): boolean {
  return p.slave === true;
}

/** Otroka jde prodat (Pravidla 7 – jen pohana; Rozhodnutí plánu 5, bod 6): otrok, ne křesťan, ne `line`, ne `noble`. */
export function canBeSold(p: Person): boolean {
  return isSlave(p) && !isChristian(p) && p.line === undefined && p.noble === undefined;
}

/**
 * Odvedený se stane otrokem, je-li pohan (mutuje záznam); křesťan zůstane, čím byl (Rozhodnutí 1 a 2).
 * „Led“, ne „captive“ – captive je v kódu zajatec k výkupnému (`away.kind 'captive'`).
 */
export function enslaveLed(p: Person): void {
  if (!isChristian(p)) p.slave = true;
}
