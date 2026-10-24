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
- **Jen domácnost:** vojvodova žena, dcery, **snachy** (ženy synů v dvorci) a vnučky.
- **Ostatní muži v dvorci** (zeť, ženich z okolí) jsou rolníci a pracují jako dosud – rod jde po
  meči.
- **Kdo dvorec opustí** (ženatý syn do vlastního domu – od fáze 1 issue #9 každý, dcera k muži), přestane být rodinou
  a pracuje; naučené mu zůstane (Výcvik níž). Kdo se do dvorce přivdá, patří k rodině. Dvorec má
  nejvýš 10 míst, takže rodina je shora omezená.
- **Nástupnictví:** po smrti vojvody je vojvodou nejbližší muž rodu – vrací se nejstarší syn
  (Martin, 24. 10. 2026 – Rod vojvody, Nástupnictví). Zeť ani jiný muž mimo rod vojvodou není:
  bez muže rodu po meči hra končí (Rod vojvody – Konec rodu).
- **Konkubíny** a jejich děti k rodině nepatří – bydlí ve vlastních obydlích a pracují jako
  ostatní (Martin, 24. 10. 2026 – Rod vojvody, Manželky a konkubíny).

### Zakládání vsi (Martin 24. 10. 2026)

Kdyby vojvoda cvičil a jeho ženy vedly jen domácnost, neměl by kdo stavět obydlí. Martin: „Až
má ves ≥ 4 dospělé mimo rodinu“ (volba z nabídky).

- **Rodina cvičí místo práce, až má ves aspoň 4 dospělé (od 14 let) mimo vojvodovu rodinu**
  (cvičící muži a ženy domácnosti se nepočítají). Do té doby pracuje jako ostatní.
- **Hystereze (návrh Clauda):** kdo už cvičí, vrací se k práci až pod **3** dospělé mimo rodinu,
  ať rodina nekmitá mezi polem a dvorkem. Režim se pamatuje (volitelná část stavu).
- Čistá funkce stavu a dne (`familyTrains`); čísla `LORD.minVillageAdults` a
  `LORD.keepVillageAdults`.
- **Se zakladateli z issue #9** (vojvoda, 4 manželky, 4 konkubíny – Rod vojvody, Zakladatelé) jsou
  konkubíny mimo rodinu, takže ves má 4 dospělé mimo rodinu od prvního dne a **rodina cvičí hned**
  (návrh Clauda – pravidlo beze změny). Pracují 4 konkubíny – víc práce než dřív (2 dospělí
  zakladatelé), vojvoda pomáhá jen s chybějícím osevem (Kdy jde rodina na pole). V hájení dospělí
  neumírají, takže hystereze do 30 let nezasáhne.

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

1. **Ves nestihne potřebný osev.** Plán osevu (1. 9. a jeho jarní úprava – [pole](fields.md),
   Kolik ves oseje) počítá práci ve špičkách **bez rodiny**. Když by bez ní nestihla **potřebný
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

- **Panel dvorce:** obyvatelé jako u obydlí; u mužů rodiny tři ikony dovedností – luk, štít
  s mečem, kůň – s čísly (popisek „Lukostřelba 64 / 100“). Kůň jen u toho, kdo koně má.
- **Panel člověka:** nové role **vojvodův syn, vojvodův vnuk, vojvodova dcera, vojvodova snacha**
  (vedle dnešních vojvoda a vojvodova žena); činnost „cvičí lukostřelbu“, „cvičí boj“, „jezdí na
  koni“, „pomáhá na poli“, „vede domácnost“; dovednosti jako v panelu dvorce.
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

## Rod vojvody – zakladatelé, jména, domácnost synů a konec rodu (#9, fáze 1)

Stav: **návrh ke schválení** (24. 10. 2026, issue #9 „Vojvodská rodina“). Implementace zatím není.
Martin 24. 10. 2026 schválil rozdělení issue do fází: **1)** jména, synové po sňatku odcházejí
z dvorce, vojvoda cvičí celý život → **2)** dělení vsi a odchod mladšího syna → **3)** správa vsi
NPC → **4)** seniorát a rodové panství. K nástupnictví a náhodě „bez pozvánky“ Martin: „S tímhle
počkáme, dokud nebude fungovat NPC mechanika.“ Fázi 1 týž den doplnil: „**Vesnici zakládá
vojvoda a jeho rodina. Na úplném začátku bude vojvoda, který má 4 manželky a další 4 konkubíny.
Potomci s manželkami jsou legitimními potomky vojvody, potomci s konkubínami jsou normální
obyvatelé vesnice. Pokud rod po meči zcela vymře, hra končí.**“ Co níž není výslovně Martinovo, je
návrh Clauda.

### Kdo patří k rodu

- **Rod** = vojvoda, kterého hráč pojmenoval při založení hry, a jeho **legitimní mužští potomci
  po meči** (Martin, 24. 10. 2026) – synové, synové synů a dál, ne synové dcer, stejně jako
  u výcviku (Kdo je vojvodova rodina). **Legitimní je dítě manželky** muže rodu, **dítě konkubíny**
  je běžný obyvatel vsi (Martin).
- U člověka se uloží **příznak rodu** (volitelná část stavu), nastaví se při narození synovi
  manželky muže rodu. Rod tak nezávisí na tom, jak dlouho rodokmen drží zemřelé předky
  ([příbuzenství](kinship.md) – Rodokmen).
- Ženy rodu, děti konkubín ani ostatní lidé vsi jméno nemají ([postavy](villagers.md) – jména se
  nezobrazují).

### Zakladatelé (Martin 24. 10. 2026; věk a bydlení návrh Clauda)

- **Kdo přijde:** vojvoda **25 let**, **4 manželky** 23, 21, 19 a 17 let a **4 konkubíny** 22, 20,
  18 a 16 let – 9 lidí bez dětí, rodiče neznámí. Nahrazují dnešní dva páry (manželé 25 let,
  chlapec 13 a dívka 12 let – [obyvatelstvo](population.md), Založení vsi). Proč: ženy
  v nejplodnějším věku (porody od 16, nejvíc ve 20–24 – Růst populace) a rozložené, ať první porody
  nepřijdou najednou; vojvoda jako dnešní zakladatel – hájení (30 let) ho ochrání do 55 let, rod
  tak v hájení vymřít nemůže. První dítě nejdřív za 9 měsíců (rozestup po svatbě platí
  i konkubínám).
- **Bez nepříbuzného páru:** děti první generace mají všechny jednoho otce – jsou to nevlastní
  sourozenci a ve vsi se nevezmou. Ženy a muže jim dá okolí: nevěsta z okolí ≈ 30 % ročně, k dceři
  z domu konkubíny (dům bez mužů) se přižení ženich z okolí s ≈ 50 % ročně
  ([příbuzenství](kinship.md) – Sňatky). Viz Otevřené otázky.
- **Kde bydlí:** do dostavění první zemnice všichni na staveništi jako dnes. Pak se do zemnice –
  dvorce – nastěhuje celá devítka; konkubíny v dvorci bydlí, **dokud hráč nepostaví obydlí**
  (jinde nemají kde a staveniště, které nezvyšuje úmrtnost, by bylo únikem). Zemnice má 6 míst –
  dvorec je **přeplněný o 3** (méně porodů, víc úmrtí dětí), dokud konkubíny neodejdou. V dvorci
  konkubíny k rodině nepatří a pracují jako zeť v dvorci.
- **Každá konkubína** (i s dětmi) je **rodina k osídlení** – upozornění „Rodina čeká na dům“ ukáže
  od začátku 4. Hráč hned vidí, že má stavět; nové či prázdné obydlí obsadí podle přednosti
  (Synové po sňatku): ženatý syn vojvody → konkubína z dvorce (nejdřív ta s nejvíc dětmi, pak
  nejstarší) → ostatní jako dosud.
- **Rodina cvičí od prvního dne** – 4 konkubíny jsou 4 dospělí mimo rodinu (Zakládání vsi výš).
- **Ves z výpravy** ([stěhování](migration.md)) zakladatele nemění – odejdou, kdo odejdou.

### Manželky a konkubíny (Martin 24. 10. 2026; podrobnosti návrh Clauda)

- **Kdo:** víc manželek a konkubíny smí mít **každý muž rodu** (Martin – volba z nabídky), ostatní
  muži vsi mají jednu manželku jako dosud.
- **Kolik:** nejvýš **4 žijící manželky a 4 konkubíny** – jako zakladatel (`LORD.maxWives`,
  `LORD.maxConcubines`).
- **První manželka** jako dosud – sňatek ve vsi nebo nevěsta z okolí ([příbuzenství](kinship.md) –
  Sňatky).
- **Další manželky (2.–4.)** jen **z okolí** – žena 16–22 let, rodiče neznámí, s **≈ 30 % ročně** pro
  muže rodu od 18 let s 1–3 žijícími manželkami (jako nevěsta z okolí). Proč z okolí: muži rodu
  nesmějí brát ženy mužům vsi, ves by přišla o sňatky. Platí dnešní brzdy – v hladu a do
  přeplněného domu z okolí nikdo nepřijde. Další manželka se stěhuje k muži (vojvodovi do dvorce,
  synovi do jeho domu). Bere si ji, kdykoli má méně než 4 – i po smrti manželky.
- **Konkubíny** jen **z okolí** – žena 16–22 let, rodiče neznámí, s ≈ 30 % ročně pro muže rodu od
  18 let s aspoň jednou manželkou a méně než 4 konkubínami. Přijde **jen do prázdného obydlí, na
  které nečeká žádná rodina k osídlení** – bydlí sama (Martin), nepřeplní dvorec a nebere dům
  čekajícím. Hráč, který staví dopředu, tak rodu přidá ženy; v hladu nepřijde.
- **Bydlení:** manželky v domácnosti muže, **konkubína ve vlastním obydlí se svými dětmi**
  (Martin) – běžná domácnost vsi, kterou drží ona; dědí ji nejstarší ženatý syn jako jiný dům
  ([příbuzenství](kinship.md) – Domácnosti).
- **Práce:** **manželky vedou domácnost, konkubíny pracují** jako ostatní vesničanky (Martin).
  Manželky v dvorci žijí jako dosud vojvodova žena – na pole jen při hrozícím hladu (Kdy jde rodina
  na pole). Manželky syna, který dvorec opustil, pracují jako ženy rolníků – rodinou je jen
  domácnost dvorce (Martin, 23. 10. 2026). Viz Otevřené otázky.
- **Porody:** plodnost a rozestup **na ženu** jako dosud ([obyvatelstvo](population.md) – Růst
  populace), počet žen muže je nemění – muž je plodný bez omezení. Rodit smí manželka
  i **konkubína žijícího muže**; otcem je její muž, takže děti konkubín a manželek jsou nevlastní
  sourozenci a nevezmou se.
- **Legitimita:** syn manželky muže rodu dostane příznak rodu a jméno (Jména); **dítě konkubíny**
  je bez příznaku i jména a žije s matkou (Martin).
- **Po smrti muže:** manželky jsou vdovy a vdávají se hned ([příbuzenství](kinship.md)); konkubína
  je svobodná jako vdova – smí se vdát, děti a dům zůstávají jí. Nový vojvoda konkubíny ani vdovy
  po otci nepřebírá – za syna zemřelého se nevdávají.
- **Rozhraní:** role „konkubína“ v panelu člověka, jméno jejího muže v popisku; manželky mají role
  jako dosud (vojvodova žena, snacha). Kronika: „Bořivoj si vzal další ženu“, „Bořivoj si přivedl
  konkubínu“.

### Jména

- **Kdo jméno dává** (Martin, 24. 10. 2026): „Hráč vybírá jméno vojvody při založení hry.“
  „Vojvoda vybírá jméno jen pro své syny. Jména pro vnuky už se generují.“ Syn, kterému se narodí
  syn, dokud sám není vojvodou, dostane pro něj jméno vygenerované; až se stane vojvodou, jeho
  další synové čekají na hráče.
- **Co jméno smí obsahovat** (Martin, 24. 10. 2026): „Vlastní text bez kontroly. Povolená jsou
  jen písmena. Když bude chtít vojvoda pojmenovat syna Mrdomír, může.“ Provedení (návrh Clauda):
  text se znormalizuje (Unicode NFC) a ořízne o mezery na krajích; pak smí obsahovat **jen
  písmena Unicode** (`\p{L}` – i diakritika, cyrilice) a mít **1–20 znaků**. Bez mezer, číslic,
  pomlček a interpunkce, velikost písmen se nemění, stejné jméno dvou synů hra dovolí. Ověřuje
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
  „Syn vojvody dostal jméno – Bořivoj“ (při potvrzení), „Svatba – Bořivoj“, „Bořivoj odešel
  z dvorce“, „Zemřel Bořivoj“, „Vojvodou je Bořivoj“. Kronika zapíše jméno do události, text se
  pak nemění. Kronika v rozhraní zatím není ([obyvatelstvo](population.md)), data budou připravená.
- Muž rodu, který dvorec opustil, nese jméno dál. Ostatní lidé zůstávají bez jmen.

### Synové po sňatku odcházejí z dvorce

- Martin (24. 10. 2026): po sňatku odcházejí z dvorce **všichni synové včetně nejstaršího**.
  Dvorec tak **nemá dědice mezi ženatými syny** – výjimka z pravidla „nejstarší ženatý syn zůstává
  s rodiči“ ([příbuzenství](kinship.md) – Domácnosti). V dvorci zůstává vojvoda se ženou,
  svobodnými dětmi a ženatými syny, kteří ještě nemají kam.
- **Bez volného obydlí** (Martin, 24. 10. 2026): „Cvičí, dokud neodejde.“ Ženatý syn s rodinou
  zůstává v dvorci a cvičí dál, jeho žena je snacha (jen domácnost), jeho synové jsou vnuci
  v dvorci a cvičí také. Upozornění „Rodina čeká na dům“ jako u ostatních domů (jméno v popisku).
- **Přestěhování, když se obydlí uvolní** (návrh Clauda; Martin 24. 10. 2026 nechal bez
  odpovědi): ženatý syn vojvody je vždy rodinou k osídlení a **má přednost** před rodinami
  z ostatních domů, nejdřív nejstarší – dokud bydlí v dvorci, cvičí a ves za něj platí prací. Po
  synech jdou konkubíny z dvorce (Zakladatelé), pak ostatní jako dosud. Odejde se ženou a dětmi
  hned ten den, kdy je obydlí prázdné nebo dostavěné. Od odchodu pracuje jako rolník a dovednosti
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

### Nástupnictví (Martin 24. 10. 2026 – „Nejstarší syn se vrátí“)

- Dosud byl vojvodou nejstarší muž dvorce. Když ženatí synové odcházejí, zůstal by dvorec po smrti
  vojvody často jen s vdovami a malými dětmi – bez vojvody, bez výcviku a bez jmen.
- **Po smrti vojvody se do dvorce vrátí jeho nejstarší žijící syn ve vsi** se svou domácností
  (manželky, svobodné děti) a je vojvodou; **bez syna nejstarší vnuk po meči** (Martin). Kdo v jeho domě
  zůstane (ženatý syn – dědic podle kinship.md), dům drží; prázdný dům osídlí čekající rodina.
  Konkubíny nového vojvody zůstávají ve svých domech. Náhoda „bez pozvánky“ čeká na fázi 3
  (Martin).
- **Bez syna i vnuka** nejstarší žijící muž rodu ve vsi – bratr, synovec… (návrh Clauda); muži rodu
  v jiných vsích hráče řeší fáze 2–4. **Zeť ani jiný muž mimo rod vojvodou není** – bez muže rodu
  hra končí (Konec rodu; Martin). Případ „vojvoda mimo rod“ tím odpadá.
- **Nezletilý vojvoda** (návrh Clauda): je-li nejbližším mužem rodu chlapec, je vojvodou on – rod po
  meči žije (Martin). Bydlí-li jinde, vrátí se do dvorce s matkou a sourozenci do 16 let; cvičí
  jako chlapci jeho věku (Den rodiny), jméno mu dá hráč, jestli ho ještě nemá. Matka dvorec drží
  a vede domácnost – vdá-li se, muž se přižení k ní (jako k vdově, která drží dům – kinship.md)
  a pracuje jako zeť; chlapec tak z dvorce neodejde.
- Vdovy po vojvodovi zůstávají v dvorci se svými dětmi, dokud se nevdají (vdávají se hned –
  kinship.md), svobodní synové zůstávají a cvičí. Kronika „Vojvodou je Bořivoj“.

### Konec rodu – konec hry (Martin 24. 10. 2026 – „Začít znovu, ves zanikne“)

- **Kdy:** v den, kdy zemře **poslední žijící muž rodu** v kterékoli vsi hráče – **i chlapec nebo
  kojenec** (Martin: „Pokud rod po meči zcela vymře, hra končí“). Ženy rodu, synové dcer ani děti
  konkubín rod nedrží. Dítě narozené po smrti otce hra nemá (rodí jen žena se žijícím mužem), rod
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

- **Víc úst od začátku:** 9 lidí místo 4. Startovní zásoby na 18 měsíců ([pole](fields.md) –
  Start) se počítají na potřebu zakladatelů – ověřit, že vydrží stejně dlouho.
- **Práce:** pracují 4 konkubíny (dřív 2 dospělí; výrostci 12 a 13 let do práce nešli), první
  zemnice a pole budou rychlejší. Bez práce vsi je ale 5 z 9 dospělých – víc než schválených
  25–30 %; podíl klesá, jak ves roste.
- **Porody:** 8 plodných žen místo jedné → ≈ 3 porody ročně od druhého roku (dřív ≈ 0,35 a druhý
  pár až za ≈ 4 roky). Tlumí je přeplněný dvorec (9 lidí v 6 místech), dokud hráč nepostaví
  obydlí konkubínám, a hlad.
- **Hlad:** víc malých dětí brzy, ženy dvorce jdou na pole jen při hrozícím hladu. Riziko je
  druhý a třetí rok, kdy dojdou startovní zásoby; hájení chrání dospělé, děti hladem neumírají.
- **Rod a dvorec:** synové 4 manželek a další ženy z okolí rod rychle rozrostou; drží ho přeplněný
  dvorec a brzdy pro ženy z okolí. Měřit: lidé, domy a muži rodu v letech 10, 30 a 60, podíl práce
  rodiny, roky hladu, čekající rodiny a jak často hra skončí vymřením rodu (v hájení nemůže).
  Kalibraci pouštět jen na Martinův pokyn.

### Převod starších vsí (jednou a idempotentně)

- Příznak rodu dostane dnešní vojvoda a jeho žijící potomci po meči podle rodokmenu.
- **Vojvoda a jeho žijící synové jméno nemají** – hráč při dalším vstupu uvidí panel „Jméno
  vojvody“ a upozornění „Syn vojvody čeká na jméno“ s počtem synů (i dospělých); jména dává hráč,
  jak chce Martin. **Ostatní muži rodu** (vnuci, pravnuci) dostanou jména vygenerovaná.
- **Ženatí synové v dvorci** se nestěhují nuceně – cvičí, dokud se neuvolní obydlí, a pak
  odcházejí podle přednosti.
- **Manželky a konkubíny se zpětně nedoplňují** (návrh Clauda) – Vlkov má vojvodu s jednou ženou
  a tak zůstane. Dnešní ženy mužů rodu jsou jejich manželky a děti narozené dosud jsou legitimní;
  další manželky a konkubíny přicházejí od převodu podle pravidel výš. Zakladatelé (9 lidí) platí
  jen pro nově založené vsi.
- **Dvorec bez muže od 14 let:** rod se založí na nejstarším muži dvorce, i chlapci; bez muže
  v dvorci na nejstarším muži vsi, který se s domácností do dvorce přestěhuje jako vojvoda
  (Nástupnictví). Ves bez jediného muže rod nemá a končí jen vymřením – **převod sám hru
  neukončí**.

### Pro implementaci fáze 1 (poznámky, ne kód)

- Volitelné části stavu člověka: jméno a příznak rodu; převod v `updateVillage` / začátku
  `advanceVillage`. Validace jména čistou funkcí domény, délka v `rules*.ts` s odkazem sem,
  seznam jmen jako data domény.
- Akce: jméno vojvody jako součást založení první vsi a pojmenování muže rodu (`villageId`,
  `personId`, jméno) – server ověří, že jde o žijícího muže rodu bez jména.
- Odchod ženatých synů, přednost synů a konkubín v pravidlech osídlení (`departingFamilies`),
  nástupnictví po meči tam, kde se dnes určuje vojvoda (i `lib/person-roles.ts`).
- Volitelné části stavu: víc manželek u muže rodu (dnes jeden manžel / manželka), konkubína
  s odkazem na muže, důvod konce vsi. Porody počítají páry žena – muž, kde žena je manželka nebo
  konkubína žijícího muže. Zakladatelé v `foundVillage` (věky jako data v `rules*.ts`).
- Konec hry: `isGameOver` i bez mužů rodu, zastavení dopočtu vsí hráče, obrazovka „Rod vymřel“
  s kronikou rodu.
- Testy: jména vnuků nezávisí na kouscích dopočtu, odcházejí všichni ženatí synové, přednost
  syna, návrat nejstaršího syna, nezletilý vojvoda, konkubína jen do prázdného obydlí, dítě
  konkubíny bez příznaku rodu, konec hry po smrti posledního muže rodu, převod je idempotentní
  a hru neukončí.

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
- Lov (zatím nenavržený) – divoká prasata, luk a jízda.
- Vazalství a nástupnictví ([vize](vision.md)) – vycvičený dědic jako hodnota rodu.

## Otevřené otázky

Uzavřené 24. 10. 2026: **zeť jako vojvoda**, **přechodné nástupnictví** a **vojvoda mimo rod**
(Martin – vrací se nejstarší syn, bez muže rodu po meči hra končí); **změnu jména** a **přednost
ženatých synů** Martin nechal bez odpovědi – platí návrh Clauda (jméno je trvalé, synové mají
přednost).

**Fáze 1 issue #9 (Rod vojvody):**

- **Přeplněný dvorec.** Vojvoda se 4 manželkami a jejich dětmi se nevejde do zemnice (6 míst) ani
  do dvorce (10); přeplněnost tlumí porody manželek, zvyšuje úmrtnost dětí rodu a další manželka
  z okolí do přeplněného dvorce nepřijde. Návrh Clauda: beze změny – rod roste pomaleji a hráč má
  důvod stavět dvorec. Nebo dvorci přidat místa za každou manželku?
- **Konkubína jen do prázdného obydlí.** Návrh Clauda: konkubína z okolí přijde, jen když ve vsi
  stojí prázdné obydlí, na které nikdo nečeká. Nebo přijde vždy a do postavení domu bydlí u muže
  (přeplnění)?
- **Manželky synů mimo dvorec.** Martin: „Manželky vedou domácnost.“ Výklad návrh Clauda: jen
  v dvorci (rodina = domácnost dvorce – Martin, 23. 10. 2026); manželky syna s vlastním domem
  pracují jako ženy rolníků. Nebo vedou jen domácnost manželky každého muže rodu (dražší rod,
  méně práce vsi)?
- **Zakladatelé bez nepříbuzného páru.** Děti první generace jsou všechny nevlastní sourozenci,
  partnery jim dá jen okolí. Návrh Clauda: stačí (okolí bere i dává). Nebo k zakladatelům přidat
  nepříbuzný pár jako dosud (chlapec 13 a dívka 12 let)?

## Rozhodnutí

| Rozhodnutí                                                                                                                            | Kdo                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Vojvoda a synové nepracují na poli, cvičí lukostřelbu, boj a jízdu; na pole jen při hladu                                             | Martin (22. 10. 2026)  |
| Terče na lukostřelbu na dvorku dvorce                                                                                                 | Martin (22. 10. 2026)  |
| Vojvodova žena a dcery jen domácnost, na pole jen při hrozícím hladu                                                                  | Martin (23. 10. 2026)  |
| Jízda jen s koněm                                                                                                                     | Martin (22. 10. 2026)  |
| Rodina = domácnost dvorce; cvičí potomci po meči, snachy jen domácnost, zeť pracuje                                                   | návrh Clauda           |
| Výcvik od 7 let (luk), od 10 boj a jízda; 2 / 4 / 6 h denně, od 45 let 3 h; synové nepasou                                            | návrh Clauda           |
| Dva bloky denně, luk hlavní, cvičné zbraně ze dřeva a proutí – bez zbraní jako surovin                                                | návrh Clauda (rešerše) |
| Na pole: chybí práce na potřebný osev (jen podíl dne), nebo nevychází výhled jídla; návrat po 30 dnech                                | návrh Clauda           |
| Dovednosti luk / boj / jízda 0–100 u člověka; 29 % zbytku za rok při 2 h; stropy 40 / 100 / −3 ročně                                  | návrh Clauda           |
| Bez výcviku −5 % ročně, nejníž polovina nejvyšší dosažené                                                                             | návrh Clauda           |
| 2 slaměné terče, střelnice 20 m, cvičný kůl, stojan, kůl na koně; bez ceny; bez dvorce 1 terč u zemnice                               | návrh Clauda           |
| Síla v boji 1 × (1 + boj / 100) – jen návrh pro válku                                                                                 | návrh Clauda           |
| Cvičí jen domácnost dvorce (kdo se oddělí, pracuje jako ostatní)                                                                      | Martin (23. 10. 2026)  |
| Rodina cvičí, až má ves aspoň 4 dospělé mimo rodinu; do té doby pracuje                                                               | Martin (24. 10. 2026)  |
| Zpět k práci až pod 3 dospělé mimo rodinu (hystereze)                                                                                 | návrh Clauda           |
| ~~Zeť jako vojvoda: řešit později~~ – zeť vojvodou není, bez muže rodu hra končí                                                      | Martin (24. 10. 2026)  |
| Ztráta ≈ 25–30 % práce vsi je v pořádku                                                                                               | Martin (23. 10. 2026)  |
| Issue #9 ve fázích: 1) jména, odchod synů, vojvoda cvičí celý život → 2) dělení vsi → 3) NPC → 4) seniorát                            | Martin (24. 10. 2026)  |
| Nástupnictví a náhoda „bez pozvánky“ až s mechanikou NPC                                                                              | Martin (24. 10. 2026)  |
| Jméno vojvody vybírá hráč při založení hry, jména synů hráč, jména vnuků se generují                                                  | Martin (24. 10. 2026)  |
| Jméno je vlastní text bez kontroly, jen písmena                                                                                       | Martin (24. 10. 2026)  |
| Jména mají legitimní mužští potomci vojvody                                                                                           | Martin (24. 10. 2026)  |
| Narození syna: upozornění, čeká se na hráče, do té doby syn bez jména                                                                 | Martin (24. 10. 2026)  |
| Po sňatku odcházejí z dvorce všichni synové včetně nejstaršího; bez obydlí cvičí, dokud neodejde                                      | Martin (24. 10. 2026)  |
| Vojvoda cvičí celý život (na rozdíl od synů), hlad a stáří jako dosud                                                                 | Martin (24. 10. 2026)  |
| Rod po meči; legitimní jsou děti manželek, děti konkubín jsou běžní obyvatelé                                                         | Martin (24. 10. 2026)  |
| Příznak rodu u člověka od narození                                                                                                    | návrh Clauda           |
| Jméno: NFC, oříznuté okraje, 1–20 písmen Unicode, bez mezer; ověřuje server; neskloňuje se; trvalé (Martin bez odpovědi)              | návrh Clauda           |
| Panel jména (portrét, pole, kostka, potvrdit) před první zemnicí; Začít znovu ho předvyplní                                           | návrh Clauda           |
| Upozornění „Syn vojvody čeká na jméno“ nemizí, počet, od nejstaršího; svět běží dál                                                   | návrh Clauda           |
| Vnuci: jméno při narození ze seznamu ≈ 60 slovanských jmen, ze seedu vsi a dne, ne jméno žijícího                                     | návrh Clauda           |
| Jméno v panelu a popisku člověka, v panelu dvorce, v upozorněních a kronice; ostatní bez jmen                                         | návrh Clauda           |
| Ženatý syn vojvody má přednost při osídlení (Martin bez odpovědi), po něm konkubíny z dvorce; svobodní synové sami neodcházejí        | návrh Clauda           |
| Po smrti vojvody se do dvorce vrací nejstarší syn, bez něj vnuk po meči                                                               | Martin (24. 10. 2026)  |
| Bez syna i vnuka nejstarší muž rodu ve vsi; vojvodou je i chlapec                                                                     | návrh Clauda           |
| Převod: vojvoda a synové čekají na jméno od hráče, ostatní muži rodu generovaná, bez stěhování                                        | návrh Clauda           |
| Převod: manželky a konkubíny se zpětně nedoplňují; rod i v dvorci bez muže od 14 let; převod hru neukončí                             | návrh Clauda           |
| Ves zakládá vojvoda se 4 manželkami a 4 konkubínami                                                                                   | Martin (24. 10. 2026)  |
| Víc manželek a konkubíny smějí mít všichni muži rodu                                                                                  | Martin (24. 10. 2026)  |
| Konkubíny bydlí ve vlastních obydlích se svými dětmi                                                                                  | Martin (24. 10. 2026)  |
| Manželky vedou domácnost, konkubíny pracují                                                                                           | Martin (24. 10. 2026)  |
| Vymře-li rod po meči, hra končí; Začít znovu, ves zanikne                                                                             | Martin (24. 10. 2026)  |
| Zakladatelé: vojvoda 25, manželky 23–17, konkubíny 22–16 let, bez dětí; konkubíny v dvorci do postavení obydlí; rodina cvičí hned     | návrh Clauda           |
| Nejvýš 4 manželky a 4 konkubíny; další manželky a konkubíny jen z okolí ≈ 30 % ročně; konkubína jen do prázdného obydlí               | návrh Clauda           |
| Plodnost a rozestup na ženu; rodí i konkubína žijícího muže; po jeho smrti je svobodná                                                | návrh Clauda           |
| Konec hry smrtí posledního muže rodu (i dítěte); vsi se přestanou dopočítávat, „Ves opuštěna“, obrazovka „Rod vymřel“ s kronikou rodu | návrh Clauda           |

## Odpovědi Martina (23. 10. 2026)

1. **Kdo patří k rodině:** „Jen domácnost dvorce“.
2. **Cena dvora:** ztráta ≈ 25–30 % práce – „Ano, tak to má být“; snachy vedou jen domácnost.
3. **Synové nepasou:** zůstává návrh Clauda (Martin schválil návrh jako celek).

## Odpovědi Martina (24. 10. 2026)

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
