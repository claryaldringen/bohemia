# Výrobní řetězy – celý postup práce je vidět

Stav k 20. 10. 2026 – **schváleno** (Martin: „Schváleno“). Každé řemeslo i zpracování úrody ukazuje celý
postup od suroviny po výrobek: kdo co nese, kde to zpracuje a kam výrobek putuje – jako
v Knights and Merchants nebo Stronghold. Kovář vytaví železnou houbu a překove ji na hřivny,
v liště surovin jsou místo nástrojů hřivny. Přibývá humno (staví hráč) a obilné jámy (kopou
vesničané sami).

## Proč

Martin (20. 10. 2026): „Měl by být vidět celý postup práce lidí. Vybavuješ si třeba hru
Stronghold nebo ještě lépe Knights&Merchants?“

„Vlastně všechna řemesla. Kovař si donese/doveze dřevěné uhlí a železnou rudu. Pak vytaví
železnou houbu v redukční peci za pomocí ručního měchadla, houbu překove v železnou
hřivnu/hřivny, ze kterých může vyrábět nástroje nebo mohou jít na obchod. To je také věc, která
by měla být v tabulce surovin místo nástrojů.“ – na návrh, že hřivny jsou zásoba a nástroje
vybavení domácností: „Je to tak jak říkáš. V liště jenom hřivny“.

„Mlácení na humně ano - musíme tedy humno přidat jako stavbu. Uskladnění zrna také - musíme
přidat obilné jámy jako stavbu“ – „Humno je podmínka - bez toho by nebyla vidět ta práce
rolníků, kdy napřed mlátí a pak lopatami prohazují zrno“ – „humno postaví hráč“.

„Hmm, máš pravdu. Obilné jámy by asi neměl řešit hráč, ale vesničané sami. Takže na příhodném
místě obilné jámy po sklizni vykopou, naplní obilím a utěsní/zamaskují. Hráč to jen uvidí, ale
nebude na to mít vliv, podobně, jako když uhlíř staví milíř. Po zbytek roku budou jámy průběžně
otvírat a zrno z nich spotřebovávat. Označit půjde jen otevřená jáma - zavřená nebude vidět -
a v označení se ukáže kolik v ní je zrní. Jámy lze používat opakovaně.“

## Cíle, ne-cíle, anti-cíle

**Cíle**

- U každého řemesla a u zpracování obilí je vidět každý krok: surovina se donese nebo doveze, na
  místě se zpracuje (pec, měch, výheň, kruh, humno…), meziprodukt leží na hromádce a výrobek se
  odnese tam, kam patří.
- Zásoby, které hráč vidí v liště, odpovídají věcem, které ve scéně leží (hřivny u kovárny, zrno
  v jamách).
- Hráč rozhoduje o stavbách (humno), vesničané o běžné práci (jámy, nošení) – jako u milíře.

**Ne-cíle (teď)**

- Mletí na žernovu a pečení – zůstávají neviditelnou prací domácnosti (návrh Clauda – Martin je
  u mlácení a uskladnění nezmínil).
- Nové suroviny mimo řetězy z citátů (trade.md – Jen společné suroviny).
- Ruční řízení nosičů hráčem (jako v Knights and Merchants) – ves nosí sama.

**Anti-cíle**

- Ves zahyne hladem jen proto, že hráč nevěděl o humnu – vždy jasné upozornění.
- Scéna zpomalí: víc postav a rekvizit nesmí vrátit sekání (výkon je hlídaný).
- Zásoba v liště nesedí s tím, co je vidět.

## Kovář – od rudy po hřivny a nástroje

Dnes kovář vyrábí rovnou nástroje (10 čd a 50 kg uhlí na kg nástrojů, ruda 8 kg – crafts.md,
Uhlí a ruda kováře). Nově (podle Martina, čísla návrh Clauda – upřesní rešerše):

1. **Suroviny:** uhlí od milíře a ruda z rudiště – nošení a vozy jako dnes (smith-supply.ts).
   Leží u kovárny na hromádkách (uhlí v koších, ruda na hromadě).
2. **Tavba v redukční peci:** pec (nízká šachtová pec z hlíny) u kovárny, ruční měch
   (měchař – člen domácnosti nebo syn). Vsázka uhlí a rudy, tavba trvá den, výsledek **železná
   houba** (struskovitý kus železa). Vidět: kouř a žár z pece, měchař, struska u pece.
3. **Překování houby na hřivny:** ve výhni pod přístřeškem – houba se rozžhaví a vyklepe (struska
   ven), z ní **železné hřivny** (tyčinky typického tvaru). Hřivny se skládají na hromádku
   u kovárny.
4. **Nástroje z hřiven:** kovář kove nástroje, když je ves potřebuje (obnova opotřebení
   vybavení domácností, kování vozů – wagons.md), a odnese je do domácností.
5. **Obchod:** na obchod jdou hřivny (TradeGood `tools` se mění na `ironBars` – „Hřivny“). Ves
   bez kováře si nástroje (vybavení) kupuje u sousedů sama jako dnes (nákup u sousedů); v panelu
   obchodu jsou jen hřivny (návrh Clauda).
6. **Kolik hřiven** (návrh Clauda): kovář taví podle potřeby vsi a drží zásobu hřiven na rok
   obnovy vybavení – z ní se prodává; přebytky navíc netaví (Martin 18. 10. 2026 – přebytky
   prodá až finanční systém).
7. **Měch** (návrh Clauda): u tavby je druhý člověk – dospělý z domácnosti nebo syn od 10 let
   (ten den nepase); kovář sám taví polovičním tempem.

**Rozdělení dnešní ceny** (návrh Clauda, celkem zhruba jako dnes na kg nástrojů, upřesní
rešerše): tavba 60 % práce a 80 % uhlí, překování 25 % práce a 15 % uhlí, kování nástroje 15 %
práce a 5 % uhlí. Na kg nástrojů ≈ 1,2 kg hřiven (odpad).

## Nástroje jako vybavení domácností

- **Hřivny** jsou zásoba vsi – v liště místo nástrojů (Martin: „V liště jenom hřivny“).
- **Nástroje** nejsou zásoba: každá domácnost má vybavení (kg nástrojů na dospělého jako dnes
  potřeba `craftNeeds`), které se opotřebuje. Pokrytí `craftCoverage.tools` = podíl vybavení
  domácností – meze produktivity platí jako dnes (bez řemesel `worst`, plné vybavení `best`).
- Kovář z hřiven doplňuje vybavení podle potřeby; když hřivny chybí, taví. Bez kováře: nákup
  nástrojů u sousedů jako dnes (craft-buying.ts – kupuje se vybavení), nebo hřiven.
- **Starší vsi:** dnešní zásoba nástrojů se převede na vybavení domácností (rozdělí se), přebytek
  nad potřebu na hřivny (kg → kg / 1,2).

## Hrnčíř (návrh Clauda)

1. **Hlína** z hliniště (dnes).
2. **Příprava:** šlapání a hnětení hlíny v jámě u dílny (vidět: hromada hlíny, člověk šlape).
3. **Točení** na kruhu pod přístřeškem (dnes model má kruh).
4. **Sušení** – nádoby na lavici nebo prkně u dílny několik dní.
5. **Vypalování** v peci na dřevo (dřevo z lesa – dnes) – kouř.
6. **Keramika** zůstává zásobou v liště (nádoby ve vsi); hrnčíř odnáší nádoby do domácností
   (doplnění zásob na ztráty – dnes `potteryKg`).

## Tesař (návrh Clauda)

Klády z hromady → otesávání trámů na kozlíku (dnes) → kola a díly vozu, dřevěné nářadí →
vůz stojí u dílny, nářadí se odnese do domácností. Kování vozu z hřiven (wagons.md – Kování vozů).

## Uhlíř

Beze změny (milíř u buků – crafts.md); nošení uhlí ke kováři je dnes vidět.

## Obilí – humno a obilné jámy

### Humno (staví hráč)

- **Stavba** v mřížce staveb (návrh Clauda: udusaná a vymazaná mlatová plocha ≈ 8 × 10 m
  s přístřeškem a stohem slámy vedle; cena jako polozemnice bez jámy – upřesní rešerše).
- **Podmínka:** bez humna se nemlátí. Snopy po žni čekají ve stozích na poli (panáky → stohy)
  a kazí se (návrh Clauda: 10 % za měsíc – klasy se neskladovaly); upozornění „Snopy čekají na
  humno“.
- **Postup:** snopy se nosí nebo vezou z pole na humno (dnes nosiči a vozy – jen cíl humno),
  mlátí se cepy, pak se zrno **prohazuje lopatami** proti větru (odvívání plev), sláma na stoh.
  Výmlat je dnes úloha `thresh` – práce se nemění, jen místo (humno) a vidět je celý postup.
- **Kapacita** (návrh Clauda): jedno humno stačí vsi do ≈ 60 ha osevu; víc polí → výmlat se
  natáhne (zimní úloha nestihne) → upozornění, druhé humno.
- **Nová ves** humno nemá – hráč ho postaví do první žně (upozornění s předstihem: „Před žněmi
  postav humno“).
- **Starší vsi (Vlkov) – rok odkladu** (Martin, 20. 10. 2026: „Rok odkladu“): rok od převodu
  mlátí nouzově na udusané zemi u domů (návrh Clauda: o 30 % víc práce výmlatu a 10 % zrna
  ztráta) a mají upozornění „Postav humno“. Po roce platí podmínka.
- **Výmlat hned po žni** (Martin, 20. 10. 2026: „Staří slované se snažili dělat výmlat hned.
  Klasy neskladovali.“): snopy jdou z pole rovnou na humno a mlátí se hned – ozim v srpnu, jař
  v září (dnes se mlátí v zimě – okno úlohy `thresh` se přesune hned za sklizeň, fields.md).
  Stohy snopů se nedělají; zrno jde rovnou do jam. Práce výmlatu je stejná, jen přijde v době
  podzimní orby a setí – ves ji musí stihnout (plán osevu s tím počítá).
- **Když humno nestačí** (návrh Clauda): mlátí se dál, dokud je co; nevymlácené snopy čekají
  u humna a kazí se (10 % za měsíc – nejsou na skladování) a přijde upozornění, že je potřeba
  druhé humno.
- **Luštěniny** se mlátí taky na humně (návrh Clauda); do jam jde jen obilí, luštěniny se
  skladují doma.

### Obilné jámy (kopou vesničané sami)

- **Po výmlatu** vesničané vykopou na vhodném místě (suché, vyvýšené, mimo pole a cesty, blízko
  humna nebo domů) jámy, naplní je zrnem, utěsní a zamaskují (návrh Clauda: jáma ≈ 1,5 t zrna,
  hruškovitý tvar, vymazaná – rešerše). Zavřená jáma **není vidět**.
- **Během roku** otvírají jednu jámu po druhé a zrno spotřebovávají (jídlo, osivo). Otevřená
  jáma je vidět a jde označit – panel ukáže, kolik v ní je zrna.
- **Stavba na zavřené jámě** (návrh Clauda): hráč ji nevidí, takže stavbu nezakazuje – vesničané
  zrno přendají do jiné jámy nebo domů bez ztráty a jáma zmizí.
- **Opakovaně:** prázdná jáma se znovu naplní příští sklizní; nové se kopou, jen když staré
  nestačí. Jámy časem chátrají (návrh Clauda: po 10 letech zasypat, vykopat novou).
- **Zásoby obilí v liště** = zrno v jamách + v otevřené jámě + na humně (nevymláceno ne).
- **Ztráty skladováním** (dnes `storageLossPerYear` podle keramiky): v utěsněné jámě nižší
  (návrh Clauda – rešerše), v otevřené jámě a doma jako dnes.
- Luštěniny a len zatím ne (jen obilí).

## Co je vidět – nošení

Každý přesun mezi různými místy je vidět (návrh Clauda): postava s nákladem (koš, nůše, sud,
snop) nebo vůz. Přesuny v jednom místě (z pece do výhně) jen na místě. Provoz na cestách
(villagers.md) dostane nové druhy: snopy na humno, zrno do jam, z jam do domů, hřivny a nástroje
do domácností, nádoby. Postavy jsou lidé vsi (výběr postavy – role a činnost).

## Výkon

Nové rekvizity (pec, měch, houba, hřivny, nádoby, humno, jámy) v instancích, postavy v rozpočtu
postav. Nejdelší snímek se nesmí zhoršit.

## Postup (návrh Clauda)

1. Humno a výmlat na humně (stavba, podmínka, upozornění, nošení snopů, scéna).
2. Obilné jámy (vesničané, zásoba v jamách, výběr otevřené jámy).
3. Kovář – tavba, houba, hřivny, nástroje jako vybavení, hřivny v liště a obchodu.
4. Hrnčíř a tesař – kroky ve scéně.
5. Nošení výrobků do domácností.

## Otevřené otázky

- Čísla tavby (výtěžek rudy → houba → hřivna), kapacita jámy, ztráty v jámě a cena humna –
  rešerše.

## Rozhodnutí

| Rozhodnutí                                                                                        | Kdo                                       |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Celý postup práce řemesel vidět (jako Knights and Merchants)                                      | Martin (20. 10. 2026)                     |
| Kovář: uhlí a ruda → redukční pec s ručním měchem → železná houba → hřivny → nástroje nebo obchod | Martin (20. 10. 2026)                     |
| V liště hřivny místo nástrojů; nástroje vybavení domácností                                       | Martin (20. 10. 2026)                     |
| Mlácení na humně, humno je podmínka, staví ho hráč                                                | Martin (20. 10. 2026)                     |
| Obilné jámy kopou vesničané sami, zavřená jáma není vidět, otevřenou jde označit, jámy opakovaně  | Martin (20. 10. 2026)                     |
| Mletí a pečení neviditelně v domácnosti                                                           | návrh Clauda                              |
| Starší vsi rok odkladu – nouzový výmlat na udusané zemi                                           | Martin (20. 10. 2026), čísla návrh Clauda |
| Výmlat hned po žni, klasy se neskladují (okno výmlatu hned za sklizní)                            | Martin (20. 10. 2026)                     |
| Snopy bez humna čekají a kazí se 10 % za měsíc, upozornění                                        | návrh Clauda                              |
| Humno nestačí – mlátí se dál, snopy se kazí, upozornění; luštěniny taky na humně                  | návrh Clauda                              |
| Stavba na zavřené jámě dovolená – zrno se přendá                                                  | návrh Clauda                              |
| Obchod s hřivnami, nástroje u sousedů jako dnes; zásoba hřiven na rok obnovy, bez přebytků        | návrh Clauda                              |
| Měchař u tavby – dospělý nebo syn od 10 let, sám kovář polovičním tempem                          | návrh Clauda                              |
| Rozdělení ceny kování na tavbu, překování a nástroje; 1,2 kg hřiven na kg nástrojů                | návrh Clauda                              |
| Kroky hrnčíře a tesaře, každý přesun mezi místy vidět                                             | návrh Clauda                              |
