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
  Bez velitele a pro NPC velitele (bez `liveCommand`) „útočit na vše“ – rozhodování NPC Ú6.12.
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
  a krav). Zásoby, jámy a návrat lidí do vsi aplikuje Ú6.10.
