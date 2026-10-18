# Štěstí obyvatel a posvátná místa

Stav: schváleno 18. 10. 2026 (Martin: „Ano, takhle je to dobré“), implementováno 18. 10. 2026
(jádro `domain/village/happiness.ts` a `sacred.ts`, čísla v `rules.ts`). Rozhodnutí z implementace
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
- **Cílová hodnota** = 50 + posvátná místa + dobré zásoby + ovoce − hlad − úmrtí − přeplněnost − dřina,
  oříznutá na 0–100. Skutečné štěstí se k cíli **posouvá pomalu** – o 10 % rozdílu za měsíc (návrh
  Clauda), takže jedna špatná zima ves nezlomí a jedna socha ji hned nespasí.
- **Co ubírá** (návrh Clauda, doladí se hraním):
  - **hlad:** nasycení pod 0,9 ubere až **40** (lineárně k nulovému nasycení),
  - **úmrtí** za poslední rok: dospělý −3, dítě −5, dohromady nejvýš **−20**,
  - **přeplněnost:** podíl lidí v přeplněných domácnostech × **15**,
  - **dřina:** podíl dní za posledních 60, kdy ves nestihla práci v období (polní práce se
    nedodělala), × **15**. Den dřiny (rozhodnutí kontroléru): ves by polní práce, které právě
    běží, dnešním tempem nedodělala do konce jejich oken – úlohy se řadí podle konce okna
    a zbývající práce se sčítá (co končí dřív, musí být hotové dřív). Plná práce ve špičce, která
    se stihne, dřinou není.
- **Co přidává:** posvátná místa (níže), dobré zásoby (zásoby na víc než rok) **+5**, ovoce
  **+5** – dokud lidé jedí ovoce, je sladké (Martin – [strava](diet.md), od 18. 10. 2026).
- **Hlad** počítá s nasycením se stravou (energie × pestrost – [strava](diet.md)): ves jen
  s obilím je nasycená na 80 % a ubere si tak ≈ 4 body.
- **Účinek na práci** (Martin – „nechme to tak, doladíme později“): veškerá práce vsi se násobí
  - štěstí 0 → **× 0,8**, štěstí 50 → **× 1**, štěstí 100 → **× 1,1** (mezi tím lineárně).
  - Násobí se s mezemi produktivity od řemeslníků ([řemesla](crafts.md) – zatím nejsou).
- Simulace vede štěstí den po dni (posun o denní podíl tak, aby za měsíc ubylo 10 % rozdílu);
  úmrtí posledního roku a dny dřiny si pamatuje ve stavu vsi. Úmrtí dospělého i staršího ubere
  3, dítěte 5. Ves uložená před zavedením štěstí začne na 50.

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
  Přidá **+5** štěstí, započítají se nejvýš **3** duby.
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
  udusaný kruh. Staví se jako obydlí – půdorys **4 × 4 m** kamkoli na louku (návrh Clauda).
- Cena: **30 člověkodní a 1 dospělý dub** (kmen na modlu – dřevo podle [lesa](forest.md)).
- Přidá **+8** štěstí, započítají se nejvýš **2** modly.
- Implementace: stavba ze společné práce vsi po fázích, osadníci nejsou potřeba. Dub se bere
  kácením – nejbližší stojící dospělý dub ke staveništi, který nepatří jiné stavbě a není
  posvátný (klády na hromadě se podle dřeviny nerozlišují); kácí se jako první část práce. Cena
  v sobě má kácení blízkého dubu jako cena obydlí (stavba 30 − 2 člověkodny + kácení podle
  vzdálenosti). Překážky na půdorysu se platí po kusech a dospělé stromy z nich dají klády.
  Rovinu modla nepotřebuje (rozhodnutí kontroléru – „kamkoli na louku“).

### Svatyně (staví hráč – nejvyšší úroveň)

- Podle svatyně Peruna v Perynu u Novgorodu (Martin): kruhový okrsek ≈ **21 m** v průměru,
  obehnaný příkopem s **osmi výběžky**, v každém ohniště, uprostřed modla. Půdorys
  **30 × 30 m** na louce, rovný terén (≤ 1 m převýšení – návrh Clauda).
- Cena: **400 člověkodní a 3 dospělé duby** (návrh Clauda). Žádná odemykací podmínka kromě surovin
  (Martin – odemykání jen surovinami).
- Přidá **+25** štěstí; jedna svatyně na ves.
- Ve scéně z ohnišť občas stoupá dým (jako z obydlí).
- Implementace jako u modly (3 nejbližší dospělé duby); svatyně hotová i rozestavěná blokuje
  další – v nabídce staveb je pak zašedlá s důvodem „Ves už svatyni má.“

## Co hráč vidí

- V horní liště ikona štěstí s číslem (tooltip „Štěstí“).
- V nabídce staveb **modla** a **svatyně** (název + cena v tooltipu).
- Posvátné duby a háje se objeví samy, když se kolem mýtí – jdou vybrat; panel výběru ukáže,
  kolik přidávají (ikona štěstí + číslo).
- **Stáří posvátného dubu** (Martin 18. 10. 2026: „pokud označím posvátný dub, chtěl bych vidět
  jeho stáří“): panel výběru ukáže ikonu data s počtem let (popisek „Stáří (roky)“ jako u obydlí
  a sadu). Stáří plyne jen z dubu – z jeho velikosti (výška modelu × měřítko): k 1. 1. 500 má
  nejmenší posvátný dub (≈ 17,7 m, práh horní třetiny dubů) **150 let** a největší (≈ 26,5 m)
  **400 let**, mezi tím lineárně (návrh Clauda); k tomu herní roky od začátku světa do dneška
  hráče. Stejný dub má tedy stejné stáří v každé vsi a stárne s herním časem (na konci světa
  ≈ 1150–1400 let). Rozpětí: 150 let ≈ mohutný dospělý solitérní dub (obvod ≈ 3 m), od 400 let
  je dub „starobylý“ (Woodland Trust, Ancient Tree Inventory – dub běžně žije ≈ 600 let,
  výjimečně 1000). U **háje** panel ukáže stáří jeho nejstaršího dubu (největší dospělý dub
  v okruhu 25 m od středu, stejný výpočet – rozhodnutí Clauda).
- Upozornění (fakt): „Vesničané ušetřili posvátný dub“ / „… dubový háj“.

## Navazuje

- Kněží a obřady, svátky v kalendáři (Kupadla, Koleda), oběti z úrody.
- Christianizace (od 9. století) – kostel místo svatyně.

## Rozhodnutí

| Rozhodnutí                                                                             | Kdo                                       |
| -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Štěstí obyvatel ovlivňuje produktivitu práce; zvyšují ho sakrální stavby               | Martin                                    |
| Snižuje ho hlad, úmrtí, přeplněnost a dřina                                            | návrh Clauda, Martin potvrdil             |
| Štěstí 0 → práce × 0,8, 50 → × 1, 100 → × 1,1                                          | návrh Clauda, Martin potvrdil (doladí se) |
| Velké solitérní duby a dubové háje vesničané při mýcení nechají; stanou se stavbou     | Martin                                    |
| Dřevěná modla; svatyně podle Perynu jako nejvyšší úroveň                               | Martin                                    |
| Čísla (výchozí 50, posun 10 %/měsíc, příspěvky a stropy, ceny, rozměry, definice háje) | návrh Clauda                              |
| Posvátný dub: velikost = výška modelu × měřítko, mimo les = ≤ 5 stromů do 15 m         | rozhodnutí kontroléru (implementace)      |
| Háj: k 6 dubům v 25 m i převaha dubů ≥ 65 % (les je z třetiny dubový)                  | rozhodnutí kontroléru (implementace)      |
| Den dřiny = ves dnešním tempem nestihne běžící polní práce do konce jejich oken        | rozhodnutí kontroléru (implementace)      |
| Hřbitov na čtverec s posvátným dubem nesmí (pevná mřížka hrobů)                        | Martin potvrdil 18. 10. 2026              |
| Ušetření dubu a háje se zapíše už při zahájení stavby (při vytyčení)                   | Martin potvrdil 18. 10. 2026              |
| Modla nepotřebuje rovinu                                                               | rozhodnutí kontroléru (implementace)      |
| Posvátné duby se postupně zvětší – o 30 % za 60 let od ušetření (jen vzhled)           | Martin; čísla návrh Clauda                |
| Panel posvátného dubu ukáže jeho stáří; 150–400 let k roku 500 podle velikosti         | Martin; rozpětí návrh Clauda              |
| Panel háje ukáže stáří jeho nejstaršího dubu                                           | návrh Clauda                              |
