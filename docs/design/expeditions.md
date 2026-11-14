# Výpravy – hráč posílá lidi ze vsi

Stav: **schváleno** (Martin 14. 11. 2026: „Takhle je to ok“). Rozšiřuje [výjezd vojvody](lord-control.md):
výjezd je teď výprava, ve které je vojvoda. Z výjezdu platí dál pohyb, dohled a objevování, znalost
rodu, soused, nebezpečí a prohraný boj. Nahrazuje v něm sekce Kdo jede (Družina, Kůň), Co hráč
vidí (Výběr) a Ve scéně (Odjezd).

Martin 14. 11. 2026:

- „Vojvoda by měl mít ve svém panelu tlačítko pro osedlání koně. Po kliknutí na toto tlačítko mu
  bude kůň osedlán a přiveden vesničanem k vojvodovi. Stejně tak odsedlání – vesničan přijde
  k vojvodovi, vojvoda sesedne a vesničan mu odvede koně zpět do ohrady.“
- Na otázku, co se stane, když osedlaného koně nemá: „Půjde pěšky.“
- „Tuhle mechaniku musíme upravit. Udělejme to tak, že mohu vzít jakéhokoliv vesničana a poslat ho
  někam na mapě. Pokud s ním tři dny nepohnu, ať se vrátí do práce. Držením shiftu mohu označit víc
  vesničanů a ti pak budou chodit spolu. Výpravu pak můžu vytvořit tak, že [označím] některé lidi
  ze vsi. Pokud alespoň jeden z nich bude mít schopnost jezdit na koni, bude mít skupina tlačítko
  k osedlání, na koně však nasednou jen ti, co umí jezdit. Tím pádem musíme upravit i sesednutí.
  Když vojvoda sesedne mimo vesnici, kůň zůstane někde u něj. Kůň bude odveden [do] ohrady, až když
  bude vojvoda doma.“
- K shrnutí Clauda (víc skupin naráz, i na sousední mapy, děti ne, kdo je pryč, nepracuje, kůň se
  vede s sebou, panel družiny zmizí): „Je to tak, jak říkáš.“

## Proč

Hráč řídí lidi své vsi jako jednotky v 0 A.D. – kohokoli vybere a pošle. Výprava není zvláštní
rozhraní, ale prostě skupina lidí, které hráč označil.

## Pravidla

### Kdo smí jít

- Kdokoli ze vsi **od 12 let** (Martin: „Je to tak, jak říkáš“), který je doma nebo už ve skupině,
  není raněný ani zajatý a není na tažení. Na mapě vsi nesmí být cizí vojsko – ves se brání
  ([válka](war.md) – Obránci), jako dnes u vojvody.
- Kdo je ve skupině, nejde vybrat do vojska ([výjezd](lord-control.md) – Výjezd a tažení).

### Výběr a skupina (jako v 0 A.D.)

- Klik na člověka ve scéně nebo na jeho portrét v panelu obydlí ho vybere. **Shift + klik** přidá
  dalšího nebo ho z výběru ubere (Martin).
- **Pravé tlačítko na zem** pošle všechny vybrané jako jednu skupinu. Jdou spolu (Martin), tempem
  nejpomalejšího ([válka](war.md) – Skupina jde tempem nejpomalejšího). Na zemi zůstane praporek
  cíle.
- **Víc skupin naráz**, každá jinam (Martin: „Je to tak, jak říkáš“).
- Návrh Clauda – jako formace v 0 A.D.:
  - Klik na člena skupiny na cestě vybere celou skupinu. Klik na portrét v panelu skupiny vybere
    jen toho člověka.
  - Lidé z různých skupin, kteří dostanou společný rozkaz, jsou od té chvíle jedna skupina.
  - Rozkaz jen části skupiny ji rozdělí – zbytek stojí, kde je, a čeká.
- Pravé tlačítko s vybranou stavbou nebo polem dál výběr ruší jako dnes.

### Rozkazy, čekání a návrat

- Jako u výjezdu: **Jdi sem**, **Přes okraj** (i na sousední mapy, Martin: „Je to tak, jak
  říkáš“), **Domů**. Nový rozkaz nahradí starý.
- Skupina, se kterou hráč **3 herní dny** nepohne, jde domů a lidé se vrátí do práce (Martin).
  Platí i pro skupinu, která stojí ve vsi – třeba osedlaná a nikam neposlaná (návrh Clauda).
- Doma se každý vrátí ke své práci. Jezdci sesednou a vesničan odvede koně do ohrady (Martin:
  „Kůň bude odveden [do] ohrady, až když bude vojvoda doma.“).

### Koně

- Jezdit umí jen vojvoda a jeho synové s vycvičeným jezdeckým koněm ([koně](horses.md) – Výcvik
  koně a jezdec).
- **Osedlat** (Martin): tlačítko má výběr, ve kterém je aspoň jeden jezdec, který nesedí na koni.
  - **Doma:** vesničan dojde do ohrady, osedlá koně všech jezdců z výběru a přivede jim je. Jezdci
    nasednou. Na koně nasednou jen ti, co umí jezdit (Martin).
  - Vesničan je nejbližší dospělý ze vsi, který není ve skupině (návrh Clauda).
  - **Mimo ves** jezdec, který má koně u sebe, nasedne sám. Jezdec, jehož kůň je v ohradě, venku
    nenasedne – důvod u kurzoru „Kůň je doma.“ (návrh Clauda).
  - Rozkaz během sedlání: skupina počká, až jezdci nasednou, a pak vyrazí (návrh Clauda).
- **Bez osedlaného koně jde jezdec pěšky** (Martin: „Půjde pěšky.“).
- **Sesednout** (Martin) jde kdykoli:
  - **Doma** vesničan přijde, jezdec sesedne a vesničan odvede koně do ohrady (Martin).
  - **Mimo ves** zůstane kůň u jezdce (Martin). Jde-li skupina dál, jezdec ho vede s sebou pěšky
    (Martin: „Je to tak, jak říkáš“).

### Doma mezitím

- Kdo je ve skupině, ve vsi nepracuje – ani když skupina stojí ve vsi (Martin: „Je to tak, jak
  říkáš“). Jí dál ze zásob vsi jako doma – výprava nic neveze ([výjezd](lord-control.md) – Zásoby
  a zima).
- Správce skupiny nevysílá ani neruší (návrh Clauda).

### Co platí dál z výjezdu

- Pro každou skupinu, ať v ní vojvoda je, nebo ne: pohyb, dohled a objevování, znalost rodu, soused,
  nebezpečí (šelmy, cizí rod) a prohraný boj ([výjezd](lord-control.md)).
- Mapu odkrývá a znalost rodu zvyšuje každá skupina, i bez vojvody (Martin: „Je to tak, jak
  říkáš“).
- **Šelmy** napadnou v hustém lese osamělého člověka nebo skupinku nejvýš dvou lidí – i ženu
  s dítětem, ne jen muže (Martin 14. 11. 2026: „K těm šelmám ano, je to tak jak říkáš“). Čísla
  jako u výjezdu ([výjezd](lord-control.md) – Nebezpečí) s bojem každého člověka – kdo se bránit
  neumí, je ve větším nebezpečí.
- Člověk je vždy jen v jedné skupině. Vůdcem skupiny s vojvodou je vojvoda.
- Lhůta 3 dnů běží od dojetí, u skupiny stojící ve vsi od osedlání. Každý rozkaz ji počítá znovu
  ([výjezd](lord-control.md) – Na místě a návrat).
- Ves s lidmi pryč pracuje s těmi, kdo jsou doma. Nic ji nechrání – vezme-li hráč všechny muže,
  stavby stojí (návrh Clauda, jako „Hráč staví kdy chce“).

### Koně mimo ves (návrh Clauda)

- Kůň venku je dál koněm vsi. Jí ze zásob vsi jako jeho jezdec a chov ani porážka ho nevyberou,
  dokud není v ohradě.
- Do ohrady ho odvede nejbližší dospělý, který je doma. Když doma nikdo není, odvede ho jezdec sám.
- Padne-li jezdec nebo ho zabije šelma, kůň se vrátí do ohrady sám.
- Jezdcem je jen vojvoda nebo jeho syn z této vsi, který umí jezdit ([koně](horses.md)). Na
  výpravu jde jen od 12 let.
- „Hráč je tam, kde je vojvoda“ ([válka](war.md) – Hráč ve vsi a mimo ni) beze změny.
- Upozornění nesou jméno vůdce skupiny – vojvody, jinak nejstaršího muže, jinak nejstaršího člena
  (návrh Clauda): „Bořivoj se vrátil.“, „Bořivoj napaden u Kněžic!“

### Co zmizí

- Panel výjezdu s řadou mužů rodu a výběrem družiny (Martin: „Je to tak, jak říkáš“) – družinu
  nahradí výběr Shiftem.
- Odjezd na koni od dvorce bez osedlání ([výjezd](lord-control.md) – Ve scéně, [koně](horses.md) –
  Ve scéně) – nahradí ho Osedlat.

## Co hráč vidí (UI jako 0 A.D.)

Návrh Clauda.

- **Jeden vybraný:** panel osoby jako dnes, k tomu tlačítka Osedlat / Sesednout a Domů (je-li
  pryč).
- **Víc vybraných:** řada portrétů (klik vybere jen toho člověka) a tlačítka Osedlat / Sesednout
  a Domů. Meč se silou skupiny jako dnes u výjezdu.
- **Důvod u kurzoru:** dnešní důvody výjezdu („Tam nedojde.“, „Ves je napadena.“, „Tam je
  válka.“…), k tomu „Kůň je doma.“, „Je raněný.“ a „Je na tažení.“.
- **Lišta:** portrét vojvody s podkovou, když je vojvoda pryč, zůstává. Jiné skupiny v liště nejsou
  – hráč je najde ve scéně.

## Ve scéně

Návrh Clauda.

- Pěší jako postavy vsi, jezdci na koni. Kůň vedený za uzdu jde vedle pěšího jezdce.
- **Osedlání doma:** vesničan dojde k ohradě, vyvede koně a dovede je k jezdcům, ti nasednou.
  **Sesednutí doma** opačně (Martin).
- Praporek cíle u vybrané skupiny.

## Čísla

| Co                | Hodnota                                                                                         | Odkud                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| věk pro výpravu   | od 12 let                                                                                       | Martin 14. 11. 2026 (k návrhu Clauda)                                             |
| čekání bez pohybu | 3 herní dny                                                                                     | Martin 12. a 14. 11. 2026                                                         |
| tempo             | ≈ 3,5 m/s, jezdci × 1,5, sníh × 0,75                                                            | [válka](war.md)                                                                   |
| osedlání doma     | cesta vesničana do ohrady a s koňmi k jezdcům tempem pěšího + 10 s; sesednutí: k jezdcům + 10 s | návrh Clauda (plán 2026-11-14 – Rozhodnutí 7); 10 s – [koně](horses.md), Ve scéně |

## Na stavitelovi

- Úložiště pro víc skupin naráz – dnes je jeden výjezd na hráče a skupiny jsou v jeho stavu.
- Převod běžícího výjezdu do nové podoby.
- Pořadí zavedení po úlohách.
