import { TrespasserEffectData } from "./item-effect.mjs";

/**
 * Data model for Trespasser State items. States are specialized Effects that default to Combat.
 */
export class TrespasserStateData extends TrespasserEffectData {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.isCombat.initial = true;
    return schema;
  }
}
