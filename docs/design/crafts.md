# Řemesla – uhlíř, kovář, hrnčíř

Stav: **schváleno 18. 10. 2026 (Martin), implementováno 18. 10. 2026**. Návrh ze 17. 10. 2026 týž
den přepracován podle Martina (řemeslník na plný úvazek, účinky jako meze produktivity) a podle
[rešerše](research/2026-10-17-remesla-drevo-sad.md). Jádro: `packages/game/src/domain/village/crafts.ts`
(výroba, pokrytí, opotřebení, půdorys dílny a milíře), meze v `productivity.ts`, čísla v `rules.ts`;
co se při implementaci rozhodlo navíc, je v části [Implementace](#implementace).

## Proč

Ves, která má nadvýrobu jídla, ji může proměnit v pokrok: uživí řemeslníky, kteří nepracují na
poli, a jejich výrobky zvednou produktivitu celé vsi (Martin). Hráč tak řeší, kdy už je ves
dost silná, aby si řemeslníka dovolila.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** kovář vyrábí železné nástroje a **zvyšuje produktivitu práce celé vsi** (Martin) –
  snižuje pracnost od nejhorší meze k nejlepší.
- **Cíl:** hrnčíř posouvá **produktivitu výroby potravin** – ztráty zásob a denní minimum
  domácností (Martin).
- **Cíl:** uhlíř pálí dřevo na uhlí pro kováře (Martin).
- **Cíl:** řemeslník pracuje v dílně **na plný úvazek**, nikdy na poli – **zbytek vsi musí mít
  nadvýrobu, aby ho uživil** (Martin).
- **Ne-cíl (teď):** obchod (přebytky zatím zůstávají v zásobě), peníze, horník a doly, další
  řemesla, kvalita výrobků, zbraně, odemykání řemesel podle letopočtu (doba se zatím neřeší –
  Martin).
- **Anti-cíl:** řemeslo jako čisté plus bez ceny – každý řemeslník je o domácnost míň na poli.

## Meze produktivity (Martin)

Martin (17. 10. 2026): „U řemeslníků uvažuj, že svůj job dělají na fulltime. Ta produktivita má
nějaké meze. Bez řemeslníků ber tu nejhorší hranici, s řemeslníky tu nejlepší.“

- Každá práce nebo ztráta, kde literatura dává rozpětí, má **nejhorší mez** (nejvíc člověkodní,
  nejvyšší ztráty – ves bez řemeslníků) a **nejlepší mez** (nejméně člověkodní, nejnižší ztráty –
  plně pokrytá potřeba výrobků řemeslníků). Řemeslníci **zvyšují produktivitu, tedy snižují
  pracnost** od nejhorší meze k nejlepší **lineárně podle pokrytí** 0–1. Kde literatura dává
  jedno číslo, platí obojí (seznam mezí: [pole a jídlo](fields.md) – Meze produktivity).
- **Pokrytí nástroji** = zásoba nástrojů ÷ potřeba vsi (nejvýš 1), **pokrytí nádobami** totéž
  pro keramiku (potřeby viz Účinek).
- Bez řemesel (dnes) platí všude nejhorší mez.

## Budovy

Vzhled podle Martina (modely se připravují v `tools/blender/`):

| Budova | Základ      | Navíc                                                     |
| ------ | ----------- | --------------------------------------------------------- |
| Hrnčíř | polozemnice | ještě víc předsazená střecha vpředu, pod ní hrnčířská pec |
| Kovář  | polozemnice | totéž, pod střechou výheň a kovadlina                     |
| Uhlíř  | zemnice     | zelená střecha krytá mechem, kus od ní (≈ 10 m) milíř     |

- **Dílna je zároveň obydlí** (Martin): bydlí v ní domácnost a ta řemeslo provozuje. Stavba
  stojí jako základní obydlí + **30 % navíc** za pec, výheň nebo milíř (návrh Clauda), dřevo podle
  [lesa](forest.md) (také + 30 %). Umisťuje se jako obydlí; u uhlíře musí být volné i místo milíře.
- **Kdo se nastěhuje:** stejně jako do nového obydlí – mladý pár z přeplněné domácnosti
  ([populace](population.md)). Prázdná dílna nic nevyrábí (Martin). Když domácnost vymře nebo
  odejde, řemeslo přebírá další, kdo se nastěhuje – řemeslo patří budově.
- **Chátrání a přestavba** jako u základního obydlí; přestavba zachová řemeslo.

## Práce a jídlo

- **Řemeslník pracuje na plný úvazek** (Martin): dospělí domácnosti dílny dávají řemeslu všechnu
  svou práci po denním minimu a domácí výrobě – celý rok, **nikdy na poli** ani ve společné práci
  vsi. Jedí ze společných zásob jako všichni.
- **Co ves nespotřebuje, zůstane v zásobě** (Martin) – později pro obchod. Výroba se nezastaví,
  když je potřeba vsi pokrytá.
- **Bez vstupu stojí** (Martin): kovář bez uhlí a uhlíř bez dospělých stromů nevyrábějí – práce
  domácnosti propadne, jíst musí dál.
- ~~Řemeslník vyrábí do zásoby na 2 roky, pak pracuje ve společné práci vsi~~ – zrušeno, řemeslník
  pracuje na plný úvazek (Martin).

## Výroba

**Strom = velký dospělý strom** (≈ 0,7–1,5 m³ dřeva) – jedna jednotka pro stavby
([les](forest.md)), uhlí i keramiku (Martin – oprava podle rešerše).

- **Uhlíř:** kácí dospělé stromy v nejbližším lese stejně jako stavby ([les](forest.md) – kácení,
  vzdálenost, pařezy, obnova), skládá milíř a pálí. **10 kg uhlí za člověkoden** (sedí,
  konzervativně – FAO 1987), strom dá **≈ 120 kg uhlí** (sedí pro velký strom – dřevo : uhlí
  4–8 : 1). Když není z čeho kácet, uhlí nevzniká.
- **Kovář:** sbírá bahenní rudu v mokřadech u potoka, taví ji v jednoduché peci a kuje
  (Martin: železo si taví sám, žádný horník ani obchod). **1 kg nástrojů = 10 člověkodní
  a 50 kg uhlí** (oprava podle rešerše, dřív 4 člověkodny a 30 kg: Crew 1991 – ≈ 25 člověkodní
  a ≈ 100 kg uhlí na 1 kg tyčového železa v malé pravěké peci, Salter ≈ 60 kg uhlí; raně
  středověké pece byly výkonnější). Ruda dál od vody stojí víc práce: +1 % za každých 10 m nad
  100 m od dílny k potoku.
- **Hrnčíř:** kope hlínu u potoka, tvaruje a vypaluje nádoby. **1 kg keramiky = 1 člověkoden**
  (nedohledáno, návrh Clauda), topí dřevem z lesa: **1 strom na 500 kg** vypálené keramiky
  (oprava podle rešerše, dřív 400 – tradiční pece spálí 0,8–1,2 kg dřeva na kg keramiky, Adubah
  2025). Hlína dál od vody: stejná přirážka jako ruda.

## Účinek

- **Nástroje:** každý pracující (od 14 let) potřebuje **3 kg nástrojů**, nástroje se opotřebují
  o **30 % ročně** (nedohledáno, návrh Clauda; Karlsson 2015: středověká usedlost ztratila ≈ 1 kg
  železa ročně jen opotřebením rádla). **Kovář snižuje pracnost všech prací s mezemi**
  od nejhorší meze k nejlepší podle pokrytí nástroji: polní práce na osetý hektar **205 → 120
  člověkodní**, založení pole na louce 100 → 90, na skutečných křovinách 100 → 60 a v lese
  250 → 150, vracení přílohu 100 → 90 (příloh je pastvina – drn jako louka; nálet ani les na něm
  nebude, Martin 18. 10. 2026). Stavby,
  kácení a domácí výroba mají zatím jedno číslo (rozpětí nedohledáno) – meze se doplní, až se
  najdou.
- **Keramika:** každý člověk potřebuje **5 kg nádob**, ročně se **40 %** rozbije (nedohledáno,
  návrh Clauda). **Hrnčíř posouvá podle pokrytí nádobami ztráty zásob 10 → 5 % ročně a denní
  minimum domácnosti 0,5 → 0,45 člověkodne** (rozpětí návrh Clauda – utěsněné obilní jámy
  ztrácejí málo, Butser; denní minimum 0,5–0,6 dne, FAO); jablka v nádobách vydrží do **1. 5.**
  místo 1. 3. ([sad](orchard.md)).
- ~~Nástroje +30 % ke všem pracím, keramika −15 % spotřeby obilí~~ – zrušeno, účinky jsou meze
  produktivity (Martin); −15 % nemělo oporu – obilí se skladovalo v jamách a sýpkách, ne
  v keramice (rešerše).
- Uhlí samo nic nezlepšuje – je jen pro kováře.

**Pro představu:** ves se 40 pracujícími a 60 lidmi potřebuje ročně ≈ 36 kg nástrojů
(≈ 360 člověkodní kováře, ≈ 1 800 kg uhlí ≈ 180 člověkodní uhlíře a ≈ 15 velkých stromů)
a ≈ 120 kg keramiky (≈ 120 člověkodní hrnčíře, ≈ ¼ stromu). Řemeslnická domácnost dá řemeslu
≈ 300–800 člověkodní ročně podle složení, takže jeden kovář obslouží i větší ves a co
nespotřebuje, jde do zásoby. Malá ves ze dvou domácností ho ale neuživí – a teprve s plně
pokrytými nástroji ušetří na polní práci až ≈ 40 %.

## Doba (neřeší se)

Rešerše: keramika pražského typu se v 6.–9. století dělala v ruce a pálila na ohništi, dílna
s pecí a hrnčířským kruhem se šíří až v 10.–11. století (Válka 2014). Martin: co předbíhá dobu,
zatím neřešit – letopočet začátku hry se může posunout.

## Co hráč vidí

- V panelu staveb ikony hrnčíře, kováře a uhlíře (tooltip: název a cena); tlačítko je zašedlé
  jen podle surovin (dřevo – [les](forest.md)).
- V horní liště zásoby **uhlí, nástrojů a keramiky** (ikona + číslo).
- U vybrané dílny: domácnost, co právě dělá (vyrábí / čeká na uhlí), zásoba výrobku.
- Ve scéně: dým z pece a z milíře, když se pracuje.

## Implementace

Rozhodnutí kontroléru při implementaci (18. 10. 2026) – kde návrh nechával volnost:

- **Dílna = obydlí s řemeslem** (`Dwelling.workshop`): hrnčíř a kovář polozemnice, uhlíř zemnice.
  Cena **286 člověkodní a 23 stromů** (hrnčíř, kovář) a **78 člověkodní a 9 stromů** (uhlíř) –
  základní obydlí + 30 %, zaokrouhleno. Umisťuje se volně jako zemnice (bez pozemku); půdorys
  hrnčíře a kováře je o přístřešek (3,2 m) delší vpředu. **Milíř** se staví spolu se zemnicí
  uhlíře (jedna stavba, stejný průběh) a stojí 9 m stranou a 3 m vpřed od ní (souřadnice modelu,
  `MILIR` v `rules.ts`); místo pod ním (6 × 6 m) musí být louka, dost rovná a volná, překážky
  v kruhu o poloměru 4,6 m osadníci odstraní a zaplatí jako u obydlí.
- **Celá domácnost dílny pracuje v dílně** – i starší děti a starší pomáhají jako na poli; po
  denním minimu (meze podle nádob) a domácí výrobě (i palivo dál od lesa) dostane řemeslo
  všechno, nikdy pole ani společnou práci. **Opravy dílny platí ves** (jako u ostatních obydlí –
  opravy jdou před domácí výrobou). Do sil vsi pro plán osevu se domácnosti dílen nepočítají.
- **Výroba den po dni** (na kouscích nezávisí): uhlíř a hrnčíř vyberou nejbližší stojící dospělý
  strom, který nepatří jiné stavbě ani dílně a není posvátný (vyhradí ho), skácí ho (2 čd + 1 %
  za 10 m nad 100 m – uhlíř od milíře, hrnčíř od dílny, zůstane pařez) a teprve pak z něj vyrábějí
  (120 kg uhlí po 10 kg za čd; 500 kg keramiky po 1 čd za kg). Kovář kuje z uhlí ze zásob
  (dílny pracují v pořadí uhlíř → hrnčíř → kovář, dnešní uhlí jde hned do výhně). Přirážka za rudu
  a hlínu se měří od políčka dílny k nejbližšímu políčku vody. Uhlí neubývá.
- **Opotřebení jen toho, co ves používá**: denně 30 % / 365 nástrojů a 40 % / 365 nádob z toho, co
  je v užívání (nejvýš potřeba) – ves, která potřebu drží pokrytou, ročně nahradí právě 30 % a 40 %
  (40 pracujících ≈ 36 kg nástrojů); přebytek v zásobě leží.
- **Pokrytí se počítá na začátku dne ze včerejších zásob** a platí pro všechny meze dne. Práce
  plánu osevu (polní práce, vracení přílohu) se počítá podle pokrytí v den plánu (1. 9.) a u dílů
  přidaných do plánu v den přidání – na celý hospodářský rok. Založení pole podle pokrytí v den
  zahájení stavby (i cena v nabídce a u kurzoru).
- **Jablka v nádobách poměrně**: den zkažení = 1. 3. + pokrytí nádobami × 61 dní (zaokrouhleno),
  s plným pokrytím 1. 5.; pokrytí se bere den po dni, jablka shnijí, jakmile den zkažení podle
  dnešního pokrytí nastal.
- **Přestavba dílny** zachová řemeslo i typ obydlí (uhlíř se nepřestaví na polozemnici) a stojí
  jako nová dílna (+ 30 %).
- **Rozhraní:** v nabídce staveb hrnčíř [F], kovář [G], uhlíř [H]; v horní liště uhlí, nástroje
  a keramika v kg (jen ves s dílnou nebo zásobou), v popisku pokrytí potřeby. Panel výběru dílny:
  co dělá (vyrábí, kácí, čeká na uhlí, čeká na dřevo, nemá kdo, prázdná), práce za den, zásoba
  výrobku a pokrytí. Upozornění „Kovář nemá uhlí“ a „Dílna nemá co kácet“. Ve scéně model dílny
  po fázích stavby, dým z pece, výhně a milíře, když dílna vyrábí, uhlíř kácí u svého stromu.

## Rozhodnutí

| Rozhodnutí                                                                                               | Kdo                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Uhlíř pálí uhlí pro kováře; kovář dělá nástroje → produktivita práce celé vsi                            | Martin                                     |
| Hrnčíř zvyšuje produktivitu výroby potravin                                                              | Martin                                     |
| Dílna je obydlí, řemeslo provozuje domácnost, která v ní bydlí; prázdná nic nevyrábí                     | Martin                                     |
| Řemeslník nepracuje na poli – ves ho musí uživit z nadvýroby                                             | Martin                                     |
| Kovář si železo taví sám z bahenní rudy, žádný horník ani obchod                                         | Martin                                     |
| Vzhled budov (hrnčíř, kovář, uhlíř s milířem)                                                            | Martin                                     |
| Řemeslník na plný úvazek; přebytek do zásoby, bez vstupu stojí (místo výroby na 2 roky)                  | Martin (17. 10. 2026)                      |
| Účinky jako meze produktivity – bez řemesel nejhorší mez, s plným pokrytím nejlepší (místo +30 / −15 %)  | Martin (17. 10. 2026)                      |
| 1 kg nástrojů = 10 čd a 50 kg uhlí; keramika 1 strom na 500 kg; strom = velký strom                      | Martin – oprava podle rešerše 17. 10. 2026 |
| Hrnčíř: ztráty zásob 10 → 5 %, denní minimum 0,5 → 0,45                                                  | Martin – oprava podle rešerše 17. 10. 2026 |
| Cena dílny +30 %                                                                                         | návrh Clauda                               |
| Výkony 10 kg uhlí/čd, 120 kg uhlí ze stromu, 1 čd na 1 kg keramiky                                       | návrh Clauda                               |
| Potřeby: 3 kg nástrojů na pracujícího (−30 %/rok), 5 kg nádob na člověka (−40 %/rok)                     | návrh Clauda                               |
| Doba (keramika v ruce do 10. st.) se neřeší – letopočet začátku se může posunout                         | Martin (17. 10. 2026)                      |
| Implementační rozhodnutí (milíř, celá domácnost v dílně, opotřebení, jablka poměrně…) – viz Implementace | kontrolér (18. 10. 2026)                   |
