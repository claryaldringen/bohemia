# Správce vsi – autopilot vsí rodu (#9, fáze 3)

Stav: **schváleno v hrubých rysech Martinem 30. 10. 2026, podrobnosti návrh Clauda.** **Implementováno**
(sloučeno ≈ 31. 10. 2026, další rozšíření do 8. 11. 2026, kód viz [village-steward.md](../code/village-steward.md)). Navazuje na [vojvodovu rodinu](lord.md) – Dělení vsi (fáze 2: odchod syna s poměrnou
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
- **Ne-cíl (první verze, návrh Clauda):** přestěhování domácnosti hráčem vybrané, odchod
  vybraných obydlí bez syna – nejsou stavby; viz Otevřené otázky. Výpravy za obchodem
  (`startExpedition`) a lov navíc (`declareHunt`) správce dělá **jen v nouzi** (Martin 8. 11. 2026:
  „A“) – obchod ani lov mimo nouzi ne; viz Obilí a lov v nouzi.
- **Anti-cíl:** správce, který **ví budoucnost** – seed počasí, rozpis pohrom, náhodu dne. Zná jen
  to, co by věděl zkušený hráč: krajinu, kroniku, počasí, které už je vidět (`revealedWeather`),
  a četnosti z pravidel (návrh Clauda).
- **Anti-cíl:** správce, který vesničanům **zadává práci** – vesničané sami používají, co jim
  ulehčí práci (Martin); správce jen staví a rozhoduje o odchodu.
- **Anti-cíl:** správce, který **hráči radí nebo ho vede** – žádné návrhy, šipky ani obrysy plánu
  (UI jako 0 A.D., bez průvodce).
- **Anti-cíl:** správce, který zdrží dopočet – jeho práce musí být malý zlomek ceny dne (viz
  Výpočetní rozpočet).

## Správce je šlechtic (Martin 2. 11. 2026)

- Martin 2. 11. 2026: „**Správce je šlechtic. V ideálním případě je to někdo z rodu. Tj. když hráč
  není ve své vsi přítomen (např. spí nebo je v zaměstnání), ves je spravovaná NPC, ale formálním
  správcem je některý ze synů.**“
- **Dnešní NPC řízení (celý tento dokument) je to, co dělá formální správce, když hráč není
  u vsi.** Rozhoduje dál stejnými pravidly a stejným přepínačem; mění se jen to, **čím jménem**:
  ve vlastní vsi hráče nejstarší syn od 16 let, bez něj vojvoda sám; ve vsi NPC vojvody rodu on
  nebo jeho syn; ve vsi svěřené povýšenému vesničanovi nebo jinému hráči ten správce (návrh
  Clauda).
- Ves má tři role – **držitele** (rod), **vojvodu** a **správce**; hráč řídí každou ves, kde je
  vojvodou nebo správcem, i několik najednou. Správcem cizí vsi smí být jiný hráč (pánův vazal,
  jen běžné řízení včetně přepínače) a ves bez šlechtice dostane povýšeného vesničana – vše
  v [vazalství](vassalage.md) – Správce a tři role ve vsi; dopad na rodové vsi v
  [seniorátu](seniorate.md).
- Zda se NPC zapíná samo, když hráč odejde ze hry, nebo dál jen přepínačem (dnes v první vsi
  vypnutý – Martin 30. 10. 2026): [vazalství](vassalage.md) – otázka 3. Do rozhodnutí platí
  přepínač beze změny.

## Kde správce běží (návrh Clauda)

- **Krok simulovaného dne, ne use-case workeru.** Ves se dopočítává zpětně při načtení a akci
  (dopočet po kouscích dělá i worker) a výsledek nesmí záviset na kouscích dopočtu. Správce proto rozhoduje
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
  **přestěhuje do domény**: `domain/village/buildings/build-intent.ts` s typem **`BuildIntent`** (druh
  stavby a místo – poloha, pozemek, čtverce, mřížka, cesta) a čistou funkcí
  **`applyBuildIntent(state, day, landscape, obstacles, intent)`** → `{ ok: true, state }` nebo
  `{ ok: false, reason }`. Use-casy hráče se na ni přepojí (jen načtou a uloží), správce ji volá
  zevnitř simulace. Obě strany tak mají jedno pravidlo – kdo by ho změnil, změní ho oběma.
- **Bez krajiny správce spí** – testy a kalibrace bez krajiny (`landscape === null`) staví dál jen
  podle skriptu měření; správce potřebuje kontroly umístění.
- **Ves na cestě a vymřelá / opuštěná ves** se nesimuluje (`isVillageDormant`). Výjimka: ves na
  cestě se zapnutým správcem v den příjezdu (`stewardArrival`) – správce sám umístí první zemnici
  (stejné `settlersOf` → `foundedState` jako `settleJourney`, kde jinak místo vybírá hráč) a ves
  se dál simuluje. Zdrojem pravdy je přepínač `steward.on` vsi na cestě (hráč ho cestou může
  zapnout i vypnout), `journey.stewarded` je jen počáteční hodnota; po založení správce zůstane
  tak, jak ho hráč nechal.
- **Jiné vsi na téže mapě nejsou** – jedna ves, jedna mapa (Martin 1. 11. 2026: „Vsi na téže mapě
  – zrušme vsi na téže mapě. Jedna ves, jedna mapa“). Správce plánuje na **území své vsi** (do
  800 m od středu – dvorce); území už nedělí Voroného buňky s jinými vsemi mapy ani místo vsi syna
  ve schránce (obojí zrušeno 1. 11. 2026).
- **Odchod syna vytváří novou ves** – nový záznam vsi (a na nové mapě i sídlo s krajinou), což
  doména udělat nemůže. Správce proto v simulaci provede jen doménovou část (`departWithSon` – lidé,
  jídlo, stáda, vůz odejdou v ten den) a osadníky uloží do **odchozí schránky**
  `steward.departures` (seed, jméno a cíl nové vsi spočítané deterministicky). Use-case
  **`settleStewardDepartures`** po dopočtu schránku vybaví: založí ves na nové mapě
  (`travellingVillage` – jedna ves, jedna mapa) se dnem odchodu a záznam ve schránce označí id nové
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
  s příznakem `Settlers.stewarded`) – v ní `steward: { on: true, sinceDay: den založení, built: [] }`.
  Stavby postavené před zapnutím jsou hráčovy (nejsou v `built`). `built` se jednou za rok
  (31. 8., `pruneStewardBuilt`) zbaví id, která ve stavu už neexistují.
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
| Kolik lidí bude za 1–2 roky  | `expectedYearlyFoodNeed` (`food-outlook.ts`)                               | opatrný cíl polí vsi bez pole |
| Pojistka zásob               | `bufferFill(fieldStoresOutlook(…))` (`field-food.ts`, `simulate-plan.ts`)  | režim správce                 |
| Hlad a paměť hladu           | `starvationDays`, `famineMemoryDay` (disasters.md – Zásoby a pojistka)     | režim správce                 |
| Volná práce                  | `commonLaborHistory` (volná práce v liště)                                 | rozpočet práce                |
| Okna roku                    | `PLANNING_DAY`, okna setí a žní (`year-plan.ts`)                           | kdy zakládat pole, kdy klučit |
| Pokrytí výrobky řemeslníků   | `craftCoverage` (`crafts.ts`)                                              | dílny                         |
| Volné hroby                  | hřbitovy a jejich čtverce (`cemetery.ts`)                                  | hřbitov a rozšíření           |
| Štěstí                       | `updateHappiness` (`happiness.ts`)                                         | modla, svatyně                |
| Dřevo                        | hromada klád, dospělé stromy (`wood.ts`, `countMatureTrees`)               | cena předem, lesní rezerva    |
| Provoz na cestách            | vyšlapanost a provoz (`PathNetwork.visits`, `roads`)                       | vylepšení cest                |

- **Režim správce** (návrh Clauda, prahy v `STEWARD`):
  - **Nouze** – hlad roste (`starvationDays` vyšší než v minulý den správce), nebo ves
    nehladoví, ale zásoby k příští sklizni by nedaly ani polovinu pojistky, ani kdyby ves snědla
    osivo, které na setí čeká – hrozí hlad nebo prázdné setí. Ves, která hladoví, ale hlad neroste
    (ustálený na stropu hájení, klesá), je v Obnově – v pasti osiva by trvalá Nouze stavby stravy
    mimo pole zastavila na roky a čekáním se nic nespraví (oprava 31. 10. 2026: seed krajiny 1 –
    hlad na stropu 19 dní osm let, správce osm let nic nestavěl). Správce v Nouzi nezačne nic kromě
    polí (v rozpočtu práce – ten bere jen volnou práci, polím
    v oběhu ji nevezme) a obydlí pro čekající rodinu (přeplnění zabíjí taky); nové stavby by braly
    práci dílům nad potřebu (Martin 25. 10. 2026:
    „ve chvíli, kdy stavba přijde, prostě vesnice o část úrody přijde“).
  - **Obnova** – pojistka pod plnou (osivo stranou) – i mladá ves, které zásoby do žní vystačí,
    ale pojistku ještě nemá (oprava 30. 10. 2026: s osivem ve zásobách byla nová ves v Nouzi
    skoro pořád, i když nehladověla): pole, obydlí, hřbitov, humno, ohrady, posvátná místa; kroky
    Růstu (koně, cesty, první sad nebo jabloně u cest) s nižší předností – jen dokud po nich zbude
    polovina rozpočtu práce polím a obydlím; dílny ne.
  - **Růst** – pojistka plná: vše podle hodnoty na cenu. Ve zdravé vsi, která seje jen tolik, kolik
    sní, nastává plná pojistka hlavně v srpnu (zásoby po žních proti krátkému zbytku roku – měření 31. 10. 2026, seed krajiny 2: Růst 18 % dní správce, skoro celý v srpnu), tedy mimo okna
    výsadby i cest; proto kroky Růstu smějí i v Obnově.
- **Rozpočet práce:** zbývající práce rozestavěných staveb správce ≤ průměrná volná práce
  posledních 30 dní × `STEWARD.laborHorizonDays` (≈ 120 dní). Rozestavěné stavby se o práci dělí
  rovným dílem – víc naráz by všechny jen zpomalilo. Stavby hráče do rozpočtu počítá taky (bere jim
  práci), ale nikdy je nezruší.
- **Cíl polí – maximum, které ves obdělá** (Martin 18. 11. 2026 na otázku „Má správce stavět
  tolik polí, kolik jich ves zvládne obdělat, bez ohledu na to, co jí?“: „Ano. Přebytky mohou jít
  na vazalské dávky, do zásob atd. Cílem vesnice je prostě produkovat maximum všeho.“; týž den:
  „Obecně se vesnice bez zásahu snaží vyprodukovat co nejvíc všeho“; obdělat = osít i sklidit –
  Martin 9. 11. 2026: „Je lepší za každou cenu sklidit to, co už vyrostlo, než začínat pěstování
  úplně od začátku“; vzorec návrh Clauda, od 19. 11. 2026 i se žněmi; od 21. 11. 2026 i s prací
  rodu – Martin 19. 11. 2026: „Ano, maximálně zůstanou neobdělaná“, model kapacity níž): pole
  v oběhu mají uživit tolik lidí, kolik uživí osev, který ves (i s rodem vojvody) stihne **osít
  i sklidit** a na který má osivo (model kapacity níž – `workableHa`) × `STEWARD.fieldReserve` (≈ 1,1) – **bez ohledu na stravu**: maso,
  mléko ani ovoce cíl nezmenší, přebytek obilí jde do zásob a na dávky. Rezerva dá vesničanům díly nad osev na kruté roky –
  osejí je sami (fields.md – Osevní postup po dílech); pole nad to by ves neosela, jen by
  zarůstala. **Ves bez pole v oběhu** (nová ves, všechna pole zarostlá nebo opuštěná) maximum
  osevu z půdy nezná – **opatrný cíl** (návrh Clauda 18. 11. 2026): dřívější výpočet z potřeby –
  lidé za `STEWARD.fieldLeadYears` (≈ 2 roky – výhled `expectedYearlyFoodNeed`) ×
  `fieldReserve` ÷ očekávaná úroda let s počasím (`sowingYieldFactor`) a doplnění chybějící
  pojistky za `FIELD_STORES.balanceYears` (3 roky), když brzdí půda – s **celou potřebou z pole**
  (podíl 1), takže strava ani tady cíl nezmenší; s prvním zakládaným dílem platí maximum.
  Dřívější cíl podle potřeby z pole: [historie](history/steward-history.md). **Důsledek
  k vědomí** (měření 18.–19. 11. 2026, zlatá ves po 20 letech pod správcem): 26 polí místo 5,
  v oběhu 32 ha místo 12, obilí 28 t místo 6 t, štěstí na konci roku 20 90,6 místo 95,5; cíl polí
  ≈ 2× dnešních polí (16,5–17,3 ha osevu proti 12 osetým – váže žeň), pole k němu rostou tempem
  rozpočtu práce. Dny dřiny za 21 let 152, ves se 5 poli 46 (obojí s dřinou podle Otevřené otázky
  10; dřív 217 a 120).

### Model kapacity vsi (návrh Clauda, 1. 11. 2026)

Martin 1. 11. 2026: „Důležitý je správce. Vylepši ho. Měl by přece umět spočítat ideální umístění
všeho a nejlepší postupy.“ Diagnóza 1. 11. 2026: zralá ves oseje jen tolik, kolik stihne v oknech
setí (seed krajiny 13: kapacita podzimu 814 a jara 869 člověkodní vyčerpá plán 7 ha ozimu
a 9,4 ha jaře), ale správce zakládal pole podle půdy – 62 ha polí, oseto 15–21 ha, zakládání
a vracení zarostlého přílohu bralo 40–80 % polní práce a „je kam pole rozšířit“ blokovalo odchod
syna i v přelidněné vsi.

**Výhled vsi** (`stewardOutlook`, jednou za den správce) – kolik ves za hospodářský rok oseje:

- **podle práce** – kapacita setí celého hospodářského roku od 1. 9. (`sowingCapacity`: podzim
  září–listopad a jaro březen–duben, lidé po denním minimu – **jen ti, kdo se vsí opravdu pracují:
  bez mistrů huti a kněze mezi stavbami** (Martin 11. 11. 2026 – mezi stavbami jen čekají, nepracují
  na poli ani ve vsi; [stavební huť](stone-masonry.md)) **a bez trvale nepřítomných** (tažení, robota, služba,
  zajetí, cesta pro kování – tytéž lidi jako den, `planVillagers`; denní nepřítomnosti – lov, požár,
  nájezd – plán nezná; oprava chyby z 11. 11. 2026, návrh Clauda, D102 kolo 2, 21. 11. 2026),
  se spřežením i orba) ÷ práce na
  osetý hektar. Práce na hektar je z letošního plánu (vracení přílohu, kopání a setí dílů, které
  ves vzala – i se vzdáleností a stadiem přílohu); bez plánu podle sazeb: kopání (orba) a setí
  a vracení přílohu jednou za roky osevu dílu, × průměrný příplatek za vzdálenost;
- **podle osiva** – osivo, které letošní plán vzal, + co smí do země (`sowableSeedKg`) +
  luštěniny, ÷ 175 kg/ha – jen do konce setí (po dubnu se letošní osivo už neřeší a příští úrodu
  správce nezná);
- **podle půdy** – díly v oběhu ÷ `ROTATION_FACTOR` (`fieldCapacity`).
- **podle žní** (`harvestHa`, návrh Clauda 19. 11. 2026 – D99 kolo 2) – práce oken žní (červenec
  a srpen, se žňovými rukama – `sowingCapacity` – i s prací rodu, D103 níž) ÷ žeň a odnos na osetý
  hektar obilí (z plánu, bez něj podle sazeb × příplatek za vzdálenost). Žeň jde v práci dne před
  lnem, senem i otavou (`DAY_WORK_ORDER`), nic se od ní neodečítá; dosklizeň jaře v září je
  jednorázová;
- **podle výmlatu** (`threshHa`, návrh Clauda 19. 11. 2026) – výmlat má vlastní okno do února za
  polními pracemi (Martin 9. 11. 2026: „Výmlat prý počká i docela hluboko do zimy“): volná práce
  dne (jako v okně setí, i s prací rodu – D103 níž) × světlé dny zimního okna výmlatu
  (listopad–únor) ÷ výmlat na osetý hektar (bez humna dražší); co ves vymlátí v září a říjnu vedle
  setí, se nepočítá (opatrně).

**Co ves obdělá** (`workableHa`, jen pro cíl polí – D99 kola 1 a 2, D103): nejmenší z osevu podle
lidí v oknech setí (`sowHa`), podle spřežení, podle žní a podle výmlatu – lidé, žně i výmlat **i
s prací rodu vojvody** (Pole i na práci rodu níž). Proti „podle práce“ dvě opravy, které
ukázalo srovnání se simulací (Vlkov výhled 158–179 ha, skutečně oseto 6–17 ha; zlatá ves
32–39 ha proti 11–12): okno vracení a kopání (září–listopad **i** březen–duben) už nese jaro –
dřív se k němu jaro přičítalo ještě jednou (+ ≈ 40 % práce lidí i spřežení); orba stojí i lidi
(oráč a honáček – stejně člověkodnů jako dní spřežení; simulace je účtuje, výhled ne – práce na
hektar 6 proti skutečným 19–27 čd). Na den výhled se simulací sedí (plán 4,4–5,6 čd/den,
skutečně 5,7–6,0). Zlatá ves: osev lidmi ≈ 39 ha, spřežením ≈ 23 ha, žní 16,5–17,3 ha – váže žeň,
cíl je nad 12 ha, které ves osela a sklidila (test `village-golden-long.test.ts`).

**Spřežení podle lidí** (D114): osev podle spřežení počítá páry s rádlem, které ves má
(`ableTeams`). Kolik párů ves chce a cvičí, je od 22. 11. 2026 tolik, kolik jich obslouží lidmi
(Martin 22. 11. 2026: „ano“ – [orba](oxen.md), Kolik volů ves chce, Páry k rádlům podle lidí); dřív
jen tolik, kolik zoraly díly na řadě, takže pole, na která by víc párů stačilo, správce nezaložil.
Teď osev podle spřežení roste s páry, jak je ves vycvičí (výcvik 2 roky), a cíl polí s ním – dál
nejvýš na osev podle lidí, žní a výmlatu.

**Pole i na práci rodu** (D103): Martin 19. 11. 2026 na otázku „Má správce zakládat pole i na práci
rodu? Dnes plánuje pole jen na to, co ves zvládne bez rodu, a rod pak pomáhá jen na polích, která
už ves má.“: „Ano, maximálně zůstanou neobdělaná“ (dřív cíl polí bez rodu –
[historie](history/steward-history.md)). Podoba návrh Clauda (21. 11. 2026):

- Osev podle lidí v oknech setí, podle žní i podle zimního výmlatu počítá i práci **cvičící
  rodiny, která je ve vsi, po denním minimu dvorce** – týž model jako plán pomoci rodiny
  ([lord.md](lord.md) – Kdy jde rodina na pole): příprava půdy a setí, žně (červenec, srpen)
  i výmlat v zimě (den zimního okna jako den okna setí – rodina i ves). Spřežení rod nepřidá.
  Dosklizeň jaře v září výhled nepočítá (jednorázová), září dá rodina celé přípravě a setí.
- **Rodina, která necvičí** (ves s málo dospělými mimo rodinu – pracuje jako ostatní), je už
  v práci vsi a podruhé se nepřičte; cvičící rodina v práci vsi není.
- **Kdo z rodu je pryč** (výprava, tažení, robota…), se nepočítá – stejně jako lidé vsi: výhled
  bere, kdo je pryč dnes, na celý hospodářský rok; po návratu ho výhled zase počítá.
- **Úlohy před přípravou půdy** (otava, porážka, sklizeň jablek, výmlat na osivo) cíl
  neodečítá, plán pomoci rodiny ano: jsou to zbytky dnešních plánů (seč, porážka, hromada osiva
  okna), na celý hospodářský rok od 1. 9. je z dnešního stavu spočítat nejde – odečet by cíl
  měnil podle měsíce, ve kterém se počítá (jen v září a říjnu). Cíl je o ně vyšší (Vlkov k 1. 9.:
  11–61 čd, 1–5 % práce oken setí vsi s rodem; mladý Vlkov 897 232 čd, 19 %).
- Žádná pojistka proti neobdělaným polím (Martin riziko přijal). Osev podle práce (`laborHa`)
  zůstává bez rodu (Známý dluh níž).
- Vlkov (8 dospělých rodu, 3–4 mimo rod) k 1. 9. 897–911: co ves obdělá 7,6–27 ha → 21–46 ha
  (váže většinou žeň; v oknech setí dá rod 1,4–6× víc práce než ves). Pole tam ale správce
  nezaloží – rozpočet práce na stavby je prázdný (906: volná práce vsi posledních 30 dní 0,
  rozestavěno 534 čd), 15 let simulace vyjde stejně. Zlatá ves (rodina cvičí až od 20. roku) beze
  změny.

**Zjednodušení plánu (návrh Clauda, D102 kolo 2):** plán neodečítá práci „za den“, která jde před
úlohami – péči o koně, kování, výpravy a nosiče, vozy pro kováře (v měřených říjnech 0, v listopadu
0,9–2,1 čd/den); rozhodují se den po dni a přepočet dne je vidí, až nastanou. Plán také bere pro okna
setí letní skladbu dne (plné minimum, voda domů), kdežto den v září a říjnu je žňový (poloviční
minimum, voda na pole) – opatrné směrem, na kterém záleží. Při D103 (návrh Clauda, 21. 11. 2026)
zůstává i pro cíl polí a podíl rodu: skladba dne v oknech setí se mění po měsících a podle stavu
vsi – žňový den jen, dokud je co sklízet a mlátit (ves bez humna ho nemá), v listopadu a březnu
dříví, sníh podle počasí kraje, které plán nečte; srovnání jen září a října by plán udělalo méně
opatrným a listopad nechalo přeceněný (Vlkov 906: září–říjen −0,28, listopad +0,39 čd/den) –
srovnání po měsících je samostatná úloha.

**Známý dluh – dva modely práce v jednom výhledu:** ostatní čtenáři čtou dál „podle práce“
(`laborHa` – jaro dvakrát, orba bez lidí): plán sídla (blok domácnosti, `planSize`), odchod syna
(`stewardFedPeople`), ohrada volů (`teamPenValue`), hrdla `bottleneck` a `lasting` (Nouze ve
`fieldStep`, doplnění pojistky, „je kam“, v roce 0 mladé vsi humno a ohrady jen s kladnou
hodnotou v hrdle práce – `firstYearLaborBound` – a návratnost humna v roce 0) a vazalství –
osivo stranou u dávek
(`vassalage/spare.ts`, `domain-food.ts`: min(osev podle půdy, `laborHa`) × 175 kg). S opravou
i tam měla zlatá ves v letech 2–9 štěstí o ≈ 10 bodů nižší (jiný rozvrh plánu, nová ves bez
modly, sadu a ohrady) – oprava ostatních čtenářů je samostatná úloha. Jaro dvakrát: `laborHa`
bere lidi i orbu z oken `autumn` + `spring`, okno `autumn` (vracení přílohu a kopání) ale už nese
i březen–duben – jarní kapacita se tak sečte dvakrát (stejná chyba byla ve výhledu polí
v rozhraní, tam opravená 19. 11. 2026 – D102 kolo 1; `workableHa` ji nemá – D99). Jak správce
počítá okna, se řeší zvlášť (návrh Clauda, 19. 11. 2026). Od D103 (21. 11. 2026) navíc: cíl polí
počítá s prací rodu, `laborHa` ne – ve vsi s cvičící rodinou správce zakládá i pole, na která ves
bez rodu nestačí, a osev podle půdy pak může přerůst `laborHa`: hrdla hlásí práci (v Nouzi pak
správce pole pro rod nezaloží – opatrně –, „je kam“ není), osivo stranou u dávek (`spare.ts`,
`domain-food.ts`), `stewardFedPeople` i `teamPenValue` počítají s menším osevem, než ves s rodem
oseje (méně osiva stranou, ohrada volů později).

Nejmenší z osevu podle práce, osiva a půdy je **úzké hrdlo** letošního osevu. Osivo chybí jen do příští sklizně, pole stojí
roky – pro pole a lidi rozhoduje **trvalé hrdlo** (půda, nebo práce): **udržitelní lidé** =
„Pole uživí“ × osev trvalého hrdla ÷ osev podle půdy. Správce z výhledu:

- **Cíl polí** = lidé, které uživí osev, který ves obdělá (`workableHa`) a na který má osivo,
  × `fieldReserve` (od 18. 11. 2026 přímo cíl – Martin: „Cílem vesnice je prostě produkovat
  maximum všeho.“; od 19. 11. 2026 i se žněmi; od 21. 11. 2026 i s prací rodu – D103; dřív jen
  strop cíle podle potřeby z pole –
  [historie](history/steward-history.md)) – pole, která ves neoseje nebo nesklidí, jen zarůstají
  a vracení přílohu bere práci oknům setí. Doplnění pojistky jen v opatrném cíli vsi bez pole
  a jen při úzkém hrdle půda.
- **Je kam pole rozšířit** jen při hrdle půda – při hrdle práce další pole nepomůžou. Odchod syna
  už na tom nezávisí (viz Kapacita mapy níž).
- **Přelidnění** už se nepočítá z výhledu vsi, ale z **kapacity mapy** (viz níž; dřív udržitelní
  lidé × `crowdedShare` 1,05).
- **Nouze:** pole jen při úzkém hrdle půda.

#### Kapacita mapy (Martin 6. 11. 2026)

_Výjimka: v převzatém hradišti správce syny neposílá ([hillfort.md](hillfort.md) – Hradiště staví hráč)._

Martin 6. 11. 2026: „Tak podle velikosti mapy umíme určit maximální velikost obdělávané půdy,
podle toho maximální velikost sklizně a podle toho i maximální velikost populace. Čili správce
bude rozšiřovat vesnici a pole, dokud mu to mapa dovolí, a když populace přesáhne např. 80 % toho,
co je mapa reálně schopná uživit, dojde k odchodu.“ Upřesnění (návrh Clauda, Martin: „Ano, přesně
tak“): půda = všechna půda, ze které jde udělat pole, včetně lesa, který jde vyklučit, bez vody
a skal; osévá se jen díl oběhu (`ROTATION_FACTOR` = 3,5, ne ⅔ – ves má dva osevy a pět let přílohu,
ne trojpolí); průměrná úroda té půdy po obvyklých ztrátách ÷ spotřeba na člověka. Počítá se **jednou
pro mapu**, protože se mění jen s krajinou. Mapy nejsou stejné (pásmo krajiny: les 55–70 %,
úrodná políčka 2 550–3 800), takže kapacita se liší od mapy k mapě.

- **Vzorec** (`mapCapacity(landscape, obstacles)`, `map-capacity.ts`): Σ přes políčka (čistá úroda
  za léta osevu `fieldCells.kg` × co z ní nechají záplavy, zvěř u lesa a počasí `fieldCells.kept`)
  ÷ délka oběhu (osev + příloh, dnes 7 let) ÷ úroda, kterou potřebuje člověk: roční potřeba
  dospělého (180 kg) × `MAP_CAPACITY.fieldFoodShare` (0,8 – podíl potřeby z pole), s pojistkou
  zásob a ztrátami skladováním bez hrnčíře (`steadyHarvestKg`). Voda a skalní výchoz úrodu nemají,
  les se počítá jako klučitelný (včetně lesního bonusu prvních let).
- **Ztráty** jsou odhad z krajiny, který správce už používá v mapě hodnot (záplavy, zvěř,
  `weatherLoss` s ochranou zeleně) – žádné nové číslo kromě podílu z pole.
- **Přelidnění:** lidí víc než `STEWARD.mapCrowdedShare` = 0,8 kapacity mapy. Odchod syna pak
  nečeká na „není kam pole rozšířit“ – správce rozšiřuje pole, dokud mu mapa dovolí, a ves, která
  mapu naplní, pošle syna. Past osiva (`departureHungerDays`) beze změny.
- **Uložení:** kapacita se nedává do stavu vsi, ale počítá z krajiny s mezipamětí podle vrstvy
  překážek (jako `fieldCells`) – krajina u sídla je stejná a deterministická, takže není co
  převádět ve starých vsích a výsledek nezávisí na kouscích dopočtu.
- **Pole:** blok domácnosti se bere podle práce, bez stropu podle jídla (Pole blízko a podle práce).

Výhled zná jen dnešní stav vsi (lidé, díly, letošní plán, zásoby) – počasí ani budoucí úrodu
nečte. Nástroje a rádlo, které hrdlo práce zvednou, a odchod syna jako ventil růstu jen
s životaschopnou výpravou navazují (plán úloh správce 1. 11. 2026, úlohy 2a, 2b a 3).

## Rozhodovací pořadí v den správce (návrh Clauda)

Každý den správce projde kroky v tomto pořadí; každý krok smí začít nejvýš jednu novou stavbu
svého druhu (pole a čtverce po blocích) a všechny čerpají ze stejného rozpočtu práce.

1. **Jména synů** – syn vojvody bez jména (viz Jména synů). Každý den správce.
2. **Odchod syna** – lidí víc než `STEWARD.mapCrowdedShare` (0,8) kapacity mapy (Kapacita mapy)
   a je syn, který smí vést; nebo ves
   v pasti osiva hladoví (viz Odchod syna – upřesnění, Past osiva). Jen **31. 8.** – po žních,
   před plánem osevu 1. 9., takže mateřská ves plánuje osev už pro menší počet lidí.
   2a. **Nouze – obilí a lov** (Martin 8. 11. 2026: „A“) – výprava za obilím, když zásoby do žní
   nestačí, a lov navíc, když zvěř škodí na polích (viz Obilí a lov v nouzi). Každý den správce,
   před stavbami. Nestaví – rozpočet práce nebere.
3. **Pole** – pole v oběhu pod cílem polí; další blok čtverců z plánu. Louka a křoviny 1. 9. až 28. 2. a 15. 6. až 31. 7. (mimo setí a žně – práce je volná), les 1. 10. až 31. 1.
4. **Obydlí nebo dílna** – `waitingHouseholds > 0`: jedna stavba na čekající rodinu; dílna místo
   obydlí, když má vyšší hodnotu (níž). Celý rok.
5. **Hřbitov** – ves nemá hřbitov s volnými hroby na `STEWARD.graveYears` (≈ 5 let) podle
   úmrtnosti z pravidel; jinak rozšíření o čtverec. První hned po dostavění první zemnice.
6. **Humno** – výmlat bez humna by stál víc práce a ztrát, než humno (20 člověkodní) za
   `STEWARD.paybackYears` (≈ 3 roky); druhé humno pro vzdálená hospodářství. Do 31. 7. (před
   žněmi).
7. **Ohrady** – spřežení, když orba ušetří víc jarní práce, než stojí ohrada, seno a výcvik
   (oxen.md); ovce, kozy, prasata a skot podle stravy a stád (diet.md – maso, sýr); koně
   s vojvodovou rodinou, která cvičí (horses.md; krok Růstu – v Obnově s nižší předností). Mimo
   žně.
8. **Sad, jabloně u cest** – ovoce ve stravě pod plnou potřebou; jabloně podél pevné cesty, která
   vede kolem polí (zeleň chrání díly – disasters.md, Ochrana dílu). V oknech výsadby (orchard.md).
9. **Posvátná místa** – podle návratnosti (Posvátná místa podle návratnosti níž) a duby k mání;
   napřed modla, svatyně jedna (happiness.md). Mimo žně.
   9a. **Opevnění** – podle hrozby z války a nájezdů ([opevnění](fortifications.md) – Správce,
   Hrozba): přínos druhu × horizont (Růst 25 let, Obnova 5, nejvýš životnost druhu) − cena; hrozba
   0 = nestaví. Nová stavba (plot, palisáda, val i s nástavbou) nebo vylepšení vlastního (plot →
   palisáda, nástavba na val); hráčovo opevnění nemění. V Růstu a Obnově, v Nouzi ne; mimo žně.
10. **Cesty** – vylepšení pevné cesty, když ušetřená chůze a jízdy vozem za horizont režimu
    převáží cenu; vozová cesta,
    když ves má vůz a hlavní tahy dřeva, sena a snopů; zemská stezka jedna, k nejbližšímu kraji
    mapy, od `STEWARD.trailPeople` lidí (krok Růstu – v Obnově s nižší předností). Mimo setí
    a žně.

- **Obydlí – typ:** polozemnice (kapacita 8, menší dětská úmrtnost ×0,8, 220 člověkodní), když
  rozpočet práce unese její cenu do zimy; jinak zemnice (60 člověkodní) – rodina nečeká na dům
  přes zimu (návrh Clauda; čísla `DWELLINGS`).
- **Obydlí – nadzemní dům (od roku 800):** před obydlím správce začne jeden nadzemní dům (`srub`),
  když z pořadí čeká rodina a žádný není prázdný ani rozestavěný; kdo to je a kolik, určuje
  [log-house.md](log-house.md) (Správce). Rodina z pořadí, pro kterou srub čeká nebo se staví, se
  z čekajících odečte – nestaví se pro ni zároveň polozemnice (návrh Clauda: ženatý syn ve dvorci
  je v obou počtech). Před rokem 800 se nic nemění.
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
  dospělého) –, nebo leží dál než 800 m od nejbližšího obydlí (fields.md – Založení pole). Napřed tedy nová pole, až když není kam, odchod (Martin 30. 10. 2026).

### Den správce – upřesnění (návrh Clauda – `STEWARD` v `rules-steward.ts`)

Kroky 3 a 4 (`domain/village/steward/steward.ts` – `stewardDay`):

- **Den správce** = index dne dělitelný `everyDays` (10). V něm jedna etapa plánu sídla, pak pole,
  pak obydlí nebo dílna. Stavby jdou přes `applyBuildIntent` na vsi dopočítané do dne správce
  (uprostřed dopočtu drží ves `lastDay` začátku dopočtu – cena předem by jinak závisela na
  kouscích dopočtu).
- **Režim:** Nouze = hlad roste (`starvationDays` nad `steward.lastHunger` – hladem v minulý den
  správce); Růst s plnou pojistkou (`bufferFill`, osivo stranou); hladovějící ves, které hlad
  neroste, Obnova; jinak Nouze, když je pojistka pod `emergencyFill` (0,5), i když se osivo, které
  ves ještě zaseje, počítá jako jídlo (`fieldStoresOutlook(…, reserveSeed = false)`), jinak Obnova.
  `lastHunger` se zapíše každý den správce – režim nezávisí na kouscích dopočtu.
- **Rozpočet práce:** průměr volné práce posledních 30 dní × `laborHorizonDays` (120) minus
  zbývající práce všech rozestavěných staveb (hráčových, vesničanů i správcových). Nová ves bez
  historie volné práce má rozpočet 0 – první pole až s prvním dnem historie (příští den správce);
  obydlí pro čekající rodinu rozpočet nečeká.
- **Cíl polí** (od 18. 11. 2026 – maximum, které ves obdělá, od 19. 11. 2026 i se žněmi, od 21. 11. 2026 i s prací rodu – D103; dřívější znění [historie](history/steward-history.md)):
  „Pole uživí podle dnešní půdy“ × min(co ves obdělá – `workableHa`: osev podle lidí v oknech setí
  jednou i s orbou, podle spřežení, podle žní (žeň a odnos v červenci a srpnu) a podle výmlatu
  (zimní okno) – lidé, žně i výmlat i s prací cvičící rodiny po minimu dvorce; osev podle
  osiva) ÷ osev podle půdy × `fieldReserve` (1,1) – proti „Pole
  uživí podle dnešní půdy“. Obojí je v lidech při dnešní stravě, takže se strava zkrátí – v poměru i v bloku pole
  (lidé na hektar); cíl v hektarech na stravě nezávisí. **Ves bez pole v oběhu** (osev podle půdy 0) nebo s osevem bez meze: opatrný cíl – (lidé × (výhled potřeby za `fieldLeadYears` = 2 roky
  ÷ dnešní potřeba) × `fieldReserve` ÷ `sowingYieldFactor` × úroda na člověka s celou potřebou
  z pole + (pojistka − zásoby, které k příští sklizni zbudou) ÷ `FIELD_STORES.balanceYears`, jen
  při hrdle půda) ÷ úroda na člověka z „Pole uživí“ – ves jen s obilím má týž cíl jako dřív.
  Zakládané díly se počítají jako v oběhu (jinak by správce zakládal, dokud se první pole
  nedostaví).
- **Blok pole:** volná políčka bloku prvního hospodářství plánu se stojícím domem, pak políčka
  bloků ostatních hospodářství nejblíž stojícím domům (Pole blízko a podle práce), které má
  aspoň na nejmenší pole (0,1 ha); souvislý výběr od nejbližšího políčka bloku, počet podle chybějících lidí
  a úrodnosti (lidé na hektar jako „Pole uživí“), nejvýš co unese rozpočet. Neprojde-li, první
  políčko bloku se z plánu zahodí (nejvýš `slotTries` pokusů za den). **Pole spíš čtvercová**
  (oxen.md – Orba rádlem křížem; Martin 14. 11. 2026: „Dokud Slované neměli těžký pluh, orali
  spíš čtvercová pole a křížem.“): výběr roste v co nejčtvercovějším bloku, ne v pásu – další je
  sousední políčko, které nejméně prodlouží delší stranu obalu bloku, při shodě to, které obal
  nejméně zvětší, pak to nejblíž (návrh Clauda). Počet políček, cena založení i práce stejné.
- **Nouze a pole:** pole v Nouzi stejně jako jindy – v rozpočtu práce (ten bere jen volnou práci).
  Dřívější podmínka „jen pole, které se stihne osít do konce osevu“ nechávala hladovějící ves bez
  nových polí (oprava 30. 10. 2026).
- **Hranice – past osiva (měření 30. 10. 2026, zakladatelé, seed krajiny 1 a 2, 15 let):** ves
  seje jen osivo nad jídlo do žní (seed-buying.ts – `sowableSeedKg`), takže bez pojistky stojí na
  vratké rovnováze úroda ≈ spotřeba a osev nepřeroste ≈ 2,5–2,8 ha, ať má polí kolik chce (cíl
  × 1,6 → 16 ha polí, úroda stejně ≈ 1 500 kg). Krutý rok (rok 9, úroda ≈ ½) ji do pasti shodí
  a s rostoucím počtem lidí hlad v letech 12–15 roste na strop hájení. Pole to nespraví – na tahu
  jsou strava mimo pole (ohrady, stáda – S5) a odchod syna, když lidí je víc, než ves skutečně
  uživí (S6). **Změna prahu (Martin 31. 10. 2026: „2 – osivo se nejí“):** osivo do roční potřeby
  ves sní až pod přídělem 0,5 (dřív 0,75, `SEED_STORES.floorRation` – [pole](fields.md), Osivo
  ze zásob) – víc hladu krátce, plný osev; past osiva tím ustupuje.
- **Past osiva ve vsi seedu krajiny 13 (rozbor 2. 11. 2026, rychlé měření 6 × 25 let):** osivo
  zakladatelů (1 800 kg) se vyseje do jara roku 4 – setí bere osivo jen na setí napřed (`takeSeed`),
  i když ves má 2,7–4,7 t obilí, takže lhůta 15 let nechrání nic. Ves má 16 let jen 5 dospělých,
  potřeba z pole roste s dětmi 1 100 → 2 600 kg (rok 13), úroda zůstane ≈ 2 400 kg. Od roku 11
  osivo chybí a nákup neprojde (hřivny 0, krávy nad chovné 0), od roku 13 ves každý podzim
  skutečně hladoví a sní i koupené osivo; od roku 16 oseje 0,1–0,7 ha. **Ve správci:** past
  zmírnila návratnost posvátných míst (svatyně v roce 1 – práce × 1,05 po celá léta pěti
  dospělých; lidé za 25 let 21 → 30, využití oběhu 0,32 → 0,66). **Cíl polí s předstihem 5 let,
  když brzdí půda** (návrh Clauda, zamítnut): seed 13 o kus lepší, součet horší (hladové dny
  285 → 443, využití oběhu 0,91 → 0,86 – pole čekají ladem). Od 18. 11. 2026 cíl polí na
  předstihu nestojí – maximum, které ves oseje (Cíl polí); předstih jen v opatrném cíli vsi bez
  pole. Co zbývá, jsou pravidla osiva –
  otázky pro Martina ve zprávě `steward-better-7.md` (rezerva zakladatelů napřed ze zásob, nákup
  bez krav nad chovné, koupené osivo v hladu).
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
  s plným pokrytím nástroji, jen s uhlířem; uhlíř: kovářovo ušetření minus práce dvou domácností, ke kováři, kterého ves už má, jen jedné
  (kovář bez uhlí stojí a správce uhlíře jinak nikdy nepřistaví – Martin 14. 11. 2026: „Ano, uhlíře
  udělej jak říkáš“);
  tesař zatím 0 (až s voly a vozy). Bez nástrojů ušetří plné pokrytí ≈ 39 % polní práce, takže
  uhlíř vyjde kladně od 6 obydlí, kovář s uhlířem od 3; hrnčíř (ztráty 10 % → 5 %) až od 21 obydlí.

### Obilí a lov v nouzi (Martin 8. 11. 2026; pravidla návrh Clauda – `STEWARD` v `rules-steward.ts`, `steward-needs.ts`)

Martin 8. 11. 2026 k otázce 3 (Výpravy za obchodem a velký lov rodu): „A“ – **obojí, ale jen
v nouzi: obilí kupuje, jen když hrozí hlad, a na lov vyrazí, jen když zvěř škodí na polích.**
Správce jedná **stejnými akcemi jako hráč** – výprava za obchodem (`tradeQuote` +
`startExpedition`, [obchod](trade.md)) a lov navíc (`canDeclareHunt` + `declareHunt`,
[zvěř](wildlife.md) – Lov rodu: Kdy) – se stejnými kontrolami. Krok 2a, každý den správce, před
stavbami; rozhoduje jen ze stavu vsi a dne, bez náhody.

- **Kdy hrozí hlad:** z výhledu zásob do žní, ze kterého správce počítá režim a pojistku
  (`fieldStoresOutlook` – osivo, které ves z hromady okna nebo zimního osiva ještě zaseje, se nejí;
  [pole](fields.md) – Výhled zásob k sklizni): potřeba z pole do příští sklizně
  i se ztrátami skladováním bez zásob, které ves smí sníst (obilí, snopy, luštěniny), chybí aspoň
  o `STEWARD.grainMinKg` (25 kg – náklad jednoho nosiče, `TRADE.porterKg`).
- **Komu:** sousedovi, který obilí nabízí (obilnáři), s hotovou zemskou stezkou a bez výpravy na
  cestě; z nich tomu, kdo přinese nejvíc obilí (při shodě méně práce, pak pořadí směrů).
- **Kolik:** jen co chybí, nejvýš co soused letos ještě má; za přeplatek posledního kusu platby
  vezme obilí navíc (jako nákup osiva – [pole](fields.md), Osivo pro ves bez zásob). Výprava nese
  nejvýš `STEWARD.grainPorterShare` (polovinu) dospělých vsi jako nosiče – jinak správce nákup
  úměrně zmenší; ostatní drží práci vsi. Ves, která neunese ani kládu (2 dospělí → 1 nosič, kláda
  potřebuje 2), nic nekoupí.
- **Čím platí:** `STEWARD.grainPayment` v pořadí hřivny → keramika → uhlí → klády – zboží, které
  ves nejí a bez kterého hospodaří (jako nákup osiva: jídlem ani dobytkem neplatí), napřed
  s nejvyšší hodnotou na kg nákladu, ať je výprava nejmenší; jen co soused shání a co letos ještě
  vezme. Obilnáři shánějí vždy klády, takže ves s kládami platí skoro vždy. Nemá-li čím, nekoupí.
  **Klády staveb neprodá** (návrh Clauda, 8. 11. 2026 – „správce v nouzi“, princip schválil
  Martin): z hromady platí jen klády nad rezervu rozestavěných staveb vsi = dřevo, které stavby
  ještě vezmou (stromy, které pro ně ještě nikdo neskácel; klády z hromady si stavba bere už při
  zahájení).
- **Nejvýš jedna výprava naráz** – správce nevyšle výpravu, dokud je jakákoli výprava za obchodem
  na cestě (i hráčova; zásilky dávek pánovi se nepočítají).
- **Kdy zvěř škodí:** v měsících škod (červen–srpen, `FIELD_DAMAGE.windowMonths`) je škoda zvěře
  a vran na polích letos nebo loni aspoň `STEWARD.huntDamageShare` (10 %) roční potřeby obilí
  z pole – stejný práh jako noční hlídka dílu (`FIELD_GUARD.night.threat`); lov je další stupeň
  obrany polí. Loňská škoda platí od 1. 6. (zkušený hráč ví, že zvěř chodí na tatáž pole); letošní
  sama by se na práh dostala až koncem léta.
- **Lov:** lov navíc na zítřek, jen když ho pravidla dovolí (`canDeclareHunt` – mimo hájení,
  aspoň 3 dny od minulého, cvičící rodina a lovci); správce rozhoduje jednou za `everyDays` (10)
  dní, takže loví nejvýš jednou za 10 dní a vždy jen jeden lov naráz. Cíl lovu volí pravidla lovu
  (prasata a jeleni, vlci při škodách na dobytku). **Nejvýš `STEWARD.huntsPerSummer` (3) lovů za
  léto** (červen–srpen; návrh Clauda, 8. 11. 2026 – princip „správce v nouzi“ schválil Martin):
  den lovu chybí v hlídce, výcviku a práci synů, takže lov každých 10 dní by léto vyjedl; počítá
  se v `steward.summerHunts` (rok a počet, volitelná část stavu).

### Ostatní stavby – upřesnění (návrh Clauda – `STEWARD` v `rules-steward.ts`, `steward-extras.ts`)

Kroky 5 až 10 jsou v `domain/village/steward/steward-extras.ts`. Každý začne nejvýš jednu stavbu za den
správce, jen v režimech `STEWARD.stepModes`, jen když se práce stavby vejde do **společného**
rozpočtu práce (pole, obydlí i tyto kroky) a vždy přes `startStewardBuild` (cena předem a kontrola
místa jako u hráče). Sloty hřbitova, humna, sadu a ohrad jsou z plánu sídla ve tvaru, v jakém je
plán ověřil: střed políčka, jeden čtverec bez mřížky.

- **Režimy:** Nouze – jen první hřbitov (10 člověkodní); Obnova – hřbitov, humno, ohrady
  (maso a mléko jsou strava mimo pole), posvátná místa a s nižší předností i koně, cesty a první
  sad nebo jabloně u cest; Růst – vše. Nižší přednost (`stepModes` – podíl rozpočtu 0,5): krok Růstu v Obnově
  začne, jen když po něm zbude polovina celého rozpočtu práce (volná práce × `laborHorizonDays`)
  polím a obydlím (oprava 31. 10. 2026 – Růst a okna roku se míjely: sad, jabloně, cesty a koně se
  ve zdravé vsi za 25 let skoro nespustily).
- **Hřbitov:** hned po první zemnici; dál rozšíření o čtverec, když volná místa (i rozestavěných
  čtverců) nestačí na `graveYears` (5) × očekávané úmrtí za rok (z úmrtností skupin). Rozšíření
  jen slotem, který sousedí stranou se čtvercem hřbitova v mřížce krajiny – jinak by vznikl druhý
  hřbitov; bez takového slotu (i u natočeného hřbitova hráče) správce čeká na přepočet plánu.
  Plán proto hledá semeno hřbitova i další sloty **u čtverců stávajícího hřbitova** (ne u středu
  vsi), jinak by sloty ležely jinde a plné hřbitovy by správce nikdy nerozšířil (oprava 6. 11. 2026 – Vlkov, dva plné hřbitovy; návrh Clauda).
- **Humno:** ves bez humna mlátí nouzově; vyplatí se, když roční ztráta (práce výmlatu ×
  `THRESHING.emergencyWork` + polní práce osevu × `emergencyLoss`) za `paybackYears` (3) převýší
  jeho práci; další, když výmlat nestíhá (`floorShort`). Do 31. 7.
- **Ohrady:** druh stáda s plným stádem (≥ 2 kusy a ≥ místa v ohradách a u domů) → ohrada druhu,
  bez meze na člověka (Martin 18. 11. 2026: „Cílem vesnice je prostě produkovat maximum všeho.“; Martin 22. 11. 2026
  na otázku „Mají se i tato tři místa přepnout na maximum, které ves zvládne?“ odpověděl „ano“ –
  ohrada se staví, kdykoli stádo naplní místa; dřív jen pod `penPlacesPerPerson` × lidé, návrh
  Clauda – [steward-history.md](history/steward-history.md)); `penPlacesPerPerson` zůstává jen pro
  rezervu políček ohrad v plánu sídla (Přednost ohrad a sadu níž); spřežení, když ves má ohradu skotu, chovný pár krav a výrostky na
  pasení a orba na osevu výhledu (kopání motykou − orba rádlem na osetý hektar) za `paybackYears`
  přebije seno volů a ohradu (Ohrada volů podle stáda a osevu níž);
  koně, když vojvodova rodina cvičí (krok Růstu). Mimo žně (1. 7. – 31. 8.). Plán ověřuje sloty
  ohrad pro skot; před stavbou se slot ověří pro stavěný druh (napojení na ohradu téhož druhu,
  cena koní) – slot, který se mu nehodí, zůstane v plánu pro jiný druh.
- **Sad a jabloně u cest:** potřeba jablek = plná potřeba energie × `DIET.fruitShare` ÷
  `APPLE_FOOD_VALUE`; chybí-li ji plocha sadů a jabloní (plná úroda), napřed čtverec sadu, pak
  jabloně podél pevné cesty do `roadFieldM` (40 m) od dílu pole. Jen v oknech výsadby. V Obnově
  jen první zdroj ovoce (ves bez sadu i jabloní), další čtverce až v Růstu – s pěti sady z Obnovy
  v letech 3–5 hladověla zdravá ves na seedu krajiny 2 v letech 14–18 (až 12 dní), s jedním ne
  (měření 31. 10. 2026).
- **Posvátná místa:** modla (nejvýš dvě), pak svatyně, když se vrátí za `sacredPaybackYears` let
  režimu (Posvátná místa podle návratnosti níž; do 2. 11. 2026 práh štěstí 60); místo nejbližší
  středu vsi do `sacredSearchTiles`, které projde kontrolou umístění. Mimo žně. Odklad v mladé vsi
  měření zamítlo (Mladá ves níž).
- **Cesty (krok Růstu, mimo setí a žně):** vylepšení vyšlapané cesty, když úspora chůze a jízd
  vozem za `roadPaybackYears` let režimu převýší cenu (Návratnost vylepšení cesty níž); vozová
  cesta po upravené cestě s provozem ≥ `wagonTrips` a vozem ve vsi; zemská stezka
  jedna, k nejbližšímu kraji, od `trailPeople` (30) lidí. Vozová cesta i stezka jen s celou cenou
  (práce všech úseků) v rozpočtu práce, jako ostatní stavby. Co nešlo (blokovaná cesta, směr), správce zkusí znovu za
  `retryDays` (120) dní (`steward.skips`).

### Mladá ves (návrh Clauda, 1. 11. 2026)

Martin 1. 11. 2026: „Důležitý je správce. Vylepši ho. Měl by přece umět spočítat ideální umístění
všeho a nejlepší postupy.“ Rozbor (diagnostika seedů 3 a 17 před úlohou): v roce 0–1 správce
staví dvě modly, svatyni (400 člověkodní ve vsi o 5 lidech, seed 3), humno a ohrady, volná práce
v roce 0 a 1 je nula. Mladá ves potřebuje práci na pole a stravu.

- **Posvátná místa beze změny (měření zamítlo odklad):** zkoušel jsem je nestavět v prvních
  `youngYears` (3) letech, modlu až od 8 a svatyni od 20 (12) lidí a práh štěstí 45 pod startem.
  Rychlé měření (6 krajin × 25 let) rod zhoršilo: práh 45 – lidé rodu 30,0 → 24,2, hladové dny
  2 534 → 3 321, pojistka 0,43 → 0,37; práh 60 s odkladem – 26,8–27,0 lidí, pojistka 0,40–0,42
  (seed 51: 37 → 15 lidí). Lidé za 5 a 10 let se nezměnili a pojistka mladé vsi se nezvedla.
  Důvod: štěstí násobí veškerou práci vsi (`HAPPINESS_LABOR` – 50 → × 1, 90 → × 1,08); dvě modly
  a svatyně (460 člověkodní, +40) zvednou práci o ≈ 8 % napořád – i ve vsi o 5 lidech se vrátí za
  ≈ 4–5 let a odklad investici jen posune. Práh štěstí zůstal 60 (nad startem schválně); od 2. 11. 2026 ho nahradila návratnost (Posvátná místa podle návratnosti).
- **Humno a ohrady v roce 0** (prvních 365 dní vsi) jen s kladnou hodnotou v úzkém hrdle výhledu
  (Model kapacity vsi): humno se v roce 0 musí vrátit za jeden rok, ne za `paybackYears`; při
  hrdle **práce** se počítá jen ušetřená práce výmlatu (`THRESHING.emergencyWork`) – zrno hrdlo
  nezvedne –, při hrdle půdy nebo osiva i ztráta zrna (osivo a strava z omezené půdy). Ohrady stád
  a spřežení v roce 0 při hrdle práce ne – maso a mléko práci nezvednou, a stádo bez ohrady jen
  neroste (přebytek nad místy na noc se v zimě porazí). Ohrada koní (vojvodova rodina cvičí) beze
  změny.

### Návratnost vylepšení cesty (návrh Clauda, 1. 11. 2026)

Martin 1. 11. 2026: „Zdá se, že správce nijak nevylepšuje cesty.“ Pevné cesty vznikají samy
z vyšlapanosti (roads.md) – správce je jen vylepšuje. S jedním horizontem 10 let se ve Vlkově
(27 lidí, 11 vyšlapaných úseků 5–120 m, 0,5–7,6 pochůzky denně) nevrátil žádný úsek – návratnost
12–181 let.

- **Úspora za rok** (`roadUpgradeSavedPerYear`): chůze – pochůzky za den (poslední roční průměr,
  tam a zpět jedna) × 365 × 2 × rozdíl ceny úseku vyšlapaného a upraveného (`roadPieceCost`: suchý
  kus 1,5 → 1,7, mokřina 0,5 → 1,7 s hatí, brod + 30 m → lávka, stromy u cesty) ÷ den chůze
  (1 m/s, 10 h); jízdy vozem – loňské jízdy (`Road.cartTraffic`) × 365 × rozdíl `CART_SPEED`
  (vyšlapaná 1,3 nebo vyježděná 1,6 → upravená 1,8) mimo mokřinu ÷ den vozky
  (`TEAM_TRAVEL.speedMps`, `WAGON_ROAD.dayHours`) – jako cena jízdy u vozové cesty.
- **Horizont podle životnosti a režimu** (`roadPaybackYears`): upravená cesta s provozem nezarůstá
  a bez provozu vydrží 15 let (`ROAD_DECAY`), cesta slouží desítky let → v **Růstu 25 let**
  (generace), v **Obnově 5 let** (práce je drahá – vrátí se jen velmi vytížený úsek), v Nouzi se
  cesty nestaví. 100 m za 15 člověkodní se v Růstu vrátí od ≈ 3,8 pochůzky denně (dřív od ≈ 9,4),
  v Obnově od ≈ 19.
- **Vlkov (stav 1. 11. 2026):** v Růstu by se vylepšilo 6 nejvytíženějších úseků (5,6–7,6
  pochůzky denně, 78 m, 11,8 člověkodní; návratnost 12–17 let); úsek s 3,6 pochůzky (26 let)
  a úseky s 2,1 a 0,5 pochůzky (44 a 184–188 let) ne. Vozy ve Vlkově nejezdí – přínos vozům se tam
  neprojeví.

### Posvátná místa podle návratnosti (návrh Clauda, 2. 11. 2026)

Dřív správce stavěl modlu a svatyni, když štěstí kleslo pod 60. Štěstí ale násobí veškerou práci
vsi (`HAPPINESS_LABOR` – 0 → × 0,8, 50 → × 1, 100 → × 1,1) a nic jiného nedělá, takže o stavbě
rozhoduje návratnost jako u cest a humna (zpráva `steward-better-5.md` – „správnější by bylo
hodnotit posvátná místa návratností“):

- **Přínos za rok** (`sacredLaborGainPerYear`): body štěstí stavby (modla +8, svatyně +25) nad
  dnešní posvátná místa jen do stropu +40 (duby, háje a hotové stavby – `sacredHappiness`)
  a dnešní štěstí jen do 100; rozdíl násobku práce `happinessLaborFactor` (pod 50 je bod 0,004
  práce, nad 50 0,002) × roční práce lidí vsi (dospělí × 365 – i řemeslníci, štěstí násobí
  všechno).
- **Cena:** práce stavby `SACRED_BUILDINGS.laborManDays` (30 a 400 čd, i s kácením blízkých
  dubů); jinou surovinu stavba nebere – duby jsou v ceně kácením.
- **Horizont podle režimu** (`STEWARD.sacredPaybackYears`, jako `roadPaybackYears`): stavba, ke
  které se chodí, nechátrá (abandonment.md) – v **Růstu 25 let** (generace), v **Obnově 5 let**
  (práce je drahá), v **Nouzi** se nestaví.
- **Co z toho plyne:** nad štěstím 50 dá modla ≈ 5,8 čd a svatyně ≈ 18 čd na dospělého za rok –
  v Růstu se obě vrátí už ve vsi o jednom dospělém, v Obnově modla taky a svatyně od ≈ 4,4
  dospělého. Mladá ves v Obnově tak se svatyní počká, až se jí vyplatí. Ves se štěstím nad 60
  staví taky (bod nad 50 platí stejně, dřív nic); nestaví, když by stavba štěstí nezvedla (strop
  +40, štěstí 100).

### Ohrada volů podle stáda a osevu (návrh Clauda, 1. 11. 2026)

Proč skot ve vsích správce nerostl (rozbor 1. 11. 2026, seedy krajin 3, 13, 17, 25, 28, 51; čísla
ve zprávě `steward-better-2b.md`): ohrada skotu stojí od roku 3–4 (45 míst), seno a pastva by
uživily 3–30 krav, a přesto má ves 2–3 krávy 30 let. Stádo drží pravidla simulace, ne správce:

1. **Roky 0–8 bez pasáků** – zakladatelé nemají děti 7–13 let, pasení je 0 a porážka srazí každé
   stádo na chovný pár (diet.md – Pasáci).
2. **Půlka telat na maso** – ves bez ohrady volů drží jen chovný pár krav; když maso nestačí, jde
   1. 11. na maso polovina letošních telat a stádo stojí na 2,6–2,7 kravách.
3. **Nákup osiva kravami** – ves v pasti osiva platí 1. 9. osivo kravami nad dvě
   (`TRADE.keepCows`; seed 13 a 17 skoro každý rok od roku 11–13 jednu krávu).
4. **Platba za koně** – ohrada koní bere krávy nad chovný pár (seed 28, rok 20: 8 krav z 11).

Body 1, 3 a 4 a seno pro voly, kteří nepřijdou, změnila 2. 11. 2026 pravidla simulace (Martin
schválil návrhy Clauda): dospělý pasák ve vsi bez výrostků (diet.md – Pasáci), nákup osiva
a platba za koně jen krávami nad krávy na mléko a voly (fields.md, horses.md) a seno jen na
skutečné voly (oxen.md – Seno).

Ohrada volů zvedne krávy, které ves drží (`breedingCows` + `oxenCows`), takže telata nad
chovným párem už nejdou na maso a stádo doroste k telatům do výcviku: seed 28 ji postavil v roce
9 při 3–4 kravách, krávy 4 → 11, voli od roku 15, dvě rádla, osev podle práce 10 → 60–106 ha.
Kde ves osivo platí kravami (3, 13, 17, 25), ohrada volů stádo nezachrání – stojí prázdná, chátrá
a ves pro voly, kteří nepřijdou, seče seno.

- **Ohrada volů od chovného páru** (`teamPenValue`): ohrada skotu a chovný pár krav
  (zaokrouhleně). Dřív od `OXEN.minCows` (3) krav – stádo, kterému půlka telat jde na maso, tři
  krávy nemá a ohrada přišla o roky později nebo vůbec. Od 1. do 2. 11. 2026 navíc jen s výrostky
  na pasení (`youngsterHerders`); od 2. 11. 2026 pase ve vsi bez výrostků dospělý (diet.md –
  Pasáci, Dospělý pasák), podmínka odpadla.
- **Úspora orby podle výhledu**: osev = nejmenší z osevů výhledu (práce, osivo, půda –
  `StewardOutlook`), ne osev podle půdy (`fieldCapacity`). Orba ušetří ≈ 90 člověkodní na hektar
  v oknech setí (kopání 100 − orba 10) – vyplatí se vždy, když se něco oseje.
- **Ohrada koní nekupuje koně za krávy na mléko a voly**: od 2. 11. 2026 to hlídá pravidlo
  simulace pro hráče i správce – platba za koně bere jen krávy nad ty, které ves drží na mléko
  a voly (horses.md – Koně se stavbou ohrady; Martin: „Ostatní jsi rozhodl dobře“). Správce jen
  pozná, jestli přebytek na koně stačí (`horsePenPayment`). Od 1. do 2. 11. 2026 to správce
  obcházel sám (`horsePenKeepsCows` – platba musela nechat aspoň `breedingCows`).

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
  blok čtverců pole kolem něj, velký na to, co domácnost (≈ 6–8 lidí) oseje, nejvýš na její jídlo
  při úrodnosti bloku (Pole blízko a podle práce); domy na kraji
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
  domácnosti je menší z toho, co oseje (osev na člověka podle práce × 7 × oběh × 1,25 – Pole
  blízko a podle práce), a její potřeby z pole × oběh × 1,25 (rezerva) při průměrné úrodnosti
  louky území.
- **Území vsi:** do 800 m od středu vsi (dvorec, jinak první obydlí). (Voroného buňka středů vsí
  mapy – zrušeno 1. 11. 2026, jedna ves, jedna mapa.)
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

### Pole blízko a podle práce (návrh Clauda, 1. 11. 2026)

Martin 1. 11. 2026: „Důležitý je správce. Vylepši ho. Měl by přece umět spočítat ideální umístění
všeho a nejlepší postupy.“ Ves brzdí práce ve špičce setí, ne půda (Model kapacity vsi), ale blok
domácnosti se dřív počítal podle jídla (9–17 ha na 7 lidí při osevu 0,3–0,4 ha na člověka) a nové
pole šlo i do bloku hospodářství, jehož dům ještě nestojí – díl pak měří vzdálenost od stávajících
domů a ta se po založení nemění.

- **Blok domácnosti podle práce:** blok = co domácnost oseje – 7 lidí × osev na člověka podle
  práce v oknech setí (výhled vsi `laborHa` ÷ lidé vsi, tedy dospělí domácnosti × osev na
  dospělého při dnešním podílu dospělých) × oběh 3,5 × rezerva 1,25. Od 6. 11. 2026 **bez stropu podle jídla** (Martin: správce
  rozšiřuje pole, dokud mu to mapa dovolí; jídlo omezuje až kapacita mapy) – podle jídla jen ves
  bez lidí nebo bez práce v oknech. Ves samých dospělých, kterou práce nebrzdí, má blok
  jako dřív; ves s dětmi a málo rukama menší (test: 5 dospělých a 12 dětí – 282 místo 622 políček).
  Žádné nové číslo.
- **Přednost ohrad a sadu** (návrh Clauda, 9. 11. 2026): bloky polí podle práce nesmí vzít
  místo u stojících domů, kde ves bude chtít ohrady a sad. Po rozsévači za spřežením (setí 10 →
  3,3 čd/ha) vyšly bloky větší, domy plánu se rozešly a pole u stojícího domu zabrala všechno –
  ohrady i sad šly k plánovaným (nepostaveným) domům až 400 m daleko a přepočtený plán už slot
  ohrady ani sadu nenašel. Plán proto napřed vyhradí u stojících domů 2 políčka sadu (do 4 políček
  od domu) a políčka ohrad (do 7 políček): pro každé stádo, které ves má, tolik čtverců, kolik
  dá `penPlacesPerPerson` × lidé plánu, aspoň 1, a po 1 pro spřežení a koně. Vyhrazená políčka
  nedostane blok polí, nový dům (ani jeho dvůr) ani humno, dílna a hřbitov; sad a ohrady je berou
  jako první, až pak místa u plánovaných domů.
- **Nové pole napřed u stojícího domu:** blok prvního hospodářství se stojícím obydlím (v pořadí
  plánu), které má volná políčka aspoň na nejmenší pole; když bloky stojících domů nestačí,
  políčka bloků ostatních hospodářství nejblíž stojícím domům (a hospodářství podle nejbližšího
  z nich). Ves bez stojícího domu jako dřív. Klučení lesa (jen když louka v plánu nestačí) ve
  stejném pořadí.
- **Výběr políček bloku zůstává po kole od nejbližšího.** Plán vylepšení navrhoval brát
  nejhodnotnější volné políčko (`fieldCellValue` – úroda po záplavách, zvěři a počasí na člověkoden
  založení a práce × příplatek za vzdálenost). Ověřeno na krajinách 1, 13 a 28 (ves se 13 lidmi):
  - podle hodnoty z celého kruhu 800 m si domy berou tatáž nejlepší políčka – hodnota políčka
    od vlastního domu 1,23–1,24 místo 1,23–1,32 kg na člověkoden, vzdálenost 251–340 m místo
    216–256 m, o 50–170 % víc běhů v uloženém plánu (nad 1 kB na domácnost) a vyšší cena šablony;
  - blok rostoucí od okraje k nejhodnotnějšímu sousedovi – 270–392 m, hodnota 1,15–1,23;
  - podle hodnoty jen ve vlastní Voroného buňce domu – hodnota stejná (±0,3 %), o 4–10 m dál.

  Úrodnost i ztráty se mění plynule a příplatek za chůzi je jen 1 % na 10 m, takže nejbližší
  políčko je skoro vždy i nejhodnotnější; nejhorší políčka už vylučuje práh poloviny mediánu louky
  (`fieldValueFloor`). Hodnota políčka dál rozhoduje šablonu (cena rozvrhu) a „je kam pole
  rozšířit“.

- **Verze pravidel plánu** (`STEWARD_PLAN_VERSION` = 2, `steward.plan.version`): hotový plán
  starší verze se přepočítá vedle platného (jako po 5 letech) – správce mezitím staví podle
  starého; rozpracovaný přepočet starší verze se zahodí a začne znovu. Převod jednou
  a idempotentně, po kouscích dopočtu stejně (test).
- **Rychlé měření** (6 krajin × 25 let, `measure-steward.ts`, před → po): lidé rodu 27,7 → 30,0,
  hladové dny na rod 2 871 → 2 534, pojistka 0,42 → 0,43, využití oběhu 0,58 → 0,64 (cíl 0,8 dál
  mimo – vsi v pasti osiva), založení + vracení přílohu 39 → 38 % polní práce, chůze vážená osevem
  237 → 232 m (vzdálenost dílů 263 m), čas správce 3,9 → 3,5 %, nejdražší den 143 → 127 ms.

## Přestavba vlastních staveb (Martin 30. 10. 2026 – „Přestaví, ne hráčovo“; podrobnosti návrh Clauda)

- **Jen stavby v `steward.built`.** Stavby hráče a stavby postavené před zapnutím správce nikdy.
- **Kdy se vyplatí:** zisk za horizont `STEWARD.rebuildHorizonYears` (≈ 10 let, nejvýš životnost
  nové stavby) > cena nové stavby + zbytková hodnota staré (zbývající životnost ÷ životnost × cena)
  - `STEWARD.rebuildMargin` (≈ 20 %, ať se nepřestavuje kvůli šumu). Zisk = ušetřená chůze na pole,
    pro vodu a dřevo, menší ztráty záplav a požáru, uvolněná dobrá půda pod stavbou.
- **Obydlí a dílny – na konci životnosti.** Když vesničané dožilé obydlí správce přestavují
  (`decideRebuilds`), zbytková hodnota je nulová – správce místo přestavby na místě postaví
  **nový dům** na lepším slotu plánu, když zisk převáží rozdíl ceny, a po jeho dostavění
  a přestěhování domácnosti starý dům **zbourá** ([demolition.md](demolition.md) – Správce; akce
  Přestěhovat pro hráče zanikla 8. 11. 2026). Dřív jen při velkém zisku (zatopené místo, dům
  uprostřed nejlepšího pole).
- **Nový dům a zbourání starého (návrh Clauda, 8. 11. 2026):** nový dům je stavba obydlí bez lidí
  k osídlení (`startReplacement` – stavba nese `relocates` a `replaces`); po dostavění se domácnost
  přestěhuje a starý, už prázdný dům se týž den opustí a začne bourat ze společné práce (bez
  kontroly volných míst – nikdo v něm nebydlí; klády z bourání na hromadu). Jiné stavby ani
  opevnění správce sám neboří. Rozestavěné přestěhování ze starší vsi (bez `replaces`) se dostaví
  jako dřív a starý dům zůstane stát prázdný. Hráč, který náhradu zruší, zapíše veto na nové
  i staré místo jako dřív – správce pak dům přestaví na místě.
- **Upřesnění (návrh Clauda):** háček je v `decideRebuilds` (`steward-rebuild.ts`), protože
  rozhodnutí o přestavbě padá tam každý den a den správce (po 10 dnech) by ho předběhl. Zisk
  = rozdíl ceny místa domu za rok (voda a dřevo – `dwellingSiteValue`) × horizont
  `STEWARD.rebuildHorizonYears` (10 let, nejvýš životnost nového domu); stavba jinde stojí tolik
  co přestavba na místě, takže „rozdíl ceny“ je jen přirážka `STEWARD.rebuildMargin` (20 %) z práce
  nového domu. Nevhodné stávající místo (pod hladinou záplav, svah) = vždy se vyplatí. Cíl:
  nejvýhodnější volný a nevetovaný ověřený slot plánu. Dvorec a dílny se nestěhují (přestaví se na
  místě); cesta k poli a uvolněná půda se do zisku zatím nepočítají. Bez zisku nebo bez slotu
  přestaví obyvatelé dům na místě jako dřív.
- **Ostatní stavby** (ohrada, humno, hřbitov, sad, modla) se nepřesouvají: správce postaví novou
  na lepším místě a starou, kam se přestane chodit, nechá chátrat a rozpadnout
  ([opuštěné stavby](abandonment.md)) – bourat ji nemusí. Hřbitov s hroby zůstává vždy.
- **Pole:** akce **opustit díl** (díly vypadnou z oběhu a zarostou – fields.md, Opuštěný díl) je
  stejná pro hráče i správce (Martin 8. 11. 2026: „A“ – Otevřené otázky, bod 1;
  `setPartsAbandoned`). Správce díly opouští, **když jsou špatné, ne když má málo lidí**
  (Martin 8. 11. 2026: „Já měl za to, že správce pole opouští, když jsou na hovno, ne když má
  málo lidí“; původní otázka 1: „Bez ní správce špatná pole, která sám založil, nepřestaví – jen staví lépe
  dál.“). Pole, na které ves nemá lidi, leží ladem samo (osev podle práce) – kvůli nedostatku lidí
  správce nic neopouští (do 8. 11. 2026 opouštěl při trvalém hrdle práce – zrušeno).
  **Výměna dílů (návrh Clauda, Martin 8. 11. 2026: „ok“):** jednou za rok, první den správce
  v září (po žních a novém osevním postupu 1. 9.), mimo Nouzi (výměna se splatí až za roky):
  1. **Které díly:** jen díly, které sám založil (`steward.built`; zakládané, opuštěné a zarostlé
     ne), od nejhorší hodnoty – mapa hodnot políčka dílu se vzdáleností chůze **bez ceny
     založení**, tu ves už zaplatila (jinak by měnil díly kvůli kamenům a pařezům, které už
     odklidil, a čerstvě založené pole by příští září měnil znovu).
  2. **Kam:** blok, který by správce založil jako další pole (Pole blízko a podle práce), na tolik
     čtverců, kolik má vlastních dílů. Jeho hodnota = průměr mapy hodnot čtverců **i s cenou
     založení**, vzdálenost od nejbližšího obydlí (tu dostane nový díl).
  3. **Výrazně lépe:** vymění nejvíc k nejhorších dílů, kdy k-tý z nich
     × (1 + `STEWARD.rebuildMargin`) (20 %, jako přestavba domů) vychází hůř než průměr prvních
     max(nejmenší pole, k) čtverců bloku. Nové pole má aspoň nejmenší plochu pole (1000 m²
     – 5 čtverců), i když opouští méně dílů. Na samotnou vzdálenost to při stejné půdě bez
     překážek vychází od ≈ 670 m (práce 1,57×); dřív u záplav, chudé půdy a zvěře u lesa.
  4. **Práce:** blok jen v rozpočtu práce × `STEWARD.fieldSwapLaborShare` (0,5) – stejná
     kontrola jako u nového pole, nejvýš ≈ 60 dní volné práce: tolik dílů, kolik ves ze září
     založí znovu do jarního setí (okno louky do 28. 2.) i vedle staveb, které už běží; druhá
     polovina rozpočtu zůstane obydlím a ostatním stavbám téhož dne správce.
  5. **Jak:** pole z bloku založí stejnou cestou jako nové pole (záměr stavby pole jako hráč);
     teprve když stavba začne, opustí vybrané díly (jeden řádek kroniky). Bez volného místa, bez
     práce nebo bez dílu o přirážku horšího nic.

  Opuštěné díly výhled nepočítá do pole v oběhu ani do práce na vrácení přílohu. Zpět je správce
  nevrací (vrácení je otázka na Martina).

## Soužití s hráčem (návrh Clauda)

- **Hráč staví kdy chce i v řízené vsi** (Martin 17. 10. 2026: „Hráč sám rozhodne kdy a co bude
  stavět, jako v každé RTS.“; Martin 30. 10. 2026: hráč vždy smí stavět i sám). Správce jeho
  stavby bere jako pevné, plánuje kolem nich a počítá je do rozpočtu práce.
- **Rozestavěnou stavbu správce hráč smí zrušit** (křížek jako u svých staveb –
  `cancelConstruction`). Správce si zrušení zapíše jako **veto**: na tom políčku tentýž druh
  stavby `STEWARD.vetoYears` (≈ 5 let) nepostaví. Hotové stavby správce hráč nebourá, stejně jako
  své (dnešní pravidlo).
- **Veto a přepočet plánu (upřesnění, návrh Clauda):** zrušení stavby správce zapíše veto na
  všech políčkách, která stavba zabírala (`cancelConstruction` s krajinou), na `STEWARD.vetoYears`
  = 5 let; stavba hráče veto nezapisuje. Hráčovo obydlí, humno nebo posvátná stavba na plánovaném
  slotu nebo domě hospodářství (i na jeho dvoře) spustí přepočet plánu hned v nejbližší den
  správce (`steward.replan`, ne až po `replanChanges` změnách); správce do dokončení přepočtu
  staví podle starého plánu a jeho zabrané sloty přeskakuje. Odchod syna přepočet spustí také.
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
  rodina si nestaví dům) **nejstarší ženatý**, jinak nejstarší způsobilý (i svobodný) – ženatý
  založí rod hned. Ves bez rodu (bez vojvody – jen testy a starší kalibrace) syna nemá; ves rodu
  ve hře má vojvodu vždy. Odchod vede `departWithSon` s dílem `sonShare` (1 ÷ dílníků, domácnosti nejblíž domu syna).
  Od 1. 11. 2026 jen syn, jehož díl je **životaschopná výprava** (viz Odchod syna – upřesnění);
  z nich ten s nejživotaschopnějším dílem.
  Nejvýš jeden odchod za rok z jedné vsi; po odchodu se plán mateřské vsi přepočítá (menší ves,
  uvolněné domy).
- **Kam – vždy na novou mapu** (Martin 1. 11. 2026: „Jedna ves, jedna mapa“; dřívější „Tady“ –
  nová ves na téže mapě, když tam bylo místo pro 2× díl – je zrušené):
  - **na novou mapu** (`map`): směr bez vlastní vsi (vlastní ves v sousední mapě nahradí
    souseda – tím směrem se neodchází, migration.md), napřed směr s hotovou zemskou stezkou (cesta
    1 den), pak nejkratší cesta ke kraji mapy (`edgeDistanceM`), při shodě pevné pořadí směrů.
    Novou krajinu vytvoří až `settleStewardDepartures` (seed sídla z `SeedSource` jednou); po
    příjezdu správce nové vsi umístí první zemnici sám (viz Kde správce běží).
  - Seed a jméno nové vsi jsou deterministické (`deriveSeed(state.seed, 'steward-son:' + den)`,
    `suggestVillageName`) – ne z `SeedSource`, ať je dopočet po kouscích stejný.
- **Nová ves má správce zapnutého** (Martin 30. 10. 2026) a vojvodou je syn (fáze 2).
- **Nástupnictví náhodou** (hráč v kůži mladšího syna) není – až s pozvánkami (Martin 30. 10. 2026).

### Odchod syna – upřesnění (návrh Clauda – `STEWARD` v `rules-steward.ts`)

- **Den:** `departureDate` 31. 8. – jeden den v roce, takže nejvýš jeden odchod za rok bez
  dalšího počítadla. Jména synů v každý den správce (`everyDays`) a hned při narození.
- **Přelidnění** (od 6. 11. 2026): lidí víc než `mapCrowdedShare` (0,8) × kapacita mapy
  (Kapacita mapy) – ne podle dnešních polí vsi. Dřívější pravidlo (udržitelní lidé × 1,05 a „není
  kam“) zrušeno.
- **Kdy není kam** (`stewardFieldRoom`, od 6. 11. 2026 odchod syna nepodmiňuje): trvalým hrdlem je práce (další pole by ves neosela), nebo na území vsi žádné
  volné políčko s úrodou nejdál 800 m od obydlí (i staveniště) s hodnotou ≥ `minKgPerManDay` =
  1,5 × 180 kg ÷ 365 ≈ 0,74 kg na člověkoden – louka i les.
- **Past osiva** (Hranice – past osiva z kroku polí): ves seje jen osivo nad jídlo do žní, takže
  hladoví, i když „Pole uživí“ stačí – přelidnění podle polí ji nevidí. Správce si proto pamatuje
  nejvyšší nahromaděný hlad od posledního 31. 8. (`steward.hungerPeak`) a ves, která hladověla
  aspoň `departureHungerDays` (8 dní – nad hladem prvních let nové vsi ≤ 4,5, pod hladem pasti
  11–19 z kouřového testu kroku polí), pošle syna i bez přelidnění podle polí a i s místem na pole
  (další pole by zůstala neosetá – pomůže jen méně lidí). (Dřívější odklad, kdy přelidněná ves
  s místem napřed zakládala pole, zrušen 6. 11. 2026 – přelidnění je kapacita mapy. Původní oprava 31. 10. 2026: ves rodu na seedu krajiny 2 hladověla na stropu 8 let se synem, který smí vést,
  a nikdo neodešel). Kronika `seed-short` se nepoužívá – zkracuje se na konci dopočtu, takže by
  výsledek závisel na kouscích.
- **Životaschopná výprava** (návrh Clauda, 1. 11. 2026 – úloha 3 plánu vylepšení správce; pravidlo
  dílu se nemění – poměrná část vsi, Martin 30. 10. 2026, lord.md – Dělení vsi; správce volí jen,
  **kdy** syna pošle): přelidnění i past osiva pošlou syna jen tehdy, když jeho díl (náhled
  `sonDeparturePreview` – stejné funkce jako odchod) dá ves, která se uživí a poroste. Dřív šel
  i syn sám (díl 1 ÷ dílníků při mnoha synech a domácnost, která by díl přestřelila, se přeskočí):
  v rychlém měření 12 ze 14 odchodů o ≤ 2 lidech – vsi hladové 100 % dní, pojistka 0, bez růstu.
  - **Pár:** žena 16–44 let (rodí – kinship.md) s manželem od 16 let v dílu – syn ženatý, nebo
    s dílem přijde manželská dvojice.
  - **Dost lidí na práci:** aspoň `expeditionAdults` = 4 dospělí (14–44 let, plná práce) – stejně
    jako ves, která uživí cvičící rodinu vojvody (`LORD.minVillageAdults`, Martin 24. 10. 2026);
    80 % práce 5 zakladatelů nové vsi, která musí v prvním roce postavit zemnici a založit pole
    (zakladatelé: ≈ 1 000 čd zakládání v roce 0).
  - **Jídlo do žní a osivo:** jídlo a osivo výpravy aspoň `expeditionLoad` (0,9) toho, co má nést –
    rok jídla do příštích žní (31. 8. je po žních) a osivo na první osev (půl roční potřeby,
    START_SEED_YEARS), **nejvýš kolik unesou** (25 kg jídla a 20 kg osiva na nosiče od 7 let, vůz
    400 / 800 kg – migration.md); osivo zvlášť aspoň 0,9 z půl roční potřeby nebo osiva pěšky.
    Pravidla odchodu (migration.md, Martin) dovolí nést jen ≈ 50 dní jídla dospělého pěšky –
    rok jídla unese jen výprava s vozem; prakticky tedy podmínka zní „výprava odchází s plným
    nákladem“ – mateřská ves má zásoby a díl z nich unesou celý.
  - **Mateřská ves si nechá pojistku:** po odchodu (stav z `departWithSon`) pojistka zásob
    (`bufferFill`) aspoň `departureMotherFill` = 0,5 – odchod ji nesmí poslat do Nouze
    (`emergencyFill`). Výprava bere jen poměrný díl, takže pojistka na člověka odchodem neklesne –
    pojistka hlídá hlavně ves, která zásoby nemá.
  - **Obě vsi po odchodu uživí své lidi** (Martin 2. 11. 2026: „No a neměl by syn odcházet, až
    když je ve zdrojové vesnici dost lidí, aby obě vesnice mohly bezpečně fungovat? Inteligentní
    hráč by to tak udělal“; čísla a podoba návrh Clauda): mateřská ves (stav z `departWithSon`)
    i nová ves (osadníci, jak je založí `foundVillage`) **oseje vlastní prací tolik, že uživí aspoň
    `departureFeedShare` = 1,2× své lidi i s dětmi** – rezerva na děti, které se narodí, a na horší
    rok. Osev podle modelu kapacity vsi (Model kapacity vsi): kapacita setí hospodářského roku
    (lidé po denním minimu, spřežení orbou, rodina vojvody podle svých pravidel) ÷ práce na osetý
    hektar; u mateřské vsi nejvýš i podle **osiva na příští osev** (osivo jen na setí a zrno nad
    polovinu přídělu do žní – past osiva); úroda čistým výnosem hektaru při úrodnosti polí
    mateřské vsi (nová ves na sousední mapě stejnou, s odpočatou půdou) ÷ úroda na člověka jako
    „Pole uživí“ (potřeba z pole podle stravy mateřské vsi a pojistka). **Půda se nepočítá:**
    přelidněné vsi bez místa na pole je odchod lékem (ubude lidí, pole zůstanou) a nová ves si pole
    teprve založí. Osivo nové vsi hlídá náklad výpravy (výš) a chybějící koupí u sousedů
    ([pole](fields.md) – Osivo pro ves bez zásob). Mateřská ves bez polí sama nic neoseje – syn
    neodejde. Jinak správce počká. Je to pravidlo správce – hráč odchod spouští sám.
  - **Kdo:** ze synů, kteří smějí vést a mají životaschopný díl, ten s nejvíc dospělými, pak
    nejvíc lidmi, ženatý před svobodným, starší, nižší id (deterministicky). Nikdo – správce
    počká (syn dospěje, ožení se, ves doroste); přelidnění mezitím řeší model kapacity vsi (cíl
    polí podle úzkého hrdla, Nouze) – ne malou výpravou. V pasti osiva napřed obnova (strava mimo
    pole), odchod jen s životaschopnou výpravou.
- **Nová mapa:** doména vlastní vsi na sousedních mapách nezná – do schránky uloží všech osm směrů
  v pořadí (stezka, kraj, pevné pořadí) a use-case vezme první bez vlastní vsi. Kronika odchodu
  nese první směr. Když na novou mapu nejde (všech osm směrů má vlastní ves, mapa bez místa ve
  světě), záznam čeká ve schránce a po `departureAttempts` (5) pokusech se nezkouší – na téže mapě
  ves nevznikne (jedna ves, jedna mapa – Martin 1. 11. 2026; dřív nejbližší volné místo téže
  mapy). Otevřené: cíl o mapu dál (návrh Clauda – až s větším rodem).
- **Příjezd:** ves na cestě se správcem se v den příjezdu založí na nejbližším volném místě
  k místu vsi nové krajiny (`freeVillageSite`) – plán nové vsi ještě neexistuje. **Odchod syna,
  který spustí hráč** (`leaveVillage` se `sonId`), se po příjezdu sám nezaloží – čeká, až hráč
  umístí první zemnici; správce nové vsi se zapne až v den založení. **Sám se zakládá jen odchod ze
  schránky správce.** Přepínač Správce jde přepnout i u vsi na cestě: zapnutím hráč příjezd svěří
  správci, vypnutím ho převezme. Unikátní index `village_origin_uq` (klíč založení) hlídá jedinou
  ves i při souběhu na různých sídlech; záznam, který nejde vybavit, se zkouší nejvýš
  `STEWARD.departureAttempts` krát.
- **Schránka:** záznam (id = den odchodu) nese seed, jméno, cíl a osadníky; po vybavení jen id
  nové vsi. Nová ves nese klíč založení (`origin`) – úložiště ji podruhé nezaloží (zámek řádku
  sídla), takže opakované i souběžné vybavení i pád serveru mezi kroky založí ves právě jednou.

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
- **Rychlé měření** (plán úloh správce 1. 11. 2026 – po každé úloze vylepšení, ≈ 6 min): `measure-steward.ts 6 25
--seeds 3,13,17,25,28,51 --strategy steward --out quick.jsonl --baseline před.jsonl` (tabulka
  před → po); navíc využití oběhu, chůze vážená osevem, zakládání + vracení přílohu ÷ polní
  práce, odchody o ≤ 2 lidech, vsi rodu o ≤ 2 lidech, pojistka a hladové dny zvlášť mateřská ves
  a vsi synů. Pod 50 let platí cíle rychlého měření (úmrtí hladem ≤ 5 na rod, pojistka ≥ 0,6, chůze
  ≤ 266 m). Diagnostika jedné vsi po letech: `--diag SEED`. Martin 1. 11. 2026 k dlouhému
  měření: „na tohle asi ser, podle mě bude stačit logovat hru“. Kritéria polí a malých vsí (návrh Clauda, 1. 11. 2026 – úloha 3 plánu):
  - ~~**Využití oběhu** = podíl osevu na polích v červnu × `ROTATION_FACTOR`~~ – s orbou
    vycházelo 1,07–1,58 (viz Kritéria polí s rádlem níž); teď jen info „Osev ÷ osev ustáleného
    oběhu“.
  - **Využití oběhu** (návrh Clauda 2. 11. 2026) = 1 − podíl **odpočaté půdy ladem** v červnu na
    polích v oběhu (mateřská ves od roku 10): díl hotový k osevu nebo příloh s úrodností aspoň
    95 % (`FERTILITY.fallowReady`), který ves neosela, ačkoli odpočívat nepotřebuje. 1 = žádný díl
    neleží déle, než musí; rezerva polí 1,1 dá ≈ 0,91. Cíl ≥ 0,8 rychlé, ≥ 0,9 dlouhé.
  - ~~**Založení + vracení přílohu ÷ polní práce** ≤ 32 % (rychlé) / 29 % (dlouhé)~~ – cíl počítal
    s motykou a založením louky 100 čd/ha; teď jen info s podílem založení a člověkodny založení
    na hektar polí.
  - **Vracení přílohu ÷ polní práce** (návrh Clauda 2. 11. 2026) ≤ `overheadTarget(0)` ≈ 24 % –
    vracení louky celého oběhu motykou (polovina oseté plochy ročně, 100 čd/ha). S rádlem drn
    rozorá orba (`PLOUGH_SOD_FACTOR`) a vracení zbude jen u zarostlého přílohu, takže podíl
    klesne; nad mez jde jen ves, která nechává příloh zarůst a pak ho kluče.
  - **Vsi rodu o ≤ 2 lidech kdykoli = 0 – tvrdé kritérium** (ves o 1–2 lidech nemá práci ani
    děti a hladoví napořád); měření ho vypíše pod tabulkou, když neprojde.
  - **Chůze:** kritériem je **chůze vážená osevem** (≤ 266 m rychlé, ≤ A dlouhé); vzdálenost všech
    dílů je od 2. 11. 2026 jen info (Kritéria polí s rádlem níž).
- **Testy** (unit): výsledek nezávisí na kouscích dopočtu (i s plánem po etapách a odchodem),
  správce neprojde, kam hráč nesmí (stejná kontrola i cena), stavby hráče nikdy nezboří ani
  nepřesune, veto drží, převod idempotentní, správce bez krajiny nic nedělá, nová ves syna má
  správce zapnutého, schránka odchodů se vybaví právě jednou.
- **Hodiny měření** (návrh Clauda, 2. 11. 2026): čas správce i dopočtu měří `threadClock` – čas
  CPU vlákna, ne čas na zdi (Čas správce níž).

### Kritéria polí s rádlem (návrh Clauda, 2. 11. 2026)

S rádlem (spřežení od roku 11–17) přestala tři kritéria rychlého měření měřit to, k čemu byla:

- **Založení + vracení přílohu ÷ polní práce (38 % proti cíli 32 %).** Cíl počítal s motykou:
  polní práce 209 čd na osetý hektar, vracení louky 100 čd/ha, založení louky 100 čd/ha. S rádlem:
  - polní práce klesne na ≈ 77 čd/ha (orba 10, drn 25, setí 10, pletí 4, žně 30, mlácení 15);
  - drn přílohu rozorá orba – vracení přílohu zmizí (je v orbě);
  - louka se rádlem zakládá jen za překážky, les dál 250 čd/ha.

  Podíl založení pak ukazuje hlavně krajinu (kolik louky zbývá) a rychlost růstu, ne zbytečnou
  práci: při růstu 5 % za rok vychází s loukou ≈ 2 %, s lesem ≈ 57 %. Rozbor po letech (seedy 3,
  13, 17, 25, 28, 51) zbytečnou práci nenašel:
  - do rádla je to vracení louky v oběhu motykou (42–250 čd ročně, ≈ 24 % polní práce, jak cíl
    počítal);
  - po rádle už jen zakládání při růstu. Seed 25 (59 %) má 20 → 64 ha polí za 13 let, lidé
    22 → 50, ves je přelidněná a „je kam“ – kluče les (≈ 250 čd/ha), protože louka v plánu
    došla (Cíl „Růst se zásobou“, Martin 30. 10. 2026);
  - založená pole se osévají: odpočatá půda ladem je v 5 vsích 0–10 % (rezerva 1,1 dá ≈ 9 %);
  - výjimkou je seed 13 v pasti osiva (68 % odpočaté půdy ladem). Ves tam nezakládá zbytečně
    – od roku 13 nemá osivo a pole nemá čím osít.

  Kritérium proto měří zbytečnou práci přímo:
  - **využití oběhu** – odpočatá půda ladem, tedy založená, a přesto neosetá pole;
  - **vracení přílohu ÷ polní práce ≤ 24 %** – nad vracení oběhu motykou jde jen ves, která nechá
    příloh zarůst;
  - založení + vracení zůstává info s podílem založení a člověkodny založení na hektar polí.

- **Vzdálenost dílů 284 m (cíl ≤ 266 m), chůze vážená osevem 251 m.** Víc polí je dál správně.
  Chůze stojí práci jen při práci na dílu: 1 % na 10 m nad 100 m z práce osetého hektaru. Díl
  ladem a pastvina nestojí nic – pasák jde jednou cestou se stádem. Odhad pro díl o 100 m dál:
  - s rádlem + 10 % ze ≈ 77 čd na osetý hektar, díl oběhu osetý 2 roky ze 7 → ≈ 2,2 čd/ha za rok,
    za 25 let ≈ 55 čd/ha;
  - motykou ≈ 6 čd/ha za rok;
  - klučení lesa místo louky stojí 150–250 čd/ha navíc – louka o 100 m dál se vyplatí na 40
    (motyka) až 100 let (rádlo).

  Plán navíc vybírá díly na řadě po blocích hospodářství nejblíž domu (`sowingBlocks`) a nová
  pole jdou napřed k stojícím domům (Pole blízko a podle práce). Proto vzdálené díly častěji leží ladem a osev
  je blíž (251 m proti 284 m). Kritériem je **chůze vážená osevem**; vzdálenost všech dílů
  (i ladem a čerstvě založených) je jen info.

- **Využití oběhu 1,07–1,58.** Podíl osevu × 3,5 předpokládal ustálený oběh 2 roky osevu a 5 let
  přílohu. Rostoucí ves ale seje čerstvě založené díly (2 osevy z plné úrodnosti), a když
  odpočaté díly nestačí, i příloh 70–95 % (`late`) – osev pak přesáhne 2/7 polí bez plýtvání.
  Nové **využití oběhu = 1 − odpočatá půda ladem** měří, co kritérium hledalo – pole, která
  nepotřebují odpočívat, a přesto leží. Starý podíl × 3,5 zůstává jako info.

**Proč za 25 let neodešel žádný syn** (pravidla odchodu beze změny – schválil Martin). Odchod
v den odchodu (31. 8.) potřebuje spouštěč a pak syna se životaschopnou výpravou, po jejímž
odchodu obě vsi uživí 1,2× své lidi. Spouštěč je jeden ze dvou:

- přelidnění (od 6. 11. 2026 lidí víc než 0,8 × kapacita mapy);
- hlad aspoň 8 dní od minulého 31. 8.

Rychlé měření (6 seedů, po letech):

- **Synové od 16 let** jsou až od roku 17–21 (zakladatelé mají první děti v letech 1–5).
  **Životaschopnou výpravu** (≥ 4 dospělí s párem, plný náklad) mají až v letech 22–24, když
  synovi dorostou děti. Dřív by odešel jen sám nebo se ženou (1–3 lidé).
- **Spouštěč nenastal.** Přelidnění přichází v letech 21–25 (seedy 3, 25, 28), ale vždy je
  ještě kam pole rozšířit. Správce proto zakládá a kluče, jak velí Cíl „Růst se zásobou“.
  Ves se zásobou zakladatelů nehladoví. Výjimka je seed 13 – od roku 14 hladoví v pasti osiva,
  ale výprava nemá jídlo ani osivo (náklad 0,26, osivo 0) a nikdo ze synů nemá pár.
- **Kdy by syn odešel:** ves rodu, která dorostla na ≈ 40–55 lidí a vyčerpala půdu v dosahu
  800 m (les i louku v plánu), nebo ves, která rok hladoví a má syna s domácností aspoň
  4 dospělých a zásobami. Typicky po roce 25–35. Uvidí se to až v delším běhu nebo v deníku vsí.

### Čas správce (návrh Clauda, 2. 11. 2026)

Nejdražší den správce 216 ms (cíl ≤ 200 ms) byl v rychlém měření ve vsi seed 25 (50 lidí, 2 800 dílů,
64 ha). Profil dne:

- polovinu času správce zabírala kopie celého stavu (`structuredClone`) v každé akci stavby – pole,
  sad a vylepšení cesty v jednom dni = tři kopie po ≈ 13 ms;
- akce staveb teď kopírují přes `cloneState` (jako dopočet; sdílené záznamy se nemění na místě),
  4,5× rychleji. Výsledky měření jsou bit po bitu stejné. Drahý den roku 24: 80 → 44 ms, den se
  stezkou roku 20: 37 → 25 ms (bez zátěže, zahřáté).

Zbytek rozdílu nebyl ve správci. Tentýž den trval na zdi 44 ms bez zátěže a 191 ms při zátěži
stroje 94 (měření běží v 5 vláknech s `nice 19` vedle jiné práce); GC v něm bylo jen 0–21 ms.
Nejdražší den na zdi tak měřil zátěž stroje: týž běh dal 157, 159 i 216 ms. Měření proto počítá
čas CPU vlákna (`threadClock` – `process.threadCpuUsage`), ne čas na zdi. Rychlé měření na
hodinách CPU: čas správce 3,7 % dopočtu, nejdražší den 151 ms (seed 25; den, kdy poprvé běží
kód, který se pak zahřeje, stojí ≈ 3× víc než zahřátý).

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

| Rozhodnutí                                                                                                                                            | Kdo                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Zbytek vsi spravuje NPC; hráč může svou ves svěřit správci a vždy smí v každé vsi rodu stavět                                                         | Martin (zadání issue #9, 24. 10. 2026)                                                                                                     |
| Přepínač Správce u každé vsi; ves syna zapnutý, první ves vypnutý; hráč přepíná kdykoli a staví i sám                                                 | Martin (30. 10. 2026)                                                                                                                      |
| Rozsah první verze: obydlí, pole, ohrady, hřbitov, sad, humno, dílny, cesty, odchod syna, jména synů                                                  | Martin (30. 10. 2026)                                                                                                                      |
| Úroveň „Absolutní skiller“ – optimalizuje rozestavení, pole a vzdálenosti podle krajiny                                                               | Martin (30. 10. 2026)                                                                                                                      |
| Cíl „Růst se zásobou“ – napřed pole a klučení, až když není kam, odchod syna                                                                          | Martin (30. 10. 2026)                                                                                                                      |
| Přestavba „Přestaví, ne hráčovo“ – jen vlastní stavby, když se to vyplatí                                                                             | Martin (30. 10. 2026)                                                                                                                      |
| Nástupnictví náhodou až s pozvánkami, ne ve fázi 3                                                                                                    | Martin (30. 10. 2026)                                                                                                                      |
| Krok simulovaného dne `stewardDay` v pevné dny (každý 10. den, odchod 31. 8.), bez krajiny spí                                                        | návrh Clauda                                                                                                                               |
| Doménový příkaz `applyBuildIntent` – jedno pravidlo pro hráče i správce; use-casy se na něj přepojí                                                   | návrh Clauda                                                                                                                               |
| Správce nezná budoucnost (seed počasí, rozpis pohrom), jen co vidí hráč a četnosti z pravidel                                                         | návrh Clauda                                                                                                                               |
| Režimy Nouze / Obnova / Růst podle pojistky zásob; rozpočet práce ≈ 120 dní volné práce                                                               | návrh Clauda                                                                                                                               |
| Hodnota a cena v člověkodnech za rok (dřív i cíl polí na lidi za 2 roky × 1,1 – [historie](history/steward-history.md))                               | návrh Clauda                                                                                                                               |
| Cíl polí = maximum, které ves obdělá – osít i sklidit (lidé podle osevu × 1,1), bez ohledu na stravu; ves bez pole opatrně z potřeby s podílem 1      | Martin 18. 11. 2026 („Cílem vesnice je prostě produkovat maximum všeho.“), 9. 11. 2026 (sklidit za každou cenu); vzorec návrh Clauda       |
| Plán sídla ze šablon (shluk, řadová ves, samoty), hospodářství dům + blok polí, rezervy, uložený ve stavu                                             | návrh Clauda                                                                                                                               |
| Území vsi do 800 m od středu; správce plánuje jen na svém území (Voroného buňky zrušeny 1. 11. 2026)                                                  | návrh Clauda                                                                                                                               |
| Značka „postavil správce“ jako množina id `steward.built`; převod: bez stavu vypnutý                                                                  | návrh Clauda                                                                                                                               |
| Přestavba obydlí na konci životnosti: nový dům jinde, starý se zbourá; ostatní stavby nová + stará chátrá                                             | návrh Clauda (bourání – Martin 8. 11. 2026)                                                                                                |
| Hráč smí zrušit rozestavěnou stavbu správce → veto na 5 let                                                                                           | návrh Clauda                                                                                                                               |
| Jména synů při narození jako u vnuků; odchod nejstaršího ženatého způsobilého syna, nejvýš jednou za rok                                              | návrh Clauda                                                                                                                               |
| ~~Odchod na téže mapě, když tam je místo pro 2× díl~~; vždy nová mapa (stezka, nejkratší cesta)                                                       | návrh Clauda, Martin (1. 11. 2026)                                                                                                         |
| Odchod přes odchozí schránku `steward.departures` a use-case `settleStewardDepartures`                                                                | návrh Clauda                                                                                                                               |
| UI: přepínač s ikonou v seznamu vsí a v panelu dvorce, ikona u staveb správce, žádné kroniky navíc ani plán                                           | návrh Clauda                                                                                                                               |
| Ověření skriptem `measure-steward.ts` – 20 krajin v 5 typech, 50 let, srovnání se skriptem, Vlkovem a mezí                                            | návrh Clauda                                                                                                                               |
| Nouze jen při rostoucím hladu; kroky Růstu i v Obnově z poloviny rozpočtu (sad jen první); syn z pasti po roce                                        | návrh Clauda (oprava 31. 10. 2026)                                                                                                         |
| Kapacita mapy: odchod syna při lidech > 0,8 × co uživí všechna obdělatelná půda mapy; pole bez stropu podle jídla                                     | Martin 6. 11. 2026 („Ano, přesně tak“); vzorec návrh Clauda                                                                                |
| Model kapacity vsi: cíl polí podle toho, co ves obdělá (`workableHa` – lidé, spřežení, žeň, výmlat); „je kam“ a přelidnění podle trvalého hrdla       | návrh Clauda (Martin 1. 11. 2026: „Vylepši ho“; D99 kola 1 a 2, 19. 11. 2026)                                                              |
| Syn odchází jen se životaschopnou výpravou (pár, ≥ 4 dospělí, plný náklad jídla a osiva, pojistka matky ≥ 0,5)                                        | návrh Clauda (Martin 1. 11. 2026: „Vylepši ho“)                                                                                            |
| Blok domácnosti podle práce (nejvýš podle jídla), pole napřed u stojícího domu, políčka dál od nejbližšího                                            | návrh Clauda (Martin 1. 11. 2026: „Vylepši ho“)                                                                                            |
| Rok 0 s hrdlem práce: humno jen s ušetřenou prací výmlatu za rok, ohrady stád ne; odklad posvátných míst měření zamítlo                               | návrh Clauda (Martin 1. 11. 2026: „Vylepši ho“)                                                                                            |
| Vylepšení cesty: úspora chůze i vozů (mokřina, brod), horizont Růst 25 let, Obnova 5 let                                                              | návrh Clauda (Martin 1. 11. 2026: „správce nijak nevylepšuje cesty“)                                                                       |
| Ohrada volů od chovného páru krav s pasáky, úspora orby podle výhledu; koně ne za krávy na mléko a voly                                               | návrh Clauda (1. 11. 2026)                                                                                                                 |
| Syn odejde, jen když obě vsi po odchodu uživí osevem vlastní prací 1,2× své lidi (půda se nepočítá)                                                   | Martin (2. 11. 2026) / čísla návrh Clauda                                                                                                  |
| Měření: využití oběhu = 1 − odpočatá půda ladem, vracení přílohu ≤ 24 %, založení a vzdálenost dílů jen info                                          | návrh Clauda (2. 11. 2026)                                                                                                                 |
| Měření: čas správce na hodinách CPU vlákna; akce staveb kopírují stav přes `cloneState`                                                               | návrh Clauda (2. 11. 2026)                                                                                                                 |
| Posvátná místa podle návratnosti: přínos štěstí k práci vsi za horizont režimu (Růst 25, Obnova 5) proti ceně stavby                                  | návrh Clauda (2. 11. 2026)                                                                                                                 |
| Obchod a lov jen v nouzi: obilí výpravou, když hrozí hlad, lov navíc, když zvěř škodí na polích – akcemi hráče                                        | Martin (8. 11. 2026: „A“), pravidla návrh Clauda                                                                                           |
| Správce v nouzi: lov nejvýš 3× za léto, klády rozestavěných staveb neprodá                                                                            | Martin (8. 11. 2026 – princip), čísla návrh Clauda                                                                                         |
| Správce opouští díly, když jsou špatné, ne když má málo lidí: v září vymění své díly o 20 % horší než volné místo plánu za nové pole tam (akce hráče) | Martin (8. 11. 2026: „A“; „Já měl za to, že správce pole opouští, když jsou na hovno, ne když má málo lidí“; „ok“), kritérium návrh Clauda |

## Otevřené otázky

1. ~~**Vypustit díly pole**~~ – rozhodnuto (Martin 8. 11. 2026: „A“ – „Vypustit díly pole – akce
   pro hráče i správce, kterou díly vypadnou z oběhu a zarostou; stejná akce pro oba.“). Pravidla
   v [polích – Opuštěný díl](fields.md); akce hráče je hotová a správce ji používá (Přestavba
   vlastních staveb – Pole). Správce opouští špatné díly, ne díly navíc kvůli nedostatku lidí
   (Martin 8. 11. 2026: „Já měl za to, že správce pole opouští, když jsou na hovno, ne když má
   málo lidí“) – výměna za lepší místo plánu.
2. **Odchod bez syna** – ves přerostla, ale syn, který smí vést, není (nebo bude za ≥ 2 roky).
   Návrh Clauda: správce počká a ves srovná hlad; alternativa – odchod nejbližších obydlí
   (vojvodou nejstarší muž rodu mezi nimi) jako hráč.
3. ~~**Výpravy za obchodem a velký lov rodu**~~ – v první verzi je správce nedělá (nejsou stavby).
   Chce je Martin v další verzi (nákup obilí v hladovém roce, lov prasat na polích)?
   **Rozhodnuto** – Martin 8. 11. 2026: „A“ (obojí, ale jen v nouzi – obilí kupuje, jen když
   hrozí hlad, a na lov vyrazí, jen když zvěř škodí na polích); pravidla v Obilí a lov v nouzi.
4. ~~**Tady, nebo na nové mapě**~~ – uzavřeno: vždy nová mapa (Martin 1. 11. 2026: „Jedna ves,
   jedna mapa“).
5. ~~**Vsi na téže mapě**~~ – odpadá (jedna ves, jedna mapa – Martin 1. 11. 2026); výsledek
   správce na pořadí dopočtu vsí nezávisí.
6. **Správce v první vsi** – zapnout ho sám po dlouhé nepřítomnosti hráče? Návrh Clauda: ne,
   rozhoduje jen hráč (Martin 30. 10. 2026 – první ves vypnutý).
7. **Strop počtu vsí rodu** (závěrečná recenze, S3) – žádný strop vsí na rod ani na mapu: každá
   ves se správcem pošle nejvýš jednou za rok syna, počet vsí tak roste zhruba exponenciálně.
   `dynastyStatus` navíc dopočítá všechny vsi hráče v každém požadavku, cena roste s jejich
   počtem. Návrh Clauda: dočasný strop `STEWARD.maxLineVillages` (správce syna nepošle, má-li
   rod tolik vsí) do ostrého spuštění, později líný dopočet vsí bez hráče / dopočet ve workeru.
   Rozhodne Martin.
8. **Jídlo výpravy do žní** (úloha 3 plánu vylepšení, 1. 11. 2026) – pravidla odchodu (25 kg
   jídla na nosiče, vůz 400 / 800 kg – migration.md) unesou pěšky ≈ 50 dní jídla dospělého, rok
   do žní jen s vozem; správce proto chce „plný náklad“, ne rok jídla. Má výprava syna brát víc
   (třeba poměrný díl zásob až na rok, nebo stáda navíc), nebo je hladový první rok nové vsi
   výzva? **Uzavřeno** – Martin 1. 11. 2026 na otázku „Syn správce teď odchází jen s plně
   naloženou výpravou, takže odchodů je málo. Je to v pořádku?“: „ano“.
9. ~~**Cíl polí a práce žní**~~ – **uzavřeno 19. 11. 2026:** cíl polí je nejvýš to, co ves
   stihne osít i sklidit, × rezerva (Martin 18. 11. 2026 – „kolik jich ves zvládne obdělat“:
   „Ano. … Cílem vesnice je prostě produkovat maximum všeho.“; 9. 11. 2026: „Je lepší za každou
   cenu sklidit to, co už vyrostlo, než začínat pěstování úplně od začátku“; výpočet návrh
   Clauda – Model kapacity vsi, Co ves obdělá). Dřív (18. 11.) výhled měřil jen setí a správce chtěl
   od roku 13 4–8× víc polí, než měl; teď 1,0–1,8×.
10. ~~**Dřina v srpnu z pořadí dne**~~ – **uzavřeno 19. 11. 2026 jako chyba proti vlastnímu
    textu návrhu** ([štěstí](happiness.md) – Den dřiny: „Plná práce ve špičce, která se stihne,
    dřinou není“): otava (srpen–září) jde v práci dne před výmlatem hned po žni (`DAY_WORK_ORDER`)
    a ve zlaté vsi bere ≈ 4 týdny 4,9 čd/den; dřina počítala tempo bez seče (výmlat 0,3 čd/den),
    takže padala na každý den otavy, dokud ozim čekal na výmlat – i když výmlat skončil v září až
    listopadu. Od 19. 11. 2026 patří dnešní seč a otava do tempa (`toilToday` – po seči ta práce
    přejde na výmlat). Dny dřiny zlaté vsi za 21 let: BASE 120 → s opravou 46; cíl polí na maximum
    217 (kolo 1) → s opravou a žní před otavou 152 (kolo 2).

**Na noc 30. → 31. 10. 2026 rozhodl Claude (Martin spí, ráno k potvrzení):** 1) v první verzi
ne – správce staví lépe dál, akce pro hráče i správce až po potvrzení; 2) správce napřed kluče
nová pole, když není kam a syn chybí, počká, než syn dospěje (odchod obydlí je podle Martina
„spíš stěhování sídla v rámci mapy“); 3) ne – rozsah první verze podle Martina; 4) podle návrhu
Clauda; 5) stačí, společný dopočet vsí jedné mapy až s válkou; 6) uzavřeno – Martin 30. 10. 2026:
první ves vypnutý.
