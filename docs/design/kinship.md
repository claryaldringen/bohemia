# Příbuzenství a pohlaví – rodiny ve vsi

Stav: schváleno 18. 10. 2026 (Martin: „Pojďme na příbuzenství a pohlaví“, sňatky s okolím
varianta „c“, návrh celkem „Ano“). Implementováno týž den (`kinship.ts`, `marriage.ts`,
`households.ts`, `population.ts`) – detaily, které návrh neřešil, jsou v sekci Implementace
(návrh Clauda).

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
  **Jen z plné nebo přeplněné domácnosti** (rozhodnutí 18. 10. 2026 podle Martinových „plná
  domácnost → nová domácnost v novém obydlí“ a „ať prázdný dům obsadí i plná domácnost“ – z neplného
  domu ne, ani druhý pár zakladatelů): z plného domu odejde rodina, dokud dům před jejím odchodem
  zůstává plný – obvykle jedna.
- **Dědic:** nejstarší ženatý syn zůstává s rodiči (dnešní dědic u neplodných rodičů platí
  obecně – dům dědí nejstarší syn).
- **Nejstarší dítě smí odejít samo** (Martin): z plného i přeplněného domu (Martin, 18. 10. 2026:
  „ať prázdný dům obsadí i plná domácnost“) smí do prázdného nebo nového domu odejít i
  **svobodný** nejstarší syn (od 16 let) – a oženit se tam (sňatkem ve vsi nebo z okolí). Dcery
  odcházejí sňatkem.
- **Lidé k osídlení** = ženatí synové plných a přeplněných domů (a svobodní nejstarší synové
  plných domů), na které nečeká dům.
- **Rozpad domácnosti:** dům bez dospělého muže i ženy 16+ (jen děti, nebo jen starší) se
  přestěhuje k nejbližším příbuzným (syn, dcera, sourozenec), jinak do domu s nejvíc místy.

## Příbuzní v sousedních vsích (kvůli válce)

Návrh Clauda kvůli schválené [válce](war.md) (Dobrovolníci a rozkaz – muži, kteří mají v cílové
vsi blízké příbuzné, nebudou chtít útočit):

- **Nevěsta z okolí si pamatuje, ze které sousední vsi přišla** – jeden z osmi směrů (S, SV, V,
  JV, J, JZ, Z, SZ – mřížka map z [války](war.md)), los ze seedu vsi a dne.
- **Dcera, která se vdala pryč, zůstane v rodokmenu** se směrem vsi, kam odešla – jen jako záznam
  (id, pohlaví, den narození, rodiče, směr), nesimuluje se. Ves ho drží, dokud ve vsi žije její
  rodič, sourozenec nebo dítě.
- **Má člověk blízké příbuzné ve vsi ve směru X?** Ano, když odtamtud sám přišel (rodiče
  a sourozenci tam), když se tam vdal jeho rodič, sourozenec nebo dítě, nebo když odtamtud je jeho
  manželka / manžel, případně se tam vdal její rodič nebo sourozenec (`hasCloseKinIn`).

## Co hráč vidí

- Postavy ve scéně podle skutečného pohlaví (muž / žena), děti podle věku.
- Panel obydlí: muži, ženy, děti a starší (ikony + čísla); páry (ikona prstenu + počet).
- Upozornění: „Svatba“ (ve vsi), „Nevěsta z okolí“, „Dcera se vdala pryč“ (fakty, krátké řádky).

## Implementace – doplněné detaily (návrh Clauda)

- **Domácnost drží člověk 16–44** (muž nebo žena) – dům bez nikoho takového (jen děti, nebo jen
  starší) se rozpadne; dřív stačil člověk 14–44. Osamělý člověk 16–44 se nerozpadá – je svobodný
  a vezme se.
- **Rozpad k příbuzným:** do domu syna, pak dcery, pak sourozence kohokoli z rozpadlé domácnosti
  (v každé skupině dům s nejvíc volnými místy), jinak do domu s nejvíc volnými místy.
- **Svatba ve vsi:** nevěsta se smí přestěhovat, jen když se její domácnost odchodem nerozpadne,
  a ženichův dům nesmí být přeplněný (po svatbě nejvýš o jednoho přes kapacitu). Ženich se
  nestěhuje, takže svatba nikoho nevrací do domu, ze kterého odešel – stěhování tam a zpět
  (rozbor 18. 10. 2026) nevznikne (hlídá test 80 let tří vsí). Párování od nejstaršího
  svobodného, každý s nejbližším věkem, se kterým svatba jde; jeden sňatek na člověka a den,
  krok 6 simulace po obsazení prázdných obydlí.
- **Z okolí:** denní pravděpodobnost odpovídá 30 % ročně; „nemá s kým se vzít“ = ve vsi není
  nikdo, s kým by svatba dnes šla. Nevěsta z okolí nepřijde do přeplněného domu ani **když ves
  hladoví** (byla by jen další ústa). Dcera se vdá pryč, jen když se její domácnost odchodem
  nerozpadne.
- **Vdova s vlastními dětmi do 14 let** se nevdává – zůstává v domě manžela.
- **Domácnosti:** rodina = muž, žena a jejich svobodné děti z domu. Ženatý syn = muž, jehož matka
  nebo otec bydlí v domě; dědic = nejstarší ženatý syn; v domě bez rodičů zůstává nejstarší
  ženatý muž a ostatní ženatí (bratři) se oddělí. Svobodný syn smí odejít sám jen z plného nebo
  přeplněného domu (Martin – i plná domácnost), od 16 let; když dědic ještě není a matka synů už
  nemůže rodit, zůstává nejstarší syn (Martinův dědic u neplodných rodičů) a odejde druhý. Zpátky
  ho nic nevrátí – sňatkem se stěhuje žena k muži a sestra ani matka si ho nevezme (bez
  příbuzenství tu vznikalo stěhování tam a zpět – 11× za 10 dní, hlídá test).
- **Lidé k osídlení:** v každém plném nebo přeplněném domě rodiny, které odejdou, dokud dům zůstává
  plný (`departingFamilies`), a když žádná není, svobodný syn plného domu. Založená ves (manželé
  a jejich děti, i když se pak vezmou) nemá lidi k osídlení, dokud dům zakladatelů není plný.
- **Rodokmen** drží zemřelé a odešlé jen jako id a jejich rodiče, a jen dokud jsou rodičem
  někoho žijícího – tak jde poznat prarodiče, strýce i bratrance a stav neroste do nekonečna.
- **Převod starých vsí** (`withKinship`, při načtení i na začátku dopočtu, bez příznaku – ves
  s pohlavím všech lidí se nemění): v domě od nejstaršího střídavě muž, žena…; manželé = každý
  muž od 16 let s nejstarší dosud volnou ženou od 16 let v domě, jsou-li od sebe nejvýš 15 let.
- **Postavy ve scéně:** podíl žen u každé činnosti (dřív pevný) se posune podle podílu žen ve vsi
  (muži / ženy 14–44, starší, děti); šátek nosí ženy podle podílu vdaných.
- **Martinova ves Vlkov** (stav 3. 8. 694 z lokální databáze): polozemnice 27, 11, 6, 6, 5, 4
  a zemnice 47, 45, 24, 21, 13, 4 → převod: v zemnici manželé 47 a 45 a 24 a 21, v polozemnici
  27letý svobodný s dětmi. Odhad na 30 let (bez vrstvy překážek): 19 lidí, 20 porodů, 13 úmrtí,
  3 svatby ve vsi, 2 nevěsty z okolí, 2 dcery vdané pryč (bez příbuzenství 17 lidí, 17 porodů).

## Kalibrace

`measure-village.ts 30 60` (18. 10. 2026, bez příbuzenství → s ním; měřeno ještě před povolením
odchodu svobodného syna z plného domu):

- první možnost stavět: medián 5,0 → 4,0 roku, p90 10,1 → 4,0 (jedna ves z 30 za 60 let lidi
  k osídlení nedostala); zemnice čerstvě plnou domácností 164 → 99 dní, polozemnice 579 → 408 –
  obojí teď v cíli,
- ves, kde hráč staví: vymření 0 → 1 z 30 vsí za 60 let, na konci domácností medián 4 → 3, lidí
  19 → 17,
- jediná domácnost bez staveb: vymření 0 → 3 z 30 (medián po 51 letech), žijící mají medián 7
  lidí (5) – sourozenci se už nevezmou, rod závisí na nevěstách z okolí,
- nasycení beze změny (≥ 0,95 v 99,7 % let), společná práce domácnosti 14 → 23 člověkodní ročně.
- Rychlé srovnání 30 vsí × 60 let se syntetickým polem a hráčem, který staví (skript mimo repo):
  porodů medián 17 → 23, vymřelých 13 → 1 z 30 – bez příbuzenství tam „páry“ z libovolných lidí
  stěhováním rozbíjely domácnosti.

## Rozhodnutí

| Rozhodnutí                                                                                | Kdo                                    |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| Pohlaví, matka, otec, manžel; děti jen manželské páry                                     | Martin                                 |
| Sňatky z okolí: teď abstraktně, až budou okolní vsi, přes ně (varianta c)                 | Martin                                 |
| 105 chlapců na 100 dívek; žena plodná 16–44, muž od 16 bez meze; zakladatelé dva páry     | návrh Clauda                           |
| Blízcí příbuzní do bratranců; žena se stěhuje k muži; věkový rozdíl do ≈ 15 let           | návrh Clauda                           |
| Z okolí ≈ 30 % ročně pro svobodného muže / ženu od 18 bez možného partnera ve vsi         | návrh Clauda                           |
| Domácnosti: ženatý syn zakládá, nejstarší syn dědí, svobodný nejstarší syn smí odejít sám | návrh Clauda                           |
| Nová domácnost a lidé k osídlení jen z plné nebo přeplněné domácnosti                     | podle Martina, rozhodnuto 18. 10. 2026 |
| Starší vsi: pohlaví a manželé se doplní jednou deterministicky, rodiče neznámí            | návrh Clauda                           |
| Nevěsta z okolí si pamatuje směr vsi, vdaná pryč zůstane v rodokmenu se směrem (válka)    | návrh Clauda                           |
| Domácnost drží člověk 16–44; rozpad k příbuzným; vdova s dětmi do 14 se nevdává           | návrh Clauda                           |
| Svatba nepřeplní dům víc než o jednoho; v hladu nevěsta z okolí nepřijde                  | návrh Clauda                           |
