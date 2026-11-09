# Orání rádlem – voli, ohrada, seno

Stav: schváleno 18. 10. 2026 (Martin: „Takhle je to ok“), **implementováno 18. 10. 2026** –
jádro `domain/village/oxen.ts` (ohrady, spřežení, výcvik, vracení orby motyce), `plough.ts`
(sazby orby, co rádlo zvládne), `hay.ts` (seč, zásoba, zimní krmení), orba v plánu osevu
(`year-plan.ts`, `CropWork.plough`); scéna kreslí ohradu, zvířata v ní a spřežení na čele orby
(modely z `tools/blender/plough.py` a `pen.py`). Rozhodnutí z implementace jsou v části
Implementace a v tabulce Rozhodnutí jako „rozhodnutí kontroléru“. **Od 20. 10. 2026** je ohrada
spřežení **ohradou volů** – voli se počítají po kusech, rádlo táhne pár, čtyřkolák pár, dvoukolák
jeden vůl a ves si sama spočítá, kolik volů chce (části Ohrada volů, voli po kusech a potah
a Kolik volů ves chce; jádro `oxen.ts` a `draft.ts`).

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

- **Stavba po čtvercích** jako hřbitov (od 19. 10. 2026 – Ohrady podle druhu níž): 1–4 čtverce
  15 × 15 m na louce pro jeden druh zvířat, obehnané **pleteným plotem se zakulacenými rohy**
  (Martin) po obrysu čtverců, v rohu prvního čtverce jednoduchý přístřešek na sloupech
  s doškovou střechou a žlab; branka (návrh Clauda) na straně k nejbližšímu obydlí, posunutá
  po té straně k němu. **Pěšina vede k brance** (Martin, 19. 10. 2026: „každá budova by měla mít
  nějaký vchod, od kterého cesta povede“) – krmení a práce v hotové ohradě chodí brankou,
  staveniště ze všech stran; branku počítá herní jádro (`penEntrance`) pro síť pěšin i scénu
  ([paths.md](paths.md) – Vchody).
- **Natočená ohrada** (Martin, 19. 10. 2026 – všechny plošné stavby jde natáčet;
  [fields.md](fields.md), Natočené stavby): ohrada jsou čtverce mřížky natočené po 15°
  (návrh Clauda) – [ a ] před umístěním otáčejí mřížku kolem čtverce pod kurzorem, nad ohradou
  téhož druhu se malování chytí její mřížky (rozšíření). Volný střed jako pozemek polozemnice zatím nemá
  (rozhodnutí Clauda: potřeboval by vlastní způsob umisťování, natočení kolem středu políčka
  dává stejnou volnost směru, model dat volný střed unese). Kontroly jako na políčku přes
  natočený čtverec (krajina pod ním podle bodů vzorkování, výchoz, posvátná místa, překážky
  s patou ve čtverci, pole v jiné mřížce jen průnik). Ve scéně se branka k nejbližšímu obydlí,
  přístřešek v zadním rohu, žlab, stoh, zvířata, bláto, vytyčení a rozpad rozmístí v osách
  ohrady. Staré ohrady leží v mřížce krajiny beze změny.
- Cena: **40 člověkodní a 6 stromů na čtverec** (kůly, přístřešek – [les](forest.md)) (návrh
  Clauda).
- ~~Ohrada spřežení pojme **jedno spřežení** (2 voli) a výcvik nového páru~~ – od 20. 10. 2026
  ohrada volů pojme 6 volů na čtverec (Ohrada volů, voli po kusech a potah); krávy a telata stojí
  v ohradě skotu, ovce, kozy a prasata každé ve své (Ohrady podle druhu).
- V létě se dobytek přes den pase venku (úhor, louky po seči – jako dnes), na noc je v ohradě;
  přes zimu skot stojí v ohradě a žere seno.
- **Ohrada bez zvířat chátrá** ([abandonment.md](abandonment.md), Martin 18. 10. 2026): do ohrady
  bez zvířat svého druhu (u spřežení bez spřežení a výcviku) se krmit nechodí; když k ní za rok
  nevede žádná cesta, chátrá a za ≈ 10 let se rozpadne a zmizí. Ohrada se zvířaty svého druhu
  opuštěná není.

## Ohrady podle druhu (19. 10. 2026)

Martin, 19. 10. 2026: „**Ještě bychom měli pořešit ohrady. Zvířata je potřeba na noc zavírat do
ohrad. Každý druh zvířete by měl mít vlastní ohradu, ať se nemíchají. Velikost ohrady by mělo jít
určovat podobně, jako když se staví hřbitov. Velikost ohrady bude mít vliv na velikost stáda.
Zároveň velikost ohrady bude omezená – má to být ohrada, ne výběh.**“ K návrhu níž: „**Ano, udělej
to tak, jak navrhuješ**“ (i výběr druhu hráčem a stáda bez ohrady u domu). Podrobnosti jsou návrh
Clauda, čísla podle [rešerše](research/2026-10-19-pens.md).

- **Na noc jsou všechna zvířata v ohradě** – stádo druhu se musí vejít do ohrad svého druhu
  (a pár kusů k domům, níž). Krávy stojí v ohradě i přes zimu jako dřív. Zahánění stád na noc ve
  scéně přijde se dnem a nocí – rozmístění zvířat v ohradě (místa ve všech čtvercích, ovce, kozy,
  prasata, krávy, voli) je připravené.
- **Každý druh má vlastní ohradu:** ovce, kozy, prasata, skot (krávy a telata) a **spřežení**
  (voli a výcvik nového páru – s kravami se nemíchají; výcvik jde jen v ohradě spřežení, ~~druhé
  spřežení = druhá ohrada spřežení~~, telata na výcvik dál ze stáda krav). Od 20. 10. 2026 je to
  **ohrada volů** s 6 voly na čtverec (Ohrada volů, voli po kusech a potah).
- **Velikost se maluje po čtvercích jako hřbitov:** čtverce navazující stranou na ohradu téhož
  druhu (ve stejné mřížce) ji rozšíří – stejná ohrada, stavba rozšíření, do jejího dokončení se
  nové čtverce nepočítají; na dvě ohrady téhož druhu navázat nejde; čtverec vedle ohrady jiného
  druhu je nová ohrada (nemíchají se). Ohrada má **nejvýš 4 čtverce** (≈ 900 m², „ohrada, ne
  výběh“), souvislé stranou. Cena po čtvercích – 40 čd a 6 stromů na čtverec.
- **Kapacita podle plochy** – místa na noc na hotový čtverec (plocha uvnitř plotu ≈ 196 m²):
  **ovce 130, kozy 100, prasata 80, krávy 45** (≈ 1,5 / 2 / 2,5 / 4,5 m² na kus – malá zvířata
  raného středověku, dnešní minima ustájení – [rešerše](research/2026-10-19-pens.md)). Místa jsou
  pro dospělé kusy i jarní mláďata.
- **Bez ohrady u domu** jen pár kusů: každá domácnost udrží u domu **2 ovce, 1 kozu a 1 prase**
  (místa jako v ohradě); **krávy jen v ohradě**. **Chovný pár** druhu, který ves má, zůstane u domů
  vždy – jinak by druh bez ohrady vymřel a nebylo by co chovat, až ves ohradu postaví (rozhodnutí
  Clauda).
- **Stádo omezují místa** ([diet.md](diet.md) – Místa na noc): 1. 11. si ves přes zimu nechá
  nejvýš tolik kusů, aby se i s jarními mláďaty vešly do ohrad svého druhu a k domům (místa ÷
  (1 + jarní mláďata na kus)) – vedle pastvy, sena, lesa, pasáků a místa pro mláďata podle
  výrostků. Kusy nad místa jdou na maso jako kusy nad nosnost; kusy čekající na zimní porážku jen
  do volných míst. Platí i pro dřívější vsi bez ohrad – nadbytek jde na maso při první
  porážce po ročním odkladu (níž).
- **Roční odklad** (návrh Clauda, 19. 10. 2026): místa ohrad a u domů
  omezí stádo až u porážky 1. 11., která přijde aspoň 365 dní po založení vsi – u vsi uložené
  dřív po zavedení pravidla (den převodu při načtení). Hráč má rok na stavbu ohrad: nová ves
  založená na podzim by ohradu před 1. 11. nestihla a dřívější ves by přes noc přišla o stáda
  (Vlkov v herním květnu: ovce 74 → 12). Upozornění „Stáda se nevejdou do ohrad“ platí i během
  odkladu, ať hráč ví, že má stavět. Spřežení a ohrada skotu se neodkládají zvlášť – na ohradu
  skotu (krávy na výcvik dalšího spřežení) má hráč 10 let služby spřežení a upozornění.
- **Výběr druhu hráčem** (Martin 20. 10. 2026: „Prosím tě, když ve stavbách kliknu na ohradu, tak
  ať se mi v tom okýnku ukážou druhy ohrad. To první tlačítko bude jen rozcestník. Klávesové
  zkratky spíš omezíme“): tlačítko „Ohrada“ v mřížce staveb je jen **rozcestník** – kliknutí
  (i [O]) ukáže v mřížce druhy ovce, kozy, prasata, skot, spřežení (ikony zvířat, v popisku
  „Ohrada ovcí“… a cena), první tlačítko je ohrada sama (zpět); druh spustí malování. Druhy
  nemají vlastní zkratky a Tab druh nepřepíná (návrh Clauda – zkratky omezit); Esc rozcestník
  zavře. U kurzoru ikona druhu a cena. Nad ohradou téhož druhu se malování chytí její mřížky
  (rozšíření), vybraná ohrada téhož druhu dá mřížku.
- **Staré vsi** (převod při načtení, jednou): ohrada se spřežením nebo výcvikem je ohrada
  spřežení, ohrada bez nich ohrada skotu (dřív v ní zimovaly krávy).
- **Panel ohrady:** název podle druhu („Ohrada ovcí“…), zvířata v ohradě na noc / místa (ikona
  druhu), čtverce (např. 2/4), rozšíření ve stavbě, seno, stav (chátrání, oprava), stáda vsi;
  ohrada spřežení voly, stáří spřežení a výcvik jako dřív.
- **Upozornění** „Ovce se nevejdou do ohrad“ (víc druhů „Stáda se nevejdou do ohrad“), když se stádo
  na noc nevejde – hráč ví, že nadbytek půjde na maso.
- **Chátrání a oprava** jako dřív: ohrada se zvířaty svého druhu se neopouští. **Síť pěšin:**
  ohrada je oplocená jako hřbitov, branka (vchod) na obrysu nejblíž k nejbližšímu obydlí, krmení
  jako cíl; rozšíření ve stavbě je jen vytyčené (plot a branka kolem hotových čtverců).

## Plot ohrady podle délky a ulička mezi stavbami (23. 10. 2026)

Martin, 23. 10. 2026: „**Ohrady by měly být fyzicky menší než plocha, kterou zabírají. Když například
vedle sebe budu mít ohradu s kozami a ohradu s ovcemi, musí mezi nimi být taková mezera, aby tam mohl
projet vůz.**“ A issue #3, 22. 10. 2026: „**Pokud rozšiřuju nějakou ohradu nebo hřbitov (tj. postavím
nové políčko vedle starého políčka), tak se plot na jedné či více stranách stavět nemusí a mělo by se
ušetřit poměrně dřeva a času.**“ Volby Martina téhož dne: kapacita na čtverec zůstane
(`PEN_PLACES_PER_SQUARE` se nemění) a pravidlo platí i pro hřbitov (cemetery.md).

- **Odsazení plotu (návrh Clauda):** plot stojí `PEN_FENCE_INSET_M` = 1,5 m uvnitř čtverce
  (15 × 15 m), tedy čtverec bez plotu má 12 × 12 m. Dvě sousední ohrady (nebo ohrada a hřbitov) mají
  mezi ploty uličku 3 m, kterou vůz i chodec projede; 1,5 m = polovina uličky pro vůz s nákladem
  s rezervou. Mezi čtverci téže ohrady plot není. Pozemek polozemnice zůstává 0,5 m od okraje.
- **Cena plotu podle délky (návrh Clauda):** cena čtverce (40 čd, 6 stromů) se dělí na **plot**
  (`PEN_FENCE.share` 0,5 práce a `PEN_FENCE.trees` 4 stromy, tedy osmina práce a strom na stranu
  čtverce) a **zbytek** (přístřešek, žlab, jesle, úprava země – platí každý čtverec). Plot se platí
  jen za **nové vnější strany** (`newFenceSides`, `fence-cost.ts`): strana, za kterou leží jiný
  nový čtverec nebo čtverec téže ohrady, plot nechce. Samostatný čtverec stojí jako dřív (40 čd,
  6 stromů), rozšíření o čtverec po jedné straně 35 čd a 5 stromů, dva nové čtverce vedle sebe
  70 čd a 10 stromů. Starý plot na straně, která se stane vnitřní, se nevrací ani se neúčtuje (stojí ve stavbě do
  dokončení rozšíření). Oprava plotu (abandonment.md) počítá s vnějším obrysem
  stejně.
- **Průjezdnost:** vozová síť blokuje jen buňky uvnitř plotu (`fencedCells`), takže řada buněk na
  hranici sousedních čtverců je sjízdná (mřížka vozů 3,75 m, hranice čtverců leží na jejích řadách; u ohrad natočených o jiný násobek než 90° řady na hranici nesedí, proto se buňka blokuje, jen když leží celá uvnitř plotu – `fencedCells`).
  Pěšiny ohradou už dřív procházely. Plánování vozové cesty (`wagonRoadGrid`) drží odstup od celého
  čtverce, ulička je tedy pro vozy jen na stávající síti – řeší nový systém cest (#6).

## Ohrada volů, voli po kusech a potah (20. 10. 2026)

Martin, 20. 10. 2026: „**Vesnice určitě potřebuje více vozů. Ať to funguje jako se stády - ohrada pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí zvětšit. Zaároveň to udělej tak, že rádlo táhnou 2 voli, 4kolový vůz také dva voli a dvoukolový vůz jeden vůl. Napiš návrh, co všechno se dá vozit na vozech a jakých.**“ Na návrh odpověděl: „**Ano, udělej to jak říkáš**“ – platí celý
návrh i se 6 voly na čtverec a výběrem nových nákladů ([vozy](wagons.md) – Co se vozí a na čem).
Co níž není výslovně Martinovo, je návrh Clauda.

- **Ohrada spřežení je ohrada volů.** V kódu zůstává druh `team`, hráč vidí „Ohrada volů“
  a v rozcestníku ohrady druh „Voli“ (`PEN_NAMES`, `PEN_VARIANTS`).
- **Voli po kusech:** ohrada volů nese seznam volů (`Pen.oxen`), každý s dnem, kdy je vycvičený
  (`Ox.trainedDay`): výcvik **2 roky** z telat stáda krav, služba **10 let**, pak jde na maso
  (120 kg). Nahrazuje spřežení a výcvik (`Pen.team`, `Pen.training`).
- **Místa:** **6 volů na hotový čtverec** i s telaty ve výcviku (`PEN_PLACES_PER_SQUARE.team` –
  vůl ≈ 400 kg potřebuje s jeslemi, žlabem a přístřeškem ≈ 6 m² v ohradě ≈ 196 m², kde stojí
  i stoh), ohrada má nejvýš 4 čtverce (24 volů), víc ohrad volů se sčítá. Dřív ohrada pojala jedno
  spřežení a výcvik nového páru (4 voly).
- **Potah** (Martin): rádlo táhnou **2 voli**, čtyřkolák **2 voli**, dvoukolák **1 vůl**
  (`DRAFT_OXEN`). Dvoukolák má oplení – dvě oje po stranách vola a jednoduché šíjové jho
  (`tools/blender/wagons_from_0ad.py`, díly `wagon2-body` a `wagon2-yoke`).
- **Rádla:** pár vycvičených volů orá, jen když má rádlo (`VillageState.ards`). Rádlo (1 strom,
  5 čd ze společné práce) vesničané vyrobí s výcvikem, jen když z nových volů vznikne pár k orbě,
  na který rádlo chybí (páry, které ves chce – Kolik volů ves chce). Rádlo se neopotřebí (drží ho
  dřevěné nářadí od tesaře – dřív se stavělo s každým novým spřežením).
- **Výcvik začne sám** (`trainTeamsWhenReady`, `oxenTraining`), když ves chce víc volů, než má ve
  výcviku a mimo posledních 2 let služby (náhrada naváže, když starý vůl doslouží – Martin, 18. 10. 2026), a je pro ně místo v hotových ohradách volů. Do výcviku jde tolik telat, kolik
  chybí, kolik se vejde, kolik je ve stádu krav **nad chovnými kravami** (telata jen z přírůstku –
  stádo krav pod cíl `breedingCows` neklesne, jinak výcvik počká na mláďata 1. 4.; návrh
  Clauda 20. 10. 2026 – dřív zůstala aspoň jedna kráva a Vlkov tak klesl na 1,2 krávy z cíle 4)
  a v zimě kolik jich seno uživí do konce března; na rádlo musí být
  dřevo. Telata jdou do ohrad s volným místem v pořadí id.
- **Náhrada posledního páru má přednost** (návrh Clauda 20. 10. 2026: ať ves neorá
  motykou): když ves orá, poslední pár dosluhuje (je v posledních 2 letech služby) a jiný
  vycvičený ani ve výcviku není, vezme výcvik pro náhradu telata i pod cílem krav – dokud zůstane
  chovný pár krav (LIVESTOCK.breedingMin). Výcvik tak začne včas, 2 roky před koncem služby. Další
  páry a voli na vozy dál jen z přírůstku nad chovnými kravami. Ves si navíc už při porážce rok
  předem nechá krávy na telata, která do výcviku bude potřebovat (`oxenCalvesWanted`).
- **Konec zimy (1. 3.):** když voli dostali pod polovinu přídělu sena, uhyne jich tolik, aby
  ostatní měli polovinu – nejdřív nejmladší (telata ve výcviku hladovějí první); přeživší jsou
  slabí a na jaře orají pomaleji. Uhynulí na maso nejdou. Dřív jeden vůl uhynul, spřežení se
  rozpadlo a druhý šel na maso.
- **Převod starých vsí** (jednou a bez příznaku jako `withPenSpecies` – `withOxen` při načtení
  i na začátku dopočtu): spřežení = 2 vycvičení voli se stejným dnem, výcvik = 2 telata (vycvičí
  se 2 roky od zadání), rádlo za každou ohradu se spřežením nebo výcvikem; rozestavěné rádlo
  výcviku se zruší a klády z hromady se vrátí (rádlo ves už má).
- **Kronika a upozornění po kusech:** „Vůl je vycvičený“ / „Voli jsou vycvičení“, „Vůl dosloužil“ /
  „Voli dosloužili“, „Vůl uhynul“ / „Voli uhynuli – chybělo seno“ (kronika uložená dřív zůstane
  se spřežením).

## Kolik volů ves chce (20. 10. 2026)

Jako se stády (Martin výš): ves si sama spočítá, kolik volů chce, a strop jsou místa v ohradách
volů (`draft.ts`).

- **Páry k rádlům:** tolik, aby voli zorali celý osev v oknech orby (od 25. 10. 2026 osev
  osevního postupu – [pole](fields.md), Osevní postup po dílech; ~~roční plán osevu~~ se ruší).
  K 1. 9. ves zkusí 1,
  2, … párů (kapacita páru jako dřív spřežení – 0,3 ha za den, délka brázdy a cesta k bloku)
  a nejméně párů, se kterými vybere totéž jako bez meze orby, je **potřeba** toho roku
  (`DraftState.ploughNeed`, nejvýš 8). Do prvního plánu pár na každou ohradu volů. Co páry
  nezorají, se dál nezaseje. **Od osevního postupu po dílech** ([fields.md](fields.md) – Osevní
  postup po dílech, Páry k rádlům; návrh Clauda 25. 10. 2026) ves plán nemá: potřeba je nejméně
  párů, které v oknech orby zorají **všechny díly na řadě** v hospodářském roce – nutné i nad
  potřebu (ozim v září–říjnu, jař na podzim i na jaře, bez posledního dne okna; výkon páru
  0,3 ha za den × délka brázdy dílů). Ves tak chce víc volů a sena než dřív – měří Úloha 9.
  **Strop podle lidí** (návrh Clauda 25. 10. 2026, recenze Úlohy 5): nejvýš tolik párů, kolik ves
  obslouží – pár chce oráče a setí za zoranou částí (0,3 ha za den × 10 člověkodnů na hektar ≈ 3),
  tedy `OXEN.crewPerPair` = 4 dospělí na pár (nejméně 1 pár). Jinak by malá ves s velkým polem
  chtěla až 8 párů a seno na ně, které by stejně nezorala ani nezasela.
- **Nahoru hned, dolů po dvou plánech** (od 27. 10. 2026 – na otázku, zda si ves smí sama
  vycvičit víc párů volů a vyrobit víc rádel, **Martin 27. 10. 2026: „Nejen že smí, ale dokonce by
  měla“**; dřív hystereze i nahoru – návrh Clauda 20. 10. 2026, `nextPloughPairs`): když orba na
  plán setí nestačí (potřeba párů nad páry, které ves má), ves páry k rádlům
  (`DraftState.ploughPairs`) **zvýší hned** na dnešní potřebu – volné páry osadí rádly, další
  vycvičí z telat (vesničané sami používají, co jim ulehčí práci). Sníží je, jen když potřeba
  leží **dva plány po sobě** níž – na větší z obou potřeb; slabší rok tak nezastaví náhradu páru,
  který ves potřebuje (výcvik trvá 2 roky, pár slouží 10). Pár, který už ves má, slouží do konce
  služby vždy (voli se nikdy neporážejí dřív). Ves, které orba stačí, se nemění.
- **Pod pojistkou** (27. 10. 2026 – Martin schválil „Pod pojistkou mají v oknech setí přednost
  pole“, **Martin 27. 10. 2026: „Ano“**; provedení návrh Clauda): když výhled zásob z pole
  k příští sklizni k 1. 9. nedosáhne pojistky ([pole](fields.md) – Osev podle zásob), potřeba párů
  počítá **i nutné díly mimo postup** – výběr nutných dílů k 1. 9. včetně nouzových příloh
  (`neededSelection`); páry zvýší hned jako vždy, když orba nestačí. _Historie:_ nutné díly
  a `neededSelection` zrušené 9. 11. 2026 s cílem osevu – páry počítají všechny díly na řadě
  ([pole](fields.md) – Osevní postup po dílech, bod 3, Páry k rádlům). Proč orba a ne lidé: Vlkov (rok 822, 1 rádlo, 7 vycvičených volů) měl v oknech
  setí 3–5 člověkodnů denně volných a stavby nutné polní práci už ustupují (pořadí práce dne –
  [pole](fields.md), Práce; Martin 25. 10. 2026) – úzkým hrdlem bylo jediné rádlo, které zorá
  ≈ 18 ha za podzim, kdežto ves potřebovala ≈ 45 ha ozimu. Volné páry volů ves osadí rádly sama
  (Rádlo k páru bez výcviku výš), další páry vycvičí z telat – vesničané sami používají, co jim
  ulehčí práci. Motyka dál nekope (Jen rádlo).
- **Voli vozů:** vozy, které se ves rozhodla mít ([vozy](wagons.md) – Kolik vozů ves chce),
  naráz – dvoukolák 1, čtyřkolák 2 voli.
- **Voli se sdílí:** orba (podzim, jaro) a svoz (léto) se nepřekrývají – ves chce **víc z toho**
  (páry × 2, nebo voli všech vozů naráz), ne součet. Ve dny orby jdou páry k rádlům napřed a vozy
  táhne zbytek volů (dřív ve dny orby vozy nejezdily); na vůz ve dny orby si ves může držet vola
  navíc, když se jí to vyplatí. Každý vůz potřebuje svého vola nebo pár doma (`haulCartsToday`).
- **Strop jsou místa v ohradách volů:** když ves chce víc volů, než se vejde, přijde upozornění
  **„Voli se nevejdou do ohrady“** (jako „Stáda se nevejdou do ohrad“) a ves má méně vozů (vybere
  ty, které se v místech vyplatí nejvíc) nebo méně párů (orá pomaleji). Cvičí a krmí jen tolik
  volů, kolik se vejde (`oxenTrainingTarget`).
- **Krávy na obměnu volů** ([strava](diet.md) – Krávy na obměnu volů): ~~3 krávy a kráva navíc na
  každé 4 voly, které ves cvičí a krmí~~ **cíl krav podle volů** (Martin, 20. 10. 2026: „Dejme
  možnost 1.“ – podrobnosti návrh Clauda): ke kravám na mléko 3 krávy a **půl krávy na každého
  vola**, kterého ves chce na rádla i vozy (voli jsou býčci – polovina telat; vůl slouží 10 let),
  ves si je nechá při porážce; telata na voly jen z přírůstku nad nimi. Když ves telata do
  výcviku potřebuje (`oxenCalvesWanted` – voli, kteří jí chybí do cíle), nechá si při porážce
  1. 11. tolik krav navíc nad chovné stádo, aby na jaře z přírůstku byla.
- **Dobytek od sousedů** ([obchod](trade.md) – Dobytek ve třech druzích; Martin, 20. 10. 2026:
  „s dobytkem by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí
  se vycvičit) a vycvičené voly“): mladí voli jdou do ohrady volů na výcvik (vycvičí se 2 roky od
  příchodu), vycvičení voli táhnou hned a mají za sebou 3 roky služby; oba potřebují místo
  v ohradě volů. Voli na cestě se počítají do volů, se kterými ves při výcviku počítá, a do míst
  – výcvik pro ně telata nebere. **Rádlo k páru bez výcviku** (návrh Clauda): když ves má pár
  k orbě, na který rádlo chybí (koupený vycvičený vůl k vlastnímu), vyrobí ho bez výcviku. Ves
  prodá voly ve výcviku a vycvičené voly mimo posledních 2 let služby.
- **Seno:** seč (25. 5. a otava 1. 8.) počítá s voly, které ves cvičí a krmí, aspoň s těmi, které má.
  **Změna (2. 11. 2026) – seno jen na skutečné voly** (návrh Clauda, Martin: „3. ok“): seč počítá
  s voly, které ves má (i telata ve výcviku), které výprava teprve přivede, s voly bez ohrady
  a s telaty, která výcvik opravdu dostane (voli chybí do cíle, místo v ohradách volů a telata nad
  chovnými kravami – bez sena a dřeva na rádlo); rezerva seče (`HAY_CUTS.reserve`) beze změny. Dřív
  aspoň s voly, které ves chce (`oxenTrainingTarget`) – i bez telat, takže ves s ohradou volů
  a 2–3 kravami sekla na 2–6 volů, kteří nepřišli (seed krajiny 13: seno 4 → 26 t, ≈ 150–250
  člověkodní ročně, otava v září proti setí ozimu). Telata jdou do výcviku hned, jak je přírůstek
  nad chovné krávy (po mláďatech 1. 4.) – do letní seče jsou voly v ohradě, takže ves, která voly
  chystá, seno dostane včas.
- **Panel ohrady volů:** voli v ohradě, místa / kolik volů ves chce (červeně, když chybí;
  v popisku vycvičení a ve výcviku – jako `herdPlaces` u stád), páry s rádlem / páry k orbě
  (ikona rádla `resources/ard.png`), vozy má / chce po druzích, nejstarší vůl (stáří, kolik let
  ještě slouží) a výcvik telete, které se vycvičí nejdřív.
- **Ve scéně** orá tolik párů, kolik jich ves má s rádlem doma (`SceneVillage.ploughPairs`), vozy
  táhne zbytek volů a v ohradě stojí, kdo dnes nepracuje; dvoukolák táhne jeden vůl mezi ojemi.

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

## Co nejvíc sena a co největší stáda (24. 10. 2026)

Martin, 24. 10. 2026: „**Nemohla by se ves snažit posekat co nejvíc sena (to je přece omezeno
rozlohou luk) a chovat co největší stáda? Krávy a hlavně voli jsou životně důležití, pak jsou
ovce, kozy a prasata jsou důležitá nejméně. Když se v zimě zjistí, že pro krávy není krmení, tak
se dají prodat nebo porazit.**“ Na návrh Clauda níž Martin, 24. 10. 2026: „**Ano souhlasím**“.
Pravidla jsou návrh Clauda, schválený Martinem 24. 10. 2026 (nahrazují „jen tolik, kolik je
potřeba“ v Senu výš – ve Vlkově se tak na 9 krav nikdy nesekalo a stádo krav se každý rok
vracelo na chovný pár):

1. **Seč co nejvíc.** 1. 6. ves naplánuje seč **všech luk na dosah** – úhor ve fázi louky
   a přirozené louky do 600 m od obydlí, od nejbližší. Seno na zimní stádo, které ves má, a na
   voly ohrad (dřívější potřeba) se seče jako dřív – podle konce okna seče mezi polními pracemi.
   **Zbytek luk jen z volné práce:** za všemi úlohami dne (pletí, žně, orba, výmlat), před
   stavbami; co volná práce do konce července nestihne, zůstane neposečené. Odvoz sena stejně
   (vozem, na zádech).
2. **Co největší stáda podle přednosti:** **voli → krávy → ovce → kozy → prasata**. V tomto
   pořadí jde seno na zimu, pastva i pasáci (dřív ovce na vlnu před kravami nad chovné stádo).
   Stáda drží tolik, kolik uživí seno, pastva, les, pasáci a místa v ohradách – **ne podle ceny
   jídla v práci** (rovnovážné hospodaření stádo už nezmenšuje – diet.md).
3. **Zima.** 1. 11. ves spočítá, kolik zvířat seno uživí, a v pořadí přednosti si je nechá; zbytek
   jde na maso (prasata → kozy → ovce → krávy). Když seno během zimy nevystačí do konce března,
   ves **hned porazí** tolik kusů (kozy → ovce → krávy), aby ostatní měli celou dávku – zvířata
   nehladoví (dřív zimní úhyn 1. 3.). Chovný pár zůstane vždy (přežije o větvích a slámě).
4. **Prodej jen hráč** (obchod se sousedy, trade.md) – ves sama zvířata neprodává ani nekupuje
   (Martin 24. 10. 2026 odmítl, aby ves kupovala voly sama).
5. **Náhrada volů i po rozpadu páru.** Náhrada posledního páru k orbě (telata z přírůstku nad
   chovným párem krav) platí i tehdy, když už ves pár nemá, pokud má rádlo a pár nemá ani necvičí
   (dřív jen dokud pár ještě sloužil – Vlkov zůstal s jedním volem).

Staré vsi se nepřevádějí – pravidla platí od dalšího dne (seč od 1. 6., porážka od 1. 11.).

**Naměřeno (24. 10. 2026):** Vlkov 8 let dopředu ze stavu 16. 4. 814 – seč 19–59 t sena ročně (dřív 8–21 t jen na stádo), volná práce v červnu klesla z 3–10 na ≈ 0,2 čd/den (seč ji vezme celou); krávy 2,6 → 8,2 (dřív 2,6 → 6,4), ovce 15 → 78 (dřív vrchol 66, pak 31), voli: výcvik od 1. 4. 815 a 1. 4. 816, pár zase od 1. 5. 818 (dřív výcvik až 1. 4. 820); hlad 1× ročně v letech 818–820 bez úmrtí hladem (dřív 18 úmrtí v letech 820–821); porážka pro nedostatek sena ani jednou. Čtyři čerstvé vsi × 15 let (hráč staví): krávy na 10 lidí 2,9 → 6,1, kozy 12,6 → 18,3, ovce a prasata beze změny, nasycení 100 % let; seč 3,4 → 18 čd na člověka a rok, volná práce 56,5 → 40 čd (29 → 21 %). ~~**Otevřené:** seno v listopadu Vlkovu zbývá ≈ 40 t nad potřebu (stádo roste jen o mláďata a ohrady) – omezit seč na seno pro stádo s jarním přírůstkem, nebo seč z volné práce dát až za stavby?~~ Rozhodnuto 25. 10. 2026 – obojí (Seno – dvě seče podle stád níž).

## Seno – dvě seče podle stád (25. 10. 2026)

Martin, 25. 10. 2026: „**Tak ony jsou v roce 2 senoseče: 1. konec května – konec června 2. srpen
– září. Takže mi hoď tabulku s vytížením vesnice a zkusíme tam někam ty senoseče nacpat tak aby to
neohrozilo ostatní polní práce.**“ Po tabulce vytížení Vlkova (květen 100 % – pletí 366 čd; volné:
červen 175 čd, srpen 157, září 126) a návrhu Clauda: „**Pletí se často účastnily děti. To by mohlo
uvolnit ruce dospělým. Jinak tu senoseč dej tak jak navrhuješ.**“ Pravidla jsou návrh Clauda,
schválený Martinem 25. 10. 2026 (nahrazují seč 1. 6. – 31. 7. a „seč co nejvíc“ z oddílu výš):

1. **Dvě seče.** 1. seč v okně **25. 5. – 30. 6.** (plán 25. 5. – zbytek loňského sena se zkazí),
   **otava** v okně **1. 8. – 30. 9.** (plán 1. 8.) jen na loukách posečených letos v 1. seči
   (u rozpracované louky jen posečená část). Otava dá **≈ 40 %** sena 1. seče a stojí **60 %
   práce** na hektar – kosí se celá plocha (≈ 2,5 čd/ha), obracení, hrabání a svoz jen podle
   hmoty a otava v kratších a rosnějších dnech schne pomaleji (návrh Clauda). Tuna sena z otavy
   tak stojí ≈ 1,5× víc práce – napřed se seče 1. seč, otava jen dorovná, co ve stohu chybí.
2. **Kolik.** Seče se tolik, kolik stáda sní: **strop** = seno na zimu pro stáda v cílové velikosti
   (co dovolí pastva, les, pasáci a místa v ohradách – pořadí voli → krávy → ovce → kozy →
   prasata, i s letošními mláďaty), voly ohrad a koně **a 20 % rezervy**, bez zásoby ve stohu.
   Louky od nejbližší, dokud úroda strop nepokryje – ne všechny louky (Vlkov by jinak sekl přes
   35 t a seno by shnilo).
3. **Čí práce.** Seno **nutné** – na dnešní stádo i s letošními mláďaty (nejvýš zimní stádo, které
   si ves chce nechat; zbytek půjde na maso), voly, koně a kusy čekající na zimní porážku – jde
   **po všech polních pracích dne, před stavbami**. **Seč navíc** (do stropu, pro růst stád) jen
   z práce, která zbude **po stavbách, opravách a osevu navíc** (Martin 19. 10. 2026: „pokud se
   něco staví, tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla
   hlad“), pěšky bez vozů. Seč **nikdy nebere práci polním úlohám** (pletí, žně, odnos, výmlat,
   orba, setí, kopání) – co volná práce do konce okna nestihne, zůstane neposečené.
4. **Děti při pletí** uvolní ruce dospělým – [fields.md](fields.md), Pletí – děti. Od 25. 10. 2026
   se pleje jednou v květnu, hlavně ženy a děti – muži sekají ([fields.md](fields.md), Pletí
   jednou a rychle); seč tak před pletím mužů přednost má.

Seč uložená dřív platí jako 1. seč (po 30. 6. se už neseče); nové vsi založené po 25. 5. letos
nesečou – seno na první zimu si přivedou osadníci.

**Naměřeno (25. 10. 2026):** Vlkov ze stavu 16. 4. 814 (před → po). Vytížení: květen beze změny
(pletí 366 čd, 100 %; oba výrostci pasou, děti při pletí 0); červen seč 208 → 73 čd, volné 7 →
161 čd (využití 98 → 51 %); červenec seč 120 → 0, volné 0 → 117 čd; srpen a září beze změny (volné
157 a 126 čd, otava v 816 není potřeba). 8 let: seč 21–60 t → 8–26 t 1. seč a od 820 otava
4–6 t; seno 1. 11. 20–60 t → 11–27 t; krávy 2,6 → 13,7 / 2,6 → 11,5, ovce do 819 víc (76 proti
59), voli 4 → 3, pár celou dobu, úmrtí hladem 0 v obou. Od 821 sekla ves méně (11 t 1. seče
a otava) a v 823 ovce klesly na 2 (dřív 63) – příčina a oprava v oddílu níž.

## Stáda podle práce na seč (25. 10. 2026)

Martin, 25. 10. 2026: seče vložit tak, „**aby to neohrozilo ostatní polní práce**“ – polní práce
mají přednost. Recenze dvou sečí ve Vlkově: pole přibývají, pletí v červnu sní všechnu práci
a nutná seč (seno na dnešní stádo) práci nedostane – 821 jen 120 z 269 čd, seno chybí, zima
poráží a krávy (přednost) vytlačí ovce: 104 → 27 (821), 58 → 2 (823). Pravidla jsou **návrh
Clauda**:

1. **Stáda jen na seno, které ves stihne posekat.** Ves si každý den v oknech seče zapíše práci,
   která **po polních pracích** zbyla (nutná seč, stavby, opravy, osev a seč navíc i nevyužitá),
   převedenou na seno podle dnešní seče (kg na člověkoden plánu i s chůzí na louky; bez plánu
   podle práce na hektar). Po otavě (1. 10.) z ní ves ví **strop sena**: 1. seč a otava nejvýš
   40 % 1. seče (otava jen na jejích loukách). Cílová velikost stád – plán seče (25. 5., 1. 8.)
   i porážka 1. 11. – se do toho sena po ztrátách ve stohu vejde v pořadí přednosti: voli a koně
   první, pak krávy → ovce → kozy (prasata seno nežerou). Krávy tak nevytlačí ovce kvůli senu,
   které stejně nikdo neposeče, a nutná seč se vejde do práce, kterou ves po polních pracích má.
   **Proč loňská práce:** je to přímé měření všeho, co ves opravdu dělá (pletí, žně, pasení,
   péče), deterministické (zápis ve stavu den po dni – nezávisí na tom, po jakých kouscích se ves
   dopočítá) a bez nového modelu práce po měsících. Rostou-li pole, strop se srovná o sezónu
   později – tlumí to rezerva 20 % a otava. Ves bez zápisu (nová ves, převod, seč rozjetá před 25. 10. 2026) stáda stropem nemezí až do první celé sezóny.
2. **Místa v ohradách před senem.** Kusy, které se i s jarními mláďaty nevejdou do ohrad svého
   druhu a k domům, si pastvu ani seno neberou (dřív si je vzaly a stádo se srazilo na místa až
   na konci – ovcím chybělo).
3. **Koupený dobytek.** Krávy a voli, které výprava teprve vede, se počítají do seče (nutné seno
   i strop) i do zimy (místo, pastva a seno mají první z krav, voli s voly). Otava má v seči
   všechny louky posečené v 1. seči a seče do stropu; přibude-li dobytek během okna otavy
   (koupený i na cestě), strop otavy se zvedne. Obchod nekoupí víc krav, než kolik se **i s
   jarními telaty** vejde do ohrady skotu a k domům – stejné pravidlo jako porážka 1. 11. kvůli
   místům (dřív se až 29 % koupených krav 1. 11. porazilo, i když seno bylo); důvod u kurzoru
   „Tolik krav se do ohrady skotu nevejde.“
4. **Nouzová porážka** (hlad – [diet.md](diet.md), Nouzová porážka) v pořadí přednosti: prasata →
   kozy → ovce → krávy, voli nikdy; chovný pár, krávy na mléko a voly a ovce na vlnu zůstanou.
   Dřív krávy před ovcemi.

Práce na seč se počítá postupem seče – s vozy (svoz) posekne ves víc, než na seč dá práce; jinak
by strop vyšel podhodnocený (Vlkov 821: 10,9 t místo 19,1 t, ovce by klesly na 2).

**Naměřeno (25. 10. 2026):** Vlkov ze stavu 16. 4. 814, 8 let (před → po). Nutná seč splněná
816–820 (80 až 228 čd) i 822 (201 z 212 čd); **821 jen 147 z 270 a 823 138 z 277 čd** – pole
se rozšířila do června (pletí 81 → 179 a 113 → 156 čd), strop z loňské práce je o rok pozadu.
Ovce 1. 11.: 821 27 → 50, 822 40 → 58, 823 2 → 24; krávy 2,6 → 11,3 (dřív 11,5), voli 4 → 3,
pár celou dobu, úmrtí hladem 0; dní hladu v 823 5 → 22 (nouzová porážka 1. 9.). Oprava stropu
podle letošního pletí (25. 5.) skoro nic nezměnila (ovce 823 24 → 22) – zavržena.
~~**Otevřené (otázka na Martina):** plán osevu (1. 9.) bere celý červen pro pletí, takže pole
každý rok sní práci, kterou loni dostala seč, a stáda se zmenšují o rok pozdě. Má plán osevu
nechat v červnu práci na seno pro chovné minimum (voli, krávy na mléko a voly, ovce na vlnu)?~~
**Rozhodnuto 25. 10. 2026 – lehkým pletím** (Martin: „Ve středověku se plelo jednou, rychle
a dělaly to hlavně ženy a děti, takže z práce dospělých to moc neubírá.“ a „Ozim se plít asi
nemusí – v dubnu už je tak velký, že plevel udusí.“): pleje se jednou, jen jař, luštěniny a len
v květnu (8 / 5 a 10 / 6 čd/ha), ozim vůbec; plejí děti → ženy, muži jen zbytek po ostatních
úlohách dne – v červnu se neplete a nutná seč dostane práci mužů i v posledním květnovém týdnu
([fields.md](fields.md) – Pletí jednou a rychle). Plán osevu se nemění.

## Účinek na práci

- **Zpracování půdy na dílech v oběhu** (zkopaný díl po sklizni, mladý úhor 1–2 roky): místo kopání
  motykou (**100 → 50 člověkodní/ha** podle nástrojů) **orba rádlem 10 → 6 člověkodní/ha**
  (rešerše: 5–15 člověkodní/ha; meze produktivity – nejhorší dřevěná radlice, nejlepší se železnou
  špičkou od kováře podle pokrytí nástroji, [řemesla](crafts.md)). Orá oráč a honáček (2 lidé).
- **Rozsévač za spřežením** (9. 11. 2026 – Martin: „Setí – to přece obstará pár mužů s voly
  a ženy“, „Za oráčem by měl jít někdo z rodiny a rovnou zasívat“ a „Ano, jeden rozsévač za
  spřežením“): za každým orajícím spřežením jde týž den 1 rozsévač – setí stojí 1 člověkoden na
  den spřežení (≈ 3,3 čd/ha, na drnu 8,3; nástroje zlevní orbu, ne tempo volů), dřív 10 čd/ha
  (≈ 3 lidé za spřežením). Motykou taky ≈ 3,3 čd/ha (návrh Clauda – [fields.md](fields.md), Práce).
- ~~**Drn rádlo nezvládne** (rešerše – rádla selhávala na panenském drnu): zakládání pole na louce,
  v křovinách a v lese a vracení úhoru ve fázi louky (3+ roky) dál stojí jako dnes (motyka, mýcení).~~
  Od 19. 10. 2026 rádlo bere i drn – viz Jen rádlo.
- **Kapacita spřežení:** ≈ **0,3 ha za den** (orba křížem – dva průchody; návrh Clauda) – za jarní
  okno (březen–duben) ≈ 18 ha, za podzim víc. Jedno spřežení stačí běžné vsi; větší ves může mít víc
  ohrad a spřežení.
- Postavičky: na rozpracovaném čtverci orá spřežení (model je hotový) místo řady s motykami.

## Implementace (18. 10. 2026)

Rozhodnutí kontroléru tam, kde návrh nedává postup (Martin je může změnit):

- **Ohrada** se staví jako pozemek polozemnice – jeden čtverec louky nebo lesa (les se vyklučí –
  Martin 19. 10. 2026, fields.md – Stavby v lese; ne voda, skalní
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
  s orbou celé plodiny – ozim, jař i luštěniny (`FarmSeason.ard`, `CropWork.plough` se všemi díly,
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
- **Kapacita:** osevní postup (čelo práce a `sowingCapacity`; do 9. 11. 2026 i `neededSelection` – historie) hlídá i orbu spřežení v jejích
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

## Co nejdelší brázda (19. 10. 2026)

Stav: **Martin, 19. 10. 2026:** „Volské spřežení chce rýt co nejdelší brázdu – otáčení zabírá
čas a snižuje produktivitu.“ – „Spřežení by mělo trávit co nejvíce času orbou – takže na místo se
dostane ideálně po nějaké už hotové cestě a pak už jen co nejvíce oře. Rozhodně nepřejíždí
z dílce na dílec, ale snaží se zorat co největší souvislou plochu.“ – „Změna – pokud to bude
rychlejší než po cestě, ať jede napříč přes pole, pokud už nebude oseté.“ Podrobnosti **návrh
Clauda**:

- **Směr brázd po blocích** (Martin, 19. 10. 2026: „Teď mi přijde, že oře jen v ose východ –
  západ, i když u spousty polí by byla výhodnější sever – jih.“): každý blok (níž) se orá v ose
  mřížky pole, ve které má **v průměru delší brázdy** – průměr délek souvislých řad čtverců
  vážený plochou (Σ délka² / Σ délka); při shodě podél delší rozlohy bloku, pak podél x
  (`furrowAxis`). Dřív se osa brala z rozlohy celého pole – čtvercové pole (Vlkov 49 × 49
  čtverců) tak oralo všechno východ – západ, i úzké bloky protažené sever – jih. Osa bloku se
  určí s plánem osevu (rok od roku podle toho, kde plodina leží). Natočené pole v osách své
  mřížky. Ve scéně vedou podél brázdy i řádky textur a koruna porostu dílu, který orá spřežení
  (`DecalPiece.rows`); díly bez orby (motyka, příloh) podél delší strany pole jako dřív.
  Ověření na Vlkově (stav 19. 10. 2026, ozim a luštěniny): 23 bloků, 9 sever – jih (175 z 285
  dílů), průměrná brázda ozimu 88 → 127 m, luštěnin 97 → 123 m.
- **Bloky a pásy:** spřežení orá plodinu po **souvislých blocích** – díly téže plodiny v jednom poli,
  které sousedí stranou. Blok se zorá celý, **pás po pásu** (souvislá řada dílů podél brázdy –
  brázda vede přes celý pás, obrat jen na jeho koncích), napříč od strany blíž vsi; blok tvaru U
  rameno po rameni (pásy navazující přes řady jdou spolu). Teprve pak spřežení přejde k dalšímu
  bloku. Díly pásu postupují spolu (`PloughWork.bands`, úsek pásu ve `field-progress`), setí jde za
  orbou po stejných pásech; pletí, žeň a výmlat dál po dílech. Ves bez spřežení (motyka) se
  nemění.
- **Pořadí bloků: od nejbližšího.** Obraty stojí stejně, ať se bloky orají v jakémkoli pořadí –
  pořadí mění jen cestu k bloku: od nejbližšího postupuje orba od vsi ven (jako dřív práce
  od domu), cesty jsou nejkratší a setí za orbou začne u vsi. Velké bloky napřed by výkon nezvedly.
- **Výkon podle délky brázdy:** podíl času, kdy rádlo ryje, je L / (L + v·t) – voli s rádlem
  v ≈ 0,64 m/s (pokusy s tažnými voly v Burkině Faso a Etiopii), obrat na souvrati t ≈ 45 s
  (vytáhnout rádlo, otočit pár, zarovnat – měření pro voly rešerše nenašla, je to odhad).
  0,3 ha za den platí pro brázdu 100 m; jeden díl (15 m) ≈ 44 %, pás 45 m ≈ 80 %, 200 m a víc
  nejvýš +15 % (`FURROW` v `rules.ts`, `furrowEfficiency`). Denní orba spřežení je
  0,3 ha × výkon pásu, na kterém spřežení právě orá.
- **Cesta na místo:** ~~spřežení jde ráno z ohrady k bloku a večer zpět~~ (od 24. 10. 2026
  zůstává na poli – Spřežení zůstane na poli níž) **vozovou sítí jako
  dvoukolák bez nákladu** (`villageCartRoutes`): nejrychlejší trasa – pevná cesta (cena 0,6),
  napříč přes neosetá pole (louka, úhor, strniště 1, zoraný a zakládaný díl 1,6), osetým dílem
  nikdy. Cestu ubírá orbě dne poměrným dílem (≈ 0,8 m/s, orá se ≈ 6 h denně, nejvýš polovina dne –
  `TEAM_TRAVEL`); ~~po cestě 500 m ≈ 6 %~~ (tam a zpět; od 24. 10. jen tam – po cestě 500 m
  ≈ 3 % v den výjezdu). ~~Cena cesty se spočítá, když spřežení začne nový blok~~
  (`PloughWork.trip`); bez krajiny (kalibrace) chůze k dílu.
- **Díly po dávkách** (osevní postup po dílech – fields.md; návrh Clauda 25. 10. 2026): nutné
  díly přibývají den po dni, jak se vejdou do čela práce, díly nad potřebu po jednom – každá
  dávka s vlastními bloky by brázdu zkrátila (ozim ≈ 0,6 výkonu proti 1,0 najednou). Proto díl
  přibude **s celým svým pásem** (pás z rozvržení dílů, které ves ten den pro plodinu vybrala;
  u dílů nad potřebu z dílů na řadě) a pásy, na kterých ještě nezačala žádná práce, se s novou
  dávkou rozvrhnou znovu. Rozpracovaný pás ani hotová práce se nemění; brázda vyjde jako u všech
  dílů najednou, jen díly, o které potřeba během podzimu vzroste, se k zoraným pásům nepřipojí.
- **Plán osevu** počítá s výkonem podle tvaru polí, na která může ves zasít (průměr výkonu jejich
  pásů – `plannedFurrowEfficiency`), cestu neodhaduje (je malá).
- **Ve scéně:** herní jádro posílá u dílů orby osu brázd a směr orby (`SceneFieldPart.furrow`) –
  podle nich vede obtisk zorané části i čára práce; spřežení jede pruhem přes celý pás
  (`bandCandidates`, pruh `PloughField.length`), při ladicí orbě za den (Orba za herní den níž)
  ~~vyjde z ohrady po cestě (`SceneVillage.ploughApproach`), zorá dnešní pruhy pásů za sebou
  a večer se po cestě vrátí~~ – od 24. 10. 2026 jen v den výjezdu a návratu (Spřežení zůstane na
  poli níž).
- **Kalibrace se nemění** – hráč skriptu ohrady nestaví; sonda „plná domácnost se spřežením“
  ukazuje průměrnou délku brázdy a její výkon.

## Brázdy končí na cestě (19. 10. 2026)

Stav: **Martin, 19. 10. 2026** ([roads.md](roads.md) – Cesta přes pole): „pokud oráč narazí na
cestu, tak spřežení otočí“. Podrobnosti **návrh Clauda**:

- **Pás přes cestu se láme:** brázda pásu (Co nejdelší brázda) končí na pásu pevné cesty a na
  plácku rozcestí – stejná plocha, kterou cesty polím berou (`roadCapsules` – `roadLand`).
  Kusy pásu mezi cestami spřežení orá zvlášť, každý s vlastními obraty; na cestě se otočí
  stejným obloukem jako na souvrati a přes cestu neorá (mezi kusy přejede se zvednutým rádlem).
  Kousek pole, který cesta oddělila a zůstal loukou (`roadCut`), se neorá. Kus brázdy kratší
  než 2 m se neorá (spřežení se do něj nevejde).
- **Výkon:** pás rozdělený cestami na n kusů má na každé řadě n brázd a n obratů – podíl času,
  kdy rádlo ryje, je ΣL / (ΣL + n·v·t), tedy totéž jako jedna brázda průměrné délky kusu.
  Herní jádro proto do L / (L + v·t) dosadí průměrnou délku kusu (`bandFurrowM` – osa pásu jeho
  středem přes pásy cest, `roadFreeRuns`); stejně plán osevu (`plannedFurrowEfficiency` s krajinou
  a cestami vsi). Pás, přes který cesta nevede, beze změny. Bez krajiny (kalibrace bez cest,
  sondy) i ve vsi bez spřežení se nic nemění.
- **Ve scéně** (`plough-roads.ts` – `roadPieces`): řady pruhu dne se přes pásy cest rozdělí na
  úseky, úseky sousedních řad, které se podél řad překrývají aspoň polovinou kratšího, tvoří
  kus (`PloughField.rowRuns`) – jinak by spřežení mezi řadami přejíždělo přes cestu. Rádlo jede
  po ose řady k okraji pásu cesty, jho dojede o dosah oje dál – na cestu, kde se otočí. Po
  projetí řady sahá brázda po celé šířce řady až k cestě (`fillLo` / `fillHi` – u šikmé cesty by
  jinak zůstaly nezorané klínky, které by se druhý den samy „zoraly“, viz Martinovo „nesmí se
  změnit na zoráno“ v Orbě za herní den); na cestě brázdu kryje maska pole. Kus s lichým počtem
  řad končí na protější straně. Bez spřežení za den (skutečné tempo – čelo dne) orá spřežení
  nejdelší kus pruhu. Ukázka na `/dev/landscape` – **Orba přes cestu** (pole ukázky Cesta po žni,
  pás přes rozcestí, spřežení projede dnešní orbu za 4 minuty).
- **Kalibrace:** 20 vsí na 20 let (`--land real`, vsi bez spřežení, i sonda „plná domácnost se
  spřežením“ na syntetické louce bez cest) vyšla před i po změně stejně, číslo po čísle.

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
  začala – `PartView.ploughed` z herního jádra) má roh kulatý, díl kopaný motykou ostrý.~~
  Od 19. 10. 2026 (Jen rádlo) rozhoduje stav vsi: ves, která letos orá, má kulaté rohy všech
  polí, ves, která kope, ostré. V rohu zůstane tráva louky a nestojí tam trsy obilí. **Od 19. 10. 2026 (kulatější pole – Martin: „pole jsou stále moc hranatá“)** se zakulatí každý
  vypouklý roh obrysu, i schod tvaru L (konec pásu orby – Co nejdelší brázda), a okraj pole je
  nepravidelný (místy až 2 m dovnitř) – fields.md, Co hráč vidí.
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
- **Zoraná zem jen kudy rádlo projelo** (Martin, 19. 10. 2026: „Pokud přes to pole se svým
  pluhem neprojede, nesmí se změnit na zoráno. Teď se občas změnily na zoráno i čtverce, které
  nenavštívil.“). Příčina: lidé sejí za pluhem týž den, takže díl dnešní orby měl večer vzhled
  osetého a scéna ho do dnešní dráhy nezařadila – změnil se naráz bez spřežení; navíc setí po
  pásech vážilo díly bez drnu a předbíhalo orbu přes drn a klučení křovin vypadalo jako zoraný
  díl. Oprava (návrh Clauda – rozhoduje jádro, scéna jen projede jeho dnešní orbu): dráha dne
  projede **každý díl, přes který dnes orba prošla** (podle `progress` od jádra, i když je večer
  už zasetý), ráno je takový díl ve vzhledu před orbou (`unploughed` od jádra) a zoraná zem
  přibývá jen brázdou za rádlem; co se za pluhem zaselo, je vidět další den. Setí po pásech váží
  drn jako orba (nikdy před pluhem) a v plodině, kterou orá spřežení, ukazuje zoranou zem jen
  orba.
- **Při omezeném pohybu** (a bez hodin herního dne) se orba za den nepřehrává – pole ukáže
  konec dne a spřežení stojí na čele jako dřív.

## Spřežení zůstane na poli (24. 10. 2026)

Stav: **Martin, 24. 10. 2026:** „Ve hře teď dny nemáme. Ať spřežení orá, dokud nebude všechno,
co je potřeba, zorané. Tím ušetříme každodenní cesty na pole a návraty domů a poměrně k tomu
můžeme spřežení zpomalit, takže se na něj bude lépe koukat.“ – **ruší denní cestu z ohrady
a zpět** (Co nejdelší brázda – Cesta na místo výš). Podrobnosti **návrh Clauda**:

- **Výjezd:** spřežení plodiny vyjede z ohrady k prvnímu bloku v den, kdy začne orat (první den
  orby v okně, kdy orba opravdu proběhne – den, kdy lidé neorají, spřežení zůstává doma).
- **Na poli:** zůstává u bloku, i ve dny, kdy se neorá (lidé mají přednější práci) – voli jsou
  u rádla, vozy je ten den nemají (Voli se sdílí). Po zorání bloku se přesune k dalšímu bloku
  (od konce posledního pásu bloku vozovou sítí jako dřív).
- **Návrat:** večer dne, kdy je zoráno všechno, co okno potřebuje (orba bez osevu navíc), kdy
  okno orby zítra už neběží, nebo když ves páry s rádlem nemá – zpět do ohrady. Nutné díly
  přibývají po dávkách (čelo práce – fields.md, Osevní postup po dílech): má-li plodina zoráno,
  ale její nutné díly čekají, až lidé dosejí, spřežení na poli počká (návrh Clauda 25. 10. 2026).
- **Cesta ubírá orbě jen při výjezdu a přesunu** (cesta jen tam, stejná čísla `TEAM_TRAVEL`);
  návrat jde po poslední brázdě – zbytek orby posledního dne je menší než den, takže ho
  nezkrátí. Ostatní dny orá spřežení celý den. Na cestě 500 m to dělá ≈ 6 % dne navíc oproti
  denní cestě tam a zpět.
- **Stav:** `PloughWork.trip` – blok, u kterého spřežení je, den a odkud přijelo (`arrived`)
  a den návratu (`home`). Zapíše se večer (`settlePloughTeams`), výkon dne počítá
  `ploughDayFactor` ze stavu ráno. Starší ves se záznamem bez příjezdu má spřežení u bloku, kde
  naposled oralo (na poli); po zorání se večer vrátí.
- **Voda ráno ve dny orby** ([wagons.md](wagons.md)) jen pro pár doma – v den výjezdu; pár na
  poli vodu nesveze.
- **Ve scéně:** spřežení na poli orá dnešní pruhy celý herní den (bez ranní cesty z ohrady
  a večerního návratu), takže jede pomaleji; cesta z ohrady jen v den výjezdu, přesun mezi bloky
  v den přesunu, návrat do ohrady v den návratu; mezi dny bez orby stojí u čela orby. Polohu bere
  scéna z dat jádra (`trip` → `SceneVillage.ploughLegs`).

## Orba má přednost (24. 10. 2026)

Stav: **Martin, 24. 10. 2026:** „Co může být přednějšího než orba?“ Podrobnosti **návrh
Clauda**: v rozdělení práce dne dostane orba rádlem přednost před sezónními úlohami, s nimiž
se její okno překrývá – osevem (osev jde stejně za pluhem a dostane zbytek rukou), výmlatem jaře
v září a sklizní jablek (září – říjen) –, hned po denním minimu domácností, péči o koně,
výpravách a vozech pro kováře (`dayTaskOrder`). Žeň a výmlat ozimu se s orbou nepřekrývají.
Spřežení potřebuje jen oráče (a honáka), jinak voli stojí; dřív se úlohy řadily jen podle
nejbližšího konce okna, takže výmlat jaře v září nebo jablka braly lidi před orbou.
Kapacita rádel (`ploughCap`) se nemění.

## Co hráč vidí

- V nabídce staveb **ohrada** (název a cena v tooltipu).
- V nabídce staveb **ohrada** – rozcestník druhů zvířat (ikona druhu u kurzoru), maluje se po
  čtvercích (nejvýš 4) a rozšiřuje jako hřbitov.
- V panelu ohrady: druh, zvířata v ohradě na noc / místa, čtverce (ikony + čísla), průběh cvičení
  spřežení; u ohrady stáda i **místa všech ohrad druhu / kolik jich stádo potřebuje** (Martin 20. 10. 2026: „když kliknu na ohradu, chtěl bych vidět, kolik obhospodařuje kusů od daného
  zvířectva a kolik by bylo potřeba“) – červeně, když chybí, v popisku kusy u domů. Potřeba (návrh
  Clauda): stádo, které by si ves nechala přes zimu, kdyby ji ohrady neomezovaly (pastva, seno, les,
  pasáci a potřeba jídla platí dál), s jarními mláďaty, nejméně dnešní stádo – bez kusů u domů
  a bez chovného páru s mláďaty (zůstane vždy). Dál zásoba sena na zimu, kolik
  let spřežení ještě slouží a kolik dní výcviku zbývá – ikona přesýpacích hodin (Martin: slunce
  nebylo srozumitelné). Tlačítko výcviku není – spřežení se cvičí samo (Martin, 19. 10. 2026).
- V horní liště **seno** (ikona + číslo), když ves má dobytek v ohradě.
- Ve scéně: ohrada s přístřeškem, v zimě voli a krávy v ohradě, stohy sena, na jaře a na podzim
  spřežení orá pole čtverec po čtverci – na čele orby u čáry, kde se zem mění na zoranou, a každý
  den dojde dál.
- **Výběr spřežení** (Martin 20. 10. 2026: „nešlo mi kliknout na volské spřežení ani na člověka,
  co jej vedl“; podrobnosti návrh Clauda – villagers.md, Výběr spřežení a vozu): klik na voly
  nebo rádlo vybere spřežení – kroužek ho sleduje, panel ukáže, co dělá („orá díl pole“, „jde na
  pole“, „vrací se do ohrady“), voly a tlačítka dílu pole, ohrady volů, oráče a honáka. Oráč
  a honák jsou lidé vsi (honák výrostek nejblíž 12 letům) – klik na ně vybere člověka („orá“,
  „vede spřežení“) s tlačítkem spřežení.

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                                                                                                                                                                                     | Kdo                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Orání rádlem s voly; voli z vlastních telat, výcvik ≈ 2 roky; pastva a seno; rádlo ze dřeva                                                                                                                                                                                                                                                    | návrh Clauda, Martin – směr                                |
| Ohrada s přístřeškem z pleteného plotu se zakulacenými rohy (žádný dobytek v obydlí)                                                                                                                                                                                                                                                           | Martin (rešerše 18. 10. 2026)                              |
| Ohrada 1 čtverec, 40 čd + 6 stromů; 1 spřežení na ohradu; spřežení slouží ≈ 10 let                                                                                                                                                                                                                                                             | návrh Clauda                                               |
| Seno 1,5 t na vola za zimu, louka 1,5 t/ha, sečení 6 čd/ha; bez sena slabší orba / úhyn                                                                                                                                                                                                                                                        | návrh Clauda                                               |
| Orba 10 → 6 čd/ha místo kopání 100 → 50; drn rádlo nezvládne; spřežení ≈ 0,3 ha/den                                                                                                                                                                                                                                                            | návrh Clauda (rešerše)                                     |
| Výcvik z aspoň 3 krav; rádlo jako stavba; seč 1. 6. pro krávy a 2 voly na ohradu                                                                                                                                                                                                                                                               | rozhodnutí kontroléru                                      |
| Náhrada spřežení jen v posledních 2 letech služby; dvě spřežení = druhá ohrada                                                                                                                                                                                                                                                                 | Martin (18. 10. 2026)                                      |
| Zbývající služba a dny výcviku s ikonou přesýpacích hodin (místo slunce)                                                                                                                                                                                                                                                                       | Martin (18. 10. 2026)                                      |
| Pokrytí sena k 1. 3.; vracení orby motyce po celých dílech                                                                                                                                                                                                                                                                                     | rozhodnutí kontroléru                                      |
| Seno ze všech luk – přirozené louky i úhor ve fázi louky, od nejbližší, jen kolik je třeba                                                                                                                                                                                                                                                     | Martin (18. 10. 2026)                                      |
| Přirozené louky do 600 m od obydlí; louky na seno ve scéně z dat                                                                                                                                                                                                                                                                               | návrh Clauda                                               |
| Ohrada smí na pole – čtverec pole pod ní z pole zmizí                                                                                                                                                                                                                                                                                          | Martin (18. 10. 2026)                                      |
| Spřežení postupuje s orbou po čtvercích                                                                                                                                                                                                                                                                                                        | Martin (19. 10. 2026)                                      |
| Seč všech luk na dosah – potřeba stáda podle okna, zbytek jen z volné práce; stáda co největší (voli → krávy → ovce → kozy → prasata)                                                                                                                                                                                                          | Martin (24. 10. 2026), pravidla návrh Clauda               |
| Porážka 1. 11. podle sena v pořadí přednosti, v zimě hned při nedostatku sena (místo úhynu); náhrada volů i po rozpadu páru                                                                                                                                                                                                                    | návrh Clauda, schválil Martin (24. 10. 2026)               |
| Kulaté rohy zorané plochy podle obratu spřežení                                                                                                                                                                                                                                                                                                | Martin (19. 10. 2026)                                      |
| Roh 5 m, jen vnější rohy oraných dílů, úrodu neubírá                                                                                                                                                                                                                                                                                           | návrh Clauda                                               |
| Ladění: spřežení projede celou dnešní orbu za herní den a nechává brázdu                                                                                                                                                                                                                                                                       | Martin (19. 10. 2026)                                      |
| Jen rádlo – ves se spřežením orá všechno, motykou nekope (i drn a louka při založení)                                                                                                                                                                                                                                                          | Martin (19. 10. 2026)                                      |
| Drn orbou křížem 2,5×; kapacita spřežení v plánu osevu; slabí voli orají pomaleji                                                                                                                                                                                                                                                              | návrh Clauda                                               |
| Ztráta spřežení během roku – letošní plán dokončí motyka; kulaté rohy podle stavu vsi                                                                                                                                                                                                                                                          | návrh Clauda                                               |
| Co nejdelší brázda; souvislá plocha, ne z dílce na dílec; na místo po cestě či přes neoseté                                                                                                                                                                                                                                                    | Martin (19. 10. 2026)                                      |
| Bloky a pásy podél delší strany pole, od nejbližšího; výkon L/(L + v·t), obrat 45 s                                                                                                                                                                                                                                                            | návrh Clauda                                               |
| Osa brázdy po blocích (i sever – jih), ne podle celého pole                                                                                                                                                                                                                                                                                    | Martin (19. 10. 2026)                                      |
| Osa bloku = delší průměrná brázda (vážená plochou), při shodě delší rozloha, pak x                                                                                                                                                                                                                                                             | návrh Clauda                                               |
| Brázdy končí na cestě, spřežení se na ní otočí                                                                                                                                                                                                                                                                                                 | Martin (19. 10. 2026)                                      |
| Výkon s průměrnou délkou kusu mezi cestami; kus pod 2 m se neorá; brázda řady až k cestě                                                                                                                                                                                                                                                       | návrh Clauda                                               |
| Kulatější pole – zakulacené i schody obrysu, nepravidelný okraj, bez travnaté souvratě                                                                                                                                                                                                                                                         | Martin, návrh Clauda                                       |
| Ladicí přepínač, pruhy po pruzích obtisku, víc spřežení po souvislých kusech                                                                                                                                                                                                                                                                   | návrh Clauda                                               |
| Pruh u čáry práce (2–4 řady), jen čelo dne, přechod pěšky do 60 m, dvě spřežení na díl                                                                                                                                                                                                                                                         | návrh Clauda                                               |
| Seno i pro ovce a kozy; dávky malého dobytka; práce seče se sušením a svozem                                                                                                                                                                                                                                                                   | Martin (19. 10. 2026)                                      |
| Kráva 5, vůl 6, ovce a koza 1 kg denně; seč 15 → 10 čd/ha; stoh 10 %/rok                                                                                                                                                                                                                                                                       | návrh Clauda (rešerše)                                     |
| Staré seno se k nové seči zkazí; seče se na zimní stádo podle potřeby                                                                                                                                                                                                                                                                          | návrh Clauda                                               |
| Spřežení se cvičí samo – co ulehčí práci a ves to má, vesničané používají sami                                                                                                                                                                                                                                                                 | Martin (19. 10. 2026)                                      |
| Řádky sena zelenožluté, širší a nepravidelné, jen pár dní po seči, pak kupky (fields.md)                                                                                                                                                                                                                                                       | Martin (19. 10. 2026)                                      |
| Výcvik začne první vhodný den (telata, dřevo, v zimě seno), rádlo staví ves sama                                                                                                                                                                                                                                                               | návrh Clauda                                               |
| „Zvířata je potřeba na noc zavírat do ohrad. Každý druh zvířete by měl mít vlastní ohradu, ať se nemíchají. Velikost ohrady by mělo jít určovat podobně, jako když se staví hřbitov. Velikost ohrady bude mít vliv na velikost stáda. Zároveň velikost ohrady bude omezená – má to být ohrada, ne výběh.“                                      | Martin (19. 10. 2026)                                      |
| Druhy ovce, kozy, prasata, skot, spřežení; nejvýš 4 čtverce; rozšíření jako hřbitov                                                                                                                                                                                                                                                            | návrh Clauda, Martin („Ano, udělej to tak, jak navrhuješ“) |
| Ohrada v mřížce staveb je rozcestník druhů (zpět + 5 druhů); druhy bez zkratek, Tab druh nepřepíná, [O] otevře rozcestník                                                                                                                                                                                                                      | Martin (20. 10. 2026), zkratky návrh Clauda                |
| Místa na čtverec: ovce 130, kozy 100, prasata 80, krávy 45 – pro dospělé i jarní mláďata                                                                                                                                                                                                                                                       | návrh Clauda (rešerše)                                     |
| Bez ohrady u domu 2 ovce, 1 koza, 1 prase na domácnost, krávy jen v ohradě                                                                                                                                                                                                                                                                     | návrh Clauda, Martin schválil                              |
| Chovný pár druhu zůstane u domů vždy; kusy čekající na zimní porážku jen do volných míst                                                                                                                                                                                                                                                       | rozhodnutí Clauda                                          |
| Staré ohrady: se spřežením nebo výcvikem spřežení, jinak skot                                                                                                                                                                                                                                                                                  | návrh Clauda, Martin schválil                              |
| Přístřešek v prvním čtverci zády a bokem k vnějšímu plotu; rozšíření ve stavbě jen vytyčené                                                                                                                                                                                                                                                    | rozhodnutí Clauda                                          |
| Upozornění „Ovce se nevejdou do ohrad“                                                                                                                                                                                                                                                                                                         | rozhodnutí Clauda                                          |
| Roční odklad míst: porážka aspoň 365 dní po založení vsi / zavedení pravidla; upozornění i během odkladu                                                                                                                                                                                                                                       | návrh Clauda                                               |
| „Vesnice určitě potřebuje více vozů. Ať to funguje jako se stády - ohrada pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc vozů, ohrada se musí zvětšit. Zaároveň to udělej tak, že rádlo táhnou 2 voli, 4kolový vůz také dva voli a dvoukolový vůz jeden vůl. Napiš návrh, co všechno se dá vozit na vozech a jakých.“ | Martin (20. 10. 2026)                                      |
| Ohrada volů, voli po kusech (den vycvičení, služba 10 let), 6 volů na čtverec i s telaty, potah 2 / 2 / 1                                                                                                                                                                                                                                      | návrh Clauda, Martin („Ano, udělej to jak říkáš“)          |
| Páry k rádlům podle plánu osevu k 1. 9. (nejméně párů, se kterými plán vybere totéž jako bez meze orby)                                                                                                                                                                                                                                        | návrh Clauda, Martin schválil                              |
| Voli se sdílí – víc z párů a volů vozů, ne součet; ve dny orby páry napřed; strop místa, upozornění                                                                                                                                                                                                                                            | návrh Clauda, Martin schválil                              |
| Kráva navíc na 4 voly; výcvik i po jednom volovi; rádlo jen pro nový pár k orbě                                                                                                                                                                                                                                                                | návrh Clauda, Martin schválil                              |
| Rádlo se neopotřebí; převod: spřežení = 2 voli, výcvik = 2 telata, rádlo za ohradu, rozestavěné rádlo se zruší                                                                                                                                                                                                                                 | rozhodnutí Clauda                                          |
| Zima bez sena: uhyne tolik volů, aby zbylí měli polovinu, nejdřív telata; uhynulí na maso nejdou                                                                                                                                                                                                                                               | rozhodnutí Clauda                                          |
| 6 m² na vola (≈ 400 kg) s jeslemi a přístřeškem; vůl navíc na vůz ve dny orby, když se vyplatí                                                                                                                                                                                                                                                 | rozhodnutí Clauda                                          |
| Telata na voly jen z přírůstku nad chovnými kravami (stádo pod cíl neklesne, výcvik počká na jaro)                                                                                                                                                                                                                                             | návrh Clauda (20. 10. 2026)                                |
| ~~Páry k rádlům s hysterezí – mění se, jen když potřeba trvá dva plány po sobě~~ (nahoru hned od 27. 10. 2026)                                                                                                                                                                                                                                 | návrh Clauda, hystereze rozhodnutí Clauda                  |
| Krávy navíc přes zimu na telata, která ves do výcviku potřebuje                                                                                                                                                                                                                                                                                | rozhodnutí Clauda                                          |
| Náhrada posledního páru k orbě bere telata i pod cílem krav, dokud zůstane chovný pár; krávy na telata rok předem                                                                                                                                                                                                                              | návrh Clauda (20. 10. 2026), rok předem rozhodnutí Clauda  |
| „Ať spřežení orá, dokud nebude všechno, co je potřeba, zorané.“ – spřežení zůstane na poli, cesta jen při výjezdu, přesunu (a návratu)                                                                                                                                                                                                         | Martin (24. 10. 2026)                                      |
| Výjezd v den, kdy orba proběhne; návrat večer po zorání okna, na konci okna nebo bez párů; návrat orbu nekrátí; pár na poli vodu nesveze                                                                                                                                                                                                       | návrh Clauda                                               |
| „Co může být přednějšího než orba?“ – orba rádlem první ze sezónních úloh, hned po minimu, koních, výpravách a vozech pro kováře                                                                                                                                                                                                               | Martin (24. 10. 2026), pořadí návrh Clauda                 |
| Pod pojistkou zásob páry k rádlům i na nutné díly mimo postup (nouzové přílohy) a nahoru hned – úzkým hrdlem osevu Vlkova bylo jediné rádlo, ne lidé                                                                                                                                                                                           | Martin (27. 10. 2026), návrh Clauda                        |
| Páry k rádlům a rádla nahoru hned, když orba nestačí na plán setí („Nejen že smí, ale dokonce by měla“), dolů po dvou plánech                                                                                                                                                                                                                  | Martin (27. 10. 2026), provedení návrh Clauda              |
| Seno jen na skutečné voly – voli ves má nebo přicházejí a telata, která výcvik opravdu dostane                                                                                                                                                                                                                                                 | Martin (2. 11. 2026), návrh Clauda                         |
