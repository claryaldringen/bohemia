// Manželky mužů rodu (lord.md – Rod vojvody, Manželky): nová hlavní manželka po smrti hlavní;
// další manželky přicházejí ze skutečných sousedních vsí (`kin-match.ts` – markets.md, Rozhodnutí
// plánu 3, bod 12). U ženy je `spouseId` její muž (i u vedlejší), u muže hlavní manželka – symetrie
// platí jen pro hlavní (docs/code/village-people.md – Příbuzenství). Kroky dne mutují stav.
import { wivesOf } from './dynasty';
import { chronicleEstate } from './estate';
import type { ChronicleEstate, ChronicleEvent, Person, VillageState } from '../types';

/**
 * Kdo v zápisu o ženě muže rodu (Martin 15. 11. 2026: „Vojvoda Lutobor si vzal Dobravu.“,
 * „Dobrava se stala hlavní manželkou vojvody Lutobora.“): jméno a postavení muže v den zápisu
 * a jméno ženy.
 */
export function wivesWho(
  state: VillageState,
  man: Person,
  wife: Person,
  day: number,
): { name?: string; estate: ChronicleEstate; wife?: string } {
  return {
    ...(man.name === undefined ? {} : { name: man.name }),
    estate: chronicleEstate(state, man, day),
    ...(wife.name === undefined ? {} : { wife: wife.name }),
  };
}

/** Kolik žijících manželek má který muž (podle `spouseId` žen). */
export function wifeCounts(state: VillageState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const w of state.people) {
    if (w.sex === 'female' && w.spouseId !== undefined) {
      counts.set(w.spouseId, (counts.get(w.spouseId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Kde bude další manželka bydlet (lord.md – Manželky – Bydlení; Martin 24. 10. 2026: „Vedlejší
 * manželky odcházejí do vlastních obydlí až teprve, je-li dvorec přeplněný.“): vždy v domě muže,
 * i když ho přeplní – z přeplněného domu pak při osídlení odchází vedlejší manželka s nejstarším
 * synem (`secondaryWifeFamilies`). Muž bez obydlí – nikde (nepřijde).
 */
export function extraWifeHome(state: VillageState, man: Person): number | undefined {
  return state.dwellings.some((d) => d.id === man.dwellingId) ? man.dwellingId : undefined;
}

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/**
 * Nová hlavní manželka (lord.md – Nová hlavní manželka; Martin 24. 10. 2026 – matka dědice): matka
 * nejstaršího žijícího syna muže, jehož matka žije a je mužovou manželkou; bez takového syna
 * nejdéle vdaná (nejnižší id).
 */
function newMainWife(state: VillageState, man: Person): Person | undefined {
  const wives = wivesOf(state, man);
  const wifeIds = new Set(wives.map((w) => w.id));
  const heirMother = state.people
    .filter(
      (p) =>
        p.sex === 'male' &&
        p.fatherId === man.id &&
        p.motherId !== undefined &&
        wifeIds.has(p.motherId),
    )
    .sort(byAge)[0]?.motherId;
  return wives.find((w) => w.id === heirMother) ?? wives[0];
}

/**
 * Muž bez hlavní manželky se žijícími manželkami (zemřela hlavní, nebo z výpravy odešel jen
 * s vedlejší) dostane novou hlavní (`newMainWife`). Její synové s ním jsou synové hlavní manželky
 * (`mainWifeSon`). Nebydlí-li s ním, přestěhuje se k němu se svobodnými dětmi z domu, i do
 * přeplněného (přeplnění řeší Bydlení). Bez náhody; ves bez vícežeňství – nic (každý muž s ženou
 * má `spouseId`). Mutuje stav, vrací kroniku `main-wife`.
 */
export function ensureMainWives(state: VillageState, day: number): ChronicleEvent[] {
  const unwed = new Set<number>();
  for (const p of state.people) if (p.sex === 'male' && p.spouseId === undefined) unwed.add(p.id);
  const husbands = new Set<number>();
  for (const w of state.people) {
    if (w.sex === 'female' && w.spouseId !== undefined && unwed.has(w.spouseId)) {
      husbands.add(w.spouseId);
    }
  }
  if (husbands.size === 0) return [];
  const events: ChronicleEvent[] = [];
  for (const id of [...husbands].sort((a, b) => a - b)) {
    const man = state.people.find((p) => p.id === id);
    const main = man && newMainWife(state, man);
    if (!man || !main) continue;
    man.spouseId = main.id;
    const from = main.dwellingId;
    for (const p of state.people) {
      if (p.fatherId === man.id && p.motherId === main.id && p.sex === 'male') p.mainWifeSon = true;
      const moves =
        p.dwellingId === from &&
        (p.id === main.id || (p.motherId === main.id && p.spouseId === undefined));
      if (from !== man.dwellingId && moves) p.dwellingId = man.dwellingId;
    }
    events.push({ day, kind: 'main-wife', ...wivesWho(state, man, main, day) });
  }
  return events;
}
