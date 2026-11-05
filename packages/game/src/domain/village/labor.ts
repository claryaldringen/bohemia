import { ageGroup } from './people';
import { dailyMinPerHousehold } from './productivity';
import { LABOR_PER_DAY, WATER_FETCHING, WEEDING_WOMEN } from './rules';
import type { Dwelling, OrchardTaskName, Person, TaskName } from './types';

/**
 * Sezónní práce v rozdělení práce vsi – polní (fields.md), orba rádlem, seč sena (oxen.md),
 * porážka a uzení (diet.md), v sadech (orchard.md) a ukládání zrna do obilných jam
 * (production-chains.md – Obilné jámy). Práce se zvířaty a domácí výroba jdou bokem
 * (population.md – Práce): dojí a krmí ženy, pasou výrostci, domácí výrobu obstarají ženy. Ves
 * bez výrostků pase dospělým z práce vsi (`herding` – diet.md, Pasáci, Dospělý pasák).
 */
export type LaborTaskName =
  TaskName | OrchardTaskName | 'plough' | 'mow' | 'slaughter' | 'grain-pit' | 'watch' | 'herding';

/**
 * Úlohy, na které jde pomoc rodiny vojvody (`lordHelp`): jen práce potřebného osevu – vrácení a
 * kopání půdy, orba, setí, plet, žně a výmlat plodin. Seč, porážku, jámy na zrno a péči o sad
 * rodina nepřebírá, stejně jako stavby a opravy (lord.md).
 */
const SOWING_HELP_TASKS: ReadonlySet<LaborTaskName> = new Set([
  'reclaim',
  'dig',
  'plough',
  'sow',
  'weed',
  'harvest',
  'thresh',
]);

/**
 * Lehčí polní práce, které smějí dělat i ženy řemeslníků (crafts.md – Kdo dělá řemeslo; Martin
 * 22. 10. 2026: „setí, žně, mlácení zrna, v případě potřeby i okopávání motykou. Nekovou,
 * nekácí, neorou, nestaví.“): setí, okopávání, žně a výmlat.
 */
/**
 * Úlohy žňových rukou (fields.md – Žně všemi rukama; `harvestHands`, `lordHarvest`): žeň
 * (sklizeň, vázání, odnos) a výmlat.
 */
export const HARVEST_HANDS_TASKS: ReadonlySet<LaborTaskName> = new Set<LaborTaskName>([
  'harvest',
  'thresh',
]);

export const LIGHT_LABOR_TASKS: ReadonlySet<LaborTaskName> = new Set<LaborTaskName>([
  'sow',
  'weed',
  'harvest',
  'thresh',
]);

export interface DayAllocationInput {
  /** Pracovní síla vsi – dospělí (`laborPerDay`). */
  capacity: number;
  /**
   * Starší lidé po domácnostech vsi (počet, jedna položka na domácnost – `householdElders`) –
   * kryjí napřed denní minimum své domácnosti (`adultDailyMin`).
   */
  householdElders: readonly number[];
  /**
   * Lehčí práce žen řemeslníků (`craftLightLabor`, člověkodny před štěstím) – samostatný zásobník
   * mimo `capacity`: pokryje jen úlohy z `LIGHT_LABOR_TASKS`, nikdy orbu, kácení ani stavby;
   * co nevyužijí, propadne. Bez údaje 0.
   */
  light?: number;
  /**
   * Práce vojvodovy rodiny na poli (lord.md – Kdy jde rodina na pole; `manorLabor`, člověkodny před
   * štěstím) – samostatný zásobník mimo `capacity` jako `light`: pokryje jen úlohy dne (`tasks` –
   * pole, orba, seč, sklizeň, výmlat…), nikdy stavby ani opravy; co nevyužije, propadne. Bez
   * údaje 0.
   */
  lordField?: number;
  /**
   * Žňové ruce (fields.md – Žně všemi rukama; člověkodny před štěstím): řemeslníci se syny
   * (`craftHarvestLabor`) a výrostci a starší (`harvestHelperLabor`) ve žňové dny – samostatný
   * zásobník mimo `capacity` jako `light`, pokryje jen žeň a výmlat (`HARVEST_HANDS_TASKS`) před
   * prací vsi; co nevyužije, propadne. Bez údaje 0.
   */
  harvestHands?: number;
  /**
   * Cvičící muži vojvodovy rodiny ve žňové dny (`manorLabor` – `harvest`, člověkodny před štěstím)
   * – zásobník jako `harvestHands`, za ním; spotřebu vrací `lordField`. Bez údaje 0.
   */
  lordHarvest?: number;
  /**
   * Děti při pletí (fields.md – Pletí – děti; `weedingChildren` × `WEEDING_CHILDREN.perDay`,
   * člověkodny před štěstím) – zásobník mimo `capacity` jako `harvestHands`, pokryje jen pletí, před
   * prací dospělých; co nevyužije, propadne. Bez údaje 0.
   */
  weedChildren?: number;
  /**
   * Práce žen vsi za den (člověkodny před štěstím; fields.md – Pletí jednou a rychle – plejí hlavně
   * ženy a děti). Ženy nesou díl denního minima domácností (`WEEDING_WOMEN.dailyMinShare`) – pletí
   * bere po dětech a lehké práci žen řemeslníků jen jejich práci nad tento díl (nejvýš co vsi
   * zbylo po minimu, koních, výpravách a vozech), i před úlohami, které jsou v pořadí dřív; co
   * nedoplejí, doplejí muži až po ostatních úlohách dne (seč, setí, orba). Bez údaje 0 – pleje se
   * jen z toho, co úlohy nechají.
   */
  womenLabor?: number;
  /**
   * Kolik dní zbývá do konce okna pletí i s dneškem (fields.md – Pletí jednou a rychle): muži
   * plejí jen tolik, kolik by děti a ženy dnešním tempem s rezervou do konce okna bez posledních
   * dní nestihly (`WEEDING_WOMEN`). Bez údaje muži doplejí, co jim ostatní úlohy nechají.
   */
  weedDaysLeft?: number;
  /**
   * Pomoc vojvodovy rodiny s potřebným osevem (lord.md – Kdy jde rodina na pole, bod 1; `manorLabor`
   * – `help`, člověkodny před štěstím) – zásobník jako `lordField`, ale až po práci vsi: pokryje
   * jen, co z úloh osevu ves nestihne, takže vsi nikdy neuvolní práci na stavby, opravy ani osev
   * navíc (návrh Clauda). Bez údaje 0.
   */
  lordHelp?: number;
  /**
   * Denní minimum dvorce, které rodina nepokryje (`manorLabor` – `uncovered`, člověkodny po štěstí;
   * domácnost dvorce je jinak z `householdElders` vynechaná) – z práce vsi spolu s denním minimem;
   * bez údaje 0.
   */
  manorMin?: number;
  /**
   * Přirážka denního minima za chůzi pro vodu po domácnostech (člověkodny, ve stejném pořadí jako
   * `householdElders` – `householdWaterLabor`); bez údaje 0. Kryjí ji starší jako zbytek minima.
   */
  householdWater?: readonly number[];
  tasks: { name: LaborTaskName; remaining: number }[];
  /** Pokrytí nádobami 0–1 – posouvá denní minimum mezi mezemi (crafts.md). */
  potteryCoverage: number;
  /**
   * Násobek veškeré práce vsi – štěstí (happiness.md – Účinek na práci) krát ostatní meze
   * produktivity; bez údaje 1.
   */
  productivity?: number;
  /**
   * Péče o koně (horses.md – Péče; Martin 23. 10. 2026: hodina denně na koně z práce vsi) –
   * `horseCareLabor`, člověkodny: hned za denním minimem, před výpravami – péče se nedá odložit;
   * bez údaje 0.
   */
  horseCare?: number;
  /**
   * Kování koní vlastním kovářem (horses.md – Kování): práce dne v člověkodnech, hned za péčí
   * o koně; bez údaje 0.
   */
  shoeing?: number;
  /**
   * Lidé na výpravách k sousedům (trade.md – Doprava, Martin 19. 10. 2026): nosiči, honáci
   * a pomocníci u vozů jsou na cestě – jejich člověkodny jdou hned po denním minimu, před
   * úlohami dne (`expeditionLaborToday`); bez údaje 0.
   */
  away?: number;
  /**
   * Sedláci s vozy pro uhlí a rudu kováře (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026:
   * „přiveze uhlí sedlák s vozem (a odečte se jeho práce)“): jízda je domluvená předem – jde
   * z práce vsi po výpravách, před úlohami dne; bez údaje 0.
   */
  carting?: number;
}

export interface DayAllocation {
  /** Denní minimum domácností z práce vsi – co po starších zbude na dospělé. */
  dailyMin: number;
  /** Denní minimum, které pokryli starší svou prací (mimo práci vsi – jen pro postavy). */
  eldersDailyMin: number;
  /** Péče o koně (nejvýš `horseCare`, hned po denním minimu). */
  horseCare: number;
  /** Kování koní vlastním kovářem (nejvýš `shoeing`, hned po péči o koně). */
  shoeing?: number;
  /** Práce lidí na výpravách (nejvýš `away`, po péči o koně). */
  away: number;
  /** Práce sedláků s vozy pro uhlí a rudu (nejvýš `carting`, po výpravách). */
  carting: number;
  /**
   * Kolik práce vojvodovy rodiny (`lordField`, `lordHarvest` a `lordHelp`, po štěstí) dnes úlohy
   * spotřebovaly.
   */
  lordField: number;
  /** Kolik žňových rukou (`harvestHands`, po štěstí) dnes žeň a výmlat spotřebovaly. */
  harvestHands: number;
  /** Kolik práce dětí (`weedChildren`, po štěstí) dnes pletí spotřebovalo; chybí = 0. */
  weedChildren?: number;
  /** Kolik práce žen vsi (`womenLabor`, po štěstí) dnes pletí spotřebovalo; chybí = 0. */
  weedWomen?: number;
  tasks: Record<LaborTaskName, number>;
  /** Práce pro jednotlivé úlohy vstupu v jejich pořadí (stejný název může být víckrát – plodiny). */
  taskAmounts: number[];
  /**
   * Společná práce – co zbude po potřebných úlohách; jde napřed do staveb, pak do oprav obydlí
   * (`afterConstructions`). Ukazatel volné práce a „má na to“ (`commonLaborHistory`).
   */
  common: number;
}

/**
 * Denní rozdělení práce (population.md – Práce; Martin 19. 10. 2026: „pokud se něco staví, tak čas
 * věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“): minimum
 * (s přirážkou za chůzi pro vodu – `householdWater`) → péče o koně (horses.md – Péče) →
 * lidé na výpravách → sedláci s vozy pro kováře → potřebné sezónní úlohy (polní, v sadech, seč, porážka) v daném pořadí →
 * společná práce (stavby, po nich opravy obydlí – `afterConstructions`). Denní minimum domácnosti
 * kryjí napřed její starší (`adultDailyMin`).
 */
export function allocateDay(input: DayAllocationInput): DayAllocation {
  const productivity = input.productivity ?? 1;
  let left = Math.max(0, input.capacity * productivity);
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const minimum = dailyMinPerHousehold(input.potteryCoverage);
  const water = input.householdWater ?? [];
  let minimums = 0;
  let adults = 0;
  input.householdElders.forEach((elders, k) => {
    // denní minimum domácnosti s přirážkou za vodu (population.md – Práce)
    const own = minimum + (water[k] ?? 0);
    minimums += own;
    adults += adultDailyMin(own, elders, productivity);
  });
  const eldersDailyMin = minimums - adults;
  const dailyMin = take(adults + Math.max(0, input.manorMin ?? 0));
  // péče o koně (horses.md – Péče) – hned za denním minimem, nedá se odložit
  const horseCare = take(input.horseCare ?? 0);
  // všechno nebo nic: částečná práce by propadla (`finishShoeing` kuje jen při celé práci)
  const wantedShoeing = Math.max(0, input.shoeing ?? 0);
  const shoeing = wantedShoeing <= left + 1e-9 ? take(wantedShoeing) : 0;
  // výpravy (trade.md – Doprava): nosiči jsou na cestě celé dny – po denním minimu, před vším
  // ostatním
  const away = take(input.away ?? 0);
  // sedláci s vozy pro kováře (crafts.md – Uhlí a ruda kováře) – po výpravách, před úlohami
  const carting = take(input.carting ?? 0);
  const tasks: Record<LaborTaskName, number> = {
    reclaim: 0,
    dig: 0,
    sow: 0,
    weed: 0,
    harvest: 0,
    thresh: 0,
    plough: 0,
    mow: 0,
    slaughter: 0,
    'grain-pit': 0,
    watch: 0,
    herding: 0,
    'orchard-care': 0,
    'orchard-harvest': 0,
  };
  // lehká práce žen řemeslníků – jen na lehké úlohy, napřed ta, pak práce vojvodovy rodiny na poli
  // (jen úlohy dne), pak obecná kapacita
  let lightLeft = Math.max(0, (input.light ?? 0) * productivity);
  // žňové ruce (fields.md – Žně všemi rukama) – jen žeň a výmlat, za lehkou prací žen
  const handsPool = Math.max(0, (input.harvestHands ?? 0) * productivity);
  let handsLeft = handsPool;
  const lordHarvestPool = Math.max(0, (input.lordHarvest ?? 0) * productivity);
  let lordHarvestLeft = lordHarvestPool;
  // děti při pletí (fields.md – Pletí – děti) – jen pletí, před dospělými
  const kidsPool = Math.max(0, (input.weedChildren ?? 0) * productivity);
  let kidsLeft = kidsPool;
  const lordPool = Math.max(0, (input.lordField ?? 0) * productivity);
  let lordLeft = lordPool;
  const helpPool = Math.max(0, (input.lordHelp ?? 0) * productivity);
  let helpLeft = helpPool;
  const taskAmounts = input.tasks.map(() => 0);
  // pletí napřed (fields.md – Pletí jednou a rychle): děti, ženy řemeslníků, pak ženy vsi – jejich
  // práce nad jejich díl denního minima domácností
  let womenLeft = Math.min(
    left,
    Math.max(
      0,
      Math.max(0, input.womenLabor ?? 0) * productivity - WEEDING_WOMEN.dailyMinShare * dailyMin,
    ),
  );
  let weedWomen = 0;
  let weedLight = 0;
  input.tasks.forEach((task, i) => {
    if (task.name !== 'weed') return;
    let amount = Math.min(task.remaining, kidsLeft);
    kidsLeft -= amount;
    const light = Math.min(task.remaining - amount, lightLeft);
    lightLeft -= light;
    weedLight += light;
    amount += light;
    const women = take(Math.min(task.remaining - amount, womenLeft));
    womenLeft -= women;
    weedWomen += women;
    taskAmounts[i] = amount + women;
  });
  // muži plejí jen, co by děti a ženy do konce okna nestihly (bez údaje o okně všechno) – odhad
  // opatrně: z práce, kterou dnes na pletí opravdu daly, s rezervou a bez posledních dní okna
  // (výpravy, vozy a seč jim v dalších dnech práci vezmou – WEEDING_WOMEN)
  const weedPace = (kidsPool - kidsLeft + weedLight + weedWomen) * WEEDING_WOMEN.paceShare;
  const weedLeft = input.tasks.reduce(
    (sum, task, i) => (task.name === 'weed' ? sum + task.remaining - (taskAmounts[i] ?? 0) : sum),
    0,
  );
  let menWeed =
    input.weedDaysLeft === undefined
      ? Infinity
      : Math.max(
          0,
          weedLeft - weedPace * Math.max(0, input.weedDaysLeft - 1 - WEEDING_WOMEN.spareDays),
        );
  const allot = (task: { name: LaborTaskName; remaining: number }, i: number): void => {
    let amount = taskAmounts[i] ?? 0;
    // pletí mužů (a vše za ním) jen do jejich dílu
    const remaining =
      task.name === 'weed' ? Math.min(task.remaining, amount + menWeed) : task.remaining;
    const before = amount;
    if (LIGHT_LABOR_TASKS.has(task.name)) {
      const light = Math.max(0, Math.min(remaining - amount, lightLeft));
      lightLeft -= light;
      amount += light;
    }
    if (HARVEST_HANDS_TASKS.has(task.name)) {
      const hands = Math.max(0, Math.min(remaining - amount, handsLeft));
      handsLeft -= hands;
      const lordHands = Math.max(0, Math.min(remaining - amount - hands, lordHarvestLeft));
      lordHarvestLeft -= lordHands;
      amount += hands + lordHands;
    }
    const lord = Math.max(0, Math.min(remaining - amount, lordLeft));
    lordLeft -= lord;
    amount += lord;
    amount += take(remaining - amount);
    // pomoc rodiny s osevem až po práci vsi – jen co ves dnes nestihne
    const help = SOWING_HELP_TASKS.has(task.name)
      ? Math.max(0, Math.min(remaining - amount, helpLeft))
      : 0;
    helpLeft -= help;
    amount += help;
    if (task.name === 'weed') menWeed -= amount - before;
    taskAmounts[i] = amount;
  };
  // ostatní úlohy v pořadí, pletí až za nimi – co děti a ženy nestihly, doplejí muži zbylou prací
  input.tasks.forEach((task, i) => {
    if (task.name !== 'weed') allot(task, i);
  });
  input.tasks.forEach((task, i) => {
    if (task.name === 'weed') allot(task, i);
  });
  input.tasks.forEach((task, i) => {
    tasks[task.name] += taskAmounts[i] ?? 0;
  });
  return {
    dailyMin,
    eldersDailyMin,
    horseCare,
    shoeing,
    away,
    carting,
    lordField: lordPool - lordLeft + (lordHarvestPool - lordHarvestLeft) + (helpPool - helpLeft),
    harvestHands: handsPool - handsLeft,
    ...(kidsPool > 0 ? { weedChildren: kidsPool - kidsLeft } : {}),
    ...(weedWomen > 0 ? { weedWomen } : {}),
    tasks,
    taskAmounts,
    common: left,
  };
}

/**
 * Kolik denního minima domácnosti (`minimum`) zbude na dospělé (population.md – Práce; Martin
 * 19. 10. 2026: „Starší lidé se zase starají o malé děti, a uvolňují práci zbytku rodiny.“; návrh
 * Clauda): starší (`elders`) ho kryjí napřed – hlídání malých dětí, oheň, vaření –, každý
 * `LABOR_PER_DAY.elder` × produktivita; dospělí dají jen zbytek. Co starším nad minimum zbude, do
 * práce vsi nejde a propadne.
 */
export function adultDailyMin(minimum: number, elders: number, productivity = 1): number {
  return Math.max(0, minimum - LABOR_PER_DAY.elder * Math.max(0, elders) * productivity);
}

/**
 * Domácnosti vsi – lidé se stejným `dwellingId` v pořadí prvního člověka domácnosti; `skip`
 * vynechá domácnosti (dílny pracují zvlášť).
 */
function householdsOf(people: readonly Person[], skip: ReadonlySet<number>): Map<number, Person[]> {
  const households = new Map<number, Person[]>();
  for (const p of people) {
    if (skip.has(p.dwellingId)) continue;
    const members = households.get(p.dwellingId);
    if (members) members.push(p);
    else households.set(p.dwellingId, [p]);
  }
  return households;
}

/**
 * Starší lidé po domácnostech (počet, v pořadí prvního člověka domácnosti) – domácnost = lidé se
 * stejným `dwellingId`; `skip` vynechá domácnosti (dílny pracují zvlášť).
 */
export function householdElders(
  people: readonly Person[],
  day: number,
  skip: ReadonlySet<number> = new Set(),
): number[] {
  return [...householdsOf(people, skip).values()].map(
    (members) => members.filter((p) => ageGroup(p, day) === 'elder').length,
  );
}

/**
 * Přirážka denního minima za chůzi pro vodu po domácnostech (člověkodny za den, ve stejném pořadí
 * jako `householdElders`): podle lidí domácnosti a chůze jejího obydlí k vodě
 * (`Dwelling.waterWalkM` – `waterFetchingLabor`). Domácnost bez obydlí (zakladatelé na staveništi)
 * nebo bez změřené chůze 0.
 */
export function householdWaterLabor(
  people: readonly Person[],
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
): number[] {
  return householdWater(people, dwellings, skip).map((h) => h.labor);
}

/** Domácnost a její chůze pro vodu (`householdWater`). */
export interface HouseholdWater {
  dwellingId: number;
  people: number;
  /** Přirážka denního minima za chůzi pro vodu (čd za den – `waterFetchingLabor`). */
  labor: number;
}

/**
 * Domácnosti a jejich přirážka za chůzi pro vodu (ve stejném pořadí jako `householdElders`) –
 * podklad pro vodu vozem (wagons.md – Co vozy vozí, cart-jobs.ts).
 */
export function householdWater(
  people: readonly Person[],
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
): HouseholdWater[] {
  const walks = new Map(dwellings.map((d) => [d.id, d.waterWalkM]));
  return [...householdsOf(people, skip)].map(([id, members]) => ({
    dwellingId: id,
    people: members.length,
    labor: waterFetchingLabor(members.length, walks.get(id)),
  }));
}

/**
 * Chůze pro vodu nad denní minimum (člověkodny za den; population.md – Práce, paths.md – Pochůzky
 * pro vodu; Martin 19. 10. 2026, čísla návrh Clauda – WATER_FETCHING): domácnost `people` lidí
 * chodí `tripsPerPerson` cesty na člověka tam a zpět k vodě `walkM` m chůze daleko; prvních
 * `includedM` je v ceně denního minima: cesty × 2 × max(0, chůze − includedM) ÷ rychlost ÷ délka
 * dne. Bez změřené chůze (bez krajiny – kalibrace, testy) 0.
 */
export function waterFetchingLabor(people: number, walkM: number | undefined): number {
  if (walkM === undefined || people <= 0) return 0;
  const extraM = Math.max(0, walkM - WATER_FETCHING.includedM);
  const trips = WATER_FETCHING.tripsPerPerson * people;
  return (trips * 2 * extraM) / WATER_FETCHING.speedMps / (WATER_FETCHING.dayHours * 3600);
}

/** Práce po stavbách – opravy obydlí a co zbude. */
export interface AfterConstructions {
  repairs: number;
  /** Co zbude po opravách (díly nad potřebu – fields.md, Osevní postup po dílech; seč navíc). */
  left: number;
}

// Robota hostů (fortifications.md – Cena a stavba, vassalage.md – Lidé a robota): práce lidí na
// robotě půjde napřed do rozestavěného opevnění vsi, zbytek do společné práce – až Ú4.5
// (`VillageState.guests` zatím neexistuje), dnes jde všechna práce staveb rovným dílem (`build`).

/**
 * Práce, kterou stavby nespotřebovaly (`left`), jde do oprav obydlí podle potřeby (Martin
 * 19. 10. 2026: „Opravy obydlí zařaď až za stavbu.“); zbytek vrátí.
 */
export function afterConstructions(left: number, repairNeed: number): AfterConstructions {
  const free = Math.max(0, left);
  const repairs = Math.min(free, Math.max(0, repairNeed));
  return { repairs, left: free - repairs };
}
