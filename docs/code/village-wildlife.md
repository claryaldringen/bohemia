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
  a lišek, 5 vlků jako před zvěří) a `wildlifeFailed` (log v `updateVillage`); ves s `wildlifeFailed`
  krajinu zvěře nepřepočítává (`wildlifeYearDay` 1. 5. ani `damageWindowStart` 1. 6. na ni nesáhnou,
  test ve `wildlife-year.test.ts`); log chyby je v `updateVillage`.
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
  `work()`): ohrožené jsou osetré díly ozimu a jaře (luštěniny a len ne), které
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
  ozimu a jaře (`simulate-food.ts`) i výhled jídla (`diet.ts`, `emergency-slaughter.ts`)
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

## Psi dvorce a velký lov rodu (W4, `manor-dogs.ts`, `hunt.ts`, `hunt-party.ts`)

- **Kdo může lovit** (`huntPool` v `hunt-party.ts`): muži cvičící rodiny od 14 let (`manor`,
  `HUNT.riderFromAge`) a odešlí synové rodu (`away`: `lineMen` mimo dvorec, dospělí 14–44 let
  s `arms`) – jen pěšky. **Děti na lov nechodí** (Martin 27. 10. 2026) – ani na kalendářní lov, ani
  na lov navíc; chlapci 10–13 let v den lovu cvičí doma jako jindy (`trainLordDay`) a jedou objížďku
  (`lordRides`), scéna je mezi lovci nekreslí (čte jen `hunt.today`; `SceneHunt.day` – scéna lov hraje ve skutečném čase 10 minut od dne lovu a běžící lov si pamatuje do návratu lovců, scene-village.md – Lov). Pojistka v `huntRisk`
  (dítě nezahyne ani se nezraní) zůstává. `dogsWanted` = počet lovců (`manor` + `away`) + 1,
  nejvýš 8 (`MANOR_DOGS`).
- **Psi:** `WildlifeState.dogs { count, fed }` vzniká hned (`dogsYear` zakládá smečku `wanted` psů, kdykoli ji ves nemá a má lovce;
  jednou, `dogs` pak existuje) a dál 1. 5. (`wildlifeYearDay`: −10 %, nakrmená smečka dostane nejvýš 2 štěňata do chtěného počtu). `feedDogs` (`simulate-food.ts`,
  za `feedHorseGrain`) odebírá 0,3 kg obilí na psa ze zásob; hladová ves nebo nedostatek do sklizně
  (po odečtení obilí koní) = `fed = false`, štěňata nepřibudou. Obilí psů je i ve výhledu osevu
  (`storesOutlook` – `dogGrainToday`). Do lovu jde `huntingDogs` = celé kusy; psi jdou k pěším od
  nejsilnějšího, pěší bez psa má poloviční sílu.
- **Ráno** (`planHuntDay` v `simulateDay` po `wildlifeYearDay`, před `work()`): `hunt.today`
  (`HuntDay { target, riders, foot, extra }`). Kalendář `huntSeasonIndex`: 1. 11. + 7k dní do
  konce února (18 dní, leden a únor se počítají od 61. dne sezóny); mimo ně `extraDay` (W5). Rodina
  musí cvičit (`trainingFamily`). Jezdec = muž s koněm po `assignRiders` (nepodkutý kůň –
  `isUnshod` – nejezdí, všichni pěšky); jezdec jede jen když `ridesBetter` (příspěvek na prasata
  i jeleny podle `HUNT.base` ≥ pěšího se psem), jinak jde pěšky. Rodina na poli ve žních –
  `huntDay` vyřadí jezdce i pěší z rodiny, kteří jsou dnes na poli (`lordFieldIds`), ostatní a odešlí synové ano. Cíl: **medvěd** (listopad, každý druhý lov, jen když je;
  všichni pěšky), **vlci** (aspoň 2 dny škod v `predation.killDays` za 30 dní, ≥ 1 vlk), jinak
  **prasata a jeleni zároveň**. Pěší jsou mimo `villagersToday` (`huntFootIds`) – nepracují.
- **Úlovek** (`huntDay` před `trainLordDay`, dostane `lordField`): síla jezdce `riderPower ÷ 100 × (0,5 + 0,5 × luk ÷ 100)`, pěšího `(luk + boj) ÷ 200`
  (bez psa ½). `hunt.hope[druh] += (základ_jezdci × Σjezdci + základ_pěší × Σpěší) × min(1, stav ÷
strop)` (`HUNT.base`); celé kusy se uloví, zbytek naděje nejvýš 1. Prasata dospělá napřed, selata
  jen bez dospělých; jelen, je-li jich ≥ ⅓ počtu laní (kontrola před úlovkem); laň jen nad
  stropem jelení zvěře; kolouši nikdy. Vlci bez masa; medvěd `bear = { present: false,
backDay: bearBackDay(day) }`.
- **Maso:** `butcher(state, kg)` (45 / 15 / 90 / 50 / 100 kg) = uzené maso + práce porážky
  (1 čd na 20 kg, úloha `slaughter` jen v sezóně porážky nebo nouzově – lov je v zimě).
- **Kronika:** `hunt { kills, meatKg, names }` jednou za den lovu (jen s úlovkem), `names[0]` =
  nejsilnější lovec dne; `hunt.year` (kusy a kg od 1. 5., `days` = dny lovu) se nuluje v `dogsYear`
  v místě `wildlifeYearDay`.
- **Výcvik:** v den lovu `trainLordDay` bere hodiny `HUNT.training` (jezdec jízda 3 h + luk 3 h,
  pěší luk 2 h + boj 4 h) místo `trainingHours`; koně se cvičí jako při jízdě, odešlý syn na lovu
  cvičí (`trainArms`) místo `decayArms`.
- **Čísla:** typický rod (vojvoda, syn 17, chlapec 11 na vycvičených koních + odešlý syn, 3 psi,
  výchozí krajina): zima ≈ 4 prasata, 1 jelen a (v prvním roce) medvěd, ≈ 370 kg masa; bez koní
  (`HUNT.base.boar.foot` 0,15 × 0,3) ≈ 1 prase za zimu. Místo pro W5: `extraDay`, `lastExtraDay`, `HuntDay.extra`.
- **Vlkov (kopie 5. 6. 820, 2 roky):** bez koní a s jedním dospělým synem rodu nikdo nelovil víc než
  zlomky (naděje prasat 0,35, jelenů 0,6), 2 psi; rok 56 s (dřív 59,9 s). `diag-wildlife/w4.txt`.

## Riziko lovu a lov navíc (W5, `hunt.ts`, `application/declare-hunt.ts`)

- **Riziko** (`huntRisk(state, day, quarry)`, volá ho `huntDay` na konci dne lovu; `quarry` = `'boar'`, když
  je cílem `game` a jsou prasata, `'bear'` při lovu medvěda, jinak žádné riziko – jelen a vlk bez
  zranění i smrti). Čísla v `HUNT_RISK` (`rules-wildlife.ts`): zranění prasata 0,5 %, medvěd
  5 % × (1 − boj ÷ 200); smrt prasata 0,02 %, medvěd 0,3 %, obojí × (2 − boj ÷ 100) a × 2 pěšky.
  Lovci (jezdci + pěší) podle id, každý vždy **dva losy** (zranění, smrt) z vlastního proudu
  `createRandom(deriveSeed(seed, 'hunt:' + day))` – porody a úmrtí (`'day:'`) se nemění. Smrt má
  přednost: `bury` + `removePeople`, událost `death { cause: 'hunt', prey }` (do štěstí jde přes
  `events` v `simulateDay`), mrtvý zmizí z `hunt.today`; nástupnictví a konec rodu řeší `dynastyDay`
  týž den. Zranění: `Person.injuredUntilDay = day + 1 + 60`, kronika `hunt-injury`.
- **Zraněný** (`isInjured` v `people.ts`): `laborPerDay` 0, `huntPool` ho vynechá (`manor`,
  `away`), `trainLordDay` ho přeskočí (necvičí ani nezapomíná), `lordRides` ho nevyvede na objížďku.
- **Lov navíc:** `canDeclareHunt(state, day)` (`day` = dnešní odsimulovaný den, lov je zítra) vrací
  `null` nebo `'closed-season'` (zítra březen–květen, `HUNT.extra`), `'already'` (zítra je lov
  vyhlášený nebo kalendářní), `'too-soon'` (méně než 3 dny od `lastExtraDay`), `'no-hunters'` (rodina
  necvičí, nebo není muž dvorce mimo pole / odešlý syn zdravý). `declareHunt` zapíše `extraDay` a
  `lastExtraDay` = `day + 1`; `planHuntDay` ho zítra vezme (`HuntDay.extra`). Jezdci lovu nejedou
  objížďku (`lordRides` je vynechá) a pěší chybí v práci. Texty důvodů `HUNT_DENIED_TEXT`.
- **Use-case** `declareHuntInVillage` (`updateLivingVillage`: ves se dopočítá do dneška, důvod
  odepření jde jako `reason`, nic se neuloží). Server action `declareHunt({ villageId })`
  (`parseDeclareHuntInput` → `declareHuntForPlayer`).
- **UI:** `VillageManor.huntDenied` (`manor-view.ts`) = text důvodu, nebo null; tlačítko
  `manor-hunt` (ikona oštěpu) v `ManorUpgrades`, zašedlé s červeným důvodem v tooltipu.

## Ryby a oka vesničanů (W7, `small-game.ts`)

Návrh: wildlife.md – Drobná zvěř a ryby, Rozhodnutí při implementaci W7. Čísla `SMALL_GAME`
(rules-wildlife.ts).

- `smallGameDay(state, day, labor, urgent)` – volá ho `work()` (simulate-work.ts): při hladu
  (`state.hungry`) hned po kládách a vodě, před stavbami (z `common`); jinak až z
  `freeLabor − weedMen − extraMow`, tedy ze zbytku po pletí mužů a seči navíc.
  Chytá se, jen když `smallGameCapacity` > 0 (sezóna, zásoba nad ½ stropu, zbývá roční kvóta) a ves `wantsProtein`
  (nebo hladoví).
- Duben–listopad ryby (biomasa `fishKg`), prosinec–březen oka (`hares`, zlomek kusu). Maso jde do
  `state.freshMeatKg` (čerstvé, jí se napřed) bez práce porážky. Roční kvóta `yearlyQuota`
  (`smallGame.quota`, ryby ≤ ¼ stropu, zajíci podle přírůstku) se počítá 1. 5. ve `wildlife.ts`.
  `wantsProtein` bere větší z loňského a letošního masa z velkého lovu a přičte letošní maso z ryb a ok. Stav pro scénu v `wildlife.smallGame.today`; rozdělení práce
  má činnosti `fish` (cíl `{ kind: 'pool', index }`) a `snare`.
- `wildlifeYearDay` 1. 5. uloží maso z velkého lovu minulého roku (`lastWildMeatKg`, drobná zvěř ne) a vynuluje `year`.
- Testy ves bez ryb a zajíců: `withoutSmallGame` ve `village-fixtures.ts`.

## Obrana polí (W6, `field-patrol.ts`, `wildlife-damage.ts`)

Pravidla: [wildlife.md](../design/wildlife.md) – Obrana polí. Čísla jsou `FIELD_GUARD`
(`rules-wildlife.ts`). Škoda dílu = hrozba × (1 − jezdecká hlídka) × (1 − noční hlídka) – faktory jsou
jen v `dailyThreatShare` (`wildlife-damage.ts`): jezdecký násobí vše, noční zvěř `1 − 0,6 × pokrytí`,
vrány `1 − pokrytí`.

- **Jezdecká hlídka:** `riderPatrol(state, day)` (`field-patrol.ts`) – jezdci z `lordRides`
  (nepodkutý kůň, ne v hladový den na poli, ne ve žňový den cvičících mužů ani v den výpravy k hranici),
  červen–říjen; lovec dne (`hunt.today.riders`) ani zraněný (`isInjured`) nejede – obojí řeší `lordRides`, test v `field-guard.test.ts`. Síla jezdce = `riderPower ÷ 100`; `cut = min(0,6; 0,25 × Σ sil × min(1,5; 1 + 0,1 × psi))`.
  Pravidlo „jezdec jen když je silnější než pěšky“ (`ridesBetter` z W4) se zde nepoužívá – kdo jezdí
  objížďku, určuje `lordRides`, ne lov. Jen čte stav. **Jednou za den:** `settlePatrol` (v `simulateDay` před `wildlifeDamageDay`) uloží `WildlifeState.patrol` `{ day, power, cut }`; škodu (`dailyThreatShare`) i úlovek (`patrolHuntDay`) čte `patrolOfDay` – stejná hodnota, i když lov dne zraní jezdce až později.
- **Úlovek z hlídky:** `patrolHuntDay` (v `simulateDay` hned za `huntDay`): `hope.boar += 0,01 × Σ sil ×
prasata ÷ strop`, celé kusy z dospělých napřed, maso přes `butcher`, do `hunt.year` (kusy a kg,
  `days` se nezvyšuje). `emptyHunt` se exportuje z `hunt.ts`.
- **Noční hlídka – plán 1. 6.:** `planWatch` (volá `damageWindowStart`; hrozba z `dailyThreatShare(…, false)`, tedy bez jezdecké hlídky) uloží `WildlifeState.watch`
  (`FieldWatch`): díly s hrozbou za sezónu (`dailyThreatShare` × délka okna plodiny, nejvýš `maxShare`)
  aspoň 10 %, největší napřed. 1. stupeň zdarma – staří a výrostci 7–13 let mimo cvičící rodinu
  (`nightGuards`), 1 hlídač na 5 ha → `free` 0–1 dílu. Kde po něm hrozba stále dosahuje 10 %, je
  `adult`.
- **2. stupeň:** `watchWanted(state, day)` = Σ nesklizená `adult` plocha × (1 − `free`) ÷ 5 ha × 0,3 čd.
  `work()` ji přidá jako úlohu `'watch'` (`labor.ts`: `LaborTaskName`; `end` Infinity, `tie` 4 – za nutnou sečí `mow` (`tie` 3) a před rybami, které jsou ze zbytku po dílech nad potřebu; měsíce okna `FIELD_GUARD.night.fromMonth/toMonth`) a
  výsledek zapíše `payWatch` (`adultFrac` dne, součty `wantedManDays`/`paidManDays`). Nepokrytá část
  úlohy = menší pokrytí dospělých, 1. stupeň platí vždy.
- 31. 8. (`wildlifeSeasonEnd`) se `watch` zahodí.
- **Vlkov (2 roky, 26. 10. 2026):** díly jsou čtverce 0,02 ha, hrozbu ≥ 10 % mají jen dvě desítky
  a všechny kryje 1. stupeň (11 hlídačů), práce dospělých 0; jezdecká hlídka je slabá (koně nevycvičení,
  průměrně `cut` ≈ 2 %). Škoda 471 → 452 kg (821), 353 → 335 kg (822).

## Rozhraní (W9)

Pohled a komponenty: `apps/web/lib/wildlife-view.ts`, podrobnosti v [web-ui.md](web-ui.md) – Divoká zvěř
v rozhraní. Z jádra se čte jen `WildlifeState` (`damage`, `watch`, `dogs`, `hunt`, `smallGame`,
`predation`) a `wildlifeCaps`, `dogsWanted`, `huntPool`, `lordFamily`; nic se nepřepočítává.

Zlá zima a kruté sucho krátí jelení zvěř a selata 1. 5. – [village-disasters.md](village-disasters.md#kraj-kolem-vsi-sousedé-a-zvěř-p4).
