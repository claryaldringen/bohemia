# Pevné cesty – stromy podél nich a vylepšení

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“). **Fáze 1 hotová** (18. 10. 2026 –
pevné cesty a stromy u nich, viz [Fáze 1 – jak je postavená](#fáze-1--jak-je-postavená)),
**fáze 2 hotová** (výběr, vylepšení a rychlejší chůze – [Fáze 2](#fáze-2--jak-je-postavená)),
**fáze 3 hotová** (jabloně podél cesty – [Fáze 3](#fáze-3--jak-je-postavená)). **Cesta je cesta**
(19. 10. 2026 – po pevné cestě bez ohledu na povrch, cesta s jabloněmi nezaroste –
[Cesta je cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Navazuje na
[vyšlapané pěšiny](paths.md) (jen vzhled) a nahrazuje v nich stromy podél pěšin.

**Od 22. 10. 2026 platí [Nový systém cest](#nový-systém-cest-22-10-2026)** (Martin, issue #6
a #3; převod starých vsí Martin 23. 10. 2026). Části níž označené „nahrazeno“ jsou historie.

## Nový systém cest (22. 10. 2026)

Pravidla 1–11 (Martin 22. 10. 2026) jsou doslova v [paths.md – Pravidla](paths.md#pravidla-martin-22-10-2026).
Kudy se chodí, trasy, vyšlapanost, vznik cest, síť (kotvy, pahýly), křižovatky, cesty k vchodům
a převod: [paths.md](paths.md). Tady druhy cest, zarůstání podle druhů, úprava s hatí a lávkou,
vozová cesta po staré cestě a lidé při práci na cestě. Čísla jsou návrh Clauda (Martin 22. 10. 2026: čísla zvolí Claude sám). Plán: [2026-10-23-roads-v2.md](../superpowers/plans/2026-10-23-roads-v2.md).

### Druhy cest a rychlosti (pravidlo 5)

Martin (22. 10. 2026): „pro chodce jsou vyšlapaná a vyježděná cesta stejné a stejně tak upravená
a vozová; upravená cesta zrychluje i vozy; stromy a jabloně u cesty zrychlují všechny druhy o svůj
koeficient.“ Dnešní čísla (Martin 19. a 20. 10. 2026) to splňují a zůstávají:

| Druh                       | Pěšky                 | Vůz                                | Kdo ji založí                               |
| -------------------------- | --------------------- | ---------------------------------- | ------------------------------------------- |
| vyšlapaná                  | 1,5                   | 1,3                                | lidé chozením (paths.md – Vyšlapanost)      |
| vyježděná                  | 1,5                   | 1,6                                | vyšlapaná, kudy jezdí vozy (1. 11.)         |
| upravená (s hatí a lávkou) | 1,7, i přes mokřinu   | 1,8, hať i přes mokřinu; brod 0,33 | hráč – „Upravit cestu“                      |
| vozová                     | 1,7, i přes mokřinu   | 2,2, i přes mokřinu; brod 0,33     | hráč – „Upravit pro vozy“ na upravené cestě |
| zemská stezka              | beze změny (trade.md) | beze změny                         | hráč (beze změny)                           |

- **Stromy +0,03, jabloně +0,05** × olemovaný podíl úseku – pro všechny druhy, pěšky i vozem
  ([Stromy u cesty zrychlí chůzi](#stromy-u-cesty-zrychlí-chůzi)). Nově i na hati a vozové cestě
  přes mokřinu (zpevněný povrch – návrh Clauda); v mokřině bez zpevnění a v brodu dál ne.
- Lávka je jen pro pěší (Martin 22. 10. 2026) – vůz jede brodem.

### Zarůstání podle druhů (pravidlo 4)

Martin (22. 10. 2026): „cesta, po které se nechodí, postupně zaroste a zmizí. Platí to pro každou
cestu, i upravenou a vozovou, jen pro ty pomaleji.“ Návrh Clauda:

| Druh                   | Udrží ji (cest za den) | Bez provozu zmizí za | Plný stav (cesto-dny) |
| ---------------------- | ---------------------- | -------------------- | --------------------- |
| vyšlapaná, vyježděná   | 1                      | 5 let                | 1 826                 |
| upravená (hať a lávka) | 0,5                    | 15 let               | 2 739                 |
| vozová                 | 0,25                   | 30 let               | 2 739                 |
| zemská stezka          | –                      | nezarůstá            | –                     |

- **Stav kusu:** osa úseku po kusech ≈ 25 m (`ROADS.pieceM` jako dřív); stav kusu se mění
  o (provoz kusu − udržovací práh) za den, mezi 0 a plným stavem. Provoz kusu je medián provozu
  tras v bodech osy po 3 m (jako dřív – z provozního pole tras, paths.md – Vyšlapanost), jízda vozu
  za 2 cesty. Počítá se po intervalech mezi
  změnami tras a 1. dnem v měsíci (celá čísla – deterministicky jako vyšlapanost). Nový úsek
  a dokončené vylepšení mají plný stav.
- **Kus na nule zmizí** – zbytek úseku zůstane se starým id (jako dřív `cutOvergrown`), kronika
  „Nepoužívaná cesta zarostla.“. Ve scéně cesta pod polovinou stavu bledne (krytí úměrně), takže
  zarůstání je vidět postupně.
- **Opuštěná cesta:** vede-li po celém úseku žádná trasa celý měsíc, úsek je opuštěný
  (`Road.abandoned`) – vypadne ze sítě (není ramenem křižovatky ani částí cesty hráče, nejde vybrat
  ani vylepšit), dál bledne a zmizí. Vrátí-li se na něj trasa, ožije a úklid ho napojí.
- **Kus pod stavbou:** postaví-li hráč hotovou stavbu přes cestu (pozemek, ohrada, hřbitov…), kus
  pod ní je hned opuštěný; lidé i vozy jdou objížďkou a ta se vyšlape v novou cestu napojenou na
  zbytky staré (paths.md – Stavba přes cestu; Vlkov 23. 10. 2026 – vůz pro vodu).
  Opuštěný kus zůstane opuštěný i při nestejném zániku jeho částí a nedrží ho ani vchod; po zbourání
  stavby se neobnovuje (návrh Clauda – obnova by vracela cestu do sítě, kterou už obešla
  objížďka; kus jen zaroste podle druhu).
- **Nezarůstá:** cesta, která se vylepšuje; cesta k vchodu stavby, ke které se chodí (paths.md –
  Vchody; odvozeno z konce cesty ve vchodu a návštěv stavby, bez zvláštního pole); zemská stezka.
- **Jabloně už cestu nedrží** (výjimka – návrh Clauda 19. 10. 2026 – **zrušena** 22. 10. 2026
  pravidlem 4): péče a sklizeň jabloní jsou trasy k cestě, takže kus, kde se jabloně sklízejí, se
  udrží provozem. Jabloně a stromy u zarostlé cesty stojí dál (jako dřív).
- **Úvoz a násep** zůstanou v krajině i po zarostlé vozové cestě (jako dřív).
- **Důvod čísel:** vyšlapaná 5 let drží dřívější pravidlo; upravená cesta je srovnaná a rozšířená,
  drží tvar déle (15 let); vozová má koleje zpevněné kamenem a štěrkem (30 let ≈ generace a víc).
  Udržovací práh 1 cesta denně odpovídá dorůstání trávy (paths.md – Vyšlapanost); odolnější
  povrch stačí udržet polovinou a čtvrtinou provozu.

### Úprava cesty s hatí a lávkou (pravidla 7 a 8)

- **Jedno tlačítko „Upravit cestu“** (ikona `cesta-upravena`) pro celou cestu hráče: vyšlapané
  a vyježděné úseky se upraví a **kde cesta vede mokřinou, položí se hať, přes brod lávka** –
  v jedné stavbě (Martin 22. 10. 2026: „Hať a lávka se postaví samy jako součást úpravy cesty“).
  Cena je součet dnešních cen: 15 čd na 100 m + hať 1 strom a 2 čd na 2 m mokřiny + lávka 4 stromy
  a 15 čd na brod; dřevo jako dřív (klády z hromady, pak nejbližší stromy). Stavba jde po cestě úsek
  po úseku, hať a lávku staví, když k nim čelo práce dojde.
- **Stupeň `causeway` zmizí** – upravená cesta má hať a lávku všude, kde je potřeba. Starší
  upravená cesta bez nich dostane převodem příznak `Road.unbridged` a „Upravit cestu“ u ní postaví
  jen hať a lávku.
- **Vozová cesta** staví hať přes mokřinu (jako dřív zpevnění) a nově i lávku pro pěší vedle
  brodu (15 čd na brod v ceně úseku; vůz jede dál brodem, pěší lávkou bez zdržení). _Od 24. 10. 2026
  se staví jen na už upravené cestě (hať a lávka stojí), takže je neúčtuje –
  [Postupná úprava](#postupná-úprava-a-serpentiny-24-10-2026)._
- **Hráč cesty nezakládá ani neruší** (pravidla 3 a 8) – vylepšuje (upravená, vozová), sází
  jabloně a zakládá zemskou stezku (beze změny).
- **Zrušení rozdělané úpravy** (návrh Clauda podle zrušení staveb – Martin 23. 10. 2026: „Potřebuju
  mít možnost stavbu zrušit.“, jen rozestavěné, nespotřebované suroviny se vrátí –
  [population.md](population.md)): rozdělanou úpravu cesty i vozovou cestu ve stavbě jde zrušit.
  Hotové úseky zůstanou vylepšené, rozdělaný úsek a zbytek cesty zůstanou v dosavadním druhu, klády
  a skácené stromy se vrátí na hromadu bez zabudované části (jako u staveb), zemní práce hotových
  úseků vozové cesty zůstanou v krajině jako úvoz a násep (rozdělaný úsek se vrací do původního
  terénu). Cesta tím nezmizí – rušit
  cesty hráč dál nemůže.

### Vozová cesta po staré cestě (pravidlo 6)

Martin (22. 10. 2026): „Vozová cesta: vznikne ze staré pěší cesty a vede po ní. Narovná se jen
tam, kde pěší cesta kličkovala do svahu, pokud to jde, a obejitý kus staré cesty zaroste. Náspy
a úvozy musí být výrazně vidět.“ Nahrazuje „Co nejpříměji“ a „Stará cesta pro pěší zůstane“
(Martin 20. 10. 2026 – [Vozová cesta](#vozová-cesta)). Návrh Clauda:

- **Trasa = osa staré cesty hráče** (řetěz úseků mezi křižovatkami a konci). Profil po ní jako
  dřív – sklon nejvýš 6 %, úvoz a násep nejvýš 3 m, objemy, ceny a stavba po ≈ 60 m od vsi ven
  beze změny (`wagonProfile`, `wagonEarthworks`). Ohrady a hřbitov má vozová cesta jako vozy
  (`fencedCells` – plot 1,5 m uvnitř čtverce), takže vede i uličkou 3 m mezi ohradami (Martin 23. 10. 2026 – [oxen.md](oxen.md), Plot ohrady podle délky); pevnou cestu vůz projede i šikmo
  lesem nebo polem (pás `ROAD_BAND_CELLS`).
- **Narovnání jen tam, kde pěší cesta kličkovala do svahu:** kličkující kus je kus staré osy
  nejvýš 120 m, kde je osa aspoň 1,3× delší než tětiva mezi jeho konci a převýšení na něm je aspoň
  3 m (`WAGON_STRAIGHTEN`). Zkusí se nahradit **tětivou** s profilem jako jinde (sklon ≤ 6 %, úvoz
  a násep ≤ 3 m, nic neprůchodného); přijme se, když stojí méně práce než úprava staré osy úvozem
  a náspem, nebo když stará osa nejde vůbec („pokud to jde“). Jinde se osa nehýbe. Nejde-li to ani
  tak, úprava se nenabídne – důvod v popisku („Cesta je pro vůz moc prudká.“). Zjednodušeno po
  recenzi plánu 23. 10. 2026: dřív místní hledání `findWagonRoute` v okně ± 60 m – tětiva je
  přímější, jednodušší a bez hledání. Konce tětivy leží na staré ose a pláň tam stojí v terénu, takže
  tětiva musí mezi nimi vystoupat po sklonu ≤ 6 % (jinak se kus nenarovná a osa zůstane). Kandidátů
  je nejvýš 8 – zkouší se od nejvíc ušetřené délky, kusy se nepřekrývají (`straightenStretches`).
- **Cesta je pro vůz moc prudká – výjimka z pravidla „blokuje jen cena předem“** (návrh Clauda,
  Úloha 11b, recenze 11a): důvody `WAGON_STEEP`, `WAGON_BLOCKED` a `WAGON_SACRED` nejsou herní
  podmínka, ale geometrická nemožnost – profil nevyjde, vůz neprojede, dub se kácet nesmí. Úprava se
  proto nenabídne, hráči se nic nezakazuje cenou.
- **Obejitý kus staré cesty** se při dostavění úseku (`wagonRoadsDay`) oddělí jako opuštěná
  vyšlapaná cesta (`Road.abandoned`; kusy drží `RoadEarthwork.bypassed`) – mimo síť, žádná křižovatka, zaroste za 5 let. Kus staré cesty pod vozovou
  zmizí hned (vozová ho nahradí, jak dřív `absorbParallelRoads`). Souběžné cesty tak nevzniknou.
- **Náspy a úvozy výrazně vidět:** svahy holá hlína, která zarůstá pomalu – za 15 let jen řídkou
  trávou, nikdy úplně (dřív za 6 let plnou trávou); hrana úvozu světlý lem, pata náspu tmavý lem
  (obtisk ≈ 0,6 m), na svazích výkopu drobné kameny, sníh na svazích tenčí. Výška terénu se
  nezveličuje – je to herní terén. Kritérium: na herní kameře ve Vlkově jsou úvoz 0,8 m a násep
  1 m (cesta 372) poznat bez výběru cesty.
- **Kudy vůz po staré cestě neprojede** (návrh Clauda, Úloha 11a): v bodech osy po 2 m (kromě
  9 m u konců – konec bývá u vchodu stavby) nesmí být plot ohrady či hřbitova, sad, voda mimo
  brod, sráz ani balvan, ani stavba blíž než půl šířky vozu (1,25 m + 0,4 m – jako vozová síť;
  měří se přesně v bodě, ne po čtvercích mřížky). Samotný strom nebo keř u staré cesty ji nezavře
  – stavba ho vykácí. Posvátný strom zakáže úpravu, jen když stojí na pláni nebo pod zemními
  pracemi. Jinak důvod v popisku „Vůz po této cestě neprojede – překáží stavba, plot nebo voda.“
- **Lávka u vozové cesty** (návrh Clauda, Úloha 11a; _od 24. 10. 2026 neplatí, lávka už stojí na
  upravené cestě – [Postupná úprava](#postupná-úprava-a-serpentiny-24-10-2026)_): stojí stejně jako lávka u upravené cesty –
  4 stromy a 15 čd (táž stavba, Martin 22. 10. 2026: „Hať a lávka se postaví samy jako součást
  úpravy cesty“). Dřevo je v ceně stavby (Úloha 11b): klády z hromady, zbytek nejbližší stromy, kácení jde před
  zemními pracemi; chybí-li dřevo, důvod „Na lávku chybí dřevo.“ (`WAGON_NO_WOOD`).
- **Vlkov:** hotové vozové cesty zůstanou se svou osou; staré souběžné cesty vedle nich (voda)
  pohltí převod (paths.md – Převod). Měření 24. 10. 2026 (Úloha 11a): cesta 372 (1 216 m, 1 466 čd, úvoz 1,8 m, násep 1,5 m) se po staré ose nabídne i bez narovnání,
  tětiva ji nemění (Úloha 11b, měřeno 24. 10. 2026).

### Postupná úprava a serpentiny (24. 10. 2026)

Martin (24. 10. 2026): „Úpravy cest by měly jít postupně. Tj. napřed upravím vyšlapanou nebo
vyježděnou cestu a tím se mi odemkne úprava pro vozy. Zemská stezka na sever nejde upravit pro vozy
s tím, že je pro vůz moc prudká, ale přesně tohle by ta úprava cesty pro vozy vyřešit.“ Návrh
Clauda, schválený Martinem 24. 10. 2026 („Návrhy k cestám schvaluji“):

- **Postupně:** „Upravit pro vozy“ se odemkne, až je **celý řetěz upravený** včetně hatě a lávky
  (žádný úsek není vyšlapaný ani upravený bez hatě a lávky – `unbridged`). Do té doby je tlačítko
  šedé s důvodem „Napřed uprav cestu.“ (`WAGON_FIRST`); server to kontroluje sám (`wagonChainStatus`,
  tedy i plán a zahájení stavby). Rozestavěná úprava se za hotovou nepočítá. Zemská stezka je upravená,
  ta projde. Starší vsi: hotové nebo rozestavěné vozové cesty se nemění.
- **Cena:** vozová cesta na upravené cestě neúčtuje lávku znovu u brodů, které stará upravená cesta
  měla (lávka tam stojí). **Brod, který stará osa neměla** (narovnaná tětiva, serpentina), dostane
  lávku jako dřív: 4 stromy a 15 čd na brod (návrh Clauda; brod do 8 m od brodu staré cesty je týž).
  Zpevnění je jen doplatek 0,3 − 0,15 = **0,15 čd/m** (zpevnění už je v ceně úpravy; číslo
  `WAGON_ROAD.pavingPerM` se odvozuje z `ROAD_UPGRADES.improvedManDaysPer100M`).
- **Sklon nejvýš 6 % na každém kroku:** výšky profilu se počítají na milimetry a mez kroku se
  zaokrouhluje dolů, takže žádný krok (ani krátký u rohu osy) mez nepřekročí; dřív zaokrouhlení
  nahoru dávalo na krátkých krocích 6,3–8 % (recenze 24. 10. 2026). Zbytek staré cesty zanikne, jen
  když je aspoň 80 % jeho délky souběžných (do 2 m) s obejitým kusem či hotovou částí; odbočka,
  cesta do vchodu nebo krátký pahýl začínající u hotové části zůstane.
- **Serpentiny (pravidlo):** kde profil po staré ose nevyjde nebo pláň a zemní práce zasáhnou
  posvátný strom, hledá se v oknech **±60, ±120 a ±200 m** po staré ose kolem místa selhání (do stran
  stejně daleko) lokální trasa (`findWagonRoute`), vloží se do osy a spočítá se celý plán; vezme se
  **nejlevnější hotový plán** (práce, pak délka, pak pořadí oken). Když žádné okno nedá hotový plán,
  ale některé posune selhání dál, pokračuje se od něj – nejvýš **4 místa** selhání za sebou
  (`WAGON_DETOUR`, návrh Clauda). Obejitý kus staré osy zaroste (`bypassed`), lávka u nového brodu
  na objížďce se účtuje (4 stromy, 15 čd). `WAGON_STEEP` zůstane jen tehdy, když nevyjde žádné okno.
  Hledání v okně má mez **250 000 štítků** (paměť v prohlížeči ≈ 13 MB) – svah, který by chtěl
  víc serpentin, než se do ní vejde, zůstane moc prudký. Okna se počítají z celočíselných indexů osy
  a při shodě rozhoduje pevné pořadí (determinismus server × prohlížeč), plán se v prohlížeči drží
  v mezipaměti. Cesta, které profil vyjde, se nemění.
- **Vlkov, zemská stezka na sever (cesta 547, 24. 10. 2026):** dřív `WAGON_SACRED`; teď objížďka
  háje – 1 091 m (stará 1 056 m), sklon nejvýš 6,0 %, úvoz i násep 0,9 m, 667 čd, 14 stromů
  (2 pokácené), vůz 17,5 min. Plán ≈ 0,3–0,7 s. Rozbor (± 60 m dvakrát) dával 1 122 m a 976 čd.
- **Hláška:** když profil selže do 10 m od posvátného stromu (mez zemních prací je tam malá) a žádné
  okno nevyjde, důvod je posvátný strom (`WAGON_SACRED`), ne „moc prudká“.
- **Paměť plánu:** výšky pláně se počítají jen v pásu výšek dosažitelných od začátku i ke konci
  a z dynamického programování zůstávají jen rodiče (Int16) – u 547 ≈ 6 MB místo ≈ 38 MB.

### Lidé při práci na cestě (Martin 22. 10. 2026, #3)

Martin: „Pokud vesničané upravují cestu, chci je na té cestě vidět pracovat.“ Rozbor Clauda: postavy
úpravy (`roadWork`) hledaly úsek podle id cíle práce a stály u něj, i když čelo práce bylo na jiném
úseku cesty hráče; vozová cesta (`{ kind: 'wagon' }`) postavy neměla vůbec. Návrh Clauda:

- **Úprava:** lidé u čela práce celé cesty (`roadWorkFront`) – motyky po okrajích širšího pásu
  před čelem, dusání za ním; u hatě nosí a kladou kmeny, u lávky zatloukají kůly.
- **Vozová cesta:** u čela (`wagonWorkTarget`) kopáči v úvozu, nosiči s koši od úvozu k náspu,
  dusání na náspu, kladení kamene do kolejí; počet podle dnešní práce (aspoň jeden jako u staveb).
- Postavy na cestu dojdou po trase (paths.md – Jedno rozhodnutí).

### Rozhodnutí nového systému

| Rozhodnutí                                                                                    | Kdo          |
| --------------------------------------------------------------------------------------------- | ------------ |
| Pravidla 1–11, lidé při práci na cestě, přes ohrady se nechodí                                | Martin       |
| Převod starých vsí jednou a idempotentně                                                      | Martin       |
| Rychlosti druhů beze změny; stromy přidají i na hati a vozové cestě přes mokřinu              | návrh Clauda |
| Zarůstání: udržení 1 / 0,5 / 0,25 cesty denně, bez provozu 5 / 15 / 30 let; stav po kusech    | návrh Clauda |
| Opuštěná cesta mimo síť; jabloně cestu nedrží (provoz u jabloní ano)                          | návrh Clauda |
| „Upravit cestu“ = úprava + hať + lávka, součet cen; `causeway` → upravená, `unbridged`        | návrh Clauda |
| Vozová cesta po staré ose, kličku do svahu narovná tětivou (1,3×, 3 m, 120 m), je-li levnější | návrh Clauda |
| Vozová cesta vede i uličkou mezi ohradami (`fencedCells` jako vozy)                           | návrh Clauda |
| Kus cesty pod hotovou stavbou hned opuštěný, objížďka se vyšlape                              | návrh Clauda |
| Rozdělanou úpravu a vozovou cestu jde zrušit – hotové úseky zůstanou, dřevo se vrátí          | návrh Clauda |
| Svahy úvozů a náspů 15 let řídká tráva, lemy hran, kameny; výška se nezveličuje               | návrh Clauda |
| Postavy u čela práce celé cesty; vozová cesta s kopáči, nosiči a dusáním                      | návrh Clauda |
| Serpentiny: okna ±60/120/200 m, nejvýš 4 místa selhání, mez hledání 250 000 štítků            | návrh Clauda |

## Proč

Stromy podél pěšin dnes přeskakují: rozmisťují se znovu při každém přepočtu denní sítě pěšin,
která se mění s prací dne (rozbor 18. 10. 2026). Martin: stromy mají záviset na **pomalé
složce**, růst **postupně – napřed jako keř** – a kde jednou vyrostou, **stojí, dokud samy
neodumřou**. Kde vznikne taková pevná cesta, **hráč ji vybere kurzorem a vylepší** (Martin).
Cesta se tím stává herní věcí: pamatuje si, kudy vede, a zkracuje lidem chůzi.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** pevná cesta vzniká sama z dlouhodobého provozu a nehýbe se; denní pěšiny se k ní
  stahují.
- **Cíl:** stromy u pevné cesty jsou herní data – vyrostou z keře, stojí na místě a odumřou
  stářím (Martin).
- **Cíl:** hráč pevnou cestu vybere a vylepší ve **třech stupních** – vyšlapaná → upravená →
  hať a lávka (Martin) – a **nezávisle** na nich podél ní **vysadí jabloně** (Martin).
- **Cíl:** vylepšená cesta **zrychlí chůzi** – vzdálená pole, les a sady stojí méně práce
  (Martin).
- **Ne-cíl (teď):** vozy a tažná zvířata na cestách, obchod, cesty mezi vsemi a mapami (přijde
  s [válkou](war.md) a světem), mosty pro vozy, údržba cest, mýto.
- **Anti-cíl:** cesta nebo strom, které se pohnou samy od sebe; hráč, který musí cesty kreslit
  (cesty vznikají chozením, hráč je jen vylepšuje). Od 22. 10. 2026 se osa smí ohnout do vchodu
  křižovatky a vozová cesta se v prudkém kusu narovná ([paths.md](paths.md) – Křižovatky,
  [Vozová cesta po staré cestě](#vozová-cesta-po-staré-cestě-pravidlo-6)).

## Dvě vrstvy cest

**Nahrazeno 22. 10. 2026** – pěšiny dne a roční síť nahradily uložené trasy a vyšlapanost
([paths.md](paths.md)), zarůstání stav kusů ([Nový systém cest](#nový-systém-cest-22-10-2026)).
Text níž je historie.

- **Pěšiny dne** ([paths.md](paths.md)) zůstávají jen vzhled – vedou tam, kam ves dnes chodí,
  a mění se s prací. Nově jdou raději po pevné cestě (sleva jako po silné pěšině), takže se
  k ní stahují. Stromy podél nich zmizí – stromy mají jen pevné cesty.
- **Pevné cesty** počítá a ukládá simulace vsi (server):
  - **Jednou za rok** (1. 11., po sklizni jablek – návrh Clauda) spočítá síť z **celoroční
    práce** (člověkodny za rok po místech, voda, dřevo, sousedé – průměr na den), ne z dnešní.
    Výpočet je stejný jako u pěšin dne, jen s ročním provozem.
  - Úsek, kterým se **dva roky po sobě** chodí aspoň **3× denně** (roční průměr – zhruba síla
    0,55 dnešních pěšin), se stane **pevnou cestou** (návrh Clauda). Uloží se jeho osa
    a od té doby se nehýbe. Nová trasa, která vede blízko pevné cesty, se k ní přimkne (sleva
    za pevnou cestu), takže se síť jen rozrůstá, nepřekresluje.
  - Pevná cesta je **úsek mezi rozcestími a konci** – po ní se vybírá a vylepšuje. Kde se
    potkávají jen dva úseky (falešné rozcestí – odbočka zarostla, nová cesta navázala na konec
    jiné), spojí se do jednoho (Martin, 18. 10. 2026 – viz [Úseky a rozcestí](#úseky-a-rozcestí)).
    Rozcestí je ve scéně udusaný plácek – nejvyšlapanější místo cesty.
  - **Zarůstání:** každá cesta bez provozu postupně zaroste a zmizí, podle druhu (vyšlapaná
    5, upravená 15, vozová 30 let) – **po kusech ≈ 25 m**: zaroste jen kus, kudy se nechodí,
    zbytek zůstane (Martin, 22. 10. 2026 a 19. 10. 2026 – [Zarůstání podle
    druhů](#zarůstání-podle-druhů-pravidlo-4)). Dřívější roční pravidlo „5 let po sobě pod
    polovinou prahu“ a výjimky pro hať a cestu s jabloněmi jsou **nahrazené** (zrušené 22. 10. 2026). Stromy a jabloně u zarostlé cesty stojí dál, dokud neodumřou (jabloň se
    přepojí na nejbližší zbylý úsek do 30 m, jinak zanikne – ať nevisí na smazané cestě).

## Stromy u pevných cest

- **Kde:** po obou stranách pevné cesty v polní krajině (podél pole nebo louky – ne v lese, ve
  vsi, na pozemcích, hřbitově ani v sadu; **i na poli** – Martin, 18. 10. 2026, Pole jako
  krajina: místa leží na mezi, kam se neorá, a uchycený strom vezme dílu 20 m² – návrh Clauda),
  2,5–4 m od osy, místa po 12–20 m střídavě vlevo
  a vpravo, trochu nepravidelně, dva stromy nejméně 8 m od sebe (jako dnes – návrh Clauda).
  Místa se určí jednou, když cesta vznikne, deterministicky ze seedu vsi a polohy.
- **Uchycení:** na volném místě u cesty starší **5 let** se strom uchytí s pravděpodobností
  **10 % ročně** (náletem na neoraném okraji – návrh Clauda; los z seedu vsi a roku).
- **Druhy:** polovina dubů, zbytek jilmy a topoly (jako dnes).
- **Růst (Martin – napřed keř):** **keř** do 8 let (model keře), pak **mladý strom** (30 %
  velikosti), plná velikost ve **40 letech** (návrh Clauda).
- **Stojí, dokud neodumře (Martin):** délka života podle druhu – **topol 60–100 let, jilm
  100–200, dub 200–400** (los při uchycení – návrh Clauda). Po smrti zbude **souš** na 10 let,
  pak **pařez** na 10 let a místo je znovu volné.
- **Vesničané je na dřevo nekácí** – stojí, dokud neodumřou (Martin). Výjimka: když přes strom
  hráč postaví pole, dům, sad nebo hřbitov, skácí se jako ostatní stromy a dá kládu (návrh
  Clauda).

## Vylepšení cesty (staví hráč)

**Od 22. 10. 2026** je hať a lávka součástí úpravy (pravidlo 7) – stupeň `causeway` zanikl a nenabízí se zvlášť
([Úprava cesty s hatí a lávkou](#úprava-cesty-s-hatí-a-lávkou-pravidla-7-a-8)). Ceny platí dál.

Hráč klikne na pevnou cestu – vybere se celá cesta (řetěz úseků – [Cesta pro
hráče](#cesta-pro-hráče)), v panelu je stupeň, délka, stáří, stromy a jabloně a tlačítka
vylepšení (ikony, cena v popisku – jako v 0 A.D.). Vylepšení je stavba ze
společné práce vsi; stromy bere jako obydlí (klády z hromady, pak nejbližší dospělé stromy).

| Stupeň                       | Co se udělá                                                                                               | Cena (návrh Clauda)                                       | Rychlost chůze (návrh Clauda)         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| 1. **Vyšlapaná cesta**       | vznikne sama                                                                                              | –                                                         | 1,5× proti louce (i vyježděná)        |
| 2. **Upravená cesta**        | vyrovnaná a rozšířená – širší vyšlapaná cesta (bez strouhy)                                               | **15 člověkodní na 100 m**                                | 1,7×                                  |
| (součást 2.) **Hať a lávka** | povalový chodník přes mokřinu, lávka z kmenů přes potok – staví se s úpravou, ne zvlášť                   | hať **1 strom a 2 čd na 2 m**, lávka **4 stromy a 15 čd** | 1,7× i přes mokřinu; brod bez zdržení |
| **Vozová cesta**             | nová přímější trasa s úvozy, náspy a serpentinami do 6 %, zpevněné koleje – [Vozová cesta](#vozová-cesta) | zemní práce 0,5 čd/m³, zpevnění 0,3 čd/m, kácení          | 1,7× i přes mokřinu; vůz 2,2×         |

- **Stupeň 3** jde jen na úseku, který vede mokřinou (rovina podél potoka) nebo brodí potok –
  jinak se nenabízí.
- **Vysazení jabloní** (nezávislé na stupni – Martin): podél úseku po obou stranách po
  **10 m** (střídavě, na volných místech – kde stojí strom, jabloň nebude). Jako
  [sad](orchard.md) na strom: výsadba **0,45 čd** (80 čd/ha při ≈ 180 stromech/ha) jen v oknech
  jara a podzimu, péče v zimě, sklizeň v září–říjnu, úroda **≈ 17 kg jablek na strom** při plné
  úrodě (≈ 3 t/ha), plody od 6. roku, život ≈ 60 let – pak souš a místo je volné; „Vysadit
  jabloně“ znovu doplní mezery (návrh Clauda). Jablka jdou do zásoby ovoce jako ze sadu.

## Rychlejší chůze (Martin – efekt vylepšení)

Martin (19. 10. 2026), rychlost chůze proti louce: „berme louku za výchozí: 1 vyšlapaná denní
cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7 –
tyhle hodnoty se týkají chůze.“ A dál: „Neber strniště jako louku, ale dej mu drobný postih. Ber to
třeba jako 0.8.“ K obcházení polí: „když použiješ třeba dijkstrův algoritmus pro procházení
ohodnoceného grafu, tak nejkratší cesta je ta nejrychlejší. Tj. může se stát, že někde bude
jednodušší jít přes pole, než ho obcházet i když je cesta přes pole pomalejší.“

| Kudy                                                                | Chůze – rychlost proti louce                       | Vůz (wagons.md – Vozová síť, rychlosti; návrh Clauda) |
| ------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| louka (výchozí), úhor, příloh                                       | 1                                                  | 1                                                     |
| zakládaný díl                                                       | 1                                                  | 0,6 (jako zoraný)                                     |
| pěšina dne plně prošlapaná                                          | 1,3 – slabší úměrně méně podle síly (návrh Clauda) | jako povrch pod ní                                    |
| stálá vyšlapaná cesta                                               | 1,5                                                | 1,3                                                   |
| vyježděná cesta (vyšlapaná s příznakem vozová)                      | 1,5                                                | 1,6                                                   |
| upravená cesta                                                      | 1,7                                                | 1,8                                                   |
| upravená cesta s hatí a lávkou (součást úpravy)                     | 1,7, i přes mokřinu (návrh Clauda)                 | hať 1,8, i přes mokřinu; lávka ne (brod)              |
| díl pole v osevu – od orby nebo kopání po sklizeň (zoraný … ve žni) | 0,5                                                | neprojede (po pevné cestě ano)                        |
| strniště po sklizni                                                 | 0,8                                                | 0,8 – žeň po strništi, připravený díl do osevu        |
| mokřina bez cesty i po vyšlapané, vyježděné či upravené cestě       | 0,5                                                | 0,55                                                  |
| brod bez lávky                                                      | + 30 m                                             | 0,33 – i pod hatí (lávka je jen pro pěší)             |

- **Stejné rychlosti v síti pěšin i ve vzdálenosti chůze** (`walk-speed.ts` – `partWalkSpeed`,
  `pathCostFactor`, `roadWalkSpeed`; čísla `PATH_WALK`, `FIELD_WALK`, `ROAD_WALK` v `rules.ts`):
  buňka sítě stojí 1 / rychlost (krát les, svah a překážky jako dřív), chůze rovně, po pěšině i po
  pevné cestě se počítá stejně. Pole není zákaz, jen cena – síť hledá nejrychlejší cestu, takže
  díl v osevu obejde, když je obcházení krátké, a jde přes něj, když je dlouhé. Pěšina dne přes
  díl v osevu nezrychlí (platí cena pole), pevná cesta přes pole jde rychlostí cesty (pás cesty se
  neorá – Cesta přes pole). Nejpomalejší z mokřiny a pole platí (ne součin). **Vůz** má vlastní
  rychlosti (sloupec Vůz, `CART_SPEED`, wagons.md – Vozová síť, rychlosti) se stejnou mokřinou na
  ose cesty (`Road.ground`) jako chůze; stoupání, křoviny, les bez cesty, sad, hřbitov a ohrada
  pro vůz zůstávají jako dřív. Díl pole pozná chůze
  podle vzhledu (`fieldPartLooks` – jako scéna; rozpracovaný díl podle větší části), do klíče
  přepočtu chůze se rychlost dílu promítá jako stadium – 1. dne v měsíci (paths.md – Pěšiny
  a práce). Brod v síti pěšin stojí jako dřív (cena buňky brodu), les, svah a překážky taky.

- Dnes práce zdražuje **vzdušná vzdálenost** od obydlí: +1 % za každých 10 m nad 100 m (pole
  a sad – [fields.md](fields.md); kácení a palivo – [forest.md](forest.md)).
- Nově se měří **chůzí** (návrh Clauda): délka trasy, kudy lidé skutečně jdou (uložené trasy;
  roční síť pěšin se od Úlohy 6 nepočítá),
  a úsek po cestě se započítá zkráceně podle rychlosti (po upravené cestě 340 m jako 200 m).
  Mokřina se počítá dvojnásobně (bahno), brod + 30 m (zout se, přebrodit). Vzdálenosti se
  přepočítají jednou za rok a po dokončení vylepšení.
- Pole za potokem nebo za mokřinou tak bez cesty zdraží, s hatí a lávkou zlevní. Pole 400 m
  daleko bez cesty ≈ +30 %, s upravenou cestou ≈ +20 % (příklad).

## Stromy u cesty zrychlí chůzi

Martin (20. 10. 2026): „Stromy u cesty musí přídat něco málo k rychlosti jak chodců tak vozů. šlo
by přidat třeba 0.03? A pokud to budou jabloně, přidalo by se 0.05.“ Podrobnosti návrh Clauda
(čísla `ROAD_TREE_SPEED` v `rules.ts`).

- **Přírůstek k rychlosti cesty, ne násobek:** úsek pevné cesty, který po celé délce lemují
  stromy, je o **+0,03** rychlejší pro chodce i vůz, s jabloněmi o **+0,05** – vyšlapaná cesta
  pěšky 1,5 → 1,53, vyježděná vozem 1,6 → 1,63; s jabloněmi 1,55 a 1,65 (`roadTreeSpeed`
  ve `walk-speed.ts`). V mokřině platí mokřina a brod stojí dál + 30 m (vůz brodem jako dřív) –
  přírůstek se tam nepřičte, ani na hati přes mokřinu.
- **Úměrně olemování:** přírůstek × podíl délky úseku, který stromy lemují (`Road.lined` –
  `roadLining`, `paths/road-lining.ts`). Místo na strom úseku (místa po 12–20 m střídavě po
  stranách – Stromy u pevných cest) lemuje osu kolem svého průmětu na osu k polovině vzdálenosti
  k sousednímu místu, nejvýš 11 m na každou stranu (polovina největšího rozestupu + 1 m posunu
  místa); krajní místo až ke konci osy, je-li konec do 27 m (u konců úseku se stromy nesázejí).
  Jabloně stejně podle jabloní úseku (po 10 m – 6 m na stranu, ke konci do 17 m). Počítá se jen
  místo, kde stojí strom – keř, souš ani pařez ne (`roadTreeLook`), u jabloní jen vysazená živá
  jabloň, ne čekající na výsadbu ani souš (`roadAppleStage`); strom odstraněný stavbou taky ne.
  Kde lemují jabloně, platí jabloně, jinde ostatní stromy. Podíl po desetinách (napřed celkem,
  z toho jabloně, zbytek stromy) – úsek napůl olemovaný stromy +0,015.
- **Kdy:** olemování se ukládá u úseku a určí se **1. dne v měsíci** se stadii dílů pro chůzi
  (`lineRoads` v `refreshWalkDistances`, do klíče `walkStageKey`) – kvůli každému stromu se chůze
  nepřepočítává. Nový nebo rozdělený úsek a úseky starší vsi ho dostanou hned další den.
  Deterministicky ze dne, prohlížeč dostane uložené olemování s cestou (`SceneRoad.lined`).
- **Platí všude, kde se počítá rychlost cesty:** vzdálenost chůze (`walking.ts` – díly pole, sad,
  voda, palivo, kácení dřeva staveb a cena u kurzoru), vozová síť (`paths/cart.ts` – svoz, orba,
  uhlí, voda) a síť pěšin (`roadCellCost` – trasy se ke stromořadí víc stahují). Odhad dosahu seče
  luk bere nejrychlejší chůzi i se stromy (`fastestWalkShare`). Dny cesty výprav po zemské stezce
  se počítají z délky stezky (trade.md – Doprava), stromy je nemění.
- **Panel cesty:** ikona chůze s přírůstkem („+0,03“) – průměr úseků cesty podle délky, jen když
  nějaký je.
- **Ves bez stromů u cest** je beze změny – síť pěšin, vzdálenosti chůze i vozová síť (zlaté
  otisky). Verze měření chůze (`WALK_VERSION`) se zvýšila, starší vsi se přepočítají hned.
- **Vlkov** (stav 9. 12. 800): 22 úseků, 81 stromů u cest (70 stromů, 11 keřů), 67 jabloní (44
  vysazených, 23 čeká na výsadbu). Olemování: nejdelší upravená cesta (1 216 m) napůl stromy
  (+0,015), druhá (663 m) ze 70 % jabloněmi a 20 % stromy (+0,041), třetí (602 m) z 20 %
  (+0,006). Chůze na 2 178 dílů pole se zkrátí celkem o 1 628 m (0,23 %, průměr 328,8 → 328,1 m,
  nejvíc o 3,7 m), k vodě o 0,1–1,1 m na obydlí.

## Co hráč vidí

- **Pevná cesta** je silnější a stálá – vyšlapaná hlína (jako dřív silná pěšina; pěšiny dne jsou
  vedle ní nevýrazné – [paths.md](paths.md)), upravená cesta je jen širší (Martin, 19. 10. 2026:
  „Vyšlapanou cestu nechme jako teď a upravená cesta ať je prostě jenom širší – ta odvodňovací
  strouha vypadá divně, zrušíme ji“), hať z kmenů napříč, lávka přes potok (modely nové).
- **Stromy** u cest od keře po plný strom, souše a pařezy; jabloně s jablky od srpna.
- **Výběr** pevné cesty kliknutím (zvýrazní se celá cesta hráče – řetěz úseků), panel: druh
  (ikona – vyšlapaná, vyježděná, upravená, hať), délka (u cesty z víc druhů i po druzích), stáří,
  stromy a jabloně (ikony + čísla), zrychlení chůze od stromů („+0,03“ – Stromy u cesty zrychlí
  chůzi), tlačítka vylepšení.
- Kronika: vznikla pevná cesta, vylepšení dokončeno, jabloně vysazeny.

## Rozhodnutí

Rozhodnutí nového systému (22. 10. 2026): [Rozhodnutí nového systému](#rozhodnutí-nového-systému)
a [paths.md – Rozhodnutí](paths.md#rozhodnutí). Tabulka níž je stav do 21. 10. 2026.

| Rozhodnutí                                                                               | Kdo          |
| ---------------------------------------------------------------------------------------- | ------------ |
| Stromy jen u pevných cest z pomalé složky; růst od keře; stojí, dokud samy neodumřou     | Martin       |
| Pevnou cestu hráč vybere kurzorem a vylepší                                              | Martin       |
| Tři stupně: vyšlapaná → upravená → hať a lávka; efekt rychlejší chůze                    | Martin       |
| Nezávislé vylepšení: vysazení jabloní podél cesty                                        | Martin       |
| Roční síť k 1. 11., práh 3 cesty za den 2 roky, zarůstání vyšlapané po 5 letech          | návrh Clauda |
| Uchycení 10 %/rok po 5 letech cesty, keř 8 let, plný strom 40 let, životy topol/jilm/dub | návrh Clauda |
| Ceny a rychlosti stupňů, jabloně po 10 m jako sad na strom                               | návrh Clauda |
| Vzdálenost práce chůzí místo vzdušnou čarou, mokřina ×2, brod +30 m                      | návrh Clauda |
| Fáze 1 – rok cest, porovnání s loňskem, připojení a dělení úseků, provoz cesty (níž)     | návrh Clauda |
| Fáze 1 – místa na stromy, strom jako překážka (kláda od 20 let), cesta přes pole zůstává | návrh Clauda |
| Fáze 2 – mokřina, výběr, ceny bez přirážky, okno chůze, kácení chůzí po pevných cestách  | návrh Clauda |
| Fáze 3 – místa jabloní, výsadba jako stavba, souš 10 let, jabloně zůstanou i bez cesty   | návrh Clauda |
| Úsek mezi rozcestími: dva úseky v uzlu bez odbočky se spojí; rozcestí je udusaný plácek  | Martin       |
| Spojení – id a den vzniku staršího, provoz vážený délkou; různý stupeň zůstane rozdělen  | návrh Clauda |
| Jabloně a stromy u cest i na poli (pole jako krajina)                                    | Martin       |
| Strom na poli vezme dílu 20 m²; nálet jen na mezi – místa 2,5–4 m od osy                 | návrh Clauda |
| Pěšina dne nevýrazná; vyšlapaná cesta beze změny; upravená jen širší, strouha zrušená    | Martin       |
| Upravená cesta 3 m (vyšlapaná 1,9 m), bez kamenů; kmeny hatě na šířku upravené cesty     | návrh Clauda |
| Po pevné cestě se chodí bez ohledu na povrch pod ní (pole, sad, les, svah)               | Martin       |
| Výjimky: brod, neprůchodná místa, ploty hřbitova a ohrady, svatyně a stavby              | návrh Clauda |
| ~~Cesta s jabloněmi nezaroste~~ (zrušeno 22. 10. 2026); díl pole o cestu nepřichází      | návrh Clauda |
| Zarůstá jen nepoužívaný kus úseku, zbytek zůstane se starým id                           | Martin       |
| Kusy ≈ 25 m, historie jen tichých kusů (střed a roky), volný konec u zarostlého kusu     | návrh Clauda |
| ~~Pole lidi nezdržuje – nejkratší cesta i přes osetý díl~~ (změněno – rychlosti chůze)   | Martin       |
| Připojení nové cesty po souběžném kusu do 14 m                                           | návrh Clauda |
| Vozy vyjezdí vlastní cesty, ve svahu serpentiny                                          | Martin       |
| Vozová cesta = pevná cesta s příznakem z ročního provozu vozů, pro lidi stejná           | návrh Clauda |
| Vyjezdí-li vůz cestu, je to vyježděná cesta; vyšlapanou cestu vozová přebije             | Martin       |
| Vyježděná = druh cesty pro hráče (vyšlapaná s vozy); upravená a hať zůstanou             | návrh Clauda |
| „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5“          | Martin       |
| „Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7“                              | Martin       |
| „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“            | Martin       |
| „nejkratší cesta je ta nejrychlejší“ – pole je cena, ne zákaz                            | Martin       |
| Hať 1,7× i přes mokřinu; pěšina úměrně síle; stejné rychlosti v síti pěšin i chůzi       | návrh Clauda |

## Cesta je cesta – povrch pod ní a zarůstání

**Od 22. 10. 2026** neplatí výjimka „cesta s jabloněmi nezaroste“ (pravidlo 4 – [Zarůstání podle
druhů](#zarůstání-podle-druhů-pravidlo-4)); po cestě bez ohledu na povrch platí dál.

Martin (19. 10. 2026, ves Vlkov): „Je tam vidět, že na nový hřbitov vedla nejkratší cesta, kolem
které dokonce byly nějaké stromy (jabloně) a ta zanikla a lidé to začali obcházet divnou delší
cestou.“ a „Když už někde vyšlapaná cesta je, ať po ní lidé chodí bez ohledu na to, na čem ta
stezka leží.“

- **Po pevné cestě bez ohledu na povrch** (Martin): buňka sítě pěšin pod osou pevné cesty
  (jakéhokoli stupně, i vyšlapané) stojí jako rovná louka a k tomu sleva plné pěšiny – díl pole
  v jakémkoli stadiu (osetý, zoraný, zakládaný, zarůstající příloh), sad, les vsi i krajiny, svah
  ani kmeny, keře a kameny krajiny ji neprodraží (`ROAD_CELL_COST` v `network.ts`). Dřív pod
  cestou platila cena povrchu: přes osetý díl stála cesta 12 × 0,5 = 6× louku, lidé ji obcházeli
  kolem pole a cesta zarostla. Platí v síti dne (vzhled, postavy) i v roční síti (pevné cesty).
- **Co platí dál** (návrh Clauda): **brod** se počítá jako dřív – v síti cena brodu z terénu,
  v chůzi pro práci podle mokřiny a brodů na ose a stupně (brod + 30 m, po lávce nic, mokřina
  podle stupně). **Neprůchodné místo** (voda mimo brod, sráz, balvan, skalní výchoz) zůstává
  neprůchodné – pevná cesta přes ně nevzniká (vzniká z provozu, který je obchází), osa je může
  nanejvýš lízt rohem buňky. **Ploty a stavby** zůstávají překážkou: hřbitov, ohrada, okrsek
  svatyně, dům, pozemek, staveniště, modla a milíř. Postaví-li hráč stavbu přes pevnou cestu,
  přehradí ji – lidé ji obejdou podél plotu (okraj čtverce plotem není) a cesta po obou stranách
  žije dál: provoz cesty je medián po ose, krátký kus pod stavbou ho nezkreslí. Důvod: plot a zeď
  jsou skutečná překážka, kterou cesta neprorazí, a přes cestu je postavil hráč; zrušit kus cesty
  pod stavbou může přijít později (jako u pole přes cestu – Fáze 1). Nový systém cest to řeší –
  kus pod stavbou je hned opuštěný ([paths.md – Stavba přes cestu](paths.md#stavba-přes-cestu-vlkov-martin-23-10-2026)).
- **Chůze pro práci** (`walking.ts`) povrch pod pevnou cestou nepočítala už dřív: po cestě podle
  stupně, mokřiny a brodů na ose (`roadPieceCost`), rovně jen mokřina a voda – pole, sad ani les
  chůzi nezdraží (hlídá test). Beze změny.
- ~~**Cesta s prací hráče nezaroste**~~ (návrh Clauda; **nahrazeno** 22. 10. 2026 – Martin: „Platí
  to pro každou cestu, i upravenou a vozovou“; `keepingApples` zaniklo): cestu drží jen provoz
  (péče a sklizeň jabloní jsou trasy), zemská stezka a cesta, která se vylepšuje. Jabloně
  po zaniklé cestě stojí dál na nejbližším zbylém úseku.
- ~~**Díl pole pod cestou o plochu nepřichází**~~ (návrh Clauda; **zrušeno** 19. 10. 2026 –
  Martin: cesta poli plochu ubírá, viz [Cesta přes pole](#cesta-přes-pole)) – na rozdíl od stromu na poli
  (20 m²): (1) pevná cesta vzniká a zaniká sama provozem, hráč o ní nerozhoduje – ubírat pole by
  byla neviditelná ztráta, kterou nemůže ovlivnit, a při zarůstání, spojování a dělení úseků by
  se plocha musela vracet a přepočítávat (`giveWayToBuilding` umí jen ubrat); (2) je to málo –
  ve Vlkově vedl úsek 24 přes pole 285 m, při šířce 1,9 m ≈ 540 m², tj. 0,13 % ze 40 ha polí
  (na jednom přeťatém dílu ≈ 28 m² z 225 m²); (3) strom pole stíní a obchází se s rádlem
  i motykou, pás cesty je mez mezi díly, po které se jen chodí. Staré vsi se tím nemění.
- **Vlkov** (rozbor 19. 10. 2026 na kopii stavu): úsek 24 (vyšlapaný, 378 m, z toho 285 m přes
  pole, 6 jabloní) vedl ze vsi kolem nového hřbitova (≈ 15 m od něj, hotový 749) dál ke starému
  plnému hřbitovu. 1. 11. 752 se do roční sítě promítly ozimy: trasa ke hřbitovu opustila cestu
  100–220 m od vsi a obešla osetý blok východem (na ose 0 cest za den). Navíc za novým hřbitovem
  chodí ke starému hřbitovu jen 0,6 cesty denně (k modle) – a to je víc než polovina délky úseku,
  takže medián provozu byl 0,6 (práh zarůstání 1,5) a úsek zarostl i s jabloněmi. S novým
  pravidlem jde provoz po cestě až k novému hřbitovu (3,1–3,7 cesty denně, trasa ≈ 180 m při
  vzdušné vzdálenosti 160 m), medián úseku ale zůstává 0,6 – úsek drží jabloně (dopočet kopie
  stavu přes 1. 11. 752: zůstane). Dnes (758) úsek 24 neexistuje a data hráče se neobnovují:
  v létě trasa ke hřbitovu obchází osetý blok západem (≈ 350 m po pěšinách místo ≈ 180 m). Na
  nejkratší trase přes pole cesta sama znovu nevznikne – mimo pevnou cestu se přes osetý díl dál
  nechodí (od 19. 10. 2026 neplatí – [Pole lidi nezdržuje](#pole-lidi-nezdržuje)); 1. 11. 758 ale
  vznikne nová pevná cesta (79 m) od vsi k severozápadu podél okraje
  osetých dílů (stejně se starým i novým pravidlem) a po ní se pak chodí i v letech, kdy jsou
  díly pod ní oseté.
- ~~**Otevřené – k rozhodnutí:** dlouhý úsek, jehož část vede tam, kam se už nechodí, zaroste celý
  – i s používanou částí (medián provozu po ose). Ve Vlkově by úsek 24 bez jabloní zarostl
  i s novým pravidlem. Návrh Clauda: zarůstá jen nepoužívaný kus úseku – úsek se v roční kontrole
  rozdělí tam, kde provoz klesne pod polovinu prahu, a zaroste jen ta část.~~ Rozhodnuto – Martin
  z 19. 10. 2026: „ano“ ([Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)).

## Zarůstá jen nepoužívaný kus

**Nahrazeno 22. 10. 2026** stavem kusů podle druhu ([Zarůstání podle
druhů](#zarůstání-podle-druhů-pravidlo-4)) – kusy ≈ 25 m, zbytek se starým id a volné konce
po zarostlém kusu (`cutEnds`) zůstávají, tiché roky (`Road.quiet`) a `keepingApples` **zanikly**.
Text níž je historie.

Martin (19. 10. 2026) na návrh „dlouhý úsek zaroste celý, i když se po jeho části dál chodí –
zarůstá jen nepoužívaný kus úseku“: **„ano“**. Podrobnosti návrh Clauda.

- **Po kusech:** v roční kontrole (1. 11.) se provoz roční sítě posuzuje po kusech osy – osa
  úseku rozdělená na stejně dlouhé kusy co nejblíž **25 m** (`ROADS.pieceM`, kratší úsek je jeden
  kus; provoz kusu je medián bodů po 3 m jako u celého úseku). 25 m je dost krátké, aby se tichý
  konec oddělil blízko místa, kde provoz spadne, a dost dlouhé (≥ 15 m – nejkratší pevná cesta),
  aby jedno místo provoz nezkreslilo a odříznutý kus i zbytek byly platné úseky.
- **Historie** (zaniklo 22. 10. 2026): úsek nese jen tiché kusy (`Road.quiet` – střed kusu na cm a kolik ročních kontrol
  po sobě je pod polovinou prahu, nejvýš 5), ne provoz po bodech – stav nebobtná (u Vlkova
  desítky čísel). Rok se přičte, když loni byl tichý kus do půl kusu od středu letošního (střed
  ve světě, takže dělení a spojování úseků historii nerozbije – kusy jdou podle polohy k nejbližší
  ose). Kus, kde se letos chodí, historii ztratí.
- **Zarůstání kusu** (nahrazeno – už nezávisí na jabloních): kus tichý **5 let po sobě** zaroste, když u něj (do 6 m od osy kusu) nestojí
  živá nebo sázená jabloň (`keepingApples`); upravená cesta, hať, stezka a cesta, která se
  vylepšuje, nezarůstají vůbec. Zaroste-li celý úsek, zmizí jako dřív. Jinak se tiché kusy
  vyříznou (`cutOvergrown`) a **zbytek zůstane pevnou cestou se starým id a dnem vzniku** (druhý
  zbytek, když zarostl kus uprostřed, dostane nové id). Kronika „Nepoužívaná cesta zarostla.“
  jen pro zarostlý kus (`road-overgrown` s novým id kusu).
- **Volný konec:** konec zbytku u zarostlého kusu je volný (`openEnds` – pás cesty se ve scéně
  vytrácí) a díra se k němu nedoplňuje – pamatuje si ho `VillageRoads.cutEnds`, dokud tam nějaký
  úsek končí. Falešná rozcestí po oddělení spojí `mergeRoadChains` jako jindy.
- **Stromy:** u zarostlého kusu stojí dál (pařezy a souše dožijí jako dřív), volná místa na stromy
  zmizí s kusem; jabloně zůstanou a patří nejbližšímu zbytku.
- **Starší vsi:** tiché kusy se začnou počítat od další roční kontroly – nic nezaroste hned
  (úsek, který byl podle dřívějšího pravidla 4 roky pod prahem, počítá znovu od roku 1).
- **Vlkov** (kopie stavu z 21. 3. 752, kdy úsek 24 ještě byl, dopočet do 2. 11. 756): úsek 24
  (378 m ze vsi kolem nového hřbitova ke starému) 1. 11. 756 zkrátí na **151 m od vsi
  k jihozápadnímu rohu nového hřbitova** – tam vede provoz (3 a víc cest denně) a stojí jabloně;
  227 m dál ke starému plnému hřbitovu (0,6 cesty denně) zaroste (kronika s novým id 131), konec
  u hřbitova je volný.

## Vozové cesty

**Od 22. 10. 2026** nové vyježděné cesty nevznikají z kandidátů vozů (`formCartRoads`) – jízdy
jdou do vyšlapanosti jako chůze (× 2, [paths.md](paths.md) – Vyšlapanost); příznak vyježděná dál
z ročního provozu vozů. Zarůstání podle druhů.

Martin (19. 10. 2026): „Vozy mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří
chodí pěšky. Bude to znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset
vyjezdit serpentiny.“ Návrh, síť vozů a čísla: [wagons.md](wagons.md) – Vozová síť a vyjeté cesty,
Jak je postavené – fáze 2 (návrh Clauda).

Martin (19. 10. 2026): „Cesty – pokud nějakou cestu vyjezdí vůz, bude to vyježděná cesta. Pokud
vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“

- **Druhy cest pro hráče:** vyšlapaná, **vyježděná**, upravená, hať a lávka. Vyježděná cesta je
  v datech vyšlapaná cesta s příznakem vozová (`Road.cart`; druh `roadKind` v
  `paths/road-chains.ts`) – stupeň řídí chůzi a vylepšení, takže nový stupeň by byl jen jiným
  jménem pro totéž. Upravená cesta a hať zůstanou upravenou a hatí (jsou víc než vyježděná) – vozy
  po nich jezdí a ve scéně mají koleje. Vylepšit jde vyježděnou cestu jako vyšlapanou.
- **Vyježděná cesta vzniká z ročního provozu vozů** stejně jako pěší z provozu lidí – kudy vozy dva
  roky po sobě jezdí aspoň 0,25 jízdy denně (loňské úseky `VillageRoads.cartCandidates`), vznikne
  nová. **Vůz přebije vyšlapanou:** kudy vozy jedou po vyšlapané cestě (do 5 m od osy, stejným
  směrem), ten kus vyšlapané se stane vyježděnou (úsek se v koncích kusu rozdělí); kudy jedou
  souběžně kus vedle (do 12 m – jako souběžné cesty), od 25 m vznikne vyježděná po ose vozu a
  souběžný kus vyšlapané zmizí, kratší kus vyšlapanou převezme. Provoz vozů se nikdy neztratí
  a dvě souběžné cesty nevzniknou (wagons.md – Jak je postavené, fáze 2). Po 5 letech pod
  polovinou vyježděná příznak ztratí a je zase jen vyšlapaná.
- **Lidé po ní chodí jako po každé pevné cestě** (pro síť pěšin je vyježděná cesta obyčejná pevná
  cesta). Ve svahu se pěšina a vyježděná cesta rozejdou – pěšina rovně, vyježděná serpentinami;
  v rovině vozy jezdí po vyšlapané cestě a ta se stane vyježděnou.
- **Zarůstání po kusech:** kus, kudy jezdí vozy (aspoň polovina prahu vozů), není tichý – vyježděná
  cesta ve svahu, kudy lidé nechodí, nezaroste, dokud po ní jezdí vozy.
- **Úseky:** vyježděná a vyšlapaná cesta se nespojují do jednoho úseku (jako různé stupně) – hráč je
  vidí jako jednu cestu s délkou po druzích; u souběžných cest je vyježděná silnější (zůstane ona).
- **Pro vůz je sjízdná každá pevná cesta** (i pěší – lesem, přes pole), jen ne sklonem nad mez
  a vodou bez brodu; upravená cesta i hať jsou sjízdné vždy. Lávka je jen pro pěší.
- **Ve scéně:** širší pás (2,6 m), tráva mezi dvěma kolejemi; rozcestí vyježděných cest je
  udusaný plácek na šířku vyježděné cesty.

## Pole lidi nezdržuje

Martin (19. 10. 2026): „Ať lidé chodí vždy nejkratší možnou cestou a oseté pole ať neřeší. Aspoň se
nám pak hezky s orbou ustálí tvar polí, který je nyní příliš hranatý.“ Podrobnosti návrh Clauda.

**Změněno týž den (Martin, 19. 10. 2026 – [Rychlejší chůze](#rychlejší-chůze-martin--efekt-vylepšení)):**
„Pole, které zrovna neleží ladem: 0.5.“ a „nejkratší cesta je ta nejrychlejší“ – díl v osevu
stojí v síti pěšin i ve vzdálenosti chůze 2× louku (rychlost 0,5), strniště 1,25× (0,8); úhor,
příloh a zakládaný díl jako louka. Pole není zákaz: pěšina jde přes osev, když je obcházení delší.
Trasy přes pole se tak zase mění s osevem; pevná cesta, která přes pole už vede, jde dál rychlostí
cesty. Níž popsaný stav platil od rána do večera 19. 10. 2026.

- **Pěšiny přes pole:** osetý, zralý, zoraný i zakládaný díl stojí v síti pěšin jako úhor
  ([paths.md](paths.md) – Kudy), lidé jdou nejkratší cestou. Dřív stál osetý díl 12× a zoraný 3×
  louku – lidé ho obcházeli a osev se rok od roku měnil, takže trasa přes pole byla každý rok jiná
  a pevná cesta přes pole nevznikala (dva roky po sobě na stejném místě). Teď je trasa stálá
  a pevná cesta vznikne. Zarůstající příloh (křoviny, mladý les) je vegetace – zdržuje dál. Chůze
  pro práci (`walking.ts`) pole nepočítala ani dřív.
- **Vozy** přes osetý díl dál nejezdí ([wagons.md](wagons.md)).
- **Tvar polí:** pevné cesty pole rozčlení. Pod pevnou cestou obilí neroste a od 19. 10. 2026 cesta
  dílu ubírá plochu a odřízne malý růžek ([Cesta přes pole](#cesta-přes-pole)).
- **Vlkov** (kopie stavu z 3. 1. 765, dopočet do 2. 11. 776): pevná cesta od domů k brance nového
  hřbitova vznikne **1. 11. 766** – úsek 183 (dřív 70 m od vsi k severozápadu) se prodlouží na
  144 m až k brance (116 m přes pole). Bez připojení po souběžném kusu (Úseky a rozcestí) by
  vznikl jen kus 52 m u branky – trasa vedla kus souběžně s krátkým úsekem 236 a mezi úseky
  zůstala díra 12,5 m; samotné pravidlo pro pole tu nerozhodlo (trasa ke hřbitovu vedla v letech
  765–766 po strništi a po cestě 183). Ostatní cesty přes pole: úsek 59 se prodlouží ze 70 na
  91 m (89 m přes pole), krátký úsek 122 u vsi zaroste (jako dřív), zemská stezka 131 (234 m přes
  pole) a ostatní beze změny; do roku 776 už žádná další cesta nevznikne ani nezaroste.
- **Rozhodnuto** (Martin, 19. 10. 2026 – „Ano má.“): cesta dílu pod sebou plochu ubírá – [Cesta
  přes pole](#cesta-přes-pole).

## Průsek lesem

Martin (19. 10. 2026): „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“ Podrobnosti
návrh Clauda.

- **Pruh:** upravená cesta (vylepšení hráče i zemská stezka – [trade.md](trade.md)) vede lesem
  v průseku **3,5 m od osy** na každou stranu (`ROAD_SWATH`) – pás upravené cesty 3 m a 2 m
  z každé strany, ať se vůz i lidé vejdou a nejdou pod větvemi. Les = terén v lese a v lemu do
  6 m před ním (`PATH_WOODLAND`) a les vsi; na louce se nic nekácí. Stromy u cest a jabloně se
  nekácí nikde.
- **Co se vykácí:** stromy, mladé stromky, keře, souše a padlé kmeny v celém pruhu. V pásu cesty
  (1,5 m od osy) se vyklučí i pařezy a vyberou kameny (strom v pásu = práce stromu i pařezu),
  po stranách pařezy zůstanou. Práce podle tabulky překážek se připočte k ceně úseku (stezka
  i vylepšení; v popisku i počet stromů v průseku), klády za dospělé stromy jdou na hromadu.
  Kácí se, až práce na úsek dojde (`roadSwathDay`); stromy vyhrazené jinou stavbou zůstanou jí.
- **Pruh zůstane volný:** pařezy v průsecích (`VillageRoads.swath`) nedorostou ani z náletu, ani
  ze sazenice, dokud cesta stojí; nový les vsi (fields.md – Les vsi) do průseku nevstoupí (jeho
  stromy tam nevyrostou) a ve scéně ani zarůstání přílohu. Upravená cesta a stezka nezarůstají,
  takže průsek zůstane navždy.
- **Posvátné duby a háje** se nekácí: stezka se jim vyhne už trasou (průsek kolem buněk trasy),
  jinak by úsek nešel; u vylepšení hráče posvátný strom v pásu cesty úpravu nedovolí („Úpravě
  cesty brání posvátný dub“), po stranách zůstane stát.
- **Vyježděná cesta** (wagons.md) vlastní průsek nedostane: vyježděná cesta vzniká sama
  z jízd a nikdo ji nestaví – kácení je stavba s prací a kládami, kterou zadává hráč
  vylepšením; vozy lesem i dosud jezdí jen po pevné cestě. Kdo chce širokou cestu lesem, upraví ji.
- **Starší vsi:** hotové upravené cesty, hať a lávka a dostavěné úseky stezek dostanou průsek při
  načtení jednou (`withRoadSwaths`, `VillageRoads.swathChecked`) – bez práce a bez klád: byly
  postavené a zaplacené, když se průsek jen nekreslil (stromy se tehdy vykácely, klády už
  shnily).
- **Scéna:** stromy (i impostory uvnitř lesa) a keře zmizí podle id, po stranách pařezy, plocha
  korun nad pruhem zapadne (`swath-bands.ts` – po pásu, maska po políčkách je na 7 m moc
  hrubá), tráva pod stromy se přestane ztmavovat a stínová mapa se jednou překreslí. Na kraji
  průseku stojí les jako stěna. Ukázka na `/dev/landscape` – **Stezka lesem** (vyšlapaná, pak
  s průsekem).
- **Vlkov** (kopie stavu, stezka 2061 na jih – dnes úsek 131, 675 m): lesem vede jen 36 m (lem
  lesa), průsek by vykácel 3 stromy, 1 mladý stromek a 9 keřů – 14,5 čd práce a 3 klády. Hotová
  stezka ho dostane převodem bez klád.

## Cesta přes pole

Martin (19. 10. 2026) na otázku, jestli má cesta dílu ubírat plochu: „Ano má. Ono to stejně ve
výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout
takový růžek…“ Podrobnosti návrh Clauda.

- **Pás cesty se neorá:** díl přijde o plochu pod pásem pevné cesty v šířce obtisku (vyšlapaná
  1,9 m, vozová 2,6 m, upravená a hať 3 m – `ROAD_LAND`) a pod plácky rozcestí (poloměr 1,3 ×
  šířka nejširší cesty; od 22. 10. 2026 pod obrysem křižovatky – [paths.md](paths.md)). Na přeťatém dílu 15 m vyšlapaná cesta vezme ≈ 30 m² z 225 m².
- **Růžek za cestou zůstane loukou:** kus pole, který cesty oddělí od zbytku (cestou a okrajem
  pole), se obdělává jen, když je aspoň **80 m²** (vejde se do něj obrat spřežení – kruh
  o poloměru ≈ 5 m) a má místo **širší než 3 m** (jinak je to jen proužek podél cesty). Jinak
  zůstane loukou – mez u cesty. Kus, který na pole navazuje dalšími čtverci (cesta přes roh
  čtverce uprostřed pole), je obyčejné pole. Bez spřežení platí totéž: ostrůvek za cestou menší
  než obrat nebo proužek u cesty se motykou nevyplatí – leží u cesty, šlape se po něm, stáda
  hnaná po cestě ho spasou; sedlák ho nechá jako mez. Pravidlo tak nezávisí na tom, jestli ves
  zrovna orá rádlem, a tvar pole se s cestami ustálí.
- **Kdy:** v den po každé změně pevných cest nebo čtverců polí (vznik a zarůstání 1. 11.,
  dokončené vylepšení, zemská stezka, nové či sloučené pole) – `roadFieldsDay` podle otisku cest
  a polí, jinak nic. Co cesta brala dřív, se nejdřív vrátí: cesta, která zaroste nebo se
  přesune, půdu vrátí. Výpočet po buňkách 0,5 m v mřížce pole (`roadLand`, `paths/road-land.ts`,
  přesná aritmetika – stejně na serveru i ve scéně).
- **Rozjetý rok:** zmenšený díl ubere plánu osevu (i orbě rádlem), seči a založení podíl jako pod
  stavbou (`giveWayToRoads` jako `giveWayToBuilding` – hotová práce zůstane, zasetá plodina na ubrané ploše se nesklidí);
  vrácená půda je obdělaná jako zbytek dílu. Díl, kterému zbude méně než 20 % políčka, z pole
  vypadne jako pod stavbou (kronika „Pole ustoupilo cestě“).
- **Starší vsi** dostanou plochu pod cestami při prvním dopočtu. **Kalibrace** (`--land real`)
  cesty má – 20 vsí na 20 let: žádný cíl nezměnil stav, rozdíly v desetinách (osev 1,52 → 1,53 ha
  na domácnost, bílkoviny 91,5 → 91,6 %).
- **Scéna:** pás cesty maskuje track-mask.ts (od teď i vozová cesta), oddělené kousky dílu nesou
  `SceneFieldPart.roadCut` (buňky z jádra) – obtisk, obilí ani koruna porostu tam nejsou
  (`road-cut-mask.ts`). Brázdy končí na pásu cesty, spřežení se na něm otočí a oddělený kousek
  neorá ([oxen.md](oxen.md) – Brázdy končí na cestě; `plough-roads.ts`).
  Ukázka na `/dev/landscape` – **Cesta**: zralé pole přes rozcestí a krátká cesta přes roh pole
  (růžek za ní zůstane loukou), **Cesta: přechod stupňů** (upravená půlka navazuje na vyšlapanou,
  vozová cesta).
- **Vlkov** (stav 19. 10. 2026): 1 022 m pevných cest, přes pole vedou na 39 čtvercích – pás vezme
  1 146 m² a 2 růžky za cestou (20 a 21 m²) zůstanou loukou; celkem 1 186 m², 0,29 % ze 40,3 ha.

## Fáze 1 – jak je postavená

**Od 22. 10. 2026** je rok cest, práh a dva roky, provoz cesty a zarůstání nahrazený
([paths.md](paths.md) – Vyšlapanost, [Zarůstání podle druhů](#zarůstání-podle-druhů-pravidlo-4)).
Místa na stromy, uchycení, stromy jako překážka a stromy na poli platí dál.

Návrh Clauda (detaily, které návrh výš nechal otevřené – 18. 10. 2026):

- **Nahrazeno (Martin, 22. 10. 2026 (zadání #6): „Cesty zakládají jen lidé tím, kudy chodí“):** roční síť pěšin se 1. 11.
  nepočítá. Provoz cest je z tras (provozní pole tras), jízdy vozů jdou do vyšlapanosti
  (`addCartWear`, `WEAR.cartWeight`) a vozy cesty nezakládají, jen převezmou vyšlapanou
  (`takeOverCartRoads`); provoz ke stavbám (chátrání) se sčítá z tras po roce dat. Odrážky níž
  o roční síti, jejím prahu a „dvou letech po sobě“ jsou historické.
- **Rok cest a roční součty práce:** rok cest běží od jedné roční kontroly k další (1. 11. – 31. 10.). Simulace každý den přičte rozdělení práce dne po místech (pole, staveniště, sady,
  hřbitovy, kácení stromů pro stavby; práce „ve vsi“ ne) a roční síť bere průměr na den. Součty
  jsou ve stavu vsi, takže nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Práh a „dva roky po sobě“:** roční síť se počítá stejnou funkcí jako pěšiny dne (voda, dřevo
  podle průměru roku, sousedé, práce, ohrady, stáda na pastvě – krávy, které v zimě stojí
  v ohradě, poměrně k měsícům pastvy). Úsek osy, kde je síla aspoň síla 3 cest za den (≈ 0,55), je
  letos nad prahem; pevná cesta vznikne z bodů, které leží do 6 m od loňského úseku nad prahem
  a nevedou po pevné cestě (do 5 m od její osy – tam jde trasa po cestě). Kratší úsek než 15 m
  cestou není. Osa se uloží na centimetry a zjednoduší (0,25 m).
- **Připojení a úseky:** kde nový úsek navazuje na pevnou cestu, připojí se k ní (do 10 m): blízko
  jejího konce (4 m) přímo do konce, jinak do nejbližšího bodu osy a pevná cesta se tam
  **rozdělí** na dva úseky (oba si nechají den vzniku, stupeň, provoz a místa na stromy podle
  polohy). Body osy se tím nemění – cesta se nehýbe. Rozcestí sdílí přesně stejný bod.
- **Provoz cesty (zarůstání):** medián provozu roční sítě (cest za den) v bodech osy po 3 m (vždy
  nejvyšší z buněk kolem bodu – trasa vede po cestě nebo těsně vedle); pamatuje se posledních
  5 let. ~~Když zaroste úsek mezi dvěma jinými, ty se nespojují (rozcestí zůstane).~~ Od 18. 10. 2026 se spojí – [Úseky a rozcestí](#úseky-a-rozcestí). Od 19. 10. 2026 rozhoduje o zarůstání provoz po kusech
  ≈ 25 m ([Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)); provoz celého úseku
  zůstává pro řazení souběžných cest a copánků.
- **Sleva za pevnou cestu** v síti dne i v roční síti: buňky pod osou cesty jako plná pěšina
  (poloviční cena) – pěšiny dne se k cestě stahují. Od 19. 10. 2026 bez ohledu na povrch pod
  cestou (Martin – [Cesta je cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Ve scéně se pěšina dne v pevné cestě ztrácí
  (do 1,4 m od osy se nekreslí, od 3,2 m plně), pevná cesta se kreslí z dat jako plně vyšlapaná
  pěšina, volný konec (brána, pole) se vytrácí.
- **Místa na stromy** (při vzniku úseku, ze seedu vsi a konců úseku): po 12–20 m střídavě vlevo
  a vpravo 2,5–4 m od osy, ne do 6 m od konců úseku, ne do 2,2 m od osy jiné cesty, aspoň 8 m od
  jiných míst a stromů, ne v lese a do 6 m od jeho okraje, ne ve vodě, v brodu ani na srázu, ne
  do 2,5 m od překážky krajiny (kmen, keř, kámen), ne na dílu pole, v sadu, na hřbitově, v háji
  ani na pozemku a v ohradě (ani 1,5 m kolem), ne do 16 m od obydlí, staveniště a zbytku jámy
  (i na jeho pozemku), ne u modly a svatyně (+ 3 m), milíře a posvátného dubu (6 m). Volné místo, přes které později povede nová cesta,
  zmizí; na místě pod pozdější stavbou se strom neuchytí.
- **Uchycení:** los z seedu vsi, roku a místa – nezávisí na ostatních místech. Druh: dub 50 %,
  jilm 28 %, topol 22 % (jako stromy podél pěšin). Délka života los v rozmezí druhu.
- **Strom jako překážka stavby:** keř je keř, strom do 20 let mladý stromek (bez klády), od 20 let
  dospělý strom (kláda na hromadu), pak souš a pařez – ceny podle tabulky překážek (fields.md).
  Stromy u cest mají id nad rozsahem vrstvy překážek; stavba je odstraní jako ostatní překážky
  (cena u kurzoru je stejná v prohlížeči i na serveru) – i obydlí na poli (strom na zakládaném
  dílu, který obydlí zabere, odklidí stavba obydlí s kládou). Strom odstraněný stavbou a pařez po
  20 letech od smrti zmizí ze stavu při roční kontrole.
- **Cesta přes pole:** když hráč postaví pole přes pevnou cestu, cesta zůstává (kreslí se dál
  a po ní se chodí) – zrušení cesty stavbou může přijít s fází 2. Do 19. 10. 2026 ale pod cestou
  platila cena dílu – přes osetý díl stála cesta 6× louku, lidé ji obcházeli kolem pole a cesta
  zarostla (Vlkov); od té doby se po ní chodí jako po cestě přes louku ([Cesta je
  cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)).
- **Stromy na poli** (Martin, 18. 10. 2026 – [fields.md](fields.md), Pole jako krajina; podrobnosti
  návrh Clauda): místa na stromy smí i na čtverce polí – leží 2,5–4 m od osy, na mezi podél cesty,
  kam se neorá. Strom, který se na poli uchytí, vezme dílu 20 m² (úroda a práce úměrně, kronika
  „Pole ustoupilo stromům u cesty“). Cesty, které vznikly dřív, mají místa určená bez polí – místa
  se neurčují znovu, nové stromy na polích přibudou u nových cest.
- **Kronika:** „Kudy se chodí léta, vyšlapala se pevná cesta.“ a „Nepoužívaná cesta zarostla.“
- **Rychlost:** roční kontrola ≈ 6–8 ms (Node, ves 27 lidí, 6 úseků), přeskok 10 let
  s krajinou ≈ 0,55 s (bez krajiny 0,15 s – rozdíl jsou pěšiny dne i pevné cesty). Stav pevných
  cest ≈ 3 kB.

## Fáze 2 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Mokřina** = suchá rovina (sklon nejvýš 0,04) do 3 buněk terénu pěšin (≈ 11 m) od vody –
  podmáčený břeh a niva potoka. **Brod** = mělký úzký úsek potoka (průchozí voda – paths.md).
  Kde úsek vede mokřinou a přes brody, se určí z krajiny při vzniku úseku (starší úseky si to
  doplní při roční kontrole); rozdělení úseku rozdělí i mokřinu a brody.
- **Výběr:** kliknutí do 2,5 m od osy vybere úsek (po obydlí, posvátných místech, pozemku
  a ohradě, před polem); zvýrazní se čarami po obou stranách pásu. Panel: portrét stupně, délka,
  stáří, stromy u úseku, mokřina a brody, průběh rozestavěného vylepšení a tlačítka vylepšení
  (ikony, v popisku název, rozpad ceny na úpravu, hať a lávku s prací a dřevem a celek; zašedlé
  s důvodem červeně – „Cesta se už vylepšuje.“, „Na hať a lávku chybí dřevo.“).
- **Ceny** podle tabulky výš: upravená cesta 15 čd na 100 m délky úseku (bez přirážky za
  vzdálenost – pracuje se na cestě), hať 1 strom a 2 čd na 2 m mokřiny (stromy nahoru na celé),
  lávka 4 stromy a 15 čd na brod; dřevo jako obydlí – celé klády z hromady, zbytek nejbližší
  dospělé stromy k polovině úseku (kácení v ceně). Hať a lávka se staví jen na úseku přes
  mokřinu nebo brod, jako součást úpravy; upravená cesta bez nich (`unbridged`) nabídne jen je.
- **Vylepšení je stavba** ze společné práce (lidé pracují podél úseku u čela práce); úsek během
  stavby nezaroste; když se rozdělí, stavba platí pro oba kusy. Po dokončení dostane úsek nový
  stupeň a kronika „Cesta je vylepšená – chodí se po ní rychleji.“
- **Chůze** (walking.ts – jediné místo výpočtu, rychlosti z walk-speed.ts): po pevné cestě podle
  stupně (vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes mokřinu), mokřinou
  0,5×, brod + 30 m (po lávce nic); mokřina, brod a pole (v osevu 0,5×, strniště 0,8× –
  `withFieldWalk`) platí i pro chůzi rovně mimo cestu a po pěšinách dne (přes osev pěšina
  nezrychlí). Okno terénu pro chůzi je
  pevné – 1,4 × 1,4 km kolem místa vsi (stejné na serveru i v prohlížeči).
- **Vzdálenost práce chůzí:** díly pole a čtverce sadu z nejbližšího obydlí po pěšinách
  a pevných cestách, palivo z obydlí k nejbližšímu okraji lesa, kácení dřeva staveb od stavby ke
  stromu po pevných cestách (bez pěšin dne – cena u kurzoru tak sedí se serverem). Přepočítá se
  se změnou rozložení vsi – pevné cesty a jejich stupeň jsou v klíči, takže hned po vylepšení
  a po roční kontrole. Bez krajiny (kalibrace) vzdušnou čarou jako dřív.
- **Příklad:** pole 400 m od vsi, kam se jde 300 m po cestě přes 20 m mokřiny a brod a 100 m
  rovně: bez cesty 450 m chůze (+35 % práce), vyšlapaná cesta ≈ 403 m (+30 %), upravená ≈ 357 m
  (+26 %), s hatí a lávkou 300 m (+20 %).
- **Scéna:** upravená cesta je jen širší vyšlapaná cesta (Martin, 19. 10. 2026: „upravená cesta
  ať je prostě jenom širší – ta odvodňovací strouha vypadá divně, zrušíme ji“) – tytéž obtisky
  (prošlapaná tráva a holá hlína na 55 % šířky), pás **3 m** místo 1,9 m (návrh Clauda – vozová
  cesta, o 60 % širší, z herní kamery jasně širší); strouha i kameny do bláta a brodu jsou
  zrušené. Hať jsou kmeny napříč na celou šířku upravené cesty (model 2,6 m zvětšený na 3 m,
  po 0,28 m), lávka 5,2 m ze tří kmenů na prazích a kůlech se zábradlím (modely
  `tools/blender/roads.py`). Rozestavěné vylepšení: vytyčení kolíky a provázkem od zadání
  (Martin) po okrajích širší cesty (1,7 m od osy), úprava – širší pás – roste od začátku úseku,
  kmeny hatě se kladou po mokřině podle průběhu, lávka nejdřív kůly a prahy (od 25 %), celá od
  90 %. Ikony `cesta`, `cesta-upravena` (širší pás), `hat`.

## Fáze 3 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Místa** (`roadAppleSpots`): po 10 m podél úseku střídavě po stranách, 2,6–3,4 m od osy (bez
  6 m na koncích úseku). Jabloň nestojí v lese, ve vodě ani v brodu, na stavbě vsi (obydlí,
  sad, hřbitov, ohrada – jako stromy u cest), do 2,2 m od osy jiné pevné cesty, do 2,5 m od
  překážky krajiny (kmen, keř, kámen), do 6 m od stromu u cesty a do 8 m od jiné jabloně – proto
  „Vysadit jabloně“ po letech doplní jen mezery a nesází naproti stojící jabloni. Místa jsou
  deterministická (seed vsi a úseku). **Na poli smí** (Martin, 18. 10. 2026 – Pole jako krajina):
  každá jabloň na dílu pole mu vezme 20 m² hned se zadáním výsadby, v popisku tlačítka oranžově
  „Pole se zmenší“ / „Pole zanikne“. Ve Vlkově (≈ 40 ha polí) má po změně místo 11 z 25 cest
  (26 jabloní, dřív 1 cesta a 3 jabloně); ze 14 cest delších než 20 m 10 – zbylé vedou lesem,
  kratší úseky (do ≈ 15 m) místo nemají kvůli 6 m od konců a rozestupu 10 m.
- **Výsadba je stavba** `road-apples` ze společné práce: 0,44 čd na jabloň (80 čd/ha při
  180 stromech/ha), bez přirážky za vzdálenost (jako výsadba sadu); pracuje se jen v oknech
  výsadby (září–listopad, březen–duben), mimo ně stavba čeká (v panelu ikona „Sází se na jaře
  a na podzim“). Jabloně se sázejí po řadě podél úseku – každá, na kterou práce došla, dostane den
  výsadby. Úsek ve výsadbě nezaroste. Kronika „Jabloně podél cesty jsou vysazené.“
- **Úroda a práce** jako sad na strom (1/180 ha): plody od 6. roku, plná úroda ≈ 16,7 kg od 25.
  roku, péče v zimě a sklizeň v září–říjnu jdou se sady (`orchardWork`), jablka do zásoby ovoce
  (`applesKg`). Přirážka za vzdálenost u péče a sklizně podle vzdušné vzdálenosti jabloně od
  nejbližšího obydlí při výsadbě (jabloň stojí u cesty – chůze by se lišila málo).
- **Život:** strom do 60 let, pak souš 10 let a místo je volné. Jako překážka je jabloň do 20 let
  mladý strom (kácení bez klády), pak strom (kláda), souš jako souš; stavba přes jabloň ji
  odstraní. U jabloně se strom u cesty neuchytí (do 6 m). Cesta s živými jabloněmi (i když se
  teprve sázejí) nezaroste (od 19. 10. 2026 – [Cesta je
  cesta](#cesta-je-cesta--povrch-pod-ní-a-zarůstání)); až všechny dožijí, zarůst může. Jabloně
  u cesty, která zarostla dřív (Vlkov – úsek 24), stojí dál jako stromy u zarostlé cesty; při
  rozdělení úseku patří bližší části.
- **Panel cesty:** počet jabloní (v závorce plodící, když nejsou všechny), průběh výsadby
  a tlačítko „Vysadit jabloně“ (ikona `jablone`, v popisku práce a počet jabloní; zašedlé
  s důvodem – „Jabloně se tu už sázejí.“, „Podél cesty není volné místo.“). Server výsadbu
  ověří znovu (use-case `plantApplesAlongRoad`).
- **Scéna:** jabloně ze sadu (`apple-1…4`, s jablky `apple-fruit-1…4`) s velikostí podle stáří
  jako v sadu (sazenice 30 %, plná za 12 let, první 3 roky u kůlu), jablka od srpna do sklizně,
  roční období jako sad (květ, podzimní listí, holé koruny – meshe `pathside-apple-*`); souš jako
  u stromů u cest. Místa, která čekají na výsadbu, jsou od zadání vytyčená kolíkem a provázkem
  po straně cesty (Martin – u všech staveb). Lidé česají a ošetřují jabloně úseku a sázejí u míst,
  která čekají.
- **Příklad:** úsek 200 m s volnými místy po celé délce dá ≈ 19 jabloní – výsadba ≈ 8,4 čd (na
  jaře nebo na podzim), od 25. roku ≈ 317 kg jablek ročně (výživou ≈ 45 kg obilí), sklizeň
  ≈ 0,8 čd a péče ≈ 1,1 čd za zimu (do 100 m od obydlí bez přirážky).

## Úseky a rozcestí

**Od 22. 10. 2026** je rozcestí **křižovatka** – kříž nebo Y se znamením, kulatý plácek zmizel
([paths.md](paths.md) – Křižovatky). Spojení úseků, díry a souběžné cesty platí dál jako kroky
úklidu sítě ([paths.md](paths.md) – Síť); falešná rozcestí a pahýly řeší úklid.

Martin (18. 10. 2026, ves Vlkov): „úsek mezi dvěma rozcestími je v pohodě, ale ve hře jsou
evidentně falešná rozcestí“ a „rozcestí by mělo být nejvyšlapanější plochou, teď vlastně chybí“.
Ve Vlkově bylo z 23 úseků 13 uzlů, kde se potkávají jen dva úseky – zbytky po rozdělení cesty,
když odbočka zarostla, a cesty navázané na konec jiné v různých letech.

- **Spojení úseků** (`mergeRoadChains`, návrh Clauda): kde končí právě dva úseky (uzel bez
  odbočky), spojí se do jednoho – osa za sebou (směr staršího úseku zůstane), místa na stromy,
  jabloně, mokřina a brody na ose, provoz posledních let (vážený délkou), den vzniku a id
  staršího úseku. Stromy u cesty se nemění. Stavby na úsecích – výsadba jabloní a vylepšení, které
  platí pro oba úseky – přejdou na spojený úsek.
- **Zůstanou rozdělené:** úseky různého stupně (vyšlapaná a upravená – skutečná hranice
  vylepšení) a úseky, z nichž se vylepšuje jen jeden (nebo každý jinou stavbou) – po dokončení
  vylepšení se spojí, mají-li stejný stupeň. Uzavřený okruh z jednoho úseku zůstane.
- **Kdy:** v roční kontrole po zarůstání a vzniku nových cest (zarostlá odbočka uzel uvolní),
  po dokončení vylepšení a jednou při načtení starší vsi (`withMergedRoads` – bez falešného
  rozcestí vrátí týž stav). Simulace pak falešná rozcestí sama nevytváří, takže výsledek
  nezávisí na kouscích dopočtu.
- **Vlkov po převodu:** z 23 úseků zbude 11 – jediný uzel se dvěma úseky je hranice upravené
  a vyšlapané cesty, skutečná rozcestí 2 (tři a čtyři úseky), zbytek jsou konce.
- **Rozcestí ve scéně** (návrh Clauda): kde končí aspoň tři úseky, je plácek udusané hlíny – kruh
  o poloměru 1,3× šířky přicházející cesty s nepravidelným okrajem, plné síly; vbíhá-li do něj upravená
  cesta, je v jejím širším pásu (`roadJunctions` v `road-works-layout.ts`). Totéž rozcestí pěšin
  dne ([paths.md](paths.md)).
- **Díry mezi úseky** (Martin, 18. 10. 2026: pevná cesta má uprostřed mezeru – dva úseky na
  sebe navazují, ale konce se nepotkají; návrh Clauda): volný konec úseku, ve kterém nekončí jiný
  úsek a který není **skutečným koncem trasy** (do 6 m od něj nekončí čára roční sítě – brána
  domu, cíl: pole, voda, les), se napojí k jinému úseku do 12 m – do jeho konce (blíž než 4 m),
  jinak do nejbližšího bodu osy, kde se ten úsek rozdělí (rozcestí). Uzel je pak společný,
  falešné rozcestí se spojí. Díry vznikaly, kde provoz na pár metrů klesl pod práh, a cesta se
  tam rozpadla na dva úseky. Kdy: v roční kontrole a jednou při načtení starší vsi
  (`withJoinedRoads`, příznak `VillageRoads.endsChecked` – převod počítá roční síť jednou,
  ≈ 0,4 s).
- **Vlkov po zacelení:** z 10 úseků zbude 8 – díra 5,3 m v polích (úseky 43 a 85) a 11,6 m
  u vsi (upravená cesta 4 končila kus před branou domu, odkud vede upravená cesta 5) se zacelí
  a úseky se spojí. Volné konce zbudou 4 – brány tří domů a cíl v polích. Konce u vsi
  vzdálené 7–23 m od jiných úseků jsou brány domů (do 6 m od konce trasy) – zůstanou.
- **Souběžné cesty** (Martin, 18. 10. 2026, Vlkov: dvě cesty 5–19 m od sebe jako copánek,
  „Takovéto cesty by vůbec neměly existovat.“; návrh Clauda): nová pevná cesta nevznikne tam,
  kde vede do 12 m od jiné pevné cesty stejným směrem (odchylka do ≈ 37°) – provoz patří té.
  Existující souběžné cesty se v roční kontrole (a jednou při načtení starší vsi –
  `VillageRoads.parallelsChecked`) sloučí: z mladší / slabší cesty (nižší stupeň, mladší, méně
  provozu) se vyřízne kus, který vede souběžně aspoň 25 m; zbytky kratší než 15 m zmizí, delší
  se napojí ke silnější cestě. **Copánek** – dva úseky mezi stejnými uzly, které se nikde
  nevzdálí víc než 25 m: zmizí oklika (delší o víc než 5 %, jinak slabší). Stromy u odstraněné
  cesty stojí dál jako u zarostlé (do 5 m od silnější cesty patří k ní), jabloně patří silnější.
  Dva úseky mezi stejnými uzly se nespojí do okruhu a při spojování úseků má přednost
  nejrovnější pokračování. Vlkov: 40 a 83 (copánek mezi stejnými rozcestími, 5–19 m od sebe)
  se sloučí – po převodu zbude 5 úseků, cesta od vsi k polím je jedna. **Připojení po souběžném
  kusu** (návrh Clauda, 19. 10. 2026): nová cesta, jejíž trasa vedla kus souběžně s jinou (do
  12 m), začíná až za ním – její konec se k té cestě připojí do 14 m (12 m a krok vzorkování
  2 m; dřív jen do 10 m a mezi úseky zůstala díra 12–14 m, kterou zacelování děr do 12 m
  nespojilo – Vlkov 766, cesta ke hřbitovu).
- **Volné konce ve scéně:** úsek nese `Road.openEnds` (určí roční kontrola) – pás cesty se
  vytrácí jen na skutečném volném konci (brána, cíl), ne kde navazuje jiný úsek nebo kde trasa
  pokračuje pěšinou dne. Pěšina dne se za koncem úseku neskrývá (`roadFade`) – navazuje na cestu
  bez mezery. Ukázka na `/dev/landscape` (Cesta → **Díra: zacelená / otevřená**).

## Cesta pro hráče

Martin (19. 10. 2026, Vlkov – upravená cesta 103 navazuje na vyšlapanou 183): „tohle by rozhodně
neměly být dvě cesty, ale měly by se spojit do jedné“ a „cesty by se na sebe měly napojovat“.

- **Cesta hráče** (návrh Clauda) = řetěz úseků mezi skutečnými rozcestími (uzel aspoň tří konců)
  a volnými konci – **bez ohledu na druh cesty** (stupeň i vyježděnou – `roadChain` v
  `paths/road-chains.ts`, stejně na serveru i v prohlížeči). Data zůstávají po úsecích (stupeň,
  mokřina, brody, vozová, provoz, zarůstání) – hranice stupňů je skutečná a chůze, zarůstání
  i scéna ji potřebují; stejný stupeň se dál spojuje do jednoho úseku (`mergeRoadChains`).
- **Výběr:** klik na kterýkoli úsek vybere celou cestu (id cesty = první úsek řetězu – stejné, ať
  se klikne kamkoli), zvýrazní se celá. **Panel:** délka celé cesty, u cesty z víc druhů délka po
  druzích (ikony druhů – vyšlapaná, vyježděná, upravená, hať; `VillageRoad.kinds`), stáří
  nejstaršího úseku, stromy, jabloně, mokřina a brody celé cesty; portrét podle převládajícího
  druhu (nejdelší – `VillageRoad.roadKind`).
- **Vylepšení celé cesty:** úprava vylepší všechny vyšlapané úseky cesty, u úseků přes mokřinu či brod
  i hať a lávku (a upravené úseky bez nich je dostaví) – jedna stavba, cena za úseky
  dohromady, dřevo k polovině cesty. Stavba jde po cestě úsek po úseku (čelo práce, postavy
  i rozestavěný pás ve scéně – úsek ležící v cestě obráceně se upravuje od konce své osy), stupeň
  dostanou úseky po dokončení – stejné stupně se pak spojí. Výsadba jabloní vylepšení nebrání.
- **Jabloně podél celé cesty:** místa po úsecích za sebou (rozestup i přes navázání), jedna
  stavba, sází se po řadě podél cesty; každá jabloň patří ke svému úseku.
- **Server actions** dál dostávají `roadId` – kterýkoli úsek cesty, jádro si řetěz dopočítá.
- **Přechod ve scéně bez schodu:** kde na sebe navazují pásy různé šířky (upravená a vyšlapaná,
  vozová a pěší, rozestavěná úprava), širší pás se na 6 m plynule zúží k užšímu; koleje vozové
  cesty se tam vytratí. Na rozcestí se nezužuje – je tam plácek.
- **Vlkov:** 8 úseků = 6 cest hráče – 103 (upravená) + 183 (vyšlapaná) a 59 + 131 jsou každá
  jedna cesta; úprava se z obou úseků nabízí stejně (jen vyšlapaný úsek, 21,6 čd).

## Vozová cesta

Martin (20. 10. 2026): „Měla by přibýt cesta upravená pro vůz. Ta bude vozu dávat ještě větší
rychlost, bude mít vyježděné, ale zpevněné koleje. Zároveň dojde k podsattné změně - tato cesta
spojí dva body, které spojuje stará cesta pro pěší, ale co nejvíc přímo tak, aby vůz projel. Pokud
budou překážet svahy, vyhloubí se úvoz nebo udělá násep. Samozřejmě, některé svahy budou tak
velké, že se budou muset kombinovat serpentiny, úvozy a náspy.“

Na doplňující otázky Martin odpověděl:

- ~~**Stará cesta pro pěší zůstane.**~~ (nahrazeno 22. 10. 2026 – pravidlo 6) Chodí po ní dál, kdo to má blíž. Kusy, kterými nikdo nechodí,
  po 5 letech zarostou (dnešní pravidlo – [Zarůstá jen nepoužívaný kus](#zarůstá-jen-nepoužívaný-kus)).
- **Rozhoduje hráč v panelu cesty**, stejně jako u dnešních vylepšení: vybere cestu, uvidí trasu
  a cenu a potvrdí.

Podrobnosti a čísla jsou **návrh Clauda** schválený 20. 10. 2026 (čísla `WAGON_ROAD` v `rules.ts`,
rešerše [research/2026-10-20-earthworks.md](research/2026-10-20-earthworks.md)); co Claude
rozhodl sám při stavbě, je v tabulce na konci.

### Co to je

- **Nový stupeň pevné cesty** `wagon` – „Vozová cesta“: pás 3,5 m udusané hlíny s kolejemi
  vyztuženými kamenem a štěrkem, po 1 m krajnice – pláň 5,5 m.
- **Rychlost:** vůz **2,2** (upravená 1,8, vyježděná 1,6), pěšky **1,7** jako upravená. V mokřině
  drží rychlost jako hať (zpevněná) – chůze i vůz. Brod zůstává brodem (most je samostatné
  vylepšení později). Stromy a jabloně u cesty přidají jako u ostatních cest.
- **Vlastní trasa** mezi konci vybrané cesty hráče (rozcestí nebo volné konce –
  [Cesta pro hráče](#cesta-pro-hráče)) – nevede po ose staré cesty, ale co nejpříměji, kudy vůz
  projede.
- ~~**Stará cesta zůstane** jako samostatná pevná cesta s dnešními pravidly.~~ (Nahrazeno 22. 10. 2026 – vozová cesta vede po staré, [pravidlo 6](#vozová-cesta-po-staré-cestě-pravidlo-6).) Provoz se sám přesune
  na rychlejší cestu (síť pěšin, vozová síť), nepoužívané kusy staré cesty zarostou. Souběžný kus
  staré cesty těsně vedle vozové se vyřízne jako každá souběžná cesta – vozová se nikdy neřeže –,
  a to hned po dostavění úseku (kde vozová cesta vede po ose staré, nahradí ji bez dočasného
  rozcestí).
- ~~**Vozová cesta nezarůstá**~~ (od 22. 10. 2026 zarůstá za 30 let – [Zarůstání podle
  druhů](#zarůstání-podle-druhů-pravidlo-4)) (jako upravená a hať) a její volné konce se nenapojují samy
  (díry – [Úseky a rozcestí](#úseky-a-rozcestí)) – napojí je stavba.

### Trasa

**Nahrazeno 22. 10. 2026** – vozová cesta vede po staré cestě a narovná se jen v prudkém kusu
([Vozová cesta po staré cestě](#vozová-cesta-po-staré-cestě-pravidlo-6)). Hledání níž zůstává
pro místní narovnání. Text níž je historie.

- **Co nejpříměji** (Martin, 20. 10. 2026, na otázku, jestli má mít přednost přímá trasa se
  zemními pracemi, nebo levnější oklika: „Co nejpříměji“): přímá trasa má přednost – svah se
  srovná úvozem nebo náspem do 3 m, oklika nebo serpentina jen tam, kde by bylo potřeba víc.
  Dřívější „nejlevnější trasa vyhraje“ (práce stavby + čas jízdy) neplatí – na mírném terénu
  vycházely skoro vždy okliky bez zemních prací.
- **Hledání** (návrh Clauda): A\* po mřížce terénu pěšin (3,75 m) ze 16 směrů jako vozová síť,
  zatáčení o 2 směry na krok (čtyřkolák se spřežením zatočí na poloměru ≈ 6–8 m – úvrať serpentiny
  ≈ 15 m; vozová síť po louce počítá opatrněji o jeden), v okně kolem staré cesty a konců (rezerva
  40 % spojnice + 60 m, 60–220 m). Každý metr délky stojí v hledání **25 čd** navíc
  (`WAGON_ROAD.directPerM`) – víc než metr nejhlubšího úvozu (pláň 5,5 m a svahy 1 : 1 v hloubce
  3 m = 25,5 m³ ≈ 23 čd), takže se trasa svahu nevyhne, dokud ho jde srovnat; mezi trasami stejné
  délky rozhodne práce stavby a čas jízdy vozem za 10 let (`Road.cartTraffic`). Váha je jen pro
  výběr trasy – cena v panelu je skutečná práce jako dřív.
- **Narovnání** (návrh Clauda): trasa z mřížky jde po krocích buněk (zuby, schody po 16 směrech).
  Z každého bodu se vede přímý úsek co nejdál po trase, kudy vůz projede (žádná zakázaná buňka),
  roh nejvýš 45° a kde profil vyjde – rozsah výšek pláně (sklon, úvoz a násep do 3 m) dojde od
  začátku do bodu, odkud zbytek původní trasy dojde ke konci. Narovnaná trasa má proto profil
  vždy, když ho měla původní. Vyhlazení pak zaoblí jen rohy (osa zhuštěná po 4 m) a do zakázané
  buňky nesmí.
- **Sklon po úpravě nejvýš 6 %** (žádoucí mez pro povozy tažené zvířaty je 8 % – naložený
  čtyřkolák s brzděním smykem chce méně). Úvoz (výkop) nebo násep zarovná podélný profil
  nejvýš o **3 m**. Kde by bylo potřeba víc, trasa jde jinudy – serpentiny vzniknou samy
  z omezení sklonu a zatáčení, velké svahy dostanou serpentiny, úvozy i náspy.
- **Kudy ne** (jako vozová síť): voda mimo brod, osetý díl, sad, hřbitov, ohrada, stavby, pozemky
  a staveniště (s půl vozovkou), posvátné duby a háje (pláň a 2 m – ani u konce cesty; zemní práce
  nesmí ani k rohům buňky se stromem) a okrsek svatyně. U staveb,
  plotů a vody se terén upraví jen tolik, kolik se vejde (srovnání pláně 0,3 m jde všude), brody
  se neupravují. **Les ano** – průsek ([Průsek lesem](#průsek-lesem)). **Pole** – cesta přes pole
  jako dnes ([Cesta přes pole](#cesta-přes-pole), pás 3,5 m).
- **Kdy úprava nejde:** cesta je okruh, kratší než 15 m, už je vozová nebo se upravuje, žádná
  trasa do 6 % se nenašla, nebo by vedla velkou oklikou mezi stavbami (víc než 3× delší a o víc
  než 60 m, přestože stará cesta není prudší než 6 % – délku pak nedělá svah, ale domy) – důvod
  česky v popisku.

### Profil a zemní práce

- **Profil:** osa trasy se vyhladí (zubaté kroky mřížky zmizí; zkusí se víc stupňů vyhlazení
  a vybere se nejlevnější, hladší má přednost do 15 % ceny), body po 2 m, navržená výška pláně na
  cm – nejmenší zemní práce při sklonu do 6 % a v mezích úvozu a náspu. Stav vsi ukládá jen
  profil osy, ne mřížku.
- **Příčný řez:** pláň 5,5 m v navržené výšce, svahy výkopu a náspu 1 : 1 k původnímu terénu.
- **Objemy** výkopu a náspu (m³) na rastru 1 m po kusech 5 m. Hlína z úvozu jde přednostně do
  náspu na téže cestě – tam, kde je převoz levnější než nová hlína z boku; jinak se nasype z boku
  a přebytek výkopu se rozhrne vedle.
- **Práce:**

  | Co                             | Cena                                   | Zdroj (rešerše)                                                      |
  | ------------------------------ | -------------------------------------- | -------------------------------------------------------------------- |
  | výkop s naložením              | 0,5 čd/m³                              | ILO: ulehlá hlína 2,7–3,5 m³ za čd, dřevěné nářadí ≈ 2 m³            |
  | uložení a udusání násypu       | 0,2 čd/m³                              | ILO: rozhrnutí 13,5 a ruční hutnění 9 m³ za čd                       |
  | převoz hlíny (koše, nosítka)   | 0,15 + 0,15 čd na každých 100 m, na m³ | ILO: kolečko 8,5 m³ do 20 m, 4,5 m³ do 150 m – nošení o půl pomaleji |
  | zpevnění kolejí a úprava pláně | 0,3 čd na metr                         | zadání; ILO: sběr kamene 2,5 m³ za čd (odhad Clauda 0,25–0,3)        |
  | kácení                         | jako průsek (tabulka překážek)         | fields.md – tabulka překážek                                         |

- **Kácení:** v lese průsek 3,5 m od osy jako upravená cesta; všude navíc pláň a místa, kde se
  terén upraví (o víc než 10 cm) – stromy, mladé stromky, keře, souše a padlé kmeny, na vozovce
  a pod zemními pracemi i pařezy a kameny (strom tam dá i práci pařezu). Po stranách průseku
  pařezy zůstanou a nedorostou. Stromy u cest, jabloně a les vsi taky; klády za dospělé stromy
  na hromadu. Posvátný strom na pláni nebo pod zemními pracemi – úprava nejde.

### Stavba

- **Panel cesty:** tlačítko **Upravit pro vozy** (ikona `cesta-vozova`) vedle ostatních vylepšení.
  Popisek: cena (práce, stromy), délka nové trasy proti staré, nejprudší místo dřív a teď, největší
  úvoz a násep, doba jízdy vozem dřív a teď (stará cesta prudší než 10 % – „neprojede“). Najetím
  na tlačítko (a výběrem cesty) se nová trasa ukáže ve scéně jako vytyčení – kolíky a provázek po
  okrajích pláně. Rozestavěná vozová cesta má v panelu průběh.
- **Stavba ze společné práce** vsi (`build`) po úsecích ≈ 60 m **od vsi ven** (od konce bližšího
  dvorci). Hotový úsek je hned pevná cesta stupně `wagon` – sjízdná, terén upravený, kácení hotové
  (jako úseky [zemské stezky](trade.md)); napojí se na staré cesty a rozcestí a se sousedním
  hotovým úsekem se spojí do jednoho. Po posledním úseku kronika „Vozová cesta postavena“.
- **Use-case** `buildWagonRoad`, server action `buildWagonRoad({ villageId, roadId })` (kterýkoli
  úsek cesty hráče).

### Výšky terénu jako herní data

[landscape.md](landscape.md) – Úpravy terénu. Úpravy jsou čistá funkce stavu vsi: profil vozových
cest → `groundHeightAt(x, z)` (jen deterministická matematika, stejně na serveru i v prohlížeči).
Terén pěšin a vozové sítě bere upravené výšky **hotových úseků** – po úvozu vůz jede rovně
a sklon pláně platí i pro chůzi; scéna ukazuje rozestavěné podle průběhu. Ves bez vozové cesty se
nemění ani o bit.

### Co hráč vidí

- Terén se v úvozu skutečně sníží a v náspu zvedne – stromy, keře, postavy, zvířata, vozy i
  výběr (pick terénu) sedí na upraveném terénu.
- Pás 3,5 m udusané hlíny se štěrkem a kameny v kolejích; svahy úvozu a náspu holá hlína, která
  za **6 let** zaroste trávou (rozhodnutí Clauda). Pařezy v průseku.
- Vytyčení nehotové části stavby a náhledu trasy kolíky a provázkem.
- Ukázka na `/dev/landscape` – **Vozová cesta**: krátký prudký svah na obchodní cestě (rovně
  úvozem 2,6 m a náspem 1,9 m, 150 → 167 m, sklon 16 % → 6 %, 698 čd) a dlouhý svah, který se
  srovnat nedá (serpentina, 120 → 174 m, 12 % → 6 %, 124 čd); stadia náhled, stavba 50 %, hotová,
  po 8 letech.

### Vlkov

Kopie stavu (den 109 947), 22 úseků. Plán jedné cesty na serveru 3–620 ms (nejdelší 372), náhled
v prohlížeči stejnou funkcí 0,1–0,3 s – trasa i cena vyjdou bit po bitu stejně (krajina
s přesností prohlížeče). Co nejpříměji (od 20. 10. 2026; v závorce dřívější nejlevnější trasa):

| Cesta | Stará → nová               | Sklon     | Úvoz / násep                | Výkop / násep | Práce            | Stromy | Jízda vozu           |
| ----- | -------------------------- | --------- | --------------------------- | ------------- | ---------------- | ------ | -------------------- |
| 372   | 1216 → **1200 m** (1399 m) | 14 → 6 %  | **0,8 / 1,0 m** (0,1 / 0,1) | 393 / 690 m³  | 1255 čd (818 čd) | 61     | neprojede → 16,9 min |
| 431   | 663 → **622 m** (686 m)    | 7,2 → 6 % | 0,2 / 0,1 m                 | 99 / 84 m³    | 363 čd (310 čd)  | 19     | 10,5 → 9,5 min       |
| 329   | 602 → **574 m** (614 m)    | 6,6 → 6 % | 0,2 / 0,2 m                 | 74 / 83 m³    | 491 čd (338 čd)  | 54     | 10,2 → 8,5 min       |
| 432   | 428 → **432 m** (441 m)    | 7,1 → 6 % | 0 / 0 m                     | 30 / 31 m³    | 156 čd (155 čd)  | 0      | 7,8 → 6,3 min        |

Krátké cesty mezi domy (4 a 417) by vedly velkou oklikou, okruhy a cesty pod 15 m úpravu nemají.
Nové trasy jsou kratší než staré cesty i než dřívější nejlevnější trasy a vedou rovně přes
kopce; úvoz a násep vzniknou, kde stará cesta stoupala nad 6 % (372 – sklon 14 %, úvoz 0,8 m,
násep 1 m). Na mírném terénu Vlkova (staré cesty 6,6–7,2 %) stačí srovnat pláň do 0,2 m. Cena
je vyšší (372 o polovinu – zemní práce), jízda o 3 minuty kratší. Stavba 431 trvá ≈ 30 dní,
372 ≈ 100 dní; dopočet vsi během stavby se nezpomalí (síť se přepočítá jen po dostavění úseku).
Stará cesta po ose nové (přímý kus staré cesty) zmizí hned po dostavění úseku – souběžné kusy se
vyříznou jako při roční kontrole, odbočky staré cesty zůstanou a napojí se v rozcestí.

**Kam dojede čtyřkolák:** od 20. 10. 2026 po louce a strništi kamkoli (wagons.md – Co se vozí
a na čem) – k 84 % plochy polí Vlkova (dvoukolák 84,5 %); vozová cesta mu otevře hlavně svahy,
kudy stará cesta vedla prudčeji než 10 % (po vozové cestě 372 85,3 % místo 84,3 %). Dřív, jen po
pevných cestách, dojel ke 4 %.

### Rozhodnutí

| Rozhodnutí                                                                                              | Kdo                     |
| ------------------------------------------------------------------------------------------------------- | ----------------------- |
| Cesta upravená pro vůz – větší rychlost, zpevněné koleje, co nejpřímější trasa s úvozy a náspy          | Martin                  |
| Stará cesta pro pěší zůstane, nepoužívané kusy zarostou                                                 | Martin                  |
| Rozhoduje hráč v panelu cesty – trasa a cena, potvrzení                                                 | Martin                  |
| Vůz 2,2, pěšky 1,7, mokřina jako hať, brod zůstává; šířka 3,5 m                                         | návrh Clauda, schválený |
| ~~Trasa: nejlevnější součet stavby a jízdy za 10 let~~; sklon 6 %, úvoz a násep 3 m; zákazy vozové sítě | návrh Clauda, schválený |
| „Co nejpříměji“ – přímá trasa má přednost, svah se srovná úvozem nebo náspem do 3 m, oklika jen nad mez | Martin                  |
| Metr délky v hledání 25 čd (víc než metr nejhlubšího úvozu); narovnání trasy na přímé úseky s profilem  | návrh Clauda            |
| Zemní práce 0,5 čd/m³, zpevnění 0,3 čd/m, svahy 1 : 1, hlína z úvozu do náspu, stavba od vsi ven        | návrh Clauda, schválený |
| Úpravy terénu jako herní data (jen profil osy), sítě i scéna z nich                                     | návrh Clauda, schválený |
| Zatáčení o 2 z 16 směrů na krok, změna směru 0,5 čd, okno hledání kolem staré cesty                     | rozhodnutí Clauda       |
| Uložení 0,2 čd/m³ a převoz 0,15 + 0,15 na 100 m (koše a nosítka) – rozpad ceny zemních prací            | rozhodnutí Clauda       |
| Oklika mezi stavbami (> 3× a + 60 m při staré cestě do 6 %) – úprava se nenabídne                       | rozhodnutí Clauda       |
| Pláň 5,5 m (vozovka a krajnice), u staveb a vody jen co se vejde, brody bez úprav                       | rozhodnutí Clauda       |
| Kácení i pod zemními pracemi mimo les; pařezy průseku nedorostou                                        | rozhodnutí Clauda       |
| Sítě (pěšiny, vozy, chůze) berou terén hotových úseků, scéna podle průběhu                              | rozhodnutí Clauda       |
| Trasa se plánuje na krajině s přesností prohlížeče – náhled a stavba stejně                             | rozhodnutí Clauda       |
| Stará cesta po ose vozové zmizí hned po dostavění úseku; posvátný strom nepustí trasu ani u konce       | návrh Clauda            |
| Úseky ≈ 60 m; vozová cesta nezarůstá, neřeže se souběhem, konce se nenapojují samy                      | rozhodnutí Clauda       |
| Svahy zarostou trávou za 6 let                                                                          | rozhodnutí Clauda       |

## Na stavitelích

- Výpočet sítě je v herním jádru (`domain/village/paths/`), volá ho simulace (roční síť) i scéna
  (pěšiny dne) – herní logika jednou. Pevné cesty: `paths/roads.ts`, stromy `road-trees.ts`.
- Stav vsi má pevné cesty, jejich stromy a roční součty práce po místech; staré vsi začnou bez
  pevných cest (vzniknou do dvou let). Jabloně jsou v `VillageRoads.apples` (chybí = žádné).
- Pořadí implementace: (1) pevné cesty a stromy – **hotovo**, (2) výběr, vylepšení a chůze –
  **hotovo**, (3) jabloně – **hotovo**, (4) vozová cesta – **hotovo** (`wagon-road.ts`,
  `paths/wagon-route.ts`, `paths/earthworks.ts`; zemní práce ve stavu `VillageRoads.earthworks`).
- **Nový systém cest** (22. 10. 2026): plán
  [2026-10-23-roads-v2.md](../superpowers/plans/2026-10-23-roads-v2.md).
