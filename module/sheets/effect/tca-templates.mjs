/**
 * TCA Effect Templates
 * Pre-defined behavior templates for Simple Mode and Quick Creation.
 */

export const EFFECT_TEMPLATES = {
  passive_bonus: {
    key: "passive_bonus",
    label: "TRESPASSER.Sheet.Item.Effect.Template.PassiveBonus",
    icon: "fa-solid fa-shield-halved",
    description: "TRESPASSER.Sheet.Item.Effect.Template.PassiveBonusDesc",
    generate: (intensity = 0) => [{
      id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
      label: "Passive Bonus",
      trigger: "continuous",
      action: "modify_attribute",
      params: { attribute: "guard", modifier: "+<Int>", applyMode: "delta" },
      actionTarget: "self"
    }]
  },
  
  damage_over_time: {
    key: "damage_over_time",
    label: "TRESPASSER.Sheet.Item.Effect.Template.DamageOverTime",
    icon: "fa-solid fa-fire",
    description: "TRESPASSER.Sheet.Item.Effect.Template.DamageOverTimeDesc",
    generate: (intensity = 0) => [{
      id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
      label: "Damage over Time",
      trigger: "start-of-turn",
      action: "modify_attribute",
      params: { attribute: "health", modifier: "-<Int>", applyMode: "delta" },
      actionTarget: "self"
    }]
  },
  
  damage_reduction: {
    key: "damage_reduction",
    label: "TRESPASSER.Sheet.Item.Effect.Template.DamageReduction",
    icon: "fa-solid fa-shield",
    description: "TRESPASSER.Sheet.Item.Effect.Template.DamageReductionDesc",
    generate: (intensity = 0) => [{
      id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
      label: "Damage Reduction",
      trigger: "continuous",
      action: "modify_attribute",
      params: { attribute: "damage_received", modifier: "-<Int>", applyMode: "delta" },
      actionTarget: "self"
    }]
  },
  
  stance: {
    key: "stance",
    label: "TRESPASSER.Sheet.Item.Effect.Template.Stance",
    icon: "fa-solid fa-person-walking",
    description: "TRESPASSER.Sheet.Item.Effect.Template.StanceDesc",
    generate: (intensity = 0) => [
      {
        id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
        label: "Stance Bonus",
        trigger: "continuous",
        action: "modify_attribute",
        params: { attribute: "guard", modifier: "+<Int>", applyMode: "delta" },
        actionTarget: "self"
      },
      {
        id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
        label: "Remove Other Stances",
        trigger: "immediate",
        action: "remove_state",
        params: { stateTag: "stance", target: "self" },
        actionTarget: "self"
      }
    ],
    autoTags: ["stance"]
  },
  
  reactive_intercept: {
    key: "reactive_intercept",
    label: "TRESPASSER.Sheet.Item.Effect.Template.ReactiveIntercept",
    icon: "fa-solid fa-hand",
    description: "TRESPASSER.Sheet.Item.Effect.Template.ReactiveInterceptDesc",
    generate: (intensity = 0) => [{
      id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
      label: "Intercept Damage",
      trigger: "damage-received",
      action: "redirect_damage",
      params: { capacity: "<Int>", mode: "redirect" },
      scope: "ally",
      actionTarget: "self",
      requiresConfirmation: true
    }],
    autoScope: "ally"
  },
  
  custom: {
    key: "custom",
    label: "TRESPASSER.Sheet.Item.Effect.Template.Custom",
    icon: "fa-solid fa-wand-sparkles",
    description: "TRESPASSER.Sheet.Item.Effect.Template.CustomDesc",
    generate: () => []
  }
};

/**
 * Returns update object for applying a template to an effect item.
 * @param {string} templateKey
 * @param {object} [currentSystem={}]
 * @returns {object} Update delta
 */
export function applyTemplate(templateKey, currentSystem = {}) {
  const template = EFFECT_TEMPLATES[templateKey];
  if (!template) return {};

  const updates = {
    "system.behaviors": template.generate(currentSystem.intensity ?? 0)
  };

  if (template.autoTags && Array.isArray(template.autoTags)) {
    const existingTags = Array.isArray(currentSystem.tags) ? [...currentSystem.tags] : [];
    for (const tag of template.autoTags) {
      if (!existingTags.includes(tag)) existingTags.push(tag);
    }
    updates["system.tags"] = existingTags;
  }

  if (template.autoScope) {
    updates["system.scope"] = template.autoScope;
  }

  return updates;
}
