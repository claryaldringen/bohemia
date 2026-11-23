# Obchod 1 – konec smyšlených sousedů – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves přestane brát ze smyšleného okolí a dávat mu (obchod a panel obchodu, nákup nástrojů, keramiky, dřevěného nářadí, vozů a osiva, cizí kovář a kování vozů u souseda, koně, dobytek a lidé od souseda, obilí správce, sňatky a manželky z okolí); lidé se berou mezi sebou, výpravy a nákupy na cestě doběhnou a starší vsi ztratí uložené zásoby sousedů (issue #11, plán 1 ze 6).

**Architecture:**

- Mažou se jen **začátky** vazeb na okolí (kroky dne, rozhodnutí správce, use-case, panel). **Postup a návrat** výprav (`workExpeditions`, `finishExpeditions`), nákupů (`walkPurchases`, `finishPurchases`) a cest pro kování (`IronTrip`) zůstávají – to, co je na cestě, doběhne (markets.md – Pravidla 10) a výpravy dál nesou zásilky vazalů (`TradeExpedition.kind = 'shipment'`).
- Generátor smyšlených sousedů (`trade/neighbours.ts`) zmizí; seznamy zboží přejdou do `trade/goods.ts`. Převod `fictional-neighbours` (poslední v `VILLAGE_MIGRATIONS`) smaže `trade.neighbours`. Jméno dřívějšího souseda pro staré záznamy kroniky a karavany na cestě dá `legacyNeighbourName` (týž los jako dnešní `neighbourOf(…).name`).
- Přes skutečnou sousední ves jde v plánu 1 jen popisek konce cesty na kraji mapy (Rozhodnutí 2); vše ostatní se vrátí se skutečnými vsemi v plánu 2 (trh) a 3 (vesničané, správce, zakázky, sňatky).

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `apps/web` (Next.js 16, React 19), Playwright (projekty chromium a worker).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Pravidla 1 a 10, Co se ověří bod 1, Martinova rozhodnutí.
- `docs/design/neighbours.md` – Martinova rozhodnutí („Než syn odejde, ves neobchoduje“, Sňatky, Řemeslníci souseda), Pravidla 11, 13 a 14.
- Sonda D118 `.superpowers/sdd/2026-11-14-fixes/d118-no-trade-report.md` (8 funkcí, co se bez nich stane) a `neighbours-builder-check.md` (oddíly o kódu, D5).
- Mapa kódu: `docs/code/village-trade.md` (Sousedé a obchod, Dobytek, Koně, Nákup osiva, Výměna lidí), `village-crafts.md` (Nákup u sousedů, Vozy u nákupu u sousedů, Kování vozů), `village-people.md` (Manželky, Sňatky), `village-livestock.md` (`horse-shoeing.ts`), `village-steward.md` (Obilí a lov v nouzi), `village-fields.md` (Osivo pro ves bez zásob), `village-core.md` (Převody starších vsí), `web-ui.md`.

## Global Constraints

- **Předpoklad:** ve `feat/landscape` je sloučená větev `feat/no-kin-marriage` – `bestMatch` (`people/marriage.ts`) nevolá `areCloseKin` (Martin 23. 11. 2026: „Vynechme příbuznost. Je to mechanika navíc“, „Nehlídat nic“). Jinak Úlohu 1 nezačínat a ozvat se. Práce ve větvi `feat/markets-1` z `feat/landscape`.
- Martin 22. 11. 2026: „Nijak. Ves by měla být schopná přežít a rozvíjet se dle současných pravidel i bez obchodu“; „dokud bude vesnice bez spojení s okolím, ať se lidé berou mezi sebou“. Ves v plánu 1 nemá spojení s nikým – neobchoduje, nekupuje, nikoho nedá ani nepřijme.
- Žádná nová pravidla (meze, zásoby, náhradní zdroje, pohodlné rozkazy). Co dnes končí „nic se nestane“ (vůz čeká na kování, kůň je nepodkutý, díl bez osiva se neoseje), končí tak i v plánu 1.
- Hexagon: doména a use-casy bez infrastruktury; web i worker volají stejné use-casy; server je jediná autorita.
- Determinismus: v `packages/game` žádné `Date.now()`, `new Date()` bez argumentu, `Math.random()`. Smazaný krok dne nesmí posunout los jiného kroku – proudy jsou pojmenované (`'marriage:' + den`, `'wife:' + den` …), smaže se celý proud.
- Čísla pravidel jen v `rules*.ts`; smazané číslo zmizí i z textu návrhu (Úloha 7). Konstanta, kterou po úloze nic nečte (`grep -rnw <jméno> packages apps`), se smaže v téže úloze.
- Stav vsi: nic nepřibude; `trade.neighbours` zmizí převodem `fictional-neighbours` na konci `VILLAGE_MIGRATIONS` (idempotentní, vstupní stav nemění). Typy, které nese uložený stav na cestě (`TradeExpedition`, `CraftPurchase`, `IronTrip`, `IronTripTarget`, `Person.origin`, `emigrants`) a druhy kroniky (`trade-*`, `crafts-bought`, `iron-*`, `horses-shod`, `bride-from-outside`, `groom-from-outside`, `married-away`, `extra-wife`, `newcomer`, `seed-bought`, `seed-short`), zůstávají. Kodek DB se nemění, DB migrace není.
- Zlaté otisky: úloha, která změní simulaci, přepíše selhané `*golden*.test.ts` (`village-golden.test.ts` `EXPECTED_YEAR_1`, `village-golden-long.test.ts` `EXPECTED_YEAR_2/3`, případně `smith-golden`, `craft-skill-golden`, `summer-slaughter-golden`) podle `Received` a nad konstantu doplní řádek „<datum> – konec smyšlených sousedů (markets.md – Pravidla 1), úloha N“.
- Rozhraní jako v 0 A.D.: ikony bez popisků, slova jen v `Tooltip`; nic nevysvětlovat textem navíc.
- Každá úloha na konci: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs`, `nice -n 19 npm run test`; u změn simulace vsi (Úlohy 1, 2, 3, 5, 6) i `nice -n 19 npm run test:slow`. E2e jen kde to úloha říká, sériově (před spuštěním `pgrep -f "[p]laywright test"` nesmí nic vrátit).
- `docs/code/`: úloha, která smaže nebo přejmenuje jméno z mapy kódu, opraví v téže úloze i text (`check:docs` jinak padne). Návrhy v `docs/design/` až Úloha 7.
- Česky komentáře i docs, krátká pomlčka „–“; vlastní rozhodnutí v docs „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, končí `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Agenti: žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash`, `git branch -D`; neslučovat, nepushovat; nejvýš ≈ 150 kroků; DB `bohemia` jen čtení.

## Rozhodnutí plánu (návrh Clauda)

1. **Každá vazba na okolí v plánu 1 skončí a vrátí se se skutečnými vsemi:**

   | Dnes (kód)                                                                                        | Plán 1                                                                                  | Vrátí se                                 |
   | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
   | Obchodní výprava hráče – zboží, kámen, kůže, dobytek, koně, lidé (`sendExpedition`, `tradeQuote`) | konec; tlačítko Obchod a panel obchodu zmizí (Úloha 4, 6)                               | 2 – obchodní výprava a trh ve vsi        |
   | Výprava správce za obilím v nouzi (`grainStep`)                                                   | konec; lov v nouzi zůstává (Úloha 5)                                                    | 3 – správce na trhu                      |
   | Nákup nástrojů, keramiky, dřevěného nářadí a vozů 15. 11. (`startPurchases`)                      | konec (Úloha 3)                                                                         | 3 – vesničané na trhu (markets.md bod 9) |
   | Nákup osiva 1. 9. a 1. 3. (`buySeed`)                                                             | konec; rezerva osiva a varování „Chybí osivo na setí“ zůstávají (Úloha 3)               | 3                                        |
   | Kování vozů u kováře souseda (`startIronTrip`, `ironDestinations`)                                | konec; vůz bez hřiven čeká na kování jako dnes bez souseda s kovářem (Úloha 2)          | 3 – zakázky (neighbours.md bod 6)        |
   | Cizí kovář ke koním (`planShoeing` – `nearestCraftsman`)                                          | konec; bez vlastního kováře je kůň po termínu nepodkutý (Úloha 2)                       | 3 – zakázky                              |
   | Nevěsta a ženich z okolí, vdát se pryč (`outsideMarriages`)                                       | konec; lidé se berou mezi sebou (Martin) (Úloha 1)                                      | 3 – sňatky se skutečnými sousedy         |
   | Další manželky mužů rodu z okolí (`extraWivesDay`)                                                | konec (Úloha 1; Otázka na Martina)                                                      | 3                                        |
   | Výměna lidí, noví osadníci (`neighbourPeople`; `settleNewcomers` jen pro výpravy na cestě)        | konec s obchodní výpravou (Úloha 6)                                                     | 3 – lidé se skutečnými sousedy           |
   | „Železo pro sousedy“ – hřivny jako platba za osivo a obilí správce, hřivny jako zboží souseda     | končí s nákupem osiva, obilím správce a obchodem                                        | 2 a 3                                    |
   | Zlý rok kraje zmenší zásobu obilí sousedů (`seasonSupply`, `DISASTER_TRADE.*.grainStock`)         | konec; zdražení zboží v kraji (`goodWorth` – platba koní nové ohrady) zůstává (Úloha 6) | 2 – ceny trhu                            |

   Zůstávají beze změny: koně se stavbou první ohrady koní (neighbours.md bod 11, D5 – nejsou od souseda), mistři huti a kněz (přicházejí na pozvání z dálky – stone-masonry.md, ne sousedé), obchod mezi hráči jednáním a zásilky vazalů (vassalage.md), zemská stezka i stavba stezky správcem (`roadStep` – stezka dál zkracuje odchod syna a nese výpravy), právo `trade` v seniorátu (přestane ho používat jen `sendExpedition`, plán 2 ho vezme pro obchodní výpravu).

2. **Přes skutečnou ves už v plánu 1 jde jen popisek konce cesty na kraji mapy:** „Cesta do Lhoty“ podle vlastní vsi na sousední mapě v tom směru (`ownMapsAround` v `apps/web/lib/departure-view.ts` už jména po směrech počítá), jinak „Cesta na sever“. Levné, protože je to jen pohled. Každá jiná vazba potřebuje, aby druhá ves zboží nebo člověka opravdu dala a vzala (anti-cíl „soused jako nekonečný zdroj“) – přes schránku vsi, výpis souseda a pořadí dnů dvou vsí, tedy základ, který staví plán 2; v plánu 1 by se stavěl dvakrát.
3. **Co hráč přestane vidět nebo uvidí jinak:** tlačítko Obchod ve dvorci a celý panel obchodu (sousedé, zásoby, „Soused shání / nabízí“, výprava na cestě, ikona zdražení kraje) zmizí; v panelu dvorce řádek výrobků řemeslníků ukáže jen vlastní dílnu ✓, jinak zašedlou ikonu s popiskem „<výrobek> – ve vsi není řemeslník“, nákupy na cestě do návratu; v panelu dílny zmizí „vesničané dokupují u souseda“; nová upozornění „Nevěsta z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“, „Vesničané koupili … u souseda“, „Přišla rodina ze …“ a koupené osivo nepřibývají (staré v kronice zůstanou se jménem dřívějšího souseda); kronika dostavěné stezky už neslibuje obchod („Zemská stezka na sever je dostavěná.“); texty cest u kraje mapy jdou podle směru; prémiová výhoda brodu a průsmyku „Cesta od počátku“ bez „levnější obchod se sousedy“; „Chybí osivo na setí“ zůstává s textem kroniky bez nákupu.
4. **Na cestě doběhne** (markets.md bod 10): výprava k sousedovi přinese zboží, dobytek, koně i lidi (`settleNewcomers`), nákup výrobky a vůz, cesta pro kování dokončí vůz – kód postupu a návratu zůstává, smaže se jen začátek. Karavana na cestě a kronika jmenují dřívějšího souseda (`legacyNeighbourName`).
5. **Soubory se přejmenují, kde by jméno lhalo:** `trade/neighbours.ts` → `trade/goods.ts` (jen seznamy zboží), `fields/seed-buying.ts` → `fields/seed-reserve.ts`, `SEED_BUYING` → `SEED_RESERVE`. `craft-buying.ts` a `purchase-carts.ts` zůstávají (nákupy na cestě, `purchaseRoute` pro karavany zásilek, `paymentPool`, `ploughingToday`).

## Otázka na Martina

1. Mají si muži rodu ve vsi bez spojení s okolím brát **další manželky ze svobodných žen vsi**, nebo vedlejší manželky do plánu 3 (skuteční sousedé) nepřibývají? Doporučení: nepřibývají – lord.md je bere jen „z okolí“ a ze vsi by braly nevěsty ostatním mužům. Úloha 1 počítá s doporučením; odpoví-li Martin jinak, Úloha 1 se před spuštěním přepíše.

## Review Focus

1. **Starší ves s výpravou, nákupem nebo cestou pro kování na cestě ke smyšlenému sousedovi** → po převodu zůstanou beze změny a v den návratu přinesou zboží, koně, krávy, lidi a vůz jako dřív; nová nevyrazí. Test v Úloze 6 (převod a 60 dní dopočtu), 3 (nákup na cestě), 2 (cesta pro kování).
2. **Ves vazala se zásilkou na cestě nebo bez `trade`** (zásilky sdílejí `trade.expeditions`) → zásilka odejde i dojde jako dřív a nový `trade` nemá `neighbours`. Test v Úloze 6.
3. **Ves bez kováře s vozem čekajícím na kování nebo s jezdeckým koněm po termínu** → vůz čeká, kůň je nepodkutý, nic se nezaplatí a nikdo nikam nejde – každý den znovu bez chyby. Test v Úloze 2.
4. **Svobodný muž nebo žena bez protějšku ve vsi (i vdova, dědička, muž rodu)** → zůstanou svobodní, nikdo nepřibude ani neodejde, `nextId` se nezmění. Test v Úloze 1.
5. **Stará kronika a upozornění obchodu, nákupů, cizího kováře a sňatků z okolí** → texty beze změny i se jménem dřívějšího souseda; konec cesty u kraje mapy bez smyšleného jména. Test v Úloze 4.

## Mapa souborů

| Soubor (`packages/game/src/domain/village/` není-li jinak)                                                                                                                                                                                                                                                                                                                                                                                                             | Úlohy | Co                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------ |
| `people/marriage.ts`, `people/dynasty-wives.ts`, `core/simulate.ts`, `rules/rules-people.ts`, `rules/rules-lord.ts`                                                                                                                                                                                                                                                                                                                                                    | 1     | sňatky jen ve vsi                    |
| `crafts/cart-iron.ts`, `livestock/horse-shoeing.ts`, `core/simulate.ts`, `rules/rules-crafts.ts`, `rules/rules-livestock.ts`, `apps/web/lib/horse-view.ts`                                                                                                                                                                                                                                                                                                             | 2     | kovář jen vlastní                    |
| `crafts/craft-buying.ts`, `crafts/purchase-carts.ts`, `fields/seed-buying.ts` → `seed-reserve.ts`, `core/simulate.ts`, `rules/rules-crafts.ts`, `rules/rules-fields.ts`, `apps/web/lib/village-view-crafts.ts`, `selection-details.ts`, `components/game/hud/selection/crafts.tsx`, `village-view-chronicle.ts`                                                                                                                                                        | 3     | bez nákupů u sousedů a osiva         |
| `trade/legacy-neighbours.ts` (nový), `application/send-expedition.ts`, `application/rights.ts`, `apps/web/components/game/hud/TradePanel.tsx`, `ManorPanel.tsx`, `selection/dwelling.tsx`, `apps/web/lib/manor-view.ts`, `trade-quote.ts`, `caravan-view.ts`, `road-end-view.ts`, `village-view-roads.ts`, `village-view-chronicle.ts`, `disasters-view.ts`, `premium-view.ts`, `village.ts`, `village-input.ts`, `app/game/actions/village.ts`, `village-commands.ts` | 4     | rozhraní bez obchodu se sousedy      |
| `steward/steward-needs.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                             | 5     | správce bez obilí od sousedů         |
| `trade/neighbours.ts` → `trade/goods.ts`, `trade/trade.ts`, `trade/people-trade.ts`, `trade/horse-trade.ts`, `trade/cattle-trade.ts`, `trade/trade-weather.ts`, `trade/legacy-neighbours.ts`, `types/types-trade.ts`, `core/migrations.ts`, `rules/rules-trade.ts`, `rules/rules-disasters.ts`, `domain/vassalage/shipment.ts`, `index.ts`                                                                                                                             | 6     | jádro bez smyšlených sousedů, převod |
| `docs/design/*.md`, `docs/design/history/*`                                                                                                                                                                                                                                                                                                                                                                                                                            | 7     | návrhy, celé e2e, přepočet Vlkova    |

---

### Task 1: Sňatky jen ve vsi (Sonnet)

**Files:**

- Modify: `people/marriage.ts` – smazat `outsideMarriages`, `favouredBride`, `crowded`, `neighbor`, volání na konci `arrangeMarriages:303`; hlavička souboru a doc `arrangeMarriages` bez okolí
- Modify: `people/dynasty-wives.ts` – smazat `extraWivesDay`, `extraWifeHome`, `perDay`, `wifeCounts` (co po smazání nic nečte); `ensureMainWives` zůstává; hlavička souboru
- Modify: `core/simulate.ts:487–497` (volání `extraWivesDay` pryč, komentář `:474`)
- Modify: `rules/rules-people.ts` (`MARRIAGE.outside`, `outsideFromAge`, `brideAge`, `groomAge` – co nic nečte), `rules/rules-lord.ts:57–61` (`maxWives`, `extraWifePerYear`, `extraWifeFromAge`)
- Modify: `docs/code/village-people.md` (Manželky – odstavec `extraWivesDay`; Sňatky – věty „Okolí (`MARRIAGE.outside` …)“ a čekání na zásoby „z okolí a další manželka“)
- Test: `people/__tests__/marriage.test.ts`, `people/__tests__/dynasty-wives.test.ts`, zlaté otisky

**Interfaces:**

- Produces: `arrangeMarriages(state, day, storesFill?)` – stávající podpis, jen sňatky ve vsi; `weddingChancePerDay(fill: number): number` (dosud `(perYear: number | null, fill)` – jediné volání předávalo `null`). Kronika a upozornění sňatků z okolí zůstávají pro staré záznamy.

- [ ] **Step 1: Testy** v `marriage.test.ts` (přípravky vsi a lidí z dosavadního souboru), staré testy sňatků s okolím smazat:

```ts
// svobodný muž 20 let, ve vsi žádná svobodná žena – rok sňatků
const s = villageWith([man(20)]);
const nextId = s.nextId;
for (let d = day; d < day + 365; d++) arrangeMarriages(s, d);
expect(s.people).toHaveLength(1);
expect(s.nextId).toBe(nextId);
// svobodná žena 20 let (i vdova s dítětem, i dědička) bez muže – nevdá se pryč, nikdo nepřijde
expect(events.filter((e) => e.kind === 'married-away' || e.kind === 'groom-from-outside')).toEqual(
  [],
);
expect(s.emigrants ?? []).toEqual(emigrantsBefore);
// bratranec a sestřenice se vezmou (po feat/no-kin-marriage)
expect(events.some((e) => e.kind === 'marriage')).toBe(true);
```

a v `dynasty-wives.test.ts` testy `extraWivesDay` smazat, nový: ves z `simulate-fixtures.ts` s ženatým mužem rodu 25 let, `advanceVillage` 365 dní → žádná událost `extra-wife`, muž má jednu manželku.

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/people/__tests__/marriage.test.ts packages/game/src/domain/village/people/__tests__/dynasty-wives.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Files.
- [ ] **Step 4: Spustit** testy z kroku 2 – PASS; celé sady z Global Constraints; přepsat zlaté otisky.
- [ ] **Step 5: Commit** `feat(game): sňatky jen ve vsi – konec nevěst, ženichů a manželek z okolí` (`Refs #11`).

### Task 2: Kovář jen vlastní – konec cizího kováře a kování vozů u souseda (Sonnet)

**Files:**

- Modify: `crafts/cart-iron.ts` – smazat `ironDestinations`, `cartCanGo`, `freeIronCart`, `ironOptions`, `cheaper`, `cheapest`, `ironPlan`, `ironPriceKg`, `ironCarrier`, `startIronTrip`, `smithAtHome` a typy `IronRoute`, `IronPlan`; v `cartIronDay` krok 3 pryč; zůstává `cartIronKg`, `ironTripHelpers`, `ironTripShares`, `ironTripDaysLeft`, `ironTripLine`, `withoutSameMapVillages`; hlavička souboru
- Modify: `livestock/horse-shoeing.ts` – jen vlastní kovář: smazat `shoeingCosts`, `foreignIronKg`, `foreignValueKg`, platbu a `route`; `shoeingView` a `shoeingDay` bez cizího kováře (záznam `horses-shod` cizího kováře ze starší kroniky dál přečte `shoeingDay`)
- Modify: `core/simulate.ts:427` (`cartIronDay(state, day)`), `core/simulate-work.ts:737` (`shoeingPlan ? shoeingPlan.manDays : 0` – bez `.own`), `index.ts` (exporty), `rules/rules-crafts.ts` (`CART_IRON` – klíče jen pro cestu a platbu; `cartCrew` čte karavana na cestě), `rules/rules-livestock.ts` (`HORSE_SHOEING` – klíče cizího kováře)
- Modify: `apps/web/lib/horse-view.ts` a volající (`grep -rn "shoeingView\|shoeingCosts" apps/web`)
- Modify: `docs/code/village-crafts.md` (Kování vozů), `docs/code/village-livestock.md:574–580` (`horse-shoeing.ts`)
- Test: `crafts/__tests__/cart-iron.test.ts`, `livestock/__tests__/horse-shoeing.test.ts`, zlaté otisky

**Interfaces:**

- Produces:

```ts
// cart-iron.ts
export function cartIronDay(state: VillageState, day: number): ChronicleEvent[]; // bez landscape
// horse-shoeing.ts – plán dne jen s vlastním kovářem (pracující kovárna se zásobou hřiven)
export interface ShoeingPlan {
  horses: number;
  manDays: number;
}
export function planShoeing(state, day, coverage, landscape): ShoeingPlan | null; // podpis beze změny
```

- [ ] **Step 1: Testy** (přípravky z dosavadních souborů; testy cest a cizího kováře smazat):

```ts
// cart-iron: vůz čeká na kování, ves bez kováře a bez hřiven, obilí 5 000 kg – 30 dní
for (let d = day; d < day + 30; d++) events.push(...cartIronDay(s, d));
expect(events.filter((e) => e.kind === 'iron-trip')).toEqual([]);
expect(carpenter(s).workshop!.ironTrip).toBeNull();
expect(s.storesKg).toBe(5000);
// s hřivnami ≥ cartIronBarsKg(kind) → 'cart-made' (beze změny)
// uložený ironTrip { done: days - 1 } (starší ves) → 'iron-brought' a 'cart-made'
// horse-shoeing: ves bez kovárny, jezdecký kůň po termínu – 10 dní
expect(planShoeing(s, d, coverage, null)).toBeNull();
expect(isUnshod(horse, d)).toBe(true); // zásoby obilí a luštěnin beze změny
// s pracující kovárnou a hřivnami → { horses: 1, manDays: > 0 }
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts/__tests__/cart-iron.test.ts packages/game/src/domain/village/livestock/__tests__/horse-shoeing.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Files.
- [ ] **Step 4: Spustit** – PASS; celé sady; přepsat zlaté otisky.
- [ ] **Step 5: Commit** `feat(game): kování koní a vozů jen vlastním kovářem` (`Refs #11`).

### Task 3: Konec nákupů u sousedů a nákupu osiva (Opus)

**Files:**

- Modify: `crafts/craft-buying.ts` – smazat `neighbourCrafts`, `productPrice`, `nearestCraftsman`, `nearestCartMaker`, `planPurchases`, `isBuyingDay`, `startPurchases`, `groupCap`, `PurchasePlan`, `PurchaseItem` a pomocníky rozhodnutí; zůstává `CRAFT_PRODUCTS`, `PRODUCT_CRAFT`, `CraftProduct`, `purchaseRoute` (karavana zásilky – `caravan-view.ts:87`), `ownCraftsmanWorks`, `paymentPool` (ohrada koní, výmlat), `purchaseTravelers`, `purchaseLine`, `purchaseTarget`, `walkPurchases`, `finishPurchases`, `purchaseDaysLeft`, `paymentValueKg`
- Modify: `crafts/purchase-carts.ts` – zůstává jen `ploughingToday` (scéna); zbytek pryč
- Rename: `fields/seed-buying.ts` → `fields/seed-reserve.ts` (+ test `seed-buying.test.ts` → `seed-reserve.test.ts`); smazat `buySeed`; `seedShortKg`, `foundersSeedKeepKg` zůstávají
- Modify: `rules/rules-fields.ts:92` `SEED_BUYING` → `SEED_RESERVE` (i `fields/seed.ts`, `people/hunger-groups.ts`); klíče platby pryč. `rules/rules-crafts.ts:379–425` `CRAFT_BUYING` – co nic nečte
- Modify: `core/simulate.ts:386–391` (`startPurchases` pryč, `seedReserveDay`), `types/types-chronicle.ts:728` (`seed-short` – `reason?`), komentáře `types/types-state.ts:273`, `steward/steward-son.ts:291`
- Modify: `apps/web/lib/village-view-crafts.ts:385` (`craftSources(state)`), `apps/web/lib/selection-details.ts:145, 212, 1098, 1687–1692` (`SelectionWorkshop.buying` pryč), `apps/web/components/game/hud/selection/crafts.tsx:389–395, 553–581`, `apps/web/lib/village-view-chronicle.ts:1592–1595`
- Modify: `docs/code/village-crafts.md:190–233` (Nákup u sousedů, Vozy u nákupu u sousedů – zkrátit na „nákupy na cestě doběhnou“), `docs/code/village-fields.md` (Osivo pro ves bez zásob), `docs/code/village-trade.md:236–242` (Nákup osiva)
- Test: `crafts/__tests__/craft-buying.test.ts`, `crafts/__tests__/purchase-carts.test.ts`, `fields/__tests__/seed-reserve.test.ts`, `apps/web/components/game/hud/__tests__/SelectionPanel.test.tsx`, zlaté otisky

**Interfaces:**

- Produces:

```ts
// craft-buying.ts – kde ves výrobky bere: jen vlastní pracující řemeslník
export interface CraftSource { product: CraftProduct; own: boolean }
export function craftSources(state: VillageState): CraftSource[];
// seed-reserve.ts – rezerva osiva (1. 6., 1. 12., zakladatelé, skutečný hlad) beze změny; ve dny
// SEED_RESERVE.days při nedostatku aspoň SEED_RESERVE.minKg jen kronika { kind: 'seed-short', shortKg }
export function seedReserveDay(state: VillageState, day: number): ChronicleEvent[];
// types-chronicle.ts
| { kind: 'seed-short'; shortKg: number; reason?: 'pay' | 'supply' } // bez reason = bez nákupu
```

- Texty: kronika `seed-short` bez `reason` „Na setí chybí N kg osiva – díly bez osiva vesničané nezasejí.“ (se `reason` beze změny); `BuyingRow` bez vlastního řemeslníka „${PRODUCT_TITLES[product]} – ve vsi není řemeslník“ (zašedlá ikona), vlastní ✓ a nákupy na cestě beze změny.

- [ ] **Step 1: Testy** (přípravky z dosavadních souborů; testy rozhodnutí nákupu a ceny smazat):

```ts
// ves bez hrnčíře a kováře s přebytkem obilí a hotovou stezkou – dopočet 1. 11. → 1. 12.
expect(next.purchases ?? []).toEqual([]);
expect(chronicle.some((e) => e.kind === 'crafts-bought')).toBe(false);
// uložený CraftPurchase (keramika a vůz) s done = days - 1 → po dni keramika v zásobě a vůz přibude
expect(villageCarts(next)).toHaveLength(cartsBefore + 1);
expect(craftSources(s)).toEqual([
  { product: 'toolsKg', own: false },
  { product: 'potteryKg', own: true },
  { product: 'woodToolsKg', own: false },
]);
// 1. 9.: ves s chybějícím osivem – nic nekoupí
expect(s.storesKg).toBe(before.storesKg);
expect(seedReserveDay(s, sept1)).toEqual([
  { day: sept1, kind: 'seed-short', shortKg: expect.any(Number) },
]);
// 1. 6. a 1. 12. – uvolnění rezervy beze změny (dosavadní testy)
```

a v `SelectionPanel.test.tsx`: `BuyingRow` se zdrojem `{ product: 'toolsKg', own: false }` ukáže popisek „<PRODUCT_TITLES.toolsKg> – ve vsi není řemeslník“; panel dílny nemá `selection-workshop-buying`.

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/crafts packages/game/src/domain/village/fields/__tests__/seed-reserve.test.ts apps/web/components/game/hud/__tests__/SelectionPanel.test.tsx` – FAIL.
- [ ] **Step 3: Implementovat** podle Files; co smazaný kód nechal bez čtenáře (`grep -rnw`), smazat.
- [ ] **Step 4: Spustit** – PASS; celé sady; přepsat zlaté otisky.
- [ ] **Step 5: Commit** `feat(game): konec nákupů výrobků, vozů a osiva u sousedů` (`Refs #11`).

### Task 4: Rozhraní bez obchodu se sousedy (Sonnet)

**Files:**

- Create: `trade/legacy-neighbours.ts` – `legacyNeighbourName`; export v `index.ts`
- Delete: `apps/web/components/game/hud/TradePanel.tsx` (+ `__tests__/TradePanel.test.tsx`), `apps/web/lib/trade-quote.ts`, `packages/game/src/application/send-expedition.ts` (+ export `application/index.ts:63`)
- Modify: `apps/web/components/game/hud/ManorPanel.tsx:175–195, 268–297, 366–369` (tlačítko Obchod, prop `trade`), `selection/dwelling.tsx:6, 13, 149–160`, `apps/web/lib/manor-view.ts` (`VillageNeighbour`, `neighbourViews`, `VillageManor.neighbours`, `VillageExpedition`, `expeditionView` a importy jádra obchodu), `apps/web/lib/disasters-view.ts:211–227` (`tradeDearth`, `dearthLabel` pryč)
- Modify: `apps/web/app/game/actions/village.ts:245` (`sendExpedition` pryč), `apps/web/lib/village-input.ts` (`parseSendExpeditionInput` + test), `apps/web/lib/village.ts:1327–1360` (`sendExpeditionForPlayer`), `components/game/village-game/village-commands.ts:25, 307`, `application/rights.ts:122` (`sendExpedition`; právo `trade` zůstává)
- Modify: `apps/web/lib/caravan-view.ts:110, 143`, `apps/web/lib/village-view-chronicle.ts` (`:1160`, `:1175` a ostatní `neighbourOf(seed, …).name` → `legacyNeighbourName`; `:796–799` a `edgeVillage :836–851` – kraj mapy podle směru jako dnes bez seedu; `:1569` text dostavěné stezky), `apps/web/lib/road-end-view.ts:168–180`, `apps/web/lib/village-view-roads.ts:321–328` a předání `ownMaps` z `apps/web/lib/village.ts:291`, `apps/web/lib/departure-view.ts:118–148` (komentáře, „obchodovat“ pryč), `apps/web/lib/premium-view.ts:38, 43`
- Modify: `apps/web/e2e/village.spec.ts:7, 1113–1198`, `docs/code/web-ui.md` (panel obchodu pryč, kronika), `docs/code/village-trade.md:145–165` (web, use-case a server action obchodu pryč)
- Test: `packages/game/src/domain/village/trade/__tests__/legacy-neighbours.test.ts` (nový), `apps/web/components/game/hud/__tests__/ManorPanel.test.tsx`, `apps/web/lib/__tests__/manor-view.test.ts`, testy `road-end-view` a kroniky v `apps/web/lib/__tests__/`, `application/__tests__/rights.test.ts`

**Interfaces:**

- Produces:

```ts
// trade/legacy-neighbours.ts – jméno dřívějšího smyšleného souseda pro staré záznamy (markets.md – Pravidla 10)
export function legacyNeighbourName(seed: number, direction: Direction8): string;
// = suggestVillageName(deriveSeed(seed, `neighbour-name:${direction}`)) – týž los jako neighbourOf(…).name
// road-end-view.ts – ownMaps: vlastní vsi na sousedních mapách po směrech (ownMapsAround)
export function roadEndView(
  state,
  roads,
  end,
  near,
  ownMaps: Partial<Record<Direction8, string>>,
): VillageRoadEnd;
```

- Texty: konec cesty na kraji mapy „Cesta ${toVillage(jméno)}“ s vlastní vsí v tom směru, jinak „Cesta na ${DIRECTION_NAMES[d].name}“; kronika `trail-built` „Zemská stezka na ${…name} je dostavěná.“; prémie brodu a průsmyku `now: 'Cesta od počátku'`.

- [ ] **Step 1: Testy:**

```ts
// legacy-neighbours.test.ts – 3 seedy × 8 směrů: rovnost s neighbourOf (Úloha 6 ji smaže) a pevná jména
expect(legacyNeighbourName(seed, d)).toBe(neighbourOf(seed, d).name);
expect(NEIGHBOR_DIRECTIONS.map((d) => legacyNeighbourName(1234, d))).toEqual([
  /* 8 jmen z neighbourOf */
]);
// road-end-view: okraj N s ownMaps { N: 'Lhota' } → 'Cesta do Lhoty'; bez → 'Cesta na sever'
// kronika: starý 'trade-returned', 'crafts-bought', cizí 'horses-shod', 'bride-from-outside' – text beze změny
// ManorPanel: žádné getByTestId('manor-trade'); rights: 'sendExpedition' v mapě akcí není
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/legacy-neighbours.test.ts apps/web/components/game/hud/__tests__/ManorPanel.test.tsx apps/web/lib/__tests__` – FAIL.
- [ ] **Step 3: Implementovat** podle Files a textů výše, i e2e: test „ves postaví ve dvorci zemskou stezku a pošle po ní výpravu k sousedovi“ přejmenovat na „ves postaví ve dvorci zemskou stezku – obchod se sousedy není“ (stezka se dostaví jako dosud, `manor-trade` má `toHaveCount(0)`, část obchodu a import `neighbourOf` pryč). Pak `grep -rn "sendExpedition\|SendExpedition\|OWN_VILLAGE_TRADE\|TradePanel\|tradePreview\|neighbourViews\|neighbourOf\|neighbourStock\|tradeSeason" apps/web packages/game/src/application` nesmí nic vrátit.
- [ ] **Step 4: Spustit** – PASS; celé sady.
- [ ] **Step 5: E2e** – `cd apps/web && npx playwright test village -g "zemskou stezku"`, pak celé `npx playwright test --project=chromium` – PASS.
- [ ] **Step 6: Commit** `feat(web): bez obchodu se sousedy – panel obchodu pryč, jména dřívějších sousedů jen v kronice` (`Refs #11`).

### Task 5: Správce bez obilí od sousedů (Sonnet)

**Files:**

- Modify: `steward/steward-needs.ts` – smazat `grainStep`, `GrainDeal`, `FIT_TRIES` a pomocníky nákupu obilí; importy `trade/neighbours`, `trade/trade`, `trade/trail`; `needSteps` = jen lov; hlavička souboru („Obilí a lov v nouzi“ → lov v nouzi)
- Modify: `docs/code/village-steward.md:11`
- Test: `steward/__tests__/steward-needs.test.ts`, zlaté otisky

**Interfaces:**

- Produces: `needSteps(state: VillageState, ctx: NeedContext): void` – jen `huntWanted` → `declareNpcHunt`; `NeedContext` beze změny. Nic ve `steward/` nečte `tradeQuote`, `launchExpedition`, `expeditionTo`, `neighbourStock`.

- [ ] **Step 1: Testy** (testy nákupu obilí smazat):

```ts
// ves správce s výhledem hladu (shortKg > 0), hotovou stezkou a hřivnami – krok 2a
needSteps(s, ctx);
expect(s.trade?.expeditions ?? []).toEqual([]);
// škody zvěře v létě → lov správce na zítřek dál (dosavadní test)
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/steward/__tests__/steward-needs.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Files.
- [ ] **Step 4: Spustit** – PASS; celé sady; přepsat zlaté otisky, které se změní.
- [ ] **Step 5: Commit** `feat(game): správce v nouzi už nekupuje obilí od sousedů` (`Refs #11`).

### Task 6: Jádro bez smyšlených sousedů a převod starších vsí (Opus)

**Files:**

- Rename: `trade/neighbours.ts` → `trade/goods.ts` – zůstává `TRADE_GOODS`, `CATTLE_GOODS`, `HORSE_GOODS`, `isCattleGood`, `isHorseGood`, `isLivestockGood`; smazat `Neighbour`, `NeighbourKind`, `neighbourKind`, `neighbourOf`, `seasonSupply`, `neighbourStock` a pomocníky losu; `tradeSeason` přejde do `trade/trade-weather.ts`; importy (`grep -rln "trade/neighbours"`), `index.ts:400`
- Modify: `trade/trade.ts` – smazat `NO_TRAIL` … `NO_EMIGRANTS`, `expeditionTo`, `tradeQuote`, `stockPeople`, `peopleBlocked`, `storeStock`, `startExpedition`, `launchExpedition`, `checkedQuote`, `departExpedition`, `TradeOffer`, `TradeQuote` a vše, co pak nic nečte (porovnat `grep -rnw`); zůstává `sellValue`, `goodWorth`, `sellPrice`, `villageGoodStock`, `addGood`, `hidesOnHand`, `expeditionLaborNeed`, `expeditionLaborToday`, `workExpeditions`, `finishExpeditions`, `expeditionCartLoads`, převody
- Modify: `trade/people-trade.ts` (smazat `neighbourPeople`, `storedNeighbourPeople`, `personValue`, `neighbourFamilyValue`; zůstává `emigrantGroups`, `emigrantList`, `newcomerProfiles`, `newcomerHome`, `settleNewcomers` – zásilky a výpravy na cestě), `trade/horse-trade.ts` (smazat `offeredHorses`, `boughtHorses`, `horseRoomBlocked`, `horseTradeRoom`), `trade/cattle-trade.ts` (smazat `cattleRoomBlocked` a co nic nečte)
- Modify: převody `withoutForeignGoods`, `withIronBarsTrade`, `withCattleKinds` – části `trade.neighbours` (`fitsNeighbour`, `sameGoods`, zbytek roku sousedů) pryč, výpravy a kronika beze změny; místní typ `LegacyTrade = VillageTrade & { neighbours?: unknown[] }`
- Modify: `trade/trade-weather.ts` (`tradeWeather` jen `goodsValue`, `tradeSeason`), `rules/rules-disasters.ts:314` (`grainStock` pryč), `rules/rules-trade.ts` (`NEIGHBOURS`, `PEOPLE_TRADE`, `HORSE_TRADE.perYear`, `.ridingYearChance` a klíče `TRADE`, které nic nečte)
- Modify: `types/types-trade.ts` (`NeighbourStock`, `NeighbourPeople`, `NeighbourGood` pryč; `VillageTrade = { expeditions; nextId }`), `trade/trade.ts:615` a `domain/vassalage/shipment.ts:209` (`trade ??= { expeditions: [], nextId: 1 }`)
- Modify: `trade/legacy-neighbours.ts` (+ `withoutFictionalNeighbours`), `core/migrations.ts` (nová položka na konec)
- Modify: `docs/code/village-trade.md:109–234, 243–269` (Sousedé a obchod, Jen společné suroviny, Kůže…, Dobytek, Koně, Výměna lidí – nechat převody, výpravy na cestě, zásilky, `villageGoodStock`, karavanu), `docs/code/village-disasters.md:142` (Kraj kolem vsi – bez zásoby obilí sousedů), `docs/code/village-core.md:1096` (řádek převodu do tabulky)
- Test: `trade/__tests__/neighbours.test.ts` (smazat), `trade.test.ts`, `people-trade.test.ts`, `horse-trade.test.ts`, `cattle-trade.test.ts`, `trade-weather.test.ts`, `expedition-trips.test.ts` (části sousedů pryč), `legacy-neighbours.test.ts` (rovnost s `neighbourOf` pryč, pevná jména zůstanou), `core/__tests__/migrations.test.ts`, `domain/vassalage/__tests__/shipment.test.ts`, zlaté otisky

**Interfaces:**

- Consumes: Úloha 4 (`legacyNeighbourName`), Úlohy 2, 3, 5 (nic mimo `trade/` nečte generátor sousedů ani `tradeQuote`).
- Produces:

```ts
// trade-weather.ts
export function tradeSeason(day: number): number; // přesun beze změny (TRADE.restockDay)
export function tradeWeather(state: WeatherState, season: number): { goodsValue: number };
// legacy-neighbours.ts – převod `fictional-neighbours` (markets.md – Pravidla 10): smaže trade.neighbours;
// výpravy, nákupy a cesty pro kování na cestě nechá. Na kopii jen když ves trade.neighbours má, jinak týž objekt.
export function withoutFictionalNeighbours(state: VillageState): VillageState;
// migrations.ts – poslední položka
{ id: 'fictional-neighbours', since: '<datum úlohy RRRR-MM-DD>', run: withoutFictionalNeighbours }
```

- [ ] **Step 1: Testy:**

```ts
// migrations.test.ts – ves s trade.neighbours (2 zbytky roku), výpravou na cestě (zboží, krávy, kůň,
// getPeople), nákupem na cestě a ironTrip
const next = migrateVillage(old, ctx);
expect('neighbours' in next.trade!).toBe(false);
expect(next.trade!.expeditions).toEqual(old.trade!.expeditions);
expect(next.purchases).toEqual(old.purchases);
expect(migrateVillage(next, ctx)).toBe(next);
expect(migrateVillage(villageWithoutTrade, ctx)).toBe(villageWithoutTrade);
// po převodu dopočet 60 dní: 'trade-returned', krávy, kůň a lidé (settleNewcomers) přibudou
// shipment.test.ts – zásilka z vsi bez trade: next.trade = { expeditions: [zásilka], nextId: 2 }; zásilka dojde (dosavadní)
// trade-weather.test.ts – po zlém roce goodsValue 0,67, po krutém 0,5, jinak 1
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/core/__tests__/migrations.test.ts packages/game/src/domain/village/trade packages/game/src/domain/vassalage/__tests__/shipment.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Files; `grep -rn "neighbourOf\|neighbourStock\|seasonSupply\|neighbourKind\|NEIGHBOURS\b\|NeighbourStock\|tradeQuote\|startExpedition" packages apps` vrátí jen `legacy-neighbours.ts` (komentář) a docs historie.
- [ ] **Step 4: Spustit** – PASS; celé sady; přepsat zlaté otisky, které se změní.
- [ ] **Step 5: Commit** `feat(game): konec smyšlených sousedů v jádru obchodu, převod starších vsí` (`Refs #11`).

### Task 7: Návrhy, celé e2e a přepočet Vlkova (Sonnet)

**Files:**

- Modify: `docs/design/markets.md` (Stav: plán 1 hotový s datem; Rozhodnutí plánu 1–5 a odpověď na Otázku), `docs/design/neighbours.md` (Stav – body 13 a 14 hotové plánem 1)
- Modify (neplatné oddíly do `docs/design/history/<dokument>-history.md` s odkazem, v dokumentu jedna věta „do plánu 2 / 3 nic – markets.md, plán 1“): `trade.md` (Sousedé, Čím se soused živí, Obchod, Výměna lidí, Nákup osiva, dobytek a koně od souseda), `kinship.md` (Sňatky z okolí), `lord.md` (Manželky z okolí), `crafts.md` (Nákup u sousedů, Vozy), `wagons.md` (Kování vozů – cesta k sousedovi), `horses.md` (Kování – cizí kovář; Nákup a prodej), `fields.md` (Osivo pro ves bez zásob – nákup), `steward.md` (Obilí a lov v nouzi – obilí; Odchod syna – „vlastní ves nahradí souseda“), `disasters.md` (Obchod – obilí sousedů), `premium-landscapes.md` (obchodní stezka – obchod až s trhem, Martin 22. 11. 2026 „Po obchodní stezce budou jezdit karavany …“)
- Modify (jedna věta, kde text slibuje nákup od sousedů – `grep -lE "u soused|od soused|sousedovi|z okolí|cizí kovář" docs/design/*.md`): `migration.md` (Sousedé pro obchod, tabulka), `newcomers.md:93`, `production-chains.md`, `oxen.md`, `diet.md`, `hides-honey.md`, `population.md`, `villagers.md`
- Scratchpad (vlastní sezení): přepočet Vlkova sondou `/private/tmp/claude-503/-Users-martin-pracovni-Projects-Bohemia/9a7f0167-ccbc-4d15-9942-288a97ee5c46/scratchpad/d118/vlkov-alone.mts` (snímek Vlkova 12. 5. 904 v `…/scratchpad/final/live-vlkov-state.json`, tabulky `…/scratchpad/d118/scripts/report-tables.py`); chybí-li soubory, Vlkov z DB `bohemia` jen čtením a sonda podle sloupců D118

- [ ] **Step 1: Dokumenty** podle Files; `npm run check:docs` – PASS.
- [ ] **Step 2: Celé e2e** – `npm run test:e2e` (projekty chromium i worker, sériově) – PASS.
- [ ] **Step 3: Přepočet Vlkova** (markets.md – Co se ověří bod 1): základ = `git worktree add <scratchpad>/markets1-before $(git merge-base feat/landscape HEAD)` se symlinkem `node_modules` z hlavního stromu; `npx tsx …/d118/vlkov-alone.mts <kořen> 10 /Users/martin-pracovni/Projects/Bohemia` pro základ i větev. Tabulka po letech do zprávy úlohy (sloupce D118: lidé (rod), sňatky ve vsi, narození, úmrtí (hladem), svobodní muži rodu, pokrytí nástroji a keramikou, sklizeň zrna, dny hladu, štěstí). Podmínka: `error`, `nan`, `codecFail` 0, nikdo neumře hladem, lidé i rod na konci aspoň jako na začátku (21 / 8). Když ne – napsat do zprávy pro Martina, co chybí (čísla neměnit). Pak `git worktree remove`.
- [ ] **Step 4:** Celé sady z Global Constraints a `nice -n 19 npm run test:slow`.
- [ ] **Step 5: Commit** `docs: konec smyšlených sousedů v návrzích, přepočet Vlkova` (`Refs #11`).
