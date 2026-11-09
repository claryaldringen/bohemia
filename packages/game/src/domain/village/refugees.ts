import { dismissGuests, hostGuests } from '../vassalage/guests';
import { applyLineManFell, markCaptive, prisonerKey } from '../war/raid-apply';
import { WAR } from '../war/rules-war';
import { drawGrainPits } from './grain-pits';
import { horsePens, isGrainHorse, penHorses, villageHorses } from './horses';
import type { VillageEventBody } from './inbox';
import { removePeople } from './kinship';
import { ensureLivestock } from './livestock';
import { foodNeedPerDay, guestFoodNeed, hidesInForest, isAway } from './people';
import type {
  ChronicleEvent,
  Guest,
  HerdSpecies,
  Horse,
  Person,
  PersonAway,
  VillageState,
} from './types';

// Ves na útěku (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Úloha 7): události
// schránky, které posílá tažení (posel, skupina uprchlíků), a jídlo uprchlíků. Funkce `apply…` mutují
// stav vsi jako kroky dne a jsou idempotentní – kdo už pryč je (nebo už doma), se přeskočí, zásoby
// a dobytek ubudou nejvýš o to, co ves má. Lidé na útěku zůstávají ve stavu domovské vsi s `away`
// druhu `refuge` (s hradištěm `hostVillageId`, bez něj v lese) – v hradišti jsou hosté.

const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

type Body<K extends VillageEventBody['kind']> = Extract<VillageEventBody, { kind: K }>;

// --- Domov: odchod, les, dostižení, návrat ----------------------------------------------------

/**
 * Lidé odešli skupinou (`refuge-depart`; mutuje stav): kdo je ze seznamu doma, je pryč (`away`
 * druhu `refuge`, do hradiště `hostVillageId`, bez něj do lesa), zásoby ubudou o nesené obilí
 * (nejvýš volné – bez odloženého osiva a zapečetěných jam, ty zůstávají ve vsi) a stádo o sehnané
 * kusy (napřed dospělé). Ves zapíše `refuge` (první skupina; druhá ho nepřepíše). Nikdo ze
 * seznamu doma – nic (opakovaná událost, lidé už odešli s jinou skupinou).
 */
export function applyRefugeDepart(
  state: VillageState,
  day: number,
  body: Body<'refuge-depart'>,
): ChronicleEvent[] {
  const ids = new Set(body.people);
  const going = state.people.filter((p) => ids.has(p.id) && !isAway(p, day));
  if (going.length === 0) return [];
  const host = body.hostVillageId === null ? {} : { hostVillageId: body.hostVillageId };
  const away: PersonAway = { kind: 'refuge', ...host, refId: body.refId };
  for (const p of going) p.away = { ...away };
  takeGrain(state, body.carriedKg);
  takeHerd(state, body.herd);
  state.refuge ??= {
    refId: body.refId,
    campaignId: body.campaignId,
    mode: body.mode,
    ...host,
    departedDay: day,
  };
  if (body.hostVillageId === null) return [];
  const name = body.hostName === undefined ? {} : { villageName: body.hostName };
  return [{ day, kind: 'refuge-left', people: going.length, ...name }];
}

/**
 * Skupina došla do lesa (`refuge-hidden`; mutuje stav): co si odnesla, je ukryté (`refuge.hidden`)
 * – jedí z toho (`refugeFoodDay`), návrat to vrátí. Jen pro skupinu, kterou ves vede, a jednou.
 */
export function applyRefugeHidden(
  state: VillageState,
  day: number,
  body: Body<'refuge-hidden'>,
): ChronicleEvent[] {
  const refuge = state.refuge;
  if (refuge?.refId !== body.refId || refuge.hidden !== undefined) return [];
  refuge.hidden = { foodKg: Math.max(0, body.foodKg), herd: { ...body.herd } };
  return [{ day, kind: 'refuge-hidden', people: refugeesOf(state, body.refId).length }];
}

/**
 * Vojsko skupinu dostihlo (`refuge-caught`; mutuje stav): padlí zemřou bez pohřbu (padli mimo ves;
 * muž rodu – nástupnictví jako `line-man-fell`), odvedení z vsi zmizí. Ostatní zůstávají pryč –
 * jdou dál. Nezbyl-li ze skupiny nikdo a nic neukryla, ves už na útěku není.
 */
export function applyRefugeCaught(
  state: VillageState,
  day: number,
  body: Body<'refuge-caught'>,
): ChronicleEvent[] {
  const inGroup = new Set(refugeesOf(state, body.refId).map((p) => p.id));
  const killed = [...new Set(body.killed)].filter((id) => inGroup.has(id));
  const dead = new Set(killed);
  const led = [...new Set(body.led)].filter((id) => inGroup.has(id) && !dead.has(id));
  if (killed.length === 0 && led.length === 0) return [];
  const events: ChronicleEvent[] = [];
  for (const personId of killed) events.push(...applyLineManFell(state, day, { personId }));
  removePeople(state, new Set(led));
  if (
    state.refuge?.refId === body.refId &&
    state.refuge.hidden === undefined &&
    refugeesOf(state, body.refId).length === 0
  ) {
    delete state.refuge;
  }
  events.push({ day, kind: 'refuge-caught', killed: killed.length, led: led.length });
  return events;
}

/**
 * Uprchlíci se vrátili domů (`refuge-back`; mutuje stav): `away` skupiny zmizí, zásoby a stádo
 * z hradiště (`leaveRefuge`) přibudou a s nimi, co skupina ukryla v lese (`refuge.hidden`); ves už
 * na útěku není. Nikdo pryč a žádný útěk – nic (opakovaná událost).
 */
export function applyRefugeBack(
  state: VillageState,
  day: number,
  body: Body<'refuge-back'>,
): ChronicleEvent[] {
  const back = refugeesOf(state, body.refId);
  const refuge = state.refuge?.refId === body.refId ? state.refuge : undefined;
  if (back.length === 0 && refuge === undefined) return [];
  for (const p of back) delete p.away;
  state.storesKg += Math.max(0, body.foodKg);
  addHerd(state, body.herd);
  if (refuge !== undefined) {
    if (refuge.hidden) {
      state.storesKg += Math.max(0, refuge.hidden.foodKg);
      addHerd(state, refuge.hidden.herd);
    }
    delete state.refuge;
  }
  if (back.length === 0) return [];
  return [{ day, kind: 'people-back', away: 'refuge', people: back.length }];
}

/** Lidé skupiny `refId`, kteří jsou ještě pryč (v pořadí lidí vsi). */
function refugeesOf(state: VillageState, refId: string): Person[] {
  return state.people.filter((p) => p.away?.kind === 'refuge' && p.away.refId === refId);
}

/** Odebere nesené obilí (nejvýš volné – bez osiva a zapečetěných jam); otevřená jáma se doplní. */
function takeGrain(state: VillageState, kg: number): void {
  let sealed = 0;
  for (const pit of state.grainPits ?? []) if (pit.state === 'sealed') sealed += pit.grainKg;
  const free = Math.max(0, state.storesKg - Math.max(0, state.reservedSeedKg ?? 0) - sealed);
  const taken = Math.min(Math.max(0, kg), free);
  if (taken <= 0) return;
  state.storesKg -= taken;
  drawGrainPits(state);
}

/** Odebere sehnané kusy – napřed dospělé, pak mláďata (nejvýš co ves má). */
function takeHerd(state: VillageState, herd: Record<HerdSpecies, number>): void {
  const herds = state.livestock;
  if (!herds) return;
  for (const sp of SPECIES) {
    let left = Math.max(0, Math.floor(herd[sp] + 1e-9));
    const adults = Math.min(left, Math.floor(herds.herds[sp] + 1e-9));
    herds.herds[sp] -= adults;
    left -= adults;
    herds.young[sp] -= Math.min(left, Math.floor(herds.young[sp] + 1e-9));
  }
}

/** Kusy zpět do stád jako dospělé (za útěku dorostly). */
function addHerd(state: VillageState, herd: Record<HerdSpecies, number>): void {
  if (!SPECIES.some((sp) => herd[sp] > 0)) return;
  const herds = ensureLivestock(state).herds;
  for (const sp of SPECIES) herds[sp] += Math.max(0, herd[sp]);
}

// --- Hradiště: příchod, pobyt, odchod --------------------------------------------------------

/**
 * Uprchlíci došli do hradiště (`refuge-arrive`; mutuje stav hostitele): jsou hosté druhu `refuge`
 * s dnem narození (jedí a pracují podle věku) do návratu (`WAR.alarm.openUntilDay`), jejich zásoby
 * a stádo drží pobyt `RefugeStay` – stádo se pase u hradiště (do stád hostitele nepřibude). Týž
 * pobyt podruhé – nic.
 */
export function applyRefugeArrive(
  host: VillageState,
  day: number,
  body: Body<'refuge-arrive'>,
): ChronicleEvent[] {
  if (host.refugeStays?.some((s) => s.refId === body.refId)) return [];
  const guests: Guest[] = body.people.map((p) => ({
    ref: { villageId: body.fromVillageId, personId: p.id },
    kind: 'refuge',
    untilDay: WAR.alarm.openUntilDay,
    adult: true,
    bornDay: p.bornDay,
  }));
  hostGuests(host, day, guests);
  host.refugeStays = [
    ...(host.refugeStays ?? []),
    {
      refId: body.refId,
      fromVillageId: body.fromVillageId,
      fromName: body.fromName,
      people: body.people.map((p) => p.id),
      foodKg: Math.max(0, body.foodKg),
      herd: { ...body.herd },
      arrivedDay: day,
    },
  ];
  return [
    { day, kind: 'guests-came', away: 'refuge', people: guests.length, villageName: body.fromName },
  ];
}

/**
 * Uprchlíci pobytu `refId` odcházejí domů (mutuje stav hostitele – use-case návratu): hosté
 * a pobyt zmizí. Vrací zbylé zásoby a stádo pro událost `refuge-back` domů; bez pobytu null.
 */
export function leaveRefuge(
  host: VillageState,
  refId: string,
): { foodKg: number; herd: Record<HerdSpecies, number> } | null {
  const stay = host.refugeStays?.find((s) => s.refId === refId);
  if (!stay) return null;
  dismissGuests(
    host,
    'refuge',
    stay.people.map((personId) => ({ villageId: stay.fromVillageId, personId })),
  );
  const rest = host.refugeStays!.filter((s) => s !== stay);
  if (rest.length === 0) delete host.refugeStays;
  else host.refugeStays = rest;
  return { foodKg: Math.max(0, stay.foodKg), herd: { ...stay.herd } };
}

// --- Jídlo uprchlíků ---------------------------------------------------------------------------

/**
 * Jídlo uprchlíků dne (krok dne před jídlem – `simulate.ts`; mutuje stav): lidé ukrytí v lese jedí
 * doma (`foodNeedPerDay`) – napřed z toho, co ukryli (do zásob se přesune tolik, kolik dnes snědí),
 * pak ze zásob vsi; hosté pobytu v hradišti stejně napřed ze svých zásob (`RefugeStay.foodKg`), pak
 * ze zásob hradiště. Bez útěku a pobytů nic.
 */
export function refugeFoodDay(state: VillageState, day: number): void {
  const hidden = state.refuge?.hidden;
  if (hidden !== undefined && hidden.foodKg > 0) {
    let need = 0;
    for (const p of state.people) {
      if (p.away?.refId === state.refuge!.refId && hidesInForest(p)) {
        need += foodNeedPerDay(p, day);
      }
    }
    const kg = Math.min(need, hidden.foodKg);
    if (kg > 0) {
      hidden.foodKg -= kg;
      state.storesKg += kg;
    }
  }
  for (const stay of state.refugeStays ?? []) {
    if (stay.foodKg <= 0) continue;
    const ids = new Set(stay.people);
    let need = 0;
    for (const g of state.guests ?? []) {
      if (
        g.kind === 'refuge' &&
        g.untilDay > day &&
        g.ref.villageId === stay.fromVillageId &&
        ids.has(g.ref.personId)
      ) {
        need += guestFoodNeed(g, day);
      }
    }
    const kg = Math.min(need, stay.foodKg);
    if (kg > 0) {
      stay.foodKg -= kg;
      state.storesKg += kg;
    }
  }
}

// --- Posel --------------------------------------------------------------------------------------

/**
 * Posel vyběhl (`messenger-out`; mutuje stav): je pryč (`away` druhu `messenger`) do návratu nebo
 * chycení. Na koni (Martin 9. 11. 2026 – jen muž rodu, který umí jezdit a má jezdeckého koně) je
 * kůň pryč s ním (`away.horseId` – jeho kůň, jinak nejlépe vycvičený volný jezdecký kůň). Kdo je
 * pryč jinak nebo ve vsi není, posla nedělá.
 */
export function applyMessengerOut(
  state: VillageState,
  day: number,
  body: Body<'messenger-out'>,
): ChronicleEvent[] {
  const p = state.people.find((x) => x.id === body.personId);
  if (!p || isAway(p, day)) return [];
  p.away = { kind: 'messenger', hostVillageId: body.toVillageId, refId: body.refId };
  if (body.mounted) {
    const horse = messengerHorse(state, p.id, day);
    if (horse) {
      horse.riderId = p.id;
      p.away.horseId = horse.id;
    }
  }
  return [];
}

/** Posel se po doručení vrátil (`messenger-back`; mutuje stav) – i s koněm. */
export function applyMessengerBack(
  state: VillageState,
  day: number,
  body: Body<'messenger-back'>,
): ChronicleEvent[] {
  const p = messengerOf(state, body);
  if (!p) return [];
  delete p.away;
  return [{ day, kind: 'people-back', away: 'messenger', people: 1 }];
}

/**
 * Vojsko posla chytilo (`messenger-caught`; mutuje stav): `killed` – padl (bez pohřbu, muž rodu –
 * nástupnictví), `led` – odveden (z vsi zmizí), `captured` – muž rodu zajat (`away` zajetí u vsi
 * `captorVillageId` jako po nájezdu – war.md, Vzdaní, zajetí a výkupné). Kůň, na kterém jel, se
 * nevrátí.
 */
export function applyMessengerCaught(
  state: VillageState,
  day: number,
  body: Body<'messenger-caught'>,
): ChronicleEvent[] {
  const p = messengerOf(state, body);
  if (!p) return [];
  const horseId = p.away!.horseId;
  const name = p.name === undefined ? {} : { name: p.name };
  const events = body.fate === 'killed' ? applyLineManFell(state, day, { personId: p.id }) : [];
  if (body.fate === 'led') removePeople(state, new Set([p.id]));
  if (body.fate === 'captured') {
    // bez věznitele (tělo bez `captorVillageId`) jako odvedený – z vsi zmizí
    if (body.captorVillageId === undefined) removePeople(state, new Set([p.id]));
    else markCaptive(state, day, p, body.captorVillageId, prisonerKey(body.campaignId, p.id));
  }
  if (horseId !== undefined) removeHorse(state, horseId);
  events.push({ day, kind: 'messenger-caught', fate: body.fate, ...name });
  return events;
}

/** Posel výpravy `refId`, který je ještě pryč. */
function messengerOf(
  state: VillageState,
  body: { refId: string; personId: number },
): Person | undefined {
  return state.people.find(
    (p) => p.id === body.personId && p.away?.kind === 'messenger' && p.away.refId === body.refId,
  );
}

/** Kůň posla: jeho jezdecký kůň, jinak nejlépe vycvičený volný jezdecký kůň vsi; žádný – null. */
function messengerHorse(state: VillageState, riderId: number, day: number): Horse | null {
  const horses = [...villageHorses(state), ...(state.looseHorses ?? [])];
  const own = horses.find((h) => h.riderId === riderId);
  if (own) return own;
  const free = horses
    .filter((h) => h.riderId === undefined && isGrainHorse(h, day))
    .sort((a, b) => b.training - a.training || a.bornDay - b.bornDay || a.id - b.id);
  return free[0] ?? null;
}

/** Kůň odejde z vsi (ohrada i bez ohrady). */
function removeHorse(state: VillageState, horseId: number): void {
  for (const pen of horsePens(state)) {
    const horses = penHorses(pen);
    if (horses.some((h) => h.id === horseId)) pen.horses = horses.filter((h) => h.id !== horseId);
  }
  if (state.looseHorses?.some((h) => h.id === horseId)) {
    state.looseHorses = state.looseHorses.filter((h) => h.id !== horseId);
  }
}
