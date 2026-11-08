import { addCattle, cattleForSale, removeCattle } from '../village/cattle-trade';
import { cloneState } from '../village/clone';
import { villageHayKg } from '../village/hay';
import { addHorses, horsesForSale, horsesToSell, removeHorses } from '../village/horse-trade';
import { removePeople } from '../village/kinship';
import { ensureLivestock, LIVESTOCK } from '../village/livestock';
import { logArrivalPoint } from '../village/log-piles';
import { CATTLE_GOODS, HORSE_GOODS } from '../village/neighbours';
import { emigrantGroups, emigrantList, newcomerHome, peopleCount } from '../village/people-trade';
import { addStone, stoneOnHand, takeStone } from '../village/stone';
import { rehomePeople } from '../village/transfer-people';
import type {
  CattleGood,
  ChronicleEvent,
  Direction8,
  ShipmentBody,
  ShipmentManifest,
  TradedHorse,
  TradeGoods,
  VillageState,
} from '../village/types';
import { addLogs, takeLogs, woodLogs } from '../village/wood';
import { OPPOSITE } from '../village/world-grid';
import { stoneOf, type MacroBundle } from './macro';
import { VASSALAGE } from './rules-vassalage';
import { transportLimit } from './transport';

// Zásilky mezi vsemi různých hráčů (vassalage.md – Doprava a cílová ves, Lidé a robota; plán
// 2026-11-03 – rozhodnutí 10). Odesílatel: zboží a lidé ze vsi zmizí hned a ves pošle výpravu
// nosičů, honáků a vozků (`TradeExpedition.kind = 'shipment'`, práce zdarma ze společné práce
// vsi). Příjemce: zboží a lidé dojdou událostí schránky `shipment` v den příjezdu. Bilance je
// přesná: co odešlo, dojde (kromě koní bez ohrady, které ves porazí – jako v obchodě).

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Za kolik dní zásilka na `cells` políček dojde (2 herní dny na políčko – VASSALAGE.travelDaysPerCell;
 * uvnitř políčka polovina nejkratší cesty k sousedovi, aspoň den) a za kolik se nosiči vrátí (tam
 * a zpět).
 */
export function shipmentDays(cells: number): { arrive: number; roundTrip: number } {
  const arrive =
    cells > 0
      ? cells * VASSALAGE.travelDaysPerCell
      : Math.max(1, Math.ceil(VASSALAGE.transport.sameCellTripDays / 2));
  return { arrive, roundTrip: 2 * arrive };
}

/** Souhrn svazku bez roboty (robota nejde zásilkou, ale prací v pánově vsi). */
function manifestOf(bundle: MacroBundle): ShipmentManifest {
  return {
    grainKg: bundle.grainKg,
    hayKg: bundle.hayKg,
    logs: bundle.logs,
    ...(stoneOf(bundle) > 0 ? { stoneM3: stoneOf(bundle) } : {}),
    cattle: { ...bundle.cattle },
    horses: bundle.horses,
    people: { ...bundle.people },
  };
}

/** Souhrn těla zásilky (kronika). */
function manifestOfBody(body: ShipmentBody): ShipmentManifest {
  return {
    grainKg: body.grainKg,
    hayKg: body.hayKg,
    logs: body.logs,
    ...((body.stoneM3 ?? 0) > 0 ? { stoneM3: body.stoneM3 } : {}),
    cattle: { ...body.cattle },
    horses: body.horses.length,
    people: {
      families: body.groups.filter((g) => g.kind === 'family').length,
      men: body.groups.filter((g) => g.kind === 'man').length,
      women: body.groups.filter((g) => g.kind === 'woman').length,
    },
  };
}

/** Nosiči a honáci zásilky (jako v dopravě `transportLimit`): 25 kg na nosiče, kláda dva nosiči. */
function carriers(bundle: MacroBundle): number {
  const t = VASSALAGE.transport;
  const kg = Math.ceil((bundle.grainKg + bundle.hayKg) / t.porterKg - EPSILON);
  const logs = bundle.logs * t.logCarriers;
  // kámen jede vozem: na každý započatý náklad největšího vozu vozka a pomocník (`cartCrew`)
  const stoneLoads = Math.ceil(
    (stoneOf(bundle) * t.stoneKgPerM3) / t.cartKg['four-wheel'] - EPSILON,
  );
  const stone = stoneLoads * t.cartCrew;
  const heads = CATTLE_GOODS.reduce((n, g) => n + bundle.cattle[g], 0);
  const drovers =
    Math.ceil(heads / t.headsPerDrover - EPSILON) +
    Math.ceil(bundle.horses / t.horsesPerDrover - EPSILON);
  return Math.max(1, kg + logs + stone + drovers);
}

/** Zboží zásilky v tvaru obchodu (scéna: co karavana nese a kolik dobytka žene). */
function sceneGoods(bundle: MacroBundle): TradeGoods {
  const out: TradeGoods = {};
  if (bundle.grainKg > 0) out.grain = bundle.grainKg;
  if (bundle.logs > 0) out.logs = bundle.logs;
  if (stoneOf(bundle) > 0) out.stone = stoneOf(bundle);
  for (const g of CATTLE_GOODS) if (bundle.cattle[g] > 0) out[g] = bundle.cattle[g];
  return out;
}

/** Kolik ves smí dát z dobytka – krávy nad `TRADE.keepCows`, voli podle `cattleForSale`. */
function haveCattle(state: VillageState, good: CattleGood, day: number): number {
  return cattleForSale(state, good, day);
}

/** Kontrola, že ves svazek má; jinak česky, co chybí. */
function shortage(state: VillageState, day: number, bundle: MacroBundle): string | null {
  const values = [
    bundle.grainKg,
    bundle.hayKg,
    bundle.logs,
    stoneOf(bundle),
    bundle.horses,
    bundle.people.families,
    bundle.people.men,
    bundle.people.women,
    ...CATTLE_GOODS.map((g) => bundle.cattle[g]),
  ];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Zásilka má záporné množství.';
  if (values.every((v) => v === 0)) return 'Zásilka je prázdná.';
  if (bundle.logs !== Math.floor(bundle.logs)) return 'Klády se vezou po celých kusech.';
  if (stoneOf(bundle) !== Math.floor(stoneOf(bundle))) return 'Kámen se vozí po celých m³.';
  if (bundle.grainKg > state.storesKg + EPSILON) return 'Ves tolik obilí nemá.';
  if (bundle.hayKg > villageHayKg(state) + EPSILON) return 'Ves tolik sena nemá.';
  if (bundle.logs > woodLogs(state) + EPSILON) return 'Ves tolik klád nemá.';
  if (stoneOf(bundle) > stoneOnHand(state) + EPSILON) return 'Ves tolik kamene nemá.';
  for (const good of CATTLE_GOODS) {
    if (bundle.cattle[good] > haveCattle(state, good, day)) return 'Ves tolik dobytka nedá.';
  }
  const horses = HORSE_GOODS.reduce((n, g) => n + horsesForSale(state, g, day), 0);
  if (bundle.horses > horses) return 'Ves tolik koní nedá.';
  const leaving = emigrantGroups(state, day, bundle.people);
  if (
    leaving.families.length < bundle.people.families ||
    leaving.men.length < bundle.people.men ||
    leaving.women.length < bundle.people.women
  ) {
    return 'Tolik lidí ves dát nemůže – bez dědiců, dvorce a bez rozpadu domácností.';
  }
  return null;
}

/**
 * Kontrola meze dopravy (`transportLimit` podle společné práce vsi, dne a vzdálenosti): zásilka
 * nad ni se nepošle. Lidé a robota jdou po svých, mez nemají. Server je jediná autorita – dialog
 * mez jen ukazuje.
 */
function overTransport(
  state: VillageState,
  day: number,
  cells: number,
  bundle: MacroBundle,
): string | null {
  const limit = transportLimit(state, day, cells);
  if (bundle.grainKg > limit.grainKg + EPSILON) return 'Obilí je víc, než ves unese.';
  if (bundle.hayKg > limit.hayKg + EPSILON) return 'Sena je víc, než ves unese.';
  if (bundle.logs > limit.logs) return 'Klád je víc, než ves odveze.';
  if (stoneOf(bundle) > limit.stoneM3) return 'Kamene je víc, než ves odveze.';
  if (CATTLE_GOODS.some((g) => bundle.cattle[g] > limit.cattle[g])) {
    return 'Dobytka je víc, než ves dožene.';
  }
  if (bundle.horses > limit.horses) return 'Koní je víc, než ves dožene.';
  return null;
}

/**
 * Zásilka vyrazí (vassalage.md – Doprava a cílová ves; stav vstupu nemění): obilí, seno, klády,
 * dobytek a koně (kdo smí do prodeje – `horsesToSell`, hřebec a chovné klisny zůstanou) a lidé
 * (`emigrantGroups` – rodiny, muži, ženy; muže rodu a jejich ženy ves nedá – `keptByLine`) ze vsi
 * zmizí a putují jako tytéž osoby. Výprava nosičů odejde ke
 * kraji mapy ve směru `firstStep` a vrátí se za `4 × cells` dní bez zboží (práce zdarma ze
 * společné práce vsi). `body` je to, co dojde do schránky cílové vsi v den `day + 2 × cells`
 * (`ShipmentBody`), `state` ves po odeslání. Robota (`laborDays`) se tu neposílá. Nedostatek →
 * `{ ok: false, reason }`; zásilka nad mez dopravy (`transportLimit`) se odmítne.
 */
export function dispatchShipment(
  state: VillageState,
  day: number,
  input: {
    bundle: MacroBundle;
    cells: number;
    firstStep: Direction8;
    /** Jak se jmenuje cílová ves a odesílatel – do kroniky a těla zásilky. */
    toName?: string;
    fromName?: string;
    fromVillageId?: string;
    purpose?: string;
    /** Jídlo domény – dobytek se v cíli porazí (`ShipmentBody.domain`). */
    domain?: true;
  },
):
  | { ok: true; state: VillageState; body: ShipmentBody; arrivesDay: number }
  | { ok: false; reason: string } {
  const { bundle } = input;
  const reason = shortage(state, day, bundle) ?? overTransport(state, day, input.cells, bundle);
  if (reason !== null) return { ok: false, reason };
  const next = cloneState(state);
  const trade = (next.trade ??= { neighbours: [], expeditions: [], nextId: 1 });
  const id = trade.nextId++;
  next.storesKg = Math.max(0, next.storesKg - bundle.grainKg);
  if (bundle.hayKg > 0 && next.hay) next.hay.kg = Math.max(0, next.hay.kg - bundle.hayKg);
  if (bundle.logs > 0) takeLogs(next, bundle.logs);
  if (stoneOf(bundle) > 0) takeStone(next, stoneOf(bundle), logArrivalPoint(next));
  for (const good of CATTLE_GOODS) removeCattle(next, good, bundle.cattle[good], day);
  // koně: kdo je v prodeji, v pořadí druhů (hříbata, klisny, jezdečtí koně)
  const horses: TradedHorse[] = [];
  let horsesLeft = bundle.horses;
  for (const good of HORSE_GOODS) {
    const n = Math.min(horsesLeft, horsesForSale(next, good, day));
    if (n <= 0) continue;
    for (const h of horsesToSell(next, good, n, day)) {
      horses.push({
        bornDay: h.bornDay,
        sex: h.sex,
        training: h.training,
      });
    }
    removeHorses(next, good, n, day);
    horsesLeft -= n;
  }
  // lidé: kdo odchází, v rodokmenu zůstane jako odešlý ve směru cesty
  const groups = emigrantList(emigrantGroups(next, day, bundle.people));
  const members = groups.flatMap((g) =>
    g.people.map((p) => ({ sex: p.sex ?? 'male', bornDay: p.bornDay, group: g.kind })),
  );
  removePeople(
    next,
    new Set(groups.flatMap((g) => g.people.map((p) => p.id))),
    new Map(groups.flatMap((g) => g.people.map((p) => [p.id, input.firstStep] as const))),
  );
  const { arrive, roundTrip } = shipmentDays(input.cells);
  const porters = carriers(bundle);
  trade.expeditions.push({
    id,
    kind: 'shipment',
    destination: { cells: input.cells, firstStep: input.firstStep },
    direction: input.firstStep,
    trailId: -1,
    startedDay: day,
    give: sceneGoods(bundle),
    get: {},
    porters,
    days: roundTrip,
    cost: porters * roundTrip,
    done: 0,
    ...(members.length > 0
      ? {
          givePeople: {
            ...bundle.people,
            people: peopleCount(groups),
            members,
          },
        }
      : {}),
  });
  next.chronicle.push({
    day,
    kind: 'shipment-sent',
    villageName: input.toName ?? '',
    goods: manifestOf(bundle),
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  });
  const body: ShipmentBody = {
    key: `ship:${input.fromVillageId ?? ''}:${id}`,
    fromVillageId: input.fromVillageId ?? '',
    fromName: input.fromName ?? '',
    direction: OPPOSITE[input.firstStep],
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.domain ? { domain: true as const } : {}),
    grainKg: bundle.grainKg,
    hayKg: bundle.hayKg,
    logs: bundle.logs,
    ...(stoneOf(bundle) > 0 ? { stoneM3: stoneOf(bundle) } : {}),
    cattle: { ...bundle.cattle },
    horses,
    groups: groups.map((g) => ({ kind: g.kind, people: structuredClone(g.people) })),
  };
  return { ok: true, state: next, body, arrivesDay: day + arrive };
}

/**
 * Zásilka dorazila do vsi (mutuje stav – událost schránky): obilí a seno do zásob, klády na
 * hromadu, dobytek do stáda a ohrad (volně, kdo se nevejde – jako koupený), koně do ohrad koní
 * (bez ohrady je ves porazí), tytéž osoby s novými místními id (`rehomePeople`; vazby uvnitř skupiny zůstanou, ostatní se
 * přeruší) a jako noví vesničané v domě podle `newcomerHome`.
 * Vrací zápis do kroniky.
 */
export function receiveShipment(
  state: VillageState,
  day: number,
  body: ShipmentBody,
): ChronicleEvent[] {
  state.storesKg += body.grainKg;
  if (body.hayKg > 0) {
    const hay = (state.hay ??= { kg: 0, mowing: null });
    hay.kg += body.hayKg;
  }
  addLogs(state, body.logs, null);
  addStone(state, body.stoneM3 ?? 0, null);
  if (body.domain) {
    // jídlo domény: dobytek je hned poražen a snězen (jako na dobytčích trzích), do stád nejde
    const heads = CATTLE_GOODS.reduce((n, g) => n + body.cattle[g], 0);
    state.meatKg = (state.meatKg ?? 0) + heads * LIVESTOCK.meatKg.cow;
    state.domainFoodDay = day;
  } else {
    if (CATTLE_GOODS.some((g) => body.cattle[g] > 0)) ensureLivestock(state);
    for (const good of CATTLE_GOODS) addCattle(state, good, body.cattle[good], day);
  }
  addHorses(state, body.horses, day);
  const events: ChronicleEvent[] = [];
  for (const group of body.groups) {
    const home = newcomerHome(state, group.kind === 'family');
    if (home === undefined) continue;
    const { arrivals } = rehomePeople(state, group.people);
    for (const p of arrivals) {
      p.dwellingId = home;
      p.origin = body.direction;
    }
    state.people.push(...arrivals);
  }
  events.push({
    day,
    kind: 'shipment-received',
    villageName: body.fromName,
    goods: manifestOfBody(body),
    ...(body.purpose === undefined ? {} : { purpose: body.purpose }),
    ...(body.returned ? { returned: true as const } : {}),
  });
  return events;
}
