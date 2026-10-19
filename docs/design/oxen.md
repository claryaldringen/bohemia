# Orání rádlem – voli, ohrada, seno

Stav: schváleno 18. 10. 2026 (Martin: „Takhle je to ok“), **implementováno 18. 10. 2026** –
jádro `domain/village/oxen.ts` (ohrady, spřežení, výcvik, vracení orby motyce), `plough.ts`
(sazby orby, co rádlo zvládne), `hay.ts` (seč, zásoba, zimní krmení), orba v plánu osevu
(`year-plan.ts`, `CropWork.plough`); scéna kreslí ohradu, zvířata v ní a spřežení na čele orby
(modely z `tools/blender/plough.py` a `pen.py`). Rozhodnutí z implementace jsou v části
Implementace a v tabulce Rozhodnutí jako „rozhodnutí kontroléru“.

## Proč

Raní Slované orali rádlem taženým voly (rešerše – Beranová, Březno: kosti volů od 7. století).
Rádlo zpracuje hektar za zlomek práce motyky, ale potřebuje sehrané spřežení, ohradu, pastvu
a na zimu seno. Hráč tak dostane velkou úlevu od jarní dřiny – za cenu dlouhé přípravy a další
půdy na seno. Dobytek, dosud jen ozdoba, se tím poprvé zapojí do hry.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** spřežení volů s rádlem nahradí kopání motykou na polích v oběhu (Martin – směr).
- **Cíl:** voli se vychovají z vlastních telat a cvičí se zhruba **2 roky** (Martin – směr; Reynolds).
- **Cíl:** voli potřebují **ohradu s přístřeškem**, pastvu a na zimu **seno** (Martin).
- **Cíl:** louky na seno a úhor jako pastvina dostanou smysl.
- **Ne-cíl (teď):** mléko, maso, kůže, obchod s dobytkem, nemoci, pluh s odhrnovačkou, koně.
- **Anti-cíl:** dobytek v obydlí – raní Slované v 6.–9. století chlévy ani ustájení v zemnicích
  nedokládají, dobytek byl venku v ohradách (rešerše 18. 10. 2026 – Donat, Dostál; Martin).

## Ohrada s přístřeškem (staví hráč)

- **Stavba po čtvercích** jako pozemek polozemnice: jeden čtverec 15 × 15 m na louce, obehnaný
  **pleteným plotem se zakulacenými rohy** (Martin), v rohu jednoduchý přístřešek na sloupech
  s doškovou střechou a žlab; branka (návrh Clauda) na straně k nejbližšímu obydlí, posunutá
  po té straně k němu. **Pěšina vede k brance** (Martin, 19. 10. 2026: „každá budova by měla mít
  nějaký vchod, od kterého cesta povede“) – krmení a práce v hotové ohradě chodí brankou,
  staveniště ze všech stran; branku počítá herní jádro (`penEntrance`) pro síť pěšin i scénu
  ([paths.md](paths.md) – Vchody).
- **Natočená ohrada** (Martin, 19. 10. 2026 – všechny plošné stavby jde natáčet;
  [fields.md](fields.md), Natočené stavby): ohrada je jeden čtverec mřížky natočené po 15°
  (návrh Clauda) – [ a ] před umístěním otáčejí mřížku kolem čtverce pod kurzorem, nad jinou
  ohradou se malování chytí její mřížky. Volný střed jako pozemek polozemnice zatím nemá
  (rozhodnutí Clauda: potřeboval by vlastní způsob umisťování, natočení kolem středu políčka
  dává stejnou volnost směru, model dat volný střed unese). Kontroly jako na políčku přes
  natočený čtverec (krajina pod ním podle bodů vzorkování, výchoz, posvátná místa, překážky
  s patou ve čtverci, pole v jiné mřížce jen průnik). Ve scéně se branka k nejbližšímu obydlí,
  přístřešek v zadním rohu, žlab, stoh, zvířata, bláto, vytyčení a rozpad rozmístí v osách
  ohrady. Staré ohrady leží v mřížce krajiny beze změny.
- Cena: **40 člověkodní a 6 stromů** (kůly, přístřešek – [les](forest.md)) (návrh Clauda).
- Jedna ohrada pojme **jedno spřežení** (2 voli) a k tomu chovné krávy a telata (stádo, které dnes
  ve hře je – jedna kráva na 2 domácnosti) (návrh Clauda).
- V létě se dobytek pase venku (úhor, louky po seči – jako dnes), přes zimu stojí v ohradě a žere
  seno.
- **Ohrada bez zvířat chátrá** ([abandonment.md](abandonment.md), Martin 18. 10. 2026): do ohrady
  bez spřežení, výcviku a zimních krav se krmit nechodí; když k ní za rok nevede žádná cesta,
  chátrá a za ≈ 10 let se rozpadne a zmizí. Ohrada se zvířaty opuštěná není.

## Spřežení (cvičí se samo)

**Změna (Martin, 19. 10. 2026):** „Ať se spřežení cvičí automaticky, bez zásahu hráče. Prostě ve
chvíli, kdy mají vesničané k dispozici cokoliv, co jim ulehčí práci – zde rádlo a voly – začnou to
automaticky používat.“

**Princip pro celou hru** (Martin): co vesničanům ulehčí práci a mají to k dispozici, začnou
používat sami – hráč staví a rozhoduje o velkých věcech (stavby, pole, odchod, obchod), každodenní
využití toho, co ves má, je na vesničanech. Tak už fungují nástroje a nádoby od řemeslníků, klády
z hromady, orba spřežením, seč, porážka i obnova sadu; od 19. 10. 2026 i výcvik spřežení.

Výcvik (návrh Clauda):

- **Začne sám** kterýkoli den, kdy ohrada stojí, nic se v ní necvičí, nemá spřežení (nebo je
  spřežení v posledních 2 letech služby – náhrada), stádo má aspoň **3 krávy** (dvě telata do
  výcviku a chovná kráva), na rádlo je dřevo (kláda z hromady, nebo strom ke kácení) a v zimě
  (listopad–březen) vystačí seno volům i telatům do konce března.
- **Proč kterýkoli den a ne jednou ročně (třeba 1. 4. s mláďaty):** náhrada musí začít přesně
  8 let po vycvičení, aby starý pár dosloužil celých 10 let a nový navázal týž den (rozhodnutí
  Martina z 18. 10.); nová ohrada nečeká na jaro; „telata“ jsou mladé kusy stáda – hra věk kusů
  nevede, mláďata 1. 4. jen zvětší stádo.
- **Když telata chybí** (méně než 3 krávy): ohrada čeká a výcvik začne první den, kdy je stádo má
  – nejčastěji 1. 4. s mláďaty. Ves s ohradou drží aspoň 3 krávy na ohradu
  ([strava – Skladba stáda](diet.md)), takže telata zase přibudou.
- **Rádlo** postaví ves sama jako součást výcviku – stavba ze společné práce (5 člověkodní
  a strom), jako dřív.
- Hráč výcvik nezadává – tlačítko „Vycvičit spřežení“ zmizelo; panel ohrady ukazuje průběh výcviku
  a stáří spřežení, upozornění „Spřežení je vycvičené“ zůstává. Výcvik zadaný hráčem ve starší vsi
  doběhne beze změny, ohrada, která na hráče čekala, začne sama od dalšího vhodného dne.

Původní pravidla (18. 10. 2026; zadávání hráčem výš nahrazeno):

- V ohradě hráč zadá **„Vycvičit spřežení“** – z telat vlastního stáda se za **2 roky** vycvičí pár
  volů (Martin – směr). Mezitím je potřeba je krmit (pastva, v zimě seno); práce na péči je malá –
  pasou je děti jako dnes (návrh Clauda).
- **Rádlo** vyrobí vesničané: **1 strom a 5 člověkodní** (návrh Clauda); se železnou špičkou od
  kováře se orá rychleji – viz Účinek.
- Spřežení slouží **≈ 10 let**, pak voli zestárnou a je třeba vycvičit nové (návrh Clauda) – ohrada
  s chovnými kravami tak cvičí další pár včas, když to hráč zadá.
- **Náhradu jde cvičit jen v posledních 2 letech služby** (Martin, 18. 10. 2026 – předtím se
  v jeho vsi začal cvičit nový pár po roce služby a nový pár pak starý tříletý bez varování
  vyřadil na maso): výcvik začne nejdřív 8 let po vycvičení současného spřežení, takže náhrada je
  hotová, právě když starý pár doslouží. Dřív tlačítko zašedne s důvodem „Spřežení slouží ještě
  X let.“ Kdo chce dvě spřežení, postaví druhou ohradu.

## Seno

**Změna (Martin, 19. 10. 2026):** „Nezdá se mi, že bychom sklízeli tolik sena, že by to stáda
uživilo.“ – seno jedí v zimě i ovce a kozy, dávky odpovídají malému raně středověkému dobytku,
práce seče počítá sušení a svoz a stoh se kazí (návrh Clauda podle
[rešerše](research/2026-10-19-herds-hay-meat.md); [strava – Stáda realističtěji](diet.md)):

- **Denní dávka v zimě** (listopad–březen, 151 dní): **kráva 5 kg, vůl 6 kg** (na jaře orá),
  **ovce a koza 1 kg** (letnina počítaná jako seno), prasata nic (pasou se v lese celý rok). Za
  zimu kráva ≈ 0,75 t, vůl ≈ 0,9 t, ovce ≈ 0,15 t. Dřív 10 kg denně (1,5 t za zimu) na krávu
  i vola a ovce a kozy nic.
- **Kolik se seče:** 1. 6. ves naplánuje seno na zimní stádo, které si chce nechat (nosnost pastvy,
  lesa a pasáků zmenšená podle potřeby – diet.md), a na voly ohrad (ohrada bez spřežení počítá se
  dvěma), se ztrátou ve stohu do zkrmení (≈ 6 %).
- **Práce seče:** seč kosou (≈ akr – 0,4 ha – za den na sekáče), obracení a sušení, hrabání do
  kup, svoz a stohování – **meze 15 → 10 člověkodní na hektar** (bez kos od kováře → s nimi).
  Dřív 6 čd/ha jen za seč.
- **Stoh** ztrácí **10 % ročně** (počasí, plíseň ve vnější vrstvě) a **zbytek loňského sena se
  k nové seči (1. 6.) zkazí**.
- **Přes zimu** dostanou seno první voli, krávy, ovce a kozy se podělí o zbytek poměrně k dávce.
  **Nosnost** k porážce (1. 11.) bere seno pro všechny, kdo ho jedí – voli, krávy na mléko a voly,
  ovce, kozy, zbytek krav (diet.md – Skladba stáda). **Zimní úhyn** (1. 3.): krávy, ovce a kozy,
  které dostaly za zimu méně než polovinu přídělu, uhynou tak, aby polovinu měly ostatní; chovný pár
  přežije (diet.md – Zimní krmení a zimní úhyn). Voli beze změny (níž).

Původní pravidla (18. 10. 2026; dávka a práce výš nahrazeny):

- Voli přes zimu (listopad–březen, ≈ 150 dní) sežerou **≈ 1,5 t sena na vola**, tedy **≈ 3 t na
  spřežení** (návrh Clauda – ≈ 10 kg denně).
- Seno dávají **všechny louky** (Martin, 18. 10. 2026): přirozené louky z krajiny do **600 m**
  od obydlí (políčka louky, která nezabírá pole, sad, hřbitov, pozemek, ohrada ani obydlí)
  a úhor ve fázi louky (pastvina) – ≈ **1,5 t/ha** ročně (nehnojená louka – návrh Clauda), tedy
  ≈ **2 ha luk na spřežení**. Seče se **od nejbližší louky k obydlí a jen tolik, kolik je
  potřeba**. Sečení, sušení a stohování stojí **6 člověkodní/ha** v červnu–červenci.
- **Bez sena** voli zeslábnou: na jaře orají jen podíl odpovídající pokrytí sena (~~zbytek se dokope
  motykou~~ – od 19. 10. 2026 orají pomaleji, viz Jen rádlo); když sena chybí přes polovinu, jeden
  vůl uhyne a spřežení se rozpadne (návrh Clauda).

## Účinek na práci

- **Zpracování půdy na dílech v oběhu** (zkopaný díl po sklizni, mladý úhor 1–2 roky): místo kopání
  motykou (**100 → 50 člověkodní/ha** podle nástrojů) **orba rádlem 10 → 6 člověkodní/ha**
  (rešerše: 5–15 člověkodní/ha; meze produktivity – nejhorší dřevěná radlice, nejlepší se železnou
  špičkou od kováře podle pokrytí nástroji, [řemesla](crafts.md)). Orá oráč a honáček (2 lidé).
- ~~**Drn rádlo nezvládne** (rešerše – rádla selhávala na panenském drnu): zakládání pole na louce,
  v křovinách a v lese a vracení úhoru ve fázi louky (3+ roky) dál stojí jako dnes (motyka, mýcení).~~
  Od 19. 10. 2026 rádlo bere i drn – viz Jen rádlo.
- **Kapacita spřežení:** ≈ **0,3 ha za den** (orba křížem – dva průchody; návrh Clauda) – za jarní
  okno (březen–duben) ≈ 18 ha, za podzim víc. Jedno spřežení stačí běžné vsi; větší ves může mít víc
  ohrad a spřežení.
- Postavičky: na rozpracovaném čtverci orá spřežení (model je hotový) místo řady s motykami.

## Implementace (18. 10. 2026)

Rozhodnutí kontroléru tam, kde návrh nedává postup (Martin je může změnit):

- **Ohrada** se staví jako pozemek polozemnice – jeden čtverec louky (ne voda, les, skalní
  výchoz, posvátné místo ani zabrané políčko – čtverec pole ano: z pole zmizí,
  Martin 18. 10. 2026 – [fields.md](fields.md), Pole jako krajina), v nabídce staveb zkratka O.
  Cena jako u obydlí: 40 člověkodní v sobě mají kácení 6 stromů u blízkého lesa – stavba vezme klády z hromady,
  zbytek stromů vyhradí a skácí (dál než 100 m dráž), překážky na čtverci zaplatí prací navíc.
  Osadníci nejsou potřeba. Ohrady blokují ostatní stavby po čtvercích jako pole.
- **Výcvik:** dvě telata ze stáda krav – ves musí mít **aspoň 3 krávy** (chovná kráva zůstane).
  Rádlo je stavba ze společné práce: 5 člověkodní a strom (kláda z hromady, nebo strom ke kácení
  u ohrady). Spřežení orá, až uplynou 2 roky výcviku **a** je hotové rádlo. Ohrada se spřežením
  smí cvičit náhradu až v posledních 2 letech jeho služby (`trainingBlock` –
  `serviceYearsBeforeTraining`); nové spřežení vystřídá staré (staré jde na maso), spřežení
  starší 10 let zestárne a jde na maso (2 × 120 kg) – náhrada zadaná hned, jak smí, naváže týž
  den. **Od 19. 10. 2026** výcvik začne sám první vhodný den (Spřežení výš) – náhrada tak naváže
  vždy, když jsou telata, dřevo a seno.
- **Seno:** 1. 6. ves naplánuje seč – seno pro krávy a voly na zimu (≈ 1,5 t na kus, ohrada bez
  spřežení a výcviku počítá se dvěma voly – výcvik jde zadat kdykoli) bez zásoby, z dílů úhoru ve
  fázi louky a z přirozených luk do 600 m od nejbližší k obydlí – vzdálenost je **chůze po
  pěšinách** jako u polních prací ([paths.md](paths.md) – Pěšiny a práce; díl úhoru
  `partWalkDistance`, políčko přirozené louky přes síť pěšin vsi a pevné cesty podle stupně –
  [roads.md](roads.md), bez sítě rovně), při shodě díly
  úhoru a pak po políčkách; simulace k tomu dostává krajinu. Vzdálenost louky se uloží s plánem
  a podle ní je i práce seče. Seče se
  v červnu–červenci po dílech a políčkách jako polní práce, seno přibývá poměrně k práci.
  **Louky na seno ve scéně jsou data** (`SceneVillage.hayMeadows` – políčka přirozených luk
  v seči se vzhledem `meadow` / `mown` / `haystacks` po čele práce); dekorativní louky na seno
  zůstaly jen ve vývojové ukázce. K políčkům, kde se ten den seče, vede pěšina (sekáči – práce
  dne), pevné cesty sčítají seč za rok jako jedno místo. V listopadu–březnu žere každý kus ≈ 10 kg denně, voli první.
  Zimní krmení, voda a kydání krav a volů je práce ([strava – Práce se zvířaty](diet.md)).
  **Od 19. 10. 2026** seno na zimní stádo podle potřeby i s ovcemi a kozami, dávky, práce seče
  a ztráty ve stohu podle části Seno výš.
- **Pokrytí sena** se rozhodne **1. 3.**: co voli za zimu dostali a co jim ze zásoby zbývá na
  březen, proti potřebě celé zimy. Pod polovinu jeden vůl (nebo tele ve výcviku) uhyne,
  spřežení i výcvik se rozpadnou a druhý vůl jde na maso. Mezi polovinou a plným pokrytím ~~vrátí
  slabí voli motyce podíl zbývající orby (celé díly od konce řady orby)~~ orají slabí voli na jaře
  jen tímto podílem své kapacity (Jen rádlo).
- ~~**Co rádlo zorá:** díly bez drnu – díl po sklizni, mladý příloh a díl, kterému drn rozrušilo
  založení. Díl, který se vrací z přílohu ve fázi pastviny (vrácení stojí práci navíc), kope dál
  motyka (vrácení i kopání). … Když ves přijde o poslední spřežení, zbylou orbu (i rozpracovaný
  díl) kopou motyky – vrácené díly jdou na konec řady kopání.~~ Od 19. 10. 2026 orá spřežení
  všechno – viz Jen rádlo. Orba běží v oknech kopání, spřežení zvládnou nejvýš 0,3 ha × sazba orby
  (člověkodny) za den (obě plodiny dohromady).
- **Ve scéně** orá spřežení na čele orby – pruh u čáry práce a další den dojde dál (viz
  Spřežení postupuje s orbou; při ladění projede celou dnešní orbu – Orba za herní den); voli spřežení jsou jinak v ohradě, telata ve výcviku taky, krávy
  v zimě.

## Jen rádlo (19. 10. 2026)

Stav: **Martin, 19. 10. 2026:** „Pokud je k dispozici rádlo, kopání motykou úplně vynech. Je to
neefektivní a aspoň si nebudeme muset pamatovat, co čím bylo kopáno.“ – ruší „Drn rádlo
nezvládne“ a vracení orby motyce (Účinek na práci, Implementace výš). Podrobnosti **návrh
Clauda**:

- **Ves se spřežením orá všechno:** plán osevu k 1. 9. vznikne, když ves má vycvičené spřežení,
  s orbou celé plodiny – ozim, jař i luštěniny (`YearPlan.ard`, `CropWork.plough` se všemi díly,
  kopání 0); díly přidané během roku k plánu, který orá, orá taky. Plodina se tak buď celá orá,
  nebo celá kope – nic se nepamatuje po dílech.
- **Drn orbou křížem, 2,5× práce:** příloh ve fázi louky a louka založená rádlem se orají
  `PLOUGH_SOD_FACTOR` = 2,5× déle (25 → 15 člověkodní/ha). Rešerše (zemědělství a populace)
  číslo pro rádlo na drnu nemá – rádla na panenském drnu jedním průchodem selhávala (Butser), drn
  motykou je ≈ 2,5× pomalejší než lehká půda (Semjonov) – stejný poměr pro opakovanou orbu křížem.
  Jde do ceny orby i do kapacity spřežení (kapacita je v člověkodnech orby, takže drnu zorá
  spřežení za den 2,5× méně). Pořád je to zlomek motyky (drn 100 + kopání 100).
- **Křoviny a mladý les** se při vrácení klučí ručně jako dřív (keře a kořeny rádlo neprojede,
  drn s kořeny tím zmizí), pak se orají běžně.
- **Založení pole na louce:** ves se spřežením louku motykou nezakládá – zaplatí jen překážky
  (bez překážek je díl připravený hned) a díl nese drn (`FieldPart.sod`) do první orby. Křoviny
  a les se zakládají jako dřív. Když ves spřežení do plánu ztratí, drn rozruší motyka jako vrácení
  louky. Cena u kurzoru podle `PlacementVillage.ploughTeam` (v prohlížeči `SceneVillage.ploughTeam`).
- **Kapacita:** plán osevu (`chooseCrops`, `sowingCapacity`) hlídá i orbu spřežení v jejích
  oknech – ozim v září–říjnu (bez posledního dne, ať se zaseje i poslední zoraný pruh), jař
  a luštěniny na podzim, kolik po ozimu zbude, a zbytek v březnu–dubnu. Co spřežení nestihnou,
  ves nezaseje (motyka nepomůže); víc ohrad se spřežením = víc kapacity. Orbu dál dělají lidé
  (oráč a honáček), proto se počítá i do práce lidí. Jedno spřežení zorá za podzim ≈ 27 ha a na
  jaře ≈ 18 ha bez drnu – běžná ves osévá jednotky hektarů, hladovět kvůli tomu nebude; osev podle
  zásob a pojistka platí dál.
- **Slabí voli po zimě** (pokrytí sena k 1. 3. mezi polovinou a 1): orají v březnu–dubnu jen tímto
  podílem své denní kapacity (`team.weak`), co nezorají, se nezaseje.
- **Ztráta posledního spřežení během roku** (vůl uhynul, spřežení dosloužilo bez náhrady): letošní
  plán dokončí motyka (`ploughToHoe`) – zorané díly zůstanou, zbytek se dokope (drn i s vrácením
  louky), jen letos; od 1. 9. vznikne plán bez orby. Proč: plán vznikl s kapacitou spřežení – bez
  něj by ves nezasela nic, co ještě nezorala, a v nejhorším případě (úhyn 1. 3.) by přišla o celou
  jař; motyka je nouzové řešení do konce roku, nic se nepamatuje.
- **Starší vsi:** rozběhnutý plán z doby, kdy spřežení oralo jen díly bez drnu a zbytek kopala
  motyka, doběhne (váhy orby a kopání – `digWeight`); vracení dílů motyce (`returned`) zmizelo. Nové
  pravidlo platí od dalšího plánu k 1. 9.
- **Vzhled:** kulaté rohy (Kulaté rohy níž) platí pro všechna pole vsi, která letos orá
  (`ploughsThisYear` – plán vznikl se spřežením), místo příznaku po dílech; díl s drnem je před
  orbou pastvina.
- **Kalibrace se nemění** – hráč skriptu ohrady nestaví. Informační sonda „plná domácnost se
  spřežením“ v `measure-village.ts` ukazuje orbu, osev a práci na obživu.

## Spřežení postupuje s orbou (19. 10. 2026)

Stav: **Martin, 19. 10. 2026** schválil směr – spřežení ať ve scéně postupuje po čtvercích, jak
orba skutečně postupuje, stejně jako se mění vzhled dílů ([fields.md](fields.md) – Postup práce po
čtvercích). Podrobnosti **návrh Clauda** (jen zobrazení, simulace se nemění):

- **Kde orá:** na dílu, přes který dnes orba postoupila – na čele (rozpracovaný díl fronty `parts`
  podílu práce orby, bez něj poslední díl dnešní fronty). Na dílu jde **po pruhu u čáry práce**:
  řady podél řádků pole a pruh napříč od strany blíž vsi, přesně jako obtisk rozpracovaného dílu
  (hotová část je zoraná, čára práce po osminách dílu) – spřežení orá tu část, která se ten den
  změnila na zoranou. Pruh končí na čáře, sahá nejvýš **4 řady (10 m)** zpět do zorané části
  a má aspoň **2 řady (3,75 m)** – na začátku dílu, kde je zorané méně, kus za čáru. Řady po
  ≈ 2,5 m jako dřív.
- **Proč jen čelo, ne všechny dnešní díly:** spřežení orá 0,3 ha za herní den, tj. ≈ 13 čtverců,
  herní den ale trvá ≈ 86 s a voli skutečnou rychlostí (0,7 m/s) za tu dobu zorají ≈ 2 řady
  jednoho čtverce. Projít všechny dnešní díly by znamenalo hnát voly třináctkrát rychleji (jako
  zvířata „na koksu“, která Martin nechtěl). Obtisk pole se mění jednou za herní den, takže
  spřežení na čele – u čáry, kterou obtisk ukazuje – drží se scénou krok.
- **Další den dojde na nové čelo pěšky**, ne skokem (jako lidé – postavy): z místa, kde zrovna je,
  jde rovně krokem ≈ 1 m/s s nadzvednutým rádlem a naváže na novou dráhu bez skoku (na začátku
  a konci se plynule natočí). Posun delší než **60 m** (víc než půl herního dne chůze) se nejde –
  spřežení je rovnou na novém místě, stejně jako lidé při dlouhém přechodu; při omezeném pohybu
  stojí rovnou na novém místě.
- **Víc spřežení** (víc ohrad s vycvičenými voly): každé na jiném dílu dnešní fronty – první na
  čele, další na nejčerstvějších dílech, kam jeho dráha i se souvratěmi nesahá (obrys dílu
  prodloužený o dosah rádla a obrat). Když takový díl není (dnes se oralo málo), orají **dvě
  spřežení jeden díl** – každé půlku (7,5 m napříč), stejnou dráhou posunutou napříč, takže jdou
  v zákrytu a nikdy se nesrazí (na souvrati jedno za druhým, mezera ≈ 2 m). Spřežení, které se na
  čelo nevejde, zůstane ten den v ohradě (ohrady podle id).
- **Natočené pole** (fields.md – Natočené stavby): řady a pruh v osách natočeného čtverce.

## Kulaté rohy (19. 10. 2026)

Stav: **Martin, 19. 10. 2026:** „Pokud bude orat spřežení rádlem, spřežení se musí otočit, takže
zorané pole nikdy nebude mít ostré rohy, ale kulaté rohy podle toho, jak se volské spřežení
otáčí.“ Podrobnosti **návrh Clauda** (jen vzhled):

- **Poloměr rohu 5 m:** radlice jede o dosah oje (≈ 3,3 m ve scéně) za jhem a jho se otáčí po
  oblouku ≈ 1,9 m (obrat na souvrati) – blíž než ≈ 5 m do rohu spřežení s radlicí v zemi nedojede.
  Z rozsahu 3–5 m horní mez – je i vidět (měkký okraj pole má 1,6 m).
- **Jen vnější rohy celého pole** – roh, u kterého ani jeden ze tří sousedních čtverců do pole
  (ani do sousedního pole) nepatří. Vnitřní rohy, styky dílů a styk s jiným polem zůstanou jako
  dřív. ~~**Rozhoduje díl, kterému roh patří:** díl oraný rádlem (orba plodiny na něm letos
  začala – `PartView.ploughed` z herního jádra) má roh kulatý, díl kopaný motykou ostrý.~~ Od 19. 10. 2026 (Jen rádlo) rozhoduje stav vsi: ves, která letos orá, má kulaté rohy všech polí,
  ves, která kope, ostré. V rohu zůstane tráva louky a nestojí tam trsy obilí.
- **Plochu dílu (úrodu) roh neubírá:** roh vezme (1 − π/4) · 5² ≈ 5,4 m² – u čtverce 225 m² 2,4 %
  na roh, ale pole o desítkách dílů má rohů jen pár (obdélník 4) – desetiny procenta úrody, a to
  jen u polí oraných rádlem. Jádro proto počítá s celou plochou.
- **Dráha spřežení** v rohu končí řady na stejném oblouku (`rowExtent`) a radlice se tam zvedá
  (`outsideSquare`) – spřežení se otáčí po oblouku, jaký kreslí obtisk.

## Orba za herní den (19. 10. 2026, ladicí)

Stav: **Martin, 19. 10. 2026:** „Vím, že to bude divně zrychlené, ale až bude probíhat orba
pomocí spřežení, potřeboval bych, aby spřežení projelo opravdu všechna obdělávaná políčka
a nechávalo za sebou brázdu. Tak budu moci určit, jak se to chová.“ – **ruší rozhodnutí „jen
čelo dne, skutečné tempo volů“** (Spřežení postupuje s orbou výš) po dobu ladění. Podrobnosti
**návrh Clauda**:

- **Ladicí přepínač** `PLOUGH_DAY_DEBUG` (`apps/web/lib/scene/plough-day.ts`): true – celá
  dnešní orba za herní den, false – zpět skutečné tempo a jen pruh u čela dne.
- **Celá dnešní orba:** herní jádro posílá u orby ke každému dílu dnešní fronty, kolik orby
  bylo hotovo ráno a večer (`progress`); scéna z toho udělá pruhy dílů (po pruzích obtisku, ať
  na konci dne sedí s polem dalšího dne) a spřežení je projede v pořadí práce řadu po řadě
  s obraty na souvrati (kulaté rohy platí) – od chvíle, kdy přišel plán dne, do konce herního dne
  (≈ 86 s), tempo zrychlené, kolik je třeba. Mezi díly a od místa, kde spřežení stálo, jde krokem
  se zvednutým rádlem, zrychleně stejně.
- **Brázda:** pole na začátku dne ukáže dnešní díly ještě nezorané (ranní stav) a za radlicí
  přibývá zoraná plocha přesně tam, kudy projela – pás každé řady (čistá funkce času
  `routeFurrows`, obtisk přestavovaný v taktu animací, nejvýš 30× za sekundu). Na konci dne pásy
  pokryjí dnešní pruhy – pole dalšího dne je stejné.
- **Víc spřežení** si dnešní díly rozdělí po souvislých kusech fronty (zhruba stejně velkých),
  spřežení navíc zůstanou v ohradě.
- **Při omezeném pohybu** (a bez hodin herního dne) se orba za den nepřehrává – pole ukáže
  konec dne a spřežení stojí na čele jako dřív.

## Co hráč vidí

- V nabídce staveb **ohrada** (název a cena v tooltipu).
- V panelu ohrady: zvířata (ikony + čísla), průběh cvičení spřežení, zásoba sena na zimu; kolik
  let spřežení ještě slouží a kolik dní výcviku zbývá – ikona přesýpacích hodin (Martin: slunce
  nebylo srozumitelné). Tlačítko výcviku není – spřežení se cvičí samo (Martin, 19. 10. 2026).
- V horní liště **seno** (ikona + číslo), když ves má dobytek v ohradě.
- Ve scéně: ohrada s přístřeškem, v zimě voli a krávy v ohradě, stohy sena, na jaře a na podzim
  spřežení orá pole čtverec po čtverci – na čele orby u čáry, kde se zem mění na zoranou, a každý
  den dojde dál.

## Rozhodnutí

| Rozhodnutí                                                                                  | Kdo                           |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| Orání rádlem s voly; voli z vlastních telat, výcvik ≈ 2 roky; pastva a seno; rádlo ze dřeva | návrh Clauda, Martin – směr   |
| Ohrada s přístřeškem z pleteného plotu se zakulacenými rohy (žádný dobytek v obydlí)        | Martin (rešerše 18. 10. 2026) |
| Ohrada 1 čtverec, 40 čd + 6 stromů; 1 spřežení na ohradu; spřežení slouží ≈ 10 let          | návrh Clauda                  |
| Seno 1,5 t na vola za zimu, louka 1,5 t/ha, sečení 6 čd/ha; bez sena slabší orba / úhyn     | návrh Clauda                  |
| Orba 10 → 6 čd/ha místo kopání 100 → 50; drn rádlo nezvládne; spřežení ≈ 0,3 ha/den         | návrh Clauda (rešerše)        |
| Výcvik z aspoň 3 krav; rádlo jako stavba; seč 1. 6. pro krávy a 2 voly na ohradu            | rozhodnutí kontroléru         |
| Náhrada spřežení jen v posledních 2 letech služby; dvě spřežení = druhá ohrada              | Martin (18. 10. 2026)         |
| Zbývající služba a dny výcviku s ikonou přesýpacích hodin (místo slunce)                    | Martin (18. 10. 2026)         |
| Pokrytí sena k 1. 3.; vracení orby motyce po celých dílech                                  | rozhodnutí kontroléru         |
| Seno ze všech luk – přirozené louky i úhor ve fázi louky, od nejbližší, jen kolik je třeba  | Martin (18. 10. 2026)         |
| Přirozené louky do 600 m od obydlí; louky na seno ve scéně z dat                            | návrh Clauda                  |
| Ohrada smí na pole – čtverec pole pod ní z pole zmizí                                       | Martin (18. 10. 2026)         |
| Spřežení postupuje s orbou po čtvercích                                                     | Martin (19. 10. 2026)         |
| Kulaté rohy zorané plochy podle obratu spřežení                                             | Martin (19. 10. 2026)         |
| Roh 5 m, jen vnější rohy oraných dílů, úrodu neubírá                                        | návrh Clauda                  |
| Ladění: spřežení projede celou dnešní orbu za herní den a nechává brázdu                    | Martin (19. 10. 2026)         |
| Jen rádlo – ves se spřežením orá všechno, motykou nekope (i drn a louka při založení)       | Martin (19. 10. 2026)         |
| Drn orbou křížem 2,5×; kapacita spřežení v plánu osevu; slabí voli orají pomaleji           | návrh Clauda                  |
| Ztráta spřežení během roku – letošní plán dokončí motyka; kulaté rohy podle stavu vsi       | návrh Clauda                  |
| Ladicí přepínač, pruhy po pruzích obtisku, víc spřežení po souvislých kusech                | návrh Clauda                  |
| Pruh u čáry práce (2–4 řady), jen čelo dne, přechod pěšky do 60 m, dvě spřežení na díl      | návrh Clauda                  |
| Seno i pro ovce a kozy; dávky malého dobytka; práce seče se sušením a svozem                | Martin (19. 10. 2026)         |
| Kráva 5, vůl 6, ovce a koza 1 kg denně; seč 15 → 10 čd/ha; stoh 10 %/rok                    | návrh Clauda (rešerše)        |
| Staré seno se k nové seči zkazí; seče se na zimní stádo podle potřeby                       | návrh Clauda                  |
| Spřežení se cvičí samo – co ulehčí práci a ves to má, vesničané používají sami              | Martin (19. 10. 2026)         |
| Výcvik začne první vhodný den (telata, dřevo, v zimě seno), rádlo staví ves sama            | návrh Clauda                  |
