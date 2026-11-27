import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departMarket,
  type ChronicleEvent,
  type Direction8,
  type Horse,
  type MarketOrder,
  type MarketPerson,
  type MarketTrip,
  type TradeGoods,
  type VillageEventBody,
  type VillageState,
} from '../../domain/village';
import { horse, horsePen } from '../../domain/village/__tests__/horse-fixtures';
import { DAY } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  SON,
  brideVillage,
  seekerVillage,
} from '../../domain/village/people/__tests__/kin-match-fixtures';
import {
  D,
  homeVillage,
  marketVillage,
} from '../../domain/village/trade/__tests__/market-fixtures';
import type { WorldStepDeps } from '../advance-world';
import { loadVillage } from '../load-village';
import type { LandscapeSource } from '../settlements';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWorldQueue } from './in-memory-world-queue';

// Dva hráči na sousedních mapách pro poštu mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6):
// domovská ves výpravy Vlkov (H, hráč `hrac-h`, políčko 0,0) a hostitel Lhota (M, hráč `hrac-m`,
// políčko 1,0) z přípravků trhu jádra (`market-fixtures.ts`). Ves je napřed jednou načtená
// (převody starého stavu běží ke dni načtení – worker.md, Výjimky), ať je dopočet po kouscích
// stejný jako vcelku.

export const H_PLAYER = 'hrac-h';
export const M_PLAYER = 'hrac-m';
export const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };

/** Hříbě (2 roky) ve vsi H s ohradou koní – na prodej (`horsesForSale`). */
export const FOAL_ID = 6;

/** Ohrada koní H: jezdecký kůň vojvody, dva koně a hříbě (horse-trade.test.ts). */
function withHorses(s: VillageState): VillageState {
  const herd: Horse[] = [
    { ...horse(1, 8, 'male', 80, D), riderId: 10 },
    horse(2, 5, 'male', 20, D),
    horse(3, 6, 'female', 0, D),
    horse(FOAL_ID, 2, 'male', 0, D),
  ];
  return { ...s, pens: [...(s.pens ?? []), { ...horsePen(90, herd, 2), builtDay: D - 400 }] };
}

export class MarketWorld {
  readonly settlements = new InMemorySettlements();
  readonly villages = new InMemoryVillages();
  constructor() {
    // Začít znovu (sídlo v archivu) – `archivedOf` vsí podle archivu sídel
    this.villages.archivedSettlements = this.settlements.archived;
  }
  readonly offsets = new InMemoryTimeOffsets();
  readonly locks = new InMemoryPlayerLock();
  readonly deps: WorldStepDeps = {
    settlements: this.settlements,
    villages: this.villages,
    landscapes,
    worldSeed: 4242,
    locks: this.locks,
    queue: new InMemoryWorldQueue(this.settlements, this.villages, this.offsets),
  };
  h = '';
  m = '';

  state(villageId: string): VillageState {
    return this.villages.records.get(villageId)!.state;
  }

  version(villageId: string): number {
    return this.villages.records.get(villageId)!.version;
  }

  load(villageId: string, today: number): Promise<unknown> {
    return loadVillage(this.deps, { villageId, today, landscape });
  }

  /**
   * Výprava z H (nebo z vsi `fromId`, od které je M ve směru `firstStep`) na trh M v den D uložená
   * jako po akci webu – odchozí schránka se nedoručí (pád webu po uložení).
   */
  async depart(
    order: MarketOrder,
    fromId: string = this.h,
    firstStep: Direction8 = 'E',
  ): Promise<MarketTrip> {
    const home = (await this.villages.find(fromId))!;
    const sent = departMarket(home.state, D, order, {
      villageId: this.m,
      name: 'Lhota',
      cells: 1,
      firstStep,
      homeVillageId: fromId,
      homeName: home.name,
    });
    if (!sent.ok) throw new Error(sent.reason);
    if (!(await this.villages.save(fromId, sent.state, home.version))) {
      throw new Error(`Ves ${home.name} se neuložila.`);
    }
    return sent.trip;
  }
}

/** Sídelní mapa hráče `ownerId` na políčku (x, 0). */
const seat = (ownerId: string, x: number): Parameters<InMemorySettlements['createSeat']>[0] => ({
  ownerId,
  landscapeSeed: 11 + x,
  layerVersions: CURRENT_LAYER_VERSIONS,
  worldCell: { x, y: 0 },
});

/** Sídelní mapy obou hráčů: H na políčku (0, 0), M na (1, 0) – M je na východě. */
async function seats(world: MarketWorld): Promise<{ h: string; m: string }> {
  const h = (await world.settlements.createSeat(seat(H_PLAYER, 0)))!;
  const m = (await world.settlements.createSeat(seat(M_PLAYER, 1)))!;
  return { h: h.id, m: m.id };
}

/**
 * Třetí ves světa, Hradec (X, hráč `hrac-x`, políčko 2,0 – M je na západ od ní), se stavem `state`
 * dopočítaným do D. Vrací id.
 */
export async function thirdVillage(world: MarketWorld, state: VillageState): Promise<string> {
  const map = (await world.settlements.createSeat(seat('hrac-x', 2)))!;
  const { id } = await world.villages.add(map.id, 'Hradec', state);
  await world.load(id, D);
  return id;
}

/**
 * Svět H a M; `horses` – H má ohradu koní s hříbětem na prodej; `home` / `host` – jiný stav H / M
 * (M se načte ke dni D − 1, nemá-li `lastDay` větší).
 */
export async function marketWorld(
  options: { horses?: true; home?: VillageState; host?: VillageState } = {},
): Promise<MarketWorld> {
  const world = new MarketWorld();
  const { h, m } = await seats(world);
  const home = options.home ?? (options.horses ? withHorses(homeVillage()) : homeVillage());
  world.h = (await world.villages.add(h, 'Vlkov', home)).id;
  world.m = (await world.villages.add(m, 'Lhota', options.host ?? marketVillage())).id;
  await world.load(world.h, D);
  await world.load(world.m, D - 1);
  return world;
}

/**
 * Okolí obou vsí (markets.md – Rozhodnutí plánu 3, bod 1) se skutečnými id: H zná M na východě, M zná
 * H na západě; snímek ze dne `day`. Svobodné do okolí nedává – dotaz `kin-ask` píše test sám.
 */
export function neighbours(world: MarketWorld, day: number): void {
  const self = (id: string): { villageId: string; name: string } => ({
    villageId: id,
    name: world.villages.records.get(id)!.name,
  });
  world.villages.edit(world.h, (s) => {
    s.nearby = {
      day,
      self: self(world.h),
      villages: [{ ...self(world.m), cells: 1, firstStep: 'E' }],
    };
  });
  world.villages.edit(world.m, (s) => {
    s.nearby = {
      day,
      self: self(world.m),
      villages: [{ ...self(world.h), cells: 1, firstStep: 'W' }],
    };
  });
}

/**
 * Svět pro sňatky se sousedy (markets.md – Rozhodnutí plánu 3, bod 11) z přípravků `kin-match`:
 * H (Vlkov) – syn `SON` 25 let bez nevěsty, M (Lhota) – dcera `DAUGHTER` 20 let, která se vdá pryč;
 * okolí obou vsí (`neighbours`), obě dopočítané do DAY. `nearby` – i okolí v pevné dny
 * (`villages.withNearby`, jako úložiště v DB).
 */
export async function kinWorld(options: { nearby?: true } = {}): Promise<MarketWorld> {
  const world = new MarketWorld();
  if (options.nearby) world.villages.withNearby(world.settlements);
  const { h, m } = await seats(world);
  world.h = (await world.villages.add(h, 'Vlkov', seekerVillage([]))).id;
  world.m = (await world.villages.add(m, 'Lhota', brideVillage())).id;
  neighbours(world, DAY - 5);
  await world.load(world.h, DAY);
  await world.load(world.m, DAY);
  return world;
}

/** Dotaz H na nevěstu pro syna `SON` (`kin-ask`) – zapsaný do schránky M na den `day`. */
export async function askBride(world: MarketWorld, day: number): Promise<void> {
  const son = world.state(world.h).people.find((p) => p.id === SON)!;
  const key = `kin:${world.h}:${day - 1}:${SON}`;
  await world.villages.inbox.post({
    villageId: world.m,
    day,
    ref: `${key}:ask`,
    body: {
      kind: 'kin-ask',
      ask: {
        key,
        fromVillageId: world.h,
        fromName: 'Vlkov',
        cells: 1,
        firstStep: 'E',
        seeker: { personId: SON, sex: 'male', bornDay: son.bornDay, widowed: false },
        report: { day: day - 1, people: 3, houses: 1, crafts: [], traders: [] },
      },
    },
  });
}

/** Lidé ve skupinách nákladu. */
function headcount(groups: readonly MarketPerson[] | undefined): number {
  return (groups ?? []).reduce((n, g) => n + g.people.length, 0);
}

/** Náklad lidí jedné zprávy (příjezd, výsledek, lidé zpět); klíč – zpráva je jen na jednom místě. */
function cargoOf(body: VillageEventBody): { key: string; people: number } | null {
  switch (body.kind) {
    case 'market-arrive':
      return { key: `in:${body.arrival.key}`, people: headcount(body.arrival.people) };
    case 'market-result': {
      const { key, people, newcomers } = body.result;
      return { key: `out:${key}`, people: headcount(people) + headcount(newcomers) };
    }
    case 'stranded-people':
      return { key: `back:${body.key}`, people: headcount(body.people) + headcount(body.own) };
    default:
      return null;
  }
}

/**
 * Lidé světa H a M (markets.md – Rozhodnutí plánu 3, bod 13 – nikdo nevznikne ani nezmizí): ve
 * vsích, v nákladu odchozích schránek, na trhu (`market.visitors` – neprodaní i koupení) a ve
 * schránkách ve dnech po `lastDay` (příjezdy, výsledky, lidé zpět). Zpráva, která je zároveň
 * v odchozí schránce a ve schránce cíle (doručená, ještě nesmazaná), se počítá jednou.
 */
export async function peopleOfWorld(world: MarketWorld): Promise<number> {
  let n = 0;
  const cargo = new Map<string, number>();
  const add = (body: VillageEventBody): void => {
    const c = cargoOf(body);
    if (c) cargo.set(c.key, c.people);
  };
  for (const id of [world.h, world.m]) {
    const record = world.villages.records.get(id);
    if (!record) continue;
    const s = record.state;
    n += s.people.length;
    for (const mail of s.outbox ?? []) add(mail.body);
    for (const v of s.market?.visitors ?? []) n += headcount(v.people) + headcount(v.boughtPeople);
    for (const event of await world.villages.inbox.pending(id, s.lastDay, TOTAL_GAME_DAYS)) {
      add(event.body);
    }
  }
  for (const people of cargo.values()) n += people;
  return n;
}

/** Kov, který mezi vsemi obíhá jako peníze: mince (kusy) a zlato (g; gold.md – Pravidla 2). */
type Metal = 'coins' | 'gold';

/**
 * Kov v nákladu výpravy nebo kupce (`goods` – na trhu, v příjezdu, ve výsledku `unsold`) a v tom,
 * co na trhu koupil (`bought`): mince jsou jen v měšci (do `bought` se nepíšou – `payCoins`),
 * zlato i koupené.
 */
function metalOf(metal: Metal, goods: TradeGoods, bought?: TradeGoods): number {
  return (goods[metal] ?? 0) + (metal === 'gold' ? (bought?.gold ?? 0) : 0);
}

/**
 * Kov zprávy výpravy a stupeň její cesty: příjezd 0, výsledek 3, kov zpět hostiteli 5 (na trhu
 * hostitele stojí výprava se stupněm 2); použitá zpráva je o stupeň dál a kov už nenese.
 */
function metalCargoOf(
  metal: Metal,
  body: VillageEventBody,
): { key: string; stage: number; amount: number } | null {
  switch (body.kind) {
    case 'market-arrive':
      return { key: body.arrival.key, stage: 0, amount: metalOf(metal, body.arrival.goods) };
    case 'market-result': {
      const { key, unsold, bought } = body.result;
      return { key, stage: 3, amount: metalOf(metal, unsold, bought) };
    }
    case 'stranded-people':
      return { key: body.key, stage: 5, amount: body[metal] ?? 0 };
    default:
      return null;
  }
}

/**
 * Kov světa `metal` – součet pro `coinsOfWorld` a `goldOfWorld`: v zásobách všech vsí (i vsí na
 * cestě), u osadníků ve schránkách odchodů správce, v nákladu výprav (odchozí schránky, trhy
 * hostitelů, nepoužité události schránek) a u cizích kupců na trzích všech vsí mimo archiv – ze
 * vsi, která zanikla, musí kupec odjet (`endVillage`), archivovanou ves (Začít znovu) nikdo
 * nedopočítá a kupec v ní zůstane jen jako záznam. Každá výprava se počítá jednou tam, kam její kov
 * došel nejdál: zpráva v odchozí schránce i ve schránce cíle (doručená, ještě nesmazaná) ani záznam
 * na trhu zaniklého hostitele, odkud už výprava vrátila výsledek, součet nezdvojí.
 * `trade.expeditions[].give` není místo kovu – je to jen záznam výpravy, který ve stavu zůstává až
 * do výsledku (výprava bez něj je vyřízená).
 */
async function metalOfWorld(world: Pick<MarketWorld, 'villages'>, metal: Metal): Promise<number> {
  const { records, inbox } = world.villages;
  const archived = new Set(await world.villages.archivedOf([...records.keys()]));
  let n = 0;
  const trips = new Map<string, { stage: number; amount: number }>();
  const put = (key: string, stage: number, amount: number): void => {
    if ((trips.get(key)?.stage ?? -1) < stage) trips.set(key, { stage, amount });
  };
  const add = (body: VillageEventBody, used: boolean): void => {
    const cargo = metalCargoOf(metal, body);
    if (cargo) put(cargo.key, cargo.stage + Number(used), used ? 0 : cargo.amount);
  };
  for (const [id, { state }] of records) {
    n += state[metal] ?? 0;
    for (const departure of state.steward?.departures ?? []) {
      if (departure.villageId === undefined) n += departure.settlers?.whole?.stocks[metal] ?? 0;
    }
    for (const mail of state.outbox ?? []) add(mail.body, false);
    for (const visitor of state.market?.visitors ?? []) {
      const amount = metalOf(metal, visitor.goods, visitor.bought);
      if (!visitor.merchant) put(visitor.key, 2, amount);
      else if (!archived.has(id)) n += amount;
    }
  }
  for (const event of inbox.events) {
    const state = records.get(event.villageId)?.state;
    // vymřelá ves použila události jen do dne vymření – dny po něm nesimuluje
    if (state) add(event.body, event.day <= (state.extinctDay ?? state.lastDay));
  }
  for (const [key, { stage, amount }] of trips) {
    // výpravu, kterou domov už nečeká, vyřídil výsledek – starší záznamy o ní kov nenesou
    const home = records.get(key.split(':')[1]!)?.state;
    const awaited = !home || home.trade?.expeditions.some((e) => e.market?.key === key);
    if (stage >= 5 || awaited) n += amount;
  }
  return n;
}

/**
 * Mince světa (markets.md – Rozhodnutí plánu 4, bod 9 – nikde nevzniknou ani nezmizí; `metalOfWorld`):
 * ve vsích, u osadníků, v nákladu výprav a v měšcích cizích kupců.
 */
export function coinsOfWorld(world: Pick<MarketWorld, 'villages'>): Promise<number> {
  return metalOfWorld(world, 'coins');
}

/**
 * Zlato světa v gramech (gold.md – Pravidla 2; Rozhodnutí plánu 6, body 3 a 9; `metalOfWorld`): ve
 * vsích, u osadníků, v nákladu výprav (neprodané i koupené), ve výsledcích na cestě, ve zlatě zpět
 * hostiteli a u cizích kupců – koupené nebo za zbroj – do jejich odjezdu. Vzniká jen rýžováním,
 * zaniká ražbou a odjezdem kupců.
 */
export function goldOfWorld(world: Pick<MarketWorld, 'villages'>): Promise<number> {
  return metalOfWorld(world, 'gold');
}

/** Porody minus úmrtí v kronikách H a M po dni `after`. */
export function bornMinusDied(world: MarketWorld, after: number): number {
  let n = 0;
  for (const id of [world.h, world.m]) {
    for (const e of world.villages.records.get(id)?.state.chronicle ?? []) {
      if (e.day <= after) continue;
      if (e.kind === 'birth') n++;
      if (e.kind === 'death') n--;
    }
  }
  return n;
}

type MarketReturned = Extract<ChronicleEvent, { kind: 'market-returned' }>;

/** Zápisy kroniky `market-returned` vsi. */
export function returnedOf(state: VillageState): MarketReturned[] {
  return state.chronicle.filter((e): e is MarketReturned => e.kind === 'market-returned');
}

/** Krávy vsi. */
export function cowsOf(state: VillageState): number {
  return state.livestock?.herds.cow ?? 0;
}
