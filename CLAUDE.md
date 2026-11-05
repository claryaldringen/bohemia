# Bohemia – CLAUDE.md

## Účel projektu

Online feudální strategie v prohlížeči. Hráč je feudální pán – přesněji hlava rodu. Buduje
vesnice, hradiště, tvrze, hrady a města, rozšiřuje rodový majetek a prestiž a snaží se rod
udržet naživu. Všichni hráči sdílejí **jeden svět** propojený vazalskými vztahy.

Podrobná vize, kdo co rozhodl a otevřené otázky: [docs/design/vision.md](docs/design/vision.md).
Herní design vzniká postupně – jedna mechanika = jeden dokument v `docs/design/`.

---

## Klíčová fakta

- **Ostré spuštění: 1. 1. 2027 v 00:00 (Europe/Prague)** – svět startuje 1. 1. roku 500.
- Svět běží jeden skutečný rok: **1. 1. 2028 v 00:00 = 1. 1. roku 1500**.
- 365 skutečných dní = 1000 herních let, svět běží nepřetržitě i bez přihlášených hráčů.

| Herní jednotka     | Skutečný čas       |
| ------------------ | ------------------ |
| den                | ≈ 86 s             |
| roční období       | ≈ 2 h 11 min       |
| rok                | ≈ 8 h 46 min       |
| generace (~25 let) | ≈ 9 dní            |
| lidský život       | ≈ 2–3 týdny        |
| 1 skutečný den     | ≈ 2,74 herních let |

**Důsledek:** skutečnou „postavou“ hráče je **rod**, ne jeden pán. Za rok hraní se vystřídá
kolem 40 generací – dědictví, sňatky a nástupnictví jsou hlavní mechanika, ne okrajová.

## Hráči a vazalství

- Registrace a přihlášení jsou povinné.
- Nový hráč **s pozvánkou** (unikátní kód od stávajícího hráče) začíná jako vazal toho, kdo ho
  pozval.
- Nový hráč **bez pozvánky** je **úplně nezávislý** – svou nezávislost uhájí, nebo ho jiný hráč
  donutí stát se vazalem (Martin 2. 11. 2026).
- **Na vrcholu nestojí nikdo** – hráči jsou si na začátku rovni; kdo chce výš, musí si ostatní
  podrobit (Martin 2. 11. 2026: „V tom ta hra vlastně spočívá“). Vazalem se hráč stane
  pozvánkou nebo dohodou s podmínkami (nabídka i žádost, jednání do shody); vazalství je síť
  dvoustranných dohod (víc pánů smí), nic se nevynucuje – hlavní je vojenská služba mužů rodu,
  dávky v makrokomoditách nabízí vazal a jednou ročně je potvrdí; vypovědět smí kdokoli kdykoli.
  Hráč smí řídit víc vsí (vojvoda nebo správce – správce je šlechtic). Návrh:
  [docs/design/vassalage.md](docs/design/vassalage.md).

---

## Technologický stack

**Současný stav:**

- **Monorepo:** Turborepo + npm workspaces (`apps/*`, `packages/*`), Node 24 (`.nvmrc`)
- **Jazyk:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), společný `tsconfig.base.json`
- **Web:** Next.js 16 (App Router, `output: 'standalone'`), React 19, Tailwind CSS v4
- **Herní jádro:** `packages/game` – doména (kalendář, generování krajiny, simulace vsi) a use-casy, bez I/O
- **3D:** Babylon.js 9 (`@babylonjs/core` + `@babylonjs/loaders`), WebGPU se záložním WebGL 2
- **Databáze:** PostgreSQL + Drizzle (`packages/db`), migrace jako SQL v `packages/db/drizzle/`
- **Účty:** Better Auth – e-mail + heslo s ověřením e-mailu, obnova hesla, Google, sessions v DB
- **Kvalita:** ESLint 10 + typescript-eslint (kořenový `eslint.config.mjs`), Prettier, Vitest

Next.js 16 má oproti starším verzím breaking changes – dokumentace k nainstalované verzi je
v `node_modules/next/dist/docs/`. Soubor `apps/web/AGENTS.md` generuje sám `next dev`; patří
do gitu (po smazání by ho vytvořil znovu).

- **Worker:** `apps/worker` – samostatný Node proces (`tsx`), který průběžně dopočítává vsi hráčů
  (use-case `advanceWorldStep`), i když nikdo není online; `npm run dev` ho pouští s webem

**Plánováno (zatím neexistuje):**

- Pozvánkové kódy (s mechanikou vazalství), odesílání skutečných e-mailů

## Struktura repa

```
apps/web/            Next.js – úvodní stránka, registrace, přihlášení, herní plocha (/game)
  app/api/auth/      Better Auth endpointy
  components/        React komponenty (auth/ formuláře, game/ herní plocha a ves, game/hud/ rozhraní)
  hooks/             React hooky (umisťování staveb ve scéně, dotazování na ves)
  lib/               serverová a pomocná logika (auth, session, db, game a village – composition root)
  lib/scene/         3D scéna krajiny v Babylonu – čisté TS třídy bez Reactu
  public/models/     modely stromů, dekorací, zvířat a lidí a atlas impostorů z 0 A.D. (licence v LICENSES.md)
  e2e/               Playwright testy (proti produkčnímu buildu a databázi bohemia_test)
apps/worker/         samostatný proces – smyčka `advanceWorldStep` (loop.ts), konfigurace z env, log (docs/code/worker.md)
packages/game/       herní jádro
  src/domain/        pravidla – calendar.ts, landscape/ (generování krajiny po vrstvách)
    village/         simulace vsi – lidé, obydlí, pole, jídlo a práce den po dni
  src/application/   use-casy a porty (enterGame, SettlementRepository, SeedSource)
  scripts/           vývojové nástroje (measure-landscapes.ts, measure-village.ts, village-calculator.ts)
packages/server/     sdílené součástky vstupních bodů (web, worker): paměť vsí, přestávky dopočtu, mezipaměť krajin, createGameDeps, svět z env
packages/db/         Drizzle schéma, klient, migrace a adaptéry portů (src/adapters/)
docs/design/         herní design – vize + dokument pro každou mechaniku, rešerše v research/
docs/code/           mapa kódu – podrobnosti mechanik po oblastech (viz Mapa kódu níž)
```

## Mapa kódu – čti jen, co potřebuješ

Podrobnosti mechanik (soubory, funkce, datové toky, scéna) jsou v `docs/code/` – **jeden soubor
na oblast, čti jen ten, který se úkolu týká, a v něm jen potřebnou sekci** (`grep -n` na
název). Pravidla a rozhodnutí jsou v `docs/design/`.

| Soubor                           | Co v něm je                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/code/accounts.md`          | herní kalendář, účty, dev mód a skok v čase                                                                                          |
| `docs/code/landscape.md`         | generování krajiny, verze vrstev, skály u potoka, uložený seed, vrstva překážek (co vyžaduje novou verzi vrstvy)                     |
| `docs/code/scene.md`             | scéna krajiny – kreslení jen při změně, smyčka, terén, voda, dekorace, ořez po čtvercích, světlo, roční období, den a noc, zvuky     |
| `docs/code/scene-village.md`     | scéna vsi – domácí zvířata, obydlí a jámy, pozemky a plot, hřbitov, sad, posvátná místa, dílny                                       |
| `docs/code/village-core.md`      | jádro simulace – API, pořadí práce dne, hlad, determinismus, dopočet, čísla, meze, štěstí, les a dřevo, překážky, upozornění         |
| `docs/code/village-buildings.md` | stavby – rozpad a chátrání, hřbitov, sad, stavba v lese, varianty rozměrů, stavby na poli, natočené stavby, stavby po čtvercích      |
| `docs/code/village-crafts.md`    | řemesla – dílny, uhlíř a milíř, kovář (uhlí, ruda), hrnčíř (hlína), nákup u sousedů, učení, tesař, vozy, kování                      |
| `docs/code/village-fields.md`    | pole – ozim a jař, osev, postup práce po čtvercích, hospodářství, zarůstání, pole ve scéně, výběr dílu                               |
| `docs/code/village-livestock.md` | strava a dobytek, ohrady, voli a spřežení, orba rádlem, vozy se spřežením ve scéně                                                   |
| `docs/code/village-people.md`    | příbuzenství, domácnosti, sňatky, stěhování, víc vsí, odchod, postavy ve scéně                                                       |
| `docs/code/village-roads.md`     | pěšiny, pevné cesty, vylepšení, vozová síť, cesta přes pole, jabloně u cest, vozová cesta                                            |
| `docs/code/village-trade.md`     | dvorec vojvody, zemská stezka, sousedé a obchod, dobytek, výměna lidí                                                                |
| `docs/code/village-steward.md`   | správce vsi – stav, příkaz stavby, mapa hodnot a plán, den správce, přestavba a veto, synové a schránka odchodů, rozhraní, měření    |
| `docs/code/village-wildlife.md`  | divoká zvěř – stav, stropy z krajiny, roční přepočet, škody na polích, šelmy, psi a lov rodu, hlídky polí, ryby a oka, převod, Vlkov |
| `docs/code/village-disasters.md` | počasí kraje – seed počasí mapy, roční los, shlukování, povodeň kraje, odhalení, ochrana nové vsi                                    |
| `docs/code/worker.md`            | worker – smyčka, odklady, spánek do dalšího dne, konfigurace, spuštění a ukončení                                                    |
| `docs/code/world.md`             | svět pro víc hráčů – mřížka a umístění, rod hráče, adresář rodů (co je veřejné), změřený dotaz                                       |
| `docs/code/web-ui.md`            | server actions, dotazování na ves, rozhraní jako 0 A.D., katalog staveb, ovládání, e2e                                               |

**Nová mechanika nebo změna:** zapiš ji do příslušného souboru v `docs/code/` (a pravidla do
`docs/design/`), **ne sem**. Sem patří jen pravidla, která platí napříč celým kódem.

## Závazná pravidla napříč kódem

**Krajina a deterministická vrstva**

- Krajina se generuje po vrstvách (`generateLandscape`), pásmo srovnatelnosti hlídá `checkBand`.
  Uložené sídlo nese seed přijatého pokusu. **Po ostrém spuštění se existující vrstva nesmí
  změnit** – jen nová verze vrstvy nebo nová vrstva; zlaté otisky krajiny a překážek hlídají
  všechny verze (`CURRENT_LAYER_VERSIONS`, `PREVIOUS_…`, `INITIAL_…`).
- Vrstvu překážek (stromy, keře, kameny jsou herní data), síť pěšin, vozovou síť a mřížky staveb
  počítá server i prohlížeč ze stejných funkcí – **jen deterministická matematika** (`det-math.ts`;
  ESLint v těchto souborech zakazuje `Math.sin/cos/atan2/hypot/log` i `**`). Co všechno vyžaduje
  novou verzi vrstvy překážek: `docs/code/landscape.md`.

**Scéna (Babylon)**

- Babylon importovat **z konkrétních modulů** (`@babylonjs/core/Meshes/mesh`…), nikdy
  z `@babylonjs/core`, a jen ze scény (hlídá e2e test).
- **Kreslí se jen při změně** – co se mění samo, nastaví `needsRender`; animace patří do
  `animate()` v taktu `WATER_FPS`, při omezeném pohybu stojí.
- Pick terénu jen přes `terrain-pick.ts`, nikdy `scene.pick` na terénu.
- **WebGPU má limit 8 vertex bufferů** – postava jich má právě 8, další atribut patří do textury.
- PBR materiály s oparem volají `applyGammaFog`. Nové instance stromů a keřů přes
  `setStaticInstances` s předponou jména z `CULLED_MESHES`. Změna náklonu kamery nebo modelů
  stromů = nový render atlasu impostorů (letního i zimního).
- Grafika jen CC0 nebo z 0 A.D. (CC BY-SA 3.0, uvést Wildfire Games) – zdroj každého souboru do
  `LICENSE.md` / `LICENSES.md` vedle něj.

**Ves (simulace)**

- Stav vsi je JSON, funkce vstupní stav nemění. **Nové části stavu jsou volitelné** a starší vsi
  se převedou při načtení (`updateVillage` / začátek `advanceVillage`) jednou a idempotentně.
- **Determinismus:** pevné pořadí kroků dne (`simulate.ts`), náhoda ze seedu vsi a dne – výsledek
  nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Čísla pravidel jen v `rules*.ts`** s odkazem na sekci návrhu; změna čísla = i text v návrhu.
  Meze produktivity jsou dvojice `{ worst, best }` (řemeslníci posouvají k `best`) – v textech
  nepsat „horní / dolní mez“.
- **Hráč staví kdy chce** – zablokovat smí jen cena předem (`BUILD_COSTS`). **Vesničané sami
  používají, co jim ulehčí práci** (Martin) – hráč jim to nezadává.
- Hygiena hřbitova se hráči nikdy neukazuje; hráči se vždy říká **Hřbitov**.
- Typy pro scénu se odvozují z jádra a `lib/village-view.ts`, ve scéně se nedefinují znovu. Každá
  akce nad vsí nese `villageId`, server je jediná autorita.

**Rozhraní**

- **Jako v 0 A.D., bez popisků a průvodce** – ikony s čísly, slova jen v popiscích (`Tooltip`),
  důvod a varování u kurzoru. Výjimky: nabídka hry, hlavičky „Dáš“ / „Dostaneš“ v obchodu.

## Jak pracovat (šetrně s tokeny)

Martin 21. 10. 2026: „Musíme změnit styl práce. Pálíme hrozně moc tokenů.“

- Úkol pro agenta nejvýš ≈ 150 kroků – větší rozdělit, stav předat souborem. V zadání přesné
  soubory a funkce.
- Čti po kouscích (`grep -n`, `sed -n 'a,bp'`), nečti celé velké soubory ani stejné místo
  opakovaně. Z `docs/code/` jen potřebný soubor a sekci.
- Výstupy příkazů ořezávat (`| tail`, `grep "Tests "`). Snímky obrazovky jen na konci a menší.
- Kalibraci (`measure-village`) pouštět jen na pokyn.
- Rozhodnutí v dokumentech: Martinova slova citovat s datem, vlastní rozhodnutí jako „návrh
  Clauda“ (nikdy „koordinátor“).

## Příkazy

```bash
npm install
npm run db:migrate    # migrace do lokální DB bohemia (bez DATABASE_URL)
npm run dev           # web na http://localhost:3010 i worker
npm run dev:web       # jen web (bez workeru)
npm run worker        # jen worker (čte apps/web/.env.local, Ctrl+C = čistý konec)
npm run build
npm run typecheck     # next typegen + tsc
npm run lint
npm run test          # unit testy (Vitest)
npm run test:db       # testy adaptérů a souběhu web × worker proti DB bohemia_test (Homebrew Postgres musí běžet)
npm run test:e2e      # Playwright – build + next start na :3011 proti DB bohemia_test (projekty chromium a worker)
npm run test:e2e:worker   # jen e2e s workerem (spec pustí apps/worker vedle next start)
npm run format:check  # npm run format = oprava
npm run db:generate   # nová migrace po změně schématu v packages/db/src/schema
npm run db:seed-dev   # vývojový účet v lokální DB bez registrace
npm run village-log -- --village <id|jméno> [--player <id>] [--from rok]   # deník vsí (tabulka village_year)
npx tsx packages/game/scripts/measure-landscapes.ts 500   # měření generátoru krajiny (+ initial = verze 1)
npx tsx packages/game/scripts/measure-village.ts --quick --out quick.jsonl   # kalibrace vsi (50 vsí)
npx tsx packages/game/scripts/measure-village.ts 200 60 --out base.jsonl     # závěrečné ověření
npx tsx packages/game/scripts/measure-village.ts 200 60 --variant meadow-burn --out burn.jsonl
npx tsx packages/game/scripts/village-calculator.ts --preset full --fertility 56   # ustálený stav
npx tsx apps/web/scripts/measure-scenery-culling.ts   # trojúhelníky a draw cally s ořezem po čtvercích
NODE_OPTIONS=--conditions=react-server npx tsx apps/web/scripts/measure-absence.ts --villages 1,5,20   # otevření hry a akce po nepřítomnosti s workerem a bez něj (DB bohemia_measure)
```

Všechny příkazy jdou přes Turborepo do jednotlivých workspaces. Před commitem musí projít
`typecheck`, `lint`, `test` a `format:check`; u změn adaptérů DB i `test:db`, u změn
přihlašování, stránek nebo scény i `test:e2e`.

---

## Architektura – hexagonální (porty a adaptéry)

**Závazné pro všechny herní mechaniky** (schváleno 16. 10. 2026).

```
packages/game/src/domain/       doména – entity a pravidla, čisté deterministické funkce
packages/game/src/application/  use-casy (herní akce) + porty (rozhraní: repozitáře, Clock…)
packages/db/src/adapters/       adaptéry portů – Drizzle implementace repozitářů
apps/web, apps/worker           vstupní body – spojí adaptéry s use-casy (composition root)
```

- **Závislosti míří jen dovnitř:** vstupní body a adaptéry → use-casy → doména. Doména nezná
  nic jiného, use-casy znají jen doménu a vlastní porty.
- **Doména a use-casy neimportují infrastrukturu** (DB, Drizzle, Next.js, React, Better Auth,
  `node:*`) a doména neimportuje use-casy – **hlídá ESLint** (`eslint.config.mjs`).
- **Determinismus:** v `packages/game` žádné `Date.now()`, `new Date()` bez argumentu ani
  `Math.random()` – čas a náhoda přicházejí parametrem nebo přes port – **hlídá ESLint**.
- **Use-case = jedna herní akce** hráče nebo světa (např. `buildStructure`, `resolveSeason`):
  načte stav přes port, zavolá doménové pravidlo, uloží výsledek přes port. Žádná herní logika
  v adaptérech, route handlerech, server actions ani React komponentách.
- **Web i worker volají stejné use-casy** – herní logika existuje jen jednou.
- **Testy:** doména a use-casy unit testy s in-memory implementacemi portů (ne mocky Drizzlu);
  adaptéry proti skutečné databázi `bohemia_test`.
- **Přihlašování (Better Auth) je mimo hexagon** – služba frameworku v `apps/web`. Doména zná
  jen ID hráče.
- **Herní čas je čistá funkce skutečného času**, ne čítač tiků (`domain/calendar.ts`). Výpadek
  workeru tak čas neposune – worker po restartu doběhne zmeškané události podle jejich herního
  termínu.
- **Server je jediná autorita.** Klient jen zobrazuje a posílá záměry hráče; výsledky
  (stavby, suroviny, boje) počítá a ověřuje server.

## Konvence

- **Jazyk:** UI a dokumentace česky, identifikátory v kódu anglicky, komentáře v kódu česky.
- **Typografie:** v češtině krátká pomlčka „–“ s mezerami, nikdy „—“.
- **Commity:** Conventional Commits česky, např. `feat(web): registrace hráče`.
- **TypeScript:** explicitní návratové typy funkcí (vynucuje ESLint), žádné `any`.
- **Repo je veřejné:** žádná tajemství v gitu. `.env` je v `.gitignore`, do repa patří jen
  `.env.example`. Do dokumentace nepatří IP adresy, hesla ani přístupy k serveru.
- **Herní design před kódem:** novou mechaniku nejdřív popsat v `docs/design/` a nechat
  schválit, teprve pak implementovat.

## Lokální vývoj a nasazení

**Zatím se vyvíjí a běží jen lokálně.** Nasazení na VPS se řeší až později – do té doby nic
nenasazovat ani nepřipravovat produkční infrastrukturu.

- **Databáze lokálně:** PostgreSQL 17 z Homebrew (`postgresql@17`, běží jako služba na
  `127.0.0.1:5432`, uživatel `postgres` bez hesla). Databáze `bohemia` (vývoj) a `bohemia_test`
  (e2e testy). Bez `DATABASE_URL` se použije `bohemia`. `psql` není v PATH – plná cesta
  `/opt/homebrew/opt/postgresql@17/bin/psql`.
- **`apps/web/.env.local`** (mimo git) drží `BETTER_AUTH_SECRET` a `BETTER_AUTH_URL`; vzor
  všech proměnných je v `apps/web/.env.example`.
- **Později:** Hetzner VPS (PostgreSQL už tam je), PM2 + Caddy, Next.js ve standalone režimu.
  Až se bude nasazovat, popsat v `docs/deployment.md`. Nezapomenout: skutečné odesílání
  e-mailů, `BETTER_AUTH_SECRET` a `DATABASE_URL` v produkci, Google redirect URI pro produkční
  doménu a `advanced.ipAddress` v Better Auth (za Caddy věřit jen jeho `X-Forwarded-For`, jinak
  jde omezení pokusů o přihlášení obejít podvrženou IP).
