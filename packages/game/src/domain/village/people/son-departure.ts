import { leavingCart, villageCarts } from '../crafts/carts';
import {
  departLeavers,
  everyoneLeaves,
  leavingFood,
  leavingSeedKg,
  isVillageDormant,
  validateDepartureDay,
  villageCentre,
  type Settlers,
} from './departure';
import { currentLord, isLineMan, wivesOf } from './dynasty';
import { SON_NAME_MISSING } from './dynasty-names';
import { villageHorses } from '../livestock/horses';
import { villageManorId } from './manor';
import { ageYears, onExpedition } from './people';
import type { PlacementCheck } from '../placement/placement';
import { relocatingHouseholds } from './relocation';
import { LORD } from '../rules';
import { successorOf } from './succession';
import type { Direction8, Horse, Person, VillageState } from '../types';
import type { CartKind } from '../types/types-roads';

// Dělení vsi – syn vojvody zakládá novou ves (lord.md – Dělení vsi, #9 fáze 2; Martin 30. 10. 2026:
// „odchází poměrná část vsi“): kdo smí vést odchod, poměrná část vsi a odchod syna s ní. Díl
// počítá jedna čistá funkce (`sonShare`) – náhled v panelu, server i NPC (fáze 3). Vstupní stav
// funkce nemění.

/** Ves bez vojvody – odchod syna nemá kdo vést. */
const LEAD_NO_LORD = 'Ve vsi není vojvoda.';
/** Odchod vede jen syn vojvody (lord.md – Kdo může vést odchod). */
export const LEAD_NOT_SON = 'Odchod vede syn vojvody.';
/** Syn mladší LORD.leaveMinAge let (v panelu chybí). */
export const LEAD_TOO_YOUNG = `Odchod vede syn od ${LORD.leaveMinAge} let.`;
/** Nástupce vojvody odchod nevede – mateřská ves je jeho díl (lord.md – Kdo může vést odchod). */
export const SUCCESSOR_STAYS = 'Nástupce zůstává.';
/** Někdo z dílu syna je na výpravě (jako `departureBlock` – expeditions.md, Odchod ze vsi). */
export const SON_SHARE_AWAY = 'Někdo z dílu syna je na výpravě.';
/** Rodina syna si staví nový dům (jako `departureBlock`). */
export const SON_RELOCATING = 'Domácnost, která si staví nový dům, odejít nemůže.';

/**
 * Poměrná část vsi syna (lord.md – Dělení vsi, Poměrná část vsi): lidé a obydlí, která s ním
 * odejdou, a počty pro náhled v panelu.
 */
export interface SonShare {
  sonId: number;
  /** Dílníci – žijící vojvoda ve vsi a jeho synové od LORD.leaveMinAge let ve vsi (i tento syn). */
  sharers: number;
  /** Cílový počet lidí dílu – lidé vsi ÷ dílníci (nemusí být celé číslo). */
  target: number;
  /** Rodina syna – on, jeho manželky a jejich svobodné děti, ať bydlí kdekoli (id vzestupně). */
  familyIds: number[];
  /** Obydlí, jejichž celé domácnosti odejdou – od nejbližšího domu syna (dvorce). */
  dwellingIds: number[];
  /** Všichni lidé dílu – rodina syna a domácnosti obydlí `dwellingIds` (id vzestupně). */
  personIds: number[];
}

/**
 * Synové vojvody `dynasty.lordId` ve vsi (muži rodu) – od nejstaršího, při shodě nižší id. S
 * `fatherId` (zemřelý otec po pohřbu – odchod mladšího syna, seniorate.md) jsou to jeho synové,
 * tedy i nynější vojvoda a jeho bratři.
 */
function lordSons(state: VillageState, fatherId?: number): Person[] {
  const lordId = fatherId ?? state.dynasty?.lordId;
  if (lordId === undefined || lordId === null) return [];
  return state.people
    .filter((p) => isLineMan(p) && p.fatherId === lordId)
    .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id);
}

/**
 * Rodina syna, která s ním odchází vždy (lord.md – Poměrná část vsi): on, jeho manželky
 * (`wivesOf`) a jejich svobodné děti – jeho i manželek –, ať bydlí kdekoli (i v dvorci).
 */
export function sonFamily(state: VillageState, son: Person): Person[] {
  const wives = new Set(wivesOf(state, son).map((w) => w.id));
  return state.people.filter(
    (p) =>
      p.id === son.id ||
      wives.has(p.id) ||
      (p.spouseId === undefined &&
        (p.fatherId === son.id || (p.motherId !== undefined && wives.has(p.motherId)))),
  );
}

/** Jezdecký kůň syna (`riderId` – horses.md, Kdo na kterém koni), nebo undefined. */
export function sonHorse(state: Pick<VillageState, 'pens'>, sonId: number): Horse | undefined {
  return villageHorses(state).find((h) => h.riderId === sonId);
}

/**
 * Smí syn `sonId` vést odchod s poměrnou částí vsi (lord.md – Dělení vsi, Kdo může vést odchod)?
 * Syn vojvody (muž rodu), žijící ve vsi, od LORD.leaveMinAge let, ne nástupce (`successorOf` – kdo
 * by nastoupil dnes), se jménem; jeho rodina si nesmí stavět nový dům. Důvod česky pro hráče
 * (u kurzoru) i pro server. `relocatingNow` – už spočítané stěhující se domácnosti (jinak se spočtou).
 * `fatherId` – zemřelý otec: syn je mladší bratr nynějšího vojvody (odchod po pohřbu hráčova muže).
 */
export function checkSonLeader(
  state: VillageState,
  sonId: number,
  day: number,
  relocatingNow?: ReadonlySet<number>,
  fatherId?: number,
): PlacementCheck {
  if (isVillageDormant(state)) return { ok: false, reason: 'Ve vsi nikdo nežije.' };
  const lordId = state.dynasty?.lordId;
  if (lordId === undefined || lordId === null) return { ok: false, reason: LEAD_NO_LORD };
  const son = lordSons(state, fatherId).find((p) => p.id === sonId);
  if (!son) return { ok: false, reason: LEAD_NOT_SON };
  if (ageYears(son.bornDay, day) < LORD.leaveMinAge) return { ok: false, reason: LEAD_TOO_YOUNG };
  if (successorOf(state, fatherId ?? lordId)?.id === son.id)
    return { ok: false, reason: SUCCESSOR_STAYS };
  if (son.name === undefined) return { ok: false, reason: SON_NAME_MISSING };
  const relocating = relocatingNow ?? relocatingHouseholds(state);
  if (sonFamily(state, son).some((p) => relocating.has(p.dwellingId))) {
    return { ok: false, reason: SON_RELOCATING };
  }
  const share = sonShare(state, son.id, day, fatherId);
  const leaving = new Set(share?.personIds ?? []);
  if (state.people.some((p) => leaving.has(p.id) && onExpedition(p, day))) {
    return { ok: false, reason: SON_SHARE_AWAY };
  }
  return { ok: true, reason: null };
}

/**
 * Synové, kteří by mohli vést odchod (řada ikon synů v panelu dvorce – lord.md, Co hráč vidí):
 * synové vojvody od LORD.leaveMinAge let ve vsi od nejstaršího, s kontrolou `checkSonLeader`
 * (nástupce a syn bez jména zašedlí s důvodem). Mladší synové chybí.
 */
export function leadingSons(
  state: VillageState,
  day: number,
): { son: Person; check: PlacementCheck }[] {
  // stěhující se domácnosti stačí spočítat jednou pro všechny syny
  const relocating = relocatingHouseholds(state);
  return lordSons(state)
    .filter((p) => ageYears(p.bornDay, day) >= LORD.leaveMinAge)
    .map((son) => ({ son, check: checkSonLeader(state, son.id, day, relocating) }));
}

/** Čtverec vzdálenosti dvou bodů v rovině (m²) – jen na pořadí, deterministicky bez odmocniny. */
function distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Poměrná část vsi syna `sonId` (lord.md – Dělení vsi, Poměrná část vsi; Martin 30. 10. 2026):
 * díl = 1 ÷ dílníků (žijící vojvoda ve vsi a jeho synové od LORD.leaveMinAge let ve vsi). Rodina
 * syna (`sonFamily`) odchází vždy; k ní celé domácnosti z obydlí nejblíž domu syna (bydlí-li
 * v dvorci nebo bez domu, nejblíž dvorci), dokud se počet lidí dílu blíží cíli (lidé ÷ dílníci) –
 * domácnost, se kterou by byl od cíle stejně nebo dál, přeskočí a pokračuje další nejbližší
 * (velká domácnost u domu syna díl nezablokuje; návrh Clauda). Do dílu nepatří dvorec, domácnosti vojvody a ostatních jeho synů (mají
 * svůj díl), domácnosti, které si staví nový dům, ani domy, ze kterých odchází jen rodina syna
 * (zbytek domácnosti v domě zůstane – kinship.md). Pořadí obydlí podle čtverce vzdálenosti, při
 * shodě nižší id. Syn, který ve vsi není, – null. Nekontroluje, smí-li syn vést (`checkSonLeader`).
 */
export function sonShare(
  state: VillageState,
  sonId: number,
  day: number,
  fatherId?: number,
): SonShare | null {
  const son = state.people.find((p) => p.id === sonId);
  if (!son) return null;
  const lord = currentLord(state);
  const sons = lordSons(state, fatherId);
  const grownSons = sons.filter((p) => ageYears(p.bornDay, day) >= LORD.leaveMinAge);
  // po smrti otce je vojvodou jeden z jeho synů – počítá se jednou (otec už neděluje)
  const sharers =
    fatherId === undefined
      ? Math.max(
          1,
          (lord ? 1 : 0) + grownSons.length + (grownSons.some((p) => p.id === sonId) ? 0 : 1),
        )
      : new Set([...(lord ? [lord.id] : []), ...grownSons.map((p) => p.id), sonId]).size;
  const target = state.people.length / sharers;
  const family = sonFamily(state, son);
  const familyIds = new Set(family.map((p) => p.id));
  const manorId = villageManorId(state);
  const excluded = new Set<number>(relocatingHouseholds(state));
  if (manorId !== null) excluded.add(manorId);
  if (lord) excluded.add(lord.dwellingId);
  for (const p of sons) if (p.id !== sonId) excluded.add(p.dwellingId);
  for (const p of family) excluded.add(p.dwellingId);
  const home =
    state.dwellings.find((d) => d.id === son.dwellingId) ??
    state.dwellings.find((d) => d.id === manorId);
  const anchor = home ? home.position : villageCentre(state);
  const sizes = new Map<number, number>();
  for (const p of state.people) sizes.set(p.dwellingId, (sizes.get(p.dwellingId) ?? 0) + 1);
  const candidates = state.dwellings
    .filter((d) => !excluded.has(d.id) && (sizes.get(d.id) ?? 0) > 0)
    .map((d) => ({ id: d.id, size: sizes.get(d.id) ?? 0, d2: distanceSq(d.position, anchor) }))
    .sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  let count = family.length;
  const dwellingIds: number[] = [];
  for (const c of candidates) {
    if (count >= target) break;
    // domácnost, která by díl oddálila od cíle (nebo ho nezlepšila), se přeskočí – další menší
    // se ještě může vejít
    if (Math.abs(count + c.size - target) >= Math.abs(count - target)) continue;
    dwellingIds.push(c.id);
    count += c.size;
  }
  const households = new Set(dwellingIds);
  const personIds = state.people
    .filter((p) => familyIds.has(p.id) || households.has(p.dwellingId))
    .map((p) => p.id)
    .sort((a, b) => a - b);
  return {
    sonId,
    sharers,
    target,
    familyIds: [...familyIds].sort((a, b) => a - b),
    dwellingIds,
    personIds,
  };
}

/** Náhled odchodu syna (panel dvorce – lord.md, Co hráč vidí): co odnese, jak ho udělá `departWithSon`. */
export interface SonDeparturePreview {
  share: SonShare;
  /** Obydlí k obrysu ve scéně – domácnosti dílu a domy rodiny syna mimo dvorec (dvorec zůstává). */
  outlineDwellingIds: number[];
  /** Všichni odcházející (rodina syna i domácnosti dílu). */
  people: number;
  /** Jídlo, které odnesou (kg, bez osiva). */
  foodKg: number;
  /** Osivo, které odnesou (kg obilí). */
  seedKg: number;
  /** Vůz, který odveze (odejdou-li s ním všichni, první z vozů vsi). */
  cart: CartKind | null;
  /** Syn si bere jezdeckého koně. */
  horse: boolean;
}

/**
 * Náhled odchodu syna `sonId` – stejnými funkcemi jako `departWithSon` (`sonShare`, `leavingCart`,
 * `leavingFood`, `leavingSeedKg`, `sonHorse`), takže se s výsledkem shoduje i pro díl jen z rodiny
 * syna. `share` lze předat, má-li ho volající spočtený. Syn ve vsi nikde – null. Nekontroluje
 * `checkSonLeader`. Obrys: domácnosti dílu a domy rodiny kromě dvorce (ten je zdrojem, ne dílem;
 * rodina z něj odchází jen částí).
 */
export function sonDeparturePreview(
  state: VillageState,
  sonId: number,
  day: number,
  fatherId?: number,
  share: SonShare | null = sonShare(state, sonId, day, fatherId),
): SonDeparturePreview | null {
  if (!share) return null;
  const leaving = new Set(share.personIds);
  const leavers = state.people.filter((p) => leaving.has(p.id));
  const cart =
    (everyoneLeaves(leavers.length, state.people.length)
      ? villageCarts(state)[0]
      : leavingCart(state, day)?.cart
    )?.kind ?? null;
  const food = leavingFood(state, leavers, day, cart);
  const manorId = villageManorId(state);
  const outline = new Set(share.dwellingIds);
  for (const p of leavers) if (p.dwellingId !== manorId) outline.add(p.dwellingId);
  return {
    share,
    outlineDwellingIds: [...outline].sort((a, b) => a - b),
    people: leavers.length,
    foodKg: Object.values(food).reduce((sum, kg) => sum + kg, 0),
    seedKg: leavingSeedKg(state, leavers, day, cart),
    cart,
    horse: sonHorse(state, sonId) !== undefined,
  };
}

/**
 * Syn vojvody `sonId` odejde s poměrnou částí vsi založit novou ves (lord.md – Dělení vsi): lidé
 * dílu (`sonShare`) po lidech – rodina syna i z dvorce a cizího domu, k ní celé domácnosti –,
 * jídlo, osivo, poměrný díl stád a volný vůz s voly podle lidí dílu jako při odchodu domácností
 * (`departLeavers`), a jezdecký kůň syna (`sonHorse`). Osadníci nesou vůdce (`Settlers.lordId`) –
 * v nové vsi je vojvodou. Kronika mateřské vsi `son-left-village` se jménem syna a nové vsi
 * (`villageName` – jméno zná use-case), na novou mapu (`direction`) i se směrem. RangeError, když
 * syn vést nesmí (`checkSonLeader`) nebo je den neplatný. Vstupní stav nemění.
 */
export function departWithSon(
  state: VillageState,
  day: number,
  sonId: number,
  options: { direction?: Direction8; villageName?: string; fatherId?: number } = {},
): { state: VillageState; settlers: Settlers } {
  validateDepartureDay(state, day);
  const check = checkSonLeader(state, sonId, day, undefined, options.fatherId);
  if (!check.ok) throw new RangeError(check.reason ?? LEAD_NOT_SON);
  const share = sonShare(state, sonId, day, options.fatherId);
  if (!share) throw new RangeError(LEAD_NOT_SON);
  const leaving = new Set(share.personIds);
  const leavers = state.people.filter((p) => leaving.has(p.id));
  const son = leavers.find((p) => p.id === sonId);
  const { direction, villageName } = options;
  const horse = sonHorse(state, sonId);
  return departLeavers(state, day, leavers, {
    event: {
      day,
      kind: 'son-left-village',
      ...(son?.name === undefined ? {} : { name: son.name }),
      ...(villageName === undefined ? {} : { village: villageName }),
      households: share.dwellingIds.length,
      people: leavers.length,
      ...(direction ? { direction } : {}),
    },
    ...(direction ? { direction } : {}),
    lordId: sonId,
    stewarded: true,
    ...(horse ? { horseId: horse.id } : {}),
  });
}
