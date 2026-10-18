# Chátrání opuštěných staveb – ověření herních čísel proti literatuře

_Rešerše k 18. 10. 2026 pro pravidlo „stavby, kam nikdo nechodí, budou postupně chátrat
a rozpadnou se“ (Martin, 18. 10. 2026: „Ano, udělej to tak“). Ověřovaná čísla jsou návrh Clauda
ze zadání (modla ≈ 20 let, svatyně ≈ 30, plot hřbitova ≈ 15, ohrada bez zvířat ≈ 10, zbytek
modly ≈ 10, příkop svatyně ≈ 10–20); co se převzalo, zapisuje `docs/design/abandonment.md`
(tabulka Rozhodnutí)._

**Verdikty:** _sedí_ = literatura hodnotu podporuje nebo je v rozmezí; _upravit na …_ = literatura
ukazuje jinam; _nedohledáno_ = přímý údaj jsem nenašel. **Vlastní úvaha** je vždy označena.
U zdrojů, ze kterých jsem viděl jen výtah (abstrakt, popis ve vyhledávání), je to uvedeno.

## Co literatura říká

- **Dub v zemi – malé vzorky:** jádrové dřevo dubu má třídu trvanlivosti 2–4 (1 = velmi trvanlivé,
  5 = netrvanlivé) a v kontaktu se zemí vydrží **5–15 let** (latě 20 × 50 × 500 mm, zkoušky RISE);
  borovice 5–10, smrk a bříza pod 5 let. – Swedish Wood: _Durability and resistance_ (Tabulky 12
  a 13, zdroj RISE; plný text stránky).
- **Dub v zemi – polní zkoušky:** polní zkoušky v půdě potvrdily trvanlivost podle EN 350 s výjimkou
  dubu (_Quercus robur_) a akátu – oba jsou v zemi **méně trvanlivé**, než uvádí norma; autoři
  navrhují uvádět třídu zvlášť pro použití v zemi a nad zemí. – Rapp, A. O. a kol. (2003): The
  natural durability of industrial important European wood species in different use classes.
  _Drvna industrija_ 54(3) (jen výtah ve vyhledávání – spoluautory jsem neověřil).
- **Sloupky z dubu v praxi:** sloupky z bílého dubu s velkým podílem jádra vydržely v zemi
  **10–15 let**, jinde po 15 letech ještě zdravé; trvanlivost dělá jádro, rychleji hnijí ve vlhké
  půdě. – fórum WOODWEB a Fine Woodworking, rozšiřující leták University of Minnesota (jen výtah
  ve vyhledávání – anekdoty, ne řízený pokus).
- **Proutěný plot (líska):** dobrá lísková „hurdle“ (pletený plotový díl) vydrží bez ošetření
  **zhruba 7–8 let**, s ošetřováním déle. – Coppice Products (výrobce, jen výtah ve vyhledávání);
  prodejce popisuje lískové díly 8 let venku bez nátěru (Gardenista, výtah).
- **Proutěná stavba na sloupech (pokus):** malý rekonstruovaný kruhový dům z Glastonbury v Butser
  Ancient Farm – štíhlé lískové sloupy a stěna z vrbového proutí – stál **12 let**, pak sloupy
  podlehly hnilobě a červotoči; nová stavba má dubové sloupy. – Butser Ancient Farm (2021): Glastonbury
  Roundhouse M59 – a new start (blog, plný text).
- **Proutěné stavby obecně:** dřevěné stavby s pletenými stěnami se rozpadají v řádu **desítek
  let**, rekonstruované kruhové domy stojí aspoň lidskou generaci (v Castell Henllys 35 let, pak
  nahrazen). – Mytum, H., Meek, J. (2020): Experimental archaeology and roundhouse excavated
  signatures: the investigation of two reconstructed Iron Age buildings at Castell Henllys, Wales.
  _Archaeological and Anthropological Sciences_ 12(3): 78, doi:10.1007/s12520-020-01028-y (jen
  abstrakt).
- **Došková střecha:** dlouhá sláma (long straw) vydrží **15–25 let**, česaná pšeničná 25–35,
  rákos 25–40; hřeben je nejslabší místo a chce obnovu po 10–15 letech; střecha bez údržby
  vydrží asi 20 let, rozpad je postupný od prvního dne. – thatching.net (2021): Lifespans of Thatch;
  EAMTA – Maintenance (jen výtahy ve vyhledávání).
- **Příkop a val – zarůstání:** pokusný val s příkopem na Overton Down (od 1960): na exponovaném
  křídovém kopci se vzhled příkopu **po zhruba deseti letech** přestane rychle měnit; u pokusného
  příkopu v Butseru je první ustálení hotové **do 7. roku** (mech a řasy na čerstvé křídě pomohly
  uchytit se semenům). – Wikipedia: Overton Down; Butser Ancient Farm, Monograph 4 (výtahy);
  souhrn Bell, M., Fowler, P. J., Hillson, S. W. (1996): _The Experimental Earthwork Project
  1960–1992._ CBA Research Report 100 (jen citace).

## Ověření čísel

| Číslo (návrh)               | Verdikt                | Proč                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modla padne za ≈ 20 let     | _sedí_                 | Malé dubové vzorky v zemi 5–15 let, sloupky 10–15+. **Vlastní úvaha:** kůl modly má Ø ≈ 0,5 m (`IDOL_R` 0,235 m v `sacred.py`) – hniloba jde od povrchu v úrovni země dovnitř a nosné jádro vydrží několikanásobně déle než lať 2 × 5 cm; 20 let je na horním okraji praxe sloupků, ale kůl je desetkrát silnější. Modla se nejdřív nakloní (shnilá pata), pak padne. |
| Svatyně se rozpadne za ≈ 30 | _sedí_                 | Ústřední modla svatyně je tatáž řezba ×1,55 (Ø ≈ 0,73 m) – silnější kůl než modla na návsi (**vlastní úvaha** stejně jako u modly). Ohniště vyhasnou hned, příkop a val zůstávají – rozpad svatyně = pád modly a zánik ohnišť.                                                                                                                                        |
| Plot hřbitova ≈ 15 let      | _upravit na ≈ 10_      | Pletený lískový plot bez ošetření 7–8 let, proutěná stavba na lískových sloupech 12 let. Plot hřbitova je proutí na kůlech v zemi; kůly vydrží déle než proutí, takže poslední pahýly stojí i po vypadání větví – **10 let** do úplného rozpadu.                                                                                                                      |
| Ohrada bez zvířat ≈ 10 let  | _sedí_                 | Pletený plot jako u hřbitova (7–8 let), přístřešek na sloupech s doškovou pultovou střechou – sláma bez údržby 15–20 let, hřeben (u pultové střechy přední okraj) selže první a pak zatéká do latí a krokví. 10 let pro celou ohradu (plot dřív, přístřešek kolem desátého roku).                                                                                     |
| Padlá modla leží ≈ 10 let   | _sedí (vlastní úvaha)_ | Dubový kmen na zemi hnije z kontaktu s vlhkou půdou a zarůstá trávou a mechem; přímý údaj pro ležící kmen Ø 0,5 m jsem nehledal – 10 let je doba, kdy ho tráva a kopřivy z herní kamery skryjí (jako zbytek jámy obydlí – `RUIN_YEARS`).                                                                                                                              |
| Příkop svatyně ≈ 10–20 let  | _20 let_               | Příkop se ustálí za 7–10 let (Overton Down, Butser), pak už se mění pomalu – archeologicky zůstává staletí. Ve hře zarůstá **20 let** (do 10 let se zasypává a zarůstá, druhou dekádu už jen mizí v trávě) a pak zmizí – kvůli přehlednosti krajiny, ne podle pramene.                                                                                                |

## Na co pozor

- Všechny prameny o trvanlivosti dřeva jsou z dnešní střední a severní Evropy (Švédsko, Německo,
  Anglie); vlhkost půdy dobu zkracuje (fórum WOODWEB, EAMTA), suchá písčitá půda prodlužuje.
- Čísla jsou „od opuštění do pádu“ – stavba, kterou lidé navštěvují, se opravuje a nechátrá
  (jako obydlí – population.md); proto chátrání začne až opuštěním a zastaví se, když se k ní
  lidé vrátí.
