# Prémiové krajiny

Stav k 20. 10. 2026 – **schváleno** (Martin: „Shvaluji“). Lidský hráč dostane krajinu s něčím výjimečným –
nalezištěm, splavnou řekou, brodem pod vyvýšeninou, průsmykem, velmi úrodnou půdou… NPC mají
průměrnou krajinu. Všechny prémiové krajiny mají stejnou hodnotu, jen každá jinou a jindy.

## Proč

Martin (20. 10. 2026): „Můžeme spolu probrat mechaniku zvýhodnění hráčů?“ – „Jde o zvýhodnění
v rámci krajiny - Někdo bude startovat na krajině, kde jsou např. naleziště drahých kovů. Někdo
jiný bude startovat v krajině, kde je splavná řeka. Dalším typem může být velmi úrodná krajina.
A dalším muže být krajina, kde je nějaká příhoná vyvýšenina nad brodem přes řeku, kudy vede
obchodní stezka. Další může být třeba krajina s horským průsmykem, kudy vede obchodní stezka.
Napadají tě ještě nějaká další taková zvýhodnění?“

„Budou dvě skupiny hráčů - lidští a NPC. NPC budou mít úplně průměrnou krajinu - nějakou
takovou, na které teď stojí vlkov. Lidští hráči by měli mít některou z prémiových krajin, ale
musí to být zkalibrované tak, aby všichni měli stejnou výhodu. Výhoda může být i časová - např.
hlubinná ložiska zlata vs. zlatonosný potok. V hlubiných ložiscích sice bude víc zlata, ale hráč
se k němu dostane až třeba po 500 letech, s rozvojem hornictví, ale zlato z potoka půjde rýžovat
hned.“

„Na tom zas tolik nezáleží. Jde o to, aby lidští hráči měli důvod se rozvíjet a na svých
krajinách časem vybudovat hradiště a města. Další věc je, že NPC bude nejspíš (alespoň dokud to
nevyladím) hrát ideálně a tak bude mít proti lidským hráčům výhodu. Nicmoně NPC budou spíš
pasivní hráči, sloužící hlavně k udržení rovnováhy.“

Prémiová krajina je tedy **kotva rozvoje**: místo, kde se časem vyplatí postavit hradiště, trhové
nebo hornické město. Velikost výhody je prostředek, ne cíl – má zhruba vyrovnat to, že NPC hraje
ideálně.

## Cíle, ne-cíle, anti-cíle

**Cíle**

- Každý lidský hráč dostane jednu prémiovou krajinu a ví, co v ní má (je vidět na mapě i v panelu).
- Všechny prémiové typy mají stejnou hodnotu – dřívější výhoda váží víc (Kalibrace).
- Řeky a dálkové obchodní stezky navazují přes mapy sousedů (Kostra světa).
- Všechny typy existují jako krajina hned, i když jejich využití (těžba zlata, lodě, mýto) přijde
  až s pozdější mechanikou.

**Ne-cíle (teď)**

- Mechaniky využití, které hra ještě nemá: hornictví, rýžování, lodě, mýto, sůl, med, kožešiny,
  kamenné stavby, vinice. Každá přijde jako vlastní návrh.
- NPC hráči samotní (chování, vazalství) – tady jen to, že mají průměrnou krajinu.
- Navázání celého terénu přes okraje map (jen kostra – řeky a stezky).

**Anti-cíle (selhání, i kdyby to technicky fungovalo)**

- Jeden typ je jasně nejlepší a hráči se předhánějí, kdo ho dostane.
- Prémiová krajina pokazí start (málo louky, lesa nebo vody) – výhoda je vždy navíc.
- Hra stojí na štěstí, ne na rozhodování hráče.
- Uložená sídla (Vlkov) se změní pod hotovými stavbami.

## Kdo dostane jakou krajinu

- **NPC** (Martin): průměrná krajina jako dnes Vlkov – dnešní generátor beze změny.
- **Lidský hráč** (Martin): jednu prémiovou krajinu **přidělí hra** (Martin: „Hra mu ho přidělí“).
  Kdy: při prvním vstupu do hry (`enterGame`, nové sídelní sídlo).
- **Typ patří hráči** (návrh Clauda): uloží se u hráče a **Začít znovu ho nepřelosuje** – nová
  krajina po restartu je stejného typu (jiný seed). Jinak by šlo restartovat, dokud nepadne
  žádaný typ. Výjimka – **typ kostry patří místu** (návrh Clauda, [kostra světa](world-skeleton.md)
  – Hustota a stejné podmínky): po restartu ho hráč dostane, jen když je poblíž políčko s tímto
  místem kostry.
- **Prémie patří první mapě** (návrh Clauda): další mapy hráče (odchod do nové vsi –
  migration.md) jsou průměrné, prémie se stěhováním nesbírá. Opustí-li hráč první mapu, výhoda
  zůstane mapě (a vsi, která tam případně žije).
- **Jak hra vybírá** (návrh Clauda): typy, které potřebují kostru světa (řeka, brod, průsmyk,
  soutok), dostane jen mapa, přes kterou kostra vede; ostatní typy jen mapa bez kostry (8. 11.
  2026 upřesněno – jinak by sídlo mělo prémii i řeku nebo stezku). Mezi vhodnými typy hra vybírá
  tak, aby typy ve světě byly zastoupené zhruba stejně často, a dva stejné typy nebyly vedle sebe
  v mřížce map. Místo a typ najednou (`placeSeat`): [kostra světa](world-skeleton.md) – Hustota
  a stejné podmínky.
- **Stávající sídla** se nemění (Vlkov zůstává průměrný) – prémie platí pro nová sídla.

## Kostra světa

Martin: „samozřejmě by se mi líbilo, kdyby krajiny navazovaly, ale bojím se, aby to nebylo moc
náročné“ – na návrh navázat jen řeky a stezky: „Ano, takhle bychom to mohli udělat“.

**Podrobný návrh** (8. 11. 2026, ke schválení): [kostra světa](world-skeleton.md) – algoritmus
v nekonečné mřížce, hustota a stejné podmínky, co mapa dostane z kostry, verze vrstev; plán
[2026-11-08-world-skeleton.md](../superpowers/plans/2026-11-08-world-skeleton.md). Níž zůstává
rámec.

- **Co:** řeky a dálkové obchodní stezky jako čáry přes mřížku map světa, deterministicky ze seedu
  světa. **Jsou vlastností světa** (návrh Clauda): objeví se na každé mapě, kudy vedou – i na
  mapách NPC a na dalších mapách hráče. Průměrný generátor proto musí umět mapu s řekou
  a stezkou; mapa NPC s řekou nemá prvky prémie (přístaviště, brod pod vyvýšeninou…). Každá mapa z kostry ví, kde do ní řeka nebo stezka vstupuje a kde vystupuje (body na
  okraji mapy) a jestli na ní je brod, průsmyk nebo soutok.
- **Mapa se generuje sama** jako dnes, jen musí kostru respektovat: řeka vede od vstupu k výstupu
  (údolí podél ní), stezka od kraje ke kraji přes brod nebo průsmyk. Ostatní terén je vlastní –
  na okrajích map švy, které hráč nevidí (dívá se vždy na jednu mapu, sousedé jsou za okrajem).
- **Řeka vs. potok:** dnešní potok mapy zůstává. Řeka je nový větší tok (širší, hlubší, s brody
  jen na vybraných místech). Mapa s řekou může mít i potok (přítok – soutok).
- **Sdílená mřížka:** dnes má každý hráč vlastní mřížku map (`settlement.grid_x` / `grid_y` – CLAUDE.md,
  Víc vsí jednoho hráče). Kostra světa potřebuje **jednu mřížku světa pro všechny** – přesun
  map hráčů do společné mřížky (kde začíná nový hráč, kde jsou NPC) je **předpoklad** a patří do
  návrhu vazalství a světa a **musí vzniknout před kostrou** (návrh Clauda) – **už existuje**
  (vassalage.md – Místo na mapě světa, newcomers.md; docs/code/world.md – Mřížka a umístění).
  Do vzniku kostry mají řeka, brod, průsmyk a soutok na prémiové mapě jen místní vstup
  a výstup (náhodný) – vývojová verze, před ostrým spuštěním se přegeneruje (uložená vývojová
  sídla se do sdíleného světa nepřenášejí).
- **Obchodní stezka kostry** je jiná věc než zemská stezka vsi (trade.md – postaví si ji ves
  k sousedovi). Stezka kostry je **hotová dálková cesta od počátku** (návrh Clauda): vede mapou
  přes brod nebo průsmyk a po ní vyjedou obchodní výpravy a kupci v obou směrech hned, jako po hotové zemské
  stezce – bez stavby (obchod až s trhem – markets.md, plány 2 a 4, **kupci jezdí po stezce od plánu 4 – 26. 11. 2026**; Martin 22. 11. 2026 „Po obchodní stezce budou jezdit karavany …“; obchod se smyšlenými sousedy zanikl 23. 11. 2026).

## Typy krajin

U každého typu: **krajina** (co vygeneruje generátor), **hned** (co dává s dnešními mechanikami),
**později** (mechanika, která ho využije), **kotva** (co se tu časem vyplatí postavit).
Hodnota v čase je v Kalibraci.

### Od Martina

| Typ                                                                | Krajina                                                        | Hned                                                                 | Později                                                                                | Kotva                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| **Hluboká ložiska drahých kovů** (zlato, stříbro)                  | žíla ve skalnatém hřbetu (výchozy, rudné kameny)               | nic                                                                  | hornictví (Martin: „po 500 letech, s rozvojem hornictví“) – hodně kovu                 | hornické město                    |
| **Zlatonosný potok**                                               | potok s náplavy zlatonosného písku                             | nic (do rýžování)                                                    | rýžování hned, jak bude mechanika (Martin: „půjde rýžovat hned“) – málo kovu, ale brzy | trhová ves, později město         |
| **Splavná řeka** (kostra)                                          | široká řeka přes mapu, rovná niva, místo pro přístaviště       | niva s loukami (seno), ryby (později)                                | doprava po řece, přístav, obchod s ostatními hráči                                     | přístavní město                   |
| **Velmi úrodná krajina** (spraš, černozem – Polabí, Žatecko, Haná) | louky s vysokou přirozenou úrodností, méně lesa (pásmo platí)  | víc obilí na hektar – měřitelné hned                                 | –                                                                                      | velké sídlo, město                |
| **Vyvýšenina nad brodem s obchodní stezkou** (kostra)              | řeka s brodem, nad ním ostrožna nebo pahorek, stezka přes brod | vyšlapaná cesta od počátku, obchod po stezce až s trhem (markets.md) | mýto na brodu, trh, obrana                                                             | hradiště nad brodem, trhové město |
| **Horský průsmyk s obchodní stezkou** (kostra)                     | hřbety po stranách, sedlo, stezka skrz                         | cesta od počátku, obchod až s trhem (markets.md)                     | mýto, obrana průsmyku, kupci ze vzdálených krajů                                       | strážní hradiště, trhové město    |

### Další návrhy (návrh Clauda; Martin: „Asi můžeš udělat všechny typy najednou. Přecejen to jsou krajiny. To, že ještě neumíme těžit např. zlato, by nemělo vadit“)

| Typ                                                 | Krajina                                                                                | Hned                                                                           | Později                                                                               | Kotva                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------- |
| **Bohatá železná ruda** (krevel – Brdy, Barrandien) | rudiště s bohatou rudou blízko vsi                                                     | kovář potřebuje méně rudy na kg nástrojů (smith-supply.ts) – levnější nástroje | prodej železa a nástrojů                                                              | hutnická a kovářská ves    |
| **Dobrá keramická hlína** (grafitová – jižní Čechy) | hliniště s kvalitní hlínou                                                             | hrnčíř potřebuje méně hlíny a práce (hliniště)                                 | prodej keramiky                                                                       | hrnčířská ves              |
| **Doubravy a bučiny**                               | velké listnaté lesy (dub, buk) kolem vsi                                               | víc prasat (pastva v lese – žír), buky pro uhlíře                              | –                                                                                     | velká stáda, dřevařská ves |
| **Rozsáhlé nivní louky**                            | široká niva potoka s loukami                                                           | víc sena a pastvy – větší stáda skotu                                          | –                                                                                     | dobytkářská ves            |
| **Teplé jižní svahy**                               | prosluněné svahy k jihu (`SUN_RAYS`)                                                   | lepší úroda sadu                                                               | vinice (s křesťanstvím)                                                               | vinařská ves               |
| **Posvátná hora** (Říp, Radhošť, Hostýn)            | výrazný vrch s vrcholovou plošinou                                                     | posvátné místo – štěstí (happiness.md)                                         | sněmy, poutě, prestiž rodu                                                            | kultovní místo, hradiště   |
| **Posvátný nebo léčivý pramen**                     | pramen ve skalce nebo v háji                                                           | štěstí; léčivý pramen nižší úmrtnost                                           | poutě                                                                                 | lázně, kultovní místo      |
| **Soutok dvou toků** (Praha, Levý Hradec; kostra)   | řeka a přítok, ostrožna mezi nimi                                                      | dvě údolí s loukami, ostrožna                                                  | křižovatka cest a řek, obchod                                                         | hradiště, město            |
| **Přirozená pevnost**                               | ostrožna nad zaříznutým meandrem (landscape.md – ostrožny) nebo místo chráněné bažinou | nic                                                                            | obrana ve válce (war.md)                                                              | hradiště                   |
| **Solný pramen** (sůl se do Čech dovážela)          | slanisko u potoka                                                                      | nic                                                                            | solivar – velmi cenné zboží                                                           | trhové město               |
| **Brtě a lesní včely**                              | starý les s dutými stromy (brtě)                                                       | nic                                                                            | med do jídla, vosk na obchod (hotovo: brtě vybírá ves od 1. 10., hides-honey.md)      | –                          |
| **Hojná zvěř a kožešiny** (bobři, kuny)             | hluboké lesy a mokřady                                                                 | nic                                                                            | lov – maso bez stáda, kožešiny na obchod (kuna a bobr později – chybí strop a úlovek) | –                          |
| **Stavební kámen a vápenec**                        | lom ve skalní stěně                                                                    | nic                                                                            | kamenné stavby (hrady, kostely)                                                       | hrad, kostel               |

**Od spuštění všechny typy** (Martin, 20. 10. 2026 – na otázku, které typy přidělovat, když
většina zatím nemá mechaniku: „Všechny, nerovnost přijmout“): hra přiděluje všechny typy od
ostrého spuštění; hráč na typu bez mechaniky do jejího příchodu výhodu nemá a nic se mu nevrací.
Kalibrace počítá s plánem, kdy mechanika přijde (Kalibrace).

**Nové suroviny:** obchod jen se surovinami, které má i ves (Martin 19. 10. 2026; dnes trh a kupci – markets.md). Zlato, sůl, med, vosk, kožešiny a kámen přijdou **až s mechanikou svého
typu** – do té doby jsou jen v krajině (otevřená otázka, jestli to Martin takto chce).

## Kalibrace

Martin: „musí to být zkalibrované tak, aby všichni měli stejnou výhodu“ – „Ať se dřívější výhoda
počítá víc“.

- **Společná míra** (návrh Clauda): hodnota výhody v **člověkodnech ušetřené nebo získané práce
  za rok** proti průměrné krajině NPC. Zboží (zlato, sůl…) se převede přes hodnoty zboží
  v kg obilí (trade.md – `TRADE_GOOD_VALUES`) a obilí na práci přes cenu obilí v práci
  (`foodCosts`).
- **Kalendář světa** (Martin, 20. 10. 2026: „Kalendář světa“): pozdější mechaniky (hornictví,
  lodě…) přicházejí ve světě v určitém herním roce pro všechny – např. hornictví kolem roku 1000.
  Hodnota se počítá od dne, kdy hráč začíná, do konce světa (1. 1. 1500). Hráč, který začne
  pozdě, má k pozdním výhodám blíž – hra mu velikost prvků krajiny (naleziště, ložiska…) při
  generování přizpůsobí, aby váhovaný součet od jeho startu vyšel stejně jako u ostatních
  (návrh Clauda).
- **Váha času:** hodnota roku _t_ (od startu hráče) se násobí _e_^(−*t*/τ). Návrh Clauda:
  τ = 200 let – výhoda za 500 let váží asi 8 % výhody hned, takže hluboká ložiska musí dát zhruba
  dvanáctkrát víc než stejně velká výhoda hned. τ se ladí.
- **Cíl** (návrh Clauda – Martin: „Na tom zas tolik nezáleží“): váhovaný součet hodnoty za hru je
  u všech typů stejný a zhruba odpovídá tomu, kolik NPC získá ideálním hraním – na začátek
  +15 % práce vsi (ekvivalent) prvních sto let; upraví se, až bude NPC.
- **Typy s dnešní mechanikou** (úrodná krajina, železná ruda, hlína, doubravy, nivní louky, jižní
  svahy, posvátná místa): hodnota se **změří** kalibrací vsi (`measure-village.ts` – stovky vsí na
  každém typu proti průměrné krajině) a velikost výhody v generátoru (o kolik úrodnější, kolik
  lesa…) se nastaví tak, aby seděla na cíl.
- **Typy bez mechaniky:** hodnota se teď jen **naplánuje** – křivka „kolik za kolik let“ (např.
  rýžování od roku 1 málo, hornictví od 500. roku hodně) a velikost naleziště v krajině. Až
  mechanika přijde, nastaví se tak, aby křivku splnila, a ověří se kalibrací.
- Tabulka typů s plánovanou křivkou a výsledkem kalibrace vsi bude v tomto dokumentu (doplní se
  při kalibraci – krok 4 postupu).

### Výsledky měření generátoru (7. 11. 2026)

`npx tsx packages/game/scripts/measure-landscapes.ts 30 <typ>` – malý vzorek 30 seedů na typ
(seedy 0–29, verze vrstev `CURRENT_LAYER_VERSIONS` + `premium: 1`), stroj pod zátěží jiných
měření (časy jen orientačně). Kalibrace vsi (`measure-village`) zatím neproběhla – hodnotu výhody
v práci teprve změří. **Louka do 600 m** = louka do 600 m od místa pro vesnici u přijaté krajiny,
**úrodná** = z toho úrodnost ≥ 60 (mediány, ha). Pásmem projdou všechny typy na všech 30 seedech
(nejvýš 8 pokusů – soutok; `MAX_ATTEMPTS` 16).

| Typ                    | 1. pokus | ms / pokus | Louka do 600 m | Úrodná |
| ---------------------- | -------: | ---------: | -------------: | -----: |
| průměrná krajina (NPC) |     90 % |         51 |           60,6 |   33,8 |
| deep-gold              |    100 % |         54 |           60,6 |   34,8 |
| gold-stream            |    100 % |         51 |           60,6 |   34,7 |
| navigable-river        |    100 % |         61 |           60,9 |   39,3 |
| fertile                |    100 % |         50 |           60,6 |   45,0 |
| ford-hill              |     97 % |         87 |           60,8 |   37,9 |
| mountain-pass          |     63 % |         75 |           60,4 |   34,4 |
| iron-ore               |     93 % |         57 |           60,6 |   34,7 |
| fine-clay              |    100 % |         54 |           60,6 |   34,7 |
| oak-beech              |    100 % |         53 |           60,6 |   34,7 |
| floodplain             |    100 % |         55 |           78,8 |   37,9 |
| south-slopes           |     63 % |         59 |           60,5 |   33,6 |
| sacred-mountain        |     97 % |         55 |           60,5 |   35,4 |
| sacred-spring          |    100 % |         55 |           60,6 |   34,7 |
| confluence             |     40 % |         65 |           59,8 |   35,5 |
| natural-fortress       |     87 % |         79 |           60,4 |   35,4 |
| salt-spring            |    100 % |         55 |           60,6 |   34,7 |
| wild-bees              |    100 % |         54 |           60,6 |   34,7 |
| game-furs              |    100 % |         59 |           60,6 |   34,7 |
| building-stone         |     97 % |         73 |           60,5 |   34,5 |

- Louka u vsi je u většiny typů stejná jako u průměrné krajiny – výrazně víc dávají jen **nivní
  louky** (+18 ha louky do 600 m) a **úrodná krajina** (+11 ha úrodné louky); řeka a brod mají
  úrodnou nivu (+4–6 ha). Ostatní typy mají úrodné louky o ≈ 1 ha víc než průměrná, protože na
  prémiové krajině platí jen dolní meze pásma. Doubravy mají podíl lesa jako průměrná (medián
  62,5 %, rozdíl je ve složení lesa).
- Nejčastěji opakuje pokus soutok (40 % na první pokus), průsmyk a jižní svahy (63 %) – stále
  hluboko pod `MAX_ATTEMPTS`; test pásma hlídá ≥ 95 % na 300 seedech.

## Generátor

- **Verze:** prémiové krajiny jsou nové vrstvy nebo nové verze vrstev krajiny (landscape.md –
  verze vrstev). Průměrná krajina NPC = dnešní `CURRENT_LAYER_VERSIONS` beze změny. Uložená
  sídla se nemění.
- **Pásmo:** celé pásmo srovnatelnosti (`band.ts`) platí na průměrné krajině téhož pokusu;
  prémiová krajina musí projít jen jeho dolními mezemi (louky u vsi, les, voda) – horní meze
  na ní neplatí – a navíc kontrolou svého typu (ložisko existuje, brod je přístupný ze vsi,
  řeka vede od vstupu k výstupu…).
- **Data:** krajina nese typ a jeho prvky (naleziště, brod, průsmyk, pramen, ostrožna – obrysy
  a body) jako čistou funkci krajiny, stejně v prohlížeči i na serveru (determinismus –
  `det-math.ts`, vrstva překážek se generuje i v prohlížeči).
- **Vzhled:** každý typ musí být vidět (skály s rudou, zlatonosné náplavy, řeka, brod, sedlo,
  vrch, pramen, lom…). Modely a textury jako ostatní krajina (0 A.D., CC0).
- **Navazuje na rozdělanou práci:** skály u potoka a ostrožny (landscape.md – Skály u potoka,
  ve vývoji) – ostrožna je základ typů vyvýšenina nad brodem, soutok a přirozená pevnost.
  **Průměrná krajina NPC** je nová verze terénu se skalami u potoka (návrh Clauda); ostrožny
  na ní jsou jen malé a vzácné, prémiové typy pevnost, brod pod vyvýšeninou a soutok mají
  ostrožnu jistou a výraznou. Kalibrace se dělá proti této průměrné krajině.

## Co hráč vidí

- Při vstupu do hry krátké představení krajiny – jediné místo se slovy (návrh Clauda;
  „bez průvodce“ – UI jako 0 A.D. – proto jen jedna věta s ikonou typu).
- Prvky typu na mapě a minimapě (naleziště, brod, průsmyk, pramen), výběr kliknutím jako
  rudiště – panel s ikonou, co místo dává hned a co později.
- **Jak je to hotové** (návrh Clauda, 7. 11. 2026): věta se ukáže jako mizející řádek upozornění
  s ikonou typu, až je scéna připravená, jen u sídla s typem a **dokud ves není založená** (první
  vstup do sídla) – např. „Krajina rodu: Bohatá železná ruda – kovář potřebuje méně rudy –
  levnější nástroje.“; typ bez účinku hned řekne, co přijde později. Panel prvku: portrét typu
  s krátkým názvem (Bohatá ruda, Brod se stezkou…), ikona **hned** (slunce) a **později**
  (přesýpací hodiny) – texty jen v popiscích, co zatím nic nedává, je zašedlé. Klik vybere prvek jen tam, kde není nic ze vsi: uvnitř obrysu naleziště, brodu,
  ostrožny…, u žíly do 8 m od osy, jinak do 12 m od bodu prvku. **Louky, les, svahy, honitba
  a brtě jsou plochy kolem vsi – vybírají se jen u bodu prvku** (brtě u úlů), jinak by klik na
  prázdnou zem nezrušil výběr; řeku a stezku vybírá voda a cesta vsi. Portréty 19 typů:
  `tools/blender/icons.py` → `public/icons/premium/<typ>.png`.

## Postup (návrh Clauda)

1. **Generátor typů** – všechny typy jako krajina a data, verze, pásmo, ukázka na `/dev/landscape`
   (výběr typu a seedu). Bez kostry: řeka, brod, průsmyk a soutok s náhodným vstupem a výstupem.
2. **Přidělení** – lidský hráč při vstupu do hry dostane typ, NPC průměrnou krajinu.
3. **Kostra světa** – řeky a stezky přes sdílenou mřížku světa ([world-skeleton.md](world-skeleton.md),
   plán `docs/superpowers/plans/2026-11-08-world-skeleton.md`).
4. **Kalibrace** typů s dnešní mechanikou, plánované křivky ostatních.
5. **Mechaniky využití** – každá vlastní návrh (rýžování, hornictví, doprava po řece, mýto, sůl,
   brtnictví, lov, kámen, vinice).

## Otevřené otázky

- Nové suroviny (zlato, sůl, med, kožešiny) – přijdou až s mechanikou, platí do té doby „jen
  společné suroviny“?
- ~~Sdílená mřížka světa a kde začíná nový hráč~~ – hotové (vassalage.md, newcomers.md); otázky
  ke kostře jsou v [world-skeleton.md](world-skeleton.md) – Otevřené otázky.
- Kdy ve světě přijdou které mechaniky (rok hornictví, lodí, mýta…) – plán pro kalibraci.

## Co je na staviteli

Tvary prvků v terénu, přesné míry a podíly, modely a textury, verze vrstev a jejich čísla,
algoritmus kostry světa, rozhraní dat – v mezích výše a determinismu krajiny.

## Rozhodnutí

| Rozhodnutí                                                                                                                                     | Kdo                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Zvýhodnění lidských hráčů krajinou – naleziště, splavná řeka, úrodná krajina, vyvýšenina nad brodem se stezkou, průsmyk se stezkou             | Martin (20. 10. 2026)                                       |
| Lidští hráči a NPC; NPC průměrná krajina (jako Vlkov), lidský hráč prémiovou                                                                   | Martin (20. 10. 2026)                                       |
| Všechny prémiové krajiny stejná výhoda; výhoda může být i časová (potok hned, ložiska později)                                                 | Martin (20. 10. 2026)                                       |
| Dřívější výhoda váží víc                                                                                                                       | Martin (20. 10. 2026)                                       |
| Typ přidělí hra                                                                                                                                | Martin (20. 10. 2026)                                       |
| Od spuštění všechny typy, nerovnost do příchodu mechanik se přijímá                                                                            | Martin (20. 10. 2026)                                       |
| Pozdější mechaniky podle kalendáře světa; hodnota od startu hráče do roku 1500, pozdní start – prvky krajiny přizpůsobené                      | Martin (20. 10. 2026), přizpůsobení návrh Clauda            |
| Typ patří hráči (Začít znovu nepřelosuje), prémie patří první mapě                                                                             | návrh Clauda                                                |
| Řeka a stezka kostry jsou vlastnost světa (i mapy NPC); sdílená mřížka před kostrou, do té doby místní vývojová verze                          | návrh Clauda                                                |
| Stezka kostry je hotová dálková cesta – obchod oběma směry hned                                                                                | návrh Clauda                                                |
| Průměrná krajina NPC = terén se skalami u potoka, ostrožny malé a vzácné; prémiové typy jistá výrazná ostrožna                                 | návrh Clauda                                                |
| Navazují jen řeky a stezky (kostra světa), zbytek terénu každá mapa vlastní                                                                    | návrh Clauda, Martin („Ano, takhle bychom to mohli udělat“) |
| Všechny typy najednou jako krajina, využití později                                                                                            | Martin (20. 10. 2026)                                       |
| Představení krajiny při prvním vstupu = dokud ves není založená; plochy typu (louky, les, svahy) se kliknutím vybírají jen u bodu prvku        | návrh Clauda (7. 11. 2026)                                  |
| Účel: důvod rozvíjet se a postavit hradiště a města; NPC pasivní, drží rovnováhu                                                               | Martin (20. 10. 2026)                                       |
| Další typy (železná ruda, hlína, doubravy, nivní louky, jižní svahy, posvátná hora, pramen, soutok, přirozená pevnost, sůl, brtě, zvěř, kámen) | návrh Clauda, Martin („všechny typy najednou“)              |
| Společná míra čd za rok, váha času e^(−t/200 let), cíl +15 % práce prvních 100 let                                                             | návrh Clauda                                                |
| Prémie jedna na hráče (první mapa), typy kostry jen na mapách kostry, typy rovnoměrně                                                          | návrh Clauda                                                |
| Stávající sídla beze změny                                                                                                                     | návrh Clauda                                                |
| Účinky hned: bohatá ruda 4 kg na kg nástrojů (rudiště na prvku, nevyčerpá se), hlína poloviční na kg keramiky, sad na svahu × 1,25             | návrh Clauda                                                |
| Posvátná hora a pramen = posvátné místo vsi +10 jako háj, mezi háji a do stropů; pramen a slanisko pole ani sad nesmí                          | návrh Clauda                                                |
| Stezka kostry ve vsi jako upravená cesta s průsekem a hotová zemská stezka oběma směry od založení                                             | návrh Clauda                                                |
| Kostra světa podrobně ([world-skeleton.md](world-skeleton.md)); typy bez kostry jen na mapách bez kostry, typ kostry patří místu (8. 11. 2026) | návrh Clauda                                                |
