// Jména synů po roce (absence.md – Jména synů; Martin 8. 11. 2026: „Ať dostane nějaké jméno
// obvyklé v rodě, např. po dědečkovi nebo strýci. Pokud by žádné takové nebylo, ať se vygeneruje.“).
// Čisté funkce nad stavem vsi, náhoda ze seedu vsi a dne.
import { createRandom, deriveSeed } from '../../landscape/random';
import { currentLord, isLineMan } from './dynasty';
import { generatedLineName } from './dynasty-names';
import { parentIndex } from './kinship';
import { SON_NAME_GRACE_DAYS } from '../rules';
import type { ChronicleEvent, Person, VillageState } from '../types';

type After = 'grandfather' | 'uncle' | 'great-grandfather' | 'kinsman';

/** Jméno a otec muže rodu – žijícího (ve `people`), nebo zemřelého (`dynasty.deceased`). */
interface KnownMan {
  id: number;
  name?: string;
  fatherId?: number;
}

function knownMen(state: VillageState): KnownMan[] {
  const men = new Map<number, KnownMan>();
  for (const d of state.dynasty?.deceased ?? []) men.set(d.id, d);
  for (const p of state.people) if (p.sex === 'male') men.set(p.id, p);
  return [...men.values()];
}

/**
 * Jméno pro syna `son` po dědovi z otcovy strany → strýci (otcův bratr) → pradědovi po meči →
 * jiném muži rodu; jméno žijícího muže rodu ve vsi se přeskočí. Nic takového – vygenerované
 * (`generatedLineName`). Čistá funkce, nic nemění.
 */
export function houseNameForSon(
  state: VillageState,
  day: number,
  son: Person,
): { name: string; after?: After } {
  const men = knownMen(state);
  const byId = new Map(men.map((m) => [m.id, m]));
  const living = new Set<string>();
  for (const p of state.people) {
    if (isLineMan(p) && p.name !== undefined) living.add(p.name);
  }
  const usable = (m: KnownMan | undefined): string | undefined =>
    m?.name !== undefined && !living.has(m.name) ? m.name : undefined;
  const father = son.fatherId === undefined ? undefined : byId.get(son.fatherId);
  const grandfather = father?.fatherId === undefined ? undefined : byId.get(father.fatherId);
  const grandName = usable(grandfather);
  if (grandName !== undefined) return { name: grandName, after: 'grandfather' };
  if (father?.fatherId !== undefined) {
    const uncle = men
      .filter(
        (m) => m.fatherId === father.fatherId && m.id !== father.id && usable(m) !== undefined,
      )
      .sort((a, b) => a.id - b.id)[0];
    const uncleName = usable(uncle);
    if (uncleName !== undefined) return { name: uncleName, after: 'uncle' };
  }
  const index = parentIndex(state);
  const greatId =
    grandfather?.fatherId ??
    (father?.fatherId === undefined ? undefined : index.get(father.fatherId)?.fatherId);
  const greatName = usable(greatId === undefined ? undefined : byId.get(greatId));
  if (greatName !== undefined) return { name: greatName, after: 'great-grandfather' };
  const others = [...new Set(men.filter((m) => m.id !== son.id).map(usable))]
    .filter((n): n is string => n !== undefined)
    .sort();
  if (others.length > 0) {
    const random = createRandom(deriveSeed(state.seed, `kin-name:${day}:${son.id}`));
    const picked = others[Math.floor(random.next() * others.length)];
    if (picked !== undefined) return { name: picked, after: 'kinsman' };
  }
  return { name: generatedLineName(state, day, son.id) };
}

/**
 * Denní pravidlo: syn rodu (ne vojvoda), kterého hráč do roku od narození nepojmenoval, dostane
 * jméno rodu (`houseNameForSon`); hráč ho smí jednou přepsat (`nameByHouse`). Mutuje stav, vrací
 * události kroniky.
 */
export function nameWaitingSons(state: VillageState, day: number): ChronicleEvent[] {
  if (!state.dynasty) return [];
  const lord = currentLord(state);
  const events: ChronicleEvent[] = [];
  const waiting = state.people
    .filter(
      (p) =>
        isLineMan(p) &&
        p.name === undefined &&
        p.id !== lord?.id &&
        day - p.bornDay >= SON_NAME_GRACE_DAYS,
    )
    .sort((a, b) => a.id - b.id);
  for (const son of waiting) {
    const { name, after } = houseNameForSon(state, day, son);
    son.name = name;
    son.nameByHouse = true;
    events.push({
      day,
      kind: 'line-named',
      name,
      who: 'son',
      house: true,
      ...(after ? { after } : {}),
    });
  }
  return events;
}
