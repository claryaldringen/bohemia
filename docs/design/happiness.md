# Štěstí obyvatel a posvátná místa

Stav: schváleno 18. 10. 2026 (Martin: „Ano, takhle je to dobré“), implementováno 18. 10. 2026
(jádro `domain/village/people/happiness.ts` a `sacred.ts`, čísla v `rules.ts`). Rozhodnutí z implementace
(definice dubu a háje, dřina, modla bez roviny) jsou níže v textu a v tabulce Rozhodnutí jako
„rozhodnutí kontroléru“ – Martin je může změnit; hřbitov u dubu a zápis ušetření při vytyčení
Martin potvrdil.

## Proč

Ves není jen pracovní síla – lidé, kteří hladoví, pohřbívají děti a dřou na doraz, pracují hůř.
Štěstí obyvatel dává hráči další páku na produktivitu (Martin) a otevírá posvátná místa raných
Slovanů: posvátné duby, dubové háje, dřevěné modly a nakonec svatyni jako v Perynu.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** štěstí ovlivňuje produktivitu práce celé vsi (Martin).
- **Cíl:** štěstí zvyšují posvátná místa (Martin); snižuje ho hlad, úmrtí, přeplněnost a dřina
  (Martin potvrdil).
- **Cíl:** posvátné duby a háje vznikají samy – vesničané je při mýcení nechají stát (Martin).
- **Ne-cíl (teď):** kněží a obřady jako mechanika, svátky, víra jako surovina, křesťanství.
- **Anti-cíl:** ukazatel, který se mění skokem a hráč ho musí neustále hlídat – štěstí se mění
  pomalu.

## Štěstí

- Číslo **0–100**, výchozí **50** (návrh Clauda). Hráč ho vidí v horní liště (ikona + číslo).
- **Cílová hodnota** = 50 + posvátná místa + dobré zásoby + ovoce + maso + med − hlad − úmrtí − přeplněnost − dřina,
  oříznutá na 0–100. Skutečné štěstí se k cíli **posouvá pomalu** – o 10 % rozdílu za měsíc (návrh
  Clauda), takže jedna špatná zima ves nezlomí a jedna socha ji hned nespasí.
- **Co ubírá** (návrh Clauda, doladí se hraním):
  - **hlad:** nasycení pod 0,9 ubere až **40** (lineárně k nulovému nasycení),
  - **úmrtí** za poslední rok: **max(0,5; 5 − 0,06 × věk v letech)** za každého zemřelého,
    dohromady nejvýš **−20** – Martin (24. 10. 2026): „Ať úmrtí dál srážejí štěstí, ale tím
    způsobem, že čím starší zemřelý bude, tím míň to štěstí ubere.“ Čísla návrh Clauda:
    novorozenec 5, 15 let 4,1, 30 let 3,2, 50 let 2, 60 let 1,4, 70 let 0,8, od 75 let 0,5.
    Úmrtí zapsaná před touto změnou (bez věku) ubírají postaru – dítě 5, dospělý a starší 3,
  - **přeplněnost:** podíl lidí v přeplněných domácnostech × **15**,
  - **dřina:** podíl dní za posledních 60, kdy ves nestihla práci v období (polní práce se
    nedodělala), × **15**. Den dřiny (rozhodnutí kontroléru): ves by polní práce, které právě
    běží, dnešním tempem nedodělala do konce jejich oken – úlohy se řadí podle konce okna
    a zbývající práce se sčítá (co končí dřív, musí být hotové dřív). Plná práce ve špičce, která
    se stihne, dřinou není.
- **Co přidává:** posvátná místa (níže), dobré zásoby (zásoby na víc než rok; od 19. 10. 2026
  zásoby obilí a luštěnin na víc než rok potřeby z pole – [pole](history/fields-history.md), Osev podle stravy)
  **+5**, ovoce **+5** – dokud lidé jedí ovoce, je sladké (Martin – [strava](diet.md), od 18. 10. 2026), maso
  až **+3** – plně od 20 % energie z masa, méně poměrně (Martin: „maso bude mírně zvyšovat
  štěstí“, čísla návrh Clauda), med **+2** – dokud lidé jedí med (od 18. 11. 2026; návrh
  Clauda, [strava](diet.md) – Strava po vrstvách a porážka celý rok). Štěstí ze stravy (maso,
  ovoce, med) se od 18. 11. 2026 počítá **po lidech** podle toho, co kdo ten den snědl, a ves
  vezme průměr přes jedlíky (lidi jedoucí ze zásob vsi i hosty; kdo je pryč, se nepočítá).
- **Hlad** počítá s nasycením se stravou (energie × pestrost – [strava](diet.md)): ves jen
  s obilím je nasycená na 80 % a ubere si tak ≈ 4 body.
- **Účinek na práci** (Martin – „nechme to tak, doladíme později“): veškerá práce vsi se násobí
  - štěstí 0 → **× 0,8**, štěstí 50 → **× 1**, štěstí 100 → **× 1,1** (mezi tím lineárně).
  - Násobí se s mezemi produktivity od řemeslníků ([řemesla](crafts.md) – zatím nejsou).
- Simulace vede štěstí den po dni (posun o denní podíl tak, aby za měsíc ubylo 10 % rozdílu);
  úmrtí posledního roku a dny dřiny si pamatuje ve stavu vsi. Úmrtí ubere podle věku zemřelého
  (výš). Ves uložená před zavedením štěstí začne na 50.

## Posvátná místa

Každé místo přidá k cílovému štěstí; posvátná místa dohromady nejvýš **+40** (návrh Clauda).

### Posvátný dub (vzniká sám)

- **Velký solitérní dub** – dospělý dub z vrstvy překážek, který je velký (horní třetina velikosti
  dubů v krajině – návrh Clauda) a nestojí v souvislém lese (Martin: „pokud na nějaký takový při
  mýcení lesa narazí, nechají ho stát, i když kolem bude třeba pole“).
- Definice při implementaci (rozhodnutí kontroléru): velikost = výška modelu × měřítko stromu,
  horní třetina všech dospělých dubů vrstvy; mimo souvislý les = do **15 m** od něj roste nejvýš
  **5** jiných dospělých stromů (v lese jich bývá 10–20, kolem osamělých dubů v loukách 0–4).
  Vychází ≈ 100–150 posvátných dubů na krajinu, ≈ 40–60 do 600 m od vsi – zhruba jeden na
  50 čtverců louky. Které duby jsou posvátné, plyne jen z vrstvy překážek (stejně v prohlížeči
  i na serveru); ves si pamatuje ty, které vesničané opravdu ušetřili.
- Když se mýtí čtverec (pole, sad, hřbitov, staveniště) a stojí na něm takový dub, **vesničané ho
  nechají stát** – nepokácí ho a nedá kládu. Čtverec pole se oseje kolem (plocha pod korunou ≈ 50 m²
  se do dílu nepočítá). Pro kácení na stavby se takový dub nebere.
  - Sad se vysadí kolem stejně jako pole (plocha bez koruny). **Hřbitov** na čtverec s posvátným
    dubem nesmí – hroby jdou v pevné mřížce jako u skalního výchozu (Martin potvrdil 18. 10. 2026); dub zůstane stát. Obydlí, modla ani svatyně nesmí stát pod korunou (kmen blíž než ≈ 4 m od
    půdorysu); dub na vyklízené ploše obydlí zůstane stát.
  - Ušetření se zapíše hned při zahájení stavby (Martin potvrdil 18. 10. 2026: „Vesničané budou
    vytyčovat pole a u toho si všimnou, že je někde posvátný dub a začnou ho navštěvovat“),
    s událostí kroniky a upozorněním; u kurzoru je oranžové varování „Posvátný dub zůstane
    stát“.
- Dub se tím **stane stavbou** – jde vybrat a ve scéně má u kmene drobné obětiny (kameny, stužky).
- **Čím starší dub, tím víc štěstí** (Martin 18. 10. 2026: „Posvátné duby – čím jsou starší, tím
  víc štěstí přidávají. Nejmladší 1, nejstarší 10.“): živý dub stáří **150 let přidá +1**,
  **2000 let +10** (nejvyšší možné stáří, viz níže). Mezi tím podle **logaritmu stáří**, na celé
  body (návrh Clauda): každé zdvojnásobení stáří přidá stejně (≈ 2,4 bodu) – 200 let +2, 300 let
  +3, 400 let +4, 600 let +6, 800 let +7, 1000 let +8, 1400 let +9. Lineárně by 200 a 600 let
  dalo +1 a +3 a mladé duby by skoro nic neznamenaly; logaritmus dává znát i rozdíl v prvních
  stoletích, kdy je většina dubů mladá (150–400 let), a ke konci světa (≈ 1100–1400 let) už
  přidává pomalu. Stáří se počítá jako v panelu (Co hráč vidí), štěstí se mění jen přelomem
  herního roku nebo uschnutím.
- **Započítají se nejvýš 3 duby – ty, které přidávají nejvíc** (návrh Clauda; dřív 3 duby po +5).
  Stropy počtu (3 duby) i součtu (+40) zůstávají: na začátku světa dají tři duby +3 až +12
  (dřív +15), kolem roku 1000 (duby ≈ 600–900 let) ≈ +20, ke konci světa ≈ +25. Ves, která má
  i háje a modly, strop +40 dosáhne i bez dubů – stáří dubů tak rozhoduje hlavně ve vsi bez hájů
  a svatyně (ve Vlkově 18. 10. 2026: duby 6 + 6 + 5 = 17, dřív 15, háje 30, modly 16 – strop
  +40 před i po, cílové štěstí 82,5 beze změny). Kdyby měly staré duby znát i tam, šlo by strop
  zvednout (např. +50) – rozhodne Martin.
- **Dub stářím uschne** (Martin 18. 10. 2026: „Ano, mohou stářím uschnout, ale ať je to
  variabilní. Posvátné stromy se obecně mají dobře – mají dost prostoru a světla, lidé je mohou
  zalévat, když je sucho. Takže to udělej tak, aby se ty nejstarší mohly dožít až 2000 let.“).
  Návrh Clauda:
  - **Délka života** každého posvátného dubu = 800 + 1200 × B let, kde B je druhé nejmenší
    z pěti náhodných čísel (rozdělení Beta(2, 4)): ≈ **81 % dubů se dožije 800–1400 let**
    (nejčastěji ≈ 1100, průměr 1200), ≈ 19 % déle, přes 1700 let ≈ 1,6 % a **2000 let nikdo
    nepřekročí**. Nejkratší život 800 let je dvakrát běžný věk dubu (≈ 600 let) – posvátný dub
    má prostor, světlo a péči.
  - Náhoda je ze seedu z id a polohy dubu ve vrstvě překážek – **stejný dub má stejný život
    v každé vsi**, nic se neukládá; vše je čistá funkce dne hráče.
  - Dub uschne **v létě** (červen–srpen, kdy přijde sucho) roku, kdy jeho stáří dosáhne délky
    života. Zůstane **posvátná souš** (model souše dubu, obětiny u ní zůstávají): jde vybrat,
    v panelu ukáže stáří, ve kterém uschla, a přidá **+1** (návrh Clauda – lidé k ní dál chodí).
  - Souš stojí **50–100 let** (rovnoměrně, návrh Clauda) a pak **padne** v kterýkoli den roku:
    zůstane padlý kmen, obětiny zmizí a místo už není posvátný dub – nejde vybrat a nic
    nepřidává. Na místo se dál nestaví a souš ani kmen se nekácí – ochrana místa plyne jen
    z vrstvy překážek (rozhodnutí Clauda: bez toho by se stav vsi musel pamatovat).
  - Posvátné duby žijí 150–400 let k roku 500, takže do roku 1500 může dub zestárnout nejvýš na
    ≈ 1400 let – 2000 je horní mez, které se ve světě nedožije nikdo. Na 20 krajinách
    (2506 posvátných dubů) do roku 1500 **uschne ≈ 59 %** a souš padne u ≈ 47 %; do roku 1100
    uschne 2,4 %, do 1300 ≈ 26 %, medián uschnutí je rok 1323 – duby usychají hlavně v poslední
    třetině světa.
  - Kronika: „Posvátný dub stářím uschl – zůstala posvátná souš.“ a „Posvátná souš padla.“;
    nahoře krátký mizející řádek (fakt) „Posvátný dub uschl“ / „Posvátná souš padla“.
  - Ušetří-li ves dub, který už podle svého života uschl, je to souš; už padlý dub se do panelu
    ani scény nedostane.
  - **Háj se nemění** – jeho duby jsou lesní duby bez délky života (usychají jen posvátné
    solitérní duby, které do háje nepatří), háj tak zůstává hájem, dokud ho podmínka (≥ 6 dubů
    v 25 m s převahou dubů) drží – a ta plyne z vrstvy překážek.
- **Posvátné duby se postupně zvětší** (Martin 18. 10. 2026: „lidé jim udělají prostor a ty stromy
  tak budou moci víc růst“) – jen vzhled, pravidla se nemění: velikost × (1 + 0,3 × min(1, roky
  od ušetření / 60)) (návrh Clauda), po celých herních letech (stínová mapa se překreslí nejvýš
  jednou za herní rok); kruh obětin roste s kmenem.
- Hráč dub ochránit nemusí; na posvátný dub se pak nedá stavět ani ho pokácet.

### Dubový háj (vzniká sám)

- **Háj** = místo v lese, kde roste aspoň **6 dospělých dubů** v okruhu **25 m** (návrh Clauda).
- Definice při implementaci (rozhodnutí kontroléru): les vrstvy překážek je z třetiny dubový, takže
  6 dubů v okruhu 25 m má skoro každé místo lesa. Háj je proto místo, kde duby **převažují** –
  aspoň 6 dospělých dubů v okruhu 25 m a duby tvoří aspoň **65 %** dospělých stromů v tom okruhu;
  střed je dub v lese (ne osamělý), středy hájů jsou aspoň 50 m od sebe. Čtverce háje = políčka
  se středem do 25 m od středu háje, na kterých roste dospělý strom (4–9 čtverců). Vychází
  ≈ 7–13 hájů na krajinu, 2–4 do 600 m od vsi; počet dubů háje (pro štěstí) je počet dubů
  v okruhu 25 m (obvykle 15–35, takže háj většinou přidá plných +15).
- Když se mýtí les kolem, **vesničané háj nechají** a vykácejí jen les okolo (Martin). Čtverce
  háje se z pole (nebo jiné stavby) vyjmou a celý háj se **změní ve stavbu po čtvercích** – jako
  sad (Martin). Jde vybrat, ve scéně má na okraji kamenný kruh a obětiny.
  - Čtverce háje se z výběru pole, sadu i hřbitova tiše vyjmou (u kurzoru oranžově „Dubový háj
    zůstane stát“); souvislost výběru se posuzuje i s nimi. Obydlí, modla ani svatyně na čtverec
    háje nesmí; vyklízená plocha obydlí háj nemýtí a háj ušetří. Stromy hájů se pro stavby
    nekácí.
- Přidá **+10** štěstí a **+1 za každé 2 duby nad 6**, nejvýš **+15** za háj; započítají se nejvýš
  **2** háje.

### Dřevěná modla (staví hráč)

- Jednoduchá dřevěná socha na kůlu (inspirace: modly ze Zbruče a Wolinu, Martin – wiki), kolem malý
  udusaný kruh. Staví se jako obydlí – půdorys **4 × 4 m** kamkoli na louku (návrh Clauda) i do
  lesa – les se vyklučí jako u obydlí (Martin, 19. 10. 2026 – [populace](population.md), Stavba
  v lese).
- Cena: **30 člověkodní a 1 dospělý dub** (kmen na modlu – dřevo podle [lesa](forest.md)).
- Přidá **+8** štěstí, započítají se nejvýš **2** modly.
- Implementace: stavba ze společné práce vsi po fázích, osadníci nejsou potřeba. Dub se bere
  kácením – nejbližší stojící dospělý dub ke staveništi, který nepatří jiné stavbě a není
  posvátný (klády na hromadě se podle dřeviny nerozlišují); kácí se jako první část práce. Cena
  v sobě má kácení blízkého dubu jako cena obydlí (stavba 30 − 2 člověkodny + kácení podle
  vzdálenosti). Překážky na půdorysu se platí po kusech a dospělé stromy z nich dají klády.
  Rovinu modla nepotřebuje (rozhodnutí kontroléru – „kamkoli na louku“).
- **Na pole** smí modla i svatyně (Martin, 18. 10. 2026 – [fields.md](fields.md), Pole jako
  krajina): díly pod půdorysem se zmenší o průnik (pod 20 % políčka zmizí), překážky založených
  dílů stavba neplatí; u kurzoru oranžově „Pole se zmenší“.

### Svatyně (staví hráč – nejvyšší úroveň)

- Podle svatyně Peruna v Perynu u Novgorodu (Martin): kruhový okrsek ≈ **21 m** v průměru,
  obehnaný příkopem s **osmi výběžky**, v každém ohniště, uprostřed modla. Půdorys
  **30 × 30 m** na louce nebo v lese (les se vyklučí – Stavba v lese), rovný terén (≤ 1 m
  převýšení – návrh Clauda).
- Cena: **400 člověkodní a 3 dospělé duby** (návrh Clauda). Žádná odemykací podmínka kromě surovin
  (Martin – odemykání jen surovinami).
- Přidá **+25** štěstí; jedna svatyně na ves.
- Ve scéně z ohnišť občas stoupá dým (jako z obydlí).
- Implementace jako u modly (3 nejbližší dospělé duby); svatyně hotová i rozestavěná blokuje
  další – v nabídce staveb je pak zašedlá s důvodem „Ves už svatyni má.“
- **Opuštěná modla a svatyně chátrají** ([abandonment.md](abandonment.md), Martin 18. 10. 2026):
  ke které za rok nevedla žádná cesta, ta chátrá – modla padne za ≈ 20 let, svatyně za ≈ 30.
  Štěstí dává, dokud stojí; padlá modla leží jako zbytek, ze svatyně zbude zarostlý příkop.

## Co hráč vidí

- V horní liště ikona štěstí s číslem (tooltip „Štěstí“).
- V nabídce staveb **modla** a **svatyně** (název + cena v tooltipu).
- Posvátné duby a háje se objeví samy, když se kolem mýtí – jdou vybrat; panel výběru ukáže,
  kolik přidávají (ikona štěstí + číslo). Uschlý dub má v panelu portrét **posvátné souše**
  (ikona `sous` – uschlý dub s obětinami) se stářím, ve kterém uschl, a +1; padlá souš vybrat
  nejde.
- **Stáří posvátného dubu** (Martin 18. 10. 2026: „pokud označím posvátný dub, chtěl bych vidět
  jeho stáří“): panel výběru ukáže ikonu data s počtem let (popisek „Stáří (roky)“ jako u obydlí
  a sadu). Stáří plyne jen z dubu – z jeho velikosti (výška modelu × měřítko): k 1. 1. 500 má
  nejmenší posvátný dub (≈ 17,7 m, práh horní třetiny dubů) **150 let** a největší (≈ 26,5 m)
  **400 let**, mezi tím lineárně (návrh Clauda); k tomu herní roky od začátku světa do dneška
  hráče. Stejný dub má tedy stejné stáří v každé vsi a stárne s herním časem (kdo se dožije
  konce světa, má ≈ 1150–1400 let); uschlý dub ukáže stáří, ve kterém uschl. Rozpětí: 150 let ≈ mohutný dospělý solitérní dub (obvod ≈ 3 m), od 400 let
  je dub „starobylý“ (Woodland Trust, Ancient Tree Inventory – dub běžně žije ≈ 600 let,
  výjimečně 1000). U **háje** panel ukáže stáří jeho nejstaršího dubu (největší dospělý dub
  v okruhu 25 m od středu, stejný výpočet – rozhodnutí Clauda).
- Upozornění (fakt): „Vesničané ušetřili posvátný dub“ / „… dubový háj“, „Posvátný dub uschl“,
  „Posvátná souš padla“.
- **Vstup do modly a svatyně** (Martin, 19. 10. 2026: „každá budova by měla mít nějaký vchod, od
  kterého cesta povede“; podrobnosti návrh Clauda): pěšina k hotové modle a svatyni vede na její
  předek (+z modelu – tváře modly a obětiny), u modly na okraj půdorysu, u svatyně přes hrot
  okvětí na předku, kde je příkop nejužší (příkop nemá přerušení), za valem 13,5 m od středu.
  Návštěvy a oprava chodí vstupem, staveniště ze všech stran ([paths.md](paths.md) – Vchody).
- Ve scéně stojí místo uschlého dubu souš (o čtvrtinu nižší než dub v den uschnutí), padlá souš
  je padlý kmen přes místo dubu (modely dekorací 0 A.D.).
- **Svatby** (Martin, GitHub issue #2: „Svatebčané půjdou na některé z posvátných míst v okolí,
  kde budou oddáni.“ – [kinship.md](kinship.md), Svatba ve scéně): posvátná místa jsou místa
  svatebního obřadu – stojící navštěvovaná modla nebo svatyně, živý posvátný dub nebo háj do
  600 m od domu nevěsty, nejbližší nejčastěji. Ve svatyni při obřadu hoří ohniště u vstupu, na
  posvátném dubu visí jen při obřadu věnec a pentle. Jen zobrazení – štěstí ani chátrání se
  svatbou nemění (svatba není návštěva v síti pěšin).

## Navazuje

- Kněží a obřady, svátky v kalendáři (Kupadla, Koleda), oběti z úrody.
- Christianizace (od 9. století) – kostel místo svatyně.

## Rozhodnutí

| Rozhodnutí                                                                              | Kdo                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Štěstí obyvatel ovlivňuje produktivitu práce; zvyšují ho sakrální stavby                | Martin                                    |
| Snižuje ho hlad, úmrtí, přeplněnost a dřina                                             | návrh Clauda, Martin potvrdil             |
| Úmrtí staršího ubere méně (24. 10. 2026); vzorec 5 − 0,06 × věk, nejméně 0,5            | Martin; čísla návrh Clauda                |
| Štěstí 0 → práce × 0,8, 50 → × 1, 100 → × 1,1                                           | návrh Clauda, Martin potvrdil (doladí se) |
| Velké solitérní duby a dubové háje vesničané při mýcení nechají; stanou se stavbou      | Martin                                    |
| Dřevěná modla; svatyně podle Perynu jako nejvyšší úroveň                                | Martin                                    |
| Čísla (výchozí 50, posun 10 %/měsíc, příspěvky a stropy, ceny, rozměry, definice háje)  | návrh Clauda                              |
| Posvátný dub: velikost = výška modelu × měřítko, mimo les = ≤ 5 stromů do 15 m          | rozhodnutí kontroléru (implementace)      |
| Háj: k 6 dubům v 25 m i převaha dubů ≥ 65 % (les je z třetiny dubový)                   | rozhodnutí kontroléru (implementace)      |
| Den dřiny = ves dnešním tempem nestihne běžící polní práce do konce jejich oken         | rozhodnutí kontroléru (implementace)      |
| Hřbitov na čtverec s posvátným dubem nesmí (pevná mřížka hrobů)                         | Martin potvrdil 18. 10. 2026              |
| Ušetření dubu a háje se zapíše už při zahájení stavby (při vytyčení)                    | Martin potvrdil 18. 10. 2026              |
| Modla nepotřebuje rovinu                                                                | rozhodnutí kontroléru (implementace)      |
| Posvátné duby se postupně zvětší – o 30 % za 60 let od ušetření (jen vzhled)            | Martin; čísla návrh Clauda                |
| Panel posvátného dubu ukáže jeho stáří; 150–400 let k roku 500 podle velikosti          | Martin; rozpětí návrh Clauda              |
| Panel háje ukáže stáří jeho nejstaršího dubu                                            | návrh Clauda                              |
| Posvátný dub přidá štěstí podle stáří – nejmladší (150 let) 1, nejstarší (2000 let) 10  | Martin                                    |
| Mezi tím podle logaritmu stáří na celé body; počítají se 3 duby, které přidávají nejvíc | návrh Clauda                              |
| Stropy 3 duby a +40 dohromady zůstávají                                                 | návrh Clauda (Martin může zvednout)       |
| Posvátné duby stářím usychají, variabilně, nejstarší se mohou dožít až 2000 let         | Martin                                    |
| Délka života 800 + 1200 × Beta(2, 4) let (≈ 81 % 800–1400), uschne v létě               | návrh Clauda                              |
| Posvátná souš +1, stojí 50–100 let, pak padne – padlý kmen už není posvátný dub         | návrh Clauda                              |
| Místo padlé souše zůstává chráněné (ochrana jen z vrstvy překážek, žádný nový stav)     | rozhodnutí Clauda                         |
| Modla a svatyně smí na pole – díly se zmenší o průnik půdorysu                          | Martin (18. 10. 2026)                     |
