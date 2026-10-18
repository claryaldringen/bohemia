# Vyšlapané pěšiny

Stav: Martin schválil 18. 10. 2026 („Ano, takhle to zní dobře. Zkusme to a uvidíme, jak to bude
vypadat ve hře.“). Stromy podél cest přes pole – Martin 18. 10. 2026 (v Estonsku a Dánsku stál
statek uprostřed svých polí a cesta k němu vedla přes pole, obvykle lemovaná stromy) – mají od 18. 10. 2026 jen **pevné cesty** ([roads.md](roads.md)), pěšiny dne ne. **Pěšiny ovlivňují práci** – Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať
se chodí o něco lépe než tam, kde není.“). Síť počítá herní jádro
(`packages/game/src/domain/village/paths/` – `terrain.ts`, `network.ts`, `walking.ts`,
`village.ts`) stejně na serveru i v prohlížeči; scéna `apps/web/lib/scene/path-renderer.ts`,
`path-ribbon.ts`, `path-router.ts`. Pevné cesty a stromy u nich: [roads.md](roads.md).

## Proč

Ves má být vidět jako místo, kde se žije: kudy lidé denně chodí, tudy je tráva vyšlapaná.
A po vyšlapané pěšině se chodí lépe – cesta na vzdálené pole po ní stojí méně práce.

## Jak pěšiny vznikají

- **Pěšiny spojují místa, kam lidé chodí každý den:** od brány domu pro vodu k potoku, pro
  dřevo k okraji lesa, na pole, do sadu, ke hřbitovu, k posvátným dubům, hájům, modle a svatyni,
  k hromadě klád, na staveniště, k ohradě (krmení dobytka) a k sousedům; pasáci ženou stáda na
  úhor.
- **Kolik se kam chodí:** voda podle lidí v domácnosti, dřevo na domácnost (v zimní půlce roku
  víc), na pole, do sadu a na stavby podle dnešní práce (rozdělení práce dne z jádra, jeden
  člověkoden = jedna cesta) a k zavedeným místům trochu navíc, ať pěšina mezi pracemi nezaroste.
  Ke hřbitovu se chodí podle počtu lidí – hroby předků raní Slované navštěvovali pravidelně
  (obětiny, hostiny za mrtvé): 0,15 cesty za den na člověka, každá domácnost k nejbližšímu
  hřbitovu (Martin schválil, návrh Clauda; ves se 7 lidmi ≈ 1 cesta denně, se 40 lidmi ≈ 6).
  K zavedeným místům – posvátnému dubu, háji, modle, svatyni, hřbitovu a sadu – chodí každá
  domácnost jen k nejbližšímu místu daného druhu (Martin: lidé chodí jen k nejbližším věcem;
  nejbližší vzdušnou čarou od domu – návrh Clauda); práce dne (pole, stavby, kácení, práce
  v sadu) jde tam, kde se dnes pracuje – vylepšení pevné cesty a práce u jabloní podél ní
  ([roads.md](roads.md)) k polovině úseku.
  Daleko (voda, les) se chodí méně často – pěšina tam vznikne, až když se cesty víc domácností
  slijí. Ohrada (oxen.md) má k práci dne trochu navíc jako zavedené místo. Stáda (diet.md – ovce
  s kozami po 20 kusech, krávy po 6, jako ve scéně) se denně vyženou na úhor a zpět – jedna cesta
  na stádo: mladý úhor vždy, louka na seno až po seči (srpen–listopad); v zimě stojí krávy
  v ohradě, prasata jdou do lesa (návrh Clauda).
- **Kudy:** lidé obcházejí prudké svahy, vodu (kromě mělkých brodů), domy se zahrádkami,
  kmeny, keře, balvany a skály, plot ohrady a hřbitova, přes oseté pole nechodí (jdou po jeho
  okraji), přes úhor a louku ano, lesem neradi.
- **Slévání:** vyšlapaná pěšina je pohodlnější (až o polovinu), takže kdo jde po ní, jde i kus
  oklikou – trasy sousedů se slijí do společné pěšiny a vznikne síť. Po **pevné cestě**
  ([roads.md](roads.md)) se jde jako po plné pěšině, takže se k ní pěšiny dne stahují; kde vedou
  po ní, ztratí se v ní (kreslí se jen cesta).
- **Síla pěšiny** roste s počtem cest za den (pomalu – s odmocninou), jednotlivé cesty nic
  nevyšlapou. Silná pěšina je širší (do 1,9 m) a uprostřed holá udusaná hlína, slabší jen
  prošlapaná tráva s hlínou uprostřed.
- **Objevuje se a mizí:** spojení nového obydlí se vyšlapává dva roky, zrušené místo pěšinu
  ztratí (v prototypu hned). Práce se mění s rokem – pěšina na pole je v žních silnější.
- **Vidět jsou i v polích:** pěšina se kreslí nad poli – přes úhor a pastvinu jako prošlapaný
  pás; přes osetý díl pěšiny nevedou (obcházejí ho), kdyby přece, jen úzká stopa (Martin:
  stromy u cesty bez cesty mátly).
- **Roční období:** tráva v pěšinách usychá jako louka, v zimě je zasype sníh, ušlapaná stopa
  ve sněhu zřetelně prosvítá.
- **Stromy podél pěšin** už nejsou – rozmisťovaly se znovu s každou změnou sítě dne a přeskakovaly
  (rozbor 18. 10. 2026). Nahradily je **stromy u pevných cest** ([roads.md](roads.md)): herní
  data, která vyrostou z keře, stojí na místě a odumřou stářím.
- **Lidé chodí po pěšinách:** nosiči z pole, nosiči dřeva ke stavbě a ženy pro vodu a dřevo jdou
  na nejbližší pěšinu, po ní a z ní k cíli; kde pěšina nevede (nebo by byla velká oklika), jdou
  rovnou. Po pěšině jdou viditelně rychleji (a rychleji kráčí).

## Pěšiny a práce

Stav: Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať se chodí o něco lépe než tam, kde
není.“), čísla návrh Clauda.

- **Po vyšlapané pěšině se chodí o čtvrtinu rychleji** (podle síly pěšiny – plná pěšina 25 %,
  slabá úměrně méně; `PATH_WALK` v `rules.ts`). Po pevné cestě podle stupně, mokřina a brody –
  [roads.md](roads.md) – Rychlejší chůze.
- **Vzdálenost dílu pole pro práci** (fields.md – Vzdálenost) se měří chůzí z nejbližšího
  obydlí: rovně, nebo rovně k pěšině, po ní (úsek se počítá 0,75–1 × délka podle síly) a rovně
  od ní na díl – kratší z obou. Pěšina práci jen zlevní – nikdy víc než chůze rovně; chůze rovně
  ale počítá mokřinu a brody ([roads.md](roads.md)), takže díl za potokem může být dál než
  vzdušnou čarou. Stejně se měří čtverce sadu a palivo (obydlí → okraj lesa).
- **Kdy se přepočítá:** když se změní rozložení vsi – nové obydlí nebo staveniště, nová pole
  a díly, změna stadia dílu (osev, úhor), sady, hřbitovy, posvátná místa, kdo kde bydlí a stáří
  spojení (nová pěšina se vyšlapává dva roky). Simulace to kontroluje den po dni, výsledek tak
  nezávisí na tom, po jakých kouscích se ves dopočítá. Do sítě jde i práce posledního dne (kam
  ves chodí), ale kvůli ní samotné se nepřepočítává.
- **Uložení:** vzdálenost chůze každého dílu a čtverce sadu (`walkDistanceM`) a obydlí k okraji
  lesa (`forestWalkM`); vsi uložené dřív si je spočítají při prvním dopočítání s krajinou.
  Kalibrace (bez krajiny) počítá dál s přímou vzdáleností.
- Server i prohlížeč počítají stejnou funkcí – pěšiny ve scéně jsou tytéž, po kterých se
  počítá práce (v prohlížeči z dnešní práce dne, na serveru z rozložení při poslední změně).

## Zjednodušení a co chybí

- Síť si historii nepamatuje: síla je z práce posledního dne a stáří obydlí (u vsí bez stáří
  obydlí jako by stála odjakživa); opuštěná pěšina hned zmizí, nezarůstá postupně. Pamatují si ji
  až pevné cesty ([roads.md](roads.md)) – vznikají z celoročního provozu a zarůstají za 5 let.
- Ke hromadě klád se pěšina nekreslí (její místo zná jen scéna).
- Stáří pole server zatím neposílá – nově zakládané pole má pěšinu napoloviční.
- Brody jsou jen mělké úzké úseky potoka; lávku staví hráč na pevné cestě ([roads.md](roads.md)),
  mosty pro vozy nejsou.
- Pěšina sama nic neodstraní (keře a kameny na ní stojí dál – jen se jim vyhne).
