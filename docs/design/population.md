# Obyvatelstvo a obydlí vesnice

Stav: schváleno 17. 10. 2026 (Martin: „asi ok, doladíme později“), týž den upraveno umístění
obydlí a společná pole (Martin). Implementace zatím není.

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
  když je domácnost plná, postaví další obydlí a ves se rozroste o novou domácnost.
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
  skupiny: **dítě** 0–13 let, **dospělý** 14–44, **starší** 45+.
- **Domácnost** – lidé jednoho obydlí. Každé obydlí je právě jedna domácnost.
- **Obydlí** – zatím dva typy:

  | Typ         | Míst | Nová stavba    | Typická životnost |
  | ----------- | ---- | -------------- | ----------------- |
  | zemnice     | 6    | 60 člověkodní  | ≈ 15 let          |
  | polozemnice | 8    | 220 člověkodní | ≈ 20–25 let       |

  Polozemnice je sušší a teplejší – dětem v ní je lépe (nižší dětská úmrtnost). Pro čerstvě
  plnou domácnost trvá zemnice zhruba jedno roční období, polozemnice celý herní rok – hráč volí
  mezi rychlou úlevou pro rodinu v těsnu a lepším domem, na který se čeká (návrh Clauda). Čísla
  jsou výchozí a doladí se měřením (viz Kalibrace).

- **Plná domácnost** – žije v ní tolik lidí, kolik má obydlí míst. **Přeplněná** – víc.
- **Člověkoden** – práce jednoho dospělého za herní den.

## Pravidla

### Založení vsi

- Hráč v krajině svého sídla umístí půdorys první zemnice (viz Umístění obydlí). Zemnice tam
  hned stojí (osadníci přišli) a bydlí v ní **4 lidé**: dva dospělí (kolem 25 let) a dva
  dospívající (12 a 13 let – návrh Clauda, aby první nová domácnost mohla vzniknout do pár let).
- Spolu se zemnicí hráč založí i **první pole** (Martin) – pole jsou samostatná a společná pro
  celou ves ([fields.md](fields.md)).

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

- **Porody:** každý dospělý pár (dva dospělí 14–44 let v jedné domácnosti) má zhruba jedno
  dítě za 3 roky. Hlad porody tlumí až zastaví, přeplněnost je výrazně sníží.
- **Úmrtí:** zhruba 40 % dětí se nedožije 14 let (v polozemnici méně než v zemnici); dospělí
  umírají asi 1,5 % ročně, starší víc (kolem 8 % ročně). Hlad a přeplněnost úmrtnost zvýší.
- **Přeplněnost** sama nastaví strop: populace domácnosti se ustálí kolem kapacity obydlí
  (+1–2), takže ves bez nových staveb přestane růst, ale nevymře.
- **Jídlo** vstupuje jako **nasycení vsi** 0–1 – počítá ho [fields.md](fields.md). Hlad ves
  zmenší na tolik lidí, kolik pole uživí, ale nezničí ji (návrh Clauda).
- Porody a úmrtí jsou **jednotlivé náhodné události**, ale opakovatelné: náhoda se odvozuje
  ze seedu světa, vsi a herního data. Stejný stav ve stejný den dá vždy stejný výsledek.
- Lidé stárnou podle data narození; s věkem přecházejí mezi skupinami.
- **Hájení:** prvních 30 herních let od založení vsi jí přeje štěstí (Martin) – dospělí
  neumírají (ani hladem) a dětí umírá polovina oproti běžné úmrtnosti (podoba štěstí je návrh Clauda, doladí
  se kalibrací). Malá ves tak nevymře hned na začátku a všichni hráči mají srovnatelný start.
- **Rozpad domácnosti** (návrh Clauda): domácnost bez dospělého (jen děti nebo starší) a osamělý
  dospělý bez dětí se přestěhují do domácnosti s nejvíc volnými místy (smí ji i přeplnit) –
  jinak by domácnost, kde zbyl jeden dospělý, už nikdy neměla děti. Kronika to zapíše.
  Opuštěné obydlí se neopravuje a chátrá; při stavu 0 zanikne a políčko se uvolní.

### Nové obydlí (rozhoduje hráč)

- O každé nové stavbě rozhoduje hráč (Martin). Hráč vidí, že je domácnost plná, a postaví
  nové obydlí – vybere typ a místo (viz Umístění obydlí).
- **Odemčení:** stavět lze, když je některá domácnost plná a žijí v ní aspoň **4 dospělí**
  (Martin: „je v ní moc dospělých“; čtveřici upřesnil Claude, aby měl kdo odejít i zůstat).
- **Cena:** člověkodny ze společné práce vsi (dřevo viz Zjednodušení). Stavba roste den po dni
  podle toho, kolik společné práce přitéká; hráč vidí postup.
- **Kolik staveb najednou:** rozestavěných nových obydlí smí být nejvýš tolik, kolik je
  domácností, které podmínku splňují – jednu domácnost nejde vyprázdnit frontou staveb
  (návrh Clauda).
- **Po dokončení** se do nového obydlí přestěhují **dva nejmladší dospělí** z domácnosti, která
  podmínku splňuje (z více takových z nejvíc přeplněné), a založí novou domácnost. Děti
  zůstávají (návrh Clauda). Když ji v tu chvíli nesplňuje žádná, obydlí zůstane prázdné.
- **Prázdné obydlí** obsadí sama první domácnost, která podmínku splní – dva nejmladší dospělí
  se do něj přestěhují (návrh Clauda).
- Když hráč nestaví, přeplněná domácnost žije v těsnu – méně porodů, víc úmrtí, ves přestane
  růst (Martin potvrdil).

### Chátrání a přestavba (rozhodují obyvatelé)

- Každé obydlí má **stav** 0–100 % a stárne. Potřeba oprav (člověkodny za rok) roste s věkem
  – zpočátku malá, ke konci životnosti velká (Martin).
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

- první možnost stavět přijde u 90 % vsí do **≈ 8 herních let** (≈ 3 skutečné dny) – Martin:
  „zkusíme to“; hrubá simulace s hájením: medián 3 roky, 90 % do 7, 99 % do 20,
- čerstvě plná domácnost postaví zemnici zhruba za roční období, polozemnici za herní rok,
- zemnice se přestavuje typicky po ≈ 15 letech, polozemnice po ≈ 20–25; ke konci životnosti
  stojí opravy zhruba polovinu toho, co domácnost přidá do společné práce,
- ves, kde hráč staví, kdykoli může, vymře do roku 1500 jen výjimečně (hrubá simulace: 0,6 %).
  Jediná domácnost bez nových staveb za staletí vymře (simulace: ≈ 90 % do 1000 let) – stavět
  se vyplácí; za pár dní nepřítomnosti se ale nic takového nestane (anti-cíl).

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
- Panel vsi: počet lidí podle věku, domácnosti (typ obydlí, obsazenost, plná/přeplněná, stav),
  volná společná práce za den, rozestavěné stavby, kronika.
- Upozornění, že je domácnost plná a lze stavět.

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

| Rozhodnutí                                                                   | Kdo                           |
| ---------------------------------------------------------------------------- | ----------------------------- |
| Ves jako zásobárna aktiv: jídlo, voda, dřevo a hlavně lidé / člověkohodiny   | Martin                        |
| Start: 4 lidé v jedné zemnici, hráč vybere místo                             | Martin                        |
| Dost jídla → populace roste; cílem je efektivní výroba jídla                 | Martin                        |
| Obydlí zatím zemnice a polozemnice                                           | Martin                        |
| Obydlí se umisťuje volně (půdorys) na dost rovné zemi; překážky a les zdraží | Martin                        |
| Pole jsou samostatná a společná pro celou ves                                | Martin                        |
| Vlastní modely obydlí: omazané stěny, slámové došky; Millennium A.D. ne      | Martin                        |
| Nová obydlí vždy staví hráč; plná domácnost → nová domácnost v novém obydlí  | Martin                        |
| Obydlí chátrají, opravy rostou; přestavbu (i na lepší) rozhodují obyvatelé   | Martin                        |
| Bez staveb ves přestane růst, ale nerozpadne se                              | návrh Clauda, Martin potvrdil |
| Přestavba vždy na lepší obydlí, pokud jsou suroviny; typ nové stavby hráč    | Martin                        |
| Hájení: prvních 30 herních let vsi přeje štěstí; žádní příchozí z okolí      | Martin                        |
| Podoba hájení: dospělí neumírají, poloviční dětská úmrtnost                  | návrh Clauda                  |
| Kapacity 6 / 8, ceny 60 / 220 člověkodní (roční období / rok), životnosti    | návrh Clauda                  |
| Porodnost, úmrtnost, opravy až polovina příspěvku domácnosti                 | návrh Clauda                  |
| Odemčení při plné domácnosti se 4 dospělými; stěhují se dva nejmladší        | návrh Clauda                  |
| Rozpad domácnosti, prázdná obydlí, nejvýš stavba na každou plnou domácnost   | návrh Clauda                  |
| Obyvatelé bez jmen a pohlaví, náhoda ze seedu, kronika                       | návrh Clauda                  |
| Dřevo zatím v ceně práce                                                     | návrh Clauda (dočasné)        |
