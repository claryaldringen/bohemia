# Vozy a tesař

Stav: **schváleno** (Martin, 19. 10. 2026: „Ano, schvaluji“). Co řekl Martin, je u bodu označeno;
ostatní je návrh Clauda. Čísla ověřila [rešerše](research/2026-10-19-carts-carpentry.md).
**Fáze 1 a 2 implementované (19. 10. 2026)** – tesař a vozy v jádru a rozhraní (část [Jak je
postavené – fáze 1](#jak-je-postavené--fáze-1)), vozová síť a vyjeté cesty (fáze 2); svoz jezdí
po vozové síti. Fáze 3 jsou vozy ve scéně.

## Proč

Ves dnes všechno nosí na zádech – snopy z pole na výmlat, seno z luk, klády z lesa i zboží
k sousedovi (25 kg na člověka a cestu). Martin (19. 10. 2026): vozy mají vozit **seno, snopy
a klády** a **nahradit nosiče u obchodních výprav**. Vozy ale potřebují jinou cestu než lidé:
„Vozy mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří chodí pěšky. Bude to
znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit
serpentiny.“ Vozy vyrábí nový řemeslník **tesař** (Martin).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** vůz s voly ze spřežení vozí seno, snopy a klády a jede s obchodní výpravou – ves ušetří
  práci nošení (Martin).
- **Cíl:** vozy jezdí po **vlastní síti cest** – nevyjedou prudký svah, ve svahu vyjezdí
  serpentiny, a vyjezdí si vlastní cesty (Martin).
- **Cíl:** **tesař** – nový řemeslník: vyrábí vozy, mírně zlepší produktivitu celé vsi (dřevěné
  nástroje) a výrazně zrychlí práci na dřevěných částech staveb (Martin).
- **Ne-cíl:** tesař nestaví vlastní specializované stavby (most, stodola…) – jen pomáhá ostatním
  stavbám svým umem (Martin: „Bude jen pomáhat ostatním, ale díky jeho zkušenostem a umu bude
  opracování dřevěných částí rychlejší.“).
- **Ne-cíl (teď):** koně, jízda na koni, vojenské vozy, kolář jako samostatné řemeslo (kola dělá
  tesař), vozy u sousedů.
- **Anti-cíl:** vůz, který jede kamkoli rovně jako pěšák (svah, les, potok); vůz, který ušetří
  práci tam, kam nedojede.

## Tesař

- **Dílna** jako ostatní dílny ([řemesla](crafts.md) – Budovy): obydlí + 30 %, bydlí v ní
  domácnost, řemeslo patří budově. Vzhled (návrh): polozemnice s předsazenou střechou, pod ní
  kozlíky, trámy, rozdělaný vůz a kola. Umisťuje se jako dílna, zkratka a ikona v mřížce staveb.
- **Surovina:** klády z hromady; když chybí, tesař si skácí strom sám (jako hrnčíř a uhlíř –
  strom vyhrazený dílnou). Potřebuje **nástroje od kováře** (sekery, tesly) – bez nich pracuje
  podle pokrytí nástroji pomaleji (meze).
- **Podle potřeby a volný čas** jako kovář a hrnčíř (crafts.md – Podle potřeby): vyrábí do zásoby
  podle potřeby vsi, s plnou zásobou (nebo bez klád) pracuje se vsí.
- **Co vyrábí:**
  1. **Vozy** – tolik, kolik ves potřebuje: **jeden vůz na spřežení**; vůz se opotřebí
     a doslouží (návrh ≈ 10 let – rešerše), tesař vyrobí nový.
  2. **Dřevěné nářadí** (hrábě, vidle, jha, kádě, topůrka, rádla) – zásoba v kg jako nástroje
     kováře, potřeba na pracujícího a opotřebení ročně (rešerše).
  3. **Pomoc se stavbami** – tesař nestaví sám, ale jeho umem jde **opracování dřevěných částí
     staveb rychleji** (Martin).
- **Účinek – meze produktivity** (jako kovář a hrnčíř – lineárně podle pokrytí 0–1):
  - **stavby:** pracnost dřevěné části každé stavby (obydlí, dílny, ohrady, modly, svatyně,
    hatě, lávky…) od nejhorší meze k nejlepší podle **pokrytí tesařem** – výrazně (návrh: dřevěná
    část až o ≈ 40 % levnější – rešerše; podíl dřevěné části u každé stavby z jejích fází),
  - **polní a domácí práce:** podle **pokrytí dřevěným nářadím** mírně (návrh: o jednotky
    procent – rešerše), vedle kovářových nástrojů.
  - **Pokrytí tesařem** = práce, kterou tesař dá stavbám, ÷ dřevěná práce běžících staveb
    (nejvýš 1) – rozhodne implementace (návrh), aby jeden tesař malé vsi pokryl stavby úplně
    a velké jen zčásti.

## Vůz

- Vůz je **zásoba vsi** (počet, stav), ne stavba ve scéně – stojí u ohrady se spřežením.
- **Táhnou ho voli ze spřežení** (oxen.md) – ve dny orby orají, jinak vozí; vůz bez spřežení
  stojí. Honák jde s vozem (práce svozu, menší než nošení).
- **Dva druhy vozů** (Martin – oba modely z 0 A.D. se mu líbí, role návrh Clauda, Martin schválil):
  - **dvoukolák** – základní vůz od tesaře: náklad ≈ 400 kg, otočí se v malém oblouku, projede
    i vyjetou cestou; vozí seno, snopy a klády,
  - **čtyřkolák** – náklad ≈ dvojnásobek, ale delší a hůř se otáčí (větší poloměr otáčení –
    mírnější serpentiny, nebo upravená cesta); hlavně na obchodní výpravy po zemské stezce.
- **Rychlost** volů ≈ 3 km/h (pomaleji než pěšák s nůší, ale nese 15–30×); čísla nákladu
  a otáčení podle rešerše.
- **Co vozí** (Martin): **seno** z luk na stoh, **snopy** z pole na výmlat, **klády** z lesa na
  hromadu a ke stavbám, **zboží obchodní výpravy** po stezce. Vůz ušetří práci nošení jen tam,
  kam **dojede vozová cesta**; jinam se nosí jako dnes. Bez vozu (nebo bez spřežení) vše jako
  dnes.
- **Obchod:** výprava s vozem potřebuje méně lidí (honák a pomocník na vůz místo nosičů po 25 kg)
  – jen po stezce, která je pro vozy sjízdná (sklon, brody, hať).

## Vozová síť a vyjeté cesty

- **Vlastní cena terénu pro vůz** (Martin): vůz nevyjede prudký svah. Rozhoduje **sklon ve
  směru jízdy**, ne sklon terénu – nad mezí (návrh ≈ 10–12 % – rešerše) vůz nejede, pod ní je
  stoupání dražší. Proto nejlevnější cesta do svahu vede šikmo a **serpentiny vzniknou samy**.
  Pěšák jde dál rovně (jeho síť se nemění).
- **Les** jen po vykácené cestě (pevné cestě), **křoviny a mladý les** ne, **voda** jen mělkým
  brodem nebo po hati (Martin: most zatím ne – stačí brod a hať); **lávka** je jen pro pěší. Ploty, domy a pozemky jako u pěšin, mezi domy jen
  kudy se vůz vejde (šířka ≈ 2,5 m).
- **Přes louku, úhor a strniště** jezdí (pomaleji), **přes osetý díl** ne – jako lidé.
- **Vyjeté cesty:** provoz vozů se sčítá jako provoz lidí (roční síť 1. 11., roads.md). Úsek
  s dostatečným provozem vozů se stane pevnou cestou s příznakem **vozová** – vyjetá, širší (dvě
  koleje), sjízdná pro vozy. Pevná cesta jen pro pěší (bez provozu vozů) zůstane, jak je.
  Upravená cesta je sjízdná vždy (širší, zpevněná).
- **Lidé po vozových cestách chodí** (pevná cesta je pro všechny – Martin: „Když už někde
  vyšlapaná cesta je, ať po ní lidé chodí“), ale do svahu dál i zkratkou rovně.
- **Co hráč uvidí:** ve svahu se pěšina a vozová cesta rozejdou – pěšina rovně, vyjetá cesta
  serpentinami; v rovině splynou.

## Co hráč vidí

- V mřížce staveb **Tesař** (dílna), v panelu dílny zásoba vozů a nářadí a pokrytí staveb.
- V horní liště ikona **vozů** s počtem (jen když jsou) a dřevěného nářadí (jako nástroje).
- Ve scéně vozy s voly a honákem jezdí po vozových cestách – svoz sena, snopů, klád, výprava
  k sousedovi; prázdný vůz stojí u ohrady. Vyjeté cesty mají koleje.
- Panel cesty ukáže, že je **vozová** (ikona vozu).

## Grafika

Z 0 A.D. (CC BY-SA 3.0, převod jako spřežení – `tools/blender/people_from_0ad.py`,
`plough-team.json`, `plough.py`): `props/special/wagon_two_wheel_empty.dae` a
`wagon_four_wheel_empty.dae` **s animací jízdy** (`animation/mechanical/…_move.dae`, kola se točí),
`props/hay_cart(_large).dae` (vůz se senem), `props/wooden_cart(_big).dae`,
`props/wrld_handcart(_broken).dae` (ruční dvoukolák, rozbitý – opuštěný dvůr). Martin vybral
(19. 10. 2026, po náhledu) **dvoukolý a čtyřkolý vůz** (`wagon_two_wheel_empty`,
`wagon_four_wheel_empty`) – s loukoťovými koly, ojí a jhem; ruční vozíky jen jako ozdoba. Měřítko
0 A.D. se zmenší na skutečnou velikost (dvoukolák ≈ 3,5 m i s ojí, čtyřkolák ≈ 5 m).

## Jak je postavené – fáze 1

Návrh Clauda (19. 10. 2026) – detaily, které návrh výš nechal otevřené; čísla z
[rešerše](research/2026-10-19-carts-carpentry.md), v `rules.ts` (`CARPENTRY`, `WOODWORK_LABOR`,
`CARPENTER_TOOLS_WORK`, `WOOD_TOOLS`, `WOOD_TOOLS_LABOR`, `CARTS`, `CART_ACCESS`). Jádro:
`carpentry.ts` (tesař), `carts.ts` (vozy, svoz, dosah), svoz a pomoc stavbám v kroku práce
(`simulate.ts`).

- **Dílna tesaře** jako hrnčíř a kovář: polozemnice s předsazenou střechou (přístřešek 3,2 m),
  cena 286 čd a 23 stromů (obydlí + 30 %), jedna domácnost k osídlení, v mřížce staveb **Tesař
  [T]**. Ve scéně model `tesar` (`CRAFT_MODEL.carpenter` – část Grafika, Tesař), dílna nekouří.
- **Co tesař dělá – v tomto pořadí:**
  1. **Pomoc stavbám** (stavby nečekají): člověkoden tesaře vede **4 čd dřevěné práce** vsi
     (tesařská parta – mistr a 3 pomocníci, i jeho vlastní). Tesaři dají stavbám tolik, kolik
     dřevěná práce dne chce (nejvýš svou práci po minimu a domácí výrobě); tesař, který nemá co
     vyrábět, je na stavbě celý den. Jeho práce jde do staveb se společnou prací vsi.
     **Pokrytí tesařem** = vedení, které tesaři dali ÷ kolik ho dřevěná práce dne chtěla (nejvýš
     1); dřevěná práce dne = podíl dřevěné práce staveb z práce, kterou stavby dnes dostanou
     (rozdělení rovným dílem jako ve stavbách).
  2. **Vozy** – rozdělaný vůz, pak chybějící vůz: **dvoukolák na každé vycvičené spřežení**,
     s hotovou zemskou stezkou navíc **jeden čtyřkolák** (obchod). Dvoukolák 25 čd a 1 kláda,
     čtyřkolák 50 čd a 2 klády; vůz slouží **10 let**, pak dosloužil (kronika, upozornění)
     a tesař udělá nový.
  3. **Dřevěné nářadí** do zásoby: potřeba **4 kg na pracujícího** (od 14 let), opotřebení
     **30 % ročně** (jen v užívání, jako nástroje), zásoba = potřeba × 1,3; **0,5 čd na kg,
     100 kg z klády**.
- **Dřevo:** klády v dílně, pak celé klády z hromady, bez nich si tesař skácí nejbližší strom sám
  (vyhrazený dílnou, pařez – jako hrnčíř). Bez klád i stromů hlásí „Tesař nemá klády“.
- **Nástroje od kováře:** všechna práce tesaře (výroba i vedení staveb) podle pokrytí nástroji
  – **meze 1,5 → 1**.
- **Volný čas:** tesař odpočívá (pracuje se vsí) jen když nemá co vyrábět (nebo z čeho) **a**
  žádná stavba nečeká na dřevěnou práci.
- **Účinek – meze produktivity:**
  - **stavby:** dřevěná část práce stavby **1 → 0,6** podle pokrytí tesařem. Podíl dřevěné
    práce na ceně stavby (i s kácením): zemnice 40 %, polozemnice a dílny 50 %, dvorec 60 %,
    ohrada 40 %, rádlo 100 %, modla 80 %, svatyně 30 %, vylepšení cesty a zemská stezka (hať,
    lávka) 30 %, oprava stavby 30 %; pole, sad, hřbitov a jabloně u cest 0. S plným pokrytím
    stojí polozemnice o 20 % méně práce.
  - **práce vsi:** dřevěné nářadí násobí veškerou práci vsi (háček štěstí) – práce stojí **1 →
    0,95** podle pokrytí nářadím.
  - Ves bez tesaře platí nejhorší meze jako dřív – kalibrace (`measure-village 20 20`) vyšla
    s tesařem v kódu bit po bitu stejně.
- **Vůz = zásoba vsi** (`VillageState.carts` – druh, den výroby), stojí u ohrady se spřežením.
  **Vozí dvoukoláky** se spřežením, které dnes neorá (ve dny orby orají) a není s výpravou;
  čtyřkolák jezdí jen s výpravami. Vůz za den odveze tolik jako **8 nosičů** a jdou s ním **2 lidé**
  (honák a nakladač – činnost `haul` v rozdělení práce dne), kde dojede, ušetří 6 čd denně.
- **Svoz** (kam vůz dojede, nejvýš podíl nošení úlohy a nejvýš ten podíl zbývající práce – vůz
  sám úlohu nedodělá): **odnos snopů** (podíl odnosu na sklizni – fields.md), **čtvrtina seče**
  (svoz a stohování) a **polovina kácení a dovozu klád ke stavbám**. Vozy jedou v pořadí úloh dne
  (sklizeň a seč podle konce okna), zbytek vozí klády. Klády z mýcení na hromadu se nenosí zvlášť
  (jsou v ceně založení) – vůz je nezkrátí.
- **Obchodní výprava** vezme vozy, které jsou doma se spřežením (čtyřkoláky napřed): náklad na voze
  (400 / 800 kg), s vozem 2 lidé místo nosičů po 25 kg; vozů jede tolik, aby lidí bylo nejméně.
  Vozy a jejich spřežení jsou do návratu pryč – doma nevozí a spřežení neorá. Stezka je pro vozy
  zatím sjízdná vždy (je upravená cesta).
- **Dosah vozu je rozhraní** (`CartAccess` – „dojede vůz k cílům a za kolik metrů“, cíle
  najednou). S krajinou ho dává **vozová síť** (fáze 2 – `networkCartAccess` přes
  `villageCartRoutes`: trasy dvoukoláku od ohrady se spřežením, sklon ve směru jízdy do meze,
  serpentiny, brody, les jen po pevné cestě, přes osetý díl ne); bez krajiny (testy, kalibrace)
  dojede všude (`EVERYWHERE`). Kde vůz nedojede, nosí se jako dřív (anti-cíl). Fáze 1 měla
  zástupnou odpověď (rovně po louce, bez lesa a vody), síť ji nahradila (19. 10. 2026).
  - **Kam vůz dojede, se počítá jednou za úlohu** – při prvním svozu úlohy (žeň plodiny, seč,
    klády stavby) jedno hledání ke všem jejím cílům a výsledek se uloží u úlohy (`CartReach` –
    podíl plochy, kam vůz dojede, a body jízd; u klád stromy). Výsledek tak nezávisí na kouscích
    dopočtu a síť se nepočítá každý den (Vlkov: rok s vozem ≈ +0,5 s dopočtu, první hledání ≈ 1 s).
  - **Cíle:** díl pole a louka do 9 m od středu čtverce (kraj dílu – `CARTS.reachM`, jako roční
    síť vozů), strom do 30 m (kládu ke kraji lesa vlečou lidé – `CARTS.dragM`).
  - **Žeň – vůz jede po strništi** (rozhodnutí Clauda): síť nepustí vůz přes osetý díl, takže
    doprostřed velkého osetého pole by nedojel. Snopy se ale svážejí z požatých dílů, kde stojí
    v panácích, a žeň jde od domu ven (fields.md – Postup práce po čtvercích) – díly sklízené
    plodiny se pro vůz postupně otevírají. Dosah žně proto síť počítá s díly sklízené plodiny jako
    se strništěm (`harvestReachState` – stadium zoraného dílu, jede se pomaleji); ostatní osetá pole
    (jař a luštěniny při žni ozimu) vůz nepustí – snopy za nimi nosí lidé jako dřív. Proti
    variantě „jen k dílům na kraji osetého bloku“ by vůz ve velkém poli nevozil skoro nic, ač
    po strništi za žní jezdil; proti „všude“ zůstává překážkou cizí osetí, voda a les.
  - **Jízdy do ročního provozu cest:** vůz za den udělá 8 jízd (`CARTS.loadsPerCartDay`) – podle
    převzatého nošení se přičtou k bodům úlohy (za každé pole a louky dosažený díl nejblíž těžišti,
    u klád stromy) přes `addRoadCartTrips`; z nich roční kontrola dělá vyjeté cesty (fáze 2).
    První den vsi, kdy pevné cesty ještě nezačala sčítat, se jízdy nepočítají.
  - **Výprava** jede s vozem jen po stezce sjízdné pro vozy (`trailCartPassable` –
    `axisCartCheck`: sklon do meze, voda jen brodem); jinak nesou nosiči. Jízdy výprav se do
    provozu nesčítají (pár za rok – pod prahem vyjeté cesty).
- **Rozhraní:** panel dílny tesaře – co dělá (vyrábí vůz s průběhem, nářadí, pomáhá stavbám,
  kácí), vozy proti potřebě po druzích (kolik na cestě), dřevěné nářadí s pokrytím, pokrytí
  dřevěné práce staveb. Horní lišta – dřevěné nářadí (s tesařem) a vozy (jen když jsou).
  Upozornění „Tesař vyrobil vůz“, „Vůz dosloužil“, „Tesař nemá klády“. Panel obchodu ukáže vozy
  výpravy. `/dev/panels` – Tesař, Tesař pomáhá stavbám.
- **Scéna (data pro fázi 3):** `SceneVillage.carts` – vůz, kde stojí (u ohrady), stav a cíl dne
  (svoz – pole, louka, stromy; výprava – stezka). Postavy posádky vozu stojí u svozu jako nosiči,
  sekáči a dřevorubci; vozy se zatím nekreslí.
- **Ikony:** `build/tesar.png` (z modelu `tesar.glb`), `resources/cart.png` (dvoukolák),
  `resources/wood-tools.png` (hrábě a vidle) – `tools/blender/icons.py`.

**Zbývá:** fáze 3 – vozy se spřežením a honákem ve scéně podle `SceneVillage.carts` (trasu po síti
dá `villageCartRoutes`, kreslí `cart-renderer.ts`); jízdy výprav do provozu stezky.

## Jak je postavené – fáze 2 (vozová síť a vyjeté cesty)

Martin (19. 10. 2026): „Vozy mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří
chodí pěšky. Bude to znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset
vyjezdit serpentiny.“ Podrobnosti návrh Clauda (19. 10. 2026); kód `paths/cart.ts`, roční krok
v `paths/roads.ts`, čísla `CART_ROUTES` a `CART_ROADS` v `rules.ts`.

- **Mřížka:** stejná jako u pěšin (buňka ≈ 3,75 m, terén pěšin i s výškou buňky) – vozová cesta
  v rovině splyne s pěšinou a pevnou cestou. Vůz jede v **16 směrech** (osy, úhlopříčky
  a skoky 2 : 1 – šikmo k vrstevnici po 26,6°): v 8 směrech by vůz na svahu nad 14 % (10 % : cos
  45°) nevyjel ani šikmo a serpentiny by měly jen úhel 45°; hustší mřížka by stála 4× víc buněk.
- **Sklon ve směru jízdy:** z výšek koncových buněk hrany. Nad **10 %** (`maxGrade`) hrana není,
  pod ní stoupání zdražuje se čtvercem (u meze 5×), takže nejlevnější je stoupat ≈ 5 % – do svahu
  vede trasa šikmo a **serpentiny vzniknou samy**. Mez (návrh před rešerší) leží v rozmezí
  [rešerše](research/2026-10-19-carts-carpentry.md) – vozy se zvířaty běžně do 8 %, krátce do 12 %
  (Practical Action, tah volů podle Tillers) – a je spodní hranicí rozmezí 10–12 % ze zadání: volský potah s nákladem na hliněné cestě,
  i za mokra. Spodní, protože krajiny hry jsou mírné: sklon mezi políčky má medián ≈ 3 %, 99 %
  políček pod 10–13 % a nejprudší louky (≈ 15 %) leží 700–1400 m od místa vsi (seedy 7, 8, 9, 42,
  43, 44 a Vlkov); scéna terén převyšuje 3× (`HEIGHT_SCALE`), takže svah, který na obrazovce
  vypadá na 30 %, má ve hře 10 %. **Při 12 % by se serpentiny u vsí skoro neobjevily** (u Vlkova
  je nejprudší svah do 300 m od vsi 9 %) – kdo chce serpentiny vidět častěji, musí mez snížit
  (jedno číslo v `rules.ts`), nebo ji vztáhnout k převýšené scéně. **Martin (19. 10. 2026): „sklon
  zatím nechme tak, jak je. Později si budeme hrát ještě s modelací krajiny“** – mez zůstává 10 %.
  Pěšák jde dál rovně (jeho síť se nemění).
- **Poloměr otáčení:** hledání nese **směr jízdy** (stav = buňka × 16 směrů). Dvoukolák zatočí
  na krok nejvýš o 2 směry (≤ 53°, poloměr ≈ 4–5 m), čtyřkolák o 1 (≤ 27°, ≈ 8–11 m – širší
  oblouk, delší serpentiny); každá změna směru stojí 1,5 m. Stav se směrem místo pokuty za ostrý
  úhel: pokuta by ostrý obrat jen zdražila, stav ho vylučuje. Cena: 16× víc stavů.
- **Kudy vůz projede** (`cartGrid`): voda jen brodem (lávka je jen pro pěší), les jen po pevné
  cestě (výš: „les jen po vykácené cestě (pevné cestě)“) – pole založené v lese je vymýcené,
  křoviny a mladý les na přílohu ne, mokřina pomaleji (1,8), přes osetý díl ne, přes zoraný
  a zakládaný pomaleji (1,6), louka, úhor a strniště 1, po pevné cestě 0,6 – **pevná cesta je pro
  vůz sjízdná vždy** (lesem, přes pole, mezi překážkami – jako pro lidi, Martin: „bez ohledu na to,
  na čem ta stezka leží“), jen ne sklonem nad mez a vodou bez brodu. Kmeny, souše, keře, balvany
  a výchozy krajiny vůz neprojede, pařez a kámen objede. Sad, hřbitov a ohrada (i jejich okraj –
  plot, stromy), les vsi a okrsek svatyně ne. Domy, pozemky, staveniště, milíř a modla s půl
  šířkou vozu (2,5 m) navíc – mezi pozemky (mezera 1 m) vůz neprojede.
- **Kde vůz stojí:** u ohrady se spřežením – vyjede z kterékoli průjezdné buňky do 15 m od středu
  ohrady. Branka může vést k sousednímu pozemku (Vlkov – 1 m od plotu), voly jde ale zapřáhnout
  kdekoli u plotu.
- **Trasy** (`cartRoutes`): jedno hledání (Dijkstra) od ohrad ke všem cílům najednou – pro každý
  cíl dojede / nedojede, cena, délka a osa trasy (pro scénu), buňky (pro provoz). Ze stavu vsi
  `villageCartRoutes(state, day, landscape, obstacles, kind, targets)` – terén v okně vsi a cílů,
  překážky krajiny a vsi, pevné cesty; pamatuje si poslední výsledek.
- **Napojení na svoz (fáze 1):** rozhraní `CartAccess` („dojede vůz k cíli a za kolik“) nahradí
  `villageCartRoutes` – cíle svozu (díly pole na sklizni, louky v seči, stromy ke kácení, hromada
  klád, výmlat, stezka) se pošlou najednou, `reached` = dojede, `lengthM` / `cost` = za kolik.
  Jízdy, které svoz udělá, přičte `addRoadCartTrips(state.roads, [{ x, z, kind, trips }])` – z nich
  vzniknou vyjeté cesty.
- **Vyjeté cesty** (roads.md – Vozové cesty): roční kontrola 1. 11. spočítá trasy jízd za rok
  (`annualCartNetwork` – průměr na den) a provoz vozů po buňkách. Kudy vozy dva roky po sobě jezdí
  aspoň **0,25 jízdy denně** (≈ 90 jízd za rok – `CART_ROADS`), vznikne pevná cesta s příznakem
  **vozová** (`Road.cart`), nebo ho dostane pevná cesta, po které vozy jezdí (provoz vozů
  `Road.cartTraffic`, posledních 5 let) – v rovině vozy jezdí po pěší cestě a nová vedle nevznikne,
  ve svahu vznikne serpentina vedle rovné pěšiny. Vozová cesta, kudy 5 let vozy jezdí pod
  polovinou, je zase jen pěší. Kus cesty, kudy jezdí vozy, nezaroste. Vozová a pěší cesta se
  nespojují do jednoho úseku; u souběžných cest je vozová silnější.
- **Pěšina a vozová cesta ve svahu** (ukázka, seed 44): dokud vozová cesta není, pěšina vede
  rovně do svahu a vozy jezdí serpentinou; jakmile vozová cesta stojí, chodí po ní i lidé – po
  pevné cestě jdou o polovinu levněji a prudký kamenitý svah je drahý i pro ně. Pěšina a vozová
  cesta se tak rozejdou jen tam, kde je oklika vozu víc než ≈ 2× delší a svah pro pěšáka mírný
  (k zvážení: slevu pevné cesty pro lidi ve svahu snížit).
- **Ve scéně:** vozová cesta je širší (2,6 m) prošlapaný pás bez holé hlíny uprostřed – tráva mezi
  dvěma kolejemi 0,65 m od osy (`roadBands`, `CART_WORN_LAYER`, `CART_RUT_LAYER`); upravená vozová
  cesta má koleje v upraveném pásu. Přestaví se jen při změně (`roadsKey` nese příznak vozová).
- **Zemská stezka:** `trailRoutes` zůstává jedna trasa pro pěší i vozy – druhá, „vozová“ stezka by
  znamenala dvojí stavbu a dvě různé cesty k témuž sousedovi; navíc stezku hráč staví jako
  upravenou cestu, takže les a mokřina vozu nevadí. Jestli je stezka pro vozy sjízdná, řekne
  `axisCartCheck(osa, terén)` – sklon po kusech 7,5 m nejvýš 10 % a voda jen brodem (délka příliš
  prudkých kusů, nejprudší sklon). Obchod fáze 1 pošle vůz jen po sjízdné stezce, jinak nosiče.
- **Ves bez vozů** (bez jízd nebo bez ohrady se spřežením) počítá jako dřív – zlaté otisky sítě
  pěšin se nemění, ve stavu nic nepřibude.
- **Výkon** (Vlkov, kopie stavu, ohrada se spřežením jen v kopii): hledání ke všem 1798 dílům
  ≈ 200–290 ms (dojede k ≈ 1650 – ostatní díly jsou za osetými bloky nebo v lese), k 50 dílům
  poprvé ≈ 570–650 ms (terén okna se teprve počítá), roční síť vozů s 30 cíli ≈ 210 ms (roční síť
  pěšin ≈ 100 ms).
- **Ukázka:** `/dev/landscape` – tlačítko **Vozy ve svahu** (dvoukolák, čtyřkolák): nejprudší
  louka mapy (krajiny jsou mírné – bývá daleko od vsi, kamera se tam přesune), dole obydlí a ohrada
  se spřežením, nahoře díl pole; pěšina na pole jde rovně, vozová cesta šikmo a serpentinami
  (seed 44: dvoukolák 213 m, čtyřkolák 249 m, přímo 62 m).
- **Zatím není:** vozy ve scéně, ikona vozu v panelu cesty. Svoz fáze 1 už jezdí po síti
  (část fáze 1 – Dosah vozu).

## Jak je postavené – modely (fáze 3a)

Zatím jen grafika a ukázka na `/dev/buildings` (tlačítka **Vozy**, **Tesař**, **Další vůz
zblízka**, **Sledovat vůz**) – herní logika vozů ani tesaře v jádru není.

- **Vozy:** `tools/blender/wagons_from_0ad.py` převádí `wagon_two_wheel_empty.dae`
  a `wagon_four_wheel_empty.dae` (skinované – kola na kostech) do
  `apps/web/public/models/wagons/wagons.glb`. Model se rozdělí podle kostí na korbu, předek
  čtyřkoláku a kolo; zmenší se na skutečnou velikost (kolo ⌀ 0,98 m – dvoukolák ≈ 1,0 × 2,0 m,
  čtyřkolák ≈ 1,25 × 3,2 m, rozvor 1,5 m). Koňský postroj 0 A.D. (oje s chomoutem) je pryč, vozy
  mají vlastní oj ke **šíjovému jhu spřežení** (stejné jho a stejný pár volů jako u rádla – jho
  1,19 m nad zemí): dvoukolák pevnou (korba se podle jha naklápí), čtyřkolák na čepu předku. Korba
  je ≈ 2 m za jhem (zadky volů ≈ 1,6 m), dvoukolák i s ojí ≈ 3,9 m.
- **Kola** se točí podle ujeté dráhy (matice instance – animace jízdy 0 A.D. jen točí kola, korba
  stojí); vnější kolo v oblouku víc než vnitřní.
- **Náklad** jako samostatné díly na korbě: seno (kupa přes korbu s pavuzou – sláma z textury
  `iber_struct.png` jako `hay_cart` 0 A.D., přebarvená do olivova), snopy (napříč, klasy dovnitř,
  po vrstvách), klády (v pyramidě, přečnívají dozadu, kůra a čela jako hromada klád a polena
  řemesel), zboží (pytle, soudek medu, balík kožešin). Prázdný vůz bez nákladu.
- **Ve scéně:** `cart-layout.ts` (čisté funkce – trasa, póza vozu se spřežením v čase t, sklon
  a náklon podle terénu pod koly) a `cart-renderer.ts` (kreslení v instancích). Data přijdou
  z jádra jako trasa vozu (lomená čára), druh a náklad.
- **Tesař:** `tools/blender/crafts.py` (`tesar.glb`) – polozemnice s předsazeným přístřeškem jako
  hrnčíř a kovář, pod ním dva kozlíky s otesávaným trámem, špalek se zaseknutou sekerou,
  rozdělané kolo na špalcích, hotová kola opřená o stěnu a o zásobu trámů, hobliny. Staveniště po
  fázích (`village-construction.ts` – druh `tesar`, fáze `carpentry` a `workshop`), ikona
  `icons/build/tesar.png`. Herní řemeslo `carpenter` má ve scéně model `tesar`
  (`CRAFT_MODEL` v `workshop-layout.ts`).

## Rozhodnutí

| Rozhodnutí                                                                                | Kdo                   |
| ----------------------------------------------------------------------------------------- | --------------------- |
| Vozy vozí seno, snopy, klády a zboží obchodu místo nosičů                                 | Martin (19. 10. 2026) |
| Vozy mají vlastní síť – nevyjedou prudký svah, vyjezdí serpentiny a vlastní cesty         | Martin                |
| Tesař vyrábí vozy, dřevěné nářadí (mírně celá ves) a výrazně zrychlí dřevěné části staveb | Martin                |
| Tesař nestaví specializované stavby – jen pomáhá ostatním                                 | Martin                |
| Dílna tesaře jako ostatní dílny; klády, nástroje od kováře; podle potřeby a volný čas     | návrh Clauda          |
| Účinek jako meze produktivity – pokrytí tesařem u staveb, pokrytí nářadím u prací         | návrh Clauda          |
| Vůz = zásoba vsi u ohrady, táhnou ho voli ze spřežení (ve dny orby orají)                 | návrh Clauda          |
| Sklon ve směru jízdy s mezí (serpentiny vzniknou samy); les jen po cestě; lávka jen pěší  | návrh Clauda          |
| Vyjetá cesta = pevná cesta s příznakem vozová z ročního provozu vozů                      | návrh Clauda          |
| Most zatím ne – vůz přejede potok brodem nebo po hati                                     | Martin (19. 10. 2026) |
| Jeden vůz na spřežení                                                                     | návrh Clauda          |
| Dva vozy z 0 A.D. – dvoukolák (základní) a čtyřkolák (víc nákladu, obchod)                | Martin (19. 10. 2026) |
| Fáze 1: čísla podle rešerše, pořadí práce tesaře, pokrytí tesařem z vedení party          | návrh Clauda          |
| Čtyřkolák navíc k dvoukolákům, jen s hotovou stezkou; vůz slouží 10 let                   | návrh Clauda          |
| Vůz za den = 8 nosičů se 2 lidmi; odnos snopů, čtvrtina seče, polovina dovozu klád        | návrh Clauda          |
| Dosah vozu jako rozhraní; fáze 1 zástupně rovně po louce, bez lesa a vody, sklon do 12 %  | návrh Clauda          |
| Svoz po vozové síti, dosah jednou za úlohu; žeň po strništi sklízené plodiny              | návrh Clauda          |
| Fáze 2: 16 směrů na mřížce pěšin, směr jízdy ve stavu hledání, mez sklonu 10 %            | návrh Clauda          |
| Pevná cesta pro vůz sjízdná vždy; vůz vyjede kdekoli u ohrady se spřežením                | návrh Clauda          |
| Vyjetá cesta 0,25 jízdy denně 2 roky; jedna zemská stezka, sjízdnost `axisCartCheck`      | návrh Clauda          |

| Kola vozů točí matice instance podle ujeté dráhy (ne VAT); vlastní oj ke jhu volů | návrh Clauda |
