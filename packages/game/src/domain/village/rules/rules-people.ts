// Lidé, populace, štěstí, posvátná místa, hřbitov a společná práce vsi (část rozdělených pravidel, rozcestník je rules.ts).

import type { Bounds, DwellingType, GraveRank, MoundSize } from '../types';

// population.md – Pojmy (tabulka obydlí: kapacita, cena, životnost), Chátrání a přestavba (opravy, dětská úmrtnost)
// Životnost zemnice 18 let (oprava podle rešerše, bylo 15): potřeba oprav roste s (věk / životnost)²,
// takže se s životností sama roztáhne – roční potřeba na konci zůstává 15, za celý život 90
// člověkodní (bylo 75).
// population.md – Prázdné obydlí (Martin, 18. 10. 2026: neobydlené budovy chátrají rychleji; čísla
// návrh Clauda): prázdnému obydlí ubývá k chátrání podle stáří pevný podíl stavu, aby nové spadlo
// z plného stavu na nulu za `emptyLifespanYears` (dřív jen bez oprav: zemnice ≈ 16, polozemnice
// ≈ 26 let).
export const DWELLINGS = {
  zemnice: {
    capacity: 6,
    cost: 60,
    lifespanYears: 18,
    repairAtEndOfLifePerYear: 15, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 1,
    emptyLifespanYears: 5,
  },
  polozemnice: {
    capacity: 8,
    cost: 220,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 17, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 0.8,
    emptyLifespanYears: 8,
  },
  // log-house.md – Dům (tabulka – návrh Clauda, Martin 12. 11. 2026: „Takhle je to asi ok“):
  // srub bez kmenů v zemi vydrží déle, je sušší a prostornější; opravy jako polozemnice
  // (návrh Clauda)
  srub: {
    capacity: 8,
    cost: 300,
    lifespanYears: 35,
    repairAtEndOfLifePerYear: 17,
    childDeathFactor: 0.7,
    emptyLifespanYears: 12,
  },
  // log-house.md – Dům s vypletenými stěnami od roku 750 (tabulka – návrh Clauda, Martin
  // 14. 11. 2026: „Ano“): kůly v zemi hnijí dřív než srub, ale mazanice je sušší než polozemnice;
  // opravy jako polozemnice (návrh Clauda)
  vypleteny: {
    capacity: 8,
    cost: 260,
    lifespanYears: 25,
    repairAtEndOfLifePerYear: 17,
    childDeathFactor: 0.75,
    emptyLifespanYears: 10,
  },
  // trade.md – Dvorec vojvody (návrh Clauda, schváleno 18. 10. 2026): delší a vyšší polozemnice,
  // kapacita 10, cena a dřevo jako polozemnice × 1,5 (opravy taky × 1,5), jinak jako polozemnice
  dvorec: {
    capacity: 10,
    cost: 330,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 25.5,
    childDeathFactor: 0.8,
    emptyLifespanYears: 8,
  },
  // log-house.md – Dvorec od roku 800 (tabulka – návrh Clauda, Martin: „Takhle je to asi ok“):
  // nadzemní srub se síní a komorou, větší než jakýkoli jiný dům; opravy jako dvorec (návrh
  // Clauda)
  'dvorec-srub': {
    capacity: 12,
    cost: 450,
    lifespanYears: 35,
    repairAtEndOfLifePerYear: 25.5,
    childDeathFactor: 0.7,
    emptyLifespanYears: 12,
  },
} as const;
// log-house.md – Dům (Martin 12. 11. 2026: „měl by být dostupný cca od roku 800“): nadzemní dům
// jde stavět od 1. 1. 800 a dvorec postavený nebo přestavěný od té doby je nadzemní srub
export const LOG_HOUSE = { fromYear: 800 } as const;
// log-house.md – Dům s vypletenými stěnami od roku 750 (Martin 14. 11. 2026: „Nadzemní dům
// s vypletenými stěnami může být od roku 750“)
export const WATTLE_HOUSE = { fromYear: 750 } as const;
// log-house.md – Dům s vypletenými stěnami, Kdo kde bydlí (Martin 14. 11. 2026: „sám pochopíš, jak
// se domy kvalitativně liší“): pořadí kvality srub > vypletený dům > polozemnice > zemnice – elita
// se stěhuje do lepšího nadzemního domu. Dvorec se nepočítá (0) – synové vojvody z něj odcházejí
// do vlastního domu jako z kteréhokoli jiného obydlí.
export const DWELLING_QUALITY: Readonly<Record<DwellingType, number>> = {
  zemnice: 1,
  polozemnice: 2,
  vypleteny: 3,
  srub: 4,
  dvorec: 0,
  'dvorec-srub': 0,
};
// trade.md – Dvorec vojvody: cena a dřevo dvorce = polozemnice × MANOR.costFactor; pozemek dvou
// políček (dům a dvůr) se hledá při přestavbě jako u polozemnice do PLOT_RELOCATION_M
export const MANOR = { costFactor: 1.5 } as const;
// population.md – Nové obydlí (obyvatelé staví vždy lepší obydlí); log-house.md – Dům (Martin):
// na nadzemní dům vesničané nepřestavují, dosloužilý nadzemní dům se přestaví zase na nadzemní
// (vypletený na vypletený – log-house.md – Dům s vypletenými stěnami)
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
  vypleteny: 'vypleteny',
  srub: 'srub',
  dvorec: 'dvorec',
  'dvorec-srub': 'dvorec-srub',
};
// population.md – Pojmy a Práce (věkové hranice, pracovní síla – Martin 19. 10. 2026: na polích
// a stavbách jen dospělí; výrostci 7–13 let pasou, starší kryjí `elder` čd denní minimum své
// domácnosti), Růst populace (porody od 16 let – oprava podle rešerše, dospělý pro práci
// a odemčení zůstává 14–44); START_AGES: Založení vsi (4 lidé)
export const AGE = { olderChild: 7, adult: 14, fertile: 16, elder: 45 } as const;
export const LABOR_PER_DAY = { adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
// kinship.md – Pohlaví (návrh Clauda): zakladatelé jsou dva páry – muž a žena 25 let (manželé)
// a chlapec 13 a dívka 12 let (nepříbuzní, rodiče neznámí – vezmou se, až dorostou); pohlaví
// v pořadí START_AGES
export const START_SEXES = ['male', 'female', 'male', 'female'] as const;
// population.md – Růst populace (porodnost podle věku ženy a rozestup porodů – rešerše
// research/2026-10-19-population-growth.md, návrh Clauda 19. 10. 2026; dřív 1/3 porodu ročně
// v každém věku a bez rozestupu): přirozená manželská plodnost (Coale a Trussell 1974 – Henryho
// průměr 13 populací bez plánování rodiny; 16–19 let ≈ 0,9 × 20–24 kvůli nižší plodnosti
// dospívajících) × MARITAL_FERTILITY_LEVEL – manželská plodnost 20–44 let ≈ 7,5 dítěte jako ve
// středoevropských vsích před plánováním rodiny (Henryho průměr ≈ 8,9). Porody na vdanou ženu za
// rok od věku `fromAge` do dalšího pásma, od AGE.elder žádné.
const NATURAL_MARITAL_FERTILITY = [
  { fromAge: 16, perYear: 0.41 },
  { fromAge: 20, perYear: 0.46 },
  { fromAge: 25, perYear: 0.431 },
  { fromAge: 30, perYear: 0.395 },
  { fromAge: 35, perYear: 0.322 },
  { fromAge: 40, perYear: 0.167 },
] as const;
const MARITAL_FERTILITY_LEVEL = 0.85;
// Rozestup porodů: po porodu nejdřív za 21 měsíců (9 měsíců těhotenství + rok neplodnosti při
// kojení – kojilo se 2–3 roky), po svatbě za 9 měsíců (těhotenství); mezitím žena nerodí, potom
// rodí s denní šancí, při které průměrný odstup porodů vyjde 1 / plodnost věku (při 20–24 letech
// ≈ 31 měsíců – Macfarlane 2002: 24–39 měsíců).
export const BIRTH_SPACING = { afterBirthDays: 639, afterWeddingDays: 274 } as const;
const CHILD_DEATH_BEFORE_ADULT = 0.4; // → ročně 1 − 0,6^(1/14)
export const ADULT_DEATHS_PER_YEAR = 0.02; // oprava podle rešerše (bylo 0,015; Lahovice)
export const ELDER_DEATHS_PER_YEAR = 0.08;
// population.md – Růst populace (přeplněnost)
export const CROWDED_BIRTH_FACTOR = 0.3;
export const CROWDED_DEATH_FACTOR = 1.5;
export const LUCKY_YEARS = 30;
export const LUCKY_CHILD_DEATH_FACTOR = 0.5;
// population.md – Růst populace (hlad tlumí porody podle energie, ne pestrosti – Martin, 25. 10. 2026 –
// a zvyšuje úmrtnost); fields.md – Zásoby a nasycení
export const HUNGER = { birthsStopAt: 0.5, birthsFullAt: 0.95, deathExtraAtZero: 3 } as const;
// population.md – Hlad a vymření (Martin, 18. 10. 2026; čísla návrh Clauda): nahromaděný hlad
// vsi ve „dnech bez jídla“ – pod `fedFrom` přibude za den (fedFrom − nasycení) / fedFrom (bez
// jídla den, při 80 % ≈ 0,11), od `fedFrom` (90 %) ubude recoveryPerDay (do nuly) – jedna hranice,
// žádné pásmo, kde by hlad stál. Víc než maxDays nemá vliv. V hájení má skupina nejvýš práh − luckyMarginDays (dospělí
// 19, děti a starší 11), aby po jeho konci lidé umírali postupně. Denní riziko úmrtí hladem je 0
// do prahu `threshold` a pak strmě roste ((hlad − práh) / (jistá smrt − práh))^curve až
// k jistotě v `certainDeath` – bez jídla vymřou do 60 dní všichni (děti a starší do 45).
export const STARVATION = {
  fedFrom: 0.9,
  recoveryPerDay: 1,
  maxDays: 60,
  luckyMarginDays: 1,
  threshold: { child: 12, adult: 20, elder: 12 },
  certainDeath: { child: 45, adult: 60, elder: 45 },
  curve: 3,
} as const;
// kinship.md – Pohlaví (návrh Clauda): chlapců se rodí 105 na 100 dívek; rodit může žena 16–44
// s manželem, muž je plodný od 16 let bez horní meze (AGE.fertile, AGE.elder)
export const BOY_SHARE = 105 / 205;
// kinship.md – Sňatky (návrh Clauda): věkový rozdíl snoubenců nejvýš 15 let, když je jeden z nich
// vdovec nebo vdova (už má děti), nejvýš 20 let (Martin, 19. 10. 2026: „Vdova by se měla snažit co
// nejdříve vdát, ideálně ve vesnici.“ – vdovec si bral mladší ženu, mladý muž se přiženil
// k vdově). Z okolí (Martin – varianta c, čísla návrh Clauda): svobodný muž od 18 let bez možné
// nevěsty ve vsi si přivede ženu (16–22 let, starší muž nejvýš o povolený rozdíl mladší, ale do
// 44 let) s pravděpodobností 30 % ročně. Ke svobodné ženě od 18 let bez možného ženicha ve vsi se
// přižení muž z okolí (o 2 roky mladší až o 8 let starší, od 18 let) s 10 % ročně, nebo se s 20 %
// ročně vdá pryč; k vdově, dědičce, která drží dům, nebo k ženě z domu bez mužů se přižení
// s 50 % ročně a pryč se nevdává (Martin, 19. 10. 2026: „aby se populace co nejvíce rozrůstala“ –
// dřív 30 % ročně jen pryč).
export const MARRIAGE = {
  maxAgeGapYears: 15,
  maxAgeGapWidowedYears: 20,
  outsideFromAge: 18,
  brideAge: { from: 16, to: 22 },
  groomAge: { below: 2, above: 8 },
  outside: { bridePerYear: 0.3, groomPerYear: 0.1, awayPerYear: 0.2, favouredGroomPerYear: 0.5 },
} as const;
// kinship.md – Sňatky čekají na zásoby (Martin 27. 10. 2026: „Ano“ – návrh Clauda): dokud výhled
// zásob z pole k příští sklizni nedosáhne pojistky (0,5 roční potřeby, v paměti hladu 0,75), čeká
// každá svatba – ve vsi, z okolí i další manželka muže rodu – navíc průměrně `waitYears` × (1 −
// naplnění pojistky) let (exponenciálně, los dne): při prázdných zásobách ≈ 3 roky, v půli pojistky
// ≈ 1,5 roku. Sňatky se zpomalí, nikdy nezastaví – ves, která pojistku nikdy nemá, nevymře. Číslo
// návrh Clauda: v raně novověké Evropě se sňatky v krizových letech odkládaly o 1–3 roky
// (Malthusova „preventivní brzda“, evropský sňatkový vzorec – Hajnal 1965; po krizi se dohnaly).
export const MARRIAGE_STORES = {
  waitYears: 3,
} as const;
// kinship.md – Sňatky z okolí (návrh Clauda, kvůli válce – war.md): nevěsta z okolí si pamatuje,
// ze které sousední vsi přišla, a dcera, kam se vdala – směr je los z osmi sousedů
export const NEIGHBOR_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
// fields.md – Práce (denní minimum domácností – meze: s hrnčířem 0,45); population.md – Práce
export const DAILY_MIN_PER_HOUSEHOLD: Bounds = { worst: 0.5, best: 0.45 };
/**
 * paths.md – Pochůzky pro vodu, population.md – Práce (Martin 19. 10. 2026: „Ale vesničané tam
 * přece musí chodit nějak pro vodu a musí jim to zabírat čas.“): pro vodu se chodí vždy
 * k nejbližší vodě, `tripsPerPerson` cesty (tam a zpět) na člověka domácnosti a den – i v síti
 * pěšin. Chůze nad `includedM` je v ceně denního minima (návrh Clauda – WHO: voda do 100 m nebo
 * 5 minut sběru je „intermediate access“, Howard a Bartram 2003, Domestic Water Quantity, Service
 * Level and Health, WHO/SDE/WSH/03.02); co je dál, přičte se k dennímu minimu domácnosti: cesty ×
 * 2 × (chůze − `includedM`) ÷ `speedMps` ÷ `dayHours` h. Rychlost po louce tam a zpět s vodou
 * 1 m/s (návrh Clauda: pohodlná chůze po rovině 1,3–1,4 m/s – Bohannon 1997, Age and Ageing 26;
 * WHO tamtéž: voda do 1 000 m nebo 30 minut sběru tam a zpět ≈ 1,1 m/s i s čerpáním; s plnými
 * nádobami po louce pomaleji). Den 10 h – stejný přepočet jako rešerše 2026-10-17 (FAO: 2 h nošení
 * vody a dříví denně ≈ část denního minima).
 */
export const WATER_FETCHING = {
  tripsPerPerson: 0.4,
  includedM: 100,
  speedMps: 1,
  dayHours: 10,
} as const;
/**
 * population.md – Skladba dne podle ročního období (Martin 9. 11. 2026: „zatím co v létě byli
 * všichni co nejdéle venku a o žnách sklízeli obilí, za zimních večerů předli, tkali…“; čísla
 * návrh Clauda): hodiny venkovní práce dospělého v polovině měsíce (leden … prosinec) – světlý den
 * v Čechách (50° s. š., východ až západ slunce v polovině měsíce ≈ 8,5 / 10 / 11,8 / 13,6 / 15,2 /
 * 16,2 / 15,8 / 14,4 / 12,6 / 10,9 / 9,2 / 8,2 h) bez jídla a přestávek (v zimě ≈ 1–1,5 h, v létě
 * ≈ 2–2,5 h s polední přestávkou), nejvýš 14 h – prosinec–leden 7 h, listopad a únor 8–8,5 h,
 * březen a září 10–11 h, květen 13 h, červen–srpen 13–14 h. Mezi polovinami měsíců lineárně
 * (`daylightFactor` – bez skoku 1. dne v měsíci, plán i práce dne z téže funkce). Den venkovní
 * práce dá (hodiny ÷ `referenceHours`) člověkodne – sazby prací na hektar vznikly z měření po
 * hodinách přepočtených na 10 h (rešerše 2026-10-17), proto se nemění.
 */
export const DAYLIGHT_WORK = {
  hours: [7, 8.5, 10, 11.5, 13, 14, 14, 13, 11, 9.5, 8, 7],
  referenceHours: 10,
} as const;
/**
 * population.md – Skladba dne podle ročního období (Martin 9. 11. 2026: „V té době se omezuje
 * i vaření“, „v zimě se nosí dřevo – pokud je sníh, voda se nosit nemusí“; čísla návrh Clauda):
 * - ve žňový den (`harvestHandsDay`) se vaří méně – denní minimum domácnosti ×
 *   `harvestMinimumShare` – a voda se nosí na pole, ne domů: přirážka za chůzi pro vodu se
 *   nepočítá (nosí ji děti a pomocníci se žní; zásobu domů nanosila volná práce předem);
 * - v topné sezóně (`heatingMonths`, listopad–březen) se nosí dříví na topení – `woodTrips` cest
 *   (tam a zpět) na domácnost a den k okraji lesa (`Dwelling.forestWalkM`; ohniště zemnice spálí
 *   v zimě ≈ 15–25 kg dříví denně, otep klestí na zádech ≈ 20–30 kg), prvních
 *   WATER_FETCHING.includedM v ceně minima, chůze a den jako u vody;
 * - když leží sníh (`snowCover` ≥ `snowLies` – týž výpočet jako scéna), voda se nenosí – rozpouští
 *   se sníh, potok je zamrzlý.
 */
export const DAY_CHORES = {
  harvestMinimumShare: 0.5,
  heatingMonths: [11, 12, 1, 2, 3],
  woodTrips: 1,
  snowLies: 0.5,
} as const;
// population.md – Práce (domácí výroba – obstarají ji z většiny ženy bokem, z práce vsi nebere:
// Martin 19. 10. 2026; čísla jen pro postavy žen u domů – labor-report.ts); oděv z vlny a lnu
// – praní, česání, předení, tkaní a šití – je její součástí (diet.md – Oděv: vlna ≈ 21 čd na
// dospělého a rok z 55 čd `perPerson`), stříž ovcí taky
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.15 } as const;
// population.md – Nové obydlí (společná práce za posledních 30 dní pro „má na to“)
export const COMMON_LABOR_HISTORY_DAYS = 30;
// population.md – Chátrání a přestavba (oprava podle hlášení Martina 18. 10. 2026): přestavba na
// lepší obydlí podle ročního průměru společné práce – klouzavý (exponenciální) průměr s časovou
// konstantou jednoho roku, aby výmlat v zimě ani žně ves nezchudly
export const COMMON_LABOR_YEAR_DAYS = 365;
// population.md – Chátrání a přestavba, Po zániku (Martin 18. 10. 2026, číslo návrh Clauda): zbytek
// jámy po zaniklém obydlí (zarostlá prohlubeň s kopřivami a pár trámy) zarůstá ≈ 10 let, pak zmizí
export const RUIN_YEARS = 10;
// cemetery.md – Pravidla (stavba: vytyčení a ohrazení 10 člověkodní na čtverec; hrob i s uličkami
// 4 m², na čtverec 15 × 15 m se vejde 56 míst na hroby)
// Plot podle délky (cemetery.md – Plot hřbitova podle délky; Martin 22. 10. 2026, issue #3, návrh
// Claude): plot je 3 z 10 člověkodní čtverce (`fenceShare` 0,3 – jako oprava plotu, abandonment.md),
// platí se jen za nové vnější strany; vytyčení a hroby platí každý čtverec.
export const CEMETERY = {
  costPerSquare: 10,
  fenceShare: 0.3,
  graveM2: 4,
  gravesPerSquare: 56,
} as const;
// cemetery.md – Mohyly podle významu (Martin 19. 10. 2026: „Významnější lidé budou mít větší
// mohyly a na prominentnějších místech… Největší mohyly bude mít vojvodova rodina.“; velikosti
// „Ano, udělej to tak.“): místa na hroby ve čtverci po řadách 7 × 8 (= CEMETERY.gravesPerSquare)
// s okrajem 0,5 m od plotu (plot stojí 1,5 m uvnitř čtverce – `CEMETERY_FENCE_INSET_M`, tedy hroby
// 2 m od okraje čtverce a místo na hrob je menší, ale míst zůstává 56 – Martin 23. 10. 2026:
// „kapacita na čtverec zůstane“); mohyla zabere `MOUND_SIZES` míst – 2 × 2 (`great`), 2 místa za sebou
// (`large`), 1 (`normal`), 1 malá (`small`).
// Plot hřbitova i ohrady stojí o tolik uvnitř čtverce (m) – ulička 3 m mezi hřbitovem a sousední
// stavbou (cemetery.md – Plot hřbitova, oxen.md – Ohrady jsou menší než čtverec; Martin 23. 10. 2026,
// platí i pro hřbitov); `PEN_FENCE_INSET_M` (rules-buildings.ts) je totéž číslo.
export const CEMETERY_FENCE_INSET_M = 1.5;
export const GRAVE_PLACES = {
  columns: 7,
  rows: 8,
  marginM: CEMETERY_FENCE_INSET_M + 0.5,
} as const;
export const MOUND_SIZES = {
  great: { columns: 2, rows: 2 },
  large: { columns: 1, rows: 2 },
  normal: { columns: 1, rows: 1 },
  small: { columns: 1, rows: 1 },
} as const;
// cemetery.md – Mohyly podle významu (návrh Clauda): zasloužilá hlava rodiny = nejstarší muž
// domácnosti (bez muže nejstarší žena) nebo jeho manželka, od 35 let a s dítětem; prominence místa
// = hloubka od branky + 2 × vzdálenost od hlavní osy (m – menší je prominentnější); pruh podél osy
// do 2 m (dvě místa) drží běžní dospělí volný pro velké mohyly, dokud mají místo jinde.
export const GRAVE_RANKS = {
  headMinAgeYears: 35,
  lateralWeight: 2,
  laneHalfWidthM: 2,
  manorFrontM: 4,
} as const;
// cemetery.md – Mohyly podle významu, Vojvodova rodina (Martin 19. 10. 2026: „I ve vojvodově
// rodině jsou významnější a méně významní členové.“): velikost mohyly podle druhu pohřbeného
// a menší náhrady, když se nevejde. Vojvoda a jeho žena 2 × 2 s kůlem, ostatní dospělí z dvorce
// 2 místa (jako hlava rodiny), děti z dvorce běžná mohyla na 1 místo, hlava rodiny 2 místa, ostatní
// dospělí 1, děti 1 malá; `manor` – celá vojvodova rodina podle prvního pravidla (jen staré mohyly)
// a pruh podél osy do `manorFrontM` od branky drží vojvodově rodině, dokud mají hlavy rodin jinde.
export const GRAVE_RANK_MOUNDS: Readonly<Record<GraveRank, readonly MoundSize[]>> = {
  voivode: ['great', 'large', 'normal'],
  'manor-adult': ['large', 'normal'],
  'manor-child': ['normal'],
  manor: ['great', 'large', 'normal'],
  head: ['large', 'normal'],
  adult: ['normal'],
  child: ['small'],
};
// cemetery.md – Hygiena (pohřebiště s volným místem: od nejbližšího obydlí v pořádku od 150 m,
// nejhorší pod 50 m; od vody v pořádku od 100 m, nejhorší pod 30 m; mezi tím plynule, násobí se)
export const CEMETERY_DISTANCE_M = {
  dwelling: { worst: 50, ok: 150 },
  water: { worst: 30, ok: 100 },
} as const;
// cemetery.md – Vliv na úmrtnost (roční riziko × 1 + extra × (1 − hygiena); hájení chrání)
export const HYGIENE_DEATH_EXTRA = { child: 0.5, adult: 0.3, elder: 0.3 } as const;
// population.md – Kronika (ves drží posledních 500 událostí, starší se zahazují)
export const CHRONICLE_MAX_EVENTS = 500;
// absence.md – Upozornění vsi do kroniky (návrh Clauda: trvalý stav kratší než 7 dní se do kroniky
// nezapíše a přerušení kratší než 7 dní ho neukončí)
export const NOTICE_CHRONICLE_MIN_DAYS = 7;

// population.md – Růst populace (roční úmrtnost dětí: za AGE.adult let vymře CHILD_DEATH_BEFORE_ADULT dětí)
/** Roční úmrtnost dětí – za AGE.adult let vymře CHILD_DEATH_BEFORE_ADULT dětí. */
export function childDeathsPerYear(): number {
  return 1 - (1 - CHILD_DEATH_BEFORE_ADULT) ** (1 / AGE.adult);
}

// population.md – Růst populace (porodnost podle věku ženy, NATURAL_MARITAL_FERTILITY)
/** Porody na vdanou ženu věku `age` za rok (0 mimo 16–44 let). */
export function maritalFertility(age: number): number {
  if (age < AGE.fertile || age >= AGE.elder) return 0;
  let perYear = 0;
  for (const band of NATURAL_MARITAL_FERTILITY) if (age >= band.fromAge) perYear = band.perYear;
  return perYear * MARITAL_FERTILITY_LEVEL;
}

// happiness.md – Štěstí (Martin 18. 10. 2026; čísla návrh Clauda): číslo 0–100, výchozí 50,
// k cílové hodnotě se posouvá o 10 % rozdílu za měsíc (simulace po dnech: denní podíl tak, aby
// za 1/12 roku ubylo 10 % rozdílu).
export const HAPPINESS = {
  start: 50,
  min: 0,
  max: 100,
  base: 50,
  monthlyShare: 0.1,
} as const;
// happiness.md – Co ubírá: hlad (nasycení pod 0,9 ubere až 40, lineárně k nulovému nasycení),
// úmrtí za poslední rok (max(0,5; 5 − 0,06 × věk v letech) za každého, dohromady nejvýš −20; Martin
// 24. 10. 2026: čím starší zemřelý, tím míň ubere; událost bez věku – dítě 5, dospělý a starší 3), přeplněnost (podíl
// lidí v přeplněných domácnostech × 15), dřina (podíl dní za posledních 60, kdy ves nestíhala
// polní práce v období, × 15)
export const HAPPINESS_PENALTY = {
  hungerFrom: 0.9,
  hungerMax: 40,
  deathPointsAtBirth: 5,
  deathPointsPerYear: 0.06,
  deathPointsMin: 0.5,
  /** Záloha pro události kroniky bez věku (starší uložené vsi). */
  deathPoints: { child: 5, adult: 3, elder: 3 },
  deathsMax: 20,
  deathsWindowDays: 365,
  crowdingMax: 15,
  toilMax: 15,
  toilWindowDays: 60,
} as const;
// happiness.md – Co přidává: zásoby na víc než rok +5, posvátná místa dohromady nejvýš +40
export const HAPPINESS_BONUS = { storesYears: 1, stores: 5, sacredMax: 40 } as const;
// happiness.md – Účinek na práci (Martin – „nechme to tak, doladíme později“): veškerá práce vsi
// se násobí – štěstí 0 → × 0,8, 50 → × 1, 100 → × 1,1, mezi tím lineárně
export const HAPPINESS_LABOR = { atMin: 0.8, atBase: 1, atMax: 1.1 } as const;

// happiness.md – Posvátná místa: posvátný dub podle stáří (`SACRED_OAK_HAPPINESS`, nejvýš 3 duby
// – ty, které přidávají nejvíc), dubový háj +10 a +1 za každé 2 duby nad 6, nejvýš +15 za háj
// (nejvýš 2 háje); pod korunou dubu na poli se neoseje ≈ 50 m²
export const SACRED_OAK = { counted: 3, crownM2: 50 } as const;
// happiness.md – Posvátný dub – stáří a štěstí (Martin 18. 10. 2026: „čím jsou starší, tím víc
// štěstí přidávají. Nejmladší 1, nejstarší 10.“): živý dub stáří `youngYears` přidá `young`,
// stáří `oldYears` (nejvyšší možná délka života) `old`; mezi tím podle logaritmu stáří, na celé
// body (návrh Clauda – každé zdvojnásobení stáří přidá stejně, ≈ 2,4 bodu: 200 let 2, 400 let 4,
// 600 let 6, 1000 let 8, 1400 let 9; lineárně by 200 a 600 let dalo 1 a 3). Posvátná souš
// (uschlý dub) přidá `snag` (návrh Clauda), padlá souš nic.
export const SACRED_OAK_HAPPINESS = {
  youngYears: 150,
  oldYears: 2000,
  young: 1,
  old: 10,
  snag: 1,
} as const;
// happiness.md – Posvátný dub – délka života (Martin 18. 10. 2026: „mohou stářím uschnout, ale ať
// je to variabilní … ať se ty nejstarší mohly dožít až 2000 let“; rozdělení návrh Clauda):
// délka života = `minYears` + (`maxYears` − `minYears`) × B, kde B je `rank`. nejmenší z `draws`
// náhodných čísel (rozdělení Beta(2, 4)) – ≈ 81 % dubů se dožije 800–1400 let (nejčastěji
// ≈ 1100, průměr 1200), ≈ 19 % déle, přes 1700 let ≈ 1,6 % a 2000 let nikdo nepřekročí. Uschne
// v létě, když přijde sucho (některý z `death.days` dní od 1. `death.month` – červen až srpen);
// souš stojí `snagYears` let (rovnoměrně) a padne v kterýkoli den roku. Náhoda je z id a polohy
// dubu ve vrstvě – stejný dub má stejný život v každé vsi.
export const SACRED_OAK_LIFE = {
  minYears: 800,
  maxYears: 2000,
  draws: 5,
  rank: 2,
  death: { month: 6, days: 92 },
  snagYears: [50, 100],
} as const;
export const GROVE = {
  minOaks: 6,
  radiusM: 25,
  happiness: 10,
  oaksPerPoint: 2,
  maxHappiness: 15,
  counted: 2,
} as const;
// happiness.md – Posvátný dub (definice – rozhodnutí kontroléru při implementaci, 18. 10. 2026):
// velký = horní třetina velikosti dospělých dubů vrstvy překážek (velikost = výška modelu ×
// měřítko, výšky modelů `OAK_MODEL_HEIGHT_M` z GLB); nestojí v souvislém lese = do
// `solitaryRadiusM` od něj roste nejvýš `solitaryMaxTrees` jiných dospělých stromů (v lese jich
// bývá 10–20, u osamělých dubů v loukách 0–4).
export const SACRED_OAK_DEFINITION = {
  topShare: 1 / 3,
  solitaryRadiusM: 15,
  solitaryMaxTrees: 5,
} as const;
/** Výška modelů dubů (m, z GLB v `public/models/trees`) – velikost dubu = výška × měřítko. */
export const OAK_MODEL_HEIGHT_M: Record<string, number> = {
  'oak-1': 16.95,
  'oak-2': 15.55,
  'oak-large-1': 20.7,
  'oak-large-2': 17.33,
  'oak-large-3': 22.09,
};
// happiness.md – Co hráč vidí (stáří posvátného dubu – Martin 18. 10. 2026, rozpětí návrh
// Clauda): stáří dubu ke dni začátku světa (1. 1. 500) lineárně podle jeho velikosti (výška
// modelu × měřítko) – nejmenší posvátný dub (`minSizeM` ≈ práh horní třetiny dubů vrstvy, na
// skutečných krajinách 17,65–17,76 m) `minYears`, největší (`maxSizeM` = oak-large-3 × 1,2)
// `maxYears`, mimo rozpětí oříznuté; k tomu herní roky od začátku světa. 150 let ≈ mohutný
// dospělý solitérní dub (obvod ≈ 3 m), od 400 let je dub „starobylý“ (Woodland Trust – Ancient
// Tree Inventory, průvodce dubem; dub běžně žije ≈ 600 let, výjimečně 1000).
export const OAK_AGE = { minSizeM: 17.7, maxSizeM: 26.5, minYears: 150, maxYears: 400 } as const;
// happiness.md – Dubový háj (definice – rozhodnutí kontroléru při implementaci, 18. 10. 2026):
// les vrstvy překážek je z třetiny dubový, takže aspoň 6 dubů v okruhu 25 m má skoro každé
// místo lesa – háj je proto místo, kde duby převažují: aspoň `GROVE.minOaks` dospělých dubů
// v okruhu `GROVE.radiusM` a duby tvoří aspoň `oakShare` dospělých stromů v tom okruhu (≈ 7–12
// hájů na krajinu, 2–4 do 600 m od vsi). Střed háje je dub v lese (ne osamělý); háje se
// nepřekrývají (středy aspoň 2 × poloměr od sebe). Čtverce háje = políčka se středem do
// poloměru od středu háje, na kterých roste aspoň jeden dospělý strom.
export const GROVE_DEFINITION = { oakShare: 0.65 } as const;
// happiness.md – Dřevěná modla: půdorys 4 × 4 m na louce, 30 člověkodní a 1 dospělý dub, +8
// (nejvýš 2 modly); Svatyně: půdorys 30 × 30 m na louce, převýšení nejvýš 1 m, 400 člověkodní
// a 3 dospělé duby, +25, jedna na ves
export const SACRED_BUILDINGS = {
  idol: {
    footprintM: 4,
    laborManDays: 30,
    oaks: 1,
    happiness: 8,
    counted: 2,
    maxHeightDiffM: null,
  },
  shrine: {
    footprintM: 30,
    laborManDays: 400,
    oaks: 3,
    happiness: 25,
    counted: 1,
    maxHeightDiffM: 1,
  },
} as const;
