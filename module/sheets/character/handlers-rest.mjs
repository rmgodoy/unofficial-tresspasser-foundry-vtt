/**
 * Character Sheet — Rest handlers
 * handleRestAction, recoverItemCost
 * (Dialog itself lives in module/dialogs/rest-dialog.mjs)
 */

export async function handleRestAction(type, data, sheet) {
  const actor     = sheet.actor;
  const updates   = {};
  const chatMessages = [];

  // 1. Food handling (Moment & Night)
  if (type !== "week") {
    if (data.foodId) {
      const ration = actor.items.get(data.foodId);
      if (ration) {
        const depletionDie = ration.system.depletionDie || "d4";
        const roll = new foundry.dice.Roll(`1${depletionDie}`);
        await roll.evaluate();

        const isDepleted = roll.total <= 2;
        const status = isDepleted
          ? game.i18n.localize("TRESPASSER.Sheet.Rest.Depleted")
          : game.i18n.localize("TRESPASSER.Sheet.Rest.Safe");
        chatMessages.push(game.i18n.format("TRESPASSER.Sheet.Rest.AteRation", {
          name: actor.name, ration: ration.name, total: roll.total, status
        }));
        if (isDepleted) await ration.delete();
      }
    } else {
      updates["system.endurance"] = Math.max(0, actor.system.endurance - 1);
      chatMessages.push(game.i18n.localize("TRESPASSER.Sheet.Rest.DidNotEat").replace("{name}", actor.name));
    }
  }

  // 2. Type-specific logic
  if (type === "moment") {
    let rdToSpend  = data.rdSpend || 0;
    const currentRD = actor.system.recovery_dice || 0;

    if (rdToSpend > currentRD) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.SpendRDLimited", { spent: rdToSpend, current: currentRD }));
      rdToSpend = currentRD;
    }

    if (rdToSpend > 0) {
      const skillDieStr = actor.system.skill_die || "d6";
      const dieSize    = parseInt(skillDieStr.replace("d", "")) || 6;
      const recovery   = rdToSpend * dieSize;

      updates["system.health"]        = Math.min(actor.system.max_health, actor.system.health + recovery);
      updates["system.recovery_dice"] = currentRD - rdToSpend;
      chatMessages.push(game.i18n.format("TRESPASSER.Sheet.Rest.SpentRDRecovery", { count: rdToSpend, recovery }));
    }

    if (data.recover1) await recoverItemCost(data.recover1, chatMessages, actor);
    if (data.recover2) await recoverItemCost(data.recover2, chatMessages, actor);
  }
  else if (type === "night") {
    const postEndurance = (updates["system.endurance"] !== undefined) ? updates["system.endurance"] : actor.system.endurance;
    updates["system.health"]        = actor.system.max_health;
    updates["system.recovery_dice"] = postEndurance;
    chatMessages.push(game.i18n.format("TRESPASSER.Sheet.Rest.NightRestHP", { endurance: postEndurance }));

    const toReset = actor.items.filter(i => ["deed", "talent"].includes(i.type));
    for (const item of toReset) {
      if ((item.system.bonusCost || 0) > 0 || (item.system.uses || 0) > 0) {
        await item.update({ "system.bonusCost": 0, "system.uses": 0 });
      }
    }
    chatMessages.push(game.i18n.localize("TRESPASSER.Sheet.Rest.ResetCosts"));
  }
  else if (type === "week") {
    updates["system.endurance"]      = actor.system.max_endurance;
    updates["system.health"]         = actor.system.max_health;
    updates["system.recovery_dice"]  = actor.system.max_recovery_dice;
    chatMessages.push(game.i18n.localize("TRESPASSER.Sheet.Rest.WeekRestAll"));
  }

  // 3. Uncheck all broken items
  const brokenItems = actor.items.filter(i => i.system.broken);
  for (const item of brokenItems) await item.update({ "system.broken": false });

  // Reset snapshot flags
  const snapshot = foundry.utils.deepClone(actor.system.combat.equipment_snapshot || {});
  for (const key in snapshot) { if (snapshot[key].used) snapshot[key].used = false; }
  updates["system.combat.equipment_snapshot"] = snapshot;

  if (Object.keys(updates).length > 0) await actor.update(updates);

  if (chatMessages.length > 0) {
    await foundry.documents.BaseChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<h3>${game.i18n.format("TRESPASSER.Sheet.Rest.RestingTitle", { type: type.charAt(0).toUpperCase() + type.slice(1) })}</h3>` +
               chatMessages.map(m => `<p>${m}</p>`).join("")
    });
  }
}

export async function recoverItemCost(itemId, chatMessages, actor) {
  const item = actor.items.get(itemId);
  if (!item) return;

  const bonusCost = item.system.bonusCost || 0;
  const uses      = item.system.uses      || 0;

  let costIncrease = item.system.focusIncrease;
  if (costIncrease === null || costIncrease === undefined) {
    if (item.type === "deed") {
      const tier = item.system.tier;
      costIncrease = (tier === "heavy" || tier === "mighty") ? 1 : 0;
    } else {
      costIncrease = 0;
    }
  }

  if (bonusCost > 0 || uses > 0) {
    await item.update({
      "system.bonusCost": Math.max(0, bonusCost - costIncrease),
      "system.uses":      Math.max(0, uses - 1)
    });
    chatMessages.push(`Recovered 1 use and reduced cost of <strong>${item.name}</strong>.`);
  }
}

export async function spendRDAndRoll(count, sheet) {
  const actor   = sheet.actor;
  const skillDie = actor.system.skill_die || "d6";
  const formula  = `${count}${skillDie}`;
  const roll     = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const newHP = Math.min(actor.system.max_health, actor.system.health + roll.total);
  const newRD = Math.max(0, actor.system.recovery_dice - count);

  await actor.update({ "system.health": newHP, "system.recovery_dice": newRD });
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  game.i18n.format("TRESPASSER.Chat.SpendRD", { name: actor.name, count })
  });
}
