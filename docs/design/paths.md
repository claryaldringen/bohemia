# Pěšiny, trasy a vznik cest

Stav: **nový systém cest** – Martin 22. 10. 2026 (GitHub issue #6 a body z #3), převod starých
vsí Martin 23. 10. 2026. Čísla a podrobnosti jsou návrh Clauda – Martin 22. 10. 2026: čísla
(jak rychle cesty vznikají a zarůstají) zvolí Claude sám, bez čekání na schválení. Plán
implementace: [2026-10-23-roads-v2.md](../superpowers/plans/2026-10-23-roads-v2.md). Druhy
cest, vylepšení, zarůstání podle druhů a vozová cesta: [roads.md](roads.md) – Nový systém cest.
Revize 23. 10. 2026 po recenzi plánu a změnách v kódu téhož dne (ulička mezi ohradami, vůz přes
zaseté pole, deník jízd vozů, zrušení stavby, Vlkov – pozemek přes cestu): provozní pole v paměti,
trasy staré vsi při načtení, převod po krocích, stavba přes cestu.

Starší rozhodnutí, která platí dál: pěšiny ovlivňují práci (Martin 18. 10. 2026: „Tam, kde bude
vyšlapaná cesta, ať se chodí o něco lépe než tam, kde není.“), vzhled pěšin (Martin 19. 10. 2026:
„denní pěšina ať je nevýrazná. Vyšlapanou cestu nechme jako teď“), po cestě bez ohledu na povrch
(Martin 19. 10. 2026: „Když už někde vyšlapaná cesta je, ať po ní lidé chodí bez ohledu na to, na
čem ta stezka leží.“), vchody (Martin 19. 10. 2026: „A ještě, každá budova by měla mít nějaký
vchod, od kterého cesta povede.“), pro vodu se chodí vždy (Martin 19. 10. 2026, návrh schválil
„Ano“). Co nový systém nahradil, je v [Nahrazená pravidla](#nahrazená-pravidla-22-10-2026).

## Proč (Vlkov, Martin 22. 10. 2026)

- K vodě vedou dvě souběžné cesty. Vozová cesta z úpravy „Upravit pro vozy“ šla rovně vedle staré
  upravené. Stará zmizela jen u vsi, kde se obě kryly, a zbytek nikdy nezaroste, protože upravené
  cesty nezarůstají. Provoz simulace jde přitom celý po vozové.
- Postavy pro vodu chodí po staré cestě, i když simulace počítá provoz po vozové. Simulace a scéna
  tak docházejí k různým výsledkům.
- Denní pěšiny jsou vidět roky, ale nikdy se z nich nestane vyšlapaná cesta.
- Kulaté křižovatky vypadají špatně.
- K brance hřbitova nevede žádná cesta, cesta jde jen podél plotu.
- Ve Vlkově vznikají krátké pahýly cest, třeba vyšlapaná cesta 10 m, které nikam nevedou, nikdo po
  nich nechodí a jen kvůli nim vzniká zbytečná křižovatka.

Příčiny (rozbor Clauda): scéna hledala trasy postav vlastním hledáním po čarách pěšin
(`path-router.ts`) a síť pěšin počítala z dnešní práce, simulace z ročního průměru – dvě
rozhodnutí. Pěšiny dne si nic nepamatovaly a pevná cesta vznikala z jiné veličiny (roční síť,
3 cesty denně dva roky po sobě na stejném místě). Vozová cesta vedla vlastní trasou. Rozcestí byl
kruh kolem společného bodu. Plot hřbitova a ohrady byl jen drahý (15×), ne neprůchodný.

## Pravidla (Martin 22. 10. 2026)

1. **Kudy se chodí:** nejrychlejší cestou. Když je přes louku výrazně rychleji než po cestě, jde
   se po louce.
2. **Jedno rozhodnutí:** kudy lidé chodí, určuje jen simulace. Postavy ve scéně ji zobrazují.
3. **Vznik:** cesty zakládají jen lidé tím, kudy chodí, hráč je nezakládá ani neruší. Pěšina, po
   které se dost chodí delší dobu, se stane cestou. Nemusí přitom ležet každý rok přesně na
   stejném místě.
4. **Zánik:** cesta, po které se nechodí, postupně zaroste a zmizí. Platí to pro každou cestu,
   i upravenou a vozovou, jen pro ty pomaleji.
5. **Druhy cest:** pro chodce jsou vyšlapaná a vyježděná cesta stejné a stejně tak upravená
   a vozová; upravená cesta zrychluje i vozy; stromy a jabloně u cesty zrychlují všechny druhy
   o svůj koeficient.
6. **Vozová cesta:** vznikne ze staré pěší cesty a vede po ní. Narovná se jen tam, kde pěší cesta
   kličkovala do svahu, pokud to jde, a obejitý kus staré cesty zaroste. Náspy a úvozy musí být
   výrazně vidět.
7. **Hať a lávka** se postaví samy jako součást úpravy cesty: hať přes mokřinu, lávka přes brod.
   Lávka zůstává jako dnes, jen pro pěší.
8. **Hráč** jen vylepšuje existující cesty (upravená, vozová) a zakládá zemskou stezku
   k sousedům, ta zůstává jako dnes.
9. **Křižovatka:** samostatný objekt, který jde označit; buď kříž se 4 vchody, nebo Y se
   3 vchody; natočená tak, aby cesty co nejlépe navazovaly, a cesty vedou přesně do jejích
   vchodů; kousek bokem stojí náhodně strom, velký vztyčený kámen nebo dřevěný kůl, jednou
   vylosované to zůstane; víc než 4 cesty se nečekají, kdyby se sešly, vzniknou dvě křižovatky
   kousek od sebe; kulaté plácky zmizí.
10. **Vchody budov:** ke každé stavbě, kam se chodí, vede cesta až k jejímu vchodu, i když se tam
    chodí málo, třeba k hřbitovu jen na pohřby.
11. **Každá cesta vede odněkud někam:** od vchodu budovy, křižovatky nebo kraje mapy k jinému
    takovému místu. Pahýly bez cíle nevznikají, a když po dělení a spojování cest nějaký zbude,
    sloučí se se sousední cestou nebo zmizí. Křižovatka vznikne, jen když se opravdu potkají tři
    nebo čtyři cesty, po kterých se chodí. Na jednom místě se nesmí potkat několik kusů cesty,
    které jsou pro hráče jedna a táž cesta.

Z issue #3 (Martin 22. 10. 2026): „Pokud vesničané upravují cestu, chci je na té cestě vidět
pracovat.“ a „Lidi nesmí chodit přes ohrady. Vždyť jsou oplocené.“ – ohrada je překážka pro chůzi,
dovnitř se chodí jen brankou, kdo tam má práci.

Převod (Martin 23. 10. 2026): staré cesty se při načtení **převedou jednou a idempotentně** do
nového systému – upravené a vozové zůstanou, souběžné se sloučí, pahýly zmizí, nepoužívané začnou
zarůstat. Ne zahodit.

Mimo rozsah: zemská stezka ([trade.md](trade.md)) se nemění.

## Přehled – jedna veličina od kroku po cestu

Návrh Clauda – architektura:

1. **Trasy** (simulace): kdo kam chodí a kudy – jedna trasa na domácnost a cíl, cesty za den.
   Počítá je simulace a **ukládá je do stavu vsi** jako data. Scéna je jen čte (pravidlo 2).
2. **Vyšlapanost** (simulace): kudy trasy vedou, tam se tráva prošlapává; kde se nechodí, dorůstá.
   Jedno číslo na políčko 7,5 m ve stavu vsi. Pěšina, kterou hráč vidí, je vyšlapanost podél tras.
3. **Vznik cesty:** kde vyšlapanost podél trasy dosáhne prahu, vznikne vyšlapaná cesta – celá od
   kotvy ke kotvě (vchod, křižovatka, kraj mapy, cíl), nikdy pahýl.
4. **Stav cesty a zarůstání:** pevná cesta má po kusech stav, který provoz udržuje a bez provozu
   klesá podle druhu cesty; na nule kus zmizí.
5. **Síť:** po každé změně cest jeden úklid v pevném pořadí – souběžné cesty, díry, spojení,
   pahýly, cesty k vchodům a křižovatky.

Viditelná pěšina je tak cesta ve vzniku: kudy se chodí dost, z pěšiny se cesta stane; kudy málo,
pěšina zůstane slabá nebo zmizí. Pěšina „vidět roky“ bez cesty už nastat nemůže – pěšina je vidět
jen tam, kde vyšlapanost roste, nebo kde dorůstá tráva (pak zmizí).

## Trasy – kudy se chodí

### Kdo kam chodí

Beze změny proti dřívějšku (Martin 18.–19. 10. 2026, čísla návrh Clauda):

- **Pochůzky domácností:** voda podle lidí v domácnosti, vždy k nejbližší vodě (Pochůzky pro
  vodu), dřevo na domácnost (v zimní půlce roku víc, nad 130 m chůze úměrně méně, nejvýš 450 m),
  ke hřbitovu 0,15 cesty za den na člověka k nejbližšímu hřbitovu, k nejbližšímu posvátnému dubu,
  háji, modle, svatyni a sadu, k sousedům na kraj mapy.
- **Práce dne:** pole, sad, stavby, kácení, ohrady (krmení), louky v době seče, stáda na úhor –
  jeden člověkoden = jedna cesta; zavedená místa (pole, sad, ohrada, posvátná místa, hřbitov)
  mají základ cest navíc, ať trasa mezi pracemi nezmizí.
- **Nově – pohřby:** pohřební průvod je cesta od obydlí zemřelého k brance hřbitova (návrh Clauda
  – pravidlo 10 jmenuje hřbitov „jen na pohřby“; dřív průvod šel jen ve scéně).

### Cena chůze

- **Ceny buněk** mřížky terénu pěšin (≈ 3,75 m, 8 směrů) jsou 1 / rychlost chůze proti louce –
  tabulka v [roads.md – Rychlejší chůze](roads.md#rychlejší-chůze-martin--efekt-vylepšení):
  louka 1, díl v osevu 0,5, strniště 0,8, mokřina 0,5, pěšina až 1,3 podle vyšlapanosti,
  vyšlapaná a vyježděná cesta 1,5, upravená a vozová 1,7, stromy u cesty +0,03, jabloně +0,05.
  Les, svah, křoviny a překážky krajiny jako dřív (`walk-speed.ts`, `PATH_WALK`, `FIELD_WALK`,
  `ROAD_WALK`). Po pevné cestě bez ohledu na povrch pod ní (Martin 19. 10. 2026 – [roads.md –
  Cesta je cesta](roads.md#cesta-je-cesta--povrch-pod-ní-a-zarůstání)).
- **Zvyk – „výrazně rychleji“ (pravidlo 1, návrh Clauda):** pro výběr trasy stojí buňka mimo
  pevnou cestu navíc **× 1,25**, na pěšině úměrně méně (× 1 + 0,25 × (1 − síla pěšiny)). Přes
  louku se tedy jde, jen když ušetří **víc než 20 % času** proti cestě (1,25 × čas přes louku <
  čas po cestě). Příklad: po cestě 500 m (333 s chůze při 1,5×), přes louku 400 m – 400 s,
  s přirážkou 500 s > 333 s, jde se po cestě; přes louku 250 m – 312 s < 333 s, jde se přes louku.
  Důvod: lidé se drží známé cesty (suchá, bez keřů, ví se, kam vede) a malá zkratka za to nestojí;
  20 % je zřetelně víc než rozdíl, který člověk na krátké trase odhadne. Zvyk je jen pro výběr –
  čas chůze pro práci se počítá skutečnými rychlostmi.
- **Ploty jsou neprůchodné (Martin 22. 10. 2026, #3):** plot ohrady a hřbitova a svatyně (celá její plocha,
  nejen příkop; staveniště je průchodné)
  jsou zeď – trasa vede jen vchodem (brankou). Dovnitř jde jen trasa toho, kdo tam má práci
  (krmení v ohradě, pohřeb a návštěva hřbitova) – končí v brance; práce uvnitř je pohyb postav od
  branky. Dřív stál plot 15× louku (`PEN_COST`, `CEMETERY_COST`) a trasy přes ohradu šly.
  Staveniště plotu (rozestavěná ohrada a hřbitov) zůstává průchozí jako dřív.
- **Ulička mezi ohradami (Martin 23. 10. 2026 – [oxen.md](oxen.md), Plot ohrady podle délky):**
  plot stojí 1,5 m uvnitř čtverce, mezi sousedními ohradami (i hřbitovem) zůstává ulička 3 m, kterou
  projde chodec i vůz. Neprůchodné jsou buňky uvnitř plotu podle téže funkce jako u vozů
  (`fencedCells`); natočená ohrada blokuje jen buňky celé uvnitř. Žádná druhá geometrie plotu.
- **Šikmá cesta v mřížce (návrh Clauda):** vůz má pevnou cestu jako pás kolem osy
  (`ROAD_BAND_CELLS`) a smí úhlopříčkou z buňky cesty na buňku cesty (Vlkov 23. 10. 2026 – šikmá
  cesta lesem nebyla sjízdná). Trasa chodce po šikmé cestě lesem nebo polem nesmí spadnout mimo
  ni – ověří Úloha 2, jinak týž pás.
- **Slévání:** domácnosti jdou ke společnému cíli zvlášť, nejvytíženější první; čerstvě
  prošlapané buňky a vyšlapanost zlevní (až 1,3×), takže se další trasy přidají ke kmeni –
  souběžné pěšiny nevznikají (Martin 18. 10. 2026: „Pokud už cesta vede tím směrem, lidé by měli
  použít tu, ne si prošlapat vlastní souběžnou.“). Dvě kola jako dřív.

### Kdy se trasy počítají a co se ukládá

- **Přepočet** jako dřív přepočet chůze: když se změní rozložení vsi (`walkLayoutKey` – obydlí,
  stavby, pole, cesty, ohrady, stáda, kdo kde bydlí), stadia dílů jen 1. dne v měsíci
  (`walkStageKey`). Nově i když se změní pevné cesty měsíční kontrolou. Výsledek nezávisí na
  kouscích dopočtu (rozhodují dny změn, ne kousky).
- **Uložení (návrh Clauda):** `VillageState.routes` – den výpočtu, otisk rozložení a seznam tras:
  odkud (vchod obydlí nebo stavby), kam (cíl – `field:<id>`, `water`, `wood`, `cemetery:<id>`,
  `edge:<směr>`…), účel, cesty za den (setiny) a **buňky trasy** jako řetězový kód (počáteční
  buňka a kroky po 8 směrech, 3 bity na krok, base64). Ve Vlkově odhadem 150–300 tras × ≈ 100
  kroků ≈ 10–20 kB. Trasy pod 0,02 cesty za den se neukládají (jako dřív `MIN_TRIP`).
- **Stará ves bez tras** (nebo s jiným otiskem) si je spočítá **při načtení** (`withRoutes`
  v `updateVillage`), i když se jen zobrazuje – scéna má trasy vždy a postavy nestojí.
- **Podrobnosti uložení (návrh Clauda, 24. 10. 2026):** lichý počet kroků končí znakem `=`
  (poslední znak nese jen jeden krok). Účel trasy: pole, sad, stavby, ohrady, kácení a seč –
  práce; hřbitov a posvátná místa – návštěva (rozestavěný hřbitov bez branky také); stáda na
  úhor – stádo. Stará ves dostane trasy po dopočtu do dneška ze sítě posledního dne, bez posunu
  dne – co se dopočtem přepočítalo, už má trasy svého rozložení a znovu se nepočítá.
- **Do prohlížeče** jdou trasy a vyšlapanost jen při změně jejich klíče (`routes.key`, den
  vyšlapanosti); jinak prohlížeč drží poslední. Mez velikosti platí pro stav v databázi.
- **Proč ukládat, ne počítat znovu v prohlížeči:** scéna dřív počítala síť sama z dnešní práce,
  simulace z rozložení při poslední změně – dva vstupy, dva výsledky. Uložená trasa je jedno
  rozhodnutí bez ohledu na to, co prohlížeč ví. Prohlížeč navíc ušetří hledání (A\* po mřížce).
  Vývojové stránky bez serveru počítají trasy stejnou funkcí jádra.
- **Z tras se dopočítá:** osa trasy ve světě (středy buněk, vyhlazení `smoothPathLine` – stejné
  na serveru i v prohlížeči), tempo úseků (podle druhu cesty pod osou), provoz po buňkách,
  čáry pěšin pro scénu (`extractLines` z provozu tras) a vzdálenost chůze pro práci.

### Jedno rozhodnutí (pravidlo 2)

- **Postavy** pro vodu, dřevo, na pole, ke hřbitovu, k posvátným místům, do ohrad a k sousedům
  jdou po uložené trase své domácnosti a cíle – od vchodu domu po trase k cíli, tempem podle druhu
  cesty. Na díl uprostřed pole dojdou po trase k poli a dál přes pole (jako dřív `fieldPath`).
  Vlastní hledání tras ve scéně (`path-router.ts`) zmizí.
- **Krátké pohyby** postav, které simulace nepočítá (přejít k sousednímu dílu, obejít dům,
  postavit se k práci), zůstávají ve scéně – nesmí ale vést přes plot ohrady ani hřbitova
  (Martin 22. 10. 2026, #3), dovnitř jen brankou.
- **Vzdálenost chůze pro práci** (díly pole, sad, palivo, voda) se měří po tytéž čarách tras
  a pevných cestách jako dřív (`walking.ts`) – čáry jsou nově z uložených tras.
- **Vozy** jezdí jako dřív po trasách vozové sítě ze stejné funkce na serveru i v prohlížeči
  (`villageCartRoutes`). Voda vozem je už uložená (`VillageState.waterCart`, scéna ji čte přes
  `storedWaterCartDrive` – totéž co simulace); uložení ostatních tras vozů je zjednodušení na
  později. Jízdy vozů zapisuje do provozu cest a pošlapání úrody jediné místo – denní deník jízd
  (`CartTripLog`, `flushCartTrips`).

## Vyšlapanost a vznik cesty

Návrh Clauda (pravidlo 3: „Pěšina, po které se dost chodí delší dobu, se stane cestou. Nemusí
přitom ležet každý rok přesně na stejném místě.“):

- **Vyšlapanost** je číslo na políčko **7,5 m** (2 × 2 buňky terénu pěšin) v souřadnicích světa –
  nezávisí na okně sítě, které se s novými stavbami mění. Ve stavu řídce (jen nenulová políčka,
  celá čísla v setinách) – Vlkov odhadem 1–3 tisíce políček ≈ 5–15 kB.
- **Den po dni:** každá trasa přidá na políčka, kterými vede, **a na sousední políčka** (± 1 –
  tolerance 7,5–11 m, ať se trasa, která se mezi roky posune, sčítá dál) své cesty za den, každé
  políčko jednou na trasu. **Tráva ubere 1 cestu za den** (dorůstá). Vyšlapanost je mezi 0
  a **1 500**. Jízda vozu se počítá za 2 cesty (vůz udusá víc). Čísla jsou v cestách, kód je
  drží v setinách (1 000 = `WEAR.roadAt` 100 000).
- **Počítá se po intervalech**, ne každý den: mezi dvěma dny změny tras (přepočet, 1. den v měsíci)
  je provoz stálý, takže změna = (provoz − 1) × dny, oříznutá na 0 a 1 500 – přesně jako den po dni,
  celými čísly (deterministicky, nezávisle na kouscích dopočtu). Práce dne (pole, stavby) se do
  intervalu bere ze skutečně odvedené práce po místech (`VillageRoads.labor`, sčítá se denně), ne
  z jednoho dne – přesně jako dřív roční součty.
- **Provozní pole (výkon):** provoz tras po políčkách (i se sousedy) se spočítá jednou pro každou
  sadu tras (`routes.key`) a drží v paměti, ne ve stavu. Interval pak projde jen políčka s provozem
  nebo s vyšlapaností – jinak by se při dopočtu desítek let (intervaly po dnech, kdy se ves mění)
  trasy razítkovaly znovu a znovu. Z téhož pole bere provoz i stav kusů cest (Zarůstání).
- **Trasy za prací (návrh Clauda, 24. 10. 2026):** trasy s účelem práce (pole, sad, stavby,
  ohrady, kácení, seč…) nesou v intervalu skutečně odvedenou práci (`wear.labor`, 1 cesta na
  člověkoden), rozdělenou po trasách k cíli podle jejich cest za den; práce dne, kdy se trasy počítaly, se
  do vyšlapanosti nepočítá – jinak by se práce jednoho dne počítala celý interval. **Stálá část**
  cest (`StoredRoute.base` – chůze na zavedené místo: pole 1,6 cesty za den, ladem 0,4, sad,
  ohrada, vchod stavby, staveniště) vyšlapanost nese celou dobu, jako každá jiná trasa („ke každé
  stavbě, kam se chodí, vede cesta“ – Martin, #6), a práce z `wear.labor` se přičte navíc; trasy
  bez `base` (starší stav) mají stálou část 0. Provoz kusů cest (`trafficAt`, zarůstání) je u tras
  za prací vždy celé `trips`. Zjednodušení: nošení uhlí, rudy a hlíny se počítá 1 cestou na
  člověkoden; práce bez pěší trasy (celá ves, vůz pro vodu) se nepočítá. Práce intervalu se
  přičte před chůzí a dorůstáním (ořez na strop, pak na 0 a strop); zlomky podílů práce po
  políčkách se zaokrouhlují dolů (až 1 setina na políčko a interval).
- **Pěšina, kterou hráč vidí**, jsou čáry tras se silou = vyšlapanost / 1 000 (nejvýš 1), od
  vyšlapanosti 50; vzhled jako dřív pěšina dne (nevýrazná: pás 0,6–1,2 m, krytí 0,2–0,45 – Martin 19. 10. 2026). Nová pěšina tak začíná slabě a sílí, až se z ní stane cesta.
- **Cesta vznikne**, když vyšlapanost podél trasy dosáhne **1 000**. Měsíční kontrola (1. dne
  v měsíci) vezme čáry tras s vyšlapaností nad prahem mimo pevné cesty (do 5 m od osy jde trasa po
  cestě) a z nich udělá vyšlapanou cestu – **jen celou od kotvy ke kotvě** (Síť – kotvy níž):
  horký kus se po čáře trasy prodlouží oběma směry k nejbližší kotvě nebo pevné cestě, pokud
  vyšlapanost na prodloužení neklesne pod 500; jinak počká na další měsíc. Kratší než 15 m cestou
  není (jako dřív). Souběžnou cestu (do 12 m stejným směrem) vznik nehlídá – sloučí ji úklid
  (Síť, krok 1; návrh Clauda, 24. 10. 2026): trasy se k cestám samy stahují (zvyk, sleva), takže
  souběžná vyšlapaná pěšina skoro nevzniká, a objížďka stavby přes cestu (níž) souběžná být smí.
- **Kolik to trvá** (vyšlapanost roste o provoz − 1 za den):

  | Cest za den | Cesta vznikne za      | Příklad                                 |
  | ----------- | --------------------- | --------------------------------------- |
  | pod 1       | nikdy (tráva dorůstá) | jedna domácnost pro dřevo v létě (0,5)  |
  | 2           | 1 000 dní ≈ 2,7 roku  | ves 13 lidí ke hřbitovu (13 × 0,15 ≈ 2) |
  | 3           | 500 dní ≈ 1,4 roku    | dřívější práh (3 cesty dva roky)        |
  | 10          | 111 dní ≈ 4 měsíce    | Vlkov pro vodu (24 lidí × 0,4 = 9,6)    |
  | 30          | 34 dní                | kmen od vsi k polím v žních             |

  Důvod čísel: práh 1 000 drží dřívější tempo (3 cesty denně ≈ 1,5–2 roky) a silný provoz dá cestu
  za sezónu, jak to v krajině chodí; ubírání 1 cesty denně odpovídá tomu, že tráva vyšlapanou
  stopu po jedné chůzi denně do týdnů zacelí (pastviny a meze). Strop 1 500 znamená, že nepoužívaná
  pěšina zmizí nejvýš za 4 roky.

- **Vyježděné cesty:** jízdy vozů jdou do téže vyšlapanosti (× 2) – jednou ročně 1. 11. z ročního
  součtu jízd, který plní jen `flushCartTrips`, podél tras roční sítě vozů (návrh Clauda – trasy
  vozů se neukládají a roční síť se počítá tak jako tak). Příznak vozová (vyježděná) dál dostane kus
  cesty, kudy vozy jezdí – roční kontrola 1. 11. podle provozu vozů (wagons.md – Vyjeté cesty,
  `markCartRoads`, převzetí kusu `takeOverRoads`); samostatné zakládání vozových cest z kandidátů
  (`formCartRoads`) zmizí – vozová trasa mimo cesty vyšlape cestu jako lidé. Jízda přes osetý díl
  (Martin 23. 10. 2026: „Vůz smí přes zaseté pole“ – jen když jiná cesta není, úroda se pošlape) se
  počítá jako každá jiná: kudy vůz jezdit musí, tam vznikne cesta a vůz pak pošlapávat přestane.
- **Kronika** jako dřív: „Kudy se chodí léta, vyšlapala se pevná cesta.“

## Zarůstání (pravidlo 4)

Podrobně v [roads.md – Nový systém cest](roads.md#nový-systém-cest-22-10-2026). Stručně (návrh
Clauda): pevná cesta má **stav** po kusech ≈ 25 m. Provoz trasy po kusu ho udržuje, pod
udržovacím prahem druhu klesá; když dojde na nulu, kus zmizí. Vyšlapaná a vyježděná cesta bez
provozu zaroste za **5 let**, upravená (s hatí a lávkou) za **15 let**, vozová za **30 let**;
zemská stezka a cesta ve vylepšení nezarůstají. **Udržovací práh** (návrh Clauda, `ROAD_DECAY`):
vyšlapaná 1 cesta za den, upravená 0,5, vozová 0,25; stav kusu (plný = práh × roky × 365,25 dne) se
sčítá po týchž intervalech jako vyšlapanost. Opuštěná cesta (žádná trasa po ní celý měsíc) se vyřadí ze
sítě – není ramenem křižovatky ani cestou hráče – a jen bledne, dokud nezmizí; vrátí-li se na ni
provoz, ožije.

## Síť – kotvy, pahýly a úklid (pravidlo 11)

Návrh Clauda:

- **Kotvy** – místa, kde smí cesta končit:
  - **vchod stavby** (do 3 m) – brána obydlí, branka hřbitova a ohrady, předek modly a svatyně,
    vchody dílen a humna (`entrances.ts`);
  - **vchod křižovatky** (rameno – Křižovatky níž);
  - **kraj mapy** – kam vedou cesty k sousedům;
  - **cíl** – konec trasy, jejíž cíl nemá vchod (voda, dřevo, pole, sad, louka, pastva): bod, kde
    trasa končí, ± 7,5 m – břeh vody, okraj pole, sadu, lesa, louky nebo pastvy. Pravidlo 11
    jmenuje vchody, křižovatky a kraj mapy; cíl přidává Claude, protože cesta k vodě nebo na pole
    nemá vchod a končit musí (Vlkov – cesta k vodě). Zjednodušeno po recenzi (dřív „aspoň polovina
    cest končí do 25 m“).
  - Návrh Clauda (24. 10. 2026, Úloha 5): kotvy dá sama sada tras – trasa začíná v bráně domu
    a končí ve vchodu stavby (síť ji tam vede), u cíle bez vchodu nebo na kraji mapy. Vchod stavby,
    kam nikdo nechodí, kotvou být nemusí – cesta tam nevznikne. Kotvou je i pevná cesta (nová cesta
    se k ní připojí rozcestím).
- **Pahýl** je konec mimo kotvu a mimo jinou cestu. Nevznikne – nová cesta se zakládá jen od kotvy
  ke kotvě (Vyšlapanost a vznik cesty). Zbude-li po zarůstání, dělení nebo spojování, **zmizí**
  v nejbližším úklidu, bez ohledu na délku (křižovatka u něj se přepočítá a dvě zbylé cesty se
  spojí – „sloučí se se sousední cestou“; konec do 12 m od jiné cesty se k ní napojí jako díra).
  Výklad zadání (návrh Clauda, 24. 10. 2026; Martin, #6: „Pahýly bez cíle nevznikají, a když po
  dělení a spojování cest nějaký zbude, sloučí se se sousední cestou nebo zmizí.“): neplatí žádná
  výjimka podle délky ani podle toho, že tudy vede trasa – kus, jehož konec není u kotvy, mizí
  celý až k nejbližšímu uzlu. **Upravená a vozová cesta** (hráč do ní investoval) mizí jen
  pomaleji (Martin, #6: „Platí to pro každou cestu, i upravenou a vozovou, jen pro ty pomaleji“):
  zarůstá podle `ROAD_DECAY`, nezkracuje se.
- **Úklid** po každé změně cest (měsíční kontrola, dostavěné vylepšení, převod) v pevném pořadí:
  1. **souběžné cesty a copánky** – dnešní pravidla ([roads.md – Úseky a
     rozcestí](roads.md#úseky-a-rozcestí): do 12 m stejným směrem, kus od 25 m; copánek mezi
     stejnými uzly do 25 m, krátký vzdálený kus se toleruje – níž); silnější je vyšší druh, pak víc provozu, pak starší – vozová
     a upravená cesta tak pohltí souběžnou vyšlapanou (Vlkov – voda);
  2. **díry** do 14 m mezi konci a cestou se zacelí (jako dřív);
  3. **uzly se dvěma konci** se spojí do jednoho úseku (jako dřív `mergeRoadChains`, různé druhy
     zůstanou úseky jedné cesty hráče);
  4. **pahýly** (výš);
  5. **cesty k vchodům** (Vchody níž);
  6. **křižovatky** (níž).
- **Jedna cesta hráče se v uzlu nepotká sama se sebou** (pravidlo 11): ramena křižovatky patří
  různým cestám hráče. Dva úseky mezi stejnými uzly jsou copánek (krok 1) a okruh přes jednu
  křižovatku se rozdělí v nejvzdálenějším bodě na dvě cesty hráče.
- Návrh Clauda (24. 10. 2026, Vlkov – voda, copánek s krátkým vzdáleným kusem): slabší úsek smí od
  silnějšího odběhnout nad 25 m souvisle nejvýš max(25 m, 8 % své délky) a nejdál 50 m – oblouk
  kolem překážky je pořád ta samá cesta, jinak by copánek unikl o pár metrů (496 vs. 509: 26,6 m
  na ≈ 10 m). Delší nebo vzdálenější kus = dvě cesty. Jabloně smazaného úseku přecházejí na
  silnější cestu bez omezení dosahu (jsou u téže trasy, nezanikají).
- Návrh Clauda (24. 10. 2026, Úloha 8):
  - úklid běží v měsíční kontrole, jen když se od minulého úklidu změnily cesty, nebo když nové
    kotvy a trasy dají práci (pahýl, díra, okruh, vchod bez cesty) – bez změny nic, žádná nová id;
  - **upravená a vozová cesta** (postavil je hráč – Převod: „upravené a vozové zůstanou“) se jako
    pahýl neodstraňuje; upravený kus kratší než 15 m zmizí, delší zůstane a zarůstá podle druhu;
  - vyšlapaný pahýl zmizí vždy, i delší než 30 m a i když po něm vede trasa (stará cesta oklikou
    u vozové cesty zůstává, jen když oba konce leží u kotev nebo na jiných cestách);
  - kraj mapy je kotva v pásu od okraje terénu pěšin (10 m) po konec zemských stezek k sousedům
    (`TRAIL.edgeBandM` 20 m) a ještě 7,5 m tolerance – cesty k sousedům tam končí;
  - vchod, který cestu nedostane (spojka by byla kratší než 3 m), nespouští úklid každý měsíc –
    `accessDue` počítá tutéž cestu jako `accessRoads`;
  - konec úseku se díře nepřipojí zpět do uzlu, ze kterého úsek vychází (vznikal okruh tam a zpět);
    malý okruh se rozdělí a zmizí jako copánek a pahýl.
  - Vchod má cestu, i když kolem něj (do 3 m) vede pevná cesta, která v něm nekončí; cesta k vchodu
    smí být kratší než 15 m (spojka do branky, nejméně 3 m).

## Stavba přes cestu (Vlkov, Martin 23. 10. 2026)

Ve Vlkově vůz pro vodu nejezdil: oplocený pozemek polozemnice stál přes cestu od ohrady volů
a objížďka vedla přes ozim (Martin 23. 10. 2026 – [wagons.md](wagons.md), Vůz přes zaseté pole).
Nový systém přehrazení řeší sám (návrh Clauda):

- **Kus pod hotovou stavbou** (pozemek, ohrada, hřbitov, okrsek svatyně, dílna – vše, co je
  v mřížce chodců neprůchodné) je hned **opuštěný** – vypadne ze sítě a zaroste; zbytky cesty po
  obou stranách žijí dál, pokud po nich vede trasa.
- **Objížďka:** trasy (a vozy) obejdou stavbu nejrychlejší cestou kolem – uličkou, okrajem pole,
  loukou; vůz přes osetý díl jen když jinudy nejde. Vyšlapaná objížďka se stane cestou jako každá
  jiná a napojí se na zbytky staré cesty (kotva „jiná cesta“ – `joinPoint`, `splitRoad`). Kudy vede
  nová cesta, tudy pak jezdí i vůz a úrodu už nepošlapává.
- Nahrazuje „zrušit kus cesty pod stavbou může přijít později“ ([roads.md – Co platí
  dál](roads.md#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Branka nového obydlí do cizího
  pozemku dál nesmí (Vchody).

## Křižovatky (pravidlo 9)

Návrh Clauda:

- **Kdy:** v uzlu, kde končí **3 nebo 4 živé cesty** (každou vede trasa aspoň v udržovacím prahu
  jejího druhu – opuštěná ani pahýl se nepočítá). Dvě cesty křižovatku nemají (spojí se). Pět a víc
  se nečeká; kdyby se sešly, uzel se rozdělí na **dvě křižovatky 10 m od sebe** spojené krátkou
  cestou – ramena se rozdělí na dvě skupiny sousedních podle úhlu, každá skupina 2–3 ramena plus
  spojka.
- **Tvar:** **kříž** – 4 ramena po 90°; **Y** – 3 ramena: kmen a dvě větve souměrně kolem směru
  proti kmeni, každá větev o β = 30–60° (po 5°) od té osy (β = 60° je souměrné trojcestí po 120°,
  β = 30° klasické Y).
- **Natočení:** po 5°, aby součet čtverců odchylek ramen od směrů přicházejících cest byl nejmenší
  (směr cesty = od středu k bodu osy 12 m daleko; přiřazení ramen cestám – všechna pořadí, nejvýš
  24); při shodě menší úhel a menší β. Zemská stezka se neohýbá – je-li v uzlu, natočení se k ní
  přizpůsobí (její rameno přesně v jejím směru).
- **Vchody:** na konci ramene, **1,5 × šířka nejširší přicházející cesty** od středu (vyšlapaná
  1,9 m → 2,85 m, upravená 3 m → 4,5 m, vozová 3,5 m → 5,25 m). **Cesta vede přesně do vchodu:**
  posledních nejvýš **12 m** osy se nahradí obloukem od bodu 12 m daleko do vchodu s tečnou ve
  směru ramene (kubická Bézierova křivka – tečna ve směru osy na začátku oblouku i ve směru ramene
  ve vchodu, aby oblouk navazoval na obou koncích; body po 1 m, na cm; návrh Clauda 24. 10. 2026,
  Úloha 9a – kvadratická křivka by navazovala jen ve vchodu). Osa se tím u křižovatky změní – nahrazuje
  to dřívější „osa se nikdy nehýbe“ jen v tomto okolí. Kmeny hatě, místa na stromy a jabloně
  v ohnutém kusu zůstanou, kde jsou (do 2,2 m od nové osy místo zmizí).
- **Znamení:** při vzniku křižovatky se jednou vylosuje (seed vsi a místo uzlu zaokrouhlené na metry) **strom 40 %,
  vztyčený kámen 30 %, dřevěný kůl 30 %**. Stojí v nejširší mezeře mezi rameny, 1,5 m za
  vzdáleností vchodů od středu, natočení a podoba (druh stromu – dub, jilm, topol jako u cest;
  model kamene a kůlu ze 2 podob – zjednodušení po recenzi) z téhož losu. Zůstane, dokud křižovatka stojí – i když se změní
  tvar (kříž ↔ Y) nebo natočení; posune se jen do nejširší mezery. Strom roste jako strom u cesty
  (keř → mladý strom → plný za 40 let) a je to strom u cesty se vším (překážka stavby, kláda);
  zanikne-li křižovatka, strom stojí dál jako strom u cesty, kámen a kůl zmizí; vznikne-li v témže uzlu křižovatka znovu, dostane totéž znamení (los je podle místa) a stojící strom převezme, druhé znamení nevznikne. Kámen je pro
  stavbu překážka jako balvan, kůl jako keř.
- Návrh Clauda (24. 10. 2026, Úloha 9a – čisté funkce v `junctions.ts`):
  - **ve scéně (Úloha 12):** obrys křižovatky tvoří pásy ramen v šířce nejširší cesty a vnitřní
    rohy mezi rameny (kříž jako plus, Y jako tři pásy) – žádný kruh; kámen a kůl mají po dvou
    podobách modelu (rozmanitost dá natočení z losu); panel kříže se jmenuje Křižovatka, panel Y
    Rozcestí (jen v popisku portrétu), jinak jen ikony a čísla;
  - **tvar T** (rovná cesta a kolmá odbočka) vyjde podle nejmenšího součtu čtverců jako pootočené
    Y s β = 45° – odchylky 15°, 15° a 30° (1 350 °²); souměrné trojcestí s kmenem v odbočce by dalo
    30°, 0° a 30° (1 800 °²);
  - **pevná cesta** určí natočení přesně (mimo krok 5°); je-li pevných víc, vyhraje ta, se kterou
    jsou odchylky ostatních nejmenší, a další pevná navazuje rovným kusem (Úloha 9b);
  - **druhá pevná cesta** v uzlu (např. vozová cesta a zemská stezka) nemá rovný kus do vchodu:
    končí ve středu a přiřadí se k ramenu s nejmenší odchylkou (odchylka od původního návrhu, cesta
    pak nemusí vést přesně do vchodu; případ je vzácný);
  - **pět a víc cest:** spojka (`Road.link`) se drží jako živá, nezarůstá a neohýbá se; skupiny sousedních ramen jsou polovina a zbytek (u pěti 2 + 3) s co
    největšími mezerami na hranicích skupin; středy se posunou o 5 m ke svým ramenům;
  - **znamení:** los ze seedu vsi a štítku `junction-landmark:<x,z>` (uzel na metry) – druh, podoba (1–2), natočení
    po celých stupních a druh stromu podle podílů stromů u cest; při shodě dvou nejširších mezer
    rozhodne první od nejmenšího úhlu.
- Návrh Clauda (24. 10. 2026, Úloha 9b – zapojení do sítě):
  - **osa vede přesně do vchodu a odtud rovně po rameni do středu** – úseky křižovatky dál končí
    v jednom bodě (uzel sítě), takže úklid (spojení, pahýly, copánky, díry) se nemění; scéna
    kreslí rameno od vchodu dovnitř jako pás křižovatky. Oblouk (body po 1 m) se uloží
    zjednodušený jako ostatní osy cest (odchylka do 0,25 m) – každý bod osy zdražuje chůzi i vozy
    (Vlkov: s body po 1 m dopočet o 12 % pomalejší);
  - **živá cesta** = provoz kusu u křižovatky aspoň udržovací práh druhu, stejně jako u zarůstání:
    cesta, která končí ve vchodu stavby, kam se chodí, je živá (nezarůstá), zemská stezka a cesta
    ve vylepšení taky; opuštěná ne. Ramena se posuzují každý měsíc;
  - **neohýbá se** vozová cesta, zemská stezka, cesta ve vylepšení a úsek kratší než 12 m (spojka
    do branky – ohnul by se celý); jejich rameno leží přesně v jejich směru, druhá pevná cesta
    navazuje, jak je (rovný kus do vchodu zatím ne);
  - po přepočtu tvaru zůstane **strom znamení, kde roste** (strom se nestěhuje), kámen a kůl se
    posunou do nejširší mezery; místo se stromem do 2,2 m od nové osy zůstane;
  - plocha pod křižovatkou, kde se neorá: pásy ramen a spojnice sousedních ramen ve vzdálenosti
    šířky nejširší cesty od středu (místo kruhu 1,3 × šířka);
  - uzel s 5+ živými cestami (nečeká se; Vlkov žádný) se při měsíčním úklidu rozdělí na dvě křižovatky se spojkou (i opakovaně, 8+ cest).
- **Změna:** přibude-li nebo ubude-li rameno, tvar a natočení se spočítají znovu, znamení zůstane;
  klesnou-li živá ramena na 2, křižovatka zanikne a cesty se spojí.
- **Data:** `VillageRoads.junctions` – id, střed, tvar, natočení, β, ramena (id úseku ve vchodu),
  znamení, den vzniku. Úsek ví, že končí ve vchodu (konec osy = vchod).
- **Co hráč vidí:** udusaná hlína ve tvaru kříže nebo Y – pásy ramen v šířce přicházejících cest,
  střed vyplněný mnohoúhelníkem mezi nimi, okraje nepravidelné jako u cesty; **žádný kruh**.
  Kliknutím (do 3 m od středu) se vybere – panel: ikona tvaru (kříž, Y), cesty v ramenech (druhy),
  znamení. Akce žádné (hráč cesty jen vylepšuje). Pod křižovatkou se neorá (dřív kruh – [roads.md
  – Cesta přes pole](roads.md#cesta-přes-pole)).
- **Pěšiny dne** rozcestí-plácky nemají (dřív jemný kruh `ribbonJunctions`) – čáry tras se jen
  potkají.

## Vchody

Martin (19. 10. 2026): „A ještě, každá budova by měla mít nějaký vchod, od kterého cesta povede.“
Martin (22. 10. 2026, pravidlo 10): „ke každé stavbě, kam se chodí, vede cesta až k jejímu vchodu,
i když se tam chodí málo, třeba k hřbitovu jen na pohřby.“ Podrobnosti návrh Clauda.

- **Vchod** počítá jedna funkce jádra (`paths/entrances.ts`) pro trasy i scénu (branka) – beze
  změny: obydlí bránou (`gateOf`, brána v cizím pozemku → nejbližší volné místo do 7,5 m –
  `gateAround`; nové obydlí brankou do cizího pozemku nesmí), hřbitov brankou v plotu nejblíž
  k nejbližšímu obydlí (`cemeteryEntrance`), ohrada brankou k nejbližšímu obydlí (`penEntrance`),
  modla předkem, svatyně přes hrot okvětí (`sacredEntrance`), dílny a humno vchodem. Sad, pole
  a louky vchod nemají – trasa vede k nejbližšímu okraji.
- **Cesta k vchodu (pravidlo 10):** měsíční kontrola najde hotové stavby, ke kterým se za
  posledních 12 měsíců chodilo (provoz trasy ke stavbě, i pohřby), a u jejichž vchodu nekončí
  pevná cesta. K takové stavbě vznikne **vyšlapaná cesta po nejvytíženější trase od vchodu** až
  k první pevné cestě, křižovatce nebo jiné kotvě – bez ohledu na vyšlapanost. Dokud se ke stavbě
  chodí, cesta k vchodu nezarůstá (stav drží na plném) – odvozuje se z konce cesty ve vchodu
  a návštěv stavby za 12 měsíců, žádné zvláštní pole (zjednodušení po recenzi); opuštěná stavba
  ([abandonment.md](abandonment.md)) ji přestane držet a zaroste podle druhu.
- **Hřbitov (Vlkov):** plot je neprůchodný, trasy končí v brance, pohřby a návštěvy jdou do
  provozu – cesta vede do branky, ne podél plotu.
- **Staveniště** mají práci ze všech stran jako dřív – plot nebo příkop teprve vzniká; cesta
  k vchodu vznikne až u hotové stavby.

## Pochůzky pro vodu

Stav: Martin 19. 10. 2026 – „Ve Vlkově nikde nevidím vyšlapanou cestu k potoku. Ale vesničané tam
přece musí chodit nějak pro vodu a musí jim to zabírat čas.“ Návrh schválil („Ano“), podrobnosti
návrh Clauda. Platí dál, mění se jen vznik cesty.

- **Kam:** vždy k nejbližší vodě – suchý břeh u potoka, bez meze vzdálenosti. Okno tras sahá vždy
  k vodě (`villagePathBounds` – rozšíří se jen k nejbližšímu vodnímu políčku, ± 45 m, do 1 000 m).
- **Kolik:** 0,4 cesty (tam a zpět) na člověka domácnosti a den (`WATER_FETCHING` v `rules.ts`).
- **Cesta:** pochůzky domácností se slijí na společnou trasu; břeh je cíl (kotva), takže cesta
  k vodě vede od vsi až k vodě. Vlkov (24 lidí): ≈ 9,6 cesty denně – cesta za ≈ 4 měsíce
  (dřív po dvou ročních kontrolách).
- **Čas je práce:** chůze pro vodu nad 100 m se přičte k dennímu minimu domácnosti (cesty × 2 ×
  (chůze k vodě − 100 m) ÷ 1 m/s ÷ 10 h; Howard a Bartram 2003, Bohannon 1997) – beze změny.
  Chůze k vodě (`Dwelling.waterWalkM`, `waterWalkDistance`) po čarách tras a pevných cestách.
- **Co hráč vidí:** lidé pro vodu jdou s vahadlem a vědry po uložené trase své domácnosti
  (Jedno rozhodnutí) – tedy po vozové cestě, vede-li tam trasa simulace.
- **Voda vozem** ([wagons.md](wagons.md) – Co vozy vozí) beze změny; jízdy jdou do vyšlapanosti.

## Pěšiny a práce

Stav: Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať se chodí o něco lépe než tam, kde
není.“), rychlosti Martin 19. 10. 2026, zbytek návrh Clauda. Platí dál:

- Po plné pěšině 1,3× rychleji než po louce (slabší úměrně síle – nově síla = vyšlapanost),
  přes díl v osevu pěšina nezrychlí. Po pevné cestě podle druhu ([roads.md](roads.md)).
- **Vzdálenost dílu pole pro práci** se měří chůzí z nejbližšího obydlí: rovně, nebo rovně k čáře
  trasy, po ní a rovně na díl – kratší z obou (`walking.ts`). Stejně čtverce sadu, palivo a voda.
- **Kdy se přepočítá:** s trasami (Kdy se trasy počítají).
- **Uložení:** `walkDistanceM` dílů a čtverců sadu, `forestWalkM` a `waterWalkM` obydlí – jako
  dřív. Kalibrace bez krajiny počítá dál vzdušnou čarou a cesty nemá.

## Převod starých vsí (Martin 23. 10. 2026)

Martin: staré cesty se při načtení převedou **jednou a idempotentně** – upravené a vozové
zůstanou, souběžné se sloučí, pahýly zmizí, nepoužívané začnou zarůstat. Postup (návrh Clauda):
převod je rozdělený na samostatné idempotentní kroky v `updateVillage`, každý přichází s úlohou
plánu, která danou část zavádí – stará ves (Vlkov) tak zůstává hratelná po každé úloze:
trasy (`withRoutes`), vyšlapanost (`withWearSeed`, bod 3), stav kusů (`withRoadCondition`, bod 2),
druhy (`withBridgedRoads`, bod 1) a nakonec úklid a smazání starých polí (`withRoadsV2`, body 4–6,
příznak `VillageRoads.v2`).

1. **Druhy:** úsek `causeway` (hať a lávka) → upravená cesta s hotovou hatí a lávkou; upravená
   cesta přes mokřinu nebo brod bez hatě dostane příznak, že hať a lávka chybí – „Upravit cestu“
   pak postaví jen je ([roads.md](roads.md) – Nový systém cest).
2. **Stav kusů** z dosavadní historie: kus s provozem v posledním roce nad udržovacím prahem plný,
   jinak plný × (1 − tiché roky / roky zarůstání druhu) – nepoužívané tak začnou zarůstat, nic
   nezmizí hned.
3. **Vyšlapanost** se založí z loňských úseků nad prahem (`VillageRoads.candidates`): podél nich
   500 (polovina prahu) – rozjeté cesty se neztratí. Ostatní pěšiny začnou od nuly.
   Návrh Clauda (24. 10. 2026): „podél“ = políčka, kterými osa úseku vede, i sousední (± 1 jako
   u tras – trasa o políčko vedle sčítá dál); vyšlapanost platí od dalšího dne dopočtu. Nová ves
   začíná od nuly prvním dnem s trasami.
4. **Úklid sítě** (Síť – kroky 1–4): souběžné se sloučí – starou vyšlapanou nebo upravenou cestu
   vedle vozové pohltí vozová (Vlkov – voda), copánky, díry, spojení, pahýly.
5. **Křižovatky** v uzlech se 3–4 cestami (ramena podle provozu z posledního roku) – kulaté plácky
   zmizí. Cesty k vchodům a další úklid dodělá první měsíční kontrola s trasami.
6. Smažou se nepotřebná pole (`candidates`, `cartCandidates`, `quiet`, `parallelsChecked`,
   `endsChecked`, `cutEnds`). Druhé načtení vrátí týž stav.

## Co se ukládá a co se dopočítá

| Ve stavu vsi (nové)                                      | Dopočítá se (stejně na serveru i v prohlížeči)       |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `routes` – trasy (řetězový kód), cesty za den, účel      | osy tras, tempo, provoz po buňkách, čáry pěšin       |
| `roads.wear` – vyšlapanost po 7,5 m, den posledního sčtu | síla pěšin, horké kusy pro vznik cest                |
| `Road.condition` – stav po kusech ≈ 25 m                 | bledé zarůstající kusy ve scéně                      |
| `Road.abandoned` – opuštěná cesta mimo síť               | cesty hráče (řetězy), kotvy a pahýly                 |
| `roads.junctions` – tvar, natočení, ramena, znamení      | obrys křižovatky, oblouky do vchodů (osa je uložená) |
| `roads.v2` – převod hotový                               | vzdálenosti chůze (uložené jako dřív)                |

## Výkon

Návrh Clauda (odhady – ověří poslední úloha plánu):

- **Trasy** se počítají jen při změně rozložení a 1. dne v měsíci se změnou stadií – stejně jako
  dřív přepočet chůze, stejnou funkcí (`computePathNetwork`). **Roční síť 1. 11. zmizí** (Vlkov
  ≈ 0,4 s za rok).
- **Vyšlapanost** – provozní pole (buňky tras × 9 sousedů) jednou na sadu tras v paměti; interval
  jen přes nenulová políčka (Vlkov 1–3 tisíce), celá čísla. Intervalů je při dopočtu stovky až
  tisíce (dělí je každá změna rozložení), proto mez: **dopočet 40 let Vlkova nejvýš o 1 s déle než
  před novým systémem** – měří `road-report.ts` od první úlohy plánu.
- **Měsíční kontrola** – horké kusy, stav kusů, úklid jen při změně; odhad < 5 ms.
- **Stav vsi** + 15–35 kB (trasy a vyšlapanost); mez návrhu 50 kB pro Vlkov, jinak hrubší kód.
  Do prohlížeče jen při změně klíče, ne s každým dotazem na ves.
- **Scéna** trasy jen dekóduje – žádné A\* v prohlížeči (dřív výpočet sítě ve třech úlohách).

**Ověřeno na Vlkově (24. 10. 2026, Úloha 15):** dopočet 10 let +16 % a 40 let +19,5 s proti stavu
před novým systémem (mez byla +5 % a +1 s), měsíční kontrola Ø 37–48 ms (odhad 5 ms), stav vsi
–42 kB (mez +50 kB splněna). Odchylka od odhadů je otevřená otázka pro Martina (viz závěr plánu
cest v2), ne tichá oprava.

## Rozhodnutí

| Rozhodnutí                                                                                       | Kdo          |
| ------------------------------------------------------------------------------------------------ | ------------ |
| Pravidla 1–11 nového systému cest                                                                | Martin       |
| Lidé na upravované cestě vidět pracovat; přes ohrady se nechodí, dovnitř brankou                 | Martin       |
| Staré vsi převést jednou a idempotentně, nezahodit                                               | Martin       |
| Čísla vzniku a zarůstání zvolí Claude sám                                                        | Martin       |
| Trasy ukládá simulace do stavu (řetězový kód), scéna je jen čte                                  | návrh Clauda |
| Zvyk × 1,25 mimo cestu – louka jen při úspoře přes 20 % času                                     | návrh Clauda |
| Ploty ohrad a hřbitova neprůchodné, trasa končí v brance; pohřby jsou trasa                      | návrh Clauda |
| Vyšlapanost 7,5 m, ± 1 políčko, + provoz − 1 za den, 0–1 500, cesta od 1 000, vůz × 2            | návrh Clauda |
| Vznik jen celé cesty od kotvy ke kotvě, prodloužení do vyšlapanosti 500; měsíční kontrola        | návrh Clauda |
| Kotvy: vchod, křižovatka, kraj mapy a cíl (konec trasy k vodě, dřevu, poli, sadu, louce)         | návrh Clauda |
| Pahýl (konec mimo kotvu) zmizí bez ohledu na délku; upravená a vozová zarůstá; opuštěná mimo síť | návrh Clauda |
| Křižovatka: Y s β 30–60°, natočení po 5°, vchod 1,5 × šířka, oblouk 12 m, dvě po 10 m            | návrh Clauda |
| Znamení: strom 40 %, kámen 30 %, kůl 30 %; strom roste jako strom u cesty                        | návrh Clauda |
| Cesta k vchodu bez ohledu na vyšlapanost, nezarůstá, dokud se ke stavbě chodí                    | návrh Clauda |
| Převod: causeway → upravená, stav z historie, vyšlapanost z kandidátů, úklid, křižovatky         | návrh Clauda |
| Převod po krocích s úlohami – stará ves hratelná po každé úloze; trasy při načtení               | návrh Clauda |
| Provozní pole vyšlapanosti v paměti; dopočet 40 let Vlkova nejvýš + 1 s                          | návrh Clauda |
| Ploty chodcům touž funkcí jako vozům (`fencedCells`) – ulička 3 m mezi ohradami průchozí         | návrh Clauda |
| Stavba přes cestu: kus pod ní opuštěný hned, objížďka se vyšlape a napojí                        | návrh Clauda |
| Jízdy vozů do vyšlapanosti ročně z `flushCartTrips`; i přes osetý díl                            | návrh Clauda |
| Kotvy z konců tras (brána, vchod stavby, cíl, kraj mapy); souběžné cesty sloučí úklid            | návrh Clauda |

## Nahrazená pravidla (22. 10. 2026)

- ~~Pěšiny dne počítá scéna i server z dnešní práce; síť si historii nepamatuje, opuštěná pěšina
  hned zmizí~~ – nahrazeno vyšlapaností a uloženými trasami.
- ~~Pevná cesta vznikne z roční sítě 1. 11., kudy se dva roky po sobě chodí aspoň 3× denně
  (do 6 m od loňského úseku)~~ – nahrazeno vyšlapaností (práh 1 000, měsíční kontrola).
- ~~Rozcestí – plácek, kruh, síla nejsilnější pěšiny + 30 % ostatních (Martin 18. 10. 2026:
  rozcestí nejvyšlapanější místo)~~ – nahrazeno křižovatkou (pravidlo 9); i rozcestí pěšin dne.
- ~~Postavy chodí po pěšinách vlastním hledáním ve scéně (`path-router.ts`), kde pěšina nevede
  nebo by byla oklika (1,7× + 12 m), jdou rovně~~ – nahrazeno uloženými trasami.
- ~~Plot ohrady a hřbitova stojí v síti 15× louku~~ – plot je neprůchodný.
- ~~Pevné cesty, které končí jinde u plotu, se nechají být~~ – úklid sítě a cesta k vchodu.

## Zjednodušení a co chybí

- Viditelná pěšina leží jen podél dnešních tras – když se trasa přesune, stará pěšina se nekreslí,
  i když vyšlapanost tam ještě je (dorůstá a do 4 let zmizí, cesta z ní nevznikne).
- Trasy vozů se neukládají (počítají se stejnou funkcí na serveru i v prohlížeči) – kromě jízdy
  pro vodu (`waterCart`). Do vyšlapanosti jdou jízdy vozů jednou ročně, ne den po dni.
- Ke hromadě klád se trasa nepočítá (její místo zná jen scéna).
- Brody jsou jen mělké úzké úseky potoka; mosty pro vozy nejsou.
- Pěšina sama nic neodstraní (keře a kameny na ní stojí dál – jen se jim vyhne).
