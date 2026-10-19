# Pevné cesty – stromy podél nich a vylepšení

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“). **Fáze 1 hotová** (18. 10. 2026 –
pevné cesty a stromy u nich, viz [Fáze 1 – jak je postavená](#fáze-1--jak-je-postavená)),
**fáze 2 hotová** (výběr, vylepšení a rychlejší chůze – [Fáze 2](#fáze-2--jak-je-postavená)),
**fáze 3 hotová** (jabloně podél cesty – [Fáze 3](#fáze-3--jak-je-postavená)). **Cesta je cesta**
(19. 10. 2026 – po pevné cestě bez ohledu na povrch, cesta s jabloněmi nezaroste –
[Cesta je cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Navazuje na
[vyšlapané pěšiny](paths.md) (jen vzhled) a nahrazuje v nich stromy podél pěšin.

## Proč

Stromy podél pěšin dnes přeskakují: rozmisťují se znovu při každém přepočtu denní sítě pěšin,
která se mění s prací dne (rozbor 18. 10. 2026). Martin: stromy mají záviset na **pomalé
složce**, růst **postupně – napřed jako keř** – a kde jednou vyrostou, **stojí, dokud samy
neodumřou**. Kde vznikne taková pevná cesta, **hráč ji vybere kurzorem a vylepší** (Martin).
Cesta se tím stává herní věcí: pamatuje si, kudy vede, a zkracuje lidem chůzi.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** pevná cesta vzniká sama z dlouhodobého provozu a nehýbe se; denní pěšiny se k ní
  stahují.
- **Cíl:** stromy u pevné cesty jsou herní data – vyrostou z keře, stojí na místě a odumřou
  stářím (Martin).
- **Cíl:** hráč pevnou cestu vybere a vylepší ve **třech stupních** – vyšlapaná → upravená →
  hať a lávka (Martin) – a **nezávisle** na nich podél ní **vysadí jabloně** (Martin).
- **Cíl:** vylepšená cesta **zrychlí chůzi** – vzdálená pole, les a sady stojí méně práce
  (Martin).
- **Ne-cíl (teď):** vozy a tažná zvířata na cestách, obchod, cesty mezi vsemi a mapami (přijde
  s [válkou](war.md) a světem), mosty pro vozy, údržba cest, mýto.
- **Anti-cíl:** cesta nebo strom, které se pohnou samy od sebe; hráč, který musí cesty kreslit
  (cesty vznikají chozením, hráč je jen vylepšuje).

## Dvě vrstvy cest

- **Pěšiny dne** ([paths.md](paths.md)) zůstávají jen vzhled – vedou tam, kam ves dnes chodí,
  a mění se s prací. Nově jdou raději po pevné cestě (sleva jako po silné pěšině), takže se
  k ní stahují. Stromy podél nich zmizí – stromy mají jen pevné cesty.
- **Pevné cesty** počítá a ukládá simulace vsi (server):
  - **Jednou za rok** (1. 11., po sklizni jablek – návrh Clauda) spočítá síť z **celoroční
    práce** (člověkodny za rok po místech, voda, dřevo, sousedé – průměr na den), ne z dnešní.
    Výpočet je stejný jako u pěšin dne, jen s ročním provozem.
  - Úsek, kterým se **dva roky po sobě** chodí aspoň **3× denně** (roční průměr – zhruba síla
    0,55 dnešních pěšin), se stane **pevnou cestou** (návrh Clauda). Uloží se jeho osa
    a od té doby se nehýbe. Nová trasa, která vede blízko pevné cesty, se k ní přimkne (sleva
    za pevnou cestu), takže se síť jen rozrůstá, nepřekresluje.
  - Pevná cesta je **úsek mezi rozcestími a konci** – po ní se vybírá a vylepšuje. Kde se
    potkávají jen dva úseky (falešné rozcestí – odbočka zarostla, nová cesta navázala na konec
    jiné), spojí se do jednoho (Martin, 18. 10. 2026 – viz [Úseky a rozcestí](#úseky-a-rozcestí)).
    Rozcestí je ve scéně udusaný plácek – nejvyšlapanější místo cesty.
  - **Zarůstání:** vyšlapaná cesta, kterou se **5 let po sobě** chodí pod polovinu prahu,
    zaroste a zmizí (návrh Clauda) – **po kusech**: zaroste jen kus, kudy se nechodí, zbytek
    zůstane (Martin, 19. 10. 2026 – [Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)).
    Upravená cesta a hať nezarůstají, ani kus cesty s vysazenými jabloněmi (návrh Clauda
    z 19. 10. 2026 – hráč do něj vložil práci; [Cesta je
    cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Stromy u zarostlé cesty stojí dál,
    dokud neodumřou.

## Stromy u pevných cest

- **Kde:** po obou stranách pevné cesty v polní krajině (podél pole nebo louky – ne v lese, ve
  vsi, na pozemcích, hřbitově ani v sadu; **i na poli** – Martin, 18. 10. 2026, Pole jako
  krajina: místa leží na mezi, kam se neorá, a uchycený strom vezme dílu 20 m² – návrh Clauda),
  2,5–4 m od osy, místa po 12–20 m střídavě vlevo
  a vpravo, trochu nepravidelně, dva stromy nejméně 8 m od sebe (jako dnes – návrh Clauda).
  Místa se určí jednou, když cesta vznikne, deterministicky ze seedu vsi a polohy.
- **Uchycení:** na volném místě u cesty starší **5 let** se strom uchytí s pravděpodobností
  **10 % ročně** (náletem na neoraném okraji – návrh Clauda; los z seedu vsi a roku).
- **Druhy:** polovina dubů, zbytek jilmy a topoly (jako dnes).
- **Růst (Martin – napřed keř):** **keř** do 8 let (model keře), pak **mladý strom** (30 %
  velikosti), plná velikost ve **40 letech** (návrh Clauda).
- **Stojí, dokud neodumře (Martin):** délka života podle druhu – **topol 60–100 let, jilm
  100–200, dub 200–400** (los při uchycení – návrh Clauda). Po smrti zbude **souš** na 10 let,
  pak **pařez** na 10 let a místo je znovu volné.
- **Vesničané je na dřevo nekácí** – stojí, dokud neodumřou (Martin). Výjimka: když přes strom
  hráč postaví pole, dům, sad nebo hřbitov, skácí se jako ostatní stromy a dá kládu (návrh
  Clauda).

## Vylepšení cesty (staví hráč)

Hráč klikne na pevnou cestu – vybere se celá cesta (řetěz úseků – [Cesta pro
hráče](#cesta-pro-hráče)), v panelu je stupeň, délka, stáří, stromy a jabloně a tlačítka
vylepšení (ikony, cena v popisku – jako v 0 A.D.). Vylepšení je stavba ze
společné práce vsi; stromy bere jako obydlí (klády z hromady, pak nejbližší dospělé stromy).

| Stupeň                     | Co se udělá                                                 | Cena (návrh Clauda)                                       | Rychlost chůze (návrh Clauda)         |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| 1. **Vyšlapaná cesta**     | vznikne sama                                                | –                                                         | 1,5× proti louce (i vyježděná)        |
| 2. **Upravená cesta**      | vyrovnaná a rozšířená – širší vyšlapaná cesta (bez strouhy) | **15 člověkodní na 100 m**                                | 1,7×                                  |
| 3. **Hať a lávka** (po 2.) | povalový chodník přes mokřinu, lávka z kmenů přes potok     | hať **1 strom a 2 čd na 2 m**, lávka **4 stromy a 15 čd** | 1,7× i přes mokřinu; brod bez zdržení |

- **Stupeň 3** jde jen na úseku, který vede mokřinou (rovina podél potoka) nebo brodí potok –
  jinak se nenabízí.
- **Vysazení jabloní** (nezávislé na stupni – Martin): podél úseku po obou stranách po
  **10 m** (střídavě, na volných místech – kde stojí strom, jabloň nebude). Jako
  [sad](orchard.md) na strom: výsadba **0,45 čd** (80 čd/ha při ≈ 180 stromech/ha) jen v oknech
  jara a podzimu, péče v zimě, sklizeň v září–říjnu, úroda **≈ 17 kg jablek na strom** při plné
  úrodě (≈ 3 t/ha), plody od 6. roku, život ≈ 60 let – pak souš a místo je volné; „Vysadit
  jabloně“ znovu doplní mezery (návrh Clauda). Jablka jdou do zásoby ovoce jako ze sadu.

## Rychlejší chůze (Martin – efekt vylepšení)

Martin (19. 10. 2026), rychlost chůze proti louce: „berme louku za výchozí: 1 vyšlapaná denní
cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7 –
tyhle hodnoty se týkají chůze.“ A dál: „Neber strniště jako louku, ale dej mu drobný postih. Ber to
třeba jako 0.8.“ K obcházení polí: „když použiješ třeba dijkstrův algoritmus pro procházení
ohodnoceného grafu, tak nejkratší cesta je ta nejrychlejší. Tj. může se stát, že někde bude
jednodušší jít přes pole, než ho obcházet i když je cesta přes pole pomalejší.“

| Kudy                                                                | Rychlost proti louce                               |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| louka (výchozí), úhor, příloh, zakládaný díl                        | 1                                                  |
| pěšina dne plně prošlapaná                                          | 1,3 – slabší úměrně méně podle síly (návrh Clauda) |
| stálá vyšlapaná cesta i vyježděná cesta                             | 1,5                                                |
| upravená cesta                                                      | 1,7                                                |
| hať a lávka                                                         | 1,7, i přes mokřinu (návrh Clauda)                 |
| díl pole v osevu – od orby nebo kopání po sklizeň (zoraný … ve žni) | 0,5                                                |
| strniště po sklizni                                                 | 0,8                                                |
| mokřina bez cesty i po vyšlapané či upravené cestě                  | 0,5                                                |
| brod bez lávky                                                      | + 30 m                                             |

- **Stejné rychlosti v síti pěšin i ve vzdálenosti chůze** (`walk-speed.ts` – `partWalkSpeed`,
  `pathCostFactor`, `roadWalkSpeed`; čísla `PATH_WALK`, `FIELD_WALK`, `ROAD_WALK` v `rules.ts`):
  buňka sítě stojí 1 / rychlost (krát les, svah a překážky jako dřív), chůze rovně, po pěšině i po
  pevné cestě se počítá stejně. Pole není zákaz, jen cena – síť hledá nejrychlejší cestu, takže
  díl v osevu obejde, když je obcházení krátké, a jde přes něj, když je dlouhé. Pěšina dne přes
  díl v osevu nezrychlí (platí cena pole), pevná cesta přes pole jde rychlostí cesty (pás cesty se
  neorá – Cesta přes pole). Nejpomalejší z mokřiny a pole platí (ne součin). Díl pole pozná chůze
  podle vzhledu (`fieldPartLooks` – jako scéna; rozpracovaný díl podle větší části), do klíče
  přepočtu chůze se rychlost dílu promítá jako stadium – 1. dne v měsíci (paths.md – Pěšiny
  a práce). Brod v síti pěšin stojí jako dřív (cena buňky brodu), les, svah a překážky taky.

- Dnes práce zdražuje **vzdušná vzdálenost** od obydlí: +1 % za každých 10 m nad 100 m (pole
  a sad – [fields.md](fields.md); kácení a palivo – [forest.md](forest.md)).
- Nově se měří **chůzí** (návrh Clauda): délka trasy, kudy lidé skutečně jdou (roční síť),
  a úsek po cestě se započítá zkráceně podle rychlosti (po upravené cestě 340 m jako 200 m).
  Mokřina se počítá dvojnásobně (bahno), brod + 30 m (zout se, přebrodit). Vzdálenosti se
  přepočítají jednou za rok a po dokončení vylepšení.
- Pole za potokem nebo za mokřinou tak bez cesty zdraží, s hatí a lávkou zlevní. Pole 400 m
  daleko bez cesty ≈ +30 %, s upravenou cestou ≈ +20 % (příklad).

## Co hráč vidí

- **Pevná cesta** je silnější a stálá – vyšlapaná hlína (jako dřív silná pěšina; pěšiny dne jsou
  vedle ní nevýrazné – [paths.md](paths.md)), upravená cesta je jen širší (Martin, 19. 10. 2026:
  „Vyšlapanou cestu nechme jako teď a upravená cesta ať je prostě jenom širší – ta odvodňovací
  strouha vypadá divně, zrušíme ji“), hať z kmenů napříč, lávka přes potok (modely nové).
- **Stromy** u cest od keře po plný strom, souše a pařezy; jabloně s jablky od srpna.
- **Výběr** pevné cesty kliknutím (zvýrazní se celá cesta hráče – řetěz úseků), panel: druh
  (ikona – vyšlapaná, vyježděná, upravená, hať), délka (u cesty z víc druhů i po druzích), stáří,
  stromy a jabloně (ikony + čísla), tlačítka vylepšení.
- Kronika: vznikla pevná cesta, vylepšení dokončeno, jabloně vysazeny.

## Rozhodnutí

| Rozhodnutí                                                                               | Kdo          |
| ---------------------------------------------------------------------------------------- | ------------ |
| Stromy jen u pevných cest z pomalé složky; růst od keře; stojí, dokud samy neodumřou     | Martin       |
| Pevnou cestu hráč vybere kurzorem a vylepší                                              | Martin       |
| Tři stupně: vyšlapaná → upravená → hať a lávka; efekt rychlejší chůze                    | Martin       |
| Nezávislé vylepšení: vysazení jabloní podél cesty                                        | Martin       |
| Roční síť k 1. 11., práh 3 cesty za den 2 roky, zarůstání vyšlapané po 5 letech          | návrh Clauda |
| Uchycení 10 %/rok po 5 letech cesty, keř 8 let, plný strom 40 let, životy topol/jilm/dub | návrh Clauda |
| Ceny a rychlosti stupňů, jabloně po 10 m jako sad na strom                               | návrh Clauda |
| Vzdálenost práce chůzí místo vzdušnou čarou, mokřina ×2, brod +30 m                      | návrh Clauda |
| Fáze 1 – rok cest, porovnání s loňskem, připojení a dělení úseků, provoz cesty (níž)     | návrh Clauda |
| Fáze 1 – místa na stromy, strom jako překážka (kláda od 20 let), cesta přes pole zůstává | návrh Clauda |
| Fáze 2 – mokřina, výběr, ceny bez přirážky, okno chůze, kácení chůzí po pevných cestách  | návrh Clauda |
| Fáze 3 – místa jabloní, výsadba jako stavba, souš 10 let, jabloně zůstanou i bez cesty   | návrh Clauda |
| Úsek mezi rozcestími: dva úseky v uzlu bez odbočky se spojí; rozcestí je udusaný plácek  | Martin       |
| Spojení – id a den vzniku staršího, provoz vážený délkou; různý stupeň zůstane rozdělen  | návrh Clauda |
| Jabloně a stromy u cest i na poli (pole jako krajina)                                    | Martin       |
| Strom na poli vezme dílu 20 m²; nálet jen na mezi – místa 2,5–4 m od osy                 | návrh Clauda |
| Pěšina dne nevýrazná; vyšlapaná cesta beze změny; upravená jen širší, strouha zrušená    | Martin       |
| Upravená cesta 3 m (vyšlapaná 1,9 m), bez kamenů; kmeny hatě na šířku upravené cesty     | návrh Clauda |
| Po pevné cestě se chodí bez ohledu na povrch pod ní (pole, sad, les, svah)               | Martin       |
| Výjimky: brod, neprůchodná místa, ploty hřbitova a ohrady, svatyně a stavby              | návrh Clauda |
| Cesta s jabloněmi nezaroste (jako upravená, hať a stezka); díl pole o cestu nepřichází   | návrh Clauda |
| Zarůstá jen nepoužívaný kus úseku, zbytek zůstane se starým id                           | Martin       |
| Kusy ≈ 25 m, historie jen tichých kusů (střed a roky), volný konec u zarostlého kusu     | návrh Clauda |
| ~~Pole lidi nezdržuje – nejkratší cesta i přes osetý díl~~ (změněno – rychlosti chůze)   | Martin       |
| Připojení nové cesty po souběžném kusu do 14 m                                           | návrh Clauda |
| Vozy vyjezdí vlastní cesty, ve svahu serpentiny                                          | Martin       |
| Vozová cesta = pevná cesta s příznakem z ročního provozu vozů, pro lidi stejná           | návrh Clauda |
| Vyjezdí-li vůz cestu, je to vyježděná cesta; vyšlapanou cestu vozová přebije             | Martin       |
| Vyježděná = druh cesty pro hráče (vyšlapaná s vozy); upravená a hať zůstanou             | návrh Clauda |
| „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5“          | Martin       |
| „Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7“                              | Martin       |
| „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“            | Martin       |
| „nejkratší cesta je ta nejrychlejší“ – pole je cena, ne zákaz                            | Martin       |
| Hať 1,7× i přes mokřinu; pěšina úměrně síle; stejné rychlosti v síti pěšin i chůzi       | návrh Clauda |

## Cesta je cesta – povrch pod ní a zarůstání

Martin (19. 10. 2026, ves Vlkov): „Je tam vidět, že na nový hřbitov vedla nejkratší cesta, kolem
které dokonce byly nějaké stromy (jabloně) a ta zanikla a lidé to začali obcházet divnou delší
cestou.“ a „Když už někde vyšlapaná cesta je, ať po ní lidé chodí bez ohledu na to, na čem ta
stezka leží.“

- **Po pevné cestě bez ohledu na povrch** (Martin): buňka sítě pěšin pod osou pevné cesty
  (jakéhokoli stupně, i vyšlapané) stojí jako rovná louka a k tomu sleva plné pěšiny – díl pole
  v jakémkoli stadiu (osetý, zoraný, zakládaný, zarůstající příloh), sad, les vsi i krajiny, svah
  ani kmeny, keře a kameny krajiny ji neprodraží (`ROAD_CELL_COST` v `network.ts`). Dřív pod
  cestou platila cena povrchu: přes osetý díl stála cesta 12 × 0,5 = 6× louku, lidé ji obcházeli
  kolem pole a cesta zarostla. Platí v síti dne (vzhled, postavy) i v roční síti (pevné cesty).
- **Co platí dál** (návrh Clauda): **brod** se počítá jako dřív – v síti cena brodu z terénu,
  v chůzi pro práci podle mokřiny a brodů na ose a stupně (brod + 30 m, po lávce nic, mokřina
  podle stupně). **Neprůchodné místo** (voda mimo brod, sráz, balvan, skalní výchoz) zůstává
  neprůchodné – pevná cesta přes ně nevzniká (vzniká z provozu, který je obchází), osa je může
  nanejvýš lízt rohem buňky. **Ploty a stavby** zůstávají překážkou: hřbitov, ohrada, okrsek
  svatyně, dům, pozemek, staveniště, modla a milíř. Postaví-li hráč stavbu přes pevnou cestu,
  přehradí ji – lidé ji obejdou podél plotu (okraj čtverce plotem není) a cesta po obou stranách
  žije dál: provoz cesty je medián po ose, krátký kus pod stavbou ho nezkreslí. Důvod: plot a zeď
  jsou skutečná překážka, kterou cesta neprorazí, a přes cestu je postavil hráč; zrušit kus cesty
  pod stavbou může přijít později (jako u pole přes cestu – Fáze 1).
- **Chůze pro práci** (`walking.ts`) povrch pod pevnou cestou nepočítala už dřív: po cestě podle
  stupně, mokřiny a brodů na ose (`roadPieceCost`), rovně jen mokřina a voda – pole, sad ani les
  chůzi nezdraží (hlídá test). Beze změny.
- **Cesta s prací hráče nezaroste** (návrh Clauda – hráč do ní vložil práci): vyšlapaná cesta,
  podél které jsou vysazené jabloně (živé, nebo se teprve sázejí – `keepingApples`; od zavedení
  zarůstání po kusech drží jabloň kus cesty u sebe), nezaroste ani při malém provozu – stejně jako upravená cesta, hať s lávkou a hotová zemská stezka
  (stupeň nad vyšlapanou) a cesta, která se vylepšuje. Až všechny jabloně dožijí (souš), může
  zarůst jako jiná.
- ~~**Díl pole pod cestou o plochu nepřichází**~~ (návrh Clauda; **zrušeno** 19. 10. 2026 –
  Martin: cesta poli plochu ubírá, viz [Cesta přes pole](#cesta-přes-pole)) – na rozdíl od stromu na poli
  (20 m²): (1) pevná cesta vzniká a zaniká sama provozem, hráč o ní nerozhoduje – ubírat pole by
  byla neviditelná ztráta, kterou nemůže ovlivnit, a při zarůstání, spojování a dělení úseků by
  se plocha musela vracet a přepočítávat (`giveWayToBuilding` umí jen ubrat); (2) je to málo –
  ve Vlkově vedl úsek 24 přes pole 285 m, při šířce 1,9 m ≈ 540 m², tj. 0,13 % ze 40 ha polí
  (na jednom přeťatém dílu ≈ 28 m² z 225 m²); (3) strom pole stíní a obchází se s rádlem
  i motykou, pás cesty je mez mezi díly, po které se jen chodí. Staré vsi se tím nemění.
- **Vlkov** (rozbor 19. 10. 2026 na kopii stavu): úsek 24 (vyšlapaný, 378 m, z toho 285 m přes
  pole, 6 jabloní) vedl ze vsi kolem nového hřbitova (≈ 15 m od něj, hotový 749) dál ke starému
  plnému hřbitovu. 1. 11. 752 se do roční sítě promítly ozimy: trasa ke hřbitovu opustila cestu
  100–220 m od vsi a obešla osetý blok východem (na ose 0 cest za den). Navíc za novým hřbitovem
  chodí ke starému hřbitovu jen 0,6 cesty denně (k modle) – a to je víc než polovina délky úseku,
  takže medián provozu byl 0,6 (práh zarůstání 1,5) a úsek zarostl i s jabloněmi. S novým
  pravidlem jde provoz po cestě až k novému hřbitovu (3,1–3,7 cesty denně, trasa ≈ 180 m při
  vzdušné vzdálenosti 160 m), medián úseku ale zůstává 0,6 – úsek drží jabloně (dopočet kopie
  stavu přes 1. 11. 752: zůstane). Dnes (758) úsek 24 neexistuje a data hráče se neobnovují:
  v létě trasa ke hřbitovu obchází osetý blok západem (≈ 350 m po pěšinách místo ≈ 180 m). Na
  nejkratší trase přes pole cesta sama znovu nevznikne – mimo pevnou cestu se přes osetý díl dál
  nechodí (od 19. 10. 2026 neplatí – [Pole lidi nezdržuje](#pole-lidi-nezdržuje)); 1. 11. 758 ale
  vznikne nová pevná cesta (79 m) od vsi k severozápadu podél okraje
  osetých dílů (stejně se starým i novým pravidlem) a po ní se pak chodí i v letech, kdy jsou
  díly pod ní oseté.
- ~~**Otevřené – k rozhodnutí:** dlouhý úsek, jehož část vede tam, kam se už nechodí, zaroste celý
  – i s používanou částí (medián provozu po ose). Ve Vlkově by úsek 24 bez jabloní zarostl
  i s novým pravidlem. Návrh Clauda: zarůstá jen nepoužívaný kus úseku – úsek se v roční kontrole
  rozdělí tam, kde provoz klesne pod polovinu prahu, a zaroste jen ta část.~~ Rozhodnuto – Martin
  z 19. 10. 2026: „ano“ ([Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)).

## Zarůstá jen nepoužívaný kus

Martin (19. 10. 2026) na návrh „dlouhý úsek zaroste celý, i když se po jeho části dál chodí –
zarůstá jen nepoužívaný kus úseku“: **„ano“**. Podrobnosti návrh Clauda.

- **Po kusech:** v roční kontrole (1. 11.) se provoz roční sítě posuzuje po kusech osy – osa
  úseku rozdělená na stejně dlouhé kusy co nejblíž **25 m** (`ROADS.pieceM`, kratší úsek je jeden
  kus; provoz kusu je medián bodů po 3 m jako u celého úseku). 25 m je dost krátké, aby se tichý
  konec oddělil blízko místa, kde provoz spadne, a dost dlouhé (≥ 15 m – nejkratší pevná cesta),
  aby jedno místo provoz nezkreslilo a odříznutý kus i zbytek byly platné úseky.
- **Historie:** úsek nese jen tiché kusy (`Road.quiet` – střed kusu na cm a kolik ročních kontrol
  po sobě je pod polovinou prahu, nejvýš 5), ne provoz po bodech – stav nebobtná (u Vlkova
  desítky čísel). Rok se přičte, když loni byl tichý kus do půl kusu od středu letošního (střed
  ve světě, takže dělení a spojování úseků historii nerozbije – kusy jdou podle polohy k nejbližší
  ose). Kus, kde se letos chodí, historii ztratí.
- **Zarůstání kusu:** kus tichý **5 let po sobě** zaroste, když u něj (do 6 m od osy kusu) nestojí
  živá nebo sázená jabloň (`keepingApples`); upravená cesta, hať, stezka a cesta, která se
  vylepšuje, nezarůstají vůbec. Zaroste-li celý úsek, zmizí jako dřív. Jinak se tiché kusy
  vyříznou (`cutOvergrown`) a **zbytek zůstane pevnou cestou se starým id a dnem vzniku** (druhý
  zbytek, když zarostl kus uprostřed, dostane nové id). Kronika „Nepoužívaná cesta zarostla.“
  jen pro zarostlý kus (`road-overgrown` s novým id kusu).
- **Volný konec:** konec zbytku u zarostlého kusu je volný (`openEnds` – pás cesty se ve scéně
  vytrácí) a díra se k němu nedoplňuje – pamatuje si ho `VillageRoads.cutEnds`, dokud tam nějaký
  úsek končí. Falešná rozcestí po oddělení spojí `mergeRoadChains` jako jindy.
- **Stromy:** u zarostlého kusu stojí dál (pařezy a souše dožijí jako dřív), volná místa na stromy
  zmizí s kusem; jabloně zůstanou a patří nejbližšímu zbytku.
- **Starší vsi:** tiché kusy se začnou počítat od další roční kontroly – nic nezaroste hned
  (úsek, který byl podle dřívějšího pravidla 4 roky pod prahem, počítá znovu od roku 1).
- **Vlkov** (kopie stavu z 21. 3. 752, kdy úsek 24 ještě byl, dopočet do 2. 11. 756): úsek 24
  (378 m ze vsi kolem nového hřbitova ke starému) 1. 11. 756 zkrátí na **151 m od vsi
  k jihozápadnímu rohu nového hřbitova** – tam vede provoz (3 a víc cest denně) a stojí jabloně;
  227 m dál ke starému plnému hřbitovu (0,6 cesty denně) zaroste (kronika s novým id 131), konec
  u hřbitova je volný.

## Vozové cesty

Martin (19. 10. 2026): „Vozy mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří
chodí pěšky. Bude to znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset
vyjezdit serpentiny.“ Návrh, síť vozů a čísla: [wagons.md](wagons.md) – Vozová síť a vyjeté cesty,
Jak je postavené – fáze 2 (návrh Clauda).

Martin (19. 10. 2026): „Cesty – pokud nějakou cestu vyjezdí vůz, bude to vyježděná cesta. Pokud
vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“

- **Druhy cest pro hráče:** vyšlapaná, **vyježděná**, upravená, hať a lávka. Vyježděná cesta je
  v datech vyšlapaná cesta s příznakem vozová (`Road.cart`; druh `roadKind` v
  `paths/road-chains.ts`) – stupeň řídí chůzi a vylepšení, takže nový stupeň by byl jen jiným
  jménem pro totéž. Upravená cesta a hať zůstanou upravenou a hatí (jsou víc než vyježděná) – vozy
  po nich jezdí a ve scéně mají koleje. Vylepšit jde vyježděnou cestu jako vyšlapanou.
- **Vyježděná cesta vzniká z ročního provozu vozů** stejně jako pěší z provozu lidí – kudy vozy dva
  roky po sobě jezdí aspoň 0,25 jízdy denně (loňské úseky `VillageRoads.cartCandidates`), vznikne
  nová. **Vůz přebije vyšlapanou:** kudy vozy jedou po vyšlapané cestě (do 5 m od osy, stejným
  směrem), ten kus vyšlapané se stane vyježděnou (úsek se v koncích kusu rozdělí); kudy jedou
  souběžně kus vedle (do 12 m – jako souběžné cesty), od 25 m vznikne vyježděná po ose vozu a
  souběžný kus vyšlapané zmizí, kratší kus vyšlapanou převezme. Provoz vozů se nikdy neztratí
  a dvě souběžné cesty nevzniknou (wagons.md – Jak je postavené, fáze 2). Po 5 letech pod
  polovinou vyježděná příznak ztratí a je zase jen vyšlapaná.
- **Lidé po ní chodí jako po každé pevné cestě** (pro síť pěšin je vyježděná cesta obyčejná pevná
  cesta). Ve svahu se pěšina a vyježděná cesta rozejdou – pěšina rovně, vyježděná serpentinami;
  v rovině vozy jezdí po vyšlapané cestě a ta se stane vyježděnou.
- **Zarůstání po kusech:** kus, kudy jezdí vozy (aspoň polovina prahu vozů), není tichý – vyježděná
  cesta ve svahu, kudy lidé nechodí, nezaroste, dokud po ní jezdí vozy.
- **Úseky:** vyježděná a vyšlapaná cesta se nespojují do jednoho úseku (jako různé stupně) – hráč je
  vidí jako jednu cestu s délkou po druzích; u souběžných cest je vyježděná silnější (zůstane ona).
- **Pro vůz je sjízdná každá pevná cesta** (i pěší – lesem, přes pole), jen ne sklonem nad mez
  a vodou bez brodu; upravená cesta i hať jsou sjízdné vždy. Lávka je jen pro pěší.
- **Ve scéně:** širší pás (2,6 m), tráva mezi dvěma kolejemi; rozcestí vyježděných cest je
  udusaný plácek na šířku vyježděné cesty.

## Pole lidi nezdržuje

Martin (19. 10. 2026): „Ať lidé chodí vždy nejkratší možnou cestou a oseté pole ať neřeší. Aspoň se
nám pak hezky s orbou ustálí tvar polí, který je nyní příliš hranatý.“ Podrobnosti návrh Clauda.

**Změněno týž den (Martin, 19. 10. 2026 – [Rychlejší chůze](#rychlejší-chůze-martin--efekt-vylepšení)):**
„Pole, které zrovna neleží ladem: 0.5.“ a „nejkratší cesta je ta nejrychlejší“ – díl v osevu
stojí v síti pěšin i ve vzdálenosti chůze 2× louku (rychlost 0,5), strniště 1,25× (0,8); úhor,
příloh a zakládaný díl jako louka. Pole není zákaz: pěšina jde přes osev, když je obcházení delší.
Trasy přes pole se tak zase mění s osevem; pevná cesta, která přes pole už vede, jde dál rychlostí
cesty. Níž popsaný stav platil od rána do večera 19. 10. 2026.

- **Pěšiny přes pole:** osetý, zralý, zoraný i zakládaný díl stojí v síti pěšin jako úhor
  ([paths.md](paths.md) – Kudy), lidé jdou nejkratší cestou. Dřív stál osetý díl 12× a zoraný 3×
  louku – lidé ho obcházeli a osev se rok od roku měnil, takže trasa přes pole byla každý rok jiná
  a pevná cesta přes pole nevznikala (dva roky po sobě na stejném místě). Teď je trasa stálá
  a pevná cesta vznikne. Zarůstající příloh (křoviny, mladý les) je vegetace – zdržuje dál. Chůze
  pro práci (`walking.ts`) pole nepočítala ani dřív.
- **Vozy** přes osetý díl dál nejezdí ([wagons.md](wagons.md)).
- **Tvar polí:** pevné cesty pole rozčlení. Pod pevnou cestou obilí neroste a od 19. 10. 2026 cesta
  dílu ubírá plochu a odřízne malý růžek ([Cesta přes pole](#cesta-přes-pole)).
- **Vlkov** (kopie stavu z 3. 1. 765, dopočet do 2. 11. 776): pevná cesta od domů k brance nového
  hřbitova vznikne **1. 11. 766** – úsek 183 (dřív 70 m od vsi k severozápadu) se prodlouží na
  144 m až k brance (116 m přes pole). Bez připojení po souběžném kusu (Úseky a rozcestí) by
  vznikl jen kus 52 m u branky – trasa vedla kus souběžně s krátkým úsekem 236 a mezi úseky
  zůstala díra 12,5 m; samotné pravidlo pro pole tu nerozhodlo (trasa ke hřbitovu vedla v letech
  765–766 po strništi a po cestě 183). Ostatní cesty přes pole: úsek 59 se prodlouží ze 70 na
  91 m (89 m přes pole), krátký úsek 122 u vsi zaroste (jako dřív), zemská stezka 131 (234 m přes
  pole) a ostatní beze změny; do roku 776 už žádná další cesta nevznikne ani nezaroste.
- **Rozhodnuto** (Martin, 19. 10. 2026 – „Ano má.“): cesta dílu pod sebou plochu ubírá – [Cesta
  přes pole](#cesta-přes-pole).

## Průsek lesem

Martin (19. 10. 2026): „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“ Podrobnosti
návrh Clauda.

- **Pruh:** upravená cesta (vylepšení hráče i zemská stezka – [trade.md](trade.md)) vede lesem
  v průseku **3,5 m od osy** na každou stranu (`ROAD_SWATH`) – pás upravené cesty 3 m a 2 m
  z každé strany, ať se vůz i lidé vejdou a nejdou pod větvemi. Les = terén v lese a v lemu do
  6 m před ním (`PATH_WOODLAND`) a les vsi; na louce se nic nekácí. Stromy u cest a jabloně se
  nekácí nikde.
- **Co se vykácí:** stromy, mladé stromky, keře, souše a padlé kmeny v celém pruhu. V pásu cesty
  (1,5 m od osy) se vyklučí i pařezy a vyberou kameny (strom v pásu = práce stromu i pařezu),
  po stranách pařezy zůstanou. Práce podle tabulky překážek se připočte k ceně úseku (stezka
  i vylepšení; v popisku i počet stromů v průseku), klády za dospělé stromy jdou na hromadu.
  Kácí se, až práce na úsek dojde (`roadSwathDay`); stromy vyhrazené jinou stavbou zůstanou jí.
- **Pruh zůstane volný:** pařezy v průsecích (`VillageRoads.swath`) nedorostou ani z náletu, ani
  ze sazenice, dokud cesta stojí; nový les vsi (fields.md – Les vsi) do průseku nevstoupí (jeho
  stromy tam nevyrostou) a ve scéně ani zarůstání přílohu. Upravená cesta a stezka nezarůstají,
  takže průsek zůstane navždy.
- **Posvátné duby a háje** se nekácí: stezka se jim vyhne už trasou (průsek kolem buněk trasy),
  jinak by úsek nešel; u vylepšení hráče posvátný strom v pásu cesty úpravu nedovolí („Úpravě
  cesty brání posvátný dub“), po stranách zůstane stát.
- **Vyježděná cesta** (wagons.md) vlastní průsek nedostane: vyježděná cesta vzniká sama
  z jízd a nikdo ji nestaví – kácení je stavba s prací a kládami, kterou zadává hráč
  vylepšením; vozy lesem i dosud jezdí jen po pevné cestě. Kdo chce širokou cestu lesem, upraví ji.
- **Starší vsi:** hotové upravené cesty, hať a lávka a dostavěné úseky stezek dostanou průsek při
  načtení jednou (`withRoadSwaths`, `VillageRoads.swathChecked`) – bez práce a bez klád: byly
  postavené a zaplacené, když se průsek jen nekreslil (stromy se tehdy vykácely, klády už
  shnily).
- **Scéna:** stromy (i impostory uvnitř lesa) a keře zmizí podle id, po stranách pařezy, plocha
  korun nad pruhem zapadne (`swath-bands.ts` – po pásu, maska po políčkách je na 7 m moc
  hrubá), tráva pod stromy se přestane ztmavovat a stínová mapa se jednou překreslí. Na kraji
  průseku stojí les jako stěna. Ukázka na `/dev/landscape` – **Stezka lesem** (vyšlapaná, pak
  s průsekem).
- **Vlkov** (kopie stavu, stezka 2061 na jih – dnes úsek 131, 675 m): lesem vede jen 36 m (lem
  lesa), průsek by vykácel 3 stromy, 1 mladý stromek a 9 keřů – 14,5 čd práce a 3 klády. Hotová
  stezka ho dostane převodem bez klád.

## Cesta přes pole

Martin (19. 10. 2026) na otázku, jestli má cesta dílu ubírat plochu: „Ano má. Ono to stejně ve
výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout
takový růžek…“ Podrobnosti návrh Clauda.

- **Pás cesty se neorá:** díl přijde o plochu pod pásem pevné cesty v šířce obtisku (vyšlapaná
  1,9 m, vozová 2,6 m, upravená a hať 3 m – `ROAD_LAND`) a pod plácky rozcestí (poloměr 1,3 ×
  šířka nejširší cesty). Na přeťatém dílu 15 m vyšlapaná cesta vezme ≈ 30 m² z 225 m².
- **Růžek za cestou zůstane loukou:** kus pole, který cesty oddělí od zbytku (cestou a okrajem
  pole), se obdělává jen, když je aspoň **80 m²** (vejde se do něj obrat spřežení – kruh
  o poloměru ≈ 5 m) a má místo **širší než 3 m** (jinak je to jen proužek podél cesty). Jinak
  zůstane loukou – mez u cesty. Kus, který na pole navazuje dalšími čtverci (cesta přes roh
  čtverce uprostřed pole), je obyčejné pole. Bez spřežení platí totéž: ostrůvek za cestou menší
  než obrat nebo proužek u cesty se motykou nevyplatí – leží u cesty, šlape se po něm, stáda
  hnaná po cestě ho spasou; sedlák ho nechá jako mez. Pravidlo tak nezávisí na tom, jestli ves
  zrovna orá rádlem, a tvar pole se s cestami ustálí.
- **Kdy:** v den po každé změně pevných cest nebo čtverců polí (vznik a zarůstání 1. 11.,
  dokončené vylepšení, zemská stezka, nové či sloučené pole) – `roadFieldsDay` podle otisku cest
  a polí, jinak nic. Co cesta brala dřív, se nejdřív vrátí: cesta, která zaroste nebo se
  přesune, půdu vrátí. Výpočet po buňkách 0,5 m v mřížce pole (`roadLand`, `paths/road-land.ts`,
  přesná aritmetika – stejně na serveru i ve scéně).
- **Rozjetý rok:** zmenšený díl ubere plánu osevu (i orbě rádlem), seči a založení podíl jako pod
  stavbou (`giveWayToRoads` jako `giveWayToBuilding` – hotová práce zůstane, zasetá plodina na ubrané ploše se nesklidí);
  vrácená půda je obdělaná jako zbytek dílu. Díl, kterému zbude méně než 20 % políčka, z pole
  vypadne jako pod stavbou (kronika „Pole ustoupilo cestě“).
- **Starší vsi** dostanou plochu pod cestami při prvním dopočtu. **Kalibrace** (`--land real`)
  cesty má – 20 vsí na 20 let: žádný cíl nezměnil stav, rozdíly v desetinách (osev 1,52 → 1,53 ha
  na domácnost, bílkoviny 91,5 → 91,6 %).
- **Scéna:** pás cesty maskuje track-mask.ts (od teď i vozová cesta), oddělené kousky dílu nesou
  `SceneFieldPart.roadCut` (buňky z jádra) – obtisk, obilí ani koruna porostu tam nejsou
  (`road-cut-mask.ts`). Brázdy končí na pásu cesty, spřežení se na něm otočí a oddělený kousek
  neorá ([oxen.md](oxen.md) – Brázdy končí na cestě; `plough-roads.ts`).
  Ukázka na `/dev/landscape` – **Cesta**: zralé pole přes rozcestí a krátká cesta přes roh pole
  (růžek za ní zůstane loukou), **Cesta: přechod stupňů** (upravená půlka navazuje na vyšlapanou,
  vozová cesta).
- **Vlkov** (stav 19. 10. 2026): 1 022 m pevných cest, přes pole vedou na 39 čtvercích – pás vezme
  1 146 m² a 2 růžky za cestou (20 a 21 m²) zůstanou loukou; celkem 1 186 m², 0,29 % ze 40,3 ha.

## Fáze 1 – jak je postavená

Návrh Clauda (detaily, které návrh výš nechal otevřené – 18. 10. 2026):

- **Rok cest a roční součty práce:** rok cest běží od jedné roční kontroly k další (1. 11. – 31. 10.). Simulace každý den přičte rozdělení práce dne po místech (pole, staveniště, sady,
  hřbitovy, kácení stromů pro stavby; práce „ve vsi“ ne) a roční síť bere průměr na den. Součty
  jsou ve stavu vsi, takže nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Práh a „dva roky po sobě“:** roční síť se počítá stejnou funkcí jako pěšiny dne (voda, dřevo
  podle průměru roku, sousedé, práce, ohrady, stáda na pastvě – krávy, které v zimě stojí
  v ohradě, poměrně k měsícům pastvy). Úsek osy, kde je síla aspoň síla 3 cest za den (≈ 0,55), je
  letos nad prahem; pevná cesta vznikne z bodů, které leží do 6 m od loňského úseku nad prahem
  a nevedou po pevné cestě (do 5 m od její osy – tam jde trasa po cestě). Kratší úsek než 15 m
  cestou není. Osa se uloží na centimetry a zjednoduší (0,25 m).
- **Připojení a úseky:** kde nový úsek navazuje na pevnou cestu, připojí se k ní (do 10 m): blízko
  jejího konce (4 m) přímo do konce, jinak do nejbližšího bodu osy a pevná cesta se tam
  **rozdělí** na dva úseky (oba si nechají den vzniku, stupeň, provoz a místa na stromy podle
  polohy). Body osy se tím nemění – cesta se nehýbe. Rozcestí sdílí přesně stejný bod.
- **Provoz cesty (zarůstání):** medián provozu roční sítě (cest za den) v bodech osy po 3 m (vždy
  nejvyšší z buněk kolem bodu – trasa vede po cestě nebo těsně vedle); pamatuje se posledních
  5 let. ~~Když zaroste úsek mezi dvěma jinými, ty se nespojují (rozcestí zůstane).~~ Od 18. 10. 2026 se spojí – [Úseky a rozcestí](#úseky-a-rozcestí). Od 19. 10. 2026 rozhoduje o zarůstání provoz po kusech
  ≈ 25 m ([Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)); provoz celého úseku
  zůstává pro řazení souběžných cest a copánků.
- **Sleva za pevnou cestu** v síti dne i v roční síti: buňky pod osou cesty jako plná pěšina
  (poloviční cena) – pěšiny dne se k cestě stahují. Od 19. 10. 2026 bez ohledu na povrch pod
  cestou (Martin – [Cesta je cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Ve scéně se pěšina dne v pevné cestě ztrácí
  (do 1,4 m od osy se nekreslí, od 3,2 m plně), pevná cesta se kreslí z dat jako plně vyšlapaná
  pěšina, volný konec (brána, pole) se vytrácí.
- **Místa na stromy** (při vzniku úseku, ze seedu vsi a konců úseku): po 12–20 m střídavě vlevo
  a vpravo 2,5–4 m od osy, ne do 6 m od konců úseku, ne do 2,2 m od osy jiné cesty, aspoň 8 m od
  jiných míst a stromů, ne v lese a do 6 m od jeho okraje, ne ve vodě, v brodu ani na srázu, ne
  do 2,5 m od překážky krajiny (kmen, keř, kámen), ne na dílu pole, v sadu, na hřbitově, v háji
  ani na pozemku a v ohradě (ani 1,5 m kolem), ne do 16 m od obydlí, staveniště a zbytku jámy
  (i na jeho pozemku), ne u modly a svatyně (+ 3 m), milíře a posvátného dubu (6 m). Volné místo, přes které později povede nová cesta,
  zmizí; na místě pod pozdější stavbou se strom neuchytí.
- **Uchycení:** los z seedu vsi, roku a místa – nezávisí na ostatních místech. Druh: dub 50 %,
  jilm 28 %, topol 22 % (jako stromy podél pěšin). Délka života los v rozmezí druhu.
- **Strom jako překážka stavby:** keř je keř, strom do 20 let mladý stromek (bez klády), od 20 let
  dospělý strom (kláda na hromadu), pak souš a pařez – ceny podle tabulky překážek (fields.md).
  Stromy u cest mají id nad rozsahem vrstvy překážek; stavba je odstraní jako ostatní překážky
  (cena u kurzoru je stejná v prohlížeči i na serveru) – i obydlí na poli (strom na zakládaném
  dílu, který obydlí zabere, odklidí stavba obydlí s kládou). Strom odstraněný stavbou a pařez po
  20 letech od smrti zmizí ze stavu při roční kontrole.
- **Cesta přes pole:** když hráč postaví pole přes pevnou cestu, cesta zůstává (kreslí se dál
  a po ní se chodí) – zrušení cesty stavbou může přijít s fází 2. Do 19. 10. 2026 ale pod cestou
  platila cena dílu – přes osetý díl stála cesta 6× louku, lidé ji obcházeli kolem pole a cesta
  zarostla (Vlkov); od té doby se po ní chodí jako po cestě přes louku ([Cesta je
  cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)).
- **Stromy na poli** (Martin, 18. 10. 2026 – [fields.md](fields.md), Pole jako krajina; podrobnosti
  návrh Clauda): místa na stromy smí i na čtverce polí – leží 2,5–4 m od osy, na mezi podél cesty,
  kam se neorá. Strom, který se na poli uchytí, vezme dílu 20 m² (úroda a práce úměrně, kronika
  „Pole ustoupilo stromům u cesty“). Cesty, které vznikly dřív, mají místa určená bez polí – místa
  se neurčují znovu, nové stromy na polích přibudou u nových cest.
- **Kronika:** „Kudy se chodí léta, vyšlapala se pevná cesta.“ a „Nepoužívaná cesta zarostla.“
- **Rychlost:** roční kontrola ≈ 6–8 ms (Node, ves 27 lidí, 6 úseků), přeskok 10 let
  s krajinou ≈ 0,55 s (bez krajiny 0,15 s – rozdíl jsou pěšiny dne i pevné cesty). Stav pevných
  cest ≈ 3 kB.

## Fáze 2 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Mokřina** = suchá rovina (sklon nejvýš 0,04) do 3 buněk terénu pěšin (≈ 11 m) od vody –
  podmáčený břeh a niva potoka. **Brod** = mělký úzký úsek potoka (průchozí voda – paths.md).
  Kde úsek vede mokřinou a přes brody, se určí z krajiny při vzniku úseku (starší úseky si to
  doplní při roční kontrole); rozdělení úseku rozdělí i mokřinu a brody.
- **Výběr:** kliknutí do 2,5 m od osy vybere úsek (po obydlí, posvátných místech, pozemku
  a ohradě, před polem); zvýrazní se čarami po obou stranách pásu. Panel: portrét stupně, délka,
  stáří, stromy u úseku, mokřina a brody, průběh rozestavěného vylepšení a tlačítka vylepšení
  (ikony, v popisku název, práce a dřevo; zašedlé s důvodem červeně – „Nejdřív je potřeba cestu
  upravit.“, „Cesta se už vylepšuje.“, „Na hať a lávku chybí dřevo.“).
- **Ceny** podle tabulky výš: upravená cesta 15 čd na 100 m délky úseku (bez přirážky za
  vzdálenost – pracuje se na cestě), hať 1 strom a 2 čd na 2 m mokřiny (stromy nahoru na celé),
  lávka 4 stromy a 15 čd na brod; dřevo jako obydlí – celé klády z hromady, zbytek nejbližší
  dospělé stromy k polovině úseku (kácení v ceně). Hať a lávka se nabízí, jen když úsek vede
  mokřinou nebo přes brod, a jde až po upravené cestě.
- **Vylepšení je stavba** ze společné práce (lidé pracují podél úseku u čela práce); úsek během
  stavby nezaroste; když se rozdělí, stavba platí pro oba kusy. Po dokončení dostane úsek nový
  stupeň a kronika „Cesta je vylepšená – chodí se po ní rychleji.“
- **Chůze** (walking.ts – jediné místo výpočtu, rychlosti z walk-speed.ts): po pevné cestě podle
  stupně (vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes mokřinu), mokřinou
  0,5×, brod + 30 m (po lávce nic); mokřina, brod a pole (v osevu 0,5×, strniště 0,8× –
  `withFieldWalk`) platí i pro chůzi rovně mimo cestu a po pěšinách dne (přes osev pěšina
  nezrychlí). Okno terénu pro chůzi je
  pevné – 1,4 × 1,4 km kolem místa vsi (stejné na serveru i v prohlížeči).
- **Vzdálenost práce chůzí:** díly pole a čtverce sadu z nejbližšího obydlí po pěšinách
  a pevných cestách, palivo z obydlí k nejbližšímu okraji lesa, kácení dřeva staveb od stavby ke
  stromu po pevných cestách (bez pěšin dne – cena u kurzoru tak sedí se serverem). Přepočítá se
  se změnou rozložení vsi – pevné cesty a jejich stupeň jsou v klíči, takže hned po vylepšení
  a po roční kontrole. Bez krajiny (kalibrace) vzdušnou čarou jako dřív.
- **Příklad:** pole 400 m od vsi, kam se jde 300 m po cestě přes 20 m mokřiny a brod a 100 m
  rovně: bez cesty 450 m chůze (+35 % práce), vyšlapaná cesta ≈ 403 m (+30 %), upravená ≈ 357 m
  (+26 %), s hatí a lávkou 300 m (+20 %).
- **Scéna:** upravená cesta je jen širší vyšlapaná cesta (Martin, 19. 10. 2026: „upravená cesta
  ať je prostě jenom širší – ta odvodňovací strouha vypadá divně, zrušíme ji“) – tytéž obtisky
  (prošlapaná tráva a holá hlína na 55 % šířky), pás **3 m** místo 1,9 m (návrh Clauda – vozová
  cesta, o 60 % širší, z herní kamery jasně širší); strouha i kameny do bláta a brodu jsou
  zrušené. Hať jsou kmeny napříč na celou šířku upravené cesty (model 2,6 m zvětšený na 3 m,
  po 0,28 m), lávka 5,2 m ze tří kmenů na prazích a kůlech se zábradlím (modely
  `tools/blender/roads.py`). Rozestavěné vylepšení: vytyčení kolíky a provázkem od zadání
  (Martin) po okrajích širší cesty (1,7 m od osy), úprava – širší pás – roste od začátku úseku,
  kmeny hatě se kladou po mokřině podle průběhu, lávka nejdřív kůly a prahy (od 25 %), celá od
  90 %. Ikony `cesta`, `cesta-upravena` (širší pás), `hat`.

## Fáze 3 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Místa** (`roadAppleSpots`): po 10 m podél úseku střídavě po stranách, 2,6–3,4 m od osy (bez
  6 m na koncích úseku). Jabloň nestojí v lese, ve vodě ani v brodu, na stavbě vsi (obydlí,
  sad, hřbitov, ohrada – jako stromy u cest), do 2,2 m od osy jiné pevné cesty, do 2,5 m od
  překážky krajiny (kmen, keř, kámen), do 6 m od stromu u cesty a do 8 m od jiné jabloně – proto
  „Vysadit jabloně“ po letech doplní jen mezery a nesází naproti stojící jabloni. Místa jsou
  deterministická (seed vsi a úseku). **Na poli smí** (Martin, 18. 10. 2026 – Pole jako krajina):
  každá jabloň na dílu pole mu vezme 20 m² hned se zadáním výsadby, v popisku tlačítka oranžově
  „Pole se zmenší“ / „Pole zanikne“. Ve Vlkově (≈ 40 ha polí) má po změně místo 11 z 25 cest
  (26 jabloní, dřív 1 cesta a 3 jabloně); ze 14 cest delších než 20 m 10 – zbylé vedou lesem,
  kratší úseky (do ≈ 15 m) místo nemají kvůli 6 m od konců a rozestupu 10 m.
- **Výsadba je stavba** `road-apples` ze společné práce: 0,44 čd na jabloň (80 čd/ha při
  180 stromech/ha), bez přirážky za vzdálenost (jako výsadba sadu); pracuje se jen v oknech
  výsadby (září–listopad, březen–duben), mimo ně stavba čeká (v panelu ikona „Sází se na jaře
  a na podzim“). Jabloně se sázejí po řadě podél úseku – každá, na kterou práce došla, dostane den
  výsadby. Úsek ve výsadbě nezaroste. Kronika „Jabloně podél cesty jsou vysazené.“
- **Úroda a práce** jako sad na strom (1/180 ha): plody od 6. roku, plná úroda ≈ 16,7 kg od 25.
  roku, péče v zimě a sklizeň v září–říjnu jdou se sady (`orchardWork`), jablka do zásoby ovoce
  (`applesKg`). Přirážka za vzdálenost u péče a sklizně podle vzdušné vzdálenosti jabloně od
  nejbližšího obydlí při výsadbě (jabloň stojí u cesty – chůze by se lišila málo).
- **Život:** strom do 60 let, pak souš 10 let a místo je volné. Jako překážka je jabloň do 20 let
  mladý strom (kácení bez klády), pak strom (kláda), souš jako souš; stavba přes jabloň ji
  odstraní. U jabloně se strom u cesty neuchytí (do 6 m). Cesta s živými jabloněmi (i když se
  teprve sázejí) nezaroste (od 19. 10. 2026 – [Cesta je
  cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)); až všechny dožijí, zarůst může. Jabloně
  u cesty, která zarostla dřív (Vlkov – úsek 24), stojí dál jako stromy u zarostlé cesty; při
  rozdělení úseku patří bližší části.
- **Panel cesty:** počet jabloní (v závorce plodící, když nejsou všechny), průběh výsadby
  a tlačítko „Vysadit jabloně“ (ikona `jablone`, v popisku práce a počet jabloní; zašedlé
  s důvodem – „Jabloně se tu už sázejí.“, „Podél cesty není volné místo.“). Server výsadbu
  ověří znovu (use-case `plantApplesAlongRoad`).
- **Scéna:** jabloně ze sadu (`apple-1…4`, s jablky `apple-fruit-1…4`) s velikostí podle stáří
  jako v sadu (sazenice 30 %, plná za 12 let, první 3 roky u kůlu), jablka od srpna do sklizně,
  roční období jako sad (květ, podzimní listí, holé koruny – meshe `pathside-apple-*`); souš jako
  u stromů u cest. Místa, která čekají na výsadbu, jsou od zadání vytyčená kolíkem a provázkem
  po straně cesty (Martin – u všech staveb). Lidé česají a ošetřují jabloně úseku a sázejí u míst,
  která čekají.
- **Příklad:** úsek 200 m s volnými místy po celé délce dá ≈ 19 jabloní – výsadba ≈ 8,4 čd (na
  jaře nebo na podzim), od 25. roku ≈ 317 kg jablek ročně (výživou ≈ 45 kg obilí), sklizeň
  ≈ 0,8 čd a péče ≈ 1,1 čd za zimu (do 100 m od obydlí bez přirážky).

## Úseky a rozcestí

Martin (18. 10. 2026, ves Vlkov): „úsek mezi dvěma rozcestími je v pohodě, ale ve hře jsou
evidentně falešná rozcestí“ a „rozcestí by mělo být nejvyšlapanější plochou, teď vlastně chybí“.
Ve Vlkově bylo z 23 úseků 13 uzlů, kde se potkávají jen dva úseky – zbytky po rozdělení cesty,
když odbočka zarostla, a cesty navázané na konec jiné v různých letech.

- **Spojení úseků** (`mergeRoadChains`, návrh Clauda): kde končí právě dva úseky (uzel bez
  odbočky), spojí se do jednoho – osa za sebou (směr staršího úseku zůstane), místa na stromy,
  jabloně, mokřina a brody na ose, provoz posledních let (vážený délkou), den vzniku a id
  staršího úseku. Stromy u cesty se nemění. Stavby na úsecích – výsadba jabloní a vylepšení, které
  platí pro oba úseky – přejdou na spojený úsek.
- **Zůstanou rozdělené:** úseky různého stupně (vyšlapaná a upravená – skutečná hranice
  vylepšení) a úseky, z nichž se vylepšuje jen jeden (nebo každý jinou stavbou) – po dokončení
  vylepšení se spojí, mají-li stejný stupeň. Uzavřený okruh z jednoho úseku zůstane.
- **Kdy:** v roční kontrole po zarůstání a vzniku nových cest (zarostlá odbočka uzel uvolní),
  po dokončení vylepšení a jednou při načtení starší vsi (`withMergedRoads` – bez falešného
  rozcestí vrátí týž stav). Simulace pak falešná rozcestí sama nevytváří, takže výsledek
  nezávisí na kouscích dopočtu.
- **Vlkov po převodu:** z 23 úseků zbude 11 – jediný uzel se dvěma úseky je hranice upravené
  a vyšlapané cesty, skutečná rozcestí 2 (tři a čtyři úseky), zbytek jsou konce.
- **Rozcestí ve scéně** (návrh Clauda): kde končí aspoň tři úseky, je plácek udusané hlíny – kruh
  o poloměru 1,3× šířky přicházející cesty s nepravidelným okrajem, plné síly; vbíhá-li do něj upravená
  cesta, je v jejím širším pásu (`roadJunctions` v `road-works-layout.ts`). Totéž rozcestí pěšin
  dne ([paths.md](paths.md)).
- **Díry mezi úseky** (Martin, 18. 10. 2026: pevná cesta má uprostřed mezeru – dva úseky na
  sebe navazují, ale konce se nepotkají; návrh Clauda): volný konec úseku, ve kterém nekončí jiný
  úsek a který není **skutečným koncem trasy** (do 6 m od něj nekončí čára roční sítě – brána
  domu, cíl: pole, voda, les), se napojí k jinému úseku do 12 m – do jeho konce (blíž než 4 m),
  jinak do nejbližšího bodu osy, kde se ten úsek rozdělí (rozcestí). Uzel je pak společný,
  falešné rozcestí se spojí. Díry vznikaly, kde provoz na pár metrů klesl pod práh, a cesta se
  tam rozpadla na dva úseky. Kdy: v roční kontrole a jednou při načtení starší vsi
  (`withJoinedRoads`, příznak `VillageRoads.endsChecked` – převod počítá roční síť jednou,
  ≈ 0,4 s).
- **Vlkov po zacelení:** z 10 úseků zbude 8 – díra 5,3 m v polích (úseky 43 a 85) a 11,6 m
  u vsi (upravená cesta 4 končila kus před branou domu, odkud vede upravená cesta 5) se zacelí
  a úseky se spojí. Volné konce zbudou 4 – brány tří domů a cíl v polích. Konce u vsi
  vzdálené 7–23 m od jiných úseků jsou brány domů (do 6 m od konce trasy) – zůstanou.
- **Souběžné cesty** (Martin, 18. 10. 2026, Vlkov: dvě cesty 5–19 m od sebe jako copánek,
  „Takovéto cesty by vůbec neměly existovat.“; návrh Clauda): nová pevná cesta nevznikne tam,
  kde vede do 12 m od jiné pevné cesty stejným směrem (odchylka do ≈ 37°) – provoz patří té.
  Existující souběžné cesty se v roční kontrole (a jednou při načtení starší vsi –
  `VillageRoads.parallelsChecked`) sloučí: z mladší / slabší cesty (nižší stupeň, mladší, méně
  provozu) se vyřízne kus, který vede souběžně aspoň 25 m; zbytky kratší než 15 m zmizí, delší
  se napojí ke silnější cestě. **Copánek** – dva úseky mezi stejnými uzly, které se nikde
  nevzdálí víc než 25 m: zmizí oklika (delší o víc než 5 %, jinak slabší). Stromy u odstraněné
  cesty stojí dál jako u zarostlé (do 5 m od silnější cesty patří k ní), jabloně patří silnější.
  Dva úseky mezi stejnými uzly se nespojí do okruhu a při spojování úseků má přednost
  nejrovnější pokračování. Vlkov: 40 a 83 (copánek mezi stejnými rozcestími, 5–19 m od sebe)
  se sloučí – po převodu zbude 5 úseků, cesta od vsi k polím je jedna. **Připojení po souběžném
  kusu** (návrh Clauda, 19. 10. 2026): nová cesta, jejíž trasa vedla kus souběžně s jinou (do
  12 m), začíná až za ním – její konec se k té cestě připojí do 14 m (12 m a krok vzorkování
  2 m; dřív jen do 10 m a mezi úseky zůstala díra 12–14 m, kterou zacelování děr do 12 m
  nespojilo – Vlkov 766, cesta ke hřbitovu).
- **Volné konce ve scéně:** úsek nese `Road.openEnds` (určí roční kontrola) – pás cesty se
  vytrácí jen na skutečném volném konci (brána, cíl), ne kde navazuje jiný úsek nebo kde trasa
  pokračuje pěšinou dne. Pěšina dne se za koncem úseku neskrývá (`roadFade`) – navazuje na cestu
  bez mezery. Ukázka na `/dev/landscape` (Cesta → **Díra: zacelená / otevřená**).

## Cesta pro hráče

Martin (19. 10. 2026, Vlkov – upravená cesta 103 navazuje na vyšlapanou 183): „tohle by rozhodně
neměly být dvě cesty, ale měly by se spojit do jedné“ a „cesty by se na sebe měly napojovat“.

- **Cesta hráče** (návrh Clauda) = řetěz úseků mezi skutečnými rozcestími (uzel aspoň tří konců)
  a volnými konci – **bez ohledu na druh cesty** (stupeň i vyježděnou – `roadChain` v
  `paths/road-chains.ts`, stejně na serveru i v prohlížeči). Data zůstávají po úsecích (stupeň,
  mokřina, brody, vozová, provoz, zarůstání) – hranice stupňů je skutečná a chůze, zarůstání
  i scéna ji potřebují; stejný stupeň se dál spojuje do jednoho úseku (`mergeRoadChains`).
- **Výběr:** klik na kterýkoli úsek vybere celou cestu (id cesty = první úsek řetězu – stejné, ať
  se klikne kamkoli), zvýrazní se celá. **Panel:** délka celé cesty, u cesty z víc druhů délka po
  druzích (ikony druhů – vyšlapaná, vyježděná, upravená, hať; `VillageRoad.kinds`), stáří
  nejstaršího úseku, stromy, jabloně, mokřina a brody celé cesty; portrét podle převládajícího
  druhu (nejdelší – `VillageRoad.roadKind`).
- **Vylepšení celé cesty:** úprava vylepší všechny vyšlapané úseky cesty, hať a lávka všechny
  úseky přes mokřinu či brod, které ji nemají (až jsou upravené) – jedna stavba, cena za úseky
  dohromady, dřevo k polovině cesty. Stavba jde po cestě úsek po úseku (čelo práce, postavy
  i rozestavěný pás ve scéně – úsek ležící v cestě obráceně se upravuje od konce své osy), stupeň
  dostanou úseky po dokončení – stejné stupně se pak spojí. Výsadba jabloní vylepšení nebrání.
- **Jabloně podél celé cesty:** místa po úsecích za sebou (rozestup i přes navázání), jedna
  stavba, sází se po řadě podél cesty; každá jabloň patří ke svému úseku.
- **Server actions** dál dostávají `roadId` – kterýkoli úsek cesty, jádro si řetěz dopočítá.
- **Přechod ve scéně bez schodu:** kde na sebe navazují pásy různé šířky (upravená a vyšlapaná,
  vozová a pěší, rozestavěná úprava), širší pás se na 6 m plynule zúží k užšímu; koleje vozové
  cesty se tam vytratí. Na rozcestí se nezužuje – je tam plácek.
- **Vlkov:** 8 úseků = 6 cest hráče – 103 (upravená) + 183 (vyšlapaná) a 59 + 131 jsou každá
  jedna cesta; úprava se z obou úseků nabízí stejně (jen vyšlapaný úsek, 21,6 čd).

## Na stavitelích

- Výpočet sítě je v herním jádru (`domain/village/paths/`), volá ho simulace (roční síť) i scéna
  (pěšiny dne) – herní logika jednou. Pevné cesty: `paths/roads.ts`, stromy `road-trees.ts`.
- Stav vsi má pevné cesty, jejich stromy a roční součty práce po místech; staré vsi začnou bez
  pevných cest (vzniknou do dvou let). Jabloně jsou v `VillageRoads.apples` (chybí = žádné).
- Pořadí implementace: (1) pevné cesty a stromy – **hotovo**, (2) výběr, vylepšení a chůze –
  **hotovo**, (3) jabloně – **hotovo**.
