# Web a rozhraní – server actions, HUD, ovládání, e2e

Mapa kódu – podrobnosti k mechanikám (přesunuto z CLAUDE.md 21. 10. 2026). Pravidla a rozhodnutí: vision.md, accounts.md v `docs/design/`.

- **Rozložení server actions** (refaktoring 11. 11. 2026, chování beze změny): akce jsou v
  `app/game/actions/`, každý soubor má `'use server'` (exporty jen async funkce) – `view.ts`
  (`getVillageView`, `selectVillage`, `getPanelOptions`, `getChronicle`, `getNotices`,
  `chooseLanguageAction`; ořez pohledu o to, co klient zná), `village.ts` (stavby, pole, cesty,
  osoby, odchody, `foundVillage`, `restartGame`, …), `fortification.ts` (hradby), `army.ts`
  (panel vojska, tažení, pokyny, `orderBreakout`), `alarm.ts`, `house.ts` (rod, pozvánky, jednání,
  stížnosti, správce, nováček), `market.ts` (`getMarketOverview`, `sendMarketExpedition`,
  `orderArms`, `offerSlaves` – trh),
  `vassalage.ts` (odvody, svolání, průchody, odúmrť, ochrana),
  `dev.ts` (jen `devMode`: `forceDevDisaster`, `skipTime`). Sdílené pomocníky (`playerId`,
  `villageAction`, `NOT_SIGNED_IN`, kontroly tvaru `isId`/`isRecord`/`isText`) drží
  `actions/_shared.ts` **bez** `'use server'` (v takovém souboru smí být exportem jen async
  funkce). `app/game/actions.ts` je tenký re-export `export * from './actions/…'` bez
  `'use server'`, takže importy `@/app/game/actions` i `vi.mock` v testech zůstaly. Novou akci
  přidat do souboru své oblasti a do tohoto přehledu; nový soubor doplnit do re-exportu.
- **Rozložení `VillageGame`** (refaktoring 11. 11. 2026, chování ani vzhled beze změny):
  `components/game/VillageGame.tsx` jen skládá hooky a panely z `components/game/village-game/`
  (props i pořadí prvků v DOM jako dřív). Hooky podle skutečných vazeb mezi stavy:
  `use-village-sync.ts` (`useVillageSync` – stav vsi, `viewRef`, `applyVillage` s trasami vozů
  z `cartRouter`, `poll` + `refreshNow` z událostí serveru a hlídače dne, fronta `runAction` /
  `runBuildAction`, háčky `cartRoutes` a `pollVillage`), `use-notice-lines.ts` (mizející řádky nahoře – `pushNotice`,
  `mergeNotices`), `use-house.ts` (`useHouse` – pohled rodu, `refreshHouse`, stav nováčka
  a nové načtení po umístění, odúmrti, pozvánky, `negotiate`), `use-panels.ts` (`usePanels` –
  nabídka, rod, válka a odvody se střídají; průchody, ochrana, `warAction`, dialog Odvody),
  `use-player-notices.ts` (`noticeTick`, `showPlayerNotices`, `openNoticePanel`),
  `use-history-panels.ts` (kronika a upozornění, `closeNoticesRef`, zkratky J / U; panel Kronika `hud/ChroniclePanel.tsx` je standardní dialog `hud/Dialog.tsx` (společný s nabídkou hry: titulek, křížek vpravo nahoře „Zavřít (Esc)“, závoj, klik mimo a Esc zavírají, obsah se posouvá; kronika je široká 48 rem, nejvýš 92 % šířky okna) – a záznamy jednoho dne seskupuje pod jedno datum, `groupByDay`),
  `use-war-watch.ts` (`useWarScene` → `setWar`, „Probít se“, sledování cizí mapy,
  `armyActions`), `use-line-naming.ts` (jména rodu, `founderNameRef`), `use-pending-sites.ts`
  (staveniště čekající na server, `sceneVillage`, `placementScene`, `buildDwelling` …),
  `use-scene-sync.ts` (hodiny, ves a návrat R do scény; e2e háčky scény), `use-selection.ts`
  (výběr, `followConstruction` při vykreslení, postava a spřežení, `sonPreview`),
  `use-wagon-preview.ts`, `use-gate-mode.ts` (`gateFort`), `use-build-mode.ts`
  (`useBuildMode` – `SUBMIT_SQUARES`, `buildGroup`, `startBuild` – u mezery opevnění úsek od brány k bráně, konec
  umisťování ve vymřelé vsi), `use-village-hotkeys.ts` (F10, Esc, Ctrl + A, zkratky staveb přes
  ref), `use-village-switch.ts` (`switchVillage`, výběr dvorce z upozornění varování),
  `use-alarm-actions.ts`, `use-dev-controls.ts`, `use-panel-source.ts`, `use-premium-intro.ts`,
  `use-sound-toggle.ts`. Bez hooků: `village-commands.ts` (`villageCommands` – obsluhy panelu
  výběru a akce vsi, `STRUCTURE_USE_ACTIONS`; vznikají při každém vykreslení jako dřív),
  `session.ts` (Začít znovu, odhlášení), `scene-village.ts` (`withPending`,
  `squareStructures`, `extendsSelectedPen`), `village-data.ts` (`VillageData`,
  `CONNECTION_FAILED`). Komponenty: `VillagePanels.tsx` (nabídka, válka, kronika, upozornění,
  rod, odúmrť, odvody – v tomto pořadí), `FoundingPanels.tsx` (jazyk, nováček, jména),
  `GameOverScreen.tsx`. **Pořadí hooků = pořadí efektů scény** (válka → hodiny → ves → R →
  výběr → náhled vozové cesty → brána) – nový hook se scénou zařadit podle toho. Celé
  `VillageGame` obaluje `ServerEventsProvider` (`app/game/page.tsx`; server-events.md – Klient):
  efekty hooků hry (rozsah spojení, posluchači událostí) běží dřív než jeho efekt, který spojení
  pustí – první spojení tak má hned rozsah zobrazené vsi. Cyklus „dotaz
  na ves potřebuje obsluhu upozornění, panely potřebují `viewRef`“ řeší ref
  `playerNoticesRef` ve `VillageGame` (jako dřív `openAlarmRef`). ESLint hlídá hooky
  i v `apps/web/components/**/*.ts`.
- **Web:** server actions `app/game/actions.ts` (`getVillageView`, `selectVillage`, `foundVillage`,
  `placeDwelling`, `cancelConstruction`, `leaveVillage`,
  `settleJourney`, `placeWorkshop` (vstup `{ craft, position, type? }` – `type` `vypleteny` | `srub` je nadzemní dílna, `parsePlaceWorkshopInput`; nabídka staveb nese `BuildOption.variants.vypleteny` / `.srub` s cenou a rokem),
  `placeField`, `placeCemetery`, `placeOrchard`, `placeSacred`, `placePen`,
  `buildTrail`, `declareHunt`, `renameVillage`, `nameLineMan` → `VillageView` / `null` / `{ error }`; `restartGame(input?)` → `{ ok: true }` /
  `{ error }`). **Každá akce nad vsí nese `villageId`** (UUID – `villageIdOf` v
  `lib/village-input.ts`) a server ověří, že ves patří hráči (`context` v `lib/village.ts` →
  `findPlayerVillage`); `getVillageView({ villageId: null })` = první ves hráče (zakládá-li ves,
  null), založení první vsi jde na sídelní sídlo. Odpověď dotazu na ves (`getVillageView` s `withNotices: true`) nese i nepřečtená upozornění mezi hráči (`playerNotices`) a při doručení je označí za přečtená (`docs/code/world.md`). Rod vojvody (lord.md – Jména): `foundVillage`
  přijímá volitelné `lordName` (`parseFoundVillageInput`; písmena ověří use-case, bez jména vojvoda
  čeká) a ves zakládá vždy vojvoda s manželkami a syny; `nameLineMan({ villageId, personId, name })`
  pojmenuje vojvodu nebo jeho syna (`parseNameLineManInput` → `nameLineManForPlayer` → use-case
  `nameLineManInVillage`); `declareHunt({ villageId })` vyhlásí lov – honci chybí v práci vsi
  zítra a lov běží ve výpravě vsi (`parseDeclareHuntInput` → `declareHuntForPlayer` pod zámkem
  hráče – závislosti jako u výpravy, `now` – → `declareHuntInVillage`, journey.md – Lov; tlačítko
  `manor-hunt` v `ManorUpgrades`; důvod odepření dává pohled `VillageManor.huntDenied`). Povede se –
  pohled na ves; odepřený – `{ refused: DeclareHuntRefusal }` a server action z něj dá `{ error }`
  česky (`huntRefusalText`: důvody vsi `HUNT_DENIED_TEXT`, cizí ves `NOT_PLAYER_VILLAGE`, souběh
  „Zkus to znovu.“).
  Composition root `lib/village.ts` (pohled na ves
  dopočítá všechny vsi hráče – přepínač a konec hry), `lib/village-view.ts` (DTO, smí i do
  prohlížeče – `id`, `settlementId`, `villages` pro přepínač), `lib/village-list.ts`. Vybraná ves se pamatuje
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
  (`useVillageSync` – `applyVillage` i první pohled) zavolá `withCartRoutes`: `cartGoalRoute` →
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
    a paměť mřížek žije v něm. **Na trasy nic nečeká** (D63, Martin 15. 11. 2026: „Výpočet tras
    vozů přece nemůže zablokovat hru“): `applyVillage` použije pohled hned s posledními známými
    trasami (`carriedCartRoutes` – vůz se stejným id, druhem a cílem po své poslední trase,
    spřežení se stejnými cíli po poslední cestě, jinak zatím bez trasy; paměť `CartRoutesMemo`)
    a s trasami z Workeru ho použije znovu, jen když mezitím nepřišel novější pohled
    (`applyTicket`). Dotazování na ves ani fronta akcí tak na Worker nečekají – dřív mlčící Worker
    (D60) zastavil obojí a akce se vůbec neodeslala; časový limit z D60 je pryč. Router platí jen
    pro poslední požadavek (dřívější, na který Worker neodpověděl, skončí `null`; po `dispose`
    taky), mlčící Worker tak drží nejvýš jeden požadavek a vozy zůstanou u posledních tras. Bez
    `Worker` nebo po jeho chybě se totéž spočítá v hlavním vlákně. První pohled spočítá hlavní
    vlákno (jednou při načtení stránky) a dá první paměť tras. Testy `cart-router.test.ts`,
    `cart-routes.test.ts` (`carriedCartRoutes`), `use-village-sync.behavior.test.tsx` (akce
    i dotaz projdou, i když Worker nikdy neodpoví).
- **Nabídky panelů až na vyžádání** (`lib/panel-options.ts`, server action `getPanelOptions`,
  `panelOptionsForPlayer`): kompas zemských stezek (`trailOptions` – 8 plánů tras se dřevem
  a průseky) a „Vysadit jabloně“ u cesty (`roadApplesOption`) se v pohledu nepočítají – stály ≈ 90 ms
  z ≈ 140 ms pohledu Vlkova za herní den. Paměť podle otisku vstupů by nepomohla (obě závisí na dni –
  stromy rostou, pařezy zarůstají, stavby postupují). Server je spočítá ze stejného stavu jako pohled
  (`panelOptionsOf` – sousedé z mapy, opuštěná ves), až když hráč otevře kompas (`ManorPanel`) nebo
  vybere cestu (`RoadBody`); `hooks/use-panel-options.ts` (`PanelOptionsContext` z `VillageGame`,
  klíč = `VillageView.stamp`) se s novým pohledem zeptá znovu a do odpovědi drží předchozí nabídku.
  Pohled stezky nenese; ukázky panelů (`/dev/panels`) mají nabídky v `DEV_PANEL_OPTIONS`.
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
  zbytek do svého dne. Mapa je v `globalThis`, po dokončení se klíč uklidí. Klientské
  dotazy (`useSerialRefresh`) jdou po jednom (další až po dokončení), takže nic nemění. Průběh skoku
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
- **Obnova pohledu vsi (události)** (`village-game/use-village-sync.ts`; server-events.md –
  Klient, Den bez workeru): klient se na ves neptá periodicky – jen když server řekne. Dotaz
  (`refreshNow`) přijde na událost `village` s novou verzí vsi hráče (`villageEventIsNews` proti
  `VillageView.versions`), na `notices`, na obnovu po mezeře spojení (`sync`, kolo pojistky po
  30 s) a z hlídače dne (`nextDayCheckMs` v `lib/village-day-check.ts` – začátek dalšího dne
  s odkladem 10 s, jen když pohled nového dne nepřišel; svět bez workeru). Dotazy jdou po jednom
  (`useSerialRefresh` – nejvýš jeden další po běžícím, 10 událostí za 50 ms = nejvýš 2 dotazy);
  během akce se obnova odloží za ni a ověří s pohledem akce, takže událost vlastního uložení
  druhý dotaz nevyvolá. Spojení nese zobrazenou ves (`useEventScope`). Po konci hry nic. Pošle
  `{ villageId, known }` – `known` = `VillageView.stamp`, otisk pohledu (`villageViewStamp`
  v `application/village-stamp.ts`: vybraná ves, den, id + jméno + verze všech vsí hráče –
  pohled je čistá funkce těchto údajů). Server (`villageViewIfChanged`) nejdřív levně
  (`currentVillageViewStamp` – sídla hráče a `VillageRepository.stampsOf`: id, jméno, verze,
  `last_day` a `asleep` – sloupce tabulky `village` odvozené ze stavu při každém zápisu (migrace
  0009, od 0043 je píše adaptér – village-core.md – Uložení stavu vsi), zdrojem pravdy je stav; spánek = `extinctDay` nebo `abandonedDay`
  jako `isVillageExtinct` / `isVillageAbandoned`; index `village_awake_day_idx` nespících vsí podle
  dne je pro frontu workeru; `stampsOf` Vlkova z ≈ 6,2 ms na ≈ 0,15 ms, protože se JSON nerozbaluje) a při shodě, když by pohled nic nepočítal (zobrazená ves na
  dnešku, každá jiná nespící ves nejvýš `WORKER_LAG_DAYS` pozadu – `lagsBehindWorker`; spící vsi
  se nepočítají), vrátí `{ unchanged: true }` bez načtení stavů (Vlkov: celý řádek ≈ 830 kB / 50 ms, dotaz na
  něj jde v celé cestě 3×). Když worker uloží jinou ves, otisk se změní (verze), přijde událost
  a pohled se pošle znovu – zhruba jednou za herní den, jako dřív. `dynastyStatus` bere id vsí z levných otisků (`stampsOf`, v pořadí
  založení) – stav každé vsi načte jen `loadVillage`, jednou. Akce a přeskok času vracejí vždy celý pohled.
  **Paměť vsí na jeden požadavek** (`packages/server/src/village-cache.ts` – identity map): server actions
  (`villageAction`, `getVillageView`, výběr a založení vsi, skok v čase) a první pohled běží ve
  `withVillageCache` (AsyncLocalStorage v `globalThis`); úložiště z `cachedVillages` tam vrací záznam
  načtený dřív v témže požadavku, dokud levný otisk (`stampsOf` – verze a jméno) sedí, `save`
  paměť obnoví a neúspěšné uložení ji pro ves zahodí (optimistický zámek a opakování platí dál).
  Akce tak načte každou ves jednou místo ověření vsi + dopočtu + use-case + pohledu (≥ 4×)
  (dopočet všech vsí hráče je načítá stejně). Změna jména verzi
  nemění, proto je jméno v otisku zvlášť (událost samotného přejmenování se známou verzí se
  zahodí – jméno ukáže nejbližší nová verze). e2e testy po přímé změně uložené vsi volají háček
  `pollVillage` (`lib/e2e-hooks.ts` → `refreshNow`) – záloha „zeptej se hned“: přímý zápis
  oznámí i trigger, háček jen nečeká na doručení události.

- **Uložení vsi** (`save`) vrací jen id, sídlo, jméno a verzi – záznam nese předaný stav (ne kopii
  z databáze).

- **Rozhraní jako v 0 A.D., bez popisků a průvodce** (Martin): `components/game/VillageGame.tsx`
  skládá `hud/` – `TopBar` (jméno vsi = přepínač vsí `hud/VillageSwitcher.tsx` – klik otevře
  seznam vsí hráče se jménem a lidmi, klik na ves ji přepne – ves na jiné mapě novým načtením
  stránky (jedna ves, jedna mapa); přejmenování dvojklikem nebo tužkou; upozornění z jiné vsi
  krátkým řádkem se jménem vsi – `otherVillageNotices`; ikony s čísly: lidé a kolik jich pole uživí v jedné ikoně („31 / ≈ 22“, `peopleLabel`), plodiny (obilí, luštěniny a jablka jednou ikonou s rozpisem), maso,
  sýr (ikona `cheese`, v popisku mléko za den) když je mléko nebo sýr, seno s ohradou, klády, hřivny jen ves s řemesly (uhlí je v panelu uhlíře, vozy v ohradě volů a v panelu tesaře, keramika a dřevěné nářadí nikde – Martin 24. 10. 2026), volná
  práce, nasycení (barva ikony podle energie – hlad, tooltip nasycení s energií, bílkovinami
  a podíly obilí / luštěniny / maso / mléko a sýr / vejce / ovoce), štěstí, datum – obnoví se
  na začátku dalšího herního dne, ne každou sekundu (`dateRefreshDelay` v `lib/game-date.ts`);
  datum je bez názvu období (Martin 14. 11. 2026); ve vývojovém režimu je klikací
  (`DateWithDevTime`, `game-date-toggle`) – klik otevře u data panel zrychlení času
  (`DevTimeButtons`, `dev-time-panel`), další klik, Esc nebo stisk mimo ho zavře, mimo vývojový
  režim klik nic neotevře; ikona zvuků v liště není, jen tlačítko nabídky; ikona obilí
  (`village-stores`) ukazuje součet kg obilí bez hromady osiva, luštěnin a jablek bez snopů
  (`grainStockTotal`; diet.md – Co hráč vidí, D95 – osivo `view.sowingSeed` má v rozpisu řádek
  `seed` s popiskem `seedName` z panelu pole) a ikona
  dobytka (`village-livestock`) součet kusů skotu, volů, ovcí, koz, prasat a koní
  (`livestockTotal` z `view.livestock` a `view.horses`, i voli a koně bez ohrady –
  `LivestockSummary.oxen`, `looseHorses`); klik na ně otevře u ikony panel
  s rozpisem (`StockBreakdown`, `<testId>-toggle` / `<testId>-panel`, řádky `grainStockRows` /
  `livestockRows` – sloupec řádků ikona + název + číslo zarovnané vpravo, panel `w-max` podle nejdelšího řádku, bez zalamování; dobytek jen druhy, které ves má; pod rozpisem plodin řádek
  `footer` – `FoodLastsRow`, `village-stores-last`: přesýpací hodiny a na jak dlouho vystačí jídlo
  vsi, `VillageView.foodLastsDays` ze serveru – `foodLastsDays` jádra, doba `formatGameDuration`
  „1 rok 3 měsíce“ / „4 měsíce“ / „12 dní“, v popisku `foodLastsTooltip` „Zásoby vystačí do 14. června 888 – bez sklizně, při plném přídělu.“ s posledním dnem plného přídělu; když nikdo
  nejí, řádek chybí – Martin 15. 11. 2026, D56), další klik,
  Esc nebo stisk mimo ho zavře jako panel u data; dokud je rozpis otevřený, popisek ikony je vypnutý (`Resource tooltipOff`), aby nepřekryl čísla; Martin 14. 11. 2026. Samostatné ikony luštěnin a ovoce
  v liště nejsou – pokrývá je rozpis, Martin 14. 11. 2026 „ano“, D19),
  `GameMenu` (nabídka hry jako v 0 A.D., F10 – modální okno uprostřed obrazovky se ztmaveným
  pozadím; smí mít slova: Nastavení – přepínač `setting-sound` Zvuky krajiny, stejná uložená
  volba `sound-preference` –, Začít znovu,
  Odhlásit s e-mailem v popisku, Zpět do hry; Esc z Nastavení vrátí k položkám; Začít znovu se živou vsí jen po potvrzení v panelu,
  bez dialogů prohlížeče, při zakládání vsi zamčené; otevření zruší umisťování i výběr, klávesy
  hry zachytí na `window` ve fázi capture, Esc zavře – z potvrzení vrátí –, klik mimo panel zavře
  a do krajiny nedojde; po konci hry se neotevře; logika kláves v `lib/game-menu.ts`), `Minimap` (vlevo dole, `lib/minimap.ts`,
  klik / tažení přesune pohled; krajina a ves se kreslí jednou do vrstvy v rozlišení plátna
  – `drawMinimapVillage` – a při pohybu kamery se přes ni kreslí jen záběr – `drawMinimapView`), `SelectionPanel` (dole uprostřed, jen při výběru,
  `lib/selection-details.ts`; **roste s obsahem** (Martin 19. 10. 2026 – text se nesmí zalamovat
  ani být nahňácaný): `w-max` a `whitespace-nowrap`, meze v `hud-selection` (globals.css – na
  středu mezi minimapou a mřížkou staveb, nejvýš 70 % okna, širší obsah se zalomí po celých
  položkách – řádky `ROW` s `flex-wrap`; na okně pod 55rem stojí nad nimi, svislý posuv
  `useOverflowScroll` až když přeroste výšku okna – ořízl by popisky); příkazy (dvorec,
  Odejít, vylepšení cesty) vpravo za čarou – `Commands`, `hud-split` / `hud-commands`, na okně
  55–72rem pod údaji; rozbalené nabídky (růžice stezek a odchodu, obchod) nad panelem u pravého
  okraje – `hud-popup`, zavře je stisk myši mimo ně (`hooks/use-dismiss.ts`); popisky (`Tooltip`)
  se zalomit smí – `whitespace-normal`; ukáže se jen popisek nejvnitřnějšího obalu `tooltip-host` pod myší
  (`:hover` bez dalšího `:hover` obalu uvnitř přes `:has()`, totéž pro `:focus-within`; pravidla v
  `globals.css`, jen při `(hover: hover)`); náhled bez hry s nejbohatšími daty:
  http://localhost:3010/dev/panels (`?panel=dvorec`, `ohrada`, `pole`, `pole-dil`, `rudiste`… – `app/dev/panels/dev-panels.ts`,
  i seznam vsí a nabídka hry); u obydlí a víc vybraných obydlí – počet domácností a lidí –
  tlačítko Odejít – růžice odchodu `LeaveCompass`: 8 směrů nové
  mapy, uprostřed nic (jedna ves, jedna mapa – „sem“ zrušené 1. 11. 2026) (dny cesty, lidé a jídlo v popisku, směr s vlastní
  vsí zašedlý; odchází-li celá ves – `SelectionLeave.all` z `everyoneLeaves` a `VillageLeave.all` –,
  popisky tlačítka Odejít i směrů řeknou „Celá ves – berou si úplně vše“, směry i s počtem zvířat
  a vozů) – `hud/RelocationControls.tsx` (Přestěhovat zaniklo 8. 11. 2026 – demolition.md; rozestavěný
  nový dům je běžné staveniště se Zrušit); **odchod syna
  vojvody** (lord.md – Dělení vsi): pohled `dynasty.sons` (`lib/dynasty-view.ts`, z `leadingSons` /
  `sonDeparturePreview` – náhled ze všech odcházejících stejnými funkcemi jako `departWithSon`,
  i když je díl jen rodina syna; počítá se jen pro syna, který smí vést) → `SelectionSon` v detailech dvorce (`sonDetails`
  v `lib/selection-details.ts`) → řada ikon `SonsRow` (`hud/selection/sons.tsx`; nástupce a syn bez
  jména zašedlí s důvodem, klik = rámeček + růžice `LeaveCompass`, kůň v popisku); obrys obydlí
  dílu a domů rodiny syna mimo dvorec = `sonPreview` v `useSelection` (`setSelection` cíle `dwellings`); `leave` i `leaveWithSon` = jeden tok
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
  název (u staveb i cena); popisek ukáže jen jeho vlastní obal, takže popisky uvnitř jiného se neukážou
  naráz. Vzhled panelů: třídy `hud-*` v `app/globals.css` (tlačítko se slovy
  `hud-button`). Komponenty se testují statickým renderem (`react-dom/server`, JSX převádí
  `vitest.config.ts`) – panel bez stavu zvlášť (`GameMenuPanel`). Ikony
  `public/icons/build/` a `public/icons/resources/`. Panely, nad kterými se krajina neposouvá
  okrajem okna, mají `data-hud-block`.

- **Katalog staveb** `lib/build-items.ts` (název, ikona, zkratka, umístění `footprint` /
  `plot` / `squares` / `sacred` / `workshop` / `threshing-floor`, kontrola) – nová stavba = záznam tam, cena v `BUILD_COSTS` a server action
  v `SUBMIT_SQUARES` (`village-game/use-build-mode.ts`); mřížka, zkratky i malování po čtvercích se nemění. Stavba
  po čtvercích s druhy (`variants` – ohrada: `PEN_VARIANTS` ovce, kozy, prasata, skot, spřežení, koně – ikona `horse`, název „Ohrada koní“; Tab přepíná druhy v malování)
  dostane v kontrole druh; tlačítko stavby je jen **rozcestník** (oxen.md – Ohrady podle druhu,
  Martin 20. 10. 2026): kliknutí i zkratka otevře v mřížce druhy (`BuildGrid` `group`,
  `useBuildMode` `buildGroup` – první tlačítko stavba sama zpět, druhy `buildVariantName` bez
  zkratek), druh spustí malování (`startBuild(kind, variant)`), Esc rozcestník zavře; u kurzoru
  ikona druhu (`PlacementPreview.variant`). **Obydlí** (Martin 14. 11. 2026) jsou jedno políčko –
  rozcestník `dwelling` (`placement: 'dwellings'`, `DWELLING_VARIANTS`: zemnice, polozemnice,
  vypletený dům, srub; ikony `build/…`, `variantIconSrc` v `BuildGrid`); zemnice, polozemnice, vypletený dům a srub zůstávají
  záznamy katalogu s `hubOf: 'dwelling'` (kontrola, cena, zkratky), ale bez vlastního tlačítka.
  **Řemeslné dílny** (workshops.md, Rozhodnutí 7): tlačítko F / G / H / T je od roku 750 rozcestník
  (`placement: 'workshop'`, `WORKSHOP_VARIANTS(craft)` – dnešní dílna, Vypletená, Roubená; ikony
  `build/<model>[-vypleteny|-srub]`, popisek „Kovář – Vypletená“); zašedlý druh nese důvod
  z `BuildOption.variants[typ].blocked` („Od roku 800“), tlačítko řemesla je dostupné, když ves
  zaplatí aspoň jeden druh. Do roku 750 `workshopChoice` (`build-items.ts`) přeskočí rozcestník
  a klik i klávesa staví rovnou dnešní dílnu; zašedlý nebo neznámý druh nejde. Druh jde v
  `PlacementMode.type` a ve `PlacementResult` do `buildWorkshop(craft, position, type)` →
  `placeWorkshop({ …, type })`; cena u kurzoru `workshopPlacementCost(…, type)`.
  **Posvátná místa** (Martin 16. 11. 2026: „sluč sakrální stavby do jedné ikony, jako je třeba
  obytný dům“) jsou stejně jedno políčko – rozcestník `sacred-hub` (`placement: 'sacred-hub'`,
  `SACRED_VARIANTS`: modla, svatyně, malý a velký kostel; id druhu = druh stavby, `hubOf:
'sacred-hub'`); nabídku dává `sacredHubOption` (`village-view.ts`), ikona tlačítka je nejlepší
  dostupný druh (kostel, svatyně, modla – návrh Clauda), popisek „Posvátná místa“; nezačne-li ves
  žádný druh, zašedlé tlačítko nese důvod nejlepšího nabízeného druhu (rozcestník otevřít nejde – po
  křtu bez stavbyvedoucího „Bez stavbyvedoucího huti se kostel stavět nedá.“); druh spustí
  umisťování té stavby (`startBuild` převede `sacred-hub` + druh na druh). Kostely jsou v rozcestníku
  jen po křtu rodu a po křtu **nejsou modla ani svatyně** (`withSacredHub` v `use-build-mode.ts`;
  server novou modlu ani svatyni nezaloží – `PAGAN_PLACES_FORBIDDEN`, kontrola v
  `startSacredBuilding`, `core/actions.ts`). Zkratky N, M, I, Y vybírají druh rovnou.
  Rozcestník nemá zkratku (`NO_HOTKEY`), Z, X a 1 vyberou druh rovnou (`startBuild` je převede na
  `dwelling` + druh). Nabídku dává `dwellingHubOption` (`village-view.ts`): cena a důvod zašednutí
  (srub do roku 800) jsou v `variants` každého druhu, ikona tlačítka je nejlepší druh, na který ves
  má (srub, polozemnice, zemnice); při zakládání vsi je tlačítko rovnou zemnice
  (`FOUNDING_DWELLING_OPTION`) a jeden klik spustí umisťování. Stavba,
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
  | pravé tlačítko         | zruší výběr; s vybraným vojvodou rozkaz výjezdu (viz níž)        | zruší                           | zruší malování                     |
  | Esc                    | zruší výběr                                                      | zruší                           | zruší tah, pak malování            |
  | F10                    | otevře nabídku hry, zruší výběr                                  | otevře nabídku, zruší           | otevře nabídku, zruší malování     |
  | `[` / `]`              |                                                                  | otáčí po 15° (pozemek celý)     | otáčí mřížku po 15° (všechny)      |
  | Tab                    |                                                                  | pozemek: místo domu (varianta)  |                                    |
  | další                  |                                                                  | Enter postaví                   | Backspace / Ctrl+Z vrátí, Enter    |

  **Lidé a výprava** (`docs/code/journey.md`, Ovládání): klik na člověka ho vybere, **Shift (Ctrl) +
  klik** přidá nebo ubere dalšího (jako jednotky v 0 A.D.), klik na člena skupiny venku vybere celou
  skupinu. S vybranými lidmi dá **pravé tlačítko** rozkaz do krajiny místo zrušení výběru (doma se
  z nich stane skupina, venku se přesměruje; u okraje mapy přes okraj) – Esc a klik jinam výběr
  ruší jako dřív.

  **Lov** (hunting.md; plán 2026-11-22-hunting, Úloha 11): tlačítko lovu ve dvorci (`manor-hunt`,
  `ManorUpgrades`) volá `declareHunt`; zašedne s důvodem (`manor.huntDenied`, texty
  `HUNT_DENIED_TEXT`; `already` z `huntRunningIn` – lov ve výpravě vsi, nebo čekající záměr –,
  `manorView(…, huntRunning)` posuzuje den honců, zítřek); `unreachable` (rod bez místa se sídlem
  na políčku světa) dostane text výprav „Tam nedojde.“ (`huntRefusalText`). Odříznutý nováček loví
  ve výpravě místní mřížky rodu ([journey.md](journey.md) – Lov): `homeCell` stránky hry je
  `homeCellOf(sídlo)` – políčko světa, v odříznuté krajině místní políčko –, takže scéna kreslí
  útočníky (`sceneJourneysOf`) a rozkazy pravým tlačítkem míří na mapu vsi (`orderCell`). **Pravé tlačítko na vyhnané zvíře** (`LandscapeScene.quarryAt` – pozice
  kurzoru, ne terén) s vybranými lidmi pošle `commandExpedition` `{ kind: 'strike' }`
  (`use-expedition-orders.ts`); odmítnutí je důvod u kurzoru (`expeditionReason(…, strike)`:
  `woman` „Na lov chodí jen muži“, `young` „Na lov až od 14 let“, `no-quarry` „Zvíře tu není“).
  Klient odmítne jen výběr, ve kterém nemůže nikdo (důvod prvního); smíšený výběr rozhodne server.
  Osedlat a Sesednout útočníka v souboji jsou zašedlé (`striking` v `ExpeditionPersonState`).
  `useJourneyScene` předává scéně lov vsi (`sceneHuntOf` → `setHunt`) vedle výprav – nový pohled
  každý takt jen předá, `setHunt(null)` až při odpojení nebo výměně scény (úklid mezi takty by
  zahodil plynulý pohyb zvířete a prach zásahu a přestavěl ves).
  `HuntRenderer.animate(nowMs, camera)` kreslí jen pohybující se lov v záběru kamery (zapisuje
  i mimo záběr; změnu mimo záběr ukáže překreslení po pohybu kamery).

  Vždy: WASD / šipky a kurzor u okraje okna posouvají, kolečko i rozevření prstů na trackpadu
  (Ctrl + kolečko, v Safari `gesturechange`) přibližují, Q/E otáčí, R vrátí pohled na ves
  (`setCameraHome`). Malování pole, sadu, hřbitova a ohrady: [ a ] jen před prvním čtvercem
  (pak je mřížka zamčená), nad stavbou stejného druhu se malování chytí její mřížky (`gridAt`,
  drží ji i mimo ni – rozšíření), vybraná stavba dá mřížku hned (`PlacementMode.squares.grid`);
  natočená mřížka má čtverec pod kurzorem ve středu políčka. Ctrl ve výběru obydlí platí i jako Cmd; Ctrl / Shift + klik na cestu či
  pole vybraná obydlí nezruší; Ctrl + A při umisťování nic nevybere. Zkratky staveb Z zemnice, X polozemnice, 2 vypletený dům (od roku 750), 1 srub (číslice `Digit2` a `Digit1` – písmena jsou obsazená; `hotkeyCode`; do roku 800 zašedlý s důvodem „Od roku 800“ – `VillageView.build.srub.blocked` z `dwellingYearReason` v `buildOptions`, log-house.md – Dům), dílny zlata 3 rýžovník, 4 šperkař, 5 mincovna (`Digit3`–`Digit5` přes `hotkeyCode` v `workshop()`; zašedlé s důvodem z `workshopBlocked` – `buildOptions` i `workshopVariants`: „Bez zlatonosného náplavu“, „Náplavy jsou vyrýžované“, „Od roku 950“ i u vypletené a roubené varianty), C pole, V hřbitov, B sad,
  N modla, M svatyně, K humno, O ohrada, panely J Kronika a U Upozornění (`lib/panel-keys.ts`) (modla, svatyně a humno se umisťují půdorysem jako obydlí – `PlacementMode`
  `sacred` a `threshing-floor`; ohrada po čtvercích – O i tlačítko otevřou v mřížce rozcestník druhů zvířat (ovce,
  kozy, prasata, skot, spřežení – bez zkratek), nad ohradou téhož druhu se chytí její mřížky). V otevřené nabídce hry žádná klávesa hry neběží – F10 nebo Esc ji zavře (Tab jen
  po jejích položkách). Rozhraní
  obydlí hned ukáže jako staveniště a akce posílá na server za sebou (fronta `runAction` v `useVillageSync`).

- **e2e:** testy běží v běžícím pomalém světě (2000–2200). Kliknutí do scény při umisťování
  nahrazuje háček `window.__bohemiaE2E.confirmPlacement`, kam kliknout myší pro výběr řekne
  `projectToScreen` (`lib/e2e-hooks.ts`) – existují jen v buildu s `NEXT_PUBLIC_E2E_HOOKS=1`
  (nastavuje `playwright.config.ts`), jinde se z kódu vypustí. Zvěř: `wildAnimals` (meshe
  `wild-*` a kusy, které jsou vidět) a `moveCameraTo` (zvěř bývá u lesa mimo výchozí záběr).
  Testy vývojové ukázky (`slaughter.spec.ts`, `wildlife-scene.spec.ts`) běží jen proti
  vývojovému serveru (`SLAUGHTER_DEV_URL`, `WILDLIFE_DEV_URL`), jinak se přeskočí.
  **Práce v boji je v e2e ≈ 200× pomalejší vůči boji:** výroba žebříku a prolamování se počítají
  v herních hodinách, boj v taktech skutečného času – v pomalém světě trvá žebřík ≈ 11 500 taktů
  (v ostrém ≈ 58). Test s prací v boji ať nestojí na souboji, který se rozhodne dřív (např. lučištníci
  – los taktu podle hodiny spuštění), a ať čeká na rozhodnutý boj; hradbu stavět s `builtDay` pár dní
  zpátky (tažení začíná i včera). Vzor: `multiplayer-war.spec.ts` – nájezd na palisádu s ochozem.
  **Výběr klikem po přímé změně uložené vsi** (`writeVillageState` + `pollVillage`): ves dorazí
  dotazem až za chvíli a klik ještě vybere starý stav – zmizí-li cíl s novou vsí, zmizí i panel
  (dostavěné staveniště ne – výběr přejde na hotovou stavbu, viz Výběr staveniště po dostavění).
  V `expect.poll` na panel nečekat (`getAttribute('data-kind', { timeout: 500 }).catch(() => null)`)
  a klikat po vteřině (`intervals: [1_000]` – rychlé kliky jsou dvojklik). **Cíle v krajině nováčka** (každá
  registrace je jiná) nedávat pevným posunem – 150 m od zemnice padne občas do vody a A* cestu
  nenajde; ověřit je mřížkou pochodu jako worker (`marchGrid` + `marchPath` nad krajinou a vsí
  ze zápisu). Vzor: `multiplayer.spec.ts` – živé vedení.
  **Krajina sídla v testu = krajina serveru:** `seat` (`e2e/village-helpers.ts`) ji generuje jako
  `settlementLandscape` – seed, verze vrstev, prémiový typ i výřez kostry (sídla v testech prémiový
  typ dostávají; bez něj jiná voda i hustý les). **Sousední mapa:** test, který sídlo posune vedle
  jiného, vybere stranu, kam skupina přejde (`crossesTo` – mřížky obou map jako server; hustý les
  je neprůchodný a oblast vsi mívá přechod jen na některé straně; s cílem `goal` jen do oblasti,
  odkud k němu cesta vede – průvod do hradiště, kam cesta nevede, nevyrazí). **Návrat zápisem:**
  skupinu na návratu test staví jen tam, odkud cesta domů vede (`homeSpot` – návrat cíl domů
  neposouvá a domů se nepřenese, Martin 17. 11. 2026; náhodně odříznutá ves nesmí e2e rozbít –
  „Cestu otevře až stezka“); `placeReturning` přestaví i skupinu, která na domovskou mapu došla
  sama, ale uvízla v kapse (`stuckDay`, `retrace`), a den uvíznutí smaže vždy (jinak ten den úsek
  z nového místa nehledá – v pomalém světě e2e by stála hodiny; totéž `placeJourney`). **Stezka
  v přípravě:** nenavazuje-li mapa hradiště z žádné volné strany, test postaví zápisem hotovou
  zemskou stezku k ní (`withTrail`) a přechod ověří s osami pokračování na mapě hradiště
  (`trailAxes` – jako server). **Opakování dne** (`replayFrom`
  v `multiplayer-war.spec.ts`): napřed přesunout události schránky na dnešek, pak zapsat stav –
  zápis stavu ohlásí ves otevřené hře a její dotaz den hned dopočítá (události ještě na zítřku by
  minul). **Pomalý první snímek scény:** bezhlavý Chromium kreslí softwarově – první snímky po
  `data-scene-ready` zablokují stránku na několik sekund (17. 11. 2026 pod zátěží ≈ 5 s, 2,5 s
  a 0,3 s, skoro celé v nativním kódu WebGL). Test, který hned po načtení (`registerAndEnterGame`
  – odříznutý nováček se načte znovu) jedná v rozhraní s výchozím limitem 5 s, napřed počká na
  `sceneSettled` (`e2e/helpers.ts` – připravená scéna a dva snímky prohlížeče). Vzor:
  `multiplayer.spec.ts` – podmínky vazalství.

- **e2e a `test:db` souběžně z víc pracovních stromů:** port `next start` a testovací databázi
  čtou `playwright.config.ts` (a přes něj e2e pomocníci i worker v e2e) a testy adaptérů
  a souběhu z jednoho místa – `packages/db/src/test-database.ts` (`@bohemia/db/test-database`):
  `E2E_PORT` (výchozí 3011) a `TEST_DATABASE` (výchozí `bohemia_test`). Bez proměnných se nic
  nemění; souběžný strom dostane vlastní port i databázi, např.
  `E2E_PORT=3012 TEST_DATABASE=bohemia_test_2 npm run test:e2e` a
  `TEST_DATABASE=bohemia_test_2 npm run test:db`. globalSetup Playwrightu i `test:db` databázi
  založí, když neexistuje, a zmigrují (ručně `npm run test:db:create`); `bohemia`,
  `bohemia_measure` a systémové databáze odmítnou (testy vyprazdňují tabulky). Nepotřebnou
  databázi stromu zruš `psql -U postgres -c 'DROP DATABASE bohemia_test_2'`. Příprava
  (`prepareTestDatabase`) po migracích vrátí indexy tabulky `settlement` do stavu z migrací
  (`restoreSettlementIndexes` – jména podle `migratedIndexes`, chybí-li index, tabulka se napřed
  vyprázdní): test migrace 0013 (`shared-grid-migration.db.test.ts`) je za běhu mění a přerušený běh
  by databázi nechal bez `settlement_grid_idx` – testy „obsazené políčko“ dalšího běhu by spadly.
  Stejně po sobě uklidí i sám test (`afterAll`); běh tak nezávisí na předchozím ani na pořadí souborů.

- **Zrušení rozestavěné stavby** (population.md – Zrušení rozestavěné stavby): server action
  `cancelConstruction({ villageId, constructionId })` → `cancelConstructionForPlayer`
  (`lib/village.ts`) → use-case `cancelUnfinishedConstruction`. Pohled `VillageView.constructions`
  nese `penId` a `cancellable`; `selectionDetails` přidá k vybranému poli, hřbitovu, sadu, ohradě,
  humnu, modle, svatyni a staveništi `cancelConstructionId` (u hřbitova a ohrady nejnovější
  stavba – rozšíření) a `SelectionPanel` ukáže `CancelConstructionButton`
  (`hud/RelocationControls.tsx`, `data-testid="cancel-construction"`, křížek bez textu, slova
  jen v `Tooltip`).

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
  (`ScenePerson.name`), panel osoby (`SelectionDetails.person.name` – jméno nad rolí, popisek
  portrétu „Bořivoj – Rolník“) a obyvatelé domu (`DwellingResident.name`, `ManorMember.name` –
  popisek a `aria-label` `resident-select-*` „Ludmila – Žena rolníka“) nesou jméno každého
  (population.md – Jména); role `voivode-secondary-wife` („Vojvodova vedlejší žena“, i ve vlastním
  domě – `personRoles`).
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
tooltip `FieldCapacityTooltip`, část „/ ≈ N“ červeně při `fieldCapacityShort` (lidí víc než N). Číslo lidí
(`PeopleCount`) se barví zvlášť podle ubytování (`housingState`, D80, Martin 15. 11. 2026): plno
(lidé = místa) `text-amber-300`, přeplněno `text-red-400`; místa je `view.housingPlaces` z jádra
`housingPlaces` (`people/displaced.ts` – kapacita obydlí v provozu včetně dvorce, opuštěná ne);
tooltip má řádek „Bydlení 31 / 32 míst“ (`housing-places`). Rozloha polí
v liště není – ukazuje ji panel pole. Hodnota je `view.fieldCapacity` (`lib/village-view.ts`, `fieldCapacityView`)
z jádra `fieldCapacity` (`packages/game/src/domain/village/fields/field-capacity.ts`; tam i `ROTATION`,
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

## Výběr staveniště po dostavění (`followConstruction` v `lib/scene/village-selection.ts`)

Jako v 0 A.D. přejde výběr ze základů na hotovou budovu (návrh Clauda 10. 11. 2026). Staveniště
obydlí, řemeslné dílny i přestavby na novém pozemku je ve scéně (`SceneVillage.dwellings`,
`built: false`) pod id stavby, hotová stavba pod id obydlí (stavba 6 → obydlí 1) – bez přechodu by
výběr s novou vsí zmizel (`presentTarget` → null). `useSelection` drží předchozí `sceneVillage`
ve stavu (`selectionScene`) a při jeho změně ještě během vykreslení (panel neblikne) zavolá
`followConstruction(předchozí, nová, vybraný)`: staveniště (ne bourání), které v nové vsi chybí,
se vymění za hotové obydlí stejného typu a řemesla na téže poloze (`x`, `z` – stavba je přebírá
ze stavby beze změny); ve výběru víc obydlí se vymění jen dostavěná id. Modla, svatyně, humno
a ohrada si id stavby nechají (výběr trvá sám), bourání řeší `followDemolition`. Testy:
`lib/scene/__tests__/village-selection.test.ts`, e2e `village.spec.ts` (založení vsi – vybrané
staveniště zemnice přejde po dostavění na zemnici).

## Panel pole a dílu – osevní postup

fields.md – Osevní postup po dílech a setí do konce okna, bod 6 (návrh Clauda, Martin schválil 25. 10. 2026). Data: `fieldViews` (`lib/village-view-fields.ts`) volá jednou `partYearWork`
a `partRotation` z jádra; díl (`VillageFieldPart`) nese `next` a `rest`, pole `turn` – díly na
řadě mimo letošní práci podle ozimu a jaře a odpočívající příloh (pod 95 %). Ves nese hromadu
osiva `sowingSeed` (`sowingSeedView` z `VillageState.sowingSeed`: `crop`, `kg`, `winter` = zimní
osivo; pod 1 kg chybí). `selectionDetails` z nich dělá `next`, `rest` (díl), `turn` (jen
nenulové), `resting` a `seed` (pole). Panel (`hud/selection/fields.tsx`):

- **Díl** (`FieldPartBody`) – řádek osevního postupu: `selection-sown-years` (ikona `date`,
  „N. osev oběhu“), `selection-next` – ikona plodiny (`Flag`, popisek „Příště – jař“) nebo úhor
  čtverečkem barvy mladého přílohu (`FallowStat`) s odpočinkem k 95 % (popisek „osev za ≈ N
  let“). Údaj dílu nad potřebu (`selection-surplus`) zmizel s díly nad potřebu (9. 11. 2026).
- **Pole** (`FieldBody`) – seznam „Na řadě“ pod díly podle stadia: `selection-turn-winter` /
  `selection-turn-spring` (ikona plodiny s počtem, popisek „Na řadě – ozim“), `selection-resting`
  (čtvereček přílohu s počtem) a `selection-seed` – hromada osiva (ikona `food` s kg; popisek
  „Osivo na ozim (kg) – ves ho nejí; co nezaseje, vrátí do jídla“, v zimě „Zimní osivo na jař
  (kg) – přes zimu ho ves nejí“; návrh Clauda, 9. 11. 2026).

Návrh Clauda: „na řadě“ v poli jsou díly, které čekají mimo letošní práci (díly letošní práce
počítají plodiny); hromada osiva je za celou ves, ukazuje ji každé pole. Ukázky `/dev/panels?panel=pole`,
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
ti třeba mohl říct, který úsek cesty zlobí“. Klik do scény (`useSelection` – `scene.onSelect`) vypíše
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
  louka a pastva bez výběru (voda se jmenuje „Potok“, u řeky „Řeka“ – klíč kotvy `water:river`,
  `waterKindAt` v `paths/road-anchors.ts`: řeka, je-li nejbližší vodou řeka mapy; D44, Martin 14. 11. 2026: „teče tam přece potok“); jiná cesta → id cesty hráče (`roadChainIds`). `VillageRoad.ends`
  počítá `roadViews` (`village-view-roads.ts`); tam jsou i `JUNCTION_NAMES` / `JUNCTION_ICONS`.
  Křižovatka podle významného místa u ní (D66 – `roadEndLandmarks` z jádra, věta
  `landmarkPhrase` jako kronika): „Rozcestí u kovárny“, „Křižovatka pod dvorcem“.
  Totéž v nadpisu vybrané křižovatky (D72): `junctionViews` (`junction-view.ts`) dá do
  `VillageJunction.place` větu z `junctionLandmark` (bez `exclude` – nemá druhý konec) a
  `SelectionPanel` ji připojí k `JUNCTION_NAMES`.
- **Významné místo u křižovatky** – `paths/road-landmarks.ts`: `junctionLandmark(state, at,
terrain, exclude)` – nejbližší dvorec, dílna, kostel, hřbitov (po čtvercích), humno, ohrada, sad
  (po čtvercích), lom, modla, svatyně, stojící brána, voda (od břehu – `water` / `water:river`) nebo
  kraj mapy do `LANDMARK_M` (60 m), mimo místo na druhém konci cesty (`roadEndKey`); vztah `at` /
  `below` / `above` podle výšky (`LANDMARK_RISE_M` 5 m; brána a kraj mapy vždy `at`, voda nikdy
  `below`). Bez místa poloha vůči vsi (`village` – uprostřed do `VILLAGE_MIDDLE_M` od průměru
  obydlí, `direction` od něj, `outside` dál než `IN_VILLAGE_M` od všech obydlí). Výšky a voda
  z `LandmarkTerrain` (`landmarkTerrain(landscape)`, v síti `RoadEndsNetwork.terrain`); bez ní
  jen stavby. `roadEndLandmarks(state, net, ends)` – pro oba konce, jiný konec než křižovatka null.
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
běžící. Horní lišta: popisek klád „Klády na hromadách“ – celá zásoba (hromady u vsi a u lesa se od 8. 11. 2026 nerozlišují – forest.md, Mýcení a hromada klád).
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
  `wolvesTroubling`). Klik na zvíře ve scéně přijde s W10; dokud není, panel jde ověřit na
  `/dev/panels?panel=zver-prase` (`zver-vlci`, `zver-medved`).
- **Panel dvorce:** `huntView` → `VillageManor.hunt` (`ManorHunt`): ikony úlovků letos s čísly (prasata, jelení zvěř,
  vlci, medvěd, zajíci, ryby v kg), maso v kg a smečka „6 / 7“ (psi / kolik jich dvorec chce; psi obilí nejedí). Bez psů a úlovku řádek chybí. Tlačítko
  lovu (`manor-hunt`, důvod zašednutí `huntDenied` – village-wildlife.md, Lov na tlačítko dvorce).
- **Panel dílu:** `fieldDamageViews` → `VillageFieldPart.damage` → `FieldDamage`: ikona prasete a škoda letos v %
  (červeně od 10 %, popisek kg a vzdálenost k lesu), ikona ohně (`watch-fire`), když se díl dnes hlídá
  (noční hlídka, 1. 6.–31. 8.). Díl mimo ohrožení škodu nemá.
- **Upozornění** (`village-notices.ts`): `boar-damage` „Divoká prasata ničí úrodu“ (průměrná škoda dílů u lesa
  letos > 5 %, vážená plochou), `wolves-killing` „Vlci strhávají dobytek“ (2 dny se strhnutým kusem za 30 dní – `PREDATION.noticeKillDays`).
- **Kronika** (`village-view-chronicle.ts`): „Medvěd se vrátil do lesů.“, „Zvěř a vrány zničily letos N kg
  obilí na polích.“; úlovek se jménem lovce, strhnutý dobytek a zranění na lovu z W4–W5.
- **Dev panely:** `/dev/panels?panel=dvorec` (lov a psi), `pole-dil` (škoda a oheň), `zver-prase`, `zver-vlci`, `zver-medved`.
- **Testy:** `lib/__tests__/wildlife-view.test.ts`, `components/game/hud/__tests__/WildlifePanel.test.tsx`,
  upozornění ve `village-notices.test.ts`; e2e „díl pole ukáže škodu zvěře letos“ a psi v testu „dvorec: lov“.

## Počasí a pohromy v rozhraní (P10, `lib/disasters-view.ts`)

Návrh: [disasters.md – Co hráč vidí](../design/disasters.md). Jádro a čísla: [village-disasters.md](village-disasters.md).

- **Lišta** počasí roku neukazuje (Martin 14. 11. 2026: deštivé léto je vidět, protože prší,
  povodeň na mapě, dlouhá zima podle sněhu, sucho a holomráz ukáže scéna) – `VillageView.weather`
  (`weatherView`: jen neobvyklé a už vidět, `revealedWeather` – 30. 4. sucho chybí; povodeň,
  dokud ve vsi leží voda a bahno, `FLOOD_SCENE_DAYS`) slouží upozorněním a kronice
  (`WEATHER_ICONS` – ikony upozornění).
- **Panel dílu** – `VillageFieldPart.protection` (`partProtectionView`: zeleň po stupních 0–4,
  `water`, `lowland`, `raised`, `slope`; díl bez údaje typická zeleň; ves bez počasí kraje nic)
  → ikona `protection` s číslem, popisek `protectionLabel`. `VillageFieldPart.losses`
  (`partLossesView` – počasí, které je vidět, s ochranou dílu a plodinou roku sklizně; kroupy,
  povodeň, smršť z `disasters.losses`) → řádky `partLossRows` jako škoda zvěře („−60 %“, červeně
  od 10 %, dobré léto „+15 %“), testy `selection-protection`, `selection-loss-*`.
- **Obchod** – ikona zdražení u jména souseda zmizela s panelem obchodu (markets.md – Pravidla 1);
  zdražení zboží v kraji (`goodWorth`) zůstává.
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
- **Vývojový režim** – jedno „Vynutit pohromu“ (zlé roky i pohromy, `hud/DevMenu.tsx`) v nabídce
  hry pod položkou „Vývojářské menu“ (`GameMenu`, krok `dev`, jen s `devMode`; po vynucení se nabídka
  zavře, jakmile server doběhne; Martin 14. 11. 2026). Zrychlení času zůstává u data:
  [accounts.md – dev mód](accounts.md).
- **Testy** – `disasters-view.test.ts`, `village-notices.test.ts` (počasí a pohromy),
  `village-view.test.ts` (JSON 30. 4. bez sucha, seedu a `override`); e2e `village.spec.ts`
  „vývojový režim: vynucené sucho“ – ikona na liště, upozornění a ochrana v panelu dílu.

## Správce vsi v rozhraní (S8, `hud/StewardToggle.tsx`)

- Server action `setSteward({ villageId, on })` → `toggleSteward` z `villageCommands` (`runAction`, pohled se obnoví).
  `VillageView.steward = { on, built }` (`built` = id staveb a dílů se značkou, `isStewardBuilt`).
- **Přepínač** `StewardToggle` (ikona klíče `public/icons/resources/steward.png`, zapnutý svítí,
  vypnutý `opacity-40`, popisek „Správce“): v `VillageList` u každé žijící vsi (`VillageListItem.steward`)
  a v panelu dvorce vojvody (`SelectionDetails.steward`, jen `dwelling` s `manor`). `StewardBadge` je
  ikona vedle jména vybrané vsi v `VillageSwitcher`, když správce běží.
- **Značka „Postavil správce“** (`StewardBuiltMark`): `withSteward` v `selection-details.ts` nastaví
  `stewardBuilt` cílům dwelling/site/field/field-part/cemetery/orchard/pen/road, jejichž `id` je ve
  `view.steward.built`; `SelectionPanel` ji ukáže vpravo nahoře vedle Zrušit stavbu.
- e2e: `village.spec.ts` – „správce vsi – zapnutí a vypnutí přepínačem…“.

## Panel „Rod a vazalové“ (úloha 1.10, `hud/HousePanel.tsx`)

- **Soubory** (refaktoring 11. 11. 2026): `HousePanel.tsx` drží stav panelu (vybraný hráč,
  rozpracovaná nabídka, vybraná dohoda) a skládá části z `hud/house/` – `parts.tsx` (`Icon`,
  `Portrait`, `Row`, `Man`, `HouseLink`, `PlayerAction`, `StatusMarks`), `agreements.tsx`
  (`AgreementEntry`, `LevyMark`, `AgreementActions`), `FellowComplaint.tsx` a `invites.tsx`
  (`InviteRow`, `inviteLink` – reexport z `HousePanel.tsx` kvůli testům).
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
- **Data:** `useHouse` načte `HouseView` při otevření hry (počet vazalů v liště), při otevření
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

## Nováček v rozhraní (newcomers.md – Rozhraní, `hud/NewcomerPanel.tsx`)

Pravidla a use-casy: [world.md](world.md) – Vstup nováčka. Web jen zobrazuje a posílá záměr.

- **Typ z jádra:** `lib/newcomer-view.ts` – `NewcomerStatusView` je `NewcomerStatus` z
  `application/newcomers.ts` s `deadline` jako ISO čas (`newcomerStatusView`); `newcomerWaiting` /
  `newcomerUndecided` (odříznutý bez čekající žádosti – i po odmítnutí všemi v témže týdnu).
- **Server actions** (`app/game/actions.ts` → `lib/house.ts`): `newcomerStatusAction()`,
  `requestLordsAction(houseIds)`, `startFreeAction()`.
- **`useHouse`:** `refreshHouse` načte panel rodu a u odříznutého rodu (`HouseView.isolated`) i stav
  nováčka. Odříznutý bez rozhodnutí vidí `NewcomerPanel` (ikony „Vybrat pána“ / „Svobodný“, nabídka
  s ikonou jazyka, nejvýš 5) **místo** `LineNamePanel`; jméno vojvody přijde po volbě. Panel jména
  při zakládání čeká na načtený stav nováčka (při chybě se nečeká). Důvod odmítnutí ze serveru je
  řádek `newcomer-error`. Po umístění panel zmizí.
- **Čekání** je v panelu Rod a vazalové (`NewcomerWaiting` z `NewcomerPanel.tsx`, řádek
  `house-newcomer`): odpočet do konce týdne, žádosti se stavem ikonou (přesýpací hodiny / křížek),
  „Stáhnout žádosti“ = `startFreeAction`. Vlastní žádosti nováčka se mezi kartami jednání neopakují.
  „Vydat pozvánku“ u odříznutého zašedne s důvodem (`HouseView.inviteReason`, `data-reason`).
- **Pán:** karta jednání s `NegotiationView.newcomer` má jen **Přijmout** / **Odmítnout**
  (`newcomer-accept` / `newcomer-reject`, bez protinávrhu); jméno a muži nováčka z
  `WorldDirectory.isolatedEntriesOf`.
- **Jazyk rodu:** `HouseLinkView.language` – malá ikona jazyka (`LanguageIcon`) u každého rodu
  v panelu. **Minimapa** odříznutého (`Minimap isolated`) nese popisek „Odříznutá krajina“
  (`data-isolated`); mapa světa v rozhraní zatím není, krajina vsi se kreslí dál.
- Testy: `hud/__tests__/NewcomerPanel.behavior.test.tsx`, `HousePanel.behavior.test.tsx` (čekání,
  pozvánka, ikona jazyka), `NegotiationCard.behavior.test.tsx`, `Minimap.test.tsx`; e2e
  `e2e/newcomers.spec.ts` (A se 2 vsemi zápisem do DB; B `de` vybere A, staví v odříznuté krajině,
  A přijme → vazal u mapy A; C „Svobodný“ → hned na mapě). Ostatní e2e umísťují hráče bez
  pozvánky dál zápisem (`e2e/placement.ts`).

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

## Dialog Odvody (úloha 4.4, `hud/LevyDialog.tsx`, `lib/levies.ts`)

Panel vpravo nahoře (`role="dialog"`, název „Odvody“, `data-testid="levy-dialog"`), jádro v [vassalage.md](vassalage.md) –
Roční Odvody. Otevírá se z upozornění `levy-pending` (`noticePanel` → `'levy'`, ostatní upozornění z jednání dál `'house'`)
a pečetí `house-levy-open` v panelu „Rod a vazalové“ (u pána s čekajícím dialogem). `VillageGame` při otevření zavolá server
action `levyDialogs()` (rozdělení po vsích se počítá až tehdy, ne s dotazem na ves), odeslání jde přes `answerLevy`.

- **Řádek na pána** (`levy-<dialogId>`): prapor, jméno pána, u dialogu starého víc let přesýpací hodiny. Zboží s domluveným
  číslem má ikonu, **posuvník** (0 až dvojnásobek domluveného – víc smí) a číslo „odvádím / domluveno“; součet je vždy
  součet přes vsi. Posuvník přerozdělí součet mezi vsi podle dosavadních dílů (`redistribute` – celá čísla, zbytek po
  největších zlomcích; samé nuly → návrh serveru, pak rovným dílem). Při víc než jedné vsi rodu je pod posuvníkem číselné
  políčko na ves (předvyplněné `suggested`); úprava vsi změní součet.
- **Vzkaz** je textové pole (`NEGOTIATION.messageMaxChars`), **Odeslat** je vůz (`resources/cart.png`, popisek v `Tooltip`).
  Pošle `lines` (součet po zboží) a `split` – shodu hlídá server i konstrukce klienta. Po odeslání se tlačítko nahradí
  vozem s dnem příjezdu v popisku; chyba serveru (např. nad mez dopravy) se ukáže v řádku a dialog zůstane otevřený.
- **Pán:** `PanelAgreement.levyYears` (jádro `housePanel`, port `dialogs`) → u vazala v panelu přesýpací hodiny
  (`house-levy-wait`); `HouseView.waiting` (pečeť v liště) počítá i vlastní čekající Odvody.
- Testy: `hud/__tests__/LevyDialog.behavior.test.tsx` (posuvník, součet, Odeslat), `HousePanel.behavior.test.tsx`
  (hodiny a pečeť), `house-panel.test.ts` (`levyYears`); e2e `e2e/multiplayer.spec.ts` – „Odvody 1. 11.“ (dialog se zapíše
  přímo do `bohemia_test`, vsi se dopřeje `commonLaborYearly`, snímek do `LEVY_SCREENSHOT`).

- **Obchod mezi hráči (úloha 4.7):** v liště akcí hráče tlačítko **Obchod** (`house-trade`, vůz `resources/cart.png`) otevře
  `TermsForm` s řádkem `TradeRow` (`term-row-trade`; hlavičky „Dáš“ / „Dostaneš“ slovy – výjimka z pravidla bez popisků,
  políčka `term-trade-give-*` / `term-trade-get-*`, výběr vsi odeslání `term-trade-village`). `negotiationView` obchod
  v kartě, kde je hráč na tahu, převrátí (`tradeFlipped`), aby „Dáš“ bylo vždy jeho. Dialog odeslání je řádek Odvodů
  `kind: 'trade-send'` v `LevyDialog.tsx` (ikona vozu, posuvník, rozdělení po vsích, Odeslat); otevírá ho upozornění
  `levy-pending` s `trade: true`. Jádro: [vassalage.md](vassalage.md) – Obchod mezi hráči.

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
  jabloně (`selection/roads.tsx`), zemská stezka (`TrailCompass`); `evacuate` – Odejít (`RelocationControls`); `sendSons` – odchod se synem (`LeaveCompass right`);
  `nameSons` – `LineNamePanel`; `steward` – `StewardToggle` (jen zobrazená ves; ves v seznamu
  jiná než zobrazená právo nezná, rozhodne server), přejmenování vsi, lov; `trade` – právo
  zůstává, výpravu dnes nic nepoužívá (plán 2). Pohled na ves a výběr zůstávají – dívat se smí každý hráč rodu.
- **Stolec:** `public/icons/house/throne.png` (render z Blenderu). `VillageListItem.senior`
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
- `PlayerDeparturePanel` nahoře uprostřed: přesýpací hodiny (`icons/resources/hourglass.png`) s dny do
  konce lhůty (popisek v `Tooltip`), obrys obydlí dílu ve scéně (`setSonPreview` jako u řady synů),
  syn bez jména napřed panel jména (`LineNamePanel`), pak růžice `LeaveCompass` (právo `sendSons`).
- Server action `choosePlayerDeparture` (`app/game/actions.ts` → `choosePlayerDepartureForPlayer` v
  `lib/village.ts`, vstup `{ villageId, direction, sonName? }` parsuje `parseChoosePlayerDepartureInput`).
  e2e: `village.spec.ts` „mladší syn po pohřbu zvolí směr“ (stav po smrti otce zapsaný přímo do DB).

## Opevnění v rozhraní (úloha 5.6, `lib/fort-view.ts`, `hud/selection/fortification.tsx`)

Návrh: [fortifications.md – Rozhraní](../design/fortifications.md); jádro a server actions:
[village-fortifications.md](village-fortifications.md).

- **Místo problému:** `checkFortificationPlacement` (a `checkFootprintFree`, `blockedGates`)
  vrací u neprošlé kontroly `where` (`PlacementWhere` – body ohybu, křížení a bran, obrysy, čtverce);
  `fortPointsPlacement` z něj složí čáry (`lib/problem-marks.ts`, čistá funkce) do
  `FortPointsPreview.problem` a editor je kreslí červeně i přes terén (kroužky kolem ohybu, křížení
  a bran, obrysy staveb, vody a cizího opevnění). E2E háček `paintProblems`.
- **Zásah do cest** (paths.md – Stavba přes cestu, Náhled u kurzoru – D96): stavba pod kurzorem
  (`PlacementController`) i ohrada a hřbitov po čtvercích (`FieldPainter`, `PlacementMode.blocks`)
  kreslí žlutě kusy cest, které by po postavení opustila (`roadsUnderPlanned` v
  `lib/scene/placement-hints.ts`), a k varování u kurzoru připojí „Cesta se přeruší“
  (`ROAD_CUT_WARNING`); stavbu to neblokuje. E2E háček `roadHints`, spec
  `e2e/placement-road-hint.spec.ts`.
- **Katalog staveb** (`lib/build-items.ts`): záznam `fortification` (zkratka **P**, ikona
  `build/opevneni.png`, `placement: 'fort-points'`) je rozcestník druhů `FORT_VARIANTS` (plot,
  palisáda, roštová a komorová hradba, val – ikony `resources/fort-*.png`, roštová a komorová
  zatím ikonou palisády) jako ohrady. Palisáda s ochozem v rozcestníku není (jen vylepšením).
  Roštová a komorová před svým rokem zašedlé s důvodem v popisku: `fortVariantsBlocked(day)` (id
  → `wallYearReason`, den `view.dayIndex`) → `BuildGrid` prop `blockedVariants` (jen otevřený
  rozcestník opevnění); `startBuild` zašedlý druh nespustí. Rozhoduje server podle `state.lastDay`. `BuildKind` v jádru **zůstává beze
  změny** (cena opevnění není pevná, počítá se podle délky – `fortificationCost`), proto má web
  vlastní `WebBuildKind = BuildKind | 'fortification'`; nabídka (`options`) má pro opevnění `null`.
  `propose` volá `proposeFortificationIn` z jádra (stejný návrh jako server, nad `PlacementVillage`
  - obilné jámy ze scény), `check` = `fortPointsPlacement`.
- **Úprava návrhu** (`lib/scene/fort-points-editor.ts`, `FortPointsEditor`, režim `fort-points`
  v `PlacementMode`; Martin 7. 11. 2026): druh v rozcestníku spustí editor, ten u prvního bodu
  kurzoru zavolá `propose` (jádro bez staveb uvnitř jiného opevnění, jinak kruh 20 m u kurzoru).
  Body se **táhnou** (stisk a tažení – myš i trackpad, bez pravého tlačítka), **klik na obvod** (do
  šířky pásu, nejméně 2 m od vnějšího okraje) přidá bod na křivku, **Ctrl / Cmd + klik** bod ubere
  (nejméně 4), Backspace / Ctrl+Z vrátí úpravu, Esc vrátí rozběhnutý tah nebo návrh zahodí,
  **Enter** nebo **ikona kladiva** (`hud/FortConfirm.tsx`, zašedlá s důvodem v popisku) pošle body
  do `placeFortification` (`points`). Čisté funkce bodů v `lib/fort-points.ts` (`insertPoint` –
  mezi body s nejmenší zajížďkou, `removePoint`, `movePoint`, `nearestPoint`, `nearestOnLoop`).
  Kontrola `fortPointsPlacement(landscape, village, points, kind, woodSupply, stoneSupply?)` volá
  `checkFortificationPlacement` z jádra (stejně jako server) nejvýš po 80 ms tažení; cena u kurzoru
  je práce bez kácení a lámání, klády, kámen (m³, `PlacementCost.stoneM3`, ikona
  `resources/stone.png` z úlohy kamene) a útočiště (lidé – `refugePlaces`); chybí-li dřevo
  (`VillageView.woodSupply`), místo ceny červeně „Chybí N klád.“, chybí-li kámen na hromadách
  a na mapě není lom (`VillageView.stoneSupply` – `fortStoneSupply`: `{ m3, quarry }`), „Chybí N m³
  kamene.“ (`FORT_NO_STONE`). Všechny důvody
  červeně. Obrys = vnější okraj a vnitřní okraj pásu (zelený / červený), brány z `autoGates` podle
  `PlacementVillage.walkRoads` bíle, body jako kroužky (bod pod kurzorem větší, s Ctrl červený).
  E2E háček `fortPoints` vrací body návrhu. Malování po čtvercích a `squarePoints` v rozhraní
  skončily – čtverce zůstaly jen pro převod starých opevnění (`withFortPoints`).
- **Data pro scénu** (`SceneVillage.forts`, `SceneFortification` – jádro `Fortification` + `building`,
  uzavřený `outline` a `band` po úsecích, počítá `sceneFortifications`): minimapa (`drawMinimapVillage`,
  obvod čarou v barvě druhu `FORT_COLORS`), výběr (`pickVillageTarget` – pás nebo do `FORT_PICK_M`
  od okraje), zvýraznění výběru (`selection-highlight.ts`) a kontrola umístění (`PlacementVillage`
  `fortifications` a `constructions` s `fortificationId` – jinak by prohlížeč neznal dotyk s jiným
  opevněním ani zabraný pás).
- **Panel** (`SelectionDetails` druh `fortification` = `VillageFortification` z
  `fortificationViews`): ikona druhu, délka, stav nejslabšího úseku (oranžově, má-li úseky za
  životností), brány, ~~násobek obrany (štít)~~ (zrušen 8. 11. 2026), útočiště (lidé, dobytek), průběh stavby (zrušení přes
  `cancelConstructionId`). Příkazy: ~~„Vylepšit na palisádu“ (plot), „Postavit na valu plot“ /
  „… palisádu“ (val)~~ – od Úlohy 17 „Vylepšit vše“ a Doplnit val (níž), ikona brány (`aria-pressed`) zapne režim klikání na
  obvod (`LandscapeScene.setGatePick`: další levé kliknutí pošle bod terénu do `addFortificationGate`,
  pravé a Esc zruší, změna výběru režim vypne). Akce jdou přes `upgradeFortification`
  a `addFortificationGate`.
- **Panel úseku, celé hradby a brány** (Úloha 17 plánu hradeb; fortifications.md – Hradby a obrana,
  Rozhraní a scéna): `fortificationViews(state, landscape, day, woodSupply, obstacles?)` počítá
  z jádra na klonu stavu – `VillageFortSection.upgrades` (`sectionUpgrades` – nabídka Vylepšit,
  `FortUpgradeView { target, option }`, cena práce, klády a kámen, důvod z jádra; `FORT_BUSY` jako
  „Stavba už běží.“), `rampartAdd` (`startRampartAddition`; úsek s valem null), `moat`
  (`startMoatFill`; bez valu či napuštěný null), `assault` (`FortAssaultView[]` v pořadí
  `FORT_ASSAULT_ICONS` – žebřík, sekera, oheň, rýč: u každé ikony nejrychlejší místo úseku
  `assaultSteps(crossingLayers(…))` a `assaultHours` se 4 muži a otepmi do 100 m – návrh Clauda;
  `climb` pod ikonou žebříku, `mine` pod rýčem; postup, který nikde nejde, null – zašedlý);
  `VillageFortification.upgrades` a `rampartAdd` pro celé opevnění (segment null – „Vylepšit vše“,
  nahradily starší `upgrade` a `tops`), `occupancy` (`fortDefenders` – muži 16–44 let, délka obvodu,
  `fortOccupancy`); `VillageFortGate.pincer` / `tower` (`gateUpgrade` + `startGateUpgrade` kvůli
  dřevu a kameni; hotové null) a `assault` přes bránu. Panel (`hud/selection/fortification.tsx`):
  úsek – ikony postupů s časem (`selection-fort-assault-<ladder|cut|burn|dig>`, popisek „Žebříky –
  2 h se 4 muži“, `formatAssaultHours`), obsazení (`selection-fort-occupancy`, popisek „Obsazení
  hradby – N mužů na M m“, červeně pod 100 %), první řádek příkazů nabídka Vylepšit
  (`fort-upgrade-<druh>`), druhý Doplnit val (`fort-rampart-add`), Napustit příkop (`fort-moat`),
  Zbořit a Přidat bránu; celé opevnění `fort-upgrade-all-<druh>`, `fort-rampart-add`, obsazení;
  brána `fort-gate-pincer`, `fort-gate-tower` a postupy přes bránu. Popisek tlačítka: název, práce,
  klády, kámen (`resources/stone.png`) a důvod červeně. Jedna obsluha `onFortAction(fortificationId,
segment | null, FortAction)` (`upgrade` s `target`, `rampart`, `moat`, `gate` s `level`) –
  `villageCommands` (`onFortAction`) ji rozešle na server actions `upgradeFortification` (`target`, `segment`),
  `addFortificationRampart`, `fillFortificationMoat`, `upgradeFortificationGate` (vstupy
  `parseUpgradeFortificationInput`, `parseFortificationRampartInput`,
  `parseDemolishFortificationSectionInput`, `parseFortificationGateUpgradeInput`; práva `build`).
  Ikony druhů `FORT_ICON_SRC` (celá cesta; ochoz, roštová a komorová vlastní SVG), ikony akcí
  a postupů vlastní SVG (CC0) v `public/icons/resources/`. ~~**Postavit jinudy** v panelu brány~~ zmizelo (Martin 14. 11. 2026, D28): mezeru od brány
  k bráně hráč zastaví **běžnou stavbou** – rozcestník opevnění a druh u mezery spustí editor
  s konci v branách (`fortGapNear`, village-fortifications.md – Úsek od brány k bráně), u otvoru po
  zbořené bráně konce otvoru bez přidávání bodů (`fixedRoute`, `fillFortificationGateGap` –
  village-fortifications.md – Otvor po zbořené bráně). Panel brány
  má Opustit / Vrátit (`fort-gate-abandon` / `fort-gate-restore`) a Zbořit (`fort-gate-demolish`) –
  village-fortifications.md – Brána: Opustit a Zbořit.
- Testy: `lib/__tests__/build-items-fortification.test.ts` (návrh, tažení mění cenu, místo problému),
  `components/game/hud/__tests__/FortificationPanel.test.tsx`, `FortSection.behavior.test.tsx` (nabídka
  Vylepšit, val, příkop, postupy, obsazení, brána), `FortGate.behavior.test.tsx` (Opustit, Vrátit,
  Zbořit, bez Postavit jinudy), `lib/__tests__/scene-fortifications.test.ts`
  (panel úseku plotu), `lib/scene/__tests__/fort-picking.test.ts`;
  `lib/__tests__/fort-points.test.ts` (přidání, ubrání, nejméně 4 body, posun);
  e2e `e2e/fortification.spec.ts` (návrh palisády kolem zemnice přes pevnou cestu, posun bodu
  zvedne cenu – bod vybere `checkFortificationPlacement`, tah bodu uprostřed oblouku návrhu o 4 m
  by byl ostrý ohyb, ikona kladiva položí → brány na cestě, panel; posun bodu přes zemnici → důvod
  a červená značka; snímek do `FORT_UI_SHOT`; panel úseku palisády – ochoz jen v úseku, Doplnit val
  u druhého úseku, brána s klešťovou bránou a věží, u plotu klešťová zašedlá; snímek panelu do
  `FORT_SECTION_SHOT`).
- Modely opevnění ve scéně jsou úloha 5.7.

## Pomoc a půjčky v rozhraní (úloha 4.6)

- `TermsForm.tsx`: `TERM_ROWS` má řádky `aid-request`, `gift`, `loan` (`AidRow`) – ikony `house/aid.png`, `gift.png`,
  `loan.png` (`public/icons/LICENSES.md`), políčka zboží (`GOODS_SLOTS`), výběr vsi, u půjčky splátkový
  kalendář (rok + zboží, přidat / odebrat splátku). V „aid“ režimu formuláře není přidávání ani odebírání řádků; pán přepíná
  odpověď tlačítky **Dát zdarma** / **Půjčit se splátkami** (`terms-aid-gift`, `terms-aid-loan`).
- `HousePanel.tsx`: u pána tlačítko **Požádat o pomoc** (`agreement-request-aid`, ikona `aid`) otevře formulář s řádkem
  žádosti; `gameYear` (z `view.dayIndex`) dává výchozí rok první splátky.
- `lib/house-input.ts`: `parseTermItems` rozumí aid řádkům (`parseSchedule`); `lib/terms-view.ts`: `aidChips`, `AID_ICONS`.
- `LevyDialog.tsx`: řádek `kind: 'repay'` (ikona půjčky, nabízí všechno zboží – splátka jiným zbožím platí podle hodnoty).

## Správa cizí vsi v rozhraní (úloha 4.8)

- **Přepínač vsí** (`hud/VillageSwitcher.tsx`): ves cizího držitele, kterou hráč spravuje, má ikonu klíče
  (`village-key.svg`, `data-testid="steward-key"`); položka má `VillageListItem.stewarded`. Přepnutí jede přes
  cookie vybrané vsi stejně jako u vlastních vsí na jiné mapě.
- **Panel „Rod a vazalové“** (`hud/HousePanel.tsx`): řádek „Správci vsí“ (`house-stewards`) s tlačítkem Odvolat
  (`steward-dismiss-<villageId>`) pro držitele; `HouseView.stewardships`.
- **Jídlo domény** (`hud/DomainFood.tsx`, `DomainFoodRows`; řada `house-food` v `HousePanel` za „Rod“, jen s `HouseView.domainFood`
  z `HousePanelData.domainFood`, viz [vassalage.md](vassalage.md) – Jídlo domény v panelu): řádek sídla
  (`house-food-village`: `manor.png` s jménem, `harvest.png` vypěstuje, `food.png` potřebuje, `balance.png` ± rozdíl –
  záporný červeně, `data-bad`), vazal (`house-food-vassal`: portrét rodu, obilí, dobytek, pečeť s popiskem
  „Domluveno – nemusí přijít“, `house-food-agreed`) a součet (`house-food-total`, „Doména – zbývá“ / „Doména – chybí“).
  Čísla kg zaokrouhlená na celé; slova jen v `Tooltip`.
- **Nabídka** (`hud/TermsForm.tsx`): u nabídky vazalství přidá pán tlačítkem klíče (`terms-add-stewardship`)
  řádek „Svěřit správu vsi“ s výběrem své vsi (`term-stewardship-select`); `lib/house-input.ts` ho parsuje.
- Server: akce správce jdou stejnými server actions jako vlastní (`actOn` → `guardedAction`); právo i zámek
  řeší `lib/village.ts`, viz [vassalage.md](vassalage.md) – Správa cizí vsi.

## Panel Vojsko (úloha 6.6, `hud/ArmyPanel.tsx`, `lib/army.ts`, `lib/army-view.ts`, `lib/army-input.ts`)

Textový panel bez mapy (Martin 2. 11. 2026 – výjimka z „bez popisků“). Vstup: tlačítko **Vojsko**
(`manor-army`, ikona boje) v `ManorUpgrades` (`ManorPanel.tsx`) vedle stezky, lovu a obchodu; zašedlé
bez práva `war` (`useRightDenied`) – ves bere z `VillageIdProvider` (`hud/rights.tsx`, nastavuje
`VillageGame`). Volání serveru dostává panel z `ArmyActionsContext` (`hooks/use-army.ts`), takže
se vykreslí i v testech bez serveru.

- Server actions `getArmyPanel`, `planArmyCampaign`, `launchArmyCampaign` (`app/game/actions.ts`,
  vstup `lib/army-input.ts`); data panelu `armyPanelForPlayer` (`lib/army.ts`): vsi rodu (muži rodu
  způsobilí tažení, počet způsobilých vesničanů; s vybraným cílem dobrovolníci a ochotní / neochotní),
  cíle = vsi rodů ve válce, hráčův muž.
- Panel: cíl, velitel (výchozí hráčův muž), zástupce, shromaždiště, u každé vsi muži rodu zaškrtávátkem
  a počty dobrovolníků a nucených, skupiny, rozkaz ke vzdaným, jídlo; odhad síly a cesty se po
  každé změně ptá serveru (`planCampaign`, odpověď nebo důvod červeně), **Vyslat** je zašedlé bez
  odhadu. Ověření a pravidla jsou na serveru – panel posílá jen plán (`war.md` kód – Ú6.6).
- Testy: e2e `multiplayer.spec.ts` (vojsko); serverové `action-rights.test.ts` hlídá klíče práv.

## Dotazování na tažení a mapa tažení (úloha 6.14, `hooks/use-campaign.ts`, `hud/CampaignMap.tsx`)

- **Route** `GET /api/campaign/<id>?since=<takt>` (`app/api/campaign/[id]/route.ts`, `no-store`,
  session povinná) → `{ view: CampaignView }`; `?map=<x>,<y>` → `{ map: ForeignMap }` (krajina
  políčka, `lib/foreign-map.ts`); `?scene=<x>,<y>` → `{ war: WarSceneView | null }` (válka na té
  mapě z pohledu útočníka – `warSceneOnMapForPlayer`, cizí tažení i mapa bez vojska = `null`).
  Cizí i neexistující tažení = stejná 404. Route Handler, ne server
  action – server actions jednoho klienta jdou za sebou a dotaz by čekal za pokynem.
- **`useCampaign(id)`** (plán 2026-11-15 – Úloha 5; server-events.md – Válka): pohled nese událost
  serveru `campaign`, jeden `GET /api/campaign/<id>?since=-1` jde při otevření, na obnovu po mezeře
  (`sync`) a na `refresh` (po pokynu) – bez dotazování; starší nebo týž takt se zahodí. Polohy mezi
  dvěma stavy interpoluje `interpolateCampaign` (`lib/campaign-view.ts` – typy z jádra pro scénu)
  po dobu mezi body, nejvýš `CAMPAIGN_SPAN_MAX_MS` (15 s); `view` se překreslí po 100 ms, scéna si
  bere `sample(performance.now())`. `CampaignMap` dá tažení do rozsahu spojení událostí
  (`useEventScope({ campaignId })`) – přítomnost vůdce pak hlásí server z tepu spojení (záměr
  `presence` při připojení a po 20 s); skrytý panel prohlížeče spojení nemá = žádná přítomnost.
- **Server actions** (`app/game/actions.ts`, vstup `lib/campaign-input.ts`, composition root
  `lib/campaign.ts`): `getMyCampaigns`, `commandLeader` (`{ campaignId, target }`), `setGroupOrder`,
  `chooseSurrendered`; přijatý pokyn `{ ok: true, tick }` (takt záměru), odmítnutí
  „Rozkaz nelze dát.“ (nic neprozradí) – kromě místa, kam skupina velitele nedojde vůbec
  (`commandCampaign` → `unreachable`): „Tam vojsko nedojde.“ (war.md – Pohyb – Cíl v neprůchodné
  buňce).
- **Mapa tažení** (minimální, scénu vojska kreslí `lib/scene`): v panelu Vojsko řádek běžících
  tažení (`army-campaign`, ikona s cílem v popisku) → `CampaignMap` – pohled shora na mapu velitele
  (SVG v metrech mapy): velitel (`campaign-commander`, `data-x` / `data-z`), vlastní muži, spojenci,
  cizí v dohledu (klik = napadni), objevené domy (klik = jdi k domu), cíl (`campaign-goal`); klik
  na mapu = velitel jde. Cíl ukazuje místo kliku jen do taktu záměru z odpovědi (`PendingGoal.until`;
  odmítnutý klik značku nenechá, důvod je v `campaign-reason`), pak cíl skupiny velitele ze stavu
  – klik do vody tak ukáže cíl posunutý na nejbližší dosažitelné místo (jako v 0 A.D.). Ikony Domů, tři rozkazy skupiny velitele a v boji Pobít / Odvést / Nechat,
  slova jen v `Tooltip`; nevede-li hráč živě, vše zašedlé („Velí jiný muž.“). Oko
  (`campaign-watch`, „Ve scéně“ / „Zpět na ves“, `aria-pressed`) přepne scénu na cizí mapu – výš.
  Pohled nese i `CampaignView.flights` (Ú14 – skupiny uprchlíků na cestě a běžící poslové v dohledu
  vlastních mužů: políčko, poloha, lidí, kusů, posel na koni); ikonu na `CampaignMap` doplní práce
  na rozhraní (ikony Ú13).

- **Válka ve scéně** (`hooks/use-war-scene.ts`, war.md – Ve scéně – napojení na hru; plán
  2026-11-15 – Úloha 5, server-events.md – Válka): `useWarScene(key, url, enabled)` – stav nese
  událost serveru `war` s klíčem mapy (vlastní `warKeyOfSettlement(sídlo)`, cizí
  `warKeyOfScene(tažení, políčko)`), po mlze války. Jeden dotaz na `url` (vlastní mapa
  `GET /api/war-scene/<sídlo>`, cizí `GET /api/campaign/<id>?scene=x,y`) jde při zapnutí, změně
  klíče a na `sync`; `enabled` řídí jen dotaz, událost svého klíče platí vždy. Nový stav jen
  s novým taktem nebo jiným tažením (`warSceneKey`); odpověď dotazu, během kterého přišla událost,
  se zahodí. `undefined` = ještě nic nepřišlo, `null` = na mapě nic. Dotazování po ½ s a po 5 s
  (D62, Martin 15. 11. 2026: „klient nemůže pollovat server každou půlvteřinu kvůli válce, která
  teď ani nemůže nastat“) je pryč. `useWarWatch` dotaz zapne se scénou a bez konce hry.
  `MapWatch.war` ani `MapWatch.riders` (use-case mapWatchFor, mapWatchForPlayer, `watch`
  v odpovědi dotazu na ves, initialWatch) už neexistují (návrh Clauda, plán 2026-11-15 – Úloha 6):
  `war` byl pravda už od začátku cizího tažení proti vsi (`activeAlarming`) a `riders` počítal
  vlastní i cizí výpravy na políčku vsi bez zkoušky dohledu – obojí by vojsko a výpravy prozradilo
  dřív, než je ve vsi kdo spatří. Válku nese událost `war` po mlze války, jezdce událost `visitors`
  (`scopeTasks` ji spočte hned při připojení a po `sync`; journey.md).
  Testy `use-war-scene.behavior.test.tsx`, `use-campaign.behavior.test.tsx`.

## Výjezd vojvody a výpravy – akce, cesta API a dotazování (plán 2026-11-13 – Úloha 7)

Server action `commandExpedition` (`app/game/actions/journey.ts`), `GET /api/journey` (`{ views }`, `?map=`, `?visitors=`) a `useExpeditions(running)` (`hooks/use-journey.ts`, od plánu 2026-11-15 z událostí serveru) –
podrobně v [journey.md](journey.md) – Web. Rozhraní ve scéně staví Úlohy 8 a 9.

## Cizí mapa ve scéně (`ForeignWarScene.tsx`, `hooks/use-army.ts`, `lib/war-scene-view.ts`)

War.md – Ve scéně – cizí mapa. Útočník (vůdce i vazal ve službě) sleduje své vojsko ve 3D na mapě,
na které stojí.

- **Výběr mapy** (`watchCellOf(view, home)`): políčko velitele na nohou, jinak prvního vlastního muže
  na nohou, jinak muže spojence; `null` – tažení skončilo, nikdo nestojí, nebo vojsko stojí na
  mapě sídla ve scéně (`homeCell` z `app/game/page.tsx` – tam ho ukazuje scéna vsi). Tlačítko oka
  v `CampaignMap` je pak zašedlé („Vojsko není na cizí mapě.“).
- **Přepnutí** (`ArmyActions.scene` – `SceneWatch`: `home`, `watching`, `watch`, `back`; bez něj
  tlačítko chybí): `VillageGame` při `watching` vrátí místo hry jen `ForeignWarScene` – scéna a rozhraní
  vsi se odpojí (dvě scény Babylonu naráz ne – návrh Clauda), návrat ji načte znovu.
- **`ForeignWarScene`** (`foreign-scene`, `data-cell`): krajina z `?map=x,y` (404 = zpět) do
  `GameView`, válka z `useWarScene(warKeyOfScene(…), …?scene=x,y)` (rozsah spojení
  `useEventScope({ scene })` – dál ji nese událost `war`) → `sceneWarOf(war, world, true)` – se závojem
  mlhy strany hráče; objevené domy `foreignVillageOf` → `setVillage` (jen stojící domy, bez lidí,
  polí a všeho dalšího; přestaví se jen novým objevem; co rod zná – níž). Kamera poprvé na vojsko (`armyFocusOf`,
  R se k němu vrací). Rozhraní: ⌂ zpět na ves (`foreign-back`), ⚔ mapa tažení (`CampaignMap` –
  živé vedení dál). `war === null` (vojsko z mapy odešlo, tažení skončilo) → jednou
  `GET /api/campaign/<id>` a `followCellOf(view, cell, home)`: vojsko stojí na jiné cizí mapě =
  scéna jde za ním (`SceneWatch.watch` – nový klíč, nová krajina z `?map=` a kamera znovu na
  vojsko), jinak (konec tažení, vojsko na mapě sídla, chyba) zpět na ves. Pochod i boj jdou mezi
  snímky plynule a rány z vynechaných taktů se nakreslí (war.md – Ve scéně – Plynulost mezi
  snímky). E2e háček `armyStats` míří na scénu cizí mapy.
- **Co rod zná** (plán 2026-11-13 – Úloha 12b; `WarSceneView.known` na mapě cíle i po cestě):
  ves `foreignVillageOf(buildings, known, krajina)` – objevené domy a stavby, jak je rod naposled
  viděl (`seenVillageOf` s krajinou dekódovanou z `?map=`), objevený dům má přednost před známým
  téhož id; opevnění ze znalosti se na mapě cíle nekreslí (útočník ho vidí ze stavu vsi), na mapě po
  cestě ano (`onTargetMap` – pohled s objevenými domy nebo bojem je z mapy cíle). Ves se přestaví jen
  při změně objevených domů nebo známých staveb (klíč z id domů a `seenSceneKey`); zmizí-li vše
  nakreslené, prázdná ves ho smaže, bez znalosti i objevu se `setVillage` nevolá jako dřív. Stopa
  rodu jde do `setJourneyFog` jen při změně (`known.trail`; prázdná – null, mlha jako dřív):
  `ArmyRenderer.updateFog` ji odkryje (šeré, `exploreTrail`) i s mlhou války a dohled (jasno)
  dává vojsko – jedna mlha. E2e háčky `foreignVillage`, `journeyFog` a `moveCameraTo` míří i na
  scénu tažení; `multiplayer-war.spec.ts` (rod A zná dům B a stopu u něj, vojsko 400 m od domu:
  dům ve scéně, u něj šeré, u vojska jasno, jinde mlha; `WAR_KNOWN_SHOT=<cesta>` – snímek).
- **Oko** v `CampaignMap` je jednobarevná maska `public/icons/war/eye.svg` (CC0, `LICENSES.md`)
  v barvě textu tlačítka (`EYE_ICON`) – jako znaky ⌂, ⚔, ✕ ostatních tlačítek.
- **Výjezd vojvody** jde za vojvodou stejně – `ForeignJourneyScene` (journey.md – Scéna cizí mapy).
  **Známá mapa z domova** (journey.md – Známá mapa): oko `KnownMapEye` u rodu v panelu Rod a vazalové
  a u cíle v panelu Vojsko otevře táž scéna (`ForeignJourneyScene` s `known`, `GET /api/journey?known=x,y`)
  bez jezdců; stav drží `useKnownMap`, e2e `expeditions.spec.ts`.

## Postoj vsi ve dvorci (úloha 6.9, `hud/ManorPanel.tsx`)

`ManorUpgrades` má vedle stezky, lovu a obchodu dvě ikony postoje (stěna štítů = Obrana, stromy = Evakuace; vlastní SVG v `public/icons/war/`, CC0,
`LICENSES.md`); zvolená má `aria-pressed` a zlatý proužek, popis je v `Tooltip`. `VillageManor.stance`
plní `manorView` (`stanceOf`), volba jde přes server action `setDefenseStance` → `setDefenseStanceForPlayer`
(`lib/village.ts`, právo `war` – bez něj tlačítka zašednou s důvodem). Upozornění `foreign-army` →
„Cizí vojsko u vsi Kněžice!“ (`lib/player-notices.ts`, panel války). Test: `ManorStance.behavior.test.tsx`.

## Trh v rozhraní – akce a pohledy (markets.md; plán 2 „Obchod 2“ – Úloha 7)

- **Akce** (`app/game/actions/market.ts`, `'use server'`): `getMarketOverview({ villageId })` →
  `marketOverviewForPlayer` (`lib/village.ts`, pohled bez práva přes `context` jako
  `panelOptionsForPlayer`; use-case `marketOverview`) a `sendMarketExpedition(input)` →
  `sendMarketExpeditionForPlayer` (přes `guardedAction`, právo `trade` v `ACTION_RIGHTS`; use-case
  `sendMarketExpedition` s `today: ctx.day`; úspěch = pohled na ves, odmítnutí `{ refused }` →
  `{ error: důvod }`). Vstup `{ villageId, targetVillageId, give, wants, stayDays }` převádí
  `parseMarketExpeditionInput` (`lib/village-input.ts`) – jen tvar (celá nezáporná čísla, známé
  zboží, id vsi), pravidla hlídá jádro (`MARKET_BAD_ORDER`, `checkMarketTrip`).
- **Pohledy** (`lib/market-view.ts`): `marketTripViews(state, day)` – výpravy na trh na cestě
  (fáze `out` / `market` / `back` / `waiting`, `daysLeft`); `marketPreview(order, market, cells)` –
  náhled výpravy (nosiči, vozy, dny pryč, důvod) jen převede `checkMarketTrip` jádra, vlastní
  pravidla nemá. Vstup náhledu je `VillageManor.market` (`lib/manor-view.ts`): zásoby všech druhů
  zboží (`villageGoodStock`), vozy doma (`tradeHomeCarts`), voli (`oxenHome`), volní dospělí
  (`marketFreeAdults`), den a výpravy na cestě.
- **Karavana** (`lib/caravan-view.ts` – `marketCaravan`): výprava `'market'` jde jako zásilka bez
  stezky po čáře ke kraji mapy ve směru `destination.firstStep`, tam s `give`, zpět nosiči,
  `trip: { kind: 'trade', to: jméno cílové vsi }`. Postup jde podle kalendáře (termín je pevný):
  cesta tam od `startedDay`, ve dnech pobytu stojí za krajem mapy (`rate` 0, `progress` 1), zpět od
  `arriveDay` + pobyt do `returnDay`.
- **Příkaz panelu**: `VillageCommands.sendMarket(targetVillageId, order)`
  (`components/game/village-game/village-commands.ts`) vrací důvod odepření česky, nebo `null`.

## Panel Trh (markets.md – Pravidla 9; plán 2 „Obchod 2“ – Úloha 8, `hud/MarketPanel.tsx`)

- **Otevření**: tlačítko `manor-market` (ikona `icons/build/obchod.png`, Tooltip „Obchod“, zašedlé
  bez práva `trade` – `useRightDenied`) v `ManorUpgrades` (`hud/ManorPanel.tsx`) volá `onOpenMarket`
  (`ManorActions` v `selection/dwelling.tsx` → `SelectionPanel`). `usePanels`
  (`village-game/use-panels.ts`) drží `market` (`open`, `villages`, `error`), `openMarket` načte
  `getMarketOverview` až při otevření (jako seznam známých map) a `closeMarket`; `VillagePanels`
  vykreslí `MarketPanel` nad scénou jako `Dialog` s `view.manor.market`, odeslání jde přes
  `commands.sendMarket`.
- **Panel** je jen pohled a záměr, žádná herní logika. Řádky `market-village` (jméno, dny cesty –
  Tooltip „Ráno tam, večer zpět“ / „{n} dní cesty“, vlastní rod; zašedlá ves s důvodem v Tooltip),
  zpráva `market-report` vybrané vsi (lidé a domy „≈ N“, řemesla, obchodníci, ceny; Tooltip „Zpráva z
  {datum}“; bez zprávy „?“, jen z výjezdů domy a řemesla), sloupce „Dáš“ (`market-give-<good>`, jen
  zboží ve skladu, nejvýš tolik, kolik ves má) a „Dostaneš“ (`market-want-<good>`) s `-minus` /
  `-plus` a číslem `-count` (`Stepper`, `hud/Stepper.tsx`; kg po 100, kusy a m³ po 1), `market-stay`
  (dny na trhu, nejméně 1), `market-preview`
  (nosiči, vozy, dny pryč z `marketPreview`), `market-send` (Tooltip „Vyslat výpravu“ nebo důvod
  z náhledu, bez vsi „Vyber ves.“), `market-error` (důvod od serveru do změny výběru) a
  `market-trip` (výprava na cestě – jméno vsi, ikona fáze, dny do návratu).
- **Testy**: `hud/__tests__/MarketPanel.test.tsx`, `ManorPanel.test.tsx`; e2e `e2e/market.spec.ts`
  (výprava z dvorce do vlastní vsi na sousední mapě, výprava ve stavu a příjezd ve schránce).

## Trh plánu 3 – kronika, upozornění, panely a cizí správce (markets.md – Rozhodnutí plánu 3, body 13–15; Úloha 11)

- **Kronika** (`lib/village-view-chronicle.ts`): `market-departed` podle `by` („Vesničané jeli na trh
  do …“, „Správce poslal výpravu do …“, „Kovář šel kovat koně do …“; výprava hráče beze změny, `kin`
  bez řádku – `shownInChronicle` v `lib/chronicle-view.ts`), `bride-from-outside` / `groom-from-outside`
  („Nevěsta z …“, „Ženich z …“), `married-away` („Dcera se vdala do …“, `groom` „Syn se přiženil do …“),
  `extra-wife` (+ „z <ves>“), `newcomer` s `villageName` („Do vsi přišla rodina z …“, vrácení lidé „se
  vrátila prodaná rodina“), `horses-shod` („Kovář z … okul koně“), `order-ready` („Zakázka v … je
  hotová“), `market-arrived` s `smith` („Na trh přišel kovář z …“). Starší záznamy bez `villageName`
  se čtou jako dřív. Pády jmen vsí: `lib/village-name-cases.ts` (`fromVillage`, `toVillage`,
  `inVillage` – prázdné jméno dává „ze / do / v sousední vsi“).
- **Upozornění** (`lib/village-notices.ts`): „Nevěsta z Lhoty“, „Ženich z Lhoty“, „Dcera se vdala do
  Lhoty“ / „Syn se přiženil do Lhoty“ (bez jména vsi dřívější „z okolí“ a „pryč“), „Přišla rodina z
  Lhoty“; vrácení lidé mají vlastní druhy `newcomer-back-*` („Vrátila se prodaná rodina“). Kování koní
  upozornění nemá. `VillageView.chronicle` nese `villageName`, `groom` a `returned`.
- **Ohrada koní** (`lib/horse-view.ts`): `VillageHorses.shoeing.smithFrom` (čekající dotaz
  `shoeing.asked`, jinak poslední `horses-shod` s `own: false`), `shoeingSmithText` – „Kuje vlastní
  kovář“ / „Kovář z Lhoty“ / „Kovář není“ (Tooltip, `selection/fields.tsx`).
- **Dvorec**: `VillageCraftSource.order` (`productOrder` v `lib/village-view-crafts.ts` z
  `VillageState.orders`, nejnovější neodmítnutá) – Tooltip řádku výrobků „Nástroje – zakázka v Lhotě“,
  „… – hotová zakázka v Lhotě“ (`selection/crafts.tsx`).
- **Panel Trh**: nové zboží (nástroje, dřevěné nářadí, vozy, rodiny, muži, ženy) bere z
  `TRADE_GOOD_NAMES` (ikony `tools`, `wood-tools`, `cart`, `family`, `man`, `woman`), nejvýš
  `villageGoodStock` (celá kg; lidé – nejvýš kolik skupin druhu ves dá samotných). Lidé berou
  z týchž lidí a výběr je postupný (pořadí mužů a žen se s odchodem rodin mění), takže pohled
  dvorce model výběru nenese – kolik skupin s celým výběrem odejde a kolik dospělých zbude na
  nosiče, spočítá jen server pro vybrané počty: panel (`useMarketPeople`, `hud/use-market-people.ts`)
  se `MARKET_PEOPLE_DELAY_MS` po poslední změně zeptá akcí `getMarketPeople`
  (`marketPeopleForPlayer` v `lib/village.ts` → `marketTripPeople` jádra nad vsí dopočítanou do
  dneška, stejně jako `planMarketTrip` při odeslání; `askPeople` v `use-panels.ts`) a odpověď
  předá `marketPreview`. Do odpovědi pro tytéž počty a týž pohled (nový pohled – zeptá se znovu)
  náhled chybí a odeslat nejde; chyba dotazu je důvod u odeslání. Prodávaní lidé nejsou nosiči.
  Dřívější model všech kombinací (`(F+1)·(M+2)` výběrů při každém pohledu) stál u vsi s 250 lidmi
  vteřiny (plán 3, Úloha 11, opravné kolo 2). Voly pro koupený vůz kontroluje jádro
  (`MARKET_NO_OXEN` jako důvod náhledu). Kovář souseda ve zprávě (`traders[].smith`) je ikona kováře, ne zboží; výprava do
  vsi bez jména je „Sousední ves“; obchodník ve zprávě nese `villageId` domova a cizímu správci
  `marketOverview` vypustí jméno, pokud jeho ves správce nezná (starší záznamy bez `villageId` též).
- **Cizí správce**: `maskVillageNames(state, allowed)` (`lib/mask-village-names.ts`, volá
  `shownToActor` v `lib/village.ts` při skládání pohledu i stránky kroniky) nahradí prázdným jménem
  jména vsí, které `marketOverview` s `actorId` správci neukáže – záznamy kroniky plánu 3 (i starší bez
  `villageId`), zakázky, `shoeing.asked` a cíle výprav na trh. Starší druhy bez `villageId`
  (`lord-sent`, `shipment-sent`, `shipment-received`, `people-away`, `guests-came`, `refuge-left`
  a `to` u `iron-trip`) maskuje vždy – nelze ověřit, čí ves je; věty pak říkají „do jiné vsi“
  (vojvoda), „do sousední vsi“ / „ze sousední vsi“, zásilky a útěk do hradiště jméno vynechají.
  Klient jména nedostane. Use-case
  `collect` (`application/market.ts`) správci vynechá i zprávy (`news`) o ostatních vsích držitele.
- **Testy**: `village-view-chronicle-markets3.test.ts`, `village-notices.test.ts`, `horse-view.test.ts`,
  `product-order.test.ts`, `mask-village-names.test.ts`, `market-view.test.ts`, `village-name-cases.test.ts`,
  `MarketPanel.test.tsx`, `SelectionPanel.test.tsx`, `use-panels.behavior.test.tsx`,
  `market-trip-people.test.ts` (jádro – rovnost s dřívějším modelem na vsích s rodinami); e2e
  `e2e/market.spec.ts` (nástroje a muž v „Dáš“, odeslání, kronika ve stavu).

## Mince, kupci a zbroj v rozhraní (markets.md – Rozhodnutí plánu 4, body 3, 8, 12 a 15; Úloha 14)

- **Pohledy** (web nic nepočítá, seed zastávky klientovi nejde – jen dny): `WaresView.coins` a `arms`
  (`summary.ts`, `waresView` – jen kladné, i ve vsi bez `wares`), `VillageManor.market` (`merchantsField`
  v `lib/manor-view.ts`): `merchantsDay` – den příštího příjezdu kupců (dnešek jen v den příjezdu; null =
  ves bez stezky), `arms` – zbroj s cenou dne v mincích (`coinPriceOf` s hladinou trhu) a objednaným počtem
  (jen u vsi se zastávkou kupců, jinak prázdné), `merchantsArrived` – den posledního příjezdu.
- **Zlato a dílny zlata (gold.md, plán 6)** – `WaresStock` ukáže před mincemi `wares-gold` (ikona `gold`, celé gramy `WaresView.goldG`, popisek „Zlato – 84 g“) a `wares-jewellery` (ikona `jewellery`, `WaresView.jewelleryG`, popisek „Šperky – zlato a mince za 1,5násobek, ještě pro 30 g“), jen kladné. Údaje dílen počítá jádro (`summary.ts` – `goldWorkshopSummary`, typ `GoldWorkshopSummary`: rýžovník `{ placersLeft, leftG, walkM }`, šperkař `{ wroughtG, materialG }`, mincovna `{ goldG }`), `craftsView` je předá v `VillageWorkshop.gold` a `workshopDetails` v `SelectionWorkshop.gold`; panel `GoldWorkshopStats` (`selection/crafts.tsx`, vzor `SmithOreStats`) je ukáže ikonami s čísly (`selection-workshop-placers`, `-placer-walk`, `-wrought`, `-material`, `-mint-gold`). Testy `lib/__tests__/village-view-crafts.test.ts`, `GoldWorkshopStats.test.tsx`, `WaresStock.test.tsx`.
- **Zásoby dvorce** – `WaresStock` (`selection/wares.tsx`): mince a každý druh zbroje ikonou s celým
  číslem (`wares-coins`, `wares-<zbroj>`; popisek jméno zboží), při nule nic; ves jen s mincemi ukáže jen
  je. Horní lišta beze změny.
- **Kupci ve dvorci** – `MerchantsStat` v `ManorUpgrades` (`hud/ManorPanel.tsx`): ikona `merchants` a počet
  dní do příjezdu (`manor-merchants`), popisek „Kupci přijedou za 12 dní – kupují med, vosk a kožešiny,
  prodávají meče, kroužkové košile a helmy“ (zboží z `MERCHANTS` přes `goodsNames` v
  `lib/trade-names.ts`), v den příjezdu „Kupci jsou dnes ve vsi – …“; ves bez stezky nic.
- **Panel Trh** (`hud/MarketPanel.tsx`): ceny ve zprávě jsou v mincích i s hladinou (`PricesLine` –
  `coinPriceOf(prices, level, good)` jádra, `VillageNews.level`, chybí = 1; `formatCoinPrice`), mince jsou
  v „Dáš“ (popisek „Mince“), v „Dostaneš“ ne. Obchodník s příznakem `merchants` je „Kupci“ s ikonou (příznak
  se testuje před prázdným jménem – „Sousední ves“) a nad obchodníky je den příštích kupců
  (`market-report-merchants`, „Kupci přijedou 12. 8.“, `formatDayMonth`) z `VillageReport.merchants`; den,
  který od zprávy už minul, se neukáže.
- **Objednávka zbroje** – `ArmsOrder` (`hud/ArmsOrder.tsx`) nahoře v panelu Trh vlastní vsi u stezky, jen
  s neprázdným `arms`: den kupců (`market-arms-date`), u každé zbroje ikona, cena v mincích a objednaný
  počet (`market-arms-<zbroj>`, `Stepper` od nuly; popisek „Meče – ves je koupí od kupců za své mince“).
  Bez práva `trade` zašedlé s důvodem. Každý klik jde hned a v pořadí na server
  (`VillageCommands.orderArms` → fronta `runAction` → akce `orderArms`), takže se poslední počet neztratí ani
  po zavření panelu; do odpovědi na poslední změnu zboží se ukazuje naklikaný počet (odpověď na starší
  změnu nic nepřepíše), pak zase počet ze serveru. Důvod odmítnutí ukáže sekce v `market-arms-error`
  (zmizí s další změnou); `VillageCommands.orderArms` ho navíc ohlásí řádkem nahoře (`reported`) jako
  ostatní akce nad vsí.
- **Prodej otroků** (markets.md – Rozhodnutí plánu 5, bod 8) – `SlaveSale` (`hud/SlaveSale.tsx`) v panelu Trh
  vlastní vsi pod zbrojí, jen s ne-null `VillageManor.market.slaveSale` (`{ stock, forSale, price }`:
  `stock` = `market.stock.slaves` z téhož průchodu `marketField`, `forSale` = `slavesForSale`, `price` =
  `coinPriceOf(…, 'slaves')`; null, když není zásoba ani nabídka). Ikona otroka s počtem, cena v mincích a
  `Stepper` od 0 do max(`stock`, `forSale`) s hodnotou `forSale` (`market-slaves`; nabídka nad zásobou po
  pokřtění otroka zůstane vidět a jde snížit); popisek „Otroci na prodej – ves je prodá kupcům a výpravám na
  svém trhu za cenu dne“. Chování jako `ArmsOrder` (pořadí odpovědí, důvod v `market-slaves-error`, bez
  práva `trade` zašedlé); `VillageCommands.offerSlaves` → akce `offerSlaves`. Cenu a kdo jde prodat počítá
  server, web jen zobrazuje.
- **Otroci v náhledu výpravy** – `peopleIn` a klíč dotazu v `useMarketPeople` berou i `give.slaves`
  (jen s otroky se do dotazu přidá `slaves`); `parseMarketPeopleInput` přijme volitelné celé nezáporné
  `slaves` (jinak null). `marketPreview` bere zásobu otroků a volné dospělé z odpovědi `marketTripPeople`
  (odcházející otroci nenesou; odpověď bez otroků zásobu otroků nepřepíše), takže náhled neodmítne platnou
  výpravu ani nepustí tu, kterou server odmítne (`MARKET_NO_PEOPLE`).
- **Upozornění** „Kupci přijeli“ s ikonou kupců (`VillageNotice.icon`, `lib/village-notices.ts`): za každý
  příjezd – `merchantsArrived` je novější než v minulém pohledu.
- **Kronika** (`lib/village-view-chronicle.ts`): `merchants-arrived` „Přijeli kupci z daleka – prodávají …,
  kupují …“ (`goodsNames`); v `market-held` a `market-returned` jsou mince zvlášť („zaplatila 4 mince“,
  „dostala 16 mincí“ – `coinsText`, `exchangeParts`).
- **Testy**: `WaresStock.test.tsx`, `MarketPanel.test.tsx`, `ManorPanel.test.tsx`, `manor-view.test.ts`,
  `trade-names.test.ts`, `village-notices.test.ts`, `village-view-chronicle-markets4.test.ts`; e2e
  `e2e/market.spec.ts` (mince v zásobách a výprava s nimi, příjezd kupců, objednávka meče přes obnovení
  stránky; otroci – `manor-slaves` s popiskem, sekce prodeje `market-slaves`, řádek otroků v „Dáš“ a „Dostaneš“,
  nabídka po obnovení stránky a nulou vynulovaná).

## Rozkaz „Probít se“ (fortifications.md – Obrana bez násobku 3, `hud/BreakoutButton.tsx`)

Obránce sleduje boj u své vsi ve scéně (`useWarScene`); `breakoutOf(warScene)`
(`lib/war-scene-view.ts`) z `WarSceneView.breakout` – null (ves bez opevnění s branou, nebojuje se,
pohled útočníka) = tlačítko chybí, jinak důvod (`BREAKOUT_BLOCKED` z jádra – „Boj neběží.“, „Nikdo
nebrání hradbu.“, „Obránci utíkají.“, „Obránci se už probíjejí.“) nebo null. `BreakoutButton`
(`data-testid="breakout"`, vlevo pod lištou – návrh Clauda, obrana jiný panel boje nemá): ikona
`public/icons/resources/breakout.png` (palisáda s otevřenou bránou a šipka ven, CC0, `LICENSES.md`),
název v `Tooltip`, důvod červeně (`denied`); bez práva `war` zašedne s důvodem práva. Klik → server
action `orderBreakout({ villageId })`; po odeslání zašedne („Obránci se už probíjejí.“), chyba serveru
se ukáže stejně – platí, dokud server nepošle jiný důvod, nejdéle 10 s. Test:
`BreakoutButton.behavior.test.tsx`, `war-scene-view.test.ts` (`breakoutOf`); e2e `multiplayer-war.spec.ts`
– „obránce za hradbou s branou rozkáže ‚Probít se‘“ (boj zapsaný do kontrolního bodu bez workeru, klik
→ řádek `campaign_intent` s `breakout` od hráče B; obránce v krytu a vzdaný ve scéně, snímek
`probijeni.png` v `test-results`). Popisek tlačítka u levého okraje: `Tooltip` `below-right`.

## Varování a útěk v rozhraní (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09)

**Data a akce (Úloha 12).** Use-case `villageAlarmView` (`application/alarm-view.ts`, podrobnosti
`docs/code/war.md` – Varování: pohled a příkazy) vrací `AlarmView`: `warned`, `campaignId`
(nevarovaná ves null – nerozliší se od vsi, na kterou nikdo netáhne), `options` pro `messenger`,
`forest`, `people`, `all` (`ALARM_CHOICES` – pořadí ikon) s kódem důvodu `blocked`
(`AlarmViewBlock`, texty `ALARM_BLOCKED` z jádra) a odhady v herních dnech `etaDays` / `leaveDays`,
`armyEtaDays`, `runners` (koho lze poslat – výchozí vesničan, pak muži rodu, `mounted`, `etaDays`),
`host`, `messenger`, `flight` (stav skupiny, na cestě odhad), `decided`, `yieldLord` (vzdání vojvody –
null: hráčův muž ve vsi nežije; `blocked` `lordAway` „Vojvoda není doma.“ / `notRaided` „Vojsko ještě nepřišlo.“
– návrh Clauda; po vzdání, `alarmEnded`, pohled volby varování neukazuje), `ret` (Vrátit se – důvod `REFUGE_RETURN_REASONS`, „Lidé se už vracejí.“
s `backInDays`) a u hradiště hráče `domain` / `domainLeft` (vsi domény k výběru poslů). Dívat se smí
každý, kdo ves vidí (i bez práva `war` – ikony zašedne důvod práva), cizí hráč dostane null.

- **Server:** `lib/alarm.ts` (composition root – `alarmViewForPlayer`, `commandAlarmForPlayer`,
  `returnFromRefugeForPlayer`; port domény `createAlarmOwners`, mapy `campaignCells`). Server actions
  (`app/game/actions.ts`): `getAlarmView({ villageId })`, `commandAlarm({ villageId, command })` –
  `command` = `{ kind: 'messenger', personId? }` | `{ kind: 'flee', mode }` | `{ kind: 'domain', to }`
  (tvar `lib/alarm-input.ts`), `returnFromRefuge({ villageId })` → `{ ok, arrivesDay }`. Obě akce
  jdou přes `unlockedAction` ve `village.ts` (klíče `ACTION_RIGHTS.commandAlarm` a
  `returnFromRefuge` – právo `war`) **bez zámku hráče**: příkaz je záměr do tažení na takt teď + 2
  (jako „Probít se“) a návrat si bere zámek držitele hradiště sám (jeden zámek, nikdy vnořený;
  `exclusivePlayer` – i fronta v procesu). Test `action-rights.test.ts` hlídá i `unlockedAction`.
- **Klient:** `lib/alarm-view.ts` (čistý modul) – názvy ikon `ALARM_LABELS` doslovně ze specu,
  `alarmOptionText` (důvod u kurzoru – „Nestihnou to – vojsko tu bude za ≈ 2 dny, z mapy jim to
  potrvá ≈ 3 dny.“, nebo odhad „Do hradiště Hradec ≈ 3 dny – vojsko tu bude za ≈ 2 dny.“),
  `daysText` („méně než den“, „≈ 1 den“, „≈ 3 dny“, „≈ 5 dní“), `runnerText`, `flightText`,
  `returnText`. Hook `hooks/use-alarm.ts` (`useAlarm(villageId)` → `{ view, error, refresh }`):
  bez dotazování (server-events.md – Klient) – dotaz hned při změně vsi, na událost `alarm` téže
  vsi (bod tažení ji má mezi varovanými), na `village` téže vsi (jen když už je pohled), na
  obnovu po mezeře spojení a na `refresh`; po jednom (`useSerialRefresh`). Test
  `hooks/__tests__/use-alarm.behavior.test.tsx`.
  Upozornění varování nesou `villageId` – `alarmNoticeVillage` (`lib/player-notices.ts`) pro klik na
  panel dvorce vsi. Test `lib/__tests__/alarm-view.test.ts` (odhad ve dnech, texty, vstup akcí).

**Ikony v panelu dvorce (Úloha 13).** `hud/AlarmButtons.tsx` (`AlarmButtons`, `AlarmActions`,
`ALARM_ICONS`) – řádek v příkazech panelu dvorce pod vylepšeními a postojem vsi
(`selection/dwelling.tsx`, prop `alarm` v `ManorActions` / `SelectionPanel`), jen když
`AlarmView.warned` nebo `ret`. Jako v 0 A.D. jen ikony 40 px (`war/alarm-*.png` z Blenderu – Ikony
z Blenderu níž), název, odhad a stav šedě v `Tooltip`, důvod červeně (`alarmOptionText` – „Nestihnou
to – vojsko tu bude za ≈ 2 dny, z mapy jim to potrvá ≈ 3 dny.“):

- **Poslat posla**, **Ukrýt v lese**, **Do hradiště – jen lidé**, **Do hradiště – se vším** v pořadí
  `ALARM_CHOICES`. Posel: s jedním možným poslem klik pošle výchozího (`{ kind: 'messenger' }`),
  s víc `runners` otevře nabídku nad panelem (`hud-popup` – vesničan `alarm-messenger`, muž rodu
  pěšky portrét `man`, na koni `horse`, popisek `runnerText`; muž rodu jde s `personId`). Stav posla
  znakem vpravo dole (hodiny běží, fajfka doběhl, křížek chycen) a větou `messengerText` v popisku.
- **Po útěku** (`flight`) místo tří ikon útěku jedna ikona zvolené cesty se stavem – hodiny s počtem
  dní (`daysBadge`: „<1“, jinak zaokrouhleně), fajfka (došli, ukryli se), křížek (dostiženi) – a věta
  `flightText`. **Vrátit se** (`ret`, i po skončeném tažení – pak jediná ikona): důvod červeně
  (`returnText`), rozhodnutý návrat hodiny s dny do příchodu.
- **Varovat doménu** (hradiště hráče – `domain`; návrh Clauda): ikona `alarm-domain` s počtem
  zbývajících poslů (`domainLeft`) otevře seznam vsí domény s portrétem zemnice a zaškrtnutím –
  varované zaškrtnuté a zamčené, víc než `domainLeft` nejde; odeslání ikonou posla (popisek
  `domainSendText`). Všichni už vědí, nebo hradiště nemá posly – „Do domény není koho varovat.“
- **Bílá vlajka – vzdání vojvody** (`yieldLord`, `alarm-yield-lord`, `/icons/war/white-flag.png`):
  první stisk ji připraví (`data-armed`, červený obrys), druhý pošle příkaz `{ kind: 'yield-lord' }`
  (parser `alarm-input.ts`); popisek `YIELD_LORD_LABEL` („Vzdát se – vojvoda půjde do zajetí, nájezd
  skončí.“ – návrh Clauda), zašedlá s důvodem. Lhůta hráče (`graceDays`) zmizela
  (Martin 14. 11. 2026: hráč ve své vsi ji ovládá).
- Klik pošle akci jednou a zašedne svou skupinu (posel, útěk, návrat, doména) s větou, co se děje
  („Posel už běží.“, „Lidé už odešli.“, „Lidé se už vracejí.“), nebo s chybou serveru – dokud se
  otisk stavu ze serveru nezmění (`stateKey`), nejdéle 10 s (vzor `BreakoutButton`). Bez práva `war`
  zašednou všechny ikony s důvodem práva (`useRightDenied('war')`).
- **`useAlarmActions`:** `useAlarm` se ptá jen s otevřeným panelem dvorce (vybrané obydlí =
  `view.manor.dwellingId`); akce `commandAlarm` / `returnFromRefuge` – chyba i řádkem nahoře, po
  odpovědi `refresh`. **Klik na upozornění** varování a útěku (`noticeOpener` v
  `lib/player-notices.ts` – `alarmNoticeVillage`, jinak panel podle druhu) vybere dvorec té vsi;
  jiná ves téže mapy se napřed přepne (`switchVillage`) a dvorec se vybere, až se načte (ves na jiné
  mapě stránku načte znovu – pak se jen přepne).
- Dev panel `/dev/panels?panel=varovani` (varování – víc poslů, „Nestihnou to“, doména, bílá vlajka)
  a `?panel=utek` (posel doběhl, lidé na cestě, Vrátit se zatím ne).
- Testy: `hud/__tests__/AlarmButtons.behavior.test.tsx` (ikony a pořadí, důvod s odhadem, klik
  jednou a zašednutí skupiny, chyba serveru, výběr posla, stav po útěku a Vrátit se, doména, bílá vlajka,
  bez práva), `lib/__tests__/alarm-view.test.ts` (texty), `lib/__tests__/player-notices.test.ts`
  (`noticeOpener`).

**Mapa tažení, výkon a e2e (Úloha 15).** `CampaignMap` kreslí skupiny uprchlíků a běžící posly
cizích vsí v dohledu vlastních mužů (`CampaignView.flights`, jen na ukázané mapě) ikonami z panelu
dvorce zmenšenými na 110 m mapy (`FlightMarks`: uprchlíci se stádem `alarm-all`, jen lidé
`alarm-people`, posel `alarm-messenger`); počty lidí a dobytka jen v popisku (`title`),
`interpolateCampaign` je posouvá mezi dotazy jako muže. Test `hud/__tests__/CampaignMap.test.tsx`.
**Dotaz na varování** (`use-alarm.ts` – při výběru vsi, na `sync` a na událost `alarm`, tedy
≈ s každým uložením bodu tažení, o kterém ves ví – server-events.md – Válka) čte stavy vsi a hradiště z paměti přes dotazy
(`VillageMemory` 8 vsí – `withVillageMemory` v `lib/alarm.ts`, platnost hlídá otisk verze jako
`withVillageCache`) a mřížky pochodu z `MarchGridMemo` (`AlarmViewDeps.grids`) – u vsi velikosti
Vlkova 76 → 4 ms na dotaz (worker.md – Výkon – Pohled na varování). E2E `multiplayer-war.spec.ts` –
„ves B varovaná utíká do hradiště pána a po odtažení vojska se vrátí“ (vazal B, pán C s hotovou
palisádou na políčku vedle, tažení A s varováním B v kontrolním bodu, worker vedle `next start`):
upozornění, vojvoda B doma (`owner.lordId` ze záznamu rodu jako `createAlarmOwners`) a B u hry –
ves se v taktu varování zeptá na přítomnost, worker odpoví záměrem `alarm-presence` v taktu
dotazu + 2 a ves po odpovědi sama nic nezvolí (war.md – Hráč ve vsi a mimo ni; lhůta hráče
odpadla, worker běží dál), ikony v panelu dvorce i bílá vlajka (B je cíl tažení), „Do hradiště –
se vším“ → záměr `alarm-flee`, průvod přenesený
rovnou do středu hradiště (cíl skupiny – dojde v prvním taktu; kousek vedle středu bývá za
palisádou a cesta kolem ní k bráně trvá průvodu se stádem podle krajiny až ≈ 72 s) →
`refuge-arrive`, hosté `refuge` v C a lidé B pryč, Vrátit se zašedlé „Vojsko je ještě na mapě.“, po
odtažení vojska klik → `refuge-back` a lidé doma; snímky `varovani-ikony.png`
a `utek-do-hradiste.png`.

## Prémiová krajina v rozhraní

Premium-landscapes.md – Co hráč vidí. Texty typů (krátký název, „hned“, „později“) a jediná věta
jsou v `lib/premium-view.ts` (`PREMIUM_TEXTS`, `premiumIntroNotice`); portréty 19 typů
`public/icons/premium/<typ>.png` z `tools/blender/icons.py` (`PREMIUM`).

- **Představení:** `usePremiumIntro` po připravení scény jednou za načtení pošle `premiumIntroNotice`
  (sídlo s `landscape.premium`, ves ještě není) do `NoticeLines` – řádek `premium-intro` s ikonou
  (`NoticeLine.icon`, `village-notice-icon`), mizí po `NOTICE_MS`.
- **Výběr prvku:** cíl `{ kind: 'premium-site', type, site, index }` (`village-picking.ts`) z
  `pickPremiumSite` (`lib/scene/premium-picking.ts` – obrys, osa žíly do `LINE_PICK_M`, bod do
  `POINT_PICK_M`; plochy kolem vsi jen u bodu, brtě u úlů; řeka a stezka ne). `selectionDetails`
  vrátí `premium-site` bez pohledu na ves; panel `PremiumSiteBody` (`hud/selection/premium.tsx`) –
  `Portrait` ze složky `premium`, ikony `date` (hned) a `hourglass` (později), bez účinku zašedlé.
- **Minimapa:** `premiumMinimapMarks` (scene.md – Prémiové krajiny ve scéně).
- **Testy:** `premium-view.test.ts`, `premium-picking.test.ts`, `PremiumSitePanel.test.tsx`
  (statický render panelu), `NoticeLines.behavior.test.tsx` (hláška při prvním vstupu).

## Opustit, zbourat a vrátit stavbu (Ú10 bourání, `hud/StructureUseButtons.tsx`)

- **Use-casy** `abandonVillageStructure`, `demolishVillageStructure`, `restoreVillageStructure`
  (`application/structure-use.ts`, vstup `{ villageId, landscape, today, structure, id }`,
  `updateLivingVillage` – ves se nejdřív dopočítá). Jména s `Village`, protože doménová pravidla
  `abandonStructure` / `demolishStructure` / `restoreStructure` exportuje stejný balík. Druhý pokyn
  Zbourat téže stavby (i souběžný) odmítne doména `'Stavba se už bourá.'` – repozitář uloží jen
  jednu verzi, druhý pokus se dopočítá znovu.
- **Práva** `abandonStructure`, `demolishStructure`, `restoreStructure` → `'build'` (`ACTION_RIGHTS`);
  vstup `parseStructureUseInput` (`{ structure: 'dwelling' | 'pen' | 'idol' | 'shrine', id }`),
  `demolishStructureForPlayer` a spol. přes `actOn` (`lib/village.ts`), server actions `abandonStructure`,
  `demolishStructure`, `restoreStructure` (`app/game/actions.ts`).
- **Pohled:** `StructureUseView` (`village-view-types.ts`) – `state` `'in-use' | 'abandoned' |
'demolishing'`, `block` (důvod z `disuseBlock` – obyvatelé nemají kam jít, ohrada se rozšiřuje),
  `demolition` (`demolitionCost` dnes), `demolishing` (`constructionId`, průběh), `lodgers`
  (`lodgersIn` – dočasně ubytovaní z opuštěného domu). Počítá `structureUseView`
  (`lib/village-view-structure-use.ts`) jako `use` u `households`, hotových `pens`
  a `sacred.buildings`; `selection-details.ts` ho předá do `dwelling`, `pen` a `sacred`.
  **Dvorec údaj nemá** – tlačítka vůbec nevidí (návrh Clauda: dvorec nejde opustit ani zbourat
  nikdy, zašedlé ikony by jen zabíraly místo). Dvorcem je i zemnice zakladatelů –
  `isManorTarget` v doméně čte `villageManorId`, ne jen typ `dvorec`.
- **Tlačítka** `StructureUseButtons` vpravo nahoře v `SelectionPanel` (vedle značky správce): v
  provozu Opustit + Zbourat, opuštěná Vrátit + Zbourat, bouraná jen Zrušit
  (`CancelConstructionButton` s `demolishing.constructionId`). Ikony `abandon-structure.png`,
  `demolish.png`, `restore.png` (render `tools/blender/icons.py`). Popisky „Opustit – stavba se přestane používat a začne
  chátrat“, „Zbourat – 7,5 čd, 2 klády zpět na hromadu“ (bez klád „bez klád“), „Vrátit – stavba se
  zase bude používat“. `block` a chybějící právo `build` zašední s důvodem u kurzoru; během akce
  stojí všechna tlačítka (`busy`). `data-testid`: `structure-abandon`, `structure-demolish`,
  `structure-restore`. `villageCommands` posílá `onStructureUse` přes `runBuildAction`.
- **Panely:** průběh bourání `DemolitionBar` („Bourání“, `selection-demolition`) v obydlí, ohradě,
  modle a svatyni; v obydlí ikona `family` s počtem dočasně ubytovaných (`selection-lodgers`,
  popisek „Dočasně tu bydlí N lidí z opuštěného domu“).
- **Kronika:** „Stavba opuštěna.“, „Stavba vrácena.“, „Stavba zbourána – N klád na hromadu.“
  (1 kláda / 2–4 klády / 5 klád). **Činnost člověka:** `SceneVillage.demolitions` (id stavby bourání
  a co se boří) → „bourá zemnici“, „bourá kovárnu“, „bourá ohradu“ (`person-activity.ts`).
- **Dev panely:** `obydli`, `obydli-bez-mista`, `obydli-bourani`, `ohrada-opustena`, `modla`.
- **Testy:** `application/__tests__/structure-use.test.ts` (Opustit → Vrátit, opuštěné Zbourat,
  dvojklik Zbourat, dvorec), `StructureUseButtons.behavior.test.tsx`, e2e `village.spec.ts` –
  „hráč zboří obydlí – lidé bydlí dočasně jinde – a opustí a vrátí ohradu“.

## Křesťanství v rozhraní (christianity.md; plán 2026-11-10 – K8, `hud/BaptizeButton.tsx`)

- **Tlačítko křtu** „Nechat se pokřtít“ (ikona kříže víry, `selection-person-baptize`) v panelu
  osoby u vojvody vsi (`currentLord`), když `VillageAccess.baptizable` – rod křesťanství zná, ještě
  není pokřtěný a vojvoda rodu (`House.lord`) žije v téhle vsi. Cesta dat: `villageAccess`
  (`application/rights.ts`) → `viewOf` (`lib/village.ts`, kontext `baptizable`) →
  `sceneVillage` / `sceneLabor` → `scenePersons(state, day, baptizable)` (`ScenePerson.baptizable`)
  → `selection-details.ts` → `PersonBody`. Bez práva `ennoble` (`ACTION_RIGHTS.baptizeLord`)
  zašedne s důvodem. Klik otevře potvrzení (`baptize-dialog`, portál do `body` – panel výběru je
  posunutý transformací): „Křest nejde vzít zpět. Vedlejší manželky budou propuštěny.“, ikony kříž
  (`baptize-confirm`) a křížek „Zrušit“ (`baptize-cancel`), klik mimo okno a Esc zavřou. Server
  action `baptizeLord` (`app/game/actions.ts`, parser `parseBaptizeInput` – jen `villageId`) →
  `baptizeLordForPlayer` (`actOn`) → use-case `baptizeLord`; odmítnutí u kurzoru. Ves vojvody se
  pokřtí hned (D76; ostatní vsi rodu schránkou `rod-baptized`), tlačítko zmizí (`House.baptizedDay`).
- **Ikona:** `FAITH_CROSS_ICON` = `/icons/house/faith-cross.png` (z Blenderu, `tools/blender/icons.py`;
  pozor, `house/cross.png` je křížek „zavřít“) – `FaithCross` ji kreslí v tlačítku, v potvrzení,
  v panelu osoby a v popisku štěstí.
- **Víra v panelu osoby:** pokřtěný (`isChristian` → `ScenePerson.christian`) má malý kříž víry
  s popiskem „Křesťan“ (`selection-person-christian`), pohan nic.
- **Otroci (markets.md – Pravidla 7, plán 5):** `scenePersons` dá otrokovi (`isSlave`) `ScenePerson.slave`
  (pokřtěný má i `christian`), panel osoby ukáže odznak `selection-person-slave` s ikonou `slave` a popiskem
  „Otrok“ / „Otrok – pokřtěný, prodat ho nejde“. Dvorec: `VillageManor.slaves { all, baptized }` (`slavesField`
  v `manor-view.ts`, jeden průchod lidmi, bez otroků chybí) a `SlavesStat` v `ManorUpgrades` (`manor-slaves`,
  popisek „Otroci – 5, z toho 2 pokřtění – prodat je nejde“, u jednoho „prodat ho nejde“). Kronika a upozornění jdou `goodsText` a `NEWCOMER_TEXTS`.
- **Štěstí:** popisek v liště `HappinessTooltip` (`hud/TopBar.tsx`) – pod „Štěstí“ řádek „Křesťané
  N %“ (kříž víry, `happiness-christians`) a „Pohané – zničená posvátná místa −N“ (ikona háje,
  `happiness-desecration`), každý jen nad nulou (`VillageHappiness.christianShare` / `desecration`
  z `HappinessSummary`).
- **Hřbitov:** ves pokřtěného rodu (`rodBaptized`) dává hřbitovu `use` (`structureUseOf`); hřbitov
  se neopouští, proto `StructureUseButtons` ukáže jen Zbourat a `block` je důvod bourání
  (`demolitionBlock` – „Hřbitov ještě slouží.“, dokud `cemeteryMayGo` neplatí). Pohanský rod
  tlačítko nemá vůbec (návrh Clauda – v 0 A.D. se příkaz, který entita nemá, neukazuje; zašedlé
  „slouží“ by pohana mátlo, zbourat ho nesmí nikdy). Průběh bourání `DemolitionBar` v `CemeteryBody`.
- **Varování u kurzoru** (`lib/desecration-warning.ts`): u pokřtěného rodu (`SceneVillage.sacredFree`)
  pustí `checkWithDesecration` / `squaresWithDesecration` (obydlí, pozemek, dílna, modla
  a svatyně, humno, stavby po čtvercích, obvod opevnění) tutéž kontrolu jádra ještě s vsí, jak ji
  vidí pohanský rod (bez `sacredFree`; ves na scénu jednou ve `WeakMap`): neprošla nebo ušetřila
  („… zůstane stát“ – `sparedWarning`) háj → „Vykácí posvátný háj.“, dub → „Vykácí posvátný
  dub.“; s hřbitovem, který smí zmizet (scéna `mayGo`, pokřtěná ves ho vynechá), neprošla →
  „Zaorá starý hřbitov.“ – jako server v `applyBuildIntent`. Stavba zůstává povolená; řádek se
  připojí k ostatním varováním. Pohanská ves kontrolu znovu nepouští.
- **Testy:** `BaptizeButton.behavior.test.tsx`, `SelectionPanel.test.tsx` (víra a křest),
  `TopBar.test.tsx` (`HappinessTooltip`), `village-view.test.ts` (křest v pohledu),
  `village-input.test.ts`, `village-baptize.test.ts` (vstupní bod), `desecration-warning.test.ts`,
  `application/__tests__/baptize.test.ts` (`villageAccess.baptizable`); e2e „křest rodu – …“
  (`e2e/village.spec.ts`: znalost zapsaná do DB → tlačítko → potvrzení → kronika `lord-baptized`
  → kříž „Křesťan“). Snímky `krest-dialog.png` / `krest-panel.png` až po načtení ikon
  (`iconsLoaded` – server mezitím dopočítává ves a obrázky přijdou později; chybějící soubor test
  shodí).

## Stavební huť v rozhraní (stone-masonry.md – Stavební huť; plán 2026-11-11 – M7a, `hud/LodgeButtons.tsx`)

Jádro a akce: `village-masonry.md` – Stavební huť (`inviteLodge`, `inviteMaster`; právo `ennoble`).

- **Pohled:** `lodgeView(state, day)` (`lib/person-view.ts`) složí z jádra (`canInviteLodge`,
  `canInviteMaster`) `LodgeView` – `invite` (důvod, proč huť nejde pozvat, `null` = jde),
  `circle`, `daysToArrival` (dní do nejbližšího příchodu mistra) a `missing` (obory k pozvání).
  `sceneLabor` ho připojí jen k postavě vojvody (`ScenePerson.lodge`); mistr a kněz nesou
  `mason` / `priest` a `lodgeCircle`. `lib/selection-details.ts` je předá panelu osoby.
- **Vojvoda** (`LodgeActions`, `selection/people.tsx` – `PersonBody`): ikona huti „Pozvat
  stavební huť“ – nepokřtěný rod ji nemá (objeví se po křtu, Martin 15. 11. 2026); zašedlá s důvodem
  u kurzoru: `INVITE_LODGE_REASONS` – ves bez vojvody; bez práva `ennoble` důvod práva) → okno se dvěma ikonami okruhů (adriatický,
  karolinský; popisek = okruh a typy kostelů, `MASONRY_CIRCLE_LABELS`) a křížkem; klik na okruh
  je potvrzení a volá `onInviteLodge`. Huť na cestě: ikona huti s počtem dní do příchodu
  (popisek s okruhem); dorazí-li všichni, zůstane jen ikona. U každého chybějícího oboru
  tlačítko „Pozvat mistra: <obor>“ s ikonou oboru (`onInviteMaster`, bez potvrzení).
- **Mistr a kněz** (`MasonBadge`, `PriestBadge`): ikona oboru (popisek „Zedník – Karolinský
  okruh“) a ikona kněze v řádku panelu osoby.
- **Obsluhy:** `onInviteLodge`, `onInviteMaster` v `SelectionCommands`
  (`village-game/village-commands.ts`) volají server actions `inviteLodge`, `inviteMaster`.
- **Ikony** (`public/icons/house/`, render z Blenderu – `tools/blender/icons.py`, `LODGE_PANELS`):
  `lodge`, `circle-adriatic`, `circle-carolingian`, `mason-builder`, `mason-limeburner`,
  `mason-stonemason`, `mason-mason`, `mason-plasterer`, `priest`.
- **Testy:** `LodgeButtons.behavior.test.tsx`, `SelectionPanel.test.tsx`,
  `person-activity.test.ts` (selectionDetails), `village-view.test.ts` (pohled na huť).

## Kostel v rozhraní (churches.md – Stavba; plán 2026-11-11 – M7b, `lib/church-placement.ts`, `lib/scene/church-placer.ts`)

Jádro a akce: `village-masonry.md` – Geometrie a cena kostela, Stavba kostela (`placeChurch`).

- **Data:** `lib/church-view.ts` – `sceneChurches(state)` (dostavěné kostely i staveniště jako
  `SceneChurch` s postupem `churchProgress`; kostel ve výzdobě jednou) → `SceneVillage.churches`
  → `LandscapeScene.setVillage` → `setChurches`; `scenePlacementVillage` z nich skládá
  `PlacementVillage.churches` (kontrola umístění v prohlížeči). Panel: `churchesOf(state)` →
  `VillageView.churches` (`VillageChurch` – `built`, `decorated`, `site.work` po druzích práce
  `churchWorkProgress`, `site.blocked` = `churchBlocked`, `capacity`, `graves`, `priest`, když kostel
  má údaj `priestId`). Nabídka: `churchBuildChoices(state)` → `VillageView.churchBuild` (malý
  a velký typ okruhu huti `churchTypesFor`, bez huti okruh adriatický; důvod `churchStartProblem` –
  `CHURCH_NO_LODGE`, `CHURCH_NO_QUARRY`). Dokud rod nepřijal křesťanství (`faith.rodBaptizedDay`),
  je nabídka prázdná – tlačítka kostela ani jejich zkratky nejsou (Martin 14. 11. 2026) – a server
  kostel odmítne (`CHURCH_NOT_BAPTIZED` v `churchStartProblem`). Ves bez kostela nic z toho nemá.
- **Nabídka staveb** (`lib/build-items.ts`): `WebBuildKind` `church-small` [I] a `church-large` [Y]
  (volné klávesy – návrh Clauda), `placement: 'church'`, `check` = `checkChurchPlacement` jako server
  - cena `churchPlacementCost`. `use-build-mode.ts` – `churchOptions` dá `BuildOption` bez ceny
    předem s `look` (ikona `build/kostel-<typ>.png` – `churchIcon`, název `CHURCH_TYPE_NAMES`);
    `BuildGrid` bere ikonu a název z `look` a nulovou práci v popisku neukazuje. Zašedlé s důvodem.
- **Panel rozměrů před umístěním** (`hud/ChurchDimsPanel.tsx`, Martin 16. 11. 2026; stav `churchDraft`
  v `village-game/use-build-mode.ts`): tlačítko nebo klávesa kostela (malý [I], velký [Y]) napřed
  otevře panel – míry +/− (`ChurchMeasureControls` z `ChurchConfirm`), cena z rozměrů jako ikony
  (`CostIcons` z `CursorReason`; `churchPlacementCost` bez překážek, ty a lom přidá náhled u kurzoru)
  a ikona kostela „Umístit“. Enter / ikona → `placeChurchDraft` spustí umisťování s těmi rozměry,
  Esc panel zavře. Rozměry se pamatují po vsi a typu do dalšího otevření (`recallChurchDims`,
  `rememberChurchDims` v `lib/church-placement.ts` – jen v paměti prohlížeče, návrh Clauda).
- **Umístění** (`PlacementMode` `church`, `ChurchPlacer`): u kurzoru průhledný model
  (`churchMeshData`, natočení `churchModelRotationY`) a obrys hřbitůvku (`churchyardWorld`)
  zeleně / červeně, kněžištěm na východ (`churchAtCursor` – `CHURCH_EAST_ROTATION`). **Tah**
  (stisk = vstup, západ; puštění = kněžiště) – `churchFromDrag` jen natáčí osu `snapChurchRotation`
  (15°), rozměry zůstanou z panelu, vstup zůstane na místě stisku. **Krátký klik** položí kostel s rozměry z panelu kněžištěm na východ. Položený kostel
  čeká na potvrzení: Enter nebo kladivo, Esc ho znovu uvolní ke kurzoru (druhé Esc / pravé
  kliknutí zruší). U kurzoru (`CursorReason`) rozměry `PlacementPreview.measure`
  (`churchDimsText` – „Ø 6,5 × 6 m“, „5 × 8 × 7 m“) a cena `PlacementCost` – práce (čd, lámání bez
  vzdálenosti lomu + překážky), klády, kámen m³, vápno t (`limeT`, ikona `resources/lime.png`),
  písek m³ (`sandM3`, `resources/sand.png`); nejde-li to, důvod z `checkChurchPlacement`.
- **Panel u potvrzení** (`hud/ChurchConfirm.tsx`, vzor `FortConfirm`; úpravy se pamatují jako v panelu rozměrů): míry +/− po
  `CHURCH_DIMS_STEP_M` (`stepChurchDims`; rotunda průměr a výška, jinak šířka, délka a výška; značky
  Ø ↕ ↔ ⤒, slova v popisku) → `Placement.setChurchDims` → `LandscapeScene.setChurchDims` →
  `ChurchPlacer.setDims` (položený kostel drží střed a osu); kladivo zašedlé s důvodem. Potvrzení
  → server action `placeChurch` (`{ villageId, type, dims, position }`).
- **Výběr a panel** (`VillageTarget` `church` – klik do `churchFootprintWorld`; `selection/church.tsx`
  – `ChurchBody`, portrét typu): staveniště – postup po druzích práce (`CHURCH_WORK_LABELS`: lámání,
  písek, vápno, základy, zdi, střecha, výzdoba – ikona a %), stojí-li, ikona chybějícího mistra
  červeně s „!“; vždy kapacita a hroby (obsazené / celkem), dostavěný kostel kněz. Zrušit jde jen
  stavba před střechou (`cancellableConstruction`).
- **Testy:** `lib/__tests__/church-placement.test.ts` (tah, +/−, cena, katalog), `church-view.test.ts`
  (data pohledu, výběr), `lib/scene/__tests__/church-placer.test.ts` (umisťování), `church-renderer.test.ts`
  (natočení modelu = obrys), `hud/__tests__/ChurchPanel.behavior.test.tsx` (panel rozměrů, panel a potvrzení).

## Panel Kronika (absence.md – Návrat, `hud/ChroniclePanel.tsx`, `lib/chronicle-view.ts`)

Martin 8. 11. 2026: „může si přece sám zobrazit panel s notifikacemi a kroniku“ – rozhraní nad
existující kronikou vsi (`state.chronicle`, nejvýš `CHRONICLE_MAX_EVENTS` = 500 zápisů), žádná
nová pravidla (návrh Clauda).

- **Lišta:** kniha `icons/resources/chronicle.png` (`chronicle-toggle`, popisek „Kronika“) vlevo od
  praporu rodu; bez vsi nebo u vymřelé vsi chybí. Klávesa **J** (popisek „Kronika [J]“,
  `aria-keyshortcuts`) – viz Zkratky panelů Kronika a Upozornění níž. Panel leží vpravo nahoře jako panely rodu a války a střídá se s nimi
  i s nabídkou: otevření kroniky je zavře (`closeOthers`), otevření jiného zavře kroniku
  (`othersOpen` – úprava stavu při vykreslení v `hooks/use-chronicle.ts`). Esc a křížek zavřou.
- **Označení textu:** roky a zápisy (`chronicle-years`) mají `select-text` – jdou označit
  a zkopírovat, ač herní stránka má označování vypnuté (`select-none` v `app/game/page.tsx`).
- **Data na vyžádání:** server action `getChronicle({ villageId, before? })` →
  `chronicleForPlayer` (`lib/village.ts` – `context` bez práva, tedy kdo smí vidět pohled na ves:
  vlastní ves, ves rodu, spravovaná ves) → `chroniclePage` ze stavu dopočítaného jako pohled.
  Pohled na ves dál nese jen posledních `CHRONICLE_LENGTH` = 8 zápisů (upozornění).
  Zápisy rodu (válka, jednání – `chronicleHouses`) jdou do kroniky vsi vojvody – panel je ukáže
  u ní; kronika rodu zvlášť není.
- **Stránka** (`chroniclePage`): zápisy seřazené podle dne (zápis ze schránky může přijít
  s dřívějším dnem), nejnovější první, seskupené po herních letech (`ChronicleYearView` – nadpis
  roku, u zápisu den a měsíc „12. března“, text z `chronicleText`); bere **celé roky**, dokud nemá
  aspoň `CHRONICLE_PAGE_ENTRIES` = 40 zápisů. `olderThan` = rok, před kterým se ptá další
  stránka (tlačítko `chronicle-older` – dvojitá šipka, popisek „Starší zápisy“); null = starší
  nejsou. `lost` – kronika je plná a zápis o založení vsi už v ní není: na konci „Starší zápisy se
  nedochovaly.“
- **Trvalé stavy vsi** (absence.md – Upozornění vsi do kroniky; jádro `lasting-notices.ts`,
  viz `village-core.md`): `notice-began` / `notice-ended` s textem z `lib/notice-chronicle.ts`
  (`NOTICE_CHRONICLE_TEXTS` – začátek jako řádek upozornění s tečkou, konec „… zase …“, např.
  „Kovář nemá uhlí.“ / „Kovář má zase uhlí.“, „Ves hladoví.“ / „Hlad skončil.“, „Ves šetří na
  osivo.“ / „Ves už nešetří na osivo.“). Začátek má den
  začátku stavu, i když se zapsal o týden později – stránka ho zařadí podle dne.
- **Skryté zápisy** (`shownInChronicle`): denní `hunger-began` / `hunger-ended` (`HIDDEN_KINDS` –
  návrh Clauda: hlad nesou trvalé stavy, denní zápisy zůstávají pro deník vsí), ústup pole či sadu
  stavbě nebo cestě `land-taken` (Martin 14. 11. 2026: „nicneříkající“; varování u kurzoru
  `landTakenWarning` zůstává) a návrat z výjezdu `people-back` druhu `journey` („1 člověk se vrátil
  domů z cesty.“ – Martin 14. 11. 2026 ho nechce). Jádro je dál zapisuje – skryje se i uložený
  starší zápis; `VillageView.chronicle` (8 zápisů pro upozornění) je nese dál.
- **Jména sousedů** (`chronicleText(event, villageName, seed)` – `seed` vsi, `chroniclePage` ho
  bere čtvrtým parametrem): kovář ze sousední vsi „Kovář z Hrušova okul koně.“ (`horses-shod`
  s `direction`, starší zápis „Kovář z jiné vsi okul koně.“) a nákup u souseda jako směna
  „Vlkovští směnili 394 kg obilí za 120 kg keramiky se Sedleckými.“ (`crafts-bought` – obě strany
  v kg, zbytek pod půl kila se nepíše); jméno dřívějšího souseda `legacyNeighbourName(seed, direction)` (markets.md – Pravidla 10). Pády jmen
  vsí `lib/village-name-cases.ts` (`fromVillage` – „z Lhoty“, „ze Sedlce“; `villagersOf` –
  „Vlkovští“; `withVillagersOf` – „s Lhotskými“): vzory podle konce jména z generátoru (-ice,
  -any, -ov, -ín, -ec, -á, -í, -a) a výčet jmen, která konec nerozhodne (Libice v jednotném čísle,
  Bělá, Dubá, Brod); jméno, které vzor nezná, opisem „ze vsi X“, „obyvatelé vsi X“, „s obyvateli
  vsi X“. Testy `village-name-cases.test.ts` – každé jméno `VILLAGE_NAMES`. Odkud je cizí ves
  bez skloňování, píše se „ze vsi X“ (nájezd, zásilka, hosté, mistr huti, upozornění na uprchlíky).
- **Místa místo obecných vět** (Martin 14. 11. 2026; `village-view-chronicle-places.test.ts`):
  - **Konce cesty** – `roadBetween` v 7. pádě („mezi dvorcem a kovárnou“, „mezi rozcestím
    a polem“, „mezi křižovatkou a severovýchodním krajem mapy“, stejné konce „mezi polem a dalším
    polem“) z `ChronicleRoadEnd` (jádro `paths/road-chronicle.ts` – `chronicleRoadEnds` podle
    `roadChainEnds` jako panel cesty: obydlí podle druhu, dílna podle řemesla, místo podle předpony
    klíče trasy, tvar křižovatky, směr kraje mapy); neznámé místo – věta bez konců. **Kraj mapy
    je místo** („mezi rozcestím a severním krajem mapy“) – smyšlený soused už není (markets.md –
    Pravidla 1; staré zápisy mají jen konce, jména sousedů v nich nebyla). Panel cesty
    (`road-end-view.ts`, šipka zůstává): „Cesta do Lhoty“ s vlastní vsí na sousední mapě v tom směru
    (`ownMapsAround`, `toVillage` – „do Lhoty“), jinak „Cesta na sever“.
  - **Křižovatka podle místa** (D66; `ChronicleRoadEnd.near` – `ChronicleLandmark` uložený při
    vzniku zápisu, starší zápisy bez něj): „mezi rozcestím u kovárny a polem“, „mezi křižovatkou
    pod dvorcem a kovárnou“, „z rozcestí nad potokem do Lhoty“, kraj mapy „u hranice
    s Lhotskými“ (`withVillagersOf`; bez seedu „u severního kraje mapy“), bez místa „uprostřed
    vsi“, „na severní straně vsi“, „severně od vsi“ (`landmarkPhrase` – 2. pád z
    `RoadEndForms.from` bez „od“, „pod“ / „nad“ se 7. pádem; `PLACE_INSTRUMENTAL` má i kostel,
    lom a bránu).
  - **Zarostlá cesta** (D67; `road-overgrown` s `ends` a `part`): „Nepoužívaná cesta mezi
    kovárnou a potokem zarostla.“, jen část „Část nepoužívané cesty mezi kovárnou a potokem
    zarostla.“, starší zápis „Nepoužívaná cesta zarostla.“
  - **Jabloně u cesty** (`construction-finished` s `roadEnds` – konce v den výsadby):
    „Podél cesty mezi dvorcem a kovárnou byly vysazeny jabloně.“, starší zápis „Podél cesty byly
    vysazeny jabloně.“
  - **Vyšlapaná cesta** (`road-formed` s `ends` a `years` – `roadFormedNote` po úklidu měsíce,
    `noteFormedRoads`): „Po 12 letech chůze lidé vyšlapali cestu mezi dvorcem a potokem.“ (u řeky „…a řekou“ – `water:river`; starší zápisy s `water` = potok), rok „Po
    roce chůze …“, pod půl roku bez doby „Lidé vyšlapali cestu mezi …“, starší zápis „Lidé
    vyšlapali pevnou cestu.“ Roky = od pozdějšího z konců (den dostavění stavby, vykopání jámy,
    první výsadby sadu; voda, les, pastva, louka, dub, háj a kraj mapy od založení vsi; křižovatka
    a jiná cesta nic neurčí); konec, jehož stáří stav nezná (pole, milíř, rudiště, hliniště), roky
    nedá (návrh Clauda).
  - **Zbořené opevnění** (`fortification-demolished` s `lord`, `lengthM`, `gates`, `around` –
    z `Construction.fortNote` v den rozkazu): „Vojvoda Lutobor přikázal zbořit 26 loktů opevnění od
    severní brány k věži.“ – pražský loket 0,5927 m, brána s dostavěnou věží je věž, světová strana
    od středu obvodu jen u víc bran téhož druhu; jediná brána „od brány dokola zpět k bráně“, bez
    brány bez místa; val bez nástavby „přikázal srovnat … loktů valu“; bez vojvody „Zbořili …“,
    starší zápis „Úsek opevnění byl zbořen.“ (klády na hromadu věta neuvádí).
  - **Ohrada** (`penSpecies`, `penExtended` – `penChronicleNote`): „Byla postavena ohrada pro
    ovce.“ (kozy, prasata, skot, voly, koně), rozšíření „Ohrada pro skot byla rozšířena.“, zrušení
    „Stavba ohrady pro ovce se zrušila.“; bez druhu „Byla postavena ohrada.“
- **Kronikářsky, ne jako oznámení** (Martin 15. 11. 2026: „Je to kronika, ne oznámení v novinách.“;
  `village-view-chronicle-c.test.ts`):
  - **Obnova sadu jedním zápisem za den** (`orchard-renewal-started` – jádro píše zápis za sad;
    `chroniclePage` sečte čtverce a sady dne a ukáže první zápis dne): „Vlkovští vysadili 8 stromů,
    aby obnovili starý sad.“ (`orchardRenewalText` – `ORCHARD.treesPerSquare` = 4 na čtverec, víc
    sadů „staré sady“).
  - **Úmrtí** (`death` se `sex` a `estate` – jádro `people/estate.ts`, `deathWho` v den smrti):
    „Ve věku 64 let zemřel sedlák Bořivoj.“, „Ve věku 41 let zemřela hlady kovářka.“, „Ve věku 12
    let zemřel syn sedláka Bořivoje Radim.“, „V prvním roce života zemřela dcera hrnčíře.“, „Ve věku
    33 let zahynul na cestě vojvoda Bořivoj – zabili ho vlci.“ (`deathLine`). Příčina jen když
    nebyla stáří (hlady, na lovu, při povodni, ve smršti, v boji, na rány, na cestě). Postavení
    (`ChronicleEstate`, návrh Clauda): `title` – dvorec vojvody, dílna řemesla, jinak rolník; kněz
    a mistr huti podle úřadu; `kin` – hlava (vojvoda `dynasty.lordId`, jinak `householdHead`),
    žena (i žena v čele domu), rodič, dítě, snacha / zeť, vnouče hlavy (`headName` – jméno hlavy,
    je-li to muž, ve 2. pádě), jinak chlapec / dívka, vesničan / vesničanka, stařec / stařena.
    Slova `ESTATE_TITLES` (sedlák / selka, kovář / kovářka, hrnčíř / hrnčířka, vojvodova žena;
    „tesařova žena“, „uhlířova žena“ opisem). Jméno za postavením u každého, i u žen („Ve věku 41
    let zemřela hlady kovářka Ludmila.“ – population.md, Jména); starší zápisy jménem jen u mužů
    rodu. Starší zápisy bez postavení: „Ve věku 30 let zemřel jeden z dospělých.“,
    bez věku podmět napřed („Dítě zemřelo hlady.“, „Bořivoj padl v boji.“).
  - **Narození** (`birth` s `name` a `female`): „Narodil se Radim.“, „Narodila se Ludmila.“; bez
    jména (syn vojvody čeká na jméno, starší zápisy) „Narodilo se dítě.“.
  - **Ženy muže rodu** (`extra-wife` / `main-wife` s `estate` muže a `wife`; Martin 15. 11. 2026):
    „Vojvoda Lutobor si vzal Dobravu.“ (`extraWifeText` – `estateText` muže, jméno ženy ve 4. pádě
    `feminineAccusative`: -a → -u, -e → -i; jiný konec opisem „si vzal další ženu jménem …“),
    „Dobrava se stala hlavní manželkou vojvody Lutobora.“ (`mainWifeText` – `manEstateGenitive`:
    „syna vojvody Lutobora Radima“). Bez ženy „Vojvoda Lutobor si vzal další ženu.“ / „… má novou
    hlavní manželku.“, starší zápis bez postavení „Lutobor si vzal další ženu.“. Pády celého seznamu
    jmen hlídá `village-view-chronicle-wives.test.ts`.
  - **Návrat z tažení** (`people-back` druhu `campaign` s `who` – `chroniclePerson`; řádný návrat
    zapíše `applyCampaignReturn`, dezertéra `returnHome` s `deserted`): „Z tažení se vrátil sedlák
    Bořivoj.“, „Z tažení se vrátili sedlák Bořivoj a kovář Radim.“, nad 4 různé lidi tři jménem
    „… a další 4“; stejní sedláci bez jména (starší zápisy) číslem („Z tažení se vrátili 2 sedláci.“,
    „… vrátilo 5 sedláků.“); dezertér „Z tažení utekl domů sedlák Bořivoj.“; starší zápis „Z tažení se vrátili
    3 lidé.“ (`campaignBackText`).
- **Obnova:** `useChronicle` načte první stránku při otevření, při jiné vsi a když v pohledu
  přibude zápis (`latest` = nejnovější zápis `VillageView.chronicle`); `mergeNewest` nahradí roky
  nové stránky a starší načtené roky ponechá, `appendOlder` připojí starší stránku.
- **Testy:** `lib/__tests__/chronicle-view.test.ts` (seskupení, pořadí, stránkování, spojování),
  `hud/__tests__/ChroniclePanel.behavior.test.tsx`, `hooks/__tests__/use-chronicle.behavior.test.tsx`,
  e2e `village.spec.ts` – „panel Kronika“ (zápis o založení vsi, střídání s panelem rodu, Esc,
  zápis trvalého stavu „Kovář nemá uhlí.“).

## Panel Upozornění (absence.md – Návrat, `hud/NoticesPanel.tsx`, `lib/notice-page.ts`)

Rozhraní nad uloženými upozorněními mezi hráči (`player_notice`, `lib/player-notices.ts` – texty
z `playerNoticeText`), žádná nová pravidla (návrh Clauda). Upozornění vsi (`village-notices.ts`)
se neukládají a panel je nemá.

- **Lišta:** zvonek `icons/resources/bell.png` (`notices-toggle`, popisek „Upozornění“) vlevo od knihy
  kroniky, klávesa **U** (popisek „Upozornění [U]“); číslo nepřečtených (`notices-unread`) se ukáže jen se zavřeným panelem. Panel vpravo
  nahoře se střídá s kronikou, rodem, válkou a nabídkou (`othersOpen` / `closeOthers` ve
  `hooks/use-notices.ts`, kronika se zavírá přes `closeNoticesRef` v `useHistoryPanels`). Esc a křížek zavřou.
- **Data:** server action `getNotices({ before? })` → `NoticeRepository.page` (nejnovější první,
  `NOTICE_PAGE_SIZE` = 30 + řádek navíc pro `olderThan`) → `noticePage`; hráč je jen ze session,
  cizí upozornění se vrátit nedají. Stránkování **nic neoznačuje za přečtené**.
- **Nepřečtené:** `read_at` v DB znamená „doručeno jako řádek nahoře“ (`takeUnread` při dotazu na
  ves), takže pro panel nestačí. Panel si pamatuje poslední viděné `id` v `localStorage`
  (`bohemia:notices-seen`, jen tento prohlížeč); otevřený panel vše do nejnovějšího považuje za
  viděné, zvýrazní (`data-unread`) ta novější než při otevření. Číslo u ikony se počítá z načtené
  první stránky (strop 30). První stránka se načte po startu a kdykoli klientovi dorazí nové
  upozornění (`noticeTick` v `usePlayerNotices`).
- **Omezení historie:** upozornění se nikde nemažou, jen označují; `post` smaže starší než
  posledních `NOTICES_KEPT_PER_PLAYER` = 500 na hráče (bez migrace, index `(player_id, id)`).
- **Testy:** `lib/__tests__/notice-page.test.ts`, `hud/__tests__/NoticesPanel.behavior.test.tsx`,
  `hooks/__tests__/use-notices.behavior.test.tsx`, `notice-repository.db.test.ts` (stránkování,
  omezení), e2e `multiplayer.spec.ts` – „pomoc na žádost“ (zvonek, zvýrazněné upozornění).

## Zkratky panelů Kronika a Upozornění (`lib/panel-keys.ts`, `hooks/use-panel-hotkeys.ts`)

Martin 9. 11. 2026: „Na písmenech mi nezáleží, takže jo“ – k návrhu Clauda **J** = panel Kronika,
**U** = panel Upozornění. Ostatní písmena drží stavby (Z X C V B N M F G H T K L O P – `BUILD_ITEMS`)
a kamera (W A S D Q E R).

- `panelForKey` – jen bez modifikátorů a bez opakování držené klávesy; `PANEL_HOTKEYS` nese kód
  klávesy a písmeno do popisku. Test `lib/__tests__/panel-keys.test.ts` hlídá i kolize se
  stavbami a kamerou.
- `usePanelHotkeys(toggle, enabled)` v `useHistoryPanels` přepne panel jako tlačítko v liště (druhý
  stisk zavře, otevření vystřídá ostatní panely – `useChronicle` / `useNotices`). Při psaní do pole
  nic; v otevřené nabídce hry a po konci hry vypnuté (`enabled`), nabídka navíc klávesy zachytí
  dřív (`GameMenu`). Kronika jen u živé vsi (jako tlačítko).
- Popisky tlačítek „Kronika [J]“, „Upozornění [U]“ a „Nabídka [F10]“ – `HotkeyTip` v `TopBar`.
- Testy: `hooks/__tests__/use-panel-hotkeys.behavior.test.tsx` (jsdom), e2e `village.spec.ts` –
  „panel Kronika“ (J otevře a zavře, U vystřídá) a `multiplayer.spec.ts` – „pomoc na žádost“ (U).

## Ikony z Blenderu místo ručních SVG (`tools/blender/icons.py` – sekce Ikony rozhraní)

Martin 9. 11. 2026: „ano“ k předělání ručně kreslených SVG ikon z posledních dní v Blenderu stejně
jako ostatní ikony (8. 11. o ruční ikoně opevnění: „vůbec nevypadá jako ostatní ikonky“). Stejná
scéna, světlo a zmenšení jako ostatní ikony surovin (Cycles, 64 × 64 PNG s průhledným okolím,
`small`), portrét lomu jako portréty staveb (128 × 128 s vinětou, `backdrop`). Díly opevnění
a obléhání jsou modely scény (`fortifications.glb`, `siege.glb`), takže ikony vypadají jako hradba
ve hře.

- **Panel opevnění** (`hud/selection/fortification.tsx`): druhy `fort-walkway`, `fort-crib`,
  `fort-chamber` (i v rozcestníku druhů `FORT_VARIANTS` místo ikony palisády), `fort-rampart-add`,
  `fort-moat`, brány `fort-gate` (`FORT_GATE_ICON` – dřív `house/gate.svg`; panel rodu má pro Blokovat
  vlastní `house/gate.png`), `gate-pincer`, `gate-tower`, `fort-occupancy`, postupy útočníka `assault-ladder`,
  `assault-axe`, `assault-fire`, `assault-spade`, `stone`, `demolish`.
- **Jinde:** `breakout` (Probít se), `chronicle` a `bell` (lišta a hlavičky panelů), `abandon-structure`,
  `restore` (`StructureUseButtons`), `abandon-part` (`AbandonPartButton`), portrét `build/lom.png`.
- Všechny v `public/icons/resources/*.png` (lom v `build/`), zdroj v `public/icons/LICENSES.md`.
  Jen vybrané: `blender -b --factory-startup --python tools/blender/icons.py -- apps/web/public/icons
fort-walkway,chronicle,lom`.
- Len, luštěniny ze zahrádky a osivo už byly z Blenderu (`flax`, `legumes`, `food`).

**Druhá várka – panely rodu, vazalství, války a nováčka** (Martin 9. 11. 2026: „ano“ k předělání
všech ručních SVG; slovník `PANELS` v `tools/blender/icons.py`, 64 × 64 jako suroviny, `small`):

- **`public/icons/house/*.png`** – `aid` (otevřený pytel obilí s naběračkou), `banner` (červený prapor),
  `copy` (dva listy), `cross` (červený křížek – zrušit / zavřít), `gate` (zavřená brána se závorou)
  a `gate-open` (dokořán) z dílů opevnění, `gift` (truhlička), `guard-send` / `guard-recall` (štít
  a červená šipka ven / zelená zpět), `hands` (klečící vesničan, klip `bind`), `handshake`, `horn`,
  `hunger` (prázdná mísa), `chain-broken`, `loan` (denáry a šipky dokola), `passage` (šlépěje přes
  mezníky – země z ikony `walk`), `pen` (brk v kalamáři), `scales` (váhy `balance` bez obilí), `seal`,
  `seal-broken`, `seal-pen`, `shield`, `shield-hourglass` (štít a hodiny `hourglass`), `spears`,
  `succession` (koruna), `sword`, `throne`, `village-key` (zemnice a klíč).
- **`war/*.png`** – `captive` (vesničan s pouty na zápěstích – kosti `hand_L` / `hand_R`), `execute`
  (sekera ve špalku), `forest` (smrky krajiny), `hold` (visací zámek), `release` (otevřené pouto
  a zelená šipka), `shield-wall`, `white-flag`. **`newcomer/banner-crown.png`, `banner-free.png`**,
  **`resources/steward.png`** (klíč).
- **Varování a útěk (Úloha 13 plánu 2026-11-09)** – `war/alarm-messenger` (vesničan v běhu – klip
  `walk` s předklonem, hůl v ruce – `walker`, `runner`, `staff_in_hand`), `alarm-forest` (muž, žena
  a dítě mezi smrky), `alarm-people` (brána hradiště dokořán – `hillfort_gate` – a dva vesničané),
  `alarm-all` (brána, vesničan, ovce `sheep.glb` a vůz s pytli), `alarm-return` (zemnice a zelená
  šipka k ní), `alarm-domain` (posel běží ke dvěma zemnicím), `alarm-done` (zelená fajfka). Jen ony:
  `blender -b --factory-startup --python tools/blender/icons.py -- apps/web/public/icons
war/alarm-messenger,war/alarm-forest,war/alarm-people,war/alarm-all,war/alarm-return,war/alarm-domain,war/alarm-done`.
- Obilí, klády a přesýpací hodiny rodu jsou ikony surovin: `houseIconSrc` v `TermsForm.tsx` (sdílí
  `HouseIcon`, `TermIconImg` i `Icon` panelu rodu) mapuje `grain` → `resources/food.png`, `log` →
  `wood.png`, `hourglass` → `hourglass.png` (a vůz `cart`).
- Zbraně, štíty a prapory jsou jednoduché modely ve skriptu – výcvikové rekvizity postav
  (`prop_wicker-shield` má 33 vrcholů, meč je dřevěný) jsou na ikonu moc hrubé.
- **Zůstávají SVG:** oko „Ve scéně“ (`war/eye.svg` – jednobarevná maska v barvě textu tlačítka,
  `CampaignMap`) a vlajky jazykových skupin (`newcomer/<jazyk>.svg` – plochý znak 3 : 2 s rámečkem,
  `LanguageIcon`; vlajka je sama barvami, render látky by ji ve 24 × 16 px rozmazal).

- **Ciferník u data** (Martin 14. 11. 2026; 24 hodin – návrh Clauda): `DayDial` v `hud/TopBar.tsx` místo ikony data, jedna ručička, poledne nahoře; hodina z `dayHourAt` (`lib/scene/day-light.ts`), obnova jednou za sekundu (`useDayHour`), úhel `clockHandAngle` a popisek `dayPartLabel` v `lib/game-date.ts`.

## Kůže, kožešiny, med a vosk v rozhraní (hides-honey.md; plán 2026-11-14 – úloha 8, `hud/selection/wares.tsx`)

- `WaresView` a `VillageSummary.wares` (`summary.ts`, `waresView`): celé kusy a kg (`floor`), `null`, když ves nemá `wares` ani mince a zbroj. Kůže jsou jedno zboží v kusech kůže skotu – malé kůže se přepočtou plochou (`hidesOnHand`, `smallHideRatio` ≈ 0,27); jejich počet nese volitelné `smallHides` pro popisek. Kožešiny jsou ovčí i lovné dohromady, `sheepFurs` z nich ovčí.
- `VillageView.wares` (`village-view.ts`) → `SelectionDetails` dvorce `wares` (`selection-details.ts`).
- `WaresStock` (`dwelling.tsx` pod řádkem lovu, jen u dvorce): čtyři `Stat` ikony `hide`, `fur`, `honey`, `wax` s čísly, popisky „Kůže“ (u malých kůží s rozpisem), „Kožešiny – ovčí N“, „Med“, „Vosk“. `null` i samé nuly = nic. Mince a zbroj vedle nich: Mince, kupci a zbroj v rozhraní výš. Test `hud/__tests__/WaresStock.test.tsx`.
