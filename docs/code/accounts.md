# Kalendář a účty hráčů

Mapa kódu (přesunuto z CLAUDE.md 21. 10. 2026).

## Herní kalendář

Pravidla v [docs/design/calendar.md](../design/calendar.md). Hlavní API z `@bohemia/game`:

- `getWorldState(nowMs, world)` – stav světa (`not-started` / `running` s herním datem / `ended`)
- `realTimeOf(date, world)` – skutečný okamžik, kdy herní den začíná (pro plánování událostí)
- `resolveWorldClock(env)` – ostrý svět, nebo testovací svět z `WORLD_START` a `WORLD_END`

Testovací svět: zkopíruj `apps/web/.env.example` do `apps/web/.env.local` a nastav obě
proměnné – příklady (svět od dneška, zrychlený svět) jsou přímo v souboru.

## Účty hráčů

Pravidla v [docs/design/accounts.md](../design/accounts.md). Na serveru `getSession()`
(`apps/web/lib/session.ts`), v prohlížeči `authClient` (`lib/auth-client.ts`). Instance Better
Auth vzniká líně přes `getAuth()` – `next build` stránky jen importuje a databázi nepotřebuje.

- **Registrace s pozvánkou:** volitelné pole „Pozvánka“ (`?pozvanka=` ho předvyplní). Server
  action `checkInviteAction` (`app/register/actions.ts`) kód zkontroluje: platný uloží do cookie
  `bohemia_invite` (httpOnly, 14 dní, `lib/invite-cookie.ts` – přežije i přesměrování přes
  Google), neplatný dá „Pozvánka neplatí.“ a registrace jde dál bez něj. Po vytvoření uživatele
  (`databaseHooks.user.create.after` v `lib/auth.ts`) se kód z cookie jen **zarezervuje**
  (`reserveInvite`); vazalem se pozvaný stane až při vstupu do hry. Podrobnosti: `world.md`.
- **Jazyková skupina** (návrh: `docs/design/newcomers.md` – Jazyková skupina): `cs`, `en`, `de`,
  `pl`, `it`, `fr`, `es` (`domain/world/languages.ts` – `LANGUAGE_GROUPS`, `isLanguageGroup`).
  Registrační formulář má nativní `select` „Jazyk“ (výchozí čeština, názvy v
  `lib/language-names.ts`); `language` je vstupní pole uživatele v Better Auth (`input: true`),
  `databaseHooks.user.create.before` neznámou hodnotu odmítne („Neznámý jazyk.“), klient pole zná
  přes `inferAdditionalFields` (`lib/auth-client.ts`). Dosavadní účty mají `cs`. `enterGame`
  čte jazyk účtu přes volitelný `EnterGameDeps.accountLanguage` (adaptér
  `createAccountLanguages` nad `user.language`; v `GameDeps` je povinný, aby i rod po restartu hry
  zdědil jazyk účtu) a předá ho `houses.create`. Účty přes Google volí jazyk use-casem
  `chooseLanguage` (`application/languages.ts`, server action `chooseLanguageAction`) – jen dokud
  hráč nemá sídlo, jinak „Jazyk se volí jen na začátku.“; uloží jazyk účtu i živého rodu
  (`HouseRepository.setLanguage`). Rozhraní zůstává česky, jazyk je zatím jen příznak.
- **E-maily** se zatím jen vypisují do terminálu dev serveru (ověřovací odkaz se zkopíruje
  odtamtud). V produkci bez nastaveného odesílání `sendMail` záměrně spadne.
- **Vývojový účet** bez registrace: `npm run db:seed-dev` založí (nebo obnoví) ověřený účet
  v lokální DB `bohemia`, přihlašovací údaje jsou na začátku `apps/web/scripts/seed-dev-user.ts`.
  Ve vývoji jde přihlásit i samotným jménem (`lib/dev-login.ts` doplní `@bohemia.test`).
- **Vývojový režim (dev mód):** příznak účtu `devMode` (`user.dev_mode`, Better Auth pole
  s `input: false` – klient ho nenastaví; zapíná ho jen `db:seed-dev`, dnes jen Jarmil). Vedle
  data v liště jsou tři šipky – ▶ +1 měsíc (30 dní), ⏩ +1 rok (365 dní), ⏭ +10 let (3 650 dní). Server action
  `skipTime` → use-case `skipTime` (bez `devMode` odmítne) zvětší **posun času hráče**
  (tabulka `player_time_offset`, port `TimeOffsetRepository`) a dopočítá jeho vsi. Dnešní den
  hráče je vždy `playerToday` z `lib/game.ts` (den světa + posun, nejvýš 31. 12. 1499) – nikdy
  `gameDayIndex` přímo; prohlížeč dostane posun se stránkou a hodiny posune `shiftWorldClock`
  (datum v liště, roční období a dým ve scéně). Posun jen roste, platí i bez `devMode`. (Tlačítko
  **Druhá ves na téže mapě** je od 1. 11. 2026 pryč: jedna ves, jedna mapa;
  e2e přepínače vsí zapíše druhou ves na mapu vedle rovnou do databáze – `villageOnNextMap`.)
  Vedle šipek **Vynutit zlý rok** a **Vynutit pohromu** (`DevDisasterButtons` v `TopBar` – každé otevře
  řadu ikon druhů): server action `forceDevDisaster` (`{ villageId, kind: 'year' | 'disaster',
value }`, `parseDevDisasterInput`) → use-cases `forceBadYear` / `forceDisaster`
  (`application/dev-disasters.ts`, bez `devMode` odmítnou). Zlý rok zapíše letošní léto nebo zimu
  do `disasters.override.weather[rok]` (ukáže se, až bude vidět – sucho od 1. 5.), pohroma zítřejší
  kroupy, smršť F2 (pruh a stopa přes střed vsi), stoletou vodu nebo požár prvního obydlí
  (`override.hail`, `.tornado`, `.weather[rok].flood`, `.fire`) – přebijí los i ochranu nové vsi.
- **Průběh přeskoku** (Martin, 1. 11. 2026: „Když hru posunu o rok, pořád to dost trvá. Můžeš
  udělat nějaký progressbar, abych viděl průběh přepočtu?“): skutečné dopočítané dny, ne odhad
  podle času. Port `ProgressReport` (`onProgress` v `DynastyDeps`, `application/villages.ts`):
  `dynastyStatus` spočte celek z otisků vsí (`stampsOf` – dny do dneška, spící ves 0) a hlásí
  `{ doneDays, totalDays }` po každém odsimulovaném dni – den se dozví z přestávky (`Pause`
  dostává index dne z `advanceVillageSteps`; s hlášením má počítaná ves přestávky vždy, výsledek
  je týž). Hotovo jen roste a nepřeleze celek (opakovaný pokus po souběhu). Smyčku mezi dny uvolňuje
  dál `computePause` (≈ 50 ms v kuse, `setImmediate`). Přestávky jsou i **uvnitř dne**: den vsi
  je generátor (`simulateDaySteps`) a drahé kroky se zastavují (`yield` bez hodnoty → `pause()` bez
  indexu dne) – měsíční kontrola cest (`roadsMonthSteps`: vyšlapanost, zánik, vznik, úklid), přepočet
  tras a chůze (`refreshWalkDistancesSteps` → `villagePathNetworkSteps` → `computePathNetworkSteps`
  po domácnostech v kole, `walkingDistancesSteps` po osmi cílech, obydlí po jednom) a mezi velkými
  kroky dne (chov, plán osevu, práce, správce, jídlo). Synchronní verze (`roadsMonth`,
  `refreshWalkDistances`, `computePathNetwork`, `routeAllSteps`, `walkingDistances`) jsou jen výčet
  generátoru, výsledek je týž. Nejdelší kus bez přestávky u Vlkova (skok o rok, `measure-pauses.ts`):
  teplý ≈ 0,1 s (dřív ≈ 1,0 s), studený ≈ 0,45 s. Nedělitelné zůstává `obstaclesOf` při prvním
  načtení krajiny (≈ 0,3 s studený) a jedno volání `tidyMonth` (≈ 60–90 ms). Web: `skipTimeForPlayer`
  zapisuje průběh do paměti procesu (`lib/skip-progress.ts`, `globalThis`) a po konci ho smaže –
  obojí uvnitř fronty hráče. Čte ho **Route Handler** `GET /api/dev/skip-progress` (jen přihlášený
  s `devMode`, jen vlastní průběh, `no-store`) – server action to být nemůže, Next řadí server
  actions jednoho klienta za sebe a dotaz by čekal za přeskokem. `DevTimeButtons` se během skoku
  ptá každých 400 ms (`useSkipProgress`, `usePolling`) a pod šipkami běží tenký ukazatel
  (`dev-skip-progress`, `role="progressbar"`) bez textu – „Přepočet 40 %“ a dny jsou v popisku šipek.
  Skok o rok Vlkova (paměťové repozitáře, `computePause`): ≈ 4,1 s s hlášením i bez něj (rozdíl
  v šumu, studený start ≈ 6,2 s).
- **Hlášky Better Auth** se překládají v `lib/auth-errors.ts` – nové chybové kódy doplnit tam.
- **Změna polí uživatele** (`user.additionalFields` v `lib/auth.ts`) → upravit i
  `packages/db/src/schema/auth.ts` a vygenerovat migraci.
- **Google:** přihlašovací údaje z Google Cloud Console do `apps/web/.env.local`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); bez nich se tlačítko Google nezobrazí.
