# Vojvodova rodina – výcvik místo pole

Stav: **schváleno** (Martin 23. 10. 2026: „Schvaluji, implementuj“) (23. 10. 2026, issue #8). Implementace zatím není. Koně, na kterých
vojvoda a synové jezdí, popisuje [koně](horses.md) (issue #5). Čísla zdůvodňuje
[rešerše](research/2026-10-23-horses-lord.md). Co níž není výslovně Martinovo, je návrh Clauda.

## Proč

Martin, 22. 10. 2026: „**Vojvoda a jeho synové se v ideálním případě neúčastní zemědělských prací
(pokud by měla ves hladovět, tak ano).**“ „**Věnují se tréninku lukostřelby, boje a případně
ježdění na koni.**“ „**Na dvorku vojvodova dvorce tak musí být terče na lukostřelbu.**“

Martin, 23. 10. 2026 (volba k vojvodově ženě a dcerám): „**Jen domácnost**“ – na pole nechodí,
jen při hrozícím hladu, stejně jako vojvoda se syny.

Vojvoda dosud pracoval na poli jako každý rolník. Teď se jeho rod začne lišit od vsi: muži se
cvičí pro budoucí lov a válku ([válka](war.md)) a ves za to platí jejich prací. Hráč tak poprvé
pocítí, že vojvodův dvůr něco stojí – a že rod, který nemá komu velet, mu k ničemu není.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** vojvoda a jeho synové **nepracují na poli**, cvičí **lukostřelbu, boj a jízdu na koni**
  (Martin).
- **Cíl:** vojvodova **žena a dcery vedou jen domácnost** (Martin, 23. 10. 2026).
- **Cíl:** při **hrozícím hladu** jde celá rodina na pole (Martin).
- **Cíl:** ve **žních a výmlatu** jdou na pole i cvičící muži rodiny (Martin 24. 10. 2026: „Dílny
  i vojvodova rodina“ – mění pravidlo „vojvoda a synové nepracují na poli“, issue #8).
- **Cíl:** na **dvorku dvorce stojí terče** na lukostřelbu (Martin).
- **Cíl:** výcvik se **ukládá u člověka** jako zkušenost – lov a válka ho později využijí (návrh
  Clauda).
- **Ne-cíl (teď):** zbraně jako suroviny (luky, šípy, meče, štíty) – stejně jako ve
  [válce](war.md); cvičí se dřevěnými a proutěnými cvičnými zbraněmi, které si rodina udělá sama
  (návrh Clauda – rešerše: Vegetius). Dál ne-cíl: družina, lov, turnaje, výchova cizích synů na
  dvoře, výcvik ostatních mužů vsi.
- **Anti-cíl:** rodina, která trénuje, zatímco ves umírá hlady.
- **Anti-cíl:** tlačítko „pošli syny na pole“ – rodina se rozhoduje sama jako ostatní vesničané
  (Martin: vesničané sami používají, co jim ulehčí práci).

## Kdo je vojvodova rodina (návrh Clauda)

- **Domácnost vojvody** – lidé dvorce ([obchod](trade.md) – Dvorec vojvody; na začátku první
  zemnice zakladatelů). **Vojvoda** je hlava dvorce – dosud nejstarší muž od 14 let i ve stáří
  ([postavy](villagers.md) – Role), od issue #9 nejbližší muž rodu, i chlapec (Rod vojvody –
  Nástupnictví). Dvorec bez vojvody nikdo necvičí (návrh Clauda).
- **Cvičí:** vojvoda a jeho **potomci po meči** v dvorci – synové a vnuci (synové dědice; od fáze 1
  issue #9 dvorec dědice nemá – vnuci jen u ženatého syna, který čeká na dům, viz Rod vojvody).
  Synové **všech manželek**, kteří bydlí v dvorci (Martin, 24. 10. 2026 – Rod vojvody, Manželky).
- **Jen domácnost:** vojvodovy manželky (od issue #9 hlavní i vedlejší), dcery, **snachy** (ženy
  synů v dvorci) a vnučky.
- **Ostatní muži v dvorci** (zeť, ženich z okolí) jsou rolníci a pracují jako dosud – rod jde po
  meči.
- **Kdo dvorec opustí** (ženatý syn do vlastního domu – od fáze 1 issue #9 každý, dcera k muži), přestane být rodinou
  a pracuje; naučené mu zůstane (Výcvik níž). Kdo se do dvorce přivdá, patří k rodině. Dvorec má
  nejvýš 10 míst, takže rodina je shora omezená.
- **Nástupnictví:** po smrti vojvody je vojvodou nejbližší muž rodu – vrací se nejstarší syn
  (Martin, 24. 10. 2026 – Rod vojvody, Nástupnictví). Zeť ani jiný muž mimo rod vojvodou není:
  bez muže rodu po meči hra končí (Rod vojvody – Konec rodu).
- **Vedlejší manželky vojvody** (issue #9) bydlí v dvorci, dokud se vejdou; z přeplněného dvorce
  odcházejí s dětmi do vlastních obydlí (Martin, 24. 10. 2026 – Rod vojvody, Manželky). K rodině
  patří i tam – vedou domácnost (Martin) –, jejich děti ve vlastním domě ne: synové necvičí
  a pracují jako ostatní (návrh Clauda pro dcery).

### Zakládání vsi (Martin 24. 10. 2026)

Kdyby vojvoda cvičil a jeho ženy vedly jen domácnost, neměl by kdo stavět obydlí. Martin: „Až
má ves ≥ 4 dospělé mimo rodinu“ (volba z nabídky).

- **Rodina cvičí místo práce, až má ves aspoň 4 dospělé (od 14 let) mimo vojvodovu rodinu**
  (cvičící muži a ženy domácnosti se nepočítají). Do té doby pracuje jako ostatní.
- **Hystereze (návrh Clauda):** kdo už cvičí, vrací se k práci až pod **3** dospělé mimo rodinu,
  ať rodina nekmitá mezi polem a dvorkem. Režim se pamatuje (volitelná část stavu).
- Čistá funkce stavu a dne (`familyTrains`); čísla `LORD.minVillageAdults` a
  `LORD.keepVillageAdults`.
- **Se zakladateli z issue #9** (vojvoda a 4 manželky – Rod vojvody, Zakladatelé) nemá ves
  zpočátku nikoho mimo rodinu, takže **rodina pracuje** – vojvoda i manželky, 5 dospělých místo
  dnešních 2. Mimo rodinu se počítají dospělí, kteří pracují pro ves: děti vedlejších manželek
  v jejich domech, ženatí synové mimo dvorec a jejich ženy, zeťové. **Vedlejší manželky vojvody**
  se nepočítají ani ve vlastním domě – vedou domácnost a patří k rodině (návrh Clauda – pravidlo
  beze změny). Rodina tak začne cvičit odhadem za ≈ 15 let, podobně jako se dvěma páry – viz
  Odpovědi Martina (odpovědi k fázi 1). V hájení dospělí neumírají, takže hystereze do 30 let nezasáhne.

## Den rodiny (návrh Clauda)

| Kdo                      | Výcvik denně | Co                                                       |
| ------------------------ | ------------ | -------------------------------------------------------- |
| chlapci 7–9 let          | 2 h          | luk (malý luk, terč na 10 m)                             |
| chlapci 10–13 let        | 4 h          | luk 2 h, boj 1 h, jízda 1 h (bez koně boj 2 h)           |
| muži 14–44 let           | 6 h          | luk 2 h, boj 2 h, jízda 2 h (bez koně luk 3 h a boj 3 h) |
| vojvoda a muži od 45 let | 3 h          | luk, boj a jízda po 1 h (bez koně luk a boj po 1,5 h)    |
| ženy a dívky rodiny      | –            | domácnost dvorce                                         |

- **Vojvoda cvičí 3 h v každém věku** (i ve 25 letech) – zbytek dne vsi vládne; syn 14–44 let
  6 h.
- **Dva bloky – dopoledne a odpoledne** (Vegetius: nováčci cvičili u kůlu „ráno i odpoledne“).
  Zbytek dne muži spravují výstroj a vojvoda vsi vládne – do práce vsi nejde nic.
- **Luk je hlavní dovednost:** Slované bojovali dřevěnými luky a oštěpy (Strategikon). Boj = oštěp,
  sekera a štít u kůlu a ve dvojici, dřevěnými zbraněmi. **Jízda jen s koněm** (Martin) – kdo koně
  nemá, cvičí místo ní luk a boj ([koně](horses.md) – kdo na kterém koni jezdí).
- **Od 7 let:** chlapec vychází z péče matky (postřižiny – Gall Anonim) a ve hře je to věk
  výrostka. Vojvodovi synové proto **nepasou** – pasáčci jsou jen z ostatních domácností
  ([strava](diet.md) – Pasáci).
- **Ženy rodiny** kryjí **denní minimum dvorce** (vaření, voda, oheň, děti) se staršími jako každá
  domácnost ([pole](fields.md) – Práce); co jim zbude, je domácí výroba dvorce (bokem, jako
  u ostatních žen) a do práce vsi nejde (Martin – jen domácnost). Když žen nestačí (vdovec),
  kryjí zbytek muži rodiny mimo výcvik; co nepokryje ani rodina (jen starší), dá ves z denního
  minima (návrh Clauda).
- **Péče o koně** nedělá rodina, ale ves ([koně](horses.md) – Péče).

## Kdy jde rodina na pole (návrh Clauda)

Martin: „pokud by měla ves hladovět, tak ano“; ženy a dcery „stejně jako vojvoda se syny“. Ves
pozná hrozbu ze dvou odhadů, které už počítá – nový odhad nevzniká.

1. **Ves nestihne potřebný osev.** Osevní postup po dílech ([pole](fields.md), od 25. 10. 2026;
   ~~plán osevu k 1. 9. a jeho jarní úprava~~ se ruší) počítá práci ve špičkách **bez rodiny**. Když by bez ní nestihla **potřebný
   osev** (tolik, aby neměla hlad), započítá rodinu – ale jen kolik chybí: v okně, kde práce
   chybí (podzim, jaro, žně), dá každý cvičící muž rodiny (vojvoda a synové) podíl dne = chybějící práce ÷ práce mužů
   rodiny, zbytek dne cvičí. Ženy a dcery s osevem nepomáhají – Martin 23. 10. 2026 zvolil pro
   ně „Jen domácnost“: „Na pole nechodí vůbec, jen při hrozícím hladu (stejně jako vojvoda se
   syny)“; pomoc s osevem hlad není (jdou jen v bodu 2). Osev navíc, stavby ani opravy rodina nedělá nikdy.
   - Podíl dne dá rodina **až po práci vsi** – jen co ves ten den sama nestihne, takže vsi
     neuvolní práci na stavby ani osev navíc; pomoc jde jen na práce osevu (vrácení, kopání, plet,
     orba, setí), ne na seč, porážku ani péči o sad. Jař, která se nevejde, dá rodina napřed na jaře
     (jarní úprava plánu podíl přepočítá podle skutečného zbytku), co jaro nepokryje, na podzim
     (návrh Clauda).
2. **Výhled jídla nevychází.** Když ves i po nouzové porážce šetří jídlem nebo hladoví (příděl pod
   plný – [populace](population.md), Stupně upozornění), jdou všichni dospělí rodiny (muži i ženy
   od 14 let) celý den do **potřebných sezónních úloh** (krok 3 pořadí práce – pole, seč, sklizeň,
   výmlat). Mimo sezónu, kdy na poli práce není, cvičí dál. Chlapci 7–13 let cvičí vždy (do práce
   vsi nejdou ani ostatní výrostci).
   - **Ve dnech na poli nikdo nejezdí, ani chlapci** (návrh Clauda): koně stojí a jízda ani
     výcvik koně nepostupují; luk a boj chlapci cvičí dál. (Dřív jim jízda rostla na stojícím koni.)
   - **Návrat k výcviku**, až výhled vychází s plným přídělem **30 dní po sobě** (hystereze – ať
     rodina neskáče mezi polem a dvorkem den po dni).

3. **Žně a výmlat** (Martin 24. 10. 2026: „Dílny i vojvodova rodina“ – ves hladověla, protože
   žně stihla jen část dospělých). Ve **žňový den** ([pole](fields.md) – Žně všemi rukama: okna
   žní a výmlatu červenec–září, dokud je co sklízet nebo opravdu jde mlátit) dají cvičící muži rodiny celou
   práci po denním minimu dvorce na žeň a výmlat – před prací vsi; co žně nespotřebují, cvičí
   (podíl dne jako u pomoci s osevem). Pomoc s osevem (bod 1) ten den není – muži jsou na žních a nejezdí na koních.
   Ženy a dcery dál jen domácnost, chlapci 7–13 let cvičí; při hladu platí bod 2.

- Proč tyto dva: první chrání před hladem příští rok (osev), druhý před hladem teď; oba jsou čistá
  funkce stavu a dne, takže výsledek nezávisí na tom, po jakých kouscích se ves dopočítá.
- Denní minimum dvorce kryjí dál ženy rodiny – na poli dávají jen zbytek jako ostatní dospělí.

## Výcvik a zkušenost (návrh Clauda)

- **Tři dovednosti** u každého muže rodiny: **luk, boj, jízda**, každá 0–100. Uloží se u člověka
  (nová volitelná část stavu – starší vsi začnou na nule, převod jednou a idempotentně).
- **Růst:** každý den přibude **0,047 % toho, co chybí do stropu, za každou hodinu** výcviku dané
  dovednosti. Při 2 h denně je to **29 % zbytku za rok** – od nuly **50 za 2 roky, 80 za 5 let,
  90 za 7 let**. Bez náhody, deterministicky.
- **Strop podle věku:** 7–13 let **40** (dětský luk, síla paže), 14–44 let **100**, od 45 let
  klesá o **3 ročně** (v 65 letech 40).
- **Bez výcviku** (muž dvorec opustil, rodina je celé dny na poli) zkušenost klesá o **5 % ročně**,
  nejníž na **polovinu nejvyšší dosažené** – naučené se úplně nezapomene.
- **Jízda roste jen na koni**; co jezdec na koni dokáže, je jízda × výcvik koně
  ([koně](horses.md) – Výcvik koně a jezdec).
- **Typický syn:** ve 14 letech luk ≈ 36, boj ≈ 20, jízda ≈ 20 (s koněm od 10 let); ve 20 letech
  ≈ 90 ve všem. Vojvoda v 50 letech drží ≈ 85 (strop klesá, 3 h denně stačí udržet).
- **Co výcvik dá:** dnes nic – jen čísla v panelu. Až přijde **lov** (divoká prasata), luk a jízda
  rozhodnou o úlovku; ve **válce** navrhuji sílu muže rodiny **1 × (1 + boj / 100)** – vycvičený
  syn za dva muže – a jezdce podle jízdy a koně. Závazné čísla dají až návrhy lovu a války.

## Terče a cvičiště na dvorku (Martin – terče; podoba návrh Clauda)

- **Dvorek dvorce:** dvorec stojí na pozemku dvou políček (≈ 30 × 15 m) s plotem a branou. Podél
  delší osy je **střelnice ≈ 20 m**, na jejím konci **2 terče** – kotouč ze svázané slámy ≈ 1 m na
  dřevěné trojnožce s okrovým kruhem, bez zástěny – cvičiště nesmí přesahovat plot (Martin 24. 10. 2026:
  „To cvičiště by takhle nemělo předsahovat plot. Stačí, když odebereš tu zástěnu za terči“). Dva terče stačí:
  rodina má obvykle 2–5 mužů a střílí se na střídačku.
- **Cvičný kůl** u plotu (≈ 1,8 m, zářezy od úderů – Vegetius) a **stojan s dřevěnými meči
  a proutěnými štíty**; u brány **kůl na uvázání koní**.
- **Cena žádná:** sláma, proutí a odřezky – rodina si je udělá sama ze svého času, z práce ani
  zásob vsi nic neubude. Stojí, kdykoli má vojvoda dvorec; s dvorcem chátrají a zmizí.
- **Bez dvorce** (vojvoda v první zemnici bez pozemku): **1 terč a kůl** u zemnice, ≈ 10 m od
  dveří na straně odvrácené od ostatních obydlí, střílí se ven ze vsi. Po stavbě dvorce se
  přestěhují na dvorek.
- **Jen scéna:** terče nejsou stavba ani překážka, nemají stav; poloha se odvodí z obydlí vojvody
  a jeho pozemku. Síť pěšin ani vrstvu překážek nemění.

## Co hráč vidí (UI jako 0 A.D.)

- **Panel dvorce:** obyvatelé jako u obydlí (portrét a věk), bez dovedností – ty jsou jen v panelu
  vybrané osoby (Martin 24. 10. 2026: „To by mělo být na panelu té označené osoby“).
- **Panel člověka:** nové role **vojvodův syn, vojvodův vnuk, vojvodova dcera, vojvodova snacha**
  (vedle dnešních vojvoda a vojvodova žena); činnost „cvičí lukostřelbu“, „cvičí boj“, „jezdí na
  koni“, „pomáhá na poli“, „vede domácnost“; tři ikony dovedností – luk, štít s mečem, podkova – s čísly (popisek „Lukostřelba 64 / 100“),
  jízda jen u toho, kdo koně má nebo už jezdil.
- **Horní lišta:** volná práce je už bez rodiny; popisek pracovní síly doplní řádek s ikonou
  dvorce a číslem („Vojvodova rodina: 5 cvičí“, při hladu „5 na poli“).
- **Zprávy** (ne varování): „Vojvodova rodina jde na pole“ (popisek: ves nestihne osev / ves
  šetří jídlem) a „Vojvodova rodina se vrací k výcviku“ – jen při změně.
- Hráč nic nezadává (anti-cíl).

## Ve scéně (návrh Clauda)

- **Na dvorku:** muži a chlapci střílejí na terče, dvojice s dřevěnými zbraněmi a proutěnými štíty
  proti sobě nebo jeden u kůlu. Animace a luk z 0 A.D. (`art/animation/biped/infantry/`, rekvizity
  luku – konkrétní soubory se vyberou při převodu; CC BY-SA 3.0, zapsat do `LICENSES.md`).
- **Výjimka z pravidla „nikdo nestojí na oploceném pozemku“** ([postavy](villagers.md)): dvorek
  dvorce je cvičiště – stojí na něm jen rodina.
- **Jízda:** jezdci vyjíždějí branou dvorce ([koně](horses.md) – Kdy a kam se jezdí).
- **Ženy rodiny** u dvorce jako ženy u domů; v dnech na poli je celá rodina mezi ostatními.
- **Odlišení rodiny** (nepovinné): barvený plášť přes masku látky postavy – bez nového vertex
  atributu (postava má 8 vertex bufferů, víc WebGPU nedovolí).
- Výcvik jen ve dne; v zimě luk a boj na dvorku dál, jízda kratší okruh kolem vsi.
- **Den rodiny ve skutečném čase** (návrh Clauda, 1. 11. 2026; Martin 1. 11. 2026: „Koukám na
  vojvodu a ten mezi jednotlivými činnostmi mizí a zase se objevuje. A lukostřelbu i boj cvičí
  velice krátce, skoro to není vidět“): scéna už nerozvrhuje výcvik do hodin herního dne
  (≈ 86 s – hodina luku vojvody trvala 1,8 s a v noci herního dne, každých 86 s, vojvoda zmizel),
  ale do **cyklu 20 minut** skutečného času, stejného pro celou rodinu (dvojice i střídačka
  u terče cvičí spolu). Jádro dál počítá hodiny po dnech (tabulka výš), scéna z nich bere jen
  poměr a kdo cvičí:

  | Část cyklu                                 | Kdy (od začátku cyklu)   | Kolik                                             |
  | ------------------------------------------ | ------------------------ | ------------------------------------------------- |
  | doma (v dvorci, skrytý)                    | 0 – nejméně 1 min        | do odchodu na první cvičení                       |
  | luk, pak boj (v dalším cyklu boj, pak luk) | první končí v 8. minutě  | hodina jádra = 2 minuty (muž 14–44 let luk 4 min) |
  | jízda (jen s koněm, skupina spolu)         | od 13. minuty            | podle nejdelší jízdy ve skupině, nejvýš 4 min     |
  | u dvorku (vojvoda jako vladař)             | po výcviku do 19. minuty | pak vejde do dvorce                               |
  | návštěva vedlejší manželky (jen vojvoda)   | od 17,5 minuty           | u ní 4 minuty, zpět do 5. minuty dalšího cyklu    |

  Mezi dvorcem, dráhou luku, místem boje, koněm a stáním u dvorku se chodí přirozenou chůzí,
  skrytý je člověk jen doma a u manželky (vejde a vyjde dveřmi) – noc herního dne nic neschovává.
  Manželky mimo dvorec se střídají po cyklech. Lov (wildlife.md – Ve scéně) začne v chvíli jízdy
  cyklu – lovci k ní dojdou ke kůlu a po lovu se chůzí vrátí do dne rodiny. Ženy rodiny: cyklus
  10 minut – doma 1–2 minuty, pak domácí práce u dvorce a vejdou.

## Dopad na pracovní sílu vsi

Příklad: ves 40 lidí, ≈ 20 dospělých. Dvorec s 8 lidmi – vojvoda 42, žena 39, dědic 21 se ženou
19, syn 16, dcera 15, syn 11, vnuk 1.

- **Dnes** dvorec dá vsi 6 dospělých bez denního minima ≈ **5,5 člověkodne denně**.
- **Nově** nic: ženy (3) kryjí denní minimum dvorce, muži (3) cvičí. Ves přijde o ≈ 5,5 z ≈ 19
  člověkodní – **≈ 25–30 % práce** – a v létě o jednoho pasáčka (syn 11).
- **Kde to ves pocítí:** napřed na **stavbách** – volná práce ubude. Potřebný osev ves obvykle
  stihne dál (bez staveb má rezervu na osev navíc); kde ne, pomůže rodina (Kdy jde rodina na pole,
  bod 1). Velký dvorec (10 lidí) víc, malý rod s jedním synem jen ≈ 10 %.
- Skutečný dopad ověří kalibrace `measure-village` – jen na Martinův pokyn.

### Naměřeno na Vlkově (24. 10. 2026, návrh Clauda)

Kopie Vlkova (36 lidí) dopočtená 10 let po 10 dnech, tři varianty: **před** (poslední commit
před výcvikem rodiny), **kontrola** (dnešní kód, rodina nikdy necvičí) a **po** (dnešní kód).

|                         | před        | kontrola    | po          |
| ----------------------- | ----------- | ----------- | ----------- |
| ves šetří jídlem (dny)  | 70,7 %      | 63,3 %      | 80,0 %      |
| úmrtí hladem za 10 let  | 27          | 31          | 28          |
| lidí na konci (nejméně) | 11 (8)      | 9 (8)       | 12 (12)     |
| sytost průměr (nejméně) | 0,75 (0,31) | 0,77 (0,39) | 0,73 (0,34) |

- Vlkov je ves, která hladoví v každé variantě, takže rozdíly jsou v rozptylu běhu (kontrola se
  od „před“ liší jen jinou verzí cest a hladoví stejně), ne důkaz. Hladem nehladoví víc: úmrtí
  27 / 31 / 28, a ves s rodinou na konci vymírá nejméně. Šetří ale častěji (80 % dní) – rodina
  jde při hladu na pole a to stojí výcvik.
- **Podíl práce rodiny** je ve Vlkově malý: na začátku 1 cvičící muž a 3 ženy domácnosti ze 36
  lidí = 11 % kapacity (návrh 25–30 % platí pro dvorec o 8 lidech ve vsi o 40; malý rod ≈ 10 %,
  viz výš). Za 10 let průměr 14,4 % kapacity, z toho **86 čd ročně výcvik a 644 čd ročně pole**
  – hladem rodina většinu času pracuje na poli.
- **Dovednosti** po 10 letech: luk 64, boj 64, jízda 0 (koně ve Vlkově nejsou; strop 100).
- **Koně** ve Vlkově nejsou – ověřuje je integrační test
  `packages/game/scripts/__tests__/lord-columns.test.ts` (ohrada koní, koupení koní, 120 dní
  vsi: koně se počítají, obilí koní se sčítá, rodina cvičí).
- Závěr: návrh 25–30 % práce rodiny se na Vlkově nepotvrdil ani nevyvrátil – rodina je malá a
  ves hladoví. Rozhodne kalibrace 200 vsí.

### Příkaz na noc (nespouštět, jen na Martinův pokyn)

Rod (fáze 1 issue #9): `measure-village` má volbu `--founders dynasty|pairs` (výchozí `dynasty` =
vojvoda s manželkami; `pairs` = dva páry bez rodu jako dřív) a řádek „Vojvodova rodina a koně“ má
navíc muže rodu, manželky, čekající vedlejší manželky a dny bez muže rodu
(`scripts/lib/lord-columns.ts`). Srovnání rodu se starým základem:

```bash
npx tsx packages/game/scripts/measure-village.ts 200 60 --founders pairs --out base-pairs.jsonl
npx tsx packages/game/scripts/measure-village.ts 200 60 --founders dynasty --out base-dynasty.jsonl
npx tsx packages/game/scripts/measure-village.ts --report-only --out base-pairs.jsonl
npx tsx packages/game/scripts/measure-village.ts --report-only --out base-dynasty.jsonl
```

Starší příkaz (koně a vojvodova rodina):

```bash
# základ – poslední commit před úlohou 2 (43149f8c^) ve vlastním worktree
git worktree add ../bohemia-before-lord 43149f8c^
(cd ../bohemia-before-lord && npm install && \
  npx tsx packages/game/scripts/measure-village.ts 200 60 --out before-lord.jsonl)
# po změně
npx tsx packages/game/scripts/measure-village.ts 200 60 --out lord-horses.jsonl
# tabulky (nové sloupce jen v lord-horses.jsonl: řádek „Vojvodova rodina a koně“)
npx tsx packages/game/scripts/measure-village.ts --report-only --out before-lord.jsonl
npx tsx packages/game/scripts/measure-village.ts --report-only --out lord-horses.jsonl
```

Dlouhý běh jen v noci (Martin), přes den pozastavit (`kill -STOP` / `-CONT`).

## Rod vojvody – zakladatelé, manželky, jména, domácnost synů a konec rodu (#9, fáze 1)

Stav: **schváleno** (Martin 24. 10. 2026: „Schvaluji“; issue #9 „Vojvodská rodina“). Stav fáze 1: **implementováno** (jádro, server, panel jmen, upozornění, návštěvy manželek ve scéně; měření na Vlkově a kouřový test `dynasty-smoke.test.ts`, kalibrace 200 vsí zatím neběžela – Příkaz na noc níž).
Martin 24. 10. 2026 schválil rozdělení issue do fází: **1)** jména, synové po sňatku odcházejí
z dvorce, vojvoda cvičí celý život → **2)** dělení vsi a odchod mladšího syna → **3)** správa vsi
NPC → **4)** seniorát a rodové panství. K nástupnictví a náhodě „bez pozvánky“ Martin: „S tímhle
počkáme, dokud nebude fungovat NPC mechanika.“ Fázi 1 týž den doplnil: „Vesnici zakládá vojvoda
a jeho rodina. Na úplném začátku bude vojvoda, který má 4 manželky a další 4 konkubíny. Potomci
s manželkami jsou legitimními potomky vojvody, potomci s konkubínami jsou normální obyvatelé
vesnice. Pokud rod po meči zcela vymře, hra končí.“

**Konkubíny Martin týž den zrušil** (revize 24. 10. 2026): „**Ok, zrušme konkubíny, to by bylo
složité. Vojvoda bude mít hlavní manželku, se kterou a jejími dětmi bude bydlet ve dvorci. Ostatní
manželky budou mít samostatné domy, ve kterých budou bydlet s dětmi a vojvoda je bude chodit
navštěvovat. O opravu takových obydlí a vojvodova dvorce se starají ostatní muži z vesnice.**“
A doplnil: „**Vedlejší manželky odcházejí do vlastních obydlí až teprve, je-li dvorec přeplněný.
Tj. vojvoda může nějakou dobu žít klidně se dvěma manželkami a jejich dětmi ve dvorci a trénovat
budou všechny děti ve dvorci – jsou-li to synové.**“ Co níž není výslovně Martinovo, je návrh
Clauda.

### Kdo patří k rodu

- **Rod** = vojvoda, kterého hráč pojmenoval při založení hry, a jeho **mužští potomci po meči**
  (Martin, 24. 10. 2026) – synové, synové synů a dál, ne synové dcer, stejně jako u výcviku (Kdo
  je vojvodova rodina). K rodu patří synové **všech manželek** – hlavní i vedlejších (Martin).
  Jiné děti než děti manželek hra nemá – konkubíny Martin zrušil.
- U člověka se uloží **příznak rodu** (volitelná část stavu), nastaví se při narození synovi muže
  rodu. Rod tak nezávisí na tom, jak dlouho rodokmen drží zemřelé předky
  ([příbuzenství](kinship.md) – Rodokmen).
- Ženy rodu ani ostatní lidé vsi jméno nemají ([postavy](villagers.md) – jména se nezobrazují).

### Zakladatelé (Martin 24. 10. 2026; věk a bydlení návrh Clauda)

- **Kdo přijde:** vojvoda **25 let**, **hlavní manželka 22 let** a **3 vedlejší manželky 20, 18
  a 16 let** – 5 lidí bez dětí, rodiče neznámí. Nahrazují dnešní dva páry (manželé 25 let, chlapec
  13 a dívka 12 let – [obyvatelstvo](population.md), Založení vsi). Proč: hlavní manželka je
  nejstarší (první sňatek) a v nejplodnějším věku (20–24 let – Růst populace), vedlejší jsou
  rozložené, ať první porody nepřijdou najednou; vojvoda jako dnešní zakladatel – hájení (30 let)
  ho ochrání do 55 let, rod tak v hájení vymřít nemůže. První dítě nejdřív za 9 měsíců (rozestup
  po svatbě).
- **Partneři dětí z okolí** (Martin, 24. 10. 2026: první generaci partneři z okolí stačí): děti
  první generace mají všechny jednoho otce – jsou to nevlastní sourozenci a ve vsi se nevezmou.
  Synům dá ženy okolí (nevěsta z okolí ≈ 30 % ročně), dcerám muže okolí – k dceři v domě vedlejší
  manželky (dům bez mužů) se přižení ženich s ≈ 50 % ročně, dcera z dvorce se vdá pryč nebo se
  k ní přižení zeť ([příbuzenství](kinship.md) – Sňatky).
- **Kde bydlí:** do dostavění první zemnice všichni na staveništi jako dnes, pak **všech pět
  v první zemnici – dvorci** (5 ze 6 míst, dvorec není přeplněný). Vedlejší manželky odcházejí do
  vlastních obydlí, až když se dvorec přeplní (Manželky – Bydlení) – se zemnicí o 6 místech
  obvykle po druhém dítěti, takže hráč brzy potřebuje obydlí. Dvorec s 10 místy přijde až
  přestavbou dožilé zemnice ([obchod](trade.md) – Dvorec vojvody).
- **Rodina zpočátku pracuje:** ves nemá žádného dospělého mimo rodinu, takže podle Zakládání vsi
  (≥ 4 dospělí mimo rodinu) pracuje vojvoda i manželky jako ostatní, dokud nedorostou děti
  vedlejších manželek v jejich domech a nepřibudou ženatí synové mimo dvorec se ženami a zeťové –
  odhadem ≈ 15 let, podobně jako se dvěma páry. Martin 24. 10. 2026: „Nechat, rodina zpočátku
  pracuje“ – pravidlo ≥ 4 dospělí mimo rodinu platí beze změny.
- **Velká zásoba zakladatelů** (Martin 2. 11. 2026: „Ta úplně první ves – zakladatelé budou mít
  velkou zásobu jídla/osiva. Ber to analogicky, jako když přišel praotec Čech do Čech“; čísla
  návrh Clauda): zakladatelé přinesou jídlo na **3 roky** a osivo na **2 roky** potřeby (2 700 kg
  a 1 800 kg); osivo je jen na setí a 15 let se neuvolní – prvních ≈ 15 let pracuje jen pět
  zakladatelů a děti přibývají, s dnešní zásobou ves padala do pasti osiva. Podrobnosti
  a měření: [pole](fields.md) – Zásoby a nasycení, Start.
- **Ves z výpravy** ([stěhování](migration.md)) zakladatele nemění – odejdou, kdo odejdou – a nese
  vlastní náklad (velká zásoba jen první vsi).

### Manželky (Martin 24. 10. 2026; podrobnosti návrh Clauda)

- **Kdo a kolik:** víc manželek smí mít **každý muž rodu** (Martin – volba z nabídky), nejvýš
  **4 žijící** – jako zakladatel (`LORD.maxWives`). Ostatní muži vsi mají jednu manželku jako
  dosud.
- **Hlavní a vedlejší** (Martin): **hlavní manželka** bydlí s mužem a se svými dětmi v jeho domě
  (vojvoda v dvorci), ostatní jsou **vedlejší**. Hlavní je **první manželka** (návrh Clauda); po
  její smrti viz Nová hlavní manželka.
- **První manželka** jako dosud – sňatek ve vsi nebo nevěsta z okolí ([příbuzenství](kinship.md) –
  Sňatky).
- **Další manželky (2.–4.)** jen **z okolí** – žena 16–22 let, rodiče neznámí, s **≈ 30 % ročně**
  pro muže rodu od 18 let s 1–3 žijícími manželkami (jako nevěsta z okolí). Proč z okolí: muži
  rodu nesmějí brát ženy mužům vsi, ves by přišla o sňatky. V hladu nepřijde. Přijde **vždy do
  domu muže**, i když ho přeplní – z přeplněného domu pak odchází vedlejší manželka podle Bydlení
  (Martin, 24. 10. 2026: „Vedlejší manželky odcházejí do vlastních obydlí až teprve, je-li dvorec
  přeplněný.“; dřívější návrh Clauda – do prázdného obydlí, je-li dům muže plný – zrušen po
  recenzi 24. 10. 2026). Bere si ji, kdykoli má méně než 4 – i po smrti manželky.
- **Bydlení** (Martin): vedlejší manželky bydlí s mužem, **dokud jeho dům není přeplněný** –
  vojvoda tak může žít v dvorci se dvěma manželkami a jejich dětmi. Je-li přeplněný, odchází
  **vedlejší manželka s nejstarším synem, který by se mohl starat už o dům**, se svými svobodnými
  dětmi do vlastního obydlí (Martin, 24. 10. 2026: „Ta s nejstarším synem, který by se mohl starat už o dům“; při shodě
  nejdéle vdaná, návrh Clauda); po jedné domácnosti, dokud dům přeplněný zůstává. **Bez volného obydlí** zůstane v přeplněném domě
  (méně porodů, víc úmrtí dětí) a je **rodinou k osídlení** – upozornění „Rodina čeká na dům“
  a hráč smí stavět obydlí ([obyvatelstvo](population.md) – Nové obydlí, Lidé k osídlení). Kdo
  odešel, **zpět se nevrací** (ať se nestěhuje tam a zpět) – jen jako nová hlavní manželka.
  Platí pro každého muže rodu, u vojvody jde o dvorec.
- **Přednost při osídlení** nového nebo prázdného obydlí: ženatý syn vojvody (Synové po sňatku)
  → vedlejší manželka z přeplněného domu muže rodu, nejdřív z dvorce → ostatní jako dosud. Ženatý
  syn jde první, protože odchází tak jako tak – jeho odchod dvorec uvolní a vedlejší manželka se
  syny pak smí zůstat a synové cvičí dál.
- **Dům vedlejší manželky** je běžná domácnost vsi, kterou drží ona – jako vdova, která drží dům
  ([příbuzenství](kinship.md) – Domácnosti): nejstarší ženatý syn zůstává jako dědic, ostatní
  odcházejí. Zemře-li a zůstanou jen děti (nikdo od 16 let), jdou **k otci** do jeho domu, i do
  přeplněného (návrh Clauda – otec je nejbližší příbuzný; v dvorci synové zase cvičí).
- **Práce** (Martin): **manželky vojvody vedou domácnost** – hlavní i vedlejší, i ve vlastním
  domě; na pole jen při hrozícím hladu (Kdy jde rodina na pole). **Manželky ostatních mužů rodu
  mimo dvorec pracují** jako ostatní vesničanky; v dvorci (ženatý syn čeká na dům) jsou snachy –
  jen domácnost.
- **Výcvik** (Martin): cvičí **všichni synové vojvody, kteří bydlí v dvorci**, ať je jejich matkou
  kterákoli manželka. Syn, který s matkou odejde do jejího domu, necvičí a pracuje jako synové
  ostatních domů – k rodu ale patří a jméno mu dá hráč (Jména). Z domu vedlejší manželky patří
  k rodině jen ona, její dcery pracují od 14 let jako ostatní (návrh Clauda).
- **Návštěvy a porody:** vojvoda (i každý muž rodu) za vedlejšími manželkami chodí (Martin).
  Porody se počítají **na ženu** jako dosud ([obyvatelstvo](population.md) – Růst populace) –
  plodnost podle věku a rozestup; **žena nemusí bydlet s mužem** a počet žen muže ani vzdálenost
  jejího domu porody nemění (návrh Clauda – muž je plodný bez omezení, návštěvy se nepočítají).
  Přeplněnost tlumí porody v domě, kde žena bydlí. Děti různých manželek jsou nevlastní
  sourozenci a nevezmou se.
- **Ve scéně** (návrh Clauda, jen zobrazení): po výcviku a jízdě jde vojvoda po pěšinách k domu
  jedné vedlejší manželky (střídá je po cyklech dne rodiny, deterministicky), vejde, za čtyři
  minuty vyjde a vrátí se do dvorce – ve skutečném čase (Ve scéně – Den rodiny ve skutečném
  čase); výcvik ani práci to nemění.
- **Nová hlavní manželka** (Martin, 24. 10. 2026): po smrti hlavní manželky je hlavní **matka
  nejstaršího syna**, tedy matka dědice (nejstaršího žijícího syna muže; žije-li on bez živé
  matky, další nejstarší syn s živou matkou – návrh Clauda). Nebydlí-li s mužem (u vojvody
  v dvorci), **přestěhuje se** se svobodnými dětmi k němu, i do přeplněného dvorce (přeplnění
  pak řeší Bydlení). Bez takové matky (žádný syn nebo žádná matka nežije) je hlavní nejdéle
  vdaná vedlejší manželka, jinak příští manželka (návrh Clauda). Synové zemřelé hlavní manželky
  si přednost v nástupnictví podrží (Nástupnictví).
- **Po smrti muže:** manželky jsou vdovy a vdávají se hned ([příbuzenství](kinship.md)); vedlejší
  manželce zůstává dům i děti. Nový vojvoda vdovy po otci nepřebírá.
- **Opravy** (Martin: „O opravu takových obydlí a vojvodova dvorce se starají ostatní muži
  z vesnice.“): dvorec i domy vedlejších manželek opravuje a přestavuje **společná práce vsi**,
  jako každý obydlený dům ([obyvatelstvo](population.md) – Chátrání a přestavba). Rodina opravy
  ani stavby nedělá nikdy (Kdy jde rodina na pole), dům vedlejší manželky je obydlený, takže
  nechátrá. Pravidlo je tedy dnešní – model práci mužů a žen nedělí, „ostatní muži“ jsou společná
  práce vsi (návrh Clauda). Nové je, že domy vojvodových manželek do společné práce skoro nic
  nepřidají (manželka vede domácnost, děti bývají malé), a přesto ji opravami berou – dvorec
  s opravami × 1,5 nejvíc.
- **Rozhraní:** role „vojvodova žena“ u hlavní manželky a „vojvodova vedlejší žena“ u ostatních,
  manželky synů mají role jako dosud (snacha, žena rolníka); popisek domu vedlejší
  manželky jmenuje vojvodu. Kronika: „Další žena – Bořivoj“, „Nová hlavní žena – Bořivoj“,
  „Vedlejší žena odešla z dvorce“ (ženy jména nemají).

### Jména

- **Kdo jméno dává** (Martin, 24. 10. 2026): „Hráč vybírá jméno vojvody při založení hry.“
  „Vojvoda vybírá jméno jen pro své syny. Jména pro vnuky už se generují.“ Platí pro syny všech
  manželek (Martin – i synové vedlejších manželek jsou vojvodovi synové). Syn, kterému se narodí
  syn, dokud sám není vojvodou, dostane pro něj jméno vygenerované; až se stane vojvodou, jeho
  další synové čekají na hráče.
- **Co jméno smí obsahovat** (Martin, 24. 10. 2026): „Vlastní text bez kontroly. Povolená jsou
  jen písmena. Když bude chtít vojvoda pojmenovat syna Mrdomír, může.“ Provedení (návrh Clauda):
  text se znormalizuje (Unicode NFC) a ořízne o mezery na krajích; pak smí obsahovat **jen
  písmena Unicode** (`\p{L}` – i diakritika, cyrilice) a mít **1–20 znaků**. Bez mezer, číslic,
  pomlček a interpunkce, velikost písmen se nemění, stejné jméno dvou synů hra dovolí. Neviditelná
  „písmena“ (výplně hangulu U+115F, U+1160, U+3164, U+FFA0 – Unicode Default_Ignorable_Code_Point)
  neprojdou – jméno nesmí vypadat prázdné (návrh Clauda, recenze úlohy 5). Ověřuje
  server, prohlížeč totéž jen ukazuje dopředu (důvod u pole: „Jen písmena“, „Nejvýš 20 písmen“).
- **Jméno se neskloňuje** – stejně jako jméno vsi ([postavy](villagers.md)); texty stavějí jméno
  do 1. pádu („Svatba – Bořivoj“).
- **Jméno je trvalé** – po potvrzení nejde změnit (návrh Clauda; Martin 24. 10. 2026 nechal bez
  odpovědi): hráč se nepřepíše a kronika drží jedno jméno.

### Kde se jméno zadává (výjimka z „bez popisků“: textové pole)

- **Jméno vojvody – při založení hry:** dokud hráč nemá ves, ukáže se uprostřed malý panel –
  portrét vojvody (popisek „Jméno vojvody“), **textové pole**, tlačítko **kostky** (popisek
  „Navrhni jméno“ – vyplní jméno ze seznamu níž) a **potvrdit** (fajfka, i Enter). Pole je
  prázdné. Po potvrzení hráč umístí první zemnici a jméno odejde na server spolu se založením vsi
  (dřív stav vsi neexistuje); zavře-li stránku dřív, panel se ukáže znovu. **Začít znovu** panel
  ukáže znovu, předvyplněný posledním jménem.
- **Narození syna vojvody** (Martin, 24. 10. 2026): „Hráči se vypíše upozornění a bude se čekat
  na jeho reakci. Syn do té doby jméno mít nemusí – nebude nikde figurovat.“ Upozornění **„Syn
  vojvody čeká na jméno“** nemizí jako ostatní – drží se v řádku upozornění, dokud ho hráč
  nevyřeší. Klik otevře týž panel (portrét chlapce, popisek „Jméno syna“). Svět mezitím běží dál:
  syn žije, roste a od 7 let cvičí, jen v rozhraní je bez jména jako každý vesničan. Víc čekajících
  (dvojčata, hráč byl pryč – za skutečný den ≈ 2,7 roku) – upozornění ukáže počet a panel je
  nabízí od nejstaršího. Zemře-li syn bez jména, upozornění pro něj zmizí.
- **Vojvoda bez jména ve vsi** (převod, výprava – návrh Clauda): panel „Jméno vojvody“ se nabídne
  sám jednou za načtení stránky a jde zavřít (Esc); pak drží řádek **„Vojvoda čeká na jméno“**
  stejně jako u syna. Číslo u upozornění je počet všech čekajících, panel je nabízí od vojvody.
- **„Rodina čeká na dům“** (návrh Clauda): řádky upozornění se po pár sekundách ztratí a myší na
  ně nejde, proto jména ženatých synů v dvorci stojí přímo v textu („Rodina čeká na dům –
  Bořivoj“), ne v popisku.
- **Čekající jména se neukládají zvlášť:** jsou to žijící muži rodu bez jména (vnuci dostávají
  jméno hned při narození) – fronta tak nemůže nesouhlasit se stavem vsi.
- **Ves z výpravy** ([stěhování](migration.md)): má-li vojvoda nové vsi (nejstarší muž výpravy)
  jméno, zůstane mu; jinak ho hráč pojmenuje stejným panelem při umístění první zemnice. Rod ve
  víc vsích řeší fáze 2–4.

### Generovaná jména vnuků

- Muž rodu, jehož otec při jeho narození **není vojvodou**, dostane jméno hned při narození ze
  **seznamu ≈ 60 předkřesťanských slovanských mužských jmen** (svět začíná roku 500), např.
  Bolemír, Bořivoj, Budivoj, Ctibor, Čáslav, Dobroslav, Domaslav, Drahomír, Hostivít, Chotěbor,
  Jaromír, Kojata, Křesomysl, Lutobor, Milhost, Mnata, Mojmír, Myslibor, Neklan, Nezamysl,
  Přemysl, Radim, Radoslav, Ratibor, Rostislav, Slavibor, Soběslav, Spytihněv, Strachkvas,
  Svatopluk, Unislav, Vítoslav, Vlastislav, Vnislav, Vojen, Vratislav, Zbyhněv, Zdeslav (úplný
  seznam doplní implementace).
- Volba je **deterministická** ze seedu vsi a dne jako ostatní náhoda vsi. Bere se jen jméno, které
  nenosí žádný žijící muž rodu ve vsi – jména se tak v rodě vracejí po zemřelých dědech, jako
  u Přemyslovců (Boleslav, Vratislav). Kostka v panelu bere ze stejného seznamu.

### Kde se jméno ukazuje

- **Panel člověka:** jméno jako první řádek nad rolí („Bořivoj“, „vojvodův syn, 17 let“);
  **popisek portrétu** a postavy ve scéně „Bořivoj – vojvodův syn“.
- **Panel dvorce:** popisky ikon mužů rodu („Bořivoj – Lukostřelba 64 / 100“).
- **Upozornění a kronika:** „Syn vojvody čeká na jméno“; do kroniky „Narodil se syn vojvody“,
  „Syn vojvody dostal jméno – Bořivoj“ / „Vojvoda dostal jméno – Bořivoj“ (při potvrzení), „Svatba – Bořivoj“, „Bořivoj odešel
  z dvorce“, „Zemřel Bořivoj“, „Vojvodou je Bořivoj“. Kronika zapíše jméno do události, text se
  pak nemění. Kronika v rozhraní zatím není ([obyvatelstvo](population.md)), data budou připravená.
- Muž rodu, který dvorec opustil, nese jméno dál. Ostatní lidé zůstávají bez jmen.

### Synové po sňatku odcházejí z dvorce

- Martin (24. 10. 2026): po sňatku odcházejí z dvorce **všichni synové včetně nejstaršího**.
  Dvorec tak **nemá dědice mezi ženatými syny** – výjimka z pravidla „nejstarší ženatý syn zůstává
  s rodiči“ ([příbuzenství](kinship.md) – Domácnosti). V dvorci zůstává vojvoda s hlavní
  manželkou, vedlejšími manželkami, dokud se vejdou (Manželky – Bydlení), svobodnými dětmi
  a ženatými syny, kteří ještě nemají kam.
- **Bez volného obydlí** (Martin, 24. 10. 2026): „Cvičí, dokud neodejde.“ Ženatý syn s rodinou
  zůstává v dvorci a cvičí dál, jeho žena je snacha (jen domácnost), jeho synové jsou vnuci
  v dvorci a cvičí také. Upozornění „Rodina čeká na dům“ jako u ostatních domů (jméno v popisku).
- **Přestěhování, když se obydlí uvolní** (návrh Clauda; Martin 24. 10. 2026 nechal bez
  odpovědi): ženatý syn vojvody je vždy rodinou k osídlení a **má přednost** před rodinami
  z ostatních domů, nejdřív nejstarší – dokud bydlí v dvorci, cvičí a ves za něj platí prací. Po
  synech jdou vedlejší manželky z přeplněného dvorce (Manželky – Přednost při osídlení), pak
  ostatní jako dosud. Odejde se ženami a dětmi hned ten den, kdy je obydlí prázdné nebo
  dostavěné. Od odchodu pracuje jako rolník a dovednosti
  mu klesají (Výcvik a zkušenost – −5 % ročně, nejníž polovina nejvyšší dosažené).
- Ženatý syn se smí i **přiženit k vdově nebo dědičce**, která drží dům ([příbuzenství](kinship.md)
  – Sňatky) – dědicem dvorce není.
- **Svobodní synové z dvorce sami neodcházejí** (návrh Clauda – výjimka z „nejstarší dítě smí
  odejít samo“): cvičí, dokud se neožení, a nezabírají dům čekajícím rodinám. Dcery odcházejí
  sňatkem jako dosud.

### Vojvoda cvičí celý život

- Martin (24. 10. 2026) k „Vojvoda trénuje vždy“: „Jen 'na rozdíl od synů'“ – vojvoda cvičí, dokud
  žije, syn jen dokud bydlí v dvorci. **Hlad a stáří jako dosud:** při hrozícím hladu jde na pole
  s celou rodinou (Kdy jde rodina na pole), ve stáří cvičí 3 h a strop dovedností klesá (Výcvik
  a zkušenost). Zakládání vsi (≥ 4 dospělí mimo rodinu) platí beze změny.
- Syn, který se po letech na poli stane vojvodou, začíná od toho, co mu zůstalo (nejméně polovina
  nejvyšší dosažené), a zkušenost prohlubuje – jak popisuje issue.

### Nástupnictví (Martin 24. 10. 2026 – „Nejstarší syn se vrátí“, nástupcem syn hlavní manželky)

- Dosud byl vojvodou nejstarší muž dvorce. Když ženatí synové odcházejí, zůstal by dvorec po smrti
  vojvody často jen s vdovami a malými dětmi – bez vojvody, bez výcviku a bez jmen.
- **Po smrti vojvody se do dvorce vrátí nejstarší žijící syn hlavní manželky ve vsi** a je
  vojvodou (Martin – revize 24. 10. 2026; dřív nejstarší syn kterékoli manželky). **Syn hlavní
  manželky** je syn ženy, která kdy byla hlavní manželkou vojvody – přednost si podrží i po
  smrti matky (návrh Clauda, příznak u syna – Pro implementaci). Má ji i jako chlapec před
  dospělým synem vedlejší manželky (Martin).
- **Bez živého syna hlavní manželky** v pořadí: **1.** nejstarší žijící syn vojvody od vedlejší
  manželky (Martin, 24. 10. 2026: nastoupí syn vedlejší manželky), **2.** nejstarší vnuk po meči,
  **3.** nejstarší muž rodu ve vsi – bratr, synovec… (2. a 3. návrh Clauda). Proč: syn je otci
  bližší než vnuk (Martin dřív: „bez syna nejstarší vnuk po meči“) a syn vedlejší manželky
  obvykle vyrůstal v dvorci a cvičil. Muži rodu v jiných vsích hráče řeší
  fáze 2–4, náhoda „bez pozvánky“ čeká na fázi 3 (Martin).
- **Kdo se stěhuje** (návrh Clauda): nový vojvoda s hlavní manželkou a jejími svobodnými dětmi;
  vedlejší manželky se svobodnými dětmi jen, vejdou-li se do dvorce (od nejdéle vdané). Ostatní
  zůstávají v jeho dosavadním domě, který drží nejstarší z nich vedle ženatého syna – dědice
  podle kinship.md. Prázdný dům osídlí čekající rodina.
- **Zeť ani jiný muž mimo rod vojvodou není** – bez muže rodu hra končí (Konec rodu; Martin).
  Případ „vojvoda mimo rod“ tím odpadá.
- **Nezletilý vojvoda** (návrh Clauda): je-li nástupcem chlapec, je vojvodou on – rod po meči žije
  (Martin). Bydlí-li jinde, vrátí se do dvorce s matkou a sourozenci do 16 let; cvičí jako chlapci
  jeho věku (Den rodiny), jméno mu dá hráč, jestli ho ještě nemá. Matka dvorec drží a vede
  domácnost – vdá-li se, muž se přižení k ní (jako k vdově, která drží dům – kinship.md)
  a pracuje jako zeť; chlapec tak z dvorce neodejde.
- Vdovy po vojvodovi zůstávají v dvorci se svými dětmi, dokud se nevdají (vdávají se hned –
  kinship.md), svobodní synové zůstávají a cvičí. **Přeplní-li se dvorec**, odchází jako vedlejší
  manželka nejdřív vdova s nejstarším synem (ne matka vojvody) se svobodnými dětmi, pak vedlejší manželky
  nového vojvody (Manželky – Bydlení; návrh Clauda). Kronika „Vojvodou je Bořivoj“.

### Konec rodu – konec hry (Martin 24. 10. 2026 – „Začít znovu, ves zanikne“)

- **Kdy:** v den, kdy zemře **poslední žijící muž rodu** v kterékoli vsi hráče – **i chlapec nebo
  kojenec** (Martin: „Pokud rod po meči zcela vymře, hra končí“). Ženy rodu ani synové dcer rod
  nedrží. Dítě narozené po smrti otce hra nemá (rodí jen žena se žijícím mužem), rod
  tedy nezachrání.
- **Dosavadní konec hry zůstává:** vymřou-li všechny vsi ([obyvatelstvo](population.md) – Hlad
  a vymření), vymřel i rod. Vymření rodu je nová, dřívější podmínka – ves s lidmi, ale bez mužů
  rodu, končí. Ves bez rodu od převodu (Převod níž) končí jen vymřením.
- **Výpočet:** čistá funkce stavu vsí (`isGameOver` rozšířené o rod) po dopočtu všech vsí hráče
  na dnešek; den konce (pro kroniku) je den smrti posledního muže rodu, dál se vsi nedopočítávají.
  Výsledek nezávisí na tom, po jakých kouscích se vsi dopočítají.
- **Co hráč vidí:** obrazovka porážky jako dosud přes zamrzlou scénu – nadpis **„Rod vymřel“**,
  **kronika rodu**: vojvodové po sobě se jmény a roky („Bořivoj 500–541“…), poslední muž rodu
  („Zemřel Ctibor – poslední muž rodu“), jméno vsi a roky jejího života, a jediné tlačítko
  **Začít znovu**. Obrazovka zůstane i po odhlášení, dokud hráč nezačne znovu.
- **Co se stane se vsí** (Martin: „ves zanikne“): všechny vsi hráče se **přestanou dopočítávat**
  a kronika zapíše „Ves opuštěna – rod vymřel“ – jako opuštěná ves po odchodu všech
  ([stěhování](migration.md) – Odchod do nové vsi), ne vymřelá. Scéna bez lidí, dýmu a zvířat,
  stavby stojí, jak byly. Stav vsi v DB zůstane s důvodem konce „rod vymřel“ (lidé jako záznam,
  nikdo v ní nežije).
- **Začít znovu** jako dosud: sídlo i se vsí jde do archivu, hráč dostane nové sídelní sídlo
  s novou krajinou a panel „Jméno vojvody“ předvyplněný posledním jménem – nový rod se
  zakladateli výš. Začít znovu z nabídky se živým rodem se nemění.
- Až bude sdílená mapa světa, zaniklá ves na ní zůstane a chátrá ([opuštěné
  stavby](abandonment.md)) – navrhne mapa světa.

### Dopad na kalibraci a hlad (kvalitativně – ověří úloha „růst populace“)

- **Lidé na začátku:** 5 místo 4, všichni dospělí. Startovní zásoby na 18 měsíců
  ([pole](fields.md) – Start) se počítají na potřebu zakladatelů – ověřit, že vydrží stejně dlouho.
- **Práce na začátku:** rodina pracuje (Zakladatelé), takže první zemnici a pole staví 5 dospělých
  místo 2 (výrostci 12 a 13 let do práce nešli) – start bude rychlejší. Výcvik začne až s ≥ 4
  dospělými mimo rodinu, odhadem za ≈ 15 let.
- **Porody:** 4 plodné ženy místo jedné → ≈ 1,5 porodu ročně od prvního roku (dřív ≈ 0,35 a druhý
  pár až za ≈ 4 roky). Zemnice o 6 místech se přeplní po druhém dítěti – vedlejší manželky pak
  čekají na obydlí a přeplněný dvorec tlumí porody i přežití dětí, dokud hráč nestaví. Ves poroste
  rychleji, ale víc bude záležet na stavbě obydlí.
- **Cena rodu po výcviku:** k rodině patří i vedlejší manželky ve vlastních domech (nepracují)
  a ves opravuje dvorec (× 1,5) a jejich domy, které do společné práce skoro nic nepřidají. Podíl
  práce, o který ves přijde, bude nad schválenými 25–30 %, dokud má vojvoda víc manželek; klesá,
  jak ves roste a synové vedlejších manželek dorůstají do práce.
- **Hlad:** víc malých dětí brzy, manželky vojvody jdou na pole jen při hrozícím hladu (dokud
  rodina pracuje, pracují i ony). Riziko je druhý a třetí rok, kdy dojdou startovní zásoby;
  hájení chrání dospělé, děti hladem neumírají.
- **Rod:** synové 4 manželek a další ženy z okolí rod rychle rozrostou, vymření rodu bude vzácné.
  Měřit: lidé, domy a muži rodu v letech 10, 30 a 60, kdy rodina začne cvičit, podíl práce rodiny
  a oprav jejích domů, roky hladu, čekající rodiny (i vedlejší manželky) a jak často hra skončí
  vymřením rodu (v hájení nemůže). Kalibraci pouštět jen na Martinův pokyn.

### Převod starších vsí (jednou a idempotentně)

- Příznak rodu dostane dnešní vojvoda a jeho žijící potomci po meči podle rodokmenu.
- **Vojvoda a jeho žijící synové jméno nemají** – hráč při dalším vstupu uvidí panel „Jméno
  vojvody“ a upozornění „Syn vojvody čeká na jméno“ s počtem synů (i dospělých); jména dává hráč,
  jak chce Martin. **Ostatní muži rodu** (vnuci, pravnuci) dostanou jména vygenerovaná.
- **Ženatí synové v dvorci** se nestěhují nuceně – cvičí, dokud se neuvolní obydlí, a pak
  odcházejí podle přednosti.
- **Manželky** (návrh Clauda): dnešní žena muže rodu je jeho **hlavní manželka**, žijící synové
  vojvody jsou synové hlavní manželky (ves dosud měla jen jednu ženu na muže). Vedlejší manželky
  se zpětně nedoplňují – **Vlkov zůstane beze změny**: vojvoda s jednou ženou, nikdo se
  nestěhuje; další manželky přicházejí od převodu podle pravidel výš. Zakladatelé (vojvoda
  a 4 manželky) platí jen pro nově založené vsi.
- **Dvorec bez muže od 14 let:** rod se založí na nejstarším muži dvorce, i chlapci; bez muže
  v dvorci na nejstarším muži vsi, který se s domácností do dvorce přestěhuje jako vojvoda
  (Nástupnictví). Ves bez jediného muže rod nemá a končí jen vymřením – **převod sám hru
  neukončí**.

### Pro implementaci fáze 1 (poznámky, ne kód)

- **Rozhodnutí implementace (návrh Clauda, 24.–26. 10. 2026):** rod se sousedovi nedává – výměna
  lidí nevybere muže rodu ani manželku muže rodu; nejdéle vdaná manželka je ta s nižším id (hlavní
  manželka po smrti hlavní); ves z výpravy bez muže rodu je ves bez rodu (`NO_DYNASTY`); poslední
  zadané jméno zakladatele si prohlížeč pamatuje v `sessionStorage` (`try/catch`, bez nového portu
  DB) a předvyplní ho po „Začít znovu“; `foundVillage` bez `lord` založí ves bez rodu se dvěma páry
  (testy, zlaté otisky `smith-golden`, `craft-skill-golden`).

- Volitelné části stavu člověka: jméno, příznak rodu, příznak „syn hlavní manželky“; u muže víc
  manželek s hlavní (dnes jeden manžel / manželka). Převod v `updateVillage` / začátku
  `advanceVillage`. Validace jména čistou funkcí domény, délka v `rules*.ts` s odkazem sem,
  seznam jmen jako data domény.
- Akce: jméno vojvody jako součást založení první vsi a pojmenování muže rodu (`villageId`,
  `personId`, jméno) – server ověří, že jde o žijícího muže rodu bez jména.
- Osídlení (`departingFamilies`): odchod ženatých synů, vedlejší manželka z přeplněného domu muže
  rodu jako rodina k osídlení (i v „lidech k osídlení“), přednost syn → vedlejší manželka →
  ostatní. Nástupnictví tam, kde se dnes určuje vojvoda (i `lib/person-roles.ts`).
- Porody: žena 16–44 let s žijícím mužem, nemusí s ním bydlet; přeplněnost podle jejího domu.
  Rodina (`familyTrains`, práce): domácnost dvorce + vojvodovy vedlejší manželky. Zakladatelé
  v `foundVillage` (věky jako data v `rules*.ts`), `LORD.maxWives`.
- Konec hry: `isGameOver` i bez mužů rodu, zastavení dopočtu vsí hráče, obrazovka „Rod vymřel“
  s kronikou rodu.
- **Konec rodu – rozhodnutí implementace (návrh Clauda, 24. 10. 2026):** ves, ve které nezbyl muž
  rodu (smrt i odchod), si zapíše den konce a kroniku „Ve vsi už nežije žádný muž rodu – posledním
  vojvodou byl …“ a žije dál bez vojvody, dokud rod žije v jiné vsi hráče. Vymře-li rod všude, vsi
  se dopočítají na dnešek a pak zaniknou ode dne konce rodu (nejpozdější den mezi vsemi). Kronika
  rodu na obrazovce porážky je z vsi, kde rod skončil naposledy; vojvoda bez jména jako „Vojvoda“.
  Po konci rodu žádný vojvoda není – Začít znovu předvyplní jméno zakladatele.
- **Výcvik a nástupnictví – rozhodnutí implementace (návrh Clauda, 24. 10. 2026):** vojvoda
  cvičí, jen když bydlí v dvorci; cvičí všichni muži rodu v dvorci od 7 let (i bratři po
  nástupu). Matka **nezletilého** vojvody vede domácnost dvorce, i když se vdá; matka dospělého
  vojvody a ostatní vdovy po vojvodovi pracují jako dosud. Vojvoda (a za nezletilého jeho matka)
  dvorec při sňatku neopouští – druhý se přistěhuje do dvorce. Dvorec bez vojvody (rod skončil)
  nedrží nikdo – ženatí muži z něj odcházejí všichni. Vdovu po vojvodovi pozná dítě s otcem
  dřívějším vojvodou – bezdětnou ne (vdá se). Vedlejší manželka vojvody mimo dvorec kryje minimum
  svého domu, nekryté platí ves; do 4 dospělých mimo rodinu se nepočítá. **Přeplnění** domu se
  počítá ze všech lidí domu (i dětí a podnájemníků) jako u ostatních domácností – vedlejší
  manželka tak může odejít i kvůli přeplnění, které nezpůsobila.
- **Zakladatelé a jména – rozhodnutí implementace (návrh Clauda, 24. 10. 2026):** první ves
  sídla zakládá vždy vojvoda s manželkami (i bez jména – čeká na hráče); vývojová druhá ves,
  ves z výpravy a ves bez `lord` (testy, starší varianty kalibrace) jsou beze změny. Ves
  osadníků: vojvodou je nejstarší muž rodu mezi nimi a jeho jméno zůstane, bez muže rodu je ves
  bez rodu. Důvody u jména: „Jen písmena.“, „Nejvýš 20 písmen.“, prázdné „Vojvoda potřebuje
  jméno.“ (u syna „Syn potřebuje jméno.“), pojmenovaný „Jméno už má – nejde ho změnit.“. Kronika
  vsi: „Muž rodu dostal jméno …“; svatba muže rodu nese jeho jméno (i nevěsta z okolí).
- Testy: jména vnuků nezávisí na kouscích dopočtu, odcházejí všichni ženatí synové, přednost
  syna a pak vedlejší manželky, vedlejší odchází až z přeplněného dvorce a nevrací se, cvičí
  všichni synové v dvorci, nástupcem syn hlavní manželky i po její smrti, nezletilý vojvoda, nová
  hlavní manželka, konec hry po smrti posledního muže rodu, převod je idempotentní a hru neukončí.

## Dělení vsi – syn vojvody zakládá novou ves (#9, fáze 2)

Stav: **schváleno** (Martin 30. 10. 2026: „Ano, schvaluji obojí“ – i s opravou „Pole uživí“). Zadání issue #9 (Martin 24. 10. 2026): „**Pokud
hráč přivede jiného hráče, tak po smrti vojvody přebírá vesnici nejstarší syn, nastěhuje se
zpátky do vojvodského dvorce a hráč pokračuje ve hře za něj**“ a „**Pokud hráč jiného hráče
nepřivede, rozhoduje po smrti současného vojvody náhoda – hráč se může ocitnout v kůži některého
z mladších synů. V takovém případě bude mít k dispozici poměrnou část vesnice, kterou buď může
spravovat, nebo vzít své lidi a odejít vybudovat novou vesnici jinam. Zbytek původní vesnice bude
spravovat NPC. Panství rodu se tak postupně může rozrůst na více vesnic.**“ Martin 30. 10. 2026
k úpadku Vlkova: „**No ve chvíli, kdy ves vyroste tolik, že už neuživí další lidi, část lidí by
měla odejít s novým vojvodou (některým ze synů stávajícího vojvody) a založit novou ves. To je
ale rozhodnutí hráče**“, k návrhu brzdit sňatky podle polí: „**Na brzdu ser. Tohle musí prostě
vyřešit hráč nebo NPC**“ a k prvnímu znění této sekce: „**Tohle už jsme přece jednou řešili –
odchází poměrná část vsi. Řešili jsme také, jak je to s nástupnictvím**“. Ves se tedy v simulaci
nebrzdí – přelidnění řeší hráč odchodem mladšího syna s jeho poměrnou částí vsi (tady), NPC vsi
autopilot (fáze 3). Co níž není výslovně Martinovo, je návrh Clauda.

### Proč

- Pole vsi uživí jen určitý počet lidí (Vlkov ≈ 61–70) a narození ani sňatky na pole nehledí.
  Přeroste-li ves pole, seje nouzové přílohy, vysaje půdu a hladoví – diagnóza 27. 10. 2026:
  Vlkov 44 let bez hráče, 53 úmrtí hladem, podíl úrodnosti dílů až 0,38.
- Odchod do nové vsi už ve hře je ([stěhování](migration.md) – Odchod do nové vsi) a nová ves
  z osadníků má za vojvodu nejstaršího muže rodu mezi nimi (fáze 1). Hráč ale sám vybírá obydlí
  a vůdce si neurčí – chybí odchod syna s jeho poměrnou částí vsi.
- Hráč musí poznat, kdy je ves plná – „Pole uživí“ dnes počítá s odpočatou půdou a vyčerpané vsi
  ukazuje víc, než pole dají (oprava: [pole](fields.md) – Pole uživí podle dnešní půdy).

### Kdo může vést odchod

- **Syn vojvody** (Martin: „některým ze synů stávajícího vojvody“) – žijící, ve vsi, od 16 let,
  syn kterékoli manželky, ženatý i svobodný. **Syn bez jména** odchod nevede, dokud ho hráč
  nepojmenuje (důvod „Syn potřebuje jméno.“ jako dnes).
- **Nástupce ne** (Martin – zadání issue: „po smrti vojvody přebírá vesnici nejstarší syn“;
  fáze 1 – Nástupnictví: nejstarší syn hlavní manželky): mateřská ves je jeho díl, odcházejí
  mladší synové. Zemře-li nástupce, je jím další v pořadí ve vsi; kdo už odešel, se nevrací.
- **Celá ves s vojvodou** (Martin – zadání issue: hráč „může vesnici úplně vystěhovat a založit
  jinde“): odchod všech obydlí jako dnes, vede ho vojvoda a v nové vsi zůstává vojvodou.
- **Vnuci, bratři a další muži rodu** odchod nevedou (Martin: syn). Patří-li jejich domácnost do
  dílu syna, jsou v nové vsi muži rodu bez titulu – rod drží, cvičí jen v dvorci.

### Poměrná část vsi (Martin – zadání issue; výpočet Martin 30. 10. 2026)

- **Díl syna = 1 ÷ počet dílníků**, dílníci jsou žijící vojvoda a jeho synové od 16 let ve vsi
  (i nástupce a syn, který odchází). Vojvoda se dvěma dospělými syny: mladší odvede ⅓ vsi;
  se čtyřmi ⅕. Odejdou-li synové po sobě, vezme každý (při stejném počtu lidí) stejný díl
  původní vsi – 2. ze čtyř ¼ ze zbylých ⅘ = ⅕. Po smrti vojvody (náhoda ve fázi 3) se počítají
  jen synové – stejné dělení, jen bez vojvodova dílu.
- **Lidé:** rodina syna – on, jeho manželky a jejich svobodné děti – odchází vždy, ať bydlí
  kdekoli, i z dvorce (ženatý syn čekající na dům, svobodný syn, který cvičí). K ní celé
  domácnosti z **obydlí nejblíž domu syna** (bydlí-li v dvorci, nejblíž dvorci), dokud počet
  lidí není co nejblíž dílu – po celých domácnostech, jako dnes při odchodu; domácnost, která by díl
  oddálila od cíle, se přeskočí a pokračuje další nejbližší (návrh Clauda). Do dílu nepatří
  dvorec, domácnosti ostatních synů vojvody (mají svůj díl) ani domácnost, která si staví dům.
  Domácnost s chlapcem vojvody pod 16 let do dílu také nepatří – Martin 2. 11. 2026 na otázku,
  zda ji pustit do dílu (ves skoro celá rod pak výpravu nesestaví): „C“ = nechat, jak je; syn
  počká, až ve vsi přibudou domácnosti mimo rod.
  Nejbližší obydlí drží díl pohromadě – ve fázi 3 ho půjde spravovat i na místě (zadání issue;
  s pravidlem jedna ves, jedna mapa otevřené – viz Nástupnictví níž).
- Dům, který syn drží a bydlí v něm i jiní, zůstane zbytku domácnosti podle
  [příbuzenství](kinship.md) jako po smrti hospodáře.
- **Jídlo, osivo, stáda a vůz** podle lidí dílu jako dnes ([stěhování](migration.md) – poměrný
  díl zásob a stád, osivo, vůz s voly).
- **Kůň syna:** syn si odvede svého jezdeckého koně ([koně](horses.md) – Kdo na kterém koni).
  V nové vsi čeká bez ohrady jako voli z vozu – žere seno, nejezdí se na něm a výcvik stojí –
  a s první ohradou koní do ní přejde. Klisny a hříbata zůstávají v mateřské vsi.
- **Svobodný syn** se ožení až v nové vsi – hlavní manželka z okolí podle pravidel Manželky, jako
  zakladatelé první generace.

### Nová ves

- **Vojvodou nové vsi je vedoucí syn.** Kronika mateřské vsi: „Bořivoj odešel založit ves
  Lhota“; nové vsi: „Vojvodou je Bořivoj“.
- V nové vsi platí celý rod z fáze 1: dvorec je první zemnice (už dnes), rodina cvičí až od ≥ 4
  dospělých mimo rodinu (Zakládání vsi), synové nového vojvody cvičí v dvorci, jména jim dává
  hráč, nástupnictví a manželky podle stejných pravidel. Hájení nové vsi jako dnes.
- **Rod je jeden napříč vsemi hráče** – konec hry až po smrti posledního muže rodu v kterékoli
  vsi (už dnes).
- **Ves bez muže rodu** (vojvoda nové vsi zemře a jiný muž rodu v ní není) žije dál bez vojvody
  – lidé pracují, nikdo necvičí. Nástupce z jiné vsi hráče řeší fáze 4 (seniorát); u mateřské
  vsi stejně.
- **Nová ves stojí vždy na nové mapě** – syn odchází jen na novou mapu ve zvoleném směru (Martin
  1. 11. 2026: „Vsi na téže mapě – zrušme vsi na téže mapě. Jedna ves, jedna mapa“); dřívější
     „Odejít sem“ (nová ves na téže mapě) je zrušené, server takový cíl odmítne.
- Obě vsi patří hráči a hráč řídí obě ([stěhování](migration.md) – Víc vsí jednoho hráče).
  Podřízenost syna otci a rodové panství řeší fáze 4.

### Nástupnictví (Martin – zadání issue a 24. 10. 2026)

- **S pozvaným hráčem** přebírá ves po smrti vojvody nejstarší syn, vrátí se do dvorce a hráč
  hraje za něj – fáze 1 (Nástupnictví, nejstarší syn hlavní manželky) beze změny.
- **Bez pozvaného hráče** rozhoduje náhoda: hráč se může ocitnout v kůži mladšího syna s jeho
  poměrnou částí vsi, kterou spravuje na místě, nebo s ní odejde; zbytek vsi spravuje NPC.
  Martin 24. 10. 2026: „S tímhle počkáme, dokud nebude fungovat NPC mechanika“ – fáze 3. Díl
  počítá stejně jako tady (Poměrná část vsi), fáze 3 ho jen použije.
- **Otevřená otázka na později (1. 11. 2026):** zadání issue „mladší syn může svou poměrnou část
  vsi **spravovat na místě**“ bude s pravidlem **jedna ves, jedna mapa** (Martin 1. 11. 2026:
  „Jedna ves, jedna mapa“) potřebovat jiné řešení – díl na místě by byl druhou vsí na téže mapě.
  Návrh Clauda: syn svůj díl převezme jen odchodem na novou mapu (spravovat na místě nejde);
  rozhodne se s fází 3 (NPC).

### Odchod bez syna

- **Odchod vybraných obydlí zůstává vedle odchodu syna** (Martin 30. 10. 2026: „Nech to vedle
  odchodu syna. Odchod z obydlí je spíš stěhování sídla v rámci mapy“) – beze změny
  ([stěhování](migration.md) – Odchod do nové vsi): vojvodou nové vsi je nejstarší muž rodu mezi
  osadníky, bez něj je nová ves bez vojvody; odejde-li vojvoda, v mateřské vsi nastoupí nástupce
  (`succeedLord` – už dnes).
- Přestěhování domácnosti na téže mapě (Přestěhovat) se nemění.

### Co hráč vidí (UI jako 0 A.D.)

- **Výběr dvorce** → v panelu **řada ikon synů** – ikona muže rodu, jméno a věk v popisku;
  nástupce a syn bez jména zašedlí s důvodem u kurzoru („Nástupce zůstává.“, „Syn potřebuje
  jméno.“), syn mladší 16 let chybí. Klik na syna označí ve scéně obydlí jeho dílu (obrys jako
  výběr) a ukáže růžici Odejít na novou mapu (8 směrů; „sem“ zrušené 1. 11. 2026 – jedna ves,
  jedna mapa).
- Popisek odchodu: počet lidí dílu, vůz, kůň.
- Kdy odejít, rozhodne hráč sám: ikona lidí v horní liště „lidí / ≈ N“ zčervená, když je lidí víc,
  než pole uživí (už dnes; s opravou podle dnešní půdy včas). Žádné další upozornění ani rada.
- Průvod ve scéně (syn na koni v čele) až s „Co hráč vidí“ ze [stěhování](migration.md) – dnes jen
  kronika.

### NPC (fáze 3)

- Autopilot NPC vsí zavolá stejný use-case (`leaveVillage` se synem) – kdy, navrhne fáze 3
  (např. lidí víc, než pole uživí podle dnešní půdy). Web i worker volají stejný use-case.
- **Návrh fáze 3:** [správce vsi](steward.md) (schváleno v hrubých rysech 30. 10. 2026) – správce
  rozhoduje v kroku simulovaného dne, proto volá doménovou část odchodu (`departWithSon`) přímo
  a novou ves založí use-case `settleStewardDepartures` z odchozí schránky; pravidla odchodu
  (díl, kdo smí vést) jsou tytéž.

### Převod starších vsí

- Není potřeba: vsi z osadníků už vojvodu mají (nejstarší muž rodu mezi osadníky) a mateřská
  ves, ze které vojvoda odešel, dostane nástupce (`succeedLord`). Nové části stavu (kůň syna bez
  ohrady) jsou volitelné.

### Pro implementaci fáze 2 (poznámky, ne kód)

- `leaveVillage` a `departVillage` dostanou `leaderId` místo vybraných obydlí (celá ves dál
  všemi obydlími); čistá kontrola vůdce vrací důvod (`PlacementCheck` jako u jmen). `Settlers`
  nesou vůdce, `foundVillage` a `travellingVillage` založí
  `dynasty: { lordId, lords: [{ id, fromDay: day }] }` místo `{ lordId: null, lords: [] }`.
- Díl syna čistou funkcí stavu (`sonShare(state, sonId)` → lidé a obydlí dílu) – stejnou volá
  náhled v panelu, server i fáze 3. Vzdálenost obydlí deterministicky (`det-math.ts`), při shodě
  nižší id obydlí.
- Rodina syna se k odcházejícím přidá po lidech, ne po obydlí – i z dvorce a cizího domu.
- Kůň syna v `Settlers` a v nové vsi volně jako `looseOxen` (volitelná část stavu).
- Testy: syn vede, nástupce a syn bez jména ne, díl 1 ÷ dílníků po celých domácnostech
  (bez dvorce a domácností ostatních synů), dva synové po sobě berou stejný díl, rodina syna
  odchází z dvorce, nová ves má vojvodu a jeho synové cvičí až od ≥ 4 dospělých mimo rodinu,
  výsledek nezávisí na kouscích dopočtu.

## Pro implementaci (poznámky, ne kód)

- Volitelné části stavu: dovednosti u člověka, den, od kdy výhled vychází (hystereze). Převod
  starších vsí jednou a idempotentně (začátek `advanceVillage`).
- Čísla (hodiny, sazba růstu, stropy, úbytek, 30 dní) patří do `rules*.ts` s odkazem sem.
- Pořadí práce dne: rodina není v pracovní síle vsi (kroky 2–7), jen v kroku 3 podle pravidel
  výš; denní minimum dvorce jako každá domácnost.
- Role postav v `lib/person-roles.ts`; terče a kůl jako výbava pozemku dvorce ve scéně.

## Navazuje

- [Koně](horses.md) – jízda, péče o koně, objížďky.
- [Válka](war.md) – síla mužů rodiny, jezdci; vojvodovi synové jako první dobrovolníci.
- [Divoká zvěř](wildlife.md) – lov rodu (návrh 24. 10. 2026): divoká prasata, luk a jízda.
- Vazalství a nástupnictví ([vize](vision.md)) – vycvičený dědic jako hodnota rodu.
- [Správce vsi](steward.md) – autopilot vsí rodu (#9, fáze 3): stavby, pole, odchod syna
  a jména synů ve vsích se zapnutým správcem.

## Otevřené otázky

Uzavřené 24. 10. 2026: **zeť jako vojvoda**, **přechodné nástupnictví** a **vojvoda mimo rod**
(Martin – vrací se nejstarší syn, bez muže rodu po meči hra končí); **změnu jména** a **přednost
ženatých synů** Martin nechal bez odpovědi – platí návrh Clauda (jméno je trvalé, synové mají
přednost). Při revizi týž den Martin uzavřel **přeplněný dvorec** (vedlejší manželky odcházejí,
až je dvorec přeplněný), **konkubínu jen do prázdného obydlí** (konkubíny zrušil), **manželky
synů mimo dvorec** (pracují) a **zakladatele bez nepříbuzného páru** (partneři z okolí stačí).

**Fáze 1 issue #9 (Rod vojvody):** všechny čtyři otázky Martin uzavřel 24. 10. 2026 – nástupce
bez syna hlavní manželky, nová hlavní manželka, odchod vedlejší manželky z přeplněného dvorce
a začátek bez lidí mimo rodinu (viz Odpovědi Martina – 24. 10. 2026, odpovědi k fázi 1). Zatím
žádná otevřená otázka.

**Fáze 2 issue #9 (Dělení vsi), otevřené 30. 10. 2026:**

Všechny otázky fáze 2 Martin uzavřel 30. 10. 2026: nástupce a poměrnou část vsi rozhodl už
v zadání issue („Tohle už jsme přece jednou řešili“), odchod obydlí bez syna zůstává a výpočet
dílu – 1 ÷ (vojvoda + synové od 16 let ve vsi), lidé z obydlí nejblíž domu syna – schválil
(„Ano“).

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                  | Kdo                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Vojvoda a synové nepracují na poli, cvičí lukostřelbu, boj a jízdu; na pole jen při hladu                                                                                   | Martin (22. 10. 2026)  |
| Terče na lukostřelbu na dvorku dvorce                                                                                                                                       | Martin (22. 10. 2026)  |
| Vojvodova žena a dcery jen domácnost, na pole jen při hrozícím hladu                                                                                                        | Martin (23. 10. 2026)  |
| Jízda jen s koněm                                                                                                                                                           | Martin (22. 10. 2026)  |
| Rodina = domácnost dvorce; cvičí potomci po meči, snachy jen domácnost, zeť pracuje                                                                                         | návrh Clauda           |
| Výcvik od 7 let (luk), od 10 boj a jízda; 2 / 4 / 6 h denně, od 45 let 3 h; synové nepasou                                                                                  | návrh Clauda           |
| Dva bloky denně, luk hlavní, cvičné zbraně ze dřeva a proutí – bez zbraní jako surovin                                                                                      | návrh Clauda (rešerše) |
| Na pole: chybí práce na potřebný osev (jen podíl dne), nebo nevychází výhled jídla; návrat po 30 dnech                                                                      | návrh Clauda           |
| Dovednosti luk / boj / jízda 0–100 u člověka; 29 % zbytku za rok při 2 h; stropy 40 / 100 / −3 ročně                                                                        | návrh Clauda           |
| Bez výcviku −5 % ročně, nejníž polovina nejvyšší dosažené                                                                                                                   | návrh Clauda           |
| 2 slaměné terče, střelnice 20 m, cvičný kůl, stojan, kůl na koně; bez ceny; bez dvorce 1 terč u zemnice                                                                     | návrh Clauda           |
| Síla v boji 1 × (1 + boj / 100) – jen návrh pro válku                                                                                                                       | návrh Clauda           |
| Cvičí jen domácnost dvorce (kdo se oddělí, pracuje jako ostatní)                                                                                                            | Martin (23. 10. 2026)  |
| Rodina cvičí, až má ves aspoň 4 dospělé mimo rodinu; do té doby pracuje                                                                                                     | Martin (24. 10. 2026)  |
| Zpět k práci až pod 3 dospělé mimo rodinu (hystereze)                                                                                                                       | návrh Clauda           |
| ~~Zeť jako vojvoda: řešit později~~ – zeť vojvodou není, bez muže rodu hra končí                                                                                            | Martin (24. 10. 2026)  |
| Ztráta ≈ 25–30 % práce vsi je v pořádku                                                                                                                                     | Martin (23. 10. 2026)  |
| Issue #9 ve fázích: 1) jména, odchod synů, vojvoda cvičí celý život → 2) dělení vsi → 3) NPC → 4) seniorát                                                                  | Martin (24. 10. 2026)  |
| Nástupnictví a náhoda „bez pozvánky“ až s mechanikou NPC                                                                                                                    | Martin (24. 10. 2026)  |
| Jméno vojvody vybírá hráč při založení hry, jména synů hráč, jména vnuků se generují                                                                                        | Martin (24. 10. 2026)  |
| Jméno je vlastní text bez kontroly, jen písmena                                                                                                                             | Martin (24. 10. 2026)  |
| Jména mají legitimní mužští potomci vojvody                                                                                                                                 | Martin (24. 10. 2026)  |
| Narození syna: upozornění, čeká se na hráče, do té doby syn bez jména                                                                                                       | Martin (24. 10. 2026)  |
| Po sňatku odcházejí z dvorce všichni synové včetně nejstaršího; bez obydlí cvičí, dokud neodejde                                                                            | Martin (24. 10. 2026)  |
| Vojvoda cvičí celý život (na rozdíl od synů), hlad a stáří jako dosud                                                                                                       | Martin (24. 10. 2026)  |
| ~~Rod po meči; legitimní jsou děti manželek, děti konkubín jsou běžní obyvatelé~~ – rod po meči, konkubíny zrušeny – nahrazeno revizí 24. 10. 2026 (níž)                    | Martin (24. 10. 2026)  |
| Příznak rodu u člověka od narození                                                                                                                                          | návrh Clauda           |
| Jméno: NFC, oříznuté okraje, 1–20 písmen Unicode, bez mezer; ověřuje server; neskloňuje se; trvalé (Martin bez odpovědi)                                                    | návrh Clauda           |
| Panel jména (portrét, pole, kostka, potvrdit) před první zemnicí; Začít znovu ho předvyplní                                                                                 | návrh Clauda           |
| Upozornění „Syn vojvody čeká na jméno“ nemizí, počet, od nejstaršího; svět běží dál                                                                                         | návrh Clauda           |
| Vnuci: jméno při narození ze seznamu ≈ 60 slovanských jmen, ze seedu vsi a dne, ne jméno žijícího                                                                           | návrh Clauda           |
| Jméno v panelu a popisku člověka, v panelu dvorce, v upozorněních a kronice; ostatní bez jmen                                                                               | návrh Clauda           |
| Ženatý syn vojvody má přednost při osídlení (Martin bez odpovědi), po něm ~~konkubíny z dvorce~~ vedlejší manželky z přeplněného dvorce; svobodní synové sami neodcházejí   | návrh Clauda           |
| ~~Po smrti vojvody se do dvorce vrací nejstarší syn, bez něj vnuk po meči~~ – nástupce upřesněn revizí 24. 10. 2026 (níž)                                                   | Martin (24. 10. 2026)  |
| Bez syna i vnuka nejstarší muž rodu ve vsi; vojvodou je i chlapec                                                                                                           | návrh Clauda           |
| Převod: vojvoda a synové čekají na jméno od hráče, ostatní muži rodu generovaná, bez stěhování                                                                              | návrh Clauda           |
| Převod: ~~manželky a konkubíny~~ vedlejší manželky se zpětně nedoplňují; rod i v dvorci bez muže od 14 let; převod hru neukončí                                             | návrh Clauda           |
| ~~Ves zakládá vojvoda se 4 manželkami a 4 konkubínami~~ – nahrazeno revizí 24. 10. 2026 (níž)                                                                               | Martin (24. 10. 2026)  |
| Víc manželek ~~a konkubíny~~ smějí mít všichni muži rodu – konkubíny nahrazeno revizí 24. 10. 2026 (níž)                                                                    | Martin (24. 10. 2026)  |
| ~~Konkubíny bydlí ve vlastních obydlích se svými dětmi~~ – nahrazeno revizí 24. 10. 2026 (níž)                                                                              | Martin (24. 10. 2026)  |
| ~~Manželky vedou domácnost, konkubíny pracují~~ – nahrazeno revizí 24. 10. 2026 (níž)                                                                                       | Martin (24. 10. 2026)  |
| Vymře-li rod po meči, hra končí; Začít znovu, ves zanikne                                                                                                                   | Martin (24. 10. 2026)  |
| ~~Zakladatelé: vojvoda 25, manželky 23–17, konkubíny 22–16 let, bez dětí; konkubíny v dvorci do postavení obydlí; rodina cvičí hned~~ – nahrazeno revizí 24. 10. 2026 (níž) | návrh Clauda           |
| ~~Nejvýš 4 manželky a 4 konkubíny; další manželky a konkubíny jen z okolí ≈ 30 % ročně; konkubína jen do prázdného obydlí~~ – nahrazeno revizí 24. 10. 2026 (níž)           | návrh Clauda           |
| ~~Plodnost a rozestup na ženu; rodí i konkubína žijícího muže; po jeho smrti je svobodná~~ – nahrazeno revizí 24. 10. 2026 (níž)                                            | návrh Clauda           |
| Konec hry smrtí posledního muže rodu (i dítěte); vsi se přestanou dopočítávat, „Ves opuštěna“, obrazovka „Rod vymřel“ s kronikou rodu                                       | návrh Clauda           |
| Revize: konkubíny zrušeny; vojvoda bydlí v dvorci s hlavní manželkou a jejími dětmi, vedlejší manželky s dětmi ve vlastních domech, vojvoda je navštěvuje                   | Martin (24. 10. 2026)  |
| Vedlejší manželky odcházejí do vlastních obydlí, až když je dvorec přeplněný                                                                                                | Martin (24. 10. 2026)  |
| Cvičí všichni synové vojvody v dvorci bez ohledu na matku; kdo s matkou odejde, pracuje; k rodu patří a jméno mu dá hráč                                                    | Martin (24. 10. 2026)  |
| Opravy dvorce a domů vojvodových manželek dělají ostatní muži vsi                                                                                                           | Martin (24. 10. 2026)  |
| Vedlejší manželky vedou domácnost (na pole jen při hladu); manželky synů mimo dvorec pracují                                                                                | Martin (24. 10. 2026)  |
| Nástupcem je nejstarší syn hlavní manželky                                                                                                                                  | Martin (24. 10. 2026)  |
| Bez syna hlavní manželky nastoupí syn vedlejší manželky (nejstarší žijící syn vojvody od ní; až bez něj vnuk po meči)                                                       | Martin (24. 10. 2026)  |
| Zemře-li hlavní manželka, novou hlavní je matka nejstaršího syna (dědice); přestěhuje se do dvorce, pokud v něm nebydlí                                                     | Martin (24. 10. 2026)  |
| Z přeplněného dvorce odchází vedlejší manželka s nejstarším synem, který by se mohl starat už o dům                                                                         | Martin (24. 10. 2026)  |
| Začátek bez lidí mimo rodinu: rodina zpočátku pracuje, pravidlo ≥ 4 dospělí mimo rodinu beze změny                                                                          | Martin (24. 10. 2026)  |
| První generaci stačí partneři z okolí                                                                                                                                       | Martin (24. 10. 2026)  |
| Zakladatelé: vojvoda 25, hlavní manželka 22, vedlejší 20, 18 a 16 let, bez dětí; všech 5 v první zemnici; rodina zpočátku pracuje                                           | návrh Clauda           |
| Zakladatelé první vsi nesou jídlo na 3 roky a osivo na 2 roky potřeby (osivo jen na setí, 15 let se neuvolní) – Martin 2. 11. 2026                                          | Martin / návrh Clauda  |
| Nejvýš 4 žijící manželky, hlavní je první; další jen z okolí ≈ 30 % ročně – vždy do domu muže, i přeplněného                                                                | Martin (24. 10. 2026)  |
| Přednost při osídlení: ženatý syn vojvody → vedlejší manželka z přeplněného domu muže rodu → ostatní                                                                        | návrh Clauda           |
| Porody na ženu, žena nemusí bydlet s mužem; návštěvy vojvody jen ve scéně                                                                                                   | návrh Clauda           |
| K rodině patří i vojvodovy vedlejší manželky mimo dvorec, jejich děti tam pracují; samotné děti jdou k otci                                                                 | návrh Clauda           |
| Opravy domů rodiny ze společné práce vsi jako dosud (model práci mužů a žen nedělí)                                                                                         | návrh Clauda           |
| Převod: dnešní žena muže rodu je hlavní manželka; Vlkov beze změny                                                                                                          | návrh Clauda           |
| Převod: příznak „syn hlavní manželky“ mají všichni muži rodu kromě vojvody (ves měla jednu ženu na muže), jako při narození                                                 | návrh Clauda           |
| Rod se sousedovi nedává – výměna lidí nevybere muže rodu ani manželku muže rodu                                                                                             | návrh Clauda           |
| Z přeplněného domu odchází vedlejší manželka s nejstarším synem (bez syna až po nich, při shodě nejdéle vdaná), jen kolik je třeba                                          | Martin / návrh Clauda  |
| Přelidnění řeší odchod části vsi se synem vojvody do nové vsi – rozhodnutí hráče, u NPC vsí autopilot; ves se v simulaci nebrzdí (žádná brzda sňatků)                       | Martin (30. 10. 2026)  |
| Fáze 2: mladší syn odchází s poměrnou částí vsi, nástupcem je nejstarší syn (zadání issue #9)                                                                               | Martin (24. 10. 2026)  |
| Fáze 2: díl = 1 ÷ (vojvoda + synové od 16 let ve vsi), lidé z obydlí nejblíž domu syna                                                                                      | Martin (30. 10. 2026)  |
| Fáze 2: syn vede od 16 let a se jménem; s ním jeho jezdecký kůň                                                                                                             | návrh Clauda           |
| Odchod vybraných obydlí zůstává vedle odchodu syna – „spíš stěhování sídla v rámci mapy“                                                                                    | Martin (30. 10. 2026)  |

## Odpovědi Martina (23. 10. 2026)

1. **Kdo patří k rodině:** „Jen domácnost dvorce“.
2. **Cena dvora:** ztráta ≈ 25–30 % práce – „Ano, tak to má být“; snachy vedou jen domácnost.
3. **Synové nepasou:** zůstává návrh Clauda (Martin schválil návrh jako celek).

## Odpovědi Martina (24. 10. 2026)

Body 3, 5 a 6 (konkubíny) nahrazuje revize týž den – viz níž.

1. **Zakládání vsi:** „Až má ves ≥ 4 dospělé mimo rodinu“.
2. **Zeť jako vojvoda:** „Tohle pořešíme později, až budeme řešit nástupnické linie.“
3. **Zakladatelé a rod:** „Vesnici zakládá vojvoda a jeho rodina. Na úplném začátku bude vojvoda,
   který má 4 manželky a další 4 konkubíny. Potomci s manželkami jsou legitimními potomky vojvody,
   potomci s konkubínami jsou normální obyvatelé vesnice. Pokud rod po meči zcela vymře, hra
   končí.“
4. **Kdo smí mít víc žen:** všichni muži rodu (volba z nabídky).
5. **Kde bydlí konkubíny:** ve vlastních obydlích se svými dětmi (volba z nabídky).
6. **Práce:** „Manželky vedou domácnost, konkubíny pracují“ (volba z nabídky).
7. **Konec hry:** „Začít znovu, ves zanikne“ (volba z nabídky).
8. **Nástupnictví:** „Nejstarší syn se vrátí“ (volba z nabídky); vojvoda mimo rod odpadá.
9. **Změna jména a přednost synů při osídlení:** bez odpovědi – platí návrh Clauda.

## Odpovědi Martina (24. 10. 2026, revize fáze 1)

1. **Konkubíny:** „Ok, zrušme konkubíny, to by bylo složité. Vojvoda bude mít hlavní manželku, se
   kterou a jejími dětmi bude bydlet ve dvorci. Ostatní manželky budou mít samostatné domy, ve
   kterých budou bydlet s dětmi a vojvoda je bude chodit navštěvovat. O opravu takových obydlí
   a vojvodova dvorce se starají ostatní muži z vesnice.“
2. **Manželky synů mimo dvorec:** pracují (jako ostatní vesničanky).
3. **Zakladatelé bez nepříbuzného páru:** první generaci partneři z okolí stačí.
4. **Výcvik:** „Vedlejší manželky odcházejí do vlastních obydlí až teprve, je-li dvorec
   přeplněný. Tj. vojvoda může nějakou dobu žít klidně se dvěma manželkami a jejich dětmi ve
   dvorci a trénovat budou všechny děti ve dvorci – jsou-li to synové.“ Syn, který s matkou
   odejde, necvičí a pracuje; k rodu patří a jméno mu dá hráč.
5. **Nástupce:** nejstarší syn hlavní manželky.
6. **Práce vedlejších manželek:** vedou domácnost, na pole jen při hladu.

## Odpovědi Martina (24. 10. 2026, odpovědi k fázi 1)

1. **Nástupce bez syna hlavní manželky:** nastoupí syn vedlejší manželky (nejstarší žijící syn
   vojvody od ní; až bez něj vnuk po meči).
2. **Nová hlavní manželka:** matka nejstaršího syna, tedy matka dědice; přestěhuje se do dvorce,
   pokud v něm nebydlí.
3. **Která vedlejší manželka odchází z přeplněného dvorce:** „Ta s nejstarším synem, který by se mohl starat už o dům“.
4. **Začátek bez lidí mimo rodinu:** „Nechat, rodina zpočátku pracuje“ – pravidlo ≥ 4 dospělí
   mimo rodinu platí beze změny.
