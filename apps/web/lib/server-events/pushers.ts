import 'server-only';
import type { Computers } from './hub';

// Počítadla stavu pro události ze serveru (docs/code/server-events.md – Rozbočovač): stav počítají
// tytéž funkce jako routes (`lib/journey.ts`, `lib/campaign.ts`, `lib/war-scene.ts`). Zatím
// prázdné – výpravy doplní Úloha 4, tažení a válku Úloha 5 (plán 2026-11-15).

/** Počítadla rozbočovače procesu webu. */
export function serverComputers(): Computers {
  return {};
}
