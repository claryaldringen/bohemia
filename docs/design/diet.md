# Strava a dobytek – obilí, luštěniny, maso, mléko a sýr, vejce, ovoce

Stav: schváleno 18. 10. 2026 (Martin: „Ano“), **implementováno 18. 10. 2026** – jádro
`domain/village/diet.ts` (jídlo dne), `dairy.ts` (mléko, sýr, práce se zvířaty), `livestock.ts`
(stáda, porážka, vejce), `husbandry.ts` (den hospodářství); scéna kreslí skutečná stáda.
**Týž den změna (Martin):** maso není kvůli energii, ale kvůli **bílkovinám – 1,6 g na kg tělesné
váhy**; bílkoviny dává obilí, mléko a sýr, maso a vejce („Ovce, kozy i krávy jsou mléčná
zvířata“) a **práce se zvířaty se počítá** – viz Bílkoviny, Mléko a sýr, Práce se zvířaty
(implementováno; čísla z [rešerše](research/2026-10-18-dairy-protein.md)). **Další změna
(Martin, 18. 10. 2026):** „c) ale maso bude mírně zvyšovat štěstí“ – 1,6 g/kg zůstává, přidají
se **luštěniny** jako plodina na poli (od 9. 11. 2026 už jen zboží – Martin je z polí vyřadil)
a **maso mírně zvyšuje štěstí** – viz Luštěniny (implementováno, `legumes.ts`; [rešerše](research/2026-10-18-legumes.md)). **Stáda
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

- **Luštěniny už ne z pole (Martin, 9. 11. 2026):** „Luštěniny jsou podle mě píčovina. Co vím,
  tak je lidi pěstovali spíš doma na zahrádkách než na velkých polích…“ – ves je na poli nesel
  ([fields.md](fields.md), Luštěniny, zrušeno; zahrádky u obydlí probereme později). Zůstávají
  **zbožím**: zásoba (obchod, platby, dávky, dorůstající luštěniny starších vsí) se jí jako dosud
  – rovným dílem do července, nejvýš strop, bílkoviny navíc proti obilí. Ves bez zásoby jí obilí;
  bílkoviny, které chybí, dorovná maso a mléko stád (Chovné stádo podle potřeby).
- **Luštěniny** (hrách a čočka): **22 % bílkovin**,
  energie jako obilí (3 400 kcal/kg). Strop **25 % energie** ze stravy (dospělý ≈ 45 kg ročně;
  rešerše: chléb čeledi v Mordenu 17–26 % hrachu – strop je návrh Clauda).
- ~~**Kolik jich ves chce**~~ (do 9. 11. 2026 – cíl osevu luštěnin padl): každý kg luštěnin místo
  obilí se stejnou energií dá o **12 dkg bílkovin víc** (22 % proti 10 %). Od 19. 10. 2026 rozhodne **Rovnovážné hospodaření** (níž) – luštěniny
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
- **Porody** brzdí jen **energie** (pod 50 % se nerodí, plně od 95 %; Martin, 25. 10. 2026: „Ok, ať
  porody brzdí jen opravdový hlad.“ – návrh Clauda, schválený). **Nasycení** (energie × kvalita
  z bílkovin) dál řídí štěstí (hlad ubírá štěstí, pod 90 %). Nedostatek bílkovin tak sníží jen
  štěstí – ves jen s obilím (≈ 80 %) se množí naplno, je méně šťastná a neumírá.

### Mléko a sýr (Martin: „Ovce, kozy i krávy jsou mléčná zvířata“; čísla rešerše)

- **Dojí se samice, které letos rodily** (od 19. 10. 2026 – Porážka v zimě, Martin: „Navíc ovce,
  krávy i kozy musí být neustále březí aby dávaly mléko.“): rodí všechny chovné samice, takže dojné
  jsou dospělé kusy stáda bez letošních mláďat × podíl chovných samic (krávy 50 %, ovce a kozy
  70 % – Rodí všechny samice); mléka je úměrně letošním porodům. Dřív pevný podíl celého stáda
  i s mláďaty – skot **40 %**, ovce a kozy **50 %** (návrh Clauda – hra nevede samice po kusech);
  s novými podíly vyjde stejně, u krav o 4 % víc. V listopadu (krávy napůl) se počítají i letošní
  jalovice – mláďata se 1. 11. přestanou vést zvlášť. Mléko pro lidi (po vykrmení mláděte) za rok
  na dojnou samici: kráva
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
- **Bokem – mimo práci vsi** (Martin, 19. 10. 2026: „Zvířata a pasáci – to obstarají výrostci,
  takže do práce je nemusíme počítat, jsou úplně bokem.“ a „Dojení a péče o zvířata – to obvykle
  dělají ženy.“): dojení, sýr a péči obstarají ženy, pasení výrostci (Pasáci). Z práce vsi neberou
  a nic je neomezuje – podojí se vždy celé dojné stádo. Sazby výše se počítají dál jen pro postavy
  ve scéně (ženy u domů dojí, v zimě u ohrady). Dřív šla práce se zvířaty hned po denním minimu
  a co se nepodojilo, to se nenadojilo ([fields.md](fields.md) – Práce).

### Dobytek – stáda a maso

- **Výchozí stádo** (dnes ozdoba – stane se skutečným): na domácnost 3 ovce, 1 koza, 2 prasata,
  slepice u obydlí; jedna kráva na 2 domácnosti. Stáda **rostou** (od 19. 10. 2026 rodí všechny
  chovné samice – ovce +64 %, kozy +78 %, prasata +144 %, krávy +40 % ročně, Porážka v zimě; dřív
  ovce a kozy +40 %, prasata +100 %, krávy +20 % – návrh Clauda) až do **nosnosti**:
  - **ovce, kozy, krávy:** pastva na úhoru a loukách – ≈ **1 ha na krávu, 0,2 ha na ovci
    nebo kozu**; krávy, voli, ovce a kozy navíc potřebují na zimu **seno** ([orání
    rádlem](oxen.md) – Seno; od 19. 10. 2026 kráva 5, vůl 6, ovce a koza 1 kg denně, dřív jen
    krávy a voli 1,5 t na kus),
  - **prasata:** les do 600 m od vsi – ≈ **1 ha lesa na prase** (žaludy, bukvice, kořínky –
    pasou se v něm celý rok, Martin 19. 10. 2026),
  - **pasáci** (od 19. 10. 2026 – Pasáci níž).
- **Porážka v zimě** (od 19. 10. 2026 po celou zimu – Porážka v zimě; dřív v listopadu): co
  přeroste nosnost, staré kusy a mladé kusy navíc jdou na maso:
  **prase ≈ 50 kg, ovce ≈ 15 kg, koza ≈ 12 kg, kráva ≈ 120 kg** masa (návrh Clauda). Ves si nechá
  chovné kusy (nejméně pár od každého druhu).
- **Vejce:** slepice dají celý rok ≈ **5 kg vajec na slepici**, jí se čerstvá (návrh Clauda).
- **Zásoba masa** se **uzí a suší** – ztratí **20 % ročně** (návrh Clauda) – a co se nesní do 31. 8., zkazí se (Trvanlivost masa níž, od 19. 10. 2026). **Kolik masa ves
  potřebuje, určí bílkoviny:** co chybí po obilí (odhad obilí na 70 % energie), mléku stád
  (85 % jeho bílkovin – syrovátka odteče) a vejcích, v mase (17 % bílkovin). Dospělý tak potřebuje
  ≈ 35 kg bílkovin ročně, z obilí ≈ 13 kg – s ≈ 110 l mléka ≈ **100 kg masa ročně** (vlastní
  výpočet; 1,6 g/kg je asi dvojnásobek bezpečné dávky FAO/WHO – Martinova volba). Dřív pevně
  60 kg (20 % energie) – nahrazeno.
- **Práce:** pasou výrostci bez práce vsi, ves bez výrostků dospělý z práce vsi (Pasáci níž –
  od 19. 10. 2026 a Dospělý pasák od 2. 11. 2026); porážka a uzení ≈ **1 člověkoden na 20 kg masa**; dojení a péče viz Práce
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
  podíl, žádný los (determinismus beze změny). **Od 26. 10. 2026 (návrh Clauda, W3):** v tom je
  **vlčí díl** (ovce a kozy 3 %, prasata 2 %, skot 1 % při 5 vlcích × vlci ÷ 5; jen na pastvě
  duben–říjen, prasata celý rok) – základ bez vlků je **9 / 7 / 10 / 5 %** (`LIVESTOCK.lossPerYear`)
  a vlčí díl se přidá podle smečky ([wildlife.md](wildlife.md) – Vlci na dobytku); při plné
  smečce zůstávají dosavadní čísla. **Vědomý kompromis (návrh Clauda, W3):** `yearlyMeatPerHead`
  počítá se základem **plus plným vlčím dílem** (jako při 5 vlcích), takže plán velikosti stád
  a kalibrace zůstávají beze změny; ves s vyloveným okolím tak stáda plánuje o vlčí díl menší,
  než by musela, a skutečná stáda rostou víc.
- Mláďata k 1. 4. (ovce a kozy +40 %, prasata +100 %, krávy +20 %) jsou ta, která přežila první
  týdny – **zmetání a úhyn novorozených jsou v nich** (čísla růstu beze změny).
- Stálé stádo tak dá na chovný kus za rok maso z mláďat (1 + růst) × (1 − ztráta) − 1 kusu: ovce
  3,5 kg, kozy 3,1 kg, prasata 38 kg, krávy 15 kg masa (vlastní výpočet).
- Literatura: dospělý skot 4–8 %, ovce 7–15 %, kozy 5–16 %; s řemesly nesouvisí – jedno číslo.

#### Skladba stáda

**Změna (24. 10. 2026):** pořadí přednosti je **voli → krávy → ovce → kozy → prasata** pro seno, pastvu i pasáky a stáda jsou co největší ([orání rádlem](oxen.md) – Co nejvíc sena a co největší stáda; Martin: „Krávy a hlavně voli jsou životně důležití, pak jsou ovce, kozy a prasata jsou důležitá nejméně.“). Pořadí níž (ovce na vlnu napřed) platilo do té doby.

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
  2 domácnosti** (mléko – jako výchozí stádo) a ~~na každou ohradu **3 krávy** (dvě telata do
  výcviku a chovná kráva – oxen.md)~~ ~~s ohradou volů **3 krávy a krávu navíc na každé 4 voly**~~
  k nim s ohradou volů **3 krávy a půl krávy na každého vola**, kterého chce na rádla i vozy (Krávy
  na obměnu volů níž – cíl krav podle volů od 20. 10. 2026), nejméně chovný pár.

#### Krávy na obměnu volů (20. 10. 2026)

Martin, 20. 10. 2026 – ohrada volů a voli po kusech ([orba](oxen.md) – Ohrada volů, voli po kusech
a potah; „Ano, udělej to jak říkáš“). Návrh Clauda:

- Ves s ohradou volů drží **3 krávy** (pár telat do výcviku a chovná kráva – jako dřív na ohradu
  spřežení) a na obměnu volů **krávu navíc na každé 4 voly**, které cvičí a krmí (kolik volů ves
  chce v místech ohrad volů – oxen.md, Kolik volů ves chce): býčků se narodí ≈ 0,4 na krávu a rok
  (polovina telat, ≈ 80 % krav rodí) a vůl slouží 10 let – obměna desetiny volů ročně = 0,1 ÷ 0,4
  = 0,25 krávy na vola (`OXEN.cowsPerOx`, `oxenCows`). ~~Krávy na mléko (kráva na 2 domácnosti)
  a na voly se nesčítají – ves drží víc z toho, telata dají i krávy na mléko.~~ Od 20. 10. 2026
  0,5 krávy na vola a krávy na voly se ke kravám na mléko přičítají (cíl krav podle volů výš).
- **Bez ohrady skotu krávy nejsou** (dnešní pravidlo – Místa na noc): u domů jen chovný pár krav,
  telata na voly pak chybí.
- **Telata na voly jen z přírůstku nad chovnými kravami** (návrh Clauda, 20. 10. 2026 –
  dřív aspoň jedna kráva zůstala a Vlkov klesl na 1,2 krávy z cíle 4): výcvik vezme jen tolik
  telat, kolik je krav nad cílem `breedingCows`; jinak počká na mláďata 1. 4. Voli se cvičí i po
  jednom (dvoukolák táhne jeden vůl). Výjimka: náhrada posledního páru k orbě vezme telata, dokud
  zůstane chovný pár krav ([orba](oxen.md) – Náhrada posledního páru má přednost).
- **Krávy navíc na telata** (rozhodnutí Clauda): když ves telata do výcviku potřebuje nebo bude
  potřebovat do dalších mláďat (voli, kteří jí za rok budou chybět do cíle – `oxenCalvesWanted`),
  nechá si při porážce 1. 11. tolik krav navíc nad chovné stádo (`minCows` plánu stáda), aby na
  jaře z přírůstku byla.
- **Prasata jen na maso**, v lese celý rok – bez sena a zimního krmení; nosnost dál určuje les
  (1 ha na prase) a pasáci.
- **Pořadí, v jakém si stáda berou pastvu a seno:** voli (orají), krávy na mléko a voly, ovce,
  kozy (napřed křoviny), zbytek krav. Dřív se pastva dělila poměrně a seno měly jen krávy.
- **Pořadí chovu podle potřeby** (níž): přežvýkavci ovce, kozy, krávy; prasata a luštěniny s nimi
  od 19. 10. 2026 soupeří cenou v práci (Rovnovážné hospodaření – dřív prasata naposled).

**Cíl krav podle volů – Martin, 20. 10. 2026.** Na otázku, jak zvětšit stádo krav (možnost 1 = cíl
krav podle volů, které ves chce na vozy): „**Dejme možnost 1. s dobytkem by také mělo jít
obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se vycvičit) a vycvičené
voly**“ (obchod – [obchod](trade.md), Dobytek ve třech druzích). Podrobnosti návrh Clauda:

- **Krávy na voly se ke kravám na mléko přičítají** (`breedingCows` – kráva na 2 domácnosti
  a k ní `oxenCows`; dřív víc z obojího – ves s 8 domácnostmi a 3 voly držela 4 krávy na mléko
  a krávy na voly se v nich ztratily): ves, která chce víc volů, drží víc krav.
- **Kolik volů:** všichni voli, které ves chce na rádla i vozy – páry k rádlům s hysterezí a voli
  vozů v místech ohrad volů (`oxenTrainingTarget` – [orba](oxen.md), Kolik volů ves chce).
- **Obměna:** voli jsou býčci – polovina telat, ≈ 0,2 býčka na kus stáda skotu a rok
  (LIVESTOCK.growth 0,4 × polovina); vůl slouží 10 let (výcvik 2 roky se kryje s posledními 2 lety
  služby starého vola), takže obměna desetiny volů ročně chce 0,1 ÷ 0,2 = **0,5 krávy na vola**
  (`OXEN.cowsPerOx`; ~~0,25 – počítalo se se všemi telaty~~) a k tomu **3 krávy** (pár telat do
  výcviku a chovná kráva – pár k rádlu dosluhuje naráz).
- **Ves si je nechá při porážce** – cíl je spodní hranice stáda v plánu chovu i porážky 1. 11.
  (`minCows`; staré krávy jdou na maso, jen dokud stádo neklesne pod cíl) i v nouzové porážce;
  pastva, seno, pasáci a místa v ohradách stádo omezují dál (krávy na voly jsou v pořadí pastvy
  a sena hned za voly a ovcemi na vlnu).
- **Telata z přírůstku nad cílem** platí dál – větší cíl znamená, že malé stádo napřed roste
  a teprve pak dává telata na voly navíc; náhrada posledního páru k orbě má přednost jako dřív.
  Rychleji jde dokoupit krávy nebo voly od sousedů ([obchod](trade.md) – Dobytek ve třech
  druzích). **Vlkov** (20. 10. 2026, 8 domácností, voli 2, chce 3, ohrada volů 6 míst): cíl
  ~~4~~ **8,5** krávy, stádo 2,6 krávy. Za 3 roky bez obchodu ≈ 3 krávy a od dubna 803 do dubna
  805 žádný pár k orbě (starý pár dosloužil, z malého stáda šlo jen tele ročně); s koupí mladého
  a vycvičeného vola od pastevců hned po načtení ≈ 6 krav (telata na voly nejdou) a pár chybí jen
  od dubna do prosince 803.

#### Chovné stádo podle potřeby (porážka)

Martin na otázku „Má se chovné stádo zmenšovat podle toho, kolik masa ves potřebuje?“: „**ano**“.

- Při porážce (1. 11.) si ves nechá **chovný pár** od každého druhu a krávy na mléko a voly, a k nim
  ze stáda v nosnosti (pastva, les, seno, pasáci a od 19. 10. 2026 místo pro jarní mláďata a bez
  starých kusů – Porážka v zimě) tolik kusů, aby jejich **mléko** (85 % bílkovin
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
- **Na maso jen to, co ves sní** (Martin, 19. 10. 2026: vesničané se snaží vyrobit co nejvíc
  jídla; pravidlo návrh Clauda): co přeroste nosnost (pastva, les, seno, co výrostci přes rok
  uhlídali), jde na maso vždy. Plán stádo v nosnosti zmenší jen o tolik masa, kolik ves od
  porážky do zkažení (31. 8.) sní pod stropem masa (40 % energie) – po masu v zásobě a masu
  z nosnosti; na maso napřed prasata, pak krávy, kozy, ovce. Zbytek nad plán zůstane do nosnosti
  naživu – prasata podle lesa, ostatní podle pastvy a sena –, protože ves nic nestojí (pasení
  a péče jsou bokem) a maso by se zkazilo. Dřív v roce zmenšení vznikl **jednorázový přebytek
  masa**, který se do 31. 8. zkazil – ve Vlkově (24 lidí) 1. 11. 792 porážka 81 prasat ze 83,
  4,4 t masa, 2,2 t se zkazilo a prasata se z páru už nevzpamatovala.
- Když stádo potřebu nepokryje, platí dál: na maso jde, co přeroste nosnost, a když maso v zásobě
  s porážkou roční potřebu masa nepokryje, i letošní mláďata navíc – prasata první, nejvýš
  polovina (druhá stádo rozšíří) – nově **v pořadí prasata, krávy, kozy, ovce** (obráceně proti
  chovu: prasata jsou jen na maso, ovce mají růst nejrychleji; dřív prasata, ovce, kozy, krávy –
  s ročními ztrátami pak stádo ovcí skoro nerostlo). Pravidlo „stádo dávající 1,5× potřeby masa
  neroste“ nahradilo toto.

#### Pasáci

**Změna (24. 10. 2026):** pasáci hlídají napřed krávy, pak ovce, kozy a prasata (dřív napřed ovce na vlnu, zbytek rovným podílem) – oxen.md, Co nejvíc sena a co největší stáda.

Martin: „**jeden ovčák/pasák krav – zvládne kočírovat jen omezené stádo ne? Že třeba vesnice, kde
mohou pást jen 2 malí kluci, nezvládne udržet stádo 100 krav**“.

- Jeden plný pasák uhlídá **40 krav** (i voli na pastvě), **100 ovcí nebo koz**, **50 prasat
  v lese**; **výrostek 7–13 let 40 %** toho. Stádo potřebuje pasáků součet podílů (20 krav a 50
  ovcí = 1 plný pasák = 2,5 výrostka).
- **Pes** (hra ho nevede) je v číslech – kosti psů jsou na raně středověkých sídlištích běžné
  (rozhodnutí Clauda). Literatura dává velké rozpětí (obecní pastýř pozdějších staletí pásl stovky
  kusů), ale s řemesly nesouvisí – jedno číslo, ne meze.
- **Kdo pase:** jen **výrostci 7–13 let** (Martin, 19. 10. 2026: „Zvířata a pasáci – to
  obstarají výrostci, takže do práce je nemusíme počítat, jsou úplně bokem.“; „Když bude ve vsi
  málo vhodných dětí na pasení, tak to omezí i velikost stád.“). Do práce vsi nejdou vůbec
  ([population.md](population.md) – Práce). Dospělí ani starší pasáky nejsou (návrh Clauda –
  starší zůstávají u denního minima domácnosti, dospělí na polích a stavbách). Dřív pasli
  napřed děti a starší a co nezvládli, dospělí ze společné práce (nejvýš jeden z domácnosti) –
  ves bez dětí tak stáda uhlídala za práci; od 19. 10. do 2. 11. 2026 je bez dětí neuhlídala
  (dospělý pasák níž).
- **Dospělý pasák, když nejsou děti** (od 2. 11. 2026; Martin schválil návrh Clauda, čísla návrh
  Clauda): zakladatelé nemají děti 7–13 let, takže prvních ≈ 8 let bylo pasení 0 a porážka 1. 11.
  srazila každé stádo na chovný pár (ovce 9,8 → 2, krávy 2,6 → 2) – ves neměla maso ani stáda
  a voli nemohli vzniknout. Teď, **když ve vsi není žádný výrostek** (synové cvičící vojvodovy
  rodiny se nepočítají), pase dospělý **za jednoho výrostka**: uhlídá nejvýš **0,4 plného pasáka**
  (16 krav nebo 40 ovcí – jako výrostek, ať ves s jedním dítětem nepase hůř než bez dětí)
  a stojí to **tolik člověkodní z práce vsi, kolik pase** (plný pasák = člověkoden; 3 krávy a 10
  ovcí ≈ 0,18 člověkodne denně, ≈ 37 za sezónu pastvy, nejvýš 0,4 denně). Pase za polními úlohami
  dne, nutnou sečí a noční hlídkou polí, před stavbami – ve dny, kdy práce vsi nestačí, stádo
  neuhlídá a co nikdo neuhlídal, jde 1. 11. na maso. Vesničané to dělají sami, hráč nic nezadává
  („Vesničané sami používají, co jim ulehčí práci“). S výrostkem dospělý nepase – málo dětí dál
  omezí stáda (Martin 19. 10. 2026). Ve scéně stojí u stáda dospělý pasák (rozdělení práce,
  činnost `herding`).
- **Kdy:** krávy, voli, ovce a kozy od dubna do října (v zimě jsou v ohradě a u domů na seně),
  prasata v lese celý rok.
- **Nosnost:** ves sčítá od porážky do porážky, jaký podíl potřeby pasáci uhlídali; při porážce
  si nechá nejvýš ten podíl každého stáda – **co nikdo neuhlídal, jde na maso** a stádo nad to
  neroste. S chovným stádem podle potřeby se to skládá: stádo je nejvýš menší z obojího.
- **Místo pro mláďata** (od 19. 10. 2026 – Porážka v zimě): stádo přes zimu i s jarními mláďaty
  nesmí přesáhnout, co uhlídají výrostci příštího léta (odhad z věku dnešních dětí; bez výrostků
  dospělý pasák – 0,4 plného pasáka, od 2. 11. 2026). Porody výrostci neomezují – rodí všechny
  samice.
- **Ve scéně** stojí u stád pasáčci z jádra – výrostci, kteří dnes pasou, nejvýš jeden u každého
  stáda; stádo, na které výrostci nestačí, zůstane u domů (Pastva a vždy s pasákem). Rozdělení
  práce z doby před pasáky ukáže děti jako dřív, z doby před 19. 10. 2026 i starší a dospělé.

#### Pastva a vždy s pasákem

Martin (19. 10. 2026): „**Stáda domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí
být nějaký člověk. Ten je bude primárně vodit na louky, určené ke spásání. Domácí zvířata by
neměla spásat jídlo pro lidi ani ho pošlapat a na čerstvém úhoru toho k pastvě také asi moc
není.**“ Mění dřívější pravidlo „na úhoru pasáček se zvířaty – mladý úhor vždy, louka na seno
jen po seči na otavě“ (18. 10. 2026). Detaily návrh Clauda:

- **Pastviny – louky určené ke spásání:** přirozené louky do 600 m a příloh ve fázi louky, kromě
  luk, které ves letos potřebuje na seno (plán 1. seče 25. 5.; do něj loňský) – ty až po seči na
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

**Změna (24. 10. 2026, návrh Clauda, schválený Martinem):** zimní úhyn nahradila porážka – když seno během zimy nevystačí do konce března, ves hned porazí tolik koz, ovcí a krav (v tomto pořadí), aby ostatní měli celou dávku; chovný pár zůstane. Martin: „Když se v zimě zjistí, že pro krávy není krmení, tak se dají prodat nebo porazit.“ Prodává jen hráč (oxen.md – Co nejvíc sena a co největší stáda). Odstavec o úhynu níž platil do té doby.

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

- Od 19. 10. 2026 se v zimě jí **čerstvé maso** a udí se jen přebytek (Porážka v zimě); uzené
  maso se jí, až čerstvé dojde nebo nestačí do stropu masa.
- Uzené a sušené maso z podzimní porážky se jí **rovným dílem do 31. 8.** (šetřilo se na žně)
  a **1. 9. ráno se zbytek zkazí** – v létě žlukne tuk a maso napadá hmyz, soli bylo málo. Kronika
  a krátký řádek „Maso se zkazilo – N kg“. Vysychání 20 % ročně zůstává.
- Maso ze září a října (dosloužilé spřežení) se jí do porážky.
- Výhled energie do sklizně počítá maso jen do jeho zkažení.
- **Důsledek:** v září a říjnu ves uzené maso nemá – bílkoviny jen z obilí, luštěnin, mléka, sýra
  a vajec, nasycení ty dva měsíce kleslo (Vlkov ≈ 0,85).

#### Porážka v zimě

Martin, 19. 10. 2026: „**Tak většinou se v zimě porážejí staré kusy a na jaře některá mláďata
pokud je jich moc. Navíc ovce, krávy i kozy musí být neustále březí aby dávaly mléko.**“ K návrhu
jarní porážky: „**No hele porážky probíhaly jenom v zimě, v létě se maso rychle kazí. Navíc když
porazíš zvíře hned na začátku zimy, nemusíš ho krmit senem.**“ A dál: „**A pastevci by se měli
snažit, aby rodily všechny samice. A nemusí se porážet jen 1. 11. ale po celou zimu, aby
vesničané jedli maso ideálně čerstvé. Uzení je spíš jen nouzový způsob, jak naložit
s přebytky.**“ Platí i dřívější „Když bude ve vsi málo vhodných dětí na pasení, tak to omezí
i velikost stád.“ (Pasáci). Podrobnosti jsou návrh Clauda; nahrazuje omezení porodů podle
výrostků, které se do hry nedostalo.

- **Rodí všechny samice** (čísla podle [rešerše](research/2026-10-19-breeding-culling.md)): 1. 4.
  rodí každá chovná samice jednou, bez ohledu na výrostky – pastevci se o to starají. Chovné
  samice ve stádu přes zimu: krávy 50 %, ovce a kozy 70 %, prasata 40 % (zbytek býci, berani,
  kanci, skopci, jalovice a čuníci na druhý podzim). Odchovaná mláďata na samici: kráva 0,8 (tele,
  úhyn 20 %), ovce 0,92 (1,15 jehněte), koza 1,12 (1,4 kůzlete), prasnice 3,6 (vrh 6 selat, přežije
  60 %). Na kus stáda tak ovce +64 % (dřív 40 %), kozy +78 % (40 %), prasata +144 % (100 %), krávy
  +40 % (20 %).
- **Mléko jen od samic, které letos rodily** (Mléko a sýr): dojné samice = dospělé kusy bez
  letošních mláďat × podíl chovných samic – mléka úměrně porodům.
- **Porážka jen v zimě** – od 1. 11. do konce zimního krmení (31. 3.); na jaře ani v létě ne.
  Výjimkou zůstává nouzová porážka (Nouzová porážka, selata od 1. 9.).
- **1. 11. ves rozhodne, co nechá přes zimu:**
  - nejvýš tolik, kolik uživí pastva, seno a les a kolik výrostci přes rok uhlídali (Stáda
    realističtěji, Pasáci);
  - **místo pro mláďata:** stádo přes zimu i s jarními mláďaty (porody z pravidel) nesmí
    přesáhnout, co uhlídají výrostci příštího léta – ves je odhadne z věku dnešních dětí (kdo
    bude 1. 7. příštího roku 7–13 let), voli z ohrad na pastvě napřed. Když výrostci nestačí,
    ubere z každého druhu stejný podíl (jako podíl uhlídaný pasáky);
  - **místa na noc** (Místa na noc – ohrady a u domu níž): stádo přes zimu i s jarními mláďaty se
    musí vejít do ohrad svého druhu a k domům;
  - **staré kusy** jdou na maso vždy – každý rok doslouží ovce a kozy 1/8, krávy 1/10, prasnice
    1/4 dospělých kusů ([rešerše](research/2026-10-19-breeding-culling.md)); letošní mláďata je
    nahradí;
  - **chovné minimum zůstává vždy** – chovný pár, krávy na mléko a voly, ovce na vlnu (když na ně
    nestačí mladé kusy, i staré);
  - v tom chovné stádo podle potřeby (Chovné stádo podle potřeby, Rovnovážné hospodaření).
- **Co jde na maso:** staré kusy a kusy nad nosnost (i nad místo pro mláďata) **vždy, i když se
  maso nestihne sníst**. Pravidlo „porazit nejvýš tolik, kolik ves do 31. 8. sní“ platí jen pro
  ostatní kusy v nosnosti, které by ves porazit nemusela.
- **Porážka po dnech přes zimu:** kusy na maso ves neporáží najednou. Kolik masa přes zimu sní
  čerstvého (denně strop masa ve stravě, 40 % energie), tolik kusů počká živých a porazí se
  postupně – denně jen tolik, kolik toho dne sní. Čekají napřed kusy, které žerou nejméně sena na
  kg masa (prasata v lese, krávy, ovce, kozy), porážejí se v opačném pořadí (kozy, ovce, krávy,
  prasata nakonec), aby spotřebovaly co nejméně sena – tak se vyváží „porazíš hned na začátku
  zimy – nemusíš ho krmit senem“ s „ideálně čerstvé“. Kus čekající na porážku žere seno nebo les
  (prasata jen do nosnosti lesa vedle stáda přes zimu) až do dne porážky.
- **Seno:** když seno na čekající kusy nestačí, ves ty, které neuživí, porazí hned (od posledních
  na řadě – krávy, ovce, kozy) a jejich maso udí. Seč 1. 6. počítá i se senem pro kusy, které
  budou čekat (odhad z dnešního stáda a plánu stáda přes zimu).
- **Uzení jen na přebytek:** udí se jen maso, které ves nestihne sníst čerstvé – kusy, na které
  přes zimu nezbude čerstvá spotřeba, a zbytek čekajících kusů na konci zimy (31. 3.). Uzené
  maso dál vydrží do 31. 8., ztrácí 20 % ročně a 1. 9. se zkazí. **Ves jí napřed čerstvé maso**,
  uzené až do stropu masa po něm; výhled jídla do sklizně počítá i s čerstvým masem do konce zimy.
- **Práce porážky** (1 člověkoden na 20 kg masa) je rozložená do dnů porážek – denně za dnešní
  maso, hned před polními úlohami.
- **Kronika** `slaughter` 1. 11. – kg masa celkem a z toho přes zimu (`fresh`), kusy celkem.

#### Místa na noc – ohrady a u domu (19. 10. 2026)

Martin, 19. 10. 2026: „**Zvířata je potřeba na noc zavírat do ohrad. Každý druh zvířete by měl mít
vlastní ohradu, ať se nemíchají. … Velikost ohrady bude mít vliv na velikost stáda.**“ Pravidla
ohrad jsou v [oxen.md](oxen.md) – Ohrady podle druhu; čísla návrh Clauda podle
[rešerše](research/2026-10-19-pens.md).

- **Místa** (`herdRoom`): hotové čtverce ohrad svého druhu × místa na čtverec (ovce 130, kozy 100,
  prasata 80, krávy 45; ohrada spřežení stádo nedrží) + pár kusů u domů – **bez ohrady udrží každá
  domácnost u domu 2 ovce, 1 kozu a 1 prase, krávy jen v ohradě**. Místa jsou pro dospělé kusy
  i jarní mláďata.
- **Nosnost:** 1. 11. si ves nechá přes zimu nejvýš místa ÷ (1 + jarní mláďata na kus) – samostatný
  vstup plánu stáda vedle pastvy, sena, lesa, pasáků a místa pro mláďata podle výrostků
  (`WinterInput.room`, `winterTargets`). **Chovný pár druhu zůstane vždy** (i bez ohrady, u domů).
  Kusy nad místa jdou na maso jako kusy nad nosnost; kusy čekající na zimní porážku jen do míst,
  která po stádu přes zimu zbudou (`winterWait`) – ostatní se porazí hned a maso se udí. Seč 1. 6.
  počítá se stádem v místech.
- **Ovce na vlnu a krávy na mléko a voly** (Oděv, Skladba stáda) jsou spodní hranice plánu chovu,
  ale místa jsou tvrdá mez: ves bez ohrady ovcí si nechá jen pár ovcí u domů a vlna chybí
  („Chybí vlna na oděv“), ves bez ohrady skotu má jen chovný pár krav – na výcvik volů (aspoň
  2 krávy na tele, 3 na pár) potřebuje ohradu skotu.
- **Roční odklad** (návrh Clauda, 19. 10. 2026): místa stádo omezí až
  u porážky 1. 11., která přijde aspoň 365 dní po založení vsi, u vsi uložené dřív po zavedení
  pravidla (den převodu – `LivestockState.pensFromDay`, `withPenGrace` při načtení). Do té doby
  se plán stáda, seč i porážka řídí jen pastvou, senem, lesem a pasáky jako dřív.
- **Dřívější vsi bez ohrad:** nadbytek nad místa jde na maso při první porážce po odkladu.
  Upozornění „Ovce se nevejdou do ohrad“ (víc druhů „Stáda se nevejdou do ohrad“) to hráči ohlásí
  dřív.
- Pastva louky ubývá o všechny čtverce ohrad (ohrada zabírá celé políčko).

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
  **Chovný pár** každého druhu zůstane, u prasat chovné prasnice (níž). Spřežení a telata ve
  výcviku jsou v ohradě, mimo stáda – na nouzovou porážku nejdou. Nejdou ani **letošní mláďata**
  (od jara do podzimní porážky – jsou malá a dorůstají v příští stádo; rozhodnutí Clauda – bez
  toho ves v nouzi snědla každé jaro všechna selata a jehňata hned po narození a stádo se nikdy
  neobnovilo) – **kromě selat od 1. 9.** (níž).
- **Chovné prasnice** – Martin, 19. 10. 2026: „**Ano, pusť na to agenta**“ na návrh „Spodní
  hranice chovných prasnic: v nouzi se smí porážet jen do poloviny toho, kolik prasat uživí les.
  Vlkov by tuto zimu porazil skoro stejně a stádo by zůstalo, aby se obnovilo.“ Prasata jdou na
  nouzovou porážku jen nad **polovinu toho, kolik prasat uživí les** (Náměty – Nouzová porážka
  v trvalém nedostatku). Podrobnosti návrh Clauda:
  - nosnost je tatáž jako u podzimní porážky (Stáda realističtěji): 1 prase na 1 ha lesa do 600 m
    od vsi bez dílů polí, které ves v lese založila, s lesem vsi na bývalé louce – podle dnešního
    stavu, takže s mýcením lesa pro pole hranice klesá;
  - hranice je aspoň chovný pár (les pro méně než 4 prasata – chovný pár zůstane);
  - do 31. 8. se počítají dospělá prasata – letošní selata na nouzovou porážku nejdou, takže
    v létě zůstane spodní hranice i se selaty; od 1. 9. se do prasat nad hranicí počítají
    i selata (níž);
  - na jaře se stádo prasat zdvojnásobí (mláďata 1. 4.), takže se z prasnic do podzimu obnoví;
    co prasata nad hranicí nepokryjí, porazí ves dál v pořadí (kozy, ovce nad ovce na vlnu,
    krávy nad chovné – přednost stád, oxen.md, Co nejvíc sena a co největší stáda; dřív krávy před
    ovcemi; voli nikdy), a když ani to nestačí, šetří přídělem. Číslo `EMERGENCY_SLAUGHTER.pigForestShare`
    (0,5).
- **Selata od 1. 9.** – Martin, 19. 10. 2026: „**Ano ke všem návrhům**“ na návrh „letošní selata
  smějí od 1. 9. na nouzovou porážku“ (Náměty – Hladový podzim): maso se 1. 9. kazí, do podzimní
  porážky 1. 11. ves hladoví a nad chovnými prasnicemi jsou v září skoro jen letošní selata, která
  nouzová porážka chránila. V září mají ≈ 5 měsíců a na podzim se prasata porážela tak jako tak.
  Od 1. 9. do konce roku (po podzimní porážce letošní mláďata nejsou) se selata počítají do prasat
  nad chovnými prasnicemi, spodní hranice prasat platí dál. Jehňata, kůzlata a telata zůstávají
  chráněná celý rok. Maso z porážky v září a říjnu se jí do podzimní porážky (Trvanlivost masa) –
  pod stropem 40 % energie tak září a říjen přemostí, ale na zimu ho ves nenaporáží. Číslo
  `EMERGENCY_SLAUGHTER.pigletsFromMonth` (9).
  **Selata první** (Martin 31. 10. 2026: „Selata první“): prasata nad chovnými prasnicemi jdou od
  1. 9. napřed z letošních selat (ubývají jim kus za kus), teprve zbytek porážky ubere dospělým;
     ostatní mláďata ubývají s jejich stádem poměrně.
- **Kolik:** nejméně masa, se kterým výhled vyjde **i s rezervou 5 % potřeby energie do
  sklizně**. Výhled nezná ztráty zásob skladováním ani úbytek masa uzením – bez rezervy by ves
  porážela den co den po kouscích, s ní obvykle jednou za zimu (Vlkov: jednou, 23 prasat). Zabitím
  dojnic ubude i mléka do sklizně, výhled s tím počítá.
- **Maso** jde do zásoby jako z podzimní porážky – stejná výtěžnost (prase 50, koza 12, kráva
  120, ovce 15 kg), stejné uzení 20 % ročně, jí se rovným dílem do zkažení 1. 9. Porážka a uzení
  stojí 1 člověkoden na 20 kg; mimo zimní porážku (od 19. 10. 2026 listopad–březen) se udělá hned
  další dny jako nouzová práce, v zimě s prací zimní porážky (nedodělek předchozí porážky
  propadá). Kusy čekající na zimní porážku jdou v nouzi první. Mláďata ubudou poměrně.
- **Strop masa ve stravě 40 % energie platí i v nouzi.** Ves porazí jen tolik, kolik pod stropem
  pomůže; když schodek ani tak nepokryje (nebo jí dojdou zvířata navíc), dál šetří přídělem.
  Taková porážka, která schodek celý nepokryje, se udělá, jen když zvedne příděl **aspoň o 2
  procentní body** – jinak by ves po každém úmrtí (ubude ovcí na vlnu) porážela po kusech.
  Proč strop nezvedat (rozhodnutí Clauda): 40 % energie z masa přes celou zimu je už na hraně
  toho, co raně středověká ves jedla (obvykle 10–20 %); větší porážka by snědla chovné stádo, ze
  kterého má příští rok mléko a mláďata, takže by si ves hlad jen přesunula na další zimu; a jedno
  pravidlo stravy pro každý den je srozumitelnější než výjimka v nouzi. Vlkov se do stropu vejde
  (≈ 37 % energie z masa).
- **Kronika** `emergency-slaughter` (kg masa a kusy) a krátký řádek, jen fakt: „Vesničané porazili
  23 prasat navíc“.

#### Náměty (neimplementováno – Martin rozhodne)

- ~~**Nouzová porážka v trvalém nedostatku**~~ – od 19. 10. 2026 ve hře jako spodní hranice
  chovných prasnic (Nouzová porážka): Vlkov bez hráče (pole na 45 lidí nestačí) s nouzovou
  porážkou snědl druhou zimu prasata až na chovný pár, stádo se už neobnovilo a lidé umírali hlady
  pět let po sobě. Druhý návrh (nouzová porážka jen do chovného stáda z poslední podzimní
  porážky) se nepoužil. Naměřeno – chovné prasnice.
- ~~**Hladový podzim**~~ – od 19. 10. 2026 ve hře jako selata od 1. 9. na nouzové porážce
  (Nouzová porážka; Martin: „Ano ke všem návrhům“). Ve Vlkově bez hráče umírali lidé hlady
  v říjnu – maso se 1. 9. zkazí, úroda na rok nestačí a výhled do sklizně s masem z listopadové
  porážky nepočítá, takže ves od 1. 9. jedla kolem poloviny přídělu; prasata nad chovné prasnice
  jsou v září a říjnu skoro jen letošní selata, a ta na nouzovou porážku nešla (Naměřeno – chovné
  prasnice: Vlkov v říjnu 782 18 úmrtí hladem, bez spodní hranice 9). Druhý návrh (výhled od 1. 9.
  počítá s masem z blížící se podzimní porážky) se nepoužil. Naměřeno – selata od 1. 9.

- ~~**Vlna**~~ – od 19. 10. 2026 ve hře jako spodní hranice stáda ovcí (Oděv). Zůstává námětem
  přebytek sukna jako zboží k sousedům (trade.md) a oděv z kůží z porážky.
- **Kozy brzdí zarůstání:** pastva koz na křovinách by mohla zarůstání přílohu zpomalit (dnes ho
  zastaví jen pastva nebo seč ve fázi louky). Zasáhla by do zarůstání a sítě pěšin – zatím ne.
- ~~**Místo pro mláďata**~~ – od 19. 10. 2026 ve hře (Porážka v zimě): porážka 1. 11. nechá na
  zimu jen tolik dospělých kusů, aby na jaře výrostci uhlídali i mláďata. Návrh vznikl při
  měření omezení porodů podle výrostků (to by ve vsi s málo výrostky ubralo většinu masa –
  dospělé kusy vyplnily, co výrostci uhlídají, a mláďat se rodilo málo); místo omezení porodů
  rodí všechny samice a stádo přes zimu nechá místo.
- **Podzimní porážka jehňat a kůzlat:** čerstvé maso v září a říjnu, kdy uzené došlo.
- **Nákazy:** výjimečný rok (dobytčí mor – Winchester 1319–1320 přišel o víc než polovinu skotu).

### Rovnovážné hospodaření (Martin, 19. 10. 2026; pravidla a čísla návrh Clauda)

**Změna (24. 10. 2026, návrh Clauda, schválený Martinem):** cena jídla v práci **stádo už
nezmenšuje** – ves chová co největší stáda, kolik uživí seno, pastva, les, pasáci a místa
v ohradách (oxen.md – Co nejvíc sena a co největší stáda). Z rovnovážného hospodaření zůstává
**plán luštěnin**: celé stádo v nosnosti dá bílkoviny a luštěniny dorovnají jen to, co chybí
do potřeby s rezervou, a jen když jsou levnější než bílkoviny z obilí (nad 88 % potřeby) –
pravidla 1 a 2 níž platí už jen pro luštěniny. **Od 9. 11. 2026 ani plán luštěnin** (luštěniny
z polí vyřazené – fields.md, Luštěniny, zrušeno): zůstává jen pokrytí bílkovin stádem v nosnosti,
vejci a zásobou luštěnin; cena jídla v práci už luštěniny nepočítá (platba luštěninami stojí
obilí, které ves místo nich sní – návrh Clauda). Když stádo potřebu nepokryje, jdou při porážce
na maso i letošní mláďata navíc (Chovné stádo podle potřeby) – v opačném pořadí přednosti
(prasata, kozy, ovce, krávy).

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
  dojných kusů (bílkoviny mléka 85 %); práce vsi – seno na zimu (prasata bez sena), porážka
  a uzení. **Dojení, sýr, péče a pasení nic nestojí** – jdou bokem (ženy a výrostci, Práce se
  zvířaty, Pasáci; Martin 19. 10. 2026); dřív kus platil i zimní péči, dojení a sýr z poloviny
  mléka a dospělého pasáka, když děti a starší nestačili. **Maso a mléko nahradí obilí se
  stejnou energií** – kus tím ušetří práci na obilí, které ves nemusí vypěstovat. Za typické ceny
  (bez řemesel / s plnými řemesly):

  | Zdroj          | Práce za rok (čd) | Energie (kg obilí) | Bílkoviny navíc proti obilí (kg) | Cena kg bílkovin navíc (čd) |
  | -------------- | ----------------- | ------------------ | -------------------------------- | --------------------------- |
  | prase          | 1,9               | 22,8               | 4,2                              | šetří 12 / 7 čd za rok      |
  | ovce           | 2,1 / 1,4         | 6,0                | 0,6                              | šetří 1,6 / 1,0 čd za rok   |
  | koza           | 2,1 / 1,4         | 8,2                | 0,6                              | šetří 3,0 / 1,8 čd za rok   |
  | kráva          | 10,4 / 6,8        | 32,0               | 2,8                              | šetří 9,5 / 5,7 čd za rok   |
  | luštěniny 1 kg | 0,83 / 0,52       | 1                  | 0,12                             | 1,8 / 1,1                   |
  | obilí samo     | 10 kg obilí       | 10                 | 1 (10 %)                         | 6,2 / 3,9                   |

  Prasata práci šetří vždy (žaludy v lese, bez sena), od 19. 10. 2026 (dojení, péče a pasení
  bokem) i přežvýkavci s řemesly – stádo pak omezuje nosnost (i co výrostci přes rok uhlídali)
  a stropy podílů energie (dřív s řemesly stál kilogram bílkovin přežvýkavců desetiny
  člověkodne); luštěniny jsou nejdražší zdroj
  bílkovin navíc, ale pořád několikrát levnější než bílkoviny ze samotného obilí. **1,6 g/kg tak
  není absurdně drahé** – drahé je jen tam, kde ves nemá pastvu ani les a bílkoviny musí dát
  luštěniny (≈ 1–2 čd na kg, potřeba ≈ 17 kg na dospělého nad obilí).

- **Plán** (`sizeHerdsToNeed`, `balancedPlan`) – ves si ho spočítá 1. 6. (kolik sena posekat na
  zimní stádo), 1. 9. (kolik luštěnin osít) a 1. 11. (jaké chovné stádo si nechat – zbytek jde na
  maso), pokaždé stejně:
  1. **chovný pár** od každého druhu a **krávy na mléko a voly** (1 na 2 domácnosti, 3 na ohradu)
     vždy;
  2. **cena zdroje** = práce vsi na kus (seno, porážka) mínus práce na obilí, které jeho maso
     a mléko nahradí, na kilogram bílkovin navíc proti obilí; ves přidává po kusech (luštěniny po
     **25 kg**). **Pasáci nestojí nic a plán je nepočítá** (dospělý pasák ve vsi bez výrostků
     stojí práci – plán ho nepočítá, je jen na první roky; návrh Clauda) – výrostci omezí stádo jen přes
     nosnost, tedy podíl, který přes rok uhlídali (Pasáci, Martin: „Když bude ve vsi málo
     vhodných dětí na pasení, tak to omezí i velikost stád.“). Plán dřív navíc nechal jen tolik
     kusů, kolik uhlídají výrostci v den rozhodnutí, a ovce v pořadí chovu jim místo vzaly
     prasatům – ve Vlkově zbyl z 83 prasat pár, i když výrostci přes rok uhlídali 90 % (návrh
     Clauda: strop zrušen);
  3. **co práci šetří** (záporná cena), přidá vždy, i nad potřebu – **v pořadí ovce → kozy →
     krávy → prasata** (Martin – Skladba stáda: ovce napřed), až po nosnost (pastva, les, seno, pasáci) a stropy podílů energie (maso
     40 %, mléko a sýr 30 %, luštěniny 25 % – nad strop dá kus jen zbytek pod ním);
  4. pak do **potřeby bílkovin s rezervou 10 %** (růst vsi do příští porážky – dřív 25 %)
     **nejlevnější zdroj** – přežvýkavci v pořadí ovce → kozy → krávy, prasata a luštěniny s nimi
     soupeří cenou; nad **88 % potřeby** jen zdroj, jehož kilogram bílkovin nestojí víc práce než
     kilogram bílkovin z obilí. **„± ideál“ je 88–100 % bílkovin** – kvalita stravy 0,90–0,94
     (s ovocem víc); pod 88 % nasycení znatelně ubírá (štěstí; porody jen podle energie), nad potřebu bílkoviny nic
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
  stáda ani štěstí; hranici ale použije už plán 1. seče 25. 5. a luštěnin 1. 9.
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

Martin k ovcím na vlnu: „**A to mi připomíná, že na částech pole musí být zasetý len.**“ 9. 11.
2026 odpoledne šel len na zahrádku u obydlí, večer zpět na pole (Martin: „Len je extrémně náročná
plodina na kvalitu půdy. Tam, kde už jednou rostl, se může vrátit až po 6 nebo 7 letech, takže se
bude pěstovat na polích.“). Pravidla jsou ve [fields.md](fields.md) – Len, čísla **návrh Clauda** podle
[rešerše](research/2026-10-19-flax.md) (experimentální košile z Viborgu – Ribe 2011, historické
výnosy vlákna ze Skotska a Irska).

- **Potřeba:** dospělý a starší **2 kg třeného lnu za rok**, dítě **1 kg** – ≈ 3 m² hrubého plátna
  (≈ 1 kg látky) na dospělého: košile (u žen dlouhá košile jako hlavní oděv), díl spodního oděvu,
  šátků, ručníků a plachet; lněná košile nošená denně vydrží rok až dva. Na kg látky ≈ 2 kg
  třeného lnu (z vochlování ≈ 46 % dlouhého vlákna, část koudele na hrubé plátno).
- **Pole:** len je jař na dílech pole – setí na jaře, **trhání jen v srpnu**, ≈ 550 kg třeného
  lnu z hektaru při plné úrodnosti; ves bere jarní díly s nejlepší úrodností, na kterých len
  **7 let** nerostl, jen do potřeby na oděv (ves 30 lidí ≈ 0,1 ha). **Obilí má přednost** – len se
  trhá z práce, která po žních obilí zbude; co srpen nevytrhá, propadne (fields.md – Len).
- ~~**Zahrádka u obydlí**~~ (9. 11. 2026 odpoledne – večer zrušeno, len je zpět na poli): zahrádka
  dává už jen luštěniny (fields.md – Zahrádka u obydlí).
- **Kdy se rozhodne:** na konci trhání 31. 8. – vytrhaný len ÷ potřeba zapsaná v plánu k 1. 9.
  (`VillageState.linen`), platí do dalšího trhání. Ves založená během roku (plán bez potřeby) se
  do prvního trhání po plánu k 1. 9. nemění.
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
  štěstí s nasycením (porody jen s energií; energie × kvalita z bílkovin). Hlad v rozhraní (upozornění) =
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

## Naměřeno – nouzová porážka (19. 10. 2026)

**Vlkov** (kopie stavu z 16. 11. 781, 47 lidí, 2 862 kg obilí, 2 046 kg masa, 379 kg jablek,
52,6 prasete, 71,6 ovce, 15,8 t sena; DB jen čtená, dopočet bez hráče do 31. 8. 782):

|                                   | bez nouzové porážky | s nouzovou porážkou        |
| --------------------------------- | ------------------- | -------------------------- |
| porážka navíc                     | –                   | 17. 11. 781: 22,7 prasete  |
| maso navíc                        | –                   | 1 133 kg                   |
| příděl do sklizně (nejnižší)      | 94 → 91 %           | 100 % celý rok             |
| dní, kdy ves šetří jídlem         | 257                 | 0                          |
| energie / nasycení (průměr)       | 0,938 / 0,841       | 1,000 / 0,947              |
| energie z masa                    | 21–24 %             | 33–37 % (pod stropem 40 %) |
| obilí 1. 7. / 31. 8. 782          | 251 / 2 072 kg      | 475 / 2 373 kg             |
| prasata 31. 8. 782 (po mláďatech) | 95,1                | 54,1                       |

Jedna porážka na celou zimu – rezerva 5 % stačila. Ovce, kozy a krávy zůstaly.

**Kalibrace** `measure-village.ts 20 20` (jen orientačně, malé vsi ≈ 12 lidí nouzi skoro neznají):
nasycení ≥ 0,95 celý rok 96,6 → 96,8 % let, nejnižší nasycení roku p1 0,49 → 0,56, prasat na
10 lidí na konci 25,6 → 23,5, porážka na člověka a rok 43 → 41 kg, volná práce 5,8 čd beze změny.

## Naměřeno – chovné prasnice (19. 10. 2026)

Dopočet s krajinou bez hráče z uložených kopií stavu, pravidla po „Práce vsi – zvířata bokem“
(pasou jen výrostci). **Vlkov 16. 11. 781** (týž stav jako Naměřeno – nouzová porážka: 47 lidí,
52,6 prasete, les pro prasata 52,9 ha – spodní hranice 26,5 prasete) do 2. 11. 786:

|                                                      | bez spodní hranice                | s chovnými prasnicemi           |
| ---------------------------------------------------- | --------------------------------- | ------------------------------- |
| lidé 1. 9. 782 / 783 / 784 / 785 / 786               | 45 / 38 / 30 / 18 / 14            | 45 / 25 / 26 / 27 / 16          |
| lidé 2. 11. 786                                      | 9                                 | 10                              |
| úmrtí hladem po hospodářských rocích 782/783–786/787 | 9 / 8 / 14 / 4 / 5 (40)           | 18 / 0 / 0 / 11 / 6 (35)        |
| prasata po podzimní porážce 782–786                  | 2,0 / 2,6 / 2,7 / 2,0 / 2,0       | 15,3 / 20,2 / 23,9 / 26,5 / 2,0 |
| podzimní porážka 782–786 (kg)                        | 895 / 191 / 185 / 948 / 120       | 2 285 / 508 / 753 / 906 / 2 958 |
| nouzové porážky 781/782–786/787 (kg)                 | 1 133 / 2 169 / 144 / 333 / 0 / 0 | 1 133 / 0 / 0 / 416 / 279 / 33  |

První zima stejně (17. 11. 781: 22,7 prasete). Bez spodní hranice ves sní prasata v září a listopadu
782 až na chovný pár a lidé pak umírají hlady každou zimu; s ní se stádo drží a dává každý podzim
maso, ale vlny hladu přijdou v říjnu 782 a na podzim 785 a 786 (Náměty – Hladový podzim). Na konci
je ve vsi skoro stejně lidí. **Vlkov 21. 9. 792** (ve hře: 24 lidí, 84,6 prasete) do 1. 9. 797:
podzimní porážka 1. 11. 792 nechá s chovnými prasnicemi i bez nich 2 prasata z 83 (s pravidly
před „Práce vsi – zvířata bokem“ 52 – příčina mimo nouzovou porážku), nouzové porážky jsou malé (bez hranice 418 kg, s ní 255 kg – jen
ovce a kozy), úmrtí hladem žádné, 1. 9. 797 bez hranice 25 lidí, s ní 23.

## Naměřeno – selata od 1. 9. (19. 10. 2026)

Dopočet s krajinou bez hráče z uložené kopie stavu **Vlkov 16. 11. 781** (47 lidí – týž stav jako
Naměřeno – chovné prasnice) do 15. 12. 786, dosavadní pravidla (D) a se selaty od 1. 9. (S).
Nasycení, pokrytí bílkovin a podíl masa na energii jsou průměry vzorků 15. dne každého měsíce.

|                                      | D                  | S                    |
| ------------------------------------ | ------------------ | -------------------- |
| úmrtí hladem září–říjen 782          | 18                 | 9                    |
| úmrtí hladem celkem                  | 18                 | 16                   |
| nouzové porážky v září (kg)          | –                  | 698 (782), 497 (783) |
| podzimní porážka 782–786 (kg celkem) | 6 309              | 5 511                |
| prasata po podzimní porážce 786      | 52,9               | 50,1                 |
| zkažené maso 1. 9.                   | 0                  | 0                    |
| nasycení / bílkoviny / podíl masa    | 0,90 / 0,84 / 22 % | 0,88 / 0,79 / 18 %   |
| lidé 1. 11. 782 / na konci           | 26 / 29            | 34 / 32              |

V září 782 ves porazí 14 selat (698 kg), maso jí do podzimní porážky – úmrtí hladem v září
a říjnu 782 klesnou na polovinu a za pět let žijí 3 lidé navíc (nasycení a bílkoviny na osobu
jsou proto o něco nižší). **Vlkov 21. 9. 792** a **27. 4. 796** (24 lidí) vyjdou se selaty
přesně stejně jako dřív – selata v nouzi potřeba nebyla.

## Naměřeno – porážka v zimě (19. 10. 2026)

Dopočet s krajinou bez hráče z uložených kopií stavu Vlkova, pět let, po dnech. Varianty: D =
pravidla před porážkou v zimě (se selaty od 1. 9.), M = omezení porodů podle výrostků (větev,
která se do hry nedostala), Z = porážka v zimě. Maso z porážek = podzimní a zimní porážka
(u Z i kusy poražené po dnech), nasycení, bílkoviny a podíly průměrem po dnech, seno = zásoba 31. 10. průměrem za roky.

| Vlkov                               | 16. 11. 781 (47 lidí) D / M / Z | 21. 9. 792 (24) D / M / Z   | 27. 4. 796 (24) D / M / Z   |
| ----------------------------------- | ------------------------------- | --------------------------- | --------------------------- |
| maso z porážek (kg za 5 let)        | 5 507 / 1 804 / 9 307           | 8 112 / 3 282 / 6 011       | 8 913 / 2 957 / 9 814       |
| nouzové porážky (kg)                | 2 672 / 3 205 / 4 837           | 236 / 236 / 293             | 0 / 499 / 0                 |
| z toho snědeno čerstvé (kg)         | – / – / 3 626                   | – / – / 2 220               | – / – / 4 877               |
| zkažené maso (kg)                   | 0 / 0 / 0                       | 1 118 / 38 / 2 330          | 0 / 0 / 0                   |
| mléko (l za rok)                    | 1 424 / 1 357 / 1 469           | 1 265 / 998 / 1 215         | 1 499 / 1 347 / 1 254       |
| ovce / prasata přes zimu (poslední) | 63 / 50 – 52 / 35 – 62 / 25     | 62 / 53 – 39 / 25 – 57 / 11 | 84 / 53 – 68 / 53 – 49 / 21 |
| z toho čeká na zimní porážku (Z)    | 4 ovce, 28 prasat               | 14 ovcí, 4 prasata          | 22 prasat                   |
| seno 31. 10. (kg)                   | 15 269 / 15 199 / 15 121        | 13 473 / 12 263 / 14 282    | 16 327 / 15 656 / 12 800    |
| nasycení                            | 0,88 / 0,87 / 0,90              | 0,92 / 0,87 / 0,86          | 0,93 / 0,88 / 0,94          |
| pokrytí bílkovin                    | 0,78 / 0,75 / 0,87              | 0,86 / 0,71 / 0,72          | 0,87 / 0,74 / 0,90          |
| podíl masa / z toho čerstvého       | 17 / 15 / 25 % (8 %)            | 25 / 13 / 13 % (8 %)        | 25 / 11 / 28 % (16 %)       |
| úmrtí hladem (z toho září–říjen)    | 16 (9) / 16 (9) / 11 (10)       | 0 / 0 / 0                   | 0 / 0 / 0                   |
| lidé na konci                       | 32 / 32 / 39                    | 25 / 25 / 26                | 27 / 27 / 27                |

**Vlkov 781 a 796** (5–7 výrostků): víc masa než dřív a většinu zimy čerstvé, nasycení
a bílkoviny nahoru, nic se nezkazí; ve Vlkově 781 o 5 úmrtí hladem méně a o 7 lidí víc. Méně ovcí
přes zimu (místo pro jehňata), u 796 proto i méně mléka (−16 %).

**Vlkov 792** (2–3 výrostci): místo pro mláďata zmenší první zimu stádo na chovné minimum (ovce na
vlnu, pár prasat) – 81 prasat na maso, 3,6 t do uzení a 2,3 t se 1. 9. zkazí (staré kusy a kusy
nad nosnost jdou na maso vždy). Pak stádo roste jen pomalu a masa je jako s omezením porodů –
nasycení 0,86 proti 0,92. Dřív ves držela přes léto i kusy, které výrostci neuhlídali (podíl
uhlídaný přes rok se počítal i za zimu, kdy se pasou jen prasata).

## Co hráč vidí

- V horní liště **obilí, luštěniny, maso, mléko a sýr, ovoce** (ikony + čísla) a nasycení;
  tooltip nasycení ukáže energii a bílkoviny a podíly (ikony obilí / luštěniny / maso / mléko
  a sýr / vejce / ovoce s procenty).
- Stáda ve scéně odpovídají skutečnému počtu zvířat, u stád stojí pasáci; na podzim porážka,
  nouzová porážka („Vesničané porazili 23 prasat navíc“), 1. 9. zkažené maso a po zimě úhyn stáda
  (krátké zprávy).
- V panelu ohrady a u stád počty zvířat a nosnost (ikony + čísla); v panelu ohrady zvířata na noc
  / místa a čtverce; upozornění „Ovce se nevejdou do ohrad“, když se stádo do ohrad nevejde.

## Porážka ve scéně

Martin 26. 10. 2026: „Ideální by bylo, kdyby porážka měla vlastní sekvenci – omráčení, vykrvení,
vyvržení a rozčtvrcení.“ K doporučením: „Zbytek je ok.“ Jen hlášení – simulace scénu nečte, na
výsledek porážky (kusy, maso) nemá vliv. Podrobnosti a soubory: `docs/code/scene-village.md`
(Porážka ve scéně).

- Kolik kusů se dnes poráží, říká simulace; scéna z toho udělá 1 až 3 stanoviště a každé má
  vlastní sekvenci podle herního dne: přivedení, omráčení, vykrvení, zavěšení na kozlinu,
  vyvržení, rozčtvrcení a odnos kýt do domu.
- **Dvůr u domu** (Martin 26. 10. 2026: „Zbytek je ok“ k doporučení dělat porážku u domu); **kráva u ohrady skotu** (velká kozlina
  u branky).
- **Omráčení jen prase a kráva** (palice); ovce a koza se jen přidrží a podříznou vestoje.
- **Krev jen v misce** na zemi (a tmavá hladina v ní) – nikde jinde se nekreslí.
- **Bez paření a udírny** – maso se neupravuje, kýty se odnášejí rovnou do domu.
- Parta podle druhu (ovce a koza 2, prase 3, kráva 4 dospělí); kdo na porážku jde, nedělá nic
  jiného.
- Doba jednotlivých kroků, výška háků a podoba kozliny: návrh Clauda.

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                                                       | Kdo                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Jablka → „ovoce“ (ikona zůstane); ovoce zvyšuje nasycení i štěstí                                                                                                                                                | Martin                                            |
| Plné nasycení jen z kombinace obilí–maso–ovoce; samo obilí ani ovoce nestačí                                                                                                                                     | Martin                                            |
| Maso z dobytka (prasata v lese, přebytky ovcí, koz, krav), vejce; lov a rybolov později                                                                                                                          | Martin potvrdil směr                              |
| ~~Podíly 75 / 20 / 5 %, pestrost 0,80 + 0,14 × maso + 0,06 × ovoce~~; strop ovoce 25 %, masa 40 %                                                                                                                | návrh Clauda                                      |
| Maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné váhy; mléko a sýr ze všech dojných zvířat                                                                                                                    | Martin (18. 10. 2026)                             |
| Práce se zvířaty se počítá (dojení, sýr, zimní péče, prasata a slepice), pasení bez práce                                                                                                                        | Martin (18. 10. 2026)                             |
| Kvalita stravy 0,60 + 0,34 × bílkoviny + 0,06 × ovoce; strop mléka a sýra 30 % energie                                                                                                                           | návrh Clauda                                      |
| Váhy 20 / 60 / 58 kg, bílkoviny potravin, dojivost, sýr, práce – podle rešerše 18. 10. 2026                                                                                                                      | návrh Clauda (rešerše)                            |
| Dojí se 40 % skotu a 50 % ovcí a koz; sýr do 1. 5., ztráta 15 %/rok; potřeba masa z bílkovin                                                                                                                     | návrh Clauda                                      |
| Hladem se umírá jen z nedostatku energie, pestrost řídí porody a štěstí                                                                                                                                          | návrh Clauda                                      |
| Růst stád, nosnost (pastva, les, seno), porážka a výtěžnost masa, vejce, uzení 20 %/rok                                                                                                                          | návrh Clauda                                      |
| ~~Potřeba masa z podílu 20 % energie (≈ 60 kg na dospělého)~~ – nahrazeno bílkovinami                                                                                                                            | rozhodnutí kontroléru                             |
| Ovoce do zkažení a maso do porážky rovným dílem; stropy z potřeby energie                                                                                                                                        | rozhodnutí kontroléru                             |
| Pastva = louka do 600 m bez polí a staveb + příloh; na maso navíc nejvýš polovina mláďat                                                                                                                         | rozhodnutí kontroléru                             |
| Ves chová, kolik potřebuje – stádo dávající 1,5× potřeby masa neroste (krávy ano)                                                                                                                                | rozhodnutí kontroléru                             |
| Pastva po dílech přílohu od nejbližšího; zarůstající příloh a les vsi nejsou pastvinou                                                                                                                           | návrh Clauda                                      |
| 1,6 g/kg zůstává, přidají se luštěniny jako plodina na poli; maso mírně zvyšuje štěstí                                                                                                                           | Martin (18. 10. 2026)                             |
| Luštěniny 22 % bílkovin, energie jako obilí; strop 25 % energie; jí se rovným dílem do sklizně                                                                                                                   | návrh Clauda (rešerše)                            |
| Cíl luštěnin z bílkovin po obilí, mléku a vejcích; potřeba masa až po luštěninách (podle zásoby)                                                                                                                 | návrh Clauda                                      |
| Maso štěstí až +3 – plně od 20 % energie z masa, méně poměrně                                                                                                                                                    | návrh Clauda                                      |
| Osev podle stravy – ves seje obilí a luštěniny jen na energii, kterou nedá maso, mléko a ostatní                                                                                                                 | Martin (19. 10. 2026)                             |
| Výhled jídla do sklizně s mlékem stád podle doby dojení a s celou zásobou sýra                                                                                                                                   | návrh Clauda                                      |
| Doplnit roční ztráty stáda; seno i pro ovce a kozy; uzené maso nevydrží roky                                                                                                                                     | Martin (19. 10. 2026)                             |
| Ztráty ovce 12, kozy 10, prasata 12, skot 6 % ročně po dnech; mláďata jsou po zmetání                                                                                                                            | návrh Clauda (rešerše)                            |
| Skladba: ovce napřed, kozy mléko a křoviny, krávy voly a mléko, prasata maso, les celý rok                                                                                                                       | Martin (19. 10. 2026)                             |
| Chovné stádo se zmenšuje podle potřeby masa (bílkovin) – i dospělé kusy jdou na maso                                                                                                                             | Martin (19. 10. 2026)                             |
| ~~Rezerva 25 %; chov ovce → kozy → krávy → prasata~~; krávy aspoň 1 na 2 domácnosti a 3 na ohradu                                                                                                                | návrh Clauda                                      |
| Pasáci omezují stádo – co nikdo neuhlídá, jde na maso; pasou děti, starší, pak dospělí                                                                                                                           | Martin – nápad                                    |
| Pasák 40 krav, 100 ovcí či koz, 50 prasat (pes v číslech); dítě 40 %, starší 75 %                                                                                                                                | návrh Clauda (rešerše)                            |
| Dospělý pasák nejvýš jeden z domácnosti, pasení hned po dojení (stáda nepočkají)                                                                                                                                 | návrh Clauda                                      |
| Dospělý pasák jen ve vsi bez výrostků – za jednoho výrostka (0,4 pasáka), z práce vsi kolik pase                                                                                                                 | Martin (2. 11. 2026), čísla návrh Clauda          |
| Seno denně: kráva 5, vůl 6, ovce a koza 1 kg; zimní úhyn pod půlkou přídělu, pár přežije                                                                                                                         | návrh Clauda (rešerše)                            |
| Uzené maso se jí do 31. 8., pak se zkazí; seno ztrácí 10 % ročně, staré do nové seče shnije                                                                                                                      | návrh Clauda (rešerše)                            |
| Mláďata navíc na maso: prasata, krávy, kozy, ovce; porážka před polními úlohami listopadu                                                                                                                        | návrh Clauda                                      |
| Stádo vždy s pasákem; pase se na loukách určených ke spásání, ne na jídle pro lidi                                                                                                                               | Martin (19. 10. 2026)                             |
| Mladý příloh a otava luk letošní seče třetinou píce; strniště po sklizni ano, bez nosnosti                                                                                                                       | návrh Clauda (rešerše)                            |
| Pastviny: louka přílohu mimo seč, přirozené louky, mladý příloh, otava – od nejbližšího                                                                                                                          | návrh Clauda                                      |
| Málo pasáků – pasák vede víc zvířat; bez pasáka stádo stojí u domů; v zimě u domů                                                                                                                                | návrh Clauda                                      |
| Ves hospodaří rovnovážně – sytá, ± ideální strava a co nejvíc volného času na rozvoj                                                                                                                             | Martin (19. 10. 2026)                             |
| Cena jídla v práci za podmínek vsi; plán po kusech podle ceny kg bílkovin navíc proti obilí                                                                                                                      | návrh Clauda                                      |
| Co práci šetří, vždy – v pořadí ovce → kozy → krávy → prasata, do nosnosti a stropů                                                                                                                              | návrh Clauda                                      |
| Pak do potřeby + 10 % nejlevnější (prasata a luštěniny po 25 kg soupeří cenou), nad 88 % jen levnější než obilí; zásoba luštěnin stádo nezmenší                                                                  | návrh Clauda                                      |
| Ovce jsou hlavně kvůli vlně – aby se lidé mohli vůbec oblékat                                                                                                                                                    | Martin (19. 10. 2026)                             |
| Vlna 1,6 kg na dospělého (dítě 0,8), ovce 0,8 kg – 2 ovce na dospělého jako spodní hranice stáda                                                                                                                 | návrh Clauda (rešerše)                            |
| Pastva a seno: voli, ovce na vlnu, krávy na mléko a voly; pasáci napřed ovce na vlnu                                                                                                                             | návrh Clauda                                      |
| Bez vlny jen štěstí až −6 a upozornění; práce na vlně v domácí výrobě (přerozdělení, ne navíc)                                                                                                                   | Martin (19. 10. 2026)                             |
| Osadníci mají ovce na vlnu a seno na první zimu; jehňata ovcí na vlnu nejdou na maso navíc                                                                                                                       | Martin (19. 10. 2026)                             |
| Na částech pole musí být zasetý len                                                                                                                                                                              | Martin (19. 10. 2026)                             |
| Len 2 kg třeného lnu na dospělého (dítě 1); bez lnu štěstí až −4; zpracování v domácí výrobě                                                                                                                     | návrh Clauda (rešerše)                            |
| Nouzová porážka – ves, které výhled jídla do sklizně nevychází, napřed porazí zvířata navíc, pak šetří                                                                                                           | Martin (19. 10. 2026)                             |
| Pořadí prasata → kozy → krávy nad chovné → ovce nad ovce na vlnu; chovný pár, spřežení a telata zůstanou                                                                                                         | Martin (19. 10. 2026)                             |
| Kontrola každý den před jídlem; porazí, aby výhled vyšel s rezervou 5 % potřeby do sklizně; částečně jen o 2 body přídělu a víc                                                                                  | návrh Clauda                                      |
| Maso, uzení, zkažení 1. 9. a práce jako z podzimní porážky; strop masa 40 % platí i v nouzi                                                                                                                      | návrh Clauda                                      |
| Dojení, sýr a péče o zvířata bokem, mimo práci vsi – obstarají ženy; bez omezení                                                                                                                                 | Martin, 19. 10. 2026                              |
| Pasou jen výrostci 7–13 let, mimo práci vsi; jejich počet dál omezuje stáda                                                                                                                                      | Martin, 19. 10. 2026                              |
| Dospělí ani starší nepasou; v rovnovážném hospodaření pasáci nestojí práci, omezují počet kusů                                                                                                                   | návrh Clauda                                      |
| Nouzová porážka – prasata jen nad polovinu toho, kolik prasat uživí les (chovné prasnice)                                                                                                                        | Martin (19. 10. 2026)                             |
| Chovné prasnice z nosnosti lesa jako u podzimní porážky, aspoň chovný pár; letošní selata se do 31. 8. nepočítají                                                                                                | návrh Clauda                                      |
| „Ano ke všem návrhům“: letošní selata smějí od 1. 9. na nouzovou porážku; jehňata, kůzlata a telata dál ne                                                                                                       | Martin (19. 10. 2026)                             |
| „Tak většinou se v zimě porážejí staré kusy a na jaře některá mláďata pokud je jich moc. Navíc ovce, krávy i kozy musí být neustále březí aby dávaly mléko.“                                                     | Martin (19. 10. 2026)                             |
| „No hele porážky probíhaly jenom v zimě, v létě se maso rychle kazí. Navíc když porazíš zvíře hned na začátku zimy, nemusíš ho krmit senem.“                                                                     | Martin (19. 10. 2026)                             |
| „A pastevci by se měli snažit, aby rodily všechny samice. A nemusí se porážet jen 1. 11. ale po celou zimu, aby vesničané jedli maso ideálně čerstvé. Uzení je spíš jen nouzový způsob, jak naložit s přebytky.“ | Martin (19. 10. 2026)                             |
| Rodí všechny samice (podíl samic, mláďata na samici – rešerše), mléko jen od samic, které letos rodily                                                                                                           | návrh Clauda                                      |
| Stádo přes zimu s místem pro jarní mláďata podle výrostků příštího léta (věk dnešních dětí), z každého druhu stejný podíl                                                                                        | návrh Clauda                                      |
| Staré kusy na maso (ovce a kozy 1/8, krávy 1/10, prasnice 1/4); staré a nad nosnost vždy, „jen co ves sní“ jen pro ostatní                                                                                       | návrh Clauda                                      |
| Kusy na maso čekají a porážejí se po dnech přes zimu podle čerstvé spotřeby; přebytek a kusy, na které nestačí seno, hned do uzení                                                                               | návrh Clauda                                      |
| Porážka zmenší stádo v nosnosti jen o maso, které ves do 31. 8. sní pod stropem; zbytek žije (Martin: co nejvíc jídla)                                                                                           | návrh Clauda                                      |
| Plán stáda bez stropu výrostků v den rozhodnutí – výrostci omezí stádo jen přes podíl, který uhlídali                                                                                                            | návrh Clauda                                      |
| „Zvířata je potřeba na noc zavírat do ohrad. … Velikost ohrady bude mít vliv na velikost stáda.“ – stádo přes zimu i s jarními mláďaty jen do míst ohrad svého druhu                                             | Martin (19. 10. 2026)                             |
| Bez ohrady u domu 2 ovce, 1 koza, 1 prase na domácnost, krávy jen v ohradě; chovný pár druhu zůstane vždy                                                                                                        | návrh Clauda, Martin schválil                     |
| Místa jsou tvrdá mez i pro ovce na vlnu a krávy na mléko a voly; kusy čekající na zimní porážku jen do volných míst                                                                                              | rozhodnutí Clauda                                 |
| Roční odklad míst – porážka aspoň 365 dní po založení vsi nebo zavedení pravidla; upozornění i během odkladu                                                                                                     | návrh Clauda                                      |
| Kráva navíc na každé 4 voly (býčci ≈ 0,4 na krávu a rok, obměna desetiny volů ročně); bez ohrady skotu krávy nejsou                                                                                              | návrh Clauda, Martin („Ano, udělej to jak říkáš“) |
