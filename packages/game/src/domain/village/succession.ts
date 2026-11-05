// Nástupnictví rodu vojvody (lord.md – Rod vojvody: Nástupnictví; Martin 24. 10. 2026 – „Nejstarší
// syn se vrátí“, nástupcem syn hlavní manželky): kdo nastoupí po smrti vojvody a kdo se s ním
// stěhuje do dvorce. Bez náhody – pořadí dává věk a id. Ves bez rodu – nic.
import { currentLord, isDynastyTracked, lineMen, mainWifeOf, wivesOf } from './dynasty';
import { ensureMainWives } from './dynasty-wives';
import { parentIndex } from './kinship';
import { villageManorId } from './manor';
import { ageYears, occupants } from './people';
import { AGE, DWELLINGS } from './rules';
import type { ChronicleEvent, Person, VillageState } from './types';

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/**
 * Nástupce vojvody `lordId` mezi žijícími muži rodu ve vsi (lord.md – Nástupnictví): 1. nejstarší
 * syn hlavní manželky (`mainWifeSon` – i po smrti matky, i chlapec před dospělým synem vedlejší),
 * 2. nejstarší syn vedlejší manželky, 3. nejstarší vnuk po meči (i po zemřelém otci), 4. nejstarší
 * muž rodu – bratr, synovec… Bez muže rodu undefined.
 */
export function successorOf(
  state: Pick<VillageState, 'people' | 'ancestors'>,
  lordId: number | null,
): Person | undefined {
  const men = lineMen(state).sort(byAge);
  if (lordId !== null) {
    const sons = men.filter((p) => p.fatherId === lordId);
    const pick = sons.find((p) => p.mainWifeSon === true) ?? sons[0];
    if (pick) return pick;
    const index = parentIndex(state);
    const grandson = men.find(
      (p) => p.fatherId !== undefined && index.get(p.fatherId)?.fatherId === lordId,
    );
    if (grandson) return grandson;
  }
  return men[0];
}

/** Svobodní lidé z obydlí `home`, kteří jsou dětmi podle `parent`. */
function unmarriedChildren(
  state: VillageState,
  home: number,
  parent: (p: Person) => boolean,
): Person[] {
  return state.people.filter((p) => p.dwellingId === home && p.spouseId === undefined && parent(p));
}

/**
 * Kdo se s nástupcem `heir` stěhuje do dvorce (lord.md – Nástupnictví, Kdo se stěhuje; návrh
 * Clauda): nezletilý (do 16 let) s matkou – je-li svobodná a bydlí s ním – a jejími dětmi do 16 let,
 * bez ní sám. Dospělý s hlavní manželkou a jejími svobodnými dětmi z jeho domu, se svými svobodnými
 * dětmi, jejichž matka v domě nebydlí, a s vedlejšími manželkami z domu se svobodnými dětmi, jen
 * vejdou-li se do dvorce (od nejdéle vdané – nižší id). Ostatní zůstávají v jeho domě (dědic podle
 * kinship.md). Nástupce v dvorci nebo ves bez dvorce – nikdo. Mutuje stav.
 */
function moveSuccessor(state: VillageState, heir: Person, day: number): void {
  const manorId = villageManorId(state);
  const manor = state.dwellings.find((d) => d.id === manorId);
  const from = heir.dwellingId;
  if (!manor || from === manor.id) return;
  const moving = new Set<number>([heir.id]);
  const add = (people: readonly Person[]): void => {
    for (const p of people) moving.add(p.id);
  };
  if (ageYears(heir.bornDay, day) < AGE.fertile) {
    const mother = state.people.find(
      (p) => p.id === heir.motherId && p.dwellingId === from && p.spouseId === undefined,
    );
    if (mother) {
      add([mother]);
      add(
        unmarriedChildren(
          state,
          from,
          (c) => c.motherId === mother.id && ageYears(c.bornDay, day) < AGE.fertile,
        ),
      );
    }
  } else {
    const main = mainWifeOf(state, heir);
    const mainHere = main !== undefined && main.dwellingId === from ? main : undefined;
    const inHome = new Set(state.people.filter((p) => p.dwellingId === from).map((p) => p.id));
    if (mainHere) {
      add([mainHere]);
      add(unmarriedChildren(state, from, (c) => c.motherId === mainHere.id));
    }
    // děti zemřelé (nebo jinde bydlící) matky jdou s otcem
    add(
      unmarriedChildren(
        state,
        from,
        (c) => c.fatherId === heir.id && (c.motherId === undefined || !inHome.has(c.motherId)),
      ),
    );
    let room = DWELLINGS[manor.type].capacity - occupants(state, manor.id).length - moving.size;
    for (const wife of wivesOf(state, heir)) {
      if (wife === mainHere || wife.dwellingId !== from) continue;
      const family = [wife, ...unmarriedChildren(state, from, (c) => c.motherId === wife.id)];
      if (family.length > room) continue;
      add(family);
      room -= family.length;
    }
  }
  for (const p of state.people) if (moving.has(p.id)) p.dwellingId = manor.id;
}

/**
 * Nástupnictví (lord.md – Nástupnictví): zemřel-li vojvoda (nebo ves odešel), nastoupí
 * `successorOf` a přestěhuje se do dvorce (`moveSuccessor`). Kronika rodu (`dynasty.lords`) uzavře
 * starého vojvodu a přidá nového, kronika vsi `lord`. Bez muže rodu (smrt, odchod) `lordId = null`,
 * `endedDay` a kronika `line-ended` se jménem posledního vojvody (lord.md – Konec rodu) – ves žije
 * dál jako ves bez vojvody, hru ukončí až `isLineExtinct` přes všechny vsi hráče. Mutuje stav.
 */
export function succeedLord(state: VillageState, day: number): ChronicleEvent[] {
  const dynasty = state.dynasty;
  if (!dynasty || !isDynastyTracked(state) || currentLord(state)) return [];
  const last = dynasty.lords[dynasty.lords.length - 1];
  if (last && last.toDay === undefined) last.toDay = day;
  const heir = successorOf(state, dynasty.lordId);
  if (!heir) {
    dynasty.lordId = null;
    // rod žije v jiné vsi, tahle čeká na vojvodu odtamtud (seniorate.md – dosazení vojvody)
    state.awaitingLord ??= { sinceDay: day };
    // konec rodu ve vsi (lord.md – Konec rodu): den jen jednou, rod může žít v jiné vsi hráče
    if (dynasty.endedDay !== undefined) return [];
    dynasty.endedDay = day;
    const lastName = last?.name === undefined ? {} : { name: last.name };
    return [{ day, kind: 'line-ended', ...lastName }];
  }
  moveSuccessor(state, heir, day);
  dynasty.lordId = heir.id;
  const name = heir.name === undefined ? {} : { name: heir.name };
  dynasty.lords.push({ id: heir.id, ...name, fromDay: day });
  return [{ day, kind: 'lord', ...name }];
}

/**
 * Krok dne rodu po `populationDay` (simulate.ts): muž, kterému dnes zemřela hlavní manželka, má
 * novou (`ensureMainWives`), a po smrti vojvody nastoupí nástupce (`succeedLord`). Jména a příznaky
 * dnes narozených dává `markNewborn` už při porodu. Ves bez rodu – nic. Mutuje stav.
 */
export function dynastyDay(state: VillageState, day: number): ChronicleEvent[] {
  return [...ensureMainWives(state, day), ...succeedLord(state, day)];
}
