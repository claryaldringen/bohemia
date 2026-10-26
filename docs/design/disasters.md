# Přírodní pohromy – zlé roky, kroupy, povodně, požár

Stav: **návrh Clauda, čeká na Martina** (27. 10. 2026). Nic z toho není v kódu. Navazuje na
[pole](fields.md) (úroda, pojistka zásob, obilné jámy), [stravu a dobytek](diet.md), [orání
rádlem](oxen.md) (seno), [obyvatelstvo](population.md) (hlad, hájení), [divokou zvěř](wildlife.md)
(škody na dílech), [obchod](trade.md) (sousedé) a [krajinu](landscape.md) (niva potoka). Čísla
zdůvodňuje [rešerše](research/2026-10-27-disasters.md). Co níž není výslovně Martinovo, je návrh
Clauda.

## Proč

Martin, 24. 10. 2026: „Teď žije vesnice v ideální krajině – nedějí se jí žádné přírodní
pohromy, žádná neúroda atd.“

Martin, 26. 10. 2026: „Teď si musíme vystačit s dvojpolím a zkalibrovat to, aby vesnice za
normálních okolností nehladověla, protože až přidáme přírodní katastrofy, bude to hukot.“

Dnes dá stejná práce na stejné půdě vždy stejnou úrodu ([pole](fields.md) – Úroda: „Bez
náhody … Dobré a špatné roky přijdou až s mechanikou počasí; hájení z populace se pak rozšíří
i na neúrodu“, Martin). Pojistka zásob (0,5 roční potřeby celé energie) čeká na hubené roky:
„Hubené roky (pohromy, neúroda) přijdou později; pojistka se pak doladí s nimi.“ Raně středověká
ves žila od žní ke žním – jeden zlý rok ji vyčerpal, dva za sebou přinesly hlad (Čechy
1281–1282, rešerše §1). Bez pohrom nemají pojistka, obilné jámy, dobytek jako živá zásoba ani
obchod se sousedy skutečnou zkoušku.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** **zlé roky počasí** sdílené celým krajem (sucho, deštivé léto, krutá zima) a **místní
  pohromy** jedné vsi (kroupy, povodeň potoka, požár obydlí) – jen přes existující mechaniky:
  úroda dílů, seno a pastva, zásoby, hlad, stav staveb, sousedé.
- **Cíl:** ves **za normálních okolností nehladoví** (Martin, 26. 10. 2026); s plnou pojistkou
  **přežije jeden krutý rok** bez úmrtí hladem; **dva kruté roky za sebou** přinesou hlad
  a úmrtí, ale ves nevymře (rešerše – 1281–1282, Campbell a Ó Gráda).
- **Cíl:** **deterministicky** – počasí ze seedu světa a roku, místní pohromy ze seedu vsi a roku;
  stejný stav a den dá vždy stejný výsledek, nezávisle na dopočtu po kouscích.
- **Cíl:** hráč i ves se mohou **připravit** – pojistka, obilné jámy, ozim i jař, rozptýlená pole
  mimo nivu, seno s rezervou, rozestupy domů, obchod. Žádná nová velká mechanika.
- **Cíl:** pohroma je **vidět a vysvětlit** – ve scéně, v kronice, v odhadu úrody dílu.
- **Ne-cíl (teď):** dobytčí mor (fáze 2 – otázka 3), epidemie lidí, sarančata (v Čechách až od
  1338), pozdní mráz v květu sadu, vichřice a polomy, požár lesa, myší roky, požár dílen
  a svatyní, předpověď počasí, změna krajiny povodní.
- **Anti-cíl:** pohroma, která vyhladí ves za jeden rok; náhoda, kterou nejde vysvětlit; hašení
  jako klikací minihra; pohroma, proti které nejde nic udělat; vesničané, kteří na zlý rok
  nereagují (seč, osev, porážka reagují samy – „Vesničané sami používají, co jim ulehčí práci“,
  Martin).

## Které pohromy (výběr z rešerše)

| Pohroma                       | Doklad (rešerše)                                                     | Fáze                     |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------ |
| Sucho                         | nejčastější extrém počasí v Čechách (Brázdil 2013), Kosmas – neúrody | **1**                    |
| Deštivé léto a mokré žně      | neúrody 1315–1317 (Zbraslavská kronika)                              | **1**                    |
| Krutá zima – holomráz, dlouhá | agronomie (vymrzání ozimu), _neověřeno_                              | **1**                    |
| Kroupy                        | agronomie (úzký pás), _neověřeno_                                    | **1**                    |
| Povodeň potoka                | Kosmas si všímá povodní; seznam povodní od 1118                      | **1**                    |
| Požár obydlí                  | hlad i po požáru zásob (Dvořáčková-Malá 2021)                        | **1** (nebo mor – ot. 3) |
| Dobytčí mor                   | 10–14 nákaz 750–950, 809–810 (Newfield); 1319–1320 ≈ 62 % skotu      | 2                        |
| Sarančata                     | v Čechách až od 1338 (Brázdil)                                       | později – událost světa  |
| Epidemie lidí                 | Justiniánův mor v Bavorsku (6. st.), v Čechách nedoložen             | později                  |
| Chladná léta 536 – ≈ 660      | pozdně antická doba ledová (Büntgen 2016)                            | otázka 4                 |

## Počasí roku – kraj (návrh Clauda)

**Kraj:** dokud není mapa světa, je celý svět **jeden kraj** – všechny vsi mají stejné počasí
(otázka 1). Počasí roku je čistá funkce **seedu světa a herního roku** (`yearWeather`). Má dvě
části – **zimu** (prosinec–březen, patří k roku, ve kterém končí) a **léto** (duben–srpen).

### Léto

| Léto                  | Četnost | Ozim  | Jařiny¹ | Seno  | Pastva | Kdy je vidět |
| --------------------- | ------- | ----- | ------- | ----- | ------ | ------------ |
| dobré                 | 25 %    | ×1,15 | ×1,15   | ×1,10 | ×1     | 1. 6.        |
| normální              | 46 %    | ×1    | ×1      | ×1    | ×1     | –            |
| suché                 | 10 %    | ×0,90 | ×0,75   | ×0,70 | ×0,8   | 1. 5.        |
| **kruté sucho**       | 4 %     | ×0,75 | ×0,50   | ×0,45 | ×0,6   | 1. 5.        |
| deštivé               | 11 %    | ×0,85 | ×0,85   | ×0,75 | ×1     | 1. 6.        |
| **mokré žně** (kruté) | 4 %     | ×0,60 | ×0,65   | ×0,60 | ×1     | 15. 7.       |

¹ Jařiny = jař, luštěniny a len (setí na jaře).

- **Proč takhle:** sucho bije hlavně jař (mělké kořeny, jarní a letní sucho – 73,7 % suchých
  měsíců je duben–září, Brázdil 2013), ozim dozraje dřív. Deštivé léto kazí seno (hnije při
  sušení) a mokré žně obilí (klíčí v klasu), pastvě neškodí. Suchých let je v Čechách ≈ 1 z 2,4
  (16.–18. st.), ale ne každé je neúroda – škodu má jen 14 % let (suché a kruté sucho).
- **Zlé roky se shlukují** (Bekar 2019 – neúroda zvýší šanci příští o 20–30 %): po zlém létě
  (suché, kruté sucho, deštivé, mokré žně) jsou šance zlých let příští rok **×1,25** na úkor
  normálního.
- **Násobí se hrubá úroda** dílu při sklizni (stejně jako nedodělaná práce a škoda zvěře);
  osivo (175 kg/ha) se odkládá celé, takže **čistá úroda klesne víc** – při úrodě 585 kg/ha dá
  hrubá ×0,625 jen ≈ 190 kg místo 410 kg čistého (−53 %). Tak vypadá raně středověký hladový rok
  při výnosu 1 : 3 (rešerše §2).

### Zima

| Zima          | Četnost | Dopad                                                                                     | Kdy je vidět |
| ------------- | ------- | ----------------------------------------------------------------------------------------- | ------------ |
| normální      | 82 %    | –                                                                                         | –            |
| holomrazná    | 9 %     | mráz bez sněhu, **ozim ×0,65** (vymrzne třetina)                                          | 1. 1.        |
| dlouhá sněžná | 9 %     | seno se krmí **o 30 dní déle** (do 30. 4.), pastva od 1. 5.; jarní povodeň častější (níž) | 1. 3.        |

Ozim i jař tak **rozkládají riziko**: holomráz bije ozim, sucho jař – ves, která seje obojí
(osevní postup to dělá sám), nepřijde o všechno naráz.

### Co z toho plyne

- **Průměr let:** hrubá úroda ≈ **0,95** dnešní (dobré roky vyrovnají část zlých). **Plán osevu
  počítá s průměrem** (`WEATHER.expectedYield` 0,95 v `sowingTargets`) – ves zaseje o ≈ 5 % víc
  než dnes a v normálním roce si pojistku doplní. Bez toho by ves v průměru ujídala z pojistky.
- **Zlý rok** (hrubá úroda vsi pod 90 % normální): ≈ 1 rok ze 3 (≈ 1,1 dne skutečného času).
- **Krutý rok** (pod 70 %: kruté sucho, mokré žně, holomráz se zlým létem): ≈ **1 rok z 10–12**
  (≈ 4 dny skutečného času).
- **Dva kruté roky za sebou:** ≈ 1 % ročně – **zhruba jednou za století** (≈ 37 dní skutečného
  času, za rok hry ≈ 10×). Krutý rok a po něm zlý: ≈ 4 % ročně.

## Místní pohromy – jedna ves (návrh Clauda)

Ze **seedu vsi a roku** (den, místo, směr). V **prvních 5 letech** vsi žádné (osadníci mají
zásoby na 18 měsíců a ještě nemají pojistku).

### Kroupy

- **Kdy:** jeden den **1. 6. – 15. 7.**, šance **6 % ročně** (≈ 1 z 16 let).
- **Kde:** pás **300 m** široký přes celé okolí vsi (směr a posun ze seedu). Díly, jejichž střed
  leží v pásu, přijdou o **60 % nesklizené úrody** (ozim před žněmi, jařiny); sklizené díly
  a louky po seči nic.
- **Kolik:** pás zasáhne typicky 10–25 % polí – ves přijde o ≈ 10 % úrody roku. **Rozptýlená
  pole** jsou pojistka (hráč volí, kde zakládá pole – jako u zvěře les).
- Škoda jde do úrody dílu stejně jako škoda zvěře (`parts` – podíl hrubé úrody po dílech).

### Povodeň potoka

- **Zóna:** políčka **do 1,5 m nad hladinou potoka** (`heightAboveStream` z `floodplain.ts` –
  tatáž funkce, která dává nivě vyšší úrodnost). **Krajina se nemění** – po ostrém spuštění se
  vrstva nesmí změnit; voda je jen ve scéně a škoda ve stavu vsi.
- **Jarní (tání, 1.–20. 3.):** šance **4 %**, po dlouhé sněžné zimě **20 %**. Ozim na dílech
  v zóně **×0,5**.
- **Letní (bouřky, 15. 6. – 15. 8.):** šance **3 %**, v deštivém létě **10 %**, při mokrých
  žních **20 %**. Nesklizená úroda dílů v zóně **×0,2**, otava z luk v zóně (seč 1. 8.) ×0,5.
- **Stavby v zóně:** stav **−20 %** (zemnice −30 % – zatopená jáma); obydlený dům obyvatelé
  opraví prací vsi jako jindy ([populace](population.md) – Chátrání). **Obilná jáma v zóně:**
  zrno −25 % (zateče) – a nová jáma se do zóny nekope (`grain-pit-site.ts`).
- **Pole v nivě** jsou úrodnější a ohroženější – volba hráče.

### Požár obydlí

- **Šance:** **0,4 % na obydlí a rok** (ves s 15 domy ≈ 6 % ročně, ≈ 1 z 17 let); v suchém létě
  ×2, v krutém suchu ×3. Den ze seedu.
- **Šíření:** obydlí do **12 m** chytí s šancí **25 %** (jen jednou – žádná řetězová reakce přes
  celou ves). Rozestupy domů jsou na hráči.
- **Dopad:** dům vyhoří (stav 0 → zbytek jámy jako po rozpadu, [populace](population.md) – Po
  zániku); obyvatelé bydlí u příbuzných (Rozpad domácnosti) a **sami ho přestaví na stejném
  místě** (Přestavba – rozhodují obyvatelé). Shoří **díl zásob uložených v domě**: zrno mimo
  jámy (`looseGrainKg`), maso a sýr **÷ počet obydlí**. **Zrno v zapečetěné jámě přečká.**
- **Nikdo nezemře** (anti-cíl – smrt přijde jen z hladu po ztrátě zásob).

## Dopady na existující mechaniky (návrh Clauda)

- **Úroda** ([pole](fields.md) – Úroda): hrubá úroda dílu × počasí (ozim / jařiny) × (1 − kroupy)
  × (1 − povodeň) × (1 − zvěř). Odhad úrody dílu v panelu ukazuje i počasí, jakmile je vidět.
- **Seno a pastva** ([orání rádlem](oxen.md) – Seno, [strava](diet.md) – Zimní krmení): výnos
  seče × seno roku. **Seč 1. 6. plánuje s letošním výnosem** – v suchém roce ves poseče víc luk
  (víc práce), dokud louky stačí. Nosnost pastvy v létě × pastva roku. Dlouhá zima prodlouží
  krmení do 30. 4. – co seno nevydrží, řeší dnešní porážka v zimě.
- **Seno s rezervou:** dnes ves seče přesně potřebu a zbytek se k nové seči zkazí. Návrh: plán
  seče **+15 %** (rezerva na dlouhou zimu a suchý rok). Stojí ≈ 15 % práce seče navíc.
- **Zásoby a pojistka** ([pole](fields.md) – Osev podle zásob): pojistka zůstává **0,5 roční
  potřeby celé energie** – s průměrem let v plánu osevu ji ves v normálních letech udrží.
  **Paměť hladu:** po krutém roce drží ves **10 let pojistku 0,75** (seje víc sama – vesničané
  si zlý rok pamatují), pak zase 0,5.
- **Hlad** ([populace](population.md) – Hlad a vymření): beze změny – nouzová porážka, šetření,
  hlad a úmrtí přijdou samy z menších zásob.
- **Hájení** (Martin – „hájení i na neúrodu“, podoba návrh Clauda): v prvních **30 letech vsi**
  dopadá počasí **poloviční silou** (např. ×0,5 → ×0,75) a místní pohromy prvních 5 let vůbec;
  hájení už dnes chrání dospělé před smrtí hladem.
- **Stavby** ([populace](population.md) – Chátrání a přestavba): povodeň ubere stav, požár obydlí zničí – přes dnešní stav,
  chátrání, zbytek jámy a přestavbu.
- **Obchod** ([obchod](trade.md) – Sousedé): sousedé jsou ve stejném kraji. Při doplnění **1. 11.**
  po zlém roce mají **poloviční zásobu obilí** a obilí je **o polovinu dražší** (ostatní zboží
  v kg obilí ×0,67); po krutém roce **čtvrtinovou zásobu** a obilí **dvakrát dražší** (×0,5) –
  ceny v hladovém roce na dvoj- až trojnásobek (Ó Gráda 2005). Dobytek je pak levný – ves bez
  sena ho prodá, ves s pojistkou nakoupí. Hřivny jsou uložená hodnota na zlý rok.
- **Zvěř** (malé, volitelné): po holomrazné nebo dlouhé zimě 1. 5. ubude navíc 10 % jelení zvěře
  a 15 % prasat; v krutém suchu (málo žaludů) jen poloviční počet selat.
- **Krajina:** beze změny – niva je už dnes v `floodplain.ts`, povodeň ji jen využije.

## Kalibrace (návrh Clauda)

**Cíle:**

1. **Normální okolnosti** (všechny roky normální): ves po hájení **nikdy nehladoví** – žádné
   „Ves hladoví“ (energie pod 90 %), „Ves šetří jídlem“ nejvýš výjimečně v rostoucí vsi
   (Martin, 26. 10. 2026). To je úkol dvojpolí a čísel úrody – musí platit **před** pohromami.
2. **Jeden krutý rok s plnou pojistkou:** žádné úmrtí hladem; nejvýš „Ves šetří jídlem“ před
   žněmi, nouzová porážka smí.
3. **Dva kruté roky za sebou:** „Ves hladoví“, umírají děti a starší – ves ztratí **≈ 10–25 %
   lidí**, ale nevymře; v hájení dospělí neumírají.
4. **S pohromami v průměru:** ≥ 95 % let bez hladu (energie ≥ 0,9).

**Proč by to mělo vyjít:** ves jí ≈ 70 % energie z pole ([pole](fields.md) – pojistka). Krutý
rok ubere ≈ 50 % čisté úrody → ≈ 35 % roční energie; pojistka 0,5 to pokryje a zbyde ≈ 15 %
(plus maso z porážky bez sena). Druhý krutý rok ubere dalších ≈ 35 % – chybí ≈ 15–20 % roční
energie, ves jí ≈ 80–85 % přídělu a podle [populace](population.md) („Mírný nedostatek (80 %
přídělu) … za rok stojí ≈ 15 % lidí“) přijde o zhruba desetinu až pětinu lidí.

**Jak se to ověří (bez dlouhé kalibrace – ta jen na Martinův pokyn):**

- **Unit testy jádra:** `yearWeather` přes 10 000 let dá četnosti z tabulek (±1 %) a shlukování;
  vynucený sled let (`weatherOverride` – jen testy a dev) na ustálené testovací vsi:
  [krutý] → 0 úmrtí hladem, [krutý, krutý] → úmrtí 10–25 %, ves žije, [normální × 10] → bez hladu.
- **`village-calculator.ts`** (ustálený stav, rychlý): nový přepínač `--weather` s průměrnou
  úrodou 0,95 – kolik osevu a práce stojí průměr let.
- **Vlkov a nové vsi:** dev mód **„Vynutit zlý rok“** vedle skoku v čase ([účty](accounts.md) –
  dev mód) – Martin projde krutý rok a dva za sebou ve hře a sleduje nasycení, porážku, kroniku.
- **`measure-village`** jen na Martinův pokyn (`--variant disasters`).

## Obrana a příprava (bez nových velkých mechanik)

| Co                        | Proti čemu                | Kdo                         | Stav                     |
| ------------------------- | ------------------------- | --------------------------- | ------------------------ |
| Pojistka zásob 0,5 (0,75) | zlý a krutý rok           | ves sama                    | je; nově paměť hladu     |
| Obilné jámy               | požár, ztráty skladováním | ves sama                    | je; nově ne v nivě       |
| Ozim i jař                | holomráz × sucho          | ves sama (osevní postup)    | je                       |
| Rozptýlená pole mimo nivu | kroupy, povodeň           | **hráč** (kde zakládá pole) | je                       |
| Seno s rezervou +15 %     | sucho, dlouhá zima        | ves sama                    | nové pravidlo            |
| Dobytek jako živá zásoba  | zlý rok                   | ves sama (nouzová porážka)  | je                       |
| Rozestupy obydlí          | šíření požáru             | **hráč** (kde staví obydlí) | je                       |
| Obchod, hřivny            | zlý rok, chybějící seno   | **hráč**                    | je; nově ceny podle roku |

## Co hráč vidí (UI jako 0 A.D.)

- **Horní lišta:** ikona počasí roku (prasklá zem, mrak s deštěm, sněhová vločka s mrazem), jen
  když léto nebo zima nejsou normální a už jsou vidět (sloupec „Kdy je vidět“); slova
  v `Tooltip` („Kruté sucho – jař a seno o polovinu slabší“). Dobré léto: klas se sluncem.
- **Upozornění** (krátká, mizející, jako „Ves šetří jídlem“): „Sucho“, „Mokré žně“, „Holomráz –
  ozim vymrzá“, „Kroupy potloukly obilí“, „Povodeň“, „Vyhořel dům“. Z jiné vsi hráče s jejím
  jménem.
- **Kronika:** „Rok 812 – kruté sucho, úroda o třetinu menší“, „Kroupy potloukly 4 díly
  (−1 200 kg)“, „Povodeň zaplavila 3 díly a 2 obydlí“, „Vyhořel dům Radoslavův“, „Sousedé
  hladoví – obilí zdražilo“.
- **Díl pole:** v odhadu úrody řádky „Sucho −25 %“, „Kroupy −60 %“ (jako škoda zvěře).
- **Obchod:** u obilí ikona zdražení, když je kraj po zlém roce.
- **Scéna** (jen když nastane – výchozí letní vzhled `REFERENCE_DAY` se nemění):
  - **sucho** – tráva a pole od června žlutší a řidší (parametr suché trávy v `season-look.ts`),
  - **deštivé léto** – víc oparu, tmavší tráva, na mokrých žních polehlé obilí,
  - **holomráz** – zima bez sněhu, na jaře hnědé skvrny na ozimu; **dlouhá zima** – sníh do dubna,
  - **kroupy** – v den krupobití bílý pás na zemi, pak potlučené (nižší) obilí na dílech do žní,
  - **povodeň** – rozlitá voda na políčkách zóny 3–5 dní (plocha vody jako potok), pak hnědé
    bahno 2 týdny,
  - **požár** – plameny (`pyre-fire.ts`) a hustý dým (`village-smoke.ts`) 1 den, pak spáleniště
    jako zbytek jámy a stavba nového domu.
- **Zvuky** (volitelně): hrom a kroupy, praskání ohně.

## Pro implementaci (poznámky, ne kód)

- **Čísla** v novém `rules-disasters.ts` (`WEATHER`, `HAIL`, `FLOOD`, `FIRE`, `DISASTER_TRADE`)
  s odkazy na sekce tohoto návrhu; změna čísla = i text zde.
- **Doména:** `domain/village/weather.ts` – `yearWeather(worldSeed, year)` (čistá funkce, se
  shlukováním přes předchozí rok – rekurze omezená na pár let zpět, ať je to O(1)),
  `cropWeatherFactor(weather, crop, hajeni)`; `disasters.ts` – kroupy, povodeň a požár dne ze
  seedu vsi a roku. Pořadí v `simulate.ts` pevné: počasí a místní pohromy dne před sklizní
  a sečí, požár před jídlem.
- **Stav:** volitelné `VillageState.disasters` (škody po dílech jako `FieldDamage.parts`, záznamy
  pro kroniku, `famineMemoryUntilYear`, `fromYear`). Starší vsi se převedou při načtení jednou
  a idempotentně – **pohromy platí až od roku nasazení** (`fromYear`), dopočet starší vsi je
  nevytáhne zpětně.
- **Seed světa** není v gitu (repo je veřejné – z kódu a seedu by šlo spočítat budoucí počasí):
  v DB nebo `.env` (`WORLD_SEED`), do testů pevný. **Server je autorita** – klient dostane jen
  počasí, které už je vidět (sloupec „Kdy je vidět“), nikdy budoucí.
- **Scéna:** typy z jádra a `lib/village-view.ts`; `season-look.ts` dostane vstup počasí roku
  (sucho, mokro, sníh) – při normálním roce beze změny vzhledu; voda povodně jako samostatná
  plocha nad políčky zóny (`needsRender` při změně), oheň a dým z existujících tříd.
- **Pořadí prací:** fáze 1 = počasí roku (úroda, seno, pastva, osev s průměrem, hájení,
  obchod) → kroupy → povodeň → požár → scéna a UI. Každá část vlastní úloha, testy jádra hned.

## Navazuje

- [Pole](fields.md) – Úroda („Bez náhody“ končí), Osev podle zásob (pojistka, průměr let), Obilné
  jámy; [orání rádlem](oxen.md) – Seno; [strava](diet.md) – Zimní krmení, Nouzová porážka,
  Náměty – Nákazy (dobytčí mor ve fázi 2); [populace](population.md) – Hlad a vymření, Hájení,
  Přestavba; [zvěř](wildlife.md) – Škody (stejný model škod po dílech); [obchod](trade.md) –
  Sousedé; [krajina](landscape.md) – niva potoka; [válka](war.md) – vypálení vsi později stejnou
  cestou jako požár.

## Rozhodnutí

| Rozhodnutí                                                                                 | Kdo                    |
| ------------------------------------------------------------------------------------------ | ---------------------- |
| Ves zatím v ideální krajině, bez pohrom a neúrody                                          | Martin (24. 10. 2026)  |
| Napřed dvojpolí a kalibrace, ať ves za normálních okolností nehladoví; pak pohromy         | Martin (26. 10. 2026)  |
| Úroda bez náhody, dobré a špatné roky až s počasím; hájení se pak rozšíří i na neúrodu     | Martin                 |
| Pojistka 0,5 se doladí s hubenými roky                                                     | Martin (19. 10. 2026)  |
| Fáze 1: sucho, deštivé léto a mokré žně, krutá zima, kroupy, povodeň, požár obydlí         | návrh Clauda           |
| Počasí roku sdílené krajem (celý svět, dokud není mapa), místní pohromy ze seedu vsi       | návrh Clauda           |
| Četnosti a síla v tabulkách; zlé roky se shlukují ×1,25; násobí se hrubá úroda, osivo celé | návrh Clauda (rešerše) |
| Osev počítá s průměrem let 0,95; paměť hladu – pojistka 0,75 na 10 let po krutém roce      | návrh Clauda           |
| Seno s rezervou +15 %; seč plánuje s letošním výnosem                                      | návrh Clauda           |
| Hájení: počasí poloviční silou 30 let, místní pohromy ne prvních 5 let                     | návrh Clauda           |
| Sousedé po zlém roce: poloviční zásoba obilí a ×1,5 cena; po krutém čtvrtinová a ×2        | návrh Clauda (rešerše) |
| Povodeň krajinu nemění; zóna do 1,5 m nad potokem; jámy se do ní nekopou                   | návrh Clauda           |
| Požár: obydlí, šíření do 12 m jednou, zrno v jámách přečká, nikdo neumírá                  | návrh Clauda           |
| Seed světa mimo git, klient vidí jen počasí, které už nastalo                              | návrh Clauda           |

## Otázky pro Martina

1. **Kraj:** má mít **celý svět stejné počasí** (všichni hráči mají zlý rok naráz, sousedé
   zdraží – jako 1281–1282 v celých Čechách), nebo **každá ves vlastní** ze svého seedu? Návrh:
   celý svět, dokud není mapa světa s kraji.
2. **Hájení:** „hájení i na neúrodu“ – stačí v prvních 30 letech **poloviční síla** a prvních
   5 let bez místních pohrom, nebo má být ves v hájení **úplně bez pohrom**?
3. **Požár, nebo dobytčí mor** do první fáze? Návrh: požár (je vidět, obilné jámy dostanou smysl);
   mor skotu (≈ 60 % skotu i s voly – rána pro orbu, v raném středověku dobře doložený) ve fázi 2.
4. **Dějiny v kalendáři světa:** svět startuje roku 500 – chladná léta **536 – ≈ 660** (sopky,
   Büntgen 2016; od startu ≈ 13 dní skutečného času), hladomor **1281–1282**, sarančata **1338**.
   Mají přijít jako **pevné události světa**, nebo jen náhoda? Návrh: 536–545 deset let s častějším
   zlým létem jako první velká zkouška, 1281–1282 a 1338 pevně.
5. **Síla:** krutý rok ≈ 1 z 10–12 let (≈ 4 dny skutečného času), dva kruté za sebou ≈ jednou
   za století (≈ 37 dní, za rok hry ≈ 10×). Je to ten „hukot“, nebo častěji / řidčeji?
