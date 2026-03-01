/**
 * Trespasser TTRPG — Foundry VTT System
 * Main entry point
 */

import { TrespasserCharacterData } from "./module/data/actor-character.mjs";
import { TrespasserCreatureData }  from "./module/data/actor-creature.mjs";
import { TrespasserHavenData }     from "./module/data/actor-haven.mjs";
import { TrespasserArmorData }     from "./module/data/item-armor.mjs";
import { TrespasserWeaponData }    from "./module/data/item-weapon.mjs";
import { TrespasserRationsData }   from "./module/data/item-rations.mjs";
import { TrespasserEffectData }    from "./module/data/item-effect.mjs";
import { TrespasserStateData }     from "./module/data/item-state.mjs";
import { TrespasserDeedData }      from "./module/data/item-deed.mjs";
import { TrespasserFeatureData }   from "./module/data/item-feature.mjs";
import { TrespasserTalentData }    from "./module/data/item-talent.mjs";
import { TrespasserIncantationData } from "./module/data/item-incantation.mjs";
import { TrespasserItemData }        from "./module/data/item-item.mjs";
import { TrespasserAccessoryData }   from "./module/data/item-accessory.mjs";
import { TrespasserInjuryData }      from "./module/data/item-injury.mjs";
import { TrespasserCallingData }    from "./module/data/item-calling.mjs";
import { TrespasserBuildData }      from "./module/data/item-build.mjs";
import { TrespasserHirelingData }   from "./module/data/item-hireling.mjs";
import { TrespasserStrongholdData } from "./module/data/item-stronghold.mjs";
import { TrespasserActor }         from "./module/documents/actor.mjs";
import { TrespasserCombat }        from "./module/documents/combat.mjs";
import { TrespasserEffectsHelper } from "./module/helpers/effects-helper.mjs";
import { TrespasserCharacterSheet } from "./module/sheets/actor-character-sheet.mjs";
import { TrespasserCreatureSheet }  from "./module/sheets/actor-creature-sheet.mjs";
import { TrespasserHavenSheet }     from "./module/sheets/actor-haven-sheet.mjs";
import { TrespasserArmorSheet }     from "./module/sheets/item-armor-sheet.mjs";
import { TrespasserWeaponSheet }    from "./module/sheets/item-weapon-sheet.mjs";
import { TrespasserRationsSheet }   from "./module/sheets/item-rations-sheet.mjs";
import { TrespasserEffectSheet }    from "./module/sheets/item-effect-sheet.mjs";
import { TrespasserStateSheet }     from "./module/sheets/item-state-sheet.mjs";
import { TrespasserDeedSheet }      from "./module/sheets/item-deed-sheet.mjs";
import { TrespasserFeatureSheet }   from "./module/sheets/item-feature-sheet.mjs";
import { TrespasserTalentSheet }    from "./module/sheets/item-talent-sheet.mjs";
import { TrespasserIncantationSheet } from "./module/sheets/item-incantation-sheet.mjs";
import { TrespasserItemSheet }        from "./module/sheets/item-item-sheet.mjs";
import { TrespasserAccessorySheet }   from "./module/sheets/item-accessory-sheet.mjs";
import { TrespasserInjurySheet }      from "./module/sheets/item-injury-sheet.mjs";
import { TrespasserCallingSheet }     from "./module/sheets/item-calling-sheet.mjs";
import { TrespasserCraftData }      from "./module/data/item-craft.mjs";
import { TrespasserCraftSheet }     from "./module/sheets/item-craft-sheet.mjs";
import { TrespasserPastLifeData }  from "./module/data/item-past-life.mjs";
import { TrespasserPastLifeSheet } from "./module/sheets/item-past-life-sheet.mjs";
import { TrespasserBuildSheet }     from "./module/sheets/item-build-sheet.mjs";
import { TrespasserHirelingSheet }  from "./module/sheets/item-hireling-sheet.mjs";
import { TrespasserStrongholdSheet }from "./module/sheets/item-stronghold-sheet.mjs";
import { ItemExporter }            from "./module/helpers/item-exporter.mjs";
import { TrespasserCombatTracker } from "./module/sheets/combat-tracker.mjs";

Hooks.once("init", async () => {
  console.log("Trespasser | Initialising system");

  // Load partial templates
  await foundry.applications.handlebars.loadTemplates([
    "systems/trespasser/templates/actor/parts/deed-list.hbs",
    "systems/trespasser/templates/actor/parts/combat-effects.hbs",
    "systems/trespasser/templates/item/parts/effect-chip.hbs",
    "systems/trespasser/templates/item/parts/effects-list.hbs",
    "systems/trespasser/templates/item/parts/deeds-list.hbs",
    "systems/trespasser/templates/combat/combat-tracker.hbs"
  ]);

  // Register custom document classes
  CONFIG.Actor.documentClass = TrespasserActor;
  CONFIG.Combat.documentClass = TrespasserCombat;
  CONFIG.ui.combat = TrespasserCombatTracker;

  CONFIG.TRESPASSER = {
    targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
    depletionDieOptions: {
      "": "TRESPASSER.Item.DepletionChoices.None",
      "d4": "TRESPASSER.Item.DepletionChoices.Crude",
      "d6": "TRESPASSER.Item.DepletionChoices.Normal",
      "d8": "TRESPASSER.Item.DepletionChoices.Fine",
      "d10": "TRESPASSER.Item.DepletionChoices.Excellent",
      "d12": "TRESPASSER.Item.DepletionChoices.Enchanted",
      "d20": "TRESPASSER.Item.DepletionChoices.Legendary"
    },
    actionTypeChoices: {
      "none": "TRESPASSER.Item.ActionTypeChoices.none",
      "action": "TRESPASSER.Item.ActionTypeChoices.action",
      "reaction": "TRESPASSER.Item.ActionTypeChoices.reaction"
    }
  };

  // Register data models
  CONFIG.Actor.dataModels.character = TrespasserCharacterData;
  CONFIG.Actor.dataModels.creature = TrespasserCreatureData;
  CONFIG.Actor.dataModels.haven = TrespasserHavenData;

  CONFIG.Item.dataModels.armor = TrespasserArmorData;
  CONFIG.Item.dataModels.weapon = TrespasserWeaponData;
  CONFIG.Item.dataModels.rations = TrespasserRationsData;
  CONFIG.Item.dataModels.effect = TrespasserEffectData;
  CONFIG.Item.dataModels.state = TrespasserStateData;
  CONFIG.Item.dataModels.deed = TrespasserDeedData;
  CONFIG.Item.dataModels.feature = TrespasserFeatureData;
  CONFIG.Item.dataModels.talent = TrespasserTalentData;
  CONFIG.Item.dataModels.incantation = TrespasserIncantationData;
  CONFIG.Item.dataModels.accessory = TrespasserAccessoryData;
  CONFIG.Item.dataModels.item = TrespasserItemData;
  CONFIG.Item.dataModels.injury = TrespasserInjuryData;
  CONFIG.Item.dataModels.calling = TrespasserCallingData;
  CONFIG.Item.dataModels.craft   = TrespasserCraftData;
  CONFIG.Item.dataModels.past_life = TrespasserPastLifeData;
  CONFIG.Item.dataModels.build = TrespasserBuildData;
  CONFIG.Item.dataModels.hireling = TrespasserHirelingData;
  CONFIG.Item.dataModels.stronghold = TrespasserStrongholdData;

  // Sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Trespasser Character Sheet",
  });
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserCreatureSheet, {
    types: ["creature"],
    makeDefault: true,
    label: "Trespasser Creature Sheet",
  });
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserHavenSheet, {
    types: ["haven"],
    makeDefault: true,
    label: "Trespasser Haven Sheet",
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserArmorSheet, {
    types: ["armor"],
    makeDefault: true,
    label: "Trespasser Armor Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserWeaponSheet, {
    types: ["weapon"],
    makeDefault: true,
    label: "Trespasser Weapon Sheet",
  });

  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserRationsSheet, {
    types: ["rations"],
    makeDefault: true,
    label: "Trespasser Rations Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserEffectSheet, {
    types: ["effect"],
    makeDefault: true,
    label: "Trespasser Effect Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserStateSheet, {
    types: ["state"],
    makeDefault: true,
    label: "Trespasser State Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserDeedSheet, {
    types: ["deed"],
    makeDefault: true,
    label: "Trespasser Deed Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserFeatureSheet, {
    types: ["feature"],
    makeDefault: true,
    label: "Trespasser Feature Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserTalentSheet, {
    types: ["talent"],
    makeDefault: true,
    label: "Trespasser Talent Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserIncantationSheet, {
    types: ["incantation"],
    makeDefault: true,
    label: "Trespasser Incantation Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserAccessorySheet, {
    types: ["accessory"],
    makeDefault: true,
    label: "Trespasser Accessory Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "Trespasser Item Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserInjurySheet, {
    types: ["injury"],
    makeDefault: true,
    label: "Trespasser Injury Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserCallingSheet, {
    types: ["calling"],
    makeDefault: true,
    label: "Trespasser Calling Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserCraftSheet, {
    types: ["craft"],
    makeDefault: true,
    label: "Trespasser Craft Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserPastLifeSheet, {
    types: ["past_life"],
    makeDefault: true,
    label: "Trespasser Past Life Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserBuildSheet, {
    types: ["build"],
    makeDefault: true,
    label: "Trespasser Build Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserHirelingSheet, {
    types: ["hireling"],
    makeDefault: true,
    label: "Trespasser Hireling Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserStrongholdSheet, {
    types: ["stronghold"],
    makeDefault: true,
    label: "Trespasser Stronghold Sheet",
  });

  // Handlebars helpers
  Handlebars.registerHelper("trespasserChecked", (value) => (value ? "checked" : ""));
  Handlebars.registerHelper("trespasserGt", (a, b) => a > b);
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
  Handlebars.registerHelper("ne", (a, b) => a !== b);
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));
  Handlebars.registerHelper("capitalize", (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  Handlebars.registerHelper("concat", (...args) => args.slice(0, -1).join(""));
  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key]);
  Handlebars.registerHelper("unless", Handlebars.helpers.unless);
  Handlebars.registerHelper("times", (n, block) => {
    let result = "";
    for (let i = 0; i < n; i++) result += block.fn(i);
    return result;
  });
  Handlebars.registerHelper("math", (lvalue, operator, rvalue) => {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);
    return {
      "+": lvalue + rvalue,
      "-": lvalue - rvalue,
      "*": lvalue * rvalue,
      "/": lvalue / rvalue,
      "%": lvalue % rvalue
    }[operator];
  });

  console.log("Trespasser | System ready");
  
  // Expose ItemExporter globally for convenience and debugging
  game.trespasser = game.trespasser || {};
  game.trespasser.ItemExporter = ItemExporter;
});

Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
  // Sync prototype token name for base actors if name changes
  if (updateData.name && !actor.isToken) {
    updateData.prototypeToken = updateData.prototypeToken || {};
    updateData.prototypeToken.name = updateData.name;
  }
});

// Hooks.on("updateActor", (actor, changed, options, userId) => {
//   if (game.user.id !== userId) return;

//   if (changed.name) {
//     if (actor.isToken) {
//       // Sync actual token document for unlinked tokens
//       if (actor.token && actor.token.name !== changed.name) {
//         actor.token.update({ name: changed.name });
//       }
//     } else {
//       // Sync all existing linked tokens on the active canvas
//       if (typeof canvas !== "undefined" && canvas.scene) {
//         const tokens = actor.getActiveTokens();
//         const updates = tokens.filter(t => t.name !== changed.name).map(t => ({ _id: t.id, name: changed.name }));
//         if (updates.length > 0) {
//           canvas.scene.updateEmbeddedDocuments("Token", updates);
//         }
//       }
//     }
//   }
// });

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // Determine color based on speaker instead of just author
  let borderColor = "#000000";
  const speaker = message.speaker;

  if (speaker.actor || speaker.token) {
    const actor = ChatMessage.getSpeakerActor(speaker);
    if (actor) {
      if (actor.type === "character") {
        // Use the owner's color for characters if possible
        const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
        if (owners.length > 0) borderColor = owners[0].color;
      }
    }
  }

  if (borderColor) {
    html.style.border = `2px solid ${borderColor}`;
    html.style.backgroundColor = "var(--trp-bg-dark)";
  }

  html.querySelectorAll(".apply-effect-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const uuid = btn.dataset.uuid;
      const itemIntensity = parseInt(btn.dataset.intensity);
      if (!uuid) return;

      const sourceItem = await fromUuid(uuid);
      if (!sourceItem) {
        ui.notifications.error("Original effect could not be found.");
        return;
      }
      
      const baseIntensity = !isNaN(itemIntensity) ? itemIntensity : (sourceItem.system.intensity || 0);

      const tokens = canvas.tokens.controlled;
      if (tokens.length === 0) {
        ui.notifications.warn("Please select at least one token to apply the effect to.");
        return;
      }

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const itemData = sourceItem.toObject();
        itemData.system.intensity = baseIntensity;
        delete itemData._id;
        
        await foundry.documents.BaseItem.create(itemData, { parent: actor });
        ui.notifications.info(`Applied ${sourceItem.name} to ${actor.name}.`);
      }
    });
  });

  // ── Apply Damage button ───────────────────────────────────────────────────
  html.querySelectorAll(".apply-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawDamage = parseInt(btn.dataset.damage);
      if (isNaN(rawDamage)) return;

      // Prefer controlled tokens; fall back to targeted tokens
      let tokens = canvas.tokens.controlled;
      if (tokens.length === 0) tokens = Array.from(game.user.targets);
      if (tokens.length === 0) {
        ui.notifications.warn("Select or target at least one token to apply damage to.");
        return;
      }

      // Identify attacker from message speaker
      const messageId = btn.closest(".message")?.dataset.messageId;
      const message = game.messages.get(messageId);
      const attackerSpeaker = message?.speaker;
      const attacker = attackerSpeaker?.actor ? game.actors.get(attackerSpeaker.actor) : null;

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        // Reduction from Damage Received effects on the target — rolled async for dice/token support
        const reduction = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_received");
        // reduction is stored as a negative modifier (e.g. -2 means take 2 less damage)
        // getAttributeBonus returns the sum, so subtract it from incoming damage
        const finalDamage = Math.max(0, rawDamage + reduction); // reduction is expected to be negative

        const newHP = Math.max(0, (actor.system.health ?? 0) - finalDamage);
        await actor.update({ "system.health": newHP });

        // Trigger damage-received effects
        await TrespasserEffectsHelper.triggerEffects(actor, "damage-received");

        // Trigger damage-dealt effects on the attacker
        if (attacker) {
          await TrespasserEffectsHelper.triggerEffects(attacker, "damage-dealt");
        }

        const msg = reduction !== 0
          ? `${actor.name} took <strong>${finalDamage}</strong> damage (${rawDamage} − ${Math.abs(reduction)} reduction).`
          : `${actor.name} took <strong>${finalDamage}</strong> damage.`;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${msg}</p></div>`
        });
      }
    });
  });

  // ── Heal Damage button ────────────────────────────────────────────────────
  html.querySelectorAll(".heal-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const healAmount = parseInt(btn.dataset.damage);
      if (isNaN(healAmount)) return;

      let tokens = canvas.tokens.controlled;
      if (tokens.length === 0) tokens = Array.from(game.user.targets);
      if (tokens.length === 0) {
        ui.notifications.warn("Select or target at least one token to heal.");
        return;
      }

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const newHP = Math.min(actor.system.max_health ?? actor.system.health, (actor.system.health ?? 0) + healAmount);
        await actor.update({ "system.health": newHP });

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${actor.name} was healed for <strong>${healAmount}</strong> HP.</p></div>`
        });
      }
    });
  });
});



Hooks.on("deleteCombat", async (combat) => {
  for (const c of combat.combatants) {
    if (c.actor) {
      await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-combat");
      
      // Remove combat-length effects
      const toRemove = c.actor.items.filter(i => 
        (i.type === "effect" || i.type === "state") && 
        i.system.duration === "combat"
      );
      for (const eff of toRemove) {
        await eff.delete();
      }
    }
  }
});

Hooks.on("updateToken", async (tokenDoc, changed, options, userId) => {
  if (game.user.id !== userId) return; // Only trigger for the user who moved the token
  
  // Sync token name back to actor name if it's unlinked
  if (changed.name && !tokenDoc.isLinked && tokenDoc.actor) {
    if (tokenDoc.actor.name !== changed.name) {
      await tokenDoc.actor.update({ name: changed.name });
    }
  }

  // Check if position actually changed
  if (changed.x === undefined && changed.y === undefined && changed.elevation === undefined) return;
  
  if (!game.combat || !game.combat.active || !game.combat.started) return;
  
  const combatant = game.combat.combatants.find(c => c.tokenId === tokenDoc.id);
  if (!combatant) return;
  
  // Only trigger on the combatant's own turn
  if (game.combat.combatant?.id !== combatant.id) return;
  
  // Only trigger once per turn
  if (combatant.getFlag("trespasser", "hasMovedThisTurn")) return;
  
  if (combatant.actor) {
    await combatant.setFlag("trespasser", "hasMovedThisTurn", true);
    await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-move");
  }
});

/**
 * Feature linked item application when an item is created.
 */
Hooks.on("createItem", async (item, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature") {
    const effects = item.system.effects || [];
    const deeds = item.system.deeds || [];
    if (effects.length > 0) await actor._applyLinkedItems(effects);
    if (deeds.length > 0) await actor._applyLinkedItems(deeds);
  } else if (item.type === "accessory" && item.system.equipped) {
    const sys = item.system;
    if (sys.talents?.length > 0)  await actor._applyLinkedItems(sys.talents);
    if (sys.features?.length > 0) await actor._applyLinkedItems(sys.features);
    if (sys.deeds?.length > 0)    await actor._applyLinkedItems(sys.deeds);
    if (sys.effects?.length > 0)  await actor._applyLinkedItems(sys.effects, { passiveOnly: true });
  } else if (item.type === "injury") {
    // Apply all passive effects listed on the injury — these cannot be prevailed against
    const effects = item.system.effects || [];
    if (effects.length > 0) {
      await actor._applyLinkedItems(effects, { passiveOnly: false, fromInjury: true, injuryId: item.id });
    }
  }
});

/**
 * Feature linked item removal when an item is deleted.
 */
Hooks.on("deleteItem", async (item, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature") {
    const effects = item.system.effects || [];
    const deeds = item.system.deeds || [];
    if (effects.length > 0) await actor._removeLinkedItems(effects, item.id);
    if (deeds.length > 0) await actor._removeLinkedItems(deeds, item.id);
  } else if (item.type === "accessory") {
    const sys = item.system;
    if (sys.talents?.length > 0)  await actor._removeLinkedItems(sys.talents, item.id);
    if (sys.features?.length > 0) await actor._removeLinkedItems(sys.features, item.id);
    if (sys.deeds?.length > 0)    await actor._removeLinkedItems(sys.deeds, item.id);
    if (sys.effects?.length > 0)  await actor._removeLinkedItems(sys.effects, item.id);
  } else if (item.type === "injury") {
    // Remove all effect/state items on this actor that were stamped with this injury's ID
    const toRemove = actor.items.filter(
      i => (i.type === "effect" || i.type === "state") &&
           i.flags?.trespasser?.injuryId === item.id
    );
    for (const eff of toRemove) {
      await eff.delete();
    }
  }
});

/**
 * Update linked items if the Feature's link arrays change.
 */
Hooks.on("updateItem", async (item, changed, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature" && ("system" in changed)) {
    if ("effects" in changed.system || "deeds" in changed.system) {
       const effects = item.system.effects || [];
       const deeds = item.system.deeds || [];
       if (effects.length > 0) await actor._applyLinkedItems(effects);
       if (deeds.length > 0) await actor._applyLinkedItems(deeds);
    }
  } else if (item.type === "accessory" && item.system.equipped && ("system" in changed)) {
    const sys = item.system;
    if ("talents" in changed.system)  await actor._applyLinkedItems(sys.talents || []);
    if ("features" in changed.system) await actor._applyLinkedItems(sys.features || []);
    if ("deeds" in changed.system)    await actor._applyLinkedItems(sys.deeds || []);
    if ("effects" in changed.system)  await actor._applyLinkedItems(sys.effects || [], { passiveOnly: true });
  } else if (item.type === "injury" && ("system" in changed) && "effects" in changed.system) {
    // Re-apply whenever the injury's effects list changes
    const effects = item.system.effects || [];
    if (effects.length > 0) {
      await actor._applyLinkedItems(effects, { passiveOnly: false, fromInjury: true, injuryId: item.id });
    }
  }
});

/**
 * Assign default icons to items based on type if they use the default foundry icon.
 */
Hooks.on("preCreateItem", (item, createData, options, userId) => {
  const actor = item.parent;
  if (actor && (item.type === "effect" || item.type === "state")) {
    const system = item.system;
    let intensityToApply = system.intensity || 0;

    // 1. Handle Counter States
    const counterStates = system.counterStates || [];
    let wasCountered = false;
    if (counterStates.length > 0) {
      const counterNames = new Set(counterStates.map(cs => cs.name));
      const existingCounters = actor.items.filter(i => 
        (i.type === "effect" || i.type === "state") && 
        counterNames.has(i.name)
      );

      for (const counter of existingCounters) {
        wasCountered = true;
        if (intensityToApply <= 0) break;
        const counterIntensity = counter.system.intensity || 0;
        
        if (counterIntensity > intensityToApply) {
          counter.update({ "system.intensity": counterIntensity - intensityToApply });
          intensityToApply = 0;
        } else {
          intensityToApply -= counterIntensity;
          counter.delete();
        }
      }
    }

    // 2. If intensity reduced to 0 by counters, cancel creation
    if (wasCountered && intensityToApply <= 0) return false;

    // 3. Handle Summing with existing effect of same name
    const existing = actor.items.find(i => i.type === item.type && i.name === item.name);
    if (existing) {
      const currentIntensity = existing.system.intensity || 0;
      existing.update({ "system.intensity": currentIntensity + intensityToApply });
      return false; // Cancel creation of the new item
    }

    // 4. Update the item being created with the final intensity (if modified by counters)
    if (intensityToApply !== system.intensity) {
      item.updateSource({ "system.intensity": intensityToApply });
    }
  }

  if (item.type === "injury") {
    item.updateSource({ img: "systems/trespasser/assets/icons/effects.png" });
  }
  if (item.img === "icons/svg/item-bag.svg") {
    let iconPath = "icons/svg/item-bag.svg";
    switch (item.type) {
      case "armor":
        iconPath = "systems/trespasser/assets/icons/armor_and_shields.png";
        break;
      case "weapon":
        iconPath = "systems/trespasser/assets/icons/weapons.png";
        break;
      case "accessory":
        iconPath = "systems/trespasser/assets/icons/accessories.png";
        break;
      case "rations":
        iconPath = "systems/trespasser/assets/icons/food.png";
        break;
      case "effect":
      case "state":
        iconPath = "systems/trespasser/assets/icons/effects.png";
        break;
      case "deed":
        iconPath = "systems/trespasser/assets/icons/deeds.png";
        break;
      case "incantation":
        iconPath = "systems/trespasser/assets/icons/incantations.png";
        break;
      case "feature":
        iconPath = "systems/trespasser/assets/icons/feature.png";
        break;
      case "talent":
        iconPath = "systems/trespasser/assets/icons/talents.png";
        break;
      case "calling":
        iconPath = "systems/trespasser/assets/icons/feature.png";
        break;
      case "craft":
        iconPath = "systems/trespasser/assets/icons/deeds.png";
        break;
      case "past_life":
        iconPath = "systems/trespasser/assets/icons/pesant.png";
        break;
      case "item":
        const subType = item.system.subType;
        if (subType === "tool") iconPath = "systems/trespasser/assets/icons/tool.png";
        else if (subType === "resource") iconPath = "systems/trespasser/assets/icons/resources.png";
        else if (subType === "light_source") iconPath = "systems/trespasser/assets/icons/ligth_sources.png";
        else if (subType === "bombs") iconPath = "systems/trespasser/assets/icons/bombs.png";
        else if (subType === "oils") iconPath = "systems/trespasser/assets/icons/oils.png";
        else if (subType === "powders") iconPath = "systems/trespasser/assets/icons/powders.png";
        else if (subType === "potions") iconPath = "systems/trespasser/assets/icons/potions.png";
        else if (subType === "scrolls") iconPath = "systems/trespasser/assets/icons/scrolls.png";
        else if (subType === "esoteric") iconPath = "systems/trespasser/assets/icons/esoteric.png";
        else if (subType === "artifacts") iconPath = "systems/trespasser/assets/icons/artifacts.png";
        else if (subType === "miscellaneous") iconPath = "systems/trespasser/assets/icons/misellaneous.png";
        else iconPath = "systems/trespasser/assets/icons/item.png";
        break;
    }
    item.updateSource({ img: iconPath });
  }
});

/**
 * Update placeholder icon when subType changes.
 */
Hooks.on("preUpdateItem", (item, changed, options, userId) => {
  if (changed.system?.subType && item.type === "item") {
    const isDefault = [
        "systems/trespasser/assets/icons/item.png",
        "systems/trespasser/assets/icons/tool.png",
        "systems/trespasser/assets/icons/resources.png",
        "systems/trespasser/assets/icons/ligth_sources.png",
        "systems/trespasser/assets/icons/bombs.png",
        "systems/trespasser/assets/icons/oils.png",
        "systems/trespasser/assets/icons/powders.png",
        "systems/trespasser/assets/icons/potions.png",
        "systems/trespasser/assets/icons/scrolls.png",
        "systems/trespasser/assets/icons/esoteric.png",
        "systems/trespasser/assets/icons/artifacts.png",
        "systems/trespasser/assets/icons/misellaneous.png",
        "icons/svg/item-bag.svg"
    ].includes(item.img);

    if (isDefault) {
        const subType = changed.system.subType;
        let iconPath = "systems/trespasser/assets/icons/item.png";
        if (subType === "tool") iconPath = "systems/trespasser/assets/icons/tool.png";
        else if (subType === "resource") iconPath = "systems/trespasser/assets/icons/resources.png";
        else if (subType === "light_source") iconPath = "systems/trespasser/assets/icons/ligth_sources.png";
        else if (subType === "bombs") iconPath = "systems/trespasser/assets/icons/bombs.png";
        else if (subType === "oils") iconPath = "systems/trespasser/assets/icons/oils.png";
        else if (subType === "powders") iconPath = "systems/trespasser/assets/icons/powders.png";
        else if (subType === "potions") iconPath = "systems/trespasser/assets/icons/potions.png";
        else if (subType === "scrolls") iconPath = "systems/trespasser/assets/icons/scrolls.png";
        else if (subType === "esoteric") iconPath = "systems/trespasser/assets/icons/esoteric.png";
        else if (subType === "artifacts") iconPath = "systems/trespasser/assets/icons/artifacts.png";
        else if (subType === "miscellaneous") iconPath = "systems/trespasser/assets/icons/misellaneous.png";
        
        changed.img = iconPath;
    }
  }
});

/**
 * Add export/import buttons to the items directory.
 */
Hooks.on("renderItemDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  // Handle both legacy jQuery and new V13 HTMLElement
  const $html = $(html);
  let header = $html.find(".header-actions");
  
  // Fallback for different structures or AppV2
  if (!header.length && app.element) {
    header = $(app.element).find(".header-actions");
  }

  if (!header.length) {
    // Some V13 themes or versions might use different classes
    header = $html.find(".directory-header .actions, header .actions, nav.header-actions");
  }

  if (!header.length) {
    console.warn("Trespasser | Could not find header actions container in ItemDirectory", $html);
    return;
  }

  // Create buttons only if they don't exist
  if ($html.find(".export-all-items").length) return;

  const exportBtn = $(`<button class="export-all-items"><i class="fas fa-file-export"></i> Export All</button>`);
  const importBtn = $(`<button class="import-all-items"><i class="fas fa-file-import"></i> Import All</button>`);

  exportBtn.on("click", (ev) => {
    ev.preventDefault();
    ItemExporter.exportAll();
  });

  importBtn.on("click", (ev) => {
    ev.preventDefault();
    ItemExporter.importData();
  });

  header.append(exportBtn);
  header.append(importBtn);
});


/**
 * Hook into the Combat Tracker render to inject the phased initiative UI.
 * This is needed because Foundry V13 CombatTracker (ApplicationV2) doesn't 
 * allow template override via defaultOptions.
 */
Hooks.on("renderCombatTracker", async (app, html, data) => {
  const combat = game.combat;
  if (!combat) return;

  const activePhase = combat.getFlag("trespasser", "activePhase");
  const combatInfo  = combat.getFlag("trespasser", "combatInfo") || {};

  const PHASES = [
    { id: 40, label: game.i18n.localize("TRESPASSER.Phase.Early"), css: "early", combatants: [] },
    { id: 30, label: game.i18n.localize("TRESPASSER.Phase.Enemy"), css: "enemy", combatants: [] },
    { id: 20, label: game.i18n.localize("TRESPASSER.Phase.Late"), css: "late", combatants: [] },
    { id: 10, label: game.i18n.localize("TRESPASSER.Phase.Critical"), css: "critical", combatants: [] },
    { id: 0,  label: game.i18n.localize("TRESPASSER.Phase.End"), css: "end", combatants: [] }
  ];

  for (const combatant of combat.combatants) {
    if (!combatant.visible && !game.user.isGM) continue;
    const phaseId = combatant.initiative ?? 0;
    const phase   = PHASES.find(p => p.id === phaseId);
    if (phase) {
      const ap      = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const focus   = combatant.actor?.system.combat?.focus ?? 0;
      phase.combatants.push({ combatant, ap, focus, activePhase });
    }
  }

  const activePhasesData = PHASES.filter(p => p.combatants.length > 0);

  // Build the HTML for the phased tracker
  function buildSquares(count, filled, cssClass) {
    return Array.from({ length: count }, (_, i) => {
      const isFilled = i < filled;
      return `<div class="${cssClass}-square${isFilled ? " filled" : ""}"></div>`;
    }).join("");
  }

  function buildPhaseHTML(phaseData) {
    const isActive = phaseData.id === activePhase;
    const nextBtn  = (isActive && game.user.isGM)
      ? `<button class="next-phase-btn trp-next-phase" title="${game.i18n.localize("TRESPASSER.Phase.Next")}">${game.i18n.localize("TRESPASSER.Phase.NextPhase")}</button>`
      : "";

    const combatantsHTML = phaseData.combatants.map(({ combatant, ap, focus }) => {
      const isFinished = ap <= 0 || combatant.isDefeated;
      const isActv     = phaseData.id === activePhase && !isFinished;
      const name       = combatant.token?.name ?? combatant.name;
      const img        = combatant.token?.texture?.src ?? combatant.img;
      const owner      = combatant.testUserPermission(game.user, "OWNER");
      const cls        = [isActv ? "active" : "", isFinished ? "finished" : ""].filter(Boolean).join(" ");

      return `
        <li class="combatant ${cls}" data-combatant-id="${combatant.id}">
          <div class="avatar-container">
            <img class="token-image" src="${img}" title="${name}"/>
          </div>
          <div class="combatant-info flexcol">
            <div class="token-name"><h4>${name}</h4></div>
            <div class="combatant-status flexrow">
              <i class="fas fa-eye-slash" title="Hidden"></i>
              <i class="fas fa-skull" title="Defeated"></i>
              <i class="fas fa-bullseye" title="Targeting"></i>
            </div>
          </div>
          <div class="stats-area flexcol">`
             + (focus > 0 ? `<span class="focus-number">${focus}</span>` : "")
            + `<div class="ap-display flexrow">
              <div class="ap-squares flexrow">${buildSquares(3, ap, "ap")}</div>
            </div>
          </div>
        </li>
      `.trim();
    }).join("");

    return `
      <li class="phase-group ${phaseData.css}${isActive ? " active" : ""}">
        <div class="phase-header flexrow">
          <div class="header-left flexrow">
            <h4>${phaseData.label}</h4>
          </div>
          ${nextBtn}
        </div>
        <ol class="combatants-list">
          ${combatantsHTML}
        </ol>
      </li>
    `.trim();
  }

  const footerHTML = `
    <footer class="combat-info-footer">
      <div class="info-row">
        <div class="left-info">
          <span class="peril-text">
            ${game.i18n.localize("TRESPASSER.Peril")}: ${combatInfo.perilTotal ?? 0}
            <span class="peril-label">(${combatInfo.perilLabel ?? "Low"})</span>
          </span>
          <span class="deeds-usage">${combatInfo.heavy ?? 0}H / ${combatInfo.mighty ?? 0}M</span>
        </div>
        <div class="right-info">
          <span class="panic-label">Panic: ${combatInfo.panicLevel ?? 0}</span>
          <span class="init-dc-label">Init DC: ${combatInfo.enemyMaxInit ?? "-"}</span>
        </div>
      </div>
    </footer>
  `.trim();

  // Get the root element - in V13 html may be the element itself
  const root = (html instanceof HTMLElement) ? html : (html[0] ?? html);
  
  // Try multiple selectors to find the combat log ol element
  const log = root.querySelector("#combat-log")
    ?? root.querySelector("ol.directory-list")
    ?? root.querySelector("ol");

  if (log) {
    log.innerHTML = activePhasesData.map(buildPhaseHTML).join("");
  } else {
    console.warn("Trespasser | Could not find combat log element to inject phases. Root:", root);
  }

  // Replace default navigation controls (|< < X > >|) with a single "Next Phase" button
  if (game.user.isGM) {   
    // Remove existing footer if present, then append new one
    root.querySelector(".combat-info-footer")?.remove();
    const section = root.closest("section") ?? root.querySelector("section") ?? root;
    const footerEl = document.createElement("div");
    footerEl.innerHTML = footerHTML;
    section.appendChild(footerEl.firstElementChild);
  }


  // Wire up event listeners using native DOM
  root.querySelectorAll(".trp-next-phase").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      game.combat?.nextPhase();
    });
  });

  root.querySelectorAll(".ap-square.filled").forEach(sq => {
    sq.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".combatant");
      const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
      if (!combatant || !combatant.testUserPermission(game.user, "OWNER")) return;

      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const newAP = Math.max(0, currentAP - 1);
      await combatant.setFlag("trespasser", "actionPoints", newAP);
    });
  });
});
