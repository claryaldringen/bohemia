import { addCattle, cattleForSale, removeCattle } from '../village/cattle-trade';
import { cloneState } from '../village/clone';
import { villageHayKg } from '../village/hay';
import { addHorses, horsesForSale, horsesToSell, removeHorses } from '../village/horse-trade';
import { removePeople } from '../village/kinship';
import { ensureLivestock } from '../village/livestock';
import { CATTLE_GOODS, HORSE_GOODS } from '../village/neighbours';
import {
  emigrantGroups,
  emigrantList,
  peopleCount,
  settleNewcomers,
} from '../village/people-trade';
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
import type { MacroBundle } from './macro';
import { VASSALAGE } from './rules-vassalage';

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
    cattle: { ...body.cattle },
    horses: body.horses.length,
    people: {
      families: body.families.length,
      men: body.men,
      women: body.women,
    },
  };
}

/** Nosiči a honáci zásilky (jako v dopravě `transportLimit`): 25 kg na nosiče, kláda dva nosiči. */
function carriers(bundle: MacroBundle): number {
  const t = VASSALAGE.transport;
  const kg = Math.ceil((bundle.grainKg + bundle.hayKg) / t.porterKg - EPSILON);
  const logs = bundle.logs * t.logCarriers;
  const heads = CATTLE_GOODS.reduce((n, g) => n + bundle.cattle[g], 0);
  const drovers =
    Math.ceil(heads / t.headsPerDrover - EPSILON) +
    Math.ceil(bundle.horses / t.horsesPerDrover - EPSILON);
  return Math.max(1, kg + logs + drovers);
}

/** Zboží zásilky v tvaru obchodu (scéna: co karavana nese a kolik dobytka žene). */
function sceneGoods(bundle: MacroBundle): TradeGoods {
  const out: TradeGoods = {};
  if (bundle.grainKg > 0) out.grain = bundle.grainKg;
  if (bundle.logs > 0) out.logs = bundle.logs;
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
    bundle.horses,
    bundle.people.families,
    bundle.people.men,
    bundle.people.women,
    ...CATTLE_GOODS.map((g) => bundle.cattle[g]),
  ];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Zásilka má záporné množství.';
  if (values.every((v) => v === 0)) return 'Zásilka je prázdná.';
  if (bundle.logs !== Math.floor(bundle.logs)) return 'Klády se vezou po celých kusech.';
  if (bundle.grainKg > state.storesKg + EPSILON) return 'Ves tolik obilí nemá.';
  if (bundle.hayKg > villageHayKg(state) + EPSILON) return 'Ves tolik sena nemá.';
  if (bundle.logs > woodLogs(state) + EPSILON) return 'Ves tolik klád nemá.';
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
 * Zásilka vyrazí (vassalage.md – Doprava a cílová ves; stav vstupu nemění): obilí, seno, klády,
 * dobytek a koně (kdo smí do prodeje – `horsesToSell`, hřebec a chovné klisny zůstanou) a lidé
 * (`emigrantGroups` – rodiny, muži, ženy; muži rodu ne) ze vsi zmizí. Výprava nosičů odejde ke
 * kraji mapy ve směru `firstStep` a vrátí se za `4 × cells` dní bez zboží (práce zdarma ze
 * společné práce vsi). `body` je to, co dojde do schránky cílové vsi v den `day + 2 × cells`
 * (`ShipmentBody`), `state` ves po odeslání. Robota (`laborDays`) se tu neposílá. Nedostatek →
 * `{ ok: false, reason }`; mez dopravy (`transportLimit`) hlídá volající (dialog, výhled).
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
  },
):
  | { ok: true; state: VillageState; body: ShipmentBody; arrivesDay: number }
  | { ok: false; reason: string } {
  const { bundle } = input;
  const reason = shortage(state, day, bundle);
  if (reason !== null) return { ok: false, reason };
  const next = cloneState(state);
  const trade = (next.trade ??= { neighbours: [], expeditions: [], nextId: 1 });
  const id = trade.nextId++;
  next.storesKg = Math.max(0, next.storesKg - bundle.grainKg);
  if (bundle.hayKg > 0 && next.hay) next.hay.kg = Math.max(0, next.hay.kg - bundle.hayKg);
  if (bundle.logs > 0) takeLogs(next, bundle.logs);
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
  const families = groups
    .filter((g) => g.kind === 'family')
    .map((g) => Math.max(0, g.people.length - 2));
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
    grainKg: bundle.grainKg,
    hayKg: bundle.hayKg,
    logs: bundle.logs,
    cattle: { ...bundle.cattle },
    horses,
    families,
    men: bundle.people.men,
    women: bundle.people.women,
  };
  return { ok: true, state: next, body, arrivesDay: day + arrive };
}

/**
 * Zásilka dorazila do vsi (mutuje stav – událost schránky): obilí a seno do zásob, klády na
 * hromadu, dobytek do stáda a ohrad (volně, kdo se nevejde – jako koupený), koně do ohrad koní
 * (bez ohrady je ves porazí), lidé jako noví vesničané s novými místními id (`settleNewcomers`).
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
  addLogs(state, body.logs);
  if (CATTLE_GOODS.some((g) => body.cattle[g] > 0)) ensureLivestock(state);
  for (const good of CATTLE_GOODS) addCattle(state, good, body.cattle[good], day);
  addHorses(state, body.horses, day);
  const events: ChronicleEvent[] = [];
  const people: { families: number[]; men: number; women: number } = {
    families: body.families,
    men: body.men,
    women: body.women,
  };
  if (people.families.length + people.men + people.women > 0) {
    settleNewcomers(state, day, body.direction, people, body.key);
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
