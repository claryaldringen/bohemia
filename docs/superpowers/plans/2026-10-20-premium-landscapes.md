# Prémiové krajiny – plán (kroky 1 a 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cíl:** Generátor umí všech 19 prémiových typů krajiny jako krajinu a data a hra jeden typ přidělí
každému lidskému hráči. NPC a uložená sídla mají průměrnou krajinu.

**Architektura:** Typ prémie je třetí vstup generátoru vedle seedu a verzí vrstev. Je to čistá
funkce, stejně na serveru i v prohlížeči. Prémiový průchod upraví terén, vegetaci, úrodnost
a překážky průměrné krajiny a vrátí prvky typu (naleziště, brod, průsmyk…) jako data. Typ se
uloží u sídla (`settlement.premium_type`, null = průměrná). Hra ho přidělí při prvním vstupu
hráče a Začít znovu ho zachová.

**Stack:** TypeScript (`packages/game` – doména, det-math), Drizzle a PostgreSQL (`packages/db`),
Next.js a Babylon (`apps/web`), Vitest.

**Spec:** [docs/design/premium-landscapes.md](../../design/premium-landscapes.md) (schváleno 20. 10. 2026).

**Předpoklad:** začíná se až po sloučení `feat/stream-rocks` (skály u potoka a ostrožny – nová
verze terénu a překážek). Průměrná krajina NPC = jeho `CURRENT_LAYER_VERSIONS`. Typy pevnost,
brod pod vyvýšeninou a soutok používají jeho ostrožny. Jména funkcí ostrožen si po sloučení
ověř (zpráva `scratchpad/briefs/stream-rocks-report.md`).

## Global Constraints

- Uložená sídla (i Vlkov) se generují **bit po bitu stejně** – zlaté otisky krajiny a překážek
  všech dosavadních verzí beze změny (`generate.test.ts`, `obstacles.test.ts`, `landscape-transfer.test.ts`).
- Soubory generátoru a vrstvy překážek: jen deterministická matematika (`det-math.ts`, ESLint
  zakazuje Math.sin/cos/atan2/hypot/log a `**`).
- Prémiová krajina projde pásmem srovnatelnosti (`checkBand`) jako ostatní – výhoda je navíc.
- Pravidla simulace vsi se mění jen v úloze 7 (účinky „hned“ přes existující mechaniky).
- UI jako 0 A.D.: ikony a čísla, slova jen v názvu a popiscích. Jediná věta při vstupu do hry je
  výjimka ze specifikace.
- Čeština s en dash „–“. Rozhodnutí v docs jako „návrh Clauda“ (nikdy „koordinátor“).
  Commity Conventional Commits česky s `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Bez kalibrace vsi (`measure-village`) – patří do kroku 4. Měření generátoru
  `measure-landscapes` ano.
- Kontrola každé úlohy: `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx vitest run --testTimeout=120000` (packages/game) a `npx vitest run --testTimeout=60000`
  (apps/web).

## Review Focus

1. Prémiový průchod pokazí pásmo a generátor na 16 pokusů selže, nebo některý typ skoro nikdy
   nevyjde. Úloha 2: každý typ projde pásmem do `MAX_ATTEMPTS` na ≥ 95 % z 300 seedů.
2. Prvek typu (řeka, průsmyk, pevnost, lom…) zabere místo vsi nebo louky u ní. Úloha 2: místo
   vsi (`villageSite`) a jeho okruh zůstanou volné u všech typů.
3. Prohlížeč dostane jinou prémiovou krajinu než server. Úloha 2: přenos krajiny nese typ
   a `landscape-transfer.test.ts` ověří shodu prvků a vrstvy překážek.
4. Začít znovu přelosuje typ. Úloha 8: restart dá nové sídlo se stejným typem.
5. Sídlo uložené bez `premium_type` se načte jinak. Úloha 8: krajina starého sídla je stejná
   jako dnes (otisk).

---

### Úloha 1: Katalog typů a datový model

**Soubory:**

- Vytvořit: `packages/game/src/domain/landscape/premium/types.ts`, `packages/game/src/domain/landscape/premium/catalog.ts`
- Upravit: `packages/game/src/domain/landscape/index.ts` (export)
- Test: `packages/game/src/domain/landscape/premium/__tests__/catalog.test.ts`

**Rozhraní:**

- Produkuje:
  - `type PremiumType`, union těchto 19 id:
    - `'deep-gold'` – hluboká ložiska drahých kovů;
    - `'gold-stream'` – zlatonosný potok;
    - `'navigable-river'` – splavná řeka;
    - `'fertile'` – velmi úrodná krajina;
    - `'ford-hill'` – vyvýšenina nad brodem se stezkou;
    - `'mountain-pass'` – průsmyk se stezkou;
    - `'iron-ore'`, `'fine-clay'`, `'oak-beech'`, `'floodplain'`, `'south-slopes'`;
    - `'sacred-mountain'`, `'sacred-spring'`, `'confluence'`, `'natural-fortress'`;
    - `'salt-spring'`, `'wild-bees'`, `'game-furs'`, `'building-stone'`.
  - `PREMIUM_TYPES: readonly PremiumType[]` (v tomto pořadí).
  - `PREMIUM_CATALOG: Record<PremiumType, PremiumTypeInfo>`, kde `PremiumTypeInfo = { name: string; skeleton: boolean; anchor: 'hillfort' | 'market-town' | 'mining-town' | 'port' | 'large-village' | 'cult-site' | 'castle'; immediate: boolean }`. Názvy a kotvy z tabulek spec. `skeleton` je true u `navigable-river`, `ford-hill`, `mountain-pass` a `confluence`. `immediate` je true u typů, které mají účinek „hned“ (úloha 7).
  - `interface PremiumSite { kind: PremiumSiteKind; x: number; z: number; outline?: readonly [number, number][]; line?: readonly [number, number][] }`. `PremiumSiteKind` je union: `'deposit'`, `'gold-placer'`, `'river'`, `'port'`, `'ford'`, `'route'`, `'pass'`, `'summit'`, `'spring'`, `'confluence'`, `'promontory'`, `'salt'`, `'bee-trees'`, `'hunting-ground'`, `'quarry'`, `'iron-ore'`, `'clay'`, `'slope'`, `'meadow'`, `'woodland'`.
  - `interface PremiumFeatures { type: PremiumType; sites: readonly PremiumSite[] }`.

- [ ] **Krok 1:** Test `katalog má 19 typů, typy kostry a kotvy`. Ověř: `PREMIUM_TYPES.length === 19`, množinu `skeleton` (přesně 4 typy), každý typ má neprázdný `name` a kotvu, `PREMIUM_CATALOG['deep-gold'].immediate === false` a `PREMIUM_CATALOG['fertile'].immediate === true`.
- [ ] **Krok 2:** Spusť test, má selhat (modul neexistuje).
- [ ] **Krok 3:** Napiš typy a katalog. Názvy česky podle spec, např. „Hluboká ložiska drahých kovů“, „Zlatonosný potok“.
- [ ] **Krok 4:** Spusť test, má projít. Pak celou kontrolu (Global Constraints).
- [ ] **Krok 5:** Commit `feat(game): katalog prémiových krajin – 19 typů a data prvků`.

### Úloha 2: Prémiový průchod generátoru, pásmo a přenos

**Soubory:**

- Vytvořit: `packages/game/src/domain/landscape/premium/generate.ts`, `packages/game/src/domain/landscape/premium/check.ts`
- Upravit: `generate.ts` (`generateLandscapeAttempt`, `generateAcceptedLandscape`), `types.ts` (`Landscape.premium?: PremiumType`), `band.ts` (jen volání kontroly typu), `apps/web/lib/landscape-transfer.ts`
- Test: `premium/__tests__/generate.test.ts`, `__tests__/generate.test.ts` (otisky beze změny), `apps/web/lib/__tests__/landscape-transfer.test.ts`

**Rozhraní:**

- Spotřebuje: úlohu 1. Ostrožny z `feat/stream-rocks`.
- Produkuje:
  - `generateLandscapeAttempt(attemptSeed: number, versions: LayerVersions, premium?: PremiumType): Landscape` – bez `premium` přesně jako dnes.
  - `generateAcceptedLandscape(seed, versions?, premium?)`.
  - `premiumFeaturesOf(landscape: Landscape): PremiumFeatures | null` – čistá funkce s mezipamětí podle objektu krajiny, jako `obstaclesOf`.
  - `checkPremium(landscape: Landscape): { ok: boolean; reason?: string }` – prvek typu existuje a nezasahuje do místa vsi.
  - `PREMIUM_LAYER_VERSION = 1` – verze prémiového průchodu, uložená v `LayerVersions.premium?: 1`.

- [ ] **Krok 1:** Test `bez prémie bit po bitu jako dřív`. Otisk dosavadních verzí v `generate.test.ts` se nezmění, test pouze rozšiř o volání se třetím parametrem `undefined`.
- [ ] **Krok 2:** Test `každý typ projde pásmem na 300 seedech`. Pro každý `PremiumType` má `generateAcceptedLandscape(seed, CURRENT_LAYER_VERSIONS, type)` uspět na ≥ 95 % seedů `1..300`, `checkPremium(...).ok` a `premiumFeaturesOf(l)!.type === type`.
- [ ] **Krok 3:** Test `místo vsi zůstane volné`. U každého typu žádný `PremiumSite` s `outline` ani `line` nezasahuje do kruhu 120 m kolem `villageSite`. Výjimka je `'route'`, ta smí vést k okraji okruhu, ne přes něj.
- [ ] **Krok 4:** Test `prohlížeč dostane stejnou prémiovou krajinu`. V `landscape-transfer.test.ts`: zakóduj a dekóduj krajinu s `premium: 'mountain-pass'` a ověř, že `premiumFeaturesOf` i `obstaclesOf` vyjdou na obou stranách stejně.
- [ ] **Krok 5:** Kostra průchodu: rozvětvení podle typu, samotné typy jsou v úlohách 3–5. Typy, které ještě nejsou napsané, vracejí `null` prvky a test z kroku 2 je dočasně přeskočí (`it.todo` po typech).
- [ ] **Krok 6:** Kontrola, commit `feat(game): prémiový průchod generátoru – typ jako vstup krajiny, pásmo a přenos`.

### Úloha 3: Typy půdy a lesa

`fertile`, `oak-beech`, `floodplain`, `south-slopes`, `game-furs`, `wild-bees`.

**Soubory:** `premium/soil-forest.ts` a testy.

**Rozhraní:** Spotřebuje úlohu 2. Produkuje generování těchto typů a jejich `PremiumSite` (`'meadow'`, `'woodland'`, `'slope'`, `'hunting-ground'`, `'bee-trees'`).

**Hodnoty (návrh Clauda, doladí kalibrace v kroku 4):**

| Typ            | Úprava krajiny                                                           | Test                                                |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `fertile`      | přirozená úrodnost políček do 600 m od vsi +15 bodů (strop 100)          | průměr do 600 m ≥ průměrné krajiny téhož seedu + 12 |
| `oak-beech`    | podíl dubu a buku ve vrstvě překážek do 900 m ≥ 80 % stromů lesa         | podíl dubu a buku ≥ 0,8                             |
| `floodplain`   | louka v pásu ±60 m od potoka, plocha louky do 600 m +30 % proti průměrné | plocha louky ≥ 1,25×                                |
| `south-slopes` | aspoň 2 ha louky se svahem 5–15 % ke slunci (`SUN_RAYS`) do 500 m        | `'slope'` site s plochou ≥ 2 ha                     |
| `game-furs`    | souvislý les ≥ 60 ha a mokřad u potoka                                   | `'hunting-ground'` s obrysem ≥ 60 ha                |
| `wild-bees`    | ≥ 12 starých dubů a lip s dutinou (brtě) ve vrstvě překážek do 900 m     | `'bee-trees'` ≥ 12 stromů                           |

- [ ] **Krok 1:** Testy z tabulky (každý typ zvlášť).
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Úpravy krajiny.
- [ ] **Krok 4:** Testy projdou a test pásma z úlohy 2 pro tyto typy už není `todo`.
- [ ] **Krok 5:** Commit `feat(game): prémiové typy půdy a lesa`.

### Úloha 4: Typy vody

`navigable-river`, `gold-stream`, `confluence`, `ford-hill`, `salt-spring`, `sacred-spring`.

**Soubory:** `premium/water.ts`, `premium/river.ts` a testy. Úpravy osy potoka (`stream.ts`, `stream-geometry.ts`) dělej jen přes nové verze, staré beze změny.

**Rozhraní:** Produkuje `PremiumSite` typů `'river'` (`line` od okraje k okraji), `'port'`, `'ford'`, `'route'` (`line` od okraje k okraji přes brod), `'confluence'`, `'promontory'` (ostrožna z `feat/stream-rocks`), `'gold-placer'`, `'salt'` a `'spring'`.

**Rozhodnutí:**

- **Řeka** je nový tok vedle potoka, široký 12–20 m (potok zůstává, u `confluence` jako přítok). Vstup a výstup na náhodných okrajích, protože sdílená mřížka zatím není (spec – kostra, vývojová verze). Brody jen na 1–2 místech. Tok má být pro vesnici překážkou jako dnešní voda. Pásmo ho musí unést: les a louka u vsi beze změny.
- **`ford-hill`:** brod na řece a nad ním ostrožna nebo pahorek s převýšením ≥ 15 m. Stezka (`'route'`) vede přes brod od okraje k okraji, nejblíž 150 m od místa vsi.
- **`gold-stream`:** 3–6 náplavů (`'gold-placer'`) na vnitřní straně oblouků potoka.
- **`salt-spring`** a **`sacred-spring`:** pramen do 700 m od vsi, mimo pole a les vsi. U `sacred-spring` skalka nebo háj.

- [ ] **Krok 1:** Testy po typech:
  - řeka vede od okraje k okraji a je ≥ 12 m široká;
  - brod leží na řece;
  - ostrožna u `ford-hill` je ≥ 15 m nad brodem a stezka vede přes brod;
  - náplavy leží na vnitřní straně oblouku;
  - pramen je do 700 m.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Generování typů.
- [ ] **Krok 4:** Testy projdou, včetně pásma.
- [ ] **Krok 5:** Commit `feat(game): prémiové typy vody – řeka, brod se stezkou, soutok, zlatonosný potok, prameny`.

### Úloha 5: Typy reliéfu a nalezišť

`mountain-pass`, `sacred-mountain`, `natural-fortress`, `building-stone`, `deep-gold`, `iron-ore`, `fine-clay`.

**Soubory:** `premium/relief.ts`, `premium/deposits.ts` a testy.

**Rozhodnutí:**

- **`mountain-pass`:** dva hřbety po stranách mapy s převýšením ≥ 60 m nad sedlem. Stezka (`'route'`) od okraje k okraji přes sedlo (`'pass'`).
- **`sacred-mountain`:** vrch ≥ 50 m nad okolím s vrcholovou plošinou (`'summit'`, plocha ≥ 0,5 ha), do 1 km od vsi.
- **`natural-fortress`:** jistá ostrožna z `feat/stream-rocks` s plochou ≥ 1 ha, nebo místo chráněné bažinou.
- **`building-stone`:** skalní stěna (`'quarry'`) s výchozy.
- **`deep-gold`:** skalnatý hřbet s rudnými výchozy (`'deposit'`).
- **`iron-ore`:** rudiště s bohatou rudou (`'iron-ore'`) do 500 m od vsi.
- **`fine-clay`:** hliniště (`'clay'`) u potoka do 500 m.

Naleziště jsou zatím jen data a vzhled, mechanika přijde později.

- [ ] **Krok 1:** Testy převýšení, ploch a vzdáleností z rozhodnutí výše.
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Generování typů.
- [ ] **Krok 4:** Testy projdou, včetně pásma.
- [ ] **Krok 5:** Commit `feat(game): prémiové typy reliéfu a nalezišť`.

### Úloha 6: Ukázka a vzhled ve scéně

**Soubory:**

- `apps/web/app/dev/landscape/` – výběr typu a seedu (`?premium=<typ>`);
- nové kreslení prvků `apps/web/lib/scene/premium-sites.ts` (řeka v rámci vody, náplavy, rudné výchozy, lom, pramen, brtě, sedlo – existující modely 0 A.D. nebo procedurálně);
- minimapa.

**Rozhraní:** Spotřebuje `premiumFeaturesOf`. Řeka jde stejnou cestou jako potok (voda, koryto, brody).

- [ ] **Krok 1:** `/dev/landscape?seed=42&premium=mountain-pass` ukáže typ. Tlačítka typů a „průměrná“ pro porovnání na stejném seedu.
- [ ] **Krok 2:** Každý typ je z výchozí kamery poznat. Snímky všech 19 typů ulož do scratchpadu (harness `scratchpad/zoom-perf/harness/`).
- [ ] **Krok 3:** Změř nejdelší snímek. Řeka nesmí zdražit vodu nad dnešní stav o víc než 20 %.
- [ ] **Krok 4:** Commit `feat(web): prémiové krajiny ve scéně a ukázka na /dev/landscape`.

### Úloha 7: Účinky „hned“ přes existující mechaniky

**Soubory:**

- `smith-supply.ts` (`iron-ore`: 4 kg rudy na kg nástrojů místo 8, rudiště na prvku `'iron-ore'`);
- hliniště hrnčíře (`fine-clay`: poloviční hlína a práce na kg keramiky);
- `orchard.ts` (`south-slopes`: úroda sadu na prvku `'slope'` × 1,25);
- `happiness.ts` a `sacred.ts` (`sacred-mountain` a `sacred-spring` jako posvátná místa – štěstí jako háj, nejvýš do stropů posvátných míst);
- `foundVillage` a `paths/roads.ts` (`ford-hill`, `mountain-pass`: `'route'` → pevná vyšlapaná cesta po čáře a hotová zemská stezka v obou směrech, kam vede – obchod se sousedy hned, spec – stezka kostry).

`fertile`, `oak-beech` a `floodplain` působí samy přes krajinu.

**Rozhraní:** Simulace dostává `premiumFeaturesOf(landscape)` tam, kde už dnes dostává krajinu. Bez prémie se nic nemění.

- [ ] **Krok 1:** Testy:
  - kovář na `iron-ore` potřebuje 4 kg rudy;
  - hrnčíř na `fine-clay` polovinu;
  - sad na svahu × 1,25;
  - posvátná hora přidá štěstí;
  - ves na `ford-hill` má od založení cestu a hotovou stezku v obou směrech stezky;
  - **ves bez prémie bit po bitu stejně** (zlaté otisky vsi).
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat(game): účinky prémiových krajin přes existující mechaniky`.

### Úloha 8: Přidělení typu hráči

**Soubory:**

- `packages/db/src/schema/settlement.ts` (`premiumType: text('premium_type')`, null) a migrace `npm run db:generate`;
- adaptér repozitáře;
- `application/settlements.ts` (`Settlement.premiumType: PremiumType | null`, `SettlementRepository.premiumTypeCounts(): Promise<Record<PremiumType, number>>`, `lastPremiumType(playerId): Promise<PremiumType | null>` – i z archivovaných);
- `enter-game.ts`, `restart-game.ts`;
- nové `domain/landscape/premium/assign.ts`;
- `settlementLandscape` (generuje s typem).

**Rozhraní:**

- Produkuje `choosePremiumType(seed: number, counts: Record<PremiumType, number>): PremiumType` – nejméně zastoupený typ, při shodě podle seedu.
- `enterGame` pro nové sídelní sídlo: typ = `lastPremiumType(player) ?? choosePremiumType(seed, counts)`. `layerVersions` s `premium: 1`.
- Odchod na novou mapu (`leaveVillage`) zakládá sídlo s `premiumType: null`.

- [ ] **Krok 1:** Testy (in-memory porty):
  - první vstup dá typ;
  - typy se rozdělí rovnoměrně (19 hráčů = 19 různých typů);
  - Začít znovu dá nové sídlo se stejným typem;
  - nová mapa při odchodu je průměrná;
  - sídlo bez `premium_type` se generuje jako dnes (otisk).
- [ ] **Krok 2:** Testy mají selhat.
- [ ] **Krok 3:** Implementace a migrace. `npm run test:db` pro adaptér.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit `feat: přidělení prémiové krajiny lidskému hráči`.

### Úloha 9: Co hráč vidí a dokumentace

**Soubory:**

- `apps/web/components/game/` – při prvním vstupu jedna věta s ikonou typu (mizející řádek jako upozornění, `NoticeLines`);
- výběr prvku kliknutím (vzor rudiště – `village-picking.ts`, panel s ikonou typu, „hned“ a „později“);
- ikony typů `tools/blender/icons.py`;
- `docs/design/premium-landscapes.md` (výsledky měření, skutečná čísla);
- `docs/design/landscape.md` (verze);
- `CLAUDE.md`.

- [ ] **Krok 1:** Statický render panelu prvku a test hlášky při prvním vstupu.
- [ ] **Krok 2:** `measure-landscapes` pro průměrnou krajinu a pro každý typ: podíl na první pokus, čas, louky do 600 m. Tabulku zapiš do spec.
- [ ] **Krok 3:** Docs.
- [ ] **Krok 4:** Commit `feat(web): prémiová krajina v rozhraní; docs`.

## Navazuje (mimo tento plán)

- **Krok 3 spec – kostra světa:** až bude návrh sdílené mřížky světa (vazalství). Pak se místní vstupy a výstupy řeky a stezky nahradí kostrou.
- **Krok 4 – kalibrace:** `measure-village` na typech s mechanikou proti průměrné krajině a plánované křivky ostatních typů. Velikost úprav z úloh 3–7 se doladí na cíl. Pozdní start: hodnota od startu hráče do roku 1500 – velikost prvků (naleziště…) podle roku startu (spec – Kalendář světa).
- **Krok 5 – mechaniky využití:** každá jako vlastní návrh – rýžování, hornictví, doprava po řece, mýto, sůl, brtnictví, lov, kámen, vinice.
