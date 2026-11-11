// Manželky mužů rodu (lord.md – Rod vojvody, Manželky): další manželky z okolí a nová hlavní
// manželka po smrti hlavní. U ženy je `spouseId` její muž (i u vedlejší), u muže hlavní manželka –
// symetrie platí jen pro hlavní (docs/code/village-people.md – Příbuzenství). Kroky dne mutují stav.
import { createRandom, deriveSeed } from '../../landscape/random';
import { isDynastyTracked, isLineMan, wivesOf } from './dynasty';
import { rodBaptized } from './faith';
import { neighbor, weddingChancePerDay } from './marriage';
import { ageYears } from './people';
import { BIRTH_SPACING } from '../rules';
import { LORD } from '../rules/rules-lord';
import type { ChronicleEvent, Person, VillageState } from '../types';

const DAYS_PER_YEAR = 365.25;

/** Denní pravděpodobnost události, která nastane `perYear` ročně. */
function perDay(perYear: number): number {
  return 1 - (1 - perYear) ** (1 / 365);
}

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/** Kolik žijících manželek má který muž (podle `spouseId` žen). */
function wifeCounts(state: VillageState): Map<number, number> {
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
function extraWifeHome(state: VillageState, man: Person): number | undefined {
  return state.dwellings.some((d) => d.id === man.dwellingId) ? man.dwellingId : undefined;
}

/**
 * Další manželky z okolí dne (lord.md – Manželky): muž rodu od LORD.extraWifeFromAge let s 1 až
 * LORD.maxWives − 1 žijícími manželkami si s LORD.extraWifePerYear ročně přivede ženu z okolí
 * (16–22 let, rodiče neznámí). Muži v pořadí id, jeden los na muže z vlastního proudu
 * (`'wife:' + den`), takže sňatky ani porody vsi se nemění. V hladu nepřijde, jinak bydlí v domě
 * muže (`extraWifeHome`). Hlavní manželka muže (`spouseId`) zůstává. Pod pojistkou zásob
 * (`storesFill` < 1) přijde se šancí `weddingChancePerDay` jako svatba z okolí (kinship.md –
 * Sňatky čekají na zásoby). Ves bez rodu a ves pokřtěného rodu (christianity.md – Jediná manželka:
 * nové vedlejší manželky už nepřibudou, ani za nástupce narozeného před křtem) – nic. Mutuje stav,
 * vrací kroniku.
 */
export function extraWivesDay(
  state: VillageState,
  day: number,
  storesFill: () => number = () => 1,
): ChronicleEvent[] {
  if (!isDynastyTracked(state) || rodBaptized(state)) return [];
  const men = state.people
    .filter((p) => isLineMan(p) && ageYears(p.bornDay, day) >= LORD.extraWifeFromAge)
    .sort((a, b) => a.id - b.id);
  if (men.length === 0) return [];
  const counts = wifeCounts(state);
  const random = createRandom(deriveSeed(state.seed, 'wife:' + day));
  const chance = perDay(LORD.extraWifePerYear);
  const events: ChronicleEvent[] = [];
  for (const man of men) {
    const count = counts.get(man.id) ?? 0;
    // bez manželky se muž rodu žení jako dosud (první manželka – `arrangeMarriages`)
    if (count < 1 || count >= LORD.maxWives) continue;
    // los vždy – hlad ani místo nemění losy ostatních mužů
    const roll = random.next();
    if (roll >= chance || state.hungry) continue;
    if (roll >= weddingChancePerDay(LORD.extraWifePerYear, storesFill())) continue;
    const home = extraWifeHome(state, man);
    if (home === undefined) continue;
    const { from, to } = LORD.extraWifeAge;
    const years = from + random.next() * (to - from);
    state.people.push({
      id: state.nextId++,
      bornDay: day - Math.ceil(years * DAYS_PER_YEAR),
      dwellingId: home,
      sex: 'female',
      spouseId: man.id,
      origin: neighbor(random.next()),
      nextBirthFrom: day + BIRTH_SPACING.afterWeddingDays,
    });
    counts.set(man.id, count + 1);
    events.push({ day, kind: 'extra-wife', ...(man.name === undefined ? {} : { name: man.name }) });
  }
  return events;
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
    events.push({ day, kind: 'main-wife', ...(man.name === undefined ? {} : { name: man.name }) });
  }
  return events;
}
