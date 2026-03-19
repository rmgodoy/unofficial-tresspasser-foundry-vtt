/**
 * Data model for the Trespasser TTRPG Deed item type.
 */

const TARGET_TYPES = [
  "creature", "personal", "blast", "close_blast",
  "burst", "melee_burst", "path", "close_path", "aura"
];

export class TrespasserDeedData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    const phaseSchema = () => new fields.SchemaField({
      description: new fields.StringField({ initial: "" }),
      damage: new fields.StringField({ initial: "" }),
      appliedEffects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] }),
      appliesWeaponEffects: new fields.BooleanField({ initial: false })
    });

    return {
      tier: new fields.StringField({
        initial: "light",
        choices: ["light", "heavy", "mighty", "special"]
      }),
      actionType: new fields.StringField({
        initial: "attack",
        choices: ["attack", "support"]
      }),
      type: new fields.StringField({
        initial: "innate",
        choices: ["innate", "melee", "missile", "spell", "tool", "unarmed", "versatile"]
      }),
      target: new fields.StringField({ initial: "1 Creature" }),
      targetType: new fields.StringField({
        initial: "creature",
        choices: TARGET_TYPES
      }),
      targetCount: new fields.NumberField({ initial: 1, min: 1, integer: true }),
      targetSize: new fields.NumberField({ initial: null, min: 1, integer: true, nullable: true }),
      accuracyTest: new fields.StringField({ initial: "Guard" }),
      focusCost: new fields.NumberField({ initial: null, nullable: true }),
      focusIncrease: new fields.NumberField({ initial: null, nullable: true }),
      bonusCost: new fields.NumberField({ initial: null, nullable: true }),
      uses: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      effects: new fields.SchemaField({
        start: phaseSchema(),
        before: phaseSchema(),
        base: phaseSchema(),
        hit: phaseSchema(),
        spark: phaseSchema(),
        after: phaseSchema(),
        end: phaseSchema()
      })
    };
  }

  /* -------------------------------------------- */
  /* Migration                                     */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Parse legacy free-text target into structured fields
    if (source.target && !source.targetType) {
      const parsed = TrespasserDeedData.#parseTargetString(source.target);
      source.targetType  = parsed.targetType;
      source.targetCount = parsed.targetCount;
      source.targetSize  = parsed.targetSize;
    }
    return super.migrateData(source);
  }

  /**
   * Parse a legacy target string into structured target fields.
   * @param {string} str
   * @returns {{ targetType: string, targetCount: number, targetSize: number|null }}
   */
  static #parseTargetString(str) {
    const s = (str || "").trim();
    const defaults = { targetType: "creature", targetCount: 1, targetSize: null };

    if (!s) return defaults;

    // "Personal"
    if (/^personal$/i.test(s)) {
      return { targetType: "personal", targetCount: 1, targetSize: null };
    }

    // "Melee Burst"
    if (/^melee\s+burst$/i.test(s)) {
      return { targetType: "melee_burst", targetCount: 1, targetSize: null };
    }

    // "Close Blast X"
    const closeBlast = s.match(/^close\s+blast\s+(\d+)$/i);
    if (closeBlast) {
      return { targetType: "close_blast", targetCount: 1, targetSize: parseInt(closeBlast[1]) };
    }

    // "Close Path X"
    const closePath = s.match(/^close\s+path\s+(\d+)$/i);
    if (closePath) {
      return { targetType: "close_path", targetCount: 1, targetSize: parseInt(closePath[1]) };
    }

    // "Blast X"
    const blast = s.match(/^blast\s+(\d+)$/i);
    if (blast) {
      return { targetType: "blast", targetCount: 1, targetSize: parseInt(blast[1]) };
    }

    // "Burst X"
    const burst = s.match(/^burst\s+(\d+)$/i);
    if (burst) {
      return { targetType: "burst", targetCount: 1, targetSize: parseInt(burst[1]) };
    }

    // "Path X"
    const path = s.match(/^path\s+(\d+)$/i);
    if (path) {
      return { targetType: "path", targetCount: 1, targetSize: parseInt(path[1]) };
    }

    // "Aura X"
    const aura = s.match(/^aura\s+(\d+)$/i);
    if (aura) {
      return { targetType: "aura", targetCount: 1, targetSize: parseInt(aura[1]) };
    }

    // "N Creature(s)" or just "N"
    const creatures = s.match(/^(\d+)\s*creature/i);
    if (creatures) {
      return { targetType: "creature", targetCount: parseInt(creatures[1]), targetSize: null };
    }

    // Fallback
    return defaults;
  }

  /* -------------------------------------------- */
  /* Derived Data                                  */
  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    // Auto-generate the display label from structured fields
    this.target = TrespasserDeedData.computeTargetLabel(this.targetType, this.targetCount, this.targetSize);
  }

  /**
   * Build a human-readable target label from structured fields.
   * @param {string} targetType
   * @param {number} targetCount
   * @param {number|null} targetSize
   * @returns {string}
   */
  static computeTargetLabel(targetType, targetCount, targetSize) {
    switch (targetType) {
      case "personal":    return "Personal";
      case "blast":       return `Blast ${targetSize || 1}`;
      case "close_blast": return `Close Blast ${targetSize || 1}`;
      case "burst":       return `Burst ${targetSize || 1}`;
      case "melee_burst": return "Melee Burst";
      case "path":        return `Path ${targetSize || 1}`;
      case "close_path":  return `Close Path ${targetSize || 1}`;
      case "aura":        return `Aura ${targetSize || 1}`;
      case "creature":
      default:
        return targetCount === 1 ? "1 Creature" : `${targetCount} Creatures`;
    }
  }
}
