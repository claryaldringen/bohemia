// Řemesla, dílny, milíř, kovář, tesař, vozy a nákup u sousedů (část rozdělených pravidel, rozcestník je rules.ts).

import type { Bounds, CartJob, CartKind, ConstructionKind, Craft, DwellingType } from './types';
import { DWELLINGS } from './rules-people';
import { DWELLING_TREES, FELLING_MAN_DAYS_PER_TREE } from './rules-buildings';

// crafts.md – Budovy (Martin; +30 % návrh Clauda): dílna je obydlí – hrnčíř a kovář stojí na
// polozemnici, uhlíř na zemnici – a stojí jako základní obydlí + 30 % práce i dřeva za pec nebo
// výheň. Uhlíř stojí jako zemnice (crafts.md – Milíř u skácených buků, návrh Clauda 20. 10. 2026):
// přirážka byla za milíř u zemnice – milíř je teď samostatná stavba u každé dávky buků a staví ho
// uhlíř z práce milíře. Umisťuje se volně jako zemnice (bez pozemku). Tesař (wagons.md – Tesař,
// návrh Clauda): polozemnice s předsazenou střechou jako hrnčíř a kovář.
export const CRAFT_BASE: Readonly<Record<Craft, DwellingType>> = {
  potter: 'polozemnice',
  smith: 'polozemnice',
  burner: 'zemnice',
  carpenter: 'polozemnice',
};
export const WORKSHOP_EXTRA = 0.3;
/** Přirážka dílny řemesla k základnímu obydlí (uhlíř bez přirážky – milíř staví u dávky). */
export function workshopExtra(craft: Craft): number {
  return craft === 'burner' ? 0 : WORKSHOP_EXTRA;
}
/**
 * Pořadí řemesel – nabídka staveb a výroba dne (uhlíř první, jeho uhlí může kovář hned použít;
 * tesař poslední – jeho pomoc stavbám se rozdělí už před stavbami dne).
 */
export const CRAFTS: readonly Craft[] = ['burner', 'potter', 'smith', 'carpenter'];
// crafts.md – Výroba: uhlíř 10 kg uhlí za člověkoden, ze stromu 120 kg; kovář 1 kg nástrojů za
// 10 člověkodní a 50 kg uhlí; hrnčíř 1 kg keramiky za člověkoden a 1 strom paliva na 500 kg.
// Ruda a hlína dál od vody: +1 % za 10 m nad 100 m od dílny k potoku (DISTANCE jako u polí).
export const CRAFT_PRODUCTION = {
  charcoalKgPerManDay: 10,
  charcoalKgPerTree: 120,
  toolManDaysPerKg: 10,
  toolCharcoalKgPerKg: 50,
  potteryManDaysPerKg: 1,
  potteryKgPerTree: 500,
} as const;
// crafts.md – Účinek (návrh Clauda): každý pracující od 14 let potřebuje 3 kg nástrojů, nástroje
// v užívání se opotřebují o 30 % ročně; každý člověk potřebuje 5 kg nádob, ročně se jich 40 %
// rozbije. Opotřebení a rozbití se týká jen toho, co ves používá (nejvýš potřeba) – přebytek
// v zásobě leží (Martin: přebytky později pro obchod).
// crafts.md – Podle potřeby (návrh Clauda): kovář a hrnčíř vyrábějí jen do zásoby = potřeba vsi
// + opotřebení za `reserveYears` (nástroje × 1,3, keramika × 1,4); pak jejich domácnost pracuje
// se vsí (Martin 18. 10. 2026 – volný čas na poli)
export const CRAFT_NEEDS = {
  toolsKgPerWorker: 3,
  toolWearPerYear: 0.3,
  potteryKgPerPerson: 5,
  potteryBreakagePerYear: 0.4,
  reserveYears: 1,
} as const;
// crafts.md – Uhlíř (Martin 18. 10. 2026 – uhlíř pálí buky, staví milíř, sází mladé buky;
// čísla podle rešerše 2026-10-18-charcoal.md, rozdělení práce návrh Clauda): milíř = dávka
// 15 buků (≈ 18 prm, ≈ 1,8 t uhlí – Ø ≈ 4,6 m jako model). Práce po fázích: kácení a dovoz
// k milíři (FELLING_MAN_DAYS_PER_TREE + vzdálenost), příprava dřeva (odvětvení, krácení, štípání)
// 6 čd na buk, stavba milíře 2 čd na buk, pálení 8 dní (hlídá se ve dne i v noci – celá práce
// domácnosti), vytahání, třídění a odnos uhlí 2 čd na buk.
// crafts.md – Milíř u skácených buků (Martin 20. 10. 2026: „uhlíř udělá milíř na místě, kde na něj
// skácel buky … Uhlíř bude k milíři chodit ze svého domku“): milíř stojí uprostřed dávky, dřevo se
// k němu nosí jen pár metrů a za chůzi ze zemnice platí uhlíř přirážku vzdálenosti (DISTANCE) na
// veškerou práci u milíře.
export const CHARCOAL_KILN = {
  trees: 15,
  prepManDaysPerTree: 6,
  buildManDaysPerTree: 2,
  burnDays: 8,
  drawManDaysPerTree: 2,
} as const;
/**
 * crafts.md – Rovnováha uhlíř – kovář (Martin 20. 10. 2026: „Uhlíř i kovář přece musí za ty roky
 * vědět, jaká je nabídka a poptávka a dosáhnout tak rovnovážného stavu.“; čísla návrh Clauda):
 * - `windowDays`, `bucketDays` – spotřeba uhlí kovářů se měří klouzavě za posledních 365 dní po
 *   obdobích 30 dní; než se nasbírá rok, doplní ji odhad z opotřebení nástrojů,
 * - `cycles` – doba cyklu milíře uhlíře = průměr posledních 3 cyklů (od výběru buků po vypálení),
 * - `reserveDays` – rezerva: uhlíř začne další milíř, jakmile uhlí v milířích a u kovářů stačí jen
 *   na dobu cyklu + 15 dní; kovář jde pro uhlí, jakmile mu zásoba vystačí jen na cestu + 15 dní,
 * - `fetchDays` – kovář donese uhlí na 60 dní kování (při změřené spotřebě; dřív 30 dní na plný
 *   úvazek – cesty pro uhlí tak nejsou zbytečně časté), nejvýš kolik v milíři je,
 * - `maxKilns` – najednou smí stát dva milíře: jeden se rozebírá, druhý se připravuje nebo pálí,
 * - `remnantYears` – milířiště (černá uhlíkatá zem) po rozebraném milíři zaroste za 10 let (jako
 *   jámy obydlí – RUIN_YEARS).
 */
export const CHARCOAL_BALANCE = {
  windowDays: 365,
  bucketDays: 30,
  cycles: 3,
  reserveDays: 15,
  fetchDays: 60,
  maxKilns: 2,
  remnantYears: 10,
} as const;
/**
 * crafts.md – Milíř u skácených buků (návrh Clauda): místo milíře se hledá od středu dávky buků po
 * kružnicích po `stepM` do `searchM`; milíř (kruh MILIR.clearingRadiusM a pruh `marginM` kolem)
 * nestojí na poli, v sadu, na hřbitově, v ohradě, na pozemku ani u domů (`homeM` od obydlí),
 * na cestě (`roadM` od osy pevné cesty navíc ke kruhu), pod posvátným dubem, na háji ani na
 * skalním výchozu, ve vodě ani na svahu (rozdíl výšek jako u obydlí), ani u jiného milíře
 * (`kilnM` mezi středy).
 * Milířiště je paseka (návrh Clauda, 20. 10. 2026 – milíř musí být z výchozí kamery vidět): uhlíř
 * napřed vyklidí kruh milíře (všechny překážky mimo buky dávky, vyhrazené a posvátné stromy)
 * a skácí dospělé stromy a souše, jejichž koruna (poloměr `crownM` × měřítko stromu) zasahuje nad
 * milíř (poloměr MILIR.footprintM / 2) nebo do `clearAroundM` kolem něj.
 * Výhled (`view`): výchozí kamera stojí na jihu a dívá se šikmo k severu (41° pod vodorovnou –
 * strom 20 m vysoký zakryje, co je do ≈ 23 m za ním); místo milíře proto upřednostní místo, kde
 * v pruhu `halfWidthM` na obě strany a `lengthM` k jihu za pasekou nestojí dospělý strom (okraj lesa,
 * paseka, louka) – nejbližší takové do `searchM` od středu dávky; jinak nejbližší místo
 * s nejmenším počtem stromů v pruhu (do `searchM` milíře výše).
 */
export const KILN_SITE = {
  stepM: 2,
  searchM: 40,
  marginM: 1,
  homeM: 20,
  roadM: 2,
  kilnM: 12,
  crownM: 4,
  clearAroundM: 6,
  view: { lengthM: 26, halfWidthM: 6, searchM: 60 },
} as const;
// crafts.md – Uhlíř, obnova lesa (Martin; čísla návrh Clauda podle rešerše): na pařez skáceného
// buku uhlíř zasadí mladý buk (semenáček z lesa) – 0,1 čd na sazenici, jen v oknech výsadby jako
// sad; sazenice je hned mladý stromek a za 60 let dospělý buk (dolní mez 60–80 let – na pasece
// nečeká na nálet). Pařez bez sazenice dorůstá z náletu jako dřív (TREE_REGROWTH_YEARS).
export const BEECH_PLANTING = { manDaysPerTree: 0.1, matureYears: 60 } as const;
// crafts.md – Budovy: čtvercový půdorys milíře pro kontrolu místa (kruh milíře Ø ≈ 5,3 m),
// vyklízí se kruh ušlapané trávy (poloměr m). `offset` – kde stál milíř u uhlířovy zemnice ve vsích
// uložených před samostatnými milíři (souřadnice modelu – x napříč, z k vchodu, m; MILIR_OFFSET
// v tools/blender/crafts.py) – jen pro převod (`migrateKilns`)
export const MILIR = { offset: { x: -9, z: 3 }, footprintM: 6, clearingRadiusM: 4.6 } as const;
/**
 * crafts.md – Uhlí a ruda kováře (Martin 20. 10. 2026: „Kovář si vychovává nástupce. Pokud ve
 * vesnici není vůz kovář si musí chodit pro uhlí k uhlíři. Pokud má dostatečně starého syna nebo
 * syny, pošle pro uhlí jeho/je. Taky musí někam chodit kopat rudu.“; synové nosí uhlí od 10 let,
 * rudu kopou od 14 – Martin; ostatní čísla návrh Clauda podle rešerše
 * research/2026-10-20-bog-ore.md – většinou odhad, primární práce neověřené):
 * - ruda na kg nástrojů (8 kg – odhad 4–9 kg) plyne z řetězu tavby IRON (production-chains.md –
 *   Kovář): ruda → houba → hřivny → nástroje,
 * - `oreKgPerManDay` – vykopání, praní a pražení 60 kg rudy za člověkoden (odhad 40–100 kg –
 *   zdroj nenalezen), k tomu přirážka za chůzi na rudiště jako u lesního milíře (DISTANCE),
 * - `basketKg` – koš uhlí 15 kg (≈ 60 l – objem, jako CART_JOBS.charcoal), koš rudy 25 kg (váha,
 *   odhad 20–30 kg na pěší cestu), `basketLoadS` naložení a složení koše, s košem `carryMps` po
 *   louce (jako voda – WATER_FETCHING.speedMps), tam i zpět,
 * - `charcoalFromAge` / `oreFromAge` – synové kováře nosí uhlí od 10 let, rudu kopou a nosí od 14
 *   (Martin); syn 10–13 ten den nepase a udělá `youngsterShare` práce dospělého (jako pasák –
 *   HERDING.childShare),
 * - `depositKg` – ložisko vydrží 3 t rudy (odhad – hutě na Moravě se stěhovaly po 50–70 letech podle
 *   vyčerpání suroviny), další rudiště aspoň `siteSpacingM` od vyčerpaného, jámy kousek kolem místa
 *   (do `pitSpreadM`), zarostou a zmizí po `pitYears` (jako jámy obydlí – RUIN_YEARS),
 * - `oreBatchDays` – dávka rudy pěšky na 30 dní kování na plný úvazek (aspoň jeden koš).
 */
export const SMITH_SUPPLY = {
  oreKgPerManDay: 60,
  basketKg: { charcoal: 15, ore: 25 },
  basketLoadS: 120,
  carryMps: 1,
  charcoalFromAge: 10,
  oreFromAge: 14,
  youngsterShare: 0.4,
  depositKg: 3000,
  siteSpacingM: 20,
  pitSpreadM: 6,
  pitYears: 10,
  oreBatchDays: 30,
} as const;
/**
 * production-chains.md – Kovář (Martin 20. 10. 2026: „Kovař si donese/doveze dřevěné uhlí a železnou
 * rudu. Pak vytaví železnou houbu v redukční peci za pomocí ručního měchadla, houbu překove
 * v železnou hřivnu/hřivny, ze kterých může vyrábět nástroje nebo mohou jít na obchod.“, „V liště
 * jenom hřivny“; čísla návrh Clauda podle rešerše research/2026-10-20-production-chains.md – Kovář):
 * - `bloomPerOreKg` – z kg pražené bahenní rudy 0,25 kg železné houby (pokusy s bahenní rudou
 *   10–35 %, Owens 24 %, Wareham obvykle 25–35 %),
 * - `barsPerBloomKg` – z kg houby 0,6 kg hřiven (struska ven při překování; Sauder a Williams 2002:
 *   houba → sochor 63 %),
 * - `barsPerToolKg` – na kg nástrojů 1,2 kg hřiven (odpad při kování) – celkem 1,2 ÷ 0,6 ÷ 0,25 =
 *   8 kg rudy na kg nástrojů jako dřív (crafts.md – Uhlí a ruda kováře),
 * - `labor`, `charcoal` – rozdělení dnešní ceny kování (CRAFT_PRODUCTION – 10 čd a 50 kg uhlí na kg
 *   nástrojů) na tavbu v redukční peci, překování houby na hřivny a kování nástrojů z hřiven,
 * - `aloneRate` – u tavby šlape měch druhý člověk: dospělý z domácnosti kováře, nebo syn od
 *   `bellowsFromAge` let (ten den nepase); kovář sám taví polovičním tempem,
 * - `barsReserveYears` – kovář drží zásobu hřiven na rok obnovy vybavení (opotřebení nástrojů
 *   za rok – CRAFT_NEEDS.toolWearPerYear), z ní se prodává; přebytky navíc netaví.
 */
export const IRON = {
  bloomPerOreKg: 0.25,
  barsPerBloomKg: 0.6,
  barsPerToolKg: 1.2,
  labor: { smelt: 0.6, refine: 0.25, forge: 0.15 },
  charcoal: { smelt: 0.8, refine: 0.15, forge: 0.05 },
  aloneRate: 0.5,
  bellowsFromAge: 10,
  barsReserveYears: 1,
} as const;
/**
 * crafts.md – Hlína hrnčíře (Martin 20. 10. 2026: „Ano, udělej to jak říkáš“ – návrh Clauda nových
 * nákladů vozů, wagons.md – Co se vozí a na čem; čísla návrh Clauda, odhad): hrnčíř kope hlínu na
 * hliništi u potoka jako kovář rudu (smith-supply.ts – stejné nošení v koších, dávky, vůz se
 * sedlákem, jámy):
 * - `kgPerPotteryKg` – 1,5 kg vlhké hlíny na kg vypálené keramiky (voda ≈ 20 % a ztráta žíháním,
 *   čištění od kamínků a kořenů, zmetky při sušení a výpalu),
 * - `kgPerManDay` – vykopat a nakopat do košů 300 kg hlíny za člověkoden (odhad – hlína se jen
 *   kope; plavení, hnětení a ostřivo jsou v práci hrnčíře CRAFT_PRODUCTION.potteryManDaysPerKg),
 *   k tomu přirážka za chůzi na hliniště (DISTANCE),
 * - `basketKg` – koš hlíny 25 kg (jako ruda – váha),
 * - `depositKg` – hliniště vydrží 20 t (odhad – jílové vrstvy u potoka jsou mocné; vesnický hrnčíř
 *   s ≈ 300–600 kg keramiky ročně vydrží na jednom místě desítky let).
 */
export const CLAY = {
  kgPerPotteryKg: 1.5,
  kgPerManDay: 300,
  basketKg: 25,
  depositKg: 20_000,
} as const;
/**
 * crafts.md – Rudiště a hliniště na očích (Martin 20. 10. 2026: „To místo, kde kope rudu, chci na
 * mapě vidět“; čísla návrh Clauda): nové rudiště a hliniště leží mimo les a mimo koruny stromů,
 * aby jámy byly shora vidět – žádný dospělý strom (i strom u cesty a les vsi) do `treeClearM` m
 * od místa (koruna ≈ 4–5 m a jámy kolem místa – SMITH_SUPPLY.pitSpreadM). Místo v lese nebo pod
 * korunou jen tehdy, když volné není do `openFarther` × vzdálenost nejbližšího místa (a aspoň do
 * `openSlackM` m dál než ono).
 */
export const DUG_SITE_VIEW = { treeClearM: 8, openFarther: 1.5, openSlackM: 30 } as const;
/**
 * crafts.md – Učení řemesla (Martin 20. 10. 2026: „Každý řemeslník vychovává svého nástupce - syna.
 * Pokud je řemeslník úplně nový, trvá mu, než se řemeslo naučí“; čísla návrh Clauda): výkon dílny
 * podle praxe nejzkušenějšího dospělého z domácnosti – `startShare` (50 %) bez praxe, lineárně
 * do 100 % po `fullYears` (5) letech praxe; syn řemeslníka se učí od `apprenticeFromAge` (10) let.
 */
export const CRAFT_SKILL = { startShare: 0.5, fullYears: 5, apprenticeFromAge: 10 } as const;
// crafts.md – Budovy: přístřešek hrnčíře a kováře sahá před půdorys polozemnice o tolik (m) –
// půdorys dílny je o něj delší (vpředu, +z modelu; přední okraj přístřešku 5,7 m od středu,
// tools/blender/crafts.py PZ_O + PORCH)
export const WORKSHOP_PORCH_M: Readonly<Record<Craft, number>> = {
  potter: 3.2,
  smith: 3.2,
  burner: 0,
  // wagons.md – Tesař: předsazená střecha jako u hrnčíře a kováře (pod ní kozlíky a rozdělaný vůz)
  carpenter: 3.2,
};
// crafts.md – Účinek, orchard.md: jablka v nádobách vydrží do 1. 5. místo 1. 3. – s plným pokrytím
// nádobami; při částečném se den zkažení posouvá poměrně (pokrytí × dny od 1. 3. do 1. 5.)
export const APPLE_POTTERY_KEEP_DAY = { month: 5, day: 1 } as const;

/**
 * Práce na řemeslné dílně celkem (u blízkého lesa) – základní obydlí + 30 %, uhlíř jako zemnice
 * (crafts.md – Budovy).
 */
export function workshopCost(craft: Craft): number {
  return Math.round(DWELLINGS[CRAFT_BASE[craft]].cost * (1 + workshopExtra(craft)));
}

/** Dřevo řemeslné dílny (stromy) – základní obydlí + 30 %, uhlíř jako zemnice (crafts.md). */
export function workshopTrees(craft: Craft): number {
  return Math.round(DWELLING_TREES[CRAFT_BASE[craft]] * (1 + workshopExtra(craft)));
}

/** Práce na dílně bez dřeva – cena dílny minus kácení jejích stromů u blízkého lesa. */
export function workshopBuildLabor(craft: Craft): number {
  return workshopCost(craft) - workshopTrees(craft) * FELLING_MAN_DAYS_PER_TREE;
}

// wagons.md – Tesař (Martin 19. 10. 2026: tesař vyrábí vozy, dřevěné nářadí a výrazně zrychlí
// dřevěné části staveb; čísla návrh Clauda podle rešerše research/2026-10-19-carts-carpentry.md):
// - výroba: dvoukolák 25 čd a 1 kláda, čtyřkolák 50 čd a 2 klády; dřevěné nářadí 0,5 čd na kg,
//   100 kg ze stromu (klády bere z hromady, bez nich si skácí strom sám jako hrnčíř),
// - práce tesaře (výroba i pomoc stavbám) podle pokrytí nástroji od kováře – meze 1,5 → 1,
// - pomoc stavbám: člověkoden tesaře vede `crew` člověkodny dřevěné práce (tesařská parta, i jeho
//   vlastní); dřevěná část práce stavby podle pokrytí tesařem – meze 1 → 0,6 (WOODWORK_LABOR),
// - podíl dřevěné práce na ceně stavby (i s kácením) podle druhu stavby (`woodShare`; obydlí
//   a dílny podle typu obydlí); pole, sad, hřbitov a jabloně u cest dřevo neopracovávají.
export const CARPENTRY = {
  cartManDays: { 'two-wheel': 25, 'four-wheel': 50 },
  cartLogs: { 'two-wheel': 1, 'four-wheel': 2 },
  woodToolsManDaysPerKg: 0.5,
  woodToolsKgPerLog: 100,
  crew: 4,
  dwellingWoodShare: { zemnice: 0.4, polozemnice: 0.5, dvorec: 0.6 },
  woodShare: { pen: 0.4, ard: 1, idol: 0.8, shrine: 0.3, road: 0.3, repair: 0.3 },
} as const satisfies {
  cartManDays: Record<CartKind, number>;
  cartLogs: Record<CartKind, number>;
  dwellingWoodShare: Record<DwellingType, number>;
  woodShare: Partial<Record<ConstructionKind, number>>;
} & Record<string, unknown>;
// wagons.md – Tesař, Účinek (návrh Clauda podle rešerše): dřevěná část práce stavby s plným
// pokrytím tesařem o 40 % levnější
export const WOODWORK_LABOR: Bounds = { worst: 1, best: 0.6 };
// wagons.md – Tesař (návrh Clauda podle rešerše): práce tesaře bez nástrojů od kováře o polovinu
// pomalejší (sekery, tesly, nebozezy, dláta jsou železné)
export const CARPENTER_TOOLS_WORK: Bounds = { worst: 1.5, best: 1 };
// wagons.md – Tesař, dřevěné nářadí (návrh Clauda podle rešerše): hrábě, vidle, lopaty, cepy,
// násady, kádě – 4 kg na pracujícího od 14 let, 30 % ročně se opotřebí; tesař vyrábí do zásoby =
// potřeba + opotřebení za `reserveYears` (jako kovář – crafts.md, Podle potřeby). Práce vsi podle
// pokrytí – meze 1 → 0,95 (mírně, o jednotky procent – Martin).
export const WOOD_TOOLS = { kgPerWorker: 4, wearPerYear: 0.3, reserveYears: 1 } as const;
export const WOOD_TOOLS_LABOR: Bounds = { worst: 1, best: 0.95 };
// crafts.md – Nákup u sousedů (Martin 19. 10. 2026: „Nástroje ať vesničané obchodují individuálně…
// Sami si spočítají, jestli se jim to vyplatí. Až bude kovář u nás, budou pravděpodobněji nakupovat
// u něj, protože si ušetří cestu. S ostatními řemesly to bude stejné.“; čísla návrh Clauda podle
// rešerše research/2026-10-19-craft-buying.md):
// - `day` – ves se rozhoduje jednou za rok po sklizni, kdy je volno a přebytek (15. 11. – po ozimu,
//   sklizni jablek a porážce),
// - `crafts` – řemeslníci souseda podle toho, čím se živí (trade.md – Sousedé): řemeslníci mají
//   kováře, hrnčíře i tesaře jistě, ostatní někdy (pravděpodobnost, ze seedu vsi a směru),
// - `toolsValueKg` – hodnota kg nástrojů u kováře souseda v kg obilí (rešerše
//   research/2026-10-18-trade-values.md – železo × 2 za kování; nástroje nejsou zboží obchodu –
//   production-chains.md, Kovář), `woodToolsValueKg` dřevěného nářadí (≈ 0,5 čd na kg – rešerše
//   vozů; keramika 3 – TRADE_GOOD_VALUES),
// - cesta po hotové zemské stezce `trailTripDays`, bez stezky lidé jdou krajinou ke kraji mapy –
//   delší cesta (× `offTrailFactor`) a den navíc (`offTrailExtraDays`),
// - jde malá skupina – nejvýš `groupShare` dospělých vsi (aspoň 1, nejvýš `maxGroup`); kdo nese
//   víc, jde vícekrát (dny × kola), ale nejvýš `maxDays` dní (přes zimu) – víc ves koupí příští
//   rok; nosič unese TRADE.porterKg,
// - výrobek slouží 1 ÷ opotřebení let – ves porovná práci ušetřenou za ty roky s prací za platbu
//   (obilí a luštěniny – cena jídla v práci, economy.ts) a cestu (lidé × dny tam a zpět),
// - `minKg` – menší nákup nemá smysl.
export const CRAFT_BUYING = {
  day: { month: 11, day: 15 },
  crafts: {
    crafters: { smith: 1, potter: 1, carpenter: 1 },
    farmers: { smith: 0.5, potter: 0.4, carpenter: 0.3 },
    herders: { smith: 0.3, potter: 0.4, carpenter: 0.2 },
    woodsmen: { smith: 0.4, potter: 0.2, carpenter: 0.6 },
  },
  toolsValueKg: 60,
  woodToolsValueKg: 2,
  offTrailFactor: 1.5,
  offTrailExtraDays: 1,
  groupShare: 0.5,
  maxGroup: 8,
  maxDays: 60,
  minKg: 0.5,
} as const;
/**
 * wagons.md – Kování vozů (Martin 20. 10. 2026: „Ano. A taky přidej tedy pravidlo, že vozy mají
 * železnou složku. Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má) dojít do
 * nejbližší vesnice, kde kovář je“; „pokud zaplatil 173 kg obilí, tak nemohl jít sám. Buď si musel
 * půjčit vůz nebo muselo jít alespoň 6 lidí, aby to obilí unesli“; čísla návrh Clauda): kování
 * vozu – osy, hřeby, obruče a kování nábojů – dvoukolák 3 kg, čtyřkolák 6 kg; ve vsi se kove
 * z hřiven (IRON.barsPerToolKg na kg kování – production-chains.md, Kovář); pro kování jde syn
 * tesaře od `fetchFromAge` let, jinak tesař – platbu veze vůz, se kterým jede `cartCrew` sedlák
 * z vsi, nebo ji nesou nosiči po TRADE.porterKg.
 */
export const CART_IRON = {
  kg: { 'two-wheel': 3, 'four-wheel': 6 },
  fetchFromAge: 14,
  cartCrew: 1,
} as const satisfies { kg: Record<CartKind, number> } & Record<string, unknown>;
// wagons.md – Vůz (Martin 19. 10. 2026: vozy vozí seno, snopy, klády a zboží výprav místo nosičů;
// jeden vůz na spřežení – návrh Clauda; čísla návrh Clauda podle rešerše): dvoukolák 400 kg,
// čtyřkolák 800 kg (jen po stezce – obchod), vůz slouží 10 let. Vůz za den odveze tolik jako
// `carrierManDays` nosičů a jdou s ním `crew` lidé (honák a nakladač) – kde dojede, ušetří 6 čd.
// Převezme odnos snopů (podíl odnosu na sklizni – HARVEST_WORK_PER_HA), `haulShare.hay` seče
// (svoz a stohování) a `haulShare.logs` kácení a dovozu klád ke stavbám. Ves s vycvičeným spřežením
// chce dvoukolák na každé spřežení a s hotovou zemskou stezkou navíc jeden čtyřkolák.
// Kládu z lesa ke kraji, kam vůz dojede, vlečou lidé – `dragM`; k dílu pole a louce vůz dojede,
// když je do `reachM` od středu čtverce (kraj dílu – jako roční síť vozů). Vůz za den udělá
// `loadsPerCartDay` jízd (rešerše: nakládka a jízda ≈ 50 min na náklad) – jízdy svozu jdou do
// ročního provozu cest (vyjeté cesty – roads.md, Vozové cesty).
export const CARTS = {
  loadKg: { 'two-wheel': 400, 'four-wheel': 800 },
  lifespanYears: 10,
  carrierManDays: 8,
  crew: 2,
  haulShare: { hay: 0.25, logs: 0.5 },
  dragM: 30,
  reachM: 9,
  loadsPerCartDay: 8,
  tradeCrew: 2,
} as const satisfies { loadKg: Record<CartKind, number> } & Record<string, unknown>;
/**
 * wagons.md – Kolik vozů ves chce (Martin 20. 10. 2026: „Ano, udělej to jak říkáš“; čísla návrh
 * Clauda): ves si podle loňského provozu (rok vozů od 1. 11.) spočítá, kolik práce by ušetřil
 * k-tý vůz – nejvýš `maxCarts` vozů každého druhu. Rok vozů kratší než `minDays` (ohrada volů
 * postavená během roku, ves uložená dřív) běží do dalšího 1. 11. Úspory dne se měří, jako by vozů
 * bylo `probeCarts`.
 */
export const CART_DEMAND = {
  maxCarts: { 'two-wheel': 12, 'four-wheel': 4 },
  minDays: 300,
  probeCarts: 64,
} as const satisfies { maxCarts: Record<CartKind, number> } & Record<string, unknown>;
// wagons.md – Co vozy vozí (Martin 19. 10. 2026: „Pokud budou mít k dispozici vůz, ať na pole, pro
// vodu nebo pro dřevěné uhlí jede vůz.“; čísla návrh Clauda): dvoukolák, který dnes nesváží úrodu,
// seno ani klády a jehož voli neorají (ani orbu navíc – fields.md, Osev navíc), jede v pořadí:
// - `charcoal` – uhlí z vypáleného milíře ke kováři: z vytahání, třídění a odnosu
//   (CHARCOAL_KILN.drawManDaysPerTree – 2 čd na buk po 120 kg) je `carryShare` odnos v koších
//   (120 kg uhlí ≈ 8 košů po 15 kg – objemová hmotnost dřevěného uhlí ≈ 250 kg/m³, FAO 1987,
//   Simple technologies for charcoal making, FAO Forestry Paper 41; koš ≈ 60 l), u lesního milíře
//   s přirážkou za chůzi. Ten převezme vůz – korba s koši ≈ 1,2 m³ uveze `loadKg`, nakládka
//   a složení u kováře `stopS`; k milíři vůz dojede do `reachM` (milíř v lese jen po pevné cestě –
//   vozová síť). Odnos v koších dělá kovářova domácnost (crafts.md – Uhlí a ruda kováře, Martin
//   20. 10. 2026: „Pokud bude ve vesnici vůz, tak kováři přiveze uhlí sedlák s vozem (a odečte se
//   jeho práce).“) – s vozem jede `crew` sedlák z práce vsi (uhlíř u milíře nakládá při
//   vytahání, u kovárny složí kovář),
// - `ore` – ruda z rudiště do kovárny (crafts.md – Uhlí a ruda kováře): kovář (nebo syn od 14)
//   a sedlák s vozem dojedou k hromadě rudy u jámy, naloží a vrátí se s plným vozem (CARTS.loadKg);
//   `crew` = sedlák z práce vsi a kovář z práce dílny, `stopS` nakládka a složení; na celý vůz
//   kovář začne kopat, když mu ruda vystačí už jen na kopání dávky a `reserveDays` dní kování –
//   hromada u jámy pak počká, až bude vůz volný (ve žni a při orbě vozí jinde),
// - `clay` – hlína z hliniště k hrnčíři (crafts.md – Hlína hrnčíře): jako ruda – hrnčíř (nebo syn
//   od 14) a sedlák s vozem pro hromadu hlíny u jámy, `reserveDays` jako u rudy,
// - `seed` – osivo na pole: z práce setí (FIELD_WORK_PER_HA.sow – 10 čd/ha) je `carryShare` nošení
//   osiva v pytlích ze sýpky na pole a doplňování osévací plachty (SEED_KG_PER_HA ≈ 5 pytlů po
//   35 kg na hektar, pole 100–600 m od domů),
// - `water` – voda v sudech: člověk spotřebuje `litresPerPerson` (pití, vaření, mytí; WHO: při
//   docházce do 1 km a 30 minut ≈ 20 l, dál pod 5 l – Howard a Bartram 2003, Domestic Water
//   Quantity, Service Level and Health, WHO/SDE/WSH/03.02), cesta s vědry na vahadle nese
//   litresPerPerson ÷ WATER_FETCHING.tripsPerPerson = 25 l. Dvoukolák uveze dva sudy po 150 l
//   (`barrelL`; s vodou a sudy ≈ 350 kg – CARTS.loadKg; běžné sudy 100–250 l), nabírání vědry
//   (25 věder po 12 l) `fillS`, rozlití do nádob u domů `unloadS`; vůz sjede na břeh, je-li suchý
//   břeh do `reachM` od cíle (hledá se mezi `spots` břehy nejblíž ohradě). Vozí jen domácnostem,
//   kterým ušetří práci (chůze s vědry nad WATER_FETCHING.includedM – co je blíž, je v ceně denního
//   minima): vyplatí se až ≈ 170–200 m od vody, blíž je chůze s vědry levnější.
// Vůz jede tempem volů po louce (TEAM_TRAVEL.speedMps; trasa vozové sítě v m po louce – cesta
// rychleji, svah a strniště pomaleji), jdou s ním CARTS.crew lidé (honák a nakladač; u uhlí
// a rudy `crew`), den má WATER_FETCHING.dayHours hodin; jízd za den nejvýš CARTS.loadsPerCartDay.
export const CART_JOBS = {
  order: ['charcoal', 'ore', 'clay', 'seed', 'water'],
  charcoal: { carryShare: 0.2, loadKg: 300, stopS: 900, reachM: 12, crew: 1 },
  ore: { stopS: 900, reachM: 12, crew: 2, reserveDays: 15 },
  clay: { stopS: 900, reachM: 12, crew: 2, reserveDays: 15 },
  seed: { carryShare: 0.1 },
  water: {
    litresPerPerson: 10,
    barrelL: { 'two-wheel': 300, 'four-wheel': 600 },
    fillS: 300,
    unloadS: 300,
    reachM: 4,
    spots: 40,
  },
} as const satisfies {
  order: readonly CartJob[];
  water: { barrelL: Record<CartKind, number> } & Record<string, unknown>;
} & Record<string, unknown>;

// Voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby; Martin 24. 10. 2026: „Rozhodne
// ekonomika“, čísla návrh Clauda): pár od rádla sveze ráno vodu, jen když jízdy zaberou nejvýš
// `maxTeamShare` dne páru (víc už není ráno) a ušetřená práce za vodu převýší cenu odložené orby
// = odložená orba (čd) × riziko nestihnutí osevu. Riziko je 0, dokud zbytek orby okna nepřesáhne
// `windowReserve` orby, kterou rádla do konce okna zvládnou svým skutečným tempem; nad tím roste
// (r − rezerva) ÷ (1 − r) a při r ≥ 1 je nekonečné.
export const MORNING_WATER = { maxTeamShare: 0.25, windowReserve: 0.5 } as const;
