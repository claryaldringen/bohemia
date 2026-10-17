# Obyvatelstvo a obydlí vesnice

Stav: schváleno 17. 10. 2026 (Martin: „asi ok, doladíme později“), týž den upraveno umístění
obydlí a společná pole (Martin) a odemčení nového obydlí – hráč staví, kdy chce (Martin). Týž den
oprava čísel podle rešerše (Martin – úmrtnost dospělých, porody od 16 let, životnost zemnice;
[rešerše](research/2026-10-17-zemedelstvi-populace.md)).
Implementace jádra: `packages/game/src/domain/village/`.

## Proč

Hráč začíná jednou slovanskou vesnicí a její hlavní bohatství jsou lidé – přesněji jejich
práce. Jedna domácnost si základní potřeby (jídlo, látky, keramiku, jednoduché železné předměty)
obstará sama, ale na společné projekty vsi (např. opevnění) jí skoro nezbývá čas. Hra je tedy
o tom, aby ves rostla a výroba jídla byla co nejefektivnější – aby postupně ve vsi mohli být
i lidé, kteří se jídlem nezabývají vůbec nebo jen menší část času (Martin).

Tento dokument popisuje, jak ves roste: domácnosti, obydlí, porody a úmrtí, stavbu nových
obydlí hráčem a jejich chátrání a přestavby obyvateli.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč založí ves jednou zemnicí se čtyřmi lidmi a sleduje, jak se rodina rozrůstá;
  kdy postaví další obydlí, rozhodne sám – jakmile je domácnost plná, do nového obydlí se
  přestěhuje mladý pár a ves se rozroste o novou domácnost.
- **Cíl:** po návratu do hry (i po týdnu, tedy skoro po generaci) hráč pochopí, co se ve vsi
  mezitím stalo – kronika porodů, úmrtí, přestaveb.
- **Cíl:** práce (člověkodny) je společná měna vsi – stavby a opravy ji spotřebují a zbytek
  půjde později do veřejných projektů.
- **Ne-cíl (teď):** jiné stavby než obydlí, výroba jídla a pole (vlastní dokument, viz
  Navazuje), těžba dřeva, voda, jednotliví lidé se jmény, sňatky mezi vesnicemi, rod hráče,
  více vesnic. **Příchozí z okolí zatím ne** – narušilo by to budoucí mechaniky (Martin).
- **Anti-cíl:** ves, která se bez hráče rozpadne nebo vymře jen proto, že hráč pár dní nebyl
  online. Nestavění zpomalí růst, ale neruinuje ves.
- **Anti-cíl:** čísla typu „4,37 člověka“ – lidé jsou celí.

## Pojmy

- **Ves** – jedno sídlo hráče; drží společné zásoby (zatím práci, později jídlo, vodu, dřevo).
- **Obyvatel** – jednotlivec s datem narození (bez jména a pohlaví – návrh Clauda). Věkové
  skupiny: **dítě** 0–13 let, **dospělý** 14–44 (děti může mít až od 16 let), **starší** 45+.
- **Domácnost** – lidé jednoho obydlí. Každé obydlí je právě jedna domácnost.
- **Obydlí** – zatím dva typy:

  | Typ         | Míst | Nová stavba    | Typická životnost |
  | ----------- | ---- | -------------- | ----------------- |
  | zemnice     | 6    | 60 člověkodní  | ≈ 18 let          |
  | polozemnice | 8    | 220 člověkodní | ≈ 20–25 let       |

  Životnost zemnice je oprava podle rešerše (dřív ≈ 15 let): pravěké dřevěné stavby vydržely
  běžně 20–30 let bez ohledu na založení (Fries-Knoblach 2007), rekonstrukce zahloubeného domu
  stála 13 let bez oprav a vydržela by déle (Waldhauser 2008).

  Polozemnice je sušší a teplejší – dětem v ní je lépe (nižší dětská úmrtnost). Pro čerstvě
  plnou domácnost trvá zemnice zhruba jedno roční období, polozemnice celý herní rok – hráč volí
  mezi rychlou úlevou pro rodinu v těsnu a lepším domem, na který se čeká (návrh Clauda). Čísla
  jsou výchozí a doladí se měřením (viz Kalibrace).

- **Plná domácnost** – žije v ní tolik lidí, kolik má obydlí míst. **Přeplněná** – víc.
- **Člověkoden** – práce jednoho dospělého za herní den.

## Pravidla

### Založení vsi

- Hráč v krajině svého sídla umístí půdorys první zemnice (viz Umístění obydlí) – tím ves
  založí. Zemnice tam hned stojí (osadníci přišli) a bydlí v ní **4 lidé**: dva dospělí (kolem
  25 let) a dva dospívající (12 a 13 let – návrh Clauda, aby první nová domácnost mohla
  vzniknout do pár let; zůstávají i s porody od 16 let – Martin). Ves dostane navržené
  staročeské jméno, které hráč může kdykoli změnit.
- **První pole není podmínkou založení** (Martin, 17. 10. 2026: „Hráč sám rozhodne kdy a co bude
  stavět, jako v každé RTS.“) – pole jsou samostatná a společná pro celou ves a hráč je zakládá,
  kdy chce ([fields.md](fields.md)). Ves bez pole žije ze zásob na 18 měsíců a pak hladoví;
  hájení ji v prvních 30 letech chrání (dospělí neumírají ani hladem).

### Umístění obydlí

- Hráč vidí **půdorys** obydlí a umístí ho volně, kamkoli, kde je **země dost rovná** (Martin) –
  ne po políčkách. Výchozí: rozdíl výšky terénu pod půdorysem nejvýš 0,5 m; zemnice má půdorys
  zhruba 4 × 4 m, polozemnice 5 × 5 m (návrh Clauda).
- Obydlí nesmí stát ve vodě ani se překrývat s jiným obydlím nebo polem (návrh Clauda).
- **Překážky** na místě, např. kameny, osadníci odstraní, ale stavba stojí víc člověkodní
  (Martin). Totéž **v lese** – stromy je třeba skácet a vykopat pařezy. Ceny překážek a mýcení
  jsou jedna tabulka pro celou hru ve [fields.md](fields.md) (návrh Clauda). Hráč cenu vidí už
  při umisťování.
- Odstraněné kameny a stromy z krajiny sídla zmizí natrvalo – krajina sídla je vygenerovaná
  krajina plus změny, které v ní udělali lidé (návrh Clauda).

### Práce

- Pracovní síla za den: dospělý 1 člověkoden, starší 0,5, dítě 7–13 let 0,3, mladší 0
  (návrh Clauda).
- Pole jsou společná, a proto se práce počítá **za celou ves** – dospělí všech domácností
  pracují pro ves. Pořadí (denní minimum domácností, polní práce, opravy obydlí, domácí výroba,
  zbytek **společná práce vsi**) popisuje [fields.md](fields.md).
- Společná práce se nedá schovat na později – každý den jde do rozestavěných staveb (stavby
  hráče i přestavby obyvatel, rovným dílem), a když žádná není, propadne.

### Růst populace

- **Porody:** každý pár (dva lidé **16–44 let** v jedné domácnosti) má zhruba jedno dítě za
  3 roky (intervaly mezi porody 24–39 měsíců – Macfarlane 2002). Porody od 16 let jsou oprava
  podle rešerše (dřív od 14 – plodnost od 14 je optimistická); pro práci, odemčení nového obydlí
  a rozpad domácnosti je dospělý dál od 14. Hlad porody tlumí až zastaví, přeplněnost je
  výrazně sníží.
- **Úmrtí:** zhruba 40 % dětí se nedožije 14 let (v polozemnici méně než v zemnici; Lahovice:
  41 % do 20 let – Zazvonilová a kol. 2020); dospělí umírají asi **2 % ročně** (oprava podle
  rešerše, dřív 1,5 % – v Lahovicích umírali muži v průměru ve 43–47 a ženy ve 39–43 letech),
  starší víc (kolem 8 % ročně). Hlad a přeplněnost úmrtnost zvýší.
- **Přeplněnost** sama nastaví strop: populace domácnosti se ustálí kolem kapacity obydlí
  (+1–2), takže ves bez nových staveb přestane růst, ale nevymře.
- **Hygiena** (bez ukazatele) zvyšuje úmrtnost, když ves nemá pohřebiště, je plné nebo leží moc
  blízko obydlí či vody – [cemetery.md](cemetery.md) (Martin).
- **Jídlo** vstupuje jako **nasycení vsi** 0–1 – počítá ho [fields.md](fields.md). Hlad ves
  zmenší na tolik lidí, kolik pole uživí, ale nezničí ji (návrh Clauda).
- Porody a úmrtí jsou **jednotlivé náhodné události**, ale opakovatelné: náhoda se odvozuje
  ze seedu světa, vsi a herního data. Stejný stav ve stejný den dá vždy stejný výsledek.
- Lidé stárnou podle data narození; s věkem přecházejí mezi skupinami.
- **Hájení:** prvních 30 herních let od založení vsi jí přeje štěstí (Martin) – dospělí
  neumírají (ani hladem) a dětí umírá polovina oproti běžné úmrtnosti (podoba štěstí je návrh Clauda, doladí
  se kalibrací). Malá ves tak nevymře hned na začátku a všichni hráči mají srovnatelný start.
- **Rozpad domácnosti** (návrh Clauda): domácnost bez dospělého 14–44 let (jen děti nebo
  starší) a osamělý dospělý bez dětí se přestěhují do domácnosti s nejvíc volnými místy (smí
  ji i přeplnit) – jinak by domácnost, kde zbyl jeden dospělý, už nikdy neměla děti. Kronika
  to zapíše.
  Opuštěné obydlí se neopravuje a chátrá; při stavu 0 zanikne a políčko se uvolní.

### Nové obydlí (rozhoduje hráč)

- O každé nové stavbě rozhoduje hráč (Martin) – vybere typ a místo (viz Umístění obydlí).
- **Hráč staví kdy chce** (Martin, 17. 10. 2026: „Hráč sám rozhodne kdy a co bude stavět, jako
  v každé RTS.“) – dřívější odemčení stavby plnou domácností se čtyřmi dospělými padlo. Zemnici
  i polozemnici smí hráč začít kdykoli a kolik chce; rozestavěné stavby se dělí o společnou
  práci vsi rovným dílem, takže víc staveb najednou roste pomaleji.
- **Odemčení surovinami** (Martin, 17. 10. 2026: „Odemykání bude samozřejmě také – pokud nebudu
  mít suroviny na postavení stavby, bude její tlačítko v panelu disabled.“): stavba může mít
  kromě práce i **cenu předem** v surovinách ze zásob vsi; když je ves nemá, tlačítko stavby je
  zašedlé a v popisku je chybějící část červeně (jako v 0 A.D.). Dnes žádná stavba nic předem
  nestojí (práce se platí postupně) – mechanismus je připravený pro dřevo a kámen
  (`packages/game/src/domain/village/costs.ts`).
- **Cena:** člověkodny ze společné práce vsi (dřevo viz Zjednodušení). Stavba roste den po dni
  podle toho, kolik společné práce přitéká; hráč vidí postup.
- **Po dokončení** se do nového obydlí přestěhují **dva nejmladší dospělí** z domácnosti, která
  je plná a má aspoň **4 dospělé** 14–44 let (z více takových z nejvíc přeplněné), a založí
  novou domácnost. Děti zůstávají (návrh Clauda). Starší se do čtyř dospělých nepočítají –
  kdyby odešli dva dospělí a zůstali jen starší s dětmi, domácnost by se rozpadla
  a přestěhovala za nimi. Když podmínku v tu chvíli nesplňuje žádná domácnost, obydlí zůstane
  **prázdné** – postavené „do zásoby“.
- **Prázdné obydlí** obsadí sama první domácnost, která podmínku splní – dva nejmladší dospělí
  se do něj přestěhují (návrh Clauda). Dokud čeká, neopravuje se a chátrá, ale potřeba oprav
  roste s věkem: nová zemnice vydrží prázdná ≈ 16 let (s životností 15 let ≈ 14), polozemnice
  ≈ 26 let.
- Hráč dostane upozornění, když je domácnost plná a žádné nové obydlí pro ni nečeká.
- Když hráč nestaví, přeplněná domácnost žije v těsnu – méně porodů, víc úmrtí, ves přestane
  růst (Martin potvrdil).

### Chátrání a přestavba (rozhodují obyvatelé)

- Každé obydlí má **stav** 0–100 % a stárne. Potřeba oprav (člověkodny za rok) roste s věkem
  – zpočátku malá, ke konci životnosti velká (Martin): roční potřeba na konci životnosti
  × (věk / životnost)². S delší životností zemnice (18 let místo 15) se křivka sama roztáhla:
  na konci života dál 15 člověkodní ročně, za celý život 90 místo 75 a prázdná zemnice
  chátrá ≈ 16 let místo ≈ 14.
- Opravy jdou z práce vsi hned po polních pracích ([fields.md](fields.md)), takže stárnoucí
  domy ubírají společnou práci vsi. Když na opravy práce nestačí, stav klesá rychleji.
- Ke konci životnosti stojí opravy obydlí zhruba polovinu toho, co jeho domácnost přidá do
  společné práce vsi (návrh Clauda) –
  stárnoucí domy citelně ubírají vsi práci.
- **Přestavba:** když se opravy přestanou vyplácet (typicky kolem konce životnosti) nebo stav
  klesne na 0, obyvatelé se **sami** rozhodnou dům zbourat a na stejném místě postavit nový
  (Martin). Hráč o tom nerozhoduje.
- Obyvatelé staví **vždy lepší** obydlí než dosud (zemnice → polozemnice), pokud na to ves má
  suroviny – jinak stejné (Martin). „Má na to“: společná práce vsi stačí, aby stavba skončila do
  jednoho roku (návrh Clauda). Typ úplně nové stavby vybírá hráč.
- Během přestavby domácnost bydlí dál (stavba se abstrahuje, starý dům zmizí až s dokončením
  nového – návrh Clauda).

### Kronika

- Ves vede kroniku událostí s herním datem: narození, úmrtí (dítě / dospělý / starší),
  založení domácnosti, dokončení stavby, rozhodnutí obyvatel o přestavbě. Po návratu ji hráč
  uvidí jako první.
- Kronika drží **posledních 500 událostí**, starší se zahazují (návrh Clauda – stav vsi za
  1000 let jinak roste bez konce; simulace kroniku nečte, takže na průběh vsi to nemá vliv).

## Zjednodušení do dalších mechanik

- **Dřevo:** dokud nebude navržená těžba (les, kácení), dřevo se neeviduje – kácení a dovoz
  jsou zahrnuté v ceně stavby v člověkodnech (návrh Clauda; Martin chtěl dřevo ze společných
  zásob, přijde s mechanikou lesa).
- **Jídlo a práce na obživu** řeší [fields.md](fields.md) (nasycení ze zásob obilí, práce za
  celou ves).
- **Voda:** zatím bez vlivu.

## Kalibrace

Čísla výše jsou výchozí. Jako u generátoru krajiny vznikne měřicí skript, který nasimuluje
stovky vsí a ověří cíle:

- první plná domácnost (do 17. 10. 2026 „první možnost stavět“, dnes hráč staví kdykoli)
  přijde u 90 % vsí do **≈ 8 herních let** (≈ 3 skutečné dny) – Martin:
  „zkusíme to“; hrubá simulace s hájením: medián 3 roky, 90 % do 7, 99 % do 20,
- čerstvě plná domácnost postaví zemnici zhruba za roční období, polozemnici za herní rok,
- zemnice se přestavuje typicky po ≈ 18 letech (do opravy podle rešerše ≈ 15), polozemnice po
  ≈ 20–25; ke konci životnosti stojí opravy zhruba polovinu toho, co domácnost přidá do
  společné práce,
- ves, kde hráč staví, kdykoli může, vymře do roku 1500 jen výjimečně (hrubá simulace: 0,6 %);
  za pár dní nepřítomnosti se nic takového nestane (anti-cíl). Jak často vymře jediná
  domácnost bez nových staveb, je jen informace, ne cíl (hrubá simulace ≈ 90 % do 1000 let,
  měření níže).

**Naměřeno** (`packages/game/scripts/measure-village.ts 200 60`, 17. 10. 2026 po opravě podle
rešerše – úmrtnost 2 %, porody od 16 let, zemnice 18 let a opravy polí z [fields.md](fields.md);
v závorce měření před opravou; vymření 30 vsí × 1000 let je ještě ze starších měření):

- první možnost stavět: medián 4,6 roku (3,9), 90 % vsí do 8,9 roku (7,8), 99 % do 38 let
  (38) – **MIMO** (cíl ≈ 8 let): dospívající ze startu mají děti až od 16 let (dřív tvořili pár
  už ve 14) a ves víc hladoví, takže porody jsou řidší,
- čerstvě plná domácnost postaví zemnici za ≈ 156 dní (77), polozemnici za ≈ 592 dní (295) –
  **MIMO**: společnou práci si bere i zakládání polí, které je dražší (louka 100 místo 40
  člověkodní na hektar) a pole musí být větší (≈ 5,3× osevu místo 3,3×),
- zemnice se přestavuje po 18 letech (15), polozemnice po 22; dřív zchátrá 3,7 % zemnic (0,8 %)
  – splněno,
- opravy na konci životnosti: kalibrace je snížila na 15 (zemnice) a 17 (polozemnice)
  člověkodní ročně z 35 a 40 (s 35 zemnice chátrala na nulu už po ≈ 12 letech – ve špičkách
  polních prací na opravy nezbývá práce). Domácnost má od 10. roku vsi ≈ 51 člověkodní
  společné práce ročně (46), takže opravy jsou jen ≈ 0,30 a 0,34 (0,33 a 0,37) – cíl ≈ ½
  **zatím ne**; návrh: opravy na konci životnosti zemnice ≈ 25, polozemnice ≈ 28 člověkodní
  (čeká na schválení a nové měření),
- ves, kde hráč staví, kdykoli může, má po 60 letech medián 3 domácnosti a 15 lidí (6 a 31);
  za 60 let nevymřela žádná z 200,
- jediná domácnost bez nových staveb: za 60 let vymře 0,5 % (0,5 %), žijící mají medián 7 lidí
  (9),
- vymření do roku 1500 (starší měření, před finální revizí a před opravou podle rešerše): ves,
  kde hráč staví, kdykoli může, nevymřela žádná (0 z 30; na konci medián 33 domácností a 142
  lidí – když dojde půda, hlad drží ves u toho, co pole uživí). Cíl ≤ 1 % to ale
  **nepotvrzuje**: při 0 z 30 je 95% horní mez podílu vymřelých vsí ≈ 10 % (pravidlo tří:
  3 / n) – potvrdit ≤ 1 % by chtělo ≈ 300 vsí × 1000 let; skript proto u vymření vypisuje
  i velikost vzorku,
- jediná domácnost bez nových staveb (jen informace, starší měření): do 1000 let vymře ≈ 33 %
  (10 z 30, medián po ≈ 530 letech) – přestavba na polozemnici jí dá 8 míst a domácnost kolem
  8–9 lidí je odolná.

## Co hráč vidí

- V krajině: umístění první zemnice a dalších obydlí, rozestavěné stavby. **Modely obydlí jsou
  vlastní** (procedurálně v Blenderu s texturami z 0 A.D. – 0 A.D. slovanská obydlí nemá):
  zemnice i polozemnice mají **omazané stěny a střechu ze slámových došků** (Martin), na
  hřebeni jen nízké převázání bez „bakule“, aby byla vidět **zkřížená štítová prkna („kozy“)**;
  **před vchodem vyšlapaná hlína**, která měkce přechází do okolní trávy, a **podél okapu, kde se
  střecha dotýká země, hustší trsy trávy** – stéká tam víc vody (Martin). **Zemnice je opravdu
  jáma v zemi** (terén se pod ní otevře, vchod sestupuje do jámy), polozemnice mělčí; **stavba má
  víc fází** (vytyčení, sejmutí drnu, kopání jámy, sloupy, krokve, stěny, mazanice, došky, kozy
  a dýmník); ze zemnic **občas stoupá dým**; střecha je **předsazená vepředu i vzadu**, aby zakryla
  vchod svažující se do jámy (Martin). Stavby
  z módu Millennium A.D. (ruské sruby, severské domy) se nepoužijí – jiná doba či region
  a nejistá licence (Martin); nanejvýš jako předloha tvarů pro pozdější roubené chalupy.
- Rozhraní jako v 0 A.D. (Martin, 17. 10. 2026: „Ovládací prvky a layout udělej jako u 0AD.
  Odstraň všechny popisky – hráč nepotřebuje průvodce. Nevoď hráče za ručičku.“): horní lišta
  se jménem vsi a ikonami s čísly (lidé, obilí, volná práce, nasycení, datum), minimapa, panel
  vybraného obydlí (obyvatelé s věkem, stav, stáří, průběh stavby) a mřížka staveb. Žádný
  průvodce ani nápovědy.
- Krátké mizející upozornění, že je domácnost plná (fakt, ne rada).
- Kronika zůstává v datech vsi, v rozhraní zatím není.

## Navazuje

- **Jídlo a pole** – [fields.md](fields.md): společná pole, sklizeň podle ročních období,
  zásoby, nasycení a práce na obživu.
- **Les a dřevo**, veřejné projekty (opevnění), rod hráče a sňatky.

## Na stavitelovi

- Přesné vzorce porodů, úmrtí, chátrání a oprav – tak, aby splnily cíle v Kalibraci.
- Krok simulace (den, měsíc) a jak se ves dopočítá, když nikdo není online. Svět běží
  nepřetržitě; než vznikne `apps/worker`, může se ves dopočítat při načtení. Výsledek nesmí
  záviset na tom, kdy se dopočítává.
- Datový model, podoba panelu a kroniky.

## Rozhodnutí

| Rozhodnutí                                                                   | Kdo                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| Ves jako zásobárna aktiv: jídlo, voda, dřevo a hlavně lidé / člověkohodiny   | Martin                                     |
| Start: 4 lidé v jedné zemnici, hráč vybere místo                             | Martin                                     |
| Dost jídla → populace roste; cílem je efektivní výroba jídla                 | Martin                                     |
| Obydlí zatím zemnice a polozemnice                                           | Martin                                     |
| Obydlí se umisťuje volně (půdorys) na dost rovné zemi; překážky a les zdraží | Martin                                     |
| Pole jsou samostatná a společná pro celou ves                                | Martin                                     |
| Vlastní modely obydlí: omazané stěny, slámové došky; Millennium A.D. ne      | Martin                                     |
| Nová obydlí vždy staví hráč; plná domácnost → nová domácnost v novém obydlí  | Martin                                     |
| Hráč staví kdy chce (bez odemčení plnou domácností), ves zakládá zemnicí     | Martin (17. 10. 2026)                      |
| Odemčení surovinami předem – bez nich je tlačítko stavby zašedlé             | Martin (17. 10. 2026)                      |
| Obydlí chátrají, opravy rostou; přestavbu (i na lepší) rozhodují obyvatelé   | Martin                                     |
| Bez staveb ves přestane růst, ale nerozpadne se                              | návrh Clauda, Martin potvrdil              |
| Přestavba vždy na lepší obydlí, pokud jsou suroviny; typ nové stavby hráč    | Martin                                     |
| Hájení: prvních 30 herních let vsi přeje štěstí; žádní příchozí z okolí      | Martin                                     |
| Podoba hájení: dospělí neumírají, poloviční dětská úmrtnost                  | návrh Clauda                               |
| Kapacity 6 / 8, ceny 60 / 220 člověkodní (roční období / rok), životnosti    | návrh Clauda                               |
| Porodnost, úmrtnost, opravy až polovina příspěvku domácnosti                 | návrh Clauda                               |
| Dospělí umírají 2 % ročně (dřív 1,5 %)                                       | Martin – oprava podle rešerše 17. 10. 2026 |
| Porody od 16 let; dospělý pro práci, odemčení a domácnost zůstává 14–44      | Martin – oprava podle rešerše 17. 10. 2026 |
| Životnost zemnice ≈ 18 let (dřív ≈ 15); opravy na konci dál 15 čd ročně      | Martin – oprava podle rešerše 17. 10. 2026 |
| Startovní dospívající 12 a 13 let zůstávají                                  | Martin (17. 10. 2026)                      |
| Stěhuje se pár z plné domácnosti se 4 dospělými; dva nejmladší               | návrh Clauda                               |
| Rozpad domácnosti, prázdná obydlí čekají na plnou domácnost                  | návrh Clauda                               |
| Obyvatelé bez jmen a pohlaví, náhoda ze seedu, kronika                       | návrh Clauda                               |
| Dřevo zatím v ceně práce                                                     | návrh Clauda (dočasné)                     |
