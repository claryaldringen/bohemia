# Stěhování – domácnost na nové místo, odchod do nové vsi

Stav: schváleno 18. 10. 2026 (Martin: „Ano, takhle je to dobré, spusť to“). Fáze 1 (přestěhování
domácnosti, výběr víc obydlí) a 2 (víc vsí, přepínač) jsou hotové; fáze 3 a 4 (odchod do nové vsi)
čekají – viz Na stavitelích.

## Proč

Raní Slované stěhovali domy i celé vsi často (Martin: „V minulosti se to dělo mockrát“). Dům
dožil, pole kolem se vyčerpala, ves přerostla, co okolí uživí – a část lidí odešla založit ves
jinde. Hráč má mít obojí v rukou: **přestěhovat domácnost** na jiné místo vsi a **vyvést část
lidí** do nové vsi na stejné nebo nové mapě (Martin). K odchodu na novou mapu dojde hlavně tehdy,
když ves přeroste, co ji mapa uživí (Martin) – a stará ves zůstane.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** vybrané obydlí → „Přestěhovat“ → hráč umístí nový dům, obyvatelé si ho postaví a
  přestěhují se; starý dům zůstane prázdný (Martin).
- **Cíl:** hráč označí víc obydlí (nebo všechna), vyvede jejich lidi a založí s nimi ves jinde
  na stejné mapě nebo na nové mapě (Martin).
- **Cíl:** když odejde jen část, **stará ves zůstane** – hráč má víc vsí a přepíná mezi nimi
  (Martin).
- **Ne-cíl (teď):** stěhování do cizí (obydlené) vsi, osidlování vsi NPC vojvody, vazalské
  vztahy mezi vlastními vsemi, obchod a převoz zásob mezi vsemi později než při odchodu.
- **Anti-cíl:** hráč, který stěhováním obchází pravidla (např. lidé, kteří se „přestěhují“ bez
  práce, nebo vyvedení lidí, aby stará ves nemusela živit staré a děti).

## Přestěhování domácnosti (na stejné mapě)

- U vybraného obydlí tlačítko **Přestěhovat** → umisťování nového domu jako u stavby obydlí
  (stejné kontroly, cena, dřevo, pozemek polozemnice). Hráč volí typ (zemnice / polozemnice).
- Je to **nová stavba bez lidí k osídlení** – domácnost už existuje, jen si staví nový dům
  (návrh Clauda). Stavba jde ze společné práce vsi jako každá jiná.
- Obyvatelé **bydlí ve starém domě, dokud nový nedostaví**, pak se přestěhují (návrh Clauda).
  Starý dům je pak **prázdný** – může ho obsadit jiná domácnost (mladý pár, dospělé děti, sňatek),
  jinak chátrá a rozpadá se jako každý opuštěný dům ([population.md](population.md)).
- Rozestavěné přestěhování jde zrušit (jako stavbu – vyhrazené dřevo se vrátí na hromadu).
- Pole, sad a hřbitov zůstávají vsi – nic se nepřepisuje.

## Výběr víc obydlí

- **Ctrl / Shift + kliknutí** přidá nebo ubere obydlí z výběru; tlačítko a klávesa **„Všechna
  obydlí“** (návrh Clauda: Ctrl + A) označí všechna obydlí vsi. Panel výběru pak ukáže počet
  domácností a lidí (ikony + čísla) a tlačítka **Přestěhovat** (každá domácnost dostane nový dům –
  umisťuje se postupně, Shift jako u staveb) a **Odejít**.

## Odchod do nové vsi

- **Odejít** s vybranými obydlími: jejich domácnosti (všichni lidé) opustí ves. Domy zůstanou
  prázdné (obsadit je může zbytek vsi, jinak se rozpadají).
- **Kam:**
  - **jinam na stejné mapě** – hráč umístí první zemnici nové vsi na téže krajině (stejně jako
    při založení vsi, mimo stávající ves – nejméně ≈ 300 m od jejích staveb, návrh Clauda);
    vznikne **druhá ves na téže mapě** se svým jménem, poli a zásobami;
  - **na novou mapu** – hráč zvolí směr (8 šipek – jako v [návrhu války](war.md)); vedle mapy
    staré vsi vznikne nová mapa (nové sídlo s novou krajinou, poloha v mřížce světa vedle staré –
    první kus mřížky map, na kterou naváže válka). Cesta trvá **1–3 herní dny** podle terénu
    (návrh Clauda – jako ve válce), pak hráč na nové krajině umístí první zemnici.
- **Co si vezmou** (návrh Clauda): jídlo, které unesou – **≈ 25 kg na člověka od 7 let** (obilí,
  maso, sýr, luštěniny, ovoce podle zásob, nejvýš poměrný díl zásob vsi podle počtu lidí), a **poměrný díl stád**
  (ovce, kozy, prasata, krávy; voli a spřežení zůstávají ve staré vsi, pokud hráč nevybere
  obydlí, jehož domácnost je vede – zjednodušeně: zůstávají). Klády, nástroje a keramika zůstanou.
- Nová ves začíná jako při založení: lidé bydlí na staveništi první zemnice, dokud ji nepostaví;
  další domy staví hráč jako vždy. Jméno navrhne hra (`suggestVillageName`), jde přejmenovat.
- **Stará ves zůstane** (Martin), i když v ní zbude jen málo lidí; když odejdou všichni, stará
  ves je opuštěná (nevymřelá – kronika „ves opuštěna“), dál se nesimuluje a její domy se
  rozpadají.

## Víc vsí jednoho hráče

- Hráč (hlava rodu) má víc vsí. **Jméno vsi v horní liště** je přepínač – seznam vsí (jméno,
  lidé), klik přepne pohled na jinou ves (na jiné mapě se načte její krajina). Přejmenování
  zůstane u jména vybrané vsi (jako dnes – návrh Clauda: dvojklik nebo ikona).
- Každá ves se simuluje sama (stejná pravidla, vlastní zásoby, práce a lidé); vsi spolu zatím
  nic nesdílejí.
- **Konec hry**, až vymřou **všechny** vsi hráče (už dnes – `isGameOver`).
- Upozornění z jiné vsi (hlad, vymírání) se ukážou i při pohledu na jinou ves – krátký řádek se
  jménem vsi (návrh Clauda).

## Co hráč vidí

- Tlačítka v panelu výběru: Přestěhovat, Odejít (ikony, popisek s cenou / počtem lidí – jako
  v 0 A.D.).
- Při přestěhování: staveniště nového domu, obyvatelé chodí stavět; po dostavění se přestěhují.
- Při odchodu: lidé odejdou ke kraji mapy (směr), mapa nové vsi se načte; na stejné mapě lidé
  dojdou na místo nové vsi.
- Přepínač vsí v horní liště.

## Rozhodnutí

| Rozhodnutí                                                                                  | Kdo          |
| ------------------------------------------------------------------------------------------- | ------------ |
| Přestěhování domácnosti: obyvatelé postaví nový dům jinde, starý zůstane prázdný             | Martin       |
| Výběr víc / všech obydlí, vyvedení lidí do nové vsi na stejné nebo nové mapě                | Martin       |
| Při odchodu části lidí stará ves zůstane – hráč má víc vsí                                  | Martin       |
| Přestěhování bez lidí k osídlení, bydlí ve starém do dostavění; Ctrl/Shift + klik, Ctrl + A | návrh Clauda |
| Nová ves ≥ 300 m od staré na téže mapě; nová mapa vedle staré v mřížce, cesta 1–3 dny       | návrh Clauda |
| S sebou 25 kg jídla na člověka od 7 let a poměrný díl stád; klády a výrobky zůstanou        | návrh Clauda |
| Přepínač vsí jménem v horní liště; upozornění z jiných vsí se jménem                         | návrh Clauda |
| Víc vsí na mapě = víc vsí sídla (ves má vlastní id), nová mapa = sídlo s polohou v mřížce   | návrh Clauda |
| Vybraná ves v cookie; ves na téže mapě se přepne na místě, na jiné mapě novým načtením      | návrh Clauda |
| Typ nového domu dvěma tlačítky v panelu (zemnice, polozemnice); Ctrl + A jen hotová obydlí  | návrh Clauda |

## Na stavitelích

- Dnes má sídlo (settlement) jednu ves a hráč jedno sídelní sídlo. Víc vsí na téže mapě = víc
  vsí jednoho sídla (nebo sídlo na vsi – rozhodnout podle schématu `settlement` / `village`);
  nová mapa = nové sídlo s polohou v mřížce světa (sloupec a řádek).
- Pořadí: (1) přestěhování domácnosti a výběr víc obydlí, (2) víc vsí a přepínač, (3) odchod na
  stejnou mapu, (4) odchod na novou mapu s mřížkou světa.

### Stav fází

1. **Přestěhování domácnosti a výběr víc obydlí – hotovo.** Jádro `relocation.ts` a akce
   `startRelocation` / `cancelRelocation` (`actions.ts`), use-casy `relocate-household.ts`, panel
   výběru (`RelocationControls.tsx`), výběr víc obydlí `village-selection.ts`.
2. **Víc vsí a přepínač – hotovo.** Migrace `0005_multi_village`, use-casy podle id vsi,
   `player-villages.ts`, přepínač `VillageSwitcher.tsx`, vývojová druhá ves na téže mapě.
3. Odchod na stejnou mapu – čeká.
4. Odchod na novou mapu s mřížkou světa – čeká.

### Rozhodnutí fází 1 a 2 (návrh Clauda)

- **Schéma – nejmenší změna:** ves dostala vlastní `id` (UUID, primární klíč), `settlement_id`
  zůstal jen cizím klíčem s indexem – víc vsí na téže mapě je víc vsí jednoho sídla (krajina,
  seed a verze vrstev patří sídlu, nekopírují se do vsí). Nová mapa je nové sídlo hráče
  (`is_seat` false) se sloupci `grid_x` (sloupec) a `grid_y` (řádek) mřížky světa; na políčku
  leží nejvýš jedno aktivní sídlo (unikátní index přes všechny hráče – svět je jeden, war.md).
  Sídelní sídla z doby před mřížkou polohu nemají (null). Nesahal jsem na vazalství ani na
  oddělenou tabulku map – sídlo už mapou je.
- **První ves sídla** se zakládá atomicky (`create` zamkne řádek sídla), další přidává `add` –
  souběžná založení první zemnice dál založí jedinou ves.
- **Akce podle id vsi:** každá server action nese `villageId` a server ověří, že ves leží
  v aktivním sídle hráče (`findPlayerVillage`). Konec hry a restart už šly přes všechna sídla;
  `dynastyStatus` teď prochází i všechny vsi každého sídla.
- **Výběr vsi se pamatuje v cookie** (ne v query parametru): adresa zůstane `/game`, výběr vydrží
  i po zavření prohlížeče a cizí nebo archivovaná ves se tiše vrátí na první ves hráče. Ves na
  téže mapě se přepne bez nového načtení scény (pohled skočí na ni), ves na jiné mapě načte
  stránku znovu s její krajinou.
- **Přepínač:** klik na jméno otevře seznam vsí (jméno a lidé, vymřelá zašedlá), přejmenování
  dvojklikem na jméno nebo tužkou vedle něj. Upozornění z jiné vsi: hlad, umírání hladem
  a vymření – řádek „Jméno: text“, jen když nově vznikne.
- **Přestěhování je běžná stavba obydlí** s vazbou na domácnost (`relocates`), ne nový druh
  stavby – staveniště, stavitelé, rozdělení práce a scéna fungují beze změny. Nový dům dostane
  nové id, po dostavění se do něj přestěhují všichni z domácnosti (`Person.dwellingId`), starý
  dům zůstane prázdný se svým id (dým, zvířata a slepice jdou za obyvateli samy).
- Domácnost, která si staví nový dům, **starý nepřestavuje** a druhé stěhování nezačne;
  přestavovaný dům se stěhovat nemůže. Zanikne-li domácnost během stavby (vymře, sloučí se
  k sousedům), nový dům zůstane prázdný a osídlí ho jako každé prázdné obydlí.
- **Zrušení** vrátí na hromadu klády vzaté z hromady i už skácené stromy; odvedená práce
  a odstraněné překážky staveniště propadnou.
- **Typ nového domu** volí hráč dvěma tlačítky v panelu výběru (ikona zemnice a polozemnice,
  v popisku práce a dřevo, chybějící červeně). U víc domácností se nové domy umisťují postupně
  – po umístění jednoho hned běží umisťování dalšího (jako Shift + klik), Esc zbytek zruší.
- **Výběr víc obydlí:** Ctrl (Cmd) / Shift + klik obydlí přidá nebo ubere, na prázdné zemi
  výběr nechá, jiný cíl než obydlí vybere sám (víc najednou jde vybrat jen obydlí). Ctrl + A
  vybere jen hotová obydlí – na staveništi ještě nikdo nebydlí; při umisťování nic.
- **Pohled na ves dopočítá všechny vsi hráče** (přepínač ukazuje aktuální lidi, konec hry až po
  vymření všech) – při desítkách vsí to bude chtít lehčí seznam bez dopočtu.
- **Vývojová druhá ves** (dev mód, tlačítko vedle šipek času): nová ves se 4 lidmi na
  nejbližším volném místě k místu vsi krajiny, nejméně 300 m od staveb ostatních vsí – jen pro
  vyzkoušení přepínače, lidé ze staré vsi neodcházejí.

### Připraveno pro fáze 3 a 4

- `foundAnotherVillage` (další ves téhož sídla, první zemnice nejméně 300 m od staveb ostatních
  – `villages-apart.ts`, `NEW_VILLAGE_MIN_DISTANCE_M`) – fáze 3 doplní umístění první zemnice
  hráčem, přesun vybraných domácností a jídla s sebou a kroniku „ves opuštěna“.
- `SettlementRepository.create` s polohou v mřížce (políčko jedno na svět) – fáze 4 ještě musí
  přidělit polohu sídelnímu sídlu (dnes null) při prvním odchodu a vybrat sousední políčko
  podle směru.
- Tlačítko **Odejít** je v panelu výběru (jednoho i víc obydlí) zatím zašedlé.
- **Otevřené pro fázi 3:** vsi na téže mapě o sobě nevědí – scéna kreslí jen vybranou ves,
  kontroly umístění neznají stavby druhé vsi a obě můžou kácet tytéž stromy (vrstva překážek je
  krajiny, změny má každá ves zvlášť). Do odchodu na stejnou mapu je drží od sebe jen 300 m.
