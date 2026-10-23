// Obchod se sousedy a výměna lidí (část rozdělených pravidel, rozcestník je rules.ts).

import type { NeighbourGood, TradeGood } from './types';

// trade.md – Obchod (návrh Clauda, schváleno 18. 10. 2026): výměna podle hodnot v kg obilí. Soused
// bere s přirážkou ≈ 20 % (prodává o ni dráž, kupuje o ni levněji), co shání, za to dá o 20 % víc,
// co nabízí, dá o 20 % levněji: ves za sháněné zboží dostane hodnotu ÷ 1,2 × 1,2 = 1 × hodnota,
// nabízené zboží platí hodnotou × 1,2 × 0,8 = 0,96. Nosič unese 25 kg (dobytek se žene – honák na
// 10 kusů, návrh Clauda); vozy jedou tolikrát, kolikrát se naplní celé, zbytek nesou lidé
// rovnoměrně mezi jízdy (wagons.md – Obchod, Martin 22. 10. 2026); cesta tam a zpět 2–6 dní podle délky stezky (2 dny do 400 m, každých
// dalších 250 m den navíc – návrh Clauda) + 1 den za krajem mapy. Zásoby a poptávka sousedů se
// doplní 1. 11. Ves si nechá aspoň 2 krávy (chovný pár – návrh Clauda). Krávy a voli jdou po svých
// s honákem – jako lidé ve výměně lidí nepotřebují nosiče, honák je člověk výpravy.
export const TRADE = {
  markup: 0.2,
  demandBonus: 0.2,
  offerDiscount: 0.2,
  porterKg: 25,
  headsPerDrover: 10,
  logCarriers: 2,
  tripDays: { min: 2, max: 6, fromM: 400, perDayM: 250 },
  beyondEdgeDays: 1,
  restockDay: { month: 11, day: 1 },
  keepCows: 2,
} as const;
// trade.md – Sousedé (Martin 19. 10. 2026: „Nech jen společné suroviny, nezaváděj nové.“ – soused
// obchoduje jen se zbožím, které má i ves; druhy sousedů návrh Clauda): soused se něčím živí – to
// nabízí (2–3 druhy ze své nabídky `offers`, je-li jich tolik) – a shání, čeho sám nemá dost (2–3
// druhy: `always` vždy, zbytek ze svých potřeb `needs`); nabízené a sháněné se nepřekrývají. Kolem
// vsi je každý druh souseda dvakrát (8 směrů), takže co ves potřebuje, to některý soused nabízí,
// a co jí přebývá (obilí, maso, sýr, klády po mýcení), to některý shání. Roční zásoba každého
// nabízeného zboží v hodnotě 600–1 500 kg obilí, poptávka po sháněném 800–2 000 kg obilí.
export const NEIGHBOURS = {
  offers: { min: 2, max: 3 },
  demands: { min: 2, max: 3 },
  supplyKg: { from: 600, to: 1500 },
  demandKg: { from: 800, to: 2000 },
  kinds: {
    // obilnáři z bezlesé roviny – obilí, luštěniny, dobytek; klády vždy
    farmers: {
      offers: ['grain', 'legumes', 'cattle'],
      always: 'logs',
      needs: ['meat', 'cheese', 'pottery', 'ironBars', 'charcoal'],
    },
    // pastevci – dobytek, maso, sýr; obilí vždy
    herders: {
      offers: ['cattle', 'meat', 'cheese'],
      always: 'grain',
      needs: ['legumes', 'logs', 'pottery', 'ironBars'],
    },
    // lesní ves (dřevaři a uhlíři) – klády, uhlí, maso; obilí vždy
    woodsmen: {
      offers: ['logs', 'charcoal', 'meat'],
      always: 'grain',
      needs: ['legumes', 'cheese', 'pottery', 'ironBars'],
    },
    // řemeslníci (hrnčíři a kováři) – keramika, hřivny (production-chains.md – Kovář); obilí vždy
    crafters: {
      offers: ['pottery', 'ironBars'],
      always: 'grain',
      needs: ['legumes', 'meat', 'cheese', 'logs', 'charcoal', 'cattle'],
    },
  },
  /**
   * Dobytek ve třech druzích (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s dobytkem
   * by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
   * vycvičit) a vycvičené voly“; rozdělení podle povahy návrh Clauda): `cattle` v povaze souseda
   * se rozloží na druhy dobytka – pastevci nabízejí všechny tři (a vždy, i když jim los dobytek
   * nedal), obilnáři krávy a mladé voly (vycvičené potřebují na orbu sami), řemeslníci shánějí
   * všechny tři (tažné voly na svoz, krávy na mléko, mladé voly si vycvičí).
   */
  cattleKinds: {
    farmers: ['cows', 'youngOxen'],
    herders: ['cows', 'youngOxen', 'trainedOxen'],
    woodsmen: [],
    crafters: ['cows', 'youngOxen', 'trainedOxen'],
  },
  cattleAlways: ['herders'],
} as const satisfies Record<string, unknown> & {
  kinds: Record<
    string,
    { offers: readonly NeighbourGood[]; always: NeighbourGood; needs: readonly NeighbourGood[] }
  >;
  cattleKinds: Record<string, readonly TradeGood[]>;
  cattleAlways: readonly string[];
};
// trade.md – Obchod, hodnoty zboží v kg obilí (rešerše research/2026-10-18-trade-values.md, návrh
// Clauda): obilí 1, luštěniny 1, maso 3, sýr 4, keramika 3, uhlí 0,5 (kg), kráva 600, kláda 40
// (kus). Hřivny (production-chains.md – Kovář, návrh Clauda) 45 za kg – nástroje 60 bez kování
// (15 % práce a 5 % uhlí) ÷ 1,2 kg hřiven na kg nástrojů ≈ 47; železo z rešerše 30–60. Dobytek ve třech druzích (trade.md – Dobytek ve třech druzích, rešerše
// research/2026-10-20-cattle-trade.md, návrh Clauda): mladý vůl (tele před výcvikem) 350 – roček
// stál v saském kapituláři solidus jako kráva ve franských zákonících, je ale ještě 2 roky jen
// krmit –, vycvičený vůl 1 200 – v Lex Ribuaria dvakrát kráva (vůl 2, kráva 1 solidus), v Anglii
// 14. stol. ≈ 1,4×; rozdíl proti mladému ≈ 2 zimy sena a výcvik. `carryKg` – kolik váží kus pro
// nosiče (kláda 100 kg – s vozem vždy na voze, bez vozu ji nesou dva lidé, `TRADE.logCarriers`; dobytek jde po svých s honákem – `TRADE.headsPerDrover`)
export const TRADE_GOOD_VALUES = {
  grain: { valueKg: 1, carryKg: 1 },
  legumes: { valueKg: 1, carryKg: 1 },
  meat: { valueKg: 3, carryKg: 1 },
  cheese: { valueKg: 4, carryKg: 1 },
  pottery: { valueKg: 3, carryKg: 1 },
  charcoal: { valueKg: 0.5, carryKg: 1 },
  ironBars: { valueKg: 45, carryKg: 1 },
  cows: { valueKg: 600, carryKg: 0 },
  youngOxen: { valueKg: 350, carryKg: 0 },
  trainedOxen: { valueKg: 1200, carryKg: 0 },
  logs: { valueKg: 40, carryKg: 100 },
} as const satisfies Record<TradeGood, { valueKg: number; carryKg: number }>;
/**
 * trade.md – Dobytek ve třech druzích (návrh Clauda): vycvičený vůl od souseda má za sebou
 * `servedYears` let služby (zbývá mu 7 z 10); ves prodá jen vycvičené voly mimo posledních
 * OXEN.trainingYears let služby (dosluhující soused nekoupí) – napřed ty, kteří slouží nejdéle,
 * mladé voly napřed ty, které výcvik čeká nejdéle.
 */
export const CATTLE_TRADE = { servedYears: 3 } as const;
// trade.md – Výměna lidí (Martin 19. 10. 2026: „Se sousedem půjde vyměnit i lidi... např. když on
// jich bude mít moc a nebude je moci uživit, může jich pár vyměnit s námi za nějaké suroviny
// a opačně.“, „Mohou se stěhovat celé rodiny i jen dospělí. Podle toho, co je v nabídce.“; čísla
// návrh Clauda): dospělý má hodnotu ≈ dvouleté spotřeby jídla (2 × 180 kg obilí), dítě do 14 let
// polovinu, přirážky jako u zboží. Rok obchodu: soused má s pravděpodobností 40 % lidi navíc
// (0–2 rodiny a 0–3 svobodné dospělé, aspoň jednoho člověka), s 30 % lidi shání (vezme 0–2 rodiny
// a 0–3 dospělé, aspoň jednoho), jinak lidi nemění. Rodina souseda: muž 24–38 let, žena o 0–6 let
// mladší (nejméně 18 + 3 roky na dítě), 0–3 děti – nejmladší 0–2 roky, mezi dětmi 2–3 roky;
// svobodný dospělý muž nebo žena 16–26 let. Muži a ženy zvlášť (Martin 19. 10. 2026): pohlaví
// každého svobodného dospělého souseda se losuje 1 : 1 už v nabídce a poptávce.
export const PEOPLE_TRADE = {
  adultValueKg: 360,
  childShare: 0.5,
  surplusChance: 0.4,
  shortageChance: 0.3,
  families: { min: 0, max: 2 },
  adults: { min: 0, max: 3 },
  children: { min: 0, max: 3 },
  husbandAge: { from: 24, to: 38 },
  wifeYounger: { from: 0, to: 6 },
  wifeMinAge: 18,
  wifeYearsPerChild: 3,
  youngestChildAge: { from: 0, to: 2 },
  childSpacing: { from: 2, to: 3 },
  adultAge: { from: 16, to: 26 },
} as const;
