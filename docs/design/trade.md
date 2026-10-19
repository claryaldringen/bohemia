# Dvorec vojvody, zemská stezka a obchod se sousedy

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“; obchod se sousedem bez simulace –
varianta „a“). **Implementace hotová** (18. 10. 2026) – dvorec, zemská stezka, sousedé a obchod;
detaily, které návrh nechal otevřené, v části [Jak je postavené](#jak-je-postavené). **Změna 19. 10. 2026:** obchoduje se jen se surovinami, které má i ves – zboží zvenku (sůl, železo, med,
kožešiny) hra nemá (viz [Jen společné suroviny](#jen-společné-suroviny)); se sousedem jde vyměnit
i lidi – rodiny a svobodné dospělé (viz [Výměna lidí](#výměna-lidí)).

## Proč

Ves má mít svého pána. Martin: „Jedna z obytných staveb by měla být větší a honosnější než
zbylé – to bude obydlí vojvody. Když na něj kliknu, uvidím tam ‚upgrady‘ pro celou vesnici.
Úplně prvním z nich bude možnost vybudovat cestu do některé ze sousedních vesnic (celkem 8
směrů). Pokud vybudujeme cestu do sousední vesnice, budeme s ní moci obchodovat.“ Obchod dá vsi
to, čeho má málo (nástroje a keramika bez vlastních řemeslníků, dobytek, obilí v hladovém roce),
a smysl přebytkům (obilí, sýr, maso, klády po mýcení) – jen se surovinami, které má i ves.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** jedno obydlí vsi je **dvorec vojvody** – větší a honosnější (Martin).
- **Cíl:** klik na dvorec ukáže **vylepšení celé vsi**; první je **zemská stezka** do jednoho
  z 8 směrů (Martin).
- **Cíl:** po stezce ves **obchoduje se sousední vsí** v tom směru (Martin).
- **Cíl:** soused je zatím **bez simulace** (stálá povaha, nabídka a poptávka); až budou skutečné
  vsi NPC vojvodů ([válka](war.md)), obchod převezmou ony (Martin – varianta a).
- **Ne-cíl (teď):** peníze a ceny na trhu, vozy, cla a mýto, obchodníci z daleka, válka o stezku,
  další vylepšení vsi (hradiště, družina, trh – přijdou později do stejného panelu).
- **Ne-cíl (teď):** přistěhovalci – noví lidé do vsi z okolí (rodiny, které se přistěhují).
  Martin (18. 10. 2026): „přistěhovalci budou fungovat na základě obchodu, až ho navrhneme“ –
  přijdou jako součást obchodu a vztahů se sousedy, ne jako samostatná mechanika (viz Navazuje).
  Od 19. 10. 2026 přicházejí přes [výměnu lidí](#výměna-lidí) se sousedem.
- **Anti-cíl:** obchod bez práce a bez času (zboží se teleportuje), nebo nekonečný zdroj (soused
  nemá zásoby bez omezení).

## Dvorec vojvody

- **Kde se vezme** (návrh Clauda): v nové vsi se dvorcem stane první zemnice zakladatelů (bydlí
  v ní vojvodova rodina – s [příbuzenstvím](kinship.md) rodina hlavy rodu); ve stávající vsi
  nejstarší obydlí. Když dvorec dožije, obyvatelé ho přestaví na **dvorec** (nový typ obydlí).
- **Dvorec** (nový typ obydlí – návrh Clauda): delší a vyšší polozemnice / dům se zdobenými
  štíty (vyřezávané konce střešních trámů – koňské hlavy), větší pozemek (2 políčka) s plotem
  a branou, kapacita 10 lidí. Cena a dřevo jako polozemnice × 1,5. Jeden na ves.
- Vojvoda může v dvorci bydlet i ve zemnici (na začátku) – vylepšení vsi jdou odtud vždy.
- Panel výběru dvorce: obyvatelé jako u obydlí + **vylepšení vsi** (ikony, cena v popisku,
  zašedlé s důvodem – jako v 0 A.D.).

## Zemská stezka (první vylepšení)

- Hráč zvolí **směr** (8 šipek – S, SV, V, JV, J, JZ, Z, SZ). Stezka vede od dvorce ke kraji
  mapy v tom směru – trasu najde síť cest (nejlevnější chůze, brody, svahy), osa se uloží.
- Stavba = pevná cesta stupně **upravená** po celé délce ([roads.md](roads.md) – 15 čd na 100 m),
  plus hať a lávka, kde vede mokřinou nebo přes potok. Kde už pevná cesta je, platí se jen
  vylepšení. Staví se ze společné práce vsi, po úsecích od vsi ven (vytyčení hned).
- Hotová stezka je pevná cesta (nezaroste), stromy u ní rostou jako u ostatních pevných cest.
- **Průsek lesem** (Martin, 19. 10. 2026: „Tam, kde zemská stezka prochází lesem, ať se les
  vykácí.“; podrobnosti návrh Clauda, [roads.md](roads.md) – Průsek lesem): kde stezka vede
  lesem, vykácí se pruh 3,5 m od osy (pás upravené cesty 3 m a 2 m z každé strany). Kácení je
  práce úseku (tabulka překážek, v ceně stezky a v popisku růžice i se stromy v průseku), klády
  za dospělé stromy jdou na hromadu, pařezy po stranách nedorostou. Trasa se vyhne posvátným
  dubům a hájům – průsek by je musel vykácet, a ty se nekácí; kde by jinak stezka nevedla, směr
  nejde.
- Víc stezek = víc sousedů (každá stavba zvlášť).

## Sousedé (bez simulace – varianta a)

- V každém z 8 směrů je soused s **povahou** určenou deterministicky ze seedu světa a směru
  (návrh Clauda): 2–3 druhy zboží **nabízí** (přebytek – levně), 2–3 **shání** (dražší).
  Zboží souseda: obilí, maso, sýr, luštěniny, dobytek (kusy), klády, keramika, nástroje, uhlí –
  jen to, co má i ves (Martin 19. 10. 2026, viz [Jen společné suroviny](#jen-společné-suroviny)).
  ~~a **zboží zvenku**: **sůl, železo, med, kožešiny**~~ (zrušeno 19. 10. 2026).
- **Čím se soused živí** (návrh Clauda, 19. 10. 2026): obilnáři, pastevci, lesní ves, řemeslníci –
  podle toho nabízí a shání (tabulka v Jen společné suroviny). Kolem vsi je každý druh dvakrát.
- Zásoby souseda: každého nabízeného zboží má na rok omezené množství (doplní se 1. 11.);
  poptávka je taky omezená (kolik toho za rok vezme).
- Jméno souseda (vsi) navrhne hra (`suggestVillageName`), vojvoda zatím nemá tvář.

## Obchod

- **Výměnou, ne za peníze** (návrh Clauda). Každé zboží má hodnotu v kg obilí: obilí 1,
  luštěniny 1, maso 3, sýr 4, keramika 3, uhlí 0,5, nástroje 60 (kg), kráva 600, kláda 40 (kus) –
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

## Jen společné suroviny

Stav: **Martin rozhodl 19. 10. 2026** – „Nech jen společné suroviny, nezaváděj nové.“ (upřesnil
variantu „a“: odebrat zboží zvenku). Detaily níž jsou návrh Clauda.

- **Co se mění:** se sousedem se vyměňuje jen to, co ves sama má – obilí, luštěniny, maso, sýr,
  dobytek (krávy), klády, keramika, nástroje a uhlí. Sůl, železo, med a kožešiny ve hře nejsou:
  nejsou v zásobách vsi ani v horní liště, med se nejí (strava, osev podle stravy), sůl
  a kožešiny nepřidávají štěstí a kovář nekuje z koupeného železa – železo si taví sám z bahenní
  rudy, jak rozhodl Martin u [řemesel](crafts.md).
- **Čím se soused živí** (návrh Clauda): soused nabízí, co mu jeho hospodaření dává navíc, a shání,
  čeho sám nemá dost. Nabízí 2–3 druhy ze své nabídky (řemeslníci mají jen dva), shání 2–3 druhy –
  jeden vždy, zbytek ze svých potřeb; nabízené a sháněné se nepřekrývají.

  | Soused                        | Nabízí                    | Shání vždy | Shání dál (1–2 z nich)                     |
  | ----------------------------- | ------------------------- | ---------- | ------------------------------------------ |
  | obilnáři z bezlesé roviny     | obilí, luštěniny, dobytek | klády      | maso, sýr, keramika, nástroje, uhlí        |
  | pastevci                      | dobytek, maso, sýr        | obilí      | luštěniny, klády, keramika, nástroje       |
  | lesní ves (dřevaři a uhlíři)  | klády, uhlí, maso         | obilí      | luštěniny, sýr, keramika, nástroje         |
  | řemeslníci (hrnčíři a kováři) | keramika, nástroje        | obilí      | luštěniny, maso, sýr, klády, uhlí, dobytek |

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
    posledního jídla zmizí podíl medu;
  - uložený zbytek roku souseda, který nesedí na jeho novou povahu, se zahodí – soused má do
    1. 11. plné roční zásoby a poptávku;
  - **výprava na cestě, která měla přinést zboží zvenku, se ruší celá: nosiči přinesou zpět, co
    nesli** – ves nic neztratí ani nezíská. Část výměny nejde férově oddělit (soused oceňoval celou
    nabídku dohromady) a zboží, které ves dala, by bez toho propadlo;
  - z kroniky výprav zboží zvenku zmizí.

## Výměna lidí

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

## Navazuje

- **Přistěhovalci** (Martin, 18. 10. 2026): noví lidé do vsi z okolí přijdou přes obchod
  a vztahy se sousedy (např. rodina, která se se sousedem domluví a přistěhuje) – navrhne se
  spolu s dalším rozvojem obchodu, ne jako samostatná mechanika. Nevěsty z okolí už nesou směr
  souseda (`origin` – [příbuzenství](kinship.md)). **Hotové 19. 10. 2026** jako
  [výměna lidí](#výměna-lidí).
- **Skuteční sousedé:** až budou vsi NPC vojvodů ([válka](war.md)), povahu souseda nahradí jejich
  skutečné zásoby a poptávka; stezka zrychlí přesun vojska.

## Jak je postavené

Návrh Clauda (18. 10. 2026) – detaily, které návrh výš nechal otevřené:

- **Kdo je dvorec:** `VillageState.manorId` (id obydlí = domácnosti). Nová ves – první zemnice
  zakladatelů (`foundVillage`); starší ves – nejstarší obydlí (den dostavění, při shodě nižší
  id), řemeslné dílny až nakonec (`withManor` při načtení, `keepManor` každý den – po zániku
  dvorce nejstarší obydlí). Dvorec je budova: když se vojvodova domácnost přestěhuje, dvorcem
  zůstane dům.
- **Dvorec jako obydlí:** typ `dvorec` – kapacita 10, cena 330 čd a 27 stromů (polozemnice × 1,5),
  opravy na konci životnosti × 1,5 (25,5 čd ročně), životnost a chátrání jako polozemnice. Hráč
  dvorec nestaví (v nabídce staveb není) – dožilý dvorec obyvatelé přestaví vždy na `dvorec`
  (nezastaví je ani nedostatek dřeva, jako u ostatních přestaveb).
- **Pozemek dvou políček:** `DwellingPlot.yard` – dvůr sousedí stranou s políčkem domu, dům stojí
  uprostřed políčka domu vchodem ke dvoru (`yardRotation`), plot obejde obě políčka, brána (2,4 m,
  sloupy s překladem a koňskou hlavou) je na vzdálené straně dvora, záhony jen kolem domu. Při
  přestavbě se hledá nejbližší dvojice volných políček do 50 m (dvůr napřed vpředu, pak vpravo,
  vlevo, vzadu – jako pozemek polozemnice, bez polí a sadů); nenajde-li se, dvorec se přestaví
  na místě se starým pozemkem (nebo bez něj).
- **Model:** srub 4,6 × 8,4 m s vyššími stěnami (1,3 m nad terénem), hřeben ≈ 4,1 m, štíty nahoře
  bedněné prkny se zubořezem, konce zkřížených štítových prken vyřezané do koňských hlav (hlava
  skloněná ven), vyřezávané sloupky u dveří. Dvorec se zatím nerozpadá (jako dílny), zbytek jámy
  po něm je jako po polozemnici.
- **Trasa stezky:** jedno hledání nejlevnější chůze (Dijkstra po terénu pěšin celé krajiny
  s kmeny, keři a balvany; po pevné cestě poloviční cena) z místa za branou dvorce do všech
  8 směrů; cíl je schůdná buňka do 20 m od kraje schůdné krajiny v rozmezí ±22,5° od směru
  (když tudy cesta nevede, ±45°), odklon od směru trasu prodražuje (× 1 + 2·(1 − cos)). Voda
  bez brodu a sráz směr zahradí („Ke kraji mapy tudy cesta nevede…“).
- **Osa a úseky:** trasa se uloží jako pevné cesty (`addTrailRoads`): kde vede po pevné cestě
  (do 5 m), použije ji, jinde vznikne nová vyšlapaná cesta po úsecích nejvýš 150 m připojená
  v rozcestí jako cesty z provozu (místa na stromy, mokřina a brody). Úseky stezky jsou úseky
  pevných cest od vsi ven (`Trail.pieces`); rozdělení úseku přidá nový kus hned za ním.
- **Cena:** úsek vyšlapaný → upravená (15 čd na 100 m), úsek přes mokřinu nebo brod navíc hať
  a lávka (ceny z roads.md, dřevo z hromady, zbytek nejbližší dospělé stromy k mokřinám); úsek,
  který už je upravený, stojí jen hať a lávku, hotový nic. Úsek, který se právě vylepšuje
  hráčem, stezku zablokuje („Část cesty se už vylepšuje.“).
- **Stavba po úsecích:** jedna stavba `road` s `Construction.trail`; práce jde nejdřív na kácení
  dřeva, pak úsek po úseku od vsi ven – dostavěný úsek hned dostane nový stupeň (chodí se po něm
  rychleji, `trailsDay`), ve scéně je zbytek stezky vytyčený a úprava roste na úseku u čela
  práce. Hotová stezka (`Trail.builtDay`) je upravená cesta – nezaroste.
- **Dny cesty:** 2 dny do 400 m stezky, každých dalších 250 m den navíc, nejvýš 6, a 1 den za
  krajem mapy (tedy 3–7 dní celkem).
- **Sousedé:** povaha ze seedu vsi a směru (`neighbourOf` – dokud mapy nemají polohu ve světě,
  stojí za „seed světa“ seed vsi; dvě vsi na téže mapě tak mají každá své sousedy). Od 19. 10.
  2026 má soused druh (`neighbourKind` – každý ze 4 druhů dvakrát kolem vsi) a podle něj nabízí
  2–3 druhy zboží a shání 2–3 – viz [Jen společné suroviny](#jen-společné-suroviny); do té doby
  nabízel aspoň jedno zboží zvenku. Roční zásoba každého nabízeného zboží v hodnotě 600–1 500 kg
  obilí, poptávka 800–2 000 kg; rok obchodu začíná 1. 11. a ukládá se jen, co z něj zbývá.
- **Ceny:** přirážka 20 % platí oběma směry, sháněné zboží soused bere o 20 % dráž a nabízené
  prodá o 20 % levněji: ves za kus sháněného zboží dostane hodnota ÷ 1,2 × 1,2 = 1 × hodnota,
  za kus nabízeného zaplatí hodnota × 1,2 × 0,8 = 0,96 × hodnota. Obchoduje se jen sháněným
  (ves dává) a nabízeným (ves dostává) zboží – jinak by soused byl nekonečný zdroj.
- **Doprava:** nosiči = víc z cest tam a zpět: náklad ÷ 25 kg (kláda váží pro nosiče 100 kg –
  vlečou ji čtyři) + honák na každých 10 kusů dobytka; aspoň 1. Práce = nosiči
  × dny. **Lidé na výpravě mají vlastní podíl práce** (Martin 19. 10. 2026: „Ano, udělej to
  tak.“ – na návrh Clauda níž): každý den výprava vezme tolik člověkodní, kolik s ní jde lidí
  (nosiči, s vozy honáci a pomocníci), hned **po denním minimu domácností a před rozdělením dne**
  (`allocateDay` – `away`, `expeditionLaborToday`), takže trvá přesně dny z náhledu – i o žních,
  kdy ves nemá volnou práci. Dřív brala práci až ze společné práce (po polních pracích, opravách
  a domácí práci) a bez ní stála (Vlkov: ≈ 7 člověkodní volné práce na 12 nosičů – 9 dní místo 5).
  Rozhodnutí Clauda k Martinovu „ano“: **nosiči jsou dospělí** – výprava vezme nejvýš tolik, kolik
  má ves (bez řemeslníků v dílnách) dospělých (14–44 let); děti a starší náklad 25 kg na několik dní
  cesty neponesou a jejich práce ve vsi je jen zlomek. **Denní minimum domácností má přednost** –
  vaření, voda, oheň a péče o malé děti (fields.md – Práce) se neodkládají, výprava je dobrovolná;
  zdržet se tak může jen malá ves, která po denním minimu nemá dost dospělých (panel to ukáže).
  Platí pro každou výpravu ve vsi, i pro nákup u sousedů. Zboží, které ves dává, odejde hned,
  přinesené dorazí po návratu. Ves si nechá aspoň 2 krávy. Kalibrace se nemění (běží bez obchodu
  – ověřeno `measure-village 20 20`).
- ~~**Zboží zvenku:** sůl 3 kg na člověka a rok (≈ 8 g denně), dokud je, štěstí +3; kožešiny se
  opotřebí 20 % ročně, štěstí +2 × (kožešiny ÷ lidé, nejvýš 1); med rovným dílem do roka,
  nejvýš 5 % potřeby energie (0,9 kg obilí na kg), štěstí jako ovoce (+5, se zralým ovocem se
  nesčítá); kovář z koupeného železa jen kuje – 1,2 kg železa, 3 čd a 10 kg uhlí na 1 kg
  nástrojů (místo 10 čd a 50 kg uhlí z rudy), železo bere přednostně.~~ Zrušeno 19. 10. 2026.
- **Rozhraní:** v panelu dvorce (obydlí s portrétem „Dvorec vojvody“) dvě ikony – Zemská stezka
  otevře růžici 8 šipek kolem dvorce (cena, délka a dny cesty v popisku, zahrazený směr zašedlý
  s důvodem, hotová stezka zlatě, rozestavěná s průběhem) a Obchod (jen s hotovou stezkou) panel
  obchodu – sousedé po hotových stezkách, posuvníky „dáš“ (nejvýš co ves má a soused vezme)
  a „dostaneš“ (nejvýš zásoba souseda), bilance pro souseda, nosiči, dny a práce, tlačítko
  vyslat výpravu; výprava na cestě ukáže náklad a průběh. ~~Zboží zvenku v horní liště, med
  v popisku nasycení.~~ (zrušeno 19. 10. 2026)
- **Čitelnost panelu obchodu** (Martin 19. 10. 2026: „U toho obchodu – absolutně netuším, co je
  nabídka a co poptávka.“; návrh Clauda, Martin: „Ano, udělej to tak“): nahoře soused se směrem
  („Lužany (sever)“) a vpravo bilance pro souseda s ikonou vah – zeleně, když je výměna pro
  souseda v pořádku (≥ 0), červeně, když je záporná; popisek „Bilance pro souseda (kg obilí) –
  musí být aspoň 0“. Pod tím dva sloupce s **viditelnými hlavičkami** „Dáš“ (portrét dvorce →,
  ze vsi ven) a „Dostaneš“ (→ portrét dvorce, do vsi) – jediná slova v panelu, výjimka z pravidla
  bez popisků jako „Prodat“ a „Koupit“ v 0 A.D. Popisek řádku řekne, co soused chce: u „Dáš“
  „Soused shání – vezme ještě 1 500 kg“, u „Dostaneš“ „Soused nabízí – má ještě 4 kusy“
  (jednotky kg, kusy, rodiny, muži, ženy), pod tím cena v kg obilí. Dole nosiči, dny cesty, práce
  a tlačítko vyslat výpravu. Záložky sousedů jen, když je jich víc.
- **Po odeslání** (Martin 19. 10. 2026: „Vyslal jsem obchodní výpravu, ale dál nějak nevím, co se
  bude dít.“ – ve Vlkově server výpravu odmítl, protože posuvník zůstal z loňského roku obchodu
  na 3 mužích a soused jich letos měl 2; chybu ukázal jen mizející řádek nahoře; návrh Clauda):
  - **posuvníky se ořežou** na dnešní meze souseda s každým novým pohledem na ves (nový herní den,
    nový rok obchodu od 1. 11.) – odeslat jde jen to, co panel ukazuje (`clampSelection`);
  - **kontrola jádra už před odesláním**: náhled v prohlížeči dělá stejné kontroly a se stejnými
    důvody jako server (`tradeQuote`) – tlačítko je zašedlé a důvod je v popisku, jako u staveb;
  - **chyba serveru zůstane v panelu** červeně pod tlačítkem, dokud hráč výběr nezmění (a jako
    krátký řádek nahoře);
  - **panel zůstane otevřený** a po úspěchu ukáže **výpravu na cestě**: soused a směr, co nese
    a koho vede (Dáš), co přinese a kdo přijde (Dostaneš), průběh, nosiči a vozy a za kolik dní se
    vrátí dnešním tempem;
  - **tempo dne:** lidé na výpravě mají vlastní podíl práce (viz Doprava) – výprava jde plným
    tempem; jen ves, která po denním minimu nemá dost dospělých, se zdrží – panel to ukáže
    přesýpacími hodinami s popiskem „Málo dospělých – dnes šlo 1 z 2 lidí výpravy, výprava se
    zdrží.“, bez nikoho „Výprava stojí – po denním minimu domácností dnes ve vsi nezbyl nikdo, kdo
    by šel.“ (návrat „?“); výprava vyslaná dnes „vyrazí zítra“;
  - **vozy:** u práce panel zeleně ukáže, kolik člověkodní vozy ušetří proti nosičům.
- **Nosiči jako vlastní podíl práce – Martin schválil 19. 10. 2026** („Ano, udělej to tak.“):
  výprava dřív brala práci až ze společné práce vsi a bez ní stála uprostřed cesty (Vlkov: volná
  práce ≈ 7 člověkodní denně na 12 nosičů – výprava za 60 člověkodní trvala 9 dní místo 5; o žních
  by stála úplně). Teď jsou lidé na výpravě celé dny cesty pryč – jejich člověkodny jdou z práce
  vsi hned po denním minimu, před rozdělením dne (viz Jak je postavené – Doprava).
- **Ve scéně – karavana** (Martin 19. 10. 2026: „Měl bych vidět skupinu lidí, jak jde po té zemské
  stezce s nákladem pro sousední vesnici. Zpátky by se mělo vracet o dva lidi víc, když jsem si je
  objednal. Až bude vůz, pojedou zásoby na voze a ušetří se člověkodny.“; návrh Clauda –
  `scene/caravan.ts`, data `SceneVillage.expeditions`):
  - dřív chodili nosiči jako proud tam a zpět po celé stezce podle práce dne – kolik postav, tolik
    člověkodní dne, skutečnou chůzí; bez volných rukou (práce dne 0) zmizeli úplně, karavanu jako
    skupinu nebylo vidět a lidé, kteří se stěhují, nešli vůbec;
  - teď je výprava **jedna skupina** podle stavu výpravy (ne podle práce dne – nezmizí): tam
    nosiči s nákladem (klip nošení) a za nimi lidé, které ves dává sousedovi (rodina s dětmi, muž,
    žena – pohlaví a věk z jádra, `givePeople.members`), zpátky nosiči (s nákladem, jen když
    výprava něco veze) a o objednané lidi víc – rodiny s dětmi a svobodní (pohlaví a věk z jádra,
    `newcomerProfiles` – stejní lidé, kteří se pak ve vsi objeví);
  - **s vozem** jede náklad na voze v čele karavany, s vozem jdou jen dva lidé (honák u spřežení
    a pomocník vedle vozu) a lidé, kteří se stěhují, jdou za vozem; vůz jede od ohrady na stezku,
    za krajem mapy zmizí a vrátí se po stezce k ohradě čelem dopředu; panel obchodu ukáže, kolik
    člověkodní vůz ušetřil;
  - **časový rozvrh:** karavana jde podle postupu výpravy v herním čase (odvedená práce ÷ cena),
    v herním dni plynule dnešním tempem – dojde domů právě, když se výprava v jádru vrátí. Dny
    cesty bez dne za krajem mapy se dělí napůl tam a zpátky; den za krajem mapy (`beyondEdgeDays`)
    je karavana u souseda a není vidět. Skutečnou chůzí by 1 km trval čtvrt hodiny a výprava by se
    vrátila dřív, než by karavana došla na kraj mapy – jde proto zrychleně (časosběr jako jednotky
    v 0 A.D.), krok se přehrává rychleji (nejvýš 3×);
  - před odchodem a po návratu stojí karavana v hloučku u začátku stezky; lidé na výpravě mají
    vlastní podíl práce, takže jde plným tempem – stojí jen výjimečně (ves bez dospělých);
  - ukázka na `/dev/landscape` – tlačítko **Karavana** (nosiči, pak vůz; výprava trvá 90 s).

## Rozhodnutí

| Rozhodnutí                                                                                         | Kdo                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Dvorec vojvody – větší a honosnější obydlí; klik ukáže vylepšení vsi                               | Martin                          |
| První vylepšení: cesta do sousední vsi v jednom z 8 směrů; po ní obchod                            | Martin                          |
| Soused zatím bez simulace (stálá povaha), později skutečné vsi NPC vojvodů                         | Martin (a)                      |
| Dvorec = první / nejstarší obydlí, přestavba na dvorec, kapacita 10, cena ×1,5, jeden              | návrh Clauda                    |
| Stezka = upravená cesta ke kraji mapy (+ hať a lávka), po úsecích od vsi                           | návrh Clauda                    |
| Povaha souseda ze seedu: 2–3 nabízí, 2–3 shání; roční zásoby a poptávka                            | návrh Clauda                    |
| Výměna podle hodnot v kg obilí, přirážka ≈ 20 %; nosiči 25 kg, 2–6 dní, práce vsi                  | návrh Clauda                    |
| ~~Zboží zvenku: sůl, železo (pro kováře), med (jídlo), kožešiny; štěstí~~ – zrušeno                | návrh Clauda                    |
| Přistěhovalci přijdou přes obchod a vztahy se sousedy, ne jako samostatná mechanika                | Martin                          |
| Hodnoty zboží v kg obilí podle rešerše (kráva 600, nástroje 60, kláda 40, sýr 4…)                  | návrh Clauda                    |
| Jak je postavené: dvorec, pozemek se dvorem, trasa a úseky stezky, sousedé, ceny, doprava          | návrh Clauda                    |
| Jen společné suroviny – se sousedem jen zboží, které má i ves; zboží zvenku pryč (19. 10.)         | Martin                          |
| Druhy sousedů (obilnáři, pastevci, lesní ves, řemeslníci), každý dvakrát kolem vsi                 | návrh Clauda                    |
| Starší vsi: zboží zvenku propadne, výprava pro něj se ruší a nosiči vrátí, co nesli                | návrh Clauda                    |
| Výměna lidí se sousedem – celé rodiny i jen dospělí, podle nabídky (19. 10.)                       | Martin                          |
| Lidé souseda na rok (40 % navíc, 30 % shání), dospělý 360 kg obilí, dítě polovina                  | návrh Clauda                    |
| Kdo přijde a kam, koho ves dá (ne dědic, dvorec, rozpad domácnosti), lidé nic nenesou              | návrh Clauda                    |
| Muži a ženy ve výměně lidí zvlášť – nabídka, poptávka i výběr hráče (19. 10.)                      | Martin                          |
| Panel obchodu po odeslání: ořez posuvníků, kontrola předem, chyba v panelu, výprava na cestě       | návrh Clauda                    |
| Karavana výpravy ve scéně – skupina podle postupu výpravy, lidé tam i zpět, s vozem náklad na voze | Martin (19. 10.) / návrh Clauda |
| Kde stezka prochází lesem, les se vykácí (19. 10.)                                                 | Martin                          |
| Průsek 3,5 m od osy, kácení v ceně úseku, trasa se vyhne posvátným dubům a hájům                   | návrh Clauda                    |
| Lidé na výpravě mají vlastní podíl práce – po denním minimu, před rozdělením dne (19. 10.)         | Martin                          |
| Nosiči jen dospělí (nejvýš kolik jich ves má), denní minimum domácností má přednost                | návrh Clauda                    |
