# Křesťanství

Stav: **implementováno 10. 11. 2026 (bez kostela – samostatné téma)**; schváleno 10. 11. 2026
(Martin: „Takhle je to ok“). Zadání je Martinovo (citace níž), podrobnosti jsou návrh Clauda.
Plán: [2026-11-10-christianity.md](../superpowers/plans/2026-11-10-christianity.md). Navazuje
na [štěstí a posvátná místa](happiness.md), [hřbitov](cemetery.md),
[vojvodovu rodinu](lord.md), [hradiště](hillfort.md), [příbuzenství a sňatky](kinship.md)
a [pole](fields.md) (trojpolí od roku 1100).

Martin, 10. 11. 2026:

- „Ať je objev křesťanství pravděpodobnější z každým dalším rokem. exponenciálně. v roce 500 bude
  nulový, v roce 600 velmi malý, ale v roce 900 už prakticky jistý. U vojvody se pak objeví
  tlačítko s možností nechat se pokřtít. Od té doby budou pokřtěné i jeho děti.“
- K odhadu, že se losuje pro každý rod zvlášť a objevené křesťanství už nezmizí: „Tvůj odhad je
  správný.“
- „Co tím rod získá: v první řadě ignorovat posvátná místa – teď půjde vykácet duby i dubové háje
  a na jejich místě stavět či orat. Stejně tak půjde ignorovat plný či nepoužívaný slovanský
  hřbitov a např. ho zaorat.“
- Vesničané: „Zůstanou pohany. Na křesťany se budou měnit velmi zvolna a hodně tomu napomůže
  kostel ve vsi.“ K návrhu Clauda (víra u každého, obrácení s kostelem rychlejší, kostel jen
  pokřtěný rod, hněv pohanů): „Ano. Ve výsledku se může stát, že na hradišti bude křesťanská elita
  a pohanský lid.“
- „Jo vidíš…od křtu bude jen jedna manželka. Ostatní manželky budou propuštěny a od té chvíle
  budou běžnými vesničankami.“ – „Synové, kteří se narodili před propuštěním, zůstanou členy rodu.“
- „Pohřbívat se bude u kostela. Pokud kostel není, pohřbívá se na starém slovanském hřbitově,
  ale kostrově.“
- „Když bude stát kostel, kněz tam příjde sám – církev na tohle má mechanismy.“
- „Křesťanství umožní stavby z kamene – v první řadě kostel. Také bude podmínkou k přechodu na
  trojpolní systém.“

## Proč

Svět začíná roku 500 u pohanských Slovanů a do roku 1500 projde christianizací. Křest pána
nezmění víru lidu přes noc – na hradišti může sedět pokřtěná elita nad pohanskou vsí. Pro hráče
je křest volba: uvolní mu půdu pod posvátnými místy a hřbitovem, otevře kamenné stavby a pozdější
trojpolí, ale stojí ho vedlejší manželky a nespokojenost pohanů, když jim sáhne na posvátná místa.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** křesťanství přichází s dobou – každý rod na něj narazí v jiný rok, do roku 900
  prakticky jistě (Martin).
- **Cíl:** o křtu rodu rozhoduje hráč tlačítkem u vojvody (Martin).
- **Cíl:** víra lidu se mění pomalu, hlavně díky kostelu (Martin).
- **Ne-cíl (teď):** kněz jako postava s vlastním rozhodováním, desátky, biskupství, svátky,
  křesťanská jména (první pokřtění Přemyslovci měli slovanská jména – návrh Clauda).
- **Ne-cíl (teď):** trojpolí samo – jen podmínka (viz [pole](fields.md) – Přílohová soustava do
  roku 1100).
- **Anti-cíl:** křest, který obrátí celou ves naráz.

## Objev křesťanství

- **Kdy:** jednou za herní rok (1. 1.) se pro každý rod, který křesťanství ještě nezná, losuje ze
  seedu světa a rodu, jestli na něj narazil (Martin – exponenciálně; los pro každý rod, návrh
  Clauda). Roční šance `p(rok) = a × (e^(k × (rok − 500)) − 1)`, `a = 0,0000518`, `k = 0,0185`
  (návrh Clauda – splňuje Martinovy body):

  | do roku                | 550   | 600 | 650   | 700   | 750    | 800    | 850    | 900    |
  | ---------------------- | ----- | --- | ----- | ----- | ------ | ------ | ------ | ------ |
  | rod už zná křesťanství | 0,2 % | 1 % | 3,4 % | 9,6 % | 23,9 % | 50,8 % | 83,7 % | 99,0 % |

- **Seed losu:** seed rodu = `deriveSeed(seed světa, 'house:' + id rodu)`, los roku Y z
  `'faith:' + Y` (návrh Clauda). Los roku Y padá 1. 1. Y rodům, které tehdy žijí – rod založený
  během roku losuje poprvé příští 1. 1. (návrh Clauda).
- **Jednou objevené nezmizí** (Martin) – ani po smrti vojvody; nástupce tlačítko zdědí.
- **Kronika rodu:** „Rod se dozvěděl o novém Bohu.“ (návrh Clauda); upozornění ve vsi vojvody.
- **Rody, které už žijí** (vývojový svět je kolem roku 870): při prvním načtení se los přehraje
  za všechny uplynulé roky naráz – stejný výsledek, jako by se losovalo rok po roku (návrh
  Clauda).

## Křest rodu

- **Tlačítko** „Nechat se pokřtít“ u vojvody (panel osoby, ikona kříže – rozhraní jako 0 A.D.,
  slova jen v popisku), jen když rod křesťanství zná a ještě pokřtěný není (Martin). Potvrzení
  dialogem – krok nejde vzít zpět (návrh Clauda).
- **Kdo je pokřtěný:** vojvoda a od té chvíle všechny jeho děti; děti pokřtěných jsou pokřtěné
  (Martin). Jeho dospělí synové a ostatní muži rodu, kteří už žijí, zůstávají, jak jsou – obrací
  se jako vesničané (níž; návrh Clauda).
- **Jediná manželka** (Martin): zůstane hlavní manželka; ostatní jsou propuštěny a od té chvíle
  běžné vesničanky (domácnost ve vsi, práce jako ostatní, mohou se znovu vdát). Synové narození
  před propuštěním zůstávají členy rodu (Martin), dcery také (návrh Clauda). Nové vedlejší
  manželky už nepřibudou. Elita hradiště ([hradiště](hillfort.md) – Elita) pak nerozlišuje
  manželky – rozdíl zmizí. Propuštěná s dětmi odchází z přeplněného dvorce jako vdova po
  vojvodovi (návrh Clauda).
- **Vsi rodu:** křest platí ve všech vsích rodu a ves založená rodem po křtu je pokřtěná (osadníci
  ho přinesou i z cesty). Ves, kterou za hráče řídí NPC rod, se řídí křtem toho NPC rodu; po jeho
  konci zase křtem rodu hráče (návrh Clauda). Ves, která přejde k jinému rodu (odúmrť, postoupení,
  věnování dílu odúmrti), se řídí křtem nového držitele – nepokřtěný rod ji vrátí mezi pohanské;
  zničená posvátná místa si lid pamatuje dál (návrh Clauda).
- **NPC rody** se po objevu pokřtí samy – náhodně do 1–20 let (návrh Clauda): k 1. 1. roku, který
  je 1–20 let po roce objevu, los `'npc-baptism'` ze seedu rodu (návrh Clauda). Objev ani křest
  NPC rodu se do kroniky nepíše – kroniku jeho vsi čte držitel a „Rod“ by v ní mátl (návrh
  Clauda).

## Co křest rodu umožní

- **Posvátná místa už nebrání** (Martin): pokřtěný rod smí kácet posvátné duby a dubové háje
  a na jejich místě stavět a orat; posvátná místa přestanou blokovat stavby, pole i mřížku.
- **Slovanský hřbitov** (Martin): plný nebo nepoužívaný hřbitov smí pokřtěný rod zaorat nebo
  zastavět (bourání jako u ostatních staveb – [bourání](demolition.md)).
- **Stavby z kamene** (Martin) – v první řadě **kostel**; další kamenné stavby přijdou s vlastními
  mechanikami.
- **Trojpolí** (Martin): podmínkou přechodu je pokřtěný rod (a rok 1100 – [pole](fields.md)).
- **Žádné nové modly a svatyně** (Martin 16. 11. 2026: „po křtu už nelze stavět pohanské svatyně
  ani modly“): pokřtěný rod je v nabídce staveb nemá a server novou modlu ani svatyni nezaloží.
  Stojící a rozestavěné zůstávají, jak jsou (návrh Clauda – nic víc se nemění).

## Víra vesničanů

- **Víra** je u každého člověka: pohan, nebo křesťan (návrh Clauda, Martin „Ano“). Dítě je
  křesťan, je-li křesťan aspoň jeden z rodičů (návrh Clauda).
- **Obrácení** (návrh Clauda, Martin „Ano“): každý rok (1. 1.) má každý dospělý pohan šanci
  se pokřtít – **0,5 % bez kostela, 3 % s kostelem ve vsi**, obojí × (1 + podíl křesťanů
  ve vsi). Ves s kostelem se obrátí zhruba za 2–3 generace, bez kostela prakticky vůbec.
  Obracet se začne jen ve vsích rodu, který je pokřtěný.
- **Štěstí** ([štěstí](happiness.md)) – Martin, 10. 11. 2026: „Vzpoury zatím nemáme definované.
  Ať se sníží štěstí. To se bude průměrovat. Křesťané s kostelem budou spokojenější, pohané bez
  posvátných míst budou nespokojení. Jak bude přibývat křesťanů, nespokojenost časem odejde.
  Takže pětiletý limit zruš.“
  - Cílové štěstí vsi je **průměr cílového štěstí pohanů a křesťanů vážený jejich počtem**
    (Martin); ostatní složky (hlad, úmrtí, zásoby, …) jsou pro obě skupiny stejné.
  - **Pohané:** posvátná místa přidávají jako dosud (nejvýš +40). **Zničená posvátná místa**
    (vykácený posvátný dub nebo háj, zaoraný či zastavěný slovanský hřbitov) jim ubírají
    **bez časové meze**, dokud jsou pohany – −15 za dub nebo háj, −20 za hřbitov, dohromady
    nejvýš −30 (čísla návrh Clauda, doladí se kalibrací se [štěstím](happiness.md)).
  - **Křesťané:** posvátná místa jim nepřidávají; kostel s knězem jim přidá štěstí
    podle pokrytí vsi (+40 × pokrytí, vyzdobený +5 navíc – [kostely](churches.md)).
  - Jak křesťanů přibývá, váha nespokojených pohanů klesá – nespokojenost odejde sama (Martin).
    Vzpoury nejsou (Martin – zatím nedefinované).

## Kostel

> **Samostatné téma** – Martin, 10. 11. 2026: „Podle mě jsou kostely velké téma, které bude potřeba
> probrat zvlášť. Navíc ještě předtím musíme vytvořit celou infrastrukturu pro stavbu kamenného
> zdiva.“ Body níž jsou jen dosavadní rozhodnutí a návrh Clauda – kostel, kněz, hřbitůvek
> a svatby u kostela jsou v samostatném návrhu [kostely](churches.md) (Co kostel dává – kapacita,
> pokrytí, štěstí +40 × pokrytí, obrácení 0,5 % + 2,5 % × pokrytí, kněz, hřbitůvek). Ves bez kostela
> se obrací jen 0,5 % ročně a křesťané se pohřbívají kostrově na starém hřbitově.

- **Staví jen pokřtěný rod** (návrh Clauda, Martin „Ano“) – první kamenná stavba (Martin).
  Rotunda jako na Levém Hradci (kolem roku 884) – rozměry, cena v kameni, dřevě a člověkodnech
  podle rešerše (dohledat).
- **Kněz přijde sám** (Martin): hned po dostavění kostela (Martin 11. 11. 2026 – [kostely](churches.md)) přijde do vsi kněz – bydlí u kostela,
  ves ho živí, nepracuje na poli; když zemře, přijde nový (návrh Clauda).
- **Pohřby** (Martin): pokřtění se pohřbívají u kostela (kostrové hroby, hřbitov u kostela);
  ve vsi bez kostela na starém slovanském hřbitově, ale kostrově ([hřbitov](cemetery.md) –
  Kostrové pohřby později).
- **Sňatky:** křesťané se oddávají v kostele (návrh Clauda; dnes u posvátného místa –
  [příbuzenství](kinship.md) – Místo obřadu).

## Rozhodnutí z implementace

Návrh Clauda při implementaci (plán – poznámky „Provedeno jinak“):

- **Los objevu:** seed rodu je `deriveSeed(seed světa, 'house:' + id)`, los roku Y z `'faith:' + Y`;
  rod založený během roku losuje poprvé příští 1. 1. Zápis „Rod se dozvěděl o novém Bohu.“ jde
  do kroniky obecnou událostí schránky (nový druh zápisu, ne nová událost); NPC rod nepíše nic.
- **Čas hráče:** rod hráče losuje objev do roku svého dne (den světa + posun času hráče, vývojový
  skok), NPC rod do roku dne světa; upozornění a zápis do kroniky nesou den hráče. V ostrém světě
  (posun 0) beze změny.
- **Kdo se křtí:** vojvoda rodu (`House.lord`) ve vsi, kde žije – tlačítko je u vojvody vsi
  a rozhoduje o něm právo rodu (jako povýšení vesničana, jen držitel). Ostatní vsi rodu dostanou
  jen den křtu. Křest rodu hráče dorazí i do vsí, které za něj řídí NPC rod – platí tam až po konci
  NPC rodu; NPC rod má vlastní den křtu.
- **Propuštěné manželky** zůstávají ve svých domech; z přeplněného dvorce odcházejí s dětmi jako
  vdovy po vojvodovi.
- **Ves na cestě** (osadníci nové vsi) si křest rodu vezme ze schránky – ves založená po křtu je
  pokřtěná.
- **Rozhraní navíc:** malý kříž „Křesťan“ v panelu osoby, podíl křesťanů a nespokojenost pohanů
  v popisku štěstí, tlačítko Zbourat u hřbitova jen u pokřtěného rodu (pohanský rod ho nemá – jako
  v 0 A.D. se příkaz, který nejde nikdy, neukazuje) a varování u kurzoru „Vykácí posvátný háj.“,
  „Vykácí posvátný dub.“, „Zaorá starý hřbitov.“ – stavba zůstává povolená.
- **Změna držitele vsi:** křest se přepočte podle nového rodu (Vsi rodu výš). Ves převzatá v den
  mezi křtem starého rodu a jeho zápisem do vsi (zpráva platí od zítřka) by si křest starého rodu
  ještě zapsala – okno jednoho dne se neřeší.
- **Křest platí ve vsi vojvody hned (D76):** Martin 15. 11. 2026: „Pokřtil jsem Lutobora. Vidím to
  někde? A proč nemohu pozvat cizí mistry?“ Zpráva ve schránce platí až od zítřka, takže kříž,
  propuštění manželek i pozvání huti se objevily po ≈ 86 s. Návrh Clauda: `baptizeLord` pokřtí ves
  vojvody hned (`baptizeVillage` pod zámkem vsi) a ostatní vsi rodu dál přes schránku; zpráva vsi
  vojvody pak nic nezdvojí (`baptizeVillage` je idempotentní podle `faith.rodBaptizedDay`).
- **Kronika se jménem (D77):** zápisy křtu a propuštění manželek nesou jméno a postavení vojvody
  jako zápisy o ženách (Martin 15. 11. 2026): „Vojvoda Lutobor se dal pokřtít.“, „Vojvoda Lutobor
  propustil vedlejší manželky (2).“; starší zápisy bez jména zůstávají postaru.

## Otevřené otázky

- Kostel z kamene – co když ves nemá kámen? (dřevěný kostelík jako levnější varianta?)
- Čísla nespokojenosti pohanů a štěstí z kostela – kalibrace se [štěstím](happiness.md).
- Jak se víra promítne do sňatků mezi rody hráčů (sňatky v další verzi – [vazalství](vassalage.md)).
