// Lidé na trhu (markets.md – Rozhodnutí plánu 3, bod 10; dřívější výměna lidí – trade.md, Martin
// 19. 10. 2026: „celé rodiny i jen dospělí“, „muži a ženy zvlášť“). Lidé jsou kusové zboží s cenou
// jako ostatní, ale cestují jako skuteční lidé – každý je vždy právě na jednom místě: ve vsi,
// v nákladu výpravy, na trhu, nebo ve výsledku na cestě domů. Kdo smí odejít, vybírá
// `emigrantGroups` (beze změny – ne dvorec, dědic, rozpad domácnosti, muži rodu a jejich ženy).
// Odchod zapíše `removePeople` (do `emigrants` se směrem), příchod do jiné vsi `rehomePeople`
// (nová místní id – `nextId` vsi vzroste o počet příchozích) a návrat domů vrátí původní id.
// Nikdo nevznikne ani nezmizí. Funkce, které mění stav, ho mutují jako kroky dne.
import { removePeople } from '../people/kinship';
import { ageGroup } from '../people/people';
import { ARRIVAL_HOME, rehomePeople } from '../people/transfer-people';
import { MARKET } from '../rules';
import type { StewardOutlook } from '../steward/steward-outlook';
import type {
  ChronicleEvent,
  Direction8,
  MarketPerson,
  MarketResult,
  NewcomerGroup,
  PeopleGood,
  TradeGoods,
  TradePeople,
  VillageState,
} from '../types';
import { PEOPLE_GROUP } from './goods';
import {
  NO_PEOPLE,
  emigrantGroups,
  newcomerHome,
  type EmigrantGroup,
  type Emigrants,
} from './people-trade';

const EPSILON = 1e-9;

/** Zboží lidí ke skupině výběru (`EmigrantGroup.kind`). */
const GROUP_GOOD: Readonly<Record<NewcomerGroup, PeopleGood>> = {
  family: 'families',
  man: 'men',
  woman: 'women',
};

/**
 * Lidé ve zboží `goods` po druzích – jen celé kladné počty (zboží špatného tvaru odmítne kontrola
 * výpravy, `checkMarketTrip`); ostatní zboží se nepočítá.
 */
export function peopleOf(goods: TradeGoods): TradePeople {
  const whole = (good: PeopleGood): number => {
    const n = goods[good] ?? 0;
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  return { families: whole('families'), men: whole('men'), women: whole('women') };
}

/**
 * Koho výprava se zbožím `give` odvede (stav nemění): `emigrantGroups` se všemi druhy najednou –
 * rodiny, pak muži, pak ženy, každá další skupina z vsi bez těch předchozích. Rodiny, muži a ženy
 * berou z týchž lidí, takže jen tak je vidět, kolik jich odejít může doopravdy; výběr je týž jako
 * postupné `takePeople` při odchodu (v pořadí `PEOPLE_GOODS`).
 */
export function leavingGroups(state: VillageState, day: number, give: TradeGoods): Emigrants {
  return emigrantGroups(state, day, peopleOf(give));
}

/** Mělká kopie vsi bez lidí skupin `groups` – jen pro výběr a kontroly (volní dospělí). */
export function withoutGroups(state: VillageState, groups: readonly EmigrantGroup[]): VillageState {
  if (groups.length === 0) return state;
  const ids = new Set(groups.flatMap((g) => g.people.map((p) => p.id)));
  return { ...state, people: state.people.filter((p) => !ids.has(p.id)) };
}

/**
 * Vybrané skupiny `groups` odejdou ze vsi (mutuje stav): `removePeople` – v rodokmenu zůstanou
 * jako odešlí ve směru `direction` (`emigrants`, dokud ve vsi žije jejich rodič, sourozenec nebo
 * dítě; neznámý směr – výprava uložená před směrem cesty – je nezapíše). Vrací kopie záznamů osob
 * s id vsi a vazbami, po skupinách jako zboží.
 */
export function sendPeople(
  state: VillageState,
  groups: readonly EmigrantGroup[],
  direction: Direction8 | undefined,
): MarketPerson[] {
  if (groups.length === 0) return [];
  const out = groups.map((g) => ({ good: GROUP_GOOD[g.kind], people: structuredClone(g.people) }));
  const ids = out.flatMap((g) => g.people.map((p) => p.id));
  const emigrated = new Map<number, Direction8>();
  if (direction !== undefined) for (const id of ids) emigrated.set(id, direction);
  removePeople(state, new Set(ids), emigrated);
  return out;
}

/**
 * Odejdou ze vsi (mutuje stav): `n` skupin druhu `good` podle `emigrantGroups` (méně, když tolik
 * lidí ves dát nemůže) – `removePeople` se směrem `direction` (`sendPeople`).
 */
export function takePeople(
  state: VillageState,
  day: number,
  good: PeopleGood,
  n: number,
  direction: Direction8,
): MarketPerson[] {
  const groups = emigrantGroups(state, day, { ...NO_PEOPLE, [good]: n })[good];
  return sendPeople(state, groups, direction);
}

/**
 * Dům pro skupinu (`newcomerHome`); ves bez obydlí i lidí – bez domu (`ARRIVAL_HOME`), nikdo
 * nezmizí.
 */
function homeFor(state: VillageState, good: PeopleGood): number {
  return newcomerHome(state, good === 'families') ?? ARRIVAL_HOME;
}

/**
 * Lidé přišli zvenku (mutuje stav): každá skupina dostane nová místní id (`rehomePeople` – vazby
 * uvnitř skupiny zůstanou, vazby ven se přeruší), dům podle `newcomerHome` (rodina do prázdného
 * obydlí, jinak do domu s nejvíc místy) a `origin` = směr vsi `from`. Vrací kroniku `newcomer`
 * s vsí, odkud přišli. Bez směru (výsledek bez záznamu výpravy – nemá nastat) se usadí bez
 * `origin` a kroniky.
 */
export function settlePeople(
  state: VillageState,
  day: number,
  groups: readonly MarketPerson[],
  from: { villageId: string; villageName: string; direction?: Direction8 },
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (const group of groups) {
    if (group.people.length === 0) continue;
    const home = homeFor(state, group.good);
    const { arrivals } = rehomePeople(state, group.people);
    for (const p of arrivals) {
      p.dwellingId = home;
      if (from.direction === undefined) delete p.origin;
      else p.origin = from.direction;
    }
    state.people.push(...arrivals);
    if (from.direction === undefined) continue;
    events.push({
      day,
      kind: 'newcomer',
      direction: from.direction,
      group: PEOPLE_GROUP[group.good],
      people: arrivals.length,
      dwellingId: home,
      villageName: from.villageName,
      villageId: from.villageId,
    });
  }
  return events;
}

/**
 * Vlastní lidé se vrátili domů (mutuje stav): s původními id a vazbami (záznamy, se kterými
 * odešli), dům podle `newcomerHome`; z `emigrants` a z rodokmenu zemřelých a odešlých
 * (`ancestors`) se odeberou – zase žijí ve vsi. `nextId` se nemění. Kdo už ve vsi je (týž id),
 * se nezdvojí.
 */
export function restorePeople(state: VillageState, groups: readonly MarketPerson[]): void {
  const here = new Set(state.people.map((p) => p.id));
  const back = new Set<number>();
  for (const group of groups) {
    const people = group.people.filter((p) => !here.has(p.id)).map((p) => structuredClone(p));
    if (people.length === 0) continue;
    const home = homeFor(state, group.good);
    for (const p of people) {
      p.dwellingId = home;
      here.add(p.id);
      back.add(p.id);
    }
    state.people.push(...people);
  }
  if (back.size === 0) return;
  if (state.emigrants) state.emigrants = state.emigrants.filter((e) => !back.has(e.id));
  if (state.ancestors) state.ancestors = state.ancestors.filter((a) => !back.has(a.id));
}

/**
 * Prodal skupinu hostitel (`peopleBack`)? Někdo z ní je v `emigrants` vsi (týž id a `bornDay`)
 * a žádné její id ve vsi nikdo nemá ani ho ves ještě nerozdala (`< nextId`). Skupina se vrací celá:
 * děti, které ve vsi příbuzné nemají, v `emigrants` nejsou (`removePeople`), ale odešly s rodinou
 * (návrh Clauda). Volná id chrání před shodou s cizí skupinou – `restorePeople` by obsazené id
 * přeskočil a člověk by zmizel.
 */
function soldHere(
  state: VillageState,
  emigrated: ReadonlySet<string>,
  used: ReadonlySet<number>,
  group: MarketPerson,
): boolean {
  return (
    group.people.some((p) => emigrated.has(`${p.id}:${p.bornDay}`)) &&
    group.people.every((p) => p.id < state.nextId && !used.has(p.id))
  );
}

/**
 * Lidé z výsledku pro zaniklou domovskou ves se vrátili k hostiteli (mutuje stav; markets.md –
 * Rozhodnutí plánu 3, bod 13 – událost schránky `people-back`): skupina, kterou hostitel prodal
 * (`soldHere` – její lidé jsou v jeho `emigrants`), se vrátí s původními id (`restorePeople`),
 * ostatní se usadí jako příchozí z domovské vsi výpravy (`settlePeople` s `from` – kronika
 * `newcomer`). Bez `from` (výsledek bez směru cesty – nemá nastat) se usadí bez směru a kroniky.
 * Nikdo nevznikne ani nezmizí; vstupní skupiny nemění.
 */
export function peopleBack(
  state: VillageState,
  day: number,
  back: { key: string; people: readonly MarketPerson[]; from: MarketResult['origin'] },
): ChronicleEvent[] {
  const emigrated = new Set((state.emigrants ?? []).map((e) => `${e.id}:${e.bornDay}`));
  const used = new Set(state.people.map((p) => p.id));
  const home: MarketPerson[] = [];
  const others: MarketPerson[] = [];
  for (const group of back.people) {
    if (!soldHere(state, emigrated, used, group)) {
      others.push(group);
      continue;
    }
    home.push(group);
    for (const p of group.people) used.add(p.id);
  }
  restorePeople(state, home);
  return settlePeople(state, day, others, back.from ?? { villageId: '', villageName: '' });
}

/**
 * Kolik lidí ves shání (markets.md – Rozhodnutí plánu 3, bod 10 – obráceně k `peopleSpare`): když
 * je půdy víc než práce (`landHa > laborHa` ve výhledu správce), chybí ceil(dospělí × (landHa ÷
 * laborHa − 1)) dospělých a ves je shání jako rodiny – `MARKET.familyAdults` dospělí na rodinu,
 * nahoru. Muže a ženy zvlášť neshání.
 */
export function peopleWanted(
  state: VillageState,
  day: number,
  outlook: StewardOutlook,
): TradePeople {
  const { landHa, laborHa } = outlook;
  if (!(laborHa > 0) || !(landHa > laborHa)) return { ...NO_PEOPLE };
  const adults = state.people.filter((p) => ageGroup(p, day) === 'adult').length;
  const missing = Math.ceil(adults * (landHa / laborHa - 1) - EPSILON);
  if (missing <= 0) return { ...NO_PEOPLE };
  return { ...NO_PEOPLE, families: Math.ceil(missing / MARKET.familyAdults - EPSILON) };
}
