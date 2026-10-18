# Příbuzenství a pohlaví – rodiny ve vsi

Stav: schváleno 18. 10. 2026 (Martin: „Pojďme na příbuzenství a pohlaví“, sňatky s okolím
varianta „c“, návrh celkem „Ano“). Implementace zatím není.

## Proč

Ves dnes zná jen lidi, jejich věk a dům. „Pár“ jsou dva libovolní lidé 16–44 v jednom domě,
takže si dítě klidně „vezme“ rodiče z jiného domu a jeden člověk se za dva roky přestěhuje
čtyřikrát (rozbor 18. 10. 2026). Skutečnou postavou hráče je **rod** ([vize](vision.md)) –
dědictví, sňatky a nástupnictví potřebují vědět, kdo je čí. Postavy ve scéně už jsou muži a ženy.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** každý člověk má pohlaví, matku, otce a manžela / manželku; děti rodí jen žena, která
  má muže (Martin – směr).
- **Cíl:** berou se jen muž a žena, kteří nejsou blízcí příbuzní; žena se stěhuje k muži.
- **Cíl:** malá ves nevymře jen proto, že jsou si všichni příbuzní – nevěsty a ženichové se
  berou z okolí: **teď abstraktně, až budou okolní vsi, přes ně** (Martin – varianta c).
- **Ne-cíl (teď):** jména lidí v rozhraní, rod hráče a nástupnictví pána, věno a výkupné,
  mnohoženství, rozvody, levobočci.
- **Anti-cíl:** ves, kde se lidé stěhují tam a zpět (dnešní zacyklení), nebo kde se rodí děti
  příbuzným.

## Pohlaví

- Narozené dítě je chlapec s pravděpodobností **105 / 205** (≈ 51,2 %), jinak dívka – los ze
  seedu vsi a dne (návrh Clauda).
- **Rodit může jen žena 16–44 let, která má manžela** (porody dnes po „párech“ – teď po
  manželských párech; četnost porodů beze změny). Muž je plodný od 16 let bez horní meze
  (návrh Clauda).
- Zakladatelé vsi: dva páry – muž a žena v každém (návrh Clauda; dnes 4 lidé).
- **Starší vsi** (lidé bez pohlaví): pohlaví se jednou doplní deterministicky (střídavě podle
  věku tak, aby dvojice v domě byly muž a žena, kde to jde); rodiče neznámí = nepříbuzní;
  manželé se doplní z dnešních párů v domě (nejstarší muž s nejstarší ženou…) – návrh Clauda.

## Příbuzenství

- Člověk zná **matku a otce** (při narození) a **manžela / manželku**. Sourozenci, bratranci
  a sestřenice se odvodí přes rodiče. Lidé z okolí a zakladatelé mají rodiče neznámé.
- **Blízcí příbuzní** (nesmí se vzít): rodiče a děti, prarodiče a vnoučata, sourozenci (i
  nevlastní), strýc / teta a synovec / neteř, bratranci a sestřenice (společný prarodič) –
  návrh Clauda. Zemřelí se v rodokmenu pamatují (jen id rodičů, ne celý stav).

## Sňatky

- **Svobodný** = muž od 16 let nebo žena 16–44 bez manžela (i vdovec a vdova).
- **Ve vsi:** svobodný muž a svobodná žena, kteří nejsou blízcí příbuzní, se vezmou (věkový
  rozdíl nejvýš ≈ 15 let – návrh Clauda); párování deterministicky – od nejstarších svobodných,
  každý s nejbližším věkem. **Žena se stěhuje k muži** (rodina muže – patrilokalita raných
  Slovanů, návrh Clauda). Kronika „Svatba“ jako dnes.
- **Z okolí (Martin – c):** dokud okolní vsi nejsou, svobodný muž od 18 let, který ve vsi
  nemá s kým se oženit, si **každý rok s pravděpodobností ≈ 30 %** přivede ženu z okolí (16–22
  let, rodiče neznámí); svobodná žena od 18 let bez možného ženicha se každý rok s ≈ 30 % vdá
  **pryč** (odejde ze vsi). Ves tak lidi z okolí bere i dává (návrh Clauda). Až budou okolní vsi
  (NPC vojvodové, další hráči – [válka](war.md), [stěhování](migration.md)), sňatky půjdou
  přes ně.
- **Vdovy a vdovci** se smí znovu oženit / vdát (stejná pravidla). Vdova s malými dětmi zůstává
  v domě manžela (návrh Clauda).

## Domácnosti

Dnešní pravidla domácností (population.md – Martinova rozhodnutí 18. 10. 2026) se přeloží na
rodiny (návrh Clauda – Martin uvidí):

- **Nová domácnost** = **ženatý syn se ženou** (a jejich dětmi), když je dům přeplněný nebo když
  čeká prázdný či nový dům. Dnešní „mladý pár“ a „dospělé děti“ jsou teď synové se ženami.
- **Dědic:** nejstarší ženatý syn zůstává s rodiči (dnešní dědic u neplodných rodičů platí
  obecně – dům dědí nejstarší syn).
- **Nejstarší dítě smí odejít samo** (Martin): z přeplněného domu smí do prázdného nebo nového
  domu odejít i **svobodný** nejstarší syn (od 16 let) – a oženit se tam (sňatkem ve vsi nebo
  z okolí). Dcery odcházejí sňatkem.
- **Lidé k osídlení** = ženatí synové (a svobodní nejstarší synové přeplněných domů), na které
  nečeká dům.
- **Rozpad domácnosti:** dům bez dospělého muže i ženy 16+ (jen děti, nebo jen starší) se
  přestěhuje k nejbližším příbuzným (syn, dcera, sourozenec), jinak do domu s nejvíc místy.

## Co hráč vidí

- Postavy ve scéně podle skutečného pohlaví (muž / žena), děti podle věku.
- Panel obydlí: muži, ženy, děti a starší (ikony + čísla); páry (ikona prstenu + počet).
- Upozornění: „Svatba“ (ve vsi), „Nevěsta z okolí“, „Dcera se vdala pryč“ (fakty, krátké řádky).

## Rozhodnutí

| Rozhodnutí                                                                                | Kdo          |
| ----------------------------------------------------------------------------------------- | ------------ |
| Pohlaví, matka, otec, manžel; děti jen manželské páry                                     | Martin       |
| Sňatky z okolí: teď abstraktně, až budou okolní vsi, přes ně (varianta c)                 | Martin       |
| 105 chlapců na 100 dívek; žena plodná 16–44, muž od 16 bez meze; zakladatelé dva páry     | návrh Clauda |
| Blízcí příbuzní do bratranců; žena se stěhuje k muži; věkový rozdíl do ≈ 15 let           | návrh Clauda |
| Z okolí ≈ 30 % ročně pro svobodného muže / ženu od 18 bez možného partnera ve vsi         | návrh Clauda |
| Domácnosti: ženatý syn zakládá, nejstarší syn dědí, svobodný nejstarší syn smí odejít sám | návrh Clauda |
| Starší vsi: pohlaví a manželé se doplní jednou deterministicky, rodiče neznámí            | návrh Clauda |
