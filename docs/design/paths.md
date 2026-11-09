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
  louka 1, ~~díl v osevu 0,5, strniště 0,8~~ pole 0,6 bez ohledu na stadium ([Stálé
  trasy](#stálé-trasy-25-10-2026), 25. 10. 2026), mokřina 0,5, pěšina až 1,3 podle vyšlapanosti,
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
  nejen příkop; ~~staveniště je průchodné~~ – od 25. 10. 2026 neprůchodná od umístění, Stálé trasy)
  jsou zeď – trasa vede jen vchodem (brankou). Dovnitř jde jen trasa toho, kdo tam má práci
  (krmení v ohradě, pohřeb a návštěva hřbitova) – končí v brance; práce uvnitř je pohyb postav od
  branky. Dřív stál plot 15× louku (`PEN_COST`, `CEMETERY_COST`) a trasy přes ohradu šly.
  ~~Staveniště plotu (rozestavěná ohrada a hřbitov) zůstává průchozí jako dřív.~~ Od 25. 10. 2026
  platí plot v mapě tras od umístění ([Stálé trasy](#stálé-trasy-25-10-2026), pravidlo 1).
- **Ulička mezi ohradami (Martin 23. 10. 2026 – [oxen.md](oxen.md), Plot ohrady podle délky):**
  plot stojí 1,5 m uvnitř čtverce, mezi sousedními ohradami (i hřbitovem) zůstává ulička 3 m, kterou
  projde chodec i vůz. Neprůchodné jsou buňky uvnitř plotu podle téže funkce jako u vozů
  (`fencedCells`); natočená ohrada blokuje jen buňky celé uvnitř. Žádná druhá geometrie plotu.
- **Šikmá cesta v mřížce (návrh Clauda):** vůz má pevnou cestu jako pás kolem osy
  (`ROAD_BAND_CELLS`) a smí úhlopříčkou z buňky cesty na buňku cesty (Vlkov 23. 10. 2026 – šikmá
  cesta lesem nebyla sjízdná). Trasa chodce po šikmé cestě lesem nebo polem nesmí spadnout mimo
  ni – ověří Úloha 2, jinak týž pás.
- **Slévání:** ~~domácnosti jdou ke společnému cíli zvlášť, nejvytíženější první~~ – od 8. 11. 2026
  **„pole z domu“**: domácnosti po sobě, nejvytíženější první (součet cest za den ke všem cílům,
  návštěva sousedů vytíží obě domácnosti dvojice, při shodě nižší index – návrh Clauda), **každá
  najednou ke všem svým cílům** – jedno hledání z brány, konec trasy je nejlevnější buňka cíle (při
  shodě vyšší index); pak se všechny její trasy vyšlapou a další domácnost se přidá k pěšinám těch
  před ní (Martin 8. 11. 2026 k [rešerši modelů](research/2026-11-08-trail-models.md): „Ano“).
  Trasy jednoho domu se neslévají šlapáním, ale sdílejí kmen ze stromu nejkratších cest. Pochůzka
  (voda, dřevo) skončí u nejbližšího místa, nebo na pěšině souseda k místu, je-li nejvýš o 30 %
  dražší (`GOAL_SLACK`). Cíl v jiné souvislé oblasti než brána (za plotem bez branky, za vodou) se
  předem vyřadí. Čerstvě prošlapané buňky a vyšlapanost zlevní (až 1,3×), takže se další trasy
  přidají ke kmeni – souběžné pěšiny nevznikají (Martin 18. 10. 2026: „Pokud už cesta vede tím
  směrem, lidé by měli použít tu, ne si prošlapat vlastní souběžnou.“). Dvě kola jako dřív (Martin 8. 11. 2026 – jedno kolo zatím ne). Model vzniku pěšin (vyšlapanost, sleva po pěšině, zvyk 1,25)
  se nemění; stávající vsi dostanou nové trasy až s příštím přepočtem, žádný jednorázový převod
  (Martin 8. 11. 2026: „A“).

### Kdy se trasy počítají a co se ukládá

- **Přepočet** jako dřív přepočet chůze: když se změní rozložení vsi (`walkLayoutKey` – obydlí,
  stavby, pole, cesty, ohrady, stáda, kdo kde bydlí), ~~stadia dílů jen 1. dne v měsíci
  (`walkStageKey`)~~ – od 25. 10. 2026 jen geometrie, stadia ne; lidé a stáda jen převáží cesty
  za den ([Stálé trasy](#stálé-trasy-25-10-2026), pravidlo 5). Nově i když se změní pevné cesty
  měsíční kontrolou. Výsledek nezávisí na kouscích dopočtu (rozhodují dny změn, ne kousky).
  **Od 8. 11. 2026 jednou za měsíc:** změna mapy tras během měsíce se jen projeví v klíči
  a přepočet proběhne 1. dne dalšího měsíce – najednou za všechny změny; vesničané do té doby
  chodí po staré mapě (Martin 8. 11. 2026: „a“). Hned jen ves bez platných tras (nová, starší
  uložení) a oprava či přestavba cest. **Od 9. 11. 2026** obilné jámy mapu tras nemění a vzdálenosti
  chůze se s trasami přepočítají, jen když se změnilo, na čem závisí kromě pěšin
  ([Obilné jámy a vzdálenosti chůze](#obilné-jámy-a-vzdálenosti-chůze-9-11-2026)).
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
  cesty. Na díl uprostřed pole dojdou po trase k poli a dál přes pole (jako dřív `fieldPath`) –
  trasa míří na pole jako celek a její konec se se stadii dílů nemění ([Stálé
  trasy](#stálé-trasy-25-10-2026), pravidlo 2).
  Vlastní hledání tras ve scéně (`path-router.ts`) zmizí.
- **Krátké pohyby** postav, které simulace nepočítá (přejít k sousednímu dílu, obejít dům,
  postavit se k práci), zůstávají ve scéně – nesmí ale vést přes plot ohrady ani hřbitova
  (Martin 22. 10. 2026, #3), dovnitř jen brankou.
- **Vzdálenost chůze pro práci** (díly pole, sad, palivo, voda) se měří po tytéž čarách tras
  a pevných cestách jako dřív (`walking.ts`) – čáry jsou nově z uložených tras.
- **Vozy** jezdí jako dřív po trasách vozové sítě ze stejné funkce na serveru i v prohlížeči
  (`villageCartRoutes`). Voda vozem je už uložená (`VillageState.waterCart`, scéna ji čte přes
  `storedWaterCartDrive` – totéž co simulace); uložení ostatních tras vozů je zjednodušení na
  později. Jízdy vozů zapisuje do provozu cest (do 25. 10. 2026 i do pošlapání úrody, to zmizelo) jediné místo – denní deník jízd
  (`CartTripLog`, `flushCartTrips`).

## Stálé trasy (25. 10. 2026)

Martin 25. 10. 2026: „No a kdyby se cesta neměnila podle toho, v jakém je pole stavu, ale použil
by se nějaký průměr?“ – „Proč by se měly vyšlapané stezky měnit? Objekty na mapě jsou statické
a lidé tedy chodí vždy nejrychlejší cestou.“ – na návrh Clauda (pravidla níž a výpočet v paměti):
„Pusť se do obojího.“ K poli: „Co se skrývá za přibude díl pole? Přidání pole je přece stavba, to
iniciuje hráč.“ K cestám: „Vždyť jsme si teď řekli, že pokud se na mapě nic nezmění, lidé chodí
pořád stejně.“

**Proč:** trasy dosud záležely na stadiích dílů – díl v osevu stál chůzi 2× louku, strniště
1,25×, osetý díl vůz 8×. Síť se proto 1. dne v měsíci přepočítala a trasy se posunuly, kdykoli se
zaselo nebo sklidilo; vyšlapanost posun dorovnávala tolerancí ± 1 políčka (pás 11–22 m), z níž
rostly souběžné pásy a cesty kousek vedle tras (audit Vlkova, souběh). A trasy vozů se při každé
změně stadia hledaly znovu (měření 25. 10. 2026: hledání tras vozů 67 % času dopočtu roku).

### Pravidla (návrh Clauda, schválený Martinem 25. 10. 2026)

1. **Pole má stálou cenu průjezdu** bez ohledu na stadium dílu (zakládaný, zoraný, osetý,
   rostoucí, zralý, žeň, strniště, úhor): **chůze 0,875** louky (cena buňky 8 / 7 ≈ 1,14 –
   `FIELD_WALK.field`; ~~0,6 – cena 1,67~~ do 26. 10. 2026, Martin „A“ – viz Otázka níž),
   **vůz 0,25** louky (cena 4 – `CART_SPEED.field`, dvoukolák i čtyřkolák; rozhodl Martin 25. 10. 2026: „Ať je stejná cena jako u dvoukoláku. 4 je asi dobrý průměr. Pokud vůz pojede přes pole, tak žádnou úrodu nepošlape – je to přiměřené herní zjednodušení.“). Čísla jsou časový
   průměr dnešních cen přes rok (cena buňky = 1 / rychlost; průměrný čas přechodu v náhodný den):

   | Díl přes rok                                                     | Chůze – cena | Vůz – cena |
   | ---------------------------------------------------------------- | ------------ | ---------- |
   | ozim (v osevu od zářijové orby po žeň ≈ 10 měsíců, strniště ≈ 2) | ≈ 1,9        | ≈ 6,9      |
   | jař (v osevu březen–srpen ≈ 5 měsíců, strniště ≈ 7)              | ≈ 1,55       | ≈ 4,1      |
   | úhor, příloh                                                     | 1            | 1          |
   | trojpolí (třetina každého)                                       | ≈ 1,5        | ≈ 4,0      |
   | osevní postup (oběh 12 let: ozim, jař, 10 let úhor – šestina)    | ≈ 1,12       | –          |
   | Vlkov (≈ 80 % polí ladem, po desetině ozim a jař)                | ≈ 1,14       | –          |
   | **stálá cena**                                                   | **1,14**     | **4**      |

   ~~Chůze 1,67 leží mezi dílem v osevu (≈ 1,7) a trojpolím~~ (do 26. 10. 2026). Chůze je časový
   průměr přes **skutečný osevní postup** (fields.md – Osevní postup po dílech: oběh odpočatého
   dílu 12 let, ozim a jař, pak 10 let úhor; oseto ≈ šestina dílů): (1,9 + 1,55 + 10 × 1) / 12 ≈
   1,12; luštěniny (úhor 4 roky) a nouzový příloh podíl osevu zvedají – na Vlkově je oseto ≈ pětina
   (1,14). Stálá cena 8 / 7 ≈ 1,14 (rychlost 0,875 – v plovoucí čárce přesně) – návrh Clauda,
   Martin 26. 10. 2026 „A“. Vůz 4 je průměr trojpolí (Martin 25. 10. 2026, beze změny). Okraj pole (úvrať) jako louka, pevná cesta přes pole, mokřina
   na poli (platí pomalejší) a zarostlý díl (křoviny a mladý les – vůz neprojede) zůstávají jako
   dosud; zarůstání je změna krajiny (roční krok), ne stadium.
   - **Stálá část cest k poli je 1,0 i u úhoru** (návrh Clauda, 26. 10. 2026): pole se bere jako
     celek, který se obdělává a hlídá celý rok, a stálá část cest nezávisí na stadiu dílu
     (stadia mapu ani trasy nemění). Dřívější nižší váha úhoru (0,4 / 0,5) by stadium vnesla
     zpět do stálých tras; práci dne nese `wear.labor`. Dopad na vyšlapanost ověřit při
     kalibraci (Vlkov).
   - **Celá plocha pole je pole od chvíle, kdy ho hráč umístí** – i díly, které se teprve zakládají
     (kácení, drn); postupné zakládání mapu tras nemění. Stromy, které na umístěném poli (nebo
     pozemku stavby) ještě stojí, mapa tras nebere – vesničané je stejně skácí. Totéž stavby:
     do mapy se počítají **v konečné podobě od umístění** (plot ohrady a hřbitova neprůchodný už
     od založení – trasa ke staveništi končí u něj), ne až po dokončení. Zjednodušení: než se pole
     v lese vymýtí, může přes něj vést trasa mezi stojícími stromy.
   - **Vůz přes pole úrodu nepošlape** (Martin 25. 10. 2026: „Pokud vůz pojede přes pole, tak
     žádnou úrodu nepošlape – je to přiměřené herní zjednodušení.“). `CART_TRAMPLE`,
     `FieldPart.trampledM2` i pošlapání v kronice a upozorněních zmizí. Vůz se osetému dílu
     nevyhýbá víc než jinému poli – přes pole jede, když je objížďka víc než 4× delší (dosud 8×
     u osetého, 1,25× u strniště).
   - **Čas chůze pro práci** (`walkDistanceM` dílu a sadu, palivo, voda) se počítá touž stálou
     cenou – průměrný čas, ne čas dne; mění se jen se změnou mapy.
   - **Čtyřkolák** „zakládaný (zoraný) díl objede“ (wagons.md, Martin 20. 10. 2026 „Po strništích
     a loukách může libovolně“) – stadium už mapa nezná; čtyřkolák platí na poli stálou cenu
     jako dvoukolák (rozhodl Martin 25. 10. 2026: „Ať je stejná cena jako u dvoukoláku.“). Připravený
     díl jako strniště při žni (`harvestReachState`) pro mřížku vozu zmizí – stadium už nerozhoduje
     o ničem (ani o pošlapání, to zmizelo).

2. **Trasa za prací míří na pole jako celek.** Cílem trasy je pole (`field:<id>`): trasa končí na
   první buňce pole, kam od domu dojde nejlevněji (okraj, vstup) – s jednou cenou celého pole je
   to pořád týž okraj, ať se dnes pracuje na kterémkoli dílu. Na dnešní díl dojdou lidé po poli až
   od konce trasy (ve scéně `fieldPath` jako dosud). Vůz se svozem a osivem jede k dílu po stálé
   mřížce – k témuž dílu vždy stejně.
3. **Pevné rozhodnutí remíz.** Ceny kroků jsou celá čísla (tisíciny metru louky na krok), takže
   dvě stejně drahé trasy jsou opravdu stejně drahé; z nich vyhraje vždy ta, jejíž předchůdce má
   nižší index buňky (u vozu buňky a směru; v síti pěšin **vyšší** – viz Stav A2a níž). Trasa tak nezávisí na pořadí, v jakém hledání buňky
   probírá, ani na drobné změně jinde v mřížce – mezi „nejdřív dolů, pak doprava“ a obráceně
   nerozhoduje halda. Sleva z vyšlapanosti se pro výběr trasy bere po setinách síly pěšiny.
   _Stav 26. 10. 2026 (Úloha A1):_ zavedeno pro trasy vozů (kvantum 1/1024 m – dvojková tisícina,
   součty přesné bez převodu jednotek). V síti pěšin pravidlo indexu rozdělilo trasy do
   souběžných pruhů pásu vyšlapanosti 7,5 m, proto tam (i setiny síly) přijde až s buňkou 3,75 m
   (pravidlo 4, A2a) – návrh Clauda.
   _Stav 26. 10. 2026 (Úloha A2a):_ i v síti pěšin – ceny kroků po 1/1024 m, síla pěšiny po
   setinách; ze stejně drahých předchůdců ale vyhraje **vyšší** index (návrh Clauda). Každé pevné
   pravidlo dá přednost jednomu směru: s nižším indexem se v testu „jedna pěšina“ (dvě domácnosti
   vedle sebe na pole) trasy nesejdou, s vyšším ano; v zrcadleném rozložení se nesejdou ani
   s dřívějším pořadím haldy – slévání stálé trasy zajišťuje sleva z vyšlapanosti, ne remíza.
4. **Vyšlapanost bez tolerance.** Trasa i jízda vozu přidají jen políčkům, kterými opravdu vedou –
   sousedním ± 1 ne (Martin 25. 10. 2026 k témuž u stavu cest: „proč by lidé chodili kousek vedle,
   když tam je cesta?“). **Políčko vyšlapanosti se zmenší na 3,75 m = buňka mřížky pěšin**
   (dosud 7,5 m = 2 × 2 buňky): trasa je řada buněk mřížky, políčko je buňka, nic se nezaokrouhluje
   a pás vyšlapanosti je široký jako trasa. Stav nevzroste – dosud 3 políčka 7,5 m napříč trasou
   (0,4 políčka na metr), nově 1 buňka (0,27–0,37 na metr podle směru). Tolerance byla potřeba,
   dokud se trasy s měsíci posouvaly; stálé trasy se neposouvají a novou trasu ke staré stáhne
   sleva z vyšlapanosti (až 1,3×). Uložená vyšlapanost 7,5 m se jednou převede (hodnota do 4 buněk).
   _Stav 26. 10. 2026 (Úloha A2a):_ zavedeno (`WEAR.cellM` 3,75, značka `RoadWear.cellM`). Jen
   čtení má pás (návrh Clauda): čára trasy je zjednodušená a vyhlazená, její bod leží až o buňku
   vedle buněk trasy – vyšlapanost bodu čáry (síla pěšiny, a tím i rychlost chůze po čáře, vznik
   cesty) je nejvyšší z buňky bodu a sousedních a provoz nové cesty (`trafficAt`) se bere z pásu ± 1 buňky, každá trasa jednou.
   Vlkov: 825 políček 7,5 m (4,4 kB) → po převodu 3 300 buněk (16,4 kB); se stálými trasami po
   1 500 dnech (co nevede trasou, zaroste) 350 buněk (2,2 kB).
5. **Přepočet jen při změně mapy tras** – od 8. 11. 2026 až 1. dne měsíce po změně (Martin 8. 11.
   2026: „a“ – změny měsíce najednou, do té doby stará mapa). Trasy se hledají znovu, jen když se
   změní:
   - **mapa tras** (ceny buněk pro chůzi a vůz) – umístění nebo zrušení stavby či pole hráčem,
     spadnutí stavby, zarostení dílu (roční krok), pokácené stromy mimo umístěné plochy (jednou za
     rok k 1. 11. – mapa bere pařezy k poslednímu 1. 11., ne den po dni) a **opravdu jiná síť cest**:
     nová, zaniklá nebo sloučená cesta, jiná osa, druh či stupeň (dokončené vylepšení), olemování
     stromy po desetinách. Měsíční kontrola cest mapu mění, jen když síť opravdu změnila; stav
     kusů, provoz a bledení cesty mapu nemění;
   - ~~**místa, mezi kterými se chodí** – nová nebo opuštěná domácnost (obydlí obydlené / prázdné),
     nové zavedené místo (dokončený hřbitov, sad, posvátné místo…).~~ Od 31. 10. 2026 jen
     **postavení nebo zánik stavby** – Martin 31. 10. 2026: „Ta věc (dům, ohrada, hřbitov) se
     prostě postaví a dál se s ní nic neděje, pokud nespadne.“ Stálé trasy vedou ze **všech
     hotových obydlí** (i prázdných) ke **všem stavbám** (i k ohradě bez zvířat a zapečetěné
     obilné jámě – ~~mapa bere jámu od vykopání po zánik, ne to, jestli je otevřená~~; od 9. 11.
     2026 obilné jámy v mapě tras nejsou a trasa k nové jámě vznikne s nejbližším přepočtem
     z jiného důvodu – [Obilné jámy a vzdálenosti chůze](#obilné-jámy-a-vzdálenosti-chůze-9-11-2026)).
   - **Stadia dílů mapu nemění** – `walkStageKey` a přepočet 1. dne v měsíci kvůli nim zmizí.
   - **Lidé, stáda a obsazenost** (počet v domácnosti, stáří spojení, počet stád, nastěhování
     a vystěhování, zvířata v ohradě, otevřená jáma) mění jen **cesty za den** uložených tras –
     trasy se převáží bez nového hledání; obsazenost hned, ostatní 1. dne v měsíci. Trasa
     z prázdného obydlí, k prázdné ohradě nebo k zavřené jámě má 0 cest a čeká, až se tam někdo
     nastěhuje (návrh Clauda: hledá se, jako by bylo obydlené – lidé vsi se pro hledání rozdělí
     na všechna hotová obydlí). Vzdálenost chůze dílu se měří z nejbližšího obydlí (i prázdného
     a rozestavěného – jako dosud), obsazenost ji tedy nemění.
   - **Stálé trasy** – k zavedeným místům a pochůzky (voda, dřevo, pole, sad, ohrada, hřbitov,
     posvátná místa, vchody staveb, staveniště, sousedé, pastvina) – mají pořadí slévání i cesty za
     den jen ze stálé části (`base`) a lidí. Práce dne do nich nevstupuje; do vyšlapanosti i stavu
     cest ji nese skutečně odvedená práce intervalu (`wear.labor`), ne snímek dne přepočtu.
   - ~~**Trasy k práci dne** (cíle bez stálé části – kácení, seč, úprava cesty, opravy, jámy na
     obilí, nošení od kováře…) se hledají až po stálých, nad nimi (se slevou z jejich provozu),
     a stálé trasy nemění. Přepočítají se se stálými a 1. dne v měsíci, jen pokud se změnila
     množina míst s prací nebo obsazenost (vedou jen z obydlených domácností) – místa práce se
     mění, mapa ne. Do vzdálenosti chůze pro práci nevstupují.~~ Od 31. 10. 2026 se **trasy
     k práci dne ani na pastvu nehledají** – na návrh „trasy ke kácení, na paseku a na louku jen
     ze stálé sítě pěšin“ Martin 31. 10. 2026: „ano“. Pěšiny k lesu, pasece, loukám a pastvě
     vznikají jen ze stálých tras. Práce dne do vyšlapanosti a stavu cest dál jde přes
     `wear.labor`, ale jen k cílům, ke kterým vede stálá trasa (pole, sad, ohrada, hřbitov,
     staveniště, jáma); práce bez stálé trasy (kácení, seč luk, úprava cesty, opravy, humno,
     nošení od kováře a hrnčíře) pěšinu nevyšlape. Nové stálé cíle: **humno** a **milíř**
     (Martin 31. 10. 2026: „Humno je stavba jako každá jiná“ a „Ta věc … se prostě postaví a dál
     se s ní nic neděje, pokud nespadne“) – `routes-v11`. Humno má stálou část jako obilná jáma
     (0,6 cesty za den z každé domácnosti, vstup na předku; výmlat je práce dne navrch přes
     `wear.labor`), milíř stálou trasu z domu uhlíře (0,6 cesty za den; chodí tam jen on, proto
     jen jeho domácnost; práce `kiln:<uhlíř>` navrch). Návrh Clauda: stálá část je stejná po
     celý rok, ne jen v době výmlatu – stavba se neřeší podle stavu dne, jako ostatní cíle;
     přibývá jedna trasa na humno. Kovárna, hrnčířská pec a další dílny: stálý cíl nemají
     (vlastní dvůr, pěšina z domu řemeslníka je trasa k jeho vchodu / sousedům); ostatní stavby
     už mají stálý cíl (pole, sad, ohrada, hřbitov, jáma, posvátná místa, staveniště). **Okraj
     lesa** už stálý cíl má (pochůzka pro dřevo – z ní vede pěšina k lesu, ke kterému se chodí
     i kácet), **paseka** je díl pole (stálá trasa k poli), **pastvina** (mladý úhor, louka po
     seči) leží v polích vsi – stáda jdou po stálých trasách k polím; přirozené louky se sečou
     jen pár týdnů v roce na různých políčkách – stálé místo to není.

   _Stav 26. 10. 2026 (Úloha A2b):_ zavedeno – otisk mapy tras a míst; místa práce jen 1. dne
   v měsíci. Návrh Clauda k tomu, co pravidlo neříká: lidé a stáda **převáží** cesty za den
   uložených tras jednou za měsíc (1. dne, po sčtu vyšlapanosti) – stejně často jako se dosud
   promítala stadia; **pastvina** (mladý úhor, louka po seči) se mění se stadii dílů, proto se
   trasy na pastvu hledají s trasami k práci dne (1. dne v měsíci se změnou pastviny, nad stálými
   trasami) – v otisku stálých tras by je stadia přepočítávala 4× za rok; stálá část cest na pole už nezávisí na stadiu (dosud
   pole celé ladem 0,4 místo 1,6 cesty za den a zakládané pole poloviční); stav cest bere práci
   dne z odvedené práce intervalu (`wear.labor`) jako vyšlapanost. Vlkov (rok po dnech): stálé
   trasy se hledaly 11× → 7× (1× převod, ostatní jiná síť cest, pařezy k 1. 11., nové stavby
   a domácnosti), trasy k práci dne a na pastvu 3×.

### Obilné jámy a vzdálenosti chůze (9. 11. 2026)

Rok Vlkova (stav z DB 9. 11. 2026, 39 lidí) trval 9,0 s, z toho přepočet tras 2,7 s. Návrh Clauda
– Martin 9. 11. 2026: „Ok, udělejme to tak jak říkáš“ a „Zační na tom pracovat“:

1. **Obilné jámy nejsou v mapě tras.** Vykopaná, vyprázdněná nebo zaniklá jáma dřív spustila
   prvního dne dalšího měsíce celý přepočet sítě pěšin, tras i vzdáleností chůze – přitom k jámě
   chodí celá ves jen ≈ 0,6× za den a pěšina k ní nevznikne. Trasa k nové jámě (`grain-pit:<id>`)
   se najde s nejbližším přepočtem z jiného důvodu (obvykle 1. 11. s pařezy); do té doby práce
   u jámy pěšinu nevyšlape (jako práce bez stálé trasy). Trasa k zaniklé jámě zůstane do přepočtu
   s 0 cestami (převážení ji nenajde). Zavřená / otevřená jáma dál jen převáží (obsazenost).
2. **Vzdálenosti chůze jen při změně toho, na čem závisí kromě pěšin.** Přepočet tras dřív vždy
   znovu změřil vzdálenost chůze ke všem dílům polí (Vlkov 4 754 dílů), čtvercům sadů, k lesu
   a k vodě – 1,0 s za rok. Za tři přepočty roku zůstalo 94–98 % dílů beze změny, změny měly
   medián ≈ 4 m z průměrných 391 m, les a voda se nezměnily. Nově se vzdálenosti přepočítají,
   jen když se změní obydlí (i rozestavěná – výchozí body), díly polí (políčko, pole, mřížka,
   zarostlý díl), sady, pevné cesty (osa, stupeň, mokřina a brody, hať, olemování) nebo opevnění.
   Nová síť pěšin sama vzdálenosti nemění – s pěšinami se zpřesní při nejbližší takové změně.
   Návrh Clauda: oprava a přestavba cest (přepočet tras hned) vzdálenosti nevynutí – změní-li
   cesty, přepočítají se samy; ves uložená dřív si je spočítá s nejbližším přepočtem tras.

### Co to udělá ve hře

- **Pěšina se vyšlape na jedné čáře** – souběžné pásy kolem trasy ani posun trasy se stadiem pole
  nevzniknou; cesta vznikne přesně tam, kudy se chodí.
- **Trasy se s osevem a sklizní nemění:** kdo chodil kolem pole, chodí tak celý rok. Přes pole se
  jde, když je obchůzka loukou víc než 1,14× delší (proti pevné cestě víc než ≈ 1,7–1,9×).
- **Vozy přes pole** podle průměru: v době osevu o něco ochotněji (4 místo 8), ve strništi méně
  (4 místo 1,25) – dosah svozu může klesnout, ověří plán (A3) na Vlkově. Pošlapání úrody odpadlo (Martin 25. 10. 2026).
- **Postavy** jdou po uložené trase jako dosud; trasy do prohlížeče chodí méně často.
- **Čas cest k dílům** se během roku nemění (průměr) – výživa vsi se může o málo posunout.

### Výpočet v paměti (návrh Clauda, schválený – výsledek se nemění)

Když mapa tras závisí jen na tom, co je na mapě, nemusí se nic počítat znovu: mřížka vozu
(`cartGrid`) a nalezené trasy vozů (`villageCartRoutes`) se drží v paměti podle klíče mapy tras
(+ druh vozu a ohrady se spřežením), vzdálenosti chůze se počítají jen se změnou mapy, vnitřní
smyčka hledání tras vozu běží bez textových klíčů a server dopočítává jednu ves vždy jen jednou
naráz (dotaz na ves a skok v čase se nepočítají dvakrát). Výsledek je bit po bitu stejný jako bez
paměti – hlídá test a měření (Vlkov: rok dopočtu ≈ 50 s, cíl ≈ 20–25 s). Podrobnosti zapíše plán
(úlohy B1–B3) do [village-roads.md](../code/village-roads.md) – Trasy v paměti.

### Výkon výpočtu v paměti – návrh vs. skutečnost (26. 10. 2026)

Návrh Clauda počítal s rokem Vlkova z ≈ 50 s na 20–25 s. Skutečnost: **≈ 31–33 s stěna,
36–38 s CPU** (−35 %), výsledek bit po bitu stejný (otisk po 31 a 365 dnech vcelku i po dnech se
studeným startem se shoduje). Cíl 20–25 s splněn není: třetina roku zůstává ve hledání tras vozu
při orbě a vodě a pětina v chůzi (`groundWalkLength`). Tabulka po krocích je v
[village-roads.md](../code/village-roads.md) – Trasy v paměti.

### Co nahrazuje

- ~~Ceny buněk: díl v osevu 0,5, strniště 0,8~~ (Cena chůze) a pro vůz ~~osetý díl 0,125, zoraný
  0,6, strniště a připravený díl 0,8~~ (wagons.md – Rychlosti) – pole chůze 0,6, vůz 0,25.
- ~~Přepočet tras 1. dne v měsíci se stadii dílů (`walkStageKey`)~~ (Kdy se trasy počítají) –
  jen změna mapy tras nebo míst; měsíčně jen trasy k práci dne.
- ~~Vyšlapanost na políčka 7,5 m i sousední ± 1~~ (Vyšlapanost a vznik cesty) – buňka 3,75 m, jen
  kudy trasa vede; totéž jízdy vozů (`addCartWear`).
- ~~Cesty za den trasy za prací = stálá část + práce dne přepočtu~~ – jen stálá část; práce
  intervalu z `wear.labor`.
- ~~Plot a stavba do mapy až po dokončení, díl pole až po založení~~ – od umístění.
- ~~Čtyřkolák zakládaný díl objede~~ – stálá cena jako dvoukolák (Martin 25. 10. 2026).

### Naměřeno – stálé trasy (Vlkov, 26. 10. 2026)

Vlkov ze 14. 9. 819 (44 lidí, 3 569 čtverců polí, z toho ≈ 80 % ladem), dopočet po dnech
24 měsíců – dosavadní engine (trasy podle stadií) proti stálým trasám (plán, úloha A3) a stálým
trasám s cenou chůze přes pole 1,14 místo 1,67 (Martin 26. 10. 2026 „A“, plán – úloha A4):

| Po 12 měsících (start → dosavadní / stálé) | Start | Dosavadní         | Stálé           | Stálé, pole 1,14 |
| ------------------------------------------ | ----- | ----------------- | --------------- | ---------------- |
| živé cesty                                 | 40    | 49                | 39              | 39               |
| krátké kusy (audit b)                      | 23    | 32                | 21              | 21               |
| souběžné cesty (audit d)                   | 3     | 4                 | 3               | 3                |
| smyčky přes víc uzlů (audit g)             | 4     | 4                 | 4               | 4                |
| přepočty tras za rok                       | –     | 33                | 11              | 11               |
| změněné buňky stálých tras za rok          | –     | 359               | 140             | 135              |
| chůze k dílům Ø / max (m)                  | –     | 325–344 / 715–892 | 384–388 / 1 031 | 334–335 / 783    |
| chůze k vodě Ø / max (m)                   | –     | 322–325 / 454–484 | 331 / 498       | 327 / 493        |
| dosah svozu žně (ozim, jař)                | –     | 100 %, 99,8 %     | 100 %, 99,8 %   | 100 %, 99,8 %    |
| úroda ozimu 820 / 821 (kg)                 | –     | 2 259 / 2 824     | 2 221 / 2 491   | 2 294 / 2 847    |
| dny hladu                                  | –     | 0                 | 0               | 0                |

- **Síť přestala růst** – za 24 měsíců dosavadní 51 cest a 34 krátkých kusů, stálé 40 a 22.
  Mezi přepočty se žádná stálá trasa nezměnila. Zbylé přepočty jsou změny mapy: obilná jáma
  otevřená a vybraná (3–4× za rok), milíř, pařezy 1. 11., úklid sítě a posun křižovatky podle
  provozu (krátce po převodu se dvě cesty u jedné křižovatky čtyři měsíce přetvarovávaly, pak se
  ustálily).
- **Vozy:** dosah svozu se nezměnil; vůz pro vodu 379 proti 375 m; spřežení k bloku orby jezdí
  dál (cena pole 4 platí i pro úhor, dřív 1).
- **Chůze k dílům je o ≈ 15 % delší a jař se oseje na méně dílech** (−16 %), úroda ozimu 821
  −12 %, zásoby po žni −5 až −6 %; hlad nenastal. Příčina je pravidlo 1: cena chůze 1,67 platí
  i pro úhor a příloh (dřív jako louka 1,0) – průměr počítal s trojpolím (třetina ladem), na
  Vlkově ale leží ladem ≈ 80 % polí. ~~Otázka pro Martina níž.~~ Rozhodnuto „A“ – cena 1,14.
- **S cenou pole 1,14** (úloha A4) je chůze i úroda zhruba jako v dosavadním enginu: chůze
  k dílům Ø 334–335 m (dosavadní 325–344, A3 384–388), max 783 m (715–892); k vodě Ø 327 m (322–325),
  max 493 m (454–484). Jař 820 na 328 dílech (dosavadní 351 – −7 %, A3 294), úroda ozimu 820
  2 294 / 821 2 847 kg (+1,5 % / +0,8 %), zásoby 1. 10. 820 6 779 kg (−2 %), 13. 9. 821 8 016 kg
  (+2 %), hlad 0. Síť, přepočty a audit jako A3.
- **Výkon** (rok vcelku): 130 s → 72 s (−45 %); cíl ≈ 20–25 s až s výpočtem v paměti (níž).
  Přepočet chůze stojí ≈ 3,5 s – při ceně pole 1,67 se počítá víc kandidátů. S cenou 1,14 rok
  vcelku 56 s (−57 %), 24 měsíců po dnech 105 s místo 149 s.
- **Determinismus:** dopočet po dnech dá stejný stav jako rok vcelku (otisk po 365 dnech).

### Otázka pro Martina – rozhodnuto 26. 10. 2026

- ~~**Chůze přes úhor a příloh:** na Vlkově (≈ 80 % polí ladem) prodloužila stálá cena 1,67 chůzi
  k dílům o 15 % a ubrala úrodu (ozim 821 −12 %). Návrh Clauda: díl, který leží ladem déle než
  rok (příloh – mění se jednou za rok 1. 11., jako pařezy), stojí chůzi i vůz jako louka (1);
  díly v osevním postupu dál 1,67 / 4. Mapa se tak mění nejvýš jednou za rok. Druhá možnost:
  nechat a přijmout posun výživy.~~ – Martin 26. 10. 2026: **„A“** – stálou cenu chůze přes
  pole snížit na skutečný průměr osevního postupu: **1,14** (rychlost 0,875; pravidlo 1 výš),
  pole dál bez stadií a mapa tras se se stadii nemění. Vůz dál 4 (Martin 25. 10. 2026).

### Otázky pro Martina – rozhodnuto 25. 10. 2026

- ~~**Vůz přes pole:** stálá cena 4, nebo 1,67?~~ – **4**, „4 je asi dobrý průměr“.
- ~~**Čtyřkolák na poli:** stálá cena jako dvoukolák, nebo dražší?~~ – **stejná cena jako
  dvoukolák** („Ať je stejná cena jako u dvoukoláku.“).
- ~~Pošlapání úrody vozem~~ – **vůz přes pole úrodu nepošlape** („je to přiměřené herní
  zjednodušení“).

## Vyšlapanost a vznik cesty

Návrh Clauda (pravidlo 3: „Pěšina, po které se dost chodí delší dobu, se stane cestou. Nemusí
přitom ležet každý rok přesně na stejném místě.“):

- **Vyšlapanost** je číslo na políčko ~~**7,5 m** (2 × 2 buňky terénu pěšin)~~ **3,75 m** (buňka
  mřížky pěšin – [Stálé trasy](#stálé-trasy-25-10-2026), pravidlo 4) v souřadnicích světa –
  nezávisí na okně sítě, které se s novými stavbami mění. Ve stavu řídce (jen nenulová políčka,
  celá čísla v setinách) – Vlkov po převodu 3 300 buněk ≈ 16 kB, ustáleně stovky buněk ≈ 2 kB.
- **Den po dni:** každá trasa přidá na políčka, kterými vede, ~~**a na sousední políčka** (± 1 –
  tolerance 7,5–11 m, ať se trasa, která se mezi roky posune, sčítá dál)~~ (od 25. 10. 2026 jen
  ta – stálé trasy se neposouvají) své cesty za den, každé políčko jednou na trasu. **Tráva ubere 1 cestu za den** (dorůstá). Vyšlapanost je mezi 0
  a **1 500**. Jízda vozu se počítá za 2 cesty (vůz udusá víc). Čísla jsou v cestách, kód je
  drží v setinách (1 000 = `WEAR.roadAt` 100 000).
- **Počítá se po intervalech**, ne každý den: mezi dvěma dny změny tras (přepočet, 1. den v měsíci)
  je provoz stálý, takže změna = (provoz − 1) × dny, oříznutá na 0 a 1 500 – přesně jako den po dni,
  celými čísly (deterministicky, nezávisle na kouscích dopočtu). Práce dne (pole, stavby) se do
  intervalu bere ze skutečně odvedené práce po místech (`VillageRoads.labor`, sčítá se denně), ne
  z jednoho dne – přesně jako dřív roční součty.
- **Provozní pole (výkon):** provoz tras po políčkách (~~i se sousedy~~) se spočítá jednou pro každou
  sadu tras (`routes.key`) a drží v paměti, ne ve stavu. Interval pak projde jen políčka s provozem
  nebo s vyšlapaností – jinak by se při dopočtu desítek let (intervaly po dnech, kdy se ves mění)
  trasy razítkovaly znovu a znovu. Z téhož pole bere provoz nová cesta (pás ± 1 buňky); stav kusů
  cest jen z tras, které jdou po cestě (Zarůstání – Provoz po cestě).
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
- **Smazané kusy** (oprava chyby, návrh Clauda; Martin 31. 10. 2026: „úspory jsme se snad
  shodli, že uděláme“): nové cesty měsíce vznikají nad kopií a ves je přijme, jen když všechny
  přežijí úklid; kus, jehož cestu úklid sloučil se starší souběžnou (objížďka podél staré
  cesty), se v dalším kole vynechá – nejvýš 3 kola. Dřív to ves po 3 kolech vzdala a měsíc co
  měsíc zkoušela totéž, takže cesty, které úklid přežijí, nevznikly nikdy (Vlkov: celý rok nic).
  Teď si ves **smazané kusy pamatuje** (podle polohy konců na 1 m) a další měsíce je nezkouší,
  dokud jsou vyšlapané – ostatní cesty vzniknou hned. Kus, který už vyšlapaný není (nebo se mu
  posunul konec), zapomene; zkusí se znovu, až se zase vyšlape. Vlkov: za rok 36 → 41 úseků.
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
  (Martin 23. 10. 2026: „Vůz smí přes zaseté pole“ – jen když jiná cesta není; ~~úroda se pošlape~~ od 25. 10. 2026 se nepošlape) se počítá jako každá jiná: kudy vůz jezdit musí, tam vznikne cesta.
- **Kronika** jako dřív: „Kudy se chodí léta, vyšlapala se pevná cesta.“

## Zarůstání (pravidlo 4)

Podrobně v [roads.md – Nový systém cest](roads.md#nový-systém-cest-22-10-2026). Stručně (návrh
Clauda): pevná cesta má **stav** po kusech ≈ 25 m. Provoz trasy po kusu ho udržuje, pod
udržovacím prahem druhu klesá; když dojde na nulu, kus zmizí. Vyšlapaná a vyježděná cesta bez
provozu zaroste za **5 let**, upravená (s hatí a lávkou) za **15 let**, vozová za **30 let**;
zemská stezka a cesta ve vylepšení nezarůstají. **Udržovací práh** (návrh Clauda, `ROAD_DECAY`):
vyšlapaná 1 cesta za den, upravená 0,5, vozová 0,25; stav kusu (plný = práh × roky × 365,25 dne) se
sčítá po týchž intervalech jako vyšlapanost. ~~Opuštěná cesta (žádná trasa po ní celý měsíc) se vyřadí ze
sítě – není ramenem křižovatky ani cestou hráče – a jen bledne, dokud nezmizí; vrátí-li se na ni
provoz, ožije.~~ Návrh Clauda 1. 11. 2026 ([Křižovatka i se zarůstající
cestou](#křižovatka-i-se-zarůstající-cestou-vlkov-1-11-2026)): cesta bez provozu jen bledne, dokud
nezmizí, a **dokud leží, zůstává v síti** – je ramenem křižovatky i cestou hráče; vrátí-li se na ni
provoz, ožije. Ze sítě se vyřadí jen opuštěný úsek (`abandoned` – pod stavbou, objížďka vozové cesty).

### Provoz po cestě (Martin 25. 10. 2026)

Martin 25. 10. 2026: „Počkej, takže když jde člověk 11 m vedle cesty, tak se to bere, jako by šel po
cestě, ale když jsou konce cesty od sebe dál než 5 m, tak se to bere, jako by byly nespojené?“
a „proč by lidé chodili kousek vedle, když tam je cesta?“ Ve Vlkově objížďky kolem nových pozemků
držely opuštěné kusy staré cesty naplno (stav cesty bral provoz z políček 7,5 m i se sousedy –
dosah ≈ 11 m), takže kolem pozemků zůstávaly smyčky.

- **Stav kusu cesty nese jen provoz tras, které šly po ní** – trasa prošla pásem úseku v mřížce
  chodců (buňka do 0,75 buňky od osy, jako pás cesty pro vozy; při buňce 3,75 m ≈ 2,8 m – jen
  zaokrouhlení mřížky, mřížka vede cestu nejbližší řadou buněk). Žádné sousední políčko. Platí pro
  zarůstání i pro živá ramena křižovatek. Návrh Clauda – čísla v `ROAD_TRAFFIC`.
- **Ověření pásu na Vlkově** (scratchpad `diag-roads-band`, návrh Clauda): po 1 / 6 / 12 měsících
  s jednorázovou opravou sítě i bez ní je stav kusů živých úseků min i medián 94 / 93 / 91 % (bledne
  jen vozová cesta k okraji mapy bez vozů – za 30 let); do 5 let by nezarostl žádný kus, po kterém
  vedou trasy. Trasa vede vedle pásu jen u dvou kusů, kde se osa od trasy rozchází: stará vyšlapaná
  #906 podél plotu hřbitova (bez opravy; oprava ji nahradí vozovou) a začátek vozové #936 (osa
  zemních prací až 9 m od trasy) – blednou za 11 a 53 let. Pás 1 buňky by je držel jen překlopením
  mediánu, rozchod os řeší oprava sítě, ne šířka pásu – **pás zůstává 0,75 buňky**.
- **Opuštěný úsek provoz nedostane nikdy** – bledne podle druhu a zmizí. Souběžný úsek, kudy trasy
  nevedou, zaroste.
- **Kus pod hotovou stavbou zmizí do roka** (stav nejvýš na 330 dní – s měsíční kontrolou nejpozději
  ve 12. měsíci), ať je jakéhokoli druhu (návrh Clauda).
- Pravidlo 3 („cesta nemusí ležet každý rok přesně na stejném místě“) platí pro **vznik**
  z vyšlapanosti – tam tolerance (políčka 7,5 m se sousedy) zůstává.

## Síť – kotvy, pahýly a úklid (pravidlo 11)

**Vozové cesty se napojují taky** (Martin 25. 10. 2026: „Žádná cesta nemůže existovat jen tak sama
v prostoru, vždycky musí spojovat dvě místa – kombinaci budov a křižovatek.“; návrh Clauda): úklid
zacelí díru do 12 m (`ROAD_JOIN`) i u hotové vozové cesty – dřív je vynechával (Vlkov: vozová
k severnímu okraji končila 6,2 m od cesty u hřbitova a byla bez napojení). Vynechá jen konec
rozestavěné vozové cesty (leží na ose zemních prací se stavbou – stavba ji tam vede dál). Opuštěný
kus cílem napojení není – díra se zacelí k živé cestě za ním.

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
  zarůstá podle `ROAD_DECAY`, nezkracuje se. Návrh Clauda (24. 10. 2026, Vlkov – 25 m zbytek
  upravené cesty 547 po uříznutí zarůstáním od kraje mapy): **zbytek upravené nebo vozové cesty
  kratší než 30 m** (`ROAD_STUB.remnantM`) s koncem mimo kotvu se v úklidu sloučí se sousední
  cestou (konec u jiné cesty – díra, krok 2; uzel, ze kterého vycházel, se spojí – krok 3), jinak
  zmizí; delší upravený nebo vozový úsek bez cíle dál jen zarůstá.
- **Úklid** po každé změně cest (měsíční kontrola, dostavěné vylepšení, převod) v pevném pořadí:
  1. **souběžné cesty a copánky** – dnešní pravidla ([roads.md – Úseky a
     rozcestí](roads.md#úseky-a-rozcestí): do 12 m stejným směrem, kus od 25 m; copánek mezi
     stejnými uzly do 25 m, krátký vzdálený kus se toleruje – níž; copánek přes 1–2 mezilehlé uzly
     – [Copánek přes křižovatku](#copánek-přes-křižovatku-26-10-2026)); silnější je vyšší druh, pak víc provozu, pak starší – vozová
     a upravená cesta tak pohltí souběžnou vyšlapanou (Vlkov – voda);
  2. **díry** do 14 m mezi konci a cestou se zacelí (jako dřív);
  3. **uzly se dvěma konci** se spojí do jednoho úseku (jako dřív `mergeRoadChains`, různé druhy
     zůstanou úseky jedné cesty hráče);
  4. **pahýly** (výš);
  5. **cesty k vchodům** (Vchody níž);
  6. **křižovatky** (níž).

  Cesta, kterou úklid hned po vzniku sloučí se starší (krok 1), nevznikne a ves si její kus
  pamatuje (Vyšlapanost a vznik cesty – Smazané kusy).

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
    pahýl neodstraňuje; zbytek kratší než 30 m zmizí (výš), delší zůstane a zarůstá podle druhu;
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
- **Co hráč vidí – konce cesty** (Martin 25. 10. 2026: „Žádná cesta nemůže existovat jen tak sama
  v prostoru, vždycky musí spojovat dvě místa – kombinaci budov a křižovatek. Pokud cestu označím,
  měl bych v panelu cesty vidět, která místa to jsou a moci je také označit.“): panel cesty ukáže
  oba konce cesty hráče jako ikony – stavbu u vchodu (obydlí, hřbitov, ohrada, humno, modla,
  svatyně, obilná jáma…) nebo cíl bez vchodu (pole, sad, háj, voda, les, louka, pastva),
  křižovatku, kraj mapy se šipkou směru. Jiná cesta (napojení bez křižovatky) **není platný konec**
  – porušuje pravidlo 11 – a ukáže se jako varování s vykřičníkem „Cesta končí na jiné cestě bez
  křižovatky.“; klik dál vybere tu druhou cestu, ať je vidět, co je to za kus. Klik na ikonu
  vybere stavbu, pole, křižovatku či cestu; kraj mapy, voda a les vybrat nejdou. Název je jen
  v popisku („Obydlí – polozemnice“, „Křižovatka“, „Kraj mapy – sever“). Konec, který nikam
  nevede (porušení pravidla 11), je červené varování „Cesta tu nikam nevede.“ – pomůže hledat
  chyby sítě. Návrh Clauda: co na konci je, se pozná stejnými kotvami jako v úklidu – napřed
  křižovatka, která má úsek v rameni, pak nejbližší kotva v dosahu (vchod 3 m, cíl 7,5 m, nejméně
  6 m jako konec trasy), pás kraje mapy, jiná cesta do 4 m; jinak nikam. Vlkov (den 115545):
  z 23 cest mají 3 konec nikam (cesty 975, 1012, 1019).

## Copánek přes křižovatku (26. 10. 2026)

Martin 26. 10. 2026: „Udělej zrychlení a opravy cest“ – zbylé návrhy auditu cest Vlkova
(25. 10. 2026). Audit našel okruhy, které úklid nechal: copánek se ruší jen mezi týmiž dvěma uzly,
ale dvě souběžné cesty spojené přes mezilehlou křižovatku (Vlkov den 115545: upravené cesty 781
a 786 a vozová 940 kolem jednoho domu, 83 m) zůstanou obě.

Pravidlo (návrh Clauda, čísla `ROAD_BRAID_RING`):

- Slabší úsek A–B zmizí jako copánek i tehdy, když druhá větev z A do B vede přes **1–2 mezilehlé
  uzly** a skládá se jen ze silnějších úseků (pořadí jako u copánku – vyšší druh, oklika delší
  o víc než 5 %, víc provozu, starší). Slabší úsek se od druhé větve nesmí vzdálit víc než 25 m
  (krátký vzdálený kus se toleruje jako u copánku) – je to tatáž cesta.
- **Okruh** obou větví je nejvýš **150 m** a uvnitř neleží **žádná stavba ani pozemek** (obydlí,
  ohrada, hřbitov, modla, svatyně, humno, milíř, obilná jáma, díl pole, sad). Martin 26. 10. 2026:
  „Ať kruhy kolem domů zůstanou“ – okruh kolem stavby je cesta kolem pozemku (každá strana slouží
  jiným vchodům) a zůstane; copánkem je jen prázdný okruh. Obydlí, modla, humno, milíř a jáma se
  počítají středem; **pozemky** (díly pole, sad, hřbitov, ohrada) tím, zda okruh obsahuje kterýkoli
  střed nebo roh jejich čtverců, ne jen střed celku – střed hřbitova z průměru čtverců může
  u nekonvexního hřbitova ležet mimo něj (návrh Clauda, konzervativně).
- **Jediný přístup ke stavbě zůstane** (návrh Clauda): slabší úsek, do `ROAD_ANCHORS.entranceM`
  (3 m) od jehož osy leží vchod stavby a žádný jiný živý úsek tam nevede, se nezruší – stejně pozná
  vchod s cestou `accessRoads`. Jinak by ho měsíční kontrola vchodu založila znovu jako slabší
  úsek A–B a příští měsíc by zmizel zas (oscilace).
- Vozová cesta a cesta ve stavbě jako slabší nezmizí (hráč do ní investoval), jako u copánku.
- Úklid ji hledá v kroku 1 po copáncích mezi týmiž uzly; měsíční kontrola ji hledá i v síti beze
  změny, takže **starší ves převod nepotřebuje** – copánek zmizí při nejbližším měsíčním kroku cest.
- Vlkov: copánek přes křižovatku se řídí jen prázdným okruhem; okruhy kolem domů (např. 781 + 786 +
  940 kolem domu na stavu z auditu, den 115545) zůstanou. Okruh vozových cest 936 + 1041 + 1054
  kolem ohrady zůstává také – všechny tři jsou vozové (řeší ho [Zdvojená vozová
  cesta](#zdvojená-vozová-cesta-26-10-2026)).

## Vozová cesta bez vlásenky (26. 10. 2026)

Martin 26. 10. 2026: „Udělej zrychlení a opravy cest“ (audit 25. 10. 2026, návrh 5): vozová cesta
936 (dnes 1054) obchází ohradu po rovině vlásenkou – na 60 m je 3,16× delší než tětiva, přímo
by vedla 25 m mezi ohradou a pozemkem.

Pravidlo (návrh Clauda, čísla `WAGON_HAIRPIN`):

- **Vlásenka** je kus osy nejvýš **60 m**, který je víc než **2×** delší než tětiva mezi svými konci.
  Serpentina do svahu vlásenkou není – tětiva je tam prudší než mez vozové cesty (6 %), po ní by
  vůz nevyjel ([roads.md – Postupná úprava a serpentiny](roads.md)).
- Plán vozové cesty ji nepřijme: kus s vlásenkou (nejvýš 120 m jako narovnání) se nahradí
  **tětivou**, kudy vůz projede a profil vyjde – i na rovině a i když by tětiva stála víc práce
  (výjimka z „narovná se jen do svahu“, Martin 22. 10. 2026, #6 – vlásenka po rovině není klička
  do svahu, ale chyba staré cesty). Nejde-li tětiva, hledá se objížďka jako u prudkého kusu; když
  ani ta nevyjde bez vlásenky, úprava se nenabídne – „Cesta se pro vůz stáčí do vlásenky.“
  **Vlásenka na rovině** (Martin 26. 10. 2026 na otázku, jestli smí vozová cesta narovnat vlásenku i na rovině: „ano smí“) je výjimka z pravidla 22. 10. **Mez (návrh Clauda):** vlásenka se odmítne jen tehdy, když existuje průjezdná tětiva nebo
  objížďka. Vede-li tětiva přes překážku (plot, stavba) a objížďka nevyjde, úprava pro vůz se
  povolí po staré ose, jak tomu bylo dřív – hráč by jinak o úpravu přišel úplně.
- Při narovnávání se zkouší nejvýš 8 tětiv; **vlásenky jdou napřed** (pak běžné kličky podle
  ušetřené délky), aby je běžné kličky z limitu nevytlačily.
- Platí pro nové plány; postavené vozové cesty se nemění (převod není potřeba). Vlkov: plán po
  1054 dřív vedl po vlásence (66,6 m), teď tětivou 24,8 m jižně od ohrady.

## Odstup od plotu (26. 10. 2026)

Martin 26. 10. 2026: „Udělej zrychlení a opravy cest“ (audit 25. 10. 2026, chybějící pravidlo 3
a návrh 4): vyšlapaná cesta u hřbitova 2058 vedla podél východního plotu 0,9–1,6 m na 13 m
a jihovýchodní roh plotu přetínala o 3,5 m. Mřížka chodců pouštěla trasu po řadě buněk na hranici
čtverců (1,5 m od plotu) a vyhlazení osy (zjednodušení a zaoblení) pak roh usekne – čím delší
rovný kus před rohem, tím víc.

Pravidla (návrh Clauda, čísla `FENCE_CLEARANCE` v `rules-roads.ts`):

- **Ploty:** hotový hřbitov (bez rozšíření ve stavbě), hotová ohrada a oplocený pozemek obydlí –
  pletený plot po obrysu čtverců se **zakulacenými rohy** (oblouk 1,25 m, vnitřní roh 0,5 m), jak
  ho kreslí scéna. Vzdálenost se měří ke skutečné čáře plotu včetně oblouků, ne ke čtvercům.
- **Neprůchodný pruh:** buňka mřížky chodců, jejíž střed leží uvnitř plotu nebo blíž než **1 m**
  od něj, je neprůchodná – **jen když pruh nezavře průchod**: buňka do 1 m od plotu (střed mimo plot) se
  zablokuje, jen když má aspoň tři průchodné sousedy mimo pruh (volnou stranu od plotu); u úzkého
  průchodu mezi plotem a stavbou, vodou či lesem (světlá šířka 4–5 m = jedna řada buněk) a u konce
  plotu zůstane průchodná, jen **1,5×** dražší (osu tam podrží až vyhlazení osy). Pruh se vyhodnocuje
  po stavbách, ze stavu před úpravou, takže pořadí plotů nehraje roli. U natočené stavby (po 15°) to dřív neplatilo – buňka napůl za plotem
  byla průchodná, střed mohl ležet až 2,6 m uvnitř.
- **Dražší pruh:** buňka do **2 m** od plotu (u rovné stavby řada na hranici čtverců, 1,5 m od
  plotu) stojí pro výběr trasy **1,5×** víc – trasa se drží o řadu dál (5,25 m), když to nevychází
  o moc déle. Pod pevnou cestou se cena nemění (cesta je cesta), neprůchodnost platí i tam.
- **Branka:** buňky branky (kruh u bodu před brankou – jako dřív) jsou výjimka z obou pruhů, i když
  leží blíž než 1 m u plotu jiného (sousední ohrada) –
  trasa k hřbitovu nebo ohradě dojde až do branky. Cesta, která jde kolem branky, se do ní ohne
  (bod 1,5 m před brankou – `gateBend`, [Vchody](#vchody)); ohyb nesmí přes neprůchodný pruh.
- **Ulička** mezi dvěma ploty (buňka do 3 m od obou) zůstává průchodná jako dřív, jen dražší –
  mezi sousedními ohradami vede jediná řada buněk.
- **Ploty rozestavěných obydlí** se osy nedrží – plot stojí jen u hotového domu.
- **Osa trasy** (z ní vzniká cesta – [Vyšlapanost a vznik cesty](#vyšlapanost-a-vznik-cesty) – i
  cesta k vchodu): kde by vyhlazená osa šla k plotu blíž než **1 m**, podrží se nejbližší střed
  buňky trasy (roh) a kusy mezi podrženými body se vyhladí zvlášť – osa projde středem rohové
  buňky (u rovné stavby 2,6 m od oblouku plotu), roh neusekne. Nehlídá se **4 m** u začátku a konce trasy (brána domu je 1 m
  před brankou pozemku, cíl v brance). Trasa daleko od plotů se nemění.
- **Mění trasy všude:** verze tras `routes-v5` – uložené trasy se přepočítají jednou při dalším
  dni. Postavené cesty se nemění (až [jednorázová přestavba podle nových
  pravidel](#jednorázová-přestavba-podle-nových-pravidel-26-10-2026)); nové trasy,
  vyšlapávání a nové cesty jdou podle nových pravidel.
- Čáry pěšin ve scéně a v chůzi (`routePaths`) se kreslí z týchž tras po hranách buněk a odstup od
  plotu nehlídají – trasa už vede mimo pruh u plotu, jen zaoblení může roh přiblížit.
- **Naměřeno (Vlkov, stav DB + 90 dní, 26. 10. 2026):** osy tras blíž než 1 m od plotu (mimo 4 m
  u konců) u 25 ze 164 tras (76,5 m) → 0. Audit: podél plotu (j) 0 → 0, přes stavbu či pole (c)
  11 → 12 – staré cesty se nemění, nový nález je rameno nové křižovatky (úsek 1060 přes dům 2137 –
  ohyb ramene ke křižovatce stavby nehlídá, mimo tuto úlohu). Rok Vlkova CPU 30,9–33,0 s → 31,2–33,2 s
  (stroj vytížený, load ≈ 80 – v šumu).

### Odstup od plotu i u vozové cesty (26. 10. 2026)

Ověření přestavby na Vlkově: vozové cesty dál vedly přes ploty – vozová u hřbitova 2058 po ose
ohnuté do branky usekla jihovýchodní roh plotu o 3,5 m, vozové u ohrad 2586 a 1958 šly k plotu na
1–1,5 m. Odstup platil jen v mřížce chodců a ose trasy, plán vozové cesty ho neznal.

Pravidla (návrh Clauda – **stejně jako chodci**, táž čísla `FENCE_CLEARANCE`, týž výpočet pruhu):

- **Mřížka vozové cesty** (hledání trasy, objížďka, serpentina): buňky uvnitř plotu a do **1 m** od
  něj neprůchodné (jen když pruh nezavře průchod), do **2 m** **1,5×** dražší; branka a ulička mezi
  dvěma ploty výjimka. Narovnání trasy (přímé úseky) do pruhu do 2 m nově nevjede – jen kde už
  trasa pruhem vede –, takže objížďka plot neobjímá.
- **Osa vozové cesty** (po staré cestě, tětiva, vyhlazení, objížďka) se k plotu hřbitova či ohrady
  nepřiblíží pod **1 m** – měří se přesně ke skutečné čáře plotu po 0,5 m. Vyhlazení, které by roh
  usekl, se nevezme (roh trasy zůstane). Nehlídá se **4 m** u konců cesty (konec u branky).
- **Stará cesta u plotu** (osa ohnutá k brance, roh): místo se objede jako prudký kus –
  [serpentina](#jednorázová-přestavba-podle-nových-pravidel-26-10-2026) po mřížce s pruhem u plotu
  (objížďka v oknech ±60–200 m po ose); stará osa přes vnitřek plotu (buňky uvnitř) zůstane jako
  dřív nesjízdná („Vůz po této cestě neprojede – překáží stavba, plot nebo voda.“). Pozemek obydlí
  hlídá dál okraj stavby s půl vozovkou.
- Vozy svozu (vozová síť pro jízdy) se nemění – jezdí po pevných cestách.

## Zdvojená vozová cesta (26. 10. 2026)

Audit Vlkova po odstupu od plotů: okruh vozových cest 936 + 1041 + 1054 kolem ohrady (133 m) –
vozová 1054 (66,6 m) vede vlásenkou po téže ose jako 936 a 1041, 4 m vedle. Úklid ho nechal, protože
vozová cesta se jako slabší nikdy nemaže (hráč do ní investoval). Martin 26. 10. 2026 na otázku, zda
zdvojené vozové cesty opravit a Vlkov jednou přestavět: „určitě“.

Pravidlo (návrh Clauda, `WAGON_MERGE` v `rules-roads.ts`):

- **Dvě hotové vozové cesty souběžné** stejně jako pěší (do **12 m**, směr do ≈ 37°) na aspoň
  **25 m** – i když jedna leží po ose druhé tam a zpět (vlásenka) – se sloučí: ze slabší (pořadí síly
  jako u souběžných cest – vyjetá, starší, víc provozu) se souběžný kus vyřízne, zbytky kratší než
  15 m zmizí a konce zbytků se napojí na silnější (díry do 12 m). Vozová cesta se dál nikdy
  nevyřízne pěší cestou ani copánkem.
- **Spojení zůstane:** konec slabší vozové, který by vyříznutím zmizel, musí ležet do **4 m** od osy
  silnější vozové cesty (např. sdílený uzel) – jinak se kus nevyřízne (konec u humna, dvorce či pole
  by vozová síť ztratila).
- **Jen hotová silnější:** rozestavěná vozová (úsek ve stavbě) za silnější neplatí – vůz po ní ještě
  nejezdí, hotová se kvůli ní nevyřízne (návrh Clauda po recenzi 26. 10. 2026).
- Zemní práce vyříznutého kusu zůstanou terénem (zjednodušení – svahy na rovině jsou skoro nulové).
- Platí v každém úklidu (měsíční kontrola, převod, přestavba). Vlkov: měsíční kontrola 1054 sloučí
  i bez přestavby (vozová síť 3 293 → 3 227 m, souběh vozových 1 → 0).

## Stavba přes cestu (Vlkov, Martin 23. 10. 2026)

Ve Vlkově vůz pro vodu nejezdil: oplocený pozemek polozemnice stál přes cestu od ohrady volů
a objížďka vedla přes ozim (Martin 23. 10. 2026 – [wagons.md](wagons.md), Vůz přes zaseté pole).
Nový systém přehrazení řeší sám (návrh Clauda):

- **Kus pod hotovou stavbou** (pozemek, ohrada, hřbitov, okrsek svatyně, dílna – vše, co je
  v mřížce chodců neprůchodné) je hned **opuštěný** – vypadne ze sítě a zaroste; zbytky cesty po
  obou stranách žijí dál, pokud po nich vede trasa. Platí i pro úsek hotové zemské stezky a vozovou
  cestu (zemní práce zůstanou) – stezka pak vede po živých zbytcích. Návrh Clauda (24. 10. 2026,
  Vlkov – Martin: „tenhle úsek vede skrz domy“).
- **Objížďka:** trasy (a vozy) obejdou stavbu nejrychlejší cestou kolem – uličkou, okrajem pole,
  loukou; vůz přes osetý díl jen když jinudy nejde. Vyšlapaná objížďka se stane cestou jako každá
  jiná a napojí se na zbytky staré cesty (kotva „jiná cesta“ – `joinPoint`, `splitRoad`). Kudy vede
  nová cesta, tudy pak jezdí i vůz (úrodu od 25. 10. 2026 nepošlapává nikdy).
- Nahrazuje „zrušit kus cesty pod stavbou může přijít později“ ([roads.md – Co platí
  dál](roads.md#cesta-je-cesta--povrch-pod-ní-a-zarůstání)). Branka nového obydlí do cizího
  pozemku dál nesmí (Vchody).

## Křižovatky (pravidlo 9)

> **Napojení blízko křižovatky (Martin 3. 11. 2026):** na otázku, zda nové napojení cesty blíž než
> rozestup křižovatek (≈ 12 m, Vlkov: 9,8 m od křižovatky 1131) přitáhnout přímo do stávající
> křižovatky (víc ramen, kříž až pět): „ano“ – pět ramen smí jedna křižovatka, šest a víc se dál
> dělí (podrobnosti návrh Clauda při implementaci – [Napojení blízko
> křižovatky](#napojení-blízko-křižovatky-3-11-2026) níž).

Návrh Clauda:

- **Kdy:** v uzlu, kde končí **3 až 5 cest** (5 – Martin 3. 11. 2026) – i zarůstající, po které už nikdo nechodí
  (opuštěná se nepočítá; pahýly úklid odstraní dřív). ~~Každou vede trasa aspoň v udržovacím prahu
  jejího druhu.~~ (návrh Clauda 1. 11. 2026 – [Křižovatka i se zarůstající
  cestou](#křižovatka-i-se-zarůstající-cestou-vlkov-1-11-2026)). Dvě cesty křižovatku nemají (spojí se). ~~Pět a víc
  se nečeká; kdyby se sešly, uzel se rozdělí~~ **Šest a víc** (Martin 3. 11. 2026) se nečeká; kdyby
  se sešly, uzel se rozdělí na **dvě křižovatky 10 m od sebe** (u širších cest
  dál – Rozestup níž) spojené krátkou cestou – ramena se rozdělí na dvě skupiny sousedních podle
  úhlu, každá skupina 3–4 ramena plus spojka (6 cest = dva kříže, 7 = kříž a hvězda).
- **Tvar:** **kříž** – 4 ramena po 90°; **Y** – 3 ramena: kmen a dvě větve souměrně kolem směru
  proti kmeni, každá větev o β = 30–60° (po 5°) od té osy (β = 60° je souměrné trojcestí po 120°,
  β = 30° klasické Y); **hvězda** – 5 ramen: kříž a páté rameno v ose jedné jeho mezery, 45° od
  obou sousedů (návrh Clauda 3. 11. 2026 – [Napojení blízko
  křižovatky](#napojení-blízko-křižovatky-3-11-2026)).
- **Natočení:** po 5°, aby součet čtverců odchylek ramen od směrů přicházejících cest byl nejmenší
  (směr cesty = od středu k bodu osy 12 m daleko; přiřazení ramen cestám – všechna pořadí, nejvýš
  24, u hvězdy 120); při shodě menší úhel a menší β. Zemská stezka se neohýbá – je-li v uzlu, natočení se k ní
  přizpůsobí (její rameno přesně v jejím směru).
- **Vchody:** na konci ramene, **1,5 × šířka nejširší přicházející cesty** od středu (vyšlapaná
  1,9 m → 2,85 m, upravená 3 m → 4,5 m, vozová 3,5 m → 5,25 m). **Cesta vede přesně do vchodu:**
  posledních nejvýš **12 m** osy se nahradí obloukem od bodu 12 m daleko do vchodu s tečnou ve
  směru ramene (kubická Bézierova křivka – tečna ve směru osy na začátku oblouku i ve směru ramene
  ve vchodu, aby oblouk navazoval na obou koncích; body po 1 m, na cm; návrh Clauda 24. 10. 2026,
  Úloha 9a – kvadratická křivka by navazovala jen ve vchodu). Osa se tím u křižovatky změní – nahrazuje
  to dřívější „osa se nikdy nehýbe“ jen v tomto okolí. Kmeny hatě, místa na stromy a jabloně
  v ohnutém kusu zůstanou, kde jsou (do 2,2 m od nové osy místo zmizí). **Oblouk nevede
  neprůchodnou plochou víc než neohnutá osa** (stavba, plot, obilná jáma, zemní práce – nejdelší
  souvislý kus osy po 1 m; návrh Clauda 24. 10. 2026): jinak konec zůstane neohnutý a vede rovně do
  středu. Krátká cesta mezi dvěma křižovatkami kolem obilné jámy ve Vlkově se dřív oběma oblouky
  narovnala přes jámu, měsíční kontrola ji opustila a z vyšlapanosti vznikla znovu – každý měsíc.
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
    rohy mezi rameny (kříž jako plus, Y jako tři pásy) – žádný kruh; plácek má povrch a měkké
    okraje navazujících cest, vnitřní rohy jsou oblouk a ramena plynule přecházejí do pásů, koleje
    vozové cesty vedou přes plácek, jen kudy vozová cesta vede skrz (Martin 24. 10. 2026: „ty
    ostrý křižovatky už jsou upravený?“, „Předtím ty křižovatky byly tedy lepší“ – žádný šedý
    štěrkový plácek; provedení návrh Clauda); kámen a kůl mají po dvou
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
  - **rameno** = každá neopuštěná cesta, která v uzlu končí, i zarůstající (~~živá cesta = provoz
    kusu u křižovatky aspoň udržovací práh druhu~~ – návrh Clauda 1. 11. 2026); opuštěná ne.
    Ramena se posuzují každý měsíc;
  - **neohýbá se** vozová cesta, zemská stezka, cesta ve vylepšení a úsek kratší než 12 m (spojka
    do branky – ohnul by se celý); jejich rameno leží přesně v jejich směru, druhá pevná cesta
    navazuje, jak je (rovný kus do vchodu zatím ne);
  - po přepočtu tvaru zůstane **strom znamení, kde roste** (strom se nestěhuje), kámen a kůl se
    posunou do nejširší mezery; místo se stromem do 2,2 m od nové osy zůstane;
  - plocha pod křižovatkou, kde se neorá: pásy ramen a spojnice sousedních ramen ve vzdálenosti
    šířky nejširší cesty od středu (místo kruhu 1,3 × šířka);
  - uzel s 5+ živými cestami (nečeká se; Vlkov žádný) se při měsíčním úklidu rozdělí na dvě křižovatky se spojkou (i opakovaně, 8+ cest).
- **Rozestup** (Martin 24. 10. 2026 na dotaz, jestli se pustit do křižovatek blízko sebe – Vlkov měl
  dvě dvojice jen ≈ 6 m od sebe a jejich plácky se překrývaly: „jo, pusť se do toho“; pravidlo návrh
  Clauda): dvě křižovatky **nesmějí stát tak blízko, aby se jejich plácky překrývaly**. Nejmenší
  rozestup středů = dosah plácku jedné + dosah druhé + **1 m** rezervy (kus cesty mezi nimi); dosah
  je kružnice opsaná obrysu – vchod (1,5 × šířka) a půl šířky nejširší cesty v ramenech:
  vyšlapaná ≈ 3 m, upravená ≈ 4,7 m, vozová ≈ 5,5 m, takže dvě vyšlapané ≈ 7 m, dvě vozové
  ≈ 12,1 m. Při měsíčním úklidu (před tvarem křižovatek; nejbližší dvojice napřed):
  - **vejdou-li se do jedné** – spojuje je jediný úsek a bez něj do nich vedou nejvýš ~~4~~ **5** živých
    cest (dvě Y, nebo kříž a Y – Martin 3. 11. 2026) –, **sloučí se** do jedné křižovatky (kříž,
    hvězda) uprostřed mezi nimi, krátký spojovací
    úsek zmizí; zůstane starší křižovatka i se znamením (kámen a kůl se posunou, strom druhé stojí
    dál jako strom u cesty);
  - **je-li jedna z nich napojením** na spojku (i když je spojka pevná nebo vozová a pevné rameno
    mají obě), napojená cesta se **přitáhne do druhé** ([Napojení blízko
    křižovatky](#napojení-blízko-křižovatky-3-11-2026));
  - **jinak** (6 a víc cest, spojka je zemská stezka nebo cesta ve vylepšení – ta se neruší, nebo je
    spojuje víc úseků) se **odsunou od sebe** po spojnici středů na nejmenší rozestup, každá o půl;
  - uzel s **pevným ramenem** (zemská stezka, cesta ve vylepšení, vozová cesta – její osa leží na
    zemních pracích) se nehýbe jako kotva: sloučí se do něj, nebo se odsune jen druhá; spojka, která
    je sama pevná (nebo vozová), se neslučuje a nemaže. **Přijatá výjimka:** mají-li pevné rameno
    (nebo kotvu) oba uzly, zůstanou, kde jsou, i když se plácky překrývají; ve scéně se plácky
    o úsek mezi nimi dělí v půli překryvu a koleje vozové cesty vedou po celé jeho délce
    (oprava z 2. 11. 2026 – Martin ve Vlkově: „Tento úsek (road 1387 – od junction 1131 do
    junction 1619) je veden jako vozová cesta, ale nevypadá tak“; provedení návrh Clauda,
    `docs/code/scene.md`);
  - nový střed musí být **průchodný** (ne v domě, plotu ani zemních pracích) a žádný úsek se posunem
    nezkrátí pod 15 m (už kratší vůbec); jinak se uzel nehýbe a posun převezme druhý, případně
    zůstanou obě (stejná výjimka). Pole a voda se nekontrolují. Odsunem se může jiná dvojice dostat
    pod rozestup – srovná se v témže průchodu (nejbližší dvojice napřed), co se nevejde, v dalším
    měsíci; stav kusů a místa stromů u posunuté cesty se nepřepočítávají (posun je pár metrů na
    konci úseku, strom stojí dál jako strom u cesty);
  - uzel **u vchodu** (do 3 m) se nehýbe – sloučí se do něj, nebo se odsune jen druhá (vchod by
    přišel o cestu);
  - rozestup roste se šířkou cest – vylepší-li se cesty, dvojice se srovná v dalším měsíci; starší
    vsi se srovnají v prvním měsíci, pokud nemají v obou uzlech pevné rameno (Vlkov: všechny tři
    dvojice pod rozestupem – Y a Y 6,7 m, dva kříže 6 m, kříž a Y 11,7 m – mají v obou uzlech
    vozovou cestu, takže zůstávají jako přijatá výjimka; ~~Vlkov 2. 11. 2026: 1131 a 1619 9,8 m –
    přijatá výjimka~~ – od 3. 11. 2026 se napojení přitáhne: [Napojení blízko
    křižovatky](#napojení-blízko-křižovatky-3-11-2026)).
- **Změna:** přibude-li nebo ubude-li rameno, tvar a natočení se spočítají znovu, znamení zůstane;
  klesnou-li ramena na 2 (cesta zarostla a zmizela, nebo je opuštěná), křižovatka zanikne a cesty
  se spojí.

### Napojení blízko křižovatky (3. 11. 2026)

Martin 3. 11. 2026 na otázku, zda nové napojení cesty blíž než rozestup křižovatek (Vlkov: upravená
cesta 1618 se napojila na vozovou 1387 9,8 m od kříže 1131 a vznikla druhá křižovatka 1619) přitáhnout
přímo do stávající křižovatky: „ano“ – pět ramen smí jedna křižovatka, šest a víc se dál dělí.
Provedení návrh Clauda:

- **Při napojení:** kde by se konec nové cesty napojil na pevnou cestu (vznik z vyšlapanosti
  do 10 m od cesty, zacelení díry do `JOIN_GAP_M`) a ta by se v tom bodě rozdělila (rozcestí), a bod
  leží **blíž než rozestup křižovatek** od konce té cesty, ve kterém už končí 3–4 cesty (křižovatka
  – rozestup jako u dvou křižovatek: ramena křižovatky a nové napojení, Vlkov vozové ≈ 12,1 m),
  **konec nové cesty se napojí přímo do středu té křižovatky a napojovaná cesta se nerozdělí**.
  Nová cesta pak vede od svého konce rovně do středu; při nejbližším měsíčním úklidu se tvar
  křižovatky spočítá znovu (přibylo rameno – Y → kříž, kříž → hvězda) a konec se ohne do vchodu
  nového ramene jako každý jiný (posledních 12 m obloukem). Křižovatka s pěti rameny už nepřitahuje
  – napojí se jako dřív (rozcestí) a dvojice se řeší podle Rozestupu (odsunutí, šest cest se
  nevejde do jedné). Do uzlu, ze kterého napojovaná cesta sama vychází, se nepřitahuje (okruh).
- **Tvar pěti ramen – hvězda:** kříž (4 ramena po 90°) a páté rameno v ose jedné mezery, 45° od
  obou sousedů. Natočení a přiřazení cest ramenům jako u kříže a Y – po 5°, nejmenší součet čtverců
  odchylek přes všech 120 pořadí, pevná cesta (vozová, zemská stezka) určí natočení přesně; tím
  zůstane rovná vozová cesta skrz kříž rovná (pravidelná hvězda po 72° by ohnula všechna ramena
  a dvě protilehlá vozová ramena by neměla). Vchody jako u ostatních – 1,5 × šířka nejširší cesty;
  plácek jsou pásy pěti ramen a v každé mezeře oblouk tečný k okrajům sousedních pásů (v mezeře 45°
  tečné body leží ve vchodech, takže plácek nevyčnívá za kružnici dosahu a rozestup platí beze
  změny). Koleje vozové cesty vedou přes plácek jen mezi rameny, kudy vozová cesta vede skrz
  (protilehlá – víc než 120°), do pátého ramene ne. Znamení v nejširší mezeře jako u ostatních.
  Název v popisku je Křižovatka a portrét je kříž (hvězda je kříž s pátým ramenem).
- **Staré dvojice (Vlkov 1131 + 1619):** při měsíčním úklidu (krok Rozestup, po sloučení a před
  odsunutím) se **napojení přitáhne**: uzel se 3 rameny, z nichž dvě jsou kusy jedné cesty (spojka
  k druhé křižovatce a její pokračování – stejný druh, při víc možnostech nejrovnější pokračování),
  třetí je napojená cesta. Ta se přitáhne do druhé křižovatky (napřed do starší, menší id), má-li ta
  nejvýš 4 ramena: osa bez posledních 12 m (oblouk do vchodu napojení) a odtud rovně do středu
  křižovatky, pak se ohne do vchodu nového ramene. Kusy jedné cesty se spojí zpátky do jednoho
  úseku (jako „falešné rozcestí“), druhá křižovatka zanikne (strom znamení stojí dál jako strom
  u cesty, kámen a kůl zmizí), starší si nechá id, znamení i den vzniku. Platí i tam, kde mají obě
  pevné rameno (přijatá výjimka Rozestupu se na napojení nevztahuje) – vozová cesta se nehýbe,
  hýbe se jen napojená. **Nepřitáhne se** cesta, která se u křižovatky neohýbá (vozová, zemská
  stezka, ve vylepšení, kratší než 12 m), napojení u vchodu (do 3 m – vchod by přišel o cestu)
  a cesta, jejíž nová osa by vedla neprůchodnou plochou nebo přes stavbu či plot víc než dosavadní
  – ta dvojice zůstane jako dřív. Místa na stromy daleko od nové osy zmizí (místo se stromem
  zůstane); stav kusů se nepřepočítává (jako při odsunutí). Jednou a idempotentně: po přitažení
  dvojice není, další měsíc nic; dopočet po kouscích dá totéž co vcelku.
- **Vlkov (kopie stavu 3. 11. 2026, den 129225 → měsíční úklid):** z 1131 (kříž) + 1619 (Y) je
  hvězda 1131 (ramena 1618, 1385, 1476, 1386, 1387), vozová 1387 a 1617 jsou zase jeden úsek 1387,
  1619 zanikla. Stejně dopadla druhá taková dvojice – kříž 1132 a Y 1497 7,9 m od sebe (napojení
  1396 na vozovou 1494/1495) → hvězda 1132. Konců „(!)“ (napojení bez křižovatky) žádný; dva
  starší konce nikam (1312, 1350) jinde ve vsi zůstávají, jak byly. Další měsíc beze změny.
- **Data:** `VillageRoads.junctions` – id, střed, tvar, natočení, β, ramena (id úseku ve vchodu),
  znamení, den vzniku. Úsek ví, že končí ve vchodu (konec osy = vchod).
- **Co hráč vidí:** udusaná hlína ve tvaru kříže nebo Y – pásy ramen v šířce přicházejících cest,
  střed vyplněný mnohoúhelníkem mezi nimi, okraje nepravidelné jako u cesty; **žádný kruh**.
  Kliknutím (do 3 m od středu) se vybere – panel: ikona tvaru (kříž, Y), cesty v ramenech (druhy),
  znamení. Akce žádné (hráč cesty jen vylepšuje). Pod křižovatkou se neorá (dřív kruh – [roads.md
  – Cesta přes pole](roads.md#cesta-přes-pole)).
- **Pěšiny dne** rozcestí-plácky nemají (dřív jemný kruh `ribbonJunctions`) – čáry tras se jen
  potkají.

### Křižovatka i se zarůstající cestou (Vlkov, 1. 11. 2026)

Martin 1. 11. 2026 (Vlkov): vozové cesty 1394, 1275 a 1264 „se spolu střetávají, ale přesto mezi
nimi není křižovatka“ – v panelu cesty končily „(!)“ na jiné cestě bez křižovatky, proti pravidlu 11
(„Žádná cesta nemůže existovat jen tak sama v prostoru, vždycky musí spojovat dvě místa – kombinaci
budov a křižovatek.“).

- **Příčina:** všechny tři končily v jednom bodě (203,34; −232,44), ale po 1275 už nikdo nejezdil –
  provoz na jejím jediném kusu 0 (udržovací práh vozové 0,25 cesty za den), stav kusu 45 % a klesá.
  Ramena se počítala jen ze **živých** cest, takže v uzlu byla 2 → křižovatka zanikla. Spojit se ale
  zbylé dvě nemohly – v uzlu pořád ležela třetí (spojování úseků bere každý neopuštěný úsek). Stav
  „tři cesty v bodě bez křižovatky“ tak trval, dokud 1275 nezaroste (≈ 13 herních let). Ve
  Vlkově takových uzlů bylo pět (vždy dvě živé a jedna zarůstající cesta, 12 konců „(!)“).
- **Pravidlo (návrh Clauda):** ramenem křižovatky je **každá neopuštěná cesta**, která v uzlu končí
  – i zarůstající, po které už nikdo nechodí: dokud tam leží, je to cesta, která se s ostatními
  potkává. Zanikne až se zarůstáním (kusy na nule) – pak má uzel 2 cesty, křižovatka zanikne a cesty
  se spojí. Opuštěná (pod stavbou, objížďka) ramenem není, ale ani nebrání spojení. Uzel tak má vždy
  buď 2 cesty (spojí se), nebo 3–4 (křižovatka), nebo 5+ (rozdělí se) – „cesta na cestě bez
  křižovatky“ nevzniká. Mrtvá cesta nezmizí hned – zarůstá podle druhu jako každá jiná (Zarůstání).
- **Starší vsi** se srovnají v nejbližším měsíčním úklidu (křižovatky se počítají každý měsíc
  i bez úklidu) – převod netřeba. Vlkov (stav z 1. 11. 2026, dopočet měsíce): 5 nových křižovatek
  Y v těch pěti uzlech, žádná se neposunula ani nezanikla, konců „(!)“ 12 → 0; za rok beze změny.

### Ohyb ramene ne přes stavbu (26. 10. 2026)

Audit Vlkova po odstupu od plotů: rameno nové křižovatky (úsek 1060) vedlo 4,5 m krajem polozemnice 2137. Ohyb konce do vchodu ramene hlídal jen mřížku chodců po buňkách – buňka na kraji domu se středem
mimo dům je průchodná, osa jí vedla domem.

Pravidlo (návrh Clauda – nejjednodušší správné): ohnutý konec osy nesmí mít ve stavbě nebo u plotu
**větší podíl délky** (vzorky po 1 m) než neohnutá osa – podíl, ne počet vzorků, aby delší oblouk
neprohrál jen tím, že je delší (recenze 26. 10. 2026); vede-li neohnutá osa mimo stavbu, oblouk do
ní nesmí vůbec. Jinak se konec **neohne** (osa zůstane, rameno
křižovatky vede rovně do středu jako dosud). Stavba se měří přesně – obdélník obydlí i se šíjí
(s pozemkem celý pozemek), staveniště, milíř, modla, humno… jako v mřížce chodců – a plot hřbitova,
ohrady a pozemku pruhem **1 m** (`FENCE_CLEARANCE.axisM`, [Odstup od plotu](#odstup-od-plotu-26-10-2026)).
Hledat jiný oblouk se nevyplatí: konec bez ohybu je dnešní stav cesty, takže horší být nemůže, a měsíční
kontrola ho neopouští. Vlkov po přestavbě: přes dům 2137 nevede nic.

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
- **Cesta do branky** (Martin 25. 10. 2026: „Jeden z největších problémů vidím tady u hřbitova“;
  návrh Clauda): cesta, která jde do 3 m od vchodu, ale v něm nekončí, vchod dřív „obsloužila“ jen
  tím, že šla kolem (Vlkov: 1,9 m od branky hřbitova). Teď se její osa **ohne přes bod 1,5 m před
  vchodem** (ve směru, odkud trasa přichází; ohyb 4 m osy na každou stranu, konce cesty zůstanou),
  takže cesta skutečně ústí do branky. Vozová cesta se neohýbá (zemní práce) – je široká 3,5 m
  a vchod do 3 m od osy má na okraji cesty (zjednodušení). Neohýbá se ani úsek ve vylepšení ani
  zemská stezka (osa leží na rozestavěných zemních pracích a kusech stezky), a nová osa ani bod
  před vchodem nesmí vést přes plot, stavbu ani vodu bez brodu (vzorky po 0,5 m). Pak cesta
  zůstane, jak je: vede do 3 m od vchodu, takže krátká spojka do branky nevznikne (vchod cestu
  má – kotva vchodu do 3 m) a spojka by byla kratší než nejkratší cesta k vchodu; branku obslouží
  okraj cesty jako u vozové (návrh Clauda).
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
  Od 31. 10. 2026 je to výslovně **odhad** (Odhad vzdáleností níž) – rovně i les a objížďka přes
  brod.
- **Kdy se přepočítá:** s trasami (Kdy se trasy počítají).
- **Uložení:** `walkDistanceM` dílů a čtverců sadu, `forestWalkM` a `waterWalkM` obydlí – jako
  dřív. Kalibrace bez krajiny počítá dál vzdušnou čarou a cesty nemá.

## Odhad vzdáleností (31. 10. 2026)

Martin 31. 10. 2026: „**simulace bude počítat jen s odhadem vzdáleností a přesné trasy zůstanou
prohlížeči – udělej to rovnou**“; týž den: „obecně by měla být vizuální stránka oddělena od herní
mechaniky…“ a „Ta věc (dům, ohrada, hřbitov) se prostě postaví a dál se s ní nic neděje, pokud
nespadne“. Model návrh Clauda:

- **Cena práce v simulaci** (chůze k dílům pole a čtvercům sadu, pro vodu, palivo a dřevo stavby,
  cena u kurzoru; jízdy vozu – svoz, voda vozem, uhlí a ruda, osivo; cesta spřežení k orbě
  a přesun mezi bloky) se počítá **odhadem bez hledání tras**: kratší z „rovně“ a „rovně k síti,
  po ní a rovně k cíli“.
- **Rovně = úsečka po povrchu** po půlbuňkách terénu pěšin: louka 1, pole stálou cenou, mokřina,
  les; chodec lesem 1 / 1,35× (cena lesa v síti pěšin), vůz lesem ani zarostlým dílem neprojede.
  **Voda:** úsečka přes potok mimo brod jde **objížďkou přes nejbližší brod** (brod s nejmenším
  součtem vzdáleností od začátku a ke konci úsečky; chodec + 30 m za brodění, vůz brodem
  `fordCost`). Bez brodu v okně se chodec brodí kdekoli jako dřív a vůz nedojede. Most a hať
  dává síť (lávka jen pro pěší).
- **Síť zrychluje dál:** chodec po pěšinách stálých tras (síla z vyšlapanosti) a pevných cestách
  (stupeň, olemování, mokřina a brody na ose) – graf os, ne mřížka; vůz po pevných cestách
  (rychlost vozu podle druhu, vyježděná, olemování), na síť najede v nejbližším bodě každé cesty.
  **Chodec stejně** (od 31. 10. 2026 – návrh Clauda „vzdálenosti chůze s jedním napojením“,
  Martin 31. 10. 2026 na čtyři jisté úspory: „Ano“): z obydlí na síť a ze sítě k dílu, čtverci
  sadu, vodě či okraji lesa jen v nejbližším bodě (vzdušnou čarou) každé pěšiny a cesty, ne
  v kterémkoli bodě sítě. Chůze tak síť nikdy nezkrátí víc než dřív – kde by se vyplatilo
  sejít z pěšiny šikmo dřív nebo později, vyjde o kus déle. Vlkov (3 783 dílů, přepočet
  `routes-v10`): medián +1,5 % (+4 m), 90 % dílů do +8 % (+26 m), nejvíc +22 % (+88 m),
  průměr 336 → 345 m; voda z obydlí medián +0,3 %, okraj lesa 8 z 10 obydlí beze změny.
- **Opevnění jen branou** (6. 11. 2026 – pravidlo fortifications.md, Martin 6. 11. 2026: obvod
  blokuje chodce kromě bran; oprava podle Martina 6. 11. 2026: „někteří lidi procházejí
  palisádou“): úsečka rovně ani úsek pěšiny či cesty stěnou mimo bránu nejde – jde objížďkou:
  rovně k bráně, branou a kolem rohů stěn k cíli, nejkratší lomenou čarou (návrh Clauda 6. 11. 2026, rohy odsazené o 1 m). Přes
  stěnu se „leze“ s přirážkou 1 000 m jen jako poslední záchrana, kam se bez stěny dojít nedá
  (opevnění bez brány, kout mezi stěnami – návrh Clauda). Osa pěšiny smí u otvoru brány zasáhnout
  do stěny nejvýš 1 m (jde středy buněk brány – návrh Clauda). Platí stejně pro odhad simulace
  i postavy ve scéně.
- **Svah jen pro vůz, levně:** kus úsečky (dvě buňky) se sklonem do poloviny meze (`maxGrade`
  10 %) stojí × (1 + 4 · (sklon / mez)²) jako ve vozové síti; prudší kus stojí nejvýš jako
  serpentiny se sklonem poloviny meze – vůz rovně do srázu nevyjede, ale objede ho. Po pevné cestě
  stejně, vozová cesta má úvozy (bez svahu).
- **Dvoukolák i čtyřkolák** mají v odhadu stejnou cenu (liší se jen zatáčením v přesné trase).
- **Co zůstává:** stálé trasy (pěšiny) se hledají jen se stavbou nebo zánikem stavby ~~a trasy
  k práci dne 1. dne v měsíci~~ (od 31. 10. 2026 trasy k práci dne nejsou – Stálé trasy,
  pravidlo 5) – z nich je provoz a vyšlapanost jako dosud. Roční síť vozů 1. 11.
  (jízdy roku do vyšlapanosti a příznak vozová) hledá trasy vozu jednou za rok.
- **Přesné trasy jen pro pohled:** trasu vozu, spřežení a postav počítá pohled na ves (scéna)
  stejnými deterministickými funkcemi jen pro to, co ukazuje – simulace mřížku vozu nestaví.
- **Kudy chodí postavy ve scéně** (1. 11. 2026 – Martin: „Koukám na tuhle buchtu: person 4431,
  která jde na pole. Ale místo, aby to vzala po cestě … tak šla přímo skrz pole.“ a „Tenhle týpek:
  person 4473 šel pro dřevo a taky se vysral na cesty a šel přímo“; model návrh Clauda): postava
  jde **týmž modelem jako odhad simulace** – kratší z „rovně“ a „rovně k nejbližšímu bodu
  pěšiny či cesty, po síti a z nejbližšího bodu rovně k cíli“; síť jsou pěšiny stálých tras se
  silou z vyšlapanosti a pevné cesty (stupeň, olemování, mokřina a brody), rovně po půdě krajiny
  a polí – tatáž data jako simulace, takže délka činnosti (odhad) je cena právě té trasy. Platí
  pro všechny cesty chodců (pole, dřevo, voda, stádo, dílna, stavba, jízdy vojvody). Uložená
  trasa domácnosti, která začíná u brány a končí u cíle, má přednost, jen když je chůze po ní
  nejvýš o 10 % delší než nejkratší podle odhadu. Trasa po síti nesmí přes dům, plot ohrady, hrob
  ani vodu mimo brod (jinak rovně kolem domů, pak uložená trasa, pak síť s mírnějším měřítkem
  provozu). Dřív scéna šla po uložené trase jen tehdy, když končila do 30 m od cíle – na velkém
  poli a ke skupince stromů tak šla rovně (Vlkov: z domu 2137 na 3 782 dílů polí 3 246 rovně,
  po síti 0; teď po síti 3 530, rovně 46).
- **Tempo ve scéně nejvýš jako po pěšině** (1. 11. 2026 – Martin: „Žena rolníka z tohoto domu:
  dwelling 1321 právě sprintovala po cestě road 1459“; návrh Clauda): po pevné cestě je chůze
  v ceně simulace 1,5–1,7× rychlejší, ve scéně jde postava nejvýš 1,3× přirozenou chůzí (jako po
  plné pěšině – rychlejší krok vypadá jako běh) a délka chůze v rozvrhu se o rozdíl prodlouží;
  odhad doby a nakreslená trasa jsou táž trasa. Když jediná schůdná trasa vede dlouhou oklikou,
  kterou odhad (rovně skrz dům a pozemek) nezná – cíl za domem, dveře u sousedního pozemku –,
  jde postava v čase rozvrhu rovně (neběží). Dřív: obydlí 1321 → humno 2609 rovně 18 m, odhad
  18 m, nakreslená uložená trasa 105 m po cestě 1459 → 5,7× = 8,6 m/s.

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

## Jednorázová přestavba sítě (24. 10. 2026)

Martin 24. 10. 2026: „Chápu, že cesty, co jsou teď ve Vlkově, se nějak historicky vyvíjely. Můžeš
však udělat jednorázovou opravu, která všechny cesty předělá správně?“ – na návrh Clauda zvolil
**variantu A**: „vylepšení se přenesou na nové cesty, které vedou zhruba tam, kde staré; vozové
cesty se po nových osách přepočítají i se zemními pracemi a budou rovnou hotové (už jsou
zaplacené); staré úvozy a náspy, které nové osy nepoužijí, zarostou.“

Postup (návrh Clauda) – starší ves při načtení jednou a idempotentně (příznak `roads.rebuilt`,
nová ves ho má od začátku), po převodu na nový systém (Převod starých vsí) a po trasách:

1. **Vyšlapanost** se naseje, jako by se po dnešních trasách chodilo **rok** (`ROAD_REBUILD.seedDays`):
   na políčku (provoz − 1 cesta) × 365 dní, nejvýš strop; kde je vyšlapanost už vyšší, zůstane.
   Trasy za prací nesou jen stálou část jako za běhu (Vyšlapanost a vznik cesty).
2. **Všechny cesty se zahodí** i s křižovatkami – kromě pevných výjimek: cesta ve vylepšení (stavba
   s úseky), úseky rozestavěné zemské stezky, hotové úseky **rozestavěné** vozové cesty (leží na ose
   zemních prací se stavbou) a opuštěný kus pod stavbou (jen dál bledne). Hotová vozová cesta se
   zahodí taky a pro přenos vylepšení je upravenou cestou (bod 8).
3. **Cesty vzniknou znovu** stejnými funkcemi jako za běhu: měsíční kontrola bez ohledu na datum
   a s úklidem vždy – vznik z vyšlapanosti od kotvy ke kotvě, úklid (souběžné, copánky, díry,
   spojení, pahýly), cesty k vchodům, kusy pod stavbami a křižovatky i s rozestupem. Po každém
   průchodu se přepočítají trasy (po nových cestách) a průchod se opakuje, dokud se síť nemění,
   nejvýš **4×** (`ROAD_REBUILD.passes`). Nová cesta, kterou průchod hned opustil (vede pod
   stavbou), zmizí – stará cesta to nebyla.
4. **Přenos vylepšení:** nový úsek, jehož aspoň **60 %** délky leží do **4 m** od osy staré upravené
   cesty nebo stezky, je upravený **i s hatí a lávkou jako hotové** (staré „bez hatě“ se nepřenáší
   – za variantu A je zaplacené); stejně se přenese příznak vyježděná a průsek lesem. Nic se
   nesnižuje.
5. **Zemské stezky:** kus osy hotové stezky, kam nová síť nedosáhla (dál než 4 m – typicky k okraji
   mapy, kudy se skoro nechodí), se vrátí jako úsek téhož stupně napojený na síť. Stezka bez úseků
   se pak znovu najde po síti od dvorce ke kraji mapy – napřed po upravených a vozových cestách,
   jinak i po vyšlapaných, které se na ní upraví (stezka je upravená cesta). Křižovatka je pro
   hledání jeden uzel (ramena končí ve vchodech, ne v jednom bodě). Bez spojení stezka zůstane bez
   úseků jako dřív.
6. **Rozestavěná vylepšení** (cesta i zemní práce s rozestavěnou stavbou) se nemění a dostaví se
   normálně.
7. **Stromy a jabloně u cest** zůstávají: strom patří nejbližšímu novému úseku do své vzdálenosti
   od osy + 4 m, dál stojí bez cesty do smrti (křižovatka ho může převzít za znamení, jako po
   zaniklé křižovatce); jabloň patří nejbližšímu živému úseku. Olemování se přepočítá. Stav kusů
   nových úseků je plný. Kronika se nemění.
8. **Vozové cesty** (Úloha R2, návrh Clauda 24. 10. 2026 podle varianty A), když se síť po bodech 3–7
   ustálí:
   - **Kus staré vozové osy, kam nová síť nedosáhla** (dál než 4 m, souvisle aspoň **60 m** –
     `ROAD_REBUILD.wagonPatchM`, ≈ úsek stavby), se vrátí jako upravený úsek napojený na síť – jako
     u stezek (bod 5). Bez toho by vozová cesta, po které se skoro nechodí, zmizela (Vlkov: 1 km
     k severnímu okraji mapy). Kratší kusy (zbytky ve vsi, které nová síť vede jinudy) se nevrací.
   - **Staré hotové zemní práce přestanou patřit cestě** (`abandonedDay`): terén zůstává (je to
     herní terén – cesty i stavby s ním počítají), svahy zarostou (níž).
   - **Řetěz nové sítě** (úseky mezi rozcestími a konci), jehož aspoň **60 %** délky leží do **4 m**
     od osy staré vozové cesty, se upraví (zaplaceno – „Napřed uprav cestu.“ přestavbu nezastaví)
     a **naplánuje jako vozová cesta stejně jako na serveru** – po ose řetězu, s narovnáním kliček
     a objížďkou či serpentinami, nad terénem i se starými zemními pracemi (kde stará pláň leží,
     nová skoro nic nekope). Plán se **zapíše rovnou hotový**: zemní práce se všemi úseky
     dostavěnými v den přestavby, bez stavby a bez ceny; kácení z plánu je provedené jako po stavbě
     (pařezy, klády na hromadu, lávky u nových brodů bez dřeva – zaplaceno); stará cesta pod
     vozovou zmizí a obejité kusy jsou opuštěné a zarostou jako po stavbě. Nevyjde-li plán (moc
     krátká, okruh, moc prudká…), řetěz zůstane upravený. Pak se síť znovu ustálí (body 3–7 –
     křižovatky, úklid a trasy po vozových cestách).
   - **Rozestup křižovatek:** úsek, jehož aspoň 60 % délky leží u staré vozové osy, má už při
     ustalování sítě (body 3–7) pro rozestup křižovatek šířku vozové cesty (3,5 m → 12,1 m) –
     křižovatka s vozovým ramenem se po přepočtu nehne, takže se odsune předem.
   - **Rozestavěná vozová cesta** (zemní práce se stavbou) se nemění a dostaví se normálně.
   - **Po kusech řetězu** (návrh Clauda 25. 10. 2026 – Vlkov: řetěz u hřbitova ležel u staré
     vozové osy jen 33 %, a tak nebyl vozovou cestou ani jeho kus po ní): řetěz pod 60 %, jehož kus
     leží u staré vozové osy souvisle aspoň 60 m, má vozovou cestu jen na tom kusu (uzly na koncích
     kusu); zbytek zůstane, jak je. Vrácený kus staré osy (stezky i vozové) se napojí na síť do
     12 m jako díra v úklidu (dřív do 5 m).
   - **Svahy staré zemní práce zarostou** celé i s lemem za **5 let** jako opuštěná cesta
     (`SLOPE_LOOK.wildYears`); kde vede nová zemní práce (do dosahu svahů), kreslí svahy jen ta – kus
     staré, který nová osa použila, tak vypadá jako nový, nepoužitý zaroste.

Vlkov (den 114787, měření ve scratchpadu R1): 49 úseků → 46 (živých 36 → 33), křižovatky 12 → 10,
konce mimo kotvu 6 → 0, úsek přes dům 1 → 0, dvojice křižovatek pod rozestupem 2 → 1, upravené
481 m → 510 m, stezka na východ (dřív bez spojení) vede ke kraji mapy; chůze k vodě −0,9 %, k polím
+0,1 %. Přestavba trvá ≈ 4 s jednou za život vsi. Po 12 měsících je živých úseků 34 a křižovatek 12
(dostavěná vozová cesta převzala dva upravené úseky). Otevřené: u obilné jámy mezi dvěma
křižovatkami (≈ 243, −258) vznikne každý měsíc 17 m vyšlapaná cesta přes jámu, kterou kontrola hned
opustí (+12 opuštěných kusů za rok). Příčina (R2): cesta vznikla z vyšlapanosti kolem jámy, ale
oblouky obou konců do křižovatek ji narovnaly přes jámu – oblouk teď neprůchodnou plochou nevede víc
než neohnutá osa (Křižovatky – Vchody).

**Vlkov po R2** (den 114787, měření ve scratchpadu R2): vozové úseky 18 (2 994 m, z toho 358 m
rozestavěné cesty) → 13 (2 860 m); nové hotové zemní práce 11× (2 502 m – 433 m a 663 m po staré
ose, 1 085 m k severnímu okraji vrácený kus), 3 krátké řetězy u starých vozových os zůstaly upravené
(„moc krátká“); 14 starých zemních prací (2 656 m) zarůstá, rozestavěné 4044 a 4046 beze změny.
Dvojice křižovatek pod rozestupem 2 → 0, úsek přes dům 1 → 0, odkazy na zmizelé úseky 0. Vůz od
ohrady k vodě 375 → 378 m (7,8 → 7,9 min), k dílům polí ⌀ 457 → 459 m (9,5 → 9,6 min); chůze
k vodě −5,6 %, k polím +3,6 % (nové svahy vedle starých). Přestavba ≈ 10 s. Po 1 i 12 měsících
42 úseků a 10 křižovatek, opuštěné kusy nepřibývají (u obilné jámy už ne).

**Chyba a přestávky** (návrh Clauda 24. 10. 2026, po recenzi): skončí-li přestavba výjimkou, ves
zůstane se starou sítí, dostane příznak `rebuilt` i `rebuildFailed` a přestavba se už nezkouší –
chyba je pro týž vstup deterministická a jinak by zablokovala každé načtení vsi. Server přestavbu
počítá po krocích (průchody, přepočet vozových cest) a mezi nimi dává přestávky jako dlouhý dopočet
(port `Pause`), takže ≈ 10 s výpočtu neblokuje ostatní požadavky; výsledek na přestávkách nezávisí.
Odmítne-li se akce, se kterou se přestavba načetla, přestavba se neuloží a spočítá se při dalším
načtení znovu; klient po přestavbě drží stará id úseků, takže první akce nad cestou může skončit
„Cesta neexistuje.“ – obojí jen jednou za život vsi.

**Pole pod novou sítí** (měření Vlkova ve scratchpadu po recenzi): přestavba pole ani díly nemění,
půdu pod cestami přepočítá až první dopočítaný den (`roadFieldsDay`). Před přestavbou 1 pole,
3 501 dílů, 77,333 ha (pod cestami 8 650 m²), zaseto 633 dílů, 14,097 ha, 2 455 kg osiva. Den po
přestavbě 3 500 dílů, 77,323 ha (pod cestami 8 584 m²), zaseto **beze změny** – zmizel jen díl 796
v přílohu (zbylo mu 10 m² vedle staré cesty) a dvěma zasetým dílům se posunem staré cesty změnila
plocha o −1,2 a +3,0 m². Bez přestavby den poté 3 501 dílů, 77,333 ha, zaseto stejně. Po měsíci
s přestavbou zaseto 691 dílů, 15,381 ha, 2 679 kg, bez ní 692 dílů, 15,403 ha, 2 683 kg – rozdíl
není půda pod cestami, ale jiný díl vrácený z přílohu (chůze k dílu 3383 se změnila 422 → 475 m).
Nová síť tedy nevede přes zasetý díl, kudy dřív cesta nevedla, a **zasetou půdu nebere** – pojistka
v přestavbě není potřeba. Návrh Clauda pro případ, že by u jiné vsi brala: vyšlapanost se
v přestavbě na políčkách zasetých dílů nesčítá (`seedWear`), cesta tam vznikne až z přirozené
vyšlapanosti za běhu.

## Jednorázová oprava sítě (25. 10. 2026)

Martin 25. 10. 2026: „Prosím tě, ty cesty pořád zlobí“; „Jeden z největších problémů vidím tady
u hřbitova“; „Žádná cesta nemůže existovat jen tak sama v prostoru, vždycky musí spojovat dvě místa
– kombinaci budov a křižovatek.“ Audit Vlkova (den 115545) našel u hřbitova vozovou cestu
k severnímu okraji mapy, která končila 6,2 m od cesty (přestavba ji vrátila, ale napojovala jen do
5 m a úklid vozové díry vynechával), vyšlapanou cestu podél plotu místo vozové (řetěz u staré
vozové osy jen 33 %) a branku „obslouženou“ cestou, která šla 1,9 m kolem.

Postup (návrh Clauda) – ves po přestavbě sítě při načtení **jednou a idempotentně** (příznak
`roads.repaired`, nová ves ho má od začátku; při chybě ves zůstane jako dřív s příznakem
`repairFailed` jako u přestavby; server dává mezi kroky přestávky):

1. Kusy pod hotovými stavbami jsou opuštěné a zmizí do roka (Provoz po cestě).
2. Úklid se všemi pravidly výš – díry do 12 m i u hotových vozových cest, cesty ohnuté do branek
   (Vchody), křižovatky.
3. **Vozová spojka:** řetěz bez vozové cesty, jehož oba konce navazují na vozovou cestu (konec nebo
   rameno téže křižovatky) a jehož aspoň 60 % délky leží do 4 m od osy hotových zemních prací (i těch,
   které přestavba opustila), se naplánuje jako hotová vozová cesta stejně jako v přestavbě
   (zaplaceno). Vozová cesta tak vede vcelku.
4. Vozová cesta, která ani pak není napojená (volný konec mimo kotvu) a nejezdí ani nechodí se po
   ní, je opuštěná a zaroste. **Ne čerstvá** – do roka od dostavění zemních prací (bez nich od
   vzniku úseku) po ní zatím nikdo jet nemusel – a **nikdy vozová cesta na hotových zemních
   pracích, která je aspoň jedním koncem napojená na síť**: ta se pro nulový provoz neopouští
   a zarůstá pomalu podle druhu (návrh Clauda, `ROAD_LOOSE_WAGON`). Opustit se tak dá jen stará
   vozová cesta bez napojení, nebo na zemních pracích, které přestavba opustila.
5. Trasy se přepočítají a síť se znovu uklidí.

**Vlkov** (den 115545, měření ve scratchpadu `diag-roads-after`): oprava ≈ 2 s; vozová #941 – nová
vozová spojka 72 m po staré vozové ose podél hřbitova (dřív vyšlapaná #906) – #975 k severnímu okraji
jsou jedna vozová cesta (#975 napojená, dřív volný konec); tři další krátké řetězy „moc krátká“.
Audit živé sítě před / po opravě / po 1 / po 12 měsících: konec mimo kotvu 3 / 0 / 2 / 2 (po měsíci
dva konce řezu pod novou stavbou – Stavba přes cestu, bez opravy totéž), pahýl 9 / 9 / 9 / 16, přes
stavbu nebo pole 8 / 9 / 8 / 9, souběh 0, mezera 0, smyčka 3 / 3 / 3 / 6, kličky 9 / 9 / 9 / 9,
provoz 0 4 / 4 / 5 / 4. Opuštěné kusy 15 → 15 / 16 / **5** (pod stavbami zmizely do roka, ostatní
blednou podle druhu – dřív je provoz objížděk držel naplno). Celá síť i s opuštěnými po 12 měsících
s opravou / bez ní: konec mimo kotvu 7 / 17, pahýl 18 / 27, přes stavbu nebo pole 11 / 24, mezera
1 / 9, smyčka 8 / 11, kličky 9 / 12. Stabilita: úseky 24 → 25 → 32, křižovatky 9 → 9 → 12 (bez
opravy 24 → 24 → 31 a 9 → 9 → 13 – ves dál staví). Živé cesty, po kterých trasy jdou, nezarůstají:
úseky s kusem pod udržovacím prahem (provoz po cestě) jsou 6 před a 8 po roce s opravou i bez ní –
vozové k okrajům mapy bez provozu, krátké kusy u křižovatek a západní zbytek #906 (0,58 cesty za den
i podle starého pole). **Zbývá** (návrhy 3–5 auditu): vozová spojka vede po
staré ose a JV roh plotu hřbitova přetíná o 2,5 m (dřív vyšlapaná o 3,5 m – odstup od plotů);
branka je 3,0 m od osy vozové cesty (na jejím okraji – vozová se neohýbá).

## Jednorázová přestavba podle nových pravidel (26. 10. 2026)

Martin 26. 10. 2026 („určitě“ – oprava zdvojených vozových cest a jednorázová přestavba Vlkova):
postavené cesty nová pravidla nemění – vozové 1051, 936, 1054, 1041 a vyšlapaná 808 vedly přes
ploty a rameno 1060 a úsek 801 domem. Přestavba sítě (výš) proto proběhne **ještě jednou** podle všech
pravidel z 26. 10.: copánek přes křižovatku, vozová bez vlásenky (narovnání i na rovině – Martin 26. 10. 2026: „ano smí“), odstup od plotů (trasy `routes-v5`), zdvojená vozová cesta a ohyb ramene.

Postup (návrh Clauda): stejná přestavba jako 24. 10. – vyšlapanost z dnešních tras, cesty znovu
týmiž funkcemi jako za běhu, vylepšení se přenesou (upravená, vyjetá a průsek tam, kde nový úsek
leží aspoň 60 % délky do 4 m od staré osy), vozové cesty se po nových osách naplánují a jsou hned
hotové, kus staré vozové osy delší než 60 m, kam nová síť nedosáhne, se vrátí. Pak znovu
[Jednorázová oprava sítě](#jednorázová-oprava-sítě-25-10-2026) (vozové spojky, volné vozové konce).

- **Verze přestavby:** `roads.rebuilt` nese verzi (`ROAD_REBUILD.version` = 2). Ves s verzí 1 (nebo
  bez přestavby) se při načtení přestaví jednou a idempotentně, smaže si příznak opravy a oprava
  proběhne hned po ní; nová ves má verzi 2 od začátku. Chyba → ves zůstane jako dřív s verzí 2
  a `rebuildFailed` (příště se nezkouší). Server dává mezi kroky přestávky jako dřív.
- **Vlkov** (stav DB den 117 036 → načtení → dopočet 90 dní, měření ve scratchpadu `diag-roads-r3`):
  přestavba 12,2 s (7 průchodů), oprava 0,25 s; 13 vozových cest naplánováno, 3 krátké řetězy „moc
  krátká“. Živé úseky 28 → 26 (vozové 15 → 12, upravené 9 → 12), křižovatky 9 → 10; po 90 dnech beze
  změny. Audit stav DB / 90 dní bez přestavby / po načtení / po 90 dnech: přes stavbu či pole
  (c) 12 / 8 / 6 / 3, souběh 1 / 0 / 0 / 0, podél plotu (j) 0 / 0 / 0 / 0, smyčky (g) 6 / 4 / 6 / 6,
  pahýly 14 / 14 / 11 / 11, kličky 9 / 8 / 8 / 8, konec mimo kotvu 3 / 0 / 0 / 0, vozová bez provozu
  3 / 3 / 13 / 13 (nové vozové cesty mají provoz až po uzavření roku). Okruhy 936 + 1041 + 1054
  (133 m) a 794 + 921 + 936 + 941 + 1042 (338 m) zmizely; zůstal okruh upravené 1116, vozové 1261
  a 1271 (235 m, nad 150 m – dvě různé cesty). Přes dům 2137 nevede nic.
- **Vozová síť:** 15 úseků / 3 293 m → 12 úseků / 3 227 m (o 66 m kratší – zdvojená vlásenka 1054);
  vůz dojede ke všem 52 cílům (domy, humno, díly polí, ohrady, hřbitov, sad, milíř a oba konce každé
  vozové cesty ze stavu DB) jako před přestavbou, celkem levněji (dvoukolák 9 592 → 9 183, čtyřkolák
  11 271 → 10 870); nejhorší cíl dráž o 9 / 12 m jízdy.
- **Zbývalo:** vozová 1257 u hřbitova vede po ose ohnuté do branky a za plotem v rohu má 3,5 m délky
  (dřív 1051 2,5 m – plán vozové cesty jde po ose řetězu i s ohybem do branky), vozová 1251 u ohrady
  2586 2 m a upravená 1121 u ohrady 1958 1,5 m (dřív vyšlapaná 808 4,5 m); křižovatky J1130–J1356
  5,9 m od sebe (rozestup 12,1 m). Opraveno ve verzi 2 (níž).
- **Rozestup křižovatek i při přestavbě** (návrh Clauda po ověření 26. 10. 2026): úsek, ze kterého
  bude vozová cesta, je pro křižovatku nejen široký, ale i **živý jako vozová** (od 1. 11. 2026
  odpadá – ramenem je každá neopuštěná cesta, [Křižovatka i se zarůstající
  cestou](#křižovatka-i-se-zarůstající-cestou-vlkov-1-11-2026); práh provozu vozové
  – dřív uzel vznikl až po přepočtu vozových, kdy se s vozovými rameny už nehne); úsek **zemské
  stezky** uzel při rozestupu nedrží a spojka po stezce se smí sloučit (stezka se po každém průchodu
  znovu najde); po vrácení kusu staré vozové osy se síť **ustálí znovu ještě před přepočtem
  vozových** – vrácený kus se napojí do nejbližšího uzlu, ve Vlkově na konec 6 m spojky u křižovatky
  J1130. Za běhu hry se nic nemění.
- **Vlkov po opravách** (`diag-roads-r3b`, stav DB → načtení → 90 dní): přestavba 11 průchodů (dřív
  7, ≈ o 40 % déle), 14 vozových cest naplánováno, 1 řetěz „moc krátká“; živé úseky 27, křižovatky 8
  → 7 (rameno bez provozu). Vozová osa blíž než 1 m od plotu (mimo 4 m u konců) 0 – nejbližší vozová
  1,5 m (u hřbitova objede roh přes novou křižovatku, k brance vede 5 m spojka); křižovatky blíž než
  rozestup 1 → 0. Audit po načtení / po 90 dnech: přes stavbu či pole (c) 4 / 1 (zbývá vyšlapaná
  1121 1,15 m od plotu ohrady 1958 – audit měří plot o 1 m blíž), podél plotu (j) 0 / 0, souběh
  0 / 0, smyčky 5 / 5, pahýly 11 / 11, kličky 5 / 5. Vůz dojede ke všem 52 cílům (dvoukolák
  9 047, čtyřkolák 10 693).

## Co se ukládá a co se dopočítá

| Ve stavu vsi (nové)                                      | Dopočítá se (stejně na serveru i v prohlížeči)       |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `routes` – trasy (řetězový kód), cesty za den, účel      | osy tras, tempo, provoz po buňkách, čáry pěšin       |
| `roads.wear` – vyšlapanost po 7,5 m, den posledního sčtu | síla pěšin, horké kusy pro vznik cest                |
| `Road.condition` – stav po kusech ≈ 25 m                 | bledé zarůstající kusy ve scéně                      |
| `Road.abandoned` – opuštěná cesta mimo síť               | cesty hráče (řetězy), kotvy a pahýly                 |
| `roads.junctions` – tvar, natočení, ramena, znamení      | obrys křižovatky, oblouky do vchodů (osa je uložená) |
| `roads.v2` – převod hotový                               | vzdálenosti chůze (uložené jako dřív)                |
| `roads.rebuilt` – jednorázová přestavba sítě hotová      |                                                      |

## Výkon

Návrh Clauda (odhady – ověří poslední úloha plánu):

- **Trasy** se počítají jen při změně rozložení ~~a 1. dne v měsíci se změnou stadií~~ (od 25. 10. 2026 jen se změnou mapy tras – Stálé trasy, pravidlo 5) – stejně jako
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

| Rozhodnutí                                                                                               | Kdo          |
| -------------------------------------------------------------------------------------------------------- | ------------ |
| Pravidla 1–11 nového systému cest                                                                        | Martin       |
| Lidé na upravované cestě vidět pracovat; přes ohrady se nechodí, dovnitř brankou                         | Martin       |
| Staré vsi převést jednou a idempotentně, nezahodit                                                       | Martin       |
| Čísla vzniku a zarůstání zvolí Claude sám                                                                | Martin       |
| Trasy ukládá simulace do stavu (řetězový kód), scéna je jen čte                                          | návrh Clauda |
| Zvyk × 1,25 mimo cestu – louka jen při úspoře přes 20 % času                                             | návrh Clauda |
| Ploty ohrad a hřbitova neprůchodné, trasa končí v brance; pohřby jsou trasa                              | návrh Clauda |
| Vyšlapanost ~~7,5 m, ± 1 políčko~~, + provoz − 1 za den, 0–1 500, cesta od 1 000, vůz × 2                | návrh Clauda |
| Vznik jen celé cesty od kotvy ke kotvě, prodloužení do vyšlapanosti 500; měsíční kontrola                | návrh Clauda |
| Kotvy: vchod, křižovatka, kraj mapy a cíl (konec trasy k vodě, dřevu, poli, sadu, louce)                 | návrh Clauda |
| Pahýly zmizí vždy; upravená a vozová zarůstá, jejich zbytky pod 30 m zmizí; opuštěná je mimo síť         | návrh Clauda |
| Křižovatka: Y s β 30–60°, natočení po 5°, vchod 1,5 × šířka, oblouk 12 m, dvě po 10 m                    | návrh Clauda |
| Rozestup křižovatek: dosahy plácků + 1 m; dvě Y se sloučí, jinak se odsunou                              | návrh Clauda |
| Znamení: strom 40 %, kámen 30 %, kůl 30 %; strom roste jako strom u cesty                                | návrh Clauda |
| Cesta k vchodu bez ohledu na vyšlapanost, nezarůstá, dokud se ke stavbě chodí                            | návrh Clauda |
| Převod: causeway → upravená, stav z historie, vyšlapanost z kandidátů, úklid, křižovatky                 | návrh Clauda |
| Převod po krocích s úlohami – stará ves hratelná po každé úloze; trasy při načtení                       | návrh Clauda |
| Provozní pole vyšlapanosti v paměti; dopočet 40 let Vlkova nejvýš + 1 s                                  | návrh Clauda |
| Ploty chodcům touž funkcí jako vozům (`fencedCells`) – ulička 3 m mezi ohradami průchozí                 | návrh Clauda |
| Stavba přes cestu: kus pod ní opuštěný hned, objížďka se vyšlape a napojí                                | návrh Clauda |
| Jízdy vozů do vyšlapanosti ročně z `flushCartTrips`; i přes osetý díl                                    | návrh Clauda |
| Kotvy z konců tras (brána, vchod stavby, cíl, kraj mapy); souběžné cesty sloučí úklid                    | návrh Clauda |
| Panel cesty ukáže oba konce (stavba, křižovatka, kraj mapy), klik je vybere                              | Martin       |
| Konce cesty podle kotev úklidu: křižovatka, kotva, kraj mapy, jiná cesta, jinak nikam                    | návrh Clauda |
| Jednorázová přestavba sítě, varianta A – vylepšení se přenesou                                           | Martin       |
| Přestavba: vyšlapanost za rok, 4 průchody, přenos 60 % do 4 m, kusy stezek se vrátí                      | návrh Clauda |
| Stálé trasy: průměr ceny pole místo stadia, přepočet jen se změnou mapy; i výpočet v paměti              | Martin       |
| Síť pěšin „pole z domu“ – každá domácnost najednou ke všem cílům, po sobě, dvě kola (8. 11. 2026)        | Martin       |
| Stávající vsi bez převodu – nové trasy s příštím přepočtem (8. 11. 2026)                                 | Martin       |
| Přepočet mapy tras 1. dne měsíce po změně, do té doby stará mapa (8. 11. 2026)                           | Martin       |
| Pořadí domácností: návštěva sousedů vytíží obě; pochůzka na pěšinu souseda do +30 % (`GOAL_SLACK`)       | návrh Clauda |
| Pole i stavba do mapy tras od umístění; měsíční kontrola mění mapu jen se změnou sítě cest               | Martin       |
| Cena pole pro vůz 4, čtyřkolák stejně jako dvoukolák; vůz přes pole úrodu nepošlape (herní zjednodušení) | Martin       |
| Pole chůze 0,6, vůz 0,25; remízy podle indexu buňky; vyšlapanost 3,75 m bez sousedů                      | návrh Clauda |
| Trasy k práci dne nad stálými, měsíčně při změně míst; lidé a stáda jen převáží cesty za den             | návrh Clauda |

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
