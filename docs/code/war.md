# Válka – kód

Pravidla: [docs/design/war.md](../design/war.md). Hotová je síla vojska a stropy výcviku
(Ú6.1) a válka mezi rody s ochranou nováčka a opovědí (Ú6.2); tažení, boj a dohra přibývají v dalších úlohách.

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
