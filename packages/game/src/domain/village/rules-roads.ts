// Cesty, pěšiny, vozová síť, vozová cesta a zemská stezka (část rozdělených pravidel, rozcestník je rules.ts).

export const DISTANCE = { freeM: 100, percentPer10M: 1 } as const;
// paths.md – Pěšiny a práce, roads.md – Rychlejší chůze (Martin 19. 10. 2026: „berme louku za
// výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které zrovna neleží
// ladem: 0.5. Upravená cesta: 1.7 – tyhle hodnoty se týkají chůze.“): po plně prošlapané pěšině
// dne se chodí 1,3× rychleji než po louce, slabší pěšina úměrně méně (návrh Clauda, jako dřív) –
// úsek pěšiny síly s stojí (1 − (1 − 1 / speed) × s) × délka; přes díl pole v osevu pěšina
// nezrychlí (platí FIELD_WALK). Stejná cena v síti pěšin i ve vzdálenosti chůze (fields.md –
// Vzdálenost).
export const PATH_WALK = { speed: 1.3 } as const;
// fields.md – Vzdálenost, paths.md – ceny buněk (Martin 19. 10. 2026: „Pole, které zrovna neleží
// ladem: 0.5.“ a „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“):
// rychlost chůze přes díl pole proti louce – v osevu od orby nebo kopání po sklizeň (zoraný,
// osetý, rostoucí, zralý, ve žni) 0,5, strniště po sklizni 0,8; úhor, příloh a zakládaný díl jako
// louka. Pole není zákaz, jen cena – síť pěšin hledá nejrychlejší cestu („nejkratší cesta je ta
// nejrychlejší“), přes pole jde, když je obcházení delší
export const FIELD_WALK = { crop: 0.5, stubble: 0.8 } as const;
// roads.md – Dvě vrstvy cest (návrh Clauda, schváleno 18. 10. 2026): pevné cesty se počítají
// jednou za rok k 1. 11. (po sklizni jablek) z celoroční práce; úsek, kudy se dva roky po sobě
// chodí aspoň 3× denně (roční průměr), se stane pevnou cestou; vyšlapaná cesta, kudy se 5 let po
// sobě chodí pod polovinu prahu, zaroste
export const ROADS = {
  yearDay: { month: 11, day: 1 },
  tripsPerDay: 3,
  years: 2,
  overgrowYears: 5,
  // roads.md – Zarůstá jen nepoužívaný kus (Martin, 19. 10. 2026: „ano“; délka kusu návrh Clauda):
  // provoz se v roční kontrole posuzuje po kusech osy ≈ 25 m
  pieceM: 25,
} as const;
// roads.md – Nový systém cest, paths.md – Zarůstání (Martin 23. 10. 2026: „Cesta, po které se
// nechodí, postupně zaroste a zmizí. Platí to pro každou cestu, i upravenou a vozovou, jen pro ty
// pomaleji.“; čísla návrh Clauda): kus cesty (≈ 25 m) má stav 0 až `keep` × `years` × 365,25
// (setiny cest za den × dny); provoz kusu nad `keep` (setiny cest za den) stav doplňuje, pod ním
// ubírá o rozdíl za den. Bez provozu zmizí vyšlapaná za 5 let, upravená (i s hatí a lávkou) za 15,
// vozová za 30; zemská stezka a cesta ve vylepšení nezarůstají
export const ROAD_DECAY = {
  trodden: { keep: 100, years: 5 },
  improved: { keep: 50, years: 15 },
  wagon: { keep: 25, years: 30 },
} as const;
// paths.md – Síť – kotvy, pahýly a úklid (Martin, #6: „Pahýly bez cíle nevznikají, a když po dělení
// a spojování cest nějaký zbude, sloučí se se sousední cestou nebo zmizí.“; číslo návrh Clauda
// 24. 10. 2026): zbytek upravené nebo vozové cesty kratší než `remnantM` s koncem mimo kotvu se
// v úklidu sloučí se sousední cestou (konec u jiné cesty – díra), jinak zmizí; delší zarůstá
// (`ROAD_DECAY`)
export const ROAD_STUB = { remnantM: 30 } as const;
// paths.md – Jednorázová přestavba sítě (Martin 24. 10. 2026, varianta A: „vylepšení se přenesou na
// nové cesty, které vedou zhruba tam, kde staré“; čísla návrh Clauda): vyšlapanost se naseje, jako by
// se po dnešních trasách chodilo `seedDays` dní; nový úsek, jehož aspoň `share` délky leží do `nearM`
// od osy staré upravené cesty (stezky), je upravený s hatí a lávkou (stejně příznak vyježděná
// a průsek); kus staré stezky dál než `nearM` od nové sítě se vrátí; průchodů nejvýš `passes`.
// Vozové cesty (R2): řetěz nové sítě s aspoň `share` délky do `nearM` od staré vozové osy se
// přepočítá jako hotová vozová cesta; souvislý kus staré vozové osy dál než `nearM` od nové sítě
// a aspoň `wagonPatchM` dlouhý (≈ úsek stavby – k okraji mapy, kudy se nechodí) se vrátí
export const ROAD_REBUILD = {
  seedDays: 365,
  nearM: 4,
  share: 0.6,
  passes: 4,
  wagonPatchM: 60,
} as const;
// wagons.md – Vozová síť a vyjeté cesty (Martin, 19. 10. 2026: „Vozy mohou cestu vyjezdit, ale
// nemají takovou prostupnost jako lidé … ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset
// vyjezdit serpentiny.“; čísla návrh Clauda – rešerše fáze 1 je ověří): sklon ve směru jízdy nad
// `maxGrade` vůz nevyjede, pod ním stoupání zdražuje se čtvercem (`gradeCost` při mezi – nejlevnější
// stoupání je polovina meze, proto serpentiny); rychlost podle povrchu a cesty – CART_SPEED, brod
// pomalu (`fordCost` m za metr, i pod hatí – lávka je jen pro pěší). Vůz je široký `widthM` –
// kolem domů a plotů se vejde jen tam, kde je místo. Dvoukolák zatočí na krok mřížky o 2 směry ze
// 16 (≤ 53°, poloměr ≈ 4–5 m), čtyřkolák o 1 (≤ 27°, ≈ 8–11 m); každá změna směru trochu stojí
// (`turnCost` m za směr).
// oxen.md – Co nejdelší brázda (Martin, 19. 10. 2026: „Volské spřežení chce rýt co nejdelší
// brázdu – otáčení zabírá čas a snižuje produktivitu.“; čísla návrh Clauda podle rešerše):
// voli s rádlem jdou ≈ 0,64 m/s (pokusy s tažnými voly v Burkině Faso a Etiopii); obrat na
// souvrati ≈ 45 s (vytáhnout rádlo, otočit pár, zarovnat – měření pro voly rešerše nenašla,
// traktory jsou jinde); výkon 0,3 ha za den (PLOUGH_HA_PER_DAY) platí pro brázdu 100 m – kratší
// brázda víc obratů, delší (středověká brázda „furlong“ ≈ 200 m) nejvýš o 15 % víc
export const FURROW = { speedMps: 0.64, turnS: 45, referenceM: 100, maxGain: 1.15 } as const;
// oxen.md – Co nejdelší brázda (Martin, 19. 10. 2026: „na místo se dostane ideálně po nějaké už
// hotové cestě“; návrh Clauda): spřežení jde ráno z ohrady k bloku a večer zpět vozovou sítí jako
// dvoukolák bez nákladu ≈ 0,8 m/s po louce (cesta rychleji); orá se ≈ 6 h denně – cesta
// k bloku (výjezd z ohrady nebo přesun k dalšímu bloku; návrat večer je zadarmo) ubírá orbě dne
// poměrný díl (nejvýš polovinu)
export const TEAM_TRAVEL = { speedMps: 0.8, dayS: 6 * 3600, maxShare: 0.5 } as const;
export const CART_ROUTES = {
  maxGrade: 0.1,
  gradeCost: 4,
  fordCost: 3,
  widthM: 2.5,
  turnSteps: { 'two-wheel': 2, 'four-wheel': 1 },
  turnCost: 1.5,
  /** Hledání končí za takovou cenou (m chůze volů po louce) – dál vůz nevozí. */
  maxCost: 4000,
} as const;
// wagons.md – Vozová síť – rychlosti (Martin, 19. 10. 2026: souhlas s odstupňováním podle druhu
// cesty „jako u chůze“; čísla návrh Clauda): rychlost vozu proti louce (cena buňky = 1 / rychlost)
// – louka, úhor a příloh 1, strniště 0,8, zoraný díl 0,6, mokřina bez cesty 0,55 (bahno);
// vyšlapaná cesta 1,3, vyježděná (vyšlapaná s příznakem vozová) 1,6, upravená 1,8, hať 1,8 i přes
// mokřinu; vyšlapaná, vyježděná i upravená cesta přes mokřinu jako mokřina bez cesty. Na poli
// platí nejpomalejší z povrchu a dílu; pod pevnou cestou jen cesta
// roads.md – Vozová cesta (Martin, 20. 10. 2026: „Ta bude vozu dávat ještě větší rychlost, bude
// mít vyježděné, ale zpevněné koleje.“; číslo návrh Clauda, schváleno): vozová cesta 2,2 i přes
// mokřinu (zpevněné koleje drží jako hať), brod zůstává brodem (`CART_ROUTES.fordCost`)
// wagons.md – Vůz přes zaseté pole (Martin, 23. 10. 2026: „Vůz smí přes zaseté pole“; čísla návrh
// Clauda): osetý díl je pro vůz průjezdný, ale metr stojí jako 8 m louky (rychlost 0,125) – vůz ho
// vezme, jen když jiná cesta není (objížďka až 8× delší); ztráta úrody viz CART_TRAMPLE
export const CART_SPEED = {
  stubble: 0.8,
  ploughed: 0.6,
  wet: 0.55,
  sown: 0.125,
  road: { trodden: 1.3, cart: 1.6, improved: 1.8, wagon: 2.2 },
} as const;
// wagons.md – Vůz přes zaseté pole (návrh Clauda): stopa vozu přes osetý díl je široká `trackM`
// a jede se tam i zpět (2 průjezdy na jízdu); úroda na pošlapané ploše je pryč celá (`lossShare`
// 1); pošlapaná plocha dílu se nuluje po sklizni
export const CART_TRAMPLE = {
  trackM: 2,
  passesPerTrip: 2,
  lossShare: 1,
} as const;
// paths.md – Kudy (návrh Clauda, Úloha 2): zvyk – místo bez vyšlapané pěšiny stojí pro výběr trasy
// o `offRoad` (25 %) víc, plně vyšlapané nic; čas chůze se počítá skutečnými rychlostmi
export const ROUTE_HABIT = { offRoad: 0.25 } as const;
// paths.md – Vyšlapanost a vznik cesty (návrh Clauda, Úloha 3a): číslo na políčko `cellM` (7,5 m)
// v setinách cesty – trasa přidá své cesty za den, tráva ubere `regrowPerDay` (1 cesta), mezi 0
// a `max` (1 500 cest); cesta vznikne od `roadAt` (1 000), prodlouží se, kudy je aspoň `extendFrom`
// (500), pěšina je vidět od `visibleFrom` (50); jízda vozu za `cartWeight` cesty. Stará ves dostane
// podél loňských úseků nad prahem `seed` (500 – polovina prahu; paths.md – Převod starých vsí, bod 3)
export const WEAR = {
  cellM: 7.5,
  regrowPerDay: 100,
  max: 150_000,
  roadAt: 100_000,
  extendFrom: 50_000,
  visibleFrom: 5_000,
  cartWeight: 2,
  seed: 50_000,
} as const;
// paths.md – Síť – kotvy (návrh Clauda, Úloha 5): cesta smí končit do `entranceM` (3 m) od vchodu
// stavby, do `goalM` (7,5 m) od konce trasy k cíli bez vchodu (voda, dřevo, pole, sad, louka,
// pastva) a v pásu kraje mapy (`EDGE_MARGIN_M` + `TRAIL.edgeBandM` + `goalM` od okraje – tam končí
// cesty k sousedům)
export const ROAD_ANCHORS = { entranceM: 3, goalM: 7.5 } as const;
// paths.md – Vchody (Martin, #6: „ke každé stavbě, kam se chodí, vede cesta až k jejímu vchodu,
// i když se tam chodí málo, třeba k hřbitovu jen na pohřby.“; návrh Clauda): vchod má cestu, když
// do `ROAD_ANCHORS.entranceM` od něj končí nebo vede pevná cesta; cesta k vchodu je nejméně
// `minM` dlouhá (krátká spojka k cestě, která jde kolem)
export const ROAD_ACCESS = { minM: 3 } as const;
// paths.md – Křižovatky (Martin, #6, pravidlo 9; návrh Clauda, Úloha 9a): vchod `entranceWidths`
// (1,5) × šířka nejširší přicházející cesty od středu; posledních `bendM` (12 m) osy se ohne do
// vchodu obloukem s body po `bendStepM` (1 m); natočení a rozevření Y po `rotationStepDeg` (5°),
// β z `spreadDeg` (30–60°); uzel s 5+ cestami = dvě křižovatky `pairM` (10 m) od sebe; znamení
// strom 40 %, vztyčený kámen 30 %, dřevěný kůl 30 % ze `landmarkLooks` (2) podob, `landmarkGapM`
// (1,5 m) za vchody v nejširší mezeře mezi rameny; dvě křižovatky nejméně dosah plácku jedné +
// dosah druhé + `spacingReserveM` (1 m) od sebe – dosah je kružnice opsaná obrysu (vchod a půl
// šířky nejširší cesty; paths.md – Křižovatky, Rozestup, návrh Clauda 24. 10. 2026)
export const JUNCTION = {
  entranceWidths: 1.5,
  bendM: 12,
  bendStepM: 1,
  rotationStepDeg: 5,
  spreadDeg: [30, 60],
  pairM: 10,
  landmark: { tree: 0.4, stone: 0.3, post: 0.3 },
  landmarkLooks: 2,
  landmarkGapM: 1.5,
  spacingReserveM: 1,
  // přídavek k rozestupu při odsunutí (m) – středy na cm i po zaokrouhlení nad rozestupem
  spacingTieM: 0.02,
  // nejmenší vzdálenost nového konce osy od sousedního bodu osy (m) při posunu křižovatky
  spacingStepM: 1,
} as const;
// wagons.md – Vyjeté cesty (návrh Clauda): úsek, kudy vozy dva roky po sobě jezdí aspoň
// `tripsPerDay` jízd denně (roční průměr – ≈ 90 jízd za rok), se stane vozovou cestou; vozová cesta,
// kudy 5 let po sobě jezdí pod polovinou, je zas jen pěší (zaroste podle provozu lidí)
export const CART_ROADS = {
  tripsPerDay: 0.25,
  years: 2,
  dropYears: 5,
  dropShare: 0.5,
} as const;
// roads.md – Stromy u pevných cest (Martin: napřed keř, stojí, dokud samy neodumřou; čísla návrh
// Clauda): místa po 12–20 m střídavě po stranách 2,5–4 m od osy, stromy nejméně 8 m od sebe;
// uchycení 10 % ročně na volném místě u cesty starší 5 let; polovina dubů, zbytek jilmy a topoly;
// keř 8 let, pak mladý strom 30 % velikosti, plná velikost ve 40 letech; kládu při stavbě dá
// strom od 20 let (mladší je mladý stromek); život topol 60–100, jilm 100–200, dub 200–400 let,
// pak souš 10 let a pařez 10 let
export const ROAD_TREES = {
  spacingM: { from: 12, to: 20 },
  offsetM: { from: 2.5, to: 4 },
  gapM: 8,
  rootAfterYears: 5,
  rootChancePerYear: 0.1,
  speciesShare: { oak: 0.5, elm: 0.28 },
  shrubYears: 8,
  youngScale: 0.3,
  fullYears: 40,
  logFromYears: 20,
  lifeYears: {
    poplar: { from: 60, to: 100 },
    elm: { from: 100, to: 200 },
    oak: { from: 200, to: 400 },
  },
  snagYears: 10,
  stumpYears: 10,
} as const;
// roads.md – Vylepšení cesty (návrh Clauda, schváleno 18. 10. 2026): upravená cesta 15 člověkodní
// na 100 m; hať 1 strom a 2 člověkodny na 2 m mokřiny; lávka přes brod 4 stromy a 15 člověkodní
export const ROAD_UPGRADES = {
  improvedManDaysPer100M: 15,
  causewayPer2M: { trees: 1, manDays: 2 },
  footbridge: { trees: 4, manDays: 15 },
} as const;
/**
 * roads.md – Postupná úprava a serpentiny (návrh Clauda, schválený Martinem 24. 10. 2026): zpevnění
 * kolejí a pláně stojí 0,3 čd/m; vozová cesta vzniká jen na upravené cestě, která už zpevnění za
 * `improvedManDaysPer100M` má, takže `WAGON_ROAD.pavingPerM` je doplatek 0,3 − 0,15 = 0,15 čd/m.
 */
const PAVING_FULL_PER_M = 0.3;

/**
 * roads.md – Vozová cesta (Martin, 20. 10. 2026: „tato cesta spojí dva body, které spojuje stará
 * cesta pro pěší, ale co nejvíc přímo tak, aby vůz projel. Pokud budou překážet svahy, vyhloubí se
 * úvoz nebo udělá násep. Samozřejmě, některé svahy budou tak velké, že se budou muset kombinovat
 * serpentiny, úvozy a náspy.“; čísla návrh Clauda, schválený 20. 10. 2026 – rešerše
 * research/2026-10-20-earthworks.md):
 * - sklon trasy po úpravě nejvýš `maxGrade` (6 % – přísněji než „žádoucí mez“ 8 % pro povozy
 *   tažené zvířaty, Practical Action: Improving paths and tracks; vůz naložený do kopce i z kopce
 *   s brzděním); úvoz (výkop) a násep zarovnají podélný profil nejvýš o `maxCutM` / `maxFillM` –
 *   kde by bylo potřeba víc, trasa jde jinudy (serpentiny vzniknou samy);
 * - příčný řez: vozovka 2 × `bedHalfM` (3,5 m) a po 1 m krajnice – pláň 2 × `flatHalfM` (5,5 m)
 *   v navržené výšce, svahy výkopu a náspu 1 : 1 (`sideSlope`); u staveb, plotů a vody se terén
 *   neupravuje víc, než se vejde (`clearanceM` – půl metru od nich);
 * - práce: výkop s naložením `digPerM3` (ILO 2002, Best Practice Guide – Labour-based methods,
 *   Table M15: výkop 3,0–3,5 m³ a naložení 8,5 m³ na člověkoden – s dřevěnou rýčí a motykou
 *   ≈ 2 m³), uložení a udusání násypu `placePerM3` (rozhrnutí 13,5 a hutnění 9 m³ za čd), převoz
 *   `haulPerM3` – nošení v koších a na nosítkách o polovinu pomaleji než kolečko (kolečko 8,5 m³
 *   za čd do 20 m, 4,5 m³ do 150 m – Table M7); hlína z úvozu jde přednostně do náspu na téže
 *   cestě, kde je převoz levnější než nová hlína z boku (výkop + krátký převoz + uložení), jinak
 *   se nasype z boku a přebytek výkopu se rozhrne vedle; zpevnění kolejí kamenem a štěrkem
 *   a úprava pláně `pavingPerM` na metr (sběr a donesení kamene 2,5 m³ za čd, ILO Table K2);
 *   kácení jako průsek lesem (ROAD_SWATH, OBSTACLE_COST);
 * - trasa co nejpříměji (Martin, 20. 10. 2026: „Co nejpříměji“ – přímá trasa má přednost, svah se
 *   srovná úvozem nebo náspem do 3 m, oklika nebo serpentina jen tam, kde by bylo potřeba víc):
 *   při hledání stojí každý metr délky navíc `directPerM` čd – víc než metr nejhlubšího úvozu
 *   (pláň 5,5 m a svahy 1 : 1 v hloubce 3 m = 25,5 m³ na metr ≈ 23 čd), takže se trasa svahu
 *   nevyhne, dokud ho jde srovnat; jen pro výběr trasy, cena v panelu je skutečná práce. Mezi
 *   trasami stejné délky rozhodne práce stavby a čas jízdy vozem po `trafficYears` let provozu
 *   podle loňských jízd cesty (`Road.cartTraffic`, nejméně `minTripsPerDay`): den vozky
 *   `dayHours` h, vůz po louce TEAM_TRAVEL.speedMps;
 * - zatáčení: čtyřkolák s otočnou přední nápravou a spřežením zatočí na poloměru ≈ 6–8 m – na
 *   mřížce terénu pěšin ze 16 směrů o `turnSteps` směry na krok (vozová síť po louce počítá
 *   opatrněji o jeden – cart.ts); úvrať serpentiny tak vyjde ≈ 15 m široká;
 * - stavba po úsecích ≈ `pieceM` od vsi ven, hotový úsek je hned cesta; profil po `profileStepM`.
 */
export const WAGON_ROAD = {
  maxGrade: 0.06,
  maxCutM: 3,
  maxFillM: 3,
  bedHalfM: 1.75,
  flatHalfM: 2.75,
  sideSlope: 1,
  clearanceM: 0.5,
  digPerM3: 0.5,
  placePerM3: 0.2,
  haulPerM3: { base: 0.15, per100M: 0.15 },
  pavingPerM: PAVING_FULL_PER_M - ROAD_UPGRADES.improvedManDaysPer100M / 100,
  directPerM: 25,
  trafficYears: 10,
  minTripsPerDay: 0.05,
  dayHours: 10,
  turnSteps: 2,
  pieceM: 60,
  profileStepM: 2,
  /** Brod nové osy do této vzdálenosti od brodu staré cesty je týž brod (lávka tam už stojí). */
  oldFordMatchM: 8,
  /** Zbytek staré cesty zanikne, je-li aspoň tento podíl jeho délky souběžný s obejitým kusem či hotovou částí. */
  bypassShare: 0.8,
} as const;
/**
 * roads.md – Vozová cesta, narovnání (Martin, 22. 10. 2026, #6: „Narovná se jen tam, kde pěší cesta
 * kličkovala do svahu, pokud to jde, a obejitý kus staré cesty zaroste.“; čísla návrh Clauda):
 * kličkující kus osy je nejvýš `maxM` m dlouhý, aspoň `ratio`× delší než tětiva mezi jeho konci
 * a jeho konce se liší výškou aspoň o `climbM` m. Nahradí se tětivou, když profil po ní stojí méně
 * práce než po staré ose, nebo stará osa nejde vůbec.
 */
export const WAGON_STRAIGHTEN = { ratio: 1.3, climbM: 3, maxM: 120 } as const;
/**
 * roads.md – Postupná úprava a serpentiny (Martin, 24. 10. 2026: „Zemská stezka na sever nejde
 * upravit pro vozy s tím, že je pro vůz moc prudká, ale přesně tohle by ta úprava cesty pro vozy
 * vyřešit.“ a „Návrhy k cestám schvaluji“; čísla návrh Clauda): kde profil po staré ose nevyjde
 * nebo pláň a zemní práce zasáhnou posvátný strom, hledá se objížďka v oknech ±`windowsM` m po
 * staré ose kolem místa selhání (do stran stejně daleko) a vezme se nejlevnější hotový plán;
 * nejvýš `maxDetours` míst selhání za sebou. Hledání v okně má mez `maxLabels` štítků (paměť
 * v prohlížeči ≈ 13 MB, čas ≈ 0,1–0,3 s) – objížďka, která se do ní nevejde, se nenajde.
 * Všechna hledání jednoho plánu (okna × místa selhání) sdílejí rozpočet `totalLabels` štítků –
 * podle počtu, ne času, takže server i prohlížeč skončí na témže místě; po vyčerpání se další
 * okna nezkoušejí a plán skončí bez objížďky (moc prudká / posvátný strom). `sacredFailM`:
 * selhání profilu do tolika metrů od buňky u posvátného stromu je důvodem strom (ne strmost).
 */
export const WAGON_DETOUR = {
  windowsM: [60, 120, 200],
  maxDetours: 4,
  maxLabels: 250_000,
  totalLabels: 600_000,
  sacredFailM: 10,
} as const;
/**
 * roads.md a fields.md – Cesta ubírá poli plochu (Martin, 19. 10. 2026: „Ano má. Ono to stejně ve
 * výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout
 * takový růžek…“; čísla návrh Clauda): pás pevné cesty v šířce obtisku (vyšlapaná 1,9 m, vyježděná
 * 2,6 m, upravená a hať 3 m, vozová cesta 3,5 m) a obrys křižovatky (pásy ramen a střed mezi nimi –
 * paths.md, Křižovatky) se neorou.
 * Kus pole, který cesty oddělí od zbytku, se obdělává, jen když se do něj vejde obrat spřežení
 * (kruh o poloměru ≈ 5 m – plocha `cornerMinM2`) a není to jen proužek užší než `stripMinM` podél
 * cesty – jinak zůstane loukou (mez u cesty). Počítá se po buňkách `cells` × `cells` na čtverec.
 */
export const ROAD_LAND = {
  widthM: { trodden: 1.9, cart: 2.6, improved: 3, wagon: 3.5 },
  turnRadiusM: 5,
  cornerMinM2: 80,
  stripMinM: 3,
  cells: 30,
} as const;
/**
 * roads.md – Průsek lesem a trade.md – Zemská stezka (Martin, 19. 10. 2026: „Tam, kde zemská
 * stezka prochází lesem, ať se les vykácí.“; čísla návrh Clauda): kde upravená cesta nebo stezka
 * vede lesem (i lemem do 6 m před ním), vykácí se pruh `halfM` od osy na každou stranu – pás
 * upravené cesty 3 m a 2 m z každé strany, ať se vůz i lidé vejdou a nejdou pod větvemi. V pásu
 * cesty (`roadbedM` od osy) se vyklučí i pařezy a vyberou kameny, po stranách zůstanou pařezy.
 */
export const ROAD_SWATH = { halfM: 3.5, roadbedM: 1.5 } as const;
// roads.md – Vysazení jabloní (Martin; čísla návrh Clauda): podél úseku po obou stranách po 10 m
// střídavě (2,6–3,4 m od osy), jabloně nejméně 8 m od sebe a 6 m od stromu u cesty; jako sad na
// strom – ≈ 180 stromů na hektar (výsadba 80 čd/ha ≈ 0,45 čd na strom, péče a sklizeň jako v sadu,
// plná úroda ≈ 17 kg na strom), plody od 6. roku, život ≈ 60 let; souš pak stojí 10 let
export const ROAD_APPLES = {
  spacingM: 10,
  offsetM: { from: 2.6, to: 3.4 },
  gapM: 8,
  treeClearM: 6,
  treesPerHa: 180,
  snagYears: 10,
  logFromYears: 20,
} as const;
// roads.md – Rychlejší chůze (Martin 19. 10. 2026: „stálá vyšlapaná cesta 1.5“, „Upravená cesta:
// 1.7“): rychlost chůze proti louce – stálá vyšlapaná i vyježděná cesta 1,5×, upravená 1,7×, hať
// a lávka 1,7× i přes mokřinu (návrh Clauda); mokřina bez cesty i po vyšlapané či upravené cestě
// 0,5× (bahno); brod + 30 m (zout se, přebrodit), po lávce bez zdržení. Pevná cesta přes pole jde
// rychlostí cesty (pás cesty se neorá – roads.md, Cesta přes pole)
// Vozová cesta (roads.md – Vozová cesta; návrh Clauda, schváleno 20. 10. 2026) pěšky 1,7 jako
// upravená, v mokřině drží jako hať (zpevněné koleje), brod zůstává brodem (+ 30 m)
export const ROAD_WALK = {
  speed: { trodden: 1.5, improved: 1.7, wagon: 1.7 },
  wetSpeed: 0.5,
  causewayWetSpeed: 1.7,
  fordExtraM: 30,
} as const;
/**
 * roads.md – Stromy u cesty zrychlí chůzi (Martin 20. 10. 2026: „Stromy u cesty musí přídat něco
 * málo k rychlosti jak chodců tak vozů. šlo by přidat třeba 0.03? A pokud to budou jabloně,
 * přidalo by se 0.05.“; podrobnosti návrh Clauda): úsek pevné cesty, který po celé délce lemují
 * stromy, má rychlost chůze i jízdy vozem o `trees` vyšší (přičte se k rychlosti cesty – vyšlapaná
 * pěšky 1,5 → 1,53, vyježděná vozem 1,6 → 1,63), s jabloněmi o `apples`; úměrně podílu délky,
 * který lemují (jabloně, kde jsou, jinde ostatní stromy), po `steps` dílech (10 %). V mokřině
 * a na brodu se nepřičte. Místo na strom lemuje osu na každou stranu k polovině vzdálenosti
 * k sousednímu místu, nejvýš `reachM` – polovina největšího rozestupu míst (stromy 20 m, jabloně
 * 10 m) + 1 m posun místa podél osy; krajní místo úseku až ke konci osy, když je konec do `endM`
 * – rozestup + 6 m od konce, kam se stromy nesázejí, + 1 m
 */
export const ROAD_TREE_SPEED = {
  trees: 0.03,
  apples: 0.05,
  steps: 10,
  reachM: { trees: 11, apples: 6 },
  endM: { trees: 27, apples: 17 },
} as const;
// trade.md – Zemská stezka (návrh Clauda): trasa od dvorce ke kraji mapy nejlevnější chůzí po
// terénu pěšin (svahy, brody, les, překážky) – cíl do TRAIL.edgeBandM od kraje schůdné krajiny
// v rozmezí ±coneDeg od směru (když tudy cesta nevede, ±wideConeDeg); po pevné cestě poloviční
// cena chůze jako v síti pěšin (trasa se k ní stáhne a vede po ní)
export const TRAIL = { coneDeg: 22.5, wideConeDeg: 45, edgeBandM: 20, roadDiscount: 0.5 } as const;
