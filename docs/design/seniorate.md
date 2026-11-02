# Seniorát a rodové panství (#9, fáze 4)

Stav: **schváleno odpověďmi Martina 2. 11. 2026 – zbývá potvrdit celek** (odpovědi citované
v oddílu [Odpovědi Martina 2. 11. 2026](#odpovědi-martina-2-11-2026)). Implementace zatím není.
Navazuje na
[vojvodovu rodinu](lord.md) – Rod vojvody (fáze 1: rod po meči, nástupnictví), Dělení vsi
(fáze 2: odchod mladšího syna s poměrnou částí vsi) – a na [správce vsi](steward.md) (fáze 3: NPC
autopilot). Pozvaného hráče popisuje [vazalství](vassalage.md). Historické opory:
[rešerše](research/2026-11-02-vassalage-seniorate.md). Co níž není výslovně Martinovo, je návrh
Clauda.

## Zadání (Martin – issue #9, 24. 10. 2026)

- „**Pokud hráč přivede jiného hráče, tak po smrti vojvody přebírá vesnici nejstarší syn,
  nastěhuje se zpátky do vojvodského dvorce a hráč pokračuje ve hře za něj**“
- „**Pokud hráč jiného hráče nepřivede, rozhoduje po smrti současného vojvody náhoda – hráč se
  může ocitnout v kůži některého z mladších synů. V takovém případě bude mít k dispozici poměrnou
  část vesnice, kterou buď může spravovat, nebo vzít své lidi a odejít vybudovat novou vesnici
  jinam. Zbytek původní vesnice bude spravovat NPC. Panství rodu se tak postupně může rozrůst na
  více vesnic.**“
- „**Poté, co se panství rozroste na více vesnic, následuje seniorát – vládu nad celým rodovým
  panstvím má nejstarší člen rodu.**“
- „**Pokud se nejstarším členem rodu stane hráč, může ovládat všechny rodové vesnice. Funguje to
  tak, že hráč má svou jednu vesnici, které věnuje největší péči (ale může ji také svěřit do rukou
  správce, což bude NPC) a ostatní vesnice jsou i nadále spravovány ostatními NPC členy rodu.
  Hráč však vždycky bude moci nad každou rodovou vesnicí udělat rozhodnutí, že má něco postavit,
  vylepšit nebo může vesnici úplně vystěhovat a založit jinde.**“

Martin 24. 10. 2026 k nástupnictví a náhodě: „S tímhle počkáme, dokud nebude fungovat NPC
mechanika.“ – správce (fáze 3) už funguje. Martin 30. 10. 2026: „Tohle už jsme přece jednou
řešili – odchází poměrná část vsi. Řešili jsme také, jak je to s nástupnictvím.“

## Co už je rozhodnuto a tady se nemění

- **Nástupce ve vsi** je nejstarší žijící syn hlavní manželky, bez něj syn vedlejší manželky,
  vnuk po meči, muž rodu ve vsi; vrátí se do dvorce (lord.md – Rod vojvody, Nástupnictví; Martin 24. 10. 2026). Zeť ani muž mimo rod vojvodou není.
- **Poměrná část vsi** = 1 ÷ dílníků; po smrti vojvody se počítají jen synové od 16 let; lidé
  z obydlí nejblíž domu syna, po celých domácnostech (lord.md – Poměrná část vsi; Martin 30. 10. 2026). Díl, jídlo, osivo, stáda, vůz a kůň jako při odchodu syna (fáze 2).
- **Jedna ves, jedna mapa** – syn odchází jen na novou mapu (Martin 1. 11. 2026).
- **Konec hry** smrtí posledního muže rodu v kterékoli vsi (Martin 24. 10. 2026).
- **Správce** staví stejnými pravidly jako hráč, ves syna ho má zapnutý, hráč vždy smí stavět
  i sám (Martin 30. 10. 2026).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč hraje za **jednoho muže rodu** – vojvodu své vsi; po jeho smrti pokračuje za
  nástupce, nebo losem za mladšího syna (Martin – zadání).
- **Cíl:** **seniorát** – nejstarší muž rodu vládne celému rodovému panství; je-li to hráčův muž,
  hráč rozhoduje ve všech vsích rodu (Martin – zadání).
- **Cíl:** pozvat hráče se vyplatí – za každého pozvaného hráče jedno nástupnictví, ve kterém
  hráč o svou ves losem nepřijde (Martin – zadání a 2. 11. 2026; vize: „Pozvat hráče se
  vyplácí“).
- **Cíl:** ves bez muže rodu dostane vojvodu z jiné vsi rodu (lord.md – Nová ves: „Nástupce
  z jiné vsi hráče řeší fáze 4“).
- **Ne-cíl (první verze):** spory o seniorát, úděly s vlastními pravidly, NPC senior, který sám
  rozkazuje vsím rodu, přestěhování hráčova muže do jiné vsi na přání hráče, sňatky mezi rody.
- **Anti-cíl:** seniorát, který stěhuje lidi – senior vládne z vlastní vsi, nikdo se kvůli němu
  nestěhuje (návrh Clauda).
- **Anti-cíl:** hráč, který po losu ztratí všechno – vždy hraje za muže rodu, který je vojvodou
  nějaké vsi.

## Hráčův muž a vlastní ves (návrh Clauda)

- **Hráčův muž** = muž rodu, za kterého hráč hraje. Je vždy vojvodou některé vsi rodu – to je
  **vlastní ves** hráče. Na začátku hry je to zakladatel.
- **Vlastní ves** je jediná ves, kde hráč smí přepínat správce (Martin – zadání: „ale může ji také
  svěřit do rukou správce“), dávat jména synům a posílat syny pryč. První vlastní ves má správce
  vypnutý (steward.md beze změny).
- **Ostatní vsi rodu** vedou NPC vojvodové rodu – **správce je v nich vždy zapnutý** (Martin –
  zadání: „ostatní vesnice jsou i nadále spravovány ostatními NPC členy rodu“). Jména synů v nich
  generuje správce (steward.md – Jména synů).
- **Rodové panství** = všechny vsi rodu hráče (vsi, kde žije vojvoda rodu, i vsi bez vojvody,
  dokud v nich žijí lidé).

## Seniorát (Martin – zadání; podrobnosti návrh Clauda)

- **Senior rodu** = nejstarší žijící muž rodu (po meči – lord.md, Kdo patří k rodu) v kterékoli
  vsi rodu, i když není vojvodou (mladší syn v dvorci, ženatý syn, který čeká na dům). Při shodě
  dne narození nižší id. Chlapec je seniorem, jen když starší muž rodu není.
- **Senior je čistá funkce stavu vsí rodu** k danému dni – přepočítá se, kdykoli se rozhoduje
  (akce hráče, zobrazení), nikdo se kvůli němu nestěhuje a do simulace vsí nezasahuje.
- **Práva seniora** (Martin – zadání: „postavit, vylepšit nebo může vesnici úplně vystěhovat“):
  v **každé vsi rodu** smí
  - **stavět a vylepšovat** – všechny stavby jako ve vlastní vsi, stejné ceny a kontroly
    (`applyBuildIntent`); správce jeho stavby bere jako stavby hráče (steward.md – Soužití
    s hráčem);
  - **zrušit rozestavěnou stavbu správce** (veto jako ve vlastní vsi);
  - **vystěhovat celou ves** na novou mapu – odchod všech obydlí s vojvodou vsi (lord.md – Kdo
    může vést odchod, Celá ves s vojvodou); stará mapa zůstane opuštěná.
- **Co senior v cizí vsi rodu nesmí** (návrh Clauda): vypnout správce, pojmenovat syna, poslat
  syna pryč – to je věc NPC vojvody vsi a jeho správce.
- **Hráč, který není seniorem**, smí rozhodovat jen ve vlastní vsi; ostatní vsi rodu vidí (seznam
  vsí, scéna), ale stavět v nich nesmí (Martin 2. 11. 2026: „Jen se dívat“). NPC senior v první
  verzi nic navíc nedělá – vsi vedou jejich správci.
- **Kronika:** „Seniorem rodu je Bořivoj“ ve všech vsích rodu, kdykoli se senior změní.

## Nástupnictví hráče – po smrti hráčova muže (Martin – zadání; podrobnosti návrh Clauda)

Ves sama dědí jako dosud – nástupcem je nejstarší syn hlavní manželky (fáze 1). Nově se rozhoduje
jen to, **za koho hraje hráč dál**.

1. **Nástupnictví bez losu za pozvaného hráče** (Martin – zadání; 2. 11. 2026: „Jedno
   nástupnictví za pozvaného“): každý pozvaný hráč, který začal hrát, připíše hráči **jedno
   nástupnictví bez losu** ([vazalství](vassalage.md) – Pozvaný hráč). Má-li hráč nevyužité
   nástupnictví a los by jinak byl (bod 2), hráč pokračuje za **nástupce vsi** a jedno
   nástupnictví se **spotřebuje**. Vlastní ves zůstává, nic se nedělí. Podrobnosti (návrh
   Clauda):
   - spotřebuje se samo – hráč nevolí, zda ho použije; bez losu (jen nástupce, bod 5) se
     nespotřebuje;
   - nástupnictví se sčítají (tři pozvaní = tři nástupnictví) a nepropadají;
   - patří hráči, ne rodu – platí i pro nový rod, začne-li hráč znovu (přivedl hráče on);
   - nezáleží na tom, zda pozvaný dál hraje nebo zůstal vazalem – připsáno je jednou provždy.
2. **Bez nevyužitého nástupnictví rozhoduje los** (Martin – zadání: „rozhoduje náhoda“):
   - **Kdo je v losu:** nástupce a **mladší synové zemřelého od 16 let** ve vsi – ti, kdo by
     mohli vést odchod (lord.md – Kdo může vést odchod), jméno nemusí mít. Synové mladší 16 let
     v losu nejsou. Je-li v losu jen nástupce, los není.
   - **Šance:** **nástupce polovinu**, zbytek rovným dílem mezi mladší syny od 16 let
     (Martin 2. 11. 2026: „Nástupce polovinu“). S jedním mladším bratrem tedy ½ a ½, se dvěma
     ½, ¼ a ¼, se třemi ½ a po ⅙.
   - **Náhoda ze seedu vsi a dne smrti** (`deriveSeed(state.seed, 'player-lot:' + den)`) – výsledek
     nezávisí na tom, kdy se ves dopočítá.
3. **Padne-li nástupce**, hráč pokračuje za nástupce jako v bodě 1.
4. **Padne-li mladší syn** – hráč je v jeho kůži a **odchází s jeho poměrnou částí vsi na novou
   mapu** (Martin 2. 11. 2026: „Jen odchod na mapu“ – jedna ves, jedna mapa; díl „spravovat na
   místě“ ze zadání by byl druhou vsí na téže mapě):
   - Díl, lidé, jídlo, osivo, stáda, vůz a kůň **přesně jako odchod syna** (fáze 2,
     `sonShare` / `departWithSon`) – po smrti otce se počítají jen synové od 16 let (už
     rozhodnuto).
   - **Dělení po pohřbu:** hráč má **30 herních dní** (≈ 43 minut) na volbu směru v růžici
     (8 směrů jako dnes). Zvolí-li, výprava vyrazí hned a první zemnici umístí hráč sám. Nezvolí-li
     (není ve hře), vyrazí 30. den sama směrem, který by zvolil správce (steward.md – Kam), se
     zapnutým správcem na cestě – po příjezdu správce umístí první zemnici a hráč ho může vypnout.
   - Syn bez jména dostane jméno v panelu odchodu od hráče; jinak 30. den jméno generované
     (`generatedLineName`).
   - **Mateřská ves** dál žije s nástupcem jako NPC vojvodou a **zapnutým správcem** (Martin –
     zadání: „Zbytek původní vesnice bude spravovat NPC“).
   - Nová ves je **vlastní ves** hráče, správce v ní podle toho, jak výprava vyrazila (výš).
5. **Nemá-li zemřelý ve vsi nástupce z rodu** (ves zůstala bez muže rodu): hráč pokračuje za
   **seniora**, je-li vojvodou některé vsi, jinak za **nejstaršího vojvodu rodu**; jeho ves se
   stane vlastní vsí (správce zůstane, jak je – hráč ho smí vypnout). Ves bez muže rodu čeká na
   dosazení (níž).
6. **Žádný muž rodu nežije** – konec hry jako dnes (lord.md – Konec rodu).

- **Upozornění** „Bořivoj zemřel. Hraješ za Ctibora.“ (jako ostatní upozornění hry); kronika
  mateřské vsi „Ctibor odešel založit ves Lhota“ (fáze 2).
- **Proč los jen mezi syny** (návrh Clauda): zadání mluví o „mladších synech“; vnuci a bratři
  odchod nevedou (lord.md – Kdo může vést odchod).

## Ves bez muže rodu – dosazení vojvody (Martin 2. 11. 2026: „Poslat muže rodu“; podrobnosti návrh Clauda)

- Zemře-li vojvoda a ve vsi už žádný muž rodu není (lord.md – Nová ves: „Ves bez muže rodu žije dál
  bez vojvody … Nástupce z jiné vsi hráče řeší fáze 4“), **rod dosadí vojvodu z jiné vsi rodu**.
- **Kdo:** nejstarší muž rodu od 16 let v jiné vsi rodu, který **není vojvodou, nástupcem ani
  hráčovým mužem** (mladší syn, ženatý syn čekající na dům, vnuk). Při shodě nižší id. Bez kandidáta
  ves čeká, kandidát se hledá při každém dopočtu.
- **Kdo jde s ním:** jeho rodina – manželky a svobodné děti (jako rodina syna při odchodu – fáze 2),
  nic víc; jídlo, které unesou (25 kg na člověka od 7 let – migration.md).
- **Cesta:** jako výprava na sousední mapu – **2 herní dny na každou mapu vzdálenosti** (návrh
  Clauda; přechod mapy 1–3 dny – war.md, migration.md). Po příjezdu se nastěhuje do dvorce jako
  nástupce (lord.md – Nástupnictví, Kdo se stěhuje) a je vojvodou.
- Kandidáta nevybírá senior ani hráč – v první verzi ho určí pravidlo (výběr seniorem Později).
- **Kronika:** „Vojvodou je Bořivoj“ (ves, kam přišel); „Bořivoj odešel vládnout ve Lhotě“ (ves,
  odkud odešel).

## Co hráč vidí (UI jako 0 A.D.)

- **Seznam vsí v horní liště** (migration.md – Víc vsí jednoho hráče): u vlastní vsi **praporec**
  hráčova rodu, u vsi seniora **stolec**. Ikona správce jako dnes.
- **Ves, kde hráč nesmí rozhodovat:** stavební tlačítka zašedlá s důvodem u kurzoru
  „Rozhoduje Bořivoj.“ (jméno seniora). U seniora v cizí vsi rodu přepínač správce a jména synů
  zašedlé: „Ves vede Ctibor.“ (jméno vojvody vsi).
- **Panel rodu** – nová ikona **štítu rodu** v horní liště: řada portrétů mužů rodu od 16 let
  seřazená podle věku, první senior se stolcem, hráčův muž s praporcem. Popisek: jméno, věk, ves.
  Klik přepne pohled na jeho ves. Bez textu navíc. Má-li hráč nevyužitá nástupnictví bez losu,
  ukazuje je panel jako pečeť s počtem (popisek „Nástupnictví bez losu“).
- **Po losu na mladšího syna:** obrys dílu ve scéně mateřské vsi (jako výběr syna – fáze 2),
  růžice směrů a ikona přesýpacích hodin s počtem zbývajících dní; panel jména, nemá-li syn jméno.
- **Žádná vysvětlení** – kdo je senior, pozná hráč ze stolce a z panelu rodu.

## Převod rozehraných her (jednou a idempotentně)

- **Hráčův muž** = vojvoda první vsi hráče se správcem vypnutým; není-li taková, vojvoda nejstarší
  vsi s vojvodou. Ostatní vsi hráče dostanou zapnutého správce.
- Nástupnictví bez losu zatím nikdo nemá (pozvánky ještě nejsou) – po smrti hráčova muže
  rozhoduje los.

## Pro implementaci (poznámky, ne kód)

- **Hráčův muž** se ukládá u hráče (sídlo / účet), ne ve stavu vsi: `playerLord: { villageId,
personId }`. Seniorát a práva čistými funkcemi v doméně (`dynastySenior(states)`,
  `canActInVillage(player, villageId, states)`), které volají use-casy hráče před každou akcí.
- **Los a odchod po pohřbu** jsou událost světa mimo simulaci vsi: use-case
  `resolvePlayerSuccession` po dopočtu vlastní vsi (web i worker), idempotentně podle dne smrti.
  Výsledek losu je deterministický (seed vsi a dne smrti, nástupce váha ½); nevyužité
  nástupnictví se čte z DB (`succession_credit` – [vazalství](vassalage.md)) a spotřebuje se ve
  stejné transakci jako výsledek – idempotentně podle dne smrti, jednou na jednu smrt. Odchod
  jde přes `departWithSon` a odchozí schránku jako u správce (`settleStewardDepartures`) – v den
  volby hráče, nebo 30. den.
- **Dosazení vojvody** je use-case `appointLord` po dopočtu vsí rodu na dnešek: lidé odejdou
  z vsi kandidáta dnes a přijdou do cílové vsi v den příjezdu jako vnější událost (jako akce
  hráče) – výsledek každé vsi pak nezávisí na kouscích dopočtu.
- Čísla (30 dní, 16 let, 2 dny na mapu) do `rules*.ts` s odkazem sem.
- Testy: senior napříč vsemi, práva seniora a ne-seniora, los jen mezi syny od 16 let s váhou
  nástupce ½, stejný los při různých kouscích dopočtu, nástupnictví bez losu (spotřebuje se jen
  místo losu, jen jednou), odchod po pohřbu ve lhůtě i bez hráče, dosazení vojvody, převod.

## Později

- NPC senior, který sám rozhoduje ve vsích rodu (posílá syny, vystěhuje ves, pomáhá v hladu).
- Spory o seniorát a vzpoura mladších větví rodu (historicky časté – rešerše), úděly.
- Hráč smí převzít jinou ves rodu (přejít za jiného muže rodu).
- Sňatky mezi rody hráčů ([vazalství](vassalage.md) – Později).

## Odpovědi Martina 2. 11. 2026

1. **Co smí hráč ve vsích rodu, když není seniorem:** „**Jen se dívat**“ (doporučení) –
   rozhoduje jen ve vlastní vsi, ve všech ostatních až jako senior.
2. **Šance losu po smrti hráčova muže:** „**Nástupce polovinu**“ – nástupce ½, zbytek rovným
   dílem mezi mladší syny od 16 let (návrh byl „každý stejně“ – opraveno v Nástupnictví hráče).
3. **Mladší syn z losu:** „**Jen odchod na mapu**“ (doporučení) – díl na místě spravovat nejde.
4. **Ves, kde vymřou muži rodu:** „**Poslat muže rodu**“ (doporučení) – Ves bez muže rodu.
5. **Kdy hráč „přivedl hráče“:** „**Jedno nástupnictví za pozvaného**“ – každý pozvaný hráč,
   který začal hrát, dá jedno nástupnictví bez losu, pak se spotřebuje (návrh byl „má činného
   pozvaného vazala“ – opraveno v Nástupnictví hráče a ve [vazalství](vassalage.md) – Pozvaný
   hráč).

## Otevřené otázky

Nové otázky odpovědi neotevřely – **zbývá potvrdit celek**. Podrobnosti nástupnictví bez losu
(spotřebuje se samo jen místo losu, sčítá se, patří hráči i po novém začátku, „začal hrát“ = 3
různé dny ve hře) jsou návrh Clauda.
