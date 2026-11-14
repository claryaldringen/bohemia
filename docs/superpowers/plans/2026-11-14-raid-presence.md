# Hráč ve vsi a mimo ni – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves se při nájezdu chová podle toho, kde je hráč: vojvoda doma a hráč u hry → ves čeká na jeho rozkazy a vojsko vidí od vstupu na mapu; jinak hned podle nastavení (obrana / evakuace); hráč smí vzdát vojvodu.

**Architecture:** Přítomnost hráče se zapisuje mimo tažení (tabulka `player_presence`). Do tažení vstupuje jen záměrem `alarm-presence` s taktem, který po výpočtu zapíše worker. Výsledek tak nezávisí na tom, kdy a po jakých kouscích se takt počítá. Postoj „Vzdát se při přesile“ zmizí, nahradí ho vzdání vojvody (záměr obránce `lord-surrender`). To napojíme na dnešní zajetí a výkupné.

**Tech Stack:** TypeScript, Vitest, Drizzle/PostgreSQL, Next.js 16, React 19.

**Spec:** `docs/design/war.md` – Hráč ve vsi a mimo ni (schváleno 14. 11. 2026); navazuje: Obránci – postoje a útěk, Vzdaní, zajetí a výkupné, Varování, poslové a útěk do hradiště, Velení (přítomnost).

## Rozhodnutí plánu (návrh Clauda)

1. **Vojvoda doma** = hráčův muž (`House.lord`, ne `dynasty.lordId` – v jiných vsích rodu je vojvodou syn) žije v této vsi. Je ve `state.people`, `!isAway(p, day)` (výjezd, tažení, zajetí, posel, útěk, robota, služba, ochrana) a tažení ho dnes neodvedlo (`alarmTaken` – posel, skupina). Tažení zná jeho číslo z portu vlastníka (`AlarmOwner.lordId`, jen když `house.lord_village_id` je tato ves). Ves se zapnutým správcem a NPC ves jsou vždy „bez hráče“. Vojvoda ale vojsko vidí i tam, protože jde o fyzický fakt.
2. **Přítomnost.** „U hry“ = kterákoli ves hráče otevřená ve hře (dotaz na ves, pohled na varování, scéna války) nebo jakýkoli pokyn. Je to doslovné čtení „jakýkoli pokyn hráče“, přítomnost je proto po hráči, ne po vsi. Web zapisuje `player_presence.seen_at`, nejvýš jednou za 10 s a proces.
   - **Do tažení jen záměrem.** Když ves potřebuje vědět, jestli je hráč u hry, zapíše `AlarmVillage.askedTick` a čeká. Worker po výpočtu kola zapíše záměr `{ kind: 'alarm-presence', village, seenTick }` na takt `state.tick + INTENT_LEAD_TICKS` (vzor: `step-journeys.ts`, `restart-game.ts`). `seenTick` je poslední přítomnost hráče, oříznutá na takt záměru.
   - **Proč ne port čtený v taktu:** odpověď by závisela na tom, kdy worker takt počítá (zpoždění, restart). Záměr hodnotu zmrazí a projde stejnou pojistkou jako rozkazy (`saveCheckpoint` × `addIntent`).
   - **Proč ne záměr z klienta obránce:** obránce o vojsku před vstupem na mapu neví (mlha války). Tažení by muselo nechat běžet lhůtu, než se klient ozve, a tu by čekal i nepřítomný hráč.
   - **Výsledek:** nepřítomnému hráči ves zareaguje do jednoho kola workeru + 2 takty (≈ 1 s) místo 344 taktů. Přítomný se nemusí „ozvat“ rychleji než ves: o přítomnosti rozhoduje jeho činnost ve hře, ne reakce na vojsko. Dokud je u hry, worker přítomnost obnovuje každých `WAR.alarm.presenceRefreshTicks` (86 = ¼ dne). Když odejde, ves se po `absentTicks` (1 herní den, `WAR.absentLeaderDays` jako u vůdce) zachová podle nastavení. Každý záměr obránce od vlastníka je také přítomnost.
3. **Kdo rozhoduje** (`deciderOf`, v tomto pořadí): NPC → správce; `steward.on` → správce; vojvoda není doma → správce hned (lhůta hráče odpadá); čeká se na odpověď → hráč; bez údaje → zeptat se (`askedTick`); `presenceTick === null` nebo starší než `absentTicks` → správce; jinak hráč. Totéž pro hradiště hráče (`decideDomain`). „Správce“ = dnešní pravidlo `stewardAlarmChoice` podle postoje.
4. **Odhalení:** v `sightAlarms` ves s vojvodou doma ví o vojsku v taktu, kdy první skupina stojí na její mapě (`by: 'lord'`, doběh 0, `seenAt` = skupina nejblíž středu vsi). Scéna obránce s vojvodou doma ukáže celé vojsko na jeho mapě (`seesAll`), i vojsko, které ves jen míjí.
5. **Vzdání vojvody:** záměr obránce `lord-surrender`. Jde jen pro cíl tažení, dokud nájezd není rozhodnutý (`raidDay`), se skupinou na mapě cíle a s vojvodou doma. Vojvoda je vždy zajat (volba `surrendered` útočníka se ho netýká), vojsko se obrátí s důvodem `'yielded'` a odnese jen to, co už má v `s.loot`. Ve vsi to dál běží dnešní cestou zajetí: `away captive` + formální správce, `VillageState.prisoners` věznitele, výkupné.
6. **Nález** „nájezd na vzdávající se ves s prázdnou palisádou 100 m od domu se do 3000 taktů nerozhodne“ **se zrušením postoje nezmizí.** Plánovač to ověřil (scénář z `campaign.test.ts` – znalost rodu, `smallFort`, do `LAUNCH + 3000`):
   - **`surrender` / `flee` / `defend`, živé vedení s přítomností bez rozkazu:** `raiding` / `ongoing`. Muž sedí na palisádě (−754, 90), útočníci stojí u domu (−884, 30) a „drží se velitele“, který nedostal rozkaz.
   - **Táž ves, NPC velitel:** `done` / `attackers` v taktu 561 (vezme, co je venku).
   - Podle specu („hráč řídí živě útok i ústup“) jde o čekání na vůdce, ne o chybu. Úloha 1 chování připne testem, změna je otázka na Martina.

## Global Constraints

- **Start až po sloučení `fix/restart-defender` do `feat/landscape`.** Překryv: `packages/game/src/application/step-campaigns.ts` (Úloha 6 – háček v `stepOne`, `StepCampaignsDeps`). Před Úlohou 6 přečti `stepOne` znovu. Úloha 2 přidá migraci DB: když `fix/restart-defender` přidal vlastní, `npm run db:generate` až po sloučení (číslo za ní).
- Hexagon a determinismus podle `CLAUDE.md`: v `packages/game` žádné `Date.now()` ani `Math.random()`. Čas přijde parametrem (`nowMs`), náhoda ze seedu.
- Stav tažení je JSON: nová pole jsou volitelná, `null` ano, `undefined` v polích ne. Starší kontrolní bod bez nových polí musí projít (ves se zeptá).
- Stav vsi: převod jen přes konec `VILLAGE_MIGRATIONS` (`packages/game/src/domain/village/core/migrations.ts`), jednou a idempotentně.
- Čísla jen v `rules-war.ts` s odkazem na spec. Nové číslo musí být i v tabulce Čísla v `docs/design/war.md`.
- Rozhraní jako v 0 A.D.: ikony, slova jen v `Tooltip`. Texty česky s „–“.
- Každá úloha upraví svou sekci `docs/code/war.md` (nová sekce „Hráč ve vsi a mimo ni (14. 11. 2026)“ vznikne v Úloze 2) a projde `npm run check:docs`.
- Před commitem: `npm run typecheck && npm run lint && npm run test && npm run format:check`. U Úlohy 2 i `npm run test:db`. U Úloh 4–7 i `npm run test:slow`. `npm run test:e2e` jen jednou na konci větve (po Úloze 9).
- Commity česky (Conventional Commits), větev `feat/raid-presence` z `feat/landscape`. Necommitovat do `feat/landscape` přímo.
- Rozhodnutí v docs: Martin s datem, vlastní jako „návrh Clauda“.

## Review Focus

1. **Worker zaostává** (restart, výpadek): `lastSeen` je novější než takt výpočtu, takže `seenTick` se ořízne na takt záměru a ves rozhodne jednou. Test v Úloze 6.
2. **Vojvoda během varování odjede jako posel** (nebo je zajat): ves se v témž taktu zachová podle nastavení. Test v Úloze 5.
3. **Vzdání v taktu, kdy boj skončí, nebo dvakrát v jednom taktu:** platí jen první, a jen když `raidDay` ještě není. Test v Úloze 7.
4. **Dvě tažení na touž ves:** vzdání v prvním. Druhé vidí vojvodu doma až do dopočtu vsi, takže druhé vzdání musí odmítnout use-case (`lordAway`). Test v Úloze 8.
5. **Staré uložené stavy:** ves se `stance: 'surrender'` se převede na `'flee'` (Úloha 1). Bod tažení s `AlarmVillage` bez `askedTick` / `presenceTick` se zeptá a nespadne (Úloha 5).

---

### Úloha 1: Zrušení postoje „Vzdát se při přesile“ (Sonnet)

**Files:**
- Modify: `packages/game/src/domain/village/types/types-state.ts:124-125` (`DefenseStance = 'defend' | 'flee'`)
- Modify: `packages/game/src/domain/village/core/migrations.ts` (nový převod na konec `VILLAGE_MIGRATIONS`)
- Modify: `packages/game/src/domain/war/stance.ts` (větve `stance === 'surrender'` ≈ ř. 370 a 424; `fortSurrenders` smazat, nemá-li jiné volající – `grep -rn fortSurrenders`)
- Modify: komentáře `refuge-choice.ts:467`, `rules-war.ts` u `surrenderRatio` (číslo zůstává – útěk bez lesa, dostižení uprchlíků)
- Modify: `apps/web/lib/village-input.ts:617-620`, `apps/web/components/game/hud/ManorPanel.tsx:28-46`
- Test: fixtury `defense: { stance: 'surrender' }` → `'flee'` v `war/__tests__/campaign.test.ts:283`, `raid-campaign.test.ts:26`, `captives-campaign.test.ts:32`, `application/__tests__/step-campaigns.test.ts:244`. Dál `stance.test.ts`, `set-defense-stance.test.ts` a test převodu vedle ostatních převodů v `core/__tests__`.

**Interfaces:** Produces: `DefenseStance = 'defend' | 'flee'`.

- [ ] **Krok 1: Failing testy**
  - Převod: `{ defense: { stance: 'surrender' } }` → `'flee'`. Podruhé beze změny. Bez `defense` beze změny.
  - `village-input`: `'surrender'` → `null`.
  - Nález v `campaign.test.ts` (describe znalost rodu), `it('živý nájezd na ves za palisádou bez rozkazu čeká – nezávisí na postoji')`: pro `flee` i `defend` s `smallFort(SUMMER)`, `stepCampaign(START, LAUNCH + 3000, LIVE, …)` → `phase === 'raiding'`, `battle.outcome === 'ongoing'`. Se `{ ...START, liveCommand: false }` a `SET_OUT` → `phase === 'done'`, `outcome === 'attackers'`.
- [ ] **Krok 2:** `npx vitest run` dotčených souborů v `packages/game` → převod a input FAIL.
- [ ] **Krok 3: Implementace**
  - Převod `'surrender'` → `'flee'`: ve funkci převodu čti `stance` jako `string`.
  - `stance.ts`: za opevněním se skupina podle postoje nevzdává (bod zlomu a `rout` dál platí). Venku `defend` → boj, `flee` → les, bez lesa vzdání při přesile, jinak boj.
  - `ManorPanel`: dvě ikony – `defend` (`shield-wall.png`, popisek „Obrana“, „Skupiny domů se brání do bodu zlomu.“) a `flee` (`forest.png`, „Evakuace“, „Posel do hradiště pána, lidé do hradiště, stihnou-li to, jinak do lesa (výchozí).“). `white-flag.png` zůstává pro Úlohu 8.
  - Fixtury na `flat()` nemají les, takže `flee` = vzdání při přesile jako dřív. Když test s opevněním změní výsledek, oprav očekávání podle nového pravidla a zapiš proč.
- [ ] **Krok 4:** testy PASS + `npm run typecheck`.
- [ ] **Krok 5: Docs**
  - `docs/design/war.md`: v sekci Obránci – postoje a útěk přeškrtni tři postoje a „Přítomný hráč dostane upozornění…“ (`~~…~~` – nahrazeno 14. 11. 2026, Hráč ve vsi a mimo ni) a doplň dva postoje.
  - „Kde na mapě les není, skupina se zachová jako „vzdát se při přesile““ přepiš na „…vzdá se při přesile, jinak se brání“.
  - Řádek Čísla „Vzdát se při přesile“ → „Přesila (útěk bez lesa, dostižení)“, bez „za opevněním…“.
  - `grep -rn "Vzdát se při přesile\|surrender" docs/design docs/code` a oprav výskyty postoje (i `fortifications.md` – Postoje vsi s opevněním).
  - `docs/code/war.md` – Postoje vsi a včasný útěk.
- [ ] **Krok 6:** commit `feat(game): postoj vsi jen obrana a evakuace – vzdání při přesile zrušeno`.

### Úloha 2: Záznam přítomnosti hráče (Sonnet)

**Files:**
- Create: `packages/game/src/application/presence.ts` (+ export v indexu application)
- Modify: `packages/db/src/schema/player-activity.ts` (tabulka `player_presence`), migrace přes `npm run db:generate`
- Create: `packages/db/src/adapters/presence-repository.ts`, test `presence-repository.db.test.ts`
- Modify: `apps/web/lib/game.ts` (`notePlayerPresent`, volat z `notePlayerActive`), route `GET /api/war-scene/<sídlo>` (`apps/web/lib/war-scene.ts` nebo soubor route – `grep -rn "war-scene" apps/web/app/api`)

**Interfaces:** Produces:
```ts
export interface PresenceRepository {
  /** Hráč je u hry v okamžiku `at` (starší zápis nepřepíše novější). */
  note(playerId: string, at: Date): Promise<void>;
  /** Poslední přítomnost (ms) hráčů, kteří nějakou mají. */
  lastSeen(playerIds: readonly string[]): Promise<Map<string, number>>;
}
export const PRESENCE_NOTE_MS = 10_000; // zápis nejvýš jednou za 10 s a proces (návrh Clauda)
```

- [ ] **Krok 1: db test**
  - `note(p, t2)` a pak `note(p, t1 < t2)` → `lastSeen([p]).get(p) === t2.getTime()`.
  - Hráč bez zápisu chybí v mapě.
  - Smazaný uživatel → řádek zmizí (FK jako `player_activity`).
- [ ] **Krok 2:** `npm run test:db` → FAIL.
- [ ] **Krok 3: Implementace**
  - Schéma `player_presence(player_id text pk → user.id on delete cascade, seen_at timestamptz not null)`.
  - `note` = upsert s `GREATEST(seen_at, excluded.seen_at)`.
  - Web: `notePlayerPresent(playerId)` s procesní `Map` (vzor `activeToday`), zápis jen když od posledního uplynulo ≥ `PRESENCE_NOTE_MS`. Volá ho `notePlayerActive` (akce, dotaz na ves, pohled na varování) a route scény války (dotazuje se po 5 s, dokud je hra otevřená).
- [ ] **Krok 4:** `npm run db:migrate` (lokálně, se zálohou), `npm run test:db` PASS, `npm run typecheck`.
- [ ] **Krok 5: Docs.** `docs/code/war.md`: nová sekce „Hráč ve vsi a mimo ni (14. 11. 2026)“ – přítomnost: tabulka, kdo zapisuje, `PRESENCE_NOTE_MS`.
- [ ] **Krok 6:** commit `feat(db): záznam přítomnosti hráče ve hře`.

### Úloha 3: Vojvoda doma (Sonnet)

**Files:**
- Modify: `packages/game/src/domain/war/alarm-types.ts` (`AlarmOwner.lordId?: number`)
- Modify: `packages/db/src/adapters/alarm-owners.ts:42-62` (`ownerOf`)
- Create: `packages/game/src/domain/war/lord-home.ts`, test `war/__tests__/lord-home.test.ts`
- Test: `alarm-owners.db.test.ts`

**Interfaces:** Produces:
```ts
/** Hráčův muž žije ve vsi, dnes není pryč (`isAway`) a tažení ho dnes neodvedlo (`gone`). */
export function lordAtHome(state: Pick<VillageState, 'people'>, lordId: number | undefined,
  day: number, gone?: ReadonlySet<number>): boolean;
/** Totéž v taktu: stav `villageAt(villageId, s.day)` (chybí → MissingData), `gone` = lidé z `alarmTaken`. */
export function lordHomeAt(s: CampaignState, villageId: string, owner: AlarmOwner,
  ctx: TickContext): boolean;
```

- [ ] **Krok 1: Failing testy**
  - `lordAtHome`: doma → true; `away` `journey` / `campaign` / `captive` / `messenger` / `refuge` → false; `lordId` undefined → false; osoba chybí → false; id v `gone` → false.
  - db: sídelní ves rodu (`house.lord_village_id`) → `lordId` = `lord_person_id`; jiná ves téhož rodu → bez `lordId`; NPC ves jako dřív.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace.** SQL: `CASE WHEN h.lord_village_id = v.id THEN h.lord_person_id END AS lord_id` (jména sloupců ověř v `schema/house.ts`). `lordId` jen když není null.
- [ ] **Krok 4:** PASS (`npx vitest run …lord-home`, `npm run test:db`).
- [ ] **Krok 5: Docs.** `docs/code/war.md` – Hráč ve vsi a mimo ni: vojvoda doma.
- [ ] **Krok 6:** commit `feat(game): vojvoda doma – hráčův muž ve vsi`.

### Úloha 4: Vojvoda vidí vojsko při vstupu na mapu (Sonnet)

**Files:**
- Modify: `alarm-types.ts` (`AlarmVillage.by: 'villager' | 'messenger' | 'lord'`)
- Modify: `packages/game/src/domain/war/alarm.ts:72-102` (`sightAlarms`)
- Test: `war/__tests__/alarm-sight.test.ts`

**Interfaces:** Consumes `lordHomeAt` (Úloha 3). Produces `by: 'lord'` (Úlohy 5, 9).

- [ ] **Krok 1: Failing testy** (`alarm-sight.test.ts`, svět s `alarmOf` → `{ playerId: 'p2', npc: false, houseId: 'h2', lordId: 1 }`)
  - `it('vojvoda doma – ves ví v taktu, kdy vojsko vstoupí na její mapu')`: domy dál než 150 m od okraje vstupu, takže `warnTick` = takt vstupu, `by === 'lord'` a `army-warned` v témž taktu.
  - `it('vojvoda na výjezdu – varuje vesničan jako dřív')`: `warnTick` jako bez `lordId`.
  - `it('ves varovaná poslem: vstup s vojvodou doma varování jen uspíší')`.
  - `it('po 1 / 7 / 40 taktech přes JSON = vcelku')`.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace**
  - V `sightAlarms` pro ves na mapě vojska (ne `harmless`, ještě nevarovanou) nejdřív `ownerOf(villageId, ctx)`.
  - Když `lordHomeAt`: spatření `{ run: 0, at }`, kde `at` je poloha skupiny nejblíž `villageCentre` (shoda → první v `armyEyes`), a `by = 'lord'`.
  - Jinak `spot` jako dnes. Zápis a zkrácení `warnTick` beze změny.
- [ ] **Krok 4:** PASS + `npm run test:slow`.
- [ ] **Krok 5: Docs.** `docs/code/war.md` – Oči vsi (Ú2) a Hráč ve vsi a mimo ni.
- [ ] **Krok 6:** commit `feat(game): vojvoda doma vidí vojsko při vstupu na mapu`.

### Úloha 5: Kdo rozhoduje – hráč ve vsi, nebo nastavení (opus)

**Files:**
- Modify: `alarm-types.ts` (`askedTick?: number`, `presenceTick?: number | null`)
- Modify: `campaign-types.ts` (IntentBody `{ kind: 'alarm-presence'; village: string; seenTick: number | null }`)
- Modify: `alarm.ts:28-38` (`AlarmIntentBody`, `isAlarmIntent`)
- Modify: `ticks.ts` (přesun `absentTicks` z `campaign.ts:529`)
- Modify: `rules-war.ts` (`alarm.presenceRefreshTicks: 86`; `playerGraceTicks` zatím nechat – smaže Úloha 8)
- Modify: `alarm-steward.ts:37-59, 73-88, 142-154`, `campaign.ts:436-456` (`applyAlarm`)
- Test: `war/__tests__/alarm-steward.test.ts`

**Interfaces:** Consumes `lordHomeAt`. Produces:
```ts
export function absentTicks(world: WorldClock): number; // ticks.ts, 1 herní den
/** Kdo za ves v taktu rozhoduje – Rozhodnutí plánu 3; 'ask' = zapsat askedTick a čekat. */
export function deciderOf(s: CampaignState, v: AlarmVillage, tick: number,
  ctx: TickContext): 'steward' | 'player' | 'ask';
```

- [ ] **Krok 1: Failing testy** (přepiš případy lhůty 344 taktů)
  - `it('vojvoda mimo ves – správce hned v taktu varování')` (bez `lordId`).
  - `it('vojvoda doma bez odpovědi – ves čeká a zapíše askedTick')`.
  - `it('odpověď seenTick null – správce v taktu odpovědi')`.
  - `it('hráč u hry – ves nerozhoduje; po absentTicks bez přítomnosti správce')`: záměr `alarm-presence` v T se `seenTick: T`. Do `T + absentTicks` platí `decided === undefined`, v taktu `T + absentTicks + 1` `decided === 'steward'`.
  - `it('každý záměr alarm-* od vlastníka je přítomnost')`.
  - `it('vojvoda vyběhne jako posel – správce v témž taktu')` (Review Focus 2).
  - `it('hradiště hráče: doména podle téhož pravidla')`.
  - `it('starý bod bez askedTick a presenceTick – zeptá se')` (Review Focus 5).
  - `it('po 1 / 7 / 40 taktech přes JSON = vcelku')`.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace**
  - `deciderOf` podle Rozhodnutí 3. `decideVillage` a `decideDomain` volají `deciderOf` místo `stewardDecides`: `'ask'` → `v.askedTick = tick`, `'player'` → nic, `'steward'` → dnešní pravidlo.
  - `applyAlarm` po kontrole vlastníka a varování: `delete v.askedTick`.
  - `presenceTick`: u `alarm-presence` jako `max(v.presenceTick ?? null, seenTick)`, přičemž null jen když nic není. U ostatních záměrů `max(…, s.tick)`.
  - `alarm-presence` dál nic nedělá.
- [ ] **Krok 4:** PASS + `npm run test:slow` + `alarm-types.test.ts` (zlatý otisk bez varování beze změny).
- [ ] **Krok 5: Docs**
  - `docs/design/war.md` – Varování: přeškrtni „ves bez správce čeká … 1 herní den“, bod Lhůta hráče a v Čísla „hráč volí 1 herní den (344 taktů), pak správce“. Doplň přítomnost a `presenceRefreshTicks` (návrh Clauda).
  - `docs/code/war.md` – „Kdo rozhoduje – správce, NPC rody a lhůta hráče (Ú11)“ přepsat.
- [ ] **Krok 6:** commit `feat(game): varovaná ves čeká jen na přítomného hráče s vojvodou doma`.

### Úloha 6: Worker odpovídá na přítomnost (opus)

**Files:**
- Create: `packages/game/src/application/defender-presence.ts`, test `application/__tests__/defender-presence.test.ts`
- Modify: `packages/game/src/application/step-campaigns.ts:47-75` (`StepCampaignsDeps.presence?`), `stepOne` (`:342-406`)
- Modify: `apps/worker/src/main.ts` (`presence: createPresenceRepository(db)`)
- Test: `application/__tests__/alarm-world.test.ts`

**Interfaces:** Consumes `PresenceRepository` (Úloha 2), pole a záměr z Úlohy 5. Produces:
```ts
/** Záměry `alarm-presence` pro vsi, které se ptají nebo potřebují obnovit přítomnost; vrátí počet. */
export async function answerPresence(
  deps: { campaigns: Pick<CampaignRepository, 'addIntent'>;
          presence?: Pick<PresenceRepository, 'lastSeen'>; world: WorldClock },
  input: { campaignId: string; state: CampaignState; intents: readonly CampaignIntent[] },
): Promise<number>;
```

- [ ] **Krok 1: Failing testy**
  - `it('ves se ptá – jeden záměr na takt state.tick + 2 od vlastníka')`.
  - `it('čeká-li už záměr alarm-presence té vsi za state.tick – žádný další')`.
  - `it('bez portu – seenTick null')`.
  - `it('obnova po presenceRefreshTicks jen s novější přítomností')`.
  - `it('lastSeen novější než takt – seenTick oříznutý na takt záměru')` (Review Focus 1, worker o 2000 taktů pozadu).
  - Smyčka `alarm-world.test.ts`:
    - přítomný hráč (zápis každých 40 taktů) → ves nerozhodne 700 taktů;
    - nepřítomný → `decided === 'steward'` do 2 kol od vstupu;
    - odejde → správce po `absentTicks` od posledního zápisu.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace**
  - Vsi s `owner.playerId`, `!owner.npc` a `decided === undefined`, které mají `askedTick`, nebo číselné `presenceTick` s `state.tick − presenceTick ≥ presenceRefreshTicks`.
  - Jedno `lastSeen` pro všechny vlastníky. `seenTick = min(tickOfMs(ms), state.tick + INTENT_LEAD_TICKS)`. Obnovu přeskoč, když `seenTick ≤ presenceTick`.
  - Volat ve `stepOne` po `computeCampaign` v obou větvích (paměť i uložení, ne `stale`). Ověř testem, že záměr za `state.tick` paměť kola (`memoIntentsKey`) nezneplatní.
- [ ] **Krok 4:** PASS + `npm run test:slow`.
- [ ] **Krok 5: Docs.** `docs/code/war.md` – Hráč ve vsi a mimo ni: odpověď workeru. `docs/code/worker.md` jedna věta u smyčky tažení.
- [ ] **Krok 6:** commit `feat(game): worker hlásí tažení přítomnost obránce`.

### Úloha 7: Vzdání vojvody v tažení (opus)

**Files:**
- Modify: `campaign-types.ts` (IntentBody `{ kind: 'lord-surrender'; village: string }`; `CampaignReturnReason` + `'yielded'`)
- Modify: `alarm.ts` (`isAlarmIntent`), `battle.ts` (`BattleState.yielded?: number`)
- Modify: `campaign.ts` – `applyAlarm`, `raidResultOf` (`:1167`), helper `yieldLord`
- Modify: texty důvodu návratu na webu (`grep -rn "'routed'" apps/web/lib`)
- Test: `war/__tests__/lord-surrender.test.ts`

**Interfaces:** Consumes `lordHomeAt`, presence z `applyAlarm` (Úloha 5). Produces záměr `lord-surrender`, důvod `'yielded'`.

- [ ] **Krok 1: Failing testy** (fixtury jako `captives-campaign.test.ts`, `alarmOf` s `lordId`)
  - `it('boj běží – v taktu záměru návrat yielded, vojvoda zajat')`:
    - `phase === 'returning'`, `returnReason === 'yielded'`;
    - `raid-result` cíli s `captured: [lordId]`, `captorVillageId === assembly.villageId`;
    - `loot.prisoners` obsahuje vojvodu;
    - z vsi žádná kořist ani odvedení.
  - `it('útočník zvolil kill – vojvoda přesto zajat')`.
  - `it('vojsko na mapě cíle ještě pochoduje – zajetí bez boje')`.
  - `it('odmítne: vojvoda pryč, cizí hráč, ves není cíl, nájezd rozhodnut, vojsko mimo mapu cíle')`.
  - `it('dva záměry v jednom taktu – platí první')` (Review Focus 3).
  - `it('po 1 / 7 / 40 taktech = vcelku')`.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace**
  - `yieldLord(s, lordId, ctx, out)`:
    - s bojem: `battle.yielded = lordId`, pak `turnBack(s, 'yielded')`. `reportRaid` v témž taktu přidá vojvodu do `captured` přes `raidResultOf`, mimo `s.surrendered`.
    - bez boje: `post` `raid-result` jen s `captured`, `s.raidDay = s.day`, vězeň přes `capturedPrisoners`, `s.captives.push`, `turnBack`.
  - Podmínky viz Rozhodnutí 5.
- [ ] **Krok 4:** PASS + `npm run test:slow`.
- [ ] **Krok 5: Docs.** `docs/code/war.md` – Zajetí a výkupné: bod Vzdání vojvody.
- [ ] **Krok 6:** commit `feat(game): vzdání vojvody ukončí nájezd zajetím`.

### Úloha 8: Pohled, příkaz a ikona obránce (Sonnet)

**Files:**
- Modify: `packages/game/src/application/alarm-view.ts` (`AlarmView`, `ALARM_BLOCKED`, `commandAlarm`), `rules-war.ts` (smazat `alarm.playerGraceTicks`)
- Modify: `apps/web/lib/alarm-input.ts`, `apps/web/lib/alarm-view.ts`, `apps/web/components/game/hud/AlarmButtons.tsx`, `apps/web/app/dev/panels/dev-panels.ts`
- Test: `application/__tests__/alarm-view.test.ts`, `apps/web/lib/__tests__/alarm-view.test.ts`, `hud/__tests__/AlarmButtons.behavior.test.tsx`

**Interfaces:**
- Consumes `lord-surrender` (Úloha 7), `lordAtHome`.
- Produces:
  - `AlarmView.graceDays` zmizí;
  - `AlarmView.yieldLord: { blocked: AlarmViewBlock | null } | null` (null = vojvoda tu nežije);
  - příkaz `{ kind: 'yield-lord' }`;
  - nové důvody `lordAway` „Vojvoda není doma.“, `notRaided` „Vojsko ještě nepřišlo.“ (návrh Clauda).

- [ ] **Krok 1: Failing testy**
  - Pohled: vojvoda doma a vojsko na mapě cíle → `blocked: null`; vojvoda na výjezdu → `lordAway`; ves bez hráčova muže → `null`.
  - `commandAlarm` `yield-lord` → záměr `lord-surrender` na takt teď + 2.
  - `it('druhé tažení na touž ves – vojvoda už se vzdal v prvním → lordAway')` (Review Focus 4 – kontrolní body z `activeAlarming` s `battle.yielded` nebo zajatcem s klíčem vojvody).
  - `AlarmButtons`: ikona `alarm-yield-lord` (`/icons/war/white-flag.png`), první stisk ji připraví (`data-armed`), druhý pošle příkaz. Zašedlá s důvodem v `Tooltip`. Lhůta hráče se nezobrazuje.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace.** Popisek u kurzoru „Vzdát se – vojvoda půjde do zajetí, nájezd skončí.“ (návrh Clauda).
- [ ] **Krok 4:** PASS (`npm run test`).
- [ ] **Krok 5: Docs.** `docs/code/web-ui.md` – Varování a útěk v rozhraní; `docs/code/war.md` – Pohled na varování (bez `graceDays`).
- [ ] **Krok 6:** commit `feat(web): vzdání vojvody – bílá vlajka v panelu dvorce`.

### Úloha 9: Scéna – obránce s vojvodou doma vidí celé vojsko (Sonnet)

**Files:**
- Modify: `packages/game/src/domain/war/scene-view.ts` (`warSceneView` – volba `seesAll?: boolean`)
- Modify: `packages/game/src/application/war-scene.ts` (`warSceneFor`)
- Test: `war/__tests__/scene-view.test.ts`, `application/__tests__/war-scene.test.ts`

**Interfaces:** Consumes `lordAtHome`, `alarmVillage`, `AlarmVillage.owner.lordId`.

- [ ] **Krok 1: Failing testy**
  - `seesAll` ukáže skupinu mimo dohled domů.
  - `warSceneFor`: vojsko, které ves jen míjí, je s vojvodou doma vidět. S vojvodou na výjezdu jen v dohledu (dnešní stav).
  - Boj má dál přednost.
- [ ] **Krok 2:** FAIL.
- [ ] **Krok 3: Implementace**
  - Obránce bere tažení z `activeAlarming(villageId)` místo `activeAgainst` a nechá jen ta se skupinou na políčku vsi nebo s bojem. Pořadí: boj > cíl > ostatní.
  - `seesAll` = ves varovaná (`warnTick ≤ state.tick`) a `lordAtHome(stav obránce z mezipaměti defenders, owner.lordId, den)`.
- [ ] **Krok 4:** PASS + `npm run test:e2e` (konec větve, sériově).
- [ ] **Krok 5: Docs.** `docs/code/war.md` – Ve scéně: pohled obránce.
- [ ] **Krok 6:** commit `feat(game): vojvoda doma vidí cizí vojsko na své mapě celé`.
