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
  zemnice zakladatelů). **Vojvoda** je hlava dvorce jako dnes – nejstarší muž od 14 let i ve stáří
  ([postavy](villagers.md) – Role). Dvorec bez muže od 14 let vojvodu nemá – nikdo necvičí
  (návrh Clauda).
- **Cvičí:** vojvoda a jeho **potomci po meči** v dvorci – synové a vnuci (synové dědice).
- **Jen domácnost:** vojvodova žena, dcery, **snachy** (ženy synů v dvorci) a vnučky.
- **Ostatní muži v dvorci** (zeť, ženich z okolí) jsou rolníci a pracují jako dosud – rod jde po
  meči.
- **Kdo dvorec opustí** (mladší ženatý syn do vlastního domu, dcera k muži), přestane být rodinou
  a pracuje; naučené mu zůstane (Výcvik níž). Kdo se do dvorce přivdá, patří k rodině. Dvorec má
  nejvýš 10 míst, takže rodina je shora omezená.
- **Nástupnictví** beze změny: po smrti vojvody je vojvodou nejstarší muž dvorce, výcvik běží dál.
  Vojvodou se tak může stát i zeť – viz Otevřené otázky.

### Zakládání vsi (Martin 24. 10. 2026)

Nová ves má jednu domácnost zakladatelů (dva páry, chlapec a dívka v první zemnici, která je
dvorcem). Kdyby vojvoda cvičil a jeho žena vedla jen domácnost, neměl by kdo stavět obydlí.
Martin: „Až má ves ≥ 4 dospělé mimo rodinu“ (volba z nabídky).

- **Rodina cvičí místo práce, až má ves aspoň 4 dospělé (od 14 let) mimo vojvodovu rodinu**
  (cvičící muži a ženy domácnosti se nepočítají). Do té doby pracuje jako ostatní.
- **Hystereze (návrh Clauda):** kdo už cvičí, vrací se k práci až pod **3** dospělé mimo rodinu,
  ať rodina nekmitá mezi polem a dvorkem. Režim se pamatuje (volitelná část stavu).
- Čistá funkce stavu a dne (`familyTrains`); čísla `LORD.minVillageAdults` a
  `LORD.keepVillageAdults`.

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
   chybí (podzim, jaro, žně), dá každý dospělý rodiny podíl dne = chybějící práce ÷ práce rodiny,
   zbytek dne cvičí. Osev navíc, stavby ani opravy rodina nedělá nikdy.
2. **Výhled jídla nevychází.** Když ves i po nouzové porážce šetří jídlem nebo hladoví (příděl pod
   plný – [populace](population.md), Stupně upozornění), jdou všichni dospělí rodiny (muži i ženy
   od 14 let) celý den do **potřebných sezónních úloh** (krok 3 pořadí práce – pole, seč, sklizeň,
   výmlat). Mimo sezónu, kdy na poli práce není, cvičí dál. Chlapci 7–13 let cvičí vždy (do práce
   vsi nejdou ani ostatní výrostci).
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
  dřevěné trojnožce s okrovým kruhem, za nimi proutěný plůtek na zachycení šípů. Dva terče stačí:
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

- **Zeť jako vojvoda.** Po smrti vojvody bez syna je vojvodou nejstarší muž dvorce, třeba zeť.
  Martin (24. 10. 2026): „Tohle pořešíme později, až budeme řešit nástupnické linie.“ Zatím platí
  stávající pravidlo návrhu bez zvláštností: rodina = nový vojvoda a jeho potomci po meči
  v dvorci, synové předchozího vojvody jsou rolníci.

## Rozhodnutí

| Rozhodnutí                                                                                              | Kdo                    |
| ------------------------------------------------------------------------------------------------------- | ---------------------- |
| Vojvoda a synové nepracují na poli, cvičí lukostřelbu, boj a jízdu; na pole jen při hladu               | Martin (22. 10. 2026)  |
| Terče na lukostřelbu na dvorku dvorce                                                                   | Martin (22. 10. 2026)  |
| Vojvodova žena a dcery jen domácnost, na pole jen při hrozícím hladu                                    | Martin (23. 10. 2026)  |
| Jízda jen s koněm                                                                                       | Martin (22. 10. 2026)  |
| Rodina = domácnost dvorce; cvičí potomci po meči, snachy jen domácnost, zeť pracuje                     | návrh Clauda           |
| Výcvik od 7 let (luk), od 10 boj a jízda; 2 / 4 / 6 h denně, od 45 let 3 h; synové nepasou              | návrh Clauda           |
| Dva bloky denně, luk hlavní, cvičné zbraně ze dřeva a proutí – bez zbraní jako surovin                  | návrh Clauda (rešerše) |
| Na pole: chybí práce na potřebný osev (jen podíl dne), nebo nevychází výhled jídla; návrat po 30 dnech  | návrh Clauda           |
| Dovednosti luk / boj / jízda 0–100 u člověka; 29 % zbytku za rok při 2 h; stropy 40 / 100 / −3 ročně    | návrh Clauda           |
| Bez výcviku −5 % ročně, nejníž polovina nejvyšší dosažené                                               | návrh Clauda           |
| 2 slaměné terče, střelnice 20 m, cvičný kůl, stojan, kůl na koně; bez ceny; bez dvorce 1 terč u zemnice | návrh Clauda           |
| Síla v boji 1 × (1 + boj / 100) – jen návrh pro válku                                                   | návrh Clauda           |
| Cvičí jen domácnost dvorce (kdo se oddělí, pracuje jako ostatní)                                        | Martin (23. 10. 2026)  |
| Rodina cvičí, až má ves aspoň 4 dospělé mimo rodinu; do té doby pracuje                                 | Martin (24. 10. 2026)  |
| Zpět k práci až pod 3 dospělé mimo rodinu (hystereze)                                                   | návrh Clauda           |
| Zeť jako vojvoda: řešit později, s nástupnickými liniemi                                                | Martin (24. 10. 2026)  |
| Ztráta ≈ 25–30 % práce vsi je v pořádku                                                                 | Martin (23. 10. 2026)  |

## Odpovědi Martina (23. 10. 2026)

1. **Kdo patří k rodině:** „Jen domácnost dvorce“.
2. **Cena dvora:** ztráta ≈ 25–30 % práce – „Ano, tak to má být“; snachy vedou jen domácnost.
3. **Synové nepasou:** zůstává návrh Clauda (Martin schválil návrh jako celek).

## Odpovědi Martina (24. 10. 2026)

1. **Zakládání vsi:** „Až má ves ≥ 4 dospělé mimo rodinu“.
2. **Zeť jako vojvoda:** „Tohle pořešíme později, až budeme řešit nástupnické linie.“
