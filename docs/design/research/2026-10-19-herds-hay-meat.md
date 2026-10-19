# Stáda, seno, maso a pasáci – podklady

Rešerše k `docs/design/diet.md` (Dobytek, Pasáci, Skladba stáda, Trvanlivost masa) a
`docs/design/oxen.md` (Seno), stav 19. 10. 2026. Martin ve Vlkově (26 lidí) viděl po zimě
6 100 kg uzeného masa, 40 krav, 53 prasat a 70 t sena a napsal: „Určitě doplň roční ztráty
stáda.“, „Nezdá se mi, že bychom sklízeli tolik sena, že by to stáda uživilo.“, „A uzené maso
určitě také nevydrží 3 roky.“ a později k pasákům, ke skladbě stáda a k prasatům (citace
v diet.md).

**Jak číst:** u každého čísla co uvádí literatura, odkud, a co hra použije. Přepočty jsou moje
(**vlastní výpočet**). **Omezení:** přímé raně středověké údaje o úhynu, dávkách sena a práci seče
ve střední Evropě jsem nenašel. Opírám se o anglické panské účty a příručky 13.–14. století,
o moderní tradiční chov (FAO, rozvojové země) a o moderní rozšiřovací služby (seno). Co mám jen
z výtahu vyhledávače nebo z obecně známých údajů bez dohledaného zdroje, je označené
**(jen výtah)** nebo **(odhad)**.

**Meze `{ worst, best }`** (CLAUDE.md – Meze produktivity) posouvají čísla podle pokrytí výrobky
řemeslníků. Kde rozpětí literatury s řemesly nesouvisí (úhyn, dávky, pasáci), hra bere jedno
číslo z rozpětí a rozpětí je jen tady. Mez dostala práce seče (kosy od kováře).

---

## 1. Roční ztráty stáda

| Druh           | Literatura                                                                                                                                                                                                                                                                 | Hra (podíl stáda za rok) |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Skot           | FAO, pastevecké systémy subsaharské Afriky: úhyn krav 7,6–8,2 %, telat 22–23 %; smíšené (rolnické) systémy krávy 4–6 %, telata 21–22 %. Modelový parametr FAO: chovné samice 5 %, mladý dobytek 11 %. Program veterinární péče v Egyptě: dospělý skot 3,8–5,3 %.           | **6 %**                  |
| Ovce           | Dospělé ovce 7,4 % (s veterinární péčí) až 13,6 % (bez ní), jehňata 17–25 %; pastevecké systémy Etiopie u malých přežvýkavců až 36 % mladých. Anglická panská stáda 13.–14. století – běžný úhyn kolem desetiny až pětiny stáda za rok, v letech moru víc **(jen výtah)**. | **12 %**                 |
| Kozy           | Dospělé kozy 5,4–15,6 %, kůzlata 19–25 %.                                                                                                                                                                                                                                  | **10 %**                 |
| Prasata        | Přímé číslo pro volně pasená prasata nemám; mladá prasata v lese ohrožují vlci a nemoci **(odhad 10–15 %)**.                                                                                                                                                               | **12 %**                 |
| Výjimečné roky | Dobytčí mor 1319–1320: velká statky Winchesteru přišly za rok o 588 z 1 088 kusů skotu – katastrofa, ne běžný rok.                                                                                                                                                         | – (námět: nákazy)        |

**Co hra počítá:** mláďata (`LIVESTOCK.growth` – ovce a kozy +40 %, prasata +100 %, krávy +20 %
k 1. 4.) jsou ta, která přežila první týdny – zmetání a úhyn novorozených jsou v nich. Roční ztráta
pak dopadá rovnoměrně po dnech na celé stádo i letošní mláďata (nemoci, vlci, úrazy). Stálé stádo
dá mláďaty po ztrátách maso: (1 + růst) × (1 − ztráta) − 1 kusů na chovný kus – ovce 0,23, kozy
0,26, prasata 0,76, krávy 0,13 (**vlastní výpočet**).

## 2. Zimní krmení

| Číslo                            | Literatura                                                                                                                                                                                                                                           | Hra                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Velikost raně středověkého skotu | Pohansko 105,9 cm v kohoutku (rešerše 2026-10-18-dairy-protein.md); souhrn Kyselého o domácích zvířatech raného a vrcholného středověku v ČR; ještě v 15. století skot z hradu Skály 91–127 cm. Živá váha ≈ 200–250 kg (**odhad** z výšky).          | –                                     |
| Kolik sena sní kus               | Moderní pravidlo: ≈ 2 % živé váhy sušiny denně, u špatné píce 1,5 %, ztráty při krmení 6–20 %. Na 200–250 kg ≈ 4–5 kg sušiny ≈ **5 kg sena** (88 % sušiny – **vlastní výpočet**). Středověké zimní dávky bývaly pod záchovnou – dobytek v zimě hubl. | kráva **5 kg**, vůl **6 kg** (orá)    |
| Ovce a kozy                      | Raně středověká ovce ≈ 25–35 kg (**odhad**) → 2,5–3 % váhy ≈ **1 kg** sena denně; ve střední Evropě se ovcím a kozám běžně dávala letnina (olistěné větve sušené v létě).                                                                            | **1 kg** (letnina počítaná jako seno) |
| Prasata                          | Pastva v lese na žaludech a bukvicích (mast) – v Anglii pannage zhruba od konce září do konce listopadu, po ní porážka, přes zimu jen chovná prasata. Martin 19. 10. 2026: „zvládnou pást v lese po celý rok“.                                       | **bez sena**, les celý rok            |
| Délka zimy                       | Listopad–březen (oxen.md – Seno).                                                                                                                                                                                                                    | **151 dní**                           |

Dřív hra dávala 10 kg denně krávě i volovi (moderní ≈ 500 kg dobytek) a ovcím a kozám nic – seno
tak počítalo dvojnásobek pro krávy a nic pro malé přežvýkavce.

## 3. Louky, výnos a práce seče

| Číslo         | Literatura                                                                                                                                                                                                                                 | Hra                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Výnos louky   | Nehnojená jednosečná louka ≈ 1–2,5 t sena na hektar, přílohová pastvina spíš dolní část **(odhad)**.                                                                                                                                       | **1,5 t/ha** (beze změny)                             |
| Seč           | Sekáč s dlouhou kosou poseče **asi akr (0,4 ha) za den** – středověké sekáčské řady i pozdější irské folklorní sbírky → ≈ 2,5 člověkodne na hektar (**vlastní výpočet**). Krátká raně středověká kosa a srp jsou pomalejší (**odhad** 2×). | –                                                     |
| Sušení a svoz | Za sekáči šly ženy a děti – obracely a sušily seno, hrabaly do kup, nakonec se svezlo do stohů. Čísla po krocích jsem nenašel; **odhad** obracení a sušení 3–5 čd/ha, svoz a stohování 2–4 čd/ha.                                          | –                                                     |
| Celkem        | 10–15 člověkodní na hektar (**vlastní výpočet** ze součtu).                                                                                                                                                                                | **meze 15 → 10 čd/ha** (bez kos / s kosami od kováře) |

Dřív 6 čd/ha – jen samotná seč.

## 4. Ztráty sena ve stohu

| Způsob uskladnění    | Ztráta sušiny                                                            |
| -------------------- | ------------------------------------------------------------------------ |
| Pod střechou (seník) | ≈ 2–5 % za rok                                                           |
| Venku, nekrytý stoh  | 15–40 % (tabulka Univerzity v Georgii), na zemi 25–30 % (Mississippi)    |
| Venku, 9 měsíců      | 5–20 %; na štěrku místo hlíny zvětralá vrstva 11 % místo 23 % (Indiana)  |
| Kde se ztrácí        | hlavně ve vnější vrstvě (pokus z Nebrasky); přes další rok seno plesniví |

**Hra:** stoh ztrácí **10 % ročně** (dobře založený stoh s krytým vrškem – spodní část rozpětí
venkovních ztrát) a **zbytek loňského sena se k nové seči (1. 6.) zkazí** – po roce ve stohu je
plesnivé a vyluhované (Martin: „stoh přes rok – zbytek starého sena se kazí“). Ves proto seče o
ztrátu do zkrmení víc (≈ 6 % – 198 dní od poloviny seče do poloviny zimy, **vlastní výpočet**).

## 5. Trvanlivost uzeného masa

- Tradiční domácí uzení: maso z porážky v chladných měsících se nasolí, vyudí a vysuší dřív, než
  přijde teplo; takto vydrží jaro a do léta. V teple žlukne tuk a maso napadá hmyz. Zdroje jsou jen
  praktické (uzenářská fóra, příručky – „měsíce v chladu a suchu“) **(jen výtah)**.
- Lidová tradice střední Evropy: uzené se šetřilo na žně, nejtěžší práci roku **(odhad – obecně
  známé, zdroj nedohledán)**.
- Raní Slované měli soli málo (zboží zvenku – trade.md), maso tak vydrželo spíš kratší dobu.

**Hra:** maso z podzimní porážky (1. 11.) se jí rovným dílem **do 31. 8.**; 1. 9. se zbytek zkazí.
Maso z porážky mimo listopad (dosloužilé spřežení v září a říjnu) se jí do porážky. Vysychání 20 %
ročně zůstává. Důsledek: v září a říjnu ves maso nemá – bílkoviny jen z obilí, luštěnin, mléka,
sýra a vajec (námět: porážka jehňat a kůzlat na podzim).

## 6. Pasáci

| Číslo          | Literatura                                                                                                                                                                                                                                      | Hra (na dospělého pasáka se psem)   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Krávy          | Obecní pastýř pozdějších staletí s pomocníkem a psy pásl celé stádo vsi – desítky až přes sto kusů; dítě páslo krávy rodiny – několik kusů **(odhad 30–150 na dospělého)**. V raně středověké krajině s lesy a vlky bez plotů spíš menší stáda. | **40**                              |
| Ovce a kozy    | Ovčák se psy v otevřené krajině stovky ovcí (**odhad 50–400**); kozy se rozbíhají po křovinách.                                                                                                                                                 | **100**                             |
| Prasata v lese | Pasák vepřů s pomocníkem desítky až stovky prasat v lese **(odhad 50–150)**.                                                                                                                                                                    | **50**                              |
| Děti a starší  | Pasáček (dítě od ≈ 7 let) pásl husy a pár kusů rodiny; starší lidé pásli tam, kde už nemohli na pole **(odhad)**.                                                                                                                               | dítě 7–13 **40 %**, starší **75 %** |
| Pes            | Kosti psů jsou na raně středověkých sídlištích běžné **(odhad – obecně známé)**; pes pasení výrazně usnadní.                                                                                                                                    | v číslech (hra psy nevede)          |

Rozpětí je velké a s řemesly nesouvisí – jedno číslo. Pastevní sezóna duben–říjen (krávy, ovce,
kozy v zimě na seně v ohradě a u domů), prasata v lese celý rok.

## 7. Skladba stáda (Martin 19. 10. 2026)

| Druh    | Co dává                                                                                                                                                                                                                                               | Náročnost (hra)                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Ovce    | Vlna, mléko i maso. Mléko pro lidi u primitivních plemen ≈ 20–60 l za laktaci (hra 25 l), bohaté – ≈ 5,7 % bílkovin (dairy-protein).                                                                                                                  | 0,2 ha pastvy, 1 kg sena denně, 100 na pasáka                   |
| Kozy    | **Víc mléka než ovce** – Martin to chtěl ověřit: pro lidi ≈ 50–150 l (hra 60 l), ale chudší (3,3–3,6 % bílkovin) – na kus o něco víc bílkovin (2,2 proti 1,4 kg za rok – **vlastní výpočet**). Okusují keře, výhonky a větve, kam ovce a skot nejdou. | jako ovce; navíc spasou zarůstající příloh (křoviny, mladý les) |
| Krávy   | Nejvíc mléka (hra 300 l pro lidi) a masa (120 kg) na kus, telata na tažné voly.                                                                                                                                                                       | 1 ha pastvy (5× ovce), 5 kg sena denně (5× ovce), 40 na pasáka  |
| Prasata | Jen maso, množí se nejrychleji.                                                                                                                                                                                                                       | 1 ha lesa, bez sena, 50 na pasáka                               |

Čísla dojivosti `DAIRY` (kráva 300 l, koza 60 l, ovce 25 l pro lidi za rok) leží v rozpětí –
beze změny. Bílkoviny, které dá chovný kus za rok mlékem (po syrovátce 85 %) a masem z mláďat po
ztrátách: ovce 1,2 kg, kozy 1,5 kg, krávy 6,0 kg, prasata 6,5 kg (**vlastní výpočet**, hra
`proteinPerHead`).

## 8. Vlna (námět, ve hře zatím není)

Ovce se v raném středověku chovaly hlavně pro vlnu – přeslenky a závaží tkalcovských stavů patří
k nejběžnějším nálezům na slovanských sídlištích **(odhad – obecně známé)**. Návrh zapojení je
v diet.md (Námět – vlna).

## 9. Pastva na přílohu, otavě a strništi (doplněno 19. 10. 2026)

- **Mladý příloh** (první 1–2 roky po obilí): porost tvoří plevele, výmladky obilí a řídký drn, který
  se teprve zapojuje; na jednoletém úhoru (set-aside) kryje půdu plevel ze ≈ 74–79 % proti ≈ 89–94 %
  na dlouhodobém (německá studie) – píce je málo a horší **(jen výtah)**. Přímé číslo výnosu
  pastvy jsem nenašel. **Hra:** třetina píce louky.
- **Otava:** louka posečená v červnu–červenci obrůstá pomaleji, pase se od srpna do konce sezóny –
  zhruba třetina sezóny **(odhad)**. **Hra:** třetina.
- **Strniště po sklizni:** paběrky (vypadlé klasy, plevel) pásl dobytek ve středověkých vsích
  běžně až do zorání **(odhad – obecně známé)**; do nosnosti hra strniště nepočítá (pár týdnů).
- **Osetý díl a louka před sečí** jsou jídlo – dobytek se z nich vyháněl (pasák, ploty) –
  Martin 19. 10. 2026.

## Zdroje

- FAO, _Cattle production parameters of pastoral and mixed systems in sub-Saharan Africa_ (tab.
  23–24) – https://www.fao.org/4/y4176e/y4176e08.htm; modelové parametry –
  https://www.fao.org/4/x5878e/X5878e06.htm
- Úhyn mladých a dospělých kusů s veterinární péčí a bez ní (skot, ovce, kozy) –
  https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2024.1389303/pdf
- Úhyn mladého dobytka v pasteveckých a smíšených systémech Etiopie –
  https://livestocklab.ifas.ufl.edu/media/livestocklabifasufledu/pdf-/LSIL-Presentation-(2019_19_02)-Reach-Young-Stock-Mortality----Smith-UCD-ETH.pdf
- Dobytčí mor a hladomor 1315–1322 (Winchester) –
  https://writingmedieval.substack.com/p/the-great-famine-and-murrains-in
- Page, M.: The technology of medieval sheep farming (Crawley, Hampshire) –
  https://www.medievalists.net/2011/04/the-technology-of-medieval-sheep-farming-some-evidence-from-crawley-hampshire-1208%E2%80%931349/
- Kyselý, R.: domácí zvířata raného a vrcholného středověku v ČR (bakalářská práce UK, 2008) –
  https://dspace.cuni.cz/handle/20.500.11956/17094; skot z hradu Skály –
  https://journals.muni.cz/gvms/article/download/1639/1275/1586
- Příjem sušiny a seno na krávu – https://www.drovers.com/news/beef-production/how-much-hay-will-cow-consume-estimate-your-winter-feed-needs
- Ztráty sena při skladování – https://extension.illinois.edu/beef-cattle/reducing-hay-waste,
  https://georgiaforages.caes.uga.edu/content/dam/caes-subsite/forages/docs/georgia-cattlemens/2010/GC1002.pdf,
  https://beef.unl.edu/beefwatch/2022/minimizing-storage-losses-round-bale-hay/,
  https://extension.msstate.edu/node/7034
- Seč – akr za den – https://www.henhamhistory.org/medieval-farming/,
  https://www.duchas.ie/en/cbes/5008910/4966065
- Pannage (prasata v lese, porážka po pannage) – https://en.wikipedia.org/wiki/Pannage,
  https://www.metmuseum.org/en/perspectives/medieval-garden-enclosed-pigs-and-pannage
- Uzené maso bez chlazení (praxe) –
  https://www.smokingmeatforums.com/threads/shelf-life-of-home-cured-bacon.285261/
- Mléko, sýr, bílkoviny, velikost skotu: rešerše 2026-10-18-dairy-protein.md
- Plevel na jednoletém a dlouhodobém úhoru (set-aside) –
  https://conservationevidencejournal.com/individual-study/2628
