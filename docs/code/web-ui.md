# Web a rozhraní – server actions, HUD, ovládání, e2e

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: vision.md, accounts.md v `docs/design/`.

- **Web:** server actions `app/game/actions.ts` (`getVillageView`, `selectVillage`, `foundVillage`,
  `placeDwelling`, `relocateHousehold`, `cancelConstruction`, `leaveVillage`,
  `settleJourney`, `placeWorkshop`,
  `placeField`, `placeCemetery`, `placeOrchard`, `placeSacred`, `placePen`,
  `buildTrail`, `sendExpedition`, `declareHunt`, `renameVillage`, `nameLineMan` → `VillageView` / `null` / `{ error }`; `restartGame(input?)` → `{ ok: true }` /
  `{ error }`). **Každá akce nad vsí nese `villageId`** (UUID – `villageIdOf` v
  `lib/village-input.ts`) a server ověří, že ves patří hráči (`context` v `lib/village.ts` →
  `findPlayerVillage`); `getVillageView({ villageId: null })` = první ves hráče (zakládá-li ves,
  null), založení první vsi jde na sídelní sídlo. Odpověď dotazu na ves (`getVillageView` s `withNotices: true`) nese i nepřečtená upozornění mezi hráči (`playerNotices`) a při doručení je označí za přečtená (`docs/code/world.md`). Rod vojvody (lord.md – Jména): `foundVillage`
  přijímá volitelné `lordName` (`parseFoundVillageInput`; písmena ověří use-case, bez jména vojvoda
  čeká) a ves zakládá vždy vojvoda s manželkami; `nameLineMan({ villageId, personId, name })`
  pojmenuje vojvodu nebo jeho syna (`parseNameLineManInput` → `nameLineManForPlayer` → use-case
  `nameLineManInVillage`); `declareHunt({ villageId })` vyhlásí lov navíc na zítřek
  (`parseDeclareHuntInput` → `declareHuntForPlayer` → `declareHuntInVillage`, tlačítko
  `manor-hunt` v `ManorUpgrades`; důvod odepření dává pohled `VillageManor.huntDenied`).
  Composition root `lib/village.ts` (pohled na ves
  dopočítá všechny vsi hráče – přepínač a konec hry), `lib/village-view.ts` (DTO, smí i do
  prohlížeče – `id`, `settlementId`, `villages` pro přepínač, `relocation` cena nového domu bez
  lidí k osídlení), `lib/village-list.ts`, `lib/relocation-view.ts`. Vybraná ves se pamatuje
  v cookie, kterou zapisuje prohlížeč (`lib/village-choice.ts` – zápis cookie v server action by
  Next.js odpověděl novým vykreslením stránky a novou scénou); stránka /game ji přečte
  (`lib/village-cookie.ts`) a otevře přes `gameEntryForPlayer` (`lib/game.ts`), cizí nebo
  archivovaná ves → první ves hráče. Typy pro scénu jsou odvozené odtud a z `@bohemia/game` – nedefinovat je znovu ve scéně.

- **Trasy a vyšlapanost se doručují jen při změně** (`lib/scene-routes.ts`): dotaz nese `routesKey` a `wearDay`, server při shodě pošle `null`, klient doplní `keepSceneData`; podrobnosti v `village-roads.md`.
- **Trasy vozů a spřežení počítá prohlížeč** (`lib/cart-routes.ts`; Martin 31. 10. 2026: „simulace
  bude počítat jen s odhadem vzdáleností a přesné trasy zůstanou prohlížeči“): server v pohledu
  pošle jen cíle jízd dne (`SceneCart.goal` z `cartGoalToday`, `ScenePloughLegs.outGoals` /
  `homeGoals` ze `scenePloughLegs`) a vstup vozových tras `scene.cartWorld` (`cartWorldOf` z jádra –
  ves pro mřížku vozu, ohrady se spřežením, změny překážek; jen u vsi s jízdou dne). Díly polí ve
  vstupu se neposílají, když jsou výběrem dílů scény (`fieldsAsScene` – `cartFieldsOf`), změny
  překážek, když jsou tytéž jako `scene.obstacles` (`'obstacles'`). Klient po každém pohledu
  (`VillageGame` – `applyVillage` i první pohled) zavolá `withCartRoutes`: `cartGoalRoute` →
  `cartWorldRoutes` (stejná mřížka a paměť mřížek jako `villageCartRoutes`, test
  `cart-memo.test.ts` – tytéž trasy) → `simplifiedRoute`, a doplní `SceneCart.route`
  a `ploughLegs.out` / `home` (stání `stand` jen bez cesty tam i zpět) – scéna je čte beze změny.
  Vlkov: pohled za herní den ≈ 270 ms místo ≈ 520 ms; prohlížeč trasy spočítá za 5–250 ms (mřížka
  vozu v paměti krajiny, po kácení se staví znovu).
  - **Valy vozových cest** se ve vstupu neposílají, když se dají přesně sestavit ze zemních prací
    scény (`earthworksAsScene` – `cartEarthworksOf`: profil a hotová délka, body se stejným pořadím
    klíčů); Vlkov −202 kB prvního pohledu.
  - **Mimo hlavní vlákno:** `withCartRoutes` = `cartRoutesRequest` (cíle a vstup mřížky ze scény)
    → `cartRoutesOf` → `withCartRouteResult`. `applyVillage` posílá požadavek Web Workeru
    (`lib/cart-router.ts` → `lib/cart-routes.worker.ts`, `new Worker(new URL(…, import.meta.url))`
    – Turbopack ho sbalí jako vlastní chunk); worker dostane krajinu jednou (`LandscapeTransfer`)
    a paměť mřížek žije v něm. Pohled se použije až s trasami dne (`applyTicket` – novější pohled
    má přednost, akce vrátí výsledek až po použití); bez `Worker` nebo po jeho chybě se totéž
    spočítá v hlavním vlákně. První pohled spočítá hlavní vlákno (jednou při načtení stránky).
- **Nabídky panelů až na vyžádání** (`lib/panel-options.ts`, server action `getPanelOptions`,
  `panelOptionsForPlayer`): kompas zemských stezek (`trailOptions` – 8 plánů tras se dřevem
  a průseky) a „Vysadit jabloně“ u cesty (`roadApplesOption`) se v pohledu nepočítají – stály ≈ 90 ms
  z ≈ 140 ms pohledu Vlkova za herní den. Paměť podle otisku vstupů by nepomohla (obě závisí na dni –
  stromy rostou, pařezy zarůstají, stavby postupují). Server je spočítá ze stejného stavu jako pohled
  (`panelOptionsOf` – sousedé z mapy, opuštěná ves), až když hráč otevře kompas (`ManorPanel`) nebo
  vybere cestu (`RoadBody`); `hooks/use-panel-options.ts` (`PanelOptionsContext` z `VillageGame`,
  klíč = `VillageView.stamp`) se s novým pohledem zeptá znovu a do odpovědi drží předchozí nabídku.
  Pohled nese jen `manor.trailBuilt`; ukázky panelů (`/dev/panels`) mají nabídky v `DEV_PANEL_OPTIONS`.
- **Velké části pohledu jen při změně** (`lib/view-pieces.ts`): `packViewPieces` (server action
  `getVillageView` – `trimKnown`) spočítá otisky kusů (`pieceKey` – cyrb53 JSONu a délka) dílů polí
  v pohledu (`f<i>`) i ve scéně (`s<i>`) po `PIECE_ITEMS` = 32, vstupu vozových tras (`we`, `wo`),
  valů cest (`e`), změn překážek (`o`) a luk (`h`) do `VillageView.pieces.keys`; dotaz nese
  `pieces` (otisky, které klient má – `knownViewPieces`, ověřené `knownPiecesOf`), server shodné kusy
  vynechá (`pieces.omitted`) a klient je doplní ze svého pohledu (`unpackViewPieces` před
  `keepSceneData`). Kus, který klient nemá, = `lost` → pohled bez otisku i bez kusů
  (`withoutStamp`), další dotaz dostane celý. Server nic nepamatuje; akce vracejí celý pohled.
  Vlkov: odpověď za herní den 240–800 kB místo ≈ 1,55 MB (za den se změní desítky dílů z 3 783),
  první pohled ≈ 1,60 MB (s vstupem vozových tras, valy cest ze scény).
- **Jeden dopočet vsí naráz** (`lib/exclusive.ts`): `updateVillage` ukládá s optimistickým zámkem
  (`VillageRepository.save(id, state, expectedVersion)`, při neshodě verze zkusí znovu nad čerstvým
  stavem, nejvýš 5×). Dlouhý dopočet ale po přestávkách (`computePause`) pouští ke slovu jiné
  požadavky, a ty (dotaz, akce, skok v čase) načetly tutéž starou verzi, počítaly totéž znovu a po
  prvním uložení narazily na konflikt verze. Proto se `dynastyOfPlayer`, `skipTimeForPlayer`,
  `restartGameForPlayer`, akce v `actOn`, založení vsi a odchod/usazení řadí do fronty podle
  klíče `player:<id>` (`dynastyStatus` dopočítává všechny vsi hráče, ne jednu): další volání počká
  na dokončení předchozího (i chybou – nepřilepí se) a načte už dopočítanou ves, takže dopočte jen
  zbytek do svého dne. Mapa je v `globalThis`, po dokončení se klíč uklidí. Klientský
  `usePolling` už běží po jednom dotazu (další až po dokončení), takže nic nemění. Průběh skoku
  v čase se čte mimo frontu i mimo server actions – Route Handler `GET /api/dev/skip-progress`
  (accounts.md, Průběh přeskoku).
  - **Zámek hráče v DB (i proti workeru):** fronta v procesu je první vrstva; uvnitř ní se bere
    `PlayerLock.run` (`exclusivePlayer` / `exclusivePlayerShared`, zámek z `getPlayerLock()`
    v `lib/db.ts`, v `globalThis` jako pool DB – HMR `next dev` nové spojení neotevře). Adaptér
    `packages/db/src/adapters/player-lock.ts`: `pg_advisory_lock(PLAYER_LOCK_NAMESPACE, otisk)` na
    úrovni spojení, otisk = 32bitové FNV-1a z UTF-8 id hráče (`playerLockHash`, pevné hodnoty
    v testu – po spuštění se nesmí změnit). Srážka otisků dvou hráčů je jen zbytečné čekání
    (≈ n² / 2³³ – 10 000 hráčů ≈ 1,2 %). **Vlastní malý pool jen pro zámky** (`createLockPool`,
    `createPlayerLocks` v `@bohemia/server` – web `WEB_LOCK_POOL_SIZE` 20, worker
    `WORKER_LOCK_POOL_SIZE` 2): spojení drží zámek po celou operaci, dotazy operace jdou hlavním
    poolem. Odemčení ve `finally` i po chybě; když odemčení selže nebo spojení spadne (posluchač
    `error` na vypůjčeném spojení – jinak by pád spojení shodil proces), spojení se z poolu zahodí
    a Postgres zámek uvolní sám – stejně při pádu nebo zabití procesu. Operace, které spojení
    zámku spadlo pod rukama, doběhne bez zámku (`onLost` → `console.warn`); pojistkou zůstává
    zámek verze v `updateVillage`. `tryRun` (worker) nečeká nikdy – `pg_try_advisory_lock`.
    Volitelný `waitTimeoutMs` (Postgres `lock_timeout` na spojení zámku → `PlayerLockTimeoutError`,
    zámek se nevezme) web nepoužívá – čeká jako fronta, varování po `EXCLUSIVE_WARN_MS` zahrne
    i čekání na zámek v DB. **Bez deadlocku:** pořadí vždy fronta v procesu → zámek v DB, jeden
    zámek hráče na operaci, nevnořuje se (`…Locked` varianty – `guardedAction` volá
    `dynastyOfPlayerLocked`), bere se před transakcí, nikdy v ní, a worker jen zkouší. Testy:
    `player-lock.db.test.ts` (dva pooly = dva procesy: `tryRun` → obsazeno, `run` počká, chyba
    pustí, `pg_terminate_backend` držitele pustí, různí hráči se neblokují, 20 souběžných nikdy
    dva naráz, časový limit), `exclusive.test.ts` (zámek v DB až uvnitř fronty, sdílené dotazy
    ho berou jednou).
  - **Sdílení dotazů:** `dynastyOfPlayer` jde přes `exclusiveShared(klíč, den:ves)` – dotaz se
    stejným dnem a vsí, který přijde, dokud je posledním členem fronty právě takový dotaz (čeká nebo běží),
    dostane jeho Promise místo nového místa ve frontě. Fronta tak neroste, když klient dotazuje
    rychleji, než server stíhá, a akce hráče nečeká za zbytečnými dotazy. Jakmile se za dotaz
    zařadí akce, další dotaz už se řadí za ni.
  - **Den akce až ve frontě:** `guardedAction` v `lib/village.ts` načte den, ves a stav konce hry
    až uvnitř zámku (dopočet jde přes `dynastyOfPlayerLocked` (= use-case `dynastyForVillage`),
    `exclusivePlayer` se nevnořuje). Akce
    zařazená za skok v čase nebo jinou akci tak dostane aktuální den, ne ten z doby zařazení.
  - **Proč bez timeoutu:** timeout, který by frontu uvolnil, by vrátil souběžné dopočty (skok
    o desetiletí trvá minuty). Po `EXCLUSIVE_WARN_MS` (120 s) čekání nebo běhu se jen zapíše
    `console.warn`.
- **Web dopočítá jen zobrazenou ves** (plán workeru – 3. Web po workeru; use-case
  `dynastyForVillage` v `application/dynasty-for-village.ts`): pohled (`viewOf`), nabídka panelu
  (`panelOptionsForPlayer`) i akce (`guardedAction`) volají `dynastyOfPlayer(playerId, today,
villageId)`. Z levných otisků (`stampsOf` – `last_day`, `asleep`) se dopočte do dneška zobrazená
  ves a každá jiná nespící ves víc než `WORKER_LAG_DAYS` = 3 herní dny (≈ 4 min; Martin 31. 10. 2026) pozadu (`lagsBehindWorker` – worker neběží nebo dohání výpadek; `mustAdvanceNow`, stejně `currentVillageViewStamp` – jedna ves, jedna mapa, sousedy na téže mapě dopočítávat netřeba); **ostatní vsi
  jen souhrnem** (`digestsOf` → `VillageDigestRecord`, sloupec `village.digest` – viz
  docs/code/worker.md, Souhrn vsi): přepínač (`villageListItem` – celá ves jde přes týž
  `villageDigest`, takže položka je táž), otisk pohledu (id, jméno, verze) a vlastní mapy kolem
  (`ownMapsAround`) stav nepotřebují. Výsledek je `DynastyView` (vsi `DynastyVillage` – celá
  nebo souhrn, `isFullVillage`); po konci hry jsou všechny vsi celé (kronika konce rodu). U dopočtených vsí se vybaví odchozí schránky
  správce (kola jako `advanceDynasty` – nová ves syna je v přepínači hned). Konec hry se nejdřív
  pozná z faktů vsí (`isGameOverOf` nad `LineFacts` – z celé vsi `lineFacts`, ze souhrnu přímo);
  nastal-li, načtou se vsi celé a: jsou-li všechny na dnešku, `closeDynastyDay` jako plný
  dopočet; ze smíšených dnů ho ověří plný dopočet `advanceDynasty` – smíšené dny nikdy neukážou falešný
  konec rodu. **Bez workeru** ostatní vsi (jiných map) zaostávají až 3 herní dny (≈ 4 min): přepínač ukazuje
  jejich starší stav, konec rodu rozhodnutý v jiné vsi se ukáže až o ≤ 4 min později (do té doby web
  přijímá akce) a nová ves syna ze schránky nezobrazené vsi se objeví se zpožděním (Martin 31. 10. 2026 – mez 3 herní dny). Plný dopočet (`dynastyStatus`) dál dělá skok v čase a restart. Testy `dynasty-for-village.test.ts` (pod mezí / nad mezí, determinismus zobrazené vsi
  a zbytku, akce, skutečný i falešný konec rodu, schránka správce, souhrn = plné stavy, ves bez
  souhrnu, konec rodu ze souhrnů); `village-list.test.ts` – položka přepínače ze souhrnu je táž
  jako z celého stavu (hlad, humno, počasí roku, povodeň, pohroma, správce, vymřelá, opuštěná,
  na cestě; den pohledu až 5 dní po dni vsi).
- **Krok světa** (worker bez procesu kolem – plán workeru, 1. Co worker dělá; use-case
  `application/advance-world.ts`): `advanceWorldStep(deps, { worldDay, stepDays, limit, skip })`
  vezme z fronty (port `WorldQueue.behind(worldDay, limit)` v `application/world-queue.ts` →
  `{ playerId, today, oldestDay }[]`) hráče nejvíc pozadu a každému `advancePlayer` posune vsi
  o dávku: cíl `T = min(dnešek, nejstarší lastDay nespící vsi + stepDays)` (`WORLD_STEP_DAYS` =
  10), každá nespící ves s `lastDay < T` zvlášť pod `PlayerLock.tryRun` → `loadVillage(T)` (s
  `pause`) → vybavení její schránky správce (`settleStewardDeparturesSafely` – nová ves vznikne
  v den odchodu a vezme ji další kolo). Zámek drží web → hráč `busy` a kolo jde na dalšího.
  Posunulo-li se něco, jedno závěrečné držení zjistí konec rodu (`closeDynastyDay(T)`) – jen když
  jsou všechny nespící vsi právě na `T` (smíšené dny by mohly dát falešný konec, ověří se po další
  dávce). Výsledek `PlayerStep` (`done | busy | failed`, `targetDay`, vsi, dny, nové vsi,
  `gameOver`, ms z volitelného `deps.now`, u chyby `{ villageId, cause }`) a souhrn `WorldStep`
  (`idle` – nikdo bez odkladu nebyl pozadu). Odklady (busy, chyba) drží volající a předá je jako
  `skip` – use-case hodiny nezná. Adaptér `packages/db/src/adapters/world-queue.ts`: jeden dotaz
  nad `last_day` / `asleep` (bez JSON), dnešek `LEAST(den + posun, LAST_WORLD_DAY)` jako
  `playerDay`, archivovaná sídla a spící vsi venku, pořadí zpoždění ↓, id `COLLATE "C"`.
  Jednorázové převody starších vsí počítané od dne načtení (`withPenGrace`,
  `withThreshingGrace`) dostanou den dávky `T`, ne dnešek hráče – stejně jako dřív den, kdy hráč
  ves otevřel. Testy `advance-world.test.ts` (fronta, dávka ≤ `stepDays`, obsazený a odložený
  hráč, spící vsi, chyba jednoho hráče, po 1 / 3 / 10 dnech i se zbytkem ve webu = dopočet
  najednou, schránka, příjezd se správcem, konec rodu jen ze stejného dne),
  `world-queue.db.test.ts`.
- **Dotazování na ves** (`VillageGame` + `hooks/use-polling.ts`): klient se zeptá na začátku
  dalšího herního dne hráče (`nextPollDelayMs` v `lib/village-polling.ts` – začátek dne po dni
  pohledu přes `realTimeOf` + 1 s, nejdřív za 5 s, nejpozději za 86 s; po návratu do panelu hned). Pošle
  `{ villageId, known }` – `known` = `VillageView.stamp`, otisk pohledu (`villageViewStamp`
  v `application/village-stamp.ts`: vybraná ves, den, id + jméno + verze všech vsí hráče –
  pohled je čistá funkce těchto údajů). Server (`villageViewIfChanged`) nejdřív levně
  (`currentVillageViewStamp` – sídla hráče a `VillageRepository.stampsOf`: id, jméno, verze,
  `last_day` a `asleep` – generované sloupce tabulky `village` (migrace 0009), plní se při každém
  zápisu ze stavu JSON, který zůstává zdrojem pravdy; spánek = `extinctDay` nebo `abandonedDay`
  jako `isVillageExtinct` / `isVillageAbandoned`; index `village_awake_day_idx` nespících vsí podle
  dne je pro frontu workeru; `stampsOf` Vlkova z ≈ 6,2 ms na ≈ 0,15 ms, protože se JSON nerozbaluje) a při shodě, když by pohled nic nepočítal (zobrazená ves na
  dnešku, každá jiná nespící ves nejvýš `WORKER_LAG_DAYS` pozadu – `lagsBehindWorker`; spící vsi
  se nepočítají), vrátí `{ unchanged: true }` bez načtení stavů (Vlkov: celý řádek ≈ 830 kB / 50 ms, dotaz na
  něj jde v celé cestě 3×). Když worker uloží jinou ves, otisk se změní (verze) a pohled se pošle
  znovu – zhruba jednou za herní den, jako dřív. `dynastyStatus` bere id vsí z levných otisků (`stampsOf`, v pořadí
  založení) – stav každé vsi načte jen `loadVillage`, jednou. Akce a přeskok času vracejí vždy celý pohled.
  **Paměť vsí na jeden požadavek** (`packages/server/src/village-cache.ts` – identity map): server actions
  (`villageAction`, `getVillageView`, výběr a založení vsi, skok v čase) a první pohled běží ve
  `withVillageCache` (AsyncLocalStorage v `globalThis`); úložiště z `cachedVillages` tam vrací záznam
  načtený dřív v témže požadavku, dokud levný otisk (`stampsOf` – verze a jméno) sedí, `save`
  paměť obnoví a neúspěšné uložení ji pro ves zahodí (optimistický zámek a opakování platí dál).
  Akce tak načte každou ves jednou místo ověření vsi + dopočtu + use-case + pohledu (≥ 4×)
  (dopočet všech vsí hráče je načítá stejně). Změna jména verzi
  nemění, proto je jméno v otisku zvlášť. e2e testy po přímé změně uložené vsi volají háček
  `pollVillage` (`lib/e2e-hooks.ts`) – sám by dotaz přišel až s dalším herním dnem.

- **Uložení vsi** (`save`) vrací jen id, sídlo, jméno a verzi – záznam nese předaný stav (ne kopii
  z databáze).

- **Rozhraní jako v 0 A.D., bez popisků a průvodce** (Martin): `components/game/VillageGame.tsx`
  skládá `hud/` – `TopBar` (jméno vsi = přepínač vsí `hud/VillageSwitcher.tsx` – klik otevře
  seznam vsí hráče se jménem a lidmi, klik na ves ji přepne – ves na jiné mapě novým načtením
  stránky (jedna ves, jedna mapa); přejmenování dvojklikem nebo tužkou; upozornění z jiné vsi
  krátkým řádkem se jménem vsi – `otherVillageNotices`; ikony s čísly: lidé a kolik jich pole uživí v jedné ikoně („31 / ≈ 22“, `peopleLabel`), obilí, luštěniny
  (ikona `legumes`, když jsou v zásobě, na poli nebo v jídle – `showsLegumes`), maso,
  sýr (ikona `cheese`, v popisku mléko za den) když je mléko nebo sýr, ovoce (jablka) jen když
  jsou nebo je sad, seno s ohradou, klády, hřivny jen ves s řemesly (uhlí je v panelu uhlíře, vozy v ohradě volů a v panelu tesaře, keramika a dřevěné nářadí nikde – Martin 24. 10. 2026), volná
  práce, nasycení (barva ikony podle energie – hlad, tooltip nasycení s energií, bílkovinami
  a podíly obilí / luštěniny / maso / mléko a sýr / vejce / ovoce), štěstí, datum – obnoví se
  na začátku dalšího herního dne, ne každou sekundu (`dateRefreshDelay` v `lib/game-date.ts`);
  zvuk a tlačítko nabídky),
  `GameMenu` (nabídka hry jako v 0 A.D. pod lištou vpravo, F10 – smí mít slova: Začít znovu,
  Odhlásit s e-mailem v popisku, Zpět do hry; Začít znovu se živou vsí jen po potvrzení v panelu,
  bez dialogů prohlížeče, při zakládání vsi zamčené; otevření zruší umisťování i výběr, klávesy
  hry zachytí na `window` ve fázi capture, Esc zavře – z potvrzení vrátí –, klik mimo panel zavře
  a do krajiny nedojde; po konci hry se neotevře; logika kláves v `lib/game-menu.ts`), `Minimap` (vlevo dole, `lib/minimap.ts`,
  klik / tažení přesune pohled; krajina a ves se kreslí jednou do vrstvy v rozlišení plátna
  – `drawMinimapVillage` – a při pohybu kamery se přes ni kreslí jen záběr – `drawMinimapView`), `SelectionPanel` (dole uprostřed, jen při výběru,
  `lib/selection-details.ts`; **roste s obsahem** (Martin 19. 10. 2026 – text se nesmí zalamovat
  ani být nahňácaný): `w-max` a `whitespace-nowrap`, meze v `hud-selection` (globals.css – na
  středu mezi minimapou a mřížkou staveb, nejvýš 70 % okna, širší obsah se zalomí po celých
  položkách – řádky `ROW` s `flex-wrap`; na okně pod 55rem stojí nad nimi, svislý posuv
  `useOverflowScroll` až když přeroste výšku okna – ořízl by popisky); příkazy (dvorec, Přestěhovat,
  Odejít, vylepšení cesty) vpravo za čarou – `Commands`, `hud-split` / `hud-commands`, na okně
  55–72rem pod údaji; rozbalené nabídky (růžice stezek a odchodu, obchod) nad panelem u pravého
  okraje – `hud-popup`, zavře je stisk myši mimo ně (`hooks/use-dismiss.ts`); popisky (`Tooltip`)
  se zalomit smí – `whitespace-normal`; náhled bez hry s nejbohatšími daty:
  http://localhost:3010/dev/panels (`?panel=dvorec`, `ohrada`, `pole`, `pole-dil`, `rudiste`… – `app/dev/panels/dev-panels.ts`,
  i seznam vsí a nabídka hry); u obydlí a víc vybraných obydlí – počet domácností a lidí –
  tlačítka Přestěhovat po typu nového domu a Odejít – růžice odchodu `LeaveCompass`: 8 směrů nové
  mapy, uprostřed nic (jedna ves, jedna mapa – „sem“ zrušené 1. 11. 2026) (dny cesty, lidé a jídlo v popisku, směr s vlastní
  vsí zašedlý) –, průběh stěhování se Zrušit – `hud/RelocationControls.tsx`; u víc domácností se
  nové domy umisťují postupně, po umístění jednoho hned další jako Shift + klik; **odchod syna
  vojvody** (lord.md – Dělení vsi): pohled `dynasty.sons` (`lib/dynasty-view.ts`, z `leadingSons` /
  `sonDeparturePreview` – náhled ze všech odcházejících stejnými funkcemi jako `departWithSon`,
  i když je díl jen rodina syna; počítá se jen pro syna, který smí vést) → `SelectionSon` v detailech dvorce (`sonDetails`
  v `lib/selection-details.ts`) → řada ikon `SonsRow` (`hud/selection/sons.tsx`; nástupce a syn bez
  jména zašedlí s důvodem, klik = rámeček + růžice `LeaveCompass`, kůň v popisku); obrys obydlí
  dílu a domů rodiny syna mimo dvorec = `sonPreview` ve `VillageGame` (`setSelection` cíle `dwellings`); `leave` i `leaveWithSon` = jeden tok
  `departFromVillage` (`dwellingIds` nebo `sonId`) → server action `leaveVillage` (`{ villageId, sonId, destination }`,
  `parseLeaveVillageInput`) → `leaveVillageForPlayer`; ves na cestě
  ukáže řádek `JourneyBanner` a po příjezdu nabídne jen zemnici – `settleJourney`; pohled
  `lib/departure-view.ts`), `BuildGrid` (vpravo dole), `NoticeLines` (mizející řádky nahoře),
  `CursorReason` (jde s kurzorem při umisťování: u prošlého umístění **cena ikonami s čísly** –
  práce celkem v člověkodnech i s překážkami, u obydlí i s kácením, a ikona stromů s počtem
  stromů ke kácení, když nestačí klády, u modly a svatyně ikona dubu s počtem dubů ke kácení –
  `PlacementCost` z `lib/build-items.ts`, obydlí přes
  `dwellingPlacementCost` = `planDwellingWoodFrom` + `dwellingLaborManDays` z jádra jako při
  zahájení stavby, modla a svatyně `sacredPlacementCost`; pod ní oranžově `check.warning`, které
  stavbu neblokuje – hřbitov blízko obydlí nebo vody, obydlí blízko hřbitova, posvátný dub nebo
  háj zůstane stát; když umístění nejde, místo ceny krátký červený důvod). Kromě důvodu a varování u kurzoru žádná slova ani souhrny – **výjimka:** v panelu obchodu dvě
  hlavičky sloupců „Dáš“ a „Dostaneš“ (se šipkou ze vsi ven / do vsi, jako „Prodat“ a „Koupit“
  v 0 A.D. – Martin 19. 10. 2026, trade.md – Rozhraní). Popisky = `hud/Tooltip.tsx`, jeden krátký
  název (u staveb i cena). Vzhled panelů: třídy `hud-*` v `app/globals.css` (tlačítko se slovy
  `hud-button`). Komponenty se testují statickým renderem (`react-dom/server`, JSX převádí
  `vitest.config.ts`) – panel bez stavu zvlášť (`GameMenuPanel`). Ikony
  `public/icons/build/` a `public/icons/resources/`. Panely, nad kterými se krajina neposouvá
  okrajem okna, mají `data-hud-block`.

- **Katalog staveb** `lib/build-items.ts` (název, ikona, zkratka, umístění `footprint` /
  `plot` / `squares` / `sacred` / `workshop` / `threshing-floor`, kontrola) – nová stavba = záznam tam, cena v `BUILD_COSTS` a server action
  v `SUBMIT_SQUARES` (`VillageGame`); mřížka, zkratky i malování po čtvercích se nemění. Stavba
  po čtvercích s druhy (`variants` – ohrada: `PEN_VARIANTS` ovce, kozy, prasata, skot, spřežení, koně – ikona `horse`, název „Ohrada koní“; Tab přepíná druhy v malování)
  dostane v kontrole druh; tlačítko stavby je jen **rozcestník** (oxen.md – Ohrady podle druhu,
  Martin 20. 10. 2026): kliknutí i zkratka otevře v mřížce druhy (`BuildGrid` `group`,
  `VillageGame` `buildGroup` – první tlačítko stavba sama zpět, druhy `buildVariantName` bez
  zkratek), druh spustí malování (`startBuild(kind, variant)`), Esc rozcestník zavře; u kurzoru
  ikona druhu (`PlacementPreview.variant`). Stavba,
  kterou nejde zahájit z jiného důvodu než surovin (druhá svatyně), má v `BuildOption.blocked`
  důvod – v popisku červeně. Panel výběru umí i posvátný dub, háj, modlu a svatyni (ikona,
  kolik přidávají štěstí, průběh stavby a duby ke kácení); u posvátného dubu i jeho stáří
  (u háje nejstaršího dubu) – `oakAgeYears` v `sacred-life.ts` z velikosti dubu (150–400 let
  k roku 500, `OAK_AGE`) + herní roky do dneška hráče, ve `VillageSacred` jako `ageYears`;
  uschlý dub (`snag`) má portrét posvátné souše (`icons/build/sous.png`).

- **Ovládání (jako 0 A.D., hraje se i na trackpadu):** výběr `village-picking.ts` (rámeček
  `selection-highlight.ts`, výběr víc obydlí `village-selection.ts` – `VillageTarget`
  `dwellings`), kamera `camera.ts` (čisté funkce `camera-input.ts`,
  `edge-scroll.ts`). Kliknutí = do 6 px pohybu (`CLICK_SLOP_PX`), delší tah je tah. Dvojklik =
  druhé levé kliknutí do 400 ms a 6 px od prvního (`nextClick`, `DOUBLE_CLICK_MS` v
  `camera-input.ts`; tah, pravé tlačítko i umisťování řadu přeruší) – `onSelect` ho ohlásí jako
  `double`.

  | Vstup                  | Nic se neumisťuje                                                | Obydlí (`village-placement.ts`) | Po čtvercích (`field-painting.ts`) |
  | ---------------------- | ---------------------------------------------------------------- | ------------------------------- | ---------------------------------- |
  | levé kliknutí          | vybere obydlí / díl pole / čtverec sadu / hřbitov, na zemi zruší | postaví, Shift + klik staví dál | přepne čtverec                     |
  | dvojklik               | celé pole / celý sad (jinde jako klik)                           | jako dvě kliknutí               | jako dvě kliknutí                  |
  | levé tažení            | posouvá krajinu (uchopená mapa)                                  | –                               | přidá obdélník, s Ctrl (Cmd) ubere |
  | Ctrl / Shift + klik    | přidá obydlí k výběru, vybrané ubere                             | Shift + klik staví dál          | Ctrl (Cmd) + klik čtverec ubere    |
  | Ctrl (Cmd) + A         | vybere všechna hotová obydlí vsi                                 | –                               | –                                  |
  | mezerník + levé tažení | posouvá                                                          | posouvá                         | posouvá                            |
  | prostřední tažení      | posouvá                                                          | posouvá                         | posouvá                            |
  | pravé tlačítko         | zruší výběr                                                      | zruší                           | zruší malování                     |
  | Esc                    | zruší výběr                                                      | zruší                           | zruší tah, pak malování            |
  | F10                    | otevře nabídku hry, zruší výběr                                  | otevře nabídku, zruší           | otevře nabídku, zruší malování     |
  | `[` / `]`              |                                                                  | otáčí po 15° (pozemek celý)     | otáčí mřížku po 15° (všechny)      |
  | Tab                    |                                                                  | pozemek: místo domu (varianta)  |                                    |
  | další                  |                                                                  | Enter postaví                   | Backspace / Ctrl+Z vrátí, Enter    |

  Vždy: WASD / šipky a kurzor u okraje okna posouvají, kolečko i rozevření prstů na trackpadu
  (Ctrl + kolečko, v Safari `gesturechange`) přibližují, Q/E otáčí, R vrátí pohled na ves
  (`setCameraHome`). Malování pole, sadu, hřbitova a ohrady: [ a ] jen před prvním čtvercem
  (pak je mřížka zamčená), nad stavbou stejného druhu se malování chytí její mřížky (`gridAt`,
  drží ji i mimo ni – rozšíření), vybraná stavba dá mřížku hned (`PlacementMode.squares.grid`);
  natočená mřížka má čtverec pod kurzorem ve středu políčka. Ctrl ve výběru obydlí platí i jako Cmd; Ctrl / Shift + klik na cestu či
  pole vybraná obydlí nezruší; Ctrl + A při umisťování nic nevybere. Zkratky staveb Z zemnice, X polozemnice, C pole, V hřbitov, B sad,
  N modla, M svatyně, K humno, O ohrada (modla, svatyně a humno se umisťují půdorysem jako obydlí – `PlacementMode`
  `sacred` a `threshing-floor`; ohrada po čtvercích – O i tlačítko otevřou v mřížce rozcestník druhů zvířat (ovce,
  kozy, prasata, skot, spřežení – bez zkratek), nad ohradou téhož druhu se chytí její mřížky). V otevřené nabídce hry žádná klávesa hry neběží – F10 nebo Esc ji zavře (Tab jen
  po jejích položkách). Rozhraní
  obydlí hned ukáže jako staveniště a akce posílá na server za sebou (fronta v `VillageGame`).

- **e2e:** testy běží v běžícím pomalém světě (2000–2200). Kliknutí do scény při umisťování
  nahrazuje háček `window.__bohemiaE2E.confirmPlacement`, kam kliknout myší pro výběr řekne
  `projectToScreen` (`lib/e2e-hooks.ts`) – existují jen v buildu s `NEXT_PUBLIC_E2E_HOOKS=1`
  (nastavuje `playwright.config.ts`), jinde se z kódu vypustí. Zvěř: `wildAnimals` (meshe
  `wild-*` a kusy, které jsou vidět) a `moveCameraTo` (zvěř bývá u lesa mimo výchozí záběr).
  Testy vývojové ukázky (`slaughter.spec.ts`, `wildlife-scene.spec.ts`) běží jen proti
  vývojovému serveru (`SLAUGHTER_DEV_URL`, `WILDLIFE_DEV_URL`), jinak se přeskočí.

- **Zrušení rozestavěné stavby** (population.md – Zrušení rozestavěné stavby): server action
  `cancelConstruction({ villageId, constructionId })` → `cancelConstructionForPlayer`
  (`lib/village.ts`) → use-case `cancelUnfinishedConstruction`. Pohled `VillageView.constructions`
  nese `penId` a `cancellable`; `selectionDetails` přidá k vybranému poli, hřbitovu, sadu, ohradě,
  humnu, modle, svatyni a staveništi `cancelConstructionId` (u hřbitova a ohrady nejnovější
  stavba – rozšíření) a `SelectionPanel` ukáže `CancelConstructionButton`
  (`hud/RelocationControls.tsx`, `data-testid="cancel-construction"`, křížek bez textu, slova
  jen v `Tooltip`). Stejné tlačítko je u starého domu při stěhování (`RelocationProgress`).

- **Panel ohrady koní** (horses.md – Co hráč vidí): `lib/horse-view.ts` (`horsesView` →
  `VillageView.horses`: koně po kusech s druhem, věkem, výcvikem 0–1, hřebcem a jezdcem, místa, kolik
  ves chce `horsesWanted`, `overRoom` = `horsesOverRoom`, obilí `fed`/`grainKgPerDay`, seno na zimu)
  → `SelectionDetails` `pen.horses` (jen druh `horse`) → `HorsesBlock` v `selection/fields.tsx`:
  místa / chce (červeně při `overRoom`), obilí za den (červeně bez obilí), seno na zimu a chipy koní
  jen z této ohrady (ikony `foal`/`mare`/`horse`, přesýpací hodiny do 12 let, podkova = hřebec). Panel
  jezdce: `details.mount` (věk, výcvik, obilí). Upozornění `horses-short`, `horses-ungrained`
  a z kroniky `foal-born`, `horse-trained`, `horse-retired`, `horse-starved` (`village-notices.ts`,
  počet v `chronicle[].horses`). Ikony koní: `tools/blender/icons.py foal,mare,horse`.
- **Panel ohrady jen druhu ohrady** (issue #3, Martin 22. 10. 2026: „informace v boxu se musí
  týkat jen druhu zvířat v dané ohradě. Slepice se nemusí evidovat nikde“): `SelectionDetails`
  `pen` nese `herd` (`penHerd` – stádo vsi druhu ohrady, skot = krávy, ohrada volů null; voli,
  rádla a vozy dál z `oxenVillage`). Stáda ostatních druhů, slepice, pastva a mléko vsi v panelu
  nejsou; slepice se v UI neukazují nikde (simulace vajec a slepic u obydlí běží dál).
- **Panel dvorce – vojvodova rodina** (lord.md – Co hráč vidí, issue #8): `VillageManor.family`
  (`lib/manor-view.ts`, `manorFamily`) nese obyvatele dvorce od nejstaršího – portrét, role
  (`ROLE_NAMES`: i `voivode-grandson`, `voivode-daughter-in-law`), věk, dovednosti `arms` a `horse`.
  Obyvatele ukazuje `DwellingResidents` v `hud/selection/dwelling.tsx` – **jediný řádek obyvatel
  každého obydlí** (dvorec i běžné; `households[].residents` z `village-view.ts`, `DwellingResident`
  v `lib/person-view.ts`): portrét a věk, popisek role (u mužů rodu jméno), bez dovedností (Martin 24. 10. 2026) a bez řádku počtů rodiny (Martin 25. 10. 2026: „se podle mě duplikují“). Portrét je
  tlačítko – klik vybere osobu (`onSelectTarget({ kind: 'person', id })`, Martin 25. 10. 2026). Dovednosti ukazuje jen panel postavy (`selection/people.tsx`, `PersonArms`)
  z `ScenePerson.arms` / `horse` (`lib/person-view.ts`): muži rodiny od 7 let ikony `luk`, `boj`,
  `jizda` s čísly (popisek „Lukostřelba 64 / 100“), jízda jen u toho, kdo koně má nebo už jezdil. Horní lišta: `LaborTooltip` v `TopBar.tsx`
  doplní popisek „Volná práce“ řádkem s ikonou dvorce (`resources/manor.png`) z `view.lord`
  (`LaborDay.lord`). Kronika: „Vojvodova rodina jde na pole – ves šetří jídlem / nestihne osev“
  a „se vrací k výcviku“. Ikony kreslí `tools/blender/arms_icons.py` (CC0).

## Jména rodu

Pravidla: `docs/design/lord.md` – Jména, Kde se jméno zadává, Kde se jméno ukazuje.

- **Pohled:** `view.dynasty` (`lib/dynasty-view.ts`, `dynastyView`) – `lordId`, `lordName?`,
  `unnamed` (žijící muži rodu bez jména, vojvoda první, pak od nejstaršího – fronta se neukládá),
  `taken` (jména rodu pro kostku) a `waitingHome` (jména ženatých synů v dvorci). Lidé ve scéně
  (`ScenePerson.name`), panel osoby (`SelectionDetails.person.name`) a obyvatelé dvorce
  (`ManorMember.name`) nesou jméno muže rodu; role `voivode-secondary-wife` („Vojvodova vedlejší
  žena“, i ve vlastním domě – `personRoles`).
- **Panel jména** `hud/LineNamePanel.tsx`: portrét, textové pole (výjimka z „bez popisků“), kostka
  „Navrhni jméno“ (`suggestLineName`), fajfka i Enter; důvod u kurzoru z `checkPersonName`
  (`lineNameReason`), Esc zavře (jen ve vsi). `VillageGame`: bez vsi (až po připravení scény)
  panel „Jméno vojvody“ zablokuje mřížku staveb, jméno se pošle se založením (`foundVillage`
  `lordName`); ve vsi se vojvoda bez jména (převod, výprava) nabídne sám jednou za načtení,
  syn přes upozornění. Potvrzení → server action `nameLineMan`.
- **Upozornění:** `lineNameNotice` (`lib/village-notices.ts`) – trvalý řádek `pinned` v
  `hud/NoticeLines.tsx` („Syn vojvody čeká na jméno“ / „Vojvoda čeká na jméno“, číslo od dvou),
  klik otevře panel na prvního ve frontě. „Rodina čeká na dům“ připíše jména `waitingHome`.
- **Předvyplnění:** Začít znovu uloží jméno vojvody do `sessionStorage`
  (`lib/lord-name-memory.ts`, `try/catch`, návrh Clauda – bez portu DB) a panel ho předvyplní.
- **Dům vedlejší manželky** mimo dvorec: popisek portrétu „Dům vedlejší ženy vojvody – Bořivoj“
  (`lordWifeHome`).
- **e2e:** helper `found()` pojmenuje vojvodu (`nameLord`); test „jména rodu“ – důvod, kostka,
  jméno v panelu osoby (háček `selectPerson`), syn bez jména → upozornění → pojmenování.

## Obrazovka porážky – konec rodu

Pravidla: `docs/design/lord.md` – Konec rodu. Základ obrazovky popisuje `docs/code/village-core.md`
(Konec hry).

- **Pohled:** `view.lineEnded` (`lib/line-end-view.ts`, `lineEndView` přes všechny vsi hráče
  v `lib/village.ts`, jen při `gameOver`) – vojvodové po sobě (`lords` – jméno, rok od–do),
  `last` (poslední vojvoda) a ves, kde rod skončil (nejpozdější `endedDay`) – jméno, roky
  založení a konce rodu.
- **Obrazovka:** `hud/DefeatScreen.tsx` s `line` – pod nadpisem „Rod vymřel“ kronika rodu
  („Bořivoj 500–541“, `data-testid="defeat-lords"`, posuvná), „Zemřel Ctibor – poslední muž rodu“
  (`defeat-last`), jméno a roky vsi, jediné Začít znovu. `VillageGame` ji ukáže před variantou
  vymřelé a opuštěné vsi.
- **Předvyplnění:** po konci rodu vojvoda není – Začít znovu zapamatuje jméno zakladatele
  (`lineEnded.lords[0]`) a panel „Jméno vojvody“ ho předvyplní.
- **Kronika vsi:** `line-ended` – „Ve vsi už nežije žádný muž rodu – posledním vojvodou byl …“,
  `village-abandoned` s `reason: 'line-ended'` – „Ves … opuštěna – rod vymřel.“
- **e2e:** test „když vymře rod po meči…“ – muži rodu odstraněni v uložené vsi, kronika rodu,
  ves opuštěná s lidmi jako záznamem, Začít znovu předvyplní jméno.

## Pole uživí ≈ N lidí

Horní lišta (`hud/TopBar.tsx`): ikona lidí (`village-people`) ukazuje „lidí / ≈ N“ (`peopleLabel`),
tooltip `FieldCapacityTooltip`, červeně při `fieldCapacityShort` (lidí víc než N). Rozloha polí
v liště není – ukazuje ji panel pole. Hodnota je `view.fieldCapacity` (`lib/village-view.ts`, `fieldCapacityView`)
z jádra `fieldCapacity` (`packages/game/src/domain/village/field-capacity.ts`; tam i `ROTATION`,
`ROTATION_FACTOR`, `netYieldPerHa`, které kalkulačka přebírá přes `scripts/lib/steady-state.ts`).
`people` se násobí `soil` = min(1; dnešní podíl úrodnosti dílů v oběhu vážený plochou ÷ `averageRotationShare()`,
ustálený podíl = průměr přes periodu skutečné dráhy odpočatého dílu, 34 let, ≈ 0,85); `soil` jde i do view a tooltip ho ukazuje jako ikonu
`fields` s procentem (`field-capacity-soil`). Simulace číslo nepoužívá.
Pravidla: `docs/design/fields.md` – Co hráč vidí.

## Panel pole – označit všechna pole

Martin 24. 10. 2026: „Na panel pole dej tlačítko, kterým lze označit všechna pole na mapě, i když
spolu nesousedí. Zobraz rozlohu právě označeného pole.“ Panel pole (`FieldBody`) i panel dílu
(`FieldPartBody`) v `hud/selection/fields.tsx` mají u výměry tlačítko `selection-all-fields`
(ikona `resources/fields.png`, tooltip „Označit všechna pole“, jen když má ves aspoň dvě pole).
Klik pošle `onSelectTarget({ kind: 'fields', ids })` – `ids` jsou `fieldIds` z detailů
(`lib/selection-details.ts`, všechna pole z `view.fields`). Cíl `fields` (`VillageTarget`,
`village-picking.ts`) obkreslí mez kolem každého pole (`selection-highlight.ts`), `presentTarget`
zahodí zaniklá pole (jedno zbylé je pole) a panel `FieldsBody` ukáže součet výměry
(`selection-area`) a počet polí (`selection-fields-count`). Výměru jednoho pole ukazuje
`selection-area` v panelu pole (ha) a dílu (m²).

## Panel pole a dílu – osevní postup

fields.md – Osevní postup po dílech a setí do konce okna, bod 6 (návrh Clauda, Martin schválil 25. 10. 2026). Data: `fieldViews` (`lib/village-view-fields.ts`) volá jednou `partYearWork`
a `partRotation` z jádra; díl (`VillageFieldPart`) nese `next`, `rest` a `work.surplus`, pole
`turn` – díly na řadě mimo letošní práci podle ozimu a jaře, odpočívající příloh (pod 95 %)
a díly letošní práce nad potřebu podle obilí. `selectionDetails` z nich dělá `next`, `rest`,
`surplus` (díl) a `turn` (jen nenulové) a `resting` (pole). Panel (`hud/selection/fields.tsx`):

- **Díl** (`FieldPartBody`) – řádek osevního postupu: `selection-sown-years` (ikona `date`,
  „N. osev oběhu“), `selection-next` – ikona plodiny (`Flag`, popisek „Příště – jař“) nebo úhor
  čtverečkem barvy mladého přílohu (`FallowStat`) s odpočinkem k 95 % (popisek „osev za ≈ N
  let“), `selection-surplus` (ikona `hourglass`, „Jen z volné práce – stavby mají přednost“).
- **Pole** (`FieldBody`) – seznam „Na řadě“ pod díly podle stadia: `selection-turn-winter` /
  `selection-turn-spring` (ikona plodiny s počtem, v popisku „nad potřebu letos N dílů“)
  a `selection-resting` (čtvereček přílohu s počtem).

Návrh Clauda: „na řadě“ v poli jsou díly, které čekají mimo letošní práci (díly letošní práce
počítají plodiny); nad potřebu v popisku jsou díly letošní práce nad potřebu té plodiny – díl na
řadě, který ves vezme z volné práce, se tam přesune. Ukázky `/dev/panels?panel=pole`,
`pole-dil`, `pole-dil-na-rade`.

## Panel pole a dílu – očekávaná úroda a jestli práce stačí

fields.md – Co hráč vidí, Očekávaná úroda a jestli práce stačí (návrh Clauda, 2. 11. 2026). Data:
`fieldViews(state, day, coverage, landscape)` (`lib/village-view-fields.ts`; `buildVillageView`
předá `summary.crafts.coverage` a krajinu) volá jednou `fieldOutlook` z jádra (`field-outlook.ts`
– `village-fields.md`) se stejným `partYearWork`. `partOutlookView` → `VillageFieldPart.outlook`
(`PartOutlookView`: kg a `fullKg` celé, vlivy `weather` / `wildlife` / `disasters` / `work`
v celých procentech, nulové chybí; `short` – `WorkShortfallView` s celými člověkodny, pod půl dne
okno chybí). `fieldOutlookOf` → pole `outlook` (`FieldOutlookView`: kg po plodinách v pořadí ozim,
jař, luštěniny, len; okna sjednocená podle měsíce konce). `selectionDetails` je předá jako
`outlook` dílu i pole. Slova jsou v `lib/field-outlook-labels.ts` (`outlookYieldLabel`,
`shortfallLabel`, `fieldOutlookLabel`; měsíc `monthGenitive` z `lib/game-date.ts`). Panel
(`hud/selection/fields.tsx`):

- **Díl** – v řádku letošní práce za sklizní `selection-outlook` (ikona `sheaves`, kg; popisek
  „Očekávaná úroda – jař (kg): z úrodnosti 1 800; počasí −20 %; zvěř −5 %…“) a `WorkShort`
  (`selection-work-short` – ikona `labor`, „−N“ červeně, `data-alert`; popisek „Práce nestačí:
  příprava a setí do konce dubna – chybí 40 člověkodnů, orba 3 člověkodny; …“).
- **Pole** – pod řádkem výměry `selection-outlook` se součtem jídla (obilí a luštěniny, len jen
  v popisku jako třený) a `WorkShort` z oken pole.

Testy `hud/__tests__/FieldOutlook.test.tsx`, pohled `village-view.test.ts` („očekávaná úroda
a práce“). Ukázky `/dev/panels?panel=pole`, `pole-dil`.

## Vozy, uhlí, keramika a nářadí mimo lištu

Martin 24. 10. 2026: počet vozů ne na liště, ale v ohradě s voly; uhlí u uhlíře; keramiku a
dřevěné nářadí nikde. Vozy: panel ohrady spřežení (`PenBody`, `oxen.carts` / `cartTargets`:
„má / chce“ po druzích); ves bez ohrady volů má vozy v panelu tesaře (`CarpenterStats`: vozy vsi
/ potřeba, na cestě). Uhlí: `selection-workshop-stock` v panelu dílny uhlíře (a hřivny u kováře).
Panely dílny keramiky a tesaře zásobu výrobku neukazují; simulace je beze změny.

## Výpis výběru do konzole

Martin (24. 10. 2026): „když označím nějaký objekt, chtěl bych vidět v konzoli jeho typ a ID – abych
ti třeba mohl říct, který úsek cesty zlobí“. Klik do scény (`VillageGame` – `scene.onSelect`) vypíše
`console.info('[výběr]', …)` z `describeTarget` (`lib/scene/village-selection.ts`): typ cíle
(`VillageTarget.kind`) a jeho id, u cesty id cesty hráče, všechny úseky řetězu (`roadChainIds`),
úsek pod kurzorem (`segment` – nastavuje `pickVillageTarget`) a oba konce cesty z pohledu na ves
(třetí parametr – `VillageView.roads`, `VillageRoadEnd.log`), např. `road 780 – úseky 780, 812 – od
dwelling 12 do junction 565` (konec nikam je `nikam`).

## Konce cesty v panelu cesty

Martin (25. 10. 2026): „Žádná cesta nemůže existovat jen tak sama v prostoru, vždycky musí spojovat
dvě místa – kombinaci budov a křižovatek. Pokud cestu označím, měl bych v panelu cesty vidět, která
místa to jsou a moci je také označit.“ ([paths.md – Síť – kotvy](../design/paths.md#síť--kotvy-pahýly-a-úklid-pravidlo-11)).

- **Jádro** – `paths/road-ends.ts`: `chainEnds(net, chain)` / `roadChainEnds(net, roadId)` vrátí
  `RoadEnd` pro oba konce řetězu (`chainEndPoints` – podle směru úseků v řetězu): `junction` (úsek
  v `RoadJunction.arms`, do `JUNCTION_END_M` a blíž než druhý konec úseku), `place` (nejbližší
  kotva z `roadAnchors` v dosahu – nejméně `TERMINUS_M` jako `anchorTermini`; `RoadAnchor.place` je
  klíč trasy – `from` na začátku, `to` na konci), `edge` (kotva `edge:<směr>` nebo pás kraje –
  `edgeDirectionAt`, totéž co `nearAnchor`), `road` (jiný úsek do `END_SNAP_M`), jinak `none`.
  Síť `roadEndsNetwork(state, landscape)` – kotvy z uložených tras. Druhá logika kotev tu není.
- **Pohled** – `lib/road-end-view.ts`: `roadEndView` udělá z `RoadEnd` `VillageRoadEnd` (název do
  popisku, ikona, `target` pro výběr, `log` pro konzoli); klíče tras → `VillageTarget` (`d:` /
  `dwelling:` / `site:` obydlí – „Obydlí – polozemnice“, jinak `site:` humno; hřbitov, ohrada,
  humno, modla a svatyně – `sacred`, obilná jáma, pole, sad, posvátný dub, háj, milíř); voda, les,
  louka a pastva bez výběru; jiná cesta → id cesty hráče (`roadChainIds`). `VillageRoad.ends`
  počítá `roadViews` (`village-view-roads.ts`); tam jsou i `JUNCTION_NAMES` / `JUNCTION_ICONS`.
- **Panel** – `RoadEndIcon` (`selection/roads.tsx`) na začátku prvního řádku `RoadBody`: s cílem
  `TargetButton` (klik → `onSelectTarget`), kraj mapy šipka směru (`DIRECTION_NAMES`), nikam
  červené „!“ (`data-alert`) s popiskem „Cesta tu nikam nevede.“; `data-testid`
  `selection-road-end-0` / `-1`, `data-end-kind`. Náhled `/dev/panels?panel=cesta`.
- **Testy** – `road-ends.test.ts` (budova, křižovatka, krátký úsek k bráně, kraj mapy, voda, jiná
  cesta, nikam), `road-end-view.test.ts`, `RoadPanel.test.tsx`, `RoadEnds.behavior.test.tsx` (klik
  vybere cíl), `village-selection.test.ts` (výpis), e2e `village.spec.ts` – „panel cesty ukáže oba
  konce“ (testovací háček `selectRoad`).

## Klučení lesa v panelu a liště

Forest.md – Klučení lesa pro pole. Panel dílu (`selection/fields.tsx`, `ClearingStageFlag`):
kácení = ikona `wood` s počtem stromů, které zbývá pokácet, schnutí = `hourglass` s datem pálení
v popisku („pálí se od 1. března 500“), pálení = `fire` (`resources/fire.png`, render
`icons.py fire`, CC0). Panel pole (`ClearingCounts`): počty čtverců v jednotlivých fázích, jen
běžící. Horní lišta: popisek klád `woodName` – „u vsi N, u lesa M“, když leží hromada u lesa.
Kurzor při malování pole (`fieldCost` v `build-items.ts`, `PlacementCost.burn`, `CursorReason`):
ikona ohně s počtem čtverců lesa, které se vykácí a vypálí. Ukázky `/dev/panels?panel=pole`,
`pole-dil-kaceni`, `pole-dil-schne`, `pole-dil-pali`.
E2E (`village.spec.ts` – „pole v lese ve fázi pálení“): pole v lese zapsané přímo do uložené vsi
ve fázi pálení (mimo březen–říjen posun času hráče `player_time_offset`), kamera k lesu klikem do
minimapy, klik na čtverec – panel dílu ukáže ikonu ohně.

## Divoká zvěř v rozhraní (W9, `lib/wildlife-view.ts`)

Návrh: [wildlife.md](../design/wildlife.md) – Co hráč vidí. Pohled jen čte stav (žádný přepočet krajiny).

- **Panel druhu zvěře** (`SelectionDetails` `kind: 'wildlife'`, `VillageTarget` `{ kind: 'wildlife', species }`, `selection/wildlife.tsx` – `WildlifeBody`): ikona druhu z `/icons/resources/` třikrát,
  podle stupně plná (málo ≤ ⅓ stropu, středně ≤ ⅔, hodně; nad stropem „plno“ = `full`, návrh Clauda), v popisku
  „Les uživí N“, loňská škoda v kg obilí (prasata, jelení zvěř) a strhnutý dobytek letos (vlci). Přesné
  kusy se nikde neukazují. `wildlifeView(state, day)` → `VillageView.wildlife` (`species[]`, `damageShare`,
  `wolvesTroubling`, `dogsUnfed`). Klik na zvíře ve scéně přijde s W10; dokud není, panel jde ověřit na
  `/dev/panels?panel=zver-prase` (`zver-vlci`, `zver-medved`).
- **Panel dvorce:** `huntView` → `VillageManor.hunt` (`ManorHunt`): ikony úlovků letos s čísly (prasata, jelení zvěř,
  vlci, medvěd, zajíci, ryby v kg), maso v kg a smečka „6 / 7“ (psi / kolik jich dvorec chce; v popisku obilí
  za den, červeně a „jsou bez obilí“, když ji ves nenakrmila). Bez psů a úlovku řádek chybí. Tlačítko
  lovu navíc (`manor-hunt`) je z W5.
- **Panel dílu:** `fieldDamageViews` → `VillageFieldPart.damage` → `FieldDamage`: ikona prasete a škoda letos v %
  (červeně od 10 %, popisek kg a vzdálenost k lesu), ikona ohně (`watch-fire`), když se díl dnes hlídá
  (noční hlídka, 1. 6.–31. 8.). Díl mimo ohrožení škodu nemá.
- **Upozornění** (`village-notices.ts`): `boar-damage` „Divoká prasata ničí úrodu“ (průměrná škoda dílů u lesa
  letos > 5 %, vážená plochou), `wolves-killing` „Vlci strhávají dobytek“ (2 kusy za 30 dní), `dogs-ungrained`
  „Psi jsou bez obilí“.
- **Kronika** (`village-view-chronicle.ts`): „Medvěd se vrátil do lesů.“, „Zvěř a vrány zničily letos N kg
  obilí na polích.“; úlovek se jménem lovce, strhnutý dobytek a zranění na lovu z W4–W5.
- **Dev panely:** `/dev/panels?panel=dvorec` (lov a psi), `pole-dil` (škoda a oheň), `zver-prase`, `zver-vlci`, `zver-medved`.
- **Testy:** `lib/__tests__/wildlife-view.test.ts`, `components/game/hud/__tests__/WildlifePanel.test.tsx`,
  upozornění ve `village-notices.test.ts`; e2e „díl pole ukáže škodu zvěře letos“ a psi v testu lovu navíc.

## Počasí a pohromy v rozhraní (P10, `lib/disasters-view.ts`)

Návrh: [disasters.md – Co hráč vidí](../design/disasters.md). Jádro a čísla: [village-disasters.md](village-disasters.md).

- **Lišta** – `VillageView.weather` (`weatherView`): jen neobvyklé a už vidět (`revealedWeather` – 30. 4. sucho chybí), povodeň (`disasters.flood`), dokud ve vsi leží voda a bahno
  (`FLOOD_SCENE_DAYS`). `TopBar` → `WeatherIcons` za štěstím: ikona zimy, léta a vody
  (`WEATHER_ICONS` – `drought`, `rain`, `frost`, `good-summer`, `flood`), slova jen v popisku
  (`summerLabel` – změny úrody a sena z `WEATHER.summerEffects`, `winterLabel`, `floodLabel` –
  „Stoletá voda – 2 m nad hladinou“). Testy `village-weather-summer` / `-winter` (`data-weather`),
  `village-flood` (`data-level`).
- **Panel dílu** – `VillageFieldPart.protection` (`partProtectionView`: zeleň po stupních 0–4,
  `water`, `lowland`, `raised`, `slope`; díl bez údaje typická zeleň; ves bez počasí kraje nic)
  → ikona `protection` s číslem, popisek `protectionLabel`. `VillageFieldPart.losses`
  (`partLossesView` – počasí, které je vidět, s ochranou dílu a plodinou roku sklizně; kroupy,
  povodeň, smršť z `disasters.losses`) → řádky `partLossRows` jako škoda zvěře („−60 %“, červeně
  od 10 %, dobré léto „+15 %“), testy `selection-protection`, `selection-loss-*`.
- **Obchod** – `VillageNeighbour.dearth` (`tradeDearth` – rok obchodu od 1. 11., tedy vždy minulé
  léto): ikona `dearth` u jména souseda (`NeighbourName`), popisek `dearthLabel` z `DISASTER_TRADE`.
- **Upozornění** (`village-notices.ts`, `DisasterNoticeKind`): z počasí, které se ukázalo
  (`weatherNotices` ve `villageNotices` – ohlásí se, když nově vznikne): „Sucho – nejvíc trpí pole
  bez stromů“ (sucho i kruté sucho), „Mokré žně“, „Holomráz – ozim vymrzá“; z kroniky
  (`disasterNotices`): „Kroupy potloukly obilí“, „Povodeň – stoletá voda“, „Smršť“ / „Silná smršť“,
  požár v jeho den „Hoří!“ (`fire`), den po něm nebo celý mezi pohledy „Vyhořel dům“ / „Vyhořely
  2 domy“ (`fire-out`). Zápisy kroniky v pohledu nesou `level`, `strength`, `parts`, `dwellings`
  (`disasterChronicleFields`). Z jiné vsi hráče `VillageListItem.disasters`
  (`otherVillageDisasters` – počasí a poslední místní pohroma) se jménem vsi.
- **Ikony** – `tools/blender/icons.py` (`drought`, `rain`, `frost`, `good-summer`, `flood`, `hail`,
  `tornado`, `protection`, `dearth`; vlastní, CC0), požár má stávající `fire`.
- **Vývojový režim** – tlačítka „Vynutit zlý rok“ a „Vynutit pohromu“ (`DevDisasterButtons`)
  vedle skoku v čase: [accounts.md – dev mód](accounts.md).
- **Testy** – `disasters-view.test.ts`, `village-notices.test.ts` (počasí a pohromy),
  `village-view.test.ts` (JSON 30. 4. bez sucha, seedu a `override`); e2e `village.spec.ts`
  „vývojový režim: vynucené sucho“ – ikona na liště, upozornění a ochrana v panelu dílu.

## Správce vsi v rozhraní (S8, `hud/StewardToggle.tsx`)

- Server action `setSteward({ villageId, on })` → `VillageGame.toggleSteward` (`runAction`, pohled se obnoví).
  `VillageView.steward = { on, built }` (`built` = id staveb a dílů se značkou, `isStewardBuilt`).
- **Přepínač** `StewardToggle` (ikona klíče `public/icons/resources/steward.svg`, zapnutý svítí,
  vypnutý `opacity-40`, popisek „Správce“): v `VillageList` u každé žijící vsi (`VillageListItem.steward`)
  a v panelu dvorce vojvody (`SelectionDetails.steward`, jen `dwelling` s `manor`). `StewardBadge` je
  ikona vedle jména vybrané vsi v `VillageSwitcher`, když správce běží.
- **Značka „Postavil správce“** (`StewardBuiltMark`): `withSteward` v `selection-details.ts` nastaví
  `stewardBuilt` cílům dwelling/site/field/field-part/cemetery/orchard/pen/road, jejichž `id` je ve
  `view.steward.built`; `SelectionPanel` ji ukáže vpravo nahoře vedle Zrušit stavbu.
- e2e: `village.spec.ts` – „správce vsi – zapnutí a vypnutí přepínačem…“.

## Panel „Rod a vazalové“ (úloha 1.10, `hud/HousePanel.tsx`)

- **Lišta:** tlačítko praporu (`TopBar` prop `house`, `data-testid="house-toggle"`) s počtem vazalů;
  pečeť s počtem čekajících věcí (`house-waiting`) se ukáže, až když něco čeká (první verze: nikdy,
  jednání přijdou ve fázi 3). Otevřený panel zavře nabídku hry a naopak; Esc panel zavře.
- **Panel** (`hud-panel` vpravo pod lištou, `role="dialog"` „Rod a vazalové“): řady se značkou
  s popiskem – **Rod** (portréty mužů od 16 let, popisek „Jan, 34 let“), **Páni** (bez pánů praporec
  s popiskem „Nezávislý“), **Vazalové**, **Hráči** podle vzdálenosti (portrét hlavy rodu, štít
  s počtem mužů; popisek s jménem a vzdáleností), **Pozvánky** (pečeť s volnými místy – klik vydá
  kód; kód po čtveřicích je text, tlačítko kopírovat dá do schránky `…/register?pozvanka=KOD`
  z `window.location.origin`; přesýpací hodiny se zbývajícími dny; křížek ruší; u využitých pozvánek
  portrét pozvaného a ikona nástupnictví, když se rozehrál). Důvod odmítnutí (limit kódů) je
  v popisku tlačítka a pod ním. Tlačítka Vypovědět, Nabídnout vazalství, Obchod, Blokovat a jednání
  zatím nejsou.
- **Data:** `VillageGame` načte `HouseView` při otevření hry (počet vazalů v liště), při otevření
  panelu, po vydání a zrušení kódu a po každém novém upozornění mezi hráči. Klik na upozornění
  `invite-accepted` / `invitee-played` (`noticePanel` = `'house'`) panel otevře.
- **Ikony** `public/icons/house/` (banner, seal, shield, hourglass, cross, succession, copy, hands, handshake, pen, gate – vlastní
  kresba, CC0, zdroj v `public/icons/LICENSES.md`).
- Testy: `hud/__tests__/HousePanel.behavior.test.tsx`, `lib/__tests__/house-view.test.ts`;
  e2e `e2e/multiplayer.spec.ts` (A vydá kód → B se zaregistruje s kódem → vazalství a upozornění →
  C vidí oba v seznamu hráčů).

## Jednání v panelu Rod a vazalové (úloha 3.4)

Návrh: [vassalage.md](../design/vassalage.md) – Co hráč vidí. Rozhodnutí (kdo je na tahu, důvody
zašednutí) jsou v `packages/game` ([world.md](world.md) – Panel, Jednání); web jen zobrazuje.

- **Data:** `housePanel` vrací i `negotiations` (`PanelNegotiation`: id, `other`, `myTurn`, `items`,
  `message`, `rounds`) a `actions[houseId]` (`PanelPlayerActions`: `offer` / `request` = důvod z
  `canOpen` nebo `null`, `blockedByMe`) pro rody v `others`. `lib/house-view.ts` z nich složí
  `HouseView.negotiations` (na tahu první), `ownHouseId`, `HouseLinkView.actions` a `waiting`
  (počet jednání na tahu – pečeť v liště).
- **`lib/negotiation-view.ts`:** `negotiationView`, `termRows` / `termRowLabel` (popisek řádku z
  pohledu hráče: „Ctibor se stane tvým vazalem“ / „Staneš se vazalem rodu …“), `openingTerms`
  (nabídka = hráč pán, žádost = hráč vazal).
- **`hud/TermsForm.tsx`:** formulář podmínek (řádky + `textarea` vzkazu do `NEGOTIATION.messageMaxChars`
  – výjimka z „bez popisků“, vzkaz je text hráče). **`TERM_ROWS: Record<TermItem['kind'],
TermRowComponent>`** je registr řádků: nový druh podmínky = nová komponenta v registru (řádek
  dostane `item`, `label`, `onChange` – u karty ke čtení chybí). Přísaha je zatím jen pečeť bez
  úprav (role se v protinávrhu nemění).
- **`hud/NegotiationCard.tsx`:** druhá strana, řádky, vzkaz; na tahu **Přijmout** (podaná ruka),
  **Odmítnout** (křížek), **Protinávrh** (pero, otevře `TermsForm`), jinak **Stáhnout**.
- **`HousePanel.tsx`:** klik na hráče v řádku Hráči ukáže lištu **Nabídnout vazalství** (pečeť),
  **Požádat o přijetí** (sepjaté ruce), **Blokovat** (zavřená brána); zašedlé tlačítko nese důvod u
  kurzoru (`Tooltip denied`, `data-reason`). Řádek **Jednání** (pečeť) s kartami je nad Hráči.
  Chyba akce je řádek `house-error` nahoře v panelu.
- **Server actions** (`app/game/actions.ts`, hráč jen ze session, den z `playerToday`):
  `openNegotiation({ to, items, message })`, `answerNegotiation({ negotiationId, answer:
accept | reject | withdraw | counter, items?, message? })`, `blockHouse({ target })`; vstup parsuje
  `lib/house-input.ts` (`parseTermItems`, `parseMessage` …), composition root `lib/house.ts`.
  `VillageGame` po každé akci obnoví pohled panelu.
- Testy: `lib/__tests__/negotiation-view.test.ts`, `hud/__tests__/NegotiationCard.behavior.test.tsx`,
  `housePanel` v `application/__tests__/house-panel.test.ts`; e2e `e2e/multiplayer.spec.ts` (A
  nabídne → B protinávrh → A přijme; C odmítne a A vidí „Odmítl – zkus zítra.“; C zablokuje A a A
  vidí „Zablokoval tě.“).

## Podmínky vazalství v panelu (úloha 4.2, `hud/TermsForm.tsx`, `hud/HousePanel.tsx`, `lib/terms-view.ts`)

- `lib/terms-view.ts` (čistý modul): `BUNDLE_SLOTS` (11 políček svazku – obilí, seno, krávy, voli,
  koně, klády, muži, ženy, rodiny, robota; ikona a jednotka), `termChips` / `lineChips` (ikona
  s číslem a popiskem: klas s kg, kláda s počtem, meč s muži × dny, ves s klíčem; odměna je slabší),
  `hungerLabel` (sytý rod ikonu nemá), `breachLabel`.
- `TermsForm.tsx`: registr `TERM_ROWS` – `BundleRow` (dávka, odměna), `ServiceRow`, `TargetVillageRow`
  (výběr ze svých vsí jen pro pána). `TermsContext` nese `lordIsOwn`, vsi hráče a `loadSpare`; výhled
  „kolik můžu postrádat“ (server action `houseSpare`) se načte při otevření formuláře s dávkou, kterou
  platí hráč (vazal dávku, pán odměnu), a ukáže se **šedým číslem** pod políčkem. Řádky se přidávají
  ikonami `terms-add-*`, odebírají křížkem (přísaha ne).
- `HousePanel.tsx`: páni a vazalové jako `AgreementEntry` (portrét + ikony podmínek + zlomená pečeť
  s počtem neplnění + ikona hladu); strom pod hráčem v pořadí `orderTree`, hloubka ≥ 2 odsazená
  (`house-subvassal`, bez akcí). Klik na pána / přímého vazala → `AgreementActions`: **Nové podmínky**
  (formulář nad podmínkami dohody bez přísahy → `openNegotiation`; do přijetí platí staré) a
  **Vypovědět** (vzkaz + potvrzení druhým tlačítkem `renounce-confirm` → `renounceVassalage`).
- Testy: `lib/__tests__/terms-view.test.ts`, `hud/__tests__/TermsForm.behavior.test.tsx`,
  `HousePanel.behavior.test.tsx`; e2e `multiplayer.spec.ts` (podmínky, nové podmínky, vypovězení).

## Seniorát v rozhraní (úloha 2.3, `hud/rights.tsx`)

- **Práva z jádra:** `VillageView.rights = { allowed, reason }` (`VillageRightsView`) skládá `viewOf`
  v `lib/village.ts` z `villageAccess` (`packages/game/src/application/rights.ts`, stejné jako
  `requireRight` v akcích; `villageAccessForPlayer` v `lib/game.ts`). Web nic nerozhoduje, jen
  zobrazuje. `reason` je „Rozhoduje Bořivoj.“ (nesenior) / „Ves vede Ctibor.“ (senior v cizí vsi);
  `buildVillageView` bez `context.rights` dá všechna práva (dev náhledy, testy).
- **Zašednutí:** `RightsProvider` v `VillageGame` (hodnota `view.rights`), `useRightDenied(right)`
  vrací důvod, nebo null. `Tooltip` má prop `denied` – místo obsahu ukáže červený důvod
  (`data-testid="rights-reason"`), tlačítko dostane `disabled`. Pokrytá práva (`ACTION_RIGHTS`):
  `build` – `BuildGrid` (i zkratky – `startBuild`), zrušení stavby, vylepšení cest / vozová cesta /
  jabloně (`selection/roads.tsx`), zemská stezka (`TrailCompass`); `evacuate` – Přestěhovat
  a Odejít (`RelocationControls`); `sendSons` – odchod se synem (`LeaveCompass right`);
  `nameSons` – `LineNamePanel`; `steward` – `StewardToggle` (jen zobrazená ves; ves v seznamu
  jiná než zobrazená právo nezná, rozhodne server), přejmenování vsi, lov navíc; `trade` – Vyslat
  výpravu (`NeighbourTrade`). Pohled na ves a výběr zůstávají – dívat se smí každý hráč rodu.
- **Stolec:** `public/icons/house/throne.svg` (vlastní kresba, CC0). `VillageListItem.senior`
  (`villageListItem(…, seniorVillageId)` z `House.senior`) → stolec u vsi seniora v `VillageList`
  (popisek „Senior rodu“) vedle praporce „Tvůj muž“.
- **Panel rodu:** `PanelMan` nese `villageId` a `personId`; `housePanel` vrací `own.senior`,
  `own.lord` a `own.successionCredits` (`SuccessionCreditRepository.unused`). `houseView` řadí muže
  od nejstaršího, `PortraitView.senior` / `.lord` kreslí stolec / praporec na portrétu, popisek
  „Jan, 34 let – Ves“. Klik na portrét → `onSelectVillage` → `switchVillage`. Pečeť s počtem
  (`house-succession-credits`, popisek „Nástupnictví bez losu“) jen při počtu > 0.
- Testy: `lib/__tests__/house-view.test.ts`, `hud/__tests__/HousePanel.behavior.test.tsx`; e2e
  `village.spec.ts` – „seniorát – v cizí vsi rodu stavební lišta zašedne s důvodem…“.

## Odchod mladšího syna po pohřbu (úloha 2.5, `hud/RelocationControls.tsx`)

- `VillageView.pendingDeparture` (`PendingDepartureView` v `lib/departure-view.ts`, počítá
  `pendingDepartureView` ze stejného náhledu jako odchod syna, `sonDeparturePreview` s `fatherId`)
  je jen ve vsi, kde syn čeká (`House.pendingDeparture.villageId`; přidává `viewOf` z `villageAccess`).
- `PlayerDeparturePanel` nahoře uprostřed: přesýpací hodiny (`icons/house/hourglass.svg`) s dny do
  konce lhůty (popisek v `Tooltip`), obrys obydlí dílu ve scéně (`setSonPreview` jako u řady synů),
  syn bez jména napřed panel jména (`LineNamePanel`), pak růžice `LeaveCompass` (právo `sendSons`).
- Server action `choosePlayerDeparture` (`app/game/actions.ts` → `choosePlayerDepartureForPlayer` v
  `lib/village.ts`, vstup `{ villageId, direction, sonName? }` parsuje `parseChoosePlayerDepartureInput`).
  e2e: `village.spec.ts` „mladší syn po pohřbu zvolí směr“ (stav po smrti otce zapsaný přímo do DB).
