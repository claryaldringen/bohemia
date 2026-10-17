# Řemesla – uhlíř, kovář, hrnčíř

Stav: návrh k 17. 10. 2026, čeká na schválení. Implementace zatím není.

## Proč

Ves, která má nadvýrobu jídla, ji může proměnit v pokrok: uživí řemeslníky, kteří nepracují na
poli, a jejich výrobky zvednou produktivitu celé vsi (Martin). Hráč tak řeší, kdy už je ves
dost silná, aby si řemeslníka dovolila.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** kovář vyrábí železné nástroje a zvyšuje **produktivitu práce celé vsi** (Martin).
- **Cíl:** hrnčíř zvyšuje **produktivitu výroby potravin** (Martin).
- **Cíl:** uhlíř pálí dřevo na uhlí pro kováře (Martin).
- **Cíl:** řemeslník pracuje v dílně místo na poli – **zbytek vsi musí mít nadvýrobu, aby ho
  uživil** (Martin).
- **Ne-cíl (teď):** obchod, peníze, horník a doly, další řemesla, kvalita výrobků, zbraně.
- **Anti-cíl:** řemeslo jako čisté plus bez ceny – každý řemeslník je o domácnost míň na poli.

## Budovy

Vzhled podle Martina (modely se připravují v `tools/blender/`):

| Budova | Základ      | Navíc                                                     |
| ------ | ----------- | --------------------------------------------------------- |
| Hrnčíř | polozemnice | ještě víc předsazená střecha vpředu, pod ní hrnčířská pec |
| Kovář  | polozemnice | totéž, pod střechou výheň a kovadlina                     |
| Uhlíř  | zemnice     | zelená střecha krytá mechem, kus od ní (≈ 10 m) milíř     |

- **Dílna je zároveň obydlí** (Martin): bydlí v ní domácnost a ta řemeslo provozuje. Stavba
  stojí jako základní obydlí + **30 % navíc** za pec, výheň nebo milíř (návrh Clauda), dřevo podle
  [lesa](forest.md). Umisťuje se jako obydlí; u uhlíře musí být volné i místo milíře.
- **Kdo se nastěhuje:** stejně jako do nového obydlí – mladý pár z přeplněné domácnosti
  ([populace](population.md)). Prázdná dílna nic nevyrábí (Martin). Když domácnost vymře nebo
  odejde, řemeslo přebírá další, kdo se nastěhuje – řemeslo patří budově.
- **Chátrání a přestavba** jako u základního obydlí; přestavba zachová řemeslo.

## Práce a jídlo

- **Řemeslník nepracuje na poli** (Martin): dospělí domácnosti dílny dávají svou práci (po domácí
  výrobě) řemeslu, ne do společné práce vsi. Jedí ze společných zásob jako všichni.
- **Řemeslník vyrábí podle potřeby vsi** (návrh Clauda): dokud zásoba výrobku nepokrývá potřebu
  na **2 roky**. Když má plno, nebo mu chybí vstup (kovář bez uhlí), pracuje ve společné práci vsi –
  jeho práce nepropadne.

## Výroba (návrh Clauda)

- **Uhlíř:** kácí dospělé stromy v nejbližším lese stejně jako stavby ([les](forest.md) – kácení,
  vzdálenost, pařezy, obnova), skládá milíř a pálí. **10 kg uhlí za člověkoden**, strom dá
  **≈ 120 kg uhlí**. Když není z čeho kácet, uhlí nevzniká.
- **Kovář:** sbírá bahenní rudu v mokřadech u potoka, taví ji v jednoduché peci a kuje
  (Martin: železo si taví sám, žádný horník ani obchod). **1 kg nástrojů = 4 člověkodny a 30 kg
  uhlí.** Ruda dál od vody stojí víc práce: +1 % za každých 10 m nad 100 m od dílny k potoku.
- **Hrnčíř:** kope hlínu u potoka, točí a vypaluje nádoby v peci. **1 kg keramiky = 1 člověkoden**,
  topí dřevem z lesa: **1 strom na 400 kg** vypálené keramiky. Hlína dál od vody: stejná přirážka
  jako ruda.

## Účinek (návrh Clauda)

- **Nástroje:** každý pracující (od 14 let) potřebuje **3 kg nástrojů**; nástroje se opotřebují
  o **30 % ročně**. Pokrytí = zásoba ÷ potřeba (nejvýš 1). **Veškerá práce vsi** (pole, stavby,
  kácení, domácí výroba) je **× (1 + 0,3 × pokrytí)** – plně vybavená ves udělá o 30 % víc.
- **Keramika:** každý člověk potřebuje **5 kg nádob**, ročně se **40 %** rozbije. Pokrytí jako
  u nástrojů. **Ze stejné úrody je víc jídla** – denní spotřeba obilí na člověka je
  **× (1 − 0,15 × pokrytí)** (méně ztrát při skladování a vaření); jablka v nádobách vydrží
  do **1. 5.** místo 1. 3. ([sad](orchard.md)).
- Uhlí samo nic nezlepšuje – je jen pro kováře.

**Pro představu:** ves se 40 pracujícími a 60 lidmi potřebuje ročně ≈ 36 kg nástrojů
(≈ 145 člověkodní kováře, ≈ 1 100 kg uhlí ≈ 110 člověkodní uhlíře) a ≈ 120 kg keramiky
(≈ 120 člověkodní hrnčíře). Řemeslnická domácnost dá řemeslu ≈ 400–500 člověkodní ročně, takže
jeden řemeslník obslouží i větší ves – ale malá ves ze dvou domácností ho neuživí.

## Co hráč vidí

- V panelu staveb ikony hrnčíře, kováře a uhlíře (tooltip: název a cena); tlačítko je zašedlé
  jen podle surovin (dřevo – [les](forest.md)).
- V horní liště zásoby **uhlí, nástrojů a keramiky** (ikona + číslo).
- U vybrané dílny: domácnost, co právě dělá (vyrábí / čeká na uhlí / pomáhá vsi), zásoba výrobku.
- Ve scéně: dým z pece a z milíře, když se pracuje.

## Rozhodnutí

| Rozhodnutí                                                                           | Kdo          |
| ------------------------------------------------------------------------------------ | ------------ |
| Uhlíř pálí uhlí pro kováře; kovář dělá nástroje → produktivita práce celé vsi        | Martin       |
| Hrnčíř zvyšuje produktivitu výroby potravin                                          | Martin       |
| Dílna je obydlí, řemeslo provozuje domácnost, která v ní bydlí; prázdná nic nevyrábí | Martin       |
| Řemeslník nepracuje na poli – ves ho musí uživit z nadvýroby                         | Martin       |
| Kovář si železo taví sám z bahenní rudy, žádný horník ani obchod                     | Martin       |
| Vzhled budov (hrnčíř, kovář, uhlíř s milířem)                                        | Martin       |
| Cena dílny +30 %, výroba do zásoby na 2 roky, jinak společná práce                   | návrh Clauda |
| Výkony (10 kg uhlí/čd, 4 čd + 30 kg uhlí na 1 kg nástrojů, 1 čd na 1 kg keramiky)    | návrh Clauda |
| Účinky: nástroje +30 % práce, keramika −15 % spotřeby, jablka do 1. 5.               | návrh Clauda |
| Potřeby: 3 kg nástrojů na pracujícího (−30 %/rok), 5 kg nádob na člověka (−40 %/rok) | návrh Clauda |
