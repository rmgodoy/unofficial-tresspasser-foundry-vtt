import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { messageVisibility } from "../helpers/compat.mjs";

/**
 * Roll a skill check against one of the core attributes.
 * @param {Actor} actor
 * @param {string} attribute - "mighty" | "agility" | "intellect" | "spirit"
 * @returns {Promise<Roll>}
 */
export async function rollSkillCheck(actor, attribute) {
  const data = actor.system;
  const attrValue = data.attributes[attribute] ?? 0;
  const skillDie = data.skill_die || "d6";
  
  const bonus = TrespasserEffectsHelper.getAttributeBonus(actor, attribute, "use");
  const formula = `1${skillDie} + ${attrValue} + ${bonus}`;

  const roll = new foundry.dice.Roll(formula);
  const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`);
  
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${attrLabel} Check ${bonus !== 0 ? `(Bonus: ${bonus > 0 ? "+" : ""}${bonus})` : ""}`,
  });

  await TrespasserEffectsHelper.triggerEffects(actor, "use");

  return roll;
}

/**
 * Apply damage to this actor, updating system.health and handling options.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [options]
 * @returns {Promise<number>} New health value
 */
export async function applyDamage(actor, amount, options = {}) {
  const damageNum = Math.max(0, Number(amount) || 0);
  if (damageNum <= 0) return actor.system.health;

  const currentHealth = actor.system.health ?? actor.system.hp?.value ?? actor.system.hp ?? 0;
  const maxHealth = actor.system.max_health ?? actor.system.hp?.max ?? currentHealth;
  const rawHealth = currentHealth - damageNum;
  const newHealth = Math.clamp(rawHealth, 0, maxHealth);

  await actor.update({ "system.health": rawHealth }, options);

  return newHealth;
}

/**
 * Apply healing to this actor bounded by max_health.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [options]
 * @returns {Promise<number>} New health value
 */
export async function applyHealing(actor, amount, options = {}) {
  const healNum = Math.max(0, Number(amount) || 0);
  if (healNum <= 0) return actor.system.health;

  const currentHealth = actor.system.health ?? actor.system.hp?.value ?? actor.system.hp ?? 0;
  const maxHealth = actor.system.max_health ?? actor.system.hp?.max ?? currentHealth;
  const newHealth = Math.clamp(currentHealth + healNum, 0, maxHealth);

  await actor.update({ "system.health": newHealth });

  await TrespasserEffectsHelper.triggerEffects(actor, "heal-received");

  const sourceActor = options.sourceActor || (options.sourceActorId ? game.actors.get(options.sourceActorId) : null);
  if (sourceActor) {
    await TrespasserEffectsHelper.triggerEffects(sourceActor, "heal-given");
  }

  return newHealth;
}

/**
 * Called when this actor's turn ends.
 * Triggers 'end-of-turn' effects and grants Focus equal to Skill Bonus for characters.
 * @param {Actor} actor
 * @param {Combatant} [combatant]
 */
export async function onTurnEnd(actor, combatant = null) {
  if (!game.combat) return;

  if (actor.type === "character") {
    const usedExpensive = combatant ? combatant.getFlag("trespasser", "usedExpensiveDeed") : false;
    if (!usedExpensive) {
      const skillBonus = actor.system.skill || 0;
      if (skillBonus > 0) {
        const currentFocus = actor.system.combat?.focus ?? 0;
        const newFocus = currentFocus + skillBonus;
        if (newFocus > currentFocus) {
          await actor.update({ "system.combat.focus": newFocus });
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trespasser-chat-card"><p><strong>${actor.name}</strong> recovered <strong>${newFocus - currentFocus} Focus</strong> at end of turn.</p></div>`
          });
        }
      }
    }
  }
}

/**
 * Roll a Prevail check to remove a state.
 * @param {Actor} actor
 * @param {string} stateItemId
 * @param {number} extraAP
 * @param {object} [options]
 */
export async function rollPrevail(actor, stateItemId, extraAP = 0, { modifier = 0, cd = null } = {}) {
  const stateItem = actor.items.get(stateItemId);
  if (!stateItem) {
    ui.notifications.warn("State item not found.");
    return;
  }

  let intensity = stateItem.system.intensity || 0;
  if (!stateItem.system.isLasting) {
    const matchingLasting = actor.items.find(i => 
      i.type === "effect" && 
      i.system.isLasting && 
      i.name.toLowerCase() === stateItem.name.toLowerCase()
    );
    if (matchingLasting) {
      intensity += (matchingLasting.system.intensity || 0);
    }
  }
  const dc = cd !== null ? cd : Math.min(20, 10 + intensity);
  const prevailStat = actor.system.combat?.prevail || 0;
  const apBonus = extraAP * 2;
  const bonuses = `${prevailStat} + ${apBonus} + ${modifier}`;

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, "prevail");
  const formula = isAdv ? `2d20kh + ${bonuses}` : `1d20 + ${bonuses}`;

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const success = roll.total >= dc;
  
  let flavor = `<div class="trespasser-chat-card">
    <h3>${game.i18n.format("TRESPASSER.Chat.Check.PrevailCheck", { name: stateItem.name })}</h3>
    <p>${game.i18n.format("TRESPASSER.Chat.Check.PrevailVsDC", { total: roll.total, dc: dc })}</p>
    <div class="roll-details" style="font-size: var(--fs-10); color: var(--trp-text-dim); margin-bottom: 5px;">
      Formula: ${roll.formula} (d20: ${roll.dice[0].total})<br>
      Bonus: ${prevailStat} (Prevail) ${apBonus > 0 ? `+ ${apBonus} (AP)` : ""} ${modifier !== 0 ? `+ ${modifier} (Mod)` : ""}
    </div>
    <p class="${success ? 'hit-text' : 'miss-text'}" style="font-size: var(--fs-16); font-weight: bold; text-align: center;">
      ${success ? game.i18n.localize("TRESPASSER.Chat.Common.Success") : game.i18n.localize("TRESPASSER.Chat.Common.Failure")}
    </p>
  </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: flavor
  });

  if (success) {
    await stateItem.delete();
  }

  await TrespasserEffectsHelper.triggerEffects(actor, "on-prevail");

  return roll;
}

/**
 * Consume an item from the actor's inventory.
 * @param {Actor} actor
 * @param {string} itemId 
 * @param {object} [options]
 */
export async function onItemConsume(actor, itemId, { spendAP = true } = {}) {
  const item = actor.items.get(itemId);
  if (!item) return;

  if (item.system.subType === "resource") return;

  const consumableTypes = ["bombs", "oils", "powders", "potions", "scrolls", "esoteric"];
  if (!consumableTypes.includes(item.system.subType)) return;

  const isConcoction = ["potions", "bombs", "oils", "powders"].includes(item.system.subType);
  if (isConcoction && game.combat && spendAP) {
    const combatant = TrespasserCombat.getPhaseCombatant(actor);
    const activePhase = game.combat.getFlag("trespasser", "activePhase");
    if (combatant) {
      if (combatant.initiative !== activePhase && !game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotYourPhase"));
        return;
      }
      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
      if (restrictAPF && currentAP < 1) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
        return;
      }
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - 1));
      await TrespasserCombat.recordHUDAction(actor, "use-concoction");
    }
  }
  
  if (item.system.subType === "oils") {
    return TrespasserEffectsHelper.applyOilDialog(actor, item);
  }

  if (item.system.subType === "potions" && item.system.effects?.length > 0) {
    await actor._applyLinkedItems(item.system.effects);
  }

  let flavorHtml = `<div class="trespasser-chat-card phase-base">`;
  flavorHtml += `<h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">${game.i18n.format("TRESPASSER.Chat.Action.UsedItem", { name: item.name })}</h3>`;

  if (item.system.description) {
    flavorHtml += `<div style="font-size:var(--fs-12);font-style:italic;margin-bottom:8px;color:var(--trp-text-dim);">${item.system.description}</div>`;
  }

  if (item.system.effects?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;">`;
    flavorHtml += `<div style="font-size:var(--fs-11);color:var(--trp-text-dim);text-transform:uppercase;margin-bottom:4px;">${game.i18n.localize("TRESPASSER.Terms.ItemType.States")}</div>`;
    for (const eff of item.system.effects) {
      const isApplied = item.system.subType === "potions";
      flavorHtml += `
        <div style="display:flex;align-items:center;background:var(--trp-bg-overlay);border:1px solid var(--trp-gold-dim);border-radius:3px;padding:2px 4px;margin-bottom:2px;">
          <img src="${eff.img}" style="width:20px;height:20px;border:none;margin-right:6px;" />
          <span style="font-size:var(--fs-13);font-family:var(--trp-font-primary);color:var(--trp-gold-bright);flex:1;">${eff.name}</span>
          ${isApplied ? `
          <span style="font-size:var(--fs-11);color:var(--trp-text-dim);padding:0 4px;">
            <i class="fas fa-check"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.Applied")}
          </span>` : `
          <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-name="${eff.name}" data-intensity="${eff.intensity || 0}" title="Apply to Targets" style="color:var(--trp-gold-bright);cursor:pointer;padding:0 4px;">
            <i class="fas fa-play"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.Apply")}
          </a>`}
        </div>`;
    }
    flavorHtml += `</div>`;
  }

  if (item.system.deeds?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;font-size:var(--fs-12);"><strong>${game.i18n.localize("TRESPASSER.Chat.Common.GrantsDeeds")}</strong> ${item.system.deeds.map(d => d.name).join(", ")}</div>`;
  }
  if (item.system.incantations?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;font-size:var(--fs-12);"><strong>${game.i18n.localize("TRESPASSER.Chat.Common.GrantsIncantations")}</strong> ${item.system.incantations.map(d => d.name).join(", ")}</div>`;
  }

  flavorHtml += `</div>`;

  const dmg = item.system.damage;
  if (dmg && dmg.trim() !== "") {
    try {
      let expr = TrespasserEffectsHelper.replacePlaceholders(dmg, actor);
      const roll = new foundry.dice.Roll(expr);
      await roll.evaluate();
      const showCreatureRolls = game.settings.get("trespasser", "showCreatureDamageRolls");
      const visibility = messageVisibility((actor.type === "creature" && !showCreatureRolls) ? "gm" : "public");
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: flavorHtml }, visibility);
    } catch (e) {
      console.error(e);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: flavorHtml });
    }
  } else {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: flavorHtml });
  }

  await item.delete();
}
