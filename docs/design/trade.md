# Dvorec vojvody, zemská stezka a obchod se sousedy

> **Od 23. 11. 2026 neplatí** obchod se smyšlenými sousedy (markets.md – Pravidla 1, Martin 22. 11. 2026); zbylé zmínky níž o sousedech, nákupech a výpravách k nim jsou dřívější stav. Dřívější text o sousedech, cenách a panelu obchodu je v [historii](history/trade-history.md); řádky Rozhodnutí o sousedech a obchodu jsou historické. Jeho místo přebírá [obchod – trhy a mince](markets.md).

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
- **Pokračování na sousední mapě** (Martin 16. 11. 2026: „ano“ k návrhu Clauda – hustý les je
  neprůchozí, [válka](war.md) – Terén): hotová zemská stezka nekončí na kraji mapy – pokračuje ze
  stejného bodu okraje na sousední mapě až k tamní vsi (k brance jejího dvorce), a když tam ves
  není, k nejbližšímu místu velké souvislé louky té mapy. Trasu, průsek hustým lesem a uložení
  podrobně řeší plán ([hustý les](../superpowers/plans/2026-11-16-dense-forest.md)); podrobnosti
  návrh Clauda. **Viditelnost** (Martin 16. 11. 2026: „Když je to mapa rodu nebo vazala, ať je
  vidět celá, stejným způsobem jako mapa vlastní. Pokud to bude mapa nepřítele nebo neutrála, ať je
  tam fog of war“): na mapě vlastního rodu nebo vazala celé, na mapě nepřítele nebo neutrála jen
  tam, kam muži rodu dohlédli.

## Sousedé (bez simulace – varianta a)

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1); do plánu 2 nic. Dřívější text je v [historii](history/trade-history.md).

## Obchod

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1); do plánu 2 nic. Dřívější text je v [historii](history/trade-history.md).

## Jen společné suroviny

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1); do plánu 2 nic. Dřívější text je v [historii](history/trade-history.md).

## Výměna lidí

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1). **Od 24. 11. 2026 je výměna lidí zboží na trhu** (markets.md – Rozhodnutí plánu 3, bod 10): hráč a správce posílají rodiny, svobodné muže a ženy výpravou na trh, hostitel je kupuje, když má půdy víc než práce (`peopleWanted`), a nabízí podle výhledu přebytku lidí. Vesničané lidi neprodávají ani nekupují. Cena rodiny je jedna bez ohledu na počet dětí (dva dospělí, děti v ceně). Prodaní se usadí u kupce, neprodaní se vrátí s původními id. Dřívější text je v [historii](history/trade-history.md).

## Hřivny místo nástrojů (20. 10. 2026)

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1); do plánu 2 nic. Dřívější text je v [historii](history/trade-history.md).

## Dobytek ve třech druzích (20. 10. 2026)

Smyšlení sousedé skončili (markets.md – Rozhodnutí plánu 1); do plánu 2 nic. Dřívější text je v [historii](history/trade-history.md).

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
  Platí pro každou výpravu ve vsi. Zboží, které ves dává, odejde hned,
  přinesené dorazí po návratu. Ves si nechá aspoň 2 krávy. Kalibrace se nemění (běží bez obchodu
  – ověřeno `measure-village 20 20`).
- **Rozhraní:** v panelu dvorce (obydlí s portrétem „Dvorec vojvody“) ikona Zemská stezka otevře
  růžici 8 šipek kolem dvorce (cena, délka a dny cesty v popisku, zahrazený směr zašedlý
  s důvodem, hotová stezka zlatě, rozestavěná s průběhem). Ikona Obchod a panel obchodu
  skončily 23. 11. 2026 se smyšlenými sousedy – dřívější text je v
  [historii](history/trade-history.md).
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
    za krajem mapy zmizí a vrátí se po stezce k ohradě čelem dopředu;
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
