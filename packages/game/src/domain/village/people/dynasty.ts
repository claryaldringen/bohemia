// Rod vojvody (lord.md – Rod vojvody – zakladatelé, manželky, jména, domácnost synů a konec rodu,
// fáze 1): kdo je muž rodu, manželky, převod starších vsí, jména vnuků při narození a dnešní
// vojvoda. Ves bez rodu (`dynasty.lords` prázdné) se chová jako před rodem. Čisté funkce bez I/O.
import { cloneState } from '../core/clone';
import {
  LORD_NAME_MISSING,
  SON_NAME_MISSING,
  checkPersonName,
  generatedLineName,
  normalizePersonName,
} from './dynasty-names';
import { parentIndex, type ParentIndex } from './kinship';
import { villageManorId } from './manor';
import { ageYears } from './people';
import { AGE } from '../rules';
import { isStewardOn } from '../steward/steward-state';
import type { ChronicleEvent, DynastyState, Person, VillageState } from '../types';

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

/**
 * Je `p` elita (hillfort.md – Elita)? Muž rodu s příznakem `elite`, nebo dnešní vojvoda (vojvoda
 * cvičí celý život, i když je synem vedlejší manželky).
 */
export function isElite(state: Pick<VillageState, 'people' | 'dynasty'>, p: Person): boolean {
  if (!isLineMan(p)) return false;
  return p.elite === true || currentLord(state)?.id === p.id;
}

/**
 * Denní pravidlo elity (hillfort.md – Elita; Martin 8. 11. 2026: „Elitou budou automaticky všichni
 * muži rodu pocházející z hlavních manželek“): žijící muž rodu – syn hlavní manželky (`mainWifeSon`),
 * jehož žijící otec je vojvoda nebo elita, dostane trvalý příznak `elite`. Opakuje se do ustálení,
 * aby jedno volání označilo i vnuka, jehož otec příznak právě dostal. Bez převodu starších vsí
 * (Martin: „Ten převádět nemusíš“) – pravidlo platí ode dne nasazení. Ves bez rodu – nic. Mutuje
 * stav, idempotentní.
 */
export function markElite(state: VillageState): void {
  if (!isDynastyTracked(state)) return;
  const byId = new Map(state.people.map((p) => [p.id, p]));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of state.people) {
      if (p.elite === true || p.mainWifeSon !== true || !isLineMan(p)) continue;
      const father = p.fatherId === undefined ? undefined : byId.get(p.fatherId);
      if (!father || !isElite(state, father)) continue;
      p.elite = true;
      grew = true;
    }
  }
}

/**
 * Drží `p` dvorec vsi s rodem (lord.md – Nástupnictví)? Vojvoda, který v dvorci bydlí, a za
 * nezletilého vojvodu (do 16 let) jeho matka z dvorce – při svatbě se druhý přistěhuje k nim
 * (`weddingHome`; ženich matky se přižení jako k vdově, která drží dům – kinship.md).
 */
export function holdsManor(state: VillageState, p: Person, day: number): boolean {
  if (!isDynastyTracked(state) || p.dwellingId !== currentLord(state)?.dwellingId) return false;
  const lord = currentLord(state);
  const manor = villageManorId(state);
  if (!lord || manor === null || lord.dwellingId !== manor) return false;
  return p.id === lord.id || (p.id === lord.motherId && ageYears(lord.bornDay, day) < AGE.fertile);
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
 * zemřelé předky v rodokmenu), muži rodu kromě vojvody jsou synové hlavní manželky. Vojvoda a jeho
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
    // ves před rodem měla každý muž jednu ženu – matka každého muže rodu (kromě vojvody) byla
    // hlavní manželkou jeho otce, stejně jako u `markNewborn`
    if (p.id !== lord.id) p.mainWifeSon = true;
    // vnuci a další potomci – jméno hned (generované), vojvoda a synové čekají na hráče
    if (p.id !== lord.id && p.fatherId !== lord.id) p.name = generatedLineName(next, day, p.id);
  }
  next.dynasty = { lordId: lord.id, lords: [{ id: lord.id, fromDay: day }] };
  return next;
}

/**
 * Dítě narozené dnes (už ve `state.people`) – syn muže rodu dostane příznak rodu (lord.md – Kdo
 * patří k rodu), syn hlavní manželky i příznak `mainWifeSon`. Syn vojvody čeká na jméno od hráče
 * (kronika `line-birth`) – ve vsi se zapnutým správcem ho dostane hned (steward.md – Jména synů) –,
 * ostatní muži rodu dostanou jméno hned (lord.md – Generovaná jména vnuků).
 * Ves bez rodu – nic. Mutuje dítě, vrací události kroniky.
 */
export function markNewborn(state: VillageState, child: Person, day: number): ChronicleEvent[] {
  if (!isDynastyTracked(state) || child.sex !== 'male' || child.fatherId === undefined) return [];
  const father = state.people.find((p) => p.id === child.fatherId);
  if (!father || !isLineMan(father)) return [];
  child.line = true;
  if (father.spouseId === child.motherId) child.mainWifeSon = true;
  if (currentLord(state)?.id === father.id) {
    // ves se zapnutým správcem – syn vojvody dostane jméno hned jako vnuk (steward.md – Jména synů)
    if (isStewardOn(state)) child.name = generatedLineName(state, day, child.id);
    return [{ day, kind: 'line-birth' }];
  }
  child.name = generatedLineName(state, day, child.id);
  return [];
}

/** Pojmenovat jde jen žijícího muže rodu (lord.md – Jména). */
const NOT_LINE_MAN = 'Jméno dává vojvoda jen mužům rodu.';
/** Jméno je trvalé (lord.md – Jména, návrh Clauda). */
const ALREADY_NAMED = 'Jméno už má – nejde ho změnit.';

/**
 * Hráč pojmenuje žijícího muže rodu bez jména (lord.md – Jména; Martin 24. 10. 2026: „Vojvoda
 * vybírá jméno jen pro své syny.“ – vnuci mají jméno od narození, takže bez jména jsou jen vojvoda
 * a jeho synové). Jméno se znormalizuje (`normalizePersonName`) a je trvalé; vojvodovi se doplní
 * i do záznamu vojvodů (kronika rodu), kronika vsi dostane `line-named`. Vstupní stav se nemění;
 * jinak důvod česky.
 */
export function nameLineMan(
  state: VillageState,
  personId: number,
  name: string,
  day: number,
): { ok: true; state: VillageState } | { ok: false; reason: string } {
  const man = state.people.find((p) => p.id === personId);
  if (!man || !isLineMan(man)) return { ok: false, reason: NOT_LINE_MAN };
  // jméno od rodu (absence.md – Jména synů) smí hráč jednou přepsat, jméno od hráče je trvalé
  if (man.name !== undefined && man.nameByHouse !== true) {
    return { ok: false, reason: ALREADY_NAMED };
  }
  const isLord = state.dynasty?.lordId === personId;
  const check = checkPersonName(name, isLord ? LORD_NAME_MISSING : SON_NAME_MISSING);
  if (!check.ok) return { ok: false, reason: check.reason ?? NOT_LINE_MAN };
  const normalized = normalizePersonName(name);
  const next = cloneState(state);
  for (const p of next.people) {
    if (p.id !== personId) continue;
    p.name = normalized;
    delete p.nameByHouse;
  }
  for (const lord of next.dynasty?.lords ?? []) if (lord.id === personId) lord.name = normalized;
  // kronika říká, koho se jméno týká (vojvoda, nebo syn vojvody – lord.md, Kde se jméno ukazuje)
  const who = isLord ? 'lord' : man.fatherId === state.dynasty?.lordId ? 'son' : undefined;
  next.chronicle.push({ day, kind: 'line-named', name: normalized, ...(who ? { who } : {}) });
  return { ok: true, state: next };
}
