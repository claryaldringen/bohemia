# Válka – kód

Pravidla: [docs/design/war.md](../design/war.md). Hotová je síla vojska a stropy výcviku
(Ú6.1), válka mezi rody s ochranou nováčka a opovědí (Ú6.2), mírové jednání (Ú6.3), pohyb
vojska mapu po mapě (Ú6.4), tažení po taktech, boj a dohra (Ú6.5–Ú6.17) a boj u hradby
(plán hradeb 2026-11-08 – obránci na hradbě, prolomení, brány, NPC velitel).

## Stropy výcviku

- `ARMS_CAPS = { home: 50, hunt: 70, war: 100 }` v `domain/village/rules-lord.ts` (war.md – Síla).
- `trainingCap(person, day, source)` v `lord.ts` – menší z věku (`armsCap`) a zdroje. `trainLordDay`
  cvičí doma se stropem 50, v den lovu (jezdec, pěší syn) se stropem 70; válka (100) zatím nikoho
  necvičí.
- `domain/village/arms-caps.ts` – `withArmsCaps(state)`: dovednosti (i `best`) nad 70 jednou stáhne
  na 70; příznak `VillageState.armsCapped` zaručí, že se válečná zkušenost nad 70 už nesráží.
  Volá se v `advanceVillageSteps` (`simulate.ts`) vedle ostatních `with…` převodů.

## Síla

- `domain/war/rules-war.ts` – `WAR` (čísla war.md – Čísla; čísla opevnění jsou ve `FORTIFICATIONS`).
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
  `house/spears.png`, `house/shield-hourglass.png`.

## Mírové jednání (Ú6.3)

- **`peace`** (`domain/negotiation/{types,peace}.ts`): jediný řádek kola mezi stranami **aktivní války**
  `{ fee?, payer?, vassalage?: { lord, vassal, terms }, tribute?: { goods, payer }, cede?, releasePrisoners? }`;
  všechno volitelné, mír bez podmínek smí. Otevře, protinávrhuje, přijímá a odmítá se jako běžné jednání
  (`openNegotiation` / `counterNegotiation` / `acceptNegotiation`; stejně jako `war-demand` nepotřebuje
  přísahu ani dohodu). `checkPeaceItems` hlídá tvar (poplatek smí být zboží i lidé (ne robota; `answerTrade` je u `fee-send` povolí jako u rozsudku), tribut jen zboží bez lidí, plátce je strana,
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
  Neplnění se nevymáhá, ale zapíše se (`tributeBreach` v `annual-levies.ts`): míň než domluveno při odpovědi
  i každý zmeškaný 1. 11. → kronika obou rodů `tribute-short` a – trvá-li mezi nimi vazalství plátce → příjemce –
  `addBreach('levy')`.
- **Postoupení vsí** (`application/cede-village.ts`): `checkCede` – všechny vsi patří jedné straně a
  postupujícímu **zbývá živá ves na jiné mapě** (jinak `PEACE_REASONS.lastVillage`, „jen vazalství“;
  Martin 2. 11. 2026). `cedeVillages` po transakci: muži rodu (`isLineMan`) všech vsí postoupených
  map odejdou s rodinami (`departAppointee`) do nejbližší živé vsi postupujícího – událost `lord-arrives`
  ve schránce cílové vsi (`ref cede:<jednání>:<ves>:<muž>`), pak převod držitele po celých mapách
  (`transferVillages`, zámky postupně, jako odúmrť) a zapnutý správce (`setStewardOn`) ve vsích. Je
  idempotentní. Háčky `CedeHooks` (`check`, `apply`) skládá `createGameDeps` (`deps.cede`).
- **Propuštění zajatců:** `releasePrisoners` se zatím jen nese (kontrola tvaru); zajetí přijde v Ú6.11.
- **Web:** `WarPanel.tsx` – u každé války pečeť **Nabídnout mír** (`war-offer-peace`) a mini-formulář
  (`peace-form`: poplatek (obilí a lidé – `peace-fee-men/women/families`), tribut, vazalství; `peace-send`); řádek `term-row-peace` (`TermsForm.tsx`)
  v kartě jednání; `parsePeace` v `lib/house-input.ts`. Dialogy poplatku a tributu zobrazuje `LevyDialog`.

## Pohyb vojska (Ú6.4)

Čistá doména, jen det-math (`domain/war/**` v `eslint.config.mjs`); čísla ve `WAR.pace`,
`WAR.march`, `WAR.snowPace`, `WAR.frost` a `rampartPace(výška)` (`fortification/assault.ts`).

- **Mřížka** – `domain/war/march-grid.ts`: `marchGrid(landscape, obstacles, village, { day,
closedGates })` → `MarchGrid` (buňky 10 m přes celou mapu 1 920 m, 192 × 192; `pace` = násobek
  tempa, 0 neprůchodná; `flags` `MARCH_*`). Terén krajiny (`marchTerrain`, mezipaměť `WeakMap`
  podle krajiny): buňka do půl úhlopříčky (≈ 7 m) od vody (potok a všechny řeky – řeka prémiové
  krajiny i řeky kostry světa, soutok; `watersCenterline`, landscape.md – Osa vod víc řek; mapa
  s řekou bez potoka také) je voda – krok mezi středy ji
  nepřeskočí; brod = mělčina potoka či řeky (`StreamSample.shallow ≥ WAR.march.fordShallow`;
  řeka kostry má 1–2 brody, jinudy ji vojsko nepřejde – world-skeleton.md – Kde všude kostra
  působí; úzký brod
  chodců `FORD` v `paths/terrain.ts` v krajinách nevychází, proto jen mělčina); sráz nad
  `PATH_SLOPE_MAX`. Hustý les (× ¼) = pole lesa > 0 a v okolí 3 × 3 buněk aspoň
  `denseForestTrees` stojících stromů vrstvy překážek podle změn vsi (`obstacleChangesAt` –
  paseka vsi lesem není); bez vrstvy (testy) celý les krajiny. Ves: osy pevných cest (i zemské
  stezky – její úseky jsou mezi `roads.roads`) × 1,5 i lesem a přes vodu (brod, lávka);
  opevnění (`fortCells`): hotový plot, palisáda a val se stojící nástavbou neprůchodné, val bez
  nástavby tempem `rampartPace(výška dílu)` = 1 ÷ (1 + 3 × v) (plný val ¼ jako dřív; díly po
  výškách – jedna výška = stejné buňky jako dřív), průchozí otevřené brány (zavřené v `closedGates`) a mezery
  (`segmentIsGap` – nedostavěný, shnilý, prolomený úsek celým pásem). Buňky přes `fortWalls`
  a `fortWallCells` (pěšiny); buňka, které se dotkne průchod, stěnou není. Stavby vsi (`blockBuildings`, příznak
  `MARCH_BUILDING`, tempo 0): obdélníky `villageBuildings` jako u pěšin (obydlí s pozemkem, dvorec,
  dílna s dvorem, staveniště, milíř, modla, humno; buňka, které se obdélník dotkne) a hotová ohrada
  celou plochou plotu kromě branky; pole zůstávají průchozí tempem louky (spec zpomalení neuvádí).
  Start či cíl uvnitř stavby `marchPath` přesune na nejbližší volnou buňku (`outOfBuilding`);
  v boji (`battle.ts` `paceAt`) stavby neblokují.
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
- **Testy** – `domain/war/__tests__/march.test.ts` (tempo, les, brod, řeky kostry jen přes brod
  – umělé i mapa se soutokem, opevnění, cesta, zima,
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
  k cíli; úsek se plánuje na mřížce `marchGrid` políčka a dne – mezipaměť v rámci volání, napříč
  voláními `CampaignWorld.grids` – `MarchGridMemo`, klíč identita krajiny, překážek, stavu vsi a den);
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
  `CampaignCells.mapOf` a vsi a pokračuje, nejvýš 8 kol; s pamětí workeru vsi téže verze jen
  otiskem `stampsOfVillages` – docs/code/worker.md – Výkon – Tažení) do `tickOfMs(now)`. Bod se uloží, když
  přibylo ≥ 40 taktů, vznikly události nebo tažení skončilo (jinak `computed` – další kolo počítá
  znovu z bodu, s pamětí workeru `memory` od posledního spočteného stavu, platí-li pro týž bod –
  otisk JSON – a tytéž záměry do jeho taktu; docs/code/worker.md – Výkon – Tažení); `saveCheckpoint` uloží stav i `outbox` (události a upozornění) atomicky a odmítne
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

war.md – Boj, Ztráty; fortifications.md – Obrana bez násobku, Střelba a viditelná plocha,
Prolomení. Čísla ve `WAR.combat` (zdraví, zásah, luk 20–60 m, zblízka 3 m, los zásahu zblízka
1 : 1, rány po 2 / 4 s, `aim` – kruh rozptylu a viditelné plochy), `WAR.sight` (150 m, v hustém
lese 50 m), `WAR.houseGroupM`, `WAR.holdPlaceM`, `WAR.defenderAges`, `WAR.downed`,
`WAR.breakpoint`, `WAR.lastLineManMinHealth`, `WAR.orderHearingMeters`.

- **Obránci** – `domain/war/defenders.ts`: `houseGroups(dwellings)` (obydlí blíž než 40 m i řetězem
  → číslo skupiny podle nejmenšího id), `defenderRoster(state, day, { lineMenElsewhere })` →
  `Defender[]` (pořadí podle id): muži 16–44 `villagerStrength(false, štěstí)`, muži rodu od 14 let
  `lineManStrength(p, null)` s lukem a `bowSkill` (`bowSkillOf` – `ArmsSkills.bow`), ženy, starší a chlapci 14–15 let 0,1 `atHouseOnly`; kdo je
  pryč (`isAway`) nebo zraněný, chybí. `lastLine` = jediný muž rodu ve vsi a `lineMenElsewhere`
  (výchozí 0 – tažení zatím jiné vsi hráče nezná). `defenderPlan` – výchozí postoj u domů:
  útočník do 40 m od domů skupiny (nebo kdo útočí na obránce) a ve dohledu, vodítko 40 m od domů;
  `atHouseOnly` jen na dosah u svého domu. Postoje, včasný útěk a skryté jámy – Ú6.9.
- **Rozkazy** – `domain/war/orders.ts`: `attackerPlan` – `follow-leader` (jde za velitelem, když je
  dál než 6 m; napadne, kdo útočí na velitele nebo na něj), `attack-all` (nejbližší viditelný
  i prchající, nikoho nevidí → nejbližší vůbec – projdou ves), `hold-place` (`holdAt`, jinak kde
  skupina stojí; nepřítel do 30 m + dosah zblízka od místa, lukem kdo je na dostřel, vodítko 30 m;
  jen na koho přes hradby dosáhne – `PlanContext.reaches` = `reachable` v `battle.ts`: každá stěna
  na čáře k cíli musí ránu pustit (`canStrikeAcross` – luk na dostřel, jinak zblízka), ať skupina
  kvůli cíli za palisádou místo neopustí, nepřeleze ani neprolomí – hradby Ú20).
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
  `deputy`, `closedGates` `<opevnění>:<úsek>`, `breaches` (`BattleBreach` – místo, `at`, postup,
  fáze, `BreachProgress` – viz Prolomení v boji), `outcome` `ongoing` | `attackers` | `defenders` | `withdrawn`. `openBattle`
  (útočníci u skupin, obránci u domů), `battleTick(b, field, rng)` mění `b` na místě:
  brány do 30 m od útočníka se zavřou (ne ty, které otevřeli obránci – `openedGates`) → bod zlomu
  (padlí a ranění ÷ `entered`, 30 % útok, 45 % obrana; velitel neuteče sám; obránci za hradbou po
  opevněních jen ze ztrát v útoku – [Kryt pod palbou, bod zlomu za hradbou a
  probíjení](#kryt-pod-palbou-bod-zlomu-za-hradbou-a-probíjení-9-11-2026)) a probíjení → stěny
  taktu → muži v pevném pořadí (plán, krok) → práce na
  průlomech (`breachWorkStep`, nejvýš 4 na místo, `hoursPerTick` z `ticks.ts`) → rány (cooldown 8 / 16
  taktů; zblízka los 1 : 1, šíp `bowShot` z `aim.ts` – viz Střelba podle dovednosti;
  `hitDamage(síla, luk)` = `10 × síla`, luk polovina – **násobek obrany zrušen 8. 11. 2026**, i u
  domu) se sečtou a použijí až po všech – kdo padne, v tomto taktu ještě udeřil → výsledek (útočníci bez bojujících = `defenders`; obránci bez bojujících
  i prchajících a všechna útočiště dobytá = `attackers`). Na nule `down`, `killed` losem (vesničan 1 : 1, muž rodu 1 ze 3);
  `lastLine` neklesne pod 10, pak uteče (i `controlled`). Útěk (`rout.ts` – `startFlee`, `battle.ts`
  – `fleeStep`): útočník do `home`, obránce do nejbližší buňky hustého lesa (bez lesa hned
  `fled`); obránce za hradbou napřed nejbližším průchodem (body před a za ním), bez průchodu je
  odříznutý a vzdá se; kdo se nepohne, je `fled`. Pohyb tempem
  pochodu (3,5 m/s ÷ 4, jezdec × 1,5, terén z `MarchGrid` – val ¼; voda a sráz neprůchodné).
- **Opevnění v boji** – `battleForts(geo, forts)` (tvar úseků a střed); stěny jsou úsečky úseků,
  které stojí (ne holý val, ne mezera, prolomený úsek = `breachedDay` dne boje), s výřezem otevřené
  brány a tětivou rohu. Pohyb stěnu neprojde (sklouzne podél), luk i dosah zblízka (3 m) přes ni
  ano. Útočník, kterému k cíli vadí stěna, jde nejbližším průchodem (`route` – 3 m před a za ním;
  když se zavře, cesta neplatí); bez průchodu hradbu přejde nebo prolomí nejrychlejším postupem
  (Prolomení v boji), prolamující nebojují, průlom je mezera.
- **Tažení** – `campaign.ts`: `raidTick` – první takt `campaignBattle` (muži na nohou na mapě cíle
  v šiku po pěti; obránci z `villageAt(cíl, den)`; ves není na mapě cíle → bez obránců),
  pak `battleTick` s `tickRandom(seed, tick, 'battle')`, `syncMembers` (zdraví, `fallen`,
  `wounded`). Konec: `attackers` → obrat `arrived` (háček Ú6.10 kořist a škody, Ú6.11 zajetí),
  `defenders` → `routed` (háček Ú6.12 rozpad, Ú6.11 ranění zůstanou); `turnBack` v boji →
  `leaveBattle` (`withdrawn`, skupiny se sejdou u velitele). Padlí a ranění obránci do vsi jako
  vnější události – Ú6.10.
- **Střelba podle dovednosti** – `domain/war/aim.ts` (fortifications.md – Střelba a viditelná
  plocha; Martin 8. 11. 2026): `spreadRadiusM(dovednost, d)` = `(2 − 1,5 × dovednost ÷ 100) × d ÷ 30`
  (mistr 0,5 m na 30 m, nováček 2 m); `poseOf(f, field, b, zespodu = true)` – lezec na žebříku
  a přes plot `climbing` (`onLadder`), obránce na ochozu (`Fighter.onWall`) proti ráně přes hradbu
  `parapet`, v krytu pod palbou (`Fighter.cover`) `cover`, jinak `standing`, `visibleAreaM2`
  0,85 / 0,25 / 0,025 / 0,85 / 0;
  `shotCandidates` – všichni na nohou obou stran (ne `down` ani `fled`) se středem v kruhu kolem cíle,
  v pořadí bojovníků, bez střelce; `shotChance` = Σ ploch ÷ π r² (nejvýš 1); `shotHit(kandidáti, r,
roll, pick)` – zásah, když `roll` < šance, zasažený váhou podle plochy. `bowShot(střelec, cíl,
bojovníci, pose, rng, dovednost?)` – dovednost `Fighter.bowSkill` (muž rodu z `CampaignMember.bowSkill` /
  `Defender.bowSkill`; chybí = vesničan 20; hod z ochozu pevně 20); **v kruhu žádný viditelný nepřítel → nestřílí**
  (`{ fired: false }`, cooldown zůstane, žádný los), jinak dva losy taktu (`roll`, `pick`) – šíp smí
  trefit vlastního. `CampaignMember.bowSkill` nastaví `launchCampaign` (`bowSkillOf` muže rodu);
  starší tažení ho nemají.
- **Testy** – `__tests__/battle.test.ts` (příklad war.md 5 vs. 25 ran, u domu 5 ran po 2 s; bod
  zlomu 30 % / 45 %, velitel zůstane; poslední muž rodu doma pod řízením hráče – nejníž 10, uteče
  do lesa; palisáda – brána se zavře, 4 muži ≈ 3 h, zeď ≈ 24 h, šíp za palisádu plný poloviční;
  šíp do hloučku trefí i vlastního, nováček na 60 m trefí zřídka, mistr často; tažení po
  1 / 7 / 40 taktech přes JSON = vcelku, ztráty v mužích), `aim.test.ts` (kruh, plochy, šance
  u nováčka a hloučku, výběr podle ploch, jen vlastní v kruhu = nestřílí), `orders.test.ts` (za velitelem, obrana
  velitele, útočit na vše mimo dohled, držet místo ≤ 30 m, změna rozkazu na doslech),
  `defenders.test.ts` (skupiny domů, soupis, poslední muž rodu); přípravky `battle-fixtures.ts`.

## Přechod hradby v boji (hradby Ú9)

fortifications.md – Obrana bez násobku 1, 4, 5; Přechod hradby. Logika v `domain/war/ladders.ts`,
`battle.ts` jen volá. Čísla `FORTIFICATIONS.assault` (žebřík 4 mužohodiny, `climbSeconds`, únava)
a `FORTIFICATIONS.defense` (shození 1 : 3 / 1 : 2, pád 20, lezec × 0,5, žebříky 1 m od sebe);
dosah obránce na vrchol žebříku 2,5 m = `perDefenderM ÷ 2`.

- **Stav** – `FighterState` + `climb`; `Fighter.climb?: FighterClimb` (`ladder` – klíč žebříku
  nebo null, `phase` `make` / `carry` / `lean` / `up` / `over` / `down`, `ticks`, `fort`,
  `segment`, `at` – les nebo pata), `Fighter.ladder?` (nese vyrobený žebřík do opření),
  `Fighter.fatigue?: { factor, tick }`, `BattleState.ladders?: BattleLadder[]` (`key`
  `<opevnění>:<úsek>:<n>`, `foot` vně 1 m, `top` na čáře úseku, `inner` – pata druhého žebříku
  uvnitř palisády bez ochozu po přetažení, `climber`, `up`). `inFight` počítá i `climb` (cíl,
  výsledek boje, bod zlomu). Všechno volitelné – staré boje beze změny.
- **Volba postupu** – `approach`: stěna bez průchodu → `startCrossing(f, opevnění, úsek, volba,
hodiny prolomení)`; jinak prolamuje jako dosud. Úsek z `WallLine.segment`, druh z
  `crossingLayers` + `assaultSteps`. Plot → přelézt (`carry` k místu, `up` 8 taktů, 1 m za
  plot). Palisáda a hradba → žebřík: volný žebřík opevnění blíž než les vezme, jinak (bez nesení)
  jde k nejbližší buňce `MARCH_FOREST` a vyrábí `ladderMakeTicks` = ⌈4 ÷ hodin taktu⌉ = 58
  taktů; bez lesa prolamuje. Bez volby (i NPC) nejrychlejší: 4 h výroby + chůze les a zpět +
  takty přechodu proti hodinám nejlepšího místa a postupu s muži skupiny (`chooseSpot` – brána
  palisády 3 h → sekání; osamělý muž u palisády → žebřík, čtyři → oheň 12 h). Zevnitř ven se
  neleze. Přes napuštěný vodní příkop jen zasypaným kusem (`ClimbWorld.moatFilled`, vrchol
  žebříku do 2 m od středu pruhu – `FighterClimb.near`); dokud není, prolamuje – zasype.
- **Rozkaz hráče** (Martin 8. 11. 2026 – „ano“, volí hráč rozkazem skupině) – `GroupAssault`
  (`campaign-types.ts`: postupy bez `open` a `climb`) v `CampaignGroup.assault?` a
  `BattleGroup.assault?` (`campaign.ts` předá do boje); `setGroupAssault(stav, skupina, volba |
null)` v `orders.ts` – před bitvou kdykoli, v boji na doslech velitele jako `setGroupOrder`.
  `ladder` = žebříky i tam, kde je prolomení rychlejší; `cut`, `burn`, `dig`, `mine` = prolamuje
  tímto postupem, nabízí-li ho místo (plot při `cut` nepřeleze), jinak jako bez volby (Prolomení
  v boji). Rozhraní – Úloha 17.
- **Takt přechodu** – `climbStep`: `make` (do lesa, pak takty výroby), `carry` (místo
  `ladderSpot` – průmět na úsek, po metru na obě strany, nejméně 1 m od žebříků opevnění; žebřík
  se založí a nese), `lean` 8, `up` 16 / 20 / 24 (na nule nahoře na `top`), `over` 16 (jen
  palisáda bez ochozu a jen první – pak `inner`), `down` 16 / 8 / 12 → 1 m za hradbou (palisáda
  na `inner`), boj; s valem pod hradbou únava. Dokud vyrábí a nese, vrátí se do boje, má-li
  opevnění průchod; zablokovaný krok (neprůchodno) = zpět do boje.
- **Souboj u žebříku** – nahoře (`up` na nule) obránce do 2,5 m od vrcholu lezce nepustí: lezec
  mu dává rány (`aim`, los 1 : 1) silou `fighterStrength` = `strength × únava × 0,5`, každá rána
  obránce na lezce na žebříku (`onLadder` – `up`, `over`, `down` po vnitřním žebříku) padne bez
  losu. `defendLadder` v ranách: obránce do 2,5 m od vrcholu opřeného žebříku s lezcem ho místo
  rány shodí, je-li čekaný pád 20 ÷ 3 víc než jeho rána (vesničan 4 → shazuje, muž rodu 10 a víc
  → bije); prázdný žebřík shodí, když nemá na koho udeřit (návrh Clauda). Los `pushLadder`,
  pokus stojí ránu (2 s). Shozený lezec −20 (zásah na konci taktu), leží u paty a opírá znovu;
  z vnitřního žebříku padne dovnitř a druhý žebřík se musí přetáhnout znovu. `settleLadders`
  (po bodu zlomu a na konci taktu): kdo přestal lézt, pustí žebřík, z vrcholu leží u paty.
- **Únava po valu** – `rampartFatigueStep`: muž, který krokem sešel z buňky `MARCH_RAMPART`, má
  `rampartFatigue(v)` (výška z tempa buňky), po žebříku přes hradbu na valu taky; `fighterStrength`
  ji vrací lineárně za 120 taktů (`fatigueFactor`), `restFatigue` pak záznam smaže.
- **Testy** – `__tests__/ladders.test.ts` (palisáda: výroba 58, opřít 8, vylézt 16, přetáhnout
  16, slézt 16; ochoz bez druhého žebříku, dolů 8; plot 8 bez žebříku; nejrychlejší – palisáda
  žebřík, brána sekání; bez lesa prolamuje; rozkaz `cut` a `ladder`; lezec na půl síly a každá rána
  obránce padne; shození 1 : 3, pád −20 k patě; 1 m mezi žebříky; únava 0,85 → za 120 taktů
  zpět; bitva se žebříky po 1 / 7 / 40 přes JSON = vcelku); přípravky `fortOf`, `forestSouth`.

## Prolomení v boji – oheň, sekání, kopání, podkop, zasypání (hradby Ú14)

fortifications.md – Přechod hradby (Oheň, Podkop, S valem), Obrana bez násobku 1. Pravidla
z `assault.ts` (`crossingLayers`, `assaultSteps`, `assaultHours`, `mineUnderground`), boj v
`battle.ts`; `fortification/breach.ts`, `breachManHours` a `rampartAssaultPace` jsou pryč.

- **Místa** (`wallsOf`) – brána (1 m před vraty) a zeď (uprostřed úseku, u dílu s branou čtvrtina
  od kraje – `wallSpotSegment`); `Spot.steps` = postupy prolomení místa (`cut`, `burn`, `dig`,
  `mine`; žebřík jen jako `ladder` s `fill: 'moat'` – zasypat příkop pro žebříky).
- **Volba** (`chooseSpot(w, opevnění, odkud, volba skupiny, muži)`) – nejméně hodin
  (`assaultHours` s muži skupiny v boji, nejvýš 4; rozdělaný průlom – zbývajících, `breachHoursLeft`),
  pak nejblíž, pak klíč; nejvýš 4 prolamující na místo. Oheň jen s otepi: nejbližší buňka
  `MARCH_FOREST` (`nearestForestOf`, vzdálenost se pamatuje na mřížku a místo) nebo hromada klád vsi
  (`BattleField.fuel` – `campaign.ts` `fuelOf`, `logStacks` s kládami); keře zatím ne. Bez valu
  vyhraje oheň (12 h), s valem odkopání (20 h; oheň napřed zasypat val 20 h), bez otepí odkopání.
- **`BattleBreach`** – `method` (`cut` | `burn` | `dig` | `mine` | `ladder`), `phase` (`fill` →
  `fuel` → `burn` → `work` → `done`), `need` (mužohodiny fází: zasypat, otepi × max(1, vzdálenost ÷
  100 m), hoření × 2 přikládající, práce), `progress` (`done` a `required` = součet fází,
  `breached`), `moat?` (`MoatFill` – pruh zasypání). Fáze plyne z `progress.done` (`syncPhase`);
  `advanceBreach` – zasypat, otepi a práce nejvýš 4 muži, hoří nejvýš 2 přikládající (bez mužů
  oheň stojí); po zasypání vodního příkopu takt končí. Hotový `ladder` průlom nedělá. Průlom
  uložený dřív (bez `need`) se v taktu převede na sekání (`upgradeBreaches`).
- **Vodní příkop** – `moatStrip`: zasypávající stojí na prvním suchém bodu ven od hradby (po metru,
  nejvýš 40 m), pruh 4 m (`FORTIFICATIONS.breach.widthM`) sahá stejně daleko dovnitř. Po zasypání
  je voda v pruhu průchozí jako suchý příkop (`march-grid.ts` – `moatFillPace`, `rampartPace(1)`;
  mřížka se nemění, `Walls.fills` z `moatFills(b)`), muži přejdou k hradbě. Zamrzlý příkop
  (prosinec až únor) je suchý už v mřížce (`fortCells`) a v `crossingLayers` – bez zasypání.
  Žebříky jdou zasypaným pruhem (vrchol do 2 m od jeho středu).
- **Podkop** – po pětině práce (`mineUnderground`) má kopáč u místa `Fighter.underground` (nastaví
  `breachWorkStep` každý takt): `canAttack` ho vyloučí (nikdo na něj nemíří ani nebije), `poseOf`
  = `'underground'` (plocha 0). Zřícení = průlom 4 m.
- **Po boji** – `campaign.ts` `breachesOf`: `fortification-breach` nese `segments`, `burned?`
  (průlom ohněm) a `gatesBurned?` (vypálená brána). `applyFortificationBreach`: `burnedDay` (scéna
  – ohořelý průlom), vypálená brána smaže `towerDay` (věž shořela; klešťová zůstává). Přestavba
  a zboření dílu `burnedDay` smažou.
- **Testy** – `__tests__/breach.test.ts` (palisáda oheň 4 + 8 h, s valem napřed 20 h, brána 6 h,
  otepi ze 200 m 2×; volba oheň / odkopání / bez otepí; podkop roštové 120 h, pod zemí od 96
  mužohodin a lučištník je nezasáhne; vodní příkop v létě 12 h + 20 h, v lednu bez zasypání; věž
  shoří s branou; po kouscích 1 / 7 / 40 s ohněm, příkopem a podkopem = vcelku). `battle.test.ts`
  „palisáda mimo bránu ≈ 1 den“ a bitva se žebříky po kouscích (`ladders.test.ts`) si postup
  vynutí rozkazem – bez lesa je nejrychlejší odkopat, šest mužů by palisádu vypálilo.

## Obránci na hradbě (hradby Ú12)

fortifications.md – Obrana bez násobku 2, 3, 6; Střelba a viditelná plocha. Logika
v `domain/war/wall-defense.ts`, `battle.ts`, `stance.ts` a `defenders.ts` jen volají. Čísla
`FORTIFICATIONS.defense` (`perDefenderM` 5, `gateMen` 2, `postInsideM` 1, `throwM` 15,
`throwSeconds` 4, `footStoneM` 3, `walkwayPace` 0,5).

- **Stav** – `Defender.post?` / `Fighter.post?` (stanoviště na hradbě, nebo záloha ve středu
  opevnění; chybí = obránce domu) a `onWall?` (stojí na ochozu či koruně – `true`, jinak chybí);
  `openBattle` je převezme. Staré boje beze změny.
- **Rozestavění** – `planDefense`: muži v útočišti (bez vzdaných) dostanou `wallPosts([opevnění],
počet, den)` po řadě podle id: napřed věže nad branami po 4, pak brány po 2 (± ¼ šířky
  brány od středu; u klešťové brány ramena jeden na 5 m – Brány v bitvě), zbytek po obvodu podle
  délky – mezi branami v mezerách podle délky mezery (brány jsou kotvy), bez bran rovnoměrně; nejvýš ⌊obvod ÷ 5⌋ mimo brány, kdo nedostane, je záloha ve středu. Obvod =
  stěny bitvy (čáry úseků a tětivy rohů); stanoviště 1 m za čarou hradby; `onWall` =
  `crownAt` (do 1,25 m od čáry hradby s korunou – `walkway`, `crib`, `chamber`; druh v místě
  `wallKindAt` přes kusy dílu s branou). 300 m se 2 branami a 20 muži: 4 u bran, 16 po ≈ obvod ÷ 18 (≈ 16 m).
- **Obsazení** – `occupied(opevnění, místo, bojovníci)`: obránce na nohou do 2,5 m, který nestojí
  víc než 0,5 m před čarou hradby. Neobsazeným místem lezec vyleze bez boje (`guardOf` v `ladders.ts`).
- **Plán obránce se stanovištěm** – `defenderPlan(f, ctx, wall)` → `wallDefenderPlan`: (1) útočník
  ve stavu `fight` uvnitř obvodu (`withinWalls`), bez stěny mezi, v dohledu, do 40 m od stanoviště
  nebo útočí na něj – boj jako u domů (vodítko 40 m od stanoviště), a nedosáhne-li odsud, sleze
  z ochozu; (2) rána zblízka přes hradbu (lezec, muž u paty); (3) posila (`reinforceTarget`) – na
  místě nebo cestou; kdo posilou není a na opevnění dopadají šípy, je v krytu (`cover`) a na
  ochozu nestřílí ani nehází; (4) na místě střela či hod odsud; (5) zpět na stanoviště. Probíjení
  opevnění má přednost (`breakoutPlan`). `walkTo`: podél
  hradby (střed cesty do 2 m od čáry) zůstane na ochozu polovičním tempem (`stepToward` × 0,5), přes
  nádvoří sleze a jde po zemi plným; na místě s korunou na ochoz vystoupí.
- **Posily** – `reinforceTarget(f, w)` čte přidělení taktu (`assign`, jednou za takt v `WallWorld`):
  místa = žebříky s lezcem ve fázi `lean` / `up` / `over` / `down` (1 útočník) a rozdělané průlomy
  s prolamujícími (`breachAt`), v pořadí stavu; na místě zůstanou obránci, kteří tam jsou (nejvýš
  počet útočníků), chybějící doplní nejbližší volní obránci téhož opevnění (nejbližší střed) podle
  času cesty – volný = se stanovištěm, neřízený, ne u žádného místa, nebojuje zblízka (`aim` do 3 m).
  Stanoviště posily = 1 m za čarou hradby u místa.
- **Rány přes hradbu** – `battle.ts` `strikeOf(f, t, w)`: druh podle vzdálenosti `strikeReach`
  (zblízka 3 m; luk 20–60 m, kdo má luk; z ochozu hod do 15 m – i muž rodu pod 20 m, návrh Clauda),
  pak každá stěna na úsečce mezi nimi (`crosses`, druh `lineWall` – `WallLine.along` přes
  `wallKindAt`, jednou za takt) musí ránu pustit: `canStrikeAcross(hradba, od, na, melee | ranged)`
  – bez hradby a plot ano, palisáda bez ochozu ne, hradba s korunou z ochozu dolů zblízka do 3 m
  a ven na dálku, zespodu jen na dálku na obránce na ochozu (`parapet`), jinak ne. Lezec nahoře na
  hradbě (`onWallTop` – na vrcholu žebříku) za hradbou není. Hod: `bowShot` s dovedností 20,
  poloviční zásah, cooldown `throwSeconds`; kámen k patě je rána zblízka (plný zásah, los 1 : 1).
  Rána přes hradbu (`across`) dá obránci na ochozu pózu `parapet`. Útočník, který na cíl nedosáhne,
  jde k němu (`approach` – průchod, žebřík, prolomení).
- **Testy** – `__tests__/wall-defense.test.ts` (300 m obvodu a 20 mužů, strop 1 na 5 m, koruna
  podle druhu, obsazení, lezec neobsazeným úsekem bez boje, posila k žebříku po ochozu ½ tempa
  a za palisádou plným, přes nádvoří po zemi, za útočníkem uvnitř sleze a zase vystoupí, tabulka přes hradbu, hod a kameny, předprseň 0,25,
  luk z ochozu ano a přes palisádu ne, kameny na prolamujícího, Review Focus 5, bitva po 1 / 7 / 40
  přes JSON = vcelku); `battle.test.ts` – obránce za palisádou šípem ne, na ochozu poloviční zásah;
  `stance.test.ts` – muži v útočišti obsadí hradbu.

## Kryt pod palbou, bod zlomu za hradbou a probíjení (9. 11. 2026)

fortifications.md – Obrana bez násobku 3 (Kryt pod palbou a bod zlomu jen v útoku; Bod zlomu
a probíjení). Logika v `domain/war/rout.ts`, plán obránce ve `wall-defense.ts`, takt v `battle.ts`.
Čísla `FORTIFICATIONS.defense.coverSeconds` (30 s), `WAR.combat.aim.visibleM2.cover` (0,025 –
los 1 : 10 proti předprsni), `WAR.rout` (útěk od 50 zdraví, matky dětí do 7 let, staří od 60),
`WAR.breakout` (30 % ztrát, brána do 30 m, slabě hlídaná = nejvýš ½ útočníků proti probíjejícím,
shromáždění do 6 m nejvýš 60 s).

- **Stav** (vše volitelné, staré boje beze změny): `Fighter.cover` (v krytu – plán ho nastaví každý
  takt), `shotDown` (srazilo ho ostřelování přes hradbu mimo místo útoku), `surrendered` (vzdal se –
  stav `fled`); `BattleState.underFire` (opevnění → takt posledního šípu přes hradbu na jeho
  obránce), `openedGates` (otevřeli obránci – nezavřou se), `routed`, `breakouts`
  (`BattleBreakout` – opevnění, úsek brány, les `to`, takt, `gathered`), `taken` (dobytá útočiště);
  `ShelterReport.refugeAt` (opevnění každého z `refuge`).
- **Kryt pod palbou** – výstřel útočníka přes hradbu (`strike.across`) na obránce se stanovištěm
  zapíše `underFire[opevnění]`; `wallDefenderPlan`: obránce bez posily (`reinforceTarget` null) je
  do 30 s po posledním šípu v krytu – na ochozu a koruně nestřílí ani nehází (`poseOf` → `cover`).
  Kdo jde k žebříku či průlomu nebo ho brání, nebo bojuje s útočníkem uvnitř či zblízka, kryt nemá.
- **Bod zlomu jen v útoku** – zásahy taktu se značí: šíp či hod přes hradbu na obránce se
  stanovištěm bez posily (`fromAfar`) je ostřelování; kdo padne jen od takových zásahů, má
  `shotDown`. `breakpoints`: skupiny domů bez obránců se stanovištěm; `fortBreakpoints` – obránci
  opevnění (stanoviště podle `fortOfPost`) = jeden celek, `assaultLossShare` = padlí a ranění bez
  `shotDown` ÷ všichni.
- **Chaos** (`routFort` při 45 %) – `routed`, brány opevnění se otevřou (`openGates`), probíjení
  končí; pod 50 zdraví `surrender`, jinak `startFlee`. `fleeStep`: obránce se stanovištěm jde
  `openingRoute` (nejbližší průchod, body před a za ním), bez průchodu nebo zaseknutý na cestě
  `cutOff` (vzdá se; poslední muž rodu bojuje dál).
- **Probíjení** – `orderBreakout(stav, bojiště, opevnění, úsek)` otevře bránu a zapíše
  `BattleBreakout`; veřejně `orderDefenderBreakout(stav, bojiště, opevnění, úsek?)`. Brána
  `breakoutGate` – nejméně útočníků do 30 m; velitel obrany (`fortBreakpoints`, při 30 % ztrát
  v útoku, jednou na opevnění) jen volnou či slabě hlídanou (nejvýš ½ proti probíjejícím), rozkaz
  hráče (`weakOnly` false) i hlídanou (návrh Clauda – hráč rozkáže sám). Hráč obránců: záměr tažení
  `{ kind: 'breakout', fort, segment? }` (`campaign-types.ts`) zapíše `BattleState.breakoutOrder`,
  takt ho na začátku provede (před bodem zlomu). `stepCampaign` z cizích záměrů přijme jen
  `breakout` (a ten nikdy od vůdce tažení). `breakoutStep` (před stěnami
  taktu): `gathered`, když jsou všichni na nohou do 6 m od brány nebo uplynulo 60 s; kdo je venku
  u lesa (bez lesa hned venku), je `fled`. `breakoutPlan`: z ochozu dolů, útočníka do 3 m bije,
  jinak k bodu uvnitř průchodu (`WallWorld.exits`), po vyražení po ose průchodu ven a do lesa.
- **Dobytí útočiště** – `refugeForts` (opevnění s obránci se stanovištěm nebo s lidmi
  v útočišti), `markTaken` po ranách (útočník ve stavu `fight` uvnitř obvodu – `withinWalls`).
  Výsledek `attackers` až bez obránců a s dobytými útočišti; mezitím jdou neřízení útočníci
  (kromě „držet místo“) dovnitř (`enterRefuge` – k průchodu kolem hradby `leadTo`, jím dovnitř;
  bez průchodu přes hradbu). NPC velitel (`npc-commander.ts` – `emptyRefuge`): nedobyté útočiště
  bez obránců s nejrychlejším postupem nad 1 herní den → `plunder`. `fortPassages` bere otevřené
  brány jako průchod.
- **Po boji** (`campaign.ts` – `raidResultOf`): útočiště dobyté = `taken` neprázdné (dřív stačilo,
  že někdo z útočiště bojoval); vzdaní z boje a lidé dobytého útočiště podle `refugeRout`
  (`rout.ts`) se odvedou jako vzdaní.
- **Rozkaz hráče „Probít se“** (`application/order-breakout.ts` – `orderBreakout(deps, { playerId,
villageId, today, nowMs })`): právo `war` ověří use-case sám (`requireRight` – správce cizí vsi ho
  nemá), bez zámku vsi (stav vsi se nemění, rozkaz v boji nečeká na dopočet – návrh Clauda). Najde
  cizí tažení s bojem u vsi (`activeAgainst`, fáze `raiding`, cíl na mapě sídla), opevnění bojiště
  (`battleForts` z mapy `cells.mapOf` a opevnění vsi) a komu rozkázat (`breakoutChoice` v `rout.ts`:
  opevnění s branou před bodem zlomu, bez probíjení a bez čekajícího `breakoutOrder`, s obránci na
  nohou – víc takových: nejvíc obránců; jinak `BreakoutBlock` `over` | `undefended` | `routed` |
  `underway`). Zapíše záměr `breakout` na takt teď + 2 (`queueCampaignIntent`); bránu vybere takt.
  Důvody česky v `BREAKOUT_BLOCKED` (+ `BREAKOUT_NO_GATE`) – jediné místo textů i pro tlačítko.
  Web: server action `orderBreakout({ villageId })` → `orderBreakoutForPlayer` (`lib/war-scene.ts`),
  tlačítko web-ui.md – Rozkaz „Probít se“.
- **Ve scéně** – `WarSceneFighter` nese `cover` a `surrendered` (cizí jen v dohledu jako ostatní);
  `WarSceneView.breakout { blocked }` jen obránci s opevněním s branou při boji (`breakoutChoice`
  nad `input.forts`; rozhodnutý dnes = `over`). Scéna (`army.ts`): kryjící se na ochozu stojící na
  místě je skrčený (`fighterClip` → `weed`, podřep bez zbraně – klip vsi, žádný nový vertex buffer),
  vzdaný (`fled` + `surrendered`) zůstane stát, kde se vzdal (na ochozu ve výšce ochozu), klipem
  `idle` (ruce dolů, bez zbraně), neotáčí se (`surrenderedFigure`); utečený dál zmizí.
- **Testy** – `__tests__/wall-cover.test.ts` (půl hodiny ostřelování 12 obránců šesti lučištníky –
  kryt, bez bodu zlomu, padlí jen `shotDown`, pod 60 zásahů; padlí ostřelováním do bodu zlomu
  nejdou; po žebříku obránce u vrcholu bez krytu, jinde kryt; chaos – brána otevřená, raněný se
  vzdá, zdraví utečou branou; útočiště dobyté až s útočníkem uvnitř; bez brány odříznutí; po
  kouscích přes JSON = vcelku; probíjení velitelem při 30 % volnou branou do lesa, hlídanou ne,
  rozkaz s branou a před bodem zlomu, záměr hráče přes `breakoutOrder`, rozkaz hráče i hlídanou
  branou, `breakoutChoice` a důvody; `refugeRout`); `npc-commander.test.ts` – záměr `breakout` od
  obránce tažení provede, od vůdce ne; `scene-view.test.ts` – kryt, vzdaní, `breakout` a mlha;
  `application/__tests__/order-breakout.test.ts` – záměr na takt + 2, cizí hráč, důvody. Nájezd na
  palisádu s ochozem (`palisade-walkway-raid.test.ts`) dál končí žebříky a útočníkem uvnitř;
  `npc-commander.test.ts` – NPC velitel na palisádu s ochozem a bránou: proseknutí, bod zlomu
  v útoku, útočiště dobyté s útočníkem uvnitř.

## Hradba na koruně valu (9. 11. 2026)

fortifications.md – Hradby a obrana, Druhy – Pás s valem (Martin 9. 11. 2026: „Pokud se jedná
o palisádu nebo polský plot, má stát na koruně valu“). Čísla `FORTIFICATIONS.defense.crest`
a `assault.climbSeconds.upRampart`; testy `__tests__/rampart-crest.test.ts`.

- **Čára hradby** – `wallLineInM(opevnění)` (`fortification/band.ts`): val na křivce (opevnění
  druhu `rampart`) 7 m od křivky (`rampartBand.ditchM` + `footM` ÷ 2), jinak 0 (val vně má korunu
  na křivce). `battleForts` posune úseky na čáru hradby (`onWallLine` – body `bandLine` na ose
  ohybu, nejmenší ohyb valu 8 m se nepřehne) a brány v kopii opevnění bojiště poměrně s délkou
  úseku (`offsetM × nová ÷ stará tětiva`) – stěny, stanoviště, žebříky (vrchol na koruně, pata 1 m
  vně na vnějším svahu), místa prolomení, klešťová brána i scéna boje (`battleWallsOf` – lezci
  a obránci zvednutí o val stojí na koruně) tak berou korunu. Klešťová brána: `endM` = pás − čára
  hradby + ulička (`battlePincers`).
- **Obránce na koruně** – `crestAt(opevnění, bod)`: do 1,25 m za čarou hradby (ne víc než
  0,5 m před ní) dílu s hotovým nezbořeným valem (`segmentRampart`), mimo průchod brány valem
  (½ šířky brány od středu); mezipaměť na objekt polohy (`WeakMap` – poloha se nemění na místě).
  `towerReach` – obránce na koruně dohled `sight.openM` + 25 m a luk `bowMaxM` + 5 m (věž má
  přednost); `reachOf` přidá dohoz – z ochozu na koruně `throwM` + 2 m (`strikeReach(…, bowMaxM,
throwM)`). `ctx.sees` v taktu – z věže `tower.sightM`, z koruny `openM + crest.sightM` (jen
  když bojiště val má).
- **Útočník přes val** – `fortCells` vrátí i `crest` (buňky dílů se stojící hradbou na hotovém
  valu); `marchGrid` jim k `MARCH_WALL` přidá `MARCH_RAMPART` (tempo 0 – pochod neprojde, jen
  branou). V boji `paceAt(…, útočník)`: buňka stěny s valem → útočník `rampartPace(1)` (¼, plnou
  výškou – mřížka nese u stěny jen příznak), obránce plné tempo; `rampartFatigueStep` po sestupu
  z takové buňky unaví jen útočníka. Žebřík: `climbTicks(druh, výška valu)` – `up` + `upRampart`
  (2 s) × výška (`ladders.ts` – `climbTotal`, `climbStep`; plot beze změny – na val se vyleze
  chůzí). NPC odhad hodin (`npc-assault.ts` – `climbHours`) val nepočítá (2 s proti hodinám
  výroby nehrají roli).

## Brány v bitvě – ulička a věž (hradby Ú19)

fortifications.md – Hradby a obrana, Brány. Geometrie a obránci ve `wall-defense.ts`, stěny
a místo prolomení v `battle.ts` (`wallsOf`), pochod v `march-grid.ts`. Čísla
`FORTIFICATIONS.pincerGate` a `FORTIFICATIONS.tower` (4 obránci, dohled 250 m, luk 80 m).

- **Klešťová brána na bojišti** – `battlePincers(bf, den)` (`BattlePincer`, mezipaměť na opevnění
  a den): stojící klešťová brána (`gatePincerStands`) na dílu, který stojí nebo je prolomený
  (`pincerBandInM`); osa na čáře úseku (bitva bere úsek jako úsečku), dovnitř `-outward`, vrata
  `endM` = vnitřní okraj pásu + 12 m, druh ramen `pincerArmKind`, `tower` = `gateTowerStands`.
  `pincerPoint(p, podél, dovnitř)` – bod v ose brány.
- **Stěny** (`wallsOf`, `WallLine.pincer`) – ramena jako dvě úsečky po stranách uličky od čáry
  hradby po vrata (druh ramen předem – rány přes ně podle `canStrikeAcross` jako přes ochoz); stojí
  i na prolomeném dílu (návrh Clauda – vlastní stěny s ochozem; zbořený díl je vezme). Ústí uličky
  v hradbě je vždy otevřené; zavřená vrata jsou úsečka přes uličku na jejím vnitřním konci,
  otevřenými vede průchod od 3 m před branou po 3 m za vraty. Prolomený díl (i vrata) – mezera
  jako dosud. Ramena ani vrata se nepřelézají: `approach` hledá žebřík jen přes hradbu na cestě
  (`firstWall(…, climbable)`), jinak prolamuje.
- **Vrata** – místo `gate` 1 m před vraty v uličce; `Spot.maxMen` = `pincerGate.maxMen` (4) –
  víc prolamujících se k vratům nevejde (`chooseSpot`).
- **Obránci** – `wallPosts(opevnění, muži, den)`: napřed věže (`towerPosts` – 4 rovnoměrně přes
  uličku 1 m za vraty), pak brány; klešťová brána místo 2 v hradbě ramena – na každém jeden na
  5 m ochozu jako na hradbě (⌊`endM` ÷ 5⌋, nejméně 1; Martin 9. 11. 2026: „Ramena jsou součástí
  brány. Obránce jak říkáš“), rovnoměrně po délce ramene 1 m od uličky, po dvojicích (levé, pravé)
  od středu uličky za pásem – odtud zasahují útočníky v uličce z obou stran (hod do 15 m, luk). `planDefense` (`stance.ts`) dá na věž napřed muže rodu (jen když věž stojí – jinak
  pořadí beze změny). `crownAt` – rameno i plošina věže jsou ochoz (`onWall`). Posila k vratům
  (`placeAt`): s věží na ni, bez věže na rameno vedle vrat.
- **Věž** – `towerReach(f, {forts, day})`: obránce na ochozu věže (`towerAt`) vidí
  `tower.sightM` a dostřelí `tower.bowMaxM`, jinak `WAR.sight.openM` a `WAR.combat.bowMaxM`.
  `strikeReach(f, t, bowMaxM)` a `inSight(grid, od, kam, openM)` mají dosah parametrem; `battleTick`
  dá věži dohled podle polohy (`towerAt` – kdo stojí na plošině věže), luk v `strikeOf`. Kryt na věži
  jako ochoz (`poseOf` – `parapet`). Vypálená brána v boji vezme věž hned (`breachedForts` smaže
  `towerDay` v kopii opevnění taktu; po boji `raid-apply.ts`).
- **Pochod** – `fortCells` přidá ramena (`fortPincerArms`) ke stěnám vždy – i u zavřené brány
  (dřív je `fortWalls` bez zavřených bran vynechal) a u prolomeného dílu; ulička průchozí jen
  u otevřené brány.
- **Testy** – `__tests__/gate-battle.test.ts` (ulička 13,5 m u palisády; k vratům nejvýš 4 a místo
  u vrat; obránci na obou ramenech zasahují útočníka v uličce; věž 4 obránci napřed; z věže luk na
  75 m ano, bez věže ne; věž vidí na 200 m; pochod – ramena blokují u zavřené brány; prolomený díl
  ramena nechá, zbořený ne; bitva s věží po 1 / 7 / 40 přes JSON = vcelku).

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
     `gateCloseTick`), `refugeAdmit` rozhodne, kdo se vejde. Muži uvnitř obsadí hradbu
     (`wallPosts` – [Obránci na hradbě](#obránci-na-hradbě-hradby-ú12)), zbytek je záloha ve středu,
     ženy a starší nebojují. Postoj `surrender`: skupina uvnitř se nevzdá, dokud žádný útočník
     v dohledu nestojí uvnitř obvodu (`attackerInsideFort` – `fortsContaining`); pak
     `fortSurrenders` = přesila 1,5× jako u domů (`isOverpowered`);
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
  (`killed`); drží-li útočníci bojiště, i odvedení – vzdaní (`yieldedOf`: `ShelterReport.surrendered`,
  obránci s `Fighter.surrendered` a lidé dobytého útočiště, kteří neutekli – `refugeRout`) podle
  `CampaignState.surrendered` (výchozí `lead`; `kill` = padlí; muže rodu a šlechtice zajme Ú6.11,
  zatím zůstanou) – a kořist `raidLoot`:
  - jídlo ze zásob (obilí, luštěniny, maso, sýr) do nosnosti `lootCapacity` – 25 kg na muže na
    nohou (`WAR.carryKg.man`, raněný nenese) minus zbylé jídlo tažení; po druzích ve stejném poměru;
  - zůstane: odnesené do lesa (`fleeParty` lesních), do útočiště, které útočník nedobyl (dobyté =
    útočník stál uvnitř obvodu – `BattleState.taken`, 9. 11. 2026), osivo `reservedSeedKg`
    a zapečetěné jámy, které útočník
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
  propustit / popravit; poprava druhým stiskem), formulář výkupného: `TermsContext.captives` (zajatci vsi z
  `VillageManor.prisoners`, jen rodu protistrany – `houseId` doplní `viewOf` ve `lib/village.ts` z vsi původu), v `TermsForm` řádek `RansomRow` (výběr zajatců, cena jako zboží) a v `HousePanel`
  tlačítko `house-ransom` (směr `ransom`; zda zajatec patří protistraně, ověří server), ikony `public/icons/war/{captive,hold,release,execute}.svg`.
- Nevykonáno (později): zajetí **útočníků** obráncem (raněné na bojišti), zajatý hráčův muž nevede tažení díky `away` (`launch-campaign`).
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
  kteréhokoli útočníka) poměří součtem sil obránců (bez násobku – 8. 11. 2026); nejslabší napadne
  (`strike` na nejbližšího jejího muže), má-li vojsko aspoň 1,5 × její sílu, jinak se obrátí
  (`turn-back { reason: 'order' }`). Stojí-li všichni obránci uvnitř obvodu opevnění, ve kterém
  velitel není (`behindWalls` – `fortsContaining` nad opevněním bojiště), napadne jen se silou
  a postupem přes hradbu nejvýš `WAR.npc.maxAssaultHours` (24 h – NPC velitel u hradby níž),
  jinak `plunder` (boj `attackers` + `BattleState.plundered` → `raidResultOf` bere útočiště za
  nedobyté – kořist jen zvenku). Nevidí-li nikoho, jde k nejbližšímu obránci (`march`).
  `npcIntents(state, world, field)` – `field` je bojiště nájezdu (`battleFieldOf` v `campaign.ts`);
  bez něj (testy) velitel o hradbě neví.
- **NPC velitel u hradby (hradby Ú20)** – `domain/war/npc-assault.ts`, `fastestApproach(field, b,
men, from)` → `{ fort, segment, at, method, hours }` | null. Mezery, průlomy boje a nejrychlejší
  místo prolomení každého opevnění bere z boje – `fortPassages` v `battle.ts` (stejné `wallsOf`
  a `chooseSpot` jako takt, brány zavřené, `min(4, muži)`, oheň jen s otepi z lesa či dříví vsi;
  `Opening.segment`; u vrat klešťové brány nejvýš `maxMen` a velitel stojí před ústím uličky –
  k vratům dojdou muži v boji sami), žebřík přes vodní příkop z nich vynechá. Sám odhadne přelézt plot (`climb`)
  a žebříky jen na neobsazeném místě (`occupied` v bodě i ±0,5 m – ne škvíra mezi obránci 5 m od
  sebe; mimo vrata a u klešťové brány mimo ramena – uličku 2 m + rameno 5,5 m + 1 m od
  středu brány, i na sousedním úseku; 1 m od stojících žebříků): volný žebřík opevnění jen výstup, nový = výroba 4 h
  - do nejbližšího lesa (od středu úseku, `nearestForestOf`, mezipaměť na mřížku a tvar) a zpět
  - výstup (`climbTicks`), zasypání příkopu `assaultHours` bez výroby. Vybere nejmenší
    `hours + cesta od from` (3,5 m/s; při shodě první v pořadí); `hours` je jen postup.
    `approachStep(field, from, way)` – další bod cesty velitele: do 5 m od místa rovnou k němu, jinak
    k bodu 4 m dál od středu opevnění (ať nejde těsně podél hradby a nestojí na její čáře – tam by
    ho `fortsContaining` měl za uvnitř) přes `leadTo`: vede-li přímka přes obvod (úseky i tětivy
    rohů, blokuje vše), napřed radiálně ven na kruh obchůzky (nejvzdálenější roh + 5 m), pak po
    kruhu (půlením k nejdelší tětivě bez hradby) – boj sám kolem hradby nechodí (`stepToward` jen
    klouže podél stěny a na rohu uvízne). `raidIntents`: u místa (do 3 m) `strike` na nejbližšího
    obránce nejslabší skupiny (u hradby muži volí postup místa sami – `startCrossing`,
    `chooseSpot`), jinak `march` na `approachStep` (nový bod, až se posune o víc než 3 m).
    `insideOrders` (před záměry velitele, i když drží napadeného): stojí-li obránci uvnitř obvodu
    a průchod je otevřený (`passageOpen` – lezec nahoře: `over` / `down` / vrchol žebříku, útočník
    uvnitř obvodu, nebo mezera či průlom z `fortPassages`), pošle skupiny, které ho slyší
    (`orderHeard`) a nemají „útočit na vše“, dovnitř – `set-order` `attack-all`; velitel sám
    (lučištník) smí zůstat u průchodu (návrh Clauda). Testy:
    `war/__tests__/npc-assault.test.ts` (palisáda se 6 obránci → žebříky na neobsazeném místě, bez
    lesa s dřívím vsi oheň 12 h a bez otepí odkopání 20 h, plně obsazená roštová → podkop 120 h →
    `plunder`, mezera po průlomu, obchůzka hradby, obrat, „držet místo“ za palisádu nejde, lučištník
    na ochoz střílí), `npc-commander.test.ts` (silnější vojsko u palisády obejde hradbu k bráně,
    prosekne ji, skupina jde dovnitř a bitvu vyhraje; po kouscích 1 / 7 / 100).
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
  Bez odpovědi do 30 herních dní pošle muže správce – `answerAbsentSummons` (úloha světa před
  `lapseSummons`; `vassalage.md` – Správce za nepřítomného hráče).
- **Ochrana pánem** – `application/protection.ts`: `requestProtection(deps, { playerId,
vassalageId, villageId, message, today })` (vazal, vlastní ves – upozornění
  `protection-requested` pánovi), `sendProtection(deps, { playerId, vassalageId, villageId, men,
today })` (pán, jen muži rodu schopní služby z vlastních vsí, do vsi vazala – `sendMen` druhu
  `protection` do odvolání: doma `away` bez `untilDay`, host do konce světa; `protection-sent`),
  `recallProtection(deps, { playerId, vassalageId, villageId, today })` – schránka chráněné vsi
  `guests-leave` (dnes, `dismissGuests`), domovské vsi `away-ends` (`endAway` – návrat za 2 dny na
  políčko); `protection-recalled`. Odkaz `protectionRef` = `protection:<dohoda>:<ves>`.
- **Hosté z ochrany a ze svolání v boji** – `campaignBattle` → `guardGuestsOf`: hosté cílové vsi
  druhu `protection` i `service` (svolání; `CampaignGuard.kind = 'service'`, `guests-leave` se pošle
  zvlášť pro každý druh; muž, který odešel s tažením, má `away.kind = 'campaign'` a nebrání), jejichž osoba (stav domovské vsi ke dni `d − 1` přes `villageAt`, jinak
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
  vybraní / domluvení, hodiny s dny, vzkaz, roh Odeslat). Ikona `house/horn.png`.
- **Testy** – `application/__tests__/summons.test.ts` (jen muži rodu, nejzdatnější první, víc svolání
  do vyčerpání dnů, vazal vazala do služby B, míň = neplnění, propadnutí s koncem války – kronika
  a neplnění jednou), `passage.test.ts` (ohlášení, neškodné na ohlášené mapě, „Nevěřit“, jedna
  odpověď, útok = přepadení a zrušení), `db/adapters/__tests__/passage-repository.db.test.ts`
  (souběh tří odpovědí – projde jedna, zrušení v obou směrech, odpověď dialogu v těle jednou),
  e2e `multiplayer.spec.ts` („svolání: …“, „ochrana: …“), `domain/war/__tests__/guard-campaign.test.ts`
  (hosté „bránit se“ / „vzdát se“, ztráty domů, po kouscích = vcelku, padlý host = nástupnictví),
  `summons.test.ts` (NPC vazal přesně), `launch-campaign.test.ts` (přepadení přes rozsudek).

## Živé vedení a pohled na tažení (Ú6.14)

- **Mlha války** (`domain/war/sight.ts`): `inSight(grid, z, na)` – dohled `WAR.sight` 150 m, stojí-li
  kterýkoli z dvojice v lese (`MARCH_FOREST` mřížky pochodu) 50 m; bez mřížky lesní dohled (raději
  skryje víc). Bere ho i boj (`battle.ts` – `sees`). `discoverBuildings` přidá k `discovered` domy
  cílové vsi, na které dohlédne kterýkoli muž; `stepCampaign` ho volá v každém taktu nájezdu
  (`raidTick` → `discover`, muži útoku ve stavu `fight` / `breach`) – objevené zůstane.
- **Pohled** (`domain/war/view.ts` – `campaignView`, typy `CampaignView*`): vlastní muži celí (zdraví,
  raněný, velitel, zástupce, stav v boji), muži vazalů ve službě jen poloha (`allies`), obránci jen
  v dohledu vlastních mužů na nohou na mapě cíle (`foreign`), domy jen objevené (`discovered` – id,
  druh, poloha); nic dalšího o cizí vsi. `fresh` = stav je novější než `sinceTick` dotazu.
  `leadsLive` = hráč je vůdce, velí jeho muž a ten stojí na nohou (padlý, zajatý, dezertér = ne);
  hráč bez vůdcovství i bez vlastního muže dostane null.
- **Use-casy** (`application/campaign-view.ts`): `campaignViewFor(deps, { playerId, campaignId,
sinceTick })` – kontrolní bod z úložiště, mřížka mapy cíle jen při boji (mezipaměť `grids`, klíč
  `tažení@den`), domy cílové vsi jen s něčím objeveným. `commandCampaign` – pokyn
  (`CampaignCommand`: `lead` s cílem `place` / `building` / `fighter` / `home`, `order`,
  `surrendered`, `presence`) → záměr na takt teď + 2 (`queueCampaignIntent`). Odmítne (`false`, bez
  důvodu): hráč, který živě nevede (vazal, cizí hráč, velí jiný muž, padlý či zajatý velitel), místo
  mimo mapu nebo dál než sousední políčko velitele (kromě mapy cíle), neobjevený dům, cizí muž mimo
  dohled nebo ležící, neznámá skupina. Přítomnost smí poslat jen vůdce živého tažení.
- **Seznam v panelu Vojsko** (`campaignsOf` → `CampaignSummary` s `leads`; Úloha 6.17, návrh
  Clauda v mezích specu – vlastní muže hráč vidí vždy): běžící tažení, která hráč vede, i ta, ve
  kterých jdou jeho muži jako vazala ve službě. Vazal tažení otevře a sleduje svými muži (pohled
  výš), vést smí jen vůdce (`liveCommand` jen u vůdce, tlačítko nese `data-leads`).
- **Úložiště:** `CampaignRepository.activeOf(playerId)` – běžící tažení vůdce nebo s muži hráče
  (`state->'members' @> [{ playerId }]` v kontrolním bodu).
- **Cizí mapa** (`apps/web/lib/foreign-map.ts`): krajina políčka (veřejná – prázdné z
  `cellLandscapeSeed`, se vsí z uloženého seedu sídla přes `createCampaignCells`) jako
  `LandscapeTransfer`; vrstvu překážek si prohlížeč vygeneruje ze seedu vrstvy. Jen pro účastníka
  a jen mapu cíle, políčko vlastního muže a jeho sousedy; stavby nese jen `CampaignView.discovered`.
- **Testy:** `application/__tests__/campaign-view.test.ts` (Review Focus 4 – cizí muž, mrtvý
  a zajatý velitel, neobjevený dům, obránce skrytý v lese, cizí hráč = null),
  `domain/war/__tests__/sight.test.ts`, `raid-campaign.test.ts` (objevený dům), e2e
  `multiplayer.spec.ts` („živé vedení: …“ – tažení zapsané přímo do DB, worker vedle).

## Ve scéně – napojení na hru

Scéna vojska (scene.md – Vojsko, boj a mlha války) kreslí válku i ve hře, ne jen v ukázce Bitva.
Scéna hry ukazuje **mapu sídla hráče** – vojsko je v ní vidět, když na ní stojí.

- **Pohled** (`domain/war/scene-view.ts` – `warSceneView(state, { cell, side, grid, eyes, forts })`,
  typy `WarScene*`): co strana `side` vidí z tažení na mapě `cell`. Vlastní strana celá (útočník =
  celé vojsko tažení i s muži vazalů), druhá jen v dohledu (`inSight`) vlastních bojovníků na
  nohou a očí `eyes` – u obránce domy vsi (návrh Clauda: ves vidí i tehdy, když lidé utekli do
  lesa). Bojovník jen se vším, co scéna kreslí (`WarSceneFighter` – bez `ref`, síly, cílů a tras);
  zdraví jen vlastní strana, cizí muž nese hrubý stav (`state`, `killed`) a počet zásahů `hits`
  (`Fighter.hits` – přičte `takeHit`; scéna podle něj pozná ránu – `strikesOf`); cizímu se domov
  nahradí polohou a cíl (`aim`, `climber`) mimo dohled se smaže. Průlomy
  a žebříky obránce vidí v dohledu, zavřené brány a hradby všichni (stavba, ne vojsko). Boj jen na
  mapě cíle (`shownBattle`): běžící celý; **rozhodnutý do konce dne rozhodnutí** (`raidDay = day`)
  jen padlí a ranění (`down`, bez skupin) vedle pochodu – padlí leží, ranění sedí u domů (vlastní
  strana nese domov), druhá strana jen v dohledu; další den zmizí (bez nového stavu). Jinak pochod
  – skupiny na mapě a jejich aktivní muži se směrem chůze (`heading`). Hradby bojiště počítá
  `battleWallsOf` (web `battleWalls` ji volá).
- **Odehnané stádo** (`WarSceneMarch.herd { group, count }`): kořist `CampaignLoot.herd` jde se
  skupinou s nejmenším id, ve které je muž na nohou (návrh Clauda – kořist nese vojsko jako celek);
  pošle se jen s tou skupinou – obránce ho tak vidí jen v dohledu jako ostatní cizí, útočník vždy.
- **Útěk vsi do lesa** (`WarSceneView.flight` – `WarSceneFlight`; jen obránce na mapě své vsi, vedle
  boje či pochodu): kdo utekl (`ShelterReport.forest`) – dům, postava, dítě, nese zásoby (lidé vsi
  `sceneFolkOf` – přítomní, skupiny domů `houseGroups`, věk jako `fleeParty`); každá skupina domů
  k okraji lesa nejbližšímu jejímu prvnímu člověku (`nearestForest` nad mřížkou dohledu jako
  v `planDefense`), dobytek do lesa (`livestockForest` – součet kusů). Začátek = takt otevření boje
  `BattleState.openTick` (volitelné, zapíše `raidTick`; návrh Clauda – boj, ve kterém všichni utekli,
  se rozhodne hned prvním taktem a bez něj by se chůze k lesu nikdy neukázala); starší stav – běžící
  boj z počtu taktů, rozhodnutý null (lidé stojí u lesa). Útočník útěk nedostane (návrh Clauda –
  ves utekla, než dohlédl). Do útočiště (`refuge`) se útěk nekreslí.
- **Use-case** (`application/war-scene.ts` – `warSceneFor(deps, { playerId, settlementId })`):
  sídlo musí být hráče a ležet v mřížce světa; tažení proti vsi sídla
  (`CampaignRepository.activeAgainst` – `state->'target'->>'villageId'`) z pohledu obránce (mřížka
  pro dohled v lese `sightGrid`, opevnění `battleForts` jen při boji), pak tažení hráče
  (`activeOf`) z pohledu útočníka. Boj má přednost, napadení před vlastním vojskem; jeden pohled.
  Vojsko je na mapě (`present`), stojí-li tu skupina, nebo je tu boj (`shownBattle` – i rozhodnutý
  dnes). Ves sídla se hledá otiskem bez stavu (`stampsOf`); domy, opevnění a lidé obránce
  (`WarSceneDefender` – `folk` jen pro obránce) se čtou ze stavu vsi jednou za herní den –
  mezipaměť `defenders` (klíč `ves@den`, web LRU 16).
- **Web:** route `GET /api/war-scene/<sídlo>` (`lib/war-scene.ts`, `no-store`) → `{ war }`; cizí
  sídlo i mapa bez války = `{ war: null }`. `useWarScene` (web-ui.md – Dotazování na tažení)
  a `sceneWarOf` (`lib/war-scene-view.ts`) → `LandscapeScene.setWar` ve `VillageGame`. Na vlastní
  mapě bez závoje mlhy (svou zem hráč zná; cizí mimo dohled server neposlal), padlí do konce dne.
  Útěk `flightOf` – `planFlight` po okrajích lesa, `startMs = msOfTick(startTick)` (null → −∞,
  stojí u lesa), dobytek žene poslední, kdo z vsi vyšel (renderer – `drivenHerd` za ním); stádo
  s vojskem `herdOf` za skupinou (poloha a směr chůze). Scéna kreslí nejvýš `SCENE_HERD_MAX` (24)
  kusů – krávy (jiný dobytek scéna vojska nemá).
- **Cizí mapa** (`warSceneOnMap(deps, { playerId, campaignId, cell })`; web `?scene=x,y` na route
  tažení, web-ui.md – Cizí mapa ve scéně): útočník – účastník tažení (vůdce i vazal ve službě,
  `isCampaignParticipant`) – vidí ve 3D mapu, na které jeho vojsko stojí. Pohled `attack`: vojsko
  tažení celé, obránci jen v dohledu jeho mužů na nohou (mřížka mapy cíle při boji jako
  `campaignView`), hradby bojiště, z cílové vsi jen objevené domy (`WarSceneView.buildings` –
  `discovered`, poloha a natočení; nic dalšího o cizí vsi). Domy a opevnění cílové vsi z mezipaměti
  `defenders` (`WarSceneDefender.buildings`, klíč `ves@den`). null – cizí hráč, konec tažení
  (`done`, `disbanded`) nebo vojsko na mapě nestojí → scéna jde za vojskem (design „mapu po mapě“):
  zeptá se na pohled na tažení a přepne se na mapu, kde teď stojí velitel, jinak vlastní muž, jinak
  spojenec (web `followCellOf`); na ves se vrátí jen po konci tažení, když vojsko přijde na mapu
  sídla ve scéně, nebo když ho pohled nemá nikde jinde. Dokud na mapě stojí kterákoli skupina
  vojska, scéna zůstane (návrh Clauda – za velitelem jde, až mapu opustí všichni). Scéna se závojem mlhy
  (design „Mlha války na cizí mapě“); vlastní vsi útočník vidí jen na své mapě. Vazal vidí jako
  vlastní stranu celé vojsko tažení i se zdravím mužů pána (návrh Clauda – je jeho součástí).
- **Plynulost mezi snímky** (scene.md – Vojsko, boj a mlha války): scéna se ptá 2× za sekundu,
  ale route čte kontrolní bod tažení, který worker uloží po ≥ 40 taktech (10 s) nebo s událostí –
  snímky tak dělí i desítky taktů. Muži boje i skupiny pochodu (`SceneMarch.tick` = takt pohledu)
  jdou k novému snímku tak dlouho, kolik taktů uběhlo (`glideMs` – při dopočtu po přestávce kratší,
  nejvýš 15 s); rány z vynechaných
  taktů scéna pozná z `cooldown` (`strikeTicks`) a ukáže je, až k nim pohyb dojde. Údery od `since`
  ze serveru ne (návrh Clauda): server zná jen poslední bod – rány mezi body by musel stav boje
  zapisovat do bodu (stovky ran za 40 taktů v jsonb, čteno 2× za sekundu); rytmus ran určuje jádro
  (`cooldown`), scéna ho z bodu dopočte sama a zásahy zná ze součtu `hits` / zdraví.
- **Zatím ne:** lidé cizí vsi mimo boj (útěk útočník nevidí), cesta do útočiště, pole a další stavby
  cizí vsi, padlí po skončení tažení týž den (`done` – `activeAgainst` ho nevrátí), ranění
  vesničané po dni boje (`woundedUntil` – scéna vsi je nekreslí zvlášť); stádo za vojskem bere
  polohu skupiny ze snímku, ne plynulou.
- **Testy:** `domain/war/__tests__/scene-view.test.ts` (padlí a ranění do konce dne vedle pochodu,
  další den ne, mlha padlých; `sceneFolkOf`; útěk – kdo, kam, od kdy, dobytek, rozhodnutý boj,
  starší stav, útočník ani bez lesa nic; odehnané stádo – útočník vždy, obránce jen v dohledu),
  `application/__tests__/war-scene.test.ts` (obránce – útočníci v dohledu mužů i domů,
  mlha, cíl mimo dohled, cizí bez zdraví se zásahy, ves jednou za herní den; po boji pochod; padlí
  a útěk ze stavu vsi i po odchodu vojska, další den nic;
  útočník na své mapě; cizí sídlo; `warSceneOnMap` – obránci v dohledu, jen objevené domy, obránce
  cizí domy nedostane, cizí hráč / jiná mapa / konec tažení = null, vazal ve službě), web
  `lib/__tests__/war-scene-view.test.ts` (i výběr mapy `watchCellOf`, další mapa `followCellOf`,
  závoj na cizí mapě, cizí ves z domů, takt pochodu, útěk po okrajích lesa, stádo za skupinou,
  rozhodnutý boj s padlými), `army.test.ts` (plynulý pochod `marchAt`), `battle-fx.test.ts` (rána
  podle zásahů, rány z vynechaných taktů `strikeTicks`), e2e `multiplayer-war.spec.ts` (napadená
  ves B má ve scéně vojsko – `data-war-men` na plátně, útěk do lesa se stádem – `armyStats`
  `army-cow` = ovce v lese, vojsko doma u A, B ho pak nevidí; útočník A přepne scénu na mapu vsi
  B – `foreign-scene`, `data-war-men`, `armyStats`, vojsko přejde na sousední mapu – nová
  `data-cell` a vojsko dál, po návratu domů zpět na ves), db
  `campaign-repository.db.test.ts` (`activeAgainst`).

## Měření tažení a e2e celé války (Ú6.17)

- **Měření** `apps/worker/scripts/measure-campaigns.ts` (v paměti, skutečné `stepCampaigns`) –
  tabulka a rozbor v `docs/code/worker.md` – Výkon – Tažení. Změřeno 7. 11. 2026 (jedno jádro):
  pochod 1 / 5 / 20 tažení × 60 mužů 0,4 / 1,6 / **4,4 %** jádra (cíl ≤ 25 % pro 20 tažení
  **splněn**; bez paměti workeru 2,4 / 10,5 / 39,7 %), 5 tažení u opevněných vsí (15 průlomů,
  útočiště) 2,5 % (dřív 16,2 %). Zrychlení: worker pokračuje od posledního spočteného stavu místo
  opakování taktů od kontrolního bodu a mřížky pochodu drží napříč koly (`MarchGridMemo`); kopie
  stavu v každém taktu zůstává (≈ 45 % zbytku – proč, viz worker.md).
- **e2e** `apps/web/e2e/multiplayer-war.spec.ts`: A přepadne B (tažení zapsané rovnou u vsi B,
  velí vesničan – NPC), B s výchozím postojem útěk uteče do lesa i se stádem
  (`battle.shelter`), B má upozornění „Cizí vojsko u vsi …“, A po návratu (vojsko přenesené do
  shromaždiště) „Vojsko se vrátilo domů.“; obě vsi den nájezdu dopočítají znovu i se schránkou
  (`lastDay` o den zpět – herní den trvá v testech ≈ 4,8 h) a kronika obou má nájezd bez opovědi.
  A pak nabídne mír s ročním tributem (platí B), B přijme – válka `peace`, tribut v přijatém kole,
  kronika míru ve schránce obou vsí. Vedle `next start` běží worker se smyčkou tažení (jako test
  živého vedení), mezi nájezdem a návratem se restartuje.
- **e2e hradby** (plán hradeb, Úloha 22) – druhý test téhož souboru: ves B má kolem vsi hotovou
  palisádu s ochozem (`proposeFortification` + `startFortification`, díly dostavěné, `kind:
'walkway'`) **bez bran** – brána by se prosekla dřív, než se vyrobí žebřík. Tažení A (8 mužů,
  velí vesničan – NPC) stojí 40 m vně hradby; NPC velitel volí postup sám (`fastestApproach` –
  žebříky z lesa). Výroba žebříku trvá 4 herní hodiny, v pomalém světě testů ≈ 11 500 taktů, proto
  kontrolní bod začne o 16 000 taktů (≈ 67 min) dřív a worker boj dopočítá najednou. Test ověří
  stanoviště obránců u čáry hradby (`Fighter.post`), žebříky v `BattleState.ladders`, útočníka
  uvnitř obvodu (bod v mnohoúhelníku středů dílů) a nájezd bez opovědi v kronice obou vsí – vsi
  se dopočítají znovu ode dne nájezdu (`replayFrom`; boj mohl začít i včera).
