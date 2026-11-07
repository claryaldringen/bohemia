// Pásmo a místo vsi pro typy půdy a lesa – 300 seedů na typ (≈ 13 s na typ), vlastní soubor,
// ať běží souběžně s ostatními skupinami.
import { describeTypeBands, SOIL_FOREST_TYPES } from './type-band';

describeTypeBands(SOIL_FOREST_TYPES);
