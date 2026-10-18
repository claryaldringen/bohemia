# Strava a dobytek – obilí, maso, ovoce

Stav: schváleno 18. 10. 2026 (Martin: „Ano“), **implementováno 18. 10. 2026** – jádro
`domain/village/diet.ts` (jídlo dne), `livestock.ts` (stáda, porážka, vejce), `husbandry.ts`
(den hospodářství); scéna kreslí skutečná stáda. Rozhodnutí z implementace jsou v části
Implementace a v tabulce Rozhodnutí jako „rozhodnutí kontroléru“ – **k potvrzení** hlavně potřeba
masa (60 kg místo 20 kg na dospělého, viz níže).

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
- **Ne-cíl (teď):** lov a rybolov (později jako doplněk), mléko a sýry jako zvláštní potravina,
  zelenina ze zahrádek, sůl a uzení jako suroviny, nemoci dobytka.
- **Anti-cíl:** ves, která vymře jen proto, že nemá maso – nedostatek pestrosti strávníky oslabí,
  ale hladem se umírá jen z nedostatku energie (viz Hlad).

## Pojmy

- **Jablka → ovoce** – v rozhraní se přejmenují na **ovoce**, ikona zůstane (Martin). Sad dál
  plodí jablka; „ovoce“ je zásoba.
- **Energie** – kolik jídla (v obilních ekvivalentech) lidé snědí proti potřebě. **Obilí 1,
  maso 0,6, ovoce 1/7** (maso ≈ 2 000 kcal/kg proti obilí ≈ 3 400; jablka jako dnes – návrh
  Clauda).
- **Nasycení** – co hráč vidí (0–100 %): energie **a** pestrost stravy (níže).

## Pravidla (návrh Clauda, doladí se hraním)

### Podíly ve stravě

- Plná strava = **75 % energie z obilí, 20 % z masa, 5 % z ovoce**.
- **Nasycení = pokrytí energie × pestrost**, kde pestrost = 0,80 + 0,14 × pokrytí masa +
  0,06 × pokrytí ovoce (pokrytí = snědené ÷ podíl ve stravě, nejvýš 1):
  - jen obilí (dost energie) → **nasycení 80 %**,
  - obilí + maso → **94 %**,
  - obilí + ovoce → **86 %**,
  - obilí + maso + ovoce → **100 %** (Martin – kombinace).
- **Ovoce nikdy nestačí samo:** ovoce smí pokrýt nejvýš **25 % energie**, maso nejvýš **40 %** –
  zbytek musí být obilí (Martin). Ovoce se jí přednostně, dokud nezkazí (k 1. 3. – [sad](orchard.md)),
  maso po něm, obilí dorovná.
- **Ovoce a štěstí:** když lidé jedí ovoce, štěstí **+5** (sladké – Martin; [štěstí](happiness.md)).

### Hlad

- **Hladem se umírá z energie, ne z pestrosti:** nahromaděný hlad ([populace](population.md) –
  Hlad a vymření) roste jen z nedostatku **energie** (pod 90 %).
- **Nasycení** (energie × pestrost) dál řídí porody (pod 50 % se nerodí, plně od 95 %) a štěstí
  (hlad ubírá štěstí, pod 90 %). Ves jen s obilím (80 %) se tedy množí pomaleji a je méně šťastná,
  ale neumírá.

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
- **Vejce:** slepice dají celý rok ≈ **5 kg vajec na slepici** (počítají se jako maso – návrh
  Clauda).
- **Zásoba masa** se **uzí a suší** – ztratí **20 % ročně** (návrh Clauda). Potřeba masa ve
  stravě = **20 % energie**, tedy ≈ **60 kg na dospělého a rok** (dítě ≈ 33, starší ≈ 47).
  Návrh uváděl ≈ 20 kg (dítě 12, starší 15) = 20 % energie – to si odporuje: 20 kg masa je
  jen ≈ 12 kg obilí, ≈ 7 % energie dospělého. Implementace drží podíly ve stravě (75 / 20 / 5 %
  energie, jak říká tabulka Rozhodnutí) a z nich potřebu masa – **k potvrzení** (s 20 kg by
  plné nasycení masem dalo už výchozí stádo a pestrost by skoro nic neznamenala).
- **Práce:** pasou děti – žádná práce (Martin); porážka a uzení ≈ **1 člověkoden na 20 kg masa**;
  seno podle [orání rádlem](oxen.md).
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
  porody a štěstí s nasycením (energie × pestrost). Hlad v rozhraní (upozornění) = výhled energie.
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
  snědla každé mládě a stádo by nikdy nevyrostlo). **Ves chová, kolik potřebuje:** když by
  mláďata ovcí, koz a prasat (s vejci) dala aspoň 1,5× roční potřeby masa, jdou jejich letošní
  mláďata na maso celá a stádo už neroste – jinak by rostlo až do nosnosti luk (stovky ovcí na
  pár lidí, maso by hnilo a porážka brala práci). Krávy rostou dál do nosnosti (telata pro voly).
  Chovný pár (nebo co ves má, když méně) zůstane.
  Práce na porážce a uzení (1 člověkoden na 20 kg) je sezónní práce v listopadu.
- **Vejce:** slepice u obydlí každé domácnosti (zemnice 2, polozemnice 3 – jako ve scéně), 5 kg
  ročně na slepici, každý den do zásoby masa.
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

## Co hráč vidí

- V horní liště **obilí, maso, ovoce** (ikony + čísla) a nasycení; tooltip nasycení ukáže
  podíly (ikony obilí / maso / ovoce s procenty).
- Stáda ve scéně odpovídají skutečnému počtu zvířat; na podzim porážka (krátká zpráva).
- V panelu ohrady a u stád počty zvířat a nosnost (ikony + čísla).

## Rozhodnutí

| Rozhodnutí                                                                                    | Kdo                   |
| --------------------------------------------------------------------------------------------- | --------------------- |
| Jablka → „ovoce“ (ikona zůstane); ovoce zvyšuje nasycení i štěstí                             | Martin                |
| Plné nasycení jen z kombinace obilí–maso–ovoce; samo obilí ani ovoce nestačí                  | Martin                |
| Maso z dobytka (prasata v lese, přebytky ovcí, koz, krav), vejce; lov a rybolov později       | Martin potvrdil směr  |
| Podíly 75 / 20 / 5 %, pestrost 0,80 + 0,14 × maso + 0,06 × ovoce; strop ovoce 25 %, masa 40 % | návrh Clauda          |
| Hladem se umírá jen z nedostatku energie, pestrost řídí porody a štěstí                       | návrh Clauda          |
| Růst stád, nosnost (pastva, les, seno), porážka a výtěžnost masa, vejce, uzení 20 %/rok       | návrh Clauda          |
| Potřeba masa z podílu 20 % energie (≈ 60 kg na dospělého místo 20 kg) – **k potvrzení**       | rozhodnutí kontroléru |
| Ovoce do zkažení a maso do porážky rovným dílem; stropy z potřeby energie                     | rozhodnutí kontroléru |
| Pastva = louka do 600 m bez polí a staveb + příloh; na maso navíc nejvýš polovina mláďat      | rozhodnutí kontroléru |
| Ves chová, kolik potřebuje – stádo dávající 1,5× potřeby masa neroste (krávy ano)             | rozhodnutí kontroléru |
| Pastva po dílech přílohu od nejbližšího; zarůstající příloh a les vsi nejsou pastvinou        | návrh Clauda          |
