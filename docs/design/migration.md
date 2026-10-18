# Stěhování – domácnost na nové místo, odchod do nové vsi

Stav: schváleno 18. 10. 2026 (Martin: „Ano, takhle je to dobré, spusť to“). Implementace zatím není.

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

## Na stavitelích

- Dnes má sídlo (settlement) jednu ves a hráč jedno sídelní sídlo. Víc vsí na téže mapě = víc
  vsí jednoho sídla (nebo sídlo na vsi – rozhodnout podle schématu `settlement` / `village`);
  nová mapa = nové sídlo s polohou v mřížce světa (sloupec a řádek).
- Pořadí: (1) přestěhování domácnosti a výběr víc obydlí, (2) víc vsí a přepínač, (3) odchod na
  stejnou mapu, (4) odchod na novou mapu s mřížkou světa.
