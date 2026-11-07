# Válka – kód

Pravidla: [docs/design/war.md](../design/war.md). Hotová je síla vojska a stropy výcviku
(Ú6.1), válka mezi rody s ochranou nováčka a opovědí (Ú6.2), mírové jednání (Ú6.3) a pohyb
vojska mapu po mapě (Ú6.4); tažení po taktech, boj a dohra přibývají v dalších úlohách.

## Stropy výcviku

- `ARMS_CAPS = { home: 50, hunt: 70, war: 100 }` v `domain/village/rules-lord.ts` (war.md – Síla).
- `trainingCap(person, day, source)` v `lord.ts` – menší z věku (`armsCap`) a zdroje. `trainLordDay`
  cvičí doma se stropem 50, v den lovu (jezdec, pěší syn) se stropem 70; válka (100) zatím nikoho
  necvičí.
- `domain/village/arms-caps.ts` – `withArmsCaps(state)`: dovednosti (i `best`) nad 70 jednou stáhne
  na 70; příznak `VillageState.armsCapped` zaručí, že se válečná zkušenost nad 70 už nesráží.
  Volá se v `advanceVillageSteps` (`simulate.ts`) vedle ostatních `with…` převodů.

## Síla

- `domain/war/rules-war.ts` – `WAR` (čísla war.md – Čísla; násobky opevnění jsou ve `FORTIFICATIONS`).
- `domain/war/strength.ts` – `militaryExperience` ((boj + luk) ÷ 2), `lineManStrength` (muž rodu,
  kůň přes `riderPower`), `villagerStrength` (0,4, nucený × 0,5, štěstí přes `happinessLaborFactor`),
  `armyStrength` (součet × výzbroj, pokrytí nástroji z `craftCoverage(...).tools`).
- Soubory ve `domain/war/**` jsou v `eslint.config.mjs` mezi deterministickými (jen `det-math`).

## Válka mezi rody, ochrana, opověď (Ú6.2)

- **Data:** tabulky `war` (seřazená dvojice `house_low` < `house_high`, `how` declared | ambush,
  `status` active | peace | quiet | extinct, `started_at`, `started_day`, `last_clash_day`; částečný
  unikátní index = jediná aktivní válka na dvojici), `war_attack` (kdy rod poprvé sám napadl) a
  `war_protection_notice` (upozornění na konec ochrany jednou na rod); migrace `0029_war`. Port
  `WarRepository` / `WarTx` v `application/wars.ts`, adaptér `war-repository.ts`.
- **Ochrana** (`domain/war/protection.ts`): `houseProtectedUntil(house, ownAttackAt)` = 7 skutečných dní
  od založení rodu, vlastní opověď nebo útok ji ukončí (`markAttack`); `villageProtected(state, day)`
  = totéž co ochrana před pohromami (`inDisasterProtection`, 5 herních let). `protectedReason` skládá
  „Ctibor je pod ochranou ještě 3 dny.“.
- **`declareWar`** (`application/declare-war.ts`): ověří ochranu napadeného (jméno hlavy rodu, dny),
  běžící válku; s požadavkem nebo vzkazem otevře jednání (`openNegotiation` s řádkem `war-demand`),
  pak založí válku, ukončí vlastní ochranu, pošle upozornění `war-declared` a zapíše kroniku
  (`war-chronicle.ts`, neutrální). Válka uvnitř stromu vazalství je dovolená.
- **`war-demand { items }`** (`domain/negotiation/war-demand.ts`, účinek v `negotiation-effects.ts`):
  jediný řádek kola; smí nést jen přísahu, dávku, službu a odměnu (podmínky bez přísahy nic neurčí).
  Přijetí (`acceptNegotiation`) = aktivní válka mezi stranami končí `peace` a vnořené řádky se
  provedou stejným registrem; neběží-li už válka, přijetí selže. Protinávrh k opovědi smí být jen
  mírové jednání (`peace`, Ú6.3), jiný se odmítne důvodem „Na opověď se odpovídá mírovým jednáním.“.
- **`startWarByAttack`** – přepadení: zavolá ho tažení při prvním útoku; chráněný rod odmítne, běžící
  válce jen posune `last_clash_day`. **`quietWars`** – 3 herní roky bez střetu → `quiet` + kronika
  „Válka s Bořivojem utichla.“. **`notifyProtectionEnding`** – upozornění `protection-ending`. Obě
  úlohy jedou v `runWorldTasks` (`deps.wars`, worker je zapojuje). `endHouse` ukončí války vymřelého
  rodu (`extinct`).
- **Web:** horní lišta – zkřížené oštěpy s počtem válek (`war-toggle`, `war-count`) a štít s hodinami
  se zbývajícími dny (`protection-shield`); `WarPanel.tsx` – textový přehled válek (z `HouseView.wars`);
  `HousePanel` – tlačítko opovědi (`house-war`, zašedlé s důvodem z `actions.war`), formulář `TermsForm`
  s volitelným požadavkem vazalství a vzkazem; server action `declareWarOnHouse`. Ikony
  `house/spears.svg`, `house/shield-hourglass.svg`.

## Mírové jednání (Ú6.3)

- **`peace`** (`domain/negotiation/{types,peace}.ts`): jediný řádek kola mezi stranami **aktivní války**
  `{ fee?, payer?, vassalage?: { lord, vassal, terms }, tribute?: { goods, payer }, cede?, releasePrisoners? }`;
  všechno volitelné, mír bez podmínek smí. Otevře, protinávrhuje, přijímá a odmítá se jako běžné jednání
  (`openNegotiation` / `counterNegotiation` / `acceptNegotiation`; stejně jako `war-demand` nepotřebuje
  přísahu ani dohodu). `checkPeaceItems` hlídá tvar (poplatek a tribut jen zboží bez lidí, plátce je strana,
  vazalství mezi stranami), `checkPeaceRound` v `negotiate.ts` navíc běžící válku a postoupení vsí.
  `termLinesOf` řádek míru nezahrnuje.
- **Přijetí** (`PEACE` účinek v `negotiation-effects.ts`, v transakci): válka `peace` (`wars.end`, souběžné
  přijetí = jediný mír), vazalství z míru s původem `peace`. Po transakci: dialog poplatku, postoupení vsí
  a kronika obou rodů (`chronicleWar`, neutrálně).
- **Poplatek:** dialog `fee-send` plátci (jedinečný klíč `fee:<jednání>:<rod>`, cíl = ves hlavy příjemce),
  odpověď je táž jako u obchodu (`answerLevy` → `answerTrade`): celé, míň, nic; poslané zboží jde
  `sendShipment`. Plátce dostane upozornění `levy-pending` s `peace`.
- **Tribut:** nemá vazalství, proto se nečte z `vassalage`, ale z přijatých jednání
  (`NegotiationRepository.peaceTributes()`, `peaceTributeOf`). `openAnnualDialogs` (`tributes` v
  `AnnualLevyDeps`, worker je zapojuje) otevře plátci 1. 11. dialog `tribute-send` (klíč
  `tribute:<jednání>:<rok>`); mír přijatý až po 1. 11. se ptá příště, čekající dialog jen naroste o rok.
  Neplnění se nevymáhá (a nezapisuje jako porušení – není dohoda, na kterou by se vázalo).
- **Postoupení vsí** (`application/cede-village.ts`): `checkCede` – všechny vsi patří jedné straně a
  postupujícímu **zbývá živá ves na jiné mapě** (jinak `PEACE_REASONS.lastVillage`, „jen vazalství“;
  Martin 2. 11. 2026). `cedeVillages` po transakci: muži rodu (`isLineMan`) všech vsí postoupených
  map odejdou s rodinami (`departAppointee`) do nejbližší živé vsi postupujícího – událost `lord-arrives`
  ve schránce cílové vsi (`ref cede:<jednání>:<ves>:<muž>`), pak převod držitele po celých mapách
  (`transferVillages`, zámky postupně, jako odúmrť) a zapnutý správce (`setStewardOn`) ve vsích. Je
  idempotentní. Háčky `CedeHooks` (`check`, `apply`) skládá `createGameDeps` (`deps.cede`).
- **Propuštění zajatců:** `releasePrisoners` se zatím jen nese (kontrola tvaru); zajetí přijde v Ú6.11.
- **Web:** `WarPanel.tsx` – u každé války pečeť **Nabídnout mír** (`war-offer-peace`) a mini-formulář
  (`peace-form`: poplatek, tribut, vazalství; `peace-send`); řádek `term-row-peace` (`TermsForm.tsx`)
  v kartě jednání; `parsePeace` v `lib/house-input.ts`. Dialogy poplatku a tributu zobrazuje `LevyDialog`.

## Pohyb vojska (Ú6.4)

Čistá doména, jen det-math (`domain/war/**` v `eslint.config.mjs`); čísla ve `WAR.pace`,
`WAR.march`, `WAR.snowPace`, `WAR.frost` a `FORTIFICATIONS.rampartAssaultPace`.

- **Mřížka** – `domain/war/march-grid.ts`: `marchGrid(landscape, obstacles, village, { day,
closedGates })` → `MarchGrid` (buňky 10 m přes celou mapu 1 920 m, 192 × 192; `pace` = násobek
  tempa, 0 neprůchodná; `flags` `MARCH_*`). Terén krajiny (`marchTerrain`, mezipaměť `WeakMap`
  podle krajiny): buňka do půl úhlopříčky (≈ 7 m) od vody je voda – krok mezi středy ji
  nepřeskočí; brod = mělčina potoka (`StreamSample.shallow ≥ WAR.march.fordShallow`; úzký brod
  chodců `FORD` v `paths/terrain.ts` v krajinách nevychází, proto jen mělčina); sráz nad
  `PATH_SLOPE_MAX`. Hustý les (× ¼) = pole lesa > 0 a v okolí 3 × 3 buněk aspoň
  `denseForestTrees` stojících stromů vrstvy překážek podle změn vsi (`obstacleChangesAt` –
  paseka vsi lesem není); bez vrstvy (testy) celý les krajiny. Ves: osy pevných cest (i zemské
  stezky – její úseky jsou mezi `roads.roads`) × 1,5 i lesem a přes vodu (brod, lávka);
  opevnění (`fortCells`): hotový plot, palisáda a val se stojící nástavbou neprůchodné, val bez
  nástavby `rampartAssaultPace`, průchozí otevřené brány (zavřené v `closedGates`) a mezery
  (`segmentIsGap` – nedostavěný, shnilý, prolomený úsek celým pásem). Buňky přes `fortWalls`
  a `fortWallCells` (pěšiny); buňka, které se dotkne průchod, stěnou není. Domy, ploty ohrad
  a pole vojsko neblokují.
- **Trasa** – `domain/war/march.ts`: `marchPath(grid, from, to)` (A* s oktilovým odhadem,
  úhlopříčně jen kolem průchodných rohů, ceny kroků po kvantech `quantizedStep`, remíza – vyšší
  index předchůdce; start průchodný vždy; nedosažitelný cíl `null`), `marchPathToEdge(grid,
from, direction)` (k nejlevnější buňce okraje, úhlopříčně do rohu). `MarchPath` = body (start
  a cíl přesně, mezi nimi středy buněk), buňky, `meadowM` (metry louky od startu – délka ÷
  násobek tempa) a `lengthM`; `marchSeconds(path, speed)`, `marchProgress(path, meadow)` (poloha
  po ušlých metrech louky).
- **Tempo** – `marchSpeed(group: GroupPace, day)` (m/s skutečného času): 3,5 m/s, nejpomalejší
  z jezdců × 1,5, pěších × 1, pěších raněných × 0,75 a stáda × 0,5; v zimě sníh × 0,75. 1 km po
  louce ≈ 286 s ≈ 4,8 min ≈ 3,3 herního dne, hustým lesem čtyřikrát déle (≈ 19 min ≈ 13 dní).
- **Zima** – `domain/war/season.ts`: `isMarchWinter(day)` (prosinec–únor), `frostDay(member,
outside, day)` → `MemberDelta` (`health`, `vigor` = podíl plné síly): v zimě venku −3 a −0,02,
  ve vsi kdykoli +10 a +0,05 až do plných, jinak 0.
- **Mapu po mapě** – `domain/war/world-route.ts`: `worldRoute(from, to, avoid)` (8 směrů, přímý
  krok 5, úhlopříčný 7, uhne nejvýš 8 políček za obdélník startu a cíle; start a cíl se nezakazují;
  nedosažitelný `[]`), `edgeCrossing(cellFrom, cellTo, pos)` – osa pohybu se převrátí na opačný
  okraj (± 955 m, střed okrajové buňky), druhá zůstane.
- **Krajina políčka** – `application/cell-landscape.ts`: `emptyCellLandscape(worldSeed, cell)`
  (`generateAcceptedLandscape(cellLandscapeSeed(...))` – tatáž krajina, jakou by dostala nová ves,
  i s `obstaclesOf`), `settledCellLandscape(seed, versions)` (políčko se vsí – uložený seed),
  `emptyCellMarchGrid`.
- **Testy** – `domain/war/__tests__/march.test.ts` (tempo, les, brod, opevnění, cesta, zima,
  zlatá cesta na seedech 1–3 – otisk počtu brodů a trasy přes mapu, determinismus, paseka, okraj),
  `world-route.test.ts`, `application/__tests__/cell-landscape.test.ts`. Změna mřížky nebo A*
  změní zlatý otisk – zapsat nový jen se záměrem.

## Tažení po taktech (Ú6.5)

Plán 2026-11-03 – rozhodnutí 12; Review bod 5. Čísla ve `WAR.campaign`.

- **Takty** – `domain/war/ticks.ts`: `TICKS_PER_SECOND` = 4 (`TICK_MS` 250), takt 0 = začátek
  světa; `tickOfMs(ms, world)`, `msOfTick`, `dayOfTick(tick, world)` (BigInt, shodně
  s kalendářem); `INTENT_LEAD_TICKS` = 2, `CHECKPOINT_TICKS` = 40; `tickRandom(seed, tick, label)`
  – náhoda jen ze seedu tažení a čísla taktu (boj Ú6.8).
- **Stav** – `domain/war/campaign-types.ts`: `CampaignState` (JSON; `tick` = poslední spočtený
  takt, `day` = jeho herní den; `phase` `assembling` → `marching` → `raiding` → `returning` → `done`,
  `disbanded` pro rozpad Ú6.12; vůdce `playerId` / `leaderName`, `commander`, `deputy`, `assembly`
  a `target` (`CampaignVillage` – ves, políčko, bod), `members` (`CampaignMember` – osoba
  `PersonRef`, hráč, muž rodu, kůň, nucený, síla, zdraví, `vigor`, raněný, skupina, `status`),
  `groups` (`CampaignGroup` – rozkaz, políčko a poloha, cíl, `route` = zbývající políčka světa,
  `leg` = úsek po mapě `{ points, meadowM, walkedM }`, `arrived`), `supplies.foodKg`,
  `loot { foodKg, herd }`, `captives`, `liveCommand`, `discovered`, `returnReason`).
  `CampaignIntent { tick, seq, byPlayer, body }`, `IntentBody` = `set-out` | `march { to }` (jen
  `liveCommand`, ve fázi pochodu; v boji pošle velitele) | `turn-back` | `set-order` | `strike`
  (Ú6.8 – Boj muž po muži).
- **Krok** – `domain/war/campaign.ts`: `newCampaign(input, clock)` (muži ve shromaždišti, skupiny
  podle `member.group`), `stepCampaign(state, toTick, intents, world)` → `{ state, villageEvents,
notices, waiting }` – čistá, vstup nemění. Takt na kopii stavu: na začátku nového herního dne
  denní krok (mráz `frostDay` – venku, ve shromaždišti zotavení; jídlo 1 kg na aktivního muže, bez
  jídla na pochodu obrat `supplies`), záměry taktu podle `seq` (záměr s taktem ≤ `state.tick`
  a cizí hráč se zahodí), pak fáze. **Pohyb:** skupina jde tempem `marchSpeed ÷ 4` metrů louky za
  takt po `leg` (`marchPathToEdge` k okraji ve směru `route[0]`, na posledním políčku `marchPath`
  k cíli; úsek se plánuje na mřížce `marchGrid` políčka a dne – mezipaměť jen v rámci volání);
  konec úseku na okraji = `edgeCrossing` na sousední mapu (zbytek taktu propadne), v cíli stojí;
  skupina bez cesty nebo bez mužů stojí. Trasa po světě `worldRoute` (bez zákazů – průchod Ú6.13).
  Všechny skupiny na mapě cíle → `raiding`; **`raidTick` počítá boj** (Ú6.8 – Boj muž po muži;
  Ú6.9 obránci, Ú6.10 kořist, Ú6.11 vzdaní). Návrat ke shromaždišti
  (rozpad po hloučcích – NPC velitel, zástupce a rozpad, Ú6.12) → `done`: zápis „Vojsko Bořivoje se vrátilo.“ do kroniky každé
  domovské vsi a upozornění `campaign-returned { campaignId, reason }`; při vyrazení „Vojsko
  Bořivoje vyrazilo.“ do shromaždiště. Události jdou do schránky na **následující den** (rozhodnutí
  13), `ref` = `camp:<id>:<takt>:<n>`. Stádo kořisti jde se skupinou velitele.
- **Svět tažení** – `CampaignWorld { clock, landscapeOf(cell), villageAt(villageId, day) }`
  (synchronní): `null` = data ještě nejsou → takt se zastaví a `waiting` vrátí chybějící políčka /
  vsi; výsledek se tím nezmění. Mřížka bere cesty a opevnění **první** vsi mapy; `villageAt` dá stav
  vsi ke konci dne `d − 1` (bariéra – Ú6.7).
- **Use-case** – `application/step-campaigns.ts`: `stepCampaigns(deps, { nowMs })` – pro každé
  `campaigns.active()` pod `CampaignLock.tryRun` (jinak `busy`): kontrolní bod → nejdřív doručí
  starý `outbox`, záměry `intentsAfter(tick)`, `computeCampaign` (načítá chybějící mapy
  `CampaignCells.mapOf` a vsi a pokračuje, nejvýš 8 kol) do `tickOfMs(now)`. Bod se uloží, když
  přibylo ≥ 40 taktů, vznikly události nebo tažení skončilo (jinak `computed` – další kolo počítá
  znovu z bodu); `saveCheckpoint` uloží stav i `outbox` (události a upozornění) atomicky a odmítne
  (`stale`), když se bod posunul nebo přibyl záměr do spočtených taktů (počet záměrů v rozsahu ≠
  `seenIntents`). Po uložení doručí `outbox` (`villages.inbox.post` – stejný `ref` podruhé zahozen,
  `notices.post`) a smaže ho (`clearOutbox`); pád mezi uložením a doručením → další kolo doručí
  znovu. Chyba tažení = `failed`, ostatní tažení počítají dál. `queueCampaignIntent(deps, {
campaignId, playerId, body, nowMs })` – záměr na takt `tickOfMs(now) + 2`; úložiště odmítne takt
  ≤ bodu (null). Porty v `application/campaigns.ts`.
- **DB** – `schema/campaign.ts`, migrace `0030_campaign`: `campaign` (válka, vůdce, `status`
  `active` / `done`), `campaign_checkpoint` (`tick`, `state` jsonb – čísla přesně, pořadí klíčů
  jiné, takt na něm nezávisí; `outbox` jsonb), `campaign_intent` (`seq` serial, takt, hráč, tělo).
  Adaptér `adapters/campaign-repository.ts`: `addIntent` = `INSERT … SELECT … FOR SHARE OF cp`
  (takt > bod, tažení aktivní), `saveCheckpoint` v transakci `FOR UPDATE` na bodu a počet záměrů až
  pod zámkem; `active()` = aktivní nebo s `outbox`. Zámek `adapters/campaign-lock.ts`
  (`createCampaignLock(pool)` – advisory zámek zámku hráče v prostoru `CAMPAIGN_LOCK_NAMESPACE`).
  Mapy políček `packages/server/src/campaign-cells.ts` (`createCampaignCells` – políčko se sídlem
  z uloženého seedu a jeho vsi, prázdné políčko `emptyCellLandscape` v LRU 16).
- **Testy** – `domain/war/__tests__/campaign.test.ts` (po 1, 7, 40, 400 taktech = vcelku – stejný
  JSON stavu i události; restart z JSON bodu i s obráceným pořadím klíčů = bez restartu; záměr přesně
  ve svém taktu, v minulosti a cizí zahozen; obrat rozkazem; bez jídla obrat; chybějící mapa
  zastaví a po načtení stejný výsledek; přípravky `campaign-fixtures.ts` – rovné mapy),
  `application/__tests__/step-campaigns.test.ts` (kola po 1 s s restartem portů = vcelku, bod
  nejvýš po 40 taktech; pád po uložení před doručením – nic se nezdvojí; záměr ≤ bod odmítnut,
  teď + 2 použit v něm; záměr do spočteného taktu → `stale` a další kolo ho použije; chyba
  a cizí zámek jednoho tažení nezastaví ostatní), `db/adapters/__tests__/campaign-repository.db.test.ts`
  (bod bit po bitu, odmítnutí záměru, `stale`, `outbox`, souběh záměru s uložením, dva workery –
  tažení počítá jen jeden).

## Příprava a vyslání tažení (Ú6.6)

Panel Vojsko (`web-ui.md`) posílá **plán** (`CampaignPlan`, `application/plan-campaign.ts`): velitel
(`PersonRef` – muž rodu od 16 let), volitelně zástupce, vsi rodu s výběrem (`lineMen`, přihlášení
`villagers`, nucení `forced`), shromaždiště, cíl, `groups` (`together` / `by-village`), rozkaz
ke vzdaným (`surrendered`: `kill` / `lead` / `leave`, uloží se do `CampaignState.surrendered`)
a `food` (kg obilí ze zásob shromaždiště).

- **`prepareCampaign`** je jediné ověření, které používá odhad i vyslání: rod hráče, jen **vlastní
  vsi** (`findPlayerVillage` přes aktivní sídla držitele – ves spravovaná cizí hráčem sem nepatří,
  právo `war` ve `STEWARD_RIGHTS` chybí), žijící vsi, velitel a zástupce mezi vybranými muži rodu,
  cíl (ves cizího rodu, žijící; **cíl v ochraně se odmítne** – nová ves `villageProtected`, rod
  nováčka `houseProtectedUntil` + `protectedReason`, ochrana rodu platí jen když mezi rody neběží
  válka), jídlo (nejvýš zásoba shromaždiště bez osiva a nosnost mužů). Odhad: `CampaignEstimate`
  (síla `armyStrength` po vsích s pokrytím nástroji, počty mužů, cesta ve dnech vzdušnou čarou
  ≈ 3,5 m/s, na kolik dní vystačí jídlo, `ambush`, `liveCommand`).
- **`musterOf`** (`domain/war/muster.ts`): vesničané 16–44 let (`villagerCandidates`); příbuzní
  v cíli (`kinInTarget` – příchozí ze sousední mapy ve směru cíle: muž, jeho žena nebo rodiče) →
  neochotný; ostatní losují vlastním losem (`musterSeed` = seed vsi + cíl) s pravděpodobností
  `volunteerShare` (30 % + 0,5 % za bod štěstí nad 50, hlad +15 %, vdovská domácnost × 0,5 – čísla
  `WAR.muster`). `volunteers` jsou id přihlášených, `others` ostatní způsobilí (kandidáti na rozkaz).
  Server přijme v `villagers` jen dobrovolníky a v `forced` jen ostatní způsobilé.
- **`launchCampaign`** (`application/launch-campaign.ts`; **volající drží zámek hráče** – web
  `guardedAction`): ověří, `startWarByAttack` (mezi rody neběží válka = přepadení, válka začne
  vysláním), pro každou ves **verzovaným zápisem** pošle muže pryč (`sendAway`, `away: campaign`
  s `refId` = id tažení, bez `untilDay` – návrat řeší tažení; doma pak nepracují ani nejí), shromaždiště
  odečte jídlo, nařízený útok na příbuzné (nucený, nebo muž rodu s příbuznými v cíli) přidá vsi
  `{ day, points: 5 }` do `happiness.deaths` (−5 štěstí na rok za každého, strop úmrtí 20), založí
  tažení (`newCampaign`, seed z `SeedSource`) a záměr `set-out` (`queueCampaignIntent`). Nepovede-li
  se uložit další ves, vrátí muže, jídlo i štěstí do vsí, kam už sáhl (`release`). Koně zůstávají
  ve vsi (jezdec má `mounted`, síla z koně se počítá).
- **Zásoby** (`domain/war/supplies.ts`): `campaignSupplies(men, horses, carts, days)` → potřeba
  1 kg/muž/den, nosnost 25 / 80 / 400 kg. Zatím se vezou jen muži (koně a vozy v plánu nejsou).
- **Dezerce** (`domain/war/desertion.ts`, `desert` v `campaign.ts`): v denním kroku venku nucený
  (`CampaignMember.forced`) dezertuje s los ze seedu tažení, dne a pořadí muže – 5 % denně, s příbuznými
  v cíli (`CampaignMember.kin`) 15 % (`WAR.desertion`); `status: 'deserted'`. Dezertér s příbuznými
  v cíli cíl varuje: do schránky cílové vsi jde `threat-signal` s `army-seen` (den po dni dezerce;
  body `army-seen` vlastní schránka zatím nemá – signál hrozby je stávající tělo).
- Právo: `ACTION_RIGHTS` `planCampaign` a `launchCampaign` = `war`; ve web `lib/village.ts`
  `planCampaignActionForPlayer` / `launchCampaignActionForPlayer` (přes `guardedAction`),
  `lib/army.ts` je skládá s `LaunchDeps` (`GameDeps.campaigns`).
- Testy: `domain/war/__tests__/muster.test.ts` (nábor, zásoby, dezerce, varování),
  `application/__tests__/launch-campaign.test.ts` (plán, vlastní vsi, velitel, ochrana, jídlo,
  vyslání, přepadení, štěstí, vrácení při selhání), e2e `multiplayer.spec.ts` (panel Vojsko).

## Boj muž po muži (Ú6.8)

war.md – Boj, Ztráty; fortifications.md – Obrana, Prolomení. Čísla ve `WAR.combat` (zdraví,
zásah, luk 20–60 m, zblízka 3 m, los zásahu 1 : 1, rány po 2 / 4 s), `WAR.sight` (150 m, v hustém
lese 50 m), `WAR.houseGroupM`, `WAR.holdPlaceM`, `WAR.defenderAges`, `WAR.downed`,
`WAR.breakpoint`, `WAR.lastLineManMinHealth`, `WAR.orderHearingMeters`.

- **Obránci** – `domain/war/defenders.ts`: `houseGroups(dwellings)` (obydlí blíž než 40 m i řetězem
  → číslo skupiny podle nejmenšího id), `defenderRoster(state, day, { lineMenElsewhere })` →
  `Defender[]` (pořadí podle id): muži 16–44 `villagerStrength(false, štěstí)`, muži rodu od 14 let
  `lineManStrength(p, null)` s lukem, ženy, starší a chlapci 14–15 let 0,1 `atHouseOnly`; kdo je
  pryč (`isAway`) nebo zraněný, chybí. `lastLine` = jediný muž rodu ve vsi a `lineMenElsewhere`
  (výchozí 0 – tažení zatím jiné vsi hráče nezná). `defenderPlan` – výchozí postoj u domů:
  útočník do 40 m od domů skupiny (nebo kdo útočí na obránce) a ve dohledu, vodítko 40 m od domů;
  `atHouseOnly` jen na dosah u svého domu. Postoje, včasný útěk a skryté jámy – Ú6.9.
- **Rozkazy** – `domain/war/orders.ts`: `attackerPlan` – `follow-leader` (jde za velitelem, když je
  dál než 6 m; napadne, kdo útočí na velitele nebo na něj), `attack-all` (nejbližší viditelný
  i prchající, nikoho nevidí → nejbližší vůbec – projdou ves), `hold-place` (`holdAt`, jinak kde
  skupina stojí; nepřítel do 30 m + dosah zblízka od místa, lukem kdo je na dostřel, vodítko 30 m).
  Bez velitele „útočit na vše“; NPC velitel řídí velitele (jinak zástupce) jako řízeného muže
  (`syncControl` – NPC velitel, zástupce a rozpad, Ú6.12).
  `controlledPlan` – hráčem řízený muž: `chosen` (pokyn `strike`), jinak `goal` (pokyn `march` na
  mapě cíle), brání se jen tomu, kdo na něj útočí na dosah. `battleLeader` = velitel, když bojuje,
  jinak zástupce; `orderHeard` = bojující muž skupiny do 30 m od velitele; `setGroupOrder(state,
group, order, at)` – před bitvou kdykoli, v boji jen na doslech (jinak false); mění
  `CampaignGroup.order` / `holdAt` i skupinu boje.
- **Boj** – `domain/war/battle.ts`: `BattleState` (JSON v `CampaignState.battle`) – `fighters`
  (`Fighter`: `a:<index muže>` / `d:<id člověka>`, strana, skupina, síla × `vigor`, zdraví, poloha,
  `home` – dům, nebo kde útočník vstoupil, `state` `fight` | `breach` | `flee` | `fled` | `down`,
  `cooldown`, `aim`, `controlled` / `chosen` / `goal`, `route` průchodem, `breachAt`, `fleeTo`,
  `killed`), `groups` (`BattleGroup` – rozkaz, `holdAt`, `entered`, `broken`), `commander`,
  `deputy`, `closedGates` `<opevnění>:<úsek>`, `breaches` (`BattleBreach` – místo, `at`,
  `BreachProgress`), `outcome` `ongoing` | `attackers` | `defenders` | `withdrawn`. `openBattle`
  (útočníci u skupin, obránci u domů), `battleTick(b, field, rng)` mění `b` na místě:
  brány do 30 m od útočníka se zavřou → stěny taktu → bod zlomu (padlí a ranění ÷ `entered`,
  30 % útok, 45 % obrana; velitel neuteče sám) → muži v pevném pořadí (plán, krok) → práce na
  průlomech (`breachStep`, nejvýš 4 na místo, `hoursPerTick` z `ticks.ts`) → rány (cooldown 8 / 16
  taktů, los zásahu, `hitDamage(síla, násobek, luk)` = `10 × síla ÷ násobek`, u obránce
  `defenderMultiplier` s průlomy boje) se sečtou a použijí až po všech – kdo padne, v tomto taktu
  ještě udeřil → výsledek (útočníci bez bojujících = `defenders`; obránci bez bojujících
  i prchajících = `attackers`). Na nule `down`, `killed` losem (vesničan 1 : 1, muž rodu 1 ze 3);
  `lastLine` neklesne pod 10, pak uteče (i `controlled`). Útěk: útočník do `home`, obránce do
  nejbližší buňky hustého lesa (bez lesa hned `fled`); kdo se nepohne, je `fled`. Pohyb tempem
  pochodu (3,5 m/s ÷ 4, jezdec × 1,5, terén z `MarchGrid` – val ¼; voda a sráz neprůchodné).
- **Opevnění v boji** – `battleForts(geo, forts)` (tvar úseků a střed); stěny jsou úsečky úseků,
  které stojí (ne holý val, ne mezera, prolomený úsek = `breachedDay` dne boje), s výřezem otevřené
  brány a tětivou rohu. Pohyb stěnu neprojde (sklouzne podél), luk i dosah zblízka (3 m) přes ni
  ano. Útočník, kterému k cíli vadí stěna, jde nejbližším průchodem (`route` – 3 m před a za ním;
  když se zavře, cesta neplatí); bez průchodu prolamuje – místo s nejméně zbývající prací, pak
  nejbližší (brána / zeď uprostřed úseku, `breachWork`), prolamující nebojují, průlom je mezera.
- **Tažení** – `campaign.ts`: `raidTick` – první takt `campaignBattle` (muži na nohou na mapě cíle
  v šiku po pěti; obránci z `villageAt(cíl, den)`; ves není na mapě cíle → bez obránců),
  pak `battleTick` s `tickRandom(seed, tick, 'battle')`, `syncMembers` (zdraví, `fallen`,
  `wounded`). Konec: `attackers` → obrat `arrived` (háček Ú6.10 kořist a škody, Ú6.11 zajetí),
  `defenders` → `routed` (háček Ú6.12 rozpad, Ú6.11 ranění zůstanou); `turnBack` v boji →
  `leaveBattle` (`withdrawn`, skupiny se sejdou u velitele). Padlí a ranění obránci do vsi jako
  vnější události – Ú6.10.
- **Testy** – `__tests__/battle.test.ts` (příklad war.md 5 vs. 25 ran, u domu 8 ran po 2 s; bod
  zlomu 30 % / 45 %, velitel zůstane; poslední muž rodu doma pod řízením hráče – nejníž 10, uteče
  do lesa; palisáda – brána se zavře, 4 muži ≈ 3 h, zeď ≈ 24 h, šíp za palisádu ÷ 3; tažení po
  1 / 7 / 40 taktech přes JSON = vcelku, ztráty v mužích), `orders.test.ts` (za velitelem, obrana
  velitele, útočit na vše mimo dohled, držet místo ≤ 30 m, změna rozkazu na doslech),
  `defenders.test.ts` (skupiny domů, soupis, poslední muž rodu); přípravky `battle-fixtures.ts`.

## Bariéra dopočtu a dny nájezdu (Ú6.7)

Plán 2026-11-03 – rozhodnutí 13, Úloha 6.7. Ves čeká jen na tažení u sebe, tažení jen na ves ke dni
`d − 1` – obě strany se střídají, cyklus čekání nevznikne.

- **Mez vsi** – port `application/village-holds.ts`: `VillageHolds.limitOf(villageIds)` → mapa ves →
  den, do kterého se smí dopočítat; ves bez tažení chybí. Tažení drží ves, když jeho skupina stojí
  na mapě vsi nebo políčko od ní: mez = `CampaignState.throughDay` (poslední den, jehož takty jsou
  všechny spočtené – `dayOfTick(tick + 1) − 1`, počítá ho každý takt, úložiště tak hodiny nepotřebuje;
  bod bez něj → `day − 1`), nedoručené události `outbox` mez sníží na svůj den − 1 (i u vsi daleko –
  posel, kronika). `holdDay`, `heldDay(today, lastDay, limit)` (nikdy pod spočítaný `lastDay`).
  Adaptér `db/adapters/village-holds.ts` (`createVillageHolds` – CTE nad aktivními body:
  `state->'groups'` a `outbox` se rozbalí jednou na tažení; `villagesNearCampaigns`), úložiště vsí ho
  nese jako `VillageRepository.holds` (patří k dopočtu jako schránka; `cachedVillages` ho propouští).
- **Dopočet vsi** – `updateVillage` se zeptá na mez při každém pokusu a dopočítá ves jen do
  `heldDay`; akce `change` dostane ves k tomu dni. `advancePlayer` vezme meze všech vsí hráče jedním
  dotazem: ves na mezi se nenačítá a do nejstaršího dne dávky se nepočítá (nebrzdí ostatní vsi);
  `closeAtDay` počká, až vsi doběhnou (všechny na cílovém dni).
- **Tažení** – `computeCampaign`: `villageAt(v, d)` = uložený stav, má-li `lastDay ≥ d − 1`, jinak null
  (takt čeká; ves se v dalším kole načte znovu). Čeká-li tažení na ves a postoupilo, **bod se uloží
  hned** – mez vsi povyroste na den, na který tažení čeká (jinak by čekaly obě strany). Ves dopočtená
  dál, než ji tažení drželo, dá svůj stav (o den novější – výsledek pak závisí na tom, kdo počítal
  dřív). U tažení, které stíhá hodiny, to nenastane: mez platí už na sousedním políčku a přejít
  políčko (1920 m) trvá i jezdcům přes 4 herní dny. Zbývá den vyhlášení (vyrazí týž den – ves
  shromaždiště mohla mít spočtený dnešek) a dohánění tažení po výpadku o víc dní – zatím otevřené.
- **Dny nájezdu** – `watchVillages` po každém taktu (kromě shromáždění a konce): každá ves na mapě,
  kde stojí skupina s aktivním mužem a které vojsko škodí (`harmless`), dostane na každý den
  `raid-day { campaignId }` **na týž den** (bariéra ji před tím dnem drží) – `VillageState.raidDay`;
  `raidHiding(state, day)` (`domain/village/raid-day.ts`) zastaví práci jako hašení požáru (dílny,
  milíře, `villagersToday` prázdné). Den po odchodu vojska ves pracuje. Poprvé i `threat-signal`
  `army-seen` (správce staví podle hrozby). Paměť `CampaignState.raidDays` (ves → poslední den).
- **Posel** – ves, kterou vojsko prošlo a patří témuž hráči jako cíl (`CampaignWorld.messengerTo` –
  `null` = vsi se ještě nenačetly, takt čeká), pošle do cíle `army-seen { campaignId, fromVillageId }`
  a `threat-signal` na následující den, jednou (`messengerSent`). Cíl si ho zapíše
  (`VillageState.armySeen`); při otevření boje `planDefense({ warned })` – postoj platí dřív, do
  útočiště doběhnou všichni, kdo se vejdou (brány se zavřou až za nimi).
- **Worker** – přednostní vsi `WorldQueue.priorityVillages()` a jejich meze jdou do
  `behind(worldDay, limit, holds)` (docs/code/worker.md – Přednostní vsi).
- **Testy** – `domain/village/__tests__/raid-day.test.ts` (den nájezdu bez práce, den nato práce, po
  kouscích = vcelku, posel), `domain/war/__tests__/raid-watch.test.ts` (dny nájezdu, signál jednou,
  neškodné vojsko, bariéra zastaví takt, posel jednou na další den, cizí rod, načtení vsí),
  `stance.test.ts` (posel – útočiště i s útočníky u brány), `apps/worker` `loop.test.ts` (krátký spánek),
  `packages/server/src/__tests__/campaign-race.db.test.ts` (souběh worker vsí + tažení + web = jeden
  proces, do 60 s, dny nájezdu, posel, ves daleko na dnešku; oba světy mají pevný `weather_seed`
  sídel – v DB je náhodný a jiné počasí by vsi rozešlo).

## Postoje vsi a včasný útěk (Ú6.9)

Rozhodnutí: `VillageState.defense?: { stance }` (`DefenseStance` = `defend` | `surrender` | `flee`),
bez nastavení `flee` (`stanceOf`, `WAR.flight.defaultStance`). Postoj mění akce `setDefenseStance`
(`application/set-defense-stance.ts`, `ACTION_RIGHTS` → právo **`war`** – obrana vsi je válka, správce
cizí vsi ani senior ji nemají; držitel vsi ano). Čísla útěku: `WAR.flight` (25 / 10 kg, děti od 7 let,
návrat za 1 den), `WAR.surrenderRatio`, `WAR.pitFoundChance`.

- `domain/war/flight.ts` – `nearestForest(grid, from)` (hustý les mřížky pochodu; používá i útěk při
  bodu zlomu v `battle.ts`), `fleeParty(state, day, who?)` (dospělý 25 kg, dítě 7–15 let 10 kg, mladší
  nic, dobytek celý, zásoby nejvýš do výše zásob), `pitFound(seed, pitId, daysInGroup)` (30 % ze
  seedu jámy po 1 herním dni ve skupině domů), `returnDayAfter(dnes)` (+1 den), `isOverpowered`
  (útočníků > 1,5× obránců, jezdec za dva), `isHarmlessArmy(armyHouse, villageHouse, edges)`
  (vlastní rod, pán a vazalové = strom `treeBelow` na kterékoli straně).
- `domain/war/stance.ts` – `planDefense` se zavolá **jednou při otevření boje** (`campaignBattle`):
  1. s opevněním s plochou jdou **všichni** přítomní lidé a dobytek napřed do útočiště – nejbližší
     opevnění, doběh tempem vojska, brány se zavřou, jakmile je první útočník do 30 m (takt
     `gateCloseTick`), `refugeAdmit` rozhodne, kdo se vejde. Muži uvnitř bojují u středu opevnění
     (násobek `defenderMultiplier`), ženy a starší nebojují. Postoj `surrender`: skupina uvnitř se
     vzdá nad `surrenderThreshold(muži, násobek opevnění)`;
  2. kdo zůstal venku, jedná po **skupinách domů**: `defend` bojuje; `surrender` se vzdá při
     přesile, jinak bojuje; `flee` do lesa (zásoby, dobytek), **bez lesa jako `surrender`**. Poslední
     muž rodu se nevzdá – uteče do lesa (bez lesa bojuje);
  3. kdo odešel nebo se vzdal, v `BattleState` není (nezapočítá se do bodu zlomu); co odnesl, je
     v `BattleState.shelter` (`ShelterReport`: útočiště, les, vzdaní, `carriedKg`, dobytek) – použije
     Ú6.10 (kořist, jámy), Ú6.11 (vzdaní).
- Neškodná vojska: `CampaignWorld.harmless?(villageId, armyPlayerId)`; v `raidTick` bez boje rovnou
  `turnBack('arrived')`. Upozornění: `CampaignWorld.watcherOf?(villageId)` → při otevření boje
  `CampaignNotice` druhu `foreign-army` (payload `{ villageId, name }`) majiteli vsi.
- Zapojení: `application/step-campaigns.ts` – `StepCampaignsDeps.watchers` (volitelné),
  `villageWatchers(...)` je složí z portů (majitel sídla vsi, `isHarmlessArmy` nad `edgesNear`
  do 8 kroků); worker je předává v `apps/worker/src/main.ts`.
- Zjednodušení proti návrhu: rozhodnutí o postoji padá při otevření boje (všichni útočníci na mapě
  jsou „v dohledu“), utíkající lidé se nedohání, domy uvnitř obvodu (zásoby v bezpečí) se
  neodlišují od přibíhajících zvenku, vozy a koně se do útěku nepočítají (jen stáda ovcí, koz, prasat
  a krav). Zásoby a jámy aplikuje Ú6.10 (utečení lidé ve stavu vsi zůstávají).

## Výsledky nájezdu a kořist (Ú6.10)

`domain/war/raid-apply.ts` (war.md – Ztráty, Kořist; fortifications.md – Prolomení). Tažení spočte,
co se stalo, a pošle to do schránek vsí na **následující den** (rozhodnutí 13, `post` v
`campaign.ts`); vsi to použijí na začátku dne jako ostatní události schránky (`inbox.ts`).

- **Kdy:** `reportRaid` na konci taktu, jakmile boj skončí (`attackers`, `defenders`, `withdrawn`),
  jen jednou (`CampaignState.raidDay`); i z `finish`. Ves čte stavem `villageAt(cíl, s.day)` jako
  bojiště (chybí-li, takt se zastaví – `MissingData`).
- **`raid-result`** do napadené vsi (`RaidResult`): padlí a ranění obránci z bojovníků `down`
  (`killed`); drží-li útočníci bojiště, i odvedení – vzdaní z `ShelterReport.surrendered` podle
  `CampaignState.surrendered` (výchozí `lead`; `kill` = padlí; muže rodu a šlechtice zajme Ú6.11,
  zatím zůstanou) – a kořist `raidLoot`:
  - jídlo ze zásob (obilí, luštěniny, maso, sýr) do nosnosti `lootCapacity` – 25 kg na muže na
    nohou (`WAR.carryKg.man`, raněný nenese) minus zbylé jídlo tažení; po druzích ve stejném poměru;
  - zůstane: odnesené do lesa (`fleeParty` lesních), do útočiště, které útočník nedobyl (dobyté =
    někdo z útočiště bojoval nebo se vzdal), osivo `reservedSeedKg` a zapečetěné jámy, které útočník
    nenajde (`pitFound(seed tažení, jáma, dny boje)` – dny = takty boje × `hoursPerTick` ÷ 24);
  - dobytek (ovce, kozy, prasata, krávy) celý kromě útočiště a lesa. Koně a voli zatím ne.
- **`applyRaidResult`**: padlí zemřou (`death`, `cause: 'war'`) a pohřbí se (`bury`), ranění
  `Person.woundedUntil` = den + 60 (`isInjured` – nepracují, necvičí, neloví, nebojují) a los
  `woundDeathDayOf(seed vsi, člověk, den zranění)` – 1 z 5 do 30 dní (`Person.woundDeathDay`),
  odvedení odejdou (`removePeople`), kořist ubude (nejvýš co ves má; nalezené jámy prázdné, zbytek
  z otevřené jámy `drawGrainPits`; dobytek napřed dospělý). Kronika `raid` s tím, co se opravdu
  stalo, a smrti padlých.
- **`woundDeathsDay`** (simulate.ts – po schránce, před simulací dne): kdo má `woundDeathDay` dnes,
  zemře (`cause: 'wounds'`), doma se pohřbí; muž rodu – `dynastyDay` ještě týž den.
- **`fortification-breach`**: prolomené úseky (`BattleBreach.progress.breached`, opevnění podle
  pořadí ve vsi → `id`) dostanou `breachedDay` a stav 0; `decideFortRebuilds` je přestaví
  přednostně a stav průlomu nepřepisuje stářím; po přestavbě `breachedDay` zmizí.
- **`line-man-fell`**: padlý muž rodu útočníka (`raidTick` po `syncMembers`) hned do domovské vsi –
  smrt se jménem a id (nástupnictví vsi `dynastyDay`, nástupnictví hráče z `death.personId`), bez
  pohřbu (padlí útočníci zůstanou na cizí mapě).
- **Kronika obou rodů**: napadená ves z `applyRaidResult`, ves shromaždiště událostí `chronicle`
  se stejným zápisem (`raidChronicle`). Jména vsí `CampaignVillage.name` a `CampaignState.ambush`
  plní `plan-campaign.ts` / `launch-campaign.ts`; text `raidText` v `village-view-chronicle.ts`
  („Nájezd Bořivoje z vsi Lhota na ves Kněžice bez opovědi: padli 3, …“).
- **Kořist s vojskem**: `CampaignLoot.detail` (rozpis), `people` (snímky odvedených ke dni nájezdu),
  `foodKg`/`herd` součty (stádo zpomalí návrat); odvedení i v `captives`.
- **`campaign-return`** (`finish` – každé domovské vsi mužů, kořist a odvedení jen vsi
  shromaždiště): `applyCampaignReturn` zruší `away` tažení mužům `back` (aktivní a dezertéři, ne
  zajatí), raněným dá 60 dní od `CampaignMember.woundedDay` a los smrti, padlí vesničané zemřou bez
  pohřbu, kořist do zásob a stád, odvedení přijdou s novými id (`rehomePeople`; rodina do
  `newcomerHome`, děti k rodičům).
- Testy: `war/__tests__/raid-apply.test.ts` (bilance, útočiště, jámy, ztráty, nástupnictví, ranění,
  návrat, po kouscích), `raid-campaign.test.ts` (vzdaná ves přes `stepCampaign`, kronika obou rodů,
  po kouscích taktů), průlom v `village/__tests__/fortification-decay.test.ts`.

## Zajetí a výkupné (Ú6.11)

Spec: [war.md](../design/war.md) – Vzdaní, zajetí a výkupné. Zajetí žije ve stavech vsí, DB drží jen
rozhodnutí.

- **Vzdání** – `domain/war/surrender.ts`: `surrenders(member, situation, rng)` – bezvýchodná situace
  (`hopeless`) → `WAR.lineSurrenderChance` (80 %, los ze seedu); jezdec s volnou cestou uteče.
  `reportRaid` (`campaign.ts`, `raidResultOf`) ho hází o raněné muže rodu na bojišti (hloučky
  `shelter.surrendered` jsou bezvýchodné z definice). Poslední muž rodu doma se nevzdá ani nezajme.
- **Co s nimi útočník** – muži rodu a šlechtici (`Person.line` / `noble`) vzdaných skupin: u NPC
  velitele **vždy zajmout** (bez ohledu na `surrendered`), u živého podle `CampaignState.surrendered`
  (`lead` = zajmout, `kill` = pobít, `leave` = nechat). Záměr `choose-surrendered { group; choice }`
  (`applyIntent`) volbu nastaví, dokud boj neskončí (`group` jen ověřuje existující skupinu;
  volba platí pro celé tažení). Ostatní vzdaní (ženy, děti, vesničané) dál `led` jako odvedení.
- **Dva konce zajatců**: `RaidResult.captured` + `captorVillageId` (napadená ves: osoba **zůstává ve
  stavu** s `away { kind: 'captive', hostVillageId, refId }` bez `untilDay`, `captureMen`; zajatý
  vojvoda zapne správce se značkou `StewardState.byCaptivity` = formální správce řídí ves) a
  `CampaignLoot.prisoners` → `CampaignReturn.prisoners` (ves shromaždiště: `VillageState.prisoners`
  - host druhu `captive` s `untilDay = 1e9`, takže jí z jejích zásob – `villageFoodNeed` – a
    `guestLaborToday` ho nepočítá; necvičí).
- **Klíč zajetí** `<id tažení>:<číslo osoby>` (`prisonerKey`).
- **Schránka `captive-returns { role: 'home' | 'captor'; prisonerId; personId }`**
  (`domain/war/captives.ts`): `home` zruší `away` (+ vypne správce zapnutého zajetím, kronika
  `people-back` druhu `captive`); `captor` odebere zajatce i hosta. Poprava = `captor` +
  `line-man-fell` (smrt a nástupnictví `dynastyDay` / `resolvePlayerSuccession` jako u padlého).
- **DB**: `schema/prisoner.ts`, migrace `0034_prisoner.sql`, `adapters/prisoner-repository.ts`:
  `claim` = INSERT … ON CONFLICT DO NOTHING (primární klíč = klíč zajetí) – druhé souběžné
  rozhodnutí neprojde (`prisoner-repository.db.test.ts`).
- **Use-casy** (`application/prisoners.ts`): `decidePrisoner(deps, { playerId, prisonerId, action,
today })` (`hold` / `release` / `execute`, zajatec se hledá ve vsích hráče, pod zámkem hráče;
  propuštění pošle `captive-returns` home za `max(1, 2 × cellDistance)` dní) a `ransomHooks(deps)`
  (`NegotiateDeps.ransom`): `check` (zajatce drží jedna strana jednání), `apply` (zásilka výkupného
  z vsi platícího do vsi věznitele přes `sendShipment`, pak propuštění), `release` (mír).
- **Jednání**: řádek `ransom { prisonerIds; price; vassalage? }` (`domain/negotiation/ransom.ts`),
  samostatné jednání jako obchod (nevyžaduje vazalství; `open` / `counter` / `accept` v
  `negotiate.ts`); vazalství z výkupného vznikne účinkem řádku. `peace.releasePrisoners` po přijetí
  míru volá `ransom.release`. Kdo platí, je strana, která zajatce nedrží.
- **Web**: `lib/prisoners.ts` (`decidePrisonerForPlayer`, `ransom()`), akce `decidePrisonerAction`,
  `VillageManor.prisoners` (`manor-view.ts`), `PrisonersPanel.tsx` (portrét s pouty, držet /
  propustit / popravit; poprava druhým stiskem), ikony `public/icons/war/{captive,hold,release,execute}.svg`.
- Nevykonáno (později): zajetí **útočníků** obráncem (raněné na bojišti), formulář výkupného ve
  `TermsForm` (řádek se jen zobrazuje), zajatý hráčův muž nevede tažení díky `away` (`launch-campaign`).
- Testy: `war/__tests__/surrender.test.ts`, `captives-campaign.test.ts` (zajetí přes `stepCampaign`),
  `application/__tests__/prisoners.test.ts`, `ransom-negotiation.test.ts`, db test výše.

## NPC velitel, zástupce a rozpad (Ú6.12)

Spec: [war.md](../design/war.md) – Velení a příprava tažení (NPC velitel, Hráč odejde od tažení,
Rozpad). Čísla `WAR.npc` (`attackRatio` 1,5, `lostShare` 0,5) a `WAR.absentLeaderDays`.

- **Kdy vede NPC** (`campaign.ts`, `npcLeads`): ve fázi `marching` / `raiding`, když velí jiný muž
  (`liveCommand = false`), nebo je hráč pryč a vede zástupce (`CampaignState.absent`). Po záměrech
  hráče a kontrole velení (`command`) takt spočte `npcIntents(state, world)` a použije je jako
  záměry NPC (`applyBody(…, npc = true)` – stejné úkony jako hráč, navíc `plunder`). Rozhoduje jen
  ze stavu a světa v taktu, takže výsledek nezávisí na kouscích taktů; před rozhodnutím na mapě
  cíle se načte opevnění (`battleFieldOf`, jinak `MissingData`).
- **`domain/war/npc-commander.ts`** – `npcIntents`: obrat (`turn-back { reason }`) při bodu zlomu
  skupiny velícího muže (`routed`), padlé / zajaté / dezertované nebo v boji prchající polovině
  vojska (`routed`), plné nosnosti – kořist jídla ≥ `lootCapacity` (`arrived`) –, nebo když jídla
  zbývá jen na cestu domů (`daysHome` – vzdušnou čarou do shromaždiště 3,5 m/s; `supplies`).
  Pochod: skupiny, které hráč poslal jinam, pošle k cíli (`march`); trasa je pochod Ú6.4 (A*
  obchází hustý les, potoky po brodech). Nájezd: `npcLeader` (velitel, dokud bojuje i prolamuje,
  jinak zástupce) – drží napadeného, dokud bojuje; jinak skupiny domů obránců v dohledu (150 m od
  kteréhokoli útočníka) poměří silou obránců × `defenderMultiplier` (u domu 1,5, za opevněním
  1,5 × násobek) a napadne nejslabší (`strike` na nejbližšího jejího muže), má-li vojsko aspoň
  1,5 × její sílu. Jinak: všichni obránci za opevněním → `plunder` (boj `attackers` +
  `BattleState.plundered` → `raidResultOf` bere útočiště za nedobyté – kořist jen zvenku), jinak
  `turn-back { reason: 'order' }`. Nevidí-li nikoho, jde k nejbližšímu obránci (`march`). Průchod
  opevněním volí boj (`approach` – mezera / brána / průlom, jinak místo s nejmenší prací).
- **Řízení v boji** – `syncControl`: `controlled` má jen muž, kterého řídí NPC (`npcLeader`), nebo
  při živém vedení velitel tažení; kdo řízení ztratí, zapomene `chosen` a `goal`.
- **Přítomnost** – záměr `presence` (web pošle z otevřeného tažení – Ú6.14) i každý jiný záměr
  hráče nastaví `presenceTick` a zruší `absent`. `command`: živé vedení bez přítomnosti déle než
  1 herní den (`absentTicks` = 24 h ÷ `hoursPerTick` ≈ 345 taktů) → se zástupcem `absent = true`
  (vede NPC, po návratu hráč převezme), bez zástupce rozpad. Padlý nebo zajatý velitel → živý
  zástupce převezme velení (`liveCommand = false` – hráč už vliv nemá), jinak rozpad (i když padl
  i zástupce). Vede-li jiný muž, hráčův `turn-back` se zahodí.
- **Rozpad** (`disband`): boj končí (`leaveBattle`), `phase = 'disbanded'`, živí muži se rozdělí do
  hloučků podle domovské vsi (nová id skupin, hlouček stojí u skupiny svého prvního muže) a jdou
  domů – `CampaignState.homes` (místa vsí z přípravy, `homePlaces` v `plan-campaign.ts`), chybí-li,
  do shromaždiště. Kronika všech domovských vsí a shromaždiště `campaign { step: 'disbanded' }` →
  „Výprava Bořivoje se rozpadla.“ (`village-view-chronicle.ts`), upozornění `campaign-disbanded
{ campaignId, leader }` vůdci i vazalům, jejichž muži jdou („Výprava se rozpadla.“ –
  `player-notices.ts`, panel války). Hloučky nebojují; doma `finish` pošle jen `campaign-return`
  (bez zápisu „vrátilo se“ a bez `campaign-returned`). Kořist a stádo jdou s hloučkem vsi
  shromaždiště.
- Testy: `war/__tests__/npc-commander.test.ts` (nájezd NPC na bránící se ves po kouscích 1 / 7 / 100,
  silná ves za palisádou – kořist jen zvenku, obraty, přítomnost, zástupce, rozpad); živé testy
  tažení posílají přítomnost (`present`, `LIVE` v `campaign-fixtures.ts`).

## Průchod, svolání a ochrana (Ú6.13)

war.md – Pohyb (Průchod územím neutrálního rodu), vassalage.md – Svolání, Ochrana vojskem.

- **Průchod** – port `application/passages.ts` (`Passage`, `PassageRepository`: `announce`, `byId`,
  podmíněné `answer` – jen bez odpovědi a platné, `validBetween`, `openTo`, `voidBetween` v obou
  směrech; `passageCovers(passages, cell, campaignId)` – platné ohlášení téhož tažení bez „Nevěřit“ na políčku; `Passage.campaignId` null = čeká na vyslání). Use-case
  `application/passage.ts`: `announcePassage(deps, { playerId, house, cells, eta, message, today })`
  (ne vlastní rod, ne ve válce, 1–`WAR.passage.maxCells` map, upozornění `passage-announced`,
  kronika obou rodů `passage-announced` „Bořivoj ohlásil průchod.“), `answerPassage(deps, {
playerId, passageId, trust, message, today })` (jen oslovený rod, jednou; `passage-answered`
  ohlašujícímu), `passagesToAnswer` (panel války). **Neškodnost:** `villageWatchers({ …, passages })`
  – `harmless(armyPlayerId, ownerPlayerId, villageId)` je true i pro ves na ohlášené mapě (sídlo
  `worldCell`); bez odpovědi platí (spící hráč nic nedělá), „Nevěřit“ = ves podle postoje (dny
  nájezdu, signál hrozby). **Zrušení:** `WarDeps.passages` – `declareWar` i `startWarByAttack`
  (přepadení po ohlášení) zavolají `voidBetween`; web `launchDeps` ho předává. **Jedno tažení**
  (Martin 7. 11. 2026): `launchCampaign` po `campaigns.create` zavolá `bindToCampaign(houseId,
campaignId)` (čekající ohlášení rodu dostanou `campaignId`); `harmless(…, campaignId)` bere jen
  ohlášení téhož tažení; `stepCampaigns` (`endPassages`, `StepCampaignsDeps.passages`) po uložení
  tažení ve fázi `done` / `disbanded` (i u už skončeného) zavolá `voidOfCampaign`. DB `schema/passage.ts`,
  migrace `0035_passage` + `0036` (`campaign_id`), adaptér `adapters/passage-repository.ts`.
- **Svolání** – `application/summons.ts`, dialog `summons` (`SummonsBody`: válka a její strany,
  vazalství, pán, vazal, cílová ves, domluvení muži, dny; `forDialogId` u vazala vazalů; po odpovědi
  `sent`, `message`). `summonVassals(deps, { playerId, warId, vassalageIds, targetVillageId, days?,
today })` – válka rodu, nebo otevřené svolání od pána se stejnou válkou (vazal vazalů – cíl se
  převezme od pána); jen vlastní vazalové s `terms.service`, jedno čekající svolání na vazalství
  (klíč `summons:<vazalství>:<pořadí>` – souběh projde jeden), dny = zbytek roku (součet `days`
  nepropadlých svolání roku, `DialogRepository.listFor`) nebo menší `days`; upozornění
  `summons-open`. `serviceMenOf` – muži rodu schopní služby ze všech vsí hráče (`lineCandidates`),
  nejzdatnější první (`lineManStrength`). `answerSummons(deps, { playerId, dialogId, men, message,
today })` – jen muži rodu schopní služby z vlastních vsí, podmíněné `answer` s odpovědí v těle,
  pak `sendMen` (shipments.ts – `away` `service`, host `guests-arrive` na `days` dní, cesta 2 dny
  na políčko tam i zpět, kronika `people-away`); míň než domluveno (i s muži vazalů na jeho
  svolání – `forDialogId`) = `addBreach('summons')`; `summons-sent` pánovi. `lapseSummons` (úloha
  světa ve `runWorldTasks.summons`, worker) – otevřené svolání po konci války `lapse` → neplnění,
  kronika obou rodů `no-show` „Ctibor nepřišel do války.“, `summons-lapsed`.
- **Ochrana pánem** – `application/protection.ts`: `requestProtection(deps, { playerId,
vassalageId, villageId, message, today })` (vazal, vlastní ves – upozornění
  `protection-requested` pánovi), `sendProtection(deps, { playerId, vassalageId, villageId, men,
today })` (pán, jen muži rodu schopní služby z vlastních vsí, do vsi vazala – `sendMen` druhu
  `protection` do odvolání: doma `away` bez `untilDay`, host do konce světa; `protection-sent`),
  `recallProtection(deps, { playerId, vassalageId, villageId, today })` – schránka chráněné vsi
  `guests-leave` (dnes, `dismissGuests`), domovské vsi `away-ends` (`endAway` – návrat za 2 dny na
  políčko); `protection-recalled`. Odkaz `protectionRef` = `protection:<dohoda>:<ves>`.
- **Hosté z ochrany v boji** – `campaignBattle` → `guardGuestsOf`: hosté cílové vsi druhu
  `protection`, jejichž osoba (stav domovské vsi ke dni `d − 1` přes `villageAt`, jinak
  `MissingData` – takt čeká) je pryč právě u cíle a má 16 let; čísla v boji −1, −2, … (pořadí ves,
  osoba), paměť `CampaignState.guards` (`CampaignGuard` – číslo, `ref`, jméno, šlechtic).
  `defenderRoster(state, day, { guests })` je přidá za lidi vsi (`GuardGuest`, `Defender.guest` –
  u prvního obydlí, síla `lineManStrength`, luk, nikdy `lastLine`), `planDefense` je zařadí do
  skupiny jejich místa (útočiště, les, vzdání). `raidResultOf` je bere jako muže rodu (vzdaný /
  raněný → zajetí); `reportRaid` napadené vsi pošle jen její lidi, `reportGuards` domovským vsím
  `guard-losses` (`GuardLosses`: padlí, ranění, zajatí, `captorVillageId`, `villageId`) a chráněné
  vsi `guests-leave` za padlé a zajaté. `applyGuardLosses` (raid-apply.ts): padlí `warDeath` bez
  pohřbu (muž rodu – nástupnictví jako `line-man-fell`), ranění `wound`, zajatí `markCaptive` s
  klíčem `guardPrisonerKey` (`<tažení>:<ves>:<osoba>` – číslo osoby by se mohlo potkat s lidmi
  napadené vsi); vězeň u útočníka `guardPrisoner`. Kronika útočníka počítá i hosty.
- **NPC vazal na svolání** – `summonVassals` otevře dialog i NPC rodu (drží ho svolávající, tělo
  stejné), vrátí `npcDialogIds`; web je hned po zámku vsi splní `answerNpcSummons` (domluvený počet
  nejzdatnějších mužů NPC rodu ze vsí, které spravuje – `stewardships.listByStewardHouse`,
  `nobleLineCandidates`; míň mužů = neplnění jako u hráče). Společné odeslání `dispatchSummons`.
  Panel Svolání (`summonsDialogsForPlayer`) ukáže jen svolání vlastního rodu.
- **Rozsudky ve válce** – `WarDeps.disputes` a `vassalages` jsou povinné; `launchDeps` (web) je
  předává, takže přepadení tažením přes rozsudek „mír“ zapíše neposlušnost. Smyčka tažení válku
  nezačíná (vše začne vysláním) – nic dalšího nepotřebuje.
- **Web ochrany a průchodu** – `lib/protection.ts` (`protectionViewForPlayer` – pánové k žádosti,
  hosté zobrazené vsi, vsi přímých vazalů s počtem vlastních mužů, muži schopní služby;
  `requestProtectionForPlayer` přes `guardedAction` `requestProtection` = `war`; poslat / odvolat
  bez zámku vsi – `sendMen` bere zámek sám; `sendProtectionForPlayer` vezme `men` nejzdatnějších
  z `serviceMenOf`; `announceWarPassageForPlayer` – trasa `worldRoute` od sídla k sídlu nepřítele,
  den dnes). Server actions `protectionView`, `requestProtection`, `sendProtection`,
  `recallProtection`, `announceWarPassage`. `WarPanel` – `war-protection` (štít s hosty
  `war-guards`, sepjaté ruce `war-request-protection`, řádky `war-guard-village` se štítem
  `war-guard-sent`, počtem `war-guard-count`, `war-guard-send`, `war-guard-recall`), u války
  stopy `war-passage-open` → `war-passage-list` (vzkaz, `war-announce-passage` u rodů). Ikony
  `house/{passage,guard-send,guard-recall}.svg` (CC0).
- **Port dialogů** – nové `listFor(refId, kind)`, `openOfKind(kind)`, `lapse(id)`, `answer(id,
expected, reply?)` (odpověď se přidá do `body` – `body || reply`).
- **Web** – `lib/summons.ts` (composition root; `summonVassalsForPlayer` přes
  `summonVassalsActionForPlayer` = `guardedAction` s `ACTION_RIGHTS.summonVassals` = `war` na cílové
  vsi; odpověď na svolání jako u Odvodů bez zámku – `sendMen` bere zámek sám), server actions
  `summonVassals`, `answerSummons`, `passagesToAnswer`, `announcePassage`, `answerPassage`;
  `levyDialogs` vrací i `summons`. `WarPanel` – roh `war-summon` u války rozbalí přímé vazaly
  (štít s muži schopnými služby `war-vassal-shield`, roh `war-summon-vassal`, bez služby zašedlý),
  ohlášení průchodu `war-passage` (podání ruky – vzít na vědomí, zlomená pečeť – Nevěřit).
  `LevyDialog` – řádek `summons-row` (muži rodu se zaškrtnutím, předvybraní nejzdatnější, štít
  vybraní / domluvení, hodiny s dny, vzkaz, roh Odeslat). Ikona `house/horn.svg` (CC0).
- **Testy** – `application/__tests__/summons.test.ts` (jen muži rodu, nejzdatnější první, víc svolání
  do vyčerpání dnů, vazal vazala do služby B, míň = neplnění, propadnutí s koncem války – kronika
  a neplnění jednou), `passage.test.ts` (ohlášení, neškodné na ohlášené mapě, „Nevěřit“, jedna
  odpověď, útok = přepadení a zrušení), `db/adapters/__tests__/passage-repository.db.test.ts`
  (souběh tří odpovědí – projde jedna, zrušení v obou směrech, odpověď dialogu v těle jednou),
  e2e `multiplayer.spec.ts` („svolání: …“, „ochrana: …“), `domain/war/__tests__/guard-campaign.test.ts`
  (hosté „bránit se“ / „vzdát se“, ztráty domů, po kouscích = vcelku, padlý host = nástupnictví),
  `summons.test.ts` (NPC vazal přesně), `launch-campaign.test.ts` (přepadení přes rozsudek).
