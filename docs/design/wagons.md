# Vozy a tesař

Stav: **schváleno** (Martin, 19. 10. 2026: „Ano, schvaluji“). Co řekl Martin, je u bodu označeno;
ostatní je návrh Clauda. Čísla ověřila [rešerše](research/2026-10-19-carts-carpentry.md).
**Fáze 1 a 2 implementované (19. 10. 2026)** – tesař a vozy v jádru a rozhraní (část [Jak je
postavené – fáze 1](#jak-je-postavené--fáze-1)), vozová síť a vyjeté cesty (fáze 2); svoz jezdí
po vozové síti. Fáze 3 jsou vozy ve scéně. **Od 20. 10. 2026** dvoukolák táhne jeden vůl,
čtyřkolák pár a ves si sama spočítá, kolik vozů se jí vyplatí (část Kolik vozů ves chce).

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
  1. **Vozy** – tolik, kolik ves potřebuje: ~~**jeden vůz na spřežení**~~ tolik, kolik se vsi
     vyplatí (Kolik vozů ves chce – 20. 10. 2026); vůz se opotřebí a doslouží (návrh ≈ 10 let –
     rešerše), tesař vyrobí nový.
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
  stojí. Honák jde s vozem (práce svozu, menší než nošení). Od 20. 10. 2026 dvoukolák táhne jeden
  vůl a čtyřkolák pár; ve dny orby jdou páry napřed k rádlům a vozy táhne zbytek volů (Kolik vozů
  ves chce).
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

## Co vozy vozí

Martin (19. 10. 2026): „A další věc – chci vidět vesničany a vozy na cestách. Chci vidět vesničany,
jak chodí pro vodu nebo na pole. Pokud budou mít k dispozici vůz, ať na pole, pro vodu nebo pro
dřevěné uhlí jede vůz.“ Podrobnosti nechal na Claudovi („Co bude potřeba, rozhodni sám“) – vše
níž je návrh Clauda, čísla v `CART_JOBS` (`rules.ts`).

- **Kdy:** dvoukolák, který dnes nesváží úrodu, seno ani klády ke stavbám (ty mají přednost)
  a jehož voli neorají (ani orbu navíc – fields.md, Osev navíc), jede v pořadí:
  1. **dřevěné uhlí z milíře ke kováři** – v den, kdy uhlíř vytahá uhlí z vypáleného milíře
     (crafts.md – Milíř stojí vždy). Martin (20. 10. 2026): „Pokud bude ve vesnici vůz, tak kováři
     přiveze uhlí sedlák s vozem (a odečte se jeho práce).“ Uhlí jinak nosí v koších kovářova
     domácnost – synové od 10 let, nebo kovář (crafts.md – Uhlí a ruda kováře); s vozem jede
     **sedlák z práce vsi** (jízda domluvená předem – jako výpravy před úlohami dne), uhlíř nakládá
     při vytahání, u kovárny složí kovář. Dvoukolák uveze 300 kg uhlí (korba s koši ≈ 1,2 m³,
     uhlí ≈ 250 kg/m³; nakládka a složení 15 minut). Vůz jede, jen když je práce sedláka na kg
     menší než nošení v koších kovářovou domácností (koše po 15 kg tam a zpět po cestě);
     komu vůz uhlí přiveze, nenosí. Do 20. 10. 2026 platila jízdy uhlířova domácnost
     a nahrazovaly pětinu vytahání (odnos),
  2. **ruda z rudiště do kovárny** (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „To samé
     u těžení rudy. Kovář a sedlák s vozem dojedou na místo, kde se ruda těží, kovář (nebo jeho
     synové) nakopou rudu a pak s plným vozem přijedou zase do kovárny.“) – má-li ves vůz doma
     a jízda k rudišti ušetří práci, kope kovář rudu **na celý dvoukolák** (400 kg – CARTS.loadKg)
     a začne dřív, dokud mu ruda vystačí na kopání dávky a 15 dní kování (`reserveDays`);
     vykopaná ruda leží na hromadě u jámy (rešerše: ruda se nechá odtéct a vysušit, praží se
     u ložiska) a pro ni pak jedou **sedlák a kovář** (nebo syn od 14) – sedlák z práce vsi,
     kovář z práce dílny, naloží a vrátí se s plným vozem (nakládka a složení 15 minut). Vůz
     jede, jen když jízda obou stojí méně než nošení v koších po 25 kg. Nepřijede-li den po
     vykopání a kovář nemá rudu na dnešek, donese ji pěšky (rozhodnutí Clauda – „sedlák čeká při
     kopání“ by se nevyplatilo nikdy: 400 kg je 5–7 dní kopání),
  3. **osivo na pole** v den setí – nošení osiva v pytlích ze sýpky na pole (≈ **desetina setí**,
     175 kg/ha ≈ 5 pytlů) převezme vůz jako odnos snopů při sklizni (vůz za den = 8 nosičů se
     2 lidmi, nejvýš podíl práce na dílech, kam vůz dojede),
  4. **voda v sudech** – dva sudy po 150 l (300 l ≈ 12 cest s vědry na vahadle – člověk
     spotřebuje 10 l denně, cesta nese 25 l). Vůz přiveze vodu domácnostem, kterým jízda ušetří
     práci – chůze s vědry nad 100 m od vody (blíž je v ceně denního minima, paths.md – Pochůzky
     pro vodu): přirážka za vodu se zmenší o přivezenou vodu a přičte se díl práce posádky (jízda
     tam a zpět, nabírání vědry 5 minut, rozlití do nádob u domů 5 minut). Vyplatí se až
     domácnostem ≈ 170–200 m od vody.
- **Spřežení doma:** jako svoz – dvoukolák se spřežením, které neorá ani nejede s výpravou;
  čtyřkolák jezdí jen s výpravami. Za den nejvýš 8 jízd (CARTS.loadsPerCartDay) a co se vejde do
  10hodinového dne – voli jdou s vozem ≈ 0,8 m/s po louce, po cestě rychleji (vozová síť).
- **Dosah:** vůz jede jen tam, kam ho pustí vozová síť – k milíři do 12 m (milíř u skácených buků v lese jen po
  pevné cestě), k rudišti do 12 m, na suchý břeh u vody (z 40 břehů nejblíž ohradě ten, kam sjede nejlevněji),
  k dílům s osivem jako ke snopům. Kam nedojede, nosí se jako dřív.
- **Jen když ušetří práci** – vůz pro uhlí a rudu, když je jízda levnější než nošení v koších
  kovářovou domácností, pro vodu
  domácnostem, kterým je jízda levnější než chůze s vědry (anti-cíl: vůz, který práci neušetří).
- **Vyjeté cesty:** jízdy pro uhlí, rudu, s osivem i pro vodu se počítají do ročního provozu cest
  jako svoz – k vodě, k milíři a k rudišti mohou vzniknout vyježděné cesty.
- **Ve scéně:** vůz jede tam a zpět (`shuttleRoute`) – uhlí veze zpátky (zboží), rudu zpátky
  (hromada rezavých hrud – díly `wagon2-ore` a `wagon4-ore`), osivo tam (zboží,
  zpátky prázdný), voda v sudech tam i zpět (prázdné sudy k vodě, plné domů – díly `wagon2-water`
  a `wagon4-water`: stojící sudy po ≈ 150 l s víkem a čepem, převázané provazem; dvoukolák dva,
  čtyřkolák čtyři). Na rozdíl od svozu úrody (ladicí – jízdy dne v okně herního dne) jezdí vozy
  s vodou, uhlím, rudou a osivem tempem volů ve skutečném čase (`steadyJob` v `village-carts.ts`) – do
  86 s herního dne by se jízda k vodě vešla jen čtyřicetikilometrovou rychlostí; jsou tak součástí
  provozu na cestách (villagers.md). Ve dny, kdy vůz vodu veze, chodí pro ni pěšky jen tolik
  lidí, kolik vůz nepřivezl. Rozdělení práce dne má podíl `haul`
  s počtem vozů, cílem (milíř, rudiště – `{ kind: 'ore' }`, díl pole, břeh – `{ kind: 'water' }`)
  a co vůz veze
  (`LaborShare.job`). Kronika ani upozornění nejsou.

## Kolik vozů ves chce (20. 10. 2026)

Martin, 20. 10. 2026: „**Vesnice určitě potřebuje více vozů. Ať to funguje jako se stády - ohrada
pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí
zvětšit. Zaároveň to udělej tak, že rádlo táhnou 2 voli, 4kolový vůz také dva voli a dvoukolový
vůz jeden vůl. Napiš návrh, co všechno se dá vozit na vozech a jakých.**“ Na návrh: „**Ano, udělej
to jak říkáš**“. Voly, ohradu volů a potah popisuje [orba](oxen.md) – Ohrada volů, voli po kusech
a potah, Kolik volů ves chce; podrobnosti níž jsou návrh Clauda.

- **Další vůz se vyplatí, když ušetří víc práce za rok, než stojí.** Nahrazuje „dvoukolák na
  spřežení a s hotovou stezkou jeden čtyřkolák“ (`cartTargets` v `draft.ts`); tesař staví podle
  toho (`missingCart`). Bez uzavřeného roku vozů (ves uložená dřív, nová ohrada volů) ves chce
  jen vozy, které má – nové nestaví, staré doslouží.
- **Úspora z loňského provozu** (rozhodnutí Clauda): ves s hotovou ohradou volů každý den měří, co
  by vozy ušetřily, kdyby jich bylo dost – **nošení, které ten den opravdu proběhlo**, tam, kam
  vůz dojede (odnos snopů – podíl odnosu na sklizni, svoz sena – čtvrtina seče, odnos jablek –
  čtvrtina sklizně sadu, osivo – desetina setí, klády ke stavbám – polovina dnešního kácení
  a dovozu), a z toho tam, **kam dojede i čtyřkolák**; **jízdy pro uhlí, rudu,
  hlínu a vodu** (stejný plán jako skutečné vozy, jen s dostatkem vozů – ruda a hlína z toho, co
  dnes kovárny a hrnčíři odnesli z rudiště a hliniště) a **u výpravy**, kolik nosičů by nahradily
  čtyřkoláky (nosiči × dny cesty). Dvoukolák za den převezme nejvýš 8 čd nošení a jdou s ním
  2 lidé – ušetří tedy nejvýš 6 čd; čtyřkolák 16 čd se stejnou posádkou – ušetří 14 čd. Den se
  zapíše do roku vozů (`CartDemand.days` – nošení, kam dojede čtyřkolák, a jinam, úspory jízd, den orby – tehdy
  jezdí jen voli, kteří neorají). Rok vozů běží od 1. 11. (jako rok cest a porážka): 1. 11. se
  uzavře do **tabulky úspor** podle počtu dvoukoláků a čtyřkoláků (`CartYear.base`, ve dny orby
  i podle volů, kteří neorají – `plough`; čtyřkoláky napřed na nošení, kam dojedou, dvoukoláky na
  zbytek a na jízdy – `cartDayValue`) přepočtené na rok – kratší než 300 dní (ohrada volů
  postavená během roku, ves uložená dřív) běží do dalšího 1. 11. – a podle ní ves rok rozhoduje.
  Rok uložený před tabulkou (úspory k-tých vozů) se čte dál.
- **Čtyřkolák v odhadu** (rozhodnutí Clauda): úspory čtyřkoláku jsou nošení, kam dojede, a výpravy;
  jízdy pro uhlí a vodu umí i dvoukolák a ves kvůli nim čtyřkolák nestaví – když ho má, veze je
  ten levnější (Co se vozí a na čem).
- **Proč z loňského provozu, ne z plánu práce:** plán osevu k 1. 9. nezná seč (plánuje se 1. 6.),
  stavby ani výpravy, a dosah vozu po vozové síti zná až svoz; den simulace zná všechno, co vozy
  vozí, i kam dojedou. Je to levné (úspory dne z plánů, které simulace počítá tak jako tak, jedno
  rozhodnutí za rok) a deterministické (na kouscích dopočtu nezávisí). Měří se jen to, co se
  opravdu nosilo – vůz neodnese snopy, které se ještě nepožaly (proto ne celá zbývající práce
  úlohy jako u svozu). S víc vozy by žeň šla rychleji a vozy by měly za den víc práce – odhad je
  spíš opatrný.
- **Cena vozu za rok:** práce tesaře a klády na 10 let života vozu (dvoukolák (25 + 2) ÷ 10 =
  2,7 čd, čtyřkolák (50 + 4) ÷ 10 = 5,4 čd – `cartYearCost`) a **voli navíc** nad páry k rádlům:
  seno přes zimu (151 dní × 6 kg × cena sena v práci z `foodCosts`) a výcvik – 2 roky krmení na
  10 let služby (× 1,2 – `oxYearCost`). Pastva práci nestojí (pasou výrostci). Voli, které ves drží
  k rádlům, táhnou vozy v létě zadarmo.
- **Volba** (`chooseCarts`): ze všech počtů dvoukoláků (do 12), čtyřkoláků (do 4) a volů (i vůl
  navíc na vůz ve dny orby), kteří se vejdou do ohrad volů, ten s nejvyšší úsporou mínus cena; při
  shodě méně vozů a volů. Bez meze míst dá, kolik volů ves chce (upozornění „Voli se nevejdou do
  ohrady“), v místech, kolik jich cvičí a které vozy staví.
- **Potah** (Martin): dvoukolák táhne **jeden vůl** (oplení – dvě oje po stranách vola
  a jednoduché jho), čtyřkolák **pár**. Dva dvoukoláky = stejně volů jako jeden čtyřkolák, ale
  dvě posádky.
- **Voli se sdílí:** ve dny orby jdou páry napřed k rádlům, vozy táhne zbytek volů (dřív vozy ve
  dny orby nejezdily vůbec); výprava vezme vozy, na které jsou doma voli.

### Co se vozí a na čem (20. 10. 2026)

Návrh Clauda, Martin schválil („Ano, udělej to jak říkáš“) včetně výběru nových nákladů.
**Dvoukolák** (1 vůl, 400 kg): obratný, do svahu, na strniště a louku, krátké cesty a malé dávky.
**Čtyřkolák** (2 voli, 800 kg): ~~jen po pevných cestách~~ po louce a strništi kamkoli (níž),
širší oblouk, dvakrát víc s jednou posádkou. Ves vybere levnější vůz pro každou práci.

| Náklad                             | Dvoukolák | Čtyřkolák                                | Stav                                                                      |
| ---------------------------------- | --------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Snopy ze žní, seno                 | ano       | ano, kam dojede                          | ve hře                                                                    |
| Klády ke stavbám                   | krátké    | dlouhé, výhodnější                       | ve hře (čtyřkolák ke stromům u pevných cest)                              |
| Uhlí, osivo, voda                  | ano       | uhlí od milíře v lese po cestě, voda ano | ve hře (uhlí a vodu levnější vůz; osivo dvoukolák)                        |
| Ruda z rudiště                     | ano       | –                                        | ve hře (crafts.md – Uhlí a ruda kováře)                                   |
| Výpravy po stezce, nákup u sousedů | –         | ano                                      | ve hře                                                                    |
| **Hlína pro hrnčíře** od potoka    | ano       | –                                        | ve hře (crafts.md – Hlína hrnčíře): hliniště, hrnčíř kope, sedlák s vozem |
| **Jablka ze sadu** do vsi          | ano       | ano, kam dojede                          | ve hře (orchard.md – Jablka vozem): čtvrtina sklizně jako odnos snopů     |
| **Stěhování do nové vsi**          | ano       | ano                                      | ve hře (migration.md – Vůz při odchodu): volný vůz s voly, víc jídla      |

- **Čtyřkolák po strništi a louce kamkoli** (Martin, 20. 10. 2026, na otázku, jestli má
  čtyřkolák smět mimo pevné cesty: „Po strništích a loukách může libovolně“ – mění dřívější
  „čtyřkolák jen po pevných cestách a 40 m kolem ohrady volů“, `CART_ROUTES.fourWheelOffRoadM`):
  vozová síť čtyřkoláku (`cartGrid` s `fourWheel`) jede jako dvoukolák – louka, úhor, strniště
  i připravený díl, svah do 10 % a stoupání stejně, zatáčí širším obloukem (o jeden z 16 směrů na
  krok – `CART_ROUTES.turnSteps`) –, jen **zakládaný (zoraný) díl objede** (dvoukolák po něm jede
  pomalu); osetý díl, křoviny, sad, hřbitov, ohrada, les mimo pevnou cestu a mokřina jako
  u dvoukoláku (návrh Clauda). Uložené dosahy a jízdy čtyřkoláku (`cartReach4`, `cart4`,
  `waterCart4`) se ve vsi z doby „jen po pevných cestách“ jednou zahodí a spočítají znovu
  (`withFourWheelReach`, `DraftState.fourWheelOffRoad`); rok vozů se tím přepočítá sám. Zemská
  stezka pro výpravu zůstává (`trailCartPassable`).
- **Levnější vůz pro každou práci** (`fleetHaulPlan`, `planCartJobs`): flotila dne (`CartFleet`
  – vozy doma po druzích a voli, kteří neorají) – na snopy, seno, jablka a klády jedou napřed
  čtyřkoláky na nošení, kam dojedou (dvakrát víc se stejnou posádkou), dvoukoláky na zbytek; uhlí
  od milíře a vodu veze ten vůz, který za kg stojí méně práce (čtyřkolák, když k milíři či břehu
  dojede – vlastní jízda `CharcoalKiln.cart4`, `VillageState.waterCart4`); ruda, hlína a osivo
  jen dvoukolákem (malé dávky, osivo na zoraný díl). Svoz počítá dosah obou druhů jednou za úlohu (`cartReach4`).
- **Vlkov** (20. 10. 2026): ~~jen po pevných cestách dojel čtyřkolák k ≈ 4 % plochy polí a ves
  chtěla jen dvoukoláky (tabulka úspor za rok 804/805: dvoukoláky 1–4 ≈ 194, 221, 221, 221 čd,
  čtyřkolák ≈ 4)~~. Po louce a strništi dojede k **84 %** plochy polí (dvoukolák 84,5 % – zbytek je
  osetý nebo zoraný díl a les). Rok vozů 24. 12. 800 – 1. 11. 801 (kopie stavu z DB ze 7. 1. 801,
  přepočtený na rok): úspora za rok dvoukolák sám 170 čd, čtyřkolák sám 316 čd, dvoukolák
  a čtyřkolák 327 čd (další vozy už nic) – **ves chce dvoukolák a čtyřkolák** a stávající čtyřkolák tesař po dosloužení
  nahradí (dřív by chtěla jen dvoukolák).

**Hnůj a palivové dříví se nevozí.** Hnůj z ohrad na pole se nedělá vůbec – Martin (20. 10. 2026):
„Hnůj z ohrad na pole - tohle zatím úplně vynecháme, nejsem si jistý, jestli to staří slované tak
dělali“.

## Kování vozů

Martin (20. 10. 2026): „Ano. A taky přidej tedy pravidlo, že vozy mají železnou složku. Pokud
vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má) dojít do nejbližší vesnice, kde
kovář je“

K návrhu, že cesta bude vidět jako karavana: „Ano, pokud to bude jen jedna postava, je to
v pořádku.“

K sondě na Vlkově, kde tesař šel sám a zaplatil 173 kg obilí: „pokud zaplatil 173 kg obilí, tak
nemohl jít sám. Buď si musel půjčit vůz nebo muselo jít alespoň 6 lidí, aby to obilí unesli“

Podrobnosti jsou návrh Clauda (čísla `CART_IRON` v `rules.ts`, modul `cart-iron.ts`).

- **Kolik:** vůz má kování – osy, hřeby, obruče a kování nábojů: **dvoukolák 3 kg, čtyřkolák
  6 kg**. Kování jsou výrobky kováře a berou se **ze zásoby nástrojů** (`crafts.toolsKg`) – žádná
  nová zásoba: kování je železo od kováře jako nástroje (stejná práce, uhlí a ruda na kg), Martin
  nechce nové suroviny („Nech jen společné suroviny, nezaváděj nové.“ – trade.md) a nákup
  u sousedů i obchod nástroje už znají. 3 kg ze zásoby ≈ 50 kg pokrytí nástroji skoro nezmění.
- **Vůz se bez kování nedokončí.** Tesař vůz rozdělá; s hotovou dřevěnou prací vůz čeká na kování
  a tesař mezitím dělá dřevěné nářadí (nebo, má-li ho dost, pracuje se vsí). Kování přidá večer
  krok dne `cartIronDay` – vůz je pak hotový (kronika `cart-made`).
- **Ves s kovářem:** kování z jeho zásoby nástrojů. Když chybí, kovář ho vyrobí **přednostně jako
  zakázku** – kove nad zásobu do potřeby vsi, dokud vůz čeká (`smithToolsTarget` = zásoba do
  potřeby + kování čekajících vozů; i uhlíř podle toho nosí uhlí). „Ves s kovářem“ = obývaná
  kovárna, která má kde kopat rudu a odkud brát uhlí (bez uhlí jen s uhlířem ve vsi).
- **Ves bez kováře:** syn tesaře **od 14 let** (nejstarší), jinak tesař sám, dojde do **nejbližší
  vsi s kovářem** a přinese kování:
  - **druhá ves hráče na téže mapě** – obývané kovárny jiných vsí mapy jsou v přehledu sousedních
    vsí (`NeighbourSnapshot.smithies`, se jménem vsi); jde se krajinou rovně ke kovárně, celou cestu
    je vidět. Dny tam a zpět jako nákup u sousedů krajinou (vzdálenost × 1,5, dny jako výprava) bez
    dne za krajem mapy (2–6 dní),
  - **soused za krajem mapy** s kovářem (`neighbourCrafts` – u sousedů řemeslníků jistě) – po hotové
    zemské stezce, nebo krajinou ke kraji mapy od dílny tesaře (`purchaseRoute`).

  **Cíl a dopravu ves volí podle nejmenší práce vsi celkem** (`ironOptions`, `ironPlan`): ze všech
  vsí s kovářem (sousedé, jiná ves na téže mapě) a obou způsobů – vozem po stezce sjízdné pro vozy
  (tesař a sedlák × dny cesty), nebo pěšky s nosiči (tesař a nosiči × dny, víc cest u malé vsi) –
  ta s nejmenšími člověkodny; při shodě kratší cesta. Vozem jen s volným vozem. Proto může ves jet
  vozem k dalšímu kováři místo s nosiči k nejbližšímu. **Platba obilím** jako nákup nástrojů
  u souseda (`productPrice` – 0,96 hodnoty; 3 kg ≈ 173 kg obilí, 6 kg ≈ 346 kg) – ves zaplatí
  ze zásob hned při odchodu, ale jen když nešetří jídlem (výhled jídla do sklizně vychází); jinak
  vůz čeká. Druhá ves hráče se platbou nemění (vsi se simulují každá zvlášť). Tesař nebo syn
  **chybí v práci dílny** (i ve vsi, když tesař s domácností pracuje se vsí) a praxi ten den
  nezíská. Kdo cestou zemře nebo odejde, kování nepřinese – vůz čeká a jde jiný.

- **Kdo nese platbu** (Martin – sám 173 kg obilí neunese):
  - **vůz se sedlákem** – když ves má doma volný vůz (ne na výpravě; vůz, na který se kování dělá,
    ještě hotový není) a doma voly, kteří ho utáhnou, a cesta vede **po hotové zemské stezce
    sjízdné pro vozy** (jako vozy výprav – `trailCartPassable`). Dvoukolák napřed (jeden vůl),
    platbu unese každý vůz (400 / 800 kg). Jede s ním **sedlák z vsi** (`CART_IRON.cartCrew`)
    a tesař nebo syn; vůz i vůl jsou celou cestu pryč (`cartsAway`, `oxenAway` – vozit ani orat
    nemohou). Krajinou ke kraji mapy a do jiné vsi na téže mapě vůz nejede.
  - **jinak nosiči** – skupina jako nákup u sousedů (`tripOf`): tolik lidí, kolik je nákladů po
    25 kg (TRADE.porterKg), tesař nebo syn nese taky – **173 kg = tesař a 6 nosičů** (7 lidí),
    346 kg za čtyřkolák = 14 nákladů. Skupina je nejvýš malá skupina vsi (`groupCap` – polovina
    dospělých, aspoň 1, nejvýš 8); **když ves tolik dospělých nemá, jdou víckrát** – dny cesty ×
    počet cest (`IronTrip.tripDays`). Vůz pak nečeká navždy a malá ves platí časem, stejně jako
    u nákupu u sousedů.
  - Nosiči a sedlák **chybí v práci vsi po celou cestu** – jako skupiny nákupu u sousedů jdou do
    `away` v rozdělení práce dne (`ironTripHelpers`), podíl `trade` (`ironTripShares`).
  - **Rok vozů** (Kolik vozů ves chce) vidí i cestu pro kování: když by vůz ušetřil práci proti
    nejlevnější cestě pěšky, zapíše se úspora k dvoukolákům (`addCartDemand`) – i když volný vůz
    zrovna nebyl, ať si ves spočítá, že další vůz se vyplatí. Jen ves s ohradou volů.

- **Kronika a upozornění:** „Tesař šel se 6 nosiči pro kování k vozu do vsi Lhota (sever)“, „Tesař
  jel s vozem pro kování…“ (u syna „Syn tesaře šel…“, u vsi na téže mapě bez směru), po návratu
  „Tesař přinesl kování“ – a vůz je hotový.
- **Ve scéně skupina, nebo vůz** (místo jedné postavy – Martin, sonda Vlkov) jako karavana nákupu
  u sousedů: pěšky tesař nebo syn (pohlaví a věk z jádra) a nosiči, tam s obilím, zpátky bez
  nákladu; s vozem vůz se spřežením po zemské stezce, sedlák u volů a tesař vedle vozu. Od dílny po
  zemské stezce, nebo krajinou rovně k okraji mapy (za okrajem zmizí), nebo do druhé vsi ke kovárně
  a zpět; jde-li skupina víckrát, každou cestu zvlášť (`sceneExpeditions` – `ironCaravan`; vůz
  jede jako vůz výpravy – `sceneCarts`).
- **Panel dílny tesaře:** „Čeká na kování k vozu (3 kg)“ (červeně), nebo „Syn tesaře (15 let) jde
  se 6 nosiči (nesou obilí na platbu) pro kování k vozu do vsi Lhota (sever) – zpět za 3 dny“,
  „Tesař jede s vozem a sedlákem (dvoukolák veze obilí na platbu) …“ (šipka směru a dny); vůz,
  který čeká na kování, se v činnosti dílny neukazuje jako vyráběný.

### Vlkov – kování vozů

Vlkov má kováře (zásoba nástrojů ≈ 50 kg) – za dva roky simulace dostal nový dvoukolák kování ze
zásoby a kovář ho hned dokoval (nástroje 76,6 kg proti 76,7 kg bez pravidla). S kovářem a prázdnou
zásobou nástrojů (1 kg) kovář kování vykoval jako zakázku a nikdo nikam nešel.

Sondy bez kováře (kovárna zrušená) na čerstvém stavu z 31. 1. 801, kdy ves chce další dvoukolák:

- **první sonda (20. 10. 2026, tesař sám):** tesař šel po zemské stezce na východ do vsi Olšany
  (5 dní) a zaplatil 173 kg obilí – Martin: tolik obilí sám neunese. Opraveno:
- **bez volného vozu:** 10. 3. 801 šel tesař (bez syna od 14 let) **se 6 nosiči** po zemské stezce
  do vsi Olšany (východ, 5 dní, 172,8 kg obilí); v rozdělení práce dne bylo 6 čd na cestě
  (podíl `trade` na stezce), 15. 3. přinesl kování a vůz byl hotový,
- **s volnými vozy** (dvoukolák a čtyřkolák u ohrady volů): nejbližší kovář (Olšany, 5 dní) je po
  stezce na východ, která **není sjízdná pro vozy** – pěšky by to stálo 7 lidí × 5 dní = 35 čd.
  Ves proto 10. 3. 801 poslala tesaře **s dvoukolákem a sedlákem** po stezce sjízdné pro vozy na
  sever do vsi Chotěšov (7 dní, 2 lidé × 7 dní = **14 čd**; 1 čd z práce vsi denně, vůz s volem
  pryč), 17. 3. byl vůz hotový. Rok vozů si zapsal, že vůz ušetřil 21 čd (35 − 14).

### Rozhodnutí – kování vozů

| Rozhodnutí                                                                                          | Kdo                   |
| --------------------------------------------------------------------------------------------------- | --------------------- |
| Vozy mají železnou složku; ves bez kováře pošle tesaře (nebo syna) do nejbližší vsi s kovářem       | Martin (20. 10. 2026) |
| ~~Cesta je vidět jako karavana – jen jedna postava~~ – nahrazeno: skupina nosičů, nebo vůz          | Martin (20. 10. 2026) |
| Tesař 173 kg obilí sám neunese – vůz, nebo aspoň 6 lidí                                             | Martin (20. 10. 2026) |
| Volný vůz s voly jede se sedlákem z vsi, jen po zemské stezce sjízdné pro vozy; dvoukolák napřed    | rozhodnutí Clauda     |
| Jinak nosiči po 25 kg (tesař nese taky), nejvýš polovina dospělých; málo lidí – jdou víckrát        | rozhodnutí Clauda     |
| Nosiči a sedlák chybí v práci vsi po celou cestu (jako nákup u sousedů)                             | návrh Clauda          |
| Dvoukolák 3 kg, čtyřkolák 6 kg kování                                                               | návrh Clauda          |
| Kování ze zásoby nástrojů (žádná nová zásoba)                                                       | rozhodnutí Clauda     |
| Vůz bez kování čeká, tesař dělá nářadí; kovář kování vyrobí přednostně jako zakázku                 | návrh Clauda          |
| Jde syn tesaře od 14 let, jinak tesař                                                               | návrh Clauda          |
| ~~Nejbližší ves s kovářem podle dní cesty~~ – nahrazeno: cíl a doprava podle nejmenší práce vsi     | návrh Clauda          |
| Cíl a doprava podle nejmenší práce vsi celkem (všechny vsi s kovářem, vůz i nosiči); shoda – kratší | návrh Clauda          |
| Cesta vozu pro kování do roku vozů (kolik práce vůz ušetřil proti cestě pěšky)                      | návrh Clauda          |
| Cesta a platba obilím jako nákup u sousedů; platí ze zásob jen ves, která nešetří jídlem            | rozhodnutí Clauda     |
| Ves s kovářem = kovárna má rudiště a uhlí (bez uhlí jen s uhlířem ve vsi)                           | rozhodnutí Clauda     |
| Druhá ves hráče se platbou nemění (vsi se simulují zvlášť)                                          | rozhodnutí Clauda     |

## Vozová síť a vyjeté cesty

- **Vlastní cena terénu pro vůz** (Martin): vůz nevyjede prudký svah. Rozhoduje **sklon ve
  směru jízdy**, ne sklon terénu – nad mezí (návrh ≈ 10–12 % – rešerše) vůz nejede, pod ní je
  stoupání dražší. Proto nejlevnější cesta do svahu vede šikmo a **serpentiny vzniknou samy**.
  Pěšák jde dál rovně (jeho síť se nemění).
- **Les** jen po vykácené cestě (pevné cestě), **křoviny a mladý les** ne, **voda** jen mělkým
  brodem nebo po hati (Martin: most zatím ne – stačí brod a hať); **lávka** je jen pro pěší. Ploty, domy a pozemky jako u pěšin, mezi domy jen
  kudy se vůz vejde (šířka ≈ 2,5 m).
- **Přes louku, úhor a strniště** jezdí (pomaleji), **přes osetý díl** ne – jako lidé.
- **Vyježděné cesty** (Martin, 19. 10. 2026: „Cesty – pokud nějakou cestu vyjezdí vůz, bude to
  vyježděná cesta. Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“):
  provoz vozů se sčítá jako provoz lidí (roční síť 1. 11., roads.md). Kudy vozy vyjezdí trasu
  mimo cesty, vznikne **vyježděná cesta** – širší (dvě koleje), sjízdná pro vozy. Kudy vozy
  vyjezdí vyšlapanou cestu (po ní, nebo souběžně kus vedle), vyšlapaná se v tom kusu stane
  vyježděnou – dvě souběžné cesty nevzniknou a provoz vozů se neztratí. Pevná cesta jen pro pěší
  (bez provozu vozů) zůstane, jak je. Upravená cesta a hať zůstanou, čím jsou (jsou víc než
  vyježděná) – sjízdné jsou vždy (širší, zpevněné) a vozy po nich jezdí.
- **Lidé po vozových cestách chodí** (pevná cesta je pro všechny – Martin: „Když už někde
  vyšlapaná cesta je, ať po ní lidé chodí“), ale do svahu dál i zkratkou rovně.
- **Stromy u cesty zrychlí i vůz** (Martin, 20. 10. 2026: „Stromy u cesty musí přídat něco málo
  k rychlosti jak chodců tak vozů. šlo by přidat třeba 0.03? A pokud to budou jabloně, přidalo by
  se 0.05.“ – [roads.md](roads.md), Stromy u cesty zrychlí chůzi): stejný přírůstek jako chůze
  se přičte k rychlosti vozu po cestě – vyježděná lemovaná stromy po celé délce 1,6 → 1,63,
  jabloněmi 1,65, úměrně olemování (`Road.lined`, `cartRoadSpeed`). V mokřině a na brodu nic.
- **Co hráč uvidí:** ve svahu se pěšina a vyježděná cesta rozejdou – pěšina rovně, vyježděná
  serpentinami; v rovině splynou (vyšlapaná cesta se stane vyježděnou).
- **Vozová cesta** (Martin, 20. 10. 2026 – [roads.md](roads.md), Vozová cesta): cestu hráče jde
  upravit pro vozy – vlastní přímější trasa s úvozy, náspy a serpentinami do 6 %, zpevněné koleje.
  Vůz po ní jede **2,2** (upravená 1,8, vyježděná 1,6), v mokřině drží rychlost jako hať, brod
  zůstává brodem (0,33). Stromy u cesty přidají jako u ostatních cest (`Road.lined`). Pěšky 1,7
  jako upravená. Vozová síť ji bere jako každou pevnou cestu – sjízdná vždy, terén pod ní
  upravený (sklon pláně, ne původního svahu).

## Co hráč vidí

- V mřížce staveb **Tesař** (dílna), v panelu dílny zásoba vozů a nářadí, pokrytí staveb,
  kování k vozu (čeká, nebo kdo pro ně jde a kdy se vrátí – Kování vozů) a zkušenost tesaře
  (crafts.md – Učení řemesla).
- V horní liště ikona **vozů** s počtem (jen když jsou) a dřevěného nářadí (jako nástroje).
- Ve scéně vozy s voly a honákem jezdí po vozových cestách – svoz sena, snopů, klád, výprava
  k sousedovi; prázdný vůz stojí u ohrady. Vyjeté cesty mají koleje.
- **Výběr vozu** (Martin 20. 10. 2026 – villagers.md, Výběr spřežení a vozu; podrobnosti návrh
  Clauda): klik na vůz nebo jeho voly vybere vůz – kroužek ho sleduje, panel ukáže druh, co dělá
  („jede pro uhlí k milíři“, „nakládá uhlí“, „veze uhlí ke kováři“, „skládá uhlí“, „stojí
  u ohrady“…), stav, voly, co právě veze a tlačítka ohrady a vozky. Vozka je člověk vsi (dospělý,
  přednostně muž) – klik na něj vybere člověka s tlačítkem vozu.
- Panel cesty: vyšlapaná cesta s vozy je **Vyježděná cesta** – vlastní druh s portrétem (pás
  prošlapané trávy se dvěma kolejemi) a v rozpisu celé cesty zvlášť od vyšlapané (Vyšlapaná,
  Vyježděná, Upravená, Hať – délka po druzích).

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
     dřevěná práce dne chce (nejvýš svou práci po denním minimu); tesař, který nemá co
     vyrábět, je na stavbě celý den. Jeho práce jde do staveb se společnou prací vsi.
     **Pokrytí tesařem** = vedení, které tesaři dali ÷ kolik ho dřevěná práce dne chtěla (nejvýš
     1); dřevěná práce dne = podíl dřevěné práce staveb z práce, kterou stavby dnes dostanou
     (rozdělení rovným dílem jako ve stavbách).
  2. **Vozy** – rozdělaný vůz, pak chybějící vůz: ~~**dvoukolák na každé vycvičené spřežení**,
     s hotovou zemskou stezkou navíc **jeden čtyřkolák** (obchod)~~ vozy, které se vsi vyplatí
     (Kolik vozů ves chce – 20. 10. 2026). Dvoukolák 25 čd a 1 kláda,
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
  **Vozí dvoukoláky** se spřežením, které dnes neorá (ve dny orby orají – od 20. 10. 2026 s volem,
  který dnes neorá) a není s výpravou;
  čtyřkolák jezdí jen s výpravami. Vůz za den odveze tolik jako **8 nosičů** a jdou s ním **2 lidé**
  (honák a nakladač – činnost `haul` v rozdělení práce dne), kde dojede, ušetří 6 čd denně.
- **Svoz** (kam vůz dojede, nejvýš podíl nošení úlohy a nejvýš ten podíl zbývající práce – vůz
  sám úlohu nedodělá): **odnos snopů** (podíl odnosu na sklizni – fields.md), **čtvrtina seče**
  (svoz a stohování) a **polovina kácení a dovozu klád ke stavbám**. Vozy jedou v pořadí úloh dne
  (sklizeň a seč podle konce okna), zbytek vozí klády. Klády z mýcení na hromadu se nenosí zvlášť
  (jsou v ceně založení) – vůz je nezkrátí.
- **Obchodní výprava** vezme vozy, které jsou doma se spřežením (čtyřkoláky napřed): náklad na voze
  (400 / 800 kg), s vozem 2 lidé místo nosičů po 25 kg; vozů jede tolik, aby práce (lidé × jízdy)
  byla nejmenší, při shodě méně vozů.
  **Opakované jízdy vozu a klády** (Martin 22. 10. 2026: „Pokud udělám obchodní výpravu s kládami,
  ať se klády vždy vezou na voze – člověk by je neutáhl.“ a „Teď jede vůz a za ním jde třeba 12
  lidí. To je plýtvání. Ať jede vůz klidně několikrát a lidi ať jsou jen na doplnění – ať je
  každá cesta co nejvíc optimální.“ – podrobnosti návrh Clauda): vozy jedou **tolikrát, kolikrát
  se naplní celé** (větší z cest tam a zpět; aspoň jednou, i s menším nákladem). **Zbytek aspoň
  půl vozu = vůz jede ještě jednou** s neplným nákladem (Martin 23. 10. 2026, volba „Zbytek ≥ půl
  vozu“; práh `TRADE.restTripShare`). Menší zbytek (a dobytek) nesou a ženou lidé **přesně
  rozdělení mezi jízdy** (floor + zbytek po jednom na první jízdy) – např. vůz uveze 45 % zboží:
  jede dvakrát a zbylých 10 % (≈ 22 % vozu) nese 5 lidí, při jízdách 3 + 2. 790 kg na dvoukolák
  (400 kg) = 2 jízdy. Výprava trvá `jízdy × dny cesty`, práce je součet lidí přes jízdy × dny.
  Klády s vozem jedou
  vždy na voze (jízd je tolik, aby se vešly), bez vozu je nese **dva lidé na kládu** (dřív čtyři).
  Nosnost vozu a kolik nákladu veze při výpravě vidí hráč v panelu výběru vozu (ikona vozu,
  „náklad / nosnost“ v kg, popisek v tooltipu).
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
    se strništěm (`harvestReachState` – stadium připraveného dílu, jede se jako po strništi 0,8); ostatní osetá pole
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
  sekáči a dřevorubci (od fáze 3 jde honák s vozem – vozy kreslí scéna, fáze 3).
- **Ikony:** `build/tesar.png` (z modelu `tesar.glb`), `resources/cart.png` (dvoukolák),
  `resources/wood-tools.png` (hrábě a vidle) – `tools/blender/icons.py`.

**Zbývá:** jízdy výprav do provozu stezky (vozy ve scéně – fáze 3).

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
  (Practical Action, tah volů podle Tillers) – a je spodní hranicí rozmezí 10–12 % ze zadání:
  volský potah s nákladem na hliněné cestě, i za mokra. Spodní, protože krajiny hry jsou mírné: sklon mezi políčky má medián ≈ 3 %, 99 %
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
  křoviny a mladý les na přílohu ne, přes osetý díl ne, mokřina, zoraný díl a strniště pomaleji,
  pevná cesta rychleji podle druhu (Rychlosti níž) – **pevná cesta je pro
  vůz sjízdná vždy** (lesem, přes pole, mezi překážkami – jako pro lidi, Martin: „bez ohledu na to,
  na čem ta stezka leží“), jen ne sklonem nad mez a vodou bez brodu. Kmeny, souše, keře, balvany
  a výchozy krajiny vůz neprojede, pařez a kámen objede. Sad, hřbitov a ohrada (i jejich okraj –
  plot, stromy), les vsi a okrsek svatyně ne. Domy, pozemky, staveniště, milíř a modla s půl
  šířkou vozu (2,5 m) navíc – mezi pozemky (mezera 1 m) vůz neprojede.
- **Rychlosti** (Martin, 19. 10. 2026: souhlas s návrhem „odstupňování podle druhu cesty, jako
  u chůze“; čísla **návrh Clauda** – `CART_SPEED` v `rules.ts`, `cartPartSpeed` a `cartRoadSpeed`
  v `paths/cart.ts`). Dřív byla vozu každá pevná cesta stejná (0,6 m louky na metr = 1,67×) a
  mokřinu na cestě necítil. Rychlost proti louce, cena buňky = 1 / rychlost:

  | Kudy                                                              | Rychlost vozu                                   |
  | ----------------------------------------------------------------- | ----------------------------------------------- |
  | louka, úhor, příloh (výchozí)                                     | 1                                               |
  | strniště (žeň po strništi, připravený díl do osevu)               | 0,8                                             |
  | zoraný díl (zakládaný – rozrývaný drn)                            | 0,6                                             |
  | mokřina bez cesty                                                 | 0,55                                            |
  | vyšlapaná cesta                                                   | 1,3                                             |
  | vyježděná cesta (vyšlapaná s příznakem vozová)                    | 1,6                                             |
  | upravená cesta                                                    | 1,8                                             |
  | hať                                                               | 1,8, i přes mokřinu                             |
  | vozová cesta (zpevněné koleje – roads.md, Vozová cesta)           | 2,2, i přes mokřinu                             |
  | vyšlapaná, vyježděná nebo upravená cesta přes mokřinu             | 0,55 (bahno – jako bez cesty)                   |
  | brod                                                              | 0,33 jako dřív (i pod hatí – lávka je pro pěší) |
  | stoupání, osetý díl, křoviny, les bez cesty, sad, hřbitov, ohrada | beze změny                                      |
  - **Mokřina na ose cesty** je z `Road.ground` (stejná data jako chůze – `roadPieceCost` ve
    `walking.ts`): `cartVillageOf` přidá úsekům vsi sítě pěšin jejich půdu podle id, buňka cesty
    je mokrá, když na ni připadá bod osy v mokřině (body po třetině buňky; v buňce víc cest
    nejrychlejší). Cesta bez údaje je suchá jako u chůze. Mokřina mimo cestu je z příznaku
    terénu jako dřív.
  - **Na poli platí nejpomalejší** z povrchu (mokřina) a dílu, ne součin – jako u chůze (dřív
    zoraný díl v mokřině 1,8 × 1,6). Pod pevnou cestou jen cesta (strniště, zoraný díl i mokřina –
    mokřinu tam pozná osa cesty).
  - **Připravený díl je strniště** (rozhodnutí Clauda): vozová síť zná díl jen podle stadia
    a dosah žně (`harvestReachState`) vidí sklízené díly jako připravené – vůz po nich jede
    po strništi. Skutečně připravený díl (založený, čeká na osev) do osevu sesedne – jede se po
    něm stejně; zakládaný díl (drn se právě rozrývá) jako zoraný. Díl plánu po orbě je osetý –
    vůz po něm nejede (beze změny).
  - **Co se změní samo:** vše, co bere cenu vozové sítě – cesta spřežení k orbě (`tripCost`
    v `plough-trip.ts`, `TEAM_TRAVEL`), dosah svozu (mez hledání `maxCost`), trasy vozů dne ve
    scéně a roční síť vozů (vyjeté cesty). Vlkov (stav 27. 4. 796): cesta spřežení k bloku jaře
    497 → 485 m louky (−2,4 %), k bloku luštěnin 418 → 416 m louky (vůz jede delší trasou po
    upravené cestě – 422 → 467 m), k bloku ozimu beze změny (1 107 m louky); průměr k 246 dílům
    plánu 595 → 593 m louky; dosah svozu žně beze změny. Ve Vlkově je 10 upravených cest
    (rychlejší než dřív), 3 vyšlapané (pomalejší) a 3 vyježděné (o málo pomalejší), mokřina na
    cestách žádná.

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
- **Vyježděné cesty** (roads.md – Vozové cesty): roční kontrola 1. 11. spočítá trasy jízd za rok
  (`annualCartNetwork` – průměr na den) a provoz vozů po buňkách. Kudy vozy dva roky po sobě jezdí
  aspoň **0,25 jízdy denně** (≈ 90 jízd za rok – `CART_ROADS`), patří provoz vyježděné cestě –
  v kódu pevná cesta s příznakem **vozová** (`Road.cart`; vyježděná = vyšlapaná s příznakem,
  `roadKind`). Body letošních úseků vozů, které leží i na loňských, třídí `formCartRoads` po
  trasách (`CartPoint`):
  - po cestě, kterou vozy už mají (vyježděná, upravená, hať – do 5 m od osy, nebo souběžně do
    12 m), nebo napříč přes pevnou cestu – provoz patří jí;
  - po vyšlapané cestě bez vozů (do 5 m, stejným směrem – do ≈ 37°) – **vyšlapaná ji převezme**
    (`takeOverRoads`): kus aspoň 15 m (u kratší cesty aspoň polovina, zbytek kratší než 15 m se
    přidá) dostane příznak; celá cesta celá, jinak se v koncích kusu rozdělí – vozová a pěší cesta
    jsou dva úseky, hráč je vidí jako jednu cestu (roads.md – Cesta pro hráče);
  - souběžně kus vedle vyšlapané cesty (5–12 m, vozy její osou nejedou – sráz, plot, oblouk
    vozu): souvislý kus aspoň 25 m dá **novou vyježděnou cestu po ose vozu** a souběžný kus
    vyšlapané pak zmizí (`mergeParallelRoads` – vozová je silnější; osa vozu je pro vůz lepší),
    kratší kus vyšlapanou převezme;
  - jinde nová vyježděná cesta (konec u pevné cesty se k ní připojí).
    Provoz vozů se tak neztratí a dvě souběžné cesty nevzniknou (dřív: kudy vozy jely kus vedle
    vyšlapané cesty, nebo jen po části úseku, medián provozu vozů po ose byl ≈ 0 – příznak nepřišel –
    a nová cesta vedle nevznikla, protože ji zakázala souběžnost). Ve svahu vznikne serpentina vedle
    rovné pěšiny (nejsou souběžné). Pevná cesta, po které vozy jezdí po celé délce (provoz vozů
    `Road.cartTraffic` – medián po ose, posledních 5 let), příznak dostane i celá. Vyježděná cesta,
    kudy 5 let vozy jezdí pod polovinou, je zase jen vyšlapaná. Kus cesty, kudy jezdí vozy,
    nezaroste. Vozová a pěší cesta se nespojují do jednoho úseku; u souběžných cest je vozová
    silnější.
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
- Svoz fáze 1 už jezdí po síti (část fáze 1 – Dosah vozu); vozy ve scéně a ikona vozu v panelu
  cesty – fáze 3.

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
  řemesel), zboží (pytle, soudek medu, balík kožešin), voda (stojící sudy s víkem, čepem
  a provazem ke korbě – Co vozy vozí), ruda (hrbolatá hromada rezavých hrud nad bočnice a volné
  hroudy – crafts.md, Uhlí a ruda kováře). Prázdný vůz bez nákladu.
- **Ve scéně:** `cart-layout.ts` (čisté funkce – trasa, póza vozu se spřežením v čase t, sklon
  a náklon podle terénu pod koly) a `cart-renderer.ts` (kreslení v instancích). Data přijdou
  z jádra jako trasa vozu (lomená čára), druh a náklad.
- **Tesař:** `tools/blender/crafts.py` (`tesar.glb`) – polozemnice s předsazeným přístřeškem jako
  hrnčíř a kovář, pod ním dva kozlíky s otesávaným trámem, špalek se zaseknutou sekerou,
  rozdělané kolo na špalcích, hotová kola opřená o stěnu a o zásobu trámů, hobliny. Staveniště po
  fázích (`village-construction.ts` – druh `tesar`, fáze `carpentry` a `workshop`), ikona
  `icons/build/tesar.png`. Herní řemeslo `carpenter` má ve scéně model `tesar`
  (`CRAFT_MODEL` v `workshop-layout.ts`).

## Jak je postavené – fáze 3 (vozy ve scéně)

Návrh Clauda (19. 10. 2026) – jen zobrazení, simulace se nemění.

- **Trasa dne ze serveru:** `SceneVillage.carts` (`sceneCarts` ve `village-view-crafts.ts`) nese u vozu,
  který dnes jede, náklad (`job.load` – snopy při žni, seno při seči, klády ke stavbě, zboží
  výpravy) a trasu (`route`): osa vozové sítě (`villageCartRoutes` – stejná funkce jako dosah
  svozu, žeň po strništi sklízené plodiny) od ohrady k místu dnešní práce – díl na čele žně nebo
  seče nejblíž těžišti dnešních dílů, políčko louky, strom stavby. Výprava: od ohrady na začátek
  zemské stezky a po ní ke kraji mapy. Osa zjednodušená (odchylka 0,6 m, nejvýš 80 bodů, po cm).
  Kam vůz nedojede, trasu nemá a stojí.
- **Ve scéně** (`village-carts.ts`, kreslí `cart-renderer.ts` ve `VillageRenderer`): vůz s trasou
  jede **tam a zpět** se spřežením a honákem – prázdný k cíli, tam chvíli stojí (nakládá), plný
  zpátky, u ohrady skládá. Vůz se neotočí na místě: za cílem a u ohrady objede smyčku obratiště
  (`shuttleRoute`, dvoukolák poloměr 3,5 m, čtyřkolák 6 m). Výprava jede naložená tam i zpět
  dokola tempem volů jako nosiči. Vůz bez jízdy stojí venku u boční stěny ohrady (dvoukolák
  skloněný na oj, čtyřkolák s ojí na zemi), voli jsou v ohradě.
- **Tempo – ladicí zrychlení s orbou** (rozhodnutí Clauda): svoz používá stejný přepínač jako orba
  za herní den (`PLOUGH_DAY_DEBUG`) – jedno místo pro „práce dne za herní den“. Vůz za herní den
  udělá tolik jízd, kolik se jich vejde při 4 m/s (≈ 4,5× tempo volů), nejvýš 8 (jako v jádru)
  a aspoň jednu – dlouhá trasa se jede rychleji. Den se opakuje (den končí i začíná u ohrady),
  takže nová trasa dalšího dne navazuje bez skoku. Bez přepínače vůz jezdí dokola tempem volů
  (0,85 m/s ≈ 3 km/h). Pohyb je čistá funkce skutečného času, kreslí se jen v záběru v taktu
  `WATER_FPS`, při omezeném pohybu stojí u cíle naložený.
- **Voli táhnou buď rádlo, nebo vůz:** jádro vozí jen se spřežením, které ten den neorá; scéna to
  respektuje – orba dostane jen spřežení, která nejedou s vozem (`draftTeamsToday`), a voli
  spřežení na cestě nestojí v ohradě (`penHerds`). Honák jde s vozem, u svozu zůstane nakladač
  (postavy – `villager-plan.ts`).
- **Druhy vozů** mají ve scéně stejné názvy jako v jádru (`two-wheel`, `four-wheel`).
- **Panel cesty:** vyšlapaná cesta s vozy je druh **Vyježděná cesta** (`roadKind` →
  `VillageRoad.roadKind` a rozpis `kinds`, portrét `icons/build/cesta-vyjezdena.png` z
  `tools/blender/icons.py`); upravená cesta a hať s vozy zůstanou upravenou a hatí.
- **Ukázky:** `/dev/landscape` **Vozy ve svahu** – bez vozové cesty vůz stojí u ohrady, s ní
  dvoukolák a pak čtyřkolák vozí snopy z dílu nahoře serpentinami po vyjeté cestě (den ukázky
  86 s – `LandscapeScene.setWorkDayClock`); `/dev/buildings` **Vozy** beze změny.

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                                                                                                                                                                                     | Kdo                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vůz jede tolikrát, kolikrát se naplní, zbytek nesou lidé rovnoměrně mezi jízdy; klády s vozem vždy na voze, bez něj dva lidé na kládu; v panelu vozu nosnost a náklad                                                                                                                                                                          | Martin (22. 10. 2026)                                              |
| Vozy vozí seno, snopy, klády a zboží obchodu místo nosičů                                                                                                                                                                                                                                                                                      | Martin (19. 10. 2026)                                              |
| Vozy mají vlastní síť – nevyjedou prudký svah, vyjezdí serpentiny a vlastní cesty                                                                                                                                                                                                                                                              | Martin                                                             |
| Tesař vyrábí vozy, dřevěné nářadí (mírně celá ves) a výrazně zrychlí dřevěné části staveb                                                                                                                                                                                                                                                      | Martin                                                             |
| Tesař nestaví specializované stavby – jen pomáhá ostatním                                                                                                                                                                                                                                                                                      | Martin                                                             |
| Dílna tesaře jako ostatní dílny; klády, nástroje od kováře; podle potřeby a volný čas                                                                                                                                                                                                                                                          | návrh Clauda                                                       |
| Účinek jako meze produktivity – pokrytí tesařem u staveb, pokrytí nářadím u prací                                                                                                                                                                                                                                                              | návrh Clauda                                                       |
| Vůz = zásoba vsi u ohrady, táhnou ho voli ze spřežení (ve dny orby orají)                                                                                                                                                                                                                                                                      | návrh Clauda                                                       |
| Sklon ve směru jízdy s mezí (serpentiny vzniknou samy); les jen po cestě; lávka jen pěší                                                                                                                                                                                                                                                       | návrh Clauda                                                       |
| Vyjetá cesta = pevná cesta s příznakem vozová z ročního provozu vozů                                                                                                                                                                                                                                                                           | návrh Clauda                                                       |
| Most zatím ne – vůz přejede potok brodem nebo po hati                                                                                                                                                                                                                                                                                          | Martin (19. 10. 2026)                                              |
| Jeden vůz na spřežení                                                                                                                                                                                                                                                                                                                          | návrh Clauda                                                       |
| Dva vozy z 0 A.D. – dvoukolák (základní) a čtyřkolák (víc nákladu, obchod)                                                                                                                                                                                                                                                                     | Martin (19. 10. 2026)                                              |
| Fáze 1: čísla podle rešerše, pořadí práce tesaře, pokrytí tesařem z vedení party                                                                                                                                                                                                                                                               | návrh Clauda                                                       |
| Čtyřkolák navíc k dvoukolákům, jen s hotovou stezkou; vůz slouží 10 let                                                                                                                                                                                                                                                                        | návrh Clauda                                                       |
| Vůz za den = 8 nosičů se 2 lidmi; odnos snopů, čtvrtina seče, polovina dovozu klád                                                                                                                                                                                                                                                             | návrh Clauda                                                       |
| Dosah vozu jako rozhraní; fáze 1 zástupně rovně po louce, bez lesa a vody, sklon do 12 %                                                                                                                                                                                                                                                       | návrh Clauda                                                       |
| Svoz po vozové síti, dosah jednou za úlohu; žeň po strništi sklízené plodiny                                                                                                                                                                                                                                                                   | návrh Clauda                                                       |
| Fáze 2: 16 směrů na mřížce pěšin, směr jízdy ve stavu hledání, mez sklonu 10 %                                                                                                                                                                                                                                                                 | návrh Clauda                                                       |
| Pevná cesta pro vůz sjízdná vždy; vůz vyjede kdekoli u ohrady se spřežením                                                                                                                                                                                                                                                                     | návrh Clauda                                                       |
| Vyjetá cesta 0,25 jízdy denně 2 roky; jedna zemská stezka, sjízdnost `axisCartCheck`                                                                                                                                                                                                                                                           | návrh Clauda                                                       |
| „Pokud nějakou cestu vyjezdí vůz, bude to vyježděná cesta.“                                                                                                                                                                                                                                                                                    | Martin (19. 10. 2026)                                              |
| „Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“                                                                                                                                                                                                                                                                      | Martin (19. 10. 2026)                                              |
| Vyježděná = vyšlapaná s příznakem vozová, pro hráče vlastní druh; upravená a hať zůstanou                                                                                                                                                                                                                                                      | návrh Clauda                                                       |
| Vozy po vyšlapané převezmou kus (rozdělí úsek); souběžně vedle od 25 m převezme osa vozu                                                                                                                                                                                                                                                       | návrh Clauda                                                       |
| Kola vozů točí matice instance podle ujeté dráhy (ne VAT); vlastní oj ke jhu volů                                                                                                                                                                                                                                                              | návrh Clauda                                                       |
| Fáze 3: trasa dne ze serveru, tam a zpět se smyčkami obratišť, svoz zrychleně s orbou                                                                                                                                                                                                                                                          | návrh Clauda                                                       |
| Rychlosti vozu odstupňované podle druhu cesty, jako u chůze                                                                                                                                                                                                                                                                                    | Martin (19. 10. 2026)                                              |
| Čísla rychlostí vozu (vyšlapaná 1,3, vyježděná 1,6, upravená a hať 1,8, mokřina 0,55…)                                                                                                                                                                                                                                                         | návrh Clauda                                                       |
| Vozová cesta pro vůz 2,2, pěšky 1,7, v mokřině jako hať, brod zůstává (roads.md)                                                                                                                                                                                                                                                               | Martin: „bude vozu dávat ještě větší rychlost“; čísla návrh Clauda |
| Mokřina na cestě z `Road.ground` jako chůze; na poli nejpomalejší; připravený = strniště                                                                                                                                                                                                                                                       | návrh Clauda                                                       |
| „Pokud budou mít k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“                                                                                                                                                                                                                                                        | Martin (19. 10. 2026)                                              |
| Mimo svoz a klády v pořadí uhlí – osivo – voda; voli neorají ani orbu navíc                                                                                                                                                                                                                                                                    | návrh Clauda                                                       |
| ~~Uhlí: vůz nahradí odnos (pětina vytahání), jízdy z práce uhlíře~~, 300 kg na jízdu                                                                                                                                                                                                                                                           | návrh Clauda                                                       |
| „kováři přiveze uhlí sedlák s vozem (a odečte se jeho práce). To samé u těžení rudy.“                                                                                                                                                                                                                                                          | Martin (20. 10. 2026)                                              |
| Uhlí a ruda: sedlák z práce vsi před úlohami dne, jen když ušetří proti nošení kovárny                                                                                                                                                                                                                                                         | návrh Clauda                                                       |
| Ruda: dávka na celý vůz (400 kg) čeká na hromadě, kovář jede se sedlákem                                                                                                                                                                                                                                                                       | rozhodnutí Clauda                                                  |
| Pořadí mimo svoz: uhlí – ruda – osivo – voda                                                                                                                                                                                                                                                                                                   | návrh Clauda                                                       |
| Osivo: desetina setí, jako odnos snopů (8 nosičů se 2 lidmi)                                                                                                                                                                                                                                                                                   | návrh Clauda                                                       |
| Voda: 10 l na člověka, sudy 300 l, jen domácnostem, kterým jízda ušetří práci                                                                                                                                                                                                                                                                  | návrh Clauda                                                       |
| Voda vozem – posádka v denním minimu; břeh nejblíž ohradě, kam vůz sjede                                                                                                                                                                                                                                                                       | návrh Clauda                                                       |
| Ve scéně sudy na voze tam i zpět; voda, uhlí a osivo tempem volů ve skutečném čase                                                                                                                                                                                                                                                             | návrh Clauda                                                       |
| „Vesnice určitě potřebuje více vozů. Ať to funguje jako se stády - ohrada pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí zvětšit. Zaároveň to udělej tak, že rádlo táhnou 2 voli, 4kolový vůz také dva voli a dvoukolový vůz jeden vůl. Napiš návrh, co všechno se dá vozit na vozech a jakých.“ | Martin (20. 10. 2026)                                              |
| Další vůz, když ušetří víc práce za rok, než stojí (tesař na 10 let, seno a výcvik volů navíc); tabulka nákladů                                                                                                                                                                                                                                | návrh Clauda, Martin („Ano, udělej to jak říkáš“)                  |
| Úspora z loňského provozu: dnešní nošení, jízdy pro uhlí a vodu, nosiči výprav; rok vozů od 1. 11., aspoň 300 dní                                                                                                                                                                                                                              | rozhodnutí Clauda                                                  |
| Dvoukolák s oplením a jednoduchým jhem pro jednoho vola                                                                                                                                                                                                                                                                                        | rozhodnutí Clauda                                                  |
| ~~Čtyřkolák jen po pevných cestách a 40 m kolem ohrady volů~~; flotila dne – čtyřkoláky napřed podél cest                                                                                                                                                                                                                                      | návrh Clauda, Martin („Ano, udělej to jak říkáš“)                  |
| „Po strništích a loukách může libovolně“ – čtyřkolák mimo pevné cesty kamkoli, zoraný díl ne                                                                                                                                                                                                                                                   | Martin                                                             |
| Uhlí a vodu veze levnější vůz (práce na kg); ruda, hlína a osivo dvoukolák                                                                                                                                                                                                                                                                     | návrh Clauda, Martin („Ano, udělej to jak říkáš“)                  |
| Rok vozů po dnech (nošení podél cest a jinam, jízdy, den orby), 1. 11. tabulka úspor podle počtu vozů a volů                                                                                                                                                                                                                                   | rozhodnutí Clauda                                                  |
| Čtyřkolák v odhadu jen za nošení podél cest a výpravy, ne za jízdy pro uhlí a vodu                                                                                                                                                                                                                                                             | rozhodnutí Clauda                                                  |
| Vůz jede, kolikrát se naplní celý; zbytek aspoň půl vozu = jízda navíc, menší zbytek nesou lidé přesně rozdělení mezi jízdy (`TRADE.restTripShare`)                                                                                                                                                                                            | Martin 23. 10. 2026 (volba „Zbytek ≥ půl vozu“)                    |
