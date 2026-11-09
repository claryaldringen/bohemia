import { createRandom, deriveSeed } from '../landscape/random';
import { bury } from '../village/cemetery';
import { drawGrainPits } from '../village/grain-pits';
import { currentLord } from '../village/dynasty';
import { removePeople } from '../village/kinship';
import { ensureLivestock } from '../village/livestock';
import { ageGroup, ageYears, isAway } from '../village/people';
import { newcomerHome } from '../village/people-trade';
import { segmentBuilt } from '../village/fortification';
import { setStewardOn } from '../village/steward-state';
import { rehomePeople } from '../village/transfer-people';
import type {
  ChronicleEvent,
  HerdSpecies,
  Person,
  Prisoner,
  RaidLoot,
  VillageState,
} from '../village/types';
import { hostGuests } from '../vassalage/guests';
import { fleeParty, pitFound } from './flight';
import { WAR } from './rules-war';
import type { ShelterReport } from './stance';

// Výsledky nájezdu ve vsi a kořist (war.md – Ztráty, Kořist; fortifications.md – Prolomení; plán
// 2026-11-03 – Úloha 6.10). Tažení spočte po boji, co vzalo (`raidLoot`), a pošle to do schránek
// vsí jako vnější události (rozhodnutí 13): napadená ves dostane `raid-result` (padlí, ranění,
// odvedení, kořist ze zásob) a `fortification-breach`, vsi útočníka `line-man-fell` (padlý muž rodu
// hned) a po návratu `campaign-return` (muži zpět, kořist, odvedení jako noví vesničané). Funkce
// `apply…` mutují stav vsi jako kroky dne. Jen det-math; náhoda ze seedu vsi a člověka.

const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

/** Výsledek nájezdu pro napadenou ves (tělo schránky `raid-result`). Id lidí patří napadené vsi. */
export interface RaidResult {
  campaignId: string;
  /** Jméno hlavy rodu útočníka, jeho ves a napadená ves (kronika). */
  leader: string;
  from?: string;
  target?: string;
  /** Válka byla opovězena (jinak přepadení – „bez opovědi“). */
  declared: boolean;
  /** Padlí obránci – pohřbí se na hřbitově vsi. */
  fallen: number[];
  /** Ranění obránci – 60 dní nepracují ani necvičí, 1 z 5 do 30 dní zemře. */
  wounded: number[];
  /** Odvedení (vzdaní) – odejdou s vojskem. */
  led: number[];
  /**
   * Zajatí muži rodu a šlechtici (war.md – Vzdaní, zajetí a výkupné): zůstávají ve stavu vsi
   * s `away` druhu `captive` u vsi shromaždiště `captorVillageId`; klíč zajetí je `<tažení>:<osoba>`.
   */
  captured?: number[];
  captorVillageId?: string;
  /** Co útočník vzal ze zásob a stád (`raidLoot`). */
  loot: RaidLoot;
  /** Zapečetěné jámy, které útočník našel (`pitFound`) – jejich zrno je v `loot.grainKg`. */
  pitsFound: number[];
}

/** Návrat tažení do vsi útočníka (tělo schránky `campaign-return`). Id lidí patří této vsi. */
export interface CampaignReturn {
  campaignId: string;
  /** Muži, kteří se vrátili (`away` se zruší). */
  back: number[];
  /** Ranění mezi nimi a den, kdy byli raněni (60 dní a los smrti od něj). */
  wounded: { personId: number; day: number }[];
  /** Padlí vesničané (padlý muž rodu přišel hned – `line-man-fell`); zůstali na cizí mapě. */
  fallen: number[];
  /** Kořist do zásob – jen ves shromaždiště. */
  loot?: RaidLoot;
  /** Odvedení lidé (snímek ze stavu napadené vsi) – přijdou jako noví vesničané s novými id. */
  people?: Person[];
  /** Zajatci z nájezdu (war.md – Vzdaní, zajetí a výkupné) – přibudou do `VillageState.prisoners`. */
  prisoners?: Prisoner[];
}

/** Kořist bez ničeho. */
export function noLoot(): RaidLoot {
  return {
    grainKg: 0,
    legumesKg: 0,
    meatKg: 0,
    cheeseKg: 0,
    livestock: { sheep: 0, goat: 0, pig: 0, cow: 0 },
  };
}

/** Součty kořisti: jídlo (kg) a dobytek (kusy) – `CampaignLoot.foodKg`, `herd`. */
export function lootTotals(loot: RaidLoot): { foodKg: number; herd: number } {
  let herd = 0;
  for (const sp of SPECIES) herd += loot.livestock[sp];
  return { foodKg: loot.grainKg + loot.legumesKg + loot.meatKg + loot.cheeseKg, herd };
}

/**
 * Součet dvou kořistí po druzích (kořist z dostižené skupiny uprchlíků a z nájezdu – Úloha 8 plánu
 * 2026-11-09).
 */
export function sumLoot(a: RaidLoot, b: RaidLoot): RaidLoot {
  const out = noLoot();
  out.grainKg = a.grainKg + b.grainKg;
  out.legumesKg = a.legumesKg + b.legumesKg;
  out.meatKg = a.meatKg + b.meatKg;
  out.cheeseKg = a.cheeseKg + b.cheeseKg;
  for (const sp of SPECIES) out.livestock[sp] = a.livestock[sp] + b.livestock[sp];
  return out;
}

// --- Kořist (tažení) --------------------------------------------------------------------------

export interface RaidLootInput {
  /** Stav napadené vsi v den nájezdu. */
  village: VillageState;
  day: number;
  /** Kdo a co ze vsi odešlo před bojem (`planDefense`); chybí – nikdo. */
  shelter: ShelterReport | undefined;
  /** Útočiště dobyté – jeho obránci padli, utekli nebo se vzdali. */
  refugeTaken: boolean;
  /** Kolik útočníci unesou (kg) – `lootCapacity`. */
  capacityKg: number;
  /** Seed tažení a herní dny ve vsi – nalezené jámy (`pitFound`). */
  seed: number;
  daysInVillage: number;
}

/**
 * Nosnost kořisti (war.md – Kořist, Pohyb): 25 kg na muže na nohou spolu s vlastními zásobami
 * (`supplies` – co zbývá z jídla tažení). Raněný nenese (návrh Clauda).
 */
export function lootCapacity(fit: number, suppliesKg: number): number {
  return Math.max(0, fit * WAR.carryKg.man - Math.max(0, suppliesKg));
}

/**
 * Co útočník vezme z dobyté vsi (war.md – Kořist): jídlo ze zásob (obilí, luštěniny, maso, sýr)
 * kolik unese – po druzích ve stejném poměru (návrh Clauda) – a nehlídaný dobytek celý. Útočník
 * drží bojiště, takže všechny skupiny domů jsou dobyté, vzdané nebo opuštěné (podíl lidí 1).
 * Zůstane: co lidé odnesli do lesa, a do útočiště, které útočník nedobyl (i dobytek v něm), osivo
 * (`reservedSeedKg`) a zapečetěné jámy, které útočník nenajde (30 % za jámu po 1 dni ve vsi).
 */
export function raidLoot(input: RaidLootInput): { loot: RaidLoot; pitsFound: number[] } {
  const { village: v, day, shelter } = input;
  const stores = Math.max(0, v.storesKg);
  // odneseno do lesa a do útočiště (`carriedKg` je obojí dohromady, les spočteme znovu)
  const forest = new Set(shelter?.forest ?? []);
  const forestKg = forest.size > 0 ? fleeParty(v, day, forest).carriedKg : 0;
  const refugeKg = Math.max(0, (shelter?.carriedKg ?? 0) - forestKg);
  const keptKg = Math.min(stores, forestKg + (input.refugeTaken ? 0 : refugeKg));
  // zapečetěné jámy – skryté, dokud je útočník nenajde
  const pitsFound: number[] = [];
  let hiddenKg = 0;
  for (const pit of v.grainPits ?? []) {
    if (pit.state !== 'sealed' || pit.grainKg <= 0) continue;
    if (pitFound(input.seed, pit.id, input.daysInVillage)) pitsFound.push(pit.id);
    else hiddenKg += pit.grainKg;
  }
  const grain = Math.max(0, stores - Math.max(0, v.reservedSeedKg ?? 0) - hiddenKg - keptKg);
  const food = {
    grainKg: grain,
    legumesKg: Math.max(0, v.legumesKg ?? 0),
    meatKg: Math.max(0, v.meatKg ?? 0),
    cheeseKg: Math.max(0, v.cheeseKg ?? 0),
  };
  const total = food.grainKg + food.legumesKg + food.meatKg + food.cheeseKg;
  const share = total > input.capacityKg ? input.capacityKg / total : 1;
  const loot = noLoot();
  loot.grainKg = food.grainKg * share;
  loot.legumesKg = food.legumesKg * share;
  loot.meatKg = food.meatKg * share;
  loot.cheeseKg = food.cheeseKg * share;
  for (const sp of SPECIES) {
    const heads = Math.floor((v.livestock?.herds[sp] ?? 0) + (v.livestock?.young[sp] ?? 0) + 1e-9);
    const kept =
      (shelter?.livestockForest[sp] ?? 0) +
      (input.refugeTaken ? 0 : (shelter?.livestockRefuge[sp] ?? 0));
    loot.livestock[sp] = Math.max(0, heads - kept);
  }
  return { loot, pitsFound };
}

// --- Rány a smrt -------------------------------------------------------------------------------

/**
 * Den smrti na rány, nebo null (war.md – Ztráty: 1 z 5 do 30 dní od zranění) – los ze seedu vsi
 * a člověka a dne zranění, takže nezávisí na pořadí ani kouscích dopočtu.
 */
export function woundDeathDayOf(seed: number, personId: number, woundedDay: number): number | null {
  const rng = createRandom(deriveSeed(seed, `wound:${personId}:${woundedDay}`));
  if (rng.next() >= WAR.wounded.deathShare) return null;
  return woundedDay + Math.floor(rng.next() * WAR.wounded.deathWithinDays);
}

/** Raní člověka v den `woundedDay` (zapsáno dne `today`): 60 dní bez práce, los smrti. */
function wound(p: Person, seed: number, woundedDay: number, today: number): void {
  const until = woundedDay + WAR.wounded.days;
  if (until > today) p.woundedUntil = Math.max(p.woundedUntil ?? 0, until);
  const death = woundDeathDayOf(seed, p.id, woundedDay);
  if (death !== null && p.woundDeathDay === undefined) p.woundDeathDay = Math.max(today, death);
}

/**
 * Smrt ve válce (padl v boji, zemřel na rány) – zápis do kroniky jako každá smrt; muž rodu se
 * jménem a id (nástupnictví – `dynastyDay` a nástupnictví hráče). `buried` – pohřeb na hřbitově
 * vsi (padlí útočníci zůstanou na cizí mapě). Člověka neodebírá – to dělá volající.
 */
function warDeath(
  state: VillageState,
  day: number,
  p: Person,
  cause: 'war' | 'wounds',
  buried: boolean,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [
    {
      day,
      kind: 'death',
      group: ageGroup(p, day),
      age: ageYears(p.bornDay, day),
      cause,
      ...(p.name === undefined ? {} : { name: p.name, personId: p.id }),
    },
  ];
  if (buried) {
    const full = bury(state, day, p);
    if (full) events.push(full);
  }
  return events;
}

/**
 * Úmrtí na rány dne (krok dne – před simulací dne, po schránce): kdo má `woundDeathDay` nejvýš
 * dnes, zemře a pohřbí se (kdo je pryč, ne). Muž rodu – nástupnictví ještě týž den (`dynastyDay`).
 */
export function woundDeathsDay(state: VillageState, day: number): ChronicleEvent[] {
  if (!state.people.some((p) => p.woundDeathDay !== undefined && p.woundDeathDay <= day)) return [];
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const p of state.people) {
    if (p.woundDeathDay === undefined || p.woundDeathDay > day) continue;
    events.push(...warDeath(state, day, p, 'wounds', !isAway(p, day)));
    dead.add(p.id);
  }
  removePeople(state, dead);
  return events;
}

// --- Napadená ves ------------------------------------------------------------------------------

/**
 * Výsledek nájezdu v napadené vsi (mutuje stav): padlí zemřou a pohřbí se, ranění 60 dní
 * nepracují ani necvičí (1 z 5 do 30 dní zemře), odvedení odejdou, kořist ubude ze zásob a stád
 * (nejvýš co ves má) a nalezené jámy se vyprázdní. Kronika: věcný zápis nájezdu s tím, co se
 * opravdu stalo, a smrti padlých. Kdo už ve vsi není, se přeskočí.
 */
export function applyRaidResult(
  state: VillageState,
  day: number,
  body: RaidResult,
): ChronicleEvent[] {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const deaths: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of body.fallen) {
    const p = byId.get(id);
    if (!p || dead.has(id)) continue;
    deaths.push(...warDeath(state, day, p, 'war', true));
    dead.add(id);
  }
  let wounded = 0;
  for (const id of new Set(body.wounded)) {
    const p = byId.get(id);
    if (!p || dead.has(id)) continue;
    wound(p, state.seed, day, day);
    wounded++;
  }
  const led = new Set(body.led.filter((id) => byId.has(id) && !dead.has(id)));
  removePeople(state, new Set([...dead, ...led]));
  const captured = captureMen(state, day, body);
  const loot = takeLoot(state, body.loot, body.pitsFound);
  const counts = { fallen: dead.size, wounded, led: led.size + captured, loot };
  return [raidChronicle(day, body, counts), ...deaths];
}

/** Klíč zajetí osoby `personId` z tažení `campaignId`. */
export function prisonerKey(campaignId: string, personId: number): string {
  return `${campaignId}:${personId}`;
}

/**
 * Klíč zajetí hosta z ochrany (`<tažení>:<ves>:<osoba>`) – osoba je z jiné vsi než napadená, číslo
 * by se mohlo potkat s jejími lidmi.
 */
export function guardPrisonerKey(
  campaignId: string,
  ref: { villageId: string; personId: number },
): string {
  return `${campaignId}:${ref.villageId}:${ref.personId}`;
}

/** Zajme osobu (mutuje): `away` zajetí u věznitele; zajatý vojvoda – ves řídí správce. */
export function markCaptive(
  state: VillageState,
  day: number,
  p: Person,
  captorVillageId: string,
  refId: string,
): boolean {
  if (p.away?.kind === 'captive') return false;
  p.away = { kind: 'captive', hostVillageId: captorVillageId, refId };
  if (p.id === currentLord(state)?.id && state.steward?.on !== true) {
    setStewardOn(state, day, true);
    state.steward!.byCaptivity = true;
  }
  return true;
}

/**
 * Zajatí muži rodu zůstanou ve stavu vsi jako pryč (`captive`, bez data návratu – končí propuštěním
 * nebo smrtí). Zajme-li útočník hráčova vojvodu, ves dál řídí formální správce (steward.md –
 * Správce je šlechtic): přepínač se zapne a po návratu vojvody vypne. Vrací počet zajatých.
 */
function captureMen(state: VillageState, day: number, body: RaidResult): number {
  if (!body.captured || !body.captorVillageId) return 0;
  let n = 0;
  for (const id of new Set(body.captured)) {
    const p = state.people.find((x) => x.id === id);
    if (!p) continue;
    if (markCaptive(state, day, p, body.captorVillageId, prisonerKey(body.campaignId, id))) n++;
  }
  return n;
}

/** Ztráty mužů domovské vsi, kteří bránili jinou ves jako hosté z ochrany pánem. */
export interface GuardLosses {
  campaignId: string;
  /** Domovská ves (do klíče zajetí). */
  villageId: string;
  fallen: number[];
  wounded: number[];
  captured: number[];
  captorVillageId: string;
}

/**
 * Ztráty hostů z ochrany v domovské vsi (mutuje stav; vassalage.md – Ochrana vojskem): padlí
 * zemřou (bez pohřbu – padli v cizí vsi; muž rodu = nástupnictví jako u `line-man-fell`), ranění
 * 60 dní nepracují (los smrti), zajatí jsou pryč u věznitele (klíč `guardPrisonerKey`). Kdo už ve
 * vsi není, se přeskočí.
 */
export function applyGuardLosses(
  state: VillageState,
  day: number,
  body: GuardLosses,
): ChronicleEvent[] {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of body.fallen) {
    const p = byId.get(id);
    if (!p || dead.has(id)) continue;
    events.push(...warDeath(state, day, p, 'war', false));
    dead.add(id);
  }
  for (const id of new Set(body.wounded)) {
    const p = byId.get(id);
    if (p && !dead.has(id)) wound(p, state.seed, day, day);
  }
  removePeople(state, dead);
  for (const personId of new Set(body.captured)) {
    const p = byId.get(personId);
    if (!p || dead.has(personId)) continue;
    const key = guardPrisonerKey(body.campaignId, { villageId: body.villageId, personId });
    markCaptive(state, day, p, body.captorVillageId, key);
  }
  return events;
}

/** Zápis nájezdu do kroniky (obě strany – útočník ho dostane ze stejného výsledku). */
export function raidChronicle(
  day: number,
  body: Pick<RaidResult, 'leader' | 'from' | 'target' | 'declared'>,
  counts: { fallen: number; wounded: number; led: number; loot: RaidLoot },
): ChronicleEvent {
  return {
    day,
    kind: 'raid',
    leader: body.leader,
    ...(body.from === undefined ? {} : { from: body.from }),
    ...(body.target === undefined ? {} : { target: body.target }),
    declared: body.declared,
    fallen: counts.fallen,
    wounded: counts.wounded,
    led: counts.led,
    loot: structuredClone(counts.loot),
  };
}

/** Odebere kořist ze zásob a stád (nejvýš co ves má); vrací, co opravdu ubylo. */
function takeLoot(state: VillageState, want: RaidLoot, pitsFound: readonly number[]): RaidLoot {
  const taken = noLoot();
  // nalezené jámy útočník vybral – co neunesl, zůstane jako zrno mimo jámy
  const found = new Set(pitsFound);
  for (const pit of state.grainPits ?? []) {
    if (!found.has(pit.id) || pit.state !== 'sealed') continue;
    pit.grainKg = 0;
    pit.state = 'empty';
    delete pit.filledDay;
  }
  const grainFree = Math.max(0, state.storesKg - Math.max(0, state.reservedSeedKg ?? 0));
  taken.grainKg = Math.min(Math.max(0, want.grainKg), grainFree);
  state.storesKg -= taken.grainKg;
  // co ubylo víc než zrna mimo jámy, bylo v otevřené jámě
  drawGrainPits(state);
  taken.legumesKg = Math.min(Math.max(0, want.legumesKg), state.legumesKg ?? 0);
  if (taken.legumesKg > 0) state.legumesKg = (state.legumesKg ?? 0) - taken.legumesKg;
  taken.meatKg = Math.min(Math.max(0, want.meatKg), state.meatKg ?? 0);
  if (taken.meatKg > 0) state.meatKg = (state.meatKg ?? 0) - taken.meatKg;
  taken.cheeseKg = Math.min(Math.max(0, want.cheeseKg), state.cheeseKg ?? 0);
  if (taken.cheeseKg > 0) state.cheeseKg = (state.cheeseKg ?? 0) - taken.cheeseKg;
  const herds = state.livestock;
  if (herds) {
    for (const sp of SPECIES) {
      // napřed dospělé kusy, pak mláďata
      let left = Math.max(0, Math.floor(want.livestock[sp] + 1e-9));
      const adults = Math.min(left, Math.floor(herds.herds[sp] + 1e-9));
      herds.herds[sp] -= adults;
      left -= adults;
      const young = Math.min(left, Math.floor(herds.young[sp] + 1e-9));
      herds.young[sp] -= young;
      taken.livestock[sp] = adults + young;
    }
  }
  return taken;
}

/**
 * Průlom opevnění (fortifications.md – Prolomení, Životnost a oprava): prolomené úseky zůstanou
 * se stavem 0, než je obyvatelé přestaví – přednostně před ostatními stavbami
 * (`decideFortRebuilds`). Díl prolomený ohněm (`burned`) nese `burnedDay` (scéna – ohořelý
 * průlom); vypálená brána (`gatesBurned`) zapálí i věž nad ní – věž je pryč (Přechod hradby –
 * Oheň; postaví se znovu jako nová). Mutuje stav; neznámé opevnění nebo úsek se přeskočí.
 */
export function applyFortificationBreach(
  state: VillageState,
  day: number,
  body: {
    fortificationId: number;
    segments: readonly number[];
    burned?: readonly number[];
    gatesBurned?: readonly number[];
  },
): void {
  const fort = state.fortifications?.find((f) => f.id === body.fortificationId);
  if (!fort) return;
  const segments = new Set(body.segments);
  const burned = new Set(body.burned ?? []);
  for (const s of fort.segments) {
    // zbořený díl je už mezera – není co prolomit
    if (!segments.has(s.index) || !segmentBuilt(s) || s.demolishedDay !== undefined) continue;
    s.breachedDay ??= day;
    s.state = 0;
    if (burned.has(s.index)) s.burnedDay ??= day;
  }
  for (const index of body.gatesBurned ?? []) {
    const gate = fort.gates.find((g) => g.segment === index);
    if (gate) delete gate.towerDay;
  }
}

// --- Ves útočníka -----------------------------------------------------------------------------

/**
 * Padlý muž rodu (war.md – Ztráty): smrt jako každá jiná – zápis do kroniky se jménem a id,
 * nástupnictví ještě týž den (`dynastyDay`; padne-li hráčův muž, nástupnictví hráče). Nepohřbí
 * se – zůstal na cizí mapě. Mutuje stav.
 */
export function applyLineManFell(
  state: VillageState,
  day: number,
  body: { personId: number },
): ChronicleEvent[] {
  const p = state.people.find((x) => x.id === body.personId);
  if (!p) return [];
  const events = warDeath(state, day, p, 'war', false);
  removePeople(state, new Set([p.id]));
  return events;
}

/**
 * Návrat tažení do vsi útočníka (mutuje stav): muži jsou zase doma (`away` tažení se zruší),
 * ranění 60 dní od zranění nepracují (los smrti jako u obránců), padlí vesničané zemřou (bez
 * pohřbu), kořist přibude do zásob a stád a odvedení přijdou jako noví vesničané s novými id.
 */
export function applyCampaignReturn(
  state: VillageState,
  day: number,
  body: CampaignReturn,
): ChronicleEvent[] {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of body.fallen) {
    const p = byId.get(id);
    if (!p || dead.has(id)) continue;
    events.push(...warDeath(state, day, p, 'war', false));
    dead.add(id);
  }
  for (const id of body.back) {
    const p = byId.get(id);
    if (!p || dead.has(id)) continue;
    if (p.away?.kind === 'campaign' && p.away.refId === body.campaignId) delete p.away;
  }
  for (const w of body.wounded) {
    const p = byId.get(w.personId);
    if (p && !dead.has(p.id)) wound(p, state.seed, w.day, day);
  }
  removePeople(state, dead);
  if (body.loot) addLoot(state, body.loot);
  if (body.people && body.people.length > 0) settleLed(state, body.people);
  for (const pr of body.prisoners ?? []) holdPrisoner(state, day, pr);
  return events;
}

/** Zajatec dorazil do vsi věznitele: zapíše se a jí z jeho zásob (host druhu `captive`). */
function holdPrisoner(state: VillageState, day: number, prisoner: Prisoner): void {
  const list = (state.prisoners ??= []);
  if (list.some((x) => x.id === prisoner.id)) return;
  list.push(structuredClone(prisoner));
  hostGuests(state, day, [
    { ref: { ...prisoner.ref }, kind: 'captive', untilDay: CAPTIVITY_OPEN_END, adult: true },
  ]);
}

/** Zajetí nemá datum konce – host druhu `captive` neodchází, dokud ho nepropustí rozhodnutí. */
const CAPTIVITY_OPEN_END = 1_000_000_000;

/** Kořist do zásob a stád (dobytek jako dospělé kusy). */
function addLoot(state: VillageState, loot: RaidLoot): void {
  state.storesKg += Math.max(0, loot.grainKg);
  if (loot.legumesKg > 0) state.legumesKg = (state.legumesKg ?? 0) + loot.legumesKg;
  if (loot.meatKg > 0) state.meatKg = (state.meatKg ?? 0) + loot.meatKg;
  if (loot.cheeseKg > 0) state.cheeseKg = (state.cheeseKg ?? 0) + loot.cheeseKg;
  if (!SPECIES.some((sp) => loot.livestock[sp] > 0)) return;
  const herds = ensureLivestock(state).herds;
  for (const sp of SPECIES) herds[sp] += Math.max(0, loot.livestock[sp]);
}

/**
 * Odvedení se usadí (war.md – Ztráty: „usadí se do volných míst, nebo založí domácnost, až bude
 * dům“): nová místní id (`rehomePeople`), vazby uvnitř skupiny zůstanou. Kdo nemá rodiče mezi
 * odvedenými, jde do domu jako příchozí od souseda (`newcomerHome` – s manželem nebo dětmi jako
 * rodina), manžel a děti za ním. Bez obydlí ve vsi nepřijdou.
 */
function settleLed(state: VillageState, people: readonly Person[]): void {
  // vesničané bez příznaků rodu a nepřítomnosti z napadené vsi
  const clean = people.map((p): Person => {
    const copy = structuredClone(p);
    delete copy.away;
    delete copy.line;
    delete copy.noble;
    delete copy.mainWifeSon;
    return copy;
  });
  const { arrivals } = rehomePeople(state, clean);
  const ids = new Set(arrivals.map((p) => p.id));
  const homeOf = new Map<number, number>();
  const inBatch = (id: number | undefined): id is number => id !== undefined && ids.has(id);
  const heads = arrivals.filter((p) => !inBatch(p.motherId) && !inBatch(p.fatherId));
  const rest = arrivals.filter((p) => inBatch(p.motherId) || inBatch(p.fatherId));
  const place = (p: Person, home: number | undefined): void => {
    if (home === undefined) return;
    p.dwellingId = home;
    homeOf.set(p.id, home);
    state.people.push(p);
  };
  for (const p of heads) {
    const spouseHome = p.spouseId === undefined ? undefined : homeOf.get(p.spouseId);
    const family =
      inBatch(p.spouseId) || arrivals.some((c) => c.motherId === p.id || c.fatherId === p.id);
    place(p, spouseHome ?? newcomerHome(state, family));
  }
  // děti v pořadí id (starší sourozenci dřív) – k rodiči, jinak samy jako příchozí
  for (const p of rest.sort((a, b) => a.id - b.id)) {
    const parent =
      (p.motherId === undefined ? undefined : homeOf.get(p.motherId)) ??
      (p.fatherId === undefined ? undefined : homeOf.get(p.fatherId));
    place(p, parent ?? newcomerHome(state, false));
  }
}
