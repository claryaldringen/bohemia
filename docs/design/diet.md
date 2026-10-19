# Strava a dobytek – obilí, luštěniny, maso, mléko a sýr, vejce, ovoce

Stav: schváleno 18. 10. 2026 (Martin: „Ano“), **implementováno 18. 10. 2026** – jádro
`domain/village/diet.ts` (jídlo dne), `dairy.ts` (mléko, sýr, práce se zvířaty), `livestock.ts`
(stáda, porážka, vejce), `husbandry.ts` (den hospodářství); scéna kreslí skutečná stáda.
**Týž den změna (Martin):** maso není kvůli energii, ale kvůli **bílkovinám – 1,6 g na kg tělesné
váhy**; bílkoviny dává obilí, mléko a sýr, maso a vejce („Ovce, kozy i krávy jsou mléčná
zvířata“) a **práce se zvířaty se počítá** – viz Bílkoviny, Mléko a sýr, Práce se zvířaty
(implementováno; čísla z [rešerše](research/2026-10-18-dairy-protein.md)). **Další změna
(Martin, 18. 10. 2026):** „c) ale maso bude mírně zvyšovat štěstí“ – 1,6 g/kg zůstává, přidají
se **luštěniny** jako plodina na poli a **maso mírně zvyšuje štěstí** – viz Luštěniny
(implementováno, `legumes.ts`; [rešerše](research/2026-10-18-legumes.md)). **Stáda
realističtěji (Martin, 19. 10. 2026):** roční ztráty stáda, seno pro všechny druhy, trvanlivost
uzeného masa, chovné stádo podle potřeby, pasáci a skladba stáda – viz Stáda realističtěji
(implementováno, `herding.ts`, `livestock.ts`, `hay.ts`, `diet.ts`;
[rešerše](research/2026-10-19-herds-hay-meat.md)). **Rovnovážné hospodaření (Martin, 19. 10. 2026):** ves volí skladbu stád a plochu luštěnin podle ceny jídla v práci – viz Rovnovážné
hospodaření (implementováno, `economy.ts`, `livestock.ts`). Rozhodnutí z implementace jsou
v tabulce Rozhodnutí jako „návrh Clauda“ nebo „rozhodnutí kontroléru“.

## Proč

Raně středověká strava nebyla jen obilí. Plné nasycení potřebuje kombinaci **obilí, masa a ovoce**
(Martin). Dobytek, dosud jen ozdoba, se tím stává zdrojem masa – a jeho chov navazuje na pastvu na
úhoru, louky na seno, les (žaludy) a ohradu z [orání rádlem](oxen.md).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** samo obilí ani samo ovoce **nikdy úplně nenasytí** – je potřeba kombinace
  obilí–maso–ovoce (Martin).
- **Cíl:** ovoce zvyšuje nasycení i štěstí – je sladké (Martin).
- **Cíl:** maso dává **dobytek** – prasata vykrmená žaludy v lese, přebytečné kusy ovcí, koz
  a krav; slepice dávají vejce (Martin potvrdil směr).
- **Cíl:** bílkoviny z obilí, mléka a sýra, masa a vajec – 1,6 g na kg tělesné váhy (Martin);
  ovce, kozy i krávy se dojí (Martin).
- **Ne-cíl (teď):** lov a rybolov (později jako doplněk), zelenina ze zahrádek, sůl a uzení jako
  suroviny, nákazy dobytka jako události (běžné nemoci jsou v ročních ztrátách stáda), máslo
  a syrovátka zvlášť, vlna a len jako zásoby (Oděv – zpracují se v rámci roku).
- **Anti-cíl:** ves, která vymře jen proto, že nemá maso – nedostatek pestrosti strávníky oslabí,
  ale hladem se umírá jen z nedostatku energie (viz Hlad).

## Pojmy

- **Jablka → ovoce** – v rozhraní se přejmenují na **ovoce**, ikona zůstane (Martin). Sad dál
  plodí jablka; „ovoce“ je zásoba.
- **Energie** – kolik jídla (v obilních ekvivalentech) lidé snědí proti potřebě. **Obilí 1,
  maso 0,6, ovoce 1/7** (maso ≈ 2 000 kcal/kg proti obilí ≈ 3 400; jablka jako dnes – návrh
  Clauda).
- **Bílkoviny** – kolik bílkovin lidé snědí proti potřebě 1,6 g na kg tělesné váhy (Martin).
- **Nasycení** – co hráč vidí (0–100 %): energie **a** kvalita stravy z bílkovin a ovoce (níže).

## Pravidla (návrh Clauda, doladí se hraním)

### Bílkoviny a nasycení (Martin, 18. 10. 2026; tvar návrh Clauda)

- **Potřeba bílkovin = 1,6 g na kg tělesné váhy denně** (Martin). Váha podle osteologie
  ([rešerše](research/2026-10-18-dairy-protein.md)): dítě 0–13 let **20 kg**, dospělý **60 kg**,
  starší **58 kg** → **32 / 96 / 93 g denně**.
- **Bílkoviny v potravinách:** obilí (směs) **10 %**, maso **17 %** (čerstvá váha), vejce
  **12,5 %**, mléko kravské **33 g/l**, kozí **36 g/l**, ovčí **57 g/l**, sýr **25 %**.
- **Nasycení = pokrytí energie × kvalita stravy**, kvalita = **0,60 + 0,34 × pokrytí bílkovin +
  0,06 × pokrytí ovoce** (nejvýš 1; ovoce plně při 5 % energie):
  - jen obilí (dost energie) – obilí dá ≈ polovinu potřeby bílkovin dospělého (49 z 96 g), dítěti
    víc → **nasycení ≈ 80 %** jako dosud,
  - bílkoviny plně (s mlékem, masem, vejci) → **94 %**, i s ovocem **100 %**.
- Dřív (do 18. 10. 2026 odpoledne): pestrost 0,80 + 0,14 × pokrytí masa + 0,06 × pokrytí ovoce
  a plná strava 75 / 20 / 5 % energie z obilí, masa a ovoce – nahrazeno bílkovinami.
- **Ovoce nikdy nestačí samo:** ovoce smí pokrýt nejvýš **25 % energie**, maso nejvýš **40 %**,
  mléko a sýr **30 %** – zbytek musí být obilí (Martin; strop mléka návrh Clauda). Ovoce se jí
  přednostně, dokud nezkazí (k 1. 3. – [sad](orchard.md)), čerstvé mléko a vejce, jak přibývají,
  maso rovným dílem do porážky a sýr do příštího dojení; obilí dorovná energii.
- **Ovoce a štěstí:** když lidé jedí ovoce, štěstí **+5** (sladké – Martin; [štěstí](happiness.md)).

### Luštěniny a štěstí z masa (Martin, 18. 10. 2026; čísla rešerše a návrh Clauda)

- **Luštěniny** (hrách a čočka – pole: [fields.md](fields.md), Luštěniny): **22 % bílkovin**,
  energie jako obilí (3 400 kcal/kg). Strop **25 % energie** ze stravy (dospělý ≈ 45 kg ročně;
  rešerše: chléb čeledi v Mordenu 17–26 % hrachu – strop je návrh Clauda).
- **Kolik jich ves chce:** každý kg luštěnin místo obilí se stejnou energií dá o **12 dkg bílkovin
  víc** (22 % proti 10 %). Od 19. 10. 2026 rozhodne **Rovnovážné hospodaření** (níž) – luštěniny
  soupeří cenou v práci se stády a ves je oseje k 1. 9., jen kde jsou levnější. Dřív: bílkoviny,
  které chybí po obilí (odhad obilí na 70 % energie), mléku stád a vejcích, nejvýš strop – s 1,6
  g/kg šly luštěniny ke stropu skoro vždy (cíl + rezerva 15 %); obilí má přednost dál.
- **Jí se** rovným dílem celý rok do příští sklizně (31. 7.), nejvýš strop; počítají se do výhledu
  energie jako maso a sýr. Ztráta skladováním jako obilí.
- **Maso a stáda:** potřeba masa = bílkoviny, které zbudou i po luštěninách – luštěniny podle
  zásoby (rovným dílem do sklizně, přepočteno na rok, nejvýš strop). Ves s luštěninami tak chová
  menší stáda (pravidlo „ves chová, kolik potřebuje“ beze změny); první rok, než luštěniny
  sklidí, počítá jen s obilím, mlékem a vejci.
- **Maso a štěstí** (Martin – „mírně“): až **+3** – plně od **20 % energie z masa**, méně poměrně
  (10 % → +1,5); ovoce dál +5 ([štěstí](happiness.md)).

### Hlad

- **Hladem se umírá z energie, ne z pestrosti:** nahromaděný hlad ([populace](population.md) –
  Hlad a vymření) roste jen z nedostatku **energie** (pod 90 %).
- **Nasycení** (energie × kvalita z bílkovin) dál řídí porody (pod 50 % se nerodí, plně od 95 %)
  a štěstí (hlad ubírá štěstí, pod 90 %). Nedostatek bílkovin tak sníží porody a štěstí – ves jen
  s obilím (≈ 80 %) se množí pomaleji a je méně šťastná, ale neumírá.

### Mléko a sýr (Martin: „Ovce, kozy i krávy jsou mléčná zvířata“; čísla rešerše)

- **Dojí se dojné kusy stáda:** skot **40 %**, ovce a kozy **50 %** stáda (návrh Clauda – hra
  nevede samice po kusech). Mléko pro lidi (po vykrmení mláděte) za rok na dojný kus: kráva
  **300 l** (květen–září naplno, říjen–listopad napůl), ovce **25 l** (15. 5. – 31. 8., po
  odstavu jehňat), koza **60 l** (květen–září). Energie mléka 640 / 700 / 1 050 kcal na litr.
- **Čerstvé mléko se pije hned** – do stropu mléka a sýra (30 % energie); co se nevypije, zpracuje
  se na **syřidlový sýr**: zůstane **75 % bílkovin** mléka, sýr má **25 % bílkovin**
  a 3 000 kcal/kg (z kravského a kozího ≈ 10 l na kg, z ovčího ≈ 6 l). Tvaroh zvlášť hra nevede
  (vydrží jen dny).
- **Zásoba sýra** ztrácí **15 % ročně** a jí se rovným dílem **do 1. 5.** (začátek dojení, sýr
  vydrží do té doby) – v zimě tak bílkoviny dává sýr.

### Práce se zvířaty (Martin se ptal, jestli je započítaná; čísla rešerše, člověkoden 10 h)

- **Dojení** na dojný kus a den v době dojení: kráva **0,017**, koza **0,013**, ovce **0,005**
  člověkodne (kráva 2 × 5 min). **Sýr** 1 člověkoden na 100 l zpracovaného mléka (návrh Clauda).
- **Zimní péče** (listopad–březen) o krávu nebo vola – krmení, voda, kydání – **20 min denně**
  (≈ 5 člověkodní za zimu). **Prase** u domu **2 min**, **slepice** půl minuty denně (návrh
  Clauda).
- Práce se zvířaty jde **hned po denním minimu** – zvířata nepočkají; co se nepodojí, to se
  nenadojí. **Pasení zůstává bez práce** – pasou děti (Martin).

### Dobytek – stáda a maso

- **Výchozí stádo** (dnes ozdoba – stane se skutečným): na domácnost 3 ovce, 1 koza, 2 prasata,
  slepice u obydlí; jedna kráva na 2 domácnosti. Stáda **rostou** (ovce a kozy +40 % ročně,
  prasata +100 %, krávy +20 % – mláďata; návrh Clauda) až do **nosnosti**:
  - **ovce, kozy, krávy:** pastva na úhoru a loukách – ≈ **1 ha na krávu, 0,2 ha na ovci
    nebo kozu**; krávy, voli, ovce a kozy navíc potřebují na zimu **seno** ([orání
    rádlem](oxen.md) – Seno; od 19. 10. 2026 kráva 5, vůl 6, ovce a koza 1 kg denně, dřív jen
    krávy a voli 1,5 t na kus),
  - **prasata:** les do 600 m od vsi – ≈ **1 ha lesa na prase** (žaludy, bukvice, kořínky –
    pasou se v něm celý rok, Martin 19. 10. 2026),
  - **pasáci** (od 19. 10. 2026 – Pasáci níž).
- **Porážka na podzim** (listopad): co přeroste nosnost a mladé kusy navíc jdou na maso:
  **prase ≈ 50 kg, ovce ≈ 15 kg, koza ≈ 12 kg, kráva ≈ 120 kg** masa (návrh Clauda). Ves si nechá
  chovné kusy (nejméně pár od každého druhu).
- **Vejce:** slepice dají celý rok ≈ **5 kg vajec na slepici**, jí se čerstvá (návrh Clauda).
- **Zásoba masa** se **uzí a suší** – ztratí **20 % ročně** (návrh Clauda) – a co se nesní do 31. 8., zkazí se (Trvanlivost masa níž, od 19. 10. 2026). **Kolik masa ves
  potřebuje, určí bílkoviny:** co chybí po obilí (odhad obilí na 70 % energie), mléku stád
  (85 % jeho bílkovin – syrovátka odteče) a vejcích, v mase (17 % bílkovin). Dospělý tak potřebuje
  ≈ 35 kg bílkovin ročně, z obilí ≈ 13 kg – s ≈ 110 l mléka ≈ **100 kg masa ročně** (vlastní
  výpočet; 1,6 g/kg je asi dvojnásobek bezpečné dávky FAO/WHO – Martinova volba). Dřív pevně
  60 kg (20 % energie) – nahrazeno.
- **Práce:** pasou děti a starší bez práce vsi (Martin), co nezvládnou, pasou dospělí (Pasáci
  níž, od 19. 10. 2026); porážka a uzení ≈ **1 člověkoden na 20 kg masa**; dojení a péče viz Práce
  se zvířaty; seno podle [orání rádlem](oxen.md).
- **Ohrada:** krávy a voli přes zimu v ohradě s přístřeškem ([orání rádlem](oxen.md)); ovce
  a kozy přezimují u domů na seně, prasata v lese (návrh Clauda, Martin 19. 10. 2026).

### Stáda realističtěji (Martin, 19. 10. 2026; čísla návrh Clauda podle [rešerše](research/2026-10-19-herds-hay-meat.md))

Martin ve Vlkově (26 lidí) viděl po zimě 6 100 kg uzeného masa, 40 krav, 53 prasat, 30 ovcí,
10 koz a v březnu 70 t sena. Stádo bylo jen počet kusů, neuhynulo nic kromě volů bez sena, maso
ztrácelo 20 % ročně a vydrželo roky, seno se nekazilo a v zimě jedly seno jen krávy a voli.

#### Roční ztráty stáda

Martin: „**Určitě doplň roční ztráty stáda.**“

- Za rok uhyne podíl stáda – **ovce 12 %, kozy 10 %, prasata 12 %, skot 6 %** (nemoci, vlci,
  úrazy), **rovnoměrně po dnech**, i z letošních mláďat. Stádo je číslo s podílem kusu – ztráta je
  podíl, žádný los (determinismus beze změny).
- Mláďata k 1. 4. (ovce a kozy +40 %, prasata +100 %, krávy +20 %) jsou ta, která přežila první
  týdny – **zmetání a úhyn novorozených jsou v nich** (čísla růstu beze změny).
- Stálé stádo tak dá na chovný kus za rok maso z mláďat (1 + růst) × (1 − ztráta) − 1 kusu: ovce
  3,5 kg, kozy 3,1 kg, prasata 38 kg, krávy 15 kg masa (vlastní výpočet).
- Literatura: dospělý skot 4–8 %, ovce 7–15 %, kozy 5–16 %; s řemesly nesouvisí – jedno číslo.

#### Skladba stáda

Martin: „**A primárním zvířetem by měly být ovce, protože dávají všechny 3 věci – vlnu, mléko
i maso. Kozy dávají asi o něco více mléka (nutno ověřit) a spasou i to, co ovce ne. A kráva sice
asi dává nejvíc mléka a masa, ale také bude asi nejnáročnější na chov, nicméně je potřebujeme
kvůli tažným volům.**“ a „**Prasata jsou jen na maso, ale zase zvládnou pást v lese po celý
rok.**“

- **Ovce na všechno** (vlna na oděv – Oděv, mléko, maso) – mají přednost.
- **Kozy na mléko a pastvu na křovinách:** dávají víc mléka než ovce (60 proti 25 l pro lidi za
  rok – rešerše potvrdila, ovčí mléko je ale bohatší; na kus ≈ 2,2 proti 1,4 kg bílkovin). Okusují
  keře a výhonky, kam ovce ani krávy nejdou: **zarůstající příloh (křoviny, mladý les) je pastva
  jen pro kozy** – spásají ho napřed, zbytek potřeby z pastvy ostatních.
- **Krávy na voly a mléko:** nejvíc mléka a masa na kus, ale nejnáročnější – 1 ha pastvy (5× ovce),
  5 kg sena denně v zimě (5× ovce), pasák jich uhlídá nejméně. Ves drží vždy aspoň **krávu na
  2 domácnosti** (mléko – jako výchozí stádo) a na každou ohradu **3 krávy** (dvě telata do výcviku
  a chovná kráva – oxen.md), nejméně chovný pár.
- **Prasata jen na maso**, v lese celý rok – bez sena a zimního krmení; nosnost dál určuje les
  (1 ha na prase) a pasáci.
- **Pořadí, v jakém si stáda berou pastvu a seno:** voli (orají), krávy na mléko a voly, ovce,
  kozy (napřed křoviny), zbytek krav. Dřív se pastva dělila poměrně a seno měly jen krávy.
- **Pořadí chovu podle potřeby** (níž): přežvýkavci ovce, kozy, krávy; prasata a luštěniny s nimi
  od 19. 10. 2026 soupeří cenou v práci (Rovnovážné hospodaření – dřív prasata naposled).

#### Chovné stádo podle potřeby (porážka)

Martin na otázku „Má se chovné stádo zmenšovat podle toho, kolik masa ves potřebuje?“: „**ano**“.

- Při porážce (1. 11.) si ves nechá **chovný pár** od každého druhu a krávy na mléko a voly, a k nim
  ze stáda v nosnosti (pastva, les, seno, pasáci) tolik kusů, aby jejich **mléko** (85 % bílkovin
  – syrovátka odteče) a **maso z mláďat po ročních ztrátách** dalo bílkoviny, které ves potřebuje
  po obilí a vejcích, s rezervou. Které kusy a kolik, rozhoduje od 19. 10. 2026 **Rovnovážné
  hospodaření** (níž – cena v práci, rezerva 10 %; dřív pořadí ovce → kozy → krávy → prasata
  a čtvrtina navíc). Zbytek – **i dospělé kusy** – jde na maso. Chovné kusy pod nosností se
  nepřidávají, voli spřežení se nepočítají.
- **Rezerva** (návrh Clauda): ves do příští porážky roste (porody, nevěsty z okolí – pár procent
  ročně), odhad bílkovin z obilí je hrubý a zimní úhyn nebo neuhlídané kusy můžou stádo zmenšit.
  Víc by jen shnilo – maso vydrží jen do 31. 8. Dřív 25 %, od 19. 10. 2026 10 % (Rovnovážné
  hospodaření – víc stojí práci).
- **Krávy se zmenšují taky, ale ne pod mléko a voly** (rozhodnutí Clauda): jejich mléko i telata
  jsou tytéž bílkoviny jako ovce a prasata, takže bez zmenšování by rostly k nosnosti luk (Vlkov
  48 krav na 25 lidí) a každý rok daly tuny hovězího navíc; kráva na 2 domácnosti a 3 na ohradu
  ale zůstanou vždy.
- V roce zmenšení vznikne **jednorázový přebytek masa** – co se nesní do 31. 8., zkazí se.
- Když stádo potřebu nepokryje, platí dál: na maso jde, co přeroste nosnost, a když maso v zásobě
  s porážkou roční potřebu masa nepokryje, i letošní mláďata navíc – prasata první, nejvýš
  polovina (druhá stádo rozšíří) – nově **v pořadí prasata, krávy, kozy, ovce** (obráceně proti
  chovu: prasata jsou jen na maso, ovce mají růst nejrychleji; dřív prasata, ovce, kozy, krávy –
  s ročními ztrátami pak stádo ovcí skoro nerostlo). Pravidlo „stádo dávající 1,5× potřeby masa
  neroste“ nahradilo toto.

#### Pasáci

Martin: „**jeden ovčák/pasák krav – zvládne kočírovat jen omezené stádo ne? Že třeba vesnice, kde
mohou pást jen 2 malí kluci, nezvládne udržet stádo 100 krav**“.

- Jeden dospělý pasák uhlídá **40 krav** (i voli na pastvě), **100 ovcí nebo koz**, **50 prasat
  v lese**; **dítě 7–13 let 40 %** toho, **starší člověk 75 %**. Stádo potřebuje pasáků součet
  podílů (20 krav a 50 ovcí = 1 pasák).
- **Pes** (hra ho nevede) je v číslech – kosti psů jsou na raně středověkých sídlištích běžné
  (rozhodnutí Clauda). Literatura dává velké rozpětí (obecní pastýř pozdějších staletí pásl stovky
  kusů), ale s řemesly nesouvisí – jedno číslo, ne meze.
- **Kdo pase:** napřed děti od 7 let, pak starší – pasou při své malé práci, z práce vsi se jejich
  pasení neodečítá (jako dosud: „pasou děti“). Co nezvládnou, **pasou dospělí ze společné práce**
  (činnost `herding` v rozdělení práce dne), **nejvýš jeden dospělý z domácnosti** – ostatní jsou
  na poli. Stáda nepočkají, takže pasení jde jako dojení hned po denním minimu (rozhodnutí Clauda:
  při řazení podle konce pastevní sezóny na pasení v polní špičce nezbylo nic a startovní ves bez
  dětí 7–13 let – zakladatelské děti brzy dospějí – přicházela každý rok o čtvrtinu stáda
  s hodinou pasení denně).
- **Kdy:** krávy, voli, ovce a kozy od dubna do října (v zimě jsou v ohradě a u domů na seně),
  prasata v lese celý rok.
- **Nosnost:** ves sčítá od porážky do porážky, jaký podíl potřeby pasáci uhlídali; při porážce
  si nechá nejvýš ten podíl každého stáda – **co nikdo neuhlídal, jde na maso** a stádo nad to
  neroste. S chovným stádem podle potřeby se to skládá: stádo je nejvýš menší z obojího.
- **Ve scéně** stojí u stád pasáci z jádra – děti a starší, kteří dnes pasou, a dospělí pasáci
  (člověkoden = jeden), nejvýš jeden u každého stáda; rozdělení práce z doby před pasáky ukáže děti
  jako dřív.

#### Pastva a vždy s pasákem

Martin (19. 10. 2026): „**Stáda domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí
být nějaký člověk. Ten je bude primárně vodit na louky, určené ke spásání. Domácí zvířata by
neměla spásat jídlo pro lidi ani ho pošlapat a na čerstvém úhoru toho k pastvě také asi moc
není.**“ Mění dřívější pravidlo „na úhoru pasáček se zvířaty – mladý úhor vždy, louka na seno
jen po seči na otavě“ (18. 10. 2026). Detaily návrh Clauda:

- **Pastviny – louky určené ke spásání:** přirozené louky do 600 m a příloh ve fázi louky, kromě
  luk, které ves letos potřebuje na seno (plán seče 1. 6.; do něj loňský) – ty až po seči na
  otavě.
- **Mladý příloh (1–2 roky)** dá jen **třetinu píce** louky (plevel, výmladky obilí, řídký drn –
  rešerše: první roky přílohu porost teprve zapojuje); **louka letošní seče** jen **třetinu** –
  otavu od srpna do konce sezóny.
- **Osetý díl ani zralé obilí se nespásá nikdy** (ani strniště před sklizní – to ještě je obilí).
  **Strniště po sklizni ano** – paběrky do zorání; do nosnosti se nepočítá (pár týdnů, málo píce).
- **Jak se pastviny určí** (deterministicky, `pasture.ts` – `pastureGrazing`): potřeba pastvy stád
  (≈ 1 ha na krávu a vola, 0,2 ha na ovci a kozu) jde napřed na příloh ve fázi louky, který se
  letos neseče (od nejbližšího k obydlí, při shodě id), pak na přirozené louky mimo seč, pak na
  mladý příloh (třetinou) a nakonec na otavu posečených dílů. Díl, na který připadla aspoň
  polovina jeho plochy, se spásl a nezaroste. Totéž rozdělení určuje, kam chodí pasáček (síť
  pěšin) a kde se stáda pasou ve scéně.
- **Nosnost pastvy** (`pastureHa`): přirozená louka a louka přílohu mimo seč celé, mladý příloh
  a otava luk letošní seče třetinou; voli a pak krávy na mléko a voly, ovce, kozy, krávy (Skladba
  stáda). Dřív se pásl celý příloh (i mladý) naplno a louky na seno se počítaly i do pastvy.
- **Vždy s pasákem:** stádo bez pasáka se nepase. Jádro – pastva po dílech i roční zarůstání
  počítají jen s podílem stáda, který pasáci uhlídali (Pasáci), a co nikdo neuhlídal, jde při
  porážce na maso. Scéna – na pastvu jde jen tolik stád, kolik je dnes pasáků (děti a starší
  z jádra, dospělí podle člověkodní); když pasáků není dost, pasák vede víc zvířat najednou (ovce,
  kozy i krávy v jednom stádě, s prasaty jde do lesa jeden, až když jsou pasáci aspoň dva);
  stádo bez pasáka stojí u domů a nikam se nestěhuje. Pasák u stáda stojí a stádo se stěhuje jen
  s ním. V zimě (listopad–březen) jsou ovce, kozy a krávy u domů na seně (krávy s ohradou v ní),
  s pasákem jen prasata v lese.
- **Mimo jídlo pro lidi ve scéně:** stáda nikdy na osetém nebo zralém dílu, na louce před sečí,
  v sadu ani na záhonech pozemků (pozemek je oplocený); přechody mezi pastvinami vedou kolem.
- Slepice kolem domů a voli nebo krávy v ohradě pasáka nepotřebují.

#### Zimní krmení a zimní úhyn

Martin: „**Nezdá se mi, že bychom sklízeli tolik sena, že by to stáda uživilo.**“

- Seno přes zimu (listopad–březen) žerou **krávy (5 kg denně), voli (6 kg), ovce a kozy (1 kg)** –
  dávky malého raně středověkého skotu (≈ 200–250 kg); letnina pro ovce a kozy je počítaná jako
  seno. Výnos, práce seče a ztráty ve stohu – [orání rádlem](oxen.md), Seno.
- **Nosnost přes zimu** bere seno pro všechny, kdo ho jedí (voli první, pořadí výš).
- **Zimní úhyn (1. 3.):** krávy, ovce a kozy přežijí zimu i o polovičním přídělu sena (zhubnou);
  když dostaly méně, stádo se zmenší na tolik kusů, kolik by polovinu přídělu mělo – **chovný pár
  přežije** (odchová se z větví a slámy – rozhodnutí Clauda, aby druh ze vsi nezmizel navždy).
  Kronika a upozornění „Dobytek hynul – chybělo seno“. Voli jako dřív (oxen.md).
- Zimní péče o ovci nebo kozu **3 minuty denně** (krmení, voda) – práce se zvířaty.

#### Trvanlivost masa

Martin: „**A uzené maso určitě také nevydrží 3 roky.**“

- Uzené a sušené maso z podzimní porážky se jí **rovným dílem do 31. 8.** (šetřilo se na žně)
  a **1. 9. ráno se zbytek zkazí** – v létě žlukne tuk a maso napadá hmyz, soli bylo málo. Kronika
  a krátký řádek „Maso se zkazilo – N kg“. Vysychání 20 % ročně zůstává.
- Maso ze září a října (dosloužilé spřežení) se jí do porážky.
- Výhled energie do sklizně počítá maso jen do jeho zkažení.
- **Důsledek:** v září a říjnu ves uzené maso nemá – bílkoviny jen z obilí, luštěnin, mléka, sýra
  a vajec, nasycení ty dva měsíce kleslo (Vlkov ≈ 0,85).

#### Nouzová porážka

Martin, 19. 10. 2026: „**Ano, udělej to všechno**“ – na otázku, jestli má ves, které jídlo do
sklizně nevychází, napřed porazit zvířata navíc, než začne šetřit (Vlkov 9. 12. 781: 46 lidí,
zásoby ≈ 3,6 t na ≈ 4,2 t potřeby do žní, jí 94 % přídělu – a přitom drží přes zimu 52 prasat,
71 ovcí a 15,8 t sena). Podrobnosti jsou návrh Clauda.

- **Kdy:** každý den před jídlem. Když výhled jídla do sklizně (příděl rovným dílem do žní – Hlad
  a [fields.md](fields.md)) nevychází, ves dřív, než ubere z přídělu, porazí zvířata navíc. Je to
  čistá funkce stavu a dne, takže na tom, po jakých kouscích se ves dopočítá, nezáleží.
- **Pořadí:** napřed **prasata** (žerou les, ne seno), pak **kozy**, **krávy** nad chovné (kráva
  na 2 domácnosti a 3 na ohradu – mléko a voly) a **ovce** nad ovce na vlnu (Oděv – ty nikdy).
  **Chovný pár** každého druhu zůstane. Spřežení a telata ve výcviku jsou v ohradě, mimo stáda –
  na nouzovou porážku nejdou.
- **Kolik:** nejméně masa, se kterým výhled vyjde **i s rezervou 5 % potřeby energie do
  sklizně**. Výhled nezná ztráty zásob skladováním ani úbytek masa uzením – bez rezervy by ves
  porážela den co den po kouscích, s ní obvykle jednou za zimu (Vlkov: jednou, 23 prasat). Zabitím
  dojnic ubude i mléka do sklizně, výhled s tím počítá.
- **Maso** jde do zásoby jako z podzimní porážky – stejná výtěžnost (prase 50, koza 12, kráva
  120, ovce 15 kg), stejné uzení 20 % ročně, jí se rovným dílem do zkažení 1. 9. Porážka a uzení
  stojí 1 člověkoden na 20 kg; mimo listopad se udělá hned další dny (nedodělek listopadové
  porážky propadá). Mláďata ubudou poměrně.
- **Strop masa ve stravě 40 % energie platí i v nouzi.** Ves porazí jen tolik, kolik pod stropem
  pomůže; když schodek ani tak nepokryje (nebo jí dojdou zvířata navíc), dál šetří přídělem.
  Taková porážka, která schodek celý nepokryje, se udělá, jen když zvedne příděl **aspoň o 2
  procentní body** – jinak by ves po každém úmrtí (ubude ovcí na vlnu) a po jarních mláďatech
  porážela po kusech.
  Proč strop nezvedat (rozhodnutí Clauda): 40 % energie z masa přes celou zimu je už na hraně
  toho, co raně středověká ves jedla (obvykle 10–20 %); větší porážka by snědla chovné stádo, ze
  kterého má příští rok mléko a mláďata, takže by si ves hlad jen přesunula na další zimu; a jedno
  pravidlo stravy pro každý den je srozumitelnější než výjimka v nouzi. Vlkov se do stropu vejde
  (≈ 37 % energie z masa).
- **Kronika** `emergency-slaughter` (kg masa a kusy) a krátký řádek, jen fakt: „Vesničané porazili
  23 prasat navíc“.

#### Náměty (neimplementováno – Martin rozhodne)

- ~~**Vlna**~~ – od 19. 10. 2026 ve hře jako spodní hranice stáda ovcí (Oděv). Zůstává námětem
  přebytek sukna jako zboží k sousedům (trade.md) a oděv z kůží z porážky.
- **Kozy brzdí zarůstání:** pastva koz na křovinách by mohla zarůstání přílohu zpomalit (dnes ho
  zastaví jen pastva nebo seč ve fázi louky). Zasáhla by do zarůstání a sítě pěšin – zatím ne.
- **Podzimní porážka jehňat a kůzlat:** čerstvé maso v září a říjnu, kdy uzené došlo.
- **Nákazy:** výjimečný rok (dobytčí mor – Winchester 1319–1320 přišel o víc než polovinu skotu).

### Rovnovážné hospodaření (Martin, 19. 10. 2026; pravidla a čísla návrh Clauda)

Martin: „**ok, udělej to tak, aby ves hospodařila rovnovážně. Tj. aby byla sytá, měla ± ideální
kombinaci stravy, ale aby jí zároveň zbylo co nejvíce volného času na rozvoj.**“

Ves si spočítá, kolik práce ji stojí jídlo z každého zdroje, a skladbu stád a plochu luštěnin
volí tak, aby bílkoviny dostala nejlevněji. Obilí dál dorovná energii a seje se podle zásob (Osev
podle zásob – beze změny), stropy podílů energie a 1,6 g/kg zůstávají.

- **Cena jídla v práci** (`economy.ts` – `foodCosts`; za dnešních podmínek vsi, deterministicky ze
  stavu):
  - **obilí** – práce dílů, které ves právě oseje (kopání nebo orba spřežením, setí, pletí, žeň
    a odnos, výmlat – sazby s pokrytím nástroji, vzdálenost dílu), vracení drnu přílohu rozpočtené
    do let osevu, děleno čistou úrodou dílů podle dnešní úrodnosti (bez osiva); bez dílů v osevu
    typický díl (úrodnost 60). Typicky **≈ 0,6 člověkodne na kg** (nejhorší mez), s řemesly
    ≈ 0,4;
  - **luštěniny** – totéž se sazbami a úrodou luštěnin: ≈ 0,8 (s řemesly 0,5) čd/kg;
  - **seno** – sazba seče na hektar, vzdálenost luk letošní seče, výnos 1,5 t/ha a ztráta ve stohu
    do zkrmení: ≈ 0,013 (0,008) čd/kg.
- **Co dá a stojí chovný kus za rok** (`headEconomy`): maso z mláďat po ročních ztrátách a mléko
  dojných kusů (bílkoviny mléka 85 %); práce – seno na zimu, zimní péče (prasata celý rok, bez
  sena), dojení a sýr z poloviny mléka, porážka a uzení. Pasení: děti a starší pasou zdarma,
  dospělý pasák (když děti a starší nestačí) stojí celý den. **Maso a mléko nahradí obilí se
  stejnou energií** – kus tím ušetří práci na obilí, které ves nemusí vypěstovat. Za typické ceny
  (bez řemesel / s plnými řemesly):

  | Zdroj          | Práce za rok (čd) | Energie (kg obilí) | Bílkoviny navíc proti obilí (kg) | Cena kg bílkovin navíc (čd) |
  | -------------- | ----------------- | ------------------ | -------------------------------- | --------------------------- |
  | prase          | 3,7               | 22,8               | 4,2                              | šetří 10 / 5 čd za rok      |
  | ovce           | 3,2 / 2,5         | 6,0                | 0,6                              | šetří / 0,4                 |
  | koza           | 4,0 / 3,3         | 8,2                | 0,6                              | šetří / 0,3                 |
  | kráva          | 17,4 / 14,2       | 32,0               | 2,8                              | šetří / 0,65                |
  | luštěniny 1 kg | 0,83 / 0,52       | 1                  | 0,12                             | 1,8 / 1,1                   |
  | obilí samo     | 10 kg obilí       | 10                 | 1 (10 %)                         | 6,2 / 3,9                   |

  Prasata práci šetří vždy (žaludy v lese, bez sena), přežvýkavci bez řemesel taky, s řemesly
  (levnější obilí) stojí kilogram bílkovin desetiny člověkodne; luštěniny jsou nejdražší zdroj
  bílkovin navíc, ale pořád několikrát levnější než bílkoviny ze samotného obilí. **1,6 g/kg tak
  není absurdně drahé** – drahé je jen tam, kde ves nemá pastvu ani les a bílkoviny musí dát
  luštěniny (≈ 1–2 čd na kg, potřeba ≈ 17 kg na dospělého nad obilí).

- **Plán** (`sizeHerdsToNeed`, `balancedPlan`) – ves si ho spočítá 1. 6. (kolik sena posekat na
  zimní stádo), 1. 9. (kolik luštěnin osít) a 1. 11. (jaké chovné stádo si nechat – zbytek jde na
  maso), pokaždé stejně:
  1. **chovný pár** od každého druhu a **krávy na mléko a voly** (1 na 2 domácnosti, 3 na ohradu)
     vždy;
  2. **cena zdroje** = práce kusu (i dospělí pasáci) mínus práce na obilí, které jeho maso a mléko
     nahradí, na kilogram bílkovin navíc proti obilí; ves přidává po kusech (luštěniny po
     **25 kg**);
  3. **co práci šetří** (záporná cena), přidá vždy, i nad potřebu – **v pořadí ovce → kozy →
     krávy → prasata** (Martin – Skladba stáda: ovce napřed; ovce si tak berou i pasáky z dětí
     a starších první), až po nosnost (pastva, les, seno, pasáci) a stropy podílů energie (maso
     40 %, mléko a sýr 30 %, luštěniny 25 % – nad strop dá kus jen zbytek pod ním);
  4. pak do **potřeby bílkovin s rezervou 10 %** (růst vsi do příští porážky – dřív 25 %)
     **nejlevnější zdroj** – přežvýkavci v pořadí ovce → kozy → krávy, prasata a luštěniny s nimi
     soupeří cenou; nad **88 % potřeby** jen zdroj, jehož kilogram bílkovin nestojí víc práce než
     kilogram bílkovin z obilí. **„± ideál“ je 88–100 % bílkovin** – kvalita stravy 0,90–0,94
     (s ovocem víc); pod 88 % nasycení znatelně ubírá (porody, štěstí), nad potřebu bílkoviny nic
     nepřidají.
  - Proč ovce napřed i tam, kde jsou prasata levnější (rozhodnutí Clauda podle zadání „ovce
    přednost“): seřadit i šetřící zdroje jen podle ceny dalo v kalibraci vsi s prasaty a bez ovcí
    (ovce 2 na 10 lidí, prasata 36, maso 28 % energie, mléko 4 %) – prasata v lese šetří práci
    nejvíc, ale ovce jsou podle Martina hlavní zvíře.
- **Zásoba luštěnin stádo nezmenší** – sní se tak jako tak, stádo ale dává bílkoviny i příští rok.
  Dřív porážka stádo zmenšila podle zásoby luštěnin a další osev pak luštěniny zvětšil – ves
  klouzala od levnějších ovcí k dražším luštěninám.
- **Seč 1. 6.** se řídí plánem zimního stáda, **luštěniny 1. 9.** plánem (bez toho, co ze zásoby
  zbude – Osev podle zásob), **porážka 1. 11.** jím zmenší chovné stádo. Kde stádo potřebu nepokryje
  (malá ves, málo pastvy), platí dál maso z mláďat navíc (Chovné stádo podle potřeby).
- **Otevřené otázky (Martin):**
  - Bez řemesel se chov vyplácí víc než obilí a ves drží stáda až do nosnosti a stropů – strava
    pak může být až 40 % masa a 30 % mléka a sýra (kalibrace: maso 25 % energie, prasat 32 na
    10 lidí). Stropy se neměnily; jestli je to na raně středověkou ves moc, je to otázka stropů
    (nebo ceny chovu), ne plánu.
  - Ovce mají přednost jen mezi zdroji, které práci šetří. Mají jít napřed vždy (do nosnosti
    pastvy), i když prasata v lese ušetří víc práce? Skladba by byla jako dřív (ovce ≈ 44 na 10
    lidí), volné práce méně.

### Oděv (Martin, 19. 10. 2026; čísla návrh Clauda podle [rešerše](research/2026-10-19-herds-hay-meat.md))

Martin k rovnovážnému hospodaření (ovcí ubylo ze 44 na 15 na 10 lidí, prasat přibylo): „**Ovce
jsou hlavně kvůli vlně, aby se lidé mohli vůbec oblékat.**“

Oděv má dva díly – **vlnu** (svrchní oděv, plášť, přikrývky) a **len** (plátno – spodní oděv).
Ani jedno není zásoba v liště (Martin nechce nové suroviny): v rámci roku se zpracuje v domácí
práci.

#### Vlna

- **Potřeba:** dospělý a starší **1,6 kg surové vlny za rok**, dítě **0,8 kg** (kabátec, kalhoty
  nebo sukně, plášť, onuce a kápě, díl přikrývek podle doby nošení – rešerše, Vlna).
- **Výnos:** chovná ovce **0,8 kg za rok** (malé nešlechtěné ovce, stříž nebo vyčesání v květnu).
- **Ovce na vlnu** = potřeba ÷ výnos: **2 na dospělého, 1 na dítě** – ves ≈ 1,5–1,8 ovce na člověka
  (`woolSheep`).
- **Spodní hranice stáda:** ovce na vlnu si ves nechá vždy – při porážce, v plánu seče (seno na
  zimu) i v plánu luštěnin; teprve nad ní rozhoduje Rovnovážné hospodaření.
  - Pastva a seno: voli, **ovce na vlnu**, krávy na mléko a voly, další ovce, kozy, zbytek krav
    (rozhodnutí Clauda: oděv je nutnost, krávy nad chovný pár jsou na mléko a budoucí voly).
  - Pasáci hlídají napřed ovce na vlnu – když na celé stádo nestačí, ubude jiných kusů.
  - Když porážka bere na maso i mláďata navíc (maso nestačí), ovce na vlnu nebere.
- **Osadníci nové vsi** mají ovcí na vlnu pro všechny (2 dospělí a 2 děti – 6 ovcí místo 3)
  a **seno na první zimu** pro své stádo (jako obilí na 18 měsíců; co nesnědí, shnije s příští
  sečí – návrh Clauda, Martin potvrdil 19. 10. 2026): ves založená po seči by jinak v první zimě přišla o všechny ovce až
  na chovný pár a ovce na vlnu by odchovávala roky.
- **Kdy se rozhodne:** při porážce 1. 11. podle ovcí, které ves nechá přes zimu (stříž na jaře) –
  platí do další porážky (`LivestockState.wool`). Vsi uložené dřív se do první porážky nemění –
  stáda ani štěstí; hranici ale použije už plán seče 1. 6. a luštěnin 1. 9.
- **Když ovcí na vlnu není dost** (ves je neuživí – pastva, seno, pasáci –, nebo je ještě nemá):
  (Martin potvrdil 19. 10. 2026) kronika `wool-short` a krátký řádek **„Chybí vlna na oděv“** (až pod 95 % oděvu – ovce průběžně
  hynou a stádo na hranici by hlásilo drobnosti); štěstí ubere **až 6** podle chybějícího podílu
  (ovce na 2/3 oděvu → −2).
- **Ves bez ovcí** (návrh Clauda, Martin potvrdil 19. 10. 2026): jen štěstí – lidé chodí v obnošeném oděvu a v kůžích.
  Nemoci ani úmrtí ne (anti-cíl: ves nevymře kvůli oděvu), nákup vlny ne
  (Martin nechce nové suroviny, obchod vlnu nenabízí), oděv z kůží z porážky hra nevede (námět).
- **Práce:** stříž, praní, česání, předení, tkaní a šití jsou **součástí domácí výroby** (`DOMESTIC`
  – fields.md, Práce, bod 4: „oděv, nádobí, …“) – přerozdělení, ne práce navíc (návrh Clauda,
  Martin potvrdil 19. 10. 2026): domácí výroba dává 0,15 člověkodne na člověka denně ≈ 55 čd za rok, vlna z toho
  ≈ 21–24 čd na dospělého (≈ 150 h na kg vlny – rešerše). Práce navíc by oděv počítala dvakrát
  a ubrala volnou práci, se kterou kalibrace domácí výroby už počítá.

#### Len

Martin k ovcím na vlnu: „**A to mi připomíná, že na částech pole musí být zasetý len.**“ Pravidla
pole jsou ve [fields.md](fields.md) – Len, čísla **návrh Clauda** podle
[rešerše](research/2026-10-19-flax.md) (experimentální košile z Viborgu – Ribe 2011, historické
výnosy vlákna ze Skotska a Irska).

- **Potřeba:** dospělý a starší **2 kg třeného lnu za rok**, dítě **1 kg** – ≈ 3 m² hrubého plátna
  (≈ 1 kg látky) na dospělého: košile (u žen dlouhá košile jako hlavní oděv), díl spodního oděvu,
  šátků, ručníků a plachet; lněná košile nošená denně vydrží rok až dva. Na kg látky ≈ 2 kg
  třeného lnu (z vochlování ≈ 46 % dlouhého vlákna, část koudele na hrubé plátno).
- **Pole:** len je plodina na dílech pole (jař se setím na jaře a trháním v červenci), ≈ 550 kg
  třeného lnu z hektaru při plné úrodnosti – ves 30 lidí ≈ 0,1 ha ≈ 5 dílů. Obilí má přednost, len ho ubere nejvýš o svou plochu a jen ze zásob nad pojistku.
- **Kdy se rozhodne:** při trhání 31. 7. – sklizený len ÷ potřeba při plánu k 1. 9.
  (`VillageState.linen`), platí do dalšího trhání. Vsi uložené dřív se do prvního trhání po plánu
  se lnem nemění.
- **Když lnu není dost:** kronika `linen-short` a krátký řádek **„Chybí len na oděv“**; štěstí
  ubere **až 4** podle chybějícího podílu (vlna až 6 – svrchní oděv je proti zimě důležitější).
  Nemoci ani úmrtí ne (anti-cíl: ves nevymře kvůli oděvu).
- **Práce:** rosení, sušení, lámání, třepení, vochlování, předení, tkaní a šití jsou **součástí
  domácí výroby** jako u vlny – přerozdělení, ne práce navíc (rozhodnutí Clauda): dospělý ≈ 1 kg
  látky × ≈ 200 h ≈ 20 člověkodní za rok; s vlnou (≈ 21–24 čd) ≈ 45 z ≈ 125 člověkodní domácí výroby
  na dospělého. Předení a tkaní jsou přes 85 % času na oděvu (Ribe 2011) – len je na zpracování
  složitější než vlna, celkem ale vyjde podobně.

## Implementace (18. 10. 2026)

Rozhodnutí kontroléru tam, kde návrh nedává číslo nebo postup (Martin je může změnit):

- **Jídlo dne** (`eatDiet`): ztráta zásob (obilí podle nádob, maso uzením po dnech), pak ovoce
  **rovným dílem do zkažení** (1. 3.) a maso **rovným dílem do příští porážky** (1. 11.; od 19. 10. 2026 do zkažení 31. 8. – Trvanlivost masa), obojí
  nejvýš do svého stropu; obilí dorovná potřebu energie. Stropy (ovoce 25 %, maso 40 %) jsou
  podílem **potřeby** energie – bez obilí tak ves dostane nejvýš 65 % energie, samo ovoce 25 %.
  Když obilí do sklizně nevystačí, dělí se energie rovně do sklizně (s masem a ovocem, které ještě
  přijdou na řadu); když by obilí do zkažení ovoce nebylo potřeba, jí se do té doby jen maso
  a ovoce a obilí zůstane na dobu po nich (jako dřív u jablek).
- **Hlad z energie:** nahromaděný hlad i přirážka úmrtnosti za dnešní hlad počítají s energií,
  porody a štěstí s nasycením (energie × kvalita z bílkovin). Hlad v rozhraní (upozornění) =
  výhled energie. Ovoce se do výhledu počítá do zkažení, maso, luštěniny a vejce dnešním
  přídělem. **Mléko a sýr** (změna 19. 10. 2026 s osevem podle stravy, návrh Clauda): mléko stád
  od zítřka do sklizně podle doby dojení a celá zásoba sýra, dohromady nejvýš strop mléka a sýra
  za každý den (`milkAheadEnergy`, `milkEnergyBetween`). Dřív se mléko počítalo jen dnešní a sýr
  dnešním přídělem (v době dojení skoro nulovým) – dokud ves sela obilí na celou potřebu, nevadilo
  to; se zásobami podle stravy by každý podzim zbytečně šetřila a hlásila hlad.
- **Stáda** jsou čísla s podílem kusu (mláďata a porážka se počítají podílem stáda), panel
  a scéna je zaokrouhlí. Výchozí stádo dostane nová ves i ves uložená před dobytkem (z domácností,
  jako dřív ozdoba scény). **Mláďata 1. 4.** (stádo × roční růst).
- **Nosnost:** pastva = louka do 600 m od první zemnice (z krajiny při založení, simulace krajinu
  nemá) bez toho, co zabírají pole mimo příloh, zarůstající příloh (křoviny, mladý les), les vsi,
  sady, hřbitovy, pozemky a ohrady, plus příloh na vymýceném lese (pase se na celém přílohu ve
  fázi louky – mladém, pastvině i po seči); voli mají na pastvě přednost, ovce, kozy a krávy se
  o zbytek podělí poměrně. Les pro prasata = les do 600 m bez dílů polí založených v lese, s lesem
  vsi na bývalé louce ([pole – Les vsi](fields.md)). Krávy přes zimu jen tolik, kolik uživí seno
  po volech. **Od 19. 10. 2026** (Stáda realističtěji): pastva a seno podle přednosti (voli,
  krávy na mléko a voly, ovce, kozy – i na křovinách –, zbytek krav), seno pro krávy, ovce i kozy,
  a jen kolik pasáci uhlídali.
- **Pastva po dílech** (18. 10. 2026 – [pole – Zarůstání](fields.md), návrh Clauda): potřeba
  pastvy stád (≈ 1 ha na krávu a vola, 0,2 ha na ovci a kozu) se rozdělí po dílech přílohu ve
  fázi louky od nejbližšího k obydlí, každému nejvýš jeho plocha; zbytek se pase na loukách
  krajiny (ty nezarůstají). Díl, na který připadla aspoň polovina jeho plochy, se spásl – za rok
  nezaroste. Roční krok zarůstání (1. 11.) bere letní stáda před porážkou; síť pěšin a scéna
  berou stáda dne (v zimě krávy a voli v ohradě). Když stáda nestačí na celý příloh, vzdálené díly
  zarůstají, přestanou být pastvinou a nosnost klesne.
- **Porážka 1. 11.** (ráno, před jídlem): na maso jde, co přeroste nosnost; když zásoba masa
  s vejci na rok nepokryje potřebu, i letošní mláďata – prasata první (nejvíc masa), pak ovce,
  kozy, krávy – ale **nejvýš polovina mláďat** (druhá polovina stádo rozšíří; bez toho by ves
  snědla každé mládě a stádo by nikdy nevyrostlo). **Ves chová, kolik potřebuje:** když by chovné
  kusy ovcí, koz a prasat (bez letošních mláďat) mláďaty dalo aspoň 1,5× masa, které ves potřebuje
  (bílkoviny po obilí, mléku a vejcích), jdou jejich letošní mláďata na maso celá a stádo už
  neroste – jinak by rostlo až do nosnosti luk (stovky ovcí na
  pár lidí, maso by hnilo a porážka brala práci). Krávy rostou dál do nosnosti (telata pro voly).
  Chovný pár (nebo co ves má, když méně) zůstane. **Od 19. 10. 2026 nahrazeno** chovným stádem
  podle potřeby (Stáda realističtěji) – „1,5× potřeby“ a růst krav k nosnosti už neplatí.
  Práce na porážce a uzení (1 člověkoden na 20 kg) je sezónní práce v listopadu – od 19. 10. 2026
  před polními úlohami listopadu (ve Vlkově dřív celé spadla pod vracení přílohu a nikdy se
  neudělala).
- **Vejce:** slepice u obydlí každé domácnosti (zemnice 2, polozemnice 3 – jako ve scéně), 5 kg
  ročně na slepici, jí se čerstvá každý den.
- **Scéna:** stáda na pastvě podle skutečných počtů, v zimě krávy v ohradě (když ves nějakou má).

## Naměřeno (18. 10. 2026)

`measure-village.ts 200 60` se stravou a stády (hráč skriptu ohrady ani dílny nestaví – orba
a řemesla nepůsobí; měřeno před sloučením s řemesly). Cíle hladu měří energii, v závorce měření
po sloučení s `feat/landscape` bez stravy (fields.md – Naměřeno):

- **nasycení se stravou** (energie × pestrost): medián 0,94 (p10 0,87), maso medián 21 % energie
  (ves bez staveb 34 %), ovoce 0 % (sad skript nesází) – stáda dají maso od první porážky,
- **energie ≥ 0,95 celý rok, hráč staví:** 97,0 % let (74,3 %) – **OK**; bez staveb 99,7 %,
- **zásoby po sklizni:** p10 1,16, medián 2,13, p90 3,32 (0,81 / 1,15 / 1,51) – **MIMO** pásmo
  1–1,5: maso nahradí část obilí, ale ves dál oseje podle potřeby obilí (cíl osevu stravu nezná –
  k doladění),
- **po 60 letech (hráč staví):** medián 4 domácnosti a 19 lidí (2 a 10), vymřelo 0,5 % vsí (6 %),
- **práce na obživu:** startovní ves 89,8 %, plná domácnost 85,9 % (89 % a 84 %) – porážka a uzení
  přidají trochu práce,
- **štěstí** (informace): medián 46,5 (hráč staví), 39,9 (bez staveb); porody při nasycení 0,94
  jdou z 98 %.

## Naměřeno s bílkovinami (18. 10. 2026)

Krátké `measure-village.ts 20 20` (skutečné krajiny, hráč skriptu ohrady nestaví; jen orientačně –
dlouhá kalibrace poběží v noci):

- **bílkoviny** medián 100 %, **nasycení** medián 0,94 (p10 0,82); energie z masa 34 % (ves bez
  staveb 40 % – strop), z mléka a sýra 19 % (23 %),
- energie ≥ 0,95 celý rok 98,7 % let, nic nevymřelo; zásoby po sklizni medián 2,5 roční potřeby
  (maso a mléko nahradí část obilí – cíl osevu stravu nezná),
- **práce na obživu** startovní ves 95 % (dřív ≈ 90 %), plná domácnost 92 % (86 %) – dojení
  a péče o zvířata (≈ 5 % práce),
- jedna domácnost (6–7 lidí) po 12 letech chová ≈ **15 prasat, 7 ovcí, 3 kozy a 4 krávy** (po
  porážce), nadojí ≈ 700 l mléka ročně a potřebuje ≈ 470 kg masa ročně; maso jde ke stropu 40 %
  energie.

## Naměřeno s luštěninami (18. 10. 2026)

Krátké `measure-village.ts 20 20` (skutečné krajiny; nová kalibrace – čísla jen orientačně, dlouhá
kalibrace poběží v noci):

- **bílkoviny** medián 100 %, **nasycení** medián 0,94 (p10 0,84); energie (hráč staví) z masa
  **27 %** (dřív 34 %), z mléka a sýra 18 %, z luštěnin **19 %** (ves bez staveb 25 % – strop),
- **práce na obživu** startovní ves 94 % (dřív 95 %), plná domácnost 91 % (92 %) – luštěniny
  vezmou trochu víc práce (pletí, sklizeň), menší stáda ubudou péče,
- nasycení ≥ 0,95 celý rok 98,9 % let, nic nevymřelo; zásoby po sklizni medián 2,2 roční potřeby;
  štěstí medián 57,5 (hráč staví),
- jedna domácnost (7–8 lidí, 4 dospělí) po 13 letech chová ≈ **10 prasat, 6 ovcí, 3 kozy a 4–5
  krav** (dřív ≈ 15 prasat), nadojí ≈ 630–790 l mléka ročně, potřebuje ≈ 280–330 kg masa a ≈ 255–280
  kg luštěnin ročně; na dospělého (výpočet při ≈ 100 l mléka) ≈ **80 kg masa** (dřív ≈ 110)
  a ≈ 45 kg luštěnin (strop) ročně.

## Naměřeno v noci (19. 10. 2026)

`measure-village.ts 200 60` na kódu s bílkovinami, luštěninami a příbuzenstvím (977c18e; skutečné
krajiny, hráč skriptu ohrady ani dílny nestaví). Srovnání s měřením stravy výš (v závorce):

- **energie** (hráč staví): z masa **40 %** (21 %) – strop, z mléka a sýra **30 %** – strop,
  z luštěnin 14 %, obilí dorovná zbytek (≈ 16 %); bílkoviny medián 100 %, nasycení medián 0,94,
- **zásoby po sklizni:** p10 1,48, medián **3,55**, p90 5,91 (1,16 / 2,13 / 3,32) – **MIMO**;
  ves dál oseje podle potřeby obilí, ale jí hlavně maso a mléko,
- **práce na obživu:** startovní ves **93,9 %** (89,8 %), plná domácnost **89,9 %** (85,9 %) –
  **MIMO** (dojení, péče o zvířata, luštěniny),
- **oběh dílu:** osev / příloh **5 / 13 let** (3 / 13) – **MIMO**; nejspíš luštěniny vracejí
  úrodnost, takže díl se oseje déle,
- **po 60 letech (hráč staví):** medián 4 domácnosti a 19 lidí (4 a 19), vymřelo 1,0 % vsí
  (0,5 %) – příbuzenství růst vsi nezměnilo; nasycení ≥ 0,95 celý rok 99,4 % let – **OK**,
- **štěstí** medián 53,3 (46,5).

Závěr (k rozhodnutí Martina): maso a mléko na stropech jsou na rané Slovany hodně – strava byla
převážně obilná. K doladění: cíl osevu podle stravy, nižší stropy masa a mléka, nebo menší potřeba
bílkovin pokrytá luštěninami. **Martin 19. 10. 2026:** „Zatím udělejme osev podle stravy. Já
později zjistím, proč tam máme tuhle disbalanci.“ – viz [pole – Osev podle stravy](fields.md)
(stropy a podíly masa, mléka a luštěnin se nemění).

## Naměřeno s osevem podle stravy (19. 10. 2026)

Krátké `measure-village.ts 20 20` před změnou a po ní (stejné vsi a krajiny; jen orientačně –
dlouhá kalibrace poběží v noci). Zásoby po sklizni se po změně měří jako zásoby obilí v ročních
potřebách z pole (pravidlo zásob v plánu osevu), v závorce dřívějším měřítkem (v ročních
potřebách celé energie):

| 20 vsí × 20 let                                  | Před (osev na celou potřebu)  | Po (osev podle stravy)                    |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------- |
| zásoby po sklizni p10 / medián / p90, hráč staví | 1,16 / 2,35 / 3,33 (celé en.) | 1,02 / 1,38 / 2,13 (medián 0,81 celé en.) |
| zásoby v pásmu 1–1,5                             | 19 % let                      | 55 % let – **MIMO** jen p90               |
| práce na obživu – startovní ves / plná dom.      | 93,3 % / 89,7 % (**MIMO**)    | 80,6 % / 71,3 % (**MIMO** – pod pásmem)   |
| osev startovní ves / plná domácnost              | 1,53 / 2,50 ha                | 0,63 / 1,22 ha (podíl z pole 0,33 / 0,38) |
| oběh dílu – roky osevu / přílohu                 | 5 / 13                        | 8 / 8 (**MIMO**, cíl 3 / 13–14)           |
| nasycení ≥ 0,95 celý rok – staví / nestaví       | 99,5 % / 99,7 % let           | 100 % / 100 % let                         |
| nasycení se stravou – medián (p10)               | 0,94 (0,84)                   | 0,94 (0,84)                               |
| po 20 letech domácností / lidí (medián)          | 2 / 12                        | 2 / 12                                    |
| zemnice / polozemnice čerstvě plnou domácností   | 163 / 572 dní (**MIMO**)      | 73 / 243 dní (**OK**)                     |
| pole / osev na domácnost na konci                | 14,4 / 2,14 ha                | 7,7 / 1,38 ha                             |

- **Podíl jídla z pole** (hráč staví, 20 let – stáda ještě rostou): medián 55 % (p10 42 %,
  p90 83 %); sondy pevných domácností v ustáleném oběhu 0,33 a 0,38 – skoro na pojistce 0,3
  (maso a mléko na stropech, luštěniny na stropu 25 % – obilí tak dorovná jen ≈ 5–10 % energie).
- **Zásoby:** medián v pásmu, p90 2,1 – nad pásmem budou nejspíš roky, kdy podíl z pole rychle
  klesá (stáda rostou – ves seje podle loňska), a první roky se startovními zásobami (neověřeno).
- **Práce na obživu pod pásmem:** pole teď bere málo práce, protože maso a mléko pokryjí ≈ 45–70 %
  energie – ves má hodně společné práce (staví rychleji – zemnice a polozemnice jsou zpět
  v pásmu). Je to ta disbalance stravy, kterou chce Martin prověřit; osev podle stravy ji jen
  odkryl.
- **Oběh dílu** je dál od cíle: luštěniny teď tvoří většinu osevu (25 % energie z ≈ 33 %
  z pole) a vracejí úrodnost, takže díl se oseje 8 let po sobě (dřív 5) – pravidla luštěnin se
  neměnila.
- **Nasycení drží:** ≥ 0,95 ve všech letech, bez jakéhokoli hladu 99 % let. Cestou: první verze
  (práh zásob i s luštěninami, výhled jen s dnešním mlékem) měla nasycení ≥ 0,95 jen v 79 % let –
  část byla chyba měření (skript přehrával jídlo bez mléka dne); s výhledem s mlékem do sklizně
  a opraveným měřením 95,8 % let, se zásobami v obilí 100 %.
- **Od 19. 10. 2026 osev podle zásob** ([pole – Osev podle zásob](fields.md)): pojistka zásob
  z celé potřeby energie místo „zásoby obilí na 1–1,5 roku potřeby z pole“.

## Naměřeno se stády realističtěji (19. 10. 2026)

**Vlkov** (stav z lokální DB, 28. 7. 749, 25 lidí, 4 obydlí, ohrada bez spřežení) dopočítaný o 5 let
**bez krajiny** – seno jen z přílohu, přirozené louky se nesečou; jen orientačně:

| Vlkov                                | před (dosavadní pravidla)               | po (stáda realističtěji)                                   |
| ------------------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| stádo k 1. 11. 749 (po porážce)      | 30 ovcí, 10 koz, 53 prasat, 39 krav     | 41 ovcí, 14 koz, 21 prasat, 38 krav                        |
| stádo k 1. 11. 753 (po porážce)      | 30 ovcí, 10 koz, 53 prasat, 12 krav     | 94 ovcí, 2 kozy, 32 prasat, 3 krávy                        |
| maso 1. 3. (750 → 754)               | 6,6 → 8,2 t – hromadí se                | 4,2 → 1,9 t                                                |
| porážka za rok (750–753)             | 3,0–5,7 t                               | 4,0 t (zmenšení krav), pak 1,6–2,7 t                       |
| zkažené maso 1. 9.                   | –                                       | 4,5 t (749 – starý sklad), 2,6, 1,6, 0, 0,1 t              |
| seno 1. 3. / seč za rok              | 3,4–28 t / 85–99 čd na 18–21 t          | 3,5–43 t / 213–247 čd na 18–21 t                           |
| práce porážky za rok                 | 0 čd (pod vracením přílohu se nedělala) | 80–264 čd                                                  |
| pasení                               | –                                       | potřeba 3,8 → 1,7–2,1 pasáka; 5 dětí 7–13 a 2 starší = 3,5 |
| nasycení listopad–srpen / září–říjen | 94–95 % / 94–95 %                       | 94–95 % / 85–86 % (bez masa, bílkoviny ≈ 71 %)             |

Vlkov tak má po pár letech převážně ovce (seno z přílohu je úzké místo a ovce mají přednost), tři
krávy (dvě domácnosti na krávu, tři na ohradu), prasata na zbytek potřeby masa a pase hlavně děti;
dospělí pásli jen první podzim (32 čd), než se stádo zmenšilo.

**Kalibrace** `measure-village.ts 20 20` (skutečné krajiny, hráč skriptu ohrady ani dílny nestaví;
jen orientačně – dlouhá kalibrace poběží v noci):

| Cíl                                        | před                               | po                                                            |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------- |
| nasycení se stravou (hráč staví) medián    | 0,94 (bílkoviny 100 %)             | 0,91 (bílkoviny 92 %)                                         |
| energie z masa / mléka a sýra / luštěnin   | 28 / 18 / 18 %                     | 13 / 10 / 10 %                                                |
| stádo na konci na 10 lidí (medián)         | 19 krav, 19 prasat, 8 ovcí, 3 kozy | 2 krávy, 12 prasat, 44 ovcí, 12 koz                           |
| maso v zásobě na konci / porážka za rok    | 39 kg / 48 kg na člověka           | 14 kg / 31 kg na člověka                                      |
| zkažené maso / zimní úhyn                  | – / –                              | 1,7 % masa z porážek / 0,3 kusu na ves                        |
| zásoby po sklizni (medián, v pásmu 1–1,5)  | 2,35 (19 % let v pásmu)            | 1,56 (38 % let)                                               |
| nasycení (energie) ≥ 0,95 celý rok         | 99,5 % let – OK                    | 95,0 % let – OK (p1 0,64)                                     |
| práce na obživu startovní / plná domácnost | 93,3 / 89,7 %                      | 92,0 / 93,9 % (plná – bez dětí pasou dospělí, víc práce seče) |
| štěstí (hráč staví) medián                 | 54,7                               | 51,0                                                          |
| po 20 letech domácností / lidí, vymřelo    | 2 / 12, 0 %                        | 2 / 12, 0 %                                                   |

Bílkoviny klesly pod potřebu: stáda omezuje seno (práce seče je víc než dvojnásobná) a krávy
s velkým mlékem ubyly; v září a říjnu ves uzené maso nemá. Martinova potřeba 1,6 g/kg a stropy
masa a mléka zůstaly beze změny (rozhodne Martin).

## Naměřeno – pastviny a vždy s pasákem (19. 10. 2026)

Krátké `measure-village.ts 20 20` před a po (skutečné krajiny; jen orientačně): nasycení medián
0,91 → 0,91, bílkoviny 91,1 → 91,4 %, maso 11,3 → 11,1 % energie, stádo na konci na 10 lidí
krávy 2,0 → 2,1, prasata 9,5 → 9,2, ovce 45,0 → 43,8, kozy 6,1 → 10,3, porážka 27 kg na člověka
a rok beze změny, zarůstání („pole o polovinu větší“) 65,2 % beze změny. Vsi kalibrace mají louky
navíc a stáda menší než nosnost (chovné stádo podle potřeby) – úbytek pastvy (mladý příloh
a louky na seno jen třetinou) se projeví hlavně v menší skladbě ovcí, místo nich víc koz
(spasou křoviny).

## Naměřeno – rovnovážné hospodaření (19. 10. 2026)

Krátké `measure-village.ts 20 20` před a po (skutečné krajiny; jen orientačně – velký běh v noci).
Nový řádek **Práce – hráč staví** sčítá rozdělení práce dne po skupinách (od 3. roku vsi, na
člověka a rok):

| Hráč staví (na člověka a rok, čd)             | před                    | po                       |
| --------------------------------------------- | ----------------------- | ------------------------ |
| volná práce (stavby, opravy, nevyužitá)       | 6,8 (3,4 % práce)       | 7,8 (3,9 %)              |
| domácí práce (minimum a domácí výroba)        | 90,6                    | 97,1 (dohnaný skluz)     |
| pole / seč / zvířata / dospělí pasáci         | 66,7 / 8,4 / 10,6 / 8,8 | 61,4 / 5,4 / 10,8 / 10,5 |
| společná práce domácnosti (čd za rok)         | 29                      | 42                       |
| nasycení / kvalita stravy (medián)            | 0,91 / 0,91             | 0,93 / 0,93              |
| bílkoviny (medián)                            | 91,4 %                  | 96,8 %                   |
| energie z masa / mléka a sýra / luštěnin      | 11,1 / 10,9 / 16,3 %    | 24,6 / 5,6 / 1,9 %       |
| stáda na 10 lidí – krávy, prasata, ovce, kozy | 2,1 / 9,2 / 43,8 / 10,3 | 5,0 / 31,6 / 14,9 / 13,9 |
| nasycení ≥ 0,95 celý rok (cíl ≥ 95 %)         | 97,1 % let              | 95,3 % let               |

- **Práce na obživu** (cíle fields.md – Kalibrace): startovní ves 87,2 → 85,9 %
  (cíl 85–90 % – OK), plná domácnost 87,4 → 85,9 % (cíl 75–85 % – pořád MIMO, blíž). Pole
  o polovinu větší 65 → 40 % dílů ladem (cíl ≈ 1/3 – nově OK), oběh dílu 5/13 → 3/13 let (OK),
  rezerva práce ve špičkách OK (jaro 99 %, léto 41 %, podzim jen 6 %).
- Volná práce roste méně, než ušetří stáda: vsi kalibrace jsou na hraně práce (domácí výroba
  měla skluz – dohnala ho o 6,5 čd na člověka), takže úspora jde napřed tam. Bez dětí a starších
  stojí pasení dospělé (dospělí pasáci 8,8 → 10,5 čd).
- **Hlad:** roky s nasycením ≥ 0,95 97,1 → 95,3 % (cíl splněn těsně), nejnižší nasycení p1 0,63 →
  0,53 – ves víc jí maso a méně seje, výpadek stáda (porážka, úhyn) se víc projeví. Osev podle
  zásob (pojistka z celé energie) se neměnil.
- **Skladba:** ovce mají přednost jen mezi zdroji, které práci šetří – na skutečných krajinách
  (obilí ≈ 0,5 čd/kg, pasáci) ovce práci skoro nešetří a prasata v lese hodně, takže prasat je
  víc. Kdyby ovce šly napřed vždy (do nosnosti pastvy), skladba by byla jako dřív a úspora menší.
- **Vlkov** (kopie stavu 30. 5. 767, 31 lidí, 5 let bez krajiny): stáda ovcí
  113 → 124, prasat 42 → 53 (les), seč 288–305 → 280–321 čd, luštěniny k osevu 2,0–3,6 → 1,2–3,0
  ha, nasycení průměr let 0,924 → 0,936 (bílkoviny 83–98 → 91–98 %), volná práce průměrně 38 →
  39 čd na člověka a rok. Volnou práci Vlkova řídí hlavně kolísání osevu podle zásob (pole 30–89
  čd na člověka podle roku) – rovnovážné hospodaření ho nemění.

## Naměřeno – ovce na vlnu (19. 10. 2026)

Krátké `measure-village.ts 20 20` před a po (skutečné krajiny; jen orientačně – velký běh v noci):

| Hráč staví                                       | před                     | po                       |
| ------------------------------------------------ | ------------------------ | ------------------------ |
| stáda na 10 lidí – ovce, kozy, krávy, prasata    | 14,9 / 13,9 / 5,0 / 31,6 | 50,7 / 2,5 / 2,1 / 27,7  |
| porážek s nedostatkem vlny                       | –                        | 1,5 % (1.–2. rok vsi)    |
| volná práce (čd na člověka a rok)                | 7,7                      | 7,5                      |
| seč / zvířata / dospělí pasáci / domácí          | 5,4 / 10,9 / 10,5 / 98,6 | 8,7 / 12,5 / 13,0 / 95,7 |
| nasycení / kvalita stravy (medián)               | 0,92 / 0,93              | 0,93 / 0,94              |
| bílkoviny, energie z mléka a sýra                | 96,9 %, 5,7 %            | 98,6 %, 9,3 %            |
| štěstí (medián)                                  | 53,5                     | 54,4                     |
| nasycení ≥ 0,95 celý rok (cíl ≥ 95 %), bez hladu | 93,7 %, 91,6 % let       | 93,7 %, 93,2 % let       |

- Ovce na vlnu berou pastvu a pasáky z dětí a starších napřed – nad hranicí pak práci šetří víc
  než kozy a krávy, takže ovcí je víc než jen na vlnu (≈ 5 na člověka, hranice ≈ 1,6) a koz
  a krav (mimo krávy na mléko a voly) méně. Práce na stáda a seno přibylo ≈ 5 čd na člověka
  a rok, volná práce skoro beze změny (o 0,2 čd méně).
- Nedostatek vlny zůstal jen v prvních dvou letech vsí, které ještě rostou; bez sena osadníků
  na první zimu a bez ochrany jehňat ovcí na vlnu to byla polovina porážek (prvních ≈ 10 let).
- **Vlkov** (kopie stavu 3. 3. 770, 33 lidí, 5 let bez krajiny): ≈ 100 ovcí, hranice ≈ 50 –
  beze změny (vlna 100 % každý rok, práce, strava i stáda stejně jako před).

## Co hráč vidí

- V horní liště **obilí, luštěniny, maso, mléko a sýr, ovoce** (ikony + čísla) a nasycení;
  tooltip nasycení ukáže energii a bílkoviny a podíly (ikony obilí / luštěniny / maso / mléko
  a sýr / vejce / ovoce s procenty).
- Stáda ve scéně odpovídají skutečnému počtu zvířat, u stád stojí pasáci; na podzim porážka,
  nouzová porážka („Vesničané porazili 23 prasat navíc“), 1. 9. zkažené maso a po zimě úhyn stáda
  (krátké zprávy).
- V panelu ohrady a u stád počty zvířat a nosnost (ikony + čísla).

## Rozhodnutí

| Rozhodnutí                                                                                                                                      | Kdo                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Jablka → „ovoce“ (ikona zůstane); ovoce zvyšuje nasycení i štěstí                                                                               | Martin                 |
| Plné nasycení jen z kombinace obilí–maso–ovoce; samo obilí ani ovoce nestačí                                                                    | Martin                 |
| Maso z dobytka (prasata v lese, přebytky ovcí, koz, krav), vejce; lov a rybolov později                                                         | Martin potvrdil směr   |
| ~~Podíly 75 / 20 / 5 %, pestrost 0,80 + 0,14 × maso + 0,06 × ovoce~~; strop ovoce 25 %, masa 40 %                                               | návrh Clauda           |
| Maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné váhy; mléko a sýr ze všech dojných zvířat                                                   | Martin (18. 10. 2026)  |
| Práce se zvířaty se počítá (dojení, sýr, zimní péče, prasata a slepice), pasení bez práce                                                       | Martin (18. 10. 2026)  |
| Kvalita stravy 0,60 + 0,34 × bílkoviny + 0,06 × ovoce; strop mléka a sýra 30 % energie                                                          | návrh Clauda           |
| Váhy 20 / 60 / 58 kg, bílkoviny potravin, dojivost, sýr, práce – podle rešerše 18. 10. 2026                                                     | návrh Clauda (rešerše) |
| Dojí se 40 % skotu a 50 % ovcí a koz; sýr do 1. 5., ztráta 15 %/rok; potřeba masa z bílkovin                                                    | návrh Clauda           |
| Hladem se umírá jen z nedostatku energie, pestrost řídí porody a štěstí                                                                         | návrh Clauda           |
| Růst stád, nosnost (pastva, les, seno), porážka a výtěžnost masa, vejce, uzení 20 %/rok                                                         | návrh Clauda           |
| ~~Potřeba masa z podílu 20 % energie (≈ 60 kg na dospělého)~~ – nahrazeno bílkovinami                                                           | rozhodnutí kontroléru  |
| Ovoce do zkažení a maso do porážky rovným dílem; stropy z potřeby energie                                                                       | rozhodnutí kontroléru  |
| Pastva = louka do 600 m bez polí a staveb + příloh; na maso navíc nejvýš polovina mláďat                                                        | rozhodnutí kontroléru  |
| Ves chová, kolik potřebuje – stádo dávající 1,5× potřeby masa neroste (krávy ano)                                                               | rozhodnutí kontroléru  |
| Pastva po dílech přílohu od nejbližšího; zarůstající příloh a les vsi nejsou pastvinou                                                          | návrh Clauda           |
| 1,6 g/kg zůstává, přidají se luštěniny jako plodina na poli; maso mírně zvyšuje štěstí                                                          | Martin (18. 10. 2026)  |
| Luštěniny 22 % bílkovin, energie jako obilí; strop 25 % energie; jí se rovným dílem do sklizně                                                  | návrh Clauda (rešerše) |
| Cíl luštěnin z bílkovin po obilí, mléku a vejcích; potřeba masa až po luštěninách (podle zásoby)                                                | návrh Clauda           |
| Maso štěstí až +3 – plně od 20 % energie z masa, méně poměrně                                                                                   | návrh Clauda           |
| Osev podle stravy – ves seje obilí a luštěniny jen na energii, kterou nedá maso, mléko a ostatní                                                | Martin (19. 10. 2026)  |
| Výhled jídla do sklizně s mlékem stád podle doby dojení a s celou zásobou sýra                                                                  | návrh Clauda           |
| Doplnit roční ztráty stáda; seno i pro ovce a kozy; uzené maso nevydrží roky                                                                    | Martin (19. 10. 2026)  |
| Ztráty ovce 12, kozy 10, prasata 12, skot 6 % ročně po dnech; mláďata jsou po zmetání                                                           | návrh Clauda (rešerše) |
| Skladba: ovce napřed, kozy mléko a křoviny, krávy voly a mléko, prasata maso, les celý rok                                                      | Martin (19. 10. 2026)  |
| Chovné stádo se zmenšuje podle potřeby masa (bílkovin) – i dospělé kusy jdou na maso                                                            | Martin (19. 10. 2026)  |
| ~~Rezerva 25 %; chov ovce → kozy → krávy → prasata~~; krávy aspoň 1 na 2 domácnosti a 3 na ohradu                                               | návrh Clauda           |
| Pasáci omezují stádo – co nikdo neuhlídá, jde na maso; pasou děti, starší, pak dospělí                                                          | Martin – nápad         |
| Pasák 40 krav, 100 ovcí či koz, 50 prasat (pes v číslech); dítě 40 %, starší 75 %                                                               | návrh Clauda (rešerše) |
| Dospělý pasák nejvýš jeden z domácnosti, pasení hned po dojení (stáda nepočkají)                                                                | návrh Clauda           |
| Seno denně: kráva 5, vůl 6, ovce a koza 1 kg; zimní úhyn pod půlkou přídělu, pár přežije                                                        | návrh Clauda (rešerše) |
| Uzené maso se jí do 31. 8., pak se zkazí; seno ztrácí 10 % ročně, staré do nové seče shnije                                                     | návrh Clauda (rešerše) |
| Mláďata navíc na maso: prasata, krávy, kozy, ovce; porážka před polními úlohami listopadu                                                       | návrh Clauda           |
| Stádo vždy s pasákem; pase se na loukách určených ke spásání, ne na jídle pro lidi                                                              | Martin (19. 10. 2026)  |
| Mladý příloh a otava luk letošní seče třetinou píce; strniště po sklizni ano, bez nosnosti                                                      | návrh Clauda (rešerše) |
| Pastviny: louka přílohu mimo seč, přirozené louky, mladý příloh, otava – od nejbližšího                                                         | návrh Clauda           |
| Málo pasáků – pasák vede víc zvířat; bez pasáka stádo stojí u domů; v zimě u domů                                                               | návrh Clauda           |
| Ves hospodaří rovnovážně – sytá, ± ideální strava a co nejvíc volného času na rozvoj                                                            | Martin (19. 10. 2026)  |
| Cena jídla v práci za podmínek vsi; plán po kusech podle ceny kg bílkovin navíc proti obilí                                                     | návrh Clauda           |
| Co práci šetří, vždy – v pořadí ovce → kozy → krávy → prasata, do nosnosti a stropů                                                             | návrh Clauda           |
| Pak do potřeby + 10 % nejlevnější (prasata a luštěniny po 25 kg soupeří cenou), nad 88 % jen levnější než obilí; zásoba luštěnin stádo nezmenší | návrh Clauda           |
| Ovce jsou hlavně kvůli vlně – aby se lidé mohli vůbec oblékat                                                                                   | Martin (19. 10. 2026)  |
| Vlna 1,6 kg na dospělého (dítě 0,8), ovce 0,8 kg – 2 ovce na dospělého jako spodní hranice stáda                                                | návrh Clauda (rešerše) |
| Pastva a seno: voli, ovce na vlnu, krávy na mléko a voly; pasáci napřed ovce na vlnu                                                            | návrh Clauda           |
| Bez vlny jen štěstí až −6 a upozornění; práce na vlně v domácí výrobě (přerozdělení, ne navíc)                                                  | Martin (19. 10. 2026)  |
| Osadníci mají ovce na vlnu a seno na první zimu; jehňata ovcí na vlnu nejdou na maso navíc                                                      | Martin (19. 10. 2026)  |
| Na částech pole musí být zasetý len                                                                                                             | Martin (19. 10. 2026)  |
| Len 2 kg třeného lnu na dospělého (dítě 1); bez lnu štěstí až −4; zpracování v domácí výrobě                                                    | návrh Clauda (rešerše) |
| Nouzová porážka – ves, které výhled jídla do sklizně nevychází, napřed porazí zvířata navíc, pak šetří                                          | Martin (19. 10. 2026)  |
| Pořadí prasata → kozy → krávy nad chovné → ovce nad ovce na vlnu; chovný pár, spřežení a telata zůstanou                                        | Martin (19. 10. 2026)  |
| Kontrola každý den před jídlem; porazí, aby výhled vyšel s rezervou 5 % potřeby do sklizně; částečně jen o 2 body přídělu a víc                 | návrh Clauda           |
| Maso, uzení, zkažení 1. 9. a práce jako z podzimní porážky; strop masa 40 % platí i v nouzi                                                     | návrh Clauda           |
