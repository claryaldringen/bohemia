# Divoká zvěř vsi – stav, stropy, roční přepočet

Pravidla: [wildlife.md](../design/wildlife.md) (Kde zvěř žije a kolik jí je; Roční přepočet – 1. 5.).
Stav: W1 zvěř počítá, W2 škodí na polích (Škody níž); lov a šelmy přinášejí další úlohy plánu
`docs/superpowers/plans/2026-10-26-wildlife.md`.

## Stav a stropy

- `VillageState.wildlife?: WildlifeState` (`types-wildlife.ts`): `land` (`WildlifeLand` – les, louky
  a pole, voda v ha, počet tůní), `deer` (jeleni, laně, kolouši), `boar` (dospělá, selata),
  `hares`, `wolves`, `bear { present, backDay }`, `fishKg`. Kusy jsou čísla s podílem. Lišky
  a vrány se neukládají (`wildlifeCaps().foxes`, `crowFlocks(sownHa)`). Další úlohy přidávají jen
  volitelná pole.
- `wildlifeCaps(land, villagePigs)` (`wildlife.ts`) – stropy kusů; čísla v `rules-wildlife.ts`
  (`WILDLIFE_CAPS`, `WILDLIFE_YEAR`, `WILDLIFE_LAND`, `CROWS`) s odkazem na návrh. Lišky se
  zaokrouhlují dolů (kusy).
- `freshWildlife(land, pigs)` – vše na stropu (jelení 2 : 5 : 3, prasata půl na půl, medvěd podle
  lesa).

## Krajina

`wildlifeLandAt(landscape, state)` (`wildlife-land.ts`): políčka do 1 km od `villageOrigin(state)`
(`placement-squares.ts`, totéž místo jako `withLivestockLand`). Les = povrch les + les vsi, bez
čtverců polí/sadů/hřbitovů/ohrad (`villageLandSquares`) a bez políček obydlí, jen souvislé kusy
(4 sousedé, flood fill) od 1 ha; louky = louka + pole; voda = políčka vody; tůně = body osy potoka
s `pool ≥ 0,5` do dosahu, sloučené po 60 m. Počítá se **jen při převodu a 1. 5.** (jednou ročně),
žádný dotaz po dílech. Paseky se nepočítají (zjednodušení).

## Převod a přepočet

- `withWildlife(state, landscape | null)` – chybí `wildlife` → zvěř na stropu; jinak týž objekt
  (idempotence). V `advanceVillageSteps` (`simulate.ts`) a v `update-village.ts` kolem
  `withLivestockLand`. Bez krajiny výchozí `WILDLIFE_LAND.defaultLand` (les 190 ha…). Výchozí
  krajina (les 190 ha → medvěd, 3 lišky) platí jen pro testy a kalibraci s `landscape = null`.
  Selhání výpočtu krajiny → ves **bez zvěře** (`WILDLIFE_LAND.failedLand` samé nuly: bez medvěda
  a lišek, 5 vlků jako před zvěří) a `wildlifeFailed` (log v `updateVillage`); příští 1. 5.
  s krajinou se zvěř přepočítá podle skutečné krajiny.
- `wildlifeYearDay(state, day, landscape)` – v `simulateDay` hned za `updateLordTraining`; jen
  1. 5.: krajina znovu (s krajinou), jelení zvěř (dospění, úbytek 10 % + 1 % na vlka, kolouši =
     laně × 0,6, nad stropem napřed kolouši a laně), prasata (úbytek 20 %, selata = dospělí, nad
     stropem poměrně), zajíci × 2, vlci + ½ chybějícího, medvěd (`bearBackDay(killDay)` = za 3 roky;
     kronika `bear-returned`), ryby logisticky. Bez náhody.

## Vlkov (kopie 26. 10. 2026)

Les 118 ha, louky a pole 132 ha, voda 5,6 ha, 3 tůně; stropy: jelení 5,9, prasata 5,0, zajíci 19,8,
lišky 2, vlci 0,9, medvěd ne (pod 150 ha lesa), ryby 1 681 kg. Převod ≈ 10 ms.

## Škody na polích (W2, `wildlife-damage.ts`)

Pravidla: [wildlife.md](../design/wildlife.md) – Škody, Prasata a jeleni na polích. Čísla jsou
`FIELD_DAMAGE` v `rules-wildlife.ts`. Škoda je bez náhody; stav je volitelné `WildlifeState.damage`
(`FieldDamage` v `types-wildlife.ts`): `risk` (díl, `weightHa`, `edgeM`), `parts` (podíl hrubé úrody
a kg po dílech, jen nenulové), `topPartId`, `totalKg`, `lastYearKg`.

- **1. 6.** `damageWindowStart(state, day, landscape)` (v `simulateDay` za `lordHelpDay`, před
  `work()`): ohrožené jsou osetré díly ozimu a jaře (i nad potřebu; luštěniny a len ne), které
  setí zasáhlo celé (`taskSpans` 'sow'); váha 1 do 50 m od okraje lesa, k 250 m lineárně 0
  (`edgeWeight`). Vzdálenost: `forestEdgeDistances` (`wildlife-land.ts`) – chamfer 3–4 masky lesa
  z W1 (jen kusy od 1 ha, jen do 1 km), od středu políčka dílu minus půl políčka; jednou za rok.
  Bez krajiny: `surface === 'forest'` 0 m, jinak `defaultEdgeM` 120 m. Díl s váhou 0 zůstává
  v seznamu kvůli vranám. Místo pro obranu (W4–W6): `dailyThreatShare` (níž) – hlídka přidá
  faktor `(1 − hlídka)` na jednom místě, lov snižuje kusy v `wildlifeEatsKgPerDay`.
- **Denní hrozba** `dailyThreatShare(state, day)` (`wildlife-damage.ts`, čistá funkce bez zápisu)
  → `Map<partId, podíl hrubé úrody>` pro dosud nesklizené osetré díly; použije ji
  `wildlifeDamageDay` a W6 do ní přidá obranu polí. Kg zvěře =
  Σ kusy × kg/kus (`wildlifeEatsKgPerDay`) × `min(1; Σ weightHa ÷ 10 ha)` (malá ves, Martin 26. 10. 2026), kde součet jde **jen přes dosud nesklizené díly** (po sklizni ozimu se denní
  škoda jaře na ha nezvýší), rozdělí se podle `weightHa` na tytéž díly (`taskSpans` 'harvest',
  díl je sklizený, až úloha prošla jeho koncem), přepočte na podíl hrubé úrody dílu
  (`cropGrossPerHa` × ha); díl nejvýš `maxShare` 0,5, zbytek propadne. Vrány `crowShare ÷
windowDays` (ozim 61, jař 92) denně na každý nesklizený ohrožený díl. Mimo 1. 6. – 31. 8. a po
  sklizni plodiny (`harvestedKg`) nic.
- **Úroda:** `harvestKg`, `expectedWinterKg` a `daysUntilFoodHarvest` (`year-plan.ts`) berou
  volitelné `losses` (`PartLosses` = `damage.parts`); díl dá hrubou úrodu × (1 − share). Sklizeň
  ozimu, jaře a nad potřebu (`simulate-food.ts`) i výhled jídla (`diet.ts`, `emergency-slaughter.ts`)
  předávají `state.wildlife?.damage?.parts` – příděl nepřecení úrodu. Len a luštěniny škodu nemají.
- **31. 8.** `wildlifeSeasonEnd` (v `simulateDay` po `harvest()`): kronika `wildlife-damage { kg }`
  („Zvěř a vrány zničily … kg obilí“, jen > 0), `risk` a `parts` se vyprázdní (ztráty by jinak
  zkreslily výhled další sezóny podle id dílů); `totalKg` zůstává do 1. 6.
- **Vlkov (kopie 5. 6. 820):** škoda 522 kg v sezóně 821 (8,1 % úrody) a 435 kg v 822 (8,3 %);
  sklizeň bez škod 6 441 / 5 354 kg. Hlad 0 dní, nejnižší zásoby shodné, rok se nezpomalil
  (+0,3 %). Zvěř ≈ 4–6 kg/den při 12–16 ha ohrožených polí (1 040 dílů po ≈ 0,02 ha).

## Šelmy (W3, `predators.ts`, `fox-eggs.ts`)

- **`LIVESTOCK.lossPerYear`** je základ bez vlků (ovce 9, kozy 7, prasata 10, skot 5 %; `herdLosses`
  beze změny). **Vlčí díl** `PREDATION.wolfShare` (3 / 3 / 2 / 1 % při `fullPack` = 5 vlcích) dělá
  `predationDay(state, day)` v `husbandryDay` hned po `herdLosses`. Roční zbytek vlky je
  `(1 − základ − díl × vlci ÷ 5) ÷ (1 − základ)` (aby součet při 5 vlcích dal přesně dosavadních
  12 / 10 / 12 / 6 %), rozpočtený na dny, kdy je stádo venku: ovce, kozy, skot duben–říjen
  (214 dní), prasata 365 (`wolfDailyKeep`). Ves bez `wildlife` = 5 vlků (`wolvesOf`), ale bez
  kroniky (nemá kam ukládat akumulátory). `yearlyMeatPerHead` počítá se základem + plným dílem
  (kalibrace stád beze změny).
- **Medvěd:** je-li `bear.present`, duben–listopad bere denně `2 ÷ dny` prasete **absolutně**
  (ne podílem), ale jen z prasat nad chovný pár: `min(2 ÷ dny; max(0, prasata − keepPigs))`,
  `PREDATION.bear.keepPigs` = 2 (stádo 2 prasat přežije). Dny sezón (`PASTURE_DAYS` 214,
  `BEAR_DAYS` 244, rok 365) se odvozují z měsíců `PREDATION` a kalendáře (`monthLength`),
  `PREDATION.pigsAllYear` řídí, zda jsou prasata v lese celý rok.
- **Kronika:** `WildlifeState.predation { acc, bearAcc, killDays, yearHeads }` vzniká líně;
  zlomky kusů do `acc`, celé kusy se sbírají v `monthHeads` a **poslední den měsíce** jdou do kroniky jako událost
  `predator-kill { species, by, heads }` (jedna za druh a šelmu a měsíc; odchylka od plánu:
  `heads`, ne denně – jinak by u velkých stád vytlačily z 500 událostí kroniky důležitější), `killDays` posledních 30 dní, `yearHeads` od 1. 5.
- **Liška:** `foxEggFactor(wildlife)` = 1 − min(8 %; 2 % × lišky), lišky = `foxCount(land)`
  (strop z `wildlifeCaps`). Bere ho `dailyEggsKg` (jídlo, nouzová porážka, výhled) i
  `proteinBudget` a plán velikosti stád (`eggsKg`). Ves bez `wildlife` = 1.
- **Vlkov (kopie 5. 6. 820, 2 roky):** 0,6 vlka, les 112 ha, bez medvěda, 2 lišky → vlčí díl
  skoro nulový (stáda rostou víc: ovce 45,9 vs 43,3), vejce −4 %, hlad 0, rok 59,9 s (dřív 60,3 s).
  Podrobnosti `diag-wildlife/w3.txt`.
