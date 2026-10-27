# Les a dřevo

Stav: schváleno 17. 10. 2026 (Martin: „Takhle je to zatím ok“), čísla opravená podle
[rešerše](research/2026-10-17-remesla-drevo-sad.md) (Martin: „Ano, udělej opravy.“).
**Implementováno 18. 10. 2026:** hromada klád (`VillageState.woodLogs`),
dřevo obydlí, první zemnice i přestaveb s kácením nejbližších dospělých stromů jako částí práce
stavby, klády z mýcení (pole, hřbitov, staveniště), hnití klád, dřevo jako surovina předem
(zašedlé tlačítko), palivo podle vzdálenosti k lesu – `packages/game/src/domain/village/wood.ts`;
v rozhraní klády v horní liště, dřevo v ceně staveb a stromy ke skácení u stavby, ve scéně hromada
klád a pařezy. Staví na vrstvě překážek (stromy jako herní data, kácení s pařezem a obnovou
v `obstacles.ts`). **Pole v lese (18. 10. 2026):** pole jde zakládat i v lese a v křovinách
([fields.md](fields.md)) – mýcení dá klády za dospělé stromy dílů; scéna a minimapa vykácený
a vymýcený les přestanou kreslit jako les (`apps/web/lib/scene/cleared-forest.ts`). **Stavby
v lese (19. 10. 2026):** obydlí i ostatní stavby jdou stavět do lesa, les pod nimi se vyklučí
(viz Mýcení a hromada klád – Stavba v lese). **Klučení lesa pro pole po fázích** (kácení, klády
u lesa, schnutí, pálení s ohni a kouřem) – návrh 26. 10. 2026, issue #10, viz Klučení lesa pro
pole – postup.

## Proč

Ves potřebuje dřevo na stavby (a později na řemesla) a les kolem ní je zároveň půda pro budoucí
pole. Dnes je dřevo schované v ceně staveb a stromy vykácené při mýcení přijdou nazmar. Tento
dokument dává dřevu a lesu skutečné místo: les kolem vsi se kácením viditelně mění, vzdálenost
k lesu stojí práci a mýcení pro pole dá klády na stavby.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** stavby spotřebují dřevo a les kolem vsi tím ustupuje – hráč to vidí v krajině.
- **Cíl:** mýcení lesa pro pole dá klády, které se pak spotřebují na stavby (Martin).
- **Cíl:** vzdálenost k lesu je znát – čím dál, tím dražší stavby a palivo.
- **Ne-cíl (teď):** řemesla (hrnčíři, uhlíři) – přijdou s vlastní mechanikou, ale počítá se
  s nimi (Martin); druhy dřeva jako surovina; obchod se dřevem; těžba jako samostatná činnost,
  kterou by hráč řídil.
- **Anti-cíl:** hráč, který musí vyznačovat, kde se kácí – vesničané si vyberou nejbližší vhodný
  les sami (Martin).
- **Anti-cíl:** zásoba dřeva jako číslo bez opory ve světě – klády leží viditelně složené
  stranou (Martin).

## Pravidla

### Palivo

- **Dřevo na topení sbírají vesničané sami** – klestí a odřezky, žádné kácení (Martin). Je to
  část domácí výroby, a ta jde od 19. 10. 2026 bokem – z práce vsi nebere ([fields.md](fields.md)
  – Práce; Martin: „Domácí výrobu z většiny obstarají ženy, takže to do práce stavby taky
  nemusíme počítat.“).
- **Přirážka za les daleko od vsi zmizela s ní** (návrh Clauda): dřív byla palivová část domácí
  výroby (třetina) o 1 % dražší za každých 10 m nad 100 m od obydlí k okraji lesa. Vzdálenost
  obydlí k okraji lesa se dál ukládá a měří **chůzí** (po pěšinách a pevných cestách, mokřina ×2,
  brod + 30 m – [roads.md](roads.md), Rychlejší chůze), práci vsi ale neubírá.

### Stavby a kácení

- **Strom = velký dospělý strom** (≈ 0,7–1,5 m³ dřeva) – jedna jednotka pro stavby, uhlí
  i keramiku ([řemesla](crafts.md); oprava podle rešerše – z velkého stromu je 120 kg uhlí).
- **Stavba spotřebuje dřevo** (Martin – oprava podle rešerše 17. 10. 2026): zemnice ≈ **7 stromů**
  (sloupy, vaznice, krokve), polozemnice ≈ **18 stromů** (hlavně kmeny srubu); řemeslné dílny
  podle základu + 30 % (hrnčíř a kovář ≈ 23, uhlíř ≈ 9); přestavba stejně jako nová stavba. Dřív
  12 / 35 tenkých kmenů: polozemnice potřebuje ≈ 10–13 m³ kmenoviny, tedy ≈ 12–18 velkých stromů
  (vlastní výpočet rešerše; Chudziak 1987).
- **Nejdřív z hromady klád** (Martin): stavba bere klády ze zásoby vsi. Kácí se, jen když klády
  nestačí. Hromada se počítá v celých kládách: zásoba hnije po troškách a na kusy se
  zaokrouhluje (nahnilá kláda se počítá, dokud z ní zbývá aspoň polovina) – tolik klád hráč vidí
  a tolik jich stavba může vzít (návrh Clauda).
- **Kácení** (Martin: vesničané sami, nejbližší vhodný les): pokácí se nejbližší **dospělé**
  stromy ke staveništi – ne mladé stromky, souše ani padlé kmeny (návrh Clauda). Skácení
  a dovoz stojí **2 člověkodny za strom** a zdraží se o 1 % za každých 10 m nad 100 m od
  staveniště (Martin – oprava podle rešerše; sedí – FAO 1987, sekera a ruční doprava). Vzdálenost
  ke stromu se měří chůzí po pevných cestách s mokřinou a brody ([roads.md](roads.md) – návrh
  Clauda; pěšiny dne ne, ať cena u kurzoru sedí se serverem). Je to
  součást stavby – dostává společnou práci vsi jako ostatní stavby ([populace](population.md)).
  U blízkého lesa vychází cena staveb jako dřív: cena obydlí (60 / 220 čd) v sobě kácení
  blízkého lesa má, samotná stavba je o 7 × 2 / 18 × 2 čd levnější; klády z hromady ji zlevní,
  daleký les prodraží.
- **Kdy se kácí** (návrh Clauda): stromy ke kácení se vyberou při zahájení stavby (vyhradí se –
  jiná stavba je nevezme) a kácí se jako první část práce stavby, strom po stromu; po každém
  zůstane pařez. Staveniště ve scéně ukazuje samotnou stavbu, panel stavby kolik stromů zbývá
  skácet. **Vyhrazený strom patří své stavbě** (revize implementace 18. 10. 2026): pole,
  hřbitov ani staveniště jiného obydlí za něj kládu nedají, a když ho staveniště jiného obydlí
  odstraní, stavba ho počítá jako pokácený (bez klády z hromady). Naopak stromy na zakládaných
  dílech polí a čtvercích hřbitova ve stavbě patří té stavbě – obydlí je pro své dřevo nevyhradí.
- **Opuštěná přestavba** (obydlí zůstalo prázdné) vrátí klády, které vzala z hromady; vyhrazené
  stromy se uvolní (revize implementace 18. 10. 2026).
- **Když není z čeho kácet, stavba se nedá zahájit** (Martin, 17. 10. 2026: „Dřevo ať taky
  blokuje, dokud není z čeho kácet“): klády na hromadě + dospělé stromy v krajině sídla nestačí
  na stavbu → tlačítko stavby je zašedlé a tooltip ukáže chybějící dřevo červeně (odemykání jen
  surovinami, jako v 0 A.D.). Počítají se všechny dospělé stromy sídla bez ohledu na vzdálenost –
  daleký les stavbu jen prodraží (návrh Clauda). Rozestavěná stavba se nezastaví: dřevo se jí
  vyhradí při zahájení (návrh Clauda). Přestavbu, o které rozhodnou obyvatelé sami, ani první
  zemnici při založení vsi nedostatek dřeva nezastaví – vezmou, co je (návrh Clauda).
- **Les ustupuje:** pokácené stromy z krajiny sídla zmizí natrvalo, zůstane po nich **pařez**
  (návrh Clauda). Z náletu je pokácený strom zhruba **za 30 let** mladý stromek a **za 70 let**
  zase dospělý strom, který jde kácet (Martin, oprava podle rešerše; dřív dospělý za 30 let:
  pařeziny se těžily ve věku 7–40 let – Kadavý a Kneifl 2016, kmen na srub nebo do milíře roste
  podle odhadu rešerše 60–100 let) – okraj lesa u vsi tak řídne a ustupuje, ale nezmizí navždy.
- Řemesla spotřebují dřevo stejnou cestou (Martin): hrnčíř kácí na palivo pece, uhlíř jen buky
  do milíře a na jejich pařezy **sází mladé buky** – sazenice je hned mladý stromek a za 60 let
  dospělý buk ([řemesla](crafts.md) – Uhlíř, 18. 10. 2026).

### Mýcení a hromada klád

- **Mýcení lesa pro pole dá klády** (Martin): každý dospělý strom na čtvercích zakládaného pole
  přidá do zásoby vsi jednu kládu (strom = jedna jednotka dřeva – návrh Clauda), až osadníci díl
  založí. Stejně dospělé stromy na čtvercích hřbitova (po ohrazení) a na vyklízené ploše obydlí
  (při zahájení stavby – ta je pak hned spotřebuje).
- **Stavba v lese** (Martin, 19. 10. 2026: „Oprav – obydlí může jít postavit i v lese – les se
  prostě vyklučí.“; podrobnosti návrh Clauda – [populace](population.md), Stavba v lese): obydlí,
  pozemek, dílny, modla, svatyně, ohrada, sad i hřbitov smí do lesa krajiny i lesa vsi. Les pod
  stavbou se vyklučí za **sazbu lesa jako díl pole** (250, s řemesly 150 člověkodní na hektar –
  stromy, pařezy a podrost v ní, kameny po kusech; klučení pařezů je v sazbě podle rešerše),
  kolem volně stojící stavby i pruh 4 m pod korunami okolních stromů. Dospělé stromy dají klády
  na hromadu – stavba je hned vezme, takže dům v lese si dřevo z velké části vykácí sám
  (zemnice v hustém lese ≈ 8 stromů z pasek, potřebuje 7). Posvátné duby a háje se nekácí,
  vyhrazené stromy jiné stavby klády nedají (jako u pole). Obyvatelé sami les nevyklučí.
  Palivo má dům v lese u dveří (vzdálenost k okraji lesa ≈ 0).
- **Hromada klád** leží viditelně složená stranou u vsi (Martin) – vesničané ji založí u obydlí
  nejblíž okraji lesa na volném místě vedle něj (návrh Clauda): hranice po 21 kládách, ve scéně
  nejvýš tři. Ubývá podle toho, jak se staví (Martin).
- **Klády hnijí:** ležící dřevo ztratí ≈ **4 % ročně** (Martin – oprava podle rešerše 17. 10.
  2026, dřív 10 %: ležící kmeny ztrácejí ≈ 2–5 % hmoty ročně – Petrillo a kol. 2016 a rozklad
  buku v rezervacích, FEM 2016), den po dni – hromadit je do zásoby se dlouhodobě nevyplácí.

### Klučení lesa pro pole – postup

Stav: **návrh 26. 10. 2026, čeká na Martinovo potvrzení** (issue #10 „Způsob klučení lesa“;
plán [2026-10-27-forest-clearing.md](../superpowers/plans/2026-10-27-forest-clearing.md)).
Martin, 24. 10. 2026:

> „Pokud se klučí les kvůli poli, bude se to dít takto:
>
> 1. vesničané dojdou k lesu, pokácí vzrostlé stromy a klády složí u lesa
> 2. Větve a pařezy vypálí - musí být vidět ohně a kouř
> 3. Pole je připravené a může se začít obdělávat“

Martin, 26. 10. 2026 v noci: „Pokračuj na tom, k čemu máš informace nebo si je dokážeš zjistit.“
Tři kroky jsou Martinovy, **podrobnosti níž jsou návrh Clauda**.

**Dnes** (implementace 18. 10. 2026, [fields.md](fields.md) – Založení pole): díl v lese se
zakládá jako každý díl – práce roste do ceny dílu (sazba lesa 250, s řemesly 150 člověkodní na
hektar, kameny po kusech) a v den, kdy je hotová, z čtverce **naráz** zmizí stromy, pařezy,
podrost i kameny, dospělé stromy dají klády na hromadu u vsi a začne běžet bonus popela (+40 /
+20 úrodnosti, první sezónu bez pletí – fields.md, Úroda). Ve scéně stojí les až do konce
založení, postavy kácí jen naoko a díl je rozrytý drn. Ohně, pálení ani klády u lesa nejsou.

**Rešerše žďáření (krátce):** v dlouhodobém pokusu ve Forchtenbergu se stromy kácely **v zimě**,
kmeny se z plochy odnesly a plocha se pálila **na jaře nebo následující podzim** suchými větvemi
a klestím – hořící válce z větví se pomalu táhly po zemi jako při historickém žďáření („Reutberg“)
ve středoevropských horách; selo se pak rovnou do popela, bez orby – půdu kypřily pařezy a kořeny,
které zůstaly (Rösch a kol. 2017, kap. 2.3 – https://doi.org/10.3390/land6010011). Na Polesí
trval žďár tři roky – kácení a vysušení, pálení, setba; pařezy se při žďáření neklučí, kmeny se
nechají doutnat ([rešerše 17. 10.](research/2026-10-17-zemedelstvi-populace.md), řádek Les).
Hra z toho bere pořadí **kácení → schnutí → pálení v suché části roku → setí do popela**, čas
zkracuje na herní tempo.

**Fáze dílu v lese** (díl = čtverec 15 × 15 m; návrh Clauda):

1. **Kácení** – vesničané pokácí na čtverci stojící stromy (dospělé, mladé stromky a souše) strom
   po stromu, po každém zůstane pařez. Kmeny dospělých stromů odnesou na **hromadu klád u lesa**
   (strom = kláda jako dosud, vyhrazené stromy jiné stavby kládu nedají). Padlé kmeny, keře,
   podrost a staré pařezy zůstanou do pálení. Kameny a balvany se v této fázi sesbírají (po kusech
   jako dosud).
2. **Schnutí** – větve a klest leží na pasece v hromadách a schnou **30 dní** od pádu posledního
   stromu čtverce. Práci nebere – ves mezitím dělá jiné stavby a kácí další čtverce.
3. **Pálení** – vesničané shrnou větve na pařezy a hromady zapálí. Pálí se jen **v březnu až
   říjnu** (v zimě je klest mokrý a pod sněhem); čtverec, který doschne v listopadu, počká do
   března. Ve scéně jsou vidět **ohně a kouř**. Po dohoření z čtverce zmizí pařezy, padlé kmeny,
   keře i podrost a zůstane **spálenina s popelem**; pařezy z ní ještě **2 dny doutnají** (kouř
   bez plamenů).
4. **Připraveno** – díl je připravený k osevu jako každý založený díl, ves ho oseje v nejbližším
   vhodném okně (Martin: „Pole je připravené a může se začít obdělávat“). Bonus popela běží **od
   dohoření** (dosud od založení). Do první práce na dílu (kopání, setí) je vidět spálenina.

**Práce:** sazba lesa zůstává (250 / s řemesly 150 čd na hektar), jen se rozdělí na fáze –
**kácení a odnos klád 60 %** (150 / 90 čd/ha, ≈ 3,4 / 2,0 čd na čtverec) a kameny po kusech,
**pálení 40 %** (100 / 60 čd/ha, ≈ 2,3 / 1,4 čd na čtverec). Samotné kácení 50letého lesa
kamennými sekerami vychází podle rešerše 17. 10. ≈ 146 dní na hektar – 58 % dnešní
sazby; klučení pařezů, které sazba dosud počítala, nahradí jejich vypálení (Martin: „Větve
a pařezy vypálí“). Celková práce se nemění, takže kalibrace drží; mění se jen čas – díl v lese je
připravený nejdřív 30 dní po skácení posledního stromu a jen v době pálení. Kdo zakládá v zimě,
pálí v březnu a seje jař; kdo kácí v létě, pálí v srpnu a seje ozim.

**Rozdělení práce:** stavba pole dostává společnou práci vsi jako dosud (rovným dílem
s ostatními stavbami). Uvnitř pole jde práce napřed do **pálení** suchých čtverců (od nejbližšího
k obydlí), zbytek do **kácení** (od nejbližšího k obydlí, přebytek dne teče do dalšího čtverce).
Pole, které jen schne nebo čeká na březen, práci nebere – dostanou ji ostatní stavby. Stromy
čtverce padají v pevném pořadí (od nejbližšího k obydlí, při shodě podle id) a každý má stejný
podíl práce kácení: strom padne, když práce kácení dojde k jeho podílu (jako kácení dřeva stavby).
**Determinismus:** fáze, pády stromů i dohoření jsou čistou funkcí odvedené práce a dne – stejné
při dopočtu po dnech i najednou. Ohně a kouř počítá scéna z fáze dílu a dne dohoření, bez náhody
v jádru.

**Klády u lesa:** pole má svou **hromadu klád u lesa** – vznikne s prvním skáceným dospělým
stromem u čtverce, na kterém se začalo (kraj lesa nejblíž vsi), a leží vedle něj na volném místě
mimo díly pole (hranice po 21 kládách, nejvýš tři; bez volného místa se nekreslí – jako hromada
u vsi). Klády u lesa patří do zásoby vsi (horní lišta, cena staveb, tlačítka staveb) a hnijí
stejně (4 % ročně). **Odvoz na stavby:** stavba bere klády nejdřív z hromad u lesa (od nejbližší
ke staveništi), pak z hromady u vsi – hromada u lesa ubývá, až zmizí. Odvoz je v ceně stavby jako
dosud u hromady u vsi (kácení 2 čd za strom v sobě má i dovoz). Klády z ostatního mýcení
(hřbitov, staveniště, milířiště, vracený příloh) jdou dál na hromadu u vsi. **Zrušené pole nebo
ubraný čtverec:** skácené stromy zůstanou pařezy a z náletu dorostou, klády zůstanou u lesa.

**Co hráč vidí:**

- **Scéna:** stromy padají po jednom a po každém zůstane pařez; postavy kácí a nosí kmeny
  k hromadě u lesa. Paseka s pařezy a hromadami větví (2–4 na čtverec) – les ustupuje (vymýcený
  les, jakmile ze čtverce zmizí aspoň polovina dospělých stromů, kreslí scéna už dnes). Při pálení
  hoří hromady větví (plameny, jiskry a záře jako u pohřební hranice), nad pasekou stoupá hustý
  kouř, který vítr odnáší, a postavy u ohňů rozhrnují hořící větve. Plameny jsou přes pracovní
  den, večer žhnou uhlíky, dohořelý čtverec je černá spálenina, ze které 2 dny kouří.
- **Panel dílu:** místo jednoho pruhu „Založení“ ikona fáze – klády (kácení: pruh a kolik stromů
  zbývá), přesýpací hodiny (schne: datum v popisku – „Větve schnou do 12. 4.“, „Pálí se od
  března“), oheň (pálení: pruh). Panel pole ukáže počet čtverců v každé fázi. Jen ikony s čísly,
  slova v popiscích.
- **Horní lišta:** klády celkem, popisek rozdělí „u vsi“ a „u lesa“.
- **U kurzoru** při zakládání pole v lese práce jako dosud a v popisku, že čtverec v lese bude
  připravený až po vyschnutí a vypálení.

**Starší vsi** (převod jednou a idempotentně, s vrstvou překážek): rozestavěný díl v lese bez
fází je dostane a odvedená práce se zachová. Stačí-li odvedená práce na kácení, stromy čtverce
padnou v den převodu (klády dospělých na hromadu u lesa) a větve se počítají jako suché – čtverec
se pálí, jakmile je doba pálení; jinak padne tolik stromů, kolik odpovídá odvedené práci. Bez
vrstvy překážek (testy jádra) se díl zakládá postaru naráz. Hotové díly se nemění.

**Ověření klučení** (úloha 8 plánu, 27. 10. 2026 – kopie Vlkova z 26. 10., jen čtená): pole
0,56 ha v lese 129 m od vsi (25 čtverců, 110 stromů, z toho 24 dospělých, cena 88 člověkodní)
založené 1. 11. 821. Kácení 2.–15. 11. (13 dní), na hromadě u lesa 24 klád (přes zimu shnije na
22,7 – stavby berou z hromady u vsi, té je ≈ 3 850), větve suché 15. 12., pálení od 1. 3. 822,
díly dohořívají 8.–14. 3., jař na spálenině osetá 11.–15. 3. (den 134 od založení). Práce na poli
93 člověkodní (založení 87,6, orba a setí 5,4), hlad žádný (nejnižší zásoby 5 163 kg). Výkon: rok
bez pole v lese beze změny (≈ 30 s); rok s novým polem v lese ≈ 38 s – jednorázově, každý den, kdy
dohoří nějaký díl, se přestaví mapa tras (≈ 1,2 s; `clearedObstacles` nemá den, takže klíč mapy
tras se s každým dohořením mění). Návrh Clauda na později: odstraněné překážky se dnem a řezem jako
pokácené stromy (mapa tras se s pálením nemění den po dni). Ve scéně (dev náhled, WebGPU i WebGL 2
bez chyb konzole): v hustém lese řadu čtverců zakryjí koruny stromů před ní – paseka a ohně jsou
dobře vidět až na větším poli nebo u okraje lesa; plameny hromad zvětšené na výšku člověka
(z výšky hry se ztrácely), spálenina o odstín světlejší s výraznějším popelem; postavy stojí vedle
ohně, ne v něm; kouř hustý a odnášený větrem.

**Paseka za korunami** (návrh Clauda, 27. 10. 2026 – Martin: „Zatím pracuj na kováři
a vizuálních drobnostech.“): kácí se už teď od kraje nejblíž vsi – čtverce od nejbližšího
k obydlí (`clearingWorkOrder`) a stromy čtverce také (`fellingOrder`), paseka tedy roste od
okraje lesa směrem od vsi. Zakrývají ji stromy **mimo pole** mezi kamerou a pasekou: v ukázce
(řada čtverců na kraji lesa) se herní kamera dívá od lesa ke vsi a 20–25 m vysoké koruny skryjí
pruh za sebou celý. Pořadí kácení podle kamery být nemůže (kamera je jen v prohlížeči, otáčí se
a jádro o ní neví), změna pořadí by tedy nepomohla – jádro zůstává beze změny. Řešení ve scéně:
**dým z pálení vystoupá vysoko nad koruny** (≈ 34 m místo 16 m, větší obláčky, déle žije), takže
pálení je z herní výšky vidět i zpoza lesa; samotnou paseku hráč uvidí otočením kamery (Q / E)
nebo až padnou stromy na straně ke kameře. Ohně zůstávají ve výšce člověka.

**Mimo tento návrh:** stavby v lese (obydlí, dílny – Stavba v lese) se klučí dál naráz; vracení
zarostlého přílohu (mladý les) beze změny; počasí – až přijde, pálí se jen za suchých dnů a déšť
schnutí prodlouží; oheň, který přeskočí do lesa; zvuk praskání ohně; postavy a vozy, které vozí
klády z hromady u lesa na staveniště.

**Otázka na Martina:** setí do popela bez kopání (Rösch a kol. 2017 – půda je po pálení kyprá)?
Návrh Clauda: zatím ne – kopání zůstává, jinak by se měnila kalibrace polí.

### Krajina sídla

- Kácení a pařezy jsou změny krajiny sídla nad vygenerovanou krajinou (jako u polí). Stromy proto
  musí být **herní data** – staví se na plánované vrstvě překážek ([fields.md](fields.md) –
  Krajina sídla a scéna), na které server ví, kde které stromy stojí a jak jsou staré.

## Co hráč vidí

- Ve scéně: ustupující okraj lesa s pařezy, nálet na starých pasekách, hromadu klád u vsi, která
  ubývá (bez volného místa vedle obydlí se nekreslí – nikdy do vody ani na pole). Na pasece se
  tráva pod vykácenými stromy neztmaví a plocha korun nad vymýceným lesem zapadne pod zem;
  na minimapě les s podílem vykácených stromů řídne do barvy paseky.
- V panelu staveb: zašedlé tlačítko, když není z čeho kácet (tooltip s chybějícím dřevem).
- V horní liště počet klád na hromadě; u rozestavěné stavby a přestavby, kolik stromů ještě zbývá
  skácet.
- **Klučení lesa pro pole** (návrh 26. 10. 2026): stromy padají po jednom, klády u lesa, paseka
  s hromadami větví, ohně a kouř při pálení, spálenina; v panelu dílu fáze ikonou – viz Klučení
  lesa pro pole – postup.
- **Zatím ne:** dovážené kmeny na staveništi podle kácení (staveniště má jen pevnou hromádku
  trámů) a vzdálenost k lesu v panelu stavby.

## Navazuje

- **Řemesla** (hrnčíř, uhlíř, kovář) – další spotřeba dřeva, pálení uhlí.
- **Druhy dřeva** (dub na sloupy, jedle a borovice na srub, líska na proutí).
- **Les jako zdroj** – pastva, sběr, lov.

## Rozhodnutí

| Rozhodnutí                                                                                               | Kdo                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Palivo (klestí, odřezky) sbírají vesničané sami, bez kácení                                              | Martin                                     |
| Stromy se kácí na stavby, později na řemesla                                                             | Martin                                     |
| Kde kácet, si vyberou vesničané sami – nejbližší vhodný les                                              | Martin                                     |
| Dřevo z mýcení jde na hromadu klád u vsi, ubývá se stavbami                                              | Martin                                     |
| Stavba bere nejdřív z hromady, kácí se jen při nedostatku                                                | Martin                                     |
| Když není z čeho kácet (klády + dospělé stromy nestačí), stavba je zašedlá                               | Martin                                     |
| Strom = velký strom; 7 / 18 stromů na zemnici / polozemnici, dílny + 30 %                                | Martin – oprava podle rešerše 17. 10. 2026 |
| Kácení a dovoz 2 čd na strom, nad 100 m od staveniště +1 % / 10 m                                        | Martin – oprava podle rešerše 17. 10. 2026 |
| Jen dospělé stromy, pařez po kácení; nálet: mladý strom ≈ 30 let, dospělý ≈ 70                           | Martin – oprava podle rešerše 17. 10. 2026 |
| Klády hnijí ≈ 4 % ročně                                                                                  | Martin – oprava podle rešerše 17. 10. 2026 |
| Strom z mýcení = 1 kláda; hromada u obydlí nejblíž lesu                                                  | návrh Clauda                               |
| Stromy se vyhradí při zahájení, kácí se jako první část práce stavby                                     | návrh Clauda                               |
| Přestavbu a první zemnici dřevo neblokuje – vezmou, co je                                                | návrh Clauda                               |
| Vyhrazený strom patří své stavbě; opuštěná přestavba vrátí klády z hromady                               | revize implementace 18. 10. 2026           |
| Palivo jako třetina domácí výroby, dražší se vzdáleností k lesu                                          | návrh Clauda                               |
| Stromy jako herní data (vrstva překážek) jsou předpoklad                                                 | návrh Clauda                               |
| Obydlí i ostatní stavby smí do lesa – les se vyklučí                                                     | Martin, 19. 10. 2026                       |
| Les pod stavbou za sazbu lesa jako pole, pruh 4 m pod korunami, stromy = klády                           | návrh Clauda                               |
| Palivo s domácí výrobou bokem, přirážka za les daleko zmizela                                            | Martin / Claude, 19. 10. 2026              |
| Les pro pole: kácení, klády složené u lesa, pálení větví a pařezů s ohni a kouřem, pak pole připravené   | Martin, 24. 10. 2026 (issue #10)           |
| Fáze čtverce kácení → schnutí 30 dní → pálení březen–říjen → připraveno, bonus popela od dohoření        | návrh Clauda, 26. 10. 2026                 |
| Sazba lesa beze změny, rozdělená 60 % kácení a odnos klád / 40 % pálení; klučení pařezů nahradí vypálení | návrh Clauda, 26. 10. 2026                 |
| Uvnitř pole napřed pálení suchých čtverců, pak kácení; schnoucí pole práci nebere                        | návrh Clauda, 26. 10. 2026                 |
| Hromada klád u lesa pro každé pole, patří do zásoby vsi; stavby berou nejdřív z hromad u lesa            | návrh Clauda, 26. 10. 2026                 |
| Rozestavěné díly v lese starších vsí dostanou fáze, odvedená práce se zachová                            | návrh Clauda, 26. 10. 2026                 |
