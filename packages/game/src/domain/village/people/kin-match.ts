// Sňatky se skutečnými sousedy a další manželky (markets.md – Rozhodnutí plánu 3, body 11 a 12;
// Martin 22. 11. 2026: „se sousedy je na náhodě, ze které dostupně vsi ženich nebo nevěsta bude“;
// 23. 11. 2026: „Jen se vdá pryč“). Kdo ve vsi nemá s kým, zeptá se náhodné vsi okolí, která má
// podle snímku okolí vhodného svobodného (`askKinDay` – zpráva `kin-ask` bez nákladu); ves partnera
// vybere partnera bez losu a pošle ho výpravou `kin` (`answerKinAsk`); po příjezdu je svatba, nebo
// partner zůstane jako svobodný nováček (`receiveKin` z `joinMarket`). Partner jde vždy za
// hledajícím – nevěsta k muži, ženich k vdově či dědičce, další manželka do domu muže rodu. Nikdo
// nevznikne ani nezmizí: partner odejde ze vsi (`removePeople` – `emigrants`), cestuje v nákladu
// výpravy a usadí se s novým id (`settlePeople`). Ves bez okolí nic – sňatky jen ve vsi. Rozhoduje
// se jen ze stavu vsi a událostí schránky dne, náhoda z vlastního proudu `'kin:' + den` – výsledek
// nezávisí na kouscích dopočtu a jiné proudy se neposunou. Kroky mutují stav jako kroky dne.
import { createRandom, deriveSeed } from '../../landscape/random';
import { isDynastyTracked, isLineMan, keptByLine } from './dynasty';
import { extraWifeHome, wifeCounts, wivesWho } from './dynasty-wives';
import { rodBaptized } from './faith';
import {
  bestMatch,
  crowded,
  dependants,
  favouredBride,
  isSingle,
  maxAgeGap,
  parentIds,
  perDay,
  singles,
  startMarriage,
  weddingChancePerDay,
} from './marriage';
import { ageYears, craftsmanOf, householdBreaksUp, isAway, occupants } from './people';
import { OPPOSITE } from './world-grid';
import { LORD, MARKET, MARRIAGE } from '../rules';
import { rememberNews } from '../trade/market';
import { sendPeople, settlePeople } from '../trade/market-people';
import { departMarketInPlace, marketTravelDays, planMarketTrip } from '../trade/market-trip';
import { villageReport } from '../trade/village-report';
import type {
  ChronicleEvent,
  KinAsk,
  KinSeeker,
  MarketOrder,
  MarketTarget,
  MarketVisitor,
  NearbySingle,
  NearbyVillage,
  Person,
  VillageState,
} from '../types';

const DAYS_PER_YEAR = 365.25;

/**
 * Pásmo věku ve snímku okolí (Rozhodnutí plánu 3, bod 1 – svobodní „po pohlaví a 5 letech věku“):
 * veřejná zpráva jako na pivu, ne přesný věk.
 */
const SINGLES_AGE_BAND = 5;

/**
 * Kdo z vsi by šel za partnerem odjinud (Rozhodnutí plánu 3, bod 11 – Kdo přijde), v pořadí id:
 * svobodný (`isSingle`) doma (ne pryč – `isAway`; kdo je pryč, z vsi neodejde), muž od
 * `MARRIAGE.neighbours.fromAge`, ne muž rodu ani jeho žena (`keptByLine`), ne řemeslník – nejstarší
 * muž dílny (`craftsmanOf`; vezme si jen nevěstu, která přijde k němu – kinship.md, Řemeslník
 * zůstává v dílně), žena ne vdova, dědička ani žena z domu bez mužů (`favouredBride` – ty se pryč
 * nevdávají), bez vlastních dětí do 16 let (`dependants` – partner jde vždy sám), jen když se
 * domácnost jeho odchodem nerozpadne (`householdBreaksUp` zbytku) a bez protějšku ve vsi
 * (`bestMatch` – ves nebere svým).
 */
export function kinCandidates(state: VillageState, day: number): Person[] {
  const list = singles(state, day);
  if (list.length === 0) return [];
  const parents = parentIds(state);
  const kept = keptByLine(state);
  return list
    .filter(
      (p) =>
        !isAway(p, day) &&
        (p.sex === 'female' || ageYears(p.bornDay, day) >= MARRIAGE.neighbours.fromAge) &&
        !kept(p) &&
        craftsmanOf(state, p.dwellingId, day)?.id !== p.id &&
        !(p.sex === 'female' && favouredBride(state, p, day, parents)) &&
        dependants(state, p, day).length === 0 &&
        !householdBreaksUp(
          occupants(state, p.dwellingId).filter((m) => m.id !== p.id),
          day,
        ) &&
        bestMatch(state, day, p, list, parents) === undefined,
    )
    .sort((a, b) => a.id - b.id);
}

/**
 * Souhrn `kinCandidates` pro okolí (souhrn vsi `VillageDigest.singles` → `NearbyVillage.singles`):
 * pohlaví a věk po 5 letech každého z nich, v pořadí id.
 */
export function kinSingles(state: VillageState, day: number): NearbySingle[] {
  return kinCandidates(state, day).flatMap((p) =>
    p.sex
      ? [
          {
            sex: p.sex,
            ageFrom: SINGLES_AGE_BAND * Math.floor(ageYears(p.bornDay, day) / SINGLES_AGE_BAND),
          },
        ]
      : [],
  );
}

/**
 * Má ves okolí podle snímku (`singles`) protějšek pro hledajícího? Opačné pohlaví a pásmo věku
 * [ageFrom, ageFrom + 4] se překrývá s věkem hledajícího ± `maxAgeGap`; u další manželky žena
 * s pásmem v `MARRIAGE.neighbours.brideAge` (16–22).
 */
function suits(village: NearbyVillage, seeker: KinSeeker, day: number): boolean {
  const want = seeker.sex === 'male' ? 'female' : 'male';
  const age = ageYears(seeker.bornDay, day);
  const gap = maxAgeGap(seeker.widowed);
  const { from, to } = MARRIAGE.neighbours.brideAge;
  return (village.singles ?? []).some((single) => {
    if (single.sex !== want) return false;
    const last = single.ageFrom + SINGLES_AGE_BAND - 1;
    if (seeker.extraWife) return single.ageFrom <= to && last >= from;
    return single.ageFrom <= age + gap && last >= age - gap;
  });
}

/**
 * Ves hledajícího (mutuje – krok dne hned za `arrangeMarriages`; Rozhodnutí plánu 3, body 11 a 12):
 * jen ves s okolím a ne v hladu (`state.hungry`). Kdo se dnes vzal ve vsi, už není svobodný,
 * a snoubenci čekající na zásoby mají protějšek (`bestMatch`) – neptají se. V pořadí id má každý
 * svobodný od `MARRIAGE.neighbours.fromAge` a každý muž rodu s manželkou tři losy z proudu
 * `'kin:' + den` vždy (šance, čekání na zásoby, cílová ves) – losy ostatních se tak nemění. Ptá se:
 * - muž bez nevěsty ve vsi, ne z přeplněného domu (`crowded`) – s denní šancí z `bridePerYear`,
 * - žena, ke které se ženich přižení (`favouredBride` – vdova, dědička, dům bez mužů), bez ženicha
 *   ve vsi a ne z přeplněného domu – z `favouredGroomPerYear`; jiná svobodná žena se neptá nikdy,
 *   vdá se pryč jen na dotaz muže odjinud (Martin 23. 11. 2026),
 * - muž rodu s 1–3 žijícími manželkami (`wifeCounts`, méně než `LORD.maxWives`) ve vsi se
 *   sledovaným rodem (`isDynastyTracked`), ne pokřtěném (`rodBaptized` – christianity.md, Jediná
 *   manželka), s domem (`extraWifeHome`; přeplnění nevadí – lord.md) – z `extraWifePerYear`.
 * Pod pojistkou zásob (`storesFill()` < 1) navíc druhý los pod `weddingChancePerDay` (čekání jako
 * svatba ve vsi); `storesFill` se volá, jen když je dotaz na řadě. Cílová ves je los
 * `floor(los × počet)` jen mezi vsemi okolí, které mají vhodný protějšek (`suits`); žádná – dnes se
 * neptá. Do odchozí schránky jde `kin-ask` (klíč `kin:<ves>:<den>:<id>`, `ref` `…:ask`) na den
 * dotazu = dnes + 1 + dny cesty. Hledající odpověď neeviduje – bez odpovědi se může zeptat znovu.
 */
export function askKinDay(state: VillageState, day: number, storesFill: () => number): void {
  const nearby = state.nearby;
  if (!nearby || nearby.villages.length === 0 || state.hungry) return;
  const { fromAge, bridePerYear, favouredGroomPerYear, extraWifePerYear } = MARRIAGE.neighbours;
  const wives = isDynastyTracked(state) && !rodBaptized(state) ? wifeCounts(state) : null;
  let random: ReturnType<typeof createRandom> | undefined;
  let parents: ReadonlySet<number> | undefined;
  let list: Person[] | undefined;
  for (const p of [...state.people].sort((a, b) => a.id - b.id)) {
    if (p.sex === undefined || ageYears(p.bornDay, day) < fromAge) continue;
    const single = isSingle(state, p, day);
    const count = wives && !single && isLineMan(p) ? (wives.get(p.id) ?? 0) : 0;
    const extraWife = count >= 1 && count < LORD.maxWives;
    if (!single && !extraWife) continue;
    random ??= createRandom(deriveSeed(state.seed, 'kin:' + day));
    // tři losy na hledajícího vždy – hlad, místo ani zásoby nemění losy ostatních
    const roll = random.next();
    const wait = random.next();
    const pick = random.next();
    const perYear = extraWife
      ? extraWifePerYear
      : p.sex === 'male'
        ? bridePerYear
        : favouredGroomPerYear;
    if (roll >= perDay(perYear)) continue;
    if (extraWife) {
      if (extraWifeHome(state, p) === undefined) continue;
    } else {
      parents ??= parentIds(state);
      list ??= singles(state, day);
      if (p.sex === 'female' && !favouredBride(state, p, day, parents)) continue;
      if (crowded(state, p) || bestMatch(state, day, p, list, parents) !== undefined) continue;
    }
    const fill = storesFill();
    if (fill < 1 && wait >= weddingChancePerDay(fill)) continue;
    const seeker: KinSeeker = {
      personId: p.id,
      sex: p.sex,
      bornDay: p.bornDay,
      widowed: !extraWife && (parents ?? parentIds(state)).has(p.id),
      ...(extraWife ? { extraWife: true as const } : {}),
    };
    const targets = nearby.villages.filter((v) => suits(v, seeker, day));
    const target = targets[Math.min(targets.length - 1, Math.floor(pick * targets.length))];
    if (!target) continue;
    const key = `kin:${nearby.self.villageId}:${day}:${p.id}`;
    const ask: KinAsk = {
      key,
      fromVillageId: nearby.self.villageId,
      fromName: nearby.self.name,
      cells: target.cells,
      firstStep: target.firstStep,
      seeker,
      report: villageReport(state, day),
    };
    (state.outbox ??= []).push({
      villageId: target.villageId,
      day: day + 1 + marketTravelDays(target.cells),
      ref: `${key}:ask`,
      body: { kind: 'kin-ask', ask },
    });
  }
}

/**
 * Partner pro hledajícího z `kinCandidates` (Rozhodnutí plánu 3, bod 11 – bez losu): opačné
 * pohlaví, věkový rozdíl nejvýš `maxAgeGap` (s vdovou či vdovcem větší), u další manželky žena
 * `MARRIAGE.neighbours.brideAge` (16–22 let), ženich ne muž rodu. Nejbližší věkem, při shodě nižší
 * id; nikdo – undefined.
 */
function kinPartner(state: VillageState, day: number, seeker: KinSeeker): Person | undefined {
  const parents = parentIds(state);
  const { from, to } = MARRIAGE.neighbours.brideAge;
  let best: Person | undefined;
  let bestGap = Infinity;
  for (const p of kinCandidates(state, day)) {
    if (p.sex === seeker.sex) continue;
    if (p.sex === 'male' && isLineMan(p)) continue;
    const gap = Math.abs(p.bornDay - seeker.bornDay) / DAYS_PER_YEAR;
    if (seeker.extraWife) {
      const age = ageYears(p.bornDay, day);
      if (p.sex !== 'female' || age < from || age > to) continue;
    } else if (gap > maxAgeGap(seeker.widowed || parents.has(p.id))) continue;
    // kandidáti jsou v pořadí id – při shodě zůstane nižší
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Ves partnera dostala dotaz `kin-ask` (mutuje – událost schránky ráno, před vlastními sňatky;
 * Rozhodnutí plánu 3, bod 11). Ves bez okolí (nezná své id) nic. Posel „zašel na pivo“ – zpráva
 * o vsi, která se ptá, do `news`. Partner (`kinPartner`) jde výpravou `kin` k hledajícímu – pořadí
 * tak, aby nikdo nezmizel při odmítnuté výpravě: 1. výběr partnera, 2. kontrola výpravy nad vsí
 * bez něj (`planMarketTrip` – nosičem není on; odmítnutí → nikdo neodejde, nic se nezmění),
 * 3. partner odejde ze vsi (`sendPeople` – `removePeople` se směrem k hledajícímu do `emigrants`),
 * 4. výprava (`departMarketInPlace` – `by: 'kin'`, `kin`, partner v `people`, `give` / `wants`
 * prázdné, pobyt `MARKET.minStayDays`, první krok opačně než dotaz) – kontrola dá týž výsledek jako
 * krok 2, jinak je to chyba programu. Kroniku `market-departed` zapíše výprava sama, vrací
 * `married-away` (u muže `groom`) s vsí hledajícího.
 */
export function answerKinAsk(state: VillageState, day: number, ask: KinAsk): ChronicleEvent[] {
  const self = state.nearby?.self;
  if (!self) return [];
  rememberNews(state, { villageId: ask.fromVillageId, name: ask.fromName, report: ask.report });
  const partner = kinPartner(state, day, ask.seeker);
  if (!partner) return [];
  const order: MarketOrder = { give: {}, wants: {}, stayDays: MARKET.minStayDays };
  const target: MarketTarget = {
    villageId: ask.fromVillageId,
    name: ask.fromName,
    cells: ask.cells,
    firstStep: OPPOSITE[ask.firstStep],
    homeVillageId: self.villageId,
    homeName: self.name,
  };
  const without = { ...state, people: state.people.filter((p) => p.id !== partner.id) };
  if (!planMarketTrip(without, day, order, target).ok) return [];
  const from = partner.dwellingId;
  const male = partner.sex === 'male';
  const people = sendPeople(
    state,
    [{ kind: male ? 'man' : 'woman', dwellingId: from, people: [partner] }],
    target.firstStep,
  );
  const sent = departMarketInPlace(state, day, order, target, {
    by: 'kin',
    kin: {
      seekerId: ask.seeker.personId,
      ...(ask.seeker.extraWife ? { extraWife: true as const } : {}),
    },
    people,
  });
  if (!sent.ok) {
    throw new Error(`Výprava za partnerem neprošla po odchodu partnera: ${sent.reason}`);
  }
  return [
    {
      day,
      kind: 'married-away',
      dwellingId: from,
      ...(male ? { groom: true as const } : {}),
      villageName: ask.fromName,
      villageId: ask.fromVillageId,
    },
  ];
}

/**
 * Svatba s partnerem, který přišel (mutuje), nebo null – pak zůstane svobodným nováčkem. Další
 * manželka (muž má 1–3 žijící, `LORD.maxWives`; rod se mezitím nepokřtil – `rodBaptized`,
 * christianity.md – Jediná manželka): do domu muže (`extraWifeHome`), ukazuje na něj, on dál na
 * hlavní (lord.md – asymetrie); muž bez žijící manželky se žení jako s nevěstou. Jinak
 * hledající musí být svobodný (`isSingle`) a mít dům: partner k němu (nevěsta k muži, ženich
 * k ženě), manželé navzájem, nevěsta `startMarriage`.
 */
function kinWedding(
  state: VillageState,
  day: number,
  seeker: Person,
  partner: Person,
  extraWife: boolean,
  from: { villageName: string; villageId: string },
): ChronicleEvent | null {
  if (seeker.sex === partner.sex) return null;
  const count = extraWife ? (wifeCounts(state).get(seeker.id) ?? 0) : 0;
  if (count >= LORD.maxWives) return null;
  if (count >= 1) {
    const home = extraWifeHome(state, seeker);
    if (home === undefined || partner.sex !== 'female' || rodBaptized(state)) return null;
    partner.dwellingId = home;
    partner.spouseId = seeker.id;
    startMarriage(partner, day);
    return { day, kind: 'extra-wife', ...wivesWho(state, seeker, partner, day), ...from };
  }
  if (!isSingle(state, seeker, day)) return null;
  const home = seeker.dwellingId;
  if (!state.dwellings.some((d) => d.id === home)) return null;
  const widow = parentIds(state).has(seeker.id);
  partner.dwellingId = home;
  seeker.spouseId = partner.id;
  partner.spouseId = seeker.id;
  if (seeker.sex === 'male') {
    startMarriage(partner, day);
    return {
      day,
      kind: 'bride-from-outside',
      dwellingId: home,
      groomId: seeker.id,
      brideId: partner.id,
      // jméno muže rodu (lord.md – Kde se jméno ukazuje), ostatní ho v zápisu nemají
      ...(seeker.line !== true || seeker.name === undefined ? {} : { name: seeker.name }),
      ...from,
    };
  }
  startMarriage(seeker, day);
  return {
    day,
    kind: 'groom-from-outside',
    dwellingId: home,
    ...(widow ? { widow: true as const } : {}),
    groomId: partner.id,
    brideId: seeker.id,
    ...from,
  };
}

/**
 * Partner přišel do vsi hledajícího (mutuje – z `joinMarket` hned po příjezdu; Rozhodnutí plánu 3,
 * bod 11): jen návštěvník s `kin`. Partner se usadí s novým id a původem (`settlePeople`); žije-li
 * hledající a je pořád svobodný (u další manželky má méně než `LORD.maxWives` žijících), je svatba
 * (`kinWedding` – kronika `bride-from-outside`, `groom-from-outside` nebo `extra-wife` s vsí
 * partnera), jinak partner zůstane jako svobodný nováček (`newcomerHome`, kronika `newcomer`). Nikdo
 * se nevrací – `visitor.people` se vyprázdní a doprovod odjede s prázdným výsledkem.
 */
export function receiveKin(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[] {
  const kin = visitor.kin;
  const groups = visitor.people ?? [];
  if (!kin || groups.length === 0) return [];
  delete visitor.people;
  const firstId = state.nextId;
  const settled = settlePeople(state, day, groups, {
    villageId: visitor.fromVillageId,
    villageName: visitor.fromName,
    ...(visitor.firstStep ? { direction: OPPOSITE[visitor.firstStep] } : {}),
  });
  // jediný partner dostal první nové id (`rehomePeople` – v pořadí starých id)
  const partner = state.people.find((p) => p.id === firstId);
  const seeker = state.people.find((p) => p.id === kin.seekerId);
  if (!partner || !seeker || groups.length !== 1 || groups[0]!.people.length !== 1) {
    return settled;
  }
  const wedding = kinWedding(state, day, seeker, partner, kin.extraWife === true, {
    villageName: visitor.fromName,
    villageId: visitor.fromVillageId,
  });
  return wedding ? [wedding] : settled;
}
