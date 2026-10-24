// Rod vojvody (lord.md – Rod vojvody – zakladatelé, manželky, jména, domácnost synů a konec rodu,
// fáze 1): kdo je muž rodu, manželky, převod starších vsí, jména vnuků při narození a dnešní
// vojvoda. Ves bez rodu (`dynasty.lords` prázdné) se chová jako před rodem. Čisté funkce bez I/O.
import { cloneState } from './clone';
import { generatedLineName } from './dynasty-names';
import { parentIndex, type ParentIndex } from './kinship';
import { villageManorId } from './manor';
import type { ChronicleEvent, DynastyState, Person, VillageState } from './types';

/** Ves bez rodu – nikdo není muž rodu, vojvoda je nejstarší muž dvorce jako dřív. */
export const NO_DYNASTY: DynastyState = { lordId: null, lords: [] };

/** Sleduje ves rod vojvody? (Ves bez rodu i ves před převodem ne.) */
export function isDynastyTracked(state: Pick<VillageState, 'dynasty'>): boolean {
  return (state.dynasty?.lords.length ?? 0) > 0;
}

/** Muž rodu po meči (lord.md – Kdo patří k rodu). */
export function isLineMan(p: Person): boolean {
  return p.line === true && p.sex === 'male';
}

/** Žijící muži rodu (v pořadí lidí vsi). */
export function lineMen(state: Pick<VillageState, 'people'>): Person[] {
  return state.people.filter(isLineMan);
}

/** Dnešní vojvoda – žijící člověk `dynasty.lordId`; jinak undefined. */
export function currentLord(state: Pick<VillageState, 'people' | 'dynasty'>): Person | undefined {
  const id = state.dynasty?.lordId;
  if (id === undefined || id === null) return undefined;
  return state.people.find((p) => p.id === id);
}

/** Manželky muže (lord.md – Manželky) – ženy, jejichž muž je `man`, od nejdéle vdané (nižší id). */
export function wivesOf(state: Pick<VillageState, 'people'>, man: Person): Person[] {
  return state.people
    .filter((w) => w.sex === 'female' && w.spouseId === man.id)
    .sort((a, b) => a.id - b.id);
}

/** Hlavní manželka muže – `man.spouseId`, když je jeho manželkou. */
export function mainWifeOf(state: Pick<VillageState, 'people'>, man: Person): Person | undefined {
  if (man.spouseId === undefined) return undefined;
  return state.people.find((w) => w.id === man.spouseId && w.spouseId === man.id);
}

/** Vedlejší manželka – žena, jejíž muž má za hlavní manželku jinou. */
export function isSecondaryWife(state: Pick<VillageState, 'people'>, woman: Person): boolean {
  if (woman.sex !== 'female' || woman.spouseId === undefined) return false;
  const husband = state.people.find((p) => p.id === woman.spouseId);
  return husband !== undefined && husband.spouseId !== woman.id;
}

/** Vede od člověka `id` řetěz otců (i přes zemřelé předky) k `ancestorId`? */
function descendsByFather(index: ParentIndex, id: number, ancestorId: number): boolean {
  let current: number | undefined = id;
  // pojistka proti zacyklenému rodokmenu – víc generací ves nikdy nemá
  for (let step = 0; current !== undefined && step < 1000; step++) {
    if (current === ancestorId) return true;
    current = index.get(current)?.fatherId;
  }
  return false;
}

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/**
 * Muž, jeho manželky v jeho domě a jejich svobodné děti z téhož domu se přestěhují do dvorce
 * (lord.md – Převod starších vsí, Nástupnictví). Mutuje stav; muž v dvorci nebo ves bez dvorce –
 * nic.
 */
export function moveIntoManor(state: VillageState, man: Person): void {
  const manor = villageManorId(state);
  const from = man.dwellingId;
  if (manor === null || from === manor) return;
  const wives = new Set(
    state.people
      .filter((w) => w.sex === 'female' && w.spouseId === man.id && w.dwellingId === from)
      .map((w) => w.id),
  );
  const parents = new Set([man.id, ...wives]);
  const childOf = (p: Person): boolean =>
    (p.fatherId !== undefined && parents.has(p.fatherId)) ||
    (p.motherId !== undefined && parents.has(p.motherId));
  for (const p of state.people) {
    if (p.dwellingId !== from) continue;
    if (p.id === man.id || wives.has(p.id) || (childOf(p) && p.spouseId === undefined)) {
      p.dwellingId = manor;
    }
  }
}

/**
 * Na kom se rod ve starší vsi založí (lord.md – Převod starších vsí): nejstarší muž dvorce, i chlapec;
 * bez muže v dvorci nejstarší muž vsi. Ves bez muže – undefined.
 */
function founderOf(state: VillageState): Person | undefined {
  const manor = villageManorId(state);
  const men = state.people.filter((p) => p.sex === 'male').sort(byAge);
  return men.find((p) => p.dwellingId === manor) ?? men[0];
}

/**
 * Převod vsi uložené před rodem (lord.md – Převod starších vsí) – jen když `dynasty` chybí, jinak
 * týž objekt (idempotentní). Vojvodou je nejstarší muž dvorce, i chlapec; bez muže v dvorci
 * nejstarší muž vsi, který se s manželkou a svobodnými dětmi přestěhuje do dvorce; nikdo jiný se
 * nestěhuje (Vlkov beze změny). Příznak rodu dostane vojvoda a jeho žijící potomci po meči (i přes
 * zemřelé předky v rodokmenu), žijící synové vojvody jsou synové hlavní manželky. Vojvoda a jeho
 * synové jméno nemají (pojmenuje je hráč), ostatní muži rodu dostanou vygenerované. Ves bez muže
 * je ves bez rodu – převod sám hru neukončí.
 */
export function withDynasty(state: VillageState): VillageState {
  if (state.dynasty !== undefined) return state;
  const next = cloneState(state);
  const day = next.lastDay;
  const lord = founderOf(next);
  if (!lord) {
    next.dynasty = { lordId: null, lords: [] };
    return next;
  }
  moveIntoManor(next, lord);
  const index = parentIndex(next);
  for (const p of [...next.people].sort((a, b) => a.id - b.id)) {
    if (p.sex !== 'male' || !descendsByFather(index, p.id, lord.id)) continue;
    p.line = true;
    if (p.fatherId === lord.id) p.mainWifeSon = true;
    // vnuci a další potomci – jméno hned (generované), vojvoda a synové čekají na hráče
    if (p.id !== lord.id && p.fatherId !== lord.id) p.name = generatedLineName(next, day, p.id);
  }
  next.dynasty = { lordId: lord.id, lords: [{ id: lord.id, fromDay: day }] };
  return next;
}

/**
 * Dítě narozené dnes (už ve `state.people`) – syn muže rodu dostane příznak rodu (lord.md – Kdo
 * patří k rodu), syn hlavní manželky i příznak `mainWifeSon`. Syn vojvody čeká na jméno od hráče
 * (kronika `line-birth`), ostatní muži rodu dostanou jméno hned (lord.md – Generovaná jména vnuků).
 * Ves bez rodu – nic. Mutuje dítě, vrací události kroniky.
 */
export function markNewborn(state: VillageState, child: Person, day: number): ChronicleEvent[] {
  if (!isDynastyTracked(state) || child.sex !== 'male' || child.fatherId === undefined) return [];
  const father = state.people.find((p) => p.id === child.fatherId);
  if (!father || !isLineMan(father)) return [];
  child.line = true;
  if (father.spouseId === child.motherId) child.mainWifeSon = true;
  if (currentLord(state)?.id === father.id) return [{ day, kind: 'line-birth' }];
  child.name = generatedLineName(state, day, child.id);
  return [];
}

/**
 * Dnešní vojvoda (dočasně, než přijde nástupnictví – lord.md – Nástupnictví): zemřel-li, vojvodou
 * je nejstarší muž rodu v dvorci, bez něj nikdo. Kronika rodu (`lords`) dostane záznam. Mutuje stav.
 */
function keepLordId(state: VillageState, day: number): ChronicleEvent[] {
  const dynasty = state.dynasty;
  if (!dynasty || dynasty.lords.length === 0 || currentLord(state)) return [];
  const last = dynasty.lords[dynasty.lords.length - 1];
  if (last && last.toDay === undefined) last.toDay = day;
  const manor = villageManorId(state);
  const heir = lineMen(state)
    .filter((p) => p.dwellingId === manor)
    .sort(byAge)[0];
  if (!heir) {
    dynasty.lordId = null;
    return [];
  }
  dynasty.lordId = heir.id;
  const name = heir.name === undefined ? {} : { name: heir.name };
  dynasty.lords.push({ id: heir.id, ...name, fromDay: day });
  return [{ day, kind: 'lord', ...name }];
}

/**
 * Krok dne rodu po `populationDay` (simulate.ts): drží dnešního vojvodu. Jména a příznaky dnes
 * narozených dává `markNewborn` už při porodu. Ves bez rodu – nic. Mutuje stav.
 */
export function dynastyDay(state: VillageState, day: number): ChronicleEvent[] {
  return keepLordId(state, day);
}
