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
(implementováno, `legumes.ts`; [rešerše](research/2026-10-18-legumes.md)). Rozhodnutí
z implementace jsou v tabulce Rozhodnutí jako „návrh Clauda“ nebo „rozhodnutí kontroléru“.

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
  suroviny, nemoci dobytka, máslo a syrovátka zvlášť.
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
- **Kolik jich ves chce:** bílkoviny, které chybí po obilí (odhad obilí na 70 % energie), mléku
  stád a vejcích – každý kg luštěnin místo obilí se stejnou energií dá o **12 dkg bílkovin víc**
  (22 % proti 10 %) – nejvýš strop. S 1,6 g/kg chybí tolik, že luštěniny jdou ke stropu skoro
  vždy; ves je oseje k 1. 9. (cíl + rezerva 15 %), obilí má přednost.
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
    nebo kozu**; krávy (a voli) navíc potřebují na zimu **seno** ([orání rádlem](oxen.md) – 1,5 t
    na kus),
  - **prasata:** les do 600 m od vsi – ≈ **1 ha lesa na prase** (žaludy a bukvice).
- **Porážka na podzim** (listopad): co přeroste nosnost a mladé kusy navíc jdou na maso:
  **prase ≈ 50 kg, ovce ≈ 15 kg, koza ≈ 12 kg, kráva ≈ 120 kg** masa (návrh Clauda). Ves si nechá
  chovné kusy (nejméně pár od každého druhu).
- **Vejce:** slepice dají celý rok ≈ **5 kg vajec na slepici**, jí se čerstvá (návrh Clauda).
- **Zásoba masa** se **uzí a suší** – ztratí **20 % ročně** (návrh Clauda). **Kolik masa ves
  potřebuje, určí bílkoviny:** co chybí po obilí (odhad obilí na 70 % energie), mléku stád
  (85 % jeho bílkovin – syrovátka odteče) a vejcích, v mase (17 % bílkovin). Dospělý tak potřebuje
  ≈ 35 kg bílkovin ročně, z obilí ≈ 13 kg – s ≈ 110 l mléka ≈ **100 kg masa ročně** (vlastní
  výpočet; 1,6 g/kg je asi dvojnásobek bezpečné dávky FAO/WHO – Martinova volba). Dřív pevně
  60 kg (20 % energie) – nahrazeno.
- **Práce:** pasou děti – žádná práce (Martin); porážka a uzení ≈ **1 člověkoden na 20 kg masa**;
  dojení a péče viz Práce se zvířaty; seno podle [orání rádlem](oxen.md).
- **Ohrada:** krávy a voli přes zimu v ohradě s přístřeškem ([orání rádlem](oxen.md)); ovce, kozy
  a prasata přezimují u domů (návrh Clauda).

## Implementace (18. 10. 2026)

Rozhodnutí kontroléru tam, kde návrh nedává číslo nebo postup (Martin je může změnit):

- **Jídlo dne** (`eatDiet`): ztráta zásob (obilí podle nádob, maso uzením po dnech), pak ovoce
  **rovným dílem do zkažení** (1. 3.) a maso **rovným dílem do příští porážky** (1. 11.), obojí
  nejvýš do svého stropu; obilí dorovná potřebu energie. Stropy (ovoce 25 %, maso 40 %) jsou
  podílem **potřeby** energie – bez obilí tak ves dostane nejvýš 65 % energie, samo ovoce 25 %.
  Když obilí do sklizně nevystačí, dělí se energie rovně do sklizně (s masem a ovocem, které ještě
  přijdou na řadu); když by obilí do zkažení ovoce nebylo potřeba, jí se do té doby jen maso
  a ovoce a obilí zůstane na dobu po nich (jako dřív u jablek).
- **Hlad z energie:** nahromaděný hlad i přirážka úmrtnosti za dnešní hlad počítají s energií,
  porody a štěstí s nasycením (energie × kvalita z bílkovin). Hlad v rozhraní (upozornění) =
  výhled energie. Mléko a ovoce se do výhledu na další dny nepočítají (jen dnešní), maso, sýr
  a vejce ano.
- **Stáda** jsou čísla s podílem kusu (mláďata a porážka se počítají podílem stáda), panel
  a scéna je zaokrouhlí. Výchozí stádo dostane nová ves i ves uložená před dobytkem (z domácností,
  jako dřív ozdoba scény). **Mláďata 1. 4.** (stádo × roční růst).
- **Nosnost:** pastva = louka do 600 m od první zemnice (z krajiny při založení, simulace krajinu
  nemá) bez toho, co zabírají pole mimo příloh, zarůstající příloh (křoviny, mladý les), les vsi,
  sady, hřbitovy, pozemky a ohrady, plus příloh na vymýceném lese (pase se na celém přílohu ve
  fázi louky – mladém, pastvině i po seči); voli mají na pastvě přednost, ovce, kozy a krávy se
  o zbytek podělí poměrně. Les pro prasata = les do 600 m bez dílů polí založených v lese, s lesem
  vsi na bývalé louce ([pole – Les vsi](fields.md)). Krávy přes zimu jen tolik, kolik uživí seno
  po volech.
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
  Chovný pár (nebo co ves má, když méně) zůstane.
  Práce na porážce a uzení (1 člověkoden na 20 kg) je sezónní práce v listopadu.
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
bílkovin pokrytá luštěninami.

## Co hráč vidí

- V horní liště **obilí, luštěniny, maso, mléko a sýr, ovoce** (ikony + čísla) a nasycení;
  tooltip nasycení ukáže energii a bílkoviny a podíly (ikony obilí / luštěniny / maso / mléko
  a sýr / vejce / ovoce s procenty).
- Stáda ve scéně odpovídají skutečnému počtu zvířat; na podzim porážka (krátká zpráva).
- V panelu ohrady a u stád počty zvířat a nosnost (ikony + čísla).

## Rozhodnutí

| Rozhodnutí                                                                                        | Kdo                    |
| ------------------------------------------------------------------------------------------------- | ---------------------- |
| Jablka → „ovoce“ (ikona zůstane); ovoce zvyšuje nasycení i štěstí                                 | Martin                 |
| Plné nasycení jen z kombinace obilí–maso–ovoce; samo obilí ani ovoce nestačí                      | Martin                 |
| Maso z dobytka (prasata v lese, přebytky ovcí, koz, krav), vejce; lov a rybolov později           | Martin potvrdil směr   |
| ~~Podíly 75 / 20 / 5 %, pestrost 0,80 + 0,14 × maso + 0,06 × ovoce~~; strop ovoce 25 %, masa 40 % | návrh Clauda           |
| Maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné váhy; mléko a sýr ze všech dojných zvířat     | Martin (18. 10. 2026)  |
| Práce se zvířaty se počítá (dojení, sýr, zimní péče, prasata a slepice), pasení bez práce         | Martin (18. 10. 2026)  |
| Kvalita stravy 0,60 + 0,34 × bílkoviny + 0,06 × ovoce; strop mléka a sýra 30 % energie            | návrh Clauda           |
| Váhy 20 / 60 / 58 kg, bílkoviny potravin, dojivost, sýr, práce – podle rešerše 18. 10. 2026       | návrh Clauda (rešerše) |
| Dojí se 40 % skotu a 50 % ovcí a koz; sýr do 1. 5., ztráta 15 %/rok; potřeba masa z bílkovin      | návrh Clauda           |
| Hladem se umírá jen z nedostatku energie, pestrost řídí porody a štěstí                           | návrh Clauda           |
| Růst stád, nosnost (pastva, les, seno), porážka a výtěžnost masa, vejce, uzení 20 %/rok           | návrh Clauda           |
| ~~Potřeba masa z podílu 20 % energie (≈ 60 kg na dospělého)~~ – nahrazeno bílkovinami             | rozhodnutí kontroléru  |
| Ovoce do zkažení a maso do porážky rovným dílem; stropy z potřeby energie                         | rozhodnutí kontroléru  |
| Pastva = louka do 600 m bez polí a staveb + příloh; na maso navíc nejvýš polovina mláďat          | rozhodnutí kontroléru  |
| Ves chová, kolik potřebuje – stádo dávající 1,5× potřeby masa neroste (krávy ano)                 | rozhodnutí kontroléru  |
| Pastva po dílech přílohu od nejbližšího; zarůstající příloh a les vsi nejsou pastvinou            | návrh Clauda           |
| 1,6 g/kg zůstává, přidají se luštěniny jako plodina na poli; maso mírně zvyšuje štěstí            | Martin (18. 10. 2026)  |
| Luštěniny 22 % bílkovin, energie jako obilí; strop 25 % energie; jí se rovným dílem do sklizně    | návrh Clauda (rešerše) |
| Cíl luštěnin z bílkovin po obilí, mléku a vejcích; potřeba masa až po luštěninách (podle zásoby)  | návrh Clauda           |
| Maso štěstí až +3 – plně od 20 % energie z masa, méně poměrně                                     | návrh Clauda           |
