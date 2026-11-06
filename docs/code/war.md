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
  `liveCommand`, ve fázi pochodu) | `turn-back`.
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
  Všechny skupiny na mapě cíle → `raiding`; **`raidTick` je místo pro boj** (Ú6.8 `battleTick`, Ú6.9
  obránci, Ú6.10 kořist, Ú6.11 vzdaní) – v Ú6.5 hned obrat `arrived`. Návrat ke shromaždišti
  (rozpad po hloučcích Ú6.12) → `done`: zápis „Vojsko Bořivoje se vrátilo.“ do kroniky každé
  domovské vsi a upozornění `campaign-returned { campaignId, reason }`; při vyrazení „Vojsko
  Bořivoje vyrazilo.“ do shromaždiště. Události jdou do schránky na **následující den** (rozhodnutí
  13), `ref` = `camp:<id>:<takt>:<n>`. Stádo kořisti jde se skupinou velitele.
- **Svět tažení** – `CampaignWorld { clock, landscapeOf(cell), villageAt(villageId, day) }`
  (synchronní): `null` = data ještě nejsou → takt se zastaví a `waiting` vrátí chybějící políčka /
  vsi; výsledek se tím nezmění. Mřížka bere cesty a opevnění **první** vsi mapy; `villageAt` v Ú6.5
  vrací stav, jak ho má úložiště – stav přesně ke dni (bariéra) a víc vsí na mapě je Ú6.7.
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
