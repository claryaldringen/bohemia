// Lov vsi (hunting.md – Pravidla 1–3, 5–7, 11): kalendářní lov rodu a lov navíc jsou pryč. Lov se
// vyhlásí tlačítkem dvorce, kdykoli to dovolí důvody `huntDenied` – bez meze „jednou za 3 dny“.
// Ves zaplatí práci honců zítra, dnešek je spočtený od rána (`reserveBeaters` → `allocateDay`).
// Zvíře losuje `pickQuarry` podle počtů zvěře; výsledek lovu (úlovek, výcvik, rány, koně) zapíše
// `applyHuntResult` – událost schránky `hunt-result`, nebo lov správce v kroku dne. Úlovek roku
// (`hunt.year`) čte panel dvorce; plní ho i úlovek z jezdecké hlídky (`field-patrol.ts`).
import { dateOfDayIndex } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import { bury } from '../buildings/cemetery';
import { loseHorse } from '../livestock/horse-riders';
import { butcher } from '../livestock/livestock';
import { deathWho } from '../people/estate';
import { removePeople } from '../people/kinship';
import { NO_ARMS, trainArms, trainingCap } from '../people/lord';
import { ageGroup, ageYears } from '../people/people';
import { LABOR_PER_DAY } from '../rules/rules-people';
import { HUNT, PREDATOR_RISK } from '../rules/rules-wildlife';
import type {
  ChronicleEvent,
  HuntKills,
  HuntResult,
  HuntState,
  QuarryKind,
  VillageState,
  WildlifeState,
} from '../types';
import { addHides, addSmallHides } from '../wares/wares';
import { bearBackDay } from './wildlife';

const EPSILON = 1e-9;

/** Lov vsi, která ještě nelovila: prázdný úlovek roku, bez honců. */
export function emptyHunt(): HuntState {
  return { year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 } };
}

/**
 * Proč nejde lov vyhlásit (hunting.md – Pravidla 2): hájení (březen–květen), ves neuvolní honce,
 * lov vsi už běží, v lese vsi není velká zvěř (Martin 22. 11. 2026: „Ano“).
 */
export type HuntDenied = 'closed-season' | 'no-beaters' | 'already' | 'no-game';

/** Důvody odepření lovu (`huntDenied`) česky pro hráče – červeně u zašedlého tlačítka. */
export const HUNT_DENIED_TEXT: Record<HuntDenied, string> = {
  'closed-season': 'Zvěř má hájení – od března do května se neloví.',
  'no-beaters': `Ves zítra neuvolní ${HUNT.beaters.men} mužů na honce.`,
  already: 'Lov už běží.',
  'no-game': 'V lese vsi není zvěř.',
};

/**
 * Smí ves vyhlásit lov s honci na den `day` (hunting.md – Pravidla 2, 11)? `day` je den honců –
 * zítřek dne vyhlášení: sezóna i ostatní důvody se posuzují na něj (31. 5. s honci 1. 6. lze,
 * 28. 2. s honci 1. 3. ne). Vrací null, nebo důvod v pořadí: hájení (`HUNT.closedMonths`) → lov vsi
 * běží (`running`) → v lese vsi není velká zvěř (`pickQuarry` nemá z čeho losovat; ves bez stavu
 * zvěře taky) → ves honce neuvolní (`canSpareBeaters` dne vyhlášení).
 */
export function huntDenied(state: VillageState, day: number, running: boolean): HuntDenied | null {
  const { month } = dateOfDayIndex(day);
  if (month >= HUNT.closedMonths.from && month <= HUNT.closedMonths.to) return 'closed-season';
  if (running) return 'already';
  if (!state.wildlife || weightSum(quarryWeights(state.wildlife)) <= 0) return 'no-game';
  if (!canSpareBeaters(state, day - 1)) return 'no-beaters';
  return null;
}

/**
 * Uvolní ves zítra (`day + 1`) další honce (hunting.md – Pravidla 2: 6 mužů na celý den z dílu mužů
 * na stavby)? Dnešní díl mužů na stavby (poslední hodnota `commonLaborHistory`) musí pokrýt honce,
 * kteří už na zítřek jsou (`hunt.beaters` – druhý lov téhož dne je přičte), i nové
 * `HUNT.beaters.men`. Bez historie (ves ještě nepracovala) ne.
 */
export function canSpareBeaters(state: VillageState, day: number): boolean {
  const history = state.commonLaborHistory;
  const build = history[history.length - 1];
  if (build === undefined) return false;
  const beaters = state.wildlife?.hunt?.beaters;
  const reserved = beaters?.day === day + 1 ? beaters.men : 0;
  return build + EPSILON >= (reserved + HUNT.beaters.men) * LABOR_PER_DAY.adult;
}

/**
 * Honci na `day + 1` (mutuje stav; hunting.md – Pravidla 2): `men` mužů (bez údaje
 * `HUNT.beaters.men`) zítra celý den chybí v práci vsi – dnešní práce je spočtená od rána. Druhý
 * lov téhož dne honce přičte, lov jiného dne starou rezervaci přepíše. Touž cestou zaplatí jeden
 * den práce útočník lovu výpravy (`men` = počet útočníků; jinak ho práce vsi počítá jako doma –
 * `awayFromWork`). Ves bez stavu zvěře nic.
 */
export function reserveBeaters(
  state: VillageState,
  day: number,
  men: number = HUNT.beaters.men,
): void {
  const w = state.wildlife;
  if (!w) return;
  const hunt = (w.hunt ??= emptyHunt());
  const tomorrow = day + 1;
  const reserved = hunt.beaters?.day === tomorrow ? hunt.beaters.men : 0;
  hunt.beaters = { day: tomorrow, men: reserved + men };
}

/**
 * Lov je vyhlášený (mutuje stav): pořadí vyhlášení `hunt.declared` + 1 – štítek losu zvířete
 * (`pickQuarry`), takže další lov vyžene jiné zvíře. Ves bez stavu zvěře nic.
 */
export function countDeclaredHunt(state: VillageState): void {
  const w = state.wildlife;
  if (!w) return;
  const hunt = (w.hunt ??= emptyHunt());
  hunt.declared = (hunt.declared ?? 0) + 1;
}

/** Druhy zvířete v pevném pořadí losu (plán 2026-11-22-hunting – Rozhodnutí 4). */
export const QUARRY_KINDS: readonly QuarryKind[] = ['stag', 'hind', 'boar', 'sow', 'wolf', 'bear'];

/**
 * Váhy losu zvířete (hunting.md – Pravidla 3: „náhodou podle počtu té zvěře v lese vsi“; plán
 * 2026-11-22-hunting – Rozhodnutí 4): jelen = jeleni, laň = laně, kanec i bachyně = polovina
 * dospělých prasat (stav je nerozlišuje), vlk = vlci, medvěd = 1, žije-li v kraji (bez omezení
 * měsíce). Stav zvěře pod 1 kus váhu nemá (prasata podle všech dospělých), mláďata nikdy.
 */
export function quarryWeights(w: WildlifeState): Record<QuarryKind, number> {
  const whole = (n: number): number => (n >= 1 - EPSILON ? n : 0);
  const pigs = whole(w.boar.adults) / 2;
  return {
    stag: whole(w.deer.stags),
    hind: whole(w.deer.hinds),
    boar: pigs,
    sow: pigs,
    wolf: whole(w.wolves),
    bear: w.bear.present ? 1 : 0,
  };
}

/** Součet vah losu – 0 = v lese vsi není velká zvěř (`no-game`). */
function weightSum(weights: Record<QuarryKind, number>): number {
  return QUARRY_KINDS.reduce((sum, kind) => sum + weights[kind], 0);
}

/**
 * Zvíře, které honci vyženou (hunting.md – Pravidla 3; plán 2026-11-22-hunting – Rozhodnutí 4):
 * jeden los ze seedu vsi, dne a pořadí vyhlášení `n` (`hunt.declared` – další lov téhož dne
 * losuje z jiného proudu) × součet vah (`quarryWeights`), druhy v pevném pořadí `QUARRY_KINDS`.
 * Bez zvěře s vahou null. Stav nemění.
 */
export function pickQuarry(
  w: WildlifeState,
  seed: number,
  day: number,
  n: number,
): QuarryKind | null {
  const weights = quarryWeights(w);
  const total = weightSum(weights);
  if (total <= 0) return null;
  let roll = createRandom(deriveSeed(seed, 'quarry:' + day + ':' + n)).next() * total;
  let last: QuarryKind | null = null;
  for (const kind of QUARRY_KINDS) {
    const weight = weights[kind];
    if (weight <= 0) continue;
    if (roll < weight) return kind;
    roll -= weight;
    last = kind;
  }
  // zaokrouhlení na samém konci součtu – poslední druh s vahou
  return last;
}

/** Kus zvířete v úlovku roku a v kronice (`HuntKills`). */
const KILL_KIND: Record<QuarryKind, keyof HuntKills> = {
  stag: 'deer',
  hind: 'deer',
  boar: 'boar',
  sow: 'boar',
  wolf: 'wolves',
  bear: 'bear',
};

/**
 * Výsledek lovu ve vsi (mutuje stav, vrací kroniku; hunting.md – Pravidla 5–7; plán
 * 2026-11-22-hunting – Rozhodnutí 6, 7, 10): vždy den lovu navíc (`hunt.year.days`); zabité zvíře
 * ubude ze zvěře, dá maso, kůži, úlovek roku a kroniku `hunt` (`takeQuarry`); útočníci se vycvičí
 * (strop lovu 70), ranění a padlí lovci (`huntCasualties`) a padlí koně (`loseHorse`). Chybějící
 * osoba či kůň se přeskočí – výsledek platí i po smrti nebo odchodu lovce.
 */
export function applyHuntResult(state: VillageState, day: number, r: HuntResult): ChronicleEvent[] {
  const w = state.wildlife;
  if (w) (w.hunt ??= emptyHunt()).year.days += 1;
  const events = r.killed ? takeQuarry(state, day, r) : [];
  const people = new Map(state.people.map((p) => [p.id, p]));
  for (const t of r.trained) {
    const p = people.get(t.personId);
    if (p) p.arms = trainArms(p.arms ?? NO_ARMS, t.hours, trainingCap(p, day, 'hunt'));
  }
  events.push(...huntCasualties(state, day, r));
  for (const horseId of r.horsesLost) loseHorse(state, horseId);
  return events;
}

/**
 * Zabité zvíře (hunting.md – Pravidla 7; wildlife.md – Kolik): kus ubude ze zvěře (nejníž 0;
 * medvěd odejde a jiný se vrátí – `bearBackDay`), maso do zásoby (`HUNT.meatKg` – vlk nic), kůže
 * (jelen a laň kůže skotu, kanec a bachyně menší kůže, vlk a medvěd nic – hides-honey.md), úlovek
 * roku po druzích a kronika `hunt` se jmény útočníků.
 */
function takeQuarry(state: VillageState, day: number, r: HuntResult): ChronicleEvent[] {
  const w = state.wildlife;
  if (w) removeQuarry(w, r.quarry, day);
  const meatKg = HUNT.meatKg[r.quarry];
  if (meatKg > 0) butcher(state, meatKg);
  if (r.quarry === 'stag' || r.quarry === 'hind') addHides(state, 1);
  else if (r.quarry === 'boar' || r.quarry === 'sow') addSmallHides(state, 1);
  const kills: HuntKills = { boar: 0, deer: 0, wolves: 0, bear: 0 };
  kills[KILL_KIND[r.quarry]] = 1;
  const year = w?.hunt?.year;
  if (year) {
    year[KILL_KIND[r.quarry]] += 1;
    year.meatKg += meatKg;
  }
  return [{ day, kind: 'hunt', kills, meatKg, names: [...r.names] }];
}

/** Kus zvířete ubude ze stavu zvěře (nejníž 0); ulovený medvěd z kraje odejde. */
function removeQuarry(w: WildlifeState, quarry: QuarryKind, day: number): void {
  switch (quarry) {
    case 'stag':
      w.deer.stags = Math.max(0, w.deer.stags - 1);
      return;
    case 'hind':
      w.deer.hinds = Math.max(0, w.deer.hinds - 1);
      return;
    case 'boar':
    case 'sow':
      w.boar.adults = Math.max(0, w.boar.adults - 1);
      return;
    case 'wolf':
      w.wolves = Math.max(0, w.wolves - 1);
      return;
    case 'bear':
      w.bear = { present: false, backDay: bearBackDay(day) };
  }
}

/**
 * Ranění a padlí lovci (hunting.md – Pravidla 6; plán 2026-11-22-hunting – Rozhodnutí 10): každý
 * jednou, smrt má přednost. Raněný 60 dní nepracuje, necvičí ani neloví (`PREDATOR_RISK.injuryDays`,
 * delší ránu nezkrátí; kronika `hunt-injury`), padlý zemře – kronika `death` (`cause: 'hunt'`),
 * hřbitov a nástupnictví (`dynastyDay` týž den) jako po bývalém riziku lovu.
 */
function huntCasualties(state: VillageState, day: number, r: HuntResult): ChronicleEvent[] {
  const outcomes = new Map<number, 'wounded' | 'dead'>();
  for (const c of r.casualties) {
    if (outcomes.get(c.personId) !== 'dead') outcomes.set(c.personId, c.outcome);
  }
  const people = new Map(state.people.map((p) => [p.id, p]));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const [id, outcome] of outcomes) {
    const p = people.get(id);
    if (!p) continue;
    if (outcome === 'wounded') {
      p.injuredUntilDay = Math.max(p.injuredUntilDay ?? 0, day + 1 + PREDATOR_RISK.injuryDays);
      events.push({
        day,
        kind: 'hunt-injury',
        prey: r.quarry,
        ...(p.name === undefined ? {} : { name: p.name }),
      });
      continue;
    }
    dead.add(id);
    events.push({
      day,
      kind: 'death',
      group: ageGroup(p, day),
      age: ageYears(p.bornDay, day),
      cause: 'hunt',
      prey: r.quarry,
      ...deathWho(state, p, day),
      population: state.people.length - dead.size,
    });
    const full = bury(state, day, p);
    if (full) events.push(full);
  }
  if (dead.size > 0) removePeople(state, dead);
  return events;
}
