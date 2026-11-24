// Obchod – hodnoty zboží, doprava, koně a lidé výprav na cestě (část rozdělených pravidel,
// rozcestník je rules.ts).

import type { TradeGood } from '../types';

// trade.md – Obchod (návrh Clauda, schváleno 18. 10. 2026): hodnoty v kg obilí – ves za zboží
// dostane hodnotu ÷ přirážka 1,2 × příplatek 1,2 = 1 × hodnota (`sellValue` – platba koní nové
// ohrady). Nosič unese 25 kg, kládu bez vozu nesou dva; dobytek se žene – honák na 10 kusů, koně
// se vedou na ohlávce – honák na 4 koně (horses.md – Nákup a prodej, návrh Clauda); cesta tam
// a zpět 2–6 dní podle délky stezky (2 dny do 400 m, každých dalších 250 m den navíc – návrh
// Clauda) + 1 den za krajem mapy (zásilky vazalů, výprava na cestě). Rok obchodu začíná 1. 11.
// (zdražení zboží po zlém roce kraje – `tradeSeason`). Ves si nechá aspoň 2 krávy (chovný pár –
// návrh Clauda). Smyšlení sousedé za krajem mapy skončili (markets.md – Pravidla 1).
export const TRADE = {
  markup: 0.2,
  demandBonus: 0.2,
  porterKg: 25,
  headsPerDrover: 10,
  horsesPerDrover: 4,
  logCarriers: 2,
  tripDays: { min: 2, max: 6, fromM: 400, perDayM: 250 },
  beyondEdgeDays: 1,
  restockDay: { month: 11, day: 1 },
  keepCows: 2,
} as const;
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
  // nástroje a dřevěné nářadí (markets.md – Rozhodnutí plánu 3, bod 4): obnovená čísla dřívějšího
  // nákupu u sousedů `CRAFT_BUYING.toolsValueKg` a `woodToolsValueKg` @ b4f8dadc (crafts.md –
  // Nákup u sousedů, Martin 19. 10. 2026, čísla návrh Clauda) – nástroje 60 za kg (rešerše
  // research/2026-10-18-trade-values.md – železo × 2 za kování), dřevěné nářadí 2 za kg (≈ 0,5 čd
  // na kg – rešerše vozů); nesou se kg za kg
  tools: { valueKg: 60, carryKg: 1 },
  woodTools: { valueKg: 2, carryKg: 1 },
  // vozy za kus (markets.md – Rozhodnutí plánu 3, bod 4): obnovená cena dřívějšího nákupu vozu
  // u tesaře souseda `cartValueKg` @ b4f8dadc (crafts.md – Nákup u sousedů, Vozy; návrh Clauda –
  // jen z čísel, která už jsou): práce tesaře (CARPENTRY.cartManDays) × den tesaře v obilí jako
  // dřevěné nářadí (woodTools 2 kg ÷ CARPENTRY.woodToolsManDaysPerKg 0,5 čd = 4 kg za den), klády
  // (CARPENTRY.cartLogs) po 40 a kování (CART_IRON.kg) za hodnotu nástrojů 60 – dvoukolák
  // 25 × 4 + 1 × 40 + 3 × 60 = 320, čtyřkolák 50 × 4 + 2 × 40 + 6 × 60 = 640; nikdo ho nenese,
  // táhnou ho voli, kteří jdou s výpravou (`MarketTrip.oxen`)
  twoWheelCarts: { valueKg: 320, carryKg: 0 },
  fourWheelCarts: { valueKg: 640, carryKg: 0 },
  charcoal: { valueKg: 0.5, carryKg: 1 },
  ironBars: { valueKg: 45, carryKg: 1 },
  cows: { valueKg: 600, carryKg: 0 },
  youngOxen: { valueKg: 350, carryKg: 0 },
  trainedOxen: { valueKg: 1200, carryKg: 0 },
  // horses.md – Nákup a prodej: jezdecký kůň má cenu za kus podle výcviku (`HORSE_TRADE`), tady
  // jen základ – nevycvičený tříletý
  foals: { valueKg: 800, carryKg: 0 },
  mares: { valueKg: 1600, carryKg: 0 },
  ridingHorses: { valueKg: 2400, carryKg: 0 },
  logs: { valueKg: 40, carryKg: 100 },
  // kámen (trade.md – Kámen; návrh Clauda): 1 m³ = lámání 1 čd + dovoz ≈ 0,5 čd, a kláda za 1 čd práce
  // má 40 → 60 kg obilí za m³; váží 2 500 kg, takže ho unese jen vůz (`STONE_KG_PER_M3`)
  stone: { valueKg: 60, carryKg: 2500 },
  // kůže, kožešiny, med a vosk (hides-honey.md – Obchod; návrh Clauda, v kg obilí; odvozeno od masa 3
  // a klády 40 = 1 čd práce): med 6 za kg (cukr ani jiné sladidlo ves nemá, sladké pečivo),
  // vosk 30 za kg (z klátu jen ≈ 0,4 kg ročně a svíčky se bez něj nedají), kůže skotu 20 za kus
  // (10 h zpracování, váží ≈ 5 kg), kožešina 8 za kus (1,5–3 h zpracování)
  honey: { valueKg: 6, carryKg: 1 },
  wax: { valueKg: 30, carryKg: 1 },
  hides: { valueKg: 20, carryKg: 5 },
  furs: { valueKg: 8, carryKg: 1 },
  // lidé na trhu za kus (markets.md – Rozhodnutí plánu 3, bod 4): svobodný muž nebo žena 360 –
  // obnovené číslo dřívější výměny lidí („dospělý 360 kg obilí“, trade.md – Výměna lidí, Martin
  // 19. 10. 2026); rodina 720 – dva dospělí, děti v ceně (návrh Clauda – trh zná jednu cenu za kus,
  // rodina stojí stejně se 3 i s 8 lidmi). Nikdo je nenese – jdou po svých
  families: { valueKg: 720, carryKg: 0 },
  men: { valueKg: 360, carryKg: 0 },
  women: { valueKg: 360, carryKg: 0 },
} as const satisfies Record<TradeGood, { valueKg: number; carryKg: number }>;
/**
 * horses.md – Nákup a prodej (Martin 23. 10. 2026: koně jako ostatní zvířata; čísla návrh Clauda):
 * hříbě 800 kg obilí (víc než mladý vůl – kůň je vzácný, chov dražší), chovná klisna 1 600 (víc
 * než vycvičený vůl), jezdecký kůň 2 400 (3 roky, nevycvičený) – 3 600 (12 let, vycvičený)
 * lineárně podle výcviku (`ridingPerTrainingKg` za celý výcvik – 2–3 vycvičení voli; údržba koně
 * ≈ 1,4× vola).
 */
export const HORSE_TRADE = {
  ridingPerTrainingKg: 1200,
} as const;
/**
 * horses.md – Koně se stavbou ohrady (Martin 26. 10. 2026; čísla návrh Clauda): nově dokončená
 * ohrada koní přivede hřebce (jezdecký kůň 3 roky, bez výcviku) a dvě klisny (4 roky). Cena koní (`horsePenValueKg`) se odvodí z cen obchodu
 * (`TRADE_GOOD_VALUES`) a platí se předem z přebytku vsi: hřivny, zvířata, obilí (`horsePenPayment`).
 */
export const HORSE_PEN_STOCK = {
  stallions: 1,
  stallionAgeYears: 3,
  mares: 2,
  mareAgeYears: 4,
} as const;
/**
 * trade.md – Dobytek ve třech druzích (návrh Clauda): vycvičený vůl od souseda má za sebou
 * `servedYears` let služby (zbývá mu 7 z 10); ves prodá jen vycvičené voly mimo posledních
 * OXEN.trainingYears let služby (dosluhující soused nekoupí) – napřed ty, kteří slouží nejdéle,
 * mladé voly napřed ty, které výcvik čeká nejdéle.
 */
export const CATTLE_TRADE = { servedYears: 3 } as const;
// trade.md – Výměna lidí (Martin 19. 10. 2026; čísla návrh Clauda): lidé, které přivede výprava
// na cestě (markets.md – Pravidla 10). Rodina souseda: muž 24–38 let, žena o 0–6 let mladší
// (nejméně 18 + 3 roky na dítě), děti – nejmladší 0–2 roky, mezi dětmi 2–3 roky; svobodný dospělý
// muž nebo žena 16–26 let.
export const PEOPLE_TRADE = {
  husbandAge: { from: 24, to: 38 },
  wifeYounger: { from: 0, to: 6 },
  wifeMinAge: 18,
  wifeYearsPerChild: 3,
  youngestChildAge: { from: 0, to: 2 },
  childSpacing: { from: 2, to: 3 },
  adultAge: { from: 16, to: 26 },
} as const;
