# Příbuzenství a pohlaví – rodiny ve vsi

> **Od 23. 11. 2026 se nevěsty ani ženichové z okolí nepřivádějí** (Martin 22. 11. 2026 – [sousední vsi](neighbours.md), Martinova rozhodnutí, Sňatky; markets.md – Pravidla 1); zmínky níž o „okolí“ jsou dřívější stav, sňatky se skutečnými sousedy přijdou s plánem 3.

Stav: **23. 11. 2026 Martin zrušil hlídání příbuzenství u sňatků.** Na otázku, odkud ves bez spojení s okolím
vezme nevěsty a ženichy (sonda: zákaz do bratranců zakázal ve Vlkově od roku 923 každý možný pár): „Vynechme
příbuznost. Je to mechanika navíc“; na otázku, zda zakázat aspoň sňatky sourozenců a rodičů s dětmi: „Nehlídat nic“.
Původní znění je v [historii](history/kinship-history.md). Schváleno 18. 10. 2026 (Martin: „Pojďme na příbuzenství a pohlaví“, sňatky s okolím
varianta „c“, návrh celkem „Ano“). Implementováno týž den (`kinship.ts`, `marriage.ts`,
`households.ts`, `population.ts`) – detaily, které návrh neřešil, jsou v sekci Implementace
(návrh Clauda). 19. 10. 2026 Martin: „Vdova by se měla snažit co nejdříve vdát, ideálně ve
vesnici. Obecně by měla být pravidla nastavena tak, aby se populace co nejvíce rozrůstala.“ –
vdovy a sňatky s okolím přepracované (návrh Clauda, [rešerše](research/2026-10-19-population-growth.md))
a týž den Martin schválil, že ženatý pár, který dům nedrží, smí odejít do nového domu kdykoli
(Lidé k osídlení).

## Proč

Ves dnes zná jen lidi, jejich věk a dům. „Pár“ jsou dva libovolní lidé 16–44 v jednom domě,
takže si dítě klidně „vezme“ rodiče z jiného domu a jeden člověk se za dva roky přestěhuje
čtyřikrát (rozbor 18. 10. 2026). Skutečnou postavou hráče je **rod** ([vize](vision.md)) –
dědictví, sňatky a nástupnictví potřebují vědět, kdo je čí. Postavy ve scéně už jsou muži a ženy.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** každý člověk má pohlaví, matku, otce a manžela / manželku; děti rodí jen žena, která
  má muže (Martin – směr).
- **Cíl:** berou se jen muž a žena (příbuzenství se nehlídá – Martin 23. 11. 2026); žena se stěhuje k muži.
- **Cíl:** malá ves nevymře – nevěsty a ženichové se
  berou z okolí: **teď abstraktně, až budou okolní vsi, přes ně** (Martin – varianta c).
- **Ne-cíl (teď):** jména lidí v rozhraní, rod hráče a nástupnictví pána, věno a výkupné,
  mnohoženství, rozvody, levobočci.
- **Anti-cíl:** ves, kde se lidé stěhují tam a zpět (dnešní zacyklení).

## Pohlaví

- Narozené dítě je chlapec s pravděpodobností **105 / 205** (≈ 51,2 %), jinak dívka – los ze
  seedu vsi a dne (návrh Clauda).
- **Rodit může jen žena 16–44 let, která má manžela** (porody dnes po „párech“ – teď po
  manželských párech; četnost porodů beze změny). Muž je plodný od 16 let bez horní meze
  (návrh Clauda). Návrh issue #9: **vedlejší manželka muže rodu** rodí, i když s mužem nebydlí –
  muž ji navštěvuje (Martin, 24. 10. 2026 – [vojvodova rodina](lord.md), Manželky).
- Zakladatelé vsi: dva páry – muž a žena v každém (návrh Clauda; dnes 4 lidé). **Návrh issue #9
  fáze 1** (Martin, 24. 10. 2026): vojvoda se 4 manželkami – hlavní a 3 vedlejšími, bez
  konkubín (Martin je týž den zrušil) – a od 15. 11. 2026 i se **4 dospělými syny** (Martin: „aby
  měl vojvoda minimálně 4 dospělé (alespoň 16 let) syny“): synové 20 a 18 let hlavní manželky,
  17 a 16 let druhé manželky; otcem je vojvoda (`fatherId`), matkou jejich matka (`motherId`) –
  [vojvodova rodina](lord.md) – Rod vojvody, Zakladatelé.
- **Starší vsi** (lidé bez pohlaví): pohlaví se jednou doplní deterministicky (střídavě podle
  věku tak, aby dvojice v domě byly muž a žena, kde to jde); rodiče neznámí = nepříbuzní;
  manželé se doplní z dnešních párů v domě (nejstarší muž s nejstarší ženou…) – návrh Clauda.

## Příbuzenství

- Člověk zná **matku a otce** (při narození) a **manžela / manželku**. Sourozenci, bratranci
  a sestřenice se odvodí přes rodiče. Lidé z okolí a zakladatelé mají rodiče neznámé.
- **Sňatky příbuzenství nehlídají** (Martin 23. 11. 2026: „Nehlídat nic“; původní zákaz do bratranců je v
  [historii](history/kinship-history.md)). Rodokmen slouží rodu, dědictví, schránce odchodů a příbuzným v okolí.
  Zemřelí se v rodokmenu pamatují (jen id rodičů, ne celý stav).

## Sňatky

- **Svobodný** = muž od 16 let nebo žena 16–44 bez manžela (i vdovec a vdova, **i vdova s malými
  dětmi** – Martin, 19. 10. 2026; dřív se vdova s dětmi do 14 let nevdávala).
- **Ve vsi:** svobodný muž a svobodná žena se vezmou (věkový
  rozdíl nejvýš ≈ 15 let, **je-li jeden z nich vdovec nebo vdova, 20 let** – návrh Clauda);
  párování deterministicky – **nejdřív vdovy a vdovci** (Martin: vdova se má vdát co nejdřív,
  nejlépe ve vsi), pak ostatní od nejstarších svobodných, každý s nejbližším věkem. **Žena se
  stěhuje k muži** (rodina muže – patrilokalita raných Slovanů, návrh Clauda), i do přeplněného
  domu (Martin, 19. 10. 2026: „Jinak jde ona s dětmi k němu, i za cenu přeplnění.“). **Když drží
  dům ona a on ne, přižení se on k ní** (Martin: „Když drží vlastní dům (vdova s dětmi), muž se
  k ní přiženit smí – přestěhuje se on, když není dědicem svého domu.“). Kdo se stěhuje, vezme
  s sebou **vlastní děti mladší 16 let**. Kronika „Svatba“ jako dnes.
- **Z okolí:** ves se sňatky z okolí nepočítá – lidé se berou mezi sebou (Martin 22. 11. 2026: „…dokud bude vesnice bez spojení s okolím, ať se lidé berou mezi sebou…“ – [sousední vsi](neighbours.md), Martinova rozhodnutí, Sňatky; markets.md – Pravidla 1); sňatky se skutečnými sousedy přijdou s plánem 3. Dřívější pravidla jsou v [historii](history/kinship-history.md).
- **Muži rodu vojvody** (návrh issue #9, Martin 24. 10. 2026) smějí mít víc manželek; první je
  hlavní a podle pravidel výš. Další (vedlejší) dřív přicházely jen z okolí, takže od 23. 11. 2026
  nepřibývají a vedlejší manželky mají jen zakladatelé ([vojvodova rodina](lord.md) – Manželky,
  Další manželky). Vedlejší manželka bydlí s mužem,
  dokud jeho dům není přeplněný, pak se svými dětmi ve vlastním obydlí – [vojvodova
  rodina](lord.md), Manželky. Ostatní muži mají jednu manželku.
- **Vdovy a vdovci** se znovu žení a vdávají co nejdřív – žádná čekací doba; dítě s novým mužem
  nejdřív za 9 měsíců (population.md – rozestup porodů).
- **Sňatky čekají na zásoby (27. 10. 2026)** – návrh Clauda po recenzi pohrom (P3), **Martin 27. 10. 2026: „Ano“**: ves rostla až k mezi jídla (sňatky brzdil jen hlad), takže pojistku zásob
  nikdy neměla a po jednom krutém roce hladověla. Teď **nový sňatek jen tehdy, když výhled zásob
  z pole k příští sklizni** ([pole](fields.md) – Výhled zásob k sklizni; osivo v okně setí a zimní
  osivo se počítá jako zásoba kromě osiva, které ves ještě zaseje) **dosáhne
  pojistky** (0,5 roční potřeby, v paměti hladu po krutém roce 0,75 – [pohromy](disasters.md),
  Zásoby a pojistka). Pod pojistkou svatba **jen čeká, nikdy se nezruší**: navíc průměrně
  **3 roky × (1 − naplnění pojistky)** (`MARRIAGE_STORES.waitYears`; los dne – při prázdných
  zásobách ≈ 3 roky, v půli pojistky ≈ 1,5 roku), takže ves, která pojistku nikdy nemá, roste
  pomaleji, ale nevymře. Snoubenci, kteří čekají, se mezitím nevezmou s nikým jiným. Platí pro
  svatbu ve vsi, nevěstu i ženicha z okolí a další manželku muže rodu (šance z okolí se zmenší
  o tentýž odklad); **muži rodu vojvody stejně** (návrh Clauda – dvorec jí ze zásob vsi). Vdát se
  pryč jde dál (ubývá úst); novou hlavní manželkou z vlastních manželek (lord.md) se nikdo nebere.
  **V hájení** (prvních 30 let vsi – [populace](population.md), Hájení) sňatky nečekají: hladem
  v něm nikdo nezemře a nová ves má růst (návrh Clauda).
  Historicky: v raném novověku se sňatky v drahotě odkládaly o 1–3 roky a po ní dohnaly
  (Malthusova preventivní brzda, evropský sňatkový vzorec – Hajnal 1965).

### Svatba ve scéně

Martin (GitHub issue #2 „Svatba“, 20. 10. 2026): „Jako máme pohřeb, udělej i svatbu. Svatebčané
půjdou na některé z posvátných míst v okolí, kde budou oddáni.“ Podrobnosti jsou návrh Clauda.
**Implementováno 20. 10. 2026** – data `apps/web/lib/wedding-view.ts`, plán
`apps/web/lib/scene/wedding-plan.ts`, kreslení `wedding-renderer.ts` (oheň obřadu, věnec
s pentlemi na dubu), ukázka **Svatba** na `/dev/landscape`.

Jen zobrazení – **pravidla sňatků se nemění**. Jádro si u událostí svatby v kronice navíc pamatuje
ženicha a nevěstu (`groomId`, `brideId` – i u nevěsty a ženicha z okolí) a u svatby ve vsi jejich
domy před svatbou (`groomFromDwellingId`, `brideFromDwellingId`). Události zapsané dřív je nemají:
domy se odvodí z `fromDwellingId` / `toDwellingId` (kdo se stěhoval, šel z `from` do `to`), věk
je odhadnutý (nevěsta 19, ženich 23) a směr člověka z okolí je podle losu svatby.

- **Kdy:** v den svatby (`marriage`, `bride-from-outside`, `groom-from-outside`); dcera vdaná pryč
  svatbu ve scéně nemá – odchází ze vsi. Všechno je čistá funkce skutečného času jako pohřeb –
  začátek je začátek herního dne svatby (okno dne z hodin světa), stejný okamžik dá stejnou pózu.
  Průvod jde skutečnou chůzí, takže svatba trvá i desítky herních dnů (lidé z okolí od kraje mapy
  a zpátky); do scény jdou svatby **posledních 40 herních dnů** a scéna pozná, které skončily.
- **Místo obřadu:** posvátné místo vsi do **600 m** od domu nevěsty – **stojící navštěvovaná
  modla nebo svatyně** (rozestavěné, opuštěné a padlé ne), **živý posvátný dub** (souš ne) nebo
  **dubový háj**. Vybere se deterministicky losem ze seedu vsi a klíče svatby s vahou
  1 ÷ (vzdálenost + 40 m)² – nejbližší nejčastěji, vzdálenější někdy. U svatyně a modly se jde
  k předku (`sacredEntrance`): ve svatyni přes příkop na plochu, pár stojí 5,5 m před modlou,
  u modly 3,2 m před ní; u dubu stojí pár na kraji koruny ze strany od domu nevěsty, u háje kus
  před jeho krajem nejblíž domu. **Bez posvátného místa** se oddávají **u ohniště na návsi** 7 m
  před vchodem domu nevěsty (ne na poli) – otevřená otázka pro Martina, zatím takhle.
- **Průvod:** od vchodu domu nevěsty (nevěsta z okolí – od domu ženicha) po pěšinách a cestách.
  Vpředu **nevěsta s věncem a ženich**, za nimi po dvou **domácnosti obou** a **z každé další
  domácnosti 1–2 lidé** (napřed dospělí), nejvýš **30 postav** i s párem a lidmi z okolí; **ve
  vojvodově rodině jde celá ves**, nejvýš **40**. Tempo jako průvod pohřbu (0,6 m/s, ke
  vzdálenějšímu místu rychleji, nejvýš 1,1 m/s); kdo se do řady nevešel, čeká před domem a zařadí
  se.
- **Nevěsta nebo ženich z okolí** přijde **se svými lidmi** (otec, matka, sourozenci – 2–5 lidí)
  **od kraje mapy** ve směru, odkud je (`origin`) – po hotové zemské stezce v tom směru, jinak
  krajinou rovně – přímo k místu obřadu. Průvod ze vsi vyjde tak, aby obě skupiny došly naráz.
- **Obřad:** svatebčané stojí **v podkově kolem páru** (strana k modle, kmeni, háji nebo ohni
  zůstane volná; ve svatyni jen na ploše uvnitř příkopu), pár hledí k místu obřadu, od 60 %
  obřadu k sobě; obřad trvá 40 s, začne, až jsou všichni na místě (nejvýš 30 s po příchodu).
  **Ve svatyni hoří obě ohniště u vstupu**, na návsi ohniště z kamenů a polen (od 20 s před
  příchodem do 20 s po obřadu); u modly, dubu a háje se nehoří. **Na posvátném dubu je při
  obřadu věnec a pentle** – po svatbě zmizí.
- **Zpátky:** pár jde **průvodem do nového domova** (`weddingHome`) a za ním lidé, kteří tam
  bydlí; ostatní se rozejdou každý ke svému domu a doma zmizí. Lidé z okolí odejdou **spolu zpět
  ke kraji mapy** a zmizí; nevěsta nebo ženich z okolí jde s párem.
- **Vzhled:** nevěsta v běleném lnu s **věncem z kvítků** (kód vlasů v barvě instance – žádný
  nový atribut vrcholů, WebGPU má limit 8 vertex bufferů), svatebčané **pestřeji oblečení**
  (mořena, boryt, rezeda, zelená, okr, bělený len). **Hudebníci ne** – sada klipů z 0 A.D.
  (`people.json`) nemá klip hry na nástroj a nový by znamenal znovu převést postavy.
- **Postavy svatby jdou mimo rozpočet** běžných postav (60 pracujících); lidé vsi na svatbě ubírají
  z pracujících postav ve dnech, kdy jsou vidět (lidé z okolí ne); nejvýš 60 postav svateb naráz
  (nejnovější svatby napřed).
- **Výkon** (Vlkov, Chromium s WebGL 2, M1 Pro – harness `scratchpad/zoom-perf/harness/`): snímek
  s průvodem, s obřadem a ohněm ve svatyni i s průvodem celé vsi (34 lidí) v záběru CPU
  1,1–1,4 ms, GPU 8,8–11,3 ms (bez svatby v pohledu na ves 1,45 ms a 10,1 ms); nejdelší snímek
  16,8 ms (vsync), žádný dlouhý snímek; krok animace nejvýš 0,2 ms; přeplánování lidí se svatbou
  nejvýš 4 ms (bez ní 3,1 ms).

| Rozhodnutí                                                                                | Kdo                     |
| ----------------------------------------------------------------------------------------- | ----------------------- |
| Svatba ve scéně, svatebčané jdou na posvátné místo v okolí                                | Martin (20. 10. 2026)   |
| Jen zobrazení; kronika navíc nese pár a domy před svatbou, starší zápisy z `from` / `to`  | návrh Clauda            |
| Místo do 600 m: stojící navštěvovaná modla / svatyně, živý dub, háj; váha 1 ÷ (d + 40 m)² | návrh Clauda            |
| Svatyně a modla k předku, dub na kraj koruny, háj na kraj; bez místa ohniště na návsi     | návrh Clauda (otevřené) |
| Průvod od domu nevěsty, vpředu pár; domácnosti obou a 1–2 z dalších, nejvýš 30, dvorec 40 | návrh Clauda            |
| Z okolí se 2–5 svými lidmi od kraje mapy (po stezce), obě skupiny dojdou naráz            | návrh Clauda            |
| Podkova kolem páru, obřad 40 s, pár k sobě; ohniště svatyně u vstupu hoří; věnec na dubu  | návrh Clauda            |
| Zpátky průvodem do nového domova, ostatní domů, lidé z okolí spolu ke kraji               | návrh Clauda            |
| Nevěsta s věncem v běleném lnu, svatebčané pestřeji; hudebníci ne (chybí klip)            | návrh Clauda            |
| Dcera vdaná pryč svatbu ve scéně nemá; svatby posledních 40 dnů, mimo rozpočet postav     | návrh Clauda            |

## Domácnosti

Dnešní pravidla domácností (population.md – Martinova rozhodnutí 18. 10. 2026) se přeloží na
rodiny (návrh Clauda – Martin uvidí):

- **Nová domácnost** = **ženatý syn se ženou** (a jejich dětmi), když čeká prázdný či nový dům.
  Dnešní „mladý pár“ a „dospělé děti“ jsou teď synové se ženami. **Odejít smí kdykoli, i z neplného
  domu** – každá rodina kromě té, která dům drží (dědic s rodiči, vdova s dětmi, nejstarší ženatý
  muž), jen když se zbytek domácnosti nerozpadne (Martin, 19. 10. 2026 – schválený návrh Clauda:
  „ženatý pár, který dům nedrží, smí odejít do nového nebo prázdného domu kdykoli, ne jen z plného
  domu“; ve Vlkově nešla postavit dílna uhlíře, protože se dvě ženy od souseda vdaly do neplného
  domu a pár z něj nesměl). Dřív (rozhodnutí 18. 10. 2026) jen z plné nebo přeplněné domácnosti
  a jen dokud dům zůstával plný – pravidlo bylo kvůli stěhování tam a zpět, které po zavedení
  příbuzenství odpadlo (hlídá test).
- **Dědic:** nejstarší ženatý syn zůstává s rodiči (dnešní dědic u neplodných rodičů platí
  obecně – dům dědí nejstarší syn). **Výjimka – dvorec vojvody** (Martin, 24. 10. 2026, issue #9
  fáze 1): po sňatku odcházejí všichni synové včetně nejstaršího; svobodní synové sami
  neodcházejí (návrh Clauda) – [vojvodova rodina](lord.md) – Rod vojvody.
- **Nejstarší dítě smí odejít samo** (Martin): z plného i přeplněného domu (Martin, 18. 10. 2026:
  „ať prázdný dům obsadí i plná domácnost“) smí do prázdného nebo nového domu odejít i
  **svobodný** nejstarší syn (od 16 let) – a oženit se tam (sňatkem ve vsi nebo z okolí). **Dál
  jen z plného domu** (návrh Clauda, 19. 10. 2026): svobodný muž odchodem nic nezíská – ženit se
  smí i doma, žena se stěhuje k němu – a sám by zabral dům, na který čeká rodina. Dcery odcházejí
  sňatkem.
- **Lidé k osídlení** = ženatí synové (rodiny, které dům nedrží – z jakéhokoli domu, Martin, 19. 10. 2026) a svobodní nejstarší synové plných domů, na které nečeká dům.
- **Rozpad domácnosti:** dům bez dospělého muže i ženy 16+ (jen děti, nebo jen starší) se
  přestěhuje k nejbližším příbuzným (syn, dcera, sourozenec), jinak do domu s nejvíc místy – jen
  když tam dům nepřeplní (Martin, 19. 10. 2026: „Pokud by byla domácnost kam přijde přeplněná, ať
  radši zůstane ve starém domě. I jeden obyvatel domu by jej měl být schopný udržovat, dokud
  nezemře. Pomáhají mu v tom sousedé“). Jinak zůstane doma a dům nechátrá.

## Příbuzní v sousedních vsích (kvůli válce)

Návrh Clauda kvůli schválené [válce](war.md) (Dobrovolníci a rozkaz – muži, kteří mají v cílové
vsi blízké příbuzné, nebudou chtít útočit):

- **Nevěsta z okolí si pamatuje, ze které sousední vsi přišla** – jeden z osmi směrů (S, SV, V,
  JV, J, JZ, Z, SZ – mřížka map z [války](war.md)), los ze seedu vsi a dne.
- **Dcera, která se vdala pryč, zůstane v rodokmenu** se směrem vsi, kam odešla – jen jako záznam
  (id, pohlaví, den narození, rodiče, směr), nesimuluje se. Ves ho drží, dokud ve vsi žije její
  rodič, sourozenec nebo dítě.
- **Výměna lidí se sousedem** ([obchod](trade.md) – Výměna lidí, Martin 19. 10. 2026): lidé,
  kteří přišli od souseda (rodina nebo svobodný dospělý), nesou směr souseda (`origin`) jako
  nevěsta z okolí – rodiče dospělých jsou neznámí, děti rodiny mají rodiče z rodiny. Lidé, které
  ves sousedovi dala, zůstanou v rodokmenu jako odešlí ve směru souseda (`emigrants`) – jako dcera
  vdaná pryč, dokud ve vsi žije jejich rodič, sourozenec nebo dítě.
- **Má člověk blízké příbuzné ve vsi ve směru X?** Ano, když odtamtud sám přišel (rodiče
  a sourozenci tam), když se tam vdal jeho rodič, sourozenec nebo dítě, nebo když odtamtud je jeho
  manželka / manžel, případně se tam vdal její rodič nebo sourozenec (`hasCloseKinIn`).

## Co hráč vidí

- Postavy ve scéně podle skutečného pohlaví (muž / žena), děti podle věku.
- Panel obydlí: muži, ženy, děti a starší (ikony + čísla); páry (ikona prstenu + počet).
- Upozornění: „Svatba“ (ve vsi, i vdovy), „Nevěsta z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“
  (fakty, krátké řádky) a „Rodina čeká na dům“ (rodina, která smí odejít, nemá kam).
- Ve scéně svatební průvod na posvátné místo, obřad a cesta do nového domova (Svatba ve scéně).

## Implementace – doplněné detaily (návrh Clauda)

- **Domácnost drží člověk 16–44** (muž nebo žena) – dům bez nikoho takového (jen děti, nebo jen
  starší) se rozpadne; dřív stačil člověk 14–44. Osamělý člověk 16–44 se nerozpadá – je svobodný
  a vezme se.
- **Rozpad k příbuzným:** do domu syna, pak dcery, pak sourozence kohokoli z rozpadlé domácnosti
  (v každé skupině dům s nejvíc volnými místy), jinak do domu s nejvíc volnými místy – vždy jen do
  domu, kam se všichni vejdou bez přeplnění; když takový není, zůstanou doma (Martin). Samotné děti
  (nikdo od 16 let) jdou k příbuzným i do přeplněného domu – samy bydlet nemohou.
- **Svatba ve vsi (od 19. 10. 2026):** vdova a vdovec = svobodný, který má (nebo měl) dítě –
  děti se rodí jen manželům, takže se pozná i ve vsích uložených dřív (vdova, jejíž všechny děti
  zemřely bez potomků, se nepozná – zjednodušení). **Kdo drží dům:** když s ním odejdou jeho děti
  do 16 let a doma po nich nezůstane nikdo 16–44 (vdova s dětmi, dcera nebo syn, po kterých by
  zůstali jen starší a děti). Syn, po kterém doma zůstane otec nebo sourozenec 16–44, dům nedrží,
  ani kdo žije sám bez dětí – ten se smí přiženit jinam a jeho dům osídlí čekající rodina.
  **Kam:** žena k muži; drží-li dům ona a on ne, on k ní; drží-li ho oba, stěhuje se ten, u koho
  bude po svatbě méně těsno (lidé nad kapacitu), při shodě žena – jinak by vdova s pěti dětmi
  odešla z polozemnice do zemnice a polozemnice zůstala prázdná. Přeplněný dům ani rozpad
  domácnosti, ze které nevěsta odchází, svatbě nebrání (dřív ano – ženichův dům směl být po
  svatbě nejvýš o jednoho přes kapacitu); zbytek rozpadlé domácnosti jde k příbuzným, když se
  tam vejde, jinak zůstane doma. Stěhování tam a zpět nevznikne: kdo se přiženil, je ženatý
  a dům drží s ženou (hlídá test 80 let tří vsí i „11× za 10 dní“). Párování: vdovy a vdovci
  první, pak od nejstaršího svobodného, každý s nejbližším věkem, se kterým svatba jde; jeden
  sňatek na člověka a den, krok 6 simulace po obsazení prázdných obydlí. Kronika rozliší
  vdovu a ženicha, který se přiženil („Svatba – k vdově se přiženil muž ze vsi.“).
- **Z okolí:** od 23. 11. 2026 nikdo nepřichází ani neodchází (Sňatky – Z okolí výš); staré zápisy
  kroniky „Nevěsta z okolí“, „Ženich z okolí“ a „Dcera se vdala pryč“ zůstávají. Dřívější pravidla
  implementace jsou v [historii](history/kinship-history.md) – Sňatky z okolí.
- **Vdova s malými dětmi se vdává** (Martin, 19. 10. 2026) – dřív zůstávala v domě manžela,
  dokud jí děti nebyly 14 (ve Vlkově proto 21letá matka pětiletého syna nesměla za nikoho).
- **Po svatbě nejdřív za 9 měsíců dítě** (population.md – rozestup porodů); stejně zakladatelé
  vsi od založení.
- **Domácnosti:** rodina = muž, žena a jejich svobodné děti z domu. Ženatý syn = muž, jehož matka
  nebo otec bydlí v domě; dědic = nejstarší ženatý syn a s ním zůstávají jeho rodiče; v domě bez
  ženatého syna drží dům vdova s vlastními dětmi (Martin, 19. 10. 2026 – ve Vlkově mladý pár
  nesměl z přeplněného domu vdovy do prázdné polozemnice; návrh Clauda) a ženatí smí všichni,
  jinak zůstává nejstarší ženatý muž. Všichni ostatní ženatí se oddělí – i ženatý muž bez
  rodičů v domě vedle dědice (starší vsi mají rodiče neznámé; oprava 19. 10. 2026 – ve Vlkově
  takhle přeplněný dvorec nedal nikoho k osídlení). Svobodný syn smí odejít sám jen z plného nebo
  přeplněného domu (Martin – i plná domácnost), od 16 let; když dědic ještě není a matka synů už
  nemůže rodit, zůstává nejstarší syn (Martinův dědic u neplodných rodičů) a odejde druhý. Bez
  svobodného syna smí odejít i jiný svobodný muž od 16 let, který v domě nemá rodiče a není otcem
  nikoho z domu (Martin, 19. 10. 2026 – „Jedna polozemnice je přeplněná a jsou v ní 4 dospělí.
  Tohle by se mělo nějak řešit“: ve Vlkově 25letý muž s neznámými rodiči nesměl do prázdné
  polozemnice; návrh Clauda). Zpátky
  ho vrátí nanejvýš svatba s vdovou nebo dědičkou, která drží dům – jednou, pak je ženatý; sestra
  ani matka si ho nevezme (bez příbuzenství tu vznikalo stěhování tam a zpět – 11× za 10 dní,
  hlídá test).
- **Lidé k osídlení:** v každém domě rodiny, které dům nedrží a smí odejít, dokud se zbytek
  domácnosti nerozpadá (`departingFamilies` – plnost domu nerozhoduje, Martin 19. 10. 2026), a když
  žádná není, svobodný syn plného domu. Prázdný dům osídlí první taková rodina – z nejvíc
  přeplněného domu, v něm od nejstaršího muže. Založená ves má lidi k osídlení, jakmile se děti
  zakladatelů vezmou (mladší pár dům nedrží – drží ho nejstarší ženatý muž); dřív až když byl dům
  zakladatelů plný. Upozornění „Rodina čeká na dům“ (dřív „Domácnost je plná“).
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

**Naměřeno 19. 10. 2026** (vdovy, ženich z okolí, porody podle věku, odchod ženatého páru
i z neplného domu; `measure-village.ts 20 60`, před → po; podrobně population.md – Kalibrace):

- vdovy 16–44: znovu se vdalo 32 → 89 %, doba do sňatku medián 2,2 → 0,1 roku (p90 11 → 2,4);
  vdovci 16–59: 90 → 88 %, medián 1,2 → 0,9 roku,
- sňatky na ves za 60 let (hráč staví): ve vsi 4,4 → 7,5, nevěsty z okolí 7,3 → 7,0, ženichové
  z okolí 0 → 4,5, vdané pryč 4,3 → 2,7; bez staveb ve vsi 2,4 → 3,6, ženichové 0 → 1,5, pryč
  3,1 → 1,6,
- dospělých mužů na 100 žen 80 → 96; lidí po 60 letech 25 → 40 (bez staveb 8 → 10), vymření
  1 → 0 z 20 (bez staveb 4 → 0 z 20).
- **Vlkov** (kopie stavu 20. 12. 767, 32 lidí, bez staveb hráče, 10 let): vdova 31 let s pěti
  dětmi si 3. 5. 768 vzala šestnáctiletého souseda, který se k ní přiženil do polozemnice;
  21letá matka pětiletého syna dostala 22. 6. 768 ženicha z okolí (29 let). Dřív se dcera za
  10 let nevdala a vdova až po 4 letech za vdovce. Po 10 letech 37 lidí (dřív 34), 15 porodů (13),
  první lidé k osídlení 20. 6. 770 (dřív 19. 9. 774). Kopie 3. 3. 770 (dvě ženy od souseda, kód
  feat/landscape): první lidé k osídlení 2. 9. 770 (dřív 3. 5. 775), po roce 2, po dvou 3 –
  ke ženám od souseda se přiženili muži z okolí (15. 8. 770 a 7. 3. 771).

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

| Rozhodnutí                                                                                 | Kdo                                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Pohlaví, matka, otec, manžel; děti jen manželské páry                                      | Martin                                    |
| ~~Sňatky z okolí: teď abstraktně, až budou okolní vsi, přes ně (varianta c)~~              | Martin                                    |
| Bez spojení s okolím se lidé berou mezi sebou, pak partner z náhodné dostupné vsi (plán 3) | Martin (22. 11. 2026)                     |
| 105 chlapců na 100 dívek; žena plodná 16–44, muž od 16 bez meze; zakladatelé dva páry      | návrh Clauda                              |
| Sňatky nehlídají příbuzenství („Nehlídat nic“); žena se stěhuje k muži; rozdíl do ≈ 15 let | Martin 23. 11. 2026 / návrh Clauda        |
| ~~Z okolí ≈ 30 % ročně pro svobodného muže / ženu od 18 bez možného partnera ve vsi~~      | návrh Clauda                              |
| Domácnosti: ženatý syn zakládá, nejstarší syn dědí, svobodný nejstarší syn smí odejít sám  | návrh Clauda                              |
| ~~Nová domácnost a lidé k osídlení jen z plné nebo přeplněné domácnosti~~                  | návrh Clauda (podle Martinových pravidel) |
| Ženatý pár, který dům nedrží, smí odejít do nového nebo prázdného domu kdykoli             | Martin (19. 10. 2026), návrh Clauda       |
| Svobodný syn smí odejít sám dál jen z plného domu                                          | návrh Clauda (19. 10. 2026)               |
| Starší vsi: pohlaví a manželé se doplní jednou deterministicky, rodiče neznámí             | návrh Clauda                              |
| Sňatky čekají na pojistku zásob – odklad průměrně 3 roky × (1 − naplnění), nikdy zákaz     | Martin (27. 10. 2026), návrh Clauda       |
| Nevěsta z okolí si pamatuje směr vsi, vdaná pryč zůstane v rodokmenu se směrem (válka)     | návrh Clauda                              |
| Domácnost drží člověk 16–44; rozpad k příbuzným; ~~vdova s dětmi do 14 se nevdává~~        | návrh Clauda                              |
| ~~Svatba nepřeplní dům víc než o jednoho~~; ~~v hladu nevěsta z okolí nepřijde~~           | návrh Clauda                              |
| Vdova se vdává co nejdřív, nejlépe ve vsi; s dětmi; žena jde k muži i do přeplnění         | Martin (19. 10. 2026)                     |
| Drží-li dům žena a muž ne, přižení se muž k ní (i z okolí)                                 | Martin (19. 10. 2026)                     |
| Vdovy a vdovci mají přednost; rozdíl věku u nich 20 let; děti do 16 jdou s rodičem         | návrh Clauda (19. 10. 2026)               |
| Drží-li dům oba, stěhuje se, u koho bude méně těsno; přeplnění ani rozpad svatbě nebrání   | návrh Clauda (19. 10. 2026)               |
| ~~Ženich z okolí 10 % ročně (vdově, dědičce, ženě z domu bez mužů 50 %), pryč 20 % ročně~~ | návrh Clauda (19. 10. 2026)               |
| ~~Nevěsta z okolí 30 % ročně; v hladu a do přeplněného domu z okolí nikdo nepřijde~~       | návrh Clauda                              |
