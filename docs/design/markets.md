# Obchod – trhy, kupci a mince (issue #11)

Stav: **schváleno** – Martin 22. 11. 2026 na otázku „Schvaluješ oba návrhy a takové pořadí?“ (obchod s trhy a mincemi, zlato a klenoty; šest plánů: konec smyšlených sousedů, trh bez mincí, vesničané a správce na trhu, kupci a mince, otroci, zlato): „Ano“. Co řekl Martin, je u bodu s datem; ostatní je návrh
Clauda. **Plán 1 (konec smyšlených sousedů) hotový 23. 11. 2026** (větev `feat/markets-1`, issue #11) – viz Rozhodnutí plánu 1. **Plán 2 (trh bez mincí) hotový 23. 11. 2026** (větev `feat/markets-2`, issue #11) – viz Rozhodnutí plánu 2. **Plán 3 (vesničané, správce, zakázky, lidé a sňatky se skutečnými sousedy) hotový 24. 11. 2026** (větev `feat/markets-3`, issue #11) – viz Rozhodnutí plánu 3. **Plán 4 (kupci a mince) hotový 26. 11. 2026** (větev `feat/markets-4`, issue #11) – viz Rozhodnutí plánu 4. **Plán 5 (otroci) hotový 26. 11. 2026** (větev `feat/markets-5`, issue #11) – viz Rozhodnutí plánu 5. **Plán 6 (zlato a klenoty) hotový 27. 11. 2026** (větev `feat/gold-6`, issue #13) – viz [gold.md](gold.md), Rozhodnutí plánu 6. Nahrazuje obchod se smyšlenými sousedy ([obchod](trade.md) – Sousedé, varianta a) a navazuje na rozpracovaný
návrh [sousedních vsí](neighbours.md), jehož body 2–8 Martin odložil právě do této kapitoly.

## Proč

Martin, issue #11 „Obchod“ (22. 11. 2026): „Hráč může vytvořit obchodní výpravu, určit co poveze a kam; Hráči bude mít
k dispozici určité informace o okolních vesnicích, zejména kdy tam kdo přijel s čím obchodovat. Časem by to mělo vést
k tomu, že vzniknout takzvané trhové vsi - místa, kde se v určitá období bude scházet víc obchodních výprav nabídka zboží
tak bude pestřejší a je větší pravděpodobnost, že tam hráči nakoupí či prodají to co potřebují; Obchodní stezka - po
obchodních stezkách budou jezdit karavany cizích obchodníků a budou prodávat či nakupovat luxusní zboží; Díky cizím
obchodníkům se do hry dostanou mince - obchodníci jimi budou platit za zboží“.

## Martinova rozhodnutí (22. 11. 2026)

- **Trh ve vsi:** na otázku, s kým výprava v cílové vsi obchoduje – s tou vsí, nebo s výpravami a kupci, kteří tam jsou:
  „Obojí ve vsi bude prostě přechodně víc nějakého zboží a bude jedno, jestli jsou kupců nebo té vsi. Příklad: Když
  z vesnice A přiženou do vesnice B stádo krav, tak se to přičte ke kravám, které už ve vesnici B byly. Pokud si kupci
  z vesnice C krávy koupí, tak se napřed pro uspokojení poptávky použijí krávy z vesnice B a pak až z vesnice A.
  Samozřejmě z vesnice B se použije jen tolik krav, kolik jich chce vesnice skutečně prodat“.
- **Jak dlouho a co s neprodaným:** „Výprava bude mít určeno, jak dlouho na místě zůstane. Po tu dobu bude samozřejmě
  pracovní síla chybět ve zdrojové vsi. Ideální je, když se na blízké lokální trhy bude jezdit každý týden a jen na jeden
  den, tj. ráno se vyrazí a večer vrátí, na vzdálenější výroční trhy se pojede déle tak bude lepší tam i déle zůstat. Vše
  ale závisí na hráči. Co se neprodá, berou si obchodníci zpátky domů“.
- **Cena a mince:** „Klidně ty mince můžeme navrhnout už teď. Mince (peníze obecně) jsou univerzálním nositelem hodnoty.
  Trh se tedy bude řídit nabádkou a poptávkou a každí zboží bude mít svou hodnotu vyjádřenou v mincích. Nezapomínej, že
  mince jsoi také komodita a tudíž jich může být hodně (inflace) nebo málo (deflace)“.
- **Odkud mince:** na otázku, zda má mít na začátku světa každá ves mince, nebo přijdou až s kupci a se zlatem: „Až
  s kupci. Slované začali razit vlastní mince až kolem roku 950“ (ražba – [zlato a klenoty](gold.md)).
- **Co kupci kupují:** „Cizí kupci nakupují zlato, šperky (tj. zlato, ale o polovinu dráž), med, vosk, kožešiny
  a otroky. Klidně to může být tak, že vojvoda vsi na kupecké stezce nakupuje všechny tyto komodity od okolních vsí aby
  je pak mohl sám výhodně prodat cizím kupcům“.
- **Co kupci prodávají:** „Prodávají meče, kroužkové košile a helmy. Později o třeba rozšíříme“.
- **Otroci:** na otázku, koho smí ves prodat jako otroka: „Zajatce a to ještě navíc pohany. Křesťany do lze usídlit ve
  vlastní vesnici, ale nelze je prodat“.
- **Co hráč ví o vsích:** „hráč bude mít někde přehled vesnic se vzdáleností a když si tu vesnici rozklikne, tak o ní
  uvidí nějaké základní info (přibližný počet obyvatel, domů, jaký řemesla ve vesnici jsou a právě kdy tam přijel jaký
  obchodník), které by se dozvěděl kdokoliv, kdo by v té vesnici zašel na pivo“.
- **Trhové vsi:** na otázku, zda má být trhová ves vyznačená, nebo vznikne sama: „Vznikne sama“.
- **Kupci na stezce:** na doporučení, že karavana jede po stezce několikrát do roka a v každé vsi u stezky se zastaví na
  den, kde je víc obchodníků déle: „Ano. Postupně to povede ke vzniku trhových vsí a měst na kupeckých stezkách“.
- **Vesničané a správce:** na otázku, zda mají vesničané sami jezdit na trh pro nástroje, keramiku a osivo: „Ano“;
  správce je NPC hráč – smí skoro vše co hráč (Martin 22. 11. 2026 u lovu: „Správce je vlastně NPC hráč, takže by měl
  mít možnost dělat téměř vše, co skutečný hráč“).
- **Platba, dokud nejsou mince:** na doporučení zápočtu přes celý trh v mincovní míře (každý prodá, co přivezl, a za
  utrženou hodnotu si vezme jiné zboží, i od někoho jiného): „ANo, přesně tak“.
- **Co nabízí a shání hostitelská ves:** na otázku, zda o tom má i ve vsi hráče rozhodovat výpočet potřeby (jako u dávek),
  nebo si to hráč nastaví sám (doporučení Clauda: výpočet, hráč řídí vlastní výpravy): „ano“.
- **Nákup výpravy:** na doporučení, že výprava dostane jen seznam, co prodat a co nakoupit, a obchoduje za cenu toho dne
  (bez cenových mezí): „ok“.
- **Města na stezkách:** na doporučení, aby na mapách podél kupecké stezky smějí vznikat i vsi synů a dalších hráčů
  (prémiovou výhodou zůstane brod nebo průsmyk): „ok“.
- **Spodní cena:** na otázku Clauda „Má mít prodávající spodní cenu, pod kterou neprodá?“ (bez dna cena při přebytku klesá
  o 10 % každý tržní den – po zhruba 140 dnech by si výprava odvezla 20 klád za 5 g sýra) Martin 23. 11. 2026 zvolil
  možnost „Ano, výchozí hodnota“ (popis možnosti od Clauda: „Nikdo neprodá pod tím, co má zboží ve hře cenu dnes (hodnota
  v obilí přepočtená na mince). Co se za tu cenu neprodá, zůstane hostiteli nebo si to výprava odveze domů. Nahoru roste cena
  volně.“).
- **Horní cena:** na otázku Clauda „Cena na trhu nahoru roste volně, jak jsi zvolil. Když ale ves obilí shání každý tržní
  den a nikdo ho nepřiveze, cena roste o 10 % denně bez konce. Po 50 tržních dnech je obilí 117× dražší, po 100 dnech
  13 800×, a kdo pak přiveze pár kil, odnese za ně obrovské množství zboží. Co s tím?“ (možnosti: „Cena se hýbe jen při
  obchodu“, „Strop 10× výchozí hodnoty“, „Nechat bez stropu“) Martin 23. 11. 2026 zvolil možnost „Nechat bez stropu“ –
  cena nahoru nemá mez, kód se nemění.
- **Otrok:** na otázku, zda jde zajatého pohana prodat jen hned po odvedení, nebo kdykoli, dokud je pohan: „Kdykoliv. Od
  zajetí bude prostě vedený jako otrok“.
- **Měšec kupců:** po shrnutí plánu 6 (kupec za průjezd koupí nejvýš 60 g zlata, protože má měšec 60 mincí) Martin 27. 11. 2026: „Kupcům neomezuj měšec.“ – viz Měšec kupců bez dna níž.
- Z návrhu [sousedních vsí](neighbours.md) (22. 11. 2026): sousedé jsou skutečné vsi – vsi rodu vzniklé odchodem syna
  při přelidnění i vsi jiných hráčů; ves bez spojení s okolím neobchoduje a lidé se berou mezi sebou, se sousedy je na
  náhodě, ze které dostupné vsi přijde ženich nebo nevěsta; „Řemeslníkovi je jedno, kdo mu platí za výrobky“.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** obchodní výpravu sestaví hráč (co veze, kam, jak dlouho zůstane) – správce a vesničané stejně (Martin).
- **Cíl:** trh je každá ves, kam výpravy jezdí; trhové vsi a města na kupeckých stezkách vzniknou samy (Martin).
- **Cíl:** ceny v mincích podle nabídky a poptávky, mince jako zboží – inflace a deflace (Martin).
- **Cíl:** mince přicházejí s cizími kupci na dálkových obchodních stezkách (Martin); zlato se mění za mince ([zlato
  a klenoty](gold.md)).
- **Ne-cíl (teď):** užití mečů, kroužkových košil a helem v boji – navrhne se s válkou (zbroj jako zboží ano).
- **Ne-cíl (teď):** další zboží kupců („Později o třeba rozšíříme“).
- **Anti-cíl:** smyšlený soused nebo trh jako nekonečný zdroj; zboží bez cesty a práce.

## Pravidla (návrh Clauda)

1. **Konec smyšlených sousedů:** obchod, nákupy u sousedů, výměna lidí, koně a kování od souseda jdou jen se skutečnými
   vsemi (neighbours.md); ves bez spojení s okolím neobchoduje (Martin) – ověří se přepočtem, že Vlkov bez obchodu přežije.
2. **Obchodní výprava:** hráč (správce, vesničané) zvolí cílovou ves ze známých vsí (přehled – bod 8), co prodat a co
   nakoupit (seznam, bez cenových mezí – Martin) a dobu pobytu; lidé a zvířata výpravy chybí doma po celou cestu a pobyt.
   **Cesta podle vzdálenosti** – k blízké vsi ráno tam a večer zpět, do vzdálenější přes víc map (Martin: „na blízké
   lokální trhy … ráno se vyrazí a večer vrátí“), po stezkách a krajinou (nosiči, vozy, dobytek po svých). Výprava prodá,
   co veze, za cenu toho dne a za utrženou hodnotu nakoupí ze seznamu, co jde; co se neprodá, vrátí se (Martin).
3. **Trh ve vsi:** zboží hostitelské vsi, které chce prodat (přebytek nad vlastní potřebou podle výpočtu potřeby jako
   u dávek – i ve vsi hráče, Martin „ano“), a zboží přítomných výprav a kupců tvoří jednu nabídku; kupující bere napřed
   zboží hostitelské vsi a pak přespolních (Martin), mezi přespolními v pořadí příjezdu. Co hostitelská ves shání,
   nakupuje stejně jako výpravy. Trh a jeho cenu drží stav hostitelské vsi; vsi se dopočítávají zvlášť, proto se
   výsledek obchodu (zboží, tržba) zapíše výpravě schránkou vsi a do vlastní vsi přijde s jejím návratem (návrh Clauda).
   Ves, kterou server zrovna dopočítává zpětně (nikdo ji nehraje), jede na trh až od chvíle, kdy je zase aktuální.
4. **Cena v mincích:** každé zboží má na každém trhu cenu v mincích, která se po každém tržním dni posune podle toho, kolik
   se ho žádalo a nabízelo (víc poptávky – dráž, víc nabídky – levněji); trh si pamatuje poslední cenu; cena nikdy neklesne pod výchozí (dno – Martin 23. 11. 2026, viz Martinova rozhodnutí – Spodní cena), nahoru roste volně. Mince jsou zboží:
   kde a když je jich v oběhu hodně proti zboží, ceny v mincích rostou (inflace), kde málo, klesají (deflace). Výchozí
   ceny pro první kupce z dnešních hodnot zboží v kg obilí (trade.md – Obchod) pevným kurzem (návrh Clauda, číslo
   v `rules`).
5. **Než přijdou mince:** platí se **zápočtem přes celý trh** v mincovní míře – každý prodá, co přivezl, a za utrženou
   hodnotu si vezme jiné zboží, i od někoho jiného (Martin: „ANo, přesně tak“).
6. **Cizí kupci:** karavany jezdí po dálkových obchodních stezkách kostry světa (world-skeleton.md) několikrát do roka;
   v každé vsi u stezky stojí den, kde se schází víc obchodníků, déle (Martin). Na mapách podél stezky smějí vznikat vsi
   synů i dalších hráčů (Martin „ok“). Kupec je tržní den ve vsi u stezky podle plánu, který je čistá funkce seedu světa,
   úseku stezky a roku (návrh Clauda) – ne putující karavana, kterou by svět posouval. Kupují zlato (přes šperkaře dráž – gold.md; po plánu 6
   první v seznamu, 1 000 g, měšec 60 mincí se nemění), med, vosk, kožešiny a pohanské zajatce; prodávají meče, kroužkové košile a helmy (Martin); platí a berou mince.
   **Zlato (plán 6, návrh Clauda – [gold.md](gold.md), Rozhodnutí plánu 6):** zlato se na trhu mění za mince 1:1 i s hostitelem, který mince má (kov za kov, ne útrata); objednanou zbroj hostitel kupcům doplatí napřed mincemi, pak i zlatem; hladina se počítá jen z mincí.
7. **Otroci:** zajatý pohan je od zajetí veden jako otrok a prodat ho jde kdykoli (Martin); zajatého křesťana jde usadit
   ve vlastní vsi, prodat ne (Martin). Děti otroka narozené ve vsi jsou svobodné; pokřtěný otrok zůstává otrokem, ale
   prodat ho už nejde – prodat smí jen pohana (návrh Clauda). Víra je víra člověka (`Person`), ne vsi.
8. **Přehled vsí:** hráč vidí vsi, o kterých jeho lidé vědí, se vzdáleností; po rozkliknutí přibližný počet obyvatel
   a domů, řemesla a kdy tam přijel jaký obchodník (Martin) – zpráva z doby, kdy tam naposled byl někdo z vlastní vsi
   (výprava, výjezd, obchodník, který přijel k nám), stárne s časem (návrh Clauda).
9. **Vesničané a správce:** vesničané jedou na nejbližší trh s řemeslníkem pro nástroje, keramiku, dřevěné nářadí, vozy
   a osivo, když se jim to vyplatí (dnešní rozhodování nákupu u sousedů); správce sestavuje výpravy jako hráč.
10. **Starší vsi:** smyšlení sousedé ze stavu zmizí; výpravy a nákupy na cestě k nim doběhnou (převod jednou).

## Rozhodnutí plánu 1 (návrh Clauda, 23. 11. 2026)

Plán 1 smazal smyšlené sousedy z jádra, převodu starších vsí i rozhraní; nic z toho nevrátí, dokud nepřijdou skutečné vsi a trhy (plány 2 a 3). Rozhodnutí níž jsou **návrh Clauda** – Martin je předem neschvaloval, jsou mu oznámená; kde se plán 1 chová jinak, než by čekal, je to uvedeno.

1. **Každá vazba na okolí skončí a vrátí se se skutečnými vsemi:** obchodní výprava hráče, výprava správce za obilím, nákup nástrojů, keramiky, dřevěného nářadí a vozů 15. 11., nákup osiva 1. 9. a 1. 3., cesta tesaře pro kování vozů, cizí kovář ke koním, nevěsta a ženich z okolí, další manželky mužů rodu, výměna lidí, železo (hřivny) jako platba a zlý rok kraje u zásob sousedů. Zůstává: koně se stavbou první ohrady, mistři huti a kněz (přicházejí na pozvání z dálky), obchod mezi hráči jednáním, zásilky vazalů, zemská stezka, právo `trade` v seniorátu a zdražení zboží v kraji po zlém roce (`goodWorth`).
2. **Přes skutečnou ves jde už teď jen popisek konce cesty** na kraji mapy („Cesta do <ves>“ podle vlastní vsi na sousední mapě, jinak „Cesta na sever“) – je to jen pohled. Cokoli dalšího potřebuje, aby druhá ves zboží nebo člověka opravdu dala a vzala, a to staví plán 2.
3. **Hráč přestane vidět** tlačítko Obchod a panel obchodu, v panelu dvorce ukáže řádek výrobků jen vlastní dílnu (jinak zašedlou ikonu „<výrobek> – ve vsi není řemeslník“; stojí-li vlastní dílna bez vstupu, důvod textem upozornění – „Nástroje – Kovář nemá uhlí“) a v panelu dílny zmizí „vesničané dokupují u souseda“; upozornění „Nevěsta z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“ a „Vesničané koupili …“ už nepřijdou, staré zápisy zůstanou v kronice.
4. **Na cestě doběhne** (bod 10 Pravidel): výprava k sousedovi přinese zboží, dobytek, koně i lidi, nákup výrobky a vůz, cesta pro kování dokončí vůz; karavana a kronika jmenují dřívějšího souseda (`legacyNeighbourName`). Starší vsi se převedou jednou a idempotentně.
5. **Soubory se přejmenovaly, kde by jméno lhalo:** `trade/neighbours.ts` na `trade/goods.ts`, `fields/seed-buying.ts` na `fields/seed-reserve.ts`, `SEED_BUYING` na `SEED_RESERVE`.
6. **Odpověď na Otázku „další manželky mužů rodu“:** další manželky (2.–4.) mužů rodu z okolí do plánu 3 nepřibývají a náhrada ze vsi se nezavádí. Výměna lidí je podle Pravidel 1 jen se skutečnými vsemi a ze vsi by to bylo nové pravidlo, o které Martin nežádal; sonda Vlkova (D118) měřila bez nich a rod roste. Není to Martinova odpověď – Martinovi se oznamuje; je-li to špatně, rod roste do plánu 3 pomaleji a doplnit manželky ze vsi je malá změna v `dynasty-wives.ts`.
7. **Kovář bez dřevěného nářadí čeká ≈ den na konci cyklu milíře** (přijatý důsledek; číslo `CHARCOAL_BALANCE` se nemění). Dřívější přípravek (nářadí od souseda) to maskoval; jde-li o víc než den na cyklus, rezerva je jedno číslo v `rules`.
8. **Ves se správcem bez nástrojů a osiva z obchodu má po 20 letech menší pole:** zlatá ves vychází na ≈ 24 ha místo ≈ 34 (mez testu 22 ha přijata), 1. 3. 505 chybí ≈ 147 kg osiva a plánů lnu ubylo ze 163 na 148. Je to herní důsledek konce nákupů, zvláštní sonda osivo × nástroje se nedělá; menší cíl polí vsí bez kováře se napraví nákupem na trhu v plánu 3.

## Rozhodnutí plánu 2 (návrh Clauda, 23. 11. 2026)

Plán 2 přidal trh ve vsi, výpravu na trh a přehled vsí, ale ještě bez mincí a kupců (plány 3 a 4). Rozhodnutí níž jsou **návrh Clauda** – Martin je předem neschvaloval, jsou mu oznámená, kromě těch, kde je jeho slovo doslova (doba cesty, spodní cena); kde se trh chová jinak, než by hráč čekal, je to uvedeno. Čísla jsou v `MARKET` (`rules-market.ts`).

1. **Výprava stojí na karavaně a schránce vsi** (zásilka mezi skutečnými vsemi), ne na výpravě po taktech. **Válka obchod nezakazuje** – podmínku „v nepřátelství se neobchoduje“ z podkladu neighbours.md Martin neschválil, výprava jede i do vsi, s níž je hráč ve válce.
2. **Doba cesty** (Martin 22. 11. 2026: „ráno se vyrazí a večer vrátí“): cesta tam trvá max(0, políčka − `MARKET.dayTripCells`) × `MARKET.daysPerCell` dní (`dayTripCells = 1`, `daysPerCell = 1`, pobyt nejméně `MARKET.minStayDays = 1`). Ves na sousední mapě je ráno tam a večer zpět, každá další mapa přidá den tam a den zpět. **Doprovod jezdce výpravu na trh nedoprovází** – nemá zemskou stezku (horses.md – Doprovod výpravy) a jezdec by chyběl v hlídce polí.
3. **Model ceny:** výchozí cena z hodnoty zboží, kurz 15 kg obilí za minci (`MARKET.grainKgPerCoin`), po tržním dni posun o nejvýš ±10 % (`MARKET.priceStep = 0,1`); **dno ceny je výchozí hodnota** (Martin 23. 11. 2026, viz Martinova rozhodnutí – Spodní cena).
4. **Řídký trh bez mincí.** Zápočet je výměna zboží za zboží (vyrovnaný barter v mincovní míře každý tržní den, nic se nepřenáší do dalšího dne). Hostitel bez potřeby nic neprodá a výprava prodá jen za to, co má trh na seznamu (co hostitel shání, ale i co chce jiná výprava – výpravy smějí obchodovat i mezi sebou, ne jen s hostitelem); trh zůstane řídký, dokud nepřijdou mince (plán 4).
5. **Co hostitel nabízí a shání:** jen makrokomodity (obilí, krávy, voli, koně, klády, kámen). **Klády a kámen hostitele jdou na prodej celé hromady.** Kámen se veze jako u zásilky – 2 lidé na započatých 800 kg (posádku počítá `marketCrew`, `legCrew`). **Prodaní tažní voli vůz výpravy netáhnou** (vůz domů jede bez spřežení, které výprava prodala). **Nosiči se berou jen z volných lidí vsi** – kdo už má práci, na trh nejede.
6. **Oběh mezi vsemi:** **zboží od pozdního hostitele může přijít po lidech** – hostitel pozadu s dopočtem znamená čekat; lidé jsou doma v plánovaný den, zboží a zpráva přijdou, až hostitel výsledek zapíše. Zanikl-li hostitel, vrátí se výprava s tím, co drží.
7. **Zpráva na pivo ukáže posledních 10 obchodníků** (`MARKET.report.traders = 10`). Je to **technický strop, ne pravidlo hry** – stav vsi nesmí růst donekonečna, hostitel si proto pamatuje jen posledních 10 příjezdů. Lidé a domy se hlásí zaokrouhleně na 5 (`MARKET.report.round = 5`, nejméně 5, je-li aspoň jeden); **domy jsou včetně opuštěných**. Jiný strop (třeba časový) je jedno číslo.

## Rozhodnutí plánu 3 (návrh Clauda, 24. 11. 2026)

Plán 3 vrátil to, co plán 1 vzal – nákupy vesničanů, výpravy správce, kování koní u kováře souseda, výměnu lidí a sňatky – a postavil to na trhu se skutečnými sousedy (plán 2). Rozhodnutí níž jsou **návrh Clauda**, kromě dvou odpovědí Martina; co hráč pocítí a mění dřívější pravidla, je Martinovi oznámené (konec oddílu).

**Martinova rozhodnutí k plánu 3** (otázka je Claudova, popis možnosti je text Clauda, Martinovo slovo je jen název zvolené možnosti):

- **Nevěsty (23. 11. 2026).** Claude se zeptal: „Má si i svobodná žena, která nedrží dům, hledat ženicha v sousední vsi sama, nebo se jen vdá pryč, když se na ni zeptá muž odjinud?“ Martin zvolil možnost **„Jen se vdá pryč“**. Popis možnosti od Clauda: „Ženicha hledá muž, nevěsta jde k němu jako při svatbě ve vsi. Sama se ptá jen vdova a dcera z domu bez mužů, jak jsi rozhodl 19. 10. 2026.“ ([příbuzenství](kinship.md) – Sňatky)
- **Platba řemeslníkovi (24. 11. 2026).** Claude se zeptal: „Má řemeslník (kovář, hrnčíř, tesař) za své výrobky brát obilí vždy, i když ho jeho ves zrovna neshání?“ Martin zvolil možnost **„Ano, řemeslník bere obilí vždy“**. Popis možnosti od Clauda: „Za své výrobky vezme obilí (a luštěniny) vždy, živí se řemeslem. Vesničané si pak nástroje, keramiku a dřevěné nářadí koupí za obilí jako dřív u smyšlených sousedů, jen u skutečného řemeslníka.“ ([řemesla](crafts.md) – Nákup u sousedů)

**Rozhodnutí plánu (návrh Clauda):**

1. **Okolí vsi** (`VillageState.nearby`): vsi na 8 sousedních mapách (i jiného hráče, válka nevadí – plán 2, Rozhodnutí 1), žijící, se sídlem. Snímek se zapisuje **v pevné dny kalendáře po 30 dnech** (`NEARBY_REFRESH_DAYS`, události schránky před dopočtem přes tento den) – **technická mez, ne pravidlo:** ves se o nové vsi dozví nejvýš s měsíčním zpožděním, stav neroste a den snímku nezávisí na dávkách dopočtu. Použité snímky ve schránce se po roce mažou spolu s použitými zprávami bez nákladu – dotazy na kováře a partnera, ohlášení zakázky (`NEARBY_KEEP_DAYS` = 365, také technická mez; závěrečná kontrola, návrh Clauda).
2. **Ves ví o řemeslech sousedů jen ze zpráv na pivo**, stejně jako hráč; bez zprávy k řemeslníkovi nejede (osivo, obilí a sňatky zprávu nepotřebují).
3. **Všechno jede výpravou na trh** a výsledek se vrací domovské vsi: výrobky, vozy, osivo, hřivny (vesničané), obilí v nouzi a potřeba vsi (správce), kování (kovář), lidé (hráč, správce), nevěsta, ženich a další manželka (ves partnera). Dotaz a ohlášení zakázky jsou zprávy bez nákladu.
4. **Výrobky dílen a lidé jsou zboží trhu**, hodnoty v kg obilí: nástroje 60 za kg, dřevěné nářadí 2, vůz dvoukolák 320 a čtyřkolák 640 za kus, svobodný dospělý 360 za kus a **rodina 720 za kus bez ohledu na počet dětí** (dva dospělí, děti v ceně – trh zná jednu cenu za kus). Vozy se prodávají od nejmladšího volného; prodaný vůz nese stáří prodejce, neprodaný se vrátí se stářím, které měl. **Voli táhnou koupený vůz domů** a jdou s výpravou.
5. **Dvoufázový tržní den:** napřed řemeslníci vezmou **obilí a luštěniny jen za výrobky** do hodnoty prodaných výrobků (Martin 24. 11. 2026 – řemeslník bere obilí vždy), pak běží dnešní zápočet beze změny. Hostitel jinak prodá jen to, co shání (plán 2, Rozhodnutí 4); jídlo se do nabídky nepřidává.
6. **Zakázky:** výprava s nekoupeným výrobkem dílny zapíše hostiteli zakázku **při odjezdu**, platí se **při vyzvednutí** – odchylka od [neighbours.md](neighbours.md) (Pravidla 6): zápočet bez mincí nezná dluh ani platbu předem. Řemeslník vyrábí do vlastní potřeby plus otevřené zakázky; **hotovou zakázku nic nedrží – kdo dřív zaplatí, ten kus má**. Zakázka vyprší po `MARKET.orderDays` = 365 dnech – **technická mez, ne pravidlo** (kupující mohl zaniknout, stav nesmí růst donekonečna).
7. **Vesničané na trhu:** 15. 11. nástroje, keramika, dřevěné nářadí a vůz (koupí jen, co ušetří víc práce, než stojí), 1. 9. a 1. 3. osivo, kdykoli tesař pro hřivny na kování vozu, a pro hotovou zakázku. **Osivo jde do rezervy** – koupené obilí ves nesní, zbytek jde do zásob. **Cíle se střídají:** ves zkouší nejbližší ves se zprávou o řemeslníkovi, zakázku, kterou ves nevzala, rok nehledá. **Víc ves koupí příští cestou** (návrh Clauda, závěrečná kontrola): nákup, na který nezbylo místo (i když ho zabral dřívější nákup téže výpravy), a zbytek, který výprava neunesla, jede další cestou, až se lidé vrátí – ne za rok; co veze výprava na cestě, se znovu nekupuje. Zbytek osiva jede další cestou, jen když místo vzaly jiné nákupy dne. Zakázka u vsi mimo okolí nákup neblokuje.
8. **Správce na trhu** (Martin 22. 11. 2026: „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“): obilí v nouzi s rotací cílů (vsi, odkud se vrátil s prázdnou, vynechá do nového okolí; počet pokusů o přizpůsobení výpravy `FIT_TRIES` = 4 je technická mez) a **roční výprava 15. 11.** s tím, co ves nabízí a shání, cílem střídaným po letech – oznámeno Martinovi.
9. **Kovář souseda ke koním:** ves se ptá nejbližší vsi s kovářem, další dotaz po vypršení jde jiné vsi; vsi, které kováře neposlaly, vynechá do nového okolí jako správce v bodě 8 – nejvýš jeden dotaz na ves s kovářem za 30 dní (závěrečná kontrola, návrh Clauda: dřív se ptala každé ~4 dny, 84 dotazů za herní rok); kovář jde sám, jeho kovárna ty dny nekuje; poplatek = práce kováře × **den řemeslníka 4 kg obilí** (místo ceny jídla v práci vsi) + hřivny – oznámeno Martinovi ([koně](horses.md) – Kování).
10. **Lidé na trhu:** kdo smí odejít, vybírá `emigrantGroups`; hráč a správce posílají, vesničané ne. Hostitel shání lidi, když je půdy víc než práce. Výprava a prodej sdílejí rozpočet lidí: **rodiny napřed, pak svobodní muži a ženy** (návrh Clauda, oznámeno).
11. **Sňatky se skutečnými sousedy:** Martin 23. 11. 2026 „Jen se vdá pryč“ (viz výše). Ptá se muž (≈ 30 % ročně) a vdova či dědička (≈ 50 % ročně) od 18 let, kteří ve vsi nemají s kým; **sňatek se hledá jen ve vsi, kde je vhodný svobodný** (údaj `singles` v okolí, žádný slepý los); partner jde sám (bez dětí), nevěsta k muži, ženich k vdově.
12. **Další manželky mužů rodu se vracejí ze skutečných sousedních vsí** (plán 1, Rozhodnutí 6 je nevracel) – oznámeno Martinovi.
13. **Nikdo nesmí zmizet:** zaniklý hostitel vrátí výpravu i s lidmi; lidé z výsledku pro zaniklou domovskou ves **zůstanou u hostitele** – prodaní se mu vrátí s původními id, ostatní se u něj usadí – oznámeno Martinovi. **Jediná přijatá ztráta: zanikl-li i hostitel (oba konce jsou mrtvé).** Zprávy bez nákladu do zaniklé nebo spící vsi se zahodí.
14. **Rozhraní:** panel Trh nabídne nové zboží s existujícími ikonami; kronika a upozornění řeknou, kdo a kam jel. **Cizí správce nevidí jména ostatních vsí držitele** – web napíše „sousední ves“.
15. **Převod stavu žádný** – nová pole jsou volitelná, nové druhy kroniky mají volitelné jméno vsi.

**Oznámit Martinovi** (návrhy Clauda, které vracejí nebo mění pravidla):

1. Další manželky mužů rodu se vracejí ze skutečných sousedních vsí (bod 12).
2. Správce jednou ročně 15. 11. jede na trh s tím, co ves nabízí a shání (bod 8).
3. Zakázka se zapíše při odjezdu výpravy, platí se při vyzvednutí – odchylka od neighbours.md, Pravidla 6 (bod 6).
4. Poplatek kováře souseda počítá den řemeslníka 4 kg obilí místo ceny jídla v práci vsi (bod 9). **Čísla:** jeden kůň u sousední mapy (cesta 0 dní, pobyt 1 den) stojí 28,5 kg obilí za návštěvu = práce (0,5 čd kování + 0 dní cesty + 1 den pobytu) × 4 kg + hřivny 0,5 kg × 45 kg; vlastní kovář by stál 0,5 čd × 4 kg + 22,5 kg hřiven = 24,5 kg. Kovář souseda je tak ~1,16× dražší – „násobně“ (Martin 26. 10. 2026: „bude to násobně dražší, protože musí přijít“) jen u práce (1,5 proti 0,5 dne, 3×), cenu drží hřivny. Dva koně: 53 kg. Ves kováře ho posílá každých 60 dní (termín kování) + 2 dny.
5. Lidé z výsledku pro zaniklou domovskou ves zůstanou u hostitele – prodaní se mu vrátí, ostatní se u něj usadí (bod 13).
6. Výprava a prodej lidí sdílejí jeden rozpočet lidí – rodiny napřed, pak svobodní muži a ženy; nabídka se ubírá, dokud ves bez odcházejících stačí na svou půdu (`keepLabor`) (bod 10).

## Rozhodnutí plánu 4 (návrh Clauda, 25. 11. 2026)

Plán 4 přivedl na trh mince a cizí kupce na dálkových stezkách: mince jako zboží, mincovní fázi tržního dne vedle zápočtu, cenovou hladinu, kupce jako tržní den ve vsi u stezky, zbroj jako zboží, objednávku zbroje hráče, vsi synů na stezkách a úklid pošty. Rozhodnutí níž jsou **návrh Clauda**, kromě odpovědí Martina; co hráč pocítí a mění dřívější pravidla, je Martinovi oznámené (konec oddílu).

**Martinova rozhodnutí k plánu 4** (otázka je Claudova, popis možnosti je text Clauda, Martinovo slovo je jen název zvolené možnosti):

- **Zbroj u kupců ve vlastní vsi (25. 11. 2026).** Claude se zeptal: „Plán 4 (kupci a mince): kupci na stezce prodávají meče, kroužkové košile a helmy. Co ves na trhu nakupuje, rozhoduje dnes výpočet potřeby, a zbroj ves sama k ničemu nepotřebuje. U kupců, kteří stojí na trhu ve tvé vlastní vsi, by si ji tedy nekoupila. Jak má hráč zbroj od kupců ve vlastní vsi koupit?“ Martin zvolil možnost **„Hráč zadá počet“**. Popis možnosti od Clauda: „V panelu Trh své vsi u stezky nastavíš, kolik mečů, košil a helem chceš. V den kupců je ves koupí za své mince, dokud na ně má.“ (bod 15)
- **Kdo utrácí mince (25. 11. 2026).** Martin: „Tam je hlavně špatný předpoklad, že vesničané utrácejí mince. Za co by asi tak oni utráceli mince?“ Claude pak popsal model (mince utrácí jen hráč na výpravě a u kupců ve své vsi za objednanou zbroj a správce na výpravách; ves je jen přijímá a na trhu dál mění zboží za zboží; vesničané platí obilím) a zeptal se, zda to tak zapsat. Martin: **„Mince utrácí jen vojvoda/správce“** (bod 4).
- **Odchod celé vsi (25. 11. 2026).** Claude se zeptal, zda mince a zbroj opuštěné vsi odejdou s lidmi, nebo zůstanou jako ostatní zásoby. Martin: **„Pokud se lidéí někam stěhují, berou si úplně vše. Jaký by to jinak dávalo smysl?“** (výňatek; [stěhování](migration.md) – Odchod do nové vsi). Obecné pravidlo zavedla samostatná oprava před plánem 4, mince a zbroj do ní jen přibyly (bod 9).
- Dřívější Martinova slova k plánu 4 jsou v oddílu Martinova rozhodnutí (22. a 23. 11. 2026): odkud mince, co kupci kupují a prodávají, kupci na stezce, města na stezkách, spodní cena („Ano, výchozí hodnota“) a horní cena („Nechat bez stropu“).

**Rozhodnutí plánu (návrh Clauda):**

1. **Mince jsou zboží** – kus, celé číslo (`VillageState.coins`), prodej a nákup jako u ostatního zboží; výchozí cena 1 mince = 15 kg obilí (`MARKET.grainKgPerCoin`). Mince nic neváží (nepřidají nosiče), v zápočtu nejsou a na seznam „Dostaneš“ se nedávají – prodávající je bere za cokoli, co nabízí.
2. **Mincovní fáze tržního dne** jde až po zápočtech řemeslníků a trhu, které zůstávají beze změny. Nemá-li mince k útratě nikdo, nespustí se a trh je bit po bitu jako v plánu 2. Platba za dvojici je celé číslo mincí (zaokrouhleno nahoru), prodávající neprodá pod cenou. **Hostitel prodá za mince všechno, co nabízí** (i bez toho, co shání) – oznámeno Martinovi.
3. **Cena v mincích = relativní cena trhu × cenová hladina.** Hladina (od 1 nahoru bez meze – spodní a horní cena podle Martina 23. 11. 2026) se po mincovní fázi posune nejvýš o `MARKET.priceStep` podle poměru mincí k útratě a hodnoty zboží, které by za ně kupující chtěli a které na trhu je; **nehýbe se, není-li na trhu nic z toho, co kupující shánějí**. Cena zboží a hladina se hýbou zvlášť, v mincích tak cena za tržní den vzroste nejvýš o 21 %. V den, kdy kromě hostitele nestojí na trhu žádná výprava, se hýbou jen ceny zboží, které kupci vezou nebo shánějí, a poptávka kupců zdražuje jen zboží, které je ten den na trhu ke koupi; dny s výpravou beze změny. Z objednávky zbroje se do hladiny počítá nejvýš zbroj, kterou kupci ten den opravdu mají. Technická mez ceny 1e9 × výchozí je proti `Infinity`, ne pravidlo.
4. **Mince utrácí jen hráč a správce** (Martin 25. 11. 2026). Hráč výpravou (co neutratí, přiveze zpět) a objednávkou zbroje; správce obilí v nouzi napřed mincemi a roční výpravou 15. 11., kterou nakládá od nejdražšího zboží na kg (`STEWARD.grainPayment` s mincemi první) a seznam zkrátí na to, co lidé a vozy unesou domů. Vesničané ani trh vsi mince neutratí – ves je hromadí. Výprava vesničanů v mincovní fázi smí své zbytky prodat za mince (jdou domů), ale nekoupí nic. Na zbroj se nic neodkládá. Oznámeno Martinovi.
5. **Cizí kupci jsou tržní den ve vsi u stezky**, čistá funkce seedu světa, spojení stezky a roku – ne putující karavana. `MERCHANTS.passesPerYear` = 4 průjezdy za rok a spojení, měšec 60 mincí (od 27. 11. 2026 bez dna – Měšec kupců bez dna níž), zboží 2 meče, 1 kroužková košile a 2 helmy, seznam 100 kg medu, 24 kg vosku a 60 kožešin, pobyt den, při 3 výpravách na trhu (`busyVisitors`) další den, nejvýš 3 dny (`maxStayDays` – pravidlo hry, Martin strop nejmenoval). Kupci jsou strana zápočtu i mincovní fáze; při odjezdu měšec i zboží zmizí ze světa (kupci jsou cizí, domov nemají). Kupec na trhu zaniklé nebo opuštěné vsi odjede se vším, co má. Mince vznikají jen příjezdem kupce a zanikají jeho odjezdem. Kronika ohlásí příjezd jen poprvé v herním roce, upozornění „Kupci přijeli“ přijde za každý den příjezdu.
6. **Hostitel nabízí med, vosk a kožešiny nad vlastní potřebu** (plán 2 je vynechal) – i v zápočtu ostatním vsím. Vosk celý, kožešiny nad roční potřebu domácností, med nad roční příděl a jen s obilím nad dva roky zásob (hides-honey.md – Obchod).
7. **Meče, kroužkové košile a helmy jsou jen zboží** (`VillageState.arms`), účinek v boji přijde s válkou vlastní mechanikou (Martin 2. 11. 2026, war.md – Výzbroj). Ceny podle Lex Ribuaria 40, 11 (meč 3 solidy, helma 6, byrnie 12; vůl 2 solidy = 1 200 kg obilí): meč 1 800 kg (120 mincí), helma 3 600 kg (240), kroužková košile 7 200 kg (480) – zdroj v [rešerši](research/2026-10-18-trade-values.md).
8. **Co kdo ví:** ves u stezky ví den příštích kupců a řekne ho každému, kdo přijde „na pivo“; zpráva obchodníků zahrnuje i kupce (bez jména vsi). Hladinu cíle nese zpráva o vsi s cenami.
9. **Oběh mincí a zaniklé vsi:** mince jdou mezi vsemi jen poštou plánu 2. Zanikne-li domovská ves, když je výsledek s mincemi na cestě, jdou mince zpět hostiteli (zboží se zahodí jako dřív); jediná přijatá ztráta je zánik obou vsí. Odejdou-li všichni, berou si i mince a zbroj (Martin 25. 11. 2026); odejde-li část lidí nebo syn, zůstávají ve vsi, kde se žije dál. Odchod celé vsi se odkládá do návratu výpravy z trhu a zůstanou jen stavby, pole, sad, hřbitov a hromady klád a kamene.
10. **Úklid pošty:** použité řádky příjezdu a výsledku výpravy se po `MAIL_KEEP_DAYS` = 365 dnech mažou, jen když je odesílatel o rok dál a výprava je u něj vyřízená (`VillageDigest.openTrips`) – jinak by se po pádu serveru a přeskoku roku mince zdvojily; `stranded-people` se nemaže nikdy. Technická mez, ne pravidlo.
11. **Vsi synů na stezkách:** ves syna i nová ves hráče při odchodu smějí vzniknout na mapě, kterou vede stezka bez řeky, s hotovou zemskou stezkou; sídla hráčů se nemění (Martin 22. 11. 2026: „ok“ platí pro vsi synů, část „a dalších hráčů“ plán 4 neplní – potřebovala by úpravu generátoru prémiových krajin). Ves na cestě (lidé jdou na novou mapu) není v okolí vsí – výpravy do ní nejezdí; výprava, jejíž příjezd hostitel přeskočil, se vrátí domů se vším (oprava chyby plánu 3).
12. **Rozhraní:** mince v „Dáš“ (po 10), ne v „Dostaneš“; ceny v mincích s hladinou; kupci na trhu a den příštího příjezdu; zásoba mincí a zbroje v panelu dvorce; kronika a upozornění o kupcích. Web nic nepočítá.
13. **Převod stavu:** jen `merchant-stops` na konci `VILLAGE_MIGRATIONS`, při načtení vsi; ostatní nová pole jsou volitelná.
14. **Pořadí úloh:** 16 úloh od zboží po tento dokument; úlohy jdou po sobě.
15. **Objednávka zbroje u kupců ve vlastní vsi** (Martin 25. 11. 2026: „Hráč zadá počet“; podrobnosti návrh Clauda): `VillageState.armsOrder`, celé kusy; v den kupců ves koupí za mince, které má i které týž den utržila, za cenu dne s hladinou, v pořadí meče, košile, helmy, dokud stačí mince a kupec zboží má; zbytek čeká na další kupce. Do zápočtu, `marketStance`, `nextPrices` ani výhledů správce nepatří. Zadat ji smí jen živá ves se zastávkou kupců.

**Oznámit Martinovi** (návrhy Clauda, které mění pravidla):

1. Hostitel prodá za mince všechno, co nabízí, i bez toho, co shání – lidi, dobytek, koně, nástroje, výrobky, vozy, klády a kámen (bod 2).
2. Mince utrácí jen hráč a správce (Martin 25. 11. 2026); správce smí na výpravě utratit i mince, které hráč šetří (bod 4).
3. Hostitel nabízí med, vosk a kožešiny nad vlastní potřebu, tím i v zápočtu ostatním vsím; med jen s obilím nad dva roky zásob (bod 6).
4. Cenová hladina trhu: víc mincí než zboží zdražuje o nejvýš 10 % za den, méně zlevňuje k výchozím cenám; cena zboží a hladina dohromady za tržní den až o 21 % (bod 3).
5. Kupci 4× do roka, 60 mincí, 2 meče, 1 kroužková košile, 2 helmy, nákup až 100 kg medu, 24 kg vosku a 60 kožešin, na rušném trhu nejvýš 3 dny – strop je pravidlo hry, Martin ho nejmenoval (bod 5).
6. Ceny zbroje podle Lex Ribuaria: meč 120 mincí, helma 240, kroužková košile 480, bez účinku v boji (bod 7). Z měšce 60 mincí za průjezd vychází meč za dva plné průjezdy, kroužková košile za osm. **Výsledek ověření (26. 11. 2026, Co se ověří):** ves T u stezky s medem, voskem a kožešinami koupila objednaný meč druhý den kupců za 120 mincí a hladina za tři roky stoupla nejvýš na 1,09; Vlkov s uměle přidanou zastávkou (kupcům skoro nic neprodá) má po 10 letech 1 085 mincí a hladinu 2,9, meč by tam stál ≈ 350 mincí. Hladina tak roste hlavně tam, kam kupci vozí mince a nemají co koupit – záměr (inflace, bod 3).
7. Objednávka zbroje u kupců ve vlastní vsi: ves ji koupí v den kupců za cenu dne s hladinou, i za mince týž den utržené (bod 15).
8. Vsi synů a nové vsi hráče při odchodu smějí vznikat na mapě se stezkou bez řeky (bod 11); vsi dalších hráčů na stezkách zůstávají na později. Vlkov neleží na stezce – kupce uvidí až vsi synů na mapách stezek.
9. Mince z výsledku pro zaniklou domovskou ves jdou hostiteli; starší řádky pošty se po roce mažou (body 9 a 10).
10. Při odchodu části lidí nebo syna zůstávají mince a zbroj v mateřské vsi; odejdou-li všichni, berou si úplně vše (Martin 25. 11. 2026, bod 9). Zda s celou vsí odejdou i hromady klád a kamene, se Martin nevyjádřil (stěhování – Otevřené).
11. Správce nakládá roční výpravu od nejdražšího zboží na kg a seznam zkrátí na to, co unesou domů (bod 4).
12. V den, kdy na trhu stojí jen kupci, se hýbou jen ceny zboží kupců a kupci zdražují jen to, co je na trhu ke koupi (bod 3).
13. Výprava vesničanů v mincovní fázi smí zbytky prodat za mince, ale nekoupí nic; kupec na trhu zaniklé vsi odjede se vším (body 4 a 5).

**Otázky na Martina:** žádné otevřené.

## Rozhodnutí plánu 5 (návrh Clauda, 26. 11. 2026)

Plán 5 přivedl na trh otroky: příznak odvedeného pohana, otroky jako zboží (každý se prodává sám), nákup cizími kupci, prodej ve vlastní vsi nabídkou počtu, rozhraní a test světa. Rozhodnutí níž jsou **návrh Clauda**, kromě odpovědí Martina; co hráč pocítí a mění dřívější pravidla, je Martinovi oznámené (konec oddílu).

**Martinova rozhodnutí k plánu 5:**

- **Rodina otroka (26. 11. 2026).** Claude se zeptal: „Z nájezdu přivedeš pohanskou rodinu: muže, ženu a dvě malé děti (3 a 5 let) – všichni čtyři jsou tvoji otroci. Za rok se jim ve vsi narodí další dítě, to je svobodné. Když pak ženu pošleš prodat kupcům, co se stane s mužem a dětmi?“ (možnosti: každý se prodává sám – doporučení; matka i s malými dětmi; celá rodina spolu; každý sám, děti až od 16). Martin: **„Moc to řešíš. Otroci nejsou rodina, ale zboží“** – každý otrok se prodává sám, i malé dítě (bod 6).
- Dřívější Martinova slova k plánu 5 jsou v oddílu Martinova rozhodnutí (22. 11. 2026: koho smí ves prodat, „Kdykoliv“, co kupci kupují) a u války (18. 10. a 2. 11. 2026: odvedení, výkupné); „Hráč zadá počet“ a „berou si úplně vše“ jsou z 25. 11. 2026 (plán 4).

**Rozhodnutí plánu (návrh Clauda):**

1. **Otrokem je odvedený pohan** (`Person.slave`) od chvíle, kdy ho vojsko přivede do vsi (`settleLed`); na cestě je kořist tažení. Zajatí muži rodu a šlechtici (`Prisoner`) otroky nejsou a kupcům se zatím neprodávají. Odvedený křesťan se usadí jako dřív, bez příznaku.
2. **Pokřtěný otrok zůstává otrokem, ale prodat ho nejde** (`canBeSold` – ne křesťan, muž rodu ani šlechtic); obrácení příznak nemaže.
3. **Otrok ve vsi je vesničan:** pracuje, jí, bydlí, žení se, rodí, stěhuje se s ostatními a příznak si nese všude (sňatek do sousední vsi, odchod, výprava). Děti narozené ve vsi jsou svobodné.
4. **Otroci jako zboží `slaves`:** kus je jeden člověk, hodnota 360 kg obilí (24 mincí), nic nenesou. Prodat jde otrok-pohan, který je doma a není manželkou muže rodu; od nejnižšího id (kdo přišel dřív). **Každý se prodává sám** (Martin 26. 11. 2026) a prodej rozvede manželství jako smrt; `emigrantGroups` bere otroky napřed a `PEOPLE_GOODS` začíná `slaves`.
5. **Kupci:** `MERCHANTS.wants.slaves` = 10 za průjezd; kupují za mince z měšce i zápočtem (zbroj za otroky). V mincovní fázi kupují od prodávajících po řadě (hostitel, pak výpravy podle příjezdu) a u každého v pořadí `TRADE_GOODS` – med, vosk a kožešiny před otroky. Koupení otroci odjedou s kupci ze světa. V den bez nabízených otroků je trh bit po bitu jako po plánu 4.
6. **Prodej hráče:** výpravou (otroci v „Dáš“) i ve vlastní vsi nabídkou `VillageState.slavesForSale` (počet, vzor `armsOrder`). Otroci z nabídky jsou rezervovaní – jedna množina spočtená jednou z celé vsi platí pro nabídku, prodej, mincovní fázi i výpravu správce.
7. **Správce otroky neprodává ani nekupuje**, nabídku nezadává ani nepřepisuje; ves správce a NPC rodu je proto kupcům nenabídne (Oznámit 7).
8. **Pošta a zaniklé vsi** beze změny plánu 3: prodaný otrok se u kupující vsi usadí jako otrok s novým id, neprodaný se vrátí s původním id a bez manžela; zanikne-li ves kupujícího, jde otrok zpět k hostiteli.
9. **Rozhraní:** odznak „Otrok“ v panelu osoby, počet otroků v panelu dvorce, otroci v „Dáš“ a „Dostaneš“ panelu Trh a prodej ve vlastní vsi; ikona otroka se liší od ikony zajatce. **Kronika:** zápis `led-settled` a upozornění v obecném mužském rodě, bez nul.
10. **Převod stavu žádný:** nová pole jsou volitelná; odvedení usazení před plánem 5 zůstávají svobodní.
11. **Pořadí úloh:** 1 příznak, 2 ikona, 3a–3b zboží, 4 mezi vsemi a manželství, 5 kupci, 6a–6b prodej ve vlastní vsi, 7 web, 8a–8b náhled výpravy, panel Trh a e2e, 9 test světa a Vlkov, 10 návrhy (rozhodnutí 1–13 plánu `docs/superpowers/plans/2026-11-26-markets-5-slaves.md`).

**Oznámit Martinovi** (návrhy Clauda, které mění pravidla):

1. **Otrokem je odvedený pohan**, od chvíle, kdy ho vojsko přivede do vsi (na cestě je kořist tažení). Odvedení, kteří se usadili před plánem 5, zůstávají svobodní – nejde je poznat (body 1 a 12). **Zajatý muž rodu ani šlechtic se kupcům zatím neprodává:** zůstává ve dvorci k výkupnému a dál ho jde držet, propustit nebo popravit – šlechtice je cílem „spíš zajmout než zabít, protože za něj může požadovat výkupné“ (Martin 2. 11. 2026). Prodej zajatce kupcům by šel přidat později jako další volba u zajatce, s dalším plánem války.
2. **Otrok žije jako ostatní vesničané:** pracuje, jí, bydlí, žení se, rodí, může se pokřtít a stěhuje se s ostatními; neutíká a štěstí nemění. Příznak si nese všude: otrokyně, která se vdá do sousední vsi, je tam dál otrokyní a nový pán ji smí prodat (vlastní ves ji ztratí jako každou nevěstu); otroci brání ves a jdou do odvodů jako vesničané; propuštěná vedlejší manželka – pohanka a otrokyně – je po křtu rodu zase na prodej; ve vsích nepokřtěného rodu se otroci nepokřtí nikdy (obrácení jen u pokřtěného rodu); povýšený otrok (vojvoda NPC rodu) zůstane otrokem, ale prodat ho nejde (bod 4).
3. **Otroci se prodávají po jednom**, od toho, kdo do vsi přišel nejdřív; manžel ani děti s ním neodcházejí a i malé dítě-otrok jde prodat samo za cenu dospělého (Martin 26. 11. 2026: „Moc to řešíš. Otroci nejsou rodina, ale zboží“). **Prodej rozvede manželství jako smrt:** manžel ve vsi ovdoví a smí se znovu oženit, neprodaný se vrátí bez manžela. Neprodá se muž rodu, šlechtic, manželka muže rodu ani kdo je zrovna pryč. Na trhu jdou otroci napřed – mění to oznámené „rodiny napřed“ plánu 3 (bod 6).
4. **Otrok stojí na trhu 360 kg obilí (24 mincí)** jako svobodný dospělý. Kupci jich shánějí až 10 za průjezd, ale z měšce 60 mincí za výchozí cenu koupí dva. Kupují od prodávajících po řadě – hostitel, pak výpravy podle příjezdu – a u každého napřed med, vosk a kožešiny (body 6 a 7).
5. **Pořadí nákupu kupců:** otroky kupují až po medu, vosku a kožešinách, takže ves, která má i med, prodá otroky pomalu. Z výsledků plánu 5 (Co se ověří): ves T prodala oba otroky až třetí a čtvrtý den kupců a Vlkov s uměle přidanou zastávkou až po dvou letech (v letech 919–920 kupci utratili celý měšec za med, vosk a kožešiny). Změnilo by to jen jiné pořadí zboží nebo větší měšec, a to by změnilo i ověřená čísla plánu 4.
6. **Prodej ve vlastní vsi nabídkou počtu** (podle Martinova „Hráč zadá počet“ u zbroje, 25. 11. 2026): v panelu Trh hráč nastaví, kolik otroků ves prodá – jako počet mečů objednaných u kupců –, a v den kupců je ves prodá za mince; kdo se neprodá, počká na další kupce. Do jiné vsi je pošle výpravou jako ostatní zboží. Otroci z nabídky se odečtou od lidí, které ves nabízí sama, a jako muž, žena ani rodina se na trhu vsi neprodají. Ves sama otroky nekupuje, vesničané také ne (body 7 a 8).
7. **Správce otroky zatím neprodává ani nekupuje** – otroci v jeho vsi pracují jako ostatní (bod 8). Nabídka otroků ani objednávka zbroje se zapnutím správce nemění: platí dál, správce je nepřepisuje. Je to odchylka od Martinova „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“ (22. 11. 2026): kdy by měl otroky prodat kupcům, je pravidlo, které Martin nedal. Důsledek: otroky jde na trhu koupit jen od vsí, jejichž hráč je sám nabídne – ves správce ani NPC rodu je nenabídne nikdy, takže vojvoda u stezky, který podle Martina „nakupuje všechny tyto komodity od okolních vsí“, otroky od vsí správců nekoupí.
8. **Otrok smí odejít i jako svobodný muž, žena nebo rodina** (výprava, zásilka) – i tam zůstane otrokem (bod 6).
9. **Kupci otroky odvezou ze světa** – jediný odchod lidí ze světa kromě smrti. V den, kdy na trhu otroci nejsou, se trh chová přesně jako dosud (bod 7).

**Otázky na Martina:** žádné otevřené. Otázka rodiny otroka je rozhodnutá (Martin 26. 11. 2026, výše).

## Měšec kupců bez dna (27. 11. 2026)

Martin 27. 11. 2026: „Kupcům neomezuj měšec.“ Rozhodnutí níž jsou **návrh Clauda** (mění Rozhodnutí plánu 4, bod 5,
a čísla měšce v plánech 5 a 6):

1. **Kupec mince nedrží.** Za nákup platí z měšce bez dna, mince za prodanou zbroj u něj hned zaniknou – jako dřív při
   odjezdu (kupci jsou cizí). Mince tak vznikají jen platbou kupce a zanikají jen platbou kupci; stav vsi ani trhu kupci
   žádné mince nepřipíše (bez dna se do stavu zapsat nedá).
2. **Kupec koupí všechno ze svého seznamu, co je na trhu** – za průjezd nejvýš zlato 1 000 g, med 100 kg, vosk 24 kg,
   kožešiny 60 a otroci 10; seznam se nemění, je jedinou mezí nákupu.
3. **Cena dne:** kupec shání celý svůj seznam toho, co je na trhu. Je-li zboží na trhu míň, než kupci shánějí, jeho cena
   v den kupců roste o `MARKET.priceStep` denně jako dřív – jen ji už nezastaví prázdný měšec.
4. **Kupci hladinou nehýbou:** jejich mince ani seznam se do hladiny nepočítají (měšec bez dna by ji hnal nahoru bez
   konce). Hladinu hýbou mince výprav a hostitele jako dřív; mince od kupců zdraží trh, až je ves utratí.
5. **Převod stavu žádný:** kupec, který na trhu stojí se starým měšcem 60 mincí, ho už nepoužije a mince mu zaniknou
   s odjezdem.

## Co se ověří

- Vlkov 10 let bez smyšlených sousedů (bez obchodu, sňatky ve vsi): přežije a roste? Když ne, ozvat se Martinovi.
  **Ověřeno 23. 11. 2026** (sonda se sňatky bez příbuzenství – [příbuzenství](kinship.md), 30 let od 12. 5. 904):
  přežije a roste – 21 lidí (rod 8) → 35 lidí (rod 11) v roce 934, s okolím 38 (rod 11), nikdo nezemřel hladem.
  Nástroje a keramika bez nákupu dojdou (víc práce na poli, hlad nehrozí).
  **Přepočet Vlkova po plánu 1 – 23. 11. 2026** (10 let od 12. 5. 904, sonda D118, plán 1 proti stavu před ním):
  podmínky splněny – 21 lidí a rod 8 → 22 lidí a rod 10, hladem nikdo, error, nan a codecFail 0; stav před plánem 1:
  25 lidí, rod 9. Obilí 1. 8. 914: 28 t proti 38 t. Nástroje a keramika klesnou na 0 a sklizně 907–912 jsou nižší
  (911: 6,2 t proti 11,0 t).
- Dvě vsi a kupec: výprava, trh, cena, mince – v součtu nic nevznikne ani nezmizí, kromě mincí od kupců.
  **Ověřeno 23. 11. 2026** bez kupců a mincí – `market-two-villages.test.ts` (výprava prodá obilí a koupí krávu): v součtu nic nevznikne ani nezmizí, co výprava prodala, hostitel koupil, a co koupila, hostitel prodal; cena i zpráva přijdou domů.
- Dvě vsi tři roky po dnech (plán 3): ves R s kovářem, hrnčířem a tesařem a ves S bez řemeslníků, pošta mezi nimi po každém dni. **Ověřeno 24. 11. 2026** – `market-neighbours-years.test.ts` (pomalý). Přípravky: R má 20 t obilí navíc, 6 t uhlí (kovář zlaté vsi bez milíře nekuje) a nástroje 400 kg nad potřebu; S má 20 t obilí navíc a nástrojů o 15 kg méně, než potřebuje, **keramiku ani dřevěné nářadí navíc nemá** (dřívější přípravek 2 000 kg keramiky a nářadí pro S je pryč – závěrečná kontrola). Výsledek: vybavení S nástroji 6,0 kg na začátku, **22,2 kg na konci** a 2,5 kg v kontrolním běhu bez okolí; S koupila 29,2 kg nástrojů a 83,3 kg keramiky za obilí (20 výprav vesničanů – keramika zabere místo, nástroje jedou další cestou, až se lidé vrátí); lidé R + S + na cestě = začátek + porody − úmrtí − odchod ze světa po každých 90 dnech (13 + 13 lidí, 1 porod, 1 úmrtí), nikdo hladem, žádné `NaN`, id odešlých nejsou zároveň ve vsi, každá výprava s výsledkem. **Kapacita polí `laborHa` S 30,61 ha = kontrola 30,61 ha** (rozdíl ~1e-6, test hlídá, že S neklesne pod kontrolu): pole drží páry volů, ne nástroje. Dřívější rozdíl −4 % (s přípravkem) a −13,6 % (bez něj) byl chybou výhledu správce – orba z plánu sezóny při pokrytí nástroji ze dne plánu dělila kapacitu spřežení při dnešním pokrytí, takže lepší nástroje kapacitu polí snižovaly (opraveno 24. 11. 2026, závěrečná kontrola). Sňatky se sousedy a další manželky se za tři roky ve zlatých vsích nestaly (nikdo svobodný bez protějšku), chovají je jednotkové testy.
- Dvě vsi a cizí kupci tři roky po dnech (plán 4, návrh Clauda): ves T na kupecké stezce a ves S bez stezky, pošta mezi nimi po každém dni. **Ověřeno 26. 11. 2026** – `market-merchants-years.test.ts` (pomalý). Přípravky: T na políčku světa se stezkou (jedna zastávka kupců z `trailStops`) má 20 t obilí, 150 kg medu, 30 kg vosku a 80 kožešin navíc a objednaný meč; S má 20 t obilí, 500 kg medu, 120 kg vosku, 250 kožešin a 240 mincí navíc a T v okolí. S pošle 10 výprav (na první tři dny kupců každého herního roku) se 40 kg medu, 10 kg vosku, 20 kožešinami a nejvýš 150 mincemi, na seznamu meč. Test po každém dni tvrdí: součet mincí světa (`coinsOfWorld`) se mění jen příjezdem kupce (+ 60) a jeho odjezdem (− měšec při odjezdu); mezi vsemi a výpravami se zboží jen přesouvá, kupcům odchází jen med, vosk a kožešiny a přichází od nich jen zbroj; mince od kupců odpovídají hodnotě zboží v cenách dne a hladině (rozdíl < 1 mince na dvojici a den); co výprava vezla, prodala, nebo přiveze zpět; meč T koupí v první den kupců, kdy na něj má, za cenu dne s hladinou a objednávka pak zmizí; hladina ≥ 1, ceny nad dnem, žádné `NaN`, záporná zásoba ani smrt hladem; dopočet obou vsí po 90 dnech (S i ve dny výprav) dá týž stav. Výsledek: 13 příjezdů kupců; **T koupila meč 6. 6. 523** (druhý den kupců) za 120 mincí a za mince nic jiného, mince T na konci 1., 2. a 3. roku **180, 224 a 235**; výpravy S koupily od kupců **4 meče** (12. 3. a 6. 6. 523 po 120, 14. 1. 525 za 130 a 9. 2. 526 za 131 mincí) a prodaly jim med, vosk a kožešiny za 309 mincí – první čtyři nic, kupci utratili měšec u hostitele, který prodává první; mince světa 240 → 283; největší hladina 1,09; na konci 13 + 13 lidí, nikdo hladem.
- Přepočet Vlkova po plánu 4 (Vlkov stojí na suché mapě – bez výřezu kostry, kupci do něj nechodí). **Ověřeno 26. 11. 2026** (živý stav z databáze `bohemia`, 10 let po dnech od 19. 10. 917, sonda plánů 1–3; návrh Clauda): stav po plánu 4 (`feat/markets-4`, se zastávkami `[]` jako po načtení i bez nich) je **bit po bitu týž** jako před ním (`feat/landscape`) – shodný otisk stavu všech 3 653 dní i konečný stav; chyby, `NaN` ani rozdíl kodeku (30 kontrol) nejsou. Běh s uměle přidanou zastávkou kupců (jedna zastávka se seedem): ves přežije se stejnými lidmi, rodem a obilím (kupcům prodává jen přebytek medu, vosku a kožešin), mince přibývají a cenová hladina trhu roste (malá ves kupcům nemá co prodat – inflace podle Rozhodnutí plánu 4, bod 3):

  | rok (31. 12.) | lidé (rod) | narození | úmrtí (hladem) | obilí 1. 8. | mince s kupci | hladina s kupci |
  | ------------- | ---------- | -------- | -------------- | ----------- | ------------- | --------------- |
  | 917           | 24 (7)     | 0        | 0 (0)          | –           | 60            | 1               |
  | 918           | 24 (7)     | 1        | 1 (0)          | 46 617 kg   | 300           | 1               |
  | 919           | 25 (7)     | 3        | 2 (0)          | 49 132 kg   | 524           | 1,02            |
  | 920           | 26 (8)     | 1        | 0 (0)          | 50 597 kg   | 562           | 1,36            |
  | 921           | 22 (6)     | 0        | 4 (0)          | 53 999 kg   | 617           | 1,60            |
  | 922           | 25 (7)     | 3        | 0 (0)          | 54 341 kg   | 692           | 1,98            |
  | 923           | 26 (8)     | 1        | 0 (0)          | 48 486 kg   | 740           | 2,16            |
  | 924           | 28 (8)     | 2        | 0 (0)          | 48 383 kg   | 809           | 2,50            |
  | 925           | 29 (7)     | 2        | 1 (0)          | 54 406 kg   | 924           | 2,67            |
  | 926           | 31 (8)     | 2        | 0 (0)          | 60 653 kg   | 1 041         | 2,86            |
  | 19. 10. 927   | 33 (8)     | 2        | 0 (0)          | 62 066 kg   | 1 085         | 2,90            |

  Lidé, rod, narození, úmrtí a obilí jsou ve všech třech bězích stejné; bez kupců má Vlkov 0 mincí a hladinu 1. Kupcům Vlkov prodá nejvíc v prvních letech, dokud má zásoby (917–919: 343 kg medu, 104 kg vosku, 332 kožešin), pak jen roční přírůstek (16–21 kg medu, 2 kg vosku a 3–29 kožešin za rok). Hladina proto roste dál: měšec kupců (60 mincí za průjezd) je mnohem větší než hodnota toho, co jim ves prodá, a hladina se ustálí, až budou v rovnováze (bod 3).

- Dvě vsi, otroci a cizí kupci tři roky po dnech (plán 5, návrh Clauda): ves T na kupecké stezce a ves S bez stezky s T v okolí, pošta mezi nimi po každém dni. **Ověřeno 26. 11. 2026** – `market-slaves-years.test.ts` (pomalý). Přípravky: T (jedna zastávka kupců z `trailStops`, 20 t obilí navíc) dostane z tažení (`applyCampaignReturn`) pohana 25 let a pohanku 20 let, jedné vesničance se nastaví křesťanská víra a příznak otroka (pokřtěná otrokyně – prodat ji nejde) a nabídka `slavesForSale: 2`; S (20 t obilí navíc) dostane pohanskou rodinu (muž 30, žena 28 a dítě 4 roky), pohanku 18 a křesťanku 22 let – otroky jsou čtyři pohané, křesťanka je svobodná. S na první den kupců každého herního roku pošle do T výpravu hráče se všemi prodejnými otroky, nejvýš 2 (`give: { slaves }`, seznam prázdný – kontrola výpravy ho přijme). Test po každém dni tvrdí: lidé T + S + na cestě + otroci u kupců = začátek + porody − úmrtí − otroci, se kterými kupci odjeli – kdo zmizel jinak než smrtí, byl v poslední den ve vsi na prodej (`canBeSold`), nikdo nepřibyl jinak než porodem a nikdo není na dvou místech; prodaní otroci (zápisy `market-held` T a výsledky výprav S) = otroci, se kterými kupci odjeli, a ti, které ještě drží; pokřtěná otrokyně T a křesťanka S ze světa nezmizí; děti narozené za běhu nejsou otroci; `spouseId` v T i S jsou vzájemné (kromě vedlejších manželek mužů rodu); nabídka T klesá o prodané a při nule ze stavu zmizí; mince světa se mění jen příjezdem a odjezdem kupců jako v plánu 4; žádné `NaN`, záporná zásoba ani smrt hladem; dopočet obou vsí po 90 dnech dá týž stav. Výsledek: 13 příjezdů kupců; **T prodala kupcům oba otroky** – 13. 8. a 15. 11. 523, každého za 24 mincí (týž den i med, vosk a kožešiny), nabídka pak zmizela; v prvních dvou dnech kupců (12. 3. a 6. 6. 523) dali kupci celý měšec za med, vosk a kožešiny T – hostitel prodává první a tato zboží kupují před otroky –, první výprava S proto neprodala nic a oba otroci se vrátili domů s původními id; **výpravy S prodaly 4 otroky** – 1. 2. 524 dva za 52 mincí, 14. 1. 525 jednoho za 33 (druhý se vrátil) a 9. 2. 526 jednoho za 40 (cena roste s hladinou); mince T a S 31. 12. 523, 524 a 525 **207 a 0, 226 a 52, 261 a 85**, na konci běhu (23. 2. 526) 261 a 125, mince světa 0 → 386. S kupci odjelo 6 otroků – tolik, kolik se prodalo; ve vsích zbyla jen pokřtěná otrokyně T, S otroky nemá. 4 porody, 1 úmrtí, nikdo hladem ani jinak ze světa; na konci 13 + 17 lidí.
- Přepočet Vlkova po plánu 5 (Vlkov bez války otroky nemá). **Ověřeno 26. 11. 2026** (živý stav z databáze `bohemia` – jen čtení, 10 let po dnech od 7. 1. 919, sonda plánů 1–4; návrh Clauda): stav po plánu 5 (`feat/markets-5-9`) je **bit po bitu týž** jako na `feat/landscape` – shodný otisk celého stavu všech 3 653 dní i konečný stav; chyby, `NaN` ani rozdíl kodeku (30 kontrol) nejsou a otrok ve vsi není žádný (6 křesťanů, rod pokřtěný). Druhý běh s uměle přidanou zastávkou kupců (jedna zastávka se seedem jako v plánu 4) a třemi odvedenými pohany (`applyCampaignReturn` – muž 25, žena 22 a muž 30 let, všichni otroci) s nabídkou `slavesForSale: 3`: ves přežije, nikdo hladem, otroci se nepokřtili a **prodali se kupcům v roce 921** – 18. 4. jeden a 5. 8. dva, po 24 mincích; nabídka pak ze stavu zmizela. V letech 919–920 kupci utratili celý měšec za med, vosk a kožešiny, které kupují dřív (pořadí `TRADE_GOODS` – Rozhodnutí plánu 5, bod 7), i 18. 4. 921 koupili napřed 7 kg vosku. Mince 240 → 1 384, hladina nejvýš 2,42.

  | rok (31. 12.) | lidé (rod) | narození | úmrtí (hladem) | s otroky: lidé (rod) | narození | úmrtí (hladem) | otroci ve vsi (prodaní) | mince | hladina |
  | ------------- | ---------- | -------- | -------------- | -------------------- | -------- | -------------- | ----------------------- | ----- | ------- |
  | 919           | 25 (7)     | 3        | 2 (0)          | 28 (8)               | 3        | 2 (0)          | 3 (0)                   | 240   | 1       |
  | 920           | 26 (8)     | 1        | 0 (0)          | 31 (8)               | 3        | 0 (0)          | 3 (0)                   | 473   | 1       |
  | 921           | 22 (6)     | 0        | 4 (0)          | 24 (6)               | 0        | 4 (0)          | 0 (3)                   | 641   | 1,06    |
  | 922           | 25 (7)     | 3        | 0 (0)          | 26 (7)               | 2        | 0 (0)          | 0                       | 685   | 1,28    |
  | 923           | 26 (8)     | 1        | 0 (0)          | 29 (9)               | 3        | 0 (0)          | 0                       | 722   | 1,57    |
  | 924           | 28 (8)     | 2        | 0 (0)          | 30 (10)              | 1        | 0 (0)          | 0                       | 783   | 1,84    |
  | 925           | 29 (7)     | 2        | 1 (0)          | 30 (11)              | 2        | 2 (0)          | 0                       | 894   | 2,16    |
  | 926           | 31 (8)     | 2        | 0 (0)          | 30 (11)              | 1        | 1 (0)          | 0                       | 1 010 | 2,32    |
  | 927           | 31 (8)     | 2        | 2 (0)          | 32 (13)              | 4        | 2 (0)          | 0                       | 1 170 | 2,36    |
  | 928           | 31 (9)     | 1        | 1 (0)          | 32 (13)              | 1        | 1 (0)          | 0                       | 1 384 | 2,22    |
  | 7. 1. 929     | 31 (9)     | 0        | 0 (0)          | 32 (13)              | 0        | 0 (0)          | 0                       | 1 384 | 2,22    |

  První čtyři sloupce jsou základ (`feat/landscape`) i větev – oba běhy jsou shodné, bez kupců má Vlkov 0 mincí a hladinu 1. S otroky má ves do jejich prodeje víc lidí (tři otroci, v roce 920 i dva porody navíc); potom se běhy liší jen jiným průběhem náhody vsi (sňatky, porody, rod), hlad nikde.

## Navazuje

- [Sousední vsi](neighbours.md) – kdo je soused, sňatky, řemeslníci na zakázku.
- [Zlato a klenoty](gold.md) – rýžování, šperkař, mincovna od roku 950.
- [Válka](war.md) – zajatci, užití zbroje (později).

## Nechává se na stavitele

Model ceny (o kolik se posune, meze), oběh mincí mezi vsemi, kterými se dopočítávají zvlášť (schránka vsi), plán cest
kupců, rozhraní (přehled vsí, panel výpravy, trh), převod stavu, pořadí úloh.

**Splněno:** plán 4 splnil vše výše (Co se ověří – dvě vsi a kupci, přepočet Vlkova); zbývá jen otevřené jmenované v Rozhodnutích plánu 4. Plán 5 splnil otroky (Co se ověří – dvě vsi, otroci a kupci, přepočet Vlkova); Plán 6 splnil zlato (Co se ověří v [gold.md](gold.md) – dvě vsi, zlato a kupci, přepočet Vlkova; Rozhodnutí plánu 6).
