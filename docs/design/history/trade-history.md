# trade – historie (neplatné sekce)

Sem patří části [trade.md](../trade.md), které přestaly platit; zachované doslova. **Nic z tohoto textu neplatí** – platný stav je v trade.md.

## Sousedé (bez simulace – varianta a)

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

- V každém z 8 směrů je soused s **povahou** určenou deterministicky ze seedu světa a směru
  (návrh Clauda): 2–3 druhy zboží **nabízí** (přebytek – levně), 2–3 **shání** (dražší).
  Zboží souseda: obilí, maso, sýr, luštěniny, dobytek (kusy), klády, kámen (od 8. 11. 2026), keramika, hřivny (od 20. 10.
  2026 místo nástrojů – [Hřivny místo nástrojů](#hřivny-místo-nástrojů-20-10-2026)), uhlí –
  jen to, co má i ves (Martin 19. 10. 2026, viz [Jen společné suroviny](#jen-společné-suroviny)).
  ~~a **zboží zvenku**: **sůl, železo, med, kožešiny**~~ (zrušeno 19. 10. 2026).
- **Čím se soused živí** (návrh Clauda, 19. 10. 2026): obilnáři, pastevci, lesní ves, řemeslníci –
  podle toho nabízí a shání (tabulka v Jen společné suroviny). Kolem vsi je každý druh dvakrát.
- Zásoby souseda: každého nabízeného zboží má na rok omezené množství (doplní se 1. 11.);
  poptávka je taky omezená (kolik toho za rok vezme).
- Jméno souseda (vsi) navrhne hra (`suggestVillageName`), vojvoda zatím nemá tvář.

## Obchod se sousedy

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

- **Výměnou, ne za peníze** (návrh Clauda). Každé zboží má hodnotu v kg obilí: obilí 1,
  luštěniny 1, maso 3, sýr 4, keramika 3, uhlí 0,5, hřivny 45 (kg), kráva 600, kláda 40 (kus), kámen 60 (m³) –
  rešerše
  [2026-10-18-trade-values.md](research/2026-10-18-trade-values.md) (návrh Clauda). Soused
  bere s přirážkou **≈ 20 %**; co shání, za to dá o ≈ 20 % víc, co nabízí, dá o ≈ 20 % levněji.
- **Doprava:** zboží nesou lidé po stezce – **≈ 25 kg na člověka a cestu** (dobytek se žene);
  cesta tam a zpět trvá **2–6 dní** podle délky stezky (+ cesta za krajem mapy 1 den). Práce
  nosičů = lidé × dny – od 19. 10. 2026 vlastní podíl práce vsi hned po denním minimu (viz Jak je
  postavené – Doprava); zboží dorazí, až se nosiči vrátí.
- **Panel obchodu** (dvorec, po dostavění stezky): soused (jméno, směr), ikony zboží – co dáš,
  co dostaneš, posuvníky, bilance hodnoty (musí být ≥ 0 pro souseda), cena v práci a dny cesty.
  Potvrdit → výprava vyrazí. Jedna výprava na souseda naráz.
- **Ve scéně:** nosiči odejdou po stezce ke kraji mapy a vrátí se s nákladem (postavy jako
  ostatní – `villager-plan`) – od 19. 10. 2026 jako karavana (viz Jak je postavené – Ve scéně).
- ~~**Zboží zvenku ve vsi** (návrh Clauda): sůl, železo, med, kožešiny jsou zásoby v horní liště
  (ikony – jen když nějaké jsou). **Železo** může kovář použít místo vlastní rudy (dnes jen
  bahenní ruda – [řemesla](crafts.md)). **Med** se jí (energie, štěstí jako ovoce). **Sůl**
  a **kožešiny** zatím přidávají štěstí; sůl později prodlouží trvanlivost masa a sýra.~~
  **Zrušeno 19. 10. 2026** (Martin: „Nech jen společné suroviny, nezaváděj nové.“) – viz
  [Jen společné suroviny](#jen-společné-suroviny).
- Kronika: stezka dostavěna, výprava odešla / vrátila se (co přinesla).
- **Nákup osiva** (Martin 27. 10. 2026: „ok, jak navrhuješ“; pravidla návrh Clauda – [pole](fields.md),
  Osivo pro ves bez zásob): ves bez osiva na nutné díly ho **sama** koupí u sousedů 1. 9. a 1. 3.
  – bez stezky a bez panelu, jako nákup u řemeslníků. Jen chybějící osivo, nejvýš kolik obilí
  sousedé letos ještě mají (zásoba obilí ubude, po zlém roce kraje je menší); platí hřivnami, pak
  kravami nad ty, které ves drží na mléko a voly – jako porážka (chovné krávy a krávy na telata do
  výcviku; změna 2. 11. 2026, návrh Clauda, Martin: „Ostatní jsi rozhodl dobře“ – dřív nad dvě)
  v ceně, za kterou je soused bere (po zlém roce kraje nižší). Obchod hráče se sousedy dál nabízí
  krávy nad chovný pár – o tom rozhoduje hráč. Půjčka osiva
  od pána – otevřená otázka (s vazalstvím).
- **Obilí od správce** (Martin 8. 11. 2026: „A“ – [správce](steward.md), Obilí a lov v nouzi):
  správce vsi pošle výpravu za obilím touž akcí jako hráč, jen když zásoby do žní nestačí; platí
  hřivnami, keramikou, uhlím a kládami, jídlem ani dobytkem ne.

## Jen společné suroviny

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

Stav: **Martin rozhodl 19. 10. 2026** – „Nech jen společné suroviny, nezaváděj nové.“ (upřesnil
variantu „a“: odebrat zboží zvenku). Detaily níž jsou návrh Clauda.

- **Co se mění:** se sousedem se vyměňuje jen to, co ves sama má – obilí, luštěniny, maso, sýr,
  dobytek (od 20. 10. 2026 krávy, mladí a vycvičení voli – [Dobytek ve třech
  druzích](#dobytek-ve-třech-druzích-20-10-2026)), klády, keramika, hřivny (dřív nástroje) a uhlí. Sůl, železo, med a kožešiny zvenku ve hře nejsou:
  nejsou v zásobách vsi ani v horní liště, sůl a kožešiny nepřidávají štěstí a kovář nekuje
  z koupeného železa – železo si taví sám z bahenní rudy, jak rozhodl Martin u
  [řemesel](crafts.md). ~~Med se nejí (strava, osev podle stravy).~~ Od 14. 11. 2026 má ves med
  a kožešiny vlastní ([kůže, kožešiny, med a vosk](hides-honey.md)) – med z klátů jí pevným
  přídělem ([strava](diet.md) – Pojmy), a tak ubírá i podíl jídla z pole ([pole](fields.md) –
  Výhled zásob k sklizni).
- **Čím se soused živí** (návrh Clauda): soused nabízí, co mu jeho hospodaření dává navíc, a shání,
  čeho sám nemá dost. Nabízí 2–3 druhy ze své nabídky (řemeslníci mají jen dva), shání 2–3 druhy –
  jeden vždy, zbytek ze svých potřeb; nabízené a sháněné se nepřekrývají.

  | Soused                        | Nabízí                    | Shání vždy | Shání dál (1–2 z nich)                     |
  | ----------------------------- | ------------------------- | ---------- | ------------------------------------------ |
  | obilnáři z bezlesé roviny     | obilí, luštěniny, dobytek | klády      | maso, sýr, keramika, hřivny, uhlí          |
  | pastevci                      | dobytek, maso, sýr        | obilí      | luštěniny, klády, keramika, hřivny         |
  | lesní ves (dřevaři a uhlíři)  | klády, uhlí, maso         | obilí      | luštěniny, sýr, keramika, hřivny           |
  | řemeslníci (hrnčíři a kováři) | keramika, hřivny          | obilí      | luštěniny, maso, sýr, klády, uhlí, dobytek |

- **Kámen** (Martin 8. 11. 2026: „kámen může být komoditou v obchodě“; druhy sousedů, množství
  a cena návrh Clauda): **lesní ves a řemeslníci kámen nabízejí** (kameníci a lomaři), **obilnáři
  a pastevci z roviny ho shánějí** na hradby a stavby – ves bez lomu si ho tak koupí a ves s lomem
  přebytek prodá. Roční zásoba nebo poptávka 10–40 m³ (los z vlastního proudu souseda, ostatní
  zboží se nemění). Hodnota **60 kg obilí za m³** = lámání 1 čd (`STONE.quarryManDaysPerM3`) +
  dovoz ≈ 0,5 čd, kláda za 1 čd práce má 40; při přirážce 20 % ves za m³ zaplatí 0,96 × 60
  a prodá za 60. Kámen váží 2 500 kg na m³, takže **jede jen na voze** (jako klády, jen 100×
  těžší): výprava s kamenem bez vozu chce 100 nosičů na m³, tedy v praxi nejde. Koupený kámen
  jde na hromadu u cesty (`addStone`), prodaný se bere z hromad (`takeStone`).
- **Kůže, kožešiny, med a vosk** (14. 11. 2026, [kůže, kožešiny, med a vosk](hides-honey.md) –
  Obchod; druhy sousedů, množství a ceny návrh Clauda): ves je má, proto je smí měnit.
  - **Kdo je nabízí a shání:** pastevci a lesní ves je **nabízejí** (maso, kůže a kožešiny z lovu,
    med z brtí), obilnáři a řemeslníci je **shánějí** (kožišnictví, svíčky, sladké pečivo).
    Všechny čtyři druhy jdou stejnou stranou. Roční množství losem z vlastního proudu
    `neighbour-wares:{směr}` (ostatní zboží souseda se nezměnilo – hlídá to otisk sousedů semene 1
    v testu): **kůže 5–20 ks, kožešiny 10–40 ks, med 20–80 kg, vosk 2–8 kg**.
  - **Ceny v kg obilí** (odvozeno od masa 3 a klády 40 = 1 čd práce):

    | Zboží    | Hodnota | Nosnost | Odvození                                                                     |
    | -------- | ------- | ------- | ---------------------------------------------------------------------------- |
    | med      | 6 / kg  | 1 kg    | jediné sladidlo; klát dá ≈ 6 kg ročně, při příděle 0,5 kg na člověka přebývá |
    | vosk     | 30 / kg | 1 kg    | klát dá jen ≈ 0,4 kg ročně a svíčky se bez něj nedají                        |
    | kůže     | 20 / ks | 5 kg    | kůže skotu – 10 h zpracování, jako dvě třetiny kila masa za hodinu práce     |
    | kožešina | 8 / ks  | 1 kg    | zaječí a liščí 1,5 h zpracování, ovčí 3 h                                    |

  - **Kůže jsou jedno zboží v kusech kůže skotu** (návrh Clauda 14. 11. 2026): malé
    kůže (kozí, prasečí) se přepočtou plochou 0,8 / 3 ≈ 0,27 kusu; prodej bere napřed velké kůže,
    pak malé. Popisek řádku v panelu ukáže rozpis (velké a malé kůže).
  - **Kožešiny jsou jedno zboží:** kožešiny z lovu a ovčí dohromady; prodej bere napřed z lovu,
    pak ovčí, koupené se přidají ke kožešinám z lovu.
  - **Kronika** (výprava, směna) píše kůže a kožešiny v kusech, med a vosk v kg.
  - **Starší vsi:** uložený zbytek roku souseda nemá nové druhy, nesedí na jeho povahu
    (`fitsNeighbour`) a při načtení se zahodí – soused dostane plný rok (zásoby i poptávku).
    Výprava na cestě tím není dotčená. Vazalské makrokomodity nové zboží nedostaly – dávky později.
- **Kolem vsi je každý druh souseda dvakrát** (8 směrů, rozdání ze seedu vsi) – každé zboží
  některý soused nabízí a některý shání. Zásoby a poptávka se nemění (600–1 500 a 800–2 000 kg
  obilí ročně, doplnění 1. 11.).
- **Proč druhy, ne náhodný výběr:** bez zboží zvenku by náhodný soused mohl nabízet sýr a shánět
  maso – výměna bez důvodu. Druh dá výměně smysl: ves dá sousedovi svůj přebytek a vezme si,
  čeho má málo. Obilí – nejčastější přebytek vsi – shánějí tři druhy ze čtyř; obilnáři shánějí
  klády, které ves dostane z mýcení lesa pod pole. Nástroje a keramiku nabízejí řemeslníci – ves
  bez vlastního kováře a hrnčíře si tak zvedne produktivitu (meze produktivity, crafts.md).
- **Starší vsi** (při načtení – `withoutForeignGoods`, jednou, idempotentně, před dopočtem):
  - zásoby soli, železa, medu a kožešin **propadnou** bez náhrady (hra ještě neběží ostře) a z
    posledního jídla zmizí podíl medu – jen ve vsi bez zboží vsi; ves se zbožím jí med z klátů
    a podíl jí zůstane (převod běží při každém načtení – návrh Clauda 14. 11. 2026);
  - uložený zbytek roku souseda, který nesedí na jeho novou povahu, se zahodí – soused má do
    1. 11. plné roční zásoby a poptávku;
  - **výprava na cestě, která měla přinést zboží zvenku, se ruší celá: nosiči přinesou zpět, co
    nesli** – ves nic neztratí ani nezíská. Část výměny nejde férově oddělit (soused oceňoval celou
    nabídku dohromady) a zboží, které ves dala, by bez toho propadlo;
  - z kroniky výprav zboží zvenku zmizí.

## Výměna lidí se sousedem

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

Stav: **Martin rozhodl 19. 10. 2026** – „Se sousedem půjde vyměnit i lidi... např. když on jich
bude mít moc a nebude je moci uživit, může jich pár vyměnit s námi za nějaké suroviny a opačně.“
K návrhu doplnil: „Mohou se stěhovat celé rodiny i jen dospělí. Podle toho, co je v nabídce.“ Jsou
to přistěhovalci, se kterými počítala část [Navazuje](#navazuje). Detaily níž jsou návrh Clauda.
Implementace `people-trade.ts` (jádro) a panel obchodu.

**Muži a ženy zvlášť – Martin schválil 19. 10. 2026.** Od souseda přišli dva „dospělí“, pohlaví se
losovalo až při příchodu a byly to dvě ženy – ve vsi pak nebyl nikdo, s kým by založily domácnost,
a nešla postavit dílna. Svobodné muže a ženy proto soused nabízí a shání zvlášť a hráč je zvlášť
objednává i dává:

- pohlaví každého svobodného dospělého souseda se losuje 1 : 1 už v nabídce a poptávce roku –
  los je na konci, takže rodiny a počet dospělých jsou stejné jako dřív (`neighbourPeople`);
- cena stejná pro muže i ženu (360 kg obilí);
- koho ves dá, vybere jádro podle stejných pravidel – svobodné muže a ženy 16–44 zvlášť
  (`emigrantGroups` – rodiny, pak muži, pak ženy);
- starší uložený zbytek roku souseda s dospělými bez pohlaví se převede deterministicky podle
  povahy roku – tolik mužů, kolik jich soused ten rok měl, zbytek ženy (`storedNeighbourPeople`);
  výprava na cestě s dospělými bez pohlaví doběhne a pohlaví se losuje jako dřív
  (`newcomerProfiles`);
- kronika a krátké řádky se nemění („Přišel muž …“, „Přišla žena …“).

- **Lidé souseda na rok obchodu** (od 1. 11.): s pravděpodobností **40 %** má soused lidi navíc,
  které neuživí – 0–2 rodiny s 0–3 dětmi a 0–3 svobodné dospělé (aspoň jednoho člověka); s **30 %**
  lidi shání a vezme 0–2 rodiny a 0–3 dospělé (aspoň jednoho); jinak lidi nemění. Deterministicky
  ze seedu vsi, směru a roku (`neighbourPeople`) – na rozdíl od zboží se rok od roku mění („občas“).
  Kdo dá lidi, ten je ten rok nevezme, a naopak. Co ves vezme nebo dá, soused do konce roku odepíše.
- **Co se mění:** **rodina** = muž, žena a jejich svobodné děti; **svobodný muž** a **svobodná
  žena** 16–44 let bez manžela (zvlášť – viz výš).
- **Cena** (v kg obilí jako zboží): dospělý **360 kg** (≈ dvouletá spotřeba jídla – 2 × 180 kg),
  dítě do 14 let **polovina**. Přirážky jako u zboží: za naše lidi soused připíše plnou hodnotu,
  svoje prodá za 0,96 hodnoty – rodina souseda se dvěma dětmi stojí 3 × 360 × 0,96 ≈ 1 037 kg.
  Lidé a zboží se mísí v jedné výměně (rodina za obilí, dospělý za nástroje…).
- **Lidé k nám** přijdou s návratem výpravy po stezce:
  - rodiče dospělých jsou neznámí (s lidmi vsi nepříbuzní), děti mají rodiče z rodiny, všichni
    nesou `origin` = směr souseda ([příbuzenství](kinship.md), [válka](war.md));
  - rodina souseda: muž 24–38 let, žena o 0–6 let mladší (aspoň 18 let + 3 roky na každé dítě),
    nejmladší dítě 0–2 roky, mezi dětmi 2–3 roky; svobodný dospělý 16–26 let, muž nebo žena půl
    na půl (los ze seedu vsi a id výpravy);
  - **rodina** jde do prázdného obydlí; když žádné není, do domu s nejvíc volnými místy – smí ho
    dočasně přeplnit. Muž přišlé rodiny je pak ženatý muž bez rodičů v domě, takže podle pravidla
    dědice smí do nového domu (lidé k osídlení – [příbuzenství](kinship.md), Domácnosti): v domě
    s dědicem vždy. V domě bez ženatého syna ale zůstává nejstarší ženatý muž – kdyby byl starší
    přišlý, oddělí se domácí rodina (do nového domu odejde stejně jedna rodina). Proto rodina
    nejde do **dvorce vojvody**, pokud může jinam (odstěhovat by se mohla vojvodova rodina),
    a řemeslné dílny jsou až nakonec. **Ověřeno testem:** rodina v plném domě přidá jednu
    domácnost k osídlení a je mezi rodinami, které se smí oddělit;
  - **svobodný dospělý** jde do obydleného domu s nejvíc volnými místy (dílny až nakonec) a vezme
    se podle pravidel sňatků (ve vsi, nebo z okolí);
  - kronika „Ze severu přišla rodina – 4 lidé.“ a krátký řádek „Přišla rodina ze severu“ /
    „Přišel muž …“ / „Přišla žena …“ (jen fakt).
- **Lidé od nás:** hráč zvolí počet rodin, mužů a žen, koho přesně, vybere jádro deterministicky
  (`emigrantGroups`):
  - nejdřív rodiny, pak muži, pak ženy, každá další skupina z vsi bez předchozích, vždy **z nejvíc
    přeplněného domu**;
  - **nikdy dědic domu** (rodinu vybírají pravidla domácností – dědic a jeho rodiče zůstávají;
    svobodný dědic neplodných rodičů také), **vojvodova domácnost** (nikdo z dvorce – rod hráče)
    ani **nikdo, bez koho by se domácnost rozpadla** (`householdBreaksUp`); svobodný dospělý dům
    nevyprázdní a vdova s malými dětmi nejde;
  - výběr je postupný – prvních n skupin je pro každé větší n stejných, takže panel ukáže přesně,
    kolik soused za lidi připíše;
  - odejdou **hned s výpravou**; v rodokmenu zůstanou jako odešlí ve směru souseda (`emigrants`),
    dokud ve vsi žije jejich rodič, sourozenec nebo dítě – kvůli válce (příbuzní ve vsi souseda);
  - kronika výpravy: „… nesou 100 kg obilí; odchází s nimi 1 rodina, 2 muži a 1 žena.“
- **Doprava:** lidé jdou s výpravou, nic nenesou a nosiče nepotřebují – výprava jen s lidmi má
  jednoho průvodce (nosiči aspoň 1). Děti jdou s rodiči, do nosičů ani práce se nepočítají a cestu
  neprodlužují. Jedna výprava na souseda naráz platí dál.
- **Panel obchodu:** řádky rodiny (ikona muže, ženy a dítěte), svobodného muže a svobodné ženy
  (ikony vesničana a vesničanky) na straně „dáš“, když je soused shání (nejvýš kolik vezme a kolik
  ves smí dát), a na straně „dostaneš“, když je nabízí; popisek „Soused nabízí / shání – …“ a cena.
  Výprava na cestě ukáže i lidi.
- **Starší vsi:** zbytek roku souseda uložený dřív lidi nemá – platí celý rok podle povahy;
  výprava na cestě bez lidí se vrátí beze změny.

## Hřivny místo nástrojů (obchod a nákup u souseda)

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

Martin (20. 10. 2026, [výrobní řetězy](production-chains.md) – Kovář): kovář vytaví houbu
a překove ji na hřivny, „ze kterých může vyrábět nástroje nebo mohou jít na obchod“; „V liště
jenom hřivny“.

- **Zboží `ironBars` – „Hřivny“** nahrazuje nástroje všude: v povaze sousedů (řemeslníci hřivny
  nabízejí, obilnáři, pastevci a lesní ves je shánějí – na místě nástrojů, takže ostatní zboží
  sousedů zůstalo, jak bylo), v hodnotách, zásobách a poptávce sousedů, výpravách a kronice.
- **Hodnota 45 kg obilí za kg** (návrh Clauda): nástroje 60 bez kování (15 % práce a 5 % uhlí)
  ÷ 1,2 kg hřiven na kg nástrojů ≈ 47; železo z rešerše
  [2026-10-18-trade-values.md](research/2026-10-18-trade-values.md) 30–60.
- Ves prodává hřivny ze zásoby kovárny (kovář drží zásobu na rok obnovy vybavení a pak ji doplní
  tavbou); koupené hřivny jdou do zásoby – kovář z nich kove nástroje a kování k vozům.
- **Nástroje nejsou zboží obchodu** – jsou vybavení domácností. Ves bez kováře si je dál kupuje
  sama u kováře souseda ([Nákup u sousedů](crafts.md#nákup-u-sousedů), cena 60 × 0,96 – nástroje
  jdou do vybavení).
- **Starší vsi** (návrh Clauda): při načtení se nástroje ve zbytku roku sousedů, ve výpravách na
  cestě a v kronice výprav převedou na hřivny (kg ÷ 1,2, na celé kg; `withIronBarsTrade` – před
  `withoutForeignGoods`, ať zbytek roku souseda sedí na jeho povahu); výprava na cestě přinese
  hřivny. Jednou, idempotentně.

## Dobytek ve třech druzích (obchod)

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v trade.md:

Martin, 20. 10. 2026 (k otázce, jak zvětšit stádo krav – „Dejme možnost 1.“, cíl krav podle volů,
viz [strava](diet.md) – Krávy na obměnu volů): „**s dobytkem by také mělo jít obchodovat.
Představuju si tři kategorie - krávy, mladé voly (musí se vycvičit) a vycvičené voly**“.
Podrobnosti níž jsou návrh Clauda. Implementace `cattle-trade.ts` (jádro) a panel obchodu.

- **Tři druhy místo jednoho „dobytka“** (`CattleGood`):
  - **krávy** (`cows`) – jdou do stáda skotu a potřebují místo v **ohradě skotu** (krávy stojí na noc
    jen v ohradě – [orba](oxen.md), Ohrady podle druhu); ves je prodá ze stáda, chovný pár zůstane
    (2 krávy jako dřív);
  - **mladí voli** (`youngOxen`) – tele před výcvikem; jde do **ohrady volů** a výcvik trvá 2 roky od
    příchodu, pak táhne a slouží 10 let; ves prodá voly ve výcviku – napřed ty, které výcvik čeká
    nejdéle;
  - **vycvičení voli** (`trainedOxen`) – jdou do ohrady volů a **táhnou hned**; mají za sebou
    **3 roky služby** (zbývá jim 7 z 10 – `CATTLE_TRADE.servedYears`); ves prodá vycvičené voly
    doma (ne ty, kteří táhnou vůz výpravy na cestě), mimo posledních 2 let služby – dosluhujícího
    vola soused nekoupí; napřed ty, kteří slouží nejdéle.
- **Místa:** krávy jen do volných míst hotových ohrad skotu – a nejvýš tolik, kolik se jich i s jarními
  telaty vejde do ohrady skotu a k domům (oxen.md – Stáda podle práce na seč; 1. 11. by je ves nad
  to porazila) –, voli do volných míst ohrad volů –
  mladí i vycvičení sdílejí místa (6 na čtverec), bez dobytka, který výpravy na cestě teprve
  přivedou, a bez volů bez ohrady. Jinak výměna nejde: „**Tolik krav se do ohrady skotu
  nevejde.**“ / „**Tolik volů se do ohrady volů nevejde.**“ Kdo se po návratu nevejde (místa
  mezitím zabral výcvik telat), zůstane bez ohrady a přejde do ní, až se místo uvolní (jako voli
  osadníků – [migrace](migration.md), Vůz při odchodu).
- **Voli od souseda a výcvik:** voli, které výprava teprve přivede, se počítají do volů, se kterými
  ves při výcviku počítá, a do míst ohrad – výcvik pro ně telata nebere. **Pár bez rádla:** když
  ves s koupenými voly má pár k orbě (páry, které chce – [orba](oxen.md), Kolik volů ves chce), na
  který rádlo chybí, vesničané ho vyrobí i bez výcviku (1 strom, 5 čd), jinak by koupený pár nikdy
  neoral.
- **Ceny** (v kg obilí – rešerše `research/2026-10-20-cattle-trade.md`): kráva **600** (beze
  změny), mladý vůl **350**, vycvičený vůl **1 200**. Vycvičený vůl stál v raném středověku asi dvě
  krávy (Lex Ribuaria: vůl 2, kráva 1 solidus; v Anglii 14. století vůl ≈ 13 s., kráva ≈ 9–10 s.),
  roček v saském kapituláři z roku 797 solidus. Rozdíl mladého a vycvičeného vola ≈ 2 zimy sena
  (≈ 1,8 t) a práce výcviku. Přirážky jako u ostatního zboží (soused prodá za 0,96 hodnoty).
- **Doprava:** dobytek **jde po svých s honákem** – jako lidé ve výměně lidí nepotřebuje nosiče;
  honák (jeden na 10 kusů, `TRADE.headsPerDrover`) je člověk výpravy – počítá se do lidí výpravy
  a do práce. Krávy i voli dohromady.
- **Kdo dobytek nabízí a shání** (podle povahy souseda – `NEIGHBOURS.cattleKinds`): dobytek je
  v povaze souseda dál jedno zboží a podle druhu souseda se rozloží:

  | Soused     | Dobytek                                                           |
  | ---------- | ----------------------------------------------------------------- |
  | pastevci   | **nabízejí vždy** krávy, mladé i vycvičené voly (navíc k losu)    |
  | obilnáři   | nabízejí krávy a mladé voly (vycvičené potřebují na orbu sami)    |
  | řemeslníci | shánějí krávy, mladé i vycvičené voly (tažné voly na svoz, mléko) |
  | lesní ves  | dobytek nemá                                                      |

  Roční množství každého druhu v hodnotě 600–1 500 kg obilí (nabídka) a 800–2 000 kg (poptávka);
  krávy mají stejný los jako dřív dobytek a ostatní druhy vlastní los – **ostatní zboží každého
  souseda je stejné jako dřív** (ověřeno na 2 400 sousedech).

- **Panel obchodu:** tři řádky – krávy (ikona krávy), mladí voli (menší a světlejší vůl – nová
  ikona `young-ox`, `icons.py`) a vycvičení voli (ikona vola); posuvník nejvýš kolik soused má a kolik
  se vejde do ohrady, popisek „Do ohrady skotu / volů se vejde ještě …“.
- **Ve scéně:** dobytek jde v karavaně po stezce po dvou za vozy (tam prodaný, zpátky koupený), za
  ním honák; kreslí ho stádo vsi modelem krávy (vůl o kus větší), před odchodem a po návratu se pase
  u začátku stezky.
- **Starší vsi** (při načtení i na začátku dopočtu – `withCattleKinds`, jednou, idempotentně, před
  `withoutForeignGoods`): dobytek v uloženém zbytku roku sousedů, ve výpravách na cestě a v kronice
  výprav = krávy; zbytek roku souseda dostane druhy dobytka podle dnešní povahy (nové druhy plné
  roční množství), ať ho převod zboží zvenku nezahodí.
