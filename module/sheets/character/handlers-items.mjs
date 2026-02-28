/**
 * Character Sheet — Item handlers
 * onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck
 */

export async function onItemCreate(event, sheet) {
  event.preventDefault();
  const type = event.currentTarget.dataset.type ?? "deed";

  const excludedTypes = ["deed", "feature", "talent", "effect", "state"];
  if (!excludedTypes.includes(type)) {
    const inventoryItems = sheet.actor.items.filter(i => !excludedTypes.includes(i.type) && !i.system.equipped);
    const maxSlots = sheet.actor.system.inventory_max ?? 5;
    if (inventoryItems.length >= maxSlots) {
      ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.InventoryCapReached"));
      return;
    }
  }

  const newLabel  = game.i18n.localize("TRESPASSER.General.New") || "New";
  const name      = `${newLabel} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const system    = {};
  if (event.currentTarget.dataset.tier) system.tier = event.currentTarget.dataset.tier;

  await foundry.documents.BaseItem.create({ name, type, system }, { parent: sheet.actor });
}

export async function onItemConsume(event, sheet) {
  event.preventDefault();
  const li   = event.currentTarget.closest("[data-item-id]");
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (!item) return;

  if (item.system.subType === "resource") return;

  if (!["bombs", "oils", "powders", "potions", "scrolls", "esoteric"].includes(item.system.subType)) return;

  let flavorHtml = `<div class="trespasser-chat-card phase-base">`;
  flavorHtml += `<h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">${game.i18n.format("TRESPASSER.Chat.UsedItem", { name: item.name })}</h3>`;

  if (item.system.description) {
    flavorHtml += `<div style="font-size:12px;font-style:italic;margin-bottom:8px;color:var(--trp-text-dim);">${item.system.description}</div>`;
  }

  if (item.system.effects?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;">`;
    flavorHtml += `<div style="font-size:11px;color:var(--trp-text-dim);text-transform:uppercase;margin-bottom:4px;">${game.i18n.localize("TRESPASSER.Combat.States")}</div>`;
    for (const eff of item.system.effects) {
      flavorHtml += `
        <div style="display:flex;align-items:center;background:rgba(0,0,0,0.5);border:1px solid var(--trp-gold-dim);border-radius:3px;padding:2px 4px;margin-bottom:2px;">
          <img src="${eff.img}" style="width:20px;height:20px;border:none;margin-right:6px;" />
          <span style="font-size:13px;font-family:var(--trp-font-primary);color:var(--trp-gold-light);flex:1;">${eff.name}</span>
          <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-name="${eff.name}" data-intensity="${eff.intensity || 1}" title="Apply to Targets" style="color:var(--trp-gold-bright);cursor:pointer;padding:0 4px;">
            <i class="fas fa-play"></i> ${game.i18n.localize("TRESPASSER.Chat.Apply")}
          </a>
        </div>`;
    }
    flavorHtml += `</div>`;
  }

  if (item.system.deeds?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;font-size:12px;"><strong>${game.i18n.localize("TRESPASSER.Chat.GrantsDeeds")}</strong> ${item.system.deeds.map(d => d.name).join(", ")}</div>`;
  }
  if (item.system.incantations?.length > 0) {
    flavorHtml += `<div style="margin-top:8px;font-size:12px;"><strong>${game.i18n.localize("TRESPASSER.Chat.GrantsIncantations")}</strong> ${item.system.incantations.map(d => d.name).join(", ")}</div>`;
  }

  flavorHtml += `</div>`;

  const dmg = item.system.damage;
  if (dmg && dmg.trim() !== "") {
    try {
      let expr = dmg.replace(/<sd>/gi, sheet.actor.system.skill_die || "d4");
      const roll = new foundry.dice.Roll(expr);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor: flavorHtml });
    } catch (e) {
      console.error(e);
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: flavorHtml });
    }
  } else {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: flavorHtml });
  }

  await item.delete();
}

export async function onDepletionRoll(event, sheet) {
  event.preventDefault();
  const li   = event.currentTarget.closest("[data-item-id]");
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (!item) return;
  await sheet._runDepletionCheck(item);
}

export async function runDepletionCheck(item, sheet) {
  const depletionDie = item.system.depletionDie || "d4";
  const roll = new foundry.dice.Roll(`1${depletionDie}`);
  await roll.evaluate();

  const isDepleted = roll.total <= 2;
  const flavor = isDepleted
    ? game.i18n.format("TRESPASSER.Chat.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(DEPLETED/FAILED!)" })
    : game.i18n.format("TRESPASSER.Chat.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(Safe)" });

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  if (isDepleted) {
    if (item.type === "rations" || (item.type === "weapon" && item.system.properties?.fragile)) {
      await item.delete();
      ui.notifications.warn(game.i18n.format("TRESPASSER.Chat.DestroyedConsumed", { name: item.name }));
    } else {
      await item.update({ "system.broken": true });
    }
  }

  return isDepleted;
}
