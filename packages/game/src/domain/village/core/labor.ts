import { ageGroup } from '../people/people';
import { dailyMinPerHousehold } from './productivity';
import { DAY_CHORES, LABOR_PER_DAY, WATER_FETCHING, WEEDING_WOMEN } from '../rules';
import type { Dwelling, OrchardTaskName, Person, TaskName } from '../types';

/**
 * Skladba denního minima domácností podle období (population.md – Skladba dne podle ročního
 * období; Martin 9. 11. 2026) – `dayChores` (day-chores.ts).
 */
export interface DayChores {
  /** Násobek denního minima domácnosti – ve žňový den DAY_CHORES.harvestMinimumShare, jinak 1. */
  minimumShare: number;
  /** Nosí se voda domů (přirážka za chůzi pro vodu)? Ne ve žňový den ani když leží sníh. */
  water: boolean;
  /** Nosí se dříví na topení (přirážka za chůzi k okraji lesa)? V topné sezóně. */
  wood: boolean;
}

/** Den jako dřív (léto): plné minimum, voda, bez dříví – výchozí pro volající bez období. */
export const SUMMER_CHORES: DayChores = Object.freeze({
  minimumShare: 1,
  water: true,
  wood: false,
});

/** Žňový den (population.md – Skladba dne): poloviční minimum, voda se nosí na pole, ne domů. */
export const HARVEST_CHORES: DayChores = Object.freeze({
  minimumShare: DAY_CHORES.harvestMinimumShare,
  water: false,
  wood: false,
});

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
 * Lehčí polní práce, které smějí dělat i ženy řemeslníků (crafts.md – Kdo dělá řemeslo; Martin
 * 22. 10. 2026: „setí, žně, mlácení zrna, v případě potřeby i okopávání motykou. Nekovou,
 * nekácí, neorou, nestaví.“): setí, okopávání, žně a výmlat.
 */
/**
 * Úlohy žňových rukou (fields.md – Žně všemi rukama; `harvestHands`) a pomoci vojvodovy rodiny
 * ve žních (`lordHelp`): žeň (sklizeň, vázání, odnos) a výmlat.
 */
const HARVEST_HANDS_TASKS: ReadonlySet<LaborTaskName> = new Set<LaborTaskName>([
  'harvest',
  'thresh',
]);

/**
 * Úlohy přípravy půdy a setí, se kterými pomáhá vojvodova rodina (`lordSowing` – lord.md, Kdy jde
 * rodina na pole, Příprava půdy a setí; D102): vracení přílohu, kopání, orba a setí.
 */
const TILLAGE_TASKS: ReadonlySet<LaborTaskName> = new Set<LaborTaskName>([
  'reclaim',
  'dig',
  'plough',
  'sow',
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
   * Žňové ruce (fields.md – Žně všemi rukama; člověkodny před štěstím): řemeslníci se syny
   * (`craftHarvestLabor`) a výrostci a starší (`harvestHelperLabor`) ve žňové dny – samostatný
   * zásobník mimo `capacity` jako `light`, pokryje jen žeň a výmlat (`HARVEST_HANDS_TASKS`) před
   * prací vsi; co nevyužije, propadne. Bez údaje 0.
   */
  harvestHands?: number;
  /**
   * Díl žňových rukou od výrostků a starších (`harvestHelperLabor`, člověkodny před štěstím; zbytek
   * `harvestHands` jsou řemeslníci se syny) – trhání lnu (`womenFirst`) ho bere napřed. Bez údaje 0.
   */
  harvestYouth?: number;
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
   * nedoplejí, doplejí muži až po ostatních úlohách dne (seč, setí, orba) – s `menWeedLater` až po
   * stavbách. Totéž trhání lnu (`womenFirst`). Bez údaje 0 – pleje se jen z toho, co úlohy nechají.
   * Ženy nesou napřed i denní minimum a úlohy dne – na stavby jde jen práce mužů, která po nich
   * zbude (`DayAllocation.build`, `menCommon`; „D24 ano“); bez údaje staví všichni.
   */
  womenLabor?: number;
  /**
   * Muži plejí až po stavbách (fields.md – Pletí jednou a rychle; Martin 9. 11. 2026: „pletí
   * obstarají ženy a děti“): jejich díl pletí (`weedDaysLeft`) se z práce vsi nebere – vrátí se
   * v `menWeed` a ves ho dostane ze společné práce po stavbách. Bez údaje muži plejí před stavbami.
   */
  menWeedLater?: boolean;
  /**
   * Kolik dní zbývá do konce okna pletí i s dneškem (fields.md – Pletí jednou a rychle): muži
   * plejí jen tolik, kolik by děti a ženy dnešním tempem s rezervou do konce okna bez posledních
   * dní nestihly (`WEEDING_WOMEN`). Bez údaje muži doplejí, co jim ostatní úlohy nechají.
   */
  weedDaysLeft?: number;
  /**
   * Pomoc celé vojvodovy rodiny ve žních (lord.md – Kdy jde rodina na pole; `manorLabor` – `help`,
   * člověkodny před štěstím) – samostatný zásobník mimo `capacity`, až po práci vsi a žňových
   * rukou: pokryje jen žeň a výmlat (`HARVEST_HANDS_TASKS`), které ves dnes nestihne, takže vsi
   * nikdy neuvolní práci na stavby, opravy ani setí (návrh Clauda). Bez údaje 0.
   */
  lordHelp?: number;
  /**
   * Pomoc vojvodovy rodiny s přípravou půdy a setím (lord.md – Kdy jde rodina na pole, Příprava
   * půdy a setí; Martin 19. 11. 2026 – D102; `manorLabor` – `sowing`, člověkodny před štěstím) –
   * zásobník jako `lordHelp`, až po práci vsi: pokryje jen vracení přílohu, kopání, orbu a setí
   * (`TILLAGE_TASKS`), které ves dnes nestihne, takže vsi nikdy neuvolní práci na jiné úlohy ani
   * stavby. Bez údaje 0.
   */
  lordSowing?: number;
  /**
   * Celá práce rodiny po denním minimu dvorce (`manorLabor` – `free`, člověkodny před štěstím) –
   * strop všech pomocí dne dohromady (žně, příprava půdy a setí, výmlat v zimě). Bez údaje
   * `lordHelp` + `lordSowing`.
   */
  lordFree?: number;
  /**
   * Výmlat v zimě (lord.md – Kdy jde rodina na pole, Výmlat v zimě; Martin 18. 11. 2026): tempo
   * výmlatu, které ves dnes potřebuje, aby okno výmlatu stihla (práce po štěstí a světle – zbývající
   * práce výmlatu v okně ÷ dny okna). Rodina (`lordFree`) dnes dá jen díl výmlatu, který by ves do
   * konce okna nestihla: tempo nad pravidelnou práci vsi dne – po denním minimu a péči o koně,
   * dnešní délkou dne, bez jednorázových srážek (výpravy, vozy, kování a úlohy dne jako porážka).
   * Mlátí až po všech úlohách dne (i po přípravě půdy a setí, se kterými v listopadu pomáhá
   * – `lordSowing`) a jinak ten den nepomáhá. Bez údaje rodina pomáhá jako ve žních.
   */
  threshPace?: number;
  /**
   * Denní minimum dvorce, které rodina nepokryje (`manorLabor` – `uncovered`, člověkodny po štěstí;
   * domácnost dvorce je jinak z `householdElders` vynechaná) – z práce vsi spolu s denním minimem;
   * bez údaje 0.
   */
  manorMin?: number;
  /**
   * Přirážka denního minima za chůzi pro vodu (a v topné sezóně pro dříví – `woodFetchingLabor`)
   * po domácnostech (člověkodny, ve stejném pořadí jako `householdElders` – `householdWaterLabor`);
   * bez údaje 0. Kryjí ji starší jako zbytek minima.
   */
  householdWater?: readonly number[];
  /**
   * Násobek denního minima domácností podle období (`DayChores.minimumShare` – ve žňový den
   * poloviční; population.md – Skladba dne podle ročního období); bez údaje 1.
   */
  minimumShare?: number;
  /**
   * Venkovní práce podle světla (population.md – Skladba dne podle ročního období;
   * `daylightFactor`): práce vsi, která zbude po denním minimu, péči o koně, kování, výpravách
   * a vozech pro kováře (ty jsou „za den“), a zásobníky polní práce (`light`, `harvestHands`,
   * `weedChildren`, `womenLabor`, `lordHelp`) se násobí – zima ≈ 0,7, žně ≈ 1,4. Bez údaje 1.
   */
  daylight?: number;
  /**
   * Úlohy dne v pořadí přednosti. `follow` – setí týž den hned za orbou nebo motykou (fields.md –
   * Práce; Martin 9. 11. 2026: „Za oráčem by měl jít někdo z rodiny a rovnou zasívat“): úloha
   * dostane práci i na setí za sebou (`ratio` člověkodnů setí na člověkoden úlohy) a ta připadne
   * úloze setí `index` – setí jde stejným tempem jako příprava půdy, i když práce nestačí.
   */
  tasks: {
    name: LaborTaskName;
    remaining: number;
    follow?: { index: number; ratio: number };
    /** Rodina vojvody s úlohou nepomáhá (`lordHelp` – trhání lnu; fields.md – Len). */
    noLordHelp?: true;
    /**
     * Úlohu dělají napřed ženy a děti (trhání lnu – fields.md, Len; Martin 10. 11. 2026: „Mezi
     * jednotlivými sklizněmi tak vznikaly přirozené mezery právě na vytrhání lnu.“): výrostci
     * a starší ze žňových rukou (`harvestYouth`), ženy řemeslníků (`light`) a ženy vsi nad svůj
     * díl denního minima (jako při pletí) jdou na ni před všemi úlohami dne – muži dál žnou obilí;
     * zbytek dostane úloha ve svém pořadí.
     */
    womenFirst?: true;
  }[];
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
  /**
   * Výsadba jabloní u cest a sadu v oknech výsadby (orchard.md – Výsadba; Martin 22. 11. 2026:
   * „ano“ – výsadba má v jarních a podzimních oknech přednost před klučením zarostlých přílohů,
   * orba a setí na daný rok dál před výsadbou): práce, kterou výsadba dnes potřebuje (`manDays`),
   * a pořadí úloh (`order` – indexy `tasks`), ve kterém dostane práci vsi před úlohou na místě
   * `slot` (po orbě, kopání a setí, před vracením přílohu – `plantingOrder`). Chybí = bez výsadby,
   * úlohy v pořadí `tasks`.
   */
  planting?: { manDays: number; order: readonly number[]; slot: number };
  /**
   * Honci lovu dne (hunting.md – Pravidla 2; Martin „Ano, jak navrhuješ“; člověkodny –
   * `hunt.beaters.men` × `LABOR_PER_DAY.adult`): lov má přednost před stavbami a opravami, ne
   * před úlohami dne – honci vezmou nejvýš díl mužů na stavby (`DayAllocation.beaters`). Bez údaje 0.
   */
  beaters?: number;
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
   * Kolik práce vojvodovy rodiny (`lordHelp`, `lordSowing`, po štěstí) dnes žně, výmlat, příprava
   * půdy a setí spotřebovaly.
   */
  lordField: number;
  /** Kolik žňových rukou (`harvestHands`, po štěstí) dnes žeň a výmlat spotřebovaly. */
  harvestHands: number;
  /** Kolik práce dětí (`weedChildren`, po štěstí) dnes pletí spotřebovalo; chybí = 0. */
  weedChildren?: number;
  /** Kolik práce žen vsi (`womenLabor`, po štěstí) dnes pletí spotřebovalo; chybí = 0. */
  weedWomen?: number;
  /**
   * Pletí, které zbývá na muže po stavbách (`menWeedLater`): úloha (index v `tasks`) a nejvýš
   * kolik práce (po štěstí). Chybí = nic.
   */
  menWeed?: { index: number; manDays: number }[];
  tasks: Record<LaborTaskName, number>;
  /** Práce pro jednotlivé úlohy vstupu v jejich pořadí (stejný název může být víckrát – plodiny). */
  taskAmounts: number[];
  /**
   * Společná práce – co zbude po potřebných úlohách; jde napřed do staveb, pak do oprav obydlí
   * (`afterConstructions`). Ukazatel volné práce a „má na to“ (`commonLaborHistory`).
   */
  common: number;
  /**
   * Práce výsadby jabloní u cest a sadu (`DayAllocationInput.planting`) – jde do výsadby před
   * společnou prací (`plantFruit`), co nespotřebuje, přibude ke společné práci. Chybí = 0.
   */
  planting?: number;
  /**
   * Díl společné práce, který zbude mužům – jen ten jde na stavby (population.md – Práce, Stavby
   * staví muži; Martin 14. 11. 2026: „D24 ano“ – `menCommon`); co z `common` zbude, jde po stavbách
   * do oprav obydlí a dál. Chybí (rozdělení sestavené mimo `allocateDay`) = celá `common`.
   * Honci lovu (`beaters`) jsou z něj už odečtení.
   */
  build?: number;
  /**
   * Co dnes vzali honci lovu (`DayAllocationInput.beaters`, nejvýš díl mužů na stavby) – ze
   * společné práce i z dílu mužů na stavby. Chybí = 0.
   */
  beaters?: number;
}

/**
 * Denní rozdělení práce (population.md – Práce; Martin 19. 10. 2026: „pokud se něco staví, tak čas
 * věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“): minimum
 * (s přirážkou za chůzi pro vodu – `householdWater`) → péče o koně (horses.md – Péče) →
 * lidé na výpravách → sedláci s vozy pro kováře → potřebné sezónní úlohy (polní, v sadech, seč, porážka) v daném pořadí →
 * honci lovu z dílu mužů na stavby (`beaters`; hunting.md – Pravidla 2) → společná práce (stavby
 * jen z dílu mužů – `build`, `menCommon`; po nich opravy obydlí – `afterConstructions`). Denní
 * minimum domácnosti kryjí napřed její starší (`adultDailyMin`).
 */
export function allocateDay(input: DayAllocationInput): DayAllocation {
  const productivity = input.productivity ?? 1;
  let left = Math.max(0, input.capacity * productivity);
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const minimum = dailyMinPerHousehold(input.potteryCoverage) * (input.minimumShare ?? 1);
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
  // pravidelná práce vsi dne venku – výhled výmlatu vsi do konce okna (výmlat v zimě, `threshPace`)
  const regularOutdoor = left * Math.max(0, input.daylight ?? 1);
  // všechno nebo nic: částečná práce by propadla (`finishShoeing` kuje jen při celé práci)
  const wantedShoeing = Math.max(0, input.shoeing ?? 0);
  const shoeing = wantedShoeing <= left + 1e-9 ? take(wantedShoeing) : 0;
  // výpravy (trade.md – Doprava): nosiči jsou na cestě celé dny – po denním minimu, před vším
  // ostatním
  const away = take(input.away ?? 0);
  // sedláci s vozy pro kováře (crafts.md – Uhlí a ruda kováře) – po výpravách, před úlohami
  const carting = take(input.carting ?? 0);
  // venkovní práce podle světla (population.md – Skladba dne podle ročního období): co zbude po
  // pracích „za den“, dají lidé venku tak dlouho, jak je světlo
  const daylight = Math.max(0, input.daylight ?? 1);
  left *= daylight;
  const outdoor = productivity * daylight;
  // ženy nesou napřed denní minimum a úlohy dne (population.md – Práce, Stavby staví muži; Martin
  // 14. 11. 2026: „D24 ano“) – jejich venkovní práce po denním minimu; zbytek `left` je mužů
  const outdoorLeft = left;
  const womenOutdoor =
    Math.max(0, Math.max(0, input.womenLabor ?? 0) * productivity - dailyMin) * daylight;
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
  // lehká práce žen řemeslníků – jen na lehké úlohy, napřed ta, pak obecná kapacita
  let lightLeft = Math.max(0, (input.light ?? 0) * outdoor);
  // žňové ruce (fields.md – Žně všemi rukama) – jen žeň a výmlat, za lehkou prací žen
  const handsPool = Math.max(0, (input.harvestHands ?? 0) * outdoor);
  let handsLeft = handsPool;
  // děti při pletí (fields.md – Pletí – děti) – jen pletí, před dospělými
  const kidsPool = Math.max(0, (input.weedChildren ?? 0) * outdoor);
  let kidsLeft = kidsPool;
  // pomoc rodiny (lord.md – Kdy jde rodina na pole): žně (`lordHelp`) a příprava půdy a setí
  // (`lordSowing`) každá do svého podílu, všechno dohromady nejvýš celá práce rodiny (`lordFree`)
  const harvestHelp = Math.max(0, input.lordHelp ?? 0);
  const sowingHelp = Math.max(0, input.lordSowing ?? 0);
  const helpPool = Math.max(0, (input.lordFree ?? harvestHelp + sowingHelp) * outdoor);
  let helpLeft = helpPool;
  let harvestLeft = harvestHelp * outdoor;
  let sowingLeft = sowingHelp * outdoor;
  const taskAmounts = input.tasks.map(() => 0);
  // pletí napřed (fields.md – Pletí jednou a rychle): děti, ženy řemeslníků, pak ženy vsi – jejich
  // práce nad jejich díl denního minima domácností
  let womenLeft = Math.min(
    left,
    Math.max(
      0,
      Math.max(0, input.womenLabor ?? 0) * productivity - WEEDING_WOMEN.dailyMinShare * dailyMin,
    ) * daylight,
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
  // trhání lnu napřed (`womenFirst` – fields.md, Len; Martin 10. 11. 2026): výrostci a starší ze
  // žňových rukou, ženy řemeslníků, pak ženy vsi nad svůj díl minima – muži dál žnou obilí
  let youthLeft = Math.min(handsLeft, Math.max(0, (input.harvestYouth ?? 0) * outdoor));
  input.tasks.forEach((task, i) => {
    if (task.womenFirst !== true) return;
    let amount = taskAmounts[i] ?? 0;
    const youth = Math.min(task.remaining - amount, youthLeft);
    youthLeft -= youth;
    handsLeft -= youth;
    amount += youth;
    const light = Math.min(task.remaining - amount, lightLeft);
    lightLeft -= light;
    amount += light;
    const women = take(Math.min(task.remaining - amount, womenLeft));
    womenLeft -= women;
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
  // práce setí za orbou a motykou (`follow`) – přičte se úloze setí po rozdělení
  const followAmounts = input.tasks.map(() => 0);
  // díl pletí mužů po stavbách (`menWeedLater`)
  const later: { index: number; manDays: number }[] = [];
  const allot = (task: DayAllocationInput['tasks'][number], i: number): void => {
    let amount = taskAmounts[i] ?? 0;
    // s úlohou i setí za ní – práce úlohy a setí v poměru `ratio`
    const pair = 1 + Math.max(0, task.follow?.ratio ?? 0);
    // pletí mužů (a vše za ním) jen do jejich dílu
    const remaining =
      (task.name === 'weed' ? Math.min(task.remaining, amount + menWeed) : task.remaining) * pair;
    const before = amount;
    if (LIGHT_LABOR_TASKS.has(task.name)) {
      const light = Math.max(0, Math.min(remaining - amount, lightLeft));
      lightLeft -= light;
      amount += light;
    }
    if (HARVEST_HANDS_TASKS.has(task.name)) {
      const hands = Math.max(0, Math.min(remaining - amount, handsLeft));
      handsLeft -= hands;
      amount += hands;
    }
    if (task.name === 'weed' && input.menWeedLater === true) {
      // muži plejí až po stavbách – jejich díl ze společné práce (`menWeed`)
      const men = Math.max(0, remaining - amount);
      if (men > 0) later.push({ index: i, manDays: men });
      menWeed -= men;
    } else amount += take(remaining - amount);
    // pomoc rodiny ve žních a s přípravou půdy a setím až po práci vsi – jen co ves dnes
    // nestihne; výmlat v zimě až po všech úlohách dne (`threshPace`)
    const harvest =
      HARVEST_HANDS_TASKS.has(task.name) &&
      input.threshPace === undefined &&
      task.noLordHelp !== true;
    const tillage = TILLAGE_TASKS.has(task.name);
    const help =
      harvest || tillage
        ? Math.max(0, Math.min(remaining - amount, helpLeft, harvest ? harvestLeft : sowingLeft))
        : 0;
    helpLeft -= help;
    if (harvest) harvestLeft -= help;
    else if (tillage) sowingLeft -= help;
    amount += help;
    if (task.follow && pair > 1) {
      const own = before + (amount - before) / pair;
      followAmounts[task.follow.index] = (followAmounts[task.follow.index] ?? 0) + amount - own;
      amount = own;
    }
    if (task.name === 'weed') menWeed -= amount - before;
    taskAmounts[i] = amount;
  };
  // ostatní úlohy v pořadí, pletí až za nimi – co děti a ženy nestihly, doplejí muži zbylou prací;
  // výsadba jabloní a sadu v oknech výsadby po orbě, kopání a setí, před vracením přílohu (Martin
  // 22. 11. 2026) – úlohy v pořadí `planting.order`, výsadba před úlohou na místě `slot`
  const planting = input.planting;
  let plantingLabor = 0;
  const order = planting?.order ?? input.tasks.map((_, i) => i);
  order.forEach((i, k) => {
    if (planting && k === planting.slot) plantingLabor = take(planting.manDays);
    const task = input.tasks[i];
    if (task && task.name !== 'weed') allot(task, i);
  });
  if (planting && planting.slot >= order.length) plantingLabor = take(planting.manDays);
  input.tasks.forEach((task, i) => {
    if (task.name === 'weed') allot(task, i);
  });
  // výmlat v zimě (lord.md – Výmlat v zimě): rodina dá jen díl, který by ves do konce okna
  // nestihla – tempo nad pravidelnou práci vsi; jednorázový propad dne (porážka) nedorovnává
  if (input.threshPace !== undefined) {
    let missing = Math.max(0, input.threshPace - regularOutdoor);
    input.tasks.forEach((task, i) => {
      if (task.name !== 'thresh' || missing <= 0) return;
      const help = Math.max(0, Math.min(task.remaining - (taskAmounts[i] ?? 0), helpLeft, missing));
      helpLeft -= help;
      missing -= help;
      taskAmounts[i] = (taskAmounts[i] ?? 0) + help;
    });
  }
  input.tasks.forEach((task, i) => {
    taskAmounts[i] = (taskAmounts[i] ?? 0) + (followAmounts[i] ?? 0);
    tasks[task.name] += taskAmounts[i] ?? 0;
  });
  // honci lovu (hunting.md – Pravidla 2): po všech úlohách dne, z dílu mužů na stavby – stavby
  // a opravy den počkají, pole v oknech a žně ne
  const menBuild = menCommon(outdoorLeft, womenOutdoor, left);
  const beaters = Math.max(0, Math.min(input.beaters ?? 0, menBuild));
  return {
    dailyMin,
    eldersDailyMin,
    horseCare,
    shoeing,
    away,
    carting,
    lordField: helpPool - helpLeft,
    harvestHands: handsPool - handsLeft,
    ...(kidsPool > 0 ? { weedChildren: kidsPool - kidsLeft } : {}),
    ...(weedWomen > 0 ? { weedWomen } : {}),
    ...(later.length > 0 ? { menWeed: later } : {}),
    tasks,
    taskAmounts,
    common: left - beaters,
    ...(plantingLabor > 0 ? { planting: plantingLabor } : {}),
    build: menBuild - beaters,
    ...(beaters > 0 ? { beaters } : {}),
  };
}

/**
 * Díl společné práce `common`, který zbude mužům – jen ten jde na stavby (population.md – Práce,
 * Stavby staví muži; Martin 14. 11. 2026: „D24 ano“). Denní minimum a úlohy dne (pole, seno,
 * pletí, len, …) nesou napřed ženy – jejich venkovní práce po denním minimu (`womenOutdoor`) –
 * a muži je doplní, jen když práce žen nestačí; práce „za den“ (péče o koně, kování, výpravy, vozy
 * pro kováře) nesou muži jako dosud (díl žen při pletí je taky nepočítá). Mužům tak zbude venkovní
 * práce vsi po pracích „za den“ (`outdoor`) bez práce žen, nejvýš celá společná práce – stejné jako
 * min(společná, práce mužů − max(0, denní práce − práce žen)).
 */
export function menCommon(outdoor: number, womenOutdoor: number, common: number): number {
  const men = Math.max(0, outdoor - Math.max(0, womenOutdoor));
  return Math.max(0, Math.min(common, men));
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
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM' | 'forestWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
  chores: DayChores = SUMMER_CHORES,
): number[] {
  return householdWater(people, dwellings, skip, chores).map((h) => h.labor + (h.wood ?? 0));
}

/** Domácnost a její chůze pro vodu (`householdWater`). */
export interface HouseholdWater {
  dwellingId: number;
  people: number;
  /**
   * Přirážka denního minima za chůzi pro vodu (čd za den – `waterFetchingLabor`); 0, když se
   * voda domů nenosí (`DayChores.water` – žně, sníh).
   */
  labor: number;
  /**
   * Přirážka za chůzi pro dříví k okraji lesa (čd za den – `woodFetchingLabor`; jen v topné
   * sezóně; chybí = 0). Vůz s vodou ji neušetří.
   */
  wood?: number;
}

/**
 * Domácnosti a jejich přirážka za chůzi pro vodu a dříví (ve stejném pořadí jako
 * `householdElders`) podle skladby dne `chores` – podklad pro vodu vozem (wagons.md – Co vozy
 * vozí, cart-jobs.ts).
 */
export function householdWater(
  people: readonly Person[],
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM' | 'forestWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
  chores: DayChores = SUMMER_CHORES,
): HouseholdWater[] {
  const walks = new Map(dwellings.map((d) => [d.id, d]));
  return [...householdsOf(people, skip)].map(([id, members]) => ({
    dwellingId: id,
    people: members.length,
    labor: chores.water ? waterFetchingLabor(members.length, walks.get(id)?.waterWalkM) : 0,
    wood: chores.wood ? woodFetchingLabor(walks.get(id)?.forestWalkM) : 0,
  }));
}

/**
 * Denní minimum domácnosti podle období (population.md – Skladba dne podle ročního období):
 * minimum `minimum` × `DayChores.minimumShare` + chůze pro vodu (`water` – jen když se nosí)
 * a dříví (`wood` – v topné sezóně) domácnosti `people` lidí z obydlí `dwelling`.
 */
export function householdMinimum(
  minimum: number,
  people: number,
  dwelling: Pick<Dwelling, 'waterWalkM' | 'forestWalkM'> | undefined,
  chores: DayChores = SUMMER_CHORES,
): number {
  return (
    minimum * chores.minimumShare +
    (chores.water ? waterFetchingLabor(people, dwelling?.waterWalkM) : 0) +
    (chores.wood ? woodFetchingLabor(dwelling?.forestWalkM) : 0)
  );
}

/**
 * Chůze pro dříví na topení nad denní minimum (člověkodny za den; population.md – Skladba dne
 * podle ročního období, čísla návrh Clauda – DAY_CHORES): `woodTrips` cest na domácnost tam
 * a zpět k okraji lesa `walkM` m chůze daleko, prvních WATER_FETCHING.includedM v ceně minima,
 * rychlost a den jako u vody. Bez změřené chůze (bez krajiny) 0.
 */
export function woodFetchingLabor(walkM: number | undefined): number {
  if (walkM === undefined) return 0;
  const extraM = Math.max(0, walkM - WATER_FETCHING.includedM);
  return (
    (DAY_CHORES.woodTrips * 2 * extraM) / WATER_FETCHING.speedMps / (WATER_FETCHING.dayHours * 3600)
  );
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
  /** Co zbude po opravách – údržba opevnění a práce po stavbách (pletí mužů, seč navíc). */
  left: number;
}

// Robota hostů (fortifications.md – Cena a stavba, vassalage.md – Lidé a robota): práce hostů
// (`VillageState.guests`, `guestLaborToday`) jde ve `work()` napřed do rozestavěného opevnění vsi
// (`build(…, 'fortification')`), zbytek do společné práce – ostatní stavby rovným dílem (`build`),
// pak opravy obydlí (`afterConstructions`).

/**
 * Práce, kterou stavby nespotřebovaly (`left`), jde do oprav obydlí podle potřeby (Martin
 * 19. 10. 2026: „Opravy obydlí zařaď až za stavbu.“); zbytek vrátí.
 */
export function afterConstructions(left: number, repairNeed: number): AfterConstructions {
  const free = Math.max(0, left);
  const repairs = Math.min(free, Math.max(0, repairNeed));
  return { repairs, left: free - repairs };
}
