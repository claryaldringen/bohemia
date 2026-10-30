# Správce vsi – autopilot vsí rodu (#9, fáze 3)

Stav: **schváleno v hrubých rysech Martinem 30. 10. 2026, podrobnosti návrh Clauda.** Implementace
zatím není. Navazuje na [vojvodovu rodinu](lord.md) – Dělení vsi (fáze 2: odchod syna s poměrnou
částí vsi) a na [stěhování](migration.md) – Víc vsí jednoho hráče. Co níž není výslovně
Martinovo, je návrh Clauda.

## Proč

Zadání issue #9 (Martin 24. 10. 2026): „**Zbytek původní vesnice bude spravovat NPC.**“ a „**hráč
má svou jednu vesnici, které věnuje největší péči (ale může ji také svěřit do rukou správce, což
bude NPC) … Hráč však vždycky bude moci nad každou rodovou vesnicí udělat rozhodnutí, že má něco
postavit, vylepšit nebo může vesnici úplně vystěhovat a založit jinde.**“

- **Ves bez hráče upadá.** Diagnóza 27. 10. 2026: Vlkov 44 let bez hráče, 53 úmrtí hladem, podíl
  úrodnosti dílů až 0,38. Simulace přelidnění nebrzdí (Martin 30. 10. 2026: „**Na brzdu ser. Tohle
  musí prostě vyřešit hráč nebo NPC**“) – v ostrém světě (365 skutečných dní = 1000 let) bude
  každá ves hráče většinu času bez dozoru.
- **Rod se dělí.** Odchodem synů (fáze 2) přibývají vsi hráče; řídit každou ručně nejde. Hráč
  věnuje péči jedné vsi, ostatní spravuje správce.
- **Správce dělá, co by dělal dobrý hráč** – staví, zakládá pole, posílá syny pryč, když ves
  přeroste, co uživí – a vesničané dál sami dělají, co dělají (orba, setí, opravy, přestavby).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** u každé vsi hráče **přepínač Správce**; ves založená synem ho má zapnutý, první ves
  hráče vypnutý; hráč ho smí kdykoli přepnout a **vždy smí stavět i sám** (Martin 30. 10. 2026).
- **Cíl:** správce řídí **všechno, co hráč staví** – obydlí a pole; ohrady, hřbitov, sad, humno;
  dílny a cesty (vylepšení, vozové cesty, zemská stezka, jabloně u cest); odchod syna při
  přelidnění a jména synů (Martin 30. 10. 2026 – volba rozsahu první verze: všechno). Posvátná místa
  (modla, svatyně) patří ke stavbám hráče, proto k nim taky (návrh Clauda).
- **Cíl:** správce je „**Absolutní skiller. Ať optimalizuje rozestavení vsi, pole, vzdálenosti,
  vše tím nejideálnějším způsobem na daném typu krajiny.**“ (Martin 30. 10. 2026).
- **Cíl:** „**Růst se zásobou**“ (Martin 30. 10. 2026) – co nejrychlejší udržitelný růst lidí
  a rodu, vždy s pojistkou zásob, aby ves přežila pohromy a kruté roky; při přelidnění napřed nová
  pole (i klučení lesa), až když není kam, pošle syna pryč.
- **Cíl:** „**Přestaví, ne hráčovo**“ (Martin 30. 10. 2026) – bourá a přesouvá jen stavby, které
  sám postavil, a jen když se to vyplatí; stavby hráče nechá.
- **Cíl:** správce hraje **podle stejných pravidel a cen jako hráč** – žádné podvádění (návrh
  Clauda): stejné kontroly umístění, cena předem (`BUILD_COSTS`), stejná práce.
- **Ne-cíl (teď):** nástupnictví náhodou bez pozvaného hráče – až s pozvánkami (Martin 30. 10. 2026), seniorát a rodové panství (fáze 4), NPC vojvodové cizích rodů a sousedé se
  simulací.
- **Ne-cíl (první verze, návrh Clauda):** výpravy za obchodem (`startExpedition`), velký lov rodu
  (`declareHunt`), přestěhování domácnosti hráčem vybrané, odchod vybraných obydlí bez syna –
  nejsou stavby; viz Otevřené otázky.
- **Anti-cíl:** správce, který **ví budoucnost** – seed počasí, rozpis pohrom, náhodu dne. Zná jen
  to, co by věděl zkušený hráč: krajinu, kroniku, počasí, které už je vidět (`revealedWeather`),
  a četnosti z pravidel (návrh Clauda).
- **Anti-cíl:** správce, který vesničanům **zadává práci** – vesničané sami používají, co jim
  ulehčí práci (Martin); správce jen staví a rozhoduje o odchodu.
- **Anti-cíl:** správce, který **hráči radí nebo ho vede** – žádné návrhy, šipky ani obrysy plánu
  (UI jako 0 A.D., bez průvodce).
- **Anti-cíl:** správce, který zdrží dopočet – jeho práce musí být malý zlomek ceny dne (viz
  Výpočetní rozpočet).

## Kde správce běží (návrh Clauda)

- **Krok simulovaného dne, ne use-case workeru.** Ves se dopočítává zpětně při načtení a akci
  (worker zatím neexistuje) a výsledek nesmí záviset na kouscích dopočtu. Správce proto rozhoduje
  uvnitř `simulateDay` (`simulate.ts`) jako vesničané v `decideRebuilds`: krok
  **`stewardDay(state, day, landscape, obstacles)`** hned za `occupyEmptyDwellings`, před
  `updateRuins` a kontrolou obilných jam (`moveGrainFromCoveredPits`) – nové stavby správce tak
  zruší zbytky jam pod sebou a vysypou jámy jako stavby vsi. Stavba správce začne v den rozhodnutí
  a práci dostane od zítřka – stejně jako akce hráče, která patří do dne `lastDay` dopočtené vsi.
- **Den správce:** správce rozhoduje jen v pevné dny – každý **10. den** podle indexu dne
  (`day % STEWARD.everyDays === 0`) a v pevná data roku (31. 8. odchod syna, viz níž). Pevné dny
  nezávisí na kouscích dopočtu a víc staveb najednou znamená jen jeden přepočet tras
  (`refreshWalkDistances` – dnes ≈ 42 % ceny dopočtu, počítá se jen při změně rozložení vsi).
- **Stejná pravidla jako hráč – doménový příkaz stavby.** Dnes use-case hráče (např.
  `placeDwelling`) skládá cenu předem (`buildAffordability`), kontrolu místa
  (`checkDwellingPlacement`, `checkPlotPlacement`, `fieldPartsFromCells`, …) a akci domény
  (`startNewDwelling`, `foundField`, …). Doména use-casy importovat nesmí, proto se tohle skládání
  **přestěhuje do domény**: `domain/village/build-intent.ts` s typem **`BuildIntent`** (druh
  stavby a místo – poloha, pozemek, čtverce, mřížka, cesta) a čistou funkcí
  **`applyBuildIntent(state, day, landscape, obstacles, intent)`** → `{ ok: true, state }` nebo
  `{ ok: false, reason }`. Use-casy hráče se na ni přepojí (jen načtou a uloží), správce ji volá
  zevnitř simulace. Obě strany tak mají jedno pravidlo – kdo by ho změnil, změní ho oběma.
- **Bez krajiny správce spí** – testy a kalibrace bez krajiny (`landscape === null`) staví dál jen
  podle skriptu měření; správce potřebuje kontroly umístění.
- **Ves na cestě a vymřelá / opuštěná ves** se nesimuluje (`isVillageDormant`). Výjimka: ves na
  cestě se zapnutým správcem v den příjezdu (`journeyArrived`) – správce sám umístí první zemnici
  (stejné `settlersOf` → `foundVillage` jako `settleJourney`, kde jinak místo vybírá hráč) a ves
  se dál simuluje.
- **Jiné vsi na téže mapě.** Kontroly umístění vidí stavby ostatních vsí z přehledu sousedů
  (`withNeighbours`, neukládá se). Ten je snímek z doby dopočtu – kdyby správce plánoval podle
  staveb sousední vsi, závisel by výsledek na pořadí dopočtu vsí. Proto správce plánuje jen na
  **území své vsi**: políčka blíž středu (dvorci) své vsi než středu kterékoli jiné vsi mapy,
  která v ten den už stála (Voroného buňky; `NeighbourSnapshot` dostane střed a den založení
  každé vsi – obojí se po založení nemění). Stavbu jiné vsi na svém území (staví ji hráč) správce
  respektuje přes kontrolu umístění – tahle jediná výjimka může na kouscích dopočtu záviset (viz
  Otevřené otázky).
- **Odchod syna vytváří novou ves** – nový záznam vsi (a na nové mapě i sídlo s krajinou), což
  doména udělat nemůže. Správce proto v simulaci provede jen doménovou část (`departWithSon` – lidé,
  jídlo, stáda, vůz odejdou v ten den) a osadníky uloží do **odchozí schránky**
  `steward.departures` (seed, jméno a cíl nové vsi spočítané deterministicky). Use-case
  **`settleStewardDepartures`** po dopočtu schránku vybaví: založí ves (`foundedVillageState` na
  téže mapě, `travellingVillage` na nové mapě) se dnem odchodu a záznam ve schránce označí id nové
  vsi – idempotentně (podle id záznamu), takže pád serveru mezi uložením mateřské vsi a založením
  nové nic neztratí ani nezdvojí. Web ho volá za každým dopočtem vsi hráče, worker později taky.

## Stav správce (volitelná část stavu)

- **`VillageState.steward?: StewardState`** (návrh Clauda):
  - `on: boolean`, `sinceDay` – od kdy je zapnutý (přepnutí je akce hráče jako stavba);
  - `built: number[]` – **značka „postavil správce“**: id staveb, které správce založil, a id
    staveb, které z nich vznikly (dostavěné obydlí, dílna, pole a díly, čtverce ohrady, hřbitova
    a sadu, humno, modla, svatyně, vylepšené cesty); `finishConstructions` id přenese z rozestavěné
    stavby na hotovou. Jedna množina místo příznaku u každého typu stavby – id staveb jdou
    z jednoho čítače `nextId`;
  - `plan?` – uložený plán sídla (viz Plán sídla) a jeho otisk;
  - `vetoes?` – místa, kde hráč stavbu správce zrušil (druh, políčko, do kdy se tam nestaví);
  - `departures?` – odchozí schránka odchodu synů.
- **Převod jednou a idempotentně** (`withSteward` na začátku `advanceVillage`): ves bez `steward`
  má správce vypnutého – i ves založená synem před fází 3 (hráč ji dosud řídil sám, správce by ho
  překvapil). Zapnutý dostane jen ves založená synem od fáze 3 (`departWithSon` / osadníci
  s vůdcem `Settlers.lordId`) – v ní `steward: { on: true, sinceDay: den založení, built: [] }`.
  Stavby postavené před zapnutím jsou hráčovy (nejsou v `built`).
- Čísla správce (`STEWARD` – dny, prahy, rozpočty) patří do `rules-steward.ts` s odkazem na
  sekci tohoto návrhu.

## Cíl „Růst se zásobou“ – podle čeho správce rozhoduje (návrh Clauda)

Správce nemá vlastní pravidla hry – čte stejné signály, které ves už počítá, a každou možnou stavbu
oceňuje v **člověkodnech za rok** (obilí převádí na člověkodny přes výnos polní práce):
**hodnota** = práce, kterou stavba vsi ušetří, nebo jídlo, které přidá; **cena** = práce stavby
a překážek a dřevo. Staví napřed to, co má nejvyšší hodnotu na cenu, a jen dokud to dovolí
**pojistka zásob** a **rozpočet práce**.

| Signál                       | Odkud (už existuje)                                                        | K čemu                        |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| Rodina čeká na dům           | `waitingHouseholds`, `availableSettlers` (`households.ts`)                 | obydlí a dílny                |
| Pole uživí podle dnešní půdy | `fieldCapacity` × min(1; dnešní ÷ ustálený podíl) (fields.md – Pole uživí) | nová pole, odchod syna        |
| Kolik lidí bude za 1–2 roky  | `expectedYearlyFoodNeed` (`food-outlook.ts`)                               | cíl polí s předstihem         |
| Pojistka zásob               | `bufferFill(fieldSowingTargets(…))` (`field-food.ts`, `simulate-plan.ts`)  | režim správce                 |
| Hlad a paměť hladu           | `starvationDays`, `famineMemoryDay` (disasters.md – Zásoby a pojistka)     | režim správce                 |
| Volná práce                  | `commonLaborHistory` (volná práce v liště)                                 | rozpočet práce                |
| Okna roku                    | `PLANNING_DAY`, okna setí a žní (`year-plan.ts`)                           | kdy zakládat pole, kdy klučit |
| Pokrytí výrobky řemeslníků   | `craftCoverage` (`crafts.ts`)                                              | dílny                         |
| Volné hroby                  | hřbitovy a jejich čtverce (`cemetery.ts`)                                  | hřbitov a rozšíření           |
| Štěstí                       | `updateHappiness` (`happiness.ts`)                                         | modla, svatyně                |
| Dřevo                        | hromada klád, dospělé stromy (`wood.ts`, `countMatureTrees`)               | cena předem, lesní rezerva    |
| Provoz na cestách            | vyšlapanost a provoz (`PathNetwork.visits`, `roads`)                       | vylepšení cest                |

- **Režim správce** (návrh Clauda, prahy v `STEWARD`):
  - **Nouze** – ves hladoví (`starvationDays > 0`) nebo by zásoby k příští sklizni nedaly ani
    polovinu pojistky, ani kdyby ves snědla osivo, které na setí čeká – hrozí hlad nebo prázdné
    setí: správce nezačne nic kromě polí (v rozpočtu práce – ten bere jen volnou práci, polím
    v oběhu ji nevezme) a obydlí pro čekající rodinu (přeplnění zabíjí taky); nové stavby by braly
    práci dílům nad potřebu (Martin 25. 10. 2026:
    „ve chvíli, kdy stavba přijde, prostě vesnice o část úrody přijde“).
  - **Obnova** – pojistka pod plnou (osivo stranou) – i mladá ves, které zásoby do žní vystačí,
    ale pojistku ještě nemá (oprava 30. 10. 2026: s osivem ve zásobách byla nová ves v Nouzi
    skoro pořád, i když nehladověla): pole, obydlí, hřbitov, humno; nic, co ubere práci polím na
    dlouho (dílny, ohrady koní, cesty, posvátná místa).
  - **Růst** – pojistka plná: vše podle hodnoty na cenu.
- **Rozpočet práce:** zbývající práce rozestavěných staveb správce ≤ průměrná volná práce
  posledních 30 dní × `STEWARD.laborHorizonDays` (≈ 120 dní). Rozestavěné stavby se o práci dělí
  rovným dílem – víc naráz by všechny jen zpomalilo. Stavby hráče do rozpočtu počítá taky (bere jim
  práci), ale nikdy je nezruší.
- **Cíl polí:** pole v oběhu mají uživit lidi, kteří ve vsi budou za `STEWARD.fieldLeadYears`
  (≈ 2 roky – výhled `expectedYearlyFoodNeed`), × `STEWARD.fieldReserve` (≈ 1,1) ÷ očekávaná
  úroda let s počasím (`sowingYieldFactor` ≈ 0,95 – ves s ní seje taky), a navíc lidé, jejichž
  úroda by za `FIELD_STORES.balanceYears` (3 roky) doplnila chybějící pojistku zásob. „Pole
  uživí“ (`steadyHarvestKg`) pojistku jen **udržuje** – ves, která ji nemá, by si ji z polí
  v ustáleném oběhu nikdy nenaplnila. Rezerva dá vesničanům díly nad potřebu na kruté roky –
  osejí je sami (fields.md – Osevní postup po dílech).

## Rozhodovací pořadí v den správce (návrh Clauda)

Každý den správce projde kroky v tomto pořadí; každý krok smí začít nejvýš jednu novou stavbu
svého druhu (pole a čtverce po blocích) a všechny čerpají ze stejného rozpočtu práce.

1. **Jména synů** – syn vojvody bez jména (viz Jména synů). Každý den správce.
2. **Odchod syna** – lidí víc, než pole uživí podle dnešní půdy × `STEWARD.crowdedShare` (≈ 1,05),
   **plán nemá kam pole rozšířit** (viz Kdy není kam níž) a je syn, který smí vést. Jen **31. 8.**
   – po žních, před plánem osevu 1. 9., takže mateřská ves plánuje osev už pro menší počet lidí.
3. **Pole** – pole v oběhu pod cílem polí; další blok čtverců z plánu. Louka a křoviny 1. 9. až 28. 2. a 15. 6. až 31. 7. (mimo setí a žně – práce je volná), les 1. 10. až 31. 1.
4. **Obydlí nebo dílna** – `waitingHouseholds > 0`: jedna stavba na čekající rodinu; dílna místo
   obydlí, když má vyšší hodnotu (níž). Celý rok.
5. **Hřbitov** – ves nemá hřbitov s volnými hroby na `STEWARD.graveYears` (≈ 5 let) podle
   úmrtnosti z pravidel; jinak rozšíření o čtverec. První hned po dostavění první zemnice.
6. **Humno** – výmlat bez humna by stál víc práce a ztrát, než humno (20 člověkodní) za
   `STEWARD.paybackYears` (≈ 3 roky); druhé humno pro vzdálená hospodářství. Do 31. 7. (před
   žněmi).
7. **Ohrady** – spřežení, když orba ušetří víc jarní práce, než stojí ohrada, seno a výcvik
   (oxen.md); ovce, kozy, prasata a skot podle stravy a stád (diet.md – maso, sýr); koně až
   v režimu Růst a s vojvodovou rodinou, která cvičí (horses.md). Mimo žně.
8. **Sad, jabloně u cest** – ovoce ve stravě pod plnou potřebou; jabloně podél pevné cesty, která
   vede kolem polí (zeleň chrání díly – disasters.md, Ochrana dílu). V oknech výsadby (orchard.md).
9. **Posvátná místa** – štěstí pod `STEWARD.happinessFloor` a duby k mání; napřed modla, svatyně
   jedna (happiness.md). Mimo žně.
10. **Cesty** – vylepšení pevné cesty, když ušetřená chůze × provoz převáží cenu; vozová cesta,
    když ves má vůz a hlavní tahy dřeva, sena a snopů; zemská stezka jedna, k nejbližšímu kraji
    mapy, od `STEWARD.trailPeople` lidí v režimu Růst. Mimo setí a žně.

- **Obydlí – typ:** polozemnice (kapacita 8, menší dětská úmrtnost ×0,8, 220 člověkodní), když
  rozpočet práce unese její cenu do zimy; jinak zemnice (60 člověkodní) – rodina nečeká na dům
  přes zimu (návrh Clauda; čísla `DWELLINGS`).
- **Dílna místo obydlí:** dílna je obydlí čekající rodiny, která nebude pracovat na poli. Hodnota
  = práce, kterou pokrytí výrobky ušetří vsi (meze produktivity od nejhorší k nejlepší –
  crafts.md), mínus práce rodiny na poli, která vsi chybí. Pořadí podle hodnoty, typicky hrnčíř
  (keramika zmenší ztráty zásob a zvedá „Pole uživí“), uhlíř před kovářem (kovář bez uhlí stojí),
  tesař až s voly a vozy. Jen v režimu Růst.
- **Klučení lesa** (forest.md – Klučení lesa pro pole – postup): blok v lese správce založí
  v říjnu až lednu – kácení přes zimu, 30 dní schnutí a pálení v březnu, osev hned na jaře.
  Les bere, až když louka a křoviny v plánu nestačí, nebo když les dává víc (popel, bez pletí
  první sezónu – `squareValue`).
- **Kdy není kam** (krok 2): v plánu nezbývá čtverec, jehož práce uživí víc, než sní ten, kdo ji
  dělá – hodnota čtverce (kg čisté úrody za člověkoden založení a polní práce, `squareValue`
  rozšířené o záplavy, zvěř a ochranu) pod `STEWARD.minKgPerManDay` (≈ 1,5 × denní potřeba obilí
  dospělého) –, nebo leží dál než 800 m od nejbližšího obydlí (fields.md – Založení pole), nebo
  na území jiné vsi. Napřed tedy nová pole, až když není kam, odchod (Martin 30. 10. 2026).

### Den správce – upřesnění (návrh Clauda – `STEWARD` v `rules-steward.ts`)

Kroky 3 a 4 (`domain/village/steward.ts` – `stewardDay`):

- **Den správce** = index dne dělitelný `everyDays` (10). V něm jedna etapa plánu sídla, pak pole,
  pak obydlí nebo dílna. Stavby jdou přes `applyBuildIntent` na vsi dopočítané do dne správce
  (uprostřed dopočtu drží ves `lastDay` začátku dopočtu – cena předem by jinak závisela na
  kouscích dopočtu).
- **Režim:** Růst s plnou pojistkou (`bufferFill`, osivo stranou); Nouze = `starvationDays > 0`
  nebo pojistka pod `emergencyFill` (0,5), i když se osivo, které na setí čeká, počítá jako jídlo
  (`fieldSowingTargets(…, reserveSeed = false)`); jinak Obnova.
- **Rozpočet práce:** průměr volné práce posledních 30 dní × `laborHorizonDays` (120) minus
  zbývající práce všech rozestavěných staveb (hráčových, vesničanů i správcových). Nová ves bez
  historie volné práce má rozpočet 0 – první pole až s prvním dnem historie (příští den správce);
  obydlí pro čekající rodinu rozpočet nečeká.
- **Cíl polí:** lidé × (výhled potřeby za `fieldLeadYears` = 2 roky ÷ dnešní potřeba) ×
  `fieldReserve` (1,1) ÷ `sowingYieldFactor` + (pojistka − zásoby, které k příští sklizni zbudou)
  ÷ `FIELD_STORES.balanceYears` ÷ úroda na člověka z „Pole uživí“ – proti „Pole uživí podle dnešní
  půdy“; zakládané díly se počítají jako v oběhu (jinak by správce zakládal, dokud se první pole
  nedostaví).
- **Blok pole:** volná políčka bloku prvního hospodářství plánu, které jich má aspoň na nejmenší
  pole (0,1 ha); souvislý výběr od nejbližšího políčka bloku, počet podle chybějících lidí
  a úrodnosti (lidé na hektar jako „Pole uživí“), nejvýš co unese rozpočet. Neprojde-li, první
  políčko bloku se z plánu zahodí (nejvýš `slotTries` pokusů za den).
- **Nouze a pole:** pole v Nouzi stejně jako jindy – v rozpočtu práce (ten bere jen volnou práci).
  Dřívější podmínka „jen pole, které se stihne osít do konce osevu“ nechávala hladovějící ves bez
  nových polí (oprava 30. 10. 2026).
- **Hranice – past osiva (měření 30. 10. 2026, zakladatelé, seed krajiny 1 a 2, 15 let):** ves
  seje jen osivo nad jídlo do žní (seed-buying.ts – `sowableSeedKg`), takže bez pojistky stojí na
  vratké rovnováze úroda ≈ spotřeba a osev nepřeroste ≈ 2,5–2,8 ha, ať má polí kolik chce (cíl
  × 1,6 → 16 ha polí, úroda stejně ≈ 1 500 kg). Krutý rok (rok 9, úroda ≈ ½) ji do pasti shodí
  a s rostoucím počtem lidí hlad v letech 12–15 roste na strop hájení. Pole to nespraví – na tahu
  jsou strava mimo pole (ohrady, stáda – S5) a odchod syna, když lidí je víc, než ves skutečně
  uživí (S6).
- **Klučení lesa:** jen když louka v plánu nestačí, v okně lesa (1. 10. – 31. 1.); les na území vsi
  do `forestSearchTiles` (10) políček od bloku hospodářství. Druhá podmínka návrhu („les dává
  víc“) zatím ne.
- **Vyčerpaný plán** (`exhausted` – přepočet příští den správce): hotový plán nemá volný slot
  obydlí pro čekající rodinu, nebo žádné hospodářství nemá volnou louku na nejmenší pole.
- **Obydlí:** zemnice pro čekající rodinu se začne i nad rozpočet (přeplnění zabíjí, zemnice je
  nejlevnější a počet čekajících rodin stavby sám omezí); polozemnice jen, když na ni ves má dřevo
  předem, rozpočet ji unese a dostaví se do `winterStart` (1. 11.). Polozemnice stojí na pozemku
  políčka slotu, dům uprostřed, bez natočení.
- **Obydlí u dvorce** (plán ještě nemá ověřený dům): louka do `centreHouseTiles` (6) políček od
  středu vsi, aspoň dvě políčka od ostatních obydlí, nejbližší napřed.
- **Dílna místo obydlí** (jen Růst, řemeslo, které ves nemá): hodnota v člověkodnech za rok minus
  polní práce průměrné domácnosti – hrnčíř: ztráty zásob od dnešního pokrytí k plnému
  (`STORAGE_LOSS_PER_YEAR`) převedené na práci výnosem polní práce; kovář: polní práce
  s plným pokrytím nástroji, jen s uhlířem; uhlíř: kovářovo ušetření minus práce dvou domácností;
  tesař zatím 0 (až s voly a vozy). Bez nástrojů ušetří plné pokrytí ≈ 39 % polní práce, takže
  uhlíř vyjde kladně od 6 obydlí, kovář s uhlířem od 3; hrnčíř (ztráty 10 % → 5 %) až od 21 obydlí.

### Ostatní stavby – upřesnění (návrh Clauda – `STEWARD` v `rules-steward.ts`, `steward-extras.ts`)

Kroky 5 až 10 jsou v `domain/village/steward-extras.ts`. Každý začne nejvýš jednu stavbu za den
správce, jen v režimech `STEWARD.stepModes`, jen když se práce stavby vejde do **společného**
rozpočtu práce (pole, obydlí i tyto kroky) a vždy přes `startStewardBuild` (cena předem a kontrola
místa jako u hráče). Sloty hřbitova, humna, sadu a ohrad jsou z plánu sídla ve tvaru, v jakém je
plán ověřil: střed políčka, jeden čtverec bez mřížky.

- **Režimy:** Nouze – jen první hřbitov (10 člověkodní); Obnova – hřbitov, humno, ohrady
  (maso a mléko jsou strava mimo pole), posvátná místa; Růst – i koně, sad, jabloně u cest, cesty.
- **Hřbitov:** hned po první zemnici; dál rozšíření o čtverec, když volná místa (i rozestavěných
  čtverců) nestačí na `graveYears` (5) × očekávané úmrtí za rok (z úmrtností skupin).
- **Humno:** ves bez humna mlátí nouzově; vyplatí se, když roční ztráta (práce výmlatu ×
  `THRESHING.emergencyWork` + polní práce osevu × `emergencyLoss`) za `paybackYears` (3) převýší
  jeho práci; další, když výmlat nestíhá (`floorShort`). Do 31. 7.
- **Ohrady:** druh stáda s plným stádem (≥ 2 kusy a ≥ místa) a ohradami pod
  `penPlacesPerPerson` × lidé; spřežení, když ves má ohradu skotu a `OXEN.minCows` krávy a orba
  (kopání motykou − orba rádlem na osetý hektar) za `paybackYears` přebije seno volů a ohradu;
  koně jen v Růstu, když vojvodova rodina cvičí. Mimo žně (1. 7. – 31. 8.).
- **Sad a jabloně u cest:** potřeba jablek = plná potřeba energie × `DIET.fruitShare` ÷
  `APPLE_FOOD_VALUE`; chybí-li ji plocha sadů a jabloní (plná úroda), napřed čtverec sadu, pak
  jabloně podél pevné cesty do `roadFieldM` (40 m) od dílu pole. Jen v oknech výsadby.
- **Posvátná místa:** štěstí pod `happinessFloor` (60) – modla (nejvýš dvě), pak svatyně; místo
  nejbližší středu vsi do `sacredSearchTiles`, které projde kontrolou umístění. Mimo žně.
- **Cesty (Růst, mimo setí a žně):** vylepšení vyšlapané cesty, když úspora chůze (provoz ×
  délka × rozdíl `ROAD_WALK.speed`) za `roadPaybackYears` (5) převýší cenu; vozová cesta po
  upravené cestě s provozem ≥ `wagonTrips` a vozem ve vsi; zemská stezka jedna, k nejbližšímu
  kraji, od `trailPeople` (30) lidí. Co nešlo (blokovaná cesta, směr), správce zkusí znovu za
  `retryDays` (120) dní (`steward.skips`).

## Rozmístění – „absolutní skiller“ (návrh Clauda)

Martin 18. 10. 2026 k polím: „**Aby vesničané obhospodařovali pole tím nejlepším způsobem, aniž by
na něj museli dlouho chodit.**“ a „**V Estonsku a Dánsku to kupříkladu bylo tak, že jsi měl cca
čtvercové polnosti a uprostřed každé polnosti bylo hospodářství**“. Hospodářství se odvozují
z polohy domů (fields.md – Hospodaření podle polohy domů) – kde správce postaví dům, tam bude
jeho pole. Proto plánuje **dům a jeho pole spolu** a ves jako celek.

### Mapa hodnot krajiny

Pro každé políčko území vsi (krajina 128 × 128 políček po 15 m – nejvýš ≈ 16 000 políček) čisté
deterministické funkce (`steward-land.ts`, pod ESLint pravidlem `det-math` jako vrstva překážek):

- **Pole:** čistá úroda let osevu při úrodnosti políčka (`netYieldPerHa`, oběh odpočatého dílu)
  × očekávaná ztráta záplav (četnosti `FLOOD_WATER.levels` × ztráty pásem `FLOOD` podle výšky nad
  potokem `streamHeights`, mínus naplavenina) × ztráta zvěře podle vzdálenosti od lesa
  (wildlife.md – Škody) × ochrana zelení (`computePartProtections` – P2) ÷ práce: založení podle
  povrchu a překážek (`tallyCost`, ceny fields.md – Založení pole), polní práce × `distanceFactor`
  vzdálenosti k domu hospodářství, svah. Základ je dnešní `squareValue` skriptu měření
  (`scripts/lib/calibration-land.ts`) – přestěhuje se do domény a rozšíří.
- **Dům:** rovná zem (kontrola umístění), chůze pro vodu (`householdWaterLabor` – přirážka nad
  100 m), okraj lesa pro dřevo a palivo (`forestEdgeDistanceM`), výška nad potokem ≥ hladina
  dvousetleté vody (`FLOOD_WATER` 2,4 m – dům ani obilná jáma pod vodu), rozestup od ostatních
  domů ≥ 12 m (přeskok požáru – `FIRE`, hašení řetězem chce vodu blízko), dům na horší půdě než
  jeho pole.
- **Ostatní:** hřbitov ≥ 150 m od domů (i plánovaných) a ≥ 100 m od vody (cemetery.md –
  hygiena, hráči se nikdy neukazuje), ne na dobré půdě; humno mezi poli a dvorcem na suchu; ohrady
  u přílohů a luk na seno; sad u domů na střední půdě a tam, kde zeleň ochrání nejvíc dílů;
  hrnčíř u hliniště u potoka, uhlíř u buků, kovář mezi uhlířem a rudištěm (crafts.md).
- Části, které závisí jen na krajině (úrodnost, výšky, povrch, záplavy), jsou čisté funkce krajiny
  a smí se držet v mezipaměti procesu (jako `obstaclesOf`); části ze stavu vsi (stavby, pokácené
  stromy, vzdálenosti) se počítají v den správce.

### Plán sídla – ves jako celek

- **Šablony rozvrhu** podle krajiny: **shluk** kolem dvorce u vody (pole v prstencích – krátká
  voda, hašení, cesty), **řadová ves** podél potoka nebo cesty (lány za domy – úzké údolí),
  **samoty v polnostech** (estonský vzor – roztroušené ostrovy dobré půdy). Správce každou šablonu
  rozvrhne hladově na cílový počet lidí a vybere tu s nejnižší celkovou cenou: chůze na pole, pro
  vodu a dřevo za rok + očekávané ztráty záplav a požáru − úroda. Typ krajiny tak nikdo nezadává –
  vyjde z čísel.
- **Hospodářství jako jednotka:** místo domu (poloha, u polozemnice pozemek a natočení po 15°) +
  blok čtverců pole kolem něj, velký na domácnost (≈ 6–8 lidí) při úrodnosti bloku; domy na kraji
  bloků, aby úseky vyšly jako lány nebo výseče (holdings.ts).
- **Rezervy pro růst:** plán je na `STEWARD.planPeople` – víc z dvojnásobku dnešních lidí a toho,
  co území uživí do 800 m –, s místy pro hřbitov a jeho rozšíření, humno, ohrady, sad a dílny.
  **Lesní rezerva** (dřevo na stavby, přestavby a palivo podle obnovy stromů `TREE_REGROWTH_YEARS`,
  buky uhlíře) a **louky na seno** pro ohrady se na pole neberou, dokud není nouze.
- **Uloženo ve stavu** (`steward.plan`): šablona, seřazená místa (sloty) po druzích a bloky
  čtverců jako běhy indexů políček – ≈ 2 kB JSON na 4 domácnosti (rozpracovaný přepočet
  `steward.nextPlan` vedle platného plánu na pár dní zhruba dvakrát tolik). Bez uložení by plán po dopočtu po kouscích nešel
  zopakovat (stav dne přepočtu už není). **Otisk** plánu = id staveb vsi a sousedů na území
  v den přepočtu.
- **Kdy se plán přepočítá:** při zapnutí správce a při založení vsi celý; slot, kam kontrola
  umístění nepustí (hráč tam postavil, zatopený břeh, veto), se zahodí a vezme se další; **celý
  plán znovu**, když dojdou sloty druhu (nejdřív `STEWARD.exhaustedReplanDays` ≈ 120 dní po
  dokončení plánu – na plném území by se jinak přepočítával dokola), když se otisk změní stavbou
  hráče o víc než `STEWARD.replanChanges` staveb, nebo nejdřív za 5 let. Hráčovy stavby jsou
  v plánu pevné (správce kolem nich plánuje).

### Výběr místa pro jednu stavbu

Stavba v den správce vezme **první slot svého druhu**, sestaví `BuildIntent` a zavolá
`applyBuildIntent` – tedy stejnou kontrolu jako u hráče. Neprojde-li, zkusí nejvýš
`STEWARD.slotTries` (≈ 5) dalších slotů a krok ten den skončí. Pole po **blocích**: čtverce
jednoho hospodářství, které rozpočet unese, natočené podle mřížky bloku (fields.md – Natočené
stavby), nejvýš jedno pole na den správce.

### Výpočetní rozpočet a meze (odhad – ověří test výkonu)

- Dopočet Vlkova dnes ≈ 19 s na herní rok (village-core – Výkon dopočtu). Cíl: správce
  **≤ 5 %** – v průměru ≤ 1 s na herní rok a **≤ 200 ms v jednom dni** (dopočet po kouscích pouští
  ostatní požadavky až mezi dny; jeden drahý den se nedělí).
- Den správce bez stavby: signály jsou už spočtené nebo levné (≈ 1 ms) × 36 dní v roce.
- Stavba: 1–5 kontrol umístění (≈ 1 ms každá) + přepočet tras, který by stavba hráče stála taky.
- Plný plán: mapa hodnot ≈ 16 000 políček (desítky ms), kandidáti domů nejvýš
  `STEWARD.candidateChecks` (≈ 200 kontrol), 3 šablony hladově – odhad 0,5–1,5 s. Proto se
  počítá **po etapách v po sobě jdoucích dnech správce** (mapa hodnot → šablony → sloty;
  rozpracovaná etapa ve stavu), každá etapa pod 200 ms; mezitím správce staví podle starého plánu
  (přepočet běží vedle něj a hotový ho jedním krokem nahradí) nebo – v nové vsi – podle ověřené
  části rozpracovaného plánu (hřbitov, ověřené domy) a obydlí u dvorce.

### Čísla a upřesnění plánu (návrh Clauda – `STEWARD` v `rules-steward.ts`)

- **Mapa hodnot – pole:** zvěř bere u okraje lesa 15 % úrody (× váha podle vzdálenosti od lesa,
  wildlife.md – Škody), počasí bez ochrany zeleně 6 % za rok (zeleň do 15 m chrání celá, od
  100 m nic – odhad z blízkosti lesa; sady a solitéry plán zatím nezná). Do bloku pole jde jen
  louka s hodnotou aspoň poloviny mediánu louky území; les je lesní rezerva, na pole se plánem
  nebere.
- **Mapa hodnot – dům:** jen louka nad hladinou dvousetleté vody (2,4 m), svah nejvýš 1 m proti
  sousedním políčkům; cena místa = chůze pro vodu (`waterFetchingLabor`) + 60 pochůzek za rok do
  lesa pro dřevo. Rozestup 12 m mezi vyklízenými plochami = středy domů ≥ 24,2 m.
- **Plán na lidi:** dvojnásobek dnešních lidí, aspoň 4 domácnosti po 7 lidech, nejvýš co uživí
  louka území – „víc z“ v textu výš čtu jako dvojnásobek omezený tím, co území uživí. Blok pole
  domácnosti je její potřeba z pole × oběh × 1,25 (rezerva) při průměrné úrodnosti louky území.
- **Území vsi:** Voroného buňka středů vsí mapy (dvorec, jinak první obydlí) do 800 m; při shodě
  vzdálenosti vyhraje starší ves.
- **Šablony:** shluk = domy nejblíž středu; řadová ves = domy do 100 m od vody od středu do stran
  s rozestupem na šířku bloku; samoty = domy uprostřed nejbohatších bloků s rozestupem na šířku
  bloku. Bloky si domy berou po kole po nejbližším volném políčku. Cena = člověkodny za rok (polní
  práce × vzdálenost, voda, dřevo, jedna pochůzka denně ke dvorci) na tunu úrody po ztrátách.
  **Hustší šablona vyhraje, pokud řidší ušetří méně než 10 % ceny** (hašení, obrana a sousedská
  pomoc, které cena nezachytí) – na rovině s jedním zdrojem vody tak nová ves vyjde jako shluk,
  v úzkém údolí jako řadová ves; velká ves na rovině jako samoty.
- **Etapy:** den 1 mapa hodnot a šablony, pak kontroly míst domů po nejvýš 40 (celkem 200), pak
  ostatní sloty (hřbitov ≥ 150 m od domů a ≥ 100 m od vody na horší půdě, humno a dílny na suchu,
  sad a ohrada u domů – po 8 slotech; z bloků polí berou až po volné zemi). **Každý slot projde
  kontrolou umístění jako stavba hráče** (dílna pro každé řemeslo, hřbitov, sad a ohrada jeden
  čtverec) po nejvýš 40 kontrolách za den; za neprošlé jdou náhradníci – na druh nejvýš 24
  kandidátů (`STEWARD.slotCandidates`). Přepočet celý po víc než 3 změnách staveb hráče nebo po
  5 letech; počítá se vedle platného plánu.
- **Stojící domy s poli** (návrh Clauda): pole vsi patří nejbližšímu stojícímu domu; blok
  stojícího domu je o ně menší (dohromady blok jedné domácnosti) a cena šablony je započítá.
- **Cena šablony za celou ves** (návrh Clauda): chybějící políčka bloků se počítají i za
  domácnosti, pro které šablona dům neumístila – řidší šablona, která neuživí plán, tak nevyhraje
  jen proto, že má méně domů.
- **Uložení:** blok pole se ukládá jako běhy políček (≈ 0,5 kB plánu na domácnost); plán staršího
  tvaru se zahodí a spočítá znovu.

## Přestavba vlastních staveb (Martin 30. 10. 2026 – „Přestaví, ne hráčovo“; podrobnosti návrh Clauda)

- **Jen stavby v `steward.built`.** Stavby hráče a stavby postavené před zapnutím správce nikdy.
- **Kdy se vyplatí:** zisk za horizont `STEWARD.rebuildHorizonYears` (≈ 10 let, nejvýš životnost
  nové stavby) > cena nové stavby + zbytková hodnota staré (zbývající životnost ÷ životnost × cena)
  - `STEWARD.rebuildMargin` (≈ 20 %, ať se nepřestavuje kvůli šumu). Zisk = ušetřená chůze na pole,
    pro vodu a dřevo, menší ztráty záplav a požáru, uvolněná dobrá půda pod stavbou.
- **Obydlí a dílny – na konci životnosti.** Když vesničané dožilé obydlí správce přestavují
  (`decideRebuilds`), zbytková hodnota je nulová – správce místo přestavby na místě použije
  **Přestěhovat** (`startRelocation`, stejná akce jako hráč) na lepší slot plánu, když zisk
  převáží rozdíl ceny. Dřív jen při velkém zisku (zatopené místo, dům uprostřed nejlepšího pole).
- **Ostatní stavby** (ohrada, humno, hřbitov, sad, modla) se nepřesouvají: správce postaví novou
  na lepším místě a starou, kam se přestane chodit, nechá chátrat a rozpadnout
  ([opuštěné stavby](abandonment.md)) – bourat ji nemusí. Hřbitov s hroby zůstává vždy.
- **Pole:** díly, které správce založil a které mají v plánu hodnotu pod polovinou průměru, by
  šlo „vypustit“ – dnes taková akce není ani pro hráče (zrušit jde jen rozestavěná stavba). Návrh:
  doménová akce **vypustit díly** (díly vypadnou z oběhu a zarostou – fields.md, Zarůstání), stejná
  pro hráče i správce – viz Otevřené otázky. Do odpovědi správce díly nevypouští.

## Soužití s hráčem (návrh Clauda)

- **Hráč staví kdy chce i v řízené vsi** (Martin 17. 10. 2026: „Hráč sám rozhodne kdy a co bude
  stavět, jako v každé RTS.“; Martin 30. 10. 2026: hráč vždy smí stavět i sám). Správce jeho
  stavby bere jako pevné, plánuje kolem nich a počítá je do rozpočtu práce.
- **Rozestavěnou stavbu správce hráč smí zrušit** (křížek jako u svých staveb –
  `cancelConstruction`). Správce si zrušení zapíše jako **veto**: na tom políčku tentýž druh
  stavby `STEWARD.vetoYears` (≈ 5 let) nepostaví. Hotové stavby správce hráč nebourá, stejně jako
  své (dnešní pravidlo).
- **Přepnutí za běhu** je akce hráče (`setSteward(villageId, on)` – dopočet do dneška, pak změna;
  den změny `sinceDay`). Vypnutí: rozestavěné stavby správce se dostaví jako každé jiné (jsou
  vsi), plán a značky zůstanou. Zapnutí: plán se přepočítá, otisk ukáže stavby hráče mezitím.
- **Ves hráče, kterou řídí správce, je pořád hráčova** – hráč v ní dál pojmenovává (jen když
  správce nestihne – viz Jména), staví, ruší stavby správce a posílá syny pryč sám.

## Jména synů a odchod syna (návrh Clauda; fáze 2 – lord.md, Dělení vsi)

- **Jména:** ve vsi se zapnutým správcem dostane syn vojvody jméno **hned při narození** stejně
  jako vnuk (`generatedLineName` – ze seedu vsi a dne, jen jméno, které nenosí žádný žijící muž
  rodu ve vsi; lord.md – Generovaná jména vnuků). Syn bez jména z doby před zapnutím ho dostane
  v nejbližší den správce. Jméno je trvalé (lord.md).
- **Kdo odejde:** z `leadingSons` (smí vést – `checkSonLeader`: od 16 let, ne nástupce, se jménem,
  rodina si nestaví dům) **nejstarší ženatý**, jinak nejstarší svobodný – ženatý založí rod
  hned. Odchod vede `departWithSon` s dílem `sonShare` (1 ÷ dílníků, domácnosti nejblíž domu syna).
  Nejvýš jeden odchod za rok z jedné vsi; po odchodu se plán mateřské vsi přepočítá (menší ves,
  uvolněné domy).
- **Kam – na téže mapě, nebo na nové mapě:**
  - **Tady** (`here`), když na mapě je místo nové vsi (jako `freeVillageSite` – ≥ 300 m od staveb
    všech vsí), jehož budoucí území uživí aspoň `STEWARD.hereCapacity` (≈ 2×) lidí dílu podle mapy
    hodnot; místo první zemnice vybere správce mezi nimi podle hodnoty domu. Bez cesty.
  - Jinak **na novou mapu** (`map`): směr bez vlastní vsi (vlastní ves v sousední mapě nahradí
    souseda – tím směrem se neodchází, migration.md), napřed směr s hotovou zemskou stezkou (cesta
    1 den), pak nejkratší cesta ke kraji mapy (`edgeDistanceM`), při shodě pevné pořadí směrů.
    Novou krajinu vytvoří až `settleStewardDepartures` (seed sídla z `SeedSource` jednou); po
    příjezdu správce nové vsi umístí první zemnici sám (viz Kde správce běží).
  - Seed a jméno nové vsi jsou deterministické (`deriveSeed(state.seed, 'steward-son:' + den)`,
    `suggestVillageName`) – ne z `SeedSource`, ať je dopočet po kouscích stejný.
- **Nová ves má správce zapnutého** (Martin 30. 10. 2026) a vojvodou je syn (fáze 2).
- **Nástupnictví náhodou** (hráč v kůži mladšího syna) není – až s pozvánkami (Martin 30. 10. 2026).

## Co hráč vidí (UI jako 0 A.D.)

- **Přepínač Správce** – ikona správce (klíče u pasu) v seznamu vsí pod jménem vsi v horní liště
  u každé vsi a stejné tlačítko v panelu výběru dvorce; zapnutý svítí, vypnutý je tlumený.
  Popisek jen „Správce“. Ikona správce svítí i vedle jména vybrané vsi v horní liště, když ji
  správce řídí.
- **Stavby správce** – v panelu výběru stavby, kterou postavil správce, malá ikona správce
  (popisek „Postavil správce“) – hráč pozná, co smí správce přestavět. Jinak vypadají stejně.
- **Kronika:** správce nepíše nic navíc – stavby jsou vidět ve scéně, odchod syna má zápis
  z fáze 2 („Bořivoj odešel založit ves Lhota“), narození syna jeho jméno. Upozornění z jiných vsí
  (hlad, vymírání) jako dnes, se jménem vsi.
- **Žádný plán na očích** – rezervovaná místa, šablona ani důvody rozhodnutí se neukazují
  (bez průvodce).

## Ověření kvality (návrh měření – nespouštět, jen na Martinův pokyn)

- **Skript** `packages/game/scripts/measure-steward.ts` ve stylu `measure-village.ts` (kontrolní
  bod `--out`, `--workers`, `nice 19`, `--report-only`): nová ves s rodem (zakladatelé dynasty),
  skutečná krajina sídla (`realLand`), správce zapnutý od založení, **50 let**; odchody synů do
  vsí v paměti (`scripts/lib/memory-villages.ts`) – měří se **rod**, ne jedna ves.
- **Typy krajiny** z vlastností krajiny (podíl lesa, voda a délka potoka, členitost, průměrná
  úrodnost) – 5 skupin × 4 krajiny = 20 vsí; skupiny vybere `measure-landscapes.ts` (pásmo
  srovnatelnosti).
- **Srovnání:** (A) skriptovaný hráč dnešního `measure-village.ts` (staví zemnice, kdykoli může,
  pole podle `squareValue` k 1. 9.), (B) správce, (C) Vlkov – historie z diagnózy 27. 10. 2026,
  (D) horní mez z `village-calculator.ts --preset full` (ustálený stav lidí na hektar).
- **Kritéria** (návrh): lidí rodu ve všech vsích za 10 / 25 / 50 let – B ≥ A o ≥ 15 % a B > C;
  **žádné úmrtí hladem** mimo kruté roky a pohromy (rok s pohromou nejvýš 5 % lidí), pojistka zásob
  v průměru ≥ 0,9, nejnižší ≥ 0,5; průměrný podíl úrodnosti dílů ≥ 0,75 (ves nevysaje půdu);
  ustálená ves ≥ 90 % lidí na hektar z D; chůze na pole a pro vodu na člověka ≤ A; stojící stavby
  a stavby, které správce postavil a do 5 let nechal rozpadnout, ≈ 0; **čas správce ≤ 5 %**
  dopočtu a nejdražší den ≤ 200 ms.
- **Testy** (unit): výsledek nezávisí na kouscích dopočtu (i s plánem po etapách a odchodem),
  správce neprojde, kam hráč nesmí (stejná kontrola i cena), stavby hráče nikdy nezboří ani
  nepřesune, veto drží, převod idempotentní, správce bez krajiny nic nedělá, nová ves syna má
  správce zapnutého, schránka odchodů se vybaví právě jednou.

## Pro implementaci (poznámky, ne kód)

- Plán úloh S1–S9 je mimo repo (`.superpowers/sdd/2026-10-30-dynasty-split/steward-plan.md`).
- **Doména:** `build-intent.ts` (`BuildIntent`, `applyBuildIntent`; důvody odmítnutí
  `CANNOT_AFFORD`, `NO_SETTLERS`, … se přestěhují z use-casů do domény, use-casy je dál
  exportují), `steward.ts` (`stewardDay`, režim, rozpočet, kroky 1–10), `steward-land.ts` (mapa
  hodnot), `steward-plan.ts` (šablony, sloty, otisk, etapy), `steward-son.ts` (jména, odchod,
  schránka), `rules-steward.ts` (`STEWARD`), `types-steward.ts` (`StewardState`). Háčky:
  `simulate.ts` (krok dne, příjezd vsi na cestě), `simulate-build.ts` (`finishConstructions` –
  přenos značky, `decideRebuilds` – přestěhování správcem), `cancel-construction.ts` (veto).
- **Use-casy:** `set-steward.ts` (`setSteward`), `settle-steward-departures.ts`
  (`settleStewardDepartures` – sdílí založení nové vsi s `leaveVillage`), přepojení `place-*.ts`,
  `build-trail.ts`, `build-wagon-road.ts`, `upgrade-road.ts`, `plant-road-apples.ts`,
  `relocate-household.ts` na `applyBuildIntent`.
- **Web:** server action přepínače (`app/game/actions.ts`), `VillageView.steward` a značka staveb
  (`lib/village-view.ts`), přepínač v seznamu vsí a v panelu dvorce, ikona v panelu výběru
  (`components/game/hud/`), ikona `public/icons/` (CC0).
- **Kód popsat** do nového `docs/code/village-steward.md` a řádku tabulky v `CLAUDE.md` (až
  s implementací).

## Navazuje

- [Vojvodova rodina](lord.md) – Dělení vsi (fáze 2), nástupnictví; seniorát a rodové panství
  (fáze 4) – hlava rodu nad vsemi vsemi.
- [Stěhování](migration.md) – odchod do nové vsi, víc vsí jednoho hráče.
- [Pole](fields.md) – Pole uživí podle dnešní půdy, Hospodaření podle polohy domů, Osevní postup.
- [Pohromy](disasters.md) – záplavy, požár, pojistka zásob; [opuštěné stavby](abandonment.md).
- Pozvánky a nástupnictví náhodou (vize) – kdy hráč přejde do vsi správce.

## Rozhodnutí

| Rozhodnutí                                                                                                  | Kdo                                    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Zbytek vsi spravuje NPC; hráč může svou ves svěřit správci a vždy smí v každé vsi rodu stavět               | Martin (zadání issue #9, 24. 10. 2026) |
| Přepínač Správce u každé vsi; ves syna zapnutý, první ves vypnutý; hráč přepíná kdykoli a staví i sám       | Martin (30. 10. 2026)                  |
| Rozsah první verze: obydlí, pole, ohrady, hřbitov, sad, humno, dílny, cesty, odchod syna, jména synů        | Martin (30. 10. 2026)                  |
| Úroveň „Absolutní skiller“ – optimalizuje rozestavení, pole a vzdálenosti podle krajiny                     | Martin (30. 10. 2026)                  |
| Cíl „Růst se zásobou“ – napřed pole a klučení, až když není kam, odchod syna                                | Martin (30. 10. 2026)                  |
| Přestavba „Přestaví, ne hráčovo“ – jen vlastní stavby, když se to vyplatí                                   | Martin (30. 10. 2026)                  |
| Nástupnictví náhodou až s pozvánkami, ne ve fázi 3                                                          | Martin (30. 10. 2026)                  |
| Krok simulovaného dne `stewardDay` v pevné dny (každý 10. den, odchod 31. 8.), bez krajiny spí              | návrh Clauda                           |
| Doménový příkaz `applyBuildIntent` – jedno pravidlo pro hráče i správce; use-casy se na něj přepojí         | návrh Clauda                           |
| Správce nezná budoucnost (seed počasí, rozpis pohrom), jen co vidí hráč a četnosti z pravidel               | návrh Clauda                           |
| Režimy Nouze / Obnova / Růst podle pojistky zásob; rozpočet práce ≈ 120 dní volné práce                     | návrh Clauda                           |
| Hodnota a cena v člověkodnech za rok; cíl polí na lidi za 2 roky × 1,1                                      | návrh Clauda                           |
| Plán sídla ze šablon (shluk, řadová ves, samoty), hospodářství dům + blok polí, rezervy, uložený ve stavu   | návrh Clauda                           |
| Území vsi = Voroného buňka středů vsí mapy; správce plánuje jen na svém území                               | návrh Clauda                           |
| Značka „postavil správce“ jako množina id `steward.built`; převod: bez stavu vypnutý                        | návrh Clauda                           |
| Přestavba obydlí přestěhováním na konci životnosti; ostatní stavby nová + stará chátrá                      | návrh Clauda                           |
| Hráč smí zrušit rozestavěnou stavbu správce → veto na 5 let                                                 | návrh Clauda                           |
| Jména synů při narození jako u vnuků; odchod nejstaršího ženatého způsobilého syna, nejvýš jednou za rok    | návrh Clauda                           |
| Odchod na téže mapě, když tam je místo pro 2× díl; jinak nová mapa (stezka, nejkratší cesta)                | návrh Clauda                           |
| Odchod přes odchozí schránku `steward.departures` a use-case `settleStewardDepartures`                      | návrh Clauda                           |
| UI: přepínač s ikonou v seznamu vsí a v panelu dvorce, ikona u staveb správce, žádné kroniky navíc ani plán | návrh Clauda                           |
| Ověření skriptem `measure-steward.ts` – 20 krajin v 5 typech, 50 let, srovnání se skriptem, Vlkovem a mezí  | návrh Clauda                           |

## Otevřené otázky

1. **Vypustit díly pole** – má přibýt akce (pro hráče i správce), kterou díly vypadnou z oběhu
   a zarostou? Bez ní správce špatná pole, která sám založil, nepřestaví – jen staví lépe dál.
   Návrh Clauda: ano, stejná akce pro oba.
2. **Odchod bez syna** – ves přerostla, ale syn, který smí vést, není (nebo bude za ≥ 2 roky).
   Návrh Clauda: správce počká a ves srovná hlad; alternativa – odchod nejbližších obydlí
   (vojvodou nejstarší muž rodu mezi nimi) jako hráč.
3. **Výpravy za obchodem a velký lov rodu** – v první verzi je správce nedělá (nejsou stavby).
   Chce je Martin v další verzi (nákup obilí v hladovém roce, lov prasat na polích)?
4. **Tady, nebo na nové mapě** – návrh Clauda dává přednost téže mapě, jen když je místo pro
   dvojnásobek dílu. Má rod raději zůstat pohromadě (budoucí seniorát, válka), nebo se šířit?
5. **Vsi na téže mapě** – stavba hráče na území jiné vsi je jediné místo, kde výsledek správce
   může záviset na pořadí dopočtu vsí. Stačí to, nebo dopočítávat vsi jedné mapy naráz den po dni
   (≈ 2× dražší dopočet, plně deterministické)?
6. **Správce v první vsi** – zapnout ho sám po dlouhé nepřítomnosti hráče? Návrh Clauda: ne,
   rozhoduje jen hráč (Martin 30. 10. 2026 – první ves vypnutý).

**Na noc 30. → 31. 10. 2026 rozhodl Claude (Martin spí, ráno k potvrzení):** 1) v první verzi
ne – správce staví lépe dál, akce pro hráče i správce až po potvrzení; 2) správce napřed kluče
nová pole, když není kam a syn chybí, počká, než syn dospěje (odchod obydlí je podle Martina
„spíš stěhování sídla v rámci mapy“); 3) ne – rozsah první verze podle Martina; 4) podle návrhu
Clauda; 5) stačí, společný dopočet vsí jedné mapy až s válkou; 6) uzavřeno – Martin 30. 10. 2026:
první ves vypnutý.
