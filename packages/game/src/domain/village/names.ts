import { createRandom } from '../landscape/random';
import type { PlacementCheck } from './placement';

// Jména vsí pro dialog založení – staročeská místní jména (podle přírody a osadníků).

export const VILLAGE_NAMES: readonly string[] = [
  'Libice',
  'Bělá',
  'Dobřany',
  'Chlumec',
  'Lužany',
  'Březí',
  'Dubá',
  'Lipany',
  'Olešnice',
  'Bukovany',
  'Jasenná',
  'Kamenice',
  'Bystřice',
  'Mokrá',
  'Dolany',
  'Poříčí',
  'Brod',
  'Doubravice',
  'Olšany',
  'Hrušov',
  'Sedlec',
  'Radotín',
  'Kojetice',
  'Bohušice',
  'Drahotice',
  'Slavětín',
  'Úhonice',
  'Vlkov',
  'Lomnice',
  'Chotěšov',
];

export const VILLAGE_NAME_MAX_LENGTH = 40;

/** Návrh jména vsi – stejný seed dá vždy stejné jméno. */
export function suggestVillageName(seed: number): string {
  const index = Math.floor(createRandom(seed).next() * VILLAGE_NAMES.length);
  return VILLAGE_NAMES[index]!;
}

/** Jméno bez okrajových mezer a se sloučenými vnitřními mezerami. */
export function normalizeVillageName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Jméno vsi po normalizaci: neprázdné a nejvýš VILLAGE_NAME_MAX_LENGTH znaků. */
export function checkVillageName(name: string): PlacementCheck {
  const normalized = normalizeVillageName(name);
  if (normalized.length === 0) return { ok: false, reason: 'Ves potřebuje jméno.' };
  if (normalized.length > VILLAGE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Jméno vsi může mít nejvýš ${VILLAGE_NAME_MAX_LENGTH} znaků.`,
    };
  }
  return { ok: true, reason: null };
}
