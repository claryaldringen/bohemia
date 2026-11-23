# Vstup nového hráče do světa (pozdní příchozí)

Stav: **schváleno** – Martin 7. 11. 2026: „ano“. Vznikl z rozhovoru s Martinem 7. 11. 2026; jeho
slova jsou citovaná s datem, vlastní doplnění je označené **návrh Clauda**. Řeší otevřenou otázku
10 ve [vizi](vision.md) (Pozdní příchozí). Navazuje na [vazalství a pozvánky](vassalage.md)
(pozvaný hráč, nezávislý hráč, místo na mapě světa, žádost o vazalství), [účty](accounts.md)
(registrace), [válku](war.md) (ochrana nováčka 7 dní) a [stěhování](migration.md) (vsi rodu
vedle mapy, ze které se odchází).

## Proč

Svět běží rok a po prvním dni spuštění je **každý nový hráč pozdní příchozí** – přichází mezi
rody, které už mají vsi, muže a vazaly. Nováček se má rychle zapojit do sítě rodů jako vazal,
nebo začít svobodný mezi hráči, se kterými se domluví.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** nováček bez pozvánky si sám vybere pána mezi malými rody, nebo začne svobodný.
- **Cíl:** hráči stejného jazyka žijí na mapě světa blízko sebe.
- **Ne-cíl:** překlad hry – jazyk je zatím jen příznak (Martin 7. 11. 2026: „Časem i přeložit,
  ale teď to necháme jen jako příznak“).
- **Anti-cíl:** nováček, který čeká na pána a mezitím nemůže hrát – staví a hraje hned.
- **Anti-cíl:** velké rody, které posbírají všechny nováčky – nabízejí se jen rody se dvěma
  vesnicemi.

## Tři cesty do světa

Martin 7. 11. 2026: „**Začíná vždy stavbou vesnice. Pokud byl pozván jiným hráčem, stává se
automaticky jeho vazalem. Na začátku si také může vybrat některý ze zavedených rodů, jejichž
vazalem se může stát. Případně začíná zcela svobodný.**“

1. **S pozvánkou** – beze změny proti [vazalství](vassalage.md) (Pozvaný hráč): vazal toho, kdo
   pozval, holá přísaha, mapa blízko pána, hned na mapě světa. Nabídka pánů se mu neukáže.
2. **Výběr pána z nabídky** – Nabídka pánů a Odříznutá krajina níž.
3. **Svobodný** – Svobodný nováček níž.

- **Začít znovu = nový rod** (návrh Clauda): projde stejnou cestou jako nováček bez pozvánky
  (odříznutá krajina, volba pána nebo svobodný); jméno vojvody se dál předvyplní.

Volba 2 nebo 3 padne při vstupu do hry, před stavbou vesnice (návrh Clauda – v úvodní obrazovce
vedle jména rodu). Hlídá to i server (návrh Clauda): odříznutý hráč založí ves až po odeslané
žádosti o pána nebo po volbě Svobodný. Pojistka (návrh Clauda): odříznutý rod, který týden
(`NEWCOMERS.waitDays`) od založení rodu žádnou žádost neposlal, začne svobodný – nikdo nezůstane
odříznutý navždy.

## Nabídka pánů

- **Kdo se nabízí:** Martin 7. 11. 2026: „Nováček si bude moci vybrat z rodů, které budou
  v hierarchii těsně nad ním.“ – „**Ty které už mají dvě vesnice.**“ Návrh Clauda: rod hráče
  (ne NPC rod – ten by potvrdil vždy hned), který má v okamžiku zobrazení nabídky **přesně dvě**
  živé vsi; vymřelý rod ani rod v odúmrti ne.
- **Nikdo nemá dvě vsi** (Martin 7. 11. 2026 – „1“): nabídnou se nejmenší rody nad nováčkem –
  rody se třemi vesnicemi, když ani ty nejsou, se čtyřmi atd. (vždy jen nejmenší počet vsí, který
  nějaký rod hráče má, aspoň 2). Když nemá aspoň dvě vsi nikdo (první dny po spuštění), nabídka je
  prázdná a nováček začne svobodný nebo s pozvánkou (návrh Clauda).
- **Pořadí:** Martin 7. 11. 2026: „ať jsou první ty z jeho jazykové skupiny“. Uvnitř skupiny
  pevné pořadí z čísla účtu nováčka (návrh Clauda) – každý nováček vidí rody jinak seřazené, ať se
  žádosti nesbíhají k těm samým.
- **Co nabídka ukáže** (návrh Clauda): jen to, co je o rodu veřejné v adresáři rodů
  ([docs/code/world.md](../code/world.md) – co je veřejné) – praporec, jméno rodu, jazyk; nic
  o stavu vsí.
- **Kolik vybrat:** 1 až 5 rodů (návrh Clauda – žádosti se nerozlejí po celém světě).
- **Žádost:** každému vybranému rodu odejde žádost o vazalství ([vazalství](vassalage.md) –
  Nabídka a žádost) s podmínkami jako u pozvaného – holá přísaha bez dávek a služby (návrh Clauda
  – nováček nemá z čeho odvádět; pán smí další podmínky navrhnout později jednáním). Pán žádost
  jen **přijme nebo odmítne**, protinávrh tu není (návrh Clauda).
- **Kdo vyhraje:** Martin 7. 11. 2026: „**Rod, který jako první žádost potvrdí, se stane pánem
  nově příchozího.**“ Ostatní žádosti tím zaniknou; pozdější potvrzení neplatí (server rozhodne
  jediný – první uložené přijetí).
- **Rod se mezitím změní** (návrh Clauda): získá třetí ves – žádost platí dál (nabízel se, když
  si ho nováček vybral); vymře – žádost zanikne.
- **Všichni odmítnou** (návrh Clauda): nováček dostane upozornění a smí vybrat znovu z nové
  nabídky, ale jen do konce téhož týdne (týden běží od první žádosti a nový výběr ho neprodlouží);
  prázdná nová nabídka → začne svobodný.
- **Rozmyslí si to** (návrh Clauda): nováček smí žádosti kdykoli stáhnout – tím začne svobodný
  (Svobodný nováček), nový výběr pána už ne.
- **Pán ho později vypoví** (návrh Clauda – platí pravidla [vazalství](vassalage.md), vypovědět
  smí kdokoli kdykoli, i pán přidělený losem): nováček zůstane na svém místě na mapě světa jako
  nezávislý.

## Odříznutá krajina

- Martin 7. 11. 2026: „**Nemůže se nováčkova mapa umístit na mapu světa až po výběru? Tj. že by
  nějakou dobu hrál jako když v odříznuté krajině**“ – nováček, který čeká na pána, **není na
  mapě světa**: staví a hraje ves jako dnes, ostatní hráči ho nevidí (není v adresáři rodů),
  nenapadnou ho a neobchodují s ním.
- **Krajina** se generuje z vlastního seedu nováčka, ne z políčka světa (návrh Clauda); uložené
  sídlo seed nese ([krajina](landscape.md) – uložený seed), takže umístění na mapu světa krajinu
  nezmění.
- **Vsi rodu** (odchod syna na novou mapu – [stěhování](migration.md)) vznikají i v odříznuté
  krajině vedle sebe ve vlastní malé mřížce; při umístění se celý shluk přesune na mapu světa
  a vzájemné polohy zůstanou (návrh Clauda).
- **Ves běží** jako každá jiná – worker ji dopočítává, i když hráč není online. Zemská
  stezka ([obchod](trade.md)) funguje jako dnes (smyšlení sousedé zanikli 23. 11. 2026 – markets.md, plán 1) (návrh Clauda –
  nejsou vázané na mapu světa). Ostatní hráči mu nemohou nic poslat ani nabídnout – v adresáři
  rodů není. Pozvánku vydat nesmí, dokud není na mapě světa – pozvaný by neměl
  kde začít (návrh Clauda).
- **Lov ano, výpravy ven ne:** každá ves v odříznuté krajině (sídlo i vsi synů) smí lovit jako
  každá jiná ([lov](hunting.md) – Lov odříznutého nováčka; Martin 23. 11. 2026: „nováček ať
  loví“). Během lovu ho odříznutý ovládá jako kdokoli jiný, z mapy vsi nikdo neodejde; bez lovu
  nemá výpravu, ke které by se lidé přidali, a ostatní výpravy nikam nedojdou („Tam nedojde.“) –
  mimo mapu vsi pro něj svět není.
- **Shluk se nevejde** (návrh Clauda): hledá se nejbližší místo, kam se vejde celý shluk se
  stejnými odstupy od cizích map (2 políčka u vazala, 3 u svobodného).
- **Jak dlouho:** Martin 7. 11. 2026: „**Týden normálního času. Pak se přiřadí náhodně
  k nějakému z těch rodů, co si vybral**“ – 7 skutečných dní od prvního výběru; bez potvrzení
  hra nováčka přiřadí losem (ze seedu účtu) k jednomu z vybraných rodů, které žádost neodmítly
  (návrh Clauda); rod ho dostane za vazala i bez potvrzení. Nezbude-li žádný, nováček začne
  svobodný.
- **Umístění po výběru pána:** jako pozvaný – volné políčko nejblíž mapě vlastní vsi pána, aspoň
  2 políčka od map ostatních hráčů ([vazalství](vassalage.md) – Místo na mapě světa).
- **Ochrana nováčka** (7 dní – [válka](war.md)) začne až umístěním na mapu světa (návrh Clauda –
  v odříznuté krajině ho nikdo napadnout nemůže). Dokud odříznutý je, nikdo na něj netáhne ani mu
  neohlásí průchod a on sám také ne – ani když je od založení rodu déle než týden.

## Svobodný nováček

- Martin 7. 11. 2026: „**Umístí se na mapu světa co nejdřív, ale někam k jeho jazykové
  skupině**“ – svobodný nováček odříznutou krajinu nemá, je na mapě světa hned.
- **Kam** (návrh Clauda): volné políčko aspoň 3 políčka od map ostatních hráčů (jako dnes) nejblíž
  mapě kterékoli vsi rodu stejné jazykové skupiny; když v ní ještě nikdo nehraje, jako dnes –
  nejblíž středu světa.

## Jazyková skupina

- Martin 7. 11. 2026: „**Volba při registraci**“ – „Začněme češtinou, angličtinou, němčinou,
  polštinou, italštinou, francouzštinou a španělštinou“: `cs`, `en`, `de`, `pl`, `it`, `fr`,
  `es`.
- Přihlášení přes Google: volba při prvním vstupu do hry (návrh Clauda). Dosavadní účty mají
  `cs`.
- Jazyk je **veřejný** u rodu (pořadí nabídky, umístění) – v adresáři rodů ikonou jazyka (návrh
  Clauda). Rod dostane jazyk účtu hráče při založení a nemění se ani po nástupnictví; zatím ho
  nejde změnit (návrh Clauda).
- Pozvaný si jazyk volí taky (registrace je stejná); na jeho umístění nemá vliv – patří k pánovi
  (návrh Clauda). Když kolem pána není volné políčko, hledá se dál stejným postupem jako dnes.
- Rozhraní zůstává česky (ne-cíl překlad).

## Rozhraní (UI jako 0 A.D.)

Návrh Clauda:

- **Úvodní obrazovka** (jméno rodu): dvě ikony – praporec s korunou „Vybrat pána“ a praporec
  „Svobodný“ (popisky v `Tooltip`). „Vybrat pána“ otevře nabídku: řádky rodů (praporec, jméno,
  ikona jazyka), zaškrtnutí nejvýš 5, tlačítko žádosti.
- **Čekání:** v panelu Rod a vazalové žádosti s odpočtem do konce týdne, „Stáhnout žádosti“
  a „Začít svobodný“ (stažení i jediné žádosti = svobodný – stáhnou se všechny, návrh Clauda); minimapa světa je prázdná s nápisem v popisku „Odříznutá krajina“.
- **Pán:** žádost v panelu Rod a vazalové jako dnešní žádost o vazalství, jen „Přijmout“
  a „Odmítnout“; upozornění „Nováček žádá o přijetí za vazala“.

## Pro implementaci (poznámky, ne kód)

- Svět dnes umísťuje hráče při prvním vstupu (`placeNewPlayer`, [docs/code/world.md](../code/world.md)).
  Nově smí mít sídlo a vsi rodu **polohu ve světě prázdnou** do umístění a soukromou malou
  mřížku pro vsi rodu; umístění je use-case, který spustí potvrzení pána, uplynutí týdne
  (worker – úlohy světa `runWorldTasks`) nebo volba „Svobodný“.
- Jazyk: `user.language` už existuje (výchozí `cs`) – rozšířit na sedm hodnot, pole
  v registraci, kopie do rodu (`house`) pro adresář.
- Žádosti: jednání druhu žádost o vazalství s příznakem „nováček“ (jen přijmout / odmítnout),
  první přijetí vyhraje – podmíněný zápis, souběh dvou pánů hlídá db test.
- Testy: první potvrzení vyhraje i při souběhu; po týdnu los z nevybraných / neodmítnutých
  deterministicky; odmítnutí všemi → nová nabídka; umístění shluku vsí rodu se zachováním
  poloh; svobodný k jazykové skupině; ochrana od umístění.

## Později

- Zneužití odříznuté krajiny víc účty – dnes jen týden a pak ochrana 7 dní jako u každého
  nováčka; limit účtů řeší [účty](accounts.md), až bude potřeba.

## Navazuje

- [Vazalství a pozvánky](vassalage.md) – pozvaný hráč, nezávislý hráč, místo na mapě světa.
- [Válka](war.md) – ochrana nováčka.
- [Stěhování](migration.md) – vsi rodu vedle mapy.
- [Vize](vision.md) – otevřená otázka 10.
