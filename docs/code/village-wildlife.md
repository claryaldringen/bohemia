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

## Psi dvorce (W4, `manor-dogs.ts`, `hunt-party.ts`)

- **Lovci rodu** (`huntPool` v `hunt-party.ts`): muži cvičící rodiny od 14 let (`manor`,
  `HUNT.riderFromAge`) a odešlí synové rodu (`away`: `lineMen` mimo dvorec, dospělí 14–44 let
  s `arms`), bez zraněných; děti se nepočítají (Martin 27. 10. 2026). Podle nich dvorec chová psy:
  `dogsWanted` = počet lovců (`manor` + `away`) + 1, nejvýš 8 (`MANOR_DOGS`).
- **Psi:** `WildlifeState.dogs { count }` (starší `fed` se nečte) vzniká hned (`dogsYear` zakládá smečku `wanted` psů, kdykoli ji ves nemá a má lovce;
  jednou, `dogs` pak existuje) a dál 1. 5. (`wildlifeYearDay`: −10 %, nejvýš 2 štěňata do chtěného počtu vždy). Psi nic nespotřebovávají (D91, Martin 17. 11. 2026) – žádné obilí, krmení psů ani jejich obilí ve výhledu osevu už nejsou, `dogs-ungrained` už nevzniká (v `LASTING_NOTICES` zůstává jen pro doběh starších vsí). `huntingDogs` = celé kusy smečky (síla jezdecké hlídky polí – `riderPatrol`).
- **Kalendářní lov rodu je pryč** (hunting.md – Pravidla 1; plán 2026-11-22-hunting, Úloha 2): lov
  listopad–únor každý 7. den, úlovek akumulátorem, pěší lovci mimo práci vsi, den lovu jako výcvik
  (6 h, strop 70) a riziko lovu skončily. Převod `calendar-hunt` (`migrations.ts`, poslední
  v `VILLAGE_MIGRATIONS`) smaže ze stavu lovu `hope`, `today`, `extraDay` a `lastExtraDay`; zlomek
  naděje prasat se do hlídky polí nepřenáší. Zůstává `hunt.year` (kusy a kg od 1. 5., `days` = dny
  lovu; panel dvorce) – nuluje ho `wildlifeYearDay` 1. 5., plní ho úlovek z hlídky (Obrana polí).
  `emptyHunt` = `{ year }` s nulami. Kronika `hunt` (`kills`, `meatKg`, `names`) a `hunt-injury`
  v typech zůstávají.

## Lov na tlačítko dvorce (`hunt.ts`, `application/declare-hunt.ts`)

Návrh: [hunting.md](../design/hunting.md) – Pravidla 2, 3, 5–7, 11; stavba po úlohách plánu
2026-11-22-hunting.

- **Kdy:** `huntDenied(state, day, running)` – `day` je **den honců** (zítřek dne vyhlášení;
  sezóna i ostatní důvody se posuzují na něj: 31. 5. s honci 1. 6. lze, 28. 2. s honci 1. 3. ne;
  volající posílá `lastDay + 1`) – vrací `null`, nebo důvod v pořadí `'closed-season'`
  (březen–květen, `HUNT.closedMonths`) → `'already'` (lov vsi běží – `running`; use-case zatím
  posílá `false`) → `'no-game'` (v lese vsi není velká zvěř – součet vah `quarryWeights` je 0, nebo
  ves nemá `wildlife`; Martin „Ano“) → `'no-beaters'` (`canSpareBeaters` dne vyhlášení). Bez meze
  „jednou za 3 dny“ (Pravidla 11). Texty důvodů `HUNT_DENIED_TEXT` („V lese vsi není zvěř.“,
  „Ves zítra neuvolní 6 mužů na honce.“).
- **Honci:** `canSpareBeaters(state, day)` – dnešní díl mužů na stavby (poslední
  `commonLaborHistory`) ≥ (`men` už rezervovaných na `day + 1` + `HUNT.beaters.men`) ×
  `LABOR_PER_DAY.adult`; bez historie false. `reserveBeaters(state, day, men = HUNT.beaters.men)`
  zapíše `HuntState.beaters { day: day + 1, men }` – mužů zítra celý den mimo práci vsi (dnešek je
  spočtený od rána); druhý lov téhož dne honce přičte, lov jiného dne starou rezervaci přepíše. Ves
  bez `wildlife` nic. Práci vezme `allocateDay` z dílu mužů na stavby (`beaters` – village-core.md).
- **Útočník lovu platí jen jeden den** (Martin 22. 11. 2026: „lov může teoreticky trvat libolně
  dlouho, ale práce těch lidí se odečte pouze za 1 den“): muž výpravy s `away.huntId` (`PersonAway`
  – útočník lovu `huntId` výpravy `refId`) je dál pryč (`isAway` – scéna, jídlo, výcvik), ale práce
  vsi ho počítá jako doma – `awayFromWork` v `laborPerDay` a `planVillagers`. Jeden den práce
  zaplatí jako honec: `reserveBeaters(state, lastDay, počet útočníků)`. Značku dává use-case útoku
  novým lidem ze vsi (Úloha 9 – `sendAway` s `huntId`); kdo byl ve výpravě už předtím, je pryč jako
  dosud. Bere ji návrat domů (`away-ends`), nebo `hunt-leave` – útočník dostal rozkaz ven a je zase
  běžná výprava (`endHuntAway`: smaže `away.huntId` jen lidem s týmž `refId` i `huntId`,
  idempotentní; výprava – journey.md, Lov).
- **Los zvířete:** `pickQuarry(w, seed, day, n)` – váhy `quarryWeights` (jelen = `deer.stags`,
  laň = `deer.hinds`, kanec i bachyně = `boar.adults ÷ 2` – stav je nerozlišuje, vlk = `wolves`,
  medvěd = 1, žije-li v kraji; stav pod 1 kus váhu nemá, mláďata nikdy) v pevném pořadí
  `QUARRY_KINDS`, jeden los `createRandom(deriveSeed(seed, 'quarry:' + day + ':' + n))` × součet;
  bez váhy null. `n` = pořadí vyhlášení `HuntState.declared` (`countDeclaredHunt` ho po vyhlášení
  zvýší) – druhý lov téhož dne losuje z jiného proudu.
- **Výsledek lovu:** `applyHuntResult(state, day, r: HuntResult)` (mutuje, vrací kroniku) – vždy
  `hunt.year.days` + 1; zabité zvíře: zvěř −1 (nejníž 0; medvěd `present: false`, `backDay` =
  `bearBackDay`), maso `HUNT.meatKg` přes `butcher` (vlk 0), kůže – jelen a laň `addHides`, kanec
  a bachyně `addSmallHides`, vlk a medvěd nic; `hunt.year` po druzích (`HuntKills`) a kg; kronika
  `hunt` (`names` – první složil zvíře). Výcvik `trainArms(…, trainingCap(p, day, 'hunt'))` (strop
  70), raněný `injuredUntilDay` = max(dosavadní, den + 1 + `PREDATOR_RISK.injuryDays`) a kronika
  `hunt-injury`, padlý kronika `death` (`cause: 'hunt'`, `prey`), `bury`, `removePeople`; padlí koně
  `loseHorse` (horse-riders.ts – z ohrady i z koní bez ohrady, jezdci zmizí `away.horseId`).
  Chybějící osoba či kůň se přeskočí. `prey` (kronika `death` a `hunt-injury`) je `QuarryKind` –
  i jelen a laň, když lovce zasáhl šíp druhého lovce; web má texty `PREY_GENITIVE`.
- **Schránka:** událost `hunt-result` (`journeyId`, `huntId`, `result`) – výprava ji vydá jednou při
  zabití nebo útěku zvířete; `applyInboxDay` volá `applyHuntResult` s kopií těla. Událost
  `hunt-leave` (`journeyId`, `huntId`, `personIds`) → `endHuntAway`.
- **Use-case** `declareHuntInVillage` (`updateLivingVillage`: ves se dopočítá do dneška,
  `huntDenied(state, lastDay + 1, false)` – důvod odepření jde jako `reason` a nic se neuloží; jinak
  `reserveBeaters`, `countDeclaredHunt` a uložit). Server action `declareHunt({ villageId })`
  (`parseDeclareHuntInput` → `declareHuntForPlayer`).
- **UI:** `VillageManor.huntDenied` (`manor-view.ts`) = text důvodu z `huntDenied` na den honců
  (`day + 1`), nebo null; tlačítko `manor-hunt` (ikona oštěpu) v `ManorUpgrades`, zašedlé
  s červeným důvodem v tooltipu.
- **Zraněný** (`isInjured` v `people.ts`; zranění šelmou trvá `PREDATOR_RISK.injuryDays` = 60 dní):
  `laborPerDay` 0, `huntPool` ho vynechá (`manor`, `away`), `trainLordDay` ho přeskočí (necvičí ani
  nezapomíná), `lordRides` ho nevyvede na objížďku.
- **Lov správce** (`npc-hunt.ts`; hunting.md – Pravidla 8, 9; Martin 22. 11. 2026: „Správce je NPC
  hráč, takže na lov chodí on.“): **vyhlášení** – krok 2a správce (`needSteps` → `huntWanted`,
  village-steward.md – Obilí a lov v nouzi) zavolá `declareNpcHunt(state, day)`: `reserveBeaters`
  na zítřek pro `HUNT.beaters.men` + `HUNT.npc.hunters` mužů (lovci správce platí jeden den práce
  jako útočníci hráče – Martin: „práce těch lidí se odečte pouze za 1 den“), `HuntState.npc` =
  `{ day: day + 1 }` a `countDeclaredHunt`. **Den lovu** – `npcHuntDay(state, day)` ve večeru rodiny
  (`lordEveningDay` po `work()`, před `patrolHuntDay` a `trainLordDay`; kronika do `chronicle`,
  padlí lovci do štěstí dne jako každé úmrtí): jen při `hunt.npc.day === day` (značka zmizí);
  zvíře `pickQuarry(w, seed, day, hunt.declared ?? 0)` (bez zvěře nic), lovci `npcHunters`;
  souboj `hunt-fight.ts` na rovné louce bez mřížky – lovci v (0, 0), dveře lesa (`startM` +
  `doorM`, 0), výběh (`startM`, 0) (`HUNT.npc` 40 m a 20 m) –, takty do konce, nejvýš
  `HUNT.npc.maxTicks` (2 400 = 10 minut), pak zvíře uteče; náhoda jedním proudem
  `createRandom(deriveSeed(seed, 'hunt:' + day))`, hodiny výcviku `hoursPerTick(OFFICIAL_WORLD)`;
  výsledek `applyHuntResult(state, day, fightResult(…))` – i bez lovců (zvíře uteče, `days` + 1).
  **Lovci:** `npcHunters(state, day, quarry)` – muži od `HUNT.minAge`, ne `isAway`, ne
  `isInjured`; jezdec, kdo má pár (`assignRiders` na kopii ohrad s `trainingFamily` ??
  `lordFamily` – jako výcvik dne) s jezdeckým koněm a ves není `isUnshod`; muž rodu síla
  `lineManStrength` (s koněm / bez), vesničan `villagerStrength` podle štěstí (jako `recruitOf` u
  hráče), oba dovednosti z `arms`; zdraví 100; na kance a bachyni jen nad branou umu (`aboveGate` z `hunt-fight.ts` –
  z koně, jinak pěšky, jinak nejde); pořadí boj + (jezdec ? jízda : 0) sestupně, pak id; prvních
  `HUNT.npc.hunters` (2). Poslední muž rodu nemá ochranu. Ves bez správce velkou zvěř neloví
  (Pravidla 9 – `needSteps` volá jen den správce). **Jeden lov ve vsi za den:** `huntWanted` bere
  jako běžící i lov hráče (`huntOnDay(state, den honců)` v `hunt.ts` – `hunt.beaters.day` nebo
  `hunt.npc.day`); opačný směr (hráč při lovu správce) hlídá use-case přes `huntDenied`. Testy `__tests__/npc-hunt.test.ts`.

- **Výjezd vojvody (Úloha 13)** – zvěř ohrozí člověka na výjezdu: čísly `PREDATOR_RISK` (čísla
  bývalého lovu beze změny, vlci čísly prasat) losuje `predatorDay` pro osamělého vojvodu nebo dvojici v hustém
  lese; ves ho doručí schránkou (`journey-casualty`, `beast-casualty.ts`). Zvěř mapy se vsí je
  `VillageState.wildlife` té vsi; prázdná mapa dostane strop podle krajiny kolem středu mapy
  (`wildlifeOfEmptyMap`, `wildlifeLandAtCenter`) – podrobně `docs/code/journey.md` – Šelmy.

## Ryby a oka vesničanů (W7, `small-game.ts`)

Návrh: wildlife.md – Drobná zvěř a ryby, Rozhodnutí při implementaci W7. Čísla `SMALL_GAME`
(rules-wildlife.ts).

- `smallGameDay(state, day, labor, urgent)` – volá ho `work()` (simulate-work.ts): při hladu
  (`state.hungry`) hned po kládách a vodě, před stavbami (z `common`); jinak až z
  `freeLabor − weedMen − extraMow − waresWorkDay`, tedy ze zbytku po pletí mužů, seči navíc
  a zpracování kůží a kožešin v domácnosti (`freeLaborDay`; village-livestock.md – Zpracování
  v domácnosti) – oka a ryby přijdou zkrátka, jen když zbytku je málo.
  Chytá se, jen když `smallGameCapacity` > 0 (sezóna, zásoba nad ½ stropu, zbývá roční kvóta) a
  ryby i oka se chytají vždy, kdy je volná práce (diet.md – Ryby a drobná zvěř; oka Martin 14. 11. 2026).
  Oka chytají zajíce i lišky ze stejných hodin (`SMALL_GAME.snares.perHour`, `foxPerHour`), každý
  druh do své kvóty; kožešiny jdou přes `addWildFurs` (`wares/wares.ts`), maso jen ze zajíců.
  Lišky: `WildlifeState.foxes?` (chybí = strop `foxCount`), `SmallGameYear.foxes?`,
  `quota.foxes?` (stará kvóta bez lišek se dopočte v `quotaOf`); 1. 5. se `foxes` vrátí na strop.
- Duben–listopad ryby (biomasa `fishKg`), prosinec–březen oka (`hares`, zlomek kusu). Maso jde do
  `state.freshMeatKg` (čerstvé, jí se napřed) bez práce porážky. Roční kvóta `yearlyQuota(w, ryby, zajíci, lišky)`
  (`smallGame.quota`, ryby ≤ ¼ stropu, zajíci podle přírůstku, lišky nad ½ stropu) se počítá 1. 5. ve `wildlife.ts`.
  Stav pro scénu v `wildlife.smallGame.today`; rozdělení práce
  má činnosti `fish` (cíl `{ kind: 'pool', index }`) a `snare`.
- `wildlifeYearDay` 1. 5. uloží maso z velkého lovu minulého roku (`lastWildMeatKg`, drobná zvěř ne) a vynuluje `year`.
- `fishAheadKg(state, day, daysToHarvest)` – ryby, které ves ještě chytí od zítřka do konce
  výhledu do sklizně (kg masa, × `SMALL_GAME.fish.edible`; diet.md – Výhled do sklizně, návrh
  Clauda 18. 11. 2026): letošní úlovek `smallGame.year.fishKg` ÷ dny rybářské sezóny od začátku
  roku kvóty (poslední 1. 5.; v dubnu i loňská sezóna – `fishSeasonDays`) × rybářské dny od
  zítřka do konce výhledu, nejdéle do 30. 11. a v dubnu do 30. 4. (kvóta příštího roku se
  nepočítá), nejvýš zbytek kvóty (`quotaLeft`, i nad ½ stropu). Prosinec–březen a bez letošního
  úlovku 0. Volá ho `baseMealInput` (`fishAheadEnergy`) a panel `nextDayDiet` přes
  `villageMeal(…, { fishAheadEnergy })`.
- Testy ves bez ryb a zajíců: `withoutSmallGame` ve `village-fixtures.ts`.

## Obrana polí (W6, `field-patrol.ts`, `wildlife-damage.ts`)

Pravidla: [wildlife.md](../design/wildlife.md) – Obrana polí. Čísla jsou `FIELD_GUARD`
(`rules-wildlife.ts`). Škoda dílu = hrozba × (1 − jezdecká hlídka) × (1 − noční hlídka) – faktory jsou
jen v `dailyThreatShare` (`wildlife-damage.ts`): jezdecký násobí vše, noční zvěř `1 − 0,6 × pokrytí`,
vrány `1 − pokrytí`.

- **Jezdecká hlídka:** `riderPatrol(state, day)` (`field-patrol.ts`) – jezdci z `lordRides`
  (nepodkutý kůň, ne v hladový den na poli, ne ve žňový den cvičících mužů ani v den výpravy k hranici),
  červen–říjen; zraněný (`isInjured`) nejede – řeší `lordRides`, test v `field-guard.test.ts`. Síla jezdce = `riderPower ÷ 100`; `cut = min(0,6; 0,25 × Σ sil × min(1,5; 1 + 0,1 × psi))`.
  Kdo jezdí objížďku, určuje `lordRides`. Jen čte stav. **Jednou za den:** `settlePatrol` (v `simulateDay` před `wildlifeDamageDay`) uloží `WildlifeState.patrol` `{ day, power, cut }`; škodu (`dailyThreatShare`) i úlovek (`patrolHuntDay`) čte `patrolOfDay` – stejná hodnota, i když lov dne zraní jezdce až později.
- **Úlovek z hlídky:** `patrolHuntDay` (ve večeru rodiny `lordEveningDay`, před `trainLordDay`):
  `WildlifeState.patrolHope += 0,01 × Σ sil × prasata ÷ strop` (vlastní naděje hlídky – dřív ji
  sdílel kalendářní lov), celé kusy z dospělých napřed, maso přes `butcher`, do `hunt.year` (kusy
  a kg, `days` se nezvyšuje; `w.hunt ??= emptyHunt()` až s úlovkem).
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
