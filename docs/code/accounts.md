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
  (datum v liště, roční období a dým ve scéně). Posun jen roste, platí i bez `devMode`. Vedle
  šipek je i tlačítko **Druhá ves na téže mapě** (server action `foundDevVillage` → use-case
  `foundDevVillage`, bez `devMode` odmítne) – jen pro vyzkoušení přepínače vsí, dokud odchod do
  nové vsi (migration.md, fáze 3 a 4) není: nová ves se 4 lidmi na nejbližším volném místě
  aspoň 300 m od ostatních (`freeVillageSite`), lidé ze staré vsi neodcházejí.
  Dál **Vynutit zlý rok** a **Vynutit pohromu** (`DevDisasterButtons` v `TopBar` – každé otevře
  řadu ikon druhů): server action `forceDevDisaster` (`{ villageId, kind: 'year' | 'disaster',
value }`, `parseDevDisasterInput`) → use-cases `forceBadYear` / `forceDisaster`
  (`application/dev-disasters.ts`, bez `devMode` odmítnou). Zlý rok zapíše letošní léto nebo zimu
  do `disasters.override.weather[rok]` (ukáže se, až bude vidět – sucho od 1. 5.), pohroma zítřejší
  kroupy, smršť F2 (pruh a stopa přes střed vsi), stoletou vodu nebo požár prvního obydlí
  (`override.hail`, `.tornado`, `.weather[rok].flood`, `.fire`) – přebijí los i ochranu nové vsi.
- **Hlášky Better Auth** se překládají v `lib/auth-errors.ts` – nové chybové kódy doplnit tam.
- **Změna polí uživatele** (`user.additionalFields` v `lib/auth.ts`) → upravit i
  `packages/db/src/schema/auth.ts` a vygenerovat migraci.
- **Google:** přihlašovací údaje z Google Cloud Console do `apps/web/.env.local`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); bez nich se tlačítko Google nezobrazí.
