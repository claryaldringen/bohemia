// Účinky prémiových krajin přes existující mechaniky (část rozdělených pravidel, rozcestník je
// rules.ts).

// premium-landscapes.md – Typy krajin, sloupec „Hned“ (čísla z plánu účinků, návrh Clauda; velikost
// výhody se doladí kalibrací – premium-landscapes.md, Kalibrace):
// - Bohatá železná ruda: kovář, který kope na rudišti typu, potřebuje 4 kg rudy na kg nástrojů
//   místo 8 (crafts.md – Uhlí a ruda kováře) – násobek rudy na kg houby `richOre`;
// - Dobrá keramická hlína: hrnčíř na hliništi typu potřebuje poloviční hlínu na kg keramiky –
//   tím i poloviční kopání a nošení (crafts.md – Hlína hrnčíře) – `fineClay`;
// - Teplé jižní svahy: čtverec sadu na prosluněném svahu typu dá o čtvrtinu víc jablek –
//   `southSlopeOrchard`;
// - Posvátná hora a posvátný pramen: posvátné místo vsi od založení – štěstí jako háj bez dubů
//   navíc (`sacredPlace` = GROVE.happiness), mezi háji a nejvýš do stropů posvátných míst
//   (happiness.md – Posvátná místa);
// - pramen a slanisko: do `springClearM` od místa nesmí pole, sad ani hřbitov (voda).
export const PREMIUM_EFFECTS = {
  richOre: 0.5,
  fineClay: 0.5,
  southSlopeOrchard: 1.25,
  sacredPlace: 10,
  springClearM: 6,
} as const;
