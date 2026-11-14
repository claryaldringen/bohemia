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
- Hotová stezka je pevná cesta (nezaroste), stromy u ní rostou jako u ostatních pevných cest – kus pod hotovou stavbou se ale opustí a stezka vede po živých zbytcích (paths.md, Stavba přes cestu).
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
  Zboží souseda: obilí, maso, sýr, luštěniny, dobytek (kusy), klády, kámen (od 8. 11. 2026), keramika, hřivny (od 20. 10.
  2026 místo nástrojů – [Hřivny místo nástrojů](#hřivny-místo-nástrojů-20-10-2026)), uhlí –
  jen to, co má i ves (Martin 19. 10. 2026, viz [Jen společné suroviny](#jen-společné-suroviny)).
  ~~a **zboží zvenku**: **sůl, železo, med, kožešiny**~~ (zrušeno 19. 10. 2026).
- **Čím se soused živí** (návrh Clauda, 19. 10. 2026): obilnáři, pastevci, lesní ves, řemeslníci –
  podle toho nabízí a shání (tabulka v Jen společné suroviny). Kolem vsi je každý druh dvakrát.
- Zásoby souseda: každého nabízeného zboží má na rok omezené množství (doplní se 1. 11.);
  poptávka je taky omezená (kolik toho za rok vezme).
- Jméno souseda (vsi) navrhne hra (`suggestVillageName`), vojvoda zatím nemá tvář.

## Obchod

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

  - **Kůže jsou jedno zboží v kusech kůže skotu** (rozhodnutí koordinátora 14. 11. 2026): malé
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

## Hřivny místo nástrojů (20. 10. 2026)

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

## Dobytek ve třech druzích (20. 10. 2026)

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

## Navazuje

- **Nákup u sousedů** (Martin 19. 10. 2026 – vesničané si výrobky řemeslníků kupují sami, když se
  jim to vyplatí): [řemesla](crafts.md) – Nákup u sousedů. Sousedé mají řemeslníky podle druhu
  (řemeslníci jistě, ostatní někdy); nákup jde mimo panel obchodu – bez hráče, po stezce nebo
  krajinou.

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
  práce. Hotová stezka (`Trail.builtDay`) je upravená cesta – nezaroste (kus pod hotovou stavbou se opustí, paths.md – Stavba přes cestu).
- **Dny cesty:** 2 dny do 400 m stezky, každých dalších 250 m den navíc, nejvýš 6, a 1 den za
  krajem mapy (tedy 3–7 dní celkem).
- **Sousedé:** povaha ze seedu vsi a směru (`neighbourOf` – dokud mapy nemají polohu ve světě,
  stojí za „seed světa“ seed vsi; od 1. 11. 2026 má mapa jen jednu ves – jedna ves, jedna mapa). Od 19. 10.
  2026 má soused druh (`neighbourKind` – každý ze 4 druhů dvakrát kolem vsi) a podle něj nabízí
  2–3 druhy zboží a shání 2–3 – viz [Jen společné suroviny](#jen-společné-suroviny); do té doby
  nabízel aspoň jedno zboží zvenku. Roční zásoba každého nabízeného zboží v hodnotě 600–1 500 kg
  obilí, poptávka 800–2 000 kg; rok obchodu začíná 1. 11. a ukládá se jen, co z něj zbývá.
- **Ceny:** přirážka 20 % platí oběma směry, sháněné zboží soused bere o 20 % dráž a nabízené
  prodá o 20 % levněji: ves za kus sháněného zboží dostane hodnota ÷ 1,2 × 1,2 = 1 × hodnota,
  za kus nabízeného zaplatí hodnota × 1,2 × 0,8 = 0,96 × hodnota. Obchoduje se jen sháněným
  (ves dává) a nabízeným (ves dostává) zboží – jinak by soused byl nekonečný zdroj.
- **Doprava:** nosiči = víc z cest tam a zpět: náklad ÷ 25 kg (kláda váží 100 kg – bez vozu ji nesou **dva lidé**, Martin 22. 10. 2026; s vozem vždy na voze) + honák na každých 10 kusů dobytka; aspoň 1. Práce = nosiči
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
    je karavana u souseda a není vidět. **Změna (1. 11. 2026, návrh Clauda podle Martina –
    villagers.md, Činnosti od začátku do konce):** karavana už nejde časosběrem – vyrazí se svým
    herním dnem a jde ve skutečném čase chůzí (s vozy a dobytkem tempem volů), za krajem mapy herní
    den, zpět stejně; 1 km stezky tak trvá tam a zpět ≈ 30 minut (s vozy ≈ 40) a v jádru se výprava
    vrátí dřív – scéna karavanu dohraje;
  - před odchodem a po návratu stojí karavana v hloučku u začátku stezky; lidé na výpravě mají
    vlastní podíl práce, takže jde plným tempem – stojí jen výjimečně (ves bez dospělých);
  - ukázka na `/dev/landscape` – tlačítko **Karavana** (nosiči, pak vůz; výprava trvá 90 s).

## Rozhodnutí

| Rozhodnutí                                                                                          | Kdo                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Dvorec vojvody – větší a honosnější obydlí; klik ukáže vylepšení vsi                                | Martin                                    |
| První vylepšení: cesta do sousední vsi v jednom z 8 směrů; po ní obchod                             | Martin                                    |
| Soused zatím bez simulace (stálá povaha), později skutečné vsi NPC vojvodů                          | Martin (a)                                |
| Dvorec = první / nejstarší obydlí, přestavba na dvorec, kapacita 10, cena ×1,5, jeden               | návrh Clauda                              |
| Stezka = upravená cesta ke kraji mapy (+ hať a lávka), po úsecích od vsi                            | návrh Clauda                              |
| Povaha souseda ze seedu: 2–3 nabízí, 2–3 shání; roční zásoby a poptávka                             | návrh Clauda                              |
| Výměna podle hodnot v kg obilí, přirážka ≈ 20 %; nosiči 25 kg, 2–6 dní, práce vsi                   | návrh Clauda                              |
| ~~Zboží zvenku: sůl, železo (pro kováře), med (jídlo), kožešiny; štěstí~~ – zrušeno                 | návrh Clauda                              |
| Přistěhovalci přijdou přes obchod a vztahy se sousedy, ne jako samostatná mechanika                 | Martin                                    |
| Hodnoty zboží v kg obilí podle rešerše (kráva 600, nástroje 60, kláda 40, sýr 4…)                   | návrh Clauda                              |
| Jak je postavené: dvorec, pozemek se dvorem, trasa a úseky stezky, sousedé, ceny, doprava           | návrh Clauda                              |
| Jen společné suroviny – se sousedem jen zboží, které má i ves; zboží zvenku pryč (19. 10.)          | Martin                                    |
| Druhy sousedů (obilnáři, pastevci, lesní ves, řemeslníci), každý dvakrát kolem vsi                  | návrh Clauda                              |
| Kůže, kožešiny, med a vosk v obchodě: pastevci a lesní ves nabízejí, obilnáři a řemeslníci shánějí  | návrh Clauda (14. 11. 2026)               |
| Ceny: med 6, vosk 30, kůže skotu 20, kožešina 8 kg obilí; malé kůže plochou 0,8 / 3                 | návrh Clauda (14. 11. 2026)               |
| Starší vsi: zboží zvenku propadne, výprava pro něj se ruší a nosiči vrátí, co nesli                 | návrh Clauda                              |
| Výměna lidí se sousedem – celé rodiny i jen dospělí, podle nabídky (19. 10.)                        | Martin                                    |
| Lidé souseda na rok (40 % navíc, 30 % shání), dospělý 360 kg obilí, dítě polovina                   | návrh Clauda                              |
| Kdo přijde a kam, koho ves dá (ne dědic, dvorec, rozpad domácnosti), lidé nic nenesou               | návrh Clauda                              |
| Muži a ženy ve výměně lidí zvlášť – nabídka, poptávka i výběr hráče (19. 10.)                       | Martin                                    |
| Panel obchodu po odeslání: ořez posuvníků, kontrola předem, chyba v panelu, výprava na cestě        | návrh Clauda                              |
| Karavana výpravy ve scéně – skupina podle postupu výpravy, lidé tam i zpět, s vozem náklad na voze  | Martin (19. 10.) / návrh Clauda           |
| Kde stezka prochází lesem, les se vykácí (19. 10.)                                                  | Martin                                    |
| Průsek 3,5 m od osy, kácení v ceně úseku, trasa se vyhne posvátným dubům a hájům                    | návrh Clauda                              |
| Lidé na výpravě mají vlastní podíl práce – po denním minimu, před rozdělením dne (19. 10.)          | Martin                                    |
| Nosiči jen dospělí (nejvýš kolik jich ves má), denní minimum domácností má přednost                 | návrh Clauda                              |
| Obchod s dobytkem ve třech druzích – krávy, mladí voli (výcvik), vycvičení voli (20. 10.)           | Martin                                    |
| Místa v ohradách, vycvičený vůl se 3 lety služby, prodej mimo dosluhující, rádlo k páru bez výcviku | návrh Clauda                              |
| Ceny dobytka (kráva 600, mladý vůl 350, vycvičený 1 200), kdo dobytek nabízí a shání, honák         | návrh Clauda                              |
| Hřivny místo nástrojů v obchodu (45 kg obilí za kg), starší vsi převedou nástroje kg ÷ 1,2          | Martin (20. 10. 2026), čísla návrh Clauda |
| Nákup osiva: ves 1. 9. a 1. 3. sama koupí chybějící osivo za hřivny a krávy nad chovný pár          | Martin (27. 10. 2026), návrh Clauda       |
| Nákup osiva a platba za koně jen krávami nad krávy na mléko a voly (jako porážka)                   | Martin (2. 11. 2026), návrh Clauda        |
